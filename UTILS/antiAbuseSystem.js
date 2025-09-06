/**
 * ADVANCED ANTI-ABUSE DETECTION SYSTEM
 * Real-time monitoring and prevention of gambling abuse and exploitation
 */

const _ = require('lodash');
const moment = require('moment');
const NodeCache = require('node-cache');
const dbManager = require('./database');
const logger = require('./logger');

class AntiAbuseSystem {
    constructor() {
        // Cache for tracking user behavior patterns (TTL: 30 minutes)
        this.behaviorCache = new NodeCache({ stdTTL: 1800, checkperiod: 300 });
        
        // Active monitoring for suspicious patterns
        this.suspiciousActivity = new Map();
        this.userRiskProfiles = new Map();
        this.blockedUsers = new Set();
        this.flaggedUsers = new Map();
        
        // Risk scoring thresholds
        this.riskThresholds = {
            LOW: 20,
            MEDIUM: 40,
            HIGH: 60,
            CRITICAL: 80
        };
        
        // Detection patterns
        this.patterns = {
            // Betting pattern anomalies
            rapidBetting: { maxBetsPerMinute: 10, riskScore: 25 },
            consistentWins: { maxConsecutiveWins: 8, riskScore: 30 },
            unusualBetSizes: { maxDeviation: 5, riskScore: 20 },
            
            // Timing patterns
            perfectTiming: { maxPrecisionMs: 100, riskScore: 35 },
            roboticBehavior: { maxVarianceMs: 50, riskScore: 40 },
            
            // Win rate anomalies
            impossibleWinRate: { threshold: 0.85, minGames: 20, riskScore: 50 },
            sustainedProfitability: { threshold: 0.75, minSessions: 10, riskScore: 40 },
            
            // Exploitation patterns
            edgeCaseExploitation: { riskScore: 60 },
            apiManipulation: { riskScore: 80 },
            collusion: { riskScore: 70 }
        };
        
        // Automatic actions based on risk scores
        this.autoActions = {
            30: 'flag_for_review',
            50: 'reduce_limits',
            70: 'temporary_restriction',
            90: 'immediate_suspension'
        };
        
        this.initializeSystem();
    }
    
    initializeSystem() {
        logger.info('🛡️  Initializing Advanced Anti-Abuse System...');
        
        // Start continuous monitoring
        this.monitoringInterval = setInterval(() => {
            this.performContinuousMonitoring();
        }, 30000); // Every 30 seconds
        
        // Daily cleanup of old data
        this.cleanupInterval = setInterval(() => {
            this.performDailyCleanup();
        }, 86400000); // Every 24 hours
        
        logger.info('🛡️  Anti-Abuse System initialized successfully');
    }
    
    /**
     * MAIN ENTRY POINT - Analyze game action
     */
    async analyzeGameAction(userId, gameType, action, data = {}) {
        const timestamp = Date.now();
        
        // Update user behavior profile
        await this.updateUserProfile(userId, gameType, action, data, timestamp);
        
        // Analyze for suspicious patterns
        const riskScore = await this.analyzeForSuspiciousPatterns(userId, gameType, action, data);
        
        // Take automatic actions if needed
        if (riskScore >= this.riskThresholds.MEDIUM) {
            await this.handleSuspiciousActivity(userId, riskScore, action, data);
        }
        
        return {
            riskScore,
            riskLevel: this.getRiskLevel(riskScore),
            action: riskScore >= this.riskThresholds.HIGH ? 'RESTRICT' : 'ALLOW',
            restrictions: await this.getUserRestrictions(userId)
        };
    }
    
    /**
     * UPDATE USER BEHAVIORAL PROFILE
     */
    async updateUserProfile(userId, gameType, action, data, timestamp) {
        const profileKey = `profile_${userId}`;
        let profile = this.behaviorCache.get(profileKey) || {
            userId,
            firstSeen: timestamp,
            actions: [],
            games: {},
            patterns: {},
            riskScore: 0,
            flags: []
        };
        
        // Add current action to history
        profile.actions.push({
            timestamp,
            gameType,
            action,
            data: {
                betAmount: data.betAmount || 0,
                payout: data.payout || 0,
                multiplier: data.multiplier || 0,
                responseTime: data.responseTime || 0,
                result: data.result || null
            }
        });
        
        // Limit action history to last 100 actions
        if (profile.actions.length > 100) {
            profile.actions = profile.actions.slice(-100);
        }
        
        // Update game-specific stats
        if (!profile.games[gameType]) {
            profile.games[gameType] = {
                totalGames: 0,
                totalWagered: 0,
                totalWon: 0,
                wins: 0,
                losses: 0,
                lastPlayed: timestamp
            };
        }
        
        const gameStats = profile.games[gameType];
        gameStats.totalGames++;
        gameStats.totalWagered += data.betAmount || 0;
        gameStats.totalWon += data.payout || 0;
        gameStats.lastPlayed = timestamp;
        
        if (data.result === 'win') gameStats.wins++;
        else if (data.result === 'lose') gameStats.losses++;
        
        // Update cache
        this.behaviorCache.set(profileKey, profile);
        this.userRiskProfiles.set(userId, profile);
        
        return profile;
    }
    
