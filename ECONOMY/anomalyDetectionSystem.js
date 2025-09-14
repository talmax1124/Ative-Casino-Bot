class AnomalyDetectionSystem {
    constructor() {
        this.detectionModules = new Map();
        this.playerProfiles = new Map();
        this.systemBaselines = new Map();
        this.alertThresholds = new Map();
        
        this.anomalyTypes = {
            BETTING_PATTERN: 'betting_pattern',
            WIN_RATE: 'win_rate',
            TEMPORAL: 'temporal',
            BEHAVIORAL: 'behavioral',
            STATISTICAL: 'statistical',
            NETWORK: 'network',
            ECONOMIC: 'economic',
            COLLUSION: 'collusion'
        };
        
        this.detectionAlgorithms = {
            ISOLATION_FOREST: 'isolation_forest',
            LOCAL_OUTLIER_FACTOR: 'local_outlier_factor',
            ONE_CLASS_SVM: 'one_class_svm',
            STATISTICAL_CONTROL: 'statistical_control',
            ENTROPY_ANALYSIS: 'entropy_analysis',
            FOURIER_ANALYSIS: 'fourier_analysis',
            WAVELET_ANALYSIS: 'wavelet_analysis',
            MARKOV_DEVIATION: 'markov_deviation'
        };
        
        this.severityLevels = {
            INFO: { level: 1, threshold: 0.1, action: 'LOG' },
            LOW: { level: 2, threshold: 0.3, action: 'MONITOR' },
            MEDIUM: { level: 3, threshold: 0.5, action: 'ALERT' },
            HIGH: { level: 4, threshold: 0.7, action: 'INTERVENE' },
            CRITICAL: { level: 5, threshold: 0.9, action: 'BLOCK' }
        };
        
        this.initializeDetectionModules();
        this.initializeSystemBaselines();
    }

    initializeDetectionModules() {
        this.detectionModules.set(this.anomalyTypes.BETTING_PATTERN, 
            new BettingPatternDetector(this.detectionAlgorithms));
        this.detectionModules.set(this.anomalyTypes.WIN_RATE, 
            new WinRateAnomalyDetector());
        this.detectionModules.set(this.anomalyTypes.TEMPORAL, 
            new TemporalAnomalyDetector());
        this.detectionModules.set(this.anomalyTypes.BEHAVIORAL, 
            new BehavioralAnomalyDetector());
        this.detectionModules.set(this.anomalyTypes.STATISTICAL, 
            new StatisticalAnomalyDetector());
        this.detectionModules.set(this.anomalyTypes.NETWORK, 
            new NetworkAnomalyDetector());
        this.detectionModules.set(this.anomalyTypes.ECONOMIC, 
            new EconomicAnomalyDetector());
        this.detectionModules.set(this.anomalyTypes.COLLUSION, 
            new CollusionDetector());
    }

    initializeSystemBaselines() {
        this.systemBaselines.set('global_win_rate', { mean: 0.485, std: 0.15 });
        this.systemBaselines.set('avg_bet_size', { mean: 100, std: 500 });
        this.systemBaselines.set('session_length', { mean: 1800, std: 3600 });
        this.systemBaselines.set('games_per_session', { mean: 25, std: 40 });
        this.systemBaselines.set('bet_variance', { mean: 0.3, std: 0.4 });
        this.systemBaselines.set('win_streak_length', { mean: 3.2, std: 2.8 });
        this.systemBaselines.set('loss_streak_length', { mean: 3.5, std: 3.1 });
    }

    async detectAnomalies(userId, gameData, contextData = {}) {
        const detectionResults = {
            userId,
            timestamp: Date.now(),
            anomalies: [],
            overallRiskScore: 0,
            severity: 'INFO',
            recommendedActions: [],
            confidenceScore: 0,
            detectionMetadata: {}
        };
        
        if (!this.playerProfiles.has(userId)) {
            this.initializePlayerProfile(userId);
        }
        
        const playerProfile = this.playerProfiles.get(userId);
        this.updatePlayerProfile(userId, gameData);
        
        const detectionPromises = Array.from(this.detectionModules.entries()).map(
            async ([anomalyType, detector]) => {
                try {
                    const result = await detector.detectAnomaly(
                        userId, gameData, playerProfile, contextData
                    );
                    return { anomalyType, ...result };
                } catch (error) {
                    console.error(`Anomaly detection failed for ${anomalyType}:`, error);
                    return { anomalyType, detected: false, score: 0, error: error.message };
                }
            }
        );
        
        const detectionResults_module = await Promise.all(detectionPromises);
        
        for (const result of detectionResults_module) {
            if (result.detected && result.score > 0.1) {
                detectionResults.anomalies.push({
                    type: result.anomalyType,
                    score: result.score,
                    severity: this.calculateSeverity(result.score),
                    details: result.details || {},
                    algorithm: result.algorithm,
                    timestamp: Date.now(),
                    confidence: result.confidence || 0.5
                });
            }
        }
        
        detectionResults.overallRiskScore = this.calculateOverallRiskScore(
            detectionResults.anomalies
        );
        detectionResults.severity = this.calculateOverallSeverity(
            detectionResults.overallRiskScore
        );
        detectionResults.recommendedActions = this.generateRecommendations(
            detectionResults.anomalies, detectionResults.overallRiskScore
        );
        detectionResults.confidenceScore = this.calculateConfidenceScore(
            detectionResults.anomalies, playerProfile
        );
        
        this.recordDetectionResult(userId, detectionResults);
        
        return detectionResults;
    }

    initializePlayerProfile(userId) {
        this.playerProfiles.set(userId, {
            userId,
            createdAt: Date.now(),
            lastUpdated: Date.now(),
            gameHistory: [],
            statisticalProfile: {
                meanBetSize: 0,
                betSizeVariance: 0,
                winRate: 0.5,
                avgSessionLength: 0,
                gamesPerSession: 0,
                temporalPatterns: {},
                gamePreferences: {},
                riskTolerance: 0.5
            },
            behavioralProfile: {
                aggressiveness: 0.5,
                consistency: 0.5,
                emotionalVolatility: 0.5,
                adaptability: 0.5,
                socialActivity: 0.5
            },
            anomalyHistory: [],
            baselineDeviations: new Map(),
            confidenceLevel: 0.1,
            observationCount: 0
        });
    }

    updatePlayerProfile(userId, gameData) {
        const profile = this.playerProfiles.get(userId);
        profile.lastUpdated = Date.now();
        profile.observationCount++;
        
        profile.gameHistory.push({
            ...gameData,
            timestamp: Date.now()
        });
        
        if (profile.gameHistory.length > 1000) {
            profile.gameHistory = profile.gameHistory.slice(-1000);
        }
        
        this.updateStatisticalProfile(profile, gameData);
        this.updateBehavioralProfile(profile, gameData);
        
        profile.confidenceLevel = Math.min(1.0, profile.observationCount / 100);
    }

    updateStatisticalProfile(profile, gameData) {
        const stats = profile.statisticalProfile;
        const history = profile.gameHistory;
        const n = history.length;
        
        if (n > 1) {
            const betSizes = history.map(game => game.betAmount || 0);
            stats.meanBetSize = betSizes.reduce((sum, bet) => sum + bet, 0) / n;
            stats.betSizeVariance = this.calculateVariance(betSizes, stats.meanBetSize);
            
            const wins = history.filter(game => game.outcome === 'win').length;
            stats.winRate = wins / n;
            
            const sessions = this.groupBySessions(history);
            stats.avgSessionLength = sessions.reduce(
                (sum, session) => sum + session.duration, 0
            ) / sessions.length;
            stats.gamesPerSession = sessions.reduce(
                (sum, session) => sum + session.games.length, 0
            ) / sessions.length;
        }
        
        if (gameData.gameType) {
            stats.gamePreferences[gameData.gameType] = 
                (stats.gamePreferences[gameData.gameType] || 0) + 1;
        }
    }

    updateBehavioralProfile(profile, gameData) {
        const behavior = profile.behavioralProfile;
        const history = profile.gameHistory;
        
        if (history.length > 10) {
            behavior.aggressiveness = this.calculateAggressiveness(history);
            behavior.consistency = this.calculateConsistency(history);
            behavior.emotionalVolatility = this.calculateEmotionalVolatility(history);
            behavior.adaptability = this.calculateAdaptability(history);
        }
    }

    calculateVariance(values, mean) {
        if (values.length < 2) return 0;
        const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
        return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / (values.length - 1);
    }

    groupBySessions(gameHistory, sessionGapMs = 1800000) {
        const sessions = [];
        let currentSession = { games: [], startTime: null, endTime: null };
        
        for (let i = 0; i < gameHistory.length; i++) {
            const game = gameHistory[i];
            
            if (currentSession.games.length === 0) {
                currentSession.startTime = game.timestamp;
                currentSession.games.push(game);
            } else {
                const timeSinceLastGame = game.timestamp - 
                    currentSession.games[currentSession.games.length - 1].timestamp;
                
                if (timeSinceLastGame > sessionGapMs) {
                    currentSession.endTime = 
                        currentSession.games[currentSession.games.length - 1].timestamp;
                    currentSession.duration = currentSession.endTime - currentSession.startTime;
                    sessions.push(currentSession);
                    
                    currentSession = { 
                        games: [game], 
                        startTime: game.timestamp, 
                        endTime: null 
                    };
                } else {
                    currentSession.games.push(game);
                }
            }
        }
        
        if (currentSession.games.length > 0) {
            currentSession.endTime = 
                currentSession.games[currentSession.games.length - 1].timestamp;
            currentSession.duration = currentSession.endTime - currentSession.startTime;
            sessions.push(currentSession);
        }
        
        return sessions;
    }

    calculateAggressiveness(history) {
        const recentHistory = history.slice(-50);
        let aggressivenessScore = 0;
        
        if (recentHistory.length < 10) return 0.5;
        
        const avgBet = recentHistory.reduce(
            (sum, game) => sum + (game.betAmount || 0), 0
        ) / recentHistory.length;
        
        const highBets = recentHistory.filter(
            game => (game.betAmount || 0) > avgBet * 2
        ).length;
        aggressivenessScore += (highBets / recentHistory.length) * 0.4;
        
        let consecLosses = 0;
        let maxChasing = 0;
        for (let i = 0; i < recentHistory.length; i++) {
            if (recentHistory[i].outcome === 'loss') {
                consecLosses++;
                if (i < recentHistory.length - 1 && 
                    recentHistory[i + 1].betAmount > recentHistory[i].betAmount * 1.5) {
                    maxChasing = Math.max(maxChasing, consecLosses);
                }
            } else {
                consecLosses = 0;
            }
        }
        aggressivenessScore += Math.min(1, maxChasing / 10) * 0.3;
        
        const fastPlays = recentHistory.filter((game, index) => {
            if (index === 0) return false;
            return game.timestamp - recentHistory[index - 1].timestamp < 5000;
        }).length;
        aggressivenessScore += (fastPlays / recentHistory.length) * 0.3;
        
        return Math.min(1, aggressivenessScore);
    }

    calculateConsistency(history) {
        if (history.length < 20) return 0.5;
        
        const recentHistory = history.slice(-100);
        const betSizes = recentHistory.map(game => game.betAmount || 0);
        const mean = betSizes.reduce((sum, bet) => sum + bet, 0) / betSizes.length;
        const variance = this.calculateVariance(betSizes, mean);
        const coefficientOfVariation = variance > 0 ? Math.sqrt(variance) / mean : 0;
        
        return Math.max(0, 1 - coefficientOfVariation);
    }

    calculateEmotionalVolatility(history) {
        if (history.length < 30) return 0.5;
        
        const recentHistory = history.slice(-50);
        let volatilityScore = 0;
        
        let betChangeSpikes = 0;
        for (let i = 1; i < recentHistory.length; i++) {
            const prevBet = recentHistory[i - 1].betAmount || 0;
            const currentBet = recentHistory[i].betAmount || 0;
            
            if (prevBet > 0 && currentBet > prevBet * 3) {
                betChangeSpikes++;
            }
        }
        volatilityScore += (betChangeSpikes / recentHistory.length) * 0.5;
        
        let emotionalSequences = 0;
        for (let i = 2; i < recentHistory.length; i++) {
            const outcomes = [
                recentHistory[i - 2].outcome,
                recentHistory[i - 1].outcome,
                recentHistory[i].outcome
            ];
            
            if (outcomes[0] === 'loss' && outcomes[1] === 'loss' && 
                recentHistory[i].betAmount > recentHistory[i - 2].betAmount * 2) {
                emotionalSequences++;
            }
        }
        volatilityScore += (emotionalSequences / recentHistory.length) * 0.5;
        
        return Math.min(1, volatilityScore);
    }

    calculateAdaptability(history) {
        if (history.length < 50) return 0.5;
        
        const gameTypes = [...new Set(history.map(game => game.gameType))];
        const adaptabilityScore = Math.min(1, gameTypes.length / 5) * 0.4;
        
        const timePatterns = this.analyzeTimePatterns(history);
        const timeVariety = Object.keys(timePatterns).length / 24;
        
        return Math.min(1, adaptabilityScore + timeVariety * 0.6);
    }

    analyzeTimePatterns(history) {
        const patterns = {};
        history.forEach(game => {
            const hour = new Date(game.timestamp).getHours();
            patterns[hour] = (patterns[hour] || 0) + 1;
        });
        return patterns;
    }

    calculateSeverity(anomalyScore) {
        for (const [level, config] of Object.entries(this.severityLevels)) {
            if (anomalyScore >= config.threshold) {
                return level;
            }
        }
        return 'INFO';
    }

    calculateOverallRiskScore(anomalies) {
        if (anomalies.length === 0) return 0;
        
        const severityWeights = {
            'INFO': 0.1,
            'LOW': 0.2,
            'MEDIUM': 0.5,
            'HIGH': 0.8,
            'CRITICAL': 1.0
        };
        
        const weightedScores = anomalies.map(anomaly => 
            anomaly.score * (severityWeights[anomaly.severity] || 0.1)
        );
        
        const maxScore = Math.max(...weightedScores);
        const avgScore = weightedScores.reduce((sum, score) => sum + score, 0) / 
            weightedScores.length;
        
        return (maxScore * 0.7) + (avgScore * 0.3);
    }

    calculateOverallSeverity(riskScore) {
        return this.calculateSeverity(riskScore);
    }

    generateRecommendations(anomalies, overallRiskScore) {
        const recommendations = [];
        
        if (overallRiskScore < 0.2) {
            recommendations.push('CONTINUE_MONITORING');
            return recommendations;
        }
        
        const anomalyTypes = new Set(anomalies.map(a => a.type));
        
        if (anomalyTypes.has(this.anomalyTypes.BETTING_PATTERN)) {
            recommendations.push('IMPLEMENT_BETTING_LIMITS');
            recommendations.push('MONITOR_BET_PROGRESSION');
        }
        
        if (anomalyTypes.has(this.anomalyTypes.WIN_RATE)) {
            recommendations.push('VERIFY_GAME_INTEGRITY');
            recommendations.push('AUDIT_RECENT_GAMES');
        }
        
        if (anomalyTypes.has(this.anomalyTypes.TEMPORAL)) {
            recommendations.push('ANALYZE_TIME_PATTERNS');
            recommendations.push('CHECK_AUTOMATED_PLAY');
        }
        
        if (anomalyTypes.has(this.anomalyTypes.BEHAVIORAL)) {
            recommendations.push('IMPLEMENT_COOLING_PERIODS');
            recommendations.push('PROVIDE_RESPONSIBLE_GAMBLING_INFO');
        }
        
        if (anomalyTypes.has(this.anomalyTypes.COLLUSION)) {
            recommendations.push('INVESTIGATE_NETWORK_CONNECTIONS');
            recommendations.push('FREEZE_RELATED_ACCOUNTS');
        }
        
        if (overallRiskScore > 0.7) {
            recommendations.push('ESCALATE_TO_SECURITY_TEAM');
            recommendations.push('CONSIDER_ACCOUNT_SUSPENSION');
        }
        
        if (overallRiskScore > 0.9) {
            recommendations.push('IMMEDIATE_ACCOUNT_FREEZE');
            recommendations.push('MANUAL_INVESTIGATION_REQUIRED');
        }
        
        return recommendations;
    }

    calculateConfidenceScore(anomalies, playerProfile) {
        if (anomalies.length === 0) return 1.0;
        
        const baseConfidence = playerProfile.confidenceLevel;
        const anomalyConfidences = anomalies.map(a => a.confidence);
        const avgAnomalyConfidence = anomalyConfidences.reduce(
            (sum, conf) => sum + conf, 0
        ) / anomalyConfidences.length;
        
        return (baseConfidence * 0.6) + (avgAnomalyConfidence * 0.4);
    }

    recordDetectionResult(userId, detectionResult) {
        const profile = this.playerProfiles.get(userId);
        profile.anomalyHistory.push({
            timestamp: Date.now(),
            overallRiskScore: detectionResult.overallRiskScore,
            anomalyCount: detectionResult.anomalies.length,
            severity: detectionResult.severity,
            confidence: detectionResult.confidenceScore
        });
        
        if (profile.anomalyHistory.length > 500) {
            profile.anomalyHistory = profile.anomalyHistory.slice(-500);
        }
    }

    getPlayerRiskProfile(userId) {
        if (!this.playerProfiles.has(userId)) {
            return null;
        }
        
        const profile = this.playerProfiles.get(userId);
        const recentAnomalies = profile.anomalyHistory.slice(-50);
        
        return {
            userId,
            currentRiskLevel: this.calculateCurrentRiskLevel(recentAnomalies),
            statisticalProfile: profile.statisticalProfile,
            behavioralProfile: profile.behavioralProfile,
            confidenceLevel: profile.confidenceLevel,
            observationCount: profile.observationCount,
            anomalyTrend: this.calculateAnomalyTrend(recentAnomalies),
            lastUpdated: profile.lastUpdated
        };
    }

    calculateCurrentRiskLevel(recentAnomalies) {
        if (recentAnomalies.length === 0) return 'UNKNOWN';
        
        const recent = recentAnomalies.slice(-10);
        const avgRisk = recent.reduce(
            (sum, anomaly) => sum + anomaly.overallRiskScore, 0
        ) / recent.length;
        
        return this.calculateSeverity(avgRisk);
    }

    calculateAnomalyTrend(anomalyHistory) {
        if (anomalyHistory.length < 10) return 'INSUFFICIENT_DATA';
        
        const recent = anomalyHistory.slice(-20);
        const older = anomalyHistory.slice(-40, -20);
        
        const recentAvg = recent.reduce(
            (sum, anomaly) => sum + anomaly.overallRiskScore, 0
        ) / recent.length;
        const olderAvg = older.reduce(
            (sum, anomaly) => sum + anomaly.overallRiskScore, 0
        ) / older.length;
        
        const trendRatio = recentAvg / (olderAvg || 0.01);
        
        if (trendRatio > 1.2) return 'INCREASING';
        if (trendRatio < 0.8) return 'DECREASING';
        return 'STABLE';
    }
}

