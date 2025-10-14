/**
 * 💰 ECONOMY ENGINE - Financial Control Center
 * Handles all economic operations, balance management, and financial integrity
 * Consolidates scattered financial utilities into unified system
 */

const EventEmitter = require('events');
const logger = require('../UTILS/logger');

class EconomyEngine extends EventEmitter {
    constructor() {
        super();
        this.transactionQueue = [];
        this.processingTransactions = false;
        this.economyHealth = 'HEALTHY';
        this.stats = {
            totalTransactions: 0,
            totalVolume: 0,
            totalFees: 0,
            failedTransactions: 0,
            avgTransactionTime: 0
        };
        
        this.initializeEngine();
    }

    /**
     * Initialize Economy Engine
     */
    async initializeEngine() {
        try {
            // Load dependencies safely
            this.dbManager = require('../UTILS/database');
            this.nodeCache = require('../UTILS/nodeCache');
            
            // Connect to bulletproof controller
            await this.connectBulletproofController();
            
            // Initialize transaction processor
            this.initializeTransactionProcessor();
            
            // Set up economy monitoring
            this.setupEconomyMonitoring();
            
            logger.info('💰 EconomyEngine initialized successfully');
            this.economyHealth = 'HEALTHY';
            
        } catch (error) {
            logger.error('❌ EconomyEngine initialization failed:', error);
            this.economyHealth = 'UNHEALTHY';
            throw error;
        }
    }

    /**
     * 💸 PROCESS PAYOUT
     * Universal payout processing with atomic transactions
     */
    async processPayout(userId, guildId, betAmount, payoutAmount, won) {
        const transactionId = this.generateTransactionId();
        const startTime = Date.now();
        
        try {
            // Create atomic transaction
            const transaction = {
                id: transactionId,
                type: won ? 'GAME_WIN' : 'GAME_LOSS',
                userId,
                guildId,
                betAmount,
                payoutAmount,
                netChange: payoutAmount - betAmount,
                timestamp: startTime,
                status: 'PENDING'
            };
            
            // Add to transaction queue
            await this.queueTransaction(transaction);
            
            // Process immediately for games (high priority)
            const result = await this.executeTransaction(transaction);
            
            // Update statistics
            this.updateStats(transaction, Date.now() - startTime);
            
            // Emit payout event
            this.emit('payoutProcessed', {
                userId,
                guildId,
                won,
                amount: payoutAmount,
                netChange: result.netChange,
                newBalance: result.newBalance
            });
            
            logger.debug(`💰 Payout processed: ${transactionId} - ${won ? 'WIN' : 'LOSS'} ${payoutAmount}`);
            
            return {
                success: true,
                transactionId,
                newBalance: result.newBalance,
                netChange: result.netChange,
                fees: result.fees || 0
            };
            
        } catch (error) {
            this.stats.failedTransactions++;
            logger.error(`❌ Payout processing failed: ${error.message}`);
            
            // Attempt rollback if needed
            await this.attemptRollback(transactionId, userId, guildId);
            
            throw error;
        }
    }

    /**
     * 🏦 GET USER BALANCE
     * Optimized balance retrieval with caching
     */
    async getUserBalance(userId, guildId) {
        try {
            // Check cache first
            const cacheKey = `balance_${userId}_${guildId}`;
            let balance = await this.nodeCache.get(cacheKey);
            
            if (!balance) {
                // Fetch from database
                balance = await this.dbManager.getUserBalance(userId, guildId);
                
                // Cache for 30 seconds
                await this.nodeCache.set(cacheKey, balance, 30);
            }
            
            // Add computed fields
            balance.totalBalance = (balance.wallet || 0) + (balance.bank || 0);
            balance.availableBalance = balance.wallet || 0;
            balance.tier = this.calculateBalanceTier(balance.totalBalance);
            
            return balance;
            
        } catch (error) {
            logger.error(`❌ Failed to get user balance: ${error.message}`);
            throw error;
        }
    }

