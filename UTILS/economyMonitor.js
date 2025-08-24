/**
 * Self-Learning Economy Monitor for ATIVE Casino Bot
 * Tracks economy trends, detects abuse, and provides intelligent insights
 */

const dbManager = require('./database');
const { buildSessionEmbed } = require('./gameSessionKit');
const { formatMoneyFull, formatMoney, formatDelta } = require('./moneyFormatter');
const logger = require('./logger');

// Advanced Analytics & ML Imports
const { Matrix } = require('ml-matrix');
const ss = require('simple-statistics');
const regression = require('regression');
const KMeans = require('ml-kmeans');
const RandomForest = require('ml-random-forest');
const _ = require('lodash');

// Economy monitoring configuration
const MONITOR_CONFIG = {
    REPORT_CHANNEL_ID: '1409016191049142434',
    CHECK_INTERVALS: {
        QUICK: 5 * 60 * 1000,      // 5 minutes - for real-time monitoring
        HOURLY: 60 * 60 * 1000,     // 1 hour - for trend analysis
        DAILY: 24 * 60 * 60 * 1000  // 24 hours - for comprehensive reports
    },
    THRESHOLDS: {
        // Money velocity thresholds
        RAPID_GROWTH: 0.20,        // 20% growth in short period
        RAPID_DECLINE: -0.15,      // 15% decline in short period
        INFLATION_RATE: 0.05,      // 5% inflation per day is concerning
        
        // Abuse detection thresholds
        UNUSUAL_ACTIVITY_MULTIPLIER: 5,    // 5x normal activity
        WIN_RATE_ABUSE: 0.85,             // 85%+ win rate is suspicious
        CONSECUTIVE_WINS: 10,             // 10+ consecutive wins
        LARGE_TRANSACTION_RATIO: 0.75,    // 75% of wealth in single transaction
        
        // Economic health thresholds
        CONCENTRATION_RISK: 0.30,  // 30% of wealth held by top 5%
        VELOCITY_NORMAL_RANGE: [0.1, 2.0], // Normal money velocity range
        GINI_COEFFICIENT_HIGH: 0.7, // High inequality threshold
        
        // Advanced AI/ML thresholds
        ANOMALY_Z_SCORE: 3.0,      // Standard deviations for anomaly detection
        FRAUD_PROBABILITY: 0.75,   // ML model fraud probability threshold
        BEHAVIORAL_DEVIATION: 2.5,  // Behavioral pattern deviation threshold
        CLUSTERING_MIN_SAMPLES: 50, // Minimum samples for clustering analysis
        PREDICTION_CONFIDENCE: 0.8  // Minimum confidence for predictions
    }
};

class EconomyMonitor {
    constructor() {
        this.historicalData = new Map();
        this.userProfiles = new Map();
        this.economicMetrics = {
            totalMoney: 0,
            averageBalance: 0,
            medianBalance: 0,
            moneyVelocity: 0,
            inflationRate: 0,
            giniCoefficient: 0,
            topPlayerConcentration: 0,
            dailyTransactionVolume: 0,
            activeUsers: 0,
            newUsers: 0
        };
        this.alerts = [];
        this.trends = {
            growth: 'stable',
            inequality: 'stable',
            activity: 'stable'
        };
        
        // Advanced AI/ML components
        this.fraudDetectionModel = null;
        this.behavioralClusters = new Map();
        this.anomalyBaseline = new Map();
        this.predictionModel = null;
        this.userBehaviorProfiles = new Map();
        this.riskScores = new Map();
        this.patternDatabase = [];
        this.suspiciousPatterns = new Set();
        this.mlTrainingData = [];
        this.economicPredictions = new Map();
    }

    /**
     * Initialize the economy monitor
     */
    async initialize(client) {
        this.client = client;
        logger.info('Economy Monitor: Initializing...');
        
        // Load historical data
        await this.loadHistoricalData();
        
        // Initialize AI/ML components
        await this.initializeAIComponents();
        
        // Set up monitoring intervals
        this.setupMonitoringTasks();
        
        logger.info('Economy Monitor: Initialized successfully with AI/ML capabilities');
    }

    /**
     * Load historical economy data
     */
    async loadHistoricalData() {
        try {
            // Load last 30 days of data from Firebase
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            
            // Get economy snapshots if they exist
            const economyRef = dbManager.db.collection('economy_snapshots')
                .where('timestamp', '>=', thirtyDaysAgo)
                .orderBy('timestamp', 'desc')
                .limit(720); // Max 30 days * 24 hours
                
            const snapshot = await economyRef.get();
            
            snapshot.forEach(doc => {
                const data = doc.data();
                this.historicalData.set(data.timestamp, data);
            });
            
            logger.info(`Economy Monitor: Loaded ${snapshot.size} historical data points`);
        } catch (error) {
            logger.error(`Economy Monitor: Error loading historical data: ${error.message}`);
        }
    }

    /**
     * Set up periodic monitoring tasks
     */
    setupMonitoringTasks() {
        // Quick monitoring (5 minutes) - abuse detection
        setInterval(() => {
            this.performQuickCheck().catch(error => 
                logger.error(`Economy Monitor: Quick check failed: ${error.message}`)
            );
        }, MONITOR_CONFIG.CHECK_INTERVALS.QUICK);

        // Hourly monitoring - trend analysis
        setInterval(() => {
            this.performHourlyAnalysis().catch(error => 
                logger.error(`Economy Monitor: Hourly analysis failed: ${error.message}`)
            );
        }, MONITOR_CONFIG.CHECK_INTERVALS.HOURLY);

        // Daily monitoring - comprehensive report
        setInterval(() => {
            this.performDailyReport().catch(error => 
                logger.error(`Economy Monitor: Daily report failed: ${error.message}`)
            );
        }, MONITOR_CONFIG.CHECK_INTERVALS.DAILY);

        logger.info('Economy Monitor: Monitoring tasks scheduled');
    }

    /**
     * Perform quick abuse detection check
     */
    async performQuickCheck() {
        try {
            const suspiciousUsers = await this.detectSuspiciousActivity();
            
            if (suspiciousUsers.length > 0) {
                await this.sendAbuseAlert(suspiciousUsers);
            }
        } catch (error) {
            logger.error(`Economy Monitor: Quick check error: ${error.message}`);
        }
    }

    /**
     * Perform hourly trend analysis
     */
    async performHourlyAnalysis() {
        try {
            await this.calculateEconomicMetrics();
            await this.analyzeTrends();
            
            // Save snapshot
            await this.saveEconomySnapshot();
            
            const criticalIssues = this.identifyCriticalIssues();
            if (criticalIssues.length > 0) {
                await this.sendTrendAlert(criticalIssues);
            }
        } catch (error) {
            logger.error(`Economy Monitor: Hourly analysis error: ${error.message}`);
        }
    }

