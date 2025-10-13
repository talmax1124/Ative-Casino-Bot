/**
 * SECURITY LOGGER - Comprehensive exploit detection and alerting
 * Monitors for suspicious activity and sends real-time alerts
 */

const logger = require('./logger');

class SecurityLogger {
    constructor() {
        this.suspiciousActivity = new Map(); // Track per user
        this.alertThresholds = {
            highWinStreak: 15,        // 15 wins in a row (was 10)
            rapidBetting: 60,         // 60 bets in 5 minutes (was 30) - warning only
            severeBetting: 100,       // 100 bets in 5 minutes triggers lockout (was 50)
            extremeBetting: 200,      // 200 bets in 5 minutes triggers extended lockout (was 100)
            largeWinAmount: 500000,   // 500K+ single win (was 100K)
            totalWinToday: 5000000,   // 5M+ total wins today (was 1M)
            negativeBalance: -1       // Any negative balance
        };
        this.userActivityWindows = new Map(); // Track activity windows
        this.cleanupInterval = setInterval(() => this.cleanup(), 300000); // Cleanup every 5 minutes

        // Alert throttling
        this.alertCooldownMs = 30000; // 30s cooldown between identical alerts per user
        this.lastAlertTime = new Map(); // key: `${userId}:${type}` -> timestamp
        this.lastRapidBetAlertCount = new Map(); // userId -> last count that triggered alert
        
        // Progressive lockout system
        this.lockouts = new Map(); // userId -> { until: timestamp, level: number, violations: number }
        this.lockoutDurations = {
            1: 30000,      // Level 1: 30 seconds (was 1 minute)
            2: 120000,     // Level 2: 2 minutes (was 5 minutes)
            3: 300000,     // Level 3: 5 minutes (was 15 minutes)
            4: 900000,     // Level 4: 15 minutes (was 1 hour)
            5: 3600000     // Level 5: 1 hour (was 24 hours)
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
     * Log a potential security event
     */
    async logSecurityEvent(userId, eventType, data = {}) {
        const timestamp = Date.now();
        const userActivity = this.getUserActivity(userId);

        // Record the event
        userActivity.events.push({
            type: eventType,
            timestamp,
            data: { ...data }
        });

        // Check for suspicious patterns
        const suspiciousPattern = this.detectSuspiciousPattern(userId, eventType, data);
        
        if (suspiciousPattern.detected) {
            await this.sendSecurityAlert(userId, suspiciousPattern);
        }

        // Log to file
        logger.warn(`SECURITY_EVENT: ${eventType} - User: ${userId} - Data: ${JSON.stringify(data)}`);
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
            // Extreme betting - immediate level 5 lockout
            this.applyLockout(userId, 5);
            return {
                detected: true,
                type: 'EXTREME_RAPID_BETTING',
                severity: 'CRITICAL',
                details: `${recentBets} bets in 5 minutes - User locked out for 24 hours`,
                data: { betCount: recentBets, lockoutLevel: 5 }
            };
        } else if (recentBets >= this.alertThresholds.severeBetting) {
            // Severe betting - progressive lockout
            const lockoutLevel = this.getNextLockoutLevel(userId);
            this.applyLockout(userId, lockoutLevel);
            return {
                detected: true,
                type: 'SEVERE_RAPID_BETTING',
                severity: 'HIGH',
                details: `${recentBets} bets in 5 minutes - User locked out (Level ${lockoutLevel})`,
                data: { betCount: recentBets, lockoutLevel }
            };
        } else if (recentBets >= this.alertThresholds.rapidBetting) {
            // Warning level - flag user but no lockout yet
            userActivity.flagged = true;
            return {
                detected: true,
                type: 'RAPID_BETTING',
                severity: 'MEDIUM',
                details: `${recentBets} bets in 5 minutes - User flagged for monitoring`,
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
            
            // Log to console and file (single line to avoid duplicates)
            logger.error(`🚨 SECURITY ALERT: ${suspiciousPattern.type} - User: ${userId} - Details: ${suspiciousPattern.details}`);
            
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
     * Build formatted alert message
     */
    buildAlertMessage(userId, pattern) {
        const severityEmojis = {
            'LOW': '🟡',
            'MEDIUM': '🟠', 
            'HIGH': '🔴',
            'CRITICAL': '🚨'
        };

        const emoji = severityEmojis[pattern.severity] || '⚠️';
        
        return `${emoji} **SECURITY ALERT** ${emoji}\n\n` +
               `**Type:** ${pattern.type}\n` +
               `**Severity:** ${pattern.severity}\n` +
               `**User:** <@${userId}> (${userId})\n` +
               `**Details:** ${pattern.details}\n` +
               `**Time:** <t:${Math.floor(Date.now() / 1000)}:F>\n` +
               `**Data:** \`\`\`json\n${JSON.stringify(pattern.data, null, 2)}\`\`\`\n` +
               `**Action Required:** Manual investigation recommended`;
    }

    /**
     * Apply progressive lockout to user
     */
    applyLockout(userId, level) {
        const duration = this.lockoutDurations[level] || this.lockoutDurations[1];
        const until = Date.now() + duration;
        
        const currentLockout = this.lockouts.get(userId);
        const violations = (currentLockout?.violations || 0) + 1;
        
        this.lockouts.set(userId, {
            until,
            level,
            violations,
            appliedAt: Date.now()
        });
        
        logger.warn(`LOCKOUT APPLIED: User ${userId} locked out until ${new Date(until).toISOString()} (Level ${level}, Violations: ${violations})`);
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
        const lockout = this.lockouts.get(userId);
        if (!lockout) return false;
        
        if (lockout.until > Date.now()) {
            return {
                locked: true,
                until: lockout.until,
                level: lockout.level,
                remainingMs: lockout.until - Date.now(),
                violations: lockout.violations
            };
        }
        
        // Lockout expired, remove it
        this.lockouts.delete(userId);
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
     * Get enhanced security statistics
     */
    getSecurityStats() {
        let totalUsers = 0;
        let flaggedUsers = 0;
        let totalEvents = 0;
        
        for (const [userId, activity] of this.userActivityWindows.entries()) {
            totalUsers++;
            if (activity.flagged) flaggedUsers++;
            totalEvents += activity.events.length;
        }

        return {
            totalUsers,
            flaggedUsers,
            totalEvents,
            activeMonitoring: this.userActivityWindows.size,
            activeLockouts: this.lockouts.size,
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
