/**
 * Deep Analytics Engine
 * Advanced statistical analysis and predictive modeling system
 */

const logger = require('./logger');
const dbManager = require('./database');

class DeepAnalytics {
    constructor() {
        this.statisticalModels = new Map();
        this.predictiveEngine = new PredictiveModelingEngine();
        this.patternRecognition = new AdvancedPatternRecognition();
        this.anomalyDetector = new AnomalyDetectionSystem();
        this.neuralNetwork = new SimpleNeuralNetwork();
    }

    /**
     * Comprehensive Player Analysis
     * Multi-layered analytical framework
     */
    async analyzePlayer(userId, options = {}) {
        const analysis = {
            timestamp: Date.now(),
            userId,
            dimensions: {}
        };

        // Layer 1: Statistical Foundation
        analysis.dimensions.statistical = await this.performStatisticalAnalysis(userId);
        
        // Layer 2: Behavioral Profiling
        analysis.dimensions.behavioral = await this.createBehavioralProfile(userId);
        
        // Layer 3: Predictive Modeling
        analysis.dimensions.predictive = await this.generatePredictiveInsights(userId);
        
        // Layer 4: Risk Assessment
        analysis.dimensions.risk = await this.performRiskProfiling(userId);
        
        // Layer 5: Economic Impact Analysis
        analysis.dimensions.economic = await this.analyzeEconomicImpact(userId);
        
        // Composite Analysis
        analysis.composite = this.synthesizeAnalysis(analysis.dimensions);
        
        return analysis;
    }

    /**
     * Statistical Analysis Layer
     */
    async performStatisticalAnalysis(userId) {
        const gameData = await this.getComprehensiveGameData(userId);
        
        return {
            descriptiveStats: this.calculateDescriptiveStatistics(gameData),
            distributions: this.analyzeDistributions(gameData),
            correlations: this.calculateCorrelations(gameData),
            timeSeries: this.performTimeSeriesAnalysis(gameData),
            probabilityModels: this.buildProbabilityModels(gameData),
            statisticalSignificance: this.testStatisticalSignificance(gameData)
        };
    }

    calculateDescriptiveStatistics(gameData) {
        const betAmounts = gameData.map(game => game.betAmount);
        const payouts = gameData.map(game => game.payout);
        const profits = gameData.map(game => game.payout - game.betAmount);
        
        return {
            bets: this.getStatSummary(betAmounts),
            payouts: this.getStatSummary(payouts),
            profits: this.getStatSummary(profits),
            winRate: this.calculateWinRate(gameData),
            avgSessionLength: this.calculateAverageSessionLength(gameData),
            volatilityIndex: this.calculateVolatilityIndex(profits)
        };
    }

    getStatSummary(data) {
        const sorted = [...data].sort((a, b) => a - b);
        const n = data.length;
        
        return {
            count: n,
            mean: this.mean(data),
            median: this.median(sorted),
            mode: this.mode(data),
            stdDev: this.standardDeviation(data),
            variance: this.variance(data),
            skewness: this.skewness(data),
            kurtosis: this.kurtosis(data),
            range: Math.max(...data) - Math.min(...data),
            iqr: this.interquartileRange(sorted),
            percentiles: this.calculatePercentiles(sorted, [10, 25, 50, 75, 90, 95, 99])
        };
    }

    /**
     * Advanced Behavioral Profiling
     */
    async createBehavioralProfile(userId) {
        const behaviorData = await this.getBehaviorData(userId);
        
        return {
            riskProfile: this.classifyRiskProfile(behaviorData),
            playingStyle: this.identifyPlayingStyle(behaviorData),
            decisionPatterns: this.analyzeDecisionPatterns(behaviorData),
            emotionalIndicators: this.detectEmotionalIndicators(behaviorData),
            learningCurve: this.analyzeLearningCurve(behaviorData),
            adaptabilityIndex: this.calculateAdaptabilityIndex(behaviorData)
        };
    }

