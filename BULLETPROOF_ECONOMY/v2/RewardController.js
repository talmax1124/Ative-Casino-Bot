/**
 * REWARD CONTROLLER - Diminishing Returns + Anti-Farming
 *
 * Implements:
 * 1. Diminishing returns: reward = base * 1 / (1 + α * (balance / B))
 * 2. Power-law dampening: reward = base * (balance + 1)^(-γ)
 * 3. Task-specific diminishing: reward(n) = base * 1 / log(1 + n * c)
 * 4. Cooldown scaling: cooldown = base * (1 + β * streak)
 * 5. Daily caps with level scaling
 * 6. Diversity bonuses
 *
 * Mathematical Foundation:
 * - Rich players get exponentially smaller rewards
 * - Repeated tasks yield diminishing returns
 * - Cooldowns scale with usage
 * - Daily caps prevent exploitation
 */

const config = require('./config');
const Decimal = require('decimal.js');

class RewardController {
    constructor(database, supplyController, logger) {
        this.db = database;
        this.supplyController = supplyController;
        this.logger = logger;

        // Reward parameters
        this.dampeningAlpha = new Decimal(config.REWARDS.DAMPENING_ALPHA);
        this.referenceBalance = new Decimal(config.REWARDS.REFERENCE_BALANCE);
        this.powerLawGamma = new Decimal(config.REWARDS.POWER_LAW_GAMMA);
        this.minMultiplier = new Decimal(config.REWARDS.MIN_MULTIPLIER);
        this.maxMultiplier = new Decimal(config.REWARDS.MAX_MULTIPLIER);

        // Base rewards
        this.baseRewards = {};
        for (const [key, value] of Object.entries(config.REWARDS.BASE_AMOUNTS)) {
            this.baseRewards[key] = new Decimal(value);
        }

        // Anti-farming parameters
        this.cooldowns = config.ANTI_FARMING.COOLDOWNS;
        this.streakBeta = new Decimal(config.ANTI_FARMING.STREAK_BETA);
        this.dailyCaps = config.ANTI_FARMING.DAILY_CAPS;
        this.hourlyLimits = config.ANTI_FARMING.HOURLY_LIMITS;

        // Task limits
        this.logConstant = new Decimal(config.TASK_LIMITS.LOG_CONSTANT);
        this.maxDailyReps = config.TASK_LIMITS.MAX_DAILY_REPS;

        // User tracking (in-memory cache)
        this.userActivityCache = new Map();

        this.logger.info('RewardController initialized');
    }

    /**
     * Initialize reward controller
     */
    async initialize() {
        try {
            // Start periodic cache cleanup
            this.startCacheCleanup();

            this.logger.info('RewardController started');
            return { success: true };
        } catch (error) {
            this.logger.error('RewardController initialization failed:', error);
            throw new Error(`Reward initialization failed: ${error.message}`);
        }
    }

    /**
     * Calculate diminishing returns multiplier based on user balance
     * Formula: multiplier = 1 / (1 + α * (balance / B))
     *
     * @param {Decimal|number} balance - User's total balance
     * @returns {Decimal} Reward multiplier (0-1)
     */
    calculateBalanceDampening(balance) {
        const b = new Decimal(balance);

        // Formula: 1 / (1 + α * (b / B))
        const balanceRatio = b.div(this.referenceBalance);
        const dampening = this.dampeningAlpha.times(balanceRatio);
        const multiplier = new Decimal(1).div(new Decimal(1).plus(dampening));

        // Clamp to min/max
        return Decimal.max(Decimal.min(multiplier, this.maxMultiplier), this.minMultiplier);
    }

    /**
     * Calculate power-law diminishing returns
     * Formula: multiplier = (balance + 1)^(-γ)
     *
     * @param {Decimal|number} balance - User's total balance
     * @returns {Decimal} Reward multiplier
     */
    calculatePowerLawDampening(balance) {
        const b = new Decimal(balance);

        // Formula: (b + 1)^(-γ)
        const base = b.plus(1);
        const exponent = this.powerLawGamma.neg();
        const multiplier = base.pow(exponent);

        // Clamp to min/max
        return Decimal.max(Decimal.min(multiplier, this.maxMultiplier), this.minMultiplier);
    }

