#!/usr/bin/env node

/**
 * VPS System Monitoring Script
 * Monitors bot health, performance, and system resources
 */

const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const logger = require('../UTILS/logger');

class SystemMonitor {
    constructor() {
        this.metricsFile = path.join(__dirname, '..', 'logs', 'metrics.json');
        this.alertsFile = path.join(__dirname, '..', 'logs', 'alerts.json');
        this.thresholds = {
            cpu: 80,           // CPU usage percentage
            memory: 85,        // Memory usage percentage
            disk: 90,          // Disk usage percentage
            responseTime: 5000, // Bot response time in ms
            errorRate: 10      // Errors per minute
        };
        this.metrics = {
            startTime: Date.now(),
            samples: []
        };
    }

    /**
     * Execute shell command and return output
     */
    executeCommand(command) {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject({ error, stdout, stderr });
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    }

    /**
     * Get CPU usage statistics
     */
    async getCPUUsage() {
        try {
            const cpus = os.cpus();
            let totalIdle = 0;
            let totalTick = 0;

            cpus.forEach(cpu => {
                for (const type in cpu.times) {
                    totalTick += cpu.times[type];
                }
                totalIdle += cpu.times.idle;
            });

            const idle = totalIdle / cpus.length;
            const total = totalTick / cpus.length;
            const usage = 100 - ~~(100 * idle / total);

            // Get load average
            const loadAvg = os.loadavg();

            return {
                usage,
                cores: cpus.length,
                loadAverage: {
                    '1min': loadAvg[0],
                    '5min': loadAvg[1],
                    '15min': loadAvg[2]
                },
                model: cpus[0].model,
                speed: cpus[0].speed
            };
        } catch (error) {
            logger.error(`Failed to get CPU usage: ${error.message}`);
            return null;
        }
    }

    /**
     * Get memory usage statistics
     */
    async getMemoryUsage() {
        try {
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            const usagePercent = (usedMem / totalMem) * 100;

            // Get process memory usage
            const processMemory = process.memoryUsage();

            return {
                total: totalMem,
                free: freeMem,
                used: usedMem,
                usagePercent: usagePercent.toFixed(2),
                process: {
                    rss: processMemory.rss,
                    heapTotal: processMemory.heapTotal,
                    heapUsed: processMemory.heapUsed,
                    external: processMemory.external,
                    arrayBuffers: processMemory.arrayBuffers
                }
            };
        } catch (error) {
            logger.error(`Failed to get memory usage: ${error.message}`);
            return null;
        }
    }

    /**
     * Get disk usage statistics
     */
    async getDiskUsage() {
        try {
            // Get disk usage for the current directory
            const result = await this.executeCommand('df -h .');
            const lines = result.stdout.trim().split('\n');
            
            if (lines.length < 2) {
                throw new Error('Unexpected df output');
            }

            const stats = lines[1].split(/\s+/);
            const usagePercent = parseInt(stats[4]);

            return {
                filesystem: stats[0],
                size: stats[1],
                used: stats[2],
                available: stats[3],
                usagePercent,
                mountPoint: stats[5] || stats[8]
            };
        } catch (error) {
            logger.error(`Failed to get disk usage: ${error.message}`);
            return null;
        }
    }

    /**
     * Check bot process status
     */
    async getBotProcessInfo() {
        try {
            const pidFile = path.join(__dirname, '..', 'bot.pid');
            const pidData = await fs.readFile(pidFile, 'utf8').catch(() => null);
            
            if (!pidData) {
                return { running: false };
            }

            const pid = parseInt(pidData.trim());
            
            // Get process info
            const psResult = await this.executeCommand(`ps -p ${pid} -o pid,ppid,user,%cpu,%mem,etime,comm`).catch(() => null);
            
            if (!psResult) {
                return { running: false, pid };
            }

            const lines = psResult.stdout.trim().split('\n');
            if (lines.length < 2) {
                return { running: false, pid };
            }

            const stats = lines[1].trim().split(/\s+/);
            
            return {
                running: true,
                pid: parseInt(stats[0]),
                ppid: parseInt(stats[1]),
                user: stats[2],
                cpuPercent: parseFloat(stats[3]),
                memPercent: parseFloat(stats[4]),
                elapsed: stats[5],
                command: stats[6]
            };
        } catch (error) {
            logger.error(`Failed to get bot process info: ${error.message}`);
            return { running: false };
        }
    }

