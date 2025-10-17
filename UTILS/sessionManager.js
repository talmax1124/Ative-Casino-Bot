/**
 * UNIFIED SESSION MANAGER - PROFESSIONAL ENTERPRISE GRADE
 * Single source of truth for ALL game session management
 * Robust, error-free, production-ready code with comprehensive error handling
 * 
 * @author ATIVE Casino Bot Team
 * @version 2.0.0
 * @license MIT
 */

const dbManager = require('./database');
const logger = require('./logger');
const { sendLogMessage } = require('./common');
const { EventEmitter } = require('events');
const nodeCache = require('./nodeCache');

// Session Manager Fallback System
class SessionManagerFallbackSystem {
    constructor() {
        this.fallbackMode = false;
        this.persistentStorage = new Map(); // Critical for session continuity
        this.emergencyRefunds = new Map(); // Track refunds in emergency mode
        this.fallbackSessionId = 0; // Generate IDs when database unavailable
        this.criticalErrors = [];
        this.maxCriticalErrors = 10;
    }

    enableFallbackMode(reason) {
        if (!this.fallbackMode) {
            this.fallbackMode = true;
            logger.error(`🚨 SESSION MANAGER FALLBACK MODE ENABLED: ${reason}`);
            
            // Log to comprehensive logger if available
            try {
                const comprehensiveLogger = require('./comprehensiveLogger');
                comprehensiveLogger.logError('SESSION_FALLBACK_ENABLED', new Error(reason), {
                    critical: true,
                    fallbackActive: true,
                    affectedSessions: this.persistentStorage.size
                }).catch(() => {});
            } catch (e) {
                // Comprehensive logger not available
            }
        }
        
        this.criticalErrors.push({ reason, timestamp: Date.now() });
        if (this.criticalErrors.length > this.maxCriticalErrors) {
            this.criticalErrors.shift();
        }
    }

    disableFallbackMode() {
        if (this.fallbackMode) {
            this.fallbackMode = false;
            logger.info('✅ Session Manager fallback mode DISABLED - Normal operation restored');
            
            try {
                const comprehensiveLogger = require('./comprehensiveLogger');
                comprehensiveLogger.logSystem('SESSION_MANAGER_RESTORED', 'Normal operation restored', {
                    persistedSessions: this.persistentStorage.size,
                    emergencyRefunds: this.emergencyRefunds.size
                }).catch(() => {});
            } catch (e) {
                // Silent fail
            }
        }
    }

    // Generate emergency session ID when database is unavailable
    generateFallbackSessionId() {
        this.fallbackSessionId++;
        return `FALLBACK_${Date.now()}_${this.fallbackSessionId}`;
    }

    // Store critical session data for emergency recovery
    persistSession(sessionId, sessionData) {
        this.persistentStorage.set(sessionId, {
            ...sessionData,
            fallbackMode: true,
            persistedAt: Date.now()
        });
    }

    // Retrieve persisted session data
    getPersistedSession(sessionId) {
        return this.persistentStorage.get(sessionId);
    }

    // Track emergency refunds (when game fails but money was charged)
    addEmergencyRefund(userId, amount, reason, sessionId) {
        const refundKey = `${userId}_${Date.now()}`;
        this.emergencyRefunds.set(refundKey, {
            userId,
            amount,
            reason,
            sessionId,
            timestamp: Date.now(),
            processed: false
        });
        
        logger.error(`🚨 EMERGENCY REFUND TRACKED: ${userId} - ${amount} coins (${reason})`);
        return refundKey;
    }

    // Get all pending emergency refunds (for manual processing)
    getPendingRefunds() {
        return Array.from(this.emergencyRefunds.entries())
            .filter(([_, refund]) => !refund.processed)
            .map(([key, refund]) => ({ key, ...refund }));
    }

    // Get fallback system status
    getStatus() {
        return {
            fallbackMode: this.fallbackMode,
            persistedSessions: this.persistentStorage.size,
            pendingRefunds: this.getPendingRefunds().length,
            criticalErrors: this.criticalErrors.length,
            lastError: this.criticalErrors[this.criticalErrors.length - 1]
        };
    }
}

const sessionFallback = new SessionManagerFallbackSystem();

// Session states enum
const SessionState = Object.freeze({
    ACTIVE: 'active',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    ERROR: 'error',
    TIMEOUT: 'timeout',
    PAUSED: 'paused'
});

// Game types enum
const GameType = Object.freeze({
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
    RPS: 'rps',
    MATRIX_SLOTS: 'matrix_slots',
    DUCK_GAME: 'duck_game',
    MULTI_SLOTS: 'multi_slots',
    BATTLESHIP: 'battleship',
    WORDCHAIN: 'wordchain',
    YAHTZEE: 'yahtzee',
    LOTTERY: 'lottery',
    TREASUREVAULT: 'treasurevault',
    ROULETTE: 'roulette',
    RUSSIAN_ROULETTE: 'russianroulette',
    CEELO: 'ceelo',
    QUIZ: 'quiz'
});

/**
 * Professional Session Manager with enterprise-grade features
 * Handles all game sessions with robust error handling and recovery
 */
