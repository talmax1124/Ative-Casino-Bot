/**
 * NASH EQUILIBRIUM GAME BALANCER
 * Advanced game theory implementation for casino game balance
 * Ensures no single strategy dominates using mathematical equilibrium analysis
 */

const logger = require('../UTILS/logger');
const dbManager = require('../UTILS/database');
const MathUtils = require('./mathematicalFoundations');

class NashEquilibriumGameBalancer {
    constructor() {
        this.gameStrategies = new Map();
        this.payoffMatrices = new Map();
        this.equilibriumSolutions = new Map();
        this.strategicStabilityAnalyzer = new StrategicStabilityAnalyzer();
        this.gameTheoryOptimizer = new GameTheoryOptimizer();
        
        // Game balance parameters
        this.balanceTargets = {
            HOUSE_EDGE_TARGET: 0.05,        // 5% target house edge
            STRATEGY_DIVERSITY_MIN: 0.7,     // Minimum strategy diversity index
            PAYOFF_VARIANCE_MAX: 0.3,        // Maximum acceptable payoff variance
            DOMINANT_STRATEGY_THRESHOLD: 0.8  // Threshold for strategy dominance detection
        };
    }

    /**
     * COMPREHENSIVE GAME BALANCE ANALYSIS
     * Analyzes all games for Nash equilibrium and strategic balance
     */
    async analyzeGameBalance() {
        const games = await this.getAllGameTypes();
        const balanceAnalysis = new Map();

        for (const gameType of games) {
            try {
                const gameAnalysis = await this.analyzeGameEquilibrium(gameType);
                balanceAnalysis.set(gameType, gameAnalysis);
                
                logger.debug(`Nash equilibrium analysis completed for ${gameType}`, {
                    equilibriumCount: gameAnalysis.equilibria.length,
                    stabilityScore: gameAnalysis.stability.score,
                    dominanceRisk: gameAnalysis.dominance.riskLevel
                });
                
            } catch (error) {
                logger.error(`Game balance analysis failed for ${gameType}: ${error.message}`);
                balanceAnalysis.set(gameType, this.getFailsafeBalance(gameType));
            }
        }

        // System-wide equilibrium analysis
        const systemEquilibrium = this.calculateSystemWideEquilibrium(balanceAnalysis);
        
        return {
            gameAnalyses: balanceAnalysis,
            systemEquilibrium,
            rebalanceRecommendations: this.generateRebalanceRecommendations(balanceAnalysis, systemEquilibrium),
            stabilityMetrics: this.calculateSystemStability(balanceAnalysis)
        };
    }

    /**
     * GAME-SPECIFIC NASH EQUILIBRIUM ANALYSIS
     * Analyzes individual game for strategic balance
     */
    async analyzeGameEquilibrium(gameType) {
        // Get historical player strategy data
        const playerStrategies = await this.getPlayerStrategies(gameType);
        const houseStrategies = await this.getHouseStrategies(gameType);
        
        // Construct payoff matrix
        const payoffMatrix = this.constructPayoffMatrix(playerStrategies, houseStrategies, gameType);
        
        // Find Nash equilibria using multiple methods
        const equilibria = await this.findNashEquilibria(payoffMatrix, gameType);
        
        // Analyze strategic stability
        const stability = this.analyzeStrategicStability(equilibria, payoffMatrix);
        
        // Check for dominant strategies
        const dominanceAnalysis = this.analyzeDominantStrategies(payoffMatrix, playerStrategies);
        
        // Calculate strategy diversity
        const diversityMetrics = this.calculateStrategyDiversity(playerStrategies);
        
        // Evolutionary stability analysis
        const evolutionaryStability = this.analyzeEvolutionaryStability(equilibria, payoffMatrix);
        
        return {
            gameType,
            payoffMatrix,
            equilibria,
            stability,
            dominance: dominanceAnalysis,
            diversity: diversityMetrics,
            evolutionary: evolutionaryStability,
            balanceScore: this.calculateGameBalanceScore(stability, dominanceAnalysis, diversityMetrics),
            recommendations: this.generateGameRecommendations(gameType, stability, dominanceAnalysis)
        };
    }

