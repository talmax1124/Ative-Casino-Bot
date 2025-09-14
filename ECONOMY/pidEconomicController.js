/**
 * PID ECONOMIC CONTROLLER
 * Proportional-Integral-Derivative controller for economic stability
 * Maintains economic equilibrium through automated feedback control
 */

const logger = require('../UTILS/logger');
const MathUtils = require('./mathematicalFoundations');

class PIDEconomicController {
    constructor() {
        this.controlParameters = {
            // Primary economic targets
            INFLATION_TARGET: 0.02,          // 2% inflation target
            UNEMPLOYMENT_TARGET: 0.05,       // 5% unemployment target  
            GINI_TARGET: 0.4,               // Gini coefficient target
            LIQUIDITY_TARGET: 0.3,          // 30% liquidity ratio target
            GROWTH_TARGET: 0.03,            // 3% economic growth target
            
            // PID Controller gains (tuned for stability)
            KP: 0.8,    // Proportional gain
            KI: 0.3,    // Integral gain  
            KD: 0.1,    // Derivative gain
            
            // Controller limits
            OUTPUT_MIN: -0.5,   // Minimum control output (-50%)
            OUTPUT_MAX: 0.5,    // Maximum control output (+50%)
            INTEGRAL_WINDUP_LIMIT: 1.0,
            
            // Sample time
            SAMPLE_TIME: 300000, // 5 minutes in milliseconds
        };
        
        // PID state variables
        this.pidState = new Map();
        this.economicHistory = [];
        this.controlOutputHistory = [];
        
        // Advanced control features
        this.adaptiveGainScheduler = new AdaptiveGainScheduler();
        this.nonlinearController = new NonlinearController();
        this.predictiveController = new ModelPredictiveController();
        
        this.initializePIDControllers();
    }

    /**
     * MASTER ECONOMIC CONTROL LOOP
     * Main PID control function that maintains economic stability
     */
    async executeControlLoop() {
        const controlStart = Date.now();
        
        try {
            // Measure current economic state
            const currentState = await this.measureEconomicState();
            
            // Calculate control outputs for each economic variable
            const controlOutputs = new Map();
            
            // Inflation control
            controlOutputs.set('inflation', await this.calculateInflationControl(currentState));
            
            // Unemployment control  
            controlOutputs.set('unemployment', await this.calculateUnemploymentControl(currentState));
            
            // Wealth distribution control
            controlOutputs.set('inequality', await this.calculateInequalityControl(currentState));
            
            // Liquidity control
            controlOutputs.set('liquidity', await this.calculateLiquidityControl(currentState));
            
            // Growth control
            controlOutputs.set('growth', await this.calculateGrowthControl(currentState));
            
            // Apply advanced control techniques
            const enhancedOutputs = await this.applyAdvancedControl(controlOutputs, currentState);
            
            // Execute control actions
            const executionResult = await this.executeControlActions(enhancedOutputs, currentState);
            
            // Update controller state
            this.updateControllerState(currentState, enhancedOutputs, executionResult);
            
            const controlTime = Date.now() - controlStart;
            
            logger.info('PID Economic Control Loop completed', {
                controlTime,
                inflationError: currentState.inflation - this.controlParameters.INFLATION_TARGET,
                giniError: currentState.gini - this.controlParameters.GINI_TARGET,
                liquidityError: currentState.liquidity - this.controlParameters.LIQUIDITY_TARGET,
                controlOutputs: Array.from(controlOutputs.entries()).reduce((obj, [key, value]) => {
                    obj[key] = value.output;
                    return obj;
                }, {})
            });
            
            return {
                timestamp: Date.now(),
                currentState,
                controlOutputs: enhancedOutputs,
                executionResult,
                performance: {
                    controlTime,
                    stability: this.calculateStabilityMetric(currentState),
                    efficiency: this.calculateControlEfficiency(enhancedOutputs, executionResult)
                },
                recommendations: this.generateControlRecommendations(currentState, enhancedOutputs)
            };
            
        } catch (error) {
            logger.error(`PID Economic Control failed: ${error.message}`);
            return this.executeEmergencyControl();
        }
    }

