/**
 * ECONOMY CHANNEL LOGGER
 * Comprehensive logging system for Discord logs channel
 * Logs all economy events, personalized adjustments, and deep analysis
 */

const logger = require('./logger');

class EconomyChannelLogger {
    constructor() {
        this.client = null;
        this.logsChannelId = null;
        this.logQueue = [];
        this.isProcessing = false;
        this.MAX_QUEUE_SIZE = 1000;
        this.BATCH_SIZE = 10;
        this.BATCH_INTERVAL = 5000; // 5 seconds
        
        // Initialize batch processing
        this.startBatchProcessing();
    }
    
    /**
     * Initialize the logger with Discord client and logs channel
     */
    initialize(client, logsChannelId) {
        this.client = client;
        this.logsChannelId = logsChannelId;
        
        logger.info('Economy Channel Logger initialized', {
            channelId: logsChannelId,
            queueSize: this.logQueue.length
        });
        
        // Process any queued logs
        this.processLogQueue();
    }
    
    /**
     * Start batch processing of logs
     */
    startBatchProcessing() {
        setInterval(async () => {
            if (!this.isProcessing && this.logQueue.length > 0) {
                await this.processLogQueue();
            }
        }, this.BATCH_INTERVAL);
    }
    
    /**
     * Process the log queue in batches
     */
    async processLogQueue() {
        if (this.isProcessing || !this.client || !this.logsChannelId || this.logQueue.length === 0) {
            return;
        }
        
        this.isProcessing = true;
        
        try {
            const channel = await this.client.channels.fetch(this.logsChannelId);
            if (!channel) {
                logger.error(`Logs channel not found: ${this.logsChannelId}`);
                return;
            }
            
            // Process logs in batches
            const batch = this.logQueue.splice(0, this.BATCH_SIZE);
            
            for (const logEntry of batch) {
                try {
                    await this.sendLogToChannel(channel, logEntry);
                    // Small delay to prevent rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    logger.error(`Failed to send log to channel: ${error.message}`);
                    // Re-queue the failed log entry
                    this.logQueue.unshift(logEntry);
                    break;
                }
            }
            
        } catch (error) {
            logger.error(`Failed to process log queue: ${error.message}`);
        } finally {
            this.isProcessing = false;
        }
    }
    
    /**
     * Send a single log entry to the channel
     */
    async sendLogToChannel(channel, logEntry) {
        const embed = this.createLogEmbed(logEntry);
        await channel.send({ embeds: [embed] });
    }
    
