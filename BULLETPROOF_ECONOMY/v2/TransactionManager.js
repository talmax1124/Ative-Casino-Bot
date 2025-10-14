/**
 * TRANSACTION MANAGER - Progressive Fees + Validation
 *
 * Implements:
 * 1. Progressive transaction fees: fee = max(f_min, f_pct * amount + f_scale * amount^β)
 * 2. Transaction validation and limits
 * 3. Transfer tracking and monitoring
 * 4. Fee collection and burning
 *
 * Mathematical Foundation:
 * - Fees scale super-linearly with amount
 * - Large transfers incur heavy penalties
 * - All fees are burned to reduce supply
 */

const config = require('./config');
const Decimal = require('decimal.js');

class TransactionManager {
    constructor(database, supplyController, logger) {
        this.db = database;
        this.supplyController = supplyController;
        this.logger = logger;

        // Fee parameters
        this.basePercentage = new Decimal(config.FEES.BASE_PERCENTAGE);
        this.minimumFee = new Decimal(config.FEES.MINIMUM_FEE);
        this.scalingExponent = new Decimal(config.FEES.SCALING_EXPONENT);
        this.scalingFactor = new Decimal(config.FEES.SCALING_FACTOR);
        this.maxFeePercentage = new Decimal(config.FEES.MAX_FEE_PERCENTAGE);
        this.largeTransferThreshold = new Decimal(config.FEES.LARGE_TRANSFER_THRESHOLD);
        this.largeTransferFee = new Decimal(config.FEES.LARGE_TRANSFER_FEE);

        // Hard limits
        this.maxTransactionAmount = new Decimal(config.HARD_LIMITS.MAX_TRANSACTION_AMOUNT);

        // Fee tracking
        this.totalFeesCollected = new Decimal(0);
        this.transactionCount = 0;

        // Transfer history (for collusion detection)
        this.transferHistory = new Map();

        this.logger.info('TransactionManager initialized');
    }

    /**
     * Initialize transaction manager
     */
    async initialize() {
        try {
            // Load fee history from database
            const feeData = await this.loadFeeHistory();
            this.totalFeesCollected = new Decimal(feeData.totalCollected || 0);
            this.transactionCount = feeData.transactionCount || 0;

            this.logger.info('TransactionManager started:', {
                totalFeesCollected: this.totalFeesCollected.toString(),
                transactionCount: this.transactionCount,
            });

            return { success: true };
        } catch (error) {
            this.logger.error('TransactionManager initialization failed:', error);
            throw new Error(`Transaction manager initialization failed: ${error.message}`);
        }
    }

    /**
     * Calculate transaction fee using progressive formula
     * Formula: fee = max(f_min, f_pct * amount + f_scale * amount^β)
     *
     * @param {Decimal|number} amount - Transaction amount
     * @returns {Object} Fee calculation result
     */
    calculateFee(amount) {
        const amt = new Decimal(amount);

        if (amt.lte(0)) {
            return {
                amount: amt.toNumber(),
                fee: 0,
                percentage: 0,
            };
        }

        // Calculate base percentage fee: f_pct * amount
        const baseFeePart = this.basePercentage.times(amt);

        // Calculate progressive scaling: f_scale * amount^β
        const scaledPart = this.scalingFactor.times(amt.pow(this.scalingExponent));

        // Total fee before minimum
        let totalFee = baseFeePart.plus(scaledPart);

        // Apply minimum fee
        totalFee = Decimal.max(totalFee, this.minimumFee);

        // Check for large transfer penalty
        if (amt.gte(this.largeTransferThreshold)) {
            const largeFee = amt.times(this.largeTransferFee);
            totalFee = totalFee.plus(largeFee);
            this.logger.info('Large transfer fee applied:', {
                amount: amt.toString(),
                extraFee: largeFee.toString(),
            });
        }

        // Calculate effective percentage
        const effectivePercentage = totalFee.div(amt);

        // Cap at maximum percentage
        if (effectivePercentage.gt(this.maxFeePercentage)) {
            totalFee = amt.times(this.maxFeePercentage);
        }

        // Round fee up to avoid dust
        const finalFee = totalFee.ceil();

        return {
            amount: amt.toNumber(),
            fee: finalFee.toNumber(),
            percentage: finalFee.div(amt).times(100).toNumber(),
            netAmount: amt.minus(finalFee).toNumber(),
        };
    }

