/**
 * Game Session Integrator - Helper utility for integrating games with SessionManager
 * Provides common patterns and functions for game session management
 */

// sessionManager removed (Firebase dependency) - using in-memory mock implementation
const activeSessions = new Map(); // sessionId -> session data
const userSessions = new Map();   // userId -> Set of sessionIds

const sessionManager = {
    canCreateSession: async (userId) => ({ allowed: true }),
    createSession: async (sessionConfig) => {
        try {
            const sessionId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const session = {
                ...sessionConfig,
                sessionId,
                createdAt: Date.now(),
                state: 'active'
            };
            
            // Store session
            activeSessions.set(sessionId, session);
            
            // Track user sessions
            if (!userSessions.has(sessionConfig.userId)) {
                userSessions.set(sessionConfig.userId, new Set());
            }
            userSessions.get(sessionConfig.userId).add(sessionId);
            
            return {
                success: true, 
                sessionId,
                session
            };
        } catch (error) {
            return {
                success: false,
                error: error.message || 'Failed to create mock session'
            };
        }
    },
    endSession: async (sessionId) => {
        const session = activeSessions.get(sessionId);
        if (session) {
            session.state = 'ended';
            activeSessions.delete(sessionId);
            
            // Remove from user tracking
            if (userSessions.has(session.userId)) {
                userSessions.get(session.userId).delete(sessionId);
            }
        }
        return { success: true };
    },
    updateSession: async (sessionId, data) => {
        const session = activeSessions.get(sessionId);
        if (session) {
            Object.assign(session, data);
        }
        return { success: true };
    },
    completeSession: async (sessionId, data) => {
        const session = activeSessions.get(sessionId);
        if (session) {
            session.state = 'completed';
            Object.assign(session, data);
            activeSessions.delete(sessionId);
            
            // Remove from user tracking
            if (userSessions.has(session.userId)) {
                userSessions.get(session.userId).delete(sessionId);
            }
        }
        return { success: true };
    },
    cancelSession: async (sessionId, reason) => {
        const session = activeSessions.get(sessionId);
        if (session) {
            session.state = 'cancelled';
            session.cancelReason = reason;
            activeSessions.delete(sessionId);
            
            // Remove from user tracking
            if (userSessions.has(session.userId)) {
                userSessions.get(session.userId).delete(sessionId);
            }
        }
        return { success: true };
    },
    getUserSessions: (userId) => {
        const sessionIds = userSessions.get(userId);
        if (!sessionIds) return [];
        
        const sessions = [];
        for (const sessionId of sessionIds) {
            const session = activeSessions.get(sessionId);
            if (session) {
                sessions.push(session);
            }
        }
        return sessions;
    },
    getActiveSessionCount: () => activeSessions.size,
    getSession: (sessionId) => activeSessions.get(sessionId) || null
};
const GameType = { BLACKJACK: 'blackjack', SLOTS: 'slots', UNO: 'uno' };
const { buildSessionEmbed } = require('./gameSessionKit');
const dbManager = require('./database');
const logger = require('./logger');

class GameSessionIntegrator {
    /**
     * Standard session validation for games
     */
    static async validateGameSession(userId, gameType, guildId) {
        try {
            // Check session limits
            const canCreate = await sessionManager.canCreateSession(userId);
            if (!canCreate.allowed) {
                return {
                    valid: false,
                    error: 'SESSION_LIMIT',
                    message: canCreate.reason + '\nUse `/stopgame` to cancel active sessions.'
                };
            }

            // Check for existing sessions of the same game type
            const userSessions = sessionManager.getUserSessions(userId);
            const existingGame = userSessions.find(s => s.gameType === gameType);
            
            if (existingGame) {
                return {
                    valid: false,
                    error: 'GAME_ACTIVE',
                    message: `You already have an active ${gameType} session.\nUse \`/stopgame\` to cancel it first.`
                };
            }

            // Check legacy game_active field
            const balance = await dbManager.getUserBalance(userId, guildId);
            if (balance.game_active) {
                return {
                    valid: false,
                    error: 'LEGACY_ACTIVE',
                    message: 'You have an active game session.\nFinish it before starting a new game or use `/stopgame`.'
                };
            }

            return { valid: true };

        } catch (error) {
            logger.error(`Error validating game session: ${error.message}`);
            return {
                valid: false,
                error: 'VALIDATION_ERROR',
                message: 'Error validating game session. Please try again.'
            };
        }
    }

    /**
     * Create error embed for session validation failures
     */
    static createValidationErrorEmbed(username, gameType, validationResult) {
        const gameDisplayName = gameType.charAt(0).toUpperCase() + gameType.slice(1);
        
        return buildSessionEmbed({
            title: `❌ ${username}'s ${gameDisplayName}`,
            topFields: [
                { 
                    name: this.getErrorTitle(validationResult.error),
                    value: validationResult.message 
                }
            ],
            color: 0xFF0000,
            footer: `${gameDisplayName} Game • Session Manager`
        });
    }

