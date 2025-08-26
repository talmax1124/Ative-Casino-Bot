/**
 * Database Fallback Manager
 * Handles automatic fallback from Firestore to MongoDB when quota is exceeded
 */

const logger = require('./logger');
const MongoBackupDB = require('./mongoBackup');

class DatabaseFallback {
    constructor(firestoreDB, options = {}) {
        this.firestore = firestoreDB;
        this.mongo = new MongoBackupDB();
        this.isFirestoreAvailable = true;
        this.lastFirestoreCheck = 0;
        this.checkInterval = 5 * 60 * 1000; // Check Firestore availability every 5 minutes
        
        // Configuration options
        this.config = {
            alwaysBackupPurchases: options.alwaysBackupPurchases !== false, // Default: true
            alwaysBackupBalances: options.alwaysBackupBalances || false,   // Default: false
            syncStrategy: options.syncStrategy || 'smart', // 'smart', 'always', 'fallback-only'
            ...options
        };
        
        // Initialize MongoDB backup
        this.mongo.initialize().catch(err => {
            logger.warn('MongoDB backup initialization failed:', err.message);
        });
    }

    /**
     * Check if an error is due to Firestore quota exhaustion
     */
    isQuotaExhaustedError(error) {
        if (!error) return false;
        
        const message = error.message?.toLowerCase() || '';
        const code = error.code;
        
        return (
            code === 8 ||
            code === 'RESOURCE_EXHAUSTED' ||
            message.includes('quota exceeded') ||
            message.includes('resource_exhausted') ||
            message.includes('too many requests')
        );
    }

    /**
     * Check if Firestore is currently available
     */
    async checkFirestoreAvailability() {
        const now = Date.now();
        
        // Only check every 5 minutes to avoid more quota usage
        if (now - this.lastFirestoreCheck < this.checkInterval) {
            return this.isFirestoreAvailable;
        }

        try {
            // Simple ping test - read a small document
            const testDoc = await this.firestore.collection('_health').doc('ping').get();
            this.isFirestoreAvailable = true;
            this.lastFirestoreCheck = now;
            
            if (!this.isFirestoreAvailable) {
                logger.info('✅ Firestore is available again');
            }
        } catch (error) {
            if (this.isQuotaExhaustedError(error)) {
                if (this.isFirestoreAvailable) {
                    logger.warn('⚠️ Firestore quota exhausted, switching to MongoDB backup');
                }
                this.isFirestoreAvailable = false;
                this.lastFirestoreCheck = now;
            }
        }

        return this.isFirestoreAvailable;
    }

    /**
     * Get user balance with automatic fallback
     */
    async getUserBalance(userId) {
        // Try Firestore first if available
        if (this.isFirestoreAvailable) {
            try {
                const doc = await this.firestore.collection('user_balances').doc(userId).get();
                const data = doc.exists ? doc.data() : { wallet: 0, bank: 0, credits: 0 };
                
                logger.debug(`📊 Firestore: Retrieved balance for ${userId}`);
                return data;
            } catch (error) {
                if (this.isQuotaExhaustedError(error)) {
                    logger.warn('🔄 Firestore quota exhausted, falling back to MongoDB');
                    this.isFirestoreAvailable = false;
                } else {
                    throw error;
                }
            }
        }

        // Fallback to MongoDB
        try {
            const balance = await this.mongo.getUserBalance(userId);
            logger.debug(`🍃 MongoDB: Retrieved balance for ${userId}`);
            return balance;
        } catch (error) {
            logger.error('❌ Both databases failed for getUserBalance:', error.message);
            throw new Error('All databases unavailable');
        }
    }

    /**
     * Update user balance with automatic fallback and sync
     */
    async updateUserBalance(userId, balanceData) {
        const errors = [];
        let success = false;

        // Try Firestore first if available
        if (this.isFirestoreAvailable) {
            try {
                await this.firestore.collection('user_balances').doc(userId).set({
                    ...balanceData,
                    lastUpdated: new Date()
                }, { merge: true });
                
                logger.debug(`📊 Firestore: Updated balance for ${userId}`);
                success = true;
            } catch (error) {
                if (this.isQuotaExhaustedError(error)) {
                    logger.warn('🔄 Firestore quota exhausted during balance update');
                    this.isFirestoreAvailable = false;
                    errors.push(`Firestore: ${error.message}`);
                } else {
                    errors.push(`Firestore: ${error.message}`);
                }
            }
        }

        // Only use MongoDB if Firestore failed or for critical operations
        if (!success || !this.isFirestoreAvailable) {
            try {
                await this.mongo.updateUserBalance(userId, balanceData);
                logger.debug(`🍃 MongoDB: Updated balance for ${userId}`);
                success = true;
            } catch (error) {
                errors.push(`MongoDB: ${error.message}`);
                logger.error('MongoDB balance update failed:', error.message);
            }
        } else {
            // For critical operations (purchases), also backup to MongoDB
            const isCriticalOperation = balanceData.source === 'credit_purchase' || balanceData.paymentId;
            if (isCriticalOperation) {
                try {
                    await this.mongo.updateUserBalance(userId, balanceData);
                    logger.debug(`🍃 MongoDB: Backup for critical operation ${userId}`);
                } catch (error) {
                    logger.warn('MongoDB backup failed (non-critical):', error.message);
                }
            }
        }

        if (!success) {
            throw new Error(`All database updates failed: ${errors.join(', ')}`);
        }

        return { success: true, errors: errors.length > 0 ? errors : null };
    }