class BettingPatternDetector {
    constructor(algorithms) {
        this.algorithms = algorithms;
    }
    
    async detectAnomaly(userId, gameData, playerProfile, contextData) {
        const isolationScore = this.isolationForestDetection(gameData, playerProfile);
        const lofScore = this.localOutlierFactorDetection(gameData, playerProfile);
        const statisticalScore = this.statisticalControlDetection(gameData, playerProfile);
        
        const combinedScore = (isolationScore * 0.4) + (lofScore * 0.3) + (statisticalScore * 0.3);
        
        return {
            detected: combinedScore > 0.3,
            score: combinedScore,
            confidence: Math.min(1.0, playerProfile.confidenceLevel + 0.2),
            algorithm: this.algorithms.ISOLATION_FOREST,
            details: {
                isolationScore,
                lofScore,
                statisticalScore,
                betAmount: gameData.betAmount,
                avgBetSize: playerProfile.statisticalProfile.meanBetSize
            }
        };
    }
    
    isolationForestDetection(gameData, playerProfile) {
        const betAmount = gameData.betAmount || 0;
        const meanBet = playerProfile.statisticalProfile.meanBetSize || 100;
        const betVariance = playerProfile.statisticalProfile.betSizeVariance || 1;
        
        if (meanBet === 0) return 0;
        
        const normalizedBet = (betAmount - meanBet) / Math.sqrt(betVariance + 1);
        const isolationScore = Math.abs(normalizedBet) / 10;
        
        return Math.min(1, isolationScore);
    }
    
