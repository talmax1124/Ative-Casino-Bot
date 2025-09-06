/**
 * INDUSTRY-STANDARD ECONOMIC STABILIZER
 * Advanced casino economy management based on 2025 best practices
 * Implements sophisticated house edge management, RTP optimization, and player retention strategies
 */

const logger = require('./logger');
const dbManager = require('./database');
const NodeCache = require('node-cache');
const { Decimal } = require('decimal.js');
const moment = require('moment');

class IndustryStandardStabilizer {
    constructor() {
        this.cache = new NodeCache({ stdTTL: 300, checkperiod: 60, useClones: false });
        
        // Industry-standard casino configurations based on research
        this.industryStandards = {
            // Optimal House Edge Ranges (Industry Best Practices)
            optimalHouseEdges: {
                blackjack: { min: 0.015, target: 0.025, max: 0.040 }, // 1.5% - 4%
                roulette: { min: 0.027, target: 0.054, max: 0.070 },  // 2.7% - 7%
                slots: { min: 0.020, target: 0.050, max: 0.150 },     // 2% - 15%
                plinko: { min: 0.030, target: 0.060, max: 0.120 },    // 3% - 12%
                crash: { min: 0.010, target: 0.030, max: 0.050 },     // 1% - 5%
                keno: { min: 0.250, target: 0.300, max: 0.400 },      // 25% - 40%
                scratchcards: { min: 0.200, target: 0.300, max: 0.500 } // 20% - 50%
            },
            
            // Player Retention Optimization (Based on Casino Research)
            playerRetention: {
                maxLossStreak: 8,           // Max losses before intervention
                minWinFrequency: 0.25,      // 25% minimum win rate for engagement
                optimalSessionLength: 45,   // 45 minutes optimal session
                maxSessionLength: 180,      // 3 hours maximum recommended
                volatilityBalance: 0.30,    // 30% high-variance, 70% low-variance
            },
            
            // Economic Health Indicators (Industry Benchmarks)
            healthBenchmarks: {
                dailyRevenue: {
                    excellent: 0.08,    // 8% of total economy daily
                    good: 0.05,         // 5% of total economy daily  
                    warning: 0.02,      // 2% of total economy daily
                    critical: -0.01     // Losing money
                },
                playerActivity: {
                    excellent: 0.70,    // 70% of users active weekly
                    good: 0.50,         // 50% of users active weekly
                    warning: 0.30,      // 30% of users active weekly
                    critical: 0.20      // 20% of users active weekly
                },
                wealthDistribution: {
                    healthy: 0.65,      // Top 10% own 65% of wealth
                    concerning: 0.80,   // Top 10% own 80% of wealth
                    critical: 0.90      // Top 10% own 90% of wealth
                }
            },
            
            // Dynamic Adjustment Factors
            adjustmentFactors: {
                houseEdgeStep: 0.002,       // 0.2% adjustment steps
                multiplierStep: 0.05,       // 5% multiplier adjustments
                maxAdjustmentRate: 0.10,    // Max 10% change per adjustment
                adjustmentCooldown: 300000, // 5 minutes between adjustments
            }
        };
        
        // Game-specific configurations
        this.gameConfigurations = new Map();
        
        // Player engagement tracking
        this.playerEngagement = new Map();
        
        // Real-time metrics
        this.realtimeMetrics = {
            housingPerformance: {},
            playerSatisfaction: {},
            economicHealth: 100
        };
        
        this.initialize();
    }
    
    async initialize() {
        logger.info('🏛️ Initializing Industry-Standard Economic Stabilizer...');
        
        // Initialize game configurations with industry standards
        await this.initializeGameConfigurations();
        
        // Start monitoring intervals
        this.startMonitoringServices();
        
        logger.info('✅ Industry-Standard Economic Stabilizer initialized');
    }
    
    async initializeGameConfigurations() {
        // Set up each game with industry-standard configurations
        for (const [gameType, config] of Object.entries(this.industryStandards.optimalHouseEdges)) {
            this.gameConfigurations.set(gameType, {
                currentHouseEdge: config.target,
                targetHouseEdge: config.target,
                minHouseEdge: config.min,
                maxHouseEdge: config.max,
                lastAdjustment: 0,
                performanceMetrics: {
                    dailyRevenue: 0,
                    playerRetention: 0,
                    avgSessionLength: 0,
                    satisfactionScore: 80
                }
            });
        }
    }
    