    /**
     * Perform comprehensive daily report
     */
    async performDailyReport() {
        try {
            await this.calculateEconomicMetrics();
            await this.analyzeTrends();
            await this.generateInsights();
            
            await this.sendDailyReport();
        } catch (error) {
            logger.error(`Economy Monitor: Daily report error: ${error.message}`);
        }
    }

    /**
     * Calculate current economic metrics
     */
    async calculateEconomicMetrics() {
        try {
            // Get all user balances
            const usersRef = dbManager.db.collection('user_balances');
            const usersSnapshot = await usersRef.get();
            
            const balances = [];
            let totalMoney = 0;
            let activeUsers = 0;
            
            // Calculate basic metrics
            usersSnapshot.forEach(doc => {
                const data = doc.data();
                const totalBalance = (data.wallet || 0) + (data.bank || 0);
                balances.push(totalBalance);
                totalMoney += totalBalance;
                
                if (data.last_activity && Date.now() - data.last_activity < 24 * 60 * 60 * 1000) {
                    activeUsers++;
                }
            });

            balances.sort((a, b) => a - b);

            this.economicMetrics.totalMoney = totalMoney;
            this.economicMetrics.averageBalance = balances.length > 0 ? totalMoney / balances.length : 0;
            this.economicMetrics.medianBalance = balances.length > 0 ? 
                balances[Math.floor(balances.length / 2)] : 0;
            this.economicMetrics.activeUsers = activeUsers;

            // Calculate Gini coefficient (inequality measure)
            this.economicMetrics.giniCoefficient = this.calculateGiniCoefficient(balances);

            // Calculate top player concentration
            const top5Percent = Math.ceil(balances.length * 0.05);
            const topPlayersWealth = balances.slice(-top5Percent).reduce((sum, balance) => sum + balance, 0);
            this.economicMetrics.topPlayerConcentration = totalMoney > 0 ? topPlayersWealth / totalMoney : 0;

            // Calculate money velocity (transactions per day)
            const dailyTransactions = await this.getDailyTransactionVolume();
            this.economicMetrics.dailyTransactionVolume = dailyTransactions;
            this.economicMetrics.moneyVelocity = totalMoney > 0 ? dailyTransactions / totalMoney : 0;

            // Calculate inflation rate
            await this.calculateInflationRate();

        } catch (error) {
            logger.error(`Economy Monitor: Metrics calculation error: ${error.message}`);
        }
    }

    /**
     * Calculate Gini coefficient for wealth inequality
     */
    calculateGiniCoefficient(sortedBalances) {
        if (sortedBalances.length === 0) return 0;
        
        let index = 1;
        let sum = 0;
        const n = sortedBalances.length;
        
        for (const balance of sortedBalances) {
            sum += (2 * index - n - 1) * balance;
            index++;
        }
        
        const totalWealth = sortedBalances.reduce((a, b) => a + b, 0);
        return totalWealth > 0 ? sum / (n * totalWealth) : 0;
    }

    /**
     * Get daily transaction volume
     */
    async getDailyTransactionVolume() {
        try {
            const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
            
            // Get game results from last 24 hours
            const gamesRef = dbManager.db.collection('game_results')
                .where('timestamp', '>=', oneDayAgo);
            const gamesSnapshot = await gamesRef.get();
            
            let volume = 0;
            gamesSnapshot.forEach(doc => {
                const data = doc.data();
                volume += (data.bet_amount || 0) + (data.winnings || 0);
            });
            
            return volume;
        } catch (error) {
            logger.error(`Economy Monitor: Transaction volume calculation error: ${error.message}`);
            return 0;
        }
    }

    /**
     * Calculate inflation rate based on money supply growth
     */
    async calculateInflationRate() {
        try {
            const yesterday = Date.now() - (24 * 60 * 60 * 1000);
            const historicalPoint = Array.from(this.historicalData.entries())
                .find(([timestamp]) => Math.abs(timestamp - yesterday) < 60 * 60 * 1000);
            
            if (historicalPoint) {
                const [, oldData] = historicalPoint;
                const oldTotal = oldData.totalMoney || 0;
                const currentTotal = this.economicMetrics.totalMoney;
                
                this.economicMetrics.inflationRate = oldTotal > 0 ? 
                    (currentTotal - oldTotal) / oldTotal : 0;
            } else {
                this.economicMetrics.inflationRate = 0;
            }
        } catch (error) {
            logger.error(`Economy Monitor: Inflation calculation error: ${error.message}`);
        }
    }

    /**
     * Analyze economic trends
     */
    async analyzeTrends() {
        const recent24h = this.getRecentData(24 * 60 * 60 * 1000);
        
        if (recent24h.length < 2) {
            this.trends = { growth: 'insufficient_data', inequality: 'insufficient_data', activity: 'insufficient_data' };
            return;
        }

        // Growth trend
        const growthRate = this.economicMetrics.inflationRate;
        if (growthRate > MONITOR_CONFIG.THRESHOLDS.RAPID_GROWTH) {
            this.trends.growth = 'rapid_growth';
        } else if (growthRate < MONITOR_CONFIG.THRESHOLDS.RAPID_DECLINE) {
            this.trends.growth = 'declining';
        } else if (Math.abs(growthRate) < 0.01) {
            this.trends.growth = 'stagnant';
        } else {
            this.trends.growth = 'stable';
        }

        // Inequality trend
        if (this.economicMetrics.giniCoefficient > MONITOR_CONFIG.THRESHOLDS.GINI_COEFFICIENT_HIGH) {
            this.trends.inequality = 'high_inequality';
        } else if (this.economicMetrics.topPlayerConcentration > MONITOR_CONFIG.THRESHOLDS.CONCENTRATION_RISK) {
            this.trends.inequality = 'wealth_concentration';
        } else {
            this.trends.inequality = 'stable';
        }

        // Activity trend
        const velocityInRange = this.economicMetrics.moneyVelocity >= MONITOR_CONFIG.THRESHOLDS.VELOCITY_NORMAL_RANGE[0] &&
                               this.economicMetrics.moneyVelocity <= MONITOR_CONFIG.THRESHOLDS.VELOCITY_NORMAL_RANGE[1];
        
        if (!velocityInRange && this.economicMetrics.moneyVelocity > MONITOR_CONFIG.THRESHOLDS.VELOCITY_NORMAL_RANGE[1]) {
            this.trends.activity = 'hyperactive';
        } else if (!velocityInRange && this.economicMetrics.moneyVelocity < MONITOR_CONFIG.THRESHOLDS.VELOCITY_NORMAL_RANGE[0]) {
            this.trends.activity = 'low_activity';
        } else {
            this.trends.activity = 'stable';
        }
    }

    /**
     * Get recent data points within timeframe
     */
    getRecentData(timeframe) {
        const cutoff = Date.now() - timeframe;
        return Array.from(this.historicalData.entries())
            .filter(([timestamp]) => timestamp >= cutoff)
            .sort(([a], [b]) => a - b);
    }

