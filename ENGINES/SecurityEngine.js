/**
 * 🛡️ SECURITY ENGINE - Protection & Monitoring Center
 * Comprehensive security, anti-abuse, and threat detection system
 * Consolidates all security utilities into unified protection system
 */

const EventEmitter = require('events');
const logger = require('../UTILS/logger');

class SecurityEngine extends EventEmitter {
    constructor() {
        super();
        this.monitoredUsers = new Map(); // userId -> securityProfile
        this.monitoredGames = new Map(); // gameId -> gameSecurityData
        this.threatDatabase = new Map(); // threatId -> threatData
        this.securityRules = new Map(); // ruleId -> rule
        this.engineHealth = 'HEALTHY';
        
        this.stats = {
            threatsDetected: 0,
            usersMonitored: 0,
            gamesProtected: 0,
            actionsBlocked: 0,
            alertsSent: 0
        };
        
        this.initializeEngine();
    }

    /**
     * Initialize Security Engine
     */
    async initializeEngine() {
        try {
            // Load dependencies
            this.securityLogger = require('../UTILS/securityLogger');
            this.stuckGameRecovery = require('../UTILS/stuckGameRecovery');
            
            // Initialize security rules
            this.initializeSecurityRules();
            
            // Start monitoring systems
            this.startContinuousMonitoring();
            
            // Initialize threat detection
            this.initializeThreatDetection();
            
            logger.info('🛡️ SecurityEngine initialized successfully');
            this.engineHealth = 'HEALTHY';
            
        } catch (error) {
            logger.error('❌ SecurityEngine initialization failed:', error);
            this.engineHealth = 'UNHEALTHY';
            throw error;
        }
    }

    /**
     * 🎮 REGISTER GAME FOR MONITORING
     * Start security monitoring for a game session
     */
    registerGame(gameId, userId, guildId, gameType, interaction = null) {
        const gameSecurityData = {
            gameId,
            userId,
            guildId,
            gameType,
            interaction,
            startTime: Date.now(),
            lastActivity: Date.now(),
            actionsCount: 0,
            warned: false,
            riskLevel: 'LOW',
            securityEvents: []
        };
        
        this.monitoredGames.set(gameId, gameSecurityData);
        this.stats.gamesProtected++;
        
        // Set up automatic monitoring
        this.setupGameMonitoring(gameId);
        
        logger.debug(`🛡️ Game registered for security monitoring: ${gameId}`);
        
        return gameSecurityData;
    }

    /**
     * 🔄 UPDATE GAME ACTIVITY
     * Reset monitoring timers when user interacts
     */
    updateActivity(gameId) {
        const gameData = this.monitoredGames.get(gameId);
        if (gameData) {
            gameData.lastActivity = Date.now();
            gameData.actionsCount++;
            
            // Check for suspicious rapid actions
            this.checkRapidActions(gameId);
            
            logger.debug(`🔄 Activity updated for game: ${gameId}`);
        }
    }

    /**
     * 🚫 UNREGISTER GAME
     * Stop monitoring when game ends normally
     */
    unregisterGame(gameId) {
        const gameData = this.monitoredGames.get(gameId);
        if (gameData) {
            // Clear any pending timers
            if (gameData.warningTimer) clearTimeout(gameData.warningTimer);
            if (gameData.releaseTimer) clearTimeout(gameData.releaseTimer);
            
            // Log completion
            const duration = Date.now() - gameData.startTime;
            logger.debug(`🛡️ Game unregistered: ${gameId} (duration: ${duration}ms)`);
            
            this.monitoredGames.delete(gameId);
        }
    }

    /**
     * 🔍 CHECK USER SECURITY
     * Comprehensive security check for user
     */
    async checkUserSecurity(userId) {
        try {
            // Get or create user security profile
            let userProfile = this.monitoredUsers.get(userId);
            if (!userProfile) {
                userProfile = this.createUserSecurityProfile(userId);
                this.monitoredUsers.set(userId, userProfile);
            }
            
            // Check for lockouts
            const lockoutStatus = this.securityLogger.isUserLockedOut(userId);
            if (lockoutStatus && lockoutStatus.locked) {
                return {
                    allowed: false,
                    reason: 'USER_LOCKED_OUT',
                    details: `Locked out for ${Math.ceil(lockoutStatus.remainingMs / 60000)} minutes`,
                    lockoutLevel: lockoutStatus.level
                };
            }
            
            // Check threat level
            const threatLevel = this.calculateThreatLevel(userProfile);
            if (threatLevel === 'CRITICAL') {
                return {
                    allowed: false,
                    reason: 'CRITICAL_THREAT_LEVEL',
                    details: 'User flagged as critical security risk'
                };
            }
            
            // Check rate limits
            const rateLimitCheck = this.checkRateLimits(userProfile);
            if (!rateLimitCheck.allowed) {
                return rateLimitCheck;
            }
            
            // Update last activity
            userProfile.lastActivity = Date.now();
            userProfile.totalChecks++;
            
            return {
                allowed: true,
                threatLevel,
                riskScore: userProfile.riskScore
            };
            
        } catch (error) {
            logger.error(`❌ Security check failed for user ${userId}: ${error.message}`);
            return {
                allowed: false,
                reason: 'SECURITY_CHECK_ERROR',
                details: 'Security system error'
            };
        }
    }

