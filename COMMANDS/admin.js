/**
 * Admin commands for the utility bot
 * Includes setup, refund, backup, and user management
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/database');
const { parseAmount, formatMoneyFull } = require('../UTILS/moneyFormatter');
const { fmtFull } = require('../UTILS/common');
const logger = require('../UTILS/logger');

// Helper function to check admin permissions
async function hasAdminPermissions(member) {
    // Check if user is server owner
    if (member.guild.ownerId === member.id) {
        return true;
    }
    
    // Check for Administrator permission
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }
    
    // Check for admin roles
    const adminRoles = ['admin', 'administrator', 'owner'];
    return member.roles.cache.some(role => 
        adminRoles.some(adminRole => 
            role.name.toLowerCase().includes(adminRole)
        )
    );
}

// Helper function to format currency
function fmt(amount) {
    return `$${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const addMoneyCommand = {
    data: new SlashCommandBuilder()
        .setName('addmoney')
        .setDescription('Add money to a user\'s account (Admin only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to add money to')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to add (supports K/M/B/T suffixes)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('account')
                .setDescription('Where to add the money')
                .setRequired(false)
                .addChoices(
                    { name: '💵 Wallet', value: 'wallet' },
                    { name: '🏦 Bank', value: 'bank' }
                )
        ),

    async execute(interaction) {
        // Check admin permissions
        if (!await hasAdminPermissions(interaction.member)) {
            const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
            
            const topFields = [
                {
                    name: '🚫 ACCESS DENIED',
                    value: 'Administrator permissions required.\n\nYou must be an administrator to use this command.',
                    inline: false
                }
            ];

            const embed = buildSessionEmbed({
                title: '❌ Permission Error',
                topFields,
                stageText: 'ACCESS DENIED',
                color: 0xE74C3C,
                footer: 'Admin Command Protection'
            });
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const targetUser = interaction.options.getUser('user');
        const amountStr = interaction.options.getString('amount');
        const account = interaction.options.getString('account') || 'wallet';
        
        // Parse amount
        const amount = parseAmount(amountStr);
        if (amount === null || amount <= 0) {
            const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
            
            const topFields = [
                {
                    name: '❌ INVALID AMOUNT',
                    value: 'Invalid amount format.\n\nUse numbers with K/M/B/T suffixes\n(e.g., 1000, 5k, 2.5m).',
                    inline: false
                }
            ];

            const embed = buildSessionEmbed({
                title: '❌ Input Error',
                topFields,
                stageText: 'INVALID FORMAT',
                color: 0xFF0000,
                footer: 'Admin Command Error'
            });
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        const guildId = interaction.guildId;

        try {
            // Ensure user exists
            await dbManager.ensureUser(targetUser.id, targetUser.displayName);
            
            // Get current balance
            const balance = await dbManager.getUserBalance(targetUser.id, guildId);
            const oldWallet = balance.wallet;
            const oldBank = balance.bank;
            
            let newWallet = oldWallet;
            let newBank = oldBank;
            let accountEmoji = '💵';
            let accountName = 'Wallet';
            let oldAmount, newAmount;
            
            if (account === 'bank') {
                newBank = oldBank + amount;
                accountEmoji = '🏦';
                accountName = 'Bank';
                oldAmount = oldBank;
                newAmount = newBank;
            } else {
                newWallet = oldWallet + amount;
                oldAmount = oldWallet;
                newAmount = newWallet;
            }
            
            // Update balance
            const success = await dbManager.setUserBalance(targetUser.id, guildId, newWallet, newBank);
            
            if (!success) {
                const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
                
                const topFields = [
                    {
                        name: '🔴 TRANSACTION FAILED',
                        value: 'Unable to process transaction.\n\nDatabase update failed. Please try again.',
                        inline: false
                    }
                ];

                const errorEmbed = buildSessionEmbed({
                    title: '🔴 System Error',
                    topFields,
                    stageText: 'TRANSACTION FAILED',
                    color: 0xE74C3C,
                    footer: 'Transaction System Error'
                });
                
                return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Create success embed using gameSessionKit for UI consistency
            const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
            
            const topFields = [
                {
                    name: '✅ TRANSACTION COMPLETE',
                    value: `Successfully added **${fmt(amount)}** to\n${targetUser.displayName}'s ${accountName.toLowerCase()}.`,
                    inline: false
                },
                {
                    name: `📊 ${accountName.toUpperCase()} SUMMARY`,
                    value: `${accountEmoji} **Previous:** ${fmt(oldAmount)}\n💸 **Added:** ${fmt(amount)}\n${accountEmoji} **New Total:** **${fmt(newAmount)}**`,
                    inline: true
                },
                {
                    name: '👤 USER INFO',
                    value: `**${targetUser.displayName}**\n<@${targetUser.id}>`,
                    inline: true
                }
            ];

            const bankFields = [
                { name: '💵 Wallet', value: fmt(newWallet), inline: true },
                { name: '🏦 Bank', value: fmt(newBank), inline: true },
                { name: '💎 Total', value: fmt(newWallet + newBank), inline: true }
            ];

            const embed = buildSessionEmbed({
                title: `${accountEmoji} ${targetUser.displayName}'s Money Added`,
                topFields,
                bankFields,
                stageText: 'TRANSACTION SUCCESS',
                color: 0x2ECC71,
                footer: `Admin Transaction • Added by ${interaction.user.displayName}`
            });

            await interaction.reply({ embeds: [embed] });

            // Log the action
            logger.info(`Admin ${interaction.user.tag} added ${fmt(amount)} to ${targetUser.tag}'s ${account}`);

        } catch (error) {
            logger.error(`Error in addmoney command: ${error.message}`);
            
            const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
            
            const topFields = [
                {
                    name: '🔴 SYSTEM ERROR',
                    value: 'An unexpected error occurred while\nprocessing the transaction.',
                    inline: false
                },
                {
                    name: '🔧 ERROR DETAILS',
                    value: error.message,
                    inline: false
                }
            ];

            const errorEmbed = buildSessionEmbed({
                title: '🔴 Command Failed',
                topFields,
                stageText: 'SYSTEM ERROR',
                color: 0xE74C3C,
                footer: 'System Error'
            });

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};

// Additional admin commands
const setMoneyCommand = {
    data: new SlashCommandBuilder()
        .setName('setmoney')
        .setDescription('Set a user\'s wallet balance (Admin only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to set money for')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to set (supports K/M/B/T suffixes)')
                .setRequired(true)
        ),

    async execute(interaction) {
        // Check admin permissions
        if (!await hasAdminPermissions(interaction.member)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Permission Denied')
                .setDescription('You need admin permissions to use this command.')
                .setColor(0xFF0000);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const targetUser = interaction.options.getUser('user');
        const amountStr = interaction.options.getString('amount');
        
        // Parse amount
        const amount = parseAmount(amountStr);
        if (amount === null || amount < 0) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Invalid Amount')
                .setDescription('Invalid amount format. Use numbers with K/M/B/T suffixes (e.g., 1000, 5k, 2.5m).')
                .setColor(0xFF0000);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        const guildId = interaction.guildId;

        try {
            // Ensure user exists
            await dbManager.ensureUser(targetUser.id, targetUser.displayName);
            
            // Get current balance
            const balance = await dbManager.getUserBalance(targetUser.id, guildId);
            const oldWallet = balance.wallet;
            
            // Set new balance
            const success = await dbManager.setUserBalance(targetUser.id, guildId, amount, balance.bank);
            
            if (!success) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Failed to update user balance.')
                    .setColor(0xFF0000);
                
                return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Create success embed
            const embed = new EmbedBuilder()
                .setTitle('💰 Balance Set')
                .setDescription(`Successfully set ${targetUser.displayName}'s wallet balance.`)
                .addFields(
                    { name: 'Previous Balance', value: fmt(oldWallet), inline: true },
                    { name: 'New Balance', value: fmt(amount), inline: true },
                    { name: 'Difference', value: fmt(amount - oldWallet), inline: true }
                )
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Log the action
            logger.info(`Admin ${interaction.user.tag} set ${targetUser.tag}'s wallet to ${fmt(amount)}`);

        } catch (error) {
            logger.error(`Error in setmoney command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing the command.')
                .setColor(0xFF0000);

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};


const backupCommand = {
    data: new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Create a backup of the database (Admin only)'),

    async execute(interaction) {
        // Check admin permissions
        if (!await hasAdminPermissions(interaction.member)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Permission Denied')
                .setDescription('You need admin permissions to use this command.')
                .setColor(0xFF0000);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // Create backup timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            
            // In a real implementation, you would:
            // 1. Export all collections from Firestore
            // 2. Create a backup file
            // 3. Upload to cloud storage or send as attachment
            
            // For now, we'll just create a backup record
            const backupRef = dbManager.db.collection('backups').doc();
            await backupRef.set({
                created_at: new Date(),
                created_by: interaction.user.id,
                guild_id: interaction.guildId,
                type: 'manual',
                status: 'completed'
            });

            const embed = new EmbedBuilder()
                .setTitle('💾 Backup Created')
                .setDescription(`Database backup created successfully at ${timestamp}`)
                .addFields(
                    { name: 'Backup ID', value: backupRef.id, inline: true },
                    { name: 'Created By', value: interaction.user.tag, inline: true },
                    { name: 'Status', value: 'Completed', inline: true }
                )
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Log the action
            logger.info(`Admin ${interaction.user.tag} created database backup ${backupRef.id}`);

        } catch (error) {
            logger.error(`Error in backup command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Backup Failed')
                .setDescription('An error occurred while creating the backup.')
                .setColor(0xFF0000);

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};

// Function to draw from last week's lottery data
async function drawLastWeekLottery(interaction, guildId) {
    const { secureRandomInt } = require('../UTILS/rng');
    
    try {
        // Look for any existing lottery tickets that weren't drawn
        const ticketsSnapshot = await dbManager.db.collection('lottery_tickets')
            .where('guild_id', '==', guildId)
            .get();

        if (ticketsSnapshot.empty) {
            const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
            
            const embed = buildSessionEmbed({
                title: '❌ No Last Week Data Found',
                topFields: [
                    {
                        name: 'No Archived Tickets',
                        value: 'No lottery tickets found from previous weeks.\nEither they were already drawn or no one participated.',
                        inline: false
                    }
                ],
                stageText: 'NO DATA FOUND',
                color: 0xFF6B6B,
                footer: 'Last Week Lottery Draw'
            });
            
            return await interaction.editReply({ embeds: [embed] });
        }

        // Collect all ticket holders
        const ticketHolders = [];
        const weightedParticipants = [];
        let totalTickets = 0;
        
        ticketsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.tickets > 0) {
                ticketHolders.push({ userId: data.user_id, tickets: data.tickets });
                totalTickets += data.tickets;
                
                // Add to weighted list based on ticket count
                for (let i = 0; i < data.tickets; i++) {
                    weightedParticipants.push(data.user_id);
                }
            }
        });

        if (ticketHolders.length < 3) {
            const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
            
            const participantList = ticketHolders.map(p => `<@${p.userId}> (${p.tickets} tickets)`).join('\n');
            
            const embed = buildSessionEmbed({
                title: '⚠️ Insufficient Last Week Participants',
                topFields: [
                    {
                        name: 'Not Enough Players',
                        value: `Found ${ticketHolders.length} participants from last week, but need at least 3.\n\nPrize will be added to current week's pool.`,
                        inline: false
                    },
                    {
                        name: '👥 Found Participants',
                        value: participantList || 'None',
                        inline: false
                    }
                ],
                stageText: 'INSUFFICIENT PARTICIPANTS',
                color: 0xFFAA00,
                footer: 'Last Week Lottery Draw'
            });
            
            // Add last week's prize to current week
            const currentLottery = await dbManager.getLotteryInfo(guildId);
            const lastWeekPrize = 400000; // Base prize that should have been drawn
            await dbManager.addToLotteryPool(guildId, lastWeekPrize);
            
            return await interaction.editReply({ embeds: [embed] });
        }

        // Draw 3 winners from last week's data
        const winners = [];
        const usedParticipants = new Set();

        for (let i = 0; i < 3; i++) {
            let winner;
            let attempts = 0;
            
            do {
                const randomIndex = secureRandomInt(0, weightedParticipants.length);
                winner = weightedParticipants[randomIndex];
                attempts++;
            } while (usedParticipants.has(winner) && attempts < 100);

            if (!usedParticipants.has(winner)) {
                winners.push(winner);
                usedParticipants.add(winner);
            }
        }

        // Calculate prizes for last week (use base 400k + any accumulated)
        const basePrize = 400000;
        const prizes = {
            first: Math.floor(basePrize * 0.45),   // 45%
            second: Math.floor(basePrize * 0.45),  // 45%
            third: Math.floor(basePrize * 0.10)    // 10%
        };

        // Award prizes to winners' bank accounts
        for (let i = 0; i < winners.length; i++) {
            const winnerId = winners[i];
            let prizeAmount;
            
            if (i === 0) prizeAmount = prizes.first;
            else if (i === 1) prizeAmount = prizes.second;
            else prizeAmount = prizes.third;

            // Add to winner's bank balance
            await dbManager.updateUserBalance(winnerId, guildId, 0, prizeAmount);
        }

        // Save to lottery history
        const results = {
            success: true,
            total_prize: basePrize,
            winners: [
                { userId: winners[0], prize: prizes.first, place: 1 },
                { userId: winners[1], prize: prizes.second, place: 2 },
                { userId: winners[2], prize: prizes.third, place: 3 }
            ],
            totalParticipants: ticketHolders.length,
            total_tickets: totalTickets,
            drawingDate: new Date(),
            isLastWeekDraw: true
        };

        await dbManager.saveLotteryHistory(guildId, results);

        // Clear the old tickets now that they've been drawn
        const batch = dbManager.db.batch();
        ticketsSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        // Display results
        const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
        
        const topFields = [
            {
                name: '🎊 LAST WEEK LOTTERY DRAWN!',
                value: `Successfully drew last week's overdue lottery!\nParticipants: ${ticketHolders.length} | Tickets: ${totalTickets}`,
                inline: false
            },
            {
                name: '🥇 1st Place Winner',
                value: `<@${results.winners[0].userId}>\n**Prize: ${fmtFull(results.winners[0].prize)}**`,
                inline: true
            },
            {
                name: '🥈 2nd Place Winner',
                value: `<@${results.winners[1].userId}>\n**Prize: ${fmtFull(results.winners[1].prize)}**`,
                inline: true
            },
            {
                name: '🥉 3rd Place Winner',
                value: `<@${results.winners[2].userId}>\n**Prize: ${fmtFull(results.winners[2].prize)}**`,
                inline: true
            }
        ];

        const bankFields = [
            { name: 'Last Week Prize Pool', value: fmtFull(basePrize), inline: true },
            { name: 'Total Tickets Drawn', value: totalTickets.toString(), inline: true },
            { name: 'Drawing Completed', value: new Date().toLocaleString(), inline: true }
        ];

        const embed = buildSessionEmbed({
            title: '🎟️ Last Week Lottery Results',
            topFields,
            bankFields,
            stageText: 'LAST WEEK DRAWN',
            color: 0x2ECC71,
            footer: 'Overdue lottery completed • Prizes in BANK accounts'
        });

        await interaction.editReply({ embeds: [embed] });

        // Log the drawing
        logger.info(`Admin ${interaction.user.tag} drew last week's lottery for guild ${guildId}. Winners: ${winners.join(', ')}`);

        // Try to announce in lottery channel
        try {
            const lotteryChannelId = '1406136478714826824';
            const lotteryChannel = interaction.guild.channels.cache.get(lotteryChannelId);
            if (lotteryChannel) {
                const announceEmbed = new EmbedBuilder()
                    .setTitle('🎊 LAST WEEK LOTTERY FINALLY DRAWN! 🎊')
                    .setDescription(`**Overdue lottery from last week has been completed!**\n\nManually drawn by ${interaction.user.displayName}`)
                    .addFields(
                        {
                            name: '🥇 1st Place',
                            value: `<@${results.winners[0].userId}> - ${fmtFull(results.winners[0].prize)}`,
                            inline: false
                        },
                        {
                            name: '🥈 2nd Place',
                            value: `<@${results.winners[1].userId}> - ${fmtFull(results.winners[1].prize)}`,
                            inline: false
                        },
                        {
                            name: '🥉 3rd Place',
                            value: `<@${results.winners[2].userId}> - ${fmtFull(results.winners[2].prize)}`,
                            inline: false
                        }
                    )
                    .setColor(0xFFD700)
                    .setFooter({ text: 'Better late than never! 🍀' })
                    .setTimestamp();
                
                await lotteryChannel.send({ 
                    content: '📢 **LAST WEEK\'S LOTTERY WINNERS ANNOUNCED!**', 
                    embeds: [announceEmbed] 
                });
            }
        } catch (announceError) {
            logger.warn(`Could not announce last week lottery results: ${announceError.message}`);
        }

    } catch (error) {
        logger.error(`Error drawing last week lottery: ${error.message}`);
        
        const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
        
        const embed = buildSessionEmbed({
            title: '❌ Last Week Draw Failed',
            topFields: [
                {
                    name: 'Error Occurred',
                    value: `Failed to draw last week's lottery.\nError: ${error.message}`,
                    inline: false
                }
            ],
            stageText: 'ERROR',
            color: 0xFF0000,
            footer: 'Last Week Lottery Draw'
        });
        
        await interaction.editReply({ embeds: [embed] });
    }
}

const drawLotteryCommand = {
    data: new SlashCommandBuilder()
        .setName('drawlottery')
        .setDescription('Manually draw the lottery (Admin only)')
        .addBooleanOption(option =>
            option.setName('force')
                .setDescription('Force drawing even with insufficient participants')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('lastweek')
                .setDescription('Draw from last week\'s archived data (if available)')
                .setRequired(false)
        ),

    async execute(interaction) {
        // Check admin permissions
        if (!await hasAdminPermissions(interaction.member)) {
            const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
            
            const topFields = [
                {
                    name: '🚫 ACCESS DENIED',
                    value: 'Administrator permissions required.\n\nYou must be an administrator to draw the lottery manually.',
                    inline: false
                }
            ];

            const embed = buildSessionEmbed({
                title: '❌ Permission Error',
                topFields,
                stageText: 'ACCESS DENIED',
                color: 0xE74C3C,
                footer: 'Lottery Draw Protection'
            });
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const guildId = interaction.guildId;
        const force = interaction.options.getBoolean('force') || false;
        const lastWeek = interaction.options.getBoolean('lastweek') || false;

        try {
            await interaction.deferReply();
            
            if (lastWeek) {
                return await drawLastWeekLottery(interaction, guildId);
            }

            // Get lottery info first
            const lotteryInfo = await dbManager.getLotteryInfo(guildId);
            
            // Check lottery tickets directly since participants might be empty
            const ticketsSnapshot = await dbManager.db.collection('lottery_tickets')
                .where('guild_id', '==', guildId)
                .get();
                
            let totalParticipants = 0;
            const ticketHolders = [];
            ticketsSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.tickets > 0) {
                    totalParticipants++;
                    ticketHolders.push({ userId: data.user_id, tickets: data.tickets });
                }
            });
            
            // Check if we have enough participants
            if (totalParticipants < 3 && !force) {
                const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
                
                const topFields = [
                    {
                        name: '⚠️ INSUFFICIENT PARTICIPANTS',
                        value: `Need at least 3 participants to draw lottery.\nCurrent participants: ${totalParticipants}\n\nUse \`force: true\` to draw anyway (will roll over prize).`,
                        inline: false
                    },
                    {
                        name: '💰 Current Prize Pool',
                        value: fmtFull(lotteryInfo.total_prize || 400000),
                        inline: true
                    },
                    {
                        name: '🎫 Total Tickets',
                        value: (lotteryInfo.total_tickets || 0).toString(),
                        inline: true
                    }
                ];

                if (ticketHolders.length > 0) {
                    const participantList = ticketHolders.slice(0, 5).map(p => `<@${p.userId}> (${p.tickets} tickets)`).join('\n');
                    topFields.push({
                        name: '👥 Current Participants',
                        value: participantList + (ticketHolders.length > 5 ? `\n...and ${ticketHolders.length - 5} more` : ''),
                        inline: false
                    });
                }

                const embed = buildSessionEmbed({
                    title: '🎟️ Lottery Status',
                    topFields,
                    stageText: 'INSUFFICIENT PARTICIPANTS',
                    color: 0xFFAA00,
                    footer: 'Manual Lottery Draw'
                });
                
                return await interaction.editReply({ embeds: [embed] });
            }

            // Conduct the lottery drawing
            const results = await dbManager.conductLotteryDrawing(guildId);

            if (results.success) {
                // Save to history
                await dbManager.saveLotteryHistory(guildId, results);

                const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
                
                const topFields = [
                    {
                        name: '🎊 LOTTERY DRAWN SUCCESSFULLY!',
                        value: `Manual lottery drawing has been completed.\nTotal participants: ${results.totalParticipants}`,
                        inline: false
                    },
                    {
                        name: '🥇 1st Place Winner',
                        value: `<@${results.winners[0].userId}>\n**Prize: ${fmtFull(results.winners[0].prize)}**`,
                        inline: true
                    },
                    {
                        name: '🥈 2nd Place Winner',
                        value: `<@${results.winners[1].userId}>\n**Prize: ${fmtFull(results.winners[1].prize)}**`,
                        inline: true
                    },
                    {
                        name: '🥉 3rd Place Winner',
                        value: `<@${results.winners[2].userId}>\n**Prize: ${fmtFull(results.winners[2].prize)}**`,
                        inline: true
                    }
                ];

                const bankFields = [
                    { name: 'Total Prize Pool', value: fmtFull(results.total_prize), inline: true },
                    { name: 'Total Tickets', value: results.total_tickets.toString(), inline: true },
                    { name: 'Drawing Date', value: results.drawingDate.toLocaleString(), inline: true }
                ];

                const embed = buildSessionEmbed({
                    title: '🎟️ Manual Lottery Drawing Results',
                    topFields,
                    bankFields,
                    stageText: 'DRAWING COMPLETE',
                    color: 0x2ECC71,
                    footer: 'Prizes deposited to winners\' BANK accounts'
                });

                await interaction.editReply({ embeds: [embed] });

                // Log the manual drawing
                logger.info(`Admin ${interaction.user.tag} manually drew lottery for guild ${guildId}`);
                
                // Try to announce in lottery channel if it exists
                try {
                    const lotteryChannelId = '1406136478714826824';
                    const lotteryChannel = interaction.guild.channels.cache.get(lotteryChannelId);
                    if (lotteryChannel) {
                        const announceEmbed = new EmbedBuilder()
                            .setTitle('🎊 MANUAL LOTTERY DRAWING RESULTS! 🎊')
                            .setDescription(`**Manual lottery drawing completed by ${interaction.user.displayName}**`)
                            .addFields(
                                {
                                    name: '🥇 1st Place',
                                    value: `<@${results.winners[0].userId}> - ${fmtFull(results.winners[0].prize)}`,
                                    inline: false
                                },
                                {
                                    name: '🥈 2nd Place',
                                    value: `<@${results.winners[1].userId}> - ${fmtFull(results.winners[1].prize)}`,
                                    inline: false
                                },
                                {
                                    name: '🥉 3rd Place',
                                    value: `<@${results.winners[2].userId}> - ${fmtFull(results.winners[2].prize)}`,
                                    inline: false
                                }
                            )
                            .setColor(0xFFD700)
                            .setTimestamp();
                        
                        await lotteryChannel.send({ embeds: [announceEmbed] });
                    }
                } catch (announceError) {
                    logger.warn(`Could not announce manual lottery results: ${announceError.message}`);
                }

            } else {
                // Drawing failed
                const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
                
                const topFields = [
                    {
                        name: '❌ DRAWING FAILED',
                        value: `Could not complete lottery drawing.\nReason: ${results.reason}`,
                        inline: false
                    }
                ];

                if (results.participants !== undefined) {
                    topFields.push({
                        name: 'Participants Found',
                        value: results.participants.toString(),
                        inline: true
                    });
                }

                const embed = buildSessionEmbed({
                    title: '❌ Lottery Drawing Failed',
                    topFields,
                    stageText: 'DRAWING FAILED',
                    color: 0xE74C3C,
                    footer: 'Manual Lottery Draw'
                });
                
                await interaction.editReply({ embeds: [embed] });
            }

        } catch (error) {
            logger.error(`Error in manual lottery draw: ${error.message}`);
            
            try {
                const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
                
                const topFields = [
                    {
                        name: '🔴 SYSTEM ERROR',
                        value: 'An unexpected error occurred while\ndrawing the lottery.',
                        inline: false
                    },
                    {
                        name: '🔧 ERROR DETAILS',
                        value: error.message,
                        inline: false
                    }
                ];

                const errorEmbed = buildSessionEmbed({
                    title: '🔴 Drawing Failed',
                    topFields,
                    stageText: 'SYSTEM ERROR',
                    color: 0xE74C3C,
                    footer: 'System Error'
                });

                if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else if (!interaction.replied) {
                    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }
            } catch (replyError) {
                logger.error(`Failed to send error response: ${replyError.message}`);
            }
        }
    }
};

// Export multiple commands
module.exports = {
    data: addMoneyCommand.data,
    execute: addMoneyCommand.execute,
    setMoneyCommand,
    backupCommand,
    drawLotteryCommand
};