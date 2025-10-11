/**
 * DYNAMIC GAME ADJUSTER
 * Integrates market cap system with all casino games
 * Dynamically adjusts payouts, UI, and game mechanics based on market conditions
 */

const marketCapManager = require('./marketCapManager');
const personalizedEconomyManager = require('./personalizedEconomyManager');
const logger = require('./logger');
const securityLogger = require('./securityLogger');

class DynamicGameAdjuster {
    constructor() {
        this.gameConfigs = {
            roulette: {
                baseMultipliers: {
                    straight: 35,
                    split: 17,
                    street: 11,
                    corner: 8,
                    line: 5,
                    dozen: 2,
                    column: 2,
                    red: 1,
                    black: 1,
                    odd: 1,
                    even: 1,
                    low: 1,
                    high: 1
                }
            },
            blackjack: {
                baseMultipliers: {
                    win: 2.0,
                    blackjack: 2.5,
                    push: 1.0
                }
            },
            slots: {
                baseMultipliers: {
                    cherries: 1.05,
                    lemon: 1.1,
                    orange: 1.2,
                    grapes: 1.4,
                    watermelon: 1.6,
                    bar: 1.8,
                    seven: 2.0,
                    diamond: 2.0,
                    buffalo: 2.0,
                    jackpot: 2.0
                }
            },
            plinko: {
                baseMultipliers: {
                    easy: [0.2, 0.4, 0.6, 0.8, 1.2, 0.8, 0.6, 0.4, 0.2],
                    medium: [0.1, 0.2, 0.3, 0.5, 0.8, 1.0, 1.5, 1.0, 0.8],
                    hard: [0.0, 0.1, 0.2, 0.3, 0.5, 0.8, 1.8, 0.8, 0.5],
                    nightmare: [0.0, 0.0, 0.1, 0.2, 0.3, 0.4, 2.0, 0.4, 0.3]
                }
            },
            crash: {
                baseMultipliers: {
                    safe: 1.5,
                    balanced: 2.0,
                    risky: 2.5,
                    extreme: 3.0
                }
            }
        };
    }
    
    async processGameBet(userId, gameType, betAmount) {
        try {
            // Check if transaction is allowed under current caps
            const canProcess = await marketCapManager.canProcessTransaction(betAmount);
            
            if (!canProcess.allowed) {
                return {
                    allowed: false,
                    reason: canProcess.reason,
                    remaining: canProcess.remaining,
                    message: this.getCapExceededMessage(canProcess.reason, canProcess.remaining)
                };
            }
            
            // Record the bet in market cap tracking and personalized tracking
            await marketCapManager.recordTransaction(betAmount, gameType, userId);
            await personalizedEconomyManager.recordUserBet(userId, gameType, betAmount);
            
            // Get personalized information for the user
            const personalizedInfo = {
                payoutMultiplier: await personalizedEconomyManager.getUserPayoutMultiplier(userId),
                impactLevel: await personalizedEconomyManager.getUserImpactLevel(userId),
                economicScore: await personalizedEconomyManager.getUserEconomicScore(userId)
            };
            
            return { 
                allowed: true,
                personalizedInfo: personalizedInfo
            };
            
        } catch (error) {
            logger.error(`Failed to process game bet: ${error.message}`);
            throw error;
        }
    }
    
    getCapExceededMessage(reason, remaining) {
        switch (reason) {
            case 'MONTHLY_CAP_EXCEEDED':
                return `🚫 Monthly market cap reached! Only $${remaining.toLocaleString()} remaining this month.`;
            case 'DAILY_CAP_EXCEEDED':
                return `🚫 Daily trading limit reached! Only $${remaining.toLocaleString()} remaining today.`;
            case 'HOURLY_CAP_EXCEEDED':
                return `🚫 Hourly limit reached! Only $${remaining.toLocaleString()} remaining this hour.`;
            default:
                return '🚫 Market capacity limit reached. Please try again later.';
        }
    }
    
