/**
 * Shop Command - Display and purchase coin packs
 * Integrates with Discord Premium Apps/SKUs
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { fmt, getGuildId } = require('../UTILS/common');
const serverProducts = require('../UTILS/serverProducts');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('🛒 Browse and purchase coin packs'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        
        try {
            // Get available products
            const products = serverProducts.getAvailableProducts();
            
            // Create shop embed
            const shopEmbed = new EmbedBuilder()
                .setTitle('🛒 ATIVE Casino Shop')
                .setDescription('Purchase coin packs to boost your gaming experience!')
                .setColor(0xFFD700)
                .setThumbnail(interaction.client.user.displayAvatarURL())
                .setFooter({ text: 'All purchases are processed securely through Discord' })
                .setTimestamp();

            // Add product fields
            products.forEach(product => {
                shopEmbed.addFields({
                    name: `${product.name} - $${product.price}`,
                    value: `${product.description}\n**Reward:** ${fmt(product.reward)} coins`,
                    inline: true
                });
            });

            // Add information field
            shopEmbed.addFields({
                name: '💳 How to Purchase',
                value: '1. Click the "Open Shop" button below\n2. Select a coin pack\n3. Complete purchase through Discord\n4. Coins are instantly added to your wallet!',
                inline: false
            });

            // Create buttons
            const buttons = new ActionRowBuilder();

            // Check if the bot has SKUs available
            try {
                // Fetch available SKUs from Discord
                const skus = await interaction.client.application.fetchSKUs();
                
                if (skus.size > 0) {
                    // Create shop button that opens Discord's purchase modal
                    buttons.addComponents(
                        new ButtonBuilder()
                            .setCustomId('open_premium_shop')
                            .setLabel('Open Shop')
                            .setEmoji('🛍️')
                            .setStyle(ButtonStyle.Premium) // Premium style for purchase buttons
                    );
                } else {
                    // No SKUs configured yet
                    shopEmbed.addFields({
                        name: '⚠️ Shop Setup Required',
                        value: 'The shop is not yet configured. Please ask an administrator to set up products in the Discord Developer Portal.',
                        inline: false
                    });
                }
            } catch (error) {
                logger.error(`Error fetching SKUs: ${error.message}`);
                
                // Fallback message
                shopEmbed.addFields({
                    name: '⚠️ Shop Temporarily Unavailable',
                    value: 'The shop is temporarily unavailable. Please try again later.',
                    inline: false
                });
            }

            // Add help button
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId('shop_help')
                    .setLabel('Help')
                    .setEmoji('❓')
                    .setStyle(ButtonStyle.Secondary)
            );

            // Send the shop embed
            await interaction.reply({
                embeds: [shopEmbed],
                components: buttons.components.length > 0 ? [buttons] : []
            });

        } catch (error) {
            logger.error(`Error in shop command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Shop Error')
                .setDescription('An error occurred while loading the shop. Please try again later.')
                .setColor(0xFF0000);
                
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },

    /**
     * Handle shop button interactions
     */
    async handleButtonInteraction(interaction) {
        const { customId } = interaction;
        
        if (customId === 'open_premium_shop') {
            // Handle opening Discord's premium shop
            try {
                // Fetch available SKUs
                const skus = await interaction.client.application.fetchSKUs();
                
                if (skus.size === 0) {
                    return await interaction.reply({
                        content: '❌ No products available at the moment.',
                        ephemeral: true
                    });
                }

                // Discord will handle the purchase flow through premium buttons
                // For now, we can show available products
                const skuList = Array.from(skus.values());
                
                // Create premium purchase buttons
                const purchaseButtons = new ActionRowBuilder();
                
                skuList.slice(0, 5).forEach(sku => {
                    purchaseButtons.addComponents(
                        new ButtonBuilder()
                            .setSKU(sku.id) // This creates a premium purchase button
                            .setStyle(ButtonStyle.Premium)
                    );
                });

                await interaction.reply({
                    content: '🛍️ **Select a product to purchase:**',
                    components: [purchaseButtons],
                    ephemeral: true
                });
                
            } catch (error) {
                logger.error(`Error opening premium shop: ${error.message}`);
                await interaction.reply({
                    content: '❌ Failed to load shop. Please try again later.',
                    ephemeral: true
                });
            }
            
        } else if (customId === 'shop_help') {
            // Show help information
            const helpEmbed = new EmbedBuilder()
                .setTitle('🛍️ Shop Help')
                .setDescription('Learn how to purchase and use coin packs!')
                .setColor(0x00AAFF)
                .addFields(
                    {
                        name: '💳 Purchasing',
                        value: '• Click "Open Shop" to view products\n• Select a coin pack to purchase\n• Complete payment through Discord\n• Coins are instantly added to your wallet',
                        inline: false
                    },
                    {
                        name: '🪙 Coin Packs',
                        value: '• Small Pack: Great for trying games\n• Medium Pack: Includes 10% bonus\n• Large Pack: Best value with 25% bonus\n• Mega Pack: Maximum coins with 50% bonus',
                        inline: false
                    },
                    {
                        name: '🔒 Security',
                        value: '• All payments are processed by Discord\n• We never see your payment information\n• Purchases are tied to your Discord account\n• Refunds are handled through Discord Support',
                        inline: false
                    },
                    {
                        name: '❓ Support',
                        value: 'If you have issues with purchases, contact:\n• Discord Support for payment issues\n• Our support team for coin delivery issues',
                        inline: false
                    }
                );
                
            await interaction.reply({
                embeds: [helpEmbed],
                ephemeral: true
            });
        }
    }
};