    classifyRiskProfile(behaviorData) {
        const riskMetrics = {
            betSizeProgression: this.analyzeBetSizeProgression(behaviorData),
            gameSelection: this.analyzeGameSelection(behaviorData),
            sessionDuration: this.analyzeSessionDuration(behaviorData),
            recoverySeeking: this.analyzeRecoveryBehavior(behaviorData)
        };

        // Advanced risk classification using multiple indicators
        const riskScore = this.calculateCompositeRiskScore(riskMetrics);
        
        return {
            classification: this.getRiskClassification(riskScore),
            score: riskScore,
            metrics: riskMetrics,
            confidence: this.calculateClassificationConfidence(riskMetrics)
        };
    }

    /**
     * Predictive Modeling Engine
     */
    async generatePredictiveInsights(userId) {
        const historicalData = await this.getHistoricalData(userId, 90); // 90 days
        
        return {
            nextBetPrediction: await this.predictNextBet(historicalData),
            winStreakProbability: this.calculateWinStreakProbability(historicalData),
            lossRiskAssessment: this.assessLossRisk(historicalData),
            behaviorChangeIndicators: this.detectBehaviorChanges(historicalData),
            economicImpactForecast: this.forecastEconomicImpact(historicalData),
            sessionOutcomePrediction: this.predictSessionOutcome(historicalData)
        };
    }

    async predictNextBet(historicalData) {
        // Use multiple prediction models
        const models = {
            linearRegression: this.linearRegressionPredict(historicalData),
            movingAverage: this.movingAveragePredict(historicalData),
            exponentialSmoothing: this.exponentialSmoothingPredict(historicalData),
            neuralNetwork: await this.neuralNetwork.predict(historicalData)
        };

        // Ensemble prediction - combine multiple models
        const ensemblePrediction = this.combineModelPredictions(models);
        
        return {
            predictedAmount: ensemblePrediction.amount,
            confidence: ensemblePrediction.confidence,
            models: models,
            reasoning: this.generatePredictionReasoning(models, ensemblePrediction)
        };
    }

    /**
     * Advanced Pattern Recognition
     */
    recognizePatterns(data, patternType) {
        switch(patternType) {
            case 'betting':
                return this.recognizeBettingPatterns(data);
            case 'temporal':
                return this.recognizeTemporalPatterns(data);
            case 'sequential':
                return this.recognizeSequentialPatterns(data);
            case 'cyclical':
                return this.recognizeCyclicalPatterns(data);
            default:
                return this.recognizeAllPatterns(data);
        }
    }

    recognizeBettingPatterns(data) {
        const patterns = [];
        
        // Martingale pattern detection
        const martingalePattern = this.detectMartingalePattern(data);
        if (martingalePattern.strength > 0.7) {
            patterns.push({
                type: 'martingale',
                strength: martingalePattern.strength,
                instances: martingalePattern.instances,
                riskLevel: 'HIGH'
            });
        }

        // Progressive betting patterns
        const progressivePattern = this.detectProgressivePattern(data);
        if (progressivePattern.strength > 0.6) {
            patterns.push({
                type: 'progressive',
                strength: progressivePattern.strength,
                direction: progressivePattern.direction,
                riskLevel: 'MEDIUM'
            });
        }

        // Flat betting pattern
        const flatPattern = this.detectFlatBettingPattern(data);
        if (flatPattern.strength > 0.8) {
            patterns.push({
                type: 'flat',
                strength: flatPattern.strength,
                consistency: flatPattern.consistency,
                riskLevel: 'LOW'
            });
        }

        return patterns;
    }

    /**
     * Economic Impact Analysis
     */
    async analyzeEconomicImpact(userId) {
        const playerData = await this.getPlayerEconomicData(userId);
        const systemData = await this.getSystemEconomicData();
        
        return {
            playerImpact: this.calculatePlayerEconomicImpact(playerData),
            systemImpact: this.calculateSystemImpact(playerData, systemData),
            velocityAnalysis: this.analyzeMoneyVelocity(playerData),
            liquidityContribution: this.calculateLiquidityContribution(playerData),
            economicStability: this.assessEconomicStability(playerData, systemData)
        };
    }

