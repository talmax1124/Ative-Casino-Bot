/**
 * Enhanced Stop Game command - Integrated with SessionManager
 * Allows users and developers to stop active game sessions
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { sessionManager, SessionState } = require('../UTILS/sessionManager');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const logger = require('../UTILS/logger');

// Developer user ID
const DEVELOPER_USER_ID = process.env.DEVELOPER_USER_ID || '466050111680544798';

// Helper function to check developer permissions
function isDeveloper(userId) {
    return userId === DEVELOPER_USER_ID;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stopgame')
        .setDescription('Stop your active game sessions or manage sessions (Developer)')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action to perform')
                .setRequired(false)
                .addChoices(
                    { name: 'Stop My Games', value: 'stop_my_games' },
                    { name: 'List My Games', value: 'list_my_games' },
                    { name: '🔧 Dev: List All Sessions', value: 'dev_list_all' },
                    { name: '🔧 Dev: Stop User Sessions', value: 'dev_stop_user' },
                    { name: '🔧 Dev: Force Cleanup', value: 'dev_cleanup' },
                    { name: '🔧 Dev: Session Stats', value: 'dev_stats' }
                )
        )
        .addUserOption(option =>
            option.setName('target_user')
                .setDescription('Target user (Developer only)')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('cleanup_minutes')
                .setDescription('Cleanup sessions older than X minutes (Developer only)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(1440)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const action = interaction.options.getString('action') || 'stop_my_games';
        const targetUser = interaction.options.getUser('target_user');
        const cleanupMinutes = interaction.options.getInteger('cleanup_minutes') || 30;

        try {
            await interaction.deferReply({ ephemeral: true });

            // Handle developer actions
            if (action.startsWith('dev_')) {
                if (!isDeveloper(userId)) {
                    const embed = buildSessionEmbed({
                        title: '❌ Access Denied',
                        topFields: [
                            { name: 'Developer Only', value: 'Developer commands are restricted to authorized users.' }
                        ],
                        color: 0xFF0000,
                        footer: 'Session Manager'
                    });

                    await interaction.editReply({ embeds: [embed] });
                    return;
                }

                await this.handleDeveloperAction(interaction, action, targetUser, cleanupMinutes);
                return;
            }

            // Handle user actions
            switch (action) {
                case 'stop_my_games':
                    await this.handleStopMyGames(interaction, userId, username);
                    break;
                case 'list_my_games':
                    await this.handleListMyGames(interaction, userId, username);
                    break;
                default:
                    await this.handleStopMyGames(interaction, userId, username);
            }

        } catch (error) {
            logger.error(`STOPGAME command error: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Command Error',
                topFields: [
                    { name: 'Error Details', value: error.message }
                ],
                color: 0xFF0000,
                footer: 'Session Manager'
            });

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    /**
     * Handle stopping user's own games
     */
    async handleStopMyGames(interaction, userId, username) {
        const userSessions = sessionManager.getUserSessions(userId);

        if (userSessions.length === 0) {
            const embed = buildSessionEmbed({
                title: '🎮 No Active Games',
                topFields: [
                    { name: 'All Clear', value: 'You don\'t have any active game sessions to stop.' }
                ],
                color: 0x0099FF,
                footer: 'Session Manager'
            });

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Stop all user sessions
        const results = await sessionManager.cancelUserSessions(
            userId, 
            'User requested stop all games', 
            userId
        );

        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        const refunded = results.filter(r => r.refunded);

        const topFields = [
            { 
                name: 'Sessions Stopped', 
                value: `✅ Successfully stopped **${successful.length}** game session(s)` 
            }
        ];

        if (refunded.length > 0) {
            const refundedGames = refunded.map(r => r.gameType).join(', ');
            topFields.push({
                name: 'Refunds Processed',
                value: `💰 Bets refunded for: ${refundedGames}`
            });
        }

        if (failed.length > 0) {
            topFields.push({
                name: 'Failed Stops',
                value: `❌ ${failed.length} session(s) could not be stopped`
            });
        }

        const embed = buildSessionEmbed({
            title: `🛑 ${username}'s Games Stopped`,
            topFields,
            stageText: 'ALL SESSIONS CANCELLED',
            color: successful.length > 0 ? 0x00FF00 : 0xFF0000,
            footer: 'Session Manager • Use /stopgame action:list_my_games to check status'
        });

        await interaction.editReply({ embeds: [embed] });

        logger.info(`User ${userId} (${username}) stopped ${successful.length} game sessions`);
    },

    /**
     * Handle listing user's games
     */
    async handleListMyGames(interaction, userId, username) {
        const userSessions = sessionManager.getUserSessions(userId);

        if (userSessions.length === 0) {
            const embed = buildSessionEmbed({
                title: '🎮 Your Game Sessions',
                topFields: [
                    { name: 'No Active Games', value: 'You don\'t have any active game sessions.' }
                ],
                color: 0x0099FF,
                footer: 'Session Manager'
            });

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const topFields = [];
        
        userSessions.forEach((session, index) => {
            const duration = Math.round((Date.now() - session.createdAt) / 1000);
            const timeoutRemaining = sessionManager.getTimeoutRemaining(session.sessionId);
            
            topFields.push({
                name: `${session.gameType.toUpperCase()} Game`,
                value: `**Session:** ${session.sessionId.split('_')[3]}\n` +
                       `**Duration:** ${duration}s\n` +
                       `**Timeout:** ${Math.round(timeoutRemaining / 1000)}s remaining\n` +
                       `**Bet:** ${session.betAmount > 0 ? `$${session.betAmount.toLocaleString()}` : 'None'}`,
                inline: true
            });
        });

        const embed = buildSessionEmbed({
            title: `🎮 ${username}'s Active Sessions`,
            topFields,
            stageText: `${userSessions.length} ACTIVE SESSIONS`,
            color: 0x0099FF,
            footer: 'Session Manager • Use /stopgame to cancel all sessions'
        });

        await interaction.editReply({ embeds: [embed] });
    },

    /**
     * Handle developer actions
     */
    async handleDeveloperAction(interaction, action, targetUser, cleanupMinutes) {
        switch (action) {
            case 'dev_list_all':
                await this.handleDevListAll(interaction);
                break;
            case 'dev_stop_user':
                await this.handleDevStopUser(interaction, targetUser);
                break;
            case 'dev_cleanup':
                await this.handleDevCleanup(interaction, cleanupMinutes);
                break;
            case 'dev_stats':
                await this.handleDevStats(interaction);
                break;
        }
    },

    /**
     * Developer: List all active sessions
     */
    async handleDevListAll(interaction) {
        const allSessions = sessionManager.getAllActiveSessions();

        if (allSessions.length === 0) {
            const embed = buildSessionEmbed({
                title: '🔧 All Active Sessions',
                topFields: [
                    { name: 'No Active Sessions', value: 'There are currently no active game sessions.' }
                ],
                color: 0x0099FF,
                footer: 'Session Manager • Developer Tools'
            });

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Group sessions by game type
        const sessionsByGame = {};
        allSessions.forEach(session => {
            if (!sessionsByGame[session.gameType]) {
                sessionsByGame[session.gameType] = [];
            }
            sessionsByGame[session.gameType].push(session);
        });

        const topFields = [];
        
        Object.entries(sessionsByGame).forEach(([gameType, sessions]) => {
            const sessionList = sessions.slice(0, 3).map(s => 
                `User: ${s.userId.slice(-4)} | ${Math.round(s.duration / 1000)}s | $${s.betAmount.toLocaleString()}`
            ).join('\n');
            
            topFields.push({
                name: `${gameType.toUpperCase()} (${sessions.length})`,
                value: sessionList + (sessions.length > 3 ? `\n...and ${sessions.length - 3} more` : ''),
                inline: true
            });
        });

        const stats = sessionManager.getSessionStats();

        const embed = buildSessionEmbed({
            title: '🔧 All Active Sessions',
            topFields,
            bankFields: [
                { name: 'Total Active', value: stats.activeSessions.toString(), inline: true },
                { name: 'Active Users', value: stats.activeUsers.toString(), inline: true },
                { name: 'Avg/User', value: stats.avgSessionsPerUser, inline: true }
            ],
            stageText: `${allSessions.length} ACTIVE SESSIONS`,
            color: 0xFFAA00,
            footer: 'Session Manager • Developer Tools'
        });

        await interaction.editReply({ embeds: [embed] });
    },

    /**
     * Developer: Stop specific user sessions
     */
    async handleDevStopUser(interaction, targetUser) {
        if (!targetUser) {
            const embed = buildSessionEmbed({
                title: '❌ Missing Target',
                topFields: [
                    { name: 'User Required', value: 'Please specify a target user to stop their sessions.' }
                ],
                color: 0xFF0000,
                footer: 'Session Manager • Developer Tools'
            });

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const userSessions = sessionManager.getUserSessions(targetUser.id);

        if (userSessions.length === 0) {
            const embed = buildSessionEmbed({
                title: '🔧 No User Sessions',
                topFields: [
                    { name: 'No Active Games', value: `${targetUser.displayName} doesn't have any active sessions.` }
                ],
                color: 0x0099FF,
                footer: 'Session Manager • Developer Tools'
            });

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Stop all user sessions
        const results = await sessionManager.cancelUserSessions(
            targetUser.id,
            'Developer force stop',
            interaction.user.id
        );

        const successful = results.filter(r => r.success);
        const refunded = results.filter(r => r.refunded);

        const embed = buildSessionEmbed({
            title: '🔧 Developer Stop Sessions',
            topFields: [
                { 
                    name: 'Target User', 
                    value: `${targetUser.displayName} (${targetUser.id})` 
                },
                { 
                    name: 'Sessions Stopped', 
                    value: `✅ Successfully stopped **${successful.length}** session(s)` 
                },
                ...(refunded.length > 0 ? [{
                    name: 'Refunds Processed',
                    value: `💰 ${refunded.length} bet(s) refunded`
                }] : [])
            ],
            stageText: 'FORCE STOP COMPLETED',
            color: 0x00FF00,
            footer: 'Session Manager • Developer Tools'
        });

        await interaction.editReply({ embeds: [embed] });

        logger.info(`Developer ${interaction.user.id} force stopped ${successful.length} sessions for user ${targetUser.id}`);
    },

    /**
     * Developer: Force cleanup stale sessions
     */
    async handleDevCleanup(interaction, cleanupMinutes) {
        const result = await sessionManager.forceCleanup(cleanupMinutes);

        const embed = buildSessionEmbed({
            title: '🔧 Force Cleanup Complete',
            topFields: [
                { name: 'Cleanup Parameters', value: `Sessions inactive for **${cleanupMinutes}+ minutes**` },
                { name: 'Stale Sessions Found', value: result.staleSessions.toString() },
                { name: 'Sessions Cleaned', value: `✅ ${result.cleaned} sessions removed` }
            ],
            stageText: result.cleaned > 0 ? 'CLEANUP COMPLETED' : 'NO CLEANUP NEEDED',
            color: result.cleaned > 0 ? 0x00FF00 : 0x0099FF,
            footer: 'Session Manager • Developer Tools'
        });

        await interaction.editReply({ embeds: [embed] });

        logger.info(`Developer ${interaction.user.id} performed force cleanup: ${result.cleaned} sessions cleaned`);
    },

    /**
     * Developer: Show session statistics
     */
    async handleDevStats(interaction) {
        const stats = sessionManager.getSessionStats();

        const embed = buildSessionEmbed({
            title: '🔧 Session Manager Statistics',
            topFields: [
                { name: 'Current Status', value: `**${stats.activeSessions}** active sessions\n**${stats.activeUsers}** active users` },
                { name: 'Session History', value: `**${stats.totalSessions}** total sessions created\n**${stats.completedSessions}** completed normally` }
            ],
            bankFields: [
                { name: 'Completed', value: stats.completedSessions.toString(), inline: true },
                { name: 'Timeouts', value: stats.timeoutSessions.toString(), inline: true },
                { name: 'Cancelled', value: stats.cancelledSessions.toString(), inline: true },
                { name: 'Errors', value: stats.errors.toString(), inline: true },
                { name: 'Avg/User', value: stats.avgSessionsPerUser, inline: true },
                { name: 'Active Now', value: stats.activeSessions.toString(), inline: true }
            ],
            stageText: 'SESSION STATISTICS',
            color: 0x0099FF,
            footer: 'Session Manager • Developer Tools'
        });

        await interaction.editReply({ embeds: [embed] });
    }
};