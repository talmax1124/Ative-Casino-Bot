/**
 * Lottery status command for the casino bot
 * Shows player's lottery status, win probability, money, tickets purchased, etc.
 */

const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lottery')
        .setDescription('Check your lottery status, win probability, and ticket information'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        try {
            await dbManager.ensureUser(userId, interaction.user.displayName);
            await this.showPlayerLotteryStatus(interaction, userId, guildId);
        } catch (error) {
            logger.error(`Lottery status command error: ${error.message}`);
            await interaction.reply({ 
                content: 'An error occurred while checking your lottery status.', 
                ephemeral: true 
            });
        }
    },

    async showPlayerLotteryStatus(interaction, userId, guildId) {
        try {
            const lotteryInfo = await dbManager.getLotteryInfo(guildId);
            const userTickets = await dbManager.getUserLotteryTickets(userId, guildId);
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            const nextDrawingTime = this.getNextSundayTimestamp();
            
            // Calculate win probability
            const totalTickets = lotteryInfo.total_tickets || 0;
            const winProbability = totalTickets > 0 ? ((userTickets / totalTickets) * 100).toFixed(2) : "0.00";
            
            // Calculate potential winnings
            const currentPrize = lotteryInfo.total_prize || 400000;
            const potentialWinnings = {
                first: Math.floor(currentPrize * 0.45),
                second: Math.floor(currentPrize * 0.45),
                third: Math.floor(currentPrize * 0.10)
            };

            const embed = new EmbedBuilder()
                .setTitle(`🎟️ ${interaction.user.displayName}'s Lottery Status`)
                .setColor(0xFFD700)
                .setThumbnail(interaction.user.displayAvatarURL())
                .addFields(
                    {
                        name: '🎫 Your Tickets This Week',
                        value: `**${userTickets}/7** tickets purchased\n${userTickets > 0 ? '✅ You\'re in the drawing!' : '❌ No tickets yet'}`,
                        inline: true
                    },
                    {
                        name: '📊 Win Probability',
                        value: `**${winProbability}%** chance to win\n*Based on current ticket sales*`,
                        inline: true
                    },
                    {
                        name: '💰 Your Current Balance',
                        value: `💵 Wallet: **${fmt(userBalance.wallet)}**\n🏦 Bank: **${fmt(userBalance.bank)}**\n💎 Total: **${fmt(userBalance.wallet + userBalance.bank)}**`,
                        inline: true
                    },
                    {
                        name: '🏆 Potential Prize Winnings',
                        value: `🥇 1st Place: **${fmt(potentialWinnings.first)}** (45%)\n🥈 2nd Place: **${fmt(potentialWinnings.second)}** (45%)\n🥉 3rd Place: **${fmt(potentialWinnings.third)}** (10%)`,
                        inline: false
                    },
                    {
                        name: '💰 Current Prize Pool Info',
                        value: `Total Pool: **${fmt(currentPrize)}**\nTickets Sold: **${totalTickets}** tickets\nRemaining Tickets: **${7 - userTickets}** you can buy`,
                        inline: true
                    },
                    {
                        name: '⏰ Next Drawing',
                        value: `<t:${nextDrawingTime}:F>\n<t:${nextDrawingTime}:R>\n*Every Sunday at 10 AM EST*`,
                        inline: true
                    }
                )
                .setFooter({ text: '🍀 Use /purchaselottery to buy more tickets! • Prizes go to your BANK account' })
                .setTimestamp();

            // Add ticket cost info if user can buy more
            if (userTickets < 7) {
                const canBuy = 7 - userTickets;
                const ticketCost = 12000;
                const totalCost = canBuy * ticketCost;
                const canAfford = Math.floor(userBalance.wallet / ticketCost);
                const maxAffordable = Math.min(canBuy, canAfford);
                
                embed.addFields({
                    name: '🛒 Ticket Purchase Info',
                    value: `💳 Cost per ticket: **${fmt(ticketCost)}**\n📊 You can buy: **${canBuy}** more tickets\n💵 You can afford: **${maxAffordable}** tickets\n💰 Max cost: **${fmt(totalCost)}**`,
                    inline: false
                });
            }

            const buyButton = new ButtonBuilder()
                .setCustomId('lottery_buy')
                .setLabel('Buy Tickets')
                .setStyle(userTickets >= 7 ? ButtonStyle.Secondary : ButtonStyle.Primary)
                .setEmoji('🎫')
                .setDisabled(userTickets >= 7);

            const helpButton = new ButtonBuilder()
                .setCustomId('lottery_help')
                .setLabel('How It Works')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('❓');

            const row = new ActionRowBuilder().addComponents(buyButton, helpButton);

            await interaction.reply({ embeds: [embed], components: [row] });

        } catch (error) {
            logger.error(`Error showing player lottery status: ${error.message}`);
            throw error;
        }
    },

    // Helper method to get next Sunday at 10 AM EST timestamp
    getNextSundayTimestamp() {
        const now = new Date();
        const estOffset = -5 * 60; // EST is UTC-5 in minutes
        const estTime = new Date(now.getTime() + (estOffset * 60 * 1000));
        
        // Find days until next Sunday (0 = Sunday, 6 = Saturday)
        const daysUntilSunday = (7 - estTime.getDay()) % 7;
        
        let nextSunday;
        if (daysUntilSunday === 0) {
            // Today is Sunday
            nextSunday = new Date(estTime);
            nextSunday.setHours(10, 0, 0, 0);
            
            // If it's already past 10 AM, go to next Sunday
            if (estTime.getHours() >= 10) {
                nextSunday.setDate(nextSunday.getDate() + 7);
            }
        } else {
            // Not Sunday, calculate next Sunday
            nextSunday = new Date(estTime);
            nextSunday.setDate(nextSunday.getDate() + daysUntilSunday);
            nextSunday.setHours(10, 0, 0, 0);
        }
        
        // Convert back to UTC for timestamp
        const utcTimestamp = Math.floor((nextSunday.getTime() - (estOffset * 60 * 1000)) / 1000);
        return utcTimestamp;
    }
};