/**
 * Dynamic Game Personalizer - Per-Player Game Mechanics Modification
 * Automatically adjusts payout tables, multipliers, odds, and probabilities for each player
 * Based on wealth level, AI analysis, and behavioral patterns
 */

const dbManager = require('./database');
const wealthCeiling = require('./wealthCeiling');
const gameAITracker = require('./gameAITracker');
const logger = require('./logger');

class DynamicGamePersonalizer {
    constructor() {
        // Base game configurations that will be modified per player
        this.baseGameConfigs = {
            blackjack: {
                basePayout: { blackjack: 2.5, win: 2.0, push: 1.0 },
                baseOdds: { dealerBustChance: 0.28, playerAdvantage: 0.005 }
            },
            slots: {
                basePayout: { 
                    cherries: 1.5, lemon: 2.0, orange: 2.5, grapes: 3.0, watermelon: 4.0,
                    bar: 6.0, seven: 10.0, diamond: 25.0, buffalo: 100.0, jackpot: 500.0
                },
                baseOdds: { jackpotChance: 0.0001, smallWinChance: 0.25 }
            },
            'multi-slots': {
                basePayout: { 
                    cherries: 2.0, lemon: 2.5, orange: 3.0, grapes: 4.0, watermelon: 5.0,
                    bar: 6.0, seven: 12.0, diamond: 30.0, buffalo: 150.0, jackpot: 1000.0
                },
                baseOdds: { jackpotChance: 0.0001, matrixBonusChance: 0.05 }
            },
            roulette: {
                basePayout: { straight: 35, split: 17, street: 11, corner: 8, line: 5, dozen: 2.2, evenOdd: 2.0 },
                baseOdds: { houseEdge: 0.0526 }
            },
            crash: {
                basePayout: { minMultiplier: 1.01, maxMultiplier: 15.0 },
                baseOdds: { averageCrashPoint: 2.0, volatility: 0.15 }
            },
            plinko: {
                basePayout: { center: 10.0, nearCenter: 5.0, edge: 2.0, sides: 0.5 },
                baseOdds: { centerHitChance: 0.02, highPayoutChance: 0.15 }
            },
            treasurevault: {
                basePayout: { bronze: 1.2, silver: 1.8, gold: 2.5, platinum: 3.5, diamond: 5.0 },
                baseOdds: { diamondChance: 0.01, goldChance: 0.1 }
            },
            keno: {
                basePayout: { match1: 1.0, match2: 2.0, match3: 5.0, match4: 12.0, match5: 25.0, match6: 50.0 },
                baseOdds: { baseHitChance: 0.25 }
            },
            ceelo: {
                basePayout: { win: 2.0, push: 1.0 },
                baseOdds: { playerAdvantage: 0.0 }
            },
            russianroulette: {
                basePayout: { survive: 6.0 },
                baseOdds: { surviveChance: 0.833 } // 5/6 chambers empty
            }
        };

        // Player-specific modification cache
        this.playerConfigs = new Map();
        this.configCache = new Map(); // Cache personalized configs for performance
    }

    /**
     * Get personalized game configuration for a specific player
     * @param {string} userId - User ID
     * @param {string} gameType - Game type
     * @param {object} aiTracking - AI tracking data from validation
     * @returns {Promise<object>} Personalized game configuration
     */
    async getPersonalizedGameConfig(userId, gameType, aiTracking = null) {
        const cacheKey = `${userId}_${gameType}`;
        
        // Check cache (valid for 5 minutes)
        const cached = this.configCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < 300000) {
            return cached.config;
        }

