/**
 * UNIFIED AI COMMAND - Single Command for Everything
 * Combines all AI functionality into one comprehensive command
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const realAI = require('../UTILS/realAIEngine');
const { gameDataCollector } = require('../UTILS/gameDataCollector');
const mlPhaseManager = require('../UTILS/mlPhaseManager');
const { fmt } = require('../UTILS/common');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ai')
        .setDescription('🤖 COMPLETE AI CASINO MANAGEMENT - Everything in one command')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Choose what you want to do')
                .setRequired(false)
                .addChoices(
                    { name: '📊 Complete Overview - Full casino analysis', value: 'overview' },
                    { name: '⚡ Quick Status - Fast health check', value: 'quick' },
                    { name: '🤖 Autonomous Control - Start/stop/status', value: 'autonomous' },
                    { name: '🧠 Force Analysis - Manual AI analysis', value: 'analyze' },
                    { name: '📈 Dashboard - Detailed metrics', value: 'dashboard' },
                    { name: '🎯 Recommendations - Latest AI suggestions', value: 'recommendations' }
                )
        )
        .addStringOption(option =>
            option.setName('autonomous_action')
                .setDescription('Control autonomous AI system')
                .setRequired(false)
                .addChoices(
                    { name: 'Start Autonomous AI', value: 'start' },
                    { name: 'Stop Autonomous AI', value: 'stop' },
                    { name: 'Check Status', value: 'status' }
                )
        ),

    async execute(interaction) {
        const action = interaction.options.getString('action') || 'overview';
        const autonomousAction = interaction.options.getString('autonomous_action');

        try {
            await interaction.deferReply({ ephemeral: true });

            switch (action) {
                case 'overview':
                    await this.showCompleteOverview(interaction);
                    break;
                case 'quick':
                    await this.showQuickStatus(interaction);
                    break;
                case 'autonomous':
                    await this.handleAutonomousControl(interaction, autonomousAction || 'status');
                    break;
                case 'analyze':
                    await this.forceAnalysis(interaction);
                    break;
                case 'dashboard':
                    await this.showDashboard(interaction);
                    break;
                case 'recommendations':
                    await this.showRecommendations(interaction);
                    break;
                default:
                    await this.showCompleteOverview(interaction);
            }

        } catch (error) {
            logger.error(`Error in unified AI command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ AI System Error')
                .setDescription(`Failed to execute AI command: ${error.message}`)
                .setColor(0xFF0000);

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    /**
     * Complete casino overview with AI analysis
     */
    async showCompleteOverview(interaction) {
        try {
            // Get all data
            const aiStatus = realAI.getAIStatus();
            const stats = await gameDataCollector.getAggregatedStats().catch(() => null);
            const mlPhase = mlPhaseManager.currentPhase || 2;
            const hasApiKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here';

            // Build comprehensive overview
            const overviewEmbed = new EmbedBuilder()
                .setTitle('🤖 COMPLETE AI CASINO OVERVIEW')
                .setColor(0x00D4FF)
                .addFields(
                    {
                        name: '🧠 AI ENGINE STATUS',
                        value: `**Real AI**: ${hasApiKey ? '✅ OpenAI GPT-4o Active' : '❌ No API Key'}\n` +
                               `**Model**: GPT-4o (ML) / GPT-4o-mini (Chat)\n` +
                               `**Last Analysis**: ${aiStatus.lastAnalysis ? `<t:${Math.floor(aiStatus.lastAnalysis / 1000)}:R>` : 'Never'}\n` +
                               `**Recommendations**: ${aiStatus.recommendations?.length || 0} active`,
                        inline: false
                    },
                    {
                        name: '🎰 CASINO PERFORMANCE',
                        value: stats ? 
                            `**Games Tracked**: ${stats.totalGames || 0}\n` +
                            `**Total Volume**: ${fmt(stats.totalVolume || 0)}\n` +
                            `**House Profit**: ${fmt(stats.houseProfit || 0)}\n` +
                            `**House Edge**: ${(stats.houseEdge || 0).toFixed(1)}%` :
                            '📊 No data available - games need to be played',
                        inline: true
                    },
                    {
                        name: '🚀 ML PHASE STATUS',
                        value: `**Current Phase**: ${mlPhase}\n` +
                               `**Status**: ${mlPhase === 2 ? 'Learning & Optimization' : 'Unknown'}\n` +
                               `**Data Collection**: ${stats?.totalGames || 0}/10,000 games\n` +
                               `**Progress**: ${((stats?.totalGames || 0) / 10000 * 100).toFixed(1)}%`,
                        inline: true
                    },
                    {
                        name: '🤖 AUTONOMOUS AI',
                        value: this.getAutonomousStatus(),
                        inline: false
                    }
                )
                .setFooter({ text: '🎯 ATIVE AI Casino Management • Real-time optimization' })
                .setTimestamp();

            // Add buttons for different actions
            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('ai_force_analysis')
                        .setLabel('🧠 Force Analysis')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('ai_dashboard')
                        .setLabel('📈 Dashboard')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('ai_recommendations')
                        .setLabel('🎯 Recommendations')
                        .setStyle(ButtonStyle.Success)
                );

            await interaction.editReply({ 
                embeds: [overviewEmbed],
                components: [actionButtons]
            });

        } catch (error) {
            logger.error(`Error in complete overview: ${error.message}`);
            throw error;
        }
    },

    /**
     * Quick status check
     */
    async showQuickStatus(interaction) {
        try {
            const stats = await gameDataCollector.getAggregatedStats().catch(() => null);
            const hasApiKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here';

            const quickEmbed = new EmbedBuilder()
                .setTitle('⚡ AI QUICK STATUS')
                .setColor(0x00FF00)
                .addFields(
                    {
                        name: '🎯 Casino Health',
                        value: stats ? 
                            `**Games**: ${stats.totalGames || 0} ✅\n` +
                            `**Profit**: ${fmt(stats.houseProfit || 0)} ✅\n` +
                            `**Edge**: ${(stats.houseEdge || 0).toFixed(1)}% ${(stats.houseEdge || 0) >= 8 ? '✅' : '⚠️'}` :
                            '❌ No data - games need to be played',
                        inline: true
                    },
                    {
                        name: '🤖 AI Status', 
                        value: `**Real AI**: ${hasApiKey ? '✅ Active' : '❌ Offline'}\n` +
                               `**Autonomous**: ${this.getAutonomousStatus()}\n` +
                               `**Model**: GPT-4o`,
                        inline: true
                    }
                )
                .setFooter({ text: '⚡ Quick Status • Use /ai overview for details' });

            await interaction.editReply({ embeds: [quickEmbed] });

        } catch (error) {
            logger.error(`Error in quick status: ${error.message}`);
            throw error;
        }
    },

    /**
     * Handle autonomous AI control
     */
    async handleAutonomousControl(interaction, action) {
        try {
            const autonomousAI = require('../UTILS/autonomousAI');
            let resultMessage = '';
            let color = 0x00D4FF;

            switch (action) {
                case 'start':
                    if (autonomousAI.isRunning) {
                        resultMessage = '🤖 Autonomous AI is already running!';
                        color = 0xFFAA00;
                    } else {
                        autonomousAI.start(interaction.client);
                        resultMessage = '🚀 Autonomous AI started successfully!\n\n' +
                                      '• Monitoring every 5 minutes\n' +
                                      '• AI analysis every 30 minutes\n' +
                                      '• Reports sent to logs channel';
                        color = 0x00FF00;
                    }
                    break;

                case 'stop':
                    if (!autonomousAI.isRunning) {
                        resultMessage = '🤖 Autonomous AI is already stopped!';
                        color = 0xFFAA00;
                    } else {
                        autonomousAI.stop();
                        resultMessage = '⏹️ Autonomous AI stopped successfully!';
                        color = 0xFF4444;
                    }
                    break;

                case 'status':
                default:
                    const isRunning = autonomousAI.isRunning;
                    resultMessage = `🤖 **Autonomous AI Status**: ${isRunning ? '✅ RUNNING' : '❌ STOPPED'}\n\n`;
                    
                    if (isRunning) {
                        resultMessage += '**Active Features:**\n' +
                                       '• 5-minute monitoring\n' +
                                       '• 30-minute AI analysis\n' +
                                       '• Auto-recommendations\n' +
                                       '• Discord log reports\n\n' +
                                       '**Next Analysis**: <t:' + Math.floor((Date.now() + (30 * 60 * 1000)) / 1000) + ':R>';
                    } else {
                        resultMessage += '**To start**: Use `/ai autonomous start`';
                    }
                    
                    color = isRunning ? 0x00FF00 : 0xFF4444;
                    break;
            }

            const autonomousEmbed = new EmbedBuilder()
                .setTitle('🤖 AUTONOMOUS AI CONTROL')
                .setDescription(resultMessage)
                .setColor(color)
                .setFooter({ text: '🚀 Autonomous AI Management • Real-time optimization' });

            await interaction.editReply({ embeds: [autonomousEmbed] });

        } catch (error) {
            logger.error(`Error in autonomous control: ${error.message}`);
            throw error;
        }
    },

    /**
     * Force manual AI analysis
     */
    async forceAnalysis(interaction) {
        try {
            await interaction.editReply({ 
                content: '🧠 **Running Real AI Analysis...**\n\nConsulting OpenAI GPT-4o for casino optimization...' 
            });

            const stats = await gameDataCollector.getAggregatedStats().catch(() => null);
            const hasApiKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here';
            
            if (!hasApiKey) {
                throw new Error('OpenAI API key not configured');
            }

            if (!stats) {
                throw new Error('No casino data available for analysis');
            }

            // Run real AI analysis
            const aiResult = await realAI.analyzeAndRecommend(stats);
            
            const analysisEmbed = new EmbedBuilder()
                .setTitle('🧠 AI ANALYSIS COMPLETE')
                .setColor(0x00FF00)
                .addFields(
                    {
                        name: '📊 Data Analyzed',
                        value: `**Games**: ${stats.totalGames || 0}\n` +
                               `**Volume**: ${fmt(stats.totalVolume || 0)}\n` +
                               `**House Edge**: ${(stats.houseEdge || 0).toFixed(1)}%`,
                        inline: true
                    },
                    {
                        name: '🎯 AI Recommendations',
                        value: aiResult.recommendations?.length > 0 ? 
                            aiResult.recommendations.slice(0, 3).map(r => `• ${r.action}: ${r.reason}`).join('\n') :
                            'No specific recommendations at this time',
                        inline: false
                    }
                )
                .setFooter({ text: '🤖 Analysis by OpenAI GPT-4o • Real AI Intelligence' })
                .setTimestamp();

            await interaction.editReply({ 
                content: null,
                embeds: [analysisEmbed] 
            });

        } catch (error) {
            logger.error(`Error in force analysis: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Analysis Failed')
                .setDescription(`Unable to run AI analysis: ${error.message}`)
                .setColor(0xFF0000);

            await interaction.editReply({ 
                content: null,
                embeds: [errorEmbed] 
            });
        }
    },

    /**
     * Show detailed dashboard
     */
    async showDashboard(interaction) {
        try {
            const stats = await gameDataCollector.getAggregatedStats().catch(() => null);
            const aiStatus = realAI.getAIStatus();
            const mlPhase = mlPhaseManager.currentPhase || 2;

            const dashboardEmbed = new EmbedBuilder()
                .setTitle('📈 AI CASINO DASHBOARD')
                .setColor(0x9932CC)
                .addFields(
                    {
                        name: '🎰 Game Statistics',
                        value: stats ? 
                            `**Total Games**: ${stats.totalGames || 0}\n` +
                            `**Win Rate**: ${(stats.winRate || 0).toFixed(1)}%\n` +
                            `**Average Bet**: ${fmt(stats.averageBet || 0)}\n` +
                            `**Volume**: ${fmt(stats.totalVolume || 0)}` :
                            'No game data available',
                        inline: true
                    },
                    {
                        name: '💰 Profitability',
                        value: stats ?
                            `**House Profit**: ${fmt(stats.houseProfit || 0)}\n` +
                            `**House Edge**: ${(stats.houseEdge || 0).toFixed(2)}%\n` +
                            `**Profit Margin**: ${(stats.profitMargin || 0).toFixed(1)}%\n` +
                            `**ROI**: ${(stats.roi || 0).toFixed(1)}%` :
                            'No profitability data',
                        inline: true
                    },
                    {
                        name: '🧠 AI Performance',
                        value: `**Recommendations**: ${aiStatus.recommendations?.length || 0}\n` +
                               `**Last Analysis**: ${aiStatus.lastAnalysis ? `<t:${Math.floor(aiStatus.lastAnalysis / 1000)}:R>` : 'Never'}\n` +
                               `**ML Phase**: ${mlPhase}\n` +
                               `**Auto Mode**: ${this.getAutonomousStatus()}`,
                        inline: false
                    }
                )
                .setFooter({ text: '📈 Real-time Dashboard • Updated continuously' })
                .setTimestamp();

            await interaction.editReply({ embeds: [dashboardEmbed] });

        } catch (error) {
            logger.error(`Error in dashboard: ${error.message}`);
            throw error;
        }
    },

    /**
     * Show AI recommendations
     */
    async showRecommendations(interaction) {
        try {
            const aiStatus = realAI.getAIStatus();
            const recommendations = aiStatus.recommendations || [];

            const recEmbed = new EmbedBuilder()
                .setTitle('🎯 AI RECOMMENDATIONS')
                .setColor(0xFFD700);

            if (recommendations.length === 0) {
                recEmbed.setDescription('📭 No active recommendations\n\nThe AI will generate recommendations after analyzing casino data. Use `/ai analyze` to force an analysis.');
            } else {
                recEmbed.setDescription(`🤖 **${recommendations.length} Active Recommendations**\n\nGenerated by OpenAI GPT-4o based on real casino data:`);
                
                recommendations.slice(0, 5).forEach((rec, index) => {
                    const confidenceEmoji = rec.confidence >= 80 ? '🟢' : rec.confidence >= 60 ? '🟡' : '🔴';
                    recEmbed.addFields({
                        name: `${confidenceEmoji} ${rec.action || 'Recommendation'} (${rec.confidence || 0}%)`,
                        value: `**Reason**: ${rec.reason || 'No reason provided'}\n` +
                               `**Impact**: ${rec.impact || 'Unknown'}\n` +
                               `**Status**: ${rec.applied ? '✅ Applied' : '⏳ Pending'}`,
                        inline: false
                    });
                });
            }

            recEmbed.setFooter({ text: '🎯 AI Recommendations • High confidence (80%+) auto-applied' });

            await interaction.editReply({ embeds: [recEmbed] });

        } catch (error) {
            logger.error(`Error in recommendations: ${error.message}`);
            throw error;
        }
    },

    /**
     * Helper to get autonomous status
     */
    getAutonomousStatus() {
        try {
            const autonomousAI = require('../UTILS/autonomousAI');
            return autonomousAI.isRunning ? '✅ Running' : '❌ Stopped';
        } catch (error) {
            return '❓ Unknown';
        }
    }
};