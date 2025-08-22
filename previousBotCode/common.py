"""
Common utility functions used across the bot.
This module contains frequently used helper functions to reduce code duplication.
"""

import discord
import logging
import datetime
import pytz
from typing import Optional, Union, Dict

LOG = logging.getLogger("common_utils")

# --- Standardized Embeds -----------------------------------------------------

def build_stopped_refund_embed(admin: Union[discord.Member, discord.User], target: Optional[Union[discord.Member, discord.User]] = None, refunds: Optional[list[str]] = None, note: Optional[str] = None) -> discord.Embed:
    """Create a standardized embed shown when an admin/mod stops a game and refunds.

    Args:
        admin: Acting admin/mod user
        target: Optional target player whose game was stopped
        refunds: Optional list of refund summary strings
        note: Optional extra note (limitations, per-game info)
    """
    title = "🛑 Game Stopped"
    desc = (
        f"The game has been stopped by {admin.mention}. A refund has been sent."
        if not target else
        f"The game for {target.mention} has been stopped by {admin.mention}. A refund has been sent."
    )
    embed = discord.Embed(title=title, description=desc, color=discord.Color.red())
    if refunds:
        embed.add_field(name="💰 Refunds", value="\n".join(refunds), inline=False)
    if note:
        embed.add_field(name="ℹ️ Notes", value=note, inline=False)
    embed.timestamp = discord.utils.utcnow()
    return embed

# --- Money Formatting Functions ---------------------------------------------

def fmt(amount: Union[float, int, str]) -> str:
    """
    Format amount as currency string.
    
    Args:
        amount: The amount to format (accepts float, int, or string)
        
    Returns:
        Formatted currency string (e.g., "$1,234.56")
    """
    try:
        return f"${float(amount):,.2f}"
    except (ValueError, TypeError):
        return f"${amount}"


def fmt_delta(after: Union[float, int], before: Union[float, int]) -> str:
    """
    Format the difference between two amounts.
    
    Args:
        after: The final amount
        before: The initial amount
        
    Returns:
        Formatted difference string (e.g., "(+1,234.56)" or "(-1,234.56)")
    """
    try:
        delta = float(after) - float(before)
        sign = "+" if delta >= 0 else "-"
        return f"({sign}{abs(delta):,.2f})"
    except (ValueError, TypeError):
        return ""


def fmt_delta_colored(after: Union[float, int], before: Union[float, int]) -> str:
    """
    Format the difference between two amounts with color codes.
    
    Args:
        after: The final amount
        before: The initial amount
        
    Returns:
        Colored difference string using Discord color codes
    """
    try:
        delta = float(after) - float(before)
        if delta >= 0:
            return f"\u001b[32m (+${delta:,.2f})\u001b[0m"  # Green for positive
        else:
            return f"\u001b[31m (-${abs(delta):,.2f})\u001b[0m"  # Red for negative
    except (ValueError, TypeError):
        return ""


# --- Discord Helper Functions -----------------------------------------------

async def get_guild_id(interaction: discord.Interaction) -> str:
    """
    Get guild ID from interaction with fallback for DMs.
    
    Args:
        interaction: The Discord interaction
        
    Returns:
        Guild ID as string, or "dm_fallback" for DMs
    """
    return str(interaction.guild.id) if interaction.guild else "dm_fallback"


# --- Permission Helper Functions --------------------------------------------

async def _has_admin_role(member: discord.Member) -> bool:
    """
    Check if member has admin privileges.
    
    Args:
        member: The Discord member to check
        
    Returns:
        True if member has admin privileges
    """
    if not member.guild:
        return False
    
    # Import here to avoid circular imports
    from utils.firebase_database import db_manager
    
    # Super admin (always has admin privileges on any server)
    if member.id == 466050111680544798:
        return True
    
    # Bot owner is always admin
    if member.guild.owner_id == member.id:
        return True
    
    # Check configured admin roles
    try:
        admin_roles = await db_manager.get_admin_roles(str(member.guild.id))
        member_role_names = [role.name.lower() for role in member.roles]
        return any(role.lower() in member_role_names for role in admin_roles)
    except Exception as e:
        LOG.error(f"Error checking admin roles for {member.id}: {e}")
        return False