    /**
     * Detect suspicious user activity
     */
    async detectSuspiciousActivity() {
        const suspicious = [];
        
        try {
            // Get recent game results (last hour)
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            const gamesRef = dbManager.db.collection('game_results')
                .where('timestamp', '>=', oneHourAgo);
            const gamesSnapshot = await gamesRef.get();
            
            const userActivity = new Map();
            
            // Analyze each user's recent activity
            gamesSnapshot.forEach(doc => {
                const data = doc.data();
                const userId = data.user_id;
                
                if (!userActivity.has(userId)) {
                    userActivity.set(userId, {
                        games: [],
                        totalWagered: 0,
                        totalWon: 0,
                        winStreak: 0,
                        currentStreak: 0
                    });
                }
                
                const profile = userActivity.get(userId);
                profile.games.push(data);
                profile.totalWagered += data.bet_amount || 0;
                profile.totalWon += data.winnings || 0;
                
                // Track win streaks
                if (data.won) {
                    profile.currentStreak++;
                    profile.winStreak = Math.max(profile.winStreak, profile.currentStreak);
                } else {
                    profile.currentStreak = 0;
                }
            });
            
            // Check each user for suspicious patterns
            for (const [userId, activity] of userActivity) {
                const suspicionReasons = [];
                
                // Check win rate abuse
                const winRate = activity.games.length > 0 ? 
                    activity.games.filter(g => g.won).length / activity.games.length : 0;
                if (winRate >= MONITOR_CONFIG.THRESHOLDS.WIN_RATE_ABUSE && activity.games.length >= 5) {
                    suspicionReasons.push(`Suspicious win rate: ${(winRate * 100).toFixed(1)}%`);
                }
                
                // Check consecutive wins
                if (activity.winStreak >= MONITOR_CONFIG.THRESHOLDS.CONSECUTIVE_WINS) {
                    suspicionReasons.push(`${activity.winStreak} consecutive wins`);
                }
                
                // Check unusual activity volume
                if (activity.games.length >= MONITOR_CONFIG.THRESHOLDS.UNUSUAL_ACTIVITY_MULTIPLIER * 10) {
                    suspicionReasons.push(`Unusually high activity: ${activity.games.length} games in 1 hour`);
                }
                
                // Check profit ratio
                const profit = activity.totalWon - activity.totalWagered;
                const profitRatio = activity.totalWagered > 0 ? profit / activity.totalWagered : 0;
                if (profitRatio > 2.0 && activity.totalWagered > 10000) {
                    suspicionReasons.push(`Extremely high profit ratio: ${(profitRatio * 100).toFixed(1)}%`);
                }
                
                if (suspicionReasons.length > 0) {
                    suspicious.push({
                        userId,
                        reasons: suspicionReasons,
                        activity: activity,
                        riskLevel: suspicionReasons.length >= 3 ? 'HIGH' : 
                                  suspicionReasons.length >= 2 ? 'MEDIUM' : 'LOW'
                    });
                }
            }
            
        } catch (error) {
            logger.error(`Economy Monitor: Suspicious activity detection error: ${error.message}`);
        }
        
        return suspicious.sort((a, b) => {
            const riskOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
            return riskOrder[b.riskLevel] - riskOrder[a.riskLevel];
        });
    }

    /**
     * Identify critical economic issues
     */
    identifyCriticalIssues() {
        const issues = [];
        
        // Check for rapid growth
        if (this.trends.growth === 'rapid_growth') {
            issues.push({
                type: 'RAPID_INFLATION',
                severity: 'HIGH',
                message: `Economy is growing too rapidly (${(this.economicMetrics.inflationRate * 100).toFixed(1)}% daily inflation)`
            });
        }
        
        // Check for deflation
        if (this.trends.growth === 'declining') {
            issues.push({
                type: 'DEFLATION',
                severity: 'MEDIUM',
                message: `Economy is contracting (${(this.economicMetrics.inflationRate * 100).toFixed(1)}% daily deflation)`
            });
        }
        
        // Check for high inequality
        if (this.trends.inequality === 'high_inequality') {
            issues.push({
                type: 'WEALTH_INEQUALITY',
                severity: 'MEDIUM',
                message: `High wealth inequality detected (Gini: ${this.economicMetrics.giniCoefficient.toFixed(2)})`
            });
        }
        
        // Check for wealth concentration
        if (this.economicMetrics.topPlayerConcentration > MONITOR_CONFIG.THRESHOLDS.CONCENTRATION_RISK) {
            issues.push({
                type: 'WEALTH_CONCENTRATION',
                severity: 'MEDIUM',
                message: `Top 5% hold ${(this.economicMetrics.topPlayerConcentration * 100).toFixed(1)}% of total wealth`
            });
        }
        
        return issues;
    }

    /**
     * Generate AI-like insights about the economy
     */
    async generateInsights() {
        const insights = [];
        
        // Growth insights
        if (this.trends.growth === 'rapid_growth') {
            insights.push('💡 **Growth Analysis**: The economy is experiencing rapid expansion. Consider implementing money sinks or reducing payout rates to prevent inflation.');
        } else if (this.trends.growth === 'stagnant') {
            insights.push('💡 **Growth Analysis**: Economic growth has stagnated. Consider introducing new earning opportunities or events to stimulate activity.');
        }
        
        // Activity insights
        if (this.trends.activity === 'hyperactive') {
            insights.push('💡 **Activity Analysis**: Unusual spike in economic activity detected. Monitor for coordinated behavior or events driving increased participation.');
        } else if (this.trends.activity === 'low_activity') {
            insights.push('💡 **Activity Analysis**: Low economic activity observed. Consider engaging users with promotions, events, or new features.');
        }
        
        // Inequality insights
        if (this.trends.inequality === 'high_inequality') {
            insights.push('💡 **Distribution Analysis**: Wealth inequality is increasing. Consider implementing progressive taxation, wealth caps, or redistribution mechanisms.');
        }
        
        // Velocity insights
        const velocity = this.economicMetrics.moneyVelocity;
        if (velocity < 0.1) {
            insights.push('💡 **Velocity Analysis**: Money is moving slowly through the economy. Users may be hoarding wealth - consider incentivizing spending.');
        } else if (velocity > 2.0) {
            insights.push('💡 **Velocity Analysis**: Money is circulating very rapidly. This could indicate gambling addiction patterns or coordinated activity.');
        }
        
        this.insights = insights;
    }

    /**
     * Save current economy snapshot
     */
    async saveEconomySnapshot() {
        try {
            const snapshot = {
                timestamp: Date.now(),
                ...this.economicMetrics,
                trends: this.trends,
                insights: this.insights || []
            };
            
            await dbManager.db.collection('economy_snapshots').add(snapshot);
            this.historicalData.set(snapshot.timestamp, snapshot);
            
            // Keep only last 30 days of data
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            const keysToDelete = [];
            
            for (const [timestamp] of this.historicalData) {
                if (timestamp < thirtyDaysAgo) {
                    keysToDelete.push(timestamp);
                }
            }
            
            keysToDelete.forEach(key => this.historicalData.delete(key));
            
        } catch (error) {
            logger.error(`Economy Monitor: Snapshot save error: ${error.message}`);
        }
    }

