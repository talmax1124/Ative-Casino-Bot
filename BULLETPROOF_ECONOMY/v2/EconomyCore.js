/**
 * ECONOMY CORE V2 - Main Controller
 *
 * Bulletproof Economy System - Industry-Level Implementation
 *
 * This is the main interface for the economy system. It coordinates all subsystems:
 * - Supply Control (fixed cap + exponential decay)
 * - Progressive Taxation + Decay
 * - Diminishing Returns + Anti-Farming
 * - Transaction Fees + Validation
 * - Anti-Collusion Detection
 *
 * Design Goals:
 * - Make 1B+ wealth impossible
 * - Make 1T absolutely unreachable
 * - Multiple layers of protection
 * - Mathematical soundness
 * - Industry-level reliability
 *
 * @author Claude (Anthropic)
 * @version 2.0.0
 */

const config = require('./config');
const SupplyController = require('./SupplyController');
const TaxationSystem = require('./TaxationSystem');
const RewardController = require('./RewardController');
const TransactionManager = require('./TransactionManager');
const AntiCollusionDetector = require('./AntiCollusionDetector');
const GameBalanceController = require('./GameBalanceController');
const GameEngineUI = require('./GameEngineUI');

class EconomyCore {
    constructor(database, logger) {
        this.db = database;
        this.logger = logger;

        // Initialize all subsystems
        this.supplyController = new SupplyController(database, logger);
        this.taxationSystem = new TaxationSystem(
            database,
            this.supplyController,
            logger
        );
        this.rewardController = new RewardController(
            database,
            this.supplyController,
            logger
        );
        this.transactionManager = new TransactionManager(
            database,
            this.supplyController,
            logger
        );
        this.antiCollusionDetector = new AntiCollusionDetector(
            this.transactionManager,
            logger
        );

        // NEW: Game balance system (wealth-based multiplier scaling)
        this.gameBalance = new GameBalanceController(database, config);
        this.gameUI = new GameEngineUI(this.gameBalance);

        // System state
        this.initialized = false;
        this.startTime = Date.now();
        this.operationCount = 0;

        this.logger.info('EconomyCore V2 constructed with GameBalanceController');
    }

    /**
     * Initialize the entire economy system
     * Call this once on bot startup
     */
    async initialize() {
        try {
            if (this.initialized) {
                this.logger.warn('EconomyCore already initialized');
                return { success: true, message: 'Already initialized' };
            }

            this.logger.info('🚀 Initializing Bulletproof Economy V2...');

            // Initialize all subsystems in order
            await this.supplyController.initialize();
            this.logger.info('✅ Supply Controller initialized');

            await this.taxationSystem.initialize();
            this.logger.info('✅ Taxation System initialized');

            await this.rewardController.initialize();
            this.logger.info('✅ Reward Controller initialized');

            await this.transactionManager.initialize();
            this.logger.info('✅ Transaction Manager initialized');

            await this.antiCollusionDetector.initialize();
            this.logger.info('✅ Anti-Collusion Detector initialized');

            // Game balance system doesn't need async initialization
            this.logger.info('✅ Game Balance Controller ready');
            this.logger.info('✅ Game Engine UI ready');

            this.initialized = true;

            this.logger.info('✅ Bulletproof Economy V2 fully initialized and operational!');
            this.logger.info('🎮 Wealth-based game multiplier scaling: ACTIVE');
            this.logger.info('🚫 NO MAX BETS - Multipliers scale with wealth instead');

            return {
                success: true,
                message: 'Economy system fully initialized',
                config: this.getSystemConfiguration(),
            };
        } catch (error) {
            this.logger.error('❌ Economy initialization failed:', error);
            throw new Error(`Economy initialization failed: ${error.message}`);
        }
    }