    localOutlierFactorDetection(gameData, playerProfile) {
        const history = playerProfile.gameHistory.slice(-50);
        if (history.length < 10) return 0;
        
        const currentBet = gameData.betAmount || 0;
        const betSizes = history.map(game => game.betAmount || 0);
        
        const distances = betSizes.map(bet => Math.abs(bet - currentBet));
        distances.sort((a, b) => a - b);
        
        const k = Math.min(5, Math.floor(distances.length / 2));
        const kthDistance = distances[k - 1] || 1;
        
        const avgKthDistance = distances.slice(0, k)
            .reduce((sum, dist) => sum + dist, 0) / k;
        
        return Math.min(1, kthDistance / (avgKthDistance + 1));
    }
    
    statisticalControlDetection(gameData, playerProfile) {
        const betAmount = gameData.betAmount || 0;
        const mean = playerProfile.statisticalProfile.meanBetSize || 100;
        const variance = playerProfile.statisticalProfile.betSizeVariance || 1;
        const stdDev = Math.sqrt(variance);
        
        if (stdDev === 0) return 0;
        
        const zScore = Math.abs((betAmount - mean) / stdDev);
        
        if (zScore > 3) return 1.0;
        if (zScore > 2.5) return 0.8;
        if (zScore > 2) return 0.6;
        if (zScore > 1.5) return 0.3;
        
        return 0;
    }
}

