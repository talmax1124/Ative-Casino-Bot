"""Fishing Game commands and views.
Cast your line to catch fish with multipliers, but beware of the red fish!
Players can stop fishing at any time to keep their accumulated winnings.
"""

import discord
from discord import app_commands
from discord.ui import View, Button
from discord.ext import commands
from discord.ext.commands import Cog
from utils.common import game_registry, fmt, fmt_delta_colored, get_guild_id
from utils.common import AutoRefundGameView
from utils.firebase_database import db_manager

import asyncio
import secrets
import logging
from typing import Tuple, List, Dict

# Add uniform function from secrets module
if not hasattr(secrets, 'uniform'):
    import random
    secrets.uniform = random.uniform

LOG = logging.getLogger("fishing")

# --- Fish Data ---------------------------------------------------------------
FISH_TYPES = {
    "common": {
        "emoji": "🐟",
        "name": "Common Fish",
        "multiplier_min": 1.01,
        "multiplier_max": 1.05,
        "probability": 50,
        "color": discord.Color.blue(),
        "description": "A regular fish found in most waters"
    },
    "uncommon": {
        "emoji": "🐠",
        "name": "Uncommon Fish", 
        "multiplier_min": 1.06,
        "multiplier_max": 1.15,
        "probability": 25,
        "color": discord.Color.green(),
        "description": "A colorful fish that's a bit harder to find"
    },
    "rare": {
        "emoji": "🌟",
        "name": "Rare Fish",
        "multiplier_min": 1.16,
        "multiplier_max": 1.35,
        "probability": 15,
        "color": discord.Color.gold(),
        "description": "A sparkling rare catch!"
    },
    "legendary": {
        "emoji": "🏆",
        "name": "Legendary Fish",
        "multiplier_min": 1.4,
        "multiplier_max": 1.8,
        "probability": 2,
        "color": discord.Color.purple(),
        "description": "An incredibly rare legendary fish!"
    },
    "red": {
        "emoji": "🔴",
        "name": "Red Fish of Doom",
        "multiplier_min": 0.0,
        "multiplier_max": 0.0,
        "probability": 7,
        "color": discord.Color.red(),
        "description": "💀 This cursed fish steals all your catch!"
    }
}

# Calculate cumulative probabilities for weighted random selection
_cumulative_probs = []
_fish_types = []
cumulative = 0
for fish_type, data in FISH_TYPES.items():
    cumulative += data["probability"]
    _cumulative_probs.append(cumulative)
    _fish_types.append(fish_type)

TOTAL_PROBABILITY = cumulative  # Should be 100

def generate_random_fish() -> Tuple[str, float]:
    """
    Generate a random fish type and multiplier using secure randomness.
    Returns (fish_type, multiplier)
    """
    # Generate secure random number
    random_num = secrets.randbelow(TOTAL_PROBABILITY)
    
    # Find which fish type this corresponds to
    fish_type = None
    for i, cumulative_prob in enumerate(_cumulative_probs):
        if random_num < cumulative_prob:
            fish_type = _fish_types[i]
            break
    
    if fish_type is None:
        fish_type = "common"  # Fallback
    
    fish_data = FISH_TYPES[fish_type]
    
    # Generate random multiplier within the fish's range
    if fish_data["multiplier_min"] == fish_data["multiplier_max"]:
        multiplier = fish_data["multiplier_min"]
    else:
        multiplier = secrets.uniform(fish_data["multiplier_min"], fish_data["multiplier_max"])
    
    return fish_type, multiplier

