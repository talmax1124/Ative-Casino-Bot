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
            { min: 0, max: 1_000_000, rate: 0.00 },             // Under $1M: 0%
            { min: 1_000_000, max: 10_000_000, rate: 0.08 },    // $1M–$10M: 8% (increased from 5%)
            { min: 10_000_000, max: 50_000_000, rate: 0.12 },   // $10M–$50M: 12% (increased from 7%)
            { min: 50_000_000, max: 250_000_000, rate: 0.16 },  // $50M–$250M: 16% (increased from 10%)
            { min: 250_000_000, max: 1_000_000_000, rate: 0.22 }, // $250M–$1B: 22% (increased from 15%)
            { min: 1_000_000_000, max: 3_000_000_000, rate: 0.28 }, // $1B–$3B: 28% (reduced from 20%, new bracket)
            { min: 3_000_000_000, max: 8_000_000_000, rate: 0.32 }, // $3B–$8B: 32% (new bracket, reduced from 45%)
            { min: 8_000_000_000, max: Infinity, rate: 0.35 }     // Over $8B: 35% (reduced from 45%, higher threshold)
        ];

        // Additional tax on very large wins (anti-whale measures)
        this.largePayout = [
            { min: 0, max: 100_000, rate: 0.00 },            // Under $100K: 0%
            { min: 100_000, max: 500_000, rate: 0.03 },      // $100K–$500K: 3%
            { min: 500_000, max: 2_000_000, rate: 0.07 },    // $500K–$2M: 7%
            { min: 2_000_000, max: 10_000_000, rate: 0.12 }, // $2M–$10M: 12%
            { min: 10_000_000, max: Infinity, rate: 0.20 }  // Over $10M: 20%
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
            const combinedTaxRate = Math.min(0.50, wealthTaxRate + payoutTaxRate); // Cap at 50%

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
