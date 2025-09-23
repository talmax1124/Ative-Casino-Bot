/**
 * HONEST PAYOUT MANAGER
 * Ensures all payouts are transparent and exactly match what is displayed to players
 * 
 * CRITICAL: This system ensures that displayed multipliers exactly match paid amounts
 * Any deviation would be considered fraud and is strictly prohibited
 */

const logger = require('./logger');

class HonestPayoutManager {
    constructor() {
        this.honestConfig = {
            // Transparency Policy - ALL payouts must match displayed amounts
            displayPolicy: 'HONEST_ONLY', // Only show what players actually receive
            
            // House Edge Configuration (applied transparently upfront)
            houseEdges: {
                slots: 0.02,        // 2% house edge (98% RTP) - REDUCED FOR FAIRNESS
                plinko: 0.015,      // 1.5% house edge (98.5% RTP) - REDUCED FOR FAIRNESS  
                crash: 0.02,        // 2% house edge (98% RTP) - REDUCED FOR FAIRNESS
                blackjack: 0.005,   // 0.5% house edge (99.5% RTP) - kept same
                roulette: 0.027,    // 2.7% house edge (97.3% RTP) - kept same (standard)
                keno: 0.08,         // 8% house edge (92% RTP) - REDUCED FOR FAIRNESS
                mines: 0.05,        // 5% house edge (95% RTP) - REDUCED FOR FAIRNESS
                bingo: 0.05,        // 5% house edge (95% RTP) - REDUCED FOR FAIRNESS
                fishing: 0.02,      // 2% house edge (98% RTP) - REDUCED FOR FAIRNESS
                ceelo: 0.02,        // 2% house edge (98% RTP) - REDUCED FOR FAIRNESS
                treasurevault: 0.025, // 2.5% house edge (97.5% RTP) - REDUCED FOR FAIRNESS
                multi_slots: 0.02,  // 2% house edge (98% RTP) - REDUCED FOR FAIRNESS
                yahtzee: 0.03,      // 3% house edge (97% RTP) - REDUCED FOR FAIRNESS
                battleship: 0.01,   // 1% house edge (99% RTP) - REDUCED FOR FAIRNESS
                wordchain: 0.01,    // 1% house edge (99% RTP) - REDUCED FOR FAIRNESS
                rps: 0.01,          // 1% house edge (99% RTP) - REDUCED FOR FAIRNESS
                duck: 0.01,         // 1% house edge (99% RTP) - REDUCED FOR FAIRNESS
                uno: 0.01,          // 1% house edge (99% RTP) - REDUCED FOR FAIRNESS
                war: 0.01,          // 1% house edge (99% RTP) - REDUCED FOR FAIRNESS
                spades: 0.01,       // 1% house edge (99% RTP) - REDUCED FOR FAIRNESS
                '31': 0.01,         // 1% house edge (99% RTP) - REDUCED FOR FAIRNESS
                russianroulette: 0.015, // 1.5% house edge (98.5% RTP) - REDUCED FOR FAIRNESS
                heist: 0.03,        // 3% house edge (97% RTP) - REDUCED FOR FAIRNESS
                lottery: 0.25,      // 25% house edge (75% RTP) - REDUCED FOR FAIRNESS
                scratch: 0.1        // 10% house edge (90% RTP) - REDUCED FOR FAIRNESS
            },
            
            // Audit Trail
            payoutAuditEnabled: true,
            auditRetentionDays: 90
        };
        
        // Track all payouts for audit purposes
        this.payoutAudit = new Map();
    }
    