    /**
     * Create a Discord embed for a log entry
     */
    createLogEmbed(logEntry) {
        const colors = {
            'USER_BET': 0x3498DB,
            'USER_PAYOUT': 0x2ECC71,
            'PERSONALIZED_ADJUSTMENT': 0xE67E22,
            'MARKET_CHANGE': 0xE74C3C,
            'ECONOMIC_ANALYSIS': 0x9B59B6,
            'SYSTEM_EVENT': 0x95A5A6,
            'SECURITY_ALERT': 0xFF0000,
            'USER_IMPACT_CHANGE': 0xF39C12,
            'DEEP_ANALYSIS': 0x1ABC9C,
            'AUTO_ADJUSTMENT': 0x34495E
        };
        
        const embed = {
            title: `📊 ${logEntry.type.replace('_', ' ')}`,
            color: colors[logEntry.type] || 0x95A5A6,
            timestamp: logEntry.timestamp,
            fields: []
        };
        
        // Add fields based on log type
        switch (logEntry.type) {
            case 'USER_BET':
                embed.fields = [
                    { name: '👤 User', value: `<@${logEntry.userId}>`, inline: true },
                    { name: '🎮 Game', value: logEntry.gameType, inline: true },
                    { name: '💰 Amount', value: `$${logEntry.amount.toLocaleString()}`, inline: true },
                    { name: '📈 Impact Level', value: logEntry.impactLevel || 'Unknown', inline: true },
                    { name: '🔢 Economic Score', value: logEntry.economicScore?.toFixed(2) || 'N/A', inline: true },
                    { name: '⚖️ Multiplier', value: `${logEntry.payoutMultiplier}x`, inline: true }
                ];
                break;
                
            case 'USER_PAYOUT':
                embed.fields = [
                    { name: '👤 User', value: `<@${logEntry.userId}>`, inline: true },
                    { name: '🎮 Game', value: logEntry.gameType, inline: true },
                    { name: '💰 Payout', value: `$${logEntry.payout.toLocaleString()}`, inline: true },
                    { name: '📊 Original', value: `$${logEntry.originalPayout?.toLocaleString() || 'N/A'}`, inline: true },
                    { name: '⚖️ Adjustment', value: `${logEntry.personalizedMultiplier}x`, inline: true },
                    { name: '📈 Impact', value: logEntry.impactLevel || 'Unknown', inline: true }
                ];
                break;
                
            case 'PERSONALIZED_ADJUSTMENT':
                embed.fields = [
                    { name: '👤 User', value: `<@${logEntry.userId}>`, inline: true },
                    { name: '📈 Old Impact', value: logEntry.oldImpactLevel, inline: true },
                    { name: '📈 New Impact', value: logEntry.newImpactLevel, inline: true },
                    { name: '⚖️ Old Multiplier', value: `${logEntry.oldMultiplier}x`, inline: true },
                    { name: '⚖️ New Multiplier', value: `${logEntry.newMultiplier}x`, inline: true },
                    { name: '💹 Reason', value: logEntry.reason, inline: false }
                ];
                break;
                
            case 'MARKET_CHANGE':
                embed.fields = [
                    { name: '📊 Market Level', value: `${logEntry.oldLevel} → ${logEntry.newLevel}`, inline: true },
                    { name: '💰 Usage', value: `${logEntry.monthlyUsage}%`, inline: true },
                    { name: '⚖️ Multiplier', value: `${logEntry.newMultiplier}x`, inline: true },
                    { name: '💵 Volume', value: `$${logEntry.monthlyVolume?.toLocaleString() || 'N/A'}`, inline: false }
                ];
                break;
                
            case 'ECONOMIC_ANALYSIS':
                embed.fields = [
                    { name: '📊 Analysis Type', value: logEntry.analysisType, inline: true },
                    { name: '👥 Users Analyzed', value: logEntry.usersAnalyzed?.toString() || 'N/A', inline: true },
                    { name: '🔄 Adjustments Made', value: logEntry.adjustmentsMade?.toString() || '0', inline: true },
                    { name: '📈 Key Findings', value: logEntry.keyFindings || 'No significant changes', inline: false }
                ];
                break;
                
            case 'DEEP_ANALYSIS':
                embed.fields = [
                    { name: '🔬 Analysis Duration', value: `${logEntry.duration}ms`, inline: true },
                    { name: '👥 Total Users', value: logEntry.totalUsers?.toString() || 'N/A', inline: true },
                    { name: '💰 Total Volume', value: `$${logEntry.totalVolume?.toLocaleString() || 'N/A'}`, inline: true },
                    { name: '⚠️ Risk Level', value: logEntry.riskLevel || 'Normal', inline: true },
                    { name: '🎯 Recommendations', value: logEntry.recommendations || 'Continue monitoring', inline: false }
                ];
                break;
                
            case 'AUTO_ADJUSTMENT':
                embed.fields = [
                    { name: '🤖 Adjustment Type', value: logEntry.adjustmentType, inline: true },
                    { name: '📊 Trigger', value: logEntry.trigger, inline: true },
                    { name: '👥 Users Affected', value: logEntry.usersAffected?.toString() || 'N/A', inline: true },
                    { name: '📈 Impact', value: logEntry.impact || 'Minimal', inline: false }
                ];
                break;
                
            case 'SECURITY_ALERT':
                embed.color = 0xFF0000;
                embed.fields = [
                    { name: '⚠️ Alert Type', value: logEntry.alertType, inline: true },
                    { name: '👤 User', value: logEntry.userId ? `<@${logEntry.userId}>` : 'System', inline: true },
                    { name: '🔍 Details', value: logEntry.details || 'No additional details', inline: false },
                    { name: '🛡️ Action Taken', value: logEntry.actionTaken || 'Under review', inline: false }
                ];
                break;
                
            default:
                embed.fields = [
                    { name: '📝 Details', value: JSON.stringify(logEntry.data || {}, null, 2).substring(0, 1000), inline: false }
                ];
        }
        
        // Add footer with system info
        embed.footer = {
            text: `Casino Economy Logger • ${new Date().toLocaleTimeString()}`
        };
        
        return embed;
    }
    