    /**
     * ANALYZE FOR SUSPICIOUS PATTERNS
     */
    async analyzeForSuspiciousPatterns(userId, gameType, action, data) {
        const profile = this.userRiskProfiles.get(userId);
        if (!profile || profile.actions.length < 5) {
            return 0; // Not enough data
        }
        
        let totalRiskScore = 0;
        const detectedPatterns = [];
        
        // 1. Rapid betting detection
        const rapidBettingScore = this.detectRapidBetting(profile);
        if (rapidBettingScore > 0) {
            totalRiskScore += rapidBettingScore;
            detectedPatterns.push('rapid_betting');
        }
        
        // 2. Consistent wins detection
        const consistentWinsScore = this.detectConsistentWins(profile, gameType);
        if (consistentWinsScore > 0) {
            totalRiskScore += consistentWinsScore;
            detectedPatterns.push('consistent_wins');
        }
        
        // 3. Unusual bet size patterns
        const betPatternScore = this.detectUnusualBetPatterns(profile);
        if (betPatternScore > 0) {
            totalRiskScore += betPatternScore;
            detectedPatterns.push('unusual_betting');
        }
        
        // 4. Perfect timing detection (bot behavior)
        const timingScore = this.detectPerfectTiming(profile);
        if (timingScore > 0) {
            totalRiskScore += timingScore;
            detectedPatterns.push('perfect_timing');
        }
        
        // 5. Impossible win rates
        const winRateScore = this.detectImpossibleWinRates(profile, gameType);
        if (winRateScore > 0) {
            totalRiskScore += winRateScore;
            detectedPatterns.push('impossible_winrate');
        }
        
        // 6. Statistical anomaly detection
        const statisticalScore = this.detectStatisticalAnomalies(profile, gameType);
        if (statisticalScore > 0) {
            totalRiskScore += statisticalScore;
            detectedPatterns.push('statistical_anomaly');
        }
        
        // Update profile with detected patterns
        profile.patterns[gameType] = detectedPatterns;
        profile.riskScore = totalRiskScore;
        
        if (detectedPatterns.length > 0) {
            logger.warn(`🚨 Suspicious patterns detected for user ${userId}: ${detectedPatterns.join(', ')} (Risk: ${totalRiskScore})`);
        }
        
        return totalRiskScore;
    }
    
    /**
     * DETECT RAPID BETTING PATTERNS
     */
    detectRapidBetting(profile) {
        const recentActions = profile.actions.filter(a => 
            Date.now() - a.timestamp < 60000 && a.action === 'bet'
        );
        
        if (recentActions.length > this.patterns.rapidBetting.maxBetsPerMinute) {
            const riskScore = Math.min(50, recentActions.length * 5);
            logger.debug(`Rapid betting detected: ${recentActions.length} bets in last minute`);
            return riskScore;
        }
        
        return 0;
    }
    
    /**
     * DETECT CONSISTENT WINS
     */
    detectConsistentWins(profile, gameType) {
        const gameActions = profile.actions.filter(a => 
            a.gameType === gameType && a.data.result
        ).slice(-20); // Last 20 games
        
        let consecutiveWins = 0;
        let maxConsecutiveWins = 0;
        
        for (const action of gameActions.reverse()) {
            if (action.data.result === 'win') {
                consecutiveWins++;
                maxConsecutiveWins = Math.max(maxConsecutiveWins, consecutiveWins);
            } else {
                consecutiveWins = 0;
            }
        }
        
        if (maxConsecutiveWins > this.patterns.consistentWins.maxConsecutiveWins) {
            const riskScore = Math.min(60, maxConsecutiveWins * 8);
            logger.debug(`Consistent wins detected: ${maxConsecutiveWins} consecutive wins`);
            return riskScore;
        }
        
        return 0;
    }
    
