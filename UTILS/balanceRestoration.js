#!/usr/bin/env node

/**
 * Balance Restoration Script
 * Identifies and restores users who received inflated balances due to fallback system issues
 */

const logger = require('./logger');
const dbManager = require('./database');

class BalanceRestoration {
    constructor() {
        this.suspiciousUsers = [];
        this.restoredUsers = [];
    }

    async findInflatedBalances() {
        try {
            logger.info('🔍 Scanning for users with inflated balances...');
            
            // Check if we can access game results from database
            if (dbManager.databaseAdapter && dbManager.databaseAdapter.getAllUsers) {
                const users = await dbManager.databaseAdapter.getAllUsers();
                
                for (const user of users) {
                    // Flag users with suspiciously high balances
                    if (user.wallet > 5000 || user.bank > 5000) {
                        this.suspiciousUsers.push({
                            userId: user.user_id,
                            wallet: user.wallet,
                            bank: user.bank,
                            total: user.wallet + user.bank,
                            lastUpdate: user.updated_at
                        });
                    }
                }
            } else {
                // Manual check for known affected user
                logger.warn('Database adapter not available, checking known affected user...');
                const knownUser = '770713192041152523';
                const balance = await dbManager.getUserBalance(knownUser);
                
                if (!balance.fallback_mode && (balance.wallet > 5000 || balance.bank > 5000)) {
                    this.suspiciousUsers.push({
                        userId: knownUser,
                        wallet: balance.wallet,
                        bank: balance.bank,
                        total: balance.wallet + balance.bank,
                        source: 'known_affected'
                    });
                }
            }
            
            logger.info(`Found ${this.suspiciousUsers.length} users with potentially inflated balances`);
            return this.suspiciousUsers;
            
        } catch (error) {
            logger.error(`Error finding inflated balances: ${error.message}`);
            return [];
        }
    }

    async analyzeUserHistory(userId) {
        try {
            // Get recent game history to understand legitimate earnings
            const gameHistory = await dbManager.getGameHistory(userId, null, 50);
            
            let legitimateEarnings = 1000; // Default starting balance
            let totalBets = 0;
            let totalWins = 0;
            let totalLosses = 0;
            
            if (gameHistory && gameHistory.length > 0) {
                for (const game of gameHistory) {
                    totalBets += Math.abs(game.bet_amount || 0);
                    
                    if (game.won) {
                        totalWins += (game.payout || 0);
                    } else {
                        totalLosses += Math.abs(game.payout || game.bet_amount || 0);
                    }
                }
                
                // Calculate what balance should be based on game history
                legitimateEarnings = 1000 + totalWins - totalLosses;
                legitimateEarnings = Math.max(0, legitimateEarnings); // Can't go negative
            }
            
            return {
                estimatedLegitimateBalance: legitimateEarnings,
                totalBets,
                totalWins,
                totalLosses,
                gameCount: gameHistory?.length || 0
            };
            
        } catch (error) {
            logger.warn(`Could not analyze history for user ${userId}: ${error.message}`);
            return {
                estimatedLegitimateBalance: 1000, // Conservative default
                totalBets: 0,
                totalWins: 0,
                totalLosses: 0,
                gameCount: 0
            };
        }
    }

    async restoreUserBalance(userId, correctWallet, correctBank = 0, reason = 'fallback_exploit_fix') {
        try {
            logger.info(`🔄 Restoring balance for user ${userId}: $${correctWallet} wallet, $${correctBank} bank`);
            
            const success = await dbManager.setUserBalance(userId, null, correctWallet, correctBank, {
                balance_restoration: true,
                restore_timestamp: Date.now(),
                restore_reason: reason,
                previous_balance_flagged: true
            });
            
            if (success) {
                this.restoredUsers.push({
                    userId,
                    newWallet: correctWallet,
                    newBank: correctBank,
                    timestamp: Date.now()
                });
                logger.info(`✅ Restored balance for user ${userId}`);
                return true;
            } else {
                logger.error(`❌ Failed to restore balance for user ${userId}`);
                return false;
            }
            
        } catch (error) {
            logger.error(`Error restoring balance for user ${userId}: ${error.message}`);
            return false;
        }
    }

    async performRestoration() {
        try {
            logger.info('🚀 Starting balance restoration process...');
            
            // Step 1: Find affected users
            const affectedUsers = await this.findInflatedBalances();
            
            if (affectedUsers.length === 0) {
                logger.info('✅ No users with inflated balances found');
                return true;
            }
            
            logger.info(`📋 Analyzing ${affectedUsers.length} potentially affected users...`);
            
            // Step 2: Analyze each user and restore
            for (const user of affectedUsers) {
                logger.info(`\n🔍 Analyzing user ${user.userId} (Current: $${user.wallet} wallet, $${user.bank} bank)`);
                
                const analysis = await this.analyzeUserHistory(user.userId);
                
                logger.info(`📊 Analysis: ${analysis.gameCount} games, estimated legitimate balance: $${analysis.estimatedLegitimateBalance}`);
                
                // If current balance is significantly higher than estimated legitimate balance
                const currentTotal = user.wallet + user.bank;
                const estimatedTotal = analysis.estimatedLegitimateBalance;
                
                if (currentTotal > estimatedTotal + 2000) { // 2000 buffer for safety
                    logger.warn(`⚠️  User ${user.userId} has suspicious balance: $${currentTotal} vs estimated $${estimatedTotal}`);
                    
                    // Calculate conservative restoration (give benefit of doubt)
                    const conservativeBalance = Math.max(estimatedTotal, 1000); // At least $1000
                    
                    logger.info(`💡 Recommended restoration: $${conservativeBalance} (conservative estimate)`);
                    
                    // For now, just log - don't auto-restore without confirmation
                    logger.info(`⏸️  Would restore user ${user.userId} from $${currentTotal} to $${conservativeBalance}`);
                    
                } else {
                    logger.info(`✅ User ${user.userId} balance appears legitimate`);
                }
            }
            
            logger.info('\n📋 Restoration analysis complete');
            logger.info(`🔍 Found ${affectedUsers.length} users with high balances`);
            logger.info('💡 Manual review recommended before applying restorations');
            
            return true;
            
        } catch (error) {
            logger.error(`Balance restoration failed: ${error.message}`);
            return false;
        }
    }

    // Safe method to restore specific user if manually verified
    async restoreSpecificUser(userId, newWallet, newBank = 0) {
        logger.info(`🎯 Manual restoration request for user ${userId}`);
        return await this.restoreUserBalance(userId, newWallet, newBank, 'manual_verification');
    }
}

// Run if called directly
if (require.main === module) {
    const restoration = new BalanceRestoration();
    restoration.performRestoration().then(success => {
        if (success) {
            logger.info('🎉 Balance restoration analysis completed');
            process.exit(0);
        } else {
            logger.error('❌ Balance restoration failed');
            process.exit(1);
        }
    }).catch(error => {
        logger.error(`Balance restoration crashed: ${error.message}`);
        process.exit(1);
    });
}

module.exports = BalanceRestoration;