/**
 * UAS Connector - Interface for UAS bot to manage ATIVE Casino Bot sessions
 * Allows UAS to use /release and /stopgame functionality via API endpoints
 */

const sessionManager = require('./sessionManager');
const logger = require('./logger');
const dbManager = require('./database');

class UASConnector {
    constructor() {
        this.apiKey = process.env.UAS_API_KEY || 'default_uas_key';
        this.allowedUASBotId = process.env.UAS_BOT_ID || '1404027373048823838'; // Default bot ID
        logger.info('UAS Connector initialized');
    }

    /**
     * Authenticate UAS bot requests
     */
    authenticate(apiKey, botId) {
        if (apiKey !== this.apiKey) {
            logger.warn(`UAS Connector: Invalid API key attempted: ${apiKey}`);
            return false;
        }
        
        if (botId !== this.allowedUASBotId) {
            logger.warn(`UAS Connector: Unauthorized bot ID attempted: ${botId}`);
            return false;
        }
        
        return true;
    }

    /**
     * Get user's active sessions
     */
    async getUserSessions(userId, apiKey, botId) {
        try {
            if (!this.authenticate(apiKey, botId)) {
                return {
                    success: false,
                    error: 'Authentication failed',
                    code: 'AUTH_FAILED'
                };
            }

            const sessions = sessionManager.getUserSessions(userId).filter(s => s.state === 'active');

            return {
                success: true,
                sessions,
                count: sessions.length,
                hasActiveSessions: sessions.length > 0
            };

        } catch (error) {
            logger.error(`UAS Connector: Error getting user sessions: ${error.message}`);
            return {
                success: false,
                error: error.message,
                code: 'GET_SESSIONS_ERROR'
            };
        }
    }

    /**
     * Stop/release user sessions (equivalent to /stopgame)
     */
    async stopUserSessions(userId, guildId, requestedBy, apiKey, botId) {
        try {
            if (!this.authenticate(apiKey, botId)) {
                return {
                    success: false,
                    error: 'Authentication failed',
                    code: 'AUTH_FAILED'
                };
            }

            logger.info(`UAS Connector: Stopping sessions for user ${userId} requested by ${requestedBy}`);

            // Use session manager for safe cleanup
            const result = await sessionManager.forceCleanupUser(userId, guildId, `UAS cleanup requested by ${requestedBy}`);

            if (result.success) {
                logger.info(`UAS Connector: Successfully stopped ${result.sessionsCleaned} sessions for user ${userId}`);
                
                return {
                    success: true,
                    sessionsCleaned: result.sessionsCleaned || 0,
                    totalRefunded: result.totalRefunded || 0,
                    action: 'SESSIONS_STOPPED',
                    requestedBy
                };
            } else {
                logger.error(`UAS Connector: Failed to stop sessions for user ${userId}: ${result.error}`);
                
                return {
                    success: false,
                    error: result.error,
                    code: 'STOP_SESSIONS_ERROR'
                };
            }

        } catch (error) {
            logger.error(`UAS Connector: Error stopping user sessions: ${error.message}`);
            return {
                success: false,
                error: error.message,
                code: 'STOP_SESSIONS_ERROR'
            };
        }
    }

    /**
     * Release user sessions (equivalent to /release)
     */
    async releaseUserSessions(userId, guildId, requestedBy, apiKey, botId) {
        try {
            if (!this.authenticate(apiKey, botId)) {
                return {
                    success: false,
                    error: 'Authentication failed',
                    code: 'AUTH_FAILED'
                };
            }

            logger.info(`UAS Connector: Releasing sessions for user ${userId} requested by ${requestedBy}`);

            // Use unified session manager for force cleanup
            const result = await sessionManager.forceCleanupUser(
                userId, 
                guildId, 
                `UAS release requested by ${requestedBy}`
            );

            if (result.success) {
                logger.info(`UAS Connector: Successfully released ${result.sessionsCleaned} sessions for user ${userId}`);
                
                return {
                    success: true,
                    sessionsCleaned: result.sessionsCleaned || 0,
                    totalRefunded: result.totalRefunded || 0,
                    action: 'SESSIONS_RELEASED',
                    requestedBy
                };
            } else {
                logger.error(`UAS Connector: Failed to release sessions for user ${userId}: ${result.error}`);
                
                return {
                    success: false,
                    error: result.error,
                    code: 'RELEASE_SESSIONS_ERROR'
                };
            }

        } catch (error) {
            logger.error(`UAS Connector: Error releasing user sessions: ${error.message}`);
            return {
                success: false,
                error: error.message,
                code: 'RELEASE_SESSIONS_ERROR'
            };
        }
    }

