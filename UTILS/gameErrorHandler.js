/**
 * COMPREHENSIVE GAME ERROR HANDLER
 * Ensures all game commands have proper error handling, cleanup, and refunds
 * 
 * CRITICAL: Prevents money loss from failed transactions and ensures user funds are safe
 */

const logger = require('./logger');
const { sendLogMessage } = require('./common');
const sessionManager = require('./sessionManager');
const dbManager = require('./database');
const { EmbedBuilder, MessageFlags } = require('discord.js');

class GameErrorHandler {
    constructor() {
        this.errorStats = new Map();
        this.refundQueue = new Set();
    }

    /**
     * Wrap game command execution with comprehensive error handling
     */
    async wrapGameCommand(gameCommand, interaction, options = {}) {
        const {
            gameType = 'unknown',
            betAmount = 0,
            requiresRefund = true,
            sessionId = null
        } = options;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const commandName = interaction.commandName;

        try {
            // Execute the game command
            const result = await gameCommand(interaction);
            
            // Log successful execution
            this.logSuccess(userId, commandName, gameType);
            
            return result;
            
        } catch (error) {
            logger.error(`Game command error in ${commandName} for user ${userId}: ${error.message}`);
            
            // Record error statistics
            this.recordError(userId, commandName, gameType, error);
            
            // Handle cleanup and refunds
            await this.handleGameError(interaction, {
                error,
                gameType,
                betAmount,
                requiresRefund,
                sessionId
            });
            
            // Send error response to user
            await this.sendErrorResponse(interaction, error, gameType);
            
            throw error; // Re-throw for calling code to handle
        }
    }

    /**
     * Handle game error with proper cleanup and refunds
     */
    async handleGameError(interaction, errorData) {
        const { error, gameType, betAmount, requiresRefund, sessionId } = errorData;
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        try {
            // 1. Session cleanup
            await this.cleanupSession(userId, sessionId);
            
            // 2. Process refund if needed
            if (requiresRefund && betAmount > 0) {
                await this.processRefund(userId, guildId, betAmount, gameType, error.message);
            }
            
            // 3. Send error notification to monitoring
            await this.notifyError(interaction, errorData);
            
        } catch (cleanupError) {
            logger.error(`Error cleanup failed for ${userId}: ${cleanupError.message}`);
            
            // Emergency refund queue for manual processing
            if (requiresRefund && betAmount > 0) {
                this.refundQueue.add({
                    userId,
                    guildId,
                    betAmount,
                    gameType,
                    timestamp: Date.now(),
                    reason: `Cleanup failed: ${cleanupError.message}`
                });
            }
        }
    }

