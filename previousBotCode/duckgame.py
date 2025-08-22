"""Duck Game commands and views.
Single-message UI, bank/wallet accounting, and CSPRNG hazard logic.
CONVERTED TO SLASH COMMANDS
"""

import discord
from discord import app_commands
from discord.ui import View, Button
from discord.ext import commands
from discord.ext.commands import Cog
from utils.image_generator import generate_duck_game_image, upload_frame_and_get_url
from utils.rng import get_secure_hazard
from utils.common import game_registry, fmt, fmt_delta_colored, get_guild_id
from utils.common import AutoRefundGameView
from utils.firebase_database import db_manager

import io
import json
import os
import inspect
import asyncio
import time
import logging

# --- Interaction ACK helper --------------------------------------------------
async def _ack(interaction: discord.Interaction):
    """Acknowledge the interaction quickly to avoid 'This interaction failed'.
    Prefer defer_update() for component interactions (buttons); fallback to defer().
    Safe to call more than once.
    """
    try:
        if not interaction.response.is_done():
            # Buttons come through as component interactions; update avoids the pending UI state
            if hasattr(interaction.response, 'defer_update'):
                await interaction.response.defer_update()
            else:
                await interaction.response.defer()
    except Exception:
        # If it's already acknowledged or network hiccup, ignore
        pass

# --- Single-message edit helper ---------------------------------------------
async def _edit_message(msg: discord.Message, **kwargs):
    """Edit a message in place.
    Tries to replace attachments; if the library doesn't support passing files
    during edit on this environment, gracefully falls back to editing only
    text/components so the interaction doesn't crash.
    """
    files = kwargs.pop("files", None)
    try:
        if files is not None:
            try:
                # Some py-cord builds accept attachments=[discord.File, ...]
                await msg.edit(attachments=files, **kwargs)
                return
            except TypeError:
                # Fallback: edit without attachments (keeps existing image)
                pass
        await msg.edit(**kwargs)
    except Exception:
        # Last-resort: swallow to prevent "This interaction failed" banners
        pass

# --- Config / Logging -------------------------------------------------------
LOG = logging.getLogger("duckgame")
if os.getenv("DEBUG_DUCK", "0") == "1":
    LOG.setLevel(logging.DEBUG)
    if not LOG.handlers:
        h = logging.StreamHandler()
        h.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] duckgame: %(message)s"))
        LOG.addHandler(h)

USE_EMBED_UPLOAD = os.getenv("USE_EMBED_UPLOAD", "0") == "1"

def _pil_to_file(pil_img, filename: str) -> discord.File:
    buf = io.BytesIO()
    try:
        pil_img.save(buf, format="PNG")
    except Exception:
        # Fallback to PNG no matter what
        buf.seek(0)
        buf.truncate(0)
        pil_img.save(buf, format="PNG")
    buf.seek(0)
    
    # Create File object with explicit parameters for better compatibility
    file_obj = discord.File(buf, filename=filename)
    
    # Add missing to_dict method for older py-cord versions
    if not hasattr(file_obj, 'to_dict'):
        def to_dict_fallback():
            return {
                'filename': getattr(file_obj, 'filename', filename),
                'fp': getattr(file_obj, 'fp', buf),
                'spoiler': getattr(file_obj, 'spoiler', False),
                'description': getattr(file_obj, 'description', None)
            }
        file_obj.to_dict = to_dict_fallback
    
    return file_obj

