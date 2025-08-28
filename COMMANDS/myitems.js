/**
 * MyItems command showing user's purchased items and their progress
 * Displays active boosts, passive income items, and cosmetics
 */

const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, getTierDisplay } = require('../UTILS/common');
const logger = require('../UTILS/logger');

// Item type mappings for display
const ITEM_CATEGORIES = {
    'boosts': { name: 'Game Boosts', icon: '⚡', color: 0xFFD700 },
    'cosmetics': { name: 'Cosmetics', icon: '🎨', color: 0xFF69B4 },
    'premium': { name: 'Premium Items', icon: '👑', color: 0x9F7AEA }
};

const ITEMS_PER_PAGE = 6;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('myitems')
        .setDescription('📦 View your purchased items and their progress')
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('Page number to view (default: 1)')
                .setRequired(false)
                .setMinValue(1)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const requestedPage = interaction.options.getInteger('page') || 1;

        try {
            await interaction.deferReply();

            await this.generateItemsResponse(interaction, userId, guildId, requestedPage, false);

        } catch (error) {
            logger.error(`MyItems command error for ${userId}: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Error')
                .setDescription('Failed to retrieve your items. Please try again later.')
                .setTimestamp();

            const editResponse = interaction.deferred || interaction.replied;
            if (editResponse) {
                await interaction.editReply({ embeds: [errorEmbed], components: [] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },

    async generateItemsResponse(interaction, userId, guildId, page, isEdit) {
        try {
            // Get user's purchased items from database
            // Note: Shop functionality not available without proper database implementation
            const purchasesSnapshot = { empty: true };

            if (purchasesSnapshot.empty) {
                const noItemsEmbed = new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle('📦 My Items')
                    .setDescription('You haven\'t purchased any items yet!\n\nVisit the web portal shop to purchase boosts, cosmetics, and premium items.')
                    .setFooter({ text: `Page ${page}` })
                    .setTimestamp();

                const method = isEdit ? 'editReply' : 'followUp';
                return await interaction[method]({ embeds: [noItemsEmbed], components: [] });
            }

            // Process purchased items
            const userItems = [];
            for (const doc of purchasesSnapshot.docs) {
                const purchase = doc.data();
                const item = this.getItemDetails(purchase.itemId);
                if (item) {
                    userItems.push({
                        ...item,
                        purchaseDate: purchase.timestamp.toDate(),
                        isActive: this.isItemActive(purchase, item),
                        expiresAt: this.getExpirationDate(purchase, item),
                        progress: await this.getItemProgress(userId, purchase.itemId, item)
                    });
                }
            }

            // Group items by category
            const groupedItems = userItems.reduce((acc, item) => {
                if (!acc[item.category]) acc[item.category] = [];
                acc[item.category].push(item);
                return acc;
            }, {});

            // Paginate items
            const allItems = Object.values(groupedItems).flat();
            const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);
            const validPage = Math.max(1, Math.min(page, totalPages || 1));
            const startIndex = (validPage - 1) * ITEMS_PER_PAGE;
            const pageItems = allItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);

            // Create embed
            const embed = new EmbedBuilder()
                .setColor(0x9F7AEA)
                .setTitle('📦 My Items')
                .setDescription(`Your purchased items and their current status\n\n**Total Items:** ${allItems.length}`)
                .setFooter({ text: `Page ${validPage}/${totalPages}` })
                .setTimestamp();

            // Add item fields
            for (const item of pageItems) {
                const categoryInfo = ITEM_CATEGORIES[item.category] || { name: item.category, icon: '📦' };
                const statusIcon = item.isActive ? '✅' : '❌';
                const expirationText = item.duration ? 
                    (item.expiresAt ? `Expires: <t:${Math.floor(item.expiresAt.getTime() / 1000)}:R>` : 'Expired') :
                    'Permanent';

                let progressText = '';
                if (item.progress && item.progress.totalEarned > 0) {
                    progressText = `\n💰 Earned: ${fmt(item.progress.totalEarned)} coins`;
                }

                embed.addFields({
                    name: `${categoryInfo.icon} ${item.name} ${statusIcon}`,
                    value: `${item.description}\n${expirationText}${progressText}`,
                    inline: true
                });
            }

            // Add summary statistics
            if (allItems.length > 0) {
                const activeItems = allItems.filter(item => item.isActive);
                const totalEarnings = allItems.reduce((sum, item) => 
                    sum + (item.progress?.totalEarned || 0), 0);

                embed.addFields({
                    name: '📊 Summary',
                    value: `**Active Items:** ${activeItems.length}/${allItems.length}\n**Total Earnings:** ${fmt(totalEarnings)} coins`,
                    inline: false
                });
            }

            // Create navigation buttons
            const components = [];
            if (totalPages > 1) {
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`myitems_prev_${validPage}`)
                            .setLabel('◀️ Previous')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(validPage <= 1),
                        new ButtonBuilder()
                            .setCustomId(`myitems_next_${validPage}`)
                            .setLabel('Next ▶️')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(validPage >= totalPages)
                    );
                components.push(row);
            }

            const method = isEdit ? 'editReply' : 'followUp';
            await interaction[method]({ embeds: [embed], components });

        } catch (error) {
            logger.error(`Error generating items response for ${userId}: ${error.message}`);
            throw error;
        }
    },

    getItemDetails(itemId) {
        // Map of all shop items (should match server.js shop items)
        const itemsMap = {
            'slot_machine': {
                name: '🎰 Personal Slot Machine',
                description: 'Generates 50-200 coins every hour automatically',
                category: 'boosts',
                duration: null,
                passiveIncome: { min: 50, max: 200, interval: 3600 }
            },
            'lucky_charm': {
                name: '🍀 Lucky Charm',
                description: 'Increases win rate by 5% for all games',
                category: 'boosts',
                duration: null,
                gameBonus: { winRateBonus: 0.05 }
            },
            'coin_magnet': {
                name: '🧲 Coin Magnet',
                description: 'Attracts 10% more coins from all winnings',
                category: 'boosts',
                duration: null,
                gameBonus: { winningMultiplier: 1.10 }
            },
            'double_xp_24h': {
                name: '⚡ Double XP Boost',
                description: 'Double experience points for 24 hours',
                category: 'boosts',
                duration: 24
            },
            'lucky_streak_12h': {
                name: '🌟 Lucky Streak',
                description: 'Increased win chance for 12 hours',
                category: 'boosts',
                duration: 12
            },
            'golden_badge': {
                name: '🥇 Golden Winner Badge',
                description: 'Show off your success with a golden badge',
                category: 'cosmetics',
                duration: null
            },
            'diamond_crown': {
                name: '💎 Diamond Crown',
                description: 'Ultimate symbol of casino mastery',
                category: 'cosmetics',
                duration: null
            }
        };

        return itemsMap[itemId] || null;
    },

    isItemActive(purchase, item) {
        if (item.duration === null) return true; // Permanent items are always active
        
        const purchaseTime = purchase.timestamp.toDate();
        const expirationTime = new Date(purchaseTime.getTime() + (item.duration * 60 * 60 * 1000));
        
        return new Date() < expirationTime;
    },

    getExpirationDate(purchase, item) {
        if (item.duration === null) return null;
        
        const purchaseTime = purchase.timestamp.toDate();
        return new Date(purchaseTime.getTime() + (item.duration * 60 * 60 * 1000));
    },

    async getItemProgress(userId, itemId, item) {
        try {
            // Get item usage statistics from database
            if (item.passiveIncome) {
                // For passive income items, check earnings
                const earningsSnapshot = await dbManager.db.collection('passive_earnings')
                    .where('userId', '==', userId)
                    .where('itemId', '==', itemId)
                    .get();

                let totalEarned = 0;
                earningsSnapshot.docs.forEach(doc => {
                    totalEarned += doc.data().amount || 0;
                });

                return { totalEarned };
            }

            return { totalEarned: 0 };
        } catch (error) {
            logger.error(`Error getting item progress for ${userId}: ${error.message}`);
            return { totalEarned: 0 };
        }
    },

    async handleButtonInteraction(interaction, customId) {
        try {
            const userId = interaction.user.id;
            const guildId = await getGuildId(interaction);

            await interaction.deferUpdate();

            if (customId.startsWith('myitems_prev_')) {
                const currentPage = parseInt(customId.split('_')[2]);
                const newPage = Math.max(1, currentPage - 1);
                await this.generateItemsResponse(interaction, userId, guildId, newPage, true);
            } else if (customId.startsWith('myitems_next_')) {
                const currentPage = parseInt(customId.split('_')[2]);
                const newPage = currentPage + 1;
                await this.generateItemsResponse(interaction, userId, guildId, newPage, true);
            }

        } catch (error) {
            logger.error(`MyItems button interaction error: ${error.message}`);
            
            try {
                await interaction.editReply({
                    content: 'An error occurred while processing your request.',
                    embeds: [],
                    components: []
                });
            } catch (editError) {
                logger.error(`Failed to edit reply: ${editError.message}`);
            }
        }
    }
};