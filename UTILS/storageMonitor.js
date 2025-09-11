/**
 * Automatic Storage Monitoring System
 * Periodically checks disk space and sends alerts when storage is low
 */

const { EmbedBuilder } = require('discord.js');
const { exec } = require('child_process');
const { promisify } = require('util');
const logger = require('./logger');

const execAsync = promisify(exec);
const ALERT_CHANNEL_ID = '1411785562985336873';
const DEVELOPER_ID = '466050111680544798';

class StorageMonitor {
    constructor() {
        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.alertThrottle = new Map();
        this.lastKnownUsage = 0;
        
        // Configuration
        this.config = {
            checkInterval: 15 * 60 * 1000, // 15 minutes
            alertThresholds: {
                warning: 80,  // 80%
                critical: 90, // 90%
                emergency: 95 // 95%
            },
            alertCooldowns: {
                warning: 60 * 60 * 1000,    // 1 hour for warning
                critical: 30 * 60 * 1000,   // 30 minutes for critical
                emergency: 15 * 60 * 1000   // 15 minutes for emergency
            }
        };
    }

    /**
     * Start automatic storage monitoring
     */
    startMonitoring(client) {
        if (this.isMonitoring) {
            logger.info('Storage monitoring already active');
            return;
        }

        this.client = client;
        this.isMonitoring = true;
        
        logger.info('Starting automatic storage monitoring...');
        
        // Initial check
        this.checkStorage();
        
        // Set up periodic checks
        this.monitoringInterval = setInterval(() => {
            this.checkStorage();
        }, this.config.checkInterval);
        
        logger.info(`Storage monitoring started with ${this.config.checkInterval / 60000}min intervals`);
    }

    /**
     * Stop automatic storage monitoring
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }

        this.isMonitoring = false;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        logger.info('Storage monitoring stopped');
    }

    /**
     * Perform storage check
     */
    async checkStorage() {
        try {
            const storageInfo = await this.getStorageInfo();
            const usage = storageInfo.usage;
            
            // Log significant changes
            if (Math.abs(usage - this.lastKnownUsage) >= 5) {
                logger.info(`Storage usage: ${usage}% (${storageInfo.available} available)`);
                this.lastKnownUsage = usage;
            }
            
            // Check alert thresholds
            await this.checkAlertThresholds(storageInfo);
            
        } catch (error) {
            logger.error(`Storage monitoring check failed: ${error.message}`);
        }
    }

    /**
     * Get current storage information (cross-platform)
     */
    async getStorageInfo() {
        try {
            const { stdout } = await execAsync('df -h / | tail -1');
            const parts = stdout.trim().split(/\s+/);
            
            if (parts.length < 5) {
                throw new Error('Invalid df output format');
            }
            
            // Handle different df output formats (macOS vs Linux)
            let filesystem, total, used, available, percentStr;
            if (parts.length >= 6) {
                [filesystem, total, used, available, percentStr] = parts;
            } else if (parts.length === 5) {
                [filesystem, total, used, available, percentStr] = parts;
            } else {
                throw new Error(`Unexpected df output format: ${parts.length} parts`);
            }
            
            const usage = parseInt(percentStr.replace('%', ''));
            
            if (isNaN(usage)) {
                throw new Error('Could not parse usage percentage');
            }
            
            return {
                filesystem,
                total,
                used,
                available,
                usage,
                timestamp: new Date()
            };
        } catch (error) {
            throw new Error(`Failed to get storage info: ${error.message}`);
        }
    }

    /**
     * Check if alerts need to be sent based on thresholds
     */
    async checkAlertThresholds(storageInfo) {
        const usage = storageInfo.usage;
        let alertLevel = null;
        
        if (usage >= this.config.alertThresholds.emergency) {
            alertLevel = 'emergency';
        } else if (usage >= this.config.alertThresholds.critical) {
            alertLevel = 'critical';
        } else if (usage >= this.config.alertThresholds.warning) {
            alertLevel = 'warning';
        }
        
        if (alertLevel) {
            await this.sendAlert(alertLevel, storageInfo);
        }
    }

