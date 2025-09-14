class DynamicRTPController {
    constructor() {
        this.gameRTPProfiles = new Map();
        this.playerRTPProfiles = new Map();
        this.systemRTPTargets = new Map();
        this.controlParameters = new Map();
        
        this.gameTypes = {
            SLOTS: 'slots',
            BLACKJACK: 'blackjack',
            ROULETTE: 'roulette',
            PLINKO: 'plinko',
            KENO: 'keno',
            CRASH: 'crash',
            DICE: 'dice',
            MINES: 'mines'
        };
        
        this.rtpControlMethods = {
            ADAPTIVE_MULTIPLIER: 'adaptive_multiplier',
            DYNAMIC_ODDS: 'dynamic_odds',
            PROGRESSIVE_DIFFICULTY: 'progressive_difficulty',
            BEHAVIORAL_ADJUSTMENT: 'behavioral_adjustment',
            ECONOMIC_STABILIZATION: 'economic_stabilization'
        };
        
        this.stabilityMetrics = {
            VOLATILITY: 'volatility',
            TREND: 'trend',
            DEVIATION: 'deviation',
            MOMENTUM: 'momentum',
            OSCILLATION: 'oscillation'
        };
        
        this.initializeSystemTargets();
        this.initializeControlParameters();
    }

    initializeSystemTargets() {
        this.systemRTPTargets.set(this.gameTypes.SLOTS, {
            baseRTP: 0.96,
            minRTP: 0.92,
            maxRTP: 0.98,
            volatilityTarget: 0.15,
            convergenceTime: 3600000,
            playerSegments: {
                whale: { targetRTP: 0.955, variance: 0.02 },
                high_roller: { targetRTP: 0.96, variance: 0.015 },
                regular: { targetRTP: 0.96, variance: 0.01 },
                casual: { targetRTP: 0.965, variance: 0.008 },
                new_player: { targetRTP: 0.97, variance: 0.005 }
            }
        });
        
        this.systemRTPTargets.set(this.gameTypes.BLACKJACK, {
            baseRTP: 0.995,
            minRTP: 0.99,
            maxRTP: 0.999,
            volatilityTarget: 0.08,
            convergenceTime: 7200000,
            playerSegments: {
                whale: { targetRTP: 0.994, variance: 0.003 },
                high_roller: { targetRTP: 0.995, variance: 0.002 },
                regular: { targetRTP: 0.995, variance: 0.002 },
                casual: { targetRTP: 0.996, variance: 0.001 },
                new_player: { targetRTP: 0.997, variance: 0.001 }
            }
        });
        
        this.systemRTPTargets.set(this.gameTypes.ROULETTE, {
            baseRTP: 0.973,
            minRTP: 0.97,
            maxRTP: 0.976,
            volatilityTarget: 0.12,
            convergenceTime: 5400000,
            playerSegments: {
                whale: { targetRTP: 0.972, variance: 0.002 },
                high_roller: { targetRTP: 0.973, variance: 0.0015 },
                regular: { targetRTP: 0.973, variance: 0.001 },
                casual: { targetRTP: 0.974, variance: 0.001 },
                new_player: { targetRTP: 0.975, variance: 0.0005 }
            }
        });
        
        this.systemRTPTargets.set(this.gameTypes.PLINKO, {
            baseRTP: 0.965,
            minRTP: 0.95,
            maxRTP: 0.975,
            volatilityTarget: 0.25,
            convergenceTime: 2700000,
            playerSegments: {
                whale: { targetRTP: 0.96, variance: 0.008 },
                high_roller: { targetRTP: 0.965, variance: 0.006 },
                regular: { targetRTP: 0.965, variance: 0.005 },
                casual: { targetRTP: 0.97, variance: 0.003 },
                new_player: { targetRTP: 0.975, variance: 0.002 }
            }
        });
        
        this.systemRTPTargets.set(this.gameTypes.KENO, {
            baseRTP: 0.95,
            minRTP: 0.93,
            maxRTP: 0.97,
            volatilityTarget: 0.35,
            convergenceTime: 1800000,
            playerSegments: {
                whale: { targetRTP: 0.945, variance: 0.01 },
                high_roller: { targetRTP: 0.95, variance: 0.008 },
                regular: { targetRTP: 0.95, variance: 0.006 },
                casual: { targetRTP: 0.955, variance: 0.004 },
                new_player: { targetRTP: 0.965, variance: 0.003 }
            }
        });
        
        this.systemRTPTargets.set(this.gameTypes.CRASH, {
            baseRTP: 0.99,
            minRTP: 0.98,
            maxRTP: 0.995,
            volatilityTarget: 0.45,
            convergenceTime: 1200000,
            playerSegments: {
                whale: { targetRTP: 0.985, variance: 0.005 },
                high_roller: { targetRTP: 0.99, variance: 0.003 },
                regular: { targetRTP: 0.99, variance: 0.002 },
                casual: { targetRTP: 0.992, variance: 0.002 },
                new_player: { targetRTP: 0.994, variance: 0.001 }
            }
        });
    }

    initializeControlParameters() {
        Object.values(this.gameTypes).forEach(gameType => {
            this.controlParameters.set(gameType, {
                adaptiveGain: 0.1,
                stabilityThreshold: 0.05,
                convergenceRate: 0.02,
                oscillationDamping: 0.8,
                momentumDecay: 0.95,
                volatilitySmoothing: 0.9,
                playerSegmentWeight: 0.3,
                economicStabilityWeight: 0.4,
                behavioralWeight: 0.3,
                minAdjustmentInterval: 60000,
                maxAdjustmentMagnitude: 0.02,
                confidenceThreshold: 0.7
            });
        });
    }

    initializePlayerRTPProfile(userId, gameType, initialSegment = 'regular') {
        const profileKey = `${userId}_${gameType}`;
        const targets = this.systemRTPTargets.get(gameType);
        
        if (!targets) {
            console.warn(`No RTP targets defined for game type: ${gameType}`);
            return null;
        }
        
        const segmentTarget = targets.playerSegments && targets.playerSegments[initialSegment] ? 
            targets.playerSegments[initialSegment] : 
            (targets.playerSegments && targets.playerSegments.regular ? targets.playerSegments.regular : { targetRTP: 0.96, variance: 0.01 });
        
        this.playerRTPProfiles.set(profileKey, {
            userId,
            gameType,
            segment: initialSegment,
            createdAt: Date.now(),
            lastUpdated: Date.now(),
            
            currentRTP: segmentTarget.targetRTP,
            targetRTP: segmentTarget.targetRTP,
            actualRTP: segmentTarget.targetRTP,
            rtpHistory: [segmentTarget.targetRTP],
            
            performanceMetrics: {
                totalGames: 0,
                totalWagered: 0,
                totalPaidOut: 0,
                winCount: 0,
                lossCount: 0,
                averageBetSize: 0,
                sessionCount: 0,
                volatility: 0,
                variance: segmentTarget.variance,
                standardDeviation: segmentTarget.variance > 0 ? Math.sqrt(segmentTarget.variance) : 0
            },
            
            controlState: {
                error: 0,
                integralError: 0,
                derivativeError: 0,
                lastError: 0,
                adjustment: 0,
                momentum: 0,
                trend: 0,
                stability: 1.0,
                confidence: 0.1
            },
            
            stabilityAnalysis: {
                shortTermVolatility: 0,
                longTermTrend: 0,
                oscillationAmplitude: 0,
                convergenceRate: 0,
                deviationMagnitude: 0,
                stabilityScore: 1.0
            },
            
            adaptiveFactors: {
                playerBehaviorWeight: 0.3,
                economicConditionWeight: 0.4,
                gameBalanceWeight: 0.3,
                temporalWeight: 0.2,
                volatilityWeight: 0.4
            }
        });
    }

    async calculateDynamicRTP(userId, gameType, gameContext) {
        const profileKey = `${userId}_${gameType}`;
        
        if (!this.playerRTPProfiles.has(profileKey)) {
            this.initializePlayerRTPProfile(userId, gameType);
        }
        
        const playerProfile = this.playerRTPProfiles.get(profileKey);
        const gameTargets = this.systemRTPTargets.get(gameType);
        const controlParams = this.controlParameters.get(gameType);
        
        if (!gameTargets || !controlParams) {
            return playerProfile.currentRTP;
        }
        
        this.updatePlayerMetrics(playerProfile, gameContext);
        
        const stabilityAnalysis = this.analyzeStability(playerProfile);
        const errorSignal = this.calculateErrorSignal(playerProfile, gameTargets);
        const controlAdjustment = this.calculateControlAdjustment(
            playerProfile, errorSignal, controlParams
        );
        
        const behavioralAdjustment = await this.calculateBehavioralAdjustment(
            userId, gameType, gameContext
        );
        const economicAdjustment = await this.calculateEconomicAdjustment(
            userId, gameType, gameContext
        );
        
        const combinedAdjustment = this.combineAdjustments(
            controlAdjustment,
            behavioralAdjustment,
            economicAdjustment,
            playerProfile.adaptiveFactors
        );
        
        const newRTP = this.applyRTPAdjustment(
            playerProfile.currentRTP,
            combinedAdjustment,
            gameTargets,
            controlParams
        );
        
        this.updatePlayerRTPProfile(playerProfile, newRTP, stabilityAnalysis, gameContext);
        
        return {
            rtp: newRTP,
            adjustment: combinedAdjustment,
            stability: stabilityAnalysis.stabilityScore,
            confidence: playerProfile.controlState.confidence,
            factors: {
                control: controlAdjustment,
                behavioral: behavioralAdjustment,
                economic: economicAdjustment
            },
            metadata: {
                segment: playerProfile.segment,
                targetRTP: playerProfile.targetRTP,
                actualRTP: playerProfile.actualRTP,
                error: errorSignal,
                timestamp: Date.now()
            }
        };
    }

    updatePlayerMetrics(playerProfile, gameContext) {
        const metrics = playerProfile.performanceMetrics;
        
        metrics.totalGames++;
        metrics.totalWagered += gameContext.betAmount || 0;
        
        if (gameContext.outcome === 'win') {
            metrics.winCount++;
            metrics.totalPaidOut += gameContext.winAmount || 0;
        } else {
            metrics.lossCount++;
        }
        
        metrics.averageBetSize = metrics.totalWagered / metrics.totalGames;
        
        if (metrics.totalWagered > 0) {
            playerProfile.actualRTP = metrics.totalPaidOut / metrics.totalWagered;
        }
        
        this.updateVarianceMetrics(playerProfile, gameContext);
        
        playerProfile.lastUpdated = Date.now();
    }

    updateVarianceMetrics(playerProfile, gameContext) {
        const metrics = playerProfile.performanceMetrics;
        
        if (metrics.totalGames > 1) {
            const expectedPayout = (gameContext.betAmount || 0) * playerProfile.currentRTP;
            const actualPayout = gameContext.outcome === 'win' ? 
                (gameContext.winAmount || 0) : 0;
            
            const deviation = actualPayout - expectedPayout;
            const squaredDeviation = deviation * deviation;
            
            const oldVariance = metrics.variance;
            const n = metrics.totalGames;
            
            metrics.variance = ((n - 2) * oldVariance + squaredDeviation) / (n - 1);
            metrics.standardDeviation = Math.sqrt(metrics.variance);
            
            const recentGames = Math.min(50, n);
            const alpha = 2 / (recentGames + 1);
            metrics.volatility = alpha * Math.abs(deviation) + (1 - alpha) * metrics.volatility;
        }
    }

    analyzeStability(playerProfile) {
        const rtpHistory = playerProfile.rtpHistory;
        const metrics = playerProfile.performanceMetrics;
        
        if (rtpHistory.length < 5) {
            return {
                shortTermVolatility: 0.1,
                longTermTrend: 0,
                oscillationAmplitude: 0.01,
                convergenceRate: 0.02,
                deviationMagnitude: 0.01,
                stabilityScore: 0.9
            };
        }
        
        const shortTermVolatility = this.calculateShortTermVolatility(rtpHistory);
        const longTermTrend = this.calculateLongTermTrend(rtpHistory);
        const oscillationAmplitude = this.calculateOscillationAmplitude(rtpHistory);
        const convergenceRate = this.calculateConvergenceRate(rtpHistory, playerProfile.targetRTP);
        const deviationMagnitude = Math.abs(playerProfile.actualRTP - playerProfile.targetRTP);
        
        const stabilityComponents = {
            volatilityStability: Math.max(0, 1 - (shortTermVolatility / 0.1)),
            trendStability: Math.max(0, 1 - Math.abs(longTermTrend) / 0.05),
            oscillationStability: Math.max(0, 1 - (oscillationAmplitude / 0.03)),
            convergenceStability: Math.max(0, 1 - Math.abs(convergenceRate) / 0.02),
            deviationStability: Math.max(0, 1 - (deviationMagnitude / 0.05))
        };
        
        const stabilityScore = Object.values(stabilityComponents)
            .reduce((sum, component) => sum + component, 0) / 5;
        
        return {
            shortTermVolatility,
            longTermTrend,
            oscillationAmplitude,
            convergenceRate,
            deviationMagnitude,
            stabilityScore: Math.max(0.1, stabilityScore),
            components: stabilityComponents
        };
    }

    calculateShortTermVolatility(rtpHistory) {
        const recentHistory = rtpHistory.slice(-20);
        if (recentHistory.length < 3) return 0.01;
        
        const mean = recentHistory.reduce((sum, rtp) => sum + rtp, 0) / recentHistory.length;
        const squaredDeviations = recentHistory.map(rtp => Math.pow(rtp - mean, 2));
        const variance = squaredDeviations.reduce((sum, dev) => sum + dev, 0) / (recentHistory.length - 1);
        
        return Math.sqrt(variance);
    }

    calculateLongTermTrend(rtpHistory) {
        if (rtpHistory.length < 10) return 0;
        
        const n = rtpHistory.length;
        const x = Array.from({ length: n }, (_, i) => i);
        const y = rtpHistory;
        
        const sumX = x.reduce((sum, val) => sum + val, 0);
        const sumY = y.reduce((sum, val) => sum + val, 0);
        const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
        const sumXX = x.reduce((sum, val) => sum + val * val, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        
        return slope;
    }

    calculateOscillationAmplitude(rtpHistory) {
        if (rtpHistory.length < 6) return 0.001;
        
        const recentHistory = rtpHistory.slice(-30);
        const peaks = [];
        const valleys = [];
        
        for (let i = 1; i < recentHistory.length - 1; i++) {
            if (recentHistory[i] > recentHistory[i - 1] && 
                recentHistory[i] > recentHistory[i + 1]) {
                peaks.push(recentHistory[i]);
            }
            if (recentHistory[i] < recentHistory[i - 1] && 
                recentHistory[i] < recentHistory[i + 1]) {
                valleys.push(recentHistory[i]);
            }
        }
        
        if (peaks.length === 0 || valleys.length === 0) return 0.001;
        
        const avgPeak = peaks.reduce((sum, peak) => sum + peak, 0) / peaks.length;
        const avgValley = valleys.reduce((sum, valley) => sum + valley, 0) / valleys.length;
        
        return Math.abs(avgPeak - avgValley);
    }

    calculateConvergenceRate(rtpHistory, targetRTP) {
        if (rtpHistory.length < 10) return 0;
        
        const recentHistory = rtpHistory.slice(-20);
        const errors = recentHistory.map(rtp => Math.abs(rtp - targetRTP));
        
        if (errors.length < 5) return 0;
        
        const oldErrors = errors.slice(0, Math.floor(errors.length / 2));
        const newErrors = errors.slice(Math.floor(errors.length / 2));
        
        const oldAvgError = oldErrors.reduce((sum, err) => sum + err, 0) / oldErrors.length;
        const newAvgError = newErrors.reduce((sum, err) => sum + err, 0) / newErrors.length;
        
        return (oldAvgError - newAvgError) / errors.length;
    }

    calculateErrorSignal(playerProfile, gameTargets) {
        const targetError = playerProfile.targetRTP - playerProfile.actualRTP;
        const stabilityError = this.calculateStabilityError(playerProfile, gameTargets);
        const varianceError = this.calculateVarianceError(playerProfile, gameTargets);
        
        return {
            primary: targetError,
            stability: stabilityError,
            variance: varianceError,
            combined: (targetError * 0.6) + (stabilityError * 0.25) + (varianceError * 0.15)
        };
    }

    calculateStabilityError(playerProfile, gameTargets) {
        const stability = playerProfile.stabilityAnalysis.stabilityScore;
        const targetStability = 0.8;
        
        return targetStability - stability;
    }

    calculateVarianceError(playerProfile, gameTargets) {
        const actualVariance = playerProfile.performanceMetrics.variance;
        const segmentConfig = gameTargets.playerSegments[playerProfile.segment];
        const targetVariance = segmentConfig.variance;
        
        return Math.max(0, actualVariance - targetVariance) / targetVariance;
    }

    calculateControlAdjustment(playerProfile, errorSignal, controlParams) {
        const controlState = playerProfile.controlState;
        const dt = Math.min(300000, Date.now() - playerProfile.lastUpdated) / 1000;
        
        const error = errorSignal.combined;
        
        const proportional = controlParams.adaptiveGain * error;
        
        controlState.integralError += error * dt;
        const integralLimit = 0.1;
        controlState.integralError = Math.max(-integralLimit, 
            Math.min(integralLimit, controlState.integralError));
        const integral = controlParams.adaptiveGain * 0.1 * controlState.integralError;
        
        const derivative = dt > 0 ? (error - controlState.lastError) / dt : 0;
        const derivativeComponent = controlParams.adaptiveGain * 0.05 * derivative;
        
        const rawAdjustment = proportional + integral + derivativeComponent;
        
        const momentumDecay = controlParams.momentumDecay;
        controlState.momentum = momentumDecay * controlState.momentum + (1 - momentumDecay) * rawAdjustment;
        
        const dampedAdjustment = rawAdjustment * controlParams.oscillationDamping + 
            controlState.momentum * (1 - controlParams.oscillationDamping);
        
        controlState.lastError = error;
        controlState.adjustment = dampedAdjustment;
        
        controlState.confidence = Math.min(1.0, controlState.confidence + 0.01);
        
        return Math.max(-controlParams.maxAdjustmentMagnitude, 
            Math.min(controlParams.maxAdjustmentMagnitude, dampedAdjustment));
    }

    async calculateBehavioralAdjustment(userId, gameType, gameContext) {
        try {
            const MarkovChainPredictor = require('./markovChainBehaviorPredictor');
            const markovChain = new MarkovChainPredictor();
            
            const playerAnalysis = markovChain.getPlayerStateAnalysis(userId);
            if (!playerAnalysis) return 0;
            
            const currentState = playerAnalysis.currentState;
            const stateFeatures = playerAnalysis.stateFeatures;
            
            let behavioralAdjustment = 0;
            
            if (currentState === 'aggressive' || currentState === 'whale') {
                behavioralAdjustment -= stateFeatures.riskTolerance * 0.01;
            } else if (currentState === 'conservative' || currentState === 'new_player') {
                behavioralAdjustment += (1 - stateFeatures.riskTolerance) * 0.008;
            }
            
            if (currentState === 'chasing_losses' || currentState === 'tilt_mode') {
                behavioralAdjustment += stateFeatures.emotionalVolatility * 0.015;
            }
            
            if (currentState === 'win_streaking') {
                behavioralAdjustment -= 0.005;
            }
            
            const riskPrediction = markovChain.predictPlayerBehavior(userId, 3);
            if (riskPrediction && riskPrediction.riskAssessment.riskLevel === 'HIGH') {
                behavioralAdjustment += 0.01;
            }
            
            return Math.max(-0.02, Math.min(0.02, behavioralAdjustment));
            
        } catch (error) {
            console.warn('Behavioral adjustment calculation failed:', error.message);
            return 0;
        }
    }

    async calculateEconomicAdjustment(userId, gameType, gameContext) {
        try {
            const EconomicOrchestrator = require('./masterEconomicOrchestrator');
            const orchestrator = new EconomicOrchestrator();
            
            const economicAnalysis = await orchestrator.analyzeEconomicState();
            if (!economicAnalysis) return 0;
            
            let economicAdjustment = 0;
            
            const wealthConcentration = economicAnalysis.entropyMetrics.wealthConcentration;
            if (wealthConcentration > 0.8) {
                economicAdjustment += 0.005;
            } else if (wealthConcentration < 0.3) {
                economicAdjustment -= 0.003;
            }
            
            const inflationRate = economicAnalysis.economicIndicators.inflationRate;
            if (inflationRate > 0.1) {
                economicAdjustment -= inflationRate * 0.02;
            } else if (inflationRate < -0.05) {
                economicAdjustment += Math.abs(inflationRate) * 0.015;
            }
            
            const systemStability = economicAnalysis.stabilityMetrics.overallStability;
            if (systemStability < 0.6) {
                economicAdjustment += (0.6 - systemStability) * 0.03;
            }
            
            const liquidityRatio = economicAnalysis.liquidityMetrics.systemLiquidity;
            if (liquidityRatio < 0.3) {
                economicAdjustment += (0.3 - liquidityRatio) * 0.025;
            }
            
            return Math.max(-0.015, Math.min(0.015, economicAdjustment));
            
        } catch (error) {
            console.warn('Economic adjustment calculation failed:', error.message);
            return 0;
        }
    }

    combineAdjustments(controlAdjustment, behavioralAdjustment, economicAdjustment, adaptiveFactors) {
        const weightedSum = 
            (controlAdjustment * (1 - adaptiveFactors.playerBehaviorWeight - adaptiveFactors.economicConditionWeight)) +
            (behavioralAdjustment * adaptiveFactors.playerBehaviorWeight) +
            (economicAdjustment * adaptiveFactors.economicConditionWeight);
        
        const temporalDamping = 0.8;
        const volatilityDamping = adaptiveFactors.volatilityWeight;
        
        const finalAdjustment = weightedSum * temporalDamping * (1 - volatilityDamping + 0.5);
        
        return Math.max(-0.03, Math.min(0.03, finalAdjustment));
    }

    applyRTPAdjustment(currentRTP, adjustment, gameTargets, controlParams) {
        const proposedRTP = currentRTP + adjustment;
        
        const boundedRTP = Math.max(gameTargets.minRTP, 
            Math.min(gameTargets.maxRTP, proposedRTP));
        
        const maxChangePerUpdate = controlParams.maxAdjustmentMagnitude;
        const actualChange = boundedRTP - currentRTP;
        const limitedChange = Math.max(-maxChangePerUpdate, 
            Math.min(maxChangePerUpdate, actualChange));
        
        const newRTP = currentRTP + limitedChange;
        
        const smoothingFactor = controlParams.volatilitySmoothing;
        const smoothedRTP = smoothingFactor * newRTP + (1 - smoothingFactor) * currentRTP;
        
        return Math.round(smoothedRTP * 10000) / 10000;
    }

    updatePlayerRTPProfile(playerProfile, newRTP, stabilityAnalysis, gameContext) {
        playerProfile.currentRTP = newRTP;
        playerProfile.rtpHistory.push(newRTP);
        
        if (playerProfile.rtpHistory.length > 500) {
            playerProfile.rtpHistory = playerProfile.rtpHistory.slice(-500);
        }
        
        playerProfile.stabilityAnalysis = stabilityAnalysis;
        
        this.updatePlayerSegment(playerProfile, gameContext);
        this.updateAdaptiveFactors(playerProfile, stabilityAnalysis);
        
        playerProfile.lastUpdated = Date.now();
    }

    updatePlayerSegment(playerProfile, gameContext) {
        const metrics = playerProfile.performanceMetrics;
        const avgBet = metrics.averageBetSize;
        const totalWagered = metrics.totalWagered;
        
        let newSegment = 'regular';
        
        if (totalWagered > 1000000 && avgBet > 5000) {
            newSegment = 'whale';
        } else if (avgBet > 1000 || totalWagered > 100000) {
            newSegment = 'high_roller';
        } else if (metrics.totalGames < 50 || totalWagered < 1000) {
            newSegment = 'new_player';
        } else if (avgBet < 50 && metrics.sessionCount < 10) {
            newSegment = 'casual';
        }
        
        if (newSegment !== playerProfile.segment) {
            playerProfile.segment = newSegment;
            
            const gameTargets = this.systemRTPTargets.get(playerProfile.gameType);
            if (gameTargets && gameTargets.playerSegments[newSegment]) {
                const newTarget = gameTargets.playerSegments[newSegment];
                playerProfile.targetRTP = newTarget.targetRTP;
                
                const adaptationRate = 0.1;
                playerProfile.currentRTP = playerProfile.currentRTP * (1 - adaptationRate) + 
                    newTarget.targetRTP * adaptationRate;
            }
        }
    }

    updateAdaptiveFactors(playerProfile, stabilityAnalysis) {
        const factors = playerProfile.adaptiveFactors;
        
        if (stabilityAnalysis.stabilityScore < 0.5) {
            factors.volatilityWeight = Math.min(0.6, factors.volatilityWeight + 0.1);
        } else if (stabilityAnalysis.stabilityScore > 0.8) {
            factors.volatilityWeight = Math.max(0.2, factors.volatilityWeight - 0.05);
        }
        
        const convergenceRate = Math.abs(stabilityAnalysis.convergenceRate);
        if (convergenceRate < 0.01) {
            factors.gameBalanceWeight = Math.min(0.5, factors.gameBalanceWeight + 0.05);
        }
        
        if (stabilityAnalysis.shortTermVolatility > 0.05) {
            factors.temporalWeight = Math.max(0.1, factors.temporalWeight - 0.05);
        }
    }

    getPlayerRTPAnalysis(userId, gameType) {
        const profileKey = `${userId}_${gameType}`;
        
        if (!this.playerRTPProfiles.has(profileKey)) {
            return null;
        }
        
        const playerProfile = this.playerRTPProfiles.get(profileKey);
        const gameTargets = this.systemRTPTargets.get(gameType);
        
        return {
            userId,
            gameType,
            segment: playerProfile.segment,
            
            currentRTP: playerProfile.currentRTP,
            targetRTP: playerProfile.targetRTP,
            actualRTP: playerProfile.actualRTP,
            
            performanceMetrics: { ...playerProfile.performanceMetrics },
            stabilityAnalysis: { ...playerProfile.stabilityAnalysis },
            controlState: { ...playerProfile.controlState },
            
            rtpTrend: this.calculateRTPTrend(playerProfile.rtpHistory),
            predictedRTP: this.predictFutureRTP(playerProfile),
            
            recommendations: this.generateRTPRecommendations(playerProfile, gameTargets),
            
            lastUpdated: playerProfile.lastUpdated,
            confidence: playerProfile.controlState.confidence
        };
    }

    calculateRTPTrend(rtpHistory) {
        if (rtpHistory.length < 10) return 'INSUFFICIENT_DATA';
        
        const recent = rtpHistory.slice(-20);
        const older = rtpHistory.slice(-40, -20);
        
        if (older.length === 0) return 'STABLE';
        
        const recentAvg = recent.reduce((sum, rtp) => sum + rtp, 0) / recent.length;
        const olderAvg = older.reduce((sum, rtp) => sum + rtp, 0) / older.length;
        
        const trendRatio = recentAvg / olderAvg;
        
        if (trendRatio > 1.005) return 'INCREASING';
        if (trendRatio < 0.995) return 'DECREASING';
        return 'STABLE';
    }

    predictFutureRTP(playerProfile) {
        const history = playerProfile.rtpHistory;
        if (history.length < 20) return playerProfile.currentRTP;
        
        const recent = history.slice(-10);
        const trend = this.calculateLongTermTrend(recent);
        
        const momentum = playerProfile.controlState.momentum;
        const stabilityFactor = playerProfile.stabilityAnalysis.stabilityScore;
        
        const predictedChange = (trend * 5) + (momentum * 0.5);
        const stabilizedPrediction = predictedChange * stabilityFactor;
        
        const predictedRTP = playerProfile.currentRTP + stabilizedPrediction;
        
        const gameTargets = this.systemRTPTargets.get(playerProfile.gameType);
        if (gameTargets) {
            return Math.max(gameTargets.minRTP, 
                Math.min(gameTargets.maxRTP, predictedRTP));
        }
        
        return predictedRTP;
    }

    generateRTPRecommendations(playerProfile, gameTargets) {
        const recommendations = [];
        const analysis = playerProfile.stabilityAnalysis;
        const metrics = playerProfile.performanceMetrics;
        
        if (analysis.stabilityScore < 0.5) {
            recommendations.push('INCREASE_CONVERGENCE_DAMPING');
            recommendations.push('REDUCE_ADJUSTMENT_FREQUENCY');
        }
        
        if (analysis.shortTermVolatility > 0.08) {
            recommendations.push('APPLY_VOLATILITY_SMOOTHING');
            recommendations.push('INCREASE_TEMPORAL_WEIGHT');
        }
        
        if (Math.abs(playerProfile.actualRTP - playerProfile.targetRTP) > 0.03) {
            recommendations.push('ACCELERATE_RTP_CONVERGENCE');
            recommendations.push('REVIEW_SEGMENT_CLASSIFICATION');
        }
        
        if (metrics.variance > gameTargets.playerSegments[playerProfile.segment].variance * 2) {
            recommendations.push('IMPLEMENT_VARIANCE_CONTROL');
            recommendations.push('ADJUST_BEHAVIORAL_WEIGHTS');
        }
        
        if (playerProfile.controlState.confidence < 0.7) {
            recommendations.push('INCREASE_OBSERVATION_PERIOD');
            recommendations.push('REDUCE_ADJUSTMENT_MAGNITUDE');
        }
        
        return recommendations;
    }

    getSystemRTPOverview(gameType = null) {
        const overview = {
            timestamp: Date.now(),
            gameTypes: gameType ? [gameType] : Object.values(this.gameTypes),
            systemMetrics: {},
            playerDistribution: {},
            stabilityReport: {},
            recommendations: []
        };
        
        const gamesToAnalyze = gameType ? [gameType] : Object.values(this.gameTypes);
        
        for (const game of gamesToAnalyze) {
            const playerProfiles = Array.from(this.playerRTPProfiles.values())
                .filter(profile => profile.gameType === game);
            
            if (playerProfiles.length === 0) continue;
            
            overview.systemMetrics[game] = this.calculateSystemMetrics(playerProfiles);
            overview.playerDistribution[game] = this.calculatePlayerDistribution(playerProfiles);
            overview.stabilityReport[game] = this.calculateStabilityReport(playerProfiles);
        }
        
        overview.recommendations = this.generateSystemRecommendations(overview);
        
        return overview;
    }

    calculateSystemMetrics(playerProfiles) {
        const rtps = playerProfiles.map(p => p.currentRTP);
        const actualRTPs = playerProfiles.map(p => p.actualRTP);
        const stabilities = playerProfiles.map(p => p.stabilityAnalysis.stabilityScore);
        
        return {
            averageRTP: rtps.reduce((sum, rtp) => sum + rtp, 0) / rtps.length,
            averageActualRTP: actualRTPs.reduce((sum, rtp) => sum + rtp, 0) / actualRTPs.length,
            rtpStandardDeviation: this.calculateStandardDeviation(rtps),
            systemStability: stabilities.reduce((sum, s) => sum + s, 0) / stabilities.length,
            totalPlayers: playerProfiles.length,
            totalGames: playerProfiles.reduce((sum, p) => sum + p.performanceMetrics.totalGames, 0),
            totalWagered: playerProfiles.reduce((sum, p) => sum + p.performanceMetrics.totalWagered, 0)
        };
    }

    calculatePlayerDistribution(playerProfiles) {
        const distribution = {};
        
        playerProfiles.forEach(profile => {
            const segment = profile.segment;
            if (!distribution[segment]) {
                distribution[segment] = {
                    count: 0,
                    averageRTP: 0,
                    totalWagered: 0,
                    averageStability: 0
                };
            }
            
            distribution[segment].count++;
            distribution[segment].averageRTP += profile.currentRTP;
            distribution[segment].totalWagered += profile.performanceMetrics.totalWagered;
            distribution[segment].averageStability += profile.stabilityAnalysis.stabilityScore;
        });
        
        Object.keys(distribution).forEach(segment => {
            const data = distribution[segment];
            data.averageRTP /= data.count;
            data.averageStability /= data.count;
        });
        
        return distribution;
    }

    calculateStabilityReport(playerProfiles) {
        const unstablePlayers = playerProfiles.filter(p => p.stabilityAnalysis.stabilityScore < 0.6);
        const highVolatilityPlayers = playerProfiles.filter(p => 
            p.stabilityAnalysis.shortTermVolatility > 0.05);
        const convergenceIssues = playerProfiles.filter(p => 
            Math.abs(p.actualRTP - p.targetRTP) > 0.02);
        
        return {
            unstablePlayerCount: unstablePlayers.length,
            highVolatilityCount: highVolatilityPlayers.length,
            convergenceIssueCount: convergenceIssues.length,
            overallSystemStability: playerProfiles.reduce(
                (sum, p) => sum + p.stabilityAnalysis.stabilityScore, 0
            ) / playerProfiles.length,
            averageConvergenceError: playerProfiles.reduce(
                (sum, p) => sum + Math.abs(p.actualRTP - p.targetRTP), 0
            ) / playerProfiles.length
        };
    }

    calculateStandardDeviation(values) {
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
        const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
        return Math.sqrt(variance);
    }

    generateSystemRecommendations(overview) {
        const recommendations = [];
        
        Object.entries(overview.stabilityReport).forEach(([gameType, report]) => {
            if (report.overallSystemStability < 0.7) {
                recommendations.push(`IMPROVE_${gameType.toUpperCase()}_STABILITY`);
            }
            
            if (report.unstablePlayerCount > report.totalPlayers * 0.2) {
                recommendations.push(`REVIEW_${gameType.toUpperCase()}_CONTROL_PARAMETERS`);
            }
            
            if (report.averageConvergenceError > 0.02) {
                recommendations.push(`ACCELERATE_${gameType.toUpperCase()}_CONVERGENCE`);
            }
        });
        
        return recommendations;
    }
}

module.exports = DynamicRTPController;