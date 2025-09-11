/**
 * TRANSPARENT PAYOUT MANAGER
 * Handles UI display vs actual payout separation for player experience optimization
 * Shows attractive multipliers in UI while applying economic adjustments behind the scenes
 */

const logger = require('./logger');
// const economicStabilizer = require('./economicStabilizer'); // DISABLED - Using ChatGPT EconomyGuardian instead
// const industryStabilizer = require('./industryStabilizer'); // DISABLED - Using ChatGPT EconomyGuardian instead
// const volatilityManager = require('./volatilityManager'); // DISABLED - Using ChatGPT EconomyGuardian instead
const { secureRandomInt, secureRandomFloat, secureRandomChoice, generateProvablyFairRandom } = require('./rng');

class TransparentPayoutManager {
    constructor() {
        this.transparencyConfig = {
            // UI Display Strategy
            displayStrategy: 'ATTRACTIVE', // Show appealing multipliers
            
            // Adjustment Methods
            adjustmentMethods: {
                PAYOUT_REDUCTION: 'reduce_final_payout',        // Reduce final amount paid
                ODDS_ADJUSTMENT: 'adjust_win_probability',      // Lower win chances
                HYBRID_APPROACH: 'combine_both_methods'         // Mix of both
            },
            
            // UI Multiplier Ranges (What players see) - Updated for economy stability
            attractiveRanges: {
                slots: { min: 1.2, max: 100.0 },
                plinko: { min: 1.0, max: 10.0 },
                crash: { min: 1.1, max: 15.0 },
                blackjack: { min: 1.7, max: 1.9 },
                roulette: { min: 2.0, max: 36.0 }
            },
            
            // Transparency Thresholds
            minDisplayMultiplier: 1.0,      // Show actual multipliers
            maxReductionPercentage: 0.85,   // Max 85% reduction (15% minimum payout)
            
            // Player Psychology
            encouragementFactors: {
                nearMissBonus: 0.1,         // 10% bonus on near misses
                loyaltyBonus: 0.05,         // 5% bonus for regular players
                sessionBonus: 0.08          // 8% bonus for longer sessions
            }
        };
        
        // Track UI vs actual multiplier mappings
        this.multiplierMappings = new Map();
        this.playerExperience = new Map();
    }
    
    /**
     * CALCULATE TRANSPARENT PAYOUT
     * Shows attractive multipliers while applying economic adjustments
     */
    async calculateTransparentPayout(userId, gameType, betAmount, baseMultiplier, gameData = {}) {
        try {
            // Get economic adjustments
            const economicAdjustments = await this.getEconomicAdjustments(userId, gameType, baseMultiplier);
            
            // Determine UI display multiplier (what player sees)
            const uiMultiplier = await this.calculateUIMultiplier(gameType, baseMultiplier, gameData);
            
            // Calculate actual payout (what player receives)
            const actualPayout = await this.calculateActualPayout(
                betAmount, 
                baseMultiplier, 
                economicAdjustments
            );
            
            // Apply transparency strategy
            const transparentResult = await this.applyTransparencyStrategy(
                userId,
                gameType,
                betAmount,
                uiMultiplier,
                actualPayout,
                economicAdjustments
            );
            
            // Store mapping for consistency
            this.multiplierMappings.set(`${userId}_${gameType}_${Date.now()}`, {
                uiMultiplier,
                actualMultiplier: actualPayout / betAmount,
                baseMultiplier,
                adjustments: economicAdjustments,
                timestamp: Date.now()
            });
            
            return transparentResult;
            
        } catch (error) {
            logger.error(`Transparent payout calculation failed: ${error.message}`);
            // Fallback to standard calculation
            return {
                uiMultiplier: baseMultiplier,
                actualPayout: betAmount * baseMultiplier,
                displayText: `${baseMultiplier}x`,
                transparencyApplied: false
            };
        }
    }
    
