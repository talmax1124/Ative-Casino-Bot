/**
 * DYNAMIC HOUSE EDGE ADJUSTMENT SYSTEM
 * Intelligent adaptive casino mathematics that responds to player behavior,
 * win rates, and economic conditions using advanced algorithms
 */

const jStat = require('jstat');
const Matrix = require('ml-matrix').Matrix;
const ss = require('simple-statistics');
const crypto = require('crypto');
const { secureRandomFloat, secureRandomInt } = require('../../UTILS/rng');

class DynamicHouseEdgeSystem {
    constructor(economyEngine) {
        this.economyEngine = economyEngine;
        
        // Mathematical constants for edge calculation
        this.PHI = 1.618033988749895;  // Golden ratio
        this.E = 2.718281828459045;    // Euler's number
        this.TAU = 2 * Math.PI;        // Tau constant
        
        // Edge adjustment parameters
        this.baseEdges = new Map();
        this.adjustmentFactors = new Map();
        this.playerMetrics = new Map();
        this.globalMetrics = {
            totalProfitLoss: 0,
            totalGamesPlayed: 0,
            averageWinRate: 0.5,
            volatilityIndex: 0,
            riskLevel: 0.5
        };
        
        // Adaptive learning parameters
        this.learningRate = 0.001;
        this.momentumFactor = 0.9;
        this.previousAdjustments = new Map();
        
        // Initialize the system
        this.initialize();
    }

    /**
     * Initialize the dynamic house edge system
     */
    initialize() {
        console.log('⚙️ Initializing Dynamic House Edge System...');
        
        // Set base house edges for each game
        this.initializeBaseEdges();
        
        // Initialize adjustment factors
        this.initializeAdjustmentFactors();
        
        // Setup monitoring intervals
        this.setupMonitoring();
        
        console.log('✅ Dynamic House Edge System initialized');
    }

    /**
     * Initialize base house edges for all games
     */
    initializeBaseEdges() {
        // REASONABLE HOUSE EDGE SETTINGS - Industry standard casino edges
        this.baseEdges.set('slots', {
            minimum: 0.015,    // 1.5%
            base: 0.025,       // 2.5% - standard slot house edge
            maximum: 0.05,     // 5%
            current: 0.025,
            strictMode: false
        });
        
        this.baseEdges.set('blackjack', {
            minimum: 0.005,    // 0.5%
            base: 0.01,        // 1% - realistic blackjack edge
            maximum: 0.025,    // 2.5%
            current: 0.01,
            strictMode: false
        });
        
        this.baseEdges.set('roulette', {
            minimum: 0.027,    // 2.7% - European roulette
            base: 0.027,       // 2.7%
            maximum: 0.053,    // 5.3% - American roulette
            current: 0.027,
            strictMode: false
        });
        
        this.baseEdges.set('plinko', {
            minimum: 0.01,     // 1%
            base: 0.02,        // 2%
            maximum: 0.04,     // 4%
            current: 0.02,
            strictMode: false
        });
        
        this.baseEdges.set('crash', {
            minimum: 0.01,     // 1%
            base: 0.02,        // 2%
            maximum: 0.04,     // 4%
            current: 0.02,
            strictMode: false
        });
        
        this.baseEdges.set('treasurevault', {
            minimum: 0.02,     // 2%
            base: 0.035,       // 3.5%
            maximum: 0.06,     // 6%
            current: 0.035,
            strictMode: false
        });
        
        this.baseEdges.set('ceelo', {
            minimum: 0.015,    // 1.5%
            base: 0.025,       // 2.5%
            maximum: 0.045,    // 4.5%
            current: 0.025,
            strictMode: false
        });
        
        this.baseEdges.set('keno', {
            minimum: 0.15,     // 15%
            base: 0.25,        // 25% - keno traditionally has high edge
            maximum: 0.35,     // 35%
            current: 0.25,
            strictMode: false
        });
        
        // Add all missing game types with appropriate house edges
        this.baseEdges.set('poker', {
            minimum: 0.02,     // 2%
            base: 0.035,       // 3.5%
            maximum: 0.08,     // 8%
            current: 0.035,
            strictMode: false
        });
        
        this.baseEdges.set('fishing', {
            minimum: 0.015,    // 1.5%
            base: 0.03,        // 3%
            maximum: 0.06,     // 6%
            current: 0.03,
            strictMode: false
        });
        
        this.baseEdges.set('bingo', {
            minimum: 0.05,     // 5%
            base: 0.08,        // 8%
            maximum: 0.15,     // 15%
            current: 0.08,
            strictMode: false
        });
        
        
        this.baseEdges.set('multi_slots', {
            minimum: 0.02,     // 2%
            base: 0.03,        // 3%
            maximum: 0.06,     // 6%
            current: 0.03,
            strictMode: false
        });
        
        this.baseEdges.set('matrix_slots', {
            minimum: 0.025,    // 2.5%
            base: 0.04,        // 4%
            maximum: 0.07,     // 7%
            current: 0.04,
            strictMode: false
        });
        
        this.baseEdges.set('russianroulette', {
            minimum: 0.01,     // 1%
            base: 0.02,        // 2%
            maximum: 0.04,     // 4%
            current: 0.02,
            strictMode: false
        });
        
        this.baseEdges.set('heist', {
            minimum: 0.03,     // 3%
            base: 0.05,        // 5%
            maximum: 0.08,     // 8%
            current: 0.05,
            strictMode: false
        });
        
        // Card/social games with low edges to encourage play
        ['uno', 'war', 'spades', '31', 'rps', 'duck', 'battleship', 'wordchain', 'yahtzee'].forEach(gameType => {
            this.baseEdges.set(gameType, {
                minimum: 0.005,    // 0.5%
                base: 0.015,       // 1.5%
                maximum: 0.03,     // 3%
                current: 0.015,
                strictMode: false
            });
        });
        
        // High-variance games (but reasonable edges)
        this.baseEdges.set('scratch', {
            minimum: 0.10,     // 10%
            base: 0.15,        // 15%
            maximum: 0.25,     // 25%
            current: 0.15,
            strictMode: false
        });
        
        this.baseEdges.set('lottery', {
            minimum: 0.25,     // 25%
            base: 0.35,        // 35%
            maximum: 0.50,     // 50%
            current: 0.35,
            strictMode: false
        });
    }

