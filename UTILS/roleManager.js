/**
 * Role Manager - Handle Discord role rewards for purchases
 * Integrates with Server Products system
 */

const { PermissionsBitField } = require('discord.js');
const logger = require('./logger');

// Role configuration for subscriptions only - Updated with actual role IDs
const ROLE_REWARDS = {
    // Diamond Subscription - Uses existing Diamond role
    '1411543496866664479': {
        roleId: '1411582691073196155', // Existing Diamond role ID
        roleName: 'Diamond Subscriber',
        roleColor: '#9932CC', // Purple
        permissions: [],
        description: 'Monthly Diamond subscription benefits',
        useExistingRole: true
    },
    
    // Ruby Subscription - Uses existing Ruby role
    '1411553720591712326': {
        roleId: '1411582733813158001', // Existing Ruby role ID
        roleName: 'Ruby Subscriber', 
        roleColor: '#DC143C', // Crimson
        permissions: [],
        description: 'Monthly Ruby subscription with premium perks',
        useExistingRole: true
    }
    
    // Note: Coin purchases (200K, 500K, 1M) no longer award roles per user request
};

/**
 * Award role to user based on purchase
 */
async function awardPurchaseRole(guild, user, skuId) {
    try {
        const roleConfig = ROLE_REWARDS[skuId];
        if (!roleConfig) {
            logger.info(`No role reward configured for SKU: ${skuId}`);
            return { success: true, message: 'No role reward for this product' };
        }

        // Check if bot has permission to manage roles
        const botMember = guild.members.cache.get(guild.client.user.id);
        if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            logger.error(`Bot lacks Manage Roles permission in guild ${guild.id}`);
            return { success: false, error: 'Bot lacks permission to manage roles' };
        }

        // Find the role (use existing role ID or find by name)
        let role;
        if (roleConfig.useExistingRole && roleConfig.roleId) {
            role = guild.roles.cache.get(roleConfig.roleId);
            if (!role) {
                logger.error(`Existing role with ID ${roleConfig.roleId} not found in guild ${guild.id}`);
                return { success: false, error: `Role with ID ${roleConfig.roleId} not found` };
            }
        } else {
            role = guild.roles.cache.find(r => r.name === roleConfig.roleName);
            
            if (!role) {
                // Create the role (only for non-existing role configs)
                role = await guild.roles.create({
                    name: roleConfig.roleName,
                    color: roleConfig.roleColor,
                    permissions: roleConfig.permissions,
                    reason: `Casino bot VIP role for ${roleConfig.description}`,
                    mentionable: false,
                    hoist: true // Display separately in member list
                });
                
                logger.info(`Created new role: ${role.name} in guild ${guild.id}`);
            }
        }

        // Get member data from cache/database first
        const memberCacheManager = require('./memberCacheManager');
        const { success: memberSuccess, member: memberData } = await memberCacheManager.getMemberData(user.id, guild.id, guild);
        
        // For role operations, we still need the Discord member object
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) {
            logger.error(`User ${user.id} not found in guild ${guild.id}`);
            return { success: false, error: 'User not found in server' };
        }

        // Check if user already has this role
        if (member.roles.cache.has(role.id)) {
            logger.info(`User ${user.displayName} already has role ${role.name}`);
            return { success: true, message: `User already has ${role.name} role`, hadRole: true };
        }

        // Award the role
        await member.roles.add(role, `Casino purchase: ${roleConfig.description}`);
        
        logger.info(`Awarded role ${role.name} to ${user.displayName} in guild ${guild.name}`);
        
        return { 
            success: true, 
            message: `Awarded ${role.name} role`,
            roleName: role.name,
            roleId: role.id,
            hadRole: false
        };
        
    } catch (error) {
        logger.error(`Error awarding role for SKU ${skuId}: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Remove role from user (for refunds)
 */
async function removePurchaseRole(guild, userId, skuId) {
    try {
        const roleConfig = ROLE_REWARDS[skuId];
        if (!roleConfig) {
            return { success: true, message: 'No role to remove' };
        }

        const role = guild.roles.cache.find(r => r.name === roleConfig.roleName);
        if (!role) {
            return { success: true, message: 'Role does not exist' };
        }

        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
            return { success: false, error: 'User not found in server' };
        }

        if (member.roles.cache.has(role.id)) {
            await member.roles.remove(role, 'Casino purchase refund');
            logger.info(`Removed role ${role.name} from user ${userId} due to refund`);
            return { success: true, message: `Removed ${role.name} role` };
        }

        return { success: true, message: 'User did not have the role' };
        
    } catch (error) {
        logger.error(`Error removing role for SKU ${skuId}: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Get role information for a SKU
 */
function getRoleInfo(skuId) {
    return ROLE_REWARDS[skuId] || null;
}

/**
 * Get all configured role rewards
 */
function getAllRoleRewards() {
    return ROLE_REWARDS;
}

/**
 * Setup VIP channels for role access
 */
async function setupVIPChannels(guild) {
    try {
        if (!guild.members.me.permissions.has([
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.ManageRoles
        ])) {
            return { success: false, error: 'Bot lacks channel management permissions' };
        }

        const channels = [];
        
        // Create VIP category
        const category = await guild.channels.create({
            name: '🎰 VIP CASINO',
            type: 4, // Category
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                }
            ]
        });

        // Create VIP general chat
        const vipGeneral = await guild.channels.create({
            name: '💎-vip-lounge',
            type: 0, // Text
            parent: category,
            topic: 'Exclusive lounge for VIP members',
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                }
            ]
        });
        channels.push(vipGeneral);

        // Create high-roller channel
        const highRoller = await guild.channels.create({
            name: '👑-high-rollers',
            type: 0, // Text
            parent: category,
            topic: 'Elite members only - Diamond & Elite tiers',
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                }
            ]
        });
        channels.push(highRoller);

        // Create announcements channel
        const vipAnnouncements = await guild.channels.create({
            name: '📢-vip-announcements',
            type: 0, // Text
            parent: category,
            topic: 'Exclusive announcements and bonuses for VIP members',
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
                }
            ]
        });
        channels.push(vipAnnouncements);

        logger.info(`Created VIP channels in guild ${guild.name}`);
        
        return { 
            success: true, 
            channels: channels.map(c => ({ id: c.id, name: c.name })),
            category: { id: category.id, name: category.name }
        };
        
    } catch (error) {
        logger.error(`Error setting up VIP channels: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Update channel permissions for VIP roles
 */
async function updateChannelPermissions(guild) {
    try {
        const roleNames = Object.values(ROLE_REWARDS).map(r => r.roleName);
        const roles = {};
        
        // Find all VIP roles
        for (const roleName of roleNames) {
            const role = guild.roles.cache.find(r => r.name === roleName);
            if (role) {
                roles[roleName] = role;
            }
        }

        // Find VIP channels
        const vipCategory = guild.channels.cache.find(c => c.name === '🎰 VIP CASINO' && c.type === 4);
        if (!vipCategory) {
            return { success: false, error: 'VIP category not found. Run setup first.' };
        }

        const vipChannels = guild.channels.cache.filter(c => c.parentId === vipCategory.id);
        
        for (const [channelId, channel] of vipChannels) {
            // Basic VIP access (all VIP roles)
            for (const [roleName, role] of Object.entries(roles)) {
                await channel.permissionOverwrites.edit(role, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                });
            }

            // Special permissions for high-roller channel
            if (channel.name === '👑-high-rollers') {
                // Only Diamond tier and subscribers can access
                const diamondRole = roles['Casino Diamond'];
                const diamondSubRole = roles['Diamond Subscriber'];
                const rubySubRole = roles['Ruby Subscriber'];
                
                // Deny lower tier roles
                const silverRole = roles['Casino Silver'];
                const goldRole = roles['Casino Gold'];
                
                if (silverRole) {
                    await channel.permissionOverwrites.edit(silverRole, {
                        ViewChannel: false
                    });
                }
                
                if (goldRole) {
                    await channel.permissionOverwrites.edit(goldRole, {
                        ViewChannel: false
                    });
                }
            }
        }

        logger.info(`Updated VIP channel permissions in guild ${guild.name}`);
        return { success: true, message: 'Channel permissions updated' };
        
    } catch (error) {
        logger.error(`Error updating channel permissions: ${error.message}`);
        return { success: false, error: error.message };
    }
}

module.exports = {
    awardPurchaseRole,
    removePurchaseRole,
    getRoleInfo,
    getAllRoleRewards,
    setupVIPChannels,
    updateChannelPermissions,
    ROLE_REWARDS
};