"""Plinko Game commands and views.
A ball drops down through pegs and lands in multiplier slots at the bottom.
Higher risk modes have higher multipliers but less predictable outcomes.
"""

import discord
from discord import app_commands
from discord.ui import View, Button
from discord.ext import commands
from discord.ext.commands import Cog
from utils.common import game_registry, fmt, fmt_delta_colored, get_guild_id
from utils.game_utils import AdminUtils, GameType, GameEmbeds
from utils.firebase_database import db_manager

import asyncio
import secrets
import logging
from typing import Tuple, List
from PIL import Image, ImageDraw, ImageFont
import io
import math
import random

# Add uniform function from secrets module
if not hasattr(secrets, 'uniform'):
    import random
    secrets.uniform = random.uniform

# --- Plinko Game Constants (MUCH HARDER & BALANCED FOR ECONOMY) -------------------------
PLINKO_MODES = {
    "Easy": {
        "rows": 8,
        "multipliers": [0.1, 0.3, 0.5, 0.8, 1.5, 0.8, 0.5, 0.3, 0.1],
        "description": "Safest option with lower win potential. 75% house edge.",
        "color": discord.Color.green(),
        "emoji": "🟢",
        "house_edge": 0.75
    },
    "Medium": {
        "rows": 12,
        "multipliers": [0.0, 0.1, 0.2, 0.4, 0.6, 1.0, 2.5, 1.0, 0.6, 0.4, 0.2, 0.1, 0.0],
        "description": "Moderate risk with decent win potential. 85% house edge.",
        "color": discord.Color.orange(),
        "emoji": "🟠",
        "house_edge": 0.85
    },
    "Hard": {
        "rows": 16,
        "multipliers": [0.0, 0.0, 0.1, 0.2, 0.3, 0.5, 0.8, 1.5, 15.0, 1.5, 0.8, 0.5, 0.3, 0.2, 0.1, 0.0, 0.0],
        "description": "High risk gambling with big win potential. 92% house edge.",
        "color": discord.Color.red(),
        "emoji": "🔴",
        "house_edge": 0.92
    },
    "Nightmare": {
        "rows": 20,
        # Nightmare: place 25x four slots away from each end; center remains very low
        # Indices 4 and 14 hold 25x; ends are extremely harsh
        "multipliers": [0.0, 0.0, 0.0, 0.1, 25.0, 0.2, 0.3, 0.5, 0.1, 0.1, 0.1, 0.5, 0.3, 0.2, 25.0, 0.1, 0.0, 0.0, 0.0],
        "description": "💀 NIGHTMARE MODE 💀 - Extreme risk, massive rewards! 97% house edge.",
        "color": discord.Color.from_rgb(139, 0, 139),  # Dark magenta
        "emoji": "💀",
        "house_edge": 0.97
    }
}

LOG = logging.getLogger("plinko")


def randomize_multipliers(base_multipliers: List[float]) -> List[float]:
    """
    Randomize the position of multipliers while maintaining game balance.
    Keeps the same multipliers but shuffles their positions.
    """
    # Create a copy to avoid modifying the original
    multipliers = base_multipliers.copy()

    # Shuffle the multipliers randomly
    random.shuffle(multipliers)

    return multipliers

# --- Plinko Visual Generation with Pillow ----------------------------------


