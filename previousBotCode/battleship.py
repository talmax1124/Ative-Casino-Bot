"""
Battleship Game - A classic two-player naval strategy game.

Features:
- 10x10 grid with traditional ship placement
- Ships: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2)
- Interactive ship placement with direction selection
- Turn-based attacking with hit/miss/sunk feedback
- Pillow-generated board visualization
- Optional pot betting system
- Ephemeral messages for privacy
- Full game state management
"""

import discord
from discord import app_commands
from discord.ext.commands import Cog
from discord.ui import View, Button, Modal, TextInput, Select
import asyncio
from PIL import Image, ImageDraw, ImageFont
import io
import logging
from typing import Dict, List, Optional, Tuple, Set
from utils.firebase_database import db_manager
from utils.common import fmt, get_guild_id, game_registry, check_maintenance_mode
from utils.image_generator import upload_frame_and_get_url
from enum import Enum
import random

LOG = logging.getLogger("battleship")

# ========================= CONSTANTS =========================

BOARD_SIZE = 10
CELL_SIZE = 40
BOARD_PIXEL_SIZE = BOARD_SIZE * CELL_SIZE

# Ship definitions: (name, length)
SHIPS = [
    ("Carrier", 5),
    ("Battleship", 4),
    ("Cruiser", 3),
    ("Submarine", 3),
    ("Destroyer", 2)
]

class CellState(Enum):
    EMPTY = "empty"
    SHIP = "ship"
    HIT = "hit"
    MISS = "miss"
    SUNK = "sunk"

class Direction(Enum):
    HORIZONTAL = "horizontal"
    VERTICAL = "vertical"

# ========================= GAME CLASSES =========================

class Ship:
    """Represents a ship on the battleship board."""
    
    def __init__(self, name: str, length: int):
        self.name = name
        self.length = length
        self.positions: List[Tuple[int, int]] = []
        self.hits: Set[Tuple[int, int]] = set()
        self.placed = False
    
    def place(self, start_row: int, start_col: int, direction: Direction):
        """Place the ship on the board."""
        self.positions = []
        
        if direction == Direction.HORIZONTAL:
            for i in range(self.length):
                self.positions.append((start_row, start_col + i))
        else:  # VERTICAL
            for i in range(self.length):
                self.positions.append((start_row + i, start_col))
        
        self.placed = True
    
    def hit(self, row: int, col: int) -> bool:
        """Register a hit on this ship. Returns True if hit."""
        if (row, col) in self.positions:
            self.hits.add((row, col))
            return True
        return False
    
    def is_sunk(self) -> bool:
        """Check if the ship is completely sunk."""
        return len(self.hits) == self.length
    
    def get_positions(self) -> List[Tuple[int, int]]:
        """Get all positions occupied by this ship."""
        return self.positions.copy()

