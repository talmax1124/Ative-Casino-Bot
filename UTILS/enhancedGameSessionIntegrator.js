/**
 * Enhanced Game Session Integrator
 * Professional-grade session management with comprehensive error handling,
 * transaction safety, and enterprise-level reliability features
 */

const enterpriseSessionManager = require('./enterpriseSessionManager');
const { buildSessionEmbed } = require('./gameSessionKit');
const dbManager = require('./database');
const logger = require('./logger');

// Enhanced game types with metadata
const GameType = {
    BLACKJACK: 'blackjack',
    SLOTS: 'slots',
    PLINKO: 'plinko',
    POKER: 'poker',
    UNO: 'uno',
    WAR: 'war',
    FISHING: 'fishing',
    KENO: 'keno',
    HEIST: 'heist',
    CRASH: 'crash',
    BINGO: 'bingo',
    SPADES: 'spades',
    THIRTYONE: '31',
    ROCKPAPERSCISSORS: 'rps',
    MATRIX_SLOTS: 'matrix_slots',
    DUCK_GAME: 'duck_game',
    MULTI_SLOTS: 'multi_slots',
    BATTLESHIP: 'battleship',
    WORDCHAIN: 'wordchain'
};

// Session validation result codes
const ValidationResult = {
    SUCCESS: 'SUCCESS',
    INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
    GAME_ACTIVE: 'GAME_ACTIVE',
    SESSION_LIMIT: 'SESSION_LIMIT',
    INVALID_BET: 'INVALID_BET',
    USER_BANNED: 'USER_BANNED',
    GAME_DISABLED: 'GAME_DISABLED',
    MAINTENANCE_MODE: 'MAINTENANCE_MODE',
    COOLDOWN_ACTIVE: 'COOLDOWN_ACTIVE'
};

class EnhancedGameSessionIntegrator {
    constructor() {
        this.validationCache = new Map(); // Cache validation results briefly
        this.gameConfigurations = new Map(); // Store game-specific configs
        this.sessionMetrics = {
            validationsPerformed: 0,
            sessionsCreated: 0,
            sessionErrors: 0,
            validationErrors: 0
        };
        
        this.loadGameConfigurations();
    }

    /**
     * Comprehensive game session validation with multiple checks
     */
    async validateGameSession(userId, gameType, guildId, betAmount = 0, options = {}) {
        this.sessionMetrics.validationsPerformed++;
        
        const cacheKey = `${userId}_${gameType}_${betAmount}_${Date.now()}`;
        
        try {
            // Check cache for recent validation (prevents spam)
            const cached = this.validationCache.get(`${userId}_${gameType}`);
            if (cached && Date.now() - cached.timestamp < 2000) {
                logger.debug(`Enhanced Session Integrator: Using cached validation for ${userId}/${gameType}`);
                return cached.result;
            }
            
            // 1. Basic user validation
            const userValidation = await this.validateUser(userId, guildId);
            if (!userValidation.valid) {
                return this.createValidationResult(false, userValidation.code, userValidation.message);
            }
            
            // 2. Game-specific validation
            const gameValidation = await this.validateGameSpecific(gameType, betAmount, guildId);
            if (!gameValidation.valid) {
                return this.createValidationResult(false, gameValidation.code, gameValidation.message);
            }
            
            // 3. Balance validation
            if (betAmount > 0) {
                const balanceValidation = await this.validateBalance(userId, guildId, betAmount);
                if (!balanceValidation.valid) {
                    return this.createValidationResult(false, balanceValidation.code, balanceValidation.message);
                }
            }
            
            // 4. Session conflict validation
            const sessionValidation = await this.validateSessionConflicts(userId, gameType, guildId);
            if (!sessionValidation.valid) {
                return this.createValidationResult(false, sessionValidation.code, sessionValidation.message);
            }
            
            // 5. Rate limiting validation
            const rateLimitValidation = await this.validateRateLimit(userId, gameType);
            if (!rateLimitValidation.valid) {
                return this.createValidationResult(false, rateLimitValidation.code, rateLimitValidation.message);
            }
            
            const result = this.createValidationResult(true, ValidationResult.SUCCESS, 'Validation passed');
            
            // Cache successful validation briefly
            this.validationCache.set(`${userId}_${gameType}`, {
                timestamp: Date.now(),
                result
            });
            
            // Clean cache periodically
            if (this.validationCache.size > 1000) {
                this.cleanValidationCache();
            }
            
            return result;
            
        } catch (error) {
            this.sessionMetrics.validationErrors++;
            logger.error(`Enhanced Session Integrator: Validation error for ${userId}/${gameType}: ${error.message}`);
            
            return this.createValidationResult(false, 'VALIDATION_ERROR', 
                'An error occurred during validation. Please try again.');
        }
    }