def create_plinko_image(rows: int, slots: int, multipliers: List[float], ball_path: List[float] = None,
                        ball_row: int = -1, mode_name: str = "Easy", winning_slot: int = None) -> io.BytesIO:
    """
    Create a perfectly aligned visual Plinko board using Pillow with enhanced readability.
    """
    # Enhanced image dimensions for better clarity
    width = 900
    height = 700
    peg_radius = 10
    ball_radius = 15

    # Enhanced colors based on mode with better contrast
    mode_colors = {
        "Easy": {"bg": (25, 25, 35), "peg": (220, 220, 220), "ball": (255, 100, 50), "accent": (76, 175, 80)},
        "Medium": {"bg": (25, 25, 35), "peg": (220, 220, 220), "ball": (255, 100, 50), "accent": (33, 150, 243)},
        "Hard": {"bg": (25, 25, 35), "peg": (220, 220, 220), "ball": (255, 100, 50), "accent": (244, 67, 54)},
        "Nightmare": {"bg": (15, 15, 25), "peg": (200, 150, 255), "ball": (255, 100, 255), "accent": (156, 39, 176)}
    }

    colors = mode_colors.get(mode_name, mode_colors["Easy"])

    # Create image with gradient background
    img = Image.new('RGB', (width, height), colors["bg"])
    draw = ImageDraw.Draw(img)

    # Create subtle gradient background
    for y in range(height):
        gradient_factor = 1 - (y / height) * 0.3
        bg_color = tuple(int(c * gradient_factor) for c in colors["bg"])
        draw.line([(0, y), (width, y)], fill=bg_color)

    # Calculate perfect peg alignment
    board_margin = 80
    board_width = width - (2 * board_margin)
    peg_area_height = height - 220  # More space for multipliers
    peg_start_y = 100
    row_spacing = peg_area_height / (rows + 1)

    # Load enhanced fonts with fallbacks
    try:
        font_title = ImageFont.truetype(
            "/System/Library/Fonts/Arial Bold.ttf", 42)
        font_large = ImageFont.truetype(
            "/System/Library/Fonts/Arial Bold.ttf", 28)
        font_medium = ImageFont.truetype(
            "/System/Library/Fonts/Arial Bold.ttf", 22)
        font_small = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 18)
    except:
        try:
            font_title = ImageFont.truetype(
                "/System/Library/Fonts/Arial.ttf", 42)
            font_large = ImageFont.truetype(
                "/System/Library/Fonts/Arial.ttf", 28)
            font_medium = ImageFont.truetype(
                "/System/Library/Fonts/Arial.ttf", 22)
            font_small = ImageFont.truetype(
                "/System/Library/Fonts/Arial.ttf", 18)
        except:
            font_title = font_large = font_medium = font_small = ImageFont.load_default()

    # Enhanced title with glow effect
    title_text = f"🎯 PLINKO - {mode_name.upper()} MODE"
    title_bbox = draw.textbbox((0, 0), title_text, font=font_title)
    title_width = title_bbox[2] - title_bbox[0]
    title_x = (width - title_width) // 2
    title_y = 25

    # Title glow effect
    for offset in [(2, 2), (1, 1), (0, 0)]:
        title_color = (100, 100, 100) if offset != (0, 0) else (255, 255, 255)
        draw.text((title_x + offset[0], title_y + offset[1]),
                  title_text, fill=title_color, font=font_title)

    # Draw perfectly aligned peg grid - MUST MATCH SLOT ALIGNMENT
    peg_positions = []
    slot_width = board_width / slots  # Use exact same slot width for alignment

    # Draw faint vertical separators by mode grouping (Nightmare=4, others=5)
    group_size = 4 if mode_name == "Nightmare" else 5
    separator_color = (
        90, 70, 120) if mode_name == "Nightmare" else (70, 70, 90)
    for g in range(group_size, slots, group_size):
        x = board_margin + g * slot_width
        # Draw from a little above the first peg row down past the slot area
        y_top = max(peg_start_y - 20, 60)
        # slot_area_y defined later; compute here to avoid duplication
        slot_area_y_preview = height - 180
        y_bottom = slot_area_y_preview + 80 + 10
        draw.line([(x, y_top), (x, y_bottom)], fill=separator_color, width=2)

    for row in range(rows):
        y = peg_start_y + row * row_spacing

        # Create traditional Plinko pattern - alternating rows
        # Odd rows have pegs offset from even rows for proper bouncing
        if row % 2 == 0:
            # Even rows: pegs aligned with slot boundaries
            pegs_in_row = slots + 1
            row_pegs = []
            for peg in range(pegs_in_row):
                x = board_margin + peg * slot_width
                row_pegs.append((x, y))
        else:
            # Odd rows: pegs offset by half a slot width for staggered pattern
            pegs_in_row = slots
            row_pegs = []
            for peg in range(pegs_in_row):
                x = board_margin + (peg + 0.5) * slot_width
                row_pegs.append((x, y))

        # Draw pegs with uniform, clean design
        for x, y in row_pegs:
            # Determine peg color based on position (add visual variety)
            if row < rows * 0.3:
                peg_color = (180, 180, 180)  # Light gray for top
            elif row < rows * 0.6:
                peg_color = (160, 160, 160)  # Medium gray for middle
            else:
                peg_color = (140, 140, 140)  # Darker gray for bottom

            # Simple, clean peg design
            # Shadow/depth
            draw.ellipse([x - peg_radius + 1, y - peg_radius + 1,
                         x + peg_radius + 1, y + peg_radius + 1],
                         fill=(60, 60, 60))
            # Main peg
            draw.ellipse([x - peg_radius, y - peg_radius,
                         x + peg_radius, y + peg_radius],
                         fill=peg_color)
            # Simple highlight
            draw.ellipse([x - peg_radius + 2, y - peg_radius + 2,
                         x - peg_radius + 5, y - peg_radius + 5],
                         fill=(255, 255, 255))

        peg_positions.append(row_pegs)

    # Draw ball with enhanced effects - MUST MATCH SLOT COORDINATE SYSTEM
    if ball_path and ball_row >= -1:
        if ball_row == -1:  # Ball above board
            ball_x = width // 2
            ball_y = 75
        elif ball_row < rows and ball_row < len(ball_path):
            # CRITICAL: Ball positioning must use slot coordinate system
            ball_pos = ball_path[ball_row]

            # Map ball position directly to slot coordinate system
            # ball_pos ranges from -(slots-1)/2 to +(slots-1)/2
            # Convert to slot index, then to X coordinate
            # Convert to 0-based slot position
            slot_position = ball_pos + ((slots - 1) / 2)
            # Clamp to valid range
            slot_position = max(0, min(slots - 1, slot_position))

            # Use exact same coordinate system as slots
            ball_x = board_margin + (slot_position + 0.5) * slot_width
            ball_y = peg_start_y + ball_row * row_spacing
        else:
            # Ball in final landing position - use winning_slot if provided
            if winning_slot is not None:
                final_slot = winning_slot
            elif ball_path:
                final_slot = int(ball_path[-1] + ((slots - 1) / 2) + 0.5)
                final_slot = max(0, min(slots - 1, final_slot))
            else:
                final_slot = slots // 2

            # EXACT same coordinate calculation as slots
            ball_x = board_margin + (final_slot + 0.5) * slot_width
            ball_y = height - 150

        # Enhanced ball with multiple glow layers
        for radius_offset in [8, 6, 4, 2, 0]:
            radius = ball_radius + radius_offset
            if radius_offset > 0:
                alpha_color = tuple(int(c * 0.3) for c in colors["ball"])
            else:
                alpha_color = colors["ball"]

            draw.ellipse([ball_x - radius, ball_y - radius,
                         ball_x + radius, ball_y + radius],
                         fill=alpha_color)

        # Ball highlight
        draw.ellipse([ball_x - ball_radius + 5, ball_y - ball_radius + 5,
                     ball_x - ball_radius + 9, ball_y - ball_radius + 9],
                     fill=(255, 255, 255))

    # Draw perfectly aligned multiplier slots
    slot_area_y = height - 180
    slot_width = board_width / slots
    slot_height = 80

    for i, multiplier in enumerate(multipliers):
        x = board_margin + i * slot_width

        # Enhanced color scheme for multipliers
        if multiplier >= 50.0:
            slot_color = (255, 215, 0)  # Gold
            text_color = (0, 0, 0)
        elif multiplier >= 10.0:
            slot_color = (255, 165, 0)  # Orange
            text_color = (255, 255, 255)
        elif multiplier >= 2.0:
            slot_color = (76, 175, 80)  # Green
            text_color = (255, 255, 255)
        elif multiplier >= 1.0:
            slot_color = (33, 150, 243)  # Blue
            text_color = (255, 255, 255)
        elif multiplier >= 0.1:
            slot_color = (244, 67, 54)  # Red
            text_color = (255, 255, 255)
        else:
            slot_color = (97, 97, 97)  # Gray
            text_color = (200, 200, 200)

        # Highlight winning slot
        if winning_slot is not None and i == winning_slot:
            # Glowing border for winning slot
            for border_width in [8, 6, 4, 2]:
                border_color = tuple(min(255, c + 100) for c in slot_color)
                draw.rectangle([x - border_width, slot_area_y - border_width,
                                x + slot_width + border_width, slot_area_y + slot_height + border_width],
                               outline=border_color, width=2)

        # Draw slot with enhanced border
        draw.rectangle([x, slot_area_y, x + slot_width - 2, slot_area_y + slot_height],
                       fill=slot_color, outline=(255, 255, 255), width=3)

        # Draw slot number at top
        slot_num = f"#{i + 1}"
        num_bbox = draw.textbbox((0, 0), slot_num, font=font_small)
        num_width = num_bbox[2] - num_bbox[0]
        num_x = x + (slot_width - num_width) // 2
        draw.text((num_x + 1, slot_area_y + 5), slot_num,
                  fill=(0, 0, 0), font=font_small)
        draw.text((num_x, slot_area_y + 4), slot_num,
                  fill=(255, 255, 255), font=font_small)

        # Draw multiplier text with enhanced readability
        mult_text = f"{multiplier:.1f}x"
        if multiplier >= 10:
            # Remove decimal for large numbers
            mult_text = f"{multiplier:.0f}x"

        text_bbox = draw.textbbox((0, 0), mult_text, font=font_medium)
        text_width = text_bbox[2] - text_bbox[0]
        text_height = text_bbox[3] - text_bbox[1]
        text_x = x + (slot_width - text_width) // 2
        text_y = slot_area_y + (slot_height - text_height) // 2 + 10

        # Text with strong outline for readability
        for offset_x in [-1, 0, 1]:
            for offset_y in [-1, 0, 1]:
                if offset_x != 0 or offset_y != 0:
                    draw.text((text_x + offset_x, text_y + offset_y),
                              mult_text, fill=(0, 0, 0), font=font_medium)
        draw.text((text_x, text_y), mult_text,
                  fill=text_color, font=font_medium)

    # Draw group labels (G1..Gn) centered under each group (Nightmare=4, others=5)
    total_groups = (slots + group_size - 1) // group_size
    label_y = slot_area_y + slot_height + 12
    for g in range(total_groups):
        start_idx = g * group_size
        end_idx = min(slots - 1, start_idx + group_size - 1)
        # Center X between start and end slot centers
        center_slot_pos = (start_idx + 0.5 + end_idx + 0.5) / 2.0
        label_x = board_margin + center_slot_pos * slot_width
        label_text = f"G{g + 1}"
        # Draw outlined text for readability
        bbox = draw.textbbox((0, 0), label_text, font=font_small)
        w = bbox[2] - bbox[0]
        lx = label_x - w / 2
        for ox in [-1, 0, 1]:
            for oy in [-1, 0, 1]:
                if ox != 0 or oy != 0:
                    draw.text((lx + ox, label_y + oy), label_text,
                              fill=(0, 0, 0), font=font_small)
        draw.text((lx, label_y), label_text, fill=(
            220, 220, 220), font=font_small)

    # Add landing indicator if ball has landed
    if winning_slot is not None:
        # EXACT positioning to match slot center
        indicator_y = slot_area_y - 35
        indicator_x = board_margin + \
            (winning_slot + 0.5) * slot_width  # Exact slot center

        # Draw larger, more visible arrow pointing to winning slot
        arrow_points = [
            (indicator_x, indicator_y),
            (indicator_x - 20, indicator_y - 25),
            (indicator_x - 8, indicator_y - 25),
            (indicator_x - 8, indicator_y - 35),
            (indicator_x + 8, indicator_y - 35),
            (indicator_x + 8, indicator_y - 25),
            (indicator_x + 20, indicator_y - 25)
        ]

        # Arrow with glow effect
        for width_offset in [4, 2, 0]:
            arrow_color = (200, 200, 0) if width_offset > 0 else (255, 255, 0)
            # Offset arrow for glow
            offset_points = [(x, y + width_offset) for x, y in arrow_points]
            draw.polygon(offset_points, fill=arrow_color,
                         outline=(255, 255, 255), width=2)

        # "BALL LANDED" text with slot number
        landed_text = f"BALL LANDED IN SLOT #{winning_slot + 1}!"
        landed_bbox = draw.textbbox((0, 0), landed_text, font=font_small)
        landed_width = landed_bbox[2] - landed_bbox[0]
        landed_x = indicator_x - landed_width // 2
        landed_y = indicator_y - 55

        # Text with strong outline for visibility
        for offset_x in [-1, 0, 1]:
            for offset_y in [-1, 0, 1]:
                if offset_x != 0 or offset_y != 0:
                    draw.text((landed_x + offset_x, landed_y + offset_y),
                              landed_text, fill=(0, 0, 0), font=font_small)
        draw.text((landed_x, landed_y), landed_text,
                  fill=(255, 255, 0), font=font_small)

    # Convert to bytes
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='PNG', quality=95, optimize=True)
    img_bytes.seek(0)
    return img_bytes


