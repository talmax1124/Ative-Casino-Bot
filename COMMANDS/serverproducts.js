/**
 * Server Products command - Admin command to manage Discord Server Products
 * View purchase history and manage product configurations
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { fmt } = require('../UTILS/common');
const serverProducts = require('../UTILS/serverProducts');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');

const DEVELOPER_ID = '466050111680544798';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverproducts')
        .setDescription('🛒 Manage Discord Server Products (Admin only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all available server products')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('history')
                .setDescription('View purchase history')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to view history for (optional)')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option.setName('days')
                        .setDescription('Number of days to look back (default: 7)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(365)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View server products statistics')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('refund')
                .setDescription('Issue a refund for a purchase (removes coins)')
                .addStringOption(option =>
                    option.setName('entitlement_id')
                        .setDescription('Entitlement ID to refund')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for refund')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        
        // Check if user is developer or admin
        const isAdmin = userId === DEVELOPER_ID || interaction.memberPermissions?.has('Administrator');
        
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
                case 'list':
                    await handleListProducts(interaction);
                    break;
                case 'history':
                    await handlePurchaseHistory(interaction);
                    break;
                case 'stats':
                    await handleStats(interaction);
                    break;
                case 'refund':
                    await handleRefund(interaction);
                    break;
            }
        } catch (error) {
            logger.error(`Error in serverproducts command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Command Error')
                .setDescription('An error occurred while processing the command.')
                .setColor(0xFF0000);
                
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};

async function handleListProducts(interaction) {
    const products = serverProducts.getAvailableProducts();
    
    const embed = new EmbedBuilder()
        .setTitle('🛒 Available Server Products')
        .setDescription('Configure these products in the Discord Developer Portal')
        .setColor(0x00AAFF)
        .setTimestamp();
        
    for (const product of products) {
        embed.addFields({
            name: product.name,
            value: `**Reward:** ${fmt(product.reward)} coins\n**Price:** $${product.price}\n**SKU ID:** \`${product.id}\``,
            inline: true
        });
    }
    
    embed.setFooter({ 
        text: 'To set up: Discord Server Settings > Monetization > Server Products' 
    });
    
    await interaction.reply({ embeds: [embed] });
}

async function handlePurchaseHistory(interaction) {
    const targetUser = interaction.options.getUser('user');
    const days = interaction.options.getInteger('days') || 7;
    const guildId = interaction.guildId;
    
    let query = `
        SELECT p.*, u.username 
        FROM purchases p 
        LEFT JOIN users u ON p.user_id = u.user_id 
        WHERE p.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `;
    const params = [days];
    
    if (targetUser) {
        query += ` AND p.user_id = ?`;
        params.push(targetUser.id);
    }
    
    if (guildId) {
        query += ` AND p.guild_id = ?`;
        params.push(guildId);
    }
    
    query += ` ORDER BY p.created_at DESC LIMIT 20`;
    
    const purchases = await dbManager.query(query, params);
    
    const embed = new EmbedBuilder()
        .setTitle(`📊 Purchase History (Last ${days} days)`)
        .setColor(0x00AAFF)
        .setTimestamp();
        
    if (purchases.length === 0) {
        embed.setDescription('No purchases found in the specified time period.');
    } else {
        let description = '';
        let totalRevenue = 0;
        let totalCoinsAwarded = 0;
        
        for (const purchase of purchases.slice(0, 10)) {
            const date = new Date(purchase.created_at).toLocaleDateString();
            const username = purchase.username || 'Unknown User';
            description += `**${date}** - ${username}\n`;
            description += `└ ${purchase.product_name} - ${fmt(purchase.reward_amount)} coins ($${purchase.price})\n\n`;
            
            totalRevenue += parseFloat(purchase.price);
            totalCoinsAwarded += purchase.reward_amount;
        }
        
        embed.setDescription(description || 'No purchases found.');
        embed.addFields(
            { name: '💰 Total Revenue', value: `$${totalRevenue.toFixed(2)}`, inline: true },
            { name: '🪙 Coins Awarded', value: fmt(totalCoinsAwarded), inline: true },
            { name: '📦 Total Purchases', value: purchases.length.toString(), inline: true }
        );
    }
    
    if (purchases.length > 10) {
        embed.setFooter({ text: `Showing first 10 of ${purchases.length} purchases` });
    }
    
    await interaction.reply({ embeds: [embed] });
}

async function handleStats(interaction) {
    const guildId = interaction.guildId;
    
    // Get various statistics
    const [
        totalPurchases,
        weeklyPurchases,
        monthlyPurchases,
        totalRevenue,
        weeklyRevenue,
        monthlyRevenue,
        topProducts
    ] = await Promise.all([
        // Total purchases
        dbManager.query(`
            SELECT COUNT(*) as count, SUM(reward_amount) as coins, SUM(price) as revenue 
            FROM purchases 
            WHERE guild_id = ? OR guild_id IS NULL
        `, [guildId]).then(r => r[0] || {}),
        
        // Weekly purchases
        dbManager.query(`
            SELECT COUNT(*) as count, SUM(reward_amount) as coins, SUM(price) as revenue 
            FROM purchases 
            WHERE (guild_id = ? OR guild_id IS NULL) 
            AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        `, [guildId]).then(r => r[0] || {}),
        
        // Monthly purchases
        dbManager.query(`
            SELECT COUNT(*) as count, SUM(reward_amount) as coins, SUM(price) as revenue 
            FROM purchases 
            WHERE (guild_id = ? OR guild_id IS NULL) 
            AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        `, [guildId]).then(r => r[0] || {}),
        
        // Total revenue
        dbManager.query(`
            SELECT SUM(price) as total 
            FROM purchases 
            WHERE guild_id = ? OR guild_id IS NULL
        `, [guildId]).then(r => r[0]?.total || 0),
        
        // Weekly revenue
        dbManager.query(`
            SELECT SUM(price) as total 
            FROM purchases 
            WHERE (guild_id = ? OR guild_id IS NULL) 
            AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        `, [guildId]).then(r => r[0]?.total || 0),
        
        // Monthly revenue
        dbManager.query(`
            SELECT SUM(price) as total 
            FROM purchases 
            WHERE (guild_id = ? OR guild_id IS NULL) 
            AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        `, [guildId]).then(r => r[0]?.total || 0),
        
        // Top products
        dbManager.query(`
            SELECT product_name, COUNT(*) as count, SUM(price) as revenue 
            FROM purchases 
            WHERE (guild_id = ? OR guild_id IS NULL) 
            AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY product_name 
            ORDER BY count DESC 
            LIMIT 5
        `, [guildId])
    ]);
    
    const embed = new EmbedBuilder()
        .setTitle('📈 Server Products Statistics')
        .setColor(0x00AAFF)
        .setTimestamp()
        .addFields(
            { 
                name: '📦 Total Purchases', 
                value: `**All Time:** ${totalPurchases.count || 0}\n**This Month:** ${monthlyPurchases.count || 0}\n**This Week:** ${weeklyPurchases.count || 0}`, 
                inline: true 
            },
            { 
                name: '💰 Revenue', 
                value: `**All Time:** $${(totalRevenue || 0).toFixed(2)}\n**This Month:** $${(monthlyRevenue || 0).toFixed(2)}\n**This Week:** $${(weeklyRevenue || 0).toFixed(2)}`, 
                inline: true 
            },
            { 
                name: '🪙 Coins Awarded', 
                value: `**All Time:** ${fmt(totalPurchases.coins || 0)}\n**This Month:** ${fmt(monthlyPurchases.coins || 0)}\n**This Week:** ${fmt(weeklyPurchases.coins || 0)}`, 
                inline: true 
            }
        );
    
    if (topProducts.length > 0) {
        const productList = topProducts
            .map(p => `**${p.product_name}:** ${p.count} sales ($${parseFloat(p.revenue).toFixed(2)})`)
            .join('\n');
        
        embed.addFields({
            name: '🏆 Top Products (30 days)',
            value: productList,
            inline: false
        });
    }
    
    await interaction.reply({ embeds: [embed] });
}

async function handleRefund(interaction) {
    const entitlementId = interaction.options.getString('entitlement_id');
    const reason = interaction.options.getString('reason');
    
    // Find the purchase
    const purchase = await dbManager.query(`
        SELECT * FROM purchases WHERE entitlement_id = ?
    `, [entitlementId]);
    
    if (purchase.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Purchase Not Found')
            .setDescription(`No purchase found with entitlement ID: \`${entitlementId}\``)
            .setColor(0xFF0000);
            
        return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    
    const purchaseData = purchase[0];
    
    // Remove the coins from user's wallet
    const userBalance = await dbManager.getUserBalance(purchaseData.user_id, purchaseData.guild_id);
    const newWalletBalance = Math.max(0, userBalance.wallet - purchaseData.reward_amount);
    
    await dbManager.updateUserBalance(purchaseData.user_id, purchaseData.guild_id, {
        wallet: newWalletBalance
    });
    
    // Mark purchase as refunded in database
    await dbManager.query(`
        UPDATE purchases SET 
        refunded = TRUE, 
        refund_reason = ?, 
        refunded_at = NOW(),
        refunded_by = ?
        WHERE entitlement_id = ?
    `, [reason, interaction.user.id, entitlementId]);
    
    // Add refund tracking columns if they don't exist
    try {
        await dbManager.query(`
            ALTER TABLE purchases 
            ADD COLUMN IF NOT EXISTS refunded BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS refund_reason TEXT,
            ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP NULL,
            ADD COLUMN IF NOT EXISTS refunded_by VARCHAR(255)
        `);
    } catch (error) {
        // Columns might already exist
    }
    
    const embed = new EmbedBuilder()
        .setTitle('✅ Refund Processed')
        .setDescription(`Successfully processed refund for purchase.`)
        .addFields(
            { name: 'Product', value: purchaseData.product_name, inline: true },
            { name: 'User ID', value: purchaseData.user_id, inline: true },
            { name: 'Coins Removed', value: fmt(purchaseData.reward_amount), inline: true },
            { name: 'Reason', value: reason, inline: false }
        )
        .setColor(0x00FF00)
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
    
    logger.info(`Refund processed: ${purchaseData.product_name} for user ${purchaseData.user_id} by ${interaction.user.tag}`);
}