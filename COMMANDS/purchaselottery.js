/**
 * Purchase Lottery command for the casino bot
 * Allows users to buy lottery tickets (1-7)
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purchaselottery')
        .setDescription('Purchase lottery tickets for the weekly drawing')
        .addIntegerOption(option =>
            option.setName('count')
                .setDescription('Number of tickets to buy (1-7)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(7)
        ),

    async execute(interaction) {
        const ticketCount = interaction.options.getInteger('count');
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const ticketPrice = 12000; // $12,000 per ticket as specified

        try {
            // Ensure user exists in database
            await dbManager.ensureUser(userId, interaction.user.displayName);

            // Get current user balance and tickets
            const balance = await dbManager.getUserBalance(userId, guildId);
            const currentTickets = await dbManager.getUserLotteryTickets(userId, guildId);
            
            // Check if user already has maximum tickets
            if (currentTickets + ticketCount > 7) {
                await interaction.reply({
                    content: `❌ You can only buy a maximum of 7 tickets per week. You currently have **${currentTickets}** tickets, so you can only buy **${7 - currentTickets}** more tickets.`,
                    ephemeral: true
                });
                return;
            }

            const totalCost = ticketCount * ticketPrice;

            // Check if user has enough money
            if (balance.wallet < totalCost) {
                await interaction.reply({
                    content: `❌ Insufficient funds! You need **${fmt(totalCost)}** but only have **${fmt(balance.wallet)}** in your wallet.\n\n💡 *Use `/balance` to check your funds or `/sendmoney` to transfer from bank to wallet.*`,
                    ephemeral: true
                });
                return;
            }

            // Process the purchase
            const success = await dbManager.purchaseLotteryTickets(userId, guildId, ticketCount, totalCost);
            
            if (success) {
                const newTicketCount = currentTickets + ticketCount;
                const newBalance = balance.wallet - totalCost;
                
                // Get updated lottery info for win probability
                const lotteryInfo = await dbManager.getLotteryInfo(guildId);
                const totalTickets = lotteryInfo.total_tickets || 0;
                const winProbability = totalTickets > 0 ? ((newTicketCount / totalTickets) * 100).toFixed(2) : "0.00";

                const embed = new EmbedBuilder()
                    .setTitle('🎫 Lottery Tickets Purchased Successfully!')
                    .setColor(0x00FF00)
                    .setDescription(`You've successfully purchased **${ticketCount}** lottery ticket${ticketCount > 1 ? 's' : ''}!`)
                    .addFields(
                        {
                            name: '💳 Purchase Summary',
                            value: `Tickets Bought: **${ticketCount}**\nCost per Ticket: **${fmt(ticketPrice)}**\nTotal Cost: **${fmt(totalCost)}**`,
                            inline: true
                        },
                        {
                            name: '💵 Balance Update',
                            value: `Previous Wallet: **${fmt(balance.wallet)}**\nNew Wallet: **${fmt(newBalance)}**\nRemaining Bank: **${fmt(balance.bank)}**`,
                            inline: true
                        },
                        {
                            name: '🎟️ Lottery Status',
                            value: `Your Tickets: **${newTicketCount}/7**\nWin Probability: **${winProbability}%**\n${newTicketCount >= 7 ? '🔥 Maximum tickets!' : `💰 Can buy ${7 - newTicketCount} more`}`,
                            inline: true
                        },
                        {
                            name: '💰 Current Prize Pool',
                            value: `**${fmt(lotteryInfo.total_prize || 400000)}**\n*Total tickets sold: ${totalTickets}*`,
                            inline: false
                        },
                        {
                            name: '⏰ Next Drawing',
                            value: `<t:${this.getNextSundayTimestamp()}:F>\n*Every Sunday at 10 AM EST*`,
                            inline: false
                        }
                    )
                    .setFooter({ text: '🍀 Good luck in the drawing! Winnings go to your BANK account.' })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });

                // Log the purchase
                await sendLogMessage(
                    interaction.client,
                    'economy',
                    `Lottery Purchase: ${interaction.user.displayName} bought ${ticketCount} tickets for ${fmt(totalCost)} (now has ${newTicketCount}/7 tickets)`,
                    userId,
                    guildId
                );

            } else {
                throw new Error('Failed to process ticket purchase');
            }

        } catch (error) {
            logger.error(`Error in purchaselottery command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Purchase Failed')
                .setDescription('An error occurred while purchasing your lottery tickets. Please try again.')
                .setColor(0xFF0000)
                .addField('Support', 'If this problem persists, please contact an administrator.')
                .setTimestamp();

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
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