/**
 * ENHANCED TREND ANALYZER - Advanced Pattern Recognition & Predictive Analytics
 * 
 * Builds upon the existing GameTrendAnalyzer with:
 * - Machine learning-based pattern prediction
 * - Cross-game behavioral analysis
 * - Player clustering and segmentation
 * - Advanced statistical modeling
 * - Real-time anomaly detection
 * - Predictive win/loss forecasting
 */

const GameTrendAnalyzer = require('./GameTrendAnalyzer');
const logger = require('./logger');
const { secureRandomFloat } = require('./rng');
const { EmbedBuilder } = require('discord.js');
const { fmt } = require('./common');

class EnhancedTrendAnalyzer extends GameTrendAnalyzer {
    constructor() {
        super();
        
        // Enhanced configuration
        this.enhancedConfig = {
            // ML Configuration
            mlEnabled: true,
            minDataForML: 1000,           // Minimum data points for ML predictions
            predictionWindow: 100,         // Number of future events to predict
            confidenceThreshold: 0.75,     // Minimum confidence for predictions
            
            // Cross-game analysis
            crossGameCorrelation: true,
            correlationThreshold: 0.6,     // Minimum correlation coefficient
            
            // Player clustering
            clusteringEnabled: true,
            minClusterSize: 10,            // Minimum players per cluster
            maxClusters: 20,               // Maximum number of clusters
            
            // Anomaly detection
            anomalyEnabled: true,
            anomalyZScore: 3,              // Z-score for anomaly detection
            anomalyWindow: 1000,           // Rolling window for anomaly detection
            
            // Advanced metrics
            volatilityTracking: true,
            sentimentAnalysis: true,
            velocityTracking: true,        // Track rate of change in patterns
            
            // Reporting
            reportingInterval: 3600000,    // 1 hour
            detailedLogging: true
        };
        
        // Initialize enhanced data structures
        this.initializeEnhancedStructures();
        
        // Start enhanced monitoring
        this.startEnhancedMonitoring();
        
        logger.info('🚀 Enhanced Trend Analyzer initialized with advanced features');
    }
    
    /**
     * Initialize enhanced data structures
     */
    initializeEnhancedStructures() {
        // Machine learning models (simplified for now)
        this.mlModels = new Map();
        
        // Cross-game correlation matrix
        this.correlationMatrix = new Map();
        
        // Player clusters
        this.playerClusters = new Map();
        
        // Anomaly detection buffers
        this.anomalyBuffers = new Map();
        
        // Advanced metrics
        this.advancedMetrics = {
            volatility: new Map(),
            velocity: new Map(),
            sentiment: new Map(),
            predictions: new Map()
        };
        
        // Enhanced statistical models (separate from parent's statisticalModels)
        this.enhancedModels = {
            markovChains: new Map(),      // For sequence prediction
            bayesianNetworks: new Map(),   // For probabilistic inference
            timeSeries: new Map()          // For temporal patterns
        };
        
        // Pattern library
        this.patternLibrary = {
            martingale: this.detectMartingalePattern.bind(this),
            fibonacci: this.detectFibonacciPattern.bind(this),
            paroli: this.detectParoliPattern.bind(this),
            dalembert: this.detectDalembertPattern.bind(this),
            labouchere: this.detectLaboucherePattern.bind(this),
            kellycriterion: this.detectKellyPattern.bind(this)
        };
    }
    
    /**
     * Enhanced choice recording with ML and cross-game analysis
     */
    async recordChoice(gameType, userId, choice, metadata = {}) {
        // Call parent implementation
        await super.recordChoice(gameType, userId, choice, metadata);
        
        // Enhanced processing
        await this.performEnhancedAnalysis(gameType, userId, choice, metadata);
    }
    
    /**
     * Perform enhanced analysis on recorded choice
     */
    async performEnhancedAnalysis(gameType, userId, choice, metadata) {
        try {
            // Update player cluster
            await this.updatePlayerCluster(userId, gameType, choice, metadata);
            
            // Detect betting patterns
            const patterns = await this.detectBettingPatterns(userId, gameType, metadata);
            if (patterns.length > 0) {
                await this.handleDetectedPatterns(userId, patterns);
            }
            
            // Check for anomalies
            const anomaly = await this.detectAnomaly(gameType, userId, choice, metadata);
            if (anomaly) {
                await this.handleAnomaly(anomaly);
            }
            
            // Update cross-game correlations
            await this.updateCrossGameCorrelations(userId, gameType);
            
            // Generate predictions if enough data
            if (this.hasEnoughDataForML(gameType)) {
                await this.generatePredictions(gameType);
            }
            
            // Update volatility metrics
            await this.updateVolatility(gameType);
            
            // Calculate velocity of pattern changes
            await this.updateVelocity(gameType);
            
        } catch (error) {
            logger.error(`Enhanced analysis error: ${error.message}`);
        }
    }
    
