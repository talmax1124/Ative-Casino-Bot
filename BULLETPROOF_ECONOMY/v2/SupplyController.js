/**
 * SUPPLY CONTROLLER - Fixed Supply + Controlled Minting
 *
 * Implements:
 * 1. Fixed supply cap (S_total ≤ S_cap)
 * 2. Exponential decay issuance: ΔS(t) = S_0 * e^(-λ t)
 * 3. Supply monitoring and emergency controls
 *
 * Mathematical Foundation:
 * - Total supply never exceeds S_cap
 * - Issuance rate decays exponentially over time
 * - Emergency burns activate near cap
 * - Real-time supply tracking
 */

const config = require('./config');
const Decimal = require('decimal.js');

class SupplyController {
    constructor(database, logger) {
        this.db = database;
        this.logger = logger;

        // Core supply parameters
        this.supplyCap = new Decimal(config.SUPPLY.ABSOLUTE_CAP);
        this.initialIssuanceRate = new Decimal(config.SUPPLY.INITIAL_ISSUANCE_RATE);
        this.decayLambda = new Decimal(config.SUPPLY.ISSUANCE_DECAY_LAMBDA);
        this.minimumIssuanceRate = new Decimal(config.SUPPLY.MINIMUM_ISSUANCE_RATE);

        // Supply state
        this.currentSupply = new Decimal(0);
        this.totalBurned = new Decimal(0);
        this.totalMinted = new Decimal(0);
        this.systemStartTime = Date.now();
        this.lastSupplyCheck = Date.now();

        // Emergency mode flag
        this.emergencyMode = false;

        // Supply history for analytics
        this.supplyHistory = [];

        this.logger.info('SupplyController initialized with cap:', this.supplyCap.toString());
    }

    /**
     * Initialize supply controller - load current supply from database
     */
    async initialize() {
        try {
            // Load current total supply from database
            const supplyData = await this.loadSupplyFromDatabase();
            this.currentSupply = new Decimal(supplyData.total || 0);
            this.totalBurned = new Decimal(supplyData.burned || 0);
            this.totalMinted = new Decimal(supplyData.minted || 0);

            this.logger.info('Supply loaded:', {
                current: this.currentSupply.toString(),
                cap: this.supplyCap.toString(),
                utilization: this.getSupplyUtilization().toString() + '%',
            });

            // Start supply monitoring
            this.startSupplyMonitoring();

            return {
                success: true,
                supply: this.currentSupply.toString(),
                cap: this.supplyCap.toString(),
            };
        } catch (error) {
            this.logger.error('Supply initialization failed:', error);
            throw new Error(`Supply initialization failed: ${error.message}`);
        }
    }

    /**
     * Load current supply from database by summing all user balances
     */
    async loadSupplyFromDatabase() {
        try {
            // Query database for total wallet + bank across all users
            // This is the actual circulating supply
            const query = `
                SELECT
                    COALESCE(SUM(wallet), 0) + COALESCE(SUM(bank), 0) as total_supply,
                    COUNT(DISTINCT user_id) as user_count
                FROM user_balances
            `;

            const result = await this.db.databaseAdapter.query(query);

            if (result && result.length > 0) {
                return {
                    total: result[0].total_supply || 0,
                    users: result[0].user_count || 0,
                    burned: 0, // Load from economy_metadata if tracked
                    minted: 0, // Load from economy_metadata if tracked
                };
            }

            return { total: 0, users: 0, burned: 0, minted: 0 };
        } catch (error) {
            this.logger.error('Failed to load supply from database:', error);
            return { total: 0, users: 0, burned: 0, minted: 0 };
        }
    }

    /**
     * Calculate current issuance rate using exponential decay
     * Formula: ΔS(t) = S_0 * e^(-λ t)
     *
     * @returns {Decimal} Current issuance rate
     */
    calculateIssuanceRate() {
        // Calculate time elapsed in days since system start
        const timeElapsed = new Decimal(Date.now() - this.systemStartTime);
        const daysElapsed = timeElapsed.div(86400000); // Convert ms to days

        // Calculate exponential decay: S_0 * e^(-λ * t)
        const exponent = this.decayLambda.times(daysElapsed).neg();
        const decayFactor = Decimal.exp(exponent);

        // Calculate current rate
        const currentRate = this.initialIssuanceRate.times(decayFactor);

        // Apply minimum floor
        return Decimal.max(currentRate, this.minimumIssuanceRate);
    }

