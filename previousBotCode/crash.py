"""Crash Game commands and views.
Players bet on a multiplier that increases over time until it "crashes".
The goal is to cash out before the crash to win the multiplier amount.
Features real-time visual updates and exciting gameplay!
"""

import discord
from discord import app_commands
from discord.ui import View, Button
from discord.ext import commands
from discord.ext.commands import Cog
from utils.common import game_registry, fmt, fmt_delta_colored, get_guild_id, _has_admin_role, _has_mod_role
from utils.common import AutoRefundGameView
from utils.firebase_database import db_manager, parse_amount

import asyncio
import secrets
import logging
import math
import time
from typing import Dict, List, Optional
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont

LOG = logging.getLogger("crash")

# Add uniform function from secrets module
if not hasattr(secrets, 'uniform'):
    import random
    secrets.uniform = random.uniform

# CRASH game configuration
CRASH_CONFIG = {
    'min_bet': 10.0,
    'max_bet': 100000.0,
    'update_interval': 0.5,  # Update every 500ms
    'max_multiplier': 50.0,  # Maximum possible multiplier
    'house_edge': 0.03  # 3% house edge (reduced from 4%)
}

class CrashGameState:
    """Manages the state of a crash game."""
    
    def __init__(self, channel_id: str, guild_id: str):
        self.channel_id = channel_id
        self.guild_id = guild_id
        self.players: Dict[str, Dict] = {}  # user_id -> {bet, username, cashed_out, cash_out_multiplier}
        self.game_active = False
        self.betting_phase = True
        self.current_multiplier = 1.00
        self.crash_point = 0.0
        self.start_time = 0.0
        self.game_duration = 0.0
        self.crashed = False
        self.game_message = None
    
    def add_player(self, user_id: str, username: str, bet_amount: float) -> bool:
        """Add a player to the game."""
        if not self.betting_phase or user_id in self.players:
            return False
        
        self.players[user_id] = {
            'bet': bet_amount,
            'username': username,
            'cashed_out': False,
            'cash_out_multiplier': 0.0,
            'winnings': 0.0
        }
        return True
    
    def cash_out_player(self, user_id: str) -> Optional[float]:
        """Cash out a player at current multiplier."""
        if user_id not in self.players or self.players[user_id]['cashed_out'] or self.crashed:
            return None
        
        player = self.players[user_id]
        player['cashed_out'] = True
        player['cash_out_multiplier'] = self.current_multiplier
        player['winnings'] = player['bet'] * self.current_multiplier
        
        return player['winnings']
    
    def generate_crash_point(self) -> float:
        """Generate crash point using house edge calculation with difficulty curve at 5x mark."""
        # More player-friendly distribution but with increased difficulty near 5x mark
        house_edge = CRASH_CONFIG['house_edge']
        
        # Use a weighted approach for better player experience
        rand = secrets.uniform(0, 1)
        
        if rand < 0.08:  # 8% chance of early crash (1.0x - 1.3x)
            crash_point = 1.0 + secrets.uniform(0, 0.3)
        elif rand < 0.25:  # 17% chance of low crash (1.3x - 2.5x)
            crash_point = 1.3 + secrets.uniform(0, 1.2)
        elif rand < 0.55:  # 30% chance of medium crash (2.5x - 4.8x) - increased chance to stop before 5x
            crash_point = 2.5 + secrets.uniform(0, 2.3)
        elif rand < 0.70:  # 15% chance of 5x difficulty zone (4.8x - 5.5x) - much harder to pass
            # This is the difficulty spike around 5x mark
            crash_point = 4.8 + secrets.uniform(0, 0.7)
            # Add extra difficulty modifier for getting past 5x
            if crash_point > 4.95:
                # Only 30% chance to actually make it past 5x once you're in this zone
                if secrets.uniform(0, 1) > 0.30:
                    crash_point = 4.8 + secrets.uniform(0, 0.2)  # Force crash before 5x
        elif rand < 0.85:  # 15% chance of high crash (5.5x - 12.0x) - reduced from 25%
            crash_point = 5.5 + secrets.uniform(0, 6.5)
        elif rand < 0.95:  # 10% chance of very high crash (12.0x - 25.0x) - reduced from 17%
            crash_point = 12.0 + secrets.uniform(0, 13.0)
        else:  # 5% chance of extreme crash (25.0x - 50.0x) - reduced from 8%
            crash_point = 25.0 + secrets.uniform(0, 25.0)
        
        # Apply house edge with extra penalty near 5x mark
        if 4.5 <= crash_point <= 5.5:
            # Extra difficulty for the 5x zone
            crash_point *= (1.0 - house_edge * 1.5)  # Increase house edge by 50% in this zone
        else:
            crash_point *= (1.0 - house_edge * 0.75)  # Reduce house edge by 25% elsewhere
        
        # Cap at maximum multiplier
        return min(max(crash_point, 1.01), CRASH_CONFIG['max_multiplier'])
    
    def calculate_multiplier(self) -> float:
        """Calculate current multiplier based on elapsed time."""
        if not self.game_active or self.betting_phase:
            return 1.00
        
        elapsed = time.time() - self.start_time
        
        # Exponential growth that gets faster over time
        # Starts slow, accelerates quickly
        multiplier = 1.0 + (elapsed * 0.5) + (elapsed ** 1.5 * 0.1)
        
        return min(multiplier, self.crash_point + 0.1)  # Don't exceed crash point
    
    def should_crash(self) -> bool:
        """Check if the game should crash now."""
        return self.current_multiplier >= self.crash_point