    /**
     * Dynamic Multiplier Calculation with Deep Learning
     */
    async calculateIntelligentMultiplier(userId, gameType, betAmount, context = {}) {
        // Get comprehensive analysis
        const analysis = await this.analyzePlayer(userId);
        
        // Base multiplier (3.0 max as per requirements)
        let baseMultiplier = 3.0;
        
        // Intelligence-based adjustments
        const adjustments = {
            statistical: this.getStatisticalAdjustment(analysis.dimensions.statistical),
            behavioral: this.getBehavioralAdjustment(analysis.dimensions.behavioral),
            predictive: this.getPredictiveAdjustment(analysis.dimensions.predictive),
            economic: this.getEconomicAdjustment(analysis.dimensions.economic),
            risk: this.getRiskAdjustment(analysis.dimensions.risk)
        };

        // Advanced composite calculation
        const intelligenceScore = this.calculateIntelligenceScore(adjustments);
        const finalMultiplier = this.applyIntelligentAdjustments(baseMultiplier, intelligenceScore, adjustments);
        
        // Ensure bounds (0.1x to 3.0x)
        const boundedMultiplier = Math.max(0.1, Math.min(finalMultiplier, 3.0));
        
        return {
            finalMultiplier: boundedMultiplier,
            baseMultiplier,
            adjustments,
            intelligenceScore,
            reasoning: this.generateIntelligentReasoning(analysis, adjustments, boundedMultiplier),
            confidence: this.calculateAdjustmentConfidence(analysis)
        };
    }

    /**
     * Mathematical Utility Functions
     */
    mean(data) {
        return data.reduce((sum, val) => sum + val, 0) / data.length;
    }

    median(sortedData) {
        const n = sortedData.length;
        return n % 2 === 0 
            ? (sortedData[n/2 - 1] + sortedData[n/2]) / 2
            : sortedData[Math.floor(n/2)];
    }

    standardDeviation(data) {
        const avg = this.mean(data);
        const squaredDiffs = data.map(val => Math.pow(val - avg, 2));
        return Math.sqrt(this.mean(squaredDiffs));
    }

    variance(data) {
        return Math.pow(this.standardDeviation(data), 2);
    }

    skewness(data) {
        const avg = this.mean(data);
        const stdDev = this.standardDeviation(data);
        const n = data.length;
        
        const cubedDiffs = data.map(val => Math.pow((val - avg) / stdDev, 3));
        return (n * this.mean(cubedDiffs)) / ((n - 1) * (n - 2));
    }

    kurtosis(data) {
        const avg = this.mean(data);
        const stdDev = this.standardDeviation(data);
        const n = data.length;
        
        const fourthPowerDiffs = data.map(val => Math.pow((val - avg) / stdDev, 4));
        return (n * (n + 1) * this.mean(fourthPowerDiffs)) / ((n - 1) * (n - 2) * (n - 3)) - 3;
    }

    calculatePercentiles(sortedData, percentiles) {
        const result = {};
        percentiles.forEach(p => {
            const index = Math.ceil((p / 100) * sortedData.length) - 1;
            result[`p${p}`] = sortedData[Math.max(0, Math.min(index, sortedData.length - 1))];
        });
        return result;
    }

    /**
     * Advanced Correlation Analysis
     */
    calculateCorrelations(gameData) {
        const variables = {
            betAmount: gameData.map(g => g.betAmount),
            payout: gameData.map(g => g.payout),
            profit: gameData.map(g => g.payout - g.betAmount),
            timeOfDay: gameData.map(g => new Date(g.timestamp).getHours()),
            dayOfWeek: gameData.map(g => new Date(g.timestamp).getDay()),
            sessionLength: this.calculateSessionLengths(gameData)
        };

        const correlations = {};
        const varNames = Object.keys(variables);
        
        for (let i = 0; i < varNames.length; i++) {
            for (let j = i + 1; j < varNames.length; j++) {
                const var1 = varNames[i];
                const var2 = varNames[j];
                correlations[`${var1}_${var2}`] = this.pearsonCorrelation(variables[var1], variables[var2]);
            }
        }

        return correlations;
    }

