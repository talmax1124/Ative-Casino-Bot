/**
 * ECONOMIC DASHBOARD - Unified Economic Intelligence Center
 * 
 * Provides comprehensive economic monitoring by combining:
 * - Enhanced Economic Analyzer
 * - Economic Oversight System  
 * - Trend Analysis System
 * - Real-time market intelligence
 * - Automated reporting and alerts
 */

const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');
const { fmt } = require('./common');

class EconomicDashboard {
    constructor() {
        this.config = {
            // Reporting intervals
            quickUpdateInterval: 60000,      // 1 minute
            standardReportInterval: 900000,  // 15 minutes  
            comprehensiveReportInterval: 3600000, // 1 hour
            dailySummaryInterval: 86400000,  // 24 hours
            
            // Alert thresholds
            criticalAlertThreshold: 0.95,    // 95% severity
            highAlertThreshold: 0.8,         // 80% severity
            mediumAlertThreshold: 0.6,       // 60% severity
            
            // Dashboard configuration
            maxAlertsDisplayed: 5,
            maxRecommendationsDisplayed: 3,
            historicalDataPoints: 24,        // 24 hours of data
            
            // Health score weights
            healthWeights: {
                systemStability: 0.3,
                economicHealth: 0.25,
                trendAnalysis: 0.2,
                oversightStatus: 0.15,
                userSafety: 0.1
            }
        };
        
        // Integrated systems
        this.systems = {
            economicAnalyzer: null,
            oversightSystem: null,
            trendAnalyzer: null,
            bulletproofEconomy: null
        };
        
        // Dashboard state
        this.dashboardState = {
            overallHealthScore: 0.8,
            systemStatus: 'OPERATIONAL',
            activeAlerts: new Map(),
            recentActivity: [],
            keyMetrics: {},
            lastUpdate: Date.now()
        };
        
        // Reporting history
        this.reportingHistory = {
            quickReports: [],
            standardReports: [],
            comprehensiveReports: [],
            dailySummaries: []
        };
        
        this.client = null;
        this.initialize();
    }
    
    /**
     * Initialize the economic dashboard
     */
    async initialize() {
        logger.info('🎛️ Initializing Economic Dashboard...');
        
        try {
            // Connect to integrated systems
            await this.connectToSystems();
            
            // Start monitoring
            this.startDashboardMonitoring();
            
            // Setup automated reporting
            this.setupAutomatedReporting();
            
            logger.info('✅ Economic Dashboard initialized successfully');
            
        } catch (error) {
            logger.error(`Failed to initialize Economic Dashboard: ${error.message}`);
        }
    }
    
    /**
     * Connect to all economic systems
     */
    async connectToSystems() {
        try {
            // Connect to BulletproofEconomyController
            const bulletproofEconomy = require('../BULLETPROOF_ECONOMY/BulletproofEconomyController');
            this.systems.bulletproofEconomy = bulletproofEconomy;
            
            // Get integrated systems
            this.systems.economicAnalyzer = bulletproofEconomy.economicAnalyzer;
            this.systems.oversightSystem = bulletproofEconomy.oversightSystem;
            this.systems.trendAnalyzer = bulletproofEconomy.trendAnalyzer;
            
            logger.info('🔗 Connected to economic systems');
            
        } catch (error) {
            logger.error(`Failed to connect to economic systems: ${error.message}`);
        }
    }
    
    /**
     * Set Discord client for reporting
     */
    setClient(client) {
        this.client = client;
        logger.info('🎛️ Economic Dashboard connected to Discord client');
    }
    
    /**
     * Start dashboard monitoring
     */
    startDashboardMonitoring() {
        // Quick updates for critical monitoring
        setInterval(() => {
            this.performQuickUpdate();
        }, this.config.quickUpdateInterval);
        
        // Health score recalculation
        setInterval(() => {
            this.updateHealthScore();
        }, 300000); // Every 5 minutes
        
        logger.info('📊 Dashboard monitoring started');
    }
    
    /**
     * Setup automated reporting
     */
    setupAutomatedReporting() {
        // Standard reports (15 minutes)
        setInterval(() => {
            this.sendStandardReport();
        }, this.config.standardReportInterval);
        
        // Comprehensive reports (1 hour)
        setInterval(() => {
            this.sendComprehensiveReport();
        }, this.config.comprehensiveReportInterval);
        
        // Daily summary (24 hours)
        setInterval(() => {
            this.sendDailySummary();
        }, this.config.dailySummaryInterval);
        
        logger.info('📋 Automated reporting setup complete');
    }
    
