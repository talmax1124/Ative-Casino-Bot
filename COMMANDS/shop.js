/**
 * Shop command for ATIVE Casino Bot
 * Allows users to purchase boosts, unlocks, decorations, and role colors
 */

const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage } = require('../UTILS/common');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Browse and purchase items from the ATIVE Casino Shop'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        try {
            await dbManager.ensureUser(userId, interaction.user.username);
            // Just open the main shop browser directly
            await this.handleBrowse(interaction, userId, guildId);
        } catch (error) {
            logger.error(`Error in shop command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Shop Error',
                topFields: [
                    { name: '🔧 System Error', value: 'Failed to process shop command. Please try again.' }
                ],
                stageText: 'SYSTEM ERROR',
                color: 0xFF0000,
                footer: 'Please try again later'
            });

            try {
                const replyMethod = interaction.deferred || interaction.replied ? 'editReply' : 'reply';
                await interaction[replyMethod]({ embeds: [errorEmbed] });
            } catch (replyError) {
                logger.error(`Failed to send shop error reply: ${replyError.message}`);
            }
        }
    },

    /**
     * Handle shop browsing with category selection
     */
    async handleBrowse(interaction, userId, guildId) {
        const balance = await dbManager.getUserBalance(userId, guildId);
        
        // Create category selection embed
        const browseEmbed = buildSessionEmbed({
            title: `🛒 ${interaction.user.username}'s Shop`,
            topFields: [
                { 
                    name: '💎 Welcome to the ATIVE Casino Shop!', 
                    value: 'Select a category below to browse available items.' 
                },
                {
                    name: '📊 Your Balance',
                    value: `**Wallet:** ${fmt(balance.wallet)}\n**Bank:** ${fmt(balance.bank)}`
                }
            ],
            stageText: 'SELECT CATEGORY',
            color: 0x00D4FF,
            footer: 'Choose a category to see available items'
        });

        // Create category selection dropdown
        const options = [
            {
                label: '⚡ Boosts',
                description: 'Temporary multipliers and bonuses',
                value: 'boosts',
                emoji: '⚡'
            },
            {
                label: '🔓 Unlocks',
                description: 'Permanent feature unlocks and bypasses',
                value: 'unlocks',
                emoji: '🔓'
            },
            {
                label: '🎨 Decorations',
                description: 'Profile frames and cosmetic items',
                value: 'decorations',
                emoji: '🎨'
            },
            {
                label: '⚒️ Utilities',
                description: 'Helpful tools and improvements',
                value: 'utilities',
                emoji: '⚒️'
            }
        ];

        // Only add Role Colors option for specific guild
        if (interaction.guildId === '1403244656845787167') {
            options.splice(3, 0, {
                label: '🌈 Role Colors',
                description: 'Custom colored usernames',
                value: 'roles',
                emoji: '🌈'
            });
        }

        const categorySelect = new StringSelectMenuBuilder()
            .setCustomId('shop_category_select')
            .setPlaceholder('Choose a shop category')
            .addOptions(options);

        const categoryRow = new ActionRowBuilder().addComponents(categorySelect);
        
        // Create additional buttons
        const buttonRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('shop_inventory')
                    .setLabel('📦 My Inventory')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('shop_active_boosts')
                    .setLabel('⚡ Active Boosts')
                    .setStyle(ButtonStyle.Success)
            );

        // Check if this is a component interaction (button/select) or a command interaction
        let response;
        if (interaction.isButton()) {
            // This is a button interaction - use update
            response = await interaction.update({
                embeds: [browseEmbed],
                components: [categoryRow, buttonRow]
            });
        } else if (interaction.deferred || interaction.replied) {
            // This is a deferred or replied interaction - use editReply
            response = await interaction.editReply({
                embeds: [browseEmbed],
                components: [categoryRow, buttonRow]
            });
        } else {
            // This is likely an initial command - defer and then editReply
            await interaction.deferReply();
            response = await interaction.editReply({
                embeds: [browseEmbed],
                components: [categoryRow, buttonRow]
            });
        }

        // Set up collectors for interactions
        const selectCollector = response.createMessageComponentCollector({
            filter: i => i.customId === 'shop_category_select' && i.user.id === userId,
            time: 300000 // 5 minutes
        });

        const buttonCollector = response.createMessageComponentCollector({
            filter: i => i.customId.startsWith('shop_') && i.user.id === userId,
            time: 300000 // 5 minutes
        });

        selectCollector.on('collect', async (i) => {
            const category = i.values[0];
            await this.showCategoryItems(i, userId, guildId, category);
        });

        buttonCollector.on('collect', async (i) => {
            if (i.customId === 'shop_inventory') {
                await this.showInventory(i, userId, guildId);
            } else if (i.customId === 'shop_active_boosts') {
                await this.showActiveBoosts(i, userId, guildId);
            }
        });

        selectCollector.on('end', () => {
            // Disable components when collector ends
            categorySelect.setDisabled(true);
            buttonRow.components.forEach(button => button.setDisabled(true));
            interaction.editReply({ components: [categoryRow, buttonRow] }).catch(() => {});
        });
    },

    /**
     * Show items in selected category
     */
    async showCategoryItems(interaction, userId, guildId, category) {
        // Restrict role colors category to specific guild only
        if (category === 'roles' && guildId !== '1403244656845787167') {
            await interaction.reply({
                content: '❌ Role colors are not available in this server.',
                ephemeral: true
            });
            return;
        }

        const items = await dbManager.getShopItems(category);
        const balance = await dbManager.getUserBalance(userId, guildId);

        if (items.length === 0) {
            const emptyEmbed = buildSessionEmbed({
                title: `🛒 ${this.getCategoryDisplayName(category)}`,
                topFields: [
                    { name: '📭 No Items Available', value: 'This category is currently empty.' }
                ],
                stageText: 'CATEGORY EMPTY',
                color: 0xFFAA00,
                footer: 'Check back later for new items!'
            });

            return await interaction.update({ embeds: [emptyEmbed], components: [] });
        }

        // Create fields for each item
        const itemFields = [];
        let itemList = '';

        for (const item of items) {
            const canAfford = balance.wallet >= item.price;
            const priceColor = canAfford ? '💚' : '❌';
            const duration = item.duration_hours ? ` (${item.duration_hours}h)` : ' (Permanent)';
            
            // For role items, extract name and color from metadata
            let displayName = item.name;
            let displayDescription = item.description;
            
            if (item.category === 'roles' && item.metadata) {
                try {
                    const metadata = JSON.parse(item.metadata);
                    if (metadata.role_name && metadata.role_color) {
                        displayName = `${metadata.role_name}`;
                        displayDescription = `Get a ${metadata.role_color} colored username in chat`;
                    }
                } catch (error) {
                    // Keep original name/description if metadata parsing fails
                }
            }
            
            itemList += `**${item.id}.** ${displayName}${duration}\n`;
            itemList += `${priceColor} ${fmt(item.price)} - ${displayDescription}\n\n`;
        }

        const categoryEmbed = buildSessionEmbed({
            title: `🛒 ${this.getCategoryDisplayName(category)}`,
            topFields: [
                { name: '📦 Available Items', value: itemList.trim() },
                { name: '💰 Your Wallet', value: fmt(balance.wallet) }
            ],
            stageText: 'SELECT ITEM TO PURCHASE',
            color: 0x00D4FF,
            footer: 'Use /shop buy <item_id> to purchase an item'
        });

        // Create purchase buttons for affordable items (up to 25 buttons max due to Discord limits)
        const purchaseButtons = [];
        const affordableItems = items.filter(item => balance.wallet >= item.price).slice(0, 25);

        for (const item of affordableItems) {
            // For role items, use the role name from metadata for button label
            let buttonLabel = `Buy ${item.name}`;
            
            if (item.category === 'roles' && item.metadata) {
                try {
                    const metadata = JSON.parse(item.metadata);
                    if (metadata.role_name) {
                        buttonLabel = `Buy ${metadata.role_name}`;
                    }
                } catch (error) {
                    // Keep original name if metadata parsing fails
                }
            }
            
            purchaseButtons.push(
                new ButtonBuilder()
                    .setCustomId(`shop_buy_${item.id}`)
                    .setLabel(buttonLabel)
                    .setStyle(ButtonStyle.Primary)
            );
        }

        const components = [];
        
        if (purchaseButtons.length > 0) {
            // Split buttons into rows of 5 max
            for (let i = 0; i < purchaseButtons.length; i += 5) {
                const row = new ActionRowBuilder()
                    .addComponents(purchaseButtons.slice(i, i + 5));
                components.push(row);
            }
        }

        // Add back button
        const backButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('shop_back')
                    .setLabel('🔙 Back to Categories')
                    .setStyle(ButtonStyle.Secondary)
            );
        components.push(backButton);

        const response = await interaction.update({
            embeds: [categoryEmbed],
            components: components
        });

        // Set up collector for purchase buttons
        const collector = response.createMessageComponentCollector({
            filter: i => i.user.id === userId,
            time: 300000 // 5 minutes
        });

        collector.on('collect', async (i) => {
            if (i.customId === 'shop_back') {
                await this.handleBrowse(i, userId, guildId);
            } else if (i.customId.startsWith('shop_buy_')) {
                const itemId = parseInt(i.customId.replace('shop_buy_', ''));
                await this.handlePurchaseConfirmation(i, userId, guildId, itemId);
            }
        });
    },

    /**
     * Handle purchase confirmation
     */
    async handlePurchaseConfirmation(interaction, userId, guildId, itemId) {
        const item = await dbManager.getShopItem(itemId);
        const balance = await dbManager.getUserBalance(userId, guildId);

        if (!item) {
            const errorEmbed = buildSessionEmbed({
                title: '❌ Item Not Found',
                topFields: [
                    { name: '🔍 Error', value: 'The selected item was not found.' }
                ],
                stageText: 'ITEM NOT FOUND',
                color: 0xFF0000
            });
            return await interaction.update({ embeds: [errorEmbed], components: [] });
        }

        if (balance.wallet < item.price) {
            const errorEmbed = buildSessionEmbed({
                title: '❌ Insufficient Funds',
                topFields: [
                    { name: '💰 Your Wallet', value: fmt(balance.wallet) },
                    { name: '💸 Item Price', value: fmt(item.price) },
                    { name: '❌ Shortfall', value: fmt(item.price - balance.wallet) }
                ],
                stageText: 'INSUFFICIENT FUNDS',
                color: 0xFF0000,
                footer: 'Earn more money and try again!'
            });
            return await interaction.update({ embeds: [errorEmbed], components: [] });
        }

        // Check if user already owns permanent item
        if (!item.duration_hours) {
            const purchases = await dbManager.getUserShopPurchases(userId, true);
            const alreadyOwned = purchases.some(p => p.item_id === itemId);
            
            if (alreadyOwned) {
                const errorEmbed = buildSessionEmbed({
                    title: '❌ Already Owned',
                    topFields: [
                        { name: '📦 Item Status', value: `You already own **${item.name}**` }
                    ],
                    stageText: 'ALREADY OWNED',
                    color: 0xFFAA00
                });
                return await interaction.update({ embeds: [errorEmbed], components: [] });
            }
        }

        // Show confirmation with proper role name and color display
        let displayName = item.name;
        let displayDescription = item.description;
        
        if (item.category === 'roles' && item.metadata) {
            try {
                const metadata = JSON.parse(item.metadata);
                if (metadata.role_name && metadata.role_color) {
                    displayName = `${metadata.role_name}`;
                    displayDescription = `Get a ${metadata.role_color} colored username in chat`;
                }
            } catch (error) {
                // Keep original name/description if metadata parsing fails
            }
        }
        
        const confirmEmbed = buildSessionEmbed({
            title: '🛒 Purchase Confirmation',
            topFields: [
                { name: '📦 Item', value: `**${displayName}**\n${displayDescription}` },
                { name: '💸 Price', value: fmt(item.price) },
                { name: '⏰ Duration', value: item.duration_hours ? `${item.duration_hours} hours` : 'Permanent' },
                { name: '💰 Remaining Balance', value: fmt(balance.wallet - item.price) }
            ],
            stageText: 'CONFIRM PURCHASE',
            color: 0xFFAA00,
            footer: 'This action cannot be undone'
        });

        const confirmButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`confirm_purchase_${itemId}`)
                    .setLabel('✅ Confirm Purchase')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('cancel_purchase')
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Danger)
            );

        const response = await interaction.update({
            embeds: [confirmEmbed],
            components: [confirmButtons]
        });

        const collector = response.createMessageComponentCollector({
            filter: i => i.user.id === userId,
            time: 60000 // 1 minute
        });

        collector.on('collect', async (i) => {
            if (i.customId === `confirm_purchase_${itemId}`) {
                await this.processPurchase(i, userId, guildId, itemId);
            } else if (i.customId === 'cancel_purchase') {
                const cancelEmbed = buildSessionEmbed({
                    title: '❌ Purchase Cancelled',
                    topFields: [
                        { name: '🚫 Cancelled', value: 'Purchase was cancelled by user.' }
                    ],
                    stageText: 'PURCHASE CANCELLED',
                    color: 0x888888
                });
                await i.update({ embeds: [cancelEmbed], components: [] });
            }
        });

        collector.on('end', (collected) => {
            if (collected.size === 0) {
                const timeoutEmbed = buildSessionEmbed({
                    title: '⏱️ Purchase Timeout',
                    topFields: [
                        { name: '🕐 Timeout', value: 'Purchase confirmation timed out.' }
                    ],
                    stageText: 'PURCHASE TIMEOUT',
                    color: 0x888888
                });
                interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
            }
        });
    },

    /**
     * Process the actual purchase
     */
    async processPurchase(interaction, userId, guildId, itemId) {
        const item = await dbManager.getShopItem(itemId);
        const success = await dbManager.purchaseShopItem(userId, itemId, item.price);

        if (success) {
            const balance = await dbManager.getUserBalance(userId, guildId);
            
            // Use proper role name for success message
            let displayName = item.name;
            let displayDescription = item.description;
            
            if (item.category === 'roles' && item.metadata) {
                try {
                    const metadata = JSON.parse(item.metadata);
                    if (metadata.role_name && metadata.role_color) {
                        displayName = `${metadata.role_name}`;
                        displayDescription = `Get a ${metadata.role_color} colored username in chat`;
                    }
                } catch (error) {
                    // Keep original name/description if metadata parsing fails
                }
            }
            
            const successEmbed = buildSessionEmbed({
                title: '✅ Purchase Successful!',
                topFields: [
                    { name: '🎉 Item Purchased', value: `**${displayName}**\n${displayDescription}` },
                    { name: '💸 Amount Paid', value: fmt(item.price) },
                    { name: '💰 New Balance', value: fmt(balance.wallet) }
                ],
                stageText: 'PURCHASE COMPLETE',
                color: 0x00FF00,
                footer: 'Thank you for your purchase! • ATIVE Casino'
            });

            await interaction.update({ embeds: [successEmbed], components: [] });

            // Record purchase for AI learning
            try {
                await dbManager.recordGameResult(
                    userId,
                    guildId,
                    'shop_purchase',
                    true, // Always successful if we reach this point
                    item.price, // Amount spent
                    0, // No payout for purchases
                    {
                        itemId: item.id,
                        itemName: item.name,
                        itemCategory: item.category,
                        itemDescription: item.description,
                        duration: item.duration_hours || 0,
                        isPermanent: !item.duration_hours,
                        gameType: 'shop_purchase'
                    }
                );
            } catch (aiError) {
                logger.error(`Failed to record shop purchase for AI: ${aiError.message}`);
            }

            // Log the purchase
            await sendLogMessage(
                interaction.client,
                'economy',
                `Shop purchase: ${interaction.user.username} bought ${item.name} for ${fmt(item.price)}`,
                userId,
                guildId
            );

            // Handle special item types
            await this.handleSpecialItemEffects(interaction, userId, guildId, item);
        } else {
            const errorEmbed = buildSessionEmbed({
                title: '❌ Purchase Failed',
                topFields: [
                    { name: '🔧 Error', value: 'Failed to complete purchase. Please try again.' }
                ],
                stageText: 'PURCHASE FAILED',
                color: 0xFF0000
            });

            await interaction.update({ embeds: [errorEmbed], components: [] });
        }
    },

    /**
     * Handle special effects for certain item types
     */
    async handleSpecialItemEffects(interaction, userId, guildId, item) {
        try {
            const metadata = item.metadata ? JSON.parse(item.metadata) : {};
            
            // Handle role color purchases
            if (item.category === 'roles' && metadata.role_name && metadata.role_color) {
                await this.handleRolePurchase(interaction, userId, metadata);
            }
            
            // Handle earnmoney unlock
            if (item.category === 'unlocks' && metadata.unlock_type === 'earnmoney_bypass') {
                logger.info(`User ${userId} purchased earnmoney unlock`);
                // The earnmoney command would check for this purchase in the database
            }
        } catch (error) {
            logger.error(`Error handling special item effects: ${error.message}`);
        }
    },

    /**
     * Handle inventory viewing
     */
    async handleInventory(interaction, userId, guildId) {
        await this.showInventory(interaction, userId, guildId);
    },

    /**
     * Show user's inventory
     */
    async showInventory(interaction, userId, guildId) {
        const purchases = await dbManager.getUserShopPurchases(userId, true);
        
        if (purchases.length === 0) {
            const emptyEmbed = buildSessionEmbed({
                title: '📦 Your Inventory',
                topFields: [
                    { name: '📭 Empty Inventory', value: 'You haven\'t purchased any items yet!' }
                ],
                stageText: 'NO ITEMS',
                color: 0xFFAA00,
                footer: 'Use /shop browse to see available items'
            });

            const method = interaction.update ? 'update' : 'editReply';
            return await interaction[method]({ embeds: [emptyEmbed], components: [] });
        }

        // Group items by category
        const categories = {};
        for (const purchase of purchases) {
            if (!categories[purchase.category]) {
                categories[purchase.category] = [];
            }
            categories[purchase.category].push(purchase);
        }

        const inventoryFields = [];
        
        for (const [category, items] of Object.entries(categories)) {
            let itemList = '';
            for (const item of items) {
                const expiry = item.expires_at ? `\n   Expires: <t:${Math.floor(new Date(item.expires_at).getTime() / 1000)}:R>` : '';
                itemList += `• **${item.name}**${expiry}\n`;
            }
            
            inventoryFields.push({
                name: `${this.getCategoryEmoji(category)} ${this.getCategoryDisplayName(category)}`,
                value: itemList.trim(),
                inline: false
            });
        }

        const inventoryEmbed = buildSessionEmbed({
            title: `📦 ${interaction.user.username}'s Inventory`,
            topFields: inventoryFields,
            stageText: `${purchases.length} ITEMS OWNED`,
            color: 0x00D4FF,
            footer: 'Items shown are currently active • ATIVE Casino'
        });

        const backButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('shop_back_to_browse')
                    .setLabel('🔙 Back to Shop')
                    .setStyle(ButtonStyle.Secondary)
            );

        const method = interaction.update ? 'update' : 'editReply';
        const response = await interaction[method]({
            embeds: [inventoryEmbed],
            components: [backButton]
        });

        if (interaction.update) {
            const collector = response.createMessageComponentCollector({
                filter: i => i.customId === 'shop_back_to_browse' && i.user.id === userId,
                time: 60000
            });

            collector.on('collect', async (i) => {
                await this.handleBrowse(i, userId, guildId);
            });
        }
    },

    /**
     * Show user's active boosts
     */
    async showActiveBoosts(interaction, userId, guildId) {
        const boosts = await dbManager.getUserActiveBoosts(userId);

        if (boosts.length === 0) {
            const noBoostsEmbed = buildSessionEmbed({
                title: '⚡ Active Boosts',
                topFields: [
                    { name: '📭 No Active Boosts', value: 'You don\'t have any active boosts right now.' }
                ],
                stageText: 'NO BOOSTS',
                color: 0xFFAA00,
                footer: 'Purchase boost items from the shop to get started!'
            });

            return await interaction.update({ embeds: [noBoostsEmbed], components: [] });
        }

        const boostFields = [];
        for (const boost of boosts) {
            const multiplierText = boost.multiplier === 2.0 ? '2x' : `${boost.multiplier}x`;
            const expiresAt = Math.floor(new Date(boost.expires_at).getTime() / 1000);
            
            boostFields.push({
                name: `⚡ ${this.getBoostDisplayName(boost.boost_type)}`,
                value: `**${multiplierText} Multiplier**\nExpires: <t:${expiresAt}:R>`,
                inline: true
            });
        }

        const boostsEmbed = buildSessionEmbed({
            title: `⚡ ${interaction.user.username}'s Active Boosts`,
            topFields: boostFields,
            stageText: `${boosts.length} BOOSTS ACTIVE`,
            color: 0x00FF00,
            footer: 'Make the most of your boosts! • ATIVE Casino'
        });

        await interaction.update({ embeds: [boostsEmbed], components: [] });
    },

    /**
     * Handle direct purchase command
     */
    async handleDirectPurchase(interaction, userId, guildId, itemId) {
        const item = await dbManager.getShopItem(itemId);
        
        if (!item) {
            const errorEmbed = buildSessionEmbed({
                title: '❌ Item Not Found',
                topFields: [
                    { name: '🔍 Invalid ID', value: `No item found with ID **${itemId}**` }
                ],
                stageText: 'ITEM NOT FOUND',
                color: 0xFF0000,
                footer: 'Use /shop browse to see available items'
            });
            
            return await interaction.editReply({ embeds: [errorEmbed] });
        }

        // Process the purchase directly
        await this.handlePurchaseConfirmation(interaction, userId, guildId, itemId);
    },

    /**
     * Helper functions
     */
    getCategoryDisplayName(category) {
        const names = {
            'boosts': 'Boosts & Multipliers',
            'unlocks': 'Feature Unlocks',
            'decorations': 'Profile Decorations',
            'roles': 'Role Colors',
            'utilities': 'Utility Items'
        };
        return names[category] || category;
    },

    getCategoryEmoji(category) {
        const emojis = {
            'boosts': '⚡',
            'unlocks': '🔓',
            'decorations': '🎨',
            'roles': '🌈',
            'utilities': '⚒️'
        };
        return emojis[category] || '📦';
    },

    getBoostDisplayName(boostType) {
        const names = {
            'xp': 'XP Boost',
            'economy': 'Economy Boost',
            'vote': 'Vote Boost',
            'general': 'General Boost'
        };
        return names[boostType] || boostType;
    },

    /**
     * Handle role purchase - create and assign Discord role
     */
    async handleRolePurchase(interaction, userId, metadata) {
        // Restrict role purchases to specific guild only
        if (interaction.guildId !== '1403244656845787167') {
            await interaction.reply({
                content: '❌ Role color purchases are not available in this server.',
                ephemeral: true
            });
            return;
        }

        try {
            const guild = interaction.guild;
            const memberCacheManager = require('../UTILS/memberCacheManager');
            const { success: memberSuccess, member: memberData } = await memberCacheManager.getMemberData(userId, guild.id, guild);
            
            if (!memberSuccess || !memberData) {
                throw new Error('Could not get member data');
            }
            
            // For role operations, we still need the Discord member object
            const member = interaction.member || await guild.members.fetch(userId).catch(() => null);
            if (!member) {
                throw new Error('Could not fetch Discord member for role assignment');
            }
            const roleName = metadata.role_name;
            const roleColor = metadata.role_color;

            // Check if role already exists
            let role = guild.roles.cache.find(r => r.name === roleName);

            if (!role) {
                // Find the bot's highest role to position the new role below it
                const botMember = guild.members.cache.get(interaction.client.user.id);
                const botHighestRole = botMember.roles.highest;
                
                // Create the role with high position for color visibility but hidden from member list
                role = await guild.roles.create({
                    name: roleName,
                    color: roleColor,
                    reason: `Shop purchase by ${member.user.username}`,
                    permissions: [],
                    position: Math.max(0, botHighestRole.position - 1), // Position just below bot's highest role
                    hoist: false // Don't show separately in member list
                });
                
                logger.info(`Created new role: ${roleName} (${roleColor}) at position ${role.position} for user ${userId}`);
            } else {
                // If role exists but is low in hierarchy, move it up
                const botMember = guild.members.cache.get(interaction.client.user.id);
                const botHighestRole = botMember.roles.highest;
                const targetPosition = Math.max(0, botHighestRole.position - 1);
                
                if (role.position < targetPosition) {
                    await role.setPosition(targetPosition, `Moving ${roleName} up for color visibility`);
                    logger.info(`Moved existing role ${roleName} to position ${targetPosition} for better visibility`);
                }
            }

            // Remove any existing VIP roles from this user
            const existingVipRoles = member.roles.cache.filter(r => 
                r.name.includes('VIP') && r.name !== roleName
            );
            
            if (existingVipRoles.size > 0) {
                await member.roles.remove(existingVipRoles, 'Replacing with new VIP role purchase');
                logger.info(`Removed ${existingVipRoles.size} existing VIP roles from user ${userId}`);
            }

            // Assign the role to the user
            await member.roles.add(role, `Shop purchase: ${roleName}`);
            
            logger.info(`Assigned role ${roleName} to user ${userId} (${member.user.username})`);
            
            // Send confirmation message
            await interaction.followUp({
                content: `🎉 Your **${roleName}** role has been created and assigned! You now have a custom colored username.`,
                ephemeral: true
            });
            
        } catch (error) {
            logger.error(`Error handling role purchase: ${error.message}`);
            
            await interaction.followUp({
                content: `❌ There was an error creating your role. Please contact an administrator.`,
                ephemeral: true
            });
        }
    }
};