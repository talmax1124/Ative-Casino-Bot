/**
 * Rob Stats command - display comprehensive robbery statistics
 * Shows personal stats, global stats, and recent activity
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fmt, getGuildId } = require('../UTILS/common');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const robStatsManager = require('../UTILS/robStatsManager');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('robstats')
        .setDescription('📊 View comprehensive robbery statistics')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to view stats for (defaults to yourself)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of stats to display')
                .addChoices(
                    { name: 'Personal Stats', value: 'personal' },
                    { name: 'Global Stats', value: 'global' },
                    { name: 'Leaderboards', value: 'leaderboard' }
                )
                .setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const statsType = interaction.options.getString('type') || 'personal';
        const guildId = await getGuildId(interaction);

        try {
            await interaction.deferReply();

            switch (statsType) {
                case 'personal':
                    await this.showPersonalStats(interaction, targetUser, guildId);
                    break;
                case 'global':
                    await this.showGlobalStats(interaction, guildId);
                    break;
                case 'leaderboard':
                    await this.showLeaderboards(interaction, guildId);
                    break;
                default:
                    await this.showPersonalStats(interaction, targetUser, guildId);
            }

        } catch (error) {
            logger.error(`Error in robstats command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Stats Error',
                topFields: [
                    { name: '🔧 System Error', value: 'Failed to retrieve robbery statistics.' }
                ],
                stageText: 'ERROR',
                color: 0xFF0000,
                footer: 'Please try again later'
            });

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    /**
     * Show personal robbery statistics
     */
    async showPersonalStats(interaction, targetUser, guildId) {
        const userId = targetUser.id;
        const username = targetUser.displayName;
        
        const stats = await robStatsManager.getUserRobStats(userId, guildId);
        
        // Calculate additional metrics
        const totalProfit = stats.netProfitFromRobbery;
        const robberSuccessRate = stats.asRobber.totalAttempts > 0 ? 
            (stats.asRobber.successfulRobberies / stats.asRobber.totalAttempts * 100) : 0;
        const victimRate = stats.asVictim.timesRobbed > 0 ?
            (stats.asVictim.timesSuccessfullyRobbed / stats.asVictim.timesRobbed * 100) : 0;

        const topFields = [
            {
                name: '🎭 ROBBERY OVERVIEW',
                value: `**As Robber:** ${stats.asRobber.totalAttempts} attempts, ${stats.asRobber.successfulRobberies} successful (${robberSuccessRate.toFixed(1)}%)\n**As Victim:** Robbed ${stats.asVictim.timesRobbed} times, lost ${stats.asVictim.timesSuccessfullyRobbed} times (${victimRate.toFixed(1)}%)\n**Net Profit:** ${totalProfit >= 0 ? '+' : ''}${fmt(totalProfit)}`,
                inline: false
            }
        ];

        if (stats.asRobber.totalAttempts > 0) {
            topFields.push({
                name: '💰 ROBBER STATISTICS',
                value: `**Total Stolen:** ${fmt(stats.asRobber.totalStolen)}\n**Penalties Paid:** ${fmt(stats.asRobber.totalPenalties)}\n**Biggest Heist:** ${fmt(stats.asRobber.biggestHeist)}\n**Unique Victims:** ${stats.asRobber.uniqueVictims}`,
                inline: true
            });
        }

        if (stats.asVictim.timesRobbed > 0) {
            topFields.push({
                name: '🛡️ VICTIM STATISTICS',
                value: `**Total Lost:** ${fmt(stats.asVictim.totalLostToRobberies)}\n**Biggest Loss:** ${fmt(stats.asVictim.biggestLoss)}\n**Unique Robbers:** ${stats.asVictim.uniqueRobbers}\n**Defense Rate:** ${(100 - victimRate).toFixed(1)}%`,
                inline: true
            });
        }

        const bankFields = [
            { name: '📈 Success Rate', value: `${robberSuccessRate.toFixed(1)}%`, inline: true },
            { name: '🎯 Recent Activity', value: `${stats.recentActivity.last24HourAttempts} attempts (24h)`, inline: true },
            { name: '💎 Net Profit', value: totalProfit >= 0 ? `+${fmt(totalProfit)}` : fmt(totalProfit), inline: true }
        ];

        const embed = buildSessionEmbed({
            title: `🎭 ${username}'s Robbery Statistics`,
            topFields,
            bankFields,
            stageText: 'ROBBERY STATS',
            color: totalProfit >= 0 ? 0x00FF00 : 0xFF6B6B,
            footer: '🎭 Rob Stats • Use /robstats type:global for server stats'
        });

        await interaction.editReply({ embeds: [embed] });
    },

    /**
     * Show global robbery statistics
     */
    async showGlobalStats(interaction, guildId) {
        const globalStats = await robStatsManager.getGlobalRobStats(guildId);
        
        const successRate = globalStats.totalRobberies > 0 ?
            (globalStats.successfulRobberies / globalStats.totalRobberies * 100) : 0;
        
        const netEconomicImpact = globalStats.totalStolenAmount - globalStats.totalPenalties;

        const topFields = [
            {
                name: '🌍 GLOBAL ROBBERY STATISTICS',
                value: `**Total Robberies:** ${globalStats.totalRobberies.toLocaleString()}\n**Successful:** ${globalStats.successfulRobberies.toLocaleString()} (${successRate.toFixed(1)}%)\n**Total Stolen:** ${fmt(globalStats.totalStolenAmount)}\n**Total Penalties:** ${fmt(globalStats.totalPenalties)}`,
                inline: false
            },
            {
                name: '💰 ECONOMIC IMPACT',
                value: `**Money Circulated:** ${fmt(globalStats.totalStolenAmount + globalStats.totalPenalties)}\n**Net Impact:** ${netEconomicImpact >= 0 ? '+' : ''}${fmt(netEconomicImpact)}\n**Biggest Robbery:** ${fmt(globalStats.biggestRobbery)}`,
                inline: true
            },
            {
                name: '👥 PARTICIPATION',
                value: `**Active Robbers:** ${globalStats.uniqueRobbers}\n**Victims:** ${globalStats.uniqueVictims}\n**Avg Per Robber:** ${fmt(globalStats.totalStolenAmount / Math.max(1, globalStats.uniqueRobbers))}`,
                inline: true
            }
        ];

        // Add tier analysis if available
        if (globalStats.tierAnalysis && globalStats.tierAnalysis.length > 0) {
            const topTierCombos = globalStats.tierAnalysis.slice(0, 3);
            const tierText = topTierCombos.map(tier => 
                `${tier.robber_tier} → ${tier.victim_tier}: ${(tier.success_rate * 100).toFixed(1)}% (${tier.attempts} attempts)`
            ).join('\n');
            
            topFields.push({
                name: '🎖️ TIER ANALYSIS (Top Success Rates)',
                value: tierText || 'No significant tier patterns',
                inline: false
            });
        }

        const bankFields = [
            { name: '📊 Success Rate', value: `${successRate.toFixed(1)}%`, inline: true },
            { name: '💸 Avg Robbery', value: fmt(globalStats.totalStolenAmount / Math.max(1, globalStats.successfulRobberies)), inline: true },
            { name: '⚖️ Risk vs Reward', value: `${(globalStats.totalPenalties / Math.max(1, globalStats.totalStolenAmount) * 100).toFixed(1)}% penalty rate`, inline: true }
        ];

        const embed = buildSessionEmbed({
            title: '🌍 Global Robbery Statistics',
            topFields,
            bankFields,
            stageText: 'GLOBAL STATS',
            color: 0x8B0000,
            footer: '🎭 Global Rob Stats • ATIVE Casino Crime Analytics'
        });

        await interaction.editReply({ embeds: [embed] });
    },

    /**
     * Show robbery leaderboards
     */
    async showLeaderboards(interaction, guildId) {
        try {
            // This would require additional database queries to get top performers
            // For now, show a placeholder that indicates the feature is available
            
            const embed = buildSessionEmbed({
                title: '🏆 Robbery Leaderboards',
                topFields: [
                    {
                        name: '🚧 FEATURE COMING SOON',
                        value: 'Robbery leaderboards are being developed!\n\nWill include:\n• Top Robbers by Success Rate\n• Biggest Heists\n• Most Successful Victims (Defense)\n• Most Active Robbers\n• Tier-based Rankings',
                        inline: false
                    },
                    {
                        name: '📊 Available Now',
                        value: 'Use `/robstats` for personal stats\nUse `/robstats type:global` for server stats',
                        inline: false
                    }
                ],
                stageText: 'COMING SOON',
                color: 0xFFAA00,
                footer: '🏆 Leaderboards • Check back for updates'
            });

            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            logger.error(`Error showing leaderboards: ${error.message}`);
            throw error;
        }
    }
};