# --- Helper: upload or attach image depending on configuration -------------
async def _swap_with_embed(
    bot: commands.Bot,
    msg: discord.Message,
    pil_img,
    filename: str,
    content: str,
    view: discord.ui.View | None,
):
    """
    Edit the message in place. Try multiple approaches for compatibility.
    """
    # Try the most direct approach first - clear attachments then add new one
    try:
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        buf.seek(0)
        
        LOG.debug("Attempting Message.edit with file replacement...")
        # Clear existing attachments first, then add the new one
        await msg.edit(content=content, view=view, attachments=[])
        
        # Now add the new attachment
        buf.seek(0)  # Reset buffer
        file = discord.File(buf, filename=filename) 
        await msg.edit(content=content, view=view, attachments=[file])
        
        LOG.debug("Two-step message edit succeeded.")
        return
        
    except Exception as e:
        LOG.warning("Two-step edit failed: %r", e)

    # Fallback: Use the helper function but check for valid URL
    try:
        LOG.debug("Trying upload helper...")
        file_obj, url = await upload_frame_and_get_url(bot, pil_img, filename)
        
        if url and url != "None":
            # We have a real URL, use embed
            embed = discord.Embed()
            embed.set_image(url=url) 
            await msg.edit(content=content, embed=embed, view=view)
            LOG.debug("Embed edit succeeded.")
        else:
            # No URL, try sending the file object directly
            await msg.edit(content=content, view=view, file=file_obj)
            LOG.debug("Direct file edit succeeded.")
        return
        
    except Exception as e:
        LOG.warning("Upload helper failed: %r", e)

    # Last resort: content only
    try:
        await msg.edit(content=content + "\n*(Image loading failed)*", view=view)
    except Exception as e:
        LOG.error("Content-only edit failed: %r", e) 

# Duck Game specific constants
DUCK_GAME_NAME = "Duck Game"


