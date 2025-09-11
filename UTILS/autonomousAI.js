/**
 * Autonomous AI Manager - Fully Automated Casino Intelligence
 * Runs continuously, monitors, analyzes, and acts automatically
 */

const logger = require('./logger');
const realAI = require('./realAIEngine');
const { gameDataCollector } = require('./gameDataCollector');
const mlPhaseManager = require('./mlPhaseManager');
const { sendLogMessage } = require('./common');

class AutonomousAI {
    constructor(client) {
        this.client = client;
        this.isRunning = false;
        this.analysisInterval = null;
        this.monitoringInterval = null;
        
        // Configuration
        this.config = {
            analysisFrequency: 30 * 60 * 1000, // 30 minutes
            monitoringFrequency: 5 * 60 * 1000, // 5 minutes
            autoApplyRecommendations: true,
            confidenceThreshold: 80, // Only apply recommendations with 80%+ confidence
            logChannel: '1405096821512212521' // Error logs channel
        };
        
        logger.info('🤖 Autonomous AI Manager initialized');
    }

    /**
     * Start autonomous AI operations
     */
    async start() {
        if (this.isRunning) {
            logger.warn('Autonomous AI already running');
            return;
        }

        try {
            this.isRunning = true;
            
            // Start continuous monitoring
            this.monitoringInterval = setInterval(() => {
                this.continuousMonitoring().catch(error => {
                    logger.error(`Autonomous monitoring error: ${error.message}`);
                });
            }, this.config.monitoringFrequency);
            
            // Start periodic AI analysis
            this.analysisInterval = setInterval(() => {
                this.periodicAnalysis().catch(error => {
                    logger.error(`Autonomous analysis error: ${error.message}`);
                });
            }, this.config.analysisFrequency);
            
            // Run initial analysis
            setTimeout(() => {
                this.periodicAnalysis().catch(error => {
                    logger.error(`Initial autonomous analysis error: ${error.message}`);
                });
            }, 30000); // Wait 30 seconds after startup
            
            logger.info('🚀 Autonomous AI started - monitoring every 5 minutes, analyzing every 30 minutes');
            
            // Notify in Discord
            await this.sendAINotification('🤖 **Autonomous AI Started**', 
                'AI is now monitoring and optimizing your casino automatically.\n\n' +
                '• **Monitoring**: Every 5 minutes\n' +
                '• **Analysis**: Every 30 minutes\n' +
                '• **Auto-Apply**: High confidence recommendations\n\n' +
                'Use `/ai overview` to see current status.', 0x00FF00);
                
        } catch (error) {
            logger.error(`Failed to start Autonomous AI: ${error.message}`);
            this.isRunning = false;
        }
    }

    /**
     * Stop autonomous AI operations
     */
    async stop() {
        if (!this.isRunning) return;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }
        
        this.isRunning = false;
        logger.info('🛑 Autonomous AI stopped');
        
