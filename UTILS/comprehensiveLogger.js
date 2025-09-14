/**
 * COMPREHENSIVE LOGGING SYSTEM
 * Ultra-detailed logging for all casino operations, security, and economic activities
 */

const fs = require('fs').promises;
const path = require('path');
const { EmbedBuilder, WebhookClient } = require('discord.js');

// Logging Fallback System
class LoggingFallbackSystem {
    constructor() {
        this.fallbackMode = false;
        this.memoryBuffer = []; // Emergency in-memory log storage
        this.maxMemoryLogs = 1000; // Keep last 1000 logs in memory
        this.failedOperations = [];
        this.consecutiveFailures = 0;
        this.maxConsecutiveFailures = 5;
        this.emergencyConsoleLogging = true;
    }

    enableFallbackMode(reason) {
        if (!this.fallbackMode) {
            this.fallbackMode = true;
            this.consecutiveFailures++;
            
            // Use console as ultimate fallback
            console.error(`🚨 LOGGING FALLBACK MODE ENABLED: ${reason}`);
            console.error(`📊 Buffer size: ${this.memoryBuffer.length}, Failures: ${this.consecutiveFailures}`);
        }
    }

    disableFallbackMode() {
        if (this.fallbackMode) {
            this.fallbackMode = false;
            this.consecutiveFailures = 0;
            console.log(`✅ Logging fallback mode DISABLED - ${this.memoryBuffer.length} logs in buffer`);
        }
    }

    // Add log to emergency memory buffer
    bufferLog(logEntry) {
        this.memoryBuffer.push({
            ...logEntry,
            bufferedAt: Date.now(),
            fallbackMode: true
        });

        // Maintain buffer size
        if (this.memoryBuffer.length > this.maxMemoryLogs) {
            this.memoryBuffer.shift(); // Remove oldest
        }

        // Emergency console output
        if (this.emergencyConsoleLogging) {
            console.log(`📝 [BUFFER] ${logEntry.level} ${logEntry.component}: ${logEntry.message}`);
        }
    }

    // Attempt to flush buffered logs when system recovers
    async flushBufferedLogs(writeFunction) {
        if (this.memoryBuffer.length === 0) return;

        console.log(`🔄 Attempting to flush ${this.memoryBuffer.length} buffered logs...`);
        
        const logsToFlush = [...this.memoryBuffer];
        let flushedCount = 0;
        
        for (const logEntry of logsToFlush) {
            try {
                await writeFunction(logEntry);
                flushedCount++;
            } catch (error) {
                console.error(`Failed to flush log: ${error.message}`);
                break; // Stop if we can't write
            }
        }
        
        // Remove successfully flushed logs
        this.memoryBuffer.splice(0, flushedCount);
        console.log(`✅ Flushed ${flushedCount}/${logsToFlush.length} buffered logs`);
        
        return flushedCount;
    }

    // Get emergency status
    getStatus() {
        return {
            fallbackMode: this.fallbackMode,
            bufferedLogs: this.memoryBuffer.length,
            consecutiveFailures: this.consecutiveFailures,
            failedOperations: this.failedOperations.length,
            maxBufferSize: this.maxMemoryLogs
        };
    }

    // Track failed operations for debugging
    trackFailure(operation, error) {
        this.failedOperations.push({
            operation,
            error: error.message,
            timestamp: Date.now()
        });

        // Keep only recent failures
        if (this.failedOperations.length > 50) {
            this.failedOperations.shift();
        }
    }
}

const loggingFallback = new LoggingFallbackSystem();

class ComprehensiveLogger {
    constructor() {
        this.logDirectory = './logs';
        this.logFiles = {
            startup: 'startup.log',
            games: 'games.log',
            economy: 'economy.log',
            security: 'security.log',
            ai: 'ai.log',
            errors: 'errors.log',
            admin: 'admin.log',
            database: 'database.log',
            performance: 'performance.log'
        };
        
        this.discordWebhooks = {
            // Configure these with your Discord webhook URLs
            general: null, // process.env.DISCORD_LOG_WEBHOOK,
            security: null, // process.env.DISCORD_SECURITY_WEBHOOK,
            economy: null, // process.env.DISCORD_ECONOMY_WEBHOOK,
            errors: null   // process.env.DISCORD_ERROR_WEBHOOK
        };
        
        this.logQueue = [];
        this.isProcessing = false;
        this.sessionId = this.generateSessionId();
        this.startupTime = Date.now();
        
        this.init();
    }