# Global crash game manager
class CrashGameManager:
    """Manages multiple crash games across channels."""
    
    def __init__(self):
        self.games: Dict[str, CrashGameState] = {}
    
    def get_or_create_game(self, channel_id: str, guild_id: str) -> CrashGameState:
        """Get existing game or create new one."""
        # Only create new game if no game exists or current game is completely finished
        if channel_id not in self.games or (not self.games[channel_id].betting_phase and not self.games[channel_id].game_active):
            self.games[channel_id] = CrashGameState(channel_id, guild_id)
        return self.games[channel_id]
    
    def remove_game(self, channel_id: str):
        """Remove a game."""
        if channel_id in self.games:
            del self.games[channel_id]
    
    def force_remove_game(self, channel_id: str) -> bool:
        """Force remove a game (for admin use)."""
        if channel_id in self.games:
            game = self.games[channel_id]
            # Refund all players who haven't cashed out
            for player in game.players.values():
                if not player['cashed_out']:
                    asyncio.create_task(db_manager.adjust_wallet(player['user_id'], game.guild_id, player['bet']))
            del self.games[channel_id]
            return True
        return False

# Global game manager
crash_manager = CrashGameManager()

class CrashBettingView(View):
    """View for betting phase of crash game."""
    
    def __init__(self, game: CrashGameState):
        super().__init__(timeout=30)
        self.game = game
    
    @discord.ui.button(label="Place Bet", style=discord.ButtonStyle.green, emoji="💰")
    async def place_bet(self, interaction: discord.Interaction, button: Button):
        """Open bet amount modal."""
        try:
            modal = CrashBetModal(self.game)
            await interaction.response.send_modal(modal)
        except discord.errors.InteractionResponded:
            await interaction.followup.send("Already processing your request!", ephemeral=True)
        except Exception as e:
            LOG.error(f"Error opening bet modal: {e}")
            await interaction.response.send_message("❌ Failed to open bet modal. Please try again.", ephemeral=True)
    
    @discord.ui.button(label="Start Game", style=discord.ButtonStyle.primary, emoji="🚀")
    async def start_game(self, interaction: discord.Interaction, button: Button):
        """Start the crash game."""
        try:
            if len(self.game.players) == 0:
                await interaction.response.send_message(
                    "❌ **No players have placed bets yet!**\n"
                    "💡 Click 'Place Bet' first to join the game!", 
                    ephemeral=True
                )
                return
            
            # Check if game is already starting/started
            if not self.game.betting_phase:
                await interaction.response.send_message(
                    "❌ **Game is already starting!**\n"
                    "⏰ Please wait for the current round to finish.", 
                    ephemeral=True
                )
                return
            
            # Start the game
            self.game.betting_phase = False
            self.game.game_active = True
            self.game.start_time = time.time()
            self.game.crash_point = self.game.generate_crash_point()
            self.game.crashed = False
            
            # Switch to game view
            game_view = CrashGameView(self.game)
            embed = game_view.create_game_embed()
            embed.add_field(
                name="🚀 Game Started!",
                value=f"Crash point set! Good luck to all {len(self.game.players)} players!",
                inline=False
            )
            
            await interaction.response.edit_message(embed=embed, view=game_view)
            
            # Start game loop
            await game_view.run_game_loop(interaction)
        except discord.errors.InteractionResponded:
            await interaction.followup.send("Game is already starting!", ephemeral=True)
        except Exception as e:
            LOG.error(f"Error starting crash game: {e}")
            try:
                await interaction.response.send_message("❌ Failed to start game. Please try again.", ephemeral=True)
            except:
                await interaction.followup.send("❌ Failed to start game. Please try again.", ephemeral=True)

