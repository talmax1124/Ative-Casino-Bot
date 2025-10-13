/**
 * UNIVERSAL GAME INTEGRATOR
 * Ensures all casino games use CSPRNG, bulletproof economy, and all security systems
 * This module provides standardized integration for ALL casino games
 */

const { secureRandomFloat, secureRandomInt, secureRandomBytes } = require('./rng');
const transparentPayoutManager = require('./transparentPayoutManager');
const securityLogger = require('./securityLogger');
const tuningManager = require('./tuningManager');
const sessionGuard = require('./sessionGuard');
const BulletproofEconomyController = require('../BULLETPROOF_ECONOMY/BulletproofEconomyController');
const logger = require('./logger');

// Singleton instance for shared bulletproof economy
let sharedBulletproofEconomy = null;
let economyInitialized = false;
let economyInitializing = false;

class UniversalGameIntegrator {
    constructor(gameName) {
        this.gameName = gameName;
        this.bulletproofEconomy = null;
        this.initialized = false;
        this.initializeBulletproofEconomy();
    }

    /**
     * Initialize bulletproof economy for this game (shared singleton)
     */
    async initializeBulletproofEconomy() {
        try {
            // Use shared instance to prevent multiple initializations
            if (economyInitialized) {
                this.bulletproofEconomy = sharedBulletproofEconomy;
                this.initialized = true;
                return;
            }

            if (economyInitializing) {
                // Wait for ongoing initialization
                while (economyInitializing) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                this.bulletproofEconomy = sharedBulletproofEconomy;
                this.initialized = true;
                return;
            }

            // First initialization
            if (!sharedBulletproofEconomy) {
                economyInitializing = true;
                sharedBulletproofEconomy = new BulletproofEconomyController();
                await sharedBulletproofEconomy.initialize();
                economyInitialized = true;
                economyInitializing = false;
                logger.info(`✅ Bulletproof Economy initialized (shared instance)`);
            }

            this.bulletproofEconomy = sharedBulletproofEconomy;
            this.initialized = true;
        } catch (error) {
            economyInitializing = false;
            logger.warn(`⚠️ ${this.gameName}: Bulletproof Economy initialization failed: ${error.message}`);
        }
    }

    /**
     * SECURE RANDOM NUMBER GENERATION
     * All games MUST use these functions instead of Math.random()
     */
    secureRandom() {
        return secureRandomFloat();
    }

    secureRandomInt(min, max) {
        return secureRandomInt(min, max);
    }

    secureRandomBytes(length) {
        return secureRandomBytes(length);
    }

    /**
     * Generate cryptographically secure random with house edge enforcement
     */
    generateSecureRandomWithEdge(houseEdge = 0.05, playerProfile = null) {
        const baseRandom = this.secureRandom();
        
        // Apply house edge adjustment
        let adjustedRandom = baseRandom * (1 - houseEdge);
        
        // Apply player-specific adjustments
        if (playerProfile) {
            if (playerProfile.riskLevel > 0.7) {
                adjustedRandom *= 0.95; // 5% reduction for high-risk players
            }
            if (playerProfile.historicalWinRate > 0.6) {
                adjustedRandom *= 0.9; // 10% reduction for high win rate players
            }
        }

        return Math.max(0, Math.min(1, adjustedRandom));
    }

    /**
     * Pre-game session check with all security systems
     */
    async checkGameSession(userId, guildId, gameType, betAmount) {
        // Enhanced session guard check
        const sessionCheck = await sessionGuard.check(userId, guildId, gameType);
        if (!sessionCheck.allowed) {
            return {
                allowed: false,
                reason: sessionCheck.code,
                message: sessionCheck.message
            };
        }

        // Security logging
        try {
            await securityLogger.logSecurityEvent(userId, 'GAME_BET', {
                game: gameType,
                amount: betAmount,
                timestamp: Date.now()
            });
        } catch (err) {
            logger.warn(`Security logging failed for ${gameType}: ${err.message}`);
        }

        return { allowed: true };
    }

