"""
Word Chain Game - A multiplayer word game where players say words that start with the last letter of the previous word.

Players:
- Take turns saying words that start with the last letter of the previous word
- Can join without contributing to pot
- Host sets pot amount and number of lives
- Game validates words using a word API
- Players lose lives for invalid words or timeout
- Last player standing wins the pot
"""

import discord
from discord import app_commands
from discord.ext import commands
from discord.ext.commands import Cog
from discord.ui import View, Button, Modal, TextInput
import asyncio
import aiohttp
import logging
from typing import Dict, List, Optional, Set
from utils.firebase_database import db_manager
from utils.common import fmt, get_guild_id, game_registry, check_maintenance_mode
from datetime import datetime, timedelta

LOG = logging.getLogger("wordchain")

# ========================= WORD VALIDATION =========================

class WordValidator:
    """Validates words using dictionary API."""
    
    def __init__(self):
        self.session = None
        self.cache = {}  # Simple word cache to avoid repeated API calls
    
    async def get_session(self):
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession()
        return self.session
    
    async def is_valid_word(self, word: str) -> bool:
        """Check if a word is valid using dictionary API."""
        word = word.lower().strip()
        
        # Check cache first
        if word in self.cache:
            return self.cache[word]
        
        # Basic validation - must be alphabetic and at least 2 characters
        if not word.isalpha() or len(word) < 2:
            self.cache[word] = False
            return False
        
        try:
            session = await self.get_session()
            # Use Free Dictionary API
            url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{word}"
            
            async with session.get(url, timeout=5) as response:
                if response.status == 200:
                    self.cache[word] = True
                    return True
                else:
                    self.cache[word] = False
                    return False
        except Exception as e:
            LOG.warning(f"Word validation failed for '{word}': {e}")
            # Fallback: allow common words if API fails
            common_words = {
                'cat', 'dog', 'house', 'tree', 'book', 'game', 'time', 'water', 
                'fire', 'earth', 'air', 'love', 'life', 'word', 'play', 'work'
            }
            is_valid = word in common_words
            self.cache[word] = is_valid
            return is_valid
    
    async def close(self):
        if self.session and not self.session.closed:
            await self.session.close()

# Global validator instance
word_validator = WordValidator()

# ========================= GAME CLASSES =========================

class WordChainPlayer:
    """Represents a player in the word chain game."""
    
    def __init__(self, user: discord.User, paid_pot: bool = False):
        self.user = user
        self.lives = 3  # Default lives, will be set by host
        self.paid_pot = paid_pot
        self.is_eliminated = False
        self.words_used = []
        self.last_active = datetime.now()
    
    @property
    def mention(self) -> str:
        return f"<@{self.user.id}>"
    
    def lose_life(self):
        """Remove a life from the player."""
        self.lives -= 1
        if self.lives <= 0:
            self.is_eliminated = True
    
    def get_status_emoji(self) -> str:
        """Get status emoji for display."""
        if self.is_eliminated:
            return "💀"
        elif self.lives == 1:
            return "💔"
        elif self.lives == 2:
            return "💛"
        else:
            return "💚"

