/**
 * MARKET CAP MANAGER
 * Manages the $1 trillion monthly market cap with dynamic game adjustments
 * Controls economy stability and prevents excessive inflation
 */

const dbManager = require('./database');
const logger = require('./logger');
const securityLogger = require('./securityLogger');
const economyChannelLogger = require('./economyChannelLogger');

class MarketCapManager {
    constructor() {
        this.MONTHLY_MARKET_CAP = 2000000000000; // $2 trillion
        this.DAILY_MARKET_CAP = this.MONTHLY_MARKET_CAP / 30; // ~$33.3 billion daily
        this.HOURLY_MARKET_CAP = this.DAILY_MARKET_CAP / 24; // ~$1.4 billion hourly
        
        // Economic adjustment thresholds
        this.ADJUSTMENT_THRESHOLDS = {
            LOW: 0.1,      // Below 10% of cap - increase payouts
            MEDIUM: 0.6,   // 10-60% of cap - normal operation
            HIGH: 0.85,    // 60-85% of cap - reduce payouts
            CRITICAL: 0.95 // Above 95% of cap - emergency restrictions
        };
        
        // Current market state
        this.currentState = {
            monthlyVolume: 0,
            dailyVolume: 0,
            hourlyVolume: 0,
            adjustmentLevel: 'MEDIUM',
            lastReset: new Date(),
            economicMultiplier: 1.0
        };
        
        // Initialize tracking
        this.initializeTracking();
    }
    
    async initializeTracking() {
        try {
            // Load current market state from database or initialize
            await this.loadMarketState();
            
            // Set up periodic resets
            this.setupPeriodicResets();
            
            logger.info('Market Cap Manager initialized', {
                monthlyCapTrillion: this.MONTHLY_MARKET_CAP / 1000000000000,
                dailyCapBillion: this.DAILY_MARKET_CAP / 1000000000,
                currentState: this.currentState
            });
        } catch (error) {
            logger.error(`Failed to initialize Market Cap Manager: ${error.message}`);
        }
    }
    
