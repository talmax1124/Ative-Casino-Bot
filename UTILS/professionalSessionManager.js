/**
 * Professional-Grade Session Manager
 * Implements enterprise-level session management with:
 * - Database transactions for ACID compliance
 * - Comprehensive error recovery
 * - State validation and integrity checks
 * - Proper logging and monitoring
 * - Timeout and cleanup mechanisms
 * - Conflict prevention and resolution
 * - Performance optimization
 */

const dbManager = require('./database');
const logger = require('./logger');

// Session states
const SessionState = {
    PENDING: 'pending',
    ACTIVE: 'active', 
    PAUSED: 'paused',
    COMPLETING: 'completing',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    ERROR: 'error',
    TIMEOUT: 'timeout',
    ROLLBACK: 'rollback'
};

// Session operation types
const OperationType = {
    CREATE: 'create',
    UPDATE: 'update', 
    COMPLETE: 'complete',
    CANCEL: 'cancel',
    TIMEOUT: 'timeout',
    ROLLBACK: 'rollback'
};

class ProfessionalSessionManager {
    constructor() {
        this.operationLocks = new Map(); // Prevent concurrent operations on same session
        this.userLocks = new Map(); // Prevent concurrent operations per user
        this.cleanupIntervals = new Map(); // Timeout cleanup timers
        this.metrics = {
            sessionsCreated: 0,
            sessionsCompleted: 0,
            sessionsCancelled: 0,
            sessionsTimedOut: 0,
            operationErrors: 0,
            rollbacksExecuted: 0
        };
        
        // Initialize cleanup scheduler
        this.startCleanupScheduler();
        
        logger.info('Professional Session Manager initialized');
    }

    /**
     * Create a new session with full transaction safety
     */
    async createSession(sessionConfig) {
        const {
            userId,
            guildId,
            channelId,
            gameType,
            betAmount = 0,
            timeout = 300000, // 5 minutes default
            metadata = {}
        } = sessionConfig;

        const lockKey = `${userId}_${gameType}`;
        
        // Acquire user lock to prevent concurrent session creation
        if (this.userLocks.has(lockKey)) {
            return {
                success: false,
                error: 'CONCURRENT_OPERATION',
                message: 'A session operation is already in progress for this user/game combination'
            };
        }

        this.userLocks.set(lockKey, Date.now());
        
        let connection;
        let sessionId;
        
        try {
            // Start database transaction
            connection = await dbManager.pool.getConnection();
            await connection.beginTransaction();
            
            // Generate unique session ID
            sessionId = this.generateSessionId(userId, gameType);
            
            // Validate preconditions within transaction
            const validation = await this.validateSessionCreation(userId, guildId, gameType, connection);
            if (!validation.valid) {
                throw new Error(validation.error);
            }
            
            // Clear any legacy conflicting states
            await this.clearConflictingStates(userId, guildId, gameType, connection);
            
            // Deduct bet amount if applicable
            let balanceSnapshot = null;
            if (betAmount > 0) {
                balanceSnapshot = await this.deductBetAmount(userId, guildId, betAmount, connection);
                if (!balanceSnapshot.success) {
                    throw new Error(balanceSnapshot.error);
                }
            }
            
            // Create session record
            const sessionData = {
                sessionId,
                userId,
                guildId,
                channelId,
                gameType,
                betAmount,
                state: SessionState.ACTIVE,
                metadata: JSON.stringify({
                    ...metadata,
                    createdAt: Date.now(),
                    timeout,
                    balanceSnapshot: balanceSnapshot?.snapshot
                }),
                created_at: new Date(),
                updated_at: new Date(),
                expires_at: new Date(Date.now() + timeout)
            };
            
            await this.insertSessionRecord(sessionData, connection);
            
            // Commit transaction
            await connection.commit();
            
            // Set up timeout handler
            this.scheduleTimeoutHandler(sessionId, timeout);
            
            // Update metrics
            this.metrics.sessionsCreated++;
            
            logger.info(`Professional Session Manager: Created session ${sessionId} for user ${userId}/${gameType}`);
            
            return {
                success: true,
                sessionId,
                session: sessionData
            };
            
        } catch (error) {
            // Rollback transaction on error
            if (connection) {
                try {
                    await connection.rollback();
                    logger.info(`Professional Session Manager: Transaction rolled back for session creation`);
                } catch (rollbackError) {
                    logger.error(`Professional Session Manager: Rollback failed: ${rollbackError.message}`);
                }
            }
            
            this.metrics.operationErrors++;
            
            logger.error(`Professional Session Manager: Session creation failed for ${userId}/${gameType}: ${error.message}`);
            
            return {
                success: false,
                error: error.message,
                errorCode: this.categorizeError(error)
            };
            
        } finally {
            // Release database connection
            if (connection) {
                connection.release();
            }
            
            // Release user lock
            this.userLocks.delete(lockKey);
        }
    }