class WordChainGame:
    """Manages a word chain game session."""
    
    def __init__(self, channel_id: str, guild_id: str, host: discord.User):
        self.channel_id = channel_id
        self.guild_id = guild_id
        self.host = host
        self.players: Dict[int, WordChainPlayer] = {}
        self.state = "waiting"  # waiting, playing, finished
        self.pot_amount = 0.0
        self.pot_enabled = False
        self.lives_per_player = 3
        self.current_word = "WORD"  # Starting word
        self.current_player_id = None
        self.used_words: Set[str] = {"word"}  # Add starting word to used words (set for fast lookup)
        self.word_chain: List[str] = ["word"]  # Ordered list for display
        self.turn_timeout = 30  # seconds per turn (configurable)
        self.game_message = None
        self.turn_start_time = None
        self.turn_message = None  # Store current turn notification message for countdown updates
        self.last_letter = "d"  # Starting letter from "WORD"
        
        # Add host as first player
        self.add_player(host, paid_pot=False)
    
    def add_player(self, user: discord.User, paid_pot: bool = False) -> bool:
        """Add a player to the game."""
        if len(self.players) >= 10:  # Max 10 players
            return False
        
        if user.id in self.players:
            return False
        
        player = WordChainPlayer(user, paid_pot)
        player.lives = self.lives_per_player
        self.players[user.id] = player
        return True
    
    def remove_player(self, user: discord.User) -> bool:
        """Remove a player from the game."""
        if user.id not in self.players:
            return False
        
        if self.state == "waiting":
            del self.players[user.id]
            return True
        return False
    
    def can_start(self) -> bool:
        """Check if game can start."""
        return len(self.players) >= 2 and self.state == "waiting"
    
    def start_game(self) -> bool:
        """Start the word chain game."""
        if not self.can_start():
            return False
        
        self.state = "playing"
        self.used_words.clear()
        
        # Start with first player
        active_players = [p for p in self.players.values() if not p.is_eliminated]
        if active_players:
            self.current_player_id = active_players[0].user.id
            self.turn_start_time = datetime.now()
        
        return True
    
    def get_current_player(self) -> Optional[WordChainPlayer]:
        """Get the current player."""
        return self.players.get(self.current_player_id)
    
    def get_active_players(self) -> List[WordChainPlayer]:
        """Get list of active (non-eliminated) players."""
        return [p for p in self.players.values() if not p.is_eliminated]
    
    def next_turn(self):
        """Move to the next player's turn."""
        active_players = self.get_active_players()
        if len(active_players) <= 1:
            self.state = "finished"
            return
        
        # Find current player index
        current_index = 0
        for i, player in enumerate(active_players):
            if player.user.id == self.current_player_id:
                current_index = i
                break
        
        # Move to next player
        next_index = (current_index + 1) % len(active_players)
        self.current_player_id = active_players[next_index].user.id
        self.turn_start_time = datetime.now()
    
    def is_valid_word_for_chain(self, word: str) -> tuple[bool, str]:
        """Check if word is valid for the current chain."""
        word = word.lower().strip()
        
        # Debug logging
        LOG.debug(f"Checking word: '{word}', used_words: {self.used_words}")
        
        # Check if word was already used (case-insensitive)
        if word in self.used_words:
            return False, "Word already used!"
        
        # Check if word starts with the required letter
        if self.last_letter and not word.startswith(self.last_letter.lower()):
            return False, f"Word must start with '{self.last_letter.upper()}'!"
        
        return True, ""
    
    async def submit_word(self, player_id: int, word: str) -> tuple[bool, str, bool]:
        """Submit a word for the current player. Returns (success, message, game_ended)."""
        if self.state != "playing":
            return False, "Game is not active!", False
        
        if player_id != self.current_player_id:
            return False, "It's not your turn!", False
        
        player = self.players.get(player_id)
        if not player or player.is_eliminated:
            return False, "Player not found or eliminated!", False
        
        word = word.lower().strip()
        
        # Check if word is valid for chain
        valid_chain, chain_error = self.is_valid_word_for_chain(word)
        if not valid_chain:
            return False, chain_error, False
        
        # Validate word with dictionary
        if not await word_validator.is_valid_word(word):
            return False, "Not a valid English word!", False
        
        # Word is valid!
        word_lower = word.lower()
        self.used_words.add(word_lower)  # Ensure lowercase for fast lookup
        self.word_chain.append(word_lower)  # Add to ordered list
        self.current_word = word.upper()
        self.last_letter = word[-1].lower()
        player.words_used.append(word_lower)  # Store in lowercase for consistency
        player.last_active = datetime.now()
        
        # Debug logging
        LOG.debug(f"Added word '{word_lower}' to used_words. Total: {len(self.used_words)}, Chain: {self.word_chain[-3:]}")
        
        # Move to next turn
        self.next_turn()
        
        # Check if game ended
        active_players = self.get_active_players()
        if len(active_players) <= 1:
            self.state = "finished"
            return True, f"**{word.upper()}** accepted!", True
        
        return True, f"**{word.upper()}** accepted!", False
    
    def handle_timeout(self, player_id: int):
        """Handle a player timeout."""
        player = self.players.get(player_id)
        if player and not player.is_eliminated:
            player.lose_life()
            if not player.is_eliminated:
                self.next_turn()
            else:
                # Check if game should end
                active_players = self.get_active_players()
                if len(active_players) <= 1:
                    self.state = "finished"
                else:
                    self.next_turn()
    
    def get_winner(self) -> Optional[WordChainPlayer]:
        """Get the game winner."""
        active_players = self.get_active_players()
        return active_players[0] if len(active_players) == 1 else None
    
    def get_total_pot(self) -> float:
        """Calculate total pot from paying players."""
        if not self.pot_enabled:
            return 0.0
        
        paying_players = [p for p in self.players.values() if p.paid_pot]
        return self.pot_amount * len(paying_players)
    
    async def send_turn_notification(self, channel) -> None:
        """Send a turn notification with countdown timer."""
        current_player = self.get_current_player()
        if not current_player:
            return
        
        # Calculate remaining time
        remaining = self.turn_timeout
        if self.turn_start_time:
            elapsed = (datetime.now() - self.turn_start_time).total_seconds()
            remaining = max(0, self.turn_timeout - elapsed)
        
        # Create initial message with timer
        message_text = (
            f"🔗 {current_player.mention}, your turn! "
            f"The last word was **{self.current_word}**. "
            f"Send a word starting with **{self.last_letter.upper()}**!\n"
            f"⏰ **{int(remaining)}s remaining**"
        )
        
        try:
            if self.turn_message:
                # Update existing message
                await self.turn_message.edit(content=message_text)
            else:
                # Send new message
                self.turn_message = await channel.send(message_text)
        except Exception as e:
            LOG.error(f"Failed to send/update turn notification: {e}")
    
    def get_turn_notification_text(self) -> str:
        """Get the current turn notification text with countdown."""
        current_player = self.get_current_player()
        if not current_player:
            return ""
        
        # Calculate remaining time
        remaining = self.turn_timeout
        if self.turn_start_time:
            elapsed = (datetime.now() - self.turn_start_time).total_seconds()
            remaining = max(0, self.turn_timeout - elapsed)
        
        return (
            f"🔗 {current_player.mention}, your turn! "
            f"The last word was **{self.current_word}**. "
            f"Send a word starting with **{self.last_letter.upper()}**!\n"
            f"⏰ **{int(remaining)}s remaining**"
        )

