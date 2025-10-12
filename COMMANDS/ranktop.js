const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ranktop')
        .setDescription('Vote for the bot on Rank.Top and get rewards!'),
    
    async execute(interaction) {
        try {
            // Check if interaction is valid
            if (!interaction.isRepliable()) {
                console.log('[ERROR] Interaction not repliable in ranktop command');
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('🎫 Vote on Rank.Top!')
                .setDescription('Vote for our bot on **Rank.Top** to get amazing rewards!')
                .setColor(0xFFD700)
                .addFields(
                    {
                        name: '🎁 Vote Rewards',
                        value: '• **75,000 coins** per vote\n• **3 free lottery tickets**\n• **Weekend bonus** (+50% coins)\n• **Streak bonuses** for consecutive votes',
                        inline: false
                    },
                    {
                        name: '🏆 Streak Bonuses',
                        value: '• **7 days**: +150,000 coins\n• **30 days**: +600,000 coins\n• **100 days**: +3,000,000 coins',
                        inline: false
                    },
                    {
                        name: '⏰ Voting Schedule',
                        value: 'You can vote every **12 hours** to maintain your streak!',
                        inline: false
                    }
                )
                .setThumbnail(interaction.client.user.displayAvatarURL())
                .setFooter({ 
                    text: '🎰 ATIVE Casino • Your support helps us grow!',
                    iconURL: interaction.client.user.displayAvatarURL()
                })
                .setTimestamp();

            const voteButton = new ButtonBuilder()
                .setLabel('Vote on Rank.Top')
                .setStyle(ButtonStyle.Link)
                .setURL('https://ranklist.gg/user/1403236218900185088')
                .setEmoji('🎫');

            const voteRow = new ActionRowBuilder().addComponents(voteButton);

            await interaction.reply({
                embeds: [embed],
                components: [voteRow],
                ephemeral: false
            });

        } catch (error) {
            console.error('[ERROR] Error in ranktop command:', error);
            
            if (interaction.isRepliable()) {
                try {
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('❌ Error')
                        .setDescription('There was an error processing your request. Please try again later.')
                        .setColor(0xFF0000);

                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    } else {
                        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    }
                } catch (replyError) {
                    console.error('[ERROR] Failed to send error message:', replyError);
                }
            }
        }
    }
};