# --- Fishing Game View -------------------------------------------------------
class FishingGameView(AutoRefundGameView):
    """Interactive fishing game view with FISH and Stop Fishing buttons."""
    
    def __init__(self, user, initial_bet: float, wallet_after: float, username: str):
        super().__init__(timeout=45)  # 45 second timeout with auto-refund
        self.user = user
        self.initial_bet = initial_bet
        self.wallet_after = wallet_after
        self.wallet_before = wallet_after + initial_bet
        self.username = username
        
        # Setup auto-refund
        self.setup_auto_refund(str(user.id), initial_bet, "fishing")
        
        # Game state
        self.current_winnings = initial_bet  # Start with bet amount
        self.fish_caught = []
        self.total_catches = 0
        self.game_ended = False
        self.max_catches = 20  # Maximum catches allowed
        
        # Create buttons
        self.fish_button = Button(
            label="🎣 FISH",
            style=discord.ButtonStyle.primary,
            emoji="🎣"
        )
        self.fish_button.callback = self.fish_callback
        
        self.stop_button = Button(
            label="🛑 Stop Fishing",
            style=discord.ButtonStyle.danger,
            emoji="🛑"
        )
        self.stop_button.callback = self.stop_callback
        
        self.add_item(self.fish_button)
        self.add_item(self.stop_button)
    
    async def on_timeout(self):
        """Handle view timeout."""
        if not self.game_ended:
            # Game timed out, end it gracefully
            self.game_ended = True
            
            # Disable buttons
            for item in self.children:
                item.disabled = True
            
            # End game due to timeout - no interaction to respond to
            try:
                guild_id = str(self.user.guild.id) if hasattr(self.user, 'guild') and self.user.guild else "dm_fallback"
                user_id = str(self.user.id)
                
                # Calculate final wallet
                final_wallet = self.wallet_after + self.current_winnings
                
                # Update database
                await db_manager.set_balances(user_id, guild_id, wallet=final_wallet)
                await db_manager.record_game_result(user_id, guild_id, "fishing", 
                                                  self.current_winnings >= self.initial_bet, 
                                                  self.initial_bet, self.current_winnings)
                await db_manager.clear_game_active(user_id, guild_id)
                
                # Remove from active sessions
                game_registry.remove_session(self.user.id)
                
                LOG.info(f"Fishing game timed out for user {self.username}, winnings saved: {self.current_winnings}")
            except Exception as e:
                LOG.error(f"Error handling fishing timeout: {e}")
    
    async def fish_callback(self, interaction: discord.Interaction):
        """Handle the FISH button click."""
        if self.game_ended:
            await interaction.followup.send("🚫 This fishing session has already ended!", ephemeral=True)
            return
            
        if interaction.user.id != self.user.id:
            await interaction.followup.send("🚫 This isn't your fishing rod!", ephemeral=True)
            return
        
        # Mark game as started (prevents timeout refund)
        self.mark_game_started()
        
        # Generate a fish
        fish_type, multiplier = generate_random_fish()
        fish_data = FISH_TYPES[fish_type]
        self.total_catches += 1
        
        # Check if it's the red fish
        if fish_type == "red":
            self.current_winnings = 0.0  # Lose everything
            self.game_ended = True
            self.fish_caught.append(f"{fish_data['emoji']} {fish_data['name']} (💀 DOOM!)")
            
            # Disable buttons
            for item in self.children:
                item.disabled = True
            
            # Update database - player loses (gets 0)
            await self._end_game(interaction, lost_to_red_fish=True)
            return
        
        # Apply multiplier to current winnings
        old_winnings = self.current_winnings
        self.current_winnings *= multiplier
        self.fish_caught.append(f"{fish_data['emoji']} {fish_data['name']} ({multiplier:.2f}x)")
        
        # Check if we've reached the catch limit
        if self.total_catches >= self.max_catches:
            self.game_ended = True
            
            # Disable buttons
            for item in self.children:
                item.disabled = True
            
            # Create final catch embed
            embed = self._create_game_embed(
                f"🎣 Final catch! {fish_data['emoji']} **{fish_data['name']}**!",
                fish_data['color'],
                f"Multiplier: **{multiplier:.2f}x**\nWinnings: {fmt(old_winnings)} → **{fmt(self.current_winnings)}**\n\n🏁 **FISHING SESSION COMPLETED!** (20/20 catches)\nYou've reached the maximum catch limit!"
            )
            
            try:
                await interaction.response.edit_message(embed=embed, view=self)
            except:
                try:
                    await interaction.edit_original_response(embed=embed, view=self)
                except:
                    pass
            
            # End game automatically after reaching limit
            await self._end_game(interaction, lost_to_red_fish=False, reached_limit=True)
            return
        
        # Create updated embed for normal catch
        embed = self._create_game_embed(
            f"🎣 You caught a {fish_data['emoji']} **{fish_data['name']}**!",
            fish_data['color'],
            f"Multiplier: **{multiplier:.2f}x**\nWinnings: {fmt(old_winnings)} → **{fmt(self.current_winnings)}**"
        )
        
        try:
            await interaction.response.edit_message(embed=embed, view=self)
        except:
            try:
                await interaction.edit_original_response(embed=embed, view=self)
            except:
                pass
    
    async def stop_callback(self, interaction: discord.Interaction):
        """Handle the Stop Fishing button click."""
        if self.game_ended:
            await interaction.followup.send("🚫 This fishing session has already ended!", ephemeral=True)
            return
            
        if interaction.user.id != self.user.id:
            await interaction.followup.send("🚫 This isn't your fishing rod!", ephemeral=True)
            return
        
        # Mark game as started (prevents timeout refund)
        self.mark_game_started()
        
        # Check if they've caught any fish
        if self.total_catches == 0:
            await interaction.followup.send("🚫 You haven't caught any fish yet! Cast your line first with the FISH button.", ephemeral=True)
            return
        
        self.game_ended = True
        
        # Disable buttons
        for item in self.children:
            item.disabled = True
        
        # End game successfully - defer the interaction first
        try:
            await interaction.response.defer()
        except:
            pass
        
        await self._end_game(interaction, lost_to_red_fish=False)
    
    async def _end_game(self, interaction: discord.Interaction, lost_to_red_fish: bool, reached_limit: bool = False):
        """Handle game ending logic."""
        guild_id = await get_guild_id(interaction)
        user_id = str(self.user.id)
        
        # Calculate final wallet
        final_wallet = self.wallet_after + self.current_winnings
        
        # Update database
        await db_manager.set_balances(user_id, guild_id, wallet=final_wallet)
        
        # Record game result
        won = self.current_winnings >= self.initial_bet
        await db_manager.record_game_result(user_id, guild_id, "fishing", won, self.initial_bet, self.current_winnings)
        
        # Clear game session
        await db_manager.clear_game_active(user_id, guild_id)
        
        # Get bank balance for display
        _, bank_balance = await db_manager.get_balances(user_id, guild_id)
        
        # Create final embed based on ending type
        if lost_to_red_fish:
            title = "💀 Red Fish of Doom!"
            description = f"**{self.username}** caught the cursed red fish and lost everything!"
            color = discord.Color.red()
            result_emoji = "💀"
        elif reached_limit:
            title = "🏁 Fishing Limit Reached!"
            description = f"**{self.username}** completed a full fishing session! (20/20 catches)"
            if self.current_winnings >= self.initial_bet * 3:
                color = discord.Color.gold()
                result_emoji = "🏆"
                title = "🏆 Master Angler!"
            elif self.current_winnings >= self.initial_bet * 2:
                color = discord.Color.green() 
                result_emoji = "🎉"
                title = "🎉 Expert Fisher!"
            else:
                color = discord.Color.blue()
                result_emoji = "🏁"
        elif self.current_winnings >= self.initial_bet * 5:
            title = "🏆 Amazing Fishing Session!"
            description = f"**{self.username}** had an incredible fishing trip!"
            color = discord.Color.gold()
            result_emoji = "🏆"
        elif self.current_winnings >= self.initial_bet * 2:
            title = "🎉 Great Fishing Session!"
            description = f"**{self.username}** had a profitable fishing trip!"
            color = discord.Color.green()
            result_emoji = "🎊"
        elif self.current_winnings >= self.initial_bet:
            title = "✅ Successful Fishing!"
            description = f"**{self.username}** made a profit fishing!"
            color = discord.Color.blue()
            result_emoji = "✅"
        else:
            title = "📉 Fishing Loss"
            description = f"**{self.username}** didn't catch enough to cover the bait cost!"
            color = discord.Color.orange()
            result_emoji = "📉"
        
        embed = discord.Embed(
            title=f"{result_emoji} {title}",
            description=description,
            color=color
        )
        
        embed.add_field(name="🎣 Total Catches", value=str(self.total_catches), inline=True)
        embed.add_field(name="💰 Initial Bet", value=fmt(self.initial_bet), inline=True)
        embed.add_field(name="🏆 Final Winnings", value=f"**{fmt(self.current_winnings)}**", inline=True)
        
        embed.add_field(name="💼 Wallet", value=f"{fmt(self.wallet_before)} → **{fmt(final_wallet)}**", inline=True)
        embed.add_field(name="🏦 Bank Balance", value=fmt(bank_balance), inline=True)
        
        # Net change calculation
        net_change = self.current_winnings - self.initial_bet
        net_change_color = "+" if net_change >= 0 else ""
        embed.add_field(name="📈 Net Change", value=f"**{net_change_color}{fmt(net_change)}**", inline=True)
        
        # Show fish caught
        if self.fish_caught:
            fish_list = "\n".join(self.fish_caught[-10:])  # Show last 10 fish
            if len(self.fish_caught) > 10:
                fish_list = f"...\n{fish_list}"
            embed.add_field(name="🐟 Fish Caught", value=fish_list, inline=False)
        
        embed.set_footer(text="🎣 Thanks for fishing! Cast your line again anytime.")
        
        # Remove from active sessions
        game_registry.remove_session(self.user.id)
        
        # Handle interaction response carefully to avoid webhook errors
        try:
            if reached_limit:
                # For reach limit, we need to send a follow-up message since interaction was already used
                await asyncio.sleep(1.0)  # Brief delay
                await interaction.followup.send(embed=embed)
            else:
                # For red fish or stop button, try to respond/edit appropriately
                if interaction.response.is_done():
                    # Response already sent, use followup
                    await interaction.followup.send(embed=embed)
                else:
                    # Response not sent yet, can use edit_original_response
                    await interaction.response.edit_message(embed=embed, view=self)
        except discord.errors.NotFound:
            # Webhook/interaction expired, skip sending final message
            LOG.info("Interaction expired, skipping final fishing message")
            pass
        except Exception as e:
            LOG.error(f"Error sending fishing end message: {e}")
            # Don't re-raise, game ending should still complete
    
    def _create_game_embed(self, title: str, color: discord.Color, description: str = None) -> discord.Embed:
        """Create a game state embed."""
        embed = discord.Embed(
            title=title,
            color=color
        )
        
        if description:
            embed.description = description
        
        embed.add_field(name="🎣 Catches", value=f"{self.total_catches}/{self.max_catches}", inline=True)
        embed.add_field(name="💰 Current Winnings", value=f"**{fmt(self.current_winnings)}**", inline=True)
        embed.add_field(name="📊 Multiplier", value=f"{self.current_winnings / self.initial_bet:.2f}x", inline=True)
        
        # Show recent fish
        if self.fish_caught:
            recent_fish = "\n".join(self.fish_caught[-5:])  # Show last 5 fish
            embed.add_field(name="🐟 Recent Catches", value=recent_fish, inline=False)
        
        embed.set_footer(text="🎣 Keep fishing for bigger multipliers, or stop to secure your winnings!")
        
        return embed