# ========================= GAME MANAGER =========================

class WordChainManager:
    """Manages word chain game sessions."""
    
    def __init__(self):
        self.games: Dict[str, WordChainGame] = {}
        self.user_games: Dict[int, str] = {}  # user_id -> channel_id
    
    def get_or_create_game(self, channel_id: str, guild_id: str, host: discord.User) -> WordChainGame:
        """Get existing game or create new one."""
        if channel_id not in self.games:
            game = WordChainGame(channel_id, guild_id, host)
            self.games[channel_id] = game
            self.user_games[host.id] = channel_id
        return self.games[channel_id]
    
    def get_game(self, channel_id: str) -> Optional[WordChainGame]:
        """Get game by channel ID."""
        return self.games.get(channel_id)
    
    def get_user_game(self, user_id: int) -> Optional[WordChainGame]:
        """Get game that user is in."""
        channel_id = self.user_games.get(user_id)
        return self.games.get(channel_id) if channel_id else None
    
    def remove_player_from_game(self, user_id: int):
        """Remove player from their current game."""
        if user_id in self.user_games:
            channel_id = self.user_games[user_id]
            game = self.games.get(channel_id)
            if game and user_id in game.players:
                game.remove_player(game.players[user_id].user)
                if len(game.players) == 0:
                    del self.games[channel_id]
            del self.user_games[user_id]
    
    def remove_game(self, channel_id: str):
        """Remove a game completely."""
        if channel_id in self.games:
            game = self.games[channel_id]
            # Remove all players from user_games mapping
            for player_id in game.players.keys():
                if player_id in self.user_games:
                    del self.user_games[player_id]
            del self.games[channel_id]

# Global manager instance
wordchain_manager = WordChainManager()

# ========================= MODALS =========================

# Removed WordSubmissionModal - game is now channel-based

class GameSettingsModal(Modal):
    """Modal for configuring game settings."""
    
    def __init__(self, view):
        super().__init__(title="Game Settings")
        self.view = view
        
        self.pot_input = TextInput(
            label="Pot Amount (0 to disable)",
            placeholder="e.g., 100, 500, 1000",
            default=str(int(view.game.pot_amount)),
            min_length=1,
            max_length=10
        )
        
        self.lives_input = TextInput(
            label="Lives per Player",
            placeholder="e.g., 3, 5, 10",
            default=str(view.game.lives_per_player),
            min_length=1,
            max_length=2
        )
        
        self.timeout_input = TextInput(
            label="Seconds per Turn",
            placeholder="e.g., 15, 30, 60",
            default=str(view.game.turn_timeout),
            min_length=1,
            max_length=3
        )
        
        self.add_item(self.pot_input)
        self.add_item(self.lives_input)
        self.add_item(self.timeout_input)
    
    async def on_submit(self, interaction: discord.Interaction):
        try:
            pot_amount = float(self.pot_input.value.strip())
            lives = int(self.lives_input.value.strip())
            timeout = int(self.timeout_input.value.strip())
            
            if pot_amount < 0 or lives < 1 or lives > 20 or timeout < 5 or timeout > 300:
                await interaction.response.send_message(
                    "❌ Invalid settings! Pot must be ≥ 0, lives must be 1-20, timeout must be 5-300 seconds.",
                    ephemeral=True
                )
                return
            
            self.view.game.pot_amount = pot_amount
            self.view.game.pot_enabled = pot_amount > 0
            self.view.game.lives_per_player = lives
            self.view.game.turn_timeout = timeout
            
            # Update existing players' lives
            for player in self.view.game.players.values():
                player.lives = lives
            
            await interaction.response.send_message(
                f"✅ Settings updated! Pot: {fmt(pot_amount)}, Lives: {lives}, Timeout: {timeout}s",
                ephemeral=True
            )
            
            await self.view.update_display()
            
        except ValueError:
            await interaction.response.send_message(
                "❌ Invalid input! Please enter valid numbers.",
                ephemeral=True
            )

# ========================= VIEWS =========================