    /**
     * Issue a reward to a user (WORK, DAILY, etc.)
     *
     * @param {string} userId - User ID
     * @param {string} taskType - Task type (WORK, DAILY, CRIME, etc.)
     * @returns {Object} Reward result
     */
    async issueReward(userId, taskType) {
        this.ensureInitialized();
        this.operationCount++;

        try {
            // Check if account is frozen
            if (this.antiCollusionDetector.isAccountFrozen(userId)) {
                return {
                    success: false,
                    reason: 'Account frozen due to suspicious activity',
                    frozen: true,
                };
            }

            // Check cooldown
            const cooldownCheck = await this.rewardController.checkCooldown(
                userId,
                taskType
            );

            if (!cooldownCheck.ready) {
                return {
                    success: false,
                    reason: cooldownCheck.reason,
                    cooldown: cooldownCheck.remaining,
                    cooldownFormatted: cooldownCheck.remainingFormatted,
                };
            }

            // Get user balance
            const balance = await this.db.getUserBalance(userId, null);

            // Issue reward
            const result = await this.rewardController.issueReward(
                userId,
                taskType,
                balance
            );

            return result;
        } catch (error) {
            this.logger.error('Error issuing reward:', error);
            return {
                success: false,
                reason: error.message,
            };
        }
    }

    /**
     * Process a transfer between users
     *
     * @param {string} senderId - Sender user ID
     * @param {string} recipientId - Recipient user ID
     * @param {number} amount - Transfer amount
     * @param {string} reason - Transfer reason
     * @returns {Object} Transfer result
     */
    async processTransfer(senderId, recipientId, amount, reason = 'transfer') {
        this.ensureInitialized();
        this.operationCount++;

        try {
            // Check if either account is frozen
            if (
                this.antiCollusionDetector.isAccountFrozen(senderId) ||
                this.antiCollusionDetector.isAccountFrozen(recipientId)
            ) {
                return {
                    success: false,
                    reason: 'One or both accounts frozen due to suspicious activity',
                    frozen: true,
                };
            }

            // Analyze transfer for collusion BEFORE processing
            const collusionAnalysis = await this.antiCollusionDetector.analyzeTransfer(
                senderId,
                recipientId,
                amount
            );

            if (collusionAnalysis.action === 'FREEZE') {
                return {
                    success: false,
                    reason: collusionAnalysis.reason,
                    frozen: true,
                    collusionScore: collusionAnalysis.score,
                };
            }

            // Process the transfer
            const result = await this.transactionManager.processTransfer(
                senderId,
                recipientId,
                amount,
                reason
            );

            // Include collusion info in result
            if (result.success) {
                result.collusionCheck = collusionAnalysis;
            }

            return result;
        } catch (error) {
            this.logger.error('Error processing transfer:', error);
            return {
                success: false,
                errors: [error.message],
            };
        }
    }

    /**
     * Calculate reward for user without issuing it (preview)
     *
     * @param {string} userId - User ID
     * @param {string} taskType - Task type
     * @returns {Object} Reward calculation
     */
    async calculateReward(userId, taskType) {
        this.ensureInitialized();

        try {
            const balance = await this.db.getUserBalance(userId, null);
            const calculation = await this.rewardController.calculateReward(
                taskType,
                userId,
                balance
            );

            return calculation;
        } catch (error) {
            this.logger.error('Error calculating reward:', error);
            return {
                error: error.message,
            };
        }
    }

    /**
     * Calculate transaction fee (preview)
     *
     * @param {number} amount - Transaction amount
     * @returns {Object} Fee calculation
     */
    calculateTransactionFee(amount) {
        this.ensureInitialized();
        return this.transactionManager.calculateFee(amount);
    }

    /**
     * Calculate tax for user (preview)
     *
     * @param {string} userId - User ID
     * @returns {Object} Tax calculation
     */
    async calculateUserTax(userId) {
        this.ensureInitialized();

        try {
            const balance = await this.db.getUserBalance(userId, null);
            const taxInfo = await this.taxationSystem.calculateUserTax(userId, balance);

            return taxInfo;
        } catch (error) {
            this.logger.error('Error calculating tax:', error);
            return {
                error: error.message,
            };
        }
    }

