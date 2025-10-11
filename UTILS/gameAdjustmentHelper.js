/**
 * GAME ADJUSTMENT HELPER - Easy integration for games
 * 
 * This module provides simple functions that games can use to:
 * - Check if a player should win or lose
 * - Adjust payouts based on patterns
 * - Apply house edge dynamically
 * - Control game difficulty
 */

const trendIntegration = require('./trendAnalyzerIntegration');
const logger = require('./logger');
const { secureRandomFloat } = require('./rng');

class GameAdjustmentHelper {
    /**
     * Determine if a player should win based on adjusted win rate
     * @param {string} userId - Player ID
     * @param {string} gameType - Type of game
     * @param {number} baseChance - Base chance to win (0-1)
     * @returns {boolean} Whether the player should win
     */
    static async shouldPlayerWin(userId, gameType, baseChance = 0.5) {
        try {
            // Get adjusted win rate based on patterns
            const adjustedWinRate = await trendIntegration.getAdjustedWinRate(userId, gameType, baseChance);
            
            // Generate random number
            const random = secureRandomFloat();
            
            // Player wins if random is below adjusted win rate
            const shouldWin = random < adjustedWinRate;
            
            // Log significant adjustments
            if (Math.abs(adjustedWinRate - baseChance) > 0.1) {
                logger.debug(`🎲 Win chance adjusted for ${userId} in ${gameType}: ${(baseChance * 100).toFixed(1)}% → ${(adjustedWinRate * 100).toFixed(1)}%`);
            }
            
            return shouldWin;
            
        } catch (error) {
            logger.error(`Error in shouldPlayerWin: ${error.message}`);
            // Fallback to base chance
            return secureRandomFloat() < baseChance;
        }
    }
    
    /**
     * Adjust a payout based on house edge and patterns
     * @param {string} userId - Player ID
     * @param {string} gameType - Type of game
     * @param {number} basePayout - Original payout amount
     * @param {Object} patterns - Detected patterns (optional)
     * @returns {number} Adjusted payout
     */
    static async adjustPayout(userId, gameType, basePayout, patterns = null) {
        try {
            // Don't adjust zero payouts (losses)
            if (basePayout <= 0) return basePayout;
            
            // Get house edge adjustment
            const houseEdge = await trendIntegration.getAdjustedHouseEdge(userId, gameType, patterns);
            
            // Apply house edge to payout
            const adjustedPayout = Math.floor(basePayout * (1 - houseEdge));
            
            // Log significant adjustments
            if (houseEdge > 0.05) {
                const reduction = basePayout - adjustedPayout;
                logger.info(`💰 Payout adjusted for ${userId}: ${basePayout} → ${adjustedPayout} (-${reduction}, ${(houseEdge * 100).toFixed(1)}% edge)`);
            }
            
            return adjustedPayout;
            
        } catch (error) {
            logger.error(`Error in adjustPayout: ${error.message}`);
            return basePayout;
        }
    }
    
    /**
     * Adjust a multiplier based on patterns
     * @param {string} userId - Player ID
     * @param {string} gameType - Type of game
     * @param {number} baseMultiplier - Original multiplier
     * @param {Object} patterns - Detected patterns (optional)
     * @returns {number} Adjusted multiplier
     */
    static async adjustMultiplier(userId, gameType, baseMultiplier, patterns = null) {
        try {
            const adjustedMultiplier = await trendIntegration.calculateMultiplierAdjustment(
                userId, gameType, baseMultiplier, patterns
            );
            
            return adjustedMultiplier;
            
        } catch (error) {
            logger.error(`Error in adjustMultiplier: ${error.message}`);
            return baseMultiplier;
        }
    }
    
    /**
     * Check and apply outcome adjustment
     * @param {string} userId - Player ID
     * @param {string} gameType - Type of game
     * @param {Object} outcome - Original game outcome
     * @returns {Object} Potentially adjusted outcome
     */
    static async checkOutcomeAdjustment(userId, gameType, outcome) {
        try {
            // Report the choice first
            if (outcome.choice) {
                await trendIntegration.reportPlayerChoice(userId, gameType, outcome.choice, {
                    betAmount: outcome.betAmount,
                    won: outcome.won
                });
            }
            
            // Apply outcome adjustment
            const adjustedOutcome = await trendIntegration.applyOutcomeAdjustment(userId, gameType, outcome);
            
            // Update player profile
            await trendIntegration.updatePlayerProfile(userId, {
                gameType,
                betAmount: outcome.betAmount,
                payout: adjustedOutcome.payout,
                won: adjustedOutcome.won
            });
            
            return adjustedOutcome;
            
        } catch (error) {
            logger.error(`Error in checkOutcomeAdjustment: ${error.message}`);
            return outcome;
        }
    }
    