    /**
     * Calculate task repetition dampening
     * Formula: reward(n) = base * 1 / log(1 + n * c)
     *
     * @param {number} repetitions - Number of times task performed today
     * @returns {Decimal} Reward multiplier
     */
    calculateRepetitionDampening(repetitions) {
        if (repetitions <= 0) {
            return new Decimal(1);
        }

        const n = new Decimal(repetitions);

        // Formula: 1 / log(1 + n * c)
        const logArg = new Decimal(1).plus(n.times(this.logConstant));
        const logValue = Decimal.ln(logArg); // Natural log

        if (logValue.lte(0.01)) {
            // Prevent division by very small numbers
            return this.minMultiplier;
        }

        const multiplier = new Decimal(1).div(logValue);

        // Clamp to min
        return Decimal.max(multiplier, this.minMultiplier);
    }

    /**
     * Calculate combined reward multiplier
     *
     * @param {Object} params - Calculation parameters
     * @returns {Decimal} Final multiplier
     */
    calculateRewardMultiplier(params) {
        const { balance, repetitions, diversity } = params;

        // Calculate all dampening factors
        const balanceDampening = this.calculateBalanceDampening(balance || 0);
        const powerLawDampening = this.calculatePowerLawDampening(balance || 0);
        const repetitionDampening = this.calculateRepetitionDampening(repetitions || 0);

        // Use the most restrictive dampening (minimum)
        let multiplier = Decimal.min(balanceDampening, powerLawDampening);
        multiplier = multiplier.times(repetitionDampening);

        // Apply diversity bonus if applicable
        if (diversity && diversity > 0) {
            const diversityBonus = new Decimal(1).plus(
                new Decimal(diversity).times(config.REPUTATION.DIVERSITY_BONUS_MULTIPLIER)
            );
            multiplier = multiplier.times(diversityBonus);
        }

        // Final clamp
        return Decimal.max(Decimal.min(multiplier, this.maxMultiplier), this.minMultiplier);
    }

    /**
     * Calculate reward for a specific task
     *
     * @param {string} taskType - Type of task (WORK, DAILY, etc.)
     * @param {string} userId - User ID
     * @param {Object} userBalance - User balance object
     * @returns {Object} Reward calculation result
     */
    async calculateReward(taskType, userId, userBalance) {
        try {
            // Get base reward
            const baseReward = this.baseRewards[taskType] || new Decimal(100);

            // Calculate user's total wealth
            const wallet = new Decimal(userBalance.wallet || 0);
            const bank = new Decimal(userBalance.bank || 0);
            const totalWealth = wallet.plus(bank);

            // Get user activity data
            const activity = await this.getUserActivity(userId);

            // Calculate repetitions for this task today
            const repetitions = activity.taskCounts[taskType] || 0;

            // Calculate diversity score
            const diversity = this.calculateDiversityScore(activity);

            // Calculate multiplier
            const multiplier = this.calculateRewardMultiplier({
                balance: totalWealth.toNumber(),
                repetitions,
                diversity,
            });

            // Calculate final reward
            const finalReward = baseReward.times(multiplier);

            // Check supply-based scaling
            const supplyStats = this.supplyController.getSupplyStats();
            const supplyMultiplier = this.calculateSupplyScaling(supplyStats);
            const scaledReward = finalReward.times(supplyMultiplier);

            // Round to integer
            const rewardAmount = scaledReward.floor();

            return {
                taskType,
                baseReward: baseReward.toNumber(),
                multiplier: multiplier.toNumber(),
                supplyMultiplier: supplyMultiplier.toNumber(),
                finalReward: rewardAmount.toNumber(),
                repetitions,
                diversity,
                reducedFromBase: baseReward.minus(rewardAmount).toNumber(),
            };
        } catch (error) {
            this.logger.error('Error calculating reward:', error);
            return {
                taskType,
                baseReward: 0,
                multiplier: 0,
                finalReward: 0,
                error: error.message,
            };
        }
    }

