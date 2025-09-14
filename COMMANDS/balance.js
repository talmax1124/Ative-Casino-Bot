/**
 * Balance command for ATIVE Casino Bot
 * Shows comprehensive balance and economic status information
 */

const { SlashCommandBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage, getEconomicTier, getTierDisplay, calculateDailyInterest, safeSubtract } = require('../UTILS/common');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const logger = require('../UTILS/logger');

// Developer ID for Off-Economy status
const DEVELOPER_ID = '466050111680544798';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your balance or another user\'s balance')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to check balance for')
                .setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;
        const username = targetUser.displayName;
        const guildId = await getGuildId(interaction);

        try {
            await interaction.deferReply();

            // Ensure user exists in database
            await dbManager.ensureUser(userId, username);
            
            // Get balance information
            const balance = await dbManager.getUserBalance(userId, guildId);
            const totalBalance = balance.wallet + balance.bank;
            const tier = getEconomicTier(totalBalance);
            const dailyInterest = calculateDailyInterest(balance.bank, totalBalance);
            
            // Check if this is the developer (Off-Economy status)
            const isOffEconomy = targetUser.id === DEVELOPER_ID;

            // Get aggregated win/loss stats across all games
            const gameStats = await this.getAggregatedGameStats(userId, guildId);
            
            const topFields = [];
            
            // Main balance information
            topFields.push({
                name: '💰 BALANCE OVERVIEW',
                value: `💵 **Wallet:** ${fmt(balance.wallet)}\n🏦 **Bank:** ${fmt(balance.bank)}\n💎 **Total Worth:** ${fmt(totalBalance)}`,
                inline: false
            });

            // Status information (tier or off-economy)
            if (isOffEconomy) {
                topFields.push({
                    name: '🛡️ DEVELOPER STATUS',
                    value: `**Status:** Off-Economy (Developer)\n**Protection:** Cannot be robbed\n**System Access:** Full admin privileges`,
                    inline: false
                });
            } else {
                topFields.push({
                    name: '🎖️ ECONOMIC STATUS',
                    value: `**Tier:** ${getTierDisplay(totalBalance)}\n**Interest Rate:** ${tier.interest > 0 ? `${(tier.interest * 100).toFixed(0)}% Annual` : 'None'}\n**Daily Interest:** ${dailyInterest > 0 ? fmt(dailyInterest) : 'None'}`,
                    inline: false
                });
            }

            // Gaming statistics
            if (gameStats.totalGames > 0) {
                const winRate = ((gameStats.totalWins / gameStats.totalGames) * 100).toFixed(1);
                const netProfit = safeSubtract(gameStats.totalWon || 0, gameStats.totalWagered || 0);
                const netText = netProfit >= 0 ? `+${fmt(netProfit)}` : fmt(netProfit);
                const netEmoji = netProfit >= 0 ? '✅' : '❌';
                
                // Fixed ROI calculation with proper safeguards
                let roi = '0.00';
                if (gameStats.totalWagered > 0 && gameStats.totalWon > 0) {
                    roi = (((gameStats.totalWon - gameStats.totalWagered) / gameStats.totalWagered) * 100).toFixed(2);
                }
                const roiEmoji = parseFloat(roi) >= 0 ? '📈' : '📉';
                
                topFields.push({
                    name: '🎮 GAMING STATISTICS',
                    value: `**Games Played:** ${gameStats.totalGames.toLocaleString()}\n**Win Rate:** ${winRate}% (${gameStats.totalWins}W/${gameStats.totalLosses}L)\n**Total Wagered:** ${fmt(gameStats.totalWagered || 0)}\n**Total Won:** ${fmt(gameStats.totalWon || 0)}\n**Net Profit:** ${netEmoji} ${netText}\n**ROI:** ${roiEmoji} ${roi}%`,
                    inline: false
                });
            }

            // Banking information for bottom section
            const bankFields = [
                { name: '💵 Available Cash', value: fmt(balance.wallet), inline: true },
                { name: '🏦 Saved Money', value: fmt(balance.bank), inline: true },
                { name: '🎖️ Economic Tier', value: tier.name, inline: true }
            ];

            // Add additional statistics if user has played games
            if (gameStats.totalGames > 0) {
                // Fixed Average Bet Size calculation with proper safeguards
                let avgBetSize = '$0';
                if (gameStats.totalGames > 0 && gameStats.totalWagered > 0) {
                    avgBetSize = fmt(Math.round(gameStats.totalWagered / gameStats.totalGames));
                }
                
                bankFields.push(
                    { name: '🎲 Games Played', value: gameStats.totalGames.toLocaleString(), inline: true },
                    { name: '🏆 Win Percentage', value: `${((gameStats.totalWins / gameStats.totalGames) * 100).toFixed(1)}%`, inline: true },
                    { name: '💰 Avg. Bet Size', value: avgBetSize, inline: true }
                );
            }

            // Stage text based on total balance
            let stageText = 'BALANCE CHECKED';
            if (totalBalance >= 1000000000) stageText = 'BILLIONAIRE STATUS';
            else if (totalBalance >= 100000000) stageText = 'MILLIONAIRE STATUS';
            else if (totalBalance >= 10000000) stageText = 'HIGH ROLLER';
            else if (totalBalance >= 1000000) stageText = 'ESTABLISHED PLAYER';
            else if (totalBalance >= 100000) stageText = 'GROWING WEALTH';

            const embed = buildSessionEmbed({
                title: `💰 ${username}'s Casino Balance`,
                topFields,
                bankFields,
                stageText,
                color: isOffEconomy ? 0x9B59B6 : (totalBalance >= 1000000 ? 0xFFD700 : 0x00FF00),
                footer: '💰 Balance Command • ATIVE Casino'
            });

            await interaction.editReply({ embeds: [embed] });

            // Log balance check (only for other users)
            if (targetUser.id !== interaction.user.id) {
                await sendLogMessage(
                    interaction.client,
                    'economy',
                    `Balance check: ${interaction.user.displayName} viewed ${username}'s balance (${fmt(totalBalance)} total)`,
                    interaction.user.id,
                    guildId
                );
            }

        } catch (error) {
            logger.error(`Error processing balance command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Balance Error',
                topFields: [
                    { name: '🔧 System Error', value: 'Unable to retrieve balance information.' }
                ],
                stageText: 'ERROR',
                color: 0xFF0000,
                footer: 'Please try again later'
            });

            try {
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: 64 });
                }

                // Send error log
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `Balance error for ${interaction.user.displayName} checking ${username} — ${error.message}`,
                    interaction.user.id,
                    guildId
                );
            } catch (replyError) {
                logger.error(`Failed to send balance error reply: ${replyError.message}`);
            }
        }
    },

    /**
     * Get aggregated game statistics for a user
     */
    async getAggregatedGameStats(userId, guildId) {
        try {
            // List of all possible game types - updated with latest games
            const gameTypes = [
                'blackjack', 'slots', 'multi-slots', 'crash', 'duck', 'fishing', 
                'plinko', 'rps', 'bingo', 'battleship', 'uno', 'roulette', 
                'baccarat', 'coinflip', 'dice', 'heist', 'lottery', 'matrix_slots',
                'treasurevault', 'yahtzee', 'wordchain', 'ceelo', 'russianroulette',
                'scratch', 'keno', 'riddle'
            ];
            
            let totalWins = 0;
            let totalLosses = 0;
            let totalWagered = 0;
            let totalWon = 0;
            
            for (const gameType of gameTypes) {
                try {
                    const stats = await dbManager.getUserStats(userId, guildId, gameType);
                    if (stats) {
                        totalWins += stats.wins || 0;
                        totalLosses += stats.losses || 0;
                        totalWagered += stats.total_wagered || 0;
                        totalWon += stats.total_won || 0;
                    }
                } catch (error) {
                    // Skip this game type if error occurs
                    continue;
                }
            }
            
            return {
                totalWins,
                totalLosses,
                totalGames: totalWins + totalLosses,
                totalWagered,
                totalWon
            };
        } catch (error) {
            logger.error(`Error getting aggregated game stats: ${error.message}`);
            return {
                totalWins: 0,
                totalLosses: 0,
                totalGames: 0,
                totalWagered: 0,
                totalWon: 0
            };
        }
    }
};