    /**
     * Get difficulty adjustment for skill-based games
     * @param {string} userId - Player ID
     * @param {string} gameType - Type of game
     * @returns {Object} Difficulty adjustments
     */
    static async getDifficultyAdjustment(userId, gameType) {
        try {
            const report = await trendIntegration.getPlayerReport(userId);
            
            if (!report) {
                return {
                    difficulty: 'normal',
                    speedMultiplier: 1.0,
                    accuracyRequirement: 0.5,
                    handicap: 0
                };
            }
            
            // Adjust difficulty based on skill level
            switch (report.skillLevel) {
                case 'exploiter':
                    return {
                        difficulty: 'extreme',
                        speedMultiplier: 1.5,    // 50% faster
                        accuracyRequirement: 0.9, // 90% accuracy needed
                        handicap: 0.3            // 30% handicap
                    };
                    
                case 'expert':
                    return {
                        difficulty: 'hard',
                        speedMultiplier: 1.3,
                        accuracyRequirement: 0.75,
                        handicap: 0.15
                    };
                    
                case 'intermediate':
                    return {
                        difficulty: 'medium',
                        speedMultiplier: 1.1,
                        accuracyRequirement: 0.6,
                        handicap: 0.05
                    };
                    
                default:
                    return {
                        difficulty: 'normal',
                        speedMultiplier: 1.0,
                        accuracyRequirement: 0.5,
                        handicap: 0
                    };
            }
            
        } catch (error) {
            logger.error(`Error in getDifficultyAdjustment: ${error.message}`);
            return {
                difficulty: 'normal',
                speedMultiplier: 1.0,
                accuracyRequirement: 0.5,
                handicap: 0
            };
        }
    }
    
    /**
     * Apply pattern detection to recent choices
     * @param {string} userId - Player ID
     * @param {string} gameType - Type of game
     * @param {Array} recentChoices - Array of recent player choices
     * @returns {Object} Detected patterns
     */
    static async detectPatterns(userId, gameType, recentChoices) {
        try {
            const analyzer = trendIntegration.getTrendAnalyzer();
            
            const patterns = {
                sequential: analyzer.detectPatternWithCache(gameType, recentChoices, 'sequential'),
                cyclic: analyzer.detectPatternWithCache(gameType, recentChoices, 'cyclic'),
                clustering: analyzer.detectPatternWithCache(gameType, recentChoices, 'clustering'),
                markov: analyzer.detectPatternWithCache(gameType, recentChoices, 'markov')
            };
            
            // Filter out non-detected patterns
            const detectedPatterns = {};
            for (const [type, data] of Object.entries(patterns)) {
                if (data.detected) {
                    detectedPatterns[type] = data;
                }
            }
            
            // Log if patterns detected
            if (Object.keys(detectedPatterns).length > 0) {
                logger.info(`🔍 Patterns detected for ${userId} in ${gameType}: ${Object.keys(detectedPatterns).join(', ')}`);
            }
            
            return detectedPatterns;
            
        } catch (error) {
            logger.error(`Error in detectPatterns: ${error.message}`);
            return {};
        }
    }
    
    /**
     * Check if a player is flagged as suspicious
     * @param {string} userId - Player ID
     * @returns {boolean} Whether the player is suspicious
     */
    static async isSuspicious(userId) {
        try {
            const report = await trendIntegration.getPlayerReport(userId);
            return report?.suspiciousActivity || false;
            
        } catch (error) {
            logger.error(`Error checking suspicious status: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Get recommended action for a player
     * @param {string} userId - Player ID
     * @returns {Object} Recommended actions
     */
    static async getRecommendedAction(userId) {
        try {
            const report = await trendIntegration.getPlayerReport(userId);
            
            if (!report) {
                return { action: 'allow', restrictions: [] };
            }
            
            const action = {
                action: 'allow',
                restrictions: [],
                adjustments: {}
            };
            
            // Check recommendations
            if (report.recommendations) {
                for (const rec of report.recommendations) {
                    if (rec.includes('BLOCK')) {
                        action.action = 'block';
                        action.reason = rec;
                    } else if (rec.includes('LIMIT')) {
                        // DO NOT APPLY BET LIMITS - REMOVE THIS RESTRICTION
                        // action.restrictions.push('bet_limit');
                        // action.adjustments.maxBet = Infinity;
                    } else if (rec.includes('MONITOR')) {
                        action.restrictions.push('monitoring');
                    }
                }
            }
            
            // Add adjustments based on skill level
            if (report.skillLevel === 'exploiter') {
                action.adjustments.winRate = 0.2;     // 20% max win rate
                action.adjustments.houseEdge = 0.35;  // 35% house edge
            } else if (report.skillLevel === 'expert') {
                action.adjustments.winRate = 0.38;    // 38% win rate
                action.adjustments.houseEdge = 0.15;  // 15% house edge
            }
            
            return action;
            
        } catch (error) {
            logger.error(`Error getting recommended action: ${error.message}`);
            return { action: 'allow', restrictions: [] };
        }
    }
}

module.exports = GameAdjustmentHelper;