    /**
     * Log a user bet
     */
    logUserBet(userId, gameType, amount, personalizedInfo) {
        this.queueLog({
            type: 'USER_BET',
            userId: userId,
            gameType: gameType,
            amount: amount,
            impactLevel: personalizedInfo.impactLevel,
            economicScore: personalizedInfo.economicScore,
            payoutMultiplier: personalizedInfo.payoutMultiplier,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Log a user payout
     */
    logUserPayout(userId, gameType, originalPayout, adjustedPayout, personalizedMultiplier, impactLevel) {
        this.queueLog({
            type: 'USER_PAYOUT',
            userId: userId,
            gameType: gameType,
            originalPayout: originalPayout,
            payout: adjustedPayout,
            personalizedMultiplier: personalizedMultiplier,
            impactLevel: impactLevel,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Log personalized adjustments
     */
    logPersonalizedAdjustment(userId, oldImpactLevel, newImpactLevel, oldMultiplier, newMultiplier, reason) {
        this.queueLog({
            type: 'PERSONALIZED_ADJUSTMENT',
            userId: userId,
            oldImpactLevel: oldImpactLevel,
            newImpactLevel: newImpactLevel,
            oldMultiplier: oldMultiplier,
            newMultiplier: newMultiplier,
            reason: reason,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Log market changes
     */
    logMarketChange(oldLevel, newLevel, monthlyUsage, newMultiplier, monthlyVolume) {
        this.queueLog({
            type: 'MARKET_CHANGE',
            oldLevel: oldLevel,
            newLevel: newLevel,
            monthlyUsage: monthlyUsage,
            newMultiplier: newMultiplier,
            monthlyVolume: monthlyVolume,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Log economic analysis
     */
    logEconomicAnalysis(analysisType, usersAnalyzed, adjustmentsMade, keyFindings) {
        this.queueLog({
            type: 'ECONOMIC_ANALYSIS',
            analysisType: analysisType,
            usersAnalyzed: usersAnalyzed,
            adjustmentsMade: adjustmentsMade,
            keyFindings: keyFindings,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Log deep analysis results
     */
    logDeepAnalysis(duration, totalUsers, totalVolume, riskLevel, recommendations) {
        this.queueLog({
            type: 'DEEP_ANALYSIS',
            duration: duration,
            totalUsers: totalUsers,
            totalVolume: totalVolume,
            riskLevel: riskLevel,
            recommendations: recommendations,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Log automatic adjustments
     */
    logAutoAdjustment(adjustmentType, trigger, usersAffected, impact) {
        this.queueLog({
            type: 'AUTO_ADJUSTMENT',
            adjustmentType: adjustmentType,
            trigger: trigger,
            usersAffected: usersAffected,
            impact: impact,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Log security alerts
     */
    logSecurityAlert(alertType, userId, details, actionTaken) {
        this.queueLog({
            type: 'SECURITY_ALERT',
            alertType: alertType,
            userId: userId,
            details: details,
            actionTaken: actionTaken,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Queue a log entry for processing
     */
    queueLog(logEntry) {
        // Prevent queue overflow
        if (this.logQueue.length >= this.MAX_QUEUE_SIZE) {
            this.logQueue.shift(); // Remove oldest entry
            logger.warn('Log queue overflow - removing oldest entry');
        }
        
        this.logQueue.push(logEntry);
        
        // Log to console as well for debugging
        logger.info('Queued channel log', {
            type: logEntry.type,
            queueSize: this.logQueue.length
        });
    }
    
    /**
     * Get queue status
     */
    getQueueStatus() {
        return {
            queueSize: this.logQueue.length,
            isProcessing: this.isProcessing,
            maxQueueSize: this.MAX_QUEUE_SIZE,
            batchSize: this.BATCH_SIZE,
            batchInterval: this.BATCH_INTERVAL
        };
    }
    
    /**
     * Clear the log queue (admin function)
     */
    clearQueue() {
        const clearedCount = this.logQueue.length;
        this.logQueue = [];
        logger.warn(`Admin cleared log queue - ${clearedCount} entries removed`);
        return clearedCount;
    }
    
    /**
     * Force process queue immediately (admin function)
     */
    async forceProcessQueue() {
        if (this.isProcessing) {
            logger.warn('Queue already processing - skipping force process');
            return false;
        }
        
        logger.info('Admin forced queue processing');
        await this.processLogQueue();
        return true;
    }
}

// Create singleton instance
const economyChannelLogger = new EconomyChannelLogger();

module.exports = economyChannelLogger;