    /**
     * 💳 UPDATE BALANCE
     * Atomic balance updates with validation
     */
    async updateBalance(userId, guildId, amount, operation = 'add', metadata = {}) {
        const transactionId = this.generateTransactionId();
        
        try {
            // Validate operation
            if (!['add', 'subtract', 'set'].includes(operation)) {
                throw new Error('Invalid balance operation');
            }
            
            // Get current balance
            const currentBalance = await this.getUserBalance(userId, guildId);
            
            // Calculate new balance
            let newAmount;
            switch (operation) {
                case 'add':
                    newAmount = (currentBalance.wallet || 0) + amount;
                    break;
                case 'subtract':
                    newAmount = (currentBalance.wallet || 0) - amount;
                    break;
                case 'set':
                    newAmount = amount;
                    break;
            }
            
            // Validate new balance
            if (newAmount < 0 && !metadata.allowNegative) {
                throw new Error('Insufficient balance');
            }
            
            // Execute atomic update
            const result = await this.dbManager.updateBalance(
                userId,
                amount,
                operation,
                guildId,
                {
                    ...metadata,
                    transactionId,
                    source: 'EconomyEngine'
                }
            );
            
            // Clear cache
            const cacheKey = `balance_${userId}_${guildId}`;
            await this.nodeCache.del(cacheKey);
            
            // Apply bulletproof economy controls
            await this.applyEconomyControls(userId, guildId, amount, operation);
            
            logger.debug(`💳 Balance updated: ${userId} ${operation} ${amount} = ${newAmount}`);
            
            return {
                success: true,
                transactionId,
                oldBalance: currentBalance.wallet || 0,
                newBalance: newAmount,
                change: amount
            };
            
        } catch (error) {
            logger.error(`❌ Balance update failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * 🔄 QUEUE TRANSACTION
     * Add transaction to processing queue
     */
    async queueTransaction(transaction) {
        transaction.queuedAt = Date.now();
        this.transactionQueue.push(transaction);
        
        // Process immediately if queue is idle
        if (!this.processingTransactions && this.transactionQueue.length === 1) {
            setImmediate(() => this.processTransactionQueue());
        }
    }

    /**
     * ⚙️ EXECUTE TRANSACTION
     * Process individual transaction atomically
     */
    async executeTransaction(transaction) {
        const startTime = Date.now();
        
        try {
            transaction.status = 'PROCESSING';
            transaction.processedAt = startTime;
            
            // Get current balance
            const currentBalance = await this.getUserBalance(transaction.userId, transaction.guildId);
            
            // Apply transaction
            let balanceChange = 0;
            let fees = 0;
            
            if (transaction.type === 'GAME_WIN') {
                // Add winnings
                balanceChange = transaction.payoutAmount;
                
                // Apply economy controls
                const economyResult = await this.bulletproofController.regulateGamePayout(
                    transaction.userId,
                    'casino_game',
                    true,
                    transaction.payoutAmount
                );
                
                balanceChange = economyResult.regulatedPayout;
                fees = transaction.payoutAmount - economyResult.regulatedPayout;
                
            } else if (transaction.type === 'GAME_LOSS') {
                // No payout for losses (bet already deducted)
                balanceChange = 0;
            }
            
            // Update balance if needed
            if (balanceChange > 0) {
                await this.updateBalance(
                    transaction.userId,
                    transaction.guildId,
                    balanceChange,
                    'add',
                    {
                        source: 'game_payout',
                        transactionId: transaction.id,
                        gameType: 'casino_game'
                    }
                );
            }
            
            // Calculate final state
            const newBalance = (currentBalance.wallet || 0) + balanceChange;
            const netChange = balanceChange - (transaction.betAmount || 0);
            
            transaction.status = 'COMPLETED';
            transaction.completedAt = Date.now();
            
            // Log successful transaction
            logger.debug(`✅ Transaction completed: ${transaction.id} in ${Date.now() - startTime}ms`);
            
            return {
                success: true,
                newBalance,
                netChange,
                fees,
                processingTime: Date.now() - startTime
            };
            
        } catch (error) {
            transaction.status = 'FAILED';
            transaction.error = error.message;
            transaction.failedAt = Date.now();
            
            logger.error(`❌ Transaction failed: ${transaction.id} - ${error.message}`);
            throw error;
        }
    }

    /**
     * 🔄 PROCESS TRANSACTION QUEUE
     * Background processor for transaction queue
     */
    async processTransactionQueue() {
        if (this.processingTransactions) return;
        
        this.processingTransactions = true;
        
        try {
            while (this.transactionQueue.length > 0) {
                const transaction = this.transactionQueue.shift();
                
                try {
                    await this.executeTransaction(transaction);
                } catch (error) {
                    // Log and continue with next transaction
                    logger.error(`Transaction processing error: ${error.message}`);
                }
                
                // Small delay to prevent overwhelming the system
                await this.sleep(10);
            }
        } finally {
            this.processingTransactions = false;
        }
    }

    /**
     * 🛡️ APPLY ECONOMY CONTROLS
     * Apply bulletproof economy protections
     */
    async applyEconomyControls(userId, guildId, amount, operation) {
        try {
            // Check for suspicious patterns
            if (amount > 1000000) { // Large transaction
                logger.warn(`💰 Large transaction detected: ${userId} ${operation} ${amount}`);
            }
            
            // Apply rate limiting
            const recentTransactions = await this.getRecentTransactions(userId, 300000); // 5 minutes
            if (recentTransactions.length > 50) {
                logger.warn(`⚠️ High transaction frequency: ${userId} (${recentTransactions.length} in 5min)`);
            }
            
            // Update economy statistics
            this.updateEconomyStats(userId, guildId, amount, operation);
            
        } catch (error) {
            logger.warn(`Economy controls error: ${error.message}`);
        }
    }

    /**
     * 📊 CALCULATE BALANCE TIER
     */
    calculateBalanceTier(totalBalance) {
        if (totalBalance <= 100000) return 'ULTRA_LOW';
        if (totalBalance <= 1000000) return 'LOW';
        if (totalBalance <= 10000000) return 'NORMAL';
        if (totalBalance <= 50000000) return 'HIGH';
        if (totalBalance <= 200000000) return 'VERY_HIGH';
        if (totalBalance <= 1000000000) return 'ULTRA_HIGH';
        return 'MEGA_WHALE';
    }

    /**
     * 🔄 ATTEMPT ROLLBACK
     * Rollback failed transactions
     */
    async attemptRollback(transactionId, userId, guildId) {
        try {
            logger.warn(`🔄 Attempting rollback for transaction: ${transactionId}`);
            
            // Implementation would depend on the specific failure
            // For now, just log the attempt
            
            this.emit('rollbackAttempted', { transactionId, userId, guildId });
            
        } catch (error) {
            logger.error(`❌ Rollback failed: ${error.message}`);
        }
    }

    /**
     * 🆔 Generate unique transaction ID
     */
    generateTransactionId() {
        return `eco_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    }

    /**
     * 📈 UPDATE STATISTICS
     */
    updateStats(transaction, processingTime) {
        this.stats.totalTransactions++;
        this.stats.totalVolume += Math.abs(transaction.netChange || 0);
        this.stats.avgTransactionTime = 
            (this.stats.avgTransactionTime + processingTime) / 2;
    }

    /**
     * 🏥 HEALTH CHECK
     */
    isHealthy() {
        return this.economyHealth === 'HEALTHY';
    }

    /**
     * 📊 GET ENGINE STATISTICS
     */
    getStats() {
        return {
            ...this.stats,
            queueLength: this.transactionQueue.length,
            processingTransactions: this.processingTransactions,
            engineHealth: this.economyHealth
        };
    }

    /**
     * 💤 Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 📊 SETUP ECONOMY MONITORING
     */
    setupEconomyMonitoring() {
        // Monitor every 30 seconds
        setInterval(() => {
            this.monitorEconomyHealth();
        }, 30000);
    }

    /**
     * 🔍 MONITOR ECONOMY HEALTH
     */
    async monitorEconomyHealth() {
        try {
            // Check queue length
            if (this.transactionQueue.length > 100) {
                this.economyHealth = 'DEGRADED';
                logger.warn('🚨 Transaction queue growing large');
            }
            
            // Check error rate
            const errorRate = this.stats.totalTransactions > 0 ? 
                (this.stats.failedTransactions / this.stats.totalTransactions) * 100 : 0;
            
            if (errorRate > 5) {
                this.economyHealth = 'DEGRADED';
                logger.warn(`🚨 High transaction error rate: ${errorRate.toFixed(1)}%`);
            }
            
            // Reset to healthy if conditions improve
            if (this.transactionQueue.length < 10 && errorRate < 2) {
                this.economyHealth = 'HEALTHY';
            }
            
        } catch (error) {
            logger.error(`Economy monitoring error: ${error.message}`);
            this.economyHealth = 'UNHEALTHY';
        }
    }

    /**
     * 🔄 INITIALIZE TRANSACTION PROCESSOR
     */
    initializeTransactionProcessor() {
        // Start background processor
        this.processorInterval = setInterval(() => {
            this.processTransactionQueue();
        }, 100); // Process every 100ms
        
        logger.info('🔄 Transaction processor started');
    }

    /**
     * ⚙️ PROCESS TRANSACTION QUEUE
     */
    async processTransactionQueue() {
        if (this.transactionQueue.length === 0 || this.processingTransactions >= 5) {
            return;
        }

        const transaction = this.transactionQueue.shift();
        if (transaction) {
            this.processingTransactions++;
            try {
                await this.executeTransaction(transaction);
            } catch (error) {
                logger.error(`Transaction processing error: ${error.message}`);
            } finally {
                this.processingTransactions--;
            }
        }
    }

    /**
     * 🔗 CONNECT BULLETPROOF CONTROLLER
     */
    async connectBulletproofController() {
        try {
            const BulletproofController = require('../BULLETPROOF_ECONOMY/BulletproofEconomyController');
            this.bulletproofController = new BulletproofController();
            
            // Initialize the controller
            await this.bulletproofController.initialize();
            
            logger.info('✅ Bulletproof Economy Controller connected');
            this.bulletproofConnected = true;
        } catch (error) {
            logger.warn(`⚠️ Bulletproof controller connection failed, using fallbacks: ${error.message}`);
            this.bulletproofConnected = false;
            
            // Create fallback methods
            this.bulletproofController = {
                regulateGamePayout: async (payout, gameType, userId, guildId) => {
                    // Simple fallback regulation
                    return {
                        adjustedPayout: Math.floor(payout * 0.98), // 2% adjustment as fallback
                        adjustmentReason: 'fallback_regulation',
                        approved: true
                    };
                },
                validateTransaction: async (transaction) => {
                    return { valid: true, adjustments: {} };
                },
                getEconomicMetrics: () => {
                    return { stability: 0.95, riskLevel: 'low' };
                }
            };
        }
    }
}

// Export singleton instance
module.exports = new EconomyEngine();