    /**
     * 📝 LOG SECURITY EVENT
     * Record security-related events
     */
    async logSecurityEvent(userId, eventType, eventData = {}) {
        try {
            const securityEvent = {
                id: this.generateEventId(),
                userId,
                eventType,
                eventData,
                timestamp: Date.now(),
                severity: this.calculateEventSeverity(eventType, eventData)
            };
            
            // Store in user profile
            let userProfile = this.monitoredUsers.get(userId);
            if (!userProfile) {
                userProfile = this.createUserSecurityProfile(userId);
                this.monitoredUsers.set(userId, userProfile);
            }
            
            userProfile.securityEvents.push(securityEvent);
            
            // Keep only recent events (last 1000)
            if (userProfile.securityEvents.length > 1000) {
                userProfile.securityEvents = userProfile.securityEvents.slice(-1000);
            }
            
            // Update risk score
            this.updateRiskScore(userProfile, securityEvent);
            
            // Check for threat patterns
            await this.analyzeThreatPatterns(userId, securityEvent);
            
            // Log to security logger
            await this.securityLogger.logSecurityEvent(userId, eventType, eventData);
            
            logger.debug(`🔍 Security event logged: ${eventType} for user ${userId}`);
            
        } catch (error) {
            logger.error(`❌ Failed to log security event: ${error.message}`);
        }
    }

    /**
     * ⚠️ SETUP GAME MONITORING
     * Set up automatic monitoring for game session
     */
    setupGameMonitoring(gameId) {
        const gameData = this.monitoredGames.get(gameId);
        if (!gameData) return;
        
        // Warning timer (1 minute)
        gameData.warningTimer = setTimeout(async () => {
            await this.sendStuckGameWarning(gameId);
        }, 60000);
        
        // Release timer (1.5 minutes)
        gameData.releaseTimer = setTimeout(async () => {
            await this.autoReleaseStuckGame(gameId);
        }, 90000);
    }

    /**
     * ⚠️ SEND STUCK GAME WARNING
     */
    async sendStuckGameWarning(gameId) {
        const gameData = this.monitoredGames.get(gameId);
        if (!gameData || gameData.warned) return;
        
        gameData.warned = true;
        gameData.riskLevel = 'MEDIUM';
        
        try {
            if (gameData.interaction) {
                const warningMessage = {
                    content: `⚠️ **Session Timeout Warning**\n` +
                            `Your ${gameData.gameType} game appears to be stuck.\n` +
                            `The session will be automatically released in 30 seconds.\n` +
                            `If you're still playing, please make a move to continue.`,
                    ephemeral: true
                };
                
                await gameData.interaction.followUp(warningMessage);
            }
            
            await this.logSecurityEvent(gameData.userId, 'STUCK_GAME_WARNING', {
                gameId,
                gameType: gameData.gameType,
                duration: Date.now() - gameData.startTime
            });
            
            logger.warn(`⚠️ Stuck game warning sent: ${gameId}`);
            
        } catch (error) {
            logger.error(`❌ Failed to send stuck game warning: ${error.message}`);
        }
    }

    /**
     * 🔓 AUTO RELEASE STUCK GAME
     */
    async autoReleaseStuckGame(gameId) {
        const gameData = this.monitoredGames.get(gameId);
        if (!gameData) return;
        
        try {
            // Use the stuck game recovery system
            await this.stuckGameRecovery.autoReleaseGame(gameId);
            
            await this.logSecurityEvent(gameData.userId, 'STUCK_GAME_RELEASED', {
                gameId,
                gameType: gameData.gameType,
                duration: Date.now() - gameData.startTime,
                actionsCount: gameData.actionsCount
            });
            
            this.stats.actionsBlocked++;
            logger.info(`🔓 Auto-released stuck game: ${gameId}`);
            
            // Clean up monitoring
            this.unregisterGame(gameId);
            
        } catch (error) {
            logger.error(`❌ Failed to auto-release stuck game: ${error.message}`);
        }
    }

