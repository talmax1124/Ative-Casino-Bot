/**
 * Discord Server Products Handler
 * Manages server product purchases and rewards users with casino currency
 */

const { EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const { fmt, sendLogMessage } = require('./common');
const logger = require('./logger');
const roleManager = require('./roleManager');

// Product configuration - Updated with actual Discord SKU IDs from Developer Portal
const SERVER_PRODUCTS = {
    // 200K Coins - Durable Product
    'coins_200k': {
        id: '1411565695802028290',
        name: '💎 200K Coins Pack',
        description: '200,000 casino coins - Durable purchase',
        reward: 200000,
        price: 9.99
    },
    // 500K Coins - Durable Product
    'coins_500k': {
        id: '1411566011680948377',
        name: '👑 500K Coins Pack',
        description: '500,000 casino coins - Durable purchase',
        reward: 500000,
        price: 19.99
    },
    // 1M Coins - Durable Product
    'coins_1m': {
        id: '1411566149954441226',
        name: '🚀 1M Coins Pack',
        description: '1,000,000 casino coins - Durable purchase',
        reward: 1000000,
        price: 39.99
    },
    // Diamond Subscription - User Subscription
    'diamond_subscription': {
        id: '1411543496866664479',
        name: '💎 Diamond Subscription',
        description: 'Premium subscription with exclusive benefits',
        reward: 50000, // Monthly bonus coins
        price: 4.99, // Monthly
        type: 'subscription'
    },
    // Ruby Subscription - User Subscription
    'ruby_subscription': {
        id: '1411553720591712326',
        name: '🔴 Ruby Subscription',
        description: 'Ruby tier subscription with VIP perks',
        reward: 100000, // Monthly bonus coins
        price: 9.99, // Monthly
        type: 'subscription'
    }
};

/**
 * Handle entitlement creation (new purchase)
 */
async function handleEntitlementCreate(entitlement, client) {
    try {
        logger.info(`Processing new entitlement: ${entitlement.id} for SKU: ${entitlement.sku_id}`);
        
        // Find the product configuration
        const product = findProductBySku(entitlement.sku_id);
        if (!product) {
            logger.warn(`Unknown SKU ID: ${entitlement.sku_id}`);
            return;
        }

        // Get user and guild info
        const userId = entitlement.user_id;
        const guildId = entitlement.guild_id;
        
        if (!userId) {
            logger.error('Entitlement missing user_id');
            return;
        }

        // Ensure user exists in database
        const user = await client.users.fetch(userId).catch(() => null);
        if (!user) {
            logger.error(`Could not fetch user ${userId}`);
            return;
        }

        await dbManager.ensureUser(userId, user.displayName);

        // Calculate final reward with subscription bonuses
        const finalReward = await calculateRewardWithBonus(userId, guildId, product.reward, client);
        
        // Add the purchased amount to user's wallet
        await dbManager.updateUserBalance(userId, guildId, finalReward, 0);
        
        // Award VIP role based on purchase tier
        let roleResult = { success: false, message: 'No role configured' };
        try {
            const guild = client.guilds.cache.get(guildId);
            if (guild) {
                roleResult = await roleManager.awardPurchaseRole(guild, user, entitlement.sku_id);
                logger.info(`Role award result for ${user.displayName}: ${roleResult.message}`);
            }
        } catch (roleError) {
            logger.error(`Error awarding role: ${roleError.message}`);
        }
        
        // Record the purchase in database  
        await recordPurchase(entitlement, product, userId, guildId, roleResult, finalReward);
        
        // Log the purchase
        logger.info(`Processed purchase: ${user.displayName} bought ${product.name} for ${fmt(product.reward)} coins`);
        
        // Send notification to user (if possible)
        await sendPurchaseNotification(user, product, client, roleResult, finalReward);
        
        // Send purchase announcement to purchase channel
        await sendPurchaseAnnouncement(client, product, user, guildId, finalReward);
        
        // Send log to admin channel (bot activity)
        await sendPurchaseLog(client, entitlement, product, user, guildId, roleResult, finalReward);

        // Handle different entitlement types
        if (entitlement.type === 8) { // APPLICATION_ENTITLEMENT_TYPE_ONE_TIME_PURCHASE (Durable products)
            // Don't consume durable products - they should remain active
            logger.info(`Durable product purchased: ${entitlement.id}`);
        } else if (entitlement.type === 1) { // USER_SUBSCRIPTION
            // Subscriptions are automatically handled by Discord
            logger.info(`Subscription activated: ${entitlement.id}`);
        }

    } catch (error) {
        logger.error(`Error processing entitlement: ${error.message}`);
        logger.error(error.stack);
    }
}

/**
 * Handle entitlement updates (subscription renewals, etc.)
 */
async function handleEntitlementUpdate(oldEntitlement, newEntitlement, client) {
    try {
        logger.info(`Processing entitlement update: ${newEntitlement.id}`);
        
        // Handle subscription renewals or other updates
        // For now, just log it
        const product = findProductBySku(newEntitlement.sku_id);
        if (product) {
            logger.info(`Entitlement updated for product: ${product.name}`);
        }
        
    } catch (error) {
        logger.error(`Error processing entitlement update: ${error.message}`);
    }
}

/**
 * Handle entitlement deletion (refunds, cancellations)
 */
async function handleEntitlementDelete(entitlement, client) {
    try {
        logger.info(`Processing entitlement deletion: ${entitlement.id}`);
        
        // For security, we don't automatically remove coins on refunds
        // This should be handled manually by admins to prevent abuse
        const product = findProductBySku(entitlement.sku_id);
        if (product) {
            logger.warn(`Entitlement deleted for product: ${product.name} - Manual review may be needed`);
            
            // Send alert to admin channel
            if (client.channels) {
                const logChannel = client.channels.cache.get('1405096821512212521');
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setTitle('⚠️ Entitlement Deleted')
                        .setDescription(`An entitlement was deleted - may require manual review`)
                        .addFields(
                            { name: 'Product', value: product.name, inline: true },
                            { name: 'Entitlement ID', value: entitlement.id, inline: true },
                            { name: 'User ID', value: entitlement.user_id || 'Unknown', inline: true }
                        )
                        .setColor(0xFFA500)
                        .setTimestamp();
                    
                    await logChannel.send({ embeds: [embed] });
                }
            }
        }
        
    } catch (error) {
        logger.error(`Error processing entitlement deletion: ${error.message}`);
    }
}

