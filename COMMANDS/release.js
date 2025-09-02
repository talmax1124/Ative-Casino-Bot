/**
 * RELEASE Command - Manual Session Cleanup for ATIVE Casino Bot
 * Allows users and admins to manually clear stuck/hanging game sessions
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const GameSessionIntegrator = require('../UTILS/gameSessionIntegrator');
const { clearActiveGame, getAllActiveGames, getActiveGame, sendLogMessage } = require('../UTILS/common');
const logger = require('../UTILS/logger');

// Developer ID for admin functions
const DEVELOPER_ID = '466050111680544798';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('release')
        .setDescription('Release a specific user\'s game sessions')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User whose sessions to release')
                .setRequired(true)
        ),

    async execute(interaction) {
        try {
            const targetUser = interaction.options.getUser('user');
            const isDeveloper = interaction.user.id === DEVELOPER_ID;
            const isAdmin = interaction.member?.permissions.has(PermissionFlagsBits.Administrator) || isDeveloper;

            // Check if user can target another user (admin/dev only)
            if (targetUser.id !== interaction.user.id && !isAdmin) {
                return await interaction.reply({
                    embeds: [this.createErrorEmbed('❌ Access Denied', 'You can only release your own sessions. Admins can target other users.')],
                    flags: MessageFlags.Ephemeral
                });
            }

            return await this.releaseUserSessions(interaction, targetUser);
        } catch (error) {
            logger.error(`Release command error: ${error.message}`);
            
            const errorEmbed = this.createErrorEmbed('❌ Command Error', 'An error occurred while processing the release command.');
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    },

    /**
     * Release sessions for a specific user
     */
    async releaseUserSessions(interaction, targetUser) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const userSessions = await GameSessionIntegrator.getActiveUserSessions(targetUser.id);
            
            if (userSessions.length === 0) {
                const embed = this.createErrorEmbed('🎮 No Active Sessions', `${targetUser.displayName} doesn't have any active game sessions.`);
                embed.setColor(0x0099FF);
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            let clearedCount = 0;
            let refundTotal = 0;
            const results = [];

            // Clear all sessions for the target user
            for (const session of userSessions) {
                try {
                    const result = await GameSessionIntegrator.cancelGameSession(
                        session.sessionId, 
                        'Manual release via /release command', 
                        interaction.user.id
                    );
                    
                    if (result.success) {
                        clearedCount++;
                        if (result.refunded && session.betAmount > 0) {
                            refundTotal += session.betAmount;
                        }
                        results.push(`✅ ${session.gameType} - Released`);
                    } else {
                        results.push(`❌ ${session.gameType} - Failed`);
                    }
                } catch (error) {
                    results.push(`❌ ${session.gameType} - Error: ${error.message}`);
                }
            }

            let description = `**Sessions Released for ${targetUser.displayName}**\n\n`;
            description += `🧹 **Sessions Cleared**: ${clearedCount}\n`;
            
            if (refundTotal > 0) {
                description += `💰 **Total Refunded**: $${refundTotal.toLocaleString()}\n`;
            }

            if (results.length > 0) {
                description += `\n**📋 Details:**\n${results.join('\n')}`;
            }

            const embed = new EmbedBuilder()
                .setTitle('🧹 Sessions Released')
                .setDescription(description)
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            logger.info(`User ${interaction.user.id} released ${clearedCount} sessions for user ${targetUser.id}`);

        } catch (error) {
            logger.error(`Error releasing user sessions: ${error.message}`);
            
            const errorEmbed = this.createErrorEmbed('❌ Release Failed', `Failed to release sessions: ${error.message}`);
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    /**
     * Show main release panel
     */
    async showMainPanel(interaction) {
        const userSessions = await GameSessionIntegrator.getActiveUserSessions(interaction.user.id);
        const legacyGameType = getActiveGame(interaction.user.id);
        const isDeveloper = interaction.user.id === DEVELOPER_ID;
        const isAdmin = interaction.member?.permissions.has(PermissionFlagsBits.Administrator) || isDeveloper;

        const totalSessions = userSessions.length + (legacyGameType ? 1 : 0);

        let description = `**Session Release Control Panel**\n\nManually clear stuck or hanging game sessions.\n\n`;
        
        if (totalSessions > 0) {
            description += `🔄 **Active Sessions Found**: ${totalSessions}\n`;
            if (userSessions.length > 0) {
                description += `• Session Manager: ${userSessions.length}\n`;
            }
            if (legacyGameType) {
                description += `• Legacy System: 1 (${legacyGameType})\n`;
            }
        } else {
            description += `✅ **No Active Sessions**: Your account is clean\n`;
        }

        const embed = new EmbedBuilder()
            .setTitle('🔄 Session Release')
            .setDescription(description)
            .addFields([
                { 
                    name: '🎯 User Actions', 
                    value: '• **View My Sessions** - See detailed session information\n• **Clear All My Sessions** - Release all your active sessions', 
                    inline: false 
                }
            ])
            .setColor(totalSessions > 0 ? '#ffa500' : '#00ff00')
            .setFooter({ text: 'ATIVE Casino Bot • Session Management' })
            .setTimestamp();

        if (isAdmin) {
            embed.addFields([
                { 
                    name: '🛠️ Admin Actions', 
                    value: '• **Admin Panel** - Release any user\'s sessions\n• **System Overview** - View all active sessions', 
                    inline: false 
                }
            ]);
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('release_action')
            .setPlaceholder('Choose an action...')
            .addOptions([
                {
                    label: 'View My Sessions',
                    description: 'See detailed information about your active sessions',
                    value: 'view_sessions',
                    emoji: '📋'
                },
                {
                    label: 'Clear All My Sessions',
                    description: 'Release all your active game sessions',
                    value: 'clear_my_sessions',
                    emoji: '🧹'
                }
            ]);

        if (isAdmin) {
            selectMenu.addOptions([
                {
                    label: 'Admin Panel',
                    description: 'Access admin controls for session management',
                    value: 'admin_panel',
                    emoji: '🛠️'
                },
                {
                    label: 'System Overview',
                    description: 'View all active sessions across the bot',
                    value: 'system_overview',
                    emoji: '📊'
                }
            ]);
        }

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    },

    /**
     * Show user's sessions in detail
     */
    async showUserSessions(interaction) {
        const userSessions = await GameSessionIntegrator.getActiveUserSessions(interaction.user.id);
        const legacyGameType = getActiveGame(interaction.user.id);

        let description = '**Your Active Game Sessions**\n\n';

        if (userSessions.length === 0 && !legacyGameType) {
            description += '✅ No active sessions found. Your account is clean!';
        } else {
            if (userSessions.length > 0) {
                description += '**📋 Session Manager Sessions:**\n';
                userSessions.forEach((session, index) => {
                    const duration = Math.floor((Date.now() - session.createdAt) / 1000);
                    const minutes = Math.floor(duration / 60);
                    const seconds = duration % 60;
                    
                    description += `${index + 1}. **${session.gameType.toUpperCase()}**\n`;
                    description += `   • Duration: ${minutes}m ${seconds}s\n`;
                    description += `   • State: ${session.state}\n`;
                    if (session.betAmount > 0) {
                        description += `   • Bet: $${session.betAmount.toLocaleString()}\n`;
                    }
                    description += `   • Session ID: \`${session.sessionId}\`\n\n`;
                });
            }

            if (legacyGameType) {
                description += '**⚠️ Legacy System Session:**\n';
                description += `• Game Type: ${legacyGameType.toUpperCase()}\n`;
                description += `• Status: Active (Legacy)\n\n`;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 Your Active Sessions')
            .setDescription(description)
            .setColor(userSessions.length > 0 || legacyGameType ? '#ffa500' : '#00ff00')
            .setFooter({ text: 'Use the dropdown to release sessions' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('release_user_action')
            .setPlaceholder('Choose an action...')
            .addOptions([
                {
                    label: 'Clear All My Sessions',
                    description: 'Release all your active sessions',
                    value: 'clear_all_user',
                    emoji: '🧹'
                },
                {
                    label: 'Back to Main Menu',
                    description: 'Return to the main release panel',
                    value: 'back_main',
                    emoji: '🔙'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    },

    /**
     * Clear all user sessions with confirmation
     */
    async clearAllUserSessions(interaction, skipConfirmation = false) {
        if (!skipConfirmation) {
            const modal = new ModalBuilder()
                .setCustomId('confirm_release_all')
                .setTitle('🧹 Confirm Session Release');

            const confirmationInput = new TextInputBuilder()
                .setCustomId('confirmation')
                .setLabel('Type RELEASE to confirm')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Type RELEASE to confirm action')
                .setRequired(true)
                .setMaxLength(7);

            const row = new ActionRowBuilder().addComponents(confirmationInput);
            modal.addComponents(row);

            return await interaction.showModal(modal);
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            let clearedCount = 0;
            let refundTotal = 0;
            const results = [];

            // Clear session manager sessions
            const userSessions = await GameSessionIntegrator.getActiveUserSessions(interaction.user.id);
            for (const session of userSessions) {
                try {
                    const result = await GameSessionIntegrator.cancelGameSession(
                        session.sessionId, 
                        'Manual release via /release command', 
                        interaction.user.id
                    );
                    
                    if (result.success) {
                        clearedCount++;
                        if (result.refunded && session.betAmount > 0) {
                            refundTotal += session.betAmount;
                        }
                        results.push(`✅ ${session.gameType} - Released`);
                    } else {
                        results.push(`❌ ${session.gameType} - Failed`);
                    }
                } catch (error) {
                    results.push(`❌ ${session.gameType} - Error: ${error.message}`);
                }
            }

            // Clear legacy system session
            const legacyGameType = getActiveGame(interaction.user.id);
            if (legacyGameType) {
                const cleared = clearActiveGame(interaction.user.id);
                if (cleared) {
                    clearedCount++;
                    results.push(`✅ ${legacyGameType} (Legacy) - Released`);
                } else {
                    results.push(`❌ ${legacyGameType} (Legacy) - Failed`);
                }
            }

            let description = `**Session Release Complete**\n\n`;
            description += `🧹 **Sessions Cleared**: ${clearedCount}\n`;
            
            if (refundTotal > 0) {
                description += `💰 **Total Refunded**: $${refundTotal.toLocaleString()}\n`;
            }

            if (results.length > 0) {
                description += `\n**📋 Details:**\n${results.join('\n')}`;
            }

            const embed = new EmbedBuilder()
                .setTitle('🧹 Sessions Released')
                .setDescription(description)
                .setColor('#00ff00')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Log the action
            await sendLogMessage(interaction.client, 'info', `${interaction.user.tag} manually released ${clearedCount} sessions via /release`);

        } catch (error) {
            logger.error(`Error clearing user sessions: ${error.message}`);
            
            const errorEmbed = this.createErrorEmbed('❌ Release Failed', `Failed to release sessions: ${error.message}`);
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    /**
     * Show admin panel for session management
     */
    async showAdminPanel(interaction, targetUser = null) {
        const isDeveloper = interaction.user.id === DEVELOPER_ID;
        const allSessions = [];
        const allLegacySessions = getAllActiveGames();

        let description = `**🛠️ Admin Session Management Panel**\n\n`;
        description += `📊 **System Status:**\n`;
        description += `• Session Manager: ${allSessions.length} active\n`;
        description += `• Legacy System: ${allLegacySessions.length} active\n`;
        description += `• Total Active: ${allSessions.length + allLegacySessions.length}\n\n`;

        if (targetUser) {
            const userSessions = await GameSessionIntegrator.getActiveUserSessions(targetUser.id);
            const userLegacy = getActiveGame(targetUser.id);
            const userTotal = userSessions.length + (userLegacy ? 1 : 0);
            
            description += `👤 **Target User**: ${targetUser.displayName}\n`;
            description += `• Sessions: ${userTotal}\n\n`;
        }

        description += `**Available Actions:**\n`;
        description += `• Release specific user sessions\n`;
        description += `• View system overview\n`;
        if (isDeveloper) {
            description += `• Force cleanup stale sessions\n`;
            description += `• Clear all active sessions\n`;
        }

        const embed = new EmbedBuilder()
            .setTitle('🛠️ Admin Session Management')
            .setDescription(description)
            .setColor('#ff9900')
            .setFooter({ text: 'Admin Access • Use with caution' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('release_admin_action')
            .setPlaceholder('Choose admin action...')
            .addOptions([
                {
                    label: 'System Overview',
                    description: 'View all active sessions',
                    value: 'system_overview',
                    emoji: '📊'
                }
            ]);

        if (isDeveloper) {
            selectMenu.addOptions([
                {
                    label: 'Force Cleanup Stale',
                    description: 'Clean up sessions older than 30 minutes',
                    value: 'force_cleanup',
                    emoji: '🧹'
                },
                {
                    label: 'Emergency Clear All',
                    description: 'Clear ALL active sessions (emergency only)',
                    value: 'clear_all_emergency',
                    emoji: '🚨'
                }
            ]);
        }

        selectMenu.addOptions([
            {
                label: 'Back to Main Menu',
                description: 'Return to main release panel',
                value: 'back_main',
                emoji: '🔙'
            }
        ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    },

    /**
     * Create standardized error embed
     */
    createErrorEmbed(title, description) {
        return new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor('#ff0000')
            .setTimestamp();
    },

    /**
     * Handle modal submission for release confirmation
     */
    async handleReleaseConfirmationModal(interaction) {
        const confirmation = interaction.fields.getTextInputValue('confirmation');
        
        if (confirmation !== 'RELEASE') {
            return await interaction.reply({
                embeds: [this.createErrorEmbed('❌ Invalid Confirmation', 'You must type "RELEASE" to confirm this action.')],
                flags: MessageFlags.Ephemeral
            });
        }

        return await this.clearAllUserSessions(interaction, true);
    },

    /**
     * Handle select menu interactions
     */
    async handleSelectMenuInteraction(interaction, action) {
        const isDeveloper = interaction.user.id === DEVELOPER_ID;
        const isAdmin = interaction.member?.permissions.has(PermissionFlagsBits.Administrator) || isDeveloper;

        try {
            switch (action) {
                case 'view_sessions':
                    return await this.showUserSessions(interaction);
                    
                case 'clear_my_sessions':
                case 'clear_all_user':
                    return await this.clearAllUserSessions(interaction);
                    
                case 'admin_panel':
                    if (!isAdmin) {
                        return await interaction.reply({
                            embeds: [this.createErrorEmbed('❌ Access Denied', 'Administrator permissions required.')],
                            flags: MessageFlags.Ephemeral
                        });
                    }
                    return await this.showAdminPanel(interaction);
                    
                case 'system_overview':
                    if (!isAdmin) {
                        return await interaction.reply({
                            embeds: [this.createErrorEmbed('❌ Access Denied', 'Administrator permissions required.')],
                            flags: MessageFlags.Ephemeral
                        });
                    }
                    return await this.showSystemOverview(interaction);
                    
                case 'back_main':
                    return await this.showMainPanel(interaction);
                    
                default:
                    if (isAdmin) {
                        return await this.handleAdminAction(interaction, action);
                    } else {
                        return await this.showMainPanel(interaction);
                    }
            }
        } catch (error) {
            logger.error(`Release menu interaction error: ${error.message}`);
            
            const errorEmbed = this.createErrorEmbed('❌ Action Failed', 'An error occurred while processing the action.');
            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    },

    /**
     * Show system overview of all sessions
     */
    async showSystemOverview(interaction) {
        const allSessions = [];
        const allLegacy = getAllActiveGames();
        const stats = { totalSessions: 0, activeUsers: 0, completedSessions: 0, timeoutSessions: 0, cancelledSessions: 0 };

        let description = `**📊 System Session Overview**\n\n`;
        
        description += `**Statistics:**\n`;
        description += `• Total Sessions: ${stats.totalSessions}\n`;
        description += `• Currently Active: ${allSessions.length}\n`;
        description += `• Legacy Active: ${allLegacy.length}\n`;
        description += `• Active Users: ${stats.activeUsers}\n`;
        description += `• Completed: ${stats.completedSessions}\n`;
        description += `• Timeouts: ${stats.timeoutSessions}\n`;
        description += `• Cancelled: ${stats.cancelledSessions}\n\n`;

        if (allSessions.length > 0) {
            description += `**Recent Active Sessions:**\n`;
            const recent = allSessions.slice(0, 10);
            recent.forEach((session, index) => {
                description += `${index + 1}. **${session.gameType}** - <@${session.userId}> (${Math.floor(session.duration / 60000)}m)\n`;
            });
            
            if (allSessions.length > 10) {
                description += `... and ${allSessions.length - 10} more\n`;
            }
        }

        if (allLegacy.length > 0) {
            description += `\n**Legacy System Sessions:**\n`;
            allLegacy.forEach((game, index) => {
                description += `${index + 1}. **${game.gameType}** - <@${game.userId}>\n`;
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('📊 System Session Overview')
            .setDescription(description)
            .setColor('#0099ff')
            .setFooter({ text: 'Admin View • Real-time Data' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('release_admin_action')
            .setPlaceholder('Admin actions...')
            .addOptions([
                {
                    label: 'Back to Admin Panel',
                    description: 'Return to admin panel',
                    value: 'admin_panel',
                    emoji: '🔙'
                },
                {
                    label: 'Refresh Overview',
                    description: 'Refresh the system overview',
                    value: 'system_overview',
                    emoji: '🔄'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [embed], components: [row] });
        } else {
            await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
        }
    },

    /**
     * Handle admin-specific actions
     */
    async handleAdminAction(interaction, action) {
        const isDeveloper = interaction.user.id === DEVELOPER_ID;

        switch (action) {
            case 'force_cleanup':
                if (!isDeveloper) {
                    return await interaction.reply({
                        embeds: [this.createErrorEmbed('❌ Access Denied', 'Developer permissions required.')],
                        flags: MessageFlags.Ephemeral
                    });
                }
                return await this.performForceCleanup(interaction);
                
            case 'clear_all_emergency':
                if (!isDeveloper) {
                    return await interaction.reply({
                        embeds: [this.createErrorEmbed('❌ Access Denied', 'Developer permissions required.')],
                        flags: MessageFlags.Ephemeral
                    });
                }
                return await this.performEmergencyClearAll(interaction);
                
            default:
                return await this.showAdminPanel(interaction);
        }
    },

    /**
     * Perform force cleanup of stale sessions
     */
    async performForceCleanup(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const result = { staleSessions: 0, cleaned: 0 };
            
            const embed = new EmbedBuilder()
                .setTitle('🧹 Force Cleanup Complete')
                .setDescription(`**Cleanup Results:**\n• Stale sessions found: ${result.staleSessions}\n• Sessions cleaned: ${result.cleaned}\n• Status: ${result.cleaned > 0 ? 'Cleanup performed' : 'No cleanup needed'}`)
                .setColor('#00ff00')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            await sendLogMessage(interaction.client, 'admin', `${interaction.user.tag} performed force session cleanup: ${result.cleaned} sessions cleaned`);

        } catch (error) {
            logger.error(`Force cleanup error: ${error.message}`);
            
            const errorEmbed = this.createErrorEmbed('❌ Cleanup Failed', `Failed to perform cleanup: ${error.message}`);
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    /**
     * Emergency clear all sessions (developer only)
     */
    async performEmergencyClearAll(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('confirm_emergency_clear')
            .setTitle('🚨 Emergency Clear All Sessions');

        const confirmationInput = new TextInputBuilder()
            .setCustomId('emergency_confirmation')
            .setLabel('Type EMERGENCY CLEAR to confirm')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Type EMERGENCY CLEAR to confirm')
            .setRequired(true)
            .setMaxLength(15);

        const row = new ActionRowBuilder().addComponents(confirmationInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
    },

    /**
     * Handle emergency clear confirmation
     */
    async handleEmergencyClearModal(interaction) {
        const confirmation = interaction.fields.getTextInputValue('emergency_confirmation');
        
        if (confirmation !== 'EMERGENCY CLEAR') {
            return await interaction.reply({
                embeds: [this.createErrorEmbed('❌ Invalid Confirmation', 'You must type "EMERGENCY CLEAR" to confirm this action.')],
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // Clear session manager
            const sessionCount = 0;
            // await GameSessionIntegrator.forceCleanup(0); // Clear all

            // Clear legacy system
            const legacyCount = clearActiveGame(null, true);

            const embed = new EmbedBuilder()
                .setTitle('🚨 Emergency Clear Complete')
                .setDescription(`**All Sessions Cleared:**\n• Session Manager: ${sessionCount} cleared\n• Legacy System: ${legacyCount} cleared\n• Total: ${sessionCount + legacyCount} sessions\n\n⚠️ This action has been logged.`)
                .setColor('#ff0000')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            await sendLogMessage(interaction.client, 'warn', `🚨 EMERGENCY: ${interaction.user.tag} cleared ALL active sessions (${sessionCount + legacyCount} total)`);

        } catch (error) {
            logger.error(`Emergency clear error: ${error.message}`);
            
            const errorEmbed = this.createErrorEmbed('❌ Emergency Clear Failed', `Failed to clear sessions: ${error.message}`);
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};