    /**
     * INFLATION PID CONTROLLER
     * Controls inflation rate using money supply adjustments
     */
    async calculateInflationControl(currentState) {
        const target = this.controlParameters.INFLATION_TARGET;
        const actual = currentState.inflation;
        const error = target - actual;
        
        const pidOutput = this.calculatePIDOutput('inflation', error, Date.now());
        
        // Convert PID output to monetary policy actions
        const monetaryActions = this.translateInflationControlOutput(pidOutput, error);
        
        return {
            target,
            actual,
            error,
            pidOutput,
            output: pidOutput.output,
            actions: monetaryActions,
            reasoning: this.generateInflationControlReasoning(error, pidOutput, monetaryActions)
        };
    }

    /**
     * INEQUALITY PID CONTROLLER  
     * Controls wealth inequality through progressive taxation and redistribution
     */
    async calculateInequalityControl(currentState) {
        const target = this.controlParameters.GINI_TARGET;
        const actual = currentState && currentState.gini !== undefined ? currentState.gini : 0.5;
        const error = target - actual;
        
        const pidOutput = this.calculatePIDOutput('inequality', error, Date.now());
        
        // Convert PID output to redistribution policies
        const redistributionActions = this.translateInequalityControlOutput(pidOutput, error, currentState);
        
        return {
            target,
            actual,
            error,
            pidOutput,
            output: pidOutput.output,
            actions: redistributionActions,
            reasoning: this.generateInequalityControlReasoning(error, pidOutput, redistributionActions)
        };
    }

    /**
     * LIQUIDITY PID CONTROLLER
     * Controls system liquidity through interest rates and incentives
     */
    async calculateLiquidityControl(currentState) {
        const target = this.controlParameters.LIQUIDITY_TARGET;
        const actual = currentState.liquidity;
        const error = target - actual;
        
        const pidOutput = this.calculatePIDOutput('liquidity', error, Date.now());
        
        // Convert PID output to liquidity management actions
        const liquidityActions = this.translateLiquidityControlOutput(pidOutput, error, currentState);
        
        return {
            target,
            actual,
            error,
            pidOutput,  
            output: pidOutput.output,
            actions: liquidityActions,
            reasoning: this.generateLiquidityControlReasoning(error, pidOutput, liquidityActions)
        };
    }

    /**
     * CORE PID CALCULATION
     * Implements the PID algorithm with advanced features
     */
    calculatePIDOutput(variable, error, timestamp) {
        const state = this.getPIDState(variable);
        const dt = (timestamp - state.lastUpdate) / 1000; // Convert to seconds
        
        if (dt <= 0) {
            return state.lastOutput || { output: 0, p: 0, i: 0, d: 0 };
        }
        
        // Proportional term
        const proportional = this.controlParameters.KP * error;
        
        // Integral term with windup protection (safe calculation)
        const integralSum = state.integralSum || 0;
        let integral = integralSum + (error * Math.max(dt, 0));
        integral = Math.max(-this.controlParameters.INTEGRAL_WINDUP_LIMIT, 
                           Math.min(this.controlParameters.INTEGRAL_WINDUP_LIMIT, integral));
        const integralTerm = this.controlParameters.KI * integral;
        
        // Derivative term with filtering (safe division)
        const derivative = (dt > 0 && state.lastError !== undefined) ? (error - state.lastError) / dt : 0;
        const filteredDerivative = this.applyDerivativeFilter(derivative, state.derivativeHistory);
        const derivativeTerm = this.controlParameters.KD * filteredDerivative;
        
        // Calculate total output
        let output = proportional + integralTerm + derivativeTerm;
        
        // Apply output limits
        output = Math.max(this.controlParameters.OUTPUT_MIN, 
                         Math.min(this.controlParameters.OUTPUT_MAX, output));
        
        // Update state
        this.updatePIDState(variable, {
            lastError: error,
            lastUpdate: timestamp,
            integralSum: integral,
            derivativeHistory: [...state.derivativeHistory.slice(-4), filteredDerivative],
            lastOutput: { output, p: proportional, i: integralTerm, d: derivativeTerm }
        });
        
        return { output, p: proportional, i: integralTerm, d: derivativeTerm };
    }

    /**
     * ADAPTIVE GAIN SCHEDULING
     * Adjusts PID gains based on operating conditions
     */
    async applyAdaptiveGainScheduling(controlOutputs, currentState) {
        const adaptedOutputs = new Map();
        
        for (const [variable, control] of controlOutputs) {
            const operatingPoint = this.determineOperatingPoint(variable, currentState);
            const adaptedGains = this.adaptiveGainScheduler.calculateAdaptedGains(
                variable, 
                operatingPoint, 
                currentState
            );
            
            // Recalculate with adapted gains
            const adaptedControl = this.recalculateWithAdaptedGains(control, adaptedGains);
            
            adaptedOutputs.set(variable, {
                ...control,
                adaptedOutput: adaptedControl,
                adaptedGains,
                operatingPoint
            });
        }
        
        return adaptedOutputs;
    }

