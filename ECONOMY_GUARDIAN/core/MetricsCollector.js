/**
 * MetricsCollector - Real-time Casino Economy Metrics Collection
 * Ingests and processes economic data from all casino systems
 */

const EventEmitter = require('events');
const logger = require('../../UTILS/logger');
const dbManager = require('../../UTILS/database');

class MetricsCollector extends EventEmitter {
    constructor(client, config) {
        super();
        
        this.client = client;
        this.config = config;
        this.isRunning = false;
        
        // Metrics collection intervals
        this.collectors = new Map();
        this.lastMetrics = {};
        this.historicalData = [];
        
        // Critical thresholds for immediate alerts
        this.criticalThresholds = {
            inflationRate: 0.10, // 10% inflation rate
            deflationRate: -0.05, // 5% deflation rate
            liquidityRatio: 0.20, // 20% liquidity crisis
            winRateDeviation: 0.15, // 15% win rate deviation
            volumeChange: 0.50 // 50% volume change
        };
    }

    async initialize() {
        logger.info('Initializing MetricsCollector...');
        
        // Set up metric collection methods
        this.setupCollectors();
        
        logger.info('MetricsCollector initialized');
        return true;
    }

    async start() {
        if (this.isRunning) return;
        
        logger.info('Starting metrics collection...');
        
        // Start all collectors
        for (const [name, collector] of this.collectors) {
            const intervalId = setInterval(async () => {
                try {
                    await collector.collect();
                } catch (error) {
                    logger.error(`Error in ${name} collector: ${error.message}`);
                }
            }, collector.interval);
            
            collector.intervalId = intervalId;
        }
        
        this.isRunning = true;
        logger.info('Metrics collection started');
    }

    async stop() {
        if (!this.isRunning) return;
        
        // Stop all collectors
        for (const [name, collector] of this.collectors) {
            if (collector.intervalId) {
                clearInterval(collector.intervalId);
            }
        }
        
        this.isRunning = false;
        logger.info('Metrics collection stopped');
    }

    setupCollectors() {
        // Token Flow Metrics (every 1 minute)
        this.collectors.set('tokenFlow', {
            interval: 60 * 1000,
            collect: () => this.collectTokenFlow()
        });
        
        // Game Performance Metrics (every 2 minutes)
        this.collectors.set('gamePerformance', {
            interval: 2 * 60 * 1000,
            collect: () => this.collectGamePerformance()
        });
        
        // User Balance Distribution (every 5 minutes)
        this.collectors.set('balanceDistribution', {
            interval: 5 * 60 * 1000,
            collect: () => this.collectBalanceDistribution()
        });
        
        // Economic Health Indicators (every 3 minutes)
        this.collectors.set('economicHealth', {
            interval: 3 * 60 * 1000,
            collect: () => this.collectEconomicHealth()
        });
        
        // System Sinks and Faucets (every 4 minutes)
        this.collectors.set('sinksAndFaucets', {
            interval: 4 * 60 * 1000,
            collect: () => this.collectSinksAndFaucets()
        });
    }

    /**
     * Collect comprehensive metrics snapshot
     */
    async collectAll() {
        const metrics = {
            timestamp: new Date(),
            tokenFlow: await this.collectTokenFlow(),
            gamePerformance: await this.collectGamePerformance(),
            balanceDistribution: await this.collectBalanceDistribution(),
            economicHealth: await this.collectEconomicHealth(),
            sinksAndFaucets: await this.collectSinksAndFaucets()
        };
        
        // Store historical data
        this.historicalData.push(metrics);
        
        // Keep only last 24 hours of data
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        this.historicalData = this.historicalData.filter(
            m => m.timestamp.getTime() > oneDayAgo
        );
        
        // Check for critical conditions
        await this.checkCriticalThresholds(metrics);
        
        this.lastMetrics = metrics;
        return metrics;
    }

