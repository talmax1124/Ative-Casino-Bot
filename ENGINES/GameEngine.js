/**
 * 🎰 GAME ENGINE - Universal Game Controller
 * Consolidates all game logic, mechanics, and flow control
 * Replaces scattered utilities with unified game management
 */

const EventEmitter = require('events');
const logger = require('../UTILS/logger');
const { winLossValidator } = require('../UTILS/WinLossValidator');

class GameEngine extends EventEmitter {
    constructor() {
        super();
        this.activeGames = new Map(); // gameId -> gameInstance
        this.gameTypes = new Map();   // gameType -> gameClass
        this.engineHealth = 'INITIALIZING';
        this.stats = {
            gamesStarted: 0,
            gamesCompleted: 0,
            gamesErrored: 0,
            totalPayout: 0,
            totalBets: 0
        };
        
        // Lazy initialization flags
        this._engines = {};
        this._initialized = false;
        
        // Fast sync initialization for immediate use
        this.initializeBasicConfigs();
    }

    /**
     * Initialize basic configurations synchronously (fast startup)
     */
    initializeBasicConfigs() {
        try {
            // Initialize game configurations synchronously - this is fast
            this.gameConfigs = {
                blackjack: {
                    baseHouseEdge: 0.025,
                    baseWinRate: 0.49,
                    maxPayout: 2.45,
                    minBet: 100,
                    maxBet: Number.MAX_SAFE_INTEGER
                },
                slots: {
                    baseHouseEdge: 0.25,
                    baseWinRate: 0.40,
                    maxPayout: 50.0,
                    minBet: 50,
                    maxBet: Number.MAX_SAFE_INTEGER
                },
                roulette: {
                    baseHouseEdge: 0.027,
                    baseWinRate: 0.486,
                    maxPayout: 36.0,
                    minBet: 25,
                    maxBet: Number.MAX_SAFE_INTEGER
                },
                crash: {
                    baseHouseEdge: 0.03,
                    baseWinRate: 0.45,
                    maxPayout: 50.0,
                    minBet: 500,
                    maxBet: Number.MAX_SAFE_INTEGER
                },
                mines: {
                    baseHouseEdge: 0.035,
                    baseWinRate: 0.35,
                    maxPayout: 25.0,
                    minBet: 100,
                    maxBet: Number.MAX_SAFE_INTEGER
                },
                plinko: {
                    baseHouseEdge: 0.04,
                    baseWinRate: 0.40,
                    maxPayout: 100.0,
                    minBet: 100,
                    maxBet: Number.MAX_SAFE_INTEGER
                },
                bingo: {
                    baseHouseEdge: 0.10,
                    baseWinRate: 0.25,
                    maxPayout: 10.0,
                    minBet: 250,
                    maxBet: Number.MAX_SAFE_INTEGER
                },
                keno: {
                    baseHouseEdge: 0.30,
                    baseWinRate: 0.20,
                    maxPayout: 1000.0,
                    minBet: 100,
                    maxBet: Number.MAX_SAFE_INTEGER
                },
                scratch: {
                    baseHouseEdge: 0.20,
                    baseWinRate: 0.35,
                    maxPayout: 20.0,
                    minBet: 50,
                    maxBet: Number.MAX_SAFE_INTEGER
                },
                russianroulette: {
                    baseHouseEdge: 0.167,
                    baseWinRate: 0.833,
                    maxPayout: 6.0,
                    minBet: 100,
                    maxBet: Number.MAX_SAFE_INTEGER
                }
            };
            
            logger.info('🎰 GameEngine basic configs loaded');
            this.engineHealth = 'HEALTHY';
        } catch (error) {
            logger.error('❌ GameEngine basic config failed:', error);
            this.engineHealth = 'UNHEALTHY';
        }
    }

    /**
     * Initialize heavy components lazily when first needed
     */
    async ensureEnginesInitialized() {
        if (this._initialized) return;
        
        this._initialized = true;
        
        // Initialize engines asynchronously in parallel for speed
        const initPromises = [
            this.initializeUserEngine(),
            this.initializeSecurityEngine(),
            this.initializeEconomyEngine(),
            this.initializeDataEngine()
        ];
        
        await Promise.allSettled(initPromises);
        logger.info('🎰 GameEngine fully initialized');
    }

