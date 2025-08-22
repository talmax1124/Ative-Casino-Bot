"""
GameUtils Usage Examples
Demonstrates how to use the GameUtils system in your game implementations.
"""

import discord
from discord import app_commands
from discord.ext import commands
from discord.ext.commands import Cog
from discord.ui import Button

from utils.game_utils import (
    GameType, GameResult, ValidationResult,
    PayoutManager, GameValidator, GameEmbeds, SessionManager, AdminUtils,
    BaseGameView, create_game_command_wrapper
)
from utils.common import fmt, get_guild_id

# ==================== EXAMPLE 1: SIMPLE GAME COMMAND ====================

class ExampleGameCog(Cog):
    """Example of how to implement a game using GameUtils."""
    
    def __init__(self, bot):
        self.bot = bot
    
    @app_commands.command(name="examplegame", description="🎲 Play example game")
    @app_commands.describe(amount="Bet amount (use K/M/B suffixes, 'A' for all, 'H' for half)")
    async def example_game_command(self, interaction: discord.Interaction, amount: str):
        """Example game command using GameUtils wrapper."""
        
        # Use the wrapper function for common setup
        result = await create_game_command_wrapper(
            interaction=interaction,
            amount=amount,
            game_type=GameType.SLOTS,  # Replace with your game type
            game_class=ExampleGameView,  # Your game view class
            min_bet=10.0,  # Your minimum bet
            max_bet=1000000.0,  # Your maximum bet (optional)
            special_requirements={  # Optional special requirements
                'min_bet_special': 50000,  # For premium games
                'special_name': 'Premium Example Game'
            }
        )
        
        if result is None:
            return  # Error handled by wrapper
        
        game_view, validation = result
        
        # Create your game's initial embed
        embed = discord.Embed(
            title="🎲 Example Game Started",
            description=f"**{interaction.user.display_name}** started an example game!",
            color=discord.Color.blue()
        )
        embed.add_field(name="💰 Bet", value=fmt(validation.parsed_amount), inline=True)
        embed.add_field(name="💼 Wallet", value=fmt(validation.new_wallet), inline=True)
        
        # Send the game
        await interaction.followup.send(embed=embed, view=game_view)
    
    # Admin command using GameUtils
    @app_commands.command(name="stopexample", description="🛑 [ADMIN] Stop user's example game")
    async def stop_example_command(self, interaction: discord.Interaction, member: discord.Member):
        """Stop example game using GameUtils."""
        await AdminUtils.force_stop_game(interaction, member, GameType.SLOTS, refund=True)

# ==================== EXAMPLE 2: GAME VIEW USING BASE CLASS ====================

class ExampleGameView(BaseGameView):
    """Example game view extending BaseGameView."""
    
    def __init__(self, user: discord.User, bet_amount: float, wallet_after: float, username: str):
        # Initialize base class with game-specific settings
        super().__init__(
            user=user,
            game_type=GameType.SLOTS,  # Your game type
            bet_amount=bet_amount,
            timeout=60,  # 60 second timeout
            auto_refund=True  # Auto-refund on timeout
        )
        
        # Your game-specific variables
        self.wallet_after = wallet_after
        self.username = username
        self.current_wallet = wallet_after
        
        # Game state
        self.game_result = None
    
    @discord.ui.button(label="🎲 Play", style=discord.ButtonStyle.primary)
    async def play_game(self, interaction: discord.Interaction, button: Button):
        """Example play button handler."""
        
        # Validate user and session
        is_valid, error_msg = GameValidator.validate_game_state(
            interaction=interaction,
            authorized_user_id=self.user.id,
            session_ended=self.session_ended,
            additional_checks={
                'min_balance': {
                    'current': self.current_wallet,
                    'required': 100.0
                }
            }
        )
        
        if not is_valid:
            await interaction.response.send_message(error_msg, ephemeral=True)
            return
        
        # Mark game as started (prevents timeout refund)
        self.mark_game_started()
        
        # Simulate game logic
        import random
        won = random.random() > 0.5  # 50% win chance
        payout = self.bet_amount * 2.0 if won else 0.0
        
        # Update wallet
        success, new_wallet = await PayoutManager.award_payout(
            str(self.user.id), 
            self.guild_id, 
            payout
        )
        
        if success and new_wallet is not None:
            self.current_wallet = new_wallet
        
        # Update session stats
        await self.update_session_stats(payout, won)
        
        # Create game result
        result = GameResult(
            user_id=str(self.user.id),
            guild_id=self.guild_id,
            game_type=self.game_type,
            bet_amount=self.bet_amount,
            payout=payout,
            won=won,
            session_games=self.session_games_played,
            session_total_bet=self.session_total_bet,
            session_total_winnings=self.session_total_winnings
        )
        
        # Record in database
        await PayoutManager.record_game_result(result)
        
        # Create result embed using GameUtils
        embed = GameEmbeds.create_game_result_embed(
            result=result,
            username=self.username,
            current_wallet=self.current_wallet,
            additional_fields=[
                {'name': '🎲 Result', 'value': 'WIN!' if won else 'Loss', 'inline': True}
            ]
        )
        
        await interaction.response.edit_message(embed=embed, view=self)
    
    @discord.ui.button(label="🚪 End Session", style=discord.ButtonStyle.secondary)
    async def end_session(self, interaction: discord.Interaction, button: Button):
        """End game session button."""
        
        if not await GameValidator.check_user_permission(interaction, self.user.id):
            return
        
        # Create session summary
        embed = GameEmbeds.create_session_summary_embed(
            game_type=self.game_type,
            username=self.username,
            session_stats=self.get_session_stats(),
            final_wallet=self.current_wallet
        )
        
        # Cleanup session
        await self._cleanup_session(reason="Player ended session")
        
        await interaction.response.edit_message(embed=embed, view=self)

