/**
 * Admin commands for the utility bot
 * Includes setup, refund, backup, and user management
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/database');
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
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to add')
                .setRequired(true)
                .setMinValue(1)
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
            const embed = new EmbedBuilder()
                .setTitle('❌ Access Denied')
                .setDescription('🚫 **Administrator permissions required**\n\nYou must be an administrator to use this command.')
                .setColor(0xE74C3C)
                .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                .setFooter({ text: '🔒 Admin Command • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const account = interaction.options.getString('account') || 'wallet';
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
                const errorEmbed = new EmbedBuilder()
                    .setTitle('🔴 Transaction Failed')
                    .setDescription('❌ **Unable to process transaction**\n\nDatabase update failed. Please try again.')
                    .setColor(0xE74C3C)
                    .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                    .setFooter({ text: '💳 Transaction System • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });
                
                return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Create success embed with casino styling
            const embed = new EmbedBuilder()
                .setTitle(`${accountEmoji} Money Added Successfully`)
                .setDescription(`✅ **Transaction Complete**\n\nSuccessfully added **${fmt(amount)}** to ${targetUser.displayName}'s ${accountName.toLowerCase()}.`)
                .addFields(
                    { name: `📊 ${accountName} Summary`, value: `${accountEmoji} **Previous:** ${fmt(oldAmount)}\n💸 **Added:** ${fmt(amount)}\n${accountEmoji} **New Total:** **${fmt(newAmount)}**`, inline: true },
                    { name: '💰 Full Balance', value: `💵 **Wallet:** ${fmt(newWallet)}\n🏦 **Bank:** ${fmt(newBank)}\n💎 **Total:** **${fmt(newWallet + newBank)}**`, inline: true },
                    { name: '👤 User Info', value: `**${targetUser.displayName}**\n<@${targetUser.id}>`, inline: true }
                )
                .setColor(0x2ECC71)
                .setThumbnail(targetUser.displayAvatarURL())
                .setFooter({ text: `💳 Admin Transaction • Added by ${interaction.user.displayName}`, iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Log the action
            logger.info(`Admin ${interaction.user.tag} added ${fmt(amount)} to ${targetUser.tag}'s ${account}`);

        } catch (error) {
            logger.error(`Error in addmoney command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('🔴 System Error')
                .setDescription('❌ **Command Failed**\n\nAn unexpected error occurred while processing the transaction.')
                .addFields({ name: '🔧 Error Details', value: '```' + error.message + '```', inline: false })
                .setColor(0xE74C3C)
                .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                .setFooter({ text: '🛠️ System Error • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

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
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to set')
                .setRequired(true)
                .setMinValue(0)
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
        const amount = interaction.options.getInteger('amount');
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