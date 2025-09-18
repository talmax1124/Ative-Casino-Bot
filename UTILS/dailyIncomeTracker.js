/**
 * Daily Income Tracker and Limiter
 * Prevents excessive wealth accumulation from non-gambling income sources
 * Tracks and limits total daily income from all commands combined
 */

const dbManager = require('./database');
const logger = require('./logger');
const { fmt } = require('./common');

class DailyIncomeTracker {
    constructor() {
        // Daily income limits based on user wealth
        this.dailyIncomeLimits = [
            { minWealth: 0,           maxWealth: 1_000_000,      dailyLimit: 150_000 },    // Under 1M: 150K/day
            { minWealth: 1_000_000,   maxWealth: 10_000_000,     dailyLimit: 200_000 },    // 1M-10M: 200K/day  
            { minWealth: 10_000_000,  maxWealth: 50_000_000,     dailyLimit: 300_000 },    // 10M-50M: 300K/day
            { minWealth: 50_000_000,  maxWealth: 250_000_000,    dailyLimit: 400_000 },    // 50M-250M: 400K/day
            { minWealth: 250_000_000, maxWealth: 1_000_000_000,  dailyLimit: 500_000 },    // 250M-1B: 500K/day
            { minWealth: 1_000_000_000, maxWealth: 5_000_000_000, dailyLimit: 600_000 },    // 1B-5B: 600K/day
            { minWealth: 5_000_000_000, maxWealth: Infinity,      dailyLimit: 750_000 },    // 5B+: 750K/day (reduced as wealth grows)
        ];
        
        // Command-specific limits to prevent single command abuse
        this.commandLimits = {
            'vote': { dailyLimit: 100_000, cooldown: 12 * 60 * 60 * 1000 },      // 100K/day max from voting
            'dailytask': { dailyLimit: 25_000, cooldown: 24 * 60 * 60 * 1000 },  // 25K/day max from daily tasks
            'earn': { dailyLimit: 50_000, cooldown: 24 * 60 * 60 * 1000 },       // 50K/day max from earn
            'beg': { dailyLimit: 40_000, cooldown: 2 * 60 * 60 * 1000 },         // 40K/day max from begging
            'crime': { dailyLimit: 60_000, cooldown: 2 * 60 * 60 * 1000 },       // 60K/day max from crime
            'work': { dailyLimit: 50_000, cooldown: 2 * 60 * 60 * 1000 },        // 50K/day max from work
            'earnmoney': { dailyLimit: 200_000, cooldown: 24 * 60 * 60 * 1000 }, // 200K/day max from earnmoney
        };
        
        // Track daily income per user (in memory for now)
        this.dailyIncomeCache = new Map();
    }
    
    /**
     * Get daily income limit for a user based on their wealth
     */
    async getDailyIncomeLimit(userId, guildId) {
        try {
            const balance = await dbManager.getUserBalance(userId, guildId);
            const totalWealth = balance.wallet + balance.bank;
            
            const tier = this.dailyIncomeLimits.find(limit => 
                totalWealth >= limit.minWealth && totalWealth < limit.maxWealth
            );
            
            return tier ? tier.dailyLimit : this.dailyIncomeLimits[0].dailyLimit;
            
        } catch (error) {
            logger.error(`Error getting daily income limit: ${error.message}`);
            return this.dailyIncomeLimits[0].dailyLimit; // Fallback to lowest limit
        }
    }
    
    /**
     * Check if user can earn income from a specific command
     */
    async canEarnIncome(userId, guildId, commandName, amount) {
        try {
            const now = Date.now();
            const today = new Date(now).toDateString();
            
            // Get user's daily income limit
            const dailyLimit = await this.getDailyIncomeLimit(userId, guildId);
            
            // Get current daily income for user
            const userKey = `${userId}-${guildId}`;
            let dailyData = this.dailyIncomeCache.get(userKey);
            
            if (!dailyData || dailyData.date !== today) {
                // Reset daily data
                dailyData = {
                    date: today,
                    totalIncome: 0,
                    commandIncome: {},
                    commandCounts: {}
                };
                this.dailyIncomeCache.set(userKey, dailyData);
            }
            
            // Check total daily limit
            if (dailyData.totalIncome + amount > dailyLimit) {
                return {
                    allowed: false,
                    reason: 'DAILY_LIMIT_EXCEEDED',
                    message: `Daily income limit reached: ${fmt(dailyData.totalIncome)}/${fmt(dailyLimit)}`,
                    remaining: Math.max(0, dailyLimit - dailyData.totalIncome),
                    resetTime: this.getNextResetTime()
                };
            }
            
            // Check command-specific limits
            const commandLimit = this.commandLimits[commandName];
            if (commandLimit) {
                const commandIncome = dailyData.commandIncome[commandName] || 0;
                
                if (commandIncome + amount > commandLimit.dailyLimit) {
                    return {
                        allowed: false,
                        reason: 'COMMAND_LIMIT_EXCEEDED',
                        message: `Daily ${commandName} limit reached: ${fmt(commandIncome)}/${fmt(commandLimit.dailyLimit)}`,
                        remaining: Math.max(0, commandLimit.dailyLimit - commandIncome),
                        resetTime: this.getNextResetTime()
                    };
                }
            }
            
            return {
                allowed: true,
                remaining: dailyLimit - dailyData.totalIncome - amount,
                resetTime: this.getNextResetTime()
            };
            
        } catch (error) {
            logger.error(`Error checking income permission: ${error.message}`);
            return {
                allowed: false,
                reason: 'ERROR',
                message: 'Unable to verify income limits'
            };
        }
    }
    