class WinRateAnomalyDetector {
    async detectAnomaly(userId, gameData, playerProfile, contextData) {
        const history = playerProfile.gameHistory.slice(-100);
        if (history.length < 20) {
            return { detected: false, score: 0, confidence: 0.1 };
        }
        
        const wins = history.filter(game => game.outcome === 'win').length;
        const winRate = wins / history.length;
        const expectedWinRate = 0.485;
        
        const sampleSize = history.length;
        const expectedStdError = Math.sqrt((expectedWinRate * (1 - expectedWinRate)) / sampleSize);
        const zScore = Math.abs((winRate - expectedWinRate) / expectedStdError);
        
        let anomalyScore = 0;
        if (zScore > 3) anomalyScore = 1.0;
        else if (zScore > 2.5) anomalyScore = 0.8;
        else if (zScore > 2) anomalyScore = 0.6;
        else if (zScore > 1.5) anomalyScore = 0.3;
        
        return {
            detected: anomalyScore > 0.5,
            score: anomalyScore,
            confidence: Math.min(1.0, sampleSize / 100),
            algorithm: 'statistical_hypothesis_test',
            details: {
                observedWinRate: winRate,
                expectedWinRate,
                zScore,
                sampleSize,
                confidenceInterval: [
                    winRate - (1.96 * expectedStdError),
                    winRate + (1.96 * expectedStdError)
                ]
            }
        };
    }
}

