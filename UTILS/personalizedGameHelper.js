/**
 * Personalized Game Helper - Easy integration for games to get personalized mechanics
 * Provides simple methods for games to get their personalized payout tables, odds, and multipliers
 */

const dynamicGamePersonalizer = require('./dynamicGamePersonalizer');
const logger = require('./logger');

class PersonalizedGameHelper {
    /**
     * Get personalized blackjack configuration for a player
     * @param {string} userId - User ID
     * @param {object} validation - Validation result with AI tracking
     * @returns {Promise<object>} Personalized blackjack config
     */
    static async getPersonalizedBlackjack(userId, validation = null) {
        const config = await dynamicGamePersonalizer.getPersonalizedGameConfig(
            userId, 'blackjack', validation?.aiTracking
        );

        return {
            // ML Plan Phase 2: Adjusted for 8-15% house edge target (reduced from 1.9x/1.7x)
            blackjackPayout: config?.basePayout?.blackjack || 1.6,
            winPayout: config?.basePayout?.win || 1.4,
            pushPayout: config?.basePayout?.push || 1.0,
            
            // Personalized odds (affects game logic)
            dealerBustChance: config?.personalizedOdds?.dealerBustChance || config?.baseOdds?.dealerBustChance || 0.28,
            playerAdvantage: config?.personalizedOdds?.playerAdvantage || config?.baseOdds?.playerAdvantage || 0.005,
            
            // Metadata
            personalizationLevel: config?.metadata?.personalizationLevel || 0,
            wealthTier: config?.metadata?.wealthTier || "Regular",
            reasons: config?.metadata?.factors?.reasons || []
        };
    }

    /**
     * Get personalized slots configuration for a player
     * @param {string} userId - User ID
     * @param {object} validation - Validation result with AI tracking
     * @returns {Promise<object>} Personalized slots config
     */
    static async getPersonalizedSlots(userId, validation = null) {
        const config = await dynamicGamePersonalizer.getPersonalizedGameConfig(
            userId, 'slots', validation?.aiTracking
        );

        const basePayouts = config?.basePayout || {
            cherries: [2, 5, 10], diamonds: [5, 15, 50], sevens: [10, 25, 100], 
            bars: [3, 8, 20], bells: [4, 12, 30], lemons: [2, 6, 15]
        };

        const personalizedPayouts = config?.personalizedPayout || basePayouts;

        return {
            // Personalized payout table
            payouts: personalizedPayouts,
            
            // Personalized odds
            jackpotChance: config?.personalizedOdds?.jackpotChance || config?.baseOdds?.jackpotChance || 0.001,
            smallWinChance: config?.personalizedOdds?.smallWinChance || config?.baseOdds?.smallWinChance || 0.25,
            
            // Metadata
            personalizationLevel: config?.metadata?.personalizationLevel || 0,
            wealthTier: config?.metadata?.wealthTier || "Regular",
            reasons: config?.metadata?.factors?.reasons || []
        };
    }

    /**
     * Get personalized roulette configuration for a player
     * @param {string} userId - User ID
     * @param {object} validation - Validation result with AI tracking
     * @returns {Promise<object>} Personalized roulette config
     */
    static async getPersonalizedRoulette(userId, validation = null) {
        const config = await dynamicGamePersonalizer.getPersonalizedGameConfig(
            userId, 'roulette', validation?.aiTracking
        );

        const basePayouts = config?.basePayout || {
            straight: 35, split: 17, street: 11, corner: 8, line: 5, dozen: 2, evenOdd: 1
        };

        return {
            // Personalized payouts
            payouts: config?.personalizedPayout || basePayouts,
            
            // Personalized house edge
            houseEdge: config?.personalizedOdds?.houseEdge || config?.baseOdds?.houseEdge || 0.0526,
            
            // Metadata
            personalizationLevel: config?.metadata?.personalizationLevel || 0,
            wealthTier: config?.metadata?.wealthTier || "Regular",
            reasons: config?.metadata?.factors?.reasons || []
        };
    }

    /**
     * Get personalized crash configuration for a player
     * @param {string} userId - User ID
     * @param {object} validation - Validation result with AI tracking
     * @returns {Promise<object>} Personalized crash config
     */
    static async getPersonalizedCrash(userId, validation = null) {
        const config = await dynamicGamePersonalizer.getPersonalizedGameConfig(
            userId, 'crash', validation?.aiTracking
        );

        return {
            // Personalized multiplier limits
            minMultiplier: config?.personalizedPayout?.minMultiplier || config?.basePayout?.minMultiplier || 1.01,
            maxMultiplier: config?.personalizedPayout?.maxMultiplier || config?.basePayout?.maxMultiplier || 15.0,
            
            // Personalized crash behavior
            averageCrashPoint: config?.personalizedOdds?.averageCrashPoint || config?.baseOdds?.averageCrashPoint || 2.0,
            volatility: config?.personalizedOdds?.volatility || config?.baseOdds?.volatility || 0.15,
            
            // Metadata
            personalizationLevel: config?.metadata?.personalizationLevel || 0,
            wealthTier: config?.metadata?.wealthTier || "Regular",
            reasons: config?.metadata?.factors?.reasons || []
        };
    }