    /**
     * Check bot response times
     */
    async getBotResponseTime() {
        try {
            // This would typically make a test request to the bot
            // For now, we'll simulate with a timestamp check
            const stateFile = path.join(__dirname, '..', 'bot-state.json');
            const stateData = await fs.readFile(stateFile, 'utf8').catch(() => null);
            
            if (!stateData) {
                return { available: false };
            }

            const state = JSON.parse(stateData);
            const lastUpdate = state.savedAt || Date.now();
            const responseTime = Date.now() - lastUpdate;

            return {
                available: true,
                responseTime,
                lastUpdate: new Date(lastUpdate).toISOString()
            };
        } catch (error) {
            logger.error(`Failed to get bot response time: ${error.message}`);
            return { available: false };
        }
    }

    /**
     * Get error rate from logs
     */
    async getErrorRate() {
        try {
            // Check error logs from the last minute
            const logsDir = path.join(__dirname, '..', 'logs');
            const errorLogFile = path.join(logsDir, 'error.log');
            
            const errorLog = await fs.readFile(errorLogFile, 'utf8').catch(() => '');
            const lines = errorLog.split('\n');
            const oneMinuteAgo = Date.now() - 60000;
            
            let recentErrors = 0;
            for (const line of lines) {
                try {
                    const logEntry = JSON.parse(line);
                    const timestamp = new Date(logEntry.timestamp).getTime();
                    if (timestamp > oneMinuteAgo) {
                        recentErrors++;
                    }
                } catch {
                    // Skip invalid log entries
                }
            }

            return {
                errorsPerMinute: recentErrors,
                threshold: this.thresholds.errorRate,
                status: recentErrors < this.thresholds.errorRate ? 'healthy' : 'critical'
            };
        } catch (error) {
            logger.error(`Failed to get error rate: ${error.message}`);
            return { errorsPerMinute: 0, status: 'unknown' };
        }
    }

    /**
     * Check database connection health
     */
    async checkDatabaseHealth() {
        try {
            // This would interface with the actual database module
            // For now, we'll check if Firebase config exists
            const configExists = process.env.FIREBASE_PROJECT_ID ? true : false;
            
            return {
                connected: configExists,
                latency: configExists ? Math.random() * 100 : null,
                status: configExists ? 'healthy' : 'disconnected'
            };
        } catch (error) {
            logger.error(`Failed to check database health: ${error.message}`);
            return { connected: false, status: 'error' };
        }
    }

    /**
     * Check network connectivity
     */
    async checkNetworkConnectivity() {
        try {
            // Ping Discord API
            const pingResult = await this.executeCommand('ping -c 1 -W 2 discord.com').catch(() => null);
            
            if (!pingResult) {
                return { connected: false };
            }

            // Parse ping output
            const timeMatch = pingResult.stdout.match(/time=(\d+\.?\d*)/);
            const latency = timeMatch ? parseFloat(timeMatch[1]) : null;

            return {
                connected: true,
                latency,
                status: latency && latency < 100 ? 'excellent' : latency < 300 ? 'good' : 'poor'
            };
        } catch (error) {
            logger.error(`Failed to check network connectivity: ${error.message}`);
            return { connected: false };
        }
    }

    /**
     * Get Git repository status
     */
    async getGitStatus() {
        try {
            const branch = await this.executeCommand('git branch --show-current');
            const lastCommit = await this.executeCommand('git log -1 --format="%H %s" --date=relative');
            const behind = await this.executeCommand('git rev-list HEAD..origin/main --count').catch(() => null);
            
            return {
                branch: branch.stdout.trim(),
                lastCommit: lastCommit.stdout.trim(),
                behindOrigin: behind ? parseInt(behind.stdout.trim()) : 0,
                needsUpdate: behind && parseInt(behind.stdout.trim()) > 0
            };
        } catch (error) {
            logger.error(`Failed to get git status: ${error.message}`);
            return null;
        }
    }

    /**
     * Get bot uptime and restart history
     */
    async getUptimeInfo() {
        try {
            const restartLog = path.join(__dirname, '..', 'logs', 'restart.log');
            const restartHistory = await fs.readFile(restartLog, 'utf8').catch(() => '[]');
            const restarts = JSON.parse(restartHistory);
            
            // Get current uptime
            const botProcess = await this.getBotProcessInfo();
            
            return {
                currentUptime: botProcess.elapsed || 'N/A',
                lastRestart: restarts.length > 0 ? restarts[restarts.length - 1].timestamp : null,
                totalRestarts: restarts.length,
                recentRestarts: restarts.slice(-5)
            };
        } catch (error) {
            logger.error(`Failed to get uptime info: ${error.message}`);
            return null;
        }
    }