class BattleshipBoard:
    """Represents a player's battleship board."""
    
    def __init__(self, player_id: int):
        self.player_id = player_id
        self.grid = [[CellState.EMPTY for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]
        self.ships: List[Ship] = [Ship(name, length) for name, length in SHIPS]
        self.ship_positions: Dict[Tuple[int, int], Ship] = {}
        self.current_ship_index = 0
        
    def can_place_ship(self, ship: Ship, start_row: int, start_col: int, direction: Direction) -> bool:
        """Check if a ship can be placed at the given position."""
        positions = []
        
        if direction == Direction.HORIZONTAL:
            if start_col + ship.length > BOARD_SIZE:
                return False
            for i in range(ship.length):
                positions.append((start_row, start_col + i))
        else:  # VERTICAL
            if start_row + ship.length > BOARD_SIZE:
                return False
            for i in range(ship.length):
                positions.append((start_row + i, start_col))
        
        # Check if any position is occupied or adjacent to another ship
        for row, col in positions:
            if (row, col) in self.ship_positions:
                return False
            
            # Check adjacent cells (ships can't touch)
            for dr in [-1, 0, 1]:
                for dc in [-1, 0, 1]:
                    adj_row, adj_col = row + dr, col + dc
                    if (0 <= adj_row < BOARD_SIZE and 0 <= adj_col < BOARD_SIZE and
                        (adj_row, adj_col) != (row, col) and
                        (adj_row, adj_col) in self.ship_positions):
                        return False
        
        return True
    
    def place_ship(self, ship: Ship, start_row: int, start_col: int, direction: Direction) -> bool:
        """Place a ship on the board."""
        if not self.can_place_ship(ship, start_row, start_col, direction):
            return False
        
        ship.place(start_row, start_col, direction)
        
        for row, col in ship.positions:
            self.grid[row][col] = CellState.SHIP
            self.ship_positions[(row, col)] = ship
        
        return True
    
    def get_current_ship(self) -> Optional[Ship]:
        """Get the ship currently being placed."""
        if self.current_ship_index < len(self.ships):
            return self.ships[self.current_ship_index]
        return None
    
    def advance_ship(self) -> bool:
        """Move to the next ship. Returns True if more ships to place."""
        self.current_ship_index += 1
        return self.current_ship_index < len(self.ships)
    
    def all_ships_placed(self) -> bool:
        """Check if all ships have been placed."""
        return all(ship.placed for ship in self.ships)
    
    def attack(self, row: int, col: int) -> Tuple[str, Optional[Ship]]:
        """Attack a position. Returns (result, ship_if_sunk)."""
        if row < 0 or row >= BOARD_SIZE or col < 0 or col >= BOARD_SIZE:
            return "invalid", None
        
        if self.grid[row][col] in [CellState.HIT, CellState.MISS, CellState.SUNK]:
            return "already_attacked", None
        
        if (row, col) in self.ship_positions:
            # Hit!
            ship = self.ship_positions[(row, col)]
            ship.hit(row, col)
            
            if ship.is_sunk():
                # Mark all ship positions as sunk
                for ship_row, ship_col in ship.positions:
                    self.grid[ship_row][ship_col] = CellState.SUNK
                return "sunk", ship
            else:
                self.grid[row][col] = CellState.HIT
                return "hit", None
        else:
            # Miss
            self.grid[row][col] = CellState.MISS
            return "miss", None
    
    def all_ships_sunk(self) -> bool:
        """Check if all ships have been sunk."""
        return all(ship.is_sunk() for ship in self.ships)
    
    def get_ships_remaining(self) -> int:
        """Get number of ships still afloat."""
        return sum(1 for ship in self.ships if not ship.is_sunk())

class BattleshipGame:
    """Main battleship game state manager."""
    
    def __init__(self, channel_id: str, guild_id: str, host: discord.User):
        self.channel_id = channel_id
        self.guild_id = guild_id
        self.host = host
        self.players: Dict[int, discord.User] = {host.id: host}
        self.boards: Dict[int, BattleshipBoard] = {host.id: BattleshipBoard(host.id)}
        self.state = "waiting"  # waiting, placing, playing, finished
        self.current_turn = None  # player_id whose turn it is
        self.pot_amount = 0.0
        self.pot_enabled = False
        self.game_message = None
        self.placement_messages: Dict[int, discord.Message] = {}
        
    def add_player(self, user: discord.User) -> bool:
        """Add a player to the game."""
        if len(self.players) >= 2 or user.id in self.players:
            return False
        
        self.players[user.id] = user
        self.boards[user.id] = BattleshipBoard(user.id)
        return True
    
    def can_start(self) -> bool:
        """Check if game can start."""
        return len(self.players) == 2 and self.state == "waiting"
    
    def start_placement(self) -> bool:
        """Start the ship placement phase."""
        if not self.can_start():
            return False
        
        self.state = "placing"
        return True
    
    def start_battle(self) -> bool:
        """Start the battle phase."""
        if self.state != "placing":
            return False
        
        # Check if all players have placed all ships
        for board in self.boards.values():
            if not board.all_ships_placed():
                return False
        
        self.state = "playing"
        # Random first player
        player_ids = list(self.players.keys())
        self.current_turn = random.choice(player_ids)
        return True
    
    def get_opponent(self, player_id: int) -> Optional[int]:
        """Get the opponent's player ID."""
        for pid in self.players.keys():
            if pid != player_id:
                return pid
        return None
    
    def switch_turn(self):
        """Switch to the other player's turn."""
        self.current_turn = self.get_opponent(self.current_turn)
    
    def check_win_condition(self) -> Optional[int]:
        """Check if someone has won. Returns winner's player_id or None."""
        for player_id, board in self.boards.items():
            if board.all_ships_sunk():
                # This player lost, so their opponent won
                return self.get_opponent(player_id)
        return None

# ========================= IMAGE GENERATION =========================

def generate_board_image(board: BattleshipBoard, show_ships: bool = True, attacking: bool = False) -> Image.Image:
    """Generate a visual representation of the battleship board."""
    
    # Create image with padding
    padding = 30
    total_size = BOARD_PIXEL_SIZE + padding * 2
    img = Image.new('RGB', (total_size, total_size), color='#2C3E50')
    draw = ImageDraw.Draw(img)
    
    # Try to load a font
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 16)
        small_font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 12)
    except:
        try:
            font = ImageFont.truetype("arial.ttf", 16)
            small_font = ImageFont.truetype("arial.ttf", 12)
        except:
            font = ImageFont.load_default()
            small_font = ImageFont.load_default()
    
    # Draw column labels (A-J)
    for i in range(BOARD_SIZE):
        x = padding + i * CELL_SIZE + CELL_SIZE // 2
        y = padding // 2
        draw.text((x - 5, y), chr(ord('A') + i), fill='white', font=font)
    
    # Draw row labels (1-10)
    for i in range(BOARD_SIZE):
        x = padding // 2
        y = padding + i * CELL_SIZE + CELL_SIZE // 2
        draw.text((x, y - 8), str(i + 1), fill='white', font=font)
    
    # Draw grid and cells
    for row in range(BOARD_SIZE):
        for col in range(BOARD_SIZE):
            x1 = padding + col * CELL_SIZE
            y1 = padding + row * CELL_SIZE
            x2 = x1 + CELL_SIZE
            y2 = y1 + CELL_SIZE
            
            cell_state = board.grid[row][col]
            
            # Determine cell color
            if attacking and cell_state == CellState.SHIP and show_ships:
                # In attacking view, don't show ships unless they're hit
                color = '#3498DB'  # Water blue
            elif cell_state == CellState.EMPTY:
                color = '#3498DB'  # Water blue
            elif cell_state == CellState.SHIP and show_ships:
                color = '#95A5A6'  # Ship gray
            elif cell_state == CellState.HIT:
                color = '#E74C3C'  # Hit red
            elif cell_state == CellState.MISS:
                color = '#F39C12'  # Miss orange
            elif cell_state == CellState.SUNK:
                color = '#8E44AD'  # Sunk purple
            else:
                color = '#3498DB'  # Default water
            
            # Draw cell
            draw.rectangle([x1, y1, x2, y2], fill=color, outline='#34495E', width=2)
            
            # Add symbols for hits/misses
            center_x = x1 + CELL_SIZE // 2
            center_y = y1 + CELL_SIZE // 2
            
            if cell_state == CellState.HIT:
                draw.text((center_x - 5, center_y - 8), "X", fill='white', font=font)
            elif cell_state == CellState.MISS:
                draw.ellipse([center_x - 5, center_y - 5, center_x + 5, center_y + 5], 
                           fill='white', outline='#2C3E50')
            elif cell_state == CellState.SUNK:
                draw.text((center_x - 5, center_y - 8), "☠", fill='white', font=small_font)
    
    # Add title
    title = "Your Board" if show_ships else "Enemy Waters"
    title_x = total_size // 2 - 40
    title_y = 5
    draw.text((title_x, title_y), title, fill='white', font=font)
    
    return img

