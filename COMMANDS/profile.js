/**
 * Profile command for ATIVE Casino Bot
 * Shows user profiles with shop decorations, stats, and balance
 */

const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const dbManager = require('../UTILS/database');
const shopManager = require('../UTILS/shopManager');
const profileDecorator = require('../UTILS/profileDecorator');
const { fmt, getGuildId } = require('../UTILS/common');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View your or another user\'s profile with stats and decorations')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to view profile for (leave empty for yourself)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;
        const guildId = await getGuildId(interaction);

        try {
            await interaction.deferReply();
            await dbManager.ensureUser(userId, targetUser.username);

            // Get user data
            const [balance, purchases, boosts, stats] = await Promise.all([
                dbManager.getUserBalance(userId, guildId),
                shopManager.getUserShopPurchases(userId),
                shopManager.getUserActiveBoosts(userId),
                this.getUserGameStats(userId)
            ]);

            // Generate decorated profile image if user has decorations
            const decoratedProfile = await profileDecorator.generateUserProfile(
                userId, 
                targetUser.displayAvatarURL({ extension: 'png', size: 512 })
            );

            // Create profile embed
            const profileEmbed = await this.createProfileEmbed(
                targetUser, 
                balance, 
                purchases, 
                boosts, 
                stats,
                interaction.user.id === userId
            );

            // Create interaction components
            const components = [];
            
            if (interaction.user.id === userId) {
                // Show shop button for own profile
                const shopButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('profile_shop')
                            .setLabel('🛒 Visit Shop')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('profile_decorations')
                            .setLabel('🎨 My Decorations')
                            .setStyle(ButtonStyle.Secondary)
                    );
                components.push(shopButton);
            }

            const replyData = { 
                embeds: [profileEmbed],
                components: components
            };

            // Add decorated profile image if available
            if (decoratedProfile) {
                replyData.files = [decoratedProfile];
                profileEmbed.setThumbnail('attachment://decorated_profile.png');
            } else {
                profileEmbed.setThumbnail(targetUser.displayAvatarURL({ size: 256 }));
            }

            const response = await interaction.editReply(replyData);

            // Set up button collectors
            if (components.length > 0) {
                const collector = response.createMessageComponentCollector({
                    filter: i => i.user.id === interaction.user.id,
                    time: 300000 // 5 minutes
                });

                collector.on('collect', async (i) => {
                    if (i.customId === 'profile_shop') {
                        // Redirect to shop browse
                        await i.reply({
                            content: '🛒 Use `/shop browse` to visit the shop!',
                            ephemeral: true
                        });
                    } else if (i.customId === 'profile_decorations') {
                        await this.showUserDecorations(i, userId);
                    }
                });
            }

        } catch (error) {
            logger.error(`Error in profile command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Profile Error',
                topFields: [
                    { name: '🔧 System Error', value: 'Failed to load profile. Please try again.' }
                ],
                stageText: 'PROFILE ERROR',
                color: 0xFF0000
            });

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    /**
     * Create profile embed with user data
     */
    async createProfileEmbed(user, balance, purchases, boosts, stats, isOwnProfile) {
        // Calculate profile statistics
        const totalSpent = purchases.reduce((sum, purchase) => {
            try {
                return sum + (parseFloat(purchase.price) || 0);
            } catch {
                return sum;
            }
        }, 0);

        const activeItems = purchases.filter(p => {
            if (!p.expires_at) return true; // Permanent items
            return new Date(p.expires_at) > new Date();
        });

        // Get decoration and role info
        const decorations = purchases.filter(p => p.category === 'decorations');
        const roleColors = purchases.filter(p => p.category === 'roles');
        const unlocks = purchases.filter(p => p.category === 'unlocks');

        // Build profile fields
        const profileFields = [];

        // Balance section
        profileFields.push(
            { 
                name: '💰 Balance', 
                value: `**Wallet:** ${fmt(balance.wallet)}\n**Bank:** ${fmt(balance.bank)}`,
                inline: true 
            }
        );

        // Game stats section
        if (stats.totalGames > 0) {
            const winRate = stats.totalWins > 0 ? ((stats.totalWins / stats.totalGames) * 100).toFixed(1) : '0.0';
            profileFields.push({
                name: '🎮 Gaming Stats',
                value: `**Games:** ${stats.totalGames}\n**Win Rate:** ${winRate}%\n**Biggest Win:** ${fmt(stats.biggestWin)}`,
                inline: true
            });
        }

        // Shop activity section
        if (purchases.length > 0) {
            profileFields.push({
                name: '🛒 Shop Activity',
                value: `**Items Owned:** ${activeItems.length}\n**Total Spent:** ${fmt(totalSpent)}\n**Active Boosts:** ${boosts.length}`,
                inline: true
            });
        }

        // Decorations section
        if (decorations.length > 0) {
            const decorationList = decorations.map(d => d.name).join(', ');
            profileFields.push({
                name: '🎨 Profile Decorations',
                value: decorationList,
                inline: false
            });
        }

        // Role colors section
        if (roleColors.length > 0) {
            const roleList = roleColors.map(r => r.name).join(', ');
            profileFields.push({
                name: '🌈 Role Colors',
                value: roleList,
                inline: false
            });
        }

        // Active boosts section
        if (boosts.length > 0) {
            const boostList = boosts.map(boost => {
                const multiplierText = boost.multiplier === 2.0 ? '2x' : `${boost.multiplier}x`;
                const expiresAt = Math.floor(new Date(boost.expires_at).getTime() / 1000);
                return `⚡ ${this.getBoostDisplayName(boost.boost_type)}: **${multiplierText}** (<t:${expiresAt}:R>)`;
            }).join('\n');

            profileFields.push({
                name: '🚀 Active Boosts',
                value: boostList,
                inline: false
            });
        }

        // Premium status
        const premiumFeatures = [];
        if (unlocks.some(u => u.name.includes('EarnMoney'))) {
            premiumFeatures.push('🔓 EarnMoney Unlock');
        }
        if (purchases.some(p => p.name.includes('Cooldown'))) {
            premiumFeatures.push('⏰ Cooldown Reducer');
        }

        if (premiumFeatures.length > 0) {
            profileFields.push({
                name: '⭐ Premium Features',
                value: premiumFeatures.join('\n'),
                inline: false
            });
        }

        // Create embed
        const embed = buildSessionEmbed({
            title: `${isOwnProfile ? '👤 Your Profile' : `👤 ${user.username}'s Profile`}`,
            topFields: profileFields,
            stageText: `${user.username.toUpperCase()}'S PROFILE`,
            color: this.getProfileColor(roleColors),
            footer: `Profile for ${user.username} • ATIVE Casino`
        });

        return embed;
    },

    /**
     * Get profile color based on user's role colors
     */
    getProfileColor(roleColors) {
        if (roleColors.length === 0) return 0x00D4FF;

        // Return color of highest tier role
        const colorMap = {
            'Gold VIP': 0xFFD700,
            'Purple VIP': 0x8000FF,
            'Red VIP': 0xFF0000,
            'Blue VIP': 0x0080FF
        };

        for (const role of roleColors) {
            if (colorMap[role.roleName]) {
                return colorMap[role.roleName];
            }
        }

        return 0x00D4FF;
    },

    /**
     * Get user's game statistics
     */
    async getUserGameStats(userId) {
        try {
            const allStats = await dbManager.getUserStats(userId);
            
            let totalGames = 0;
            let totalWins = 0;
            let biggestWin = 0;
            let totalWinnings = 0;

            for (const stat of allStats) {
                totalGames += stat.total_games_played || 0;
                totalWins += stat.total_wins || 0;
                biggestWin = Math.max(biggestWin, stat.biggest_win || 0);
                totalWinnings += stat.total_winnings || 0;
            }

            return {
                totalGames,
                totalWins,
                biggestWin,
                totalWinnings
            };
        } catch (error) {
            logger.error(`Error getting user stats: ${error.message}`);
            return { totalGames: 0, totalWins: 0, biggestWin: 0, totalWinnings: 0 };
        }
    },

    /**
     * Show detailed decorations view
     */
    async showUserDecorations(interaction, userId) {
        try {
            const decorations = await shopManager.getUserDecorations(userId);
            
            if (decorations.length === 0) {
                const noDecorationsEmbed = buildSessionEmbed({
                    title: '🎨 Your Decorations',
                    topFields: [
                        { name: '📭 No Decorations', value: 'You don\'t have any profile decorations yet!' }
                    ],
                    stageText: 'NO DECORATIONS',
                    color: 0xFFAA00,
                    footer: 'Visit the shop to purchase decorations!'
                });

                return await interaction.reply({ embeds: [noDecorationsEmbed], ephemeral: true });
            }

            const decorationFields = decorations.map(decoration => ({
                name: `✨ ${decoration.name}`,
                value: `**Type:** ${decoration.type}\n**Status:** Active`,
                inline: true
            }));

            const decorationsEmbed = buildSessionEmbed({
                title: '🎨 Your Profile Decorations',
                topFields: decorationFields,
                stageText: `${decorations.length} DECORATIONS ACTIVE`,
                color: 0x9B59B6,
                footer: 'Your decorations are automatically applied to your profile!'
            });

            await interaction.reply({ embeds: [decorationsEmbed], ephemeral: true });
        } catch (error) {
            logger.error(`Error showing user decorations: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Decorations Error',
                topFields: [
                    { name: '🔧 Error', value: 'Failed to load decorations.' }
                ],
                stageText: 'DECORATIONS ERROR',
                color: 0xFF0000
            });

            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    },

    /**
     * Get boost display name
     */
    getBoostDisplayName(boostType) {
        const names = {
            'xp': 'XP Boost',
            'economy': 'Economy Boost',
            'vote': 'Vote Boost',
            'general': 'General Boost'
        };
        return names[boostType] || boostType;
    }
};