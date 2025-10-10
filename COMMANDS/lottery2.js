/**
 * Tier 2 Lottery status command for the casino bot
 * Shows player's tier 2 lottery status, win probability, money, tickets purchased, etc.
 * TIER 2 LOTTERY: Higher stakes, bigger prizes
 */

const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const UITemplates = require('../UTILS/uiTemplates');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lottery2')
        .setDescription('Check your Tier 2 lottery status - High stakes, bigger prizes!'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        try {
            await dbManager.ensureUser(userId, interaction.user.displayName);
            
            // Show main tier 2 lottery interface
            await this.showLottery2MainPanel(interaction, userId, guildId);
            
        } catch (error) {
            logger.error(`Lottery2 status command error: ${error.message}`);
            
            const errorEmbed = UITemplates.createErrorEmbed('Tier 2 Lottery', {
                description: 'An error occurred while loading the tier 2 lottery information.',
                error: error.message
            });
            
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    },

    async showLottery2MainPanel(interaction, userId, guildId) {
        const userBalance = await dbManager.getUserBalance(userId, guildId);
        const userTickets = await dbManager.getUserLotteryTickets(userId, guildId, 2); // Tier 2
        const lotteryInfo = await dbManager.getLotteryInfo(guildId, 2); // Tier 2
        
        // Create standardized game embed for tier 2
        const gameOptions = {
            minBet: 200000, // $200K per ticket
            maxBet: null,
            wins: 0,
            losses: 0,
            botAvatar: interaction.client.user.displayAvatarURL()
        };

        const embed = UITemplates.createStandardGameEmbed(
            '💎 Tier 2 High Stakes Lottery',
            'Premium lottery with massive prize pools! Drawings every Tuesday & Saturday at 10 AM EST. Higher cost, bigger rewards!',
            userBalance.wallet,
            gameOptions
        );

        // Replace default fields with tier 2 lottery-specific information
        embed.spliceFields(0, 3); // Remove default fields
        
        embed.addFields(
            {
                name: `${UITemplates.getEmojis().BALANCE} Your Balance`,
                value: `$${userBalance.wallet.toLocaleString()}`,
                inline: true
            },
            {
                name: '🎟️ Your Tier 2 Tickets',
                value: `${userTickets}/10 tickets`,
                inline: true
            },
            {
                name: '🎯 Win Probability',
                value: `${this.calculateWinProbability(userTickets, lotteryInfo.total_tickets || 0)}%`,
                inline: true
            },
            {
                name: '💎 Tier 2 Prize Pool',
                value: `$${(lotteryInfo.total_prize || 3000000).toLocaleString()}`,
                inline: true
            },
            {
                name: '🎫 Tier 2 Ticket Price',
                value: '$200,000 each',
                inline: true
            },
            {
                name: '📊 Total Tier 2 Tickets Sold',
                value: `${(lotteryInfo.total_tickets || 0).toLocaleString()}`,
                inline: true
            },
            {
                name: '⏰ Next Drawing',
                value: `<t:${this.getNextDrawingTimestamp()}:F>\n<t:${this.getNextDrawingTimestamp()}:R>`,
                inline: false
            }
        );

        // Create standardized buttons
        const components = UITemplates.createStandardButtons('lottery2', {
            showStats: userTickets > 0
        });

        // Customize buttons for tier 2 lottery
        components[0].components[0] // Play Game button
            .setLabel('🎫 Buy Tier 2 Tickets')
            .setCustomId('lottery2_buy_tickets');
            
        components[0].components[1] // How to Play button  
            .setLabel('📖 Tier 2 Rules')
            .setCustomId('lottery2_rules');
            
        components[0].components[2] // Your Stats button
            .setLabel('🎟️ My Tier 2 Tickets')
            .setCustomId('lottery2_my_tickets')
            .setDisabled(userTickets === 0);

        components[1].components[0] // Leaderboard button
            .setLabel('🏆 Tier 2 Prize Breakdown')
            .setCustomId('lottery2_prizes');

        await interaction.reply({
            embeds: [embed],
            components: components
        });
    },

    calculateWinProbability(userTickets, totalTickets) {
        if (totalTickets === 0 || userTickets === 0) return '0.00';
        return ((userTickets / totalTickets) * 100).toFixed(2);
    },

    async handleButtonInteraction(interaction, action) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        try {
            // Handle purchase actions
            if (action.startsWith('purchase_')) {
                const amount = parseInt(action.substring('purchase_'.length));
                await this.processPurchase(interaction, userId, guildId, amount);
                return;
            }
            
            // Handle cancel from purchase screen
            if (action === 'cancel') {
                await this.showLottery2MainPanel(interaction, userId, guildId);
                return;
            }

            switch (action) {
                case 'buy_tickets':
                    // Defer the update first to prevent interaction timeout
                    await interaction.deferUpdate();
                    // Handle purchase directly
                    await this.showPurchaseInterface(interaction, userId, guildId);
                    break;

                case 'rules':
                    await this.showLottery2Rules(interaction);
                    break;

                case 'my_tickets':
                    await this.showUserTickets(interaction, userId, guildId);
                    break;

                case 'prizes':
                    await this.showPrizeBreakdown(interaction, guildId);
                    break;

                case 'cancel_game':
                    const embed = UITemplates.createTimeoutEmbed('Tier 2 Lottery');
                    await interaction.update({ embeds: [embed], components: [] });
                    break;

                default:
                    logger.warn(`Unknown lottery2 action: ${action}`);
            }
        } catch (error) {
            logger.error(`Error handling lottery2 button: ${error.message}`);
            
            const errorEmbed = UITemplates.createErrorEmbed('Tier 2 Lottery', {
                description: 'An error occurred while processing your request.',
                error: error.message
            });

            // Check if we can reply or need to follow up
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },

    async showLottery2Rules(interaction) {
        const rules = [
            '🎟️ Purchase 1-10 tier 2 lottery tickets per week for $200,000 each',
            '🗓️ Bi-weekly drawings every Tuesday & Saturday at 10 AM EST',
            '🏆 Winner takes the entire prize pool',
            '📊 More tickets = better odds of winning',
            '💰 All ticket sales contribute to the prize pool',
            '🏦 Prize money is automatically deposited to your bank account'
        ];

        const payouts = {
            'Ticket Cost': '$200,000 per ticket',
            'Max Tickets': '10 tickets per player per week',
            'Base Prize Pool': '$3,000,000 minimum',
            'Max Prize Pool': '$20,000,000 maximum',
            'Winner Selection': 'Random draw from all tickets'
        };

        const rulesEmbed = UITemplates.createRulesEmbed('Tier 2 High Stakes Lottery', rules, payouts);
        await interaction.reply({ embeds: [rulesEmbed], ephemeral: true });
    },

    async showUserTickets(interaction, userId, guildId) {
        const userTickets = await dbManager.getUserLotteryTickets(userId, guildId, 2); // Tier 2
        const lotteryInfo = await dbManager.getLotteryInfo(guildId, 2); // Tier 2
        
        if (userTickets === 0) {
            const embed = UITemplates.createErrorEmbed('Tier 2 Lottery Tickets', {
                description: 'You don\'t have any tier 2 lottery tickets yet!\n\nUse the "Buy Tier 2 Tickets" button to purchase high-stakes tickets for the weekly drawing.',
                isLoss: false
            });
            
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const totalTickets = lotteryInfo.total_tickets || 0;
        const winProbability = this.calculateWinProbability(userTickets, totalTickets);

        const embed = new EmbedBuilder()
            .setColor(UITemplates.getColors().INFO)
            .setTitle('🎟️ Your Tier 2 Lottery Tickets')
            .setDescription('Here\'s your tier 2 ticket information for this week\'s drawing:')
            .addFields(
                {
                    name: 'Your Tier 2 Tickets',
                    value: `${userTickets}/10 tickets purchased`,
                    inline: true
                },
                {
                    name: 'Win Probability', 
                    value: `${winProbability}%`,
                    inline: true
                },
                {
                    name: 'Investment',
                    value: `$${(userTickets * 200000).toLocaleString()}`,
                    inline: true
                },
                {
                    name: 'Prize Pool',
                    value: `$${(lotteryInfo.total_prize || 3000000).toLocaleString()}`,
                    inline: true
                },
                {
                    name: 'Remaining Tickets',
                    value: `${10 - userTickets} more you can buy`,
                    inline: true
                },
                {
                    name: 'Drawing Time',
                    value: `<t:${this.getNextDrawingTimestamp()}:R>`,
                    inline: true
                }
            )
            .setFooter({ text: '🍀 Good luck in the high stakes drawing!' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async showPrizeBreakdown(interaction, guildId) {
        const lotteryInfo = await dbManager.getLotteryInfo(guildId, 2); // Tier 2
        const prizePool = lotteryInfo.total_prize || 3000000;
        const totalTickets = lotteryInfo.total_tickets || 0;

        const embed = new EmbedBuilder()
            .setColor(UITemplates.getColors().PRIMARY_GAME)
            .setTitle('🏆 Tier 2 High Stakes Lottery Prize Information')
            .setDescription('Premium tier prize pool breakdown and drawing details:')
            .addFields(
                {
                    name: '💰 Total Prize Pool',
                    value: `$${prizePool.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '🎫 Total Tier 2 Tickets Sold',
                    value: `${totalTickets.toLocaleString()} tickets`,
                    inline: true
                },
                {
                    name: '🎯 Winner Takes All',
                    value: 'One lucky winner gets 100% of the prize pool!',
                    inline: true
                },
                {
                    name: '🗓️ Drawing Schedule',
                    value: 'Every Tuesday & Saturday at 10:00 AM EST',
                    inline: true
                },
                {
                    name: '💳 Prize Payment',
                    value: 'Automatically deposited to winner\'s bank account',
                    inline: true
                },
                {
                    name: '⏰ Next Drawing',
                    value: `<t:${this.getNextDrawingTimestamp()}:F>`,
                    inline: true
                }
            )
            .setFooter({ text: 'High stakes, high rewards!' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    // Helper method to get next Tuesday/Saturday drawing at 10 AM EST timestamp  
    getNextDrawingTimestamp() {
        const moment = require('moment-timezone');
        const nowNY = moment.tz('America/New_York');
        const currentDay = nowNY.day(); // 0=Sunday, 1=Monday, 2=Tuesday, ..., 6=Saturday
        const currentHour = nowNY.hour();
        
        // Drawing days: Tuesday (2) and Saturday (6)
        const drawingDays = [2, 6]; // Tuesday and Saturday
        let nextDrawing = null;
        
        // Check if today is a drawing day and it's before 10 AM
        if (drawingDays.includes(currentDay) && currentHour < 10) {
            // Today's drawing at 10 AM
            nextDrawing = nowNY.clone().hour(10).minute(0).second(0).millisecond(0);
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
            nextDrawing = nowNY.clone().add(daysAhead, 'days').hour(10).minute(0).second(0).millisecond(0);
        }
        
        return nextDrawing.tz('UTC').unix();
    },

    async processPurchase(interaction, userId, guildId, amount) {
        await interaction.deferUpdate();
        
        try {
            const ticketPrice = 200000; // $200K per ticket
            const totalCost = ticketPrice * amount;
            
            // Get current balance and tickets
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            const userTickets = await dbManager.getUserLotteryTickets(userId, guildId, 2); // Tier 2
            const currentTickets = userTickets ? userTickets.length : 0;
            
            // Validate purchase
            if (userBalance.wallet < totalCost) {
                const embed = new EmbedBuilder()
                    .setColor(UITemplates.getColors().ERROR)
                    .setTitle('💸 Insufficient Funds')
                    .setDescription(`You don't have enough money to purchase ${amount} ticket${amount > 1 ? 's' : ''}.`)
                    .addFields(
                        { name: 'Cost', value: fmt(totalCost), inline: true },
                        { name: 'Your Balance', value: fmt(userBalance.wallet), inline: true },
                        { name: 'Needed', value: fmt(totalCost - userBalance.wallet), inline: true }
                    );
                
                await interaction.editReply({ embeds: [embed], components: [] });
                return;
            }
            
            if (currentTickets + amount > 10) {
                const embed = new EmbedBuilder()
                    .setColor(UITemplates.getColors().ERROR)
                    .setTitle('🎟️ Too Many Tickets')
                    .setDescription(`You can only have a maximum of 10 tier 2 lottery tickets.`)
                    .addFields(
                        { name: 'Current Tickets', value: `${currentTickets}`, inline: true },
                        { name: 'Trying to Buy', value: `${amount}`, inline: true },
                        { name: 'Maximum Allowed', value: '10', inline: true }
                    );
                
                await interaction.editReply({ embeds: [embed], components: [] });
                return;
            }
            
            // Process the purchase
            const newBalance = userBalance.wallet - totalCost;
            await dbManager.setUserBalance(userId, guildId, newBalance, userBalance.bank);
            
            // Add tickets to database
            for (let i = 0; i < amount; i++) {
                await dbManager.purchaseLotteryTicket(userId, guildId, 2); // Tier 2
            }
            
            // Update prize pool
            await dbManager.addToLotteryPrize(guildId, totalCost, 2); // Tier 2
            
            // Get updated lottery info
            const lotteryInfo = await dbManager.getLotteryInfo(guildId, 2); // Tier 2
            
            // Success embed
            const embed = new EmbedBuilder()
                .setColor(UITemplates.getColors().SUCCESS)
                .setTitle('🎟️ Tier 2 Lottery Tickets Purchased!')
                .setDescription(`You successfully purchased ${amount} tier 2 lottery ticket${amount > 1 ? 's' : ''}!`)
                .addFields(
                    { name: '🎫 Tickets Bought', value: `${amount} tickets`, inline: true },
                    { name: '💵 Total Cost', value: fmt(totalCost), inline: true },
                    { name: '💰 New Balance', value: fmt(newBalance), inline: true },
                    { name: '🎟️ Your Total Tickets', value: `${currentTickets + amount}`, inline: true },
                    { name: '🏆 Prize Pool', value: fmt(lotteryInfo.total_prize || 3000000), inline: true },
                    { name: '⏰ Next Drawing', value: `<t:${this.getNextDrawingTimestamp()}:R>`, inline: true }
                )
                .setFooter({ text: '🍀 Good luck in the tier 2 drawing!' });
            
            // Add back to lottery button
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('lottery2_buy_tickets')
                        .setLabel('Buy More Tickets')
                        .setEmoji('🎟️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentTickets + amount >= 10),
                    new ButtonBuilder()
                        .setCustomId('lottery2_my_tickets')
                        .setLabel('My Tickets')
                        .setEmoji('📋')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            await interaction.editReply({ embeds: [embed], components: [row] });
            
            // Log the purchase
            await sendLogMessage(
                `🎰 **Tier 2 Lottery Purchase**: ${interaction.user.username} bought ${amount} ticket${amount > 1 ? 's' : ''} for ${fmt(totalCost)}\n` +
                `Prize pool: ${fmt(lotteryInfo.total_prize || 3000000)}`,
                guildId
            );
            
        } catch (error) {
            logger.error(`Error processing tier 2 lottery purchase: ${error.message}`);
            const errorEmbed = UITemplates.createErrorEmbed('Purchase Failed', {
                description: 'Failed to complete your ticket purchase',
                error: error.message
            });
            await interaction.editReply({ embeds: [errorEmbed], components: [] });
        }
    },

    async showPurchaseInterface(interaction, userId, guildId) {
        try {
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            const userTickets = await dbManager.getUserLotteryTickets(userId, guildId, 2); // Tier 2
            const lotteryInfo = await dbManager.getLotteryInfo(guildId, 2); // Tier 2
            
            const ticketPrice = 200000; // $200K per ticket
            const maxTickets = 10;
            const currentTickets = userTickets ? userTickets.length : 0;
            const availableTickets = maxTickets - currentTickets;
            
            if (availableTickets <= 0) {
                const embed = new EmbedBuilder()
                    .setColor(UITemplates.getColors().ERROR)
                    .setTitle('🎟️ Maximum Tickets Reached')
                    .setDescription('You have already purchased the maximum of 10 tickets for this tier 2 lottery draw.')
                    .addFields(
                        { name: 'Your Tickets', value: `${currentTickets}/${maxTickets}`, inline: true },
                        { name: 'Next Drawing', value: `<t:${this.getNextDrawingTimestamp()}:R>`, inline: true }
                    );
                
                await interaction.editReply({ embeds: [embed], components: [] });
                return;
            }
            
            const affordableTickets = Math.min(Math.floor(userBalance.wallet / ticketPrice), availableTickets);
            
            if (affordableTickets <= 0) {
                const embed = new EmbedBuilder()
                    .setColor(UITemplates.getColors().ERROR)
                    .setTitle('💸 Insufficient Funds')
                    .setDescription(`You need at least ${fmt(ticketPrice)} to purchase a tier 2 lottery ticket.`)
                    .addFields(
                        { name: 'Your Balance', value: fmt(userBalance.wallet), inline: true },
                        { name: 'Ticket Price', value: fmt(ticketPrice), inline: true },
                        { name: 'Needed', value: fmt(ticketPrice - userBalance.wallet), inline: true }
                    );
                
                await interaction.editReply({ embeds: [embed], components: [] });
                return;
            }
            
            // Create purchase buttons
            const buttons = [];
            const rows = [];
            
            // Create buttons for different ticket amounts
            const ticketAmounts = [1, 2, 5, 10].filter(amt => amt <= affordableTickets);
            
            for (const amount of ticketAmounts) {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`lottery2_purchase_${amount}`)
                        .setLabel(`Buy ${amount} Ticket${amount > 1 ? 's' : ''}`)
                        .setEmoji('🎟️')
                        .setStyle(ButtonStyle.Primary)
                );
            }
            
            // Add cancel button
            buttons.push(
                new ButtonBuilder()
                    .setCustomId('lottery2_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );
            
            // Create action rows (max 5 buttons per row)
            for (let i = 0; i < buttons.length; i += 5) {
                rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, Math.min(i + 5, buttons.length))));
            }
            
            const embed = new EmbedBuilder()
                .setColor(UITemplates.getColors().PRIMARY_GAME)
                .setTitle('🎰 Purchase Tier 2 Lottery Tickets')
                .setDescription('Select how many tier 2 tickets you want to purchase:')
                .addFields(
                    { name: '💵 Your Balance', value: fmt(userBalance.wallet), inline: true },
                    { name: '🎟️ Ticket Price', value: fmt(ticketPrice), inline: true },
                    { name: '📊 Max Affordable', value: `${affordableTickets} tickets`, inline: true },
                    { name: '🎫 Current Tickets', value: `${currentTickets}/${maxTickets}`, inline: true },
                    { name: '💰 Prize Pool', value: fmt(lotteryInfo.total_prize || 3000000), inline: true },
                    { name: '⏰ Next Drawing', value: `<t:${this.getNextDrawingTimestamp()}:R>`, inline: true }
                );
            
            await interaction.editReply({ embeds: [embed], components: rows });
            
        } catch (error) {
            logger.error(`Error showing tier 2 purchase interface: ${error.message}`);
            const errorEmbed = UITemplates.createErrorEmbed('Purchase Error', {
                description: 'Failed to load purchase interface',
                error: error.message
            });
            await interaction.editReply({ embeds: [errorEmbed], components: [] });
        }
    }
};