class UnifiedSessionManager extends EventEmitter {
    constructor() {
        super();
        
        // Core data structures
        this.sessions = new Map(); // sessionId -> session data
        this.userSessions = new Map(); // userId -> Set of sessionIds
        this.channelSessions = new Map(); // channelId -> Set of sessionIds
        this.gameSessions = new Map(); // gameType -> Set of sessionIds
        
        // Rate limiting and locks
        this.rateLimits = new Map(); // userId -> timestamp
        this.locks = new Map(); // userId -> lock data
        this.abuseCooldowns = new Map(); // userId -> untilTimestamp
        
        // Configuration
        this.config = {
            maxSessionsPerUser: 1,
            maxSessionsPerChannel: 5,
            sessionTimeout: 300000, // 5 minutes default
            cleanupInterval: 60000, // 1 minute
            rateLimitWindow: 500, // 0.5 seconds (less aggressive)
            maxRetries: 3,
            debugMode: process.env.NODE_ENV === 'development'
        };
        
        // Statistics tracking
        this.stats = {
            totalCreated: 0,
            totalCompleted: 0,
            totalCancelled: 0,
            totalErrors: 0,
            totalTimeouts: 0,
            totalRefunded: 0
        };
        
        // Initialize cleanup
        this.cleanupTimer = setInterval(() => this.performCleanup(), this.config.cleanupInterval);
        
        // Bind methods to maintain context
        this.createSession = this.createSession.bind(this);
        this.endSession = this.endSession.bind(this);
        this.getSession = this.getSession.bind(this);
        this.updateSession = this.updateSession.bind(this);
        
        this.log('info', 'Unified Session Manager initialized successfully');
    }

    /**
     * Enhanced logging with debug mode support
     */
    log(level, message, data = null) {
        const logMessage = `[SessionManager] ${message}`;
        
        if (this.config.debugMode || level === 'error' || level === 'warn') {
            if (data) {
                logger[level](`${logMessage}`, data);
            } else {
                logger[level](logMessage);
            }
        }
        
        // Emit events for monitoring
        this.emit('log', { level, message, data, timestamp: Date.now() });
    }

    /**
     * Check if user can create a new session with comprehensive validation
     */
    async canCreateSession(userId, guildId, gameType) {
        try {
            // Rate limiting check - only apply if user has active sessions or multiple rapid attempts
            const lastAttempt = this.rateLimits.get(userId);
            if (lastAttempt && Date.now() - lastAttempt < this.config.rateLimitWindow) {
                // Check if user already has active sessions
                const userSessionIds = this.userSessions.get(userId);
                const hasActiveSessions = userSessionIds && Array.from(userSessionIds).some(sessionId => {
                    const session = this.sessions.get(sessionId);
                    return session && session.state === SessionState.ACTIVE;
                });
                
                // Only rate limit if user has active sessions (prevents spam while allowing normal usage)
                if (hasActiveSessions) {
                    return {
                        allowed: false,
                        reason: 'RATE_LIMITED',
                        message: 'Please wait a moment before starting a new game.',
                        retryAfter: this.config.rateLimitWindow - (Date.now() - lastAttempt)
                    };
                }
            }

            // Check for locks
            if (this.locks.has(userId)) {
                const lock = this.locks.get(userId);
                const lockAge = Date.now() - lock.timestamp;
                if (lockAge < 1000) { // Reduced to 1s for faster recovery
                    this.log('debug', `User ${userId} blocked by lock (age: ${lockAge}ms, gameType: ${lock.gameType})`);
                    return {
                        allowed: false,
                        reason: 'LOCKED',
                        message: 'Session creation in progress. Please wait.',
                        lockAge: lockAge
                    };
                }
                // Remove stale lock
                this.log('debug', `Removing stale lock for user ${userId} (age: ${lockAge}ms)`);
                this.locks.delete(userId);
            }

            // Check existing sessions
            const userSessionIds = this.userSessions.get(userId);
            if (userSessionIds && userSessionIds.size > 0) {
                // Check for active sessions
                for (const sessionId of userSessionIds) {
                    const session = this.sessions.get(sessionId);
                    if (session && session.state === SessionState.ACTIVE) {
                        // Additional check: if session is very old (>15 minutes), force cleanup
                        const sessionAge = Date.now() - session.createdAt;
                        if (sessionAge > 900000) { // 15 minutes
                            this.log('warn', `Force-ending stale session ${sessionId} for user ${userId} (age: ${Math.round(sessionAge/60000)}min)`);
                            try {
                                await this.endSession(sessionId, { reason: 'stale_cleanup', force: true });
                                continue; // Check next session
                            } catch (cleanupError) {
                                this.log('error', `Failed to cleanup stale session ${sessionId}`, cleanupError);
                            }
                        }
                        
                        return {
                            allowed: false,
                            reason: 'SESSION_EXISTS',
                            message: `You have an active ${session.gameType} session. Complete it before starting a new game.`,
                            existingSession: session
                        };
                    }
                }
            }

            // Check database for game_active flag (legacy support)
            try {
                const balance = await dbManager.getUserBalance(userId, guildId);
                if (balance.game_active) {
                    // Clear stale flag
                    await dbManager.updateUserBalance(userId, guildId, 0, 0, { game_active: false });
                    this.log('warn', `Cleared stale game_active flag for user ${userId}`);
                }
            } catch (dbError) {
                this.log('error', `Database check failed for user ${userId}`, dbError);
                // Continue anyway - don't block on DB errors
            }

            return {
                allowed: true,
                reason: 'OK',
                message: 'Session creation allowed'
            };

        } catch (error) {
            this.log('error', `Error checking session creation for user ${userId}`, error);
            return {
                allowed: false,
                reason: 'ERROR',
                message: 'Error checking session status. Please try again.',
                error: error.message
            };
        }
    }

