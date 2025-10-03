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
    setClient(client) {\n        this.client = client;\n        logger.info('🎛️ Economic Dashboard connected to Discord client');\n    }\n    \n    /**\n     * Start dashboard monitoring\n     */\n    startDashboardMonitoring() {\n        // Quick updates for critical monitoring\n        setInterval(() => {\n            this.performQuickUpdate();\n        }, this.config.quickUpdateInterval);\n        \n        // Health score recalculation\n        setInterval(() => {\n            this.updateHealthScore();\n        }, 300000); // Every 5 minutes\n        \n        logger.info('📊 Dashboard monitoring started');\n    }\n    \n    /**\n     * Setup automated reporting\n     */\n    setupAutomatedReporting() {\n        // Standard reports (15 minutes)\n        setInterval(() => {\n            this.sendStandardReport();\n        }, this.config.standardReportInterval);\n        \n        // Comprehensive reports (1 hour)\n        setInterval(() => {\n            this.sendComprehensiveReport();\n        }, this.config.comprehensiveReportInterval);\n        \n        // Daily summary (24 hours)\n        setInterval(() => {\n            this.sendDailySummary();\n        }, this.config.dailySummaryInterval);\n        \n        logger.info('📋 Automated reporting setup complete');\n    }\n    \n    /**\n     * Perform quick dashboard update\n     */\n    async performQuickUpdate() {\n        try {\n            // Gather data from all systems\n            const systemData = await this.gatherSystemData();\n            \n            // Update dashboard state\n            await this.updateDashboardState(systemData);\n            \n            // Check for critical alerts\n            await this.checkForCriticalAlerts(systemData);\n            \n            // Update key metrics\n            this.updateKeyMetrics(systemData);\n            \n        } catch (error) {\n            logger.error(`Quick update failed: ${error.message}`);\n        }\n    }\n    \n    /**\n     * Gather data from all integrated systems\n     */\n    async gatherSystemData() {\n        const data = {\n            timestamp: Date.now(),\n            bulletproofEconomy: null,\n            economicAnalysis: null,\n            oversight: null,\n            trendAnalysis: null\n        };\n        \n        try {\n            // Get bulletproof economy data\n            if (this.systems.bulletproofEconomy) {\n                data.bulletproofEconomy = {\n                    performanceMetrics: this.systems.bulletproofEconomy.performanceMetrics,\n                    safeguards: this.systems.bulletproofEconomy.safeguards\n                };\n            }\n            \n            // Get economic analysis data\n            if (this.systems.economicAnalyzer) {\n                data.economicAnalysis = {\n                    realTime: this.systems.economicAnalyzer.economicData?.realTime,\n                    systemHealth: this.systems.economicAnalyzer.economicData?.longTerm?.systemHealth\n                };\n            }\n            \n            // Get oversight data\n            if (this.systems.oversightSystem) {\n                data.oversight = this.systems.oversightSystem.getOversightStatus();\n            }\n            \n            // Get trend analysis data\n            if (this.systems.trendAnalyzer) {\n                data.trendAnalysis = this.systems.trendAnalyzer.getTrendSummary();\n            }\n            \n        } catch (error) {\n            logger.error(`Error gathering system data: ${error.message}`);\n        }\n        \n        return data;\n    }\n    \n    /**\n     * Update overall dashboard state\n     */\n    async updateDashboardState(systemData) {\n        // Update system status\n        this.dashboardState.systemStatus = this.determineSystemStatus(systemData);\n        \n        // Update recent activity\n        this.updateRecentActivity(systemData);\n        \n        // Update last update timestamp\n        this.dashboardState.lastUpdate = Date.now();\n    }\n    \n    /**\n     * Update overall health score\n     */\n    async updateHealthScore() {\n        try {\n            const systemData = await this.gatherSystemData();\n            const weights = this.config.healthWeights;\n            \n            let totalScore = 0;\n            let totalWeight = 0;\n            \n            // System stability score\n            if (systemData.bulletproofEconomy?.performanceMetrics?.systemStability) {\n                totalScore += systemData.bulletproofEconomy.performanceMetrics.systemStability * weights.systemStability;\n                totalWeight += weights.systemStability;\n            }\n            \n            // Economic health score\n            if (systemData.economicAnalysis?.systemHealth) {\n                totalScore += systemData.economicAnalysis.systemHealth * weights.economicHealth;\n                totalWeight += weights.economicHealth;\n            }\n            \n            // Trend analysis score (based on active adjustments)\n            const trendScore = this.calculateTrendHealthScore(systemData.trendAnalysis);\n            totalScore += trendScore * weights.trendAnalysis;\n            totalWeight += weights.trendAnalysis;\n            \n            // Oversight status score\n            const oversightScore = this.calculateOversightHealthScore(systemData.oversight);\n            totalScore += oversightScore * weights.oversightStatus;\n            totalWeight += weights.oversightStatus;\n            \n            // User safety score (assume high unless issues detected)\n            const userSafetyScore = 0.9; // Would be calculated based on user protection metrics\n            totalScore += userSafetyScore * weights.userSafety;\n            totalWeight += weights.userSafety;\n            \n            // Calculate final health score\n            this.dashboardState.overallHealthScore = totalWeight > 0 ? totalScore / totalWeight : 0.8;\n            \n        } catch (error) {\n            logger.error(`Error updating health score: ${error.message}`);\n        }\n    }\n    \n    /**\n     * Send standard dashboard report\n     */\n    async sendStandardReport() {\n        try {\n            if (!this.client || !this.client.channels) return;\n            \n            const logChannelId = process.env.LOG_CHANNEL_ID;\n            if (!logChannelId) return;\n            \n            const logChannel = await this.client.channels.fetch(logChannelId).catch(() => null);\n            if (!logChannel) return;\n            \n            // Only send if there's significant activity or health concerns\n            if (this.dashboardState.overallHealthScore >= 0.8 && this.dashboardState.activeAlerts.size === 0) {\n                return; // System is healthy, skip routine report\n            }\n            \n            const systemData = await this.gatherSystemData();\n            \n            const embed = new EmbedBuilder()\n                .setTitle('🎛️ Economic Dashboard Update')\n                .setDescription('Standard monitoring report')\n                .setColor(this.getHealthColor(this.dashboardState.overallHealthScore))\n                .setTimestamp();\n            \n            // Overall health\n            embed.addFields({\n                name: '💚 System Health',\n                value: `Overall Score: **${(this.dashboardState.overallHealthScore * 100).toFixed(1)}%**\\n` +\n                       `Status: **${this.dashboardState.systemStatus}**`,\n                inline: true\n            });\n            \n            // Key metrics\n            if (systemData.economicAnalysis?.realTime) {\n                const realTime = systemData.economicAnalysis.realTime;\n                embed.addFields({\n                    name: '📊 Real-time Metrics',\n                    value: `Volume: **${fmt(realTime.totalVolume || 0)}**\\n` +\n                           `Profit: **${fmt(realTime.hourlyProfit || 0)}**\\n` +\n                           `Games: **${realTime.activeGames || 0}**`,\n                    inline: true\n                });\n            }\n            \n            // Active alerts\n            if (this.dashboardState.activeAlerts.size > 0) {\n                const alertsList = Array.from(this.dashboardState.activeAlerts.values())\n                    .slice(0, 3)\n                    .map(alert => `• ${alert.type} (${alert.severity})`)\n                    .join('\\n');\n                \n                embed.addFields({\n                    name: '⚠️ Active Alerts',\n                    value: alertsList,\n                    inline: false\n                });\n            }\n            \n            await logChannel.send({ embeds: [embed] });\n            \n            // Store in history\n            this.reportingHistory.standardReports.push({\n                timestamp: Date.now(),\n                healthScore: this.dashboardState.overallHealthScore,\n                activeAlerts: this.dashboardState.activeAlerts.size\n            });\n            \n            // Keep only recent history\n            if (this.reportingHistory.standardReports.length > 100) {\n                this.reportingHistory.standardReports.splice(0, 50);\n            }\n            \n        } catch (error) {\n            logger.error(`Error sending standard report: ${error.message}`);\n        }\n    }\n    \n    /**\n     * Send comprehensive dashboard report\n     */\n    async sendComprehensiveReport() {\n        try {\n            if (!this.client || !this.client.channels) return;\n            \n            const logChannelId = process.env.LOG_CHANNEL_ID;\n            if (!logChannelId) return;\n            \n            const logChannel = await this.client.channels.fetch(logChannelId).catch(() => null);\n            if (!logChannel) return;\n            \n            const systemData = await this.gatherSystemData();\n            \n            const embed = new EmbedBuilder()\n                .setTitle('📊 Comprehensive Economic Report')\n                .setDescription('Detailed system analysis and health assessment')\n                .setColor(this.getHealthColor(this.dashboardState.overallHealthScore))\n                .setTimestamp();\n            \n            // System overview\n            embed.addFields({\n                name: '🏛️ System Overview',\n                value: `Health Score: **${(this.dashboardState.overallHealthScore * 100).toFixed(1)}%**\\n` +\n                       `Status: **${this.dashboardState.systemStatus}**\\n` +\n                       `Active Alerts: **${this.dashboardState.activeAlerts.size}**`,\n                inline: true\n            });\n            \n            // Bulletproof economy metrics\n            if (systemData.bulletproofEconomy?.performanceMetrics) {\n                const metrics = systemData.bulletproofEconomy.performanceMetrics;\n                embed.addFields({\n                    name: '🛡️ Bulletproof Economy',\n                    value: `Games Processed: **${metrics.totalGamesProcessed.toLocaleString()}**\\n` +\n                           `Total Profit: **${fmt(metrics.totalProfit)}**\\n` +\n                           `Avg House Edge: **${(metrics.averageHouseEdge * 100).toFixed(2)}%**`,\n                    inline: true\n                });\n            }\n            \n            // Oversight system status\n            if (systemData.oversight) {\n                embed.addFields({\n                    name: '🔍 Oversight System',\n                    value: `Monitoring: **${systemData.oversight.monitoringActive ? 'Active' : 'Inactive'}**\\n` +\n                           `Intervention Mode: **${systemData.oversight.interventionMode}**\\n` +\n                           `Suspicious Players: **${systemData.oversight.suspiciousPlayers}**`,\n                    inline: true\n                });\n            }\n            \n            // Trend analysis summary\n            if (systemData.trendAnalysis) {\n                const adjustmentCount = Object.keys(systemData.trendAnalysis.activeAdjustments || {}).length;\n                embed.addFields({\n                    name: '📈 Trend Analysis',\n                    value: `Active Adjustments: **${adjustmentCount}**\\n` +\n                           `Choices Analyzed: **${systemData.trendAnalysis.totalChoicesAnalyzed?.toLocaleString() || 0}**\\n` +\n                           `Player Profiles: **${systemData.trendAnalysis.activePlayerProfiles || 0}**`,\n                    inline: true\n                });\n            }\n            \n            // Performance recommendations\n            const recommendations = this.generatePerformanceRecommendations(systemData);\n            if (recommendations.length > 0) {\n                embed.addFields({\n                    name: '💡 Recommendations',\n                    value: recommendations.slice(0, 3).map(rec => `• ${rec}`).join('\\n'),\n                    inline: false\n                });\n            }\n            \n            await logChannel.send({ embeds: [embed] });\n            \n        } catch (error) {\n            logger.error(`Error sending comprehensive report: ${error.message}`);\n        }\n    }\n    \n    /**\n     * Helper methods\n     */\n    getHealthColor(score) {\n        if (score >= 0.8) return 0x00FF00; // Green\n        if (score >= 0.6) return 0xFFFF00; // Yellow\n        if (score >= 0.4) return 0xFF8000; // Orange\n        return 0xFF0000; // Red\n    }\n    \n    determineSystemStatus(systemData) {\n        if (this.dashboardState.overallHealthScore >= 0.8) return 'OPTIMAL';\n        if (this.dashboardState.overallHealthScore >= 0.6) return 'STABLE';\n        if (this.dashboardState.overallHealthScore >= 0.4) return 'DEGRADED';\n        return 'CRITICAL';\n    }\n    \n    calculateTrendHealthScore(trendData) {\n        if (!trendData) return 0.8;\n        \n        const adjustmentCount = Object.keys(trendData.activeAdjustments || {}).length;\n        \n        // Lower score if many adjustments are active (indicates issues)\n        if (adjustmentCount === 0) return 0.9;\n        if (adjustmentCount <= 2) return 0.8;\n        if (adjustmentCount <= 5) return 0.6;\n        return 0.4;\n    }\n    \n    calculateOversightHealthScore(oversightData) {\n        if (!oversightData) return 0.7;\n        \n        let score = 0.9;\n        \n        // Reduce score based on active alerts and suspicious activity\n        if (oversightData.activeAlerts > 0) score -= oversightData.activeAlerts * 0.1;\n        if (oversightData.suspiciousPlayers > 0) score -= oversightData.suspiciousPlayers * 0.05;\n        \n        return Math.max(0.3, score);\n    }\n    \n    updateRecentActivity(systemData) {\n        // Add recent activity entry\n        this.dashboardState.recentActivity.push({\n            timestamp: Date.now(),\n            healthScore: this.dashboardState.overallHealthScore,\n            alerts: this.dashboardState.activeAlerts.size,\n            systemStatus: this.dashboardState.systemStatus\n        });\n        \n        // Keep only recent activity (last 24 hours worth)\n        const cutoff = Date.now() - 24 * 60 * 60 * 1000;\n        this.dashboardState.recentActivity = this.dashboardState.recentActivity.filter(\n            activity => activity.timestamp > cutoff\n        );\n    }\n    \n    updateKeyMetrics(systemData) {\n        this.dashboardState.keyMetrics = {\n            lastUpdate: Date.now(),\n            totalVolume: systemData.economicAnalysis?.realTime?.totalVolume || 0,\n            totalProfit: systemData.economicAnalysis?.realTime?.hourlyProfit || 0,\n            activeGames: systemData.economicAnalysis?.realTime?.activeGames || 0,\n            systemStability: systemData.bulletproofEconomy?.performanceMetrics?.systemStability || 0.8\n        };\n    }\n    \n    async checkForCriticalAlerts(systemData) {\n        // Check for critical health score\n        if (this.dashboardState.overallHealthScore < 0.4) {\n            this.dashboardState.activeAlerts.set('critical_health', {\n                type: 'Critical Health Score',\n                severity: 'CRITICAL',\n                score: this.dashboardState.overallHealthScore,\n                timestamp: Date.now()\n            });\n        }\n        \n        // Check for system instability\n        if (systemData.bulletproofEconomy?.performanceMetrics?.systemStability < 0.5) {\n            this.dashboardState.activeAlerts.set('system_instability', {\n                type: 'System Instability',\n                severity: 'HIGH',\n                stability: systemData.bulletproofEconomy.performanceMetrics.systemStability,\n                timestamp: Date.now()\n            });\n        }\n    }\n    \n    generatePerformanceRecommendations(systemData) {\n        const recommendations = [];\n        \n        if (this.dashboardState.overallHealthScore < 0.7) {\n            recommendations.push('System health below optimal - consider review of economic parameters');\n        }\n        \n        if (systemData.oversight?.activeAlerts > 3) {\n            recommendations.push('Multiple oversight alerts active - investigate potential economic threats');\n        }\n        \n        const adjustmentCount = Object.keys(systemData.trendAnalysis?.activeAdjustments || {}).length;\n        if (adjustmentCount > 5) {\n            recommendations.push('High number of trend adjustments - review player behavior patterns');\n        }\n        \n        return recommendations;\n    }\n    \n    async sendDailySummary() {\n        // Implementation for daily summary report\n        logger.info('📅 Sending daily economic summary...');\n    }\n}\n\nmodule.exports = EconomicDashboard;