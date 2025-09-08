/**
 * AI Multiplier Helper - Apply AI-driven multiplier adjustments to games
 * Works with gameAITracker to ensure all games get consistent AI adjustments
 */

const gameAITracker = require('./gameAITracker');
const wealthCeiling = require('./wealthCeiling');
const logger = require('./logger');

class AIMultiplierHelper {
    /**
     * Apply AI-driven multiplier adjustments to game results
     * @param {string} userId - User ID
     * @param {string} gameType - Game type
     * @param {number} baseMultiplier - Original game multiplier
     * @param {object} validationResult - Result from PayoutManager validation (contains aiTracking)
     * @returns {Promise<{finalMultiplier: number, adjustments: object}>}
     */
    static async applyAIMultiplier(userId, gameType, baseMultiplier, validationResult = null) {
        try {
            let finalMultiplier = baseMultiplier;
            const adjustments = {
                wealthCeiling: 0,
                aiSuspicion: 0,
                totalReduction: 0,
                reasons: []
            };

            // Get wealth-based multiplier reduction
            const wealthData = await wealthCeiling.getWealthMultiplierReduction(userId);
            if (wealthData.reduction > 0) {
                const reductionAmount = baseMultiplier * wealthData.reduction;
                finalMultiplier -= reductionAmount;
                adjustments.wealthCeiling = wealthData.reduction;
                adjustments.reasons.push(`Wealth ceiling: ${wealthData.milestone} (-${(wealthData.reduction * 100).toFixed(1)}%)`);
            }

            // Apply AI tracking adjustments if available
            if (validationResult?.aiTracking?.aiAdjustments) {
                const aiAdjustment = validationResult.aiTracking.aiAdjustments.multiplierAdjustment;
                if (aiAdjustment < 1.0) {
                    const aiReductionAmount = baseMultiplier * (1 - aiAdjustment);
                    finalMultiplier = Math.max(finalMultiplier * aiAdjustment, finalMultiplier - aiReductionAmount);
                    adjustments.aiSuspicion = 1 - aiAdjustment;
                    adjustments.reasons.push(`AI analysis: Suspicious patterns (-${((1 - aiAdjustment) * 100).toFixed(1)}%)`);
                }

                // Add AI flags to reasons
                if (validationResult.aiTracking.aiAdjustments.flags.length > 0) {
                    adjustments.reasons.push(`Flags: ${validationResult.aiTracking.aiAdjustments.flags.join(', ')}`);
                }
            }

            // Calculate total reduction
            adjustments.totalReduction = Math.max(0, (baseMultiplier - finalMultiplier) / baseMultiplier);
            
            // Never reduce multipliers below 5% of original (keep some chance of winning)
            finalMultiplier = Math.max(finalMultiplier, baseMultiplier * 0.05);

            // Log significant reductions
            if (adjustments.totalReduction > 0.25) {
                logger.warn(`🤖 AI Multiplier Reduction: ${userId} - ${gameType} - ${(baseMultiplier).toFixed(2)}x → ${finalMultiplier.toFixed(2)}x (-${(adjustments.totalReduction * 100).toFixed(1)}%)`);
                logger.warn(`🤖 Reasons: ${adjustments.reasons.join(', ')}`);
            } else if (adjustments.totalReduction > 0.05) {
                logger.info(`🤖 AI Multiplier Adjustment: ${userId} - ${gameType} - Reduced by ${(adjustments.totalReduction * 100).toFixed(1)}%`);
            }

            return {
                finalMultiplier: Math.max(0.01, finalMultiplier), // Never go below 0.01x
                adjustments
            };

        } catch (error) {
            logger.error(`AI multiplier calculation failed: ${error.message}`);
            return {
                finalMultiplier: baseMultiplier,
                adjustments: { error: error.message, reasons: ['Error in AI calculation - using original multiplier'] }
            };
        }
    }

    /**
     * Get multiplier preview for display purposes (doesn't affect game)
     * @param {string} userId - User ID
     * @param {string} gameType - Game type  
     * @param {number} baseMultiplier - Base multiplier
     * @returns {Promise<object>} Preview data
     */
    static async getMultiplierPreview(userId, gameType, baseMultiplier) {
        const result = await this.applyAIMultiplier(userId, gameType, baseMultiplier, null);
        const wealthStatus = await wealthCeiling.getWealthStatus(userId);
        
        return {
            originalMultiplier: baseMultiplier,
            adjustedMultiplier: result.finalMultiplier,
            reductionPercent: result.adjustments.totalReduction * 100,
            wealthTier: wealthStatus.milestone,
            remainingToBillion: wealthStatus.remainingToBillion,
            estimatedGamesToReachBillion: wealthStatus.estimatedGamesToReachBillion,
            reasons: result.adjustments.reasons
        };
    }

    /**
     * Apply AI adjustments to payout calculation
     * @param {string} userId - User ID
     * @param {string} gameType - Game type
     * @param {number} betAmount - Bet amount
     * @param {number} originalPayout - Original payout before AI adjustments
     * @param {object} validationResult - Validation result with AI tracking
     * @returns {Promise<{finalPayout: number, adjustmentDetails: object}>}
     */
    static async applyAIPayout(userId, gameType, betAmount, originalPayout, validationResult = null) {
        if (originalPayout <= betAmount) {
            // No winnings to adjust (loss or push)
            return {
                finalPayout: originalPayout,
                adjustmentDetails: { noAdjustment: "No winnings to adjust" }
            };
        }

        const baseMultiplier = originalPayout / betAmount;
        const aiResult = await this.applyAIMultiplier(userId, gameType, baseMultiplier, validationResult);
        const finalPayout = betAmount * aiResult.finalMultiplier;

        return {
            finalPayout: Math.floor(finalPayout),
            adjustmentDetails: {
                originalMultiplier: baseMultiplier,
                adjustedMultiplier: aiResult.finalMultiplier,
                reductionAmount: Math.floor(originalPayout - finalPayout),
                adjustments: aiResult.adjustments
            }
        };
    }
}

module.exports = AIMultiplierHelper;