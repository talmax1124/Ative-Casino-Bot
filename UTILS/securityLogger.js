/**
 * SECURITY LOGGER - Comprehensive exploit detection and alerting
 * Monitors for suspicious activity and sends real-time alerts
 */

const logger = require('./logger');
const balanceBasedAdjuster = require('./balanceBasedAdjuster');
const dbManager = require('./database');

class SecurityLogger {
    constructor() {
        this.suspiciousActivity = new Map(); // Track per user
        this.alertThresholds = {
            highWinStreak: 25,        // 25 wins in a row (increased from 15)
            rapidBetting: 150,        // 150 bets in 5 minutes (increased from 60) - warning only
            severeBetting: 300,       // 300 bets in 5 minutes triggers lockout (increased from 100)
            extremeBetting: 500,      // 500 bets in 5 minutes triggers extended lockout (increased from 200)
            largeWinAmount: 1000000,  // 1M+ single win (increased from 500K)
            totalWinToday: 10000000,  // 10M+ total wins today (increased from 5M)
            negativeBalance: -1       // Any negative balance
        };
        this.userActivityWindows = new Map(); // Track activity windows
        this.cleanupInterval = setInterval(() => this.cleanup(), 300000); // Cleanup every 5 minutes

        // Alert throttling
        this.alertCooldownMs = 120000; // 2 minute cooldown between identical alerts per user (increased from 30s)
        this.lastAlertTime = new Map(); // key: `${userId}:${type}` -> timestamp
        this.lastRapidBetAlertCount = new Map(); // userId -> last count that triggered alert
        
        // Progressive lockout system
        this.lockouts = new Map(); // userId -> { until: timestamp, level: number, violations: number }
        this.lockoutDurations = {
            1: 15000,      // Level 1: 15 seconds (reduced from 30s)
            2: 60000,      // Level 2: 1 minute (reduced from 2m)
            3: 180000,     // Level 3: 3 minutes (reduced from 5m)
            4: 600000,     // Level 4: 10 minutes (reduced from 15m)
            5: 1800000     // Level 5: 30 minutes (reduced from 1h)
        };
        
        // ADVANCED PATTERN DETECTION
        this.advancedPatterns = {
            winMomentum: new Map(),        // Track win momentum per user
            gameHopping: new Map(),        // Track game switching patterns
            timePatterns: new Map(),       // Track temporal betting patterns
            valueEscalation: new Map(),    // Track bet size escalation
            crossGameWins: new Map()       // Track wins across different games
        };
        
        // RELAXED THRESHOLDS - More lenient for better user experience
        this.ultraThresholds = {
            winMomentum: 0.85,             // 85% momentum triggers intervention (was 60%)
            gameHoppingWindow: 300000,     // 5-minute window for game hopping detection
            maxGamesPerWindow: 6,          // Max 6 different games in window (was 3)
            escalationThreshold: 5.0,      // 5x bet increase triggers alert (was 2x)
            crossGameWinLimit: 5,          // Max 5 consecutive wins across games (was 2)
            temporalConcentration: 0.9     // 90% of bets in short timeframe (was 70%)
        };
    }

    /**
     * Log a potential security event with balance context
     */
    async logSecurityEvent(userId, eventType, data = {}, guildId = null) {
        const timestamp = Date.now();
        const userActivity = this.getUserActivity(userId);

        // Enhance data with balance information if possible
        let enhancedData = { ...data };
        if (guildId) {
            try {
                const userBalance = await dbManager.getUserBalance(userId, guildId);
                const totalBalance = (userBalance.wallet || 0) + (userBalance.bank || 0);
                const balanceTier = balanceBasedAdjuster.getBalanceTier(totalBalance);
                
                enhancedData.balanceContext = {
                    totalBalance,
                    walletBalance: userBalance.wallet || 0,
                    bankBalance: userBalance.bank || 0,
                    balanceTier: balanceTier.name,
                    tierRange: `${balanceTier.min.toLocaleString()} - ${balanceTier.max === Infinity ? '∞' : balanceTier.max.toLocaleString()}`
                };
            } catch (balanceError) {
                logger.debug(`Could not fetch balance context for security event: ${balanceError.message}`);
            }
        }

        // Record the event with enhanced data
        userActivity.events.push({
            type: eventType,
            timestamp,
            data: enhancedData
        });

        // Check for suspicious patterns with balance context
        const suspiciousPattern = this.detectSuspiciousPattern(userId, eventType, enhancedData);
        
        if (suspiciousPattern.detected) {
            await this.sendSecurityAlert(userId, suspiciousPattern);
        }

        // Log to file with balance context
        const balanceInfo = enhancedData.balanceContext ? 
            ` [${enhancedData.balanceContext.balanceTier}: ${enhancedData.balanceContext.totalBalance.toLocaleString()}]` : '';
        logger.warn(`SECURITY_EVENT: ${eventType} - User: ${userId}${balanceInfo} - Data: ${JSON.stringify(enhancedData)}`);
    }

