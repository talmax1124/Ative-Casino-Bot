/**
 * Maintenance Guard - Utility to check if games should be blocked due to maintenance
 */

const { EmbedBuilder } = require('discord.js');
const maintenanceManager = require('./maintenanceManager');
const logger = require('./logger');

class MaintenanceGuard {
    /**
     * Check if maintenance mode is active and return appropriate response
     * @param {string} guildId - Guild ID
     * @param {string} gameType - Type of game being attempted
     * @returns {Object} { allowed: boolean, embed: EmbedBuilder | null }
     */
    async check(guildId, gameType = 'game') {
        try {
            const isMaintenanceMode = await maintenanceManager.isMaintenanceMode(guildId);
            
            if (isMaintenanceMode) {
                const embed = new EmbedBuilder()
                    .setTitle('🔧 Casino Under Maintenance')
                    .setDescription(
                        '**All casino games are temporarily disabled**\n\n' +
                        '🔴 **Reason:** System maintenance in progress\n' +
                        '⏱️ **Expected Duration:** Updates typically complete within 15-30 minutes\n' +
                        '🔄 **Status:** Games will automatically resume when maintenance ends\n\n' +
                        '💡 **What you can do:**\n' +
                        '• Check your balance: `/balance`\n' +
                        '• View your profile: `/profile`\n' +
                        '• Check leaderboards: `/leaderboard`\n' +
                        '• Try again in a few minutes\n\n' +
                        '🎰 Thank you for your patience!'
                    )
                    .setColor(0xFF6B35)
                    .setThumbnail('🔧')
                    .setFooter({ 
                        text: 'Games will resume automatically when maintenance is complete',
                        iconURL: null
                    })
                    .setTimestamp();

                logger.debug(`Game blocked due to maintenance: ${gameType} in guild ${guildId}`);
                
                return {
                    allowed: false,
                    embed: embed
                };
            }

            return {
                allowed: true,
                embed: null
            };
        } catch (error) {
            // Provide more detailed error logging
            logger.error(`Maintenance guard error: ${error.message}`);
            logger.error(`Error stack: ${error.stack}`);
            logger.error(`Guild ID: ${guildId}, Game Type: ${gameType}`);
            
            // Check if it's a database connection issue
            if (error.message.includes('Database not initialized') || 
                error.message.includes('pool is null') ||
                error.message.includes('Connection') ||
                error.message.includes('ECONNREFUSED') ||
                error.message.includes('Received one or more errors')) {
                logger.warn(`Database connection issue in maintenance guard - allowing games to proceed`);
            }
            
            // If there's an error checking maintenance status, allow the game to proceed
            // This prevents maintenance system issues from breaking all games
            return {
                allowed: true,
                embed: null
            };
        }
    }

    /**
     * Quick check - just returns boolean without embed
     * @param {string} guildId - Guild ID
     * @returns {boolean} True if games are allowed
     */
    async isAllowed(guildId) {
        try {
            const isMaintenanceMode = await maintenanceManager.isMaintenanceMode(guildId);
            return !isMaintenanceMode;
        } catch (error) {
            // Provide more detailed error logging
            logger.error(`Maintenance guard quick check error: ${error.message}`);
            logger.error(`Error stack: ${error.stack}`);
            logger.error(`Guild ID: ${guildId}`);
            
            // Check if it's a database connection issue
            if (error.message.includes('Database not initialized') || 
                error.message.includes('pool is null') ||
                error.message.includes('Connection') ||
                error.message.includes('ECONNREFUSED') ||
                error.message.includes('Received one or more errors')) {
                logger.warn(`Database connection issue in maintenance guard quick check - allowing games to proceed`);
            }
            
            return true; // Default to allowing games if error occurs
        }
    }
}

// Export singleton instance
module.exports = new MaintenanceGuard();