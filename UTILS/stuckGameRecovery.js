/**
 * STUCK GAME RECOVERY SYSTEM
 * Automatically detects and releases stuck game sessions
 */

const logger = require('./logger');
const sessionManager = require('./sessionManager');

class StuckGameRecovery {
    constructor() {
        this.monitoredGames = new Map(); // gameId -> { startTime, userId, guildId, gameType, warned }
        this.recoveryTimers = new Map(); // gameId -> timeoutId
        
        // Configuration
        this.WARNING_TIMEOUT = 60000; // 1 minute before warning
        this.RELEASE_TIMEOUT = 90000; // 1.5 minutes total before auto-release
        this.CHECK_INTERVAL = 30000; // Check every 30 seconds
        
        // Start monitoring
        this.startMonitoring();
    }

    /**
     * Register a game session for monitoring
     */
    registerGame(gameId, userId, guildId, gameType, interaction = null) {
        if (this.monitoredGames.has(gameId)) {
            return; // Already monitoring
        }

        const gameData = {
            startTime: Date.now(),
            userId,
            guildId,
            gameType,
            interaction,
            warned: false,
            lastActivity: Date.now()
        };

        this.monitoredGames.set(gameId, gameData);
        
        // Set up warning timer
        const warningTimer = setTimeout(() => {
            this.sendWarning(gameId);
        }, this.WARNING_TIMEOUT);

        // Set up release timer
        const releaseTimer = setTimeout(() => {
            this.autoReleaseGame(gameId);
        }, this.RELEASE_TIMEOUT);

        this.recoveryTimers.set(gameId, { warningTimer, releaseTimer });

        logger.info(`[RECOVERY] Registered ${gameType} game ${gameId} for user ${userId}`);
    }

    /**
     * Update activity timestamp for a game
     */
    updateActivity(gameId) {
        const game = this.monitoredGames.get(gameId);
        if (game) {
            game.lastActivity = Date.now();
            
            // Reset timers
            this.resetTimers(gameId);
        }
    }

    /**
     * Reset timers for a game after activity
     */
    resetTimers(gameId) {
        const timers = this.recoveryTimers.get(gameId);
        if (timers) {
            clearTimeout(timers.warningTimer);
            clearTimeout(timers.releaseTimer);
            
            // Set new timers
            const warningTimer = setTimeout(() => {
                this.sendWarning(gameId);
            }, this.WARNING_TIMEOUT);

            const releaseTimer = setTimeout(() => {
                this.autoReleaseGame(gameId);
            }, this.RELEASE_TIMEOUT);

            this.recoveryTimers.set(gameId, { warningTimer, releaseTimer });
        }
    }

    /**
     * Send warning message to user
     */
    async sendWarning(gameId) {
        const game = this.monitoredGames.get(gameId);
        if (!game || game.warned) return;

        game.warned = true;

        try {
            if (game.interaction && !game.interaction.replied && !game.interaction.deferred) {
                await game.interaction.deferUpdate().catch(() => {});
            }

            if (game.interaction) {
                await game.interaction.followUp({
                    content: `⚠️ **Session Timeout Warning**\n` +
                            `Your ${game.gameType} game appears to be stuck.\n` +
                            `The session will be automatically released in 30 seconds.\n` +
                            `If you're still playing, please make a move to continue.`,
                    ephemeral: true
                }).catch(err => {
                    logger.warn(`[RECOVERY] Could not send warning for game ${gameId}: ${err.message}`);
                });
            }
        } catch (error) {
            logger.warn(`[RECOVERY] Warning failed for game ${gameId}: ${error.message}`);
        }

        logger.info(`[RECOVERY] Warning sent for stuck ${game.gameType} game ${gameId}`);
    }

    /**
     * Automatically release a stuck game
     */
    async autoReleaseGame(gameId) {
        const game = this.monitoredGames.get(gameId);
        if (!game) return;

        try {
            // Release the session
            const sessionReleased = await sessionManager.forceEndSession(gameId, 'TIMEOUT');
            
            // Send release notification
            if (game.interaction) {
                const releaseMessage = {
                    content: `🔓 **Session Released**\n` +
                            `Your ${game.gameType} game session has been released due to inactivity.\n` +
                            `Your balance has been restored. You can start a new game anytime!`,
                    components: [],
                    embeds: []
                };

                try {
                    if (game.interaction.replied || game.interaction.deferred) {
                        await game.interaction.editReply(releaseMessage);
                    } else {
                        await game.interaction.followUp({...releaseMessage, ephemeral: false});
                    }
                } catch (msgError) {
                    logger.warn(`[RECOVERY] Could not send release message: ${msgError.message}`);
                }
            }

            logger.info(`[RECOVERY] Auto-released stuck ${game.gameType} game ${gameId} for user ${game.userId}`);
            
            // Log to security for monitoring
            const securityLogger = require('./securityLogger');
            securityLogger.logSecurityEvent(game.userId, 'STUCK_GAME_RECOVERY', {
                gameType: game.gameType,
                gameId: gameId,
                sessionDuration: Date.now() - game.startTime,
                action: 'AUTO_RELEASED'
            });

            // Clean up
            this.unregisterGame(gameId);

        } catch (error) {
            logger.error(`[RECOVERY] Failed to auto-release game ${gameId}: ${error.message}`);
        }
    }

    /**
     * Unregister a game (normal completion)
     */
    unregisterGame(gameId) {
        const timers = this.recoveryTimers.get(gameId);
        if (timers) {
            clearTimeout(timers.warningTimer);
            clearTimeout(timers.releaseTimer);
            this.recoveryTimers.delete(gameId);
        }
        
        this.monitoredGames.delete(gameId);
        logger.debug(`[RECOVERY] Unregistered game ${gameId}`);
    }

    /**
     * Start periodic monitoring of all games
     */
    startMonitoring() {
        setInterval(() => {
            this.checkAllGames();
        }, this.CHECK_INTERVAL);
        
        logger.info('[RECOVERY] Stuck game recovery system initialized');
    }

    /**
     * Check all monitored games for issues
     */
    checkAllGames() {
        const now = Date.now();
        
        for (const [gameId, game] of this.monitoredGames) {
            const timeSinceStart = now - game.startTime;
            const timeSinceActivity = now - game.lastActivity;
            
            // Log long-running games
            if (timeSinceStart > 300000) { // 5 minutes
                logger.warn(`[RECOVERY] Long-running ${game.gameType} game ${gameId}: ${Math.round(timeSinceStart/60000)} minutes`);
            }
            
            // Force release if way too long
            if (timeSinceStart > 600000) { // 10 minutes
                logger.error(`[RECOVERY] Force releasing extremely stuck ${game.gameType} game ${gameId}`);
                this.autoReleaseGame(gameId);
            }
        }
    }

    /**
     * Get recovery statistics
     */
    getStats() {
        return {
            monitoredGames: this.monitoredGames.size,
            games: Array.from(this.monitoredGames.entries()).map(([id, game]) => ({
                id,
                gameType: game.gameType,
                userId: game.userId,
                duration: Date.now() - game.startTime,
                warned: game.warned
            }))
        };
    }

    /**
     * Manual force release (admin command)
     */
    async forceRelease(gameId) {
        const game = this.monitoredGames.get(gameId);
        if (!game) {
            return { success: false, message: 'Game not found' };
        }

        await this.autoReleaseGame(gameId);
        return { success: true, message: `Force released ${game.gameType} game for user ${game.userId}` };
    }
}

// Create singleton instance
const stuckGameRecovery = new StuckGameRecovery();

module.exports = stuckGameRecovery;