    /**
     * Initialize mathematical adjustment factors
     */
    initializeAdjustmentFactors() {
        const gameTypes = Array.from(this.baseEdges.keys());
        
        for (const gameType of gameTypes) {
            this.adjustmentFactors.set(gameType, {
                winRateMultiplier: 1.0,
                frequencyMultiplier: 1.0,
                betSizeMultiplier: 1.0,
                skillMultiplier: 1.0,
                volatilityMultiplier: 1.0,
                economicMultiplier: 1.0
            });
            
            this.previousAdjustments.set(gameType, {
                direction: 0,
                magnitude: 0,
                momentum: 0
            });
        }
    }

    /**
     * Setup continuous monitoring and adjustment
     */
    setupMonitoring() {
        // Rapid response monitoring (every 30 seconds) - non-blocking
        setInterval(async () => {
            await this.performRapidAdjustments();
        }, 30000);
        
        // Deep analysis monitoring (every 5 minutes) - non-blocking
        setInterval(async () => {
            await this.performDeepAnalysis();
        }, 300000);
        
        // Economic rebalancing (every hour) - non-blocking
        setInterval(async () => {
            await this.performEconomicRebalancing();
        }, 3600000);
    }

    /**
     * Calculate dynamic house edge for a specific game and player
     */
    calculateDynamicEdge(gameType, userId, betAmount, playerProfile = null) {
        const baseEdge = this.baseEdges.get(gameType);
        if (!baseEdge) {
            throw new Error(`Unknown game type: ${gameType}`);
        }
        
        // Get adjustment factors
        const factors = this.adjustmentFactors.get(gameType);
        let dynamicEdge = baseEdge.current;
        
        // No additional base increase - use configured base edges only
        
        // Apply player-specific adjustments
        if (playerProfile) {
            dynamicEdge = this.applyPlayerAdjustments(dynamicEdge, playerProfile, factors);
        }
        
        // Apply bet size adjustments
        dynamicEdge = this.applyBetSizeAdjustments(dynamicEdge, betAmount, gameType, factors);
        
        // Apply global economic adjustments
        dynamicEdge = this.applyEconomicAdjustments(dynamicEdge, factors);
        
        // Apply mathematical smoothing
        dynamicEdge = this.applySmoothingFunction(dynamicEdge, gameType);
        
        // Ensure edge stays within bounds
        dynamicEdge = Math.max(baseEdge.minimum, Math.min(baseEdge.maximum, dynamicEdge));
        
        // Log significant adjustments
        if (Math.abs(dynamicEdge - baseEdge.base) > 0.005) {
            console.log(`🎯 Dynamic edge adjustment: ${gameType} ${(dynamicEdge * 100).toFixed(2)}% (base: ${(baseEdge.base * 100).toFixed(2)}%)`);
        }
        
        return dynamicEdge;
    }

    /**
     * Apply player-specific adjustments based on behavior analysis
     */
    applyPlayerAdjustments(currentEdge, playerProfile, factors) {
        let adjustedEdge = currentEdge;
        
        // Moderate win rate adjustment (only penalize exceptionally high win rates)
        const winRate = playerProfile.historicalWinRate || 0.5;
        if (winRate > 0.7) {
            // Small penalty for consistently high win rates
            const winRatePenalty = (winRate - 0.7) * 0.02; // 2% penalty for every 10% above 70%
            adjustedEdge += winRatePenalty * factors.winRateMultiplier;
        }
        
        // Skill level adjustment (very moderate)
        const skillLevel = this.calculatePlayerSkillLevel(playerProfile);
        if (skillLevel > 0.9) {
            // Only penalize extremely skilled players slightly
            const skillPenalty = (skillLevel - 0.9) * 0.005;
            adjustedEdge += skillPenalty * factors.skillMultiplier;
        }
        
        // Frequency adjustment (very light penalty for excessive play)
        const gameFrequency = playerProfile.recentGameCount || 0;
        if (gameFrequency > 500) {
            // Only penalize extremely high frequency
            const frequencyPenalty = Math.min(0.003, (gameFrequency - 500) / 10000);
            adjustedEdge += frequencyPenalty * factors.frequencyMultiplier;
        }
        
        // Betting pattern analysis (reduced penalties)
        const bettingPattern = this.analyzeBettingPattern(playerProfile);
        if (bettingPattern.isOptimal) {
            const patternPenalty = bettingPattern.optimizationLevel * 0.002; // Reduced from 0.008
            adjustedEdge += patternPenalty;
        }
        
        return adjustedEdge;
    }

