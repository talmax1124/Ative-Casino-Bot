/**
 * Game Status Command - Monitor stuck games and recovery system
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const stuckGameRecovery = require('../UTILS/stuckGameRecovery');
const sessionManager = require('../UTILS/sessionManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gamestatus')
        .setDescription('View current game sessions and recovery status')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action to perform')
                .addChoices(
                    { name: 'status', value: 'status' },
                    { name: 'force-release', value: 'force-release' }
                )
                .setRequired(false))
        .addStringOption(option =>
            option.setName('gameid')
                .setDescription('Game ID to force release')
                .setRequired(false)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const action = interaction.options.getString('action') || 'status';
        const gameId = interaction.options.getString('gameid');

        // Check if user has admin permissions (modify as needed)
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            return interaction.reply({
                content: '❌ You need administrator permissions to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            if (action === 'force-release' && gameId) {
                // Force release a specific game
                const result = await stuckGameRecovery.forceRelease(gameId);
                
                return interaction.editReply({
                    content: result.success 
                        ? `✅ ${result.message}`
                        : `❌ ${result.message}`
                });
            }

            // Get recovery stats
            const recoveryStats = stuckGameRecovery.getStats();
            const sessionStats = sessionManager.getStats();

            // Create status embed
            const embed = new EmbedBuilder()
                .setTitle('🎮 Game Status & Recovery Monitor')
                .setColor(0x00ff00)
                .setTimestamp();

            // Session Manager Stats
            embed.addFields({
                name: '📊 Session Manager',
                value: `**Active Sessions:** ${sessionStats.activeSessions}\n` +
                       `**Total Created:** ${sessionStats.totalCreated}\n` +
                       `**Total Ended:** ${sessionStats.totalEnded}\n` +
                       `**Success Rate:** ${sessionStats.totalCreated > 0 ? 
                           ((sessionStats.totalEnded / sessionStats.totalCreated) * 100).toFixed(1) : 0}%`,
                inline: true
            });

            // Recovery System Stats
            embed.addFields({
                name: '🔧 Recovery System',
                value: `**Monitored Games:** ${recoveryStats.monitoredGames}\n` +
                       `**Warning Timeout:** 1 minute\n` +
                       `**Release Timeout:** 1.5 minutes\n` +
                       `**Check Interval:** 30 seconds`,
                inline: true
            });

            // Current Monitored Games
            if (recoveryStats.games.length > 0) {
                const gamesList = recoveryStats.games.map(game => {
                    const minutes = Math.floor(game.duration / 60000);
                    const seconds = Math.floor((game.duration % 60000) / 1000);
                    const status = game.warned ? '⚠️ WARNED' : '🟢 NORMAL';
                    
                    return `**${game.gameType}** (${game.id.slice(-8)})\n` +
                           `User: <@${game.userId}>\n` +
                           `Duration: ${minutes}m ${seconds}s\n` +
                           `Status: ${status}`;
                }).join('\n\n');

                embed.addFields({
                    name: `🎯 Active Monitored Games (${recoveryStats.games.length})`,
                    value: gamesList.length > 1000 ? gamesList.substring(0, 1000) + '...' : gamesList,
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '🎯 Active Monitored Games',
                    value: 'No games currently being monitored',
                    inline: false
                });
            }

            // Add instructions
            embed.addFields({
                name: '🛠️ Commands',
                value: '`/gamestatus` - View this status\n' +
                       '`/gamestatus action:force-release gameid:XXX` - Force release a stuck game',
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Game status error:', error);
            await interaction.editReply({
                content: `❌ Error retrieving game status: ${error.message}`
            });
        }
    }
};