    /**
     * Calculate supply-based reward scaling
     * Reduces rewards as supply approaches cap
     *
     * @param {Object} supplyStats - Supply statistics
     * @returns {Decimal} Supply scaling multiplier
     */
    calculateSupplyScaling(supplyStats) {
        const utilization = new Decimal(supplyStats.utilizationPercent).div(100);
        const targetGrowth = new Decimal(config.DYNAMIC_SCALING.TARGET_GROWTH_RATE);
        const sensitivity = new Decimal(config.DYNAMIC_SCALING.SENSITIVITY);

        // Calculate growth rate from supply controller
        const actualGrowth = this.supplyController.calculateGrowthRate(86400000); // 24 hours
        const growthRatio = actualGrowth.div(100); // Convert to decimal

        // If growth exceeds target, reduce rewards
        // Formula: R = 1 / (1 + κ * (g(t) - g_target))
        const growthDelta = growthRatio.minus(targetGrowth);

        if (growthDelta.gt(0)) {
            // Growth is too high, reduce rewards
            const reductionFactor = new Decimal(1).div(
                new Decimal(1).plus(sensitivity.times(growthDelta))
            );

            return Decimal.max(reductionFactor, new Decimal(config.DYNAMIC_SCALING.MIN_SCALE_FACTOR));
        }

        // Growth is acceptable, allow normal rewards (up to max scale)
        return new Decimal(1);
    }

    /**
     * Issue reward to user
     *
     * @param {string} userId - User ID
     * @param {string} taskType - Task type
     * @param {Object} userBalance - User balance
     * @returns {Object} Reward issuance result
     */
    async issueReward(userId, taskType, userBalance) {
        try {
            // Calculate reward
            const rewardCalc = await this.calculateReward(taskType, userId, userBalance);

            if (rewardCalc.finalReward <= 0) {
                return {
                    success: false,
                    reason: 'Reward is zero or negative',
                    amount: 0,
                };
            }

            // Check daily cap
            const capCheck = await this.checkDailyCap(userId, rewardCalc.finalReward);
            if (!capCheck.allowed) {
                return {
                    success: false,
                    reason: capCheck.reason,
                    amount: 0,
                };
            }

            // Check task repetition limit
            const repCheck = this.checkRepetitionLimit(taskType, rewardCalc.repetitions);
            if (!repCheck.allowed) {
                return {
                    success: false,
                    reason: repCheck.reason,
                    amount: 0,
                };
            }

            // Mint the reward
            const mintResult = await this.supplyController.mint(
                rewardCalc.finalReward,
                `${taskType}_reward`,
                userId
            );

            if (!mintResult.success) {
                return {
                    success: false,
                    reason: 'Minting failed: ' + mintResult.reason,
                    amount: 0,
                };
            }

            // Give reward to user
            const giveSuccess = await this.db.updateUserBalance(
                userId,
                null,
                mintResult.amount,
                0,
                { reason: `${taskType}_reward` }
            );

            if (!giveSuccess) {
                // Minting succeeded but giving failed - burn the minted amount
                await this.supplyController.burn(
                    mintResult.amount,
                    'failed_reward_rollback',
                    userId
                );

                return {
                    success: false,
                    reason: 'Failed to update user balance',
                    amount: 0,
                };
            }

            // Update user activity tracking
            await this.recordActivity(userId, taskType, mintResult.amount);

            this.logger.info('Reward issued:', {
                userId,
                taskType,
                amount: mintResult.amount,
                multiplier: rewardCalc.multiplier,
            });

            return {
                success: true,
                amount: mintResult.amount,
                baseAmount: rewardCalc.baseReward,
                multiplier: rewardCalc.multiplier,
                reduced: rewardCalc.reducedFromBase > 0,
                reductionAmount: rewardCalc.reducedFromBase,
            };
        } catch (error) {
            this.logger.error('Error issuing reward:', error);
            return {
                success: false,
                reason: error.message,
                amount: 0,
            };
        }
    }

