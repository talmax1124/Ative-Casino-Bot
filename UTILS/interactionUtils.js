/**
 * Interaction utilities for safe Discord interaction handling
 * Prevents "Unknown interaction" and "Interaction has already been acknowledged" errors
 */

const logger = require('./logger');

/**
 * Safely reply to an interaction, handling various states
 * @param {import('discord.js').CommandInteraction} interaction - The Discord interaction
 * @param {Object} options - Reply options (content, embeds, components, etc.)
 * @returns {Promise<boolean>} - Success status
 */
async function safeReply(interaction, options) {
    try {
        // Check if interaction is expired (15 minutes)
        const now = Date.now();
        const interactionTime = interaction.createdTimestamp;
        const timeElapsed = now - interactionTime;
        
        if (timeElapsed > 14 * 60 * 1000) { // 14 minutes to be safe
            logger.warn(`Interaction ${interaction.id} has expired (${Math.round(timeElapsed / 1000)}s old)`);
            return false;
        }

        // If not replied and not deferred, reply normally
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply(options);
            return true;
        }

        // If deferred but not replied, edit reply
        if (interaction.deferred && !interaction.replied) {
            await interaction.editReply(options);
            return true;
        }

        // If already replied, send follow-up
        if (interaction.replied) {
            await interaction.followUp(options);
            return true;
        }

        logger.warn(`Interaction ${interaction.id} in unknown state - replied: ${interaction.replied}, deferred: ${interaction.deferred}`);
        return false;

    } catch (error) {
        if (error.code === 10062) {
            logger.warn(`Unknown interaction ${interaction.id} - interaction expired or invalid`);
        } else if (error.code === 40060) {
            logger.warn(`Interaction ${interaction.id} already acknowledged`);
        } else {
            logger.error(`Error replying to interaction ${interaction.id}: ${error.message}`);
        }
        return false;
    }
}

/**
 * Safely defer an interaction
 * @param {import('discord.js').CommandInteraction} interaction - The Discord interaction
 * @param {Object} options - Defer options (ephemeral, etc.)
 * @returns {Promise<boolean>} - Success status
 */
async function safeDefer(interaction, options = {}) {
    try {
        // Check if already deferred or replied
        if (interaction.deferred || interaction.replied) {
            logger.warn(`Interaction ${interaction.id} already deferred/replied`);
            return false;
        }

        // Check if interaction is expired
        const now = Date.now();
        const interactionTime = interaction.createdTimestamp;
        const timeElapsed = now - interactionTime;
        
        if (timeElapsed > 2000) { // If more than 2 seconds old, might be risky
            logger.warn(`Interaction ${interaction.id} is ${Math.round(timeElapsed / 1000)}s old, deferring anyway`);
        }

        await interaction.deferReply(options);
        return true;

    } catch (error) {
        if (error.code === 10062) {
            logger.warn(`Unknown interaction ${interaction.id} - cannot defer expired interaction`);
        } else if (error.code === 40060) {
            logger.warn(`Interaction ${interaction.id} already acknowledged - cannot defer`);
        } else {
            logger.error(`Error deferring interaction ${interaction.id}: ${error.message}`);
        }
        return false;
    }
}

/**
 * Safely update an interaction (for components like buttons)
 * @param {import('discord.js').ButtonInteraction} interaction - The Discord interaction
 * @param {Object} options - Update options
 * @returns {Promise<boolean>} - Success status
 */
async function safeUpdate(interaction, options) {
    try {
        // Check if interaction is expired
        const now = Date.now();
        const interactionTime = interaction.createdTimestamp;
        const timeElapsed = now - interactionTime;
        
        if (timeElapsed > 14 * 60 * 1000) { // 14 minutes to be safe
            logger.warn(`Interaction ${interaction.id} has expired (${Math.round(timeElapsed / 1000)}s old)`);
            return false;
        }

        // For button/component interactions, use update
        if (interaction.isButton() || interaction.isSelectMenu() || interaction.isModalSubmit()) {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.update(options);
                return true;
            }
        }

        // Fallback to safe reply
        return await safeReply(interaction, options);

    } catch (error) {
        if (error.code === 10062) {
            logger.warn(`Unknown interaction ${interaction.id} - interaction expired or invalid`);
        } else if (error.code === 40060) {
            logger.warn(`Interaction ${interaction.id} already acknowledged`);
        } else {
            logger.error(`Error updating interaction ${interaction.id}: ${error.message}`);
        }
        return false;
    }
}

/**
 * Get interaction state info for debugging
 * @param {import('discord.js').Interaction} interaction - The Discord interaction
 * @returns {Object} - State information
 */
function getInteractionState(interaction) {
    const now = Date.now();
    const age = now - interaction.createdTimestamp;
    
    return {
        id: interaction.id,
        type: interaction.type,
        commandName: interaction.commandName || 'unknown',
        customId: interaction.customId || 'none',
        replied: interaction.replied,
        deferred: interaction.deferred,
        ageMs: age,
        ageSeconds: Math.round(age / 1000),
        expired: age > 14 * 60 * 1000
    };
}

/**
 * Create error embed for failed interactions
 * @param {string} title - Error title
 * @param {string} description - Error description
 * @returns {Object} - Error embed
 */
function createErrorEmbed(title = '❌ Command Error', description = 'An error occurred while processing your command.') {
    return {
        title,
        description,
        color: 0xFF0000,
        timestamp: new Date().toISOString()
    };
}

module.exports = {
    safeReply,
    safeDefer,
    safeUpdate,
    getInteractionState,
    createErrorEmbed
};