    /**
     * Check if user can start a new game
     */
    async canUserStartGame(userId, guildId, gameType, apiKey, botId) {
        try {
            if (!this.authenticate(apiKey, botId)) {
                return {
                    success: false,
                    error: 'Authentication failed',
                    code: 'AUTH_FAILED'
                };
            }

            const result = await sessionManager.canCreateSession(userId, guildId, gameType);
            return {
                success: true,
                canStart: !!result.allowed,
                reason: result.reason,
                details: result,
                activeSession: result.existingSession || null
            };

        } catch (error) {
            logger.error(`UAS Connector: Error checking if user can start game: ${error.message}`);
            return {
                success: false,
                error: error.message,
                code: 'CAN_START_ERROR'
            };
        }
    }

    /**
     * Get system session statistics
     */
    async getSystemStats(apiKey, botId) {
        try {
            if (!this.authenticate(apiKey, botId)) {
                return {
                    success: false,
                    error: 'Authentication failed',
                    code: 'AUTH_FAILED'
                };
            }

            const stats = sessionManager.getStats();
            return {
                success: true,
                stats: {
                    totalSessions: stats.totalSessions,
                    activeSessions: stats.activeSessions,
                    uniqueUsers: stats.usersWithSessions,
                    locks: (sessionManager.locks ? sessionManager.locks.size : undefined)
                }
            };

        } catch (error) {
            logger.error(`UAS Connector: Error getting system stats: ${error.message}`);
            return {
                success: false,
                error: error.message,
                code: 'GET_STATS_ERROR'
            };
        }
    }

    /**
     * Force cleanup all sessions (emergency use only)
     */
    async emergencyCleanupAll(requestedBy, apiKey, botId, confirmationCode) {
        try {
            if (!this.authenticate(apiKey, botId)) {
                return {
                    success: false,
                    error: 'Authentication failed',
                    code: 'AUTH_FAILED'
                };
            }

            if (confirmationCode !== 'EMERGENCY_CLEANUP_CONFIRM') {
                return {
                    success: false,
                    error: 'Invalid confirmation code',
                    code: 'INVALID_CONFIRMATION'
                };
            }

            logger.warn(`UAS Connector: EMERGENCY CLEANUP requested by ${requestedBy}`);

            const stats = sessionManager.getStats();
            const sessionsCleaned = stats.activeSessions;

            // Force cleanup all sessions
            const allSessions = Array.from(sessionManager.sessions.keys());
            let cleanedCount = 0;

            for (const sessionId of allSessions) {
                try {
                    await sessionManager.cancelSession(sessionId, `Emergency cleanup by ${requestedBy}`, true);
                    cleanedCount++;
                } catch (error) {
                    logger.error(`Failed to cleanup session ${sessionId}: ${error.message}`);
                }
            }

            logger.warn(`UAS Connector: Emergency cleanup completed - ${cleanedCount} sessions cleaned by ${requestedBy}`);

            return {
                success: true,
                action: 'EMERGENCY_CLEANUP_COMPLETE',
                sessionsCleaned: cleanedCount,
                requestedBy
            };

        } catch (error) {
            logger.error(`UAS Connector: Emergency cleanup error: ${error.message}`);
            return {
                success: false,
                error: error.message,
                code: 'EMERGENCY_CLEANUP_ERROR'
            };
        }
    }