# ========================= GAME MANAGER =========================

class BattleshipManager:
    """Manages battleship game sessions."""
    
    def __init__(self):
        self.games: Dict[str, BattleshipGame] = {}
        self.user_games: Dict[int, str] = {}  # user_id -> channel_id
    
    def get_or_create_game(self, channel_id: str, guild_id: str, host: discord.User) -> BattleshipGame:
        """Get existing game or create new one."""
        if channel_id not in self.games:
            game = BattleshipGame(channel_id, guild_id, host)
            self.games[channel_id] = game
            self.user_games[host.id] = channel_id
        return self.games[channel_id]
    
    def get_game(self, channel_id: str) -> Optional[BattleshipGame]:
        """Get game by channel ID."""
        return self.games.get(channel_id)
    
    def get_user_game(self, user_id: int) -> Optional[BattleshipGame]:
        """Get game that user is in."""
        channel_id = self.user_games.get(user_id)
        return self.games.get(channel_id) if channel_id else None
    
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
battleship_manager = BattleshipManager()

# ========================= MODALS =========================

class AttackModal(Modal):
    """Modal for entering attack coordinates."""
    
    def __init__(self, game: BattleshipGame):
        super().__init__(title="Choose Your Target")
        self.game = game
        
        self.coordinate_input = TextInput(
            label="Enter coordinates (e.g., A5, B10, J1)",
            placeholder="A5",
            min_length=2,
            max_length=3
        )
        self.add_item(self.coordinate_input)
    
    async def on_submit(self, interaction: discord.Interaction):
        coords = self.coordinate_input.value.strip().upper()
        
        # Parse coordinates
        if len(coords) < 2 or len(coords) > 3:
            await interaction.response.send_message("❌ Invalid coordinates! Use format like A5, B10", ephemeral=True)
            return
        
        try:
            col_letter = coords[0]
            row_number = int(coords[1:])
            
            if not col_letter.isalpha() or col_letter < 'A' or col_letter > 'J':
                await interaction.response.send_message("❌ Column must be A-J!", ephemeral=True)
                return
            
            if row_number < 1 or row_number > 10:
                await interaction.response.send_message("❌ Row must be 1-10!", ephemeral=True)
                return
            
            col = ord(col_letter) - ord('A')
            row = row_number - 1
            
        except (ValueError, IndexError):
            await interaction.response.send_message("❌ Invalid coordinates! Use format like A5, B10", ephemeral=True)
            return
        
        # Process attack
        opponent_id = self.game.get_opponent(interaction.user.id)
        if not opponent_id:
            await interaction.response.send_message("❌ No opponent found!", ephemeral=True)
            return
        
        opponent_board = self.game.boards[opponent_id]
        result, sunk_ship = opponent_board.attack(row, col)
        
        if result == "already_attacked":
            await interaction.response.send_message(f"❌ You already attacked {coords}!", ephemeral=True)
            return
        elif result == "invalid":
            await interaction.response.send_message("❌ Invalid coordinates!", ephemeral=True)
            return
        
        # Process result
        if result == "hit":
            message = f"🎯 **HIT!** You hit something at {coords}!"
            color = discord.Color.red()
        elif result == "sunk":
            message = f"💥 **SUNK!** You sank the enemy {sunk_ship.name} at {coords}!"
            color = discord.Color.purple()
        else:  # miss
            message = f"💧 **MISS!** Nothing at {coords}."
            color = discord.Color.blue()
        
        # Check win condition
        winner = self.game.check_win_condition()
        if winner:
            self.game.state = "finished"
            if winner == interaction.user.id:
                message += f"\n\n🏆 **VICTORY!** You sank all enemy ships!"
            
            # Handle pot payout
            if self.game.pot_enabled and self.game.pot_amount > 0:
                try:
                    user_id = str(winner)
                    total_pot = self.game.pot_amount * 2  # Both players paid
                    success, _ = await db_manager.adjust_wallet(user_id, self.game.guild_id, total_pot)
                    if success:
                        message += f"\n💰 **Won {fmt(total_pot)}!**"
                        
                        # Record game result
                        await db_manager.record_game_result(
                            user_id, self.game.guild_id, "battleship", True, 
                            self.game.pot_amount, total_pot
                        )
                    
                    # Record loss for loser
                    loser_id = str(self.game.get_opponent(winner))
                    await db_manager.record_game_result(
                        loser_id, self.game.guild_id, "battleship", False,
                        self.game.pot_amount, 0
                    )
                        
                except Exception as e:
                    LOG.error(f"Failed to handle pot payout: {e}")
        else:
            # Switch turns only if game continues
            if result == "miss":
                self.game.switch_turn()
                opponent = self.game.players[opponent_id]
                message += f"\n\n🔄 **{opponent.display_name}'s turn!**"
        
        await interaction.response.send_message(message, ephemeral=True)
        
        # Update game view
        if hasattr(self.game, 'view'):
            await self.game.view.update_display()