    /**
     * Send abuse alert to monitoring channel
     */
    async sendAbuseAlert(suspiciousUsers) {
        if (!this.client) return;
        
        try {
            const channel = await this.client.channels.fetch(MONITOR_CONFIG.REPORT_CHANNEL_ID);
            if (!channel) return;
            
            const topFields = [
                { name: '🚨 ABUSE DETECTION ALERT', value: `Found ${suspiciousUsers.length} suspicious user(s)` }
            ];
            
            for (const user of suspiciousUsers.slice(0, 5)) { // Show top 5
                const userObj = await this.client.users.fetch(user.userId).catch(() => null);
                const username = userObj ? userObj.displayName : `User ${user.userId.slice(-4)}`;
                
                topFields.push({
                    name: `${user.riskLevel === 'HIGH' ? '🔴' : user.riskLevel === 'MEDIUM' ? '🟡' : '🟢'} ${username}`,
                    value: user.reasons.join('\n• '),
                    inline: true
                });
            }
            
            const embed = buildSessionEmbed({
                title: '🚨 Economy Monitor - Abuse Detection',
                topFields,
                stageText: 'IMMEDIATE ATTENTION REQUIRED',
                color: 0xFF0000,
                footer: 'Economy Monitor • Real-time Analysis'
            });
            
            await channel.send({ embeds: [embed] });
            
        } catch (error) {
            logger.error(`Economy Monitor: Abuse alert error: ${error.message}`);
        }
    }

    /**
     * Send trend alert to monitoring channel
     */
    async sendTrendAlert(criticalIssues) {
        if (!this.client) return;
        
        try {
            const channel = await this.client.channels.fetch(MONITOR_CONFIG.REPORT_CHANNEL_ID);
            if (!channel) return;
            
            const topFields = [
                { name: '⚠️ CRITICAL ECONOMIC ISSUES DETECTED', value: `${criticalIssues.length} issue(s) require attention` }
            ];
            
            criticalIssues.forEach(issue => {
                const emoji = issue.severity === 'HIGH' ? '🔴' : '🟡';
                topFields.push({
                    name: `${emoji} ${issue.type}`,
                    value: issue.message,
                    inline: false
                });
            });
            
            const embed = buildSessionEmbed({
                title: '⚠️ Economy Monitor - Critical Issues',
                topFields,
                stageText: 'TREND ANALYSIS ALERT',
                color: 0xFFAA00,
                footer: 'Economy Monitor • Hourly Analysis'
            });
            
            await channel.send({ embeds: [embed] });
            
        } catch (error) {
            logger.error(`Economy Monitor: Trend alert error: ${error.message}`);
        }
    }

    /**
     * Send comprehensive daily report
     */
    async sendDailyReport() {
        if (!this.client) return;
        
        try {
            const channel = await this.client.channels.fetch(MONITOR_CONFIG.REPORT_CHANNEL_ID);
            if (!channel) return;
            
            // Main metrics
            const topFields = [
                { name: '📊 DAILY ECONOMY REPORT', value: `Comprehensive analysis of the past 24 hours` },
                { name: 'Total Money Supply', value: formatMoneyFull(this.economicMetrics.totalMoney), inline: true },
                { name: 'Active Users', value: this.economicMetrics.activeUsers.toLocaleString(), inline: true },
                { name: 'Daily Inflation', value: `${(this.economicMetrics.inflationRate * 100).toFixed(2)}%`, inline: true }
            ];
            
            // Banking section with key metrics
            const bankFields = [
                { name: 'Average Balance', value: formatMoney(this.economicMetrics.averageBalance), inline: true },
                { name: 'Median Balance', value: formatMoney(this.economicMetrics.medianBalance), inline: true },
                { name: 'Money Velocity', value: this.economicMetrics.moneyVelocity.toFixed(3), inline: true },
                { name: 'Transaction Volume', value: formatMoney(this.economicMetrics.dailyTransactionVolume), inline: true },
                { name: 'Wealth Inequality', value: `${(this.economicMetrics.giniCoefficient * 100).toFixed(1)}%`, inline: true },
                { name: 'Top 5% Wealth', value: `${(this.economicMetrics.topPlayerConcentration * 100).toFixed(1)}%`, inline: true }
            ];
            
            // Determine overall status
            const hasHighRiskIssues = this.identifyCriticalIssues().some(i => i.severity === 'HIGH');
            const hasMediumRiskIssues = this.identifyCriticalIssues().some(i => i.severity === 'MEDIUM');
            
            let stageText = 'ECONOMY HEALTHY';
            let color = 0x00FF00;
            
            if (hasHighRiskIssues) {
                stageText = 'CRITICAL ISSUES DETECTED';
                color = 0xFF0000;
            } else if (hasMediumRiskIssues) {
                stageText = 'MONITORING REQUIRED';
                color = 0xFFAA00;
            }
            
            const embed = buildSessionEmbed({
                title: '📈 Economy Monitor - Daily Report',
                topFields,
                bankFields,
                stageText,
                color,
                footer: 'Economy Monitor • Daily Analysis'
            });
            
            await channel.send({ embeds: [embed] });
            
            // Send insights if available
            if (this.insights && this.insights.length > 0) {
                const insightEmbed = buildSessionEmbed({
                    title: '🤖 AI Economic Insights',
                    topFields: [
                        { name: 'Analysis & Recommendations', value: this.insights.join('\n\n') }
                    ],
                    stageText: 'INTELLIGENT ANALYSIS',
                    color: 0x00AAFF,
                    footer: 'Economy Monitor • AI Insights'
                });
                
                await channel.send({ embeds: [insightEmbed] });
            }
            
        } catch (error) {
            logger.error(`Economy Monitor: Daily report error: ${error.message}`);
        }
    }

    // ==================== ADVANCED AI/ML METHODS ====================

    /**
     * Initialize AI/ML components and models
     */
    async initializeAIComponents() {
        try {
            logger.info('Economy Monitor: Initializing AI/ML components...');
            
            // Initialize behavioral baseline
            await this.establishBehavioralBaseline();
            
            // Train fraud detection model if enough data exists
            await this.trainFraudDetectionModel();
            
            // Initialize user clustering
            await this.performBehavioralClustering();
            
            // Initialize anomaly detection baseline
            await this.establishAnomalyBaseline();
            
            logger.info('Economy Monitor: AI/ML components initialized');
            
        } catch (error) {
            logger.error(`Economy Monitor: AI initialization error: ${error.message}`);
        }
    }