    async getAdjustedMultipliers(gameType, baseMultipliers = null) {
        const marketStatus = marketCapManager.getMarketStatus();
        const economicMultiplier = marketCapManager.getEconomicMultiplier();
        
        // Get base multipliers for the game
        const gameConfig = this.gameConfigs[gameType];
        if (!gameConfig) {
            logger.warn(`Unknown game type for adjustment: ${gameType}`);
            return baseMultipliers || {};
        }
        
        const baseValues = baseMultipliers || gameConfig.baseMultipliers;
        const adjustedMultipliers = {};
        
        // Apply economic multiplier to all base multipliers
        if (Array.isArray(baseValues)) {
            // Handle array-based multipliers (like plinko)
            return baseValues.map(multiplier => {
                const adjusted = multiplier * economicMultiplier;
                return Math.min(Math.max(adjusted, 0.1), this.getMaxMultiplierForCurrentCap(gameType));
            });
        } else if (typeof baseValues === 'object') {
            // Handle object-based multipliers
            for (const [key, value] of Object.entries(baseValues)) {
                const adjusted = value * economicMultiplier;
                adjustedMultipliers[key] = Math.min(Math.max(adjusted, 0.1), this.getMaxMultiplierForCurrentCap(gameType));
            }
        }
        
        // Log significant adjustments
        if (economicMultiplier !== 1.0) {
            logger.info(`Applied ${economicMultiplier}x economic adjustment to ${gameType}`, {
                adjustmentLevel: marketStatus.adjustmentLevel,
                monthlyUsage: `${marketStatus.monthlyPercentage.toFixed(2)}%`
            });
        }
        
        return adjustedMultipliers;
    }
    
    getMaxMultiplierForCurrentCap(gameType) {
        const adjustmentLevel = marketCapManager.getAdjustmentLevel();
        
        // Maximum multipliers based on market conditions
        const maxMultipliers = {
            'CRITICAL': 1.5,
            'HIGH': 2.0,
            'MEDIUM': 3.0,
            'LOW': 5.0
        };
        
        return maxMultipliers[adjustmentLevel] || 3.0;
    }
    
    getAdjustedBetLimits(gameType) {
        // REMOVED: Bet limits no longer enforced - using personalized payouts instead
        return {
            min: 1,
            max: Number.MAX_SAFE_INTEGER // No upper limit
        };
    }
    
    async getGameUIConfig(gameType, userId = null) {
        const marketStatus = marketCapManager.getMarketStatus();
        const uiAdjustments = marketCapManager.getUIAdjustments();
        const betLimits = this.getAdjustedBetLimits(gameType);
        
        // Get personalized information if user provided
        let personalizedInfo = null;
        if (userId) {
            try {
                personalizedInfo = {
                    payoutMultiplier: await personalizedEconomyManager.getUserPayoutMultiplier(userId),
                    impactLevel: await personalizedEconomyManager.getUserImpactLevel(userId),
                    economicScore: await personalizedEconomyManager.getUserEconomicScore(userId)
                };
            } catch (error) {
                logger.warn(`Failed to get personalized info for ${userId}: ${error.message}`);
            }
        }
        
        return {
            gameType: gameType,
            theme: uiAdjustments.theme,
            warningMessage: uiAdjustments.warning,
            warningColor: uiAdjustments.warningColor,
            showWarning: uiAdjustments.showWarning,
            betLimits: betLimits, // Now unlimited
            hideHighRiskOptions: uiAdjustments.hideHighRiskGames,
            marketStatus: {
                adjustmentLevel: marketStatus.adjustmentLevel,
                economicMultiplier: marketStatus.economicMultiplier,
                monthlyUsage: `${marketStatus.monthlyPercentage.toFixed(1)}%`,
                dailyUsage: `${marketStatus.dailyPercentage.toFixed(1)}%`,
                hourlyUsage: `${marketStatus.hourlyPercentage.toFixed(1)}%`
            },
            personalizedInfo: personalizedInfo,
            displayAdjustments: this.getDisplayAdjustments(marketStatus.adjustmentLevel)
        };
    }
    
    getDisplayAdjustments(adjustmentLevel) {
        const adjustments = {
            'CRITICAL': {
                colors: { primary: '#FF0000', secondary: '#FF6666', background: '#FFE6E6' },
                animations: { speed: 'slow', intensity: 'low' },
                sounds: { volume: 0.3, muted: true },
                effects: { particles: false, glow: false }
            },
            'HIGH': {
                colors: { primary: '#FF8800', secondary: '#FFAA66', background: '#FFF0E6' },
                animations: { speed: 'normal', intensity: 'medium' },
                sounds: { volume: 0.5, muted: false },
                effects: { particles: true, glow: false }
            },
            'MEDIUM': {
                colors: { primary: '#0088FF', secondary: '#66AAFF', background: '#E6F0FF' },
                animations: { speed: 'normal', intensity: 'medium' },
                sounds: { volume: 0.7, muted: false },
                effects: { particles: true, glow: true }
            },
            'LOW': {
                colors: { primary: '#00AA00', secondary: '#66CC66', background: '#E6FFE6' },
                animations: { speed: 'fast', intensity: 'high' },
                sounds: { volume: 1.0, muted: false },
                effects: { particles: true, glow: true, bonus: true }
            }
        };
        
        return adjustments[adjustmentLevel] || adjustments['MEDIUM'];
    }
    
