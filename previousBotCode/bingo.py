"""Multiplayer BINGO game implementation with visual cards.
Players join with the same initial bet as the person who started the game.
Classic 5x5 BINGO cards with B-I-N-G-O columns, center free space, and automatic number calling.
Features visual Pillow-generated cards with chips on marked numbers.
"""

import discord
from discord import app_commands
from discord.ui import View, Button, Modal, TextInput
from discord.ext import commands
from discord.ext.commands import Cog
from utils.common import game_registry, fmt, fmt_delta_colored, get_guild_id, _has_admin_role, _has_mod_role
from utils.firebase_database import db_manager, parse_amount
from utils.bingo_card_generator import create_bingo_card_image, create_game_status_image, get_bingo_column

import asyncio
import secrets
import logging
import time
import random
from typing import List, Tuple, Optional, Dict, Set
from collections import defaultdict
from datetime import datetime, timedelta

LOG = logging.getLogger("bingo")

# BINGO number ranges for each column
BINGO_RANGES = {
    'B': (1, 15),   # B column: 1-15
    'I': (16, 30),  # I column: 16-30
    'N': (31, 45),  # N column: 31-45
    'G': (46, 60),  # G column: 46-60
    'O': (61, 75)   # O column: 61-75
}

class BingoCard:
    """Represents a BINGO card for a player."""
    
    def __init__(self):
        self.card = self._generate_card()
        self.marked = [[False] * 5 for _ in range(5)]
        # Center space (2,2) is always free
        self.marked[2][2] = True
    
    def _generate_card(self) -> List[List[int]]:
        """Generate a random 5x5 BINGO card with proper randomization."""
        import random
        import time
        
        # Seed with current time and a random value for better entropy
        random.seed(time.time() + random.random())
        
        card = []
        
        for col, (letter, (min_val, max_val)) in enumerate(BINGO_RANGES.items()):
            # Generate all possible numbers for this column and shuffle them
            available_numbers = list(range(min_val, max_val + 1))
            random.shuffle(available_numbers)
            
            # Take the first 5 numbers after shuffling
            column_numbers = available_numbers[:5]
            
            # Shuffle the selected numbers again for extra randomness
            random.shuffle(column_numbers)
            
            # Add this column to the card
            for row in range(5):
                if col == 0:  # First column, create rows
                    card.append([column_numbers[row]])
                else:  # Add to existing rows
                    card[row].append(column_numbers[row])
        
        # Set center space to "FREE"
        card[2][2] = 0  # Use 0 to represent FREE space
        
        return card
    
    def mark_number(self, number: int) -> bool:
        """Mark a number on the card if it exists. Returns True if marked."""
        for row in range(5):
            for col in range(5):
                if self.card[row][col] == number:
                    self.marked[row][col] = True
                    return True
        return False
    
    def check_bingo(self) -> List[str]:
        """Check for BINGO patterns. Returns list of winning patterns."""
        patterns = []
        
        # Check rows
        for row in range(5):
            if all(self.marked[row][col] for col in range(5)):
                patterns.append(f"Row {row + 1}")
        
        # Check columns
        for col in range(5):
            if all(self.marked[row][col] for row in range(5)):
                column_names = ['B', 'I', 'N', 'G', 'O']
                patterns.append(f"Column {column_names[col]}")
        
        # Check diagonals
        if all(self.marked[i][i] for i in range(5)):
            patterns.append("Diagonal (Top-Left to Bottom-Right)")
        
        if all(self.marked[i][4-i] for i in range(5)):
            patterns.append("Diagonal (Top-Right to Bottom-Left)")
        
        return patterns
    
    def get_card_display(self, show_marked: bool = True) -> str:
        """Get a text representation of the card."""
        lines = []
        lines.append("```")
        lines.append(" B   I   N   G   O ")
        lines.append("---+---+---+---+---")
        
        for row in range(5):
            row_str = ""
            for col in range(5):
                if row == 2 and col == 2:
                    cell = "FREE"
                else:
                    cell = str(self.card[row][col]).rjust(2)
                
                if show_marked and self.marked[row][col]:
                    cell = f"[{cell}]" if len(cell) == 2 else f"[{cell}]"
                else:
                    cell = f" {cell} " if len(cell) == 2 else f" {cell}"
                
                row_str += cell
                if col < 4:
                    row_str += "|"
            
            lines.append(row_str)
            if row < 4:
                lines.append("---+---+---+---+---")
        
        lines.append("```")
        return "\n".join(lines)

class BingoPlayer:
    """Represents a player in the BINGO game."""
    
    def __init__(self, user_id: str, username: str, bet_amount: float):
        self.user_id = user_id
        self.username = username
        self.bet_amount = bet_amount
        self.card = BingoCard()
        self.has_bingo = False
        self.winning_patterns = []