def create_plinko_animation_frames_visual(rows: int, slots: int, path: List[float],
                                          multipliers: List[float], mode_name: str, final_slot: int = None) -> List[io.BytesIO]:
    """
    Create multiple visual frames for Plinko animation using Pillow with perfect alignment.
    """
    frames = []

    # Initial frame - ball ready to drop
    frame = create_plinko_image(rows, slots, multipliers, None, -1, mode_name)
    frames.append(frame)

    # Animation frames showing ball movement through pegs
    for i in range(min(len(path), rows + 2)):
        frame = create_plinko_image(
            rows, slots, multipliers, path, i, mode_name)
        frames.append(frame)

    # Final frame with landing indicator
    if final_slot is not None:
        final_frame = create_plinko_image(
            rows, slots, multipliers, path, rows + 1, mode_name, final_slot)
        frames.append(final_frame)

    return frames


LOG = logging.getLogger("plinko")

# --- Plinko Simulation Logic ------------------------------------------------


def simulate_plinko_drop(rows: int, slots: int, start_position: float = None) -> Tuple[int, List[float]]:
    """
    Simulate a Plinko ball drop with path tracking that perfectly aligns with visual slots.
    Returns (final_slot_index, path_positions).
    """
    # Start position in slot coordinate system (center if not provided)
    position = 0.0 if start_position is None else float(start_position)
    path = [position]  # Track the ball's path

    # Maximum deviation should align with slot boundaries
    max_deviation = (slots - 1) / 2  # Can reach from slot 0 to slot N-1
    initial = position

    for row in range(rows):
        # Enhanced physics with momentum and realistic bouncing
        momentum_bias = 0.0
        if row > 0:
            # Calculate momentum based on previous movement
            momentum = path[-1] - path[-2] if len(path) >= 2 else 0.0
            momentum_bias = momentum * 0.25  # Reduced momentum for better distribution

        # Determine bounce direction with physics
        if secrets.randbelow(100) < 30 and abs(momentum_bias) > 0.1:
            # 30% chance to follow momentum
            bounce = momentum_bias + secrets.uniform(-0.4, 0.4)
        else:
            # 70% chance for random bounce with peg interaction
            bounce = secrets.uniform(-1.0, 1.0)

        # Apply gravity bias (very slight center pull)
        gravity_bias = -position * 0.03
        bounce += gravity_bias

        # Early-row bias from starting side to respect initial drop location
        if initial != 0.0:
            start_sign = 1.0 if initial > 0 else -1.0
            # Decay bias over rows; stronger in first few rows
            decay = max(0.0, 1.0 - (row / max(1.0, rows))) ** 1.5
            bounce += start_sign * secrets.uniform(0.0, 0.25) * decay

        position += bounce

        # CRITICAL: Bounds must match slot system exactly
        # Allow movement from -max_deviation to +max_deviation
        # This maps to slot 0 through slot N-1
        position = max(-max_deviation, min(max_deviation, position))

        path.append(position)

    # Convert final position to slot index - MUST BE EXACT
    # position ranges from -max_deviation to +max_deviation
    # Convert to slot index 0 to slots-1
    slot_index = int(position + ((slots - 1) / 2) +
                     0.5)  # +0.5 for proper rounding

    # Ensure we're within bounds (safety check)
    slot_index = max(0, min(slots - 1, slot_index))

    return slot_index, path