    /**
     * Perform quick dashboard update
     */
    async performQuickUpdate() {
        try {
            // Gather data from all systems
            const systemData = await this.gatherSystemData();
            
            // Update dashboard state
            await this.updateDashboardState(systemData);
            
            // Check for critical alerts
            await this.checkForCriticalAlerts(systemData);
            
            // Update key metrics
            this.updateKeyMetrics(systemData);
            
        } catch (error) {
            logger.error(`Quick update failed: ${error.message}`);
        }
    }
    
    /**
     * Gather data from all integrated systems
     */
    async gatherSystemData() {
        const data = {
            timestamp: Date.now(),
            bulletproofEconomy: null,
            economicAnalysis: null,
            oversight: null,
            trendAnalysis: null
        };
        
        try {
            // Get bulletproof economy data
            if (this.systems.bulletproofEconomy) {
                data.bulletproofEconomy = {
                    performanceMetrics: this.systems.bulletproofEconomy.performanceMetrics,
                    safeguards: this.systems.bulletproofEconomy.safeguards
                };
            }
            
            // Get economic analysis data
            if (this.systems.economicAnalyzer) {
                data.economicAnalysis = {
                    realTime: this.systems.economicAnalyzer.economicData?.realTime,
                    systemHealth: this.systems.economicAnalyzer.economicData?.longTerm?.systemHealth
                };
            }
            
            // Get oversight data
            if (this.systems.oversightSystem) {
                data.oversight = this.systems.oversightSystem.getOversightStatus();
            }
            
            // Get trend analysis data
            if (this.systems.trendAnalyzer) {
                data.trendAnalysis = this.systems.trendAnalyzer.getTrendSummary();
            }
            
        } catch (error) {
            logger.error(`Error gathering system data: ${error.message}`);
        }
        
        return data;
    }
    
    /**
     * Update overall dashboard state
     */
    async updateDashboardState(systemData) {
        // Update system status
        this.dashboardState.systemStatus = this.determineSystemStatus(systemData);
        
        // Update recent activity
        this.updateRecentActivity(systemData);
        
        // Update last update timestamp
        this.dashboardState.lastUpdate = Date.now();
    }
    
    /**
     * Update overall health score
     */
    async updateHealthScore() {
        try {
            const systemData = await this.gatherSystemData();
            const weights = this.config.healthWeights;
            
            let totalScore = 0;
            let totalWeight = 0;
            
            // System stability score
            if (systemData.bulletproofEconomy?.performanceMetrics?.systemStability) {
                totalScore += systemData.bulletproofEconomy.performanceMetrics.systemStability * weights.systemStability;
                totalWeight += weights.systemStability;
            }
            
            // Economic health score
            if (systemData.economicAnalysis?.systemHealth) {
                totalScore += systemData.economicAnalysis.systemHealth * weights.economicHealth;
                totalWeight += weights.economicHealth;
            }
            
            // Trend analysis score (based on active adjustments)
            const trendScore = this.calculateTrendHealthScore(systemData.trendAnalysis);
            totalScore += trendScore * weights.trendAnalysis;
            totalWeight += weights.trendAnalysis;
            
            // Oversight status score
            const oversightScore = this.calculateOversightHealthScore(systemData.oversight);
            totalScore += oversightScore * weights.oversightStatus;
            totalWeight += weights.oversightStatus;
            
            // User safety score (assume high unless issues detected)
            const userSafetyScore = 0.9; // Would be calculated based on user protection metrics
            totalScore += userSafetyScore * weights.userSafety;
            totalWeight += weights.userSafety;
            
            // Calculate final health score
            this.dashboardState.overallHealthScore = totalWeight > 0 ? totalScore / totalWeight : 0.8;
            
        } catch (error) {
            logger.error(`Error updating health score: ${error.message}`);
        }
    }
    