async def _has_mod_role(member: discord.Member) -> bool:
    """
    Check if member has moderator privileges.
    
    Args:
        member: The Discord member to check
        
    Returns:
        True if member has moderator or admin privileges
    """
    # Admins always have mod privileges
    if await _has_admin_role(member):
        return True
    
    if not member.guild:
        return False
    
    # Import here to avoid circular imports
    from utils.firebase_database import db_manager
    
    # Check configured mod roles
    try:
        mod_roles = await db_manager.get_mod_roles(str(member.guild.id))
        member_role_names = [role.name.lower() for role in member.roles]
        return any(role.lower() in member_role_names for role in mod_roles)
    except Exception as e:
        LOG.error(f"Error checking mod roles for {member.id}: {e}")
        return False


# --- Maintenance Mode Helper ------------------------------------------------

async def check_maintenance_mode(interaction: discord.Interaction) -> bool:
    """
    Check if bot is in maintenance mode and send appropriate message if so.
    
    Args:
        interaction: The Discord interaction
        
    Returns:
        True if maintenance mode is active (and message was sent)
    """
    try:
        from bot_manager import get_bot_manager
        manager = get_bot_manager()
        
        if manager and manager.is_maintenance_mode():
            embed = discord.Embed(
                title="🔧 Maintenance Mode Active",
                description=(
                    "The bot is currently in maintenance mode. New games are temporarily disabled "
                    "while updates are being applied.\n\n"
                    "Please try again in a few minutes."
                ),
                color=discord.Color.orange()
            )
            embed.set_footer(text="This helps ensure active games aren't interrupted during updates.")
            
            if interaction.response.is_done():
                await interaction.followup.send(embed=embed, ephemeral=True)
            else:
                await interaction.response.send_message(embed=embed, ephemeral=True)
            return True
        
    except Exception as e:
        LOG.error(f"Error checking maintenance mode: {e}")
    
    return False


# --- Game Registry -----------------------------------------------------------

class GameRegistry:
    """Registry for managing game sessions and information."""
    
    def __init__(self):
        self.games = {}
        self.active_sessions = set()
    
    def register_game(self, name: str, cog_class, description: str = "") -> None:
        """
        Register a game with the registry.
        
        Args:
            name: Name of the game
            cog_class: The cog class for the game
            description: Optional description of the game
        """
        self.games[name.lower()] = {
            "name": name,
            "cog_class": cog_class,
            "description": description
        }
    
    def get_game(self, name: str) -> Optional[dict]:
        """
        Get a registered game by name.
        
        Args:
            name: Name of the game to retrieve
            
        Returns:
            Game information dictionary or None if not found
        """
        return self.games.get(name.lower())
    
    def list_games(self) -> list:
        """
        List all registered games.
        
        Returns:
            List of game information dictionaries
        """
        return list(self.games.values())
    
    def add_session(self, user_id: int) -> None:
        """
        Add a user to active game sessions.
        
        Args:
            user_id: Discord user ID
        """
        self.active_sessions.add(user_id)
    
    def remove_session(self, user_id: int) -> None:
        """
        Remove a user from active game sessions.
        
        Args:
            user_id: Discord user ID
        """
        self.active_sessions.discard(user_id)
    
    def is_session_active(self, user_id: int) -> bool:
        """
        Check if a user has an active game session.
        
        Args:
            user_id: Discord user ID
            
        Returns:
            True if user has an active session
        """
        return user_id in self.active_sessions
    
    def get_active_session_count(self) -> int:
        """
        Get the number of active game sessions.
        
        Returns:
            Number of active sessions
        """
        return len(self.active_sessions)


# --- Global Game Registry Instance ------------------------------------------

# Create a global instance to be imported by other modules
game_registry = GameRegistry()


# --- Auto-Refund Game View Base Class ----------------------------------------

