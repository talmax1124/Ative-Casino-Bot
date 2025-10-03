/**
 * Member Cache Manager - Handles caching Discord member data to reduce API calls
 */

const db = require('./databaseAdapter');
const logger = require('./logger');
const { PermissionFlagsBits } = require('discord.js');

class MemberCacheManager {
    constructor() {
        this.cacheValidityHours = 6; // Cache valid for 6 hours
    }

    /**
     * Cache member data from Discord interaction
     */
    async cacheMemberFromInteraction(interaction) {
        try {
            const member = interaction.member;
            if (!member || !interaction.guildId) return { success: false };

            const memberData = this.extractMemberData(member, interaction.guildId);
            return await db.cacheGuildMember(memberData);

        } catch (error) {
            logger.error(`Error caching member from interaction: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Cache member data from Discord member object
     */
    async cacheMemberFromDiscord(member, guildId) {
        try {
            const memberData = this.extractMemberData(member, guildId);
            return await db.cacheGuildMember(memberData);

        } catch (error) {
            logger.error(`Error caching member from Discord: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Extract relevant member data from Discord member object
     */
    extractMemberData(member, guildId) {
        const roles = member.roles?.cache ? Array.from(member.roles.cache.keys()) : [];
        
        return {
            userId: member.user?.id || member.id,
            guildId: guildId,
            username: member.user?.username,
            displayName: member.user?.displayName || member.user?.globalName,
            nickname: member.nickname,
            roles: roles,
            permissions: member.permissions?.bitfield?.toString(),
            isOwner: member.guild?.ownerId === (member.user?.id || member.id),
            isAdministrator: (member.permissions && typeof member.permissions.has === 'function' && member.permissions.has(PermissionFlagsBits.Administrator)) || false,
            isModerator: (member.permissions && typeof member.permissions.has === 'function' && member.permissions.has(PermissionFlagsBits.ModerateMembers)) || false,
            isBooster: member.premiumSince !== null,
            premiumSince: member.premiumSince,
            joinedAt: member.joinedAt
        };
    }

    /**
     * Get member data with fallback to Discord API if cache is stale
     */
    async getMemberData(userId, guildId, guild = null) {
        try {
            // Validate parameters
            if (!userId || !guildId) {
                logger.debug(`Invalid parameters for getMemberData: userId=${userId}, guildId=${guildId}`);
                return { success: false, member: null, error: 'Invalid userId or guildId' };
            }

            // Try to get from cache first
            const { success, member } = await db.getCachedGuildMember(userId, guildId);
            
            if (success && member && this.isCacheValid(member.last_updated)) {
                return { success: true, member, source: 'cache' };
            }

            // If no guild object provided, return cached data even if stale
            if (!guild) {
                return { success: success && member, member, source: 'cache_stale' };
            }

            // Fallback to Discord API
            try {
                const discordMember = await guild.members.fetch(userId);
                if (discordMember) {
                    // Cache the fresh data
                    await this.cacheMemberFromDiscord(discordMember, guildId);
                    
                    // Return extracted data
                    const memberData = this.extractMemberData(discordMember, guildId);
                    return { success: true, member: memberData, source: 'discord' };
                }
            } catch (fetchError) {
                logger.warn(`Could not fetch member ${userId} from Discord: ${fetchError.message}`);
                
                // Return stale cache if available
                if (success && member) {
                    return { success: true, member, source: 'cache_stale' };
                }
            }

            return { success: false, member: null };

        } catch (error) {
            logger.error(`Error getting member data: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if cached data is still valid
     */
    isCacheValid(lastUpdated) {
        if (!lastUpdated) return false;
        
        const cacheTime = new Date(lastUpdated);
        const now = new Date();
        const hoursDiff = (now - cacheTime) / (1000 * 60 * 60);
        
        return hoursDiff < this.cacheValidityHours;
    }

    /**
     * Check if user is admin using cached data with fallback
     */
    async isUserAdmin(userId, guildId, guild = null) {
        try {
            // Try database first
            const { success, isAdmin } = await db.isUserAdmin(userId, guildId);
            if (success) {
                return { success: true, isAdmin };
            }

            // Fallback to getting fresh data
            const { success: memberSuccess, member } = await this.getMemberData(userId, guildId, guild);
            if (memberSuccess && member) {
                return { success: true, isAdmin: member.is_administrator || member.is_owner };
            }

            return { success: false, isAdmin: false };

        } catch (error) {
            logger.error(`Error checking admin status: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if user is moderator using cached data with fallback
     */
    async isUserModerator(userId, guildId, guild = null) {
        try {
            // Try database first
            const { success, isModerator } = await db.isUserModerator(userId, guildId);
            if (success) {
                return { success: true, isModerator };
            }

            // Fallback to getting fresh data
            const { success: memberSuccess, member } = await this.getMemberData(userId, guildId, guild);
            if (memberSuccess && member) {
                return { 
                    success: true, 
                    isModerator: member.is_moderator || member.is_administrator || member.is_owner 
                };
            }

            return { success: false, isModerator: false };

        } catch (error) {
            logger.error(`Error checking moderator status: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if user has specific role using cached data with fallback
     */
    async userHasRole(userId, guildId, roleId, guild = null) {
        try {
            // Try database first
            const { success, hasRole } = await db.userHasRole(userId, guildId, roleId);
            if (success) {
                return { success: true, hasRole };
            }

            // Fallback to getting fresh data
            const { success: memberSuccess, member } = await this.getMemberData(userId, guildId, guild);
            if (memberSuccess && member && member.roles) {
                return { success: true, hasRole: member.roles.includes(roleId) };
            }

            return { success: false, hasRole: false };

        } catch (error) {
            logger.error(`Error checking user role: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if user is booster using cached data with fallback
     */
    async isUserBooster(userId, guildId, guild = null) {
        try {
            // Try database first
            const { success, isBooster } = await db.isUserBooster(userId, guildId);
            if (success) {
                return { success: true, isBooster };
            }

            // Fallback to getting fresh data
            const { success: memberSuccess, member } = await this.getMemberData(userId, guildId, guild);
            if (memberSuccess && member) {
                return { success: true, isBooster: member.is_booster };
            }

            return { success: false, isBooster: false };

        } catch (error) {
            logger.error(`Error checking booster status: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update roles for a user when they change
     */
    async updateUserRoles(userId, guildId, roles) {
        return await db.updateUserRoles(userId, guildId, roles);
    }
}

module.exports = new MemberCacheManager();