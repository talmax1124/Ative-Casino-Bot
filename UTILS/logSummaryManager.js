/**
 * Log Summary Manager - Provides periodic summaries to logs channel
 * Collects and analyzes activity data to send meaningful summaries
 */

const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');
const dbManager = require('./database');

class LogSummaryManager {
    constructor(client) {
        this.client = client;
        this.summaryData = {
            games: new Map(),
            users: new Set(),
            totalWagered: 0,
            totalPayouts: 0,
            netWinnings: 0,
            largestWin: { amount: 0, user: null, game: null },
            errors: 0,
            activities: []
        };
        this.lastSummaryTime = Date.now();
        this.SUMMARY_INTERVAL = 1 * 60 * 60 * 1000; // 1 hour
        this.LOG_CHANNEL_ID = '1405096821512212521'; // General log channel
    }

    /**
     * Start the summary manager
     */
    start() {
        logger.info('📊 Starting Log Summary Manager');
        
        // Send summaries every hour
        setInterval(() => {
            this.generateHourlySummary();
        }, this.SUMMARY_INTERVAL);

        // Send daily summary at midnight
        setInterval(() => {
            const now = new Date();
            if (now.getHours() === 0 && now.getMinutes() === 0) {
                this.generateDailySummary();
            }
        }, 60 * 1000); // Check every minute
    }

    /**
     * Record game activity for summary
     */
    recordGameActivity(gameType, userId, betAmount, payout, won) {
        // Update game statistics
        if (!this.summaryData.games.has(gameType)) {
            this.summaryData.games.set(gameType, {
                plays: 0,
                totalWagered: 0,
                totalPayouts: 0,
                netWinnings: 0,
                biggestWin: 0,
                users: new Set()
            });
        }

        const gameData = this.summaryData.games.get(gameType);
        gameData.plays++;
        gameData.totalWagered += betAmount;
        gameData.totalPayouts += payout;
        // Calculate net winnings (profit only, not including returned bet)
        const netWinnings = won ? (payout - betAmount) : 0;
        gameData.netWinnings += netWinnings;
        gameData.users.add(userId);

        if (won && payout > gameData.biggestWin) {
            gameData.biggestWin = payout;
        }

        // Update overall statistics
        this.summaryData.users.add(userId);
        this.summaryData.totalWagered += betAmount;
        this.summaryData.totalPayouts += payout;
        this.summaryData.netWinnings = (this.summaryData.netWinnings || 0) + netWinnings;

        // Track largest win
        if (won && payout > this.summaryData.largestWin.amount) {
            this.summaryData.largestWin = {
                amount: payout,
                user: userId,
                game: gameType
            };
        }

        // Record activity
        this.summaryData.activities.push({
            type: 'game',
            gameType,
            userId,
            betAmount,
            payout,
            won,
            timestamp: Date.now()
        });
    }

    /**
     * Record error for summary
     */
    recordError(error, context) {
        this.summaryData.errors++;
        this.summaryData.activities.push({
            type: 'error',
            error: error.message,
            context,
            timestamp: Date.now()
        });
    }

    /**
     * Record general activity for summary
     */
    recordActivity(type, description, userId = null) {
        this.summaryData.activities.push({
            type,
            description,
            userId,
            timestamp: Date.now()
        });
    }

    /**
     * Generate and send hourly summary
     */
    async generateHourlySummary() {
        try {
            const channel = await this.client.channels.fetch(this.LOG_CHANNEL_ID);
            if (!channel) return;

            const summary = this.buildHourlySummary();
            if (summary.totalActivity === 0) return; // Skip if no activity

            const embed = new EmbedBuilder()
                .setTitle('📊 Hourly Activity Summary')
                .setColor(0x00BFFF)
                .setTimestamp()
                .setFooter({ text: 'ATIVE Casino Analytics' });

            // Overview
            embed.addFields({
                name: '📈 Overview',
                value: `🎮 **Games Played:** ${summary.totalGames}\n💰 **Total Wagered:** $${summary.totalWagered.toLocaleString()}\n🎁 **Total Payouts:** $${summary.totalPayouts.toLocaleString()}\n👥 **Active Users:** ${summary.activeUsers}\n❌ **Errors:** ${summary.errors}`,
                inline: false
            });

            // Top games
            if (summary.topGames.length > 0) {
                const topGamesText = summary.topGames
                    .slice(0, 5)
                    .map((game, index) => `${index + 1}. **${game.name}** - ${game.plays} plays`)
                    .join('\n');
                
                embed.addFields({
                    name: '🏆 Most Popular Games',
                    value: topGamesText,
                    inline: true
                });
            }

            // Largest win
            if (summary.largestWin.amount > 0) {
                embed.addFields({
                    name: '🎉 Largest Win',
                    value: `💰 **$${summary.largestWin.amount.toLocaleString()}**\n🎮 Game: ${summary.largestWin.game}\n👤 User: <@${summary.largestWin.user}>`,
                    inline: true
                });
            }

            // House edge using correct casino mathematics
            const houseEdge = summary.totalWagered > 0 ? 
                (((summary.totalWagered - (summary.netWinnings || 0)) / summary.totalWagered) * 100).toFixed(2) : '0.00';
            
            embed.addFields({
                name: '🏛️ House Performance',
                value: `📊 **House Edge:** ${houseEdge}%\n💸 **House Profit:** $${(summary.totalWagered - (summary.netWinnings || 0)).toLocaleString()}`,
                inline: false
            });

            await channel.send({ embeds: [embed] });
            logger.info('📊 Sent hourly activity summary');

            // Reset summary data
            this.resetSummaryData();

        } catch (error) {
            logger.error(`Failed to generate hourly summary: ${error.message}`);
        }
    }