    /**
     * Create a new game session with full validation and error handling
     */
    async createSession(config) {
        const {
            userId,
            guildId,
            channelId,
            gameType,
            betAmount = 0,
            timeout = this.config.sessionTimeout,
            metadata = {},
            betPreDeducted = false,
            interaction = null
        } = config;

        const client = interaction?.client;

        this.log('debug', `createSession called for user ${userId} (${gameType}) in guild ${guildId} with bet ${betAmount}`);

        // Validate required parameters
        if (!userId || !guildId || !gameType) {
            const error = 'Missing required parameters for session creation';
            this.log('error', error, config);
            return {
                success: false,
                error,
                code: 'INVALID_PARAMS'
            };
        }

        // Set rate limit early to throttle rapid attempts
        this.rateLimits.set(userId, Date.now());

        try {
            // Comprehensive validation BEFORE acquiring user lock to avoid self-blocking
            const canCreate = await this.canCreateSession(userId, guildId, gameType);
            if (!canCreate.allowed) {
                // Surface to log channel if available
                if (client) {
                    const level = (canCreate.reason === 'ERROR' || canCreate.reason === 'BET_ERROR' || canCreate.reason === 'CREATION_ERROR') ? 'error' : 'warn';
                    await sendLogMessage(client, level, `Session create blocked for ${userId} (${gameType}) — ${canCreate.reason}: ${canCreate.message}`, userId, guildId);
                }
                return {
                    success: false,
                    error: canCreate.message,
                    code: canCreate.reason,
                    details: canCreate
                };
            }

            // Acquire lock only after validation passes
            this.locks.set(userId, { timestamp: Date.now(), gameType });

            // Handle bet amount if specified
            if (betAmount > 0) {
                try {
                    if (!betPreDeducted) {
                        const balance = await dbManager.getUserBalance(userId, guildId);
                        if (balance.wallet < betAmount) {
                            this.locks.delete(userId);
                            if (client) {
                                await sendLogMessage(client, 'warn', `Insufficient funds for session (${gameType}). Wallet ${balance.wallet} < Bet ${betAmount}`, userId, guildId);
                            }
                            return {
                                success: false,
                                error: 'Insufficient funds for this bet.',
                                code: 'INSUFFICIENT_FUNDS',
                                required: betAmount,
                                available: balance.wallet
                            };
                        }

                        // Deduct bet amount
                        const deductSuccess = await dbManager.updateUserBalance(
                            userId, 
                            guildId, 
                            -betAmount, 
                            0, 
                            { game_active: true }
                        );

                        if (!deductSuccess) {
                            this.locks.delete(userId);
                            if (client) {
                                await sendLogMessage(client, 'error', `Failed to process bet during session create (${gameType}) for user ${userId}`, userId, guildId);
                            }
                            return {
                                success: false,
                                error: 'Failed to process bet. Please try again.',
                                code: 'BET_FAILED'
                            };
                        }
                    } else {
                        // Bet already deducted by upstream logic; set game_active only
                        await dbManager.updateUserBalance(userId, guildId, 0, 0, { game_active: true });
                    }
                } catch (betError) {
                    this.locks.delete(userId);
                    this.log('error', `Bet processing failed for user ${userId}`, betError);
                    
                    // Enable fallback mode for database issues
                    if (betError.message.includes('database') || betError.message.includes('connection')) {
                        sessionFallback.enableFallbackMode(`Bet processing DB error: ${betError.message}`);
                        
                        // Track emergency refund if money might have been charged
                        if (betAmount > 0 && !betPreDeducted) {
                            sessionFallback.addEmergencyRefund(userId, betAmount, 'bet_processing_failed', 'PENDING_SESSION');
                        }
                    }
                    
                    if (client) {
                        await sendLogMessage(client, 'error', `Bet error during session create (${gameType}): ${betError.message}`, userId, guildId);
                    }
                    return {
                        success: false,
                        error: 'Failed to process bet.',
                        code: 'BET_ERROR',
                        details: betError.message
                    };
                }
            } else {
                // Set game_active flag even without bet
                try {
                    await dbManager.updateUserBalance(userId, guildId, 0, 0, { game_active: true });
                } catch (dbError) {
                    this.log('warn', `Failed to set game_active flag for user ${userId}`, dbError);
                    
                    // Enable fallback mode for database issues but continue (non-critical)
                    if (dbError.message.includes('database') || dbError.message.includes('connection')) {
                        sessionFallback.enableFallbackMode(`game_active flag DB error: ${dbError.message}`);
                    }
                    // Continue - non-critical error
                }
            }

            // Generate unique session ID (with fallback support)
            let sessionId;
            try {
                sessionId = this.generateSessionId(gameType, userId);
            } catch (idError) {
                // Fallback session ID generation
                this.log('warn', `Session ID generation failed, using fallback: ${idError.message}`);
                sessionId = sessionFallback.generateFallbackSessionId();
                sessionFallback.enableFallbackMode(`Session ID generation failed: ${idError.message}`);
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
                createdAt: Date.now(),
                lastActivity: Date.now(),
                timeout,
                metadata: {
                    ...metadata,
                    version: '2.0.0',
                    // Include play-for context if available
                    ...(global.playForContext ? {
                        playFor: true,
                        recipientId: global.playForContext.recipientId,
                        recipientName: global.playForContext.recipientName
                    } : {})
                },
                stats: {
                    actions: 0,
                    errors: 0
                }
            };

            // Store session in all indexes
            this.sessions.set(sessionId, session);
            this.log('debug', `Session object stored and indexed: ${sessionId}`);
            
            // Debug play-for sessions
            if (session.metadata.playFor) {
                this.log('info', `PlayFor session created: ${sessionId} for ${userId} -> ${session.metadata.recipientId}`);
            }
            
            // 🚀 NODECACHE: Cache session for high-speed access
            try {
                await nodeCache.cacheGameSession(sessionId, session);
                this.log('debug', `Session cached in NodeCache: ${sessionId}`);
            } catch (cacheError) {
                this.log('warn', `NodeCache session caching failed: ${cacheError.message}`);
                // Continue - caching failure shouldn't block session creation
            }
            
            // 🛡️ FALLBACK SYSTEM: Persist critical session data for emergency recovery
            try {
                sessionFallback.persistSession(sessionId, {
                    userId,
                    guildId,
                    gameType,
                    betAmount,
                    betPreDeducted,
                    state: SessionState.ACTIVE,
                    createdAt: session.createdAt,
                    emergency_recovery_data: true
                });
            } catch (persistError) {
                this.log('warn', `Failed to persist session to fallback system: ${persistError.message}`);
                // Continue - non-critical for immediate operation
            }
            
            // User index
            if (!this.userSessions.has(userId)) {
                this.userSessions.set(userId, new Set());
            }
            this.userSessions.get(userId).add(sessionId);
            
            // Channel index
            if (channelId) {
                if (!this.channelSessions.has(channelId)) {
                    this.channelSessions.set(channelId, new Set());
                }
                this.channelSessions.get(channelId).add(sessionId);
            }
            
            // Game type index
            if (!this.gameSessions.has(gameType)) {
                this.gameSessions.set(gameType, new Set());
            }
            this.gameSessions.get(gameType).add(sessionId);

            // Set timeout
            if (timeout > 0) {
                session.timeoutHandle = setTimeout(() => {
                    this.handleTimeout(sessionId);
                }, timeout);
            }

            // Update statistics
            this.stats.totalCreated++;

            // Release lock and clear rate limit after successful creation
            this.locks.delete(userId);
            this.rateLimits.delete(userId); // Clear rate limit on success

            // Emit event
            this.emit('sessionCreated', session);

            this.log('info', `Session created: ${sessionId} for user ${userId} (${gameType})`);

            // Debug log channel
            if (client) {
                await sendLogMessage(client, 'info', `Session created: ${sessionId} • ${gameType} • Bet ${betAmount}`, userId, guildId);
            }

            return {
                success: true,
                sessionId,
                session
            };

        } catch (error) {
            // Cleanup on error
            this.locks.delete(userId);
            
            // Try to refund if bet was deducted
            if (betAmount > 0) {
                try {
                    await dbManager.updateUserBalance(userId, guildId, betAmount, 0, { game_active: false });
                    this.log('info', `Refunded ${betAmount} to user ${userId} due to session creation error`);
                } catch (refundError) {
                    this.log('error', `Failed to refund user ${userId}`, refundError);
                }
            }

            this.log('error', `Session creation failed for user ${userId}`, error);
            this.stats.totalErrors++;

            if (client) {
                await sendLogMessage(client, 'error', `Session creation failed (${gameType}) for ${userId}: ${error.message}`, userId, guildId);
            }

            return {
                success: false,
                error: 'Failed to create session. Please try again.',
                code: 'CREATION_ERROR',
                details: error.message
            };
        }
    }