# -------------------- MODE SELECTION VIEW --------------------
class ModeSelectView(View):
    """Mode picker for Easy/Medium/Hard; transitions to the live game view."""

    def __init__(self, user, amount, wallet_after, username):
        super().__init__(timeout=None)
        self.user = user
        self.amount = float(amount)
        self.wallet_after = wallet_after
        self.wallet_before = float(wallet_after) + float(amount)
        self.username = username
        self.started = False  # prevent multiple sessions from the same mode panel
        self.live_message: discord.Message | None = None

        # mode_name -> (lanes, multipliers)
        self.modes = {
            "Easy": (7, [1.10, 1.15, 1.25, 1.90, 2.20, 2.25, 2.40]),
            "Medium": (5, [1.05, 1.25, 1.70, 2.00, 2.40]),
            "Hard": (3, [1.50, 2.25, 3.00]),
        }

        self.easy_btn = Button(label="🟢 Easy Mode", style=discord.ButtonStyle.success)
        self.med_btn = Button(label="🟡 Medium Mode", style=discord.ButtonStyle.primary)
        self.hard_btn = Button(label="🔴 Hard Mode", style=discord.ButtonStyle.danger)
        self.cancel_btn = Button(label="❌ Cancel Game", style=discord.ButtonStyle.secondary)

        self.easy_btn.callback = self._choose_easy
        self.med_btn.callback = self._choose_med
        self.hard_btn.callback = self._choose_hard
        self.cancel_btn.callback = self._cancel_game

        self.add_item(self.easy_btn)
        self.add_item(self.med_btn)
        self.add_item(self.hard_btn)
        self.add_item(self.cancel_btn)

    async def _launch_mode(self, interaction: discord.Interaction, label: str):
        await _ack(interaction)
        # Prevent duplicate session creation if the user double-clicks
        if self.started:
            # If someone tries again after start, politely tell them
            if interaction.user.id == self.user.id:
                if not interaction.response.is_done():
                    await interaction.followup.send("This game has already started.", ephemeral=True)
                else:
                    await interaction.followup.send("This game has already started.", ephemeral=True)
            else:
                if not interaction.response.is_done():
                    await interaction.followup.send("You cannot choose a mode for someone else's game.", ephemeral=True)
                else:
                    await interaction.followup.send("You cannot choose a mode for someone else's game.", ephemeral=True)
            return

        if interaction.user.id != self.user.id:
            if not interaction.response.is_done():
                await interaction.followup.send("You cannot choose a mode for someone else's game.", ephemeral=True)
            else:
                await interaction.followup.send("You cannot choose a mode for someone else's game.", ephemeral=True)
            return

        # Mark this view as started so additional clicks do nothing
        self.started = True

        # Disable all three mode buttons before any awaits
        for item in self.children:
            try:
                item.disabled = True
            except Exception:
                pass
        try:
            await interaction.message.edit(view=self)
        except Exception:
            pass

        total_lanes, multipliers = self.modes[label]
        # Exclude the last regular lane from hazards; finish (lane N) is always clear
        hazard_pos = get_secure_hazard(total_lanes - 1)
        view = DuckGameView(
            user=self.user,
            amount=self.amount,
            wallet_before=self.wallet_before,
            wallet_after=self.wallet_after,
            multiplier=1.0,
            username=self.username,
            multipliers=multipliers,
            total_lanes=total_lanes,
            hazard_pos=hazard_pos,
            live_message=interaction.message,
        )

        # Initial board: duck in grass (-1), no hazard shown yet
        image = generate_duck_game_image(-1, -1, [], total_slots=total_lanes)

        # Use the selector message as the live game message; no extra sends/deletes
        msg = interaction.message
        view.live_message = msg
        self.live_message = msg

        # Create embed with game image
        embed = discord.Embed(
            title="🦆 Duck Game",
            description=f"**{self.username}** • {label} Mode ({total_lanes} lanes)",
            color=discord.Color.green()
        )
        embed.add_field(name="💰 Current Winnings", value=fmt(self.amount), inline=True)
        embed.add_field(name="📊 Multiplier", value="x1.00", inline=True)
        embed.add_field(name="💼 Wallet", value=fmt(self.wallet_after), inline=True)
        
        # Upload image and set as embed image
        try:
            file_obj, url = await upload_frame_and_get_url(interaction.client, image, "game.png")
            if url and url != "None":
                embed.set_image(url=url)
            else:
                # Fallback: attach file
                buf = io.BytesIO()
                image.save(buf, format="PNG")
                buf.seek(0)
                file_obj = discord.File(buf, filename="game.png")
                embed.set_image(url="attachment://game.png")
                await msg.edit(embed=embed, view=view, attachments=[file_obj])
                return
        except Exception:
            # Final fallback: no image
            embed.add_field(name="🎮 Status", value="Game ready to start", inline=False)
        
        await msg.edit(embed=embed, view=view)

    async def _choose_easy(self, interaction: discord.Interaction):
        await self._launch_mode(interaction, "Easy")

    async def _choose_med(self, interaction: discord.Interaction):
        await self._launch_mode(interaction, "Medium")

    async def _choose_hard(self, interaction: discord.Interaction):
        await self._launch_mode(interaction, "Hard")

    async def _cancel_game(self, interaction: discord.Interaction):
        """Cancel the game and refund the bet amount."""
        if interaction.user.id != self.user.id:
            await interaction.followup.send("❌ You cannot cancel someone else's game.", ephemeral=True)
            return
            
        if self.started:
            await interaction.followup.send("❌ Game has already started and cannot be cancelled.", ephemeral=True)
            return
        
        # Refund the bet amount using database
        user_id = str(self.user.id)
        guild_id = await get_guild_id(interaction)
        await db_manager.adjust_wallet(user_id, guild_id, float(self.amount))
        await db_manager.clear_game_active(user_id, guild_id)
        
        # Remove from game registry
        game_registry.remove_session(self.user.id)
        
        # Disable all buttons
        for item in self.children:
            item.disabled = True
        
        from utils.firebase_database import format_money
        embed = discord.Embed(
            title="🦆 Duck Game - Cancelled",
            description=f"Game cancelled by <@{self.user.id}>\n**Refunded:** {format_money(self.amount)}",
            color=discord.Color.red()
        )
        
        await interaction.response.edit_message(embed=embed, view=self)