    /**
     * Validate transaction before processing
     *
     * @param {string} senderId - Sender user ID
     * @param {string} recipientId - Recipient user ID
     * @param {number} amount - Transaction amount
     * @param {Object} senderBalance - Sender's balance
     * @returns {Object} Validation result
     */
    async validateTransaction(senderId, recipientId, amount, senderBalance) {
        const errors = [];

        // Check 1: Amount validation
        if (amount <= 0) {
            errors.push('Amount must be positive');
        }

        // Check 2: Self-transfer
        if (senderId === recipientId) {
            errors.push('Cannot transfer to yourself');
        }

        // Check 3: Sufficient balance
        const wallet = new Decimal(senderBalance.wallet || 0);
        const requestedAmount = new Decimal(amount);

        if (wallet.lt(requestedAmount)) {
            errors.push(`Insufficient balance. Have: ${wallet.toString()}, Need: ${requestedAmount.toString()}`);
        }

        // Check 4: Maximum transaction limit
        if (requestedAmount.gt(this.maxTransactionAmount)) {
            errors.push(`Amount exceeds maximum transaction limit of ${this.maxTransactionAmount.toString()}`);
        }

        // Check 5: Rate limiting
        const rateCheck = await this.checkTransferRateLimit(senderId);
        if (!rateCheck.allowed) {
            errors.push(rateCheck.reason);
        }

        // Check 6: Recipient exists
        try {
            const recipientBalance = await this.db.getUserBalance(recipientId, null);
            if (!recipientBalance) {
                errors.push('Recipient not found');
            }
        } catch (error) {
            errors.push('Failed to verify recipient');
        }

        if (errors.length > 0) {
            return {
                valid: false,
                errors,
            };
        }

        return {
            valid: true,
            errors: [],
        };
    }

    /**
     * Process a transfer transaction
     *
     * @param {string} senderId - Sender user ID
     * @param {string} recipientId - Recipient user ID
     * @param {number} amount - Transfer amount
     * @param {string} reason - Transfer reason
     * @returns {Object} Transaction result
     */
    async processTransfer(senderId, recipientId, amount, reason = 'transfer') {
        try {
            // Get sender balance
            const senderBalance = await this.db.getUserBalance(senderId, null);

            // Validate transaction
            const validation = await this.validateTransaction(
                senderId,
                recipientId,
                amount,
                senderBalance
            );

            if (!validation.valid) {
                return {
                    success: false,
                    errors: validation.errors,
                };
            }

            // Calculate fee
            const feeCalc = this.calculateFee(amount);

            const totalDeduction = new Decimal(amount).plus(feeCalc.fee);

            // Check total deduction against wallet
            if (new Decimal(senderBalance.wallet).lt(totalDeduction)) {
                return {
                    success: false,
                    errors: [`Insufficient balance including fee. Need: ${totalDeduction.toString()}, Have: ${senderBalance.wallet}`],
                };
            }

            // Deduct from sender (amount + fee)
            const senderUpdate = await this.db.updateUserBalance(
                senderId,
                null,
                -totalDeduction.toNumber(),
                0,
                { reason: `${reason}_send`, fee: feeCalc.fee }
            );

            if (!senderUpdate) {
                return {
                    success: false,
                    errors: ['Failed to deduct from sender'],
                };
            }

            // Add to recipient (amount only, fee is burned)
            const recipientUpdate = await this.db.updateUserBalance(
                recipientId,
                null,
                amount,
                0,
                { reason: `${reason}_receive`, from: senderId }
            );

            if (!recipientUpdate) {
                // Rollback sender deduction
                await this.db.updateUserBalance(
                    senderId,
                    null,
                    totalDeduction.toNumber(),
                    0,
                    { reason: `${reason}_rollback` }
                );

                return {
                    success: false,
                    errors: ['Failed to credit recipient - transaction rolled back'],
                };
            }

            // Burn the fee
            await this.supplyController.burn(feeCalc.fee, 'transaction_fee', senderId);

            // Update tracking
            this.totalFeesCollected = this.totalFeesCollected.plus(new Decimal(feeCalc.fee));
            this.transactionCount++;

            // Record transfer history
            await this.recordTransfer(senderId, recipientId, amount, feeCalc.fee);

            this.logger.info('Transfer processed:', {
                from: senderId,
                to: recipientId,
                amount,
                fee: feeCalc.fee,
                reason,
            });

            return {
                success: true,
                amount,
                fee: feeCalc.fee,
                feePercentage: feeCalc.percentage,
                netTransferred: feeCalc.netAmount,
                totalDeducted: totalDeduction.toNumber(),
            };
        } catch (error) {
            this.logger.error('Transfer processing failed:', error);
            return {
                success: false,
                errors: [error.message],
            };
        }
    }