    /**
     * Calculate player skill level using multiple metrics
     */
    calculatePlayerSkillLevel(playerProfile) {
        const metrics = [
            playerProfile.historicalWinRate || 0.5,
            Math.min(1, (playerProfile.averageSession || 0) / 3600), // Session length (normalized)
            Math.min(1, (playerProfile.totalGames || 0) / 1000),     // Experience (normalized)
            playerProfile.optimalBetRatio || 0,                     // Optimal betting frequency
            1 - (playerProfile.emotionalDecisions || 0.5)           // Emotional control
        ];
        
        // Weighted combination using golden ratio proportions
        const weights = [0.3, 0.2, 0.2, 0.15, 0.15];
        let skillScore = 0;
        
        for (let i = 0; i < metrics.length; i++) {
            skillScore += metrics[i] * weights[i];
        }
        
        // Apply non-linear transformation for more realistic scaling
        return Math.pow(skillScore, 1 / this.PHI);
    }

    /**
     * Analyze betting patterns for optimization detection
     */
    analyzeBettingPattern(playerProfile) {
        const bets = playerProfile.recentBets || [];
        if (bets.length < 10) {
            return { isOptimal: false, optimizationLevel: 0 };
        }
        
        // Check for Kelly criterion usage
        const kellyScore = this.detectKellyBetting(bets);
        
        // Check for martingale system
        const martingaleScore = this.detectMartingale(bets);
        
        // Check for progressive betting
        const progressiveScore = this.detectProgressiveBetting(bets);
        
        // Check for card counting patterns (blackjack)
        const countingScore = this.detectCardCounting(playerProfile);
        
        const totalOptimization = Math.max(kellyScore, martingaleScore, progressiveScore, countingScore);
        
        return {
            isOptimal: totalOptimization > 0.3,
            optimizationLevel: totalOptimization,
            patterns: {
                kelly: kellyScore,
                martingale: martingaleScore,
                progressive: progressiveScore,
                counting: countingScore
            }
        };
    }

    /**
     * Detect Kelly criterion betting patterns
     */
    detectKellyBetting(bets) {
        if (bets.length < 5) return 0;
        
        // Calculate bet size variance and correlation with win probability
        const betSizes = bets.map(b => b.amount);
        const variance = ss.variance(betSizes);
        const mean = ss.mean(betSizes);
        const cv = Math.sqrt(variance) / mean; // Coefficient of variation
        
        // Kelly betting typically shows low variance with strategic increases
        if (cv < 0.3 && cv > 0.1) {
            return Math.min(1, (0.3 - cv) / 0.2);
        }
        
        return 0;
    }

    /**
     * Detect Martingale betting system
     */
    detectMartingale(bets) {
        if (bets.length < 5) return 0;
        
        let martingaleScore = 0;
        let consecutiveLosses = 0;
        
        for (let i = 1; i < bets.length; i++) {
            const currentBet = bets[i];
            const previousBet = bets[i - 1];
            
            if (!previousBet.won) {
                consecutiveLosses++;
                // Check if bet doubled after loss
                if (currentBet.amount >= previousBet.amount * 1.8) {
                    martingaleScore += 0.2;
                }
            } else {
                consecutiveLosses = 0;
            }
        }
        
        return Math.min(1, martingaleScore);
    }

    /**
     * Detect progressive betting systems
     */
    detectProgressiveBetting(bets) {
        if (bets.length < 10) return 0;
        
        const betSizes = bets.map(b => b.amount);
        const differences = [];
        
        for (let i = 1; i < betSizes.length; i++) {
            differences.push(betSizes[i] - betSizes[i - 1]);
        }
        
        // Look for consistent progression patterns
        const avgDifference = ss.mean(differences);
        const variance = ss.variance(differences);
        
        // Progressive systems show consistent difference patterns
        if (Math.abs(avgDifference) > 0 && variance < Math.pow(avgDifference, 2) * 2) {
            return Math.min(1, Math.abs(avgDifference) / (Math.sqrt(variance) + 1));
        }
        
        return 0;
    }

    /**
     * Detect card counting patterns (for blackjack)
     */
    detectCardCounting(playerProfile) {
        if (!playerProfile.blackjackMetrics) return 0;
        
        const metrics = playerProfile.blackjackMetrics;
        let countingScore = 0;
        
        // High win rate in favorable counts
        if (metrics.favorableCountWinRate > 0.6) {
            countingScore += 0.3;
        }
        
        // Bet variation based on count
        if (metrics.betVariationRatio > 2) {
            countingScore += 0.3;
        }
        
        // Insurance bet patterns
        if (metrics.appropriateInsuranceBets > 0.8) {
            countingScore += 0.2;
        }
        
        // Basic strategy adherence
        if (metrics.basicStrategyAdherence > 0.95) {
            countingScore += 0.2;
        }
        
        return Math.min(1, countingScore);
    }