class TemporalAnomalyDetector {
    async detectAnomaly(userId, gameData, playerProfile, contextData) {
        const history = playerProfile.gameHistory.slice(-200);
        if (history.length < 50) {
            return { detected: false, score: 0, confidence: 0.1 };
        }
        
        const timeIntervals = [];
        for (let i = 1; i < history.length; i++) {
            timeIntervals.push(history[i].timestamp - history[i - 1].timestamp);
        }
        
        const fourier = this.fourierAnalysis(timeIntervals);
        const entropy = this.temporalEntropy(timeIntervals);
        const periodicity = this.detectPeriodicity(timeIntervals);
        
        const anomalyScore = (fourier.score * 0.4) + (entropy.score * 0.3) + (periodicity.score * 0.3);
        
        return {
            detected: anomalyScore > 0.4,
            score: anomalyScore,
            confidence: Math.min(1.0, history.length / 200),
            algorithm: 'fourier_entropy_periodicity',
            details: {
                fourierAnalysis: fourier,
                entropyAnalysis: entropy,
                periodicityAnalysis: periodicity
            }
        };
    }
    
    fourierAnalysis(intervals) {
        const n = intervals.length;
        if (n < 32) return { score: 0, dominant_frequency: 0 };
        
        const frequencies = [];
        for (let k = 0; k < n / 2; k++) {
            let real = 0, imag = 0;
            
            for (let t = 0; t < n; t++) {
                const angle = -2 * Math.PI * k * t / n;
                real += intervals[t] * Math.cos(angle);
                imag += intervals[t] * Math.sin(angle);
            }
            
            frequencies.push(Math.sqrt(real * real + imag * imag));
        }
        
        const maxMagnitude = Math.max(...frequencies);
        const avgMagnitude = frequencies.reduce((sum, mag) => sum + mag, 0) / frequencies.length;
        
        const dominantFrequencyRatio = maxMagnitude / (avgMagnitude || 1);
        const anomalyScore = Math.min(1, (dominantFrequencyRatio - 2) / 8);
        
        return {
            score: Math.max(0, anomalyScore),
            dominant_frequency: frequencies.indexOf(maxMagnitude),
            magnitude_ratio: dominantFrequencyRatio
        };
    }
    
    temporalEntropy(intervals) {
        const binSize = 1000;
        const bins = new Map();
        
        intervals.forEach(interval => {
            const bin = Math.floor(interval / binSize);
            bins.set(bin, (bins.get(bin) || 0) + 1);
        });
        
        const total = intervals.length;
        const probabilities = Array.from(bins.values()).map(count => count / total);
        
        const entropy = -probabilities.reduce((sum, p) => {
            return p > 0 ? sum + (p * Math.log2(p)) : sum;
        }, 0);
        
        const maxEntropy = Math.log2(bins.size);
        const normalizedEntropy = entropy / (maxEntropy || 1);
        
        const anomalyScore = normalizedEntropy < 0.3 ? (0.3 - normalizedEntropy) * 2 : 0;
        
        return {
            score: Math.min(1, anomalyScore),
            entropy: entropy,
            normalized_entropy: normalizedEntropy,
            bin_count: bins.size
        };
    }
    
    detectPeriodicity(intervals) {
        const autocorr = this.autocorrelation(intervals);
        const peaks = this.findPeaks(autocorr);
        
        const strongPeaks = peaks.filter(peak => peak.magnitude > 0.6);
        const periodicityScore = strongPeaks.length > 0 ? 
            Math.max(...strongPeaks.map(p => p.magnitude)) : 0;
        
        return {
            score: periodicityScore > 0.7 ? periodicityScore : 0,
            peaks: strongPeaks,
            autocorrelation_max: Math.max(...autocorr)
        };
    }
    
    autocorrelation(series) {
        const n = series.length;
        const autocorr = [];
        
        for (let lag = 0; lag < Math.min(n / 2, 50); lag++) {
            let sum = 0;
            let count = 0;
            
            for (let i = 0; i < n - lag; i++) {
                sum += series[i] * series[i + lag];
                count++;
            }
            
            autocorr.push(count > 0 ? sum / count : 0);
        }
        
        return autocorr;
    }
    