def create_plinko_animation_frames(rows: int, slots: int, path: List[int], multipliers: List[float]) -> List[str]:
    """
    Create multiple frames for Plinko animation.
    """
    frames = []

    # Frame 1: Initial setup
    frame1 = create_plinko_frame(
        rows, slots, multipliers, -1, None, "🔴 Ball Ready to Drop!")
    frames.append(frame1)

    # Animation frames showing ball movement
    for i in range(min(len(path), rows + 1)):
        ball_row = i - 1  # -1 means above the board
        ball_pos = path[i] if i < len(path) else path[-1]

        frame = create_plinko_frame(rows, slots, multipliers, ball_row, ball_pos,
                                    f"🔴 Ball dropping... Row {i+1}/{rows}")
        frames.append(frame)

    # Final frame
    final_slot = int(path[-1] + (slots / 2))
    final_slot = max(0, min(slots - 1, final_slot))
    final_frame = create_plinko_frame(rows, slots, multipliers, rows, None,
                                      f"🎯 Ball landed in slot {final_slot + 1}!", final_slot)
    frames.append(final_frame)

    return frames


def create_plinko_frame(rows: int, slots: int, multipliers: List[float], ball_row: int, ball_pos: float,
                        status: str, winning_slot: int = None) -> str:
    """
    Create a single frame of the Plinko board.
    """
    lines = []

    # Header - more compact
    lines.append("```ansi")
    lines.append("🎯 \u001b[1;36mPLINKO\u001b[0m 🎯")
    lines.append(f"{status}")

    # Ball above board - smaller and more compact
    if ball_row == -1:
        lines.append("   🔴")
        lines.append("   ↓")

    # Create peg rows with ball position - improved uniform display
    for row in range(rows):
        row_str = ""
        # Better spacing calculation for uniform appearance
        spacing = " " * max(1, (rows - row - 1))

        # Add pegs for this row with consistent spacing
        pegs_in_row = row + \
            3 if row < 5 else min(row + 3, slots)  # Cap at slots

        for peg in range(pegs_in_row):
            peg_pos = peg - (pegs_in_row - 1) // 2  # Better centering

            # Check if ball is at this position (with tolerance for floats)
            if ball_row == row and ball_pos is not None and abs(ball_pos - peg_pos) < 0.8:
                # Use ball symbol when ball is present
                row_str += "🔴"
            else:
                # Use consistent peg symbols with better visuals
                if row > rows * 0.75:  # Bottom rows - more dangerous
                    row_str += "🔺"  # Red triangular pegs
                elif row > rows * 0.5:  # Middle rows
                    row_str += "🟡"  # Yellow circular pegs
                elif row > rows * 0.25:  # Upper-middle rows
                    row_str += "🟠"  # Orange circular pegs
                else:  # Top rows - safest
                    row_str += "⚪"  # White circular pegs

            # Add consistent spacing between pegs
            if peg < pegs_in_row - 1:
                row_str += " "

        lines.append(spacing + row_str)

    # Bottom slots with multipliers - very compact
    lines.append("\u001b[1;35mSLOTS:\u001b[0m")

    # Slot indicators - improved uniform display
    slot_line = ""
    multiplier_line = ""

    for i in range(slots):
        if winning_slot is not None and i == winning_slot:
            # Winning slot indicators
            if multipliers[i] >= 50.0:
                slot_line += "💰"  # Money bag for jackpot
            elif multipliers[i] >= 10.0:
                slot_line += "🏆"  # Trophy for big wins
            elif multipliers[i] >= 1.0:
                slot_line += "🟢"  # Green for wins
            else:
                slot_line += "🔴"  # Red for losses
        else:
            # Regular slot indicators with consistent symbols
            if multipliers[i] >= 50.0:
                slot_line += "🎰"  # Slot machine for jackpot slots
            elif multipliers[i] >= 10.0:
                slot_line += "🟨"  # Yellow square for high multipliers
            elif multipliers[i] >= 2.0:
                slot_line += "🟩"  # Green square for good multipliers
            elif multipliers[i] >= 1.0:
                slot_line += "🟦"  # Blue square for break-even
            elif multipliers[i] >= 0.1:
                slot_line += "🟥"  # Red square for losses
            else:
                slot_line += "⬛"  # Black square for total loss

        # Format multiplier with consistent width
        if multipliers[i] >= 100:
            mult_str = f"{multipliers[i]:.0f}x"
        elif multipliers[i] >= 10:
            mult_str = f"{multipliers[i]:.1f}x"
        else:
            mult_str = f"{multipliers[i]:.1f}x"

        # Ensure consistent width (4 characters)
        mult_str = mult_str.ljust(4)
        multiplier_line += mult_str

        # Add spacing between slots for better readability
        if i < slots - 1:
            slot_line += ""
            multiplier_line += ""

    lines.append(slot_line)
    lines.append(multiplier_line)
    lines.append("```")

    return "\n".join(lines)

