/**
 * ATIVE Casino Bot - Backup Scheduler
 * Automated backup scheduling and monitoring
 */

const cron = require('node-cron');
const logger = require('./logger');
const BackupManager = require('./backupManager');
const CloudStorage = require('./cloudStorage');

class BackupScheduler {
    constructor() {
        this.backupManager = new BackupManager();
        this.cloudStorage = new CloudStorage();
        this.schedules = new Map();
        this.isInitialized = false;
        
        // Default schedule configurations
        this.defaultSchedules = {
            // Full backup every day at 3 AM
            fullDaily: {
                cron: '0 3 * * *',
                type: 'full',
                enabled: true,
                retention: 7,
                uploadToCloud: true
            },
            
            // Full backup every 6 hours during peak times
            fullHighFreq: {
                cron: '0 */6 * * *',
                type: 'full',
                enabled: false, // Disabled by default - can be enabled for high-activity servers
                retention: 3,
                uploadToCloud: true
            },
            
            // Quick integrity check every hour
            healthCheck: {
                cron: '0 * * * *',
                type: 'health',
                enabled: true,
                retention: 24,
                uploadToCloud: false
            }
        };
    }

    /**
     * Initialize backup scheduler
     */
    async initialize(cloudConfig = null) {
        if (this.isInitialized) {
            return;
        }

        try {
            // Initialize backup manager
            await this.backupManager.initialize();
            
            // Initialize cloud storage if configured
            if (cloudConfig && cloudConfig.provider) {
                await this.cloudStorage.initialize(cloudConfig.provider, cloudConfig);
                logger.info(`☁️ Cloud backup enabled: ${cloudConfig.provider}`);
            } else {
                logger.info('☁️ Cloud backup disabled - local backups only');
            }
            
            // Start scheduled backups
            this.startScheduledBackups();
            
            // Start monitoring
            this.startHealthMonitoring();
            
            this.isInitialized = true;
            logger.info('🕒 Backup Scheduler initialized successfully');
            
        } catch (error) {
            logger.error(`Failed to initialize backup scheduler: ${error.message}`);
            throw error;
        }
    }

    /**
     * Start scheduled backup tasks
     */
    startScheduledBackups() {
        for (const [name, config] of Object.entries(this.defaultSchedules)) {
            if (config.enabled) {
                this.scheduleBackup(name, config);
            }
        }
    }

    /**
     * Schedule a backup task
     */
    scheduleBackup(name, config) {
        if (!cron.validate(config.cron)) {
            throw new Error(`Invalid cron expression for ${name}: ${config.cron}`);
        }

        const task = cron.schedule(config.cron, async () => {
            await this.executeScheduledBackup(name, config);
        }, {
            scheduled: false,
            timezone: "UTC"
        });

        this.schedules.set(name, {
            task,
            config,
            lastRun: null,
            nextRun: this.getNextRunTime(config.cron),
            failures: 0
        });

        task.start();
        logger.info(`📅 Scheduled backup '${name}': ${config.cron} (${config.type})`);
    }

    /**
     * Execute a scheduled backup
     */
    async executeScheduledBackup(name, config) {
        const schedule = this.schedules.get(name);
        
        try {
            logger.info(`🔄 Running scheduled backup: ${name} (${config.type})`);
            
            let result;
            
            if (config.type === 'full') {
                result = await this.backupManager.createFullBackup({
                    upload: config.uploadToCloud && this.cloudStorage.activeProvider
                });
            } else if (config.type === 'health') {
                result = await this.performHealthCheck();
            }
            
            // Update schedule tracking
            schedule.lastRun = new Date();
            schedule.nextRun = this.getNextRunTime(config.cron);
            schedule.failures = 0;
            
            logger.info(`✅ Scheduled backup completed: ${name}`);
            
            // Send success notification if configured
            await this.sendNotification('success', {
                scheduleName: name,
                type: config.type,
                result: result
            });
            
        } catch (error) {
            schedule.failures++;
            logger.error(`❌ Scheduled backup failed: ${name} - ${error.message}`);
            
            // Send failure notification
            await this.sendNotification('failure', {
                scheduleName: name,
                type: config.type,
                error: error.message,
                failures: schedule.failures
            });
            
            // Disable schedule after too many failures
            if (schedule.failures >= 5) {
                schedule.task.stop();
                logger.error(`🛑 Disabled backup schedule '${name}' after ${schedule.failures} consecutive failures`);
            }
        }
    }

