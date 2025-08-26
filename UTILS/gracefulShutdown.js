/**
 * Graceful Shutdown Manager for ATIVE Casino Bot
 * Ensures all active games complete before allowing shutdown/restart
 */

const { getAllActiveGames } = require('./common');
const { sessionManager } = require('./sessionManager');
const logger = require('./logger');

class GracefulShutdownManager {
    constructor() {
        this.isShuttingDown = false;
        this.shutdownCallbacks = [];
        this.maxWaitTime = 300000; // 5 minutes maximum wait
        this.checkInterval = 5000; // Check every 5 seconds
    }

    /**
     * Check if there are any active games across all systems
     */
    async getActiveGamesSummary() {
        const summary = {
            legacyGames: [],
            sessionGames: [],
            totalCount: 0
        };

        try {
            // Get legacy active games
            const legacyGames = getAllActiveGames();
            summary.legacyGames = legacyGames;

            // Get session manager games
            const sessionStats = sessionManager.getSessionStats();
            const activeSessions = sessionManager.getAllActiveSessions();
            
            for (const session of activeSessions) {
                summary.sessionGames.push({
                    userId: session.userId,
                    gameType: session.gameType,
                    guildId: session.guildId,
                    sessionId: session.sessionId,
                    duration: Date.now() - session.createdAt
                });
            }

            summary.totalCount = summary.legacyGames.length + summary.sessionGames.length;

            return summary;
        } catch (error) {
            logger.error(`Error getting active games summary: ${error.message}`);
            return summary;
        }
    }

    /**
     * Initiate graceful shutdown process
     */
    async initiateGracefulShutdown(reason = 'Manual shutdown', maxWaitMinutes = 5) {
        if (this.isShuttingDown) {
            return {
                success: false,
                message: 'Shutdown already in progress',
                activeGames: await this.getActiveGamesSummary()
            };
        }

        this.isShuttingDown = true;
        this.maxWaitTime = maxWaitMinutes * 60 * 1000;
        
        logger.info(`Graceful shutdown initiated: ${reason}`);
        
        const startTime = Date.now();
        let activeGames = await this.getActiveGamesSummary();

        // If no active games, shutdown immediately
        if (activeGames.totalCount === 0) {
            logger.info('No active games found, proceeding with immediate shutdown');
            return {
                success: true,
                message: 'No active games - shutdown ready',
                activeGames,
                waitTime: 0
            };
        }

        // Wait for games to complete
        logger.info(`Found ${activeGames.totalCount} active games, waiting for completion...`);
        
        return new Promise((resolve) => {
            const checkInterval = setInterval(async () => {
                const elapsed = Date.now() - startTime;
                activeGames = await this.getActiveGamesSummary();

                // Check if all games are done
                if (activeGames.totalCount === 0) {
                    clearInterval(checkInterval);
                    logger.info(`All games completed. Shutdown ready after ${Math.round(elapsed/1000)}s`);
                    resolve({
                        success: true,
                        message: 'All games completed - shutdown ready',
                        activeGames,
                        waitTime: elapsed
                    });
                    return;
                }

                // Check if max wait time exceeded
                if (elapsed >= this.maxWaitTime) {
                    clearInterval(checkInterval);
                    logger.warn(`Max wait time exceeded. Forcing shutdown with ${activeGames.totalCount} active games`);
                    resolve({
                        success: true,
                        message: `Max wait time (${maxWaitMinutes}min) exceeded - forcing shutdown`,
                        activeGames,
                        waitTime: elapsed,
                        forced: true
                    });
                    return;
                }

                // Log progress every 30 seconds
                if (elapsed % 30000 === 0) {
                    logger.info(`Waiting for ${activeGames.totalCount} active games... (${Math.round(elapsed/1000)}s elapsed)`);
                }
            }, this.checkInterval);
        });
    }

    /**
     * Cancel graceful shutdown
     */
    cancelShutdown() {
        if (this.isShuttingDown) {
            this.isShuttingDown = false;
            logger.info('Graceful shutdown cancelled');
            return true;
        }
        return false;
    }

    /**
     * Check if shutdown is in progress
     */
    isShutdownInProgress() {
        return this.isShuttingDown;
    }

    /**
     * Get formatted status message
     */
    async getStatusMessage() {
        const activeGames = await this.getActiveGamesSummary();
        
        if (activeGames.totalCount === 0) {
            return 'ℹ️ **Status**: No active games - Ready for shutdown/restart';
        }

        let message = `⚠️ **Active Games Found**: ${activeGames.totalCount} total\n\n`;

        if (activeGames.legacyGames.length > 0) {
            message += `**Legacy Games (${activeGames.legacyGames.length}):**\n`;
            for (const game of activeGames.legacyGames) {
                message += `• ${game.gameType} - <@${game.userId}>\n`;
            }
            message += '\n';
        }

        if (activeGames.sessionGames.length > 0) {
            message += `**Session Games (${activeGames.sessionGames.length}):**\n`;
            for (const game of activeGames.sessionGames) {
                const duration = Math.round((Date.now() - game.createdAt) / 1000);
                message += `• ${game.gameType} - <@${game.userId}> (${duration}s)\n`;
            }
        }

        if (this.isShuttingDown) {
            message += '\n🔄 **Graceful shutdown in progress...**';
        } else {
            message += '\n💡 *Use graceful restart to wait for games to complete*';
        }

        return message;
    }

    /**
     * Add callback to run during shutdown
     */
    addShutdownCallback(callback) {
        this.shutdownCallbacks.push(callback);
    }

    /**
     * Execute all shutdown callbacks
     */
    async executeShutdownCallbacks() {
        for (const callback of this.shutdownCallbacks) {
            try {
                await callback();
            } catch (error) {
                logger.error(`Error executing shutdown callback: ${error.message}`);
            }
        }
    }
}

// Export singleton instance
module.exports = new GracefulShutdownManager();