# --- Mode Selection View ----------------------------------------------------


class PlinkoModeSelectView(View):
    """Mode picker for Easy/Medium/Hard Plinko."""

    def __init__(self, user, amount, wallet_after, username):
        super().__init__(timeout=None)
        self.user = user
        self.amount = float(amount)
        self.wallet_after = wallet_after
        self.wallet_before = float(wallet_after) + float(amount)
        self.username = username
        self.started = False

        # Create mode buttons with appropriate styles
        for mode_name, mode_data in PLINKO_MODES.items():
            if mode_name == "Easy":
                style = discord.ButtonStyle.success
            elif mode_name == "Medium":
                style = discord.ButtonStyle.primary
            elif mode_name == "Hard":
                style = discord.ButtonStyle.danger
            elif mode_name == "Nightmare":
                style = discord.ButtonStyle.secondary

            button = Button(
                label=mode_name,
                style=style,
                emoji=mode_data["emoji"]
            )
            button.callback = self._create_mode_callback(mode_name)
            self.add_item(button)

    def _create_mode_callback(self, mode_name: str):
        async def mode_callback(interaction: discord.Interaction):
            await self._launch_mode(interaction, mode_name)
        return mode_callback

    async def _launch_mode(self, interaction: discord.Interaction, mode_name: str):
        if self.started:
            embed = discord.Embed(
                title="❌ Game Already Started",
                description="This Plinko game has already started!",
                color=discord.Color.red()
            )
            await interaction.followup.send(embed=embed, ephemeral=True)
            return

        if interaction.user.id != self.user.id:
            embed = discord.Embed(
                title="❌ Not Your Game",
                description="You cannot choose a mode for someone else's game!",
                color=discord.Color.red()
            )
            await interaction.followup.send(embed=embed, ephemeral=True)
            return

        self.started = True

        # Disable all buttons
        for item in self.children:
            item.disabled = True

        try:
            await interaction.response.edit_message(view=self)
        except Exception:
            pass

        # Get mode data
        mode_data = PLINKO_MODES[mode_name]
        rows = mode_data["rows"]
        multipliers = randomize_multipliers(mode_data["multipliers"])
        slots = len(multipliers)
        guild_id = await get_guild_id(interaction)

        # Build a drop selection view with buttons for each slot
        selection_view = PlinkoDropSelectView(
            user=self.user,
            amount=self.amount,
            wallet_after=self.wallet_after,
            username=self.username,
            mode_name=mode_name,
            mode_color=mode_data["color"],
            rows=rows,
            multipliers=multipliers,
            slots=slots,
        )

        # Show the empty board and ask for a drop slot selection
        initial_frame = create_plinko_image(
            rows, slots, multipliers, None, -1, mode_name)
        # Build dynamic legend by mode

        def legend_for_mode(name: str) -> str:
            if name == "Nightmare":
                return (
                    "Nightmare layout: buttons grouped as G1..G? (4 per group).\n"
                    "40x slots are placed 4 away from each edge."
                )
            else:
                if name == "Easy":
                    low, med, high = 0.5, 1.0, 2.0
                elif name == "Medium":
                    low, med, high = 0.75, 1.5, 3.0
                elif name == "Hard":
                    low, med, high = 1.0, 2.0, 5.0
                else:
                    low, med, high = 0.5, 1.0, 5.0
                return (
                    "Buttons grouped as G1..G? (5 per group) for clarity.\n"
                    f"Multiplier bands: <{low}x (danger), <{med}x (low), <{high}x (med), ≥{high}x (high)."
                )

        prompt_embed = discord.Embed(
            title=f"🎯 {mode_name} Plinko",
            description=(
                f"**{self.username}** - Choose where to drop the ball by selecting a slot below, or press 🎲 Random.\n\n"
                f"{legend_for_mode(mode_name)}"
            ),
            color=mode_data["color"]
        )
        initial_file = discord.File(initial_frame, filename="plinko_board.png")
        prompt_embed.set_image(url="attachment://plinko_board.png")
        await interaction.edit_original_response(embed=prompt_embed, attachments=[initial_file], view=selection_view)

        # The rest of the flow happens in the PlinkoDropSelectView callback