    /**
     * Check if user has reached daily earning cap
     *
     * @param {string} userId - User ID
     * @param {number} proposedReward - Proposed reward amount
     * @returns {Object} Cap check result
     */
    async checkDailyCap(userId, proposedReward) {
        try {
            const activity = await this.getUserActivity(userId);
            const dailyEarnings = activity.dailyEarnings || 0;

            // Calculate cap (base + per level)
            const userLevel = await this.getUserLevel(userId);
            const cap =
                this.dailyCaps.BASE +
                userLevel * this.dailyCaps.PER_LEVEL;
            const effectiveCap = Math.min(cap, this.dailyCaps.ABSOLUTE_MAX);

            if (dailyEarnings + proposedReward > effectiveCap) {
                return {
                    allowed: false,
                    reason: `Daily earning cap reached (${effectiveCap})`,
                    cap: effectiveCap,
                    current: dailyEarnings,
                };
            }

            return {
                allowed: true,
                cap: effectiveCap,
                current: dailyEarnings,
                remaining: effectiveCap - dailyEarnings,
            };
        } catch (error) {
            this.logger.error('Error checking daily cap:', error);
            return { allowed: true }; // Fail open to not block users
        }
    }

    /**
     * Check if task repetition limit reached
     *
     * @param {string} taskType - Task type
     * @param {number} currentReps - Current repetitions
     * @returns {Object} Repetition check result
     */
    checkRepetitionLimit(taskType, currentReps) {
        const maxReps = this.maxDailyReps[taskType];

        if (maxReps && currentReps >= maxReps) {
            return {
                allowed: false,
                reason: `Maximum daily repetitions reached for ${taskType} (${maxReps})`,
                limit: maxReps,
                current: currentReps,
            };
        }

        return {
            allowed: true,
            limit: maxReps,
            current: currentReps,
        };
    }

    /**
     * Check cooldown for a task
     *
     * @param {string} userId - User ID
     * @param {string} taskType - Task type
     * @returns {Object} Cooldown check result
     */
    async checkCooldown(userId, taskType) {
        try {
            const activity = await this.getUserActivity(userId);
            const lastUse = activity.lastTaskTimes[taskType] || 0;
            const streak = activity.taskStreaks[taskType] || 0;

            // Calculate cooldown with streak scaling
            // cooldown = base * (1 + β * streak)
            const baseCooldown = this.cooldowns[taskType] || 0;
            const streakMultiplier = new Decimal(1).plus(
                this.streakBeta.times(streak)
            );
            const effectiveCooldown = new Decimal(baseCooldown)
                .times(streakMultiplier)
                .toNumber();

            const timeSinceUse = Date.now() - lastUse;

            if (timeSinceUse < effectiveCooldown) {
                const remaining = effectiveCooldown - timeSinceUse;

                return {
                    ready: false,
                    reason: 'Task on cooldown',
                    cooldown: effectiveCooldown,
                    remaining,
                    remainingFormatted: this.formatTime(remaining),
                };
            }

            return {
                ready: true,
                cooldown: effectiveCooldown,
                streak,
            };
        } catch (error) {
            this.logger.error('Error checking cooldown:', error);
            return { ready: true }; // Fail open
        }
    }

    /**
     * Get user activity data
     */
    async getUserActivity(userId) {
        // Check cache first
        if (this.userActivityCache.has(userId)) {
            const cached = this.userActivityCache.get(userId);
            // Check if cache is fresh (less than 1 hour old)
            if (Date.now() - cached.timestamp < 3600000) {
                return cached.data;
            }
        }

        // Load from database
        const activity = await this.loadUserActivityFromDB(userId);

        // Cache it
        this.userActivityCache.set(userId, {
            data: activity,
            timestamp: Date.now(),
        });

        return activity;
    }