class WordChainGameView(View):
    """Main view for word chain game."""
    
    def __init__(self, game: WordChainGame):
        super().__init__(timeout=1800)  # 30 minute timeout
        self.game = game
        self.game.view = self  # Store reference for updates
        self._setup_buttons()
    
    def _setup_buttons(self):
        """Setup buttons based on game state."""
        self.clear_items()
        
        if self.game.state == "waiting":
            # Waiting for players - show join/leave/start/settings buttons
            
            join_button = Button(label="🎮 Join Game", style=discord.ButtonStyle.success)
            join_button.callback = self.join_game
            self.add_item(join_button)
            
            if self.game.pot_enabled:
                pay_pot_button = Button(label="💰 Pay Pot", style=discord.ButtonStyle.primary)
                pay_pot_button.callback = self.pay_pot
                self.add_item(pay_pot_button)
            
            leave_button = Button(label="🚪 Leave", style=discord.ButtonStyle.secondary)
            leave_button.callback = self.leave_game
            self.add_item(leave_button)
            
            if len(self.game.players) >= 2:
                start_button = Button(label="▶️ Start Game", style=discord.ButtonStyle.primary)
                start_button.callback = self.start_game
                self.add_item(start_button)
            
            settings_button = Button(label="⚙️ Settings", style=discord.ButtonStyle.secondary)
            settings_button.callback = self.game_settings
            self.add_item(settings_button)
            
        elif self.game.state == "playing":
            # Game in progress - show countdown timer
            
            if self.game.turn_start_time:
                elapsed = (datetime.now() - self.game.turn_start_time).total_seconds()
                remaining = max(0, self.game.turn_timeout - elapsed)
                
                time_button = Button(
                    label=f"⏰ {int(remaining)}s remaining",
                    style=discord.ButtonStyle.secondary,
                    disabled=True
                )
                self.add_item(time_button)
            
            # Instructions button
            help_button = Button(
                label="❓ How to Play",
                style=discord.ButtonStyle.secondary
            )
            help_button.callback = self.show_instructions
            self.add_item(help_button)
    
    def _create_lobby_embed(self, title: str = "") -> discord.Embed:
        """Create embed for lobby state."""
        embed = discord.Embed(
            title="🔗 Word Chain Game",
            color=discord.Color.blue()
        )
        
        if title:
            embed.description = title
        
        # Player list
        player_list = []
        for i, player in enumerate(self.game.players.values()):
            pot_status = ""
            if self.game.pot_enabled:
                pot_status = " ✅" if player.paid_pot else " ⏳"
            
            player_list.append(f"{i+1}. {player.mention}{pot_status}")
        
        embed.add_field(
            name=f"👥 Players ({len(self.game.players)}/10)",
            value="\n".join(player_list) if player_list else "No players yet",
            inline=False
        )
        
        if self.game.pot_enabled:
            paying_players = [p for p in self.game.players.values() if p.paid_pot]
            total_pot = len(paying_players) * self.game.pot_amount
            embed.add_field(
                name="💰 Prize Pot",
                value=f"{fmt(total_pot)} ({len(paying_players)}/{len(self.game.players)} paid)",
                inline=True
            )
        
        embed.add_field(
            name="⚙️ Settings",
            value=f"Lives: {self.game.lives_per_player}\nTimeout: {self.game.turn_timeout}s\nPot: {fmt(self.game.pot_amount) if self.game.pot_enabled else 'Disabled'}",
            inline=True
        )
        
        embed.add_field(
            name="📋 Rules",
            value=(
                "• Type words in chat that start with the last letter\n"
                "• Words must be valid English words\n"
                "• No repeating words\n"
                "• Lose a life for invalid words or timeouts\n"
                "• Last player standing wins!"
            ),
            inline=False
        )
        
        embed.set_footer(text=f"Host: {self.game.host.display_name}")
        
        return embed
    
    def _create_game_embed(self) -> discord.Embed:
        """Create embed for active game state."""
        current_player = self.game.get_current_player()
        
        embed = discord.Embed(
            title="🔗 Word Chain Game - In Progress",
            color=discord.Color.green()
        )
        
        # Current turn info
        if current_player:
            next_letter = f"Next word must start with: **{self.game.last_letter.upper()}**" if self.game.last_letter else "Start with any word!"
            
            # Calculate remaining time
            time_info = ""
            if self.game.turn_start_time:
                elapsed = (datetime.now() - self.game.turn_start_time).total_seconds()
                remaining = max(0, self.game.turn_timeout - elapsed)
                time_info = f" (⏰ {int(remaining)}s left)"
            
            embed.description = f"**{current_player.mention}'s turn**{time_info}\n{next_letter}\n\n💬 **Type your word in this channel!**"
            
            if self.game.current_word:
                embed.add_field(
                    name="📝 Last Word",
                    value=f"**{self.game.current_word}**",
                    inline=True
                )
        
        # Player status
        player_status = []
        for player in self.game.players.values():
            if player.is_eliminated:
                status = f"💀 ~~{player.user.display_name}~~"
            else:
                hearts = "💚" * player.lives
                status = f"{hearts} {player.user.display_name}"
            player_status.append(status)
        
        embed.add_field(
            name="👥 Player Status",
            value="\n".join(player_status),
            inline=True
        )
        
        # Words used
        if len(self.game.word_chain) > 1:  # Don't show just "WORD"
            recent_words = self.game.word_chain[-6:]  # Show last 6 words including WORD
            embed.add_field(
                name="📚 Recent Words",
                value=" → ".join(w.upper() for w in recent_words),
                inline=False
            )
        
        # Pot info
        if self.game.pot_enabled:
            embed.add_field(
                name="💰 Prize Pot",
                value=fmt(self.game.get_total_pot()),
                inline=True
            )
        
        return embed
    
    def _create_finished_embed(self) -> discord.Embed:
        """Create embed for finished game."""
        winner = self.game.get_winner()
        
        embed = discord.Embed(
            title="🔗 Word Chain Game - Finished!",
            color=discord.Color.gold()
        )
        
        if winner:
            embed.description = f"🏆 **{winner.mention} wins!**"
            
            if self.game.pot_enabled and self.game.get_total_pot() > 0:
                embed.add_field(
                    name="💰 Prize Won",
                    value=fmt(self.game.get_total_pot()),
                    inline=True
                )
        else:
            embed.description = "🤝 **Draw!**"
        
        # Final stats
        stats = []
        for player in self.game.players.values():
            words_count = len(player.words_used)
            if words_count > 0:
                last_words = ", ".join([w.upper() for w in player.words_used[-3:]])  # Show last 3 words
                stats.append(f"**{player.user.display_name}**: {words_count} words ({last_words})")
        
        if stats:
            embed.add_field(
                name="📊 Final Stats",
                value="\n".join(stats),
                inline=False
            )
        
        # Show final word chain
        if len(self.game.word_chain) > 1:
            final_chain = " → ".join([w.upper() for w in self.game.word_chain[-10:]])  # Show last 10 words
            embed.add_field(
                name="📚 Final Word Chain",
                value=final_chain,
                inline=False
            )
        
        return embed
    
    async def update_display(self):
        """Update the game display."""
        self._setup_buttons()
        
        if self.game.state == "waiting":
            embed = self._create_lobby_embed()
        elif self.game.state == "playing":
            embed = self._create_game_embed()
        else:  # finished
            embed = self._create_finished_embed()
        
        if self.game.game_message:
            try:
                await self.game.game_message.edit(embed=embed, view=self)
            except:
                pass
    
    # Button callbacks
    
    async def join_game(self, interaction: discord.Interaction):
        """Join the game without paying pot."""
        if interaction.user.id in self.game.players:
            await interaction.response.send_message("❌ You're already in this game!", ephemeral=True)
            return
        
        if self.game.add_player(interaction.user, paid_pot=False):
            wordchain_manager.user_games[interaction.user.id] = self.game.channel_id
            await interaction.response.send_message(f"✅ {interaction.user.mention} joined the game!", ephemeral=True)
            await self.update_display()
        else:
            await interaction.response.send_message("❌ Game is full (10 players max)!", ephemeral=True)
    
    async def pay_pot(self, interaction: discord.Interaction):
        """Pay into the pot to be eligible for winnings."""
        if interaction.user.id not in self.game.players:
            await interaction.response.send_message("❌ You must join the game first!", ephemeral=True)
            return
        
        player = self.game.players[interaction.user.id]
        if player.paid_pot:
            await interaction.response.send_message("❌ You've already paid into the pot!", ephemeral=True)
            return
        
        # Check wallet balance
        user_id = str(interaction.user.id)
        guild_id = self.game.guild_id
        wallet, _ = await db_manager.get_balances(user_id, guild_id)
        
        if wallet < self.game.pot_amount:
            await interaction.response.send_message(
                f"❌ Insufficient funds! Need {fmt(self.game.pot_amount)}, have {fmt(wallet)}",
                ephemeral=True
            )
            return
        
        # Deduct pot amount
        success, new_wallet = await db_manager.adjust_wallet(user_id, guild_id, -self.game.pot_amount)
        if not success:
            await interaction.response.send_message("❌ Failed to deduct pot amount!", ephemeral=True)
            return
        
        player.paid_pot = True
        await interaction.response.send_message(
            f"✅ Paid {fmt(self.game.pot_amount)} into the pot! You're eligible to win!",
            ephemeral=True
        )
        await self.update_display()
    
    async def leave_game(self, interaction: discord.Interaction):
        """Leave the game."""
        if interaction.user.id not in self.game.players:
            await interaction.response.send_message("❌ You're not in this game!", ephemeral=True)
            return
        
        if interaction.user.id == self.game.host.id and len(self.game.players) > 1:
            await interaction.response.send_message("❌ Host cannot leave with other players in game!", ephemeral=True)
            return
        
        player = self.game.players[interaction.user.id]
        
        # Refund pot if they paid
        if player.paid_pot:
            user_id = str(interaction.user.id)
            await db_manager.adjust_wallet(user_id, self.game.guild_id, self.game.pot_amount)
        
        if self.game.remove_player(interaction.user):
            if interaction.user.id in wordchain_manager.user_games:
                del wordchain_manager.user_games[interaction.user.id]
            
            await interaction.response.send_message(f"👋 {interaction.user.mention} left the game!", ephemeral=True)
            await self.update_display()
        else:
            await interaction.response.send_message("❌ Cannot leave game in progress!", ephemeral=True)
    
    async def start_game(self, interaction: discord.Interaction):
        """Start the game."""
        if interaction.user.id != self.game.host.id:
            await interaction.response.send_message("❌ Only the host can start the game!", ephemeral=True)
            return
        
        if self.game.start_game():
            # Ping all players that the game has started
            player_pings = " ".join([f"<@{player.user.id}>" for player in self.game.players.values()])
            await interaction.response.send_message(
                f"🔗 **Word Chain Game Started!** {player_pings}\nGet ready to play!",
                ephemeral=False
            )
            
            # Ping the first player with countdown timer
            current_player = self.game.get_current_player()
            if current_player:
                # Send initial turn notification with timer
                await self.game.send_turn_notification(interaction.channel)
            
            await self.update_display()
            
            # Start turn timeout timer
            asyncio.create_task(self._turn_timer())
        else:
            await interaction.response.send_message("❌ Need at least 2 players to start!", ephemeral=True)
    
    async def game_settings(self, interaction: discord.Interaction):
        """Open game settings modal."""
        if interaction.user.id != self.game.host.id:
            await interaction.response.send_message("❌ Only the host can change settings!", ephemeral=True)
            return
        
        modal = GameSettingsModal(self)
        await interaction.response.send_modal(modal)
    
    async def show_instructions(self, interaction: discord.Interaction):
        """Show game instructions."""
        embed = discord.Embed(
            title="🔗 How to Play Word Chain",
            description="Type words in chat that form a chain!",
            color=discord.Color.blue()
        )
        
        embed.add_field(
            name="📝 Basic Rules",
            value=(
                "• Each word must start with the last letter of the previous word\n"
                "• Words must be valid English words (dictionary checked)\n"
                "• No repeating words that were already used\n"
                "• Only type words when it's your turn"
            ),
            inline=False
        )
        
        embed.add_field(
            name="⏰ Timing",
            value=f"• You have {self.game.turn_timeout} seconds per turn\n• Timeout = lose a life\n• Invalid word = lose a life",
            inline=True
        )
        
        embed.add_field(
            name="🏆 Winning",
            value=f"• Start with {self.game.lives_per_player} lives\n• Last player standing wins\n• Winner gets the pot (if enabled)",
            inline=True
        )
        
        example_text = "**Example:** WORD → DOG → GREAT → TIGER → RABBIT → TREE"
        embed.add_field(name="💡 Example", value=example_text, inline=False)
        
        await interaction.response.send_message(embed=embed, ephemeral=True)
    
    async def _turn_timer(self):
        """Handle turn timeouts with countdown updates and pings."""
        while self.game.state == "playing":
            await asyncio.sleep(1)
            
            if self.game.turn_start_time:
                elapsed = (datetime.now() - self.game.turn_start_time).total_seconds()
                remaining = max(0, self.game.turn_timeout - elapsed)
                
                # Update turn notification message every second
                if self.game.turn_message:
                    try:
                        new_text = self.game.get_turn_notification_text()
                        await self.game.turn_message.edit(content=new_text)
                    except Exception as e:
                        LOG.debug(f"Failed to update turn message: {e}")
                
                # Update main display less frequently
                if remaining <= 10 or int(elapsed) % 5 == 0:
                    await self.update_display()
                
                if elapsed >= self.game.turn_timeout:
                    # Timeout!
                    current_player = self.game.get_current_player()
                    if current_player:
                        current_player.lose_life()
                        
                        # Send timeout notification
                        try:
                            if self.game.game_message:
                                await self.game.game_message.channel.send(
                                    f"⏰ {current_player.mention} timed out and lost a life! "
                                    f"({current_player.lives} {'life' if current_player.lives == 1 else 'lives'} remaining)"
                                )
                        except:
                            pass
                        
                        # Check if player is eliminated
                        if current_player.is_eliminated:
                            try:
                                if self.game.game_message:
                                    await self.game.game_message.channel.send(
                                        f"💀 {current_player.mention} has been eliminated!"
                                    )
                            except:
                                pass
                            
                            active_players = self.game.get_active_players()
                            if len(active_players) <= 1:
                                self.game.state = "finished"
                                await self._handle_game_end()
                                break
                        
                        # Move to next turn
                        self.game.next_turn()
                        
                        # Ping new current player with countdown timer
                        new_current_player = self.game.get_current_player()
                        if new_current_player:
                            try:
                                if self.game.game_message:
                                    await self.game.send_turn_notification(self.game.game_message.channel)
                            except:
                                pass
                        
                        await self.update_display()
    
    async def _handle_game_end(self):
        """Handle game ending."""
        # Clean up turn message
        if self.game.turn_message:
            try:
                await self.game.turn_message.delete()
            except:
                pass
        
        winner = self.game.get_winner()
        
        # Send winner announcement in channel
        if winner:
            # winner is already a WordChainPlayer object, not a key
            win_message = f"🏆 **{winner.mention} wins the Word Chain!** 🏆"
            
            if self.game.pot_enabled and self.game.get_total_pot() > 0:
                total_pot = self.game.get_total_pot()
                win_message += f"\n💰 **Prize:** {fmt(total_pot)}"
                
                # Award pot to winner
                try:
                    user_id = str(winner.user.id)
                    success, new_wallet = await db_manager.adjust_wallet(user_id, self.game.guild_id, total_pot)
                    if success:
                        win_message += f"\n🎉 **{fmt(total_pot)}** has been added to {winner.mention}'s wallet!"
                        win_message += f"\n💳 New wallet balance: **{fmt(new_wallet)}**"
                        
                        # Record game result
                        await db_manager.record_game_result(
                            user_id, self.game.guild_id, "word_chain", True, 
                            self.game.pot_amount if winner.paid_pot else 0, total_pot
                        )
                except Exception as e:
                    LOG.error(f"Failed to handle pot payout: {e}")
            
            if self.game.game_message:
                await self.game.game_message.channel.send(win_message)
        
        # Update main game panel to show final results
        self.game.state = "finished"
        await self.update_display()
        
        # Clean up game
        wordchain_manager.remove_game(self.game.channel_id)