    async validatePayout(gameType, betAmount, calculatedPayout, userId) {
        try {
            // Basic validation
            if (!Number.isFinite(calculatedPayout) || calculatedPayout < 0) {
                throw new Error(`Invalid payout calculated: ${calculatedPayout}`);
            }
            
            // Apply personalized payout adjustments based on user's economic impact
            const personalizedMultiplier = await personalizedEconomyManager.getUserPayoutMultiplier(userId);
            const adjustedPayout = Math.floor(calculatedPayout * personalizedMultiplier);
            
            // Log personalized adjustments if significant
            if (personalizedMultiplier !== 1.0) {
                logger.info(`Applied personalized payout adjustment for ${userId}`, {
                    gameType: gameType,
                    originalPayout: calculatedPayout,
                    adjustedPayout: adjustedPayout,
                    personalizedMultiplier: personalizedMultiplier,
                    userImpactLevel: await personalizedEconomyManager.getUserImpactLevel(userId)
                });
                
                securityLogger.logSecurityEvent(userId, 'PERSONALIZED_PAYOUT_APPLIED', {
                    gameType: gameType,
                    originalPayout: calculatedPayout,
                    adjustedPayout: adjustedPayout,
                    personalizedMultiplier: personalizedMultiplier
                });
            }
            
            // Record the payout transaction for both market cap and personalized tracking
            await marketCapManager.recordTransaction(adjustedPayout, gameType + '_payout', userId);
            await personalizedEconomyManager.recordUserPayout(userId, gameType, adjustedPayout, betAmount);
            
            return adjustedPayout;
            
        } catch (error) {
            logger.error(`Failed to validate payout: ${error.message}`);
            throw error;
        }
    }
    
    getMarketStatusEmbed() {
        const marketStatus = marketCapManager.getMarketStatus();
        
        const embed = {
            title: '📊 Market Status',
            color: this.getStatusColor(marketStatus.adjustmentLevel),
            fields: [
                {
                    name: '💰 Market Usage',
                    value: `Monthly: ${marketStatus.monthlyPercentage.toFixed(2)}%\nDaily: ${marketStatus.dailyPercentage.toFixed(2)}%\nHourly: ${marketStatus.hourlyPercentage.toFixed(2)}%`,
                    inline: true
                },
                {
                    name: '⚖️ Current State',
                    value: `Level: ${marketStatus.adjustmentLevel}\nMultiplier: ${marketStatus.economicMultiplier}x`,
                    inline: true
                },
                {
                    name: '🎯 Volume Today',
                    value: `$${marketStatus.dailyVolume.toLocaleString()}`,
                    inline: true
                }
            ],
            footer: {
                text: 'Market conditions update automatically based on volume'
            },
            timestamp: new Date().toISOString()
        };
        
        return embed;
    }
    
    getStatusColor(adjustmentLevel) {
        const colors = {
            'CRITICAL': 0xFF0000, // Red
            'HIGH': 0xFF8800,     // Orange
            'MEDIUM': 0x0088FF,   // Blue
            'LOW': 0x00AA00       // Green
        };
        
        return colors[adjustmentLevel] || colors['MEDIUM'];
    }
    
    // Admin functions
    async getDetailedMarketReport() {
        const marketStatus = marketCapManager.getMarketStatus();
        const economicReport = await personalizedEconomyManager.getEconomicReport();
        
        return {
            timestamp: new Date().toISOString(),
            marketStatus: marketStatus,
            economicReport: economicReport,
            gameConfigs: this.gameConfigs,
            adjustments: {
                roulette: await this.getAdjustedMultipliers('roulette'),
                blackjack: await this.getAdjustedMultipliers('blackjack'),
                slots: await this.getAdjustedMultipliers('slots'),
                plinko: await this.getAdjustedMultipliers('plinko'),
                crash: await this.getAdjustedMultipliers('crash')
            },
            betLimits: {
                note: 'Bet limits removed - using personalized payouts instead',
                unlimited: true
            },
            personalizedEconomy: {
                enabled: true,
                analysisInterval: '5 minutes',
                autoAdjustments: true,
                channelLogging: true
            }
        };
    }
}

// Create singleton instance
const dynamicGameAdjuster = new DynamicGameAdjuster();

module.exports = dynamicGameAdjuster;