    /**
     * Detect common betting patterns
     */
    async detectBettingPatterns(userId, gameType, metadata) {
        const detectedPatterns = [];
        
        if (!metadata.betAmount) return detectedPatterns;
        
        // Get user's recent betting history
        const profile = this.playerBehaviorProfiles.get(userId);
        if (!profile || !profile.games.has(gameType)) return detectedPatterns;
        
        const gameProfile = profile.games.get(gameType);
        const recentBets = gameProfile.choices
            .slice(-10)
            .map(c => c.metadata.betAmount)
            .filter(b => b > 0);
        
        if (recentBets.length < 3) return detectedPatterns;
        
        // Check each pattern
        for (const [patternName, detector] of Object.entries(this.patternLibrary)) {
            const pattern = detector(recentBets);
            if (pattern.detected) {
                detectedPatterns.push({
                    name: patternName,
                    confidence: pattern.confidence,
                    details: pattern.details
                });
            }
        }
        
        return detectedPatterns;
    }
    
    /**
     * Detect Martingale betting pattern
     */
    detectMartingalePattern(bets) {
        if (bets.length < 3) return { detected: false };
        
        let doublingCount = 0;
        for (let i = 1; i < bets.length; i++) {
            const ratio = bets[i] / bets[i-1];
            if (ratio >= 1.8 && ratio <= 2.2) { // Allow some tolerance
                doublingCount++;
            }
        }
        
        const confidence = doublingCount / (bets.length - 1);
        return {
            detected: confidence >= 0.6,
            confidence,
            details: { doublingCount, totalBets: bets.length }
        };
    }
    
    /**
     * Detect Fibonacci betting pattern
     */
    detectFibonacciPattern(bets) {
        if (bets.length < 4) return { detected: false };
        
        // Generate Fibonacci sequence for comparison
        const fib = [1, 1];
        while (fib[fib.length - 1] < Math.max(...bets) * 2) {
            fib.push(fib[fib.length - 1] + fib[fib.length - 2]);
        }
        
        // Normalize bets to match Fibonacci scale
        const minBet = Math.min(...bets);
        const normalizedBets = bets.map(b => Math.round(b / minBet));
        
        // Check for Fibonacci pattern
        let matches = 0;
        for (const bet of normalizedBets) {
            if (fib.includes(bet)) matches++;
        }
        
        const confidence = matches / bets.length;
        return {
            detected: confidence >= 0.7,
            confidence,
            details: { matches, pattern: normalizedBets }
        };
    }
    
    /**
     * Detect Paroli betting pattern (positive progression)
     */
    detectParoliPattern(bets) {
        if (bets.length < 3) return { detected: false };
        
        let increasingStreaks = 0;
        let currentStreak = 0;
        
        for (let i = 1; i < bets.length; i++) {
            if (bets[i] > bets[i-1]) {
                currentStreak++;
                if (currentStreak >= 2) increasingStreaks++;
            } else {
                currentStreak = 0;
            }
        }
        
        const confidence = increasingStreaks / Math.max(1, bets.length - 2);
        return {
            detected: confidence >= 0.5,
            confidence,
            details: { increasingStreaks }
        };
    }
    
    /**
     * Detect D'Alembert betting pattern
     */
    detectDalembertPattern(bets) {
        if (bets.length < 4) return { detected: false };
        
        let consistentChanges = 0;
        const changes = [];
        
        for (let i = 1; i < bets.length; i++) {
            changes.push(bets[i] - bets[i-1]);
        }
        
        // Check for consistent unit changes
        const avgChange = changes.reduce((a, b) => a + Math.abs(b), 0) / changes.length;
        const unit = Math.round(avgChange);
        
        for (const change of changes) {
            if (Math.abs(Math.abs(change) - unit) < unit * 0.3) { // 30% tolerance
                consistentChanges++;
            }
        }
        
        const confidence = consistentChanges / changes.length;
        return {
            detected: confidence >= 0.6,
            confidence,
            details: { unit, consistentChanges }
        };
    }
    
    /**
     * Detect Labouchere betting pattern
     */
    detectLaboucherePattern(bets) {
        if (bets.length < 5) return { detected: false };
        
        // Labouchere creates specific sum patterns
        let patternMatches = 0;
        
        for (let i = 2; i < bets.length; i++) {
            // Check if current bet could be sum of two previous non-adjacent bets
            for (let j = 0; j < i - 1; j++) {
                if (Math.abs(bets[i] - (bets[j] + bets[i-1])) < bets[i] * 0.1) {
                    patternMatches++;
                    break;
                }
            }
        }
        
        const confidence = patternMatches / (bets.length - 2);
        return {
            detected: confidence >= 0.5,
            confidence,
            details: { patternMatches }
        };
    }
    
    /**
     * Detect Kelly Criterion betting pattern
     */
    detectKellyPattern(bets) {
        if (bets.length < 5) return { detected: false };
        
        // Kelly Criterion results in proportional betting
        const total = bets.reduce((a, b) => a + b, 0);
        const proportions = bets.map(b => b / total);
        
        // Check for consistent proportions (within range)
        const avgProportion = 1 / bets.length;
        let consistentProps = 0;
        
        for (const prop of proportions) {
            if (prop >= avgProportion * 0.5 && prop <= avgProportion * 2) {
                consistentProps++;
            }
        }
        
        const confidence = consistentProps / bets.length;
        return {
            detected: confidence >= 0.7,
            confidence,
            details: { proportions, avgProportion }
        };
    }
    
