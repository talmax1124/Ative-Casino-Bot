/**
 * Consolidated Session command for ATIVE Casino Bot
 * Combines sessionstatus, stopgame, and stopmysession functionality
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const sessionManager = require('../UTILS/sessionManager');
const { SessionState } = sessionManager;
const dbManager = require('../UTILS/database');
const { getGuildId, fmt, getActiveGame, clearActiveGame } = require('../UTILS/common');
const logger = require('../UTILS/logger');

// Import original command modules for their logic
const sessionstatusCommand = require('./sessionstatus');
const stopgameCommand = require('./stopgame');
const stopmysessionCommand = require('./stopmysession');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('session')
        .setDescription('🎮 Manage game sessions and active games')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('🔍 Check your active game sessions and resolve issues')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Check sessions for a specific user (Admin only)')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('fix')
                        .setDescription('Attempt to fix any session issues')
                        .setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stop')
                .setDescription('⏹️ Stop active game sessions (defaults to yourself)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User whose game sessions to stop (optional)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('end')
                .setDescription('🚫 Cancel your current active game session and refund your bet (if any)')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            // Route to appropriate subcommand handler
            switch (subcommand) {
                case 'status':
                    return await sessionstatusCommand.execute(interaction);
                case 'stop':
                    return await stopgameCommand.execute(interaction);
                case 'end':
                    return await stopmysessionCommand.execute(interaction);
                default:
                    return await interaction.reply({
                        content: '❌ Unknown subcommand.',
                        flags: MessageFlags.Ephemeral
                    });
            }
        } catch (error) {
            logger.error('Error in session command:', error);
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An error occurred while processing your request.',
                    flags: MessageFlags.Ephemeral
                });
            } else if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ An error occurred while processing your request.'
                });
            }
        }
    }
};