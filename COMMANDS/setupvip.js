/**
 * Setup VIP Command - Create VIP channels and roles for purchases
 * Admin-only command to set up monetization infrastructure
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const roleManager = require('../UTILS/roleManager');
const logger = require('../UTILS/logger');

const DEVELOPER_ID = '466050111680544798';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setupvip')
        .setDescription('🎭 Setup VIP channels and roles for monetization (Admin only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('channels')
                .setDescription('Create VIP channels and category')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('permissions')
                .setDescription('Update VIP channel permissions for roles')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('roles')
                .setDescription('View configured VIP role rewards')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check VIP setup status')
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        
        // Check if user is developer or admin
        const isAdmin = userId === DEVELOPER_ID || interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
        
        if (!isAdmin) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Access Denied')
                .setDescription('This command is only available to administrators.')
                .setColor(0xFF0000);
                
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'channels':
                    await handleSetupChannels(interaction);
                    break;
                case 'permissions':
                    await handleUpdatePermissions(interaction);
                    break;
                case 'roles':
                    await handleViewRoles(interaction);
                    break;
                case 'status':
                    await handleCheckStatus(interaction);
                    break;
            }
        } catch (error) {
            logger.error(`Error in setupvip command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Setup Error')
                .setDescription('An error occurred while setting up VIP features.')
                .setColor(0xFF0000);
                
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};

async function handleSetupChannels(interaction) {
    await interaction.deferReply();
    
    const guild = interaction.guild;
    const result = await roleManager.setupVIPChannels(guild);
    
    if (result.success) {
        const embed = new EmbedBuilder()
            .setTitle('✅ VIP Channels Created')
            .setDescription('Successfully created VIP channels and category!')
            .addFields(
                {
                    name: '📁 Category Created',
                    value: `${result.category.name} (ID: ${result.category.id})`,
                    inline: false
                },
                {
                    name: '📝 Channels Created',
                    value: result.channels.map(c => `• ${c.name} (ID: ${c.id})`).join('\n'),
                    inline: false
                },
                {
                    name: '🔧 Next Steps',
                    value: '• Run `/setupvip permissions` to configure role access\n• Start selling products to award VIP roles\n• Users will automatically get access based on purchases',
                    inline: false
                }
            )
            .setColor(0x00FF00)
            .setTimestamp();
            
        await interaction.editReply({ embeds: [embed] });
    } else {
        const embed = new EmbedBuilder()
            .setTitle('❌ Setup Failed')
            .setDescription(`Failed to create VIP channels: ${result.error}`)
            .setColor(0xFF0000);
            
        await interaction.editReply({ embeds: [embed] });
    }
}

async function handleUpdatePermissions(interaction) {
    await interaction.deferReply();
    
    const guild = interaction.guild;
    const result = await roleManager.updateChannelPermissions(guild);
    
    if (result.success) {
        const embed = new EmbedBuilder()
            .setTitle('✅ Permissions Updated')
            .setDescription('Successfully updated VIP channel permissions!')
            .addFields(
                {
                    name: '🎭 Access Levels',
                    value: '• **Casino VIP**: Basic VIP lounge access\n• **Casino Premium**: VIP lounge + announcements\n• **Casino Diamond**: All channels including high-rollers\n• **Casino Elite**: Full access to all VIP areas',
                    inline: false
                },
                {
                    name: '📝 Channel Access',
                    value: '• **💎-vip-lounge**: All VIP roles\n• **👑-high-rollers**: Diamond & Elite only\n• **📢-vip-announcements**: All VIP roles (read-only)',
                    inline: false
                }
            )
            .setColor(0x00FF00)
            .setTimestamp();
            
        await interaction.editReply({ embeds: [embed] });
    } else {
        const embed = new EmbedBuilder()
            .setTitle('❌ Permission Update Failed')
            .setDescription(`Failed to update permissions: ${result.error}`)
            .setColor(0xFF0000);
            
        await interaction.editReply({ embeds: [embed] });
    }
}

async function handleViewRoles(interaction) {
    const roleRewards = roleManager.getAllRoleRewards();
    
    const embed = new EmbedBuilder()
        .setTitle('🎭 VIP Role Rewards Configuration')
        .setDescription('Roles automatically awarded based on purchases:')
        .setColor(0x9932CC)
        .setTimestamp();
    
    Object.entries(roleRewards).forEach(([skuId, config]) => {
        embed.addFields({
            name: `${config.roleName}`,
            value: `**SKU:** \`${skuId}\`\n**Color:** ${config.roleColor}\n**Description:** ${config.description}`,
            inline: true
        });
    });
    
    embed.addFields({
        name: '💡 How It Works',
        value: 'When users purchase coin packs through `/shop`, they automatically receive the corresponding VIP role and gain access to exclusive channels!',
        inline: false
    });
    
    await interaction.reply({ embeds: [embed] });
}

async function handleCheckStatus(interaction) {
    const guild = interaction.guild;
    
    // Check for VIP category
    const vipCategory = guild.channels.cache.find(c => c.name === '🎰 VIP CASINO' && c.type === 4);
    
    // Check for VIP roles
    const roleRewards = roleManager.getAllRoleRewards();
    const roleNames = Object.values(roleRewards).map(r => r.roleName);
    const existingRoles = {};
    
    for (const roleName of roleNames) {
        const role = guild.roles.cache.find(r => r.name === roleName);
        existingRoles[roleName] = !!role;
    }
    
    // Check for VIP channels
    const expectedChannels = ['💎-vip-lounge', '👑-high-rollers', '📢-vip-announcements'];
    const existingChannels = {};
    
    for (const channelName of expectedChannels) {
        const channel = guild.channels.cache.find(c => c.name === channelName);
        existingChannels[channelName] = !!channel;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('📊 VIP Setup Status')
        .setDescription('Current status of VIP monetization features:')
        .setColor(vipCategory ? 0x00FF00 : 0xFF0000)
        .setTimestamp();
    
    // Category status
    embed.addFields({
        name: '📁 VIP Category',
        value: vipCategory ? '✅ Created' : '❌ Missing - Run `/setupvip channels`',
        inline: true
    });
    
    // Channels status
    const channelStatus = expectedChannels.map(name => 
        `${existingChannels[name] ? '✅' : '❌'} ${name}`
    ).join('\n');
    
    embed.addFields({
        name: '📝 VIP Channels',
        value: channelStatus,
        inline: true
    });
    
    // Roles status  
    const roleStatus = roleNames.map(name =>
        `${existingRoles[name] ? '✅' : '⚠️'} ${name}`
    ).join('\n');
    
    embed.addFields({
        name: '🎭 VIP Roles',
        value: roleStatus + '\n\n⚠️ *Roles are created automatically when first purchased*',
        inline: true
    });
    
    // Bot permissions check
    const botPermissions = guild.members.me.permissions;
    const hasChannelPerms = botPermissions.has([PermissionsBitField.Flags.ManageChannels]);
    const hasRolePerms = botPermissions.has([PermissionsBitField.Flags.ManageRoles]);
    
    embed.addFields({
        name: '🔐 Bot Permissions',
        value: `${hasChannelPerms ? '✅' : '❌'} Manage Channels\n${hasRolePerms ? '✅' : '❌'} Manage Roles`,
        inline: true
    });
    
    // Setup recommendations
    const recommendations = [];
    if (!vipCategory) recommendations.push('• Run `/setupvip channels` to create VIP area');
    if (!hasChannelPerms || !hasRolePerms) recommendations.push('• Give bot Channel & Role management permissions');
    if (Object.values(existingChannels).some(exists => !exists)) recommendations.push('• Run `/setupvip permissions` after creating channels');
    
    if (recommendations.length > 0) {
        embed.addFields({
            name: '📋 Recommendations',
            value: recommendations.join('\n'),
            inline: false
        });
    } else {
        embed.addFields({
            name: '🎉 Status',
            value: '✅ VIP system is fully configured and ready!',
            inline: false
        });
    }
    
    await interaction.reply({ embeds: [embed] });
}