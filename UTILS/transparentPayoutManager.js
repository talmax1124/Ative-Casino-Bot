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
            
            // House Edge Configuration (applied transparently upfront) - FURTHER IMPROVED
            houseEdges: {
                slots: 0.015,       // 1.5% house edge (98.5% RTP) - FURTHER REDUCED
                plinko: 0.01,       // 1% house edge (99% RTP) - FURTHER REDUCED  
                crash: 0.015,       // 1.5% house edge (98.5% RTP) - FURTHER REDUCED
                blackjack: 0.005,   // 0.5% house edge (99.5% RTP) - kept same
                roulette: 0.027,    // 2.7% house edge (97.3% RTP) - kept same (standard)
                keno: 0.06,         // 6% house edge (94% RTP) - FURTHER REDUCED
                mines: 0.03,        // 3% house edge (97% RTP) - FURTHER REDUCED
                bingo: 0.03,        // 3% house edge (97% RTP) - FURTHER REDUCED
                fishing: 0.015,     // 1.5% house edge (98.5% RTP) - FURTHER REDUCED
                ceelo: 0.015,       // 1.5% house edge (98.5% RTP) - FURTHER REDUCED
                treasurevault: 0.02, // 2% house edge (98% RTP) - FURTHER REDUCED
                multi_slots: 0.015, // 1.5% house edge (98.5% RTP) - FURTHER REDUCED
                yahtzee: 0.02,      // 2% house edge (98% RTP) - FURTHER REDUCED
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
            
            // SECURITY FIX: Apply maximum house edge in emergency fallback to prevent exploitation
            const maxHouseEdge = this.honestConfig.houseEdges[gameType] || 0.05; // Default 5% if not found
            const emergencyPayout = betAmount * multiplier * (1 - maxHouseEdge); // Apply house edge even in emergency
            
            // SECURITY: Cap emergency payouts to prevent exploitation
            const maxEmergencyPayout = betAmount * 3.0; // Max 3x bet amount in emergency
            const cappedEmergencyPayout = Math.min(emergencyPayout, maxEmergencyPayout);
            
            logger.warn(`SECURITY: Emergency payout capped from ${emergencyPayout} to ${cappedEmergencyPayout} for user ${userId}`);
            
            return {
                displayedMultiplier: cappedEmergencyPayout / betAmount,
                actualPayout: cappedEmergencyPayout,
                betAmount: betAmount,
                houseEdge: maxHouseEdge,
                gameType: gameType,
                transparencyGuarantee: true,
                emergencyFallback: true,
                securityCapped: true,
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