    /**
     * Create a new game session with comprehensive error handling
     */
    async createGameSession(sessionConfig, options = {}) {
        const {
            userId,
            guildId,
            channelId,
            gameType,
            betAmount = 0,
            timeout = null,
            metadata = {},
            interaction = null,
            validateFirst = true
        } = sessionConfig;
        
        try {
            // Pre-validation if requested
            if (validateFirst) {
                const validation = await this.validateGameSession(userId, gameType, guildId, betAmount);
                if (!validation.valid) {
                    return {
                        success: false,
                        validationResult: validation,
                        error: validation.message
                    };
                }
            }
            
            // Get game configuration
            const gameConfig = this.getGameConfiguration(gameType);
            const sessionTimeout = timeout || gameConfig.defaultTimeout;
            
            // Enhanced metadata
            const enhancedMetadata = {
                ...metadata,
                gameConfig,
                validation: {
                    timestamp: Date.now(),
                    betAmount,
                    userAgent: interaction?.user?.tag
                },
                interaction: interaction ? {
                    id: interaction.id,
                    user: interaction.user.tag,
                    channelId: interaction.channelId,
                    guildId: interaction.guildId
                } : null,
                integrator: {
                    version: '2.0.0',
                    features: ['professional-session-manager', 'enhanced-validation', 'transaction-safety']
                }
            };
            
            // Create session through enterprise manager
            const sessionResult = await enterpriseSessionManager.createSession({
                userId,
                guildId,
                channelId,
                gameType,
                betAmount,
                timeout: sessionTimeout,
                metadata: enhancedMetadata
            });
            
            if (sessionResult.success) {
                this.sessionMetrics.sessionsCreated++;
                
                logger.info(`Enhanced Session Integrator: Created ${gameType} session ${sessionResult.sessionId} ` +
                           `for user ${userId} with bet ${betAmount}`);
                
                return {
                    success: true,
                    sessionId: sessionResult.sessionId,
                    session: sessionResult.session,
                    gameConfig,
                    timeout: sessionTimeout
                };
            } else {
                this.sessionMetrics.sessionErrors++;
                
                logger.error(`Enhanced Session Integrator: Failed to create ${gameType} session for ${userId}: ${sessionResult.error}`);
                
                return {
                    success: false,
                    error: sessionResult.error,
                    errorCode: sessionResult.errorCode
                };
            }
            
        } catch (error) {
            this.sessionMetrics.sessionErrors++;
            
            logger.error(`Enhanced Session Integrator: Session creation error for ${userId}/${gameType}: ${error.message}`);
            
            return {
                success: false,
                error: error.message,
                errorCode: 'SESSION_CREATION_ERROR'
            };
        }
    }