class PotSettingsModal(Modal):
    """Modal for setting pot amount."""
    
    def __init__(self, view):
        super().__init__(title="Pot Settings")
        self.view = view
        
        self.pot_input = TextInput(
            label="Pot Amount (0 to disable)",
            placeholder="e.g., 100, 500, 1000",
            default=str(int(view.game.pot_amount)),
            min_length=1,
            max_length=10
        )
        self.add_item(self.pot_input)
    
    async def on_submit(self, interaction: discord.Interaction):
        try:
            pot_amount = float(self.pot_input.value.strip())
            
            if pot_amount < 0:
                await interaction.response.send_message("❌ Pot amount cannot be negative!", ephemeral=True)
                return
            
            self.view.game.pot_amount = pot_amount
            self.view.game.pot_enabled = pot_amount > 0
            
            await interaction.response.send_message(
                f"✅ Pot set to {fmt(pot_amount)}!" if pot_amount > 0 else "✅ Pot disabled!",
                ephemeral=True
            )
            
            await self.view.update_display()
            
        except ValueError:
            await interaction.response.send_message("❌ Invalid amount! Please enter a valid number.", ephemeral=True)

# ========================= VIEWS =========================

class ShipPlacementView(View):
    """View for placing ships on the board using modal input."""
    
    def __init__(self, game: BattleshipGame, player_id: int):
        super().__init__(timeout=300)  # 5 minute timeout
        self.game = game
        self.player_id = player_id
        self.direction = Direction.HORIZONTAL
        self._setup_buttons()
    
    def _setup_buttons(self):
        """Setup placement buttons."""
        self.clear_items()
        
        board = self.game.boards[self.player_id]
        current_ship = board.get_current_ship()
        
        if current_ship:
            # Direction toggle
            direction_button = Button(
                label=f"Direction: {self.direction.value.title()}",
                style=discord.ButtonStyle.secondary,
                emoji="🔄"
            )
            direction_button.callback = self.toggle_direction
            self.add_item(direction_button)
            
            # Place ship button (opens modal)
            place_button = Button(
                label=f"📍 Place {current_ship.name}",
                style=discord.ButtonStyle.primary,
                emoji="⚓"
            )
            place_button.callback = self.place_ship_modal
            self.add_item(place_button)
            
            # Auto place button for convenience
            auto_button = Button(
                label="🎲 Auto Place",
                style=discord.ButtonStyle.secondary
            )
            auto_button.callback = self.auto_place_ship
            self.add_item(auto_button)
        else:
            # All ships placed
            ready_button = Button(
                label="✅ Ready for Battle!",
                style=discord.ButtonStyle.success
            )
            ready_button.callback = self.ready_for_battle
            self.add_item(ready_button)
    
    def _create_placement_callback(self, row: int, col: int):
        """Create a callback for ship placement."""
        async def placement_callback(interaction: discord.Interaction):
            if interaction.user.id != self.player_id:
                await interaction.response.send_message("❌ This is not your placement board!", ephemeral=True)
                return
            
            board = self.game.boards[self.player_id]
            current_ship = board.get_current_ship()
            
            if not current_ship:
                await interaction.response.send_message("❌ No ship to place!", ephemeral=True)
                return
            
            if board.place_ship(current_ship, row, col, self.direction):
                coord = f"{chr(ord('A') + col)}{row + 1}"
                ship_placed = f"✅ Placed {current_ship.name} at {coord} ({self.direction.value})"
                
                has_more_ships = board.advance_ship()
                
                if has_more_ships:
                    next_ship = board.get_current_ship()
                    ship_placed += f"\n\n📍 **Next:** Place your {next_ship.name} ({next_ship.length} cells)"
                else:
                    ship_placed += "\n\n🎉 **All ships placed!** Click 'Ready for Battle' when you're done."
                
                await interaction.response.send_message(ship_placed, ephemeral=True)
                await self.update_placement_view(interaction)
            else:
                await interaction.response.send_message("❌ Cannot place ship there!", ephemeral=True)
        
        return placement_callback
    
    async def toggle_direction(self, interaction: discord.Interaction):
        """Toggle ship placement direction."""
        if interaction.user.id != self.player_id:
            await interaction.response.send_message("❌ This is not your placement board!", ephemeral=True)
            return
        
        self.direction = Direction.VERTICAL if self.direction == Direction.HORIZONTAL else Direction.HORIZONTAL
        await interaction.response.send_message(f"🔄 Direction: {self.direction.value.title()}", ephemeral=True)
        await self.update_placement_view(interaction)
    
    async def place_ship_modal(self, interaction: discord.Interaction):
        """Open modal to place ship."""
        if interaction.user.id != self.player_id:
            await interaction.response.send_message("❌ This is not your placement board!", ephemeral=True)
            return
        
        board = self.game.boards[self.player_id]
        current_ship = board.get_current_ship()
        if not current_ship:
            await interaction.response.send_message("❌ No ship to place!", ephemeral=True)
            return
        
        modal = ShipPlacementModal(self, current_ship)
        await interaction.response.send_modal(modal)
    
    async def auto_place_ship(self, interaction: discord.Interaction):
        """Automatically place the current ship."""
        if interaction.user.id != self.player_id:
            await interaction.response.send_message("❌ This is not your placement board!", ephemeral=True)
            return
        
        board = self.game.boards[self.player_id]
        current_ship = board.get_current_ship()
        if not current_ship:
            await interaction.response.send_message("❌ No ship to place!", ephemeral=True)
            return
        
        # Try to find a valid placement
        import random
        attempts = 0
        while attempts < 100:
            row = random.randint(0, BOARD_SIZE - 1)
            col = random.randint(0, BOARD_SIZE - 1)
            direction = random.choice([Direction.HORIZONTAL, Direction.VERTICAL])
            
            if board.can_place_ship(current_ship, row, col, direction):
                if board.place_ship(current_ship, row, col, direction):
                    coord = f"{chr(ord('A') + col)}{row + 1}"
                    await interaction.response.send_message(
                        f"🎲 Auto-placed {current_ship.name} at {coord} ({direction.value})",
                        ephemeral=True
                    )
                    
                    has_more_ships = board.advance_ship()
                    if not has_more_ships:
                        await interaction.followup.send("🎉 All ships placed! Ready for battle?", ephemeral=True)
                    
                    await self.update_placement_view(interaction)
                    return
            
            attempts += 1
        
        await interaction.response.send_message("❌ Couldn't find a valid placement. Try manually!", ephemeral=True)
    
    async def ready_for_battle(self, interaction: discord.Interaction):
        """Player is ready for battle."""
        if interaction.user.id != self.player_id:
            await interaction.response.send_message("❌ This is not your placement board!", ephemeral=True)
            return
        
        await interaction.response.send_message("⚓ **Ready for battle!** Waiting for opponent...", ephemeral=True)
        
        # Check if both players are ready
        all_ready = all(board.all_ships_placed() for board in self.game.boards.values())
        
        if all_ready:
            self.game.start_battle()
            # Ping both players that battle is starting
            player_pings = " ".join([f"<@{pid}>" for pid in self.game.players.keys()])
            
            if self.game.game_message:
                await self.game.game_message.channel.send(
                    f"⚔️ **Battleship Battle Started!** {player_pings}\nMay the best admiral win!"
                )
            
            # Update main game view
            if hasattr(self.game, 'view'):
                await self.game.view.update_display()
    
    async def update_placement_view(self, interaction: discord.Interaction):
        """Update the placement view."""
        board = self.game.boards[self.player_id]
        current_ship = board.get_current_ship()
        
        # Generate board image
        board_image = generate_board_image(board, show_ships=True)
        
        # Create embed
        embed = discord.Embed(
            title="🚢 Ship Placement",
            color=discord.Color.blue()
        )
        
        if current_ship:
            embed.description = f"**Place your {current_ship.name}** ({current_ship.length} cells)\nDirection: {self.direction.value.title()}"
        else:
            embed.description = "✅ **All ships placed!** Ready for battle?"
        
        # Show ship placement progress
        placed_ships = [ship.name for ship in board.ships if ship.placed]
        remaining_ships = [ship.name for ship in board.ships if not ship.placed]
        
        if placed_ships:
            embed.add_field(
                name="✅ Ships Placed",
                value="\n".join(placed_ships),
                inline=True
            )
        
        if remaining_ships:
            embed.add_field(
                name="📍 Ships to Place",
                value="\n".join(remaining_ships),
                inline=True
            )
        
        self._setup_buttons()
        
        # Upload image
        try:
            file_obj, url = await upload_frame_and_get_url(interaction.client, board_image, f"placement_{self.player_id}.png")
            if url and url != "None":
                embed.set_image(url=url)
            else:
                # Fallback: attach file
                buf = io.BytesIO()
                board_image.save(buf, format="PNG")
                buf.seek(0)
                file_obj = discord.File(buf, filename="placement.png")
                embed.set_image(url="attachment://placement.png")
                
                message = self.game.placement_messages.get(self.player_id)
                if message:
                    await message.edit(embed=embed, view=self, attachments=[file_obj])
                return
        except Exception as e:
            LOG.error(f"Failed to upload placement image: {e}")
        
        # Edit stored placement message if any, else send/update ephemerally
        message = self.game.placement_messages.get(self.player_id)
        if message:
            try:
                await message.edit(embed=embed, view=self)
            except Exception as e:
                LOG.error(f"Failed to update placement message: {e}")
        else:
            # Fall back to ephemeral send so each user sees their latest panel
            try:
                if interaction.response.is_done():
                    await interaction.followup.send(embed=embed, view=self, ephemeral=True)
                else:
                    await interaction.response.send_message(embed=embed, view=self, ephemeral=True)
            except Exception as e:
                LOG.error(f"Failed to send ephemeral placement update: {e}")

