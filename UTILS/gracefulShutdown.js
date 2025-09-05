/**
 * Graceful Shutdown Manager for ATIVE Casino Bot
 * Ensures all active games complete before allowing shutdown/restart
 * Includes channel notifications and support button integration
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getAllActiveGames, buildErrorEmbedWithSupport } = require('./common');
// sessionManager removed (Firebase dependency) - using mock implementation
const sessionManager = {
    getAllActiveSessions: () => [],
    endAllSessions: async () => ({ success: true }),
    getSessionStats: () => ({ active: 0, total: 0, paused: 0 }),
    getActiveSessionCount: () => 0,
    getUserSessions: (userId) => [],
    getSession: (sessionId) => null,
    cancelSession: async (sessionId, reason, source) => ({ success: true })
};
const logger = require('./logger');

class GracefulShutdownManager {
    constructor() {
        this.isShuttingDown = false;
        this.shutdownCallbacks = [];
        this.maxWaitTime = 300000; // 5 minutes maximum wait
        this.checkInterval = 5000; // Check every 5 seconds
        this.client = null; // Set when initialized
        this.activeSessionChannels = new Set(); // Track channels with active sessions
        this.notificationsSent = new Set(); // Track which channels we've notified
    }

    /**
     * Initialize with Discord client
     */
    initialize(client) {
        this.client = client;
        logger.info('Graceful Shutdown Manager initialized with Discord client');
    }

    /**
     * Check if there are any active games across all systems
     */
    async getActiveGamesSummary() {
        const summary = {
            legacyGames: [],
            sessionGames: [],
            totalCount: 0,
            channelMap: new Map() // Track games by channel for notifications
        };

        try {
            // Get legacy active games
            const legacyGames = getAllActiveGames();
            summary.legacyGames = legacyGames;

            // Add legacy games to channel map
            for (const game of legacyGames) {
                if (game.channelId && game.guildId) {
                    const key = `${game.guildId}_${game.channelId}`;
                    if (!summary.channelMap.has(key)) {
                        summary.channelMap.set(key, { guildId: game.guildId, channelId: game.channelId, games: [] });
                    }
                    summary.channelMap.get(key).games.push(game);
                }
            }

            // Get session manager games
            const sessionStats = sessionManager.getSessionStats();
            const activeSessions = sessionManager.getAllActiveSessions();
            
            for (const session of activeSessions) {
                const sessionInfo = {
                    userId: session.userId,
                    gameType: session.gameType,
                    guildId: session.guildId,
                    channelId: session.channelId,
                    sessionId: session.sessionId,
                    duration: Date.now() - session.createdAt
                };
                summary.sessionGames.push(sessionInfo);

                // Add to channel map
                if (session.channelId && session.guildId) {
                    const key = `${session.guildId}_${session.channelId}`;
                    if (!summary.channelMap.has(key)) {
                        summary.channelMap.set(key, { guildId: session.guildId, channelId: session.channelId, games: [] });
                    }
                    summary.channelMap.get(key).games.push(sessionInfo);
                }
            }

            summary.totalCount = summary.legacyGames.length + summary.sessionGames.length;

            return summary;
        } catch (error) {
            logger.error(`Error getting active games summary: ${error.message}`);
            return summary;
        }
    }

    /**
     * Send update notifications to channels with active sessions
     */
    async notifyActiveChannels(activeGames) {
        if (!this.client || activeGames.channelMap.size === 0) {
            return;
        }

        for (const [channelKey, channelData] of activeGames.channelMap) {
            // Skip if we already notified this channel
            if (this.notificationsSent.has(channelKey)) {
                continue;
            }

            try {
                const channel = await this.client.channels.fetch(channelData.channelId);
                if (!channel) continue;

                const gameTypes = [...new Set(channelData.games.map(g => g.gameType))];
                const playerCount = channelData.games.length;
                
                const { embed, components } = buildErrorEmbedWithSupport(
                    '🔄 Bot Update in Progress',
                    `**The bot will be updated shortly!**\n\n` +
                    `📊 **Active Sessions:** ${playerCount}\n` +
                    `🎮 **Games:** ${gameTypes.join(', ')}\n\n` +
                    `⏱️ **Update Time:** ~2 minutes\n` +
                    `🔄 **Status:** Waiting for games to finish\n\n` +
                    `💡 **What happens next:**\n` +
                    `• Your games will continue normally\n` +
                    `• Bot will restart after games complete\n` +
                    `• All progress is automatically saved\n\n` +
                    `❓ **Questions?** Click the support button below!`,
                    channelData.guildId
                );

                await channel.send({ embeds: [embed], components });
                this.notificationsSent.add(channelKey);
                this.activeSessionChannels.add(channelKey);

                logger.info(`Notified channel ${channelData.channelId} about pending update (${playerCount} active sessions)`);

            } catch (error) {
                logger.error(`Failed to notify channel ${channelData.channelId}: ${error.message}`);
            }
        }
    }

    /**
     * Send update completion notification
     */
    async notifyUpdateComplete() {
        if (!this.client) return;

        for (const channelKey of this.activeSessionChannels) {
            const [guildId, channelId] = channelKey.split('_');
            
            try {
                const channel = await this.client.channels.fetch(channelId);
                if (!channel) continue;

                const embed = new EmbedBuilder()
                    .setTitle('✅ Bot Update Complete!')
                    .setDescription(
                        `**The bot has been successfully updated!**\n\n` +
                        `🚀 **Status:** Online and ready\n` +
                        `🎮 **Games:** All systems operational\n` +
                        `💰 **Economy:** Fully functional\n\n` +
                        `Thank you for your patience! 🎰`
                    )
                    .setColor(0x00FF00)
                    .setTimestamp();

                await channel.send({ embeds: [embed] });
                logger.info(`Notified channel ${channelId} about completed update`);

            } catch (error) {
                logger.error(`Failed to notify channel ${channelId} about completion: ${error.message}`);
            }
        }

        // Clear tracking
        this.activeSessionChannels.clear();
        this.notificationsSent.clear();
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

        // Notify channels about pending update
        logger.info(`Found ${activeGames.totalCount} active games, notifying channels and waiting for completion...`);
        await this.notifyActiveChannels(activeGames);
        
        return new Promise((resolve) => {
            const checkInterval = setInterval(async () => {
                const elapsed = Date.now() - startTime;
                activeGames = await this.getActiveGamesSummary();

                // Check if all games are done
                if (activeGames.totalCount === 0) {
                    clearInterval(checkInterval);
                    logger.info(`All games completed. Shutdown ready after ${Math.round(elapsed/1000)}s`);
                    
                    // Send completion notifications
                    await this.notifyUpdateComplete();
                    
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