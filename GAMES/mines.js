/**
 * Mines Game Logic
 * Classic minesweeper-style gambling game with economy-compliant multipliers
 */

const { secureRandomFloat, secureRandomInt, secureRandomBytes } = require('../UTILS/rng');
const logger = require('../UTILS/logger');
const adaptiveGameMechanics = require('../UTILS/adaptiveGameMechanics');
// UNIVERSAL GAME INTEGRATION - ALL SYSTEMS
const UniversalGameIntegrator = require('../UTILS/UniversalGameIntegrator');
const securityLogger = require('../UTILS/securityLogger');
const sessionGuard = require('../UTILS/sessionGuard');
const transparentPayoutManager = require('../UTILS/transparentPayoutManager');
const tuningManager = require('../UTILS/tuningManager');

// Initialize game integrator
const gameIntegrator = new UniversalGameIntegrator('mines');


class MinesGame {
    constructor(userId, betAmount, modeConfig, currentWealth = 0) {
        this.userId = userId;
        this.betAmount = betAmount;
        this.currentWealth = currentWealth;
        this.mode = modeConfig.name;
        this.mineCount = modeConfig.mineCount;
        this.gridSize = modeConfig.gridSize;
        this.maxMultiplier = modeConfig.maxMultiplier;
        this.houseEdge = modeConfig.houseEdge;
        
        // Game state
        this.mines = [];
        this.revealedTiles = [];
        this.flaggedTiles = [];
        this.gameEnded = false;
        this.hitMine = false;
        this.cashedOut = false;
        
        // Initialize the game
        this.initializeGame();
    }
    
    initializeGame() {
        // Generate mine positions using secure random
        this.mines = this.generateMinePositions();
        logger.debug(`Mines game initialized for user ${this.userId} with ${this.mineCount} mines at positions: ${this.mines.join(', ')}`);
    }
    
    generateMinePositions() {
        const mines = [];
        const totalTiles = this.gridSize;
        
        while (mines.length < this.mineCount) {
            const position = secureRandomInt(0, totalTiles - 1);
            if (!mines.includes(position)) {
                mines.push(position);
            }
        }
        
        return mines.sort((a, b) => a - b);
    }
    
    revealTile(tileIndex) {
        // Validate tile index
        if (tileIndex < 0 || tileIndex >= this.gridSize) {
            return { success: false, message: 'Invalid tile position.' };
        }
        
        // Check if tile is already revealed
        if (this.revealedTiles.includes(tileIndex)) {
            return { success: false, message: 'Tile already revealed.' };
        }
        
        // Check if game has ended
        if (this.gameEnded) {
            return { success: false, message: 'Game has already ended.' };
        }
        
        // Remove from flagged if it was flagged
        const flagIndex = this.flaggedTiles.indexOf(tileIndex);
        if (flagIndex > -1) {
            this.flaggedTiles.splice(flagIndex, 1);
        }
        
        // Check if it's a mine
        if (this.mines.includes(tileIndex)) {
            this.revealedTiles.push(tileIndex);
            this.hitMine = true;
            this.gameEnded = true;
            logger.info(`Mine hit at position ${tileIndex} for user ${this.userId}`);
            return { success: true, hitMine: true, allCleared: false };
        }
        
        // Safe tile - add to revealed
        this.revealedTiles.push(tileIndex);
        
        // Check if all safe tiles are revealed
        const safeTilesCount = this.gridSize - this.mineCount;
        const allCleared = this.revealedTiles.length >= safeTilesCount;
        
        if (allCleared) {
            this.gameEnded = true;
            logger.info(`All safe tiles revealed for user ${this.userId}`);
        }
        
        return { success: true, hitMine: false, allCleared };
    }
    
    cashOut() {
        if (this.gameEnded) {
            return false;
        }
        
        this.cashedOut = true;
        this.gameEnded = true;
        logger.info(`User ${this.userId} cashed out with ${this.revealedTiles.length} tiles revealed`);
        return true;
    }
    
    flagTile(tileIndex) {
        if (this.revealedTiles.includes(tileIndex) || this.gameEnded) {
            return false;
        }
        
        const flagIndex = this.flaggedTiles.indexOf(tileIndex);
        if (flagIndex > -1) {
            // Unflag
            this.flaggedTiles.splice(flagIndex, 1);
        } else {
            // Flag
            this.flaggedTiles.push(tileIndex);
        }
        
        return true;
    }
    
