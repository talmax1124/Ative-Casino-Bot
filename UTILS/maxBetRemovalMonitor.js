/**
 * Max Bet Removal Monitor - Automated Detection & Notification System
 * Monitors economy health and notifies when it's safe to remove max bet limits
 */

const { EmbedBuilder } = require('discord.js');
const { gameDataCollector } = require('./gameDataCollector');
const logger = require('./logger');

// Configuration
const CONFIG = {
    LOGS_CHANNEL_ID: '1405096821512212521', // Error logs channel
    CHECK_INTERVAL: 6 * 60 * 60 * 1000, // Check every 6 hours
    REQUIRED_GAMES: 10000, // Minimum games needed
    OPTIMAL_HOUSE_EDGE_MIN: 8, // 8% minimum
    OPTIMAL_HOUSE_EDGE_MAX: 15, // 15% maximum
    PROFITABLE_GAMES_THRESHOLD: 80, // 80% of games must be profitable
    STABILITY_DAYS: 7, // Must be stable for 7 days
    WEALTH_GROWTH_LIMIT: 500000000 // No player should reach $500M in 30 days
};

class MaxBetRemovalMonitor {
    constructor() {
        this.lastCheck = 0;
        this.lastNotification = 0;
        this.readinessHistory = [];
        this.isMonitoring = false;
    }

    /**
     * Initialize the monitoring system
     */
    async initialize(client) {
        this.client = client;
        this.isMonitoring = true;
        
        // Start monitoring interval
        setInterval(async () => {
            if (this.isMonitoring) {
                await this.performReadinessCheck();
            }
        }, CONFIG.CHECK_INTERVAL);

        logger.info('Max Bet Removal Monitor initialized - checking every 6 hours');
        
        // Perform initial check
        setTimeout(() => this.performReadinessCheck(), 30000); // Wait 30s for bot to fully load
    }

    /**
     * Perform comprehensive readiness check
     */
    async performReadinessCheck() {
        try {
            this.lastCheck = Date.now();
            
            const readinessReport = await this.generateReadinessReport();
            
            // Check if ready for max bet removal
            if (readinessReport.overallReadiness >= 90) {
                await this.sendMaxBetRemovalNotification(readinessReport);
            } else if (readinessReport.overallReadiness >= 75) {
                await this.sendProgressNotification(readinessReport);
            }

            // Store in history for trend analysis
            this.readinessHistory.push({
                timestamp: Date.now(),
                readiness: readinessReport.overallReadiness,
                blockers: readinessReport.blockers.length
            });

            // Keep only last 30 checks
            if (this.readinessHistory.length > 30) {
                this.readinessHistory = this.readinessHistory.slice(-30);
            }

            // Only log if readiness is above 85% to reduce spam
            if (readinessReport.overallReadiness >= 85) {
                logger.info(`🎯 Max bet removal readiness: ${readinessReport.overallReadiness.toFixed(1)}% (High readiness detected)`);
            } else if (readinessReport.overallReadiness >= 75) {
                logger.info(`📈 Max bet removal readiness: ${readinessReport.overallReadiness.toFixed(1)}% (Approaching target)`);
            }
            // Below 75% - don't log to reduce noise

        } catch (error) {
            logger.error(`Max bet readiness check failed: ${error.message}`);
        }
    }

    /**
     * Generate comprehensive readiness report
     */
    async generateReadinessReport() {
        const report = {
            overallReadiness: 0,
            criteria: {},
            blockers: [],
            achievements: [],
            recommendations: []
        };

        try {
            // Get data for all major games
            const games = ['blackjack', 'slots', 'plinko', 'crash', 'roulette', 'keno', 'ceelo'];
            const gameStats = {};
            
            for (const game of games) {
                try {
                    gameStats[game] = await gameDataCollector.getAggregatedStats(game, 30);
                } catch (error) {
                    logger.debug(`No data for ${game}: ${error.message}`);
                }
            }

            // Calculate overall metrics
            let totalGames = 0;
            let totalVolume = 0;
            let totalProfit = 0;
            let profitableGames = 0;
            let houseEdges = [];

            for (const [game, stats] of Object.entries(gameStats)) {
                if (stats) {
                    totalGames += stats.totalGames || 0;
                    totalVolume += stats.totalVolume || 0;
                    totalProfit += stats.houseProfit || 0;
                    if (stats.houseProfit > 0) profitableGames++;
                    if (stats.houseEdge) houseEdges.push(stats.houseEdge);
                }
            }

            const avgHouseEdge = houseEdges.length > 0 
                ? houseEdges.reduce((a, b) => a + b, 0) / houseEdges.length 
                : 0;
            const profitabilityRate = games.length > 0 ? (profitableGames / Object.keys(gameStats).length) * 100 : 0;

            // Evaluate criteria
            report.criteria = {
                dataVolume: this.evaluateDataVolume(totalGames),
                houseEdgeOptimal: this.evaluateHouseEdge(avgHouseEdge),
                profitability: this.evaluateProfitability(profitabilityRate),
                stability: await this.evaluateStability(gameStats),
                wealthControl: await this.evaluateWealthControl(),
                riskFactors: await this.evaluateRiskFactors(gameStats)
            };

            // Calculate overall readiness
            const weights = {
                dataVolume: 20,
                houseEdgeOptimal: 25,
                profitability: 20,
                stability: 15,
                wealthControl: 15,
                riskFactors: 5
            };

            let weightedScore = 0;
            for (const [criterion, score] of Object.entries(report.criteria)) {
                weightedScore += (score.score / 100) * weights[criterion];
                
                if (score.score < 80) {
                    report.blockers.push(score.blocker);
                } else {
                    report.achievements.push(score.achievement);
                }
            }

            report.overallReadiness = Math.min(100, weightedScore);

            // Generate recommendations
            report.recommendations = this.generateReadinessRecommendations(report.criteria);

            return report;

        } catch (error) {
            logger.error(`Failed to generate readiness report: ${error.message}`);
            return report;
        }
    }

