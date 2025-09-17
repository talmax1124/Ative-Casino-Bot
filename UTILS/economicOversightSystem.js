/**
 * ECONOMIC OVERSIGHT SYSTEM
 * Advanced regulatory monitoring and automatic intervention system
 * Provides real-time economic surveillance and automated responses
 */

const dbManager = require('./database');
const logger = require('./logger');
const { fmt, sendLogMessage } = require('./common');
const robStatsManager = require('./robStatsManager');

class EconomicOversightSystem {
    constructor() {
        this.monitoringActive = true;
        this.interventionMode = 'AUTOMATIC'; // AUTOMATIC, MANUAL, DISABLED
        
        // Economic thresholds and limits
        this.thresholds = {
            // CRITICAL ECONOMIC INDICATORS
            maxHourlyLoss: 750000,           // $750K max loss per hour
            maxDailyLoss: 5000000,           // $5M max loss per day
            maxWeeklyLoss: 25000000,         // $25M max loss per week
            
            // PLAYER MONITORING
            suspiciousWinRate: 0.75,         // 75%+ win rate triggers investigation
            maxConsecutiveWins: 8,           // Max 8 wins in a row
            bigWinThreshold: 100000,         // $100K+ wins need validation
            
            // GAME INTEGRITY
            minExpectedHouseEdge: 0.02,      // 2% minimum house edge
            maxPayoutMultiplier: 75,         // 75x max payout on any game
            suspiciousPatternThreshold: 0.9, // 90% similarity in bet patterns
            
            // MONEY SUPPLY MONITORING
            maxDailyInflation: 0.05,         // 5% max daily money supply increase
            deflationAlertThreshold: -0.02,  // -2% money supply decrease
            velocityThreshold: 2.5,          // Money velocity warnings
            
            // ROBBERY OVERSIGHT
            maxRobberySuccessRate: 0.65,     // 65% max robbery success rate
            robberyVolumeLimit: 50,          // Max 50 robberies per hour server-wide
            coordinatedRobberyThreshold: 5,  // 5+ robbers targeting same victim
            
            // BETTING PATTERN ANALYSIS
            martingaleDetectionSensitivity: 0.85, // 85% confidence for martingale detection
            maxBetProgression: 16,           // Max 16x bet increase sequence
            suspiciousBetTimingThreshold: 0.95, // 95% similar timing patterns
        };
        
        // Real-time monitoring data
        this.liveData = {
            hourlyStats: {
                totalWagered: 0,
                totalPayouts: 0,
                netProfit: 0,
                gamesPlayed: 0,
                uniquePlayers: new Set(),
                bigWins: 0,
                suspiciousActivity: 0,
                resetTime: Date.now()
            },
            
            dailyStats: {
                totalVolume: 0,
                houseProfit: 0,
                playerProfit: 0,
                moneySupplyChange: 0,
                resetTime: Date.now()
            },
            
            activeAlerts: new Map(),
            interventions: [],
            suspiciousPlayers: new Set(),
            flaggedTransactions: []
        };
        
        // Automated response protocols
        this.responseProtocols = {
            YELLOW_ALERT: {
                level: 1,
                actions: ['log_incident', 'increase_monitoring'],
                autoResolve: true,
                escalationTime: 300000 // 5 minutes
            },
            
            ORANGE_ALERT: {
                level: 2,
                actions: ['log_incident', 'reduce_max_bets', 'increase_house_edge'],
                autoResolve: false,
                escalationTime: 180000 // 3 minutes
            },
            
            RED_ALERT: {
                level: 3,
                actions: ['emergency_shutdown', 'freeze_suspicious_accounts', 'admin_notification'],
                autoResolve: false,
                escalationTime: 60000 // 1 minute
            }
        };
        
        this.initialize();
    }

    /**
     * Initialize the economic oversight system
     */
    async initialize() {
        logger.info('🔍 Initializing Economic Oversight System...');
        
        try {
            // Setup monitoring intervals
            this.setupMonitoringIntervals();
            
            // Load historical baselines
            await this.loadHistoricalBaselines();
            
            // Initialize alert systems
            await this.initializeAlertSystems();
            
            logger.info('✅ Economic Oversight System initialized successfully');
            
            // Start real-time monitoring
            this.startRealTimeMonitoring();
            
        } catch (error) {
            logger.error(`Failed to initialize Economic Oversight System: ${error.message}`);
        }
    }