# --- Plinko Cog -------------------------------------------------------------


class Plinko(Cog):
    def __init__(self, bot):
        self.bot = bot
        # Register this game with the registry
        game_registry.register_game(
            "Plinko", self.__class__, "Drop a ball through pegs to win multipliers!")

    @app_commands.command(name="plinko", description="🎯 Play the Plinko game! Drop a ball through pegs for multipliers.")
    @app_commands.describe(amount="Bet amount (use K/M/B suffixes, 'A' for all, 'H' for half)")
    async def plinko_command(self, interaction: discord.Interaction, amount: str):
        # Check maintenance mode first
        from utils.common import check_maintenance_mode
        if await check_maintenance_mode(interaction):
            return

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
        await db_manager.set_game_active(user_id, guild_id, "plinko", amount)

        # Add to game registry
        game_registry.add_session(interaction.user.id)

        # Create mode selection view
        view = PlinkoModeSelectView(
            interaction.user, amount, new_wallet, f"<@{interaction.user.id}>")

        # Create enhanced mode selection embed with warnings
        embed = discord.Embed(
            title="🎯 Plinko Casino - Mode Selection",
            description=f"**<@{interaction.user.id}>** choose your risk level!\n\n⚠️ **Warning: All modes favor the house!**",
            color=discord.Color.gold()
        )

        embed.add_field(name="💰 Bet Amount",
                        value=f"**{fmt(amount)}**", inline=True)
        embed.add_field(name="💼 Remaining Wallet",
                        value=fmt(new_wallet), inline=True)
        embed.add_field(name="🏦 Bank Balance",
                        value=fmt(bank_balance), inline=True)

        # Add mode info with house edge warnings
        for mode_name, mode_data in PLINKO_MODES.items():
            house_edge = mode_data.get("house_edge", 0.0) * 100
            min_mult = min(mode_data["multipliers"])
            max_mult = max(mode_data["multipliers"])

            mode_desc = (
                f"{mode_data['emoji']} {mode_data['description']}\n"
                f"🎰 Range: **{min_mult:.1f}x - {max_mult:.1f}x**\n"
                f"🏠 House Edge: **{house_edge:.0f}%**\n"
                f"⚡ Rows: {mode_data['rows']}"
            )

            embed.add_field(
                name=f"{mode_data['emoji']} {mode_name} Mode",
                value=mode_desc,
                inline=True
            )

        embed.set_footer(
            text="🚨 Gambling is risky! Only bet what you can afford to lose.")

        msg = await interaction.followup.send(embed=embed, view=view)
        try:
            from utils.common import set_user_game_message
            set_user_game_message(user_id, msg)
        except Exception:
            pass