# --- Fishing Cog -------------------------------------------------------------
class Fishing(Cog):
    def __init__(self, bot):
        self.bot = bot
        # Register this game with the registry
        game_registry.register_game("Fishing", self.__class__, "Cast your line to catch fish with multipliers!")

    @app_commands.command(name="fishing", description="🎣 Go fishing! Catch fish with multipliers, but beware the red fish!")
    @app_commands.describe(amount="Bet amount (use K/M/B suffixes, 'A' for all, 'H' for half)")
    async def fishing_command(self, interaction: discord.Interaction, amount: str):
        # Defer the response to prevent timeout
        await interaction.response.defer()
        
        user_id = str(interaction.user.id)
        guild_id = await get_guild_id(interaction)
        
        await db_manager.ensure_user(user_id, interaction.user.display_name)
        
        # Check for active game
        if await db_manager.is_game_active(user_id, guild_id):
            embed = discord.Embed(
                title="❌ Game Already Active",
                description="You already have an active game session! Finish your current game first.",
                color=discord.Color.red()
            )
            await interaction.followup.send(embed=embed, ephemeral=True)
            return

        # Get user wallet
        user_wallet, bank_balance = await db_manager.get_balances(user_id, guild_id)

        # Parse amount with K/M/B support
        try:
            from utils.firebase_database import parse_amount
            amount = parse_amount(amount, user_wallet)
        except ValueError as e:
            embed = discord.Embed(
                title="❌ Invalid Amount",
                description=f"Invalid amount format: {e}",
                color=discord.Color.red()
            )
            await interaction.followup.send(embed=embed, ephemeral=True)
            return

        if amount <= 0:
            embed = discord.Embed(
                title="❌ Invalid Bet",
                description="Bet must be greater than 0!",
                color=discord.Color.red()
            )
            await interaction.followup.send(embed=embed, ephemeral=True)
            return

        if amount > user_wallet:
            embed = discord.Embed(
                title="❌ Insufficient Funds",
                description=f"You only have {fmt(user_wallet)} in your wallet!",
                color=discord.Color.red()
            )
            await interaction.followup.send(embed=embed, ephemeral=True)
            return

        # Deduct bet and set game active
        success, new_wallet = await db_manager.adjust_wallet(user_id, guild_id, -amount)
        if not success:
            embed = discord.Embed(
                title="❌ Transaction Failed",
                description="Could not deduct bet amount. Please try again.",
                color=discord.Color.red()
            )
            await interaction.followup.send(embed=embed, ephemeral=True)
            return
        
        # Set game as active
        await db_manager.set_game_active(user_id, guild_id, "fishing", amount)
        
        # Add to game registry
        game_registry.add_session(interaction.user.id)
        
        # Create fishing game view
        view = FishingGameView(interaction.user, amount, new_wallet, interaction.user.display_name)

        # Create initial embed
        embed = discord.Embed(
            title="🎣 Fishing Adventure Begins!",
            description=f"**{interaction.user.display_name}** casts their line into the water...",
            color=discord.Color.blue()
        )
        
        embed.add_field(name="💰 Bait Cost", value=f"**{fmt(amount)}**", inline=True)
        embed.add_field(name="💼 Remaining Wallet", value=fmt(new_wallet), inline=True)
        embed.add_field(name="🏦 Bank Balance", value=fmt(bank_balance), inline=True)
        
        # Add fish type information
        fish_info = "🐟 **Common** (50%): 1.01x-1.05x\n"
        fish_info += "🐠 **Uncommon** (25%): 1.06x-1.15x\n"
        fish_info += "🌟 **Rare** (15%): 1.16x-1.35x\n"
        fish_info += "🏆 **Legendary** (2%): 1.4x-1.8x\n"
        fish_info += "🔴 **Red Fish** (7%): 💀 LOSE ALL"
        
        embed.add_field(name="🐟 Fish Types", value=fish_info, inline=False)
        embed.add_field(name="🎯 Current Winnings", value=f"**{fmt(amount)}**", inline=True)
        embed.add_field(name="🎣 Strategy", value="Keep fishing for higher multipliers, or stop to secure winnings!", inline=True)
        
        embed.set_footer(text="🚨 Warning: Red fish will steal all your catch! Fish responsibly.")

        msg = await interaction.followup.send(embed=embed, view=view)
        try:
            from utils.common import set_user_game_message
            set_user_game_message(user_id, msg)
        except Exception:
            pass

    @app_commands.command(name="helpfishing", description="🎣 Show fishing game help and information.")
    async def help_fishing_command(self, interaction: discord.Interaction):
        embed = discord.Embed(
            title="🎣 Fishing Game Help",
            description="Cast your line to catch fish with multipliers!",
            color=discord.Color.blue()
        )
        
        embed.add_field(
            name="🎮 How to Play",
            value="`/fishing [amount|A|H]` - Start fishing with your bet!\nClick **🎣 FISH** to catch fish and multiply winnings.\nClick **🛑 Stop Fishing** anytime to keep your current winnings.",
            inline=False
        )
        
        # Add fish type information with probabilities
        embed.add_field(
            name="🐟 Fish Types & Multipliers",
            value="🐟 **Common Fish** (50% chance)\n• Multiplier: 1.01x - 1.05x\n• Barely profitable catches\n\n"
                  "🐠 **Uncommon Fish** (25% chance)\n• Multiplier: 1.06x - 1.15x\n• Small but steady gains\n\n"
                  "🌟 **Rare Fish** (15% chance)\n• Multiplier: 1.16x - 1.35x\n• Decent rewards for the patient\n\n"
                  "🏆 **Legendary Fish** (2% chance)\n• Multiplier: 1.4x - 1.8x\n• Rare catches for masters\n\n"
                  "🔴 **Red Fish of Doom** (7% chance)\n• 💀 **LOSE EVERYTHING!**\n• The cursed fish that steals all your catch",
            inline=False
        )
        
        embed.add_field(
            name="💡 Strategy Tips",
            value="• **Start small** - Test your luck before big bets\n"
                  "• **Know when to stop** - Greed leads to the red fish\n"
                  "• **Compound effect** - Each catch multiplies your total winnings\n"
                  "• **Risk vs Reward** - More catches = higher multipliers but more red fish risk",
            inline=False
        )
        
        embed.add_field(
            name="🎯 Game Mechanics",
            value="• Your bet becomes your starting winnings\n"
                  "• Each fish multiplies your **current** winnings\n"
                  "• Stop anytime to secure your current winnings\n"
                  "• Red fish resets winnings to $0.00\n"
                  "• **Maximum 20 catches per session**\n"
                  "• Game auto-ends at 20 catches\n"
                  "• Use 'A' to bet all, 'H' to bet half",
            inline=False
        )
        
        embed.add_field(
            name="🏆 Example Session",
            value="Bet: $100 → Catch 🐠 (1.1x) → $110\n"
                  "Catch 🌟 (1.2x) → $132\n"
                  "Catch 🏆 (1.5x) → $198\n"
                  "**Stop here** = Win $98 profit!\n"
                  "OR keep fishing and risk the 🔴 red fish...",
            inline=False
        )
        
        embed.set_footer(text="🚨 Remember: The red fish appears randomly and steals everything! Fish responsibly.")
        
        await interaction.followup.send(embed=embed)


# Simple manager class for compatibility with general.py
class FishingManager:
    def __init__(self):
        self.games = {}

    def remove_game(self, user_id):
        pass


# Global manager instance for compatibility with general.py
fishing_manager = FishingManager()


# Setup function for bot integration
async def setup(bot):
    import inspect
    cog = Fishing(bot)
    add_cog = getattr(bot, "add_cog")
    if inspect.iscoroutinefunction(add_cog):
        await add_cog(cog)
    else:
        add_cog(cog)