    /**
     * Apply comprehensive bet size adjustments to house edge with advanced analytics
     */
    applyBetSizeAdjustments(currentEdge, betAmount, gameType, factors) {
        let adjustedEdge = currentEdge;
        
        // === COMPREHENSIVE BET SIZE ANALYTICS ===
        
        // 1. ABSOLUTE BET SIZE ANALYSIS
        const absoluteBetFactors = this.calculateAbsoluteBetFactors(betAmount);
        adjustedEdge += absoluteBetFactors.adjustment * factors.betSizeMultiplier;
        
        // 2. RELATIVE BET SIZE ANALYSIS (compared to typical bets for this game)
        const relativeBetFactors = this.calculateRelativeBetFactors(betAmount, gameType);
        adjustedEdge += relativeBetFactors.adjustment * factors.betSizeMultiplier;
        
        // 3. BET SIZE PROGRESSION ANALYSIS (detecting patterns)
        const progressionFactors = this.calculateBetProgressionFactors(betAmount, gameType);
        adjustedEdge += progressionFactors.adjustment * factors.betSizeMultiplier;
        
        // 4. RISK-ADJUSTED BET SIZE ANALYSIS
        const riskAdjustedFactors = this.calculateRiskAdjustedBetFactors(betAmount, gameType);
        adjustedEdge += riskAdjustedFactors.adjustment * factors.betSizeMultiplier;
        
        // 5. GAME-SPECIFIC BET SIZE ANALYSIS
        const gameSpecificFactors = this.calculateGameSpecificBetFactors(betAmount, gameType);
        adjustedEdge += gameSpecificFactors.adjustment * factors.betSizeMultiplier;
        
        // 6. MATHEMATICAL BET SIZE OPTIMIZATION
        const mathematicalFactors = this.calculateMathematicalBetFactors(betAmount, gameType);
        adjustedEdge += mathematicalFactors.adjustment * factors.betSizeMultiplier;
        
        // Log comprehensive bet analysis if significant
        const totalBetAdjustment = adjustedEdge - currentEdge;
        if (Math.abs(totalBetAdjustment) > 0.002) {
            console.log(`📊 Comprehensive Bet Size Analysis: ${gameType} - Bet: ${betAmount.toLocaleString()}`);
            console.log(`   Absolute: +${(absoluteBetFactors.adjustment * 100).toFixed(3)}% | Relative: +${(relativeBetFactors.adjustment * 100).toFixed(3)}%`);
            console.log(`   Progression: +${(progressionFactors.adjustment * 100).toFixed(3)}% | Risk-Adjusted: +${(riskAdjustedFactors.adjustment * 100).toFixed(3)}%`);
            console.log(`   Game-Specific: +${(gameSpecificFactors.adjustment * 100).toFixed(3)}% | Mathematical: +${(mathematicalFactors.adjustment * 100).toFixed(3)}%`);
            console.log(`   Total Bet Adjustment: +${(totalBetAdjustment * 100).toFixed(3)}%`);
        }
        
        return adjustedEdge;
    }

    /**
     * Apply global economic adjustments
     */
    applyEconomicAdjustments(currentEdge, factors) {
        let adjustedEdge = currentEdge;
        
        // Global profit/loss adjustment
        const profitRatio = this.globalMetrics.totalProfitLoss / Math.max(1, this.globalMetrics.totalGamesPlayed);
        if (profitRatio < -10) {
            // House is losing, increase edge
            const lossAdjustment = Math.abs(profitRatio) / 1000 * 0.005;
            adjustedEdge += lossAdjustment * factors.economicMultiplier;
        }
        
        // Volatility adjustment
        if (this.globalMetrics.volatilityIndex > 0.7) {
            const volatilityAdjustment = (this.globalMetrics.volatilityIndex - 0.5) * 0.01;
            adjustedEdge += volatilityAdjustment * factors.volatilityMultiplier;
        }
        
        return adjustedEdge;
    }

    /**
     * Apply mathematical smoothing to prevent abrupt changes
     */
    applySmoothingFunction(targetEdge, gameType) {
        const baseEdge = this.baseEdges.get(gameType);
        const currentEdge = baseEdge.current;
        
        // Use exponential moving average for smooth transitions
        const smoothingFactor = 0.1; // 10% of the way to target each adjustment
        const smoothedEdge = (1 - smoothingFactor) * currentEdge + smoothingFactor * targetEdge;
        
        // Apply momentum from previous adjustments
        const previousAdjustment = this.previousAdjustments.get(gameType);
        const momentum = previousAdjustment.momentum * this.momentumFactor;
        
        return smoothedEdge + momentum;
    }

    /**
     * Perform rapid adjustments based on real-time metrics (non-blocking)
     */
    async performRapidAdjustments() {
        const gameTypes = Array.from(this.baseEdges.keys());
        
        for (let i = 0; i < gameTypes.length; i++) {
            const gameType = gameTypes[i];
            
            try {
                const recentMetrics = this.getRecentGameMetrics(gameType, 1800); // Last 30 minutes
                
                if (recentMetrics.gameCount > 10) {
                    const winRate = recentMetrics.playerWinRate;
                    
                    // Rapid response to unusual win rates
                    if (winRate > 0.6) {
                        this.adjustEdgeRapidly(gameType, 0.005); // Increase edge by 0.5%
                    } else if (winRate < 0.35) {
                        this.adjustEdgeRapidly(gameType, -0.002); // Decrease edge by 0.2%
                    }
                }
                
                // Yield control to event loop between each game
                if (i < gameTypes.length - 1) {
                    await new Promise(resolve => setImmediate(resolve));
                }
            } catch (error) {
                console.error(`Error during rapid adjustment for ${gameType}: ${error.message}`);
            }
        }
    }