    async loadMarketState() {
        try {
            // Check if we need to reset monthly/daily counters
            const now = new Date();
            const lastReset = new Date(this.currentState.lastReset);
            
            // Reset monthly counter if new month
            if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
                await this.resetMonthlyCounter();
            }
            
            // Reset daily counter if new day
            if (now.getDate() !== lastReset.getDate()) {
                await this.resetDailyCounter();
            }
            
            // Reset hourly counter if new hour
            if (now.getHours() !== lastReset.getHours()) {
                await this.resetHourlyCounter();
            }
            
        } catch (error) {
            logger.error(`Failed to load market state: ${error.message}`);
            // Initialize with defaults if loading fails
            this.currentState = {
                monthlyVolume: 0,
                dailyVolume: 0,
                hourlyVolume: 0,
                adjustmentLevel: 'MEDIUM',
                lastReset: new Date(),
                economicMultiplier: 1.0
            };
        }
    }
    
    setupPeriodicResets() {
        // Reset hourly counter every hour
        setInterval(() => {
            this.resetHourlyCounter();
        }, 60 * 60 * 1000); // 1 hour
        
        // Reset daily counter every day
        setInterval(() => {
            this.resetDailyCounter();
        }, 24 * 60 * 60 * 1000); // 24 hours
        
        // Check monthly reset daily
        setInterval(() => {
            const now = new Date();
            const lastReset = new Date(this.currentState.lastReset);
            if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
                this.resetMonthlyCounter();
            }
        }, 24 * 60 * 60 * 1000); // Check daily
    }
    
    async resetMonthlyCounter() {
        logger.info('Resetting monthly market counter');
        this.currentState.monthlyVolume = 0;
        this.currentState.lastReset = new Date();
        await this.saveMarketState();
        
        // Log monthly reset for audit
        securityLogger.logSecurityEvent('SYSTEM', 'MONTHLY_RESET', {
            timestamp: new Date().toISOString(),
            previousAdjustmentLevel: this.currentState.adjustmentLevel
        });
    }
    
    async resetDailyCounter() {
        logger.info('Resetting daily market counter');
        this.currentState.dailyVolume = 0;
        await this.saveMarketState();
    }
    
    async resetHourlyCounter() {
        logger.info('Resetting hourly market counter');
        this.currentState.hourlyVolume = 0;
        await this.saveMarketState();
    }
    
    async recordTransaction(amount, gameType, userId) {
        try {
            // Validate amount
            if (!Number.isFinite(amount) || amount <= 0) {
                throw new Error(`Invalid transaction amount: ${amount}`);
            }
            
            // Update volume counters
            this.currentState.monthlyVolume += amount;
            this.currentState.dailyVolume += amount;
            this.currentState.hourlyVolume += amount;
            
            // Recalculate adjustment level
            await this.calculateAdjustmentLevel();
            
            // Log significant transactions
            if (amount > 100000) { // $100K+
                securityLogger.logSecurityEvent(userId, 'LARGE_TRANSACTION', {
                    amount: amount,
                    gameType: gameType,
                    monthlyVolume: this.currentState.monthlyVolume,
                    adjustmentLevel: this.currentState.adjustmentLevel
                });
            }
            
            await this.saveMarketState();
            
        } catch (error) {
            logger.error(`Failed to record transaction: ${error.message}`);
            throw error;
        }
    }
    
    async calculateAdjustmentLevel() {
        // Calculate percentage of monthly cap used (primary metric)
        const monthlyPercentage = this.currentState.monthlyVolume / this.MONTHLY_MARKET_CAP;
        
        // For testing, focus primarily on monthly percentage
        // In production, you might want to consider daily/hourly limits too
        const maxPercentage = monthlyPercentage;
        
        let newAdjustmentLevel;
        let newMultiplier;
        
        if (maxPercentage >= this.ADJUSTMENT_THRESHOLDS.CRITICAL) {
            newAdjustmentLevel = 'CRITICAL';
            newMultiplier = 0.1; // Severely restrict payouts
        } else if (maxPercentage >= this.ADJUSTMENT_THRESHOLDS.HIGH) {
            newAdjustmentLevel = 'HIGH';
            newMultiplier = 0.5; // Significantly reduce payouts
        } else if (maxPercentage >= this.ADJUSTMENT_THRESHOLDS.LOW) {
            newAdjustmentLevel = 'MEDIUM';
            newMultiplier = 1.0; // Normal operation
        } else {
            newAdjustmentLevel = 'LOW';
            newMultiplier = 1.5; // Encourage more play with higher payouts
        }
        
        // Log adjustment level changes
        if (newAdjustmentLevel !== this.currentState.adjustmentLevel) {
            logger.warn(`Market adjustment level changed: ${this.currentState.adjustmentLevel} -> ${newAdjustmentLevel}`, {
                monthlyPercentage: (monthlyPercentage * 100).toFixed(2) + '%',
                newMultiplier: newMultiplier
            });
            
            securityLogger.logSecurityEvent('SYSTEM', 'ADJUSTMENT_LEVEL_CHANGE', {
                oldLevel: this.currentState.adjustmentLevel,
                newLevel: newAdjustmentLevel,
                oldMultiplier: this.currentState.economicMultiplier,
                newMultiplier: newMultiplier,
                monthlyUsage: monthlyPercentage
            });
            
            // Log to Discord channel
            economyChannelLogger.logMarketChange(
                this.currentState.adjustmentLevel,
                newAdjustmentLevel,
                (monthlyPercentage * 100).toFixed(2),
                newMultiplier,
                this.currentState.monthlyVolume
            );
        }
        
        this.currentState.adjustmentLevel = newAdjustmentLevel;
        this.currentState.economicMultiplier = newMultiplier;
    }
    
    getEconomicMultiplier() {
        return this.currentState.economicMultiplier;
    }
    
    getAdjustmentLevel() {
        return this.currentState.adjustmentLevel;
    }
    
    getMarketStatus() {
        const monthlyPercentage = (this.currentState.monthlyVolume / this.MONTHLY_MARKET_CAP) * 100;
        const dailyPercentage = (this.currentState.dailyVolume / this.DAILY_MARKET_CAP) * 100;
        const hourlyPercentage = (this.currentState.hourlyVolume / this.HOURLY_MARKET_CAP) * 100;
        
        return {
            monthlyVolume: this.currentState.monthlyVolume,
            dailyVolume: this.currentState.dailyVolume,
            hourlyVolume: this.currentState.hourlyVolume,
            monthlyPercentage: monthlyPercentage,
            dailyPercentage: dailyPercentage,
            hourlyPercentage: hourlyPercentage,
            adjustmentLevel: this.currentState.adjustmentLevel,
            economicMultiplier: this.currentState.economicMultiplier,
            monthlyCapRemaining: this.MONTHLY_MARKET_CAP - this.currentState.monthlyVolume,
            dailyCapRemaining: this.DAILY_MARKET_CAP - this.currentState.dailyVolume,
            hourlyCapRemaining: this.HOURLY_MARKET_CAP - this.currentState.hourlyVolume
        };
    }
    
    async canProcessTransaction(amount) {
        // Check if transaction would exceed caps
        const newMonthlyVolume = this.currentState.monthlyVolume + amount;
        const newDailyVolume = this.currentState.dailyVolume + amount;
        const newHourlyVolume = this.currentState.hourlyVolume + amount;
        
        if (newMonthlyVolume > this.MONTHLY_MARKET_CAP) {
            return { 
                allowed: false, 
                reason: 'MONTHLY_CAP_EXCEEDED',
                remaining: this.MONTHLY_MARKET_CAP - this.currentState.monthlyVolume
            };
        }
        
        if (newDailyVolume > this.DAILY_MARKET_CAP) {
            return { 
                allowed: false, 
                reason: 'DAILY_CAP_EXCEEDED',
                remaining: this.DAILY_MARKET_CAP - this.currentState.dailyVolume
            };
        }
        
        if (newHourlyVolume > this.HOURLY_MARKET_CAP) {
            return { 
                allowed: false, 
                reason: 'HOURLY_CAP_EXCEEDED',
                remaining: this.HOURLY_MARKET_CAP - this.currentState.hourlyVolume
            };
        }
        
        return { allowed: true };
    }
    
    async adjustGameMultipliers(baseMultiplier, gameType) {
        // Apply economic multiplier to base game multipliers
        let adjustedMultiplier = baseMultiplier * this.currentState.economicMultiplier;
        
        // Apply game-specific caps based on current state
        const maxMultiplierByCap = {
            'CRITICAL': 1.5,  // Maximum 1.5x during critical periods
            'HIGH': 2.0,      // Maximum 2.0x during high usage
            'MEDIUM': 3.0,    // Standard maximum
            'LOW': 5.0        // Higher maximum during low usage to encourage play
        };
        
        const maxAllowed = maxMultiplierByCap[this.currentState.adjustmentLevel] || 3.0;
        adjustedMultiplier = Math.min(adjustedMultiplier, maxAllowed);
        
        // Ensure minimum multiplier (never go below 0.1x)
        adjustedMultiplier = Math.max(adjustedMultiplier, 0.1);
        
        return adjustedMultiplier;
    }
    
    getUIAdjustments() {
        // Return UI adjustments based on current market conditions (bet limits removed)
        const adjustments = {
            'CRITICAL': {
                theme: 'restricted',
                warning: '🚨 Market capacity reached! Personalized payouts active.',
                hideHighRiskGames: true,
                showWarning: true,
                warningColor: '#FF0000'
            },
            'HIGH': {
                theme: 'cautious', 
                warning: '⚠️ High market activity. Personalized payouts active.',
                hideHighRiskGames: false,
                showWarning: true,
                warningColor: '#FF8800'
            },
            'MEDIUM': {
                theme: 'normal',
                warning: null,
                hideHighRiskGames: false,
                showWarning: false,
                warningColor: null
            },
            'LOW': {
                theme: 'bonus',
                warning: '🎉 Enhanced payouts active! Great time to play!',
                hideHighRiskGames: false,
                showWarning: true,
                warningColor: '#00AA00'
            }
        };
        
        return adjustments[this.currentState.adjustmentLevel] || adjustments['MEDIUM'];
    }
    
    async saveMarketState() {
        try {
            // In a real implementation, save to database
            // For now, we'll log the state
            logger.debug('Market state updated', this.currentState);
        } catch (error) {
            logger.error(`Failed to save market state: ${error.message}`);
        }
    }
    
    // Emergency reset function (admin only)
    async emergencyReset(adminUserId, reason) {
        logger.warn(`Emergency market reset initiated by ${adminUserId}: ${reason}`);
        
        securityLogger.logSecurityEvent(adminUserId, 'EMERGENCY_RESET', {
            reason: reason,
            previousState: { ...this.currentState },
            timestamp: new Date().toISOString()
        });
        
        this.currentState = {
            monthlyVolume: 0,
            dailyVolume: 0,
            hourlyVolume: 0,
            adjustmentLevel: 'MEDIUM',
            lastReset: new Date(),
            economicMultiplier: 1.0
        };
        
        await this.saveMarketState();
    }
}

// Create singleton instance
const marketCapManager = new MarketCapManager();

module.exports = marketCapManager;