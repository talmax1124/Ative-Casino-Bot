"""Slots Game commands and views.
A classic slot machine game with spinning animations and various symbols.
"""

import discord
from discord import app_commands
from discord.ui import View, Button
from discord.ext import commands
from discord.ext.commands import Cog
from utils.common import game_registry, fmt, fmt_delta_colored, get_guild_id
from utils.common import AutoRefundGameView, send_log_message
from utils.firebase_database import db_manager

import asyncio
import secrets
import logging
from typing import List, Tuple

LOG = logging.getLogger("slots")

# Slot symbols with different rarities and payouts (matching assets)
SLOT_SYMBOLS = {
    'cherries': {'name': 'Cherries', 'emoji': '🍒', 'rarity': 35, 'payout': 2.0},
    'lemon': {'name': 'Lemon', 'emoji': '🍋', 'rarity': 30, 'payout': 2.5},
    'orange': {'name': 'Orange', 'emoji': '🍊', 'rarity': 25, 'payout': 3.0},
    'grapes': {'name': 'Grapes', 'emoji': '🍇', 'rarity': 20, 'payout': 4.0},
    'watermelon': {'name': 'Watermelon', 'emoji': '🍉', 'rarity': 15, 'payout': 5.0},
    'bar': {'name': 'Bar', 'emoji': '📊', 'rarity': 12, 'payout': 6.0},
    'seven': {'name': 'Lucky Seven', 'emoji': '7️⃣', 'rarity': 8, 'payout': 10.0},
    'diamond': {'name': 'Diamond', 'emoji': '💎', 'rarity': 5, 'payout': 20.0},
    'buffalo': {'name': 'Buffalo', 'emoji': '🦬', 'rarity': 3, 'payout': 50.0},
    'jackpot': {'name': 'Jackpot', 'emoji': '🎰', 'rarity': 0.5, 'payout': 200.0}
}

# Special combinations (any 2 matching symbols)
TWO_MATCH_MULTIPLIER = 0.75  # Increased from 0.5 to make two-matches more rewarding

# Matrix mode symbols and settings (Increased win probability by 3%)
MATRIX_SYMBOLS = {
    'cherries': {'name': 'Cherries', 'emoji': '🍒', 'rarity': 33, 'payout': 2.0},
    'lemon': {'name': 'Lemon', 'emoji': '🍋', 'rarity': 28, 'payout': 2.5},
    'orange': {'name': 'Orange', 'emoji': '🍊', 'rarity': 25, 'payout': 3.0},
    'grapes': {'name': 'Grapes', 'emoji': '🍇', 'rarity': 21, 'payout': 4.0},
    'watermelon': {'name': 'Watermelon', 'emoji': '🍉', 'rarity': 18, 'payout': 5.0},
    'bar': {'name': 'Bar', 'emoji': '📊', 'rarity': 15, 'payout': 6.0},
    'seven': {'name': 'Lucky Seven', 'emoji': '7️⃣', 'rarity': 11, 'payout': 10.0},
    'diamond': {'name': 'Diamond', 'emoji': '💎', 'rarity': 9, 'payout': 20.0},
    'buffalo': {'name': 'Buffalo', 'emoji': '🦬', 'rarity': 7, 'payout': 50.0},
    'jackpot': {'name': 'Jackpot', 'emoji': '🎰', 'rarity': 3.5, 'payout': 200.0}
}

# Matrix minimum bet
MATRIX_MIN_BET = 50000


def get_weighted_symbol(matrix_mode=False):
    """Get a random symbol based on rarity weights."""
    symbol_dict = MATRIX_SYMBOLS if matrix_mode else SLOT_SYMBOLS
    symbols = list(symbol_dict.keys())
    weights = [symbol_dict[symbol]['rarity'] for symbol in symbols]

    # Create weighted list, handling fractional weights
    weighted_symbols = []
    for symbol, weight in zip(symbols, weights):
        # Convert fractional weights to integer (multiply by 2 for 0.5 weights)
        int_weight = int(weight * 2)
        if int_weight > 0:  # Ensure at least 1 occurrence for very rare symbols
            weighted_symbols.extend([symbol] * int_weight)
        else:
            weighted_symbols.append(symbol)  # At least 1 occurrence

    return secrets.choice(weighted_symbols)


def get_slot_result() -> List[str]:
    """Generate 3 random slot symbols."""
    return [get_weighted_symbol() for _ in range(3)]


def get_matrix_result() -> List[List[str]]:
    """Generate 3x3 matrix of slot symbols."""
    return [[get_weighted_symbol(matrix_mode=True) for _ in range(3)] for _ in range(3)]


def calculate_payout(symbols: List[str], bet_amount: float) -> Tuple[float, str]:
    """Calculate payout based on slot results."""
    # Check for three of a kind (jackpot)
    if len(set(symbols)) == 1:
        symbol = symbols[0]
        multiplier = SLOT_SYMBOLS[symbol]['payout']
        payout = bet_amount * multiplier
        result_type = f"🎰 JACKPOT! Three {SLOT_SYMBOLS[symbol]['name']}s!"
        return payout, result_type

    # Check for two of a kind
    symbol_counts = {}
    for symbol in symbols:
        symbol_counts[symbol] = symbol_counts.get(symbol, 0) + 1

    for symbol, count in symbol_counts.items():
        if count == 2:
            base_multiplier = SLOT_SYMBOLS[symbol]['payout']
            multiplier = base_multiplier * TWO_MATCH_MULTIPLIER
            payout = bet_amount * multiplier
            result_type = f"🎊 Two {SLOT_SYMBOLS[symbol]['name']}s!"
            return payout, result_type

    # No matches
    return 0.0, "💥 No matches - Try again!"


def calculate_matrix_payout(matrix: List[List[str]], bet_amount: float) -> Tuple[float, str, List[Tuple[int, int, int, int]], bool]:
    """Calculate payout for matrix mode and return winning lines."""
    total_payout = 0.0
    result_messages = []
    winning_lines = []
    buffalo_bonus_triggered = False

    # Check all possible winning lines
    # Horizontal lines
    for row in range(3):
        line = [matrix[row][0], matrix[row][1], matrix[row][2]]
        if len(set(line)) == 1:  # Three in a row
            symbol = line[0]
            if symbol == 'buffalo':
                # Buffalo bonus - 5x initial payout + trigger bonus round
                initial_bonus = bet_amount * 5  # 5x initial payout
                total_payout += initial_bonus
                result_messages.append(
                    f"🦬 BUFFALO BONUS! Initial: +{initial_bonus:,.0f} + 5 FREE SPINS!")
                winning_lines.append((row, 0, row, 2))  # Horizontal line
                buffalo_bonus_triggered = True
            else:
                multiplier = MATRIX_SYMBOLS[symbol]['payout']
                line_payout = bet_amount * multiplier
                total_payout += line_payout
                result_messages.append(
                    f"{MATRIX_SYMBOLS[symbol]['name']} Line: +{line_payout:,.0f}")
                winning_lines.append((row, 0, row, 2))

    # Vertical lines
    for col in range(3):
        line = [matrix[0][col], matrix[1][col], matrix[2][col]]
        if len(set(line)) == 1:
            symbol = line[0]
            if symbol == 'buffalo':
                initial_bonus = bet_amount * 5
                total_payout += initial_bonus
                result_messages.append(
                    f"🦬 BUFFALO BONUS! Initial: +{initial_bonus:,.0f} + 5 FREE SPINS!")
                winning_lines.append((0, col, 2, col))  # Vertical line
                buffalo_bonus_triggered = True
            else:
                multiplier = MATRIX_SYMBOLS[symbol]['payout']
                line_payout = bet_amount * multiplier
                total_payout += line_payout
                result_messages.append(
                    f"{MATRIX_SYMBOLS[symbol]['name']} Line: +{line_payout:,.0f}")
                winning_lines.append((0, col, 2, col))

    # Diagonal lines
    # Top-left to bottom-right
    diagonal1 = [matrix[0][0], matrix[1][1], matrix[2][2]]
    if len(set(diagonal1)) == 1:
        symbol = diagonal1[0]
        if symbol == 'buffalo':
            initial_bonus = bet_amount * 5
            total_payout += initial_bonus
            result_messages.append(
                f"🦬 BUFFALO BONUS! Initial: +{initial_bonus:,.0f} + 5 FREE SPINS!")
            winning_lines.append((0, 0, 2, 2))  # Diagonal
            buffalo_bonus_triggered = True
        else:
            multiplier = MATRIX_SYMBOLS[symbol]['payout']
            line_payout = bet_amount * multiplier
            total_payout += line_payout
            result_messages.append(
                f"{MATRIX_SYMBOLS[symbol]['name']} Diagonal: +{line_payout:,.0f}")
            winning_lines.append((0, 0, 2, 2))

    # Top-right to bottom-left
    diagonal2 = [matrix[0][2], matrix[1][1], matrix[2][0]]
    if len(set(diagonal2)) == 1:
        symbol = diagonal2[0]
        if symbol == 'buffalo':
            initial_bonus = bet_amount * 5
            total_payout += initial_bonus
            result_messages.append(
                f"🦬 BUFFALO BONUS! Initial: +{initial_bonus:,.0f} + 5 FREE SPINS!")
            winning_lines.append((0, 2, 2, 0))  # Diagonal
            buffalo_bonus_triggered = True
        else:
            multiplier = MATRIX_SYMBOLS[symbol]['payout']
            line_payout = bet_amount * multiplier
            total_payout += line_payout
            result_messages.append(
                f"{MATRIX_SYMBOLS[symbol]['name']} Diagonal: +{line_payout:,.0f}")
            winning_lines.append((0, 2, 2, 0))

    if total_payout > 0:
        result_type = "; ".join(result_messages)
    else:
        result_type = "💥 No winning lines - Try again!"

    return total_payout, result_type, winning_lines, buffalo_bonus_triggered