# -------------------- GAME VIEW --------------------
class DuckGameView(AutoRefundGameView):
    """Live game view with Forward/Stop; edits a single message in place."""
    def __init__(
        self,
        user,
        amount,
        wallet_before,
        wallet_after,
        multiplier,
        username,
        multipliers,
        total_lanes,
        hazard_pos,
        start_position: int = -1,
        live_message: discord.Message | None = None,
    ):
        super().__init__(timeout=45)  # 45 second timeout with auto-refund
        self.user = user
        self.amount = float(amount)
        
        # Setup auto-refund
        self.setup_auto_refund(str(user.id), amount, "duckgame")
        
        self.position = start_position  # Start position (default grass = -1)
        self.hazard_pos = hazard_pos

        self.wallet_before = float(wallet_before)
        self.wallet_after = float(wallet_after)
        self.multiplier = float(multiplier)
        self.username = username
        self.multipliers = multipliers
        self.total_lanes = total_lanes
        self.live_message = live_message
        self.ended = False  # prevent double payout or multiple endings

        # Compute session winnings correctly based on current position/multiplier.
        # If this view was rebuilt while already on a lane, sync to that lane's multiplier.
        if self.position >= 0:
            if 0 <= self.position < len(self.multipliers):
                self.multiplier = float(self.multipliers[self.position])
            self.session_wallet = float(self.amount) * float(self.multiplier)
        else:
            # In grass, stake equals current session value (x1.0)
            self.session_wallet = float(self.amount)

        # Controls: show only Forward while on grass (-1). Add Stop once on lanes.
        self.forward_button = Button(label="Forward", style=discord.ButtonStyle.success)
        self.forward_button.callback = self.forward_button_callback
        self.add_item(self.forward_button)

        self.stop_button = Button(label="Stop", style=discord.ButtonStyle.danger)
        self.stop_button.callback = self.stop_button_callback
        if self.position >= 0:
            self.add_item(self.stop_button)

    def _disable_view(self):
        for item in self.children:
            try:
                item.disabled = True
            except Exception:
                pass

    async def _freeze_message(self, interaction: discord.Interaction):
        """Disable buttons on the current message to prevent double-clicks."""
        self._disable_view()
        try:
            target = self.live_message or interaction.message
            await _edit_message(target, view=self)
        except Exception:
            pass

    async def forward_button_callback(self, interaction: discord.Interaction):
        await _ack(interaction)
        
        # Mark game as started (prevents timeout refund)
        self.mark_game_started()
        
        if self.ended:
            # Already ended; ignore duplicate clicks gracefully
            if not interaction.response.is_done():
                await interaction.followup.send("This game is already finished.", ephemeral=True)
            else:
                await interaction.followup.send("This game is already finished.", ephemeral=True)
            return
        if interaction.user.id != self.user.id:
            await interaction.followup.send("You cannot control this game.", ephemeral=True)
            return
        # Disable buttons on the old message to avoid duplicate clicks
        await self._freeze_message(interaction)

        # Step forward
        self.position += 1

        # Update multiplier/winnings for a valid lane index
        if 0 <= self.position < len(self.multipliers):
            self.multiplier = self.multipliers[self.position]
            self.session_wallet = self.amount * self.multiplier

        # If we moved past last playable lane, place duck on finish and pay out
        if self.position > self.total_lanes - 1:
            # ensure final multiplier is applied on finish
            if self.multipliers:
                self.multiplier = float(self.multipliers[-1])
            self.session_wallet = float(self.amount) * self.multiplier
            self.ended = True

            image = generate_duck_game_image(self.total_lanes, -1, [], total_slots=self.total_lanes)

            before_wallet = float(self.wallet_before)
            after_wallet  = before_wallet - float(self.amount) + float(self.session_wallet)

            # Use SQLite database instead of JSON
            user_id = str(self.user.id)
            guild_id = await get_guild_id(interaction)
            
            # Credit winnings and clear game session
            winnings = float(self.session_wallet) - float(self.amount)  # Net winnings (could be negative)
            await db_manager.adjust_wallet(user_id, guild_id, winnings)
            await db_manager.clear_game_active(user_id, guild_id)
            
            # Record game statistics
            won = winnings > 0
            await db_manager.record_game_result(user_id, guild_id, "duck_game", won, float(self.amount), float(self.session_wallet))
            
            # Get updated balances
            wallet_balance, bank = await db_manager.get_balances(user_id, guild_id)

            # Create finish embed
            embed = discord.Embed(
                title="🦆 Duck Game - FINISH!",
                description=f"**{self.username}** • You reached the end!",
                color=discord.Color.gold()
            )
            embed.add_field(name="💰 Final Winnings", value=fmt(self.session_wallet), inline=True)
            embed.add_field(name="📊 Final Multiplier", value=f"x{self.multiplier:.2f}", inline=True)
            embed.add_field(name="💼 Wallet", value=f"{fmt(wallet_balance)} {fmt_delta_colored(wallet_balance, before_wallet)}", inline=True)
            
            # Upload image and set as embed image
            try:
                file_obj, url = await upload_frame_and_get_url(interaction.client, image, "finish.png")
                if url and url != "None":
                    embed.set_image(url=url)
                else:
                    buf = io.BytesIO()
                    image.save(buf, format="PNG")
                    buf.seek(0)
                    file_obj = discord.File(buf, filename="finish.png")
                    embed.set_image(url="attachment://finish.png")
                    await (self.live_message or interaction.message).edit(embed=embed, view=None, attachments=[file_obj])
                    game_registry.remove_session(self.user.id)
                    return
            except Exception:
                embed.add_field(name="🎮 Result", value="Game completed successfully!", inline=False)
            
            await (self.live_message or interaction.message).edit(embed=embed, view=None)
            game_registry.remove_session(self.user.id)
            return

        # Crash if we hit the hazard lane
        if self.position == self.hazard_pos:
            image = generate_duck_game_image(self.position, self.hazard_pos, [], total_slots=self.total_lanes)

            before_wallet = float(self.wallet_before)
            after_wallet  = before_wallet - float(self.amount)

            # Use SQLite database instead of JSON
            user_id = str(self.user.id)
            guild_id = await get_guild_id(interaction)
            
            # Player lost - no winnings to credit (money already deducted at game start)
            await db_manager.clear_game_active(user_id, guild_id)
            
            # Record game statistics (loss)
            await db_manager.record_game_result(user_id, guild_id, "duck_game", False, float(self.amount), 0.0)
            
            # Get updated balances
            wallet_balance, bank = await db_manager.get_balances(user_id, guild_id)

            self.session_wallet = 0.0
            self.ended = True

            # Create crash embed
            embed = discord.Embed(
                title="🦆 Duck Game - CRASHED!",
                description=f"**{self.username}** • The duck got hit by a car!",
                color=discord.Color.red()
            )
            embed.add_field(name="💥 Amount Lost", value=fmt(self.amount), inline=True)
            embed.add_field(name="📊 Multiplier", value=f"x{self.multiplier:.2f}", inline=True)
            embed.add_field(name="💼 Wallet", value=f"{fmt(wallet_balance)} {fmt_delta_colored(wallet_balance, before_wallet)}", inline=True)
            
            # Upload image and set as embed image
            try:
                file_obj, url = await upload_frame_and_get_url(interaction.client, image, "crash.png")
                if url and url != "None":
                    embed.set_image(url=url)
                else:
                    buf = io.BytesIO()
                    image.save(buf, format="PNG")
                    buf.seek(0)
                    file_obj = discord.File(buf, filename="crash.png")
                    embed.set_image(url="attachment://crash.png")
                    await (self.live_message or interaction.message).edit(embed=embed, view=None, attachments=[file_obj])
                    game_registry.remove_session(self.user.id)
                    return
            except Exception:
                embed.add_field(name="🎮 Result", value="Game over - crashed!", inline=False)
            
            await (self.live_message or interaction.message).edit(embed=embed, view=None)
            game_registry.remove_session(self.user.id)
            return

        # Safe move within lanes
        image = generate_duck_game_image(self.position, -1, [], total_slots=self.total_lanes)

        # Show the post-bet wallet we already computed at start, and correct delta vs before
        before_wallet = float(self.wallet_before)
        after_bet_wallet = float(self.wallet_after)

        # Bank value (purely for display)
        user_id = str(self.user.id)
        guild_id = await get_guild_id(interaction)
        _, bank = await db_manager.get_balances(user_id, guild_id)

        new_view = DuckGameView(
            user=self.user,
            amount=self.amount,
            wallet_before=self.wallet_before,
            wallet_after=self.wallet_after,
            multiplier=self.multiplier,
            username=self.username,
            multipliers=self.multipliers,
            total_lanes=self.total_lanes,
            hazard_pos=self.hazard_pos,
            start_position=self.position,
            live_message=self.live_message or interaction.message,
        )

        # Create safe move embed
        embed = discord.Embed(
            title="🦆 Duck Game",
            description=f"**{self.username}** • Duck moved forward safely!",
            color=discord.Color.green()
        )
        embed.add_field(name="💰 Current Winnings", value=fmt(self.session_wallet), inline=True)
        embed.add_field(name="📊 Multiplier", value=f"x{self.multiplier:.2f}", inline=True)
        embed.add_field(name="💼 Wallet", value=f"{fmt(after_bet_wallet)} {fmt_delta_colored(after_bet_wallet, before_wallet)}", inline=True)
        
        # Upload image and set as embed image
        try:
            file_obj, url = await upload_frame_and_get_url(interaction.client, image, "safe.png")
            if url and url != "None":
                embed.set_image(url=url)
            else:
                buf = io.BytesIO()
                image.save(buf, format="PNG")
                buf.seek(0)
                file_obj = discord.File(buf, filename="safe.png")
                embed.set_image(url="attachment://safe.png")
                await (self.live_message or interaction.message).edit(embed=embed, view=new_view, attachments=[file_obj])
                new_view.live_message = self.live_message or interaction.message
                return
        except Exception:
            embed.add_field(name="🎮 Status", value="Duck is safe!", inline=False)
        
        await (self.live_message or interaction.message).edit(embed=embed, view=new_view)
        new_view.live_message = self.live_message or interaction.message

    async def stop_button_callback(self, interaction: discord.Interaction):
        await _ack(interaction)
        
        # Mark game as started (prevents timeout refund)
        self.mark_game_started()
        
        if self.ended:
            if not interaction.response.is_done():
                await interaction.followup.send("This game is already finished.", ephemeral=True)
            else:
                await interaction.followup.send("This game is already finished.", ephemeral=True)
            return
        if interaction.user.id != self.user.id:
            await interaction.followup.send("You cannot control this game.", ephemeral=True)
            return
        # Disable buttons on the old message to avoid duplicate clicks
        await self._freeze_message(interaction)
        self.ended = True

        # Ensure we apply the multiplier for the lane we're currently on.
        if 0 <= self.position < len(self.multipliers):
            self.multiplier = float(self.multipliers[self.position])
        self.session_wallet = float(self.amount) * float(self.multiplier)

        before_wallet = float(self.wallet_before)
        after_wallet  = before_wallet - float(self.amount) + float(self.session_wallet)

        # Use SQLite database instead of JSON
        user_id = str(self.user.id)
        guild_id = await get_guild_id(interaction)
        
        # Credit winnings and clear game session
        winnings = float(self.session_wallet) - float(self.amount)  # Net winnings
        await db_manager.adjust_wallet(user_id, guild_id, winnings)
        await db_manager.clear_game_active(user_id, guild_id)
        
        # Record game statistics (win since they stopped voluntarily)
        won = winnings > 0
        await db_manager.record_game_result(user_id, guild_id, "duck_game", won, float(self.amount), float(self.session_wallet))
        
        # Get updated balances
        wallet_balance, bank = await db_manager.get_balances(user_id, guild_id)

        self.clear_items()
        image = generate_duck_game_image(self.position, -1, [], total_slots=self.total_lanes)

        # Create cashout embed
        embed = discord.Embed(
            title="🦆 Duck Game - Cashed Out!",
            description=f"**{self.username}** • You stopped and cashed out!",
            color=discord.Color.blue()
        )
        embed.add_field(name="💰 Final Winnings", value=fmt(self.session_wallet), inline=True)
        embed.add_field(name="📊 Final Multiplier", value=f"x{self.multiplier:.2f}", inline=True)
        embed.add_field(name="💼 Wallet", value=f"{fmt(wallet_balance)} {fmt_delta_colored(wallet_balance, before_wallet)}", inline=True)
        
        # Upload image and set as embed image
        try:
            file_obj, url = await upload_frame_and_get_url(interaction.client, image, "cashout.png")
            if url and url != "None":
                embed.set_image(url=url)
            else:
                buf = io.BytesIO()
                image.save(buf, format="PNG")
                buf.seek(0)
                file_obj = discord.File(buf, filename="cashout.png")
                embed.set_image(url="attachment://cashout.png")
                await (self.live_message or interaction.message).edit(embed=embed, view=None, attachments=[file_obj])
                game_registry.remove_session(self.user.id)
                return
        except Exception:
            embed.add_field(name="🎮 Result", value="Successfully cashed out!", inline=False)
        
        await (self.live_message or interaction.message).edit(embed=embed, view=None)
        game_registry.remove_session(self.user.id)