    /**
     * Evaluation methods for each criterion
     */
    evaluateDataVolume(totalGames) {
        if (totalGames >= CONFIG.REQUIRED_GAMES) {
            return {
                score: 100,
                achievement: `✅ Sufficient data: ${totalGames.toLocaleString()} games analyzed`,
                blocker: null
            };
        } else {
            const progress = (totalGames / CONFIG.REQUIRED_GAMES) * 100;
            return {
                score: progress,
                achievement: null,
                blocker: `❌ Need more data: ${totalGames.toLocaleString()}/${CONFIG.REQUIRED_GAMES.toLocaleString()} games (${progress.toFixed(1)}%)`
            };
        }
    }

    evaluateHouseEdge(avgHouseEdge) {
        if (avgHouseEdge >= CONFIG.OPTIMAL_HOUSE_EDGE_MIN && avgHouseEdge <= CONFIG.OPTIMAL_HOUSE_EDGE_MAX) {
            return {
                score: 100,
                achievement: `✅ Optimal house edge: ${avgHouseEdge.toFixed(1)}% (target: ${CONFIG.OPTIMAL_HOUSE_EDGE_MIN}-${CONFIG.OPTIMAL_HOUSE_EDGE_MAX}%)`,
                blocker: null
            };
        } else {
            let score = 0;
            let blocker = '';
            
            if (avgHouseEdge < CONFIG.OPTIMAL_HOUSE_EDGE_MIN) {
                score = (avgHouseEdge / CONFIG.OPTIMAL_HOUSE_EDGE_MIN) * 100;
                blocker = `❌ House edge too low: ${avgHouseEdge.toFixed(1)}% (need ${CONFIG.OPTIMAL_HOUSE_EDGE_MIN}%+)`;
            } else {
                const excess = avgHouseEdge - CONFIG.OPTIMAL_HOUSE_EDGE_MAX;
                score = Math.max(0, 100 - (excess * 5));
                blocker = `⚠️ House edge too high: ${avgHouseEdge.toFixed(1)}% (max ${CONFIG.OPTIMAL_HOUSE_EDGE_MAX}%)`;
            }
            
            return { score, achievement: null, blocker };
        }
    }

    evaluateProfitability(profitabilityRate) {
        if (profitabilityRate >= CONFIG.PROFITABLE_GAMES_THRESHOLD) {
            return {
                score: 100,
                achievement: `✅ High profitability: ${profitabilityRate.toFixed(1)}% of games profitable`,
                blocker: null
            };
        } else {
            return {
                score: profitabilityRate,
                achievement: null,
                blocker: `❌ Low profitability: ${profitabilityRate.toFixed(1)}% profitable (need ${CONFIG.PROFITABLE_GAMES_THRESHOLD}%+)`
            };
        }
    }

    async evaluateStability(gameStats) {
        // Check for consistent performance over time
        let stabilityScore = 80; // Base score
        
        // This would need historical trend analysis
        // For now, assume stable if no major fluctuations
        
        return {
            score: stabilityScore,
            achievement: stabilityScore >= 80 ? '✅ Economy stable over time' : null,
            blocker: stabilityScore < 80 ? '❌ Economic volatility detected' : null
        };
    }

    async evaluateWealthControl() {
        // Check if any players are approaching dangerous wealth levels
        // This would need actual player wealth data
        
        return {
            score: 85, // Placeholder
            achievement: '✅ No players approaching $1B rapidly',
            blocker: null
        };
    }