    /**
     * Get or create user activity tracking
     */
    getUserActivity(userId) {
        if (!this.userActivityWindows.has(userId)) {
            this.userActivityWindows.set(userId, {
                events: [],
                winStreak: 0,
                totalWinsToday: 0,
                lastReset: Date.now(),
                flagged: false
            });
        }
        return this.userActivityWindows.get(userId);
    }

    /**
     * Detect suspicious patterns in user activity
     */
    detectSuspiciousPattern(userId, eventType, data) {
        const userActivity = this.getUserActivity(userId);
        const now = Date.now();
        const fiveMinutesAgo = now - 300000; // 5 minutes
        const oneDayAgo = now - 86400000;   // 24 hours

        // Pattern 1: High win streak
        if (eventType === 'GAME_WIN') {
            userActivity.winStreak++;
            userActivity.totalWinsToday += (data.amount || 0);
            
            if (userActivity.winStreak >= this.alertThresholds.highWinStreak) {
                return {
                    detected: true,
                    type: 'HIGH_WIN_STREAK',
                    severity: 'HIGH',
                    details: `${userActivity.winStreak} consecutive wins`,
                    data: { winStreak: userActivity.winStreak }
                };
            }
        }

        // Pattern 2: Game loss resets win streak
        if (eventType === 'GAME_LOSS') {
            userActivity.winStreak = 0;
        }

        // Pattern 3: Progressive rapid betting detection with lockout
        const recentBets = userActivity.events.filter(event => 
            (event.type === 'GAME_BET' || event.type === 'GAME_WIN' || event.type === 'GAME_LOSS') && 
            event.timestamp > fiveMinutesAgo
        ).length;

        if (recentBets >= this.alertThresholds.extremeBetting) {
            userActivity.flagged = true;
            return {
                detected: true,
                type: 'EXTREME_RAPID_BETTING',
                severity: 'HIGH',
                details: `${recentBets} bets in 5 minutes - monitoring for pacing`,
                data: { betCount: recentBets, action: 'monitor_only' }
            };
        } else if (recentBets >= this.alertThresholds.severeBetting) {
            userActivity.flagged = true;
            return {
                detected: true,
                type: 'SEVERE_RAPID_BETTING',
                severity: 'MEDIUM',
                details: `${recentBets} bets in 5 minutes - suggesting a short break`,
                data: { betCount: recentBets, action: 'suggest_break' }
            };
        } else if (recentBets >= this.alertThresholds.rapidBetting) {
            userActivity.flagged = true;
            return {
                detected: true,
                type: 'RAPID_BETTING',
                severity: 'LOW',
                details: `${recentBets} bets in 5 minutes - flagged for gentle reminder`,
                data: { betCount: recentBets }
            };
        }

        // Pattern 4: Large single win
        if (eventType === 'GAME_WIN' && data.amount >= this.alertThresholds.largeWinAmount) {
            return {
                detected: true,
                type: 'LARGE_WIN',
                severity: 'HIGH',
                details: `Single win of ${data.amount}`,
                data: { amount: data.amount, game: data.game }
            };
        }

        // Pattern 5: Excessive daily winnings
        if (userActivity.totalWinsToday >= this.alertThresholds.totalWinToday) {
            return {
                detected: true,
                type: 'EXCESSIVE_DAILY_WINS',
                severity: 'CRITICAL',
                details: `Total daily wins: ${userActivity.totalWinsToday}`,
                data: { totalWins: userActivity.totalWinsToday }
            };
        }

        // Pattern 6: Negative balance
        if (eventType === 'NEGATIVE_BALANCE') {
            return {
                detected: true,
                type: 'NEGATIVE_BALANCE',
                severity: 'CRITICAL',
                details: `Balance below zero: ${data.balance}`,
                data: { balance: data.balance }
            };
        }

        // Pattern 7: Exploit attempts
        if (eventType === 'EXPLOIT_ATTEMPT') {
            return {
                detected: true,
                type: 'EXPLOIT_ATTEMPT',
                severity: 'CRITICAL',
                details: data.description || 'Exploit attempt detected',
                data: data
            };
        }

        // Pattern 8: Large payout adjustments (transparency logging)
        if (eventType === 'LARGE_PAYOUT_ADJUSTMENT') {
            return {
                detected: true,
                type: 'LARGE_PAYOUT_ADJUSTMENT',
                severity: 'HIGH',
                details: `${data.gameType} payout adjusted by ${data.adjustmentPercent}% (${data.originalPayout} → ${data.adjustedPayout})`,
                data: data
            };
        }
        
        // Pattern 9: Win momentum detection
        if (eventType === 'GAME_WIN') {
            const momentum = this.calculateWinMomentum(userId, data);
            if (momentum > this.ultraThresholds.winMomentum) {
                return {
                    detected: true,
                    type: 'HIGH_WIN_MOMENTUM',
                    severity: 'HIGH',
                    details: `Win momentum ${(momentum * 100).toFixed(1)}% detected`,
                    data: { momentum, ...data }
                };
            }
        }
        
        // Pattern 10: Game hopping detection
        if (eventType === 'GAME_BET' || eventType === 'GAME_WIN') {
            const hopping = this.detectGameHopping(userId, data.game);
            if (hopping.detected) {
                return {
                    detected: true,
                    type: 'GAME_HOPPING',
                    severity: 'MEDIUM',
                    details: `Game hopping detected: ${hopping.games.join(' → ')}`,
                    data: { games: hopping.games, ...data }
                };
            }
        }
        
        // Pattern 11: Cross-game consecutive wins
        if (eventType === 'GAME_WIN') {
            const crossWins = this.trackCrossGameWins(userId, data.game);
            if (crossWins > this.ultraThresholds.crossGameWinLimit) {
                return {
                    detected: true,
                    type: 'CROSS_GAME_WIN_STREAK',
                    severity: 'HIGH',
                    details: `${crossWins} consecutive wins across different games`,
                    data: { consecutiveWins: crossWins, ...data }
                };
            }
        }
        
        // Pattern 12: Forced streak break events
        if (eventType === 'FORCED_STREAK_BREAK') {
            return {
                detected: true,
                type: 'FORCED_STREAK_BREAK',
                severity: 'CRITICAL',
                details: data.reason || 'Automated streak breaking applied',
                data: data
            };
        }

        return { detected: false };
    }

