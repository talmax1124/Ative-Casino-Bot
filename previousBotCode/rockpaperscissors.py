"""Rock Paper Scissors Game commands and views.
Two players face off in the classic game with public choices and turn-based play.
"""

import discord
from discord import app_commands
from discord.ui import View, Button
from discord.ext import commands
from discord.ext.commands import Cog
from utils.common import game_registry, fmt, fmt_delta_colored, get_guild_id
from utils.firebase_database import db_manager

import asyncio
import secrets
import logging
from typing import Optional, Dict, Tuple
from enum import Enum

LOG = logging.getLogger("rockpaperscissors")

class Choice(Enum):
    ROCK = "🪨"
    PAPER = "📄"
    SCISSORS = "✂️"

CHOICE_NAMES = {
    Choice.ROCK: "Rock",
    Choice.PAPER: "Paper", 
    Choice.SCISSORS: "Scissors"
}

CHOICE_ANIMATIONS = {
    Choice.ROCK: ["🤛", "✊", "🪨"],
    Choice.PAPER: ["🤚", "✋", "📄"],
    Choice.SCISSORS: ["✌️", "✂️", "✂️"]
}

class RPSGameSession:
    def __init__(self, player1_id: int, player1_name: str, pot_amount: float):
        self.player1_id = player1_id
        self.player1_name = player1_name
        self.player2_id: Optional[int] = None
        self.player2_name: Optional[str] = None
        self.pot_amount = pot_amount
        self.total_pot = pot_amount * 2  # Both players contribute
        self.player1_choice: Optional[Choice] = None
        self.player2_choice: Optional[Choice] = None
        self.started = False
        self.finished = False
        self.current_round = 1
        self.max_rounds = 3
        self.player1_wins = 0
        self.player2_wins = 0
        self.current_turn = 1  # 1 for player 1, 2 for player 2
        self.both_chose = False

    def add_player2(self, player2_id: int, player2_name: str):
        self.player2_id = player2_id
        self.player2_name = player2_name

    def reset_choices(self):
        self.player1_choice = None
        self.player2_choice = None
        self.both_chose = False
        self.current_turn = 1

    def get_round_winner(self) -> Optional[int]:
        if not (self.player1_choice and self.player2_choice):
            return None
            
        choice1, choice2 = self.player1_choice, self.player2_choice
        
        if choice1 == choice2:
            return 0  # Tie
        
        wins = {
            (Choice.ROCK, Choice.SCISSORS): 1,
            (Choice.PAPER, Choice.ROCK): 1,
            (Choice.SCISSORS, Choice.PAPER): 1
        }
        
        return wins.get((choice1, choice2), 2)

    def is_game_over(self) -> Tuple[bool, Optional[int]]:
        # Game is over when someone wins 2 out of 3 rounds
        if self.player1_wins >= 2:
            return True, 1
        elif self.player2_wins >= 2:
            return True, 2
        elif self.current_round > 3:
            # All 3 rounds played, determine winner by wins
            if self.player1_wins > self.player2_wins:
                return True, 1
            elif self.player2_wins > self.player1_wins:
                return True, 2
            else:
                return True, 0  # Tie
        return False, None

class RPSGameView(View):
    def __init__(self, game_session: RPSGameSession, cog):
        super().__init__(timeout=300)
        self.game_session = game_session
        self.cog = cog
        self.update_buttons()

    def update_buttons(self):
        """Update button states based on game state"""
        for item in self.children:
            if isinstance(item, Button):
                if item.custom_id in ["rock", "paper", "scissors"]:
                    # Keep choice buttons enabled while awaiting a choice; gate by interaction_check
                    item.disabled = self.game_session.both_chose or self.game_session.finished or not self.game_session.started
                elif item.custom_id == "join":
                    # Disable join button if game started
                    item.disabled = self.game_session.started

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        """Control who can use which buttons"""
        custom_id = None
        try:
            custom_id = interaction.data.get('custom_id') if isinstance(interaction.data, dict) else None
        except Exception:
            custom_id = None
        
        if custom_id == "join":
            return interaction.user.id != self.game_session.player1_id
        elif custom_id in ["rock", "paper", "scissors"]:
            if not self.game_session.started:
                return False
            # Enforce turn-based input: only current player can act
            current_player_id = self.game_session.player1_id if self.game_session.current_turn == 1 else self.game_session.player2_id
            return interaction.user.id == current_player_id
            
        return True

    @discord.ui.button(label="Join Game", emoji="⚔️", style=discord.ButtonStyle.primary, custom_id="join")
    async def join_game(self, interaction: discord.Interaction, button: Button):
        await self.cog.handle_join_game(interaction, self.game_session, self)

    @discord.ui.button(label="🪨 Rock", style=discord.ButtonStyle.secondary, custom_id="rock")
    async def choose_rock(self, interaction: discord.Interaction, button: Button):
        await self.cog.handle_choice(interaction, self.game_session, Choice.ROCK, self)

    @discord.ui.button(label="📄 Paper", style=discord.ButtonStyle.secondary, custom_id="paper")
    async def choose_paper(self, interaction: discord.Interaction, button: Button):
        await self.cog.handle_choice(interaction, self.game_session, Choice.PAPER, self)

    @discord.ui.button(label="✂️ Scissors", style=discord.ButtonStyle.secondary, custom_id="scissors")
    async def choose_scissors(self, interaction: discord.Interaction, button: Button):
        await self.cog.handle_choice(interaction, self.game_session, Choice.SCISSORS, self)

