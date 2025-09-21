/**
 * Buy Money command for ATIVE Casino Bot
 * Directs users to the website shop to purchase coins
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buymoney')
        .setDescription('Purchase coins from the ATIVE Casino Shop'),

    async execute(interaction) {
        try {
            const shopEmbed = buildSessionEmbed({
                title: '💰 Buy Coins',
                topFields: [
                    { 
                        name: '🛒 Visit Our Shop', 
                        value: 'Purchase coins and subscriptions to enhance your casino experience!' 
                    },
                    {
                        name: '💎 Available Packages',
                        value: '• **5M Coins Pack** - $3.99\n• **25M Coins Pack** - $24.99\n• **100M Coins Pack** - $39.99\n• **Diamond Subscription** - $4.99/month\n• **Ruby Subscription** - $9.99/month'
                    },
                    {
                        name: '🔗 Shop Link',
                        value: '[**Click here to visit the shop**](https://ative-casino-bot-production.up.railway.app)\n\n**Direct Link:** https://ative-casino-bot-production.up.railway.app'
                    }
                ],
                stageText: 'SHOP NOW',
                color: 0x00D4FF,
                footer: 'Secure payments via PayPal • ATIVE Casino'
            });

            await interaction.reply({ embeds: [shopEmbed] });
        } catch (error) {
            console.error(`Error in buymoney command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Error',
                topFields: [
                    { name: '🔧 System Error', value: 'Failed to display shop information. Please try again.' }
                ],
                stageText: 'SYSTEM ERROR',
                color: 0xFF0000,
                footer: 'Please try again later'
            });

            const replyMethod = interaction.deferred || interaction.replied ? 'editReply' : 'reply';
            await interaction[replyMethod]({ embeds: [errorEmbed] });
        }
    }
};