    /**
     * ⚡ CHECK RAPID ACTIONS
     * Detect suspiciously rapid user actions
     */
    checkRapidActions(gameId) {
        const gameData = this.monitoredGames.get(gameId);
        if (!gameData) return;
        
        const now = Date.now();
        const timeSinceLastAction = now - gameData.lastActivity;
        
        // Flag if actions are too rapid (less than 100ms apart)
        if (timeSinceLastAction < 100 && gameData.actionsCount > 1) {
            gameData.riskLevel = 'HIGH';
            
            this.logSecurityEvent(gameData.userId, 'RAPID_ACTIONS_DETECTED', {
                gameId,
                gameType: gameData.gameType,
                actionsCount: gameData.actionsCount,
                timeBetweenActions: timeSinceLastAction
            });
            
            logger.warn(`⚡ Rapid actions detected: ${gameId} (${timeSinceLastAction}ms between actions)`);
        }
    }

    /**
     * 👤 CREATE USER SECURITY PROFILE
     */
    createUserSecurityProfile(userId) {
        return {
            userId,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            riskScore: 0,
            threatLevel: 'LOW',
            totalChecks: 0,
            flaggedActions: 0,
            securityEvents: [],
            rateLimits: {
                gamesPerMinute: 0,
                lastGameTime: 0,
                rapidActionCount: 0
            }
        };
    }

    /**
     * 🎯 CALCULATE THREAT LEVEL
     */
    calculateThreatLevel(userProfile) {
        if (userProfile.riskScore >= 100) return 'CRITICAL';
        if (userProfile.riskScore >= 75) return 'HIGH';
        if (userProfile.riskScore >= 50) return 'MEDIUM';
        return 'LOW';
    }

    /**
     * 📊 UPDATE RISK SCORE
     */
    updateRiskScore(userProfile, securityEvent) {
        const scoreChanges = {
            'RAPID_ACTIONS_DETECTED': +15,
            'STUCK_GAME_WARNING': +5,
            'STUCK_GAME_RELEASED': +10,
            'GAME_BET': +1,
            'GAME_WIN': -1,
            'GAME_LOSS': +2
        };
        
        const scoreChange = scoreChanges[securityEvent.eventType] || 0;
        userProfile.riskScore = Math.max(0, Math.min(100, userProfile.riskScore + scoreChange));
        
        // Decay risk score over time
        const hoursSinceLastActivity = (Date.now() - userProfile.lastActivity) / 3600000;
        if (hoursSinceLastActivity > 1) {
            userProfile.riskScore = Math.max(0, userProfile.riskScore - (hoursSinceLastActivity * 2));
        }
    }

    /**
     * 🚨 ANALYZE THREAT PATTERNS
     */
    async analyzeThreatPatterns(userId, securityEvent) {
        const userProfile = this.monitoredUsers.get(userId);
        if (!userProfile) return;
        
        // Look for concerning patterns in recent events
        const recentEvents = userProfile.securityEvents
            .filter(event => Date.now() - event.timestamp < 300000) // Last 5 minutes
            .slice(-50); // Max 50 recent events
        
        // Pattern: Too many rapid actions
        const rapidActions = recentEvents.filter(e => e.eventType === 'RAPID_ACTIONS_DETECTED');
        if (rapidActions.length >= 3) {
            await this.triggerSecurityAlert(userId, 'PATTERN_RAPID_ACTIONS', {
                count: rapidActions.length,
                timeWindow: '5 minutes'
            });
        }
        
        // Pattern: Multiple stuck games
        const stuckGames = recentEvents.filter(e => e.eventType === 'STUCK_GAME_RELEASED');
        if (stuckGames.length >= 2) {
            await this.triggerSecurityAlert(userId, 'PATTERN_STUCK_GAMES', {
                count: stuckGames.length,
                timeWindow: '5 minutes'
            });
        }
    }