    /**
     * Send security alert to admin channel
     */
    async sendSecurityAlert(userId, suspiciousPattern) {
        try {
            // Throttle betting alerts to avoid spam
            if (suspiciousPattern.type === 'RAPID_BETTING' || 
                suspiciousPattern.type === 'SEVERE_RAPID_BETTING' ||
                suspiciousPattern.type === 'EXTREME_RAPID_BETTING') {
                const key = `${userId}:RAPID_BETTING`;
                const now = Date.now();
                const lastTime = this.lastAlertTime.get(key) || 0;
                const lastCount = this.lastRapidBetAlertCount.get(userId) || 0;
                const currentCount = suspiciousPattern?.data?.betCount || 0;

                // Only alert at step increases and with a time cooldown
                const stepped = currentCount >= 50 && (currentCount === 50 || currentCount % 25 === 0 || currentCount - lastCount >= 25);
                const cooled = now - lastTime >= this.alertCooldownMs;
                if (!stepped || !cooled) {
                    return; // Skip redundant alert
                }
                this.lastRapidBetAlertCount.set(userId, currentCount);
                this.lastAlertTime.set(key, now);
            }

            const alertMessage = this.buildAlertMessage(userId, suspiciousPattern);
            
            // Log based on severity level to reduce console spam
            if (suspiciousPattern.severity === 'CRITICAL') {
                logger.error(`🚨 SECURITY ALERT: ${suspiciousPattern.type} - User: ${userId} - Details: ${suspiciousPattern.details}`);
            } else if (suspiciousPattern.severity === 'HIGH') {
                logger.warn(`⚠️ Security Alert: ${suspiciousPattern.type} - User: ${userId} - Details: ${suspiciousPattern.details}`);
            } else {
                logger.info(`🔍 Security Notice: ${suspiciousPattern.type} - User: ${userId} - Details: ${suspiciousPattern.details}`);
            }
            
            // Send to Discord admin channel
            if (global.discordClient) {
                try {
                    const logChannel = global.discordClient.channels.cache.get('1406136478714826824');
                    if (logChannel) {
                        await logChannel.send(alertMessage);
                    }
                } catch (discordError) {
                    logger.error(`Failed to send Discord security alert: ${discordError.message}`);
                }
            }

            // Mark user as flagged for manual review
            const userActivity = this.getUserActivity(userId);
            userActivity.flagged = true;

        } catch (error) {
            logger.error(`Error sending security alert: ${error.message}`);
        }
    }