class AutoRefundGameView(discord.ui.View):
    """Base class for game views that automatically refund on timeout."""
    
    def __init__(self, timeout: int = 45):
        super().__init__(timeout=timeout)
        self.user_id = None
        self.bet_amount = 0.0
        self.game_type = "unknown"
        self.refunded = False
        self.game_started = False
        
    def setup_auto_refund(self, user_id: str, bet_amount: float, game_type: str):
        """Setup auto-refund parameters."""
        self.user_id = user_id
        self.bet_amount = bet_amount
        self.game_type = game_type
    
    def mark_game_started(self):
        """Mark game as started (prevents refund)."""
        self.game_started = True
    
    async def on_timeout(self):
        """Handle timeout - refund if game hasn't started."""
        if not self.game_started and not self.refunded and self.user_id and self.bet_amount > 0:
            try:
                # Import here to avoid circular imports
                from utils.firebase_database import db_manager
                
                # Refund the user
                guild_id = "global"  # Use global for compatibility
                success, new_wallet = await db_manager.adjust_wallet(self.user_id, guild_id, self.bet_amount)
                
                if success:
                    self.refunded = True
                    
                    # Clear game session
                    await db_manager.clear_game_active(self.user_id, guild_id)
                    game_registry.remove_session(int(self.user_id))
                    
                    # Log the timeout refund
                    await send_log_message(
                        None,  # No bot reference available in timeout
                        "game",
                        f"Game timeout refund: {self.game_type} - ${self.bet_amount:,.2f} refunded to user {self.user_id}",
                        user_id=self.user_id
                    )
                    
                    LOG.info(f"Auto-refunded {self.bet_amount} to user {self.user_id} for {self.game_type} timeout")
                
            except Exception as e:
                LOG.error(f"Failed to auto-refund user {self.user_id}: {e}")
    
    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        """Check if user can interact and mark game as started on first interaction."""
        if interaction.user.id == int(self.user_id):
            self.mark_game_started()
        return True


# --- Logging Utility Function -----------------------------------------------

async def send_log_message(bot, event_type: str, description: str, user_id: str = None, guild_id: str = None, embed: discord.Embed = None, view: discord.ui.View = None):
    """Send log message to the designated logging channel."""
    logging_channel_id = 1405096821512212521
    
    try:
        channel = bot.get_channel(logging_channel_id)
        if not channel:
            for guild in bot.guilds:
                channel = guild.get_channel(logging_channel_id)
                if channel:
                    break
        
        if not channel:
            LOG.warning(f"Could not find logging channel {logging_channel_id}")
            return
        
        # If custom embed provided, use it
        if embed:
            await channel.send(content=description, embed=embed, view=view)
            return
        
        # Color based on event type
        color_map = {
            'admin': discord.Color.red(),
            'moderation': discord.Color.orange(),
            'game': discord.Color.green(),
            'economy': discord.Color.gold(),
            'error': discord.Color.dark_red(),
            'info': discord.Color.blue()
        }
        
        log_embed = discord.Embed(
            title=f"📋 {event_type.title()} Event",
            description=description,
            color=color_map.get(event_type, discord.Color.light_grey())
        )
        
        if user_id:
            log_embed.add_field(name="User", value=f"<@{user_id}>", inline=True)
        if guild_id:
            log_embed.add_field(name="Server", value=guild_id, inline=True)
        
        log_embed.timestamp = discord.utils.utcnow()
        
        await channel.send(embed=log_embed, view=view)
        
    except Exception as e:
        LOG.error(f"Failed to send log message: {e}")


# --- Per-User Game Message Registry -----------------------------------------

_user_game_messages: Dict[str, discord.Message] = {}

def set_user_game_message(user_id: Union[int, str], message: discord.Message) -> None:
    """Register or replace the latest game message for a user for admin edits."""
    _user_game_messages[str(user_id)] = message

def get_user_game_message(user_id: Union[int, str]) -> Optional[discord.Message]:
    """Get the latest tracked game message for a user, if any."""
    return _user_game_messages.get(str(user_id))

def clear_user_game_message(user_id: Union[int, str]) -> None:
    """Clear tracked game message for a user."""
    _user_game_messages.pop(str(user_id), None)


# --- Update Announcement Utility Function -----------------------------------