    /**
     * Update game session with validation and error handling
     */
    async updateGameSession(sessionId, updateData, options = {}) {
        const { validateState = true } = options;
        
        try {
            if (validateState) {
                const validation = enterpriseSessionManager.validateSession(sessionId);
                if (!validation.valid) {
                    return {
                        success: false,
                        error: validation.error,
                        message: validation.message
                    };
                }
            }
            
            const result = await enterpriseSessionManager.updateSession(sessionId, updateData);
            
            if (result.success) {
                logger.info(`Enhanced Session Integrator: Updated session ${sessionId} with fields: ${result.updatedFields?.join(', ')}`);
            }
            
            return result;
            
        } catch (error) {
            logger.error(`Enhanced Session Integrator: Session update error for ${sessionId}: ${error.message}`);
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Complete game session with comprehensive payout processing
     */
    async completeGameSession(sessionId, completionData, options = {}) {
        const {
            validatePayout = true,
            logResult = true,
            notifyUser = false
        } = options;
        
        try {
            // Validate session exists and is completable
            const validation = enterpriseSessionManager.validateSession(sessionId);
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.error,
                    message: validation.message
                };
            }
            
            const session = validation.session;
            
            // Validate payout if applicable
            if (validatePayout && completionData.payout) {
                const payoutValidation = this.validatePayout(completionData.payout, session);
                if (!payoutValidation.valid) {
                    logger.warn(`Enhanced Session Integrator: Invalid payout for session ${sessionId}: ${payoutValidation.reason}`);
                    completionData.payout = payoutValidation.adjustedPayout || 0;
                }
            }
            
            // Enhanced completion data
            const enhancedCompletionData = {
                ...completionData,
                completedBy: 'enhanced-session-integrator',
                completedAt: Date.now(),
                sessionDuration: Date.now() - new Date(session.created_at).getTime(),
                validation: {
                    payoutValidated: validatePayout,
                    originalPayout: completionData.payout
                }
            };
            
            const result = await enterpriseSessionManager.completeSession(sessionId, enhancedCompletionData);
            
            if (result.success && logResult) {
                const logData = {
                    sessionId,
                    userId: session.userId,
                    gameType: session.gameType,
                    betAmount: session.betAmount,
                    payout: completionData.payout || 0,
                    result: completionData.gameResult || 'completed',
                    duration: enhancedCompletionData.sessionDuration
                };
                
                logger.info(`Enhanced Session Integrator: Game completed - ${JSON.stringify(logData)}`);
            }
            
            return result;
            
        } catch (error) {
            logger.error(`Enhanced Session Integrator: Session completion error for ${sessionId}: ${error.message}`);
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handle game errors with automatic recovery and user notification
     */
    async handleGameError(sessionId, error, options = {}) {
        const {
            autoRefund = true,
            notifyUser = true,
            logError = true
        } = options;
        
        try {
            // Get session details for error handling
            const validation = enterpriseSessionManager.validateSession(sessionId);
            let session = null;
            
            if (validation.valid) {
                session = validation.session;
            } else {
                // Try to get session even if invalid state for cleanup
                try {
                    const [sessions] = await dbManager.pool.execute(
                        'SELECT * FROM game_sessions WHERE sessionId = ?',
                        [sessionId]
                    );
                    session = sessions[0] || null;
                } catch (dbError) {
                    logger.error(`Enhanced Session Integrator: Could not retrieve session for error handling: ${dbError.message}`);
                }
            }
            
            if (!session) {
                logger.error(`Enhanced Session Integrator: Cannot handle error for unknown session ${sessionId}`);
                return {
                    success: false,
                    error: 'Session not found for error handling'
                };
            }
            
            const errorInfo = {
                sessionId,
                gameType: session.gameType,
                userId: session.userId,
                betAmount: session.betAmount,
                error: error.message || error,
                timestamp: Date.now()
            };
            
            if (logError) {
                logger.error(`Enhanced Session Integrator: Game error - ${JSON.stringify(errorInfo)}`);
            }
            
            // Cancel session with refund
            const cancelResult = await professionalSessionManager.cancelSession(
                sessionId,
                `Game error: ${error.message || error}`,
                autoRefund
            );
            
            if (cancelResult.success) {
                logger.info(`Enhanced Session Integrator: Successfully handled error for session ${sessionId}. ` +
                           `Refunded: $${cancelResult.refundAmount || 0}`);
            }
            
            return {
                success: true,
                sessionCancelled: cancelResult.success,
                refunded: cancelResult.refunded,
                refundAmount: cancelResult.refundAmount,
                errorInfo
            };
            
        } catch (handlingError) {
            logger.error(`Enhanced Session Integrator: Error while handling game error: ${handlingError.message}`);
            
            return {
                success: false,
                error: handlingError.message,
                originalError: error.message || error
            };
        }
    }

    /**
     * Force cleanup user sessions with enhanced reporting
     */
    async forceCleanupUserSessions(userId, guildId, reason = 'Force cleanup') {
        try {
            const result = await enterpriseSessionManager.forceCleanupUserSessions(userId, guildId, reason);
            
            if (result.success) {
                logger.info(`Enhanced Session Integrator: Force cleanup completed for user ${userId}. ` +
                           `Sessions: ${result.sessionsCancelled}/${result.sessionsFound}, ` +
                           `Refunded: $${result.totalRefunded}, Errors: ${result.errors.length}`);
            }
            
            return result;
            
        } catch (error) {
            logger.error(`Enhanced Session Integrator: Force cleanup error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get user sessions with enhanced filtering and metadata
     */
    async getUserSessions(userId, options = {}) {
        const {
            gameType = null,
            includeCompleted = false,
            includeMetadata = true,
            limit = 10
        } = options;
        
        try {
            const states = includeCompleted 
                ? ['active', 'paused', 'completed']
                : ['active', 'paused'];
            
            const allSessions = enterpriseSessionManager.getUserSessions(userId, gameType);
            const sessions = allSessions.filter(session => {
                if (!includeCompleted && session.state === 'completed') return false;
                return true;
            });
            
            return {
                success: true,
                sessions: sessions.slice(0, limit),
                total: sessions.length
            };
            
        } catch (error) {
            logger.error(`Enhanced Session Integrator: Error getting user sessions: ${error.message}`);
            
            return {
                success: false,
                error: error.message,
                sessions: []
            };
        }
    }

    /**
     * Create validation error embed with enhanced information
     */
    createValidationErrorEmbed(username, gameType, validationResult, options = {}) {
        const gameDisplayName = gameType.charAt(0).toUpperCase() + gameType.slice(1);
        const { includeHelp = true, customColor = 0xFF0000 } = options;
        
        const embed = buildSessionEmbed({
            title: `❌ ${username}'s ${gameDisplayName}`,
            topFields: [
                { 
                    name: this.getErrorTitle(validationResult.code),
                    value: validationResult.message 
                }
            ],
            color: customColor,
            footer: `${gameDisplayName} Game • Enhanced Session Manager v2.0`
        });
        
        // Add help field if requested
        if (includeHelp && this.shouldShowHelp(validationResult.code)) {
            embed.addFields({
                name: '💡 How to resolve',
                value: this.getHelpMessage(validationResult.code),
                inline: false
            });
        }
        
        return embed;
    }

    // ==================== PRIVATE HELPER METHODS ====================

    createValidationResult(valid, code, message, data = {}) {
        return {
            valid,
            code,
            message,
            ...data
        };
    }

    async validateUser(userId, guildId) {
        try {
            // Check if user is banned from games
            const balance = await dbManager.getUserBalance(userId, guildId);
            if (balance.banned_from_games) {
                return {
                    valid: false,
                    code: ValidationResult.USER_BANNED,
                    message: 'You are banned from playing games.'
                };
            }
            
            return { valid: true };
            
        } catch (error) {
            return {
                valid: false,
                code: 'USER_VALIDATION_ERROR',
                message: 'Error validating user status.'
            };
        }
    }

    async validateGameSpecific(gameType, betAmount, guildId) {
        const config = this.getGameConfiguration(gameType);
        
        // Check if game is enabled
        if (!config.enabled) {
            return {
                valid: false,
                code: ValidationResult.GAME_DISABLED,
                message: `${gameType} is currently disabled.`
            };
        }
        
        // Check bet amount limits
        if (betAmount < config.minBet) {
            return {
                valid: false,
                code: ValidationResult.INVALID_BET,
                message: `Minimum bet for ${gameType} is $${config.minBet}.`
            };
        }
        
        if (betAmount > config.maxBet) {
            return {
                valid: false,
                code: ValidationResult.INVALID_BET,
                message: `Maximum bet for ${gameType} is $${config.maxBet}.`
            };
        }
        
        return { valid: true };
    }

    async validateBalance(userId, guildId, betAmount) {
        try {
            const balance = await dbManager.getUserBalance(userId, guildId);
            
            if (balance.wallet < betAmount) {
                return {
                    valid: false,
                    code: ValidationResult.INSUFFICIENT_FUNDS,
                    message: `Insufficient funds. You need $${betAmount} but only have $${balance.wallet}.`
                };
            }
            
            return { valid: true };
            
        } catch (error) {
            return {
                valid: false,
                code: 'BALANCE_VALIDATION_ERROR',
                message: 'Error validating balance.'
            };
        }
    }

    async validateSessionConflicts(userId, gameType, guildId) {
        try {
            const sessions = enterpriseSessionManager.getUserSessions(userId, gameType);
            
            if (sessions.length > 0) {
                return {
                    valid: false,
                    code: ValidationResult.GAME_ACTIVE,
                    message: `You already have an active ${gameType} session. Use /stopgame to cancel it first.`
                };
            }
            
            // Check legacy game_active flag
            const balance = await dbManager.getUserBalance(userId, guildId);
            if (balance.game_active) {
                return {
                    valid: false,
                    code: ValidationResult.GAME_ACTIVE,
                    message: 'You have an active game session. Finish it or use /stopgame to cancel it.'
                };
            }
            
            return { valid: true };
            
        } catch (error) {
            return {
                valid: false,
                code: 'SESSION_VALIDATION_ERROR',
                message: 'Error validating session conflicts.'
            };
        }
    }

    async validateRateLimit(userId, gameType) {
        // Simple rate limiting - prevent rapid session creation
        const cacheKey = `rate_limit_${userId}_${gameType}`;
        const lastCreation = this.validationCache.get(cacheKey);
        
        if (lastCreation && Date.now() - lastCreation < 1000) {
            return {
                valid: false,
                code: ValidationResult.COOLDOWN_ACTIVE,
                message: 'Please wait a moment before starting another game.'
            };
        }
        
        this.validationCache.set(cacheKey, Date.now());
        return { valid: true };
    }

    validatePayout(payout, session) {
        const config = this.getGameConfiguration(session.gameType);
        const maxPayout = session.betAmount * config.maxMultiplier;
        
        if (payout > maxPayout) {
            return {
                valid: false,
                reason: `Payout ${payout} exceeds maximum ${maxPayout}`,
                adjustedPayout: maxPayout
            };
        }
        
        if (payout < 0) {
            return {
                valid: false,
                reason: 'Negative payout not allowed',
                adjustedPayout: 0
            };
        }
        
        return { valid: true };
    }

    getGameConfiguration(gameType) {
        return this.gameConfigurations.get(gameType) || {
            enabled: true,
            minBet: 1,
            maxBet: 1000000,
            maxMultiplier: 1000,
            defaultTimeout: 300000, // 5 minutes
            requiresBet: true,
            supportsMultiplayer: false
        };
    }

    loadGameConfigurations() {
        // Load game-specific configurations
        const configs = {
            [GameType.BLACKJACK]: {
                enabled: true,
                minBet: 1,
                maxBet: 100000,
                maxMultiplier: 3,
                defaultTimeout: 300000,
                requiresBet: true,
                supportsMultiplayer: false
            },
            [GameType.SLOTS]: {
                enabled: true,
                minBet: 1,
                maxBet: 50000,
                maxMultiplier: 1000,
                defaultTimeout: 120000,
                requiresBet: true,
                supportsMultiplayer: false
            },
            [GameType.UNO]: {
                enabled: true,
                minBet: 0,
                maxBet: 10000,
                maxMultiplier: 4,
                defaultTimeout: 1200000, // 20 minutes
                requiresBet: false,
                supportsMultiplayer: true
            },
            [GameType.BATTLESHIP]: {
                enabled: true,
                minBet: 0,
                maxBet: 25000,
                maxMultiplier: 2,
                defaultTimeout: 900000, // 15 minutes
                requiresBet: false,
                supportsMultiplayer: true
            }
        };
        
        for (const [gameType, config] of Object.entries(configs)) {
            this.gameConfigurations.set(gameType, config);
        }
    }

    getErrorTitle(errorCode) {
        const titles = {
            [ValidationResult.INSUFFICIENT_FUNDS]: 'Insufficient Funds',
            [ValidationResult.GAME_ACTIVE]: 'Game Already Active',
            [ValidationResult.SESSION_LIMIT]: 'Session Limit Reached',
            [ValidationResult.INVALID_BET]: 'Invalid Bet Amount',
            [ValidationResult.USER_BANNED]: 'Access Denied',
            [ValidationResult.GAME_DISABLED]: 'Game Disabled',
            [ValidationResult.COOLDOWN_ACTIVE]: 'Cooldown Active'
        };
        
        return titles[errorCode] || 'Validation Error';
    }

    shouldShowHelp(errorCode) {
        const helpCodes = [
            ValidationResult.INSUFFICIENT_FUNDS,
            ValidationResult.GAME_ACTIVE,
            ValidationResult.INVALID_BET,
            ValidationResult.COOLDOWN_ACTIVE
        ];
        
        return helpCodes.includes(errorCode);
    }

    getHelpMessage(errorCode) {
        const messages = {
            [ValidationResult.INSUFFICIENT_FUNDS]: 'Use `/balance` to check your funds or `/work` to earn more.',
            [ValidationResult.GAME_ACTIVE]: 'Use `/stopgame` to cancel your current session, then try again.',
            [ValidationResult.INVALID_BET]: 'Check the minimum and maximum bet amounts for this game.',
            [ValidationResult.COOLDOWN_ACTIVE]: 'Wait a moment, then try starting your game again.'
        };
        
        return messages[errorCode] || 'Contact support if this issue persists.';
    }

    cleanValidationCache() {
        const cutoff = Date.now() - 30000; // Remove entries older than 30 seconds
        
        for (const [key, entry] of this.validationCache) {
            if (entry.timestamp < cutoff) {
                this.validationCache.delete(key);
            }
        }
        
        logger.debug(`Enhanced Session Integrator: Cleaned validation cache, ${this.validationCache.size} entries remaining`);
    }

    /**
     * Get comprehensive status and metrics
     */
    getStatus() {
        const sessionManagerStatus = enterpriseSessionManager.getStatus();
        
        return {
            integrator: {
                version: '2.0.0',
                metrics: { ...this.sessionMetrics },
                validationCacheSize: this.validationCache.size,
                gameConfigsLoaded: this.gameConfigurations.size
            },
            sessionManager: sessionManagerStatus
        };
    }

    /**
     * Initialize the enhanced integrator
     */
    async initialize() {
        try {
            await enterpriseSessionManager.initialize();
            logger.info('Enhanced Game Session Integrator initialized with Professional Session Manager');
            return { success: true };
        } catch (error) {
            logger.error(`Enhanced Game Session Integrator initialization failed: ${error.message}`);
            throw error;
        }
    }
}

// Export singleton instance
const enhancedGameSessionIntegrator = new EnhancedGameSessionIntegrator();

module.exports = enhancedGameSessionIntegrator;