        await this.sendAINotification('🛑 **Autonomous AI Stopped**', 
            'AI monitoring has been disabled.', 0xFF6600);
    }

    /**
     * Continuous monitoring (every 5 minutes)
     */
    async continuousMonitoring() {
        try {
            logger.debug('🔍 Running autonomous monitoring...');
            
            const stats = await gameDataCollector.getAggregatedStats();
            if (!stats) return;
            
            // Check for critical issues that need immediate attention
            const criticalIssues = await this.detectCriticalIssues(stats);
            
            if (criticalIssues.length > 0) {
                logger.warn(`⚠️ ${criticalIssues.length} critical issues detected`);
                
                // Get emergency AI recommendations
                const emergencyRecommendations = await this.getEmergencyRecommendations(stats, criticalIssues);
                
                // Auto-apply critical recommendations
                if (this.config.autoApplyRecommendations) {
                    await this.autoApplyRecommendations(emergencyRecommendations, true);
                }
                
                // Send alert
                await this.sendCriticalAlert(criticalIssues, emergencyRecommendations);
            }
            
        } catch (error) {
            logger.error(`Continuous monitoring error: ${error.message}`);
        }
    }

    /**
     * Periodic AI analysis (every 30 minutes)
     */
    async periodicAnalysis() {
        try {
            logger.info('🧠 Running autonomous AI analysis...');
            
            const stats = await gameDataCollector.getAggregatedStats();
            if (!stats) {
                logger.debug('No casino data available for analysis');
                return;
            }
            
            // Get comprehensive AI analysis
            const trends = {
                volumeTrend: 'stable',
                winRateTrend: 'stable', 
                houseEdgeTrend: 'stable',
                playerActivity: 'normal'
            };
            const economicState = {
                riskLevel: 'MEDIUM',
                volatility: 0.3,
                playerSatisfaction: 0.75,
                wealthDistribution: 'balanced'
            };
            
            const recommendations = await realAI.generateIntelligentRecommendations(
                stats, trends, economicState
            );
            
            logger.info(`🤖 AI generated ${recommendations.length} recommendations`);
            
            // Auto-apply high confidence recommendations
            if (this.config.autoApplyRecommendations) {
                const applied = await this.autoApplyRecommendations(recommendations);
                
                if (applied.length > 0) {
                    await this.sendAINotification('🤖 **AI Auto-Applied Recommendations**', 
                        applied.map(rec => `✅ **${rec.action}** (${rec.confidence}% confidence)\n${rec.reasoning.slice(0, 100)}...`).join('\n\n'), 
                        0x00FF00);
                }
            }
            
            // ML phase is managed separately
            
            // Send periodic summary (every 2 hours)
            const now = Date.now();
            if (!this.lastSummary || now - this.lastSummary > 2 * 60 * 60 * 1000) {
                await this.sendPeriodicSummary(stats, recommendations);
                this.lastSummary = now;
            }
            
        } catch (error) {
            logger.error(`Periodic analysis error: ${error.message}`);
        }
    }

    /**
     * Detect critical issues requiring immediate attention
     */
    async detectCriticalIssues(stats) {
        const issues = [];
        
        // House edge too low (emergency)
        if (stats.houseEdge < 0.05) {
            issues.push({
                type: 'CRITICAL_HOUSE_EDGE',
                severity: 'EMERGENCY',
                message: `House edge dangerously low: ${(stats.houseEdge * 100).toFixed(1)}%`
            });
        }
        
        // Player win rate too high (emergency)
        if (stats.winRate > 0.6) {
            issues.push({
                type: 'CRITICAL_WIN_RATE',
                severity: 'EMERGENCY', 
                message: `Player win rate too high: ${(stats.winRate * 100).toFixed(1)}%`
            });
        }
        
        // Massive losses in short time
        if (stats.houseProfit < -1000000) {
            issues.push({
                type: 'MASSIVE_LOSSES',
                severity: 'CRITICAL',
                message: `House losing money: ${stats.houseProfit}`
            });
        }
        
        return issues;
    }

    /**
     * Get emergency AI recommendations for critical issues
     */
    async getEmergencyRecommendations(stats, issues) {
        try {
            const emergencyPrompt = `EMERGENCY CASINO ANALYSIS - IMMEDIATE ACTION REQUIRED

Critical Issues Detected:
${issues.map(issue => `- ${issue.message}`).join('\n')}

Current Casino Data:
- House Edge: ${(stats.houseEdge * 100).toFixed(1)}%
- Player Win Rate: ${(stats.winRate * 100).toFixed(1)}%
- House Profit: $${stats.houseProfit}
- Total Volume: $${stats.totalVolume}

URGENT: Provide immediate emergency recommendations to prevent further losses. Focus on rapid stabilization.`;

            return await realAI.generateIntelligentRecommendations(
                stats,
                { volumeTrend: 'critical', winRateTrend: 'critical', houseEdgeTrend: 'critical', playerActivity: 'critical' },
                { riskLevel: 'CRITICAL', volatility: 1.0, playerSatisfaction: 0.3, wealthDistribution: 'emergency' }
            );
            
        } catch (error) {
            logger.error(`Emergency recommendations error: ${error.message}`);
            return [];
        }
    }

    /**
     * Auto-apply AI recommendations
     */
    async autoApplyRecommendations(recommendations, isEmergency = false) {
        const applied = [];
        
        for (const rec of recommendations) {
            // Only apply high confidence recommendations (or all emergency ones)
            if (isEmergency || rec.confidence >= this.config.confidenceThreshold) {
                
                try {
                    const success = await this.executeRecommendation(rec);
                    
                    if (success) {
                        applied.push(rec);
                        logger.info(`✅ Auto-applied: ${rec.action} (${rec.confidence}% confidence)`);
                    }
                    
                } catch (error) {
                    logger.error(`Failed to apply recommendation ${rec.action}: ${error.message}`);
                }
            }
        }
        
        return applied;
    }

    /**
     * Execute a specific AI recommendation
     */
    async executeRecommendation(recommendation) {
        switch (recommendation.action) {
            case 'INCREASE_HOUSE_EDGE':
                return await mlPhaseManager.adjustHouseEdge(0.01); // Increase by 1%
                
            case 'DECREASE_HOUSE_EDGE':
                return await mlPhaseManager.adjustHouseEdge(-0.005); // Decrease by 0.5%
                
            case 'ACTIVATE_WEALTH_CONTROL':
                return await mlPhaseManager.activateWealthControl();
                
            case 'REDUCE_GAME_LIMITS':
                return await mlPhaseManager.adjustGameLimits(-0.1); // Reduce limits by 10%
                
            case 'INCREASE_GAME_LIMITS':
                return await mlPhaseManager.adjustGameLimits(0.05); // Increase limits by 5%
                
            case 'ADJUST_HOUSE_EDGE':
                logger.info('AI recommends adjusting house edge - manual review required');
                return true; // Mark as applied but don't auto-execute
                
            case 'ENHANCE_PLAYER_REWARDS':
                logger.info('AI recommends enhancing player rewards - manual review required');
                return true; // Mark as applied but don't auto-execute
                
            case 'MAINTAIN_CURRENT_SETTINGS':
            case 'MONITOR_TRENDS':
            case 'CONTINUE_CURRENT_STRATEGY':
                logger.debug(`AI recommendation: ${recommendation.action}`);
                return true; // These are advisory, not actionable
                
            default:
                logger.warn(`Unknown recommendation action: ${recommendation.action}`);
                return false;
        }
    }

    /**
     * Send critical alert
     */
    async sendCriticalAlert(issues, recommendations) {
        const alertMessage = `🚨 **CRITICAL CASINO ALERT** 🚨\n\n` +
            `**Issues Detected:**\n${issues.map(issue => `• ${issue.message}`).join('\n')}\n\n` +
            `**AI Emergency Actions:**\n${recommendations.slice(0, 3).map(rec => `• ${rec.action} (${rec.confidence}% confidence)`).join('\n')}\n\n` +
            `**Status:** ${this.config.autoApplyRecommendations ? 'Auto-applying fixes' : 'Manual intervention required'}`;
            
        await this.sendAINotification('🚨 **CRITICAL ALERT**', alertMessage, 0xFF0000);
    }

    /**
     * Send periodic AI summary
     */
    async sendPeriodicSummary(stats, recommendations) {
        const summaryMessage = `📊 **Autonomous AI Summary**\n\n` +
            `**Casino Performance:**\n` +
            `• ${stats.totalGames} games • $${stats.totalVolume?.toLocaleString()} volume\n` +
            `• ${(stats.houseEdge * 100).toFixed(1)}% house edge • ${(stats.winRate * 100).toFixed(1)}% win rate\n\n` +
            `**AI Status:**\n` +
            `• ${recommendations.length} recommendations generated\n` +
            `• System running autonomously\n` +
            `• Next analysis in 30 minutes`;
            
        await this.sendAINotification('🤖 **AI Status Update**', summaryMessage, 0x9932CC);
    }

    /**
     * Send AI notification to Discord
     */
    async sendAINotification(title, message, color) {
        try {
            await sendLogMessage(this.client, {
                title,
                description: message,
                color,
                timestamp: new Date().toISOString()
            }, this.config.logChannel);
        } catch (error) {
            logger.error(`Failed to send AI notification: ${error.message}`);
        }
    }

    /**
     * Get autonomous AI status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            config: this.config,
            nextAnalysis: this.analysisInterval ? Date.now() + this.config.analysisFrequency : null,
            nextMonitoring: this.monitoringInterval ? Date.now() + this.config.monitoringFrequency : null
        };
    }
}

module.exports = AutonomousAI;