    async initializeUserEngine() {
        if (this._engines.user) return this._engines.user;
        
        try {
            const UserEngine = require('./UserEngine');
            this._engines.user = new UserEngine();
            if (this._engines.user.initialize) {
                await this._engines.user.initialize();
            }
        } catch (error) {
            logger.warn('UserEngine not available, using fallback');
            this._engines.user = this.createUserFallback();
        }
        
        return this._engines.user;
    }

    async initializeSecurityEngine() {
        if (this._engines.security) return this._engines.security;
        
        try {
            const SecurityEngine = require('./SecurityEngine');
            this._engines.security = new SecurityEngine();
            if (this._engines.security.initialize) {
                await this._engines.security.initialize();
            }
        } catch (error) {
            logger.warn('SecurityEngine not available, using fallback');
            this._engines.security = this.createSecurityFallback();
        }
        
        return this._engines.security;
    }

    async initializeEconomyEngine() {
        if (this._engines.economy) return this._engines.economy;
        
        try {
            const EconomyEngine = require('./EconomyEngine');
            this._engines.economy = new EconomyEngine();
            if (this._engines.economy.initialize) {
                await this._engines.economy.initialize();
            }
        } catch (error) {
            logger.warn('EconomyEngine not available, using fallback');
            this._engines.economy = this.createEconomyFallback();
        }
        
        return this._engines.economy;
    }

    async initializeDataEngine() {
        if (this._engines.data) return this._engines.data;
        
        try {
            const DataEngine = require('./DataEngine');
            this._engines.data = new DataEngine();
            if (this._engines.data.initialize) {
                await this._engines.data.initialize();
            }
        } catch (error) {
            logger.warn('DataEngine not available, using fallback');
            this._engines.data = this.createDataFallback();
        }
        
        return this._engines.data;
    }

    // Lazy getters for engines
    get userEngine() {
        if (!this._engines.user) {
            this._engines.user = this.createUserFallback();
        }
        return this._engines.user;
    }

    get securityEngine() {
        if (!this._engines.security) {
            this._engines.security = this.createSecurityFallback();
        }
        return this._engines.security;
    }

    get economyEngine() {
        if (!this._engines.economy) {
            this._engines.economy = this.createEconomyFallback();
        }
        return this._engines.economy;
    }

    get dataEngine() {
        if (!this._engines.data) {
            this._engines.data = this.createDataFallback();
        }
        return this._engines.data;
    }