# ==================== EXAMPLE 3: MANUAL VALIDATION & PAYOUT ====================

async def manual_game_example(interaction: discord.Interaction, amount: str):
    """Example of manually handling validation and payouts."""
    
    # Manual validation
    validation = await PayoutManager.validate_and_deduct_bet(
        interaction=interaction,
        amount=amount,
        game_type=GameType.BLACKJACK,
        min_bet=5.0,
        max_bet=50000.0
    )
    
    if not validation.is_valid:
        await interaction.response.send_message(embed=validation.error_embed, ephemeral=True)
        return
    
    # Your game logic here...
    won = True  # Example result
    payout = validation.parsed_amount * 1.5  # 1.5x payout
    
    # Award payout
    success, new_wallet = await PayoutManager.award_payout(
        str(interaction.user.id),
        await get_guild_id(interaction),
        payout
    )
    
    # Create result
    result = GameResult(
        user_id=str(interaction.user.id),
        guild_id=await get_guild_id(interaction),
        game_type=GameType.BLACKJACK,
        bet_amount=validation.parsed_amount,
        payout=payout,
        won=won
    )
    
    # Record result
    await PayoutManager.record_game_result(result)
    
    # Cleanup session
    await PayoutManager.cleanup_game_session(
        str(interaction.user.id),
        await get_guild_id(interaction),
        interaction.user.id,
        GameType.BLACKJACK
    )
    
    # Send result
    embed = GameEmbeds.create_game_result_embed(result, interaction.user.display_name, new_wallet)
    await interaction.response.send_message(embed=embed)

# ==================== EXAMPLE 4: ERROR HANDLING ====================

async def error_handling_example(interaction: discord.Interaction):
    """Example of using GameUtils for error handling."""
    
    # Check maintenance mode
    if await GameValidator.check_maintenance_mode(interaction):
        return  # Maintenance message already sent
    
    # Custom validation with error embeds
    user_wallet = 1000.0  # Example wallet
    required_amount = 2000.0
    
    if user_wallet < required_amount:
        embed = GameEmbeds.create_error_embed(
            "❌ Insufficient Funds",
            f"You need {fmt(required_amount)} but only have {fmt(user_wallet)}!"
        )
        await interaction.response.send_message(embed=embed, ephemeral=True)
        return
    
    # Success embed
    embed = GameEmbeds.create_success_embed(
        "✅ Game Started",
        "Your game has been successfully started!"
    )
    await interaction.response.send_message(embed=embed)

# ==================== EXAMPLE 5: ADMIN COMMAND CREATION ====================

# Method 1: Use the factory function
stop_slots_command = AdminUtils.create_stop_game_command(GameType.SLOTS)

# Method 2: Manual implementation
@app_commands.command(name="stoppoker", description="🛑 [ADMIN] Stop user's poker game")
async def stop_poker_manually(interaction: discord.Interaction, member: discord.Member):
    """Manual admin command implementation."""
    await AdminUtils.force_stop_game(interaction, member, GameType.POKER, refund=True)

# ==================== MIGRATION GUIDE ====================

"""
MIGRATION GUIDE: Converting Existing Games to GameUtils

1. REPLACE COMMAND VALIDATION:

OLD WAY:
```python
# Check for active game
if await db_manager.is_game_active(user_id, guild_id):
    embed = discord.Embed(title="❌ Game Already Active", ...)
    await interaction.followup.send(embed=embed, ephemeral=True)
    return

# Parse amount
try:
    amount = parse_amount(amount, user_wallet)
except ValueError as e:
    # Error handling...
```

NEW WAY:
```python
validation = await PayoutManager.validate_and_deduct_bet(
    interaction, amount, GameType.BLACKJACK, min_bet=5.0
)
if not validation.is_valid:
    await interaction.response.send_message(embed=validation.error_embed, ephemeral=True)
    return
```

2. REPLACE VIEW CLASSES:

OLD WAY:
```python
class MyGameView(View):
    def __init__(self, user, bet_amount, ...):
        super().__init__(timeout=60)
        self.user = user
        # ... lots of boilerplate
```

NEW WAY:
```python
class MyGameView(BaseGameView):
    def __init__(self, user, bet_amount, wallet_after, username):
        super().__init__(user, GameType.BLACKJACK, bet_amount, timeout=60)
        # Game-specific init only
```

3. REPLACE ADMIN COMMANDS:

OLD WAY:
```python
# 30+ lines of permission checking, validation, cleanup, embeds...
```

NEW WAY:
```python
await AdminUtils.force_stop_game(interaction, member, GameType.BLACKJACK, refund=True)
```

4. REPLACE RESULT EMBEDS:

OLD WAY:
```python
# Manual embed creation with lots of fields...
```

NEW WAY:
```python
result = GameResult(...)
embed = GameEmbeds.create_game_result_embed(result, username, wallet)
```

5. REPLACE SESSION MANAGEMENT:

OLD WAY:
```python
# Manual cleanup, refunds, database calls...
```

NEW WAY:
```python
await SessionManager.end_game_session(user_id, guild_id, discord_id, game_type)
```
"""