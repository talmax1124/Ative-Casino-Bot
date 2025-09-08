/**
 * GuardRailSystem - Multi-Layer Safety System for Economic Changes
 * Enforces strict limits and validates all economic proposals before execution
 */

const EventEmitter = require('events');
const logger = require('../../UTILS/logger');

class GuardRailSystem extends EventEmitter {
    constructor(config, stateManager) {
        super();
        
        this.config = config;
        this.stateManager = stateManager;
        
        // Safety limits and thresholds
        this.limits = {
            // Percentage change limits
            maxSingleAdjustment: config.maxSingleAdjustment || 0.05, // 5% max single change
            maxDailyAdjustment: config.maxDailyAdjustment || 0.10, // 10% max daily cumulative
            maxWeeklyAdjustment: config.maxWeeklyAdjustment || 0.25, // 25% max weekly cumulative
            
            // House edge boundaries
            minHouseEdge: config.minHouseEdge || 0.005, // 0.5% minimum
            maxHouseEdge: config.maxHouseEdge || 0.15, // 15% maximum
            
            // Cooldown periods (milliseconds)
            majorChangeCooldown: config.majorChangeCooldown || 2 * 60 * 60 * 1000, // 2 hours
            gameSpecificCooldown: config.gameSpecificCooldown || 30 * 60 * 1000, // 30 minutes
            emergencyCooldown: config.emergencyCooldown || 15 * 60 * 1000, // 15 minutes
            
            // Impact thresholds
            lowImpactThreshold: 0.01, // 1% impact
            mediumImpactThreshold: 0.03, // 3% impact
            highImpactThreshold: 0.05, // 5% impact
            
            // Daily change budget
            dailyChangeBudget: config.maxDailyChangesBudget || 0.05, // 5% total economic impact per day
            
            // Stability requirements
            minStabilityScore: config.minStabilityScore || 0.7, // 70% stability required
            significanceThreshold: config.significanceThreshold || 0.02 // 2% minimum significance
        };
        
        // Tracking state
        this.dailyChanges = new Map(); // date -> changes
        this.gameLastChanged = new Map(); // game -> timestamp
        this.proposalHistory = [];
        this.emergencyMode = false;
        
        // Circuit breakers
        this.circuitBreakers = {
            consecutiveFailures: 0,
            maxConsecutiveFailures: 3,
            emergencyTriggered: false,
            lastEmergencyTime: null
        };
    }

    async initialize() {
        logger.info('Initializing GuardRailSystem...');
        
        // Load previous state
        await this.loadGuardRailState();
        
        // Clean up old tracking data
        this.cleanupOldData();
        
        logger.info('GuardRailSystem initialized with safety limits');
        return true;
    }