    /**
     * Advanced statistical anomaly detection using Z-score analysis
     */
    async detectStatisticalAnomalies(userId) {
        try {
            const userRef = dbManager.db.collection('user_balances').doc(userId);
            const userDoc = await userRef.get();
            
            if (!userDoc.exists) return { isAnomaly: false, score: 0 };
            
            const userData = userDoc.data();
            const userHistory = await this.getUserTransactionHistory(userId, 30); // Last 30 days
            
            if (userHistory.length < 10) return { isAnomaly: false, score: 0 }; // Need minimum data
            
            // Calculate various metrics
            const dailyBalanceChanges = this.calculateDailyBalanceChanges(userHistory);
            const transactionAmounts = userHistory.map(t => Math.abs(t.amount));
            const winRates = this.calculateDailyWinRates(userHistory);
            
            // Statistical analysis using simple-statistics
            const balanceChangeStats = {
                mean: ss.mean(dailyBalanceChanges),
                standardDeviation: ss.standardDeviation(dailyBalanceChanges),
                median: ss.median(dailyBalanceChanges)
            };
            
            const transactionStats = {
                mean: ss.mean(transactionAmounts),
                standardDeviation: ss.standardDeviation(transactionAmounts),
                percentile95: ss.quantile(transactionAmounts, 0.95)
            };
            
            // Calculate Z-scores for anomaly detection
            const recentBalanceChange = dailyBalanceChanges[dailyBalanceChanges.length - 1] || 0;
            const recentTransactionAmount = transactionAmounts[transactionAmounts.length - 1] || 0;
            const recentWinRate = winRates[winRates.length - 1] || 0;
            
            const balanceZScore = Math.abs((recentBalanceChange - balanceChangeStats.mean) / balanceChangeStats.standardDeviation);
            const transactionZScore = Math.abs((recentTransactionAmount - transactionStats.mean) / transactionStats.standardDeviation);
            const winRateZScore = this.calculateWinRateZScore(recentWinRate, winRates);
            
            // Composite anomaly score
            const anomalyScore = Math.max(balanceZScore, transactionZScore, winRateZScore);
            const isAnomaly = anomalyScore > MONITOR_CONFIG.THRESHOLDS.ANOMALY_Z_SCORE;
            
            if (isAnomaly) {
                logger.warn(`Economy Monitor: Statistical anomaly detected for user ${userId} (Z-score: ${anomalyScore.toFixed(2)})`);
            }
            
            return {
                isAnomaly,
                score: anomalyScore,
                details: {
                    balanceZScore: balanceZScore.toFixed(2),
                    transactionZScore: transactionZScore.toFixed(2),
                    winRateZScore: winRateZScore.toFixed(2),
                    recentWinRate: (recentWinRate * 100).toFixed(1) + '%'
                }
            };
            
        } catch (error) {
            logger.error(`Economy Monitor: Statistical anomaly detection error: ${error.message}`);
            return { isAnomaly: false, score: 0 };
        }
    }

    /**
     * Machine Learning fraud detection using Random Forest
     */
    async detectMLFraud(userId) {
        try {
            if (!this.fraudDetectionModel) {
                return { isFraud: false, probability: 0, confidence: 0 };
            }
            
            const features = await this.extractUserFeatures(userId);
            if (!features) return { isFraud: false, probability: 0, confidence: 0 };
            
            // Predict using Random Forest model
            const prediction = this.fraudDetectionModel.predict([features]);
            const probability = prediction[0];
            
            const isFraud = probability > MONITOR_CONFIG.THRESHOLDS.FRAUD_PROBABILITY;
            const confidence = Math.abs(probability - 0.5) * 2; // Convert to confidence score
            
            if (isFraud) {
                logger.warn(`Economy Monitor: ML fraud detection triggered for user ${userId} (probability: ${(probability * 100).toFixed(1)}%)`);
            }
            
            return {
                isFraud,
                probability,
                confidence,
                features: features.slice(0, 5) // Return first 5 features for analysis
            };
            
        } catch (error) {
            logger.error(`Economy Monitor: ML fraud detection error: ${error.message}`);
            return { isFraud: false, probability: 0, confidence: 0 };
        }
    }

    /**
     * Behavioral pattern analysis and clustering
     */
    async performBehavioralClustering() {
        try {
            const allUsers = await this.getAllActiveUsers();
            if (allUsers.length < MONITOR_CONFIG.THRESHOLDS.CLUSTERING_MIN_SAMPLES) {
                logger.info('Economy Monitor: Not enough users for clustering analysis');
                return;
            }
            
            // Extract behavioral features for all users
            const behavioralFeatures = [];
            const userIds = [];
            
            for (const userId of allUsers) {
                const features = await this.extractUserFeatures(userId);
                if (features && features.length > 0) {
                    behavioralFeatures.push(features);
                    userIds.push(userId);
                }
            }
            
            if (behavioralFeatures.length < 10) return;
            
            // Perform K-means clustering
            const kmeans = new KMeans(behavioralFeatures, 5); // 5 behavioral clusters
            const clusters = kmeans.clusters;
            
            // Analyze clusters for suspicious patterns
            clusters.forEach((cluster, index) => {
                const clusterUsers = cluster.centroid;
                const avgWinRate = clusterUsers[2] || 0; // Win rate feature
                const avgTransactionSize = clusterUsers[1] || 0; // Transaction size feature
                
                // Identify suspicious clusters
                if (avgWinRate > 0.8 || avgTransactionSize > 100000) {
                    this.suspiciousPatterns.add(`cluster_${index}`);
                    logger.warn(`Economy Monitor: Suspicious behavioral cluster detected: ${index}`);
                }
            });
            
            // Store cluster assignments
            clusters.forEach((cluster, clusterIndex) => {
                cluster.indices.forEach(userIndex => {
                    const userId = userIds[userIndex];
                    this.behavioralClusters.set(userId, {
                        cluster: clusterIndex,
                        features: behavioralFeatures[userIndex],
                        suspiciousCluster: this.suspiciousPatterns.has(`cluster_${clusterIndex}`)
                    });
                });
            });
            
            logger.info(`Economy Monitor: Behavioral clustering completed for ${userIds.length} users`);
            
        } catch (error) {
            logger.error(`Economy Monitor: Behavioral clustering error: ${error.message}`);
        }
    }

    /**
     * Train fraud detection model using historical data
     */
    async trainFraudDetectionModel() {
        try {
            // Get known fraud cases and normal users
            const fraudData = await this.getHistoricalFraudData();
            const normalData = await this.getHistoricalNormalData();
            
            if (fraudData.length < 5 || normalData.length < 20) {
                logger.info('Economy Monitor: Insufficient data for fraud model training');
                return;
            }
            
            // Prepare training data
            const features = [];
            const labels = [];
            
            // Add fraud cases (label = 1)
            fraudData.forEach(data => {
                if (data.features && data.features.length > 0) {
                    features.push(data.features);
                    labels.push(1);
                }
            });
            
            // Add normal cases (label = 0)
            normalData.forEach(data => {
                if (data.features && data.features.length > 0) {
                    features.push(data.features);
                    labels.push(0);
                }
            });
            
            if (features.length < 25) {
                logger.info('Economy Monitor: Not enough features for model training');
                return;
            }
            
            // Train Random Forest model
            this.fraudDetectionModel = new RandomForest({
                nEstimators: 100,
                maxDepth: 10,
                minSamplesPerNode: 2
            });
            
            this.fraudDetectionModel.train(features, labels);
            
            // Store training data for model updates
            this.mlTrainingData = { features, labels, timestamp: Date.now() };
            
            logger.info(`Economy Monitor: Fraud detection model trained with ${features.length} samples`);
            
        } catch (error) {
            logger.error(`Economy Monitor: Fraud model training error: ${error.message}`);
        }
    }

