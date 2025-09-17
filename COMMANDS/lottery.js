/**
 * Lottery status command for the casino bot
 * Shows player's lottery status, win probability, money, tickets purchased, etc.
 * STANDARDIZED: Updated to use unified UI templates
 */

const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const UITemplates = require('../UTILS/uiTemplates');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lottery')
        .setDescription('Check your lottery status, win probability, and ticket information'),

    async execute(interaction) {
        // Disable lottery in development environment
        if (process.env.ENVIRONMENT === 'development' || process.env.NODE_ENV === 'development') {
            const embed = new EmbedBuilder()
                .setTitle('🚫 Lottery Disabled')
                .setDescription('Lottery system is disabled in development mode.')
                .setColor(0xFF4444);
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        try {
            await dbManager.ensureUser(userId, interaction.user.displayName);
            
            // Show main lottery interface using standardized template
            await this.showLotteryMainPanel(interaction, userId, guildId);
            
        } catch (error) {
            logger.error(`Lottery status command error: ${error.message}`);
            
            const errorEmbed = UITemplates.createErrorEmbed('Lottery', {
                description: 'An error occurred while loading the lottery information.',
                error: error.message
            });
            
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    },

    async showLotteryMainPanel(interaction, userId, guildId) {
        const userBalance = await dbManager.getUserBalance(userId, guildId);
        const userTickets = await dbManager.getUserLotteryTickets(userId, guildId);
        const lotteryInfo = await dbManager.getLotteryInfo(guildId);
        
        // Create standardized game embed
        const gameOptions = {
            minBet: 12000,
            maxBet: null, // No max bet limit
            wins: 0, // Lottery doesn't track individual wins
            losses: 0,
            botAvatar: interaction.client.user.displayAvatarURL()
        };

        const embed = UITemplates.createStandardGameEmbed(
            'Bi-Weekly Lottery',
            'Buy lottery tickets for your chance to win the bi-weekly prize pool! Drawings every Tuesday & Saturday at 10 AM EST.',
            userBalance.wallet,
            gameOptions
        );

        // Replace default fields with lottery-specific information
        embed.spliceFields(0, 3); // Remove default fields
        
        embed.addFields(
            {
                name: `${UITemplates.getEmojis().BALANCE} Your Balance`,
                value: `$${userBalance.wallet.toLocaleString()}`,
                inline: true
            },
            {
                name: '🎟️ Your Tickets',
                value: `${userTickets}/7 tickets`,
                inline: true
            },
            {
                name: '🎯 Win Probability',
                value: `${this.calculateWinProbability(userTickets, lotteryInfo.total_tickets || 0)}%`,
                inline: true
            },
            {
                name: '💎 Prize Pool',
                value: `$${(lotteryInfo.total_prize || 400000).toLocaleString()}`,
                inline: true
            },
            {
                name: '🎫 Ticket Price',
                value: '$12,000 each',
                inline: true
            },
            {
                name: '📊 Total Tickets Sold',
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
        const components = UITemplates.createStandardButtons('lottery', {
            showStats: userTickets > 0
        });

        // Customize buttons for lottery
        components[0].components[0] // Play Game button
            .setLabel('🎫 Buy Tickets')
            .setCustomId('lottery_buy_tickets');
            
        components[0].components[1] // How to Play button  
            .setLabel('📖 How Lottery Works')
            .setCustomId('lottery_rules');
            
        components[0].components[2] // Your Stats button
            .setLabel('🎟️ My Tickets')
            .setCustomId('lottery_my_tickets')
            .setDisabled(userTickets === 0);

        components[1].components[0] // Leaderboard button
            .setLabel('🏆 Prize Breakdown')
            .setCustomId('lottery_prizes');

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
            switch (action) {
                case 'buy_tickets':
                    // Redirect to purchaselottery command
                    const purchaseCommand = require('./purchaselottery');
                    await purchaseCommand.showLotteryInterface(interaction, userId, guildId);
                    break;

                case 'rules':
                    await this.showLotteryRules(interaction);
                    break;

                case 'my_tickets':
                    await this.showUserTickets(interaction, userId, guildId);
                    break;

                case 'prizes':
                    await this.showPrizeBreakdown(interaction, guildId);
                    break;

                case 'cancel_game':
                    const embed = UITemplates.createTimeoutEmbed('Lottery');
                    await interaction.update({ embeds: [embed], components: [] });
                    break;

                default:
                    logger.warn(`Unknown lottery action: ${action}`);
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

    async showLotteryRules(interaction) {
        const rules = [
            '🎟️ Purchase 1-7 lottery tickets per week for $12,000 each',
            '🗓️ Bi-weekly drawings every Tuesday & Saturday at 10 AM EST',
            '🏆 Winner takes the entire prize pool',
            '📊 More tickets = better odds of winning',
            '💰 All ticket sales contribute to the prize pool',
            '🏦 Prize money is automatically deposited to your bank account'
        ];

        const payouts = {
            'Ticket Cost': '$12,000 per ticket',
            'Max Tickets': '7 tickets per player per week',
            'Prize Pool': 'All ticket sales combined',
            'Winner Selection': 'Random draw from all tickets'
        };

        const rulesEmbed = UITemplates.createRulesEmbed('Weekly Lottery', rules, payouts);
        await interaction.reply({ embeds: [rulesEmbed], ephemeral: true });
    },

    async showUserTickets(interaction, userId, guildId) {
        const userTickets = await dbManager.getUserLotteryTickets(userId, guildId);
        const lotteryInfo = await dbManager.getLotteryInfo(guildId);
        
        if (userTickets === 0) {
            const embed = UITemplates.createErrorEmbed('Lottery Tickets', {
                description: 'You don\'t have any lottery tickets yet!\n\nUse the "Buy Tickets" button to purchase tickets for the weekly drawing.',
                isLoss: false
            });
            
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const totalTickets = lotteryInfo.total_tickets || 0;
        const winProbability = this.calculateWinProbability(userTickets, totalTickets);

        const embed = new EmbedBuilder()
            .setColor(UITemplates.getColors().INFO)
            .setTitle('🎟️ Your Lottery Tickets')
            .setDescription('Here\'s your ticket information for this week\'s drawing:')
            .addFields(
                {
                    name: 'Your Tickets',
                    value: `${userTickets}/7 tickets purchased`,
                    inline: true
                },
                {
                    name: 'Win Probability', 
                    value: `${winProbability}%`,
                    inline: true
                },
                {
                    name: 'Investment',
                    value: `$${(userTickets * 12000).toLocaleString()}`,
                    inline: true
                },
                {
                    name: 'Prize Pool',
                    value: `$${(lotteryInfo.total_prize || 400000).toLocaleString()}`,
                    inline: true
                },
                {
                    name: 'Remaining Tickets',
                    value: `${7 - userTickets} more you can buy`,
                    inline: true
                },
                {
                    name: 'Drawing Time',
                    value: `<t:${this.getNextDrawingTimestamp()}:R>`,
                    inline: true
                }
            )
            .setFooter({ text: '🍀 Good luck in the weekly drawing!' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async showPrizeBreakdown(interaction, guildId) {
        const lotteryInfo = await dbManager.getLotteryInfo(guildId);
        const prizePool = lotteryInfo.total_prize || 400000;
        const totalTickets = lotteryInfo.total_tickets || 0;

        const embed = new EmbedBuilder()
            .setColor(UITemplates.getColors().PRIMARY_GAME)
            .setTitle('🏆 Weekly Lottery Prize Information')
            .setDescription('Prize pool breakdown and drawing details:')
            .addFields(
                {
                    name: '💰 Total Prize Pool',
                    value: `$${prizePool.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '🎫 Total Tickets Sold',
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
            .setFooter({ text: 'May the odds be ever in your favor!' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async showPlayerLotteryStatus(interaction, userId, guildId) {
        try {
            const lotteryInfo = await dbManager.getLotteryInfo(guildId);
            const userTickets = await dbManager.getUserLotteryTickets(userId, guildId);
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            const nextDrawingTime = this.getNextDrawingTimestamp();
            
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
                        value: `<t:${nextDrawingTime}:F>\n<t:${nextDrawingTime}:R>\n*Every Tuesday & Saturday at 10 AM EST*`,
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
    }
};