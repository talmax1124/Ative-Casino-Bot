/**
 * Economy Command - Comprehensive economic analysis with graphs and statistics
 * Provides detailed insights into server economy with visual analytics
 */

const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getGuildId } = require('../UTILS/common');
const dbManager = require('../UTILS/database');
const { fmt } = require('../UTILS/moneyFormatter');
const EconomyCharts = require('../UTILS/economyCharts');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('economy')
        .setDescription('Analyze server economy with detailed statistics and graphs')
        .addStringOption(option =>
            option.setName('view')
                .setDescription('What economic analysis to view')
                .setRequired(false)
                .addChoices(
                    { name: '📊 Dashboard', value: 'dashboard' },
                    { name: '💰 Wealth Distribution', value: 'wealth' },
                    { name: '🎮 Game Analytics', value: 'games' },
                    { name: '📈 Economic Trends', value: 'trends' },
                    { name: '🏆 Top Users', value: 'leaderboard' },
                    { name: '👤 My Economic Status', value: 'mystats' }
                )
        )
        .addIntegerOption(option =>
            option.setName('days')
                .setDescription('Number of days for trend analysis (7-90)')
                .setMinValue(7)
                .setMaxValue(90)
                .setRequired(false)
        ),

    async execute(interaction) {
        const guildId = await getGuildId(interaction);
        const view = interaction.options.getString('view') || 'dashboard';
        const days = interaction.options.getInteger('days') || 30;
        
        try {
            await interaction.deferReply();

            const charts = new EconomyCharts();
            const stats = await dbManager.databaseAdapter.getEconomyStats(guildId);
            
            if (!stats) {
                throw new Error('Failed to fetch economy statistics');
            }

            switch (view) {
                case 'dashboard':
                    await this.showDashboard(interaction, stats, charts);
                    break;
                case 'wealth':
                    await this.showWealthDistribution(interaction, stats, charts);
                    break;
                case 'games':
                    await this.showGameAnalytics(interaction, stats, charts);
                    break;
                case 'trends':
                    await this.showEconomicTrends(interaction, days, charts);
                    break;
                case 'leaderboard':
                    await this.showLeaderboard(interaction, stats);
                    break;
                case 'mystats':
                    await this.showUserStats(interaction, guildId);
                    break;
            }

        } catch (error) {
            logger.error(`Error in economy command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Analysis Error')
                .setDescription('Failed to generate economic analysis. Please try again.')
                .setColor(0xFF0000);

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed] });
            }
        }
    },

    async showDashboard(interaction, stats, charts) {
        // Generate dashboard chart
        const dashboardCanvas = charts.createEconomyDashboard(stats);
        const dashboardAttachment = new AttachmentBuilder(dashboardCanvas.toBuffer(), { 
            name: 'economy-dashboard.png' 
        });

        // Create summary embed
        const embed = new EmbedBuilder()
            .setTitle('🏦 Economic Dashboard')
            .setDescription('Comprehensive overview of server economy health and metrics')
            .setColor(0x3498DB)
            .setImage('attachment://economy-dashboard.png')
            .addFields(
                {
                    name: '💰 Total Economy',
                    value: `**Total Wealth:** ${fmt(stats.totalWealth)}\n` +
                           `**Active Users:** ${stats.activeUsers.toLocaleString()}\n` +
                           `**Average Balance:** ${fmt(stats.avgBalance)}`,
                    inline: true
                },
                {
                    name: '🎮 Gaming Activity', 
                    value: `**Total Wagered:** ${fmt(stats.totalWagered)}\n` +
                           `**Total Won:** ${fmt(stats.totalWon)}\n` +
                           `**Win Rate:** ${stats.winRate.toFixed(1)}%`,
                    inline: true
                },
                {
                    name: '📈 Daily Activity',
                    value: `**Send Volume:** ${fmt(stats.dailySendVolume)}\n` +
                           `**Lottery Pool:** ${fmt(stats.lotteryPool)}\n` +
                           `**Transactions:** ${stats.totalTransactions.toLocaleString()}`,
                    inline: true
                }
            )
            .addFields({
                name: '📊 Quick Analysis',
                value: this.getEconomicInsights(stats),
                inline: false
            })
            .setFooter({ 
                text: '📊 Use different view options to explore specific areas • Economy Analytics' 
            })
            .setTimestamp();

        await interaction.editReply({ 
            embeds: [embed], 
            files: [dashboardAttachment] 
        });
    },

    async showWealthDistribution(interaction, stats, charts) {
        if (stats.wealthDistribution.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('💰 Wealth Distribution')
                .setDescription('No wealth distribution data available yet.')
                .setColor(0xF39C12);
            
            return await interaction.editReply({ embeds: [embed] });
        }

        // Generate wealth distribution pie chart
        const chartCanvas = charts.createWealthDistributionChart(stats.wealthDistribution);
        const chartAttachment = new AttachmentBuilder(chartCanvas.toBuffer(), { 
            name: 'wealth-distribution.png' 
        });

        // Calculate inequality metrics
        const giniCoeff = this.calculateGiniCoefficient(stats.wealthDistribution);
        const wealthConcentration = this.calculateWealthConcentration(stats.wealthDistribution);

        const embed = new EmbedBuilder()
            .setTitle('💰 Wealth Distribution Analysis')
            .setDescription('How wealth is distributed across different economic classes')
            .setColor(0xF39C12)
            .setImage('attachment://wealth-distribution.png')
            .addFields(
                {
                    name: '📊 Distribution Breakdown',
                    value: stats.wealthDistribution.map(tier => 
                        `**${tier.label}:** ${tier.count} users (${fmt(tier.value)})`
                    ).join('\n'),
                    inline: false
                },
                {
                    name: '📈 Economic Indicators',
                    value: `**Gini Coefficient:** ${giniCoeff.toFixed(3)} ${this.interpretGini(giniCoeff)}\n` +
                           `**Top 10% owns:** ${wealthConcentration.top10}% of wealth\n` +
                           `**Bottom 50% owns:** ${wealthConcentration.bottom50}% of wealth`,
                    inline: false
                },
                {
                    name: '💡 Interpretation',
                    value: this.interpretWealthDistribution(giniCoeff, wealthConcentration),
                    inline: false
                }
            )
            .setFooter({ text: '💰 Lower Gini = More Equal Distribution • Economic Analysis' })
            .setTimestamp();

        await interaction.editReply({ 
            embeds: [embed], 
            files: [chartAttachment] 
        });
    },

    async showGameAnalytics(interaction, stats, charts) {
        if (!stats.gameBreakdown || stats.gameBreakdown.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('🎮 Game Analytics')
                .setDescription('No gaming data available yet.')
                .setColor(0xE74C3C);
            
            return await interaction.editReply({ embeds: [embed] });
        }

        // Generate bar chart for game wagering
        const gameData = stats.gameBreakdown.map(game => ({
            label: game.game,
            value: game.wagered
        }));

        const chartCanvas = charts.createBarChart(gameData, 'Total Wagered by Game', 'Amount Wagered');
        const chartAttachment = new AttachmentBuilder(chartCanvas.toBuffer(), { 
            name: 'game-analytics.png' 
        });

        // Calculate house edge and profitability
        const totalWagered = stats.gameBreakdown.reduce((sum, game) => sum + game.wagered, 0);
        const totalWon = stats.gameBreakdown.reduce((sum, game) => sum + game.won, 0);
        const houseEdge = totalWagered > 0 ? ((totalWagered - totalWon) / totalWagered * 100) : 0;

        const embed = new EmbedBuilder()
            .setTitle('🎮 Game Analytics & Performance')
            .setDescription('Detailed analysis of gaming activity and player behavior')
            .setColor(0xE74C3C)
            .setImage('attachment://game-analytics.png')
            .addFields(
                {
                    name: '🎯 Game Performance',
                    value: stats.gameBreakdown.slice(0, 5).map(game => 
                        `**${game.game}:** ${fmt(game.wagered)} wagered, ${game.winRate.toFixed(1)}% win rate`
                    ).join('\n'),
                    inline: false
                },
                {
                    name: '💹 Economic Impact',
                    value: `**House Edge:** ${houseEdge.toFixed(2)}%\n` +
                           `**Player Return:** ${(100 - houseEdge).toFixed(2)}%\n` +
                           `**Net House Profit:** ${fmt(totalWagered - totalWon)}`,
                    inline: true
                },
                {
                    name: '🎲 Player Behavior',
                    value: `**Most Popular:** ${stats.gameBreakdown[0]?.game || 'N/A'}\n` +
                           `**Highest Volume:** ${fmt(stats.gameBreakdown[0]?.wagered || 0)}\n` +
                           `**Average Win Rate:** ${stats.winRate.toFixed(1)}%`,
                    inline: true
                }
            )
            .setFooter({ text: '🎮 Games drive economic activity • Gaming Analytics' })
            .setTimestamp();

        await interaction.editReply({ 
            embeds: [embed], 
            files: [chartAttachment] 
        });
    },

    async showEconomicTrends(interaction, days, charts) {
        const trends = await dbManager.databaseAdapter.getEconomicTrends(days);
        
        if (trends.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('📈 Economic Trends')
                .setDescription(`No trend data available for the last ${days} days.`)
                .setColor(0x9B59B6);
            
            return await interaction.editReply({ embeds: [embed] });
        }

        // Generate trend chart
        const trendData = trends.map(trend => ({
            label: new Date(trend.date).toLocaleDateString(),
            value: trend.totalWealth
        }));

        const chartCanvas = charts.createLineChart(
            trendData, 
            `Economic Trends - Last ${days} Days`, 
            'Date', 
            'Total Wealth'
        );
        const chartAttachment = new AttachmentBuilder(chartCanvas.toBuffer(), { 
            name: 'economic-trends.png' 
        });

        // Calculate trend statistics
        const firstWealth = trends[0]?.totalWealth || 0;
        const lastWealth = trends[trends.length - 1]?.totalWealth || 0;
        const growth = firstWealth > 0 ? ((lastWealth - firstWealth) / firstWealth * 100) : 0;
        const avgDailyUsers = trends.reduce((sum, t) => sum + t.activeUsers, 0) / trends.length;

        const embed = new EmbedBuilder()
            .setTitle('📈 Economic Trends Analysis')
            .setDescription(`Economic performance over the last ${days} days`)
            .setColor(0x9B59B6)
            .setImage('attachment://economic-trends.png')
            .addFields(
                {
                    name: '📊 Growth Metrics',
                    value: `**Period Growth:** ${growth >= 0 ? '+' : ''}${growth.toFixed(2)}%\n` +
                           `**Starting Wealth:** ${fmt(firstWealth)}\n` +
                           `**Current Wealth:** ${fmt(lastWealth)}`,
                    inline: true
                },
                {
                    name: '👥 User Activity',
                    value: `**Avg Daily Users:** ${avgDailyUsers.toFixed(0)}\n` +
                           `**Peak Activity:** ${Math.max(...trends.map(t => t.activeUsers))}\n` +
                           `**Low Activity:** ${Math.min(...trends.map(t => t.activeUsers))}`,
                    inline: true
                },
                {
                    name: '💹 Trend Analysis',
                    value: this.analyzeTrend(trends),
                    inline: false
                }
            )
            .setFooter({ text: `📈 ${days} day analysis • Economic Trends` })
            .setTimestamp();

        await interaction.editReply({ 
            embeds: [embed], 
            files: [chartAttachment] 
        });
    },

    async showLeaderboard(interaction, stats) {
        if (stats.topUsers.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('🏆 Economic Leaderboard')
                .setDescription('No users found with economic data yet.')
                .setColor(0xFFD700);
            
            return await interaction.editReply({ embeds: [embed] });
        }

        let leaderboardText = '';
        for (let i = 0; i < Math.min(10, stats.topUsers.length); i++) {
            const user = stats.topUsers[i];
            const rank = i + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `**${rank}.**`;
            
            leaderboardText += `${medal} **${user.username}**\n`;
            leaderboardText += `   💰 ${fmt(user.totalBalance)} (💳 ${fmt(user.wallet)} | 🏛️ ${fmt(user.bank)})\n\n`;
        }

        const embed = new EmbedBuilder()
            .setTitle('🏆 Economic Leaderboard')
            .setDescription('Top 10 users by total wealth (wallet + bank)')
            .setColor(0xFFD700)
            .addFields({
                name: '💰 Top Wealth Holders',
                value: leaderboardText,
                inline: false
            })
            .addFields(
                {
                    name: '📊 Statistics',
                    value: `**Top 1% owns:** ${this.calculateTopPercentage(stats.topUsers, stats.totalWealth, 0.01)}% of wealth\n` +
                           `**Top 10% owns:** ${this.calculateTopPercentage(stats.topUsers, stats.totalWealth, 0.1)}% of wealth\n` +
                           `**Richest User:** ${fmt(stats.topUsers[0]?.totalBalance || 0)}`,
                    inline: true
                },
                {
                    name: '🏛️ Banking Habits',
                    value: `**Avg Bank Ratio:** ${this.calculateBankRatio(stats.topUsers)}%\n` +
                           `**Most Banked:** ${fmt(Math.max(...stats.topUsers.map(u => u.bank)))}\n` +
                           `**Cash Heavy:** ${stats.topUsers.filter(u => u.wallet > u.bank).length} users`,
                    inline: true
                }
            )
            .setFooter({ text: '🏆 Wealth creates opportunities • Economic Leaderboard' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async showUserStats(interaction, guildId) {
        const userId = interaction.user.id;
        const userRank = await dbManager.databaseAdapter.getUserEconomicRank(userId);
        const userBalance = await dbManager.getUserBalance(userId, guildId);

        if (!userRank) {
            const embed = new EmbedBuilder()
                .setTitle('👤 Your Economic Status')
                .setDescription('You need to have some money to appear in economic rankings!')
                .setColor(0xE74C3C);
            
            return await interaction.editReply({ embeds: [embed] });
        }

        const totalBalance = userBalance.wallet + userBalance.bank;
        const bankRatio = totalBalance > 0 ? (userBalance.bank / totalBalance * 100) : 0;

        const embed = new EmbedBuilder()
            .setTitle('👤 Your Economic Status')
            .setDescription(`Economic analysis for ${interaction.user.displayName}`)
            .setColor(0x2ECC71)
            .setThumbnail(interaction.user.displayAvatarURL())
            .addFields(
                {
                    name: '💰 Wealth Position',
                    value: `**Rank:** #${userRank.rank}\n` +
                           `**Percentile:** Top ${userRank.percentile.toFixed(1)}%\n` +
                           `**Total Balance:** ${fmt(totalBalance)}`,
                    inline: true
                },
                {
                    name: '🏦 Portfolio Breakdown',
                    value: `**Wallet:** ${fmt(userBalance.wallet)} (${(100 - bankRatio).toFixed(1)}%)\n` +
                           `**Bank:** ${fmt(userBalance.bank)} (${bankRatio.toFixed(1)}%)\n` +
                           `**Strategy:** ${this.classifyStrategy(bankRatio)}`,
                    inline: true
                },
                {
                    name: '📊 Economic Class',
                    value: this.classifyWealth(totalBalance),
                    inline: false
                }
            )
            .setFooter({ text: '👤 Your position in the server economy • Personal Analytics' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    // Helper functions for calculations and analysis
    getEconomicInsights(stats) {
        const insights = [];
        
        if (stats.winRate < 40) insights.push('🔴 Low win rates may discourage gambling');
        else if (stats.winRate > 60) insights.push('🟡 High win rates may hurt house profits');
        else insights.push('🟢 Balanced win rates maintain engagement');
        
        if (stats.activeUsers < 50) insights.push('📉 Low user participation');
        else if (stats.activeUsers > 200) insights.push('📈 High economic activity');
        else insights.push('📊 Moderate participation levels');
        
        return insights.join('\n');
    },

    calculateGiniCoefficient(distribution) {
        const values = distribution.map(d => d.value).sort((a, b) => a - b);
        const n = values.length;
        const sum = values.reduce((a, b) => a + b, 0);
        
        if (sum === 0) return 0;
        
        let numerator = 0;
        for (let i = 0; i < n; i++) {
            numerator += (2 * (i + 1) - n - 1) * values[i];
        }
        
        return numerator / (n * sum);
    },

    calculateWealthConcentration(distribution) {
        const total = distribution.reduce((sum, d) => sum + d.value, 0);
        const sortedByWealth = distribution.sort((a, b) => b.value - a.value);
        
        let top10 = 0;
        let bottom50 = 0;
        let userCount = 0;
        
        for (const tier of sortedByWealth) {
            userCount += tier.count;
            if (userCount <= distribution.reduce((sum, d) => sum + d.count, 0) * 0.1) {
                top10 += tier.value;
            }
            if (userCount >= distribution.reduce((sum, d) => sum + d.count, 0) * 0.5) {
                bottom50 += tier.value;
            }
        }
        
        return {
            top10: total > 0 ? (top10 / total * 100).toFixed(1) : 0,
            bottom50: total > 0 ? (bottom50 / total * 100).toFixed(1) : 0
        };
    },

    interpretGini(gini) {
        if (gini < 0.3) return '(Very Equal)';
        if (gini < 0.5) return '(Moderate Inequality)';
        if (gini < 0.7) return '(High Inequality)';
        return '(Extreme Inequality)';
    },

    interpretWealthDistribution(gini, concentration) {
        if (gini < 0.3) {
            return '🟢 Wealth is fairly distributed across users, promoting economic stability.';
        } else if (gini < 0.5) {
            return '🟡 Moderate wealth inequality exists but remains manageable.';
        } else {
            return '🔴 High wealth concentration may limit economic participation for newer users.';
        }
    },

    analyzeTrend(trends) {
        if (trends.length < 3) return 'Insufficient data for trend analysis';
        
        const recent = trends.slice(-3);
        const older = trends.slice(0, 3);
        
        const recentAvg = recent.reduce((sum, t) => sum + t.totalWealth, 0) / recent.length;
        const olderAvg = older.reduce((sum, t) => sum + t.totalWealth, 0) / older.length;
        
        const change = ((recentAvg - olderAvg) / olderAvg) * 100;
        
        if (change > 5) return '📈 Strong upward economic trend';
        if (change > 1) return '📊 Positive economic growth';
        if (change > -1) return '📊 Stable economic conditions';
        if (change > -5) return '📉 Economic decline detected';
        return '🔴 Significant economic contraction';
    },

    calculateTopPercentage(topUsers, totalWealth, percentage) {
        const topCount = Math.ceil(topUsers.length * percentage);
        const topWealth = topUsers.slice(0, topCount).reduce((sum, u) => sum + u.totalBalance, 0);
        return totalWealth > 0 ? (topWealth / totalWealth * 100).toFixed(1) : 0;
    },

    calculateBankRatio(users) {
        const ratios = users.map(u => u.totalBalance > 0 ? (u.bank / u.totalBalance * 100) : 0);
        return ratios.length > 0 ? (ratios.reduce((sum, r) => sum + r, 0) / ratios.length).toFixed(1) : 0;
    },

    classifyWealth(balance) {
        if (balance >= 100000000) return '👑 **Ultra Rich** - Economic elite with massive influence';
        if (balance >= 50000000) return '💎 **Very Rich** - Major economic player';
        if (balance >= 10000000) return '🏆 **Rich** - Significant wealth accumulation';
        if (balance >= 1000000) return '💰 **Wealthy** - Comfortable financial position';
        if (balance >= 100000) return '📈 **Upper Class** - Above average wealth';
        if (balance >= 10000) return '🏠 **Middle Class** - Stable economic standing';
        if (balance >= 1000) return '⚒️ **Working Class** - Building wealth steadily';
        return '🌱 **Starting Out** - Beginning economic journey';
    },

    classifyStrategy(bankRatio) {
        if (bankRatio >= 80) return 'Conservative Saver';
        if (bankRatio >= 60) return 'Balanced Investor';
        if (bankRatio >= 40) return 'Active Trader';
        if (bankRatio >= 20) return 'Risk Taker';
        return 'High Risk Player';
    }
};