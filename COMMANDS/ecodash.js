const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economicStabilizer = require('../UTILS/economicStabilizer');
const economicAnalyzer = require('../UTILS/economicAnalyzer');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ecodash')
        .setDescription('📊 Advanced Economic Dashboard - Real-time casino economy monitoring')
        .addStringOption(option =>
            option.setName('view')
                .setDescription('Dashboard view type')
                .addChoices(
                    { name: '📈 Overview', value: 'overview' },
                    { name: '🎮 Game Analysis', value: 'games' },
                    { name: '👥 Player Behavior', value: 'players' },
                    { name: '🚨 Risk Assessment', value: 'risks' },
                    { name: '💡 AI Recommendations', value: 'recommendations' },
                    { name: '📄 Full Report', value: 'report' }
                )
                .setRequired(false)),
    
    async execute(interaction) {
        const DEVELOPER_ID = '466050111680544798';
        
        if (interaction.user.id !== DEVELOPER_ID) {
            return await interaction.reply({
                content: '🔒 This command is restricted to developers only.',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            const view = interaction.options.getString('view') || 'overview';

            switch (view) {
                case 'overview':
                    await this.showOverview(interaction);
                    break;
                case 'games':
                    await this.showGameAnalysis(interaction);
                    break;
                case 'players':
                    await this.showPlayerBehavior(interaction);
                    break;
                case 'risks':
                    await this.showRiskAssessment(interaction);
                    break;
                case 'recommendations':
                    await this.showRecommendations(interaction);
                    break;
                case 'report':
                    await this.showFullReport(interaction);
                    break;
            }

        } catch (error) {
            logger.error(`Economic dashboard error: ${error.message}`);
            await interaction.editReply({
                content: '❌ **Dashboard Error**\nFailed to generate economic dashboard.',
                ephemeral: true
            });
        }
    },

    async showOverview(interaction) {
        const status = economicStabilizer.getEconomicStatus();
        const insights = await economicAnalyzer.getRealTimeInsights();

        const healthColor = status.healthScore >= 80 ? '#00FF00' : 
                           status.healthScore >= 60 ? '#FFFF00' : 
                           status.healthScore >= 40 ? '#FF8800' : '#FF0000';

        const embed = new EmbedBuilder()
            .setTitle('📊 **ATIVE CASINO - ECONOMIC DASHBOARD**')
            .setDescription('*Real-time economic monitoring and AI-powered insights*\n`⚠️ Data excludes DEV/Admin/Off-Economy players for accuracy`')
            .setColor(healthColor)
            .setTimestamp()
            .addFields([
                {
                    name: '🏥 **System Health**',
                    value: `**Health Score:** ${status.healthScore}/100\n**Status:** ${status.emergencyMode ? '🚨 EMERGENCY MODE' : '✅ Normal'}\n**Risk Level:** ${insights.riskLevel}`,
                    inline: true
                },
                {
                    name: '🏦 **House Performance**',
                    value: `**House Edge:** ${(status.houseEdge * 100).toFixed(2)}%\n**Total Wealth:** $${status.totalWealth.toLocaleString()}\n**Gini Coefficient:** ${status.wealthInequality.toFixed(3)}`,
                    inline: true
                },
                {
                    name: '🔍 **AI Analysis**',
                    value: `**Critical Issues:** ${insights.criticalIssues}\n**Games Flagged:** ${insights.gamesNeedingAttention.length}\n**Last Analysis:** ${status.lastAnalysis ? `<t:${Math.floor(status.lastAnalysis/1000)}:R>` : 'Pending'}`,
                    inline: true
                },
                {
                    name: '🎯 **Active Measures**',
                    value: insights.topRecommendations.length > 0 ? 
                        insights.topRecommendations.slice(0, 3).map((rec, i) => `${i+1}. ${rec.recommendation}`).join('\n') :
                        'No active recommendations',
                    inline: false
                }
            ])
            .setFooter({ text: 'Economic Stabilizer v2.0 with AI Integration' });

        if (status.emergencyMode) {
            embed.addFields([{
                name: '🚨 **EMERGENCY STATUS**',
                value: '**MULTIPLIERS SEVERELY REDUCED**\n**HOUSE EDGE INCREASED**\n**HIGH-RISK MEASURES ACTIVE**',
                inline: false
            }]);
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async showGameAnalysis(interaction) {
        try {
            const analysis = await economicAnalyzer.performComprehensiveAnalysis();
            const gameStats = analysis.gameAnalysis;

            const embed = new EmbedBuilder()
                .setTitle('🎮 **GAME PERFORMANCE ANALYSIS**')
                .setDescription('*7-day game performance metrics*')
                .setColor('#4169E1')
                .setTimestamp();

            let gameFields = [];
            for (const [game, stats] of Object.entries(gameStats)) {
                const issues = stats.issues ? ` ⚠️ ${stats.issues.join(', ')}` : '';
                const riskEmoji = stats.riskLevel === 'HIGH' ? '🔴' : stats.riskLevel === 'MEDIUM' ? '🟡' : '🟢';
                
                gameFields.push({
                    name: `${riskEmoji} **${game.toUpperCase()}**`,
                    value: `**Win Rate:** ${stats.winRate}%\n**House Edge:** ${stats.houseEdge}%\n**Total Wagered:** $${stats.totalWagered.toLocaleString()}\n**Profit:** $${stats.profitability.toLocaleString()}${issues}`,
                    inline: true
                });
            }

            // Split into multiple embeds if too many games
            if (gameFields.length > 25) {
                gameFields = gameFields.slice(0, 25);
                embed.setFooter({ text: 'Showing top 25 games by volume' });
            }

            embed.addFields(gameFields);
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error(`Game analysis display error: ${error.message}`);
            await interaction.editReply({ content: '❌ Failed to generate game analysis.' });
        }
    },

    async showPlayerBehavior(interaction) {
        try {
            const analysis = await economicAnalyzer.performComprehensiveAnalysis();
            const playerBehavior = analysis.playerBehavior;

            const embed = new EmbedBuilder()
                .setTitle('👥 **PLAYER BEHAVIOR ANALYSIS**')
                .setDescription('*Wealth distribution and suspicious activity*')
                .setColor('#8A2BE2')
                .setTimestamp()
                .addFields([
                    {
                        name: '📊 **Population Stats** (Excl. DEV/Admin/Off-Eco)',
                        value: `**Total Players:** ${playerBehavior.totalPlayers.toLocaleString()}\n**Active Players:** ${playerBehavior.activePlayers.toLocaleString()}\n**Average Wealth:** $${playerBehavior.averageWealth?.toLocaleString() || '0'}`,
                        inline: true
                    },
                    {
                        name: '💰 **Wealth Distribution**',
                        value: `**Under $10K:** ${playerBehavior.wealthDistribution?.under_10k || 0}\n**$10K-$100K:** ${playerBehavior.wealthDistribution?.['10k_100k'] || 0}\n**$100K-$1M:** ${playerBehavior.wealthDistribution?.['100k_1m'] || 0}\n**$1M-$10M:** ${playerBehavior.wealthDistribution?.['1m_10m'] || 0}\n**$10M-$100M:** ${playerBehavior.wealthDistribution?.['10m_100m'] || 0}\n**Over $100M:** ${playerBehavior.wealthDistribution?.over_100m || 0}`,
                        inline: true
                    },
                    {
                        name: '🚩 **Suspicious Activity**',
                        value: `**Flagged Players:** ${playerBehavior.suspiciousPlayers?.length || 0}\n**Wealth Concentration:** ${((playerBehavior.wealthConcentration || 0) * 100).toFixed(1)}%`,
                        inline: true
                    }
                ]);

            if (playerBehavior.suspiciousPlayers && playerBehavior.suspiciousPlayers.length > 0) {
                const topSuspicious = playerBehavior.suspiciousPlayers.slice(0, 5);
                embed.addFields([{
                    name: '⚠️ **Top Suspicious Players**',
                    value: topSuspicious.map((player, i) => 
                        `${i+1}. User ${player.userId.slice(-4)} - $${player.wealth.toLocaleString()} (${player.flags.join(', ')})`
                    ).join('\n'),
                    inline: false
                }]);
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error(`Player behavior analysis error: ${error.message}`);
            await interaction.editReply({ content: '❌ Failed to generate player behavior analysis.' });
        }
    },

    async showRiskAssessment(interaction) {
        try {
            const analysis = await economicAnalyzer.performComprehensiveAnalysis();
            const risks = analysis.riskAssessment;

            const riskColor = risks.level === 'CRITICAL' ? '#FF0000' : 
                             risks.level === 'HIGH' ? '#FF8800' :
                             risks.level === 'MEDIUM' ? '#FFFF00' : '#00FF00';

            const embed = new EmbedBuilder()
                .setTitle('🚨 **RISK ASSESSMENT**')
                .setDescription('*Systemic risk analysis and threat detection*')
                .setColor(riskColor)
                .setTimestamp()
                .addFields([
                    {
                        name: '📊 **Risk Overview**',
                        value: `**Risk Level:** ${risks.level}\n**Risk Score:** ${risks.score}/100\n**Active Factors:** ${risks.factors.length}`,
                        inline: true
                    },
                    {
                        name: '⚠️ **Risk Factors**',
                        value: risks.factors.length > 0 ? risks.factors.join('\n') : 'No risk factors detected',
                        inline: true
                    }
                ]);

            // Add trend analysis
            const trends = analysis.economicTrends;
            embed.addFields([{
                name: '📈 **Economic Trends**',
                value: `**Wealth Growth:** ${trends.wealthGrowth?.toFixed(2) || 0}%\n**Economic Velocity:** ${trends.economicVelocity?.toFixed(2) || 0}%\n**Trend Flags:** ${trends.trends?.join(', ') || 'None'}`,
                inline: false
            }]);

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error(`Risk assessment error: ${error.message}`);
            await interaction.editReply({ content: '❌ Failed to generate risk assessment.' });
        }
    },

    async showRecommendations(interaction) {
        try {
            const analysis = await economicAnalyzer.performComprehensiveAnalysis();
            const recommendations = analysis.recommendations;

            const embed = new EmbedBuilder()
                .setTitle('💡 **AI RECOMMENDATIONS**')
                .setDescription('*Smart recommendations for economic stability*')
                .setColor('#00CED1')
                .setTimestamp();

            if (recommendations.length === 0) {
                embed.addFields([{
                    name: '✅ **All Clear**',
                    value: 'No recommendations at this time. Economy is stable.',
                    inline: false
                }]);
            } else {
                const critical = recommendations.filter(r => r.priority === 'CRITICAL');
                const high = recommendations.filter(r => r.priority === 'HIGH');
                const medium = recommendations.filter(r => r.priority === 'MEDIUM');

                if (critical.length > 0) {
                    embed.addFields([{
                        name: '🆘 **CRITICAL ACTIONS REQUIRED**',
                        value: critical.map((rec, i) => `${i+1}. ${rec.recommendation}`).join('\n'),
                        inline: false
                    }]);
                }

                if (high.length > 0) {
                    embed.addFields([{
                        name: '⚠️ **HIGH PRIORITY**',
                        value: high.slice(0, 5).map((rec, i) => `${i+1}. ${rec.recommendation}`).join('\n'),
                        inline: false
                    }]);
                }

                if (medium.length > 0) {
                    embed.addFields([{
                        name: '📋 **MEDIUM PRIORITY**',
                        value: medium.slice(0, 3).map((rec, i) => `${i+1}. ${rec.recommendation}`).join('\n'),
                        inline: false
                    }]);
                }
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error(`Recommendations display error: ${error.message}`);
            await interaction.editReply({ content: '❌ Failed to generate recommendations.' });
        }
    },

    async showFullReport(interaction) {
        try {
            const report = await economicAnalyzer.generateDetailedReport();
            
            // Split report into chunks if too long
            const chunks = [];
            let currentChunk = '';
            const lines = report.split('\n');
            
            for (const line of lines) {
                if ((currentChunk + line + '\n').length > 1900) {
                    chunks.push(currentChunk);
                    currentChunk = line + '\n';
                } else {
                    currentChunk += line + '\n';
                }
            }
            if (currentChunk) chunks.push(currentChunk);

            // Send first chunk as embed
            const embed = new EmbedBuilder()
                .setTitle('📄 **COMPREHENSIVE ECONOMIC REPORT**')
                .setDescription('```\n' + chunks[0] + '```')
                .setColor('#4B0082')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Send additional chunks as follow-up messages if needed
            for (let i = 1; i < Math.min(chunks.length, 3); i++) {
                setTimeout(async () => {
                    await interaction.followUp({
                        content: '```\n' + chunks[i] + '```',
                        ephemeral: true
                    });
                }, i * 1000);
            }

        } catch (error) {
            logger.error(`Full report error: ${error.message}`);
            await interaction.editReply({ content: '❌ Failed to generate full report.' });
        }
    }
};