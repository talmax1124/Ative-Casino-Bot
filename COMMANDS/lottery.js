/**
 * Combined Lottery command for the casino bot
 * Shows lottery status and allows admin to draw lottery with subcommands
 */

const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const UITemplates = require('../UTILS/uiTemplates');
const logger = require('../UTILS/logger');

// Developer/Admin IDs
const DEVELOPER_IDS = ['466050111680544798', '1158137066246176808']; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lottery')
        .setDescription('Lottery system management')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check your lottery status, win probability, and ticket information')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('draw')
                .setDescription('[ADMIN] Manually trigger lottery drawing')
                .addStringOption(option =>
                    option.setName('confirmation')
                        .setDescription('Type "CONFIRM" to proceed with manual drawing')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        // Check if interaction is valid
        if (!interaction.isRepliable()) {
            console.log('[ERROR] Interaction not repliable in lottery command');
            return;
        }

        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const subcommand = interaction.options.getSubcommand();

        try {
            await dbManager.ensureUser(userId, interaction.user.displayName);

            if (subcommand === 'status') {
                // Show lottery status interface
                await this.showLotteryMainPanel(interaction, userId, guildId);
            } else if (subcommand === 'draw') {
                // Handle admin lottery drawing
                await this.handleLotteryDraw(interaction, userId);
            }

        } catch (error) {
            logger.error(`Error in lottery command: ${error.message}`);
            
            const errorEmbed = UITemplates.createErrorEmbed('Lottery System', {
                description: 'An error occurred while processing your lottery request. Please try again.',
                color: 0xFF0000
            });
            
            if (interaction.isRepliable()) {
                try {
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    } else {
                        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    }
                } catch (replyError) {
                    logger.error(`Failed to send error message: ${replyError.message}`);
                }
            }
        }
    },

    // Lottery Status Interface (from original lottery.js)
    async showLotteryMainPanel(interaction, userId, guildId) {
        // Get player data
        const balances = await dbManager.getBalances(userId, guildId);
        const userBalance = balances.wallet;
        const tier1Tickets = await dbManager.databaseAdapter.getUserLotteryTickets(userId, guildId, 1);
        const tier2Tickets = await dbManager.databaseAdapter.getUserLotteryTickets(userId, guildId, 2);
        
        // Calculate total statistics
        const totalTickets = tier1Tickets + tier2Tickets;
        
        // Get lottery info for both tiers
        const tier1Info = await dbManager.databaseAdapter.getLotteryInfo(guildId, 1);
        const tier2Info = await dbManager.databaseAdapter.getLotteryInfo(guildId, 2);
        
        const tier1TotalTickets = tier1Info?.total_tickets || 0;
        const tier2TotalTickets = tier2Info?.total_tickets || 0;
        
        // Calculate win probabilities
        const tier1WinChance = tier1TotalTickets > 0 ? ((tier1Tickets / tier1TotalTickets) * 100).toFixed(2) : '0.00';
        const tier2WinChance = tier2TotalTickets > 0 ? ((tier2Tickets / tier2TotalTickets) * 100).toFixed(2) : '0.00';
        
        // Estimate prizes (simple calculation)
        const tier1EstimatedPrize = tier1TotalTickets * 100000 * 0.5; // 50% of total sales
        const tier2EstimatedPrize = tier2TotalTickets * 200000 * 0.5; // 50% of total sales
        
        const embed = UITemplates.createInfoEmbed('🎫 Your Lottery Status', {
            description: `Here's your current lottery participation and win probabilities!`,
            color: 0x4CAF50,
            fields: [
                {
                    name: '💰 Your Balance',
                    value: fmt(userBalance),
                    inline: true
                },
                {
                    name: '🎫 Total Tickets',
                    value: `${totalTickets} tickets`,
                    inline: true
                },
                {
                    name: '⏰ Next Drawing',
                    value: 'Every Monday 12:00 PM EST',
                    inline: true
                },
                {
                    name: '🎫 Tier 1 Lottery',
                    value: `**Your Tickets:** ${tier1Tickets}/10\\n**Win Chance:** ${tier1WinChance}%\\n**Est. Prize:** ${fmt(tier1EstimatedPrize)}\\n**Total Tickets:** ${tier1TotalTickets}`,
                    inline: true
                },
                {
                    name: '🏆 Tier 2 Lottery',
                    value: `**Your Tickets:** ${tier2Tickets}/10\\n**Win Chance:** ${tier2WinChance}%\\n**Est. Prize:** ${fmt(tier2EstimatedPrize)}\\n**Total Tickets:** ${tier2TotalTickets}`,
                    inline: true
                },
                {
                    name: '📊 Statistics',
                    value: `**Tier 1 Price:** 100K/ticket\\n**Tier 2 Price:** 200K/ticket\\n**Max Tickets:** 10 per tier`,
                    inline: true
                }
            ],
            footer: { text: 'Good luck! May the odds be in your favor!' }
        });

        // Add action buttons
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('lottery_buy_tier1')
                    .setLabel('Buy Tier 1 Tickets')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎫'),
                new ButtonBuilder()
                    .setCustomId('lottery_buy_tier2')
                    .setLabel('Buy Tier 2 Tickets')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🏆'),
                new ButtonBuilder()
                    .setCustomId('lottery_refresh')
                    .setLabel('Refresh')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔄')
            );

        await interaction.reply({ embeds: [embed], components: [row1], flags: MessageFlags.Ephemeral });
    },

    // Admin Lottery Draw Handler (from original drawlottery.js)
    async handleLotteryDraw(interaction, userId) {
        const username = interaction.user.displayName;
        const confirmation = interaction.options.getString('confirmation');
        
        // Check if user is admin/developer
        if (!DEVELOPER_IDS.includes(userId)) {
            const embed = UITemplates.createErrorEmbed('❌ Access Denied', {
                description: 'This command is restricted to administrators only.',
                color: 0xFF0000
            });
            
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Check confirmation
        if (confirmation !== 'CONFIRM') {
            const embed = UITemplates.createInfoEmbed('⚠️ Confirmation Required', {
                description: `Please type exactly \`CONFIRM\` to proceed with manual lottery drawing.\\n\\n**You typed:** \`${confirmation}\``,
                color: 0xFFA500
            });
            
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Defer the reply since drawing might take a while
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // Log the manual drawing attempt
            logger.info(`Manual lottery drawing initiated by ${username} (${userId})`);
            
            // Here you would call your lottery drawing logic
            // For now, just showing a placeholder
            const embed = UITemplates.createSuccessEmbed('🎉 Lottery Drawing Initiated', {
                description: `Manual lottery drawing has been triggered by **${username}**.\\n\\n⚠️ **Note:** This is a placeholder. Integrate with your actual lottery drawing system.`,
                fields: [
                    {
                        name: '👤 Admin',
                        value: username,
                        inline: true
                    },
                    {
                        name: '⏰ Time',
                        value: new Date().toLocaleString(),
                        inline: true
                    },
                    {
                        name: '🎯 Action',
                        value: 'Manual Drawing',
                        inline: true
                    }
                ],
                color: 0x00FF00
            });

            await interaction.editReply({ embeds: [embed] });
            
            // Send log message
            await sendLogMessage({
                title: '🎰 Manual Lottery Drawing',
                description: `**${username}** manually triggered a lottery drawing.`,
                color: 0xFFD700,
                fields: [
                    {
                        name: 'User ID',
                        value: userId,
                        inline: true
                    },
                    {
                        name: 'Time',
                        value: new Date().toISOString(),
                        inline: true
                    }
                ]
            });

        } catch (error) {
            logger.error(`Error in manual lottery drawing: ${error.message}`);
            
            const errorEmbed = UITemplates.createErrorEmbed('❌ Drawing Failed', {
                description: `Failed to execute manual lottery drawing: ${error.message}`,
                color: 0xFF0000
            });
            
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};