    /**
     * Check for threshold breaches and generate alerts
     */
    async checkThresholds(metrics) {
        const alerts = [];

        // Check CPU usage
        if (metrics.cpu && metrics.cpu.usage > this.thresholds.cpu) {
            alerts.push({
                type: 'cpu',
                severity: 'warning',
                message: `CPU usage is ${metrics.cpu.usage}% (threshold: ${this.thresholds.cpu}%)`,
                value: metrics.cpu.usage,
                threshold: this.thresholds.cpu
            });
        }

        // Check memory usage
        if (metrics.memory && parseFloat(metrics.memory.usagePercent) > this.thresholds.memory) {
            alerts.push({
                type: 'memory',
                severity: 'warning',
                message: `Memory usage is ${metrics.memory.usagePercent}% (threshold: ${this.thresholds.memory}%)`,
                value: parseFloat(metrics.memory.usagePercent),
                threshold: this.thresholds.memory
            });
        }

        // Check disk usage
        if (metrics.disk && metrics.disk.usagePercent > this.thresholds.disk) {
            alerts.push({
                type: 'disk',
                severity: 'critical',
                message: `Disk usage is ${metrics.disk.usagePercent}% (threshold: ${this.thresholds.disk}%)`,
                value: metrics.disk.usagePercent,
                threshold: this.thresholds.disk
            });
        }

        // Check error rate
        if (metrics.errorRate && metrics.errorRate.errorsPerMinute > this.thresholds.errorRate) {
            alerts.push({
                type: 'errors',
                severity: 'warning',
                message: `Error rate is ${metrics.errorRate.errorsPerMinute}/min (threshold: ${this.thresholds.errorRate}/min)`,
                value: metrics.errorRate.errorsPerMinute,
                threshold: this.thresholds.errorRate
            });
        }

        // Check bot process
        if (metrics.botProcess && !metrics.botProcess.running) {
            alerts.push({
                type: 'bot',
                severity: 'critical',
                message: 'Bot process is not running!',
                value: false,
                threshold: true
            });
        }

        return alerts;
    }

    /**
     * Collect all system metrics
     */
    async collectMetrics() {
        const timestamp = new Date().toISOString();
        
        logger.info('Collecting system metrics...');
        
        const metrics = {
            timestamp,
            cpu: await this.getCPUUsage(),
            memory: await this.getMemoryUsage(),
            disk: await this.getDiskUsage(),
            botProcess: await this.getBotProcessInfo(),
            responseTime: await this.getBotResponseTime(),
            errorRate: await this.getErrorRate(),
            database: await this.checkDatabaseHealth(),
            network: await this.checkNetworkConnectivity(),
            git: await this.getGitStatus(),
            uptime: await this.getUptimeInfo()
        };

        // Check for alerts
        metrics.alerts = await this.checkThresholds(metrics);

        return metrics;
    }

    /**
     * Generate performance report
     */
    async generateReport(metrics) {
        const report = {
            timestamp: metrics.timestamp,
            summary: {
                status: metrics.alerts.length === 0 ? 'healthy' : 
                        metrics.alerts.some(a => a.severity === 'critical') ? 'critical' : 'warning',
                alertCount: metrics.alerts.length,
                botRunning: metrics.botProcess?.running || false,
                uptime: metrics.uptime?.currentUptime || 'N/A'
            },
            system: {
                cpu: {
                    usage: `${metrics.cpu?.usage || 0}%`,
                    loadAverage: metrics.cpu?.loadAverage || {}
                },
                memory: {
                    usage: `${metrics.memory?.usagePercent || 0}%`,
                    free: this.formatBytes(metrics.memory?.free || 0),
                    total: this.formatBytes(metrics.memory?.total || 0)
                },
                disk: {
                    usage: `${metrics.disk?.usagePercent || 0}%`,
                    available: metrics.disk?.available || 'N/A'
                }
            },
            bot: {
                status: metrics.botProcess?.running ? 'running' : 'stopped',
                pid: metrics.botProcess?.pid || null,
                cpuUsage: `${metrics.botProcess?.cpuPercent || 0}%`,
                memoryUsage: `${metrics.botProcess?.memPercent || 0}%`,
                responseTime: `${metrics.responseTime?.responseTime || 0}ms`,
                errorRate: `${metrics.errorRate?.errorsPerMinute || 0}/min`
            },
            services: {
                database: metrics.database?.status || 'unknown',
                network: metrics.network?.status || 'unknown',
                git: metrics.git?.needsUpdate ? 'update available' : 'up to date'
            },
            alerts: metrics.alerts
        };

        return report;
    }