    /**
     * Build formatted alert message with balance context
     */
    buildAlertMessage(userId, pattern) {
        const severityEmojis = {
            'LOW': '🟡',
            'MEDIUM': '🟠', 
            'HIGH': '🔴',
            'CRITICAL': '🚨'
        };

        const emoji = severityEmojis[pattern.severity] || '⚠️';
        
        // Balance tier emoji mapping
        const balanceTierEmojis = {
            'Ultra Low': '🔸',
            'Low': '🔹', 
            'Normal': '⚪',
            'High': '🟢',
            'Very High': '🟡',
            'Ultra High': '🟠',
            'Mega Whale': '🔴'
        };

        let balanceInfo = '';
        if (pattern.data?.balanceContext) {
            const bc = pattern.data.balanceContext;
            const tierEmoji = balanceTierEmojis[bc.balanceTier] || '⚪';
            balanceInfo = `\n**Balance Tier:** ${tierEmoji} ${bc.balanceTier} (${bc.totalBalance.toLocaleString()})` +
                         `\n**Balance Range:** ${bc.tierRange}`;
        }
        
        return `${emoji} **SECURITY ALERT** ${emoji}\n\n` +
               `**Type:** ${pattern.type}\n` +
               `**Severity:** ${pattern.severity}\n` +
               `**User:** <@${userId}> (${userId})${balanceInfo}\n` +
               `**Details:** ${pattern.details}\n` +
               `**Time:** <t:${Math.floor(Date.now() / 1000)}:F>\n` +
               `**Data:** \`\`\`json\n${JSON.stringify(pattern.data, null, 2)}\`\`\`\n` +
               `**Action Required:** Manual investigation recommended`;
    }

    /**
     * Apply progressive lockout to user
     */
    applyLockout(userId, level) {
        logger.info(`Lockout request ignored for user ${userId} (level ${level}) - fairness mode active.`);
    }
    
    /**
     * Get next lockout level for user based on violation history
     */
    getNextLockoutLevel(userId) {
        const currentLockout = this.lockouts.get(userId);
        if (!currentLockout) return 1;
        
        // If lockout expired, reset to level 1
        if (currentLockout.until < Date.now()) {
            return 1;
        }
        
        // Progressive increase based on violations
        const violations = currentLockout.violations || 0;
        if (violations >= 10) return 5;  // Max level
        if (violations >= 5) return 4;
        if (violations >= 3) return 3;
        if (violations >= 2) return 2;
        return 1;
    }
    
    /**
     * Check if user is currently locked out
     */
    isUserLockedOut(userId) {
        return false;
    }
    
    /**
     * Clean up old activity data
     */
    cleanup() {
        const oneDayAgo = Date.now() - 86400000;
        
        for (const [userId, activity] of this.userActivityWindows.entries()) {
            // Reset daily counters if more than 24 hours
            if (activity.lastReset < oneDayAgo) {
                activity.totalWinsToday = 0;
                activity.winStreak = 0;
                activity.lastReset = Date.now();
            }

            // Remove old events (keep only last 24 hours)
            activity.events = activity.events.filter(event => event.timestamp > oneDayAgo);
            
            // Remove users with no recent activity
            if (activity.events.length === 0 && !activity.flagged) {
                this.userActivityWindows.delete(userId);
            }
        }
    }

