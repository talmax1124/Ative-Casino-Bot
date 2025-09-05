/**
 * Admin shop command for managing the shop system
 * Developer only - restricted access
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const shopManager = require('../UTILS/shopManager');
const { fmt } = require('../UTILS/common');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const logger = require('../UTILS/logger');

// Developer ID - hardcoded for security
const DEVELOPER_ID = '466050111680544798';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin-shop')
        .setDescription('[DEV ONLY] Shop administration commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('init')
                .setDescription('Initialize shop items')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Get shop statistics')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cleanup')
                .setDescription('Clean up expired shop items')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('test-boost')
                .setDescription('Test boost system')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to check boosts for')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('sync-roles')
                .setDescription('Sync all shop role assignments')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('test-decoration')
                .setDescription('Test decoration system')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to test decorations for')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        // Check if user is developer
        if (interaction.user.id !== DEVELOPER_ID) {
            return await interaction.reply({
                content: '❌ This command is restricted to the developer only.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            await interaction.deferReply({ ephemeral: true });

            switch (subcommand) {
                case 'init':
                    await this.handleInit(interaction);
                    break;
                case 'stats':
                    await this.handleStats(interaction);
                    break;
                case 'cleanup':
                    await this.handleCleanup(interaction);
                    break;
                case 'test-boost':
                    const user = interaction.options.getUser('user');
                    await this.handleTestBoost(interaction, user.id);
                    break;
                case 'sync-roles':
                    await this.handleSyncRoles(interaction);
                    break;
                case 'test-decoration':
                    const decorationUser = interaction.options.getUser('user');
                    await this.handleTestDecoration(interaction, decorationUser);
                    break;
            }
        } catch (error) {
            logger.error(`Error in admin-shop command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Admin Shop Error',
                topFields: [
                    { name: '🔧 Error Details', value: error.message }
                ],
                stageText: 'SYSTEM ERROR',
                color: 0xFF0000
            });

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    async handleInit(interaction) {
        const success = await dbManager.initializeShopItems();
        
        const embed = buildSessionEmbed({
            title: '🛒 Shop Initialization',
            topFields: [
                { 
                    name: success ? '✅ Success' : '❌ Failed', 
                    value: success ? 'Shop items initialized successfully!' : 'Failed to initialize shop items.'
                }
            ],
            stageText: success ? 'INITIALIZATION COMPLETE' : 'INITIALIZATION FAILED',
            color: success ? 0x00FF00 : 0xFF0000
        });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleStats(interaction) {
        const stats = await shopManager.getShopStatistics();
        
        let categoryBreakdown = 'No data available';
        if (stats.categoryBreakdown && stats.categoryBreakdown.length > 0) {
            categoryBreakdown = stats.categoryBreakdown
                .map(cat => `**${cat.category}**: ${cat.purchases} purchases (${fmt(cat.revenue)})`)
                .join('\n');
        }

        const embed = buildSessionEmbed({
            title: '📊 Shop Statistics',
            topFields: [
                { name: '📦 Total Items', value: `${stats.totalItems || 0} items`, inline: true },
                { name: '🛒 Total Purchases', value: `${stats.totalPurchases || 0}`, inline: true },
                { name: '💰 Total Revenue', value: fmt(stats.totalRevenue || 0), inline: true },
                { name: '📈 Category Breakdown', value: categoryBreakdown, inline: false }
            ],
            stageText: 'SHOP ANALYTICS',
            color: 0x00D4FF
        });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleCleanup(interaction) {
        const cleaned = await dbManager.cleanupExpiredShopItems();
        
        const embed = buildSessionEmbed({
            title: '🧹 Shop Cleanup',
            topFields: [
                { 
                    name: '🗑️ Items Cleaned', 
                    value: `${cleaned} expired items removed`
                }
            ],
            stageText: 'CLEANUP COMPLETE',
            color: 0x00FF00
        });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleTestBoost(interaction, userId) {
        const boosts = await dbManager.getUserActiveBoosts(userId);
        const purchases = await dbManager.getUserShopPurchases(userId, true);
        
        // Test boost application
        const testAmount = 10000;
        const economyResult = await shopManager.applyEconomyBoosts(userId, testAmount, 'test');
        const xpResult = await shopManager.applyXpBoost(userId, 100);
        const voteResult = await shopManager.applyVoteBoost(userId, 25000);
        
        // Check unlocks
        const earnmoneyUnlock = await shopManager.hasEarnmoneyUnlock(userId);
        const cooldownReduction = await shopManager.getCooldownReduction(userId, 'work');

        const embed = buildSessionEmbed({
            title: `🧪 Boost Test for <@${userId}>`,
            topFields: [
                { 
                    name: '⚡ Active Boosts', 
                    value: boosts.length > 0 ? boosts.map(b => `${b.boost_type}: ${b.multiplier}x`).join('\n') : 'None',
                    inline: true 
                },
                { 
                    name: '📦 Active Purchases', 
                    value: `${purchases.length} items owned`,
                    inline: true 
                },
                { 
                    name: '🔓 Unlocks', 
                    value: `EarnMoney: ${earnmoneyUnlock ? '✅' : '❌'}`,
                    inline: true 
                },
                {
                    name: '💰 Economy Test (₪10,000)',
                    value: `Result: ${fmt(economyResult.amount)} (${economyResult.boosted ? 'Boosted' : 'No boost'})`,
                    inline: true
                },
                {
                    name: '⚡ XP Test (100 XP)',
                    value: `Result: ${xpResult.xp} XP (${xpResult.boosted ? 'Boosted' : 'No boost'})`,
                    inline: true
                },
                {
                    name: '🗳️ Vote Test (₪25,000)',
                    value: `Result: ${fmt(voteResult.reward)} (${voteResult.boosted ? 'Boosted' : 'No boost'})`,
                    inline: true
                },
                {
                    name: '⏰ Cooldown Reduction',
                    value: cooldownReduction.hasReduction ? `${cooldownReduction.reductionPercent * 100}% reduction` : 'None',
                    inline: false
                }
            ],
            stageText: 'BOOST DIAGNOSTICS',
            color: 0x9B59B6
        });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleSyncRoles(interaction) {
        try {
            const shopInitializer = require('../UTILS/shopInitializer');
            
            await shopInitializer.processExistingRoleAssignments(interaction.client);
            
            const embed = buildSessionEmbed({
                title: '🔄 Role Sync Complete',
                topFields: [
                    { name: '✅ Success', value: 'All shop role assignments have been synchronized!' }
                ],
                stageText: 'ROLES SYNCHRONIZED',
                color: 0x00FF00
            });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            const embed = buildSessionEmbed({
                title: '❌ Role Sync Failed',
                topFields: [
                    { name: '🔧 Error', value: error.message }
                ],
                stageText: 'SYNC FAILED',
                color: 0xFF0000
            });

            await interaction.editReply({ embeds: [embed] });
        }
    },

    async handleTestDecoration(interaction, user) {
        try {
            const profileDecorator = require('../UTILS/profileDecorator');
            
            const decorations = await shopManager.getUserDecorations(user.id);
            
            // Generate decorated profile
            const decoratedProfile = await profileDecorator.generateUserProfile(
                user.id,
                user.displayAvatarURL({ extension: 'png', size: 512 })
            );

            const embed = buildSessionEmbed({
                title: `🎨 Decoration Test for ${user.username}`,
                topFields: [
                    { 
                        name: '🎨 Decorations Found', 
                        value: decorations.length > 0 ? decorations.map(d => d.name).join('\n') : 'None',
                        inline: false
                    },
                    {
                        name: '🖼️ Profile Generated',
                        value: decoratedProfile ? 'Successfully created decorated profile' : 'No decorations to apply',
                        inline: false
                    }
                ],
                stageText: 'DECORATION TEST',
                color: 0x9B59B6
            });

            const replyData = { embeds: [embed] };

            if (decoratedProfile) {
                replyData.files = [decoratedProfile];
                embed.setImage('attachment://decorated_profile.png');
            }

            await interaction.editReply(replyData);
        } catch (error) {
            const embed = buildSessionEmbed({
                title: '❌ Decoration Test Failed',
                topFields: [
                    { name: '🔧 Error', value: error.message }
                ],
                stageText: 'TEST FAILED',
                color: 0xFF0000
            });

            await interaction.editReply({ embeds: [embed] });
        }
    }
};