    /**
     * MODEL PREDICTIVE CONTROL
     * Advanced predictive control overlay
     */
    async applyModelPredictiveControl(controlOutputs, currentState) {
        const horizon = 10; // 10-step prediction horizon
        const predictedStates = await this.predictiveController.predictFutureStates(
            currentState, 
            controlOutputs, 
            horizon
        );
        
        const optimizedControls = await this.predictiveController.optimizeControlSequence(
            currentState,
            predictedStates,
            this.getControlConstraints(),
            this.getOptimizationObjective()
        );
        
        return optimizedControls;
    }

    /**
     * NONLINEAR CONTROL COMPENSATION
     * Handles nonlinear economic dynamics
     */
    async applyNonlinearControl(controlOutputs, currentState) {
        const compensatedOutputs = new Map();
        
        for (const [variable, control] of controlOutputs) {
            const nonlinearCompensation = this.nonlinearController.calculateCompensation(
                variable,
                control,
                currentState
            );
            
            compensatedOutputs.set(variable, {
                ...control,
                linearOutput: control.output,
                nonlinearCompensation,
                compensatedOutput: control.output + nonlinearCompensation.adjustment
            });
        }
        
        return compensatedOutputs;
    }

    /**
     * CONTROL ACTION EXECUTION
     * Translates control outputs into concrete economic actions
     */
    async executeControlActions(controlOutputs, currentState) {
        const executionResults = new Map();
        
        for (const [variable, control] of controlOutputs) {
            try {
                const actions = await this.executeVariableControl(variable, control, currentState);
                executionResults.set(variable, {
                    success: true,
                    actions,
                    expectedImpact: actions.expectedImpact,
                    timeline: actions.timeline
                });
                
            } catch (error) {
                logger.error(`Control execution failed for ${variable}: ${error.message}`);
                executionResults.set(variable, {
                    success: false,
                    error: error.message,
                    fallbackAction: this.getFallbackAction(variable, control)
                });
            }
        }
        
        return {
            results: executionResults,
            overallSuccess: Array.from(executionResults.values()).every(r => r.success),
            executionTime: Date.now(),
            coordinatedActions: this.coordinateActions(executionResults)
        };
    }

    async executeVariableControl(variable, control, currentState) {
        switch (variable) {
            case 'inflation':
                return await this.executeInflationActions(control.actions, currentState);
                
            case 'inequality':
                return await this.executeInequalityActions(control.actions, currentState);
                
            case 'liquidity':
                return await this.executeLiquidityActions(control.actions, currentState);
                
            case 'unemployment':
                return await this.executeUnemploymentActions(control.actions, currentState);
                
            case 'growth':
                return await this.executeGrowthActions(control.actions, currentState);
                
            default:
                throw new Error(`Unknown control variable: ${variable}`);
        }
    }

    /**
     * INFLATION CONTROL ACTIONS
     * Implements monetary policy through multiplier and fee adjustments
     */
    async executeInflationActions(actions, currentState) {
        const implementedActions = [];
        
        if (actions.adjustMultipliers) {
            const multiplierAdjustment = await this.adjustSystemMultipliers(
                actions.multiplierChange,
                'inflation_control'
            );
            implementedActions.push({
                type: 'MULTIPLIER_ADJUSTMENT',
                change: actions.multiplierChange,
                affectedGames: multiplierAdjustment.affectedGames,
                expectedInflationImpact: multiplierAdjustment.expectedInflationImpact
            });
        }
        
        if (actions.adjustFees) {
            const feeAdjustment = await this.adjustTransactionFees(
                actions.feeChange,
                'inflation_control'
            );
            implementedActions.push({
                type: 'FEE_ADJUSTMENT',
                change: actions.feeChange,
                expectedInflationImpact: feeAdjustment.expectedInflationImpact
            });
        }
        
        if (actions.adjustLiquidity) {
            const liquidityAdjustment = await this.adjustSystemLiquidity(
                actions.liquidityChange,
                'inflation_control'
            );
            implementedActions.push({
                type: 'LIQUIDITY_ADJUSTMENT',
                change: actions.liquidityChange,
                method: liquidityAdjustment.method,
                expectedInflationImpact: liquidityAdjustment.expectedInflationImpact
            });
        }
        
        return {
            actions: implementedActions,
            expectedImpact: this.calculateCombinedInflationImpact(implementedActions),
            timeline: this.calculateActionTimeline(implementedActions),
            reversible: true
        };
    }

