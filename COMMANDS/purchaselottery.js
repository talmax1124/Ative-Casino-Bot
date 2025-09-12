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
        
        // Calculate win probability and buyable tickets
        const totalTickets = lotteryInfo.total_tickets || 0;
        const winProbability = totalTickets > 0 ? ((currentTickets / totalTickets) * 100).toFixed(2) : "0.00";
        const maxBuyableNow = Math.min(remainingTickets, Math.floor(balance.wallet / ticketPrice));

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
                    name: '🛒 Can Buy Now',
                    value: maxBuyableNow > 0 ? `Up to ${maxBuyableNow} ticket${maxBuyableNow > 1 ? 's' : ''}` : 'None available',
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
            // Calculate what user can actually afford and is allowed to buy
            const maxBuyable = Math.min(remainingTickets, Math.floor(balance / ticketPrice));
            
            if (maxBuyable > 0) {
                // First row: 1-5 tickets (or max buyable if less than 5)
                const ticketRow1 = new ActionRowBuilder();
                const firstRowMax = Math.min(maxBuyable, 5);
                
                for (let i = 1; i <= firstRowMax; i++) {
                    const cost = i * ticketPrice;
                    ticketRow1.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`lottery_buy_${i}`)
                            .setLabel(`${i} Ticket${i > 1 ? 's' : ''} ($${cost.toLocaleString()})`)
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('🎫')
                            .setDisabled(balance < cost || (currentTickets + i) > 7)
                    );
                }
                components.push(ticketRow1);
                
                // Second row: 6-7 tickets if user can afford them and within limits
                if (maxBuyable > 5) {
                    const ticketRow2 = new ActionRowBuilder();
                    
                    for (let i = 6; i <= Math.min(maxBuyable, 7); i++) {
                        if (currentTickets + i <= 7) { // Only show if within total limit
                            const cost = i * ticketPrice;
                            ticketRow2.addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`lottery_buy_${i}`)
                                    .setLabel(`${i} Ticket${i > 1 ? 's' : ''} ($${cost.toLocaleString()})`)
                                    .setStyle(ButtonStyle.Primary)
                                    .setEmoji('🎫')
                                    .setDisabled(balance < cost || (currentTickets + i) > 7)
                            );
                        }
                    }
                    
                    // Only add second row if it has buttons
                    if (ticketRow2.components.length > 0) {
                        // Fill remaining slots with empty disabled buttons for better layout
                        while (ticketRow2.components.length < 2) {
                            ticketRow2.addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`lottery_empty_${ticketRow2.components.length}`)
                                    .setLabel('─')
                                    .setStyle(ButtonStyle.Secondary)
                                    .setDisabled(true)
                            );
                        }
                        components.push(ticketRow2);
                    }
                }
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

        // Process the purchase with fallback retry logic
        let success = false;
        let attempts = 0;
        const maxAttempts = 3;
        let lastError = null;

        while (!success && attempts < maxAttempts) {
            attempts++;
            try {
                success = await dbManager.purchaseLotteryTickets(userId, guildId, ticketCount, totalCost);
                if (success) {
                    break;
                }
                
                // If not successful, wait before retry
                if (attempts < maxAttempts) {
                    logger.warn(`Lottery purchase attempt ${attempts} failed for user ${userId}, retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Increasing delay
                }
            } catch (error) {
                lastError = error;
                logger.error(`Lottery purchase attempt ${attempts} error: ${error.message}`);
                
                // Wait before retry on error
                if (attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
                }
            }
        }

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

            // Update lottery panel immediately after purchase
            try {
                const { updateLotteryPanel } = require('../UTILS/lottery');
                if (updateLotteryPanel) {
                    await updateLotteryPanel(interaction.client, guildId);
                    logger.info('Lottery panel updated after ticket purchase');
                }
            } catch (panelError) {
                logger.error(`Failed to update lottery panel after purchase: ${panelError.message}`);
            }

        } else {
            // All attempts failed
            logger.error(`Lottery purchase failed after ${maxAttempts} attempts for user ${userId}. Last error: ${lastError?.message || 'Unknown error'}`);
            
            const errorDescription = attempts >= maxAttempts 
                ? `Failed to process your ticket purchase after ${maxAttempts} attempts. Your balance has not been charged.`
                : 'Failed to process your ticket purchase. Your balance has not been charged.';
            
            const errorEmbed = UITemplates.createErrorEmbed('Lottery Purchase', {
                description: `${errorDescription}\n\n**What happened?**\nThere may be a temporary issue with the lottery system.\n\n**Next steps:**\n• Try again in a few moments\n• Contact support if this persists`,
                isLoss: false
            });

            // Log to admin channel for monitoring
            await sendLogMessage(
                interaction.client,
                'error',
                `Lottery purchase failed after ${maxAttempts} attempts: ${interaction.user.displayName} (${userId}) trying to buy ${ticketCount} tickets. Error: ${lastError?.message || 'Unknown'}`,
                userId,
                guildId
            );

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
            '🗓️ Bi-weekly drawings every Tuesday & Saturday at 10 AM EST',
            '🏆 Winner takes the entire prize pool',
            '📊 Higher ticket count = better winning odds',
            '💰 All ticket sales contribute to the prize pool'
        ];

        const rulesEmbed = UITemplates.createRulesEmbed('Bi-Weekly Lottery', rules);
        
        await interaction.reply({ embeds: [rulesEmbed], ephemeral: true });
    },

    // Helper method to get next Tuesday or Saturday at 10 AM EST timestamp
    getNextDrawingTimestamp() {
        const now = new Date();
        const estOffset = -5 * 60; // EST is UTC-5 in minutes
        const estTime = new Date(now.getTime() + (estOffset * 60 * 1000));
        
        const currentDay = estTime.getDay(); // 0 = Sunday, 1 = Monday, 2 = Tuesday, ..., 6 = Saturday
        const currentHour = estTime.getHours();
        
        // Drawing days: Tuesday (2) and Saturday (6)
        const drawingDays = [2, 6];
        let nextDrawing;
        
        // Check if today is a drawing day and it's before 10 AM
        if (drawingDays.includes(currentDay) && currentHour < 10) {
            // Today's drawing at 10 AM
            nextDrawing = new Date(estTime);
            nextDrawing.setHours(10, 0, 0, 0);
        } else {
            // Find next drawing day
            let daysAhead = 0;
            for (let i = 1; i <= 7; i++) {
                const futureDay = (currentDay + i) % 7;
                if (drawingDays.includes(futureDay)) {
                    daysAhead = i;
                    break;
                }
            }
            nextDrawing = new Date(estTime);
            nextDrawing.setDate(nextDrawing.getDate() + daysAhead);
            nextDrawing.setHours(10, 0, 0, 0);
        }
        
        // Convert back to UTC for timestamp
        const utcTimestamp = Math.floor((nextDrawing.getTime() - (estOffset * 60 * 1000)) / 1000);
        return utcTimestamp;
    }
};