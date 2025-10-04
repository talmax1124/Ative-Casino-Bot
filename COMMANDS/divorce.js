const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('divorce')
        .setDescription('End your marriage (irreversible action)')
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for divorce (optional)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const guildId = await getGuildId(interaction);

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // Check if user is married
            const marriageData = await dbManager.getUserMarriage(userId, guildId);

            if (!marriageData.married) {
                await interaction.editReply({
                    content: '❌ You are not currently married!'
                });
                return;
            }

            const marriage = marriageData.marriage;

            // Create confirmation embed
            const confirmEmbed = new EmbedBuilder()
                .setTitle('💔 Divorce Confirmation')
                .setDescription(`Are you sure you want to divorce **${marriage.partnerName}**?`)
                .addFields(
                    {
                        name: '⚠️ This action will:',
                        value: '• End your marriage permanently\n• Split the shared bank account equally\n• Remove marriage benefits\n• Cannot be undone',
                        inline: false
                    },
                    {
                        name: '💰 Shared Bank',
                        value: `Current balance: ${fmt(marriage.shared_bank)}\nEach person will receive: ${fmt(marriage.shared_bank / 2)}`,
                        inline: false
                    },
                    {
                        name: '📝 Reason',
                        value: reason,
                        inline: false
                    }
                )
                .setColor(0xFF0000)
                .setTimestamp();

            // Create confirmation buttons
            const confirmRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`divorce_confirm_${marriage.id}`)
                        .setLabel('💔 Confirm Divorce')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`divorce_cancel_${marriage.id}`)
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.editReply({
                embeds: [confirmEmbed],
                components: [confirmRow]
            });

        } catch (error) {
            logger.error(`Error in divorce command: ${error.message}`);
            
            await interaction.editReply({
                content: '❌ An error occurred while processing your divorce request. Please try again later.'
            });
        }
    }
};