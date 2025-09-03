/**
 * Unified Session Manager
 * Single source of truth for all game session management
 * Ensures proper cleanup and prevents session conflicts
 */

const dbManager = require('./database');
const logger = require('./logger');

class UnifiedSessionManager {
    constructor() {
        this.sessions = new Map(); // sessionId -> session data
        this.userToSessions = new Map(); // userId -> Set of sessionIds
        this.locks = new Map(); // userId -> lock timestamp
        this.cleanupInterval = null;
        
        // Start periodic cleanup
        this.startPeriodicCleanup();
        
        logger.info('Unified Session Manager initialized');
    }

    /**
     * Check if user can start a new game
     */
    async canStartGame(userId, guildId, gameType) {
        try {
            // Check for lock
            if (this.locks.has(userId)) {
                const lockAge = Date.now() - this.locks.get(userId);
                if (lockAge < 5000) { // 5 second lock
                    return {
                        canStart: false,
                        reason: 'Please wait a moment before starting a new game.'
                    };
                }
                this.locks.delete(userId);
            }

            // Check for active sessions
            const userSessions = this.userToSessions.get(userId);
            if (userSessions && userSessions.size > 0) {
                // Check if any sessions are actually active
                for (const sessionId of userSessions) {
                    const session = this.sessions.get(sessionId);
                    if (session && session.active) {
                        return {
                            canStart: false,
                            reason: `You already have an active ${session.gameType} game. Please finish it before starting a new one.`,
                            activeSession: session
                        };
                    }
                }
                // Clean up any stale session references
                this.cleanupUserSessions(userId);
            }

            // Check database game_active flag as fallback
            const balance = await dbManager.getUserBalance(userId, guildId);
            if (balance.game_active) {
                // Clear the flag since no active session exists
                await dbManager.updateUserBalance(userId, guildId, 0, 0, { game_active: false });
                logger.info(`Cleared stale game_active flag for user ${userId}`);
            }

            return {
                canStart: true
            };

        } catch (error) {
            logger.error(`Error checking if user ${userId} can start game: ${error.message}`);
            return {
                canStart: false,
                reason: 'Error checking game status. Please try again.'
            };
        }
    }

