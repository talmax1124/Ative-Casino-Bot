/**
 * CASINO VOLATILITY MANAGEMENT SYSTEM
 * Advanced volatility control based on industry best practices
 * Manages win/loss streaks, session length, and player engagement optimization
 */

const logger = require('./logger');
const dbManager = require('./database');
const NodeCache = require('node-cache');
const moment = require('moment');
const { secureRandomInt, secureRandomFloat, secureRandomChoice, generateProvablyFairRandom } = require('./rng');

class VolatilityManager {
    constructor() {
        this.cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
        
        // Industry-standard volatility configurations
        this.volatilityConfig = {
            // Win/Loss Streak Management (Industry Best Practice: Prevent extreme streaks)
            streakLimits: {
                maxWinStreak: 7,        // Max consecutive wins before intervention
                maxLossStreak: 9,       // Max consecutive losses before intervention  
                interventionThreshold: 5 // Start monitoring at 5-streak
            },
            
            // Session Management (Optimize for player retention)
            sessionOptimization: {
                optimalLength: 2700,    // 45 minutes optimal session
                shortSession: 900,      // 15 minutes = short session
                longSession: 7200,      // 2 hours = long session  
                maxRecommended: 10800,  // 3 hours maximum recommended
                
                // Session outcome targets
                targetWinRate: 0.35,    // 35% sessions should end positive
                minBreakeven: 0.20,     // 20% sessions should break even
                maxCatastrophic: 0.05   // Max 5% should lose >50% of bankroll
            },
            
            // Volatility Tiers (Match different player preferences)
            volatilityTiers: {
                LOW: {
                    winFrequency: 0.45,     // 45% win rate
                    avgMultiplier: 1.8,     // Lower but more frequent wins
                    maxMultiplier: 5.0,     // Cap big wins
                    variance: 0.3           // Low variance
                },
                MEDIUM: {
                    winFrequency: 0.35,     // 35% win rate  
                    avgMultiplier: 2.2,     // Balanced multipliers
                    maxMultiplier: 20.0,    // Moderate big wins
                    variance: 0.6           // Medium variance
                },
                HIGH: {
                    winFrequency: 0.25,     // 25% win rate
                    avgMultiplier: 3.5,     // Higher multipliers
                    maxMultiplier: 100.0,   // Big win potential
                    variance: 1.0           // High variance
                }
            },
            
            // Near-Miss Management (Industry psychology technique)
            nearMissConfig: {
                frequency: 0.15,        // 15% of losses should be near-misses
                types: ['close_win', 'bonus_miss', 'jackpot_near'],
                psychologicalImpact: 0.3 // Boost engagement by 30%
            },
            
            // Adaptive Difficulty (Dynamic house edge)
            adaptiveDifficulty: {
                enabled: true,
                adjustmentRate: 0.001,  // 0.1% per adjustment
                maxAdjustment: 0.02,    // Max 2% adjustment
                cooldownPeriod: 300000  // 5 minute cooldown
            }
        };
        
        // Player session tracking
        this.playerSessions = new Map();
        this.playerStreaks = new Map();
        this.volatilityProfiles = new Map();
        
        this.initialize();
    }
    
    async initialize() {
        logger.info('📊 Initializing Volatility Management System...');
        
        // Start monitoring services (reasonable frequencies)
        setInterval(() => this.monitorPlayerSessions(), 600000);    // Every 10 minutes
        setInterval(() => this.manageStreakInterventions(), 300000); // Every 5 minutes
        setInterval(() => this.optimizeVolatilityProfiles(), 1800000); // Every 30 minutes
        
        logger.info('✅ Volatility Management System initialized');
    }
    
    /**
     * STREAK MANAGEMENT SYSTEM
     * Prevents extreme win/loss streaks that hurt retention
     */
    async managePlayerStreak(userId, gameResult) {
        let streak = this.playerStreaks.get(userId) || {
            current: 0,
            type: null,
            interventionsUsed: 0,
            lastGame: null
        };
        
        // Update streak based on game result
        if (gameResult.won) {
            if (streak.type === 'win') {
                streak.current++;
            } else {
                streak.current = 1;
                streak.type = 'win';
            }
        } else {
            if (streak.type === 'loss') {
                streak.current++;
            } else {
                streak.current = 1;
                streak.type = 'loss';
            }
        }
        
        streak.lastGame = Date.now();
        this.playerStreaks.set(userId, streak);
        
        // Check for intervention needs
        return await this.evaluateStreakIntervention(userId, streak);
    }
    
    async evaluateStreakIntervention(userId, streak) {
        const config = this.volatilityConfig.streakLimits;
        let intervention = { needed: false, type: null, adjustment: 0 };
        
        if (streak.type === 'loss' && streak.current >= config.maxLossStreak) {
            // Player on long losing streak - provide assistance
            intervention = {
                needed: true,
                type: 'LOSS_STREAK_RELIEF',
                adjustment: 0.15, // 15% win probability boost
                reason: `Player on ${streak.current}-game losing streak`,
                maxGames: 3
            };
            
            streak.interventionsUsed++;
            logger.info(`🎯 Loss streak intervention for ${userId}: ${streak.current} losses`);
            
        } else if (streak.type === 'win' && streak.current >= config.maxWinStreak) {
            // Player on long winning streak - subtle resistance
            intervention = {
                needed: true,
                type: 'WIN_STREAK_BALANCE',
                adjustment: -0.10, // 10% win probability reduction
                reason: `Player on ${streak.current}-game winning streak`,
                maxGames: 2
            };
            
            logger.info(`⚖️ Win streak balancing for ${userId}: ${streak.current} wins`);
        }
        
        return intervention;
    }
    