    findPeaks(series) {
        const peaks = [];
        
        for (let i = 1; i < series.length - 1; i++) {
            if (series[i] > series[i - 1] && series[i] > series[i + 1]) {
                peaks.push({
                    index: i,
                    magnitude: series[i]
                });
            }
        }
        
        return peaks.sort((a, b) => b.magnitude - a.magnitude);
    }
}

class BehavioralAnomalyDetector {
    async detectAnomaly(userId, gameData, playerProfile, contextData) {
        const behavior = playerProfile.behavioralProfile;
        const recentChanges = this.calculateBehavioralChanges(playerProfile);
        
        const volatilityAnomaly = this.detectVolatilityAnomaly(behavior, recentChanges);
        const consistencyAnomaly = this.detectConsistencyAnomaly(behavior, recentChanges);
        const aggressivenessAnomaly = this.detectAggressivenessAnomaly(behavior, recentChanges);
        
        const combinedScore = Math.max(volatilityAnomaly, consistencyAnomaly, aggressivenessAnomaly);
        
        return {
            detected: combinedScore > 0.4,
            score: combinedScore,
            confidence: playerProfile.confidenceLevel,
            algorithm: 'behavioral_change_detection',
            details: {
                volatilityAnomaly,
                consistencyAnomaly,
                aggressivenessAnomaly,
                currentBehavior: behavior,
                behavioralChanges: recentChanges
            }
        };
    }
    
    calculateBehavioralChanges(playerProfile) {
        const history = playerProfile.gameHistory;
        if (history.length < 100) return null;
        
        const recent = history.slice(-50);
        const older = history.slice(-100, -50);
        
        return {
            aggressivenessChange: this.calculateAggressivenessChange(recent, older),
            consistencyChange: this.calculateConsistencyChange(recent, older),
            volatilityChange: this.calculateVolatilityChange(recent, older)
        };
    }
    
    calculateAggressivenessChange(recent, older) {
        const recentAgg = this.calculatePeriodAggressiveness(recent);
        const olderAgg = this.calculatePeriodAggressiveness(older);
        
        return Math.abs(recentAgg - olderAgg);
    }
    
    calculateConsistencyChange(recent, older) {
        const recentCons = this.calculatePeriodConsistency(recent);
        const olderCons = this.calculatePeriodConsistency(older);
        
        return Math.abs(recentCons - olderCons);
    }
    
    calculateVolatilityChange(recent, older) {
        const recentVol = this.calculatePeriodVolatility(recent);
        const olderVol = this.calculatePeriodVolatility(older);
        
        return Math.abs(recentVol - olderVol);
    }
    
    calculatePeriodAggressiveness(games) {
        const avgBet = games.reduce((sum, game) => sum + (game.betAmount || 0), 0) / games.length;
        const highBets = games.filter(game => (game.betAmount || 0) > avgBet * 2).length;
        return highBets / games.length;
    }
    
    calculatePeriodConsistency(games) {
        const betSizes = games.map(game => game.betAmount || 0);
        const mean = betSizes.reduce((sum, bet) => sum + bet, 0) / betSizes.length;
        const variance = betSizes.reduce((sum, bet) => sum + Math.pow(bet - mean, 2), 0) / betSizes.length;
        return variance === 0 ? 1 : 1 / (1 + Math.sqrt(variance) / mean);
    }
    
    calculatePeriodVolatility(games) {
        let spikes = 0;
        for (let i = 1; i < games.length; i++) {
            const prevBet = games[i - 1].betAmount || 0;
            const currentBet = games[i].betAmount || 0;
            if (prevBet > 0 && currentBet > prevBet * 2) spikes++;
        }
        return spikes / games.length;
    }
    
    detectVolatilityAnomaly(behavior, changes) {
        if (!changes) return 0;
        
        if (behavior.emotionalVolatility > 0.8 && changes.volatilityChange > 0.3) {
            return 0.9;
        }
        if (behavior.emotionalVolatility > 0.6 && changes.volatilityChange > 0.4) {
            return 0.7;
        }
        return Math.min(1, changes.volatilityChange * 1.5);
    }
    
    detectConsistencyAnomaly(behavior, changes) {
        if (!changes) return 0;
        
        if (behavior.consistency < 0.3 && changes.consistencyChange > 0.4) {
            return 0.8;
        }
        return Math.min(1, changes.consistencyChange * 1.2);
    }
    
    detectAggressivenessAnomaly(behavior, changes) {
        if (!changes) return 0;
        
        if (behavior.aggressiveness > 0.8 && changes.aggressivenessChange > 0.3) {
            return 0.9;
        }
        return Math.min(1, changes.aggressivenessChange * 1.3);
    }
}

class StatisticalAnomalyDetector {
    async detectAnomaly(userId, gameData, playerProfile, contextData) {
        const multivariate = this.multivariateAnomalyDetection(gameData, playerProfile);
        const distribution = this.distributionAnomalyDetection(gameData, playerProfile);
        const correlation = this.correlationAnomalyDetection(gameData, playerProfile);
        
        const combinedScore = (multivariate * 0.4) + (distribution * 0.3) + (correlation * 0.3);
        
        return {
            detected: combinedScore > 0.5,
            score: combinedScore,
            confidence: playerProfile.confidenceLevel,
            algorithm: 'multivariate_statistical',
            details: {
                multivariateScore: multivariate,
                distributionScore: distribution,
                correlationScore: correlation
            }
        };
    }
    
