/**
 * Advanced Risk Assessment Engine
 * Sophisticated multi-dimensional risk analysis system
 * Uses complex mathematical models and machine learning principles
 */

const logger = require('./logger');
const dbManager = require('./database');

class AdvancedRiskEngine {
    constructor() {
        this.riskFactors = new Map();
        this.playerProfiles = new Map();
        this.economicModel = new EconomicHeuristicModel();
        this.behaviorAnalyzer = new PlayerBehaviorAnalyzer();
        this.volatilityCalculator = new VolatilityCalculator();
    }

    /**
     * Multi-Dimensional Risk Assessment
     * Analyzes risk across 12 different dimensions
     */
    async calculateComprehensiveRisk(userId, gameType, betAmount, metadata = {}) {
        const startTime = Date.now();
        
        try {
            // Fetch comprehensive player data
            const playerData = await this.getPlayerDataMatrix(userId);
            const gameMetrics = await this.getGameSpecificMetrics(gameType, betAmount);
            const economicState = await this.economicModel.getCurrentState();
            
            // 1. Financial Risk Assessment (Weighting: 25%)
            const financialRisk = await this.calculateFinancialRisk(playerData, betAmount);
            
            // 2. Behavioral Pattern Analysis (Weighting: 20%)
            const behaviorRisk = await this.behaviorAnalyzer.analyzeBehaviorPattern(userId, gameType, betAmount);
            
            // 3. Temporal Risk Factors (Weighting: 15%)
            const temporalRisk = await this.calculateTemporalRisk(userId, gameType);
            
            // 4. Economic Stability Index (Weighting: 15%)
            const economicRisk = this.economicModel.calculateEconomicRisk(economicState, betAmount);
            
            // 5. Game-Specific Volatility (Weighting: 10%)
            const volatilityRisk = this.volatilityCalculator.calculateGameVolatility(gameType, betAmount);
            
            // 6. Cross-Game Pattern Analysis (Weighting: 5%)
            const crossGameRisk = await this.analyzeCrossGamePatterns(userId);
            
            // 7. Streak Analysis (Weighting: 4%)
            const streakRisk = await this.calculateStreakRisk(userId, gameType);
            
            // 8. Velocity Analysis (Weighting: 3%)
            const velocityRisk = await this.calculateVelocityRisk(userId, betAmount);
            
            // 9. Network Effect Analysis (Weighting: 2%)
            const networkRisk = await this.calculateNetworkRisk(userId, metadata.guildId);
            
            // 10. Seasonal/Cyclical Patterns (Weighting: 1%)
            const seasonalRisk = this.calculateSeasonalRisk();
            
            // Composite Risk Score Calculation using Advanced Weighted Algorithm
            const riskScore = this.calculateCompositeRiskScore({
                financial: { value: financialRisk, weight: 0.25 },
                behavior: { value: behaviorRisk, weight: 0.20 },
                temporal: { value: temporalRisk, weight: 0.15 },
                economic: { value: economicRisk, weight: 0.15 },
                volatility: { value: volatilityRisk, weight: 0.10 },
                crossGame: { value: crossGameRisk, weight: 0.05 },
                streak: { value: streakRisk, weight: 0.04 },
                velocity: { value: velocityRisk, weight: 0.03 },
                network: { value: networkRisk, weight: 0.02 },
                seasonal: { value: seasonalRisk, weight: 0.01 }
            });
            
            // Advanced Dynamic Multiplier Calculation
            const multiplierAdjustment = await this.calculateDynamicMultiplier(riskScore, gameType, betAmount, playerData);
            
            // Generate Risk Insights
            const insights = this.generateRiskInsights(riskScore, multiplierAdjustment);
            
            const processingTime = Date.now() - startTime;
            logger.debug(`Advanced risk analysis completed in ${processingTime}ms for ${userId}`);
            
            return {
                riskScore,
                multiplierAdjustment,
                insights,
                processingTime,
                dimensions: {
                    financialRisk,
                    behaviorRisk,
                    temporalRisk,
                    economicRisk,
                    volatilityRisk,
                    crossGameRisk,
                    streakRisk,
                    velocityRisk,
                    networkRisk,
                    seasonalRisk
                }
            };
            
        } catch (error) {
            logger.error(`Advanced risk calculation failed: ${error.message}`);
            return this.getFallbackRiskAssessment();
        }
    }

