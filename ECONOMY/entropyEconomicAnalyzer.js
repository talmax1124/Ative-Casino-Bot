/**
 * ENTROPY ECONOMIC ANALYZER
 * Advanced thermodynamic principles applied to casino economics
 * Measures wealth distribution entropy, fairness indices, and economic equilibrium
 */

const logger = require('../UTILS/logger');
const dbManager = require('../UTILS/database');
const MathUtils = require('./mathematicalFoundations');

class EntropyEconomicAnalyzer {
    constructor() {
        this.thermodynamicConstants = {
            BOLTZMANN_CONSTANT: 1.380649e-23,
            ECONOMIC_TEMPERATURE: 1000, // Economic "temperature" for wealth distribution
            ENTROPY_THRESHOLD_LOW: 0.3,  // Whale-dominated threshold
            ENTROPY_THRESHOLD_HIGH: 0.8, // Fair distribution threshold
            GINI_CRITICAL: 0.5           // Critical Gini coefficient
        };
        
        this.wealthDistribution = new Map();
        this.entropyHistory = [];
        this.equilibriumCalculator = new ThermodynamicEquilibrium();
        this.fairnessEngine = new FairnessQuantificationEngine();
    }

    /**
     * SHANNON ENTROPY CALCULATION FOR WEALTH DISTRIBUTION
     * H(X) = -Σ(p_i * log₂(p_i))
     * Where p_i is the probability of wealth level i
     */
    async calculateWealthEntropy() {
        const wealthData = await this.getWealthDistributionData();
        const totalWealth = wealthData.reduce((sum, user) => sum + (user.wealth || 0), 0);
        
        if (totalWealth === 0) return { entropy: 0, interpretation: 'NO_WEALTH' };

        // Create wealth bins using logarithmic scaling
        const bins = this.createLogarithmicWealthBins(wealthData, 20);
        const probabilities = bins.map(bin => totalWealth > 0 ? bin.totalWealth / totalWealth : 0);
        
        // Calculate Shannon entropy
        const entropy = -probabilities.reduce((sum, p) => {
            return p > 0 ? sum + (p * Math.log2(p)) : sum;
        }, 0);

        // Normalized entropy (0-1 scale)
        const maxEntropy = Math.log2(Math.max(bins.length, 1));
        const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;

        // Thermodynamic interpretation
        const economicTemperature = this.calculateEconomicTemperature(entropy, totalWealth);
        const thermalEnergy = this.calculateThermalEnergy(economicTemperature, wealthData.length);

        return {
            rawEntropy: entropy,
            normalizedEntropy: normalizedEntropy,
            maxPossibleEntropy: maxEntropy,
            economicTemperature: economicTemperature,
            thermalEnergy: thermalEnergy,
            interpretation: this.interpretEntropy(normalizedEntropy),
            wealthBins: bins,
            recommendations: this.generateEntropyRecommendations(normalizedEntropy)
        };
    }

    /**
     * ADVANCED GINI COEFFICIENT CALCULATION
     * Gini = (2 * Σ(i * y_i)) / (n * Σ(y_i)) - (n+1)/n
     * Enhanced with confidence intervals and statistical significance
     */
    async calculateAdvancedGini() {
        const wealthData = await this.getWealthDistributionData();
        const sortedWealth = wealthData.map(u => u.wealth).sort((a, b) => a - b);
        const n = sortedWealth.length;
        
        if (n === 0) return { gini: 0, significance: 'NO_DATA' };

        // Standard Gini calculation
        const totalWealth = sortedWealth.reduce((sum, w) => sum + w, 0);
        const giniNumerator = sortedWealth.reduce((sum, wealth, index) => {
            return sum + ((index + 1) * wealth);
        }, 0);
        
        const gini = (2 * giniNumerator) / (n * totalWealth) - (n + 1) / n;

        // Bootstrap confidence intervals
        const confidenceIntervals = this.calculateGiniConfidenceIntervals(sortedWealth, 1000);
        
        // Decomposition by income sources
        const giniDecomposition = await this.decomposeGiniBySource(wealthData);
        
        // Temporal analysis
        const giniTrend = await this.calculateGiniTrend();
        
        return {
            gini: Math.max(0, gini), // Ensure non-negative
            confidenceIntervals,
            decomposition: giniDecomposition,
            trend: giniTrend,
            interpretation: this.interpretGini(gini),
            statisticalSignificance: this.calculateGiniSignificance(gini, n),
            recommendations: this.generateGiniRecommendations(gini, giniTrend)
        };
    }