    /**
     * PAYOFF MATRIX CONSTRUCTION
     * Creates comprehensive payoff matrices for game theory analysis
     */
    constructPayoffMatrix(playerStrategies, houseStrategies, gameType) {
        const matrix = {
            players: playerStrategies.map(s => s.strategyId),
            house: houseStrategies.map(s => s.strategyId),
            payoffs: new Map()
        };

        // Calculate payoffs for each strategy combination
        playerStrategies.forEach((playerStrategy, i) => {
            houseStrategies.forEach((houseStrategy, j) => {
                const key = `${i}-${j}`;
                const payoff = this.calculateStrategyPayoff(
                    playerStrategy, 
                    houseStrategy, 
                    gameType
                );
                
                matrix.payoffs.set(key, {
                    player: payoff.playerPayoff,
                    house: payoff.housePayoff,
                    total: payoff.playerPayoff + payoff.housePayoff,
                    efficiency: payoff.efficiency,
                    risk: payoff.risk
                });
            });
        });

        // Enhanced matrix with strategic information
        matrix.dominanceInfo = this.analyzeDominanceRelations(matrix);
        matrix.paretoFrontier = this.calculateParetoFrontier(matrix);
        matrix.coreAllocations = this.calculateCore(matrix);
        
        return matrix;
    }

    /**
     * NASH EQUILIBRIUM SOLVER
     * Multiple algorithms to find Nash equilibria
     */
    async findNashEquilibria(payoffMatrix, gameType) {
        const equilibria = [];

        // Method 1: Pure Strategy Nash Equilibria
        const pureEquilibria = this.findPureStrategyEquilibria(payoffMatrix);
        equilibria.push(...pureEquilibria);

        // Method 2: Mixed Strategy Nash Equilibria (Lemke-Howson algorithm)
        const mixedEquilibria = this.lemkeHowsonAlgorithm(payoffMatrix);
        equilibria.push(...mixedEquilibria);

        // Method 3: Evolutionary Stable Strategies
        const evolutionaryEquilibria = this.findEvolutionaryStableStrategies(payoffMatrix);
        equilibria.push(...evolutionaryEquilibria);

        // Method 4: Correlated Equilibria
        const correlatedEquilibria = this.findCorrelatedEquilibria(payoffMatrix);
        equilibria.push(...correlatedEquilibria);

        // Verify and classify equilibria
        const verifiedEquilibria = equilibria.map(eq => this.verifyEquilibrium(eq, payoffMatrix));
        
        return {
            pure: pureEquilibria,
            mixed: mixedEquilibria,
            evolutionary: evolutionaryEquilibria,
            correlated: correlatedEquilibria,
            all: verifiedEquilibria,
            count: verifiedEquilibria.length,
            uniqueness: this.analyzeEquilibriumUniqueness(verifiedEquilibria)
        };
    }

    /**
     * PURE STRATEGY NASH EQUILIBRIUM FINDER
     * Identifies pure strategy Nash equilibria
     */
    findPureStrategyEquilibria(payoffMatrix) {
        const equilibria = [];
        const { players, house, payoffs } = payoffMatrix;

        players.forEach((playerStrategy, i) => {
            house.forEach((houseStrategy, j) => {
                if (this.isPureNashEquilibrium(i, j, payoffMatrix)) {
                    const equilibrium = {
                        type: 'PURE',
                        playerStrategy: { index: i, id: playerStrategy },
                        houseStrategy: { index: j, id: houseStrategy },
                        payoff: payoffs.get(`${i}-${j}`),
                        stability: this.calculateEquilibriumStability(i, j, payoffMatrix),
                        socialWelfare: this.calculateSocialWelfare(i, j, payoffMatrix)
                    };
                    equilibria.push(equilibrium);
                }
            });
        });

        return equilibria;
    }

