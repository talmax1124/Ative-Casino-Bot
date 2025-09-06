/**
 * COMPREHENSIVE ECONOMIC MANAGEMENT SYSTEM
 * Integrates all economic systems for maximum stability and house advantage
 */

const economicStabilizer = require('./economicStabilizer');
const antiAbuseSystem = require('./antiAbuseSystem');
const wealthTaxManager = require('./wealthTax');
const dbManager = require('./database');
const logger = require('./logger');
const economicNotifications = require('./economicNotifications');

class EconomicManager {
    constructor() {
        this.initialized = false;
        this.systems = {
            stabilizer: economicStabilizer,
            antiAbuse: antiAbuseSystem,
            wealthTax: wealthTaxManager
        };
        
        // Global economic controls
        this.globalControls = {
            emergencyModeActive: false,
            maxDailyLoss: 100000000, // $100M max house loss per day
            circuitBreakerTriggered: false,
            economicHealthScore: 100
        };
        
        // Game-specific controls
        this.gameControls = {
            blackjack: {
                maxBet: 10000000, // $10M max
                houseEdgeAdjustment: 0,
                multiplierReduction: 0.1
            },
            slots: {
                maxBet: 175000,
                maxMultiplier: 50, // Reduced from higher values
                houseEdgeAdjustment: 0.02
            },
            roulette: {
                maxBet: 10000000,
                maxPayoutReduction: 0.2, // 20% reduction in max payouts
                houseEdgeAdjustment: 0
            },
            crash: {
                maxBet: 175000,
                maxMultiplier: 10, // Reduced from 15
                houseEdgeAdjustment: 0.01
            },
            plinko: {
                maxBet: 175000,
                maxMultiplier: 5, // Heavily reduced
                houseEdgeAdjustment: 0.02
            }
        };
        
        this.initialize();
    }
    