class CrashBetModal(discord.ui.Modal):
    """Modal for entering bet amount."""
    
    def __init__(self, game: CrashGameState):
        super().__init__(title="Place Your Crash Bet")
        self.game = game
    
    bet_amount = discord.ui.TextInput(
        label="Bet Amount",
        placeholder="Enter amount (e.g., 100, 1k, A for all)",
        required=True,
        max_length=20
    )
    
    async def on_submit(self, interaction: discord.Interaction):
        user_id = str(interaction.user.id)
        guild_id = await get_guild_id(interaction)
        
        # Check if game is still in betting phase
        if not self.game.betting_phase:
            await interaction.response.send_message(
                "❌ **Betting phase has ended!**\n"
                "⏰ The game has already started. Wait for the next round!", 
                ephemeral=True
            )
            return
        
        # Check if already bet
        if user_id in self.game.players:
            await interaction.response.send_message(
                "❌ **You've already placed a bet this round!**\n"
                "🎯 Wait for the game to start or the next round to place another bet.", 
                ephemeral=True
            )
            return
        
        # Parse bet amount
        try:
            wallet, bank = await db_manager.get_balances(user_id, guild_id)
            bet_amount = parse_amount(self.bet_amount.value, wallet)
            
            if bet_amount < CRASH_CONFIG['min_bet']:
                await interaction.response.send_message(f"❌ Minimum bet is {fmt(CRASH_CONFIG['min_bet'])}!", ephemeral=True)
                return
            
            if bet_amount > CRASH_CONFIG['max_bet']:
                await interaction.response.send_message(f"❌ Maximum bet is {fmt(CRASH_CONFIG['max_bet'])}!", ephemeral=True)
                return
            
            if bet_amount > wallet:
                await interaction.response.send_message(f"❌ You only have {fmt(wallet)} in your wallet!", ephemeral=True)
                return
            
        except Exception as e:
            await interaction.response.send_message("❌ Invalid bet amount!", ephemeral=True)
            return
        
        # Deduct bet from wallet
        success, new_balance = await db_manager.adjust_wallet(user_id, guild_id, -bet_amount)
        if not success:
            await interaction.response.send_message("❌ Failed to place bet!", ephemeral=True)
            return
        
        # Add player to game
        self.game.add_player(user_id, interaction.user.display_name, bet_amount)
        
        await interaction.response.send_message(f"✅ Bet placed: {fmt(bet_amount)}! Wait for the game to start.", ephemeral=True)
        
        # Update the main betting panel so everyone sees new bets
        try:
            embed = create_betting_embed(self.game)
            if getattr(self.game, 'game_message', None):
                await self.game.game_message.edit(embed=embed, view=CrashBettingView(self.game))
            else:
                # Fallback to editing the original response if tracked message missing
                await interaction.edit_original_response(embed=embed)
        except Exception as e:
            LOG.error(f"Failed to update crash betting panel: {e}")

