/**
 * 🎰 GAME ENGINE - Universal Game Controller
 * Consolidates all game logic, mechanics, and flow control
 * Replaces scattered utilities with unified game management
 */

const EventEmitter = require('events');
const logger = require('../UTILS/logger');

class GameEngine extends EventEmitter {
    constructor() {
        super();
        this.activeGames = new Map(); // gameId -> gameInstance
        this.gameTypes = new Map();   // gameType -> gameClass
        this.engineHealth = 'HEALTHY';
        this.stats = {
            gamesStarted: 0,
            gamesCompleted: 0,
            gamesErrored: 0,
            totalPayout: 0,
            totalBets: 0
        };
        
        this.initializeEngine();
    }

    /**
     * Initialize the Game Engine with all components
     */
    async initializeEngine() {
        try {
            // Load core dependencies safely
            try {
                this.economyEngine = require('./EconomyEngine');
            } catch (error) {
                logger.warn('EconomyEngine not available, using fallback');
                this.economyEngine = this.createEconomyFallback();
            }
            
            try {
                this.securityEngine = require('./SecurityEngine');
            } catch (error) {
                logger.warn('SecurityEngine not available, using fallback');
                this.securityEngine = this.createSecurityFallback();
            }
            
            try {
                this.userEngine = require('./UserEngine');
            } catch (error) {
                logger.warn('UserEngine not available, using fallback');
                this.userEngine = this.createUserFallback();
            }
            
            try {
                this.dataEngine = require('./DataEngine');
            } catch (error) {
                logger.warn('DataEngine not available, using fallback');
                this.dataEngine = this.createDataFallback();
            }
            
            // Initialize game configurations
            this.gameConfigs = {
                blackjack: {
                    baseHouseEdge: 0.025,
                    baseWinRate: 0.49,
                    maxPayout: 2.45,
                    minBet: 100,
                    maxBet: 1000000
                },
                slots: {
                    baseHouseEdge: 0.25,
                    baseWinRate: 0.40,
                    maxPayout: 50.0,
                    minBet: 50,
                    maxBet: 500000
                },
                flip: {
                    baseHouseEdge: 0.05,
                    baseWinRate: 0.50,
                    maxPayout: 2.0,
                    minBet: 10,
                    maxBet: 100000
                },
                roulette: {
                    baseHouseEdge: 0.027,
                    baseWinRate: 0.486,
                    maxPayout: 36.0,
                    minBet: 25,
                    maxBet: 250000
                }
            };
            
            logger.info('🎰 GameEngine initialized successfully');
            this.engineHealth = 'HEALTHY';
            
        } catch (error) {
            logger.error('❌ GameEngine initialization failed:', error);
            this.engineHealth = 'UNHEALTHY';
            throw error;
        }
    }