    startMonitoringServices() {
        // Real-time performance monitoring (every 15 minutes)
        setInterval(() => this.monitorRealtimePerformance(), 900000);
        
        // House edge optimization (every 30 minutes)
        setInterval(() => this.optimizeHouseEdges(), 1800000);
        
        // Player engagement analysis (every 10 minutes)
        setInterval(() => this.analyzePlayerEngagement(), 600000);
        
        // Economic health assessment (every 10 minutes)
        setInterval(() => this.assessEconomicHealth(), 600000);
        
        // Long-term trend analysis (every 30 minutes)
        setInterval(() => this.analyzeLongTermTrends(), 1800000);
    }
    
    /**
     * REAL-TIME PERFORMANCE MONITORING
     * Monitors key metrics continuously for immediate adjustments
     */
    async monitorRealtimePerformance() {
        try {
            const realtimeData = await this.gatherRealtimeMetrics();
            
            // Update real-time metrics
            this.realtimeMetrics = {
                ...this.realtimeMetrics,
                ...realtimeData,
                timestamp: Date.now()
            };
            
            // Check for immediate intervention needs
            await this.checkInterventionNeeds(realtimeData);
            
        } catch (error) {
            logger.error(`Real-time monitoring failed: ${error.message}`);
        }
    }
    
    /**
     * DYNAMIC HOUSE EDGE OPTIMIZATION
     * Automatically adjusts house edges based on performance and player behavior
     */
    async optimizeHouseEdges() {
        try {
            for (const [gameType, config] of this.gameConfigurations.entries()) {
                const performance = await this.analyzeGamePerformance(gameType);
                const playerFeedback = await this.getPlayerFeedback(gameType);
                
                const adjustmentNeeded = this.calculateHouseEdgeAdjustment(performance, playerFeedback, config);
                
                if (adjustmentNeeded.shouldAdjust) {
                    await this.applyHouseEdgeAdjustment(gameType, adjustmentNeeded);
                    
                    logger.info(`🎯 House edge adjusted for ${gameType}: ${adjustmentNeeded.from.toFixed(3)} → ${adjustmentNeeded.to.toFixed(3)} (${adjustmentNeeded.reason})`);
                }
            }
            
        } catch (error) {
            logger.error(`House edge optimization failed: ${error.message}`);
        }
    }
    
    /**
     * PLAYER ENGAGEMENT ANALYSIS
     * Monitors player satisfaction and engagement metrics
     */
    async analyzePlayerEngagement() {
        try {
            const engagementData = await this.gatherEngagementMetrics();
            
            // Update player engagement tracking
            for (const [userId, metrics] of Object.entries(engagementData.players)) {
                this.playerEngagement.set(userId, {
                    ...this.playerEngagement.get(userId) || {},
                    ...metrics,
                    lastUpdated: Date.now()
                });
                
                // Check for players at risk of churning
                if (metrics.churnRisk > 0.7) {
                    await this.implementRetentionStrategy(userId, metrics);
                }
            }
            
            // Update global engagement metrics
            this.realtimeMetrics.playerSatisfaction = engagementData.overall;
            
        } catch (error) {
            logger.error(`Player engagement analysis failed: ${error.message}`);
        }
    }
    