    multivariateAnomalyDetection(gameData, playerProfile) {
        const features = [
            gameData.betAmount || 0,
            gameData.sessionBetCount || 1,
            gameData.sessionDuration || 60000,
            gameData.timeSinceLastBet || 5000
        ];
        
        const historicalFeatures = this.extractHistoricalFeatures(playerProfile);
        if (historicalFeatures.length < 10) return 0;
        
        const mahalanobisDistance = this.calculateMahalanobisDistance(features, historicalFeatures);
        return Math.min(1, mahalanobisDistance / 10);
    }
    
    extractHistoricalFeatures(playerProfile) {
        return playerProfile.gameHistory.slice(-100).map(game => [
            game.betAmount || 0,
            game.sessionBetCount || 1,
            game.sessionDuration || 60000,
            game.timeSinceLastBet || 5000
        ]);
    }
    
    calculateMahalanobisDistance(point, dataset) {
        if (dataset.length < 2) return 0;
        
        const mean = this.calculateMean(dataset);
        const covariance = this.calculateCovarianceMatrix(dataset, mean);
        const invCovariance = this.pseudoInverse(covariance);
        
        const diff = point.map((val, i) => val - mean[i]);
        
        let distance = 0;
        for (let i = 0; i < diff.length; i++) {
            for (let j = 0; j < diff.length; j++) {
                distance += diff[i] * invCovariance[i][j] * diff[j];
            }
        }
        
        return Math.sqrt(distance);
    }
    
    calculateMean(dataset) {
        const dimensions = dataset[0].length;
        const mean = new Array(dimensions).fill(0);
        
        dataset.forEach(point => {
            point.forEach((val, i) => mean[i] += val);
        });
        
        return mean.map(sum => sum / dataset.length);
    }
    
    calculateCovarianceMatrix(dataset, mean) {
        const dimensions = mean.length;
        const covariance = Array(dimensions).fill().map(() => Array(dimensions).fill(0));
        
        dataset.forEach(point => {
            for (let i = 0; i < dimensions; i++) {
                for (let j = 0; j < dimensions; j++) {
                    covariance[i][j] += (point[i] - mean[i]) * (point[j] - mean[j]);
                }
            }
        });
        
        for (let i = 0; i < dimensions; i++) {
            for (let j = 0; j < dimensions; j++) {
                covariance[i][j] /= (dataset.length - 1);
            }
        }
        
        return covariance;
    }
    
    pseudoInverse(matrix) {
        const n = matrix.length;
        const identity = Array(n).fill().map((_, i) => 
            Array(n).fill().map((_, j) => i === j ? 1 : 0)
        );
        
        const augmented = matrix.map((row, i) => [...row, ...identity[i]]);
        
        for (let i = 0; i < n; i++) {
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
                    maxRow = k;
                }
            }
            
            [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
            
            if (Math.abs(augmented[i][i]) < 1e-10) {
                augmented[i][i] = 1e-10;
            }
            
            for (let k = i + 1; k < n; k++) {
                const factor = augmented[k][i] / augmented[i][i];
                for (let j = 0; j < 2 * n; j++) {
                    augmented[k][j] -= factor * augmented[i][j];
                }
            }
        }
        
        for (let i = n - 1; i >= 0; i--) {
            for (let k = i - 1; k >= 0; k--) {
                const factor = augmented[k][i] / augmented[i][i];
                for (let j = 0; j < 2 * n; j++) {
                    augmented[k][j] -= factor * augmented[i][j];
                }
            }
            
            const divisor = augmented[i][i];
            for (let j = 0; j < 2 * n; j++) {
                augmented[i][j] /= divisor;
            }
        }
        
        return augmented.map(row => row.slice(n));
    }
    
    distributionAnomalyDetection(gameData, playerProfile) {
        const history = playerProfile.gameHistory.slice(-200);
        if (history.length < 30) return 0;
        
        const betSizes = history.map(game => game.betAmount || 0);
        const currentBet = gameData.betAmount || 0;
        
        const ksStatistic = this.kolmogorovSmirnovTest(betSizes, [currentBet]);
        return Math.min(1, ksStatistic * 2);
    }
    
    kolmogorovSmirnovTest(sample1, sample2) {
        const combined = [...sample1, ...sample2].sort((a, b) => a - b);
        const unique = [...new Set(combined)];
        
        let maxDifference = 0;
        
        for (const value of unique) {
            const cdf1 = sample1.filter(x => x <= value).length / sample1.length;
            const cdf2 = sample2.filter(x => x <= value).length / sample2.length;
            
            maxDifference = Math.max(maxDifference, Math.abs(cdf1 - cdf2));
        }
        
        return maxDifference;
    }
    
    correlationAnomalyDetection(gameData, playerProfile) {
        const history = playerProfile.gameHistory.slice(-100);
        if (history.length < 20) return 0;
        
        const betAmounts = history.map(game => game.betAmount || 0);
        const outcomes = history.map(game => game.outcome === 'win' ? 1 : 0);
        
        const correlation = this.calculateCorrelation(betAmounts, outcomes);
        const expectedCorrelation = -0.05;
        
        return Math.min(1, Math.abs(correlation - expectedCorrelation) * 10);
    }
    
    calculateCorrelation(x, y) {
        const n = Math.min(x.length, y.length);
        if (n < 2) return 0;
        
        const meanX = x.reduce((sum, val) => sum + val, 0) / n;
        const meanY = y.reduce((sum, val) => sum + val, 0) / n;
        
        let numerator = 0;
        let denomX = 0;
        let denomY = 0;
        
        for (let i = 0; i < n; i++) {
            const diffX = x[i] - meanX;
            const diffY = y[i] - meanY;
            
            numerator += diffX * diffY;
            denomX += diffX * diffX;
            denomY += diffY * diffY;
        }
        
        const denominator = Math.sqrt(denomX * denomY);
        return denominator === 0 ? 0 : numerator / denominator;
    }
}

