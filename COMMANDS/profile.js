/**
 * Profile command for ATIVE Casino Bot
 * Shows user profiles with shop decorations, stats, and balance
 */

const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder
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
            await dbManager.ensureUser(userId, targetUser.username, guildId);

            // Get user data
            const [balance, purchases, boosts, stats] = await Promise.all([
                dbManager.getUserBalance(userId, guildId),
                dbManager.getUserShopPurchases(userId),
                dbManager.getUserActiveBoosts(userId),
                this.getUserGameStats(userId)
            ]);

            // Generate decorated profile image (profileDecorator will check user settings)
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
                // Show buttons for own profile - Row 1: Main actions
                const profileButtons1 = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('profile_shop')
                            .setLabel('🛒 Visit Shop')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('profile_decorations')
                            .setLabel('🎨 My Decorations')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('profile_customize')
                            .setLabel('⚙️ Customize')
                            .setStyle(ButtonStyle.Success)
                    );
                
                // Row 2: Close button
                const profileButtons2 = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('profile_close')
                            .setLabel('❌ Close Profile Panel')
                            .setStyle(ButtonStyle.Danger)
                    );
                
                components.push(profileButtons1, profileButtons2);
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
                    filter: i => i.user.id === interaction.user.id
                });

                collector.on('collect', async (i) => {
                    if (i.customId === 'profile_shop') {
                        // Redirect to shop browse
                        await i.reply({
                            content: '🛒 Use `/shop` to visit the shop!',
                            flags: MessageFlags.Ephemeral
                        });
                    } else if (i.customId === 'profile_decorations') {
                        await this.showUserDecorations(i, userId);
                    } else if (i.customId === 'profile_customize') {
                        await this.showCustomizeOptions(i, userId, purchases);
                    } else if (i.customId === 'profile_close') {
                        // Close the profile panel
                        await i.update({ 
                            content: '✅ Profile panel closed.',
                            embeds: [],
                            components: []
                        });
                        collector.stop(); // Stop the collector
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
            const roiFormatted = stats.roi >= 0 ? `+${stats.roi.toFixed(1)}%` : `${stats.roi.toFixed(1)}%`;
            const roiColor = stats.roi >= 0 ? '🟢' : '🔴';
            
            profileFields.push({
                name: '🎮 Gaming Stats',
                value: `**Games:** ${stats.totalGames}\n**Win Rate:** ${winRate}%\n**Biggest Win:** ${fmt(stats.biggestWin)}\n**ROI:** ${roiColor} ${roiFormatted}`,
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
            
            // Handle both object (by game type) and array returns
            let statsArray = [];
            if (Array.isArray(allStats)) {
                statsArray = allStats;
            } else if (typeof allStats === 'object' && allStats !== null) {
                // Convert object to array of values
                statsArray = Object.values(allStats);
            } else {
                logger.warn(`getUserStats returned unexpected format for user ${userId}:`, allStats);
                return {
                    totalGames: 0,
                    totalWins: 0,
                    biggestWin: 0,
                    totalWinnings: 0,
                    totalWagered: 0,
                    roi: 0
                };
            }
            
            let totalGames = 0;
            let totalWins = 0;
            let biggestWin = 0;
            let totalWinnings = 0;
            let totalWagered = 0;

            for (const stat of statsArray) {
                totalGames += stat.total_games_played || 0;
                totalWins += stat.total_wins || 0;
                biggestWin = Math.max(biggestWin, stat.biggest_win || 0);
                totalWinnings += stat.total_winnings || 0;
                totalWagered += stat.total_wagered || 0;
            }

            // Calculate ROI (Return on Investment)
            const roi = totalWagered > 0 ? ((totalWinnings - totalWagered) / totalWagered) * 100 : 0;

            return {
                totalGames,
                totalWins,
                biggestWin,
                totalWinnings,
                totalWagered,
                roi
            };
        } catch (error) {
            logger.error(`Error getting user stats: ${error.message}`);
            return { totalGames: 0, totalWins: 0, biggestWin: 0, totalWinnings: 0, totalWagered: 0, roi: 0 };
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

                return await interaction.reply({ embeds: [noDecorationsEmbed], flags: MessageFlags.Ephemeral });
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

            await interaction.reply({ embeds: [decorationsEmbed], flags: MessageFlags.Ephemeral });
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

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    },

    /**
     * Show customization options for user's purchased items
     */
    async showCustomizeOptions(interaction, userId, purchases) {
        try {
            // Get user's owned role colors and decorations
            const roleItems = purchases.filter(p => p.category === 'roles');
            const decorationItems = purchases.filter(p => p.category === 'decorations');
            
            // If no customizable items, show message
            if (roleItems.length === 0 && decorationItems.length === 0) {
                const noItemsEmbed = buildSessionEmbed({
                    title: '⚙️ Profile Customization',
                    topFields: [
                        { name: '🛍️ No Customizable Items', value: 'You don\'t have any role colors or decorations to customize yet!' },
                        { name: '💡 Get Started', value: 'Visit the shop to purchase role colors and decorations!' }
                    ],
                    stageText: 'NO ITEMS TO CUSTOMIZE',
                    color: 0xFFAA00,
                    footer: 'Use /shop to browse available items'
                });
                
                return await interaction.update({ embeds: [noItemsEmbed], components: [] });
            }
            
            // Get current user settings for toggles
            const userSettings = await dbManager.getUserSettings(userId);
            // Handle boolean conversion: null/undefined = true (default), 0/false = false, 1/true = true
            const roleColorEnabled = userSettings?.role_color_enabled == null ? true : Boolean(userSettings.role_color_enabled);
            const decorationsEnabled = userSettings?.decorations_enabled == null ? true : Boolean(userSettings.decorations_enabled);
            
            // Create customization options
            const customizeEmbed = buildSessionEmbed({
                title: '⚙️ Customize Your Profile',
                topFields: [
                    { name: '🎨 Available Customizations', value: 'Select what you\'d like to customize or toggle on/off:' }
                ],
                stageText: 'PROFILE CUSTOMIZATION',
                color: 0x00D4FF,
                footer: 'Choose an option below'
            });
            
            // Add fields for owned items and current status
            if (roleItems.length > 0) {
                const roleList = roleItems.map(item => `• ${item.name}`).join('\n');
                const statusIcon = roleColorEnabled ? '🟢' : '🔴';
                customizeEmbed.addFields({
                    name: `🌈 Your Role Colors ${statusIcon}`,
                    value: roleList + `\n\n**Status:** ${roleColorEnabled ? 'Enabled' : 'Disabled'}`,
                    inline: true
                });
            }
            
            if (decorationItems.length > 0) {
                // Get active decoration
                const activeDecoration = await shopManager.getActiveDecoration(userId);
                
                const decorationList = decorationItems.map(item => `• ${item.name}`).join('\n');
                const statusIcon = decorationsEnabled ? '🟢' : '🔴';
                const activeText = activeDecoration ? `\n\n**Currently Active:** ${activeDecoration.name}` : '';
                
                customizeEmbed.addFields({
                    name: `🎨 Your Decorations ${statusIcon}`,
                    value: decorationList + activeText + `\n\n**Status:** ${decorationsEnabled ? 'Enabled' : 'Disabled'}`,
                    inline: true
                });
            }
            
            // Create action buttons row 1 - Main actions
            const customizeButtons1 = new ActionRowBuilder();
            
            // Only show role color button in specific guild
            if (roleItems.length > 0 && interaction.guildId === '1403244656845787167') {
                customizeButtons1.addComponents(
                    new ButtonBuilder()
                        .setCustomId('customize_role_color')
                        .setLabel('🌈 Change Role Color')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(!roleColorEnabled)
                );
            }
            
            if (decorationItems.length > 0) {
                customizeButtons1.addComponents(
                    new ButtonBuilder()
                        .setCustomId('customize_decoration')
                        .setLabel('🎨 Change Decoration')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(!decorationsEnabled)
                );
            }
            
            customizeButtons1.addComponents(
                new ButtonBuilder()
                    .setCustomId('customize_back')
                    .setLabel('🔙 Back to Profile')
                    .setStyle(ButtonStyle.Danger)
            );
            
            // Create action buttons row 2 - Toggle controls
            const customizeButtons2 = new ActionRowBuilder();
            
            // Only show role color toggle in specific guild
            if (roleItems.length > 0 && interaction.guildId === '1403244656845787167') {
                customizeButtons2.addComponents(
                    new ButtonBuilder()
                        .setCustomId('toggle_role_color')
                        .setLabel(roleColorEnabled ? '🌈 Turn Off Role Colors' : '🌈 Turn On Role Colors')
                        .setStyle(roleColorEnabled ? ButtonStyle.Secondary : ButtonStyle.Success)
                );
            }
            
            if (decorationItems.length > 0) {
                customizeButtons2.addComponents(
                    new ButtonBuilder()
                        .setCustomId('toggle_decorations')
                        .setLabel(decorationsEnabled ? '🎨 Turn Off Decorations' : '🎨 Turn On Decorations')
                        .setStyle(decorationsEnabled ? ButtonStyle.Secondary : ButtonStyle.Success)
                );
            }
            
            // Determine which button rows to show
            const components = [];
            if (customizeButtons1.components.length > 0) components.push(customizeButtons1);
            if (customizeButtons2.components.length > 0) components.push(customizeButtons2);
            
            const response = await interaction.update({ 
                embeds: [customizeEmbed], 
                components: components 
            });
            
            // Set up collector for customization options
            const collector = response.createMessageComponentCollector({
                filter: i => i.user.id === userId
            });
            
            collector.on('collect', async (i) => {
                if (i.customId === 'customize_role_color') {
                    // Restrict role color customization to specific guild
                    if (i.guildId !== '1403244656845787167') {
                        await i.reply({
                            content: '❌ Role color customization is not available in this server.',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }
                    await this.showRoleColorOptions(i, userId, roleItems);
                } else if (i.customId === 'customize_decoration') {
                    await this.showDecorationOptions(i, userId, decorationItems);
                } else if (i.customId === 'toggle_role_color') {
                    // Restrict role color toggle to specific guild
                    if (i.guildId !== '1403244656845787167') {
                        await i.reply({
                            content: '❌ Role color features are not available in this server.',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }
                    await this.toggleRoleColor(i, userId, purchases);
                } else if (i.customId === 'toggle_decorations') {
                    await this.toggleDecorations(i, userId, purchases);
                } else if (i.customId === 'customize_back') {
                    // Go back to profile - restart the profile command
                    await i.update({ 
                        content: '🔄 Refreshing profile...',
                        embeds: [],
                        components: []
                    });
                    
                    setTimeout(async () => {
                        const profileModule = require('./profile');
                        await profileModule.execute(i);
                    }, 1000);
                }
            });
            
        } catch (error) {
            logger.error(`Error showing customize options: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Customization Error',
                topFields: [
                    { name: '🔧 Error', value: 'Failed to load customization options.' }
                ],
                stageText: 'CUSTOMIZATION ERROR',
                color: 0xFF0000
            });
            
            await interaction.update({ embeds: [errorEmbed], components: [] });
        }
    },

    /**
     * Show role color selection options
     */
    async showRoleColorOptions(interaction, userId, roleItems) {
        try {
            const guild = interaction.guild;
            const member = await guild.members.fetch(userId);
            
            // Get current active role
            const currentRole = member.roles.cache.find(r => 
                roleItems.some(item => {
                    const metadata = JSON.parse(item.metadata || '{}');
                    return metadata.role_name === r.name;
                })
            );
            
            const roleOptionsEmbed = buildSessionEmbed({
                title: '🌈 Choose Your Role Color',
                topFields: [
                    { name: '🎨 Your Available Colors', value: 'Select a role color to activate:' },
                    { name: '📍 Current Color', value: currentRole ? `**${currentRole.name}**` : 'None active' }
                ],
                stageText: 'ROLE COLOR SELECTION',
                color: 0x00D4FF,
                footer: 'Only one role color can be active at a time'
            });
            
            // Create selection dropdown
            const roleOptions = roleItems.map(item => {
                const metadata = JSON.parse(item.metadata || '{}');
                return {
                    label: item.name,
                    description: item.description,
                    value: `role_${item.id}`,
                    emoji: item.name.split(' ')[0] // Get the emoji from the name
                };
            });
            
            const roleSelect = new StringSelectMenuBuilder()
                .setCustomId('select_role_color')
                .setPlaceholder('Choose a role color...')
                .addOptions(roleOptions);
            
            const selectRow = new ActionRowBuilder().addComponents(roleSelect);
            const backButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('customize_back')
                        .setLabel('🔙 Back')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            const response = await interaction.update({ 
                embeds: [roleOptionsEmbed], 
                components: [selectRow, backButton] 
            });
            
            // Handle role selection
            const collector = response.createMessageComponentCollector({
                filter: i => i.user.id === userId
            });
            
            collector.on('collect', async (i) => {
                if (i.customId === 'select_role_color') {
                    const selectedItemId = parseInt(i.values[0].replace('role_', ''));
                    await this.applyRoleColor(i, userId, selectedItemId, roleItems);
                } else if (i.customId === 'customize_back') {
                    const purchases = await dbManager.getUserShopPurchases(userId);
                    await this.showCustomizeOptions(i, userId, purchases);
                }
            });
            
        } catch (error) {
            logger.error(`Error showing role color options: ${error.message}`);
        }
    },

    /**
     * Apply selected role color
     */
    async applyRoleColor(interaction, userId, itemId, roleItems) {
        try {
            const selectedItem = roleItems.find(item => item.id === itemId);
            if (!selectedItem) return;
            
            const metadata = JSON.parse(selectedItem.metadata || '{}');
            const guild = interaction.guild;
            const member = await guild.members.fetch(userId);
            
            // Remove existing VIP roles
            const existingVipRoles = member.roles.cache.filter(r => r.name.includes('VIP'));
            if (existingVipRoles.size > 0) {
                await member.roles.remove(existingVipRoles, 'Changing role color');
            }
            
            // Find or create the selected role
            let role = guild.roles.cache.find(r => r.name === metadata.role_name);
            if (!role) {
                // Create new role
                const botMember = guild.members.cache.get(interaction.client.user.id);
                const botHighestRole = botMember.roles.highest;
                
                role = await guild.roles.create({
                    name: metadata.role_name,
                    color: metadata.role_color,
                    reason: `Role color activation by ${member.user.username}`,
                    permissions: [],
                    position: Math.max(0, botHighestRole.position - 1)
                });
            } else {
                // Role exists, check if it needs to be moved up for visibility
                const botMember = guild.members.cache.get(interaction.client.user.id);
                const botHighestRole = botMember.roles.highest;
                const targetPosition = Math.max(0, botHighestRole.position - 1);
                
                if (role.position < targetPosition) {
                    await role.setPosition(targetPosition, `Moving ${metadata.role_name} up for color visibility`);
                    logger.info(`Moved existing role ${metadata.role_name} to position ${targetPosition} for better visibility`);
                }
            }
            
            // Assign the role
            await member.roles.add(role, 'Role color activation');
            
            const successEmbed = buildSessionEmbed({
                title: '✅ Role Color Applied!',
                topFields: [
                    { name: '🎨 New Color', value: `**${selectedItem.name}** has been activated!` },
                    { name: '✨ Effect', value: 'Your username color has been updated!' }
                ],
                stageText: 'COLOR APPLIED',
                color: 0x00FF00,
                footer: 'Your new role color is now active!'
            });
            
            await interaction.update({ embeds: [successEmbed], components: [] });
            
            logger.info(`User ${userId} activated role color: ${selectedItem.name}`);
            
        } catch (error) {
            logger.error(`Error applying role color: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Failed to Apply Color',
                topFields: [
                    { name: '🔧 Error', value: 'Could not activate the selected role color.' }
                ],
                stageText: 'APPLICATION FAILED',
                color: 0xFF0000
            });
            
            await interaction.update({ embeds: [errorEmbed], components: [] });
        }
    },

    /**
     * Show decoration options (placeholder for now)
     */
    async showDecorationOptions(interaction, userId, decorationItems) {
        try {
            // Get current active decoration
            const activeDecoration = await shopManager.getActiveDecoration(userId);
            
            const decorationEmbed = buildSessionEmbed({
                title: '🎨 Choose Your Decoration',
                topFields: [
                    { 
                        name: '✨ Select Active Decoration', 
                        value: 'Choose which decoration to display on your profile. Only one can be active at a time.'
                    },
                    { 
                        name: '🔸 Currently Active', 
                        value: activeDecoration ? `**${activeDecoration.name}** (${activeDecoration.color} frame)` : 'None selected'
                    }
                ],
                stageText: 'DECORATION SELECTION',
                color: 0x9B59B6,
                footer: 'Click a decoration to make it active'
            });
        
        // Create decoration selection buttons
        const components = [];
        
        if (decorationItems.length > 0) {
            // Create buttons for each decoration (up to 4 per row)
            let currentRow = new ActionRowBuilder();
            let buttonsInRow = 0;
            
            for (const decoration of decorationItems) {
                const isActive = activeDecoration && activeDecoration.id === decoration.id;
                const frameEmoji = this.getFrameEmoji(decoration.color);
                
                const button = new ButtonBuilder()
                    .setCustomId(`select_decoration_${decoration.id}`)
                    .setLabel(`${frameEmoji} ${decoration.name}`)
                    .setStyle(isActive ? ButtonStyle.Success : ButtonStyle.Primary)
                    .setDisabled(isActive);
                
                currentRow.addComponents(button);
                buttonsInRow++;
                
                // If we have 4 buttons or it's the last decoration, add the row
                if (buttonsInRow === 4 || decoration === decorationItems[decorationItems.length - 1]) {
                    components.push(currentRow);
                    currentRow = new ActionRowBuilder();
                    buttonsInRow = 0;
                }
            }
        }
        
        // Add back button
        const backButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('decoration_back')
                    .setLabel('🔙 Back to Customization')
                    .setStyle(ButtonStyle.Danger)
            );
        components.push(backButton);
        
        await interaction.update({ embeds: [decorationEmbed], components: components });
        
        // Handle back button
        const collector = interaction.message.createMessageComponentCollector({
            filter: i => i.user.id === userId
        });
        
        collector.on('collect', async (i) => {
            if (i.customId === 'decoration_back') {
                const purchases = await dbManager.getUserShopPurchases(userId);
                await this.showCustomizeOptions(i, userId, purchases);
            } else if (i.customId.startsWith('select_decoration_')) {
                const decorationId = parseInt(i.customId.replace('select_decoration_', ''));
                
                // Set the active decoration
                const success = await shopManager.setActiveDecoration(userId, decorationId);
                
                if (success) {
                    // Refresh the decoration options page
                    await this.showDecorationOptions(i, userId, decorationItems);
                } else {
                    await i.reply({
                        content: '❌ Failed to set active decoration. Please try again.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
        });
        } catch (error) {
            logger.error(`Error showing decoration options: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Decoration Error',
                topFields: [
                    { name: '🔧 Error', value: 'Failed to load decoration options.' }
                ],
                stageText: 'DECORATION ERROR',
                color: 0xFF0000
            });
            
            await interaction.update({ embeds: [errorEmbed], components: [] });
        }
    },

    /**
     * Get emoji for frame color
     * @param {string} frameColor - Frame color
     * @returns {string} Emoji representation
     */
    getFrameEmoji(frameColor) {
        const frameEmojis = {
            'gold': '🟨',
            'diamond': '💎',  
            'ruby': '🔴',
            'emerald': '🟢'
        };
        return frameEmojis[frameColor] || '⚪';
    },

    /**
     * Toggle role color display on/off
     */
    async toggleRoleColor(interaction, userId, purchases) {
        try {
            // Get current setting
            const userSettings = await dbManager.getUserSettings(userId);
            // Handle boolean conversion: null/undefined = true (default), 0/false = false, 1/true = true
            const currentlyEnabled = userSettings?.role_color_enabled == null ? true : Boolean(userSettings.role_color_enabled);
            const newEnabled = !currentlyEnabled;
            
            // Update user settings - store as 1 for true, 0 for false to ensure proper database storage
            await dbManager.setUserSetting(userId, 'role_color_enabled', newEnabled ? 1 : 0);
            
            // If disabling, remove all VIP roles
            if (!newEnabled) {
                const member = await interaction.guild.members.fetch(userId).catch(() => null);
                if (member) {
                    const roleItems = purchases.filter(p => p.category === 'roles');
                    for (const roleItem of roleItems) {
                        try {
                            const metadata = JSON.parse(roleItem.metadata || '{}');
                            const roleName = metadata.role_name;
                            if (roleName) {
                                const role = interaction.guild.roles.cache.find(r => r.name === roleName);
                                if (role && member.roles.cache.has(role.id)) {
                                    await member.roles.remove(role, 'Role color disabled by user');
                                    logger.info(`Removed role ${roleName} from user ${userId} - role colors disabled`);
                                }
                            }
                        } catch (metadataError) {
                            logger.error(`Error parsing role metadata for ${roleItem.name}: ${metadataError.message}`);
                        }
                    }
                }
            }
            
            // Show success message and refresh customization options
            const statusText = newEnabled ? 'enabled' : 'disabled';
            const statusIcon = newEnabled ? '🟢' : '🔴';
            
            const successEmbed = buildSessionEmbed({
                title: `🌈 Role Colors ${statusIcon}`,
                topFields: [
                    { name: '✅ Setting Updated', value: `Role colors have been **${statusText}**.` },
                    { 
                        name: '📝 What this means', 
                        value: newEnabled 
                            ? 'Your purchased role colors will be displayed and you can switch between them.' 
                            : 'All role colors have been removed and won\'t be displayed until you re-enable them.'
                    }
                ],
                stageText: `ROLE COLORS ${statusText.toUpperCase()}`,
                color: newEnabled ? 0x00FF00 : 0xFFAA00,
                footer: 'Click back to return to customization options'
            });
            
            // Add back button
            const backButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('toggle_back_to_customize')
                        .setLabel('🔙 Back to Customization')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            await interaction.update({ embeds: [successEmbed], components: [backButton] });
            
            // Set up collector for back button
            const collector = interaction.message.createMessageComponentCollector({
                filter: i => i.user.id === userId && i.customId === 'toggle_back_to_customize'
            });
            
            collector.on('collect', async (i) => {
                const refreshedPurchases = await dbManager.getUserShopPurchases(userId);
                await this.showCustomizeOptions(i, userId, refreshedPurchases);
                collector.stop();
            });
            
        } catch (error) {
            logger.error(`Error toggling role colors: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Toggle Failed',
                topFields: [
                    { name: '🔧 Error', value: 'Could not update role color setting.' }
                ],
                stageText: 'TOGGLE FAILED',
                color: 0xFF0000
            });
            
            await interaction.update({ embeds: [errorEmbed], components: [] });
        }
    },

    /**
     * Toggle decorations display on/off
     */
    async toggleDecorations(interaction, userId, purchases) {
        try {
            // Get current setting
            const userSettings = await dbManager.getUserSettings(userId);
            // Handle boolean conversion: null/undefined = true (default), 0/false = false, 1/true = true
            const currentlyEnabled = userSettings?.decorations_enabled == null ? true : Boolean(userSettings.decorations_enabled);
            const newEnabled = !currentlyEnabled;
            
            // Debug logging
            logger.info(`Toggle Decorations Debug - User: ${userId}`);
            logger.info(`Raw userSettings.decorations_enabled: ${userSettings?.decorations_enabled} (type: ${typeof userSettings?.decorations_enabled})`);
            logger.info(`Calculated currentlyEnabled: ${currentlyEnabled}`);
            logger.info(`New value will be: ${newEnabled}`);
            
            // Update user settings - store as 1 for true, 0 for false to ensure proper database storage
            await dbManager.setUserSetting(userId, 'decorations_enabled', newEnabled ? 1 : 0);
            
            // Show success message and refresh customization options
            const statusText = newEnabled ? 'enabled' : 'disabled';
            const statusIcon = newEnabled ? '🟢' : '🔴';
            
            const successEmbed = buildSessionEmbed({
                title: `🎨 Decorations ${statusIcon}`,
                topFields: [
                    { name: '✅ Setting Updated', value: `Profile decorations have been **${statusText}**.` },
                    { 
                        name: '📝 What this means', 
                        value: newEnabled 
                            ? 'Your profile decorations (frames, overlays) will be displayed on your profile image.' 
                            : 'Profile decorations will be hidden and your original avatar will be shown until you re-enable them.'
                    }
                ],
                stageText: `DECORATIONS ${statusText.toUpperCase()}`,
                color: newEnabled ? 0x00FF00 : 0xFFAA00,
                footer: 'Click back to return to customization options'
            });
            
            // Add back button
            const backButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('toggle_back_to_customize')
                        .setLabel('🔙 Back to Customization')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            await interaction.update({ embeds: [successEmbed], components: [backButton] });
            
            // Set up collector for back button
            const collector = interaction.message.createMessageComponentCollector({
                filter: i => i.user.id === userId && i.customId === 'toggle_back_to_customize'
            });
            
            collector.on('collect', async (i) => {
                const refreshedPurchases = await dbManager.getUserShopPurchases(userId);
                await this.showCustomizeOptions(i, userId, refreshedPurchases);
                collector.stop();
            });
            
        } catch (error) {
            logger.error(`Error toggling decorations: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Toggle Failed',
                topFields: [
                    { name: '🔧 Error', value: 'Could not update decoration setting.' }
                ],
                stageText: 'TOGGLE FAILED',
                color: 0xFF0000
            });
            
            await interaction.update({ embeds: [errorEmbed], components: [] });
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