    /**
     * Record income from a command
     */
    async recordIncome(userId, guildId, commandName, amount) {
        try {
            const now = Date.now();
            const today = new Date(now).toDateString();
            const userKey = `${userId}-${guildId}`;
            
            let dailyData = this.dailyIncomeCache.get(userKey);
            
            if (!dailyData || dailyData.date !== today) {
                dailyData = {
                    date: today,
                    totalIncome: 0,
                    commandIncome: {},
                    commandCounts: {}
                };
            }
            
            // Update totals
            dailyData.totalIncome += amount;
            dailyData.commandIncome[commandName] = (dailyData.commandIncome[commandName] || 0) + amount;
            dailyData.commandCounts[commandName] = (dailyData.commandCounts[commandName] || 0) + 1;
            
            this.dailyIncomeCache.set(userKey, dailyData);
            
            // Log significant income
            if (amount >= 25000) {
                logger.info(`Daily income recorded: ${userId} earned ${fmt(amount)} from ${commandName} (total today: ${fmt(dailyData.totalIncome)})`);
            }
            
            return dailyData;
            
        } catch (error) {
            logger.error(`Error recording income: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Get current daily income stats for a user
     */
    async getDailyIncomeStats(userId, guildId) {
        try {
            const today = new Date().toDateString();
            const userKey = `${userId}-${guildId}`;
            const dailyData = this.dailyIncomeCache.get(userKey);
            
            if (!dailyData || dailyData.date !== today) {
                return {
                    totalIncome: 0,
                    commandIncome: {},
                    commandCounts: {},
                    dailyLimit: await this.getDailyIncomeLimit(userId, guildId),
                    resetTime: this.getNextResetTime()
                };
            }
            
            return {
                ...dailyData,
                dailyLimit: await this.getDailyIncomeLimit(userId, guildId),
                resetTime: this.getNextResetTime()
            };
            
        } catch (error) {
            logger.error(`Error getting daily income stats: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Check for suspicious income patterns
     */
    async checkSuspiciousPattern(userId, guildId) {
        try {
            const stats = await this.getDailyIncomeStats(userId, guildId);
            if (!stats) return { suspicious: false };
            
            const balance = await dbManager.getUserBalance(userId, guildId);
            const totalWealth = balance.wallet + balance.bank;
            
            // Define suspicious patterns
            const suspiciousPatterns = [];
            
            // Pattern 1: Income close to or exceeding daily limit
            if (stats.totalIncome >= stats.dailyLimit * 0.9) {
                suspiciousPatterns.push(`Near daily limit: ${fmt(stats.totalIncome)}/${fmt(stats.dailyLimit)}`);
            }
            
            // Pattern 2: High concentration from single command
            for (const [command, amount] of Object.entries(stats.commandIncome)) {
                if (amount >= stats.totalIncome * 0.8) {
                    suspiciousPatterns.push(`High concentration in ${command}: ${fmt(amount)}`);
                }
            }
            
            // Pattern 3: Income-to-wealth ratio is high (farming behavior)
            const incomeRatio = stats.totalIncome / Math.max(totalWealth, 1000);
            if (incomeRatio > 0.1) { // Income is >10% of current wealth
                suspiciousPatterns.push(`High income-to-wealth ratio: ${(incomeRatio * 100).toFixed(1)}%`);
            }
            
            return {
                suspicious: suspiciousPatterns.length > 0,
                patterns: suspiciousPatterns,
                stats
            };
            
        } catch (error) {
            logger.error(`Error checking suspicious patterns: ${error.message}`);
            return { suspicious: false };
        }
    }
    
    /**
     * Get time until daily limits reset
     */
    getNextResetTime() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow.getTime();
    }
    
    /**
     * Clean up old cache entries (call periodically)
     */
    cleanupCache() {
        const today = new Date().toDateString();
        
        for (const [key, data] of this.dailyIncomeCache) {
            if (data.date !== today) {
                this.dailyIncomeCache.delete(key);
            }
        }
        
        logger.debug(`Daily income cache cleaned up: ${this.dailyIncomeCache.size} active entries`);
    }
    
    /**
     * Get comprehensive income analysis
     */
    async getIncomeAnalysis() {
        try {
            const today = new Date().toDateString();
            const analysis = {
                totalUsers: 0,
                totalIncomeToday: 0,
                averageIncome: 0,
                topEarners: [],
                commandBreakdown: {},
                suspiciousUsers: []
            };
            
            for (const [userKey, data] of this.dailyIncomeCache) {
                if (data.date === today) {
                    analysis.totalUsers++;
                    analysis.totalIncomeToday += data.totalIncome;
                    
                    // Track command breakdown
                    for (const [command, amount] of Object.entries(data.commandIncome)) {
                        analysis.commandBreakdown[command] = (analysis.commandBreakdown[command] || 0) + amount;
                    }
                    
                    // Check for suspicious patterns
                    const [userId, guildId] = userKey.split('-');
                    const suspiciousCheck = await this.checkSuspiciousPattern(userId, guildId);
                    if (suspiciousCheck.suspicious) {
                        analysis.suspiciousUsers.push({
                            userId,
                            patterns: suspiciousCheck.patterns,
                            totalIncome: data.totalIncome
                        });
                    }
                }
            }
            
            analysis.averageIncome = analysis.totalUsers > 0 ? analysis.totalIncomeToday / analysis.totalUsers : 0;
            
            return analysis;
            
        } catch (error) {
            logger.error(`Error getting income analysis: ${error.message}`);
            return null;
        }
    }
}

// Export singleton instance
module.exports = new DailyIncomeTracker();