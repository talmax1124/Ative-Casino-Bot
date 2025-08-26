/**
 * System Information Utilities
 * Provides system monitoring and information gathering
 */

const os = require('os');
const fs = require('fs').promises;
const { exec } = require('child_process');
const logger = require('../../UTILS/logger');

class SystemInfo {
    constructor() {
        this.platform = os.platform();
    }

    /**
     * Execute system command
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
     * Get CPU information
     */
    getCPUInfo() {
        const cpus = os.cpus();
        return {
            model: cpus[0]?.model || 'Unknown',
            speed: cpus[0]?.speed || 0,
            cores: cpus.length,
            architecture: os.arch()
        };
    }

    /**
     * Get memory information
     */
    getMemoryInfo() {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        return {
            total: totalMem,
            free: freeMem,
            used: usedMem,
            usagePercent: ((usedMem / totalMem) * 100).toFixed(2),
            processMemory: process.memoryUsage()
        };
    }

    /**
     * Get disk usage (Unix-like systems)
     */
    async getDiskUsage(path = '.') {
        try {
            const result = await this.executeCommand(`df -h ${path}`);
            const lines = result.stdout.trim().split('\n');
            
            if (lines.length < 2) {
                throw new Error('Unexpected df output');
            }

            const parts = lines[1].split(/\s+/);
            return {
                filesystem: parts[0],
                size: parts[1],
                used: parts[2],
                available: parts[3],
                usePercent: parseInt(parts[4]),
                mountPoint: parts[5] || parts[8]
            };
        } catch (error) {
            logger.error(`Failed to get disk usage: ${error.message}`);
            return null;
        }
    }

    /**
     * Get network information
     */
    getNetworkInfo() {
        const interfaces = os.networkInterfaces();
        const networks = [];

        for (const [name, nets] of Object.entries(interfaces)) {
            for (const net of nets) {
                if (!net.internal) {
                    networks.push({
                        interface: name,
                        address: net.address,
                        family: net.family,
                        mac: net.mac
                    });
                }
            }
        }

        return networks;
    }

    /**
     * Get system uptime
     */
    getUptime() {
        const uptime = os.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        
        return {
            seconds: uptime,
            formatted: `${days}d ${hours}h ${minutes}m`
        };
    }

    /**
     * Get load average (Unix-like systems)
     */
    getLoadAverage() {
        const loads = os.loadavg();
        return {
            '1min': loads[0].toFixed(2),
            '5min': loads[1].toFixed(2),
            '15min': loads[2].toFixed(2)
        };
    }

    /**
     * Check network connectivity
     */
    async checkConnectivity(host = 'google.com') {
        try {
            const result = await this.executeCommand(`ping -c 1 -W 2 ${host}`);
            const match = result.stdout.match(/time=(\d+\.?\d*)/);
            const latency = match ? parseFloat(match[1]) : null;
            
            return {
                connected: true,
                latency,
                host
            };
        } catch (error) {
            return {
                connected: false,
                error: error.message,
                host
            };
        }
    }

    /**
     * Get running processes
     */
    async getProcesses() {
        try {
            const result = await this.executeCommand('ps aux');
            const lines = result.stdout.trim().split('\n').slice(1); // Skip header
            
            const processes = lines.map(line => {
                const parts = line.trim().split(/\s+/);
                return {
                    user: parts[0],
                    pid: parseInt(parts[1]),
                    cpu: parseFloat(parts[2]),
                    memory: parseFloat(parts[3]),
                    command: parts.slice(10).join(' ')
                };
            });

            return processes.slice(0, 10); // Return top 10 processes
        } catch (error) {
            logger.error(`Failed to get processes: ${error.message}`);
            return [];
        }
    }

    /**
     * Get environment information
     */
    getEnvironmentInfo() {
        return {
            platform: os.platform(),
            release: os.release(),
            hostname: os.hostname(),
            nodeVersion: process.version,
            pid: process.pid,
            workingDirectory: process.cwd(),
            environment: process.env.NODE_ENV || 'development'
        };
    }

    /**
     * Get comprehensive system overview
     */
    async getSystemOverview() {
        try {
            const [diskUsage, connectivity, processes] = await Promise.all([
                this.getDiskUsage(),
                this.checkConnectivity(),
                this.getProcesses()
            ]);

            return {
                timestamp: new Date().toISOString(),
                cpu: this.getCPUInfo(),
                memory: this.getMemoryInfo(),
                disk: diskUsage,
                network: {
                    interfaces: this.getNetworkInfo(),
                    connectivity
                },
                uptime: this.getUptime(),
                loadAverage: this.getLoadAverage(),
                processes: processes.slice(0, 5), // Top 5 processes
                environment: this.getEnvironmentInfo()
            };
        } catch (error) {
            logger.error(`Failed to get system overview: ${error.message}`);
            throw error;
        }
    }

    /**
     * Format bytes to human readable
     */
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    /**
     * Get system health status
     */
    async getHealthStatus() {
        try {
            const overview = await this.getSystemOverview();
            const health = {
                status: 'healthy',
                issues: [],
                warnings: []
            };

            // Check CPU usage (if load average is available)
            if (overview.loadAverage) {
                const load1m = parseFloat(overview.loadAverage['1min']);
                if (load1m > overview.cpu.cores * 2) {
                    health.issues.push('High CPU load detected');
                    health.status = 'warning';
                } else if (load1m > overview.cpu.cores * 1.5) {
                    health.warnings.push('Elevated CPU load');
                }
            }

            // Check memory usage
            const memUsage = parseFloat(overview.memory.usagePercent);
            if (memUsage > 90) {
                health.issues.push(`High memory usage: ${memUsage}%`);
                health.status = 'critical';
            } else if (memUsage > 80) {
                health.warnings.push(`Elevated memory usage: ${memUsage}%`);
                if (health.status === 'healthy') health.status = 'warning';
            }

            // Check disk usage
            if (overview.disk && overview.disk.usePercent > 90) {
                health.issues.push(`High disk usage: ${overview.disk.usePercent}%`);
                health.status = 'critical';
            } else if (overview.disk && overview.disk.usePercent > 80) {
                health.warnings.push(`Elevated disk usage: ${overview.disk.usePercent}%`);
                if (health.status === 'healthy') health.status = 'warning';
            }

            // Check connectivity
            if (!overview.network.connectivity.connected) {
                health.issues.push('Network connectivity issues detected');
                health.status = 'critical';
            }

            health.summary = {
                cpu: overview.loadAverage ? `Load: ${overview.loadAverage['1min']}` : 'N/A',
                memory: `${overview.memory.usagePercent}%`,
                disk: overview.disk ? `${overview.disk.usePercent}%` : 'N/A',
                uptime: overview.uptime.formatted
            };

            return health;
        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                issues: ['Failed to get system health status']
            };
        }
    }
}

module.exports = SystemInfo;