    /**
     * Validate a proposal against all guardrails
     */
    async validateProposal(proposal) {
        try {
            logger.info(`Validating proposal ${proposal.id}: ${proposal.title}`);
            
            const validation = {
                isValid: true,
                violations: [],
                warnings: [],
                riskLevel: 'low',
                approvalRequired: false
            };
            
            // Emergency mode check
            if (this.emergencyMode) {
                validation.isValid = false;
                validation.violations.push({
                    type: 'emergency_mode',
                    severity: 'critical',
                    message: 'System is in emergency mode - all proposals blocked'
                });
                return validation;
            }
            
            // Circuit breaker check
            if (this.circuitBreakers.emergencyTriggered) {
                const timeSinceEmergency = Date.now() - this.circuitBreakers.lastEmergencyTime;
                if (timeSinceEmergency < this.limits.emergencyCooldown) {
                    validation.isValid = false;
                    validation.violations.push({
                        type: 'circuit_breaker',
                        severity: 'critical',
                        message: `Circuit breaker active - ${Math.ceil((this.limits.emergencyCooldown - timeSinceEmergency) / 60000)} minutes remaining`
                    });
                    return validation;
                }
            }
            
            // Validate each action in the proposal
            for (const action of proposal.actions || []) {
                const actionValidation = await this.validateAction(action);
                
                if (!actionValidation.isValid) {
                    validation.isValid = false;
                    validation.violations.push(...actionValidation.violations);
                }
                
                validation.warnings.push(...actionValidation.warnings);
                
                // Update risk level
                if (actionValidation.riskLevel === 'high') {
                    validation.riskLevel = 'high';
                } else if (actionValidation.riskLevel === 'medium' && validation.riskLevel === 'low') {
                    validation.riskLevel = 'medium';
                }
            }
            
            // Check daily change budget
            const dailyBudgetCheck = this.checkDailyChangeBudget(proposal);
            if (!dailyBudgetCheck.withinBudget) {
                validation.isValid = false;
                validation.violations.push({
                    type: 'daily_budget_exceeded',
                    severity: 'high',
                    message: `Daily change budget exceeded: ${dailyBudgetCheck.usage.toFixed(2)}% used of ${(this.limits.dailyChangeBudget * 100).toFixed(2)}% limit`
                });
            }
            
            // Check stability requirements
            const stabilityCheck = await this.checkStabilityRequirements(proposal);
            if (!stabilityCheck.meetsRequirements) {
                validation.warnings.push({
                    type: 'stability_concern',
                    severity: 'medium',
                    message: `System stability below threshold: ${(stabilityCheck.currentStability * 100).toFixed(1)}%`
                });
                validation.approvalRequired = true;
            }
            
            // Determine approval requirement
            if (validation.riskLevel === 'high' || proposal.expectedImpact > this.limits.highImpactThreshold) {
                validation.approvalRequired = true;
            }
            
            // Check significance threshold
            if (proposal.expectedImpact < this.limits.significanceThreshold) {
                validation.warnings.push({
                    type: 'low_significance',
                    severity: 'low',
                    message: `Proposal impact (${(proposal.expectedImpact * 100).toFixed(2)}%) below significance threshold`
                });
            }
            
            await this.stateManager.saveState('guardrailValidation', {
                proposalId: proposal.id,
                validation,
                timestamp: new Date().toISOString()
            });
            
            return validation;
            
        } catch (error) {
            logger.error(`GuardRail validation failed: ${error.message}`);
            
            return {
                isValid: false,
                violations: [{
                    type: 'validation_error',
                    severity: 'critical',
                    message: `Validation system error: ${error.message}`
                }],
                warnings: [],
                riskLevel: 'high',
                approvalRequired: true
            };
        }
    }

    /**
     * Validate individual action against safety limits
     */
    async validateAction(action) {
        const validation = {
            isValid: true,
            violations: [],
            warnings: [],
            riskLevel: 'low'
        };
        
        try {
            // Parse adjustment value
            const adjustment = this.parseAdjustment(action.adjustment);
            const absAdjustment = Math.abs(adjustment);
            
            // Check single adjustment limit
            if (absAdjustment > this.limits.maxSingleAdjustment) {
                validation.isValid = false;
                validation.violations.push({
                    type: 'single_adjustment_limit',
                    severity: 'high',
                    message: `Adjustment ${(adjustment * 100).toFixed(2)}% exceeds single limit of ${(this.limits.maxSingleAdjustment * 100).toFixed(2)}%`,
                    action: action.id
                });
            }
            
            // Check cooldown periods
            const cooldownCheck = this.checkCooldown(action);
            if (!cooldownCheck.allowed) {
                validation.isValid = false;
                validation.violations.push({
                    type: 'cooldown_violation',
                    severity: 'medium',
                    message: `Cooldown period not met: ${Math.ceil(cooldownCheck.timeRemaining / 60000)} minutes remaining`,
                    action: action.id
                });
            }
            
            // Validate house edge boundaries
            if (action.action === 'adjust_house_edge') {
                const houseEdgeCheck = await this.validateHouseEdge(action.target, adjustment);
                if (!houseEdgeCheck.isValid) {
                    validation.isValid = false;
                    validation.violations.push(...houseEdgeCheck.violations);
                }
            }
            
            // Check cumulative daily changes
            const cumulativeCheck = this.checkCumulativeChanges(action);
            if (!cumulativeCheck.withinLimits) {
                validation.isValid = false;
                validation.violations.push({
                    type: 'cumulative_limit',
                    severity: 'high',
                    message: `Cumulative daily changes would exceed limit: ${(cumulativeCheck.newTotal * 100).toFixed(2)}%`,
                    action: action.id
                });
            }
            
            // Assess risk level
            if (absAdjustment > this.limits.highImpactThreshold) {
                validation.riskLevel = 'high';
            } else if (absAdjustment > this.limits.mediumImpactThreshold) {
                validation.riskLevel = 'medium';
            }
            
            // Add warnings for borderline cases
            if (absAdjustment > this.limits.maxSingleAdjustment * 0.8) {
                validation.warnings.push({
                    type: 'approaching_limit',
                    severity: 'medium',
                    message: `Adjustment approaching maximum limit`,
                    action: action.id
                });
            }
            
            return validation;
            
        } catch (error) {
            logger.error(`Action validation error: ${error.message}`);
            
            return {
                isValid: false,
                violations: [{
                    type: 'action_validation_error',
                    severity: 'critical',
                    message: `Action validation failed: ${error.message}`,
                    action: action.id
                }],
                warnings: [],
                riskLevel: 'high'
            };
        }
    }