    /**
     * THERMODYNAMIC EQUILIBRIUM ANALYSIS
     * Applies principles from statistical mechanics to economic systems
     */
    async calculateThermodynamicEquilibrium() {
        const entropyData = await this.calculateWealthEntropy();
        const giniData = await this.calculateAdvancedGini();
        const systemEnergy = await this.calculateSystemEnergy();
        
        // Maxwell-Boltzmann distribution for wealth
        const wealthDistribution = this.calculateMaxwellBoltzmannWealth(
            entropyData.economicTemperature,
            systemEnergy.totalEnergy
        );

        // Partition function calculation
        const partitionFunction = this.calculatePartitionFunction(
            entropyData.economicTemperature,
            systemEnergy.energyLevels
        );

        // Free energy calculation (F = E - TS)
        const freeEnergy = systemEnergy.totalEnergy - 
            (entropyData.economicTemperature * entropyData.rawEntropy);

        // Chemical potential (μ = ∂F/∂N)
        const chemicalPotential = this.calculateChemicalPotential(
            freeEnergy,
            await this.getActivePlayerCount()
        );

        return {
            equilibriumState: {
                entropy: entropyData.rawEntropy,
                temperature: entropyData.economicTemperature,
                freeEnergy: freeEnergy,
                chemicalPotential: chemicalPotential,
                partitionFunction: partitionFunction
            },
            wealthDistribution: wealthDistribution,
            stabilityAnalysis: this.analyzeThermodynamicStability(entropyData, systemEnergy),
            phaseTransitions: this.detectPhaseTransitions(entropyData, giniData),
            recommendations: this.generateThermodynamicRecommendations(freeEnergy, chemicalPotential)
        };
    }

    /**
     * WEALTH FLOW DYNAMICS ANALYSIS
     * Uses fluid dynamics principles to analyze wealth movement
     */
    async analyzeWealthFlowDynamics() {
        const flowData = await this.getWealthFlowData();
        
        // Continuity equation: ∂ρ/∂t + ∇·(ρv) = 0
        const continuityAnalysis = this.applyContinuityEquation(flowData);
        
        // Navier-Stokes for wealth flow
        const viscosity = this.calculateWealthViscosity(flowData);
        const reynolds = this.calculateReynoldsNumber(flowData, viscosity);
        
        // Turbulence analysis
        const turbulenceMetrics = this.analyzeTurbulence(flowData, reynolds);
        
        return {
            continuity: continuityAnalysis,
            viscosity: viscosity,
            reynolds: reynolds,
            turbulence: turbulenceMetrics,
            flowPattern: this.classifyFlowPattern(reynolds, turbulenceMetrics),
            stability: this.assessFlowStability(continuityAnalysis, turbulenceMetrics)
        };
    }