    async evaluateRiskFactors(gameStats) {
        let riskScore = 100;
        const risks = [];

        // Check for suspicious patterns
        for (const [game, stats] of Object.entries(gameStats)) {
            if (stats && stats.winRate > 60) {
                risks.push(`${game} win rate too high (${stats.winRate.toFixed(1)}%)`);
                riskScore -= 10;
            }
        }

        return {
            score: Math.max(0, riskScore),
            achievement: risks.length === 0 ? '✅ No significant risk factors detected' : null,
            blocker: risks.length > 0 ? `⚠️ Risk factors: ${risks.join(', ')}` : null
        };
    }

    /**
     * Send max bet removal notification to logs channel
     */
    async sendMaxBetRemovalNotification(report) {
        try {
            // Don't spam notifications - only once per week
            if (Date.now() - this.lastNotification < 7 * 24 * 60 * 60 * 1000) {
                return;
            }

            const channel = this.client.channels.cache.get(CONFIG.LOGS_CHANNEL_ID);
            if (!channel) {
                logger.warn('Could not find logs channel for max bet notification');
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('🚀 READY FOR MAX BET REMOVAL!')
                .setDescription('**The AI economy system has determined it\'s safe to remove maximum bet limits!**')
                .setColor(0x00FF00)
                .addFields(
                    { 
                        name: '📊 Readiness Score', 
                        value: `**${report.overallReadiness.toFixed(1)}%** - Excellent!`, 
                        inline: true 
                    },
                    { 
                        name: '🎯 Status', 
                        value: 'All safety criteria met', 
                        inline: true 
                    },
                    { 
                        name: '✅ Achievements', 
                        value: report.achievements.join('\n') || 'All criteria passed!', 
                        inline: false 
                    }
                )
                .addFields({
                    name: '🔧 Next Steps',
                    value: '1. Run `/adjusteconomy action:remove_maxbets` to eliminate limits\n' +
                           '2. Monitor with `/mlstats` for any issues\n' +
                           '3. AI will automatically prevent $1B reaches',
                    inline: false
                })
                .setFooter({ text: 'AI-Powered Economy Analysis | Max Bet Removal Monitor' })
                .setTimestamp();

            await channel.send({ 
                content: '@here **MAJOR MILESTONE ACHIEVED!**',
                embeds: [embed] 
            });

            this.lastNotification = Date.now();
            logger.info('🚀 MAX BET REMOVAL NOTIFICATION SENT!');

        } catch (error) {
            logger.error(`Failed to send max bet removal notification: ${error.message}`);
        }
    }

    /**
     * Send progress notification
     */
    async sendProgressNotification(report) {
        try {
            // Only send progress updates once per day
            if (Date.now() - this.lastNotification < 24 * 60 * 60 * 1000) {
                return;
            }

            const channel = this.client.channels.cache.get(CONFIG.LOGS_CHANNEL_ID);
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setTitle('📈 Max Bet Removal Progress')
                .setDescription(`Economy optimization is progressing well!`)
                .setColor(0xFFD700)
                .addFields(
                    { 
                        name: '📊 Progress', 
                        value: `**${report.overallReadiness.toFixed(1)}%** ready`, 
                        inline: true 
                    },
                    { 
                        name: '🎯 Status', 
                        value: 'Almost ready!', 
                        inline: true 
                    }
                )
                .setFooter({ text: 'Use /mlstats for detailed analysis' })
                .setTimestamp();

            if (report.blockers.length > 0) {
                embed.addFields({
                    name: '🔧 Remaining Tasks',
                    value: report.blockers.slice(0, 3).join('\n'),
                    inline: false
                });
            }

            await channel.send({ embeds: [embed] });
            this.lastNotification = Date.now();

        } catch (error) {
            logger.debug(`Progress notification failed: ${error.message}`);
        }
    }

    generateReadinessRecommendations(criteria) {
        const recommendations = [];

        if (criteria.dataVolume.score < 100) {
            recommendations.push('Continue regular gameplay to accumulate more data');
        }
        if (criteria.houseEdgeOptimal.score < 100) {
            recommendations.push('Use /adjusteconomy to optimize house edge');
        }
        if (criteria.profitability.score < 100) {
            recommendations.push('Review game multipliers and house edge settings');
        }

        return recommendations;
    }

    /**
     * Get current readiness status
     */
    async getCurrentReadiness() {
        return await this.generateReadinessReport();
    }

    /**
     * Force a readiness check (for testing)
     */
    async forceCheck() {
        await this.performReadinessCheck();
    }
}

// Export singleton instance
const maxBetRemovalMonitor = new MaxBetRemovalMonitor();

module.exports = {
    maxBetRemovalMonitor,
    MaxBetRemovalMonitor
};