    /**
     * ECONOMIC HEALTH ASSESSMENT
     * Comprehensive health check against industry benchmarks
     */
    async assessEconomicHealth() {
        try {
            const healthMetrics = await this.calculateHealthMetrics();
            const benchmarks = this.industryStandards.healthBenchmarks;
            
            let healthScore = 100;
            const healthFactors = [];
            
            // Assess daily revenue performance
            const revenueRatio = healthMetrics.dailyRevenue / healthMetrics.totalEconomy;
            if (revenueRatio >= benchmarks.dailyRevenue.excellent) {
                healthFactors.push({ factor: 'revenue', score: 100, status: 'excellent' });
            } else if (revenueRatio >= benchmarks.dailyRevenue.good) {
                healthFactors.push({ factor: 'revenue', score: 80, status: 'good' });
                healthScore -= 10;
            } else if (revenueRatio >= benchmarks.dailyRevenue.warning) {
                healthFactors.push({ factor: 'revenue', score: 60, status: 'warning' });
                healthScore -= 25;
            } else {
                healthFactors.push({ factor: 'revenue', score: 30, status: 'critical' });
                healthScore -= 40;
            }
            
            // Assess player activity
            if (healthMetrics.activePlayerRatio >= benchmarks.playerActivity.excellent) {
                healthFactors.push({ factor: 'activity', score: 100, status: 'excellent' });
            } else if (healthMetrics.activePlayerRatio >= benchmarks.playerActivity.good) {
                healthFactors.push({ factor: 'activity', score: 80, status: 'good' });
                healthScore -= 5;
            } else if (healthMetrics.activePlayerRatio >= benchmarks.playerActivity.warning) {
                healthFactors.push({ factor: 'activity', score: 60, status: 'warning' });
                healthScore -= 15;
            } else {
                healthFactors.push({ factor: 'activity', score: 40, status: 'critical' });
                healthScore -= 30;
            }
            
            // Assess wealth distribution
            if (healthMetrics.wealthConcentration <= benchmarks.wealthDistribution.healthy) {
                healthFactors.push({ factor: 'distribution', score: 100, status: 'healthy' });
            } else if (healthMetrics.wealthConcentration <= benchmarks.wealthDistribution.concerning) {
                healthFactors.push({ factor: 'distribution', score: 70, status: 'concerning' });
                healthScore -= 10;
            } else {
                healthFactors.push({ factor: 'distribution', score: 40, status: 'critical' });
                healthScore -= 25;
            }
            
            this.realtimeMetrics.economicHealth = Math.max(0, Math.min(100, healthScore));
            
            // Cache detailed health assessment
            this.cache.set('health_assessment', {
                overallScore: this.realtimeMetrics.economicHealth,
                factors: healthFactors,
                metrics: healthMetrics,
                timestamp: Date.now()
            });
            
        } catch (error) {
            logger.error(`Economic health assessment failed: ${error.message}`);
        }
    }
    
    /**
     * PLAYER RETENTION STRATEGIES
     * Implements retention strategies based on player behavior
     */
    async implementRetentionStrategy(userId, playerMetrics) {
        const strategy = this.selectRetentionStrategy(playerMetrics);
        
        switch (strategy.type) {
            case 'REDUCE_HOUSE_EDGE':
                // Temporarily reduce house edge for this player
                await this.applyPlayerSpecificAdjustment(userId, {
                    houseEdgeReduction: 0.01, // 1% reduction
                    duration: 3600000, // 1 hour
                    reason: 'retention_strategy'
                });
                break;
                
            case 'INCREASE_WIN_FREQUENCY':
                // Slightly increase win probability for next few games
                await this.applyPlayerSpecificAdjustment(userId, {
                    winBoost: 0.05, // 5% win probability boost
                    maxGames: 10,
                    reason: 'engagement_boost'
                });
                break;
                
            case 'BONUS_INCENTIVE':
                // Award small bonus to re-engage
                await this.awardRetentionBonus(userId, strategy.amount);
                break;
                
            case 'PERSONALIZED_EXPERIENCE':
                // Adjust game recommendations and limits
                await this.personalizeExperience(userId, playerMetrics);
                break;
        }
        
        logger.info(`🎯 Retention strategy applied for ${userId}: ${strategy.type}`);
    }
    
