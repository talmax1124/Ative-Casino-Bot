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
     * Get user balance
     */
    async getUserBalance(userId, guildId, apiKey, botId) {
        try {
            if (!this.authenticate(apiKey, botId)) {
                return {
                    success: false,
                    error: 'Authentication failed',
                    code: 'AUTH_FAILED'
                };
            }

            const balance = await dbManager.getUserBalance(userId, guildId);
            return {
                success: true,
                balance: balance,
                wallet: balance.wallet,
                bank: balance.bank,
                total: balance.wallet + balance.bank
            };

        } catch (error) {
            logger.error(`UAS Connector: Error getting user balance: ${error.message}`);
            return {
                success: false,
                error: error.message,
                code: 'GET_BALANCE_ERROR'
            };
        }
    }

    /**
     * Check if user has sufficient funds for an operation
     */
    async checkSufficientFunds(userId, guildId, amount, account, apiKey, botId) {
        try {
            if (!this.authenticate(apiKey, botId)) {
                return {
                    success: false,
                    error: 'Authentication failed',
                    code: 'AUTH_FAILED'
                };
            }

            const balance = await dbManager.getUserBalance(userId, guildId);
            const requiredAmount = Math.abs(amount);
            let sufficient = false;
            let currentAmount = 0;

            if (account === 'wallet') {
                currentAmount = balance.wallet;
                sufficient = balance.wallet >= requiredAmount;
            } else if (account === 'bank') {
                currentAmount = balance.bank;
                sufficient = balance.bank >= requiredAmount;
            } else if (account === 'marriage') {
                // Check marriage balance
                const marriageStatus = await dbManager.getUserMarriage(userId, guildId);
                if (!marriageStatus.married) {
                    return {
                        success: false,
                        error: 'User is not married - cannot check marriage balance',
                        code: 'NOT_MARRIED'
                    };
                }
                currentAmount = marriageStatus.marriage.sharedBank || 0;
                sufficient = currentAmount >= requiredAmount;
            } else {
                return {
                    success: false,
                    error: 'Invalid account type. Must be "wallet", "bank", or "marriage"',
                    code: 'INVALID_ACCOUNT'
                };
            }

            return {
                success: true,
                sufficient: sufficient,
                currentAmount: currentAmount,
                requiredAmount: requiredAmount,
                deficit: sufficient ? 0 : (requiredAmount - currentAmount),
                account: account,
                balance: balance
            };

        } catch (error) {
            logger.error(`UAS Connector: Error checking sufficient funds: ${error.message}`);
            return {
                success: false,
                error: error.message,
                code: 'CHECK_FUNDS_ERROR'
            };
        }
    }

    /**
     * Edit user money (admin function)
     */
    async editUserMoney(userId, guildId, amount, account, requestedBy, reason, apiKey, botId) {
        try {
            if (!this.authenticate(apiKey, botId)) {
                return {
                    success: false,
                    error: 'Authentication failed',
                    code: 'AUTH_FAILED'
                };
            }

            logger.info(`UAS Connector: Editing money for user ${userId} by ${requestedBy}: ${amount} to ${account}`);

            // Ensure user exists
            await dbManager.ensureUser(userId, `User-${userId}`);

            // Get current balance
            const currentBalance = await dbManager.getUserBalance(userId, guildId);
            
            // Perform the money edit operation using updateUserBalance
            let result;
            if (account === 'wallet') {
                result = await dbManager.updateUserBalance(userId, guildId, amount, 0);
            } else if (account === 'bank') {
                result = await dbManager.updateUserBalance(userId, guildId, 0, amount);
            } else if (account === 'marriage') {
                // Handle marriage balance editing
                const marriageStatus = await dbManager.getUserMarriage(userId, guildId);
                if (!marriageStatus.married) {
                    return {
                        success: false,
                        error: 'User is not married - cannot edit marriage balance',
                        code: 'NOT_MARRIED'
                    };
                }
                
                // Update marriage shared bank
                result = await dbManager.updateMarriageSharedBank(marriageStatus.marriage.id, amount);
            } else {
                return {
                    success: false,
                    error: 'Invalid account type. Must be "wallet", "bank", or "marriage"',
                    code: 'INVALID_ACCOUNT'
                };
            }

            // Get new balance after operation
            const newBalance = await dbManager.getUserBalance(userId, guildId);
            
            // For marriage account edits, also get updated marriage info
            let marriageInfo = null;
            if (account === 'marriage') {
                const updatedMarriageStatus = await dbManager.getUserMarriage(userId, guildId);
                marriageInfo = updatedMarriageStatus.marriage;
            }

            logger.info(`UAS Connector: Money edit completed for user ${userId}: ${account} account ${amount > 0 ? '+' : ''}${amount}`);

            const response = {
                success: true,
                action: 'MONEY_EDITED',
                amount: amount,
                account: account,
                previousBalance: currentBalance,
                newBalance: newBalance,
                requestedBy: requestedBy,
                reason: reason || 'No reason provided'
            };
            
            // Add marriage info if editing marriage account
            if (account === 'marriage' && marriageInfo) {
                response.marriageInfo = {
                    marriageId: marriageInfo.id,
                    sharedBank: marriageInfo.sharedBank,
                    partnerId: marriageInfo.partner1.id === userId ? marriageInfo.partner2.id : marriageInfo.partner1.id,
                    partnerName: marriageInfo.partner1.id === userId ? marriageInfo.partner2.name : marriageInfo.partner1.name
                };
            }
            
            return response;

        } catch (error) {
            logger.error(`UAS Connector: Error editing user money: ${error.message}`);
            return {
                success: false,
                error: error.message,
                code: 'EDIT_MONEY_ERROR'
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

        // Economy routes with same authentication middleware
        app.use('/uas/economy', (req, res, next) => {
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

        // Get user balance
        app.get('/uas/economy/balance/:userId/:guildId', async (req, res) => {
            try {
                const result = await this.getUserBalance(
                    req.params.userId,
                    req.params.guildId,
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

        // Check if user has sufficient funds
        app.post('/uas/economy/check-funds', async (req, res) => {
            try {
                const { userId, guildId, amount, account } = req.body;
                
                if (!userId || !guildId || amount === undefined || !account) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required fields: userId, guildId, amount, account',
                        code: 'MISSING_FIELDS'
                    });
                }

                const result = await this.checkSufficientFunds(
                    userId,
                    guildId,
                    amount,
                    account,
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

        // Edit user money
        app.post('/uas/economy/edit-money', async (req, res) => {
            try {
                const { userId, guildId, amount, account, requestedBy, reason } = req.body;
                
                if (!userId || !guildId || amount === undefined || !account || !requestedBy) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required fields: userId, guildId, amount, account, requestedBy',
                        code: 'MISSING_FIELDS'
                    });
                }

                const result = await this.editUserMoney(
                    userId,
                    guildId,
                    amount,
                    account,
                    requestedBy,
                    reason,
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

        logger.info('UAS Connector: Express routes created (including economy endpoints)');
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