    /**
     * Handle detected betting patterns
     */
    async handleDetectedPatterns(userId, patterns) {
        for (const pattern of patterns) {
            if (pattern.confidence >= 0.8) {
                logger.warn(`🎯 Betting pattern detected for user ${userId}: ${pattern.name} (${(pattern.confidence * 100).toFixed(1)}% confidence)`);
                
                // Store pattern detection
                if (!this.advancedMetrics.predictions.has(userId)) {
                    this.advancedMetrics.predictions.set(userId, {
                        patterns: [],
                        lastUpdate: Date.now()
                    });
                }
                
                const userPredictions = this.advancedMetrics.predictions.get(userId);
                userPredictions.patterns.push({
                    type: pattern.name,
                    confidence: pattern.confidence,
                    timestamp: Date.now(),
                    details: pattern.details
                });
                
                // Keep only recent patterns
                if (userPredictions.patterns.length > 50) {
                    userPredictions.patterns.splice(0, 10);
                }
            }
        }
    }
    
    /**
     * Detect anomalies in player behavior
     */
    async detectAnomaly(gameType, userId, choice, metadata) {
        if (!this.enhancedConfig.anomalyEnabled) return null;
        
        // Get or create anomaly buffer for this game
        if (!this.anomalyBuffers.has(gameType)) {
            this.anomalyBuffers.set(gameType, {
                values: [],
                mean: 0,
                stdDev: 0
            });
        }
        
        const buffer = this.anomalyBuffers.get(gameType);
        
        // Convert choice to numeric value for analysis
        const value = this.choiceToNumericValue(gameType, choice, metadata);
        if (value === null) return null;
        
        buffer.values.push(value);
        
        // Keep rolling window
        if (buffer.values.length > this.enhancedConfig.anomalyWindow) {
            buffer.values.shift();
        }
        
        // Need minimum data for statistics
        if (buffer.values.length < 30) return null;
        
        // Calculate statistics
        buffer.mean = buffer.values.reduce((a, b) => a + b, 0) / buffer.values.length;
        const variance = buffer.values.reduce((sum, val) => sum + Math.pow(val - buffer.mean, 2), 0) / buffer.values.length;
        buffer.stdDev = Math.sqrt(variance);
        
        // Check for anomaly
        const zScore = Math.abs((value - buffer.mean) / buffer.stdDev);
        
        if (zScore >= this.enhancedConfig.anomalyZScore) {
            return {
                gameType,
                userId,
                choice,
                value,
                zScore,
                mean: buffer.mean,
                stdDev: buffer.stdDev,
                timestamp: Date.now()
            };
        }
        
        return null;
    }
    
    /**
     * Convert choice to numeric value for anomaly detection
     */
    choiceToNumericValue(gameType, choice, metadata) {
        // Game-specific conversions
        switch (gameType) {
            case 'roulette':
                if (choice === 'red') return 0;
                if (choice === 'black') return 1;
                if (choice === 'green') return 2;
                return parseInt(choice) || null;
                
            case 'crash':
                return metadata.multiplier || null;
                
            case 'blackjack':
                if (choice === 'hit') return 0;
                if (choice === 'stand') return 1;
                if (choice === 'double') return 2;
                if (choice === 'split') return 3;
                return null;
                
            case 'rps':
                if (choice === 'rock') return 0;
                if (choice === 'paper') return 1;
                if (choice === 'scissors') return 2;
                return null;
                
            default:
                // Try to extract bet amount as numeric value
                return metadata.betAmount || null;
        }
    }
    
    /**
     * Handle detected anomaly
     */
    async handleAnomaly(anomaly) {
        logger.warn(`🚨 ANOMALY DETECTED in ${anomaly.gameType}`);
        logger.warn(`   User: ${anomaly.userId} | Choice: ${anomaly.choice}`);
        logger.warn(`   Z-Score: ${anomaly.zScore.toFixed(2)} (threshold: ${this.enhancedConfig.anomalyZScore})`);
        logger.warn(`   Value: ${anomaly.value} | Mean: ${anomaly.mean.toFixed(2)} | StdDev: ${anomaly.stdDev.toFixed(2)}`);
        
        // Could trigger additional analysis or adjustments here
    }
    
    /**
     * Update player clustering
     */
    async updatePlayerCluster(userId, gameType, choice, metadata) {
        if (!this.enhancedConfig.clusteringEnabled) return;
        
        // Get or create player feature vector
        const features = this.extractPlayerFeatures(userId, gameType, choice, metadata);
        if (!features) return;
        
        // Simple k-means style clustering (simplified for demonstration)
        let bestCluster = null;
        let bestDistance = Infinity;
        
        for (const [clusterId, cluster] of this.playerClusters) {
            const distance = this.calculateFeatureDistance(features, cluster.centroid);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestCluster = clusterId;
            }
        }
        
