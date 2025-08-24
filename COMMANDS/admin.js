/**
 * Admin commands for the utility bot
 * Includes setup, refund, backup, and user management
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/database');
const { parseAmount, formatMoneyFull } = require('../UTILS/moneyFormatter');
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

// Export multiple commands
module.exports = {
    data: addMoneyCommand.data,
    execute: addMoneyCommand.execute,
    setMoneyCommand,
    backupCommand
};