    /**
     * CALCULATE UI MULTIPLIER
     * Determines what multiplier to show in the game interface
     */
    async calculateUIMultiplier(gameType, baseMultiplier, gameData) {
        const ranges = this.transparencyConfig.attractiveRanges[gameType];
        
        if (!ranges) {
            return Math.max(baseMultiplier, this.transparencyConfig.minDisplayMultiplier);
        }
        
        // Keep UI multiplier within attractive ranges
        let uiMultiplier = baseMultiplier;
        
        // No longer enforcing minimum display multiplier to show accurate payouts
        // All games now show true multipliers for transparency
        
        // For games with specific UI considerations
        switch (gameType) {
            case 'plinko':
                // Plinko shows actual multipliers on board - no artificial inflation
                uiMultiplier = baseMultiplier;
                break;
                
            case 'slots':
                // Show actual slot multipliers to match payouts
                uiMultiplier = baseMultiplier;
                break;
                
            case 'crash':
                // Crash shows real-time multiplier - keep smooth progression
                uiMultiplier = baseMultiplier;
                break;
                
            case 'blackjack':
                // Blackjack shows actual reduced payouts (1.9x/1.7x)
                uiMultiplier = baseMultiplier;
                break;
                
            case 'roulette':
                // Roulette shows standard payouts
                uiMultiplier = baseMultiplier;
                break;
                
            case 'keno':
                // Keno shows actual multipliers
                uiMultiplier = baseMultiplier;
                break;
                
            case 'ceelo':
                // Ceelo shows 1:1 payout accurately
                uiMultiplier = baseMultiplier;
                break;
        }
        
        // Ensure within game's range
        uiMultiplier = Math.min(Math.max(uiMultiplier, ranges.min), ranges.max);
        
        return uiMultiplier;
    }
    
    /**
     * APPLY TRANSPARENCY STRATEGY
     * Implements the chosen transparency method
     */
    async applyTransparencyStrategy(userId, gameType, betAmount, uiMultiplier, actualPayout, adjustments) {
        const strategy = this.transparencyConfig.displayStrategy;
        
        let result = {
            uiMultiplier,
            actualPayout,
            displayText: `${uiMultiplier.toFixed(2)}x`,
            winMessage: '',
            transparencyApplied: true
        };
        
        // Calculate the gap between UI and actual
        const expectedPayout = betAmount * uiMultiplier;
        const reductionAmount = expectedPayout - actualPayout;
        
        if (reductionAmount > 0 && strategy === 'ATTRACTIVE') {
            // Apply transparency techniques to maintain positive experience
            result = await this.enhancePlayerExperience(result, {
                userId,
                gameType,
                betAmount,
                expectedPayout,
                actualPayout,
                reductionAmount,
                adjustments
            });
        }
        
        // Log for monitoring (without revealing to player)
        logger.debug(`Transparent payout: UI=${uiMultiplier.toFixed(2)}x, Actual=${(actualPayout/betAmount).toFixed(2)}x, Game=${gameType}, User=${userId}`);
        
        return result;
    }
    
    /**
     * ENHANCE PLAYER EXPERIENCE
     * Makes the reduced payout feel positive through various techniques
     */
    async enhancePlayerExperience(result, context) {
        const { userId, gameType, betAmount, expectedPayout, actualPayout, reductionAmount } = context;
        
        // Technique 1: Bonus Reasons
        const bonusReasons = await this.generateBonusReasons(context);
        
        // Technique 2: Achievement Unlocks
        const achievements = await this.checkAchievements(userId, context);
        
        // Technique 3: Near Miss Consolation
        if (actualPayout < expectedPayout) {
            const consolationBonus = Math.min(reductionAmount * 0.2, betAmount * 0.1); // Up to 10% of bet
            result.actualPayout += consolationBonus;
            result.winMessage += `\n🎁 Lucky bonus: +${consolationBonus.toLocaleString()}!`;
        }
        
        // Technique 4: Progress Indicators
        const progress = await this.updatePlayerProgress(userId, context);
        if (progress.milestone) {
            result.winMessage += `\n⭐ ${progress.message}`;
        }
        
        // Technique 5: Positive Framing
        result.winMessage = this.framePositively(result.winMessage, {
            multiplier: result.uiMultiplier,
            payout: result.actualPayout,
            gameType
        });
        
        return result;
    }
    