class BingoGameState:
    """Manages the state of a BINGO game with automatic calling."""
    
    def __init__(self, channel_id: str, guild_id: str, starter_bet: float):
        self.channel_id = channel_id
        self.guild_id = guild_id
        self.starter_bet = starter_bet
        self.players: Dict[str, BingoPlayer] = {}
        self.called_numbers: List[int] = []
        self.available_numbers = list(range(1, 76))  # 1-75
        self.game_active = False
        self.waiting_for_players = True
        self.current_number = None
        self.winners = []
        self.game_ended = False
        self.lobby_start_time = time.time()
        
        # Automatic calling variables
        self.auto_call_task = None
        self.call_interval = 5.0  # 5 seconds between calls
        self.game_channel = None
        self.player_interactions: Dict[str, discord.Interaction] = {}  # Store interactions for updates
        self.player_interaction_times: Dict[str, datetime] = {}  # Track when interactions were created
        self.interactive_views: Dict[str, 'BingoInteractiveCardView'] = {}  # Store interactive card views for auto-updates
        self.main_game_interaction: Optional[discord.Interaction] = None  # Store main game view interaction
    
    def add_player(self, user_id: str, username: str) -> bool:
        """Add a player to the game."""
        if user_id in self.players:
            return False
        if len(self.players) >= 20:  # Maximum 20 players
            return False
        if self.game_active:
            return False
        
        self.players[user_id] = BingoPlayer(user_id, username, self.starter_bet)
        return True
    
    def remove_player(self, user_id: str) -> bool:
        """Remove a player from the game."""
        if user_id not in self.players:
            return False
        if self.game_active:
            return False  # Can't leave during active game
        
        del self.players[user_id]
        return True
    
    def can_start_game(self) -> bool:
        """Check if game can start."""
        return len(self.players) >= 2 and not self.game_active
    
    def start_game(self) -> bool:
        """Start the BINGO game."""
        if not self.can_start_game():
            return False
        
        self.game_active = True
        self.waiting_for_players = False
        # Use proper random shuffling with better entropy
        import random
        import time
        
        # Seed with current time and game-specific data for better entropy
        random.seed(time.time() + len(self.players) + hash(self.channel_id))
        
        # Shuffle multiple times for better randomization
        for _ in range(3):
            random.shuffle(self.available_numbers)
            # Additional entropy by swapping random positions
            for i in range(len(self.available_numbers) // 2):
                j = random.randint(0, len(self.available_numbers) - 1)
                k = random.randint(0, len(self.available_numbers) - 1)
                self.available_numbers[j], self.available_numbers[k] = self.available_numbers[k], self.available_numbers[j]
        # Start automatic calling
        self.start_auto_calling()
        return True
    
    def start_auto_calling(self):
        """Start the automatic number calling task."""
        if self.auto_call_task is None or self.auto_call_task.done():
            self.auto_call_task = asyncio.create_task(self._auto_call_loop())
    
    def stop_auto_calling(self):
        """Stop the automatic number calling task."""
        if self.auto_call_task and not self.auto_call_task.done():
            self.auto_call_task.cancel()
    
    async def _auto_call_loop(self):
        """Automatic number calling loop."""
        try:
            # Wait a bit before starting calls
            await asyncio.sleep(3.0)
            
            while self.game_active and not self.game_ended and self.available_numbers:
                # Call next number
                number = self.call_next_number()
                if number is None:
                    break
                
                # Update all players
                await self._update_all_players()
                
                # Check for winners - but only for manual checking since interactive cards handle their own BINGO detection
                # This is mainly for any remaining auto-update players
                new_winners = self.check_winners()
                if new_winners:
                    self.game_ended = True
                    await self._handle_winners(new_winners)
                    break
                
                # Wait for next call
                await asyncio.sleep(self.call_interval)
                
        except asyncio.CancelledError:
            pass
        except Exception as e:
            LOG.error(f"Error in auto call loop: {e}")
    
    async def _update_all_players(self):
        """Update all players with their current card state."""
        # Update both automatic card view players and interactive card players
        for user_id, player in self.players.items():
            # Update automatic card view players
            if user_id in self.player_interactions:
                try:
                    interaction = self.player_interactions[user_id]
                    await self._send_card_update(interaction, player)
                except Exception as e:
                    LOG.error(f"Error updating player {user_id}: {e}")
            
            # Update interactive card view players
            if user_id in self.interactive_views:
                try:
                    interactive_view = self.interactive_views[user_id]
                    await interactive_view._auto_update_card()
                except Exception as e:
                    LOG.error(f"Error updating interactive card for player {user_id}: {e}")
    
    def _is_interaction_expired(self, user_id: str) -> bool:
        """Check if interaction has expired (15 minutes)."""
        if user_id not in self.player_interaction_times:
            return True
        
        interaction_time = self.player_interaction_times[user_id]
        return datetime.now() - interaction_time > timedelta(minutes=14)  # 14 minutes to be safe
    
    async def _send_card_update(self, interaction: discord.Interaction, player: BingoPlayer):
        """Send updated card image to a player."""
        try:
            # Check if interaction has expired
            if self._is_interaction_expired(player.user_id):
                LOG.info(f"Skipping card update for {player.user_id} - interaction expired")
                # Remove expired interaction
                if player.user_id in self.player_interactions:
                    del self.player_interactions[player.user_id]
                if player.user_id in self.player_interaction_times:
                    del self.player_interaction_times[player.user_id]
                return
            # Create card image
            card_image = create_bingo_card_image(
                player.card.card, 
                player.card.marked,
                player.username,
                self.called_numbers
            )
            
            # Create file
            file = discord.File(card_image, filename=f"bingo_card_{player.user_id}.png")
            
            # Create embed
            embed = discord.Embed(
                title="🎯 Your BINGO Card",
                color=discord.Color.blue()
            )
            
            if self.current_number:
                column = get_bingo_column(self.current_number)
                embed.add_field(
                    name="📢 Just Called",
                    value=f"**{column}-{self.current_number}**",
                    inline=True
                )
            
            embed.add_field(
                name="📊 Game Status",
                value=f"Numbers Called: {len(self.called_numbers)}/75\nPlayers: {len(self.players)}",
                inline=True
            )
            
            if player.has_bingo:
                embed.add_field(
                    name="🏆 BINGO!",
                    value="You have BINGO! Waiting for game to end...",
                    inline=False
                )
            
            embed.set_image(url=f"attachment://bingo_card_{player.user_id}.png")
            
            # Try to edit the original interaction, handle webhook errors gracefully
            try:
                await interaction.edit_original_response(embed=embed, attachments=[file])
            except discord.NotFound:
                LOG.info(f"Webhook expired for player {player.user_id}, removing from auto-updates")
                # Remove expired interaction
                if player.user_id in self.player_interactions:
                    del self.player_interactions[player.user_id]
                if player.user_id in self.player_interaction_times:
                    del self.player_interaction_times[player.user_id]
            except discord.HTTPException as e:
                if "Unknown Webhook" in str(e) or "10015" in str(e):
                    LOG.info(f"Unknown webhook error for player {player.user_id}, removing from auto-updates")
                    # Remove expired interaction
                    if player.user_id in self.player_interactions:
                        del self.player_interactions[player.user_id]
                    if player.user_id in self.player_interaction_times:
                        del self.player_interaction_times[player.user_id]
                else:
                    LOG.error(f"HTTP error updating card for player {player.user_id}: {e}")
            except Exception as e:
                LOG.error(f"Unexpected error updating card for player {player.user_id}: {e}")
                
        except Exception as e:
            LOG.error(f"Error sending card update: {e}")
    
    async def _handle_winners(self, winners: List[BingoPlayer]):
        """Handle game end with winners."""
        if self.game_channel:
            try:
                # Create winner announcement
                embed = discord.Embed(
                    title="🏆 BINGO! We have winner(s)!",
                    color=discord.Color.gold()
                )
                
                if self.current_number:
                    column = get_bingo_column(self.current_number)
                    embed.description = f"Winning number: **{column}-{self.current_number}**"
                
                # Prize distribution
                total_pot = len(self.players) * self.starter_bet
                if len(winners) == 1:
                    prize_per_winner = total_pot
                    embed.add_field(
                        name="🏆 Winner",
                        value=f"**{winners[0].username}** wins {fmt(prize_per_winner)}!",
                        inline=False
                    )
                else:
                    prize_per_winner = total_pot / len(winners)
                    winner_names = [f"**{w.username}**" for w in winners]
                    embed.add_field(
                        name=f"🏆 {len(winners)} Winners",
                        value=f"{', '.join(winner_names)}\nEach wins {fmt(prize_per_winner)}!",
                        inline=False
                    )
                
                embed.add_field(
                    name="📊 Game Stats",
                    value=f"Numbers Called: {len(self.called_numbers)}/75\nTotal Players: {len(self.players)}",
                    inline=False
                )
                
                # Add winning card image(s)
                files = []
                try:
                    if len(winners) == 1:
                        # Single winner - show their card
                        winner = winners[0]
                        winning_card_image = create_bingo_card_image(
                            winner.card.card,
                            winner.card.marked,
                            f"{winner.username} - WINNER!",
                            self.called_numbers
                        )
                        
                        file = discord.File(winning_card_image, filename=f"winning_card_{winner.user_id}.png")
                        files.append(file)
                        embed.set_image(url=f"attachment://winning_card_{winner.user_id}.png")
                        embed.set_footer(text="🎉 Winning BINGO Card! 🎉")
                        
                    elif len(winners) > 1:
                        # Multiple winners - show first winner's card as example
                        winner = winners[0]
                        winning_card_image = create_bingo_card_image(
                            winner.card.card,
                            winner.card.marked,
                            f"{winner.username} - WINNER! (Example)",
                            self.called_numbers
                        )
                        
                        file = discord.File(winning_card_image, filename=f"winning_card_{winner.user_id}.png")
                        files.append(file)
                        embed.set_image(url=f"attachment://winning_card_{winner.user_id}.png")
                        embed.set_footer(text=f"🎉 Example winning card from {winner.username}! 🎉")
                        
                except Exception as e:
                    LOG.error(f"Error creating winning card image: {e}")
                
                # Send the announcement
                if files:
                    await self.game_channel.send(embed=embed, files=files)
                else:
                    await self.game_channel.send(embed=embed)
                
                # Update main game view to show game ended
                await self._update_main_game_view_end()
                
                # Process payouts
                await self._process_game_end()
                
            except Exception as e:
                LOG.error(f"Error handling winners: {e}")
    
    async def _update_main_game_view_end(self):
        """Update the main game view to show the game has ended."""
        if not self.main_game_interaction:
            return
        
        try:
            # Create game ended embed
            embed = discord.Embed(
                title="🏁 BINGO Game Ended",
                description="The game is over! Thanks to everyone who played!",
                color=discord.Color.red()
            )
            
            # Show winners
            if self.winners:
                if len(self.winners) == 1:
                    embed.add_field(
                        name="🏆 Winner",
                        value=f"**{self.winners[0].username}** won the game!",
                        inline=False
                    )
                else:
                    winner_names = [f"**{w.username}**" for w in self.winners]
                    embed.add_field(
                        name=f"🏆 {len(self.winners)} Winners",
                        value=", ".join(winner_names),
                        inline=False
                    )
            
            # Game stats
            embed.add_field(
                name="📊 Final Game Stats",
                value=f"Numbers Called: {len(self.called_numbers)}/75\nTotal Players: {len(self.players)}",
                inline=False
            )
            
            # Update the main game message without buttons
            await self.main_game_interaction.edit_original_response(embed=embed, view=None)
            
        except Exception as e:
            LOG.error(f"Error updating main game view end: {e}")
    
    def call_next_number(self) -> Optional[int]:
        """Call the next BINGO number."""
        if not self.available_numbers:
            return None
        
        number = self.available_numbers.pop(0)
        self.called_numbers.append(number)
        self.current_number = number
        
        # Don't automatically mark numbers - let players mark them manually with interactive cards
        
        return number
    
    def check_winners(self) -> List[BingoPlayer]:
        """Check for new winners after the last number was called."""
        new_winners = []
        
        for player in self.players.values():
            if not player.has_bingo:  # Only check players who haven't won yet
                patterns = player.card.check_bingo()
                if patterns:
                    player.has_bingo = True
                    player.winning_patterns = patterns
                    new_winners.append(player)
                    self.winners.append(player)
        
        return new_winners
    
    async def _process_game_end(self):
        """Process the end of the game - distribute prizes and update stats."""
        try:
            if self.winners:
                # Distribute prizes
                total_pot = len(self.players) * self.starter_bet
                prize_per_winner = total_pot / len(self.winners)
                
                for winner in self.winners:
                    # Give prize
                    await db_manager.adjust_wallet(winner.user_id, self.guild_id, prize_per_winner)
                    # Record win
                    await db_manager.record_game_result(
                        winner.user_id, self.guild_id, "bingo", True, 
                        self.starter_bet, prize_per_winner - self.starter_bet
                    )
                
                # Record losses for non-winners
                for player in self.players.values():
                    if player not in self.winners:
                        await db_manager.record_game_result(
                            player.user_id, self.guild_id, "bingo", False,
                            self.starter_bet, -self.starter_bet
                        )
            else:
                # No winners - refund everyone
                for player in self.players.values():
                    await db_manager.adjust_wallet(player.user_id, self.guild_id, self.starter_bet)
            
            # Stop automatic calling
            self.stop_auto_calling()
            
            # Remove game from manager
            bingo_manager.remove_game(self.channel_id)
            
        except Exception as e:
            LOG.error(f"Error processing game end: {e}")
    
    def get_number_column(self, number: int) -> str:
        """Get which column (B-I-N-G-O) a number belongs to."""
        for letter, (min_val, max_val) in BINGO_RANGES.items():
            if min_val <= number <= max_val:
                return letter
        return "?"

class BingoGameManager:
    """Manages multiple BINGO games across channels."""
    
    def __init__(self):
        self.games: Dict[str, BingoGameState] = {}
    
    def get_or_create_game(self, channel_id: str, guild_id: str, starter_bet: float) -> BingoGameState:
        """Get existing game or create new one."""
        if channel_id not in self.games:
            self.games[channel_id] = BingoGameState(channel_id, guild_id, starter_bet)
        return self.games[channel_id]
    
    def remove_game(self, channel_id: str):
        """Remove a game."""
        if channel_id in self.games:
            del self.games[channel_id]
    
    def force_remove_game(self, channel_id: str) -> bool:
        """Force remove a game (for admin use)."""
        if channel_id in self.games:
            game = self.games[channel_id]
            
            # Stop automatic calling
            game.stop_auto_calling()
            
            # Refund all players
            for player in game.players.values():
                asyncio.create_task(db_manager.adjust_wallet(player.user_id, game.guild_id, player.bet_amount))
            
            del self.games[channel_id]
            return True
        return False

# Global game manager
bingo_manager = BingoGameManager()

class BingoJoinModal(Modal, title="Join BINGO Game"):
    """Modal for joining a BINGO game."""
    
    def __init__(self, game: BingoGameState, view: 'BingoLobbyView'):
        super().__init__()
        self.game = game
        self.view = view
    
    confirm = TextInput(
        label="Type 'JOIN' to confirm",
        placeholder="Type JOIN to join the game",
        min_length=4,
        max_length=4,
        required=True
    )
    
    async def on_submit(self, interaction: discord.Interaction):
        user_id = str(interaction.user.id)
        guild_id = await get_guild_id(interaction)
        
        # Validate confirmation
        if self.confirm.value.upper() != "JOIN":
            embed = self.view._create_lobby_embed(f"❌ **<@{interaction.user.id}>** - You must type 'JOIN' to confirm!")
            await interaction.response.edit_message(embed=embed, view=self.view)
            return
        
        # Check if already in game
        if user_id in self.game.players:
            embed = self.view._create_lobby_embed(f"❌ **<@{interaction.user.id}>** is already in this game!")
            await interaction.response.edit_message(embed=embed, view=self.view)
            return
        
        # Check if game is active
        if self.game.game_active:
            embed = self.view._create_lobby_embed(f"❌ **<@{interaction.user.id}>** cannot join while game is in progress!")
            await interaction.response.edit_message(embed=embed, view=self.view)
            return
        
        # Check balance
        wallet, bank = await db_manager.get_balances(user_id, guild_id)
        if wallet < self.game.starter_bet:
            embed = self.view._create_lobby_embed(f"❌ **<@{interaction.user.id}>** needs {fmt(self.game.starter_bet)} but only has {fmt(wallet)}!")
            await interaction.response.edit_message(embed=embed, view=self.view)
            return
        
        # Deduct bet amount
        success, new_balance = await db_manager.adjust_wallet(user_id, guild_id, -self.game.starter_bet)
        if not success:
            embed = self.view._create_lobby_embed(f"❌ **<@{interaction.user.id}>** - Failed to deduct bet amount!")
            await interaction.response.edit_message(embed=embed, view=self.view)
            return
        
        # Add player
        success = self.game.add_player(user_id, f"<@{interaction.user.id}>")
        if not success:
            # Refund if couldn't add player
            await db_manager.adjust_wallet(user_id, guild_id, self.game.starter_bet)
            embed = self.view._create_lobby_embed(f"❌ **<@{interaction.user.id}>** - Failed to join game (max players reached)!")
            await interaction.response.edit_message(embed=embed, view=self.view)
            return
        
        # Success! Update main message with join notification
        embed = self.view._create_lobby_embed(f"✅ **<@{interaction.user.id}>** joined the BINGO game!")
        await interaction.response.edit_message(embed=embed, view=self.view)

class BingoLobbyView(View):
    """View for players to join a BINGO game."""
    
    def __init__(self, game: BingoGameState):
        super().__init__(timeout=300)
        self.game = game
    
    @discord.ui.button(label="Join Game", style=discord.ButtonStyle.green, emoji="🎯")
    async def join_game(self, interaction: discord.Interaction, button: Button):
        # Show modal for joining
        modal = BingoJoinModal(self.game, self)
        await interaction.response.send_modal(modal)
    
    @discord.ui.button(label="Start Game", style=discord.ButtonStyle.primary, emoji="🚀")
    async def start_game(self, interaction: discord.Interaction, button: Button):
        if not self.game.can_start_game():
            await interaction.followup.send("❌ Need at least 2 players to start!", ephemeral=True)
            return
        
        # Set up game channel for updates
        self.game.game_channel = interaction.channel
        
        self.game.start_game()
        
        # Ping all players that the game has started
        player_pings = " ".join([f"<@{player.user_id}>" for player in self.game.players.values()])
        
        # Create game status embed
        embed = discord.Embed(
            title="🎯 BINGO Game Started!",
            description=f"The automatic BINGO caller will start in 3 seconds. Numbers will be called every 3 seconds.\n\n{player_pings} Get your cards ready!",
            color=discord.Color.green()
        )
        
        embed.add_field(
            name="📊 Game Info",
            value=f"Players: {len(self.game.players)}\nPrize Pool: {fmt(len(self.game.players) * self.game.starter_bet)}\nBet Amount: {fmt(self.game.starter_bet)}",
            inline=False
        )
        
        embed.add_field(
            name="🎯 How to Follow Along",
            value="Click 'Interactive Card' below to see your BINGO card. It will update automatically as numbers are called!",
            inline=False
        )
        
        # Store the main game interaction for end-game updates
        self.game.main_game_interaction = interaction
        
        # Create new game view
        game_view = BingoAutoGameView(self.game)
        
        await interaction.response.edit_message(embed=embed, view=game_view)
    
    @discord.ui.button(label="Leave Game", style=discord.ButtonStyle.danger, emoji="🚪")
    async def leave_game(self, interaction: discord.Interaction, button: Button):
        user_id = str(interaction.user.id)
        
        if user_id not in self.game.players:
            await interaction.followup.send("❌ You're not in this game!", ephemeral=True)
            return
        
        if self.game.game_active:
            await interaction.followup.send("❌ You can't leave during an active game!", ephemeral=True)
            return
        
        # Remove player and refund
        guild_id = await get_guild_id(interaction)
        success, _ = await db_manager.adjust_wallet(user_id, guild_id, self.game.starter_bet)
        
        if success:
            self.game.remove_player(user_id)
            embed = self._create_lobby_embed(f"👋 **<@{interaction.user.id}>** left the game and was refunded!")
            await interaction.response.edit_message(embed=embed, view=self)
        else:
            await interaction.followup.send("❌ Failed to process refund!", ephemeral=True)
    
    def _create_lobby_embed(self, notification: str = None) -> discord.Embed:
        embed = discord.Embed(
            title="🎯 Multiplayer BINGO Lobby",
            description="Join the BINGO game!",
            color=discord.Color.green()
        )
        
        # Add notification if provided
        if notification:
            embed.description += f"\n\n{notification}"
        
        if self.game.players:
            player_list = []
            for player in self.game.players.values():
                player_list.append(f"• **{player.username}**")
            
            embed.add_field(
                name=f"Players ({len(self.game.players)}/20)",
                value="\n".join(player_list),
                inline=False
            )
        else:
            embed.add_field(name="Players", value="No players yet!", inline=False)
        
        embed.add_field(
            name="Game Info",
            value=f"• **Buy-in:** {fmt(self.game.starter_bet)}\n• **Min Players:** 2\n• **Max Players:** 20",
            inline=False
        )
        
        embed.set_footer(text="📝 Enjoy your bingo game!")
        
        return embed

class BingoInteractiveCardView(View):
    """Interactive BINGO card with clickable buttons for each number."""
    
    def __init__(self, game: BingoGameState, player: BingoPlayer):
        super().__init__(timeout=1800)  # 30 minute timeout
        self.game = game
        self.player = player
        self.user_id = player.user_id
        self.stored_interaction = None  # Will be set when card is displayed
        self.interaction_created_at = None  # Track when interaction was created
        
        # Create 25 buttons for the 5x5 grid
        self._create_card_buttons()
    
    def _create_card_buttons(self):
        """Create interactive buttons for each cell in the BINGO card."""
        for row in range(5):
            for col in range(5):
                # Create button for this cell
                number = self.player.card.card[row][col]
                is_marked = self.player.card.marked[row][col]
                is_free = (row == 2 and col == 2)
                
                if is_free:
                    # FREE space - always marked, disabled button
                    button = Button(
                        label="FREE",
                        style=discord.ButtonStyle.success,
                        disabled=True,
                        row=row
                    )
                else:
                    # Regular number button with column letter
                    column_letter = ['B', 'I', 'N', 'G', 'O'][col]
                    button_label = f"{column_letter}-{number}"
                    style = discord.ButtonStyle.success if is_marked else discord.ButtonStyle.secondary
                    button = Button(
                        label=button_label,
                        style=style,
                        disabled=is_marked,
                        row=row,
                        custom_id=f"bingo_{self.user_id}_{row}_{col}"
                    )
                    
                    # Add callback for number marking
                    button.callback = self._create_button_callback(row, col, number)
                
                self.add_item(button)
    
    def _create_button_callback(self, row: int, col: int, number: int):
        """Create a callback function for a specific button."""
        async def button_callback(interaction: discord.Interaction):
            try:
                # Defer the response first so we can use followup messages
                await interaction.response.defer(ephemeral=True)
            except (discord.NotFound, discord.HTTPException):
                LOG.info("Could not defer button interaction - webhook expired")
                return
            
            # Verify this is the right player
            if str(interaction.user.id) != self.user_id:
                try:
                    await interaction.followup.send("❌ This is not your card!", ephemeral=True)
                except (discord.NotFound, discord.HTTPException):
                    LOG.info("Could not respond to button interaction - webhook expired")
                return
            
            # Check if number has been called
            if number not in self.game.called_numbers:
                try:
                    await interaction.followup.send(
                        f"❌ Number {number} hasn't been called yet!", 
                        ephemeral=True
                    )
                except (discord.NotFound, discord.HTTPException):
                    LOG.info("Could not respond to button interaction - webhook expired")
                return
            
            # Check if already marked
            if self.player.card.marked[row][col]:
                try:
                    await interaction.followup.send(
                        f"❌ Number {number} is already marked!", 
                        ephemeral=True
                    )
                except (discord.NotFound, discord.HTTPException):
                    LOG.info("Could not respond to button interaction - webhook expired")
                return
            
            # Mark the number
            self.player.card.marked[row][col] = True
            
            # Update button appearance
            button = None
            for item in self.children:
                if hasattr(item, 'custom_id') and item.custom_id == f"bingo_{self.user_id}_{row}_{col}":
                    button = item
                    break
            
            if button:
                button.style = discord.ButtonStyle.success
                button.disabled = True
            
            # Check for BINGO
            patterns = self.player.card.check_bingo()
            if patterns and not self.player.has_bingo:
                self.player.has_bingo = True
                self.player.winning_patterns = patterns
                self.game.winners.append(self.player)
                
                # Check if this ends the game
                if not self.game.game_ended:
                    self.game.game_ended = True
                    self.game.stop_auto_calling()
                    
                    # Announce winner
                    if self.game.game_channel:
                        await self._announce_winner(patterns)
                    
                    # Update main game view to show game ended
                    await self.game._update_main_game_view_end()
                    
                    # Update all interactive cards to show game ended
                    await self._update_all_interactive_cards_end_game()
                    
                    # Process game end
                    await self.game._process_game_end()
            
            # Create updated card image
            if self.game.game_ended:
                await self._update_card_display(interaction, f"🏁 Game Over! You marked {get_bingo_column(number)}-{number}")
            else:
                await self._update_card_display(interaction, f"✅ Marked {get_bingo_column(number)}-{number}!")
        
        return button_callback
    
    async def _update_card_display(self, interaction: discord.Interaction, message: str = None):
        """Update the visual card display after a button click."""
        try:
            # Create updated card image
            card_image = create_bingo_card_image(
                self.player.card.card, 
                self.player.card.marked,
                self.player.username,
                self.game.called_numbers
            )
            
            # Create file
            file = discord.File(card_image, filename=f"bingo_card_{self.user_id}.png")
            
            # Create embed
            embed = discord.Embed(
                title="🎯 Your Interactive BINGO Card",
                color=discord.Color.blue()
            )
            
            if message:
                embed.description = message
            
            if self.game.current_number:
                column = get_bingo_column(self.game.current_number)
                embed.add_field(
                    name="📢 Last Called",
                    value=f"**{column}-{self.game.current_number}**",
                    inline=True
                )
            
            embed.add_field(
                name="📊 Game Status",
                value=f"Numbers Called: {len(self.game.called_numbers)}/75\nPlayers: {len(self.game.players)}",
                inline=True
            )
            
            # Add comprehensive called numbers list for easy reference
            if self.game.called_numbers:
                # Show all called numbers organized by column
                called_by_column = {'B': [], 'I': [], 'N': [], 'G': [], 'O': []}
                for num in self.game.called_numbers:
                    column = get_bingo_column(num)
                    called_by_column[column].append(str(num))
                
                # Format by columns for easy reference
                column_display = []
                for letter in ['B', 'I', 'N', 'G', 'O']:
                    if called_by_column[letter]:
                        numbers = ", ".join(called_by_column[letter])
                        column_display.append(f"**{letter}**: {numbers}")
                    else:
                        column_display.append(f"**{letter}**: (none)")
                
                embed.add_field(
                    name="📋 All Called Numbers by Column",
                    value="\n".join(column_display),
                    inline=False
                )
            
            if self.player.has_bingo:
                embed.add_field(
                    name="🏆 BINGO!",
                    value=f"You got BINGO with: {', '.join(self.player.winning_patterns)}",
                    inline=False
                )
            
            embed.set_image(url=f"attachment://bingo_card_{self.user_id}.png")
            embed.set_footer(text="Click the number buttons below to mark them when called!")
            
            await interaction.edit_original_response(embed=embed, attachments=[file], view=self)
            
        except discord.NotFound:
            LOG.info(f"Webhook expired for interactive card {self.user_id}")
            # Remove from game's interactive views to stop future updates
            if self.user_id in self.game.interactive_views:
                del self.game.interactive_views[self.user_id]
        except discord.HTTPException as e:
            if "Unknown Webhook" in str(e) or "10015" in str(e):
                LOG.info(f"Unknown webhook error for interactive card {self.user_id}")
                # Remove from game's interactive views to stop future updates
                if self.user_id in self.game.interactive_views:
                    del self.game.interactive_views[self.user_id]
            else:
                LOG.error(f"HTTP error updating card display for {self.user_id}: {e}")
                try:
                    await interaction.followup.send("❌ Error updating your card!", ephemeral=True)
                except:
                    pass  # Followup might also fail if interaction is expired
        except Exception as e:
            LOG.error(f"Error updating card display: {e}")
            try:
                await interaction.followup.send("❌ Error updating your card!", ephemeral=True)
            except:
                pass  # Followup might also fail if interaction is expired
    
    async def _announce_winner(self, patterns: List[str]):
        """Announce the winner in the game channel."""
        try:
            embed = discord.Embed(
                title="🏆 BINGO! We have a winner!",
                color=discord.Color.gold()
            )
            
            if self.game.current_number:
                column = get_bingo_column(self.game.current_number)
                embed.description = f"Winning number: **{column}-{self.game.current_number}**"
            
            total_pot = len(self.game.players) * self.game.starter_bet
            embed.add_field(
                name="🏆 Winner",
                value=f"**{self.player.username}** wins {fmt(total_pot)}!",
                inline=False
            )
            
            embed.add_field(
                name="🎯 Winning Pattern",
                value=f"{', '.join(patterns)}",
                inline=False
            )
            
            embed.add_field(
                name="📊 Game Stats",
                value=f"Numbers Called: {len(self.game.called_numbers)}/75\nTotal Players: {len(self.game.players)}",
                inline=False
            )
            
            await self.game.game_channel.send(embed=embed)
            
        except Exception as e:
            LOG.error(f"Error announcing winner: {e}")
    
    async def _auto_update_card(self):
        """Auto-update the interactive card when new numbers are called."""
        if not self.stored_interaction or not self.interaction_created_at:
            return
        
        # Check if interaction has expired (15 minutes)
        if datetime.now() - self.interaction_created_at > timedelta(minutes=14):  # 14 minutes to be safe
            LOG.info(f"Skipping auto-update for {self.user_id} - interaction expired")
            # Remove from game's interactive views to stop future updates
            if self.user_id in self.game.interactive_views:
                del self.game.interactive_views[self.user_id]
            return
        
        try:
            # Create updated card image
            card_image = create_bingo_card_image(
                self.player.card.card, 
                self.player.card.marked,
                self.player.username,
                self.game.called_numbers
            )
            
            # Create file
            file = discord.File(card_image, filename=f"bingo_card_{self.user_id}.png")
            
            # Create embed with updated info
            embed = discord.Embed(
                title="🎮 Your Interactive BINGO Card",
                description="Click the number buttons below to mark them when called!",
                color=discord.Color.green()
            )
            
            if self.game.current_number:
                column = get_bingo_column(self.game.current_number)
                embed.add_field(
                    name="📢 Just Called",
                    value=f"**{column}-{self.game.current_number}**",
                    inline=True
                )
            
            embed.add_field(
                name="📊 Game Status",
                value=f"Numbers Called: {len(self.game.called_numbers)}/75\nPlayers: {len(self.game.players)}",
                inline=True
            )
            
            # Add comprehensive called numbers list for easy reference
            if self.game.called_numbers:
                # Show all called numbers organized by column
                called_by_column = {'B': [], 'I': [], 'N': [], 'G': [], 'O': []}
                for num in self.game.called_numbers:
                    column = get_bingo_column(num)
                    called_by_column[column].append(str(num))
                
                # Format by columns for easy reference
                column_display = []
                for letter in ['B', 'I', 'N', 'G', 'O']:
                    if called_by_column[letter]:
                        numbers = ", ".join(called_by_column[letter])
                        column_display.append(f"**{letter}**: {numbers}")
                    else:
                        column_display.append(f"**{letter}**: (none)")
                
                embed.add_field(
                    name="📋 All Called Numbers by Column",
                    value="\n".join(column_display),
                    inline=False
                )
            
            if self.player.has_bingo:
                embed.add_field(
                    name="🏆 BINGO!",
                    value=f"You got BINGO with: {', '.join(self.player.winning_patterns)}",
                    inline=False
                )
            
            embed.set_image(url=f"attachment://bingo_card_{self.user_id}.png")
            embed.set_footer(text="💡 Only click numbers that have been called! Green buttons are marked.")
            
            # Check if game has ended - if so, disable all buttons and update message
            if self.game.game_ended:
                # Disable all buttons
                for item in self.children:
                    if hasattr(item, 'disabled'):
                        item.disabled = True
                
                # Update embed for game end
                embed.title = "🏁 BINGO Game Ended"
                embed.color = discord.Color.red()
                
                # Show different message based on if this player won
                if self.player.has_bingo:
                    embed.description = "🎉 **CONGRATULATIONS! YOU WON!** 🎉\nHere's your winning BINGO card!"
                    embed.add_field(
                        name="🏆 Your Winning Pattern",
                        value=f"{', '.join(self.player.winning_patterns)}",
                        inline=False
                    )
                else:
                    embed.description = "Game is over! Someone else got BINGO first.\nHere's your final card state."
                    
                    # Show who won
                    if self.game.winners:
                        winner_names = [w.username for w in self.game.winners]
                        embed.add_field(
                            name="🏆 Winner(s)",
                            value=", ".join(winner_names),
                            inline=False
                        )
                
                # Update the message without buttons
                try:
                    await self.stored_interaction.edit_original_response(embed=embed, attachments=[file], view=None)
                except (discord.NotFound, discord.HTTPException) as e:
                    if "Unknown Webhook" in str(e) or "10015" in str(e):
                        LOG.info(f"Webhook expired for interactive card {self.user_id}, removing from auto-updates")
                        if self.user_id in self.game.interactive_views:
                            del self.game.interactive_views[self.user_id]
                    else:
                        raise
            else:
                # Update the message normally
                try:
                    await self.stored_interaction.edit_original_response(embed=embed, attachments=[file], view=self)
                except (discord.NotFound, discord.HTTPException) as e:
                    if "Unknown Webhook" in str(e) or "10015" in str(e):
                        LOG.info(f"Webhook expired for interactive card {self.user_id}, removing from auto-updates")
                        if self.user_id in self.game.interactive_views:
                            del self.game.interactive_views[self.user_id]
                    else:
                        raise
            
        except Exception as e:
            LOG.error(f"Error auto-updating interactive card: {e}")
    
    async def _update_all_interactive_cards_end_game(self):
        """Update all interactive cards when the game ends."""
        for user_id, interactive_view in self.game.interactive_views.items():
            try:
                await interactive_view._auto_update_card()
            except Exception as e:
                LOG.error(f"Error updating interactive card for end game {user_id}: {e}")

class BingoAutoGameView(View):
    """Automatic BINGO game interface with visual cards."""
    
    def __init__(self, game: BingoGameState):
        super().__init__(timeout=1800)  # 30 minute timeout
        self.game = game
    
    @discord.ui.button(label="Show My Card", style=discord.ButtonStyle.success, emoji="🎯")
    async def show_card(self, interaction: discord.Interaction, button: Button):
        user_id = str(interaction.user.id)
        
        if user_id not in self.game.players:
            try:
                await interaction.response.send_message("❌ You're not in this game!", ephemeral=True)
            except (discord.NotFound, discord.HTTPException):
                LOG.info("Could not respond to show_card interaction - webhook expired")
            return
        
        player = self.game.players[user_id]
        
        # Store interaction for future updates
        self.game.player_interactions[user_id] = interaction
        self.game.player_interaction_times[user_id] = datetime.now()
        
        try:
            # Create card image
            card_image = create_bingo_card_image(
                player.card.card, 
                player.card.marked,
                player.username,
                self.game.called_numbers
            )
            
            # Create file
            file = discord.File(card_image, filename=f"bingo_card_{user_id}.png")
            
            # Create embed
            embed = discord.Embed(
                title="🎯 Your BINGO Card",
                description="This card will update automatically as numbers are called!",
                color=discord.Color.blue()
            )
            
            if self.game.current_number:
                column = get_bingo_column(self.game.current_number)
                embed.add_field(
                    name="📢 Last Called",
                    value=f"**{column}-{self.game.current_number}**",
                    inline=True
                )
            
            embed.add_field(
                name="📊 Game Status",
                value=f"Numbers Called: {len(self.game.called_numbers)}/75\nPlayers: {len(self.game.players)}",
                inline=True
            )
            
            if player.has_bingo:
                embed.add_field(
                    name="🏆 BINGO!",
                    value="You have BINGO! Congratulations!",
                    inline=False
                )
            
            embed.set_image(url=f"attachment://bingo_card_{user_id}.png")
            
            await interaction.response.send_message(embed=embed, file=file, ephemeral=True)
            
        except discord.NotFound:
            LOG.info(f"Webhook expired for show_card request")
        except discord.HTTPException as e:
            if "Unknown Webhook" in str(e) or "10015" in str(e):
                LOG.info(f"Unknown webhook error for show_card request")
            else:
                LOG.error(f"HTTP error showing card: {e}")
        except Exception as e:
            LOG.error(f"Error showing card: {e}")
            try:
                await interaction.followup.send("❌ Error creating your BINGO card!", ephemeral=True)
            except (discord.NotFound, discord.HTTPException):
                LOG.info("Could not send error message - webhook expired")
    
    @discord.ui.button(label="Interactive Card", style=discord.ButtonStyle.primary, emoji="🎮")
    async def show_interactive_card(self, interaction: discord.Interaction, button: Button):
        user_id = str(interaction.user.id)
        
        if user_id not in self.game.players:
            try:
                await interaction.response.send_message("❌ You're not in this game!", ephemeral=True)
            except (discord.NotFound, discord.HTTPException):
                LOG.info("Could not respond to interactive card interaction - webhook expired")
            return
        
        player = self.game.players[user_id]
        
        try:
            # Create interactive card view
            interactive_view = BingoInteractiveCardView(self.game, player)
            
            # Create card image
            card_image = create_bingo_card_image(
                player.card.card, 
                player.card.marked,
                player.username,
                self.game.called_numbers
            )
            
            # Create file
            file = discord.File(card_image, filename=f"bingo_card_{user_id}.png")
            
            # Create embed
            embed = discord.Embed(
                title="🎮 Your Interactive BINGO Card",
                description="Click the number buttons below to mark them when called!",
                color=discord.Color.green()
            )
            
            if self.game.current_number:
                column = get_bingo_column(self.game.current_number)
                embed.add_field(
                    name="📢 Last Called",
                    value=f"**{column}-{self.game.current_number}**",
                    inline=True
                )
            
            embed.add_field(
                name="📊 Game Status",
                value=f"Numbers Called: {len(self.game.called_numbers)}/75\nPlayers: {len(self.game.players)}",
                inline=True
            )
            
            # Add comprehensive called numbers list for easy reference
            if self.game.called_numbers:
                # Show all called numbers organized by column
                called_by_column = {'B': [], 'I': [], 'N': [], 'G': [], 'O': []}
                for num in self.game.called_numbers:
                    column = get_bingo_column(num)
                    called_by_column[column].append(str(num))
                
                # Format by columns for easy reference
                column_display = []
                for letter in ['B', 'I', 'N', 'G', 'O']:
                    if called_by_column[letter]:
                        numbers = ", ".join(called_by_column[letter])
                        column_display.append(f"**{letter}**: {numbers}")
                    else:
                        column_display.append(f"**{letter}**: (none)")
                
                embed.add_field(
                    name="📋 All Called Numbers by Column",
                    value="\n".join(column_display),
                    inline=False
                )
            
            if player.has_bingo:
                embed.add_field(
                    name="🏆 BINGO!",
                    value="You have BINGO! Congratulations!",
                    inline=False
                )
            
            embed.set_image(url=f"attachment://bingo_card_{user_id}.png")
            embed.set_footer(text="💡 Only click numbers that have been called! Green buttons are marked.")
            
            # Store the interactive view for auto-updates
            self.game.interactive_views[user_id] = interactive_view
            interactive_view.stored_interaction = interaction
            interactive_view.interaction_created_at = datetime.now()
            
            await interaction.response.send_message(embed=embed, file=file, view=interactive_view, ephemeral=True)
            
        except discord.NotFound:
            LOG.info(f"Webhook expired for interactive card request")
        except discord.HTTPException as e:
            if "Unknown Webhook" in str(e) or "10015" in str(e):
                LOG.info(f"Unknown webhook error for interactive card request")
            else:
                LOG.error(f"HTTP error showing interactive card: {e}")
        except Exception as e:
            LOG.error(f"Error showing interactive card: {e}")
            try:
                await interaction.followup.send("❌ Error creating your interactive BINGO card!", ephemeral=True)
            except (discord.NotFound, discord.HTTPException):
                LOG.info("Could not send error message - webhook expired")
    
    @discord.ui.button(label="Game Status", style=discord.ButtonStyle.secondary, emoji="📊")
    async def game_status(self, interaction: discord.Interaction, button: Button):
        try:
            # Create game status image
            status_image = create_game_status_image(
                self.game.called_numbers,
                self.game.current_number,
                len(self.game.players) * self.game.starter_bet,
                len(self.game.players)
            )
            
            file = discord.File(status_image, filename="bingo_status.png")
            
            embed = discord.Embed(
                title="📊 BINGO Game Status",
                color=discord.Color.blue()
            )
            
            if self.game.current_number:
                column = get_bingo_column(self.game.current_number)
                embed.add_field(
                    name="📢 Current Number",
                    value=f"**{column}-{self.game.current_number}**",
                    inline=True
                )
            
            embed.add_field(
                name="🎮 Game Progress",
                value=f"Numbers Called: {len(self.game.called_numbers)}/75\nActive Players: {len([p for p in self.game.players.values() if not p.has_bingo])}",
                inline=True
            )
            
            if self.game.winners:
                winner_names = [w.username for w in self.game.winners]
                embed.add_field(
                    name="🏆 Winners",
                    value=", ".join(winner_names),
                    inline=False
                )
            
            embed.set_image(url="attachment://bingo_status.png")
            
            await interaction.response.send_message(embed=embed, file=file, ephemeral=True)
            
        except discord.NotFound:
            LOG.info(f"Webhook expired for game status request")
        except discord.HTTPException as e:
            if "Unknown Webhook" in str(e) or "10015" in str(e):
                LOG.info(f"Unknown webhook error for game status request")
            else:
                LOG.error(f"HTTP error showing game status: {e}")
        except Exception as e:
            LOG.error(f"Error showing game status: {e}")
            try:
                await interaction.followup.send("❌ Error creating game status!", ephemeral=True)
            except (discord.NotFound, discord.HTTPException):
                LOG.info("Could not send error message - webhook expired")

class BingoGameView(View):
    """Main BINGO game interface."""
    
    def __init__(self, game: BingoGameState):
        super().__init__(timeout=1800)  # 30 minute timeout
        self.game = game
    
    @discord.ui.button(label="Call Number", style=discord.ButtonStyle.primary, emoji="📢")
    async def call_number(self, interaction: discord.Interaction, button: Button):
        if self.game.game_ended:
            try:
                await interaction.response.send_message("❌ Game has ended!", ephemeral=True)
            except (discord.NotFound, discord.HTTPException):
                LOG.info("Could not respond to call_number interaction - webhook expired")
            return
        
        number = self.game.call_next_number()
        if number is None:
            # No more numbers - game should end
            embed = self._create_game_over_embed("No more numbers to call!")
            await interaction.response.edit_message(embed=embed, view=None)
            await self._process_game_end()
            return
        
        # Check for new winners
        new_winners = self.game.check_winners()
        
        if new_winners:
            # We have winner(s)!
            self.game.game_ended = True
            embed = self._create_winner_embed(new_winners, number)
            await interaction.response.edit_message(embed=embed, view=None)
            await self._process_game_end()
        else:
            # Continue game
            embed = self._create_game_embed(f"Called: **{self.game.get_number_column(number)}-{number}**")
            await interaction.response.edit_message(embed=embed, view=self)
    
    @discord.ui.button(label="Show My Card", style=discord.ButtonStyle.success, emoji="🎯")
    async def show_card(self, interaction: discord.Interaction, button: Button):
        user_id = str(interaction.user.id)
        
        if user_id not in self.game.players:
            try:
                await interaction.response.send_message("❌ You're not in this game!", ephemeral=True)
            except (discord.NotFound, discord.HTTPException):
                LOG.info("Could not respond to show_card interaction - webhook expired")
            return
        
        player = self.game.players[user_id]
        embed = discord.Embed(
            title="🎯 Your BINGO Card",
            description=player.card.get_card_display(),
            color=discord.Color.blue()
        )
        
        if self.game.called_numbers:
            embed.add_field(
                name="📢 Called Numbers",
                value=" | ".join([f"{self.game.get_number_column(n)}-{n}" for n in self.game.called_numbers[-10:]]) + ("..." if len(self.game.called_numbers) > 10 else ""),
                inline=False
            )
        
        try:
            await interaction.response.send_message(embed=embed, ephemeral=True)
        except (discord.NotFound, discord.HTTPException):
            LOG.info("Could not respond to show_card interaction - webhook expired")
    
    def _create_game_embed(self, notification: str = None) -> discord.Embed:
        embed = discord.Embed(
            title="🎯 Multiplayer BINGO Game",
            color=discord.Color.blue()
        )
        
        if notification:
            embed.description = notification
        
        # Current number
        if self.game.current_number:
            column = self.game.get_number_column(self.game.current_number)
            embed.add_field(
                name="📢 Current Number",
                value=f"**{column}-{self.game.current_number}**",
                inline=True
            )
        
        # Game stats
        embed.add_field(
            name="📊 Game Stats",
            value=f"Players: {len(self.game.players)}\nNumbers Called: {len(self.game.called_numbers)}/75",
            inline=True
        )
        
        # Prize pool
        total_pot = len(self.game.players) * self.game.starter_bet
        embed.add_field(
            name="💰 Prize Pool",
            value=fmt(total_pot),
            inline=True
        )
        
        # Recent numbers
        if self.game.called_numbers:
            recent = self.game.called_numbers[-5:]
            recent_str = " | ".join([f"{self.game.get_number_column(n)}-{n}" for n in recent])
            embed.add_field(
                name="📝 Recent Numbers",
                value=recent_str,
                inline=False
            )
        
        # Players status
        active_players = [p.username for p in self.game.players.values() if not p.has_bingo]
        winner_players = [p.username for p in self.game.players.values() if p.has_bingo]
        
        status_lines = []
        if active_players:
            status_lines.append(f"🎯 **Active:** {', '.join(active_players[:5])}")
            if len(active_players) > 5:
                status_lines.append(f"... and {len(active_players) - 5} more")
        
        if winner_players:
            status_lines.append(f"🏆 **Winners:** {', '.join(winner_players)}")
        
        if status_lines:
            embed.add_field(name="👥 Players", value="\n".join(status_lines), inline=False)
        
        return embed
    
    def _create_winner_embed(self, winners: List[BingoPlayer], winning_number: int) -> discord.Embed:
        embed = discord.Embed(
            title="🏆 BINGO! We have winner(s)!",
            color=discord.Color.gold()
        )
        
        column = self.game.get_number_column(winning_number)
        embed.description = f"Winning number: **{column}-{winning_number}**"
        
        # Prize distribution
        total_pot = len(self.game.players) * self.game.starter_bet
        if len(winners) == 1:
            prize_per_winner = total_pot
            embed.add_field(
                name="🏆 Winner",
                value=f"**{winners[0].username}** wins {fmt(prize_per_winner)}!",
                inline=False
            )
        else:
            prize_per_winner = total_pot / len(winners)
            winner_names = [f"**{w.username}**" for w in winners]
            embed.add_field(
                name=f"🏆 {len(winners)} Winners",
                value=f"{', '.join(winner_names)}\nEach wins {fmt(prize_per_winner)}!",
                inline=False
            )
        
        # Show winning patterns
        pattern_lines = []
        for winner in winners:
            patterns_str = ", ".join(winner.winning_patterns)
            pattern_lines.append(f"**{winner.username}:** {patterns_str}")
        
        embed.add_field(
            name="🎯 Winning Patterns",
            value="\n".join(pattern_lines),
            inline=False
        )
        
        embed.add_field(
            name="📊 Game Stats",
            value=f"Numbers Called: {len(self.game.called_numbers)}\nTotal Players: {len(self.game.players)}",
            inline=False
        )
        
        return embed
    
    def _create_game_over_embed(self, reason: str) -> discord.Embed:
        embed = discord.Embed(
            title="🎯 BINGO Game Over",
            description=reason,
            color=discord.Color.red()
        )
        
        # Refund all players
        embed.add_field(
            name="💰 Refunds",
            value="All players will be refunded their bet amount.",
            inline=False
        )
        
        return embed
    
    async def _process_game_end(self):
        """Process the end of the game - distribute prizes and update stats."""
        guild_id = self.game.guild_id
        
        if self.game.winners:
            # Distribute prizes
            total_pot = len(self.game.players) * self.game.starter_bet
            prize_per_winner = total_pot / len(self.game.winners)
            
            for winner in self.game.winners:
                # Give prize
                await db_manager.adjust_wallet(winner.user_id, guild_id, prize_per_winner)
                # Record win
                await db_manager.record_game_result(
                    winner.user_id, guild_id, "bingo", True, 
                    self.game.starter_bet, prize_per_winner - self.game.starter_bet
                )
            
            # Record losses for non-winners
            for player in self.game.players.values():
                if player not in self.game.winners:
                    await db_manager.record_game_result(
                        player.user_id, guild_id, "bingo", False,
                        self.game.starter_bet, -self.game.starter_bet
                    )
        else:
            # No winners - refund everyone
            for player in self.game.players.values():
                await db_manager.adjust_wallet(player.user_id, guild_id, self.game.starter_bet)
        
        # Remove game from manager
        bingo_manager.remove_game(self.game.channel_id)

class BingoCommands(Cog):
    """BINGO game commands."""

    def __init__(self, bot):
        self.bot = bot
    
    @app_commands.command(name="bingo", description="🎯 Start a multiplayer BINGO game")
    @app_commands.describe(bet="Bet amount for all players (e.g., 100, 500, 1k)")
    async def bingo_command(self, interaction: discord.Interaction, bet: str):
        # Defer the response to prevent timeout
        await interaction.response.defer()
        
        guild_id = await get_guild_id(interaction)
        channel_id = str(interaction.channel.id)
        user_id = str(interaction.user.id)
        
        # Check if there's already a game in this channel
        if channel_id in bingo_manager.games:
            game = bingo_manager.games[channel_id]
            if game.game_active:
                # Show current game
                game_view = BingoGameView(game)
                embed = game_view._create_game_embed()
                await interaction.followup.send(embed=embed, view=game_view)
                return
            elif game.waiting_for_players:
                # Show existing lobby
                lobby_view = BingoLobbyView(game)
                embed = lobby_view._create_lobby_embed()
                await interaction.followup.send(embed=embed, view=lobby_view)
                return
        
        # Parse bet amount
        try:
            wallet, bank = await db_manager.get_balances(user_id, guild_id)
            bet_amount = parse_amount(bet, wallet)
            
            if bet_amount < 50.0:  # Minimum bet
                await interaction.followup.send(f"❌ Minimum bet is {fmt(50)}!", ephemeral=True)
                return
            
            if bet_amount > 10000.0:  # Maximum bet
                await interaction.followup.send(f"❌ Maximum bet is {fmt(10000)}!", ephemeral=True)
                return
                
        except Exception:
            await interaction.followup.send("❌ Invalid bet amount!", ephemeral=True)
            return
        
        # Check balance
        if wallet < bet_amount:
            await interaction.followup.send(f"❌ You need {fmt(bet_amount)} but only have {fmt(wallet)}!", ephemeral=True)
            return
        
        # Deduct bet from starter
        success, new_balance = await db_manager.adjust_wallet(user_id, guild_id, -bet_amount)
        if not success:
            await interaction.followup.send("❌ Failed to deduct bet amount!", ephemeral=True)
            return
        
        # Create new game
        game = bingo_manager.get_or_create_game(channel_id, guild_id, bet_amount)
        success = game.add_player(user_id, f"<@{interaction.user.id}>")
        
        if not success:
            # Refund if couldn't create game
            await db_manager.adjust_wallet(user_id, guild_id, bet_amount)
            await interaction.followup.send("❌ Failed to create game!", ephemeral=True)
            return
        
        # Show lobby
        lobby_view = BingoLobbyView(game)
        embed = lobby_view._create_lobby_embed(f"🎯 **<@{interaction.user.id}>** started a BINGO game!")
        
        await interaction.followup.send(embed=embed, view=lobby_view)
    
    @app_commands.command(name="bingohelp", description="🎯 Learn how to play BINGO")
    async def bingo_help_command(self, interaction: discord.Interaction):
        embed = discord.Embed(
            title="🎯 Multiplayer BINGO Guide",
            description="Learn how to play BINGO in Discord!",
            color=discord.Color.blue()
        )
        
        # Basic Info
        embed.add_field(
            name="🎮 Game Overview",
            value=(
                "• **Players**: 2-20 per game\n"
                "• **Buy-in**: $50 - $10,000 (set by game starter)\n"
                "• **Goal**: Get 5 numbers in a row on your card\n"
                "• **Prize**: Winner(s) split the total pot"
            ),
            inline=False
        )
        
        # How to Play
        embed.add_field(
            name="🚀 How to Play",
            value=(
                "1. Use `/bingo <amount>` to start a game\n"
                "2. Other players click **Join Game** to enter\n"
                "3. Click **Start Game** when 2+ players joined\n"
                "4. Click **Interactive Card** to get your clickable BINGO card\n"
                "5. Numbers are called **automatically** every 3 seconds\n"
                "6. **Click the number buttons** to mark called numbers\n"
                "7. First to get BINGO wins the pot!"
            ),
            inline=False
        )
        
        # BINGO Card
        embed.add_field(
            name="🎯 BINGO Card Layout",
            value=(
                "```\n"
                " B   I   N   G   O \n"
                "---+---+---+---+---\n"
                " 1 | 16| 31| 46| 61\n"
                " 2 | 17|FREE| 47| 62\n"
                " 3 | 18| 33| 48| 63\n"
                "```\n"
                "**B**: 1-15, **I**: 16-30, **N**: 31-45, **G**: 46-60, **O**: 61-75\n"
                "Center space is **FREE** (always marked)"
            ),
            inline=False
        )
        
        # Winning Patterns
        embed.add_field(
            name="🏆 Winning Patterns",
            value=(
                "Get **5 in a row** to win:\n"
                "• **Horizontal** - Any complete row\n"
                "• **Vertical** - Any complete column\n"
                "• **Diagonal** - Corner to corner\n"
                "\n*Multiple winners split the prize equally*"
            ),
            inline=True
        )
        
        # Tips
        embed.add_field(
            name="💡 New Features",
            value=(
                "• **Interactive cards** with clickable number buttons\n"
                "• **Visual cards** with Pillow-generated images\n"
                "• **Red chips** appear on marked numbers\n"
                "• **Manual marking** - click buttons to mark numbers\n"
                "• **Automatic calling** every 3 seconds\n"
                "• **Real-time validation** prevents wrong clicks\n"
                "• **Ephemeral messages** - only you see your card"
            ),
            inline=True
        )
        
        # Prize Structure
        embed.add_field(
            name="💰 Prize Structure",
            value=(
                "• **Single Winner**: Takes entire pot\n"
                "• **Multiple Winners**: Split pot equally\n"
                "• **No Winner**: Everyone refunded\n"
                "• **Example**: 4 players × $100 = $400 pot\n"
                "• Stats tracked for `/mystats`"
            ),
            inline=False
        )
        
        embed.set_footer(text="💡 Use /bingo <amount> to start playing! Good luck! 🍀")
        
        await interaction.followup.send(embed=embed, ephemeral=True)
    

async def setup(bot):
    await bot.add_cog(BingoCommands(bot))
