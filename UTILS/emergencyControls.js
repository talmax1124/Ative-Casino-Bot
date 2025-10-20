/**
 * 🚨 EMERGENCY CONTROLS SYSTEM
 * Emergency protection system for extreme casino situations
 * Automatically activates when certain thresholds are exceeded
 */

const logger = require('./logger');

class EmergencyControls {
    constructor() {
        this.emergencyMode = false;
        this.emergencyLevel = 0; // 0=normal, 1=caution, 2=alert, 3=critical, 4=emergency
        this.triggerCounts = new Map();
        this.lastEmergencyTime = 0;
        this.emergencyThresholds = {
            // Level 1: Caution
            excessiveDailyWins: 30000000,     // 30M+ wins per day
            rapidGameRate: 1000,              // 1000+ games per hour
            
            // Level 2: Alert  
            extremeDailyWins: 50000000,       // 50M+ wins per day
            massiveGameRate: 2000,            // 2000+ games per hour
            
            // Level 3: Critical
            catastrophicWins: 100000000,      // 100M+ wins per day
            systemOverload: 5000,             // 5000+ games per hour
            
            // Level 4: Emergency
            economicCollapse: 250000000,      // 250M+ wins per day
            totalSystemFailure: 10000         // 10,000+ games per hour
        };
        
        this.emergencyActions = {
            1: this.activateCautionMode.bind(this),
            2: this.activateAlertMode.bind(this),
            3: this.activateCriticalMode.bind(this),
            4: this.activateEmergencyMode.bind(this)
        };
        
        this.emergencySettings = {
            1: { // Caution Mode
                houseEdgeMultiplier: 1.2,    // +20% house edge
                payoutReduction: 0.95,       // -5% payouts
                maxBetReduction: 0.9,        // -10% max bet limits
                description: 'Caution: Elevated activity detected'
            },
            2: { // Alert Mode
                houseEdgeMultiplier: 1.5,    // +50% house edge
                payoutReduction: 0.9,        // -10% payouts
                maxBetReduction: 0.8,        // -20% max bet limits
                description: 'Alert: High risk activity detected'
            },
            3: { // Critical Mode
                houseEdgeMultiplier: 2.0,    // +100% house edge
                payoutReduction: 0.8,        // -20% payouts
                maxBetReduction: 0.5,        // -50% max bet limits
                description: 'Critical: Emergency measures activated'
            },
            4: { // Emergency Mode
                houseEdgeMultiplier: 3.0,    // +200% house edge
                payoutReduction: 0.5,        // -50% payouts
                maxBetReduction: 0.1,        // -90% max bet limits
                description: 'Emergency: System protection mode'
            }
        };
        
        // Emergency monitoring disabled - ban system removed
        // this.monitoringInterval = setInterval(() => {
        //     this.performEmergencyCheck();
        // }, 60000); // Check every minute
    }

    /**
     * Check if emergency measures should be activated
     */
    async performEmergencyCheck() {
        try {
            const currentMetrics = await this.gatherSystemMetrics();
            const requiredLevel = this.calculateRequiredEmergencyLevel(currentMetrics);
            
            if (requiredLevel > this.emergencyLevel) {
                await this.escalateEmergencyLevel(requiredLevel, currentMetrics);
            } else if (requiredLevel < this.emergencyLevel && this.shouldDeescalate()) {
                await this.deescalateEmergencyLevel(requiredLevel);
            }
            
        } catch (error) {
            logger.error(`Emergency check failed: ${error.message}`);
        }
    }

    /**
     * Gather current system metrics
     */
    async gatherSystemMetrics() {
        // This would integrate with your actual analytics
        const metrics = {
            dailyWins: 0,
            hourlyGameRate: 0,
            totalPlayers: 0,
            serverLoad: 0,
            errorRate: 0
        };

        try {
            // Try to get real metrics from analytics engine
            const AnalyticsEngine = require('../ENGINES/AnalyticsEngine');
            const analytics = AnalyticsEngine.getInstance();
            const realtimeMetrics = await analytics.getRealtimeMetrics();
            
            if (realtimeMetrics && realtimeMetrics.summary) {
                // Safely calculate hourly game rate with validation
                const avgGamesPerMinute = realtimeMetrics.summary.avgGamesPerMinute;
                if (typeof avgGamesPerMinute === 'number' && !isNaN(avgGamesPerMinute)) {
                    metrics.hourlyGameRate = avgGamesPerMinute * 60;
                } else {
                    metrics.hourlyGameRate = 0;
                }
                metrics.dailyWins = realtimeMetrics.summary.totalPayouts || 0;
            }
        } catch (error) {
            // Fallback to manual calculation if analytics not available
            logger.warn(`Could not get analytics metrics: ${error.message}`);
        }

        return metrics;
    }

