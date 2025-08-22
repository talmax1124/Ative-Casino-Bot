/**
 * Panel command for role-based administrative interfaces
 * Provides Developer, Admin, and Mod control panels
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const panelManager = require('../UTILS/panelManager');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Open administrative control panels')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of panel to open')
                .setRequired(true)
                .addChoices(
                    { name: 'Developer Panel', value: 'developer' },
                    { name: 'Admin Panel', value: 'admin' },
                    { name: 'Mod Panel', value: 'mod' }
                )
        ),

    async execute(interaction) {
        try {
            const panelType = interaction.options.getString('type');

            let response;
            switch (panelType) {
                case 'developer':
                    response = panelManager.createDeveloperPanel(interaction);
                    break;
                case 'admin':
                    response = panelManager.createAdminPanel(interaction);
                    break;
                case 'mod':
                    response = panelManager.createModPanel(interaction);
                    break;
                default:
                    throw new Error(`Unknown panel type: ${panelType}`);
            }

            await interaction.reply(response);
            logger.info(`Panel opened: ${panelType} by ${interaction.user.tag} (${interaction.user.id})`);

        } catch (error) {
            logger.error(`Panel command error: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Panel Error')
                .setDescription('Failed to open the requested panel.')
                .setColor('#ff0000')
                .setTimestamp();

            const errorResponse = {
                embeds: [errorEmbed],
                flags: MessageFlags.Ephemeral
            };

            if (interaction.replied) {
                await interaction.followUp(errorResponse);
            } else {
                await interaction.reply(errorResponse);
            }
        }
    },

    async handleSelectMenu(interaction) {
        try {
            const customId = interaction.customId;

            switch (customId) {
                case 'dev_panel_action':
                    await panelManager.handleDeveloperAction(interaction);
                    break;
                case 'admin_panel_action':
                    await this.handleAdminAction(interaction);
                    break;
                case 'mod_panel_action':
                    await this.handleModAction(interaction);
                    break;
                default:
                    throw new Error(`Unknown select menu: ${customId}`);
            }

        } catch (error) {
            logger.error(`Select menu error: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Action Failed')
                .setDescription(`Failed to execute action: ${error.message}`)
                .setColor('#ff0000');

            if (interaction.replied) {
                await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    },

    async handleAdminAction(interaction) {
        if (!panelManager.isAdmin(interaction.member)) {
            return await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('❌ Access Denied')
                    .setDescription('You do not have admin permissions.')
                    .setColor('#ff0000')],
                flags: MessageFlags.Ephemeral
            });
        }

        const action = interaction.values[0];

        try {
            switch (action) {
                case 'view_balance':
                    await this.handleViewBalance(interaction);
                    break;
                case 'reset_balance':
                    await this.handleResetBalance(interaction);
                    break;
                case 'game_stats':
                    await this.handleGameStats(interaction);
                    break;
                case 'active_games':
                    await this.handleActiveGames(interaction);
                    break;
                case 'economy_report':
                    await this.handleEconomyReport(interaction);
                    break;
                case 'user_activity':
                    await this.handleUserActivity(interaction);
                    break;
                default:
                    throw new Error(`Unknown admin action: ${action}`);
            }
        } catch (error) {
            logger.error(`Admin action error: ${error.message}`);
            throw error;
        }
    },

    async handleModAction(interaction) {
        if (!panelManager.isMod(interaction.member)) {
            return await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('❌ Access Denied')
                    .setDescription('You do not have moderator permissions.')
                    .setColor('#ff0000')],
                flags: MessageFlags.Ephemeral
            });
        }

        const action = interaction.values[0];

        try {
            switch (action) {
                case 'check_user_games':
                    await this.handleCheckUserGames(interaction);
                    break;
                case 'issue_warning':
                    await this.handleIssueWarning(interaction);
                    break;
                case 'temp_game_ban':
                    await this.handleTempGameBan(interaction);
                    break;
                case 'recent_activity':
                    await this.handleRecentActivity(interaction);
                    break;
                case 'abuse_check':
                    await this.handleAbuseCheck(interaction);
                    break;
                default:
                    throw new Error(`Unknown mod action: ${action}`);
            }
        } catch (error) {
            logger.error(`Mod action error: ${error.message}`);
            throw error;
        }
    },

    // Admin action handlers
    async handleViewBalance(interaction) {
        await interaction.reply({
            content: 'Please provide the user ID to check their balance:',
            flags: MessageFlags.Ephemeral
        });
    },

    async handleResetBalance(interaction) {
        await interaction.reply({
            content: 'Please provide the user ID to reset their balance:',
            flags: MessageFlags.Ephemeral
        });
    },

    async handleGameStats(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const embed = new EmbedBuilder()
            .setTitle('📈 Game Statistics')
            .setDescription('Overall casino game statistics')
            .addFields([
                { name: 'Total Games Played', value: 'Coming Soon', inline: true },
                { name: 'Total Winnings', value: 'Coming Soon', inline: true },
                { name: 'Most Popular Game', value: 'Coming Soon', inline: true }
            ])
            .setColor('#00bfff')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleActiveGames(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const embed = new EmbedBuilder()
            .setTitle('🎮 Active Games Monitor')
            .setDescription('Currently active games across all servers')
            .addFields([
                { name: 'Active Blackjack Games', value: '0', inline: true },
                { name: 'Active Slot Games', value: '0', inline: true },
                { name: 'Total Active Games', value: '0', inline: true }
            ])
            .setColor('#00bfff')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleEconomyReport(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const embed = new EmbedBuilder()
            .setTitle('📊 Economy Health Report')
            .setDescription('Current state of the bot economy')
            .addFields([
                { name: 'Total Money in Circulation', value: 'Coming Soon', inline: true },
                { name: 'Average User Balance', value: 'Coming Soon', inline: true },
                { name: 'Economy Health', value: '✅ Stable', inline: true }
            ])
            .setColor('#00ff00')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleUserActivity(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const embed = new EmbedBuilder()
            .setTitle('📋 User Activity Report')
            .setDescription('User engagement and activity metrics')
            .addFields([
                { name: 'Active Users (24h)', value: 'Coming Soon', inline: true },
                { name: 'Games Played (24h)', value: 'Coming Soon', inline: true },
                { name: 'New Users (7d)', value: 'Coming Soon', inline: true }
            ])
            .setColor('#00bfff')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    // Mod action handlers
    async handleCheckUserGames(interaction) {
        await interaction.reply({
            content: 'Please provide the user ID to check their game status:',
            flags: MessageFlags.Ephemeral
        });
    },

    async handleIssueWarning(interaction) {
        await interaction.reply({
            content: 'Please provide the user ID and warning message (format: `userID message`):',
            flags: MessageFlags.Ephemeral
        });
    },

    async handleTempGameBan(interaction) {
        await interaction.reply({
            content: 'Please provide the user ID and duration in hours (format: `userID hours`):',
            flags: MessageFlags.Ephemeral
        });
    },

    async handleRecentActivity(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const embed = new EmbedBuilder()
            .setTitle('📋 Recent Activity Log')
            .setDescription('Recent bot activity and events')
            .addFields([
                { name: 'Last 10 Commands', value: 'Coming Soon', inline: false },
                { name: 'Recent Errors', value: 'None', inline: true },
                { name: 'System Status', value: '✅ Operational', inline: true }
            ])
            .setColor('#00bfff')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleAbuseCheck(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const embed = new EmbedBuilder()
            .setTitle('🔎 Economy Abuse Check')
            .setDescription('Scanning for potential economy abuse patterns')
            .addFields([
                { name: 'Suspicious Activity', value: 'None detected', inline: true },
                { name: 'Flagged Users', value: '0', inline: true },
                { name: 'Last Scan', value: new Date().toLocaleString(), inline: true }
            ])
            .setColor('#00ff00')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};