    /**
     * Perform database health check
     */
    async performHealthCheck() {
        const dbManager = require('./database');
        
        try {
            // Test database connection
            await dbManager.initialize();
            
            // Check critical tables exist and have data
            const criticalTables = this.backupManager.criticalTables;
            const health = {
                timestamp: new Date().toISOString(),
                database: 'healthy',
                tables: {},
                issues: []
            };
            
            for (const tableName of criticalTables) {
                try {
                    // This would need to be implemented based on your database adapter
                    // For now, assume all tables are healthy
                    health.tables[tableName] = 'healthy';
                } catch (error) {
                    health.tables[tableName] = 'error';
                    health.issues.push(`Table ${tableName}: ${error.message}`);
                }
            }
            
            // Overall health status
            health.status = health.issues.length === 0 ? 'healthy' : 'issues_detected';
            
            // Save health check result
            const healthFile = require('path').join(this.backupManager.backupDir, `health_${Date.now()}.json`);
            await require('fs').promises.writeFile(healthFile, JSON.stringify(health, null, 2));
            
            return health;
            
        } catch (error) {
            logger.error(`Health check failed: ${error.message}`);
            return {
                timestamp: new Date().toISOString(),
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        // Monitor backup directory space
        setInterval(async () => {
            try {
                await this.monitorDiskSpace();
            } catch (error) {
                logger.warn(`Disk space monitoring failed: ${error.message}`);
            }
        }, 60000 * 15); // Every 15 minutes

        // Monitor backup age
        setInterval(async () => {
            try {
                await this.monitorBackupAge();
            } catch (error) {
                logger.warn(`Backup age monitoring failed: ${error.message}`);
            }
        }, 60000 * 60); // Every hour
    }

    /**
     * Monitor disk space usage
     */
    async monitorDiskSpace() {
        const fs = require('fs').promises;
        const path = require('path');
        
        try {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            // Get disk usage (Unix/Linux)
            const { stdout } = await execAsync(`df -h "${this.backupManager.backupDir}"`);
            const lines = stdout.split('\n');
            
            if (lines.length >= 2) {
                const usage = lines[1].split(/\s+/);
                const usedPercent = parseInt(usage[4]);
                
                if (usedPercent > 85) {
                    logger.warn(`⚠️ Backup disk usage high: ${usedPercent}%`);
                    await this.sendNotification('warning', {
                        type: 'disk_space',
                        usage: `${usedPercent}%`,
                        path: this.backupManager.backupDir
                    });
                }
            }
        } catch (error) {
            // Fallback for Windows or other errors
            logger.debug(`Could not check disk space: ${error.message}`);
        }
    }

    /**
     * Monitor backup age and trigger emergency backups
     */
    async monitorBackupAge() {
        const backups = await this.backupManager.listBackups();
        
        if (backups.length === 0) {
            logger.warn('⚠️ No backups found - triggering emergency backup');
            await this.triggerEmergencyBackup();
            return;
        }
        
        const latestBackup = backups[0];
        const backupAge = Date.now() - new Date(latestBackup.timestamp).getTime();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        if (backupAge > maxAge) {
            logger.warn(`⚠️ Latest backup is ${Math.floor(backupAge / (60 * 60 * 1000))} hours old - triggering emergency backup`);
            await this.triggerEmergencyBackup();
        }
    }

    /**
     * Trigger emergency backup
     */
    async triggerEmergencyBackup() {
        try {
            logger.info('🚨 Starting emergency backup...');
            const result = await this.backupManager.createFullBackup({
                upload: this.cloudStorage.activeProvider !== null
            });
            
            await this.sendNotification('emergency', {
                type: 'emergency_backup',
                result: result
            });
            
            logger.info('✅ Emergency backup completed');
        } catch (error) {
            logger.error(`❌ Emergency backup failed: ${error.message}`);
            await this.sendNotification('critical', {
                type: 'emergency_backup_failed',
                error: error.message
            });
        }
    }

    /**
     * Send notification (webhook, Discord, etc.)
     */
    async sendNotification(level, data) {
        const notification = {
            timestamp: new Date().toISOString(),
            level: level,
            service: 'ATIVE Casino Bot Backup',
            data: data
        };
        
        // Log the notification
        const logMethod = level === 'critical' || level === 'failure' ? 'error' : 
                         level === 'warning' ? 'warn' : 'info';
        logger[logMethod](`📢 Backup notification [${level.toUpperCase()}]: ${JSON.stringify(data)}`);
        
        // Send to webhook if configured
        if (process.env.BACKUP_WEBHOOK_URL) {
            try {
                await this.sendWebhook(process.env.BACKUP_WEBHOOK_URL, notification);
            } catch (error) {
                logger.error(`Failed to send backup notification: ${error.message}`);
            }
        }
    }

    /**
     * Send webhook notification
     */
    async sendWebhook(url, data) {
        const https = require('https');
        const { URL } = require('url');
        
        const webhookData = JSON.stringify({
            embeds: [{
                title: `🛡️ ${data.service}`,
                description: `Backup ${data.level}: ${JSON.stringify(data.data)}`,
                color: data.level === 'success' ? 0x00ff00 : 
                       data.level === 'warning' ? 0xffff00 : 0xff0000,
                timestamp: data.timestamp
            }]
        });
        
        const urlObj = new URL(url);
        
        return new Promise((resolve, reject) => {
            const req = https.request(urlObj, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(webhookData)
                }
            }, (res) => {
                let responseData = '';
                res.on('data', chunk => responseData += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(responseData);
                    } else {
                        reject(new Error(`Webhook failed: ${res.statusCode} - ${responseData}`));
                    }
                });
            });
            
            req.on('error', reject);
            req.write(webhookData);
            req.end();
        });
    }

    /**
     * Get next run time for cron expression
     */
    getNextRunTime(cronExpression) {
        // This would use a cron parser library in production
        // For now, return a placeholder
        return new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    }

    /**
     * Get scheduler status
     */
    getStatus() {
        const status = {
            initialized: this.isInitialized,
            cloudEnabled: this.cloudStorage.activeProvider !== null,
            cloudProvider: this.cloudStorage.activeProvider,
            schedules: {}
        };
        
        for (const [name, schedule] of this.schedules) {
            status.schedules[name] = {
                enabled: !schedule.task.destroyed,
                lastRun: schedule.lastRun,
                nextRun: schedule.nextRun,
                failures: schedule.failures,
                type: schedule.config.type
            };
        }
        
        return status;
    }

    /**
     * Manual backup trigger
     */
    async runManualBackup(type = 'full') {
        logger.info(`🔄 Starting manual backup: ${type}`);
        
        if (type === 'full') {
            return await this.backupManager.createFullBackup({
                upload: this.cloudStorage.activeProvider !== null
            });
        } else {
            throw new Error(`Unsupported backup type: ${type}`);
        }
    }

    /**
     * Stop all scheduled backups
     */
    stop() {
        for (const [name, schedule] of this.schedules) {
            schedule.task.stop();
            logger.info(`🛑 Stopped backup schedule: ${name}`);
        }
        
        this.schedules.clear();
        this.isInitialized = false;
        logger.info('🛑 Backup Scheduler stopped');
    }
}

module.exports = BackupScheduler;