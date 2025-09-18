/**
 * Wealth-Based Bet Limiting System
 * Prevents overnight billionaires by implementing progressive bet caps
 * based on user's total wealth and recent activity patterns
 */

const dbManager = require('./database');
const logger = require('./logger');
const { fmt } = require('./common');

class WealthBasedBetLimits {
    constructor() {
        // Progressive bet caps based on total wealth (wallet + bank)
        this.wealthTiers = [
            { minWealth: 0,           maxWealth: 1_000_000,      maxBetPercent: 0.10,  maxBetAbsolute: 50_000 },      // Under 1M: 10% or 50K max
            { minWealth: 1_000_000,   maxWealth: 10_000_000,     maxBetPercent: 0.08,  maxBetAbsolute: 200_000 },     // 1M-10M: 8% or 200K max  
            { minWealth: 10_000_000,  maxWealth: 50_000_000,     maxBetPercent: 0.06,  maxBetAbsolute: 500_000 },     // 10M-50M: 6% or 500K max
            { minWealth: 50_000_000,  maxWealth: 250_000_000,    maxBetPercent: 0.05,  maxBetAbsolute: 2_000_000 },   // 50M-250M: 5% or 2M max
            { minWealth: 250_000_000, maxWealth: 1_000_000_000,  maxBetPercent: 0.04,  maxBetAbsolute: 5_000_000 },   // 250M-1B: 4% or 5M max
            { minWealth: 1_000_000_000, maxWealth: 5_000_000_000, maxBetPercent: 0.03,  maxBetAbsolute: 10_000_000 },  // 1B-5B: 3% or 10M max
            { minWealth: 5_000_000_000, maxWealth: Infinity,      maxBetPercent: 0.02,  maxBetAbsolute: 15_000_000 },  // 5B+: 2% or 15M max
        ];
        
        // Time-based betting limits (prevent rapid wealth accumulation)
        this.timeLimits = {
            hourlyMaxPercent: 0.25,    // Can't bet more than 25% of wealth per hour
            dailyMaxPercent: 0.50,     // Can't bet more than 50% of wealth per day
            weeklyMaxPercent: 1.00,    // Can't bet more than 100% of wealth per week
        };
        
        // Game-specific multipliers for different risk levels
        this.gameMultipliers = {
            'slots': 1.0,           // Standard limits
            'ceelo': 0.8,           // 20% reduction (high variance)
            'crash': 0.7,           // 30% reduction (very high variance)  
            'plinko': 0.6,          // 40% reduction (extreme variance)
            'treasurevault': 0.9,   // 10% reduction (multiple rounds)
            'blackjack': 1.1,       // 10% increase (skill-based)
            'roulette': 1.0,        // Standard limits
            'lottery': 2.0,         // Higher limits (external draw)
            'scratch': 1.2,         // Slightly higher (fixed odds)
        };
        
        // Rapid wealth growth detection
        this.rapidGrowthThresholds = {
            hourly: 0.50,    // 50% wealth growth in 1 hour triggers restrictions
            daily: 2.00,     // 200% wealth growth in 1 day triggers restrictions  
            weekly: 5.00,    // 500% wealth growth in 1 week triggers restrictions
        };
    }

    /**
     * Calculate maximum bet allowed for a user
     */
    async calculateMaxBet(userId, guildId, gameType) {
        try {
            // Get user's current wealth
            const balance = await dbManager.getUserBalance(userId, guildId);
            const totalWealth = balance.wallet + balance.bank;
            
            // Find applicable wealth tier
            const wealthTier = this.wealthTiers.find(tier => 
                totalWealth >= tier.minWealth && totalWealth < tier.maxWealth
            );
            
            if (!wealthTier) {
                logger.error(`No wealth tier found for ${totalWealth}`);
                return 1000; // Fallback to 1K
            }
            
            // Calculate base max bet
            const percentBasedMax = totalWealth * wealthTier.maxBetPercent;
            const baseMaxBet = Math.min(percentBasedMax, wealthTier.maxBetAbsolute);
            
            // Apply game-specific multiplier
            const gameMultiplier = this.gameMultipliers[gameType] || 1.0;
            let maxBet = Math.floor(baseMaxBet * gameMultiplier);
            
            // Apply time-based limits
            const timeLimitedBet = await this.applyTimeLimits(userId, guildId, maxBet, totalWealth);
            maxBet = Math.min(maxBet, timeLimitedBet);
            
            // Apply rapid growth restrictions
            const growthLimitedBet = await this.applyRapidGrowthLimits(userId, guildId, maxBet, totalWealth);
            maxBet = Math.min(maxBet, growthLimitedBet);
            
            // Minimum bet protection
            maxBet = Math.max(maxBet, 100); // Never go below $100
            
            logger.debug(`Max bet calculated for ${userId}: ${fmt(maxBet)} (wealth: ${fmt(totalWealth)}, game: ${gameType})`);
            
            return maxBet;
            
        } catch (error) {
            logger.error(`Error calculating max bet for ${userId}: ${error.message}`);
            return 1000; // Safe fallback
        }
    }
    