    /**
     * Send storage alert to the specified channel
     */
    async sendAlert(level, storageInfo) {
        try {
            const alertKey = `${level}_${Math.floor(storageInfo.usage / 5) * 5}`;
            const now = Date.now();
            const lastAlert = this.alertThrottle.get(alertKey) || 0;
            const cooldown = this.config.alertCooldowns[level];
            
            // Check cooldown
            if (now - lastAlert < cooldown) {
                return; // Still in cooldown
            }
            
            this.alertThrottle.set(alertKey, now);
            
            // Create alert embed based on level
            const embed = this.createAlertEmbed(level, storageInfo);
            
            // Get alert channel
            const channel = await this.client.channels.fetch(ALERT_CHANNEL_ID);
            if (!channel) {
                logger.warn(`Alert channel ${ALERT_CHANNEL_ID} not found`);
                return;
            }
            
            // Send alert with mention for critical/emergency
            const mentionDev = level === 'critical' || level === 'emergency';
            const content = mentionDev 
                ? `<@${DEVELOPER_ID}> 🚨 **${String(level).toUpperCase()} STORAGE ALERT**`
                : `🟡 **${String(level).toUpperCase()} STORAGE ALERT**`;
            
            await channel.send({
                content,
                embeds: [embed]
            });
            
            logger.warn(`Storage ${level} alert sent: ${storageInfo.usage}% usage`);
            
        } catch (error) {
            logger.error(`Failed to send storage alert: ${error.message}`);
        }
    }

    /**
     * Create alert embed based on severity level
     */
    createAlertEmbed(level, storageInfo) {
        const colors = {
            warning: 0xFFD700,   // Gold
            critical: 0xFF4500,  // Orange Red
            emergency: 0xFF0000  // Red
        };
        
        const icons = {
            warning: '🟡',
            critical: '🔴',
            emergency: '🚨'
        };
        
        const titles = {
            warning: 'Low Disk Space Warning',
            critical: 'Critical Disk Space Alert',
            emergency: 'EMERGENCY - Disk Space Nearly Full!'
        };
        
        const actions = {
            warning: [
                '• Monitor storage usage closely',
                '• Plan cleanup tasks for near future',
                '• Check log file sizes',
                '• Review temporary files'
            ],
            critical: [
                '• **Clear log files and temporary data**',
                '• **Archive old database backups**',
                '• **Remove unnecessary files**',
                '• **Check for large files: `du -sh /* | sort -hr`**'
            ],
            emergency: [
                '• **IMMEDIATE ACTION REQUIRED**',
                '• **Stop non-essential services**',
                '• **Clear logs: `sudo journalctl --vacuum-time=3d`**',
                '• **Remove temp files: `sudo rm -rf /tmp/*`**',
                '• **Check core dumps: `ls -la /var/crash/`**'
            ]
        };
        
        const embed = new EmbedBuilder()
            .setTitle(`${icons[level]} ${titles[level]}`)
            .setDescription(`System storage has reached ${storageInfo.usage}% capacity`)
            .setColor(colors[level])
            .addFields(
                {
                    name: '💾 Storage Status',
                    value: `**Usage:** ${storageInfo.usage}% (${storageInfo.used} / ${storageInfo.total})\n**Available:** ${storageInfo.available}\n**Filesystem:** ${storageInfo.filesystem}`,
                    inline: false
                },
                {
                    name: '📊 Usage Visualization',
                    value: this.createProgressBar(storageInfo.usage) + ` ${storageInfo.usage}%`,
                    inline: false
                },
                {
                    name: '⚡ Recommended Actions',
                    value: actions[level].join('\n'),
                    inline: false
                }
            )
            .setFooter({ 
                text: `ATIVE Casino Bot Storage Monitor • ${String(level).toUpperCase()} Alert` 
            })
            .setTimestamp();
        
        // Add severity-specific fields
        if (level === 'emergency') {
            embed.addFields({
                name: '🆘 Emergency Commands',
                value: '```bash\n# Check largest directories\ndu -sh /* | sort -hr | head -10\n\n# Clear system logs\nsudo journalctl --vacuum-time=1d\n\n# Find large files\nfind / -type f -size +100M 2>/dev/null\n```',
                inline: false
            });
        }
        
        return embed;
    }

    /**
     * Create visual progress bar
     */
    createProgressBar(percentage, length = 20) {
        const filled = Math.round((percentage / 100) * length);
        const empty = length - filled;
        
        if (percentage >= 95) {
            return '🚨'.repeat(filled) + '⬜'.repeat(empty);
        } else if (percentage >= 90) {
            return '🔴'.repeat(filled) + '⬜'.repeat(empty);
        } else if (percentage >= 80) {
            return '🟡'.repeat(filled) + '⬜'.repeat(empty);
        } else {
            return '🟢'.repeat(filled) + '⬜'.repeat(empty);
        }
    }

    /**
     * Get monitoring status
     */
    getStatus() {
        return {
            isMonitoring: this.isMonitoring,
            checkInterval: this.config.checkInterval,
            lastKnownUsage: this.lastKnownUsage,
            alertThresholds: this.config.alertThresholds,
            activeAlerts: this.alertThrottle.size
        };
    }
}

// Export singleton instance
module.exports = new StorageMonitor();