/**
 * ADVANCED TREND ADJUSTER - Real-time Win Rate & House Edge Control
 * 
 * This system monitors player patterns and automatically adjusts:
 * - Win rates based on detected strategies
 * - House edge based on exploitation attempts
 * - Difficulty based on player skill level
 * - Payouts based on economic impact
 * 
 * All adjustments are invisible to players and applied mathematically
 */

const logger = require('./logger');
const { secureRandomFloat } = require('./rng');

class AdvancedTrendAdjuster {
    constructor() {
        // Real-time adjustment tracking
        this.activeAdjustments = new Map();
        this.playerProfiles = new Map();
        this.gameMetrics = new Map();
        
        // Configuration for aggressive adjustments
        this.config = {
            // Base house edges by game
            baseHouseEdge: {
                'blackjack': 0.08,      // 8% base (increased from 1%)
                'roulette': 0.027,      // 2.7% base
                'slots': 0.05,          // 5% base
                'crash': 0.03,          // 3% base
                'plinko': 0.04,         // 4% base
                'mines': 0.03,          // 3% base
                'rps': 0.02,            // 2% base
                'dice': 0.02,           // 2% base
                'ceelo': 0.025,         // 2.5% base
                'default': 0.03        // 3% for unknown games
            },
            
            // Adjustment factors
            adjustmentFactors: {
                // Pattern-based adjustments
                sequential: 0.15,       // +15% for sequential patterns
                cyclic: 0.12,          // +12% for cyclic patterns
                clustering: 0.10,      // +10% for clustering
                markov: 0.18,          // +18% for Markov chains
                
                // Behavior-based adjustments
                cardCounting: 0.25,    // +25% for card counting
                martingale: 0.20,      // +20% for Martingale betting
                exploitation: 0.30,    // +30% for exploit attempts
                optimal: 0.15,         // +15% for optimal play
                
                // Risk-based adjustments
                highRoller: 0.08,      // +8% for high stakes
                consistent: 0.05,      // +5% for consistent winners
                lucky: 0.10,           // +10% for lucky streaks
                suspicious: 0.35       // +35% for suspicious activity
            },
            
            // Win rate modifiers
            winRateModifiers: {
                base: 0.42,            // Base 42% win rate (decreased from 48%)
                minimum: 0.15,         // Never below 15%
                maximum: 0.55,         // Never above 55% (decreased from 65%)
                
                // Skill-based modifiers for blackjack specifically
                novice: 0.45,          // 45% for new players (decreased from 52%)
                intermediate: 0.38,    // 38% for regular players (decreased from 45%)
                expert: 0.30,          // 30% for skilled players (decreased from 38%)
                exploiter: 0.18        // 18% for exploiters (decreased from 20%)
            },
            
            // Thresholds for detection
            detectionThresholds: {
                winStreak: 5,          // 5 wins in a row
                profitRatio: 1.5,      // 150% profit ratio
                betVariance: 0.8,      // 80% bet variance
                playSpeed: 10,         // 10 games per minute
                accuracy: 0.75         // 75% optimal play accuracy
            },
            
            // Decay rates
            decayRates: {
                adjustment: 0.01,      // 1% decay per hour
                profile: 0.005,        // 0.5% profile decay per day
                metric: 0.02           // 2% metric decay per hour
            }
        };
        
        // Start periodic updates
        this.startPeriodicUpdates();
        
        logger.info('🎯 Advanced Trend Adjuster initialized with aggressive controls');
    }
    