    async getCurrentMultiplier() {
        if (this.revealedTiles.length === 0) {
            return 1.0;
        }
        
        const safeTilesCount = this.gridSize - this.mineCount;
        const revealedCount = this.revealedTiles.length;
        
        // Calculate multiplier based on revealed tiles and mine density
        // More mines = higher multiplier per safe tile revealed
        const baseMultiplier = 1.0;
        const mineRatio = this.mineCount / this.gridSize; // 0.19 for 3/16, 0.29 for 10/35, etc.
        
        // Progressive multiplier calculation
        let multiplier = baseMultiplier;
        
        for (let i = 1; i <= revealedCount; i++) {
            const remainingSafeTiles = safeTilesCount - i + 1;
            const remainingMines = this.mineCount;
            const remainingTiles = this.gridSize - i + 1;
            
            // Calculate probability of hitting a mine on next reveal
            const mineChance = remainingMines / remainingTiles;
            const safeChance = 1 - mineChance;
            
            // Increase multiplier based on risk (lower safe chance = higher multiplier)
            const riskMultiplier = 1 / safeChance;
            const adjustedRisk = Math.min(riskMultiplier, 2.0); // Cap risk multiplier to prevent explosion
            
            multiplier += (adjustedRisk - 1) * 0.5; // Gradual increase
        }
        
        // Apply house edge reduction
        multiplier = multiplier * (1 - this.houseEdge * 0.5); // Reduced house edge impact
        
        // Apply adaptive mechanics for wealthy players
        if (this.currentWealth && this.currentWealth > 10_000_000) {
            try {
                const adaptedConfig = await adaptiveGameMechanics.getAdaptedGameConfig('mines', this.userId, this.currentWealth, this.betAmount);
                if (adaptedConfig && adaptedConfig.adaptedWinChance) {
                    // Apply adaptive difficulty by reducing multipliers for wealthy players
                    const adaptationFactor = adaptedConfig.adaptedWinChance / adaptedConfig.baseWinChance;
                    multiplier = multiplier * adaptationFactor;
                    
                    logger.info(`Mines adaptive adjustment: ${multiplier.toFixed(2)}x → ${(multiplier * adaptationFactor).toFixed(2)}x (wealth-based)`);
                }
            } catch (error) {
                logger.error(`Mines adaptive mechanics error: ${error.message}`);
            }
        }
        
        // Cap at mode maximum
        return Math.min(multiplier, this.maxMultiplier);
    }
    
    getGridDisplay() {
        const gridRows = Math.sqrt(this.gridSize);
        let display = '```\n';
        
        for (let row = 0; row < gridRows; row++) {
            let rowStr = '';
            for (let col = 0; col < gridRows; col++) {
                const index = row * gridRows + col;
                
                if (this.revealedTiles.includes(index)) {
                    if (this.mines.includes(index)) {
                        rowStr += '💥 '; // Mine hit
                    } else {
                        rowStr += '💎 '; // Safe tile
                    }
                } else if (this.flaggedTiles.includes(index)) {
                    rowStr += '🚩 '; // Flagged
                } else {
                    rowStr += '⬜ '; // Unrevealed
                }
            }
            display += rowStr + '\n';
        }
        
        display += '```';
        return display;
    }
    
    getGridButtons() {
        const buttons = [];
        const gridRows = Math.sqrt(this.gridSize);
        
        for (let i = 0; i < this.gridSize; i++) {
            if (!this.revealedTiles.includes(i)) {
                buttons.push({
                    index: i,
                    label: (i + 1).toString(),
                    disabled: this.gameEnded
                });
            }
        }
        
        // Limit to first 20 buttons to stay within Discord limits
        return buttons.slice(0, 20);
    }
    
    async getStats() {
        const safeTilesCount = this.gridSize - this.mineCount;
        return {
            revealed: this.revealedTiles.length,
            safeSpots: safeTilesCount,
            mineCount: this.mineCount,
            currentMultiplier: await this.getCurrentMultiplier(),
            gameEnded: this.gameEnded,
            hitMine: this.hitMine,
            cashedOut: this.cashedOut
        };
    }
    
    // Debug method to reveal all mines (for testing only)
    revealAllMines() {
        return this.mines.map(mine => ({
            position: mine,
            row: Math.floor(mine / Math.sqrt(this.gridSize)),
            col: mine % Math.sqrt(this.gridSize)
        }));
    }
}

module.exports = {
    MinesGame
};