    /**
     * Post-game result processing with bulletproof economy
     */
    async processGameResult(gameData) {
        const { userId, guildId, gameType, betAmount, originalPayout, won } = gameData;

        // Validate required parameters
        if (!userId) {
            logger.error(`Game result processing failed for ${gameType}: userId is not defined`);
            return {
                success: false,
                error: 'userId is not defined',
                originalPayout: originalPayout || 0,
                adjustedPayout: originalPayout || 0,
                finalPayout: originalPayout || 0
            };
        }

        if (!gameType) {
            logger.error(`Game result processing failed: gameType is not defined for user ${userId}`);
            return {
                success: false,
                error: 'gameType is not defined',
                originalPayout: originalPayout || 0,
                adjustedPayout: originalPayout || 0,
                finalPayout: originalPayout || 0
            };
        }

        try {
            // Log game result for security monitoring
            await securityLogger.logSecurityEvent(userId, won ? 'GAME_WIN' : 'GAME_LOSS', {
                game: gameType,
                amount: won ? originalPayout : betAmount,
                betAmount: betAmount,
                payoutRatio: won ? (originalPayout / betAmount) : 0,
                timestamp: Date.now()
            });

            // Process through bulletproof economy if available
            let adjustedPayout = originalPayout;
            if (this.bulletproofEconomy && won) {
                const economyResult = await this.bulletproofEconomy.adjustPostGamePayout({
                    gameType,
                    userId,
                    betAmount,
                    originalPayout,
                    won,
                    guildId
                });
                adjustedPayout = economyResult.adjustedPayout || originalPayout;
            }

            // Process through transparent payout manager
            const transparentResult = await transparentPayoutManager.processGamePayout({
                userId,
                guildId,
                gameType,
                betAmount,
                originalPayout: adjustedPayout,
                won
            });

            // Record for tuning manager
            await tuningManager.recordGameResult(userId, gameType, betAmount, adjustedPayout, won);

            return {
                success: true,
                originalPayout,
                adjustedPayout,
                finalPayout: transparentResult.finalPayout || adjustedPayout,
                economyAdjustments: this.bulletproofEconomy ? true : false
            };

        } catch (error) {
            logger.error(`Game result processing failed for ${gameType}: ${error.message}`);
            return {
                success: false,
                error: error.message,
                originalPayout,
                adjustedPayout: originalPayout,
                finalPayout: originalPayout
            };
        }
    }

    /**
     * Enhanced random distribution for game outcomes
     */
    generateGameOutcome(winProbability, houseEdge = 0.05, playerProfile = null) {
        // Apply house edge to win probability
        const adjustedWinProb = winProbability * (1 - houseEdge);
        
        // Apply player-specific adjustments
        let finalWinProb = adjustedWinProb;
        if (playerProfile) {
            // High-risk players get worse odds
            if (playerProfile.riskLevel > 0.7) {
                finalWinProb *= 0.9;
            }
            // High win rate players get worse odds
            if (playerProfile.historicalWinRate > 0.6) {
                finalWinProb *= 0.85;
            }
        }

        // Generate secure random outcome
        const randomValue = this.generateSecureRandomWithEdge(houseEdge, playerProfile);
        return randomValue < finalWinProb;
    }

    /**
     * Calculate payout with mathematical house edge enforcement
     */
    calculatePayout(betAmount, multiplier, won, houseEdge = 0.05) {
        if (!won) return 0;

        // Apply house edge to multiplier
        const adjustedMultiplier = multiplier * (1 - houseEdge);
        const basePayout = betAmount * adjustedMultiplier;

        // Ensure minimum house edge is maintained
        const impliedEdge = 1 - (basePayout / betAmount);
        if (impliedEdge < houseEdge) {
            // Force house edge compliance
            const correctedPayout = betAmount * (1 - houseEdge);
            return Math.max(0, correctedPayout);
        }

        return Math.floor(basePayout);
    }

    /**
     * Get comprehensive game statistics
     */
    getGameStats() {
        return {
            gameName: this.gameName,
            bulletproofEconomyActive: this.initialized,
            securityIntegrated: true,
            csprngEnabled: true,
            allSystemsIntegrated: this.initialized
        };
    }
}

module.exports = UniversalGameIntegrator;