    /**
     * Setup monitoring intervals for different timeframes
     */
    setupMonitoringIntervals() {
        // Real-time monitoring (every 30 seconds)
        setInterval(() => {
            this.performRealTimeCheck();
        }, 30000);
        
        // Hourly analysis (every hour)
        setInterval(() => {
            this.performHourlyAnalysis();
        }, 60 * 60 * 1000);
        
        // Daily analysis (every 24 hours)
        setInterval(() => {
            this.performDailyAnalysis();
        }, 24 * 60 * 60 * 1000);
        
        // Pattern analysis (every 5 minutes)
        setInterval(() => {
            this.analyzePlayerPatterns();
        }, 5 * 60 * 1000);
        
        // Cleanup old data (every 6 hours)
        setInterval(() => {
            this.cleanupOldData();
        }, 6 * 60 * 60 * 1000);
    }

    /**
     * Real-time economic monitoring check
     */
    async performRealTimeCheck() {
        try {
            // Check current hourly stats
            await this.updateHourlyStats();
            
            // Monitor for immediate threats
            await this.checkImmediateThreats();
            
            // Validate ongoing games
            await this.validateActiveGames();
            
            // Update live dashboard metrics
            this.updateLiveMetrics();
            
        } catch (error) {
            logger.error(`Real-time check failed: ${error.message}`);
        }
    }

    /**
     * Update hourly statistics
     */
    async updateHourlyStats() {
        const now = Date.now();
        const hourlyData = this.liveData.hourlyStats;
        
        // Reset hourly stats if needed
        if (now - hourlyData.resetTime > 60 * 60 * 1000) {
            hourlyData.totalWagered = 0;
            hourlyData.totalPayouts = 0;
            hourlyData.netProfit = 0;
            hourlyData.gamesPlayed = 0;
            hourlyData.uniquePlayers.clear();
            hourlyData.bigWins = 0;
            hourlyData.suspiciousActivity = 0;
            hourlyData.resetTime = now;
            
            logger.debug('🔄 Hourly stats reset');
        }
        
        // Check if hourly loss exceeds threshold
        if (Math.abs(hourlyData.netProfit) > this.thresholds.maxHourlyLoss) {
            await this.triggerAlert('ORANGE_ALERT', 'EXCESSIVE_HOURLY_LOSS', {
                currentLoss: hourlyData.netProfit,
                threshold: this.thresholds.maxHourlyLoss,
                timeframe: 'hourly'
            });
        }
    }

    /**
     * Check for immediate economic threats
     */
    async checkImmediateThreats() {
        // Check for suspicious betting patterns
        await this.checkBettingPatterns();
        
        // Monitor robbery activity
        await this.monitorRobberyActivity();
        
        // Validate large transactions
        await this.validateLargeTransactions();
        
        // Check for coordinated attacks
        await this.detectCoordinatedAttacks();
    }

    /**
     * Monitor robbery activity for suspicious patterns
     */
    async monitorRobberyActivity() {
        try {
            const robStats = await robStatsManager.getGlobalRobStats();
            
            // Check robbery success rate
            if (robStats.averageSuccessRate > this.thresholds.maxRobberySuccessRate) {
                await this.triggerAlert('YELLOW_ALERT', 'HIGH_ROBBERY_SUCCESS_RATE', {
                    currentRate: robStats.averageSuccessRate,
                    threshold: this.thresholds.maxRobberySuccessRate
                });
            }
            
            // Check for robbery volume spikes
            const recentRobberies = await this.getRecentRobberyCount();
            if (recentRobberies > this.thresholds.robberyVolumeLimit) {
                await this.triggerAlert('ORANGE_ALERT', 'ROBBERY_VOLUME_SPIKE', {
                    recentCount: recentRobberies,
                    threshold: this.thresholds.robberyVolumeLimit,
                    timeframe: '1 hour'
                });
            }
            
        } catch (error) {
            logger.error(`Robbery monitoring failed: ${error.message}`);
        }
    }

    /**
     * Trigger an economic alert with automatic response
     */
    async triggerAlert(alertLevel, alertType, data) {
        const alertId = `${alertType}_${Date.now()}`;
        const alert = {
            id: alertId,
            level: alertLevel,
            type: alertType,
            data: data,
            timestamp: Date.now(),
            status: 'ACTIVE',
            actions: [],
            escalated: false
        };
        
        this.liveData.activeAlerts.set(alertId, alert);
        
        logger.warn(`🚨 ECONOMIC ALERT [${alertLevel}]: ${alertType}`, data);
        
        // Execute automated response
        await this.executeAutomatedResponse(alert);
        
        // Log to admin systems
        await this.logToAdminSystems(alert);
        
        return alertId;
    }

