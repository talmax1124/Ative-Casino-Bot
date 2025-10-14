/**
 * TAXATION SYSTEM - Progressive Wealth Tax + Continuous Decay
 *
 * Implements:
 * 1. Continuous decay: balance(t+Δt) = balance(t) * e^(-δ * Δt)
 * 2. Progressive wealth tax: tax(w) = t0 + t1 * (w / Wm)^p
 * 3. Bracket-based taxation
 * 4. Automated tax collection
 *
 * Mathematical Foundation:
 * - Exponential decay discourages hoarding
 * - Progressive taxation prevents wealth concentration
 * - Collected taxes are burned to reduce supply
 */

const config = require('./config');
const Decimal = require('decimal.js');

class TaxationSystem {
    constructor(database, supplyController, logger) {
        this.db = database;
        this.supplyController = supplyController;
        this.logger = logger;

        // Tax parameters
        this.baseRate = new Decimal(config.TAX.BASE_RATE);
        this.progressiveMultiplier = new Decimal(config.TAX.PROGRESSIVE_MULTIPLIER);
        this.wealthExponent = new Decimal(config.TAX.WEALTH_EXPONENT);
        this.referenceBalance = new Decimal(config.TAX.REFERENCE_BALANCE);
        this.maxTaxRate = new Decimal(config.TAX.MAX_TAX_RATE);

        // Decay parameters
        this.baseDailyDecayRate = new Decimal(config.DECAY.BASE_DAILY_RATE);
        this.decayBrackets = config.DECAY.DECAY_BRACKETS.map(b => ({
            min: new Decimal(b.min),
            max: new Decimal(b.max),
            multiplier: new Decimal(b.multiplier)
        }));
        this.minBalanceForDecay = new Decimal(config.DECAY.MIN_BALANCE_FOR_DECAY);
        this.exemptThreshold = new Decimal(config.DECAY.EXEMPT_THRESHOLD);

        // Tax collection state
        this.lastTaxRun = null;
        this.lastDecayRun = null;
        this.totalTaxesCollected = new Decimal(0);
        this.totalDecayApplied = new Decimal(0);

        // Tax brackets (pre-compiled for efficiency)
        this.taxBrackets = config.TAX.BRACKETS.map((bracket) => ({
            min: new Decimal(bracket.min),
            max: new Decimal(bracket.max),
            rate: new Decimal(bracket.rate),
        }));

        this.logger.info('TaxationSystem initialized');
    }

    /**
     * Initialize taxation system - start automated tax collection
     */
    async initialize() {
        try {
            // Load tax history from database
            const taxData = await this.loadTaxHistory();
            this.lastTaxRun = taxData.lastTaxRun || Date.now();
            this.lastDecayRun = taxData.lastDecayRun || Date.now();
            this.totalTaxesCollected = new Decimal(taxData.totalCollected || 0);

            // Start automated tax collection
            this.startAutomatedTaxation();

            // Start decay application
            this.startAutomatedDecay();

            this.logger.info('TaxationSystem started:', {
                lastTaxRun: new Date(this.lastTaxRun).toISOString(),
                lastDecayRun: new Date(this.lastDecayRun).toISOString(),
                totalCollected: this.totalTaxesCollected.toString(),
            });

            return { success: true };
        } catch (error) {
            this.logger.error('TaxationSystem initialization failed:', error);
            throw new Error(`Taxation initialization failed: ${error.message}`);
        }
    }

    /**
     * Calculate progressive wealth tax for a given balance
     * Formula: tax(w) = t0 + t1 * (w / Wm)^p
     *
     * @param {Decimal|number} wealth - User's total wealth
     * @returns {Decimal} Tax rate (0-1)
     */
    calculateProgressiveTaxRate(wealth) {
        const w = new Decimal(wealth);

        // Exempt small balances
        if (w.lt(this.exemptThreshold)) {
            return new Decimal(0);
        }

        // Calculate progressive component: (w / Wm)^p
        const wealthRatio = w.div(this.referenceBalance);
        const progressiveComponent = wealthRatio.pow(this.wealthExponent);

        // Calculate total rate: t0 + t1 * (w / Wm)^p
        const totalRate = this.baseRate.plus(
            this.progressiveMultiplier.times(progressiveComponent)
        );

        // Cap at maximum tax rate
        return Decimal.min(totalRate, this.maxTaxRate);
    }

