/**
 * ADVANCED AI-POWERED ECONOMIC ANALYZER
 * Comprehensive analysis and recommendation system for casino economy
 */

const logger = require('./logger');
const dbManager = require('./database');
const moment = require('moment');
const Decimal = require('decimal.js');
const _ = require('lodash');

class EconomicAnalyzer {
    constructor() {
        this.analysisCache = new Map();
        this.gameAnalysis = new Map();
        this.recommendations = [];
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        logger.info('🧠 Initializing AI-Powered Economic Analyzer...');
        
        // Wait for database to be ready before initializing
        await this.waitForDatabaseReady();
        
        this.initialized = true;
        logger.info('✅ Economic Analyzer ready');
    }

    /**
     * Wait for database to be fully ready before running analysis
     */
    async waitForDatabaseReady(maxWaitTime = 10000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            if (dbManager.databaseAdapter && dbManager.databaseAdapter.pool && dbManager.initialized) {
                logger.debug('Database ready for economic analysis');
                return true;
            }
            
            // Wait 1 second before checking again
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        logger.warn('Economic analyzer proceeding without database connection');
        return false;
    }

    /**
     * COMPREHENSIVE ECONOMIC ANALYSIS
     * Deep dive into all economic aspects with AI-like pattern recognition
     */
    async performComprehensiveAnalysis() {
        try {
            logger.info('🔍 Starting comprehensive economic analysis...');
            
            const analysis = {
                timestamp: Date.now(),
                overallHealth: 0,
                criticalIssues: [],
                recommendations: [],
                gameAnalysis: {},
                playerBehavior: {},
                economicTrends: {},
                riskAssessment: {}
            };

            // 1. Analyze recent game performance (last 7 days)
            analysis.gameAnalysis = await this.analyzeGamePerformance();
            
            // 2. Analyze player behavior patterns
            analysis.playerBehavior = await this.analyzePlayerBehavior();
            
            // 3. Detect economic anomalies
            analysis.economicTrends = await this.analyzeEconomicTrends();
            
            // 4. Assess systemic risks
            analysis.riskAssessment = await this.assessSystemicRisks();
            
            // 5. Generate AI recommendations
            analysis.recommendations = await this.generateRecommendations(analysis);
            
            // 6. Calculate overall health score
            analysis.overallHealth = this.calculateOverallHealth(analysis);
            
            // Cache results
            this.analysisCache.set('comprehensive', analysis);
            
            logger.info(`📊 Analysis complete - Health Score: ${analysis.overallHealth}/100`);
            return analysis;
            
        } catch (error) {
            logger.error(`Economic analysis failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * ANALYZE GAME PERFORMANCE
     * Detailed analysis of each game's win rates, payouts, and house edge
     * EXCLUDES: Developer, Admins, Off Eco players
     */
    async analyzeGamePerformance() {
        const gameStats = {};
        const last7Days = moment().subtract(7, 'days').toDate();
        
        try {
            // Check if database is available
            if (!dbManager.databaseAdapter || !dbManager.databaseAdapter.pool || !dbManager.initialized) {
                logger.debug('Database not ready for game performance analysis, skipping...');
                return {
                    status: 'database_not_ready',
                    games: {},
                    overallPerformance: 'unknown'
                };
            }

            // Get all recent game results EXCLUDING special players
            const query = `
                SELECT 
                    gr.game_type,
                    COUNT(*) as total_games,
                    SUM(gr.bet_amount) as total_wagered,
                    SUM(gr.payout) as total_paid,
                    SUM(CASE WHEN gr.won = 1 THEN 1 ELSE 0 END) as wins,
                    AVG(gr.bet_amount) as avg_bet,
                    MAX(gr.payout) as biggest_win,
                    MAX(gr.payout / gr.bet_amount) as highest_multiplier
                FROM game_results gr
                LEFT JOIN user_balances ub ON gr.user_id = ub.user_id
                WHERE gr.played_at >= ? 
                AND gr.bet_amount > 0
                AND gr.user_id != '466050111680544798'
                AND (ub.off_economy IS NULL OR ub.off_economy = 0)
                GROUP BY gr.game_type
                ORDER BY total_wagered DESC
            `;
            
            const [results] = await dbManager.databaseAdapter.pool.execute(query, [last7Days]);
            
            for (const row of results) {
                const winRate = row.total_games > 0 ? (row.wins / row.total_games) * 100 : 0;
                const houseEdge = row.total_wagered > 0 ? 
                    ((row.total_wagered - row.total_paid) / row.total_wagered) * 100 : 5;
                const rtp = 100 - houseEdge; // Return to Player
                
                gameStats[row.game_type] = {
                    totalGames: row.total_games,
                    totalWagered: row.total_wagered,
                    totalPaid: row.total_paid,
                    wins: row.wins,
                    winRate: parseFloat(winRate.toFixed(2)),
                    houseEdge: parseFloat(houseEdge.toFixed(2)),
                    rtp: parseFloat(rtp.toFixed(2)),
                    avgBet: row.avg_bet,
                    biggestWin: row.biggest_win,
                    highestMultiplier: row.highest_multiplier,
                    profitability: row.total_wagered - row.total_paid,
                    riskLevel: this.assessGameRisk(winRate, houseEdge, row.highest_multiplier)
                };
                
                // Flag problematic games
                if (houseEdge < 1) {
                    gameStats[row.game_type].issues = ['NEGATIVE_HOUSE_EDGE'];
                }
                if (winRate > 60) {
                    gameStats[row.game_type].issues = gameStats[row.game_type].issues || [];
                    gameStats[row.game_type].issues.push('HIGH_WIN_RATE');
                }
                if (row.highest_multiplier > 100) {
                    gameStats[row.game_type].issues = gameStats[row.game_type].issues || [];
                    gameStats[row.game_type].issues.push('EXTREME_MULTIPLIERS');
                }
            }
            
        } catch (error) {
            logger.error(`Game performance analysis failed: ${error.message}`);
        }
        
        return gameStats;
    }

    /**
     * ANALYZE PLAYER BEHAVIOR PATTERNS
     * Identify concerning player behavior and wealth concentration
     * EXCLUDES: Developer, Admins, Off Eco players
     */
    async analyzePlayerBehavior() {
        const playerStats = {
            totalPlayers: 0,
            activePlayers: 0,
            wealthDistribution: {},
            suspiciousPlayers: [],
            behaviorPatterns: {}
        };

        try {
            // Check if database is available
            if (!dbManager.databaseAdapter || !dbManager.databaseAdapter.pool || !dbManager.initialized) {
                logger.debug('Database not ready for player behavior analysis, skipping...');
                return {
                    status: 'database_not_ready',
                    ...playerStats
                };
            }

            // Get all players with recent activity EXCLUDING special players
            const [players] = await dbManager.databaseAdapter.pool.execute(`
                SELECT 
                    ub.user_id,
                    ub.wallet + ub.bank as total_wealth,
                    us.wins,
                    us.losses,
                    us.total_wagered,
                    us.total_won,
                    us.biggest_win,
                    COUNT(gr.id) as recent_games
                FROM user_balances ub
                LEFT JOIN user_stats us ON ub.user_id = us.user_id
                LEFT JOIN game_results gr ON ub.user_id = gr.user_id 
                    AND gr.played_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                WHERE ub.wallet + ub.bank > 0
                AND ub.user_id != '466050111680544798'
                AND (ub.off_economy IS NULL OR ub.off_economy = 0)
                GROUP BY ub.user_id
                ORDER BY total_wealth DESC
            `);

            playerStats.totalPlayers = players.length;
            playerStats.activePlayers = players.filter(p => p.recent_games > 0).length;

            // Wealth distribution analysis
            const wealthRanges = {
                'under_10k': 0,
                '10k_100k': 0,
                '100k_1m': 0,
                '1m_10m': 0,
                '10m_100m': 0,
                'over_100m': 0
            };

            let totalWealth = 0;
            for (const player of players) {
                const wealth = player.total_wealth;
                totalWealth += wealth;

                if (wealth < 10000) wealthRanges.under_10k++;
                else if (wealth < 100000) wealthRanges['10k_100k']++;
                else if (wealth < 1000000) wealthRanges['100k_1m']++;
                else if (wealth < 10000000) wealthRanges['1m_10m']++;
                else if (wealth < 100000000) wealthRanges['10m_100m']++;
                else wealthRanges.over_100m++;

                // Identify suspicious players
                const totalGames = (player.wins || 0) + (player.losses || 0);
                if (totalGames > 0) {
                    const winRate = (player.wins || 0) / totalGames;
                    const profitRatio = player.total_won / Math.max(player.total_wagered, 1);
                    
                    if (winRate > 0.7 || profitRatio > 1.5 || player.biggest_win > wealth * 0.8) {
                        playerStats.suspiciousPlayers.push({
                            userId: player.user_id,
                            wealth: wealth,
                            winRate: winRate,
                            profitRatio: profitRatio,
                            biggestWinRatio: player.biggest_win / Math.max(wealth, 1),
                            flags: [
                                winRate > 0.7 ? 'HIGH_WIN_RATE' : null,
                                profitRatio > 1.5 ? 'HIGH_PROFIT_RATIO' : null,
                                player.biggest_win > wealth * 0.8 ? 'SUSPICIOUS_BIG_WIN' : null
                            ].filter(Boolean)
                        });
                    }
                }
            }

            playerStats.wealthDistribution = wealthRanges;
            playerStats.averageWealth = totalWealth / Math.max(players.length, 1);
            playerStats.wealthConcentration = this.calculateWealthConcentration(players);

        } catch (error) {
            logger.error(`Player behavior analysis failed: ${error.message}`);
        }

        return playerStats;
    }

    /**
     * ANALYZE ECONOMIC TRENDS
     * Track wealth flow, inflation, and economic velocity
     */
    async analyzeEconomicTrends() {
        const trends = {
            wealthGrowth: 0,
            inflationRate: 0,
            economicVelocity: 0,
            trends: []
        };

        try {
            // Check if database is available
            if (!dbManager.databaseAdapter || !dbManager.databaseAdapter.pool || !dbManager.initialized) {
                logger.debug('Database not ready for economic trends analysis, skipping...');
                return {
                    status: 'database_not_ready',
                    ...trends
                };
            }

            // Compare current week vs previous week EXCLUDING special players
            const [currentWeek] = await dbManager.databaseAdapter.pool.execute(`
                SELECT 
                    COUNT(*) as games,
                    SUM(gr.bet_amount) as wagered,
                    SUM(gr.payout) as paid,
                    SUM(gr.payout - gr.bet_amount) as net_change
                FROM game_results gr
                LEFT JOIN user_balances ub ON gr.user_id = ub.user_id
                WHERE gr.played_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                AND gr.user_id != '466050111680544798'
                AND (ub.off_economy IS NULL OR ub.off_economy = 0)
            `);

            const [previousWeek] = await dbManager.databaseAdapter.pool.execute(`
                SELECT 
                    COUNT(*) as games,
                    SUM(gr.bet_amount) as wagered,
                    SUM(gr.payout) as paid,
                    SUM(gr.payout - gr.bet_amount) as net_change
                FROM game_results gr
                LEFT JOIN user_balances ub ON gr.user_id = ub.user_id
                WHERE gr.played_at BETWEEN DATE_SUB(NOW(), INTERVAL 14 DAY) AND DATE_SUB(NOW(), INTERVAL 7 DAY)
                AND gr.user_id != '466050111680544798'
                AND (ub.off_economy IS NULL OR ub.off_economy = 0)
            `);

            if (currentWeek.length > 0 && previousWeek.length > 0) {
                const curr = currentWeek[0];
                const prev = previousWeek[0];

                if (prev.wagered > 0) {
                    trends.wealthGrowth = ((curr.net_change - prev.net_change) / prev.wagered) * 100;
                    trends.economicVelocity = (curr.wagered / prev.wagered - 1) * 100;
                }

                // Detect concerning trends
                if (trends.wealthGrowth > 20) {
                    trends.trends.push('RAPID_WEALTH_INCREASE');
                }
                if (curr.net_change > curr.wagered * 0.1) {
                    trends.trends.push('PLAYERS_WINNING_TOO_MUCH');
                }
            }

        } catch (error) {
            logger.error(`Economic trends analysis failed: ${error.message}`);
        }

        return trends;
    }

    /**
     * ASSESS SYSTEMIC RISKS
     * Identify potential threats to economic stability
     */
    async assessSystemicRisks() {
        const risks = {
            level: 'LOW', // LOW, MEDIUM, HIGH, CRITICAL
            factors: [],
            score: 0
        };

        try {
            // Check if database is available
            if (!dbManager.databaseAdapter || !dbManager.databaseAdapter.pool || !dbManager.initialized) {
                logger.debug('Database not ready for risk assessment, skipping...');
                return {
                    status: 'database_not_ready',
                    ...risks
                };
            }

            // Check for rapid wealth accumulation EXCLUDING special players
            const [bigWinners] = await dbManager.databaseAdapter.pool.execute(`
                SELECT gr.user_id, COUNT(*) as big_wins
                FROM game_results gr
                LEFT JOIN user_balances ub ON gr.user_id = ub.user_id
                WHERE gr.payout > gr.bet_amount * 50 
                AND gr.played_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                AND gr.user_id != '466050111680544798'
                AND (ub.off_economy IS NULL OR ub.off_economy = 0)
                GROUP BY gr.user_id
                HAVING big_wins >= 3
            `);

            if (bigWinners.length > 0) {
                risks.factors.push('MULTIPLE_BIG_WINNERS');
                risks.score += 20;
            }

            // Check for unusual bet patterns EXCLUDING special players
            const [unusualBets] = await dbManager.databaseAdapter.pool.execute(`
                SELECT COUNT(*) as count
                FROM game_results gr
                LEFT JOIN user_balances ub ON gr.user_id = ub.user_id
                WHERE gr.bet_amount > 1000000 
                AND gr.played_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                AND gr.user_id != '466050111680544798'
                AND (ub.off_economy IS NULL OR ub.off_economy = 0)
            `);

            if (unusualBets[0].count > 50) {
                risks.factors.push('HIGH_VOLUME_LARGE_BETS');
                risks.score += 15;
            }

            // Determine risk level
            if (risks.score >= 50) risks.level = 'CRITICAL';
            else if (risks.score >= 30) risks.level = 'HIGH';
            else if (risks.score >= 15) risks.level = 'MEDIUM';
            else risks.level = 'LOW';

        } catch (error) {
            logger.error(`Risk assessment failed: ${error.message}`);
        }

        return risks;
    }

    /**
     * GENERATE AI RECOMMENDATIONS
     * Smart recommendations based on analysis
     */
    async generateRecommendations(analysis) {
        const recommendations = [];

        // Game-specific recommendations
        for (const [game, stats] of Object.entries(analysis.gameAnalysis)) {
            if (stats.houseEdge < 2) {
                recommendations.push({
                    priority: 'HIGH',
                    category: 'GAME_BALANCE',
                    game: game,
                    issue: 'Low house edge',
                    recommendation: `Reduce multipliers for ${game} by ${Math.max(10, 5 - stats.houseEdge * 2)}%`,
                    expectedImpact: `Increase house edge to ~3-4%`
                });
            }

            if (stats.winRate > 55) {
                recommendations.push({
                    priority: 'HIGH',
                    category: 'GAME_BALANCE',
                    game: game,
                    issue: 'High player win rate',
                    recommendation: `Adjust ${game} odds to reduce win rate to 45-50%`,
                    expectedImpact: `Better long-term profitability`
                });
            }

            if (stats.highestMultiplier > 200) {
                recommendations.push({
                    priority: 'MEDIUM',
                    category: 'RISK_MANAGEMENT',
                    game: game,
                    issue: 'Extreme multipliers possible',
                    recommendation: `Cap maximum multiplier for ${game} at 100x`,
                    expectedImpact: `Reduce potential for catastrophic payouts`
                });
            }
        }

        // Player behavior recommendations
        if (analysis.playerBehavior.suspiciousPlayers.length > 5) {
            recommendations.push({
                priority: 'HIGH',
                category: 'ANTI_ABUSE',
                issue: 'Multiple suspicious players detected',
                recommendation: 'Implement stricter win-rate monitoring and automatic restrictions',
                expectedImpact: 'Reduce potential abuse and artificial wins'
            });
        }

        // Economic trend recommendations
        if (analysis.economicTrends.wealthGrowth > 15) {
            recommendations.push({
                priority: 'CRITICAL',
                category: 'ECONOMIC_STABILITY',
                issue: 'Rapid wealth increase detected',
                recommendation: 'Activate emergency economic measures immediately',
                expectedImpact: 'Stabilize economy before collapse'
            });
        }

        return recommendations;
    }

    /**
     * CALCULATE OVERALL HEALTH SCORE
     */
    calculateOverallHealth(analysis) {
        let score = 100;

        // Game health impact
        const gameIssues = Object.values(analysis.gameAnalysis).reduce((count, game) => {
            return count + (game.issues ? game.issues.length : 0);
        }, 0);
        score -= Math.min(gameIssues * 5, 30);

        // Player behavior impact
        score -= Math.min(analysis.playerBehavior.suspiciousPlayers.length * 2, 20);

        // Risk level impact
        const riskPenalty = {
            'LOW': 0,
            'MEDIUM': 10,
            'HIGH': 25,
            'CRITICAL': 40
        };
        score -= riskPenalty[analysis.riskAssessment.level] || 0;

        // Economic trends impact
        if (analysis.economicTrends.wealthGrowth > 20) score -= 20;
        if (analysis.economicTrends.wealthGrowth > 10) score -= 10;

        return Math.max(0, Math.min(100, score));
    }

    /**
     * UTILITY METHODS
     */
    assessGameRisk(winRate, houseEdge, maxMultiplier) {
        let risk = 0;
        if (winRate > 55) risk += 2;
        if (houseEdge < 2) risk += 3;
        if (maxMultiplier > 100) risk += 1;
        
        if (risk >= 4) return 'HIGH';
        if (risk >= 2) return 'MEDIUM';
        return 'LOW';
    }

    calculateWealthConcentration(players) {
        if (players.length === 0) return 0;
        
        const sorted = players.sort((a, b) => b.total_wealth - a.total_wealth);
        const top10Percent = Math.max(1, Math.floor(players.length * 0.1));
        const totalWealth = sorted.reduce((sum, p) => sum + p.total_wealth, 0);
        const top10Wealth = sorted.slice(0, top10Percent).reduce((sum, p) => sum + p.total_wealth, 0);
        
        return totalWealth > 0 ? top10Wealth / totalWealth : 0;
    }

    /**
     * GET REAL-TIME INSIGHTS
     */
    async getRealTimeInsights() {
        if (!this.analysisCache.has('comprehensive')) {
            await this.performComprehensiveAnalysis();
        }
        
        const analysis = this.analysisCache.get('comprehensive');
        
        return {
            healthScore: analysis.overallHealth,
            criticalIssues: analysis.recommendations.filter(r => r.priority === 'CRITICAL').length,
            gamesNeedingAttention: Object.keys(analysis.gameAnalysis).filter(game => 
                analysis.gameAnalysis[game].issues?.length > 0
            ),
            riskLevel: analysis.riskAssessment.level,
            topRecommendations: analysis.recommendations.slice(0, 5)
        };
    }

    /**
     * EXPORT DETAILED REPORT
     */
    async generateDetailedReport() {
        const analysis = await this.performComprehensiveAnalysis();
        
        let report = "=== ATIVE CASINO ECONOMIC ANALYSIS REPORT ===\n\n";
        report += `Analysis Date: ${new Date().toLocaleString()}\n`;
        report += `Overall Health Score: ${analysis.overallHealth}/100\n`;
        report += `Risk Level: ${analysis.riskAssessment.level}\n\n`;
        
        report += "=== GAME ANALYSIS ===\n";
        for (const [game, stats] of Object.entries(analysis.gameAnalysis)) {
            report += `${game.toUpperCase()}:\n`;
            report += `  Win Rate: ${stats.winRate}% | House Edge: ${stats.houseEdge}% | Risk: ${stats.riskLevel}\n`;
            if (stats.issues) {
                report += `  Issues: ${stats.issues.join(', ')}\n`;
            }
            report += `  Total Wagered: $${stats.totalWagered.toLocaleString()}\n\n`;
        }
        
        report += "=== TOP RECOMMENDATIONS ===\n";
        analysis.recommendations.slice(0, 10).forEach((rec, i) => {
            report += `${i + 1}. [${rec.priority}] ${rec.recommendation}\n`;
        });
        
        return report;
    }
}

module.exports = new EconomicAnalyzer();