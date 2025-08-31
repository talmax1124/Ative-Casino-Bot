/**
 * Discord Server Products Handler
 * Manages server product purchases and rewards users with casino currency
 */

const { EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const { fmt, sendLogMessage } = require('./common');
const logger = require('./logger');

// Product configuration - Define your server products here
const SERVER_PRODUCTS = {
    // Example products - replace with your actual Discord Server Products SKU IDs
    'small_coin_pack': {
        id: 'sku_small_coins',
        name: '🪙 Small Coin Pack',
        description: '1,000 casino coins',
        reward: 1000,
        price: 0.99
    },
    'medium_coin_pack': {
        id: 'sku_medium_coins', 
        name: '💰 Medium Coin Pack',
        description: '5,000 casino coins + 10% bonus',
        reward: 5500,
        price: 4.99
    },
    'large_coin_pack': {
        id: 'sku_large_coins',
        name: '💎 Large Coin Pack', 
        description: '15,000 casino coins + 25% bonus',
        reward: 18750,
        price: 14.99
    },
    'mega_coin_pack': {
        id: 'sku_mega_coins',
        name: '👑 Mega Coin Pack',
        description: '50,000 casino coins + 50% bonus',
        reward: 75000, 
        price: 39.99
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

        // Add the purchased amount to user's wallet
        await dbManager.updateUserBalance(userId, guildId, product.reward, 0);
        
        // Record the purchase in database
        await recordPurchase(entitlement, product, userId, guildId);
        
        // Log the purchase
        logger.info(`Processed purchase: ${user.displayName} bought ${product.name} for ${fmt(product.reward)} coins`);
        
        // Send notification to user (if possible)
        await sendPurchaseNotification(user, product, client);
        
        // Send log to admin channel
        await sendPurchaseLog(client, entitlement, product, user, guildId);

        // Consume the entitlement if it's a one-time purchase
        if (entitlement.type === 8) { // APPLICATION_ENTITLEMENT_TYPE_ONE_TIME_PURCHASE
            try {
                await entitlement.consume();
                logger.info(`Consumed entitlement: ${entitlement.id}`);
            } catch (consumeError) {
                logger.error(`Failed to consume entitlement ${entitlement.id}: ${consumeError.message}`);
            }
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
 * Find product configuration by SKU ID
 */
function findProductBySku(skuId) {
    return Object.values(SERVER_PRODUCTS).find(product => product.id === skuId);
}

/**
 * Record purchase in database
 */
async function recordPurchase(entitlement, product, userId, guildId) {
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
                price, 
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
            entitlement.id,
            entitlement.sku_id, 
            userId,
            guildId,
            product.name,
            product.reward,
            product.price
        ]);
    } catch (error) {
        logger.error(`Failed to record purchase: ${error.message}`);
    }
}

/**
 * Send purchase notification to user
 */
async function sendPurchaseNotification(user, product, client) {
    try {
        const embed = new EmbedBuilder()
            .setTitle('🎉 Purchase Successful!')
            .setDescription(`Thank you for your purchase!`)
            .addFields(
                { name: '🎁 Product', value: product.name, inline: false },
                { name: '💰 Reward', value: `${fmt(product.reward)} coins added to your wallet!`, inline: false }
            )
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
 * Send purchase log to admin channel
 */
async function sendPurchaseLog(client, entitlement, product, user, guildId) {
    try {
        await sendLogMessage(
            client,
            'info',
            `💳 **Server Product Purchase**\n` +
            `**User:** ${user.displayName} (\`${user.id}\`)\n` +
            `**Product:** ${product.name}\n` +
            `**Reward:** ${fmt(product.reward)} coins\n` +
            `**Price:** $${product.price}\n` +
            `**Entitlement ID:** \`${entitlement.id}\``,
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
                price DECIMAL(10,2) NOT NULL,
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