class CrashGameView(View):
    """Main crash game interface."""
    
    def __init__(self, game: CrashGameState):
        super().__init__(timeout=60)
        self.game = game
    
    @discord.ui.button(label="Cash Out", style=discord.ButtonStyle.danger, emoji="💸")
    async def cash_out(self, interaction: discord.Interaction, button: Button):
        """Cash out at current multiplier."""
        try:
            user_id = str(interaction.user.id)
            guild_id = await get_guild_id(interaction)
            
            if user_id not in self.game.players:
                await interaction.response.send_message("❌ You're not in this game!", ephemeral=True)
                return
            
            if self.game.players[user_id]['cashed_out']:
                await interaction.response.send_message("❌ You've already cashed out!", ephemeral=True)
                return
            
            if self.game.crashed:
                await interaction.response.send_message("❌ Game already crashed!", ephemeral=True)
                return
            
            # Cash out player
            winnings = self.game.cash_out_player(user_id)
            if winnings is None:
                await interaction.response.send_message("❌ Cannot cash out now!", ephemeral=True)
                return
            
            # Add winnings to wallet
            await db_manager.adjust_wallet(user_id, guild_id, winnings)
            
            # Record game stats
            await db_manager.record_game_result(user_id, guild_id, "crash", True, 
                                              self.game.players[user_id]['bet'], winnings)
            
            multiplier = self.game.players[user_id]['cash_out_multiplier']
            await interaction.response.send_message(
                f"✅ Cashed out at **{multiplier:.2f}x** for {fmt(winnings)}!", 
                ephemeral=True
            )
        except discord.errors.InteractionResponded:
            await interaction.followup.send("Already processing your cash out!", ephemeral=True)
        except Exception as e:
            LOG.error(f"Error cashing out: {e}")
            try:
                await interaction.response.send_message("❌ Failed to cash out. Please try again.", ephemeral=True)
            except:
                await interaction.followup.send("❌ Failed to cash out. Please try again.", ephemeral=True)
    
    async def run_game_loop(self, interaction: discord.Interaction):
        """Run the main game loop with real-time updates."""
        try:
            while self.game.game_active and not self.game.crashed:
                # Update multiplier
                self.game.current_multiplier = self.game.calculate_multiplier()
                
                # Check if should crash
                if self.game.should_crash():
                    await self.crash_game(interaction)
                    break
                
                # Update display
                embed = self.create_game_embed()
                try:
                    await interaction.edit_original_response(embed=embed, view=self)
                except:
                    pass  # Message might be deleted
                
                # Wait for next update
                await asyncio.sleep(CRASH_CONFIG['update_interval'])
            
        except Exception as e:
            LOG.error(f"Error in crash game loop: {e}")
    
    async def crash_game(self, interaction: discord.Interaction):
        """End the game with crash."""
        self.game.crashed = True
        self.game.game_active = False
        
        # Process all players who didn't cash out
        for user_id, player in self.game.players.items():
            if not player['cashed_out']:
                # They lost their bet
                await db_manager.record_game_result(
                    user_id, self.game.guild_id, "crash", False, 
                    player['bet'], -player['bet']
                )
        
        # Final update
        embed = self.create_crash_embed()
        await interaction.edit_original_response(embed=embed, view=None)
    
    def create_game_embed(self) -> discord.Embed:
        """Create game embed with current state."""
        # Color changes based on multiplier level
        if self.game.current_multiplier < 2.0:
            color = discord.Color.green()
        elif self.game.current_multiplier < 5.0:
            color = discord.Color.yellow()
        elif self.game.current_multiplier < 10.0:
            color = discord.Color.orange()
        else:
            color = discord.Color.red()
        
        embed = discord.Embed(
            title="🚀 CRASH GAME",
            description=f"# **{self.game.current_multiplier:.2f}x**",
            color=color
        )
        
        # Clean visual graph
        graph = self.create_clean_graph()
        embed.add_field(
            name="📊 Live Chart",
            value=graph,
            inline=False
        )
        
        # Split players into active and cashed out for cleaner display
        active_players = []
        cashed_players = []
        
        for user_id, player in self.game.players.items():
            if player['cashed_out']:
                cashed_players.append(f"💰 **{player['username']}** → {player['cash_out_multiplier']:.2f}x")
            else:
                potential = player['bet'] * self.game.current_multiplier
                active_players.append(f"🎯 **{player['username']}** → {fmt(potential)}")
        
        # Show active players first
        if active_players:
            embed.add_field(
                name=f"🔥 Still Playing ({len(active_players)})",
                value="\n".join(active_players[:6]),  # Limit display
                inline=True
            )
        
        # Show cashed out players
        if cashed_players:
            embed.add_field(
                name=f"✅ Cashed Out ({len(cashed_players)})",
                value="\n".join(cashed_players[:6]),  # Limit display
                inline=True
            )
        
        # Add some excitement based on multiplier
        if self.game.current_multiplier >= 10.0:
            embed.set_footer(text="🔥 HIGH MULTIPLIER! Cash out soon? 🔥")
        elif self.game.current_multiplier >= 5.0:
            embed.set_footer(text="⚡ Getting risky! When will you cash out? ⚡")
        else:
            embed.set_footer(text="💡 Click 'Cash Out' to secure your winnings!")
        
        return embed
    
    def create_crash_embed(self) -> discord.Embed:
        """Create final crash results embed."""
        embed = discord.Embed(
            title="💥 CRASHED!",
            description=f"# Game crashed at **{self.game.crash_point:.2f}x**",
            color=discord.Color.dark_red()
        )
        
        # Calculate totals
        total_winnings = 0
        total_lost = 0
        winners = []
        losers = []
        
        for user_id, player in self.game.players.items():
            if player['cashed_out']:
                winners.append(f"🎉 **{player['username']}** cashed at **{player['cash_out_multiplier']:.2f}x** → **+{fmt(player['winnings'])}**")
                total_winnings += player['winnings']
            else:
                losers.append(f"💸 **{player['username']}** → **-{fmt(player['bet'])}**")
                total_lost += player['bet']
        
        # Summary stats
        embed.add_field(
            name="📊 Round Summary",
            value=f"💰 **Total Won:** {fmt(total_winnings)}\n💸 **Total Lost:** {fmt(total_lost)}\n👥 **Players:** {len(self.game.players)}",
            inline=False
        )
        
        # Winners section (more prominent)
        if winners:
            embed.add_field(
                name="🏆 WINNERS! 🏆",
                value="\n".join(winners),
                inline=False
            )
        
        # Losers section (less prominent)  
        if losers:
            embed.add_field(
                name="😭 Didn't Cash Out",
                value="\n".join(losers),
                inline=False
            )
        
        embed.set_footer(text="🚀 Ready for another round? Use /crash to play again!")
        return embed
    
    def create_multiplier_graph(self) -> str:
        """Create ASCII art graph of multiplier."""
        if not self.game.game_active:
            return "Game not started"
        
        # Simple ASCII graph
        multiplier = self.game.current_multiplier
        max_width = 40
        height = 8
        
        # Calculate graph points
        points = []
        for i in range(max_width):
            # Simulate exponential growth
            x = i / max_width
            y = 1.0 + (x * (multiplier - 1.0))
            points.append(y)
        
        # Create graph
        lines = []
        max_mult = max(points) if points else multiplier
        
        # Ensure max_mult is at least slightly above 1.0 to avoid division by zero
        if max_mult <= 1.0:
            max_mult = 1.1
        
        for row in range(height):
            line = ""
            threshold = max_mult * (1 - row / height)
            
            for point in points:
                if point >= threshold:
                    line += "█"
                else:
                    line += " "
            
            # Add y-axis labels
            label = f"{threshold:.1f}x"
            line = f"{label:>5s}|{line}"
            lines.append(line)
        
        # Add current position indicator (with safety check)
        if max_mult > 1.0:
            current_pos = int((max_width - 1) * min(1.0, (multiplier - 1.0) / (max_mult - 1.0)))
            current_pos = max(0, min(current_pos, max_width - 1))  # Clamp to valid range
            
            if 0 <= current_pos < len(lines[0]) - 6:  # Make sure we don't go out of bounds
                # Add indicator at current position
                line_to_modify = lines[0]
                if 6 + current_pos + 1 < len(line_to_modify):
                    lines[0] = line_to_modify[:6 + current_pos] + "🚀" + line_to_modify[6 + current_pos + 1:]
        
        return "\n".join(lines)
    
    def create_clean_graph(self) -> str:
        """Create a cleaner, more readable multiplier display."""
        multiplier = self.game.current_multiplier
        
        # Create a simple progress bar style display
        max_display = max(10.0, multiplier * 1.2)  # Show a bit beyond current multiplier
        bar_length = 30
        
        # Calculate progress
        progress = min(1.0, multiplier / max_display)
        filled_length = int(bar_length * progress)
        
        # Create the bar
        bar = "█" * filled_length + "░" * (bar_length - filled_length)
        
        # Add multiplier markers
        markers = []
        key_multipliers = [1.0, 2.0, 5.0, 10.0, 20.0, 50.0]
        
        for mult in key_multipliers:
            if mult <= max_display:
                pos = int((mult / max_display) * bar_length)
                if pos < bar_length:
                    marker_pos = pos
                    markers.append((marker_pos, f"{mult:.0f}x"))
        
        # Build the display
        result = f"```\n🚀 {multiplier:.2f}x\n"
        result += f"┌{'─' * bar_length}┐\n"
        result += f"│{bar}│\n"
        result += f"└{'─' * bar_length}┘\n"
        
        # Add scale markers
        scale_line = ""
        for i in range(bar_length + 1):
            found_marker = False
            for marker_pos, marker_text in markers:
                if abs(i - marker_pos) <= 1:
                    if i == 0:
                        scale_line += marker_text[0]
                    elif i == bar_length:
                        scale_line += marker_text[-1]
                    else:
                        scale_line += "|"
                    found_marker = True
                    break
            if not found_marker:
                scale_line += " "
        
        result += f" {scale_line}\n"
        
        # Add current status
        if multiplier < 2.0:
            status = "🟢 Safe Zone"
        elif multiplier < 5.0:
            status = "🟡 Getting Higher"
        elif multiplier < 10.0:
            status = "🟠 Risky Territory"
        else:
            status = "🔴 DANGER ZONE!"
        
        result += f" {status}\n```"
        
        return result