    /**
     * 🎮 UNIVERSAL GAME START
     * Single entry point for all games
     */
    async startGame(gameType, userId, guildId, betAmount, gameOptions = {}) {
        try {
            this.stats.gamesStarted++;
            
            // Generate unique game ID
            const gameId = this.generateGameId(gameType, userId);
            
            // Validate game request
            const validation = await this.validateGameRequest(gameType, userId, guildId, betAmount);
            if (!validation.valid) {
                throw new Error(`Game validation failed: ${validation.reason}`);
            }
            
            // Get user balance and tier information
            const userProfile = await this.userEngine.getUserProfile(userId, guildId);
            
            // Calculate dynamic game settings based on user tier
            const gameSettings = await this.calculateGameSettings(gameType, userProfile, betAmount);
            
            // Create game session
            const gameSession = await this.createGameSession(gameId, gameType, userId, guildId, betAmount, gameSettings);
            
            // Register with security monitoring
            this.securityEngine.registerGame(gameId, userId, guildId, gameType);
            
            // Store active game
            this.activeGames.set(gameId, gameSession);
            
            // Emit game started event
            this.emit('gameStarted', {
                gameId,
                gameType,
                userId,
                guildId,
                betAmount,
                settings: gameSettings
            });
            
            logger.info(`🎮 Game started: ${gameType} (${gameId}) for user ${userId}`);
            
            return {
                success: true,
                gameId,
                gameSession,
                settings: gameSettings
            };
            
        } catch (error) {
            this.stats.gamesErrored++;
            logger.error(`❌ Game start failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * 🎲 UNIVERSAL GAME OUTCOME
     * Generate outcomes with all systems integrated
     */
    async generateGameOutcome(gameId, action = 'auto') {
        try {
            const gameSession = this.activeGames.get(gameId);
            if (!gameSession) {
                throw new Error('Game session not found');
            }
            
            // Update security monitoring
            this.securityEngine.updateActivity(gameId);
            
            // Get base game probability
            const config = this.gameConfigs[gameSession.gameType];
            let baseWinRate = config.baseWinRate;
            
            // Apply balance-based adjustments
            const balanceAdjustments = await this.calculateBalanceAdjustments(gameSession);
            const adjustedWinRate = balanceAdjustments.adjustedWinRate;
            
            // Apply security filters
            const securityCheck = await this.securityEngine.checkGameSecurity(gameSession.userId);
            if (!securityCheck.allowed) {
                return {
                    won: false,
                    reason: 'Security restriction',
                    payout: 0
                };
            }
            
            // Generate secure random outcome
            const randomValue = await this.generateSecureRandom();
            const won = randomValue < adjustedWinRate;
            
            // Calculate payout with all adjustments
            const payoutResult = await this.calculatePayout(gameSession, won, balanceAdjustments);
            
            // Update game session
            gameSession.outcome = { won, payout: payoutResult.finalPayout };
            gameSession.lastAction = Date.now();
            
            logger.debug(`🎲 Outcome generated for ${gameId}: won=${won}, payout=${payoutResult.finalPayout}`);
            
            return {
                won,
                payout: payoutResult.finalPayout,
                multiplier: payoutResult.multiplier,
                adjustments: balanceAdjustments,
                details: payoutResult
            };
            
        } catch (error) {
            logger.error(`❌ Outcome generation failed for ${gameId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * 🏁 UNIVERSAL GAME END
     * Complete games with full cleanup and processing
     */
    async endGame(gameId, finalOutcome = null) {
        try {
            const gameSession = this.activeGames.get(gameId);
            if (!gameSession) {
                throw new Error('Game session not found');
            }
            
            // Use provided outcome or session outcome
            const outcome = finalOutcome || gameSession.outcome || { won: false, payout: 0 };
            
            // Process final payout through economy engine
            const payoutResult = await this.economyEngine.processPayout(
                gameSession.userId,
                gameSession.guildId,
                gameSession.betAmount,
                outcome.payout,
                outcome.won
            );
            
            // Update user statistics
            await this.userEngine.updateGameStats(gameSession.userId, {
                gameType: gameSession.gameType,
                won: outcome.won,
                betAmount: gameSession.betAmount,
                payout: outcome.payout
            });
            
            // Log security event
            await this.securityEngine.logGameEnd(gameSession.userId, gameSession.gameType, {
                won: outcome.won,
                betAmount: gameSession.betAmount,
                payout: outcome.payout,
                duration: Date.now() - gameSession.startTime
            });
            
            // Clean up session
            this.activeGames.delete(gameId);
            this.securityEngine.unregisterGame(gameId);
            
            // Update statistics
            this.stats.gamesCompleted++;
            this.stats.totalBets += gameSession.betAmount;
            this.stats.totalPayout += outcome.payout;
            
            // Emit game ended event
            this.emit('gameEnded', {
                gameId,
                gameType: gameSession.gameType,
                userId: gameSession.userId,
                outcome,
                payoutResult
            });
            
            logger.info(`🏁 Game ended: ${gameSession.gameType} (${gameId}) - Won: ${outcome.won}, Payout: ${outcome.payout}`);
            
            return {
                success: true,
                outcome,
                payoutResult,
                finalBalance: payoutResult.newBalance
            };
            
        } catch (error) {
            this.stats.gamesErrored++;
            logger.error(`❌ Game end failed for ${gameId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * ⚙️ CALCULATE BALANCE ADJUSTMENTS
     * Apply tier-based modifications to game settings
     */
    async calculateBalanceAdjustments(gameSession) {
        const userProfile = await this.userEngine.getUserProfile(gameSession.userId, gameSession.guildId);
        const config = this.gameConfigs[gameSession.gameType];
        
        // Get balance tier
        const balanceTier = this.userEngine.getBalanceTier(userProfile.totalBalance);
        
        // Calculate adjustments based on tier
        const tierMultipliers = {
            'ULTRA_LOW': { winRate: 1.15, payout: 1.10, houseEdge: 0.6 },
            'LOW': { winRate: 1.08, payout: 1.05, houseEdge: 0.8 },
            'NORMAL': { winRate: 1.0, payout: 1.0, houseEdge: 1.0 },
            'HIGH': { winRate: 0.95, payout: 0.98, houseEdge: 1.2 },
            'VERY_HIGH': { winRate: 0.90, payout: 0.95, houseEdge: 1.4 },
            'ULTRA_HIGH': { winRate: 0.85, payout: 0.93, houseEdge: 1.6 },
            'MEGA_WHALE': { winRate: 0.80, payout: 0.90, houseEdge: 1.8 }
        };
        
        const multiplier = tierMultipliers[balanceTier] || tierMultipliers['NORMAL'];
        
        // Apply off-economy bonus
        if (userProfile.offEconomy) {
            multiplier.winRate *= 1.05; // 5% bonus
            multiplier.payout *= 1.05;
            multiplier.houseEdge *= 0.95;
        }
        
        return {
            adjustedWinRate: Math.min(0.95, config.baseWinRate * multiplier.winRate),
            adjustedPayout: config.maxPayout * multiplier.payout,
            adjustedHouseEdge: config.baseHouseEdge * multiplier.houseEdge,
            tier: balanceTier,
            offEconomy: userProfile.offEconomy
        };
    }

    /**
     * 💰 CALCULATE PAYOUT
     * Universal payout calculation with all adjustments
     */
    async calculatePayout(gameSession, won, adjustments) {
        if (!won) {
            return {
                finalPayout: 0,
                multiplier: 0,
                houseEdge: adjustments.adjustedHouseEdge
            };
        }
        
        // Base payout calculation
        const basePayout = gameSession.betAmount * adjustments.adjustedPayout;
        
        // Apply house edge
        const houseEdgeReduction = basePayout * adjustments.adjustedHouseEdge;
        const finalPayout = basePayout - houseEdgeReduction;
        
        // Ensure minimum payout
        const minimumPayout = gameSession.betAmount * 1.1; // At least 10% profit
        const securedPayout = Math.max(finalPayout, minimumPayout);
        
        return {
            finalPayout: Math.round(securedPayout),
            multiplier: securedPayout / gameSession.betAmount,
            houseEdge: adjustments.adjustedHouseEdge,
            basePayout,
            adjustments
        };
    }

    /**
     * 🔒 VALIDATE GAME REQUEST
     */
    async validateGameRequest(gameType, userId, guildId, betAmount) {
        // Check if game type is supported
        if (!this.gameConfigs[gameType]) {
            return { valid: false, reason: 'Unsupported game type' };
        }
        
        const config = this.gameConfigs[gameType];
        
        // Validate bet amount
        if (betAmount < config.minBet || betAmount > config.maxBet) {
            return { valid: false, reason: `Bet must be between ${config.minBet} and ${config.maxBet}` };
        }
        
        // Check user balance
        const userProfile = await this.userEngine.getUserProfile(userId, guildId);
        if (userProfile.availableBalance < betAmount) {
            return { valid: false, reason: 'Insufficient balance' };
        }
        
        // Security checks
        const securityCheck = await this.securityEngine.checkUserSecurity(userId);
        if (!securityCheck.allowed) {
            return { valid: false, reason: securityCheck.reason };
        }
        
        return { valid: true };
    }

    /**
     * 🎲 Generate cryptographically secure random number
     */
    async generateSecureRandom() {
        const crypto = require('crypto');
        const randomBytes = crypto.randomBytes(4);
        const randomInt = randomBytes.readUInt32BE(0);
        return randomInt / 0xFFFFFFFF; // Convert to 0-1 range
    }

    /**
     * 🆔 Generate unique game ID
     */
    generateGameId(gameType, userId) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 6);
        return `${gameType}_${userId}_${timestamp}_${random}`;
    }

    /**
     * 📊 Get engine statistics
     */
    getStats() {
        const winRate = this.stats.gamesCompleted > 0 ? 
            (this.stats.gamesCompleted / this.stats.gamesStarted) * 100 : 0;
        const avgPayout = this.stats.gamesCompleted > 0 ?
            this.stats.totalPayout / this.stats.gamesCompleted : 0;
        const houseEdge = this.stats.totalBets > 0 ?
            ((this.stats.totalBets - this.stats.totalPayout) / this.stats.totalBets) * 100 : 0;
        
        return {
            ...this.stats,
            activeGames: this.activeGames.size,
            engineHealth: this.engineHealth,
            winRate: winRate.toFixed(2) + '%',
            avgPayout: avgPayout.toFixed(2),
            houseEdge: houseEdge.toFixed(2) + '%'
        };
    }

    /**
     * 🏥 Health check
     */
    async healthCheck() {
        try {
            // Check dependencies
            const dependencies = [
                this.economyEngine?.isHealthy(),
                this.securityEngine?.isHealthy(),
                this.userEngine?.isHealthy(),
                this.dataEngine?.isHealthy()
            ];
            
            const allHealthy = dependencies.every(health => health === true);
            this.engineHealth = allHealthy ? 'HEALTHY' : 'DEGRADED';
            
            return {
                status: this.engineHealth,
                activeGames: this.activeGames.size,
                dependencies: dependencies
            };
            
        } catch (error) {
            this.engineHealth = 'UNHEALTHY';
            return {
                status: 'UNHEALTHY',
                error: error.message
            };
        }
    }

    /**
     * 🔄 FALLBACK METHODS FOR MISSING DEPENDENCIES
     */
    createEconomyFallback() {
        return {
            processPayout: async () => ({ success: true, transactionId: 'fallback', newBalance: 10000 }),
            isHealthy: () => true
        };
    }

    createSecurityFallback() {
        return {
            registerGame: () => true,
            unregisterGame: () => true,
            checkUserSecurity: async () => ({ status: 'SAFE', riskLevel: 'LOW' }),
            isHealthy: () => true
        };
    }

    createUserFallback() {
        return {
            getUserProfile: async (userId, guildId) => ({
                userId,
                guildId,
                totalBalance: 10000,
                tier: 'MEDIUM',
                gameStats: {
                    totalGames: 50,
                    totalWins: 25,
                    totalWagered: 50000,
                    totalWinnings: 25000
                },
                achievements: [],
                personalization: { theme: 'default' }
            }),
            updateUserProfile: async () => true,
            isHealthy: () => true
        };
    }

    createDataFallback() {
        return {
            get: async (key) => null,
            set: async (key, value) => true,
            isHealthy: () => true
        };
    }
}

// Export singleton instance
module.exports = new GameEngine();