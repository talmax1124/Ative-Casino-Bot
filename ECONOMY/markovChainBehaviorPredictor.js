class MarkovChainBehaviorPredictor {
    constructor() {
        this.playerStates = new Map();
        this.transitionMatrices = new Map();
        
        this.behaviorStates = {
            CONSERVATIVE: 'conservative',
            MODERATE: 'moderate',
            AGGRESSIVE: 'aggressive',
            WHALE: 'whale',
            DORMANT: 'dormant',
            CHASING_LOSSES: 'chasing_losses',
            WIN_STREAKING: 'win_streaking',
            TILT_MODE: 'tilt_mode'
        };
        
        this.stateFeatures = {
            [this.behaviorStates.CONSERVATIVE]: {
                betSizeMultiplier: 0.1,
                sessionFrequency: 'low',
                riskTolerance: 0.2,
                lossChasing: 0.05,
                emotionalVolatility: 0.1
            },
            [this.behaviorStates.MODERATE]: {
                betSizeMultiplier: 0.5,
                sessionFrequency: 'medium',
                riskTolerance: 0.5,
                lossChasing: 0.2,
                emotionalVolatility: 0.3
            },
            [this.behaviorStates.AGGRESSIVE]: {
                betSizeMultiplier: 1.0,
                sessionFrequency: 'high',
                riskTolerance: 0.8,
                lossChasing: 0.6,
                emotionalVolatility: 0.7
            },
            [this.behaviorStates.WHALE]: {
                betSizeMultiplier: 3.0,
                sessionFrequency: 'very_high',
                riskTolerance: 0.9,
                lossChasing: 0.4,
                emotionalVolatility: 0.5
            },
            [this.behaviorStates.DORMANT]: {
                betSizeMultiplier: 0.0,
                sessionFrequency: 'none',
                riskTolerance: 0.0,
                lossChasing: 0.0,
                emotionalVolatility: 0.1
            },
            [this.behaviorStates.CHASING_LOSSES]: {
                betSizeMultiplier: 2.0,
                sessionFrequency: 'extreme',
                riskTolerance: 1.0,
                lossChasing: 0.95,
                emotionalVolatility: 0.9
            },
            [this.behaviorStates.WIN_STREAKING]: {
                betSizeMultiplier: 1.5,
                sessionFrequency: 'high',
                riskTolerance: 0.7,
                lossChasing: 0.1,
                emotionalVolatility: 0.4
            },
            [this.behaviorStates.TILT_MODE]: {
                betSizeMultiplier: 2.5,
                sessionFrequency: 'extreme',
                riskTolerance: 1.0,
                lossChasing: 0.8,
                emotionalVolatility: 1.0
            }
        };
        
        this.gameTypeWeights = {
            slots: { volatility: 0.3, skill: 0.1, social: 0.2 },
            blackjack: { volatility: 0.4, skill: 0.8, social: 0.3 },
            roulette: { volatility: 0.5, skill: 0.2, social: 0.6 },
            plinko: { volatility: 0.6, skill: 0.3, social: 0.1 },
            keno: { volatility: 0.4, skill: 0.1, social: 0.4 },
            crash: { volatility: 0.9, skill: 0.4, social: 0.7 }
        };
    }

    initializePlayerMarkovChain(userId, initialBehaviorData = {}) {
        const defaultTransitionMatrix = this.generateBaseTransitionMatrix();
        
        this.transitionMatrices.set(userId, {
            matrix: defaultTransitionMatrix,
            observations: 0,
            lastUpdate: Date.now(),
            confidence: 0.1,
            personalizedFactors: {
                riskAversion: initialBehaviorData.riskAversion || 0.5,
                lossToleranceThreshold: initialBehaviorData.lossThreshold || 1000,
                emotionalStability: initialBehaviorData.emotionalStability || 0.5,
                sessionLengthPreference: initialBehaviorData.sessionLength || 'medium',
                gamePreferences: initialBehaviorData.gamePreferences || {}
            }
        });
        
        this.playerStates.set(userId, {
            currentState: this.behaviorStates.MODERATE,
            stateHistory: [this.behaviorStates.MODERATE],
            stateStartTime: Date.now(),
            stateDuration: 0,
            transitionProbabilities: defaultTransitionMatrix[this.behaviorStates.MODERATE],
            confidence: 0.1,
            behaviorMetrics: this.initializeBehaviorMetrics()
        });
    }

    generateBaseTransitionMatrix() {
        const states = Object.values(this.behaviorStates);
        const matrix = {};
        
        states.forEach(fromState => {
            matrix[fromState] = {};
            states.forEach(toState => {
                if (fromState === toState) {
                    matrix[fromState][toState] = this.calculateSelfTransitionProbability(fromState);
                } else {
                    matrix[fromState][toState] = this.calculateTransitionProbability(fromState, toState);
                }
            });
            
            this.normalizeTransitionProbabilities(matrix[fromState]);
        });
        
        return matrix;
    }

    calculateSelfTransitionProbability(state) {
        const stickiness = {
            [this.behaviorStates.CONSERVATIVE]: 0.85,
            [this.behaviorStates.MODERATE]: 0.70,
            [this.behaviorStates.AGGRESSIVE]: 0.60,
            [this.behaviorStates.WHALE]: 0.75,
            [this.behaviorStates.DORMANT]: 0.90,
            [this.behaviorStates.CHASING_LOSSES]: 0.40,
            [this.behaviorStates.WIN_STREAKING]: 0.50,
            [this.behaviorStates.TILT_MODE]: 0.30
        };
        
        return stickiness[state] || 0.70;
    }

    calculateTransitionProbability(fromState, toState) {
        const transitionLogic = {
            [this.behaviorStates.CONSERVATIVE]: {
                [this.behaviorStates.MODERATE]: 0.10,
                [this.behaviorStates.AGGRESSIVE]: 0.02,
                [this.behaviorStates.WHALE]: 0.001,
                [this.behaviorStates.DORMANT]: 0.025,
                [this.behaviorStates.CHASING_LOSSES]: 0.005,
                [this.behaviorStates.WIN_STREAKING]: 0.015,
                [this.behaviorStates.TILT_MODE]: 0.004
            },
            [this.behaviorStates.MODERATE]: {
                [this.behaviorStates.CONSERVATIVE]: 0.15,
                [this.behaviorStates.AGGRESSIVE]: 0.12,
                [this.behaviorStates.WHALE]: 0.02,
                [this.behaviorStates.DORMANT]: 0.05,
                [this.behaviorStates.CHASING_LOSSES]: 0.08,
                [this.behaviorStates.WIN_STREAKING]: 0.06,
                [this.behaviorStates.TILT_MODE]: 0.02
            },
            [this.behaviorStates.AGGRESSIVE]: {
                [this.behaviorStates.CONSERVATIVE]: 0.08,
                [this.behaviorStates.MODERATE]: 0.20,
                [this.behaviorStates.WHALE]: 0.05,
                [this.behaviorStates.DORMANT]: 0.03,
                [this.behaviorStates.CHASING_LOSSES]: 0.15,
                [this.behaviorStates.WIN_STREAKING]: 0.12,
                [this.behaviorStates.TILT_MODE]: 0.07
            },
            [this.behaviorStates.WHALE]: {
                [this.behaviorStates.CONSERVATIVE]: 0.05,
                [this.behaviorStates.MODERATE]: 0.12,
                [this.behaviorStates.AGGRESSIVE]: 0.10,
                [this.behaviorStates.DORMANT]: 0.02,
                [this.behaviorStates.CHASING_LOSSES]: 0.08,
                [this.behaviorStates.WIN_STREAKING]: 0.15,
                [this.behaviorStates.TILT_MODE]: 0.03
            },
            [this.behaviorStates.DORMANT]: {
                [this.behaviorStates.CONSERVATIVE]: 0.06,
                [this.behaviorStates.MODERATE]: 0.03,
                [this.behaviorStates.AGGRESSIVE]: 0.005,
                [this.behaviorStates.WHALE]: 0.002,
                [this.behaviorStates.CHASING_LOSSES]: 0.001,
                [this.behaviorStates.WIN_STREAKING]: 0.002,
                [this.behaviorStates.TILT_MODE]: 0.001
            },
            [this.behaviorStates.CHASING_LOSSES]: {
                [this.behaviorStates.CONSERVATIVE]: 0.10,
                [this.behaviorStates.MODERATE]: 0.25,
                [this.behaviorStates.AGGRESSIVE]: 0.15,
                [this.behaviorStates.WHALE]: 0.02,
                [this.behaviorStates.DORMANT]: 0.05,
                [this.behaviorStates.WIN_STREAKING]: 0.08,
                [this.behaviorStates.TILT_MODE]: 0.25
            },
            [this.behaviorStates.WIN_STREAKING]: {
                [this.behaviorStates.CONSERVATIVE]: 0.08,
                [this.behaviorStates.MODERATE]: 0.20,
                [this.behaviorStates.AGGRESSIVE]: 0.15,
                [this.behaviorStates.WHALE]: 0.05,
                [this.behaviorStates.DORMANT]: 0.01,
                [this.behaviorStates.CHASING_LOSSES]: 0.01,
                [this.behaviorStates.TILT_MODE]: 0.02
            },
            [this.behaviorStates.TILT_MODE]: {
                [this.behaviorStates.CONSERVATIVE]: 0.15,
                [this.behaviorStates.MODERATE]: 0.30,
                [this.behaviorStates.AGGRESSIVE]: 0.20,
                [this.behaviorStates.WHALE]: 0.02,
                [this.behaviorStates.DORMANT]: 0.10,
                [this.behaviorStates.CHASING_LOSSES]: 0.20,
                [this.behaviorStates.WIN_STREAKING]: 0.03
            }
        };
        
        return transitionLogic[fromState]?.[toState] || 0.001;
    }

    normalizeTransitionProbabilities(transitions) {
        const total = Object.values(transitions).reduce((sum, prob) => sum + prob, 0);
        if (total > 0) {
            Object.keys(transitions).forEach(key => {
                transitions[key] /= total;
            });
        }
    }

    initializeBehaviorMetrics() {
        return {
            totalWagered: 0,
            totalWinnings: 0,
            totalLosses: 0,
            sessionCount: 0,
            averageSessionLength: 0,
            lastBetSize: 0,
            maxBetSize: 0,
            betSizeVariance: 0,
            winStreak: 0,
            lossStreak: 0,
            maxWinStreak: 0,
            maxLossStreak: 0,
            emotionalSpikes: 0,
            gamePreferences: {},
            timeOfDayPatterns: {},
            weekdayPatterns: {}
        };
    }

    updatePlayerBehavior(userId, gameResult) {
        if (!this.playerStates.has(userId)) {
            this.initializePlayerMarkovChain(userId);
        }
        
        const playerData = this.playerStates.get(userId);
        const transitionData = this.transitionMatrices.get(userId);
        
        this.updateBehaviorMetrics(playerData, gameResult);
        
        const newState = this.predictStateTransition(userId, gameResult);
        
        if (newState !== playerData.currentState) {
            this.recordStateTransition(userId, playerData.currentState, newState);
            playerData.currentState = newState;
            playerData.stateStartTime = Date.now();
            playerData.stateHistory.push(newState);
            
            if (playerData.stateHistory.length > 100) {
                playerData.stateHistory.shift();
            }
        }
        
        this.updateTransitionMatrix(userId, gameResult);
        
        playerData.confidence = Math.min(1.0, playerData.confidence + 0.01);
        transitionData.observations++;
        transitionData.confidence = Math.min(1.0, transitionData.observations / 1000);
    }

    updateBehaviorMetrics(playerData, gameResult) {
        const metrics = playerData.behaviorMetrics;
        
        metrics.totalWagered += gameResult.betAmount || 0;
        
        if (gameResult.outcome === 'win') {
            metrics.totalWinnings += gameResult.winAmount || 0;
            metrics.winStreak++;
            metrics.lossStreak = 0;
            metrics.maxWinStreak = Math.max(metrics.maxWinStreak, metrics.winStreak);
        } else {
            metrics.totalLosses += gameResult.betAmount || 0;
            metrics.lossStreak++;
            metrics.winStreak = 0;
            metrics.maxLossStreak = Math.max(metrics.maxLossStreak, metrics.lossStreak);
        }
        
        metrics.lastBetSize = gameResult.betAmount || 0;
        metrics.maxBetSize = Math.max(metrics.maxBetSize, gameResult.betAmount || 0);
        
        if (gameResult.gameType) {
            metrics.gamePreferences[gameResult.gameType] = 
                (metrics.gamePreferences[gameResult.gameType] || 0) + 1;
        }
        
        const hour = new Date().getHours();
        metrics.timeOfDayPatterns[hour] = (metrics.timeOfDayPatterns[hour] || 0) + 1;
        
        const dayOfWeek = new Date().getDay();
        metrics.weekdayPatterns[dayOfWeek] = (metrics.weekdayPatterns[dayOfWeek] || 0) + 1;
        
        if (this.detectEmotionalSpike(gameResult)) {
            metrics.emotionalSpikes++;
        }
    }

    detectEmotionalSpike(gameResult) {
        const indicators = [
            gameResult.betAmount > gameResult.previousBetAmount * 3,
            gameResult.outcome === 'loss' && gameResult.consecutiveLosses > 3,
            gameResult.sessionBetCount > 50 && gameResult.sessionDuration < 600000,
            gameResult.betAmount > gameResult.averageBetSize * 5
        ];
        
        return indicators.filter(Boolean).length >= 2;
    }

    predictStateTransition(userId, gameResult) {
        const playerData = this.playerStates.get(userId);
        const currentState = playerData.currentState;
        const metrics = playerData.behaviorMetrics;
        
        const stateFactors = this.calculateStateTransitionFactors(gameResult, metrics);
        
        const transitionProbabilities = { ...playerData.transitionProbabilities };
        
        Object.keys(transitionProbabilities).forEach(state => {
            transitionProbabilities[state] *= stateFactors[state] || 1.0;
        });
        
        this.normalizeTransitionProbabilities(transitionProbabilities);
        
        const random = Math.random();
        let cumulativeProbability = 0;
        
        for (const [state, probability] of Object.entries(transitionProbabilities)) {
            cumulativeProbability += probability;
            if (random <= cumulativeProbability) {
                return state;
            }
        }
        
        return currentState;
    }

    calculateStateTransitionFactors(gameResult, metrics) {
        const factors = {};
        Object.values(this.behaviorStates).forEach(state => {
            factors[state] = 1.0;
        });
        
        if (gameResult.outcome === 'loss') {
            if (metrics.lossStreak >= 5) {
                factors[this.behaviorStates.CHASING_LOSSES] *= 3.0;
                factors[this.behaviorStates.TILT_MODE] *= 2.5;
                factors[this.behaviorStates.DORMANT] *= 1.5;
                factors[this.behaviorStates.CONSERVATIVE] *= 0.5;
            }
            
            if (gameResult.lossAmount > metrics.maxBetSize * 0.5) {
                factors[this.behaviorStates.TILT_MODE] *= 2.0;
                factors[this.behaviorStates.CONSERVATIVE] *= 2.0;
            }
        }
        
        if (gameResult.outcome === 'win') {
            if (metrics.winStreak >= 3) {
                factors[this.behaviorStates.WIN_STREAKING] *= 2.5;
                factors[this.behaviorStates.AGGRESSIVE] *= 1.8;
                factors[this.behaviorStates.WHALE] *= 1.3;
            }
            
            if (gameResult.winAmount > gameResult.betAmount * 10) {
                factors[this.behaviorStates.AGGRESSIVE] *= 2.0;
                factors[this.behaviorStates.WIN_STREAKING] *= 3.0;
            }
        }
        
        if (gameResult.betAmount > metrics.averageBetSize * 3) {
            factors[this.behaviorStates.AGGRESSIVE] *= 1.5;
            factors[this.behaviorStates.WHALE] *= 1.8;
            factors[this.behaviorStates.CONSERVATIVE] *= 0.3;
        }
        
        const netPosition = metrics.totalWinnings - metrics.totalLosses;
        if (netPosition < -metrics.totalWagered * 0.5) {
            factors[this.behaviorStates.CHASING_LOSSES] *= 2.0;
            factors[this.behaviorStates.TILT_MODE] *= 1.5;
            factors[this.behaviorStates.DORMANT] *= 1.8;
        }
        
        if (Date.now() - metrics.lastActivity > 24 * 60 * 60 * 1000) {
            factors[this.behaviorStates.DORMANT] *= 3.0;
        }
        
        return factors;
    }

    recordStateTransition(userId, fromState, toState) {
        const transitionData = this.transitionMatrices.get(userId);
        const currentMatrix = transitionData.matrix;
        
        const learningRate = this.calculateAdaptiveLearningRate(transitionData);
        
        Object.keys(currentMatrix[fromState]).forEach(state => {
            if (state === toState) {
                currentMatrix[fromState][state] += learningRate * (1 - currentMatrix[fromState][state]);
            } else {
                currentMatrix[fromState][state] *= (1 - learningRate);
            }
        });
        
        this.normalizeTransitionProbabilities(currentMatrix[fromState]);
        
        transitionData.lastUpdate = Date.now();
    }

    calculateAdaptiveLearningRate(transitionData) {
        const baseRate = 0.05;
        const confidenceFactor = 1 - transitionData.confidence;
        const observationFactor = Math.max(0.1, 1 / Math.sqrt(transitionData.observations + 1));
        
        return baseRate * confidenceFactor * observationFactor;
    }

    updateTransitionMatrix(userId, gameResult) {
        const playerData = this.playerStates.get(userId);
        const transitionData = this.transitionMatrices.get(userId);
        
        playerData.transitionProbabilities = 
            transitionData.matrix[playerData.currentState];
    }

    predictPlayerBehavior(userId, horizonSteps = 5) {
        if (!this.playerStates.has(userId)) {
            return null;
        }
        
        const playerData = this.playerStates.get(userId);
        const transitionMatrix = this.transitionMatrices.get(userId).matrix;
        
        let currentStateProbs = {};
        Object.values(this.behaviorStates).forEach(state => {
            currentStateProbs[state] = state === playerData.currentState ? 1.0 : 0.0;
        });
        
        const prediction = {
            initialState: playerData.currentState,
            horizon: horizonSteps,
            stateEvolution: [{ ...currentStateProbs }],
            expectedBehaviorMetrics: {},
            riskAssessment: {},
            confidence: playerData.confidence
        };
        
        for (let step = 1; step <= horizonSteps; step++) {
            const nextProbs = {};
            Object.values(this.behaviorStates).forEach(toState => {
                nextProbs[toState] = 0;
                Object.values(this.behaviorStates).forEach(fromState => {
                    nextProbs[toState] += currentStateProbs[fromState] * 
                        transitionMatrix[fromState][toState];
                });
            });
            
            currentStateProbs = nextProbs;
            prediction.stateEvolution.push({ ...currentStateProbs });
        }
        
        prediction.expectedBehaviorMetrics = this.calculateExpectedMetrics(
            prediction.stateEvolution[horizonSteps], 
            playerData.behaviorMetrics
        );
        
        prediction.riskAssessment = this.assessPlayerRisk(userId, prediction);
        
        return prediction;
    }

    calculateExpectedMetrics(finalStateProbs, currentMetrics) {
        const expectedMetrics = {};
        
        let expectedBetMultiplier = 0;
        let expectedRiskLevel = 0;
        let expectedVolatility = 0;
        
        Object.entries(finalStateProbs).forEach(([state, probability]) => {
            const stateFeatures = this.stateFeatures[state];
            expectedBetMultiplier += probability * stateFeatures.betSizeMultiplier;
            expectedRiskLevel += probability * stateFeatures.riskTolerance;
            expectedVolatility += probability * stateFeatures.emotionalVolatility;
        });
        
        expectedMetrics.expectedBetSize = currentMetrics.lastBetSize * expectedBetMultiplier;
        expectedMetrics.expectedRiskTolerance = expectedRiskLevel;
        expectedMetrics.expectedVolatility = expectedVolatility;
        expectedMetrics.chaseLosingProbability = finalStateProbs[this.behaviorStates.CHASING_LOSSES];
        expectedMetrics.tiltModeProbability = finalStateProbs[this.behaviorStates.TILT_MODE];
        expectedMetrics.dormantProbability = finalStateProbs[this.behaviorStates.DORMANT];
        
        return expectedMetrics;
    }

    assessPlayerRisk(userId, prediction) {
        const riskMetrics = prediction.expectedBehaviorMetrics;
        const playerData = this.playerStates.get(userId);
        
        const riskFactors = {
            lossChasingRisk: riskMetrics.chaseLosingProbability * 0.3,
            tiltRisk: riskMetrics.tiltModeProbability * 0.4,
            volatilityRisk: riskMetrics.expectedVolatility * 0.2,
            betSizeRisk: Math.min(1.0, riskMetrics.expectedBetSize / 10000) * 0.1
        };
        
        const overallRisk = Object.values(riskFactors).reduce((sum, risk) => sum + risk, 0);
        
        return {
            overallRiskScore: overallRisk,
            riskLevel: this.categorizeRiskLevel(overallRisk),
            riskFactors: riskFactors,
            recommendedActions: this.generateRiskRecommendations(overallRisk, riskFactors),
            confidence: prediction.confidence
        };
    }

    categorizeRiskLevel(riskScore) {
        if (riskScore < 0.2) return 'LOW';
        if (riskScore < 0.4) return 'MEDIUM';
        if (riskScore < 0.6) return 'HIGH';
        if (riskScore < 0.8) return 'VERY_HIGH';
        return 'EXTREME';
    }

    generateRiskRecommendations(overallRisk, riskFactors) {
        const recommendations = [];
        
        if (riskFactors.lossChasingRisk > 0.15) {
            recommendations.push('IMPLEMENT_LOSS_LIMITS');
            recommendations.push('ENCOURAGE_BREAK_TAKING');
        }
        
        if (riskFactors.tiltRisk > 0.2) {
            recommendations.push('REDUCE_MULTIPLIER_AVAILABILITY');
            recommendations.push('MANDATORY_COOLING_PERIOD');
        }
        
        if (riskFactors.volatilityRisk > 0.3) {
            recommendations.push('EMOTIONAL_STATE_MONITORING');
            recommendations.push('GENTLE_INTERVENTION_MESSAGING');
        }
        
        if (riskFactors.betSizeRisk > 0.05) {
            recommendations.push('DYNAMIC_MAX_BET_ADJUSTMENT');
            recommendations.push('PROGRESSIVE_BET_SIZE_WARNINGS');
        }
        
        if (overallRisk > 0.6) {
            recommendations.push('ESCALATE_TO_RESPONSIBLE_GAMBLING');
            recommendations.push('CONSIDER_SESSION_TERMINATION');
        }
        
        return recommendations;
    }

    calculateOptimalMultiplier(userId, gameType, baseBetAmount) {
        const prediction = this.predictPlayerBehavior(userId, 3);
        if (!prediction) return 1.0;
        
        const riskAssessment = prediction.riskAssessment;
        const expectedMetrics = prediction.expectedBehaviorMetrics;
        
        let multiplierAdjustment = 1.0;
        
        const gameWeights = this.gameTypeWeights[gameType] || 
            { volatility: 0.5, skill: 0.3, social: 0.2 };
        
        if (riskAssessment.riskLevel === 'HIGH' || riskAssessment.riskLevel === 'VERY_HIGH') {
            multiplierAdjustment *= 0.6;
        } else if (riskAssessment.riskLevel === 'EXTREME') {
            multiplierAdjustment *= 0.3;
        }
        
        if (expectedMetrics.chaseLosingProbability > 0.2) {
            multiplierAdjustment *= (1 - expectedMetrics.chaseLosingProbability * 0.5);
        }
        
        if (expectedMetrics.tiltModeProbability > 0.1) {
            multiplierAdjustment *= (1 - expectedMetrics.tiltModeProbability * 0.7);
        }
        
        const volatilityFactor = gameWeights.volatility * expectedMetrics.expectedVolatility;
        multiplierAdjustment *= (1 - volatilityFactor * 0.3);
        
        const betSizeRatio = Math.min(1.0, baseBetAmount / 1000);
        multiplierAdjustment *= (1 - betSizeRatio * 0.2);
        
        return Math.max(0.1, Math.min(3.0, multiplierAdjustment));
    }

    getPlayerStateAnalysis(userId) {
        if (!this.playerStates.has(userId)) {
            return null;
        }
        
        const playerData = this.playerStates.get(userId);
        const transitionData = this.transitionMatrices.get(userId);
        const prediction = this.predictPlayerBehavior(userId);
        
        return {
            currentState: playerData.currentState,
            stateFeatures: this.stateFeatures[playerData.currentState],
            stateHistory: playerData.stateHistory.slice(-10),
            stateDuration: Date.now() - playerData.stateStartTime,
            behaviorMetrics: playerData.behaviorMetrics,
            transitionConfidence: transitionData.confidence,
            observations: transitionData.observations,
            prediction: prediction,
            timestamp: Date.now()
        };
    }

    exportMarkovChainData(userId) {
        if (!this.playerStates.has(userId)) {
            return null;
        }
        
        return {
            playerState: this.playerStates.get(userId),
            transitionMatrix: this.transitionMatrices.get(userId),
            stateDefinitions: this.behaviorStates,
            stateFeatures: this.stateFeatures,
            exportTimestamp: Date.now()
        };
    }
}

module.exports = MarkovChainBehaviorPredictor;