    /**
     * Calculate bracket-based tax for a given balance
     * Uses tax brackets defined in config
     *
     * @param {Decimal|number} wealth - User's total wealth
     * @returns {Object} { rate: Decimal, bracket: object }
     */
    calculateBracketTax(wealth) {
        const w = new Decimal(wealth);

        // Find applicable bracket
        for (const bracket of this.taxBrackets) {
            if (w.gte(bracket.min) && w.lt(bracket.max)) {
                return {
                    rate: bracket.rate,
                    bracket: {
                        min: bracket.min.toNumber(),
                        max: bracket.max.toNumber(),
                        rate: bracket.rate.toNumber(),
                    },
                };
            }
        }

        // Default to highest bracket
        const highestBracket = this.taxBrackets[this.taxBrackets.length - 1];
        return {
            rate: highestBracket.rate,
            bracket: {
                min: highestBracket.min.toNumber(),
                max: highestBracket.max.toNumber(),
                rate: highestBracket.rate.toNumber(),
            },
        };
    }

    /**
     * Calculate combined tax rate (progressive + bracket)
     * Uses the higher of the two rates
     *
     * @param {Decimal|number} wealth - User's total wealth
     * @returns {Object} Tax calculation result
     */
    calculateTaxRate(wealth) {
        const w = new Decimal(wealth);

        // Calculate both methods
        const progressiveRate = this.calculateProgressiveTaxRate(w);
        const bracketResult = this.calculateBracketTax(w);

        // Use the higher rate for stronger control
        const effectiveRate = Decimal.max(progressiveRate, bracketResult.rate);

        return {
            wealth: w.toNumber(),
            progressiveRate: progressiveRate.toNumber(),
            bracketRate: bracketResult.rate.toNumber(),
            effectiveRate: effectiveRate.toNumber(),
            bracket: bracketResult.bracket,
        };
    }

    /**
     * Calculate tax amount for user
     *
     * @param {string} userId - User ID
     * @param {Object} balance - User balance object
     * @returns {Object} Tax calculation
     */
    async calculateUserTax(userId, balance) {
        try {
            const wallet = new Decimal(balance.wallet || 0);
            const bank = new Decimal(balance.bank || 0);
            const totalWealth = wallet.plus(bank);

            // Calculate tax rate
            const taxInfo = this.calculateTaxRate(totalWealth);
            const taxRate = new Decimal(taxInfo.effectiveRate);

            // Calculate tax amount
            const taxAmount = totalWealth.times(taxRate);

            // Determine split between wallet and bank (proportional)
            const walletRatio = wallet.div(totalWealth.plus(1)); // Avoid division by zero
            const bankRatio = bank.div(totalWealth.plus(1));

            const walletTax = taxAmount.times(walletRatio);
            const bankTax = taxAmount.times(bankRatio);

            return {
                userId,
                totalWealth: totalWealth.toNumber(),
                taxRate: taxRate.toNumber(),
                taxAmount: taxAmount.toNumber(),
                walletTax: walletTax.toNumber(),
                bankTax: bankTax.toNumber(),
                bracketInfo: taxInfo.bracket,
            };
        } catch (error) {
            this.logger.error('Error calculating user tax:', error);
            return {
                userId,
                totalWealth: 0,
                taxRate: 0,
                taxAmount: 0,
                walletTax: 0,
                bankTax: 0,
            };
        }
    }

    /**
     * Apply wealth tax to a user
     *
     * @param {string} userId - User ID
     * @param {Object} balance - User balance
     * @returns {Object} Tax application result
     */
    async applyTaxToUser(userId, balance) {
        try {
            const taxCalc = await this.calculateUserTax(userId, balance);

            if (taxCalc.taxAmount <= 0) {
                return {
                    success: true,
                    taxed: false,
                    amount: 0,
                    reason: 'No tax due',
                };
            }

            // Deduct tax from user balance
            const walletDeduction = -Math.abs(taxCalc.walletTax);
            const bankDeduction = -Math.abs(taxCalc.bankTax);

            const updateSuccess = await this.db.updateUserBalance(
                userId,
                null,
                walletDeduction,
                bankDeduction,
                { reason: 'wealth_tax', taxRate: taxCalc.taxRate }
            );

            if (!updateSuccess) {
                this.logger.error('Failed to deduct tax from user:', userId);
                return {
                    success: false,
                    taxed: false,
                    reason: 'Balance update failed',
                };
            }

            // Burn the collected tax
            await this.supplyController.burn(
                taxCalc.taxAmount,
                'wealth_tax',
                userId
            );

            // Update totals
            this.totalTaxesCollected = this.totalTaxesCollected.plus(
                new Decimal(taxCalc.taxAmount)
            );

            this.logger.debug('Tax applied to user:', {
                userId,
                amount: taxCalc.taxAmount,
                rate: taxCalc.taxRate,
            });

            return {
                success: true,
                taxed: true,
                amount: taxCalc.taxAmount,
                rate: taxCalc.taxRate,
                wallet: walletDeduction,
                bank: bankDeduction,
            };
        } catch (error) {
            this.logger.error('Error applying tax to user:', error);
            return {
                success: false,
                taxed: false,
                reason: error.message,
            };
        }
    }

