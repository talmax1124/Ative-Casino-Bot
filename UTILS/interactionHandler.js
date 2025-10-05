/**
 * Interaction Handler Utility for ATIVE Casino Bot
 * Manages Discord interaction responses and handles timeouts gracefully
 */

const { MessageFlags } = require('discord.js');
const logger = require('./logger');

/**
 * SafeInteractionHandler - Wraps Discord interactions to handle timeouts gracefully
 */
class SafeInteractionHandler {
    /**
     * Safely reply to an interaction
     * @param {Object} interaction - Discord interaction object
     * @param {Object} options - Reply options (embeds, content, components, etc.)
     * @returns {Promise<boolean>} Success status
     */
    static async safeReply(interaction, options) {
        try {
            // Check if interaction is still valid
            if (!interaction || !interaction.isRepliable()) {
                logger.warn(`Interaction not repliable: ${interaction?.customId || 'unknown'}`);
                return false;
            }

            // Check if we've already responded
            if (interaction.replied) {
                return await this.safeFollowUp(interaction, options);
            }

            if (interaction.deferred) {
                return await this.safeEditReply(interaction, options);
            }

            // Attempt to reply
            await interaction.reply(options);
            return true;

        } catch (error) {
            // Handle known Discord API errors
            if (error.code === 10062) {
                logger.debug(`Interaction expired: ${interaction.customId || interaction.commandName}`);
                return false;
            }

            if (error.code === 40060) {
                logger.debug(`Interaction already acknowledged: ${interaction.customId || interaction.commandName}`);
                return false;
            }

            logger.error(`Failed to reply to interaction: ${error.message}`);
            return false;
        }
    }

    /**
     * Safely defer an interaction
     * @param {Object} interaction - Discord interaction object
     * @param {boolean} ephemeral - Whether response should be ephemeral
     * @returns {Promise<boolean>} Success status
     */
    static async safeDefer(interaction, ephemeral = false) {
        try {
            if (!interaction || !interaction.isRepliable()) {
                return false;
            }

            if (interaction.replied || interaction.deferred) {
                return true; // Already handled
            }

            await interaction.deferReply({ 
                ephemeral
            });
            return true;

        } catch (error) {
            if (error.code === 10062 || error.code === 40060) {
                logger.debug(`Cannot defer expired/acknowledged interaction: ${interaction.customId || interaction.commandName}`);
                return false;
            }

            logger.error(`Failed to defer interaction: ${error.message}`);
            return false;
        }
    }

    /**
     * Safely edit an interaction reply
     * @param {Object} interaction - Discord interaction object
     * @param {Object} options - Edit options
     * @returns {Promise<boolean>} Success status
     */
    static async safeEditReply(interaction, options) {
        try {
            if (!interaction) return false;

            // Make sure interaction was deferred or replied to
            if (!interaction.replied && !interaction.deferred) {
                return await this.safeReply(interaction, options);
            }

            await interaction.editReply(options);
            return true;

        } catch (error) {
            if (error.code === 10062) {
                logger.debug(`Cannot edit expired interaction: ${interaction.customId || interaction.commandName}`);
                return false;
            }

            if (error.code === 10008) {
                logger.debug(`Message not found for interaction: ${interaction.customId || interaction.commandName}`);
                return false;
            }

            logger.error(`Failed to edit interaction reply: ${error.message}`);
            return false;
        }
    }

    /**
     * Safely send a follow-up message
     * @param {Object} interaction - Discord interaction object
     * @param {Object} options - Follow-up options
     * @returns {Promise<boolean>} Success status
     */
    static async safeFollowUp(interaction, options) {
        try {
            if (!interaction) return false;

            // Make sure interaction was already replied to
            if (!interaction.replied && !interaction.deferred) {
                return await this.safeReply(interaction, options);
            }

            {
                const payload = { ...options };
                // Normalize deprecated flags to ephemeral boolean
                if ('flags' in payload) {
                    try {
                        const { MessageFlags } = require('discord.js');
                        if (payload.flags === MessageFlags.Ephemeral) {
                            payload.ephemeral = true;
                        }
                    } catch (_) {}
                    delete payload.flags;
                }
                await interaction.followUp(payload);
            }
            return true;

        } catch (error) {
            if (error.code === 10062) {
                logger.debug(`Cannot follow up on expired interaction: ${interaction.customId || interaction.commandName}`);
                return false;
            }

            logger.error(`Failed to send follow-up: ${error.message}`);
            return false;
        }
    }