    /**
     * Apply time-based betting limits
     */
    async applyTimeLimits(userId, guildId, currentMaxBet, totalWealth) {
        try {
            const now = Date.now();
            const oneHour = 60 * 60 * 1000;
            const oneDay = 24 * oneHour;
            const oneWeek = 7 * oneDay;
            
            // Get recent betting activity
            const recentBets = await this.getRecentBettingActivity(userId, guildId, oneWeek);
            
            // Calculate betting amounts in different time periods
            const hourlyBets = recentBets
                .filter(bet => now - bet.timestamp < oneHour)
                .reduce((sum, bet) => sum + bet.amount, 0);
                
            const dailyBets = recentBets
                .filter(bet => now - bet.timestamp < oneDay)
                .reduce((sum, bet) => sum + bet.amount, 0);
                
            const weeklyBets = recentBets
                .filter(bet => now - bet.timestamp < oneWeek)
                .reduce((sum, bet) => sum + bet.amount, 0);
            
            // Calculate remaining allowances
            const hourlyAllowance = (totalWealth * this.timeLimits.hourlyMaxPercent) - hourlyBets;
            const dailyAllowance = (totalWealth * this.timeLimits.dailyMaxPercent) - dailyBets;
            const weeklyAllowance = (totalWealth * this.timeLimits.weeklyMaxPercent) - weeklyBets;
            
            // Return the most restrictive limit
            const timeLimitedMax = Math.min(hourlyAllowance, dailyAllowance, weeklyAllowance);
            
            if (timeLimitedMax < currentMaxBet) {
                logger.info(`Time-based bet limit applied for ${userId}: ${fmt(timeLimitedMax)} vs ${fmt(currentMaxBet)}`);
            }
            
            return Math.max(timeLimitedMax, 0);
            
        } catch (error) {
            logger.error(`Error applying time limits: ${error.message}`);
            return currentMaxBet; // Fallback to original limit
        }
    }
    
    /**
     * Apply rapid wealth growth restrictions
     */
    async applyRapidGrowthLimits(userId, guildId, currentMaxBet, currentWealth) {
        try {
            const now = Date.now();
            const oneHour = 60 * 60 * 1000;
            const oneDay = 24 * oneHour;
            const oneWeek = 7 * oneDay;
            
            // Get historical wealth data
            const wealthHistory = await this.getWealthHistory(userId, guildId, oneWeek);
            
            if (wealthHistory.length === 0) return currentMaxBet;
            
            // Calculate growth rates
            const hourAgoWealth = this.getWealthAtTime(wealthHistory, now - oneHour);
            const dayAgoWealth = this.getWealthAtTime(wealthHistory, now - oneDay);
            const weekAgoWealth = this.getWealthAtTime(wealthHistory, now - oneWeek);
            
            const hourlyGrowthRate = hourAgoWealth > 0 ? (currentWealth / hourAgoWealth) - 1 : 0;
            const dailyGrowthRate = dayAgoWealth > 0 ? (currentWealth / dayAgoWealth) - 1 : 0;
            const weeklyGrowthRate = weekAgoWealth > 0 ? (currentWealth / weekAgoWealth) - 1 : 0;
            
            // Check if any growth rate exceeds thresholds
            let restrictionMultiplier = 1.0;
            
            if (hourlyGrowthRate > this.rapidGrowthThresholds.hourly) {
                restrictionMultiplier *= 0.3; // 70% reduction
                logger.warn(`Rapid hourly growth detected for ${userId}: ${(hourlyGrowthRate * 100).toFixed(1)}%`);
            }
            
            if (dailyGrowthRate > this.rapidGrowthThresholds.daily) {
                restrictionMultiplier *= 0.5; // 50% reduction
                logger.warn(`Rapid daily growth detected for ${userId}: ${(dailyGrowthRate * 100).toFixed(1)}%`);
            }
            
            if (weeklyGrowthRate > this.rapidGrowthThresholds.weekly) {
                restrictionMultiplier *= 0.7; // 30% reduction
                logger.warn(`Rapid weekly growth detected for ${userId}: ${(weeklyGrowthRate * 100).toFixed(1)}%`);
            }
            
            const restrictedMaxBet = Math.floor(currentMaxBet * restrictionMultiplier);
            
            if (restrictedMaxBet < currentMaxBet) {
                logger.info(`Rapid growth restrictions applied for ${userId}: ${fmt(restrictedMaxBet)} vs ${fmt(currentMaxBet)}`);
            }
            
            return restrictedMaxBet;
            
        } catch (error) {
            logger.error(`Error applying rapid growth limits: ${error.message}`);
            return currentMaxBet; // Fallback to original limit
        }
    }
    