    /**
     * DETECT UNUSUAL BET PATTERNS
     */
    detectUnusualBetPatterns(profile) {
        const betAmounts = profile.actions
            .filter(a => a.data.betAmount > 0)
            .map(a => a.data.betAmount)
            .slice(-20);
            
        if (betAmounts.length < 10) return 0;
        
        const mean = _.mean(betAmounts);
        const standardDeviation = Math.sqrt(_.mean(betAmounts.map(x => Math.pow(x - mean, 2))));
        
        // Check for extremely consistent betting (potential bot)
        if (standardDeviation < mean * 0.01 && mean > 1000) {
            logger.debug(`Extremely consistent betting detected: SD ${standardDeviation.toFixed(2)}`);
            return 25;
        }
        
        // Check for unusual patterns (always betting round numbers, etc.)
        const roundNumbers = betAmounts.filter(amount => amount % 1000 === 0).length;
        if (roundNumbers / betAmounts.length > 0.8) {
            logger.debug(`Unusual betting pattern: ${roundNumbers}/${betAmounts.length} round numbers`);
            return 15;
        }
        
        return 0;
    }
    
    /**
     * DETECT PERFECT TIMING (BOT BEHAVIOR)
     */
    detectPerfectTiming(profile) {
        const timings = [];
        for (let i = 1; i < profile.actions.length; i++) {
            const timeDiff = profile.actions[i].timestamp - profile.actions[i-1].timestamp;
            if (timeDiff < 30000) { // Within 30 seconds
                timings.push(timeDiff);
            }
        }
        
        if (timings.length < 10) return 0;
        
        const mean = _.mean(timings);
        const variance = _.mean(timings.map(t => Math.pow(t - mean, 2)));
        
        // Extremely consistent timing suggests automation
        if (variance < 1000 && timings.length > 20) {
            logger.debug(`Perfect timing detected: variance ${variance.toFixed(2)}ms`);
            return 40;
        }
        
        return 0;
    }
    
    /**
     * DETECT IMPOSSIBLE WIN RATES
     */
    detectImpossibleWinRates(profile, gameType) {
        const gameStats = profile.games[gameType];
        if (!gameStats || gameStats.totalGames < this.patterns.impossibleWinRate.minGames) {
            return 0;
        }
        
        const winRate = gameStats.wins / (gameStats.wins + gameStats.losses);
        const expectedHouseEdge = this.getExpectedHouseEdge(gameType);
        const expectedWinRate = 1 - expectedHouseEdge;
        
        // Win rate significantly higher than mathematically possible
        if (winRate > expectedWinRate + 0.15) { // 15% above expected
            const riskScore = Math.min(70, (winRate - expectedWinRate) * 200);
            logger.debug(`Impossible win rate detected: ${(winRate * 100).toFixed(1)}% vs expected ${(expectedWinRate * 100).toFixed(1)}%`);
            return riskScore;
        }
        
        return 0;
    }
    
    /**
     * DETECT STATISTICAL ANOMALIES
     */
    detectStatisticalAnomalies(profile, gameType) {
        const gameActions = profile.actions.filter(a => a.gameType === gameType).slice(-50);
        if (gameActions.length < 20) return 0;
        
        const multipliers = gameActions
            .filter(a => a.data.multiplier > 0)
            .map(a => a.data.multiplier);
            
        if (multipliers.length < 10) return 0;
        
        // Check for impossible statistical outcomes
        const highMultipliers = multipliers.filter(m => m > 10).length;
        const expectedHighMultipliers = multipliers.length * 0.01; // Expect ~1%
        
        if (highMultipliers > expectedHighMultipliers * 3) { // 3x more than expected
            const riskScore = Math.min(50, highMultipliers * 10);
            logger.debug(`Statistical anomaly detected: ${highMultipliers} high multipliers vs expected ${expectedHighMultipliers.toFixed(1)}`);
            return riskScore;
        }
        
        return 0;
    }
    
    /**
     * GET EXPECTED HOUSE EDGE FOR GAME TYPE
     */
    getExpectedHouseEdge(gameType) {
        const houseEdges = {
            'blackjack': 0.02,  // 2%
            'slots': 0.08,      // 8%
            'roulette': 0.053,  // 5.3%
            'crash': 0.03,      // 3%
            'plinko': 0.08,     // 8%
            'bingo': 0.05,      // 5%
            'default': 0.05     // 5% default
        };
        
        return houseEdges[gameType] || houseEdges.default;
    }
    