    /**
     * ENTROPY-BASED MULTIPLIER CALCULATION
     * Uses information theory to determine optimal multipliers
     */
    calculateEntropyBasedMultiplier(userWealth, totalWealth, systemEntropy) {
        // Input validation
        if (!userWealth || !totalWealth || totalWealth === 0) {
            return { finalMultiplier: 1.0, components: { thermal: 1.0, entropy: 1.0, information: 1.0 }, reasoning: 'Invalid input data' };
        }
        
        // Base multiplier from thermodynamic principles
        const denominator = this.thermodynamicConstants.ECONOMIC_TEMPERATURE * totalWealth;
        const thermalMultiplier = denominator > 0 ? Math.exp(-userWealth / denominator) : 1.0;
        
        // Entropy correction factor
        const entropyFactor = systemEntropy && systemEntropy.normalizedEntropy !== undefined ? 
            1 + (systemEntropy.normalizedEntropy - 0.5) * 0.4 : 1.0;
        
        // Information content multiplier (safe division)
        const wealthRatio = totalWealth > 0 ? userWealth / totalWealth : 0;
        const informationContent = wealthRatio > 0 ? -Math.log2(wealthRatio + 1e-10) : 0;
        const informationMultiplier = 1 + (informationContent / 10);
        
        // Composite multiplier
        const compositeMultiplier = thermalMultiplier * entropyFactor * informationMultiplier;
        
        // Apply bounds (0.1x to 3.0x)
        return {
            finalMultiplier: Math.max(0.1, Math.min(compositeMultiplier, 3.0)),
            components: {
                thermal: thermalMultiplier,
                entropy: entropyFactor,
                information: informationMultiplier
            },
            reasoning: this.generateEntropyMultiplierReasoning(compositeMultiplier, systemEntropy)
        };
    }

    /**
     * ECONOMIC PHASE TRANSITION DETECTION
     * Identifies critical points where system behavior changes dramatically
     */
    detectPhaseTransitions(entropyData, giniData) {
        const phases = [];
        
        // Wealth concentration phase transition (Gini > 0.6)
        if (giniData.gini > 0.6) {
            phases.push({
                type: 'WEALTH_CONCENTRATION',
                severity: 'HIGH',
                criticalValue: giniData.gini,
                description: 'System entering oligarchic phase - wealth concentrating in few hands'
            });
        }

        // Low entropy phase transition (normalized entropy < 0.3)
        if (entropyData.normalizedEntropy < 0.3) {
            phases.push({
                type: 'ENTROPY_COLLAPSE',
                severity: 'CRITICAL',
                criticalValue: entropyData.normalizedEntropy,
                description: 'System approaching deterministic state - whale domination imminent'
            });
        }

        // Free energy minimum (economic stagnation)
        const freeEnergyGradient = this.calculateFreeEnergyGradient(entropyData);
        if (Math.abs(freeEnergyGradient) < 0.01) {
            phases.push({
                type: 'ECONOMIC_STAGNATION',
                severity: 'MEDIUM',
                criticalValue: freeEnergyGradient,
                description: 'System approaching equilibrium - reduced economic activity'
            });
        }

        return {
            detectedPhases: phases,
            criticalityIndex: this.calculateCriticalityIndex(phases),
            stabilityRecommendations: this.generateStabilityRecommendations(phases)
        };
    }

    /**
     * ADAPTIVE WEALTH REDISTRIBUTION ENGINE
     * Uses entropy principles to guide wealth redistribution
     */
    calculateOptimalRedistribution(currentState, targetEntropy = 0.7) {
        const entropyGap = targetEntropy - currentState.entropy.normalizedEntropy;
        
        // Calculate required wealth transfers using maximum entropy principle
        const redistributionPlan = this.maximizeEntropySubjectToConstraints(
            currentState,
            targetEntropy
        );
        
        // Progressive taxation calculation
        const taxationSchedule = this.calculateProgressiveTaxation(
            currentState.wealthDistribution,
            redistributionPlan
        );
        
        return {
            redistributionPlan,
            taxationSchedule,
            expectedEntropyIncrease: entropyGap,
            implementationSteps: this.generateImplementationSteps(redistributionPlan),
            riskAssessment: this.assessRedistributionRisk(redistributionPlan)
        };
    }

    // Helper Methods for Complex Calculations