        // Create new cluster if distance too large or no clusters exist
        if (bestDistance > 0.5 || !bestCluster) {
            const newClusterId = `cluster_${this.playerClusters.size + 1}`;
            this.playerClusters.set(newClusterId, {
                centroid: features,
                members: new Set([userId]),
                gameTypes: new Set([gameType]),
                created: Date.now()
            });
        } else {
            // Add to existing cluster
            const cluster = this.playerClusters.get(bestCluster);
            cluster.members.add(userId);
            cluster.gameTypes.add(gameType);
            
            // Update centroid (running average)
            const weight = 1 / cluster.members.size;
            for (const key in features) {
                cluster.centroid[key] = cluster.centroid[key] * (1 - weight) + features[key] * weight;
            }
        }
    }
    
    /**
     * Extract feature vector for player
     */
    extractPlayerFeatures(userId, gameType, choice, metadata) {
        const profile = this.playerBehaviorProfiles.get(userId);
        if (!profile) return null;
        
        const gameProfile = profile.games.get(gameType);
        if (!gameProfile) return null;
        
        // Extract features
        return {
            winRate: gameProfile.winRate,
            avgBet: gameProfile.averageBet,
            riskProfile: gameProfile.riskProfile,
            sessionCount: Math.min(gameProfile.sessions / 100, 1), // Normalize
            overallRisk: profile.overallRisk,
            gameVariety: profile.games.size / 10 // Normalize
        };
    }
    
    /**
     * Calculate distance between feature vectors
     */
    calculateFeatureDistance(features1, features2) {
        let sumSquares = 0;
        for (const key in features1) {
            const diff = (features1[key] || 0) - (features2[key] || 0);
            sumSquares += diff * diff;
        }
        return Math.sqrt(sumSquares);
    }
    
    /**
     * Update cross-game correlations
     */
    async updateCrossGameCorrelations(userId, gameType) {
        if (!this.enhancedConfig.crossGameCorrelation) return;
        
        const profile = this.playerBehaviorProfiles.get(userId);
        if (!profile || profile.games.size < 2) return;
        
        // Calculate correlations between games
        for (const [game1, profile1] of profile.games) {
            for (const [game2, profile2] of profile.games) {
                if (game1 >= game2) continue; // Avoid duplicates
                
                const key = `${game1}_${game2}`;
                const correlation = this.calculateCorrelation(profile1, profile2);
                
                if (!this.correlationMatrix.has(key)) {
                    this.correlationMatrix.set(key, {
                        values: [],
                        average: 0
                    });
                }
                
                const matrix = this.correlationMatrix.get(key);
                matrix.values.push(correlation);
                
                // Keep rolling average
                if (matrix.values.length > 100) {
                    matrix.values.shift();
                }
                
                matrix.average = matrix.values.reduce((a, b) => a + b, 0) / matrix.values.length;
                
                // Log high correlations
                if (Math.abs(matrix.average) >= this.enhancedConfig.correlationThreshold) {
                    logger.debug(`High correlation detected between ${game1} and ${game2}: ${matrix.average.toFixed(3)}`);
                }
            }
        }
    }
    
    /**
     * Calculate correlation between two game profiles
     */
    calculateCorrelation(profile1, profile2) {
        // Simple correlation based on win rates and risk profiles
        const winRateCorr = 1 - Math.abs(profile1.winRate - profile2.winRate);
        const riskCorr = 1 - Math.abs(profile1.riskProfile - profile2.riskProfile);
        
        return (winRateCorr + riskCorr) / 2;
    }
    
    /**
     * Check if enough data for ML predictions
     */
    hasEnoughDataForML(gameType) {
        const gameData = this.trendData.get(gameType);
        return gameData && gameData.totalChoices >= this.enhancedConfig.minDataForML;
    }
    
    /**
     * Generate ML-based predictions
     */
    async generatePredictions(gameType) {
        try {
            const gameData = this.trendData.get(gameType);
            if (!gameData) return;
            
            // Build Markov chain for sequence prediction
            const markovChain = this.buildMarkovChain(gameType, gameData);
            this.enhancedModels.markovChains.set(gameType, markovChain);
            
            // Generate predictions
            const predictions = this.predictNextChoices(markovChain, 10);
            
            // Store predictions
            this.advancedMetrics.predictions.set(gameType, {
                nextChoices: predictions,
                confidence: this.calculatePredictionConfidence(predictions),
                generated: Date.now()
            });
            
        } catch (error) {
            logger.error(`Prediction generation error for ${gameType}: ${error.message}`);
        }
    }
    
    /**
     * Build Markov chain from game data
     */
    buildMarkovChain(gameType, gameData) {
        const transitions = new Map();
        
        // Build transition matrix based on game-specific data
        switch (gameType) {
            case 'rps':
                if (gameData.sequencePatterns) {
                    for (const [userId, sequence] of gameData.sequencePatterns) {
                        for (let i = 0; i < sequence.length - 1; i++) {
                            const current = sequence[i];
                            const next = sequence[i + 1];
                            
                            if (!transitions.has(current)) {
                                transitions.set(current, new Map());
                            }
                            
                            const nextStates = transitions.get(current);
                            nextStates.set(next, (nextStates.get(next) || 0) + 1);
                        }
                    }
                }
                break;
                
            default:
                // Generic transition building
                if (gameData.patterns) {
                    for (const [userId, pattern] of gameData.patterns) {
                        for (let i = 0; i < pattern.length - 1; i++) {
                            const current = pattern[i].choice;
                            const next = pattern[i + 1].choice;
                            
                            if (!transitions.has(current)) {
                                transitions.set(current, new Map());
                            }
                            
                            const nextStates = transitions.get(current);
                            nextStates.set(next, (nextStates.get(next) || 0) + 1);
                        }
                    }
                }
        }
        
        // Normalize to probabilities
        for (const [state, nextStates] of transitions) {
            const total = Array.from(nextStates.values()).reduce((a, b) => a + b, 0);
            for (const [nextState, count] of nextStates) {
                nextStates.set(nextState, count / total);
            }
        }
        
        return transitions;
    }
    
    /**
     * Predict next choices using Markov chain
     */
    predictNextChoices(markovChain, count) {
        const predictions = [];
        
        if (markovChain.size === 0) return predictions;
        
        // Start from random state
        const states = Array.from(markovChain.keys());
        let currentState = states[Math.floor(secureRandomFloat() * states.length)];
        
        for (let i = 0; i < count; i++) {
            const nextStates = markovChain.get(currentState);
            if (!nextStates) break;
            
            // Choose next state based on probabilities
            const rand = secureRandomFloat();
            let cumulative = 0;
            let nextState = currentState;
            
            for (const [state, prob] of nextStates) {
                cumulative += prob;
                if (rand <= cumulative) {
                    nextState = state;
                    break;
                }
            }
            
            predictions.push(nextState);
            currentState = nextState;
        }
        
        return predictions;
    }
    
    /**
     * Calculate prediction confidence
     */
    calculatePredictionConfidence(predictions) {
        if (predictions.length === 0) return 0;
        
        // Calculate entropy (lower entropy = higher confidence)
        const counts = {};
        for (const pred of predictions) {
            counts[pred] = (counts[pred] || 0) + 1;
        }
        
        let entropy = 0;
        const total = predictions.length;
        
        for (const count of Object.values(counts)) {
            const p = count / total;
            if (p > 0) {
                entropy -= p * Math.log2(p);
            }
        }
        
        // Convert entropy to confidence (0-1 scale)
        const maxEntropy = Math.log2(Object.keys(counts).length);
        const confidence = 1 - (entropy / maxEntropy);
        
        return confidence;
    }
    
    /**
     * Update volatility metrics
     */
    async updateVolatility(gameType) {
        if (!this.enhancedConfig.volatilityTracking) return;
        
        const gameData = this.trendData.get(gameType);
        if (!gameData) return;
        
        // Calculate volatility based on recent choice distributions
        let volatility = 0;
        
        if (gameData.choices && gameData.choices.size > 0) {
            const values = Array.from(gameData.choices.values());
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
            volatility = Math.sqrt(variance) / mean; // Coefficient of variation
        }
        
        this.advancedMetrics.volatility.set(gameType, {
            value: volatility,
            timestamp: Date.now()
        });
    }
    
    /**
     * Update velocity of pattern changes
     */
    async updateVelocity(gameType) {
        if (!this.enhancedConfig.velocityTracking) return;
        
        const gameData = this.trendData.get(gameType);
        if (!gameData) return;
        
        // Calculate rate of change in dominant strategies
        const nashState = this.nashEquilibriumState.get(gameType);
        if (!nashState) return;
        
        const timeSinceShift = Date.now() - nashState.lastShift;
        const velocity = timeSinceShift > 0 ? 1 / timeSinceShift : 0;
        
        this.advancedMetrics.velocity.set(gameType, {
            value: velocity,
            dominantStrategy: nashState.dominantStrategy,
            timestamp: Date.now()
        });
    }
    
    /**
     * Start enhanced monitoring
     */
    startEnhancedMonitoring() {
        // Enhanced reporting interval - send to log channel
        setInterval(async () => {
            await this.sendLogChannelReport();
        }, this.enhancedConfig.reportingInterval);
        
        // Cluster maintenance
        setInterval(async () => {
            await this.maintainClusters();
        }, 10 * 60 * 1000); // Every 10 minutes
        
        // Prediction refresh
        setInterval(async () => {
            await this.refreshPredictions();
        }, 5 * 60 * 1000); // Every 5 minutes
        
        // Quick summary every 15 minutes
        setInterval(async () => {
            await this.sendQuickSummary();
        }, 15 * 60 * 1000); // Every 15 minutes
    }
    
    /**
     * Generate enhanced trend report
     */
    async generateEnhancedReport() {
        const report = {
            timestamp: new Date().toISOString(),
            basicMetrics: super.getTrendSummary(),
            enhancedMetrics: {
                clusters: {
                    total: this.playerClusters.size,
                    largest: this.getLargestCluster(),
                    mostActive: this.getMostActiveCluster()
                },
                correlations: this.getTopCorrelations(),
                predictions: this.getActivePredictions(),
                anomalies: this.getRecentAnomalies(),
                volatility: this.getVolatilitySummary(),
                patterns: this.getDetectedPatterns()
            }
        };
        
        if (this.enhancedConfig.detailedLogging) {
            logger.info('📊 ENHANCED TREND ANALYSIS REPORT');
            logger.info(`   Clusters: ${report.enhancedMetrics.clusters.total}`);
            logger.info(`   Active Predictions: ${report.enhancedMetrics.predictions.length}`);
            logger.info(`   Top Correlations: ${report.enhancedMetrics.correlations.length}`);
            
            // Log high-risk patterns
            const highRiskPatterns = report.enhancedMetrics.patterns.filter(p => p.risk === 'high');
            if (highRiskPatterns.length > 0) {
                logger.warn(`   ⚠️ High-risk patterns detected: ${highRiskPatterns.map(p => p.name).join(', ')}`);
            }
        }
        
        return report;
    }
    
    /**
     * Get largest player cluster
     */
    getLargestCluster() {
        let largest = null;
        let maxSize = 0;
        
        for (const [id, cluster] of this.playerClusters) {
            if (cluster.members.size > maxSize) {
                maxSize = cluster.members.size;
                largest = {
                    id,
                    size: cluster.members.size,
                    games: Array.from(cluster.gameTypes)
                };
            }
        }
        
        return largest;
    }
    
    /**
     * Get most active cluster
     */
    getMostActiveCluster() {
        // Implementation would track activity metrics
        return this.getLargestCluster(); // Simplified for now
    }
    
    /**
     * Get top correlations
     */
    getTopCorrelations() {
        const correlations = [];
        
        for (const [key, data] of this.correlationMatrix) {
            if (Math.abs(data.average) >= this.enhancedConfig.correlationThreshold) {
                const [game1, game2] = key.split('_');
                correlations.push({
                    games: [game1, game2],
                    correlation: data.average
                });
            }
        }
        
        return correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)).slice(0, 5);
    }
    
    /**
     * Get active predictions
     */
    getActivePredictions() {
        const predictions = [];
        const now = Date.now();
        const maxAge = 10 * 60 * 1000; // 10 minutes
        
        for (const [gameType, pred] of this.advancedMetrics.predictions) {
            if (now - pred.generated < maxAge && pred.confidence >= this.enhancedConfig.confidenceThreshold) {
                predictions.push({
                    gameType,
                    confidence: pred.confidence,
                    age: Math.floor((now - pred.generated) / 1000)
                });
            }
        }
        
        return predictions;
    }
    
    /**
     * Get recent anomalies
     */
    getRecentAnomalies() {
        // Would track and return recent anomalies
        return [];
    }
    
    /**
     * Get volatility summary
     */
    getVolatilitySummary() {
        const summary = {};
        
        for (const [gameType, data] of this.advancedMetrics.volatility) {
            summary[gameType] = {
                volatility: data.value.toFixed(3),
                level: data.value > 0.5 ? 'high' : data.value > 0.2 ? 'medium' : 'low'
            };
        }
        
        return summary;
    }
    
    /**
     * Get detected patterns summary
     */
    getDetectedPatterns() {
        const patterns = [];
        
        for (const [userId, data] of this.advancedMetrics.predictions) {
            if (data.patterns && data.patterns.length > 0) {
                const latest = data.patterns[data.patterns.length - 1];
                patterns.push({
                    userId: userId.substring(0, 8) + '...',
                    name: latest.type,
                    confidence: latest.confidence,
                    risk: latest.type === 'martingale' ? 'high' : 'medium'
                });
            }
        }
        
        return patterns.slice(0, 10); // Top 10 patterns
    }
    
    /**
     * Maintain clusters (merge/split as needed)
     */
    async maintainClusters() {
        // Remove empty clusters
        for (const [id, cluster] of this.playerClusters) {
            if (cluster.members.size === 0) {
                this.playerClusters.delete(id);
            }
        }
        
        // Merge similar clusters if over limit
        if (this.playerClusters.size > this.enhancedConfig.maxClusters) {
            await this.mergeSimilarClusters();
        }
    }
    
    /**
     * Merge similar clusters
     */
    async mergeSimilarClusters() {
        const clusters = Array.from(this.playerClusters.entries());
        let minDistance = Infinity;
        let mergeA = null, mergeB = null;
        
        // Find two most similar clusters
        for (let i = 0; i < clusters.length; i++) {
            for (let j = i + 1; j < clusters.length; j++) {
                const distance = this.calculateFeatureDistance(
                    clusters[i][1].centroid,
                    clusters[j][1].centroid
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    mergeA = clusters[i][0];
                    mergeB = clusters[j][0];
                }
            }
        }
        
        // Merge if found
        if (mergeA && mergeB && minDistance < 0.3) {
            const clusterA = this.playerClusters.get(mergeA);
            const clusterB = this.playerClusters.get(mergeB);
            
            // Merge B into A
            for (const member of clusterB.members) {
                clusterA.members.add(member);
            }
            for (const game of clusterB.gameTypes) {
                clusterA.gameTypes.add(game);
            }
            
            // Update centroid
            const totalMembers = clusterA.members.size;
            const weightA = (clusterA.members.size - clusterB.members.size) / totalMembers;
            const weightB = clusterB.members.size / totalMembers;
            
            for (const key in clusterA.centroid) {
                clusterA.centroid[key] = clusterA.centroid[key] * weightA + (clusterB.centroid[key] || 0) * weightB;
            }
            
            // Remove cluster B
            this.playerClusters.delete(mergeB);
        }
    }
    
    /**
     * Refresh predictions for all games
     */
    async refreshPredictions() {
        for (const gameType of this.trendData.keys()) {
            if (this.hasEnoughDataForML(gameType)) {
                await this.generatePredictions(gameType);
            }
        }
    }
    
    /**
     * Get recommendation for game adjustment based on enhanced analysis
     */
    getEnhancedAdjustmentRecommendation(gameType) {
        const baseAdjustment = super.getTrendAdjustment(gameType);
        
        // Enhanced factors
        let enhancementMultiplier = 1.0;
        
        // Factor in volatility
        const volatility = this.advancedMetrics.volatility.get(gameType);
        if (volatility && volatility.value > 0.5) {
            enhancementMultiplier *= 1.2; // 20% increase for high volatility
        }
        
        // Factor in prediction confidence
        const predictions = this.advancedMetrics.predictions.get(gameType);
        if (predictions && predictions.confidence > 0.8) {
            enhancementMultiplier *= 1.15; // 15% increase for high confidence predictions
        }
        
        // Factor in cluster behavior
        const largestCluster = this.getLargestCluster();
        if (largestCluster && largestCluster.games.includes(gameType)) {
            enhancementMultiplier *= 1.1; // 10% increase if popular in largest cluster
        }
        
        return baseAdjustment * enhancementMultiplier;
    }
    
    /**
     * Send comprehensive report to log channel
     */
    async sendLogChannelReport() {
        try {
            // Get Discord client from bulletproof economy
            const bulletproofEconomy = require('../BULLETPROOF_ECONOMY/BulletproofEconomyController');
            const client = bulletproofEconomy.client;
            
            if (!client || !client.channels) {
                logger.debug('Discord client not available for trend reporting');
                return;
            }
            
            const logChannelId = process.env.LOG_CHANNEL_ID;
            if (!logChannelId) return;
            
            const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
            if (!logChannel) return;
            
            const report = await this.generateEnhancedReport();
            const summary = this.getTrendSummary();
            
            // Only send if there's significant activity
            if (summary.totalChoicesAnalyzed < 100) return;
            
            const embed = new EmbedBuilder()
                .setTitle('📊 Trend Analysis Report')
                .setDescription('Automated pattern detection and Nash equilibrium analysis')
                .setColor(0x00D4FF)
                .setTimestamp();
            
            // Active adjustments
            if (Object.keys(summary.activeAdjustments).length > 0) {
                const adjustmentText = Object.entries(summary.activeAdjustments)
                    .slice(0, 5)
                    .map(([game, data]) => 
                        `**${game}**: ${data.houseEdgeIncrease}`
                    ).join('\n');
                
                embed.addFields({
                    name: '🎯 Active Adjustments',
                    value: adjustmentText || 'None',
                    inline: true
                });
            }
            
            // High risk patterns
            if (report.enhancedMetrics) {
                const highRiskPatterns = report.enhancedMetrics.patterns
                    .filter(p => p.risk === 'high')
                    .slice(0, 3);
                
                if (highRiskPatterns.length > 0) {
                    embed.addFields({
                        name: '⚠️ High Risk Patterns',
                        value: highRiskPatterns
                            .map(p => `${p.name} (${(p.confidence * 100).toFixed(0)}%)`)
                            .join(', '),
                        inline: true
                    });
                }
                
                // Cluster info
                if (report.enhancedMetrics.clusters.total > 0) {
                    embed.addFields({
                        name: '👥 Player Clusters',
                        value: `Active: **${report.enhancedMetrics.clusters.total}**`,
                        inline: true
                    });
                }
            }
            
            // Statistics
            embed.addFields({
                name: '📈 Statistics',
                value: `Analyzed: **${summary.totalChoicesAnalyzed.toLocaleString()}** choices\n` +
                       `Profiles: **${summary.activePlayerProfiles}** players`,
                inline: false
            });
            
            await logChannel.send({ embeds: [embed] });
            
        } catch (error) {
            logger.error(`Error sending trend report to log channel: ${error.message}`);
        }
    }
    
    /**
     * Send quick summary for significant events
     */
    async sendQuickSummary() {
        try {
            const bulletproofEconomy = require('../BULLETPROOF_ECONOMY/BulletproofEconomyController');
            const client = bulletproofEconomy.client;
            
            if (!client || !client.channels) return;
            
            const logChannelId = process.env.LOG_CHANNEL_ID;
            if (!logChannelId) return;
            
            const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
            if (!logChannel) return;
            
            // Check for significant patterns in last 15 minutes
            const significantPatterns = [];
            const now = Date.now();
            const fifteenMinutes = 15 * 60 * 1000;
            
            // Check for new high-confidence patterns
            for (const [userId, data] of this.advancedMetrics.predictions) {
                if (data.patterns && data.patterns.length > 0) {
                    const recentPatterns = data.patterns.filter(p => 
                        now - p.timestamp < fifteenMinutes && p.confidence >= 0.8
                    );
                    
                    for (const pattern of recentPatterns) {
                        significantPatterns.push({
                            type: pattern.type,
                            confidence: pattern.confidence
                        });
                    }
                }
            }
            
            // Check for new adjustments
            const newAdjustments = [];
            for (const [gameType, adjustment] of this.gameAdjustments) {
                if (now - adjustment.appliedAt < fifteenMinutes) {
                    newAdjustments.push({
                        game: gameType,
                        adjustment: adjustment.houseEdgeAdjustment,
                        reason: adjustment.reason
                    });
                }
            }
            
            // Only send if there's something significant
            if (significantPatterns.length === 0 && newAdjustments.length === 0) return;
            
            const embed = new EmbedBuilder()
                .setTitle('🎯 Trend Alert')
                .setColor(0xFFD700)
                .setTimestamp();
            
            if (newAdjustments.length > 0) {
                embed.addFields({
                    name: '🆕 New Adjustments',
                    value: newAdjustments
                        .map(a => `**${a.game}**: +${(a.adjustment * 100).toFixed(2)}% (${a.reason})`)
                        .join('\n'),
                    inline: false
                });
            }
            
            if (significantPatterns.length > 0) {
                // Group patterns by type
                const patternCounts = {};
                for (const p of significantPatterns) {
                    patternCounts[p.type] = (patternCounts[p.type] || 0) + 1;
                }
                
                embed.addFields({
                    name: '🎲 Pattern Detections',
                    value: Object.entries(patternCounts)
                        .map(([type, count]) => `**${type}**: ${count} player${count > 1 ? 's' : ''}`)
                        .join('\n'),
                    inline: false
                });
            }
            
            await logChannel.send({ embeds: [embed] });
            
        } catch (error) {
            logger.error(`Error sending quick summary: ${error.message}`);
        }
    }
    
    /**
     * Send critical alert for extraordinary events
     */
    async sendCriticalAlert(alertType, data) {
        try {
            const bulletproofEconomy = require('../BULLETPROOF_ECONOMY/BulletproofEconomyController');
            const client = bulletproofEconomy.client;
            
            if (!client || !client.channels) return;
            
            const logChannelId = process.env.LOG_CHANNEL_ID;
            if (!logChannelId) return;
            
            const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
            if (!logChannel) return;
            
            const embed = new EmbedBuilder()
                .setTitle('🚨 CRITICAL TREND ALERT')
                .setColor(0xFF0000)
                .setTimestamp();
            
            switch (alertType) {
                case 'massive_win':
                    embed.setDescription(`Massive win detected requiring immediate adjustment`)
                        .addFields(
                            { name: 'Game', value: data.gameType, inline: true },
                            { name: 'Win Amount', value: fmt(data.winAmount), inline: true },
                            { name: 'Multiplier', value: `${data.multiplier.toFixed(1)}x`, inline: true },
                            { name: 'Emergency Adjustment', value: `+${(data.adjustment * 100).toFixed(1)}%`, inline: false }
                        );
                    break;
                    
                case 'exploit_detected':
                    embed.setDescription(`Potential exploitation pattern detected`)
                        .addFields(
                            { name: 'Pattern', value: data.pattern, inline: true },
                            { name: 'Confidence', value: `${(data.confidence * 100).toFixed(0)}%`, inline: true },
                            { name: 'Players Involved', value: data.playerCount.toString(), inline: true },
                            { name: 'Action Taken', value: data.action, inline: false }
                        );
                    break;
                    
                case 'anomaly_spike':
                    embed.setDescription(`Significant anomaly spike detected`)
                        .addFields(
                            { name: 'Game', value: data.gameType, inline: true },
                            { name: 'Z-Score', value: data.zScore.toFixed(2), inline: true },
                            { name: 'Standard Deviations', value: `${data.stdDevs.toFixed(1)}σ`, inline: true }
                        );
                    break;
            }
            
            await logChannel.send({ embeds: [embed] });
            
        } catch (error) {
            logger.error(`Error sending critical alert: ${error.message}`);
        }
    }
}

module.exports = EnhancedTrendAnalyzer;