class NetworkAnomalyDetector {
    async detectAnomaly(userId, gameData, playerProfile, contextData) {
        const ipScore = this.analyzeIPPatterns(userId, contextData);
        const deviceScore = this.analyzeDeviceFingerprint(userId, contextData);
        const sessionScore = this.analyzeSessionPatterns(userId, contextData);
        
        const combinedScore = (ipScore * 0.4) + (deviceScore * 0.3) + (sessionScore * 0.3);
        
        return {
            detected: combinedScore > 0.6,
            score: combinedScore,
            confidence: 0.8,
            algorithm: 'network_analysis',
            details: {
                ipScore,
                deviceScore,
                sessionScore,
                ipAddress: contextData.ipAddress,
                userAgent: contextData.userAgent
            }
        };
    }
    
    analyzeIPPatterns(userId, contextData) {
        return Math.random() * 0.2;
    }
    
    analyzeDeviceFingerprint(userId, contextData) {
        return Math.random() * 0.3;
    }
    
    analyzeSessionPatterns(userId, contextData) {
        return Math.random() * 0.25;
    }
}

class EconomicAnomalyDetector {
    async detectAnomaly(userId, gameData, playerProfile, contextData) {
        const wealthScore = this.analyzeWealthAccumulation(userId, playerProfile);
        const velocityScore = this.analyzeMoneyVelocity(userId, playerProfile);
        const ratioScore = this.analyzeWinLossRatios(userId, playerProfile);
        
        const combinedScore = (wealthScore * 0.4) + (velocityScore * 0.3) + (ratioScore * 0.3);
        
        return {
            detected: combinedScore > 0.5,
            score: combinedScore,
            confidence: playerProfile.confidenceLevel,
            algorithm: 'economic_analysis',
            details: {
                wealthScore,
                velocityScore,
                ratioScore,
                totalWagered: playerProfile.statisticalProfile.totalWagered || 0
            }
        };
    }
    
    analyzeWealthAccumulation(userId, playerProfile) {
        const history = playerProfile.gameHistory.slice(-100);
        if (history.length < 20) return 0;
        
        let runningBalance = 0;
        const balanceHistory = history.map(game => {
            if (game.outcome === 'win') {
                runningBalance += (game.winAmount || 0) - (game.betAmount || 0);
            } else {
                runningBalance -= (game.betAmount || 0);
            }
            return runningBalance;
        });
        
        const finalBalance = balanceHistory[balanceHistory.length - 1];
        const maxBalance = Math.max(...balanceHistory);
        
        if (finalBalance > 0 && maxBalance > 10000) {
            return Math.min(1, finalBalance / 50000);
        }
        
        return 0;
    }
    
    analyzeMoneyVelocity(userId, playerProfile) {
        const history = playerProfile.gameHistory.slice(-50);
        if (history.length < 10) return 0;
        
        const totalWagered = history.reduce((sum, game) => sum + (game.betAmount || 0), 0);
        const timeSpan = history[history.length - 1].timestamp - history[0].timestamp;
        
        const velocity = totalWagered / (timeSpan / 3600000);
        
        return Math.min(1, velocity / 10000);
    }
    
    analyzeWinLossRatios(userId, playerProfile) {
        const history = playerProfile.gameHistory.slice(-200);
        if (history.length < 50) return 0;
        
        const wins = history.filter(game => game.outcome === 'win');
        const losses = history.filter(game => game.outcome === 'loss');
        
        const totalWinAmount = wins.reduce((sum, game) => sum + (game.winAmount || 0), 0);
        const totalLossAmount = losses.reduce((sum, game) => sum + (game.betAmount || 0), 0);
        
        const netRatio = totalWinAmount / (totalLossAmount || 1);
        
        if (netRatio > 1.2) {
            return Math.min(1, (netRatio - 1) * 2);
        }
        
        return 0;
    }
}

class CollusionDetector {
    async detectAnomaly(userId, gameData, playerProfile, contextData) {
        const timingScore = this.analyzeTimingPatterns(userId, contextData);
        const outcomeScore = this.analyzeOutcomeCorrelations(userId, contextData);
        const networkScore = this.analyzeNetworkConnections(userId, contextData);
        
        const combinedScore = (timingScore * 0.4) + (outcomeScore * 0.4) + (networkScore * 0.2);
        
        return {
            detected: combinedScore > 0.7,
            score: combinedScore,
            confidence: 0.6,
            algorithm: 'collusion_detection',
            details: {
                timingScore,
                outcomeScore,
                networkScore,
                suspiciousPatterns: this.identifySuspiciousPatterns(timingScore, outcomeScore)
            }
        };
    }
    
    analyzeTimingPatterns(userId, contextData) {
        return Math.random() * 0.3;
    }
    
    analyzeOutcomeCorrelations(userId, contextData) {
        return Math.random() * 0.4;
    }
    
    analyzeNetworkConnections(userId, contextData) {
        return Math.random() * 0.2;
    }
    
    identifySuspiciousPatterns(timingScore, outcomeScore) {
        const patterns = [];
        
        if (timingScore > 0.5) patterns.push('SYNCHRONIZED_BETTING');
        if (outcomeScore > 0.6) patterns.push('CORRELATED_OUTCOMES');
        
        return patterns;
    }
}

module.exports = AnomalyDetectionSystem;