def create_matrix_animation(final_matrix: List[List[str]], result_text: str = "", winning_lines: List[Tuple[int, int, int, int]] = None) -> discord.File:
    """Create animated 3x3 matrix slots using PIL and assets with casino-style animation.

    Animation flow:
    1. All symbols spin initially
    2. Columns stop from right to left (2, 1, 0) 
    3. Each column cascades from top to bottom
    4. Visual highlights show when reels stop
    5. Winning lines appear after all symbols settle
    """
    from PIL import Image, ImageDraw, ImageFont
    import io
    import os

    LOG.info(f"🎰 [DEBUG] Creating matrix animation for: {final_matrix}")

    # Asset paths
    assets_dir = os.path.join(os.path.dirname(
        os.path.dirname(__file__)), "assets", "slots")

    # Load symbol images
    symbol_images = {}
    for symbol in MATRIX_SYMBOLS.keys():
        try:
            img_path = os.path.join(assets_dir, f"{symbol}.png")
            if os.path.exists(img_path):
                symbol_images[symbol] = Image.open(img_path).convert("RGBA")
                LOG.info(f"✅ Loaded {symbol} asset")
            else:
                LOG.warning(f"⚠️ Missing asset for {symbol}")
                # Create fallback colored square
                symbol_images[symbol] = Image.new(
                    "RGBA", (120, 120), (100, 100, 100, 255))
        except Exception as e:
            LOG.error(f"❌ Error loading {symbol}: {e}")
            symbol_images[symbol] = Image.new(
                "RGBA", (120, 120), (100, 100, 100, 255))

    # Animation settings for 3x3 matrix
    CANVAS_WIDTH = 800
    CANVAS_HEIGHT = 600
    CELL_SIZE = 120
    CELL_SPACING = 10

    # Calculate matrix position (centered)
    matrix_width = 3 * CELL_SIZE + 2 * CELL_SPACING
    matrix_height = 3 * CELL_SIZE + 2 * CELL_SPACING
    start_x = (CANVAS_WIDTH - matrix_width) // 2
    start_y = (CANVAS_HEIGHT - matrix_height) // 2 + 30

    # Animation frames
    frames = []
    total_frames = 40  # Total animation frames

    # Get symbols for spinning animation
    all_symbols = list(MATRIX_SYMBOLS.keys())

    for frame in range(total_frames):
        # Create canvas
        canvas = Image.new(
            "RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (15, 15, 25, 255))
        draw = ImageDraw.Draw(canvas)

        # Title
        try:
            font = ImageFont.load_default()
        except:
            font = None

        draw.text((CANVAS_WIDTH//2 - 80, 20), "🎰 SLOTS MATRIX 3x3 🎰",
                  fill=(255, 255, 255), font=font)

        # Draw 3x3 grid with casino-style animation (right to left, then up to down)
        for row in range(3):
            for col in range(3):
                x = start_x + col * (CELL_SIZE + CELL_SPACING)
                y = start_y + row * (CELL_SIZE + CELL_SPACING)

                # Draw cell background
                draw.rectangle([x-2, y-2, x+CELL_SIZE+2, y+CELL_SIZE+2],
                               fill=(40, 40, 50), outline=(255, 255, 255))

                # Determine which symbol to show with casino-style stopping
                # Columns stop from right to left (2, 1, 0), then rows cascade up to down
                col_stop_frame = 15 + (2 - col) * 5  # Right column stops first
                row_cascade_frame = col_stop_frame + \
                    (row * 3)  # Then cascade down

                if frame < col_stop_frame:  # Column still spinning
                    # Show random spinning symbols with vertical movement effect
                    symbol_idx = ((frame * 2) + row + col) % len(all_symbols)
                    current_symbol = all_symbols[symbol_idx]
                elif frame < row_cascade_frame:  # Column stopped, row still cascading
                    # Show intermediate spinning for cascade effect
                    symbol_idx = ((frame - col_stop_frame) +
                                  row) % len(all_symbols)
                    current_symbol = all_symbols[symbol_idx]
                else:  # Final result phase
                    current_symbol = final_matrix[row][col]

                # Add visual effects for casino-style stopping
                cell_outline_color = (255, 255, 255)  # Default white
                cell_outline_width = 2

                # Highlight when reel just stopped
                if frame == col_stop_frame or frame == row_cascade_frame:
                    cell_outline_color = (255, 215, 0)  # Gold highlight
                    cell_outline_width = 4
                elif frame > row_cascade_frame:
                    cell_outline_color = (100, 255, 100)  # Green when settled
                    cell_outline_width = 2

                # Redraw background with enhanced outline
                draw.rectangle([x-2, y-2, x+CELL_SIZE+2, y+CELL_SIZE+2],
                               fill=(40, 40, 50), outline=cell_outline_color, width=cell_outline_width)

                # Draw symbol
                symbol_img = symbol_images[current_symbol].resize(
                    (CELL_SIZE-10, CELL_SIZE-10), Image.LANCZOS)
                symbol_x = x + 5
                symbol_y = y + 5

                canvas.paste(symbol_img, (symbol_x, symbol_y), symbol_img)

        # Draw winning lines after all reels have settled (adjusted for new timing)
        if frame >= 35 and winning_lines:
            for line in winning_lines:
                row1, col1, row2, col2 = line
                x1 = start_x + col1 * \
                    (CELL_SIZE + CELL_SPACING) + CELL_SIZE // 2
                y1 = start_y + row1 * \
                    (CELL_SIZE + CELL_SPACING) + CELL_SIZE // 2
                x2 = start_x + col2 * \
                    (CELL_SIZE + CELL_SPACING) + CELL_SIZE // 2
                y2 = start_y + row2 * \
                    (CELL_SIZE + CELL_SPACING) + CELL_SIZE // 2

                # Draw thick golden line
                draw.line([(x1, y1), (x2, y2)], fill=(255, 215, 0), width=6)

        # Show result text after winning lines are drawn
        if frame >= 38 and result_text:
            text_lines = result_text.split("; ")
            for i, line in enumerate(text_lines[:3]):  # Max 3 lines
                text_x = CANVAS_WIDTH // 2 - len(line) * 4
                text_y = CANVAS_HEIGHT - 80 + i * 20
                draw.text((text_x, text_y), line,
                          fill=(255, 255, 100), font=font)

        frames.append(canvas)

    # Save as animated GIF
    buf = io.BytesIO()
    frames[0].save(
        buf,
        format="GIF",
        save_all=True,
        append_images=frames[1:],
        duration=120,  # 120ms per frame
        loop=0
    )
    buf.seek(0)

    LOG.info(f"✅ Created matrix animation GIF: {len(buf.getvalue()):,} bytes")
    return discord.File(buf, filename="matrix_slots_animation.gif")


def create_slots_animation(final_symbols: List[str], result_text: str = "") -> discord.File:
    """Create animated spinning slots using PIL and assets."""
    from PIL import Image, ImageDraw, ImageFont
    import io
    import os

    LOG.info(f"🎰 [DEBUG] Creating animated slots for: {final_symbols}")

    # Asset paths
    assets_dir = os.path.join(os.path.dirname(
        os.path.dirname(__file__)), "assets", "slots")

    # Load symbol images
    symbol_images = {}
    for symbol in SLOT_SYMBOLS.keys():
        try:
            img_path = os.path.join(assets_dir, f"{symbol}.png")
            if os.path.exists(img_path):
                symbol_images[symbol] = Image.open(img_path).convert("RGBA")
                LOG.info(f"✅ Loaded {symbol} asset")
            else:
                LOG.warning(f"⚠️ Missing asset for {symbol}")
                # Create fallback colored square
                symbol_images[symbol] = Image.new(
                    "RGBA", (100, 100), (100, 100, 100, 255))
        except Exception as e:
            LOG.error(f"❌ Error loading {symbol}: {e}")
            symbol_images[symbol] = Image.new(
                "RGBA", (100, 100), (100, 100, 100, 255))

    # Animation settings
    CANVAS_WIDTH = 600
    CANVAS_HEIGHT = 400
    REEL_WIDTH = 150
    REEL_HEIGHT = 120
    SYMBOL_SIZE = 100

    # Calculate reel positions (3 reels)
    reel_positions = []
    total_reel_width = 3 * REEL_WIDTH
    start_x = (CANVAS_WIDTH - total_reel_width) // 2

    for i in range(3):
        x = start_x + (i * REEL_WIDTH)
        y = (CANVAS_HEIGHT - REEL_HEIGHT) // 2
        reel_positions.append((x, y))

    # Animation frames
    frames = []
    total_frames = 30  # Total animation frames

    # Get symbols for spinning animation
    all_symbols = list(SLOT_SYMBOLS.keys())

    for frame in range(total_frames):
        # Create canvas
        canvas = Image.new(
            "RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (20, 20, 30, 255))
        draw = ImageDraw.Draw(canvas)

        # Title
        try:
            font = ImageFont.load_default()
        except:
            font = None

        draw.text((CANVAS_WIDTH//2 - 50, 30), "🎰 SLOT MACHINE 🎰",
                  fill=(255, 255, 255), font=font)

        # Draw each reel
        for reel_idx in range(3):
            x, y = reel_positions[reel_idx]

            # Draw reel background
            draw.rectangle([x-5, y-5, x+REEL_WIDTH+5, y+REEL_HEIGHT+5],
                           fill=(40, 40, 40), outline=(255, 255, 255))

            # Determine which symbol to show
            if frame < 20:  # Spinning phase
                # Show random spinning symbols
                symbol_idx = (frame + reel_idx * 3) % len(all_symbols)
                current_symbol = all_symbols[symbol_idx]
            else:  # Final result phase
                current_symbol = final_symbols[reel_idx]

            # Draw symbol
            symbol_img = symbol_images[current_symbol].resize(
                (SYMBOL_SIZE, SYMBOL_SIZE), Image.LANCZOS)
            symbol_x = x + (REEL_WIDTH - SYMBOL_SIZE) // 2
            symbol_y = y + (REEL_HEIGHT - SYMBOL_SIZE) // 2

            canvas.paste(symbol_img, (symbol_x, symbol_y), symbol_img)

            # Draw symbol name
            symbol_name = SLOT_SYMBOLS[current_symbol]['name']
            text_x = x + REEL_WIDTH // 2 - len(symbol_name) * 3
            text_y = y + REEL_HEIGHT + 10
            draw.text((text_x, text_y), symbol_name,
                      fill=(200, 200, 200), font=font)

        # Show result text in final frames
        if frame >= 25 and result_text:
            text_x = CANVAS_WIDTH // 2 - len(result_text) * 4
            text_y = CANVAS_HEIGHT - 60
            draw.text((text_x, text_y), result_text,
                      fill=(255, 255, 100), font=font)

        frames.append(canvas)

    # Save as animated GIF
    buf = io.BytesIO()
    frames[0].save(
        buf,
        format="GIF",
        save_all=True,
        append_images=frames[1:],
        duration=100,  # 100ms per frame
        loop=0
    )
    buf.seek(0)

    LOG.info(f"✅ Created animated slots GIF: {len(buf.getvalue()):,} bytes")
    return discord.File(buf, filename="slots_animation.gif")


async def create_matrix_spinning_image(final_matrix: List[List[str]] = None, result_text: str = "", winning_lines: List[Tuple[int, int, int, int]] = None, view=None) -> discord.File:
    """Create matrix slots animation using Duck Game's proven method."""
    if final_matrix is None:
        final_matrix = [['bar', 'cherries', 'diamond'], [
            'lemon', 'grapes', 'seven'], ['orange', 'watermelon', 'buffalo']]

    LOG.info(
        f"🎰 [DEBUG] Creating matrix animation using Duck Game method for: {final_matrix}")

    try:
        # Use PIL-based animation
        return create_matrix_animation(final_matrix, result_text, winning_lines)

    except Exception as e:
        LOG.error(f"❌ Error creating animated matrix slots: {e}")

        # Simple fallback
        try:
            from PIL import Image, ImageDraw
            import io

            LOG.info("🔄 [DEBUG] Creating simple fallback matrix image")

            img = Image.new("RGBA", (800, 600), (50, 50, 50, 255))
            draw = ImageDraw.Draw(img)

            # Draw matrix as text
            for row in range(3):
                for col in range(3):
                    symbol = final_matrix[row][col]
                    emoji = MATRIX_SYMBOLS[symbol]['emoji']
                    x = 100 + col * 200
                    y = 150 + row * 100
                    draw.text((x, y), emoji, fill=(255, 255, 255, 255))

            draw.text((50, 50), "🎰 MATRIX SLOTS 🎰", fill=(255, 255, 255, 255))
            draw.text((50, 500), result_text, fill=(255, 255, 255, 255))

            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)

            LOG.info(
                f"📎 [DEBUG] Created fallback matrix image buffer, size: {len(buf.getvalue()):,} bytes")
            return discord.File(buf, filename="matrix_slots_fallback.png")

        except Exception as e2:
            LOG.error(f"❌ Error creating fallback matrix slots image: {e2}")
            return None


async def create_spinning_image(final_symbols: List[str] = None, result_text: str = "", view=None) -> discord.File:
    """Create slots animation using Duck Game's proven method."""
    if final_symbols is None:
        final_symbols = ['bar', 'cherries', 'diamond']

    LOG.info(
        f"🎰 [DEBUG] Creating slots animation using Duck Game method for: {final_symbols}")

    try:
        # Use PIL-based animation
        return create_slots_animation(final_symbols, result_text)

    except Exception as e:
        LOG.error(f"❌ Error creating animated slots: {e}")

        # Simple fallback
        try:
            from PIL import Image, ImageDraw
            import io

            LOG.info("🔄 [DEBUG] Creating simple fallback slots image")

            img = Image.new("RGBA", (600, 400), (50, 50, 50, 255))
            draw = ImageDraw.Draw(img)

            symbols_text = " | ".join(
                [SLOT_SYMBOLS[s]['emoji'] for s in final_symbols])
            draw.text((50, 150), f"🎰 {symbols_text} 🎰",
                      fill=(255, 255, 255, 255))
            draw.text((50, 200), result_text, fill=(255, 255, 255, 255))

            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)

            LOG.info(
                f"📎 [DEBUG] Created fallback image buffer, size: {len(buf.getvalue()):,} bytes")
            return discord.File(buf, filename="slots_fallback.png")

        except Exception as e2:
            LOG.error(f"❌ Error creating fallback slots image: {e2}")
            return None


def create_matrix_result(matrix: List[List[str]], result_text: str, winning_lines: List[Tuple[int, int, int, int]] = None) -> discord.File:
    """Create static matrix result using PIL and assets."""
    from PIL import Image, ImageDraw, ImageFont
    import io
    import os

    LOG.info(f"🎯 [DEBUG] Creating matrix result for: {matrix}")

    # Asset paths
    assets_dir = os.path.join(os.path.dirname(
        os.path.dirname(__file__)), "assets", "slots")

    # Load symbol images
    symbol_images = {}
    all_symbols = set()
    for row in matrix:
        all_symbols.update(row)

    for symbol in all_symbols:
        try:
            img_path = os.path.join(assets_dir, f"{symbol}.png")
            if os.path.exists(img_path):
                symbol_images[symbol] = Image.open(img_path).convert("RGBA")
            else:
                # Create fallback colored square
                symbol_images[symbol] = Image.new(
                    "RGBA", (120, 120), (100, 100, 100, 255))
        except Exception as e:
            LOG.error(f"❌ Error loading {symbol}: {e}")
            symbol_images[symbol] = Image.new(
                "RGBA", (120, 120), (100, 100, 100, 255))

    # Canvas settings for 3x3 matrix
    CANVAS_WIDTH = 800
    CANVAS_HEIGHT = 600
    CELL_SIZE = 120
    CELL_SPACING = 10

    # Create canvas
    canvas = Image.new(
        "RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (15, 15, 25, 255))
    draw = ImageDraw.Draw(canvas)

    # Title
    try:
        font = ImageFont.load_default()
    except:
        font = None

    draw.text((CANVAS_WIDTH//2 - 100, 20), "🎰 MATRIX RESULT 3x3 🎰",
              fill=(255, 255, 255), font=font)

    # Calculate matrix position (centered)
    matrix_width = 3 * CELL_SIZE + 2 * CELL_SPACING
    matrix_height = 3 * CELL_SIZE + 2 * CELL_SPACING
    start_x = (CANVAS_WIDTH - matrix_width) // 2
    start_y = (CANVAS_HEIGHT - matrix_height) // 2 + 30

    # Draw 3x3 grid with final results
    for row in range(3):
        for col in range(3):
            x = start_x + col * (CELL_SIZE + CELL_SPACING)
            y = start_y + row * (CELL_SIZE + CELL_SPACING)

            # Draw cell background
            draw.rectangle([x-2, y-2, x+CELL_SIZE+2, y+CELL_SIZE+2],
                           fill=(40, 40, 50), outline=(255, 255, 255))

            # Draw symbol
            symbol = matrix[row][col]
            symbol_img = symbol_images[symbol].resize(
                (CELL_SIZE-10, CELL_SIZE-10), Image.LANCZOS)
            symbol_x = x + 5
            symbol_y = y + 5

            canvas.paste(symbol_img, (symbol_x, symbol_y), symbol_img)

    # Draw winning lines
    if winning_lines:
        for line in winning_lines:
            row1, col1, row2, col2 = line
            x1 = start_x + col1 * (CELL_SIZE + CELL_SPACING) + CELL_SIZE // 2
            y1 = start_y + row1 * (CELL_SIZE + CELL_SPACING) + CELL_SIZE // 2
            x2 = start_x + col2 * (CELL_SIZE + CELL_SPACING) + CELL_SIZE // 2
            y2 = start_y + row2 * (CELL_SIZE + CELL_SPACING) + CELL_SIZE // 2

            # Draw thick golden line
            draw.line([(x1, y1), (x2, y2)], fill=(255, 215, 0), width=8)

    # Draw result text
    if result_text:
        text_lines = result_text.split("; ")
        for i, line in enumerate(text_lines[:3]):  # Max 3 lines
            text_x = CANVAS_WIDTH // 2 - len(line) * 4
            text_y = CANVAS_HEIGHT - 100 + i * 20
            draw.text((text_x, text_y), line, fill=(255, 255, 100), font=font)

    # Save as PNG
    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    buf.seek(0)

    LOG.info(f"✅ Created matrix result PNG: {len(buf.getvalue()):,} bytes")
    return discord.File(buf, filename="matrix_slots_result.png")


def create_slots_result(symbols: List[str], result_text: str) -> discord.File:
    """Create static slots result using PIL and assets."""
    from PIL import Image, ImageDraw, ImageFont
    import io
    import os

    LOG.info(f"🎯 [DEBUG] Creating slots result for: {symbols}")

    # Asset paths
    assets_dir = os.path.join(os.path.dirname(
        os.path.dirname(__file__)), "assets", "slots")

    # Load symbol images
    symbol_images = {}
    for symbol in symbols:
        try:
            img_path = os.path.join(assets_dir, f"{symbol}.png")
            if os.path.exists(img_path):
                symbol_images[symbol] = Image.open(img_path).convert("RGBA")
            else:
                # Create fallback colored square
                symbol_images[symbol] = Image.new(
                    "RGBA", (100, 100), (100, 100, 100, 255))
        except Exception as e:
            LOG.error(f"❌ Error loading {symbol}: {e}")
            symbol_images[symbol] = Image.new(
                "RGBA", (100, 100), (100, 100, 100, 255))

    # Canvas settings
    CANVAS_WIDTH = 600
    CANVAS_HEIGHT = 400
    REEL_WIDTH = 150
    REEL_HEIGHT = 120
    SYMBOL_SIZE = 100

    # Create canvas
    canvas = Image.new(
        "RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (20, 20, 30, 255))
    draw = ImageDraw.Draw(canvas)

    # Title
    try:
        font = ImageFont.load_default()
    except:
        font = None

    draw.text((CANVAS_WIDTH//2 - 50, 30), "🎰 SLOT RESULT 🎰",
              fill=(255, 255, 255), font=font)

    # Calculate reel positions (3 reels)
    total_reel_width = 3 * REEL_WIDTH
    start_x = (CANVAS_WIDTH - total_reel_width) // 2

    # Draw each reel with final result
    for i, symbol in enumerate(symbols):
        x = start_x + (i * REEL_WIDTH)
        y = (CANVAS_HEIGHT - REEL_HEIGHT) // 2

        # Draw reel background
        draw.rectangle([x-5, y-5, x+REEL_WIDTH+5, y+REEL_HEIGHT+5],
                       fill=(40, 40, 40), outline=(255, 255, 255))

        # Draw symbol
        symbol_img = symbol_images[symbol].resize(
            (SYMBOL_SIZE, SYMBOL_SIZE), Image.LANCZOS)
        symbol_x = x + (REEL_WIDTH - SYMBOL_SIZE) // 2
        symbol_y = y + (REEL_HEIGHT - SYMBOL_SIZE) // 2

        canvas.paste(symbol_img, (symbol_x, symbol_y), symbol_img)

        # Draw symbol name
        symbol_name = SLOT_SYMBOLS[symbol]['name']
        text_x = x + REEL_WIDTH // 2 - len(symbol_name) * 3
        text_y = y + REEL_HEIGHT + 10
        draw.text((text_x, text_y), symbol_name,
                  fill=(200, 200, 200), font=font)

    # Draw result text
    if result_text:
        text_x = CANVAS_WIDTH // 2 - len(result_text) * 4
        text_y = CANVAS_HEIGHT - 60
        draw.text((text_x, text_y), result_text,
                  fill=(255, 255, 100), font=font)

    # Save as PNG
    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    buf.seek(0)

    LOG.info(f"✅ Created slots result PNG: {len(buf.getvalue()):,} bytes")
    return discord.File(buf, filename="slots_result.png")


async def create_matrix_image(matrix: List[List[str]], result_type: str = None, winning_lines: List[Tuple[int, int, int, int]] = None, view=None) -> discord.File:
    """Create matrix result using Duck Game's proven method."""
    status = result_type if result_type else "Good luck!"

    LOG.info(
        f"🎰 [DEBUG] Creating matrix result using Duck Game method for: {matrix}")

    try:
        # Use PIL-based result generation
        return create_matrix_result(matrix, status, winning_lines)

    except Exception as e:
        LOG.error(f"❌ Error creating matrix result: {e}")

        # Simple fallback
        try:
            from PIL import Image, ImageDraw
            import io

            LOG.info("🔄 [DEBUG] Creating simple fallback matrix result image")

            img = Image.new("RGBA", (800, 600), (30, 30, 30, 255))
            draw = ImageDraw.Draw(img)

            # Draw matrix as text
            for row in range(3):
                for col in range(3):
                    symbol = matrix[row][col]
                    emoji = MATRIX_SYMBOLS[symbol]['emoji']
                    x = 100 + col * 200
                    y = 150 + row * 100
                    draw.text((x, y), emoji, fill=(255, 255, 255, 255))

            draw.text((50, 50), "🎰 MATRIX RESULT 🎰", fill=(255, 255, 255, 255))
            draw.text((50, 500), status, fill=(255, 255, 255, 255))

            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)

            LOG.info(
                f"📎 [DEBUG] Created fallback matrix result buffer, size: {len(buf.getvalue()):,} bytes")
            return discord.File(buf, filename="matrix_result_fallback.png")

        except Exception as e2:
            LOG.error(f"❌ Error creating fallback matrix result image: {e2}")
            return None


async def create_slots_image(symbols: List[str], result_type: str = None, view=None) -> discord.File:
    """Create slots result using Duck Game's proven method."""
    status = result_type if result_type else "Good luck!"

    LOG.info(
        f"🎰 [DEBUG] Creating slots result using Duck Game method for: {symbols}")

    try:
        # Use PIL-based result generation
        return create_slots_result(symbols, status)

    except Exception as e:
        LOG.error(f"❌ Error creating slots result: {e}")

        # Simple fallback
        try:
            from PIL import Image, ImageDraw
            import io

            LOG.info("🔄 [DEBUG] Creating simple fallback result image")

            img = Image.new("RGBA", (600, 400), (30, 30, 30, 255))
            draw = ImageDraw.Draw(img)

            symbols_text = " | ".join(
                [SLOT_SYMBOLS[s]['emoji'] for s in symbols])
            draw.text((50, 150), f"🎰 {symbols_text} 🎰",
                      fill=(255, 255, 255, 255))
            draw.text((50, 200), status, fill=(255, 255, 255, 255))

            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)

            LOG.info(
                f"📎 [DEBUG] Created fallback result buffer, size: {len(buf.getvalue()):,} bytes")
            return discord.File(buf, filename="slots_result_fallback.png")

        except Exception as e2:
            LOG.error(f"❌ Error creating fallback result image: {e2}")
            return None


async def create_matrix_waiting_image() -> discord.File:
    """Create initial waiting matrix slots image using PIL."""
    try:
        from PIL import Image, ImageDraw, ImageFont
        import io
        import os

        LOG.info("🔄 Creating waiting matrix slots image")

        # Canvas settings for 3x3 matrix
        CANVAS_WIDTH = 800
        CANVAS_HEIGHT = 600
        CELL_SIZE = 120
        CELL_SPACING = 10

        # Create canvas
        canvas = Image.new(
            "RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (15, 15, 25, 255))
        draw = ImageDraw.Draw(canvas)

        # Title
        try:
            font = ImageFont.load_default()
        except:
            font = None

        draw.text((CANVAS_WIDTH//2 - 100, 30),
                  "🎰 MATRIX READY TO SPIN! 🎰", fill=(255, 255, 255), font=font)

        # Calculate matrix position (centered)
        matrix_width = 3 * CELL_SIZE + 2 * CELL_SPACING
        matrix_height = 3 * CELL_SIZE + 2 * CELL_SPACING
        start_x = (CANVAS_WIDTH - matrix_width) // 2
        start_y = (CANVAS_HEIGHT - matrix_height) // 2 + 30

        # Draw 3x3 grid placeholder
        for row in range(3):
            for col in range(3):
                x = start_x + col * (CELL_SIZE + CELL_SPACING)
                y = start_y + row * (CELL_SIZE + CELL_SPACING)

                # Draw cell background
                draw.rectangle([x-2, y-2, x+CELL_SIZE+2, y+CELL_SIZE+2],
                               fill=(40, 40, 50), outline=(255, 255, 255))

                # Draw question mark
                text_x = x + CELL_SIZE // 2 - 10
                text_y = y + CELL_SIZE // 2 - 10
                draw.text((text_x, text_y), "?", fill=(
                    200, 200, 200), font=font)

        draw.text((CANVAS_WIDTH//2 - 120, CANVAS_HEIGHT - 80),
                  "Click SPIN to start the 3x3 matrix!", fill=(200, 200, 200), font=font)
        draw.text((CANVAS_WIDTH//2 - 70, CANVAS_HEIGHT - 50),
                  "Good luck! 🍀", fill=(255, 255, 100), font=font)

        # Save as PNG
        buf = io.BytesIO()
        canvas.save(buf, format="PNG")
        buf.seek(0)

        LOG.info("✅ Created waiting matrix slots image")
        return discord.File(buf, filename="waiting_matrix_slots.png")

    except Exception as e:
        LOG.error(f"Error creating matrix waiting image: {e}")
        return None


async def create_waiting_image() -> discord.File:
    """Create initial waiting slots image using PIL."""
    try:
        from PIL import Image, ImageDraw, ImageFont
        import io
        import os

        LOG.info("🔄 Creating waiting slots image")

        # Load a few slot assets for preview
        assets_dir = os.path.join(os.path.dirname(
            os.path.dirname(__file__)), "assets", "slots")

        # Canvas settings
        CANVAS_WIDTH = 600
        CANVAS_HEIGHT = 400

        # Create canvas
        canvas = Image.new(
            "RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (20, 20, 30, 255))
        draw = ImageDraw.Draw(canvas)

        # Title
        try:
            font = ImageFont.load_default()
        except:
            font = None

        draw.text((CANVAS_WIDTH//2 - 60, 50), "🎰 READY TO SPIN! 🎰",
                  fill=(255, 255, 255), font=font)
        draw.text((CANVAS_WIDTH//2 - 80, 150),
                  "Click SPIN to start the game!", fill=(200, 200, 200), font=font)
        draw.text((CANVAS_WIDTH//2 - 70, 250), "Good luck! 🍀",
                  fill=(255, 255, 100), font=font)

        # Save as PNG
        buf = io.BytesIO()
        canvas.save(buf, format="PNG")
        buf.seek(0)

        LOG.info("✅ Created waiting slots image")
        return discord.File(buf, filename="waiting_slots.png")

    except Exception as e:
        LOG.error(f"Error creating waiting image: {e}")
        return None

# All image generation is now handled in-memory with PIL - no cleanup needed!


class SlotsGameView(AutoRefundGameView):
    """Interactive view for the slots game."""

    def __init__(self, user, bet_amount: float, username: str):
        super().__init__(timeout=45)  # 45 second timeout with auto-refund
        self.user = user
        self.bet_amount = bet_amount
        self.username = username

        # Setup auto-refund
        self.setup_auto_refund(str(user.id), bet_amount, "slots")

        self.game_played = False
        self.current_wallet = 0.0
        self.session_ended = False
        self.last_interaction_time = asyncio.get_event_loop().time()

        # Session tracking
        self.session_total_bet = 0.0
        self.session_total_winnings = 0.0
        self.session_games_played = 0
        self.initial_wallet = 0.0  # Will be set when game starts

        # Buffalo bonus tracking
        self.bonus_round_active = False
        self.bonus_spins_remaining = 0
        self.bonus_initial_payout = 0.0

        # No cleanup needed for Duck Game method (files are in memory)
        self.generated_image_ids = []  # Not used with Duck Game method
        self.generated_files = []  # Not used with Duck Game method

    async def _end_session_internal(self, reason: str = "Session ended"):
        """Internal method to end the session and clean up."""
        if self.session_ended:
            return

        self.session_ended = True

        LOG.info(f"🧹 Starting cleanup for slots session: {reason}")

        # No file cleanup needed with Duck Game method (images are in memory only)
        LOG.info("✅ No files to clean up (using Duck Game method)")

        # Clear game session from database
        user_id = str(self.user.id)
        try:
            # We need to get guild_id somehow - store it during initialization
            if hasattr(self, 'guild_id'):
                await db_manager.clear_game_active(user_id, self.guild_id)
        except Exception as e:
            logging.getLogger("slots").error(
                f"Error clearing game session: {e}")

        # Remove from game registry
        game_registry.remove_session(self.user.id)

        # Disable all buttons
        for item in self.children:
            item.disabled = True

        LOG.info(f"✅ Slots session cleanup completed for user {user_id}")

    # No cleanup methods needed - all images are generated in-memory with PIL!

    @discord.ui.button(label="🎰 SPIN", style=discord.ButtonStyle.primary, emoji="🎰")
    async def spin_slots(self, interaction: discord.Interaction, button: Button):
        if interaction.user.id != self.user.id:
            await interaction.response.send_message("❌ This isn't your slot machine!", ephemeral=True)
            return

        if self.session_ended:
            await interaction.response.send_message("❌ This session has ended!", ephemeral=True)
            return

        # Defer the response immediately to prevent timeout
        await interaction.response.defer()

        # Mark game as started (prevents timeout refund)
        self.mark_game_started()

        # Update last interaction time
        self.last_interaction_time = asyncio.get_event_loop().time()

        # Disable the spin button during generation
        button.disabled = True
        button.label = "⏳ Generating..."

        if self.game_played:
            # Check if user has enough money for another spin
            user_id = str(self.user.id)
            guild_id = await get_guild_id(interaction)
            wallet, _ = await db_manager.get_balances(user_id, guild_id)

            if wallet < self.bet_amount:
                embed = discord.Embed(
                    title="❌ Insufficient Funds",
                    description=f"You need {fmt(self.bet_amount)} to spin again!\nYour wallet: {fmt(wallet)}",
                    color=discord.Color.red()
                )
                await interaction.followup.send(embed=embed, ephemeral=True)
                return

            # Deduct bet for new spin
            success, new_wallet = await db_manager.adjust_wallet(user_id, guild_id, -self.bet_amount)
            if not success:
                embed = discord.Embed(
                    title="❌ Transaction Failed",
                    description="Could not deduct bet amount. Please try again.",
                    color=discord.Color.red()
                )
                await interaction.followup.send(embed=embed, ephemeral=True)
                return
            self.current_wallet = new_wallet
        else:
            self.game_played = True
            # Set initial wallet for session tracking
            self.initial_wallet = self.current_wallet + self.bet_amount

        # Track session stats
        self.session_total_bet += self.bet_amount
        self.session_games_played += 1

        # Generate final result first (for proper animation)
        final_symbols = get_slot_result()
        payout, result_type = calculate_payout(final_symbols, self.bet_amount)

        # Track session winnings
        self.session_total_winnings += payout

        # Show generating status message with disabled button
        generating_embed = discord.Embed(
            title="🎰 SLOT MACHINE 🎰",
            description=f"**{self.username}** is spinning the reels!\n\n🎬 **Generating slot animation...**\nPlease wait while we create your perfect animation.",
            color=discord.Color.orange()
        )
        generating_embed.add_field(
            name="💰 Bet", value=fmt(self.bet_amount), inline=True)
        generating_embed.add_field(name="💼 Wallet", value=fmt(
            self.current_wallet), inline=True)
        generating_embed.add_field(
            name="🎲 Status", value="⏳ Generating...", inline=True)
        await interaction.edit_original_response(embed=generating_embed, view=self)

        # Track generation time
        import time
        start_time = time.time()

        # Create animated spinning GIF directly - no text loading
        LOG.info(
            f"🎬 [DEBUG] Starting animation generation for symbols: {final_symbols}")
        spinning_file = await create_spinning_image(final_symbols, result_type, self)

        generation_time = round(time.time() - start_time, 1)
        LOG.info(
            f"🎬 [DEBUG] Animation generation completed in {generation_time}s")

        if spinning_file:
            LOG.info(
                f"🎬 [DEBUG] Successfully created spinning file: {spinning_file.filename}")
            LOG.info(f"🎬 [DEBUG] Sending animation to Discord...")

            # Show the spinning animation immediately
            spinning_embed = discord.Embed(
                title="🎰 SLOT MACHINE 🎰",
                description=f"**{self.username}** is spinning the reels!",
                color=discord.Color.gold()
            )
            image_url = f"attachment://{spinning_file.filename}"
            spinning_embed.set_image(url=image_url)
            LOG.info(
                f"🖼️ [DEBUG] Set animation embed image URL to: {image_url}")
            spinning_embed.add_field(
                name="💰 Bet", value=fmt(self.bet_amount), inline=True)
            spinning_embed.add_field(name="💼 Wallet", value=fmt(
                self.current_wallet), inline=True)
            try:
                # Use Duck Game's 2-step approach for better compatibility
                LOG.info(
                    f"🔄 [DEBUG] Using Duck Game's 2-step message edit approach")

                # Step 1: Clear existing attachments
                await interaction.edit_original_response(embed=spinning_embed, view=self, attachments=[])

                # Step 2: Add new attachment
                spinning_file.fp.seek(0)  # Reset buffer
                await interaction.edit_original_response(embed=spinning_embed, view=self, attachments=[spinning_file])

                LOG.info(
                    f"✅ [DEBUG] Animation sent to Discord successfully (2-step method)")
            except discord.HTTPException as e:
                LOG.error(
                    f"❌ [DEBUG] Discord HTTP error sending animation: {e}")
                LOG.error(
                    f"❌ [DEBUG] Error code: {e.code if hasattr(e, 'code') else 'Unknown'}")
                LOG.error(
                    f"❌ [DEBUG] Error status: {e.status if hasattr(e, 'status') else 'Unknown'}")

                # Try fallback single-step edit
                try:
                    LOG.info(f"🔄 [DEBUG] Trying fallback single-step edit")
                    spinning_file.fp.seek(0)
                    await interaction.edit_original_response(embed=spinning_embed, attachments=[spinning_file], view=self)
                    LOG.info(f"✅ [DEBUG] Fallback single-step edit succeeded")
                except Exception as fallback_e:
                    LOG.error(
                        f"❌ [DEBUG] Fallback edit also failed: {fallback_e}")
                    raise
            except Exception as e:
                LOG.error(
                    f"❌ [DEBUG] Unexpected error sending animation to Discord: {e}")
                raise
            LOG.info(
                f"⏰ [DEBUG] Waiting 2.5 seconds for animation to complete...")
            # Wait for animation to complete (2 seconds animation)
            await asyncio.sleep(2.5)
            LOG.info(f"⏰ [DEBUG] Animation wait period completed")
        else:
            # VISUAL FALLBACK ONLY - try local GIF generators
            local_spinning_file = None

            # Try perfect_slots first
            try:
                from utils.perfect_slots import create_perfect_spinning
                buffer = create_perfect_spinning(final_symbols)
                local_spinning_file = discord.File(
                    buffer, filename="spinning_slots.gif")
            except:
                # Try smooth_slots_animation
                try:
                    from utils.smooth_slots_animation import create_smooth_spinning_animation
                    buffer = create_smooth_spinning_animation(final_symbols)
                    local_spinning_file = discord.File(
                        buffer, filename="spinning_slots.gif")
                except:
                    # Try animated_slots
                    try:
                        from utils.animated_slots import create_animated_spinning_slots
                        buffer = create_animated_spinning_slots(final_symbols)
                        local_spinning_file = discord.File(
                            buffer, filename="spinning_slots.gif")
                    except:
                        # Final fallback - static image only
                        try:
                            from utils.slots_visual import create_spinning_slots_image
                            buffer = create_spinning_slots_image()
                            local_spinning_file = discord.File(
                                buffer, filename="spinning_slots.png")
                        except:
                            local_spinning_file = None

            if local_spinning_file:
                # Show local animation
                spinning_embed = discord.Embed(
                    title="🎰 SLOT MACHINE 🎰",
                    description=f"**{self.username}** is spinning the reels!",
                    color=discord.Color.gold()
                )
                spinning_embed.set_image(
                    url=f"attachment://{local_spinning_file.filename}")
                spinning_embed.add_field(
                    name="💰 Bet", value=fmt(self.bet_amount), inline=True)
                spinning_embed.add_field(name="💼 Wallet", value=fmt(
                    self.current_wallet), inline=True)
                await interaction.edit_original_response(embed=spinning_embed, attachments=[local_spinning_file], view=self)
                await asyncio.sleep(2.0)
            else:
                # Skip animation if all visual fallbacks fail
                await asyncio.sleep(1.0)

        # Update database with results
        user_id = str(self.user.id)
        guild_id = await get_guild_id(interaction)

        if payout > 0:
            # Add winnings to wallet
            success, new_wallet = await db_manager.adjust_wallet(user_id, guild_id, payout)
            if success:
                self.current_wallet = new_wallet
            else:
                embed = discord.Embed(
                    title="❌ Payout Failed",
                    description="There was an error processing your winnings.",
                    color=discord.Color.red()
                )
                await interaction.edit_original_response(embed=embed, view=self)
                return
        else:
            # Get current wallet for display
            self.current_wallet, _ = await db_manager.get_balances(user_id, guild_id)

        # Record game result
        won = payout > 0
        await db_manager.record_game_result(user_id, guild_id, "slots", won, self.bet_amount, payout)

        # Note: Don't clear game session here - let user continue playing or manually end

        # Determine result color and title
        if payout >= self.bet_amount * 10:  # Big win
            color = discord.Color.gold()
            title = "🎰 MEGA WIN! 🎰"
        elif payout > self.bet_amount:  # Regular win
            color = discord.Color.green()
            title = "🎉 WINNER! 🎉"
        elif payout > 0:  # Small win
            color = discord.Color.blue()
            title = "🎊 SMALL WIN! 🎊"
        else:  # Loss
            color = discord.Color.red()
            title = "💥 NO LUCK! 💥"

        # Create result embed with visual
        embed = discord.Embed(
            title=title,
            description=f"**{self.username}**'s Slots Result!",
            color=color
        )

        # Try to create visual result
        LOG.info(
            f"🖼️ [DEBUG] Starting result image generation for symbols: {final_symbols}")
        result_file = await create_slots_image(final_symbols, result_type, self)
        if result_file:
            LOG.info(
                f"🖼️ [DEBUG] Successfully created result file: {result_file.filename}")
            result_image_url = f"attachment://{result_file.filename}"
            embed.set_image(url=result_image_url)
            LOG.info(
                f"🖼️ [DEBUG] Set result embed image URL to: {result_image_url}")
        else:
            LOG.warning(
                f"🖼️ [DEBUG] Failed to create result image - proceeding without visual")
        # No text fallback - visual only

        embed.add_field(name="💰 Bet Amount", value=fmt(
            self.bet_amount), inline=True)

        # Calculate session net profit/loss
        session_net = self.session_total_winnings - self.session_total_bet

        if payout > 0:
            embed.add_field(name="🏆 Winnings",
                            value=f"**{fmt(payout)}**", inline=True)
        else:
            embed.add_field(name="💸 This Spin",
                            value=f"**-{fmt(self.bet_amount)}**", inline=True)

        # Show session statistics
        if session_net >= 0:
            embed.add_field(name="📈 Session Net",
                            value=f"**+{fmt(session_net)}**", inline=True)
        else:
            embed.add_field(name="📉 Session Net",
                            value=f"**{fmt(session_net)}**", inline=True)

        embed.add_field(name="💼 Wallet",
                        value=f"**{fmt(self.current_wallet)}**", inline=True)

        # Add symbol information
        symbols_info = "\n".join([f"{symbol} {SLOT_SYMBOLS[symbol]['name']} - {SLOT_SYMBOLS[symbol]['payout']:.1f}x"
                                 for symbol in set(final_symbols)])
        embed.add_field(name="🎯 Symbols in Result",
                        value=symbols_info, inline=False)

        # Update button label for next spin
        if self.current_wallet >= self.bet_amount:
            button.label = f"🎰 SPIN AGAIN ({fmt(self.bet_amount)})"
            button.disabled = False
        else:
            button.label = "💸 Insufficient Funds"
            button.disabled = True

        embed.set_footer(
            text=f"🎰 Click 'SPIN AGAIN' for another round! | 🚪 End Session to quit | Generated in {generation_time}s")

        # Send final result with image
        LOG.info(f"📤 [DEBUG] Sending final result to Discord...")
        try:
            if result_file:
                LOG.info(
                    f"📤 [DEBUG] Sending result with attachment: {result_file.filename}")

                # Use Duck Game's 2-step approach for better compatibility
                LOG.info(
                    f"🔄 [DEBUG] Using Duck Game's 2-step method for result")

                # Step 1: Clear existing attachments
                await interaction.edit_original_response(embed=embed, view=self, attachments=[])

                # Step 2: Add new attachment
                result_file.fp.seek(0)  # Reset buffer
                await interaction.edit_original_response(embed=embed, view=self, attachments=[result_file])

                LOG.info(f"✅ [DEBUG] Result sent with 2-step method")
            else:
                LOG.info(f"📤 [DEBUG] Sending result without attachment")
                await interaction.edit_original_response(embed=embed, view=self)
            LOG.info(f"✅ [DEBUG] Final result sent to Discord successfully")
        except discord.HTTPException as e:
            LOG.error(
                f"❌ [DEBUG] Discord HTTP error sending final result: {e}")
            LOG.error(
                f"❌ [DEBUG] Error code: {e.code if hasattr(e, 'code') else 'Unknown'}")
            LOG.error(
                f"❌ [DEBUG] Error status: {e.status if hasattr(e, 'status') else 'Unknown'}")

            # Try fallback approach
            try:
                LOG.info(f"🔄 [DEBUG] Trying fallback single-step result edit")
                if result_file:
                    result_file.fp.seek(0)
                    await interaction.edit_original_response(embed=embed, attachments=[result_file], view=self)
                else:
                    await interaction.edit_original_response(embed=embed, view=self)
                LOG.info(f"✅ [DEBUG] Fallback result edit succeeded")
            except Exception as fallback_e:
                LOG.error(
                    f"❌ [DEBUG] Fallback result edit also failed: {fallback_e}")
                raise
        except Exception as e:
            LOG.error(
                f"❌ [DEBUG] Unexpected error sending final result to Discord: {e}")
            raise

        LOG.info(
            f"✅ [DEBUG] Slots spin completed successfully. All images generated in-memory!")

    @discord.ui.button(label="🚪 End Session", style=discord.ButtonStyle.secondary, emoji="🚪", row=1)
    async def end_session(self, interaction: discord.Interaction, button: Button):
        if interaction.user.id != self.user.id:
            await interaction.response.send_message("❌ This isn't your slot machine!", ephemeral=True)
            return

        if self.session_ended:
            await interaction.response.send_message("❌ Session already ended!", ephemeral=True)
            return

        # Update last interaction time
        self.last_interaction_time = asyncio.get_event_loop().time()

        # End session internally
        await self._end_session_internal("User ended session")

        # Clear game session from database
        user_id = str(self.user.id)
        guild_id = await get_guild_id(interaction)
        await db_manager.clear_game_active(user_id, guild_id)

        # Create final session summary
        session_net = self.session_total_winnings - self.session_total_bet

        embed = discord.Embed(
            title="🚪 Slots Session Ended",
            description=f"**{self.username}** has ended their slots session.\n\n"
            f"💼 Final Wallet: **{fmt(self.current_wallet)}**\n"
            f"🎲 Games Played: **{self.session_games_played}**\n"
            f"💰 Total Bet: **{fmt(self.session_total_bet)}**\n"
            f"🏆 Total Won: **{fmt(self.session_total_winnings)}**\n"
            f"{'📈 Session Profit' if session_net >= 0 else '📉 Session Loss'}: **{fmt(abs(session_net))}**\n\n"
            f"🎰 Thanks for playing!",
            color=discord.Color.green() if session_net >= 0 else discord.Color.red()
        )

        embed.set_footer(text="🎲 Use /slots to start a new session anytime!")

        await interaction.response.edit_message(embed=embed, view=self)

    async def on_timeout(self):
        """Handle timeout."""
        if not self.session_ended:
            await self._end_session_internal("Session timed out")

        user_id = str(self.user.id)
        try:
            if hasattr(self, 'guild_id'):
                await db_manager.clear_game_active(user_id, self.guild_id)
        except Exception as e:
            logging.getLogger("slots").error(f"Error in timeout cleanup: {e}")

    async def start_auto_timeout_check(self, message):
        """Start checking for 25-second auto-timeout."""
        while not self.session_ended:
            await asyncio.sleep(1.0)  # Check every second

            if self.session_ended:
                break

            current_time = asyncio.get_event_loop().time()
            time_since_last_interaction = current_time - self.last_interaction_time

            # If no interaction for 25 seconds, auto-end session
            if time_since_last_interaction >= 25.0:
                await self._end_session_internal("Auto-timeout after 25 seconds of inactivity")

                # Update the message to show session ended - remove all buttons
                try:
                    embed = discord.Embed(
                        title="🚪 Session Ended",
                        description=f"**{self.username}**'s slots session has ended.\n\n"
                        f"💼 Final Wallet Balance: **{fmt(self.current_wallet)}**\n"
                        f"🎰 Session automatically ended after 25 seconds.",
                        color=discord.Color.blue()
                    )
                    embed.set_footer(
                        text="🎲 Use /slots to start a new session anytime!")

                    # Remove all buttons by passing empty view
                    from discord.ui import View
                    empty_view = View()
                    await message.edit(embed=embed, view=empty_view)
                except:
                    pass  # Ignore if we can't edit the message
                break


class MatrixSlotsGameView(AutoRefundGameView):
    """Interactive view for the matrix slots game."""

    def __init__(self, user, bet_amount: float, username: str):
        super().__init__(timeout=60)  # 60 second timeout with auto-refund
        self.user = user
        self.bet_amount = bet_amount
        self.username = username

        # Setup auto-refund
        self.setup_auto_refund(str(user.id), bet_amount, "matrix_slots")

        self.game_played = False
        self.current_wallet = 0.0
        self.session_ended = False
        self.last_interaction_time = asyncio.get_event_loop().time()

        # Session tracking
        self.session_total_bet = 0.0
        self.session_total_winnings = 0.0
        self.session_games_played = 0
        self.initial_wallet = 0.0  # Will be set when game starts

        # Matrix specific
        self.matrix_result = None
        self.winning_lines = []

        # Buffalo bonus tracking
        self.bonus_round_active = False
        self.bonus_spins_remaining = 0
        self.bonus_initial_payout = 0.0

    async def _end_session_internal(self, reason: str = "Session ended"):
        """Internal method to end the session and clean up."""
        if self.session_ended:
            return

        self.session_ended = True

        LOG.info(f"🧹 Starting cleanup for matrix slots session: {reason}")

        # Clear game session from database
        user_id = str(self.user.id)
        try:
            if hasattr(self, 'guild_id'):
                await db_manager.clear_game_active(user_id, self.guild_id)
        except Exception as e:
            logging.getLogger("slots").error(
                f"Error clearing game session: {e}")

        # Remove from game registry
        game_registry.remove_session(self.user.id)

        # Disable all buttons
        for item in self.children:
            item.disabled = True

        LOG.info(
            f"✅ Matrix slots session cleanup completed for user {user_id}")

    @discord.ui.button(label="🎰 SPIN MATRIX", style=discord.ButtonStyle.primary, emoji="🎰")
    async def spin_matrix(self, interaction: discord.Interaction, button: Button):
        if interaction.user.id != self.user.id:
            await interaction.response.send_message("❌ This isn't your matrix slot machine!", ephemeral=True)
            return

        if self.session_ended:
            await interaction.response.send_message("❌ This session has ended!", ephemeral=True)
            return

        # Defer the response immediately to prevent timeout
        await interaction.response.defer()

        # Mark game as started (prevents timeout refund)
        self.mark_game_started()

        # Update last interaction time
        self.last_interaction_time = asyncio.get_event_loop().time()

        # Disable the spin button during generation
        button.disabled = True
        button.label = "⏳ Generating..."

        # Handle bonus spins vs regular spins
        if self.bonus_round_active and self.bonus_spins_remaining > 0:
            # This is a bonus spin - no cost
            self.bonus_spins_remaining -= 1
            if self.bonus_spins_remaining == 0:
                self.bonus_round_active = False
        elif self.game_played:
            # Check if user has enough money for another spin
            user_id = str(self.user.id)
            guild_id = await get_guild_id(interaction)
            wallet, _ = await db_manager.get_balances(user_id, guild_id)

            if wallet < self.bet_amount:
                embed = discord.Embed(
                    title="❌ Insufficient Funds",
                    description=f"You need {fmt(self.bet_amount)} to spin again!\nYour wallet: {fmt(wallet)}",
                    color=discord.Color.red()
                )
                await interaction.followup.send(embed=embed, ephemeral=True)
                return

            # Deduct bet for new spin
            success, new_wallet = await db_manager.adjust_wallet(user_id, guild_id, -self.bet_amount)
            if not success:
                embed = discord.Embed(
                    title="❌ Transaction Failed",
                    description="Could not deduct bet amount. Please try again.",
                    color=discord.Color.red()
                )
                await interaction.followup.send(embed=embed, ephemeral=True)
                return
            self.current_wallet = new_wallet
        else:
            self.game_played = True
            # Set initial wallet for session tracking
            self.initial_wallet = self.current_wallet + self.bet_amount

        # Track session stats (don't count free bonus spins)
        is_bonus_spin = self.bonus_round_active or (
            self.bonus_spins_remaining >= 0 and self.bonus_spins_remaining < 5)
        if not is_bonus_spin:
            self.session_total_bet += self.bet_amount
        self.session_games_played += 1

        # Generate final matrix result
        final_matrix = get_matrix_result()
        payout, result_type, winning_lines, buffalo_bonus_triggered = calculate_matrix_payout(
            final_matrix, self.bet_amount)

        # Handle buffalo bonus
        if buffalo_bonus_triggered:
            self.bonus_round_active = True
            self.bonus_spins_remaining = 5
            self.bonus_initial_payout = payout

        # Track session winnings
        self.session_total_winnings += payout
        self.matrix_result = final_matrix
        self.winning_lines = winning_lines

        # Show generating status message
        generating_embed = discord.Embed(
            title="🎰 MATRIX SLOTS 3x3 🎰",
            description=f"**{self.username}** is spinning the matrix!\n\n🎬 **Generating matrix animation...**\nPlease wait while we create your perfect 3x3 animation.",
            color=discord.Color.orange()
        )
        generating_embed.add_field(
            name="💰 Bet", value=fmt(self.bet_amount), inline=True)
        generating_embed.add_field(name="💼 Wallet", value=fmt(
            self.current_wallet), inline=True)
        generating_embed.add_field(
            name="🎲 Status", value="⏳ Generating...", inline=True)
        await interaction.edit_original_response(embed=generating_embed, view=self)

        # Track generation time
        import time
        start_time = time.time()

        # Create animated spinning GIF
        LOG.info(
            f"🎬 [DEBUG] Starting matrix animation generation for: {final_matrix}")
        spinning_file = await create_matrix_spinning_image(final_matrix, result_type, winning_lines, self)

        generation_time = round(time.time() - start_time, 1)
        LOG.info(
            f"🎬 [DEBUG] Matrix animation generation completed in {generation_time}s")

        if spinning_file:
            # Show the spinning animation
            spinning_embed = discord.Embed(
                title="🎰 MATRIX SLOTS 3x3 🎰",
                description=f"**{self.username}** is spinning the matrix!",
                color=discord.Color.gold()
            )
            image_url = f"attachment://{spinning_file.filename}"
            spinning_embed.set_image(url=image_url)
            spinning_embed.add_field(
                name="💰 Bet", value=fmt(self.bet_amount), inline=True)
            spinning_embed.add_field(name="💼 Wallet", value=fmt(
                self.current_wallet), inline=True)

            try:
                # Use 2-step approach
                await interaction.edit_original_response(embed=spinning_embed, view=self, attachments=[])
                spinning_file.fp.seek(0)
                await interaction.edit_original_response(embed=spinning_embed, view=self, attachments=[spinning_file])
            except Exception as e:
                LOG.error(f"❌ Error sending matrix animation: {e}")

            # Wait for animation to complete
            await asyncio.sleep(3.0)
        else:
            await asyncio.sleep(1.5)

        # Update database with results
        user_id = str(self.user.id)
        guild_id = await get_guild_id(interaction)

        if payout > 0:
            # Add winnings to wallet
            success, new_wallet = await db_manager.adjust_wallet(user_id, guild_id, payout)
            if success:
                self.current_wallet = new_wallet
            else:
                embed = discord.Embed(
                    title="❌ Payout Failed",
                    description="There was an error processing your winnings.",
                    color=discord.Color.red()
                )
                await interaction.edit_original_response(embed=embed, view=self)
                return
        else:
            # Get current wallet for display
            self.current_wallet, _ = await db_manager.get_balances(user_id, guild_id)

        # Record game result
        won = payout > 0
        await db_manager.record_game_result(user_id, guild_id, "matrix_slots", won, self.bet_amount, payout)

        # Determine result color and title
        if 'BUFFALO BONUS' in result_type:
            color = discord.Color.purple()
            title = "🎆 BUFFALO BONUS! 🎆"
        elif payout >= self.bet_amount * 15:  # Big win
            color = discord.Color.gold()
            title = "🎰 MEGA WIN! 🎰"
        elif payout > self.bet_amount:
            color = discord.Color.green()
            title = "🎉 WINNER! 🎉"
        elif payout > 0:
            color = discord.Color.blue()
            title = "🎊 SMALL WIN! 🎊"
        else:
            color = discord.Color.red()
            title = "💥 NO LUCK! 💥"

        # Create result embed with visual
        embed = discord.Embed(
            title=title,
            description=f"**{self.username}**'s Matrix Slots Result!",
            color=color
        )

        # Create result image
        result_file = await create_matrix_image(final_matrix, result_type, winning_lines, self)
        if result_file:
            result_image_url = f"attachment://{result_file.filename}"
            embed.set_image(url=result_image_url)

        embed.add_field(name="💰 Bet Amount", value=fmt(
            self.bet_amount), inline=True)

        # Calculate session net profit/loss
        session_net = self.session_total_winnings - self.session_total_bet

        if payout > 0:
            embed.add_field(name="🏆 Winnings",
                            value=f"**{fmt(payout)}**", inline=True)
        else:
            embed.add_field(name="💸 This Spin",
                            value=f"**-{fmt(self.bet_amount)}**", inline=True)

        # Show session statistics
        if session_net >= 0:
            embed.add_field(name="📈 Session Net",
                            value=f"**+{fmt(session_net)}**", inline=True)
        else:
            embed.add_field(name="📉 Session Net",
                            value=f"**{fmt(session_net)}**", inline=True)

        embed.add_field(name="💼 Wallet",
                        value=f"**{fmt(self.current_wallet)}**", inline=True)

        # Add winning lines info
        if winning_lines:
            lines_info = f"Found {len(winning_lines)} winning line(s)!"
            embed.add_field(name="🎯 Winning Lines",
                            value=lines_info, inline=False)

        # Show bonus round info if active
        if self.bonus_round_active and self.bonus_spins_remaining > 0:
            embed.add_field(name="🦬 Buffalo Bonus Active",
                            value=f"**{self.bonus_spins_remaining} FREE SPINS remaining!**", inline=False)

        # Update button label for next spin
        if self.bonus_round_active and self.bonus_spins_remaining > 0:
            button.label = f"🦬 FREE SPIN ({self.bonus_spins_remaining} left)"
            button.disabled = False
        elif self.current_wallet >= self.bet_amount:
            button.label = f"🎰 SPIN AGAIN ({fmt(self.bet_amount)})"
            button.disabled = False
        else:
            button.label = "💸 Insufficient Funds"
            button.disabled = True

        embed.set_footer(
            text=f"🎰 Click 'SPIN AGAIN' for another round! | 🚪 End Session to quit | Generated in {generation_time}s")

        # Send final result
        try:
            if result_file:
                await interaction.edit_original_response(embed=embed, view=self, attachments=[])
                result_file.fp.seek(0)
                await interaction.edit_original_response(embed=embed, view=self, attachments=[result_file])
            else:
                await interaction.edit_original_response(embed=embed, view=self)
        except Exception as e:
            LOG.error(f"❌ Error sending matrix result: {e}")

    @discord.ui.button(label="🚪 End Session", style=discord.ButtonStyle.secondary, emoji="🚪", row=1)
    async def end_session(self, interaction: discord.Interaction, button: Button):
        if interaction.user.id != self.user.id:
            await interaction.response.send_message("❌ This isn't your matrix slot machine!", ephemeral=True)
            return

        if self.session_ended:
            await interaction.response.send_message("❌ Session already ended!", ephemeral=True)
            return

        # Update last interaction time
        self.last_interaction_time = asyncio.get_event_loop().time()

        # End session internally
        await self._end_session_internal("User ended session")

        # Clear game session from database
        user_id = str(self.user.id)
        guild_id = await get_guild_id(interaction)
        await db_manager.clear_game_active(user_id, guild_id)

        # Create final session summary
        session_net = self.session_total_winnings - self.session_total_bet

        embed = discord.Embed(
            title="🚪 Matrix Slots Session Ended",
            description=f"**{self.username}** has ended their matrix slots session.\n\n"
            f"💼 Final Wallet: **{fmt(self.current_wallet)}**\n"
            f"🎲 Games Played: **{self.session_games_played}**\n"
            f"💰 Total Bet: **{fmt(self.session_total_bet)}**\n"
            f"🏆 Total Won: **{fmt(self.session_total_winnings)}**\n"
            f"{'📈 Session Profit' if session_net >= 0 else '📉 Session Loss'}: **{fmt(abs(session_net))}**\n\n"
            f"🎰 Thanks for playing!",
            color=discord.Color.green() if session_net >= 0 else discord.Color.red()
        )

        embed.set_footer(
            text="🎲 Use /matrixslots to start a new session anytime!")

        await interaction.response.edit_message(embed=embed, view=self)

    async def on_timeout(self):
        """Handle timeout."""
        if not self.session_ended:
            await self._end_session_internal("Session timed out")

        user_id = str(self.user.id)
        try:
            if hasattr(self, 'guild_id'):
                await db_manager.clear_game_active(user_id, self.guild_id)
        except Exception as e:
            logging.getLogger("slots").error(f"Error in timeout cleanup: {e}")

# --- Slots Cog -------------------------------------------------------------


class Slots(Cog):
    def __init__(self, bot):
        self.bot = bot
        game_registry.register_game(
            "Slots", self.__class__, "Classic slot machine with spinning reels and jackpots!")
        game_registry.register_game("Matrix Slots", self.__class__,
                                    "Advanced 3x3 matrix slots with multiple winning lines and buffalo bonuses!")

    @app_commands.command(name="slots", description="🎰 Play the slot machine! Spin for jackpots and prizes!")
    @app_commands.describe(amount="Bet amount (use K/M/B suffixes, 'A' for all, 'H' for half)")
    async def slots_command(self, interaction: discord.Interaction, amount: str):
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

        # Deduct bet amount
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
        await db_manager.set_game_active(user_id, guild_id, "slots", amount)

        # Add to game registry
        game_registry.add_session(interaction.user.id)

        # Create game view
        view = SlotsGameView(interaction.user, amount,
                             f"<@{interaction.user.id}>")
        view.current_wallet = new_wallet
        view.guild_id = guild_id  # Store guild_id for cleanup

        # Create initial game embed with visual
        embed = discord.Embed(
            title="🎰 SLOT MACHINE 🎰",
            description=f"**<@{interaction.user.id}>** is ready to spin!",
            color=discord.Color.blue()
        )

        # Try to create waiting image
        waiting_file = await create_waiting_image()
        if waiting_file:
            embed.set_image(url="attachment://waiting_slots.png")
        # No text fallback - visual only

        embed.add_field(name="💰 Bet Amount", value=fmt(amount), inline=True)
        embed.add_field(name="💼 Remaining Wallet",
                        value=fmt(new_wallet), inline=True)
        embed.add_field(name="🏦 Bank Balance",
                        value=fmt(bank_balance), inline=True)

        # Add payout table
        payout_info = "**🎰 Payout Table (3 matching symbols):**\n"
        for symbol, data in list(SLOT_SYMBOLS.items())[:5]:  # Show top 5
            payout_info += f"{symbol} {data['name']}: **{data['payout']:.1f}x**\n"
        payout_info += f"... and more! Two matches = 0.5x base payout"

        embed.add_field(name="💎 Payouts", value=payout_info, inline=False)
        embed.set_footer(
            text="🎰 Click SPIN to start! Good luck! 🍀 | Auto-ends after 25s inactivity")

        # Send initial message with image
        if waiting_file:
            message = await interaction.followup.send(embed=embed, file=waiting_file, view=view)
        else:
            message = await interaction.followup.send(embed=embed, view=view)
        try:
            from utils.common import set_user_game_message
            set_user_game_message(user_id, message)
        except Exception:
            pass

        # Start the auto-timeout check in the background
        asyncio.create_task(view.start_auto_timeout_check(message))

    @app_commands.command(name="matrixslots", description="🎰 Play the 3x3 matrix slot machine! Win on lines, diagonals, and buffalo bonuses!")
    @app_commands.describe(amount="Bet amount (minimum 50K, use K/M/B suffixes, 'A' for all, 'H' for half)")
    async def matrix_slots_command(self, interaction: discord.Interaction, amount: str):
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

        # Check minimum bet for matrix mode
        if amount < MATRIX_MIN_BET:
            embed = discord.Embed(
                title="❌ Minimum Bet Required",
                description=f"Matrix Slots requires a minimum bet of {fmt(MATRIX_MIN_BET)}!\nYour bet: {fmt(amount)}",
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

        # Deduct bet amount
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
        await db_manager.set_game_active(user_id, guild_id, "matrix_slots", amount)

        # Add to game registry
        game_registry.add_session(interaction.user.id)

        # Create game view
        view = MatrixSlotsGameView(
            interaction.user, amount, f"<@{interaction.user.id}>")
        view.current_wallet = new_wallet
        view.guild_id = guild_id  # Store guild_id for cleanup

        # Create initial game embed with visual
        embed = discord.Embed(
            title="🎰 MATRIX SLOTS 3x3 🎰",
            description=f"**<@{interaction.user.id}>** is ready to spin the matrix!",
            color=discord.Color.purple()
        )

        # Try to create matrix waiting image
        waiting_file = await create_matrix_waiting_image()
        if waiting_file:
            embed.set_image(url="attachment://waiting_matrix_slots.png")

        embed.add_field(name="💰 Bet Amount", value=fmt(amount), inline=True)
        embed.add_field(name="💼 Remaining Wallet",
                        value=fmt(new_wallet), inline=True)
        embed.add_field(name="🏦 Bank Balance",
                        value=fmt(bank_balance), inline=True)

        # Add matrix payout table
        payout_info = "**🎰 Matrix Payout Table (3 in a line):**\n"
        special_symbols = ['buffalo', 'jackpot', 'diamond', 'seven', 'bar']
        for symbol in special_symbols:
            data = MATRIX_SYMBOLS[symbol]
            if symbol == 'buffalo':
                payout_info += f"{symbol} {data['name']}: **5x + 5 FREE SPINS**\n"
            else:
                payout_info += f"{symbol} {data['name']}: **{data['payout']:.1f}x**\n"
        payout_info += f"... and more! Win on horizontal, vertical, and diagonal lines!"

        embed.add_field(name="📎 Payouts", value=payout_info, inline=False)
        embed.set_footer(
            text="🎰 Click SPIN MATRIX to start! Buffalo = Bonus Round! 🍀")

        # Send initial message with image
        if waiting_file:
            message = await interaction.followup.send(embed=embed, file=waiting_file, view=view)
        else:
            message = await interaction.followup.send(embed=embed, view=view)
        try:
            from utils.common import set_user_game_message
            set_user_game_message(user_id, message)
        except Exception:
            pass

    @app_commands.command(name="matrixhelp", description="🎰 Learn how to play the Matrix Slots game!")
    async def matrix_help_command(self, interaction: discord.Interaction):
        embed = discord.Embed(
            title="🎰 Matrix Slots 3x3 Help",
            description="Advanced 3x3 slot machine with multiple winning lines and buffalo bonuses!",
            color=discord.Color.purple()
        )

        embed.add_field(
            name="🎮 How to Play",
            value="`/matrixslots [amount]` - Place your bet (min 50K) and spin the 3x3 matrix\n"
                  "Click 'SPIN MATRIX' to start the spinning animation\n"
                  "Win on horizontal, vertical, and diagonal lines!",
            inline=False
        )

        embed.add_field(
            name="🏆 Winning Lines",
            value="• **Horizontal Lines**: 3 rows (top, middle, bottom)\n"
                  "• **Vertical Lines**: 3 columns (left, center, right)\n"
                  "• **Diagonal Lines**: 2 diagonals (corner to corner)\n"
                  "• **Multiple Wins**: Can win on multiple lines at once!",
            inline=False
        )

        embed.add_field(
            name="🦬 Buffalo Bonus",
            value="• **3 Buffalo in a line**: Triggers 5x initial payout + 5 FREE SPINS!\n"
                  "• **Free Spins**: No cost, all winnings are yours!\n"
                  "• **Golden Lines**: Winning lines are highlighted in gold",
            inline=False
        )

        # Create matrix payout table
        payout_table = "**📎 Matrix Symbol Values (3 in a line):**\n"
        for symbol, data in list(MATRIX_SYMBOLS.items()):
            if symbol == 'buffalo':
                payout_table += f"{symbol} {data['name']}: **5x + 5 FREE SPINS**\n"
            else:
                rarity_desc = "Legendary" if data['rarity'] <= 2 else "Rare" if data['rarity'] <= 6 else "Common"
                payout_table += f"{symbol} {data['name']}: **{data['payout']:.1f}x** ({rarity_desc})\n"

        embed.add_field(name="🎯 Symbol Values",
                        value=payout_table, inline=False)

        embed.add_field(
            name="💡 Tips",
            value="• Higher minimum bet (50K) but much higher payouts\n"
                  "• Multiple winning lines = multiple payouts\n"
                  "• Buffalo symbols trigger massive bonus rounds\n"
                  "• Jackpot symbol still gives 200x your bet!",
            inline=False
        )

        embed.add_field(
            name="🍀 Example",
            value="Bet: $100,000\n"
                  "Result: 🦬 🦬 🦬 (Buffalo Line)\n"
                  "Initial Payout: $500,000 (5x) + 5 FREE SPINS!\n"
                  "Total Potential: Much higher with free spins!",
            inline=False
        )

        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="slotshelp", description="🎰 Learn how to play the Slots game!")
    async def slots_help_command(self, interaction: discord.Interaction):
        embed = discord.Embed(
            title="🎰 Slot Machine Help",
            description="Classic slot machine with 3 reels and multiple winning combinations!",
            color=discord.Color.blurple()
        )

        embed.add_field(
            name="🎮 How to Play",
            value="`/slots [amount]` - Place your bet and spin the reels\n"
                  "Click 'SPIN' to start the spinning animation\n"
                  "Match symbols to win prizes!",
            inline=False
        )

        embed.add_field(
            name="🏆 Winning Combinations",
            value="• **Three of a Kind**: Highest payouts (2x - 100x)\n"
                  "• **Two of a Kind**: Half the base symbol payout\n"
                  "• **No Matches**: No payout, try again!",
            inline=False
        )

        # Create full payout table
        payout_table = "**💎 Full Payout Table (3 matching):**\n"
        for symbol, data in SLOT_SYMBOLS.items():
            rarity_desc = "Very Rare" if data['rarity'] <= 3 else "Rare" if data['rarity'] <= 8 else "Common"
            payout_table += f"{symbol} {data['name']}: **{data['payout']:.1f}x** ({rarity_desc})\n"

        embed.add_field(name="🎯 Symbol Values",
                        value=payout_table, inline=False)

        embed.add_field(
            name="💡 Tips",
            value="• Rarer symbols have higher payouts but appear less often\n"
                  "• Two matching symbols still give you a small win\n"
                  "• 🎰 Jackpot symbol gives 100x your bet!\n"
                  "• Use 'SPIN AGAIN' button for quick re-spins",
            inline=False
        )

        embed.add_field(
            name="🍀 Example",
            value="Bet: $1,000\n"
                  "Result: 💎 💎 💎 (Three Diamonds)\n"
                  "Payout: $15,000 (15x multiplier)!\n"
                  "Net Profit: +$14,000",
            inline=False
        )

        await interaction.response.send_message(embed=embed)


# Simple slots manager for compatibility with general.py
class SlotsManager:
    """Simple manager to provide compatibility interface for slots games."""

    def __init__(self):
        self.games = {}  # Empty dict since Slots uses game_registry

    def remove_game(self, user_id):
        """Remove game (no-op since Slots uses game_registry)."""
        pass


# Create global slots_manager instance
slots_manager = SlotsManager()


# Setup function for bot integration
async def setup(bot):
    import inspect
    cog = Slots(bot)
    add_cog = getattr(bot, "add_cog")
    if inspect.iscoroutinefunction(add_cog):
        await add_cog(cog)
    else:
        add_cog(cog)
