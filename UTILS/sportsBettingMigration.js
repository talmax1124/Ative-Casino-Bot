/**
 * Sports Betting Migration Handler
 * Runs automatically when the bot starts
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class SportsBettingMigration {
    constructor(dbManager) {
        this.dbManager = dbManager;
        this.migrated = false;
    }

    async runMigrations() {
        if (this.migrated) return;

        try {
            logger.info('🎯 Running sports betting migrations...');

            // Check if database adapter is available
            if (!this.dbManager.databaseAdapter) {
                throw new Error('Database adapter not available');
            }

            // Check if sport_bets table exists
            const tableExists = await this.checkTableExists('sport_bets');
            
            if (!tableExists) {
                logger.info('📋 Creating sport_bets table...');
                await this.runSportBetsMigration();
            }

            // Check if sports cache tables exist
            const cacheTableExists = await this.checkTableExists('sports_games_cache');
            
            if (!cacheTableExists) {
                logger.info('💾 Creating sports cache tables...');
                await this.runCacheMigration();
            }

            this.migrated = true;
            logger.info('✅ Sports betting migrations completed successfully!');

        } catch (error) {
            logger.error(`❌ Sports betting migration failed: ${error.message}`);
            // Don't throw - let bot continue without sports betting
        }
    }

    async checkTableExists(tableName) {
        try {
            // SHOW TABLES LIKE does not support parameter placeholders in MySQL/MariaDB.
            // To be safe, only allow simple identifiers and interpolate directly.
            if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
                logger.warn(`Refusing to check table with invalid name: ${tableName}`);
                return false;
            }
            const query = `SHOW TABLES LIKE '${tableName}'`;
            const result = await this.dbManager.databaseAdapter.executeQuery(query);
            return result.length > 0;
        } catch (error) {
            logger.error(`Error checking table ${tableName}: ${error.message}`);
            return false;
        }
    }

    async runSportBetsMigration() {
        const queries = [
            `CREATE TABLE IF NOT EXISTS sport_bets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                guild_id VARCHAR(255) NOT NULL,
                sport VARCHAR(50) NOT NULL,
                game_id VARCHAR(255) NOT NULL,
                game_name VARCHAR(500) NOT NULL,
                selection VARCHAR(255) NOT NULL,
                amount BIGINT NOT NULL,
                odds DECIMAL(10, 2) NOT NULL,
                payout BIGINT DEFAULT 0,
                status ENUM('pending', 'live', 'won', 'lost', 'cancelled') DEFAULT 'pending',
                result VARCHAR(255) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                
                INDEX idx_user_guild (user_id, guild_id),
                INDEX idx_status (status),
                INDEX idx_created_at (created_at),
                INDEX idx_game_id (game_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

            `ALTER TABLE user_stats 
            ADD COLUMN IF NOT EXISTS sport_bets_placed INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS sport_bets_won INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS sport_bet_profit BIGINT DEFAULT 0`
        ];

        for (const query of queries) {
            try {
                await this.dbManager.databaseAdapter.executeQuery(query);
                logger.info(`✅ Executed sport_bets migration query`);
            } catch (error) {
                logger.error(`Error in sport_bets migration: ${error.message}`);
            }
        }
    }

    async runCacheMigration() {
        const queries = [
            `CREATE TABLE IF NOT EXISTS sports_games_cache (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sport VARCHAR(50) NOT NULL,
                league VARCHAR(100) NOT NULL,
                game_id VARCHAR(255) NOT NULL UNIQUE,
                home_team VARCHAR(255) NOT NULL,
                away_team VARCHAR(255) NOT NULL,
                commence_time DATETIME NOT NULL,
                home_odds DECIMAL(10, 2),
                away_odds DECIMAL(10, 2),
                draw_odds DECIMAL(10, 2),
                spread_home DECIMAL(10, 2),
                spread_away DECIMAL(10, 2),
                total_over DECIMAL(10, 2),
                total_under DECIMAL(10, 2),
                raw_data JSON,
                cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                
                INDEX idx_sport_league (sport, league),
                INDEX idx_commence_time (commence_time),
                INDEX idx_expires_at (expires_at),
                INDEX idx_cached_at (cached_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

            `CREATE TABLE IF NOT EXISTS api_usage_tracking (
                id INT AUTO_INCREMENT PRIMARY KEY,
                api_key_index INT NOT NULL DEFAULT 1,
                request_count INT NOT NULL DEFAULT 0,
                month_year VARCHAR(7) NOT NULL,
                last_request_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                reset_at TIMESTAMP NOT NULL,
                
                UNIQUE KEY unique_month_key (month_year, api_key_index),
                INDEX idx_month_year (month_year)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

            `CREATE TABLE IF NOT EXISTS api_keys_config (
                id INT AUTO_INCREMENT PRIMARY KEY,
                service VARCHAR(50) NOT NULL,
                key_index INT NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                monthly_limit INT DEFAULT 500,
                current_usage INT DEFAULT 0,
                last_reset DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                UNIQUE KEY unique_service_index (service, key_index)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

            `INSERT INTO api_keys_config (service, key_index, monthly_limit, last_reset) 
            VALUES 
                ('odds_api', 1, 500, CURDATE()),
                ('odds_api', 2, 500, CURDATE())
            ON DUPLICATE KEY UPDATE id = id`
        ];

        for (const query of queries) {
            try {
                await this.dbManager.databaseAdapter.executeQuery(query);
                logger.info(`✅ Executed cache migration query`);
            } catch (error) {
                logger.error(`Error in cache migration: ${error.message}`);
            }
        }
    }
}

module.exports = SportsBettingMigration;
