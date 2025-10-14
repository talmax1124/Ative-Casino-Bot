/**
 * 📊 ANALYTICS ENGINE
 * Advanced business intelligence and real-time analytics system
 * Provides comprehensive insights into gameplay, economics, and user behavior
 */

const EventEmitter = require('events');

class AnalyticsEngine extends EventEmitter {
    constructor() {
        super();
        
        if (AnalyticsEngine.instance) {
            return AnalyticsEngine.instance;
        }

        this.metricsCache = new Map();
        this.realtimeMetrics = new Map();
        this.alertThresholds = new Map();
        this.reportHistory = new Map();
        this.performanceMetrics = new Map();
        
        this.initializeDefaultThresholds();
        this.startRealtimeMonitoring();
        
        AnalyticsEngine.instance = this;
    }

    static getInstance() {
        if (!AnalyticsEngine.instance) {
            new AnalyticsEngine();
        }
        return AnalyticsEngine.instance;
    }

    initializeDefaultThresholds() {
        this.alertThresholds.set('house_edge_deviation', { min: -5, max: 15 });
        this.alertThresholds.set('win_rate_anomaly', { min: 30, max: 70 });
        this.alertThresholds.set('payout_volume_spike', { threshold: 200 });
        this.alertThresholds.set('user_loss_streak', { threshold: 10 });
        this.alertThresholds.set('game_frequency_spike', { threshold: 300 });
        this.alertThresholds.set('balance_distribution_skew', { threshold: 0.8 });
    }

    startRealtimeMonitoring() {
        setInterval(() => {
            this.updateRealtimeMetrics();
            this.checkAlertConditions();
            this.cleanupExpiredData();
        }, 30000);
    }

