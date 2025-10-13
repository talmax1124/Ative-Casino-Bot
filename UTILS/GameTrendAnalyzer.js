/**
 * GAME TREND ANALYZER - Nash Equilibrium Intelligence System
 * 
 * Implements Nash equilibrium theory to analyze player behavior patterns 
 * and dynamically adjust game mechanics to maintain optimal house edge.
 * 
 * Core Philosophy:
 * - Track ALL player choices across ALL games
 * - Identify behavioral patterns and exploitation attempts  
 * - Apply Nash equilibrium adjustments to prevent player advantage
 * - Gradually decrease win rates when patterns emerge (never increase)
 * - Maintain economic balance through intelligent trend analysis
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const { secureRandomFloat } = require('./rng');

class GameTrendAnalyzer {
    constructor() {
        this.trendData = new Map();
        this.playerBehaviorProfiles = new Map();
        this.gameAdjustments = new Map();
        this.nashEquilibriumState = new Map();
        this.patternCache = new Map(); // Cache for pattern analysis
        this.statisticalModels = new Map(); // Statistical models per game
        
        // Trend analysis configuration
        this.config = {
            // Data retention
            maxTrendHistory: 10000,      // Keep last 10k actions per game
            playerProfileExpiry: 30,     // Days to retain player profiles
            
            // Nash equilibrium parameters
            nashSensitivity: 0.01,       // How sensitive to trend changes (increased from 0.001)
            maxAdjustment: 0.15,         // Maximum 15% house edge increase (increased from 0.05)
            equilibriumThreshold: 0.55,  // When 55%+ players use same strategy (reduced from 0.7)
            
            // Adjustment decay
            adjustmentDecay: 0.98,       // Adjustments decay 2% per day
            minDecayInterval: 3600000,   // 1 hour minimum between decays
            
            // Pattern detection
            minSampleSize: 20,           // Minimum choices before analysis (reduced from 100)
            patternConfidence: 0.65,     // 65% confidence for pattern detection (reduced from 0.85)
            patternCacheExpiry: 300000,  // 5 minutes cache expiry
            maxCacheSize: 1000,          // Maximum pattern cache entries
            
            // Game-specific sensitivities
            gameSensitivities: {
                'roulette': 2.0,         // Higher sensitivity for choice-heavy games (increased)
                'blackjack': 1.5,        // Higher for skill-based games (increased)
                'slots': 1.2,            // Higher for random games (increased)
                'crash': 2.5,            // Higher for timing games (increased)
                'plinko': 1.5,           // Increased sensitivity
                'rps': 1.8,              // Increased sensitivity
                'duck': 1.6,             // Increased sensitivity
                'treasurevault': 1.8,    // Increased sensitivity
                'ceelo': 2.0,            // Added ceelo with high sensitivity
                'mines': 2.2             // High sensitivity for strategic grid games
            },

            // Fairness monitoring
            fairness: {
                defaultTargetEdge: 0.04,     // Aim for ~4% house edge across games
                tolerance: 0.01,             // Allow ±1% variance before adjusting
                recentWindow: 200,           // Use last 200 results for fairness calculations
                payoutBoostCap: 0.20,        // Maximum 20% payout boost for cold streaks
                positiveAdjustmentCap: 0.02, // Limit house edge increases to 2%
                targets: {
                    roulette: 0.027,
                    blackjack: 0.01,
                    crash: 0.02,
                    slots: 0.025,
                    plinko: 0.02,
                    mines: 0.05
                }
            }
        };
        
        // Initialize data structures
        this.initializeDataStructures();
        
        // Initialize statistical models Map
        if (!this.statisticalModels) {
            this.statisticalModels = new Map();
        }
        
        // Load existing trend data (async, fire-and-forget)
        this.loadExistingTrendData().catch(error => {
            logger.error(`Failed to load existing trend data: ${error.message}`);
        });
        
        // Start periodic analysis
        this.startPeriodicAnalysis();
        
        logger.info('🧠 GameTrendAnalyzer initialized with Nash equilibrium intelligence');
    }
    
    /**
     * Initialize data structures for trend tracking
     */
    initializeDataStructures() {
        // Game-specific trend structures
        this.gameStructures = {
            'roulette': {
                choices: ['red', 'black', 'green', 'odd', 'even', 'high', 'low', 'numbers'],
                patterns: new Map(),
                hotStreak: { type: null, count: 0, started: Date.now() },
                playerDistribution: new Map()
            },
            'blackjack': {
                choices: ['hit', 'stand', 'double', 'split', 'insurance'],
                cardCountingIndicators: new Map(),
                strategyDeviations: new Map(),
                winRateByChoice: new Map()
            },
            'crash': {
                cashoutPoints: [],
                averageCashout: 1.0,
                riskProfiles: new Map(),
                timeBasedPatterns: new Map()
            },
            'slots': {
                betPatterns: new Map(),
                stopPatterns: new Map(),
                progressiveBetting: new Map()
            },
            'matrix_slots': {
                betPatterns: new Map(),
                stopPatterns: new Map(),
                progressiveBetting: new Map()
            },
            'multi_slots': {
                betPatterns: new Map(),
                stopPatterns: new Map(),
                progressiveBetting: new Map()
            },
            'plinko': {
                dropPatterns: new Map(),
                riskChoices: new Map(),
                betProgression: new Map()
            },
            'poker': {
                handChoices: new Map(),
                bettingPatterns: new Map(),
                bluffIndicators: new Map()
            },
            'uno': {
                cardChoices: new Map(),
                colorPreferences: new Map(),
                strategyPatterns: new Map()
            },
            'war': {
                choices: ['play', 'surrender'],
                riskTolerance: new Map(),
                patterns: new Map()
            },
            'fishing': {
                choices: ['cast', 'wait', 'reel'],
                patiencePatterns: new Map(),
                locationChoices: new Map()
            },
            'keno': {
                numberChoices: new Map(),
                betSizePatterns: new Map(),
                riskStrategies: new Map()
            },
            'heist': {
                choices: ['join', 'start', 'abandon'],
                riskTolerance: new Map(),
                timingPatterns: new Map()
            },
            'bingo': {
                cardChoices: new Map(),
                patternPreferences: new Map(),
                playStyle: new Map()
            },
            'spades': {
                bidPatterns: new Map(),
                cardPlay: new Map(),
                partnership: new Map()
            },
            '31': {
                choices: ['hit', 'stand', 'knock'],
                riskPatterns: new Map(),
                cardStrategy: new Map()
            },
            'rps': {
                choices: ['rock', 'paper', 'scissors'],
                sequencePatterns: new Map(),
                antiPatterns: new Map()
            },
            'battleship': {
                attackPatterns: new Map(),
                placementStrategies: new Map(),
                huntingBehavior: new Map()
            },
            'wordchain': {
                wordChoices: new Map(),
                strategyPatterns: new Map(),
                difficultyPreference: new Map()
            },
            'yahtzee': {
                diceChoices: new Map(),
                scoringStrategy: new Map(),
                riskPatterns: new Map()
            },
            'lottery': {
                numberChoices: new Map(),
                ticketQuantity: new Map(),
                strategyPatterns: new Map()
            },
            'russianroulette': {
                choices: ['play', 'pass'],
                riskTolerance: new Map(),
                patterns: new Map()
            },
            'ceelo': {
                betPatterns: new Map(),
                riskChoices: new Map(),
                strategyPatterns: new Map()
            },
            'duck': {
                riskTaking: new Map(),
                cashoutTiming: new Map(),
                positionStrategies: new Map()
            },
            'duck_game': {
                riskTaking: new Map(),
                cashoutTiming: new Map(),
                positionStrategies: new Map()
            },
            'treasurevault': {
                doorChoices: new Map(),
                riskProgression: new Map(),
                roundStrategies: new Map()
            },
            'quiz': {
                choices: ['A', 'B', 'C', 'D'],
                answerPatterns: new Map(),
                accuracyRates: new Map(),
                responseTime: new Map()
            },
            'mines': {
                gridChoices: new Map(),
                riskProgression: new Map(),
                cashoutTiming: new Map(),
                minePatterns: new Map()
            }
        };
        
        // Initialize all structures
        for (const [gameType, structure] of Object.entries(this.gameStructures)) {
            this.trendData.set(gameType, {
                ...structure,
                totalChoices: 0,
                lastAnalysis: Date.now(),
                currentAdjustment: 0
            });
            
            this.nashEquilibriumState.set(gameType, {
                dominantStrategy: null,
                strategyDistribution: new Map(),
                equilibriumPoint: 0,
                lastShift: Date.now()
            });
            
            // Initialize statistical model for each game type
            this.statisticalModels.set(gameType, {
                mean: 0,
                variance: 0,
                standardDeviation: 0,
                confidenceIntervals: { lower: 0, upper: 0 },
                outliers: [],
                trend: 'neutral'
            });
        }
    }
    
    /**
     * Record a player choice/action in any game
     */
    async recordChoice(gameType, userId, choice, metadata = {}) {
        try {
            // Handle undefined/null gameType with better validation
            if (!gameType || gameType === 'undefined' || gameType === undefined || gameType === null || gameType === 'null') {
                logger.warn(`Invalid game type for trend analysis (gameType: ${gameType}, userId: ${userId}, choice: ${choice})`);
                return;
            }
            
            // Normalize gameType to prevent inconsistencies
            gameType = String(gameType).toLowerCase().trim();
            
            // Ensure all required Maps are initialized (defensive programming)
            if (!this.statisticalModels) {
                logger.warn('StatisticalModels not initialized, reinitializing...');
                this.statisticalModels = new Map();
            }
            
            if (!this.trendData.has(gameType)) {
                // Auto-initialize unknown game types with generic structure
                logger.info(`Auto-initializing trend analysis for new game type: "${gameType}"`);
                this.initializeGameType(gameType);
            }
            
            const gameData = this.trendData.get(gameType);
            const timestamp = Date.now();
            
            // Record the choice
            const choiceRecord = {
                userId,
                choice,
                timestamp,
                metadata: {
                    ...metadata,
                    betAmount: metadata.betAmount || 0,
                    gameResult: metadata.won || false
                }
            };
            
            // Add to game-specific tracking
            await this.recordGameSpecificChoice(gameType, choiceRecord);
            this.recordFairnessSample(gameType, choiceRecord);
            
            // Update player behavior profile
            await this.updatePlayerProfile(userId, gameType, choiceRecord);
            
            // Increment total choices
            gameData.totalChoices++;
            
            // Check if analysis should run
            if (this.shouldRunAnalysis(gameType)) {
                await this.analyzeGameTrends(gameType);
            }
            
            logger.debug(`Recorded choice for ${gameType}: ${userId} chose ${choice}`);
            
        } catch (error) {
            logger.error(`Error recording choice: ${error.message}`);
        }
    }
    
    /**
     * Record game-specific choice patterns
     */
    async recordGameSpecificChoice(gameType, choiceRecord) {
        const gameData = this.trendData.get(gameType);
        const { userId, choice, metadata } = choiceRecord;
        
        switch (gameType) {
            case 'roulette':
                await this.recordRouletteChoice(gameData, choiceRecord);
                break;
                
            case 'blackjack':
                await this.recordBlackjackChoice(gameData, choiceRecord);
                break;
                
            case 'crash':
                await this.recordCrashChoice(gameData, choiceRecord);
                break;
                
            case 'rps':
                await this.recordRPSChoice(gameData, choiceRecord);
                break;
                
            case 'duck':
            case 'duck_game':
                await this.recordDuckChoice(gameData, choiceRecord);
                break;
                
            case 'treasurevault':
                await this.recordTreasureChoice(gameData, choiceRecord);
                break;
                
            case 'quiz':
                await this.recordQuizChoice(gameData, choiceRecord);
                break;
                
            case 'mines':
                await this.recordMinesChoice(gameData, choiceRecord);
                break;
                
            default:
                // Generic choice recording
                if (!gameData.choices) gameData.choices = new Map();
                const count = gameData.choices.get(choice) || 0;
                gameData.choices.set(choice, count + 1);
        }
    }

    /**
     * Track recent outcomes for fairness analysis
     */
    recordFairnessSample(gameType, choiceRecord) {
        const gameData = this.trendData.get(gameType);
        if (!gameData) return;
        
        const { metadata } = choiceRecord;
        const bet = Number(metadata.betAmount || 0);
        if (!Number.isFinite(bet) || bet <= 0) {
            return;
        }

        const payout = Number(
            metadata.adjustedPayout ??
            metadata.payout ??
            metadata.originalPayout ??
            (metadata.gameResult || metadata.won ? metadata.betAmount : 0)
        );

        const won = Boolean(metadata.gameResult ?? metadata.won);
        const sample = {
            timestamp: Date.now(),
            userId: choiceRecord.userId,
            bet,
            payout: Math.max(0, payout),
            won,
            net: Math.max(0, payout) - bet
        };

        gameData.recentResults = gameData.recentResults || [];
        gameData.recentResults.push(sample);
        if (gameData.recentResults.length > this.config.fairness.recentWindow) {
            gameData.recentResults.shift();
        }

        const stats = gameData.fairnessStats || { totalBet: 0, totalPayout: 0, sampleSize: 0, winCount: 0 };
        stats.totalBet += bet;
        stats.totalPayout += Math.max(0, payout);
        stats.sampleSize += 1;
        if (won) stats.winCount += 1;
        gameData.fairnessStats = stats;
    }
    
    /**
     * Record roulette-specific patterns
     */
    async recordRouletteChoice(gameData, { userId, choice, metadata }) {
        // Track color betting patterns
        if (['red', 'black'].includes(choice)) {
            if (!gameData.playerDistribution.has(choice)) {
                gameData.playerDistribution.set(choice, new Set());
            }
            gameData.playerDistribution.get(choice).add(userId);
            
            // Update hot streak tracking
            if (gameData.hotStreak.type === choice) {
                gameData.hotStreak.count++;
            } else {
                gameData.hotStreak = { type: choice, count: 1, started: Date.now() };
            }
        }
        
        // Track betting progression patterns
        if (!gameData.patterns.has(userId)) {
            gameData.patterns.set(userId, []);
        }
        const userPattern = gameData.patterns.get(userId);
        userPattern.push({ choice, betAmount: metadata.betAmount, timestamp: Date.now() });
        
        // Keep only recent history per user
        if (userPattern.length > 50) {
            userPattern.splice(0, userPattern.length - 50);
        }
    }
    
    /**
     * Record blackjack-specific patterns
     */
    async recordBlackjackChoice(gameData, { userId, choice, metadata }) {
        // Track strategy deviations
        const situation = `${metadata.playerValue || 0}_${metadata.dealerUp || 0}`;
        if (!gameData.strategyDeviations.has(situation)) {
            gameData.strategyDeviations.set(situation, new Map());
        }
        
        const situationChoices = gameData.strategyDeviations.get(situation);
        const count = situationChoices.get(choice) || 0;
        situationChoices.set(choice, count + 1);
        
        // Track win rates by choice
        if (!gameData.winRateByChoice.has(choice)) {
            gameData.winRateByChoice.set(choice, { wins: 0, total: 0 });
        }
        const winData = gameData.winRateByChoice.get(choice);
        winData.total++;
        if (metadata.won) winData.wins++;
    }
    
    /**
     * Record crash-specific patterns
     */
    async recordCrashChoice(gameData, { userId, choice, metadata }) {
        if (choice === 'cashout' && metadata.multiplier) {
            gameData.cashoutPoints.push({
                userId,
                multiplier: metadata.multiplier,
                timestamp: Date.now(),
                betAmount: metadata.betAmount
            });
            
            // Keep only recent cashouts
            if (gameData.cashoutPoints.length > this.config.maxTrendHistory) {
                gameData.cashoutPoints.splice(0, 1000);
            }
            
            // Update average
            const recent = gameData.cashoutPoints.slice(-100);
            gameData.averageCashout = recent.reduce((sum, c) => sum + c.multiplier, 0) / recent.length;
        }
    }
    
    /**
     * Record RPS patterns
     */
    async recordRPSChoice(gameData, { userId, choice, metadata }) {
        if (!gameData.sequencePatterns.has(userId)) {
            gameData.sequencePatterns.set(userId, []);
        }
        
        const userSequence = gameData.sequencePatterns.get(userId);
        userSequence.push(choice);
        
        // Keep only recent sequence
        if (userSequence.length > 20) {
            userSequence.splice(0, 1);
        }
        
        // Analyze for patterns
        if (userSequence.length >= 5) {
            const pattern = this.detectRPSPattern(userSequence);
            if (pattern.confidence > 0.7) {
                gameData.antiPatterns.set(userId, pattern);
            }
        }
    }
    
    /**
     * Record duck game patterns
     */
    async recordDuckChoice(gameData, { userId, choice, metadata }) {
        if (choice === 'move' && metadata.position !== undefined) {
            if (!gameData.riskTaking.has(userId)) {
                gameData.riskTaking.set(userId, []);
            }
            
            const riskProfile = gameData.riskTaking.get(userId);
            riskProfile.push({
                position: metadata.position,
                risk: metadata.position / (metadata.maxLanes || 7),
                timestamp: Date.now()
            });
            
            if (riskProfile.length > 30) {
                riskProfile.splice(0, 1);
            }
        }
    }
    
    /**
     * Record treasure vault patterns
     */
    async recordTreasureChoice(gameData, { userId, choice, metadata }) {
        if (choice.startsWith('door_') && metadata.round) {
            const roundChoices = gameData.roundStrategies.get(metadata.round) || new Map();
            const doorNum = choice.split('_')[1];
            const count = roundChoices.get(doorNum) || 0;
            roundChoices.set(doorNum, count + 1);
            gameData.roundStrategies.set(metadata.round, roundChoices);
        }
    }
    
    /**
     * Record mines game patterns
     */
    async recordMinesChoice(gameData, { userId, choice, metadata }) {
        // Track grid click patterns and risk progression
        if (choice === 'reveal' && metadata.position !== undefined) {
            // Track grid position choices
            const position = `${metadata.row || 0}_${metadata.col || 0}`;
            const positionCount = gameData.gridChoices.get(position) || 0;
            gameData.gridChoices.set(position, positionCount + 1);
            
            // Track risk progression patterns
            if (!gameData.riskProgression.has(userId)) {
                gameData.riskProgression.set(userId, []);
            }
            
            const userRisk = gameData.riskProgression.get(userId);
            userRisk.push({
                position: metadata.position,
                round: metadata.round || 1,
                minesFound: metadata.minesFound || 0,
                timestamp: Date.now()
            });
            
            // Keep only recent progression
            if (userRisk.length > 50) {
                userRisk.splice(0, 1);
            }
        }
        
        // Track cashout timing patterns
        if (choice === 'cashout' && metadata.multiplier) {
            const cashoutData = gameData.cashoutTiming.get(userId) || [];
            cashoutData.push({
                multiplier: metadata.multiplier,
                revealedCells: metadata.revealedCells || 0,
                minesAvailable: metadata.minesAvailable || 0,
                timestamp: Date.now()
            });
            
            // Keep only recent cashouts
            if (cashoutData.length > 30) {
                cashoutData.splice(0, 1);
            }
            gameData.cashoutTiming.set(userId, cashoutData);
        }
        
        // Track mine patterns for analysis
        if (metadata.gameResult && metadata.totalMines) {
            const patternKey = `${metadata.totalMines}_mines`;
            const patterns = gameData.minePatterns.get(patternKey) || [];
            patterns.push({
                won: metadata.won || false,
                revealedCells: metadata.revealedCells || 0,
                multiplier: metadata.multiplier || 0,
                timestamp: Date.now()
            });
            
            // Keep only recent patterns per mine count
            if (patterns.length > 100) {
                patterns.splice(0, 10);
            }
            gameData.minePatterns.set(patternKey, patterns);
        }
    }
    
    /**
     * Record quiz patterns
     */
    async recordQuizChoice(gameData, { userId, choice, metadata }) {
        // Track answer patterns (A, B, C, D)
        if (!gameData.answerPatterns.has(userId)) {
            gameData.answerPatterns.set(userId, []);
        }
        
        const userPatterns = gameData.answerPatterns.get(userId);
        userPatterns.push({
            choice,
            questionIndex: metadata.questionIndex || 0,
            phase: metadata.phase || 'unknown',
            timestamp: Date.now(),
            correct: metadata.correct || false
        });
        
        // Keep only last 50 responses per user
        if (userPatterns.length > 50) {
            userPatterns.splice(0, 1);
        }
        
        // Track accuracy rates
        if (metadata.correct !== undefined) {
            if (!gameData.accuracyRates.has(userId)) {
                gameData.accuracyRates.set(userId, { correct: 0, total: 0 });
            }
            
            const accuracy = gameData.accuracyRates.get(userId);
            accuracy.total++;
            if (metadata.correct) {
                accuracy.correct++;
            }
        }
        
        // Track response time if provided
        if (metadata.responseTime) {
            if (!gameData.responseTime.has(userId)) {
                gameData.responseTime.set(userId, []);
            }
            
            const responseTimes = gameData.responseTime.get(userId);
            responseTimes.push(metadata.responseTime);
            
            // Keep only last 30 response times
            if (responseTimes.length > 30) {
                responseTimes.splice(0, 1);
            }
        }
    }
    
    /**
     * Detect RPS playing patterns
     */
    detectRPSPattern(sequence) {
        const patterns = {
            'alternating': 0,
            'repeating': 0,
            'predictable': 0
        };
        
        // Check for alternating pattern
        let alternatingScore = 0;
        for (let i = 2; i < sequence.length; i++) {
            if (sequence[i] === sequence[i-2] && sequence[i] !== sequence[i-1]) {
                alternatingScore++;
            }
        }
        patterns.alternating = alternatingScore / (sequence.length - 2);
        
        // Check for repeating pattern
        const counts = {};
        sequence.forEach(choice => counts[choice] = (counts[choice] || 0) + 1);
        const dominant = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
        patterns.repeating = counts[dominant] / sequence.length;
        
        // Overall predictability
        patterns.predictable = Math.max(patterns.alternating, patterns.repeating);
        
        return {
            type: patterns.repeating > patterns.alternating ? 'repeating' : 'alternating',
            confidence: patterns.predictable,
            dominantChoice: dominant
        };
    }
    
    /**
     * Update player behavior profile
     */
    async updatePlayerProfile(userId, gameType, choiceRecord) {
        if (!this.playerBehaviorProfiles.has(userId)) {
            this.playerBehaviorProfiles.set(userId, {
                games: new Map(),
                overallRisk: 0.5,
                patterns: new Map(),
                lastActivity: Date.now()
            });
        }
        
        const profile = this.playerBehaviorProfiles.get(userId);
        
        if (!profile.games.has(gameType)) {
            profile.games.set(gameType, {
                choices: [],
                winRate: 0,
                averageBet: 0,
                riskProfile: 0.5,
                sessions: 0
            });
        }
        
        const gameProfile = profile.games.get(gameType);
        gameProfile.choices.push(choiceRecord);
        gameProfile.sessions++;
        
        // Keep only recent choices with sliding window
        const maxChoices = 200; // Increased for better pattern detection
        if (gameProfile.choices.length > maxChoices) {
            // Keep most recent 75% when pruning
            const keepCount = Math.floor(maxChoices * 0.75);
            gameProfile.choices = gameProfile.choices.slice(-keepCount);
        }
        
        // Update metrics
        this.updatePlayerMetrics(gameProfile);
        profile.lastActivity = Date.now();
    }
    
    /**
     * Update player metrics from choice history
     */
    updatePlayerMetrics(gameProfile) {
        const choices = gameProfile.choices;
        if (choices.length === 0) return;
        
        // Calculate win rate
        const wins = choices.filter(c => c.metadata.gameResult).length;
        gameProfile.winRate = wins / choices.length;
        
        // Calculate average bet
        const totalBets = choices.reduce((sum, c) => sum + (c.metadata.betAmount || 0), 0);
        gameProfile.averageBet = totalBets / choices.length;
        
        // Calculate risk profile (higher bets = higher risk)
        const maxBet = Math.max(...choices.map(c => c.metadata.betAmount || 0));
        gameProfile.riskProfile = maxBet > 0 ? gameProfile.averageBet / maxBet : 0.5;
    }
    
    /**
     * Check if trend analysis should run
     */
    shouldRunAnalysis(gameType) {
        const gameData = this.trendData.get(gameType);
        const timeSinceLastAnalysis = Date.now() - gameData.lastAnalysis;
        
        return (
            gameData.totalChoices >= this.config.minSampleSize &&
            (gameData.totalChoices % 50 === 0 || timeSinceLastAnalysis > 3600000) // Every 50 choices or 1 hour
        );
    }
    
    /**
     * Analyze game trends and apply Nash equilibrium adjustments
     */
    async analyzeGameTrends(gameType) {
        try {
            logger.info(`🧠 Analyzing trends for ${gameType}...`);
            
            const gameData = this.trendData.get(gameType);
            const nashState = this.nashEquilibriumState.get(gameType);
            
            // Perform game-specific trend analysis
            const trendAnalysis = await this.performGameAnalysis(gameType, gameData);
            
            // Calculate Nash equilibrium adjustments
            const adjustment = this.calculateNashAdjustment(gameType, trendAnalysis);
            
            // Apply adjustment if significant
            if (Math.abs(adjustment) > this.config.nashSensitivity) {
                await this.applyTrendAdjustment(gameType, adjustment, trendAnalysis);
            }
            
            // Update analysis timestamp
            gameData.lastAnalysis = Date.now();
            
            // Save trend data
            await this.saveTrendData(gameType);
            
            logger.info(`🎯 Trend analysis completed for ${gameType} - Adjustment: ${(adjustment * 100).toFixed(3)}%`);
            
        } catch (error) {
            logger.error(`Error analyzing trends for ${gameType}: ${error.message}`);
        }
    }
    
    /**
     * Perform game-specific trend analysis
     */
    async performGameAnalysis(gameType, gameData) {
        let primaryAnalysis;
        
        switch (gameType) {
            case 'roulette':
                primaryAnalysis = this.analyzeRouletteTrends(gameData);
                break;
            case 'blackjack':
                primaryAnalysis = this.analyzeBlackjackTrends(gameData);
                break;
            case 'crash':
                primaryAnalysis = this.analyzeCrashTrends(gameData);
                break;
            case 'rps':
                primaryAnalysis = this.analyzeRPSTrends(gameData);
                break;
            case 'mines':
                primaryAnalysis = this.analyzeMinesTrends(gameData);
                break;
            default:
                primaryAnalysis = this.analyzeGenericTrends(gameData);
        }
        
        // Always check for big win patterns regardless of game type
        const bigWinAnalysis = this.analyzeBigWinPatterns(gameData);
        
        // Combine analyses - use the higher exploitation value
        if (bigWinAnalysis.exploitation > primaryAnalysis.exploitation) {
            logger.warn(`🎯 Big win analysis shows higher exploitation (${(bigWinAnalysis.exploitation * 100).toFixed(1)}%) than primary analysis (${(primaryAnalysis.exploitation * 100).toFixed(1)}%)`);
            return {
                ...bigWinAnalysis,
                primaryPattern: primaryAnalysis.pattern,
                combinedAnalysis: true
            };
        }
        
        return primaryAnalysis;
    }
    
    /**
     * Analyze roulette betting trends
     */
    analyzeRouletteTrends(gameData) {
        const redPlayers = gameData.playerDistribution.get('red')?.size || 0;
        const blackPlayers = gameData.playerDistribution.get('black')?.size || 0;
        const totalPlayers = redPlayers + blackPlayers;
        
        if (totalPlayers < 10) {
            return { exploitation: 0, dominantStrategy: null, confidence: 0 };
        }
        
        const redPercentage = redPlayers / totalPlayers;
        const blackPercentage = blackPlayers / totalPlayers;
        
        // Check for color bias exploitation
        const colorBias = Math.max(redPercentage, blackPercentage);
        const exploitation = colorBias > this.config.equilibriumThreshold ? colorBias - 0.5 : 0;
        
        return {
            exploitation,
            dominantStrategy: redPercentage > blackPercentage ? 'red' : 'black',
            confidence: Math.abs(redPercentage - blackPercentage),
            hotStreak: gameData.hotStreak,
            pattern: 'color_bias'
        };
    }
    
    /**
     * Analyze blackjack strategy trends
     */
    analyzeBlackjackTrends(gameData) {
        const strategyDeviations = [];
        
        for (const [situation, choices] of gameData.strategyDeviations) {
            const total = Array.from(choices.values()).reduce((sum, count) => sum + count, 0);
            const dominant = Array.from(choices.entries()).reduce((max, [choice, count]) => 
                count > max.count ? { choice, count } : max, { choice: null, count: 0 });
            
            if (total >= 20) { // Sufficient sample size
                const dominance = dominant.count / total;
                if (dominance > 0.8) { // Very predictable
                    strategyDeviations.push({
                        situation,
                        dominantChoice: dominant.choice,
                        predictability: dominance
                    });
                }
            }
        }
        
        const avgExploitation = strategyDeviations.length > 0 ? 
            strategyDeviations.reduce((sum, dev) => sum + dev.predictability, 0) / strategyDeviations.length - 0.5 : 0;
        
        return {
            exploitation: Math.max(0, avgExploitation),
            dominantStrategy: strategyDeviations.length > 0 ? 'predictable_play' : null,
            confidence: strategyDeviations.length / 10, // Confidence based on number of predictable situations
            deviations: strategyDeviations,
            pattern: 'strategy_predictability'
        };
    }
    
    /**
     * Analyze crash game trends
     */
    analyzeCrashTrends(gameData) {
        if (gameData.cashoutPoints.length < 50) {
            return { exploitation: 0, dominantStrategy: null, confidence: 0 };
        }
        
        const recent = gameData.cashoutPoints.slice(-100);
        const avgCashout = recent.reduce((sum, c) => sum + c.multiplier, 0) / recent.length;
        
        // Check for clustering around certain multipliers
        const clusters = this.findCashoutClusters(recent);
        const largestCluster = clusters.reduce((max, cluster) => 
            cluster.density > max.density ? cluster : max, { density: 0, multiplier: 0 });
        
        const exploitation = largestCluster.density > 0.3 ? largestCluster.density - 0.2 : 0;
        
        return {
            exploitation,
            dominantStrategy: largestCluster.density > 0.3 ? `cashout_${largestCluster.multiplier.toFixed(2)}` : null,
            confidence: largestCluster.density,
            averageCashout: avgCashout,
            pattern: 'cashout_clustering'
        };
    }
    
    /**
     * Find clustering in cashout points
     */
    findCashoutClusters(cashouts) {
        const buckets = new Map();
        
        // Group into 0.1x buckets
        cashouts.forEach(c => {
            const bucket = Math.floor(c.multiplier * 10) / 10;
            buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
        });
        
        // Find clusters
        const clusters = [];
        for (const [multiplier, count] of buckets) {
            clusters.push({
                multiplier,
                count,
                density: count / cashouts.length
            });
        }
        
        return clusters.sort((a, b) => b.density - a.density);
    }
    
    /**
     * Analyze RPS trends
     */
    analyzeRPSTrends(gameData) {
        const patterns = Array.from(gameData.antiPatterns.values());
        const predictablePlayers = patterns.filter(p => p.confidence > 0.7).length;
        const totalPatterns = patterns.length;
        
        if (totalPatterns < 5) {
            return { exploitation: 0, dominantStrategy: null, confidence: 0 };
        }
        
        const predictabilityRate = predictablePlayers / totalPatterns;
        const exploitation = predictabilityRate > 0.5 ? predictabilityRate - 0.5 : 0;
        
        return {
            exploitation,
            dominantStrategy: predictabilityRate > 0.5 ? 'pattern_based' : null,
            confidence: predictabilityRate,
            predictablePlayers,
            pattern: 'behavioral_predictability'
        };
    }
    
    /**
     * Analyze mines game trends
     */
    analyzeMinesTrends(gameData) {
        // Analyze grid position preferences
        const totalGridClicks = Array.from(gameData.gridChoices.values()).reduce((sum, count) => sum + count, 0);
        if (totalGridClicks < 20) {
            return { exploitation: 0, dominantStrategy: null, confidence: 0 };
        }
        
        // Check for position bias
        const dominantPosition = Array.from(gameData.gridChoices.entries())
            .reduce((max, [pos, count]) => count > max.count ? { pos, count } : max, { pos: null, count: 0 });
        
        const positionBias = dominantPosition.count / totalGridClicks;
        
        // Analyze cashout timing patterns
        let cashoutExploitation = 0;
        const allCashouts = Array.from(gameData.cashoutTiming.values()).flat();
        if (allCashouts.length >= 10) {
            // Check for clustering around safe multipliers
            const safeMultipliers = allCashouts.filter(c => c.multiplier <= 2).length;
            const safeCashoutRate = safeMultipliers / allCashouts.length;
            
            // High safe cashout rate indicates predictable behavior
            if (safeCashoutRate > 0.8) {
                cashoutExploitation = safeCashoutRate - 0.5;
            }
        }
        
        // Analyze mine count patterns
        let minePatternExploitation = 0;
        for (const [mineCount, patterns] of gameData.minePatterns) {
            if (patterns.length >= 20) {
                const winRate = patterns.filter(p => p.won).length / patterns.length;
                // If win rate is too high for given mine count, indicates exploitation
                const expectedWinRate = this.getExpectedMinesWinRate(mineCount);
                if (winRate > expectedWinRate + 0.1) {
                    minePatternExploitation = Math.max(minePatternExploitation, winRate - expectedWinRate);
                }
            }
        }
        
        // Combine exploitations
        const overallExploitation = Math.max(
            positionBias > 0.3 ? positionBias - 0.2 : 0,
            cashoutExploitation,
            minePatternExploitation
        );
        
        let dominantStrategy = null;
        if (positionBias > 0.3) {
            dominantStrategy = `position_bias_${dominantPosition.pos}`;
        } else if (cashoutExploitation > 0) {
            dominantStrategy = 'safe_cashout_bias';
        } else if (minePatternExploitation > 0) {
            dominantStrategy = 'mine_pattern_exploitation';
        }
        
        return {
            exploitation: overallExploitation,
            dominantStrategy,
            confidence: Math.min(1, overallExploitation * 2),
            positionBias,
            cashoutPatterns: allCashouts.length,
            pattern: 'mines_behavioral_analysis'
        };
    }
    
    /**
     * Get expected win rate for given mine configuration
     */
    getExpectedMinesWinRate(mineCountStr) {
        const mineCount = parseInt(mineCountStr.split('_')[0]);
        // Simplified expected win rates based on mine count
        // These would be calculated based on actual game mechanics
        const expectedRates = {
            1: 0.85,  // 1 mine
            3: 0.65,  // 3 mines  
            5: 0.45,  // 5 mines
            10: 0.25, // 10 mines
            24: 0.05  // 24 mines
        };
        return expectedRates[mineCount] || 0.5;
    }
    
    /**
     * Analyze generic game trends
     */
    analyzeGenericTrends(gameData) {
        if (!gameData.choices || gameData.choices.size === 0) {
            return { exploitation: 0, dominantStrategy: null, confidence: 0 };
        }
        
        const total = Array.from(gameData.choices.values()).reduce((sum, count) => sum + count, 0);
        const dominant = Array.from(gameData.choices.entries()).reduce((max, [choice, count]) => 
            count > max.count ? { choice, count } : max, { choice: null, count: 0 });
        
        const dominance = dominant.count / total;
        const exploitation = dominance > this.config.equilibriumThreshold ? dominance - 0.5 : 0;
        
        return {
            exploitation,
            dominantStrategy: dominance > this.config.equilibriumThreshold ? dominant.choice : null,
            confidence: dominance,
            pattern: 'choice_dominance'
        };
    }
    
    /**
     * Calculate Nash equilibrium adjustment
     */
    calculateNashAdjustment(gameType, trendAnalysis) {
        const fairness = this.calculateFairnessAdjustment(gameType);
        let adjustment = fairness.adjustment || 0;
        
        // If a dominant strategy is detected with high confidence, allow a light corrective adjustment
        const { exploitation, confidence } = trendAnalysis;
        if (exploitation > 0 && confidence >= 0.7) {
            const baseAdjustment = exploitation * this.config.nashSensitivity * confidence;
            const sensitivity = this.config.gameSensitivities[gameType] || 1.0;
            const cappedAdjustment = Math.min(
                this.config.fairness.positiveAdjustmentCap,
                baseAdjustment * sensitivity
            );
            adjustment += cappedAdjustment;
        }
        
        // Clamp within global bounds
        adjustment = Math.max(-this.config.maxAdjustment, Math.min(this.config.maxAdjustment, adjustment));
        return adjustment;
    }

    /**
     * Calculate fairness-oriented adjustment based on recent outcomes
     */
    calculateFairnessAdjustment(gameType) {
        const gameData = this.trendData.get(gameType);
        const windowSize = this.config.fairness.recentWindow;
        
        if (!gameData || !Array.isArray(gameData.recentResults) || gameData.recentResults.length < 10) {
            const fallback = gameData?.lastFairness || { adjustment: 0, payoutBoost: 0, stats: null, direction: 'neutral', computedAt: Date.now() };
            gameData && (gameData.lastFairness = fallback);
            return fallback;
        }
        
        const recent = gameData.recentResults.slice(-windowSize);
        const totalBet = recent.reduce((sum, r) => sum + (r.bet || 0), 0);
        const totalPayout = recent.reduce((sum, r) => sum + (r.payout || 0), 0);
        const winCount = recent.filter(r => r.won).length;
        const sampleSize = recent.length;
        
        if (totalBet <= 0) {
            const fallback = { adjustment: 0, payoutBoost: 0, stats: null, direction: 'neutral', computedAt: Date.now() };
            gameData.lastFairness = fallback;
            return fallback;
        }
        
        const actualEdge = (totalBet - totalPayout) / totalBet;
        const targetEdge = (this.config.fairness.targets && this.config.fairness.targets[gameType]) || this.config.fairness.defaultTargetEdge;
        const tolerance = this.config.fairness.tolerance;
        
        let adjustment = 0;
        let payoutBoost = 0;
        let direction = 'neutral';
        
        if (actualEdge > targetEdge + tolerance) {
            // Players are losing more than intended - reduce house edge and offer payout boosts
            const excess = actualEdge - targetEdge;
            adjustment = -Math.min(this.config.maxAdjustment, excess);
            payoutBoost = Math.min(this.config.fairness.payoutBoostCap, excess * 2.5);
            direction = 'player_support';
        } else if (actualEdge < targetEdge - tolerance) {
            // Casino is losing more than expected - allow a gentle recovery
            const deficit = targetEdge - actualEdge;
            adjustment = Math.min(this.config.fairness.positiveAdjustmentCap, deficit);
            direction = 'house_recovery';
        }
        
        const stats = {
            targetEdge,
            actualEdge,
            totalBet,
            totalPayout,
            winRate: sampleSize > 0 ? winCount / sampleSize : 0,
            sampleSize
        };
        
        const result = { adjustment, payoutBoost, stats, direction, computedAt: Date.now() };
        gameData.lastFairness = result;
        return result;
    }
    
    /**
     * Apply trend-based adjustment to game
     */
    async applyTrendAdjustment(gameType, adjustment, trendAnalysis) {
        const gameData = this.trendData.get(gameType);
        const currentAdjustment = gameData.currentAdjustment || 0;
        const fairness = gameData.lastFairness || this.calculateFairnessAdjustment(gameType);

        // Calculate new total adjustment within symmetric bounds
        const newAdjustment = Math.max(
            -this.config.maxAdjustment,
            Math.min(this.config.maxAdjustment, currentAdjustment + adjustment)
        );

        gameData.currentAdjustment = newAdjustment;
        this.gameAdjustments.set(gameType, {
            houseEdgeAdjustment: newAdjustment,
            payoutBoost: fairness.payoutBoost || 0,
            reason: trendAnalysis.pattern,
            confidence: trendAnalysis.confidence,
            dominantStrategy: trendAnalysis.dominantStrategy,
            fairnessDirection: fairness.direction,
            fairnessStats: fairness.stats,
            appliedAt: Date.now(),
            decayRate: this.config.adjustmentDecay
        });

        const adjustmentPercent = (adjustment * 100).toFixed(3);
        const totalPercent = (newAdjustment * 100).toFixed(3);
        const fairnessPercent = ((fairness.adjustment || 0) * 100).toFixed(3);

        if (Math.abs(adjustment) > 0.001 || Math.abs(fairness.adjustment || 0) > 0.001) {
            const directionEmoji = fairness.direction === 'player_support' ? '🤝' : fairness.direction === 'house_recovery' ? '🏦' : '⚖️';
            logger.warn(`${directionEmoji} Fairness adjustment for ${gameType}: ${adjustmentPercent}% (total ${totalPercent}%)`);
            if (fairness.payoutBoost) {
                logger.warn(`   Payout boost active: ${(fairness.payoutBoost * 100).toFixed(1)}% for cold streak relief`);
            }
            if (trendAnalysis.pattern) {
                logger.warn(`   Trend pattern: ${trendAnalysis.pattern} (${(trendAnalysis.confidence * 100).toFixed(1)}% confidence)`);
            }
            logger.warn(`   Fairness component: ${fairnessPercent}% | Direction: ${fairness.direction}`);

            // Notify monitoring if significant
            if (Math.abs(adjustment) > 0.01 || Math.abs(fairness.adjustment || 0) > 0.01) {
                this.sendAdjustmentAlert(gameType, adjustment, trendAnalysis, newAdjustment);
            }
        }
    }
    
    /**
     * Get current trend adjustment for a game
     */
    getTrendAdjustment(gameType) {
        const adjustment = this.gameAdjustments.get(gameType);
        if (!adjustment) return 0;
        
        // Apply decay
        const age = Date.now() - adjustment.appliedAt;
        const decayFactor = Math.pow(adjustment.decayRate, age / 86400000); // Decay per day
        
        return adjustment.houseEdgeAdjustment * decayFactor;
    }

    /**
     * Retrieve fairness-focused adjustment details
     */
    getFairnessAdjustment(gameType, userId = null) {
        const gameData = this.trendData.get(gameType);
        if (!gameData) {
            return {
                payoutBoost: 0,
                houseEdgeOffset: 0,
                stats: null,
                direction: 'neutral'
            };
        }

        const fairness = this.calculateFairnessAdjustment(gameType);
        let payoutBoost = fairness.payoutBoost || 0;

        if (userId && Array.isArray(gameData.recentResults)) {
            let lossCount = 0;
            let lossAmount = 0;
            const recent = [...gameData.recentResults].reverse();

            for (const result of recent) {
                if (result.userId !== userId) {
                    continue;
                }

                if (result.won) {
                    break; // streak ended
                }

                lossCount += 1;
                lossAmount += Math.abs(result.net);

                if (lossCount >= 10) {
                    break;
                }
            }

            if (lossCount > 0) {
                const streakBoost = Math.min(
                    this.config.fairness.payoutBoostCap,
                    (lossCount * 0.02) + (lossAmount / 250000) // scale by losses
                );
                payoutBoost = Math.min(this.config.fairness.payoutBoostCap, payoutBoost + streakBoost);
            }
        }

        return {
            payoutBoost,
            houseEdgeOffset: fairness.adjustment || 0,
            stats: fairness.stats,
            direction: fairness.direction
        };
    }
    
    /**
     * Start periodic analysis and maintenance
     */
    startPeriodicAnalysis() {
        // Run analysis every 30 minutes
        setInterval(async () => {
            try {
                await this.performPeriodicMaintenance();
            } catch (error) {
                logger.error(`Error in periodic trend analysis: ${error.message}`);
            }
        }, 30 * 60 * 1000);
        
        // Run decay every hour
        setInterval(async () => {
            try {
                await this.decayAdjustments();
            } catch (error) {
                logger.error(`Error in adjustment decay: ${error.message}`);
            }
        }, 60 * 60 * 1000);
    }
    
    /**
     * Perform periodic maintenance
     */
    async performPeriodicMaintenance() {
        // Clean old player profiles
        this.cleanOldPlayerProfiles();
        
        // Save all trend data
        await this.saveAllTrendData();
        
        // Run analysis for games with sufficient data
        for (const [gameType, gameData] of this.trendData) {
            if (gameData.totalChoices >= this.config.minSampleSize) {
                await this.analyzeGameTrends(gameType);
            }
        }
        
        logger.debug('🔄 Periodic trend analysis maintenance completed');
    }
    
    /**
     * Decay adjustments over time
     */
    async decayAdjustments() {
        for (const [gameType, adjustment] of this.gameAdjustments) {
            const newAdjustment = adjustment.houseEdgeAdjustment * adjustment.decayRate;
            const newPayoutBoost = (adjustment.payoutBoost || 0) * adjustment.decayRate;
            
            if (Math.abs(newAdjustment) < 0.0001 && newPayoutBoost < 0.0001) {
                this.gameAdjustments.delete(gameType);
                logger.debug(`Removed decayed adjustment for ${gameType}`);
            } else {
                adjustment.houseEdgeAdjustment = newAdjustment;
                adjustment.payoutBoost = newPayoutBoost;
            }
        }
    }
    
    /**
     * Clean old player profiles
     */
    cleanOldPlayerProfiles() {
        const cutoff = Date.now() - (this.config.playerProfileExpiry * 24 * 60 * 60 * 1000);
        
        for (const [userId, profile] of this.playerBehaviorProfiles) {
            if (profile.lastActivity < cutoff) {
                this.playerBehaviorProfiles.delete(userId);
            }
        }
    }
    
    /**
     * Load existing trend data from disk on startup
     */
    async loadExistingTrendData() {
        try {
            const dataDir = path.join(__dirname, '..', 'TREND_DATA');
            
            // Check if data directory exists
            try {
                await fs.access(dataDir);
            } catch {
                logger.info('🧠 No existing trend data found, starting fresh');
                return;
            }
            
            // Load trend data for each game type
            for (const gameType of Object.keys(this.gameStructures)) {
                await this.loadTrendDataForGame(gameType);
            }
            
            logger.info('🧠 Existing trend data loaded successfully');
            
        } catch (error) {
            logger.error(`Error loading existing trend data: ${error.message}`);
        }
    }
    
    /**
     * Load trend data for specific game type
     */
    async loadTrendDataForGame(gameType) {
        try {
            const dataDir = path.join(__dirname, '..', 'TREND_DATA');
            const filePath = path.join(dataDir, `${gameType}_trends.json`);
            
            try {
                const data = await fs.readFile(filePath, 'utf8');
                const savedData = JSON.parse(data);
                
                // Restore basic data
                const gameData = this.trendData.get(gameType);
                if (gameData && savedData) {
                    gameData.totalChoices = savedData.totalChoices || 0;
                    gameData.lastAnalysis = savedData.lastAnalysis || Date.now();
                    gameData.currentAdjustment = savedData.currentAdjustment || 0;
                    
                    // Restore game adjustments if they exist
                    if (savedData.currentAdjustment > 0) {
                        this.gameAdjustments.set(gameType, {
                            houseEdgeAdjustment: savedData.currentAdjustment,
                            reason: savedData.reason || 'loaded_from_persistence',
                            confidence: savedData.confidence || 0.5,
                            dominantStrategy: savedData.dominantStrategy || null,
                            appliedAt: savedData.lastAnalysis || Date.now(),
                            decayRate: this.config.adjustmentDecay
                        });
                        
                        logger.info(`🎯 Restored ${gameType} trend adjustment: +${(savedData.currentAdjustment * 100).toFixed(3)}%`);
                    }
                }
                
            } catch (error) {
                // File doesn't exist or is corrupted, skip silently
                logger.debug(`No valid trend data for ${gameType}: ${error.message}`);
            }
            
        } catch (error) {
            logger.error(`Error loading trend data for ${gameType}: ${error.message}`);
        }
    }

    /**
     * Save trend data to disk
     */
    async saveTrendData(gameType) {
        try {
            const dataDir = path.join(__dirname, '..', 'TREND_DATA');
            await fs.mkdir(dataDir, { recursive: true });
            
            const gameData = this.trendData.get(gameType);
            const filePath = path.join(dataDir, `${gameType}_trends.json`);
            
            // Convert Maps to objects for JSON and include adjustment data
            const adjustment = this.gameAdjustments.get(gameType);
            const saveData = {
                ...gameData,
                timestamp: Date.now(),
                // Include adjustment data for persistence
                reason: adjustment?.reason || null,
                confidence: adjustment?.confidence || null,
                dominantStrategy: adjustment?.dominantStrategy || null
            };
            
            await fs.writeFile(filePath, JSON.stringify(saveData, null, 2));
            
        } catch (error) {
            logger.error(`Error saving trend data for ${gameType}: ${error.message}`);
        }
    }
    
    /**
     * Save all trend data
     */
    async saveAllTrendData() {
        const promises = Array.from(this.trendData.keys()).map(gameType => 
            this.saveTrendData(gameType)
        );
        
        await Promise.all(promises);
    }
    
    /**
     * Record a big win event and trigger immediate analysis
     */
    async recordBigWin(gameType, userId, winAmount, betAmount = 0, metadata = {}) {
        try {
            logger.warn(`🚨 BIG WIN DETECTED: ${gameType} - User ${userId} won ${winAmount} (bet: ${betAmount})`);
            
            // Calculate win multiplier
            const multiplier = betAmount > 0 ? winAmount / betAmount : winAmount / 1000;
            
            // Enhanced wealth tracking - get user's total wealth
            const dbManager = require('./database');
            const balance = await dbManager.getUserBalance(userId);
            const totalWealth = balance.wallet + balance.bank;
            const wealthImpact = winAmount / Math.max(totalWealth, 1000); // Prevent division by zero
            
            // Determine if this is an extraordinary win (multiple criteria)
            const isExtraordinaryWin = 
                winAmount >= 10000000 ||        // 10M+ absolute win
                multiplier >= 100 ||             // 100x+ multiplier  
                wealthImpact >= 0.5 ||           // Win is 50%+ of current wealth
                (winAmount >= 5000000 && totalWealth < 50000000) || // 5M+ win for users under 50M wealth
                (winAmount >= 1000000 && totalWealth < 10000000);   // 1M+ win for users under 10M wealth
            
            // Record the win event with enhanced wealth tracking
            const bigWinRecord = {
                userId,
                gameType,
                winAmount,
                betAmount,
                multiplier,
                timestamp: Date.now(),
                isExtraordinary: isExtraordinaryWin,
                totalWealthBefore: totalWealth - winAmount, // Approximate wealth before win
                totalWealthAfter: totalWealth,
                wealthImpact: wealthImpact,
                wealthPercentageIncrease: wealthImpact * 100,
                metadata
            };
            
            // Add to game-specific tracking
            // Handle undefined/null gameType
            if (!gameType || gameType === 'undefined' || gameType === undefined) {
                logger.warn(`Undefined game type for big win (gameType: ${gameType}, userId: ${userId}, winAmount: ${winAmount})`);
                return;
            }
            
            if (!this.trendData.has(gameType)) {
                logger.warn(`Unknown game type for big win: "${gameType}" (type: ${typeof gameType}, userId: ${userId})`);
                return;
            }
            
            const gameData = this.trendData.get(gameType);
            if (!gameData.bigWins) gameData.bigWins = [];
            
            gameData.bigWins.push(bigWinRecord);
            
            // Keep only recent big wins (last 100)
            if (gameData.bigWins.length > 100) {
                gameData.bigWins.splice(0, gameData.bigWins.length - 100);
            }
            
            // Trigger immediate analysis for extraordinary wins
            if (isExtraordinaryWin) {
                logger.warn(`🎯 EXTRAORDINARY WIN - Triggering immediate trend analysis for ${gameType}`);
                const { fmt } = require('./common');
                logger.warn(`   Wealth Impact: ${(wealthImpact * 100).toFixed(1)}% | Before: ${fmt(totalWealth - winAmount)} | After: ${fmt(totalWealth)}`);
                
                await this.analyzeGameTrends(gameType);
                
                // Apply emergency adjustment for massive wins
                await this.applyEmergencyAdjustment(gameType, winAmount, multiplier);
                
                // Check for rapid wealth accumulation and apply emergency brakes
                await this.checkRapidWealthAccumulation(userId, bigWinRecord);
            }
            
        } catch (error) {
            logger.error(`Error recording big win: ${error.message}`);
        }
    }
    
    /**
     * Apply emergency adjustment for massive wins
     */
    async applyEmergencyAdjustment(gameType, winAmount, multiplier) {
        try {
            logger.info(`🎉 Massive win detected for ${gameType}: ${winAmount} (${multiplier.toFixed(1)}x). Fairness system will monitor without penalizing players.`);
            const gameData = this.trendData.get(gameType);
            if (gameData) {
                gameData.lastFairness = {
                    ...(gameData.lastFairness || {}),
                    notedBigWin: true,
                    computedAt: Date.now()
                };
            }
            this.sendBigWinAlert(gameType, winAmount, multiplier, 0);
        } catch (error) {
            logger.error(`Error handling massive win notification: ${error.message}`);
        }
    }
    
    /**
     * Check for concerning win patterns in recent big wins
     */
    analyzeBigWinPatterns(gameData) {
        if (!gameData.bigWins || gameData.bigWins.length < 5) {
            return { exploitation: 0, dominantStrategy: null, confidence: 0 };
        }
        
        const recentWins = gameData.bigWins.slice(-20); // Last 20 big wins
        const now = Date.now();
        const recentTimeframe = 24 * 60 * 60 * 1000; // 24 hours
        
        // Check for frequency of big wins
        const recentBigWins = recentWins.filter(win => now - win.timestamp < recentTimeframe);
        const extraordinaryWins = recentBigWins.filter(win => win.isExtraordinary);
        
        // Calculate average win multiplier
        const avgMultiplier = recentBigWins.reduce((sum, win) => sum + win.multiplier, 0) / recentBigWins.length;
        
        // Calculate exploitation based on frequency and size of wins
        let exploitation = 0;
        let confidence = 0;
        
        if (extraordinaryWins.length >= 2) {
            // Multiple extraordinary wins in 24h is concerning
            exploitation = 0.8;
            confidence = 0.9;
        } else if (recentBigWins.length >= 5 && avgMultiplier > 50) {
            // Frequent big wins with high multipliers
            exploitation = 0.6;
            confidence = 0.7;
        } else if (avgMultiplier > 100) {
            // Very high average multipliers
            exploitation = 0.5;
            confidence = 0.6;
        }
        
        return {
            exploitation,
            dominantStrategy: extraordinaryWins.length > 0 ? 'extraordinary_wins' : 'frequent_big_wins',
            confidence,
            pattern: 'big_win_analysis',
            recentBigWins: recentBigWins.length,
            extraordinaryWins: extraordinaryWins.length,
            avgMultiplier
        };
    }

    /**
     * Check for rapid wealth accumulation and apply emergency brakes
     */
    async checkRapidWealthAccumulation(userId, bigWinRecord) {
        try {
            const { fmt } = require('./common');
            
            // Check if this user is accumulating wealth too rapidly
            const now = Date.now();
            const oneHour = 60 * 60 * 1000;
            const sixHours = 6 * oneHour;
            const oneDay = 24 * oneHour;
            
            // Get all recent big wins for this user across all games
            const userBigWins = [];
            for (const [gameType, gameData] of this.trendData) {
                if (gameData.bigWins) {
                    const userWinsForGame = gameData.bigWins.filter(win => 
                        win.userId === userId && (now - win.timestamp) < oneDay
                    );
                    userBigWins.push(...userWinsForGame);
                }
            }
            
            // Calculate wealth accumulation rates
            const hourlyWins = userBigWins.filter(win => now - win.timestamp < oneHour);
            const sixHourWins = userBigWins.filter(win => now - win.timestamp < sixHours);
            const dailyWins = userBigWins.filter(win => now - win.timestamp < oneDay);
            
            const hourlyWinnings = hourlyWins.reduce((sum, win) => sum + win.winAmount, 0);
            const sixHourWinnings = sixHourWins.reduce((sum, win) => sum + win.winAmount, 0);
            const dailyWinnings = dailyWins.reduce((sum, win) => sum + win.winAmount, 0);
            
            // Get starting wealth estimates
            const currentWealth = bigWinRecord.totalWealthAfter;
            const hourlyStartWealth = Math.max(currentWealth - hourlyWinnings, 1000);
            const sixHourStartWealth = Math.max(currentWealth - sixHourWinnings, 1000);
            const dailyStartWealth = Math.max(currentWealth - dailyWinnings, 1000);
            
            // Calculate growth rates
            const hourlyGrowthRate = (currentWealth / hourlyStartWealth) - 1;
            const sixHourGrowthRate = (currentWealth / sixHourStartWealth) - 1;
            const dailyGrowthRate = (currentWealth / dailyStartWealth) - 1;
            
            // Define emergency thresholds
            const emergencyThresholds = {
                hourly: 1.0,    // 100% growth in 1 hour
                sixHour: 3.0,   // 300% growth in 6 hours  
                daily: 10.0     // 1000% growth in 1 day
            };
            
            // Check for emergency conditions
            let emergencyTriggered = false;
            let emergencyReason = '';
            
            if (hourlyGrowthRate > emergencyThresholds.hourly) {
                emergencyTriggered = true;
                emergencyReason = `Hourly wealth growth: ${(hourlyGrowthRate * 100).toFixed(0)}%`;
            } else if (sixHourGrowthRate > emergencyThresholds.sixHour) {
                emergencyTriggered = true;
                emergencyReason = `6-hour wealth growth: ${(sixHourGrowthRate * 100).toFixed(0)}%`;
            } else if (dailyGrowthRate > emergencyThresholds.daily) {
                emergencyTriggered = true;
                emergencyReason = `Daily wealth growth: ${(dailyGrowthRate * 100).toFixed(0)}%`;
            }
            
            // Additional checks
            if (hourlyWins.length >= 3 && hourlyWinnings >= 50000000) {
                emergencyTriggered = true;
                emergencyReason += ` | 3+ big wins in 1 hour (${fmt(hourlyWinnings)})`;
            }
            
            if (dailyWins.length >= 5 && currentWealth >= 1000000000) {
                emergencyTriggered = true;
                emergencyReason += ` | 5+ big wins reaching 1B+ wealth`;
            }
            
            if (emergencyTriggered) {
                logger.warn(`⚠️ Wealth surge detected for user ${userId}`);
                logger.warn(`   Reason: ${emergencyReason}`);
                logger.warn(`   Current Wealth: ${fmt(currentWealth)}`);
                logger.warn(`   Recent Wins: 1h=${hourlyWins.length}, 6h=${sixHourWins.length}, 24h=${dailyWins.length}`);

                const surgeData = {
                    userId,
                    triggerTime: now,
                    reason: emergencyReason,
                    currentWealth,
                    recentWins: {
                        hourly: { count: hourlyWins.length, amount: hourlyWinnings },
                        sixHour: { count: sixHourWins.length, amount: sixHourWinnings },
                        daily: { count: dailyWins.length, amount: dailyWinnings }
                    },
                    growthRates: {
                        hourly: hourlyGrowthRate,
                        sixHour: sixHourGrowthRate,
                        daily: dailyGrowthRate
                    }
                };

                try {
                    const monitoringChannel = process.env.LOG_CHANNEL_ID;
                    if (monitoringChannel && global.discordClient) {
                        const channel = await global.discordClient.channels.fetch(monitoringChannel).catch(() => null);
                        if (channel) {
                            await channel.send(`⚠️ **Wealth Surge Notice**
User: <@${userId}>
Reason: ${emergencyReason}
Current Wealth: ${fmt(currentWealth)}
Status: Monitoring only. No automated penalties applied.`);
                        }
                    }
                } catch (discordError) {
                    logger.error(`Failed to send wealth surge alert: ${discordError.message}`);
                }

                logger.debug(`Wealth surge data: ${JSON.stringify(surgeData)}`);
            }
            
        } catch (error) {
            logger.error(`Error checking rapid wealth accumulation: ${error.message}`);
        }
    }

    /**
     * Get trend analysis summary for monitoring
     */
    getTrendSummary() {
        const summary = {
            activeAdjustments: {},
            totalChoicesAnalyzed: 0,
            activePlayerProfiles: this.playerBehaviorProfiles.size,
            lastAnalysis: {}
        };
        
        // Collect adjustment data
        for (const [gameType, adjustment] of this.gameAdjustments) {
            summary.activeAdjustments[gameType] = {
                houseEdgeImpact: `${(adjustment.houseEdgeAdjustment * 100).toFixed(3)}%`,
                payoutBoost: adjustment.payoutBoost ? `${(adjustment.payoutBoost * 100).toFixed(1)}%` : '0%',
                reason: adjustment.reason,
                confidence: `${(adjustment.confidence * 100).toFixed(1)}%`,
                dominantStrategy: adjustment.dominantStrategy
            };
        }
        
        // Collect choice data
        for (const [gameType, gameData] of this.trendData) {
            summary.totalChoicesAnalyzed += gameData.totalChoices;
            summary.lastAnalysis[gameType] = new Date(gameData.lastAnalysis).toISOString();
        }
        
        return summary;
    }
    
    /**
     * Send adjustment alert to log channel
     */
    async sendAdjustmentAlert(gameType, adjustment, trendAnalysis, totalAdjustment) {
        try {
            const { EmbedBuilder } = require('discord.js');
            const bulletproofEconomy = require('../BULLETPROOF_ECONOMY/BulletproofEconomyController');
            const client = bulletproofEconomy.client;
            
            if (!client || !client.channels) return;
            
            const logChannelId = process.env.LOG_CHANNEL_ID;
            if (!logChannelId) return;
            
            const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
            if (!logChannel) return;
            
            const embed = new EmbedBuilder()
                .setTitle('🎯 Nash Equilibrium Adjustment')
                .setDescription(`Automatic adjustment applied to ${gameType}`)
                .setColor(0xFFD700)
                .addFields(
                    { name: 'Game', value: gameType, inline: true },
                    { name: 'Adjustment', value: `+${(adjustment * 100).toFixed(3)}%`, inline: true },
                    { name: 'Total Edge', value: `+${(totalAdjustment * 100).toFixed(3)}%`, inline: true },
                    { name: 'Pattern', value: trendAnalysis.pattern || 'Unknown', inline: true },
                    { name: 'Strategy', value: trendAnalysis.dominantStrategy || 'None', inline: true },
                    { name: 'Confidence', value: `${(trendAnalysis.confidence * 100).toFixed(1)}%`, inline: true }
                )
                .setTimestamp();
            
            await logChannel.send({ embeds: [embed] });
            
        } catch (error) {
            logger.error(`Error sending adjustment alert: ${error.message}`);
        }
    }
    
    /**
     * Send big win alert to log channel
     */
    async sendBigWinAlert(gameType, winAmount, multiplier, emergencyAdjustment) {
        try {
            const { EmbedBuilder } = require('discord.js');
            const { fmt } = require('./common');
            const bulletproofEconomy = require('../BULLETPROOF_ECONOMY/BulletproofEconomyController');
            const client = bulletproofEconomy.client;
            
            if (!client || !client.channels) return;
            
            const logChannelId = process.env.LOG_CHANNEL_ID;
            if (!logChannelId) return;
            
            const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
            if (!logChannel) return;
            
            const embed = new EmbedBuilder()
                .setTitle('🚨 MASSIVE WIN DETECTED')
                .setDescription(`Emergency adjustment applied`)
                .setColor(0xFF0000)
                .addFields(
                    { name: 'Game', value: gameType, inline: true },
                    { name: 'Win Amount', value: fmt(winAmount), inline: true },
                    { name: 'Multiplier', value: `${multiplier.toFixed(1)}x`, inline: true },
                    { name: 'Emergency Adjustment', value: `+${(emergencyAdjustment * 100).toFixed(1)}%`, inline: false }
                )
                .setTimestamp();
            
            await logChannel.send({ embeds: [embed] });
            
        } catch (error) {
            logger.error(`Error sending big win alert: ${error.message}`);
        }
    }
    
    /**
     * Initialize a new game type dynamically
     */
    initializeGameType(gameType) {
        try {
            // Ensure all Maps are initialized before use (defensive programming)
            if (!this.trendData) this.trendData = new Map();
            if (!this.nashEquilibriumState) this.nashEquilibriumState = new Map();
            if (!this.statisticalModels) this.statisticalModels = new Map();
            
            // Check if already initialized to prevent race conditions
            if (this.trendData.has(gameType)) {
                logger.debug(`Game type ${gameType} already initialized, skipping...`);
                return;
            }
            
            // Create generic structure for unknown game types
            this.trendData.set(gameType, {
                choices: new Map(),
                patterns: new Map(),
                totalChoices: 0,
                lastAnalysis: Date.now(),
                currentAdjustment: 0,
                bigWins: [],
                recentChoices: [],
                recentResults: [],
                fairnessStats: {
                    totalBet: 0,
                    totalPayout: 0,
                    sampleSize: 0,
                    winCount: 0
                }
            });
            
            this.nashEquilibriumState.set(gameType, {
                dominantStrategy: null,
                strategyDistribution: new Map(),
                equilibriumPoint: 0,
                lastShift: Date.now()
            });
            
            this.statisticalModels.set(gameType, {
                mean: 0,
                variance: 0,
                standardDeviation: 0,
                confidenceIntervals: { lower: 0, upper: 0 },
                outliers: [],
                trend: 'neutral'
            });
            
            logger.info(`✅ Initialized new game type: ${gameType}`);
        } catch (error) {
            logger.error(`Failed to initialize game type ${gameType}: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Enhanced pattern detection with caching
     */
    detectPatternWithCache(gameType, data, patternType) {
        const cacheKey = `${gameType}_${patternType}_${Date.now()}`;
        
        // Check cache first
        if (this.patternCache.has(cacheKey)) {
            const cached = this.patternCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.config.patternCacheExpiry) {
                return cached.result;
            }
        }
        
        // Perform pattern detection
        const result = this.performPatternDetection(data, patternType);
        
        // Cache result
        this.patternCache.set(cacheKey, {
            result,
            timestamp: Date.now()
        });
        
        // Clean old cache entries
        this.cleanPatternCache();
        
        return result;
    }
    
    /**
     * Perform actual pattern detection
     */
    performPatternDetection(data, patternType) {
        switch (patternType) {
            case 'sequential':
                return this.detectSequentialPattern(data);
            case 'cyclic':
                return this.detectCyclicPattern(data);
            case 'clustering':
                return this.detectClusteringPattern(data);
            case 'markov':
                return this.detectMarkovChain(data);
            default:
                return { detected: false, confidence: 0 };
        }
    }
    
    /**
     * Detect sequential patterns (A->B->C predictable sequences)
     */
    detectSequentialPattern(data) {
        if (!Array.isArray(data) || data.length < 3) {
            return { detected: false, confidence: 0 };
        }
        
        const sequences = new Map();
        for (let i = 0; i < data.length - 2; i++) {
            const seq = `${data[i]}_${data[i+1]}_${data[i+2]}`;
            sequences.set(seq, (sequences.get(seq) || 0) + 1);
        }
        
        const maxCount = Math.max(...sequences.values());
        const confidence = maxCount / (data.length - 2);
        
        return {
            detected: confidence > this.config.patternConfidence,
            confidence,
            pattern: [...sequences.entries()].find(([, count]) => count === maxCount)?.[0]
        };
    }
    
    /**
     * Detect cyclic patterns (repeating cycles)
     */
    detectCyclicPattern(data) {
        if (!Array.isArray(data) || data.length < 4) {
            return { detected: false, confidence: 0 };
        }
        
        // Check for cycles of length 2-5
        for (let cycleLen = 2; cycleLen <= Math.min(5, Math.floor(data.length / 2)); cycleLen++) {
            let matches = 0;
            let checks = 0;
            
            for (let i = cycleLen; i < data.length; i++) {
                if (data[i] === data[i - cycleLen]) {
                    matches++;
                }
                checks++;
            }
            
            const confidence = matches / checks;
            if (confidence > this.config.patternConfidence) {
                return {
                    detected: true,
                    confidence,
                    cycleLength: cycleLen
                };
            }
        }
        
        return { detected: false, confidence: 0 };
    }
    
    /**
     * Detect clustering patterns
     */
    detectClusteringPattern(data) {
        if (!Array.isArray(data) || data.length < 5) {
            return { detected: false, confidence: 0 };
        }
        
        // Group consecutive similar values
        const clusters = [];
        let currentCluster = { value: data[0], count: 1 };
        
        for (let i = 1; i < data.length; i++) {
            if (data[i] === currentCluster.value) {
                currentCluster.count++;
            } else {
                clusters.push(currentCluster);
                currentCluster = { value: data[i], count: 1 };
            }
        }
        clusters.push(currentCluster);
        
        // Check if clustering is significant
        const avgClusterSize = clusters.reduce((sum, c) => sum + c.count, 0) / clusters.length;
        const expectedClusterSize = 1 / (new Set(data).size); // Expected size if random
        
        const clusteringStrength = avgClusterSize / expectedClusterSize;
        
        return {
            detected: clusteringStrength > 1.5, // 50% more clustering than random
            confidence: Math.min(clusteringStrength / 2, 1),
            avgClusterSize,
            clusters: clusters.slice(0, 5) // Return top 5 clusters
        };
    }
    
    /**
     * Detect Markov chain patterns (state transitions)
     */
    detectMarkovChain(data) {
        if (!Array.isArray(data) || data.length < 10) {
            return { detected: false, confidence: 0 };
        }
        
        // Build transition matrix
        const transitions = new Map();
        const states = new Set(data);
        
        for (let i = 0; i < data.length - 1; i++) {
            const from = data[i];
            const to = data[i + 1];
            const key = `${from}_${to}`;
            transitions.set(key, (transitions.get(key) || 0) + 1);
        }
        
        // Check for strong transition patterns
        let maxTransitionProb = 0;
        let dominantTransition = null;
        
        for (const state of states) {
            let stateTotal = 0;
            let maxStateTransition = 0;
            let maxStateTarget = null;
            
            for (const [key, count] of transitions) {
                if (key.startsWith(`${state}_`)) {
                    stateTotal += count;
                    if (count > maxStateTransition) {
                        maxStateTransition = count;
                        maxStateTarget = key.split('_')[1];
                    }
                }
            }
            
            if (stateTotal > 0) {
                const prob = maxStateTransition / stateTotal;
                if (prob > maxTransitionProb) {
                    maxTransitionProb = prob;
                    dominantTransition = { from: state, to: maxStateTarget, probability: prob };
                }
            }
        }
        
        return {
            detected: maxTransitionProb > this.config.patternConfidence,
            confidence: maxTransitionProb,
            dominantTransition,
            transitions: Object.fromEntries([...transitions.entries()].slice(0, 10))
        };
    }
    
    /**
     * Clean pattern cache
     */
    cleanPatternCache() {
        if (this.patternCache.size > this.config.maxCacheSize) {
            // Remove oldest entries
            const entries = [...this.patternCache.entries()];
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            
            const toRemove = entries.slice(0, Math.floor(this.config.maxCacheSize / 2));
            toRemove.forEach(([key]) => this.patternCache.delete(key));
        }
    }
    
    /**
     * Calculate statistical model for game data
     */
    calculateStatisticalModel(gameType, values) {
        if (!Array.isArray(values) || values.length === 0) {
            return this.statisticalModels.get(gameType) || {};
        }
        
        // Calculate mean
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        
        // Calculate variance and standard deviation
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const standardDeviation = Math.sqrt(variance);
        
        // Calculate confidence intervals (95%)
        const marginOfError = 1.96 * (standardDeviation / Math.sqrt(values.length));
        const confidenceIntervals = {
            lower: mean - marginOfError,
            upper: mean + marginOfError
        };
        
        // Detect outliers (values beyond 3 standard deviations)
        const outliers = values.filter(val => Math.abs(val - mean) > 3 * standardDeviation);
        
        // Determine trend using linear regression
        const trend = this.calculateTrend(values);
        
        const model = {
            mean,
            variance,
            standardDeviation,
            confidenceIntervals,
            outliers,
            trend,
            sampleSize: values.length
        };
        
        this.statisticalModels.set(gameType, model);
        return model;
    }
    
    /**
     * Calculate trend using simple linear regression
     */
    calculateTrend(values) {
        if (values.length < 2) return 'neutral';
        
        // Create time series (index as time)
        const n = values.length;
        const sumX = (n * (n - 1)) / 2; // Sum of 0 to n-1
        const sumY = values.reduce((sum, val) => sum + val, 0);
        const sumXY = values.reduce((sum, val, i) => sum + i * val, 0);
        const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6; // Sum of squares
        
        // Calculate slope
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        
        // Determine trend based on slope
        if (Math.abs(slope) < 0.01) return 'neutral';
        return slope > 0 ? 'increasing' : 'decreasing';
    }
}

module.exports = GameTrendAnalyzer;
