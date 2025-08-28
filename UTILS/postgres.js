/**
 * PostgreSQL Database Manager for ATIVE Casino Bot
 * Alternative PostgreSQL implementation for environments that prefer PostgreSQL over MariaDB
 */

const { Pool } = require('pg');
const logger = require('./logger');

class PostgresManager {
    constructor() {
        this.pool = null;
        this.initialized = false;
    }

    /**
     * Initialize PostgreSQL connection pool
     */
    async initialize() {
        if (this.initialized) return;

        const config = {
            host: process.env.POSTGRES_HOST || 'localhost',
            port: parseInt(process.env.POSTGRES_PORT) || 5432,
            user: process.env.POSTGRES_USER || 'postgres',
            password: process.env.POSTGRES_PASSWORD || '',
            database: process.env.POSTGRES_DATABASE || 'ative_casino',
            max: 20,
            connectionTimeoutMillis: 60000,
            idleTimeoutMillis: 30000,
            ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
        };

        this.pool = new Pool(config);

        // Test connection
        const client = await this.pool.connect();
        try {
            await client.query('SELECT NOW()');
            logger.info('PostgreSQL connection established successfully');
        } finally {
            client.release();
        }

        // Initialize schema
        await this.initializeSchema();
        this.initialized = true;
    }

    /**
     * Initialize database schema for PostgreSQL
     */
    async initializeSchema() {
        const createTables = [
            `CREATE TABLE IF NOT EXISTS user_balances (
                user_id VARCHAR(20) PRIMARY KEY,
                wallet DECIMAL(15,2) NOT NULL DEFAULT 1000.00,
                bank DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                last_earn_ts BIGINT NOT NULL DEFAULT 0,
                last_rob_ts BIGINT NOT NULL DEFAULT 0,
                game_active BOOLEAN NOT NULL DEFAULT FALSE,
                last_work_ts BIGINT NOT NULL DEFAULT 0,
                last_beg_ts BIGINT NOT NULL DEFAULT 0,
                last_crime_ts BIGINT NOT NULL DEFAULT 0,
                last_heist_ts BIGINT NOT NULL DEFAULT 0,
                username VARCHAR(100) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            `CREATE INDEX IF NOT EXISTS idx_user_balances_updated_at ON user_balances (updated_at)`,

            `CREATE TABLE IF NOT EXISTS user_stats (
                id VARCHAR(50) PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                game_type VARCHAR(50) DEFAULT NULL,
                wins INTEGER NOT NULL DEFAULT 0,
                losses INTEGER NOT NULL DEFAULT 0,
                total_wagered DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                total_won DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                biggest_win DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                biggest_loss DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                total_wins INTEGER NOT NULL DEFAULT 0,
                total_losses INTEGER NOT NULL DEFAULT 0,
                total_games_played INTEGER NOT NULL DEFAULT 0,
                total_winnings DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                total_losses_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                last_game_played TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            `CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats (user_id)`,
            `CREATE INDEX IF NOT EXISTS idx_user_stats_game_type ON user_stats (game_type)`,
            `CREATE INDEX IF NOT EXISTS idx_user_stats_wins ON user_stats (wins)`,
            `CREATE INDEX IF NOT EXISTS idx_user_stats_total_wins ON user_stats (total_wins)`,

            `CREATE TABLE IF NOT EXISTS user_profiles (
                user_id VARCHAR(20) PRIMARY KEY,
                username VARCHAR(100) DEFAULT NULL,
                display_name VARCHAR(100) DEFAULT NULL,
                avatar_url TEXT DEFAULT NULL,
                last_profile_update TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            `CREATE TABLE IF NOT EXISTS server_config (
                server_id VARCHAR(20) PRIMARY KEY,
                server_name VARCHAR(255) NOT NULL,
                settings JSONB DEFAULT NULL,
                channels JSONB DEFAULT NULL,
                roles JSONB DEFAULT NULL,
                economy JSONB DEFAULT NULL,
                games JSONB DEFAULT NULL,
                security JSONB DEFAULT NULL,
                setup_complete BOOLEAN NOT NULL DEFAULT FALSE,
                setup_date VARCHAR(50) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Lottery tables
            `CREATE TABLE IF NOT EXISTS lottery (
                guild_id VARCHAR(20) PRIMARY KEY,
                base_prize DECIMAL(15,2) NOT NULL DEFAULT 400000.00,
                tax_pool DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                total_prize DECIMAL(15,2) NOT NULL DEFAULT 400000.00,
                total_tickets INTEGER NOT NULL DEFAULT 0,
                week_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            `CREATE TABLE IF NOT EXISTS lottery_data (
                guild_id VARCHAR(20) PRIMARY KEY,
                participants JSONB DEFAULT NULL,
                total_prize DECIMAL(15,2) NOT NULL DEFAULT 400000.00,
                total_tickets INTEGER NOT NULL DEFAULT 0,
                current_week_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_drawing TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            `CREATE TABLE IF NOT EXISTS lottery_tickets (
                id VARCHAR(50) PRIMARY KEY,
                guild_id VARCHAR(20) NOT NULL,
                user_id VARCHAR(20) NOT NULL,
                tickets INTEGER NOT NULL DEFAULT 0,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(guild_id, user_id)
            )`,

            `CREATE INDEX IF NOT EXISTS idx_lottery_tickets_guild ON lottery_tickets (guild_id)`,

            // Admin and moderation tables
            `CREATE TABLE IF NOT EXISTS admin_logs (
                id VARCHAR(50) PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                action VARCHAR(100) NOT NULL,
                details TEXT DEFAULT NULL,
                moderator_id VARCHAR(20) NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            `CREATE INDEX IF NOT EXISTS idx_admin_logs_user_action ON admin_logs (user_id, action)`,
            `CREATE INDEX IF NOT EXISTS idx_admin_logs_guild_timestamp ON admin_logs (guild_id, timestamp)`,

            `CREATE TABLE IF NOT EXISTS user_warnings (
                id VARCHAR(50) PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                message TEXT NOT NULL,
                moderator_id VARCHAR(20) NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            `CREATE INDEX IF NOT EXISTS idx_user_warnings_user_guild ON user_warnings (user_id, guild_id)`,

            `CREATE TABLE IF NOT EXISTS game_bans (
                id VARCHAR(50) PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                duration INTEGER NOT NULL,
                reason TEXT NOT NULL,
                moderator_id VARCHAR(20) NOT NULL,
                expiry TIMESTAMP NOT NULL,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            `CREATE INDEX IF NOT EXISTS idx_game_bans_user_active_expiry ON game_bans (user_id, guild_id, active, expiry)`,

            // Polls table
            `CREATE TABLE IF NOT EXISTS polls (
                poll_id VARCHAR(50) PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT DEFAULT NULL,
                options JSONB DEFAULT NULL,
                votes JSONB DEFAULT NULL,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                creator_id VARCHAR(20) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                channel_id VARCHAR(20) NOT NULL,
                ends_at TIMESTAMP NULL,
                ended_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            `CREATE INDEX IF NOT EXISTS idx_polls_guild_active ON polls (guild_id, active)`
        ];

        const client = await this.pool.connect();
        try {
            for (const query of createTables) {
                await client.query(query);
            }
            logger.info('PostgreSQL schema initialized successfully');
        } finally {
            client.release();
        }
    }

    /**
     * Execute query with parameters
     */
    async query(text, params = []) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(text, params);
            return result;
        } finally {
            client.release();
        }
    }

    /**
     * Get user balance from PostgreSQL
     */
    async getUserBalance(userId) {
        try {
            const result = await this.query('SELECT * FROM user_balances WHERE user_id = $1', [userId]);
            
            if (result.rows.length > 0) {
                const row = result.rows[0];
                return {
                    user_id: userId,
                    wallet: parseFloat(row.wallet),
                    bank: parseFloat(row.bank),
                    last_earn_ts: parseFloat(row.last_earn_ts),
                    last_rob_ts: parseFloat(row.last_rob_ts),
                    game_active: Boolean(row.game_active),
                    last_work_ts: parseFloat(row.last_work_ts),
                    last_beg_ts: parseFloat(row.last_beg_ts),
                    last_crime_ts: parseFloat(row.last_crime_ts),
                    last_heist_ts: parseFloat(row.last_heist_ts),
                    created_at: row.created_at,
                    updated_at: row.updated_at
                };
            } else {
                // Create new user with default balance
                const defaultBalance = {
                    user_id: userId,
                    wallet: 1000.0,
                    bank: 0.0,
                    last_earn_ts: 0.0,
                    last_rob_ts: 0.0,
                    game_active: false,
                    last_work_ts: 0.0,
                    last_beg_ts: 0.0,
                    last_crime_ts: 0.0,
                    last_heist_ts: 0.0,
                    created_at: new Date(),
                    updated_at: new Date()
                };

                await this.query(
                    `INSERT INTO user_balances 
                     (user_id, wallet, bank, last_earn_ts, last_rob_ts, game_active, 
                      last_work_ts, last_beg_ts, last_crime_ts, last_heist_ts) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [userId, 1000.0, 0.0, 0.0, 0.0, false, 0.0, 0.0, 0.0, 0.0]
                );

                return defaultBalance;
            }
        } catch (error) {
            logger.error(`PostgreSQL getUserBalance error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update user balance in PostgreSQL
     */
    async updateUserBalance(userId, walletChange = 0, bankChange = 0, kwargs = {}) {
        try {
            const current = await this.getUserBalance(userId);
            const newWallet = current.wallet + walletChange;
            const newBank = current.bank + bankChange;

            const updateFields = ['wallet = $2', 'bank = $3', 'updated_at = CURRENT_TIMESTAMP'];
            const updateValues = [userId, newWallet, newBank];
            let paramCount = 3;

            // Handle additional fields
            for (const [key, value] of Object.entries(kwargs)) {
                if (key !== 'user_id' && key !== 'guild_id') {
                    paramCount++;
                    updateFields.push(`${key} = $${paramCount}`);
                    updateValues.push(value);
                }
            }

            await this.query(
                `UPDATE user_balances SET ${updateFields.join(', ')} WHERE user_id = $1`,
                updateValues
            );

            logger.info(`Updated balance for user ${userId}: wallet_change=${walletChange}, bank_change=${bankChange}`);
            return true;
        } catch (error) {
            logger.error(`PostgreSQL updateUserBalance error: ${error.message}`);
            return false;
        }
    }

    /**
     * Close connection pool
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            logger.info('PostgreSQL connection pool closed');
        }
    }
}

module.exports = PostgresManager;