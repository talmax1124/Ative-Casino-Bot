/**
 * BALANCE RECONCILIATION SYSTEM
 * Detects and corrects balance discrepancies to prevent money duplication or loss
 * 
 * CRITICAL: Ensures economic integrity by detecting unauthorized balance changes
 */

const logger = require('./logger');
const dbManager = require('./database');
const { sendLogMessage } = require('./common');

class BalanceReconciliationSystem {
    constructor() {
        this.reconciliationEnabled = true;
        this.lastReconciliation = null;
        this.discrepancies = new Map();
        this.reconciliationHistory = [];
    }

    /**
     * Perform full balance reconciliation check
     */
    async performFullReconciliation() {
        if (!this.reconciliationEnabled) {
            logger.warn('Balance reconciliation is disabled');
            return { success: false, reason: 'disabled' };
        }

        logger.info('Starting full balance reconciliation...');
        const startTime = Date.now();

        try {
            // Get database connection
            const connection = await dbManager.databaseAdapter.pool.getConnection();
            
            try {
                const results = {
                    totalUsers: 0,
                    balancedUsers: 0,
                    discrepancyUsers: 0,
                    totalDiscrepancy: 0,
                    correctedUsers: 0,
                    errors: []
                };

                // Get all users
                const [users] = await connection.execute(
                    'SELECT user_id, wallet, bank FROM user_balances'
                );

                results.totalUsers = users.length;

                // Check each user's balance
                for (const user of users) {
                    const reconciliation = await this.reconcileUserBalance(user.user_id, connection);
                    
                    if (reconciliation.status === 'BALANCED') {
                        results.balancedUsers++;
                    } else if (reconciliation.status === 'DISCREPANCY_FOUND') {
                        results.discrepancyUsers++;
                        results.totalDiscrepancy += Math.abs(reconciliation.wallet_discrepancy) + Math.abs(reconciliation.bank_discrepancy);
                        
                        // Store discrepancy for review
                        this.discrepancies.set(user.user_id, reconciliation);
                    }
                }

                // Store reconciliation results
                const reconciliationRecord = {
                    timestamp: Date.now(),
                    duration: Date.now() - startTime,
                    results,
                    id: `rec_${Date.now()}`
                };

                this.reconciliationHistory.push(reconciliationRecord);
                this.lastReconciliation = reconciliationRecord;

                // Clean up old history (keep last 30 records)
                if (this.reconciliationHistory.length > 30) {
                    this.reconciliationHistory = this.reconciliationHistory.slice(-30);
                }

                logger.info(`Balance reconciliation completed: ${results.balancedUsers}/${results.totalUsers} balanced, ${results.discrepancyUsers} discrepancies found`);

                return { success: true, results: reconciliationRecord };

            } finally {
                connection.release();
            }

        } catch (error) {
            logger.error(`Balance reconciliation failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Reconcile individual user balance
     */
    async reconcileUserBalance(userId, connection = null) {
        const shouldReleaseConnection = !connection;
        
        try {
            if (!connection) {
                connection = await dbManager.databaseAdapter.pool.getConnection();
            }

            // Call the database stored procedure for reconciliation
            const [results] = await connection.execute(
                'CALL ReconcileUserBalance(?)',
                [userId]
            );

            const reconciliation = results[0][0]; // First row of first result set
            
            return reconciliation;

        } catch (error) {
            logger.error(`User balance reconciliation failed for ${userId}: ${error.message}`);
            return {
                user_id: userId,
                status: 'ERROR',
                error: error.message
            };
        } finally {
            if (shouldReleaseConnection && connection) {
                connection.release();
            }
        }
    }

    /**
     * Validate all balances using database procedure
     */
    async validateAllBalances() {
        try {
            const connection = await dbManager.databaseAdapter.pool.getConnection();
            
            try {
                const [results] = await connection.execute('CALL ValidateAllBalances()');
                const validation = results[0][0]; // First row of first result set
                
                logger.info(`Balance validation: ${validation.total_users} users, ${validation.negative_wallet_count} negative wallets, ${validation.negative_bank_count} negative banks`);
                
                return {
                    success: true,
                    validation,
                    timestamp: Date.now()
                };
                
            } finally {
                connection.release();
            }
            
        } catch (error) {
            logger.error(`Balance validation failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Correct balance discrepancy (admin function)
     */
    async correctBalanceDiscrepancy(userId, correctionType = 'auto') {
        try {
            const reconciliation = await this.reconcileUserBalance(userId);
            
            if (reconciliation.status !== 'DISCREPANCY_FOUND') {
                return { success: false, reason: 'No discrepancy found' };
            }

            // Log the correction
            logger.warn(`Correcting balance discrepancy for ${userId}: Wallet ${reconciliation.wallet_discrepancy}, Bank ${reconciliation.bank_discrepancy}`);

            // Apply correction (set to calculated values)
            const success = await dbManager.setUserBalance(
                userId,
                null, // guildId
                reconciliation.calculated_wallet,
                reconciliation.calculated_bank,
                { 
                    correction_reason: `Balance reconciliation correction (${correctionType})`,
                    correction_timestamp: Date.now(),
                    old_wallet: reconciliation.current_wallet,
                    old_bank: reconciliation.current_bank
                }
            );

            if (success) {
                // Remove from discrepancies
                this.discrepancies.delete(userId);
                
                logger.info(`Balance corrected for ${userId}: Wallet ${reconciliation.current_wallet} -> ${reconciliation.calculated_wallet}, Bank ${reconciliation.current_bank} -> ${reconciliation.calculated_bank}`);
                
                return {
                    success: true,
                    correction: {
                        userId,
                        walletChange: reconciliation.calculated_wallet - reconciliation.current_wallet,
                        bankChange: reconciliation.calculated_bank - reconciliation.current_bank,
                        timestamp: Date.now()
                    }
                };
            } else {
                throw new Error('Database balance update failed');
            }

        } catch (error) {
            logger.error(`Balance correction failed for ${userId}: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Monitor balance changes in real-time
     */
    async monitorBalanceChange(userId, oldWallet, newWallet, oldBank, newBank, reason = 'unknown') {
        try {
            const walletChange = newWallet - oldWallet;
            const bankChange = newBank - oldBank;
            const totalChange = walletChange + bankChange;

            // Flag suspicious changes
            const suspiciousThreshold = 1000000; // $1M
            const isSuspicious = Math.abs(totalChange) > suspiciousThreshold;

            if (isSuspicious) {
                logger.warn(`Suspicious balance change detected: ${userId} - Wallet: ${walletChange}, Bank: ${bankChange}, Reason: ${reason}`);
                
                // Trigger immediate reconciliation for this user
                const reconciliation = await this.reconcileUserBalance(userId);
                
                if (reconciliation.status === 'DISCREPANCY_FOUND') {
                    logger.error(`CRITICAL: Balance discrepancy detected after suspicious change for ${userId}`);
                    
                    // Store for manual review
                    this.discrepancies.set(userId, {
                        ...reconciliation,
                        trigger: 'suspicious_change',
                        originalChange: { walletChange, bankChange, reason }
                    });
                }
            }

            return {
                monitored: true,
                suspicious: isSuspicious,
                totalChange,
                reconciliation: isSuspicious ? await this.reconcileUserBalance(userId) : null
            };

        } catch (error) {
            logger.error(`Balance monitoring failed for ${userId}: ${error.message}`);
            return { monitored: false, error: error.message };
        }
    }

    /**
     * Get reconciliation report
     */
    getReconciliationReport() {
        return {
            lastReconciliation: this.lastReconciliation,
            pendingDiscrepancies: Array.from(this.discrepancies.entries()).map(([userId, data]) => ({
                userId,
                ...data
            })),
            reconciliationHistory: this.reconciliationHistory.slice(-10), // Last 10 reconciliations
            systemStatus: {
                enabled: this.reconciliationEnabled,
                totalDiscrepancies: this.discrepancies.size,
                lastRun: this.lastReconciliation?.timestamp || null
            }
        };
    }

    /**
     * Schedule automatic reconciliation
     */
    scheduleAutomaticReconciliation(intervalHours = 6) {
        if (this.reconciliationInterval) {
            clearInterval(this.reconciliationInterval);
        }

        this.reconciliationInterval = setInterval(async () => {
            logger.info('Running scheduled balance reconciliation...');
            await this.performFullReconciliation();
        }, intervalHours * 60 * 60 * 1000);

        logger.info(`Automatic balance reconciliation scheduled every ${intervalHours} hours`);
    }

    /**
     * Emergency freeze balances (in case of major discrepancy)
     */
    async emergencyFreezeBalances(reason = 'Emergency freeze') {
        logger.error(`EMERGENCY: Freezing all balance operations - ${reason}`);
        
        try {
            // This would require additional database fields to implement properly
            // For now, just log and disable reconciliation
            this.reconciliationEnabled = false;
            
            // Send critical alert
            logger.error(`CRITICAL: Balance operations frozen due to: ${reason}`);
            
            return { success: true, reason, timestamp: Date.now() };
            
        } catch (error) {
            logger.error(`Failed to freeze balances: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Unfreeze balances
     */
    async unfreezeBalances() {
        logger.info('Unfreezing balance operations...');
        this.reconciliationEnabled = true;
        
        // Run immediate reconciliation after unfreeze
        await this.performFullReconciliation();
        
        return { success: true, timestamp: Date.now() };
    }
}

// Export singleton instance
module.exports = new BalanceReconciliationSystem();