/**
 * Balance-Based Win Rate Adjuster
 * Dynamically adjusts win rates and payouts based on user balance
 * Higher balance = Lower win rates to maintain economic balance
 */

const logger = require('./logger');

class BalanceBasedAdjuster {
    constructor() {
        this.initialized = false;
        this.balanceTiers = this.defineBalanceTiers();
        this.adjustmentRules = this.defineAdjustmentRules();
    }

    /**
     * Define balance tiers for different adjustment levels
     */
    defineBalanceTiers() {
        return {
            // Ultra-low balance - bonus to help them grow
            ULTRA_LOW: { min: 0, max: 100000, name: 'Ultra Low' },
            
            // Low balance - slight bonus
            LOW: { min: 100001, max: 1000000, name: 'Low' },
            
            // Normal balance - standard rates
            NORMAL: { min: 1000001, max: 10000000, name: 'Normal' },
            
            // High balance - slight reduction
            HIGH: { min: 10000001, max: 50000000, name: 'High' },
            
            // Very high balance - moderate reduction
            VERY_HIGH: { min: 50000001, max: 200000000, name: 'Very High' },
            
            // Ultra high balance - significant reduction
            ULTRA_HIGH: { min: 200000001, max: 1000000000, name: 'Ultra High' },
            
            // Mega whale - maximum reduction
            MEGA_WHALE: { min: 1000000001, max: Infinity, name: 'Mega Whale' }
        };
    }

    /**
     * Define adjustment rules for each balance tier
     */
    defineAdjustmentRules() {
        return {
            ULTRA_LOW: {
                winRateMultiplier: 1.15,    // +15% win rate bonus
                payoutMultiplier: 1.10,     // +10% payout bonus
                houseEdgeReduction: 0.02,   // -2% house edge
                description: 'Helping new players grow'
            },
            LOW: {
                winRateMultiplier: 1.08,    // +8% win rate bonus
                payoutMultiplier: 1.05,     // +5% payout bonus
                houseEdgeReduction: 0.01,   // -1% house edge
                description: 'Slight assistance for low balance'
            },
            NORMAL: {
                winRateMultiplier: 1.00,    // Standard rates
                payoutMultiplier: 1.00,     // Standard payouts
                houseEdgeReduction: 0.00,   // Standard house edge
                description: 'Standard game rates'
            },
            HIGH: {
                winRateMultiplier: 0.95,    // -5% win rate
                payoutMultiplier: 0.97,     // -3% payout
                houseEdgeReduction: -0.01,  // +1% house edge
                description: 'Slightly tougher for high balance'
            },
            VERY_HIGH: {
                winRateMultiplier: 0.90,    // -10% win rate
                payoutMultiplier: 0.93,     // -7% payout
                houseEdgeReduction: -0.02,  // +2% house edge
                description: 'Moderate challenge for very high balance'
            },
            ULTRA_HIGH: {
                winRateMultiplier: 0.85,    // -15% win rate
                payoutMultiplier: 0.88,     // -12% payout
                houseEdgeReduction: -0.03,  // +3% house edge
                description: 'Significant challenge for ultra high balance'
            },
            MEGA_WHALE: {
                winRateMultiplier: 0.80,    // -20% win rate
                payoutMultiplier: 0.85,     // -15% payout
                houseEdgeReduction: -0.04,  // +4% house edge
                description: 'Maximum challenge for mega whales'
            }
        };
    }

    /**
     * Determine the balance tier for a given balance
     */
    getBalanceTier(totalBalance) {
        for (const [tierName, tier] of Object.entries(this.balanceTiers)) {
            if (totalBalance >= tier.min && totalBalance <= tier.max) {
                return {
                    tier: tierName,
                    name: tier.name,
                    rules: this.adjustmentRules[tierName]
                };
            }
        }
        
        // Default to NORMAL if no tier matches
        return {
            tier: 'NORMAL',
            name: 'Normal',
            rules: this.adjustmentRules.NORMAL
        };
    }

    /**
     * Calculate adjusted win rate based on user balance
     */
    getAdjustedWinRate(baseWinRate, userBalance) {
        const balanceInfo = this.getBalanceTier(userBalance);
        const adjustedRate = baseWinRate * balanceInfo.rules.winRateMultiplier;
        
        // Ensure win rate stays within reasonable bounds (5% to 95%)
        return Math.max(0.05, Math.min(0.95, adjustedRate));
    }

    /**
     * Calculate adjusted payout based on user balance
     */
    getAdjustedPayout(basePayout, userBalance) {
        const balanceInfo = this.getBalanceTier(userBalance);
        const adjustedPayout = basePayout * balanceInfo.rules.payoutMultiplier;
        
        // Ensure minimum payout of 1 coin
        return Math.max(1, Math.floor(adjustedPayout));
    }