    /**
     * Get adjusted win rate for a player in a specific game
     */
    async getAdjustedWinRate(userId, gameType, baseWinRate = null) {
        try {
            // Get or create player profile
            const profile = await this.getPlayerProfile(userId);
            
            // Get game-specific metrics
            const metrics = this.getGameMetrics(gameType);
            
            // Start with base win rate
            let winRate = baseWinRate || this.config.winRateModifiers.base;
            
            // Apply skill-based modifier
            winRate = this.applySkillModifier(winRate, profile.skillLevel);
            
            // Apply pattern-based adjustments
            if (profile.detectedPatterns.size > 0) {
                winRate = this.applyPatternPenalties(winRate, profile.detectedPatterns);
            }
            
            // Apply streak penalties
            if (profile.currentStreak > this.config.detectionThresholds.winStreak) {
                const streakPenalty = Math.min(profile.currentStreak * 0.02, 0.3); // Max 30% penalty
                winRate *= (1 - streakPenalty);
                logger.info(`🎰 Streak penalty applied for ${userId}: -${(streakPenalty * 100).toFixed(1)}%`);
            }
            
            // Apply profit ratio penalties
            if (profile.profitRatio > this.config.detectionThresholds.profitRatio) {
                const profitPenalty = Math.min((profile.profitRatio - 1) * 0.1, 0.25); // Max 25% penalty
                winRate *= (1 - profitPenalty);
                logger.info(`💰 Profit penalty applied for ${userId}: -${(profitPenalty * 100).toFixed(1)}%`);
            }
            
            // Apply game-specific adjustments
            const gameAdjustment = this.activeAdjustments.get(`${gameType}_${userId}`) || 0;
            winRate *= (1 - gameAdjustment);
            
            // Special blackjack adjustment - additional 15% reduction
            if (gameType === 'blackjack') {
                winRate *= 0.85; // Additional 15% reduction specifically for blackjack
                logger.debug(`🃏 Blackjack-specific adjustment applied: -15%`);
            }
            
            // Ensure within bounds
            winRate = Math.max(this.config.winRateModifiers.minimum, 
                              Math.min(this.config.winRateModifiers.maximum, winRate));
            
            // Log significant adjustments
            const totalAdjustment = ((baseWinRate || this.config.winRateModifiers.base) - winRate) / 
                                    (baseWinRate || this.config.winRateModifiers.base);
            if (Math.abs(totalAdjustment) > 0.1) {
                logger.warn(`⚡ Significant win rate adjustment for ${userId} in ${gameType}: ${(winRate * 100).toFixed(1)}% (${totalAdjustment > 0 ? '-' : '+'}${Math.abs(totalAdjustment * 100).toFixed(1)}%)`);
            }
            
            return winRate;
            
        } catch (error) {
            logger.error(`Error calculating adjusted win rate: ${error.message}`);
            return baseWinRate || this.config.winRateModifiers.base;
        }
    }
    
    /**
     * Get adjusted house edge for a game
     */
    async getAdjustedHouseEdge(userId, gameType, patterns = null) {
        try {
            // Start with base house edge
            let houseEdge = this.config.baseHouseEdge[gameType] || this.config.baseHouseEdge.default;
            
            // Get player profile
            const profile = await this.getPlayerProfile(userId);
            
            // Apply pattern-based adjustments
            if (patterns) {
                for (const [patternType, data] of Object.entries(patterns)) {
                    if (data.detected && data.confidence > 0.5) {
                        const adjustment = this.config.adjustmentFactors[patternType] || 0;
                        houseEdge += adjustment * data.confidence;
                        logger.info(`📊 Pattern adjustment for ${patternType}: +${(adjustment * data.confidence * 100).toFixed(2)}%`);
                    }
                }
            }
            
            // Apply behavior-based adjustments
            if (profile.suspiciousActivity) {
                houseEdge += this.config.adjustmentFactors.suspicious;
                logger.warn(`🚨 Suspicious activity adjustment for ${userId}: +${(this.config.adjustmentFactors.suspicious * 100).toFixed(1)}%`);
            }
            
            // Apply exploitation penalties
            if (profile.exploitAttempts > 0) {
                const exploitPenalty = Math.min(profile.exploitAttempts * 0.1, 0.5); // Max 50%
                houseEdge += exploitPenalty;
                logger.warn(`⚠️ Exploit penalty for ${userId}: +${(exploitPenalty * 100).toFixed(1)}%`);
            }
            
            // Apply high roller adjustments
            if (profile.averageBet > 100000) {
                houseEdge += this.config.adjustmentFactors.highRoller;
            }
            
            // Apply consistency penalties
            if (profile.consistencyScore > 0.7) {
                houseEdge += this.config.adjustmentFactors.consistent;
            }
            
            // Cap maximum house edge at 50%
            houseEdge = Math.min(houseEdge, 0.5);
            
            // Store the adjustment
            this.activeAdjustments.set(`${gameType}_${userId}_edge`, houseEdge);
            
            // Log significant edges
            if (houseEdge > 0.1) {
                logger.warn(`🏠 High house edge for ${userId} in ${gameType}: ${(houseEdge * 100).toFixed(2)}%`);
            }
            
            return houseEdge;
            
        } catch (error) {
            logger.error(`Error calculating adjusted house edge: ${error.message}`);
            return this.config.baseHouseEdge[gameType] || this.config.baseHouseEdge.default;
        }
    }
    