    /**
     * Load user activity from database
     */
    async loadUserActivityFromDB(userId) {
        try {
            // Query user activity table
            // This is a placeholder - implement based on your schema
            return {
                userId,
                dailyEarnings: 0,
                taskCounts: {},
                lastTaskTimes: {},
                taskStreaks: {},
                uniqueTasksToday: 0,
                totalTasksToday: 0,
            };
        } catch (error) {
            this.logger.error('Failed to load user activity:', error);
            return {
                userId,
                dailyEarnings: 0,
                taskCounts: {},
                lastTaskTimes: {},
                taskStreaks: {},
                uniqueTasksToday: 0,
                totalTasksToday: 0,
            };
        }
    }

    /**
     * Record user activity
     */
    async recordActivity(userId, taskType, amount) {
        try {
            const activity = await this.getUserActivity(userId);

            // Update counters
            activity.dailyEarnings = (activity.dailyEarnings || 0) + amount;
            activity.taskCounts[taskType] = (activity.taskCounts[taskType] || 0) + 1;
            activity.lastTaskTimes[taskType] = Date.now();
            activity.totalTasksToday = (activity.totalTasksToday || 0) + 1;

            // Update unique tasks count
            const uniqueTasks = new Set(Object.keys(activity.taskCounts));
            activity.uniqueTasksToday = uniqueTasks.size;

            // Update streak
            activity.taskStreaks[taskType] = (activity.taskStreaks[taskType] || 0) + 1;

            // Update cache
            this.userActivityCache.set(userId, {
                data: activity,
                timestamp: Date.now(),
            });

            // Save to database (async)
            this.saveUserActivityToDB(userId, activity).catch((err) =>
                this.logger.error('Failed to save activity:', err)
            );

            return true;
        } catch (error) {
            this.logger.error('Error recording activity:', error);
            return false;
        }
    }

    /**
     * Save user activity to database
     */
    async saveUserActivityToDB(userId, activity) {
        try {
            // Save to database
            // Implementation depends on your schema
            return true;
        } catch (error) {
            this.logger.error('Failed to save user activity to DB:', error);
            return false;
        }
    }

    /**
     * Calculate diversity score for user
     */
    calculateDiversityScore(activity) {
        if (!activity.totalTasksToday || activity.totalTasksToday === 0) {
            return 0;
        }

        const diversity = activity.uniqueTasksToday / activity.totalTasksToday;
        return diversity;
    }

    /**
     * Get user level (from database)
     */
    async getUserLevel(userId) {
        try {
            const levelData = await this.db.getUserLevel(userId, null);
            return levelData.level || 1;
        } catch (error) {
            return 1; // Default level
        }
    }

    /**
     * Format time in milliseconds to human readable
     */
    formatTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Start periodic cache cleanup
     */
    startCacheCleanup() {
        // Clean up stale cache entries every hour
        setInterval(() => {
            const now = Date.now();
            const maxAge = 3600000; // 1 hour

            for (const [userId, cached] of this.userActivityCache.entries()) {
                if (now - cached.timestamp > maxAge) {
                    this.userActivityCache.delete(userId);
                }
            }

            this.logger.debug('Activity cache cleaned:', {
                size: this.userActivityCache.size,
            });
        }, 3600000);
    }

    /**
     * Get reward controller statistics
     */
    getRewardStats() {
        return {
            baseRewards: Object.fromEntries(
                Object.entries(this.baseRewards).map(([k, v]) => [k, v.toNumber()])
            ),
            dampeningAlpha: this.dampeningAlpha.toNumber(),
            referenceBalance: this.referenceBalance.toNumber(),
            minMultiplier: this.minMultiplier.toNumber(),
            maxMultiplier: this.maxMultiplier.toNumber(),
            activeCacheSize: this.userActivityCache.size,
        };
    }
}

module.exports = RewardController;