    /**
     * Send standard dashboard report
     */
    async sendStandardReport() {
        try {
            if (!this.client || !this.client.channels) return;
            
            const logChannelId = process.env.LOG_CHANNEL_ID;
            if (!logChannelId) return;
            
            const logChannel = await this.client.channels.fetch(logChannelId).catch(() => null);
            if (!logChannel) return;
            
            // Only send if there's significant activity or health concerns
            if (this.dashboardState.overallHealthScore >= 0.8 && this.dashboardState.activeAlerts.size === 0) {
                return; // System is healthy, skip routine report
            }
            
            const systemData = await this.gatherSystemData();
            
            const embed = new EmbedBuilder()
                .setTitle('🎛️ Economic Dashboard Update')
                .setDescription('Standard monitoring report')
                .setColor(this.getHealthColor(this.dashboardState.overallHealthScore))
                .setTimestamp();
            
            // Overall health
            embed.addFields({
                name: '💚 System Health',
                value: `Overall Score: **${(this.dashboardState.overallHealthScore * 100).toFixed(1)}%**\n` +
                       `Status: **${this.dashboardState.systemStatus}**`,
                inline: true
            });
            
            // Key metrics
            if (systemData.economicAnalysis?.realTime) {
                const realTime = systemData.economicAnalysis.realTime;
                embed.addFields({
                    name: '📊 Real-time Metrics',
                    value: `Volume: **${fmt(realTime.totalVolume || 0)}**\n` +
                           `Profit: **${fmt(realTime.hourlyProfit || 0)}**\n` +
                           `Games: **${realTime.activeGames || 0}**`,
                    inline: true
                });
            }
            
            // Active alerts
            if (this.dashboardState.activeAlerts.size > 0) {
                const alertsList = Array.from(this.dashboardState.activeAlerts.values())
                    .slice(0, 3)
                    .map(alert => `• ${alert.type} (${alert.severity})`)
                    .join('\n');
                
                embed.addFields({
                    name: '⚠️ Active Alerts',
                    value: alertsList,
                    inline: false
                });
            }
            
            await logChannel.send({ embeds: [embed] });
            
            // Store in history
            this.reportingHistory.standardReports.push({
                timestamp: Date.now(),
                healthScore: this.dashboardState.overallHealthScore,
                activeAlerts: this.dashboardState.activeAlerts.size
            });
            
            // Keep only recent history
            if (this.reportingHistory.standardReports.length > 100) {
                this.reportingHistory.standardReports.splice(0, 50);
            }
            
        } catch (error) {
            logger.error(`Error sending standard report: ${error.message}`);
        }
    }
    
    /**
     * Send comprehensive dashboard report
     */
    async sendComprehensiveReport() {
        try {
            if (!this.client || !this.client.channels) return;
            
            const logChannelId = process.env.LOG_CHANNEL_ID;
            if (!logChannelId) return;
            
            const logChannel = await this.client.channels.fetch(logChannelId).catch(() => null);
            if (!logChannel) return;
            
            const systemData = await this.gatherSystemData();
            
            const embed = new EmbedBuilder()
                .setTitle('📊 Comprehensive Economic Report')
                .setDescription('Detailed system analysis and health assessment')
                .setColor(this.getHealthColor(this.dashboardState.overallHealthScore))
                .setTimestamp();
            
            // System overview
            embed.addFields({
                name: '🏛️ System Overview',
                value: `Health Score: **${(this.dashboardState.overallHealthScore * 100).toFixed(1)}%**\n` +
                       `Status: **${this.dashboardState.systemStatus}**\n` +
                       `Active Alerts: **${this.dashboardState.activeAlerts.size}**`,
                inline: true
            });
            
            // Bulletproof economy metrics
            if (systemData.bulletproofEconomy?.performanceMetrics) {
                const metrics = systemData.bulletproofEconomy.performanceMetrics;
                embed.addFields({
                    name: '🛡️ Bulletproof Economy',
                    value: `Games Processed: **${metrics.totalGamesProcessed.toLocaleString()}**\n` +
                           `Total Profit: **${fmt(metrics.totalProfit)}**\n` +
                           `Avg House Edge: **${(metrics.averageHouseEdge * 100).toFixed(2)}%**`,
                    inline: true
                });
            }
            
            // Oversight system status
            if (systemData.oversight) {
                embed.addFields({
                    name: '🔍 Oversight System',
                    value: `Monitoring: **${systemData.oversight.monitoringActive ? 'Active' : 'Inactive'}**\n` +
                           `Intervention Mode: **${systemData.oversight.interventionMode}**\n` +
                           `Suspicious Players: **${systemData.oversight.suspiciousPlayers}**`,
                    inline: true
                });
            }
            
            // Trend analysis summary
            if (systemData.trendAnalysis) {
                const adjustmentCount = Object.keys(systemData.trendAnalysis.activeAdjustments || {}).length;
                embed.addFields({
                    name: '📈 Trend Analysis',
                    value: `Active Adjustments: **${adjustmentCount}**\n` +
                           `Choices Analyzed: **${systemData.trendAnalysis.totalChoicesAnalyzed?.toLocaleString() || 0}**\n` +
                           `Player Profiles: **${systemData.trendAnalysis.activePlayerProfiles || 0}**`,
                    inline: true
                });
            }
            
            // Performance recommendations
            const recommendations = this.generatePerformanceRecommendations(systemData);
            if (recommendations.length > 0) {
                embed.addFields({
                    name: '💡 Recommendations',
                    value: recommendations.slice(0, 3).map(rec => `• ${rec}`).join('\n'),
                    inline: false
                });
            }
            
            await logChannel.send({ embeds: [embed] });
            
        } catch (error) {
            logger.error(`Error sending comprehensive report: ${error.message}`);
        }
    }
    
