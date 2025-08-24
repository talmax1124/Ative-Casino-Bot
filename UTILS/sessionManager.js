/**
 * Session Management Utility for ATIVE Casino Bot
 * Handles all game sessions, Firebase persistence, timeouts, and session monitoring
 */

const { EmbedBuilder, Collection } = require('discord.js');
const dbManager = require('./database');
const { buildSessionEmbed } = require('./gameSessionKit');
const logger = require('./logger');

// Session states
const SessionState = {
    ACTIVE: 'active',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    TIMEOUT: 'timeout',
    CANCELLED: 'cancelled',
    ERROR: 'error'
};

// Game types
const GameType = {
    BLACKJACK: 'blackjack',
    SLOTS: 'slots',
    PLINKO: 'plinko',
    CRASH: 'crash',
    ROULETTE: 'roulette',
    FISHING: 'fishing',
    HEIST: 'heist',
    BATTLESHIP: 'battleship',
    WORDCHAIN: 'wordchain',
    UNO: 'uno',
    RPS: 'rps',
    BINGO: 'bingo',
    DUCK: 'duck'
};

// Session configuration
const SESSION_CONFIG = {
    DEFAULT_TIMEOUT: 30000, // 30 seconds default timeout
    MAX_SESSIONS_PER_USER: 3, // Maximum concurrent sessions per user
    CLEANUP_INTERVAL: 60000, // 1 minute cleanup interval
    PERSISTENCE_ENABLED: true, // Save sessions to Firebase
    AUTO_TIMEOUT_ENABLED: true, // Enable automatic timeouts
    SESSION_HISTORY_DAYS: 7 // Keep session history for 7 days
};

class SessionManager {
    constructor() {
        this.activeSessions = new Collection(); // Map<sessionId, SessionData>
        this.userSessions = new Collection();   // Map<userId, Set<sessionId>>
        this.timeouts = new Collection();       // Map<sessionId, timeoutId>
        this.client = null;
        this.cleanupInterval = null;
        
        this.sessionStats = {
            totalSessions: 0,
            activeSessions: 0,
            completedSessions: 0,
            timeoutSessions: 0,
            cancelledSessions: 0,
            errors: 0
        };
    }

    /**
     * Initialize the session manager
     */
    async initialize(client) {
        this.client = client;
        
        try {
            // Load active sessions from Firebase
            await this.loadActiveSessionsFromFirebase();
            
            // Start cleanup interval
            this.startCleanupInterval();
            
            logger.info('Session Manager: Initialized successfully');
        } catch (error) {
            logger.error(`Session Manager: Initialization failed: ${error.message}`);
        }
    }