    /**
     * Apply pattern penalties to win rate
     */
    applyPatternPenalties(winRate, patterns) {
        let totalPenalty = 0;
        
        for (const [pattern, data] of patterns) {
            const factor = this.config.adjustmentFactors[pattern] || 0;
            totalPenalty += factor * (data.confidence || 1);
        }
        
        // Apply penalty with maximum cap
        totalPenalty = Math.min(totalPenalty, 0.6); // Max 60% penalty
        return winRate * (1 - totalPenalty);
    }
    
    /**
     * Apply skill-based modifier to win rate
     */
    applySkillModifier(winRate, skillLevel) {
        switch (skillLevel) {
            case 'novice':
                return winRate * 0.95; // Small penalty even for beginners (reduced from 1.08)
            case 'intermediate':
                return winRate * 0.85; // Moderate penalty (reduced from 0.94)
            case 'expert':
                return winRate * 0.70; // Large penalty (reduced from 0.79)
            case 'exploiter':
                return winRate * 0.35; // Severe penalty (reduced from 0.42)
            default:
                return winRate;
        }
    }
    
    /**
     * Get or create player profile
     */
    async getPlayerProfile(userId) {
        if (!this.playerProfiles.has(userId)) {
            this.playerProfiles.set(userId, {
                userId,
                skillLevel: 'novice',
                totalGames: 0,
                totalWins: 0,
                totalProfit: 0,
                currentStreak: 0,
                longestStreak: 0,
                profitRatio: 1.0,
                averageBet: 0,
                betVariance: 0,
                playSpeed: 0,
                accuracy: 0,
                consistencyScore: 0,
                detectedPatterns: new Map(),
                suspiciousActivity: false,
                exploitAttempts: 0,
                lastActivity: Date.now(),
                adjustmentHistory: []
            });
        }
        
        return this.playerProfiles.get(userId);
    }
    
    /**
     * Update player profile with game result
     */
    async updatePlayerProfile(userId, gameResult) {
        const profile = await this.getPlayerProfile(userId);
        
        // Update basic stats
        profile.totalGames++;
        if (gameResult.won) {
            profile.totalWins++;
            profile.currentStreak++;
            profile.longestStreak = Math.max(profile.longestStreak, profile.currentStreak);
        } else {
            profile.currentStreak = 0;
        }
        
        // Update profit tracking
        profile.totalProfit += (gameResult.payout - gameResult.betAmount);
        profile.profitRatio = profile.totalGames > 0 ? 
            (profile.totalProfit + profile.totalGames * 1000) / (profile.totalGames * 1000) : 1;
        
        // Update bet statistics
        const oldAvg = profile.averageBet;
        profile.averageBet = ((profile.averageBet * (profile.totalGames - 1)) + gameResult.betAmount) / profile.totalGames;
        profile.betVariance = Math.abs(gameResult.betAmount - profile.averageBet) / profile.averageBet;
        
        // Calculate play speed (games per minute)
        const timeDiff = Date.now() - profile.lastActivity;
        profile.playSpeed = timeDiff > 0 ? 60000 / timeDiff : 0;
        
        // Calculate consistency score
        const winRate = profile.totalWins / profile.totalGames;
        profile.consistencyScore = winRate > 0.5 ? winRate : 0;
        
        // Determine skill level
        profile.skillLevel = this.determineSkillLevel(profile);
        
        // Update last activity
        profile.lastActivity = Date.now();
        
        // Check for suspicious patterns
        this.checkSuspiciousPatterns(profile);
        
        return profile;
    }
    