    async initialize() {
        if (this.initialized) return;
        
        logger.info('💎 Initializing Comprehensive Economic Management System...');
        
        try {
            // All systems should already be initialized as singletons
            await this.verifySystemsOnline();
            
            // Set up emergency procedures
            await this.setupEmergencyProcedures();
            
            // Apply initial economic controls
            await this.applyInitialControls();
            
            this.initialized = true;
            logger.info('💎 Economic Management System fully initialized and active');
            
        } catch (error) {
            logger.error(`Failed to initialize Economic Management System: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * VERIFY ALL SYSTEMS ARE ONLINE
     */
    async verifySystemsOnline() {
        const systemStatus = {
            stabilizer: this.systems.stabilizer.getEconomicStatus(),
            antiAbuse: this.systems.antiAbuse.getSystemStatus(),
            wealthTax: true // Assuming functional
        };
        
        logger.info('System Status Check:', systemStatus);
        
        // Update global health score based on system status
        let healthScore = 100;
        if (systemStatus.stabilizer.emergencyMode) healthScore -= 30;
        if (systemStatus.antiAbuse.blockedUsers > 10) healthScore -= 20;
        
        this.globalControls.economicHealthScore = Math.max(0, healthScore);
    }
    
    /**
     * SETUP EMERGENCY PROCEDURES
     */
    async setupEmergencyProcedures() {
        // Monitor for critical economic events
        setInterval(async () => {
            await this.monitorEconomicHealth();
        }, 30000); // Every 30 seconds
        
        logger.info('Emergency procedures configured');
    }
    
    /**
     * APPLY INITIAL ECONOMIC CONTROLS
     */
    async applyInitialControls() {
        // Reduce all game multipliers by base amount
        for (const [gameType, controls] of Object.entries(this.gameControls)) {
            if (controls.multiplierReduction) {
                logger.info(`Applied ${controls.multiplierReduction * 100}% multiplier reduction to ${gameType}`);
            }
        }
        
        // Apply conservative house edge adjustments
        logger.info('Conservative economic controls applied across all games');
    }
    
    /**
     * MAIN API - VALIDATE AND PROCESS BET
     */
    async validateAndProcessBet(userId, gameType, betAmount, userWealth) {
        try {
            // 1. Check user restrictions first
            const userCheck = await this.systems.antiAbuse.isUserActionAllowed(userId, 'bet', betAmount);
            if (!userCheck.allowed) {
                return {
                    approved: false,
                    reason: userCheck.reason,
                    restriction: userCheck.restrictionType,
                    data: userCheck
                };
            }
            
            // 2. Validate bet amount against economic stability
            const betValidation = await this.systems.stabilizer.validateBetAmount(userId, betAmount, userWealth);
            if (!betValidation.valid) {
                return {
                    approved: false,
                    reason: betValidation.reason,
                    maxAllowed: betValidation.maxAllowed
                };
            }
            
            // 3. Check game-specific limits
            const gameLimit = this.getGameSpecificLimit(gameType, userId, userWealth);
            if (betAmount > gameLimit.maxBet) {
                return {
                    approved: false,
                    reason: `Exceeds ${gameType} maximum bet limit`,
                    maxAllowed: gameLimit.maxBet
                };
            }
            
            // 4. Apply dynamic controls if in emergency mode
            if (this.globalControls.emergencyModeActive) {
                const emergencyLimit = Math.min(betAmount, 50000); // $50K emergency limit
                if (betAmount > emergencyLimit) {
                    return {
                        approved: false,
                        reason: 'Emergency mode active - reduced betting limits',
                        maxAllowed: emergencyLimit
                    };
                }
            }
            
            return {
                approved: true,
                adjustedAmount: betAmount,
                houseEdgeAdjustment: this.getHouseEdgeAdjustment(gameType),
                multiplierReduction: this.getMultiplierReduction(gameType, userId)
            };
            
        } catch (error) {
            logger.error(`Bet validation failed for user ${userId}: ${error.message}`);
            return {
                approved: false,
                reason: 'System error - bet validation failed'
            };
        }
    }
    
    /**
     * MAIN API - VALIDATE AND PROCESS PAYOUT
     */
    async validateAndProcessPayout(userId, gameType, betAmount, payout, gameData = {}) {
        try {
            const multiplier = payout / betAmount;
            
            // 1. Check for suspicious payouts
            const payoutValidation = await this.systems.stabilizer.validatePayout(userId, betAmount, payout, gameType);
            if (!payoutValidation.approved) {
                logger.warn(`Payout blocked for user ${userId}: ${payout} (${multiplier.toFixed(2)}x)`);
                return {
                    approved: false,
                    reason: 'Payout validation failed',
                    originalPayout: payout,
                    adjustedPayout: 0
                };
            }
            
            // 2. Apply multiplier reductions
            const reduction = await this.getMultiplierReduction(gameType, userId);
            let adjustedPayout = payout;
            
            if (reduction > 0) {
                adjustedPayout = Math.max(betAmount, payout * (1 - reduction)); // Never less than bet back
                logger.debug(`Payout reduced by ${(reduction * 100).toFixed(1)}%: ${payout} → ${adjustedPayout}`);
            }
            
            // 3. Apply emergency reductions
            if (this.globalControls.emergencyModeActive) {
                adjustedPayout = Math.max(betAmount, adjustedPayout * 0.5); // 50% emergency reduction
                logger.warn(`Emergency payout reduction applied: ${adjustedPayout}`);
            }
            
            // 4. Analyze gaming behavior for anti-abuse
            await this.systems.antiAbuse.analyzeGameAction(userId, gameType, 'win', {
                betAmount,
                payout: adjustedPayout,
                multiplier: adjustedPayout / betAmount,
                result: 'win',
                ...gameData
            });
            
            return {
                approved: true,
                originalPayout: payout,
                adjustedPayout: adjustedPayout,
                reductionApplied: (payout - adjustedPayout) / payout,
                reason: reduction > 0 ? 'Economic stability reduction applied' : null
            };
            
        } catch (error) {
            logger.error(`Payout validation failed for user ${userId}: ${error.message}`);
            return {
                approved: false,
                reason: 'System error - payout validation failed',
                adjustedPayout: betAmount // Return bet amount on error
            };
        }
    }
    
    /**
     * GET GAME-SPECIFIC BETTING LIMIT
     */
    getGameSpecificLimit(gameType, userId, userWealth) {
        const baseControls = this.gameControls[gameType] || {};
        let maxBet = baseControls.maxBet || 100000; // Default $100K
        
        // Apply wealth-based limits (never bet more than 5% of wealth)
        const wealthLimit = userWealth * 0.05;
        maxBet = Math.min(maxBet, wealthLimit);
        
        // Apply emergency reductions
        if (this.globalControls.emergencyModeActive) {
            maxBet = Math.min(maxBet, 10000); // $10K emergency max
        }
        
        return {
            maxBet,
            reason: maxBet === wealthLimit ? 'wealth_based' : 
                   maxBet === 10000 ? 'emergency' : 'game_limit'
        };
    }
    
    /**
     * GET HOUSE EDGE ADJUSTMENT
     */
    getHouseEdgeAdjustment(gameType) {
        let adjustment = 0;
        
        // Base game adjustment
        const gameControls = this.gameControls[gameType];
        if (gameControls && gameControls.houseEdgeAdjustment) {
            adjustment += gameControls.houseEdgeAdjustment;
        }
        
        // Stabilizer adjustment
        adjustment += this.systems.stabilizer.getHouseEdgeAdjustment();
        
        // Emergency adjustment
        if (this.globalControls.emergencyModeActive) {
            adjustment += 0.03; // +3% in emergency
        }
        
        return adjustment;
    }
    
    /**
     * GET MULTIPLIER REDUCTION
     */
    async getMultiplierReduction(gameType, userId) {
        let reduction = 0;
        
        // Base game reduction
        const gameControls = this.gameControls[gameType];
        if (gameControls && gameControls.multiplierReduction) {
            reduction += gameControls.multiplierReduction;
        }
        
        // Stabilizer reduction
        const stabilizerReduction = await this.systems.stabilizer.getMultiplierAdjustment(userId, gameType, 1);
        reduction += (1 - stabilizerReduction);
        
        // Emergency reduction
        if (this.globalControls.emergencyModeActive) {
            reduction += 0.25; // +25% emergency reduction
        }
        
        // User risk-based reduction
        const userRisk = this.systems.antiAbuse.getUserRiskAssessment(userId);
        if (userRisk.riskLevel === 'HIGH' || userRisk.riskLevel === 'CRITICAL') {
            reduction += 0.2; // +20% for high-risk users
        }
        
        return Math.min(0.8, reduction); // Max 80% reduction
    }
    
    /**
     * MONITOR ECONOMIC HEALTH
     */
    async monitorEconomicHealth() {
        try {
            const stabilizerStatus = this.systems.stabilizer.getEconomicStatus();
            const antiAbuseStatus = this.systems.antiAbuse.getSystemStatus();
            
            // Check for emergency conditions
            let emergencyTriggered = false;
            
            if (stabilizerStatus.emergencyMode) {
                emergencyTriggered = true;
            }
            
            if (stabilizerStatus.healthScore < 50) {
                emergencyTriggered = true;
            }
            
            if (antiAbuseStatus.blockedUsers > 20) {
                emergencyTriggered = true;
            }
            
            // Update emergency status
            if (emergencyTriggered !== this.globalControls.emergencyModeActive) {
                this.globalControls.emergencyModeActive = emergencyTriggered;
                
                if (emergencyTriggered) {
                    logger.error('🚨 ECONOMIC EMERGENCY MODE ACTIVATED - All systems operating under restrictions');
                    await this.notifyEmergencyActivation();
                    await this.sendEmergencyNotification();
                } else {
                    logger.info('🟢 Economic emergency mode deactivated - Normal operations resumed');
                    await this.sendRecoveryNotification();
                }
            }
            
            // Update health score
            this.globalControls.economicHealthScore = Math.min(
                stabilizerStatus.healthScore || 100,
                antiAbuseStatus.trackedUsers > 0 ? 100 : 90
            );
            
        } catch (error) {
            logger.error(`Economic health monitoring failed: ${error.message}`);
        }
    }
    
    /**
     * NOTIFY EMERGENCY ACTIVATION
     */
    async notifyEmergencyActivation() {
        try {
            // Log detailed emergency information
            logger.error('🚨 ECONOMIC EMERGENCY DETAILS:');
            logger.error(`- Health Score: ${this.globalControls.economicHealthScore}`);
            logger.error(`- Stabilizer Emergency: ${this.systems.stabilizer.getEconomicStatus().emergencyMode}`);
            logger.error(`- Blocked Users: ${this.systems.antiAbuse.getSystemStatus().blockedUsers}`);
            
            // Could integrate with Discord notifications here
            
        } catch (error) {
            logger.error(`Emergency notification failed: ${error.message}`);
        }
    }
    
    /**
     * PUBLIC API - GET SYSTEM STATUS
     */
    getSystemStatus() {
        return {
            initialized: this.initialized,
            emergencyMode: this.globalControls.emergencyModeActive,
            healthScore: this.globalControls.economicHealthScore,
            systems: {
                stabilizer: this.systems.stabilizer.getEconomicStatus(),
                antiAbuse: this.systems.antiAbuse.getSystemStatus(),
                wealthTax: { status: 'ACTIVE' }
            },
            gameControls: this.gameControls,
            timestamp: Date.now()
        };
    }
    
    /**
     * PUBLIC API - MANUAL EMERGENCY OVERRIDE
     */
    async setEmergencyMode(active, reason = 'Manual override') {
        this.globalControls.emergencyModeActive = active;
        
        if (active) {
            logger.warn(`🚨 MANUAL EMERGENCY MODE ACTIVATED: ${reason}`);
        } else {
            logger.info(`🟢 Emergency mode manually deactivated: ${reason}`);
        }
        
        return this.getSystemStatus();
    }
    
    /**
     * PUBLIC API - UPDATE GAME CONTROLS
     */
    updateGameControls(gameType, newControls) {
        if (this.gameControls[gameType]) {
            this.gameControls[gameType] = {
                ...this.gameControls[gameType],
                ...newControls
            };
            
            logger.info(`Game controls updated for ${gameType}:`, newControls);
            return true;
        }
        
        return false;
    }
    
    /**
     * PUBLIC API - GET ECONOMIC REPORT
     */
    async getEconomicReport() {
        const stabilizer = this.systems.stabilizer.getEconomicStatus();
        const antiAbuse = this.systems.antiAbuse.getSystemStatus();
        
        return {
            overview: {
                healthScore: this.globalControls.economicHealthScore,
                emergencyMode: this.globalControls.emergencyModeActive,
                systemsOnline: this.initialized
            },
            stabilizer: {
                ...stabilizer,
                houseEdgeAdjustment: this.systems.stabilizer.getHouseEdgeAdjustment()
            },
            antiAbuse: {
                ...antiAbuse,
                riskLevels: {
                    low: 0, // Could be calculated from cached data
                    medium: 0,
                    high: antiAbuse.blockedUsers,
                    critical: 0
                }
            },
            controls: {
                gameControls: this.gameControls,
                multiplierReductions: 'Dynamic based on user/game/economic state',
                betLimits: 'Dynamic based on wealth/risk/emergency status'
            },
            timestamp: Date.now()
        };
    }

    /**
     * SEND EMERGENCY NOTIFICATION TO MONITORING CHANNEL
     */
    async sendEmergencyNotification() {
        try {
            const stabilizerStatus = this.systems.stabilizer.getEconomicStatus();
            const antiAbuseStatus = this.systems.antiAbuse.getSystemStatus();
            
            // Get circuit breakers that triggered
            const circuitBreakers = [];
            if (stabilizerStatus.circuitBreakers) {
                circuitBreakers.push(...stabilizerStatus.circuitBreakers);
            }
            
            const emergencyData = {
                emergencyMode: this.globalControls.emergencyModeActive,
                healthScore: this.globalControls.economicHealthScore,
                initialized: this.initialized,
                circuitBreakers: circuitBreakers,
                emergencyMeasures: {
                    multiplierReduction: 0.5, // 50% reduction
                    houseEdgeIncrease: 0.02 // +2% house edge
                },
                antiAbuse: antiAbuseStatus
            };
            
            await economicNotifications.sendEmergencyNotification(emergencyData);
            
        } catch (error) {
            logger.error(`Failed to send emergency notification: ${error.message}`);
        }
    }

    /**
     * SEND RECOVERY NOTIFICATION TO MONITORING CHANNEL
     */
    async sendRecoveryNotification() {
        try {
            const statusData = {
                healthScore: this.globalControls.economicHealthScore,
                initialized: this.initialized
            };
            
            await economicNotifications.sendRecoveryNotification(statusData);
            
        } catch (error) {
            logger.error(`Failed to send recovery notification: ${error.message}`);
        }
    }

    /**
     * SET DISCORD CLIENT FOR NOTIFICATIONS
     */
    setNotificationClient(client) {
        economicNotifications.setClient(client);
    }
    
    /**
     * CLEANUP RESOURCES
     */
    destroy() {
        // Systems are singletons, they manage their own cleanup
        logger.info('Economic Management System destroyed');
    }
}

// Export singleton instance
module.exports = new EconomicManager();