    /**
     * Execute automated response based on alert level
     */
    async executeAutomatedResponse(alert) {
        if (this.interventionMode !== 'AUTOMATIC') {
            logger.info(`⚠️ Alert ${alert.id} requires manual intervention (mode: ${this.interventionMode})`);
            return;
        }
        
        const protocol = this.responseProtocols[alert.level];
        if (!protocol) return;
        
        for (const action of protocol.actions) {
            try {
                await this.executeAction(action, alert);
                alert.actions.push({ action, timestamp: Date.now(), status: 'SUCCESS' });
            } catch (error) {
                logger.error(`Failed to execute action ${action}: ${error.message}`);
                alert.actions.push({ action, timestamp: Date.now(), status: 'FAILED', error: error.message });
            }
        }
        
        // Set auto-escalation timer if configured
        if (protocol.escalationTime && !protocol.autoResolve) {
            setTimeout(() => {
                this.escalateAlert(alert.id);
            }, protocol.escalationTime);
        }
    }

    /**
     * Execute specific intervention action
     */
    async executeAction(action, alert) {
        switch (action) {
            case 'log_incident':
                logger.warn(`📋 INCIDENT LOGGED: ${alert.type}`, alert.data);
                break;
                
            case 'increase_monitoring':
                // Increase monitoring frequency for affected areas
                this.intensifyMonitoring(alert.type);
                break;
                
            case 'reduce_max_bets':
                // Temporarily reduce maximum bet limits
                await this.adjustBetLimits('REDUCE', 0.5, '1 hour');
                break;
                
            case 'increase_house_edge':
                // Temporarily increase house edge to protect economy
                await this.adjustHouseEdge('INCREASE', 0.01, '30 minutes');
                break;
                
            case 'emergency_shutdown':
                // Initiate emergency economic shutdown
                await this.initiateEmergencyShutdown(alert);
                break;
                
            case 'freeze_suspicious_accounts':
                // Freeze accounts showing suspicious activity
                await this.freezeSuspiciousAccounts(alert);
                break;
                
            case 'admin_notification':
                // Send immediate notification to administrators
                await this.notifyAdministrators(alert);
                break;
                
            default:
                logger.warn(`Unknown action: ${action}`);
        }
    }

    /**
     * Perform hourly economic analysis
     */
    async performHourlyAnalysis() {
        try {
            logger.debug('📊 Performing hourly economic analysis...');
            
            // Analyze economic trends
            await this.analyzeEconomicTrends();
            
            // Check for pattern anomalies
            await this.detectPatternAnomalies();
            
            // Update risk assessments
            await this.updateRiskAssessments();
            
            // Generate hourly report
            await this.generateHourlyReport();
            
        } catch (error) {
            logger.error(`Hourly analysis failed: ${error.message}`);
        }
    }

    /**
     * Perform daily economic analysis
     */
    async performDailyAnalysis() {
        try {
            logger.info('📈 Performing daily economic analysis...');
            
            // Calculate daily metrics
            await this.calculateDailyMetrics();
            
            // Analyze money supply changes
            await this.analyzeMoneySupply();
            
            // Generate economic health report
            await this.generateEconomicHealthReport();
            
            // Archive daily data
            await this.archiveDailyData();
            
        } catch (error) {
            logger.error(`Daily analysis failed: ${error.message}`);
        }
    }

    /**
     * Get recent robbery count for volume monitoring
     */
    async getRecentRobberyCount() {
        try {
            const dbAdapter = dbManager.databaseAdapter;
            if (!dbAdapter) return 0;

            const [result] = await dbAdapter.pool.execute(`
                SELECT COUNT(*) as robbery_count
                FROM rob_stats 
                WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
            `);

            return parseInt(result[0]?.robbery_count || 0);
        } catch (error) {
            logger.error(`Failed to get recent robbery count: ${error.message}`);
            return 0;
        }
    }

    /**
     * Check betting patterns for suspicious activity
     */
    async checkBettingPatterns() {
        // This would integrate with existing game data to analyze patterns
        // For now, log that pattern analysis is active
        logger.debug('🔍 Analyzing betting patterns...');
    }