    /**
     * Create Express.js routes for UAS integration
     */
    createExpressRoutes(app) {
        // Middleware to parse JSON and validate requests
        app.use('/uas/sessions', (req, res, next) => {
            const apiKey = req.headers['x-uas-api-key'] || req.body.apiKey;
            const botId = req.headers['x-uas-bot-id'] || req.body.botId;

            if (!this.authenticate(apiKey, botId)) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication failed',
                    code: 'AUTH_FAILED'
                });
            }

            req.uasAuth = { apiKey, botId };
            next();
        });

        // Get user sessions
        app.get('/uas/sessions/user/:userId', async (req, res) => {
            try {
                const result = await this.getUserSessions(
                    req.params.userId,
                    req.uasAuth.apiKey,
                    req.uasAuth.botId
                );
                res.json(result);
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    code: 'INTERNAL_ERROR'
                });
            }
        });

        // Stop user sessions
        app.post('/uas/sessions/stop', async (req, res) => {
            try {
                const { userId, guildId, requestedBy } = req.body;
                
                if (!userId || !guildId || !requestedBy) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required fields: userId, guildId, requestedBy',
                        code: 'MISSING_FIELDS'
                    });
                }

                const result = await this.stopUserSessions(
                    userId,
                    guildId,
                    requestedBy,
                    req.uasAuth.apiKey,
                    req.uasAuth.botId
                );
                res.json(result);
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    code: 'INTERNAL_ERROR'
                });
            }
        });

        // Release user sessions
        app.post('/uas/sessions/release', async (req, res) => {
            try {
                const { userId, guildId, requestedBy } = req.body;
                
                if (!userId || !guildId || !requestedBy) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required fields: userId, guildId, requestedBy',
                        code: 'MISSING_FIELDS'
                    });
                }

                const result = await this.releaseUserSessions(
                    userId,
                    guildId,
                    requestedBy,
                    req.uasAuth.apiKey,
                    req.uasAuth.botId
                );
                res.json(result);
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    code: 'INTERNAL_ERROR'
                });
            }
        });

        // Check if user can start game
        app.post('/uas/sessions/can-start', async (req, res) => {
            try {
                const { userId, guildId, gameType } = req.body;
                
                if (!userId || !guildId || !gameType) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required fields: userId, guildId, gameType',
                        code: 'MISSING_FIELDS'
                    });
                }

                const result = await this.canUserStartGame(
                    userId,
                    guildId,
                    gameType,
                    req.uasAuth.apiKey,
                    req.uasAuth.botId
                );
                res.json(result);
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    code: 'INTERNAL_ERROR'
                });
            }
        });

        // Get system statistics
        app.get('/uas/sessions/stats', async (req, res) => {
            try {
                const result = await this.getSystemStats(
                    req.uasAuth.apiKey,
                    req.uasAuth.botId
                );
                res.json(result);
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    code: 'INTERNAL_ERROR'
                });
            }
        });

        // Emergency cleanup (developer only)
        app.post('/uas/sessions/emergency-cleanup', async (req, res) => {
            try {
                const { requestedBy, confirmationCode } = req.body;
                
                if (!requestedBy || !confirmationCode) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required fields: requestedBy, confirmationCode',
                        code: 'MISSING_FIELDS'
                    });
                }

                const result = await this.emergencyCleanupAll(
                    requestedBy,
                    req.uasAuth.apiKey,
                    req.uasAuth.botId,
                    confirmationCode
                );
                res.json(result);
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    code: 'INTERNAL_ERROR'
                });
            }
        });

        logger.info('UAS Connector: Express routes created');
    }

    /**
     * Initialize UAS connector with Express app
     */
    initialize(app) {
        if (app) {
            this.createExpressRoutes(app);
        }
        logger.info('UAS Connector: Initialized successfully');
    }
}

// Export singleton instance
const uasConnector = new UASConnector();

module.exports = uasConnector;