    /**
     * Helper methods
     */
    getHealthColor(score) {
        if (score >= 0.8) return 0x00FF00; // Green
        if (score >= 0.6) return 0xFFFF00; // Yellow
        if (score >= 0.4) return 0xFF8000; // Orange
        return 0xFF0000; // Red
    }
    
    determineSystemStatus(systemData) {
        if (this.dashboardState.overallHealthScore >= 0.8) return 'OPTIMAL';
        if (this.dashboardState.overallHealthScore >= 0.6) return 'STABLE';
        if (this.dashboardState.overallHealthScore >= 0.4) return 'DEGRADED';
        return 'CRITICAL';
    }
    
    calculateTrendHealthScore(trendData) {
        if (!trendData) return 0.8;
        
        const adjustmentCount = Object.keys(trendData.activeAdjustments || {}).length;
        
        // Lower score if many adjustments are active (indicates issues)
        if (adjustmentCount === 0) return 0.9;
        if (adjustmentCount <= 2) return 0.8;
        if (adjustmentCount <= 5) return 0.6;
        return 0.4;
    }
    
    calculateOversightHealthScore(oversightData) {
        if (!oversightData) return 0.7;
        
        let score = 0.9;
        
        // Reduce score based on active alerts and suspicious activity
        if (oversightData.activeAlerts > 0) score -= oversightData.activeAlerts * 0.1;
        if (oversightData.suspiciousPlayers > 0) score -= oversightData.suspiciousPlayers * 0.05;
        
        return Math.max(0.3, score);
    }
    
    updateRecentActivity(systemData) {
        // Add recent activity entry
        this.dashboardState.recentActivity.push({
            timestamp: Date.now(),
            healthScore: this.dashboardState.overallHealthScore,
            alerts: this.dashboardState.activeAlerts.size,
            systemStatus: this.dashboardState.systemStatus
        });
        
        // Keep only recent activity (last 24 hours worth)
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        this.dashboardState.recentActivity = this.dashboardState.recentActivity.filter(
            activity => activity.timestamp > cutoff
        );
    }
    
    updateKeyMetrics(systemData) {
        this.dashboardState.keyMetrics = {
            lastUpdate: Date.now(),
            totalVolume: systemData.economicAnalysis?.realTime?.totalVolume || 0,
            totalProfit: systemData.economicAnalysis?.realTime?.hourlyProfit || 0,
            activeGames: systemData.economicAnalysis?.realTime?.activeGames || 0,
            systemStability: systemData.bulletproofEconomy?.performanceMetrics?.systemStability || 0.8
        };
    }
    
    async checkForCriticalAlerts(systemData) {
        // Check for critical health score
        if (this.dashboardState.overallHealthScore < 0.4) {
            this.dashboardState.activeAlerts.set('critical_health', {
                type: 'Critical Health Score',
                severity: 'CRITICAL',
                score: this.dashboardState.overallHealthScore,
                timestamp: Date.now()
            });
        }
        
        // Check for system instability
        if (systemData.bulletproofEconomy?.performanceMetrics?.systemStability < 0.5) {
            this.dashboardState.activeAlerts.set('system_instability', {
                type: 'System Instability',
                severity: 'HIGH',
                stability: systemData.bulletproofEconomy.performanceMetrics.systemStability,
                timestamp: Date.now()
            });
        }
    }
    
    generatePerformanceRecommendations(systemData) {
        const recommendations = [];
        
        if (this.dashboardState.overallHealthScore < 0.7) {
            recommendations.push('System health below optimal - consider review of economic parameters');
        }
        
        if (systemData.oversight?.activeAlerts > 3) {
            recommendations.push('Multiple oversight alerts active - investigate potential economic threats');
        }
        
        const adjustmentCount = Object.keys(systemData.trendAnalysis?.activeAdjustments || {}).length;
        if (adjustmentCount > 5) {
            recommendations.push('High number of trend adjustments - review player behavior patterns');
        }
        
        return recommendations;
    }
    
    async sendDailySummary() {
        // Implementation for daily summary report
        logger.info('📅 Sending daily economic summary...');
    }
}

module.exports = EconomicDashboard;