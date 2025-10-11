/**
 * SECURITY LOGGER - Comprehensive exploit detection and alerting
 * Monitors for suspicious activity and sends real-time alerts
 */

const logger = require('./logger');

class SecurityLogger {
    constructor() {
        this.suspiciousActivity = new Map(); // Track per user
        this.alertThresholds = {
            highWinStreak: 10,        // 10 wins in a row
            rapidBetting: 50,         // 50 bets in 5 minutes
            largeWinAmount: 100000,   // 100K+ single win
            totalWinToday: 1000000,   // 1M+ total wins today
            negativeBalance: -1       // Any negative balance
        };
        this.userActivityWindows = new Map(); // Track activity windows
        this.cleanupInterval = setInterval(() => this.cleanup(), 300000); // Cleanup every 5 minutes
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

        // Pattern 3: Rapid betting (50+ bets in 5 minutes)
        const recentBets = userActivity.events.filter(event => 
            (event.type === 'GAME_BET' || event.type === 'GAME_WIN' || event.type === 'GAME_LOSS') && 
            event.timestamp > fiveMinutesAgo
        ).length;

        if (recentBets >= this.alertThresholds.rapidBetting) {
            return {
                detected: true,
                type: 'RAPID_BETTING',
                severity: 'MEDIUM',
                details: `${recentBets} bets in 5 minutes`,
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

        return { detected: false };
    }

    /**
     * Send security alert to admin channel
     */
    async sendSecurityAlert(userId, suspiciousPattern) {
        try {
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
     * Get security statistics
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
            activeMonitoring: this.userActivityWindows.size
        };
    }
}

// Export singleton instance
module.exports = new SecurityLogger();