    /**
     * Advanced pattern recognition for abuse detection
     */
    async detectAdvancedPatterns(userId) {
        try {
            const userHistory = await this.getUserTransactionHistory(userId, 14); // 2 weeks
            if (userHistory.length < 5) return { hasPattern: false, patterns: [] };
            
            const detectedPatterns = [];
            
            // Pattern 1: Consistent high win rate with increasing bet sizes
            const winRatePattern = this.detectWinRatePattern(userHistory);
            if (winRatePattern.suspicious) {
                detectedPatterns.push({
                    type: 'escalating_wins',
                    severity: 'HIGH',
                    description: `Consistent win rate of ${(winRatePattern.winRate * 100).toFixed(1)}% with escalating bet sizes`,
                    confidence: winRatePattern.confidence
                });
            }
            
            // Pattern 2: Rhythmic betting patterns (bot-like behavior)
            const rhythmPattern = this.detectRhythmicPattern(userHistory);
            if (rhythmPattern.suspicious) {
                detectedPatterns.push({
                    type: 'rhythmic_betting',
                    severity: 'MEDIUM',
                    description: `Bot-like timing patterns detected (${rhythmPattern.avgInterval}s intervals)`,
                    confidence: rhythmPattern.confidence
                });
            }
            
            // Pattern 3: Sudden behavioral shift
            const behaviorShift = this.detectBehavioralShift(userHistory);
            if (behaviorShift.suspicious) {
                detectedPatterns.push({
                    type: 'behavioral_shift',
                    severity: 'HIGH',
                    description: `Dramatic change in betting behavior detected at ${behaviorShift.shiftPoint}`,
                    confidence: behaviorShift.confidence
                });
            }
            
            // Pattern 4: Coordinated activity with other users
            const coordinationPattern = await this.detectCoordinatedActivity(userId, userHistory);
            if (coordinationPattern.suspicious) {
                detectedPatterns.push({
                    type: 'coordinated_activity',
                    severity: 'HIGH',
                    description: `Coordinated activity detected with ${coordinationPattern.relatedUsers.length} other users`,
                    confidence: coordinationPattern.confidence,
                    relatedUsers: coordinationPattern.relatedUsers
                });
            }
            
            return {
                hasPattern: detectedPatterns.length > 0,
                patterns: detectedPatterns,
                riskScore: this.calculatePatternRiskScore(detectedPatterns)
            };
            
        } catch (error) {
            logger.error(`Economy Monitor: Advanced pattern detection error: ${error.message}`);
            return { hasPattern: false, patterns: [] };
        }
    }

    /**
     * Economic health prediction using regression analysis
     */
    async predictEconomicTrends() {
        try {
            const historicalMetrics = this.getHistoricalMetrics(30); // 30 days
            if (historicalMetrics.length < 7) return null;
            
            // Prepare data for regression analysis
            const timePoints = historicalMetrics.map((_, index) => [index]);
            const totalMoneyPoints = historicalMetrics.map(m => m.totalMoney);
            const avgBalancePoints = historicalMetrics.map(m => m.averageBalance);
            const velocityPoints = historicalMetrics.map(m => m.moneyVelocity);
            
            // Perform linear regression for trend prediction
            const moneyTrendRegression = regression.linear(timePoints.map((x, i) => [x[0], totalMoneyPoints[i]]));
            const balanceTrendRegression = regression.linear(timePoints.map((x, i) => [x[0], avgBalancePoints[i]]));
            const velocityTrendRegression = regression.linear(timePoints.map((x, i) => [x[0], velocityPoints[i]]));
            
            // Predict next 7 days
            const predictions = [];
            for (let i = 1; i <= 7; i++) {
                const futurePoint = historicalMetrics.length + i;
                predictions.push({
                    day: i,
                    predictedTotalMoney: moneyTrendRegression.predict(futurePoint)[1],
                    predictedAvgBalance: balanceTrendRegression.predict(futurePoint)[1],
                    predictedVelocity: velocityTrendRegression.predict(futurePoint)[1]
                });
            }
            
            // Calculate trend confidence based on R-squared values
            const confidence = Math.min(
                moneyTrendRegression.r2,
                balanceTrendRegression.r2,
                velocityTrendRegression.r2
            );
            
            // Store predictions
            this.economicPredictions.set('weekly_forecast', {
                predictions,
                confidence,
                generated: Date.now(),
                trends: {
                    money: moneyTrendRegression.equation[0] > 0 ? 'growing' : 'declining',
                    balance: balanceTrendRegression.equation[0] > 0 ? 'growing' : 'declining',
                    velocity: velocityTrendRegression.equation[0] > 0 ? 'increasing' : 'decreasing'
                }
            });
            
            logger.info(`Economy Monitor: Economic trends predicted with ${(confidence * 100).toFixed(1)}% confidence`);
            
            return this.economicPredictions.get('weekly_forecast');
            
        } catch (error) {
            logger.error(`Economy Monitor: Economic prediction error: ${error.message}`);
            return null;
        }
    }

    // ==================== HELPER METHODS FOR AI/ML ====================

    /**
     * Extract behavioral features for ML analysis
     */
    async extractUserFeatures(userId) {
        try {
            const userHistory = await this.getUserTransactionHistory(userId, 30);
            if (userHistory.length < 3) return null;
            
            // Calculate comprehensive behavioral features
            const transactionAmounts = userHistory.map(t => Math.abs(t.amount));
            const timeBetweenTransactions = this.calculateTimeBetweenTransactions(userHistory);
            const winLossRatio = this.calculateWinLossRatio(userHistory);
            const gamePreferences = this.calculateGamePreferences(userHistory);
            const balanceProgression = this.calculateBalanceProgression(userHistory);
            
            return [
                ss.mean(transactionAmounts),              // Avg transaction size
                ss.standardDeviation(transactionAmounts), // Transaction volatility
                winLossRatio,                             // Win/loss ratio
                ss.mean(timeBetweenTransactions),         // Avg time between transactions
                ss.standardDeviation(timeBetweenTransactions), // Timing consistency
                gamePreferences.diversity,                // Game diversity score
                balanceProgression.slope,                 // Balance change trend
                userHistory.length,                       // Total transactions
                Math.max(...transactionAmounts),          // Max single transaction
                this.calculateConsistencyScore(userHistory) // Behavioral consistency
            ];
            
        } catch (error) {
            logger.error(`Economy Monitor: Feature extraction error: ${error.message}`);
            return null;
        }
    }