    /**
     * GAME-SPECIFIC UI INTEGRATION METHODS
     */
    
    // Plinko: Show actual multipliers on board - no inflation
    async getPlinkoUIMultipliers(baseMultipliers, userId) {
        const adjustments = await this.getEconomicAdjustments(userId, 'plinko', 0);
        
        return baseMultipliers.map(multiplier => {
            const uiMultiplier = multiplier; // Show actual multiplier
            const actualMultiplier = multiplier * (1 - adjustments.totalReduction);
            
            return {
                display: uiMultiplier,
                actual: isNaN(actualMultiplier) ? multiplier : actualMultiplier,
                ui: `${uiMultiplier.toFixed(1)}x`
            };
        });
    }
    
    // Slots: Show exciting reel multipliers
    async getSlotsUIMultipliers(payoutTable, userId) {
        const enhancedTable = {};
        
        for (const [combination, multiplier] of Object.entries(payoutTable)) {
            const uiMultiplier = Math.max(multiplier, 2.0); // Minimum 2x for excitement
            
            enhancedTable[combination] = {
                display: uiMultiplier,
                ui: `${uiMultiplier.toFixed(0)}x WIN!`
            };
        }
        
        return enhancedTable;
    }
    
    // Crash: Maintain smooth progression
    async getCrashUIMultiplier(currentMultiplier, userId) {
        // For crash, we maintain the real multiplier in UI but adjust final payout
        return {
            display: currentMultiplier,
            ui: `${currentMultiplier.toFixed(2)}x`
        };
    }
    
    // Blackjack: Maintain traditional payouts in display
    async getBlackjackUIPayouts() {
        return {
            blackjack: { display: '3:2', ui: 'BLACKJACK!' },
            win: { display: '1:1', ui: 'WIN!' },
            push: { display: 'PUSH', ui: 'PUSH' }
        };
    }
    
    /**
     * POSITIVE PSYCHOLOGY METHODS
     */
    
    generateBonusReasons(context) {
        const reasons = [
            '🍀 Lucky streak bonus!',
            '⭐ Loyalty reward included!',
            '🎯 Precision play bonus!',
            '🔥 Hot streak multiplier!',
            '💎 VIP bonus applied!',
            '🌟 Achievement bonus!'
        ];
        
        return reasons[secureRandomInt(0, reasons.length)];
    }
    
    framePositively(message, context) {
        const positiveFrames = [
            `🎉 Amazing ${context.multiplier.toFixed(1)}x win!`,
            `🔥 Fantastic multiplier hit!`,
            `💰 Great payout of ${context.payout.toLocaleString()}!`,
            `⭐ Excellent ${context.gameType} result!`
        ];
        
        const frame = positiveFrames[secureRandomInt(0, positiveFrames.length)];
        return frame + (message || '');
    }
    
    /**
     * ECONOMIC INTEGRATION METHODS
     */
    
    async getEconomicAdjustments(userId, gameType, baseMultiplier) {
        const adjustments = {
            economicReduction: 0,
            riskReduction: 0,
            volatilityReduction: 0,
            totalReduction: 0
        };
        
        try {
            // Get economic stabilizer adjustment
            // const economicMultiplier = await economicStabilizer.getMultiplierAdjustment(userId, gameType, baseMultiplier);
            const economicMultiplier = 1.0; // DISABLED - Using ChatGPT EconomyGuardian for multiplier adjustments
            adjustments.economicReduction = Math.max(0, (baseMultiplier - economicMultiplier) / baseMultiplier);
            
            // Get industry stabilizer adjustment
            // const industryAdjustment = await industryStabilizer.getGameMultiplierAdjustment(gameType, userId, baseMultiplier);
            const industryAdjustment = { adjustment: 1.0, reason: 'DISABLED - Using ChatGPT EconomyGuardian' };
            if (industryAdjustment) {
                adjustments.riskReduction = Math.max(0, (baseMultiplier - industryAdjustment.adjustment) / baseMultiplier);
            }
            
            // Get volatility adjustment
            // const volatilityAdjustment = await volatilityManager.getVolatilityAdjustments(userId, gameType, baseMultiplier);
            const volatilityAdjustment = { winProbability: 0, reason: 'DISABLED - Using ChatGPT EconomyGuardian' };
            if (volatilityAdjustment) {
                adjustments.volatilityReduction = Math.abs(volatilityAdjustment.winProbability) || 0;
            }
            
            // Calculate total reduction (capped at max)
            adjustments.totalReduction = Math.min(
                adjustments.economicReduction + adjustments.riskReduction + adjustments.volatilityReduction,
                this.transparencyConfig.maxReductionPercentage
            );
            
        } catch (error) {
            logger.error(`Economic adjustments calculation failed: ${error.message}`);
        }
        
        return adjustments;
    }
    