    /**
     * Check if minting is allowed and calculate actual mint amount
     *
     * @param {Decimal|number} requestedAmount - Requested mint amount
     * @returns {Object} { allowed: boolean, amount: Decimal, reason: string }
     */
    checkMintingAllowed(requestedAmount) {
        const amount = new Decimal(requestedAmount);

        // Check 1: Zero or negative amount
        if (amount.lte(0)) {
            return {
                allowed: false,
                amount: new Decimal(0),
                reason: 'Invalid amount: must be positive',
            };
        }

        // Check 2: Supply cap check
        const projectedSupply = this.currentSupply.plus(amount);

        if (projectedSupply.gt(this.supplyCap)) {
            // Calculate maximum allowable mint
            const maxMint = this.supplyCap.minus(this.currentSupply);

            if (maxMint.lte(0)) {
                // Supply cap reached - BLOCK ALL MINTING
                this.logger.warn('SUPPLY CAP REACHED - Minting blocked!');
                return {
                    allowed: false,
                    amount: new Decimal(0),
                    reason: 'Supply cap reached - no more currency can be minted',
                };
            }

            // Reduce to maximum allowable
            this.logger.warn('Mint reduced to prevent exceeding cap:', {
                requested: amount.toString(),
                reduced: maxMint.toString(),
            });

            return {
                allowed: true,
                amount: maxMint,
                reason: 'Reduced to stay within supply cap',
                reduced: true,
            };
        }

        // Check 3: Issuance rate limit
        const currentRate = this.calculateIssuanceRate();
        const rateLimit = currentRate.times(1.5); // Allow 1.5x current rate as burst

        if (amount.gt(rateLimit)) {
            this.logger.warn('Mint exceeds issuance rate limit:', {
                requested: amount.toString(),
                rateLimit: rateLimit.toString(),
            });

            return {
                allowed: true,
                amount: rateLimit,
                reason: 'Reduced to match issuance rate limit',
                reduced: true,
            };
        }

        // Check 4: Emergency mode
        if (this.emergencyMode) {
            // In emergency mode, reduce all minting by 90%
            const reducedAmount = amount.times(0.1);

            this.logger.warn('Emergency mode active - minting severely restricted');

            return {
                allowed: true,
                amount: reducedAmount,
                reason: 'Emergency mode: 90% reduction applied',
                reduced: true,
                emergency: true,
            };
        }

        // All checks passed
        return {
            allowed: true,
            amount: amount,
            reason: 'Minting approved',
            reduced: false,
        };
    }

    /**
     * Mint new currency into circulation
     *
     * @param {number} amount - Amount to mint
     * @param {string} reason - Reason for minting
     * @param {string} recipient - User ID receiving minted currency
     * @returns {Object} Mint result
     */
    async mint(amount, reason, recipient = 'system') {
        try {
            const requestedAmount = new Decimal(amount);

            // Check if minting is allowed
            const mintCheck = this.checkMintingAllowed(requestedAmount);

            if (!mintCheck.allowed) {
                this.logger.warn('Minting blocked:', mintCheck.reason);
                return {
                    success: false,
                    reason: mintCheck.reason,
                    amount: 0,
                };
            }

            const actualAmount = mintCheck.amount;

            // Update supply
            this.currentSupply = this.currentSupply.plus(actualAmount);
            this.totalMinted = this.totalMinted.plus(actualAmount);

            // Log mint event
            await this.logSupplyEvent('mint', {
                amount: actualAmount.toString(),
                requested: requestedAmount.toString(),
                reduced: mintCheck.reduced,
                reason,
                recipient,
                newSupply: this.currentSupply.toString(),
                utilization: this.getSupplyUtilization().toNumber(),
            });

            // Check emergency mode trigger
            await this.checkEmergencyMode();

            this.logger.info('Currency minted:', {
                amount: actualAmount.toString(),
                reason,
                newSupply: this.currentSupply.toString(),
            });

            return {
                success: true,
                amount: actualAmount.toNumber(),
                reduced: mintCheck.reduced,
                newSupply: this.currentSupply.toNumber(),
                utilizationPercent: this.getSupplyUtilization().toNumber(),
            };
        } catch (error) {
            this.logger.error('Mint failed:', error);
            return {
                success: false,
                reason: error.message,
                amount: 0,
            };
        }
    }