    /**
     * Get wealth-dependent decay multiplier
     *
     * @param {Decimal} balance - User balance
     * @returns {Decimal} Decay multiplier
     */
    getDecayMultiplier(balance) {
        // Find applicable bracket
        for (const bracket of this.decayBrackets) {
            if (balance.gte(bracket.min) && balance.lt(bracket.max)) {
                return bracket.multiplier;
            }
        }

        // Default to highest bracket
        return this.decayBrackets[this.decayBrackets.length - 1].multiplier;
    }

    /**
     * Calculate continuous decay for a balance
     * Formula: balance(t+Δt) = balance(t) * e^(-δ * multiplier * Δt)
     *
     * @param {Decimal|number} balance - Current balance
     * @param {number} timeDeltaMs - Time elapsed in milliseconds
     * @returns {Decimal} Decayed balance
     */
    calculateDecay(balance, timeDeltaMs) {
        const b = new Decimal(balance);

        // Exempt small balances
        if (b.lt(this.minBalanceForDecay)) {
            return b;
        }

        // Convert time to days
        const timeDeltaDays = new Decimal(timeDeltaMs).div(86400000);

        // Get wealth-dependent multiplier
        const multiplier = this.getDecayMultiplier(b);

        // Calculate effective decay rate: base_rate * multiplier
        const effectiveDecayRate = this.baseDailyDecayRate.times(multiplier);

        // Calculate decay: e^(-δ * Δt)
        const exponent = effectiveDecayRate.times(timeDeltaDays).neg();
        const decayFactor = Decimal.exp(exponent);

        // Apply decay
        const newBalance = b.times(decayFactor);

        return newBalance;
    }

    /**
     * Apply continuous decay to a user
     *
     * @param {string} userId - User ID
     * @param {Object} balance - User balance
     * @param {number} timeDeltaMs - Time since last decay
     * @returns {Object} Decay application result
     */
    async applyDecayToUser(userId, balance, timeDeltaMs) {
        try {
            const wallet = new Decimal(balance.wallet || 0);
            const bank = new Decimal(balance.bank || 0);

            // Apply decay to both wallet and bank
            const newWallet = this.calculateDecay(wallet, timeDeltaMs);
            const newBank = this.calculateDecay(bank, timeDeltaMs);

            // Calculate decay amounts
            const walletDecay = wallet.minus(newWallet);
            const bankDecay = bank.minus(newBank);
            const totalDecay = walletDecay.plus(bankDecay);

            if (totalDecay.lte(0)) {
                return {
                    success: true,
                    decayed: false,
                    amount: 0,
                    reason: 'No decay due',
                };
            }

            // Deduct decay from user balance
            const walletDeduction = -Math.abs(walletDecay.toNumber());
            const bankDeduction = -Math.abs(bankDecay.toNumber());

            const updateSuccess = await this.db.updateUserBalance(
                userId,
                null,
                walletDeduction,
                bankDeduction,
                { reason: 'balance_decay', decayRate: this.dailyDecayRate.toNumber() }
            );

            if (!updateSuccess) {
                this.logger.error('Failed to apply decay to user:', userId);
                return {
                    success: false,
                    decayed: false,
                    reason: 'Balance update failed',
                };
            }

            // Burn the decayed amount
            await this.supplyController.burn(
                totalDecay.toNumber(),
                'balance_decay',
                userId
            );

            // Update totals
            this.totalDecayApplied = this.totalDecayApplied.plus(totalDecay);

            this.logger.debug('Decay applied to user:', {
                userId,
                amount: totalDecay.toNumber(),
                timeDeltaDays: (timeDeltaMs / 86400000).toFixed(2),
            });

            return {
                success: true,
                decayed: true,
                amount: totalDecay.toNumber(),
                wallet: walletDeduction,
                bank: bankDeduction,
            };
        } catch (error) {
            this.logger.error('Error applying decay to user:', error);
            return {
                success: false,
                decayed: false,
                reason: error.message,
            };
        }
    }

    /**
     * Run automated taxation across all users
     */
    async runTaxationCycle() {
        try {
            this.logger.info('Starting taxation cycle...');

            // Get all users with balances above tax threshold
            const users = await this.getUsersAboveThreshold(this.exemptThreshold.toNumber());

            let totalTaxed = 0;
            let usersTaxed = 0;

            for (const user of users) {
                const result = await this.applyTaxToUser(user.user_id, {
                    wallet: user.wallet,
                    bank: user.bank,
                });

                if (result.success && result.taxed) {
                    totalTaxed += result.amount;
                    usersTaxed++;
                }

                // Small delay to prevent database overload
                await this.sleep(10);
            }

            this.lastTaxRun = Date.now();

            this.logger.info('Taxation cycle completed:', {
                usersTaxed,
                totalTaxed,
                totalCollectedAllTime: this.totalTaxesCollected.toString(),
            });

            // Save tax history
            await this.saveTaxHistory();

            return {
                success: true,
                usersTaxed,
                totalTaxed,
            };
        } catch (error) {
            this.logger.error('Taxation cycle failed:', error);
            return {
                success: false,
                reason: error.message,
            };
        }
    }

