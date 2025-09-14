/**
 * All-In Manager - Dynamic House Edge Based on Bet-to-Wealth Ratio
 * Allows players to bet everything while protecting the economy through house edge adjustments
 */

const tuningManager = require('./tuningManager');
const dbManager = require('./database');
const logger = require('./logger');

class AllInManager {
    constructor() {
        this.initialized = false;
        this.edgeConfig = new Map();
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
            // Load all-in system configuration
            const allInEnabled = await tuningManager.getTuning('global', 'enableAllInSystem', 0);
            this.enabled = allInEnabled === 1;
            
            if (this.enabled) {
                await this.loadEdgeConfiguration();
                logger.info('🎯 All-In Manager initialized - dynamic house edge system active');
            }
            
            this.initialized = true;
        } catch (error) {
            logger.error(`All-In Manager initialization failed: ${error.message}`);
            this.enabled = false;
        }
    }

    async loadEdgeConfiguration() {
        // Load ratio-based house edge increases
        const ratios = [0.1, 0.25, 0.5, 0.75, 0.9, 1.0];
        
        for (const ratio of ratios) {
            const edgeIncrease = await tuningManager.getTuning('allin_system', `ratio_${ratio}`, 0);
            this.edgeConfig.set(ratio, edgeIncrease);
        }
    }

    /**
     * Calculate dynamic house edge based on bet-to-wealth ratio
     */
    async calculateDynamicHouseEdge(userId, betAmount, baseHouseEdge = 0.02) {
        if (!this.enabled) return baseHouseEdge;

        try {
            // Get user's total wealth
            const balance = await dbManager.getUserBalance(userId);
            const totalWealth = balance.wallet + balance.bank;
            
            if (totalWealth <= 0) return baseHouseEdge;
            
            // Calculate bet-to-wealth ratio
            const betRatio = betAmount / totalWealth;
            
            // Find appropriate house edge increase
            let edgeIncrease = 0;
            
            for (const [ratio, increase] of this.edgeConfig.entries()) {
                if (betRatio >= ratio) {
                    edgeIncrease = increase;
                }
            }
            
            const finalHouseEdge = baseHouseEdge + edgeIncrease;
            
            // Log significant adjustments
            if (edgeIncrease > 0.05) { // Log if house edge increases by more than 5%
                logger.info(`🎯 All-In Adjustment: ${userId} betting ${((betRatio * 100)).toFixed(1)}% of wealth, house edge: ${(baseHouseEdge * 100).toFixed(1)}% → ${(finalHouseEdge * 100).toFixed(1)}%`);
            }
            
            return {
                finalHouseEdge,
                baseHouseEdge,
                edgeIncrease,
                betRatio,
                isAllIn: betRatio >= 0.95,
                totalWealth
            };
            
        } catch (error) {
            logger.error(`Failed to calculate dynamic house edge: ${error.message}`);
            return baseHouseEdge;
        }
    }

    /**
     * Check if a bet qualifies as an "all-in" (95%+ of wealth)
     */
    async isAllInBet(userId, betAmount) {
        try {
            const balance = await dbManager.getUserBalance(userId);
            const totalWealth = balance.wallet + balance.bank;
            return betAmount >= (totalWealth * 0.95);
        } catch (error) {
            logger.error(`Failed to check all-in status: ${error.message}`);
            return false;
        }
    }

    /**
     * Apply dynamic house edge to game results
     */
    async adjustGameResult(userId, betAmount, originalPayout, won, gameType) {
        if (!this.enabled || !won || originalPayout <= 0) {
            return { adjustedPayout: originalPayout, reduction: 0, houseEdgeApplied: 0 };
        }

        try {
            const edgeData = await this.calculateDynamicHouseEdge(userId, betAmount);
            
            if (typeof edgeData === 'object' && edgeData.edgeIncrease > 0) {
                // Apply the additional house edge as a reduction to winnings
                const additionalEdge = edgeData.edgeIncrease;
                const reduction = originalPayout * additionalEdge;
                const adjustedPayout = Math.max(betAmount, originalPayout - reduction); // Never pay less than bet back
                
                logger.debug(`All-In adjustment: ${gameType} payout ${originalPayout} → ${adjustedPayout} (${(additionalEdge * 100).toFixed(1)}% additional house edge)`);
                
                return {
                    adjustedPayout: Math.floor(adjustedPayout),
                    reduction: Math.floor(reduction),
                    houseEdgeApplied: additionalEdge,
                    isAllIn: edgeData.isAllIn,
                    betRatio: edgeData.betRatio
                };
            }
            
            return { adjustedPayout: originalPayout, reduction: 0, houseEdgeApplied: 0 };
            
        } catch (error) {
            logger.error(`Failed to adjust game result: ${error.message}`);
            return { adjustedPayout: originalPayout, reduction: 0, houseEdgeApplied: 0 };
        }
    }

    /**
     * Get system status for debugging
     */
    getStatus() {
        return {
            enabled: this.enabled,
            initialized: this.initialized,
            configuredRatios: Array.from(this.edgeConfig.keys()).length
        };
    }
}

// Export singleton
module.exports = new AllInManager();