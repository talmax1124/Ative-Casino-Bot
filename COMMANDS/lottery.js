/**
 * Consolidated Lottery command for ATIVE Casino Bot
 * Unified interface for all lottery functionality
 */

const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const UITemplates = require('../UTILS/uiTemplates');
const logger = require('../UTILS/logger');
// UNIVERSAL GAME INTEGRATION - ALL SYSTEMS
const UniversalGameIntegrator = require('../UTILS/UniversalGameIntegrator');
const securityLogger = require('../UTILS/securityLogger');
const sessionGuard = require('../UTILS/sessionGuard');
const sessionManager = require('../UTILS/sessionManager');
const transparentPayoutManager = require('../UTILS/transparentPayoutManager');
const tuningManager = require('../UTILS/tuningManager');
const { secureRandomFloat, secureRandomInt, secureRandomBytes } = require('../UTILS/rng');

// Initialize game integrator
const gameIntegrator = new UniversalGameIntegrator('lottery');


// Developer/Admin IDs
const DEVELOPER_IDS = ['466050111680544798', '1158137066246176808']; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lottery')
        .setDescription('Lottery system - view status, buy tickets, and manage draws')
        .addSubcommand(subcommand =>
            subcommand
                .setName('viewstatus')
                .setDescription('Check lottery status, your tickets, and win probability')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('purchasetier1')
                .setDescription('Buy Tier 1 lottery tickets ($12,000 each)')
                .addIntegerOption(option =>
                    option.setName('count')
                        .setDescription('Number of tickets to buy (1-7)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(7)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('purchasetier2')
                .setDescription('Buy Tier 2 lottery tickets ($200,000 each)')
                .addIntegerOption(option =>
                    option.setName('count')
                        .setDescription('Number of tickets to buy (1-10)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(10)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('draw')
                .setDescription('[DEV ONLY] Manually trigger lottery drawing')
                .addStringOption(option =>
                    option.setName('confirmation')
                        .setDescription('Type "CONFIRM" to proceed')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('tier')
                        .setDescription('Which tier to draw (1 or 2)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(2)
                )
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const subcommand = interaction.options.getSubcommand();

        try {
            await dbManager.ensureUser(userId, interaction.user.displayName);

            switch (subcommand) {
                case 'viewstatus':
                    await this.handleViewStatus(interaction, userId, guildId);
                    break;
                case 'purchasetier1':
                    await this.handlePurchaseTier1(interaction, userId, guildId);
                    break;
                case 'purchasetier2':
                    await this.handlePurchaseTier2(interaction, userId, guildId);
                    break;
                case 'draw':
                    await this.handleDraw(interaction, userId, guildId);
                    break;
            }

        } catch (error) {
            logger.error(`Error in lottery command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Lottery Error')
                .setDescription('An error occurred. Please try again.')
                .setColor(0xFF0000)
                .setFooter({ text: 'ATIVE Casino' });
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    },

    // View Status Handler
    async handleViewStatus(interaction, userId, guildId) {
        await interaction.deferReply();

        try {
            // Get user data
            const balance = await dbManager.getUserBalance(userId, guildId);
            const tier1Tickets = await dbManager.databaseAdapter.getUserLotteryTickets(userId, guildId, 1);
            const tier2Tickets = await dbManager.databaseAdapter.getUserLotteryTickets(userId, guildId, 2);
            
            // Get lottery info for both tiers
            const tier1Info = await dbManager.databaseAdapter.getLotteryInfo(guildId, 1);
            const tier2Info = await dbManager.databaseAdapter.getLotteryInfo(guildId, 2);
            
            const tier1TotalTickets = tier1Info?.total_tickets || 0;
            const tier2TotalTickets = tier2Info?.total_tickets || 0;
            const tier1Prize = tier1Info?.current_prize || 0;
            const tier2Prize = tier2Info?.current_prize || 0;
            
            // Calculate win probabilities
            const tier1WinChance = tier1TotalTickets > 0 ? ((tier1Tickets / tier1TotalTickets) * 100).toFixed(2) : '0.00';
            const tier2WinChance = tier2TotalTickets > 0 ? ((tier2Tickets / tier2TotalTickets) * 100).toFixed(2) : '0.00';

            const embed = new EmbedBuilder()
                .setTitle('🎟️ Lottery Status')
                .setColor(0xFFD700)
                .setDescription(`**${interaction.user.displayName}'s Lottery Overview**`)
                .addFields(
                    { name: '\u200B', value: '**💰 TIER 1 LOTTERY**', inline: false },
                    { name: '🎟️ Your Tickets', value: `${tier1Tickets}/7`, inline: true },
                    { name: '🏆 Current Prize', value: fmt(tier1Prize), inline: true },
                    { name: '📊 Win Chance', value: `${tier1WinChance}%`, inline: true },
                    { name: '🎫 Total Tickets', value: tier1TotalTickets.toLocaleString(), inline: true },
                    { name: '💵 Ticket Price', value: '$12,000', inline: true },
                    { name: '\u200B', value: '\u200B', inline: true },
                    { name: '\u200B', value: '**💎 TIER 2 LOTTERY**', inline: false },
                    { name: '🎟️ Your Tickets', value: `${tier2Tickets}/10`, inline: true },
                    { name: '🏆 Current Prize', value: fmt(tier2Prize), inline: true },
                    { name: '📊 Win Chance', value: `${tier2WinChance}%`, inline: true },
                    { name: '🎫 Total Tickets', value: tier2TotalTickets.toLocaleString(), inline: true },
                    { name: '💵 Ticket Price', value: '$200,000', inline: true },
                    { name: '\u200B', value: '\u200B', inline: true },
                    { name: '💰 Your Balance', value: fmt(balance.wallet), inline: false }
                )
                .setFooter({ text: 'Use /lottery purchasetier1 or /lottery purchasetier2 to buy tickets' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error(`Error in lottery viewstatus: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Status Error')
                .setDescription('Could not retrieve lottery status.')
                .setColor(0xFF0000);
            
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    // Purchase Tier 1 Handler
    async handlePurchaseTier1(interaction, userId, guildId) {
        await interaction.deferReply();

        const ticketCount = interaction.options.getInteger('count');
        const ticketPrice = 12000;
        const totalCost = ticketCount * ticketPrice;

        try {
            // Get user balance
            const balance = await dbManager.getUserBalance(userId, guildId);
            const currentTickets = await dbManager.databaseAdapter.getUserLotteryTickets(userId, guildId, 1);

            // Check if user can buy more tickets
            if (currentTickets + ticketCount > 7) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Ticket Limit Exceeded')
                    .setDescription(`You can only have 7 Tier 1 tickets per week.`)
                    .addFields(
                        { name: 'Current Tickets', value: `${currentTickets}/7`, inline: true },
                        { name: 'Trying to Buy', value: `${ticketCount}`, inline: true },
                        { name: 'Would Have', value: `${currentTickets + ticketCount}/7`, inline: true }
                    )
                    .setColor(0xFF0000)
                    .setFooter({ text: 'Maximum 7 tickets per person per week' });
                
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Check if user has enough money
            if (balance.wallet < totalCost) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Insufficient Funds')
                    .setDescription('You don\'t have enough money in your wallet.')
                    .addFields(
                        { name: 'Cost', value: fmt(totalCost), inline: true },
                        { name: 'Your Wallet', value: fmt(balance.wallet), inline: true },
                        { name: 'Short By', value: fmt(totalCost - balance.wallet), inline: true }
                    )
                    .setColor(0xFF0000)
                    .setFooter({ text: 'Each Tier 1 ticket costs $12,000' });
                
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Process purchase
            const success = await dbManager.databaseAdapter.purchaseLotteryTickets(userId, guildId, 1, ticketCount);
            
            if (success) {
                // Deduct money from wallet
                await dbManager.updateUserBalance(userId, guildId, -totalCost, 0);

                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Tickets Purchased!')
                    .setColor(0x00FF00)
                    .setDescription(`**Successfully bought ${ticketCount} Tier 1 ticket${ticketCount > 1 ? 's' : ''}**`)
                    .addFields(
                        { name: '🎟️ Tickets Bought', value: `${ticketCount}`, inline: true },
                        { name: '💰 Total Cost', value: fmt(totalCost), inline: true },
                        { name: '🎫 Your Total Tickets', value: `${currentTickets + ticketCount}/7`, inline: true },
                        { name: '💵 Remaining Wallet', value: fmt(balance.wallet - totalCost), inline: false }
                    )
                    .setFooter({ text: 'Good luck in the next drawing!' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [successEmbed] });

                // Log purchase
                await sendLogMessage(
                    interaction.client,
                    'economy',
                    `Lottery T1: ${interaction.user.displayName} bought ${ticketCount} tickets for ${fmt(totalCost)}`,
                    userId,
                    guildId
                );

            } else {
                throw new Error('Purchase failed');
            }

        } catch (error) {
            logger.error(`Error in lottery purchasetier1: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Purchase Failed')
                .setDescription('Could not process ticket purchase. Please try again.')
                .setColor(0xFF0000);
            
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    // Purchase Tier 2 Handler
    async handlePurchaseTier2(interaction, userId, guildId) {
        await interaction.deferReply();

        const ticketCount = interaction.options.getInteger('count');
        const ticketPrice = 200000;
        const totalCost = ticketCount * ticketPrice;

        try {
            // Get user balance
            const balance = await dbManager.getUserBalance(userId, guildId);
            const currentTickets = await dbManager.databaseAdapter.getUserLotteryTickets(userId, guildId, 2);

            // Check if user can buy more tickets
            if (currentTickets + ticketCount > 10) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Ticket Limit Exceeded')
                    .setDescription(`You can only have 10 Tier 2 tickets per week.`)
                    .addFields(
                        { name: 'Current Tickets', value: `${currentTickets}/10`, inline: true },
                        { name: 'Trying to Buy', value: `${ticketCount}`, inline: true },
                        { name: 'Would Have', value: `${currentTickets + ticketCount}/10`, inline: true }
                    )
                    .setColor(0xFF0000)
                    .setFooter({ text: 'Maximum 10 tickets per person per week' });
                
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Check if user has enough money
            if (balance.wallet < totalCost) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Insufficient Funds')
                    .setDescription('You don\'t have enough money in your wallet.')
                    .addFields(
                        { name: 'Cost', value: fmt(totalCost), inline: true },
                        { name: 'Your Wallet', value: fmt(balance.wallet), inline: true },
                        { name: 'Short By', value: fmt(totalCost - balance.wallet), inline: true }
                    )
                    .setColor(0xFF0000)
                    .setFooter({ text: 'Each Tier 2 ticket costs $200,000' });
                
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Process purchase
            const success = await dbManager.databaseAdapter.purchaseLotteryTickets(userId, guildId, 2, ticketCount);
            
            if (success) {
                // Deduct money from wallet
                await dbManager.updateUserBalance(userId, guildId, -totalCost, 0);

                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Tickets Purchased!')
                    .setColor(0x00FF00)
                    .setDescription(`**Successfully bought ${ticketCount} Tier 2 ticket${ticketCount > 1 ? 's' : ''}**`)
                    .addFields(
                        { name: '🎟️ Tickets Bought', value: `${ticketCount}`, inline: true },
                        { name: '💰 Total Cost', value: fmt(totalCost), inline: true },
                        { name: '🎫 Your Total Tickets', value: `${currentTickets + ticketCount}/10`, inline: true },
                        { name: '💵 Remaining Wallet', value: fmt(balance.wallet - totalCost), inline: false }
                    )
                    .setFooter({ text: 'Good luck in the next drawing!' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [successEmbed] });

                // Log purchase
                await sendLogMessage(
                    interaction.client,
                    'economy',
                    `Lottery T2: ${interaction.user.displayName} bought ${ticketCount} tickets for ${fmt(totalCost)}`,
                    userId,
                    guildId
                );

            } else {
                throw new Error('Purchase failed');
            }

        } catch (error) {
            logger.error(`Error in lottery purchasetier2: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Purchase Failed')
                .setDescription('Could not process ticket purchase. Please try again.')
                .setColor(0xFF0000);
            
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    // Draw Handler (DEV ONLY)
    async handleDraw(interaction, userId, guildId) {
        // Check if user is developer
        if (!DEVELOPER_IDS.includes(userId)) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('🔒 Access Denied')
                .setDescription('This command is only available to developers.')
                .setColor(0xFF0000)
                .setFooter({ text: 'Developer access required' });
            
            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply();

        const confirmation = interaction.options.getString('confirmation');
        const tier = interaction.options.getInteger('tier') || 1;

        if (confirmation !== 'CONFIRM') {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Invalid Confirmation')
                .setDescription('You must type "CONFIRM" to proceed with the drawing.')
                .setColor(0xFF0000)
                .setFooter({ text: 'Type exactly: CONFIRM' });
            
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        try {
            // This would integrate with your actual lottery drawing system
            const embed = new EmbedBuilder()
                .setTitle('🎉 Lottery Drawing Initiated')
                .setDescription(`Manual Tier ${tier} lottery drawing triggered by **${interaction.user.displayName}**.`)
                .addFields(
                    { name: '👤 Admin', value: interaction.user.displayName, inline: true },
                    { name: '🎯 Tier', value: `Tier ${tier}`, inline: true },
                    { name: '⏰ Time', value: new Date().toLocaleString(), inline: true }
                )
                .setColor(0x00FF00)
                .setFooter({ text: '⚠️ This is a placeholder - integrate with actual drawing system' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            
            // Log the manual draw
            await sendLogMessage(
                interaction.client,
                'admin',
                `Manual lottery draw: ${interaction.user.displayName} triggered Tier ${tier} drawing`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error in lottery draw: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Drawing Failed')
                .setDescription('Failed to execute manual lottery drawing.')
                .setColor(0xFF0000);
            
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};