class BattleshipGameView(View):
    """Main view for battleship game."""
    
    def __init__(self, game: BattleshipGame):
        super().__init__(timeout=1800)  # 30 minute timeout
        self.game = game
        self.game.view = self  # Store reference for updates
        self._setup_buttons()
    
    def _setup_buttons(self):
        """Setup buttons based on game state."""
        self.clear_items()
        
        if self.game.state == "waiting":
            # Waiting for players
            join_button = Button(label="⚓ Join Battle", style=discord.ButtonStyle.success)
            join_button.callback = self.join_game
            self.add_item(join_button)
            
            if len(self.game.players) == 2:
                start_button = Button(label="🚢 Start Placement", style=discord.ButtonStyle.primary)
                start_button.callback = self.start_placement
                self.add_item(start_button)
            
            if self.game.pot_enabled:
                pay_pot_button = Button(label="💰 Pay Pot", style=discord.ButtonStyle.secondary)
                pay_pot_button.callback = self.pay_pot
                self.add_item(pay_pot_button)
            
            settings_button = Button(label="⚙️ Pot Settings", style=discord.ButtonStyle.secondary)
            settings_button.callback = self.pot_settings
            self.add_item(settings_button)
            
        elif self.game.state == "placing":
            # Ship placement phase: let each player open their private placement panel
            open_button = Button(
                label="🚢 Open Placement Panel",
                style=discord.ButtonStyle.primary
            )
            async def open_placement(interaction: discord.Interaction):
                # Only participants can open their panel
                if interaction.user.id not in self.game.players:
                    await interaction.response.send_message("❌ You're not in this game!", ephemeral=True)
                    return
                player_id = interaction.user.id
                board = self.game.boards[player_id]
                current_ship = board.get_current_ship()
                embed = discord.Embed(
                    title="🚢 Ship Placement",
                    color=discord.Color.blue()
                )
                if current_ship:
                    embed.description = f"**Place your {current_ship.name}** ({current_ship.length} cells)\nDirection: Horizontal by default (toggle in panel)"
                else:
                    embed.description = "✅ **All ships placed!** Ready for battle?"
                # Initial board image
                try:
                    board_image = generate_board_image(board, show_ships=True)
                    file_obj, url = await upload_frame_and_get_url(interaction.client, board_image, f"placement_{player_id}.png")
                    if url and url != "None":
                        embed.set_image(url=url)
                except Exception as e:
                    LOG.error(f"Failed to upload initial placement image: {e}")
                # Send ephemeral placement view
                placement_view = ShipPlacementView(self.game, player_id)
                await interaction.response.send_message(embed=embed, view=placement_view, ephemeral=True)
            open_button.callback = open_placement
            self.add_item(open_button)
            
        elif self.game.state == "playing":
            # Battle phase
            attack_button = Button(label="🎯 Attack!", style=discord.ButtonStyle.danger)
            attack_button.callback = self.attack
            self.add_item(attack_button)
            
            view_board_button = Button(label="👁️ View My Board", style=discord.ButtonStyle.secondary)
            view_board_button.callback = self.view_board
            self.add_item(view_board_button)
            
        elif self.game.state == "finished":
            # Game finished
            winner = self.game.check_win_condition()
            if winner:
                winner_user = self.game.players[winner]
                finished_button = Button(
                    label=f"🏆 {winner_user.display_name} Wins!",
                    style=discord.ButtonStyle.success,
                    disabled=True
                )
                self.add_item(finished_button)
    
    def _create_lobby_embed(self) -> discord.Embed:
        """Create embed for lobby state."""
        embed = discord.Embed(
            title="⚓ Battleship Game",
            color=discord.Color.blue()
        )
        
        # Player list
        player_list = []
        for i, (player_id, user) in enumerate(self.game.players.items()):
            status = ""
            if self.game.pot_enabled:
                # Check if they paid pot (you'd need to track this)
                status = " ⏳"  # For now, assume pending
            player_list.append(f"{i+1}. {user.mention}{status}")
        
        embed.add_field(
            name=f"👥 Players ({len(self.game.players)}/2)",
            value="\n".join(player_list) if player_list else "No players yet",
            inline=False
        )
        
        if self.game.pot_enabled:
            total_pot = self.game.pot_amount * 2  # Both players pay
            embed.add_field(
                name="💰 Prize Pool",
                value=f"{fmt(total_pot)} ({fmt(self.game.pot_amount)} per player)",
                inline=True
            )
        
        # Game rules
        embed.add_field(
            name="📋 How to Play",
            value=(
                "• Place your ships on a 10x10 grid\n"
                "• Take turns attacking enemy coordinates\n"
                "• First to sink all enemy ships wins!\n"
                "• Ships: Carrier(5), Battleship(4), Cruiser(3), Submarine(3), Destroyer(2)"
            ),
            inline=False
        )
        
        embed.set_footer(text=f"Host: {self.game.host.display_name}")
        return embed
    
    def _create_battle_embed(self) -> discord.Embed:
        """Create embed for battle state."""
        current_player = self.game.players[self.game.current_turn]
        
        embed = discord.Embed(
            title="⚔️ Battleship Battle",
            description=f"**{current_player.mention}'s turn to attack!**",
            color=discord.Color.red()
        )
        
        # Battle status
        for player_id, user in self.game.players.items():
            board = self.game.boards[player_id]
            ships_remaining = board.get_ships_remaining()
            
            embed.add_field(
                name=f"🚢 {user.display_name}",
                value=f"{ships_remaining} ships remaining",
                inline=True
            )
        
        if self.game.pot_enabled:
            embed.add_field(
                name="💰 Prize Pool",
                value=fmt(self.game.pot_amount * 2),
                inline=True
            )
        
        embed.add_field(
            name="🎯 Instructions",
            value="• Click 'Attack!' to target enemy coordinates\n• Use 'View My Board' to see your ships",
            inline=False
        )
        
        return embed
    
    def _create_finished_embed(self) -> discord.Embed:
        """Create embed for finished game."""
        embed = discord.Embed(
            title="🏁 Battleship - Finished",
            color=discord.Color.gold()
        )
        winner_id = self.game.check_win_condition()
        if winner_id:
            winner_user = self.game.players[winner_id]
            embed.description = f"🏆 **{winner_user.mention} wins!**"
        else:
            embed.description = "🤝 **Draw**"
        # Summary
        for player_id, user in self.game.players.items():
            board = self.game.boards[player_id]
            sunk = sum(1 for s in board.ships if s.is_sunk())
            embed.add_field(
                name=f"🚢 {user.display_name}",
                value=f"{sunk}/{len(board.ships)} ships sunk",
                inline=True
            )
        if self.game.pot_enabled:
            embed.add_field(
                name="💰 Prize Pool",
                value=fmt(self.game.pot_amount * 2),
                inline=True
            )
        return embed

    async def update_display(self):
        """Update the game display."""
        self._setup_buttons()
        
        if self.game.state == "waiting":
            embed = self._create_lobby_embed()
        elif self.game.state == "placing":
            embed = discord.Embed(
                title="🚢 Ship Placement Phase",
                description="Players are placing their ships...\nClick 'Open Placement Panel' to place privately.",
                color=discord.Color.blue()
            )
        elif self.game.state == "playing":
            embed = self._create_battle_embed()
        elif self.game.state == "finished":
            embed = self._create_finished_embed()
        
        if self.game.game_message:
            try:
                await self.game.game_message.edit(embed=embed, view=self)
            except Exception as e:
                LOG.error(f"Failed to update game display: {e}")
    
    # Button callbacks
    
    async def join_game(self, interaction: discord.Interaction):
        """Join the battleship game."""
        if interaction.user.id in self.game.players:
            await interaction.response.send_message("❌ You're already in this game!", ephemeral=True)
            return
        
        if self.game.add_player(interaction.user):
            battleship_manager.user_games[interaction.user.id] = self.game.channel_id
            await interaction.response.send_message(f"⚓ {interaction.user.mention} joined the battle!", ephemeral=True)
            await self.update_display()
        else:
            await interaction.response.send_message("❌ Game is full or already started!", ephemeral=True)
    
    async def start_placement(self, interaction: discord.Interaction):
        """Start ship placement phase."""
        if interaction.user.id != self.game.host.id:
            await interaction.response.send_message("❌ Only the host can start placement!", ephemeral=True)
            return
        
        if not self.game.start_placement():
            await interaction.response.send_message("❌ Cannot start placement yet!", ephemeral=True)
            return
        
        await interaction.response.send_message(
            "🚢 **Ship placement started!** Use 'Open Placement Panel' on this message to place your ships privately.",
            ephemeral=True
        )
        
        await self.update_display()
    
    async def pay_pot(self, interaction: discord.Interaction):
        """Pay into the pot."""
        if interaction.user.id not in self.game.players:
            await interaction.response.send_message("❌ You must be in the game to pay pot!", ephemeral=True)
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
        
        await interaction.response.send_message(
            f"✅ Paid {fmt(self.game.pot_amount)} into the pot!",
            ephemeral=True
        )
        await self.update_display()
    
    async def pot_settings(self, interaction: discord.Interaction):
        """Open pot settings modal."""
        if interaction.user.id != self.game.host.id:
            await interaction.response.send_message("❌ Only the host can change pot settings!", ephemeral=True)
            return
        
        modal = PotSettingsModal(self)
        await interaction.response.send_modal(modal)
    
    async def attack(self, interaction: discord.Interaction):
        """Launch an attack."""
        if self.game.state != "playing":
            await interaction.response.send_message("❌ Game is not in battle phase!", ephemeral=True)
            return
        
        if interaction.user.id != self.game.current_turn:
            current_player = self.game.players[self.game.current_turn]
            await interaction.response.send_message(f"❌ It's {current_player.mention}'s turn!", ephemeral=True)
            return
        
        modal = AttackModal(self.game)
        await interaction.response.send_modal(modal)
    
    async def view_board(self, interaction: discord.Interaction):
        """View player's own board."""
        if interaction.user.id not in self.game.players:
            await interaction.response.send_message("❌ You're not in this game!", ephemeral=True)
            return
        
        board = self.game.boards[interaction.user.id]
        board_image = generate_board_image(board, show_ships=True)
        
        embed = discord.Embed(
            title="🚢 Your Fleet",
            description="Here's your current board status:",
            color=discord.Color.blue()
        )
        
        # Ship status
        ships_status = []
        for ship in board.ships:
            if ship.is_sunk():
                status = "💀 Sunk"
            elif len(ship.hits) > 0:
                status = f"🔥 Hit ({len(ship.hits)}/{ship.length})"
            else:
                status = "⚓ Intact"
            ships_status.append(f"**{ship.name}**: {status}")
        
        embed.add_field(
            name="🚢 Fleet Status",
            value="\n".join(ships_status),
            inline=False
        )
        
        # Upload image
        try:
            file_obj, url = await upload_frame_and_get_url(interaction.client, board_image, f"board_{interaction.user.id}.png")
            if url and url != "None":
                embed.set_image(url=url)
                await interaction.response.send_message(embed=embed, ephemeral=True)
            else:
                # Fallback: attach file
                buf = io.BytesIO()
                board_image.save(buf, format="PNG")
                buf.seek(0)
                file_obj = discord.File(buf, filename="my_board.png")
                embed.set_image(url="attachment://my_board.png")
                await interaction.response.send_message(embed=embed, file=file_obj, ephemeral=True)
        except Exception as e:
            LOG.error(f"Failed to send board view: {e}")
            await interaction.response.send_message("❌ Failed to generate board view!", ephemeral=True)