    /**
     * Update session with state validation and conflict prevention
     */
    async updateSession(sessionId, updateData) {
        const operationLock = `update_${sessionId}`;
        
        if (this.operationLocks.has(operationLock)) {
            return {
                success: false,
                error: 'OPERATION_IN_PROGRESS',
                message: 'Another update operation is in progress for this session'
            };
        }
        
        this.operationLocks.set(operationLock, Date.now());
        
        let connection;
        
        try {
            connection = await dbManager.pool.getConnection();
            await connection.beginTransaction();
            
            // Validate session state
            const session = await this.getSessionWithLock(sessionId, connection);
            if (!session) {
                throw new Error('Session not found');
            }
            
            const stateValidation = this.validateStateTransition(session.state, updateData.state);
            if (!stateValidation.valid) {
                throw new Error(stateValidation.error);
            }
            
            // Update session with optimistic locking
            const updateResult = await this.updateSessionRecord(sessionId, updateData, session.updated_at, connection);
            if (!updateResult.success) {
                throw new Error('Session was modified by another process. Please retry.');
            }
            
            await connection.commit();
            
            logger.info(`Professional Session Manager: Updated session ${sessionId}`);
            
            return {
                success: true,
                sessionId,
                updatedFields: Object.keys(updateData)
            };
            
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            
            this.metrics.operationErrors++;
            
            logger.error(`Professional Session Manager: Session update failed for ${sessionId}: ${error.message}`);
            
            return {
                success: false,
                error: error.message
            };
            
        } finally {
            if (connection) {
                connection.release();
            }
            
            this.operationLocks.delete(operationLock);
        }
    }

    /**
     * Complete session with comprehensive cleanup and validation
     */
    async completeSession(sessionId, completionData = {}) {
        const operationLock = `complete_${sessionId}`;
        
        if (this.operationLocks.has(operationLock)) {
            return {
                success: false,
                error: 'OPERATION_IN_PROGRESS'
            };
        }
        
        this.operationLocks.set(operationLock, Date.now());
        
        let connection;
        
        try {
            connection = await dbManager.pool.getConnection();
            await connection.beginTransaction();
            
            // Get session with lock
            const session = await this.getSessionWithLock(sessionId, connection);
            if (!session) {
                throw new Error('Session not found');
            }
            
            // Validate completion is allowed
            if (![SessionState.ACTIVE, SessionState.PAUSED].includes(session.state)) {
                throw new Error(`Cannot complete session in ${session.state} state`);
            }
            
            // Process completion logic
            const processingResult = await this.processSessionCompletion(session, completionData, connection);
            if (!processingResult.success) {
                throw new Error(processingResult.error);
            }
            
            // Update session to completed state
            await this.updateSessionRecord(sessionId, {
                state: SessionState.COMPLETED,
                completed_at: new Date(),
                completion_data: JSON.stringify(completionData)
            }, session.updated_at, connection);
            
            // Clear timeout handler
            this.clearTimeoutHandler(sessionId);
            
            await connection.commit();
            
            this.metrics.sessionsCompleted++;
            
            logger.info(`Professional Session Manager: Completed session ${sessionId}`);
            
            return {
                success: true,
                sessionId,
                completionData: processingResult.result
            };
            
        } catch (error) {
            if (connection) {
                await connection.rollback();
                this.metrics.rollbacksExecuted++;
            }
            
            this.metrics.operationErrors++;
            
            logger.error(`Professional Session Manager: Session completion failed for ${sessionId}: ${error.message}`);
            
            return {
                success: false,
                error: error.message
            };
            
        } finally {
            if (connection) {
                connection.release();
            }
            
            this.operationLocks.delete(operationLock);
        }
    }