    /**
     * Collect token inflow/outflow data
     */
    async collectTokenFlow() {
        try {
            const timeframe = 60; // Last 60 minutes
            const since = new Date(Date.now() - timeframe * 60 * 1000);
            
            // Get recent game results for inflow/outflow analysis
            const gameResults = await dbManager.databaseAdapter.executeQuery(`
                SELECT 
                    game_type,
                    SUM(CASE WHEN result = 'WIN' THEN payout ELSE 0 END) as total_payouts,
                    SUM(CASE WHEN result = 'LOSS' THEN bet_amount ELSE 0 END) as total_losses,
                    SUM(bet_amount) as total_wagered,
                    COUNT(*) as total_games,
                    AVG(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as win_rate
                FROM game_results 
                WHERE created_at >= ?
                GROUP BY game_type
            `, [since]);
            
            // Calculate overall flow
            let totalInflow = 0;
            let totalOutflow = 0;
            let totalWagered = 0;
            
            for (const game of gameResults || []) {
                totalInflow += parseFloat(game.total_losses || 0);
                totalOutflow += parseFloat(game.total_payouts || 0);
                totalWagered += parseFloat(game.total_wagered || 0);
            }
            
            const netFlow = totalInflow - totalOutflow;
            const flowRate = totalWagered > 0 ? netFlow / totalWagered : 0;
            
            return {
                timeframe,
                totalInflow,
                totalOutflow,
                netFlow,
                totalWagered,
                flowRate,
                gameBreakdown: gameResults || [],
                houseEdgeEffective: totalWagered > 0 ? netFlow / totalWagered : 0
            };
            
        } catch (error) {
            logger.error(`Error collecting token flow: ${error.message}`);
            return null;
        }
    }

    /**
     * Collect individual game performance metrics
     */
    async collectGamePerformance() {
        try {
            const timeframe = 24; // Last 24 hours
            const since = new Date(Date.now() - timeframe * 60 * 60 * 1000);
            
            const gameStats = await dbManager.databaseAdapter.executeQuery(`
                SELECT 
                    game_type,
                    COUNT(*) as games_played,
                    SUM(bet_amount) as total_volume,
                    AVG(bet_amount) as avg_bet_size,
                    SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
                    SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
                    SUM(CASE WHEN result = 'WIN' THEN payout ELSE 0 END) as total_paid,
                    MAX(payout) as biggest_payout,
                    AVG(CASE WHEN result = 'WIN' THEN payout ELSE 0 END) as avg_payout
                FROM game_results 
                WHERE created_at >= ?
                GROUP BY game_type
                ORDER BY total_volume DESC
            `, [since]);
            
            const performanceData = {};
            
            for (const game of gameStats || []) {
                const winRate = game.games_played > 0 ? game.wins / game.games_played : 0;
                const rtp = game.total_volume > 0 ? game.total_paid / game.total_volume : 0;
                const houseEdge = 1 - rtp;
                
                performanceData[game.game_type] = {
                    gamesPlayed: parseInt(game.games_played),
                    totalVolume: parseFloat(game.total_volume),
                    avgBetSize: parseFloat(game.avg_bet_size),
                    winRate: winRate,
                    rtp: rtp,
                    houseEdge: houseEdge,
                    totalPaid: parseFloat(game.total_paid),
                    biggestPayout: parseFloat(game.biggest_payout || 0),
                    avgPayout: parseFloat(game.avg_payout || 0),
                    profitMargin: game.total_volume - game.total_paid
                };
            }
            
            return {
                timeframe,
                games: performanceData,
                totalGames: gameStats?.reduce((sum, g) => sum + parseInt(g.games_played), 0) || 0,
                totalVolume: gameStats?.reduce((sum, g) => sum + parseFloat(g.total_volume), 0) || 0
            };
            
        } catch (error) {
            logger.error(`Error collecting game performance: ${error.message}`);
            return null;
        }
    }

