/**
 * Tuning Manager - Real-time economic regulation for casino games
 * Connects AI-generated tuning values to actual game mechanics
 */

const logger = require('./logger');

class TuningManager {
    constructor() {
        this.db = null;
        this.tuningCache = new Map();
        this.lastCacheUpdate = 0;
        this.cacheTimeout = 60000; // 1 minute cache
        this.initialized = false;
    }

    /**
     * Initialize the tuning manager
     */
    async initialize() {
        if (this.initialized) return;
        
        try {
            // Get database connection from existing adapter
            const databaseAdapter = require('./databaseAdapter');
            if (!databaseAdapter.pool) {
                throw new Error('Database adapter not initialized');
            }
            this.db = databaseAdapter.pool;
            
            // Load initial tuning values
            await this.refreshCache();
            
            this.initialized = true;
            logger.info('🎛️ Tuning Manager initialized - games now under AI economic control');
            
        } catch (error) {
            logger.error(`Tuning Manager initialization failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Refresh tuning cache from database
     */
    async refreshCache() {
        try {
            if (!this.db) {
                logger.warn('Database not initialized, skipping tuning cache refresh');
                return;
            }
            
            const [rows] = await this.db.execute(`
                SELECT scope, key_name, value, updated_at 
                FROM tuning 
                ORDER BY updated_at DESC
            `);
            
            this.tuningCache.clear();
            
            for (const row of rows) {
                const key = `${row.scope}:${row.key_name}`;
                this.tuningCache.set(key, {
                    value: row.value,
                    updated: row.updated_at,
                    scope: row.scope,
                    keyName: row.key_name
                });
            }
            
            this.lastCacheUpdate = Date.now();
            logger.debug(`Tuning cache refreshed: ${rows.length} values loaded`);
            
        } catch (error) {
            logger.error(`Failed to refresh tuning cache: ${error.message}`);
        }
    }

    /**
     * Get tuning value for a specific scope and key
     */
    async getTuning(scope, keyName, defaultValue = 0) {
        // Refresh cache if expired
        if (Date.now() - this.lastCacheUpdate > this.cacheTimeout) {
            await this.refreshCache();
        }
        
        const key = `${scope}:${keyName}`;
        const tuning = this.tuningCache.get(key);
        
        return tuning ? tuning.value : defaultValue;
    }

    /**
     * Get all tuning values for a scope
     */
    async getScopeTuning(scope) {
        await this.refreshCache();
        
        const scopeTuning = {};
        for (const [key, data] of this.tuningCache.entries()) {
            if (data.scope === scope) {
                scopeTuning[data.keyName] = data.value;
            }
        }
        
        return scopeTuning;
    }

    /**
     * GAME INTEGRATION HELPERS
     */

    /**
     * Apply payout multiplier tuning for a game
     * Returns adjusted payout based on AI recommendations
     */
    async getAdjustedPayout(gameName, basePayout, betAmount = 0) {
        try {
            // Get game-specific payout adjustment
            const payoutDelta = await this.getTuning(gameName, 'payoutMultDelta', 0);
            
            // Get global fee adjustment
            const feeDelta = await this.getTuning('global', 'feePctDelta', 0);
            
            // Apply payout adjustment (multiplicative)
            let adjustedPayout = basePayout * (1 + payoutDelta);
            
            // Apply fee adjustment (subtractive from winnings)
            if (feeDelta > 0 && adjustedPayout > betAmount) {
                const fee = (adjustedPayout - betAmount) * (feeDelta / 100);
                adjustedPayout -= fee;
            }
            
            // Ensure payout is never negative
            adjustedPayout = Math.max(0, adjustedPayout);
            
            logger.debug(`${gameName} payout: ${basePayout} -> ${adjustedPayout} (delta: ${payoutDelta}, fee: ${feeDelta})`);
            
            return {
                originalPayout: basePayout,
                adjustedPayout: Math.floor(adjustedPayout),
                payoutDelta: payoutDelta,
                feeApplied: feeDelta > 0 ? (adjustedPayout < basePayout) : false
            };
            
        } catch (error) {
            logger.error(`Failed to get adjusted payout for ${gameName}: ${error.message}`);
            return {
                originalPayout: basePayout,
                adjustedPayout: basePayout,
                payoutDelta: 0,
                feeApplied: false
            };
        }
    }

    /**
     * Apply win odds adjustment for games with probability mechanics
     */
    async getAdjustedWinOdds(gameName, baseWinChance) {
        try {
            const oddsDelta = await this.getTuning(gameName, 'winOddsDelta', 0);
            const adjustedOdds = Math.max(0.01, Math.min(0.99, baseWinChance + oddsDelta));
            
            logger.debug(`${gameName} win odds: ${baseWinChance} -> ${adjustedOdds} (delta: ${oddsDelta})`);
            
            return {
                originalOdds: baseWinChance,
                adjustedOdds: adjustedOdds,
                oddsDelta: oddsDelta
            };
            
        } catch (error) {
            logger.error(`Failed to get adjusted win odds for ${gameName}: ${error.message}`);
            return {
                originalOdds: baseWinChance,
                adjustedOdds: baseWinChance,
                oddsDelta: 0
            };
        }
    }

    /**
     * Get dynamic max bet limit (includes user-specific caps)
     */
    async getMaxBetLimit(userId, gameName, globalMaxBet = 10000) {
        try {
            // Get user-specific cap
            const userCap = await this.getTuning(`cap:${userId}`, 'maxBet', null);
            
            // Get global max bet adjustment
            const maxBetDelta = await this.getTuning('global', 'maxBetDeltaPct', 0);
            
            // Get game-specific max bet adjustment
            const gameMaxBetDelta = await this.getTuning(gameName, 'maxBetDeltaPct', 0);
            
            // Calculate adjusted global limit
            let adjustedLimit = globalMaxBet * (1 + maxBetDelta / 100) * (1 + gameMaxBetDelta / 100);
            
            // Apply user cap if it exists and is lower
            if (userCap && userCap < adjustedLimit) {
                adjustedLimit = userCap;
                logger.debug(`User ${userId} has betting cap: ${userCap}`);
            }
            
            return {
                maxBet: Math.floor(adjustedLimit),
                userCapped: userCap !== null,
                adjustmentApplied: maxBetDelta !== 0 || gameMaxBetDelta !== 0
            };
            
        } catch (error) {
            logger.error(`Failed to get max bet limit: ${error.message}`);
            return {
                maxBet: globalMaxBet,
                userCapped: false,
                adjustmentApplied: false
            };
        }
    }

    /**
     * Apply newbie boost adjustment
     */
    async getNewbieBoost(userId, baseBoost = 1.0) {
        try {
            const boostDelta = await this.getTuning('global', 'newbieBoostDeltaPct', 0);
            const adjustedBoost = Math.max(1.0, baseBoost * (1 + boostDelta / 100));
            
            return {
                originalBoost: baseBoost,
                adjustedBoost: adjustedBoost,
                boostDelta: boostDelta
            };
            
        } catch (error) {
            logger.error(`Failed to get newbie boost: ${error.message}`);
            return {
                originalBoost: baseBoost,
                adjustedBoost: baseBoost,
                boostDelta: 0
            };
        }
    }

    /**
     * ECONOMY MONITORING HELPERS
     */

    /**
     * Record a game result for the economy analyzer
     */
    async recordGameResult(userId, gameName, betAmount, payout, won) {
        try {
            // Insert into transactions table for tracking
            await this.db.execute(`
                INSERT INTO transactions (user_id, game, type, amount, ts)
                VALUES (?, ?, 'bet', ?, NOW()),
                       (?, ?, 'payout', ?, NOW())
            `, [
                userId, gameName, -betAmount,
                userId, gameName, won ? payout : 0
            ]);
            
            // Update daily game stats
            await this.db.execute(`
                INSERT INTO game_stats_daily (day, game, stakes, payouts, spins, unique_players)
                VALUES (CURDATE(), ?, ?, ?, 1, 1)
                ON DUPLICATE KEY UPDATE
                    stakes = stakes + VALUES(stakes),
                    payouts = payouts + VALUES(payouts),
                    spins = spins + 1,
                    unique_players = GREATEST(unique_players, (
                        SELECT COUNT(DISTINCT user_id) 
                        FROM transactions 
                        WHERE game = ? AND DATE(ts) = CURDATE()
                    ))
            `, [gameName, betAmount, won ? payout : 0, gameName]);
            
        } catch (error) {
            logger.error(`Failed to record game result: ${error.message}`);
        }
    }

    /**
     * Get current tuning summary for debugging
     */
    async getTuningSummary() {
        await this.refreshCache();
        
        const summary = {
            totalTunings: this.tuningCache.size,
            gameAdjustments: {},
            globalAdjustments: {},
            userCaps: 0,
            lastUpdate: this.lastCacheUpdate
        };
        
        for (const [key, data] of this.tuningCache.entries()) {
            if (data.scope === 'global') {
                summary.globalAdjustments[data.keyName] = data.value;
            } else if (data.scope.startsWith('cap:')) {
                summary.userCaps++;
            } else {
                if (!summary.gameAdjustments[data.scope]) {
                    summary.gameAdjustments[data.scope] = {};
                }
                summary.gameAdjustments[data.scope][data.keyName] = data.value;
            }
        }
        
        return summary;
    }

    /**
     * Force cache refresh (for testing/debugging)
     */
    async forceCacheRefresh() {
        await this.refreshCache();
        logger.info('Tuning cache force refreshed');
    }
}

// Export singleton instance
module.exports = new TuningManager();