    /**
     * Perform deep mathematical analysis (non-blocking)
     */
    async performDeepAnalysis() {
        console.log('🔍 Performing deep house edge analysis...');
        
        const gameTypes = Array.from(this.baseEdges.keys());
        
        for (let i = 0; i < gameTypes.length; i++) {
            const gameType = gameTypes[i];
            
            try {
                const analysis = this.performGameAnalysis(gameType);
                this.updateAdjustmentFactors(gameType, analysis);
                
                // Yield control to event loop between each game analysis
                if (i < gameTypes.length - 1) {
                    await new Promise(resolve => setImmediate(resolve));
                }
            } catch (error) {
                console.error(`Error analyzing ${gameType}: ${error.message}`);
            }
        }
        
        console.log('✅ Deep house edge analysis completed');
    }

    /**
     * Perform comprehensive game analysis
     */
    performGameAnalysis(gameType) {
        const metrics = this.getRecentGameMetrics(gameType, 7200); // Last 2 hours
        
        return {
            profitability: this.calculateProfitability(metrics),
            playerOptimization: this.calculatePlayerOptimization(metrics),
            volatility: this.calculateVolatility(metrics),
            riskLevel: this.calculateRiskLevel(metrics),
            stability: this.calculateStability(metrics)
        };
    }

    /**
     * Calculate game profitability
     */
    calculateProfitability(metrics) {
        if (metrics.gameCount === 0) return 0.5;
        
        const houseWinRate = 1 - metrics.playerWinRate;
        const averageProfit = metrics.totalHouseProfit / metrics.gameCount;
        
        // Normalize profitability score
        return Math.max(0, Math.min(1, houseWinRate + (averageProfit / 1000)));
    }

    /**
     * Calculate player optimization level
     */
    calculatePlayerOptimization(metrics) {
        if (metrics.gameCount === 0) return 0;
        
        const factors = [
            metrics.averageSkillLevel || 0,
            metrics.optimalBettingRatio || 0,
            metrics.systemUsageRatio || 0,
            metrics.cardCountingRatio || 0
        ];
        
        return ss.mean(factors);
    }

    /**
     * Calculate game volatility
     */
    calculateVolatility(metrics) {
        if (metrics.gameCount < 10) return 0.5;
        
        const payouts = metrics.payoutHistory || [];
        const variance = ss.variance(payouts);
        const mean = ss.mean(payouts);
        
        return Math.min(1, variance / (mean * mean + 1));
    }

    /**
     * Calculate risk level
     */
    calculateRiskLevel(metrics) {
        const factors = [
            metrics.largeBetkRatio || 0,
            metrics.highFrequencyPlayerRatio || 0,
            metrics.professionalPlayerRatio || 0,
            this.globalMetrics.riskLevel
        ];
        
        return ss.mean(factors);
    }

    /**
     * Calculate system stability
     */
    calculateStability(metrics) {
        if (metrics.gameCount < 20) return 0.5;
        
        const winRateVariance = ss.variance(metrics.recentWinRates || [0.5]);
        const profitVariance = ss.variance(metrics.recentProfits || [0]);
        
        const stability = 1 / (1 + winRateVariance * 10 + profitVariance / 10000);
        return Math.max(0, Math.min(1, stability));
    }

    /**
     * Update adjustment factors based on analysis
     */
    updateAdjustmentFactors(gameType, analysis) {
        const factors = this.adjustmentFactors.get(gameType);
        
        // Adaptive learning adjustments
        factors.winRateMultiplier += (1 - analysis.profitability) * this.learningRate;
        factors.skillMultiplier += analysis.playerOptimization * this.learningRate;
        factors.volatilityMultiplier += analysis.volatility * this.learningRate;
        factors.economicMultiplier += (1 - analysis.stability) * this.learningRate;
        
        // Ensure factors stay within reasonable bounds
        for (const [key, value] of Object.entries(factors)) {
            factors[key] = Math.max(0.5, Math.min(2.0, value));
        }
        
        this.adjustmentFactors.set(gameType, factors);
    }

    /**
     * Perform economic rebalancing
     */
    async performEconomicRebalancing() {
        console.log('⚖️ Performing economic rebalancing...');
        
        try {
            // Update global metrics
            this.updateGlobalMetrics();
            
            // Yield control to event loop
            await new Promise(resolve => setImmediate(resolve));
            
            // Rebalance house edges across all games
            this.rebalanceHouseEdges();
            
            // Yield control to event loop
            await new Promise(resolve => setImmediate(resolve));
            
            // Optimize for long-term stability
            this.optimizeForStability();
            
            console.log('✅ Economic rebalancing completed');
        } catch (error) {
            console.error(`Error during economic rebalancing: ${error.message}`);
        }
    }

    /**
     * Update global economic metrics
     */
    updateGlobalMetrics() {
        // This would typically pull from database
        // For now, simulate global metrics
        this.globalMetrics.volatilityIndex = secureRandomFloat(0.3, 0.8);
        this.globalMetrics.riskLevel = secureRandomFloat(0.2, 0.7);
        this.globalMetrics.averageWinRate = secureRandomFloat(0.45, 0.55);
    }

    /**
     * Rebalance house edges for optimal performance
     */
    rebalanceHouseEdges() {
        const totalGames = Array.from(this.baseEdges.keys())
            .reduce((sum, gameType) => sum + this.getGamePopularity(gameType), 0);
        
        for (const [gameType, baseEdge] of this.baseEdges) {
            const popularity = this.getGamePopularity(gameType);
            const popularityRatio = popularity / totalGames;
            
            // Adjust base edge based on popularity and performance
            const adjustment = (popularityRatio - 0.2) * 0.005; // ±0.5% based on popularity
            baseEdge.current = Math.max(
                baseEdge.minimum,
                Math.min(baseEdge.maximum, baseEdge.base + adjustment)
            );
        }
    }