    /**
     * Generate and send daily summary
     */
    async generateDailySummary() {
        try {
            const channel = await this.client.channels.fetch(this.LOG_CHANNEL_ID);
            if (!channel) return;

            // Get data from database for the last 24 hours
            const dailyStats = await this.getDailyStatsFromDB();

            const embed = new EmbedBuilder()
                .setTitle('📅 Daily Activity Report')
                .setColor(0x4CAF50)
                .setTimestamp()
                .setFooter({ text: 'ATIVE Casino Daily Analytics' });

            embed.addFields(
                {
                    name: '📊 24-Hour Statistics',
                    value: `🎮 **Total Games:** ${dailyStats.totalGames}\n💰 **Total Wagered:** $${dailyStats.totalWagered.toLocaleString()}\n🎁 **Total Payouts:** $${dailyStats.totalPayouts.toLocaleString()}\n👥 **Unique Players:** ${dailyStats.uniquePlayers}`,
                    inline: false
                },
                {
                    name: '🏆 Performance Metrics',
                    value: `📈 **House Edge:** ${dailyStats.houseEdge}%\n💵 **House Profit:** $${dailyStats.houseProfit.toLocaleString()}\n⭐ **Average Bet:** $${dailyStats.averageBet.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '🎯 Top Performers',
                    value: `🥇 **Most Popular Game:** ${dailyStats.topGame}\n💎 **Biggest Win:** $${dailyStats.biggestWin.toLocaleString()}\n🎲 **Most Active Player:** <@${dailyStats.mostActivePlayer}>`,
                    inline: true
                }
            );

            await channel.send({ embeds: [embed] });
            logger.info('📅 Sent daily activity report');

        } catch (error) {
            logger.error(`Failed to generate daily summary: ${error.message}`);
        }
    }

    /**
     * Build hourly summary from collected data
     */
    buildHourlySummary() {
        const games = Array.from(this.summaryData.games.entries()).map(([name, data]) => ({
            name,
            plays: data.plays,
            wagered: data.totalWagered,
            payouts: data.totalPayouts
        }));

        const topGames = games
            .sort((a, b) => b.plays - a.plays)
            .slice(0, 5);

        return {
            totalGames: games.reduce((sum, game) => sum + game.plays, 0),
            totalWagered: this.summaryData.totalWagered,
            totalPayouts: this.summaryData.totalPayouts,
            activeUsers: this.summaryData.users.size,
            errors: this.summaryData.errors,
            topGames,
            largestWin: this.summaryData.largestWin,
            totalActivity: this.summaryData.activities.length
        };
    }

    /**
     * Get daily statistics from database
     */
    async getDailyStatsFromDB() {
        try {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            // Get game statistics
            const gameStatsQuery = `
                SELECT 
                    COUNT(*) as total_games,
                    SUM(bet_amount) as total_wagered,
                    SUM(payout) as total_payouts,
                    SUM(CASE WHEN won = 1 THEN payout - bet_amount ELSE 0 END) as net_winnings,
                    COUNT(DISTINCT user_id) as unique_players,
                    AVG(bet_amount) as avg_bet,
                    MAX(payout) as biggest_win,
                    game_type,
                    COUNT(*) as game_count
                FROM game_results 
                WHERE played_at >= ?
                GROUP BY game_type
                ORDER BY game_count DESC
                LIMIT 1
            `;

            const [gameStats] = await dbManager.databaseAdapter.executeQuery(gameStatsQuery, [twentyFourHoursAgo]);

            // Get most active player
            const activePlayerQuery = `
                SELECT user_id, COUNT(*) as game_count
                FROM game_results 
                WHERE played_at >= ?
                GROUP BY user_id
                ORDER BY game_count DESC
                LIMIT 1
            `;

            const [activePlayer] = await dbManager.databaseAdapter.executeQuery(activePlayerQuery, [twentyFourHoursAgo]);

            // Use proper casino mathematics for daily stats
            const houseProfit = (gameStats?.total_wagered || 0) - (gameStats?.net_winnings || 0);
            const houseEdge = gameStats?.total_wagered > 0 ? 
                ((houseProfit / gameStats.total_wagered) * 100).toFixed(2) : '0.00';

            return {
                totalGames: gameStats?.total_games || 0,
                totalWagered: gameStats?.total_wagered || 0,
                totalPayouts: gameStats?.total_payouts || 0,
                uniquePlayers: gameStats?.unique_players || 0,
                averageBet: Math.round(gameStats?.avg_bet || 0),
                biggestWin: gameStats?.biggest_win || 0,
                houseEdge,
                houseProfit,
                topGame: gameStats?.game_type || 'None',
                mostActivePlayer: activePlayer?.user_id || 'None'
            };

        } catch (error) {
            logger.error(`Failed to get daily stats from DB: ${error.message}`);
            return {
                totalGames: 0,
                totalWagered: 0,
                totalPayouts: 0,
                uniquePlayers: 0,
                averageBet: 0,
                biggestWin: 0,
                houseEdge: '0.00',
                houseProfit: 0,
                topGame: 'None',
                mostActivePlayer: 'None'
            };
        }
    }

    /**
     * Reset summary data after sending summary
     */
    resetSummaryData() {
        this.summaryData = {
            games: new Map(),
            users: new Set(),
            totalWagered: 0,
            totalPayouts: 0,
            netWinnings: 0,
            largestWin: { amount: 0, user: null, game: null },
            errors: 0,
            activities: []
        };
        this.lastSummaryTime = Date.now();
    }

    /**
     * Send immediate summary on demand
     */
    async sendImmediateSummary(type = 'hourly') {
        if (type === 'daily') {
            await this.generateDailySummary();
        } else {
            await this.generateHourlySummary();
        }
    }
}

module.exports = LogSummaryManager;