    /**
     * Start a new game session
     */
    async startSession(userId, guildId, gameType, betAmount = 0, metadata = {}) {
        try {
            // Set lock to prevent rapid session creation
            this.locks.set(userId, Date.now());

            // Double-check no active sessions
            const canStart = await this.canStartGame(userId, guildId, gameType);
            if (!canStart.canStart) {
                this.locks.delete(userId);
                return {
                    success: false,
                    error: canStart.reason
                };
            }

            // Deduct bet if applicable
            if (betAmount > 0) {
                const balance = await dbManager.getUserBalance(userId, guildId);
                if (balance.wallet < betAmount) {
                    this.locks.delete(userId);
                    return {
                        success: false,
                        error: 'Insufficient funds for this bet.'
                    };
                }
                await dbManager.updateUserBalance(userId, guildId, -betAmount, 0, { game_active: true });
            } else {
                // Still set game_active flag even without bet
                await dbManager.updateUserBalance(userId, guildId, 0, 0, { game_active: true });
            }

            // Create session
            const sessionId = `${gameType}_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const session = {
                sessionId,
                userId,
                guildId,
                gameType,
                betAmount,
                active: true,
                startTime: Date.now(),
                lastActivity: Date.now(),
                metadata
            };

            // Store session
            this.sessions.set(sessionId, session);
            
            // Track user session
            if (!this.userToSessions.has(userId)) {
                this.userToSessions.set(userId, new Set());
            }
            this.userToSessions.get(userId).add(sessionId);

            // Remove lock after successful creation
            this.locks.delete(userId);

            logger.info(`Session ${sessionId} started for user ${userId} (${gameType}, bet: ${betAmount})`);

            return {
                success: true,
                sessionId,
                session
            };

        } catch (error) {
            this.locks.delete(userId);
            logger.error(`Error starting session for user ${userId}: ${error.message}`);
            
            // Try to rollback bet if error occurred after deduction
            if (betAmount > 0) {
                try {
                    await dbManager.updateUserBalance(userId, guildId, betAmount, 0, { game_active: false });
                } catch (rollbackError) {
                    logger.error(`Failed to rollback bet: ${rollbackError.message}`);
                }
            }

            return {
                success: false,
                error: `Failed to start game: ${error.message}`
            };
        }
    }

    /**
     * End a game session (normal completion with payout)
     */
    async endSession(sessionId, payout = 0, forceCleanup = false) {
        try {
            const session = this.sessions.get(sessionId);
            if (!session) {
                logger.warn(`Attempted to end non-existent session: ${sessionId}`);
                return { success: true }; // Already ended
            }

            // Process payout if any
            if (payout > 0) {
                await dbManager.updateUserBalance(session.userId, session.guildId, payout, 0, { game_active: false });
            } else {
                // Just clear the game_active flag
                await dbManager.updateUserBalance(session.userId, session.guildId, 0, 0, { game_active: false });
            }

            // Mark session as inactive
            session.active = false;
            session.endTime = Date.now();
            session.payout = payout;

            // Remove from tracking
            this.removeSession(sessionId);

            logger.info(`Session ${sessionId} ended for user ${session.userId} (payout: ${payout})`);

            return {
                success: true,
                session
            };

        } catch (error) {
            logger.error(`Error ending session ${sessionId}: ${error.message}`);
            
            // Force cleanup if requested
            if (forceCleanup && sessionId) {
                this.removeSession(sessionId);
            }
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Cancel a session (with refund)
     */
    async cancelSession(sessionId, reason = 'User cancelled', refund = true) {
        try {
            const session = this.sessions.get(sessionId);
            if (!session) {
                logger.warn(`Attempted to cancel non-existent session: ${sessionId}`);
                return { success: true }; // Already cancelled
            }

            // Process refund if applicable
            if (refund && session.betAmount > 0) {
                await dbManager.updateUserBalance(session.userId, session.guildId, session.betAmount, 0, { game_active: false });
                logger.info(`Refunded ${session.betAmount} to user ${session.userId} for cancelled session`);
            } else {
                // Just clear the game_active flag
                await dbManager.updateUserBalance(session.userId, session.guildId, 0, 0, { game_active: false });
            }

            // Mark session as cancelled
            session.active = false;
            session.cancelled = true;
            session.cancelReason = reason;
            session.endTime = Date.now();

            // Remove from tracking
            this.removeSession(sessionId);

            logger.info(`Session ${sessionId} cancelled for user ${session.userId}: ${reason}`);

            return {
                success: true,
                refunded: refund && session.betAmount > 0,
                refundAmount: refund ? session.betAmount : 0
            };

        } catch (error) {
            logger.error(`Error cancelling session ${sessionId}: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Force clear all sessions for a user
     */
    async forceCleanupUser(userId, guildId, reason = 'Force cleanup') {
        try {
            logger.info(`Force cleanup initiated for user ${userId}: ${reason}`);
            
            const userSessions = this.userToSessions.get(userId);
            let totalRefunded = 0;
            let sessionsCleaned = 0;

            if (userSessions) {
                for (const sessionId of [...userSessions]) {
                    const session = this.sessions.get(sessionId);
                    if (session) {
                        // Refund any active bets
                        if (session.active && session.betAmount > 0) {
                            totalRefunded += session.betAmount;
                        }
                        this.removeSession(sessionId);
                        sessionsCleaned++;
                    }
                }
            }

            // Update database
            if (totalRefunded > 0) {
                await dbManager.updateUserBalance(userId, guildId, totalRefunded, 0, { game_active: false });
            } else {
                await dbManager.updateUserBalance(userId, guildId, 0, 0, { game_active: false });
            }

            // Clear user tracking
            this.userToSessions.delete(userId);
            this.locks.delete(userId);

            logger.info(`Force cleanup completed for user ${userId}: ${sessionsCleaned} sessions cleaned, ${totalRefunded} refunded`);

            return {
                success: true,
                sessionsCleaned,
                totalRefunded
            };

        } catch (error) {
            logger.error(`Force cleanup failed for user ${userId}: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get active session for a user
     */
    getActiveSession(userId) {
        const userSessions = this.userToSessions.get(userId);
        if (!userSessions) return null;

        for (const sessionId of userSessions) {
            const session = this.sessions.get(sessionId);
            if (session && session.active) {
                return session;
            }
        }
        return null;
    }

    /**
     * Update session activity timestamp
     */
    updateActivity(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.lastActivity = Date.now();
        }
    }

    /**
     * Remove session from all tracking
     */
    removeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            // Remove from user tracking
            const userSessions = this.userToSessions.get(session.userId);
            if (userSessions) {
                userSessions.delete(sessionId);
                if (userSessions.size === 0) {
                    this.userToSessions.delete(session.userId);
                }
            }
            // Remove session
            this.sessions.delete(sessionId);
        }
    }

    /**
     * Clean up stale sessions for a user
     */
    cleanupUserSessions(userId) {
        const userSessions = this.userToSessions.get(userId);
        if (!userSessions) return;

        const toRemove = [];
        for (const sessionId of userSessions) {
            const session = this.sessions.get(sessionId);
            if (!session || !session.active) {
                toRemove.push(sessionId);
            }
        }

        for (const sessionId of toRemove) {
            userSessions.delete(sessionId);
            this.sessions.delete(sessionId);
        }

        if (userSessions.size === 0) {
            this.userToSessions.delete(userId);
        }
    }

    /**
     * Start periodic cleanup of stale sessions
     */
    startPeriodicCleanup() {
        // Run every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanupStaleSessions();
        }, 5 * 60 * 1000);
    }

    /**
     * Clean up stale sessions (inactive for > 10 minutes)
     */
    async cleanupStaleSessions() {
        const now = Date.now();
        const staleTimeout = 10 * 60 * 1000; // 10 minutes
        const toCleanup = [];

        for (const [sessionId, session] of this.sessions) {
            if (session.active && (now - session.lastActivity) > staleTimeout) {
                toCleanup.push(sessionId);
            }
        }

        for (const sessionId of toCleanup) {
            logger.info(`Cleaning up stale session: ${sessionId}`);
            await this.cancelSession(sessionId, 'Session timeout', true);
        }

        if (toCleanup.length > 0) {
            logger.info(`Cleaned up ${toCleanup.length} stale sessions`);
        }
    }

    /**
     * Get session statistics
     */
    getStats() {
        return {
            totalSessions: this.sessions.size,
            activeSessions: Array.from(this.sessions.values()).filter(s => s.active).length,
            uniqueUsers: this.userToSessions.size,
            locks: this.locks.size
        };
    }

    /**
     * Shutdown the manager
     */
    shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        logger.info('Unified Session Manager shutdown');
    }
}

// Export singleton instance
const unifiedSessionManager = new UnifiedSessionManager();

// Ensure cleanup on process exit
process.on('SIGINT', () => unifiedSessionManager.shutdown());
process.on('SIGTERM', () => unifiedSessionManager.shutdown());

module.exports = unifiedSessionManager;