async def send_update_announcement(bot, title: str, description: str, fields: list = None, ping_role: str = None):
    """Send enhanced update announcement to the designated updates channel if not already sent."""
    updates_channel_id = 1406139267331129495
    
    try:
        channel = bot.get_channel(updates_channel_id)
        if not channel:
            for guild in bot.guilds:
                channel = guild.get_channel(updates_channel_id)
                if channel:
                    break
        
        if not channel:
            LOG.warning(f"Could not find updates channel {updates_channel_id}")
            return
        
        # Check if this announcement was already sent recently (last 50 messages)
        try:
            async for message in channel.history(limit=50):
                if (message.author == bot.user and 
                    message.embeds and 
                    message.embeds[0].title and 
                    title.lower() in message.embeds[0].title.lower()):
                    LOG.info(f"Update announcement '{title}' already exists, skipping duplicate")
                    return
        except Exception as e:
            LOG.warning(f"Could not check message history: {e}")
        
        # Create enhanced embed with better styling
        embed = discord.Embed(
            title=f"🔔 {title}",
            description=description,
            color=0x5865F2  # Discord blurple color
        )
        
        # Add fields if provided
        if fields:
            for field in fields:
                embed.add_field(**field)
        
        # Add helpful links and information
        embed.add_field(
            name="📚 Quick Links",
            value="• Use `/help` for command guide\n• Use `/games` for game overview\n• Use `/suggestions` to request features",
            inline=False
        )
        
        embed.set_footer(text="🎮 Duck Game Bot • Stay updated with the latest features!")
        embed.timestamp = discord.utils.utcnow()
        
        # Prepare message content with role ping if specified
        content = ""
        if ping_role:
            # Try to find the role in the guild
            guild = channel.guild
            role = discord.utils.get(guild.roles, name=ping_role)
            if role:
                content = f"{role.mention}\n"
            else:
                content = f"@{ping_role}\n"
        
        content += "## 🎉 New Update Available!"
        
        await channel.send(content=content, embed=embed)
        LOG.info(f"Sent enhanced update announcement: {title}")
        
    except Exception as e:
        LOG.error(f"Failed to send update announcement: {e}")


# --- Lottery System Functions -----------------------------------------------

# Global lottery panel tracking
lottery_panel_message: Dict[str, discord.Message] = {}  # guild_id -> message

def get_next_lottery_timestamp() -> int:
    """Calculate the next Sunday at 10 AM EST and return as Unix timestamp."""
    est = pytz.timezone('US/Eastern')
    now_utc = datetime.datetime.now(pytz.UTC)
    now_est = now_utc.astimezone(est)
    
    # Find next Sunday at 10 AM EST
    days_until_sunday = (6 - now_est.weekday()) % 7  # 6 = Sunday
    if days_until_sunday == 0:  # Today is Sunday
        next_sunday = now_est.replace(hour=10, minute=0, second=0, microsecond=0)
        if now_est.time() >= datetime.time(10, 0):  # Already past 10 AM, next week
            next_sunday += datetime.timedelta(days=7)
    else:
        next_sunday = now_est + datetime.timedelta(days=days_until_sunday)
        next_sunday = next_sunday.replace(hour=10, minute=0, second=0, microsecond=0)
    
    return int(next_sunday.timestamp())

async def find_and_track_lottery_panel(bot, guild_id: str):
    """Find existing lottery panel message and track it."""
    try:
        # Only for the designated lottery server
        designated_server_id = "1403244656845787167"
        if guild_id != designated_server_id:
            return None
            
        # Get the designated lottery channel
        lottery_channel_id = 1406136478714826824
        channel = bot.get_channel(lottery_channel_id)
        
        if not channel:
            LOG.error(f"Could not find lottery channel {lottery_channel_id}")
            return None
        
        # Search through recent messages to find the lottery panel
        async for message in channel.history(limit=50):
            if (message.author == bot.user and 
                message.embeds and 
                len(message.embeds) > 0 and 
                "Weekly Lottery System" in message.embeds[0].title):
                
                LOG.info(f"Found existing lottery panel message {message.id} in channel {lottery_channel_id}")
                lottery_panel_message[guild_id] = message
                return message
        
        LOG.info(f"No existing lottery panel found in channel {lottery_channel_id}")
        return None
        
    except Exception as e:
        LOG.error(f"Error finding lottery panel: {e}")