    /**
     * Establish behavioral baseline for users
     */
    async establishBehavioralBaseline() {
        try {
            const allUsers = await this.getAllActiveUsers();
            
            for (const userId of allUsers.slice(0, 100)) { // Limit for performance
                const features = await this.extractUserFeatures(userId);
                if (features) {
                    this.anomalyBaseline.set(userId, {
                        features,
                        established: Date.now(),
                        updateCount: 1
                    });
                }
            }
            
            logger.info(`Economy Monitor: Behavioral baseline established for ${this.anomalyBaseline.size} users`);
            
        } catch (error) {
            logger.error(`Economy Monitor: Baseline establishment error: ${error.message}`);
        }
    }

    /**
     * Enhanced suspicious activity detection with AI
     */
    async detectSuspiciousActivityAdvanced() {
        try {
            const allUsers = await this.getAllActiveUsers();
            const suspiciousUsers = [];
            
            for (const userId of allUsers) {
                // Run multiple detection algorithms
                const [statistical, mlFraud, patterns] = await Promise.all([
                    this.detectStatisticalAnomalies(userId),
                    this.detectMLFraud(userId),
                    this.detectAdvancedPatterns(userId)
                ]);
                
                // Calculate composite risk score
                let riskScore = 0;
                const reasons = [];
                
                if (statistical.isAnomaly) {
                    riskScore += statistical.score * 0.3;
                    reasons.push(`Statistical anomaly (Z-score: ${statistical.score.toFixed(2)})`);
                }
                
                if (mlFraud.isFraud) {
                    riskScore += mlFraud.probability * 0.4;
                    reasons.push(`ML fraud detection (${(mlFraud.probability * 100).toFixed(1)}% probability)`);
                }
                
                if (patterns.hasPattern) {
                    riskScore += patterns.riskScore * 0.3;
                    reasons.push(`Pattern analysis (${patterns.patterns.length} suspicious patterns)`);
                }
                
                // Add to suspicious list if high risk
                if (riskScore > 0.7) {
                    suspiciousUsers.push({
                        userId,
                        riskScore: riskScore.toFixed(3),
                        reasons,
                        details: {
                            statistical: statistical.details,
                            mlFraud: mlFraud.features,
                            patterns: patterns.patterns
                        },
                        timestamp: Date.now()
                    });
                }
                
                // Update risk scores
                this.riskScores.set(userId, {
                    score: riskScore,
                    lastUpdated: Date.now(),
                    components: { statistical, mlFraud, patterns }
                });
            }
            
            return suspiciousUsers;
            
        } catch (error) {
            logger.error(`Economy Monitor: Advanced suspicious activity detection error: ${error.message}`);
            return [];
        }
    }

    /**
     * Calculate time intervals between transactions
     */
    calculateTimeBetweenTransactions(userHistory) {
        if (userHistory.length < 2) return [0];
        
        const intervals = [];
        for (let i = 1; i < userHistory.length; i++) {
            const timeDiff = (userHistory[i].timestamp - userHistory[i-1].timestamp) / 1000; // seconds
            intervals.push(timeDiff);
        }
        return intervals;
    }

    /**
     * Calculate win/loss ratio
     */
    calculateWinLossRatio(userHistory) {
        let wins = 0, losses = 0;
        
        userHistory.forEach(transaction => {
            if (transaction.amount > 0) wins++;
            else if (transaction.amount < 0) losses++;
        });
        
        return losses === 0 ? wins : wins / losses;
    }

    /**
     * Calculate game preference diversity
     */
    calculateGamePreferences(userHistory) {
        const games = new Set();
        userHistory.forEach(t => {
            if (t.game) games.add(t.game);
        });
        
        return {
            diversity: games.size / Math.max(1, userHistory.length),
            uniqueGames: games.size
        };
    }

    /**
     * Calculate balance progression trend
     */
    calculateBalanceProgression(userHistory) {
        if (userHistory.length < 2) return { slope: 0, trend: 'stable' };
        
        let totalChange = 0;
        userHistory.forEach(transaction => {
            totalChange += transaction.amount;
        });
        
        const slope = totalChange / userHistory.length;
        const trend = slope > 100 ? 'growing' : slope < -100 ? 'declining' : 'stable';
        
        return { slope, trend, totalChange };
    }

    /**
     * Calculate behavioral consistency score
     */
    calculateConsistencyScore(userHistory) {
        if (userHistory.length < 5) return 0.5;
        
        const amounts = userHistory.map(t => Math.abs(t.amount));
        const intervals = this.calculateTimeBetweenTransactions(userHistory);
        
        const amountConsistency = 1 - (ss.standardDeviation(amounts) / ss.mean(amounts));
        const timingConsistency = 1 - (ss.standardDeviation(intervals) / ss.mean(intervals));
        
        return Math.max(0, Math.min(1, (amountConsistency + timingConsistency) / 2));
    }

    /**
     * Calculate daily balance changes
     */
    calculateDailyBalanceChanges(userHistory) {
        const dailyChanges = [];
        const dayGroups = {};
        
        userHistory.forEach(transaction => {
            const day = new Date(transaction.timestamp).toDateString();
            if (!dayGroups[day]) dayGroups[day] = 0;
            dayGroups[day] += transaction.amount;
        });
        
        Object.values(dayGroups).forEach(change => {
            dailyChanges.push(change);
        });
        
        return dailyChanges;
    }

    /**
     * Calculate daily win rates
     */
    calculateDailyWinRates(userHistory) {
        const dailyStats = {};
        
        userHistory.forEach(transaction => {
            const day = new Date(transaction.timestamp).toDateString();
            if (!dailyStats[day]) dailyStats[day] = { wins: 0, total: 0 };
            
            dailyStats[day].total++;
            if (transaction.amount > 0) dailyStats[day].wins++;
        });
        
        return Object.values(dailyStats).map(stats => stats.wins / stats.total);
    }

    /**
     * Calculate win rate Z-score
     */
    calculateWinRateZScore(recentWinRate, historicalWinRates) {
        if (historicalWinRates.length < 3) return 0;
        
        const mean = ss.mean(historicalWinRates);
        const stdDev = ss.standardDeviation(historicalWinRates);
        
        if (stdDev === 0) return 0;
        return Math.abs((recentWinRate - mean) / stdDev);
    }

    /**
     * Get user transaction history
     */
    async getUserTransactionHistory(userId, days = 30) {
        try {
            const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
            
            // Get transactions from Firebase
            const transactionsRef = dbManager.db.collection('user_transactions')
                .where('userId', '==', userId)
                .where('timestamp', '>=', cutoffTime)
                .orderBy('timestamp', 'desc')
                .limit(1000);
            
            const snapshot = await transactionsRef.get();
            const transactions = [];
            
            snapshot.forEach(doc => {
                transactions.push(doc.data());
            });
            
            return transactions;
            
        } catch (error) {
            logger.error(`Economy Monitor: Error getting transaction history: ${error.message}`);
            return [];
        }
    }