    /**
     * Check daily change budget
     */
    checkDailyChangeBudget(proposal) {
        const today = new Date().toDateString();
        const todayChanges = this.dailyChanges.get(today) || [];
        
        let usedBudget = 0;
        for (const change of todayChanges) {
            usedBudget += Math.abs(change.impact || 0);
        }
        
        const proposalImpact = proposal.expectedImpact || 0;
        const totalUsage = usedBudget + proposalImpact;
        
        return {
            withinBudget: totalUsage <= this.limits.dailyChangeBudget,
            usage: (usedBudget / this.limits.dailyChangeBudget) * 100,
            remaining: this.limits.dailyChangeBudget - usedBudget,
            proposalImpact,
            wouldExceed: totalUsage > this.limits.dailyChangeBudget
        };
    }

    /**
     * Check system stability requirements
     */
    async checkStabilityRequirements(proposal) {
        try {
            // Get current system stability from state
            const stabilityState = await this.stateManager.loadState('systemStability');
            const currentStability = stabilityState?.stabilityScore || 1.0;
            
            const meetsRequirements = currentStability >= this.limits.minStabilityScore;
            
            return {
                meetsRequirements,
                currentStability,
                requiredStability: this.limits.minStabilityScore,
                stabilityMargin: currentStability - this.limits.minStabilityScore
            };
            
        } catch (error) {
            logger.error(`Stability check failed: ${error.message}`);
            
            // Conservative approach - assume stability is marginal
            return {
                meetsRequirements: false,
                currentStability: 0.6,
                requiredStability: this.limits.minStabilityScore,
                error: error.message
            };
        }
    }

    /**
     * Check cooldown periods for actions
     */
    checkCooldown(action) {
        const now = Date.now();
        const target = action.target || action.game || 'system';
        const lastChanged = this.gameLastChanged.get(target);
        
        if (!lastChanged) {
            return { allowed: true, timeRemaining: 0 };
        }
        
        const cooldownPeriod = this.getCooldownPeriod(action);
        const timeSinceChange = now - lastChanged;
        
        if (timeSinceChange < cooldownPeriod) {
            return {
                allowed: false,
                timeRemaining: cooldownPeriod - timeSinceChange
            };
        }
        
        return { allowed: true, timeRemaining: 0 };
    }

    /**
     * Get appropriate cooldown period for action
     */
    getCooldownPeriod(action) {
        const adjustment = Math.abs(this.parseAdjustment(action.adjustment));
        
        if (adjustment > this.limits.highImpactThreshold) {
            return this.limits.majorChangeCooldown;
        }
        
        return this.limits.gameSpecificCooldown;
    }