# ========================= COG =========================

class BattleshipCommands(Cog):
    """Battleship game commands."""
    
    def __init__(self, bot):
        self.bot = bot
        # Register this game with the registry
        game_registry.register_game("Battleship", self.__class__, "Classic naval strategy - sink all enemy ships!")
    
    @app_commands.command(name="battleship", description="⚓ Start a Battleship game!")
    @app_commands.describe(pot="Optional pot amount per player")
    async def battleship_command(self, interaction: discord.Interaction, pot: float = 0.0):
        """Start a new Battleship game."""
        # Check maintenance mode
        if await check_maintenance_mode(interaction):
            return
        
        await interaction.response.defer()
        
        # Validate parameters
        if pot < 0:
            await interaction.followup.send("❌ Pot amount cannot be negative!", ephemeral=True)
            return
        
        # Check if user is already in a game
        existing_game = battleship_manager.get_user_game(interaction.user.id)
        if existing_game:
            await interaction.followup.send("❌ You're already in a Battleship game!", ephemeral=True)
            return
        
        # Create game
        guild_id = await get_guild_id(interaction)
        game = battleship_manager.get_or_create_game(str(interaction.channel.id), guild_id, interaction.user)
        
        # Configure pot
        game.pot_amount = pot
        game.pot_enabled = pot > 0
        
        # Create view and send message
        view = BattleshipGameView(game)
        embed = view._create_lobby_embed()
        embed.description = f"⚓ **{interaction.user.mention}** started a Battleship game!"
        
        message = await interaction.followup.send(embed=embed, view=view)
        game.game_message = message

async def setup(bot):
    """Set up the Battleship cog."""
    await bot.add_cog(BattleshipCommands(bot))
