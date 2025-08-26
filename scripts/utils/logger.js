/**
 * Script Logging Utilities
 * Enhanced logging for VPS management scripts
 */

const fs = require('fs').promises;
const path = require('path');

class ScriptLogger {
    constructor(scriptName) {
        this.scriptName = scriptName;
        this.logsDir = path.join(__dirname, '../..', 'logs');
        this.logFile = path.join(this.logsDir, `${scriptName}.log`);
        this.maxLogSize = 10 * 1024 * 1024; // 10MB
        this.maxLogFiles = 5;
    }

    /**
     * Ensure logs directory exists
     */
    async ensureLogsDir() {
        try {
            await fs.mkdir(this.logsDir, { recursive: true });
        } catch (error) {
            console.error(`Failed to create logs directory: ${error.message}`);
        }
    }

    /**
     * Format log entry
     */
    formatLogEntry(level, message, metadata = {}) {
        return JSON.stringify({
            timestamp: new Date().toISOString(),
            script: this.scriptName,
            level,
            message,
            pid: process.pid,
            user: process.env.USER || process.env.USERNAME,
            ...metadata
        }) + '\n';
    }

    /**
     * Rotate logs if needed
     */
    async rotateLogsIfNeeded() {
        try {
            const stats = await fs.stat(this.logFile).catch(() => null);
            
            if (stats && stats.size > this.maxLogSize) {
                // Rotate existing logs
                for (let i = this.maxLogFiles - 1; i > 0; i--) {
                    const oldFile = `${this.logFile}.${i}`;
                    const newFile = `${this.logFile}.${i + 1}`;
                    
                    try {
                        await fs.rename(oldFile, newFile);
                    } catch (error) {
                        // File might not exist
                    }
                }
                
                // Move current log to .1
                await fs.rename(this.logFile, `${this.logFile}.1`);
                
                console.log(`Rotated logs for ${this.scriptName}`);
            }
        } catch (error) {
            console.error(`Failed to rotate logs: ${error.message}`);
        }
    }

    /**
     * Write log entry
     */
    async writeLog(level, message, metadata = {}) {
        try {
            await this.ensureLogsDir();
            await this.rotateLogsIfNeeded();
            
            const logEntry = this.formatLogEntry(level, message, metadata);
            await fs.appendFile(this.logFile, logEntry);
            
            // Also log to console for immediate feedback
            const timestamp = new Date().toLocaleString();
            console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
            
        } catch (error) {
            console.error(`Failed to write log: ${error.message}`);
        }
    }

    /**
     * Info level logging
     */
    async info(message, metadata = {}) {
        await this.writeLog('info', message, metadata);
    }

    /**
     * Warning level logging
     */
    async warn(message, metadata = {}) {
        await this.writeLog('warn', message, metadata);
    }

    /**
     * Error level logging
     */
    async error(message, metadata = {}) {
        await this.writeLog('error', message, metadata);
    }

    /**
     * Debug level logging
     */
    async debug(message, metadata = {}) {
        if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
            await this.writeLog('debug', message, metadata);
        }
    }

    /**
     * Start operation logging
     */
    async startOperation(operation, metadata = {}) {
        await this.info(`Starting ${operation}`, { 
            operation, 
            operationId: metadata.operationId || Date.now(),
            ...metadata 
        });
    }

    /**
     * Complete operation logging
     */
    async completeOperation(operation, duration, success = true, metadata = {}) {
        const level = success ? 'info' : 'error';
        const status = success ? 'completed' : 'failed';
        
        await this.writeLog(level, `Operation ${operation} ${status} in ${duration}ms`, {
            operation,
            duration,
            success,
            ...metadata
        });
    }

    /**
     * Log execution results
     */
    async logResults(operation, results) {
        await this.info(`${operation} results`, {
            operation,
            success: results.success,
            duration: results.duration,
            steps: results.steps?.length || 0,
            errors: results.error ? 1 : 0
        });
        
        if (results.error) {
            await this.error(`${operation} error: ${results.error}`);
        }
    }

    /**
     * Get recent logs
     */
    async getRecentLogs(lines = 50) {
        try {
            const logContent = await fs.readFile(this.logFile, 'utf8');
            const logLines = logContent.trim().split('\n');
            
            return logLines
                .slice(-lines)
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return { message: line };
                    }
                });
        } catch (error) {
            return [];
        }
    }

    /**
     * Clear logs
     */
    async clearLogs() {
        try {
            await fs.unlink(this.logFile);
            await this.info('Logs cleared');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }

    /**
     * Get log statistics
     */
    async getLogStats() {
        try {
            const logs = await this.getRecentLogs(1000);
            const stats = {
                total: logs.length,
                levels: {},
                errors: 0,
                lastEntry: null
            };

            logs.forEach(log => {
                if (log.level) {
                    stats.levels[log.level] = (stats.levels[log.level] || 0) + 1;
                    if (log.level === 'error') {
                        stats.errors++;
                    }
                }
            });

            stats.lastEntry = logs[logs.length - 1];
            
            return stats;
        } catch (error) {
            return {
                total: 0,
                levels: {},
                errors: 0,
                error: error.message
            };
        }
    }
}

module.exports = ScriptLogger;