        try {
            // Get player data
            const balance = await dbManager.getUserBalance(userId);
            const totalWealth = balance.wallet + balance.bank;
            const wealthData = await wealthCeiling.getWealthMultiplierReduction(userId);

            // Get base configuration for the game
            const baseConfig = this.baseGameConfigs[gameType.toLowerCase()];
            if (!baseConfig) {
                logger.warn(`No base configuration found for game type: ${gameType}`);
                return null;
            }

            // Calculate personalization factors
            const personalizationFactors = await this.calculatePersonalizationFactors(
                userId, totalWealth, wealthData, aiTracking
            );

            // Create personalized configuration
            const personalizedConfig = this.applyPersonalization(
                baseConfig, personalizationFactors, gameType
            );

            // Add metadata
            personalizedConfig.metadata = {
                userId,
                gameType,
                totalWealth,
                wealthTier: wealthData.milestone,
                personalizationLevel: personalizationFactors.overallReduction,
                timestamp: Date.now(),
                factors: personalizationFactors
            };

            // Cache the configuration
            this.configCache.set(cacheKey, {
                config: personalizedConfig,
                timestamp: Date.now()
            });

            // Log significant personalizations
            if (personalizationFactors.overallReduction > 0.3) {
                logger.warn(`🎮 HEAVY PERSONALIZATION: ${userId} - ${gameType} - ${(personalizationFactors.overallReduction * 100).toFixed(1)}% reduction applied`);
            }

            return personalizedConfig;

        } catch (error) {
            logger.error(`Failed to create personalized config for ${userId} - ${gameType}: ${error.message}`);
            return this.baseGameConfigs[gameType.toLowerCase()] || null;
        }
    }

    /**
     * Calculate personalization factors based on player characteristics
     * @private
     */
    async calculatePersonalizationFactors(userId, totalWealth, wealthData, aiTracking) {
        const factors = {
            wealthReduction: wealthData.reduction || 0,
            aiReduction: 0,
            behaviorReduction: 0,
            suspicionReduction: 0,
            overallReduction: 0,
            oddsAdjustment: 0,
            reasons: []
        };

        // Wealth-based factors (primary driver)
        if (wealthData.reduction > 0) {
            factors.reasons.push(`Wealth tier: ${wealthData.milestone}`);
        }

        // AI tracking factors
        if (aiTracking?.aiAdjustments) {
            const aiAdjustment = aiTracking.aiAdjustments.multiplierAdjustment;
            if (aiAdjustment < 1.0) {
                factors.aiReduction = 1 - aiAdjustment;
                factors.reasons.push(`AI flags: ${aiTracking.aiAdjustments.flags.join(', ')}`);
            }
        }

        // Behavioral analysis (check player patterns)
        // This would normally check win rates, play patterns, etc.
        const behaviorAnalysis = await this.analyzePlayerBehavior(userId);
        if (behaviorAnalysis.suspicious) {
            factors.behaviorReduction = behaviorAnalysis.reductionFactor;
            factors.reasons.push(`Behavior: ${behaviorAnalysis.reasons.join(', ')}`);
        }

        // Calculate overall reduction (compound the effects)
        factors.overallReduction = Math.min(0.95, // Never exceed 95% reduction
            factors.wealthReduction + 
            factors.aiReduction + 
            factors.behaviorReduction
        );

        // Odds adjustment (for games with probability mechanics)
        if (factors.overallReduction > 0.5) {
            factors.oddsAdjustment = Math.min(0.8, factors.overallReduction); // Up to 80% odds adjustment
        }

        return factors;
    }

    /**
     * Apply personalization factors to base game configuration
     * @private
     */
    applyPersonalization(baseConfig, factors, gameType) {
        const personalizedConfig = JSON.parse(JSON.stringify(baseConfig)); // Deep clone

        // Apply payout reductions
        if (personalizedConfig.basePayout) {
            personalizedConfig.personalizedPayout = this.adjustPayoutTable(
                personalizedConfig.basePayout, 
                factors.overallReduction
            );
        }

        // Apply odds adjustments
        if (personalizedConfig.baseOdds && factors.oddsAdjustment > 0) {
            personalizedConfig.personalizedOdds = this.adjustGameOdds(
                personalizedConfig.baseOdds,
                factors.oddsAdjustment,
                gameType
            );
        }

        return personalizedConfig;
    }

    /**
     * Adjust payout tables based on personalization factors
     * @private
     */
    adjustPayoutTable(basePayouts, reductionFactor) {
        const adjustedPayouts = {};

        for (const [key, value] of Object.entries(basePayouts)) {
            if (Array.isArray(value)) {
                // Handle array of payouts (like slots)
                adjustedPayouts[key] = value.map(payout => 
                    Math.max(0.1, payout * (1 - reductionFactor))
                );
            } else if (typeof value === 'number') {
                // Handle single payout values
                adjustedPayouts[key] = Math.max(0.1, value * (1 - reductionFactor));
            } else {
                adjustedPayouts[key] = value; // Keep non-numeric values unchanged
            }
        }

        return adjustedPayouts;
    }

    /**
     * Adjust game odds/probabilities based on personalization factors
     * @private
     */
    adjustGameOdds(baseOdds, adjustmentFactor, gameType) {
        const adjustedOdds = { ...baseOdds };

        switch (gameType.toLowerCase()) {
            case 'blackjack':
                // Slightly increase dealer advantage
                if (adjustedOdds.dealerBustChance) {
                    adjustedOdds.dealerBustChance *= (1 - adjustmentFactor * 0.3);
                }
                if (adjustedOdds.playerAdvantage) {
                    adjustedOdds.playerAdvantage *= (1 - adjustmentFactor);
                }
                break;

            case 'slots':
                // Reduce jackpot and win chances
                if (adjustedOdds.jackpotChance) {
                    adjustedOdds.jackpotChance *= (1 - adjustmentFactor);
                }
                if (adjustedOdds.smallWinChance) {
                    adjustedOdds.smallWinChance *= (1 - adjustmentFactor * 0.5);
                }
                break;

            case 'crash':
                // Lower average crash point and increase volatility
                if (adjustedOdds.averageCrashPoint) {
                    adjustedOdds.averageCrashPoint *= (1 - adjustmentFactor * 0.3);
                }
                if (adjustedOdds.volatility) {
                    adjustedOdds.volatility *= (1 + adjustmentFactor * 0.5);
                }
                break;

            case 'plinko':
                // Reduce center hit chances
                if (adjustedOdds.centerHitChance) {
                    adjustedOdds.centerHitChance *= (1 - adjustmentFactor);
                }
                if (adjustedOdds.highPayoutChance) {
                    adjustedOdds.highPayoutChance *= (1 - adjustmentFactor * 0.7);
                }
                break;

            case 'roulette':
                // Increase house edge slightly (within reason)
                if (adjustedOdds.houseEdge) {
                    adjustedOdds.houseEdge = Math.min(0.1, 
                        adjustedOdds.houseEdge * (1 + adjustmentFactor * 0.5)
                    );
                }
                break;
        }

        return adjustedOdds;
    }

    /**
     * Analyze player behavior patterns
     * @private
     */
    async analyzePlayerBehavior(userId) {
        try {
            // Get recent game statistics
            const stats = await dbManager.getUserStats(userId);
            if (!stats) {
                return { suspicious: false, reductionFactor: 0, reasons: [] };
            }

            const reasons = [];
            let reductionFactor = 0;
            let suspicious = false;

            const totalGames = (stats.wins || 0) + (stats.losses || 0);
            if (totalGames > 10) {
                const winRate = (stats.wins || 0) / totalGames;
                
                // Check for suspiciously high win rates
                if (winRate > 0.7) {
                    reasons.push(`High win rate: ${(winRate * 100).toFixed(1)}%`);
                    reductionFactor += 0.2;
                    suspicious = true;
                }

                // Check for very large average wins
                if (stats.total_won && stats.wins && stats.wins > 0) {
                    const avgWin = stats.total_won / stats.wins;
                    if (avgWin > 500000) { // Average win over $500K
                        reasons.push(`Large average wins: $${avgWin.toLocaleString()}`);
                        reductionFactor += 0.15;
                        suspicious = true;
                    }
                }
            }

            return {
                suspicious,
                reductionFactor: Math.min(0.5, reductionFactor), // Cap at 50%
                reasons
            };

        } catch (error) {
            logger.error(`Behavior analysis failed for ${userId}: ${error.message}`);
            return { suspicious: false, reductionFactor: 0, reasons: [] };
        }
    }

    /**
     * Get personalized multiplier for a specific outcome
     * @param {string} userId - User ID
     * @param {string} gameType - Game type
     * @param {string} outcome - Specific outcome (e.g., 'blackjack', 'win', 'jackpot')
     * @param {number} baseMultiplier - Base multiplier for this outcome
     * @param {object} aiTracking - AI tracking data
     * @returns {Promise<number>} Personalized multiplier
     */
    async getPersonalizedMultiplier(userId, gameType, outcome, baseMultiplier, aiTracking = null) {
        const config = await this.getPersonalizedGameConfig(userId, gameType, aiTracking);
        
        if (!config?.personalizedPayout) {
            return baseMultiplier;
        }

        const personalizedValue = config.personalizedPayout[outcome];
        if (personalizedValue !== undefined) {
            return Array.isArray(personalizedValue) ? personalizedValue[0] : personalizedValue;
        }

        // If specific outcome not found, apply overall reduction
        const reductionFactor = config.metadata?.personalizationLevel || 0;
        return Math.max(0.1, baseMultiplier * (1 - reductionFactor));
    }

    /**
     * Get personalized odds for a specific game mechanic
     * @param {string} userId - User ID
     * @param {string} gameType - Game type
     * @param {string} mechanic - Specific mechanic (e.g., 'jackpotChance', 'dealerBustChance')
     * @param {object} aiTracking - AI tracking data
     * @returns {Promise<number>} Personalized odds/probability
     */
    async getPersonalizedOdds(userId, gameType, mechanic, aiTracking = null) {
        const config = await this.getPersonalizedGameConfig(userId, gameType, aiTracking);
        
        if (!config?.personalizedOdds) {
            return config?.baseOdds?.[mechanic] || null;
        }

        return config.personalizedOdds[mechanic] || config.baseOdds[mechanic] || null;
    }

    /**
     * Clear cache for a specific user (use when their wealth/status changes significantly)
     * @param {string} userId - User ID to clear cache for
     */
    clearUserCache(userId) {
        const keysToRemove = [];
        for (const [key] of this.configCache) {
            if (key.startsWith(`${userId}_`)) {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => this.configCache.delete(key));
        logger.debug(`Cleared personalization cache for user ${userId}`);
    }

    /**
     * Get personalization summary for admin/debug purposes
     * @param {string} userId - User ID
     * @returns {Promise<object>} Summary of all personalizations for this user
     */
    async getPersonalizationSummary(userId) {
        const summary = {};
        const gameTypes = Object.keys(this.baseGameConfigs);

        for (const gameType of gameTypes) {
            try {
                const config = await this.getPersonalizedGameConfig(userId, gameType);
                if (config?.metadata) {
                    summary[gameType] = {
                        wealthTier: config.metadata.wealthTier,
                        reductionLevel: `${(config.metadata.personalizationLevel * 100).toFixed(1)}%`,
                        factors: config.metadata.factors.reasons
                    };
                }
            } catch (error) {
                summary[gameType] = { error: error.message };
            }
        }

        return summary;
    }
}

module.exports = new DynamicGamePersonalizer();