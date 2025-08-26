/**
 * MongoDB Atlas Backup Database Manager
 * Used as fallback when Firestore quota is exceeded
 */

const { MongoClient } = require('mongodb');
const logger = require('./logger');

class MongoBackupDB {
    constructor() {
        this.client = null;
        this.db = null;
        this.isConnected = false;
        
        // MongoDB Atlas connection string (replace with your actual connection string)
        this.connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/ative_casino_backup';
        this.dbName = process.env.MONGODB_DB_NAME || 'ative_casino_backup';
    }

    /**
     * Initialize MongoDB connection
     */
    async initialize() {
        try {
            if (this.isConnected) return true;

            // Check if MongoDB is disabled
            if (this.connectionString === 'disabled' || !this.connectionString || this.connectionString.includes('localhost')) {
                logger.info('🍃 MongoDB backup is disabled or not configured');
                return false;
            }

            logger.info('🍃 Initializing MongoDB backup database...');

            this.client = new MongoClient(this.connectionString, {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
                retryWrites: true
            });

            await this.client.connect();
            this.db = this.client.db(this.dbName);
            this.isConnected = true;

            // Test connection
            await this.db.admin().ping();
            logger.info('✅ MongoDB backup database connected successfully');

            // Create indexes for better performance
            await this.createIndexes();

            return true;
        } catch (error) {
            logger.error('❌ MongoDB backup initialization failed:', error.message);
            logger.error('Full error details:', error);
            logger.error('Connection string (masked):', this.connectionString.replace(/\/\/.*@/, '//***:***@'));
            this.isConnected = false;
            return false;
        }
    }

    /**
     * Create database indexes for performance
     */
    async createIndexes() {
        try {
            const collections = {
                users: [
                    { key: { userId: 1 }, unique: true },
                    { key: { createdAt: -1 } },
                    { key: { lastUpdated: -1 } }
                ],
                user_balances: [
                    { key: { userId: 1 }, unique: true },
                    { key: { lastUpdated: -1 } }
                ],
                transactions: [
                    { key: { userId: 1, timestamp: -1 } },
                    { key: { type: 1, timestamp: -1 } },
                    { key: { timestamp: -1 } }
                ],
                purchases: [
                    { key: { userId: 1, timestamp: -1 } },
                    { key: { paymentId: 1 }, unique: true },
                    { key: { timestamp: -1 } }
                ]
            };

            for (const [collectionName, indexes] of Object.entries(collections)) {
                const collection = this.db.collection(collectionName);
                for (const index of indexes) {
                    try {
                        await collection.createIndex(index.key, { 
                            unique: index.unique || false,
                            background: true 
                        });
                    } catch (err) {
                        // Index might already exist, ignore error
                        if (!err.message.includes('already exists')) {
                            logger.warn(`Failed to create index on ${collectionName}:`, err.message);
                        }
                    }
                }
            }

            logger.info('📊 MongoDB indexes created successfully');
        } catch (error) {
            logger.warn('⚠️ Failed to create some MongoDB indexes:', error.message);
        }
    }

    /**
     * Get user balance from MongoDB
     */
    async getUserBalance(userId) {
        try {
            if (!this.isConnected) {
                const connected = await this.initialize();
                if (!connected) throw new Error('MongoDB not available');
            }

            const userBalance = await this.db.collection('user_balances').findOne({ userId });
            
            if (!userBalance) {
                return { wallet: 0, bank: 0, credits: 0 };
            }

            return {
                wallet: userBalance.wallet || 0,
                bank: userBalance.bank || 0,
                credits: userBalance.credits || 0
            };
        } catch (error) {
            logger.error('MongoDB getUserBalance error:', error.message);
            throw error;
        }
    }

    /**
     * Update user balance in MongoDB
     */
    async updateUserBalance(userId, balanceData) {
        try {
            if (!this.isConnected) {
                const connected = await this.initialize();
                if (!connected) throw new Error('MongoDB not available');
            }

            const updateData = {
                ...balanceData,
                userId,
                lastUpdated: new Date()
            };

            const result = await this.db.collection('user_balances').replaceOne(
                { userId },
                updateData,
                { upsert: true }
            );

            logger.info(`💾 MongoDB: Updated balance for user ${userId}`);
            return result;
        } catch (error) {
            logger.error('MongoDB updateUserBalance error:', error.message);
            throw error;
        }
    }

    /**
     * Record a purchase in MongoDB
     */
    async recordPurchase(purchaseData) {
        try {
            if (!this.isConnected) {
                const connected = await this.initialize();
                if (!connected) throw new Error('MongoDB not available');
            }

            const purchase = {
                ...purchaseData,
                timestamp: new Date(),
                source: 'web_portal',
                status: 'completed'
            };

            const result = await this.db.collection('purchases').insertOne(purchase);
            
            logger.info(`💳 MongoDB: Recorded purchase ${purchase.paymentId} for user ${purchase.userId}`);
            return result;
        } catch (error) {
            logger.error('MongoDB recordPurchase error:', error.message);
            throw error;
        }
    }

    /**
     * Get user data from MongoDB
     */
    async getUser(userId) {
        try {
            if (!this.isConnected) {
                const connected = await this.initialize();
                if (!connected) throw new Error('MongoDB not available');
            }

            const user = await this.db.collection('users').findOne({ userId });
            return user;
        } catch (error) {
            logger.error('MongoDB getUser error:', error.message);
            throw error;
        }
    }

    /**
     * Create or update user in MongoDB
     */
    async setUser(userId, userData) {
        try {
            if (!this.isConnected) {
                const connected = await this.initialize();
                if (!connected) throw new Error('MongoDB not available');
            }

            const user = {
                ...userData,
                userId,
                lastUpdated: new Date(),
                createdAt: userData.createdAt || new Date()
            };

            const result = await this.db.collection('users').replaceOne(
                { userId },
                user,
                { upsert: true }
            );

            logger.info(`👤 MongoDB: Updated user ${userId}`);
            return result;
        } catch (error) {
            logger.error('MongoDB setUser error:', error.message);
            throw error;
        }
    }

    /**
     * Record transaction in MongoDB
     */
    async recordTransaction(transactionData) {
        try {
            if (!this.isConnected) {
                const connected = await this.initialize();
                if (!connected) throw new Error('MongoDB not available');
            }

            const transaction = {
                ...transactionData,
                timestamp: new Date(),
                id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            };

            const result = await this.db.collection('transactions').insertOne(transaction);
            
            logger.info(`📝 MongoDB: Recorded transaction ${transaction.id} for user ${transaction.userId}`);
            return result;
        } catch (error) {
            logger.error('MongoDB recordTransaction error:', error.message);
            throw error;
        }
    }

    /**
     * Close MongoDB connection
     */
    async close() {
        try {
            if (this.client) {
                await this.client.close();
                this.isConnected = false;
                logger.info('🔌 MongoDB connection closed');
            }
        } catch (error) {
            logger.error('Error closing MongoDB connection:', error.message);
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            if (!this.isConnected) return false;
            
            await this.db.admin().ping();
            return true;
        } catch (error) {
            logger.warn('MongoDB health check failed:', error.message);
            this.isConnected = false;
            return false;
        }
    }
}

module.exports = MongoBackupDB;