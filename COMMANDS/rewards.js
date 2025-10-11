/**
 * Consolidated Rewards command for ATIVE Casino Bot
 * Combines dailytask, weekly, monthly, and vote functionality
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage, calculateBoosterBonus } = require('../UTILS/common');
const { secureRandomChoice, secureRandomInt } = require('../UTILS/rng');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const { PayoutManager, GameResult } = require('../UTILS/gameUtils');
const sessionManager = require('../UTILS/sessionManager');
const tuningManager = require('../UTILS/tuningManager');
const shopManager = require('../UTILS/shopManager');
const logger = require('../UTILS/logger');

// Import original command modules for their logic
const dailytaskCommand = require('./dailytask');
const weeklyCommand = require('./weekly');
const monthlyCommand = require('./monthly');
const voteCommand = require('./vote');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rewards')
        .setDescription('⏰ Claim time-based rewards and manage voting')
        .addSubcommand(subcommand =>
            subcommand
                .setName('daily')
                .setDescription('📅 Complete a daily task to earn money (25K-75K every 24 hours)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('weekly')
                .setDescription('📅 Claim weekly reward (every 7 days)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('monthly')
                .setDescription('📅 Claim monthly reward (every 30 days)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('vote')
                .setDescription('🗳️ Vote for the bot and claim rewards')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Vote action to perform')
                        .addChoices(
                            { name: 'Status - Check voting status', value: 'status' },
                            { name: 'Info - Voting information', value: 'info' },
                            { name: 'Leaderboard - Top voters', value: 'leaderboard' },
                            { name: 'Reminder - Set vote reminder', value: 'reminder' }
                        )
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            // Route to appropriate subcommand handler
            switch (subcommand) {
                case 'daily':
                    return await dailytaskCommand.execute(interaction);
                case 'weekly':
                    return await weeklyCommand.execute(interaction);
                case 'monthly':
                    return await monthlyCommand.execute(interaction);
                case 'vote':
                    return await voteCommand.execute(interaction);
                default:
                    return await interaction.reply({
                        content: '❌ Unknown subcommand.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            logger.error('Error in rewards command:', error);
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An error occurred while processing your request.',
                    ephemeral: true
                });
            } else if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ An error occurred while processing your request.'
                });
            }
        }
    }
};