    /**
     * Validate large transactions
     */
    async validateLargeTransactions() {
        // Monitor recent large transactions for validation
        logger.debug('💰 Validating large transactions...');
    }

    /**
     * Detect coordinated attacks on the economy
     */
    async detectCoordinatedAttacks() {
        // Analyze for coordinated economic attacks
        logger.debug('⚔️ Scanning for coordinated attacks...');
    }

    /**
     * Start real-time monitoring
     */
    startRealTimeMonitoring() {
        logger.info('🔴 Real-time economic monitoring ACTIVE');
        
        // Create monitoring dashboard in logs
        setInterval(() => {
            if (this.liveData.activeAlerts.size > 0) {
                logger.info(`📊 ACTIVE ALERTS: ${this.liveData.activeAlerts.size} | SUSPICIOUS PLAYERS: ${this.liveData.suspiciousPlayers.size}`);
            }
        }, 5 * 60 * 1000); // Every 5 minutes
    }

    /**
     * Cleanup old monitoring data
     */
    cleanupOldData() {
        const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
        
        // Clean up resolved alerts
        for (const [alertId, alert] of this.liveData.activeAlerts.entries()) {
            if (alert.timestamp < cutoff && alert.status === 'RESOLVED') {
                this.liveData.activeAlerts.delete(alertId);
            }
        }
        
        // Clean up old interventions
        this.liveData.interventions = this.liveData.interventions.filter(
            intervention => intervention.timestamp > cutoff
        );
        
        logger.debug('🧹 Cleaned up old oversight data');
    }

    /**
     * Get current oversight status
     */
    getOversightStatus() {
        return {
            monitoringActive: this.monitoringActive,
            interventionMode: this.interventionMode,
            activeAlerts: this.liveData.activeAlerts.size,
            suspiciousPlayers: this.liveData.suspiciousPlayers.size,
            recentInterventions: this.liveData.interventions.length,
            lastUpdate: Date.now()
        };
    }

    /**
     * Load historical baselines (placeholder)
     */
    async loadHistoricalBaselines() {
        logger.debug('📚 Loading historical economic baselines...');
    }

    /**
     * Initialize alert systems (placeholder)
     */
    async initializeAlertSystems() {
        logger.debug('🚨 Initializing alert systems...');
    }

    /**
     * Additional analysis methods (placeholders for future implementation)
     */
    async analyzePlayerPatterns() { logger.debug('🎯 Analyzing player patterns...'); }
    async validateActiveGames() { logger.debug('🎮 Validating active games...'); }
    updateLiveMetrics() { logger.debug('📊 Updating live metrics...'); }
    async analyzeEconomicTrends() { logger.debug('📈 Analyzing economic trends...'); }
    async detectPatternAnomalies() { logger.debug('🔍 Detecting pattern anomalies...'); }
    async updateRiskAssessments() { logger.debug('⚖️ Updating risk assessments...'); }
    async generateHourlyReport() { logger.debug('📋 Generating hourly report...'); }
    async calculateDailyMetrics() { logger.debug('📊 Calculating daily metrics...'); }
    async analyzeMoneySupply() { logger.debug('💰 Analyzing money supply...'); }
    async generateEconomicHealthReport() { logger.debug('🏥 Generating economic health report...'); }
    async archiveDailyData() { logger.debug('📦 Archiving daily data...'); }
    intensifyMonitoring(alertType) { logger.debug(`🔍 Intensifying monitoring for ${alertType}...`); }
    async adjustBetLimits(direction, factor, duration) { logger.warn(`⚙️ Adjusting bet limits: ${direction} by ${factor} for ${duration}`); }
    async adjustHouseEdge(direction, amount, duration) { logger.warn(`🏠 Adjusting house edge: ${direction} by ${amount} for ${duration}`); }
    async initiateEmergencyShutdown(alert) { logger.error(`🚨 EMERGENCY SHUTDOWN INITIATED: ${alert.type}`); }
    async freezeSuspiciousAccounts(alert) { logger.warn(`🔒 Freezing suspicious accounts for ${alert.type}`); }
    async notifyAdministrators(alert) { logger.error(`📢 ADMIN NOTIFICATION: ${alert.type}`, alert.data); }
    async logToAdminSystems(alert) { logger.info(`📝 Logged to admin systems: ${alert.type}`); }
    escalateAlert(alertId) { logger.warn(`⬆️ Escalating alert: ${alertId}`); }
}

// Export singleton instance
module.exports = new EconomicOversightSystem();