    /**
     * Get appropriate error title for different error types
     */
    static getErrorTitle(errorType) {
        switch (errorType) {
            case 'SESSION_LIMIT':
                return 'Session Limit Reached';
            case 'GAME_ACTIVE':
                return 'Game Already Active';
            case 'LEGACY_ACTIVE':
                return 'Legacy Game Active';
            default:
                return 'Session Error';
        }
    }

    /**
     * Create a new game session
     */
    static async createGameSession(sessionConfig) {
        const {
            userId,
            guildId,
            channelId,
            gameType,
            betAmount = 0,
            timeout = 180000, // 3 minutes default
            metadata = {},
            interaction = null
        } = sessionConfig;

        try {
            const sessionResult = await sessionManager.createSession({
                userId,
                guildId,
                channelId,
                gameType,
                betAmount,
                timeout,
                metadata: {
                    ...metadata,
                    interaction: interaction ? {
                        id: interaction.id,
                        user: interaction.user.tag,
                        channelId: interaction.channelId
                    } : null,
                    createdBy: 'GameSessionIntegrator'
                }
            });

            if (!sessionResult.success) {
                throw new Error(sessionResult.error);
            }

            return {
                success: true,
                sessionId: sessionResult.sessionId,
                session: sessionResult.session
            };

        } catch (error) {
            logger.error(`Error creating game session: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update game session data
     */
    static async updateGameSession(sessionId, updateData, action = 'update') {
        try {
            await sessionManager.updateSession(sessionId, {
                ...updateData,
                action
            });
            return { success: true };
        } catch (error) {
            logger.error(`Error updating game session ${sessionId}: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Complete game session
     */
    static async completeGameSession(sessionId, completionData) {
        try {
            await sessionManager.completeSession(sessionId, completionData);
            return { success: true };
        } catch (error) {
            logger.error(`Error completing game session ${sessionId}: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle game error - cancel session and refund
     */
    static async handleGameError(userId, gameType, betAmount, guildId, reason = 'Game error') {
        try {
            // Find and cancel relevant sessions
            const userSessions = sessionManager.getUserSessions(userId);
            const gameSessions = userSessions.filter(s => s.gameType === gameType);
            
            for (const session of gameSessions) {
                await sessionManager.cancelSession(
                    session.sessionId,
                    `${reason} - refund processed`,
                    'system'
                );
            }

            // Refund bet and clear legacy flag
            if (betAmount > 0) {
                await dbManager.updateUserBalance(userId, guildId, betAmount, 0, { game_active: false });
            } else {
                await dbManager.updateUserBalance(userId, guildId, 0, 0, { game_active: false });
            }

            logger.info(`Game error handled for user ${userId}: ${reason}`);
            return { success: true };

        } catch (error) {
            logger.error(`Error handling game error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get user's active sessions for a specific game type
     */
    static getUserGameSessions(userId, gameType = null) {
        const userSessions = sessionManager.getUserSessions(userId);
        
        if (gameType) {
            return userSessions.filter(s => s.gameType === gameType);
        }
        
        return userSessions;
    }

    /**
     * Standard game session timeout handler
     */
    static createTimeoutHandler(gameType, onTimeout = null) {
        return async (sessionId) => {
            try {
                const session = sessionManager.getSession(sessionId);
                if (!session) return;

                logger.warn(`${gameType} session ${sessionId} timed out`);

                // Custom timeout logic
                if (onTimeout && typeof onTimeout === 'function') {
                    await onTimeout(session);
                }

                // Default timeout handling - refund bet
                if (session.betAmount > 0) {
                    await dbManager.updateUserBalance(
                        session.userId,
                        session.guildId,
                        session.betAmount,
                        0,
                        { game_active: false }
                    );
                }

            } catch (error) {
                logger.error(`Error in ${gameType} timeout handler: ${error.message}`);
            }
        };
    }

    /**
     * Create standard game integration configuration
     */
    static createGameConfig(gameType, options = {}) {
        const defaults = {
            timeout: this.getDefaultTimeout(gameType),
            maxSessions: 1,
            requiresBet: true,
            supportsMultipleHands: false,
            canPause: false,
            autoRefund: true
        };

        return {
            ...defaults,
            ...options,
            gameType
        };
    }

    /**
     * Get default timeout for different game types
     */
    static getDefaultTimeout(gameType) {
        const timeouts = {
            [GameType.BLACKJACK]: 180000,    // 3 minutes
            [GameType.SLOTS]: 60000,         // 1 minute
            [GameType.PLINKO]: 300000,       // 5 minutes (animation)
            [GameType.CRASH]: 120000,        // 2 minutes
            [GameType.ROULETTE]: 180000,     // 3 minutes
            [GameType.FISHING]: 300000,      // 5 minutes
            [GameType.HEIST]: 600000,        // 10 minutes (team game)
            [GameType.BATTLESHIP]: 900000,   // 15 minutes (PvP)
            [GameType.UNO]: 1200000,         // 20 minutes (multiplayer)
            [GameType.WORDCHAIN]: 300000,    // 5 minutes
            [GameType.BINGO]: 600000,        // 10 minutes
            [GameType.DUCK]: 60000,          // 1 minute
            [GameType.RPS]: 60000            // 1 minute
        };

        return timeouts[gameType] || 180000; // Default 3 minutes
    }

    /**
     * Batch update multiple games to use SessionManager
     */
    static async migrateGameToSessionManager(gameFilePath, gameType) {
        logger.info(`Starting SessionManager migration for ${gameType} at ${gameFilePath}`);
        
        // This would contain the migration logic
        // For now, return migration instructions
        return {
            gameType,
            filePath: gameFilePath,
            migrationSteps: [
                '1. Import GameSessionIntegrator and SessionManager',
                '2. Replace game_active checks with validateGameSession()',
                '3. Create session on game start with createGameSession()',
                '4. Update session during game with updateGameSession()',
                '5. Complete session on game end with completeGameSession()',
                '6. Handle errors with handleGameError()',
                '7. Update timeout handling',
                '8. Test game functionality'
            ],
            priority: this.getGamePriority(gameType)
        };
    }

    /**
     * Get migration priority for games (higher number = higher priority)
     */
    static getGamePriority(gameType) {
        const priorities = {
            [GameType.BLACKJACK]: 10,   // High use
            [GameType.SLOTS]: 9,        // High use
            [GameType.CRASH]: 8,        // Popular
            [GameType.PLINKO]: 7,       // Already done
            [GameType.FISHING]: 6,      // Medium use
            [GameType.RPS]: 5,          // Simple
            [GameType.DUCK]: 4,         // Simple
            [GameType.HEIST]: 3,        // Complex team game
            [GameType.BATTLESHIP]: 2,   // PvP game
            [GameType.UNO]: 1,          // Complex multiplayer
            [GameType.WORDCHAIN]: 1,    // Complex multiplayer
            [GameType.BINGO]: 1         // Event-based
        };

        return priorities[gameType] || 5;
    }

    /**
     * Force cleanup all sessions for a user - prevents "still in session" issues
     */
    static async forceCleanupUserSessions(userId, guildId, reason = 'Force cleanup') {
        try {
            logger.info(`Force cleanup initiated for user ${userId}: ${reason}`);
            
            // Cancel all sessions
            const userSessions = sessionManager.getUserSessions(userId);
            const cleanupResults = [];
            
            for (const session of userSessions) {
                try {
                    // Refund any bets
                    if (session.betAmount > 0) {
                        await dbManager.updateUserBalance(userId, guildId, session.betAmount, 0);
                        logger.info(`Refunded ${session.betAmount} to user ${userId} from session ${session.sessionId}`);
                    }
                    
                    // Cancel session
                    await sessionManager.cancelSession(session.sessionId, reason, 'force-cleanup');
                    cleanupResults.push({ sessionId: session.sessionId, success: true });
                    
                } catch (sessionError) {
                    logger.error(`Failed to cleanup session ${session.sessionId}: ${sessionError.message}`);
                    cleanupResults.push({ sessionId: session.sessionId, success: false, error: sessionError.message });
                }
            }
            
            // Clear legacy game_active flag
            const balance = await dbManager.getUserBalance(userId, guildId);
            if (balance.game_active) {
                await dbManager.updateUserBalance(userId, guildId, 0, 0, { game_active: false });
                logger.info(`Cleared legacy game_active flag for user ${userId}`);
            }
            
            logger.info(`Force cleanup completed for user ${userId}. Cleaned ${cleanupResults.length} sessions`);
            
            return {
                success: true,
                sessionsCleanedUp: cleanupResults.length,
                results: cleanupResults
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
     * Validate all active sessions (utility for dev commands)
     */
    static async validateAllSessions() {
        try {
            const allSessions = sessionManager.getAllActiveSessions();
            const results = {
                total: allSessions.length,
                valid: 0,
                stale: 0,
                errors: []
            };

            for (const session of allSessions) {
                try {
                    // Check if session is still valid
                    const age = Date.now() - session.lastActivity;
                    if (age > (session.timeout * 2)) {
                        results.stale++;
                    } else {
                        results.valid++;
                    }
                } catch (error) {
                    results.errors.push({
                        sessionId: session.sessionId,
                        error: error.message
                    });
                }
            }

            return results;
        } catch (error) {
            logger.error(`Error validating sessions: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get active sessions for a user
     */
    static async getActiveUserSessions(userId) {
        try {
            const sessions = sessionManager.getUserSessions(userId);
            return sessions.filter(s => s.state === 'active' || s.state === 'paused');
        } catch (error) {
            logger.error(`Error getting active user sessions: ${error.message}`);
            return [];
        }
    }
}

module.exports = GameSessionIntegrator;