    /**
     * Optimize for long-term stability
     */
    optimizeForStability() {
        // Portfolio optimization approach to house edges
        const gameTypes = Array.from(this.baseEdges.keys());
        const riskMatrix = this.calculateCrossGameRisks(gameTypes);
        
        // Apply portfolio optimization principles
        for (let i = 0; i < gameTypes.length; i++) {
            const gameType = gameTypes[i];
            const baseEdge = this.baseEdges.get(gameType);
            
            // Calculate optimal edge based on cross-game correlations
            let optimalAdjustment = 0;
            for (let j = 0; j < gameTypes.length; j++) {
                if (i !== j) {
                    const correlation = riskMatrix.get(i, j);
                    const otherEdge = this.baseEdges.get(gameTypes[j]);
                    optimalAdjustment += correlation * (otherEdge.current - otherEdge.base) * 0.1;
                }
            }
            
            baseEdge.current = Math.max(
                baseEdge.minimum,
                Math.min(baseEdge.maximum, baseEdge.current + optimalAdjustment)
            );
        }
    }

    /**
     * Calculate cross-game risk correlations
     */
    calculateCrossGameRisks(gameTypes) {
        const riskMatrix = Matrix.zeros(gameTypes.length, gameTypes.length);
        
        for (let i = 0; i < gameTypes.length; i++) {
            for (let j = 0; j < gameTypes.length; j++) {
                if (i === j) {
                    riskMatrix.set(i, j, 1.0);
                } else {
                    // Calculate correlation based on game characteristics
                    const game1 = gameTypes[i];
                    const game2 = gameTypes[j];
                    const correlation = this.calculateGameCorrelation(game1, game2);
                    riskMatrix.set(i, j, correlation);
                }
            }
        }
        
        return riskMatrix;
    }

    /**
     * Calculate correlation between two games
     */
    calculateGameCorrelation(game1, game2) {
        const characteristics = {
            slots: [0.8, 0.9, 0.3, 0.7], // [luck, speed, skill, volatility]
            blackjack: [0.3, 0.5, 0.9, 0.4],
            roulette: [0.9, 0.7, 0.1, 0.6],
            plinko: [0.7, 0.6, 0.2, 0.8],
            crash: [0.6, 0.8, 0.4, 0.9]
        };
        
        const char1 = characteristics[game1] || [0.5, 0.5, 0.5, 0.5];
        const char2 = characteristics[game2] || [0.5, 0.5, 0.5, 0.5];
        
        // Calculate Pearson correlation
        return ss.sampleCorrelation(char1, char2);
    }

    /**
     * Utility methods
     */
    getMaxBetForGame(gameType) {
        const maxBets = {
            slots: 175000,
            blackjack: 500000,
            roulette: 10000000,
            plinko: 175000,
            crash: 175000
        };
        return maxBets[gameType] || 100000;
    }

    getGamePopularity(gameType) {
        // This would typically come from database metrics
        const popularity = {
            slots: 100,
            blackjack: 80,
            roulette: 60,
            plinko: 40,
            crash: 70
        };
        return popularity[gameType] || 50;
    }

    getRecentGameMetrics(gameType, timeframeSeconds) {
        // This would typically query the database
        // For now, return simulated metrics
        return {
            gameCount: secureRandomInt(10, 100),
            playerWinRate: secureRandomFloat(0.4, 0.6),
            totalHouseProfit: secureRandomFloat(-1000, 5000),
            averageSkillLevel: secureRandomFloat(0.3, 0.8),
            optimalBettingRatio: secureRandomFloat(0.1, 0.4),
            systemUsageRatio: secureRandomFloat(0.05, 0.3),
            cardCountingRatio: secureRandomFloat(0.01, 0.1),
            largeBetkRatio: secureRandomFloat(0.05, 0.2),
            highFrequencyPlayerRatio: secureRandomFloat(0.1, 0.3),
            professionalPlayerRatio: secureRandomFloat(0.02, 0.1),
            payoutHistory: Array.from({length: 50}, () => secureRandomFloat(-100, 200)),
            recentWinRates: Array.from({length: 10}, () => secureRandomFloat(0.4, 0.6)),
            recentProfits: Array.from({length: 10}, () => secureRandomFloat(-50, 100))
        };
    }

    adjustEdgeRapidly(gameType, adjustment) {
        const baseEdge = this.baseEdges.get(gameType);
        if (baseEdge) {
            baseEdge.current = Math.max(
                baseEdge.minimum,
                Math.min(baseEdge.maximum, baseEdge.current + adjustment)
            );
            
            console.log(`⚡ Rapid edge adjustment: ${gameType} ${adjustment > 0 ? '+' : ''}${(adjustment * 100).toFixed(3)}%`);
        }
    }

    /**
     * Get current edge for a game
     */
    getCurrentEdge(gameType) {
        const baseEdge = this.baseEdges.get(gameType);
        return baseEdge ? baseEdge.current : 0.025;
    }

    /**
     * Get comprehensive system status
     */
    getSystemStatus() {
        return {
            baseEdges: Object.fromEntries(this.baseEdges),
            adjustmentFactors: Object.fromEntries(this.adjustmentFactors),
            globalMetrics: this.globalMetrics,
            lastUpdate: new Date().toISOString(),
            isActive: true
        };
    }

