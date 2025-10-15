const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../UTILS/databaseAdapter');
const { getGuildId } = require('../UTILS/common');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('divorce')
        .setDescription('Initiate divorce proceedings to end your marriage'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        await interaction.deferReply({ ephemeral: true });

        try {
            // Check if the user is married
            const marriageData = await dbManager.getUserMarriage(userId, guildId);

            if (!marriageData.married) {
                await interaction.editReply({
                    content: '❌ You are not currently married, so you cannot divorce.'
                });
                return;
            }

            const marriage = marriageData.marriage;
            const sharedBankAmount = marriage.shared_bank || 0;
            const sharedBankSplit = sharedBankAmount / 2;

            // Create divorce confirmation embed
            const divorceEmbed = new EmbedBuilder()
                .setTitle('💔 Divorce Proceedings')
                .setDescription('Are you sure you want to divorce your partner? This action cannot be undone.')
                .addFields(
                    {
                        name: '👫 Current Marriage',
                        value: `**${marriage.partner1_name}** & **${marriage.partner2_name}**`,
                        inline: false
                    },
                    {
                        name: '💰 Shared Bank Distribution',
                        value: `Each partner will receive **${Math.floor(sharedBankSplit).toLocaleString()}** coins from the shared bank`,
                        inline: false
                    },
                    {
                        name: '⚠️ Consequences',
                        value: '• Marriage benefits will be lost\n• Shared bank will be divided equally\n• Marriage roles will be removed\n• Your partner will be notified',
                        inline: false
                    }
                )
                .setColor(0xFF0000)
                .setTimestamp()
                .setFooter({ text: '💔 ATIVE Casino Divorce Proceedings' });

            // Create confirmation buttons
            const confirmRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`divorce_confirm_${marriage.id}`)
                        .setLabel('Confirm Divorce')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('💔'),
                    new ButtonBuilder()
                        .setCustomId(`divorce_cancel_${marriage.id}`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('✖️')
                );

            await interaction.editReply({
                embeds: [divorceEmbed],
                components: [confirmRow]
            });

        } catch (error) {
            logger.error(`Error in divorce command: ${error.message}`);
            
            await interaction.editReply({
                content: '❌ An error occurred while initiating divorce proceedings. Please try again later.'
            });
        }
    }
};