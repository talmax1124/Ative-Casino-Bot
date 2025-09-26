/**
 * Purchase Tier 2 Lottery command for the casino bot
 * Allows users to buy tier 2 lottery tickets (1-10) at $200K each
 * HIGH STAKES VERSION: Premium tier with bigger prizes
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const UITemplates = require('../UTILS/uiTemplates');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purchaselottery2')
        .setDescription('Purchase Tier 2 lottery tickets - High stakes, bigger prizes!'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        try {
            // Show main tier 2 lottery purchase interface
            await this.showLottery2Interface(interaction, userId, guildId);

        } catch (error) {
            logger.error(`Error in purchaselottery2 command: ${error.message}`);
            
            const errorEmbed = UITemplates.createErrorEmbed('Tier 2 Lottery Purchase', {
                description: 'An error occurred while loading the tier 2 lottery interface. Please try again.',
                error: error.message
            });

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },

    async showLottery2Interface(interaction, userId, guildId) {
        // Ensure user exists in database
        await dbManager.ensureUser(userId, interaction.user.displayName);

        // Get current user data
        const balance = await dbManager.getUserBalance(userId, guildId);
        const currentTickets = await dbManager.getUserLotteryTickets(userId, guildId, 2); // Tier 2
        const lotteryInfo = await dbManager.getLotteryInfo(guildId, 2); // Tier 2
        
        const ticketPrice = 200000; // $200K per ticket
        const maxTickets = 10;
        const remainingTickets = maxTickets - currentTickets;
        
        // Calculate win probability and buyable tickets
        const totalTickets = lotteryInfo.total_tickets || 0;
        const winProbability = totalTickets > 0 ? ((currentTickets / totalTickets) * 100).toFixed(2) : "0.00";
        const maxBuyableNow = Math.min(remainingTickets, Math.floor(balance.wallet / ticketPrice));

        const embed = new EmbedBuilder()
            .setColor(UITemplates.getColors().PRIMARY_GAME)
            .setTitle('💎 Tier 2 High Stakes Lottery - Purchase Tickets')
            .setDescription('Buy premium lottery tickets for your chance to win the massive tier 2 prize pool!')
            .addFields(
                {
                    name: '💰 Your Balance',
                    value: `$${balance.wallet.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '🎟️ Your Tier 2 Tickets',
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
                    name: '💎 Tier 2 Prize Pool',
                    value: `$${(lotteryInfo.total_prize || 3000000).toLocaleString()}`,
                    inline: true
                },
                {
                    name: '🎫 Tier 2 Ticket Price',
                    value: `$${ticketPrice.toLocaleString()} each`,
                    inline: true
                }
            )
            .setFooter({
                text: "Casino Bot • Select tier 2 ticket quantity below",
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
        
        // Debug logging for button creation
        logger.debug(`Creating lottery2 buttons: currentTickets=${currentTickets}, remainingTickets=${remainingTickets}, balance=${balance}, ticketPrice=${ticketPrice}`);
        
        if (remainingTickets > 0) {
            // Calculate what user can actually afford and is allowed to buy
            const maxBuyable = Math.min(remainingTickets, Math.floor(balance / ticketPrice));
            
            logger.debug(`Lottery2 maxBuyable calculated: ${maxBuyable}`);
            
            if (maxBuyable > 0) {
                // First row: 1-5 tickets (or max buyable if less than 5)
                const ticketRow1 = new ActionRowBuilder();
                const firstRowMax = Math.min(maxBuyable, 5);
                
                for (let i = 1; i <= firstRowMax; i++) {
                    const cost = i * ticketPrice;
                    const canAfford = balance >= cost;
                    const withinLimit = (currentTickets + i) <= 10;
                    
                    ticketRow1.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`lottery2_buy_${i}`)
                            .setLabel(`${i} Ticket${i > 1 ? 's' : ''} ($${cost.toLocaleString()})`)
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('💎')
                            .setDisabled(!canAfford || !withinLimit)
                    );
                }
                components.push(ticketRow1);
                
                // Second row: 6-10 tickets if user can afford them and within limits
                if (maxBuyable > 5) {
                    const ticketRow2 = new ActionRowBuilder();
                    
                    for (let i = 6; i <= Math.min(maxBuyable, 10); i++) {
                        if (currentTickets + i <= 10) { // Only show if within total limit
                            const cost = i * ticketPrice;
                            const canAfford = balance >= cost;
                            const withinLimit = (currentTickets + i) <= 10;
                            
                            ticketRow2.addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`lottery2_buy_${i}`)
                                    .setLabel(`${i} Ticket${i > 1 ? 's' : ''} ($${cost.toLocaleString()})`)
                                    .setStyle(ButtonStyle.Primary)
                                    .setEmoji('💎')
                                    .setDisabled(!canAfford || !withinLimit)
                            );
                        }
                    }
                    
                    // Only add second row if it has buttons
                    if (ticketRow2.components.length > 0) {
                        // Fill remaining slots with empty disabled buttons for better layout
                        while (ticketRow2.components.length < 2) {
                            ticketRow2.addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`lottery2_empty_${ticketRow2.components.length}`)
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
                        .setCustomId('lottery2_view_tickets')
                        .setLabel('View My Tier 2 Tickets')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📋'),
                    new ButtonBuilder()
                        .setCustomId('lottery2_rules')
                        .setLabel('Tier 2 Rules')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📖'),
                    new ButtonBuilder()
                        .setCustomId('lottery2_cancel')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('❌')
                );

            components.push(actionRow);
        } else if (maxBuyable <= 0 && remainingTickets > 0) {
            // User cannot afford any tickets but could still buy some - show info
            logger.debug(`Lottery2: User has remaining tickets (${remainingTickets}) but cannot afford any (maxBuyable=${maxBuyable})`);
            
            const cantAffordRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('lottery2_view_tickets')
                        .setLabel('View My Tier 2 Tickets')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📋'),
                    new ButtonBuilder()
                        .setCustomId('lottery2_rules')
                        .setLabel('Tier 2 Rules')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📖'),
                    new ButtonBuilder()
                        .setCustomId('lottery2_cancel')
                        .setLabel('Close')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('❌')
                );
            
            components.push(cantAffordRow);
        } else {
            // User has maximum tickets
            const maxRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('lottery2_view_tickets')
                        .setLabel('View My Tier 2 Tickets')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📋'),
                    new ButtonBuilder()
                        .setCustomId('lottery2_rules')
                        .setLabel('Tier 2 Rules')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📖'),
                    new ButtonBuilder()
                        .setCustomId('lottery2_cancel')
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
            // Handle interaction timeout/expiration
            if (interaction.message && interaction.message.createdTimestamp) {
                const messageAge = Date.now() - interaction.message.createdTimestamp;
                if (messageAge > 15 * 60 * 1000) { // 15 minutes
                    return await interaction.reply({ 
                        content: '⏰ This tier 2 lottery interface has expired. Please use `/purchaselottery2` to open a new one.', 
                        ephemeral: true 
                    });
                }
            }

            if (action.startsWith('buy_')) {
                const ticketCountStr = action.split('_')[1];
                const ticketCount = parseInt(ticketCountStr);
                
                // Validate ticket count is a valid number
                if (isNaN(ticketCount) || ticketCount < 1 || ticketCount > 10) {
                    logger.error(`Invalid ticket count parsed from action: ${action}, parsed as: ${ticketCount}`);
                    const errorEmbed = UITemplates.createErrorEmbed('Tier 2 Lottery Purchase', {
                        description: 'Invalid ticket quantity specified. Please try again.',
                        error: `Received invalid ticket count: ${ticketCountStr}`
                    });
                    return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
                
                await this.purchaseTickets(interaction, userId, guildId, ticketCount);
            } else if (action === 'view_tickets') {
                await this.showUserTickets(interaction, userId, guildId);
            } else if (action === 'rules') {
                await this.showLottery2Rules(interaction);
            } else if (action === 'cancel') {
                const embed = new EmbedBuilder()
                    .setColor(UITemplates.getColors().INFO)
                    .setTitle('💎 Tier 2 Lottery Purchase Cancelled')
                    .setDescription('You can purchase tier 2 tickets anytime before the weekly drawing!')
                    .setTimestamp();

                await interaction.update({
                    embeds: [embed],
                    components: []
                });
            }
        } catch (error) {
            logger.error(`Error handling lottery2 button: ${error.message}`);
            
            // Handle specific Discord interaction errors
            if (error.code === 10062 || error.message.includes('Unknown interaction')) {
                logger.debug('Lottery2 interaction expired or unknown, ignoring');
                return;
            }

            const errorEmbed = UITemplates.createErrorEmbed('Tier 2 Lottery', {
                description: 'An error occurred while processing your request.',
                error: error.message
            });

            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
            } catch (followUpError) {
                logger.error(`Failed to send tier 2 error response: ${followUpError.message}`);
            }
        }
    },

    async purchaseTickets(interaction, userId, guildId, ticketCount) {
        // Additional validation at function entry
        if (isNaN(ticketCount) || ticketCount < 1 || ticketCount > 10) {
            logger.error(`Invalid ticket count in purchaseTickets: ${ticketCount}`);
            const embed = UITemplates.createErrorEmbed('Tier 2 Lottery Purchase', {
                description: 'Invalid ticket quantity. Please select a valid number of tickets (1-10).',
                isLoss: false
            });
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        const ticketPrice = 200000; // $200K per ticket
        const totalCost = ticketCount * ticketPrice;
        
        // Validate totalCost is not NaN
        if (isNaN(totalCost)) {
            logger.error(`Total cost calculation resulted in NaN: ticketCount=${ticketCount}, ticketPrice=${ticketPrice}`);
            const embed = UITemplates.createErrorEmbed('Tier 2 Lottery Purchase', {
                description: 'Error calculating ticket cost. Please try again.',
                isLoss: false
            });
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Get current user data
        const balance = await dbManager.getUserBalance(userId, guildId);
        const currentTickets = await dbManager.getUserLotteryTickets(userId, guildId, 2); // Tier 2

        // Validation checks
        if (currentTickets + ticketCount > 10) {
            const embed = UITemplates.createErrorEmbed('Tier 2 Lottery Purchase', {
                description: `You can only buy a maximum of **10 tier 2 tickets per week**.\n\n**Current Tickets:** ${currentTickets}\n**Can Still Buy:** ${10 - currentTickets} more tickets`,
                isLoss: false
            });

            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (balance.wallet < totalCost) {
            const embed = UITemplates.createInsufficientBalanceEmbed(totalCost, balance.wallet);
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Show loading state
        const loadingEmbed = UITemplates.createLoadingEmbed('Tier 2 Lottery', 'Processing tier 2 purchase');
        await interaction.update({ embeds: [loadingEmbed], components: [] });

        // Process the purchase with fallback retry logic
        let success = false;
        let attempts = 0;
        const maxAttempts = 3;
        let lastError = null;

        while (!success && attempts < maxAttempts) {
            attempts++;
            try {
                success = await dbManager.purchaseLotteryTickets(userId, guildId, ticketCount, totalCost, 2); // Tier 2
                if (success) {
                    break;
                }
                
                // If not successful, wait before retry
                if (attempts < maxAttempts) {
                    logger.warn(`Tier 2 lottery purchase attempt ${attempts} failed for user ${userId}, retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Increasing delay
                }
            } catch (error) {
                lastError = error;
                logger.error(`Tier 2 lottery purchase attempt ${attempts} error: ${error.message}`);
                
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
            const lotteryInfo = await dbManager.getLotteryInfo(guildId, 2); // Tier 2
            const totalTickets = lotteryInfo.total_tickets || 0;
            const winProbability = totalTickets > 0 ? ((newTicketCount / totalTickets) * 100).toFixed(2) : "0.00";

            const successEmbed = UITemplates.createSuccessEmbed('Tier 2 Lottery Purchase', {
                description: `✅ Successfully purchased **${ticketCount}** tier 2 lottery ticket${ticketCount > 1 ? 's' : ''}!`,
                winAmount: null,
                newBalance: newBalance
            });

            successEmbed.addFields(
                {
                    name: '💳 Purchase Details',
                    value: `**Tier 2 Tickets Bought:** ${ticketCount}\n**Cost per Ticket:** $${ticketPrice.toLocaleString()}\n**Total Cost:** $${totalCost.toLocaleString()}`,
                    inline: false
                },
                {
                    name: '🎟️ Your Tier 2 Lottery Status',
                    value: `**Your Tickets:** ${newTicketCount}/10\n**Win Probability:** ${winProbability}%\n${newTicketCount >= 10 ? '🔥 **Maximum tier 2 tickets reached!**' : `💰 Can buy **${10 - newTicketCount} more** tickets`}`,
                    inline: false
                },
                {
                    name: '💎 Tier 2 Prize Pool',
                    value: `$${(lotteryInfo.total_prize || 3000000).toLocaleString()}`,
                    inline: true
                }
            );

            await interaction.editReply({ embeds: [successEmbed], components: [] });

            // Log the purchase
            await sendLogMessage(
                interaction.client,
                'economy',
                `Tier 2 Lottery Purchase: ${interaction.user.displayName} bought ${ticketCount} tier 2 tickets for $${totalCost.toLocaleString()} (now has ${newTicketCount}/10 tickets)`,
                userId,
                guildId
            );

            // Update lottery panel immediately after purchase
            try {
                const { updateLotteryPanel } = require('../UTILS/lottery');
                if (updateLotteryPanel) {
                    await updateLotteryPanel(interaction.client, guildId);
                    logger.info('Lottery panel updated after tier 2 ticket purchase');
                }
            } catch (panelError) {
                logger.error(`Failed to update lottery panel after tier 2 purchase: ${panelError.message}`);
            }

        } else {
            // All attempts failed
            logger.error(`Tier 2 lottery purchase failed after ${maxAttempts} attempts for user ${userId}. Last error: ${lastError?.message || 'Unknown error'}`);
            
            const errorDescription = attempts >= maxAttempts 
                ? `Failed to process your tier 2 ticket purchase after ${maxAttempts} attempts. Your balance has not been charged.`
                : 'Failed to process your tier 2 ticket purchase. Your balance has not been charged.';
            
            const errorEmbed = UITemplates.createErrorEmbed('Tier 2 Lottery Purchase', {
                description: `${errorDescription}\n\n**What happened?**\nThere may be a temporary issue with the tier 2 lottery system.\n\n**Next steps:**\n• Try again in a few moments\n• Contact support if this persists`,
                isLoss: false
            });

            // Log to admin channel for monitoring
            await sendLogMessage(
                interaction.client,
                'error',
                `Tier 2 lottery purchase failed after ${maxAttempts} attempts: ${interaction.user.displayName} (${userId}) trying to buy ${ticketCount} tickets. Error: ${lastError?.message || 'Unknown'}`,
                userId,
                guildId
            );

            await interaction.editReply({ embeds: [errorEmbed], components: [] });
        }
    },

    async showUserTickets(interaction, userId, guildId) {
        const currentTickets = await dbManager.getUserLotteryTickets(userId, guildId, 2); // Tier 2
        const lotteryInfo = await dbManager.getLotteryInfo(guildId, 2); // Tier 2
        const totalTickets = lotteryInfo.total_tickets || 0;
        const winProbability = totalTickets > 0 ? ((currentTickets / totalTickets) * 100).toFixed(2) : "0.00";

        const embed = new EmbedBuilder()
            .setColor(UITemplates.getColors().INFO)
            .setTitle('🎟️ Your Tier 2 Lottery Tickets')
            .addFields(
                {
                    name: 'Current Tier 2 Tickets',
                    value: `${currentTickets}/10`,
                    inline: true
                },
                {
                    name: 'Win Probability',
                    value: `${winProbability}%`,
                    inline: true
                },
                {
                    name: 'Tier 2 Prize Pool',
                    value: `$${(lotteryInfo.total_prize || 3000000).toLocaleString()}`,
                    inline: true
                }
            )
            .setFooter({ text: 'Good luck in the high stakes drawing!' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async showLottery2Rules(interaction) {
        const rules = [
            '💎 Purchase 1-10 tier 2 tickets per week for $200,000 each',
            '🗓️ Bi-weekly drawings every Tuesday & Saturday at 10 AM EST',
            '🏆 Winner takes the entire tier 2 prize pool',
            '📊 Higher ticket count = better winning odds',
            '💰 All tier 2 ticket sales contribute to the tier 2 prize pool'
        ];

        const rulesEmbed = UITemplates.createRulesEmbed('Tier 2 High Stakes Lottery', rules);
        
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