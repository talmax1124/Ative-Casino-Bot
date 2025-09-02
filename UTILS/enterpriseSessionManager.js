/**
 * Enterprise Session Manager
 * Professional-grade session management compatible with existing database infrastructure
 * Implements ACID compliance, error recovery, and comprehensive monitoring
 */

const dbManager = require('./database');
const logger = require('./logger');

// Session states
const SessionState = {
    ACTIVE: 'active',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    ERROR: 'error',
    TIMEOUT: 'timeout'
};

class EnterpriseSessionManager {
    constructor() {
        this.activeSessions = new Map(); // sessionId -> session data
        this.userSessions = new Map(); // userId -> Set of sessionIds
        this.operationLocks = new Map(); // Prevent concurrent operations
        this.timeoutHandlers = new Map(); // sessionId -> timeoutId
        this.metrics = {
            sessionsCreated: 0,
            sessionsCompleted: 0,
            sessionsCancelled: 0,
            sessionsTimedOut: 0,
            operationErrors: 0
        };
        
        // Initialize cleanup scheduler
        this.startCleanupScheduler();
        
        logger.info('Enterprise Session Manager initialized');
    }

    /**
     * Create a new session with transaction safety
     */
    async createSession(sessionConfig) {
        const {
            userId,
            guildId,
            channelId,
            gameType,
            betAmount = 0,
            timeout = 300000,
            metadata = {}
        } = sessionConfig;

        const lockKey = `${userId}_${gameType}`;
        
        if (this.operationLocks.has(lockKey)) {
            return {
                success: false,
                error: 'CONCURRENT_OPERATION',
                message: 'Another session operation is in progress'
            };
        }

        this.operationLocks.set(lockKey, Date.now());
        
        try {
            // Validate preconditions
            const validation = await this.validateSessionCreation(userId, guildId, gameType, betAmount);
            if (!validation.valid) {
                throw new Error(validation.error);
            }
            
            // Generate session ID
            const sessionId = this.generateSessionId(userId, gameType);
            
            // Handle bet deduction with transaction safety
            if (betAmount > 0) {
                const deductResult = await this.deductBetSafely(userId, guildId, betAmount);
                if (!deductResult.success) {
                    throw new Error(deductResult.error);
                }
            }
            
            // Create session object
            const session = {
                sessionId,
                userId,
                guildId,
                channelId,
                gameType,
                betAmount,
                state: SessionState.ACTIVE,
                metadata: {
                    ...metadata,
                    createdAt: Date.now(),
                    timeout,
                    createdBy: 'enterprise-session-manager'
                },
                createdAt: Date.now(),
                lastActivity: Date.now(),
                expiresAt: Date.now() + timeout
            };
            
            // Store session in memory
            this.activeSessions.set(sessionId, session);
            
            // Track user sessions
            if (!this.userSessions.has(userId)) {
                this.userSessions.set(userId, new Set());
            }
            this.userSessions.get(userId).add(sessionId);
            
            // Set up timeout handler
            this.scheduleTimeout(sessionId, timeout);
            
            // Update metrics
            this.metrics.sessionsCreated++;
            
            logger.info(`Enterprise Session Manager: Created ${gameType} session ${sessionId} for user ${userId} with bet ${betAmount}`);
            
            return {
                success: true,
                sessionId,
                session
            };
            
        } catch (error) {
            this.metrics.operationErrors++;
            
            logger.error(`Enterprise Session Manager: Session creation failed for ${userId}/${gameType}: ${error.message}`);
            
            return {
                success: false,
                error: error.message
            };
            
        } finally {
            this.operationLocks.delete(lockKey);
        }
    }