    /**
     * LEMKE-HOWSON ALGORITHM
     * Advanced algorithm for finding mixed strategy Nash equilibria
     */
    lemkeHowsonAlgorithm(payoffMatrix) {
        const mixedEquilibria = [];
        
        try {
            // Convert payoff matrix to standard form
            const standardForm = this.convertToStandardForm(payoffMatrix);
            
            // Initialize complementary slackness conditions
            const tableau = this.initializeTableau(standardForm);
            
            // Lemke-Howson pivoting
            let currentTableau = tableau;
            let iteration = 0;
            const maxIterations = 1000;
            
            while (!this.isEquilibriumFound(currentTableau) && iteration < maxIterations) {
                const pivotResult = this.performLemkePivot(currentTableau);
                currentTableau = pivotResult.tableau;
                
                if (pivotResult.equilibriumFound) {
                    const mixedStrategy = this.extractMixedStrategy(currentTableau);
                    mixedEquilibria.push({
                        type: 'MIXED',
                        playerMixedStrategy: mixedStrategy.player,
                        houseMixedStrategy: mixedStrategy.house,
                        expectedPayoff: this.calculateExpectedPayoff(mixedStrategy, payoffMatrix),
                        support: this.calculateSupport(mixedStrategy),
                        stability: this.analyzeMixedStrategyStability(mixedStrategy, payoffMatrix)
                    });
                }
                
                iteration++;
            }
            
            if (iteration >= maxIterations) {
                logger.warn('Lemke-Howson algorithm reached maximum iterations');
            }
            
        } catch (error) {
            logger.error(`Lemke-Howson algorithm failed: ${error.message}`);
        }
        
        return mixedEquilibria;
    }

    /**
     * EVOLUTIONARY STABLE STRATEGY ANALYSIS
     * Finds evolutionarily stable strategies (ESS)
     */
    findEvolutionaryStableStrategies(payoffMatrix) {
        const essStrategies = [];
        
        // Replicator dynamics simulation
        const replicatorDynamics = this.simulateReplicatorDynamics(payoffMatrix);
        
        // Find stable fixed points
        const stablePoints = replicatorDynamics.stablePoints;
        
        stablePoints.forEach(point => {
            if (this.verifyEvolutionaryStability(point, payoffMatrix)) {
                essStrategies.push({
                    type: 'EVOLUTIONARY',
                    strategy: point.strategy,
                    stability: point.stability,
                    invasionResistance: this.calculateInvasionResistance(point, payoffMatrix),
                    convergenceRate: point.convergenceRate
                });
            }
        });
        
        return essStrategies;
    }

    /**
     * REPLICATOR DYNAMICS SIMULATION
     * Simulates evolutionary dynamics of strategies
     */
    simulateReplicatorDynamics(payoffMatrix) {
        const timeSteps = 10000;
        const dt = 0.01;
        const strategyCounts = payoffMatrix.players.length;
        
        // Initialize random population
        let population = this.initializeRandomPopulation(strategyCounts);
        const trajectory = [population.slice()];
        
        for (let t = 0; t < timeSteps; t++) {
            // Calculate fitness for each strategy
            const fitness = this.calculateStrategyFitness(population, payoffMatrix);
            const averageFitness = fitness.reduce((sum, f) => sum + f, 0) / fitness.length;
            
            // Update population using replicator equation
            // dx_i/dt = x_i * (f_i - f_avg)
            const newPopulation = population.map((x_i, i) => {
                const growth = x_i * (fitness[i] - averageFitness);
                return Math.max(0, x_i + growth * dt);
            });
            
            // Normalize population
            const totalPop = newPopulation.reduce((sum, x) => sum + x, 0);
            population = newPopulation.map(x => x / totalPop);
            
            trajectory.push(population.slice());
            
            // Check for convergence
            if (this.checkConvergence(population, trajectory[trajectory.length - 10], 1e-6)) {
                break;
            }
        }
        
        return {
            trajectory,
            finalState: population,
            stablePoints: this.identifyStablePoints(trajectory),
            convergenceTime: trajectory.length * dt
        };
    }