    /**
     * Get all active users
     */
    async getAllActiveUsers() {
        try {
            const usersRef = dbManager.db.collection('user_balances');
            const snapshot = await usersRef.get();
            
            const activeUsers = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const totalBalance = (data.wallet || 0) + (data.bank || 0);
                if (totalBalance > 0 || data.lastActive > Date.now() - (7 * 24 * 60 * 60 * 1000)) {
                    activeUsers.push(doc.id);
                }
            });
            
            return activeUsers;
            
        } catch (error) {
            logger.error(`Economy Monitor: Error getting active users: ${error.message}`);
            return [];
        }
    }

    /**
     * Get historical fraud data for ML training
     */
    async getHistoricalFraudData() {
        try {
            const fraudRef = dbManager.db.collection('fraud_cases')
                .where('confirmed', '==', true)
                .limit(100);
            
            const snapshot = await fraudRef.get();
            const fraudData = [];
            
            for (const doc of snapshot.docs) {
                const data = doc.data();
                const features = await this.extractUserFeatures(data.userId);
                if (features) {
                    fraudData.push({ userId: data.userId, features });
                }
            }
            
            return fraudData;
            
        } catch (error) {
            logger.error(`Economy Monitor: Error getting fraud data: ${error.message}`);
            return [];
        }
    }

    /**
     * Get historical normal user data for ML training
     */
    async getHistoricalNormalData() {
        try {
            const normalUsers = await this.getAllActiveUsers();
            const normalData = [];
            
            // Take a sample of normal users
            const sampleSize = Math.min(50, Math.floor(normalUsers.length * 0.1));
            const sample = _.sampleSize(normalUsers, sampleSize);
            
            for (const userId of sample) {
                const features = await this.extractUserFeatures(userId);
                if (features) {
                    normalData.push({ userId, features });
                }
            }
            
            return normalData;
            
        } catch (error) {
            logger.error(`Economy Monitor: Error getting normal data: ${error.message}`);
            return [];
        }
    }

    /**
     * Detect win rate patterns
     */
    detectWinRatePattern(userHistory) {
        if (userHistory.length < 10) return { suspicious: false };
        
        const recentHistory = userHistory.slice(0, 10);
        let wins = 0;
        let totalBetIncrease = 0;
        
        recentHistory.forEach((transaction, index) => {
            if (transaction.amount > 0) wins++;
            if (index > 0 && Math.abs(transaction.amount) > Math.abs(recentHistory[index - 1].amount)) {
                totalBetIncrease++;
            }
        });
        
        const winRate = wins / recentHistory.length;
        const suspicious = winRate > 0.8 && totalBetIncrease > 5;
        
        return {
            suspicious,
            winRate,
            confidence: suspicious ? 0.9 : 0.1
        };
    }

    /**
     * Detect rhythmic betting patterns
     */
    detectRhythmicPattern(userHistory) {
        if (userHistory.length < 15) return { suspicious: false };
        
        const intervals = this.calculateTimeBetweenTransactions(userHistory);
        const avgInterval = ss.mean(intervals);
        const stdDev = ss.standardDeviation(intervals);
        
        // Very consistent timing suggests automation
        const consistency = stdDev / avgInterval;
        const suspicious = consistency < 0.1 && avgInterval < 30; // Less than 30 seconds with low variance
        
        return {
            suspicious,
            avgInterval: avgInterval.toFixed(1),
            consistency,
            confidence: suspicious ? 0.8 : 0.2
        };
    }

    /**
     * Detect behavioral shifts
     */
    detectBehavioralShift(userHistory) {
        if (userHistory.length < 20) return { suspicious: false };
        
        const midpoint = Math.floor(userHistory.length / 2);
        const early = userHistory.slice(midpoint);
        const recent = userHistory.slice(0, midpoint);
        
        const earlyAvgBet = ss.mean(early.map(t => Math.abs(t.amount)));
        const recentAvgBet = ss.mean(recent.map(t => Math.abs(t.amount)));
        
        const betChange = (recentAvgBet - earlyAvgBet) / earlyAvgBet;
        const suspicious = Math.abs(betChange) > 5; // 500% change
        
        return {
            suspicious,
            shiftPoint: new Date(userHistory[midpoint].timestamp).toLocaleDateString(),
            betChange: (betChange * 100).toFixed(1) + '%',
            confidence: suspicious ? 0.85 : 0.15
        };
    }

    /**
     * Detect coordinated activity
     */
    async detectCoordinatedActivity(userId, userHistory) {
        try {
            if (userHistory.length < 10) return { suspicious: false, relatedUsers: [] };
            
            const userTransactionTimes = userHistory.map(t => t.timestamp);
            const allUsers = await this.getAllActiveUsers();
            const relatedUsers = [];
            
            // Check timing correlation with other users (simplified)
            for (const otherUserId of allUsers.slice(0, 50)) { // Limit for performance
                if (otherUserId === userId) continue;
                
                const otherHistory = await this.getUserTransactionHistory(otherUserId, 7);
                if (otherHistory.length < 5) continue;
                
                const otherTimes = otherHistory.map(t => t.timestamp);
                
                // Check for synchronized timing (within 60 seconds)
                let synchronizedCount = 0;
                userTransactionTimes.forEach(userTime => {
                    const hasSync = otherTimes.some(otherTime => 
                        Math.abs(userTime - otherTime) < 60000 // 60 seconds
                    );
                    if (hasSync) synchronizedCount++;
                });
                
                const syncRatio = synchronizedCount / userTransactionTimes.length;
                if (syncRatio > 0.3) { // 30% of transactions synchronized
                    relatedUsers.push(otherUserId);
                }
            }
            
            const suspicious = relatedUsers.length >= 2;
            
            return {
                suspicious,
                relatedUsers,
                confidence: suspicious ? 0.9 : 0.1
            };
            
        } catch (error) {
            logger.error(`Economy Monitor: Coordination detection error: ${error.message}`);
            return { suspicious: false, relatedUsers: [] };
        }
    }

    /**
     * Calculate pattern risk score
     */
    calculatePatternRiskScore(patterns) {
        let totalRisk = 0;
        patterns.forEach(pattern => {
            const severityMultiplier = pattern.severity === 'HIGH' ? 1.0 : 
                                     pattern.severity === 'MEDIUM' ? 0.6 : 0.3;
            totalRisk += pattern.confidence * severityMultiplier;
        });
        
        return Math.min(1.0, totalRisk);
    }

    /**
     * Get historical metrics for prediction
     */
    getHistoricalMetrics(days) {
        const metrics = [];
        const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
        
        this.historicalData.forEach((data, timestamp) => {
            if (timestamp >= cutoffTime) {
                metrics.push(data);
            }
        });
        
        return metrics.sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Replace old suspicious activity detection with AI-enhanced version
     */
    async detectSuspiciousActivity() {
        return await this.detectSuspiciousActivityAdvanced();
    }

    /**
     * Alias for establishBehavioralBaseline
     */
    async establishAnomalyBaseline() {
        return await this.establishBehavioralBaseline();
    }
}

// Create singleton instance
const economyMonitor = new EconomyMonitor();

module.exports = economyMonitor;