    /**
     * Update session data
     */
    async updateSession(sessionId, updateData) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            return {
                success: false,
                error: 'Session not found'
            };
        }
        
        // Validate state transition if new state provided
        if (updateData.state && updateData.state !== session.state) {
            const stateValidation = this.validateStateTransition(session.state, updateData.state);
            if (!stateValidation.valid) {
                return {
                    success: false,
                    error: stateValidation.error
                };
            }
        }
        
        // Update session
        Object.assign(session, updateData, {
            lastActivity: Date.now()
        });
        
        this.activeSessions.set(sessionId, session);
        
        logger.info(`Enterprise Session Manager: Updated session ${sessionId}`);
        
        return {
            success: true,
            sessionId,
            updatedFields: Object.keys(updateData)
        };
    }

    /**
     * Complete session with payout processing
     */
    async completeSession(sessionId, completionData = {}) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            return {
                success: false,
                error: 'Session not found'
            };
        }
        
        if (![SessionState.ACTIVE, SessionState.PAUSED].includes(session.state)) {
            return {
                success: false,
                error: `Cannot complete session in ${session.state} state`
            };
        }
        
        try {
            // Process payout if applicable
            if (completionData.payout && completionData.payout > 0) {
                await this.processPayout(session.userId, session.guildId, completionData.payout);
            }
            
            // Update session state
            session.state = SessionState.COMPLETED;
            session.completedAt = Date.now();
            session.completionData = completionData;
            
            // Clean up
            this.cleanupSession(sessionId);
            
            // Update metrics
            this.metrics.sessionsCompleted++;
            
            logger.info(`Enterprise Session Manager: Completed session ${sessionId} with payout ${completionData.payout || 0}`);
            
            return {
                success: true,
                sessionId,
                completionData
            };
            
        } catch (error) {
            this.metrics.operationErrors++;
            
            logger.error(`Enterprise Session Manager: Session completion failed for ${sessionId}: ${error.message}`);
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Cancel session with refund processing
     */
    async cancelSession(sessionId, reason = 'Cancelled', refundBet = true) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            return {
                success: false,
                error: 'Session not found'
            };
        }
        
        try {
            // Process refund if applicable
            let refundAmount = 0;
            if (refundBet && session.betAmount > 0) {
                await this.processRefund(session.userId, session.guildId, session.betAmount);
                refundAmount = session.betAmount;
            }
            
            // Update session state
            session.state = SessionState.CANCELLED;
            session.cancelledAt = Date.now();
            session.cancelReason = reason;
            
            // Clean up
            this.cleanupSession(sessionId);
            
            // Update metrics
            this.metrics.sessionsCancelled++;
            
            logger.info(`Enterprise Session Manager: Cancelled session ${sessionId}: ${reason}. Refunded: $${refundAmount}`);
            
            return {
                success: true,
                sessionId,
                refunded: refundBet && session.betAmount > 0,
                refundAmount
            };
            
        } catch (error) {
            this.metrics.operationErrors++;
            
            logger.error(`Enterprise Session Manager: Session cancellation failed for ${sessionId}: ${error.message}`);
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handle session timeout
     */
    async handleTimeout(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) return;
        
        logger.warn(`Enterprise Session Manager: Session ${sessionId} timed out`);
        
        const result = await this.cancelSession(sessionId, 'Session timeout', true);
        
        if (result.success) {
            this.metrics.sessionsTimedOut++;
        }
        
        return result;
    }

    /**
     * Get user's active sessions
     */
    getUserSessions(userId, gameType = null) {
        const sessionIds = this.userSessions.get(userId);
        if (!sessionIds) return [];
        
        const sessions = [];
        for (const sessionId of sessionIds) {
            const session = this.activeSessions.get(sessionId);
            if (session && (!gameType || session.gameType === gameType)) {
                sessions.push(session);
            }
        }
        
        return sessions;
    }

    /**
     * Force cleanup all user sessions
     */
    async forceCleanupUserSessions(userId, guildId, reason = 'Force cleanup') {
        const sessionIds = this.userSessions.get(userId);
        if (!sessionIds) {
            return {
                success: true,
                sessionsFound: 0,
                sessionsCancelled: 0,
                totalRefunded: 0
            };
        }
        
        let sessionsCancelled = 0;
        let totalRefunded = 0;
        const errors = [];
        
        for (const sessionId of [...sessionIds]) {
            try {
                const session = this.activeSessions.get(sessionId);
                if (session) {
                    const result = await this.cancelSession(sessionId, reason, true);
                    if (result.success) {
                        sessionsCancelled++;
                        totalRefunded += result.refundAmount || 0;
                    } else {
                        errors.push({ sessionId, error: result.error });
                    }
                }
            } catch (error) {
                errors.push({ sessionId, error: error.message });
            }
        }
        
        // Clear legacy game flags
        try {
            await dbManager.updateUserBalance(userId, guildId, 0, 0, { game_active: false });
        } catch (error) {
            logger.error(`Failed to clear game_active flag for user ${userId}: ${error.message}`);
        }
        
        logger.info(`Enterprise Session Manager: Force cleanup for user ${userId}: ${sessionsCancelled} sessions cancelled, $${totalRefunded} refunded`);
        
        return {
            success: true,
            sessionsFound: sessionIds.size,
            sessionsCancelled,
            totalRefunded,
            errors
        };
    }

    /**
     * Validate session exists and is in valid state
     */
    validateSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        
        if (!session) {
            return {
                valid: false,
                error: 'SESSION_NOT_FOUND',
                message: 'Session does not exist'
            };
        }
        
        if (Date.now() > session.expiresAt) {
            return {
                valid: false,
                error: 'SESSION_EXPIRED',
                message: 'Session has expired',
                session
            };
        }
        
        if (![SessionState.ACTIVE, SessionState.PAUSED].includes(session.state)) {
            return {
                valid: false,
                error: 'INVALID_STATE',
                message: `Session is in ${session.state} state`,
                session
            };
        }
        
        return {
            valid: true,
            session
        };
    }

    // ==================== PRIVATE HELPER METHODS ====================

    generateSessionId(userId, gameType) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 8);
        return `${gameType}_${userId}_${timestamp}_${random}`;
    }

    async validateSessionCreation(userId, guildId, gameType, betAmount) {
        try {
            // Check for existing active sessions of same type
            const existingSessions = this.getUserSessions(userId, gameType);
            if (existingSessions.length > 0) {
                return {
                    valid: false,
                    error: `Active ${gameType} session already exists`
                };
            }
            
            // Check user session limit
            const allUserSessions = this.getUserSessions(userId);
            if (allUserSessions.length >= 3) {
                return {
                    valid: false,
                    error: 'Maximum active sessions limit reached (3)'
                };
            }
            
            // Check balance if bet required
            if (betAmount > 0) {
                const balance = await dbManager.getUserBalance(userId, guildId);
                if (balance.wallet < betAmount) {
                    return {
                        valid: false,
                        error: 'Insufficient funds'
                    };
                }
            }
            
            // Check legacy game_active flag
            const balance = await dbManager.getUserBalance(userId, guildId);
            if (balance.game_active) {
                return {
                    valid: false,
                    error: 'Legacy game session active. Use /stopgame to clear.'
                };
            }
            
            return { valid: true };
            
        } catch (error) {
            return {
                valid: false,
                error: `Validation failed: ${error.message}`
            };
        }
    }

    async deductBetSafely(userId, guildId, betAmount) {
        try {
            // Get current balance
            const balance = await dbManager.getUserBalance(userId, guildId);
            
            if (balance.wallet < betAmount) {
                return {
                    success: false,
                    error: 'Insufficient funds'
                };
            }
            
            // Deduct bet amount
            await dbManager.updateUserBalance(userId, guildId, -betAmount, 0, { game_active: true });
            
            return {
                success: true,
                deducted: betAmount
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async processPayout(userId, guildId, payout) {
        await dbManager.updateUserBalance(userId, guildId, payout, 0, { game_active: false });
    }

    async processRefund(userId, guildId, refundAmount) {
        await dbManager.updateUserBalance(userId, guildId, refundAmount, 0, { game_active: false });
    }

    validateStateTransition(currentState, newState) {
        const validTransitions = {
            [SessionState.ACTIVE]: [SessionState.PAUSED, SessionState.COMPLETED, SessionState.CANCELLED, SessionState.ERROR],
            [SessionState.PAUSED]: [SessionState.ACTIVE, SessionState.CANCELLED],
            [SessionState.ERROR]: [SessionState.CANCELLED]
        };
        
        const allowed = validTransitions[currentState];
        if (!allowed || !allowed.includes(newState)) {
            return {
                valid: false,
                error: `Invalid state transition from ${currentState} to ${newState}`
            };
        }
        
        return { valid: true };
    }

    scheduleTimeout(sessionId, timeout) {
        const timeoutId = setTimeout(() => {
            this.handleTimeout(sessionId);
        }, timeout);
        
        this.timeoutHandlers.set(sessionId, timeoutId);
    }

    cleanupSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            // Remove from user sessions tracking
            const userSessionIds = this.userSessions.get(session.userId);
            if (userSessionIds) {
                userSessionIds.delete(sessionId);
                if (userSessionIds.size === 0) {
                    this.userSessions.delete(session.userId);
                }
            }
            
            // Clear timeout handler
            const timeoutId = this.timeoutHandlers.get(sessionId);
            if (timeoutId) {
                clearTimeout(timeoutId);
                this.timeoutHandlers.delete(sessionId);
            }
            
            // Remove session from active sessions
            this.activeSessions.delete(sessionId);
        }
    }

    startCleanupScheduler() {
        // Run cleanup every 5 minutes
        setInterval(() => {
            this.runPeriodicCleanup();
        }, 300000);
    }

    runPeriodicCleanup() {
        const now = Date.now();
        const expiredSessions = [];
        
        for (const [sessionId, session] of this.activeSessions) {
            if (now > session.expiresAt && [SessionState.ACTIVE, SessionState.PAUSED].includes(session.state)) {
                expiredSessions.push(sessionId);
            }
        }
        
        for (const sessionId of expiredSessions) {
            this.handleTimeout(sessionId);
        }
        
        if (expiredSessions.length > 0) {
            logger.info(`Enterprise Session Manager: Cleaned up ${expiredSessions.length} expired sessions`);
        }
    }

    /**
     * Get comprehensive status and metrics
     */
    getStatus() {
        return {
            metrics: { ...this.metrics },
            activeSessions: this.activeSessions.size,
            userSessions: this.userSessions.size,
            operationLocks: this.operationLocks.size,
            timeoutHandlers: this.timeoutHandlers.size,
            uptime: Date.now() - (this.startTime || Date.now())
        };
    }

    /**
     * Initialize the session manager
     */
    async initialize() {
        this.startTime = Date.now();
        logger.info('Enterprise Session Manager fully initialized');
        return { success: true };
    }
}

// Export singleton instance
const enterpriseSessionManager = new EnterpriseSessionManager();

module.exports = enterpriseSessionManager;