    /**
     * Calculate what emergency level is required
     */
    calculateRequiredEmergencyLevel(metrics) {
        let requiredLevel = 0;

        // Validate metrics to prevent NaN from triggering emergency
        const dailyWins = typeof metrics.dailyWins === 'number' && !isNaN(metrics.dailyWins) ? metrics.dailyWins : 0;
        const hourlyGameRate = typeof metrics.hourlyGameRate === 'number' && !isNaN(metrics.hourlyGameRate) ? metrics.hourlyGameRate : 0;

        // Check Level 4: Emergency
        if (dailyWins >= this.emergencyThresholds.economicCollapse ||
            hourlyGameRate >= this.emergencyThresholds.totalSystemFailure) {
            requiredLevel = 4;
        }
        // Check Level 3: Critical
        else if (dailyWins >= this.emergencyThresholds.catastrophicWins ||
                 hourlyGameRate >= this.emergencyThresholds.systemOverload) {
            requiredLevel = 3;
        }
        // Check Level 2: Alert
        else if (dailyWins >= this.emergencyThresholds.extremeDailyWins ||
                 hourlyGameRate >= this.emergencyThresholds.massiveGameRate) {
            requiredLevel = 2;
        }
        // Check Level 1: Caution
        else if (dailyWins >= this.emergencyThresholds.excessiveDailyWins ||
                 hourlyGameRate >= this.emergencyThresholds.rapidGameRate) {
            requiredLevel = 1;
        }

        return requiredLevel;
    }

    /**
     * Escalate to higher emergency level
     */
    async escalateEmergencyLevel(newLevel, metrics) {
        const oldLevel = this.emergencyLevel;
        this.emergencyLevel = newLevel;
        this.lastEmergencyTime = Date.now();
        
        // Emergency escalation logging disabled
        // logger.error(`🚨 EMERGENCY ESCALATION: Level ${oldLevel} → Level ${newLevel}`);
        // logger.error(`📊 Metrics: Daily Wins: ${metrics.dailyWins.toLocaleString()}, Hourly Games: ${metrics.hourlyGameRate}`);
        
        // Activate emergency measures
        if (this.emergencyActions[newLevel]) {
            await this.emergencyActions[newLevel](metrics);
        }
        
        // Send critical alert
        this.sendEmergencyAlert(newLevel, metrics, 'ESCALATION');
    }

    /**
     * Deescalate to lower emergency level
     */
    async deescalateEmergencyLevel(newLevel) {
        const oldLevel = this.emergencyLevel;
        this.emergencyLevel = newLevel;
        
        // Emergency deescalation logging disabled
        // logger.info(`✅ EMERGENCY DEESCALATION: Level ${oldLevel} → Level ${newLevel}`);
        
        if (newLevel === 0) {
            this.emergencyMode = false;
            logger.info('🎉 Emergency mode deactivated - System returned to normal');
        }
        
        this.sendEmergencyAlert(newLevel, {}, 'DEESCALATION');
    }

    /**
     * Check if conditions allow deescalation
     */
    shouldDeescalate() {
        // Require at least 5 minutes in current level before deescalating
        return (Date.now() - this.lastEmergencyTime) > 300000;
    }

    /**
     * Caution Mode (Level 1)
     */
    async activateCautionMode(metrics) {
        this.emergencyMode = true;
        logger.warn('⚠️ CAUTION MODE ACTIVATED');
        logger.warn(`Reason: Daily wins ${metrics.dailyWins.toLocaleString()} or hourly games ${metrics.hourlyGameRate}`);
    }