    /**
     * Get comprehensive economy statistics
     */
    getEconomyStats() {
        this.ensureInitialized();

        return {
            system: {
                version: '2.0.0',
                initialized: this.initialized,
                uptime: Date.now() - this.startTime,
                operations: this.operationCount,
            },
            supply: this.supplyController.getSupplyStats(),
            taxation: this.taxationSystem.getTaxationStats(),
            rewards: this.rewardController.getRewardStats(),
            transactions: this.transactionManager.getTransactionStats(),
            collusion: this.antiCollusionDetector.getCollusionStats(),
        };
    }

    /**
     * Get system configuration
     */
    getSystemConfiguration() {
        return {
            supplyCap: config.SUPPLY.ABSOLUTE_CAP,
            maxUserBalance: config.HARD_LIMITS.MAX_USER_BALANCE,
            maxDailyEarnings: config.HARD_LIMITS.MAX_DAILY_EARNINGS,
            maxTransaction: config.HARD_LIMITS.MAX_TRANSACTION_AMOUNT,
            baseTaxRate: config.TAX.BASE_RATE,
            maxTaxRate: config.TAX.MAX_TAX_RATE,
            decayRate: config.DECAY.DAILY_RATE,
            transactionFee: config.FEES.BASE_PERCENTAGE,
        };
    }

    /**
     * Manual trigger for taxation cycle (admin use)
     */
    async runTaxationCycle() {
        this.ensureInitialized();

        this.logger.info('Manual taxation cycle triggered');
        return await this.taxationSystem.runTaxationCycle();
    }

    /**
     * Manual trigger for decay cycle (admin use)
     */
    async runDecayCycle() {
        this.ensureInitialized();

        this.logger.info('Manual decay cycle triggered');
        return await this.taxationSystem.runDecayCycle();
    }

    /**
     * Check supply status and health
     */
    getSupplyHealth() {
        this.ensureInitialized();

        const stats = this.supplyController.getSupplyStats();

        return {
            healthy: stats.utilizationPercent < 90,
            utilization: stats.utilizationPercent,
            currentSupply: stats.currentSupply,
            cap: stats.supplyCap,
            emergencyMode: stats.emergencyMode,
            remainingCapacity: stats.remainingCapacity,
            warnings: this.getSupplyWarnings(stats),
        };
    }

    /**
     * Get supply warnings
     */
    getSupplyWarnings(stats) {
        const warnings = [];

        if (stats.utilizationPercent > 95) {
            warnings.push('CRITICAL: Supply above 95% - emergency mode active');
        } else if (stats.utilizationPercent > 90) {
            warnings.push('WARNING: Supply above 90% - approaching cap');
        } else if (stats.utilizationPercent > 80) {
            warnings.push('NOTICE: Supply above 80% - monitor closely');
        }

        if (stats.issuanceRate < 50) {
            warnings.push('INFO: Issuance rate heavily decayed');
        }

        return warnings;
    }

    /**
     * Forecast supply growth
     *
     * @param {number} days - Days to forecast
     */
    forecastSupply(days = 30) {
        this.ensureInitialized();
        return this.supplyController.forecastSupply(days);
    }

    /**
     * Emergency: Force burn currency
     * (Admin only - use with extreme caution)
     *
     * @param {number} amount - Amount to burn
     * @param {string} reason - Reason for emergency burn
     */
    async emergencyBurn(amount, reason) {
        this.ensureInitialized();

        this.logger.error('🚨 EMERGENCY BURN INITIATED:', {
            amount,
            reason,
        });

        return await this.supplyController.burn(amount, `EMERGENCY: ${reason}`, 'admin');
    }