    createLogarithmicWealthBins(wealthData, numBins) {
        const maxWealth = Math.max(...wealthData.map(u => u.wealth));
        const minWealth = Math.max(1, Math.min(...wealthData.map(u => u.wealth)));
        
        const logMin = Math.log10(minWealth);
        const logMax = Math.log10(maxWealth);
        const logStep = (logMax - logMin) / numBins;
        
        const bins = [];
        for (let i = 0; i < numBins; i++) {
            const binMin = Math.pow(10, logMin + i * logStep);
            const binMax = Math.pow(10, logMin + (i + 1) * logStep);
            
            const usersInBin = wealthData.filter(u => u.wealth >= binMin && u.wealth < binMax);
            const totalWealthInBin = usersInBin.reduce((sum, u) => sum + u.wealth, 0);
            
            bins.push({
                range: [binMin, binMax],
                userCount: usersInBin.length,
                totalWealth: totalWealthInBin,
                averageWealth: usersInBin.length > 0 ? totalWealthInBin / usersInBin.length : 0,
                users: usersInBin.map(u => u.userId)
            });
        }
        
        return bins.filter(bin => bin.userCount > 0);
    }

    calculateEconomicTemperature(entropy, totalWealth) {
        // T = E / (k * S)
        // Where E is total wealth energy, k is economic constant, S is entropy
        const economicConstant = this.thermodynamicConstants.BOLTZMANN_CONSTANT * 1e26; // Scale up
        return totalWealth / (economicConstant * (entropy + 1e-10));
    }

    calculateMaxwellBoltzmannWealth(temperature, totalEnergy) {
        // f(E) = (2π)^(-1/2) * (1/kT)^(3/2) * E^(1/2) * exp(-E/kT)
        const kT = this.thermodynamicConstants.BOLTZMANN_CONSTANT * temperature;
        const normalization = Math.pow(2 * Math.PI, -0.5) * Math.pow(1/kT, 1.5);
        
        const distribution = [];
        for (let E = 1; E <= totalEnergy; E += totalEnergy/100) {
            const probability = normalization * Math.sqrt(E) * Math.exp(-E/kT);
            distribution.push({ energy: E, probability });
        }
        
        return distribution;
    }

    calculateGiniConfidenceIntervals(sortedWealth, bootstrapSamples) {
        const giniBootstrap = [];
        
        for (let i = 0; i < bootstrapSamples; i++) {
            const sample = [];
            for (let j = 0; j < sortedWealth.length; j++) {
                const randomIndex = Math.floor(Math.random() * sortedWealth.length);
                sample.push(sortedWealth[randomIndex]);
            }
            sample.sort((a, b) => a - b);
            
            const gini = this.calculateBasicGini(sample);
            giniBootstrap.push(gini);
        }
        
        giniBootstrap.sort((a, b) => a - b);
        
        return {
            confidence95: [
                giniBootstrap[Math.floor(0.025 * bootstrapSamples)],
                giniBootstrap[Math.floor(0.975 * bootstrapSamples)]
            ],
            confidence99: [
                giniBootstrap[Math.floor(0.005 * bootstrapSamples)],
                giniBootstrap[Math.floor(0.995 * bootstrapSamples)]
            ],
            standardError: this.calculateStandardDeviation(giniBootstrap)
        };
    }

    interpretEntropy(normalizedEntropy) {
        if (normalizedEntropy < 0.3) {
            return {
                classification: 'WHALE_DOMINATED',
                severity: 'CRITICAL',
                description: 'Wealth extremely concentrated - few whales control most resources',
                fairnessScore: 0.2,
                actionRequired: 'IMMEDIATE_INTERVENTION'
            };
        } else if (normalizedEntropy < 0.5) {
            return {
                classification: 'OLIGARCHIC',
                severity: 'HIGH',
                description: 'Wealth concentrated among small group - oligarchy forming',
                fairnessScore: 0.4,
                actionRequired: 'REDISTRIBUTE_WEALTH'
            };
        } else if (normalizedEntropy < 0.7) {
            return {
                classification: 'MODERATE_INEQUALITY',
                severity: 'MEDIUM',
                description: 'Moderate wealth concentration - some inequality present',
                fairnessScore: 0.6,
                actionRequired: 'MONITOR_AND_ADJUST'
            };
        } else if (normalizedEntropy < 0.9) {
            return {
                classification: 'FAIR_DISTRIBUTION',
                severity: 'LOW',
                description: 'Good wealth distribution - relatively fair system',
                fairnessScore: 0.8,
                actionRequired: 'MAINTAIN_CURRENT'
            };
        } else {
            return {
                classification: 'HYPER_EGALITARIAN',
                severity: 'LOW',
                description: 'Extremely equal distribution - may lack incentives',
                fairnessScore: 1.0,
                actionRequired: 'INTRODUCE_INCENTIVES'
            };
        }
    }

