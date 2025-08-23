/**
 * Battleship Game - Classic two-player naval strategy game
 * Features 10x10 grid, 5 ships per player, turn-based combat
 * Converted from Python with improvements and modern UI
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { secureRandomInt } = require('../UTILS/rng');
const { fmt } = require('../UTILS/common');
const logger = require('../UTILS/logger');

// Game constants
const BOARD_SIZE = 10;
const SHIPS = [
    { name: 'Carrier', length: 5, emoji: '🚢' },
    { name: 'Battleship', length: 4, emoji: '⚓' },
    { name: 'Cruiser', length: 3, emoji: '🚤' },
    { name: 'Submarine', length: 3, emoji: '🔱' },
    { name: 'Destroyer', length: 2, emoji: '🛟' }
];

// Ship direction constants
const HORIZONTAL = 'horizontal';
const VERTICAL = 'vertical';

// Cell states
const CELL_EMPTY = 0;
const CELL_SHIP = 1;
const CELL_HIT = 2;
const CELL_MISS = 3;
const CELL_SUNK = 4;

class BattleshipShip {
    constructor(name, length, emoji) {
        this.name = name;
        this.length = length;
        this.emoji = emoji;
        this.positions = [];
        this.hits = new Set();
        this.placed = false;
    }

    place(startRow, startCol, direction) {
        this.positions = [];
        
        if (direction === HORIZONTAL) {
            for (let i = 0; i < this.length; i++) {
                this.positions.push([startRow, startCol + i]);
            }
        } else {
            for (let i = 0; i < this.length; i++) {
                this.positions.push([startRow + i, startCol]);
            }
        }
        
        this.placed = true;
    }

    hit(row, col) {
        const posKey = `${row},${col}`;
        if (this.positions.some(pos => `${pos[0]},${pos[1]}` === posKey)) {
            this.hits.add(posKey);
            return true;
        }
        return false;
    }

    isSunk() {
        return this.hits.size === this.length;
    }

    getHitCount() {
        return this.hits.size;
    }
}

class BattleshipBoard {
    constructor(playerId) {
        this.playerId = playerId;
        this.grid = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(CELL_EMPTY));
        this.ships = SHIPS.map(ship => new BattleshipShip(ship.name, ship.length, ship.emoji));
        this.shipPositions = new Map(); // position -> ship mapping
        this.currentShipIndex = 0;
    }

    canPlaceShip(ship, startRow, startCol, direction) {
        const positions = [];
        
        if (direction === HORIZONTAL) {
            if (startCol + ship.length > BOARD_SIZE) return false;
            for (let i = 0; i < ship.length; i++) {
                positions.push([startRow, startCol + i]);
            }
        } else {
            if (startRow + ship.length > BOARD_SIZE) return false;
            for (let i = 0; i < ship.length; i++) {
                positions.push([startRow + i, startCol]);
            }
        }

        // Check for collisions and adjacent ships
        for (const [row, col] of positions) {
            if (this.shipPositions.has(`${row},${col}`)) {
                return false;
            }
            
            // Check adjacent cells (ships can't touch)
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const adjRow = row + dr;
                    const adjCol = col + dc;
                    if (adjRow >= 0 && adjRow < BOARD_SIZE && 
                        adjCol >= 0 && adjCol < BOARD_SIZE &&
                        (dr !== 0 || dc !== 0) &&
                        this.shipPositions.has(`${adjRow},${adjCol}`)) {
                        return false;
                    }
                }
            }
        }
        
        return true;
    }

    placeShip(ship, startRow, startCol, direction) {
        if (!this.canPlaceShip(ship, startRow, startCol, direction)) {
            return false;
        }

        ship.place(startRow, startCol, direction);
        
        for (const [row, col] of ship.positions) {
            this.grid[row][col] = CELL_SHIP;
            this.shipPositions.set(`${row},${col}`, ship);
        }
        
        return true;
    }

    getCurrentShip() {
        return this.currentShipIndex < this.ships.length ? this.ships[this.currentShipIndex] : null;
    }

    advanceShip() {
        this.currentShipIndex++;
        return this.currentShipIndex < this.ships.length;
    }

    allShipsPlaced() {
        return this.ships.every(ship => ship.placed);
    }

    attack(row, col) {
        if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
            return { result: 'invalid', ship: null };
        }

        if (this.grid[row][col] === CELL_HIT || this.grid[row][col] === CELL_MISS || 
            this.grid[row][col] === CELL_SUNK) {
            return { result: 'already_attacked', ship: null };
        }

        const posKey = `${row},${col}`;
        if (this.shipPositions.has(posKey)) {
            const ship = this.shipPositions.get(posKey);
            ship.hit(row, col);
            
            if (ship.isSunk()) {
                // Mark all ship positions as sunk
                for (const [shipRow, shipCol] of ship.positions) {
                    this.grid[shipRow][shipCol] = CELL_SUNK;
                }
                return { result: 'sunk', ship };
            } else {
                this.grid[row][col] = CELL_HIT;
                return { result: 'hit', ship };
            }
        } else {
            this.grid[row][col] = CELL_MISS;
            return { result: 'miss', ship: null };
        }
    }

    allShipsSunk() {
        return this.ships.every(ship => ship.isSunk());
    }

    getShipsRemaining() {
        return this.ships.filter(ship => !ship.isSunk()).length;
    }

    generateBoardDisplay(hideShips = false, title = "Board") {
        let display = `**${title}**\n`;
        display += '```\n   A B C D E F G H I J\n';
        
        for (let row = 0; row < BOARD_SIZE; row++) {
            display += `${String(row + 1).padStart(2)} `;
            
            for (let col = 0; col < BOARD_SIZE; col++) {
                const cell = this.grid[row][col];
                let symbol;
                
                if (hideShips && cell === CELL_SHIP) {
                    symbol = '~'; // Hide ships from opponent
                } else {
                    switch (cell) {
                        case CELL_EMPTY: symbol = '~'; break;
                        case CELL_SHIP: symbol = '■'; break;
                        case CELL_HIT: symbol = 'X'; break;
                        case CELL_MISS: symbol = 'O'; break;
                        case CELL_SUNK: symbol = '☠'; break;
                        default: symbol = '~';
                    }
                }
                
                display += symbol + ' ';
            }
            
            display += '\n';
        }
        
        display += '```';
        return display;
    }
}

class BattleshipGameSession {
    constructor(channelId, hostUser, betAmount = 0) {
        this.channelId = channelId;
        this.hostUser = hostUser;
        this.betAmount = betAmount;
        this.players = new Map([[hostUser.id, hostUser]]);
        this.boards = new Map([[hostUser.id, new BattleshipBoard(hostUser.id)]]);
        this.state = 'lobby'; // lobby, placing, playing, finished
        this.currentTurn = null;
        this.winner = null;
        this.message = null;
        this.createdAt = Date.now();
        
        logger.info(`Battleship game created in channel ${channelId} by ${hostUser.username}`);
    }

    addPlayer(user) {
        if (this.players.size >= 2 || this.players.has(user.id) || this.state !== 'lobby') {
            return false;
        }

        this.players.set(user.id, user);
        this.boards.set(user.id, new BattleshipBoard(user.id));
        
        logger.info(`Player ${user.username} joined battleship game in channel ${this.channelId}`);
        return true;
    }

    canStart() {
        return this.players.size === 2 && this.state === 'lobby';
    }

    startPlacement() {
        if (!this.canStart()) return false;
        
        this.state = 'placing';
        logger.info(`Battleship placement phase started in channel ${this.channelId}`);
        return true;
    }

    startBattle() {
        if (this.state !== 'placing') return false;
        
        // Check if all players have placed all ships
        for (const board of this.boards.values()) {
            if (!board.allShipsPlaced()) {
                return false;
            }
        }

        this.state = 'playing';
        
        // Random first player
        const playerIds = Array.from(this.players.keys());
        this.currentTurn = playerIds[secureRandomInt(0, playerIds.length)];
        
        logger.info(`Battleship battle started in channel ${this.channelId}, first turn: ${this.currentTurn}`);
        return true;
    }

    getOpponent(playerId) {
        for (const pid of this.players.keys()) {
            if (pid !== playerId) {
                return pid;
            }
        }
        return null;
    }

    switchTurn() {
        this.currentTurn = this.getOpponent(this.currentTurn);
    }

    checkWinCondition() {
        for (const [playerId, board] of this.boards.entries()) {
            if (board.allShipsSunk()) {
                this.winner = this.getOpponent(playerId);
                this.state = 'finished';
                logger.info(`Battleship game finished in channel ${this.channelId}, winner: ${this.winner}`);
                return this.winner;
            }
        }
        return null;
    }

    createLobbyEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('⚓ Battleship Naval Battle')
            .setColor(0x1E88E5)
            .setTimestamp();

        // Player list
        const playerList = Array.from(this.players.values())
            .map((user, index) => `${index + 1}. ${user.displayName}`)
            .join('\n');
        
        embed.addFields(
            { 
                name: `👥 Players (${this.players.size}/2)`, 
                value: playerList || 'No players yet', 
                inline: true 
            },
            {
                name: '🎯 How to Play',
                value: '• Place 5 ships on your 10x10 grid\n• Take turns attacking coordinates\n• First to sink all enemy ships wins!',
                inline: true
            }
        );

        if (this.betAmount > 0) {
            embed.addFields({
                name: '💰 Stakes',
                value: `${fmt(this.betAmount)} per player\nWinner takes all: ${fmt(this.betAmount * 2)}`,
                inline: true
            });
        }

        // Ship details
        const shipList = SHIPS.map(ship => `${ship.emoji} **${ship.name}** (${ship.length} spaces)`).join('\n');
        embed.addFields({
            name: '🚢 Fleet Composition',
            value: shipList,
            inline: false
        });

        embed.setFooter({ text: `Game ID: ${this.channelId.slice(-6)} | Host: ${this.hostUser.displayName}` });

        return embed;
    }

    createPlacementEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('🚢 Ship Placement Phase')
            .setDescription('**Place your fleet strategically!**\n\nUse the buttons below to place ships on your private board.')
            .setColor(0x43A047)
            .setTimestamp();

        // Show placement progress
        const progress = Array.from(this.players.values()).map(user => {
            const board = this.boards.get(user.id);
            const placedCount = board.ships.filter(ship => ship.placed).length;
            const status = board.allShipsPlaced() ? '✅ Ready!' : `${placedCount}/5 ships placed`;
            return `${user.displayName}: ${status}`;
        }).join('\n');

        embed.addFields({
            name: '📊 Placement Progress',
            value: progress,
            inline: false
        });

        embed.setFooter({ text: 'Click "Open Placement Panel" to place your ships privately' });

        return embed;
    }

    createBattleEmbed() {
        const currentPlayer = this.players.get(this.currentTurn);
        
        const embed = new EmbedBuilder()
            .setTitle('⚔️ Battle in Progress')
            .setDescription(`🎯 **${currentPlayer.displayName}'s turn to attack!**`)
            .setColor(0xE53935)
            .setTimestamp();

        // Battle status
        const statusLines = Array.from(this.players.entries()).map(([playerId, user]) => {
            const board = this.boards.get(playerId);
            const shipsLeft = board.getShipsRemaining();
            const shipsTotal = board.ships.length;
            return `${user.displayName}: ${shipsLeft}/${shipsTotal} ships remaining`;
        });

        embed.addFields({
            name: '🚢 Fleet Status',
            value: statusLines.join('\n'),
            inline: false
        });

        if (this.betAmount > 0) {
            embed.addFields({
                name: '💰 Prize Pool',
                value: fmt(this.betAmount * 2),
                inline: true
            });
        }

        embed.setFooter({ text: 'Use buttons below to attack or view your board' });

        return embed;
    }

    createFinishedEmbed() {
        const winner = this.players.get(this.winner);
        
        const embed = new EmbedBuilder()
            .setTitle('🏆 Battle Concluded')
            .setDescription(`**${winner.displayName} emerges victorious!**`)
            .setColor(0xFFD700)
            .setTimestamp();

        // Final status
        const finalStatus = Array.from(this.players.entries()).map(([playerId, user]) => {
            const board = this.boards.get(playerId);
            const shipsLeft = board.getShipsRemaining();
            const shipsTotal = board.ships.length;
            const status = shipsLeft === 0 ? '💀 Fleet Destroyed' : `${shipsLeft}/${shipsTotal} ships remaining`;
            return `${user.displayName}: ${status}`;
        });

        embed.addFields({
            name: '⚓ Final Fleet Status',
            value: finalStatus.join('\n'),
            inline: false
        });

        if (this.betAmount > 0) {
            embed.addFields({
                name: '💰 Prize Won',
                value: fmt(this.betAmount * 2),
                inline: true
            });
        }

        const duration = Math.round((Date.now() - this.createdAt) / 1000 / 60);
        embed.setFooter({ text: `Battle duration: ${duration} minutes` });

        return embed;
    }

    createGameButtons() {
        const rows = [];

        switch (this.state) {
            case 'lobby':
                const lobbyButtons = [
                    new ButtonBuilder()
                        .setCustomId('battleship_join')
                        .setLabel('⚓ Join Battle')
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(this.players.size >= 2)
                ];

                if (this.players.size === 2) {
                    lobbyButtons.push(
                        new ButtonBuilder()
                            .setCustomId('battleship_start')
                            .setLabel('🚢 Start Game')
                            .setStyle(ButtonStyle.Primary)
                    );
                }

                rows.push(new ActionRowBuilder().addComponents(lobbyButtons));
                break;

            case 'placing':
                rows.push(new ActionRowBuilder().addComponents([
                    new ButtonBuilder()
                        .setCustomId('battleship_open_placement')
                        .setLabel('🚢 Open Placement Panel')
                        .setStyle(ButtonStyle.Primary)
                ]));
                break;

            case 'playing':
                rows.push(new ActionRowBuilder().addComponents([
                    new ButtonBuilder()
                        .setCustomId('battleship_attack')
                        .setLabel('🎯 Attack!')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('battleship_view_board')
                        .setLabel('👁️ View My Board')
                        .setStyle(ButtonStyle.Secondary)
                ]));
                break;

            case 'finished':
                const winner = this.players.get(this.winner);
                rows.push(new ActionRowBuilder().addComponents([
                    new ButtonBuilder()
                        .setCustomId('battleship_finished')
                        .setLabel(`🏆 ${winner.displayName} Wins!`)
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(true)
                ]));
                break;
        }

        return rows;
    }

    static createHelpEmbed() {
        return new EmbedBuilder()
            .setTitle('⚓ Battleship Game Guide')
            .setDescription('**Master the art of naval warfare!**')
            .setColor(0x1E88E5)
            .addFields(
                {
                    name: '🎯 Objective',
                    value: 'Sink all of your opponent\'s ships before they sink yours!',
                    inline: false
                },
                {
                    name: '🚢 Your Fleet',
                    value: SHIPS.map(ship => `${ship.emoji} **${ship.name}** - ${ship.length} spaces`).join('\n'),
                    inline: true
                },
                {
                    name: '📋 Game Flow',
                    value: '1. **Join**: Two players join the battle\n2. **Place**: Position your ships secretly\n3. **Attack**: Take turns firing at enemy grid\n4. **Win**: First to sink all enemy ships wins!',
                    inline: true
                },
                {
                    name: '🎮 Placement Rules',
                    value: '• Ships cannot overlap or touch\n• Ships can be horizontal or vertical\n• Use auto-placement for quick setup',
                    inline: false
                },
                {
                    name: '⚔️ Combat Rules',
                    value: '• **Hit**: Red X marks a successful hit\n• **Miss**: Blue O marks a miss\n• **Sunk**: Skull marks a destroyed ship\n• Continue attacking after a hit!',
                    inline: false
                },
                {
                    name: '💡 Strategy Tips',
                    value: '• Spread out your shots initially\n• Focus fire around hits\n• Protect your largest ships\n• Think like your opponent!',
                    inline: false
                }
            )
            .setFooter({ text: 'Good luck, Admiral! ⚓' })
            .setTimestamp();
    }
}

// Global game storage
const activeGames = new Map();
const userGames = new Map();

function getBattleshipGame(channelId) {
    return activeGames.get(channelId);
}

function createBattleshipGame(channelId, hostUser, betAmount = 0) {
    if (activeGames.has(channelId)) {
        return null; // Game already exists
    }

    const game = new BattleshipGameSession(channelId, hostUser, betAmount);
    activeGames.set(channelId, game);
    userGames.set(hostUser.id, channelId);
    
    return game;
}

function removeBattleshipGame(channelId) {
    const game = activeGames.get(channelId);
    if (game) {
        // Remove all players from user games mapping
        for (const playerId of game.players.keys()) {
            userGames.delete(playerId);
        }
        activeGames.delete(channelId);
        logger.info(`Battleship game removed from channel ${channelId}`);
    }
}

function getUserGame(userId) {
    const channelId = userGames.get(userId);
    return channelId ? activeGames.get(channelId) : null;
}

module.exports = {
    BattleshipGameSession,
    getBattleshipGame,
    createBattleshipGame,
    removeBattleshipGame,
    getUserGame,
    BOARD_SIZE,
    SHIPS,
    HORIZONTAL,
    VERTICAL
};