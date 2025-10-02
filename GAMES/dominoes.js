/**
 * Simple Dominoes Game Implementation
 * Traditional domino game with simple mechanics
 */

const { secureRandomShuffle, secureRandomChoice } = require('../UTILS/rng');
const logger = require('../UTILS/logger');

class DominoTile {
    constructor(high, low) {
        this.high = Math.max(high, low);
        this.low = Math.min(high, low);
        this.isDouble = (high === low);
        this.totalPips = high + low;
    }

    canConnectTo(value) {
        return this.high === value || this.low === value;
    }

    getOtherEnd(connectedValue) {
        if (this.high === connectedValue) return this.low;
        if (this.low === connectedValue) return this.high;
        return null;
    }

    toString() {
        return `[${this.high}:${this.low}]`;
    }

    equals(other) {
        return this.high === other.high && this.low === other.low;
    }
}

class DominoGame {
    constructor(gameId, channelId, hostUserId, betAmount) {
        this.gameId = gameId;
        this.channelId = channelId;
        this.hostUserId = hostUserId;
        this.betAmount = betAmount;
        
        // Game state
        this.gamePhase = 'lobby'; // lobby, playing, finished
        this.players = [];
        this.currentPlayerIndex = 0;
        this.maxPlayers = 4;
        
        // Domino set and hands
        this.dominoSet = this.createDominoSet();
        this.boneyard = [...this.dominoSet]; // Available tiles to draw
        this.board = []; // Played tiles in order
        this.leftEnd = null;
        this.rightEnd = null;
        
        // Game stats
        this.roundNumber = 1;
        this.lastActivity = Date.now();
        this.gameMessage = null;
    }
    
    createDominoSet() {
        const tiles = [];
        // Create double-6 domino set (28 tiles)
        for (let high = 0; high <= 6; high++) {
            for (let low = 0; low <= high; low++) {
                tiles.push(new DominoTile(high, low));
            }
        }
        return tiles;
    }
    
    addPlayer(userId, username, isBot = false) {
        if (this.players.length >= this.maxPlayers) {
            return false;
        }
        
        const player = {
            userId,
            username,
            hand: [],
            isBot,
            hasDrawn: false
        };
        
        this.players.push(player);
        return true;
    }
    
    addBot() {
        const botNames = ['Ana', 'Carlos', 'María', 'Juan', 'Sofia', 'Diego'];
        const availableNames = botNames.filter(name => 
            !this.players.some(p => p.username === name)
        );
        
        if (availableNames.length === 0) {
            return false;
        }
        
        const botName = secureRandomChoice(availableNames);
        return this.addPlayer(`bot_${Date.now()}`, botName, true);
    }
    
    startGame() {
        if (this.players.length < 2) {
            return false;
        }
        
        // Shuffle dominoes
        this.boneyard = secureRandomShuffle([...this.dominoSet]);
        
        // Deal 7 tiles to each player
        for (const player of this.players) {
            player.hand = [];
            for (let i = 0; i < 7; i++) {
                if (this.boneyard.length > 0) {
                    player.hand.push(this.boneyard.pop());
                }
            }
        }
        
        this.gamePhase = 'playing';
        this.currentPlayerIndex = 0;
        this.lastActivity = Date.now();
        
        return true;
    }
    
    getCurrentPlayer() {
        return this.players[this.currentPlayerIndex];
    }
    
    getPlayableTiles(player) {
        if (this.board.length === 0) {
            // First play - any tile can be played
            return [...player.hand];
        }
        
        // Find tiles that can connect to either end
        return player.hand.filter(tile => 
            tile.canConnectTo(this.leftEnd) || tile.canConnectTo(this.rightEnd)
        );
    }
    
    canPlayerPlay(player) {
        return this.getPlayableTiles(player).length > 0;
    }
    
    playTile(player, tile, side = 'auto') {
        if (this.getCurrentPlayer() !== player) {
            return { success: false, message: 'Not your turn' };
        }
        
        // Check if player has the tile
        const tileIndex = player.hand.findIndex(t => t.equals(tile));
        if (tileIndex === -1) {
            return { success: false, message: 'You don\'t have that tile' };
        }
        
        // First tile goes in the middle
        if (this.board.length === 0) {
            this.board.push(tile);
            this.leftEnd = tile.low;
            this.rightEnd = tile.high;
            player.hand.splice(tileIndex, 1);
            this.nextTurn();
            return { success: true, message: 'First tile played' };
        }
        
        // Determine which side to play on
        let playOnLeft = false;
        let playOnRight = false;
        
        if (tile.canConnectTo(this.leftEnd)) playOnLeft = true;
        if (tile.canConnectTo(this.rightEnd)) playOnRight = true;
        
        if (!playOnLeft && !playOnRight) {
            return { success: false, message: 'Tile cannot be played' };
        }
        
        // If both sides possible, use the side parameter
        if (playOnLeft && playOnRight) {
            if (side === 'left') playOnRight = false;
            else if (side === 'right') playOnLeft = false;
            else playOnRight = false; // Default to left if auto
        }
        
        // Play the tile
        if (playOnLeft) {
            this.board.unshift(tile);
            this.leftEnd = tile.getOtherEnd(this.leftEnd);
        } else {
            this.board.push(tile);
            this.rightEnd = tile.getOtherEnd(this.rightEnd);
        }
        
        player.hand.splice(tileIndex, 1);
        this.lastActivity = Date.now();
        
        // Check for win
        if (player.hand.length === 0) {
            this.gamePhase = 'finished';
            return { success: true, message: 'Player wins!', winner: player };
        }
        
        this.nextTurn();
        return { success: true, message: 'Tile played successfully' };
    }
    