    /**
     * Get personalized multi-slots configuration for a player
     * @param {string} userId - User ID
     * @param {object} validation - Validation result with AI tracking
     * @returns {Promise<object>} Personalized multi-slots config
     */
    static async getPersonalizedMultiSlots(userId, validation = null) {
        const config = await dynamicGamePersonalizer.getPersonalizedGameConfig(
            userId, 'multi-slots', validation?.aiTracking
        );

        const basePayouts = config?.basePayout || {
            cherries: 2.0, lemon: 2.5, orange: 3.0, grapes: 4.0, watermelon: 5.0,
            bar: 6.0, seven: 12.0, diamond: 30.0, buffalo: 150.0, jackpot: 1000.0
        };

        return {
            payouts: config?.personalizedPayout || basePayouts,
            matrixBonusChance: config?.personalizedOdds?.matrixBonusChance || config?.baseOdds?.matrixBonusChance || 0.05,
            jackpotChance: config?.personalizedOdds?.jackpotChance || config?.baseOdds?.jackpotChance || 0.0001,
            personalizationLevel: config?.metadata?.personalizationLevel || 0,
            wealthTier: config?.metadata?.wealthTier || "Regular",
            reasons: config?.metadata?.factors?.reasons || []
        };
    }

    /**
     * Get personalized treasure vault configuration for a player
     * @param {string} userId - User ID
     * @param {object} validation - Validation result with AI tracking
     * @returns {Promise<object>} Personalized treasure vault config
     */
    static async getPersonalizedTreasureVault(userId, validation = null) {
        const config = await dynamicGamePersonalizer.getPersonalizedGameConfig(
            userId, 'treasurevault', validation?.aiTracking
        );

        return {
            payouts: config?.personalizedPayout || config?.basePayout || {
                bronze: 1.2, silver: 1.8, gold: 2.5, platinum: 3.5, diamond: 5.0
            },
            diamondChance: config?.personalizedOdds?.diamondChance || config?.baseOdds?.diamondChance || 0.01,
            goldChance: config?.personalizedOdds?.goldChance || config?.baseOdds?.goldChance || 0.1,
            personalizationLevel: config?.metadata?.personalizationLevel || 0,
            wealthTier: config?.metadata?.wealthTier || "Regular",
            reasons: config?.metadata?.factors?.reasons || []
        };
    }

    /**
     * Get personalized KENO configuration for a player
     * @param {string} userId - User ID
     * @param {object} validation - Validation result with AI tracking
     * @returns {Promise<object>} Personalized KENO config
     */
    static async getPersonalizedKeno(userId, validation = null) {
        const config = await dynamicGamePersonalizer.getPersonalizedGameConfig(
            userId, 'keno', validation?.aiTracking
        );

        return {
            payouts: config?.personalizedPayout || config?.basePayout || {
                match1: 1.0, match2: 2.0, match3: 5.0, match4: 12.0, match5: 25.0, match6: 50.0
            },
            baseHitChance: config?.personalizedOdds?.baseHitChance || config?.baseOdds?.baseHitChance || 0.25,
            personalizationLevel: config?.metadata?.personalizationLevel || 0,
            wealthTier: config?.metadata?.wealthTier || "Regular",
            reasons: config?.metadata?.factors?.reasons || []
        };
    }

    /**
     * Get personalized CEELO configuration for a player
     * @param {string} userId - User ID
     * @param {object} validation - Validation result with AI tracking
     * @returns {Promise<object>} Personalized CEELO config
     */
    static async getPersonalizedCeelo(userId, validation = null) {
        const config = await dynamicGamePersonalizer.getPersonalizedGameConfig(
            userId, 'ceelo', validation?.aiTracking
        );

        return {
            winPayout: config?.personalizedPayout?.win || config?.basePayout?.win || 2.0,
            pushPayout: config?.personalizedPayout?.push || config?.basePayout?.push || 1.0,
            playerAdvantage: config?.personalizedOdds?.playerAdvantage || config?.baseOdds?.playerAdvantage || 0.0,
            personalizationLevel: config?.metadata?.personalizationLevel || 0,
            wealthTier: config?.metadata?.wealthTier || "Regular",
            reasons: config?.metadata?.factors?.reasons || []
        };
    }

    /**
     * Get personalized Russian Roulette configuration for a player
     * @param {string} userId - User ID
     * @param {object} validation - Validation result with AI tracking
     * @returns {Promise<object>} Personalized Russian Roulette config
     */
    static async getPersonalizedRussianRoulette(userId, validation = null) {
        const config = await dynamicGamePersonalizer.getPersonalizedGameConfig(
            userId, 'russianroulette', validation?.aiTracking
        );

        return {
            survivePayout: config?.personalizedPayout?.survive || config?.basePayout?.survive || 6.0,
            surviveChance: config?.personalizedOdds?.surviveChance || config?.baseOdds?.surviveChance || 0.833,
            personalizationLevel: config?.metadata?.personalizationLevel || 0,
            wealthTier: config?.metadata?.wealthTier || "Regular",
            reasons: config?.metadata?.factors?.reasons || []
        };
    }