# Store active games per channel
active_games: Dict[int, RPSGameSession] = {}

class RockPaperScissors(Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name="rps", description="⚔️ Start a Rock Paper Scissors game")
    @app_commands.describe(amount="Amount to bet (supports K/M/B, commas, A=all, H=half)")
    async def rps(self, interaction: discord.Interaction, amount: str):
        user_id = str(interaction.user.id)
        guild_id = await get_guild_id(interaction)
        
        # Check for existing game in this channel
        if interaction.channel.id in active_games:
            await interaction.response.send_message("❌ There's already an active RPS game in this channel!", ephemeral=True)
            return

        # Check if user has active game
        if await db_manager.is_game_active(user_id, guild_id):
            await interaction.response.send_message("❌ You already have an active game session!", ephemeral=True)
            return

        await db_manager.ensure_user(user_id, interaction.user.display_name)
        wallet, _ = await db_manager.get_balances(user_id, guild_id)

        try:
            from utils.firebase_database import parse_amount
            parsed_amount = parse_amount(amount, wallet)
        except ValueError as e:
            await interaction.response.send_message(f"❌ Invalid amount: {str(e)}", ephemeral=True)
            return

        if parsed_amount < 50:
            await interaction.response.send_message("❌ Minimum bet is $50!", ephemeral=True)
            return

        if parsed_amount > wallet:
            await interaction.response.send_message(f"❌ You don't have enough money! You have {fmt(wallet)} but need {fmt(parsed_amount)}.", ephemeral=True)
            return

        # Deduct money from player 1
        success, new_wallet = await db_manager.adjust_wallet(user_id, guild_id, -parsed_amount)
        if not success:
            await interaction.response.send_message("❌ Transaction failed. Please try again.", ephemeral=True)
            return

        # Set game as active
        await db_manager.set_game_active(user_id, guild_id, "rps", parsed_amount)

        # Create game session
        game_session = RPSGameSession(interaction.user.id, interaction.user.display_name, parsed_amount)
        active_games[interaction.channel.id] = game_session

        # Create embed
        embed = discord.Embed(
            title="⚔️ Rock Paper Scissors Game Created!",
            description=f"**{interaction.user.display_name}** started a game!\n\n"
                       f"💰 **Bet Amount:** {fmt(parsed_amount)} each\n"
                       f"🎯 **Prize Pool:** {fmt(parsed_amount * 2)}\n"
                       f"🎮 **Format:** Best of 3 rounds\n\n"
                       f"**Waiting for another player to join...**",
            color=discord.Color.green()
        )
        embed.set_footer(text="Click 'Join Game' to challenge this player!")

        # Create view
        view = RPSGameView(game_session, self)
        await interaction.response.send_message(embed=embed, view=view)
        # Private prompt to creator
        try:
            await interaction.followup.send("Game created! Waiting for someone to join. You will choose first.", ephemeral=True)
        except Exception:
            pass

    async def handle_join_game(self, interaction: discord.Interaction, game_session: RPSGameSession, view: RPSGameView):
        user_id = str(interaction.user.id)
        guild_id = await get_guild_id(interaction)
        
        if interaction.user.id == game_session.player1_id:
            await interaction.response.send_message("❌ You can't play against yourself!", ephemeral=True)
            return

        if game_session.player2_id is not None:
            await interaction.response.send_message("❌ This game is already full!", ephemeral=True)
            return

        # Check if user has enough money
        await db_manager.ensure_user(user_id, interaction.user.display_name)
        user_wallet, _ = await db_manager.get_balances(user_id, guild_id)
        
        if user_wallet < game_session.pot_amount:
            await interaction.response.send_message(
                f"❌ You need {fmt(game_session.pot_amount)} to join this game! You only have {fmt(user_wallet)}.",
                ephemeral=True
            )
            return

        # Check for active game
        if await db_manager.is_game_active(user_id, guild_id):
            await interaction.response.send_message("❌ You already have an active game session!", ephemeral=True)
            return

        # Deduct pot amount from player 2
        success, new_wallet = await db_manager.adjust_wallet(user_id, guild_id, -game_session.pot_amount)
        if not success:
            await interaction.response.send_message("❌ Transaction failed. Please try again.", ephemeral=True)
            return

        # Set game as active for player 2
        await db_manager.set_game_active(user_id, guild_id, "rps", game_session.pot_amount)

        # Add player 2 to game
        game_session.add_player2(interaction.user.id, interaction.user.display_name)
        game_session.started = True

        # Update view
        view.update_buttons()

        # Create round 1 embed
        embed = discord.Embed(
            title="⚔️ Rock Paper Scissors - Round 1",
            description=f"**{game_session.player1_name}** vs **{game_session.player2_name}**\n\n"
                       f"**{game_session.player1_name}**, make your choice first!\n\n"
                       f"🎮 **Best of 3 rounds**",
            color=discord.Color.blue()
        )
        embed.add_field(name="💰 Prize Pool", value=fmt(game_session.total_pot), inline=True)
        embed.add_field(name="🏆 Score", value="0 - 0", inline=True)
        embed.set_footer(text=f"It’s your turn, {game_session.player1_name} — choose now")

        await interaction.response.edit_message(embed=embed, view=view)
        try:
            await interaction.followup.send("You joined the game! Make your choice when it's your turn.", ephemeral=True)
        except Exception:
            pass

    async def handle_choice(self, interaction: discord.Interaction, game_session: RPSGameSession, choice: Choice, view: RPSGameView):
        """Handle a player's choice without spamming ephemeral messages. Edit the main panel in-place."""
        # Determine which player is making the choice
        if interaction.user.id == game_session.player1_id:
            if game_session.player1_choice:
                try:
                    await interaction.response.send_message("❌ You have already made your choice!", ephemeral=True)
                except Exception:
                    pass
                return
            game_session.player1_choice = choice
            # Hand over turn to player 2
            game_session.current_turn = 2
        elif interaction.user.id == game_session.player2_id:
            if game_session.player2_choice:
                try:
                    await interaction.response.send_message("❌ You have already made your choice!", ephemeral=True)
                except Exception:
                    pass
                return
            game_session.player2_choice = choice
        
        # Check if both players have made their choices
        if game_session.player1_choice and game_session.player2_choice:
            game_session.both_chose = True
            view.update_buttons()
            # Acknowledge quickly so we can edit the original message
            try:
                await interaction.response.defer()
            except Exception:
                pass
            await self.process_round(interaction, game_session, view)
        else:
            # Update the game display to show who has chosen and whose turn it is
            p1_status = "✅ has chosen" if game_session.player1_choice else ("⏳ choosing now" if game_session.current_turn == 1 else "⏳ waiting")
            p2_status = "✅ has chosen" if game_session.player2_choice else ("⏳ choosing now" if game_session.current_turn == 2 else "⏳ waiting")

            description = (f"**{game_session.player1_name}**: {p1_status}\n"
                           f"**{game_session.player2_name or 'Waiting for join'}**: {p2_status}")

            embed = discord.Embed(
                title=f"⚔️ Rock Paper Scissors - Round {game_session.current_round}",
                description=description,
                color=discord.Color.orange()
            )
            embed.add_field(name="💰 Prize Pool", value=fmt(game_session.total_pot), inline=True)
            embed.add_field(name="🏆 Score", value=f"{game_session.player1_wins} - {game_session.player2_wins}", inline=True)
            # Footer cue for whose turn
            current_name = game_session.player1_name if game_session.current_turn == 1 else game_session.player2_name
            embed.set_footer(text=f"It’s your turn, {current_name} — choose now")

            # Edit the message in-place as the response to avoid new ephemerals
            try:
                await interaction.response.edit_message(embed=embed, view=view)
            except Exception:
                try:
                    await interaction.edit_original_response(embed=embed, view=view)
                except Exception:
                    pass

    async def process_round(self, interaction: discord.Interaction, game_session: RPSGameSession, view: RPSGameView):
        # Animate the choices
        choice1, choice2 = game_session.player1_choice, game_session.player2_choice
        
        # Create animation
        anim1 = CHOICE_ANIMATIONS[choice1]
        anim2 = CHOICE_ANIMATIONS[choice2]
        
        for i in range(3):
            embed = discord.Embed(
                title=f"⚔️ Rock Paper Scissors - Round {game_session.current_round}",
                description=f"**{game_session.player1_name}** vs **{game_session.player2_name}**\n\n"
                           f"{anim1[i]} vs {anim2[i]}",
                color=discord.Color.red()
            )
            
            if i == 0:
                try:
                    await interaction.edit_original_response(embed=embed, view=None)
                except Exception:
                    try:
                        await interaction.response.edit_message(embed=embed, view=None)
                    except Exception:
                        pass
            else:
                await interaction.edit_original_response(embed=embed)
            
            await asyncio.sleep(1)

        # Determine winner
        winner = game_session.get_round_winner()
        
        if winner == 1:
            game_session.player1_wins += 1
            result_text = f"🎉 **{game_session.player1_name} wins this round!**"
            result_color = discord.Color.green()
        elif winner == 2:
            game_session.player2_wins += 1
            result_text = f"🎉 **{game_session.player2_name} wins this round!**"
            result_color = discord.Color.green()
        else:
            result_text = "🤝 **It's a tie!**"
            result_color = discord.Color.yellow()

        # Show results
        embed = discord.Embed(
            title=f"⚔️ Round {game_session.current_round} Results",
            description=f"**{game_session.player1_name}** chose {choice1.value} {CHOICE_NAMES[choice1]}\n"
                       f"**{game_session.player2_name}** chose {choice2.value} {CHOICE_NAMES[choice2]}\n\n"
                       f"{result_text}",
            color=result_color
        )
        embed.add_field(name="🏆 Score", value=f"{game_session.player1_wins} - {game_session.player2_wins}", inline=True)
        embed.add_field(name="💰 Prize Pool", value=fmt(game_session.total_pot), inline=True)

        await interaction.edit_original_response(embed=embed, view=None)
        await asyncio.sleep(3)

        # Check if game is over
        game_over, final_winner = game_session.is_game_over()
        
        if game_over:
            await self.end_game(interaction, game_session, final_winner)
        else:
            # Next round
            game_session.current_round += 1
            game_session.reset_choices()
            view.update_buttons()
            
            embed = discord.Embed(
                title=f"⚔️ Rock Paper Scissors - Round {game_session.current_round}",
                description=f"**{game_session.player1_name}** vs **{game_session.player2_name}**\n\n"
                           f"**{game_session.player1_name}**, make your choice first!",
                color=discord.Color.blue()
            )
            embed.add_field(name="💰 Prize Pool", value=fmt(game_session.total_pot), inline=True)
            embed.add_field(name="🏆 Score", value=f"{game_session.player1_wins} - {game_session.player2_wins}", inline=True)
            embed.set_footer(text=f"It’s your turn, {game_session.player1_name} — choose now")
            
            await interaction.edit_original_response(embed=embed, view=view)

    async def end_game(self, interaction: discord.Interaction, game_session: RPSGameSession, winner: Optional[int]):
        guild_id = await get_guild_id(interaction)
        
        # Clear active games
        await db_manager.clear_game_active(str(game_session.player1_id), guild_id)
        await db_manager.clear_game_active(str(game_session.player2_id), guild_id)
        
        if interaction.channel.id in active_games:
            del active_games[interaction.channel.id]

        if winner == 0:  # Tie
            # Refund both players
            await db_manager.adjust_wallet(str(game_session.player1_id), guild_id, game_session.pot_amount)
            await db_manager.adjust_wallet(str(game_session.player2_id), guild_id, game_session.pot_amount)
            
            embed = discord.Embed(
                title="🤝 Game Tied!",
                description=f"**Final Score:** {game_session.player1_wins} - {game_session.player2_wins}\n\n"
                           f"Both players have been refunded {fmt(game_session.pot_amount)}!",
                color=discord.Color.yellow()
            )
        else:
            winner_id = game_session.player1_id if winner == 1 else game_session.player2_id
            winner_name = game_session.player1_name if winner == 1 else game_session.player2_name
            loser_name = game_session.player2_name if winner == 1 else game_session.player1_name
            
            # Give pot to winner
            await db_manager.adjust_wallet(str(winner_id), guild_id, game_session.total_pot)
            
            # Record game result
            await db_manager.record_game_result(str(game_session.player1_id), guild_id, "rps", 
                                               winner == 1, game_session.pot_amount, 
                                               game_session.total_pot if winner == 1 else 0)
            await db_manager.record_game_result(str(game_session.player2_id), guild_id, "rps",
                                               winner == 2, game_session.pot_amount,
                                               game_session.total_pot if winner == 2 else 0)
            
            embed = discord.Embed(
                title="🏆 Game Complete!",
                description=f"**{winner_name}** defeats **{loser_name}**!\n\n"
                           f"**Final Score:** {game_session.player1_wins} - {game_session.player2_wins}\n"
                           f"**Prize Won:** {fmt(game_session.total_pot)}",
                color=discord.Color.gold()
            )
            embed.add_field(name="🎉 Winner", value=winner_name, inline=True)
            embed.add_field(name="💰 Prize", value=fmt(game_session.total_pot), inline=True)

        await interaction.edit_original_response(embed=embed, view=None)


# Setup function
async def setup(bot):
    await bot.add_cog(RockPaperScissors(bot))