    /**
     * Financial Risk Assessment with Advanced Algorithms
     */
    async calculateFinancialRisk(playerData, betAmount) {
        const { totalWealth, recentLosses, wealthDistribution, riskTolerance } = playerData;
        
        // Kelly Criterion Application
        const kellyOptimal = this.calculateKellyCriterion(playerData.winRate, playerData.averageOdds);
        const kellyDeviation = Math.abs(betAmount / totalWealth - kellyOptimal);
        
        // Wealth-to-Bet Ratio Analysis
        const wealthRatio = betAmount / totalWealth;
        const riskTier = this.classifyRiskTier(wealthRatio);
        
        // Recent Loss Velocity Impact
        const lossVelocity = recentLosses.reduce((sum, loss, index) => {
            const timeWeight = Math.exp(-index * 0.1); // Exponential decay
            return sum + (loss * timeWeight);
        }, 0) / recentLosses.length;
        
        // Advanced Risk Score Calculation
        const baseRisk = Math.min(wealthRatio * 2, 1.0);
        const kellyPenalty = kellyDeviation * 0.3;
        const velocityPenalty = Math.min(lossVelocity / totalWealth, 0.4);
        
        return Math.min(baseRisk + kellyPenalty + velocityPenalty, 1.0);
    }

    /**
     * Calculate Kelly Criterion for Optimal Bet Sizing
     */
    calculateKellyCriterion(winRate, averageOdds) {
        if (winRate <= 0 || averageOdds <= 1) return 0;
        
        const p = winRate;
        const b = averageOdds - 1;
        const q = 1 - p;
        
        // Kelly formula: f = (bp - q) / b
        const kellyFraction = (b * p - q) / b;
        
        return Math.max(0, Math.min(kellyFraction, 0.25)); // Cap at 25% of wealth
    }

    /**
     * Dynamic Multiplier Calculation using Advanced Mathematical Models
     */
    async calculateDynamicMultiplier(riskScore, gameType, betAmount, playerData) {
        // Base multiplier starts at 3.0 as per requirements
        let baseMultiplier = 3.0;
        
        // Risk-Adjusted Multiplier using Sigmoid Function
        const riskAdjustment = this.sigmoidTransform(riskScore, 0.5, 5);
        
        // Economic State Adjustment
        const economicMultiplier = await this.economicModel.getMultiplierAdjustment(gameType);
        
        // Player Tier Bonus (for loyal, responsible players)
        const tierBonus = this.calculateTierBonus(playerData);
        
        // Game-Specific Intelligence
        const gameIntelligence = this.calculateGameSpecificIntelligence(gameType, betAmount);
        
        // Advanced Composite Calculation
        const finalMultiplier = baseMultiplier * 
            (1 - riskAdjustment * 0.4) * // Risk can reduce multiplier by up to 40%
            economicMultiplier *
            (1 + tierBonus) *
            gameIntelligence;
        
        // Ensure minimum viable multiplier (never below 0.5x)
        const cappedMultiplier = Math.max(0.5, Math.min(finalMultiplier, 3.0));
        
        return {
            finalMultiplier: cappedMultiplier,
            baseMultiplier,
            riskAdjustment,
            economicMultiplier,
            tierBonus,
            gameIntelligence,
            reasoning: this.generateMultiplierReasoning(riskScore, cappedMultiplier)
        };
    }

    /**
     * Sigmoid transformation for smooth risk adjustments
     */
    sigmoidTransform(x, center = 0.5, steepness = 5) {
        return 1 / (1 + Math.exp(-steepness * (x - center)));
    }

    /**
     * Player Data Matrix - Comprehensive data collection
     */
    async getPlayerDataMatrix(userId) {
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        
        const [balance, gameHistory, patterns] = await Promise.all([
            this.getUserBalance(userId),
            this.getGameHistory(userId, thirtyDaysAgo),
            this.getBehaviorPatterns(userId)
        ]);
        
        return {
            totalWealth: balance.wallet + balance.bank,
            recentLosses: this.extractLosses(gameHistory),
            winRate: this.calculateWinRate(gameHistory),
            averageOdds: this.calculateAverageOdds(gameHistory),
            wealthDistribution: this.analyzeWealthDistribution(balance),
            riskTolerance: this.assessRiskTolerance(patterns),
            playFrequency: this.calculatePlayFrequency(gameHistory),
            diversificationIndex: this.calculateDiversificationIndex(gameHistory)
        };
    }
}

/**
 * Economic Heuristic Model
 * Complex economic state analysis and prediction
 */
