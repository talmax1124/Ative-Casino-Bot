/**
 * Portal Command - Casino Bot
 * Display bot information and links
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('portal')
        .setDescription('Display bot information and links'),

    async execute(interaction) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('🎰 ATIVE Casino Bot - Portal')
                .setDescription('Welcome to the ATIVE Casino Bot portal!')
                .addFields([
                    {
                        name: '🎮 Casino Games',
                        value: 'Play slots, blackjack, fishing, and more casino games!',
                        inline: false
                    },
                    {
                        name: '🎯 Mini Games',
                        value: 'Enjoy UNO, Battleship, Duck Hunt, and other fun games!',
                        inline: false
                    },
                    {
                        name: '💰 Economy System',
                        value: 'Economy commands have been moved to the UAS bot for better management.',
                        inline: false
                    },
                    {
                        name: '📊 XP System',
                        value: 'Level up by playing games and chatting! XP tracking moved to UAS.',
                        inline: false
                    },
                    {
                        name: '🎫 Lottery System',
                        value: 'Use `/purchaselottery` to buy tickets for the weekly drawing!',
                        inline: false
                    },
                    {
                        name: '🔧 Admin Commands',
                        value: 'Admin economy commands are now available in the UAS bot.',
                        inline: false
                    }
                ])
                .setColor(0x3498DB)
                .setFooter({
                    text: 'ATIVE Casino Bot • Enjoy responsible gaming!',
                    iconURL: interaction.client.user.displayAvatarURL()
                })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            logger.error(`Error in portal command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Failed to load portal information.')
                .setColor(0xFF0000)
                .setTimestamp();
            
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
};