    /**
     * 🎮 UNIVERSAL GAME START
     * Single entry point for all games
     */
    async startGame(gameType, userId, guildId, betAmount, gameOptions = {}) {
        try {
            // Ensure engines are initialized lazily (only when first game starts)
            await this.ensureEnginesInitialized();
            
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
            const gameSettings = await this.calculateGameSettings(gameType, userProfile, betAmount, gameOptions);
            
            // Create game session
            const gameSession = await this.createGameSession(gameId, gameType, userId, guildId, betAmount, gameSettings, gameOptions);
            
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
            
            // Validate the payout result to ensure no cheating
            const gameResult = {
                betAmount: gameSession.betAmount,
                payout: payoutResult.finalPayout,
                isWin: won,
                gameType: gameSession.gameType,
                userId: gameSession.userId,
                multiplier: payoutResult.multiplier,
                details: payoutResult
            };
            
            const validatedResult = winLossValidator.validateGameOutcome(gameResult);
            
            // Use validated payout
            const finalPayout = validatedResult.payout;
            
            // Update game session
            gameSession.outcome = { won, payout: finalPayout };
            gameSession.lastAction = Date.now();
            
            logger.debug(`🎲 Outcome generated for ${gameId}: won=${won}, payout=${finalPayout}${validatedResult.validationApplied ? ' (validated)' : ''}`);
            
            return {
                won,
                payout: finalPayout,
                multiplier: payoutResult.multiplier,
                adjustments: balanceAdjustments,
                details: { ...payoutResult, validationApplied: validatedResult.validationApplied }
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
        
        // Validate bet amount (only minimum bet, no maximum restriction)
        if (betAmount < config.minBet) {
            return { valid: false, reason: `Bet must be at least ${config.minBet}` };
        }
        
        // Skip balance check - original game logic handles this with PayoutManager
        // This allows for proper balance validation and deduction timing
        try {
            const userProfile = await this.userEngine.getUserProfile(userId, guildId);
            // Just get profile for analytics, don't validate balance here
        } catch (error) {
            // If user profile fails, just continue - original logic will handle user creation
            logger.debug(`GameEngine: Could not get user profile for ${userId}, continuing with original logic`);
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
     * ⚙️ CALCULATE GAME SETTINGS
     * Calculate dynamic game settings based on user profile and game type
     */
    async calculateGameSettings(gameType, userProfile, betAmount, gameOptions = {}) {
        const config = this.gameConfigs[gameType];
        if (!config) {
            throw new Error(`Unsupported game type: ${gameType}`);
        }

        // Get balance tier from userEngine
        const balanceTier = this.userEngine.getBalanceTier ? 
            this.userEngine.getBalanceTier(userProfile.totalBalance) : 'NORMAL';

        // Calculate balance-based adjustments
        const adjustments = await this.calculateBalanceAdjustments({
            gameType,
            userId: userProfile.userId,
            guildId: userProfile.guildId,
            betAmount
        });

        // Merge with game options
        const gameSettings = {
            gameType,
            betAmount,
            baseWinRate: config.baseWinRate,
            maxPayout: config.maxPayout,
            minBet: config.minBet,
            maxBet: config.maxBet,
            houseEdge: config.baseHouseEdge,
            tier: balanceTier,
            adjustedWinRate: adjustments.adjustedWinRate,
            adjustedPayout: adjustments.adjustedPayout,
            adjustedHouseEdge: adjustments.adjustedHouseEdge,
            offEconomy: adjustments.offEconomy,
            ...gameOptions
        };

        logger.debug(`Game settings calculated for ${gameType}: tier=${balanceTier}, winRate=${adjustments.adjustedWinRate}`);
        
        return gameSettings;
    }

    /**
     * 🎮 CREATE GAME SESSION
     * Create a new game session with all necessary data
     */
    async createGameSession(gameId, gameType, userId, guildId, betAmount, gameSettings, gameOptions = {}) {
        const session = {
            gameId,
            gameType,
            userId,
            guildId,
            betAmount,
            settings: gameSettings,
            options: gameOptions,
            startTime: Date.now(),
            lastAction: Date.now(),
            status: 'active',
            outcome: null,
            metadata: {
                userAgent: 'GameEngine',
                version: '1.0.0',
                ...gameOptions
            }
        };

        logger.debug(`Game session created: ${gameId} for ${gameType}`);
        
        return session;
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
            checkUserSecurity: async () => ({ allowed: true, status: 'SAFE', riskLevel: 'LOW' }),
            checkGameSecurity: async () => ({ allowed: true, status: 'SAFE' }),
            updateActivity: () => true,
            logGameEnd: async () => true,
            isHealthy: () => true
        };
    }

    createUserFallback() {
        return {
            getUserProfile: async (userId, guildId) => ({
                userId,
                guildId,
                totalBalance: 10000,
                availableBalance: 10000,
                tier: 'NORMAL',
                offEconomy: false,
                gameStats: {
                    totalGames: 50,
                    totalWins: 25,
                    totalWagered: 50000,
                    totalWinnings: 25000
                },
                achievements: [],
                personalization: { theme: 'default' }
            }),
            getBalanceTier: (balance) => {
                if (balance < 1000) return 'ULTRA_LOW';
                if (balance < 10000) return 'LOW';
                if (balance < 100000) return 'NORMAL';
                if (balance < 1000000) return 'HIGH';
                if (balance < 10000000) return 'VERY_HIGH';
                if (balance < 100000000) return 'ULTRA_HIGH';
                return 'MEGA_WHALE';
            },
            updateUserProfile: async () => true,
            updateGameStats: async () => true,
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