    async recordGameEvent(eventType, gameData) {
        const timestamp = Date.now();
        const eventId = `${eventType}_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
        
        const event = {
            id: eventId,
            type: eventType,
            timestamp,
            gameType: gameData.gameType,
            userId: gameData.userId,
            guildId: gameData.guildId,
            betAmount: gameData.betAmount,
            payout: gameData.payout || 0,
            won: gameData.won || false,
            houseEdge: gameData.houseEdge,
            playerTier: gameData.playerTier,
            gameId: gameData.gameId,
            sessionId: gameData.sessionId,
            metadata: gameData.metadata || {}
        };

        await this.storeEvent(event);
        this.updateRealtimeCounters(event);
        this.emit('gameEvent', event);

        return eventId;
    }

    async storeEvent(event) {
        const hourKey = `events_${Math.floor(event.timestamp / 3600000)}`;
        
        if (!this.metricsCache.has(hourKey)) {
            this.metricsCache.set(hourKey, []);
        }
        
        this.metricsCache.get(hourKey).push(event);
        
        if (this.metricsCache.get(hourKey).length > 1000) {
            const events = this.metricsCache.get(hourKey);
            await this.archiveEvents(hourKey, events);
            this.metricsCache.set(hourKey, events.slice(-200));
        }
    }

    updateRealtimeCounters(event) {
        const currentMinute = Math.floor(Date.now() / 60000);
        const minuteKey = `realtime_${currentMinute}`;
        
        if (!this.realtimeMetrics.has(minuteKey)) {
            this.realtimeMetrics.set(minuteKey, {
                games: 0,
                totalBets: 0,
                totalPayouts: 0,
                wins: 0,
                losses: 0,
                uniqueUsers: new Set(),
                gameTypes: new Map(),
                avgBetSize: 0,
                houseEdgeSum: 0
            });
        }
        
        const metrics = this.realtimeMetrics.get(minuteKey);
        metrics.games++;
        metrics.totalBets += event.betAmount;
        metrics.totalPayouts += event.payout;
        
        if (event.won) {
            metrics.wins++;
        } else {
            metrics.losses++;
        }
        
        metrics.uniqueUsers.add(event.userId);
        
        if (!metrics.gameTypes.has(event.gameType)) {
            metrics.gameTypes.set(event.gameType, 0);
        }
        metrics.gameTypes.set(event.gameType, metrics.gameTypes.get(event.gameType) + 1);
        
        metrics.avgBetSize = metrics.totalBets / metrics.games;
        metrics.houseEdgeSum += event.houseEdge || 0;
    }

    async getRealtimeMetrics() {
        const now = Date.now();
        const currentMinute = Math.floor(now / 60000);
        const last5Minutes = [];
        
        for (let i = 4; i >= 0; i--) {
            const minuteKey = `realtime_${currentMinute - i}`;
            const metrics = this.realtimeMetrics.get(minuteKey) || this.getEmptyMetrics();
            last5Minutes.push({
                minute: currentMinute - i,
                timestamp: (currentMinute - i) * 60000,
                ...this.processMetrics(metrics)
            });
        }
        
        return {
            current: last5Minutes[4],
            last5Minutes,
            summary: this.calculateSummaryMetrics(last5Minutes)
        };
    }

    processMetrics(rawMetrics) {
        return {
            games: rawMetrics.games,
            totalBets: rawMetrics.totalBets,
            totalPayouts: rawMetrics.totalPayouts,
            wins: rawMetrics.wins,
            losses: rawMetrics.losses,
            uniqueUsers: rawMetrics.uniqueUsers.size,
            gameTypes: Object.fromEntries(rawMetrics.gameTypes),
            avgBetSize: rawMetrics.avgBetSize,
            winRate: rawMetrics.games > 0 ? (rawMetrics.wins / rawMetrics.games * 100) : 0,
            houseEdge: rawMetrics.games > 0 ? (rawMetrics.houseEdgeSum / rawMetrics.games) : 0,
            profitMargin: rawMetrics.totalBets > 0 ? ((rawMetrics.totalBets - rawMetrics.totalPayouts) / rawMetrics.totalBets * 100) : 0
        };
    }

    calculateSummaryMetrics(last5Minutes) {
        const totals = last5Minutes.reduce((acc, minute) => {
            acc.games += minute.games;
            acc.totalBets += minute.totalBets;
            acc.totalPayouts += minute.totalPayouts;
            acc.wins += minute.wins;
            acc.losses += minute.losses;
            return acc;
        }, { games: 0, totalBets: 0, totalPayouts: 0, wins: 0, losses: 0 });
        
        return {
            ...totals,
            avgWinRate: totals.games > 0 ? (totals.wins / totals.games * 100) : 0,
            avgProfitMargin: totals.totalBets > 0 ? ((totals.totalBets - totals.totalPayouts) / totals.totalBets * 100) : 0,
            avgGamesPerMinute: totals.games / 5,
            trend: this.calculateTrend(last5Minutes)
        };
    }

    calculateTrend(data) {
        if (data.length < 2) return 'stable';
        
        const recent = data.slice(-2);
        const gamesChange = ((recent[1].games - recent[0].games) / Math.max(recent[0].games, 1)) * 100;
        
        if (gamesChange > 20) return 'increasing';
        if (gamesChange < -20) return 'decreasing';
        return 'stable';
    }

    async generateBusinessReport(timeframe = '24h', includeDetails = true) {
        const report = {
            id: `report_${Date.now()}`,
            generated: new Date().toISOString(),
            timeframe,
            summary: {},
            gameAnalysis: {},
            userAnalysis: {},
            economicAnalysis: {},
            securityAnalysis: {},
            recommendations: []
        };

        const events = await this.getEventsForTimeframe(timeframe);
        
        report.summary = this.analyzeSummaryMetrics(events);
        report.gameAnalysis = this.analyzeGamePerformance(events);
        report.userAnalysis = this.analyzeUserBehavior(events);
        report.economicAnalysis = this.analyzeEconomicMetrics(events);
        report.securityAnalysis = this.analyzeSecurityMetrics(events);
        report.recommendations = this.generateRecommendations(report);

        if (includeDetails) {
            report.details = {
                topGames: this.getTopPerformingGames(events),
                topUsers: this.getTopUsers(events),
                hourlyBreakdown: this.getHourlyBreakdown(events),
                riskFactors: this.identifyRiskFactors(events)
            };
        }

        this.reportHistory.set(report.id, report);
        this.emit('reportGenerated', report);
        
        return report;
    }

    analyzeSummaryMetrics(events) {
        const totalBets = events.reduce((sum, e) => sum + e.betAmount, 0);
        const totalPayouts = events.reduce((sum, e) => sum + e.payout, 0);
        const totalGames = events.length;
        const wins = events.filter(e => e.won).length;
        
        return {
            totalGames,
            totalBets,
            totalPayouts,
            grossRevenue: totalBets - totalPayouts,
            averageBet: totalBets / totalGames,
            winRate: (wins / totalGames) * 100,
            houseAdvantage: ((totalBets - totalPayouts) / totalBets) * 100,
            uniqueUsers: new Set(events.map(e => e.userId)).size,
            activeGuilds: new Set(events.map(e => e.guildId)).size
        };
    }

    analyzeGamePerformance(events) {
        const gameStats = {};
        
        events.forEach(event => {
            const game = event.gameType;
            if (!gameStats[game]) {
                gameStats[game] = {
                    games: 0,
                    bets: 0,
                    payouts: 0,
                    wins: 0,
                    houseEdgeSum: 0
                };
            }
            
            const stats = gameStats[game];
            stats.games++;
            stats.bets += event.betAmount;
            stats.payouts += event.payout;
            if (event.won) stats.wins++;
            stats.houseEdgeSum += event.houseEdge || 0;
        });
        
        Object.keys(gameStats).forEach(game => {
            const stats = gameStats[game];
            stats.winRate = (stats.wins / stats.games) * 100;
            stats.avgHouseEdge = stats.houseEdgeSum / stats.games;
            stats.profitability = ((stats.bets - stats.payouts) / stats.bets) * 100;
            stats.avgBet = stats.bets / stats.games;
            stats.popularity = (stats.games / events.length) * 100;
        });
        
        return gameStats;
    }

    analyzeUserBehavior(events) {
        const userStats = {};
        
        events.forEach(event => {
            const user = event.userId;
            if (!userStats[user]) {
                userStats[user] = {
                    games: 0,
                    totalBet: 0,
                    totalWon: 0,
                    winStreak: 0,
                    lossStreak: 0,
                    maxWinStreak: 0,
                    maxLossStreak: 0,
                    lastWin: false,
                    tier: event.playerTier,
                    gameTypes: new Set()
                };
            }
            
            const stats = userStats[user];
            stats.games++;
            stats.totalBet += event.betAmount;
            stats.totalWon += event.payout;
            stats.gameTypes.add(event.gameType);
            
            if (event.won) {
                if (stats.lastWin) {
                    stats.winStreak++;
                } else {
                    stats.winStreak = 1;
                    stats.lossStreak = 0;
                }
                stats.lastWin = true;
                stats.maxWinStreak = Math.max(stats.maxWinStreak, stats.winStreak);
            } else {
                if (!stats.lastWin) {
                    stats.lossStreak++;
                } else {
                    stats.lossStreak = 1;
                    stats.winStreak = 0;
                }
                stats.lastWin = false;
                stats.maxLossStreak = Math.max(stats.maxLossStreak, stats.lossStreak);
            }
        });
        
        const analysis = {
            totalUsers: Object.keys(userStats).length,
            averageGamesPerUser: events.length / Object.keys(userStats).length,
            highRiskUsers: [],
            topWinners: [],
            topLosers: [],
            tierDistribution: {}
        };
        
        Object.entries(userStats).forEach(([userId, stats]) => {
            stats.netResult = stats.totalWon - stats.totalBet;
            stats.winRate = (stats.games > 0) ? (stats.totalWon / stats.totalBet * 100) : 0;
            
            if (stats.maxLossStreak >= 8) {
                analysis.highRiskUsers.push({ userId, lossStreak: stats.maxLossStreak, games: stats.games });
            }
            
            if (!analysis.tierDistribution[stats.tier]) {
                analysis.tierDistribution[stats.tier] = 0;
            }
            analysis.tierDistribution[stats.tier]++;
        });
        
        analysis.topWinners = Object.entries(userStats)
            .sort(([,a], [,b]) => b.netResult - a.netResult)
            .slice(0, 10)
            .map(([userId, stats]) => ({ userId, netWin: stats.netResult, games: stats.games }));
            
        analysis.topLosers = Object.entries(userStats)
            .sort(([,a], [,b]) => a.netResult - b.netResult)
            .slice(0, 10)
            .map(([userId, stats]) => ({ userId, netLoss: Math.abs(stats.netResult), games: stats.games }));
        
        return analysis;
    }

    analyzeEconomicMetrics(events) {
        const hourlyRevenue = {};
        const dailyTrends = {};
        
        events.forEach(event => {
            const hour = new Date(event.timestamp).getHours();
            const day = new Date(event.timestamp).toDateString();
            
            if (!hourlyRevenue[hour]) {
                hourlyRevenue[hour] = { bets: 0, payouts: 0, games: 0 };
            }
            if (!dailyTrends[day]) {
                dailyTrends[day] = { bets: 0, payouts: 0, games: 0 };
            }
            
            hourlyRevenue[hour].bets += event.betAmount;
            hourlyRevenue[hour].payouts += event.payout;
            hourlyRevenue[hour].games++;
            
            dailyTrends[day].bets += event.betAmount;
            dailyTrends[day].payouts += event.payout;
            dailyTrends[day].games++;
        });
        
        const peakHour = Object.entries(hourlyRevenue)
            .reduce((peak, [hour, data]) => 
                data.games > peak.games ? { hour: parseInt(hour), games: data.games } : peak, 
                { hour: 0, games: 0 });
        
        return {
            hourlyRevenue,
            dailyTrends,
            peakHour: peakHour.hour,
            peakActivity: peakHour.games,
            economicHealth: this.calculateEconomicHealth(events)
        };
    }

    calculateEconomicHealth(events) {
        const totalBets = events.reduce((sum, e) => sum + e.betAmount, 0);
        const totalPayouts = events.reduce((sum, e) => sum + e.payout, 0);
        const profitMargin = ((totalBets - totalPayouts) / totalBets) * 100;
        
        let healthScore = 100;
        let status = 'excellent';
        
        if (profitMargin < 1) {
            healthScore = 20;
            status = 'critical';
        } else if (profitMargin < 3) {
            healthScore = 50;
            status = 'poor';
        } else if (profitMargin < 5) {
            healthScore = 70;
            status = 'fair';
        } else if (profitMargin < 8) {
            healthScore = 85;
            status = 'good';
        }
        
        return {
            score: healthScore,
            status,
            profitMargin,
            sustainability: profitMargin >= 3 ? 'sustainable' : 'at_risk'
        };
    }

    analyzeSecurityMetrics(events) {
        const suspiciousActivities = [];
        const userPatterns = {};
        
        events.forEach(event => {
            if (!userPatterns[event.userId]) {
                userPatterns[event.userId] = {
                    games: [],
                    totalBets: 0,
                    wins: 0,
                    avgTimeBetweenGames: 0
                };
            }
            
            userPatterns[event.userId].games.push(event);
            userPatterns[event.userId].totalBets += event.betAmount;
            if (event.won) userPatterns[event.userId].wins++;
        });
        
        Object.entries(userPatterns).forEach(([userId, pattern]) => {
            const winRate = (pattern.wins / pattern.games.length) * 100;
            const avgBet = pattern.totalBets / pattern.games.length;
            
            if (winRate > 75 && pattern.games.length > 20) {
                suspiciousActivities.push({
                    userId,
                    type: 'suspicious_win_rate',
                    winRate,
                    games: pattern.games.length,
                    severity: 'high'
                });
            }
            
            if (pattern.games.length > 100 && avgBet < 50) {
                suspiciousActivities.push({
                    userId,
                    type: 'potential_automation',
                    games: pattern.games.length,
                    avgBet,
                    severity: 'medium'
                });
            }
        });
        
        return {
            suspiciousActivities,
            riskLevel: suspiciousActivities.length > 5 ? 'high' : suspiciousActivities.length > 2 ? 'medium' : 'low',
            totalFlagged: suspiciousActivities.length
        };
    }

    generateRecommendations(report) {
        const recommendations = [];
        
        if (report.summary.houseAdvantage < 2) {
            recommendations.push({
                type: 'economic',
                priority: 'high',
                title: 'Increase House Edge',
                description: 'Current house advantage is below sustainable levels. Consider adjusting game multipliers.',
                impact: 'financial'
            });
        }
        
        if (report.userAnalysis.highRiskUsers.length > 10) {
            recommendations.push({
                type: 'user_experience',
                priority: 'medium',
                title: 'Implement Loss Protection',
                description: 'High number of users with extended loss streaks. Consider implementing break reminders.',
                impact: 'retention'
            });
        }
        
        if (report.securityAnalysis.riskLevel === 'high') {
            recommendations.push({
                type: 'security',
                priority: 'high',
                title: 'Enhanced Security Monitoring',
                description: 'Multiple suspicious activities detected. Implement stricter monitoring.',
                impact: 'security'
            });
        }
        
        const popularGame = Object.entries(report.gameAnalysis)
            .sort(([,a], [,b]) => b.popularity - a.popularity)[0];
            
        if (popularGame && popularGame[1].popularity > 60) {
            recommendations.push({
                type: 'game_balance',
                priority: 'low',
                title: 'Diversify Game Portfolio',
                description: `${popularGame[0]} dominates with ${popularGame[1].popularity.toFixed(1)}% of games. Promote other games.`,
                impact: 'engagement'
            });
        }
        
        return recommendations;
    }

    async getEventsForTimeframe(timeframe) {
        const now = Date.now();
        let startTime;
        
        switch (timeframe) {
            case '1h':
                startTime = now - (60 * 60 * 1000);
                break;
            case '24h':
                startTime = now - (24 * 60 * 60 * 1000);
                break;
            case '7d':
                startTime = now - (7 * 24 * 60 * 60 * 1000);
                break;
            default:
                startTime = now - (24 * 60 * 60 * 1000);
        }
        
        const relevantEvents = [];
        
        for (const [key, events] of this.metricsCache.entries()) {
            const hourTimestamp = parseInt(key.split('_')[1]) * 3600000;
            if (hourTimestamp >= startTime) {
                relevantEvents.push(...events.filter(e => e.timestamp >= startTime));
            }
        }
        
        return relevantEvents.sort((a, b) => a.timestamp - b.timestamp);
    }

    getEmptyMetrics() {
        return {
            games: 0,
            totalBets: 0,
            totalPayouts: 0,
            wins: 0,
            losses: 0,
            uniqueUsers: new Set(),
            gameTypes: new Map(),
            avgBetSize: 0,
            houseEdgeSum: 0
        };
    }

    checkAlertConditions() {
        const currentMetrics = this.getCurrentMetrics();
        
        Object.entries(currentMetrics).forEach(([metric, value]) => {
            const threshold = this.alertThresholds.get(metric);
            if (threshold && this.shouldTriggerAlert(metric, value, threshold)) {
                this.emit('alert', {
                    type: metric,
                    value,
                    threshold,
                    timestamp: Date.now(),
                    severity: this.calculateAlertSeverity(metric, value, threshold)
                });
            }
        });
    }

    getCurrentMetrics() {
        const currentMinute = Math.floor(Date.now() / 60000);
        const currentData = this.realtimeMetrics.get(`realtime_${currentMinute}`);
        
        if (!currentData) return {};
        
        return {
            win_rate_anomaly: currentData.games > 0 ? (currentData.wins / currentData.games * 100) : 0,
            game_frequency_spike: currentData.games,
            payout_volume_spike: (currentData.totalPayouts / Math.max(currentData.totalBets, 1)) * 100
        };
    }

    shouldTriggerAlert(metric, value, threshold) {
        if (threshold.min !== undefined && value < threshold.min) return true;
        if (threshold.max !== undefined && value > threshold.max) return true;
        if (threshold.threshold !== undefined && value > threshold.threshold) return true;
        return false;
    }

    calculateAlertSeverity(metric, value, threshold) {
        const deviation = Math.abs(value - (threshold.threshold || threshold.max || threshold.min));
        if (deviation > 50) return 'critical';
        if (deviation > 20) return 'high';
        if (deviation > 10) return 'medium';
        return 'low';
    }

    cleanupExpiredData() {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        const expiredMinutes = [];
        
        for (const [key] of this.realtimeMetrics.entries()) {
            const minuteTimestamp = parseInt(key.split('_')[1]) * 60000;
            if (minuteTimestamp < oneHourAgo) {
                expiredMinutes.push(key);
            }
        }
        
        expiredMinutes.forEach(key => this.realtimeMetrics.delete(key));
    }

    async archiveEvents(hourKey, events) {
        return Promise.resolve();
    }

    async exportData(format = 'json', timeframe = '24h') {
        const report = await this.generateBusinessReport(timeframe, true);
        
        switch (format.toLowerCase()) {
            case 'csv':
                return this.convertToCSV(report);
            case 'json':
                return JSON.stringify(report, null, 2);
            default:
                return JSON.stringify(report, null, 2);
        }
    }

    convertToCSV(report) {
        const headers = ['Metric', 'Value'];
        const rows = [
            ['Total Games', report.summary.totalGames],
            ['Total Bets', report.summary.totalBets],
            ['Total Payouts', report.summary.totalPayouts],
            ['Win Rate', `${report.summary.winRate.toFixed(2)}%`],
            ['House Advantage', `${report.summary.houseAdvantage.toFixed(2)}%`],
            ['Unique Users', report.summary.uniqueUsers],
            ['Economic Health', report.economicAnalysis.economicHealth.status]
        ];
        
        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    getPerformanceMetrics() {
        return {
            cacheSize: this.metricsCache.size,
            realtimeMetrics: this.realtimeMetrics.size,
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime(),
            alertsConfigured: this.alertThresholds.size
        };
    }

    setAlertThreshold(metric, threshold) {
        this.alertThresholds.set(metric, threshold);
        this.emit('thresholdUpdated', { metric, threshold });
    }

    getReportHistory() {
        return Array.from(this.reportHistory.values())
            .sort((a, b) => new Date(b.generated) - new Date(a.generated));
    }
}

module.exports = AnalyticsEngine;