    /**
     * Check if user is flagged for suspicious activity
     */
    isUserFlagged(userId) {
        const activity = this.userActivityWindows.get(userId);
        return activity ? activity.flagged : false;
    }

    /**
     * Get count of recent bets within a time window (default 5 minutes)
     */
    getRecentBetCount(userId, windowMs = 300000) {
        const activity = this.userActivityWindows.get(userId);
        if (!activity) return 0;
        const cutoff = Date.now() - windowMs;
        return activity.events.filter(event => (
            (event.type === 'GAME_BET' || event.type === 'GAME_WIN' || event.type === 'GAME_LOSS') &&
            event.timestamp > cutoff
        )).length;
    }

    /**
     * Manually flag/unflag a user
     */
    setUserFlag(userId, flagged = true, reason = '') {
        const activity = this.getUserActivity(userId);
        activity.flagged = flagged;
        if (reason) {
            activity.flagReason = reason;
        }
        logger.info(`User ${userId} ${flagged ? 'flagged' : 'unflagged'} for security review. Reason: ${reason}`);
    }

    /**
     * Calculate win momentum for a user
     */
    calculateWinMomentum(userId, data) {
        const now = Date.now();
        const momentum = this.advancedPatterns.winMomentum.get(userId) || {
            recentWins: [],
            totalValue: 0,
            momentum: 0
        };
        
        // Add current win
        momentum.recentWins.push({
            time: now,
            value: data.amount || 0,
            game: data.game
        });
        
        // Keep only recent wins (last 10 minutes)
        momentum.recentWins = momentum.recentWins.filter(w => now - w.time < 600000);
        
        // Calculate momentum based on win frequency and value
        const winCount = momentum.recentWins.length;
        const totalValue = momentum.recentWins.reduce((sum, w) => sum + w.value, 0);
        
        momentum.momentum = Math.min(1.0, (winCount * 0.2) + (totalValue / 100000));
        momentum.totalValue = totalValue;
        
        this.advancedPatterns.winMomentum.set(userId, momentum);
        return momentum.momentum;
    }
    
    /**
     * Detect game hopping patterns
     */
    detectGameHopping(userId, currentGame) {
        const now = Date.now();
        const hopping = this.advancedPatterns.gameHopping.get(userId) || {
            recentGames: [],
            lastUpdate: now
        };
        
        // Add current game
        if (hopping.recentGames.length === 0 || 
            hopping.recentGames[hopping.recentGames.length - 1].game !== currentGame) {
            hopping.recentGames.push({ game: currentGame, time: now });
        }
        
        // Keep only recent games (last 5 minutes)
        hopping.recentGames = hopping.recentGames.filter(g => now - g.time < this.ultraThresholds.gameHoppingWindow);
        
        const uniqueGames = [...new Set(hopping.recentGames.map(g => g.game))];
        hopping.lastUpdate = now;
        
        this.advancedPatterns.gameHopping.set(userId, hopping);
        
        return {
            detected: uniqueGames.length > this.ultraThresholds.maxGamesPerWindow,
            games: uniqueGames
        };
    }
    
    /**
     * Track cross-game consecutive wins
     */
    trackCrossGameWins(userId, currentGame) {
        const now = Date.now();
        const crossWins = this.advancedPatterns.crossGameWins.get(userId) || {
            streak: 0,
            lastGame: null,
            lastWin: 0
        };
        
        // Check if this extends the cross-game win streak
        if (crossWins.lastGame && crossWins.lastGame !== currentGame && 
            now - crossWins.lastWin < 300000) { // Within 5 minutes
            crossWins.streak++;
        } else if (crossWins.lastGame === currentGame) {
            // Same game, don't increment cross-game streak
        } else {
            crossWins.streak = 1; // Start new streak
        }
        
        crossWins.lastGame = currentGame;
        crossWins.lastWin = now;
        
        this.advancedPatterns.crossGameWins.set(userId, crossWins);
        return crossWins.streak;
    }
    
