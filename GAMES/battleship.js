/**
 * Battleship Game - Refactored for Discord limitations
 * Features 10x10 grid, 5 ships per player, turn-based combat
 * Enhanced with Canvas rendering and proper state management
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, StringSelectMenuBuilder } = require('discord.js');
const path = require('path');
const { secureRandomInt } = require('../UTILS/rng');
const { fmt } = require('../UTILS/common');
const logger = require('../UTILS/logger');
const battleshipRenderer = require('../UTILS/battleshipRenderer');
const UITemplates = require('../UTILS/uiTemplates');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');

// Game constants - Official Battleship rules
const BOARD_SIZE = 10;
const SHIPS = [
    { name: 'Carrier', length: 5, emoji: '🚢', color: '#8B0000' }, // Dark Red
    { name: 'Battleship', length: 4, emoji: '⚓', color: '#4682B4' }, // Steel Blue  
    { name: 'Cruiser', length: 3, emoji: '🚤', color: '#228B22' }, // Forest Green
    { name: 'Submarine', length: 3, emoji: '🔱', color: '#FF8C00' }, // Dark Orange
    { name: 'Destroyer', length: 2, emoji: '🛟', color: '#9932CC' } // Dark Orchid
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
    constructor(name, length, emoji, color) {
        this.name = name;
        this.length = length;
        this.emoji = emoji;
        this.color = color;
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
        this.ships = SHIPS.map(ship => new BattleshipShip(ship.name, ship.length, ship.emoji, ship.color));
        this.shipPositions = new Map(); // position -> ship mapping
        this.currentShipIndex = 0;
        this.placementComplete = false;
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
        for (const [row, col] of positions) {
            if (this.shipPositions.has(`${row},${col}`)) {
                return false;
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
        if (this.currentShipIndex >= this.ships.length) {
            this.placementComplete = true;
        }
        return this.currentShipIndex < this.ships.length;
    }

    getNextShipToPlace() {
        return this.getCurrentShip();
    }

    allShipsPlaced() {
        return this.ships.every(ship => ship.placed);
    }

    autoPlaceAllShips() {
        // Reset any existing placements
        this.grid = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(CELL_EMPTY));
        this.shipPositions.clear();
        this.ships.forEach(ship => {
            ship.placed = false;
            ship.positions = [];
            ship.hits.clear();
        });
        
        // Try to place each ship randomly
        for (const ship of this.ships) {
            let placed = false;
            let attempts = 0;
            const maxAttempts = 100;
            
            while (!placed && attempts < maxAttempts) {
                const row = secureRandomInt(0, BOARD_SIZE);
                const col = secureRandomInt(0, BOARD_SIZE);
                const direction = secureRandomInt(0, 2) === 0 ? HORIZONTAL : VERTICAL;
                
                if (this.placeShip(ship, row, col, direction)) {
                    placed = true;
                }
                attempts++;
            }
            
            if (!placed) {
                logger.error(`Failed to auto-place ship ${ship.name} after ${maxAttempts} attempts`);
                return false;
            }
        }
        
        this.placementComplete = true;
        return true;
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

    async getBoardImage(options = {}) {
        const {
            title = 'Battleship Board',
            showShips = true,
            showAttacks = true
        } = options;
        
        return await battleshipRenderer.renderSingleBoard(this, {
            title,
            showShips,
            showAttacks
        });
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
        this.sessionId = null; // For SessionManager integration
        this.endGameVotes = new Set(); // Track players who voted to end
        
        logger.info(`Battleship game created in channel ${channelId} by ${hostUser.username}`);
    }
    
    voteEndGame(userId) {
        if (!this.players.has(userId)) return false;
        
        this.endGameVotes.add(userId);
        
        // Check if all players voted to end
        if (this.endGameVotes.size === this.players.size && this.players.size === 2) {
            return true; // Both players agree to end
        }
        
        return false; // Not all players agree yet
    }
    
    getEndGameVoteStatus() {
        return {
            votesNeeded: this.players.size,
            currentVotes: this.endGameVotes.size,
            voters: Array.from(this.endGameVotes)
        };
    }
    
    async endByConsent() {
        this.state = 'finished';
        this.winner = null; // No winner when ended by consent
        
        // End the session
        if (this.sessionId) {
            await GameSessionIntegrator.completeGameSession(this.sessionId, {
                winner: null,
                totalPlayers: this.players.size,
                gameEnded: true,
                endReason: 'mutual_consent'
            });
        }
        
        logger.info(`Battleship game ended by mutual consent in channel ${this.channelId}`);
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
        
        // Automatically place ships for both players
        for (const [playerId, board] of this.boards.entries()) {
            const success = board.autoPlaceAllShips();
            if (!success) {
                logger.error(`Failed to auto-place ships for player ${playerId}`);
                return false;
            }
        }
        
        // Immediately start the battle after auto-placement
        this.state = 'playing';
        
        // Random first player
        const playerIds = Array.from(this.players.keys());
        this.currentTurn = playerIds[secureRandomInt(0, playerIds.length)];
        
        logger.info(`Battleship game started with auto-placed ships in channel ${this.channelId}`);
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
        const playerList = Array.from(this.players.values())
            .map((user, index) => `${index + 1}. ${user.displayName}`)
            .join('\n') || 'Waiting for players...';
        
        const shipList = SHIPS.map(ship => `${ship.emoji} ${ship.name} (${ship.length})`).join('\n');
        
        // Safely format bet amount
        const betAmount = typeof this.betAmount === 'number' && this.betAmount > 0 ? this.betAmount : 0;
        const stakesText = betAmount > 0 ? 
            `${fmt(betAmount)} each\nWinner: ${fmt(betAmount * 2)}` : 
            'Free Play';
        
        const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
        
        return buildSessionEmbed({
            title: '⚓ Battleship Naval Battle',
            topFields: [
                {
                    name: '👥 LOBBY STATUS',
                    value: `**Players:** ${this.players.size}/2\n\`\`\`${playerList}\`\`\``,
                    inline: false
                },
                {
                    name: '🎯 GAME OBJECTIVE',
                    value: '**Sink all enemy ships first!**\n📋 Place 5 ships strategically, then battle!',
                    inline: false
                }
            ],
            bankFields: [
                { name: '🚢 Your Fleet', value: shipList, inline: true },
                { name: '💰 Stakes', value: stakesText, inline: true },
                { name: '🎮 Rules', value: 'Ships cannot overlap\nHorizontal/Vertical only\nHit = continue turn', inline: true }
            ],
            stageText: 'LOBBY',
            color: 0x1E88E5,
            footer: `Game ID: ${this.channelId.slice(-6)} • Host: ${this.hostUser.displayName} • ATIVE Casino`
        }).setThumbnail('attachment://battleshipbanner.gif');
    }

    createPlacementEmbed() {
        const progress = Array.from(this.players.values()).map(user => {
            const board = this.boards.get(user.id);
            const placedCount = board.ships.filter(ship => ship.placed).length;
            const status = board.allShipsPlaced() ? '✅ Ready!' : `${placedCount}/5 ships`;
            return `${user.displayName}: ${status}`;
        }).join('\n');
        
        // Check if both players are ready
        const allReady = Array.from(this.boards.values()).every(board => board.allShipsPlaced());
        const readyCount = Array.from(this.boards.values()).filter(board => board.allShipsPlaced()).length;
        
        const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
        
        let stageText = 'PLACEMENT';
        let color = 0x43A047;
        let deploymentValue = `**Deploy your fleet strategically!**\n\`\`\`${progress}\`\`\``;
        
        if (allReady && this.players.size === 2) {
            stageText = '⚔️ READY TO START BATTLE! ⚔️';
            color = 0xFF5722;
            deploymentValue = `**🎉 ALL FLEETS DEPLOYED! 🎉**\n\`\`\`${progress}\`\`\`\n\n**🚨 HOST: Click "Start" to begin the naval battle!**`;
        } else if (readyCount > 0) {
            deploymentValue = `**Fleet deployment in progress...**\n\`\`\`${progress}\`\`\`\n\n${readyCount === 1 ? '⏳ Waiting for opponent to finish placement...' : ''}`;
        }
        
        return buildSessionEmbed({
            title: allReady && this.players.size === 2 ? '🚀 BATTLE READY!' : '🚢 Ship Placement Phase',
            topFields: [
                {
                    name: allReady ? '🎯 BATTLE STATUS' : '🚢 FLEET DEPLOYMENT',
                    value: deploymentValue,
                    inline: false
                },
                {
                    name: '📋 PLACEMENT RULES',
                    value: 'Ships cannot overlap (touching allowed)\n**🎮 Controls:** Use "Ship Placement" button for private setup',
                    inline: false
                }
            ],
            bankFields: [
                { name: '📍 Placement Rules', value: 'Horizontal or Vertical\nNo diagonal placement\nNo overlapping', inline: true },
                { name: '🎯 Strategy Tips', value: 'Spread ships out\nHide your patterns\nProtect large ships', inline: true },
                { name: '⚡ Quick Options', value: 'Manual placement\nAuto-placement\nPrivate board view', inline: true }
            ],
            stageText,
            color,
            footer: allReady ? 'All fleets ready! Host can start the battle • ATIVE Casino' : 'Click "Ship Placement" to deploy your fleet privately • ATIVE Casino'
        });
    }

    async createBattleEmbed() {
        const currentPlayer = this.players.get(this.currentTurn);
        const playersArray = Array.from(this.players.entries());
        const [player1, player2] = playersArray;
        
        const statusLines = playersArray.map(([playerId, user]) => {
            const board = this.boards.get(playerId);
            const shipsLeft = board.getShipsRemaining();
            const shipsTotal = board.ships.length;
            const turnIndicator = playerId === this.currentTurn ? '👈' : '';
            return `${user.displayName}: ${shipsLeft}/${shipsTotal} ships ${turnIndicator}`;
        });
        
        // Generate public battle view (hits/misses only, no ships)
        const battleshipRenderer = require('../UTILS/battleshipRenderer');
        const player1Board = this.boards.get(player1[0]);
        const player2Board = this.boards.get(player2[0]);
        
        const battleImage = await battleshipRenderer.renderDualBoards(
            player1Board, 
            player2Board, 
            {
                title: `${player1[1].displayName} vs ${player2[1].displayName} - Public Battle View`,
                player1Name: player1[1].displayName,
                player2Name: player2[1].displayName,
                showPlayer1Ships: false,
                showPlayer2Ships: false,
                showAttacks: true
            }
        );
        
        const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
        
        const embed = new EmbedBuilder()
            .setTitle('⚔️ Naval Combat in Progress')
            .setDescription(`**<@${this.currentTurn}>'s Turn to Attack!**\n\nClick the **Attack** button to fire at enemy coordinates.`)
            .setColor(0xE53935)
            .addFields(
                {
                    name: '🎯 BATTLE STATUS',
                    value: `\`\`\`${statusLines.join('\n')}\`\`\``,
                    inline: false
                },
                {
                    name: '💥 CURRENT ACTION',
                    value: `<@${this.currentTurn}> has **${this.boards.get(this.currentTurn).getShipsRemaining()} ships** remaining\n• Click **Attack** to choose target coordinates\n• Hit = Continue attacking\n• Miss = Turn ends`,
                    inline: false
                },
                { name: '🎯 Turn', value: currentPlayer.displayName, inline: true },
                { name: '💰 Prize Pool', value: (typeof this.betAmount === 'number' && this.betAmount > 0) ? fmt(this.betAmount * 2) : 'Free Play', inline: true },
                { name: '📊 Ships Left', value: `P1: ${this.boards.get(player1[0]).getShipsRemaining()}/5\nP2: ${this.boards.get(player2[0]).getShipsRemaining()}/5`, inline: true }
            )
            .setFooter({ text: 'Use "Attack" button to fire • "View Ships" to see your fleet' })
            .setTimestamp();
        
        return { embed, battleImage };
    }

    createFinishedEmbed() {
        const winner = this.players.get(this.winner);
        const duration = Math.round((Date.now() - this.createdAt) / 1000 / 60);
        
        const finalStatus = Array.from(this.players.entries()).map(([playerId, user]) => {
            const board = this.boards.get(playerId);
            const shipsLeft = board.getShipsRemaining();
            const shipsTotal = board.ships.length;
            const status = shipsLeft === 0 ? '💀 Fleet Destroyed' : `${shipsLeft}/${shipsTotal} ships`;
            return `${user.displayName}: ${status}`;
        });
        
        const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
        
        return buildSessionEmbed({
            title: '🏆 Naval Victory',
            topFields: [
                {
                    name: '🏆 VICTORY ACHIEVED',
                    value: `**WINNER:** ${winner.displayName}!\n\`\`\`${finalStatus.join('\n')}\`\`\``,
                    inline: false
                },
                {
                    name: '⚔️ BATTLE RESULTS',
                    value: `**Complete naval domination achieved!**\n⏱️ Duration: ${duration} minutes of strategic warfare`,
                    inline: false
                }
            ],
            bankFields: [
                { name: '🏆 Champion', value: `${winner.displayName}\nComplete Victory\nAll ships sunk`, inline: true },
                { name: '💰 Prize Won', value: (typeof this.betAmount === 'number' && this.betAmount > 0) ? fmt(this.betAmount * 2) : 'Bragging Rights', inline: true },
                { name: '📊 Battle Stats', value: `Duration: ${duration}m\nShips Deployed: 10\nStrategy: Superior`, inline: true }
            ],
            stageText: 'VICTORY',
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
                        .setLabel('⚔️ Join Naval Battle')
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(this.players.size >= 2),
                    new ButtonBuilder()
                        .setCustomId('battleship_help')
                        .setLabel('📚 Game Rules & Strategy Guide')
                        .setStyle(ButtonStyle.Secondary)
                ];

                if (this.players.size === 2) {
                    lobbyButtons.splice(1, 0,
                        new ButtonBuilder()
                            .setCustomId('battleship_start')
                            .setLabel('⚔️ Start the Battle!')
                            .setStyle(ButtonStyle.Danger)
                    );
                }

                rows.push(new ActionRowBuilder().addComponents(lobbyButtons));
                break;

            case 'placing':
                rows.push(new ActionRowBuilder().addComponents([
                    new ButtonBuilder()
                        .setCustomId('battleship_ship_placement')
                        .setLabel('🗺️ Deploy Your Fleet (Private)')
                        .setStyle(ButtonStyle.Primary)
                ]));
                break;

            case 'playing':
                // Simple attack and view buttons
                rows.push(new ActionRowBuilder().addComponents([
                    new ButtonBuilder()
                        .setCustomId('battleship_attack')
                        .setLabel('💥 Attack')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('battleship_view_ships')
                        .setLabel('🚢 View Your Ships')
                        .setStyle(ButtonStyle.Primary)
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
        const shipList = SHIPS.map(ship => `${ship.emoji} ${ship.name} (${ship.length} holes)`).join('\n');
        
        return buildSessionEmbed({
            title: '⚓ Battleship Strategy Guide',
            stageText: `Objective: Be the first to sink all 5 of your opponent's ships!\n` +
                      `Official Rules - Based on Classic Battleship Game\n` +
                      `Fleet: 5 ships each (Carrier, Battleship, Cruiser, Submarine, Destroyer)\n` +
                      `Victory: Sink all enemy ships to win the battle!`,
            topFields: [
                { name: '🚢 Your Fleet', value: shipList, inline: true },
                { name: '📍 Placement Rules', value: '• Horizontal or Vertical only\n• No diagonal placement\n• Ships cannot overlap\n• Ships CAN touch edges', inline: true },
                { name: '⚔️ Combat Rules', value: '• Call coordinates (A1-J10)\n• HIT = Continue your turn\n• MISS = End your turn\n• SUNK = Continue attacking', inline: true },
                { name: '🎮 Game Flow', value: '1. Join battle (2 players)\n2. Place ships secretly\n3. Take turns attacking\n4. First to sink all wins!', inline: true },
                { name: '🎯 Attack Results', value: '• **HIT** - Red X on target\n• **MISS** - White circle\n• **SUNK** - Skull symbol\n• View boards anytime', inline: true },
                { name: '💡 Strategy Tips', value: '• Spread initial shots\n• Hunt around hits\n• Protect large ships\n• Think systematically', inline: true }
            ],
            color: 0x1E88E5,
            footer: 'Master naval warfare tactics • Based on official Battleship rules'
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