/**
 * Calculate reward with subscription bonuses
 */
async function calculateRewardWithBonus(userId, guildId, baseReward, client) {
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return baseReward;

        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return baseReward;

        // Check for subscription roles using role IDs and apply bonuses
        let bonusMultiplier = 1.0;
        
        if (member.roles.cache.has('1411582733813158001')) { // Ruby role ID
            bonusMultiplier = 1.10; // 10% bonus for Ruby subscribers
        } else if (member.roles.cache.has('1411582691073196155')) { // Diamond role ID
            bonusMultiplier = 1.05; // 5% bonus for Diamond subscribers
        }

        const finalReward = Math.floor(baseReward * bonusMultiplier);
        
        if (bonusMultiplier > 1.0) {
            logger.info(`Applied ${((bonusMultiplier - 1) * 100).toFixed(0)}% subscription bonus: ${baseReward} → ${finalReward} coins`);
        }
        
        return finalReward;
    } catch (error) {
        logger.error(`Error calculating subscription bonus: ${error.message}`);
        return baseReward;
    }
}

/**
 * Find product configuration by SKU ID
 */
function findProductBySku(skuId) {
    return Object.values(SERVER_PRODUCTS).find(product => product.id === skuId);
}

/**
 * Record purchase in database
 */
async function recordPurchase(entitlement, product, userId, guildId, roleResult = null, finalReward = null) {
    try {
        // You'll need to create this table in your database
        await dbManager.query(`
            INSERT INTO purchases (
                entitlement_id, 
                sku_id, 
                user_id, 
                guild_id, 
                product_name, 
                reward_amount,
                final_reward_amount,
                price,
                role_awarded,
                role_name,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
            entitlement.id,
            entitlement.sku_id, 
            userId,
            guildId,
            product.name,
            product.reward,
            finalReward || product.reward,
            product.price,
            roleResult?.success || false,
            roleResult?.roleName || null
        ]);
    } catch (error) {
        logger.error(`Failed to record purchase: ${error.message}`);
    }
}

/**
 * Send purchase notification to user
 */
async function sendPurchaseNotification(user, product, client, roleResult = null, finalReward = null) {
    try {
        const actualReward = finalReward || product.reward;
        const fields = [
            { name: '🎁 Product', value: product.name, inline: false }
        ];

        // Show bonus information if applicable
        if (finalReward && finalReward > product.reward) {
            const bonusAmount = finalReward - product.reward;
            const bonusPercent = Math.round(((finalReward / product.reward) - 1) * 100);
            fields.push({ 
                name: '💰 Reward', 
                value: `${fmt(product.reward)} base coins + ${fmt(bonusAmount)} bonus (${bonusPercent}% subscription bonus)\n**Total: ${fmt(actualReward)} coins!** 🎉`, 
                inline: false 
            });
        } else {
            fields.push({ 
                name: '💰 Reward', 
                value: `${fmt(actualReward)} coins added to your wallet!`, 
                inline: false 
            });
        }

        // Add role information if awarded
        if (roleResult?.success && roleResult.roleName) {
            const roleText = roleResult.hadRole 
                ? `You already had the ${roleResult.roleName} role!`
                : `You've been awarded the ${roleResult.roleName} role! 🎭`;
            fields.push({ name: '🎭 VIP Status', value: roleText, inline: false });
        }

        const embed = new EmbedBuilder()
            .setTitle('🎉 Purchase Successful!')
            .setDescription(`Thank you for your purchase!`)
            .addFields(fields)
            .setColor(0x00FF00)
            .setTimestamp();
            
        await user.send({ embeds: [embed] }).catch(() => {
            logger.warn(`Could not send purchase notification to user ${user.id}`);
        });
    } catch (error) {
        logger.error(`Error sending purchase notification: ${error.message}`);
    }
}