    drawTile(player) {
        if (this.getCurrentPlayer() !== player) {
            return { success: false, message: 'Not your turn' };
        }
        
        if (player.hasDrawn) {
            return { success: false, message: 'Already drew this turn' };
        }
        
        if (this.boneyard.length === 0) {
            return { success: false, message: 'No tiles left to draw' };
        }
        
        // Can only draw if no playable tiles
        if (this.canPlayerPlay(player)) {
            return { success: false, message: 'You have playable tiles' };
        }
        
        const drawnTile = this.boneyard.pop();
        player.hand.push(drawnTile);
        player.hasDrawn = true;
        this.lastActivity = Date.now();
        
        // If drawn tile is playable, player can still play
        if (drawnTile.canConnectTo(this.leftEnd) || drawnTile.canConnectTo(this.rightEnd)) {
            return { success: true, message: 'Tile drawn - you can play it!', tile: drawnTile };
        }
        
        // Otherwise pass turn
        this.nextTurn();
        return { success: true, message: 'Tile drawn, turn passed', tile: drawnTile };
    }
    
    passTurn(player) {
        if (this.getCurrentPlayer() !== player) {
            return { success: false, message: 'Not your turn' };
        }
        
        // Can only pass if no playable tiles and can't/won't draw
        if (this.canPlayerPlay(player)) {
            return { success: false, message: 'You have playable tiles' };
        }
        
        if (this.boneyard.length > 0 && !player.hasDrawn) {
            return { success: false, message: 'Must draw first' };
        }
        
        this.nextTurn();
        return { success: true, message: 'Turn passed' };
    }
    
    nextTurn() {
        // Reset draw flag for current player
        this.getCurrentPlayer().hasDrawn = false;
        
        // Move to next player
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        
        // Check if game is blocked (no one can play)
        if (this.isGameBlocked()) {
            this.gamePhase = 'finished';
        }
    }
    
    isGameBlocked() {
        // Game is blocked if no player can play and boneyard is empty
        if (this.boneyard.length > 0) return false;
        
        return this.players.every(player => !this.canPlayerPlay(player));
    }
    
    getGameState() {
        return {
            gameId: this.gameId,
            gamePhase: this.gamePhase,
            currentPlayer: this.getCurrentPlayer(),
            players: this.players.map(p => ({
                username: p.username,
                handSize: p.hand.length,
                isBot: p.isBot,
                hasDrawn: p.hasDrawn
            })),
            board: this.board,
            leftEnd: this.leftEnd,
            rightEnd: this.rightEnd,
            boneyardSize: this.boneyard.length,
            roundNumber: this.roundNumber
        };
    }
    
    // Simple bot AI
    getBotMove(player) {
        if (!player.isBot) return null;
        
        const playableTiles = this.getPlayableTiles(player);
        
        if (playableTiles.length > 0) {
            // Play a random playable tile
            const tile = secureRandomChoice(playableTiles);
            let side = 'auto';
            
            // If tile can play on both sides, choose randomly
            if (this.board.length > 0 && 
                tile.canConnectTo(this.leftEnd) && 
                tile.canConnectTo(this.rightEnd)) {
                side = Math.random() < 0.5 ? 'left' : 'right';
            }
            
            return { action: 'play', tile, side };
        }
        
        // Try to draw if possible
        if (this.boneyard.length > 0 && !player.hasDrawn) {
            return { action: 'draw' };
        }
        
        // Otherwise pass
        return { action: 'pass' };
    }
}

// Game storage
const games = new Map();

function createDominoGame(gameId, channelId, hostUserId, betAmount) {
    const game = new DominoGame(gameId, channelId, hostUserId, betAmount);
    games.set(gameId, game);
    return game;
}

function getDominoGame(gameId) {
    return games.get(gameId);
}

function removeDominoGame(gameId) {
    return games.delete(gameId);
}

function getActiveGamesForChannel(channelId) {
    return Array.from(games.values()).filter(game => game.channelId === channelId);
}

module.exports = {
    DominoTile,
    DominoGame,
    createDominoGame,
    getDominoGame,
    removeDominoGame,
    getActiveGamesForChannel
};