class PlinkoDropSelectView(View):
    """View that presents slot buttons for the player to choose the drop column."""

    def __init__(self, user: discord.User, amount: float, wallet_after: float, username: str,
                 mode_name: str, mode_color: discord.Color, rows: int, multipliers: List[float], slots: int):
        super().__init__(timeout=300)
        self.user = user
        self.amount = float(amount)
        self.wallet_after = wallet_after
        self.username = username
        self.mode_name = mode_name
        self.mode_color = mode_color
        self.rows = rows
        self.multipliers = multipliers
        self.slots = slots
        self.locked = False

        # Create numbered buttons for each slot, arranged in rows of up to 5
        def style_for_multiplier(mult: float) -> discord.ButtonStyle:
            """Mode-specific color bands for multipliers."""
            # Thresholds: (low_cut, med_cut, high_cut_start)
            if self.mode_name == "Easy":
                low, med, high = 0.5, 1.0, 2.0
            elif self.mode_name == "Medium":
                low, med, high = 0.75, 1.5, 3.0
            elif self.mode_name == "Hard":
                low, med, high = 1.0, 2.0, 5.0
            else:  # Nightmare - use uniform style; grouping is by rows of 4
                return discord.ButtonStyle.secondary

            if mult < low:
                return discord.ButtonStyle.danger     # very low
            elif mult < med:
                return discord.ButtonStyle.secondary  # low
            elif mult < high:
                return discord.ButtonStyle.primary    # medium
            else:
                return discord.ButtonStyle.success    # high

        # Use groups of 4 for Nightmare for clearer grouping, else 5 per row
        per_row = 4 if self.mode_name == "Nightmare" else 5
        for i in range(slots):
            label = str(i + 1)
            style = style_for_multiplier(self.multipliers[i])
            button = Button(label=label, style=style,
                            custom_id=f"plinko_drop_{i}", row=min(4, i // per_row))

            def make_callback(index: int):
                async def _cb(interaction: discord.Interaction):
                    # Only the game owner can choose
                    if interaction.user.id != self.user.id:
                        await interaction.response.send_message("❌ Not your game.", ephemeral=True)
                        return
                    if self.locked:
                        await interaction.response.send_message("⚠️ Drop slot already chosen.", ephemeral=True)
                        return
                    self.locked = True
                    # Disable all buttons
                    for item in self.children:
                        if isinstance(item, Button):
                            item.disabled = True

                    # Run the drop flow (handles animation and result)
                    await self._execute_drop(interaction, index)

                return _cb

            # Bind callback with current index
            button.callback = make_callback(i)
            self.add_item(button)

        # Random drop button
        random_row = min(4, (slots + (per_row - 1)) // per_row)
        rand_btn = Button(label="🎲 Random", style=discord.ButtonStyle.secondary,
                          custom_id="plinko_drop_random", row=random_row)

        async def rand_cb(interaction: discord.Interaction):
            if interaction.user.id != self.user.id:
                await interaction.response.send_message("❌ Not your game.", ephemeral=True)
                return
            if self.locked:
                await interaction.response.send_message("⚠️ Drop slot already chosen.", ephemeral=True)
                return
            import secrets
            self.locked = True
            for item in self.children:
                if isinstance(item, Button):
                    item.disabled = True
            index = secrets.randbelow(self.slots)
            await self._execute_drop(interaction, index)

        rand_btn.callback = rand_cb
        self.add_item(rand_btn)

    async def _execute_drop(self, interaction: discord.Interaction, index: int):
        # Map slot index to starting position in simulation coordinates (centered at 0)
        # Exact mapping: slot 0 -> -((slots-1)/2), slot N-1 -> +((slots-1)/2)
        start_pos = index - ((self.slots - 1) / 2)

        # Run the drop simulation
        final_slot, ball_path = simulate_plinko_drop(
            self.rows, self.slots, start_pos)
        final_multiplier = self.multipliers[final_slot]
        final_winnings = self.amount * final_multiplier

        # Create visual animation frames
        frames = create_plinko_animation_frames_visual(
            self.rows, self.slots, ball_path, self.multipliers, self.mode_name, final_slot)

        # Send initial animation frame
        try:
            anim_embed = discord.Embed(
                title=f"🎯 {self.mode_name} Plinko Animation",
                description=f"**{self.username}** - 🔴 Ball released from slot #{index + 1}!",
                color=self.mode_color
            )
            init_file = discord.File(frames[0], filename="plinko_initial.png")
            anim_embed.set_image(url="attachment://plinko_initial.png")
            await interaction.response.edit_message(embed=anim_embed, attachments=[init_file], view=None)
        except Exception:
            # Fallback: try to edit original without attachment
            await interaction.response.edit_message(view=None)

        # Animate subsequent frames
        total_frames = len(frames) - 1
        for i, frame_data in enumerate(frames[1:], 1):
            if i < total_frames:
                desc = f"**{self.username}** - ⚡ Ball bouncing... Row {i}/{self.rows}"
            else:
                desc = f"**{self.username}** - 🎯 BALL LANDED! Slot #{final_slot + 1}"
            frame_embed = discord.Embed(
                title=f"🎯 {self.mode_name} Plinko Animation",
                description=desc,
                color=self.mode_color
            )
            frame_file = discord.File(
                frame_data, filename=f"plinko_frame_{i}.png")
            frame_embed.set_image(url=f"attachment://plinko_frame_{i}.png")
            await interaction.edit_original_response(embed=frame_embed, attachments=[frame_file])
            await asyncio.sleep(0.5 if i < total_frames else 0.9)

        # Update balances and record result
        user_id = str(self.user.id)
        guild_id = await get_guild_id(interaction)
        await db_manager.ensure_user(user_id, self.username)
        final_wallet = self.wallet_after + final_winnings
        await db_manager.set_balances(user_id, guild_id, wallet=final_wallet)
        won = final_winnings >= self.amount
        await db_manager.record_game_result(user_id, guild_id, "plinko", won, self.amount, final_winnings)
        await db_manager.clear_game_active(user_id, guild_id)
        game_registry.remove_session(self.user.id)

        # Bank balance for display
        _, bank_balance = await db_manager.get_balances(user_id, guild_id)

        # Result embed
        if final_winnings >= self.amount * 10:
            result_color = discord.Color.gold()
            result_title = "💰 JACKPOT! 💰"
            result_emoji = "🌟"
        elif final_winnings > self.amount:
            result_color = discord.Color.green()
            result_title = "🎉 Plinko Win!"
            result_emoji = "🎊"
        elif final_winnings == self.amount:
            result_color = discord.Color.gold()
            result_title = "🤝 Break Even!"
            result_emoji = "⚖️"
        else:
            result_color = discord.Color.red()
            result_title = "💥 Plinko Loss!"
            result_emoji = "😢"
        if self.mode_name == "Nightmare":
            if final_winnings >= self.amount * 100:
                result_title = "💀 NIGHTMARE JACKPOT! 💀"
                result_emoji = "👑"
            elif final_winnings < self.amount * 0.01:
                result_title = "💀 NIGHTMARE CONSUMED YOU! 💀"
                result_emoji = "💀"

        result_embed = discord.Embed(
            title=f"{result_emoji} {result_title}",
            description=f"**{self.username}** played **{self.mode_name}** Plinko!",
            color=result_color
        )
        result_embed.add_field(
            name="🎯 Mode", value=self.mode_name, inline=True)
        result_embed.add_field(
            name="🎯 Landing Slot", value=f"**#{final_slot + 1}** of {self.slots}", inline=True)
        result_embed.add_field(
            name="📊 Multiplier", value=f"**{final_multiplier:.2f}x**", inline=True)
        result_embed.add_field(name="💰 Bet Amount",
                               value=fmt(self.amount), inline=True)
        result_embed.add_field(
            name="🏆 Winnings", value=f"**{fmt(final_winnings)}**", inline=True)
        result_embed.add_field(
            name="💼 Wallet", value=f"{fmt(self.wallet_after)} → **{fmt(final_wallet)}**", inline=True)
        result_embed.add_field(name="🏦 Bank Balance",
                               value=fmt(bank_balance), inline=True)
        net_change = final_winnings - self.amount
        nc = "+" if net_change >= 0 else ""
        result_embed.add_field(name="📈 Net Change",
                               value=f"**{nc}{fmt(net_change)}**", inline=True)
        he = PLINKO_MODES.get(self.mode_name, {}).get("house_edge", 0.0) * 100
        result_embed.set_footer(
            text=f"🏠 House Edge: {he:.0f}% | Gamble Responsibly!")

        try:
            final_img = create_plinko_image(
                self.rows, self.slots, self.multipliers, ball_path, self.rows + 1, self.mode_name, final_slot)
            result_file = discord.File(
                final_img, filename="plinko_final_result.png")
            result_embed.set_image(url="attachment://plinko_final_result.png")
            await interaction.edit_original_response(embed=result_embed, attachments=[result_file])
        except Exception as e:
            LOG.error(f"Final result image error: {e}")
            await interaction.edit_original_response(embed=result_embed, attachments=[])

    @app_commands.command(name="helpplinko", description="🎯 Show Plinko game help and information.")
    async def help_plinko_command(self, interaction: discord.Interaction):
        embed = discord.Embed(
            title="🎯 Plinko Game Help",
            description="Drop a ball through pegs to win multipliers!",
            color=discord.Color.blurple()
        )

        embed.add_field(
            name="🎮 How to Play",
            value=(
                "`/plinko [amount|A|H]` - Start a Plinko game with your bet!\n"
                "Choose a mode, then pick a drop slot using the buttons under the board."
            ),
            inline=False
        )

        # Add mode information
        for mode_name, mode_data in PLINKO_MODES.items():
            multipliers_str = " | ".join(
                [f"{m:.1f}x" for m in mode_data["multipliers"][:5]]) + "..."
            embed.add_field(
                name=f"{mode_name} Mode ({mode_data['rows']} rows)",
                value=f"{mode_data['description']}\nSample multipliers: {multipliers_str}",
                inline=True
            )

        embed.add_field(
            name="💡 Tips",
            value="• Easy mode = safer, smaller multipliers\n• Hard mode = riskier, bigger multipliers\n• The ball bounces randomly through pegs\n• Use 'A' to bet all, 'H' to bet half",
            inline=False
        )

        embed.add_field(
            name="🏆 Strategy",
            value="Plinko is pure chance! The ball's path is completely random, so play within your budget and have fun!",
            inline=False
        )

        await interaction.response.send_message(embed=embed)


# Simple manager class for compatibility with general.py
class PlinkoManager:
    def __init__(self):
        self.games = {}

    def remove_game(self, user_id):
        pass


# Global manager instance for compatibility with general.py
plinko_manager = PlinkoManager()


# Setup function for bot integration
async def setup(bot):
    import inspect
    cog = Plinko(bot)
    add_cog = getattr(bot, "add_cog")
    if inspect.iscoroutinefunction(add_cog):
        await add_cog(cog)
    else:
        add_cog(cog)