    generateSessionId() {
        return `CASINO_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async init() {
        try {
            // Create logs directory
            await fs.mkdir(this.logDirectory, { recursive: true });
            
            // Create daily log files
            const today = new Date().toISOString().split('T')[0];
            for (const [category, filename] of Object.entries(this.logFiles)) {
                this.logFiles[category] = `${today}_${filename}`;
            }
            
            // Log startup
            await this.logStartup('COMPREHENSIVE_LOGGER', 'Comprehensive logging system initialized', {
                sessionId: this.sessionId,
                logDirectory: this.logDirectory,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('❌ Failed to initialize comprehensive logger:', error);
        }
    }

    /**
     * STARTUP LOGGING - Ultra detailed system initialization
     */
    async logStartup(component, message, details = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            session: this.sessionId,
            component,
            message,
            level: 'STARTUP',
            details: {
                ...details,
                uptime: Date.now() - this.startupTime,
                memory: process.memoryUsage(),
                versions: {
                    node: process.version,
                    platform: process.platform,
                    arch: process.arch
                }
            }
        };

        await this.writeToFile('startup', logEntry);
        await this.sendToDiscord('general', 'startup', logEntry);
        
        // Also console log for immediate feedback
        console.log(`🚀 [STARTUP] ${component}: ${message}`);
        if (Object.keys(details).length > 0) {
            console.log(`   📋 Details:`, JSON.stringify(details, null, 2));
        }
    }

    /**
     * GAME LOGGING - All casino game activities
     */
    async logGame(userId, username, game, action, details = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            session: this.sessionId,
            userId,
            username,
            game,
            action,
            level: 'GAME',
            details: {
                ...details,
                userAgent: details.userAgent || 'Discord Bot',
                ip: details.ip || 'Internal',
                guild: details.guildId || 'Unknown'
            }
        };

        await this.writeToFile('games', logEntry);
        
        // Log to Discord for high-value games or unusual activity
        if (details.betAmount > 100000 || details.winAmount > 500000 || details.suspicious) {
            await this.sendToDiscord('general', 'game', logEntry);
        }
        
        console.log(`🎰 [GAME] ${username} ${action} ${game}${details.betAmount ? ` ($${details.betAmount.toLocaleString()})` : ''}`);
    }

    /**
     * ECONOMIC SYSTEM LOGGING
     */
    async logEconomic(category, action, details = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            session: this.sessionId,
            category,
            action,
            level: 'ECONOMIC',
            details: {
                ...details,
                houseEdge: details.houseEdge || 'unknown',
                totalVolume: details.totalVolume || 'unknown',
                systemHealth: details.systemHealth || 'unknown'
            }
        };

        await this.writeToFile('economy', logEntry);
        
        // Always log economic changes to Discord
        if (['MULTIPLIER_ADJUSTMENT', 'HOUSE_EDGE_CHANGE', 'MAX_BET_CHANGE', 'EXPLOIT_DETECTED'].includes(action)) {
            await this.sendToDiscord('economy', 'economic', logEntry);
        }
        
        console.log(`💰 [ECONOMIC] ${category}: ${action}`);
        if (details.impact) {
            console.log(`   📊 Impact: ${details.impact}`);
        }
    }

    /**
     * SECURITY LOGGING - All security events
     */
    async logSecurity(eventType, severity, description, details = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            session: this.sessionId,
            eventType,
            severity,
            description,
            level: 'SECURITY',
            details: {
                ...details,
                threatLevel: severity,
                actionTaken: details.actionTaken || 'logged',
                affectedUsers: details.affectedUsers || []
            }
        };

        await this.writeToFile('security', logEntry);
        
        // Always send security events to Discord
        await this.sendToDiscord('security', 'security', logEntry);
        
        const severityEmoji = {
            'LOW': '🟡',
            'MEDIUM': '🟠', 
            'HIGH': '🔴',
            'CRITICAL': '🚨'
        };
        
        console.log(`${severityEmoji[severity] || '⚠️'} [SECURITY] ${eventType}: ${description}`);
    }

    /**
     * AI SYSTEM LOGGING
     */
    async logAI(component, action, details = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            session: this.sessionId,
            component,
            action,
            level: 'AI',
            details: {
                ...details,
                apiStatus: details.apiStatus || 'unknown',
                rateLimited: details.rateLimited || false,
                fallbackUsed: details.fallbackUsed || false,
                responseTime: details.responseTime || 'unknown'
            }
        };

        await this.writeToFile('ai', logEntry);
        
        // Log AI failures or rate limiting to Discord
        if (details.rateLimited || details.fallbackUsed || details.error) {
            await this.sendToDiscord('general', 'ai', logEntry);
        }
        
        console.log(`🤖 [AI] ${component}: ${action}${details.fallbackUsed ? ' (FALLBACK)' : ''}`);
    }

    /**
     * ADMIN ACTION LOGGING
     */
    async logAdmin(adminId, adminUsername, action, target, details = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            session: this.sessionId,
            adminId,
            adminUsername,
            action,
            target,
            level: 'ADMIN',
            details: {
                ...details,
                permissions: details.permissions || 'unknown',
                impact: details.impact || 'unknown',
                reversible: details.reversible || false
            }
        };

        await this.writeToFile('admin', logEntry);
        
        // Always log admin actions to Discord
        await this.sendToDiscord('general', 'admin', logEntry);
        
        console.log(`👑 [ADMIN] ${adminUsername}: ${action} -> ${target}`);
        if (details.impact) {
            console.log(`   ⚡ Impact: ${details.impact}`);
        }
    }

    /**
     * ERROR LOGGING
     */
    async logError(component, error, context = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            session: this.sessionId,
            component,
            error: {
                message: error.message,
                stack: error.stack,
                name: error.name
            },
            context,
            level: 'ERROR'
        };

        await this.writeToFile('errors', logEntry);
        
        // Send critical errors to Discord
        if (context.critical || error.name === 'DatabaseError' || context.affectsUsers) {
            await this.sendToDiscord('errors', 'error', logEntry);
        }
        
        console.error(`❌ [ERROR] ${component}: ${error.message}`);
    }

    /**
     * PERFORMANCE LOGGING
     */
    async logPerformance(operation, duration, details = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            session: this.sessionId,
            operation,
            duration,
            level: 'PERFORMANCE',
            details: {
                ...details,
                memory: process.memoryUsage(),
                cpu: details.cpu || 'unknown'
            }
        };

        await this.writeToFile('performance', logEntry);
        
        // Log slow operations to Discord
        if (duration > 5000) { // 5+ seconds
            await this.sendToDiscord('general', 'performance', logEntry);
        }
        
        if (duration > 1000) {
            console.log(`⏱️ [PERFORMANCE] ${operation}: ${duration}ms (SLOW)`);
        }
    }

    /**
     * DATABASE LOGGING
     */
    async logDatabase(operation, query, duration, details = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            session: this.sessionId,
            operation,
            query: query.substring(0, 200), // Truncate long queries
            duration,
            level: 'DATABASE',
            details: {
                ...details,
                rowsAffected: details.rowsAffected || 0,
                cached: details.cached || false
            }
        };

        await this.writeToFile('database', logEntry);
        
        if (duration > 2000 || details.error) {
            console.log(`🗄️ [DATABASE] ${operation}: ${duration}ms${details.error ? ' (ERROR)' : ''}`);
        }
    }

    /**
     * Write to file
     */
    async writeToFile(category, logEntry) {
        try {
            // Try primary file writing
            if (!loggingFallback.fallbackMode) {
                const filename = this.logFiles[category];
                const filepath = path.join(this.logDirectory, filename);
                const logLine = JSON.stringify(logEntry) + '\n';
                
                await fs.appendFile(filepath, logLine);
                
                // If successful and we were in fallback mode, try to recover
                if (loggingFallback.fallbackMode) {
                    loggingFallback.disableFallbackMode();
                    
                    // Attempt to flush any buffered logs
                    await loggingFallback.flushBufferedLogs(async (bufferedEntry) => {
                        const bufferedLine = JSON.stringify(bufferedEntry) + '\n';
                        await fs.appendFile(filepath, bufferedLine);
                    });
                }
                
                return;
            }
        } catch (error) {
            console.error(`💥 Failed to write ${category} log: ${error.message}`);
            loggingFallback.trackFailure('writeToFile', error);
            
            // Enable fallback mode
            loggingFallback.enableFallbackMode(`File write error: ${error.message}`);
        }
        
        // 🛡️ FALLBACK: Buffer log in memory
        loggingFallback.bufferLog({
            ...logEntry,
            category,
            originalTimestamp: logEntry.timestamp,
            level: logEntry.level || 'INFO'
        });
    }

    /**
     * Send to Discord webhook
     */
    async sendToDiscord(webhookType, category, logEntry) {
        try {
            const webhook = this.discordWebhooks[webhookType];
            if (!webhook) return; // No webhook configured
            
            let color = 0x00ff00;
            let emoji = '📋';
            
            switch (logEntry.level) {
                case 'STARTUP': color = 0x0099ff; emoji = '🚀'; break;
                case 'GAME': color = 0x00ff00; emoji = '🎰'; break;
                case 'ECONOMIC': color = 0xffa500; emoji = '💰'; break;
                case 'SECURITY': color = 0xff0000; emoji = '🛡️'; break;
                case 'AI': color = 0x9932cc; emoji = '🤖'; break;
                case 'ADMIN': color = 0xffd700; emoji = '👑'; break;
                case 'ERROR': color = 0xff0000; emoji = '❌'; break;
                case 'PERFORMANCE': color = 0x808080; emoji = '⏱️'; break;
                case 'DATABASE': color = 0x8b4513; emoji = '🗄️'; break;
            }
            
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`${emoji} ${logEntry.level} - ${category.toUpperCase()}`)
                .setDescription(logEntry.message || logEntry.description || logEntry.action)
                .setTimestamp()
                .addFields(
                    { name: '🕒 Time', value: logEntry.timestamp, inline: true },
                    { name: '🆔 Session', value: logEntry.session.substring(0, 16) + '...', inline: true }
                );
            
            // Add specific fields based on log type
            if (logEntry.userId) {
                embed.addFields({ name: '👤 User', value: `${logEntry.username} (${logEntry.userId})`, inline: true });
            }
            
            if (logEntry.details && Object.keys(logEntry.details).length > 0) {
                const detailsText = JSON.stringify(logEntry.details, null, 2).substring(0, 1000);
                embed.addFields({ name: '📊 Details', value: `\`\`\`json\n${detailsText}\`\`\``, inline: false });
            }
            
            const client = new WebhookClient({ url: webhook });
            await client.send({ embeds: [embed] });
            
        } catch (error) {
            console.error(`💥 Failed to send Discord log for ${category}: ${error.message}`);
            loggingFallback.trackFailure('sendToDiscord', error);
            
            // Don't enable fallback mode just for Discord failures - file logging is more critical
            // But track the failure for monitoring
        }
    }

    /**
     * SYSTEM HEALTH CHECK LOGGING
     */
    async logSystemHealth() {
        const health = {
            timestamp: new Date().toISOString(),
            session: this.sessionId,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            level: 'SYSTEM_HEALTH'
        };

        await this.writeToFile('startup', health);
        console.log(`💚 [HEALTH] System running - Uptime: ${Math.floor(process.uptime())}s`);
    }

    /**
     * Flush all pending logs
     */
    /**
     * Get comprehensive logging system status including fallbacks
     */
    getSystemStatus() {
        return {
            logging: loggingFallback.getStatus(),
            logDirectory: this.logDirectory,
            sessionId: this.sessionId,
            uptime: Date.now() - this.startupTime,
            queueSize: this.logQueue.length,
            webhooksConfigured: Object.values(this.discordWebhooks).filter(w => w !== null).length,
            logFiles: Object.keys(this.logFiles).length,
            healthStatus: loggingFallback.fallbackMode ? '🚨 FALLBACK MODE' : '✅ OPERATIONAL'
        };
    }

    /**
     * Force enable emergency logging mode (for testing/manual intervention)
     */
    enableEmergencyMode(reason = 'Manual activation') {
        loggingFallback.enableFallbackMode(reason);
        console.log(`🚨 Emergency logging mode manually enabled: ${reason}`);
    }

    /**
     * Get buffered logs (for recovery/debugging)
     */
    getBufferedLogs() {
        return loggingFallback.memoryBuffer;
    }

    /**
     * Attempt to flush buffered logs manually
     */
    async flushBufferedLogs() {
        if (!loggingFallback.fallbackMode) {
            return await loggingFallback.flushBufferedLogs(async (logEntry) => {
                if (logEntry.category) {
                    const filename = this.logFiles[logEntry.category] || this.logFiles.errors;
                    const filepath = path.join(this.logDirectory, filename);
                    const logLine = JSON.stringify(logEntry) + '\n';
                    await fs.appendFile(filepath, logLine);
                }
            });
        }
        return 0;
    }

    /**
     * Emergency log function (bypasses all systems, direct to console)
     */
    emergencyLog(level, message, details = {}) {
        const timestamp = new Date().toISOString();
        console.error(`🚨 [EMERGENCY] ${timestamp} [${level}] ${message}`);
        if (Object.keys(details).length > 0) {
            console.error(`🚨 [EMERGENCY] Details:`, JSON.stringify(details, null, 2));
        }
    }

    async flush() {
        console.log(`📝 [LOGGER] Flushing ${this.logQueue.length} pending logs...`);
        
        // Try to flush any buffered logs first
        try {
            await this.flushBufferedLogs();
        } catch (error) {
            console.error('Failed to flush buffered logs during shutdown:', error);
        }
        
        // Process any remaining logs
        await this.logSystemHealth();
    }
}

// Create singleton instance
const comprehensiveLogger = new ComprehensiveLogger();

// Graceful shutdown
process.on('SIGINT', async () => {
    await comprehensiveLogger.flush();
});

process.on('SIGTERM', async () => {
    await comprehensiveLogger.flush();
});

module.exports = comprehensiveLogger;