    /**
     * Create a new game session
     */
    async createSession(sessionData) {
        const {
            userId,
            guildId,
            channelId,
            gameType,
            betAmount = 0,
            timeout = SESSION_CONFIG.DEFAULT_TIMEOUT,
            metadata = {}
        } = sessionData;

        try {
            // Validate user can create new session
            const canCreate = await this.canCreateSession(userId);
            if (!canCreate.allowed) {
                throw new Error(canCreate.reason);
            }

            // Generate unique session ID
            const sessionId = this.generateSessionId(userId, gameType);
            
            // Create session object
            const session = {
                sessionId,
                userId,
                guildId,
                channelId,
                gameType,
                betAmount,
                state: SessionState.ACTIVE,
                createdAt: Date.now(),
                lastActivity: Date.now(),
                timeout,
                metadata: {
                    ...metadata,
                    version: '1.0',
                    clientId: this.client?.user?.id
                },
                gameData: {},
                history: []
            };

            // Store session
            this.activeSessions.set(sessionId, session);
            
            // Track user sessions
            if (!this.userSessions.has(userId)) {
                this.userSessions.set(userId, new Set());
            }
            this.userSessions.get(userId).add(sessionId);

            // Set timeout if enabled
            if (SESSION_CONFIG.AUTO_TIMEOUT_ENABLED && timeout > 0) {
                await this.setSessionTimeout(sessionId, timeout);
            }

            // Save to Firebase
            if (SESSION_CONFIG.PERSISTENCE_ENABLED) {
                await this.saveSessionToFirebase(session);
            }

            // Update statistics
            this.sessionStats.totalSessions++;
            this.sessionStats.activeSessions++;

            // Log session creation
            logger.info(`Session Manager: Created session ${sessionId} for user ${userId} (${gameType})`);

            return {
                success: true,
                sessionId,
                session
            };

        } catch (error) {
            logger.error(`Session Manager: Failed to create session: ${error.message}`);
            this.sessionStats.errors++;
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get session by ID
     */
    getSession(sessionId) {
        return this.activeSessions.get(sessionId) || null;
    }

    /**
     * Get all sessions for a user
     */
    getUserSessions(userId) {
        const userSessionIds = this.userSessions.get(userId);
        if (!userSessionIds) return [];

        return Array.from(userSessionIds)
            .map(id => this.activeSessions.get(id))
            .filter(session => session);
    }

    /**
     * Update session data
     */
    async updateSession(sessionId, updateData) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        try {
            // Update session data
            Object.assign(session, updateData, {
                lastActivity: Date.now()
            });

            // Add to history if significant update
            if (updateData.state || updateData.gameData) {
                session.history.push({
                    timestamp: Date.now(),
                    action: updateData.action || 'update',
                    data: { ...updateData }
                });
            }

            // Update in Firebase
            if (SESSION_CONFIG.PERSISTENCE_ENABLED) {
                await this.saveSessionToFirebase(session);
            }

            logger.debug(`Session Manager: Updated session ${sessionId}`);
            return session;

        } catch (error) {
            logger.error(`Session Manager: Failed to update session ${sessionId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Complete a session
     */
    async completeSession(sessionId, completionData = {}) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        try {
            // Update session state
            await this.updateSession(sessionId, {
                state: SessionState.COMPLETED,
                completedAt: Date.now(),
                completionData,
                action: 'complete'
            });

            // Clear timeout
            await this.clearSessionTimeout(sessionId);

            // Move to completed sessions in Firebase
            if (SESSION_CONFIG.PERSISTENCE_ENABLED) {
                await this.archiveSession(session);
            }

            // Clean up local storage
            this.removeSessionFromMemory(sessionId);

            // Update statistics
            this.sessionStats.activeSessions--;
            this.sessionStats.completedSessions++;

            logger.info(`Session Manager: Completed session ${sessionId} for user ${session.userId}`);

            return {
                success: true,
                session
            };

        } catch (error) {
            logger.error(`Session Manager: Failed to complete session ${sessionId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Cancel a session (STOPGAME functionality)
     */
    async cancelSession(sessionId, reason = 'User cancelled', cancelledBy = null) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        try {
            // Update session state
            await this.updateSession(sessionId, {
                state: SessionState.CANCELLED,
                cancelledAt: Date.now(),
                cancelledBy,
                cancellationReason: reason,
                action: 'cancel'
            });

            // Handle game-specific cancellation logic
            await this.handleGameCancellation(session);

            // Clear timeout
            await this.clearSessionTimeout(sessionId);

            // Archive session
            if (SESSION_CONFIG.PERSISTENCE_ENABLED) {
                await this.archiveSession(session);
            }

            // Clean up local storage
            this.removeSessionFromMemory(sessionId);

            // Update statistics
            this.sessionStats.activeSessions--;
            this.sessionStats.cancelledSessions++;

            logger.info(`Session Manager: Cancelled session ${sessionId} by ${cancelledBy || 'system'}: ${reason}`);

            return {
                success: true,
                session,
                refunded: session.gameData?.refunded || false
            };

        } catch (error) {
            logger.error(`Session Manager: Failed to cancel session ${sessionId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Cancel all sessions for a user (STOPGAME all)
     */
    async cancelUserSessions(userId, reason = 'User stop all games', cancelledBy = null) {
        const userSessions = this.getUserSessions(userId);
        const results = [];

        for (const session of userSessions) {
            try {
                const result = await this.cancelSession(session.sessionId, reason, cancelledBy);
                results.push({
                    sessionId: session.sessionId,
                    gameType: session.gameType,
                    ...result
                });
            } catch (error) {
                results.push({
                    sessionId: session.sessionId,
                    gameType: session.gameType,
                    success: false,
                    error: error.message
                });
            }
        }

        logger.info(`Session Manager: Cancelled ${results.length} sessions for user ${userId}`);
        return results;
    }

    /**
     * Handle session timeout
     */
    async handleSessionTimeout(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) return;

        try {
            logger.warn(`Session Manager: Session ${sessionId} timed out`);

            // Update session state
            await this.updateSession(sessionId, {
                state: SessionState.TIMEOUT,
                timeoutAt: Date.now(),
                action: 'timeout'
            });

            // Handle game-specific timeout logic
            await this.handleGameTimeout(session);

            // Notify user if possible
            await this.notifySessionTimeout(session);

            // Archive session
            if (SESSION_CONFIG.PERSISTENCE_ENABLED) {
                await this.archiveSession(session);
            }

            // Clean up
            this.removeSessionFromMemory(sessionId);

            // Update statistics
            this.sessionStats.activeSessions--;
            this.sessionStats.timeoutSessions++;

        } catch (error) {
            logger.error(`Session Manager: Error handling timeout for session ${sessionId}: ${error.message}`);
        }
    }

    /**
     * Set session timeout
     */
    async setSessionTimeout(sessionId, timeout) {
        // Clear existing timeout
        await this.clearSessionTimeout(sessionId);

        // Set new timeout
        const timeoutId = setTimeout(() => {
            this.handleSessionTimeout(sessionId);
        }, timeout);

        this.timeouts.set(sessionId, timeoutId);
        logger.debug(`Session Manager: Set timeout for session ${sessionId} (${timeout}ms)`);
    }

    /**
     * Clear session timeout
     */
    async clearSessionTimeout(sessionId) {
        const timeoutId = this.timeouts.get(sessionId);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.timeouts.delete(sessionId);
            logger.debug(`Session Manager: Cleared timeout for session ${sessionId}`);
        }
    }

    /**
     * Check if user can create a new session
     */
    async canCreateSession(userId) {
        const userSessions = this.getUserSessions(userId);
        
        if (userSessions.length >= SESSION_CONFIG.MAX_SESSIONS_PER_USER) {
            return {
                allowed: false,
                reason: `Maximum ${SESSION_CONFIG.MAX_SESSIONS_PER_USER} concurrent sessions allowed`
            };
        }

        return {
            allowed: true
        };
    }

    /**
     * Get session statistics
     */
    getSessionStats() {
        return {
            ...this.sessionStats,
            activeSessions: this.activeSessions.size,
            activeUsers: this.userSessions.size,
            avgSessionsPerUser: this.userSessions.size > 0 
                ? (this.activeSessions.size / this.userSessions.size).toFixed(2)
                : 0
        };
    }

    /**
     * Get detailed session info for dev commands
     */
    getDetailedSessionInfo(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) return null;

        return {
            ...session,
            duration: Date.now() - session.createdAt,
            timeSinceLastActivity: Date.now() - session.lastActivity,
            hasTimeout: this.timeouts.has(sessionId),
            timeoutRemaining: this.getTimeoutRemaining(sessionId)
        };
    }

    /**
     * Get all active sessions (for dev monitoring)
     */
    getAllActiveSessions() {
        return Array.from(this.activeSessions.values()).map(session => ({
            sessionId: session.sessionId,
            userId: session.userId,
            gameType: session.gameType,
            state: session.state,
            duration: Date.now() - session.createdAt,
            betAmount: session.betAmount,
            lastActivity: new Date(session.lastActivity).toLocaleString()
        }));
    }

    /**
     * Force cleanup of stale sessions (dev command)
     */
    async forceCleanup(olderThanMinutes = 30) {
        const cutoffTime = Date.now() - (olderThanMinutes * 60 * 1000);
        const staleSessions = Array.from(this.activeSessions.values())
            .filter(session => session.lastActivity < cutoffTime);

        let cleaned = 0;
        for (const session of staleSessions) {
            try {
                await this.cancelSession(
                    session.sessionId, 
                    `Force cleanup - inactive for ${olderThanMinutes}+ minutes`,
                    'system'
                );
                cleaned++;
            } catch (error) {
                logger.error(`Session Manager: Failed to cleanup session ${session.sessionId}: ${error.message}`);
            }
        }

        logger.info(`Session Manager: Force cleanup removed ${cleaned} stale sessions`);
        return {
            cleaned,
            staleSessions: staleSessions.length
        };
    }

    // ==================== FIREBASE INTEGRATION ====================

    /**
     * Save session to Firebase
     */
    async saveSessionToFirebase(session) {
        try {
            const sessionRef = dbManager.db.collection('active_sessions').doc(session.sessionId);
            await sessionRef.set({
                ...session,
                savedAt: Date.now()
            });
        } catch (error) {
            logger.error(`Session Manager: Failed to save session to Firebase: ${error.message}`);
        }
    }

    /**
     * Load active sessions from Firebase
     */
    async loadActiveSessionsFromFirebase() {
        try {
            const snapshot = await dbManager.db.collection('active_sessions').get();
            let loaded = 0;

            snapshot.forEach(doc => {
                const session = doc.data();
                
                // Validate session is still relevant
                const age = Date.now() - session.lastActivity;
                if (age < (SESSION_CONFIG.DEFAULT_TIMEOUT * 2)) {
                    this.activeSessions.set(session.sessionId, session);
                    
                    if (!this.userSessions.has(session.userId)) {
                        this.userSessions.set(session.userId, new Set());
                    }
                    this.userSessions.get(session.userId).add(session.sessionId);
                    
                    loaded++;
                }
            });

            logger.info(`Session Manager: Loaded ${loaded} active sessions from Firebase`);
        } catch (error) {
            logger.error(`Session Manager: Failed to load sessions from Firebase: ${error.message}`);
        }
    }

    /**
     * Archive completed/cancelled sessions
     */
    async archiveSession(session) {
        try {
            // Move to session history
            await dbManager.db.collection('session_history').doc(session.sessionId).set({
                ...session,
                archivedAt: Date.now()
            });

            // Remove from active sessions
            await dbManager.db.collection('active_sessions').doc(session.sessionId).delete();

        } catch (error) {
            logger.error(`Session Manager: Failed to archive session: ${error.message}`);
        }
    }

    // ==================== GAME-SPECIFIC HANDLERS ====================

    /**
     * Handle game-specific cancellation logic
     */
    async handleGameCancellation(session) {
        try {
            switch (session.gameType) {
                case GameType.BLACKJACK:
                case GameType.PLINKO:
                case GameType.CRASH:
                case GameType.SLOTS:
                    // Refund bet if game was active
                    if (session.betAmount > 0 && session.gameData?.gameStarted) {
                        await this.refundBet(session);
                    }
                    break;
                    
                case GameType.HEIST:
                case GameType.FISHING:
                    // Handle team/multi-user games differently
                    await this.handleMultiUserGameCancellation(session);
                    break;
                    
                default:
                    // Default cancellation logic
                    break;
            }
        } catch (error) {
            logger.error(`Session Manager: Error in game cancellation handler: ${error.message}`);
        }
    }

    /**
     * Handle game-specific timeout logic
     */
    async handleGameTimeout(session) {
        try {
            // Similar to cancellation but with timeout-specific logic
            await this.handleGameCancellation(session);
            
            // Additional timeout-specific handling
            if (session.gameType === GameType.BLACKJACK) {
                // Auto-stand in blackjack
                session.gameData.autoAction = 'stand';
            }
            
        } catch (error) {
            logger.error(`Session Manager: Error in game timeout handler: ${error.message}`);
        }
    }

    /**
     * Refund bet for cancelled/timeout games
     */
    async refundBet(session) {
        try {
            if (session.betAmount > 0) {
                await dbManager.updateUserBalance(
                    session.userId, 
                    session.guildId, 
                    session.betAmount, 
                    0, 
                    { game_active: false }
                );
                
                session.gameData.refunded = true;
                session.gameData.refundAmount = session.betAmount;
                
                logger.info(`Session Manager: Refunded ${session.betAmount} to user ${session.userId}`);
            }
        } catch (error) {
            logger.error(`Session Manager: Failed to refund bet: ${error.message}`);
        }
    }

    /**
     * Handle multi-user game cancellation
     */
    async handleMultiUserGameCancellation(session) {
        // Implementation for games like heist, fishing that involve multiple users
        logger.info(`Session Manager: Handling multi-user game cancellation for ${session.gameType}`);
    }

    /**
     * Notify user of session timeout
     */
    async notifySessionTimeout(session) {
        try {
            if (!this.client) return;

            const channel = await this.client.channels.fetch(session.channelId);
            if (!channel) return;

            const embed = buildSessionEmbed({
                title: '⏰ Session Timeout',
                topFields: [
                    { 
                        name: 'Game Session Expired', 
                        value: `Your ${session.gameType} session has timed out due to inactivity.${session.gameData?.refunded ? '\n✅ Your bet has been refunded.' : ''}` 
                    }
                ],
                stageText: 'SESSION EXPIRED',
                color: 0xFFAA00,
                footer: 'Session Manager • Use /stopgame to cancel active games'
            });

            await channel.send({ 
                content: `<@${session.userId}>`, 
                embeds: [embed] 
            });

        } catch (error) {
            logger.error(`Session Manager: Failed to notify timeout: ${error.message}`);
        }
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Generate unique session ID
     */
    generateSessionId(userId, gameType) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `${gameType}_${userId}_${timestamp}_${random}`;
    }

    /**
     * Get timeout remaining for session
     */
    getTimeoutRemaining(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session || !this.timeouts.has(sessionId)) return 0;
        
        const elapsed = Date.now() - session.lastActivity;
        const remaining = session.timeout - elapsed;
        return Math.max(0, remaining);
    }

    /**
     * Remove session from memory
     */
    removeSessionFromMemory(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            // Remove from user sessions
            const userSessionSet = this.userSessions.get(session.userId);
            if (userSessionSet) {
                userSessionSet.delete(sessionId);
                if (userSessionSet.size === 0) {
                    this.userSessions.delete(session.userId);
                }
            }
        }

        // Remove from active sessions and timeouts
        this.activeSessions.delete(sessionId);
        this.clearSessionTimeout(sessionId);
    }

    /**
     * Start cleanup interval
     */
    startCleanupInterval() {
        this.cleanupInterval = setInterval(async () => {
            await this.performPeriodicCleanup();
        }, SESSION_CONFIG.CLEANUP_INTERVAL);

        logger.debug('Session Manager: Started periodic cleanup interval');
    }

    /**
     * Perform periodic cleanup
     */
    async performPeriodicCleanup() {
        try {
            const now = Date.now();
            const expiredSessions = Array.from(this.activeSessions.values())
                .filter(session => {
                    const age = now - session.lastActivity;
                    return age > (session.timeout * 2); // Cleanup if double timeout elapsed
                });

            for (const session of expiredSessions) {
                await this.handleSessionTimeout(session.sessionId);
            }

            if (expiredSessions.length > 0) {
                logger.info(`Session Manager: Cleaned up ${expiredSessions.length} expired sessions`);
            }

        } catch (error) {
            logger.error(`Session Manager: Error in periodic cleanup: ${error.message}`);
        }
    }

    /**
     * Shutdown session manager
     */
    async shutdown() {
        try {
            // Clear cleanup interval
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
            }

            // Clear all timeouts
            for (const timeoutId of this.timeouts.values()) {
                clearTimeout(timeoutId);
            }

            // Save all active sessions to Firebase
            if (SESSION_CONFIG.PERSISTENCE_ENABLED) {
                const promises = Array.from(this.activeSessions.values())
                    .map(session => this.saveSessionToFirebase(session));
                await Promise.all(promises);
            }

            logger.info('Session Manager: Shutdown completed');

        } catch (error) {
            logger.error(`Session Manager: Error during shutdown: ${error.message}`);
        }
    }
}

// Export singleton instance and constants
const sessionManager = new SessionManager();

module.exports = {
    sessionManager,
    SessionState,
    GameType,
    SESSION_CONFIG
};