    /**
     * STRATEGY DIVERSITY CALCULATION
     * Measures how diverse player strategies are
     */
    calculateStrategyDiversity(playerStrategies) {
        if (playerStrategies.length === 0) return { diversity: 0, interpretation: 'NO_STRATEGIES' };
        
        // Calculate strategy usage distribution
        const strategyUsage = new Map();
        let totalUsage = 0;
        
        playerStrategies.forEach(strategy => {
            const usage = strategy.usageCount || 1;
            strategyUsage.set(strategy.strategyId, usage);
            totalUsage += usage;
        });
        
        // Shannon diversity index
        const shannonDiversity = -Array.from(strategyUsage.values()).reduce((sum, usage) => {
            const probability = usage / totalUsage;
            return probability > 0 ? sum + (probability * Math.log2(probability)) : sum;
        }, 0);
        
        // Normalize by maximum possible diversity
        const maxDiversity = Math.log2(strategyUsage.size);
        const normalizedDiversity = maxDiversity > 0 ? shannonDiversity / maxDiversity : 0;
        
        // Simpson's diversity index
        const simpsonIndex = 1 - Array.from(strategyUsage.values()).reduce((sum, usage) => {
            const probability = usage / totalUsage;
            return sum + (probability * probability);
        }, 0);
        
        // Pielou's evenness index
        const pielouEvenness = maxDiversity > 0 ? shannonDiversity / maxDiversity : 0;
        
        return {
            shannon: shannonDiversity,
            normalized: normalizedDiversity,
            simpson: simpsonIndex,
            evenness: pielouEvenness,
            strategyCount: strategyUsage.size,
            dominantStrategy: this.findDominantStrategy(strategyUsage),
            interpretation: this.interpretDiversity(normalizedDiversity),
            recommendations: this.generateDiversityRecommendations(normalizedDiversity)
        };
    }

    /**
     * DOMINANT STRATEGY ANALYSIS
     * Identifies and analyzes dominant strategies
     */
    analyzeDominantStrategies(payoffMatrix, playerStrategies) {
        const { players, house, payoffs } = payoffMatrix;
        const dominanceAnalysis = {
            stronglyDominant: [],
            weaklyDominant: [],
            dominated: [],
            dominanceRelations: new Map()
        };

        // Check for strongly dominant strategies
        players.forEach((playerStrategy, i) => {
            let isStronglyDominant = true;
            let isWeaklyDominant = true;
            
            players.forEach((otherStrategy, k) => {
                if (i === k) return;
                
                let stronglyBetter = true;
                let weaklyBetter = true;
                
                house.forEach((houseStrategy, j) => {
                    const payoff_i = payoffs.get(`${i}-${j}`).player;
                    const payoff_k = payoffs.get(`${k}-${j}`).player;
                    
                    if (payoff_i <= payoff_k) stronglyBetter = false;
                    if (payoff_i < payoff_k) weaklyBetter = false;
                });
                
                if (!stronglyBetter) isStronglyDominant = false;
                if (!weaklyBetter) isWeaklyDominant = false;
            });
            
            if (isStronglyDominant) {
                dominanceAnalysis.stronglyDominant.push({
                    strategyIndex: i,
                    strategyId: playerStrategy,
                    dominanceStrength: this.calculateDominanceStrength(i, payoffMatrix)
                });
            } else if (isWeaklyDominant) {
                dominanceAnalysis.weaklyDominant.push({
                    strategyIndex: i,
                    strategyId: playerStrategy,
                    dominanceStrength: this.calculateDominanceStrength(i, payoffMatrix)
                });
            }
        });

        // Calculate overall dominance risk
        const dominanceRisk = this.calculateDominanceRisk(dominanceAnalysis, playerStrategies);
        
        return {
            ...dominanceAnalysis,
            riskLevel: dominanceRisk.level,
            riskScore: dominanceRisk.score,
            balanceThreat: dominanceRisk.threat,
            recommendations: this.generateDominanceRecommendations(dominanceAnalysis, dominanceRisk)
        };
    }

    /**
     * STRATEGIC STABILITY ANALYZER
     * Analyzes the stability of equilibria
     */
    analyzeStrategicStability(equilibria, payoffMatrix) {
        const stabilityMetrics = {
            local: [],
            global: null,
            resilience: null,
            convergence: null
        };

        // Local stability analysis for each equilibrium
        equilibria.all.forEach(equilibrium => {
            const localStability = this.analyzeLocalStability(equilibrium, payoffMatrix);
            stabilityMetrics.local.push({
                equilibrium: equilibrium,
                stability: localStability,
                eigenvalues: localStability.eigenvalues,
                lyapunovExponents: localStability.lyapunovExponents
            });
        });

        // Global stability analysis
        stabilityMetrics.global = this.analyzeGlobalStability(equilibria, payoffMatrix);
        
        // Resilience to perturbations
        stabilityMetrics.resilience = this.analyzeResilienceToPerturbations(equilibria, payoffMatrix);
        
        // Convergence analysis
        stabilityMetrics.convergence = this.analyzeConvergenceProperties(equilibria, payoffMatrix);
        
        return {
            ...stabilityMetrics,
            score: this.calculateOverallStabilityScore(stabilityMetrics),
            classification: this.classifyStability(stabilityMetrics),
            recommendations: this.generateStabilityRecommendations(stabilityMetrics)
        };
    }