    /**
     * HANDLE SUSPICIOUS ACTIVITY
     */
    async handleSuspiciousActivity(userId, riskScore, action, data) {
        const riskLevel = this.getRiskLevel(riskScore);
        
        // Apply automatic actions based on risk score
        for (const [threshold, autoAction] of Object.entries(this.autoActions)) {
            if (riskScore >= parseInt(threshold)) {
                await this.executeAutoAction(userId, autoAction, riskScore, { action, data });
                break;
            }
        }
        
        // Log suspicious activity
        const activity = {
            userId,
            timestamp: Date.now(),
            riskScore,
            riskLevel,
            action,
            data,
            autoActionTaken: this.getAutoActionForScore(riskScore)
        };
        
        this.suspiciousActivity.set(`${userId}_${Date.now()}`, activity);
        
        logger.warn(`🚨 SUSPICIOUS ACTIVITY: User ${userId} - Risk: ${riskScore} (${riskLevel}) - Action: ${action}`);
    }
    
    /**
     * EXECUTE AUTOMATIC ACTIONS
     */
    async executeAutoAction(userId, action, riskScore, context) {
        switch (action) {
            case 'flag_for_review':
                await this.flagUserForReview(userId, riskScore, context);
                break;
                
            case 'reduce_limits':
                await this.reduceBettingLimits(userId, riskScore);
                break;
                
            case 'temporary_restriction':
                await this.applyTemporaryRestriction(userId, 3600000); // 1 hour
                break;
                
            case 'immediate_suspension':
                await this.suspendUser(userId, riskScore, context);
                break;
        }
        
        logger.info(`Auto-action executed for user ${userId}: ${action} (Risk: ${riskScore})`);
    }
    
    /**
     * FLAG USER FOR MANUAL REVIEW
     */
    async flagUserForReview(userId, riskScore, context) {
        const flag = {
            userId,
            timestamp: Date.now(),
            riskScore,
            reason: 'Automated detection',
            context,
            status: 'PENDING_REVIEW',
            reviewer: null
        };
        
        this.flaggedUsers.set(userId, flag);
        
        // Store in database for persistence
        try {
            await dbManager.recordFlaggedUser(userId, flag);
        } catch (error) {
            logger.error(`Failed to record flagged user ${userId}: ${error.message}`);
        }
    }
    
    /**
     * REDUCE BETTING LIMITS
     */
    async reduceBettingLimits(userId, riskScore) {
        const reduction = Math.min(0.8, riskScore / 100); // Up to 80% reduction
        const newLimit = 10000 * (1 - reduction); // Reduce from base limit
        
        this.behaviorCache.set(`limit_${userId}`, {
            maxBet: newLimit,
            reason: 'Risk-based reduction',
            expires: Date.now() + 86400000 // 24 hours
        });
        
        logger.info(`Betting limits reduced for user ${userId}: Max bet now ${newLimit}`);
    }
    
    /**
     * APPLY TEMPORARY RESTRICTION
     */
    async applyTemporaryRestriction(userId, durationMs) {
        const restriction = {
            userId,
            type: 'TEMPORARY_BAN',
            startTime: Date.now(),
            endTime: Date.now() + durationMs,
            reason: 'Suspicious activity detected',
            autoApplied: true
        };
        
        this.behaviorCache.set(`restriction_${userId}`, restriction);
        
        logger.warn(`Temporary restriction applied to user ${userId} for ${Math.round(durationMs / 60000)} minutes`);
    }
    
    /**
     * SUSPEND USER
     */
    async suspendUser(userId, riskScore, context) {
        this.blockedUsers.add(userId);
        
        const suspension = {
            userId,
            timestamp: Date.now(),
            riskScore,
            context,
            status: 'SUSPENDED',
            requiresManualReview: true
        };
        
        this.behaviorCache.set(`suspension_${userId}`, suspension);
        
        logger.error(`🔴 USER SUSPENDED: ${userId} - Risk score: ${riskScore}`);
        
        // Store in database for persistence
        try {
            await dbManager.recordUserSuspension(userId, suspension);
        } catch (error) {
            logger.error(`Failed to record user suspension ${userId}: ${error.message}`);
        }
    }
    
    /**
     * PUBLIC API - Check if user action is allowed
     */
    async isUserActionAllowed(userId, action, amount = 0) {
        // Check if user is suspended
        if (this.blockedUsers.has(userId)) {
            return {
                allowed: false,
                reason: 'User is suspended',
                restrictionType: 'SUSPENSION'
            };
        }
        
        // Check temporary restrictions
        const restriction = this.behaviorCache.get(`restriction_${userId}`);
        if (restriction && Date.now() < restriction.endTime) {
            return {
                allowed: false,
                reason: 'User has temporary restriction',
                restrictionType: 'TEMPORARY',
                expiresAt: restriction.endTime
            };
        }
        
        // Check betting limits
        if (action === 'bet' && amount > 0) {
            const limit = this.behaviorCache.get(`limit_${userId}`);
            if (limit && amount > limit.maxBet) {
                return {
                    allowed: false,
                    reason: 'Bet exceeds current limit',
                    restrictionType: 'LIMIT',
                    maxAllowed: limit.maxBet
                };
            }
        }
        
        return { allowed: true };
    }
    
