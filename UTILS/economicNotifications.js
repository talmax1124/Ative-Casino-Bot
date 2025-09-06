/**
 * Economic Emergency Notification System
 * Reports critical economic events to monitoring channels
 */

const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');

// Monitoring channel ID
const MONITORING_CHANNEL_ID = '1413722166024863866';

class EconomicNotifications {
    constructor(client = null) {
        this.client = client;
        this.lastNotificationTime = 0;
        this.notificationCooldown = 300000; // 5 minutes cooldown
    }

    /**
     * Set the Discord client for sending notifications
     */
    setClient(client) {
        this.client = client;
    }

    /**
     * Send economic emergency notification
     */
    async sendEmergencyNotification(emergencyData) {
        if (!this.client) {
            logger.warn('Discord client not available for emergency notification');
            return;
        }

        // Rate limiting - don't spam the channel
        const now = Date.now();
        if (now - this.lastNotificationTime < this.notificationCooldown) {
            logger.debug('Emergency notification rate-limited');
            return;
        }

        try {
            const channel = await this.client.channels.fetch(MONITORING_CHANNEL_ID);
            if (!channel) {
                logger.error(`Monitoring channel ${MONITORING_CHANNEL_ID} not found`);
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('🚨 CASINO ECONOMIC EMERGENCY ACTIVATED')
                .setColor(0xFF0000)
                .setTimestamp()
                .setDescription(
                    `**Critical economic conditions detected!**\n\n` +
                    `**Emergency Status:** ${emergencyData.emergencyMode ? 'ACTIVE' : 'RESOLVED'}\n` +
                    `**Health Score:** ${emergencyData.healthScore}/100\n` +
                    `**Systems Online:** ${emergencyData.initialized ? '✅' : '❌'}`
                );

            // Add circuit breaker details
            if (emergencyData.circuitBreakers && emergencyData.circuitBreakers.length > 0) {
                let breakerInfo = '';
                emergencyData.circuitBreakers.forEach(breaker => {
                    breakerInfo += `**${breaker.type.toUpperCase().replace(/_/g, ' ')}**\n`;
                    breakerInfo += `• Severity: ${breaker.severity}\n`;
                    breakerInfo += `• Value: ${breaker.value.toFixed(6)}\n`;
                    breakerInfo += `• Threshold: ${breaker.threshold}\n\n`;
                });

                embed.addFields([{
                    name: '⚡ Circuit Breakers Triggered',
                    value: breakerInfo.substring(0, 1024),
                    inline: false
                }]);
            }

            // Add emergency measures
            if (emergencyData.emergencyMeasures) {
                let measures = '';
                if (emergencyData.emergencyMeasures.multiplierReduction) {
                    measures += `• Multiplier Reduction: ${(emergencyData.emergencyMeasures.multiplierReduction * 100).toFixed(0)}%\n`;
                }
                if (emergencyData.emergencyMeasures.houseEdgeIncrease) {
                    measures += `• House Edge Increase: +${(emergencyData.emergencyMeasures.houseEdgeIncrease * 100).toFixed(2)}%\n`;
                }
                measures += `• Bet Limits: Reduced to emergency levels\n`;
                measures += `• Enhanced Monitoring: Active\n`;

                embed.addFields([{
                    name: '🛡️ Emergency Measures Applied',
                    value: measures,
                    inline: false
                }]);
            }

            // Add anti-abuse status
            if (emergencyData.antiAbuse) {
                embed.addFields([{
                    name: '🚨 Anti-Abuse Status',
                    value: 
                        `• Status: ${emergencyData.antiAbuse.status}\n` +
                        `• Tracked Users: ${emergencyData.antiAbuse.trackedUsers}\n` +
                        `• Blocked Users: ${emergencyData.antiAbuse.blockedUsers}\n` +
                        `• Flagged Users: ${emergencyData.antiAbuse.flaggedUsers}`,
                    inline: true
                }]);
            }

            embed.setFooter({ 
                text: 'Casino Economic Monitor • Automatic Alert System'
            });

            await channel.send({ embeds: [embed] });
            this.lastNotificationTime = now;

            logger.info(`Economic emergency notification sent to channel ${MONITORING_CHANNEL_ID}`);

        } catch (error) {
            logger.error(`Failed to send emergency notification: ${error.message}`);
        }
    }

    /**
     * Send economic recovery notification
     */
    async sendRecoveryNotification(statusData) {
        if (!this.client) {
            logger.warn('Discord client not available for recovery notification');
            return;
        }

        try {
            const channel = await this.client.channels.fetch(MONITORING_CHANNEL_ID);
            if (!channel) {
                logger.error(`Monitoring channel ${MONITORING_CHANNEL_ID} not found`);
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ CASINO ECONOMIC EMERGENCY RESOLVED')
                .setColor(0x00FF00)
                .setTimestamp()
                .setDescription(
                    `**Economic conditions have stabilized**\n\n` +
                    `**Emergency Status:** RESOLVED\n` +
                    `**Health Score:** ${statusData.healthScore}/100\n` +
                    `**Normal Operations:** Resumed`
                );

            embed.addFields([{
                name: '🔄 Measures Restored',
                value: 
                    `• Normal betting limits restored\n` +
                    `• Regular multipliers restored\n` +
                    `• Standard house edge restored\n` +
                    `• Normal monitoring resumed`,
                inline: false
            }]);

            embed.setFooter({ 
                text: 'Casino Economic Monitor • Recovery Alert'
            });

            await channel.send({ embeds: [embed] });

            logger.info(`Economic recovery notification sent to channel ${MONITORING_CHANNEL_ID}`);

        } catch (error) {
            logger.error(`Failed to send recovery notification: ${error.message}`);
        }
    }

    /**
     * Send daily economic summary
     */
    async sendDailySummary(summaryData) {
        if (!this.client) return;

        try {
            const channel = await this.client.channels.fetch(MONITORING_CHANNEL_ID);
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setTitle('📊 Daily Economic Summary')
                .setColor(0x0099FF)
                .setTimestamp()
                .setDescription(
                    `**Casino Economic Health Report**\n\n` +
                    `**Health Score:** ${summaryData.healthScore}/100\n` +
                    `**Emergency Events:** ${summaryData.emergencyEvents || 0}\n` +
                    `**Circuit Breaker Triggers:** ${summaryData.circuitBreakerTriggers || 0}`
                );

            // Add game statistics
            if (summaryData.gameStats) {
                let gameInfo = '';
                for (const [game, stats] of Object.entries(summaryData.gameStats)) {
                    gameInfo += `**${game.toUpperCase()}:** ${stats.games} games, ${stats.houseEdge.toFixed(2)}% edge\n`;
                }

                embed.addFields([{
                    name: '🎮 Game Statistics',
                    value: gameInfo.substring(0, 1024) || 'No game data',
                    inline: false
                }]);
            }

            embed.setFooter({ 
                text: 'Casino Economic Monitor • Daily Report'
            });

            await channel.send({ embeds: [embed] });

        } catch (error) {
            logger.error(`Failed to send daily summary: ${error.message}`);
        }
    }
}

// Export singleton instance
module.exports = new EconomicNotifications();