def create_betting_embed(game: CrashGameState) -> discord.Embed:
    """Create betting phase embed."""
    embed = discord.Embed(
        title="🚀 CRASH GAME",
        description="# 💰 Place Your Bets!\n*The multiplier will rise until it crashes - cash out before it does!*",
        color=discord.Color.blue()
    )
    
    # Calculate totals
    total_pot = sum(player['bet'] for player in game.players.values())
    
    if game.players:
        # Show player bets in a clean format
        player_list = []
        for i, player in enumerate(game.players.values(), 1):
            player_list.append(f"`{i:2d}.` **{player['username']}** → {fmt(player['bet'])}")
        
        embed.add_field(
            name=f"👥 Players Ready ({len(game.players)})",
            value="\n".join(player_list[:8]) + (f"\n*...and {len(game.players)-8} more*" if len(game.players) > 8 else ""),
            inline=False
        )
        
        embed.add_field(
            name="💰 Total Pot",
            value=f"# {fmt(total_pot)}",
            inline=True
        )
    else:
        embed.add_field(
            name="🎯 Waiting for Players",
            value="*Click **Place Bet** to join the action!*",
            inline=False
        )
    
    embed.add_field(
        name="🎮 Quick Guide",
        value=(
            "🔹 **Place Bet** → Enter your wager\n"
            "🔹 **Start Game** → Begin the round\n"
            "🔹 **Cash Out** → Secure winnings before crash\n"
            "🔹 **Higher Risk** = **Higher Reward**"
        ),
        inline=False
    )
    
    embed.set_footer(text=f"💡 Bet Range: {fmt(CRASH_CONFIG['min_bet'])} - {fmt(CRASH_CONFIG['max_bet'])} | Ready to launch? 🚀")
    
    return embed