/**
 * Send purchase announcement to purchase channel
 */
async function sendPurchaseAnnouncement(client, product, user, guildId, finalReward = null) {
    try {
        const PURCHASE_CHANNEL_ID = '1403244656845787170'; // Purchase announcements channel
        const announcementChannel = client.channels.cache.get(PURCHASE_CHANNEL_ID);
        
        if (!announcementChannel) {
            logger.warn(`Purchase announcement channel ${PURCHASE_CHANNEL_ID} not found`);
            return;
        }

        const actualReward = finalReward || product.reward;
        
        // Create announcement embed
        let description = `🎉 **${user.displayName}** just purchased **${product.name}**!`;
        
        // Add bonus information if applicable
        if (finalReward && finalReward > product.reward) {
            const bonusAmount = finalReward - product.reward;
            const bonusPercent = Math.round(((finalReward / product.reward) - 1) * 100);
            description += `\n✨ **Subscription Bonus:** +${fmt(bonusAmount)} coins (${bonusPercent}% bonus)!`;
        }
        
        const embed = new EmbedBuilder()
            .setTitle('🛒 New Purchase!')
            .setDescription(description)
            .addFields(
                { name: '💰 Coins Received', value: fmt(actualReward), inline: true },
                { name: '💵 Price', value: `$${product.price}`, inline: true },
                { name: '🎮 Ready to Play!', value: 'Use `/balance` to check your coins', inline: false }
            )
            .setColor(0x00FF00)
            .setTimestamp()
            .setThumbnail(user.displayAvatarURL());

        await announcementChannel.send({ embeds: [embed] });
        logger.info(`Sent purchase announcement for ${user.displayName} to channel ${PURCHASE_CHANNEL_ID}`);
        
    } catch (error) {
        logger.error(`Error sending purchase announcement: ${error.message}`);
    }
}

/**
 * Send purchase log to admin channel
 */
async function sendPurchaseLog(client, entitlement, product, user, guildId, roleResult = null, finalReward = null) {
    try {
        const actualReward = finalReward || product.reward;
        let logMessage = `💳 **Server Product Purchase**\n` +
            `**User:** ${user.displayName} (\`${user.id}\`)\n` +
            `**Product:** ${product.name}\n` +
            `**Base Reward:** ${fmt(product.reward)} coins\n`;

        // Add bonus information if applicable
        if (finalReward && finalReward > product.reward) {
            const bonusAmount = finalReward - product.reward;
            const bonusPercent = Math.round(((finalReward / product.reward) - 1) * 100);
            logMessage += `**Subscription Bonus:** +${fmt(bonusAmount)} coins (${bonusPercent}%)\n` +
                `**Final Reward:** ${fmt(actualReward)} coins 🎉\n`;
        } else {
            logMessage += `**Final Reward:** ${fmt(actualReward)} coins\n`;
        }

        logMessage += `**Price:** $${product.price}\n` +
            `**Entitlement ID:** \`${entitlement.id}\``;

        // Add role information to log
        if (roleResult?.success && roleResult.roleName) {
            logMessage += `\n**Role Awarded:** ${roleResult.roleName} 🎭`;
        } else if (roleResult?.success === false) {
            logMessage += `\n**Role Award:** Failed - ${roleResult.error || 'Unknown error'}`;
        }

        await sendLogMessage(
            client,
            'info',
            logMessage,
            user.id,
            guildId
        );
    } catch (error) {
        logger.error(`Error sending purchase log: ${error.message}`);
    }
}

/**
 * Get all available products for display
 */
function getAvailableProducts() {
    return Object.values(SERVER_PRODUCTS);
}

/**
 * Get product by key
 */
function getProduct(productKey) {
    return SERVER_PRODUCTS[productKey];
}

/**
 * Create database table for purchases (run once)
 */
async function initializePurchaseTable() {
    try {
        await dbManager.query(`
            CREATE TABLE IF NOT EXISTS purchases (
                id INT AUTO_INCREMENT PRIMARY KEY,
                entitlement_id VARCHAR(255) UNIQUE NOT NULL,
                sku_id VARCHAR(255) NOT NULL,
                user_id VARCHAR(255) NOT NULL,
                guild_id VARCHAR(255),
                product_name VARCHAR(255) NOT NULL,
                reward_amount BIGINT NOT NULL,
                final_reward_amount BIGINT NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                role_awarded BOOLEAN DEFAULT FALSE,
                role_name VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_id (user_id),
                INDEX idx_guild_id (guild_id),
                INDEX idx_created_at (created_at)
            )
        `);
        logger.info('Purchases table initialized successfully');
    } catch (error) {
        logger.error(`Failed to initialize purchases table: ${error.message}`);
    }
}

module.exports = {
    SERVER_PRODUCTS,
    handleEntitlementCreate,
    handleEntitlementUpdate, 
    handleEntitlementDelete,
    findProductBySku,
    getAvailableProducts,
    getProduct,
    initializePurchaseTable
};