    /**
     * INEQUALITY CONTROL ACTIONS  
     * Implements redistribution through progressive taxation
     */
    async executeInequalityActions(actions, currentState) {
        const implementedActions = [];
        
        if (actions.adjustTaxRates) {
            const taxAdjustment = await this.adjustProgressiveTaxRates(
                actions.taxRateChanges,
                'inequality_control'
            );
            implementedActions.push({
                type: 'TAX_RATE_ADJUSTMENT',
                changes: actions.taxRateChanges,
                affectedPlayers: taxAdjustment.affectedPlayers,
                expectedGiniImpact: taxAdjustment.expectedGiniImpact
            });
        }
        
        if (actions.redistributeWealth) {
            const redistribution = await this.executeWealthRedistribution(
                actions.redistributionPlan,
                'inequality_control'
            );
            implementedActions.push({
                type: 'WEALTH_REDISTRIBUTION',
                plan: actions.redistributionPlan,
                transferAmount: redistribution.transferAmount,
                expectedGiniImpact: redistribution.expectedGiniImpact
            });
        }
        
        if (actions.adjustMinimumIncome) {
            const incomeAdjustment = await this.adjustUniversalBasicIncome(
                actions.incomeChange,
                'inequality_control'
            );
            implementedActions.push({
                type: 'MINIMUM_INCOME_ADJUSTMENT',
                change: actions.incomeChange,
                affectedPlayers: incomeAdjustment.affectedPlayers,
                expectedGiniImpact: incomeAdjustment.expectedGiniImpact
            });
        }
        
        return {
            actions: implementedActions,
            expectedImpact: this.calculateCombinedInequalityImpact(implementedActions),
            timeline: this.calculateActionTimeline(implementedActions),
            reversible: false // Redistribution actions are typically irreversible
        };
    }

    // Utility Methods

    initializePIDControllers() {
        const variables = ['inflation', 'unemployment', 'inequality', 'liquidity', 'growth'];
        variables.forEach(variable => {
            this.pidState.set(variable, {
                lastError: 0,
                lastUpdate: Date.now(),
                integralSum: 0,
                derivativeHistory: [0, 0, 0, 0, 0],
                lastOutput: null
            });
        });
    }

    getPIDState(variable) {
        return this.pidState.get(variable) || {
            lastError: 0,
            lastUpdate: Date.now(),
            integralSum: 0,
            derivativeHistory: [0, 0, 0, 0, 0],
            lastOutput: null
        };
    }

    updatePIDState(variable, newState) {
        const currentState = this.getPIDState(variable);
        this.pidState.set(variable, { ...currentState, ...newState });
    }

    applyDerivativeFilter(derivative, history) {
        // Simple moving average filter to reduce noise
        const filterWindow = [...history, derivative];
        return filterWindow.reduce((sum, val) => sum + val, 0) / filterWindow.length;
    }

    async measureEconomicState() {
        // This would interface with your entropy analyzer and other systems
        return {
            inflation: await this.measureInflationRate(),
            unemployment: await this.measureUnemploymentRate(),
            gini: await this.measureGiniCoefficient(),
            liquidity: await this.measureLiquidityRatio(),
            growth: await this.measureGrowthRate(),
            timestamp: Date.now()
        };
    }

    translateInflationControlOutput(pidOutput, error) {
        const output = pidOutput.output;
        const absOutput = Math.abs(output);
        
        return {
            adjustMultipliers: absOutput > 0.1,
            multiplierChange: -output * 0.1, // Inverse relationship
            adjustFees: absOutput > 0.05,
            feeChange: output * 0.05,
            adjustLiquidity: absOutput > 0.15,
            liquidityChange: -output * 0.2,
            urgency: absOutput > 0.3 ? 'HIGH' : absOutput > 0.1 ? 'MEDIUM' : 'LOW'
        };
    }