    /**
     * Get balance-based risk assessment for a user
     */
    async getBalanceBasedRiskAssessment(userId, guildId, activity = {}) {
        try {
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            const totalBalance = (userBalance.wallet || 0) + (userBalance.bank || 0);
            const balanceTier = balanceBasedAdjuster.getBalanceTier(totalBalance);
            
            // Adjust thresholds based on balance tier
            const tierMultipliers = {
                'Ultra Low': { winStreak: 0.5, rapidBetting: 0.7, largeWin: 0.3 },
                'Low': { winStreak: 0.7, rapidBetting: 0.8, largeWin: 0.5 },
                'Normal': { winStreak: 1.0, rapidBetting: 1.0, largeWin: 1.0 },
                'High': { winStreak: 1.3, rapidBetting: 1.2, largeWin: 1.5 },
                'Very High': { winStreak: 1.5, rapidBetting: 1.4, largeWin: 2.0 },
                'Ultra High': { winStreak: 2.0, rapidBetting: 1.6, largeWin: 3.0 },
                'Mega Whale': { winStreak: 2.5, rapidBetting: 2.0, largeWin: 5.0 }
            };
            
            const multiplier = tierMultipliers[balanceTier.name] || tierMultipliers['Normal'];
            
            return {
                balanceTier: balanceTier.name,
                totalBalance,
                riskLevel: this.calculateRiskLevel(balanceTier.name, activity),
                adjustedThresholds: {
                    highWinStreak: Math.floor(this.alertThresholds.highWinStreak * multiplier.winStreak),
                    rapidBetting: Math.floor(this.alertThresholds.rapidBetting * multiplier.rapidBetting),
                    largeWinAmount: Math.floor(this.alertThresholds.largeWinAmount * multiplier.largeWin)
                },
                recommendations: this.getSecurityRecommendations(balanceTier.name, activity)
            };
        } catch (error) {
            logger.error(`Failed to get balance-based risk assessment: ${error.message}`);
            return null;
        }
    }

    /**
     * Calculate risk level based on balance tier and activity
     */
    calculateRiskLevel(balanceTier, activity) {
        const baseRisk = {
            'Ultra Low': 0.2,
            'Low': 0.3,
            'Normal': 0.5,
            'High': 0.7,
            'Very High': 0.8,
            'Ultra High': 0.9,
            'Mega Whale': 0.95
        };
        
        let risk = baseRisk[balanceTier] || 0.5;
        
        // Adjust based on activity patterns
        if (activity.winStreak > 10) risk += 0.1;
        if (activity.flagged) risk += 0.15;
        if (activity.totalWinsToday > 1000000) risk += 0.1;
        
        return Math.min(1.0, risk);
    }

    /**
     * Get security recommendations based on balance tier
     */
    getSecurityRecommendations(balanceTier, activity) {
        const recommendations = [];
        
        if (['Ultra High', 'Mega Whale'].includes(balanceTier)) {
            recommendations.push('Enhanced monitoring recommended');
            recommendations.push('Consider manual review for large transactions');
        }
        
        if (activity.winStreak > 10) {
            recommendations.push('Monitor for potential exploitation');
        }
        
        if (activity.flagged) {
            recommendations.push('User flagged - requires immediate attention');
        }
        
        return recommendations;
    }

    /**
     * Get enhanced security statistics with balance context
     */
    getSecurityStats() {
        let totalUsers = 0;
        let flaggedUsers = 0;
        let totalEvents = 0;
        const balanceTierCounts = {};
        
        for (const [userId, activity] of this.userActivityWindows.entries()) {
            totalUsers++;
            if (activity.flagged) flaggedUsers++;
            totalEvents += activity.events.length;
            
            // Count balance tiers if available in recent events
            const recentEventWithBalance = activity.events
                .reverse()
                .find(e => e.data?.balanceContext?.balanceTier);
            if (recentEventWithBalance) {
                const tier = recentEventWithBalance.data.balanceContext.balanceTier;
                balanceTierCounts[tier] = (balanceTierCounts[tier] || 0) + 1;
            }
        }

        return {
            totalUsers,
            flaggedUsers,
            totalEvents,
            activeMonitoring: this.userActivityWindows.size,
            activeLockouts: this.lockouts.size,
            balanceTierDistribution: balanceTierCounts,
            advancedPatterns: {
                winMomentumTracked: this.advancedPatterns.winMomentum.size,
                gameHoppingTracked: this.advancedPatterns.gameHopping.size,
                crossGameStreaks: this.advancedPatterns.crossGameWins.size
            }
        };
    }
}

// Export singleton instance
module.exports = new SecurityLogger();
