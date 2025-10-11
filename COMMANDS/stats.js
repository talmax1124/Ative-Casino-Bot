/**
 * Consolidated Stats command for ATIVE Casino Bot
 * Combines profile, userhistory, robstats, and leaderboard functionality
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage } = require('../UTILS/common');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const logger = require('../UTILS/logger');

// Import original command modules for their logic
const profileCommand = require('./profile');
const userhistoryCommand = require('./userhistory');
const robstatsCommand = require('./robstats');
const leaderboardCommand = require('./leaderboard');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('📊 View statistics and user information')
        .addSubcommand(subcommand =>
            subcommand
                .setName('profile')
                .setDescription('👤 View your or another user\'s profile')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to view profile for (optional)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('history')
                .setDescription('📜 View your game history and statistics')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to view history for (optional)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('rob')
                .setDescription('🔫 View robbery statistics')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to view rob stats for (optional)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('🏆 View server leaderboards')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of leaderboard to display')
                        .addChoices(
                            { name: 'Balance - Top balances', value: 'balance' },
                            { name: 'Wins - Most wins', value: 'wins' },
                            { name: 'Games - Most games played', value: 'games' },
                            { name: 'Profit - Highest profit', value: 'profit' }
                        )
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            // Route to appropriate subcommand handler
            switch (subcommand) {
                case 'profile':
                    return await profileCommand.execute(interaction);
                case 'history':
                    return await userhistoryCommand.execute(interaction);
                case 'rob':
                    return await robstatsCommand.execute(interaction);
                case 'leaderboard':
                    return await leaderboardCommand.execute(interaction);
                default:
                    return await interaction.reply({
                        content: '❌ Unknown subcommand.',
                        flags: 64
                    });
            }
        } catch (error) {
            logger.error('Error in stats command:', error);
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An error occurred while processing your request.',
                    flags: 64
                });
            } else if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ An error occurred while processing your request.'
                });
            }
        }
    }
};