    /**
     * DYNAMIC GAME REBALANCING
     * Adjusts game parameters to maintain Nash equilibrium
     */
    async rebalanceGame(gameType, currentBalance, targetBalance) {
        const rebalanceStrategy = {
            multiplierAdjustments: new Map(),
            probabilityAdjustments: new Map(),
            payoutAdjustments: new Map(),
            expectedImpact: null
        };

        try {
            // Calculate required adjustments to reach target balance
            const adjustments = this.calculateRebalanceAdjustments(currentBalance, targetBalance);
            
            // Apply gradual adjustments to avoid shock
            const gradualAdjustments = this.applyGradualAdjustments(adjustments, 0.1); // 10% per adjustment
            
            // Validate adjustments don't create new dominant strategies
            const validation = await this.validateRebalanceAdjustments(gameType, gradualAdjustments);
            
            if (validation.safe) {
                rebalanceStrategy.multiplierAdjustments = gradualAdjustments.multipliers;
                rebalanceStrategy.probabilityAdjustments = gradualAdjustments.probabilities;
                rebalanceStrategy.payoutAdjustments = gradualAdjustments.payouts;
                rebalanceStrategy.expectedImpact = validation.expectedImpact;
            } else {
                logger.warn(`Rebalance validation failed for ${gameType}:`, validation.issues);
                rebalanceStrategy = this.getConservativeRebalance(gameType, adjustments);
            }
            
        } catch (error) {
            logger.error(`Game rebalancing failed for ${gameType}: ${error.message}`);
            rebalanceStrategy = this.getEmergencyRebalance(gameType);
        }

        return {
            gameType,
            strategy: rebalanceStrategy,
            implementation: this.generateImplementationPlan(rebalanceStrategy),
            monitoring: this.generateMonitoringPlan(gameType, rebalanceStrategy),
            rollback: this.generateRollbackPlan(gameType, currentBalance)
        };
    }

    // Helper Methods

    calculateStrategyPayoff(playerStrategy, houseStrategy, gameType) {
        // Mock implementation - replace with actual game mechanics
        const basePayoff = this.getBasePayoff(gameType);
        const playerModifier = this.getStrategyModifier(playerStrategy);
        const houseModifier = this.getStrategyModifier(houseStrategy);
        
        return {
            playerPayoff: basePayoff.player * playerModifier * (2 - houseModifier),
            housePayoff: basePayoff.house * houseModifier * (2 - playerModifier),
            efficiency: (playerModifier + houseModifier) / 2,
            risk: Math.abs(playerModifier - houseModifier)
        };
    }

    isPureNashEquilibrium(playerIndex, houseIndex, payoffMatrix) {
        const { players, house, payoffs } = payoffMatrix;
        
        // Check if player has no incentive to deviate
        for (let i = 0; i < players.length; i++) {
            if (i === playerIndex) continue;
            
            const currentPayoff = payoffs.get(`${playerIndex}-${houseIndex}`).player;
            const alternativePayoff = payoffs.get(`${i}-${houseIndex}`).player;
            
            if (alternativePayoff > currentPayoff) return false;
        }
        
        // Check if house has no incentive to deviate
        for (let j = 0; j < house.length; j++) {
            if (j === houseIndex) continue;
            
            const currentPayoff = payoffs.get(`${playerIndex}-${houseIndex}`).house;
            const alternativePayoff = payoffs.get(`${playerIndex}-${j}`).house;
            
            if (alternativePayoff > currentPayoff) return false;
        }
        
        return true;
    }

    async getPlayerStrategies(gameType) {
        // Mock implementation - replace with actual strategy detection
        const strategies = [
            { strategyId: 'conservative', usageCount: 45, description: 'Low risk, consistent betting' },
            { strategyId: 'aggressive', usageCount: 25, description: 'High risk, variable betting' },
            { strategyId: 'martingale', usageCount: 20, description: 'Double after loss strategy' },
            { strategyId: 'fibonacci', usageCount: 10, description: 'Fibonacci sequence betting' }
        ];
        
        return strategies;
    }

