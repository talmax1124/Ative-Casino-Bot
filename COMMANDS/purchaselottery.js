/**
 * Purchase Lottery command for the casino bot
 * Allows users to buy lottery tickets (1-7)
 * REDESIGNED: Complete UI overhaul with standardized templates
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const UITemplates = require('../UTILS/uiTemplates');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purchaselottery')
        .setDescription('Purchase lottery tickets for the weekly drawing'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        try {
            // Show main lottery purchase interface
            await this.showLotteryInterface(interaction, userId, guildId);

        } catch (error) {
            logger.error(`Error in purchaselottery command: ${error.message}`);
            
            const errorEmbed = UITemplates.createErrorEmbed('Lottery Purchase', {
                description: 'An error occurred while loading the lottery interface. Please try again.',
                error: error.message
            });

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },

    async showLotteryInterface(interaction, userId, guildId) {
        // Ensure user exists in database
        await dbManager.ensureUser(userId, interaction.user.displayName);

        // Get current user data
        const balance = await dbManager.getUserBalance(userId, guildId);
        const currentTickets = await dbManager.getUserLotteryTickets(userId, guildId);
        const lotteryInfo = await dbManager.getLotteryInfo(guildId);
        
        const ticketPrice = 12000;
        const maxTickets = 7;
        const remainingTickets = maxTickets - currentTickets;
        
        // Calculate win probability
        const totalTickets = lotteryInfo.total_tickets || 0;
        const winProbability = totalTickets > 0 ? ((currentTickets / totalTickets) * 100).toFixed(2) : "0.00";

        const embed = new EmbedBuilder()
            .setColor(UITemplates.getColors().PRIMARY_GAME)
            .setTitle('🎫 Weekly Lottery - Purchase Tickets')
            .setDescription('Buy lottery tickets for your chance to win the weekly prize pool!')
            .addFields(
                {
                    name: '💰 Your Balance',
                    value: `$${balance.wallet.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '🎟️ Your Tickets',
                    value: `${currentTickets}/${maxTickets}`,
                    inline: true
                },
                {
                    name: '🎯 Win Probability',
                    value: `${winProbability}%`,
                    inline: true
                },
                {
                    name: '💎 Prize Pool',
                    value: `$${(lotteryInfo.total_prize || 400000).toLocaleString()}`,
                    inline: true
                },
                {
                    name: '🎫 Ticket Price',
                    value: `$${ticketPrice.toLocaleString()} each`,
                    inline: true
                },
                {
                    name: '📊 Total Tickets Sold',
                    value: `${totalTickets.toLocaleString()}`,
                    inline: true
                }
            )
            .setFooter({
                text: "Casino Bot • Select ticket quantity below",
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTimestamp();

        const components = this.createTicketSelectionButtons(currentTickets, remainingTickets, balance.wallet, ticketPrice);

        await interaction.reply({
            embeds: [embed],
            components: components
        });
    },

    createTicketSelectionButtons(currentTickets, remainingTickets, balance, ticketPrice) {
        const components = [];
        
        if (remainingTickets > 0) {
            // Ticket quantity buttons (1-7 or remaining)
            const ticketRow = new ActionRowBuilder();
            const maxBuyable = Math.min(remainingTickets, Math.floor(balance / ticketPrice), 7);
            
            for (let i = 1; i <= Math.min(maxBuyable, 5); i++) {
                const cost = i * ticketPrice;
                ticketRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`lottery_buy_${i}`)
                        .setLabel(`${i} Ticket${i > 1 ? 's' : ''} ($${cost.toLocaleString()})`)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎫')
                        .setDisabled(balance < cost)
                );
            }
            
            if (maxBuyable > 0) {
                components.push(ticketRow);
            }

            // Secondary actions row
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('lottery_view_tickets')
                        .setLabel('View My Tickets')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📋'),
                    new ButtonBuilder()
                        .setCustomId('lottery_rules')
                        .setLabel('How to Play')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📖'),
                    new ButtonBuilder()
                        .setCustomId('lottery_cancel')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('❌')
                );

            components.push(actionRow);
        } else {
            // User has maximum tickets
            const maxRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('lottery_view_tickets')
                        .setLabel('View My Tickets')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📋'),
                    new ButtonBuilder()
                        .setCustomId('lottery_rules')
                        .setLabel('How to Play')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📖'),
                    new ButtonBuilder()
                        .setCustomId('lottery_cancel')
                        .setLabel('Close')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('❌')
                );

            components.push(maxRow);
        }

        return components;
    },

    async handleButtonInteraction(interaction, action) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        try {
            if (action.startsWith('buy_')) {
                const ticketCount = parseInt(action.split('_')[1]);
                await this.purchaseTickets(interaction, userId, guildId, ticketCount);
            } else if (action === 'view_tickets') {
                await this.showUserTickets(interaction, userId, guildId);
            } else if (action === 'rules') {
                await this.showLotteryRules(interaction);
            } else if (action === 'cancel') {
                const embed = new EmbedBuilder()
                    .setColor(UITemplates.getColors().INFO)
                    .setTitle('🎫 Lottery Purchase Cancelled')
                    .setDescription('You can purchase tickets anytime before the weekly drawing!')
                    .setTimestamp();

                await interaction.update({
                    embeds: [embed],
                    components: []
                });
            }
        } catch (error) {
            logger.error(`Error handling lottery button: ${error.message}`);
            
            const errorEmbed = UITemplates.createErrorEmbed('Lottery', {
                description: 'An error occurred while processing your request.',
                error: error.message
            });

            await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
        }
    },

    async purchaseTickets(interaction, userId, guildId, ticketCount) {
        const ticketPrice = 12000;
        const totalCost = ticketCount * ticketPrice;

        // Get current user data
        const balance = await dbManager.getUserBalance(userId, guildId);
        const currentTickets = await dbManager.getUserLotteryTickets(userId, guildId);

        // Validation checks
        if (currentTickets + ticketCount > 7) {
            const embed = UITemplates.createErrorEmbed('Lottery Purchase', {
                description: `You can only buy a maximum of **7 tickets per week**.\n\n**Current Tickets:** ${currentTickets}\n**Can Still Buy:** ${7 - currentTickets} more tickets`,
                isLoss: false
            });

            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (balance.wallet < totalCost) {
            const embed = UITemplates.createInsufficientBalanceEmbed(totalCost, balance.wallet);
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Show loading state
        const loadingEmbed = UITemplates.createLoadingEmbed('Lottery', 'Processing purchase');
        await interaction.update({ embeds: [loadingEmbed], components: [] });

        // Process the purchase
        const success = await dbManager.purchaseLotteryTickets(userId, guildId, ticketCount, totalCost);

        if (success) {
            const newTicketCount = currentTickets + ticketCount;
            const newBalance = balance.wallet - totalCost;
            
            // Get updated lottery info
            const lotteryInfo = await dbManager.getLotteryInfo(guildId);
            const totalTickets = lotteryInfo.total_tickets || 0;
            const winProbability = totalTickets > 0 ? ((newTicketCount / totalTickets) * 100).toFixed(2) : "0.00";

            const successEmbed = UITemplates.createSuccessEmbed('Lottery Purchase', {
                description: `✅ Successfully purchased **${ticketCount}** lottery ticket${ticketCount > 1 ? 's' : ''}!`,
                winAmount: null,
                newBalance: newBalance
            });

            successEmbed.addFields(
                {
                    name: '💳 Purchase Details',
                    value: `**Tickets Bought:** ${ticketCount}\n**Cost per Ticket:** $${ticketPrice.toLocaleString()}\n**Total Cost:** $${totalCost.toLocaleString()}`,
                    inline: false
                },
                {
                    name: '🎟️ Your Lottery Status',
                    value: `**Your Tickets:** ${newTicketCount}/7\n**Win Probability:** ${winProbability}%\n${newTicketCount >= 7 ? '🔥 **Maximum tickets reached!**' : `💰 Can buy **${7 - newTicketCount} more** tickets`}`,
                    inline: false
                },
                {
                    name: '💎 Prize Pool',
                    value: `$${(lotteryInfo.total_prize || 400000).toLocaleString()}`,
                    inline: true
                }
            );

            await interaction.editReply({ embeds: [successEmbed], components: [] });

            // Log the purchase
            await sendLogMessage(
                interaction.client,
                'economy',
                `Lottery Purchase: ${interaction.user.displayName} bought ${ticketCount} tickets for $${totalCost.toLocaleString()} (now has ${newTicketCount}/7 tickets)`,
                userId,
                guildId
            );

        } else {
            const errorEmbed = UITemplates.createErrorEmbed('Lottery Purchase', {
                description: 'Failed to process your ticket purchase. Please try again.',
                isLoss: false
            });

            await interaction.editReply({ embeds: [errorEmbed], components: [] });
        }
    },

    async showUserTickets(interaction, userId, guildId) {
        const currentTickets = await dbManager.getUserLotteryTickets(userId, guildId);
        const lotteryInfo = await dbManager.getLotteryInfo(guildId);
        const totalTickets = lotteryInfo.total_tickets || 0;
        const winProbability = totalTickets > 0 ? ((currentTickets / totalTickets) * 100).toFixed(2) : "0.00";

        const embed = new EmbedBuilder()
            .setColor(UITemplates.getColors().INFO)
            .setTitle('🎟️ Your Lottery Tickets')
            .addFields(
                {
                    name: 'Current Tickets',
                    value: `${currentTickets}/7`,
                    inline: true
                },
                {
                    name: 'Win Probability',
                    value: `${winProbability}%`,
                    inline: true
                },
                {
                    name: 'Prize Pool',
                    value: `$${(lotteryInfo.total_prize || 400000).toLocaleString()}`,
                    inline: true
                }
            )
            .setFooter({ text: 'Good luck in the weekly drawing!' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async showLotteryRules(interaction) {
        const rules = [
            '🎫 Purchase 1-7 tickets per week for $12,000 each',
            '🗓️ Weekly drawing every Sunday at 10 AM EST',
            '🏆 Winner takes the entire prize pool',
            '📊 Higher ticket count = better winning odds',
            '💰 All ticket sales contribute to the prize pool'
        ];

        const rulesEmbed = UITemplates.createRulesEmbed('Weekly Lottery', rules);
        
        await interaction.reply({ embeds: [rulesEmbed], ephemeral: true });
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