    // ===============================================
    // COMPREHENSIVE BET SIZE ANALYSIS METHODS
    // ===============================================

    /**
     * Calculate absolute bet size factors (pure bet amount analysis)
     */
    calculateAbsoluteBetFactors(betAmount) {
        let adjustment = 0;
        let factors = [];
        
        // Micro stakes (under $100) - slightly reduce edge to encourage play
        if (betAmount < 100) {
            adjustment -= 0.001;
            factors.push('micro_stakes_incentive');
        }
        // Small stakes ($100-$1000) - normal edge
        else if (betAmount < 1000) {
            adjustment += 0.0005;
            factors.push('small_stakes_standard');
        }
        // Medium stakes ($1K-$10K) - slightly increase edge
        else if (betAmount < 10000) {
            adjustment += Math.log(betAmount / 1000) / Math.log(this.E) * 0.002;
            factors.push('medium_stakes_increase');
        }
        // High stakes ($10K-$100K) - significant edge increase
        else if (betAmount < 100000) {
            adjustment += Math.pow(betAmount / 10000, 1/this.PHI) * 0.005;
            factors.push('high_stakes_penalty');
        }
        // Whale stakes ($100K+) - maximum edge increase
        else {
            adjustment += Math.pow(betAmount / 100000, 1/2) * 0.01;
            factors.push('whale_stakes_maximum');
        }
        
        return { adjustment, factors, category: this.categorizeBetSize(betAmount) };
    }
    
    /**
     * Calculate relative bet size factors (compared to game averages)
     */
    calculateRelativeBetFactors(betAmount, gameType) {
        const gameStats = this.getGameTypeStatistics(gameType);
        const averageBet = gameStats.averageBet || 1000;
        const betRatio = betAmount / averageBet;
        
        let adjustment = 0;
        let factors = [];
        
        // Extremely above average (5x+ average) - heavy penalty
        if (betRatio > 5) {
            adjustment += Math.log(betRatio) / Math.log(this.E) * 0.008;
            factors.push('extreme_above_average');
        }
        // Well above average (2-5x average) - moderate penalty
        else if (betRatio > 2) {
            adjustment += (betRatio - 1) * 0.003;
            factors.push('well_above_average');
        }
        // Slightly above average (1.5-2x average) - small penalty
        else if (betRatio > 1.5) {
            adjustment += (betRatio - 1) * 0.001;
            factors.push('slightly_above_average');
        }
        // Below average - small bonus
        else if (betRatio < 0.5) {
            adjustment -= (1 - betRatio) * 0.0005;
            factors.push('below_average_bonus');
        }
        
        return { adjustment, factors, ratio: betRatio };
    }
    
    /**
     * Calculate bet progression factors (detecting betting patterns)
     */
    calculateBetProgressionFactors(betAmount, gameType) {
        let adjustment = 0;
        let factors = [];
        
        // Detect if this is part of a progression system
        const progressionRisk = this.detectProgressionSystem(betAmount, gameType);
        if (progressionRisk > 0.5) {
            adjustment += progressionRisk * 0.006;
            factors.push('progression_system_detected');
        }
        
        // Detect sudden bet size increases
        const sizeIncreaseRisk = this.detectSuddenBetIncrease(betAmount, gameType);
        if (sizeIncreaseRisk > 0.3) {
            adjustment += sizeIncreaseRisk * 0.004;
            factors.push('sudden_increase_detected');
        }
        
        return { adjustment, factors, progressionRisk, sizeIncreaseRisk };
    }
    
    /**
     * Calculate risk-adjusted bet factors
     */
    calculateRiskAdjustedBetFactors(betAmount, gameType) {
        let adjustment = 0;
        let factors = [];
        
        // Economic risk assessment
        const economicRisk = this.assessEconomicRisk(betAmount, gameType);
        if (economicRisk > 0.7) {
            adjustment += economicRisk * 0.007;
            factors.push('high_economic_risk');
        }
        
        // Volatility risk assessment
        const volatilityRisk = this.assessVolatilityRisk(betAmount, gameType);
        if (volatilityRisk > 0.6) {
            adjustment += volatilityRisk * 0.005;
            factors.push('high_volatility_risk');
        }
        
        // Liquidity risk assessment
        const liquidityRisk = this.assessLiquidityRisk(betAmount);
        if (liquidityRisk > 0.5) {
            adjustment += liquidityRisk * 0.003;
            factors.push('liquidity_risk');
        }
        
        return { adjustment, factors, economicRisk, volatilityRisk, liquidityRisk };
    }
    
    /**
     * Calculate game-specific bet factors
     */
    calculateGameSpecificBetFactors(betAmount, gameType) {
        let adjustment = 0;
        let factors = [];
        
        const gameConfig = this.baseEdges.get(gameType);
        if (!gameConfig) return { adjustment: 0, factors: [] };
        
        // Game volatility consideration
        switch (gameType) {
            case 'slots':
            case 'multi_slots':
            case 'matrix_slots':
                // High volatility games - increase edge for large bets
                if (betAmount > 5000) {
                    adjustment += Math.log(betAmount / 5000) / Math.log(this.E) * 0.004;
                    factors.push('high_volatility_game_penalty');
                }
                break;
                
            case 'blackjack':
                // Skill-based game - increase edge for large bets (potential card counting)
                if (betAmount > 10000) {
                    adjustment += Math.pow(betAmount / 10000, 1/3) * 0.006;
                    factors.push('skill_game_large_bet_penalty');
                }
                break;
                
            case 'roulette':
                // Pure chance game - moderate increase for large bets
                if (betAmount > 7500) {
                    adjustment += Math.sqrt(betAmount / 7500) * 0.003;
                    factors.push('chance_game_moderate_penalty');
                }
                break;
                
            case 'keno':
            case 'bingo':
                // High house edge games - smaller additional penalties
                if (betAmount > 2000) {
                    adjustment += (betAmount / 2000 - 1) * 0.002;
                    factors.push('high_edge_game_small_penalty');
                }
                break;
        }
        
        return { adjustment, factors };
    }
    