    /**
     * SESSION OPTIMIZATION SYSTEM
     * Manages session length and outcomes for optimal retention
     */
    async optimizeSession(userId, currentSession) {
        const config = this.volatilityConfig.sessionOptimization;
        const sessionLength = Date.now() - currentSession.startTime;
        const sessionOutcome = this.calculateSessionOutcome(currentSession);
        
        let optimization = { adjustments: [], recommendations: [] };
        
        // Session length optimization
        if (sessionLength > config.longSession && sessionOutcome.netLoss > currentSession.startingBalance * 0.3) {
            // Long session with significant losses - encourage break
            optimization.recommendations.push({
                type: 'BREAK_SUGGESTION',
                message: 'Consider taking a break - fresh perspective often helps!',
                incentive: 'small_bonus_on_return'
            });
        }
        
        // Session outcome optimization
        if (sessionLength > config.optimalLength) {
            const targetOutcome = this.calculateTargetOutcome(currentSession, config);
            
            if (sessionOutcome.performance < targetOutcome.minimum) {
                // Session performing below target - provide boost
                optimization.adjustments.push({
                    type: 'SESSION_RECOVERY',
                    winBoost: 0.12,
                    multiplierBoost: 1.08,
                    duration: 600000 // 10 minutes
                });
            }
        }
        
        return optimization;
    }
    
    /**
     * VOLATILITY TIER SYSTEM
     * Assigns and manages player volatility preferences
     */
    async assignVolatilityTier(userId, playerBehavior) {
        const tiers = this.volatilityConfig.volatilityTiers;
        let assignedTier = 'MEDIUM'; // Default
        
        // Analyze player preferences from behavior
        if (playerBehavior.avgBetSize < playerBehavior.avgBalance * 0.02) {
            // Conservative player - prefers low volatility
            assignedTier = 'LOW';
        } else if (playerBehavior.avgBetSize > playerBehavior.avgBalance * 0.10) {
            // Aggressive player - prefers high volatility  
            assignedTier = 'HIGH';
        }
        
        // Consider session patterns
        if (playerBehavior.avgSessionLength < 1800) { // 30 minutes
            // Short sessions - prefer quick results (higher volatility)
            assignedTier = assignedTier === 'LOW' ? 'MEDIUM' : 'HIGH';
        }
        
        // Store volatility profile
        this.volatilityProfiles.set(userId, {
            tier: assignedTier,
            config: tiers[assignedTier],
            lastUpdated: Date.now(),
            behaviorBasis: playerBehavior
        });
        
        logger.info(`📊 Volatility tier assigned for ${userId}: ${assignedTier}`);
        return assignedTier;
    }
    
    /**
     * NEAR-MISS GENERATION
     * Creates psychologically engaging near-miss experiences
     */
    generateNearMiss(gameType, actualResult, playerTier = 'MEDIUM') {
        const config = this.volatilityConfig.nearMissConfig;
        
        // Only generate near-miss for losses
        if (actualResult.won || secureRandomFloat() > config.frequency) {
            return null;
        }
        
        const nearMissTypes = {
            'close_win': this.createCloseWin(gameType, actualResult),
            'bonus_miss': this.createBonusMiss(gameType, actualResult), 
            'jackpot_near': this.createJackpotNear(gameType, actualResult)
        };
        
        const selectedType = config.types[secureRandomInt(0, config.types.length)];
        return nearMissTypes[selectedType];
    }
    
    /**
     * ADAPTIVE DIFFICULTY SYSTEM
     * Dynamically adjusts difficulty based on player performance
     */
    async calculateAdaptiveDifficulty(userId, gameType, recentPerformance) {
        if (!this.volatilityConfig.adaptiveDifficulty.enabled) {
            return 0; // No adjustment
        }
        
        const lastAdjustment = this.cache.get(`last_difficulty_${userId}_${gameType}`) || 0;
        const cooldown = this.volatilityConfig.adaptiveDifficulty.cooldownPeriod;
        
        if (Date.now() - lastAdjustment < cooldown) {
            return 0; // Still in cooldown
        }
        
        let adjustment = 0;
        const config = this.volatilityConfig.adaptiveDifficulty;
        
        // Calculate adjustment based on recent performance
        if (recentPerformance.winRate > 0.60) {
            // Player winning too much - increase difficulty
            adjustment = Math.min(config.maxAdjustment, config.adjustmentRate * 5);
        } else if (recentPerformance.winRate < 0.20) {
            // Player losing too much - decrease difficulty
            adjustment = Math.max(-config.maxAdjustment, -config.adjustmentRate * 5);
        }
        
        if (adjustment !== 0) {
            this.cache.set(`last_difficulty_${userId}_${gameType}`, Date.now());
            logger.debug(`🎚️ Adaptive difficulty for ${userId} in ${gameType}: ${(adjustment * 100).toFixed(2)}%`);
        }
        
        return adjustment;
    }
    