# -------------------- COG WITH SLASH COMMANDS --------------------
class DuckGame(Cog):
    def __init__(self, bot):
        self.bot = bot
        # Register this game with the registry
        game_registry.register_game("Duck Game", self.__class__, "Cross the road without getting hit by cars!")

    @app_commands.command(name="testduck", description="🧪 Generate a sample Duck Game board image for testing.")
    @app_commands.describe(lanes="Number of lanes (default: 5)")
    async def testduck_command(self, interaction: discord.Interaction, lanes: int = 5):
        """Quick sanity check: renders a board with the duck in grass and no hazards."""
        try:
            image = generate_duck_game_image(-1, -1, [], total_slots=int(lanes))
            buf = io.BytesIO()
            image.save(buf, format="PNG")
            buf.seek(0)
            await interaction.followup.send(
                "🧪 Test board generated.", 
                file=discord.File(buf, filename="test_board.png")
            )
        except Exception as e:
            await interaction.followup.send(f"❌ Failed to generate test board: {e}")

    @app_commands.command(name="testimage", description="🖼️ Render a custom test board.")
    @app_commands.describe(
        lanes="Total playable lanes (>=1)",
        pos="Duck position (-1 for grass, 0..lanes for finish)",
        hazard="Hazard lane index (-1 for none, 0..lanes-1 for a car on that lane)"
    )
    async def testimage_command(self, interaction: discord.Interaction, lanes: int = 5, pos: int = -1, hazard: int = -1):
        """Render a board with custom lane count, duck position, and hazard index."""
        try:
            lanes = max(1, int(lanes))
            # clamp pos into [-1, lanes] so finish is allowed
            pos = max(-1, min(int(pos), lanes))
            # clamp hazard into [-1, lanes-1]
            hazard = int(hazard)
            if hazard < -1 or hazard > lanes - 1:
                hazard = -1

            image = generate_duck_game_image(pos, hazard, [], total_slots=lanes)
            buf = io.BytesIO()
            image.save(buf, format="PNG")
            buf.seek(0)
            await interaction.followup.send(
                f"🧪 Test image generated. lanes={lanes}, pos={pos}, hazard={hazard}",
                file=discord.File(buf, filename="test_board.png"),
            )
        except Exception as e:
            await interaction.followup.send(f"❌ Failed to generate test image: {e}")

    @app_commands.command(name="testwin", description="💰 DEV: Credit winnings to your wallet to verify accounting.")
    @app_commands.describe(
        amount="Amount to test with",
        multiplier="Multiplier to apply"
    )
    async def testwin_command(self, interaction: discord.Interaction, amount: float, multiplier: float):
        """DEV utility: Adds amount*multiplier to your wallet and shows before/after."""
        try:
            amount = float(amount)
            multiplier = float(multiplier)
            if amount <= 0 or multiplier <= 0:
                await interaction.followup.send("❌ Amount and multiplier must be greater than 0.")
                return
        except Exception:
            await interaction.followup.send("❌ Amount and multiplier must be valid numbers.")
            return

        # Use SQLite database instead of JSON
        user_id = str(interaction.user.id)
        guild_id = await get_guild_id(interaction)
        
        await db_manager.ensure_user(user_id, interaction.user.display_name)
        before, _ = await db_manager.get_balances(user_id, guild_id)
        winnings = float(amount) * float(multiplier)
        await db_manager.adjust_wallet(user_id, guild_id, winnings)
        after, _ = await db_manager.get_balances(user_id, guild_id)

        await interaction.followup.send(
            f"🧪 Test win credited to <@{interaction.user.id}>\n"
            f"Amount: {fmt(amount)} × x{multiplier:.2f} = **{fmt(winnings)}**\n"
            f"Wallet before: {fmt(before)} → after: {fmt(after)} {fmt_delta_colored(after, before)}"
        )



    @app_commands.command(name="duck", description="🦆 Start the Duck Game and choose a mode.")
    @app_commands.describe(amount="Bet amount (use K/M/B suffixes, 'A' for all, 'H' for half)")
    async def duck_command(self, interaction: discord.Interaction, amount: str):
        # Check maintenance mode first
        from utils.common import check_maintenance_mode
        if await check_maintenance_mode(interaction):
            return
        
        # Defer the response to prevent timeout
        await interaction.response.defer()
        
        # Use database instead of JSON files
        user_id = str(interaction.user.id)
        guild_id = await get_guild_id(interaction)
        
        # Check if user has active game
        if await db_manager.is_game_active(user_id, guild_id):
            await interaction.followup.send("❌ You already have an active game session.", ephemeral=True)
            return

        # Get user balances
        user_wallet, _ = await db_manager.get_balances(user_id, guild_id)

        # Parse amount with K/M/B support
        try:
            from utils.firebase_database import parse_amount
            parsed_amount = parse_amount(amount, user_wallet)
            
            if parsed_amount <= 0:
                await interaction.followup.send("❌ Bet must be greater than 0.", ephemeral=True)
                return
                
            if parsed_amount > user_wallet:
                await interaction.followup.send("❌ You don't have enough funds to bet that amount.", ephemeral=True)
                return
                
        except ValueError as e:
            await interaction.followup.send(f"❌ Invalid bet amount: {e}", ephemeral=True)
            return

        # Deduct amount and mark game as active
        try:
            await db_manager.ensure_user(user_id, interaction.user.display_name)
            success, new_wallet = await db_manager.adjust_wallet(user_id, guild_id, -parsed_amount)
            if not success:
                await interaction.followup.send("❌ Insufficient funds for this bet.", ephemeral=True)
                return
                
            await db_manager.set_game_active(user_id, guild_id, "duck_game", parsed_amount, {
                "mode": None,  # Will be set when mode is selected
                "bet_amount": parsed_amount
            })
        except Exception as e:
            await interaction.followup.send(f"❌ Database error: {e}", ephemeral=True)
            return

        game_registry.add_session(interaction.user.id)

        # Get updated balance after deduction
        user_wallet, bank = await db_manager.get_balances(user_id, guild_id)
        view = ModeSelectView(interaction.user, parsed_amount, user_wallet, f"<@{interaction.user.id}>")

        easy = ", ".join([f"x{m:.2f}" for m in view.modes["Easy"][1]])
        med = ", ".join([f"x{m:.2f}" for m in view.modes["Medium"][1]])
        hard = ", ".join([f"x{m:.2f}" for m in view.modes["Hard"][1]])
        
        # Create a professional embed panel
        from utils.firebase_database import format_money
        embed = discord.Embed(
            title="🦆 Duck Game - Mode Selection",
            description=f"**Player:** <@{interaction.user.id}>\n**Bet Amount:** {format_money(parsed_amount)}",
            color=discord.Color.blurple()
        )
        
        embed.add_field(
            name="🟢 Easy Mode (7 lanes)",
            value=f"Multipliers: {easy}\n*Best for beginners*",
            inline=False
        )
        
        embed.add_field(
            name="🟡 Medium Mode (5 lanes)", 
            value=f"Multipliers: {med}\n*Balanced risk and reward*",
            inline=False
        )
        
        embed.add_field(
            name="🔴 Hard Mode (3 lanes)",
            value=f"Multipliers: {hard}\n*High risk, high reward*",
            inline=False
        )
        
        embed.set_footer(text=f"💼 Wallet: {format_money(user_wallet)} | 🏦 Bank: {format_money(bank)}")
        
        await interaction.followup.send(embed=embed, view=view)

# Expose setup for bot integration
async def setup(bot):
    cog = DuckGame(bot)
    add_cog = getattr(bot, "add_cog")
    if inspect.iscoroutinefunction(add_cog):
        await add_cog(cog)
    else:
        add_cog(cog)