    async getWealthDistributionData() {
        // Mock implementation - replace with actual database query
        const query = `
            SELECT 
                user_id as userId,
                (wallet + bank) as wealth,
                created_at,
                last_active
            FROM economy 
            WHERE (wallet + bank) > 0
            ORDER BY wealth DESC
        `;
        
        return await dbManager.executeQuery(query);
    }

    async getWealthFlowData() {
        // Get recent transactions for flow analysis
        const query = `
            SELECT 
                user_id,
                amount,
                transaction_type,
                timestamp,
                game_type
            FROM transactions 
            WHERE timestamp > ?
            ORDER BY timestamp DESC
        `;
        
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        return await dbManager.executeQuery(query, [thirtyDaysAgo]);
    }
}

/**
 * THERMODYNAMIC EQUILIBRIUM CALCULATOR
 * Applies statistical mechanics to economic analysis
 */
class ThermodynamicEquilibrium {
    calculatePartitionFunction(temperature, energyLevels) {
        // Z = Σ exp(-E_i / kT)
        const kT = temperature * 1.380649e-23 * 1e26; // Scaled Boltzmann constant
        
        return energyLevels.reduce((sum, energy) => {
            return sum + Math.exp(-energy / kT);
        }, 0);
    }

    calculateChemicalPotential(freeEnergy, particleNumber) {
        // μ = ∂F/∂N at constant T,V
        const deltaN = 1;
        const deltaF = this.estimateFreeEnergyChange(freeEnergy, particleNumber, deltaN);
        
        return deltaF / deltaN;
    }

    estimateFreeEnergyChange(currentF, N, deltaN) {
        // Numerical derivative approximation
        const epsilon = 0.01;
        return currentF * (Math.log(N + deltaN) - Math.log(N)) * epsilon;
    }
}

/**
 * FAIRNESS QUANTIFICATION ENGINE
 * Mathematical frameworks for measuring system fairness
 */
class FairnessQuantificationEngine {
    calculateRawlsianFairness(wealthDistribution) {
        // Based on John Rawls' "veil of ignorance" principle
        // Focuses on the worst-off individuals
        const sortedWealth = wealthDistribution.sort((a, b) => a.wealth - b.wealth);
        const bottomDecile = sortedWealth.slice(0, Math.floor(sortedWealth.length * 0.1));
        const bottomDecileWealth = bottomDecile.reduce((sum, u) => sum + u.wealth, 0);
        const averageBottom = bottomDecileWealth / bottomDecile.length;
        
        const totalWealth = sortedWealth.reduce((sum, u) => sum + u.wealth, 0);
        const overallAverage = totalWealth / sortedWealth.length;
        
        return {
            rawlsianIndex: averageBottom / overallAverage,
            bottomDecileAverage: averageBottom,
            overallAverage: overallAverage,
            interpretation: this.interpretRawlsianIndex(averageBottom / overallAverage)
        };
    }

    calculateUtilitarianFairness(wealthDistribution) {
        // Based on utilitarian principles - greatest good for greatest number
        const totalUtility = wealthDistribution.reduce((sum, user) => {
            // Diminishing marginal utility: U = log(wealth + 1)
            return sum + Math.log(user.wealth + 1);
        }, 0);
        
        const averageUtility = totalUtility / wealthDistribution.length;
        const maxPossibleUtility = wealthDistribution.length * Math.log(
            wealthDistribution.reduce((sum, u) => sum + u.wealth, 0) / wealthDistribution.length + 1
        );
        
        return {
            utilitarianIndex: totalUtility / maxPossibleUtility,
            totalUtility: totalUtility,
            averageUtility: averageUtility,
            efficiencyRatio: totalUtility / maxPossibleUtility
        };
    }
}

module.exports = EntropyEconomicAnalyzer;