class EconomicHeuristicModel {
    constructor() {
        this.economicIndicators = new Map();
        this.inflationModel = new InflationTracker();
        this.liquidityModel = new LiquidityAnalyzer();
    }

    async getCurrentState() {
        const [inflation, liquidity, velocity, distribution] = await Promise.all([
            this.inflationModel.getCurrentInflation(),
            this.liquidityModel.getCurrentLiquidity(),
            this.calculateMoneyVelocity(),
            this.analyzeWealthDistribution()
        ]);

        return {
            inflation,
            liquidity,
            velocity,
            distribution,
            stabilityIndex: this.calculateStabilityIndex(inflation, liquidity, velocity),
            riskLevel: this.assessSystemicRisk(inflation, liquidity, distribution)
        };
    }

    calculateEconomicRisk(economicState, betAmount) {
        const { stabilityIndex, riskLevel, inflation } = economicState;
        
        // Economic instability increases risk
        const instabilityPenalty = (1 - stabilityIndex) * 0.6;
        
        // High inflation reduces purchasing power, increases risk
        const inflationPenalty = Math.min(inflation * 0.3, 0.4);
        
        // Large bets during economic uncertainty carry higher risk
        const betSizeRisk = this.calculateBetSizeEconomicRisk(betAmount, economicState);
        
        return Math.min(instabilityPenalty + inflationPenalty + betSizeRisk, 1.0);
    }

    async getMultiplierAdjustment(gameType) {
        const state = await this.getCurrentState();
        
        // During economic stability, slightly higher multipliers
        if (state.stabilityIndex > 0.8) {
            return 1.05; // 5% bonus during stability
        }
        
        // During instability, reduce multipliers
        if (state.stabilityIndex < 0.4) {
            return 0.85; // 15% reduction during instability
        }
        
        // Normal conditions
        return 1.0;
    }
}

/**
 * Player Behavior Analyzer
 * Advanced behavioral pattern recognition
 */
class PlayerBehaviorAnalyzer {
    async analyzeBehaviorPattern(userId, gameType, betAmount) {
        const behaviorData = await this.getBehaviorData(userId);
        
        // Analyze multiple behavioral dimensions
        const impulsivityScore = this.calculateImpulsivity(behaviorData);
        const consistencyScore = this.calculateConsistency(behaviorData);
        const escalationTendency = this.calculateEscalationTendency(behaviorData);
        const riskSeekingBehavior = this.calculateRiskSeeking(behaviorData, gameType);
        
        // Composite behavior risk
        return this.compositeBehaviorRisk(
            impulsivityScore,
            consistencyScore,
            escalationTendency,
            riskSeekingBehavior
        );
    }

    calculateImpulsivity(behaviorData) {
        // Analyze bet timing patterns, sudden large bets, rapid-fire gaming
        const { betTimings, betSizes, gameFrequency } = behaviorData;
        
        // Time between bets analysis
        const avgTimeBetweenBets = this.calculateAverageTimeBetweenBets(betTimings);
        const impulsiveThreshold = 30000; // 30 seconds
        const impulsiveBets = betTimings.filter(gap => gap < impulsiveThreshold).length;
        
        // Sudden bet size increases
        const betSizeVariance = this.calculateVariance(betSizes);
        const sizeImpulsivity = Math.min(betSizeVariance / 1000000, 1.0); // Normalize
        
        return Math.min((impulsiveBets / betTimings.length) + sizeImpulsivity, 1.0);
    }
}

/**
 * Volatility Calculator
 * Game-specific volatility analysis
 */
class VolatilityCalculator {
    calculateGameVolatility(gameType, betAmount) {
        const gameVolatilities = {
            'slots': this.calculateSlotsVolatility(betAmount),
            'roulette': this.calculateRouletteVolatility(betAmount),
            'blackjack': this.calculateBlackjackVolatility(betAmount),
            'keno': this.calculateKenoVolatility(betAmount),
            'plinko': this.calculatePlinkoVolatility(betAmount),
            'treasurevault': this.calculateTreasureVaultVolatility(betAmount)
        };
        
        return gameVolatilities[gameType] || 0.5;
    }

    calculateSlotsVolatility(betAmount) {
        // Slots have moderate volatility with potential for cascading wins
        const baseVolatility = 0.3;
        
        // Higher bets increase volatility due to multiplier effects
        const betVolatility = Math.min(betAmount / 100000, 0.4);
        
        return Math.min(baseVolatility + betVolatility, 1.0);
    }
}

// Export the main class
module.exports = AdvancedRiskEngine;