# --- Commands --------------------------------------------------------------------
class CrashCommands(Cog):
    """Crash game commands."""

    def __init__(self, bot):
        self.bot = bot
    
    @app_commands.command(name="crash", description="🚀 Start or join a Crash game - bet on the multiplier!")
    async def crash_command(self, interaction: discord.Interaction):
        guild_id = await get_guild_id(interaction)
        channel_id = str(interaction.channel.id)
        
        # Check if there's an active game
        if channel_id in crash_manager.games:
            game = crash_manager.games[channel_id]
            if game.game_active and not game.betting_phase:
                await interaction.response.send_message(
                    "❌ **A crash game is already running in this channel!**\n"
                    "🔄 Wait for it to finish or use `/stopcrash` (admin only) to end it.\n"
                    "💡 You can watch the current game or play in another channel!", 
                    ephemeral=True
                )
                return
            elif game.betting_phase and len(game.players) > 0:
                # There's already a betting game with players - join it instead of creating new
                view = CrashBettingView(game)
                embed = create_betting_embed(game)
                embed.add_field(
                    name="🎯 Joining Existing Game",
                    value="You can place your bet to join the current round!",
                    inline=False
                )
                await interaction.response.send_message(embed=embed, view=view)
                return
        
        # Create new game
        game = crash_manager.get_or_create_game(channel_id, guild_id)
        view = CrashBettingView(game)
        embed = create_betting_embed(game)
        
        await interaction.response.send_message(embed=embed, view=view)
        # Track the created message for admin stop/edit purposes
        try:
            game.game_message = await interaction.original_response()
        except Exception:
            game.game_message = None
    
    @app_commands.command(name="crashhelp", description="🎯 Learn how to play the Crash game")
    async def crash_help_command(self, interaction: discord.Interaction):
        embed = discord.Embed(
            title="🚀 Crash Game Guide",
            description="Bet on the multiplier and cash out before it crashes!",
            color=discord.Color.gold()
        )
        
        embed.add_field(
            name="🎯 Game Overview",
            value=(
                "• **Objective**: Cash out before the multiplier crashes\n"
                "• **Multiplier**: Starts at 1.00x and rises exponentially\n"
                "• **Crash Point**: Random - could be 1.01x or 50.00x!\n"
                "• **Winnings**: Your bet × multiplier when you cash out"
            ),
            inline=False
        )
        
        embed.add_field(
            name="🚀 How to Play",
            value=(
                "1. Use `/crash` to start a game\n"
                "2. Click **Place Bet** and enter your wager\n"
                "3. Wait for game to start (or click **Start Game**)\n"
                "4. Watch the multiplier rise in real-time\n"
                "5. Click **Cash Out** before it crashes!\n"
                "6. If you don't cash out before crash, you lose your bet"
            ),
            inline=False
        )
        
        embed.add_field(
            name="📈 Strategy Tips",
            value=(
                "• **Conservative**: Cash out early (1.20x - 2.00x)\n"
                "• **Moderate**: Wait for medium multipliers (2.00x - 5.00x)\n"
                "• **Risky**: Hold for high multipliers (5.00x+)\n"
                "• **Remember**: Higher risk = higher reward, but more chance of losing!"
            ),
            inline=False
        )
        
        embed.add_field(
            name="🎲 Game Features",
            value=(
                "• **Real-time updates** every 0.5 seconds\n"
                "• **Visual multiplier graph** in ASCII art\n"
                "• **Live player tracking** - see who's still in\n"
                "• **Statistics tracking** for `/mystats`\n"
                "• **Instant payouts** when you cash out"
            ),
            inline=True
        )
        
        embed.add_field(
            name="💰 Betting Limits",
            value=(
                f"• **Minimum bet**: {fmt(CRASH_CONFIG['min_bet'])}\n"
                f"• **Maximum bet**: {fmt(CRASH_CONFIG['max_bet'])}\n"
                f"• **Max multiplier**: {CRASH_CONFIG['max_multiplier']:.0f}x\n"
                "• **House edge**: 3% (reduced in 1-4x range, higher near 5x)"
            ),
            inline=True
        )
        
        embed.add_field(
            name="⚠️ Important Notes",
            value=(
                "• Each crash point is **completely random**\n"
                "• Past results **don't predict** future crashes\n"
                "• You can only bet **once per round**\n"
                "• Game ends when **all players cash out** or **crash occurs**\n"
                "• Cashed out players are **safe from crashes**"
            ),
            inline=False
        )
        
        embed.set_footer(text="🚀 Use /crash to start playing! May the multipliers be with you! 🎰")
        
        await interaction.response.send_message(embed=embed, ephemeral=True)
    

async def setup(bot):
    await bot.add_cog(CrashCommands(bot))