    /**
     * 🚨 TRIGGER SECURITY ALERT
     */
    async triggerSecurityAlert(userId, alertType, alertData) {
        try {
            const alert = {
                id: this.generateEventId(),
                userId,
                alertType,
                alertData,
                timestamp: Date.now(),
                severity: 'HIGH'
            };
            
            // Store threat in database
            this.threatDatabase.set(alert.id, alert);
            
            // Log the alert
            logger.warn(`🚨 SECURITY ALERT: ${alertType} for user ${userId}`);
            
            // Emit security alert event
            this.emit('securityAlert', alert);
            
            this.stats.alertsSent++;
            this.stats.threatsDetected++;
            
        } catch (error) {
            logger.error(`❌ Failed to trigger security alert: ${error.message}`);
        }
    }

    /**
     * 🔒 CHECK RATE LIMITS
     */
    checkRateLimits(userProfile) {
        const now = Date.now();
        const minuteAgo = now - 60000;
        
        // Reset rate limit counters if needed
        if (userProfile.rateLimits.lastGameTime < minuteAgo) {
            userProfile.rateLimits.gamesPerMinute = 0;
        }
        
        // Check games per minute
        if (userProfile.rateLimits.gamesPerMinute >= 20) {
            return {
                allowed: false,
                reason: 'RATE_LIMIT_EXCEEDED',
                details: 'Too many games per minute'
            };
        }
        
        return { allowed: true };
    }

    /**
     * 🆔 Generate unique event ID
     */
    generateEventId() {
        return `sec_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    }

    /**
     * 📊 CALCULATE EVENT SEVERITY
     */
    calculateEventSeverity(eventType, eventData) {
        const severityMap = {
            'RAPID_ACTIONS_DETECTED': 'HIGH',
            'STUCK_GAME_RELEASED': 'MEDIUM',
            'STUCK_GAME_WARNING': 'LOW',
            'GAME_BET': 'INFO',
            'GAME_WIN': 'INFO',
            'GAME_LOSS': 'INFO'
        };
        
        return severityMap[eventType] || 'INFO';
    }

    /**
     * 🔄 START CONTINUOUS MONITORING
     */
    startContinuousMonitoring() {
        // Monitor every 30 seconds
        setInterval(() => {
            this.performSecuritySweep();
        }, 30000);
        
        logger.info('🔄 Continuous security monitoring started');
    }

    /**
     * 🔍 PERFORM SECURITY SWEEP
     */
    async performSecuritySweep() {
        try {
            // Check all monitored games for timeouts
            for (const [gameId, gameData] of this.monitoredGames) {
                const duration = Date.now() - gameData.startTime;
                
                // Flag very long games
                if (duration > 600000) { // 10 minutes
                    logger.warn(`🔍 Very long game detected: ${gameId} (${Math.round(duration/60000)} minutes)`);
                    await this.autoReleaseStuckGame(gameId);
                }
            }
            
            // Clean up old user profiles
            this.cleanupOldProfiles();
            
        } catch (error) {
            logger.error(`❌ Security sweep error: ${error.message}`);
        }
    }

    /**
     * 🧹 CLEANUP OLD PROFILES
     */
    cleanupOldProfiles() {
        const now = Date.now();
        const oneDayAgo = now - 86400000; // 24 hours
        
        for (const [userId, profile] of this.monitoredUsers) {
            if (profile.lastActivity < oneDayAgo && profile.riskScore === 0) {
                this.monitoredUsers.delete(userId);
            }
        }
    }

    /**
     * 🏥 HEALTH CHECK
     */
    isHealthy() {
        return this.engineHealth === 'HEALTHY';
    }

    /**
     * 📊 GET ENGINE STATISTICS
     */
    getStats() {
        return {
            ...this.stats,
            monitoredGames: this.monitoredGames.size,
            monitoredUsers: this.monitoredUsers.size,
            threatDatabase: this.threatDatabase.size,
            engineHealth: this.engineHealth
        };
    }

    /**
     * ⚙️ INITIALIZE SECURITY RULES
     */
    initializeSecurityRules() {
        // Define security rules
        this.securityRules.set('MAX_GAMES_PER_MINUTE', { limit: 20, action: 'BLOCK' });
        this.securityRules.set('MAX_RAPID_ACTIONS', { limit: 5, action: 'WARN' });
        this.securityRules.set('MAX_STUCK_GAMES', { limit: 3, action: 'INVESTIGATE' });
        
        logger.debug('🛡️ Security rules initialized');
    }

    /**
     * 🔧 INITIALIZE THREAT DETECTION
     */
    initializeThreatDetection() {
        // Set up advanced threat detection patterns
        // This would include ML models, behavioral analysis, etc.
        logger.debug('🔧 Threat detection systems initialized');
    }
}

// Export singleton instance
module.exports = new SecurityEngine();