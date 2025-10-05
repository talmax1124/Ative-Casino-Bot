/**
 * UAS Data Exporter - Sends economy data to UAS bot for analysis
 * Creates a data pipeline between casino bot and UAS bot for centralized monitoring
 */

const logger = require('./logger');
const dbManager = require('./database');

class UASDataExporter {
    constructor() {
        this.initialized = false;
        this.exportQueue = [];
        this.isProcessing = false;
        this.lastExportTime = 0;
        this.batchSize = 50; // Process exports in batches
    }

    /**
     * Initialize the UAS data exporter
     */
    async initialize() {
        if (this.initialized) return;
        
        try {
            // Ensure required tables exist
            await this.createTables();
            
            // Start background processing
            this.startBackgroundProcessor();
            
            this.initialized = true;
            logger.info('🔗 UAS Data Exporter initialized - economy data will be sent to UAS bot');
            
        } catch (error) {
            logger.error(`UAS Data Exporter initialization failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create required tables for UAS integration
     */
    async createTables() {
        try {
            // Enhanced game results table for UAS analysis
            const gameResultsQuery = `
                CREATE TABLE IF NOT EXISTS game_results_detailed (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    game_type VARCHAR(50) NOT NULL,
                    user_id VARCHAR(255) NOT NULL,
                    guild_id VARCHAR(255) NOT NULL,
                    bet_amount DECIMAL(20,2) NOT NULL,
                    payout DECIMAL(20,2) NOT NULL DEFAULT 0,
                    won BOOLEAN NOT NULL DEFAULT FALSE,
                    multiplier DECIMAL(10,4) DEFAULT NULL,
                    house_edge_applied DECIMAL(8,4) DEFAULT NULL,
                    user_wealth_before DECIMAL(20,2) DEFAULT NULL,
                    user_wealth_after DECIMAL(20,2) DEFAULT NULL,
                    session_duration INT DEFAULT NULL,
                    metadata JSON DEFAULT NULL,
                    played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_game_type (game_type),
                    INDEX idx_user_id (user_id),
                    INDEX idx_played_at (played_at),
                    INDEX idx_won (won)
                )
            `;

            // Economy metrics table for health monitoring
            const economyMetricsQuery = `
                CREATE TABLE IF NOT EXISTS economy_metrics (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    metric_type VARCHAR(100) NOT NULL,
                    metric_value DECIMAL(20,4) NOT NULL,
                    game_type VARCHAR(50) DEFAULT NULL,
                    guild_id VARCHAR(255) DEFAULT NULL,
                    metadata JSON DEFAULT NULL,
                    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_metric_type (metric_type),
                    INDEX idx_recorded_at (recorded_at)
                )
            `;

            // UAS tuning table for receiving adjustments from UAS bot
            const uasTuningQuery = `
                CREATE TABLE IF NOT EXISTS uas_tuning (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    scope VARCHAR(50) NOT NULL,
                    key_name VARCHAR(100) NOT NULL,
                    value DECIMAL(10,6) NOT NULL,
                    reason TEXT,
                    updated_by VARCHAR(50) DEFAULT 'UAS_BOT',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_tuning (scope, key_name),
                    INDEX idx_scope (scope)
                )
            `;

            await dbManager.databaseAdapter.executeQuery(gameResultsQuery);
            await dbManager.databaseAdapter.executeQuery(economyMetricsQuery);
            await dbManager.databaseAdapter.executeQuery(uasTuningQuery);
            
            logger.info('UAS integration tables created successfully');
            
        } catch (error) {
            logger.error(`Failed to create UAS tables: ${error.message}`);
            throw error;
        }
    }

    /**
     * Export detailed game result to UAS for analysis
     */
    async exportGameResult(gameData) {
        try {
            if (!this.initialized) {
                await this.initialize();
            }

            const exportData = {
                type: 'GAME_RESULT',
                timestamp: Date.now(),
                data: {
                    gameType: gameData.gameType,
                    userId: gameData.userId,
                    guildId: gameData.guildId,
                    betAmount: gameData.betAmount,
                    payout: gameData.payout || 0,
                    won: gameData.won || false,
                    multiplier: gameData.multiplier || null,
                    houseEdgeApplied: gameData.houseEdgeApplied || null,
                    userWealthBefore: gameData.userWealthBefore || null,
                    userWealthAfter: gameData.userWealthAfter || null,
                    sessionDuration: gameData.sessionDuration || null,
                    metadata: gameData.metadata || {}
                }
            };

            this.exportQueue.push(exportData);
            
            // Process immediately if queue is getting large
            if (this.exportQueue.length >= this.batchSize) {
                await this.processQueue();
            }

        } catch (error) {
            logger.error(`Failed to queue game result export: ${error.message}`);
        }
    }

    /**
     * Export economy metric to UAS for monitoring
     */
    async exportEconomyMetric(metricType, value, gameType = null, guildId = null, metadata = {}) {
        try {
            if (!this.initialized) {
                await this.initialize();
            }

            const exportData = {
                type: 'ECONOMY_METRIC',
                timestamp: Date.now(),
                data: {
                    metricType,
                    value,
                    gameType,
                    guildId,
                    metadata
                }
            };

            this.exportQueue.push(exportData);

        } catch (error) {
            logger.error(`Failed to queue economy metric export: ${error.message}`);
        }
    }

    /**
     * Get tuning adjustments from UAS bot
     */
    async getTuningFromUAS(scope, keyName, defaultValue = 0) {
        try {
            if (!this.initialized) {
                await this.initialize();
            }

            const query = `
                SELECT value, reason, updated_at 
                FROM uas_tuning 
                WHERE scope = ? AND key_name = ?
                ORDER BY updated_at DESC
                LIMIT 1
            `;

            const [results] = await dbManager.databaseAdapter.pool.execute(query, [scope, keyName]);
            
            if (results && results.length > 0) {
                const tuning = results[0];
                logger.debug(`UAS tuning applied: ${scope}.${keyName} = ${tuning.value} (${tuning.reason})`);
                return tuning.value;
            }

            return defaultValue;

        } catch (error) {
            logger.error(`Failed to get UAS tuning for ${scope}.${keyName}: ${error.message}`);
            return defaultValue;
        }
    }

    /**
     * Get all tuning values for a scope from UAS
     */
    async getAllTuningForScope(scope) {
        try {
            if (!this.initialized) {
                await this.initialize();
            }

            const query = `
                SELECT key_name, value, reason, updated_at 
                FROM uas_tuning 
                WHERE scope = ?
            `;

            const [results] = await dbManager.databaseAdapter.pool.execute(query, [scope]);
            
            const tuning = {};
            for (const row of results) {
                tuning[row.key_name] = {
                    value: row.value,
                    reason: row.reason,
                    updatedAt: row.updated_at
                };
            }

            return tuning;

        } catch (error) {
            logger.error(`Failed to get UAS tuning for scope ${scope}: ${error.message}`);
            return {};
        }
    }

    /**
     * Process the export queue in batches
     */
    async processQueue() {
        if (this.isProcessing || this.exportQueue.length === 0) {
            return;
        }

        this.isProcessing = true;

        try {
            const batch = this.exportQueue.splice(0, this.batchSize);
            
            // Separate game results and economy metrics
            const gameResults = batch.filter(item => item.type === 'GAME_RESULT');
            const economyMetrics = batch.filter(item => item.type === 'ECONOMY_METRIC');

            // Insert game results
            if (gameResults.length > 0) {
                await this.insertGameResults(gameResults);
            }

            // Insert economy metrics
            if (economyMetrics.length > 0) {
                await this.insertEconomyMetrics(economyMetrics);
            }

            logger.debug(`Exported ${batch.length} items to UAS (${gameResults.length} games, ${economyMetrics.length} metrics)`);
            this.lastExportTime = Date.now();

        } catch (error) {
            logger.error(`Failed to process UAS export queue: ${error.message}`);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Insert game results into database
     */
    async insertGameResults(gameResults) {
        const query = `
            INSERT INTO game_results_detailed 
            (game_type, user_id, guild_id, bet_amount, payout, won, multiplier, 
             house_edge_applied, user_wealth_before, user_wealth_after, 
             session_duration, metadata, played_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?))
        `;

        for (const result of gameResults) {
            const data = result.data;
            const values = [
                data.gameType,
                data.userId,
                data.guildId,
                data.betAmount,
                data.payout,
                data.won,
                data.multiplier,
                data.houseEdgeApplied,
                data.userWealthBefore,
                data.userWealthAfter,
                data.sessionDuration,
                JSON.stringify(data.metadata),
                result.timestamp / 1000
            ];

            await dbManager.databaseAdapter.pool.execute(query, values);
        }
    }

    /**
     * Insert economy metrics into database
     */
    async insertEconomyMetrics(economyMetrics) {
        const query = `
            INSERT INTO economy_metrics 
            (metric_type, metric_value, game_type, guild_id, metadata, recorded_at)
            VALUES (?, ?, ?, ?, ?, FROM_UNIXTIME(?))
        `;

        for (const metric of economyMetrics) {
            const data = metric.data;
            const values = [
                data.metricType,
                data.value,
                data.gameType,
                data.guildId,
                JSON.stringify(data.metadata),
                metric.timestamp / 1000
            ];

            await dbManager.databaseAdapter.pool.execute(query, values);
        }
    }

    /**
     * Start background processor for periodic queue processing
     */
    startBackgroundProcessor() {
        // Process queue every 30 seconds
        setInterval(async () => {
            if (this.exportQueue.length > 0) {
                await this.processQueue();
            }
        }, 30000);

        // Export metrics every 5 minutes
        setInterval(async () => {
            await this.exportSystemMetrics();
        }, 300000);
    }

    /**
     * Export system-level metrics for UAS monitoring
     */
    async exportSystemMetrics() {
        try {
            // Calculate recent house edge
            const recentGames = await this.getRecentGameStats();
            if (recentGames.totalGames > 0) {
                const houseEdge = ((recentGames.totalWagered - recentGames.totalPayouts) / recentGames.totalWagered) * 100;
                await this.exportEconomyMetric('HOUSE_EDGE_PERCENT', houseEdge, null, null, {
                    period: '5min',
                    totalGames: recentGames.totalGames,
                    totalWagered: recentGames.totalWagered
                });
            }

            // Export active player count
            const activePlayers = await this.getActivePlayerCount();
            await this.exportEconomyMetric('ACTIVE_PLAYERS', activePlayers);

        } catch (error) {
            logger.error(`Failed to export system metrics: ${error.message}`);
        }
    }

    /**
     * Get recent game statistics for metrics
     */
    async getRecentGameStats() {
        try {
            const query = `
                SELECT 
                    COUNT(*) as totalGames,
                    SUM(bet_amount) as totalWagered,
                    SUM(payout) as totalPayouts
                FROM game_results_detailed 
                WHERE played_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
            `;

            const [results] = await dbManager.databaseAdapter.pool.execute(query);
            return results[0] || { totalGames: 0, totalWagered: 0, totalPayouts: 0 };

        } catch (error) {
            logger.error(`Failed to get recent game stats: ${error.message}`);
            return { totalGames: 0, totalWagered: 0, totalPayouts: 0 };
        }
    }

    /**
     * Get active player count in last hour
     */
    async getActivePlayerCount() {
        try {
            const query = `
                SELECT COUNT(DISTINCT user_id) as activeCount
                FROM game_results_detailed 
                WHERE played_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
            `;

            const [results] = await dbManager.databaseAdapter.pool.execute(query);
            return results[0]?.activeCount || 0;

        } catch (error) {
            logger.error(`Failed to get active player count: ${error.message}`);
            return 0;
        }
    }

    /**
     * Force process all queued exports
     */
    async flush() {
        while (this.exportQueue.length > 0) {
            await this.processQueue();
        }
    }

    /**
     * Get export statistics
     */
    getStats() {
        return {
            queueLength: this.exportQueue.length,
            isProcessing: this.isProcessing,
            lastExportTime: this.lastExportTime,
            initialized: this.initialized
        };
    }
}

module.exports = new UASDataExporter();