    /**
     * Burn currency from circulation
     *
     * @param {number} amount - Amount to burn
     * @param {string} reason - Reason for burning
     * @param {string} source - Source of burned currency
     * @returns {Object} Burn result
     */
    async burn(amount, reason, source = 'system') {
        try {
            const burnAmount = new Decimal(amount);

            if (burnAmount.lte(0)) {
                return {
                    success: false,
                    reason: 'Invalid burn amount',
                    amount: 0,
                };
            }

            // Update supply
            this.currentSupply = Decimal.max(
                this.currentSupply.minus(burnAmount),
                new Decimal(0)
            );
            this.totalBurned = this.totalBurned.plus(burnAmount);

            // Log burn event
            await this.logSupplyEvent('burn', {
                amount: burnAmount.toString(),
                reason,
                source,
                newSupply: this.currentSupply.toString(),
                utilization: this.getSupplyUtilization().toNumber(),
            });

            // Check if we can exit emergency mode
            await this.checkEmergencyMode();

            this.logger.info('Currency burned:', {
                amount: burnAmount.toString(),
                reason,
                newSupply: this.currentSupply.toString(),
            });

            return {
                success: true,
                amount: burnAmount.toNumber(),
                newSupply: this.currentSupply.toNumber(),
                utilizationPercent: this.getSupplyUtilization().toNumber(),
            };
        } catch (error) {
            this.logger.error('Burn failed:', error);
            return {
                success: false,
                reason: error.message,
                amount: 0,
            };
        }
    }

    /**
     * Get current supply utilization as percentage
     * @returns {Decimal} Utilization percentage (0-100)
     */
    getSupplyUtilization() {
        return this.currentSupply.div(this.supplyCap).times(100);
    }

    /**
     * Check and update emergency mode status
     */
    async checkEmergencyMode() {
        const utilization = this.getSupplyUtilization();
        const threshold = new Decimal(config.SUPPLY.EMERGENCY_BURN_THRESHOLD * 100);

        if (utilization.gte(threshold) && !this.emergencyMode) {
            this.emergencyMode = true;
            this.logger.error('🚨 EMERGENCY MODE ACTIVATED - Supply near cap!', {
                utilization: utilization.toString() + '%',
                threshold: threshold.toString() + '%',
            });

            // Trigger emergency actions
            await this.triggerEmergencyActions();
        } else if (utilization.lt(threshold) && this.emergencyMode) {
            this.emergencyMode = false;
            this.logger.info('✅ Emergency mode deactivated - Supply under control');
        }
    }

    /**
     * Trigger emergency supply control actions
     */
    async triggerEmergencyActions() {
        this.logger.warn('Executing emergency supply control actions...');

        // 1. Increase all taxes by emergency multiplier
        // 2. Activate emergency burns on all large transactions
        // 3. Reduce all rewards to minimum
        // 4. Alert administrators

        // These will be coordinated with other controllers
        // For now, just log the event
        await this.logSupplyEvent('emergency_mode_activated', {
            supply: this.currentSupply.toString(),
            cap: this.supplyCap.toString(),
            utilization: this.getSupplyUtilization().toNumber(),
        });
    }

    /**
     * Get comprehensive supply statistics
     */
    getSupplyStats() {
        const utilization = this.getSupplyUtilization();
        const issuanceRate = this.calculateIssuanceRate();

        return {
            currentSupply: this.currentSupply.toNumber(),
            supplyCap: this.supplyCap.toNumber(),
            utilizationPercent: utilization.toNumber(),
            totalMinted: this.totalMinted.toNumber(),
            totalBurned: this.totalBurned.toNumber(),
            netSupply: this.currentSupply.toNumber(),
            issuanceRate: issuanceRate.toNumber(),
            emergencyMode: this.emergencyMode,
            remainingCapacity: this.supplyCap.minus(this.currentSupply).toNumber(),
            burnRatio: this.totalBurned.div(this.totalMinted.plus(1)).toNumber(),
        };
    }