    /**
     * Record purchase with automatic fallback
     */
    async recordPurchase(purchaseData) {
        const errors = [];
        let success = false;

        // Try Firestore first if available
        if (this.isFirestoreAvailable) {
            try {
                await this.firestore.collection('purchases').add({
                    ...purchaseData,
                    timestamp: new Date(),
                    source: 'web_portal'
                });
                
                logger.debug(`📊 Firestore: Recorded purchase for ${purchaseData.userId}`);
                success = true;
            } catch (error) {
                if (this.isQuotaExhaustedError(error)) {
                    logger.warn('🔄 Firestore quota exhausted during purchase recording');
                    this.isFirestoreAvailable = false;
                    errors.push(`Firestore: ${error.message}`);
                } else {
                    errors.push(`Firestore: ${error.message}`);
                }
            }
        }

        // Use MongoDB as fallback or for backup of critical purchases
        if (!success || !this.isFirestoreAvailable) {
            try {
                await this.mongo.recordPurchase(purchaseData);
                logger.debug(`🍃 MongoDB: Recorded purchase for ${purchaseData.userId}`);
                success = true;
            } catch (error) {
                errors.push(`MongoDB: ${error.message}`);
                logger.error('MongoDB purchase recording failed:', error.message);
            }
        } else {
            // Always backup purchases to MongoDB (critical for revenue protection)
            try {
                await this.mongo.recordPurchase(purchaseData);
                logger.debug(`🍃 MongoDB: Backup purchase record for ${purchaseData.userId}`);
            } catch (error) {
                logger.warn('MongoDB purchase backup failed (non-critical):', error.message);
            }
        }

        if (!success) {
            throw new Error(`All purchase recordings failed: ${errors.join(', ')}`);
        }

        return { success: true, errors: errors.length > 0 ? errors : null };
    }

    /**
     * Get user data with fallback
     */
    async getUser(userId) {
        // Try Firestore first if available
        if (this.isFirestoreAvailable) {
            try {
                const doc = await this.firestore.collection('users').doc(userId).get();
                if (doc.exists) {
                    logger.debug(`📊 Firestore: Retrieved user ${userId}`);
                    return doc.data();
                }
            } catch (error) {
                if (this.isQuotaExhaustedError(error)) {
                    logger.warn('🔄 Firestore quota exhausted, falling back to MongoDB');
                    this.isFirestoreAvailable = false;
                } else {
                    throw error;
                }
            }
        }

        // Fallback to MongoDB
        try {
            const user = await this.mongo.getUser(userId);
            logger.debug(`🍃 MongoDB: Retrieved user ${userId}`);
            return user;
        } catch (error) {
            logger.error('❌ Both databases failed for getUser:', error.message);
            return null;
        }
    }

    /**
     * Set user data with sync to both databases
     */
    async setUser(userId, userData) {
        const errors = [];
        let success = false;

        // Try Firestore first if available
        if (this.isFirestoreAvailable) {
            try {
                await this.firestore.collection('users').doc(userId).set({
                    ...userData,
                    lastUpdated: new Date()
                }, { merge: true });
                
                logger.debug(`📊 Firestore: Updated user ${userId}`);
                success = true;
            } catch (error) {
                if (this.isQuotaExhaustedError(error)) {
                    logger.warn('🔄 Firestore quota exhausted during user update');
                    this.isFirestoreAvailable = false;
                    errors.push(`Firestore: ${error.message}`);
                } else {
                    errors.push(`Firestore: ${error.message}`);
                }
            }
        }

        // Always try MongoDB as backup
        try {
            await this.mongo.setUser(userId, userData);
            logger.debug(`🍃 MongoDB: Updated user ${userId}`);
            success = true;
        } catch (error) {
            errors.push(`MongoDB: ${error.message}`);
            logger.error('MongoDB user update failed:', error.message);
        }

        if (!success) {
            throw new Error(`All user updates failed: ${errors.join(', ')}`);
        }

        return { success: true, errors: errors.length > 0 ? errors : null };
    }

    /**
     * Get database status
     */
    async getStatus() {
        const firestoreHealth = await this.checkFirestoreAvailability();
        const mongoHealth = await this.mongo.healthCheck();

        return {
            firestore: {
                available: firestoreHealth,
                lastCheck: this.lastFirestoreCheck
            },
            mongodb: {
                available: mongoHealth,
                connected: this.mongo.isConnected
            },
            primaryDB: firestoreHealth ? 'firestore' : 'mongodb'
        };
    }

    /**
     * Force switch to MongoDB (for testing or emergencies)
     */
    forceMongoDB() {
        this.isFirestoreAvailable = false;
        logger.warn('⚠️ Forced switch to MongoDB backup database');
    }

    /**
     * Force switch back to Firestore
     */
    forceFirestore() {
        this.isFirestoreAvailable = true;
        this.lastFirestoreCheck = 0;
        logger.info('✅ Forced switch back to Firestore');
    }
}

module.exports = DatabaseFallback;