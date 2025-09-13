/**
 * Economy Analyzer Runner - Main execution interface
 * Integrates the EconomyOptimizer with the Discord bot system
 */

const EconomyOptimizer = require('./economyOptimizer');
const logger = require('../UTILS/logger');
const cron = require('node-cron');

class EconomyAnalyzerRunner {
    constructor(client, config = {}) {
        this.client = client;
        this.config = {
            // Scheduling
            cronSchedule: config.cronSchedule || '0 */4 * * *', // Every 4 hours
            autoStart: config.autoStart !== false,
            
            // Output channels
            reportChannelId: config.reportChannelId || process.env.ECONOMY_REPORT_CHANNEL,
            logChannelId: config.logChannelId || process.env.ECONOMY_LOG_CHANNEL,
            
            // Optimizer config
            ...config
        };
        
        this.optimizer = null;
        this.isRunning = false;
        this.cronJob = null;
        this.lastRun = null;
        this.runCount = 0;
    }

    /**
     * Initialize the analyzer runner
     */
    async initialize() {
        try {
            logger.info('Initializing Economy Analyzer Runner...');
            
            // Initialize optimizer
            this.optimizer = new EconomyOptimizer(this.config);
            await this.optimizer.initialize();
            
            // Set up scheduled runs if enabled
            if (this.config.autoStart && this.config.cronSchedule) {
                this.setupScheduler();
            }
            
            logger.info('Economy Analyzer Runner initialized successfully');
            
        } catch (error) {
            logger.error(`Economy Analyzer Runner initialization failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Set up cron scheduler for automated analysis
     */
    setupScheduler() {
        try {
            this.cronJob = cron.schedule(this.config.cronSchedule, async () => {
                try {
                    await this.runAnalysis(true); // automated = true
                } catch (error) {
                    logger.error(`Scheduled analysis failed: ${error.message}`);
                }
            }, {
                scheduled: false,
                timezone: 'UTC'
            });
            
            this.cronJob.start();
            logger.info(`Economy analysis scheduled: ${this.config.cronSchedule}`);
            
        } catch (error) {
            logger.error(`Failed to setup scheduler: ${error.message}`);
        }
    }

    /**
     * Run full analysis cycle
     */
    async runAnalysis(automated = false) {
        if (this.isRunning) {
            throw new Error('Analysis already running');
        }
        
        this.isRunning = true;
        const startTime = Date.now();
        
        try {
            logger.info(`Starting economy analysis (${automated ? 'automated' : 'manual'})`);
            
            // Run optimization cycle
            const result = await this.optimizer.runOptimizationCycle();
            
            // Update stats
            this.lastRun = new Date();
            this.runCount++;
            const duration = Date.now() - startTime;
            
            // Log results
            await this.logResults(result, duration, automated);
            
            // Send Discord report if configured
            if (this.config.reportChannelId) {
                await this.sendDiscordReport(result, duration, automated);
            }
            
            logger.info(`Economy analysis completed in ${duration}ms`);
            return result;
            
        } catch (error) {
            logger.error(`Economy analysis failed: ${error.message}`);
            
            // Send error notification if configured
            if (this.config.logChannelId) {
                await this.sendErrorNotification(error, automated);
            }
            
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Log analysis results
     */
    async logResults(result, duration, automated) {
        try {
            const logData = {
                timestamp: new Date().toISOString(),
                automated,
                duration,
                runCount: this.runCount,
                suggestions: result.suggestions.length,
                abuseFlags: result.abuseFlags.length,
                appliedPatch: result.appliedPatch ? result.appliedPatch.action : null,
                analysis: result.analysis
            };
            
            logger.info('Economy Analysis Results:', logData);
            
        } catch (error) {
            logger.error(`Failed to log results: ${error.message}`);
        }
    }

    /**
     * Send Discord report
     */
    async sendDiscordReport(result, duration, automated) {
        try {
            const channel = this.client.channels.cache.get(this.config.reportChannelId);
            if (!channel) {
                logger.warn(`Report channel ${this.config.reportChannelId} not found`);
                return;
            }

            const embed = {
                title: '📊 Economy Analysis Report',
                color: result.abuseFlags.length > 0 ? 0xFF0000 : (result.suggestions.length > 0 ? 0xFFA500 : 0x00FF00),
                fields: [
                    {
                        name: '📈 Analysis',
                        value: result.analysis,
                        inline: false
                    }
                ],
                footer: {
                    text: `Run #${this.runCount} • ${automated ? 'Automated' : 'Manual'} • ${duration}ms`
                },
                timestamp: new Date().toISOString()
            };

            // Add suggestions
            if (result.suggestions.length > 0) {
                const suggestionText = result.suggestions.slice(0, 3).map(s => 
                    `**${s.action}**: ${s.reason}`
                ).join('\n');
                
                embed.fields.push({
                    name: `💡 Suggestions (${result.suggestions.length})`,
                    value: suggestionText,
                    inline: false
                });
            }

            // Add applied patch
            if (result.appliedPatch) {
                embed.fields.push({
                    name: '⚡ Applied Patch',
                    value: `**${result.appliedPatch.action}**: ${result.appliedPatch.success ? '✅ Success' : '❌ Failed'}`,
                    inline: true
                });
            }

            // Add abuse flags
            if (result.abuseFlags.length > 0) {
                const abuseText = result.abuseFlags.slice(0, 3).map(f => 
                    `User ${f.userId}: ${f.reason}`
                ).join('\n');
                
                embed.fields.push({
                    name: `🚨 Abuse Flags (${result.abuseFlags.length})`,
                    value: abuseText,
                    inline: false
                });
            }

            await channel.send({ embeds: [embed] });
            
        } catch (error) {
            logger.error(`Failed to send Discord report: ${error.message}`);
        }
    }

    /**
     * Send error notification
     */
    async sendErrorNotification(error, automated) {
        try {
            const channel = this.client.channels.cache.get(this.config.logChannelId);
            if (!channel) return;

            const embed = {
                title: '❌ Economy Analysis Error',
                description: `\`\`\`${error.message}\`\`\``,
                color: 0xFF0000,
                fields: [
                    {
                        name: 'Type',
                        value: automated ? 'Automated Analysis' : 'Manual Analysis',
                        inline: true
                    },
                    {
                        name: 'Time',
                        value: new Date().toISOString(),
                        inline: true
                    }
                ]
            };

            await channel.send({ embeds: [embed] });
            
        } catch (sendError) {
            logger.error(`Failed to send error notification: ${sendError.message}`);
        }
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            initialized: !!this.optimizer,
            running: this.isRunning,
            scheduled: !!this.cronJob && this.cronJob.running,
            lastRun: this.lastRun,
            runCount: this.runCount,
            schedule: this.config.cronSchedule,
            nextRun: this.cronJob ? this.cronJob.nextDate() : null
        };
    }

    /**
     * Start scheduled analysis
     */
    start() {
        if (this.cronJob && !this.cronJob.running) {
            this.cronJob.start();
            logger.info('Economy analysis scheduler started');
        }
    }

    /**
     * Stop scheduled analysis
     */
    stop() {
        if (this.cronJob && this.cronJob.running) {
            this.cronJob.stop();
            logger.info('Economy analysis scheduler stopped');
        }
    }

    /**
     * Force immediate analysis (for manual triggers)
     */
    async forceAnalysis() {
        return await this.runAnalysis(false);
    }

    /**
     * Get recent analysis history
     */
    async getAnalysisHistory(limit = 10) {
        try {
            if (!this.optimizer || !this.optimizer.db) {
                return [];
            }
            
            const [rows] = await this.optimizer.db.execute(`
                SELECT id, ts, action, payload 
                FROM regulator_log 
                WHERE action IN ('apply_patch', 'apply_user_cap')
                ORDER BY ts DESC 
                LIMIT ?
            `, [limit]);
            
            return rows.map(row => ({
                id: row.id,
                timestamp: row.ts,
                action: row.action,
                details: JSON.parse(row.payload)
            }));
            
        } catch (error) {
            logger.error(`Failed to get analysis history: ${error.message}`);
            return [];
        }
    }

    /**
     * Get current tuning values
     */
    async getCurrentTuning() {
        try {
            if (!this.optimizer || !this.optimizer.db) {
                return {};
            }
            
            const [rows] = await this.optimizer.db.execute(
                'SELECT scope, key_name, value, updated_at FROM tuning ORDER BY updated_at DESC'
            );
            
            const tuning = {};
            for (const row of rows) {
                if (!tuning[row.scope]) {
                    tuning[row.scope] = {};
                }
                tuning[row.scope][row.key_name] = {
                    value: row.value,
                    updated: row.updated_at
                };
            }
            
            return tuning;
            
        } catch (error) {
            logger.error(`Failed to get current tuning: ${error.message}`);
            return {};
        }
    }

    /**
     * Emergency stop - disable all automated analysis
     */
    emergencyStop() {
        this.stop();
        this.config.autoStart = false;
        logger.warn('Economy analyzer emergency stop activated');
    }
}

module.exports = EconomyAnalyzerRunner;