    /**
     * Alert Mode (Level 2)
     */
    async activateAlertMode(metrics) {
        this.emergencyMode = true;
        logger.error('🔶 ALERT MODE ACTIVATED');
        logger.error(`Reason: Daily wins ${metrics.dailyWins.toLocaleString()} or hourly games ${metrics.hourlyGameRate}`);
    }

    /**
     * Critical Mode (Level 3)
     */
    async activateCriticalMode(metrics) {
        this.emergencyMode = true;
        logger.error('🔴 CRITICAL MODE ACTIVATED');
        logger.error(`Reason: Daily wins ${metrics.dailyWins.toLocaleString()} or hourly games ${metrics.hourlyGameRate}`);
    }

    /**
     * Emergency Mode (Level 4)
     */
    async activateEmergencyMode(metrics) {
        this.emergencyMode = true;
        logger.error('🚨 EMERGENCY MODE ACTIVATED');
        logger.error(`Reason: Daily wins ${metrics.dailyWins.toLocaleString()} or hourly games ${metrics.hourlyGameRate}`);
        logger.error('System protection measures in full effect');
    }

    /**
     * Send emergency alert
     */
    sendEmergencyAlert(level, metrics, type) {
        const settings = this.emergencySettings[level];
        const emoji = ['🟢', '🟡', '🟠', '🔴', '🚨'][level];
        
        logger.error(`${emoji} EMERGENCY ${type}: Level ${level}`);
        if (settings) {
            logger.error(`Description: ${settings.description}`);
        }
        if (metrics.dailyWins) {
            logger.error(`Metrics: Daily Wins: ${metrics.dailyWins.toLocaleString()}`);
        }
    }

    /**
     * Get current emergency adjustments
     */
    getEmergencyAdjustments() {
        if (this.emergencyLevel === 0) {
            return {
                active: false,
                level: 0,
                houseEdgeMultiplier: 1.0,
                payoutReduction: 1.0,
                maxBetReduction: 1.0
            };
        }

        const settings = this.emergencySettings[this.emergencyLevel];
        return {
            active: true,
            level: this.emergencyLevel,
            description: settings.description,
            houseEdgeMultiplier: settings.houseEdgeMultiplier,
            payoutReduction: settings.payoutReduction,
            maxBetReduction: settings.maxBetReduction
        };
    }

    /**
     * Check if action should be blocked due to emergency
     */
    shouldBlockAction(actionType, amount = 0) {
        if (this.emergencyLevel === 0) return false;
        
        const adjustments = this.getEmergencyAdjustments();
        
        // Block large bets in emergency mode
        if (actionType === 'BET' && this.emergencyLevel >= 3) {
            const maxAllowed = 1000000 * adjustments.maxBetReduction;
            return amount > maxAllowed;
        }
        
        // Block new game creation in highest emergency
        if (actionType === 'NEW_GAME' && this.emergencyLevel >= 4) {
            return true;
        }
        
        return false;
    }

    /**
     * Manual emergency override
     */
    setEmergencyLevel(level, reason = 'Manual override') {
        if (level < 0 || level > 4) {
            throw new Error('Emergency level must be between 0 and 4');
        }
        
        const oldLevel = this.emergencyLevel;
        this.emergencyLevel = level;
        this.lastEmergencyTime = Date.now();
        
        if (level > oldLevel) {
            logger.error(`🚨 MANUAL EMERGENCY ESCALATION: Level ${oldLevel} → Level ${level}`);
            logger.error(`Reason: ${reason}`);
        } else if (level < oldLevel) {
            logger.info(`✅ MANUAL EMERGENCY DEESCALATION: Level ${oldLevel} → Level ${level}`);
            logger.info(`Reason: ${reason}`);
        }
        
        this.emergencyMode = level > 0;
        
        if (level === 0) {
            logger.info('🎉 Emergency mode manually deactivated');
        }
    }

    /**
     * Get emergency status
     */
    getStatus() {
        return {
            active: this.emergencyMode,
            level: this.emergencyLevel,
            adjustments: this.getEmergencyAdjustments(),
            thresholds: this.emergencyThresholds
        };
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
    }
}

// Export singleton instance
module.exports = new EmergencyControls();