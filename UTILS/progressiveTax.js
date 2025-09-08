/**
 * Progressive Tax System for Wealth Redistribution
 * Implements tax brackets based on user wealth and win amounts
 */

const dbManager = require('./database');
const logger = require('./logger');

class ProgressiveTaxSystem {
    constructor() {
        // Tax brackets based on user's total wealth
        this.wealthBrackets = [
            { min: 0, max: 1000000, rate: 0.00 },           // Under $1M: 0% tax
            { min: 1000000, max: 10000000, rate: 0.05 },    // $1M-$10M: 5% tax
            { min: 10000000, max: 50000000, rate: 0.10 },   // $10M-$50M: 10% tax
            { min: 50000000, max: 250000000, rate: 0.15 },  // $50M-$250M: 15% tax
            { min: 250000000, max: 1000000000, rate: 0.20 }, // $250M-$1B: 20% tax
            { min: 1000000000, max: Infinity, rate: 0.25 }   // Over $1B: 25% tax
        ];

        // Additional tax on very large wins (anti-whale measures)
        this.largePayout = [
            { min: 0, max: 100000, rate: 0.00 },           // Under $100K win: 0% additional tax
            { min: 100000, max: 500000, rate: 0.02 },      // $100K-$500K win: 2% additional tax
            { min: 500000, max: 2000000, rate: 0.05 },     // $500K-$2M win: 5% additional tax
            { min: 2000000, max: 10000000, rate: 0.08 },   // $2M-$10M win: 8% additional tax
            { min: 10000000, max: Infinity, rate: 0.12 }   // Over $10M win: 12% additional tax
        ];
    }

    /**
     * Calculate tax on a payout based on user's wealth and payout size
     * @param {string} userId - User ID
     * @param {number} payout - Payout amount before tax
     * @returns {Promise<{taxAmount: number, taxRate: number, netPayout: number, taxBreakdown: object}>}
     */
    async calculateTax(userId, payout) {
        try {
            // Get user's current wealth
            const balance = await dbManager.getUserBalance(userId);
            const totalWealth = balance.wallet + balance.bank;

            // Find applicable wealth tax bracket
            const wealthBracket = this.wealthBrackets.find(bracket => 
                totalWealth >= bracket.min && totalWealth < bracket.max
            );

            // Find applicable payout tax bracket
            const payoutBracket = this.largePayout.find(bracket =>
                payout >= bracket.min && payout < bracket.max
            );

            // Calculate total tax rate
            const wealthTaxRate = wealthBracket ? wealthBracket.rate : 0.25;
            const payoutTaxRate = payoutBracket ? payoutBracket.rate : 0.12;
            const combinedTaxRate = Math.min(0.35, wealthTaxRate + payoutTaxRate); // Cap at 35%

            // Calculate tax amount
            const taxAmount = Math.floor(payout * combinedTaxRate);
            const netPayout = Math.max(payout - taxAmount, payout * 0.5); // Never tax more than 50%

            const result = {
                taxAmount: taxAmount,
                taxRate: combinedTaxRate,
                netPayout: netPayout,
                taxBreakdown: {
                    totalWealth: totalWealth,
                    wealthTaxRate: wealthTaxRate,
                    payoutTaxRate: payoutTaxRate,
                    combinedRate: combinedTaxRate,
                    originalPayout: payout
                }
            };

            // Log significant taxes
            if (taxAmount > 10000) {
                logger.info(`💰 Progressive Tax Applied: ${userId} - Wealth: $${totalWealth.toLocaleString()} - Payout: $${payout.toLocaleString()} - Tax: $${taxAmount.toLocaleString()} (${(combinedTaxRate * 100).toFixed(1)}%)`);
            }

            return result;

        } catch (error) {
            logger.error(`Progressive tax calculation failed for ${userId}: ${error.message}`);
            return {
                taxAmount: 0,
                taxRate: 0,
                netPayout: payout,
                taxBreakdown: { error: error.message }
            };
        }
    }

    /**
     * Apply tax to a payout and distribute to tax pool (for future redistribution)
     * @param {string} userId - User ID
     * @param {number} payout - Original payout amount
     * @returns {Promise<{netPayout: number, taxAmount: number}>}
     */
    async applyTax(userId, payout) {
        if (payout <= 0) return { netPayout: payout, taxAmount: 0 };

        const taxResult = await this.calculateTax(userId, payout);
        
        if (taxResult.taxAmount > 0) {
            // In a real implementation, you would:
            // 1. Store tax amount in a redistribution pool
            // 2. Possibly give small amounts to lower-wealth players
            // 3. Use for server events/bonuses
            
            logger.debug(`Tax applied: $${taxResult.taxAmount.toLocaleString()} collected from ${userId}`);
        }

        return {
            netPayout: taxResult.netPayout,
            taxAmount: taxResult.taxAmount,
            taxRate: taxResult.taxRate
        };
    }

    /**
     * Get tax preview for a user without applying it
     * @param {string} userId - User ID  
     * @param {number} hypotheticalPayout - Payout to calculate tax for
     * @returns {Promise<object>} Tax calculation preview
     */
    async previewTax(userId, hypotheticalPayout) {
        return await this.calculateTax(userId, hypotheticalPayout);
    }
}

module.exports = new ProgressiveTaxSystem();