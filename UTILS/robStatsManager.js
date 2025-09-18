/**
 * COMPREHENSIVE ROB STATS MANAGER
 * Advanced tracking and analytics for robbery activities
 * Monitors patterns, success rates, and anti-abuse mechanisms
 */

const dbManager = require('./database');
const logger = require('./logger');
const { fmt, getEconomicTier } = require('./common');

class RobStatsManager {
    constructor() {
        this.robCache = new Map(); // Recent rob activities
        this.suspiciousPatterns = new Map(); // Flagged users
        this.globalRobStats = {
            totalRobberies: 0,
            successfulRobberies: 0,
            totalStolenAmount: 0,
            totalPenalties: 0,
            averageSuccessRate: 0,
            lastReset: Date.now()
        };
        
        // Anti-abuse monitoring
        this.monitoring = {
            maxRobbersPerVictim: 5,      // Max 5 different robbers per victim per hour
            maxRobsPerUser: 3,           // Max 3 rob attempts per user per hour
            suspiciousSuccessRate: 0.8,  // 80%+ success rate flags user
            minimumCooldownEnforcement: true,
            coordinatedRobberyDetection: true
        };
        
        this.initializeStatsTracking();
    }

    /**
     * Initialize rob stats tracking system
     */
    async initializeStatsTracking() {
        logger.info('🔍 Initializing Rob Stats Manager...');
        
        try {
            // Create rob stats table if it doesn't exist
            await this.createRobStatsTable();
            
            // Load existing stats
            await this.loadGlobalStats();
            
            // Setup cleanup intervals
            this.setupCleanupIntervals();
            
            logger.info('✅ Rob Stats Manager initialized successfully');
        } catch (error) {
            logger.error(`Failed to initialize Rob Stats Manager: ${error.message}`);
        }
    }