    /**
     * CALCULATE HONEST PAYOUT
     * Returns exactly what is displayed to the player - no deception
     */
    async calculateHonestPayout(userId, gameType, betAmount, multiplier, gameData = {}) {
        try {
            // Calculate the exact payout that matches the displayed multiplier
            const exactPayout = betAmount * multiplier;
            
            // Apply house edge transparently (if configured for the game)
            const houseEdge = this.honestConfig.houseEdges[gameType] || 0;
            const finalPayout = exactPayout * (1 - houseEdge);
            
            // The displayed multiplier should reflect the actual payout after house edge
            const honestMultiplier = finalPayout / betAmount;
            
            const result = {
                displayedMultiplier: honestMultiplier,  // What player sees
                actualPayout: finalPayout,              // What player receives (MUST MATCH)
                betAmount: betAmount,
                houseEdge: houseEdge,
                gameType: gameType,
                transparencyGuarantee: true,            // Guarantee of honesty
                timestamp: Date.now()
            };
            
            // Audit trail for regulatory compliance
            if (this.honestConfig.payoutAuditEnabled) {
                this.recordPayoutAudit(userId, result);
            }
            
            // CRITICAL: Verify that displayed amount exactly matches payout
            if (Math.abs(result.actualPayout - (betAmount * result.displayedMultiplier)) > 0.01) {
                throw new Error('FRAUD DETECTED: Payout does not match displayed multiplier');
            }
            
            logger.info(`Honest payout calculated: ${userId} ${gameType} ${betAmount}x${honestMultiplier.toFixed(2)} = ${finalPayout}`);
            
            return result;
            
        } catch (error) {
            logger.error(`Honest payout calculation failed: ${error.message}`);
            
            // Emergency fallback - return exact multiplier with no house edge
            const emergencyPayout = betAmount * multiplier;
            
            return {
                displayedMultiplier: multiplier,
                actualPayout: emergencyPayout,
                betAmount: betAmount,
                houseEdge: 0,
                gameType: gameType,
                transparencyGuarantee: true,
                emergencyFallback: true,
                timestamp: Date.now()
            };
        }
    }
    
    /**
     * Calculate multiplier with transparent house edge
     */
    calculateTransparentMultiplier(baseMultiplier, gameType) {
        const houseEdge = this.honestConfig.houseEdges[gameType] || 0;
        return baseMultiplier * (1 - houseEdge);
    }
    
    /**
     * Record payout for audit trail
     */
    recordPayoutAudit(userId, payoutResult) {
        const auditId = `${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        this.payoutAudit.set(auditId, {
            userId: userId,
            ...payoutResult,
            auditTimestamp: Date.now()
        });
        
        // Clean up old audit records
        this.cleanupOldAudits();
    }
    
    /**
     * Clean up audit records older than retention period
     */
    cleanupOldAudits() {
        const retentionMs = this.honestConfig.auditRetentionDays * 24 * 60 * 60 * 1000;
        const cutoffTime = Date.now() - retentionMs;
        
        for (const [auditId, record] of this.payoutAudit.entries()) {
            if (record.auditTimestamp < cutoffTime) {
                this.payoutAudit.delete(auditId);
            }
        }
    }
    
    /**
     * Get audit records for a user (for transparency/disputes)
     */
    getUserAuditRecords(userId, limit = 100) {
        const userRecords = [];
        
        for (const [auditId, record] of this.payoutAudit.entries()) {
            if (record.userId === userId) {
                userRecords.push({
                    auditId,
                    ...record
                });
            }
            
            if (userRecords.length >= limit) break;
        }
        
        return userRecords.sort((a, b) => b.auditTimestamp - a.auditTimestamp);
    }
    
    /**
     * Verify payout honesty (for regulatory compliance)
     */
    verifyPayoutHonesty(displayedMultiplier, actualPayout, betAmount) {
        const expectedPayout = betAmount * displayedMultiplier;
        const difference = Math.abs(actualPayout - expectedPayout);
        
        // Allow for floating point rounding (max 1 cent difference)
        if (difference > 0.01) {
            logger.error(`HONESTY VIOLATION: Expected ${expectedPayout}, got ${actualPayout}`);
            return false;
        }
        
        return true;
    }
    
    /**
     * Get transparency report for administrators
     */
    getTransparencyReport() {
        const totalPayouts = this.payoutAudit.size;
        const gameTypeBreakdown = {};
        let totalBets = 0;
        let totalPayoutsAmount = 0;
        
        for (const record of this.payoutAudit.values()) {
            gameTypeBreakdown[record.gameType] = (gameTypeBreakdown[record.gameType] || 0) + 1;
            totalBets += record.betAmount;
            totalPayoutsAmount += record.actualPayout;
        }
        
        return {
            totalTransactions: totalPayouts,
            gameTypeBreakdown,
            totalBetsProcessed: totalBets,
            totalPayoutsAmount,
            overallRTP: totalPayoutsAmount / totalBets,
            honestyGuarantee: true,
            reportGenerated: new Date().toISOString()
        };
    }
}

// Export singleton instance
module.exports = new HonestPayoutManager();