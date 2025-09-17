#!/usr/bin/env node

/**
 * Restore Specific User Balance
 * Based on the logs, user 770713192041152523 had:
 * - Started with some legitimate balance
 * - Played work, crime, beg (all lost = true)
 * - But balance kept increasing: 7567 → 10755 → 13508
 * - This suggests fallback system was giving free money
 */

const logger = require('./logger');
const dbManager = require('./database');

async function restoreUser770713192041152523() {
    const userId = '770713192041152523';
    
    logger.info(`🎯 Restoring balance for user ${userId} based on log analysis`);
    
    // From logs: user played work, crime, beg and LOST all games
    // But balance increased from 7567 → 10755 → 13508
    // This is clearly the fallback exploit giving free money
    
    // Conservative restoration: Give them a reasonable starting balance
    // Since they were actively playing, they likely had some legitimate balance
    const restoredWallet = 1000; // Standard starting balance
    const restoredBank = 0;
    
    try {
        logger.info(`📋 Analysis for user ${userId}:`);
        logger.info(`   - Games played: work, crime, beg (all lost)`);
        logger.info(`   - Balance progression: 7567 → 10755 → 13508 (clearly inflated)`);
        logger.info(`   - Cause: Fallback system giving $1000 on cache misses`);
        logger.info(`   - Restoration: $${restoredWallet} wallet (conservative estimate)`);
        
        const currentBalance = await dbManager.getUserBalance(userId);
        logger.info(`   - Current balance: $${currentBalance.wallet} wallet, $${currentBalance.bank} bank`);
        
        const success = await dbManager.setUserBalance(userId, null, restoredWallet, restoredBank, {
            balance_restoration: true,
            restore_timestamp: Date.now(),
            restore_reason: 'fallback_exploit_fix_user_770713192041152523',
            previous_inflated_balance: currentBalance.wallet + currentBalance.bank,
            log_evidence: 'User lost games but balance increased due to fallback system'
        });
        
        if (success) {
            logger.info(`✅ Successfully restored user ${userId} balance to $${restoredWallet}`);
            
            // Verify restoration
            const newBalance = await dbManager.getUserBalance(userId);
            logger.info(`🔍 Verification: New balance is $${newBalance.wallet} wallet, $${newBalance.bank} bank`);
            
            return true;
        } else {
            logger.error(`❌ Failed to restore balance for user ${userId}`);
            return false;
        }
        
    } catch (error) {
        logger.error(`Error restoring user ${userId}: ${error.message}`);
        return false;
    }
}

// Also create a general restoration function for any other affected users
async function restoreUserBalance(userId, correctBalance, reason = 'balance_correction') {
    try {
        logger.info(`🔄 Restoring user ${userId} to $${correctBalance}`);
        
        const success = await dbManager.setUserBalance(userId, null, correctBalance, 0, {
            balance_restoration: true,
            restore_timestamp: Date.now(),
            restore_reason: reason
        });
        
        if (success) {
            logger.info(`✅ Restored user ${userId} balance to $${correctBalance}`);
            return true;
        } else {
            logger.error(`❌ Failed to restore user ${userId}`);
            return false;
        }
    } catch (error) {
        logger.error(`Error restoring user ${userId}: ${error.message}`);
        return false;
    }
}

if (require.main === module) {
    restoreUser770713192041152523().then(success => {
        if (success) {
            logger.info('🎉 User balance restoration completed');
        } else {
            logger.error('❌ User balance restoration failed');
        }
        process.exit(success ? 0 : 1);
    });
}

module.exports = { restoreUser770713192041152523, restoreUserBalance };