    /**
     * Validate house edge adjustments
     */
    async validateHouseEdge(game, adjustment) {
        const validation = {
            isValid: true,
            violations: []
        };
        
        try {
            // Get current house edge (would need integration with your game config)
            const currentHouseEdge = await this.getCurrentHouseEdge(game);
            const newHouseEdge = currentHouseEdge + adjustment;
            
            if (newHouseEdge < this.limits.minHouseEdge) {
                validation.isValid = false;
                validation.violations.push({
                    type: 'house_edge_too_low',
                    severity: 'high',
                    message: `House edge would be ${(newHouseEdge * 100).toFixed(2)}%, below minimum ${(this.limits.minHouseEdge * 100).toFixed(2)}%`
                });
            }
            
            if (newHouseEdge > this.limits.maxHouseEdge) {
                validation.isValid = false;
                validation.violations.push({
                    type: 'house_edge_too_high',
                    severity: 'high',
                    message: `House edge would be ${(newHouseEdge * 100).toFixed(2)}%, above maximum ${(this.limits.maxHouseEdge * 100).toFixed(2)}%`
                });
            }
            
            return validation;
            
        } catch (error) {
            logger.error(`House edge validation error: ${error.message}`);
            
            return {
                isValid: false,
                violations: [{
                    type: 'house_edge_validation_error',
                    severity: 'critical',
                    message: `Cannot validate house edge: ${error.message}`
                }]
            };
        }
    }

    /**
     * Check cumulative changes for the day
     */
    checkCumulativeChanges(action) {
        const today = new Date().toDateString();
        const todayChanges = this.dailyChanges.get(today) || [];
        
        const target = action.target || action.game || 'system';
        const adjustment = Math.abs(this.parseAdjustment(action.adjustment));
        
        // Sum all changes for this target today
        const targetChanges = todayChanges
            .filter(change => change.target === target)
            .reduce((sum, change) => sum + Math.abs(change.adjustment), 0);
        
        const newTotal = targetChanges + adjustment;
        
        return {
            withinLimits: newTotal <= this.limits.maxDailyAdjustment,
            currentTotal: targetChanges,
            newTotal,
            proposedChange: adjustment
        };
    }

    /**
     * Record proposal execution for tracking
     */
    async recordProposalExecution(proposal, results) {
        const today = new Date().toDateString();
        const todayChanges = this.dailyChanges.get(today) || [];
        
        // Record each action
        for (const action of proposal.actions || []) {
            const target = action.target || action.game || 'system';
            const adjustment = this.parseAdjustment(action.adjustment);
            
            todayChanges.push({
                proposalId: proposal.id,
                action: action.action,
                target,
                adjustment,
                impact: proposal.expectedImpact || 0,
                timestamp: Date.now(),
                result: results[action.id]
            });
            
            // Update last changed time
            this.gameLastChanged.set(target, Date.now());
        }
        
        this.dailyChanges.set(today, todayChanges);
        
        // Add to proposal history
        this.proposalHistory.push({
            proposal,
            results,
            timestamp: Date.now()
        });
        
        // Maintain history size
        if (this.proposalHistory.length > 100) {
            this.proposalHistory = this.proposalHistory.slice(-50);
        }
        
        // Save state
        await this.saveGuardRailState();
        
        logger.info(`Recorded proposal execution: ${proposal.id}`);
    }

    /**
     * Trigger emergency mode
     */
    async triggerEmergency(reason) {
        logger.error(`EMERGENCY TRIGGERED: ${reason}`);
        
        this.emergencyMode = true;
        this.circuitBreakers.emergencyTriggered = true;
        this.circuitBreakers.lastEmergencyTime = Date.now();
        this.circuitBreakers.consecutiveFailures++;
        
        await this.saveGuardRailState();
        
        this.emit('emergencyTriggered', reason);
    }