    /**
     * Clean up game session
     */
    async cleanupSession(userId, sessionId) {
        try {
            // If sessionId provided, end it
            if (sessionId) {
                await sessionManager.endSession(sessionId, {
                    reason: 'error_cleanup',
                    force: true
                });
            } else {
                // Force cleanup all user sessions
                await sessionManager.forceCleanupUser(userId, null, 'Game error cleanup');
            }
            
            logger.info(`Session cleanup completed for user ${userId}`);
            
        } catch (error) {
            logger.error(`Session cleanup failed for ${userId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Process refund for failed game
     */
    async processRefund(userId, guildId, amount, gameType, reason) {
        try {
            // Add refund to user's wallet
            const success = await dbManager.updateUserBalance(
                userId,
                guildId,
                amount, // Add to wallet
                0,      // No bank change
                { 
                    game_active: false,
                    refund_reason: reason,
                    refund_timestamp: Date.now()
                }
            );

            if (success) {
                logger.info(`Refund processed: ${userId} received ${amount} for ${gameType} error`);
                
                // Record refund in audit trail
                await this.recordRefund(userId, guildId, amount, gameType, reason);
                
            } else {
                throw new Error('Database refund operation failed');
            }
            
        } catch (error) {
            logger.error(`Refund failed for ${userId}: ${error.message}`);
            
            // Add to emergency refund queue
            this.refundQueue.add({
                userId,
                guildId,
                betAmount: amount,
                gameType,
                timestamp: Date.now(),
                reason: `Refund failed: ${error.message}`
            });
            
            throw error;
        }
    }

    /**
     * Record refund in audit trail
     */
    async recordRefund(userId, guildId, amount, gameType, reason) {
        try {
            await dbManager.recordGameResult(
                userId,
                guildId,
                gameType,
                false, // Not a win
                amount, // Bet amount
                amount, // Refund amount (same as bet)
                {
                    result_type: 'REFUND',
                    refund_reason: reason,
                    refund_timestamp: Date.now()
                }
            );
        } catch (error) {
            logger.error(`Failed to record refund audit: ${error.message}`);
        }
    }

    /**
     * Send error notification to monitoring channel
     */
    async notifyError(interaction, errorData) {
        try {
            const { error, gameType, betAmount } = errorData;
            
            await sendLogMessage(
                interaction.client,
                'error',
                `Game Error - ${gameType}: ${interaction.user.tag} (${interaction.user.id}) - Bet: ${betAmount} - Error: ${error.message}`,
                interaction.user.id,
                interaction.guildId
            );
            
        } catch (logError) {
            logger.error(`Failed to send error notification: ${logError.message}`);
        }
    }

    /**
     * Send appropriate error response to user
     */
    async sendErrorResponse(interaction, error, gameType) {
        try {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Game Error')
                .setDescription('An error occurred while processing your game. Your bet has been refunded.')
                .addFields([
                    { name: 'Game', value: gameType, inline: true },
                    { name: 'Status', value: '💰 Refund Processed', inline: true },
                    { name: 'Support', value: 'Contact support if issues persist', inline: false }
                ])
                .setColor(0xFF0000)
                .setTimestamp();

            // Send error response
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    embeds: [errorEmbed], 
                    ephemeral: true 
                });
            } else if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.followUp({ 
                    embeds: [errorEmbed], 
                    ephemeral: true 
                });
            }
            
        } catch (replyError) {
            logger.error(`Failed to send error response: ${replyError.message}`);
        }
    }

    /**
     * Record error statistics
     */
    recordError(userId, commandName, gameType, error) {
        const errorKey = `${commandName}_${gameType}`;
        
        if (!this.errorStats.has(errorKey)) {
            this.errorStats.set(errorKey, {
                count: 0,
                users: new Set(),
                lastError: null,
                firstOccurrence: Date.now()
            });
        }
        
        const stats = this.errorStats.get(errorKey);
        stats.count++;
        stats.users.add(userId);
        stats.lastError = {
            message: error.message,
            stack: error.stack,
            timestamp: Date.now(),
            userId
        };
    }

    /**
     * Log successful game execution
     */
    logSuccess(userId, commandName, gameType) {
        logger.debug(`Game success: ${commandName} (${gameType}) by ${userId}`);
    }

    /**
     * Get error statistics for monitoring
     */
    getErrorStats() {
        const stats = {};
        
        for (const [errorKey, data] of this.errorStats.entries()) {
            stats[errorKey] = {
                count: data.count,
                uniqueUsers: data.users.size,
                lastError: data.lastError ? {
                    message: data.lastError.message,
                    timestamp: data.lastError.timestamp
                } : null,
                firstOccurrence: data.firstOccurrence
            };
        }
        
        return {
            errorBreakdown: stats,
            pendingRefunds: Array.from(this.refundQueue),
            totalErrors: Array.from(this.errorStats.values()).reduce((sum, stat) => sum + stat.count, 0)
        };
    }

    /**
     * Process pending refunds (for manual review)
     */
    async processPendingRefunds() {
        logger.info(`Processing ${this.refundQueue.size} pending refunds...`);
        
        const processed = [];
        const failed = [];
        
        for (const refund of this.refundQueue) {
            try {
                await this.processRefund(
                    refund.userId, 
                    refund.guildId, 
                    refund.betAmount, 
                    refund.gameType, 
                    refund.reason
                );
                
                processed.push(refund);
                this.refundQueue.delete(refund);
                
            } catch (error) {
                logger.error(`Failed to process pending refund for ${refund.userId}: ${error.message}`);
                failed.push({ ...refund, error: error.message });
            }
        }
        
        logger.info(`Processed ${processed.length} refunds, ${failed.length} failed`);
        
        return { processed, failed };
    }

    /**
     * Clear old error statistics
     */
    clearOldStats(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
        const cutoff = Date.now() - maxAge;
        
        for (const [key, data] of this.errorStats.entries()) {
            if (data.firstOccurrence < cutoff) {
                this.errorStats.delete(key);
            }
        }
    }
}

// Export singleton instance
module.exports = new GameErrorHandler();