    /**
     * Get personalized plinko configuration for a player
     * @param {string} userId - User ID
     * @param {object} validation - Validation result with AI tracking
     * @returns {Promise<object>} Personalized plinko config
     */
    static async getPersonalizedPlinko(userId, validation = null) {
        const config = await dynamicGamePersonalizer.getPersonalizedGameConfig(
            userId, 'plinko', validation?.aiTracking
        );

        return {
            // Personalized payouts
            centerPayout: config?.personalizedPayout?.center || config?.basePayout?.center || 10.0,
            nearCenterPayout: config?.personalizedPayout?.nearCenter || config?.basePayout?.nearCenter || 5.0,
            sidesPayout: config?.personalizedPayout?.sides || config?.basePayout?.sides || 0.5,
            
            // Personalized odds
            centerHitChance: config?.personalizedOdds?.centerHitChance || config?.baseOdds?.centerHitChance || 0.02,
            highPayoutChance: config?.personalizedOdds?.highPayoutChance || config?.baseOdds?.highPayoutChance || 0.15,
            
            // Metadata
            personalizationLevel: config?.metadata?.personalizationLevel || 0,
            wealthTier: config?.metadata?.wealthTier || "Regular",
            reasons: config?.metadata?.factors?.reasons || []
        };
    }

    /**
     * Apply personalized multiplier to any game result
     * @param {string} userId - User ID
     * @param {string} gameType - Game type
     * @param {string} outcome - Specific outcome type
     * @param {number} baseMultiplier - Base multiplier
     * @param {object} validation - Validation result with AI tracking
     * @returns {Promise<{multiplier: number, reduction: number, reasons: string[]}>}
     */
    static async applyPersonalizedMultiplier(userId, gameType, outcome, baseMultiplier, validation = null) {
        try {
            const personalizedMultiplier = await dynamicGamePersonalizer.getPersonalizedMultiplier(
                userId, gameType, outcome, baseMultiplier, validation?.aiTracking
            );

            const reduction = baseMultiplier - personalizedMultiplier;
            const config = await dynamicGamePersonalizer.getPersonalizedGameConfig(
                userId, gameType, validation?.aiTracking
            );

            // Log significant reductions
            if (reduction > baseMultiplier * 0.3) {
                logger.warn(`🎮 PERSONALIZED MULTIPLIER: ${userId} - ${gameType} - ${outcome} - ${baseMultiplier.toFixed(2)}x → ${personalizedMultiplier.toFixed(2)}x (-${((reduction/baseMultiplier)*100).toFixed(1)}%)`);
            }

            return {
                multiplier: personalizedMultiplier,
                reduction: reduction,
                reasons: config?.metadata?.factors?.reasons || [],
                wealthTier: config?.metadata?.wealthTier || "Regular"
            };

        } catch (error) {
            logger.error(`Failed to apply personalized multiplier: ${error.message}`);
            return {
                multiplier: baseMultiplier,
                reduction: 0,
                reasons: [`Error: ${error.message}`],
                wealthTier: "Error"
            };
        }
    }

    /**
     * Get simplified personalization info for game displays
     * @param {string} userId - User ID
     * @param {string} gameType - Game type
     * @returns {Promise<object>} Display-friendly personalization info
     */
    static async getPersonalizationDisplay(userId, gameType) {
        try {
            const config = await dynamicGamePersonalizer.getPersonalizedGameConfig(userId, gameType);
            
            if (!config?.metadata) {
                return {
                    tier: "Regular Player",
                    adjustment: "No adjustments",
                    level: 0
                };
            }

            const level = config.metadata.personalizationLevel;
            let description = "Standard rates";
            
            if (level > 0.8) description = "Ultra-personalized rates";
            else if (level > 0.6) description = "Heavily personalized rates"; 
            else if (level > 0.4) description = "Moderately personalized rates";
            else if (level > 0.2) description = "Lightly personalized rates";

            return {
                tier: config.metadata.wealthTier,
                adjustment: description,
                level: Math.round(level * 100),
                reasons: config.metadata.factors.reasons.slice(0, 2) // Show only top 2 reasons
            };

        } catch (error) {
            logger.error(`Failed to get personalization display: ${error.message}`);
            return {
                tier: "Error",
                adjustment: "Error loading personalization",
                level: 0
            };
        }
    }

    /**
     * Invalidate personalization cache when player's status changes
     * @param {string} userId - User ID
     */
    static invalidateCache(userId) {
        dynamicGamePersonalizer.clearUserCache(userId);
        logger.debug(`Invalidated personalization cache for ${userId}`);
    }
}

module.exports = PersonalizedGameHelper;