    /**
     * Run automated decay application across all users
     */
    async runDecayCycle() {
        try {
            this.logger.info('Starting decay cycle...');

            const timeSinceLastDecay = Date.now() - this.lastDecayRun;

            // Get all users with balances above decay threshold
            const users = await this.getUsersAboveThreshold(
                this.minBalanceForDecay.toNumber()
            );

            let totalDecayed = 0;
            let usersDecayed = 0;

            for (const user of users) {
                const result = await this.applyDecayToUser(
                    user.user_id,
                    { wallet: user.wallet, bank: user.bank },
                    timeSinceLastDecay
                );

                if (result.success && result.decayed) {
                    totalDecayed += result.amount;
                    usersDecayed++;
                }

                // Small delay
                await this.sleep(10);
            }

            this.lastDecayRun = Date.now();

            this.logger.info('Decay cycle completed:', {
                usersDecayed,
                totalDecayed,
                totalDecayedAllTime: this.totalDecayApplied.toString(),
            });

            // Save decay history
            await this.saveDecayHistory();

            return {
                success: true,
                usersDecayed,
                totalDecayed,
            };
        } catch (error) {
            this.logger.error('Decay cycle failed:', error);
            return {
                success: false,
                reason: error.message,
            };
        }
    }

    /**
     * Start automated taxation - runs on schedule
     */
    startAutomatedTaxation() {
        const interval = config.TAX.APPLICATION_FREQUENCY;

        setInterval(async () => {
            await this.runTaxationCycle();
        }, interval);

        this.logger.info('Automated taxation started');
    }

    /**
     * Start automated decay - runs on schedule
     */
    startAutomatedDecay() {
        const interval = config.DECAY.APPLICATION_INTERVAL;

        setInterval(async () => {
            await this.runDecayCycle();
        }, interval);

        this.logger.info('Automated decay started');
    }

    /**
     * Get users with total balance above threshold
     */
    async getUsersAboveThreshold(threshold) {
        try {
            const query = `
                SELECT user_id, wallet, bank,
                       (wallet + bank) as total_wealth
                FROM user_balances
                WHERE (wallet + bank) > ?
                ORDER BY total_wealth DESC
            `;

            const users = await this.db.databaseAdapter.query(query, [threshold]);
            return users || [];
        } catch (error) {
            this.logger.error('Failed to get users above threshold:', error);
            return [];
        }
    }

    /**
     * Get taxation statistics
     */
    getTaxationStats() {
        return {
            baseRate: this.baseRate.toNumber(),
            maxRate: this.maxTaxRate.toNumber(),
            referenceBalance: this.referenceBalance.toNumber(),
            totalTaxesCollected: this.totalTaxesCollected.toNumber(),
            totalDecayApplied: this.totalDecayApplied.toNumber(),
            lastTaxRun: this.lastTaxRun ? new Date(this.lastTaxRun).toISOString() : null,
            lastDecayRun: this.lastDecayRun
                ? new Date(this.lastDecayRun).toISOString()
                : null,
            dailyDecayRate: this.dailyDecayRate.toNumber(),
        };
    }

    /**
     * Save tax history to database
     */
    async saveTaxHistory() {
        try {
            // Implementation depends on your schema
            this.logger.debug('Tax history saved');
            return true;
        } catch (error) {
            this.logger.error('Failed to save tax history:', error);
            return false;
        }
    }

    /**
     * Load tax history from database
     */
    async loadTaxHistory() {
        try {
            // Implementation depends on your schema
            return {
                lastTaxRun: Date.now(),
                lastDecayRun: Date.now(),
                totalCollected: 0,
            };
        } catch (error) {
            this.logger.error('Failed to load tax history:', error);
            return {
                lastTaxRun: Date.now(),
                lastDecayRun: Date.now(),
                totalCollected: 0,
            };
        }
    }

    /**
     * Save decay history to database
     */
    async saveDecayHistory() {
        try {
            // Implementation depends on your schema
            this.logger.debug('Decay history saved');
            return true;
        } catch (error) {
            this.logger.error('Failed to save decay history:', error);
            return false;
        }
    }

    /**
     * Utility sleep function
     */
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

module.exports = TaxationSystem;