    async getHouseStrategies(gameType) {
        // Mock implementation - house strategies are typically fixed
        return [
            { strategyId: 'standard', usageCount: 100, description: 'Standard house rules' }
        ];
    }

    async getAllGameTypes() {
        return ['slots', 'blackjack', 'roulette', 'keno', 'plinko', 'treasurevault'];
    }
}

/**
 * STRATEGIC STABILITY ANALYZER
 * Advanced stability analysis for game equilibria
 */
class StrategicStabilityAnalyzer {
    analyzeLocalStability(equilibrium, payoffMatrix) {
        // Linearize around equilibrium point
        const jacobian = this.calculateJacobian(equilibrium, payoffMatrix);
        
        // Calculate eigenvalues
        const eigenvalues = this.calculateEigenvalues(jacobian);
        
        // Lyapunov exponents
        const lyapunovExponents = this.calculateLyapunovExponents(equilibrium, payoffMatrix);
        
        // Stability classification
        const stability = this.classifyLocalStability(eigenvalues);
        
        return {
            stable: stability.stable,
            classification: stability.type,
            eigenvalues: eigenvalues,
            lyapunovExponents: lyapunovExponents,
            confidence: stability.confidence
        };
    }

    calculateJacobian(equilibrium, payoffMatrix) {
        // Numerical approximation of Jacobian matrix
        const epsilon = 1e-8;
        const dimension = payoffMatrix.players.length;
        const jacobian = [];
        
        for (let i = 0; i < dimension; i++) {
            jacobian[i] = [];
            for (let j = 0; j < dimension; j++) {
                // Partial derivative approximation
                const forward = this.evaluateReplicatorDynamics(equilibrium, payoffMatrix, i, epsilon);
                const backward = this.evaluateReplicatorDynamics(equilibrium, payoffMatrix, i, -epsilon);
                jacobian[i][j] = (forward - backward) / (2 * epsilon);
            }
        }
        
        return jacobian;
    }

    calculateEigenvalues(matrix) {
        // Power iteration method for dominant eigenvalue
        // QR algorithm for all eigenvalues (simplified implementation)
        const n = matrix.length;
        const eigenvalues = [];
        
        // Simplified eigenvalue calculation
        for (let i = 0; i < n; i++) {
            eigenvalues.push(matrix[i][i]); // Diagonal approximation
        }
        
        return eigenvalues;
    }
}

/**
 * GAME THEORY OPTIMIZER
 * Optimizes game parameters for balanced Nash equilibria
 */
class GameTheoryOptimizer {
    optimizeGameParameters(gameType, currentBalance, targetMetrics) {
        const optimization = {
            parameters: new Map(),
            constraints: this.defineOptimizationConstraints(gameType),
            objective: this.defineObjectiveFunction(targetMetrics),
            solution: null
        };
        
        try {
            // Use gradient descent optimization
            const solution = this.gradientDescentOptimization(
                optimization.objective,
                optimization.constraints,
                this.getCurrentParameters(gameType)
            );
            
            optimization.solution = solution;
            optimization.parameters = solution.parameters;
            
        } catch (error) {
            logger.error(`Game optimization failed: ${error.message}`);
            optimization.solution = this.getFallbackOptimization(gameType);
        }
        
        return optimization;
    }

    gradientDescentOptimization(objectiveFunction, constraints, initialParameters) {
        const learningRate = 0.01;
        const maxIterations = 1000;
        const tolerance = 1e-6;
        
        let parameters = { ...initialParameters };
        let iteration = 0;
        
        while (iteration < maxIterations) {
            const gradient = this.calculateGradient(objectiveFunction, parameters);
            const constraintViolations = this.checkConstraints(parameters, constraints);
            
            // Apply penalty method for constraints
            const penalizedGradient = this.applyConstraintPenalties(gradient, constraintViolations);
            
            // Update parameters
            const newParameters = {};
            for (const [key, value] of Object.entries(parameters)) {
                newParameters[key] = value - learningRate * penalizedGradient[key];
            }
            
            // Check convergence
            const change = this.calculateParameterChange(parameters, newParameters);
            if (change < tolerance) break;
            
            parameters = newParameters;
            iteration++;
        }
        
        return {
            parameters,
            converged: iteration < maxIterations,
            iterations: iteration,
            finalObjective: objectiveFunction(parameters)
        };
    }
}

module.exports = NashEquilibriumGameBalancer;