    /**
     * Determine player skill level
     */
    determineSkillLevel(profile) {
        const winRate = profile.totalWins / Math.max(profile.totalGames, 1);
        const profitRatio = profile.profitRatio;
        
        // Check for exploitation
        if (winRate > 0.65 && profitRatio > 2 && profile.totalGames > 50) {
            profile.exploitAttempts++;
            return 'exploiter';
        }
        
        // Check for expert play
        if (winRate > 0.55 && profile.accuracy > 0.7 && profile.totalGames > 100) {
            return 'expert';
        }
        
        // Check for intermediate
        if (profile.totalGames > 50 && winRate > 0.45) {
            return 'intermediate';
        }
        
        // Default to novice
        return 'novice';
    }
    
    /**
     * Check for suspicious patterns
     */
    checkSuspiciousPatterns(profile) {
        const suspicious = [];
        
        // Check win rate
        if (profile.totalGames > 20 && profile.totalWins / profile.totalGames > 0.7) {
            suspicious.push('high_win_rate');
        }
        
        // Check profit ratio
        if (profile.profitRatio > 2.5) {
            suspicious.push('excessive_profit');
        }
        
        // Check streak
        if (profile.currentStreak > 10) {
            suspicious.push('impossible_streak');
        }
        
        // Check play speed
        if (profile.playSpeed > 30) {
            suspicious.push('bot_speed');
        }
        
        // Check bet variance
        if (profile.betVariance < 0.1 && profile.totalGames > 50) {
            suspicious.push('consistent_betting');
        }
        
        profile.suspiciousActivity = suspicious.length > 0;
        if (profile.suspiciousActivity) {
            logger.warn(`🚨 Suspicious patterns detected for ${profile.userId}: ${suspicious.join(', ')}`);
        }
        
        return suspicious;
    }
    
    /**
     * Apply real-time adjustment to game outcome
     */
    async applyOutcomeAdjustment(userId, gameType, originalOutcome) {
        const winRate = await this.getAdjustedWinRate(userId, gameType);
        const random = secureRandomFloat();
        
        // Force loss if random exceeds win rate
        if (random > winRate) {
            // If original outcome was a win, convert to loss
            if (originalOutcome.won) {
                logger.info(`🎲 Outcome adjusted for ${userId}: WIN → LOSS (winRate: ${(winRate * 100).toFixed(1)}%)`);
                return {
                    ...originalOutcome,
                    won: false,
                    payout: 0,
                    adjusted: true,
                    reason: 'win_rate_control'
                };
            }
        }
        
        return originalOutcome;
    }
    
    /**
     * Calculate dynamic multiplier adjustment
     */
    async calculateMultiplierAdjustment(userId, gameType, baseMultiplier, patterns = null) {
        const houseEdge = await this.getAdjustedHouseEdge(userId, gameType, patterns);
        
        // Reduce multiplier based on house edge
        const adjustedMultiplier = baseMultiplier * (1 - houseEdge);
        
        // Log significant adjustments
        if (houseEdge > 0.1) {
            const reduction = ((baseMultiplier - adjustedMultiplier) / baseMultiplier * 100).toFixed(1);
            logger.info(`🎯 Multiplier reduced for ${userId}: ${baseMultiplier.toFixed(2)}x → ${adjustedMultiplier.toFixed(2)}x (-${reduction}%)`);
        }
        
        return adjustedMultiplier;
    }
    
    /**
     * Get game metrics
     */
    getGameMetrics(gameType) {
        if (!this.gameMetrics.has(gameType)) {
            this.gameMetrics.set(gameType, {
                totalPlays: 0,
                totalPayouts: 0,
                averagePayout: 0,
                houseProfit: 0,
                playerAdvantage: 0,
                lastUpdated: Date.now()
            });
        }
        return this.gameMetrics.get(gameType);
    }
    
