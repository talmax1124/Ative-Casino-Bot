/**
 * Consolidated Earn command for ATIVE Casino Bot
 * Combines beg, crime, work, and earnmoney functionality
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage, calculateBoosterBonus, resolveAmount } = require('../UTILS/common');
const { secureRandomChoice, secureRandomInt } = require('../UTILS/rng');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const { PayoutManager, GameResult } = require('../UTILS/gameUtils');
const sessionManager = require('../UTILS/sessionManager');
const tuningManager = require('../UTILS/tuningManager');
const shopManager = require('../UTILS/shopManager');
const logger = require('../UTILS/logger');

// Import original command modules for their logic
const begCommand = require('./beg');
const crimeCommand = require('./crime');
const workCommand = require('./work');
const earnmoneyCommand = require('./earnmoney');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('earn')
        .setDescription('💼 Earn money through various activities')
        .addSubcommand(subcommand =>
            subcommand
                .setName('beg')
                .setDescription('🤲 Beg for coins (5K-50K every hour)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('crime')
                .setDescription('🚨 Commit petty crimes for quick cash (5K-25K every 30 minutes)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('work')
                .setDescription('💼 Work for coins (25K-150K every hour)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('bonus')
                .setDescription('🎁 Claim voting bonus rewards (requires 10+ votes)')
                .addStringOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to earn (number, "all", "half")')
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            // Route to appropriate subcommand handler
            switch (subcommand) {
                case 'beg':
                    return await begCommand.execute(interaction);
                case 'crime':
                    return await crimeCommand.execute(interaction);
                case 'work':
                    return await workCommand.execute(interaction);
                case 'bonus':
                    return await earnmoneyCommand.execute(interaction);
                default:
                    return await interaction.reply({
                        content: '❌ Unknown subcommand.',
                        flags: MessageFlags.Ephemeral
                    });
            }
        } catch (error) {
            logger.error('Error in earn command:', error);
            
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