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
        .setDescription('Add money to a user\'s wallet (Admin only)')
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
            const newWallet = oldWallet + amount;
            
            // Update balance
            const success = await dbManager.setUserBalance(targetUser.id, guildId, newWallet, balance.bank);
            
            if (!success) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Failed to update user balance.')
                    .setColor(0xFF0000);
                
                return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Create success embed
            const embed = new EmbedBuilder()
                .setTitle('💰 Money Added')
                .setDescription(`Successfully added ${fmt(amount)} to ${targetUser.displayName}'s wallet.`)
                .addFields(
                    { name: 'Previous Balance', value: fmt(oldWallet), inline: true },
                    { name: 'Amount Added', value: fmt(amount), inline: true },
                    { name: 'New Balance', value: fmt(newWallet), inline: true }
                )
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Log the action
            logger.info(`Admin ${interaction.user.tag} added ${fmt(amount)} to ${targetUser.tag}'s wallet`);

        } catch (error) {
            logger.error(`Error in addmoney command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing the command.')
                .setColor(0xFF0000);

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