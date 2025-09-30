/**
 * Rank.Top command for bot statistics and API interactions
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ranktop')
        .setDescription('Manage automatic statistics posting to Rank.Top')
        .addStringOption(option =>
            option
                .setName('action')
                .setDescription('Action to perform')
                .setRequired(true)
                .addChoices(
                    { name: 'Start', value: 'start' },
                    { name: 'Stop', value: 'stop' },
                    { name: 'Status', value: 'status' }
                )),

    async execute(interaction) {
        try {
            // Get the RankTopManager instance
            const rankTopManager = interaction.client.rankTopManager;
            
            if (!rankTopManager) {
                return await interaction.reply({
                    content: '❌ Rank.Top integration is not configured.',
                    flags: MessageFlags.Ephemeral
                });
            }

            await this.handleAutopostCommand(interaction, rankTopManager);
        } catch (error) {
            logger.error('RankTop command error:', error);
            await interaction.reply({
                content: '❌ An error occurred while executing the command.',
                flags: MessageFlags.Ephemeral
            });
        }
    },

    async handleAutopostCommand(interaction, rankTopManager) {
        const action = interaction.options.getString('action');

        switch (action) {
            case 'start':
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const startSuccess = await rankTopManager.startAutopost();
                
                await interaction.editReply({
                    content: startSuccess 
                        ? '✅ Autopost started! Statistics will be posted to Rank.Top every 30 minutes.'
                        : '❌ Failed to start autopost. Check bot configuration.'
                });
                break;

            case 'stop':
                rankTopManager.stopAutopost();
                await interaction.reply({
                    content: '⏹️ Autopost stopped.',
                    flags: MessageFlags.Ephemeral
                });
                break;

            case 'status':
                const status = rankTopManager.autopostStarted;
                const embed = new EmbedBuilder()
                    .setTitle('📊 Autopost Status')
                    .setColor(status ? 0x00FF00 : 0xFF0000)
                    .addFields(
                        { name: 'Status', value: status ? '✅ Running' : '❌ Stopped', inline: true },
                        { name: 'API Key', value: rankTopManager.apiKey ? '✅ Configured' : '❌ Missing', inline: true },
                        { name: 'Bot Token', value: rankTopManager.botAuthToken ? '✅ Configured' : '❌ Missing', inline: true }
                    )
                    .setFooter({ text: 'Rank.Top Integration' })
                    .setTimestamp();

                await interaction.reply({
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });
                break;
        }
    }
};