    /**
     * Check transfer rate limit for user
     *
     * @param {string} userId - User ID
     * @returns {Object} Rate limit check result
     */
    async checkTransferRateLimit(userId) {
        try {
            const history = this.transferHistory.get(userId) || [];
            const now = Date.now();
            const oneHourAgo = now - 3600000;

            // Count transfers in last hour
            const recentTransfers = history.filter((t) => t.timestamp > oneHourAgo);

            const hourlyLimit = config.ANTI_FARMING.HOURLY_LIMITS.TRANSFERS;

            if (recentTransfers.length >= hourlyLimit) {
                return {
                    allowed: false,
                    reason: `Transfer rate limit exceeded (${hourlyLimit}/hour)`,
                    limit: hourlyLimit,
                    current: recentTransfers.length,
                };
            }

            return {
                allowed: true,
                limit: hourlyLimit,
                current: recentTransfers.length,
            };
        } catch (error) {
            this.logger.error('Error checking rate limit:', error);
            return { allowed: true }; // Fail open
        }
    }

    /**
     * Record transfer in history (for anti-collusion)
     *
     * @param {string} senderId - Sender ID
     * @param {string} recipientId - Recipient ID
     * @param {number} amount - Transfer amount
     * @param {number} fee - Fee charged
     */
    async recordTransfer(senderId, recipientId, amount, fee) {
        try {
            const transferRecord = {
                from: senderId,
                to: recipientId,
                amount,
                fee,
                timestamp: Date.now(),
            };

            // Add to sender's history
            if (!this.transferHistory.has(senderId)) {
                this.transferHistory.set(senderId, []);
            }
            this.transferHistory.get(senderId).push(transferRecord);

            // Add to recipient's history
            if (!this.transferHistory.has(recipientId)) {
                this.transferHistory.set(recipientId, []);
            }
            this.transferHistory.get(recipientId).push(transferRecord);

            // Limit history size (keep last 100 per user)
            for (const [userId, history] of this.transferHistory.entries()) {
                if (history.length > 100) {
                    this.transferHistory.set(userId, history.slice(-100));
                }
            }

            // Save to database for permanent record
            await this.saveTransferToDB(transferRecord);

            return true;
        } catch (error) {
            this.logger.error('Error recording transfer:', error);
            return false;
        }
    }

    /**
     * Get transfer history for user
     *
     * @param {string} userId - User ID
     * @param {number} limit - Number of recent transfers
     * @returns {Array} Transfer history
     */
    getTransferHistory(userId, limit = 20) {
        const history = this.transferHistory.get(userId) || [];
        return history.slice(-limit);
    }

    /**
     * Get all transfers between two users
     *
     * @param {string} userId1 - First user ID
     * @param {string} userId2 - Second user ID
     * @returns {Array} Transfers between users
     */
    getTransfersBetween(userId1, userId2) {
        const history1 = this.transferHistory.get(userId1) || [];
        const history2 = this.transferHistory.get(userId2) || [];

        const combined = [...history1, ...history2];

        // Filter for transfers between these two users
        const between = combined.filter(
            (t) =>
                (t.from === userId1 && t.to === userId2) ||
                (t.from === userId2 && t.to === userId1)
        );

        // Sort by timestamp
        between.sort((a, b) => a.timestamp - b.timestamp);

        return between;
    }

    /**
     * Save transfer to database
     */
    async saveTransferToDB(transferRecord) {
        try {
            // Implementation depends on schema
            return true;
        } catch (error) {
            this.logger.error('Failed to save transfer to DB:', error);
            return false;
        }
    }

    /**
     * Load fee history from database
     */
    async loadFeeHistory() {
        try {
            // Implementation depends on schema
            return {
                totalCollected: 0,
                transactionCount: 0,
            };
        } catch (error) {
            return {
                totalCollected: 0,
                transactionCount: 0,
            };
        }
    }

    /**
     * Get transaction manager statistics
     */
    getTransactionStats() {
        return {
            totalFeesCollected: this.totalFeesCollected.toNumber(),
            transactionCount: this.transactionCount,
            averageFee:
                this.transactionCount > 0
                    ? this.totalFeesCollected.div(this.transactionCount).toNumber()
                    : 0,
            activeUserTransfers: this.transferHistory.size,
        };
    }
}

module.exports = TransactionManager;