    /**
     * PUBLIC API - Get user risk assessment
     */
    getUserRiskAssessment(userId) {
        const profile = this.userRiskProfiles.get(userId);
        if (!profile) {
            return {
                riskScore: 0,
                riskLevel: 'UNKNOWN',
                patterns: [],
                lastActivity: null,
                restrictions: []
            };
        }
        
        return {
            riskScore: profile.riskScore,
            riskLevel: this.getRiskLevel(profile.riskScore),
            patterns: Object.values(profile.patterns).flat(),
            lastActivity: profile.actions[profile.actions.length - 1]?.timestamp,
            restrictions: this.getUserRestrictions(userId)
        };
    }
    
    /**
     * GET USER RESTRICTIONS
     */
    async getUserRestrictions(userId) {
        const restrictions = [];
        
        if (this.blockedUsers.has(userId)) {
            restrictions.push('SUSPENDED');
        }
        
        const tempRestriction = this.behaviorCache.get(`restriction_${userId}`);
        if (tempRestriction && Date.now() < tempRestriction.endTime) {
            restrictions.push('TEMPORARY_BAN');
        }
        
        const limit = this.behaviorCache.get(`limit_${userId}`);
        if (limit) {
            restrictions.push(`REDUCED_LIMITS_${limit.maxBet}`);
        }
        
        return restrictions;
    }
    
    /**
     * HELPER METHODS
     */
    getRiskLevel(score) {
        if (score >= this.riskThresholds.CRITICAL) return 'CRITICAL';
        if (score >= this.riskThresholds.HIGH) return 'HIGH';
        if (score >= this.riskThresholds.MEDIUM) return 'MEDIUM';
        if (score >= this.riskThresholds.LOW) return 'LOW';
        return 'MINIMAL';
    }
    
    getAutoActionForScore(score) {
        for (const [threshold, action] of Object.entries(this.autoActions).reverse()) {
            if (score >= parseInt(threshold)) {
                return action;
            }
        }
        return 'none';
    }
    
    /**
     * CONTINUOUS MONITORING
     */
    async performContinuousMonitoring() {
        // Clean up expired restrictions
        this.cleanupExpiredRestrictions();
        
        // Analyze current user patterns
        for (const [userId, profile] of this.userRiskProfiles) {
            if (Date.now() - profile.actions[profile.actions.length - 1]?.timestamp < 300000) { // Active in last 5 minutes
                await this.analyzeUserProfile(userId, profile);
            }
        }
    }
    
    /**
     * CLEANUP EXPIRED RESTRICTIONS
     */
    cleanupExpiredRestrictions() {
        const now = Date.now();
        
        // Clean expired temporary restrictions
        for (const key of this.behaviorCache.keys()) {
            if (key.startsWith('restriction_')) {
                const restriction = this.behaviorCache.get(key);
                if (restriction && now >= restriction.endTime) {
                    this.behaviorCache.del(key);
                    logger.info(`Expired restriction removed for ${key}`);
                }
            }
        }
        
        // Clean expired limits
        for (const key of this.behaviorCache.keys()) {
            if (key.startsWith('limit_')) {
                const limit = this.behaviorCache.get(key);
                if (limit && now >= limit.expires) {
                    this.behaviorCache.del(key);
                    logger.info(`Expired limit removed for ${key}`);
                }
            }
        }
    }
    
    /**
     * DAILY CLEANUP
     */
    performDailyCleanup() {
        const cutoff = Date.now() - 86400000; // 24 hours ago
        
        // Clean old suspicious activity
        for (const [key, activity] of this.suspiciousActivity) {
            if (activity.timestamp < cutoff) {
                this.suspiciousActivity.delete(key);
            }
        }
        
        logger.info('Daily cleanup completed for anti-abuse system');
    }
    
    /**
     * GET SYSTEM STATUS
     */
    getSystemStatus() {
        return {
            status: 'ACTIVE',
            trackedUsers: this.userRiskProfiles.size,
            blockedUsers: this.blockedUsers.size,
            flaggedUsers: this.flaggedUsers.size,
            suspiciousActivities: this.suspiciousActivity.size,
            cacheSize: this.behaviorCache.getStats()
        };
    }
    
    /**
     * CLEANUP RESOURCES
     */
    destroy() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        this.behaviorCache.close();
        logger.info('Anti-Abuse System destroyed');
    }
}

// Export singleton instance
module.exports = new AntiAbuseSystem();