# ========================= COG =========================

class WordChainCommands(Cog):
    """Word Chain game commands."""
    
    def __init__(self, bot):
        self.bot = bot
        # Register this game with the registry
        game_registry.register_game("Word Chain", self.__class__, "Say words that start with the last letter!")
    
    @commands.Cog.listener()
    async def on_message(self, message):
        """Listen for word submissions in channels with active games."""
        # Ignore bot messages
        if message.author.bot:
            return
        
        # Check if there's an active game in this channel
        game = wordchain_manager.get_game(str(message.channel.id))
        if not game or game.state != "playing":
            return
        
        # Check if the sender is in the game
        if message.author.id not in game.players:
            return
        
        # Check if it's their turn
        if message.author.id != game.current_player_id:
            # Only respond to words that look like game attempts
            word = message.content.strip()
            if (' ' not in word and len(word) >= 2 and len(word) <= 50 and word.isalpha() and 
                len(word) > 1 and not word.lower() in ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all']):
                # This looks like a word chain attempt, but it's not their turn
                current_player = game.get_current_player()
                if current_player:
                    await message.add_reaction("⏸️")  # Pause emoji to indicate "wait your turn"
                    try:
                        # Send a brief reminder (but don't spam)
                        await message.reply(
                            f"⏸️ Wait your turn! It's {current_player.mention}'s turn.",
                            delete_after=5
                        )
                    except:
                        pass
            return
        
        # Check if message is just a word (no spaces, reasonable length)
        word = message.content.strip()
        if ' ' in word or len(word) < 2 or len(word) > 50 or not word.isalpha():
            return
        
        # Double-check it's still their turn (in case of race conditions)
        if message.author.id != game.current_player_id:
            return
        
        # Ensure player is still active (not eliminated)
        current_player_obj = game.players.get(message.author.id)
        if not current_player_obj or current_player_obj.is_eliminated:
            # Player was eliminated, skip to next turn
            game.next_turn()
            new_current_player = game.get_current_player()
            if new_current_player:
                await game.send_turn_notification(message.channel)
            return
        
        # Process the word
        success, result_message, game_ended = await game.submit_word(message.author.id, word)
        
        if success:
            # Valid word submitted
            if game_ended:
                # Game ended, handle winner and finalize panel
                winner = game.get_winner()
                if winner:
                    # Handle pot payout
                    if game.pot_enabled and game.get_total_pot() > 0:
                        try:
                            user_id = str(winner.user.id)
                            total_pot = game.get_total_pot()
                            success, new_wallet = await db_manager.adjust_wallet(user_id, game.guild_id, total_pot)
                            if success:
                                # Send pot win announcement
                                pot_message = f"🏆 **{winner.mention} wins the Word Chain!**\n"
                                pot_message += f"💰 **Prize:** {fmt(total_pot)}\n"
                                pot_message += f"🎉 **{fmt(total_pot)}** has been added to your wallet!\n"
                                pot_message += f"💳 New wallet balance: **{fmt(new_wallet)}**"
                                
                                await message.channel.send(pot_message)
                                
                                await db_manager.record_game_result(
                                    user_id,
                                    game.guild_id,
                                    "word_chain",
                                    True,
                                    game.pot_amount if winner.paid_pot else 0,
                                    total_pot,
                                )
                            else:
                                # Payout failed, still announce winner
                                await message.channel.send(f"🏆 **{winner.mention} wins the Word Chain!**\n⚠️ Error processing pot payout.")
                        except Exception as e:
                            LOG.error(f"Failed to handle pot payout: {e}")
                            # Still announce winner even if payout fails
                            await message.channel.send(f"🏆 **{winner.mention} wins the Word Chain!**")
                    else:
                        # No pot, just announce winner
                        await message.channel.send(f"🏆 **{winner.mention} wins the Word Chain!**")
                
                # Clean up turn message
                if game.turn_message:
                    try:
                        await game.turn_message.delete()
                    except:
                        pass
                
                # Update main panel to finished state
                if hasattr(game, 'view'):
                    await game.view.update_display()
                # Remove game session from manager
                wordchain_manager.remove_game(game.channel_id)
                
            else:
                # Game continues, ping next player
                await message.add_reaction("✅")  # React to valid word
                
                # Clear previous turn message
                if game.turn_message:
                    try:
                        await game.turn_message.delete()
                        game.turn_message = None
                    except:
                        pass
                
                current_player = game.get_current_player()
                if current_player:
                    await game.send_turn_notification(message.channel)
                
                # Update display
                if hasattr(game, 'view'):
                    await game.view.update_display()
        else:
            # Invalid word
            current_player = game.players[message.author.id]
            current_player.lose_life()
            
            await message.add_reaction("❌")  # React to invalid word
            
            # Clear previous turn message
            if game.turn_message:
                try:
                    await game.turn_message.delete()
                    game.turn_message = None
                except:
                    pass
            await message.channel.send(
                f"❌ {message.author.mention}: {result_message} "
                f"You lost a life! ({current_player.lives} {'life' if current_player.lives == 1 else 'lives'} remaining)"
            )
            
            # Check if player is eliminated
            if current_player.is_eliminated:
                active_players = game.get_active_players()
                if len(active_players) <= 1:
                    game.state = "finished"
                    winner = game.get_winner()
                    
                    # Clean up turn message
                    if game.turn_message:
                        try:
                            await game.turn_message.delete()
                        except:
                            pass
                    
                    # Update main panel to finished state and clean up
                    if hasattr(game, 'view'):
                        await game.view.update_display()
                    wordchain_manager.remove_game(game.channel_id)
                    return
            
            # Move to next turn if player still alive
            game.next_turn()
            current_player = game.get_current_player()
            if current_player:
                await game.send_turn_notification(message.channel)
            
            # Update display
            if hasattr(game, 'view'):
                await game.view.update_display()
    
    @app_commands.command(name="wordchain", description="🔗 Start a Word Chain game!")
    @app_commands.describe(
        pot="Pot amount per player (optional, 0 to disable)",
        lives="Lives per player (default: 3)",
        timeout="Seconds per turn (default: 30)"
    )
    async def wordchain_command(self, interaction: discord.Interaction, pot: float = 0.0, lives: int = 3, timeout: int = 30):
        """Start a new Word Chain game."""
        # Check maintenance mode
        if await check_maintenance_mode(interaction):
            return
        
        await interaction.response.defer()
        
        # Validate parameters
        if pot < 0:
            await interaction.followup.send("❌ Pot amount cannot be negative!", ephemeral=True)
            return
        
        if lives < 1 or lives > 20:
            await interaction.followup.send("❌ Lives must be between 1 and 20!", ephemeral=True)
            return
        
        if timeout < 5 or timeout > 300:
            await interaction.followup.send("❌ Timeout must be between 5 and 300 seconds!", ephemeral=True)
            return
        
        # Check if user is already in a game
        existing_game = wordchain_manager.get_user_game(interaction.user.id)
        if existing_game:
            await interaction.followup.send("❌ You're already in a Word Chain game!", ephemeral=True)
            return
        
        # Create game
        guild_id = await get_guild_id(interaction)
        game = wordchain_manager.get_or_create_game(str(interaction.channel.id), guild_id, interaction.user)
        
        # Configure game settings
        game.pot_amount = pot
        game.pot_enabled = pot > 0
        game.lives_per_player = lives
        game.turn_timeout = timeout
        
        # Update host player settings
        if interaction.user.id in game.players:
            game.players[interaction.user.id].lives = lives
        
        # Create view and send message
        view = WordChainGameView(game)
        embed = view._create_lobby_embed(f"🔗 **{interaction.user.mention}** started a Word Chain game!")
        
        message = await interaction.followup.send(embed=embed, view=view)
        game.game_message = message

async def setup(bot):
    """Set up the Word Chain cog."""
    await bot.add_cog(WordChainCommands(bot))
