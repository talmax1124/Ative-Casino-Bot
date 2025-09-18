/**
 * Stats Command - Show current activity statistics
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { hasAdminRole, fmt } = require('../UTILS/common');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Show current casino activity statistics')
        .addStringOption(option =>
            option.setName('period')
                .setDescription('Time period for statistics')
                .setRequired(false)
                .addChoices(
                    { name: 'Last Hour', value: 'hour' },
                    { name: 'Last 24 Hours', value: 'day' },
                    { name: 'Last Week', value: 'week' },
                    { name: 'All Time', value: 'all' }
                )
        ),

    async execute(interaction) {
        const period = interaction.options.getString('period') || 'day';
        const isAdmin = hasAdminRole(interaction.member);

        await interaction.deferReply({ ephemeral: !isAdmin });

        try {
            // Get time range
            let timeFilter = '';
            let timeDesc = '';
            const now = new Date();

            switch (period) {
                case 'hour':
                    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
                    timeFilter = `WHERE created_at >= '${oneHourAgo.toISOString()}'`;
                    timeDesc = 'Last Hour';
                    break;
                case 'day':
                    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    timeFilter = `WHERE created_at >= '${oneDayAgo.toISOString()}'`;
                    timeDesc = 'Last 24 Hours';
                    break;
                case 'week':
                    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    timeFilter = `WHERE created_at >= '${oneWeekAgo.toISOString()}'`;
                    timeDesc = 'Last Week';
                    break;
                case 'all':
                    timeFilter = '';
                    timeDesc = 'All Time';
                    break;
            }

            // Get statistics from database
            const statsQuery = `
                SELECT 
                    COUNT(*) as total_games,
                    SUM(bet_amount) as total_wagered,
                    SUM(payout) as total_payouts,
                    SUM(CASE WHEN won = 1 THEN payout - bet_amount ELSE 0 END) as net_winnings,
                    COUNT(DISTINCT user_id) as unique_players,
                    AVG(bet_amount) as avg_bet,
                    MAX(payout) as biggest_win,
                    game_type
                FROM game_results 
                ${timeFilter}
                GROUP BY game_type
                ORDER BY total_games DESC
            `;

            const overallQuery = `
                SELECT 
                    COUNT(*) as total_games,
                    SUM(bet_amount) as total_wagered,
                    SUM(payout) as total_payouts,
                    SUM(CASE WHEN won = 1 THEN payout - bet_amount ELSE 0 END) as net_winnings,
                    COUNT(DISTINCT user_id) as unique_players,
                    AVG(bet_amount) as avg_bet,
                    MAX(payout) as biggest_win
                FROM game_results 
                ${timeFilter}
            `;

            const gameStats = await dbManager.databaseAdapter.executeQuery(statsQuery);
            const [overallStats] = await dbManager.databaseAdapter.executeQuery(overallQuery);

            if (!overallStats || overallStats.total_games === 0) {
                return interaction.editReply({
                    content: `📊 No activity found for ${timeDesc.toLowerCase()}.`,
                    ephemeral: !isAdmin
                });
            }

            // Calculate house edge using proper casino mathematics
            // House Edge = (Total Wagered - Net Player Winnings) / Total Wagered × 100%
            const houseProfit = (overallStats.total_wagered || 0) - (overallStats.net_winnings || 0);
            const houseEdge = overallStats.total_wagered > 0 ? 
                ((houseProfit / overallStats.total_wagered) * 100).toFixed(2) : '0.00';

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`📊 Casino Statistics - ${timeDesc}`)
                .setColor(0x00BFFF)
                .setTimestamp()
                .setFooter({ text: 'ATIVE Casino Analytics' });

            // Overall statistics
            embed.addFields({
                name: '📈 Overall Performance',
                value: `🎮 **Total Games:** ${overallStats.total_games.toLocaleString()}\n💰 **Total Wagered:** ${fmt(overallStats.total_wagered || 0)}\n🎁 **Total Payouts:** ${fmt(overallStats.total_payouts || 0)}\n👥 **Unique Players:** ${overallStats.unique_players}\n⭐ **Average Bet:** ${fmt(Math.round(overallStats.avg_bet || 0))}`,
                inline: false
            });

            // House performance (admin only)
            if (isAdmin) {
                embed.addFields({
                    name: '🏛️ House Performance',
                    value: `📊 **House Edge:** ${houseEdge}%\n💵 **House Profit:** ${fmt(houseProfit)}\n💎 **Biggest Win:** ${fmt(overallStats.biggest_win || 0)}`,
                    inline: true
                });
            }

            // Top games
            if (gameStats && gameStats.length > 0) {
                const topGames = gameStats
                    .slice(0, 5)
                    .map((game, index) => {
                        const gameHouseEdge = game.total_wagered > 0 ? 
                            (((game.total_wagered - (game.net_winnings || 0)) / game.total_wagered) * 100).toFixed(1) : '0.0';
                        return `${index + 1}. **${game.game_type}** - ${game.total_games} games${isAdmin ? ` (${gameHouseEdge}% edge)` : ''}`;
                    })
                    .join('\n');

                embed.addFields({
                    name: '🏆 Most Popular Games',
                    value: topGames,
                    inline: true
                });
            }

            // Current summary data if available
            if (interaction.client.logSummaryManager && isAdmin) {
                const summaryStats = interaction.client.logSummaryManager.buildHourlySummary();
                if (summaryStats.totalActivity > 0) {
                    embed.addFields({
                        name: '⏱️ Current Hour Activity',
                        value: `🎮 **Games:** ${summaryStats.totalGames}\n💰 **Wagered:** ${fmt(summaryStats.totalWagered)}\n👥 **Active Users:** ${summaryStats.activeUsers}`,
                        inline: true
                    });
                }
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error(`Failed to get statistics: ${error.message}`);
            
            await interaction.editReply({
                content: `❌ Failed to retrieve statistics: ${error.message}`,
                ephemeral: true
            });
        }
    }
};