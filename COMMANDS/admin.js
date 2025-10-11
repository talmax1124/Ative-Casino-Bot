/**
 * Consolidated Admin command for ATIVE Casino Bot
 * Combines setup, backup, and release functionality
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage } = require('../UTILS/common');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const logger = require('../UTILS/logger');

// Import original command modules for their logic
const setupCommand = require('./setup');
const releaseCommand = require('./release');

// Developer user ID for admin verification
const DEVELOPER_USER_ID = process.env.DEVELOPER_USER_ID || '466050111680544798';

// Helper function to check developer permissions
function isDeveloper(userId) {
    return userId === DEVELOPER_USER_ID;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('🔧 Administrative commands (Developer only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('⚙️ Setup bot configuration and permissions')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('release')
                .setDescription('🚀 Manage bot releases and updates')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Release action to perform')
                        .addChoices(
                            { name: 'Info - Current release info', value: 'info' },
                            { name: 'Deploy - Deploy new release', value: 'deploy' },
                            { name: 'Status - Check deployment status', value: 'status' }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('backup')
                .setDescription('💾 Database backup and maintenance (Currently disabled)')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        // Check if user is developer
        if (!isDeveloper(userId)) {
            return await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('🚫 Access Denied')
                    .setDescription('This command is restricted to developers only.')
                    .setColor(0xFF0000)
                ],
                ephemeral: true
            });
        }

        try {
            // Route to appropriate subcommand handler
            switch (subcommand) {
                case 'setup':
                    return await setupCommand.execute(interaction);
                case 'release':
                    return await releaseCommand.execute(interaction);
                case 'backup':
                    return await interaction.reply({
                        embeds: [new EmbedBuilder()
                            .setTitle('💾 Database Backup')
                            .setDescription('Backup functionality is currently disabled. Contact developer for manual backups.')
                            .setColor(0xFFAA00)
                        ],
                        ephemeral: true
                    });
                default:
                    return await interaction.reply({
                        content: '❌ Unknown subcommand.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            logger.error('Error in admin command:', error);
            
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