    /**
     * End a session with proper cleanup and payout processing
     */
    async endSession(sessionId, result = {}) {
        const {
            payout = 0,
            won = false,
            reason = 'completed',
            force = false
        } = result;

        try {
            const session = this.sessions.get(sessionId);
            if (!session) {
                this.log('warn', `Attempted to end non-existent session: ${sessionId}`);
                return {
                    success: true, // Already ended
                    message: 'Session already ended'
                };
            }

            // Prevent double-ending
            if (session.state !== SessionState.ACTIVE && !force) {
                this.log('warn', `Session ${sessionId} already in state: ${session.state}`);
                return {
                    success: true,
                    message: `Session already ${session.state}`
                };
            }

            // Clear timeout
            if (session.timeoutHandle) {
                clearTimeout(session.timeoutHandle);
                delete session.timeoutHandle;
            }

            // Process payout if any
            if (payout > 0) {
                try {
                    // Check if this is a play-for session
                    const payoutOptions = { game_active: false };
                    if (session.metadata && session.metadata.playFor) {
                        this.log('info', `PlayFor payout processing: ${payout} for session ${sessionId} -> ${session.metadata.recipientId}`);
                        payoutOptions.playFor = {
                            recipientId: session.metadata.recipientId,
                            recipientName: session.metadata.recipientName
                        };
                    } else {
                        this.log('debug', `Regular payout processing: ${payout} for session ${sessionId} (no playFor metadata)`);
                    }

                    const payoutSuccess = await dbManager.updateUserBalance(
                        session.userId,
                        session.guildId,
                        payout,
                        0,
                        payoutOptions
                    );

                    if (!payoutSuccess) {
                        this.log('error', `Failed to process payout for session ${sessionId}`);
                    } else {
                        session.payout = payout;
                        session.won = won;
                    }
                } catch (payoutError) {
                    this.log('error', `Payout error for session ${sessionId}`, payoutError);
                }
            } else {
                // Just clear game_active flag
                try {
                    await dbManager.updateUserBalance(
                        session.userId,
                        session.guildId,
                        0,
                        0,
                        { game_active: false }
                    );
                } catch (dbError) {
                    this.log('warn', `Failed to clear game_active flag for session ${sessionId}`, dbError);
                }
            }

            // Update session state
            session.state = reason === 'timeout' ? SessionState.TIMEOUT :
                          reason === 'cancelled' ? SessionState.CANCELLED :
                          reason === 'error' ? SessionState.ERROR :
                          SessionState.COMPLETED;
            session.endedAt = Date.now();
            session.endReason = reason;

            // Update statistics
            if (session.state === SessionState.COMPLETED) {
                this.stats.totalCompleted++;
            } else if (session.state === SessionState.CANCELLED) {
                this.stats.totalCancelled++;
            } else if (session.state === SessionState.TIMEOUT) {
                this.stats.totalTimeouts++;
            } else if (session.state === SessionState.ERROR) {
                this.stats.totalErrors++;
            }

            // Remove from indexes
            this.removeFromIndexes(sessionId, session);

            // Keep session in memory briefly for reference
            setTimeout(() => {
                this.sessions.delete(sessionId);
            }, 60000); // Keep for 1 minute

            // Emit event
            this.emit('sessionEnded', session);

            this.log('info', `Session ended: ${sessionId} (${session.state})`);

            return {
                success: true,
                session,
                state: session.state,
                payout: session.payout || 0
            };

        } catch (error) {
            this.log('error', `Error ending session ${sessionId}`, error);
            this.stats.totalErrors++;
            
            // Force cleanup on error
            if (sessionId && this.sessions.has(sessionId)) {
                const session = this.sessions.get(sessionId);
                this.removeFromIndexes(sessionId, session);
                this.sessions.delete(sessionId);
            }

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Force end a session (for stuck game recovery)
     */
    async forceEndSession(sessionId, reason = 'FORCED') {
        try {
            const session = this.sessions.get(sessionId);
            if (!session) {
                this.log('warn', `Force end requested for non-existent session: ${sessionId}`);
                return { success: false, error: 'SESSION_NOT_FOUND' };
            }

            this.log('warn', `Force ending session ${sessionId} - Reason: ${reason}`);

            // If bet was pre-deducted and game is being force-ended, refund the user
            if (session.betPreDeducted && session.betAmount > 0) {
                try {
                    const dbManager = require('./database');
                    await dbManager.updateBalance(session.userId, session.betAmount, 'add', session.guildId, {
                        source: 'force_session_end',
                        reason: `Refund for stuck ${session.gameType} game`,
                        sessionId: sessionId
                    });
                    this.log('info', `Refunded ${session.betAmount} to user ${session.userId} for forced session end`);
                } catch (refundError) {
                    this.log('error', `Failed to refund user ${session.userId} for forced session end`, refundError);
                }
            }

            // Clean up session
            this.removeFromIndexes(sessionId, session);
            this.sessions.delete(sessionId);

            // Clear any timeouts
            if (session.timeoutHandle) {
                clearTimeout(session.timeoutHandle);
            }

            // Clean up NodeCache
            const nodeCache = require('./nodeCache');
            try {
                await nodeCache.deleteGameSession(sessionId);
            } catch (cacheError) {
                this.log('debug', `NodeCache cleanup failed for ${sessionId}: ${cacheError.message}`);
            }

            // Clean up fallback system
            const sessionFallback = require('./sessionFallback');
            try {
                sessionFallback.removeSession(sessionId);
            } catch (fallbackError) {
                this.log('debug', `Fallback cleanup failed for ${sessionId}: ${fallbackError.message}`);
            }

            this.stats.totalEnded++;
            this.log('info', `Session ${sessionId} force-ended successfully (${reason})`);

            return {
                success: true,
                reason: reason,
                refunded: session.betPreDeducted ? session.betAmount : 0
            };

        } catch (error) {
            this.log('error', `Error force-ending session ${sessionId}`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get session by ID with validation
     */
    async getSession(sessionId) {
        if (!sessionId) return null;
        
        // 🚀 STEP 1: Check in-memory first (fastest)
        let session = this.sessions.get(sessionId);
        if (session) {
            return session;
        }
        
        // 🚀 STEP 2: Check NodeCache cache
        try {
            const cachedSession = await nodeCache.getGameSession(sessionId);
            if (cachedSession) {
                this.log('debug', `Session ${sessionId} retrieved from NodeCache`);
                
                // Restore to in-memory for faster subsequent access
                this.sessions.set(sessionId, cachedSession);
                
                // Update user index
                if (cachedSession.userId && !this.userSessions.has(cachedSession.userId)) {
                    this.userSessions.set(cachedSession.userId, new Set());
                }
                if (cachedSession.userId) {
                    this.userSessions.get(cachedSession.userId).add(sessionId);
                }
                
                return cachedSession;
            }
        } catch (cacheError) {
            this.log('debug', `NodeCache session retrieval failed: ${cacheError.message}`);
            // Continue to fallback system
        }
        
        // 🛡️ STEP 3: Check fallback system
        try {
            const fallbackSession = sessionFallback.getPersistedSession(sessionId);
            if (fallbackSession && fallbackSession.emergency_recovery_data) {
                this.log('warn', `Session ${sessionId} retrieved from fallback storage`);
                
                // Restore basic session data
                const restoredSession = {
                    sessionId,
                    userId: fallbackSession.userId,
                    guildId: fallbackSession.guildId,
                    gameType: fallbackSession.gameType,
                    betAmount: fallbackSession.betAmount,
                    state: SessionState.ACTIVE,
                    createdAt: fallbackSession.createdAt,
                    lastActivity: Date.now(),
                    metadata: { recovered: true },
                    stats: { actions: 0, errors: 0 }
                };
                
                // Restore to memory and cache
                this.sessions.set(sessionId, restoredSession);
                nodeCache.cacheGameSession(sessionId, restoredSession).catch(() => {});
                
                return restoredSession;
            }
        } catch (fallbackError) {
            this.log('debug', `Fallback session retrieval failed: ${fallbackError.message}`);
        }
        
        return null;
    }

    /**
     * Update an existing session with partial data
     * Safely merges fields like metadata and gameData, bumps activity, and records optional action tag
     * @param {string} sessionId
     * @param {Object} updates - Partial session fields to update
     * @param {string|null} action - Optional action tag for auditing
     */
    async updateSession(sessionId, updates = {}, action = null) {
        try {
            const session = this.sessions.get(sessionId);
            if (!session) {
                this.log('warn', `updateSession called for missing session: ${sessionId}`);
                return { success: false, error: 'SESSION_NOT_FOUND' };
            }

            // Merge metadata
            if (updates.metadata && typeof updates.metadata === 'object') {
                session.metadata = { ...(session.metadata || {}), ...updates.metadata };
            }

            // Merge gameData (allow top-level gameData holder)
            if (updates.gameData && typeof updates.gameData === 'object') {
                session.gameData = { ...(session.gameData || {}), ...updates.gameData };
            }

            // Allow certain top-level updates (state/timeout/channelId etc.)
            const allowedTopLevel = ['state', 'channelId', 'timeout'];
            for (const key of allowedTopLevel) {
                if (Object.prototype.hasOwnProperty.call(updates, key)) {
                    session[key] = updates[key];
                }
            }

            // Update activity and stats
            session.lastActivity = Date.now();
            if (session.stats) session.stats.actions++;

            // Handle timeout update
            if (typeof updates.timeout === 'number' && updates.timeout > 0) {
                if (session.timeoutHandle) clearTimeout(session.timeoutHandle);
                session.timeout = updates.timeout;
                session.timeoutHandle = setTimeout(() => this.handleTimeout(sessionId), updates.timeout);
            }

            // Optional action audit (support both param and updates.action)
            const actionTag = action || updates.action;
            if (actionTag) {
                session.lastAction = actionTag;
            }

            // Persist back (Map holds reference, so not strictly required)
            this.sessions.set(sessionId, session);

            // 🚀 Update NodeCache asynchronously
            nodeCache.cacheGameSession(sessionId, session).catch(err => 
                this.log('debug', `NodeCache session update failed: ${err.message}`)
            );

            this.log('debug', `Session ${sessionId} updated${action ? ` (${action})` : ''}`);
            return { success: true, session };
        } catch (error) {
            this.log('error', `updateSession failed for ${sessionId}`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get active session for a user
     */
    getUserActiveSession(userId) {
        const sessionIds = this.userSessions.get(userId);
        if (!sessionIds || sessionIds.size === 0) return null;

        for (const sessionId of sessionIds) {
            const session = this.sessions.get(sessionId);
            if (session && session.state === SessionState.ACTIVE) {
                return session;
            }
        }
        return null;
    }

    /**
     * Get all sessions for a user
     */
    getUserSessions(userId) {
        const sessionIds = this.userSessions.get(userId);
        if (!sessionIds || sessionIds.size === 0) return [];

        const sessions = [];
        for (const sessionId of sessionIds) {
            const session = this.sessions.get(sessionId);
            if (session) {
                sessions.push(session);
            }
        }
        return sessions;
    }

    /**
     * Get sessions for a channel
     */
    getChannelSessions(channelId) {
        const sessionIds = this.channelSessions.get(channelId);
        if (!sessionIds || sessionIds.size === 0) return [];

        const sessions = [];
        for (const sessionId of sessionIds) {
            const session = this.sessions.get(sessionId);
            if (session && session.state === SessionState.ACTIVE) {
                sessions.push(session);
            }
        }
        return sessions;
    }

    /**
     * Update session activity timestamp
     */
    updateActivity(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.lastActivity = Date.now();
            session.stats.actions++;
        }
    }

    /**
     * Cancel session with refund
     */
    async cancelSession(sessionId, reason = 'User cancelled', refund = true) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return { success: true, message: 'Session not found' };
        }

        // Process refund if needed
        if (refund && session.betAmount > 0) {
            this.stats.totalRefunded += session.betAmount;
        }

        return await this.endSession(sessionId, {
            payout: refund ? session.betAmount : 0,
            reason: 'cancelled',
            force: true
        });
    }

    /**
     * Cancel all active sessions for a user (helper for legacy commands)
     */
    async cancelUserSessions(userId, reason = 'User requested cancel') {
        try {
            const sessions = this.getUserSessions(userId).filter(s => s.state === SessionState.ACTIVE);
            let cancelled = 0;
            let refunded = 0;
            for (const s of sessions) {
                if (s.betAmount > 0) refunded += s.betAmount;
                await this.cancelSession(s.sessionId, reason, true);
                cancelled++;
            }
            return { success: true, cancelled, refunded };
        } catch (error) {
            this.log('error', `cancelUserSessions error for ${userId}`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Force cleanup all sessions for a user
     */
    async forceCleanupUser(userId, guildId, reason = 'Force cleanup') {
        const sessionIds = this.userSessions.get(userId);
        if (!sessionIds || sessionIds.size === 0) {
            // Clear database flag just in case
            try {
                await dbManager.updateUserBalance(userId, guildId, 0, 0, { game_active: false });
            } catch (error) {
                this.log('error', `Failed to clear game_active for user ${userId}`, error);
            }
            
            return {
                success: true,
                sessionsCleaned: 0,
                totalRefunded: 0
            };
        }

        let cleaned = 0;
        let refunded = 0;

        for (const sessionId of sessionIds) {
            const session = this.sessions.get(sessionId);
            if (session) {
                if (session.state === SessionState.ACTIVE && session.betAmount > 0) {
                    refunded += session.betAmount;
                }
                await this.cancelSession(sessionId, reason, true);
                cleaned++;
            }
        }

        this.log('info', `Force cleaned ${cleaned} sessions for user ${userId}`);

        return {
            success: true,
            sessionsCleaned: cleaned,
            totalRefunded: refunded
        };
    }

    /**
     * Handle session timeout
     */
    async handleTimeout(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session || session.state !== SessionState.ACTIVE) return;

        this.log('warn', `Session ${sessionId} timed out`);
        
        // Refund bet on timeout
        await this.endSession(sessionId, {
            payout: session.betAmount,
            reason: 'timeout'
        });
    }

    /**
     * Perform periodic cleanup of stale sessions
     */
    async performCleanup() {
        const now = Date.now();
        const staleThreshold = 600000; // 10 minutes
        let cleaned = 0;

        for (const [sessionId, session] of this.sessions) {
            // Skip non-active sessions
            if (session.state !== SessionState.ACTIVE) continue;

            // Check for stale sessions
            const age = now - session.lastActivity;
            if (age > staleThreshold) {
                await this.handleTimeout(sessionId);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.log('info', `Cleanup: ${cleaned} stale sessions removed`);
        }

        // Clean up old completed sessions
        for (const [sessionId, session] of this.sessions) {
            if (session.state !== SessionState.ACTIVE && session.endedAt) {
                const timeSinceEnd = now - session.endedAt;
                if (timeSinceEnd > 300000) { // 5 minutes
                    this.sessions.delete(sessionId);
                }
            }
        }
    }

    /**
     * Remove session from all indexes
     */
    removeFromIndexes(sessionId, session) {
        // Remove from user index
        const userSessions = this.userSessions.get(session.userId);
        if (userSessions) {
            userSessions.delete(sessionId);
            if (userSessions.size === 0) {
                this.userSessions.delete(session.userId);
            }
        }

        // Remove from channel index
        if (session.channelId) {
            const channelSessions = this.channelSessions.get(session.channelId);
            if (channelSessions) {
                channelSessions.delete(sessionId);
                if (channelSessions.size === 0) {
                    this.channelSessions.delete(session.channelId);
                }
            }
        }

        // Remove from game type index
        const gameSessions = this.gameSessions.get(session.gameType);
        if (gameSessions) {
            gameSessions.delete(sessionId);
            if (gameSessions.size === 0) {
                this.gameSessions.delete(session.gameType);
            }
        }
    }

    /**
     * Generate unique session ID
     */
    generateSessionId(gameType, userId) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 11);
        return `${gameType}_${userId}_${timestamp}_${random}`;
    }

    /**
     * Get comprehensive statistics
     */
    getStats() {
        const activeSessions = Array.from(this.sessions.values())
            .filter(s => s.state === SessionState.ACTIVE).length;

        return {
            activeSessions,
            totalSessions: this.sessions.size,
            usersWithSessions: this.userSessions.size,
            channelsWithSessions: this.channelSessions.size,
            ...this.stats
        };
    }

    /**
     * Debug method to dump all session data
     */
    debugSessions() {
        this.log('info', '=== SESSION DEBUG DUMP ===');
        this.log('info', `Total sessions: ${this.sessions.size}`);
        this.log('info', `Users with sessions: ${this.userSessions.size}`);
        this.log('info', `Channels with sessions: ${this.channelSessions.size}`);
        
        for (const [userId, sessionIds] of this.userSessions) {
            this.log('info', `User ${userId}: ${sessionIds.size} sessions`);
            for (const sessionId of sessionIds) {
                const session = this.sessions.get(sessionId);
                if (session) {
                    this.log('info', `  - ${sessionId}: ${session.gameType}, state=${session.state}, bet=${session.betAmount}`);
                }
            }
        }
        this.log('info', '=== END DEBUG DUMP ===');
    }

    /**
     * Get all active sessions (needed by gracefulShutdown)
     */
    getAllActiveSessions() {
        const activeSessions = [];
        for (const [sessionId, session] of this.sessions) {
            if (session.state === SessionState.ACTIVE) {
                activeSessions.push({
                    sessionId,
                    userId: session.userId,
                    gameType: session.gameType,
                    guildId: session.guildId,
                    channelId: session.channelId,
                    createdAt: session.createdAt,
                    betAmount: session.betAmount
                });
            }
        }
        return activeSessions;
    }

    /**
     * Get session statistics (needed by gracefulShutdown)
     */
    getSessionStats() {
        let active = 0;
        let total = this.sessions.size;
        let paused = 0;

        for (const [, session] of this.sessions) {
            if (session.state === SessionState.ACTIVE) active++;
            if (session.state === SessionState.PAUSED) paused++;
        }

        return { active, total, paused };
    }

    /**
     * Get active session count (needed by gracefulShutdown)
     */
    getActiveSessionCount() {
        let count = 0;
        for (const [, session] of this.sessions) {
            if (session.state === SessionState.ACTIVE) count++;
        }
        return count;
    }

    /**
     * End all sessions (needed by gracefulShutdown)
     */
    async endAllSessions() {
        let ended = 0;
        for (const [sessionId, session] of this.sessions) {
            if (session.state === SessionState.ACTIVE) {
                await this.cancelSession(sessionId, 'System cleanup', true);
                ended++;
            }
        }
        return { success: true, ended };
    }

    /**
     * Get user sessions (needed by gracefulShutdown)
     */
    getUserSessions(userId) {
        const sessionIds = this.userSessions.get(userId);
        if (!sessionIds) return [];
        
        const sessions = [];
        for (const sessionId of sessionIds) {
            const session = this.sessions.get(sessionId);
            if (session) {
                sessions.push(session);
            }
        }
        return sessions;
    }

    /**
     * Get specific session (needed by gracefulShutdown)
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId) || null;
    }

    /**
     * Cancel session with source tracking (alias for compatibility)
     */
    async cancelSessionWithSource(sessionId, reason, source) {
        return await this.endSession(sessionId, { reason, refund: true, source });
    }

    /**
     * Get comprehensive fallback system status
     */
    getFallbackStatus() {
        const sessionStatus = sessionFallback.getStatus();
        const dbStatus = dbManager.getFallbackStatus ? dbManager.getFallbackStatus() : { status: 'unknown' };
        
        return {
            sessionManager: sessionStatus,
            database: dbStatus,
            activeSessions: this.sessions.size,
            userSessions: this.userSessions.size,
            emergencyMode: sessionStatus.fallbackMode || dbStatus.fallbackMode,
            healthStatus: sessionStatus.fallbackMode ? '🚨 DEGRADED' : '✅ OPERATIONAL'
        };
    }

    /**
     * Force enable emergency mode (for testing/manual intervention)
     */
    enableEmergencyMode(reason = 'Manual activation') {
        sessionFallback.enableFallbackMode(reason);
        this.log('warn', `Emergency mode manually enabled: ${reason}`);
    }

    /**
     * Get all pending emergency refunds (for manual processing)
     */
    getPendingEmergencyRefunds() {
        return sessionFallback.getPendingRefunds();
    }

    /**
     * Process emergency refund (mark as handled)
     */
    async processEmergencyRefund(refundKey, processed = true, notes = '') {
        const refunds = sessionFallback.emergencyRefunds;
        if (refunds.has(refundKey)) {
            const refund = refunds.get(refundKey);
            refund.processed = processed;
            refund.processedAt = Date.now();
            refund.notes = notes;
            
            this.log('info', `Emergency refund ${processed ? 'processed' : 'marked pending'}: ${refundKey} - ${refund.amount} coins for user ${refund.userId}`);
            return refund;
        }
        return null;
    }

    /**
     * Attempt to recover session from fallback storage
     */
    recoverSessionFromFallback(sessionId) {
        const fallbackData = sessionFallback.getPersistedSession(sessionId);
        if (fallbackData && fallbackData.emergency_recovery_data) {
            this.log('info', `Attempting to recover session ${sessionId} from fallback storage`);
            
            // Create minimal session for recovery
            const recoveredSession = {
                sessionId,
                userId: fallbackData.userId,
                guildId: fallbackData.guildId,
                gameType: fallbackData.gameType,
                betAmount: fallbackData.betAmount,
                state: SessionState.ACTIVE,
                createdAt: fallbackData.createdAt,
                lastActivity: Date.now(),
                metadata: { recovered: true, originalCreatedAt: fallbackData.createdAt },
                stats: { actions: 0, errors: 0 }
            };
            
            // Restore to active sessions
            this.sessions.set(sessionId, recoveredSession);
            
            // Re-index
            if (!this.userSessions.has(fallbackData.userId)) {
                this.userSessions.set(fallbackData.userId, new Set());
            }
            this.userSessions.get(fallbackData.userId).add(sessionId);
            
            this.log('info', `Session ${sessionId} successfully recovered from fallback`);
            return recoveredSession;
        }
        
        return null;
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        this.log('info', 'Shutting down Session Manager...');
        
        // Clear cleanup timer
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        // Cancel all active sessions with refunds
        for (const [sessionId, session] of this.sessions) {
            if (session.state === SessionState.ACTIVE) {
                await this.cancelSession(sessionId, 'System shutdown', true);
            }
        }

        this.log('info', 'Session Manager shutdown complete');
    }
}

// Create singleton instance
const sessionManager = new UnifiedSessionManager();

// Handle process termination
process.on('SIGINT', () => sessionManager.shutdown());
process.on('SIGTERM', () => sessionManager.shutdown());

// Export the singleton
module.exports = sessionManager;

// Also export types for convenience
module.exports.SessionState = SessionState;
module.exports.GameType = GameType;