    /**
     * Collect user balance distribution and wealth concentration
     */
    async collectBalanceDistribution() {
        try {
            // Get balance distribution
            const balanceStats = await dbManager.databaseAdapter.executeQuery(`
                SELECT 
                    COUNT(*) as total_users,
                    SUM(wallet + bank) as total_money_supply,
                    AVG(wallet + bank) as avg_balance,
                    MIN(wallet + bank) as min_balance,
                    MAX(wallet + bank) as max_balance,
                    SUM(CASE WHEN (wallet + bank) = 0 THEN 1 ELSE 0 END) as broke_users,
                    SUM(CASE WHEN (wallet + bank) > 1000000 THEN 1 ELSE 0 END) as millionaires
                FROM user_balances
                WHERE (wallet + bank) >= 0
            `);
            
            // Get wealth distribution percentiles
            const percentiles = await dbManager.databaseAdapter.executeQuery(`
                SELECT 
                    (wallet + bank) as balance
                FROM user_balances 
                WHERE (wallet + bank) > 0
                ORDER BY balance DESC
            `);
            
            let distribution = {};
            if (percentiles && percentiles.length > 0) {
                const total = percentiles.length;
                distribution = {
                    top1Percent: percentiles[Math.floor(total * 0.01)]?.balance || 0,
                    top5Percent: percentiles[Math.floor(total * 0.05)]?.balance || 0,
                    top10Percent: percentiles[Math.floor(total * 0.10)]?.balance || 0,
                    median: percentiles[Math.floor(total * 0.50)]?.balance || 0,
                    bottom10Percent: percentiles[Math.floor(total * 0.90)]?.balance || 0
                };
            }
            
            const stats = balanceStats?.[0];
            if (!stats) return null;
            
            return {
                totalUsers: parseInt(stats.total_users),
                totalMoneySupply: parseFloat(stats.total_money_supply || 0),
                avgBalance: parseFloat(stats.avg_balance || 0),
                minBalance: parseFloat(stats.min_balance || 0),
                maxBalance: parseFloat(stats.max_balance || 0),
                brokeUsers: parseInt(stats.broke_users || 0),
                millionaires: parseInt(stats.millionaires || 0),
                wealthDistribution: distribution,
                giniCoefficient: this.calculateGini(percentiles.map(p => p.balance))
            };
            
        } catch (error) {
            logger.error(`Error collecting balance distribution: ${error.message}`);
            return null;
        }
    }

    /**
     * Collect economic health indicators
     */
    async collectEconomicHealth() {
        try {
            const current = await this.collectTokenFlow();
            const historical = this.getHistoricalAverage('tokenFlow', 24); // 24 data points
            
            if (!current || !historical) {
                return { status: 'insufficient_data' };
            }
            
            // Calculate inflation/deflation
            const inflationRate = historical.totalWagered > 0 ? 
                (current.netFlow - historical.netFlow) / historical.totalWagered : 0;
            
            // Calculate velocity (how fast money changes hands)
            const velocity = current.totalWagered / (this.lastMetrics.balanceDistribution?.totalMoneySupply || 1);
            
            // Liquidity analysis
            const liquidityRatio = this.lastMetrics.balanceDistribution?.brokeUsers / 
                this.lastMetrics.balanceDistribution?.totalUsers || 0;
            
            return {
                inflationRate,
                velocity,
                liquidityRatio,
                economicGrowth: (current.totalWagered - historical.totalWagered) / historical.totalWagered,
                marketStability: this.calculateStability(),
                healthScore: this.calculateHealthScore({
                    inflationRate,
                    velocity,
                    liquidityRatio
                })
            };
            
        } catch (error) {
            logger.error(`Error collecting economic health: ${error.message}`);
            return null;
        }
    }

    /**
     * Collect money sinks and faucets data
     */
    async collectSinksAndFaucets() {
        try {
            const timeframe = 24; // Last 24 hours
            const since = new Date(Date.now() - timeframe * 60 * 60 * 1000);
            
            // Game losses (major sink)
            const gameSinks = await this.collectTokenFlow();
            
            // Other potential sinks (taxes, fees, etc.)
            // TODO: Add other sink collection based on your systems
            
            // Faucets (money creation)
            // TODO: Add faucet collection (daily rewards, bonuses, etc.)
            
            return {
                timeframe,
                sinks: {
                    gameLosses: gameSinks?.totalInflow || 0,
                    // Add other sinks here
                },
                faucets: {
                    // Add faucets here (daily rewards, etc.)
                    estimated: 0
                },
                netSinkRate: gameSinks?.netFlow || 0
            };
            
        } catch (error) {
            logger.error(`Error collecting sinks and faucets: ${error.message}`);
            return null;
        }
    }

