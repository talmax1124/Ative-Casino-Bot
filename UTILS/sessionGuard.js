/**
 * Session Guard - Enhanced session protection and recovery system
 * Prevents session conflicts and ensures game stability
 */

// sessionManager removed (Firebase dependency) - using mock implementation
const sessionManager = {
    canCreateSession: async (userId) => ({ allowed: true }),
    createSession: async (sessionConfig) => {
        try {
            const sessionId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            return {
                success: true, 
                sessionId,
                session: {
                    ...sessionConfig,
                    sessionId,
                    createdAt: Date.now(),
                    state: 'active'
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message || 'Failed to create mock session'
            };
        }
    },
    endSession: async (sessionId) => ({ success: true }),
    updateSession: async (sessionId, data) => ({ success: true }),
    completeSession: async (sessionId, data) => ({ success: true }),
    cancelSession: async (sessionId, reason, source) => ({ success: true }),
    cancelUserSessions: async (userId, reason, source) => ({ success: true }),
    getUserSessions: (userId) => [],
    getSession: (sessionId) => null,
    getActiveSessionCount: () => 0
};
const GameType = { BLACKJACK: 'blackjack', SLOTS: 'slots', UNO: 'uno' };
const SessionState = { ACTIVE: 'active', COMPLETED: 'completed', FAILED: 'failed' };
const dbManager = require('./database');
const logger = require('./logger');

class SessionGuard {
    constructor() {
        this.sessionLocks = new Map(); // Prevent concurrent session operations
        this.recoveryAttempts = new Map(); // Track recovery attempts
        this.conflictLog = [];
    }

    /**
     * Safe session creation with conflict prevention
     */
    async createSafeSession(sessionConfig) {
        const { userId, gameType, guildId } = sessionConfig;
        const lockKey = `${userId}_${gameType}`;
        
        // Prevent concurrent session creation
        if (this.sessionLocks.has(lockKey)) {
            logger.warn(`Session Guard: Blocked concurrent session creation for ${lockKey}`);
            return {
                success: false,
                error: 'CONCURRENT_CREATION',
                message: 'Another session is being created. Please wait a moment.'
            };
        }

        this.sessionLocks.set(lockKey, Date.now());
        
        try {
            // Pre-check: Clean up any orphaned sessions
            await this.cleanupOrphanedSessions(userId, gameType);
            
            // Pre-check: Ensure no conflicting sessions exist
            const conflictCheck = await this.checkForConflicts(userId, gameType, guildId);
            if (!conflictCheck.safe) {
                throw new Error(conflictCheck.reason);
            }
            
            // Clear legacy game_active flags
            await this.clearLegacyGameFlags(userId, guildId);
            
            // Create the session
            const result = await sessionManager.createSession(sessionConfig);
            
            if (result.success) {
                logger.info(`Session Guard: Successfully created session ${result.sessionId}`);
            }
            
            return result;
            
        } catch (error) {
            logger.error(`Session Guard: Failed to create safe session: ${error.message}`);
            
            // Attempt recovery
            await this.attemptSessionRecovery(userId, gameType, guildId);
            
            return {
                success: false,
                error: error.message
            };
            
        } finally {
            // Release lock
            this.sessionLocks.delete(lockKey);
        }
    }

    /**
     * Check for session conflicts
     */
    async checkForConflicts(userId, gameType, guildId) {
        try {
            // Check existing sessions
            const userSessions = sessionManager.getUserSessions(userId);
            
            // Check for same game type
            const sameGameSession = userSessions.find(s => 
                s.gameType === gameType && 
                s.state === SessionState.ACTIVE
            );
            
            if (sameGameSession) {
                this.logConflict(userId, gameType, 'SAME_GAME_ACTIVE');
                return {
                    safe: false,
                    reason: `Active ${gameType} session already exists`
                };
            }
            
            // Check for too many active sessions
            const activeSessions = userSessions.filter(s => 
                s.state === SessionState.ACTIVE
            );
            
            if (activeSessions.length >= 3) {
                this.logConflict(userId, gameType, 'TOO_MANY_SESSIONS');
                return {
                    safe: false,
                    reason: 'Too many active sessions (maximum 3)'
                };
            }
            
            // Check for recent timeouts (prevent rapid re-creation)
            const recentTimeout = userSessions.find(s => {
                if (s.state !== SessionState.TIMEOUT) return false;
                const timeSinceTimeout = Date.now() - (s.timeoutAt || 0);
                return timeSinceTimeout < 5000; // 5 second cooldown
            });
            
            if (recentTimeout) {
                this.logConflict(userId, gameType, 'RECENT_TIMEOUT');
                return {
                    safe: false,
                    reason: 'Please wait a moment after timeout before starting a new game'
                };
            }
            
            return { safe: true };
            
        } catch (error) {
            logger.error(`Session Guard: Conflict check error: ${error.message}`);
            return { safe: false, reason: 'Conflict check failed' };
        }
    }

    /**
     * Clean up orphaned sessions
     */
    async cleanupOrphanedSessions(userId, gameType) {
        try {
            const userSessions = sessionManager.getUserSessions(userId);
            const orphaned = userSessions.filter(s => {
                // Consider orphaned if:
                // 1. State is active but no activity for 5+ minutes
                // 2. State is paused for 10+ minutes
                // 3. Has no timeout set but should have one
                
                const inactiveTime = Date.now() - s.lastActivity;
                
                if (s.state === SessionState.ACTIVE && inactiveTime > 300000) {
                    return true;
                }
                
                if (s.state === SessionState.PAUSED && inactiveTime > 600000) {
                    return true;
                }
                
                return false;
            });
            
            for (const session of orphaned) {
                logger.warn(`Session Guard: Cleaning up orphaned session ${session.sessionId}`);
                await sessionManager.cancelSession(
                    session.sessionId,
                    'Orphaned session cleanup',
                    'session-guard'
                );
            }
            
            if (orphaned.length > 0) {
                logger.info(`Session Guard: Cleaned up ${orphaned.length} orphaned sessions for user ${userId}`);
            }
            
        } catch (error) {
            logger.error(`Session Guard: Orphaned cleanup error: ${error.message}`);
        }
    }

    /**
     * Clear legacy game_active flags
     */
    async clearLegacyGameFlags(userId, guildId) {
        try {
            const balance = await dbManager.getUserBalance(userId, guildId);
            if (balance.game_active) {
                await dbManager.updateUserBalance(userId, guildId, 0, 0, { game_active: false });
                logger.info(`Session Guard: Cleared legacy game_active flag for user ${userId}`);
            }
        } catch (error) {
            logger.error(`Session Guard: Failed to clear legacy flags: ${error.message}`);
        }
    }

    /**
     * Attempt session recovery
     */
    async attemptSessionRecovery(userId, gameType, guildId) {
        const recoveryKey = `${userId}_${gameType}`;
        const attempts = this.recoveryAttempts.get(recoveryKey) || 0;
        
        if (attempts >= 3) {
            logger.error(`Session Guard: Max recovery attempts reached for ${recoveryKey}`);
            return false;
        }
        
        this.recoveryAttempts.set(recoveryKey, attempts + 1);
        
        try {
            // Cancel all user sessions
            await sessionManager.cancelUserSessions(userId, 'Recovery cleanup', 'session-guard');
            
            // Clear all game flags
            await this.clearLegacyGameFlags(userId, guildId);
            
            // Clear recovery attempts after success
            setTimeout(() => {
                this.recoveryAttempts.delete(recoveryKey);
            }, 60000); // Clear after 1 minute
            
            logger.info(`Session Guard: Recovery successful for ${recoveryKey}`);
            return true;
            
        } catch (error) {
            logger.error(`Session Guard: Recovery failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Validate session state before operations
     */
    async validateSessionState(sessionId) {
        try {
            const session = sessionManager.getSession(sessionId);
            
            if (!session) {
                return {
                    valid: false,
                    error: 'SESSION_NOT_FOUND',
                    message: 'Session does not exist'
                };
            }
            
            // Check if session is in valid state for operations
            if (session.state === SessionState.COMPLETED ||
                session.state === SessionState.CANCELLED ||
                session.state === SessionState.ERROR) {
                return {
                    valid: false,
                    error: 'INVALID_STATE',
                    message: `Session is ${session.state}`
                };
            }
            
            // Check for stale session
            const inactiveTime = Date.now() - session.lastActivity;
            if (inactiveTime > 600000) { // 10 minutes
                return {
                    valid: false,
                    error: 'STALE_SESSION',
                    message: 'Session is stale and should be refreshed'
                };
            }
            
            return { valid: true, session };
            
        } catch (error) {
            logger.error(`Session Guard: Validation error: ${error.message}`);
            return {
                valid: false,
                error: 'VALIDATION_ERROR',
                message: 'Failed to validate session'
            };
        }
    }

    /**
     * Safe session update with validation
     */
    async updateSafeSession(sessionId, updateData) {
        // Validate session state first
        const validation = await this.validateSessionState(sessionId);
        if (!validation.valid) {
            return {
                success: false,
                ...validation
            };
        }
        
        try {
            const result = await sessionManager.updateSession(sessionId, updateData);
            return {
                success: true,
                session: result
            };
        } catch (error) {
            logger.error(`Session Guard: Safe update failed: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Safe session completion with cleanup
     */
    async completeSafeSession(sessionId, completionData) {
        const validation = await this.validateSessionState(sessionId);
        if (!validation.valid && validation.error !== 'STALE_SESSION') {
            // Allow completion of stale sessions
            return {
                success: false,
                ...validation
            };
        }
        
        try {
            const result = await sessionManager.completeSession(sessionId, completionData);
            
            // Clear any locks or recovery attempts
            const session = validation.session;
            if (session) {
                const lockKey = `${session.userId}_${session.gameType}`;
                this.sessionLocks.delete(lockKey);
                this.recoveryAttempts.delete(lockKey);
            }
            
            return {
                success: true,
                ...result
            };
            
        } catch (error) {
            logger.error(`Session Guard: Safe completion failed: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Force cleanup all problematic sessions for a user
     */
    async forceCleanupUser(userId, guildId) {
        try {
            logger.warn(`Session Guard: Force cleanup initiated for user ${userId}`);
            
            // Cancel all sessions
            await sessionManager.cancelUserSessions(userId, 'Force cleanup', 'session-guard');
            
            // Clear legacy flags
            await this.clearLegacyGameFlags(userId, guildId);
            
            // Clear locks and recovery attempts
            for (const [key] of this.sessionLocks) {
                if (key.startsWith(`${userId}_`)) {
                    this.sessionLocks.delete(key);
                }
            }
            
            for (const [key] of this.recoveryAttempts) {
                if (key.startsWith(`${userId}_`)) {
                    this.recoveryAttempts.delete(key);
                }
            }
            
            logger.info(`Session Guard: Force cleanup completed for user ${userId}`);
            return { success: true };
            
        } catch (error) {
            logger.error(`Session Guard: Force cleanup failed: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Log session conflicts for analysis
     */
    logConflict(userId, gameType, conflictType) {
        const conflict = {
            timestamp: Date.now(),
            userId,
            gameType,
            conflictType
        };
        
        this.conflictLog.push(conflict);
        
        // Keep only last 100 conflicts
        if (this.conflictLog.length > 100) {
            this.conflictLog.shift();
        }
        
        logger.debug(`Session Guard: Conflict logged - ${conflictType} for ${userId}/${gameType}`);
    }

    /**
     * Get conflict statistics
     */
    getConflictStats() {
        const stats = {
            total: this.conflictLog.length,
            byType: {},
            byGame: {},
            recentCount: 0
        };
        
        const recentThreshold = Date.now() - 300000; // Last 5 minutes
        
        for (const conflict of this.conflictLog) {
            // Count by type
            stats.byType[conflict.conflictType] = (stats.byType[conflict.conflictType] || 0) + 1;
            
            // Count by game
            stats.byGame[conflict.gameType] = (stats.byGame[conflict.gameType] || 0) + 1;
            
            // Count recent
            if (conflict.timestamp > recentThreshold) {
                stats.recentCount++;
            }
        }
        
        return stats;
    }

    /**
     * Get guard status
     */
    getStatus() {
        return {
            activeLocks: this.sessionLocks.size,
            recoveryAttempts: this.recoveryAttempts.size,
            conflictLogSize: this.conflictLog.length,
            conflictStats: this.getConflictStats()
        };
    }
}

// Export singleton instance
const sessionGuard = new SessionGuard();

module.exports = sessionGuard;