    /**
     * PUBLIC API METHODS
     */
    
    async processGameResult(userId, gameType, gameResult) {
        // Update session tracking
        await this.updatePlayerSession(userId, gameResult);
        
        // Manage streaks
        const streakIntervention = await this.managePlayerStreak(userId, gameResult);
        
        // Get volatility profile
        const volatilityProfile = this.volatilityProfiles.get(userId);
        
        // Generate near-miss if applicable
        const nearMiss = this.generateNearMiss(gameType, gameResult, volatilityProfile?.tier);
        
        return {
            streakIntervention,
            nearMiss,
            volatilityTier: volatilityProfile?.tier || 'MEDIUM',
            sessionOptimizations: await this.getSessionOptimizations(userId)
        };
    }
    
    async getVolatilityAdjustments(userId, gameType, baseMultiplier) {
        const profile = this.volatilityProfiles.get(userId);
        const recentPerformance = await this.getRecentPerformance(userId);
        
        let adjustments = {
            multiplier: baseMultiplier,
            winProbability: 0, // No adjustment by default
            difficultyAdjustment: 0
        };
        
        // Apply volatility tier adjustments
        if (profile) {
            const tierConfig = profile.config;
            adjustments.multiplier *= (tierConfig.avgMultiplier / 2.2); // Normalize to medium tier
            adjustments.winProbability = (tierConfig.winFrequency - 0.35); // Adjust from medium baseline
        }
        
        // Apply adaptive difficulty
        adjustments.difficultyAdjustment = await this.calculateAdaptiveDifficulty(userId, gameType, recentPerformance);
        
        // Apply streak interventions
        const streak = this.playerStreaks.get(userId);
        if (streak && streak.interventionActive) {
            adjustments.winProbability += streak.interventionAdjustment || 0;
        }
        
        return adjustments;
    }
    
    async getPlayerVolatilityReport(userId) {
        const profile = this.volatilityProfiles.get(userId);
        const streak = this.playerStreaks.get(userId);
        const session = this.playerSessions.get(userId);
        
        return {
            volatilityTier: profile?.tier || 'UNKNOWN',
            currentStreak: streak?.current || 0,
            streakType: streak?.type || 'none',
            sessionLength: session ? Date.now() - session.startTime : 0,
            interventionsActive: (streak?.interventionActive || false),
            lastUpdated: Date.now()
        };
    }
    
    /**
     * MONITORING SERVICES
     */
    async monitorPlayerSessions() {
        for (const [userId, session] of this.playerSessions.entries()) {
            if (Date.now() - session.lastActivity > 1800000) { // 30 minutes inactive
                await this.endPlayerSession(userId, 'TIMEOUT');
            } else {
                // Check for session optimizations
                const optimizations = await this.optimizeSession(userId, session);
                if (optimizations.recommendations.length > 0) {
                    // Would send recommendations to player here
                    logger.debug(`Session recommendations for ${userId}:`, optimizations.recommendations);
                }
            }
        }
    }
    
    async manageStreakInterventions() {
        for (const [userId, streak] of this.playerStreaks.entries()) {
            if (streak.interventionActive && Date.now() - streak.interventionStart > 600000) {
                // Intervention expired (10 minutes)
                streak.interventionActive = false;
                streak.interventionAdjustment = 0;
                this.playerStreaks.set(userId, streak);
            }
        }
    }
    
    async optimizeVolatilityProfiles() {
        // Periodically update player volatility profiles based on behavior
        for (const [userId, profile] of this.volatilityProfiles.entries()) {
            if (Date.now() - profile.lastUpdated > 3600000) { // 1 hour
                const recentBehavior = await this.analyzeRecentBehavior(userId);
                if (recentBehavior) {
                    await this.assignVolatilityTier(userId, recentBehavior);
                }
            }
        }
    }
    
    /**
     * UTILITY METHODS - Placeholder implementations
     */
    calculateSessionOutcome(session) { return { netLoss: 0, performance: 0.5 }; }
    calculateTargetOutcome(session, config) { return { minimum: 0.3 }; }
    createCloseWin(gameType, result) { return { type: 'close_win', message: 'So close!' }; }
    createBonusMiss(gameType, result) { return { type: 'bonus_miss', message: 'Almost bonus!' }; }
    createJackpotNear(gameType, result) { return { type: 'jackpot_near', message: 'Nearly jackpot!' }; }
    async updatePlayerSession(userId, gameResult) { }
    async getSessionOptimizations(userId) { return []; }
    async getRecentPerformance(userId) { return { winRate: 0.35 }; }
    async endPlayerSession(userId, reason) { }
    async analyzeRecentBehavior(userId) { return null; }
    
    destroy() {
        this.cache.close();
        logger.info('Volatility Manager destroyed');
    }
}

module.exports = new VolatilityManager();