    /**
     * Calculate adjusted house edge based on user balance
     */
    getAdjustedHouseEdge(baseHouseEdge, userBalance) {
        const balanceInfo = this.getBalanceTier(userBalance);
        const adjustedEdge = baseHouseEdge - balanceInfo.rules.houseEdgeReduction;
        
        // Ensure house edge stays within reasonable bounds (0.5% to 15%)
        return Math.max(0.005, Math.min(0.15, adjustedEdge));
    }

    /**
     * Get comprehensive balance-based adjustments (with off-economy support)
     */
    getBalanceAdjustments(userBalance, baseWinRate = 0.5, basePayout = 100, baseHouseEdge = 0.05, offEconomy = false) {
        // Special handling for off-economy users
        if (offEconomy) {
            return this.getOffEconomyAdjustments(userBalance, baseWinRate, basePayout, baseHouseEdge);
        }
        
        const balanceInfo = this.getBalanceTier(userBalance);
        
        return {
            balanceTier: balanceInfo.tier,
            tierName: balanceInfo.name,
            description: balanceInfo.rules.description,
            offEconomy: false,
            
            // Adjusted values
            adjustedWinRate: this.getAdjustedWinRate(baseWinRate, userBalance),
            adjustedPayout: this.getAdjustedPayout(basePayout, userBalance),
            adjustedHouseEdge: this.getAdjustedHouseEdge(baseHouseEdge, userBalance),
            
            // Multipliers for transparency
            winRateMultiplier: balanceInfo.rules.winRateMultiplier,
            payoutMultiplier: balanceInfo.rules.payoutMultiplier,
            houseEdgeAdjustment: balanceInfo.rules.houseEdgeReduction,
            
            // Original values for comparison
            baseWinRate,
            basePayout,
            baseHouseEdge
        };
    }

    /**
     * Log balance adjustment for transparency
     */
    logBalanceAdjustment(userId, gameType, adjustments) {
        const { balanceTier, tierName, winRateMultiplier, payoutMultiplier } = adjustments;
        
        logger.info(`🎯 Balance-based adjustment applied: User ${userId} | Game: ${gameType} | Tier: ${tierName} | Win Rate: ${(winRateMultiplier * 100).toFixed(1)}% | Payout: ${(payoutMultiplier * 100).toFixed(1)}%`);
    }

    /**
     * Generate adjustment summary for display
     */
    generateAdjustmentSummary(adjustments) {
        const { tierName, winRateMultiplier, payoutMultiplier, description } = adjustments;
        
        let summary = `**Balance Tier:** ${tierName}\n`;
        summary += `**Effect:** ${description}\n`;
        
        if (winRateMultiplier !== 1.00) {
            const change = ((winRateMultiplier - 1) * 100).toFixed(1);
            summary += `**Win Rate:** ${change > 0 ? '+' : ''}${change}%\n`;
        }
        
        if (payoutMultiplier !== 1.00) {
            const change = ((payoutMultiplier - 1) * 100).toFixed(1);
            summary += `**Payout:** ${change > 0 ? '+' : ''}${change}%\n`;
        }
        
        return summary.trim();
    }

    /**
     * Get special adjustments for off-economy users
     * Off-economy users get neutral rates regardless of balance
     */
    getOffEconomyAdjustments(userBalance, baseWinRate = 0.5, basePayout = 100, baseHouseEdge = 0.05) {
        // Off-economy users get standard rates with slight bonus
        // This maintains fairness while distinguishing them from regular economy
        const offEcoBonus = 1.05; // 5% bonus for off-eco users
        
        return {
            balanceTier: 'OFF_ECONOMY',
            tierName: 'Off Economy',
            description: 'Competing separately from main economy with neutral rates',
            offEconomy: true,
            
            // Adjusted values - slight bonus for off-eco users
            adjustedWinRate: Math.min(0.99, baseWinRate * offEcoBonus),
            adjustedPayout: basePayout * offEcoBonus,
            adjustedHouseEdge: Math.max(0.005, baseHouseEdge * 0.95), // Slightly lower house edge
            
            // Multipliers for transparency  
            winRateMultiplier: offEcoBonus,
            payoutMultiplier: offEcoBonus,
            houseEdgeMultiplier: 0.95,
            
            // Original values for comparison
            originalWinRate: baseWinRate,
            originalPayout: basePayout,
            originalHouseEdge: baseHouseEdge,
            
            // Additional info
            totalBalance: userBalance,
            adjustmentReason: 'Off-economy user receives neutral rates with small bonus'
        };
    }
}

// Export singleton instance
module.exports = new BalanceBasedAdjuster();