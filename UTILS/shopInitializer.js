/**
 * Shop System Initializer for ATIVE Casino Bot
 * Handles initialization of shop manager and role systems
 */

const shopManager = require('./shopManager');
const dbManager = require('./database');
const logger = require('./logger');

class ShopInitializer {
    /**
     * Initialize the complete shop system
     * @param {Client} client - Discord client instance
     */
    async initialize(client) {
        try {
            logger.info('Initializing shop system...');

            // Set Discord client for role management
            shopManager.setClient(client);

            // Initialize shop manager
            await shopManager.initialize();

            // Process existing role assignments for all guilds
            await this.processExistingRoleAssignments(client);

            logger.info('Shop system initialized successfully');
            return true;
        } catch (error) {
            logger.error(`Failed to initialize shop system: ${error.message}`);
            return false;
        }
    }

    /**
     * Process role assignments for existing purchases
     * @param {Client} client - Discord client instance
     */
    async processExistingRoleAssignments(client) {
        try {
            // Get all active role purchases
            const activeRolePurchases = await dbManager.databaseAdapter.executeQuery(`
                SELECT DISTINCT usp.user_id, si.metadata
                FROM user_shop_purchases usp
                LEFT JOIN shop_items si ON usp.item_id = si.id
                WHERE si.category = 'roles' 
                AND usp.active = true 
                AND (usp.expires_at IS NULL OR usp.expires_at > NOW())
            `);

            let processedCount = 0;

            for (const purchase of activeRolePurchases) {
                try {
                    const userId = purchase.user_id;
                    
                    // Process roles for this user in all guilds
                    for (const [guildId, guild] of client.guilds.cache) {
                        try {
                            const member = await guild.members.fetch(userId);
                            if (member) {
                                // Create a mock interaction for role processing
                                const mockInteraction = {
                                    guild: guild,
                                    member: member
                                };
                                
                                await shopManager.processUserRoles(mockInteraction, userId);
                                processedCount++;
                            }
                        } catch (memberError) {
                            // User might not be in this guild, skip
                        }
                    }
                } catch (userError) {
                    logger.error(`Error processing roles for user ${purchase.user_id}: ${userError.message}`);
                }
            }

            if (processedCount > 0) {
                logger.info(`Processed role assignments for ${processedCount} users`);
            }
        } catch (error) {
            logger.error(`Error processing existing role assignments: ${error.message}`);
        }
    }

    /**
     * Register shop event handlers
     * @param {Client} client - Discord client instance
     */
    registerEventHandlers(client) {
        // Handle guild member updates (role changes)
        client.on('guildMemberUpdate', async (oldMember, newMember) => {
            try {
                // Check if shop roles were manually removed and restore them
                const userId = newMember.user.id;
                const userRoles = await shopManager.getUserRoleColors(userId);
                
                if (userRoles.length > 0) {
                    const mockInteraction = {
                        guild: newMember.guild,
                        member: newMember
                    };
                    
                    await shopManager.processUserRoles(mockInteraction, userId);
                }
            } catch (error) {
                logger.error(`Error handling guild member update: ${error.message}`);
            }
        });

        // Handle bot joining new guilds
        client.on('guildCreate', async (guild) => {
            try {
                logger.info(`Bot joined new guild: ${guild.name} (${guild.id})`);
                
                // Process role assignments for all users with active purchases in this guild
                await this.processGuildRoleAssignments(guild);
            } catch (error) {
                logger.error(`Error handling guild create: ${error.message}`);
            }
        });

        logger.info('Shop event handlers registered');
    }

    /**
     * Process role assignments for a specific guild
     * @param {Guild} guild - Discord guild
     */
    async processGuildRoleAssignments(guild) {
        try {
            const activeRolePurchases = await dbManager.databaseAdapter.executeQuery(`
                SELECT DISTINCT usp.user_id
                FROM user_shop_purchases usp
                LEFT JOIN shop_items si ON usp.item_id = si.id
                WHERE si.category = 'roles' 
                AND usp.active = true 
                AND (usp.expires_at IS NULL OR usp.expires_at > NOW())
            `);

            for (const purchase of activeRolePurchases) {
                try {
                    const member = await guild.members.fetch(purchase.user_id);
                    if (member) {
                        const mockInteraction = {
                            guild: guild,
                            member: member
                        };
                        
                        await shopManager.processUserRoles(mockInteraction, purchase.user_id);
                    }
                } catch (memberError) {
                    // User not in this guild, skip
                }
            }
        } catch (error) {
            logger.error(`Error processing guild role assignments: ${error.message}`);
        }
    }
}

module.exports = new ShopInitializer();