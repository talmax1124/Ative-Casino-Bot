/**
 * Session Status Command - Debug and monitor active game sessions
 * Helps identify and resolve session-related issues
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const sessionManager = require('../UTILS/sessionManager');
const { SessionState } = sessionManager;
const dbManager = require('../UTILS/database');
const { getGuildId, fmt, getActiveGame, clearActiveGame } = require('../UTILS/common');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sessionstatus')
        .setDescription('Check your active game sessions and resolve issues')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Check sessions for a specific user (Admin only)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('fix')
                .setDescription('Attempt to fix any session issues')
                .setRequired(false)),

    async execute(interaction) {
        const requesterId = interaction.user.id;
        const targetUser = interaction.options.getUser('user');
        const attemptFix = interaction.options.getBoolean('fix') || false;
        const guildId = await getGuildId(interaction);
        
        // Check if requester is admin/dev for checking other users
        const isAdmin = interaction.member?.permissions.has('Administrator') || 
                       requesterId === '466050111680544798'; // Dev ID
        
        const userId = (targetUser && isAdmin) ? targetUser.id : requesterId;
        const username = (targetUser && isAdmin) ? targetUser.username : interaction.user.username;
        
        try {
            // Debug all sessions
            sessionManager.debugSessions();
            
            // Get user sessions via Unified Session Manager
            const activeSession = sessionManager.getUserActiveSession(userId);
            const userSessions = sessionManager.getUserSessions(userId);
            
            // Get user balance to check legacy flags
            const balance = await dbManager.getUserBalance(userId, guildId);
            
            // Get session manager status
            const guardStatus = { healthy: true, activeGuards: 0 }; // Replaced sessionGuard with session manager
            
            // Check for issues
            const issues = [];
            
            // Check for legacy game_active flag
            if (balance.game_active && userSessions.length === 0) {
                issues.push('❗ Legacy game_active flag is set but no active sessions found');
            }
            
            // Check for stale sessions
            const staleSessions = userSessions.filter(s => {
                const age = Date.now() - s.lastActivity;
                return age > 600000; // 10 minutes
            });
            
            if (staleSessions.length > 0) {
                issues.push(`⚠️ ${staleSessions.length} stale session(s) detected`);
            }
            
            // Check for sessions without timeouts (skip this check for unified manager)
            const noTimeoutSessions = [];
            
            if (noTimeoutSessions.length > 0) {
                issues.push(`⏰ ${noTimeoutSessions.length} session(s) missing timeout protection`);
            }
            
            // Attempt fixes if requested
            let fixResults = null;
            if (attemptFix && (issues.length > 0 || userSessions.length > 0)) {
                fixResults = await this.attemptFixes(userId, guildId);
            }
            
            // Build response embed
            const embed = new EmbedBuilder()
                .setTitle(`🎮 Session Status - ${username}`)
                .setColor(issues.length > 0 ? 0xFFAA00 : 0x00FF00)
                .setTimestamp();
            
            // Show raw session data
            const sessionInfo = activeSession ? 
                `**Active Session Found:**\n` +
                `Session ID: ${activeSession.sessionId}\n` +
                `Game Type: ${activeSession.gameType}\n` +
                `Bet Amount: ${fmt(activeSession.betAmount)}\n` +
                `Started: <t:${Math.floor((activeSession.createdAt || Date.now()) / 1000)}:R>\n` +
                `State: ${activeSession.state}` :
                'No active sessions';
            
            embed.addFields(
                { name: '📊 Session Info', value: sessionInfo }
            );
            
            // Active sessions field
            if (userSessions.length > 0) {
                const sessionList = userSessions.map(s => {
                    const age = Math.floor((Date.now() - s.createdAt) / 1000);
                    const stateEmoji = this.getStateEmoji(s.state);
                    return `${stateEmoji} **${s.gameType}** (${s.state})\n` +
                           `├ ID: \`${s.sessionId.substring(0, 20)}...\`\n` +
                           `├ Bet: ${fmt(s.betAmount)}\n` +
                           `├ Age: ${age}s\n` +
                           `└ Timeout: ${s.timeout ? `${s.timeout/1000}s` : 'None'}`;
                }).join('\n\n');
                
                embed.addFields({
                    name: `📋 Active Sessions (${userSessions.length})`,
                    value: sessionList.substring(0, 1000) || 'None',
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '📋 Active Sessions',
                    value: '✅ No active sessions',
                    inline: false
                });
            }
            
            // Issues field
            if (issues.length > 0) {
                embed.addFields({
                    name: '⚠️ Detected Issues',
                    value: issues.join('\n'),
                    inline: false
                });
            }
            
            // Fix results field
            if (fixResults) {
                embed.addFields({
                    name: '🔧 Fix Results',
                    value: fixResults,
                    inline: false
                });
            }
            
            // System status field (admin only)
            if (isAdmin) {
                const stats = sessionManager.getStats();
                embed.addFields({
                    name: '📊 System Status',
                    value: `Total Active: ${stats.activeSessions}\n` +
                           `Total Sessions: ${stats.totalSessions}\n` +
                           `Users with Sessions: ${stats.usersWithSessions}`,
                    inline: true
                });
            }
            
            // Add helpful tips
            const tips = [];
            if (userSessions.length > 0) {
                tips.push('Use `/stopgame` to cancel all active sessions');
            }
            if (issues.length > 0) {
                tips.push('Use `/sessionstatus fix:true` to attempt automatic fixes');
            }
            if (staleSessions.length > 0) {
                tips.push('Stale sessions will be auto-cleaned after timeout');
            }
            
            if (tips.length > 0) {
                embed.addFields({
                    name: '💡 Tips',
                    value: tips.join('\n'),
                    inline: false
                });
            }
            
            embed.setFooter({ 
                text: `Session Manager v1.0 • ${issues.length} issue(s) detected` 
            });
            
            await interaction.reply({ 
                embeds: [embed], 
                ephemeral: true 
            });
            
        } catch (error) {
            logger.error(`Session status command error: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Session Status Error')
                .setDescription('Failed to retrieve session status. Please try again.')
                .setColor(0xFF0000)
                .addFields({
                    name: 'Error',
                    value: `\`${error.message}\``
                })
                .setTimestamp();
            
            await interaction.reply({ 
                embeds: [errorEmbed], 
                ephemeral: true 
            });
        }
    },

    /**
     * Attempt to fix detected issues
     */
    async attemptFixes(userId, guildId) {
        const results = [];
        try {
            // Snapshot legacy states
            const beforeBalance = await dbManager.getUserBalance(userId, guildId);
            const beforeLegacy = getActiveGame(userId);

            // Force cleanup sessions (also clears DB game_active)
            const cleanupResult = await sessionManager.forceCleanupUser(userId, guildId, 'Session status fix');

            if (cleanupResult.success) {
                results.push('✅ Force cleanup completed');
                results.push(`✅ Sessions cancelled: ${cleanupResult.sessionsCleaned}`);
                if (cleanupResult.totalRefunded > 0) {
                    results.push(`💸 Refunded: ${fmt(cleanupResult.totalRefunded)}`);
                }

                // Re-check legacy flags and registry
                const afterBalance = await dbManager.getUserBalance(userId, guildId);
                if (beforeBalance.game_active && !afterBalance.game_active) {
                    results.push('🧹 Cleared DB legacy flag: game_active');
                }

                // Clear legacy registry if present
                const stillLegacy = getActiveGame(userId);
                if (stillLegacy) {
                    clearActiveGame(userId);
                    results.push(`🧹 Cleared legacy registry entry: ${stillLegacy}`);
                }
            } else {
                results.push(`❌ Cleanup failed: ${cleanupResult.error}`);
            }
        } catch (error) {
            results.push(`❌ Fix error: ${error.message}`);
        }

        return results.join('\n');
    },

    /**
     * Get emoji for session state
     */
    getStateEmoji(state) {
        const emojis = {
            'active': '🟢',
            'paused': '⏸️',
            'completed': '✅',
            'timeout': '⏰',
            'cancelled': '❌',
            'error': '⚠️'
        };
        return emojis[state] || '❓';
    }
};