    /**
     * Validate if a bet amount is allowed
     */
    async validateBetAmount(userId, guildId, betAmount, gameType) {
        try {
            const maxAllowed = await this.calculateMaxBet(userId, guildId, gameType);
            
            if (betAmount > maxAllowed) {
                return {
                    isValid: false,
                    maxAllowed,
                    reason: 'BET_LIMIT_EXCEEDED',
                    message: `Maximum bet allowed: ${fmt(maxAllowed)} (you tried to bet ${fmt(betAmount)})`
                };
            }
            
            return {
                isValid: true,
                maxAllowed,
                reason: null,
                message: null
            };
            
        } catch (error) {
            logger.error(`Error validating bet amount: ${error.message}`);
            return {
                isValid: false,
                maxAllowed: 1000,
                reason: 'VALIDATION_ERROR',
                message: 'Error validating bet amount'
            };
        }
    }
    
    /**
     * Get recent betting activity for time-based limits
     */
    async getRecentBettingActivity(userId, guildId, timeRange) {
        try {
            // This would need to be implemented based on your database schema
            // For now, return empty array as placeholder
            return [];
        } catch (error) {
            logger.error(`Error getting recent betting activity: ${error.message}`);
            return [];
        }
    }
    
    /**
     * Get historical wealth data
     */
    async getWealthHistory(userId, guildId, timeRange) {
        try {
            // This would need to be implemented based on your database schema
            // For now, return empty array as placeholder
            return [];
        } catch (error) {
            logger.error(`Error getting wealth history: ${error.message}`);
            return [];
        }
    }
    
    /**
     * Get wealth at a specific time from history
     */
    getWealthAtTime(wealthHistory, targetTime) {
        // Find the closest wealth record to the target time
        let closest = null;
        let closestDiff = Infinity;
        
        for (const record of wealthHistory) {
            const diff = Math.abs(record.timestamp - targetTime);
            if (diff < closestDiff) {
                closest = record;
                closestDiff = diff;
            }
        }
        
        return closest ? closest.totalWealth : 0;
    }
    
    /**
     * Record a bet for tracking purposes
     */
    async recordBet(userId, guildId, gameType, betAmount) {
        try {
            // This would record the bet in the database for time-based limiting
            logger.debug(`Bet recorded: ${userId} bet ${fmt(betAmount)} on ${gameType}`);
        } catch (error) {
            logger.error(`Error recording bet: ${error.message}`);
        }
    }
    
    /**
     * Get betting statistics for a user
     */
    async getBettingStats(userId, guildId) {
        try {
            const maxBets = {};
            
            // Calculate max bets for all game types
            for (const gameType of Object.keys(this.gameMultipliers)) {
                maxBets[gameType] = await this.calculateMaxBet(userId, guildId, gameType);
            }
            
            const balance = await dbManager.getUserBalance(userId, guildId);
            const totalWealth = balance.wallet + balance.bank;
            
            const tier = this.wealthTiers.find(t => 
                totalWealth >= t.minWealth && totalWealth < t.maxWealth
            );
            
            return {
                totalWealth,
                wealthTier: tier,
                maxBets,
                timeLimits: this.timeLimits,
                gameMultipliers: this.gameMultipliers
            };
            
        } catch (error) {
            logger.error(`Error getting betting stats: ${error.message}`);
            return null;
        }
    }
}

// Export singleton instance
module.exports = new WealthBasedBetLimits();