    /**
     * Check if any metrics exceed critical thresholds
     */
    async checkCriticalThresholds(metrics) {
        const alerts = [];
        
        // Check inflation rate
        if (metrics.economicHealth?.inflationRate > this.criticalThresholds.inflationRate) {
            alerts.push({
                type: 'inflation',
                severity: 'critical',
                value: metrics.economicHealth.inflationRate,
                threshold: this.criticalThresholds.inflationRate
            });
        }
        
        // Check deflation
        if (metrics.economicHealth?.inflationRate < this.criticalThresholds.deflationRate) {
            alerts.push({
                type: 'deflation',
                severity: 'critical',
                value: metrics.economicHealth.inflationRate,
                threshold: this.criticalThresholds.deflationRate
            });
        }
        
        // Check liquidity crisis
        if (metrics.economicHealth?.liquidityRatio > this.criticalThresholds.liquidityRatio) {
            alerts.push({
                type: 'liquidity',
                severity: 'warning',
                value: metrics.economicHealth.liquidityRatio,
                threshold: this.criticalThresholds.liquidityRatio
            });
        }
        
        // Emit alerts
        for (const alert of alerts) {
            this.emit('criticalMetric', alert);
        }
    }

    /**
     * Get historical average for a metric
     */
    getHistoricalAverage(metricName, periods) {
        if (this.historicalData.length < periods) {
            return null;
        }
        
        const recentData = this.historicalData.slice(-periods);
        const values = recentData.map(d => d[metricName]).filter(v => v !== null);
        
        if (values.length === 0) return null;
        
        // Calculate averages for numeric properties
        const avg = {};
        for (const key in values[0]) {
            if (typeof values[0][key] === 'number') {
                avg[key] = values.reduce((sum, v) => sum + (v[key] || 0), 0) / values.length;
            }
        }
        
        return avg;
    }

    /**
     * Calculate Gini coefficient for wealth distribution
     */
    calculateGini(balances) {
        if (!balances || balances.length < 2) return 0;
        
        balances = balances.filter(b => b > 0).sort((a, b) => a - b);
        const n = balances.length;
        const sum = balances.reduce((a, b) => a + b, 0);
        
        if (sum === 0) return 0;
        
        let index = 0;
        for (let i = 0; i < n; i++) {
            index += (2 * (i + 1) - n - 1) * balances[i];
        }
        
        return index / (n * sum);
    }

    /**
     * Calculate market stability index
     */
    calculateStability() {
        if (this.historicalData.length < 10) return 1;
        
        const recentFlow = this.historicalData.slice(-10).map(d => d.tokenFlow?.netFlow || 0);
        const mean = recentFlow.reduce((a, b) => a + b, 0) / recentFlow.length;
        const variance = recentFlow.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / recentFlow.length;
        const stdDev = Math.sqrt(variance);
        
        // Stability is inverse of coefficient of variation (lower CV = higher stability)
        const cv = mean !== 0 ? stdDev / Math.abs(mean) : 0;
        return Math.max(0, 1 - cv);
    }

    /**
     * Calculate overall economic health score
     */
    calculateHealthScore(indicators) {
        let score = 100;
        
        // Penalize high inflation/deflation
        if (Math.abs(indicators.inflationRate) > 0.05) {
            score -= Math.abs(indicators.inflationRate) * 200;
        }
        
        // Penalize low liquidity
        if (indicators.liquidityRatio > 0.1) {
            score -= indicators.liquidityRatio * 300;
        }
        
        // Optimal velocity is around 1-3
        const velocityPenalty = Math.abs(indicators.velocity - 2) * 10;
        score -= velocityPenalty;
        
        return Math.max(0, Math.min(100, score));
    }

    /**
     * Get current metrics snapshot
     */
    getCurrentMetrics() {
        return this.lastMetrics;
    }

    /**
     * Get historical data
     */
    getHistoricalData(hours = 24) {
        const since = Date.now() - (hours * 60 * 60 * 1000);
        return this.historicalData.filter(d => d.timestamp.getTime() > since);
    }
}

module.exports = MetricsCollector;