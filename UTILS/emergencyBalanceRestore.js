const logger = require('./logger');

class EmergencyBalanceRestore {
    constructor() {
        this.backupData = new Map();
        this.restoreQueue = [];
    }

    /**
     * Backup user balance before any operation
     */
    backupUserBalance(userId, balanceData) {
        const timestamp = Date.now();
        const backup = {
            ...balanceData,
            backup_timestamp: timestamp,
            backup_reason: 'pre_operation'
        };
        
        this.backupData.set(`${userId}_${timestamp}`, backup);
        
        // Keep only last 10 backups per user
        const userBackups = Array.from(this.backupData.keys())
            .filter(key => key.startsWith(`${userId}_`))
            .sort((a, b) => {
                const aTime = parseInt(a.split('_')[1]);
                const bTime = parseInt(b.split('_')[1]);
                return bTime - aTime;
            });
            
        // Remove oldest backups if more than 10
        if (userBackups.length > 10) {
            userBackups.slice(10).forEach(key => {
                this.backupData.delete(key);
            });
        }
        
        logger.debug(`Backed up balance for user ${userId}: wallet=${balanceData.wallet}, bank=${balanceData.bank}`);
    }

    /**
     * Get the most recent backup for a user
     */
    getLatestBackup(userId) {
        const userBackups = Array.from(this.backupData.keys())
            .filter(key => key.startsWith(`${userId}_`))
            .sort((a, b) => {
                const aTime = parseInt(a.split('_')[1]);
                const bTime = parseInt(b.split('_')[1]);
                return bTime - aTime;
            });
            
        if (userBackups.length > 0) {
            return this.backupData.get(userBackups[0]);
        }
        
        return null;
    }

    /**
     * Restore user balance from backup
     */
    async restoreUserBalance(userId, databaseManager) {
        try {
            const backup = this.getLatestBackup(userId);
            if (!backup) {
                logger.warn(`No backup found for user ${userId}`);
                return false;
            }

            // Restore to database
            const success = await databaseManager.setUserBalance(
                userId, 
                null, 
                backup.wallet, 
                backup.bank, 
                {
                    restored_from_backup: true,
                    restore_timestamp: Date.now(),
                    original_backup_time: backup.backup_timestamp
                }
            );

            if (success) {
                logger.info(`Restored balance for user ${userId}: wallet=${backup.wallet}, bank=${backup.bank}`);
                return true;
            } else {
                logger.error(`Failed to restore balance for user ${userId}`);
                return false;
            }
        } catch (error) {
            logger.error(`Error restoring balance for user ${userId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Force disable fallback mode and restore connection
     */
    async emergencyDisableFallback(databaseManager) {
        try {
            logger.warn('🚨 EMERGENCY: Forcing fallback mode disable and connection restore');
            
            // AGGRESSIVELY force disable fallback mode
            if (databaseManager.fallbackSystem) {
                databaseManager.fallbackSystem.disableFallbackMode();
                databaseManager.fallbackSystem.fallbackMode = false;
                databaseManager.fallbackSystem.consecutiveFailures = 0;
                logger.info('✅ Fallback mode forcibly disabled');
            }

            // Force reinitialize database adapter if needed
            if (!databaseManager.databaseAdapter) {
                logger.warn('🔄 Database adapter missing - attempting to reinitialize...');
                const databaseAdapter = require('./databaseAdapter');
                databaseManager.databaseAdapter = databaseAdapter;
                await databaseManager.databaseAdapter.init();
                databaseManager.usingAdapter = true;
                logger.info('✅ Database adapter reinitialized');
            }

            // Test database connection
            if (databaseManager.databaseAdapter && databaseManager.databaseAdapter.testConnection) {
                await databaseManager.databaseAdapter.testConnection();
                logger.info('✅ Database connection test successful');
            }

            // Clear any cached data that might be stale
            if (databaseManager.fallbackSystem && databaseManager.fallbackSystem.inMemoryCache) {
                const cacheSize = databaseManager.fallbackSystem.inMemoryCache.size;
                databaseManager.fallbackSystem.inMemoryCache.clear();
                logger.info(`🗑️ Cleared ${cacheSize} entries from fallback cache`);
            }

            // Force set using adapter to true
            databaseManager.usingAdapter = true;
            logger.info('✅ Database adapter mode forcibly enabled');

            return true;
        } catch (error) {
            logger.error(`Failed to disable fallback mode: ${error.message}`);
            return false;
        }
    }

    /**
     * Get all users with suspicious balance increases
     */
    getSuspiciousBalanceUsers() {
        const suspicious = [];
        for (const [key, backup] of this.backupData.entries()) {
            if (backup.wallet > 10000 || backup.bank > 10000) {
                suspicious.push({
                    userId: backup.user_id,
                    wallet: backup.wallet,
                    bank: backup.bank,
                    timestamp: backup.backup_timestamp
                });
            }
        }
        return suspicious;
    }
}

module.exports = new EmergencyBalanceRestore();