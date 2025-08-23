/**
 * Battleship Game - Classic two-player naval strategy game
 * Features 10x10 grid, 5 ships per player, turn-based combat
 * Converted from Python with improvements and modern UI
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { secureRandomInt } = require('../UTILS/rng');
const { fmt } = require('../UTILS/common');
const logger = require('../UTILS/logger');

// Game constants - Official Battleship rules from PDF
const BOARD_SIZE = 10;
const SHIPS = [
    { name: 'Carrier', length: 5, emoji: '🚢' },      // 5 holes
    { name: 'Battleship', length: 4, emoji: '⚓' },   // 4 holes
    { name: 'Cruiser', length: 3, emoji: '🚤' },     // 3 holes
    { name: 'Submarine', length: 3, emoji: '🔱' },   // 3 holes
    { name: 'Destroyer', length: 2, emoji: '🛟' }    // 2 holes
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

        // Check for overlapping ships only (per official rules)
        // Ships CAN touch - the PDF doesn't prohibit adjacent ships
        for (const [row, col] of positions) {
            if (this.shipPositions.has(`${row},${col}`)) {
                return false; // Ships cannot overlap
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
        // Use gameSessionKit for consistent UI styling
        const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
        
        // Player list for topFields
        const playerList = Array.from(this.players.values())
            .map((user, index) => `${index + 1}. ${user.displayName}`)
            .join('\n');
        
        const topFields = [{
            name: '⚓ BATTLESHIP NAVAL BATTLE',
            value: `**Players:** ${this.players.size}/2\n` +
                   `\`\`\`fix\n${playerList || 'Waiting for players...'}\`\`\`\n` +
                   `**🎯 Objective:** Sink all enemy ships first!\n` +
                   `**📋 Setup:** Place 5 ships, attack coordinates, claim victory!`,
            inline: false
        }];

        // Ship composition and stakes in bankFields
        const shipList = SHIPS.map(ship => `${ship.emoji} ${ship.name} (${ship.length})`).join('\n');
        const bankFields = [
            { name: '🚢 Your Fleet', value: shipList, inline: true },
            { name: '💰 Stakes', value: this.betAmount > 0 ? `${fmt(this.betAmount)} each\nWinner: ${fmt(this.betAmount * 2)}` : 'Free Play', inline: true },
            { name: '🎮 Rules', value: 'No overlapping\nH/V placement only\nHit = continue turn', inline: true }
        ];

        // Stage text for current status
        const stageText = 'LOBBY - WAITING FOR PLAYERS';
        
        // Build the embed using gameSessionKit
        return buildSessionEmbed({
            title: '⚓ Battleship Naval Battle',
            topFields,
            bankFields,
            stageText,
            color: 0x1E88E5,
            footer: `Game ID: ${this.channelId.slice(-6)} • Host: ${this.hostUser.displayName} • ATIVE Casino`
        });
    }

    createPlacementEmbed() {
        // Use gameSessionKit for consistent UI styling
        const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
        
        // Show placement progress in topFields
        const progress = Array.from(this.players.values()).map(user => {
            const board = this.boards.get(user.id);
            const placedCount = board.ships.filter(ship => ship.placed).length;
            const status = board.allShipsPlaced() ? '✅ Ready!' : `${placedCount}/5 ships`;
            return `${user.displayName}: ${status}`;
        }).join('\n');
        
        const topFields = [{
            name: '🚢 SHIP PLACEMENT PHASE',
            value: `**Deploy your fleet strategically!**\n` +
                   `\`\`\`fix\n${progress}\`\`\`\n` +
                   `**📋 Rules:** Ships can't overlap (touching is allowed)\n` +
                   `**🎮 Controls:** Use placement panel for private setup`,
            inline: false
        }];

        // Placement instructions in bankFields
        const bankFields = [
            { name: '📍 Placement Rules', value: 'Horizontal or Vertical\nNo diagonal placement\nNo overlapping only', inline: true },
            { name: '🎯 Strategy Tips', value: 'Spread ships out\nHide your patterns\nProtect large ships', inline: true },
            { name: '⚡ Quick Options', value: 'Manual placement\nAuto-placement\nPrivate board view', inline: true }
        ];

        // Stage text for current status
        const stageText = 'PLACEMENT PHASE';
        
        // Build the embed using gameSessionKit
        return buildSessionEmbed({
            title: '🚢 Ship Placement Phase',
            topFields,
            bankFields,
            stageText,
            color: 0x43A047,
            footer: 'Click "Open Placement Panel" to deploy your ships privately • ATIVE Casino'
        });
    }

    createBattleEmbed() {
        const currentPlayer = this.players.get(this.currentTurn);
        
        // Use gameSessionKit for consistent UI styling
        const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
        
        // Battle status for topFields
        const statusLines = Array.from(this.players.entries()).map(([playerId, user]) => {
            const board = this.boards.get(playerId);
            const shipsLeft = board.getShipsRemaining();
            const shipsTotal = board.ships.length;
            return `${user.displayName}: ${shipsLeft}/${shipsTotal} ships`;
        });
        
        const topFields = [{
            name: '⚔️ BATTLE IN PROGRESS',
            value: `**Current Turn:** ${currentPlayer.displayName}\n` +
                   `\`\`\`fix\n${statusLines.join('\n')}\`\`\`\n` +
                   `**🎯 Action:** Call out coordinates to attack!\n` +
                   `**💥 Result:** Hit, Miss, or Sunk will be announced`,
            inline: false
        }];

        // Combat information in bankFields
        const bankFields = [
            { name: '🎯 Attack Phase', value: `${currentPlayer.displayName}'s turn\nChoose coordinates\n(A1 to J10)`, inline: true },
            { name: '💰 Prize Pool', value: this.betAmount > 0 ? fmt(this.betAmount * 2) : 'Free Play', inline: true },
            { name: '📊 View Options', value: 'Your Board\nDual View\nAttack History', inline: true }
        ];

        // Stage text for current status
        const stageText = 'BATTLE ACTIVE';
        
        // Build the embed using gameSessionKit
        return buildSessionEmbed({
            title: '⚔️ Naval Combat',
            topFields,
            bankFields,
            stageText,
            color: 0xE53935,
            footer: 'Use Attack button to fire at enemy coordinates • ATIVE Casino'
        });
    }

    createFinishedEmbed() {
        const winner = this.players.get(this.winner);
        const duration = Math.round((Date.now() - this.createdAt) / 1000 / 60);
        
        // Use gameSessionKit for consistent UI styling
        const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
        
        // Victory announcement for topFields
        const finalStatus = Array.from(this.players.entries()).map(([playerId, user]) => {
            const board = this.boards.get(playerId);
            const shipsLeft = board.getShipsRemaining();
            const shipsTotal = board.ships.length;
            const status = shipsLeft === 0 ? '💀 Fleet Destroyed' : `${shipsLeft}/${shipsTotal} ships`;
            return `${user.displayName}: ${status}`;
        });
        
        const topFields = [{
            name: '🏆 BATTLE CONCLUDED',
            value: `**VICTORY TO:** ${winner.displayName}!\n` +
                   `\`\`\`fix\n${finalStatus.join('\n')}\`\`\`\n` +
                   `**⚔️ Result:** Complete naval domination achieved!\n` +
                   `**⏱️ Duration:** ${duration} minutes of strategic warfare`,
            inline: false
        }];

        // Victory rewards in bankFields
        const bankFields = [
            { name: '🏆 Champion', value: `${winner.displayName}\nComplete Victory\nAll ships sunk`, inline: true },
            { name: '💰 Prize Won', value: this.betAmount > 0 ? fmt(this.betAmount * 2) : 'Bragging Rights', inline: true },
            { name: '📊 Battle Stats', value: `Duration: ${duration}m\nShips Deployed: 10\nStrategy: Superior`, inline: true }
        ];

        // Stage text for current status
        const stageText = 'VICTORY ACHIEVED';
        
        // Build the embed using gameSessionKit
        return buildSessionEmbed({
            title: '🏆 Naval Victory',
            topFields,
            bankFields,
            stageText,
            color: 0xFFD700,
            footer: `Battle concluded • ${winner.displayName} claims naval supremacy • ATIVE Casino`
        });
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
                        .setDisabled(this.players.size >= 2),
                    new ButtonBuilder()
                        .setCustomId('battleship_help')
                        .setLabel('❓ Rules & Help')
                        .setStyle(ButtonStyle.Secondary)
                ];

                if (this.players.size === 2) {
                    lobbyButtons.splice(1, 0,
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
        // Use gameSessionKit for consistent UI styling
        const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
        
        // Complete battleship instructions based on PDF
        const topFields = [{
            name: '⚓ BATTLESHIP NAVAL WARFARE GUIDE',
            value: `**Objective:** Be the first to sink all 5 of your opponent's ships!\n` +
                   `\`\`\`fix\nOfficial Rules - Based on Classic Battleship Game\`\`\`\n` +
                   `**🚢 Fleet:** 5 ships each (Carrier, Battleship, Cruiser, Submarine, Destroyer)\n` +
                   `**🎯 Victory:** Sink all enemy ships to win the battle!`,
            inline: false
        }];

        // Game rules and mechanics in bankFields
        const shipList = SHIPS.map(ship => `${ship.emoji} ${ship.name} (${ship.length} holes)`).join('\n');
        const bankFields = [
            { 
                name: '🚢 Your Fleet', 
                value: shipList, 
                inline: true 
            },
            { 
                name: '📍 Placement Rules', 
                value: '• Horizontal or Vertical only\n• No diagonal placement\n• Ships cannot overlap\n• Ships CAN touch edges', 
                inline: true 
            },
            { 
                name: '⚔️ Combat Rules', 
                value: '• Call coordinates (A1-J10)\n• HIT = Continue your turn\n• MISS = End your turn\n• SUNK = Continue attacking', 
                inline: true 
            },
            { 
                name: '🎮 Game Flow', 
                value: '1. Join battle (2 players)\n2. Place ships secretly\n3. Take turns attacking\n4. First to sink all wins!', 
                inline: true 
            },
            { 
                name: '🎯 Attack Results', 
                value: '• **HIT** - Red X on target\n• **MISS** - White circle\n• **SUNK** - Skull symbol\n• View boards anytime', 
                inline: true 
            },
            { 
                name: '💡 Strategy Tips', 
                value: '• Spread initial shots\n• Hunt around hits\n• Protect large ships\n• Think systematically', 
                inline: true 
            }
        ];

        // Stage text for help
        const stageText = 'STRATEGY GUIDE';
        
        // Build the embed using gameSessionKit
        return buildSessionEmbed({
            title: '⚓ Battleship Strategy Guide',
            topFields,
            bankFields,
            stageText,
            color: 0x1E88E5,
            footer: 'Master naval warfare tactics • Based on official Battleship rules • ATIVE Casino'
        });
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