    /**
     * Update game metrics
     */
    updateGameMetrics(gameType, betAmount, payout, won) {
        const metrics = this.getGameMetrics(gameType);
        
        metrics.totalPlays++;
        metrics.totalPayouts += payout;
        metrics.averagePayout = metrics.totalPayouts / metrics.totalPlays;
        metrics.houseProfit += (betAmount - payout);
        metrics.playerAdvantage = metrics.houseProfit < 0 ? Math.abs(metrics.houseProfit) / metrics.totalPlays : 0;
        metrics.lastUpdated = Date.now();
        
        // Log if players have advantage
        if (metrics.playerAdvantage > 0 && metrics.totalPlays > 100) {
            logger.warn(`⚠️ Player advantage detected in ${gameType}: ${(metrics.playerAdvantage).toFixed(2)} per game`);
        }
    }
    
    /**
     * Start periodic updates
     */
    startPeriodicUpdates() {
        // Decay adjustments every hour
        setInterval(() => {
            this.decayAdjustments();
        }, 3600000);
        
        // Clean old profiles every day
        setInterval(() => {
            this.cleanOldProfiles();
        }, 86400000);
        
        // Log metrics every 30 minutes
        setInterval(() => {
            this.logMetrics();
        }, 1800000);
    }
    
    /**
     * Decay adjustments over time
     */
    decayAdjustments() {
        for (const [key, value] of this.activeAdjustments) {
            const decayed = value * (1 - this.config.decayRates.adjustment);
            if (decayed < 0.01) {
                this.activeAdjustments.delete(key);
            } else {
                this.activeAdjustments.set(key, decayed);
            }
        }
        logger.info('⏰ Adjustments decayed by 1%');
    }
    
    /**
     * Clean old profiles
     */
    cleanOldProfiles() {
        const oneWeekAgo = Date.now() - (7 * 86400000);
        let cleaned = 0;
        
        for (const [userId, profile] of this.playerProfiles) {
            if (profile.lastActivity < oneWeekAgo) {
                this.playerProfiles.delete(userId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            logger.info(`🧹 Cleaned ${cleaned} old player profiles`);
        }
    }
    
    /**
     * Log current metrics
     */
    logMetrics() {
        const totalProfiles = this.playerProfiles.size;
        const activeAdjustments = this.activeAdjustments.size;
        const suspiciousPlayers = [...this.playerProfiles.values()].filter(p => p.suspiciousActivity).length;
        const exploiters = [...this.playerProfiles.values()].filter(p => p.skillLevel === 'exploiter').length;
        
        logger.info(`📊 Trend Adjuster Metrics:`);
        logger.info(`   Profiles: ${totalProfiles} | Adjustments: ${activeAdjustments}`);
        logger.info(`   Suspicious: ${suspiciousPlayers} | Exploiters: ${exploiters}`);
        
        // Log game metrics
        for (const [game, metrics] of this.gameMetrics) {
            if (metrics.totalPlays > 0) {
                const houseEdge = metrics.houseProfit / (metrics.totalPlays * 1000) * 100;
                logger.info(`   ${game}: ${metrics.totalPlays} plays, ${houseEdge.toFixed(2)}% house edge`);
            }
        }
    }
    
    /**
     * Get comprehensive report for a player
     */
    async getPlayerReport(userId) {
        const profile = await this.getPlayerProfile(userId);
        const report = {
            ...profile,
            currentAdjustments: {},
            recommendations: []
        };
        
        // Get current adjustments
        for (const [key, value] of this.activeAdjustments) {
            if (key.includes(userId)) {
                report.currentAdjustments[key] = value;
            }
        }
        
        // Generate recommendations
        if (profile.skillLevel === 'exploiter') {
            report.recommendations.push('BLOCK: Suspected exploitation');
        }
        if (profile.suspiciousActivity) {
            report.recommendations.push('MONITOR: Suspicious patterns detected');
        }
        if (profile.profitRatio > 3) {
            report.recommendations.push('LIMIT: Excessive profits');
        }
        
        return report;
    }
}

// Export singleton instance
module.exports = new AdvancedTrendAdjuster();