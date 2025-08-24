/**
 * Purchase Lottery command for the casino bot
 * Allows users to buy lottery tickets (1-7)
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
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
                const embed = buildSessionEmbed({
                    title: `❌ ${interaction.user.displayName}'s Lottery Purchase`,
                    topFields: [
                        { 
                            name: 'Maximum Tickets Reached', 
                            value: `You can only buy a maximum of **7 tickets per week**.\n\n**Current Tickets:** ${currentTickets}\n**Can Still Buy:** ${7 - currentTickets} more tickets` 
                        }
                    ],
                    color: 0xFF0000,
                    footer: 'Lottery System • Try with fewer tickets'
                });

                await interaction.reply({
                    embeds: [embed],
                    ephemeral: true
                });
                return;
            }

            const totalCost = ticketCount * ticketPrice;

            // Check if user has enough money
            if (balance.wallet < totalCost) {
                const embed = buildSessionEmbed({
                    title: `❌ ${interaction.user.displayName}'s Lottery Purchase`,
                    topFields: [
                        { 
                            name: 'Insufficient Funds', 
                            value: `You need **${fmt(totalCost)}** but only have **${fmt(balance.wallet)}** in your wallet.` 
                        },
                        {
                            name: '💡 Tip',
                            value: 'Use `/withdraw` to transfer money from your bank to wallet.'
                        }
                    ],
                    bankFields: [
                        { name: '💵 Wallet', value: fmt(balance.wallet), inline: true },
                        { name: '🏦 Bank', value: fmt(balance.bank), inline: true },
                        { name: '💰 Needed', value: fmt(totalCost), inline: true }
                    ],
                    color: 0xFF0000,
                    footer: 'Lottery System • Check your balance'
                });

                await interaction.reply({
                    embeds: [embed],
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

                const embed = buildSessionEmbed({
                    title: `🎫 ${interaction.user.displayName}'s Lottery Purchase`,
                    topFields: [
                        { 
                            name: 'Purchase Complete!', 
                            value: `✅ Successfully purchased **${ticketCount}** lottery ticket${ticketCount > 1 ? 's' : ''}!` 
                        },
                        {
                            name: '💳 Purchase Details',
                            value: `**Tickets Bought:** ${ticketCount}\n**Cost per Ticket:** ${fmt(ticketPrice)}\n**Total Cost:** ${fmt(totalCost)}`
                        },
                        {
                            name: '🎟️ Your Lottery Status',
                            value: `**Your Tickets:** ${newTicketCount}/7\n**Win Probability:** ${winProbability}%\n${newTicketCount >= 7 ? '🔥 **Maximum tickets reached!**' : `💰 Can buy **${7 - newTicketCount} more** tickets`}`
                        }
                    ],
                    bankFields: [
                        { name: '💵 New Wallet', value: fmt(newBalance), inline: true },
                        { name: '🏦 Bank', value: fmt(balance.bank), inline: true },
                        { name: '💰 Prize Pool', value: fmt(lotteryInfo.total_prize || 400000), inline: true }
                    ],
                    stageText: newTicketCount >= 7 ? 'MAX TICKETS REACHED' : 'TICKETS PURCHASED',
                    color: 0x00FF00,
                    footer: `🍀 Good luck! Next drawing: Sunday 10 AM EST • ${totalTickets} total tickets sold`
                });

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
            
            const errorEmbed = buildSessionEmbed({
                title: `❌ ${interaction.user.displayName}'s Lottery Purchase`,
                topFields: [
                    { 
                        name: 'Purchase Failed', 
                        value: 'An error occurred while purchasing your lottery tickets. Please try again.' 
                    },
                    {
                        name: '💡 Support',
                        value: 'If this problem persists, please contact an administrator.'
                    }
                ],
                color: 0xFF0000,
                footer: 'Lottery System • Error occurred'
            });

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