    /**
     * Calculate mathematical bet optimization factors
     */
    calculateMathematicalBetFactors(betAmount, gameType) {
        let adjustment = 0;
        let factors = [];
        
        // Golden ratio analysis
        const goldenRatioFactor = this.calculateGoldenRatioFactor(betAmount);
        if (Math.abs(goldenRatioFactor) > 0.1) {
            adjustment += goldenRatioFactor * 0.002;
            factors.push('golden_ratio_optimization');
        }
        
        // Fibonacci sequence detection
        const fibonacciFactor = this.calculateFibonacciFactor(betAmount);
        if (fibonacciFactor > 0.5) {
            adjustment += fibonacciFactor * 0.003;
            factors.push('fibonacci_sequence_detected');
        }
        
        // Power law distribution analysis
        const powerLawFactor = this.calculatePowerLawFactor(betAmount, gameType);
        if (powerLawFactor > 0.3) {
            adjustment += powerLawFactor * 0.004;
            factors.push('power_law_anomaly');
        }
        
        // Statistical outlier detection
        const outlierFactor = this.calculateOutlierFactor(betAmount, gameType);
        if (outlierFactor > 0.8) {
            adjustment += outlierFactor * 0.005;
            factors.push('statistical_outlier');
        }
        
        return { adjustment, factors, goldenRatioFactor, fibonacciFactor, powerLawFactor, outlierFactor };
    }

    // ===============================================
    // SUPPORTING ANALYSIS METHODS
    // ===============================================

    categorizeBetSize(betAmount) {
        if (betAmount < 100) return 'micro';
        if (betAmount < 1000) return 'small';
        if (betAmount < 10000) return 'medium';
        if (betAmount < 100000) return 'high';
        return 'whale';
    }

    getGameTypeStatistics(gameType) {
        // This would normally pull from historical data
        // For now, return reasonable defaults
        const defaults = {
            blackjack: { averageBet: 1200, standardDeviation: 800 },
            slots: { averageBet: 800, standardDeviation: 600 },
            roulette: { averageBet: 1500, standardDeviation: 1000 },
            plinko: { averageBet: 900, standardDeviation: 500 },
            poker: { averageBet: 2000, standardDeviation: 1200 }
        };
        return defaults[gameType] || { averageBet: 1000, standardDeviation: 700 };
    }

    detectProgressionSystem(betAmount, gameType) {
        // Simplified progression detection
        // In reality, this would analyze historical bet patterns
        if (betAmount > 5000 && betAmount % 500 === 0) return 0.6;
        if (betAmount > 10000 && betAmount % 1000 === 0) return 0.8;
        return 0.2;
    }

    detectSuddenBetIncrease(betAmount, gameType) {
        // Simplified detection - would normally compare to recent bet history
        if (betAmount > 20000) return 0.7;
        if (betAmount > 10000) return 0.4;
        return 0.1;
    }

    assessEconomicRisk(betAmount, gameType) {
        const totalRisk = betAmount / 1000000; // Risk relative to $1M
        return Math.min(1, totalRisk + this.globalMetrics.riskLevel);
    }

    assessVolatilityRisk(betAmount, gameType) {
        const volatilityMultiplier = {
            'slots': 1.2, 'multi_slots': 1.3, 'matrix_slots': 1.4,
            'blackjack': 0.8, 'roulette': 1.0, 'poker': 1.1
        };
        const multiplier = volatilityMultiplier[gameType] || 1.0;
        return Math.min(1, (betAmount / 50000) * multiplier);
    }

    assessLiquidityRisk(betAmount) {
        // Large bets pose liquidity risk
        return Math.min(1, betAmount / 500000);
    }

    calculateGoldenRatioFactor(betAmount) {
        const ratio = betAmount / (betAmount * this.PHI);
        const deviation = Math.abs(ratio - 1/this.PHI);
        return deviation < 0.05 ? 0.3 : 0;
    }

    calculateFibonacciFactor(betAmount) {
        const fibSequence = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181, 6765, 10946];
        const scaledFib = fibSequence.map(f => f * 100); // Scale to dollar amounts
        return scaledFib.includes(betAmount) ? 0.8 : 0;
    }

    calculatePowerLawFactor(betAmount, gameType) {
        // Check if bet follows power law distribution
        const exponent = 2.1; // Pareto distribution exponent
        const expectedValue = Math.pow(betAmount, -exponent);
        return expectedValue > 0.001 ? 0.5 : 0;
    }

    calculateOutlierFactor(betAmount, gameType) {
        const stats = this.getGameTypeStatistics(gameType);
        const zScore = Math.abs((betAmount - stats.averageBet) / stats.standardDeviation);
        return zScore > 3 ? Math.min(1, zScore / 5) : 0; // 3+ standard deviations
    }
}

module.exports = DynamicHouseEdgeSystem;