    /**
     * Start supply monitoring - periodic checks
     */
    startSupplyMonitoring() {
        const interval = config.SUPPLY.SUPPLY_CHECK_INTERVAL;

        setInterval(async () => {
            try {
                // Reload supply from database for accuracy
                const supplyData = await this.loadSupplyFromDatabase();
                this.currentSupply = new Decimal(supplyData.total);

                // Check emergency mode
                await this.checkEmergencyMode();

                // Log supply stats periodically
                if (Math.random() < 0.1) {
                    // 10% sample rate
                    this.logger.debug('Supply monitor:', this.getSupplyStats());
                }

                // Store supply history
                this.supplyHistory.push({
                    timestamp: Date.now(),
                    supply: this.currentSupply.toNumber(),
                    utilization: this.getSupplyUtilization().toNumber(),
                });

                // Keep only last 1000 entries
                if (this.supplyHistory.length > 1000) {
                    this.supplyHistory.shift();
                }
            } catch (error) {
                this.logger.error('Supply monitoring error:', error);
            }
        }, interval);

        this.logger.info('Supply monitoring started');
    }

    /**
     * Log supply event to database
     */
    async logSupplyEvent(eventType, data) {
        try {
            // Log to economy_events table
            const eventData = {
                event_type: eventType,
                timestamp: new Date(),
                data: JSON.stringify(data),
            };

            // Insert into database (implementation depends on your schema)
            this.logger.debug('Supply event logged:', eventType, data);

            return true;
        } catch (error) {
            this.logger.error('Failed to log supply event:', error);
            return false;
        }
    }

    /**
     * Calculate supply growth rate over time period
     *
     * @param {number} periodMs - Time period in milliseconds
     * @returns {Decimal} Growth rate as percentage
     */
    calculateGrowthRate(periodMs = 86400000) {
        // Default 24 hours
        if (this.supplyHistory.length < 2) {
            return new Decimal(0);
        }

        const now = Date.now();
        const cutoffTime = now - periodMs;

        // Find supply at cutoff time
        const historicalEntry = this.supplyHistory.find(
            (entry) => entry.timestamp >= cutoffTime
        );

        if (!historicalEntry) {
            return new Decimal(0);
        }

        const oldSupply = new Decimal(historicalEntry.supply);
        const supplyChange = this.currentSupply.minus(oldSupply);
        const growthRate = supplyChange.div(oldSupply.plus(1)).times(100);

        return growthRate;
    }

    /**
     * Forecast supply at future time based on current issuance rate
     *
     * @param {number} daysAhead - Days to forecast
     * @returns {Object} Forecast data
     */
    forecastSupply(daysAhead) {
        const dailyIssuance = this.calculateIssuanceRate();
        let projectedSupply = new Decimal(this.currentSupply);

        const forecast = [];

        for (let day = 1; day <= daysAhead; day++) {
            // Calculate decayed issuance for this day
            const timeOffset = new Decimal(day).div(86400000);
            const exponent = this.decayLambda.times(timeOffset).neg();
            const decayFactor = Decimal.exp(exponent);
            const dayIssuance = this.initialIssuanceRate.times(decayFactor);

            // Add to projected supply (capped at max)
            projectedSupply = Decimal.min(
                projectedSupply.plus(dayIssuance),
                this.supplyCap
            );

            forecast.push({
                day,
                supply: projectedSupply.toNumber(),
                issuance: dayIssuance.toNumber(),
                utilization: projectedSupply
                    .div(this.supplyCap)
                    .times(100)
                    .toNumber(),
            });
        }

        return {
            currentSupply: this.currentSupply.toNumber(),
            forecastDays: daysAhead,
            projectedSupply: projectedSupply.toNumber(),
            projectedUtilization: projectedSupply
                .div(this.supplyCap)
                .times(100)
                .toNumber(),
            dailyForecast: forecast,
        };
    }
}

module.exports = SupplyController;