    generateInflationControlReasoning(error, pidOutput, actions) {
        const errorPercent = (error * 100).toFixed(2);
        const target = (this.controlParameters.INFLATION_TARGET * 100).toFixed(1);
        
        let reasoning = `Inflation is ${error > 0 ? 'below' : 'above'} target by ${Math.abs(errorPercent)}% (target: ${target}%). `;
        
        if (actions.adjustMultipliers) {
            reasoning += `Adjusting game multipliers by ${(actions.multiplierChange * 100).toFixed(2)}% to ${error > 0 ? 'stimulate' : 'cool'} the economy. `;
        }
        
        if (actions.adjustFees) {
            reasoning += `Adjusting transaction fees by ${(actions.feeChange * 100).toFixed(2)}% to control money velocity. `;
        }
        
        reasoning += `PID components: P=${pidOutput.p.toFixed(3)}, I=${pidOutput.i.toFixed(3)}, D=${pidOutput.d.toFixed(3)}`;
        
        return reasoning;
    }
}

/**
 * ADAPTIVE GAIN SCHEDULER
 * Adjusts PID gains based on operating conditions
 */
class AdaptiveGainScheduler {
    calculateAdaptedGains(variable, operatingPoint, currentState) {
        const baseGains = this.getBaseGains(variable);
        const adaptationFactor = this.calculateAdaptationFactor(operatingPoint, currentState);
        
        return {
            kp: baseGains.kp * adaptationFactor.proportional,
            ki: baseGains.ki * adaptationFactor.integral,
            kd: baseGains.kd * adaptationFactor.derivative,
            adaptationReasoning: adaptationFactor.reasoning
        };
    }

    calculateAdaptationFactor(operatingPoint, currentState) {
        // Adapt gains based on economic volatility and stability
        const volatility = this.calculateSystemVolatility(currentState);
        const stability = this.calculateSystemStability(currentState);
        
        let proportionalFactor = 1.0;
        let integralFactor = 1.0;
        let derivativeFactor = 1.0;
        
        // High volatility: reduce proportional gain, increase derivative
        if (volatility > 0.5) {
            proportionalFactor *= 0.7;
            derivativeFactor *= 1.3;
        }
        
        // Low stability: reduce integral gain to prevent overshoot
        if (stability < 0.5) {
            integralFactor *= 0.5;
        }
        
        return {
            proportional: proportionalFactor,
            integral: integralFactor,
            derivative: derivativeFactor,
            reasoning: `Adapted for volatility=${volatility.toFixed(2)}, stability=${stability.toFixed(2)}`
        };
    }
}

/**
 * MODEL PREDICTIVE CONTROLLER
 * Advanced predictive control for economic systems
 */
class ModelPredictiveController {
    async predictFutureStates(currentState, controlInputs, horizon) {
        const predictions = [];
        let state = { ...currentState };
        
        for (let step = 0; step < horizon; step++) {
            // Use economic model to predict next state
            const nextState = await this.economicModel.predictNextState(state, controlInputs, step);
            predictions.push(nextState);
            state = nextState;
        }
        
        return predictions;
    }

    async optimizeControlSequence(currentState, predictions, constraints, objective) {
        // Implement quadratic programming or other optimization
        // to find optimal control sequence over prediction horizon
        
        const optimizedSequence = await this.quadraticProgrammingSolver.solve({
            currentState,
            predictions,
            constraints,
            objective,
            horizon: predictions.length
        });
        
        return optimizedSequence;
    }
}

/**
 * NONLINEAR CONTROLLER
 * Handles nonlinear economic dynamics
 */
class NonlinearController {
    calculateCompensation(variable, linearControl, currentState) {
        const nonlinearity = this.detectNonlinearity(variable, currentState);
        
        if (nonlinearity.strength < 0.3) {
            return { adjustment: 0, reasoning: 'Linear control sufficient' };
        }
        
        // Calculate nonlinear compensation
        const compensation = this.calculateNonlinearCompensation(
            linearControl,
            nonlinearity,
            currentState
        );
        
        return {
            adjustment: compensation.adjustment,
            reasoning: compensation.reasoning,
            nonlinearity: nonlinearity
        };
    }

    detectNonlinearity(variable, currentState) {
        // Detect nonlinear behavior in economic variables
        const historicalData = this.getHistoricalData(variable);
        const linearityTest = this.performLinearityTest(historicalData);
        
        return {
            strength: linearityTest.nonlinearityStrength,
            type: linearityTest.nonlinearityType,
            confidence: linearityTest.confidence
        };
    }
}

module.exports = PIDEconomicController;