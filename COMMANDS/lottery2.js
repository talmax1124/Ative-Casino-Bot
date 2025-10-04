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
            
            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
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
            switch (action) {
                case 'buy_tickets':
                    // Redirect to purchaselottery2 command
                    const purchaseCommand = require('./purchaselottery2');
                    await purchaseCommand.showLottery2Interface(interaction, userId, guildId);
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

            await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
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
        await interaction.reply({ embeds: [rulesEmbed], flags: MessageFlags.Ephemeral });
    },

    async showUserTickets(interaction, userId, guildId) {
        const userTickets = await dbManager.getUserLotteryTickets(userId, guildId, 2); // Tier 2
        const lotteryInfo = await dbManager.getLotteryInfo(guildId, 2); // Tier 2
        
        if (userTickets === 0) {
            const embed = UITemplates.createErrorEmbed('Tier 2 Lottery Tickets', {
                description: 'You don\'t have any tier 2 lottery tickets yet!\n\nUse the "Buy Tier 2 Tickets" button to purchase high-stakes tickets for the weekly drawing.',
                isLoss: false
            });
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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