/**
 * Summary Command - Generate and send log summaries on demand
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { hasAdminRole } = require('../UTILS/common');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('summary')
        .setDescription('Generate activity summaries for the logs channel')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of summary to generate')
                .setRequired(false)
                .addChoices(
                    { name: 'Hourly Summary', value: 'hourly' },
                    { name: 'Daily Summary', value: 'daily' }
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // Check admin permissions
        if (!hasAdminRole(interaction.member)) {
            return interaction.reply({
                content: '❌ This command requires administrator permissions.',
                ephemeral: true
            });
        }

        const summaryType = interaction.options.getString('type') || 'hourly';

        await interaction.deferReply({ ephemeral: true });

        try {
            // Check if log summary manager is available
            if (!interaction.client.logSummaryManager) {
                return interaction.editReply({
                    content: '❌ Log Summary Manager is not initialized.',
                    ephemeral: true
                });
            }

            // Generate the requested summary
            await interaction.client.logSummaryManager.sendImmediateSummary(summaryType);

            // Create response embed
            const embed = new EmbedBuilder()
                .setTitle('📊 Summary Generated')
                .setDescription(`Successfully generated and sent ${summaryType} summary to the logs channel.`)
                .setColor(0x00FF00)
                .setTimestamp()
                .addFields(
                    { name: '📈 Summary Type', value: summaryType.charAt(0).toUpperCase() + summaryType.slice(1), inline: true },
                    { name: '📍 Channel', value: '<#1405096821512212521>', inline: true },
                    { name: '⏰ Generated At', value: new Date().toLocaleString(), inline: true }
                );

            await interaction.editReply({ embeds: [embed] });

            logger.info(`Admin ${interaction.user.tag} generated ${summaryType} summary`);

        } catch (error) {
            logger.error(`Failed to generate summary: ${error.message}`);
            
            await interaction.editReply({
                content: `❌ Failed to generate summary: ${error.message}`,
                ephemeral: true
            });
        }
    }
};