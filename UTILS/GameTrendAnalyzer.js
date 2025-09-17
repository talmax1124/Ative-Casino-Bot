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
        
        // Trend analysis configuration
        this.config = {
            // Data retention
            maxTrendHistory: 10000,      // Keep last 10k actions per game
            playerProfileExpiry: 30,     // Days to retain player profiles
            
            // Nash equilibrium parameters
            nashSensitivity: 0.001,      // How sensitive to trend changes
            maxAdjustment: 0.05,         // Maximum 5% house edge increase
            equilibriumThreshold: 0.7,   // When 70%+ players use same strategy
            
            // Adjustment decay
            adjustmentDecay: 0.98,       // Adjustments decay 2% per day
            minDecayInterval: 3600000,   // 1 hour minimum between decays
            
            // Pattern detection
            minSampleSize: 100,          // Minimum choices before analysis
            patternConfidence: 0.85,     // 85% confidence for pattern detection
            
            // Game-specific sensitivities
            gameSensitivities: {
                'roulette': 1.2,         // Higher sensitivity for choice-heavy games
                'blackjack': 0.8,        // Lower for skill-based games
                'slots': 0.5,            // Lower for random games
                'crash': 1.5,            // Higher for timing games
                'plinko': 0.7,
                'rps': 1.0,
                'duck': 0.9,
                'treasurevault': 1.1
            }
        };
        
        // Initialize data structures
        this.initializeDataStructures();
        
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
            'rps': {
                choices: ['rock', 'paper', 'scissors'],
                sequencePatterns: new Map(),
                antiPatterns: new Map()
            },
            'duck': {
                riskTaking: new Map(),
                cashoutTiming: new Map(),
                positionStrategies: new Map()
            },
            'treasurevault': {
                doorChoices: new Map(),
                riskProgression: new Map(),
                roundStrategies: new Map()
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
        }
    }
    
    /**
     * Record a player choice/action in any game
     */
    async recordChoice(gameType, userId, choice, metadata = {}) {
        try {
            if (!this.trendData.has(gameType)) {
                logger.warn(`Unknown game type for trend analysis: ${gameType}`);
                return;
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
                await this.recordDuckChoice(gameData, choiceRecord);
                break;
                
            case 'treasurevault':
                await this.recordTreasureChoice(gameData, choiceRecord);
                break;
                
            default:
                // Generic choice recording
                if (!gameData.choices) gameData.choices = new Map();
                const count = gameData.choices.get(choice) || 0;
                gameData.choices.set(choice, count + 1);
        }
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
        
        // Keep only recent choices
        if (gameProfile.choices.length > 100) {
            gameProfile.choices.splice(0, 50);
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
        switch (gameType) {
            case 'roulette':
                return this.analyzeRouletteTrends(gameData);
            case 'blackjack':
                return this.analyzeBlackjackTrends(gameData);
            case 'crash':
                return this.analyzeCrashTrends(gameData);
            case 'rps':
                return this.analyzeRPSTrends(gameData);
            default:
                return this.analyzeGenericTrends(gameData);
        }
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
        const { exploitation, confidence } = trendAnalysis;
        
        if (exploitation <= 0 || confidence < 0.5) {
            return 0; // No adjustment needed
        }
        
        // Base adjustment proportional to exploitation level
        let adjustment = exploitation * this.config.nashSensitivity * 10;
        
        // Apply game-specific sensitivity
        const gameSensitivity = this.config.gameSensitivities[gameType] || 1.0;
        adjustment *= gameSensitivity;
        
        // Apply confidence scaling
        adjustment *= confidence;
        
        // Cap the adjustment
        adjustment = Math.min(adjustment, this.config.maxAdjustment);
        
        // Nash theory: Only increase house edge, never decrease (prevent exploitation)
        return Math.max(0, adjustment);
    }
    
    /**
     * Apply trend-based adjustment to game
     */
    async applyTrendAdjustment(gameType, adjustment, trendAnalysis) {
        const gameData = this.trendData.get(gameType);
        const currentAdjustment = gameData.currentAdjustment || 0;
        
        // Calculate new total adjustment
        const newAdjustment = Math.min(
            currentAdjustment + adjustment,
            this.config.maxAdjustment
        );
        
        // Store adjustment
        gameData.currentAdjustment = newAdjustment;
        this.gameAdjustments.set(gameType, {
            houseEdgeAdjustment: newAdjustment,
            reason: trendAnalysis.pattern,
            confidence: trendAnalysis.confidence,
            dominantStrategy: trendAnalysis.dominantStrategy,
            appliedAt: Date.now(),
            decayRate: this.config.adjustmentDecay
        });
        
        // Log significant adjustments
        if (adjustment > 0.001) {
            logger.warn(`🎯 NASH EQUILIBRIUM ADJUSTMENT: ${gameType} +${(adjustment * 100).toFixed(3)}% house edge`);
            logger.warn(`   Reason: ${trendAnalysis.pattern} (${trendAnalysis.dominantStrategy})`);
            logger.warn(`   Confidence: ${(trendAnalysis.confidence * 100).toFixed(1)}%`);
            logger.warn(`   Total Adjustment: ${(newAdjustment * 100).toFixed(3)}%`);
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
            
            if (newAdjustment < 0.0001) {
                // Remove negligible adjustments
                this.gameAdjustments.delete(gameType);
                logger.debug(`Removed decayed adjustment for ${gameType}`);
            } else {
                adjustment.houseEdgeAdjustment = newAdjustment;
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
                houseEdgeIncrease: `+${(adjustment.houseEdgeAdjustment * 100).toFixed(3)}%`,
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
}

module.exports = GameTrendAnalyzer;