    pearsonCorrelation(x, y) {
        const n = Math.min(x.length, y.length);
        if (n === 0) return 0;
        
        const sumX = x.slice(0, n).reduce((a, b) => a + b, 0);
        const sumY = y.slice(0, n).reduce((a, b) => a + b, 0);
        const sumXY = x.slice(0, n).reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumX2 = x.slice(0, n).reduce((sum, xi) => sum + xi * xi, 0);
        const sumY2 = y.slice(0, n).reduce((sum, yi) => sum + yi * yi, 0);
        
        const numerator = n * sumXY - sumX * sumY;
        const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
        
        return denominator === 0 ? 0 : numerator / denominator;
    }
}

/**
 * Simple Neural Network for Pattern Recognition
 */
class SimpleNeuralNetwork {
    constructor() {
        this.weights = this.initializeWeights();
        this.learningRate = 0.01;
    }

    initializeWeights() {
        // Simple 3-layer network: input -> hidden -> output
        return {
            inputToHidden: this.randomMatrix(10, 5),
            hiddenToOutput: this.randomMatrix(5, 1)
        };
    }

    randomMatrix(rows, cols) {
        return Array(rows).fill().map(() => 
            Array(cols).fill().map(() => Math.random() * 2 - 1)
        );
    }

    sigmoid(x) {
        return 1 / (1 + Math.exp(-x));
    }

    async predict(inputData) {
        // Normalize and prepare input
        const normalizedInput = this.normalizeData(inputData);
        const input = this.prepareInput(normalizedInput);
        
        // Forward propagation
        const hiddenLayer = this.matrixMultiply(input, this.weights.inputToHidden).map(x => this.sigmoid(x));
        const output = this.matrixMultiply(hiddenLayer, this.weights.hiddenToOutput).map(x => this.sigmoid(x));
        
        return {
            prediction: output[0],
            confidence: this.calculatePredictionConfidence(hiddenLayer, output),
            hiddenActivations: hiddenLayer
        };
    }
}

/**
 * Anomaly Detection System
 */
class AnomalyDetectionSystem {
    detectAnomalies(data, threshold = 2) {
        const anomalies = [];
        
        // Statistical anomalies (outliers)
        const statisticalAnomalies = this.detectStatisticalAnomalies(data, threshold);
        anomalies.push(...statisticalAnomalies);
        
        // Pattern anomalies
        const patternAnomalies = this.detectPatternAnomalies(data);
        anomalies.push(...patternAnomalies);
        
        // Temporal anomalies
        const temporalAnomalies = this.detectTemporalAnomalies(data);
        anomalies.push(...temporalAnomalies);
        
        return {
            anomalies,
            totalCount: anomalies.length,
            riskLevel: this.assessAnomalyRisk(anomalies),
            recommendations: this.generateAnomalyRecommendations(anomalies)
        };
    }

    detectStatisticalAnomalies(data, threshold) {
        const values = data.map(d => d.betAmount);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const stdDev = Math.sqrt(values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length);
        
        return data.filter((item, index) => {
            const zScore = Math.abs((values[index] - mean) / stdDev);
            return zScore > threshold;
        }).map((item, index) => ({
            type: 'statistical',
            data: item,
            severity: this.calculateSeverity(Math.abs((item.betAmount - mean) / stdDev)),
            description: `Bet amount ${item.betAmount} is ${Math.abs((item.betAmount - mean) / stdDev).toFixed(2)} standard deviations from mean`
        }));
    }
}

module.exports = DeepAnalytics;