    /**
     * Reset emergency mode (admin action)
     */
    async resetEmergencyMode() {
        logger.info('Emergency mode reset by administrator');
        
        this.emergencyMode = false;
        this.circuitBreakers.emergencyTriggered = false;
        this.circuitBreakers.consecutiveFailures = 0;
        
        await this.saveGuardRailState();
        
        this.emit('emergencyReset');
    }

    /**
     * Parse adjustment string to numeric value
     */
    parseAdjustment(adjustmentStr) {
        if (typeof adjustmentStr === 'number') {
            return adjustmentStr;
        }
        
        if (typeof adjustmentStr === 'string') {
            const cleaned = adjustmentStr.replace(/[%]/g, '');
            const parsed = parseFloat(cleaned);
            
            if (!isNaN(parsed)) {
                return parsed / 100; // Convert percentage to decimal
            }
        }
        
        return 0;
    }

    /**
     * Get current house edge for a game (placeholder)
     */
    async getCurrentHouseEdge(game) {
        // TODO: Integrate with your game configuration system
        // This would query the current house edge from your game configs
        
        // Default house edges as fallback
        const defaults = {
            blackjack: 0.02,
            slots: 0.05,
            roulette: 0.027,
            crash: 0.01,
            plinko: 0.02
        };
        
        return defaults[game.toLowerCase()] || 0.03;
    }

    /**
     * Clean up old tracking data
     */
    cleanupOldData() {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const cutoffDate = oneWeekAgo.toDateString();
        
        // Clean up daily changes older than a week
        for (const [date, changes] of this.dailyChanges) {
            if (date < cutoffDate) {
                this.dailyChanges.delete(date);
            }
        }
        
        // Clean up old game change times (older than 24 hours)
        const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
        for (const [game, timestamp] of this.gameLastChanged) {
            if (timestamp < twentyFourHoursAgo) {
                this.gameLastChanged.delete(game);
            }
        }
    }

    /**
     * Save guardrail state
     */
    async saveGuardRailState() {
        try {
            const state = {
                dailyChanges: Array.from(this.dailyChanges.entries()),
                gameLastChanged: Array.from(this.gameLastChanged.entries()),
                emergencyMode: this.emergencyMode,
                circuitBreakers: this.circuitBreakers,
                timestamp: Date.now()
            };
            
            await this.stateManager.saveState('guardrails', state);
        } catch (error) {
            logger.error(`Failed to save guardrail state: ${error.message}`);
        }
    }

    /**
     * Load guardrail state
     */
    async loadGuardRailState() {
        try {
            const state = await this.stateManager.loadState('guardrails');
            if (state) {
                this.dailyChanges = new Map(state.dailyChanges || []);
                this.gameLastChanged = new Map(state.gameLastChanged || []);
                this.emergencyMode = state.emergencyMode || false;
                this.circuitBreakers = state.circuitBreakers || this.circuitBreakers;
                
                logger.info('GuardRail state loaded successfully');
            }
        } catch (error) {
            logger.error(`Failed to load guardrail state: ${error.message}`);
        }
    }

    /**
     * Get current guardrail status
     */
    getStatus() {
        const today = new Date().toDateString();
        const todayChanges = this.dailyChanges.get(today) || [];
        const budgetUsed = todayChanges.reduce((sum, change) => sum + Math.abs(change.impact || 0), 0);
        
        return {
            emergencyMode: this.emergencyMode,
            circuitBreakerActive: this.circuitBreakers.emergencyTriggered,
            dailyBudgetUsed: (budgetUsed / this.limits.dailyChangeBudget) * 100,
            dailyChangesCount: todayChanges.length,
            activeGames: this.gameLastChanged.size,
            proposalHistorySize: this.proposalHistory.length,
            limits: this.limits
        };
    }

    /**
     * Update guardrail configuration
     */
    updateLimits(newLimits) {
        this.limits = { ...this.limits, ...newLimits };
        logger.info('GuardRail limits updated');
        
        this.emit('limitsUpdated', this.limits);
    }
}

module.exports = GuardRailSystem;