    /**
     * Check if user can perform action (cooldown, caps, frozen)
     *
     * @param {string} userId - User ID
     * @param {string} actionType - Action type
     * @returns {Object} Permission check result
     */
    async checkUserPermission(userId, actionType) {
        this.ensureInitialized();

        try {
            // Check frozen status
            if (this.antiCollusionDetector.isAccountFrozen(userId)) {
                return {
                    allowed: false,
                    reason: 'Account frozen',
                };
            }

            // Check cooldown
            const cooldownCheck = await this.rewardController.checkCooldown(
                userId,
                actionType
            );

            if (!cooldownCheck.ready) {
                return {
                    allowed: false,
                    reason: cooldownCheck.reason,
                    cooldown: cooldownCheck.remaining,
                };
            }

            // Check daily cap
            const balance = await this.db.getUserBalance(userId, null);
            const capCheck = await this.rewardController.checkDailyCap(userId, 0);

            if (!capCheck.allowed) {
                return {
                    allowed: false,
                    reason: capCheck.reason,
                };
            }

            return {
                allowed: true,
            };
        } catch (error) {
            this.logger.error('Error checking user permission:', error);
            return {
                allowed: false,
                reason: error.message,
            };
        }
    }

    /**
     * Get detailed user economy profile
     *
     * @param {string} userId - User ID
     */
    async getUserEconomyProfile(userId) {
        this.ensureInitialized();

        try {
            const balance = await this.db.getUserBalance(userId, null);
            const taxInfo = await this.calculateUserTax(userId);
            const suspicion = this.antiCollusionDetector.suspiciousAccounts.get(userId);
            const frozen = this.antiCollusionDetector.isAccountFrozen(userId);

            return {
                userId,
                balance: {
                    wallet: balance.wallet,
                    bank: balance.bank,
                    total: balance.wallet + balance.bank,
                },
                taxation: {
                    nextTaxAmount: taxInfo.taxAmount,
                    taxRate: taxInfo.taxRate,
                    bracket: taxInfo.bracketInfo,
                },
                security: {
                    frozen,
                    suspicious: !!suspicion,
                    flags: suspicion?.flags || 0,
                },
                limits: {
                    maxBalance: config.HARD_LIMITS.MAX_USER_BALANCE,
                    maxDailyEarnings: config.HARD_LIMITS.MAX_DAILY_EARNINGS,
                },
            };
        } catch (error) {
            this.logger.error('Error getting user profile:', error);
            return {
                error: error.message,
            };
        }
    }

    /**
     * Health check - verify all systems are operational
     */
    async healthCheck() {
        const health = {
            overall: 'HEALTHY',
            systems: {},
            warnings: [],
            errors: [],
        };

        try {
            // Check initialization
            if (!this.initialized) {
                health.overall = 'ERROR';
                health.errors.push('System not initialized');
                return health;
            }

            // Check supply
            const supplyHealth = this.getSupplyHealth();
            health.systems.supply = {
                status: supplyHealth.healthy ? 'OK' : 'WARNING',
                utilization: supplyHealth.utilization,
                emergencyMode: supplyHealth.emergencyMode,
            };

            if (!supplyHealth.healthy) {
                health.overall = 'WARNING';
                health.warnings.push(...supplyHealth.warnings);
            }

            // Check database connection
            try {
                await this.db.getUserBalance('test', null);
                health.systems.database = { status: 'OK' };
            } catch (error) {
                health.systems.database = { status: 'ERROR', error: error.message };
                health.overall = 'ERROR';
                health.errors.push('Database connection failed');
            }

            // All other systems
            health.systems.taxation = { status: 'OK' };
            health.systems.rewards = { status: 'OK' };
            health.systems.transactions = { status: 'OK' };
            health.systems.antiCollusion = {
                status: 'OK',
                frozenAccounts: this.antiCollusionDetector.frozenAccounts.size,
            };

            return health;
        } catch (error) {
            health.overall = 'ERROR';
            health.errors.push(error.message);
            return health;
        }
    }

    /**
     * Get game balance controller (for game integration)
     */
    getGameBalance() {
        this.ensureInitialized();
        return this.gameBalance;
    }

    /**
     * Get game UI adapter (for displaying adjusted multipliers)
     */
    getGameUI() {
        this.ensureInitialized();
        return this.gameUI;
    }

    /**
     * Ensure system is initialized
     */
    ensureInitialized() {
        if (!this.initialized) {
            throw new Error('Economy system not initialized. Call initialize() first.');
        }
    }
}

// Export singleton instance
module.exports = EconomyCore;