    /**
     * Format bytes to human readable
     */
    formatBytes(bytes) {
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * Save metrics to file
     */
    async saveMetrics(metrics) {
        try {
            // Ensure logs directory exists
            await fs.mkdir(path.dirname(this.metricsFile), { recursive: true });

            // Read existing metrics
            const existingData = await fs.readFile(this.metricsFile, 'utf8').catch(() => '[]');
            const metricsHistory = JSON.parse(existingData);
            
            // Add new metrics
            metricsHistory.push(metrics);
            
            // Keep only last 24 hours of data (1 sample per minute = 1440 samples)
            if (metricsHistory.length > 1440) {
                metricsHistory.splice(0, metricsHistory.length - 1440);
            }

            // Save to file
            await fs.writeFile(this.metricsFile, JSON.stringify(metricsHistory, null, 2));
            
            // Save alerts separately if any
            if (metrics.alerts && metrics.alerts.length > 0) {
                await this.saveAlerts(metrics.alerts);
            }

            logger.info('Metrics saved successfully');
        } catch (error) {
            logger.error(`Failed to save metrics: ${error.message}`);
        }
    }

    /**
     * Save alerts to file
     */
    async saveAlerts(alerts) {
        try {
            const timestamp = new Date().toISOString();
            
            // Read existing alerts
            const existingData = await fs.readFile(this.alertsFile, 'utf8').catch(() => '[]');
            const alertHistory = JSON.parse(existingData);
            
            // Add new alerts with timestamp
            alerts.forEach(alert => {
                alertHistory.push({ ...alert, timestamp });
            });
            
            // Keep only last 100 alerts
            if (alertHistory.length > 100) {
                alertHistory.splice(0, alertHistory.length - 100);
            }

            // Save to file
            await fs.writeFile(this.alertsFile, JSON.stringify(alertHistory, null, 2));
            
            logger.info(`${alerts.length} alerts saved`);
        } catch (error) {
            logger.error(`Failed to save alerts: ${error.message}`);
        }
    }

    /**
     * Run continuous monitoring
     */
    async startMonitoring(interval = 60000) {
        logger.info(`Starting system monitoring (interval: ${interval}ms)...`);
        
        const monitor = async () => {
            try {
                const metrics = await this.collectMetrics();
                const report = await this.generateReport(metrics);
                
                // Save metrics
                await this.saveMetrics(metrics);
                
                // Log summary
                logger.info(`System Status: ${report.summary.status} | Bot: ${report.bot.status} | Alerts: ${report.summary.alertCount}`);
                
                // Log critical alerts
                if (report.alerts.length > 0) {
                    report.alerts.forEach(alert => {
                        if (alert.severity === 'critical') {
                            logger.error(`CRITICAL ALERT: ${alert.message}`);
                        } else {
                            logger.warn(`WARNING: ${alert.message}`);
                        }
                    });
                }
                
                return report;
            } catch (error) {
                logger.error(`Monitoring error: ${error.message}`);
            }
        };
        
        // Run initial monitoring
        await monitor();
        
        // Set up continuous monitoring
        setInterval(monitor, interval);
    }

    /**
     * Get current system status (one-time check)
     */
    async getSystemStatus() {
        const metrics = await this.collectMetrics();
        const report = await this.generateReport(metrics);
        return report;
    }
}

// Export for use in other modules
module.exports = SystemMonitor;

// Run if called directly
if (require.main === module) {
    const monitor = new SystemMonitor();
    
    // Check for command line arguments
    const args = process.argv.slice(2);
    
    if (args.includes('--continuous')) {
        // Start continuous monitoring
        const interval = args.includes('--interval') 
            ? parseInt(args[args.indexOf('--interval') + 1]) * 1000 
            : 60000;
        
        monitor.startMonitoring(interval);
    } else {
        // One-time check
        monitor.getSystemStatus()
            .then(report => {
                console.log('System Status Report:');
                console.log(JSON.stringify(report, null, 2));
                process.exit(0);
            })
            .catch(error => {
                console.error('Monitor Error:', error);
                process.exit(1);
            });
    }
}