    /**
     * ADVANCED MULTIPLIER MANAGEMENT
     * Industry-standard multiplier optimization
     */
    async optimizeMultipliers(gameType, userId, baseMultiplier) {
        const gameConfig = this.gameConfigurations.get(gameType);
        const playerData = this.playerEngagement.get(userId);
        const economicHealth = this.realtimeMetrics.economicHealth;
        
        let adjustedMultiplier = baseMultiplier;
        let adjustmentReasons = [];
        
        // 1. Economic Health Adjustment
        if (economicHealth < 60) {
            // Economy struggling - reduce multipliers
            adjustedMultiplier *= 0.85;
            adjustmentReasons.push('economic_health');
        } else if (economicHealth > 90) {
            // Economy healthy - can afford slight boost for engagement
            adjustedMultiplier *= 1.05;
            adjustmentReasons.push('healthy_economy');
        }
        
        // 2. Game-Specific House Edge Adjustment
        if (gameConfig) {
            const houseEdgeAdjustment = 1 - (gameConfig.currentHouseEdge - gameConfig.targetHouseEdge);
            adjustedMultiplier *= houseEdgeAdjustment;
            if (Math.abs(houseEdgeAdjustment - 1) > 0.01) {
                adjustmentReasons.push('house_edge_optimization');
            }
        }
        
        // 3. Player Retention Adjustment
        if (playerData && playerData.churnRisk > 0.6) {
            // Player at risk of churning - provide small boost
            adjustedMultiplier *= 1.08;
            adjustmentReasons.push('retention_boost');
        }
        
        // 4. Industry Volatility Standards
        const volatilityFactor = this.calculateVolatilityFactor(gameType);
        adjustedMultiplier *= volatilityFactor;
        
        // Ensure multiplier doesn't go below minimum thresholds
        adjustedMultiplier = Math.max(adjustedMultiplier, baseMultiplier * 0.1);
        
        return {
            multiplier: adjustedMultiplier,
            baseMultiplier: baseMultiplier,
            adjustmentReasons,
            reductionPercentage: ((baseMultiplier - adjustedMultiplier) / baseMultiplier) * 100
        };
    }
    
    /**
     * PUBLIC API METHODS
     */
    
    async getGameMultiplierAdjustment(gameType, userId, baseMultiplier) {
        return await this.optimizeMultipliers(gameType, userId, baseMultiplier);
    }
    
    async getHouseEdgeRecommendation(gameType) {
        const gameConfig = this.gameConfigurations.get(gameType);
        return gameConfig ? gameConfig.currentHouseEdge : null;
    }
    
    async getEconomicDashboard() {
        return {
            timestamp: Date.now(),
            overallHealth: this.realtimeMetrics.economicHealth,
            gamePerformance: Object.fromEntries(this.gameConfigurations),
            playerEngagement: this.realtimeMetrics.playerSatisfaction,
            healthAssessment: this.cache.get('health_assessment'),
            industryBenchmarks: this.industryStandards.healthBenchmarks
        };
    }
    
    async reportGameResult(userId, gameType, gameResult) {
        // Update game configuration metrics
        const gameConfig = this.gameConfigurations.get(gameType);
        if (gameConfig) {
            // Update performance metrics
            gameConfig.performanceMetrics.dailyRevenue += gameResult.netRevenue || 0;
        }
        
        // Update player engagement metrics
        const engagement = this.playerEngagement.get(userId) || {};
        engagement.lastActivity = Date.now();
        engagement.gamesPlayed = (engagement.gamesPlayed || 0) + 1;
        engagement.totalWagered = (engagement.totalWagered || 0) + gameResult.betAmount;
        
        if (gameResult.won) {
            engagement.wins = (engagement.wins || 0) + 1;
            engagement.totalWon = (engagement.totalWon || 0) + gameResult.payout;
        }
        
        this.playerEngagement.set(userId, engagement);
    }
    
    /**
     * UTILITY METHODS - Placeholder implementations
     */
    async gatherRealtimeMetrics() { return {}; }
    async checkInterventionNeeds(data) { }
    async analyzeGamePerformance(gameType) { return {}; }
    async getPlayerFeedback(gameType) { return {}; }
    calculateHouseEdgeAdjustment(performance, feedback, config) { return { shouldAdjust: false }; }
    async applyHouseEdgeAdjustment(gameType, adjustment) { }
    async gatherEngagementMetrics() { return { players: {}, overall: {} }; }
    async calculateHealthMetrics() { return {}; }
    selectRetentionStrategy(metrics) { return { type: 'NONE' }; }
    async applyPlayerSpecificAdjustment(userId, adjustment) { }
    async awardRetentionBonus(userId, amount) { }
    async personalizeExperience(userId, metrics) { }
    calculateVolatilityFactor(gameType) { return 1.0; }
    async analyzeLongTermTrends() { }
    
    destroy() {
        this.cache.close();
        logger.info('Industry-Standard Economic Stabilizer destroyed');
    }
}

module.exports = new IndustryStandardStabilizer();