    /**
     * Cancel session with cleanup and refund processing
     */
    async cancelSession(sessionId, reason = 'Cancelled', refundBet = true) {
        const operationLock = `cancel_${sessionId}`;
        
        if (this.operationLocks.has(operationLock)) {
            return { success: false, error: 'OPERATION_IN_PROGRESS' };
        }
        
        this.operationLocks.set(operationLock, Date.now());
        
        let connection;
        
        try {
            connection = await dbManager.pool.getConnection();
            await connection.beginTransaction();
            
            const session = await this.getSessionWithLock(sessionId, connection);
            if (!session) {
                throw new Error('Session not found');
            }
            
            // Process refund if applicable
            if (refundBet && session.betAmount > 0) {
                await this.refundBetAmount(session.userId, session.guildId, session.betAmount, connection);
                logger.info(`Professional Session Manager: Refunded ${session.betAmount} to user ${session.userId}`);
            }
            
            // Update session state
            await this.updateSessionRecord(sessionId, {
                state: SessionState.CANCELLED,
                cancelled_at: new Date(),
                cancel_reason: reason
            }, session.updated_at, connection);
            
            // Clear legacy game flags
            await this.clearGameActiveFlag(session.userId, session.guildId, connection);
            
            // Clear timeout handler
            this.clearTimeoutHandler(sessionId);
            
            await connection.commit();
            
            this.metrics.sessionsCancelled++;
            
            logger.info(`Professional Session Manager: Cancelled session ${sessionId}: ${reason}`);
            
            return {
                success: true,
                sessionId,
                refunded: refundBet && session.betAmount > 0,
                refundAmount: refundBet ? session.betAmount : 0
            };
            
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            
            this.metrics.operationErrors++;
            
            logger.error(`Professional Session Manager: Session cancellation failed for ${sessionId}: ${error.message}`);
            
            return {
                success: false,
                error: error.message
            };
            
        } finally {
            if (connection) {
                connection.release();
            }
            
            this.operationLocks.delete(operationLock);
        }
    }

    /**
     * Handle session timeout with automatic cleanup
     */
    async handleSessionTimeout(sessionId) {
        logger.warn(`Professional Session Manager: Session ${sessionId} timed out`);
        
        const result = await this.cancelSession(sessionId, 'Session timeout', true);
        
        if (result.success) {
            this.metrics.sessionsTimedOut++;
        }
        
        return result;
    }

    /**
     * Get user's active sessions with filtering options
     */
    async getUserSessions(userId, options = {}) {
        const {
            gameType = null,
            states = [SessionState.ACTIVE, SessionState.PAUSED],
            includeMetadata = false
        } = options;
        
        try {
            let query = `
                SELECT sessionId, userId, guildId, channelId, gameType, betAmount, state, 
                       created_at, updated_at, expires_at
                       ${includeMetadata ? ', metadata' : ''}
                FROM game_sessions 
                WHERE userId = ? AND state IN (${states.map(() => '?').join(',')})
            `;
            
            const params = [userId, ...states];
            
            if (gameType) {
                query += ' AND gameType = ?';
                params.push(gameType);
            }
            
            query += ' ORDER BY created_at DESC';
            
            const [sessions] = await dbManager.pool.execute(query, params);
            
            return sessions.map(session => ({
                ...session,
                metadata: includeMetadata && session.metadata ? JSON.parse(session.metadata) : undefined
            }));
            
        } catch (error) {
            logger.error(`Professional Session Manager: Error getting user sessions: ${error.message}`);
            return [];
        }
    }