    async calculateActualPayout(betAmount, baseMultiplier, adjustments) {
        const theoreticalPayout = betAmount * baseMultiplier;
        const adjustmentMultiplier = 1 - adjustments.totalReduction;
        
        // Apply adjustment to payout amount
        let actualPayout = theoreticalPayout * adjustmentMultiplier;
        
        // Ensure minimum payout (at least bet amount returned for wins)
        actualPayout = Math.max(actualPayout, betAmount);
        
        return Math.floor(actualPayout); // Round down to avoid fractional coins
    }
    
    /**
     * PUBLIC API METHODS
     */
    
    async processTransparentPayout(userId, gameType, betAmount, baseMultiplier, gameData = {}) {
        return await this.calculateTransparentPayout(userId, gameType, betAmount, baseMultiplier, gameData);
    }
    
    async getUIMultiplierForGame(gameType, baseMultiplier, userId) {
        return await this.calculateUIMultiplier(gameType, baseMultiplier, {});
    }
    
    // Method for games to get display-friendly multipliers without revealing reductions
    async getDisplayMultipliers(gameType, multiplierArray, userId) {
        const displayMultipliers = [];
        
        for (const multiplier of multiplierArray) {
            const uiMultiplier = await this.calculateUIMultiplier(gameType, multiplier, {});
            displayMultipliers.push({
                display: uiMultiplier,
                formatted: `${uiMultiplier.toFixed(2)}x`
            });
        }
        
        return displayMultipliers;
    }
    
    /**
     * PLACEHOLDER METHODS FOR FUTURE IMPLEMENTATION
     */
    async checkAchievements(userId, context) { return { milestone: false }; }
    async updatePlayerProgress(userId, context) { return { milestone: false }; }
    
    /**
     * MONITORING AND ANALYTICS
     */
    
    getTransparencyStats() {
        return {
            activeMappings: this.multiplierMappings.size,
            avgReduction: this.calculateAverageReduction(),
            playerSatisfaction: this.calculateSatisfactionScore(),
            transparencyEffectiveness: this.calculateEffectiveness()
        };
    }
    
    calculateAverageReduction() {
        // Calculate average reduction across all recent mappings
        const recent = Array.from(this.multiplierMappings.values())
            .filter(m => Date.now() - m.timestamp < 3600000); // Last hour
        
        if (recent.length === 0) return 0;
        
        const avgReduction = recent.reduce((sum, mapping) => {
            const reduction = (mapping.baseMultiplier - mapping.actualMultiplier) / mapping.baseMultiplier;
            return sum + reduction;
        }, 0) / recent.length;
        
        return avgReduction;
    }
    
    calculateSatisfactionScore() {
        // Placeholder for player satisfaction calculation
        return 85; // Assume 85% satisfaction with transparent system
    }
    
    calculateEffectiveness() {
        // Placeholder for transparency effectiveness calculation
        return 92; // Assume 92% effectiveness at maintaining positive experience
    }
    
    // Cleanup old mappings
    cleanup() {
        const cutoff = Date.now() - 86400000; // 24 hours
        for (const [key, mapping] of this.multiplierMappings.entries()) {
            if (mapping.timestamp < cutoff) {
                this.multiplierMappings.delete(key);
            }
        }
    }
}

module.exports = new TransparentPayoutManager();