    /**
     * Safely update a message component
     * @param {Object} interaction - Discord button/select interaction
     * @param {Object} options - Update options
     * @returns {Promise<boolean>} Success status
     */
    static async safeUpdate(interaction, options) {
        try {
            if (!interaction || !interaction.isMessageComponent()) {
                return false;
            }

            if (interaction.replied || interaction.deferred) {
                return await this.safeEditReply(interaction, options);
            }

            await interaction.update(options);
            return true;

        } catch (error) {
            if (error.code === 10062) {
                logger.debug(`Cannot update expired component: ${interaction.customId}`);
                return false;
            }

            logger.error(`Failed to update component: ${error.message}`);
            return false;
        }
    }

    /**
     * Safely show a modal
     * @param {Object} interaction - Discord interaction object
     * @param {Object} modal - Modal to show
     * @returns {Promise<boolean>} Success status
     */
    static async safeShowModal(interaction, modal) {
        try {
            if (!interaction || interaction.replied || interaction.deferred) {
                logger.warn('Cannot show modal on replied/deferred interaction');
                return false;
            }

            await interaction.showModal(modal);
            return true;

        } catch (error) {
            if (error.code === 10062) {
                logger.debug(`Cannot show modal on expired interaction: ${interaction.customId || interaction.commandName}`);
                return false;
            }

            logger.error(`Failed to show modal: ${error.message}`);
            return false;
        }
    }

    /**
     * Check if interaction is still valid
     * @param {Object} interaction - Discord interaction object
     * @returns {boolean} Whether interaction is valid
     */
    static isValid(interaction) {
        if (!interaction) return false;

        // Check if interaction has expired (3 second timeout)
        const age = Date.now() - interaction.createdTimestamp;
        if (age > 2900) { // Leave 100ms buffer
            logger.debug(`Interaction expired (${age}ms old): ${interaction.customId || interaction.commandName}`);
            return false;
        }

        return true;
    }

    /**
     * Wrap an async handler with error handling
     * @param {Function} handler - Async function to wrap
     * @param {string} context - Context for logging
     * @returns {Function} Wrapped handler
     */
    static wrapHandler(handler, context) {
        return async (interaction, ...args) => {
            try {
                // Check if interaction is still valid
                if (!this.isValid(interaction)) {
                    logger.debug(`Skipping expired interaction in ${context}`);
                    return;
                }

                await handler(interaction, ...args);

            } catch (error) {
                if (error.code === 10062) {
                    logger.debug(`Interaction expired during ${context}: ${interaction.customId || interaction.commandName}`);
                    return;
                }

                logger.error(`Error in ${context}: ${error.message}`);
                
                // Try to send error message if possible
                await this.safeReply(interaction, {
                    content: '❌ An error occurred while processing your request.',
                    ephemeral: true
                });
            }
        };
    }

    /**
     * Create a deferred handler for long-running operations
     * @param {Function} handler - Async function to execute
     * @param {Object} options - Options for deferring
     * @returns {Function} Wrapped deferred handler
     */
    static createDeferredHandler(handler, options = {}) {
        return async (interaction, ...args) => {
            try {
                // Defer immediately
                const deferred = await this.safeDefer(interaction, options.ephemeral);
                if (!deferred) {
                    logger.debug('Could not defer interaction, likely expired');
                    return;
                }

                // Execute handler
                const result = await handler(interaction, ...args);

                // If handler returns content, edit the reply
                if (result) {
                    await this.safeEditReply(interaction, result);
                }

            } catch (error) {
                logger.error(`Error in deferred handler: ${error.message}`);
                
                await this.safeEditReply(interaction, {
                    content: '❌ An error occurred while processing your request.',
                    embeds: [],
                    components: [],
                    ephemeral: true
                });
            }
        };
    }
}

module.exports = SafeInteractionHandler;