    /**
     * Force cleanup all user sessions with comprehensive recovery
     */
    async forceCleanupUserSessions(userId, guildId, reason = 'Force cleanup') {
        logger.warn(`Professional Session Manager: Force cleanup initiated for user ${userId}`);
        
        let connection;
        let cleanupResults = {
            sessionsFound: 0,
            sessionsCancelled: 0,
            totalRefunded: 0,
            errors: []
        };
        
        try {
            connection = await dbManager.pool.getConnection();
            await connection.beginTransaction();
            
            // Get all active sessions for user
            const [sessions] = await connection.execute(
                `SELECT sessionId, gameType, betAmount, state FROM game_sessions 
                 WHERE userId = ? AND state IN (?, ?, ?)`,
                [userId, SessionState.ACTIVE, SessionState.PAUSED, SessionState.PENDING]
            );
            
            cleanupResults.sessionsFound = sessions.length;
            
            for (const session of sessions) {
                try {
                    // Refund bet amount
                    if (session.betAmount > 0) {
                        await this.refundBetAmount(userId, guildId, session.betAmount, connection);
                        cleanupResults.totalRefunded += session.betAmount;
                    }
                    
                    // Cancel session
                    await connection.execute(
                        `UPDATE game_sessions 
                         SET state = ?, cancelled_at = NOW(), cancel_reason = ?
                         WHERE sessionId = ?`,
                        [SessionState.CANCELLED, reason, session.sessionId]
                    );
                    
                    // Clear timeout handler
                    this.clearTimeoutHandler(session.sessionId);
                    
                    cleanupResults.sessionsCancelled++;
                    
                } catch (sessionError) {
                    cleanupResults.errors.push({
                        sessionId: session.sessionId,
                        error: sessionError.message
                    });
                }
            }
            
            // Clear legacy game flags
            await this.clearGameActiveFlag(userId, guildId, connection);
            
            // Clear any locks
            this.clearUserLocks(userId);
            
            await connection.commit();
            
            logger.info(`Professional Session Manager: Force cleanup completed for user ${userId}. ` +
                       `${cleanupResults.sessionsCancelled}/${cleanupResults.sessionsFound} sessions cleaned, ` +
                       `$${cleanupResults.totalRefunded} refunded`);
            
            return {
                success: true,
                ...cleanupResults
            };
            
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            
            logger.error(`Professional Session Manager: Force cleanup failed for user ${userId}: ${error.message}`);
            
            return {
                success: false,
                error: error.message,
                ...cleanupResults
            };
            
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    /**
     * Comprehensive session validation
     */
    async validateSession(sessionId) {
        try {
            const [sessions] = await dbManager.pool.execute(
                'SELECT * FROM game_sessions WHERE sessionId = ?',
                [sessionId]
            );
            
            if (sessions.length === 0) {
                return {
                    valid: false,
                    error: 'SESSION_NOT_FOUND',
                    message: 'Session does not exist'
                };
            }
            
            const session = sessions[0];
            
            // Check if session is expired
            if (session.expires_at && new Date() > session.expires_at) {
                return {
                    valid: false,
                    error: 'SESSION_EXPIRED',
                    message: 'Session has expired',
                    session
                };
            }
            
            // Check if session is in valid state
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
                session: {
                    ...session,
                    metadata: session.metadata ? JSON.parse(session.metadata) : {}
                }
            };
            
        } catch (error) {
            logger.error(`Professional Session Manager: Session validation error: ${error.message}`);
            return {
                valid: false,
                error: 'VALIDATION_ERROR',
                message: 'Failed to validate session'
            };
        }
    }

    /**
     * Database table creation for session storage
     */
    async createSessionTable() {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS game_sessions (
                sessionId VARCHAR(50) PRIMARY KEY,
                userId VARCHAR(20) NOT NULL,
                guildId VARCHAR(20) NOT NULL,
                channelId VARCHAR(20) NOT NULL,
                gameType VARCHAR(20) NOT NULL,
                betAmount DECIMAL(15, 2) DEFAULT 0,
                state VARCHAR(20) NOT NULL,
                metadata JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NULL,
                completed_at TIMESTAMP NULL,
                cancelled_at TIMESTAMP NULL,
                cancel_reason TEXT,
                completion_data JSON,
                
                INDEX idx_user_state (userId, state),
                INDEX idx_user_game (userId, gameType),
                INDEX idx_guild_game (guildId, gameType),
                INDEX idx_state (state),
                INDEX idx_expires (expires_at),
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `;
        
        try {
            // Use the database adapter's executeQuery method
            await dbManager.executeQuery(createTableQuery);
            logger.info('Professional Session Manager: Session table created/verified');
        } catch (error) {
            logger.error(`Professional Session Manager: Failed to create session table: ${error.message}`);
            throw error;
        }
    }

    // ==================== PRIVATE HELPER METHODS ====================

    generateSessionId(userId, gameType) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 8);
        return `${gameType}_${userId}_${timestamp}_${random}`;
    }

    async validateSessionCreation(userId, guildId, gameType, connection) {
        try {
            // Check for existing active sessions of same type
            const [existing] = await connection.execute(
                `SELECT COUNT(*) as count FROM game_sessions 
                 WHERE userId = ? AND gameType = ? AND state IN (?, ?)`,
                [userId, gameType, SessionState.ACTIVE, SessionState.PAUSED]
            );
            
            if (existing[0].count > 0) {
                return {
                    valid: false,
                    error: `Active ${gameType} session already exists`
                };
            }
            
            // Check session limits per user
            const [userSessions] = await connection.execute(
                `SELECT COUNT(*) as count FROM game_sessions 
                 WHERE userId = ? AND state IN (?, ?)`,
                [userId, SessionState.ACTIVE, SessionState.PAUSED]
            );
            
            if (userSessions[0].count >= 3) {
                return {
                    valid: false,
                    error: 'Maximum active sessions limit reached (3)'
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

    async clearConflictingStates(userId, guildId, gameType, connection) {
        // Clear legacy game_active flag
        await this.clearGameActiveFlag(userId, guildId, connection);
        
        // Cancel any zombie sessions (older than 1 hour in active state)
        await connection.execute(
            `UPDATE game_sessions 
             SET state = ?, cancelled_at = NOW(), cancel_reason = ?
             WHERE userId = ? AND state = ? AND created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
            [SessionState.CANCELLED, 'Zombie session cleanup', userId, SessionState.ACTIVE]
        );
    }

    async deductBetAmount(userId, guildId, betAmount, connection) {
        try {
            // Get current balance
            const [balance] = await connection.execute(
                'SELECT wallet, bank FROM user_balances WHERE user_id = ?',
                [userId]
            );
            
            if (balance.length === 0 || balance[0].wallet < betAmount) {
                return {
                    success: false,
                    error: 'Insufficient funds'
                };
            }
            
            const currentWallet = balance[0].wallet;
            const newWallet = currentWallet - betAmount;
            
            // Update balance
            await connection.execute(
                'UPDATE user_balances SET wallet = ? WHERE user_id = ?',
                [newWallet, userId]
            );
            
            return {
                success: true,
                snapshot: {
                    previousWallet: currentWallet,
                    newWallet: newWallet,
                    deducted: betAmount
                }
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async refundBetAmount(userId, guildId, amount, connection) {
        await connection.execute(
            'UPDATE user_balances SET wallet = wallet + ? WHERE user_id = ?',
            [amount, userId]
        );
    }

    async clearGameActiveFlag(userId, guildId, connection) {
        await connection.execute(
            'UPDATE user_balances SET game_active = FALSE WHERE user_id = ?',
            [userId]
        );
    }

    async insertSessionRecord(sessionData, connection) {
        await connection.execute(
            `INSERT INTO game_sessions 
             (sessionId, userId, guildId, channelId, gameType, betAmount, state, metadata, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                sessionData.sessionId,
                sessionData.userId,
                sessionData.guildId,
                sessionData.channelId,
                sessionData.gameType,
                sessionData.betAmount,
                sessionData.state,
                sessionData.metadata,
                sessionData.expires_at
            ]
        );
    }

    async getSessionWithLock(sessionId, connection) {
        const [sessions] = await connection.execute(
            'SELECT * FROM game_sessions WHERE sessionId = ? FOR UPDATE',
            [sessionId]
        );
        
        return sessions[0] || null;
    }

    async updateSessionRecord(sessionId, updateData, expectedUpdatedAt, connection) {
        const fields = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updateData)) {
            if (key !== 'sessionId') {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        
        if (fields.length === 0) {
            return { success: true };
        }
        
        fields.push('updated_at = NOW()');
        values.push(sessionId);
        values.push(expectedUpdatedAt);
        
        const query = `
            UPDATE game_sessions 
            SET ${fields.join(', ')} 
            WHERE sessionId = ? AND updated_at = ?
        `;
        
        const [result] = await connection.execute(query, values);
        
        return {
            success: result.affectedRows > 0,
            affectedRows: result.affectedRows
        };
    }

    validateStateTransition(currentState, newState) {
        if (!newState) {
            return { valid: true }; // No state change
        }
        
        const validTransitions = {
            [SessionState.PENDING]: [SessionState.ACTIVE, SessionState.CANCELLED],
            [SessionState.ACTIVE]: [SessionState.PAUSED, SessionState.COMPLETING, SessionState.CANCELLED, SessionState.ERROR],
            [SessionState.PAUSED]: [SessionState.ACTIVE, SessionState.CANCELLED],
            [SessionState.COMPLETING]: [SessionState.COMPLETED, SessionState.ERROR],
            [SessionState.ERROR]: [SessionState.CANCELLED, SessionState.ROLLBACK]
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

    async processSessionCompletion(session, completionData, connection) {
        try {
            // Parse session metadata
            const metadata = session.metadata ? JSON.parse(session.metadata) : {};
            
            // Process winnings/payouts if applicable
            if (completionData.payout && completionData.payout > 0) {
                await connection.execute(
                    'UPDATE user_balances SET wallet = wallet + ? WHERE user_id = ?',
                    [completionData.payout, session.userId]
                );
            }
            
            // Clear game active flag
            await this.clearGameActiveFlag(session.userId, session.guildId, connection);
            
            return {
                success: true,
                result: {
                    payout: completionData.payout || 0,
                    gameResult: completionData.gameResult || 'completed'
                }
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    scheduleTimeoutHandler(sessionId, timeout) {
        const timeoutId = setTimeout(() => {
            this.handleSessionTimeout(sessionId);
        }, timeout);
        
        this.cleanupIntervals.set(sessionId, timeoutId);
    }

    clearTimeoutHandler(sessionId) {
        const timeoutId = this.cleanupIntervals.get(sessionId);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.cleanupIntervals.delete(sessionId);
        }
    }

    clearUserLocks(userId) {
        for (const [lockKey] of this.userLocks) {
            if (lockKey.startsWith(`${userId}_`)) {
                this.userLocks.delete(lockKey);
            }
        }
        
        for (const [operationKey] of this.operationLocks) {
            if (operationKey.includes(userId)) {
                this.operationLocks.delete(operationKey);
            }
        }
    }

    categorizeError(error) {
        const message = error.message.toLowerCase();
        
        if (message.includes('insufficient funds')) {
            return 'INSUFFICIENT_FUNDS';
        } else if (message.includes('already exists')) {
            return 'DUPLICATE_SESSION';
        } else if (message.includes('limit reached')) {
            return 'SESSION_LIMIT';
        } else if (message.includes('timeout')) {
            return 'TIMEOUT';
        } else if (message.includes('state')) {
            return 'INVALID_STATE';
        }
        
        return 'UNKNOWN_ERROR';
    }

    startCleanupScheduler() {
        // Run cleanup every 5 minutes
        setInterval(async () => {
            await this.runPeriodicCleanup();
        }, 300000);
    }

    async runPeriodicCleanup() {
        try {
            // Clean up expired sessions
            const [expiredSessions] = await dbManager.pool.execute(
                `SELECT sessionId FROM game_sessions 
                 WHERE expires_at < NOW() AND state IN (?, ?)`,
                [SessionState.ACTIVE, SessionState.PAUSED]
            );
            
            for (const session of expiredSessions) {
                await this.handleSessionTimeout(session.sessionId);
            }
            
            if (expiredSessions.length > 0) {
                logger.info(`Professional Session Manager: Cleaned up ${expiredSessions.length} expired sessions`);
            }
            
        } catch (error) {
            logger.error(`Professional Session Manager: Periodic cleanup error: ${error.message}`);
        }
    }

    /**
     * Get comprehensive metrics and status
     */
    getStatus() {
        return {
            metrics: { ...this.metrics },
            activeLocks: this.operationLocks.size,
            userLocks: this.userLocks.size,
            timeoutHandlers: this.cleanupIntervals.size,
            uptime: Date.now() - (this.startTime || Date.now())
        };
    }

    /**
     * Initialize the session manager
     */
    async initialize() {
        try {
            await this.createSessionTable();
            this.startTime = Date.now();
            logger.info('Professional Session Manager fully initialized');
            return { success: true };
        } catch (error) {
            logger.error(`Professional Session Manager initialization failed: ${error.message}`);
            throw error;
        }
    }
}

// Export singleton instance
const professionalSessionManager = new ProfessionalSessionManager();

module.exports = professionalSessionManager;