async def update_lottery_panel(bot, guild_id: str):
    """Auto-update the lottery panel with current information."""
    try:
        LOG.info(f"update_lottery_panel called for guild {guild_id}")
        LOG.info(f"Current tracked panels: {list(lottery_panel_message.keys())}")
        
        # Only update for the designated lottery server
        designated_server_id = "1403244656845787167"
        if guild_id != designated_server_id:
            LOG.info(f"Guild {guild_id} is not the designated lottery server {designated_server_id}, skipping update")
            return
        
        # Check if we have a tracked lottery panel for this guild
        if guild_id not in lottery_panel_message:
            LOG.info(f"No lottery panel tracked for guild {guild_id}, trying to find existing one")
            # Try to find and track existing panel
            await find_and_track_lottery_panel(bot, guild_id)
            
            # If still not found, exit
            if guild_id not in lottery_panel_message:
                LOG.info(f"No lottery panel found or tracked for guild {guild_id}")
                return
        
        message = lottery_panel_message[guild_id]
        
        # Get current lottery info
        try:
            # Import here to avoid circular imports
            from utils.firebase_database import db_manager
            lottery_info = await db_manager.get_lottery_info(guild_id)
            current_prize = lottery_info.get('total_prize', 400000)  # Use total_prize field
            ticket_count = lottery_info.get('total_tickets', 0)  # Use total_tickets field
            LOG.info(f"Retrieved lottery info - Prize: {current_prize}, Tickets: {ticket_count}")
        except Exception as e:
            LOG.error(f"Error getting lottery info: {e}")
            current_prize = 400000
            ticket_count = 0
        
        # Create updated embed (same as original but with current data)
        embed = discord.Embed(
            title="🎟️ Weekly Lottery System",
            description="**Try your luck in our weekly lottery drawings!**\n\n"
                       "Every Sunday at 10 AM EST, we draw 3 lucky winners! 1st and 2nd place get 45% each, 3rd place gets 10%!",
            color=0xFFD700
        )
        
        embed.add_field(
            name="💰 Current Prize Pool",
            value=f"**{fmt(current_prize)}**\n*Updates with each money transfer (5% tax goes to lottery)*",
            inline=True
        )
        
        embed.add_field(
            name="🎫 Tickets Sold This Week",
            value=f"**{ticket_count}** tickets\n*Max 7 tickets per person*",
            inline=True
        )
        
        # Calculate next Sunday at 10 AM EST for local time display
        next_drawing_timestamp = get_next_lottery_timestamp()
        
        embed.add_field(
            name="⏰ Next Drawing",
            value=f"<t:{next_drawing_timestamp}:F>\n<t:{next_drawing_timestamp}:R>\n*Every Sunday at 10 AM EST*",
            inline=True
        )
        
        embed.add_field(
            name="🎫 How to Buy Tickets",
            value="Use `/buylottery [count]` to purchase tickets\n"
                  "• **$12,000** per ticket\n"
                  "• Maximum **7 tickets** per person per week\n"
                  "• Tickets reset after each drawing",
            inline=False
        )
        
        embed.add_field(
            name="🏆 Prize Distribution",
            value="🥇 **1st Winner:** 45% of total prize pool\n"
                  "🥈 **2nd Winner:** 45% of total prize pool\n"
                  "🥉 **3rd Winner:** 10% of total prize pool\n"
                  "*Three winners with guaranteed prizes!*",
            inline=False
        )
        
        embed.add_field(
            name="💡 How Prize Pool Grows",
            value="• **Base Prize:** $400,000 every week\n"
                  "• **Money Transfer Tax:** 5% of all `/sendmoney` transfers\n"
                  "• **Ticket Sales:** All ticket money goes to next week's pool\n"
                  "• **No Winner:** Prize rolls over to next week",
            inline=False
        )
        
        embed.add_field(
            name="📋 Lottery Commands",
            value="`/buylottery [count]` - Buy 1-7 lottery tickets\n"
                  "`/lottery` - Check current lottery status\n"
                  "`/mystats` - View your tickets and stats",
            inline=False
        )
        
        # Update timestamp for next drawing and last updated
        next_drawing_timestamp = get_next_lottery_timestamp()
        
        embed.set_footer(text=f"🍀 Good luck! • Last Updated")
        embed.timestamp = discord.utils.utcnow()
        
        # Replace the Next Drawing field with timestamp
        for i, field in enumerate(embed.fields):
            if field.name == "⏰ Next Drawing":
                embed.set_field_at(i, 
                    name="⏰ Next Drawing",
                    value=f"<t:{next_drawing_timestamp}:F>\n<t:{next_drawing_timestamp}:R>\n*Every Sunday at 10 AM EST*",
                    inline=True
                )
                break
        
        # Update the message
        LOG.info(f"About to edit message {message.id} for guild {guild_id}")
        await message.edit(embed=embed)
        LOG.info(f"Successfully updated lottery panel for guild {guild_id}")
        
    except discord.NotFound:
        # Message was deleted, remove from tracking
        if guild_id in lottery_panel_message:
            del lottery_panel_message[guild_id]
        LOG.info(f"Lottery panel message deleted for guild {guild_id}, removed from tracking")
    except Exception as e:
        LOG.error(f"Error updating lottery panel for guild {guild_id}: {e}")