    /**
     * Create dedicated rob stats table
     */
    async createRobStatsTable() {
        // Wait for database to be initialized if not ready yet
        if (!dbManager.initialized && dbManager.initialize) {
            try {
                await dbManager.initialize();
            } catch (error) {
                logger.warn('Database initialization failed during rob stats table creation');
                return;
            }
        }

        const dbAdapter = dbManager.databaseAdapter;
        if (!dbAdapter) {
            logger.warn('Database adapter not available for rob stats table creation');
            return;
        }

        try {
            // Create the table immediately to fix current runtime error
            await dbAdapter.pool.execute(`
                CREATE TABLE IF NOT EXISTS rob_stats (
                    id VARCHAR(100) PRIMARY KEY,
                    robber_id VARCHAR(20) NOT NULL,
                    victim_id VARCHAR(20) NOT NULL,
                    robber_name VARCHAR(255),
                    victim_name VARCHAR(255),
                    amount_stolen DECIMAL(20,2) DEFAULT 0.00,
                    penalty_paid DECIMAL(20,2) DEFAULT 0.00,
                    success BOOLEAN NOT NULL,
                    robber_tier VARCHAR(50),
                    victim_tier VARCHAR(50),
                    tier_difference INT DEFAULT 0,
                    robber_balance_before DECIMAL(20,2),
                    victim_balance_before DECIMAL(20,2),
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    guild_id VARCHAR(20),
                    
                    INDEX idx_robber_id (robber_id),
                    INDEX idx_victim_id (victim_id),
                    INDEX idx_timestamp (timestamp),
                    INDEX idx_success (success),
                    INDEX idx_guild (guild_id)
                ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            
            logger.info('✅ Rob stats table created/verified successfully');
        } catch (error) {
            if (error.message.includes('already exists')) {
                logger.debug('Rob stats table already exists');
            } else {
                logger.error(`Failed to create rob stats table: ${error.message}`);
                // Continue without crashing - the system should still work for basic rob functionality
            }
        }
    }

    /**
     * Record a robbery attempt with detailed tracking
     */
    async recordRobbery(robberData, victimData, success, amountStolen = 0, penalty = 0, guildId) {
        try {
            const robId = `${robberData.id}_${victimData.id}_${Date.now()}`;
            
            // Get tier information
            const robberTier = getEconomicTier(robberData.balance.wallet + robberData.balance.bank);
            const victimTier = getEconomicTier(victimData.balance.wallet + victimData.balance.bank);
            
            // Calculate tier difference
            const allTiers = require('./common').getAllTiers();
            const robberTierIndex = allTiers.findIndex(tier => tier.name === robberTier.name);
            const victimTierIndex = allTiers.findIndex(tier => tier.name === victimTier.name);
            const tierDifference = victimTierIndex - robberTierIndex;

            // Record in database
            const dbAdapter = dbManager.databaseAdapter;
            if (dbAdapter) {
                await dbAdapter.pool.execute(`
                    INSERT INTO rob_stats (
                        id, robber_id, victim_id, robber_name, victim_name,
                        amount_stolen, penalty_paid, success, robber_tier, victim_tier,
                        tier_difference, robber_balance_before, victim_balance_before,
                        guild_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    robId, robberData.id, victimData.id, robberData.name, victimData.name,
                    amountStolen, penalty, success, robberTier.name, victimTier.name,
                    tierDifference, robberData.balance.wallet + robberData.balance.bank,
                    victimData.balance.wallet + victimData.balance.bank, guildId
                ]);
            }

            // Update global stats
            this.updateGlobalStats(success, amountStolen, penalty);
            
            // Check for suspicious patterns
            await this.analyzeRobberyPatterns(robberData.id, victimData.id, success);
            
            // Update cache
            this.updateRobCache(robberData.id, victimData.id, success, amountStolen);
            
            logger.debug(`🔍 Recorded robbery: ${robberData.name} → ${victimData.name} (Success: ${success})`);
            
        } catch (error) {
            logger.error(`Failed to record robbery stats: ${error.message}`);
        }
    }

    /**
     * Get comprehensive rob stats for a user
     */
    async getUserRobStats(userId, guildId = null) {
        try {
            const dbAdapter = dbManager.databaseAdapter;
            if (!dbAdapter) return this.getEmptyUserStats();

            // Get robbery stats (as robber)
            const [robberStats] = await dbAdapter.pool.execute(`
                SELECT 
                    COUNT(*) as total_attempts,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_robberies,
                    SUM(amount_stolen) as total_stolen,
                    SUM(penalty_paid) as total_penalties,
                    AVG(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_rate,
                    MAX(amount_stolen) as biggest_heist,
                    MAX(penalty_paid) as biggest_penalty,
                    COUNT(DISTINCT victim_id) as unique_victims
                FROM rob_stats 
                WHERE robber_id = ? ${guildId ? 'AND guild_id = ?' : ''}
            `, guildId ? [userId, guildId] : [userId]);

            // Get victim stats (being robbed)
            const [victimStats] = await dbAdapter.pool.execute(`
                SELECT 
                    COUNT(*) as times_robbed,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as times_successfully_robbed,
                    SUM(amount_stolen) as total_lost_to_robberies,
                    AVG(CASE WHEN success = 1 THEN 1 ELSE 0 END) as victim_rate,
                    MAX(amount_stolen) as biggest_loss,
                    COUNT(DISTINCT robber_id) as unique_robbers
                FROM rob_stats 
                WHERE victim_id = ? ${guildId ? 'AND guild_id = ?' : ''}
            `, guildId ? [userId, guildId] : [userId]);

            // Get recent activity (last 24 hours)
            const [recentActivity] = await dbAdapter.pool.execute(`
                SELECT 
                    COUNT(*) as recent_attempts,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as recent_successes
                FROM rob_stats 
                WHERE robber_id = ? AND timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                ${guildId ? 'AND guild_id = ?' : ''}
            `, guildId ? [userId, guildId] : [userId]);

            return {
                asRobber: {
                    totalAttempts: parseInt(robberStats[0]?.total_attempts || 0),
                    successfulRobberies: parseInt(robberStats[0]?.successful_robberies || 0),
                    totalStolen: parseFloat(robberStats[0]?.total_stolen || 0),
                    totalPenalties: parseFloat(robberStats[0]?.total_penalties || 0),
                    successRate: parseFloat(robberStats[0]?.success_rate || 0),
                    biggestHeist: parseFloat(robberStats[0]?.biggest_heist || 0),
                    biggestPenalty: parseFloat(robberStats[0]?.biggest_penalty || 0),
                    uniqueVictims: parseInt(robberStats[0]?.unique_victims || 0)
                },
                asVictim: {
                    timesRobbed: parseInt(victimStats[0]?.times_robbed || 0),
                    timesSuccessfullyRobbed: parseInt(victimStats[0]?.times_successfully_robbed || 0),
                    totalLostToRobberies: parseFloat(victimStats[0]?.total_lost_to_robberies || 0),
                    victimRate: parseFloat(victimStats[0]?.victim_rate || 0),
                    biggestLoss: parseFloat(victimStats[0]?.biggest_loss || 0),
                    uniqueRobbers: parseInt(victimStats[0]?.unique_robbers || 0)
                },
                recentActivity: {
                    last24HourAttempts: parseInt(recentActivity[0]?.recent_attempts || 0),
                    last24HourSuccesses: parseInt(recentActivity[0]?.recent_successes || 0)
                },
                netProfitFromRobbery: parseFloat(robberStats[0]?.total_stolen || 0) - parseFloat(robberStats[0]?.total_penalties || 0) - parseFloat(victimStats[0]?.total_lost_to_robberies || 0)
            };

        } catch (error) {
            logger.error(`Failed to get user rob stats: ${error.message}`);
            return this.getEmptyUserStats();
        }
    }

    /**
     * Get global robbery statistics
     */
    async getGlobalRobStats(guildId = null) {
        try {
            const dbAdapter = dbManager.databaseAdapter;
            if (!dbAdapter) return this.globalRobStats;

            // Check if table exists before querying
            try {
                await dbAdapter.pool.execute('SELECT 1 FROM rob_stats LIMIT 1');
            } catch (tableError) {
                if (tableError.message.includes("doesn't exist")) {
                    logger.debug('Rob stats table does not exist yet, creating...');
                    await this.createRobStatsTable();
                    return this.globalRobStats; // Return empty stats for now
                }
                throw tableError;
            }

            const [globalStats] = await dbAdapter.pool.execute(`
                SELECT 
                    COUNT(*) as total_robberies,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_robberies,
                    SUM(amount_stolen) as total_stolen_amount,
                    SUM(penalty_paid) as total_penalties,
                    AVG(CASE WHEN success = 1 THEN 1 ELSE 0 END) as average_success_rate,
                    MAX(amount_stolen) as biggest_robbery,
                    COUNT(DISTINCT robber_id) as unique_robbers,
                    COUNT(DISTINCT victim_id) as unique_victims
                FROM rob_stats 
                ${guildId ? 'WHERE guild_id = ?' : ''}
            `, guildId ? [guildId] : []);

            // Get tier-based statistics
            const [tierStats] = await dbAdapter.pool.execute(`
                SELECT 
                    robber_tier,
                    victim_tier,
                    COUNT(*) as attempts,
                    AVG(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_rate,
                    AVG(amount_stolen) as avg_stolen,
                    AVG(tier_difference) as avg_tier_diff
                FROM rob_stats 
                ${guildId ? 'WHERE guild_id = ?' : ''}
                GROUP BY robber_tier, victim_tier
                HAVING attempts >= 5
                ORDER BY success_rate DESC
            `, guildId ? [guildId] : []);

            return {
                ...this.globalRobStats,
                totalRobberies: parseInt(globalStats[0]?.total_robberies || 0),
                successfulRobberies: parseInt(globalStats[0]?.successful_robberies || 0),
                totalStolenAmount: parseFloat(globalStats[0]?.total_stolen_amount || 0),
                totalPenalties: parseFloat(globalStats[0]?.total_penalties || 0),
                averageSuccessRate: parseFloat(globalStats[0]?.average_success_rate || 0),
                biggestRobbery: parseFloat(globalStats[0]?.biggest_robbery || 0),
                uniqueRobbers: parseInt(globalStats[0]?.unique_robbers || 0),
                uniqueVictims: parseInt(globalStats[0]?.unique_victims || 0),
                tierAnalysis: tierStats
            };

        } catch (error) {
            logger.error(`Failed to get global rob stats: ${error.message}`);
            return this.globalRobStats;
        }
    }

    /**
     * Analyze robbery patterns for suspicious activity
     */
    async analyzeRobberyPatterns(robberId, victimId, success) {
        try {
            // Check robber's recent success rate
            const robberKey = `robber_${robberId}`;
            if (!this.robCache.has(robberKey)) {
                this.robCache.set(robberKey, { attempts: [], successes: 0, lastCheck: Date.now() });
            }

            const robberData = this.robCache.get(robberKey);
            robberData.attempts.push({ timestamp: Date.now(), success });
            if (success) robberData.successes++;

            // Keep only last 20 attempts
            if (robberData.attempts.length > 20) {
                const removed = robberData.attempts.shift();
                if (removed.success) robberData.successes--;
            }

            // Check for suspicious success rate (80%+ over 10+ attempts)
            if (robberData.attempts.length >= 10) {
                const successRate = robberData.successes / robberData.attempts.length;
                if (successRate >= this.monitoring.suspiciousSuccessRate) {
                    await this.flagSuspiciousActivity(robberId, 'HIGH_SUCCESS_RATE', {
                        successRate: successRate,
                        attempts: robberData.attempts.length,
                        recentSuccesses: robberData.successes
                    });
                }
            }

            // Check for coordinated robbery patterns
            await this.checkCoordinatedRobbery(victimId);

        } catch (error) {
            logger.error(`Failed to analyze robbery patterns: ${error.message}`);
        }
    }

    /**
     * Flag suspicious robbery activity
     */
    async flagSuspiciousActivity(userId, reason, data) {
        const flag = {
            userId,
            reason,
            data,
            timestamp: Date.now(),
            severity: this.calculateSeverity(reason, data)
        };

        this.suspiciousPatterns.set(userId, flag);
        
        logger.warn(`🚨 SUSPICIOUS ROBBERY ACTIVITY: User ${userId} - ${reason}`, data);
        
        // Log to admin channel if severe
        if (flag.severity >= 8) {
            try {
                const { sendLogMessage } = require('./common');
                // This would need the client instance - implement when integrating
                logger.error(`CRITICAL: Potential robbery exploit detected for user ${userId}`);
            } catch (error) {
                logger.debug(`Could not send admin alert: ${error.message}`);
            }
        }
    }

    /**
     * Calculate severity score for suspicious activity
     */
    calculateSeverity(reason, data) {
        switch (reason) {
            case 'HIGH_SUCCESS_RATE':
                return Math.min(10, 3 + (data.successRate - 0.8) * 35);
            case 'COORDINATED_ROBBERY':
                return Math.min(10, 5 + data.uniqueRobbers * 0.5);
            case 'RAPID_ATTEMPTS':
                return Math.min(10, 4 + data.attemptsPerHour * 0.3);
            default:
                return 5;
        }
    }

    /**
     * Update global robbery statistics
     */
    updateGlobalStats(success, amountStolen, penalty) {
        this.globalRobStats.totalRobberies++;
        if (success) {
            this.globalRobStats.successfulRobberies++;
            this.globalRobStats.totalStolenAmount += amountStolen;
        } else {
            this.globalRobStats.totalPenalties += penalty;
        }
        
        this.globalRobStats.averageSuccessRate = 
            this.globalRobStats.successfulRobberies / this.globalRobStats.totalRobberies;
    }

    /**
     * Update robbery cache for pattern detection
     */
    updateRobCache(robberId, victimId, success, amount) {
        const timestamp = Date.now();
        
        // Update robber cache
        const robberKey = `robber_${robberId}`;
        if (!this.robCache.has(robberKey)) {
            this.robCache.set(robberKey, { attempts: [], successes: 0, lastAttempt: timestamp });
        }
        
        // Update victim cache
        const victimKey = `victim_${victimId}`;
        if (!this.robCache.has(victimKey)) {
            this.robCache.set(victimKey, { robberies: [], uniqueRobbers: new Set() });
        }
        
        const victimData = this.robCache.get(victimKey);
        victimData.robberies.push({ timestamp, robberId, success, amount });
        victimData.uniqueRobbers.add(robberId);
    }

    /**
     * Setup cleanup intervals
     */
    setupCleanupIntervals() {
        // Clean cache every hour
        setInterval(() => {
            const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
            
            for (const [key, data] of this.robCache.entries()) {
                if (data.lastCheck < cutoff || data.lastAttempt < cutoff) {
                    this.robCache.delete(key);
                }
            }
            
            logger.debug('🧹 Cleaned rob stats cache');
        }, 60 * 60 * 1000); // Every hour
    }

    /**
     * Get empty user stats structure
     */
    getEmptyUserStats() {
        return {
            asRobber: {
                totalAttempts: 0, successfulRobberies: 0, totalStolen: 0,
                totalPenalties: 0, successRate: 0, biggestHeist: 0,
                biggestPenalty: 0, uniqueVictims: 0
            },
            asVictim: {
                timesRobbed: 0, timesSuccessfullyRobbed: 0, totalLostToRobberies: 0,
                victimRate: 0, biggestLoss: 0, uniqueRobbers: 0
            },
            recentActivity: { last24HourAttempts: 0, last24HourSuccesses: 0 },
            netProfitFromRobbery: 0
        };
    }

    /**
     * Load global stats from database
     */
    async loadGlobalStats() {
        try {
            const stats = await this.getGlobalRobStats();
            Object.assign(this.globalRobStats, stats);
        } catch (error) {
            logger.debug(`Could not load global rob stats: ${error.message}`);
        }
    }

    /**
     * Check for coordinated robbery patterns
     */
    async checkCoordinatedRobbery(victimId) {
        const victimKey = `victim_${victimId}`;
        const victimData = this.robCache.get(victimKey);
        
        if (victimData && victimData.uniqueRobbers.size >= this.monitoring.maxRobbersPerVictim) {
            const recentRobberies = victimData.robberies.filter(
                r => Date.now() - r.timestamp < 60 * 60 * 1000 // Last hour
            );
            
            if (recentRobberies.length >= this.monitoring.maxRobbersPerVictim) {
                await this.flagSuspiciousActivity(victimId, 'COORDINATED_ROBBERY', {
                    uniqueRobbers: victimData.uniqueRobbers.size,
                    recentAttempts: recentRobberies.length,
                    timeWindow: '1 hour'
                });
            }
        }
    }
}

// Export singleton instance
module.exports = new RobStatsManager();