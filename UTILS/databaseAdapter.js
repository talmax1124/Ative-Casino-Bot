/**
 * MariaDB Database Adapter for ATIVE Casino Bot
 * Pure MariaDB implementation for database operations
 */

const mysql = require('mysql2/promise');
const logger = require('./logger');
const { secureRandomInt } = require('./rng');
const { gameDataCollector } = require('./gameDataCollector');

class DatabaseAdapter {
    constructor() {
        this.mariadbConnection = null;
        this.useMariaDB = false;
        this.initialized = false;
        
        // Connection pool for MariaDB
        this.pool = null;
        
        // Migration flags to prevent duplicate executions
        this.balanceIntegrityApplied = false;
    }

    // Helper function to calculate consistent week start (Thursday at 00:00:00 UTC)
    getWeekStart(date = null) {
        const now = date || new Date();
        const dayOfWeek = now.getDay();
        // Calculate days to Thursday: Thu=4, so (dayOfWeek + 3) % 7 days ago
        const daysToThursday = (dayOfWeek + 3) % 7; // Thu=0, Fri=1, Sat=2, Sun=3, Mon=4, Tue=5, Wed=6
        
        // Create week start in UTC to avoid timezone issues
        const weekStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - daysToThursday, 0, 0, 0, 0));
        
        // Enhanced debug logging
        logger.info(`Week start calculation: Today ${now.toDateString()} (day ${dayOfWeek}), Days to Thursday: ${daysToThursday}`);
        logger.info(`Week start result: ${weekStart.toDateString()} ${weekStart.toISOString()}`);
        
        return weekStart;
    }

    /**
     * Initialize MariaDB connection
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Initialize MariaDB
            await this.initializeMariaDB();
            this.useMariaDB = true;
            this.initialized = true;
            logger.info('Database adapter initialized with MariaDB');
        } catch (mariaError) {
            logger.error(`MariaDB connection failed: ${mariaError.message}`);
            throw new Error(`Database connection failed: ${mariaError.message}`);
        }
    }

    /**
     * Initialize MariaDB connection pool with fixed configuration
     */
    async initializeMariaDB() {
        // Ensure dotenv is loaded
        require('dotenv').config();
        
        const config = {
            host: process.env.MARIADB_HOST || 'localhost',
            port: parseInt(process.env.MARIADB_PORT) || 3306,
            user: process.env.MARIADB_USER || 'root',
            password: process.env.MARIADB_PASSWORD || '',
            database: process.env.MARIADB_DATABASE || 'ative_casino',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            // Remove invalid options that cause warnings
            charset: 'utf8mb4',
            timezone: '+00:00'
        };

        logger.info(`Attempting MariaDB connection to ${config.host}:${config.port} database ${config.database} as user ${config.user}`);

        this.pool = mysql.createPool(config);
        
        // Test connection with better error handling
        let connection;
        try {
            connection = await this.pool.getConnection();
            await connection.ping();
            logger.info('MariaDB connection test successful');
        } catch (error) {
            logger.error(`MariaDB connection test failed: ${error.message}`);
            throw error;
        } finally {
            if (connection) connection.release();
        }

        // Initialize database schema if needed
        await this.initializeSchema();
        await this.initializeVoteSchema();
        await this.initializeShopItems();
        
        // Apply balance integrity constraints (production safety)
        await this.applyBalanceIntegrityConstraints();
    }

    /**
     * Initialize database schema for MariaDB
     */
    async initializeSchema() {
        const createTables = [
            `CREATE TABLE IF NOT EXISTS user_balances (
                user_id VARCHAR(20) PRIMARY KEY,
                wallet DECIMAL(20,2) NOT NULL DEFAULT 1000.00,
                bank DECIMAL(20,2) NOT NULL DEFAULT 0.00,
                last_earn_ts BIGINT NOT NULL DEFAULT 0,
                last_rob_ts BIGINT NOT NULL DEFAULT 0,
                game_active BOOLEAN NOT NULL DEFAULT FALSE,
                last_work_ts BIGINT NOT NULL DEFAULT 0,
                last_beg_ts BIGINT NOT NULL DEFAULT 0,
                last_crime_ts BIGINT NOT NULL DEFAULT 0,
                last_heist_ts BIGINT NOT NULL DEFAULT 0,
                last_earnmoney_ts BIGINT NOT NULL DEFAULT 0,
                last_dailytask_ts BIGINT NOT NULL DEFAULT 0,
                last_quiz_ts BIGINT NOT NULL DEFAULT 0,
                daily_sent DECIMAL(20,2) NOT NULL DEFAULT 0.00,
                last_send_reset BIGINT NOT NULL DEFAULT 0,
                username VARCHAR(100) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_updated_at (updated_at)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS user_stats (
                id VARCHAR(50) PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                game_type VARCHAR(50) DEFAULT NULL,
                wins INT NOT NULL DEFAULT 0,
                losses INT NOT NULL DEFAULT 0,
                total_wagered DECIMAL(20,2) NOT NULL DEFAULT 0.00,
                total_won DECIMAL(20,2) NOT NULL DEFAULT 0.00,
                biggest_win DECIMAL(20,2) NOT NULL DEFAULT 0.00,
                biggest_loss DECIMAL(20,2) NOT NULL DEFAULT 0.00,
                total_wins INT NOT NULL DEFAULT 0,
                total_losses INT NOT NULL DEFAULT 0,
                total_games_played INT NOT NULL DEFAULT 0,
                total_winnings DECIMAL(20,2) NOT NULL DEFAULT 0.00,
                total_losses_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00,
                last_game_played TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user_id (user_id),
                INDEX idx_game_type (game_type),
                INDEX idx_wins (wins),
                INDEX idx_total_wins (total_wins),
                INDEX idx_last_game (last_game_played)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS user_profiles (
                user_id VARCHAR(20) PRIMARY KEY,
                username VARCHAR(100) DEFAULT NULL,
                displayName VARCHAR(100) DEFAULT NULL,
                avatarUrl TEXT DEFAULT NULL,
                lastProfileUpdate TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS server_config (
                server_id VARCHAR(20) PRIMARY KEY,
                server_name VARCHAR(255) NOT NULL,
                settings JSON DEFAULT NULL,
                channels JSON DEFAULT NULL,
                roles JSON DEFAULT NULL,
                economy JSON DEFAULT NULL,
                games JSON DEFAULT NULL,
                security JSON DEFAULT NULL,
                setup_complete BOOLEAN NOT NULL DEFAULT FALSE,
                setup_date VARCHAR(50) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS game_results (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                game_type VARCHAR(50) NOT NULL,
                bet_amount DECIMAL(20,2) NOT NULL,
                payout DECIMAL(20,2) NOT NULL,
                won BOOLEAN NOT NULL,
                metadata JSON DEFAULT NULL,
                played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_game (user_id, game_type, played_at),
                INDEX idx_played_at (played_at)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS lottery_tickets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                ticket_count INT NOT NULL DEFAULT 1,
                purchase_cost DECIMAL(20,2) NOT NULL,
                week_start DATE NOT NULL,
                tier TINYINT DEFAULT 1,
                purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                awarded_manually BOOLEAN DEFAULT FALSE,
                award_reason TEXT DEFAULT NULL,
                awarded_by VARCHAR(20) DEFAULT NULL,
                UNIQUE KEY unique_user_week_tier (user_id, guild_id, week_start, tier),
                INDEX idx_week_start (week_start),
                INDEX idx_tier (tier)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS lottery_info (
                guild_id VARCHAR(20) NOT NULL,
                tier TINYINT DEFAULT 1,
                total_tickets INT NOT NULL DEFAULT 0,
                total_prize DECIMAL(20,2) NOT NULL DEFAULT 400000.00,
                next_drawing TIMESTAMP NULL,
                current_week_start DATE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (guild_id, tier)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS lottery_winners (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                week_start DATE NOT NULL,
                tickets_owned INT NOT NULL,
                total_tickets INT NOT NULL,
                prize_amount DECIMAL(20,2) NOT NULL,
                won_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_week_start (week_start),
                INDEX idx_user_id (user_id)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS user_levels (
                user_id VARCHAR(20) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                level INT NOT NULL DEFAULT 1,
                xp INT NOT NULL DEFAULT 0,
                total_xp INT NOT NULL DEFAULT 0,
                games_played INT NOT NULL DEFAULT 0,
                games_won INT NOT NULL DEFAULT 0,
                messages_sent INT NOT NULL DEFAULT 0,
                last_level_up TIMESTAMP NULL,
                last_xp_gain TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, guild_id),
                INDEX idx_level (level DESC),
                INDEX idx_total_xp (total_xp DESC),
                INDEX idx_updated_at (updated_at)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS scratch_tickets (
                id VARCHAR(50) PRIMARY KEY,
                user_id VARCHAR(20) DEFAULT NULL,
                guild_id VARCHAR(20) NOT NULL,
                channel_id VARCHAR(20) NOT NULL,
                ticket_data JSON NOT NULL,
                symbols JSON NOT NULL,
                winning_combination JSON DEFAULT NULL,
                status ENUM('dropped', 'active', 'scratching', 'won', 'lost', 'expired') DEFAULT 'dropped',
                scratched_positions JSON DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                won_amount DECIMAL(20,2) DEFAULT 0.00,
                claimed_by VARCHAR(20) DEFAULT NULL,
                scratched_at TIMESTAMP NULL,
                completed_at TIMESTAMP NULL,
                INDEX idx_user_id (user_id),
                INDEX idx_guild_id (guild_id),
                INDEX idx_status (status),
                INDEX idx_expires_at (expires_at),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS scratch_drops (
                guild_id VARCHAR(20) PRIMARY KEY,
                last_drop_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                daily_drops INT NOT NULL DEFAULT 0,
                drop_count_reset DATE NOT NULL DEFAULT CURRENT_DATE,
                total_drops INT NOT NULL DEFAULT 0,
                total_wins INT NOT NULL DEFAULT 0,
                total_winnings DECIMAL(20,2) NOT NULL DEFAULT 0.00,
                next_drop_time TIMESTAMP NULL,
                drop_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                max_daily_drops INT NOT NULL DEFAULT 2,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS shop_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                description TEXT NOT NULL,
                category ENUM('boosts', 'unlocks', 'decorations', 'roles', 'utilities') NOT NULL,
                price DECIMAL(20,2) NOT NULL,
                duration_hours INT NULL,
                metadata JSON DEFAULT NULL,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                sort_order INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_category (category),
                INDEX idx_active (active),
                INDEX idx_sort_order (sort_order)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            // User Settings
            `CREATE TABLE IF NOT EXISTS user_settings (
                user_id VARCHAR(20) PRIMARY KEY,
                role_color_enabled BOOLEAN DEFAULT TRUE,
                decorations_enabled BOOLEAN DEFAULT TRUE,
                active_decoration_id INT DEFAULT NULL,
                settings JSON DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS user_shop_purchases (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                item_id INT NOT NULL,
                purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NULL,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                metadata JSON DEFAULT NULL,
                INDEX idx_user_id (user_id),
                INDEX idx_item_id (item_id),
                INDEX idx_expires_at (expires_at),
                INDEX idx_active (active),
                FOREIGN KEY (item_id) REFERENCES shop_items(id)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS user_active_boosts (
                user_id VARCHAR(20) NOT NULL,
                boost_type VARCHAR(50) NOT NULL,
                multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.00,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, boost_type),
                INDEX idx_expires_at (expires_at)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            // EconomyGuardian audit logging table
            `CREATE TABLE IF NOT EXISTS economic_changes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                timestamp VARCHAR(50) NOT NULL,
                change_type VARCHAR(100) NOT NULL,
                target VARCHAR(100) NOT NULL,
                changes_data JSON NOT NULL,
                source VARCHAR(50) NOT NULL DEFAULT 'EconomyGuardian',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_timestamp (timestamp),
                INDEX idx_change_type (change_type),
                INDEX idx_target (target),
                INDEX idx_source (source),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            // Marriage system tables
            `CREATE TABLE IF NOT EXISTS marriage_proposals (
                id INT AUTO_INCREMENT PRIMARY KEY,
                proposer_id VARCHAR(20) NOT NULL,
                proposer_name VARCHAR(100) NOT NULL,
                recipient_id VARCHAR(20) NOT NULL,
                recipient_name VARCHAR(100) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                status ENUM('pending', 'accepted', 'rejected', 'expired') DEFAULT 'pending',
                proposal_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NULL,
                responded_at TIMESTAMP NULL,
                INDEX idx_proposer (proposer_id),
                INDEX idx_recipient (recipient_id),
                INDEX idx_guild (guild_id),
                INDEX idx_status (status),
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS marriages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                partner1_id VARCHAR(20) NOT NULL,
                partner1_name VARCHAR(100) NOT NULL,
                partner1_role ENUM('husband', 'wife') NOT NULL,
                partner2_id VARCHAR(20) NOT NULL,
                partner2_name VARCHAR(100) NOT NULL,
                partner2_role ENUM('husband', 'wife') NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                married_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ceremony_data JSON,
                shared_bank DECIMAL(20,2) NOT NULL DEFAULT 0.00,
                status ENUM('active', 'divorced') DEFAULT 'active',
                divorced_at TIMESTAMP NULL,
                divorce_reason TEXT NULL,
                INDEX idx_partner1 (partner1_id),
                INDEX idx_partner2 (partner2_id),
                INDEX idx_guild (guild_id),
                INDEX idx_status (status),
                INDEX idx_married (married_at),
                UNIQUE KEY unique_partner1_active (partner1_id, status),
                UNIQUE KEY unique_partner2_active (partner2_id, status)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            // Poem voting system table
            `CREATE TABLE IF NOT EXISTS poem_votes (
                poem_id VARCHAR(100) PRIMARY KEY,
                message_id VARCHAR(20) NOT NULL,
                channel_id VARCHAR(20) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                upvotes INT NOT NULL DEFAULT 0,
                downvotes INT NOT NULL DEFAULT 0,
                voters TEXT, -- JSON array of user IDs who voted
                poem_data JSON, -- Stores poem theme, content, marriage_id, etc.
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NULL,
                INDEX idx_message (message_id),
                INDEX idx_channel (channel_id),
                INDEX idx_guild (guild_id),
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS rob_stats (
                id VARCHAR(100) PRIMARY KEY,
                robber_id VARCHAR(20) NOT NULL,
                victim_id VARCHAR(20) NOT NULL,
                robber_name VARCHAR(255),
                victim_name VARCHAR(255),
                amount_stolen DECIMAL(20,2) DEFAULT 0.00,
                penalty_paid DECIMAL(20,2) DEFAULT 0.00,
                success BOOLEAN NOT NULL,
                robber_tier VARCHAR(50),
                victim_tier VARCHAR(50),
                tier_difference INT DEFAULT 0,
                robber_balance_before DECIMAL(20,2),
                victim_balance_before DECIMAL(20,2),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                guild_id VARCHAR(20),
                
                INDEX idx_robber_id (robber_id),
                INDEX idx_victim_id (victim_id),
                INDEX idx_timestamp (timestamp),
                INDEX idx_success (success),
                INDEX idx_guild (guild_id)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS marriage_levels (
                id INT AUTO_INCREMENT PRIMARY KEY,
                marriage_id INT NOT NULL,
                current_level INT DEFAULT 1,
                current_xp INT DEFAULT 0,
                total_challenges_completed INT DEFAULT 0,
                last_level_up TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                
                FOREIGN KEY (marriage_id) REFERENCES marriages(id) ON DELETE CASCADE,
                INDEX idx_marriage_id (marriage_id),
                INDEX idx_level (current_level),
                INDEX idx_xp (current_xp)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS marriage_challenges (
                id INT AUTO_INCREMENT PRIMARY KEY,
                week_start DATE NOT NULL,
                challenge_1 JSON NOT NULL,
                challenge_2 JSON NOT NULL,
                challenge_3 JSON NOT NULL,
                challenge_4 JSON NOT NULL,
                bonus_challenge JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                UNIQUE KEY unique_week (week_start),
                INDEX idx_week_start (week_start)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS marriage_challenge_progress (
                id INT AUTO_INCREMENT PRIMARY KEY,
                marriage_id INT NOT NULL,
                week_start DATE NOT NULL,
                challenge_1_completed BOOLEAN DEFAULT FALSE,
                challenge_1_completed_at TIMESTAMP NULL,
                challenge_2_completed BOOLEAN DEFAULT FALSE,
                challenge_2_completed_at TIMESTAMP NULL,
                challenge_3_completed BOOLEAN DEFAULT FALSE,
                challenge_3_completed_at TIMESTAMP NULL,
                challenge_4_completed BOOLEAN DEFAULT FALSE,
                challenge_4_completed_at TIMESTAMP NULL,
                bonus_challenge_completed BOOLEAN DEFAULT FALSE,
                bonus_challenge_completed_at TIMESTAMP NULL,
                total_xp_earned INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                
                FOREIGN KEY (marriage_id) REFERENCES marriages(id) ON DELETE CASCADE,
                UNIQUE KEY unique_marriage_week (marriage_id, week_start),
                INDEX idx_marriage_id (marriage_id),
                INDEX idx_week_start (week_start),
                INDEX idx_completed (challenge_1_completed, challenge_2_completed, challenge_3_completed, challenge_4_completed)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            
            // Marriage task completions table (simplified task tracking)
            `CREATE TABLE IF NOT EXISTS marriage_task_completions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                marriage_id INT NOT NULL,
                task_number TINYINT NOT NULL,
                completed_by VARCHAR(255) NOT NULL,
                week_start DATE NOT NULL,
                completion_data TEXT NULL,
                completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (marriage_id) REFERENCES marriages(id) ON DELETE CASCADE,
                UNIQUE KEY unique_marriage_task_week (marriage_id, task_number, week_start),
                INDEX idx_marriage_week (marriage_id, week_start),
                INDEX idx_completed_at (completed_at)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS guild_members (
                id VARCHAR(50) PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                username VARCHAR(100) DEFAULT NULL,
                display_name VARCHAR(100) DEFAULT NULL,
                nickname VARCHAR(100) DEFAULT NULL,
                roles JSON DEFAULT NULL,
                permissions VARCHAR(20) DEFAULT NULL,
                is_owner BOOLEAN DEFAULT FALSE,
                is_administrator BOOLEAN DEFAULT FALSE,
                is_moderator BOOLEAN DEFAULT FALSE,
                is_booster BOOLEAN DEFAULT FALSE,
                premium_since TIMESTAMP NULL,
                joined_at TIMESTAMP NULL,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                UNIQUE KEY unique_user_guild (user_id, guild_id),
                INDEX idx_user_id (user_id),
                INDEX idx_guild_id (guild_id),
                INDEX idx_is_owner (is_owner),
                INDEX idx_is_administrator (is_administrator),
                INDEX idx_is_moderator (is_moderator),
                INDEX idx_last_updated (last_updated)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        ];

        const connection = await this.pool.getConnection();
        try {
            for (const query of createTables) {
                await connection.execute(query);
            }
            
            // Update column sizes if they exist with smaller precision
            const alterQueries = [
                `ALTER TABLE user_balances MODIFY COLUMN wallet DECIMAL(20,2) NOT NULL DEFAULT 1000.00`,
                `ALTER TABLE user_balances MODIFY COLUMN bank DECIMAL(20,2) NOT NULL DEFAULT 0.00`,
                `ALTER TABLE user_stats MODIFY COLUMN total_wagered DECIMAL(20,2) NOT NULL DEFAULT 0.00`,
                `ALTER TABLE user_stats MODIFY COLUMN total_won DECIMAL(20,2) NOT NULL DEFAULT 0.00`,
                `ALTER TABLE user_stats MODIFY COLUMN biggest_win DECIMAL(20,2) NOT NULL DEFAULT 0.00`,
                `ALTER TABLE user_stats MODIFY COLUMN biggest_loss DECIMAL(20,2) NOT NULL DEFAULT 0.00`,
                `ALTER TABLE user_stats MODIFY COLUMN total_winnings DECIMAL(20,2) NOT NULL DEFAULT 0.00`,
                `ALTER TABLE user_stats MODIFY COLUMN total_losses_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00`,
                // Fix scratch tickets status ENUM to include 'dropped'
                `ALTER TABLE scratch_tickets MODIFY COLUMN status ENUM('dropped', 'active', 'scratching', 'won', 'lost', 'expired') DEFAULT 'dropped'`,
                // Allow NULL user_id for unclaimed tickets
                `ALTER TABLE scratch_tickets MODIFY COLUMN user_id VARCHAR(20) DEFAULT NULL`,
                // Add manual award columns to lottery_tickets table
                `ALTER TABLE lottery_tickets ADD COLUMN awarded_manually BOOLEAN DEFAULT FALSE`,
                `ALTER TABLE lottery_tickets ADD COLUMN award_reason TEXT DEFAULT NULL`,
                `ALTER TABLE lottery_tickets ADD COLUMN awarded_by VARCHAR(20) DEFAULT NULL`,
                // Add daily send limit tracking columns to user_balances table
                `ALTER TABLE user_balances ADD COLUMN daily_sent DECIMAL(20,2) NOT NULL DEFAULT 0.00`,
                `ALTER TABLE user_balances ADD COLUMN last_send_reset BIGINT NOT NULL DEFAULT 0`,
                // Add missing cooldown columns to user_balances table
                `ALTER TABLE user_balances ADD COLUMN last_earnmoney_ts BIGINT NOT NULL DEFAULT 0`,
                `ALTER TABLE user_balances ADD COLUMN last_dailytask_ts BIGINT NOT NULL DEFAULT 0`,
                `ALTER TABLE user_balances ADD COLUMN last_quiz_ts BIGINT NOT NULL DEFAULT 0`,
                // Add tier column to lottery tables for multi-tier lottery support
                `ALTER TABLE lottery_tickets ADD COLUMN tier TINYINT DEFAULT 1`,
                `ALTER TABLE lottery_info ADD COLUMN tier TINYINT DEFAULT 1`,
                // Update lottery_info primary key to include tier
                `ALTER TABLE lottery_info DROP PRIMARY KEY, ADD PRIMARY KEY (guild_id, tier)`,
                // Update lottery_tickets unique key to include tier  
                `ALTER TABLE lottery_tickets DROP INDEX unique_user_week, ADD UNIQUE KEY unique_user_week_tier (user_id, guild_id, week_start, tier)`,
                // Add indexes for tier columns
                `ALTER TABLE lottery_tickets ADD INDEX idx_tier (tier)`,
                `ALTER TABLE lottery_info ADD INDEX idx_tier (tier)`,
                // Fix lottery_info_tier2 current_week_start column type to match main table
                `ALTER TABLE lottery_info_tier2 MODIFY COLUMN current_week_start DATE`
            ];
            
            for (const query of alterQueries) {
                try {
                    await connection.execute(query);
                } catch (alterError) {
                    // Ignore errors if columns already have the right size
                    if (!alterError.message.includes('Unknown column')) {
                        logger.debug(`Alter table note: ${alterError.message}`);
                    }
                }
            }
            
            // Ensure last_xp_gain column exists in user_levels table
            try {
                await connection.execute(`
                    ALTER TABLE user_levels 
                    ADD COLUMN last_xp_gain TIMESTAMP NULL AFTER last_level_up
                `);
                logger.info('Added last_xp_gain column to user_levels table');
            } catch (addColumnError) {
                // Column might already exist
                if (!addColumnError.message.includes('Duplicate column name')) {
                    logger.debug(`Last XP gain column migration: ${addColumnError.message}`);
                }
            }
            
            logger.info('MariaDB schema initialized successfully');
        } finally {
            connection.release();
        }
    }


    /**
     * Execute query with automatic connection management
     */
    async executeQuery(query, params = []) {
        if (!this.pool) {
            throw new Error('Database not initialized - pool is null');
        }
        
        try {
            const connection = await this.pool.getConnection();
            try {
                const [results] = await connection.execute(query, params);
                return results; // Return the actual results, not wrapped in extra array
            } finally {
                connection.release();
            }
        } catch (error) {
            logger.error(`Database query failed: ${error.message}`);
            logger.error(`Query: ${query}`);
            logger.error(`Params: ${JSON.stringify(params)}`);
            throw error;
        }
    }

    /**
     * Execute query with automatic connection management, but suppress specific error messages
     */
    async executeQuerySilent(query, params = [], suppressedErrors = []) {
        if (!this.pool) {
            throw new Error('Database not initialized - pool is null');
        }
        
        try {
            const connection = await this.pool.getConnection();
            try {
                const [results] = await connection.execute(query, params);
                return results; // Return the actual results, not wrapped in extra array
            } finally {
                connection.release();
            }
        } catch (error) {
            // Check if this error should be suppressed
            const shouldSuppress = suppressedErrors.some(suppressedMsg => 
                error.message.includes(suppressedMsg)
            );
            
            if (!shouldSuppress) {
                logger.error(`Database query failed: ${error.message}`);
                logger.error(`Query: ${query}`);
                logger.error(`Params: ${JSON.stringify(params)}`);
                throw error;
            }
            // If error is suppressed, return null instead of throwing
            return null;
        }
    }


    // ========================= USER BALANCE OPERATIONS =========================

    /**
     * Get user balance
     */
    async getUserBalance(userId, guildId = null) {
        try {
            // Convert undefined to null for SQL compatibility
            const safeUserId = userId ?? null;
            const safeGuildId = guildId ?? null;

            const rows = await this.executeQuery(
                'SELECT * FROM user_balances WHERE user_id = ?', 
                [safeUserId]
            );
            
            if (rows.length > 0) {
                const row = rows[0];
                
                // Validate and sanitize balance values
                let wallet = parseFloat(row.wallet);
                let bank = parseFloat(row.bank);
                
                let needsFix = false;
                if (isNaN(wallet) || !isFinite(wallet)) {
                    logger.error(`Invalid wallet value in database for user ${userId}: ${row.wallet}, resetting to 0`);
                    wallet = 0;
                    needsFix = true;
                }
                if (isNaN(bank) || !isFinite(bank)) {
                    logger.error(`Invalid bank value in database for user ${userId}: ${row.bank}, resetting to 0`);
                    bank = 0;
                    needsFix = true;
                }
                
                // Auto-fix NaN values in database
                if (needsFix) {
                    logger.info(`Auto-fixing NaN balance for user ${userId}`);
                    const fixQuery = 'UPDATE user_balances SET wallet = ?, bank = ? WHERE user_id = ?';
                    await this.query(fixQuery, [wallet, bank, userId]);
                }
                
                return {
                    user_id: userId,
                    wallet: wallet,
                    bank: bank,
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
                // Create new user
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

                await this.executeQuery(
                    `INSERT IGNORE INTO user_balances 
                     (user_id, wallet, bank, last_earn_ts, last_rob_ts, game_active, 
                      last_work_ts, last_beg_ts, last_crime_ts, last_heist_ts) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [userId, 1000.0, 0.0, 0.0, 0.0, false, 0.0, 0.0, 0.0, 0.0]
                );

                // Re-fetch the user data in case it was already created by another process
                const newRows = await this.executeQuery(
                    'SELECT * FROM user_balances WHERE user_id = ?', 
                    [userId]
                );
                
                if (newRows.length > 0) {
                    const row = newRows[0];
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
                }

                return defaultBalance;
            }
        } catch (error) {
            logger.error(`MariaDB getUserBalance error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update user balance
     */
    async updateUserBalance(userId, guildId = null, walletChange = 0, bankChange = 0, kwargs = {}) {
        try {
            const current = await this.getUserBalance(userId, guildId);
            
            // Validate current balances
            if (isNaN(current.wallet) || !isFinite(current.wallet)) {
                logger.error(`Current wallet balance is invalid for user ${userId}: ${current.wallet}`);
                current.wallet = 0; // Reset to safe value
            }
            if (isNaN(current.bank) || !isFinite(current.bank)) {
                logger.error(`Current bank balance is invalid for user ${userId}: ${current.bank}`);
                current.bank = 0; // Reset to safe value
            }
            
            // Validate change amounts
            const walletChangeValue = parseFloat(walletChange) || 0;
            const bankChangeValue = parseFloat(bankChange) || 0;
            
            if (isNaN(walletChangeValue) || !isFinite(walletChangeValue)) {
                logger.error(`Invalid wallet change for user ${userId}: ${walletChange}`);
                return false;
            }
            if (isNaN(bankChangeValue) || !isFinite(bankChangeValue)) {
                logger.error(`Invalid bank change for user ${userId}: ${bankChange}`);
                return false;
            }
            
            // Use safe addition to prevent NaN results
            const { safeAdd } = require('./common');
            const newWallet = Math.max(0, safeAdd(current.wallet, walletChangeValue)); // Prevent negative wallet
            const newBank = Math.max(0, safeAdd(current.bank, bankChangeValue)); // Prevent negative bank

            const updateFields = ['wallet = ?', 'bank = ?', 'updated_at = NOW()'];
            const updateValues = [newWallet, newBank];

            // Handle additional fields
            for (const [key, value] of Object.entries(kwargs)) {
                if (key !== 'user_id' && key !== 'guild_id') {
                    updateFields.push(`${key} = ?`);
                    updateValues.push(value);
                }
            }

            updateValues.push(userId);

            await this.executeQuery(
                `UPDATE user_balances SET ${updateFields.join(', ')} WHERE user_id = ?`,
                updateValues
            );

            logger.info(`Updated balance for user ${userId}: wallet_change=${walletChange}, bank_change=${bankChange}`);
            return true;
        } catch (error) {
            logger.error(`MariaDB updateUserBalance error: ${error.message}`);
            return false;
        }
    }

    /**
     * Set user balance (absolute values)
     */
    async setUserBalance(userId, guildId = null, wallet = null, bank = null, kwargs = {}) {
        try {
            // Safety check for undefined values
            if (userId === undefined) {
                logger.error('setUserBalance called with undefined userId');
                return false;
            }
            if (guildId === undefined) {
                guildId = null; // Convert undefined to null
            }
            
            const updateFields = ['updated_at = NOW()'];
            const updateValues = [];

            if (wallet !== null) {
                let walletValue = parseFloat(wallet);
                if (isNaN(walletValue) || !isFinite(walletValue)) {
                    logger.error(`Invalid wallet value for user ${userId}: ${wallet} (converted to ${walletValue}), defaulting to 0`);
                    walletValue = 0; // Default to 0 instead of failing
                }
                updateFields.push('wallet = ?');
                updateValues.push(walletValue);
            }
            if (bank !== null) {
                let bankValue = parseFloat(bank);
                if (isNaN(bankValue) || !isFinite(bankValue)) {
                    logger.error(`Invalid bank value for user ${userId}: ${bank} (converted to ${bankValue}), defaulting to 0`);
                    bankValue = 0; // Default to 0 instead of failing
                }
                updateFields.push('bank = ?');
                updateValues.push(bankValue);
            }

            // Handle additional fields
            for (const [key, value] of Object.entries(kwargs)) {
                if (key !== 'user_id' && key !== 'guild_id') {
                    updateFields.push(`${key} = ?`);
                    updateValues.push(value);
                }
            }

            updateValues.push(userId);

            await this.executeQuery(
                `UPDATE user_balances SET ${updateFields.join(', ')} WHERE user_id = ?`,
                updateValues
            );

            logger.info(`Set balance for user ${userId}: wallet=${wallet}, bank=${bank}`);
            return true;
        } catch (error) {
            logger.error(`MariaDB setUserBalance error: ${error.message}`);
            return false;
        }
    }

    // ========================= COMPATIBILITY METHODS =========================

    /**
     * Get user balances (compatibility method)
     */
    async getBalances(userId, guildId) {
        const balance = await this.getUserBalance(userId, guildId);
        return [balance.wallet, balance.bank];
    }

    /**
     * Set user balances (compatibility method)
     */
    async setBalances(userId, guildId, wallet = null, bank = null) {
        const success = await this.setUserBalance(userId, guildId, wallet, bank);
        if (success) {
            const balance = await this.getUserBalance(userId, guildId);
            return [balance.wallet, balance.bank];
        }
        return [0, 0];
    }

    /**
     * Adjust wallet by delta amount (compatibility method)
     */
    async adjustWallet(userId, guildId, delta, floor = 0.0) {
        const balance = await this.getUserBalance(userId, guildId);
        const newWallet = balance.wallet + delta;
        
        if (newWallet < floor) {
            return [false, balance.wallet];
        }
        
        // Use updateUserBalance for relative changes instead of setUserBalance for absolute values
        const success = await this.updateUserBalance(userId, guildId, delta, 0);
        return [success, newWallet];
    }

    /**
     * Ensure user exists (compatibility method)
     */
    async ensureUser(userId, username = null, guildId = null) {
        await this.getUserBalance(userId); // This will create user if not exists
        
        // Also ensure level record exists if guildId provided
        if (guildId) {
            await this.getUserLevel(userId, guildId);
        }
        
        if (username) {
            await this.updateUsername(userId, username);
        }
    }

    async updateUsername(userId, username) {
        try {
            await this.executeQuery(
                'UPDATE user_balances SET username = ? WHERE user_id = ?',
                [username, userId]
            );
            return true;
        } catch (error) {
            logger.error(`MariaDB updateUsername error: ${error.message}`);
            return false;
        }
    }

    // ========================= PLACEHOLDER METHODS =========================
    // These methods return defaults for now - can be implemented later if needed

    async getUserStats(userId, guildId = null, gameType = null) {
        try {
            // Convert undefined to null for SQL compatibility
            const safeUserId = userId ?? null;
            const safeGuildId = guildId ?? null;
            const safeGameType = gameType ?? null;

            let query;
            let params;

            if (safeGameType) {
                // Get stats for specific game type
                query = 'SELECT * FROM user_stats WHERE user_id = ? AND game_type = ?';
                params = [safeUserId, safeGameType];
            } else {
                // Get all stats for user, organized by game type
                query = 'SELECT * FROM user_stats WHERE user_id = ?';
                params = [safeUserId];
            }

            const [rows] = await this.pool.execute(query, params);

            if (gameType) {
                // Return single game stats or null
                return rows.length > 0 ? rows[0] : null;
            } else {
                // Return all stats organized by game type
                const statsMap = {};
                for (const row of rows) {
                    statsMap[row.game_type] = {
                        wins: row.wins || 0,
                        losses: row.losses || 0,
                        total_wagered: parseFloat(row.total_wagered) || 0,
                        total_won: parseFloat(row.total_won) || 0,
                        biggest_win: parseFloat(row.biggest_win) || 0,
                        biggest_loss: parseFloat(row.biggest_loss) || 0,
                        total_wins: row.total_wins || 0,
                        total_losses: row.total_losses || 0,
                        total_games_played: row.total_games_played || 0,
                        total_winnings: parseFloat(row.total_winnings) || 0,
                        total_losses_amount: parseFloat(row.total_losses_amount) || 0,
                        last_game_played: row.last_game_played
                    };
                }
                return statsMap;
            }
        } catch (error) {
            logger.error(`Failed to get user stats: ${error.message}`);
            return gameType ? null : {};
        }
    }

    async updateUserStats(userId, guildId = null, gameType = null, win = null, wagered = 0, result = 0, userProfile = null) {
        try {
            if (!userId || !gameType) {
                logger.warn(`updateUserStats called with missing userId or gameType - userId: ${userId}, gameType: ${gameType}`);
                logger.warn('Stack trace:', new Error().stack);
                return false;
            }

            // Ensure the user exists in the database first
            await this.ensureUser(userId, `User-${userId}`);

            // Get or create game stats for this user and game type
            const statsQuery = `
                SELECT * FROM user_stats 
                WHERE user_id = ? AND game_type = ?
            `;
            
            const [existingRows] = await this.pool.execute(statsQuery, [userId, gameType]);
            
            if (existingRows.length === 0) {
                // Create new stats record with generated composite ID
                const statsId = `${userId}_${gameType}`;
                const insertQuery = `
                    INSERT INTO user_stats 
                    (id, user_id, game_type, wins, losses, total_wagered, total_won, total_games_played, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                `;
                
                const wins = win === true ? 1 : 0;
                const losses = win === false ? 1 : 0;
                const gamesPlayed = 1;
                
                await this.pool.execute(insertQuery, [
                    statsId,
                    userId, 
                    gameType, 
                    wins, 
                    losses, 
                    wagered || 0, 
                    result || 0, 
                    gamesPlayed
                ]);
                
                logger.info(`Created new game stats for user ${userId}, game ${gameType}`);
            } else {
                // Update existing stats record
                const existingStats = existingRows[0];
                
                const newWins = existingStats.wins + (win === true ? 1 : 0);
                const newLosses = existingStats.losses + (win === false ? 1 : 0);
                const newTotalWagered = parseFloat(existingStats.total_wagered) + (wagered || 0);
                const newTotalWon = parseFloat(existingStats.total_won) + (result || 0);
                const newGamesPlayed = existingStats.total_games_played + 1;
                
                const updateQuery = `
                    UPDATE user_stats 
                    SET wins = ?, losses = ?, total_wagered = ?, total_won = ?, 
                        total_games_played = ?, updated_at = NOW()
                    WHERE user_id = ? AND game_type = ?
                `;
                
                await this.pool.execute(updateQuery, [
                    newWins,
                    newLosses, 
                    newTotalWagered,
                    newTotalWon,
                    newGamesPlayed,
                    userId,
                    gameType
                ]);
                
                logger.debug(`Updated game stats for user ${userId}, game ${gameType}: ${newWins}W/${newLosses}L, wagered ${newTotalWagered}, won ${newTotalWon}`);
            }
            
            return true;
        } catch (error) {
            logger.error(`Failed to update user stats for ${userId}/${gameType}: ${error.message}`);
            return false;
        }
    }


    async getUserLotteryTickets(userId, guildId, tier = 1) {
        try {
            // Get current week start (Sunday)
            const currentWeekStart = this.getCurrentWeekStart();
            
            // For tier 1, check both tier 1 and legacy records (no tier column)
            let query, params;
            if (tier === 1) {
                query = `SELECT COALESCE(SUM(ticket_count), 0) as total_tickets 
                         FROM lottery_tickets 
                         WHERE user_id = ? AND guild_id = ? AND week_start = ? AND (tier = 1 OR tier IS NULL)`;
                params = [userId, guildId, currentWeekStart];
            } else {
                query = `SELECT COALESCE(SUM(ticket_count), 0) as total_tickets 
                         FROM lottery_tickets 
                         WHERE user_id = ? AND guild_id = ? AND week_start = ? AND tier = ?`;
                params = [userId, guildId, currentWeekStart, tier];
            }
            
            const [rows] = await this.pool.execute(query, params);
            
            return rows[0].total_tickets || 0;
        } catch (error) {
            logger.error(`Failed to get user lottery tickets for tier ${tier}: ${error.message}`);
            return 0;
        }
    }

    async purchaseLotteryTickets(userId, guildId, ticketCount, totalCost, tier = 1) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();
            
            // Get current week start
            const currentWeekStart = this.getCurrentWeekStart();
            
            // Check current ticket count to enforce 10 ticket limit per tier
            let query, params;
            if (tier === 1) {
                query = `SELECT COALESCE(SUM(ticket_count), 0) as total_tickets 
                         FROM lottery_tickets 
                         WHERE user_id = ? AND guild_id = ? AND week_start = ? AND (tier = 1 OR tier IS NULL)`;
                params = [userId, guildId, currentWeekStart];
            } else {
                query = `SELECT COALESCE(SUM(ticket_count), 0) as total_tickets 
                         FROM lottery_tickets 
                         WHERE user_id = ? AND guild_id = ? AND week_start = ? AND tier = ?`;
                params = [userId, guildId, currentWeekStart, tier];
            }
            
            const [currentTicketsResult] = await connection.execute(query, params);
            const currentTickets = currentTicketsResult[0].total_tickets || 0;
            
            // Check if purchase would exceed 10 ticket limit
            if (currentTickets + ticketCount > 10) {
                await connection.rollback();
                logger.warn(`User ${userId} attempted to purchase ${ticketCount} tier ${tier} tickets but already has ${currentTickets}/10`);
                return false; // Would exceed ticket limit
            }
            
            // Deduct cost from user wallet
            const [updateResult] = await connection.execute(
                'UPDATE user_balances SET wallet = wallet - ? WHERE user_id = ? AND wallet >= ?',
                [totalCost, userId, totalCost]
            );
            
            if (updateResult.affectedRows === 0) {
                await connection.rollback();
                return false; // Insufficient funds
            }
            
            // First try to add tier column if it doesn't exist (backward compatibility)
            try {
                await connection.execute('ALTER TABLE lottery_tickets ADD COLUMN tier INT DEFAULT 1');
            } catch (alterError) {
                // Column already exists, continue
            }
            
            // Insert or update lottery tickets with tier support
            if (tier === 1) {
                // For tier 1, use legacy behavior (tier = 1 or NULL)
                await connection.execute(
                    `INSERT INTO lottery_tickets (user_id, guild_id, ticket_count, purchase_cost, week_start, tier, purchased_at) 
                     VALUES (?, ?, ?, ?, ?, 1, NOW()) 
                     ON DUPLICATE KEY UPDATE 
                     ticket_count = ticket_count + ?, 
                     purchase_cost = purchase_cost + ?,
                     tier = 1,
                     purchased_at = NOW()`,
                    [userId, guildId, ticketCount, totalCost, currentWeekStart, ticketCount, totalCost]
                );
            } else {
                // For tier 2+, explicitly set tier
                await connection.execute(
                    `INSERT INTO lottery_tickets (user_id, guild_id, ticket_count, purchase_cost, week_start, tier, purchased_at) 
                     VALUES (?, ?, ?, ?, ?, ?, NOW()) 
                     ON DUPLICATE KEY UPDATE 
                     ticket_count = ticket_count + ?, 
                     purchase_cost = purchase_cost + ?,
                     purchased_at = NOW()`,
                    [userId, guildId, ticketCount, totalCost, currentWeekStart, tier, ticketCount, totalCost]
                );
            }
            
            // Add tier column to lottery_info if it doesn't exist
            try {
                await connection.execute('ALTER TABLE lottery_info ADD COLUMN tier INT DEFAULT 1');
            } catch (alterError) {
                // Column already exists, continue
            }
            
            // Update lottery info with tier support
            if (tier === 2) {
                // Handle tier 2 using separate table
                await this.updateTier2LotteryTickets(connection, guildId, ticketCount, currentWeekStart);
            } else {
                // Handle tier 1 using main table
                const [existingRecord] = await connection.execute(
                    'SELECT total_tickets FROM lottery_info WHERE guild_id = ? AND (tier = 1 OR tier IS NULL)',
                    [guildId]
                );
                
                if (existingRecord.length > 0) {
                    // Update existing record for tier 1
                    await connection.execute(
                        'UPDATE lottery_info SET total_tickets = total_tickets + ?, current_week_start = ? WHERE guild_id = ?',
                        [ticketCount, currentWeekStart, guildId]
                    );
                } else {
                    // Insert new record for tier 1
                    await connection.execute(
                        'INSERT INTO lottery_info (guild_id, total_tickets, total_prize, current_week_start, tier) VALUES (?, ?, 400000.00, ?, 1)',
                        [guildId, ticketCount, currentWeekStart]
                    );
                }
            }
            
            await connection.commit();
            logger.info(`User ${userId} purchased ${ticketCount} tier ${tier} lottery tickets for $${totalCost} (now has ${currentTickets + ticketCount}/10)`);
            return true;
        } catch (error) {
            await connection.rollback();
            logger.error(`Failed to purchase tier ${tier} lottery tickets: ${error.message}`);
            return false;
        } finally {
            connection.release();
        }
    }

    async getAllLotteryTickets(guildId) {
        try {
            const currentWeekStart = this.getCurrentWeekStart();
            const [rows] = await this.pool.execute(
                'SELECT user_id, SUM(ticket_count) as tickets FROM lottery_tickets WHERE guild_id = ? AND week_start = ? GROUP BY user_id',
                [guildId, currentWeekStart]
            );
            return rows;
        } catch (error) {
            logger.error(`Error getting all lottery tickets: ${error.message}`);
            return [];
        }
    }

    async getLotteryInfo(guildId, tier = 1) {
        try {
            const currentWeekStart = this.getCurrentWeekStart();
            
            // First try to add tier column if it doesn't exist (backward compatibility)
            try {
                await this.pool.execute('ALTER TABLE lottery_info ADD COLUMN tier INT DEFAULT 1');
            } catch (alterError) {
                // Column already exists, continue
            }
            
            // For tier 2, we'll use a different approach due to primary key constraints
            if (tier === 2) {
                // Use a separate table for tier 2 or store tier 2 data differently
                return await this.getTier2LotteryInfo(guildId);
            }
            
            // For tier 1, check both tier 1 and legacy records (no tier column)
            let query, params;
            if (tier === 1) {
                query = 'SELECT * FROM lottery_info WHERE guild_id = ? AND (tier = 1 OR tier IS NULL)';
                params = [guildId];
            } else {
                query = 'SELECT * FROM lottery_info WHERE guild_id = ? AND tier = ?';
                params = [guildId, tier];
            }
            
            const [rows] = await this.pool.execute(query, params);
            
            if (rows.length === 0) {
                // Create default lottery info for guild and tier
                const defaultPrize = tier === 1 ? 400000.00 : 3000000.00; // Tier 2 starts at 3M
                
                try {
                    // Use INSERT IGNORE to handle duplicate key gracefully
                    await this.pool.execute(
                        `INSERT IGNORE INTO lottery_info (guild_id, total_tickets, total_prize, current_week_start, tier) 
                         VALUES (?, 0, ?, ?, ?)`,
                        [guildId, defaultPrize, currentWeekStart, tier]
                    );
                } catch (insertError) {
                    // If INSERT IGNORE fails, the record might already exist or there's a schema issue
                    // Try to handle the existing record case
                    if (insertError.code === 'ER_DUP_ENTRY') {
                        // If tier 1 exists and we're trying to create tier 2, we need to work around the constraint
                        if (tier === 2) {
                            // For tier 2, return a default object since we can't create the record due to PK constraint
                            logger.warn(`Cannot create tier 2 lottery record due to primary key constraint for guild ${guildId}`);
                            return {
                                total_tickets: 0,
                                total_prize: defaultPrize,
                                next_drawing: null,
                                current_week_start: currentWeekStart,
                                tier: tier
                            };
                        }
                    }
                    throw insertError;
                }
                
                return {
                    total_tickets: 0,
                    total_prize: defaultPrize,
                    next_drawing: null,
                    current_week_start: currentWeekStart,
                    tier: tier
                };
            }
            
            return rows[0];
        } catch (error) {
            logger.error(`Failed to get lottery info for tier ${tier}: ${error.message}`);
            const defaultPrize = tier === 1 ? 400000 : 3000000;
            return {
                total_tickets: 0,
                total_prize: defaultPrize,
                next_drawing: null,
                current_week_start: this.getCurrentWeekStart(),
                tier: tier
            };
        }
    }

    /**
     * Get tier 2 lottery info using a separate storage mechanism
     * This handles the primary key constraint issue with the main lottery_info table
     */
    async getTier2LotteryInfo(guildId) {
        try {
            const currentWeekStart = this.getCurrentWeekStart();
            
            // Try to create a tier 2 lottery table if it doesn't exist
            try {
                await this.pool.execute(`
                    CREATE TABLE IF NOT EXISTS lottery_info_tier2 (
                        guild_id VARCHAR(255) PRIMARY KEY,
                        total_tickets INT DEFAULT 0,
                        total_prize DECIMAL(15,2) DEFAULT 3000000.00,
                        current_week_start DATE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    )
                `);
            } catch (createError) {
                logger.debug(`Tier 2 table already exists or creation failed: ${createError.message}`);
            }
            
            // Get tier 2 lottery info
            const [rows] = await this.pool.execute(
                'SELECT *, 2 as tier FROM lottery_info_tier2 WHERE guild_id = ?',
                [guildId]
            );
            
            if (rows.length === 0) {
                // Create default tier 2 record
                await this.pool.execute(
                    'INSERT INTO lottery_info_tier2 (guild_id, total_tickets, total_prize, current_week_start) VALUES (?, 0, 3000000.00, ?)',
                    [guildId, currentWeekStart]
                );
                
                return {
                    total_tickets: 0,
                    total_prize: 3000000.00,
                    next_drawing: null,
                    current_week_start: currentWeekStart,
                    tier: 2
                };
            }
            
            return rows[0];
        } catch (error) {
            logger.error(`Failed to get tier 2 lottery info: ${error.message}`);
            // Return default values
            return {
                total_tickets: 0,
                total_prize: 3000000.00,
                next_drawing: null,
                current_week_start: this.getCurrentWeekStart(),
                tier: 2
            };
        }
    }

    /**
     * Update tier 2 lottery tickets count using separate table
     */
    async updateTier2LotteryTickets(connection, guildId, ticketCount, currentWeekStart) {
        try {
            // Ensure tier 2 table exists
            await connection.execute(`
                CREATE TABLE IF NOT EXISTS lottery_info_tier2 (
                    guild_id VARCHAR(255) PRIMARY KEY,
                    total_tickets INT DEFAULT 0,
                    total_prize DECIMAL(15,2) DEFAULT 3000000.00,
                    current_week_start BIGINT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);
            
            // Update or insert tier 2 lottery info
            await connection.execute(
                `INSERT INTO lottery_info_tier2 (guild_id, total_tickets, total_prize, current_week_start) 
                 VALUES (?, ?, 3000000.00, ?) 
                 ON DUPLICATE KEY UPDATE 
                 total_tickets = total_tickets + ?, 
                 current_week_start = ?`,
                [guildId, ticketCount, currentWeekStart, ticketCount, currentWeekStart]
            );
        } catch (error) {
            logger.error(`Failed to update tier 2 lottery tickets: ${error.message}`);
            throw error;
        }
    }

    getCurrentWeekStart() {
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const daysToSubtract = dayOfWeek; // Days since Sunday
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - daysToSubtract);
        weekStart.setHours(0, 0, 0, 0);
        return weekStart.toISOString().split('T')[0]; // Return YYYY-MM-DD format
    }

    async getTopUsersByBalance(guildId, limit = 10) {
        try {
            // Note: Balances are stored globally per user, not per guild
            // GuildId parameter is kept for API consistency but not used in query
            const [rows] = await this.pool.execute(
                `SELECT user_id, wallet, bank, username, 
                        (wallet + bank) as total_balance,
                        created_at, updated_at
                 FROM user_balances 
                 WHERE (wallet + bank) > 0
                 ORDER BY total_balance DESC 
                 LIMIT ?`,
                [limit]
            );
            
            logger.info(`Retrieved ${rows.length} users for balance leaderboard (limit: ${limit})`);
            return rows;
        } catch (error) {
            logger.error(`Failed to get top users by balance: ${error.message}`);
            return [];
        }
    }

    async getTopUsersByWins(guildId, limit = 10) {
        try {
            // Get aggregated stats for each user across all game types
            const [rows] = await this.pool.execute(
                `SELECT 
                    s.user_id,
                    b.username,
                    SUM(s.total_wins) as total_wins,
                    SUM(s.total_losses) as total_losses,
                    SUM(s.total_games_played) as total_games_played,
                    SUM(s.total_winnings) as total_winnings,
                    SUM(s.total_losses_amount) as total_losses_amount,
                    MAX(s.last_game_played) as last_game_played
                 FROM user_stats s
                 LEFT JOIN user_balances b ON s.user_id = b.user_id
                 GROUP BY s.user_id, b.username
                 HAVING total_wins > 0
                 ORDER BY total_wins DESC
                 LIMIT ?`,
                [limit]
            );
            return rows;
        } catch (error) {
            logger.error(`Failed to get top users by wins: ${error.message}`);
            return [];
        }
    }

    /**
     * Check if user is admin or developer (should be excluded from ML data)
     */
    isAdminOrDeveloper(userId, guildId) {
        const DEVELOPER_ID = '466050111680544798';
        
        // Always exclude developer
        if (userId === DEVELOPER_ID) {
            return true;
        }
        
        // Check for admin roles - this is a simple check
        // You can expand this to check actual Discord roles if needed
        try {
            // For now, we'll exclude users with admin permissions or specific admin role IDs
            // This can be enhanced to check actual Discord permissions when available
            const ADMIN_USER_IDS = [
                // Add specific admin user IDs here if known
                // '123456789012345678', // Example admin ID
            ];
            
            return ADMIN_USER_IDS.includes(userId);
        } catch (error) {
            // If there's an error checking, don't exclude (safer to include)
            return false;
        }
    }

    /**
     * Record game result for statistics
     */
    async recordGameResult(userId, guildId, gameType, won, betAmount, payout, metadata = {}) {
        try {
            // Convert undefined to null for SQL compatibility
            const safeUserId = userId ?? null;
            const safeGuildId = guildId ?? null;
            const safeGameType = gameType ?? null;
            const safeBetAmount = betAmount ?? 0;
            const safePayout = payout ?? 0;
            const safeWon = won ?? false;
            const safeMetadata = metadata ?? {};
            
            // Log when gameType is null/undefined to track the issue
            if (!gameType) {
                logger.warn(`recordGameResult called with null/undefined gameType - userId: ${userId}, guildId: ${guildId}, gameType: ${gameType}`);
                logger.warn('Stack trace:', new Error().stack);
                // Skip recording to prevent database constraint errors
                return false;
            }
            
            // Exclude developers and admins from ML data collection
            const DEVELOPER_ID = '466050111680544798';
            const shouldCollectMLData = !this.isAdminOrDeveloper(userId, guildId);
            
            // Collect ML data asynchronously (don't wait for it to complete to avoid slowing down games)
            if (shouldCollectMLData) {
                this.collectMLDataAsync(userId, guildId, gameType, won, betAmount, payout, metadata).catch(error => {
                    // Silently log ML data collection errors to avoid disrupting game flow
                    console.debug(`ML data collection failed: ${error.message}`);
                });
            }

            // Insert into game_results table for history tracking
            await this.pool.execute(
                `INSERT INTO game_results (user_id, guild_id, game_type, bet_amount, payout, won, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [safeUserId, safeGuildId, safeGameType, safeBetAmount, safePayout, safeWon, JSON.stringify(safeMetadata)]
            );
            
            const statId = `${userId}_${gameType}`;
            
            // Check if user stats entry exists for this game type
            const [existing] = await this.pool.execute(
                'SELECT * FROM user_stats WHERE id = ?',
                [statId]
            );

            const winAmount = won ? payout : 0;
            const lossAmount = won ? 0 : betAmount;

            if (existing.length === 0) {
                // Create new stats entry
                await this.pool.execute(
                    `INSERT INTO user_stats (
                        id, user_id, game_type, wins, losses, total_wagered, total_won,
                        biggest_win, biggest_loss, total_wins, total_losses, 
                        total_games_played, total_winnings, total_losses_amount, last_game_played
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                    [
                        statId, userId, gameType,
                        won ? 1 : 0, won ? 0 : 1, betAmount, payout,
                        won ? payout : 0, won ? 0 : betAmount,
                        won ? 1 : 0, won ? 0 : 1, 1,
                        winAmount, lossAmount
                    ]
                );
            } else {
                // Update existing stats
                const current = existing[0];
                
                await this.pool.execute(
                    `UPDATE user_stats SET 
                        wins = wins + ?,
                        losses = losses + ?,
                        total_wagered = total_wagered + ?,
                        total_won = total_won + ?,
                        biggest_win = GREATEST(biggest_win, ?),
                        biggest_loss = GREATEST(biggest_loss, ?),
                        total_wins = total_wins + ?,
                        total_losses = total_losses + ?,
                        total_games_played = total_games_played + 1,
                        total_winnings = total_winnings + ?,
                        total_losses_amount = total_losses_amount + ?,
                        last_game_played = NOW()
                     WHERE id = ?`,
                    [
                        won ? 1 : 0, won ? 0 : 1,
                        betAmount, payout,
                        won ? payout : 0, won ? 0 : betAmount,
                        won ? 1 : 0, won ? 0 : 1,
                        winAmount, lossAmount,
                        statId
                    ]
                );
            }

            return true;
        } catch (error) {
            logger.error(`Failed to record game result: ${error.message}`);
            return false;
        }
    }

    /**
     * Get game history for a specific user and/or game type
     */
    async getGameHistory(userId, gameType = null, limit = 20) {
        try {
            let query = `
                SELECT gr.*, ub.username 
                FROM game_results gr
                LEFT JOIN user_balances ub ON gr.user_id = ub.user_id
                WHERE gr.user_id = ?`;
            
            const params = [userId];
            
            if (gameType) {
                query += ' AND gr.game_type = ?';
                params.push(gameType);
            }
            
            query += ' ORDER BY gr.played_at DESC LIMIT ?';
            params.push(limit);
            
            const [results] = await this.pool.execute(query, params);
            return results;
        } catch (error) {
            logger.error(`Error getting game history: ${error.message}`);
            return [];
        }
    }

    async storePoll(pollId, pollData) {
        return false;
    }

    async updatePollVotes(pollId, votes) {
        return false;
    }

    async endPoll(pollId) {
        return false;
    }

    /**
     * Get server configuration
     */
    async getServerConfig(serverId) {
        try {
            const rows = await this.executeQuery(
                'SELECT * FROM server_config WHERE server_id = ?',
                [serverId]
            );
            
            if (rows.length > 0) {
                const config = rows[0];
                return {
                    server_id: config.server_id,
                    server_name: config.server_name,
                    settings: config.settings ? JSON.parse(config.settings) : {},
                    channels: config.channels ? JSON.parse(config.channels) : {},
                    roles: config.roles ? JSON.parse(config.roles) : {},
                    economy: config.economy ? JSON.parse(config.economy) : {},
                    games: config.games ? JSON.parse(config.games) : {},
                    security: config.security ? JSON.parse(config.security) : {},
                    setup_complete: config.setup_complete,
                    setup_date: config.setup_date,
                    created_at: config.created_at,
                    updated_at: config.updated_at
                };
            }
            return null;
        } catch (error) {
            logger.error(`Failed to get server config: ${error.message}`);
            return null;
        }
    }

    /**
     * Save server configuration
     */
    async saveServerConfig(serverId, serverName, config) {
        try {
            const existing = await this.executeQuery(
                'SELECT * FROM server_config WHERE server_id = ?',
                [serverId]
            );

            if (existing.length > 0) {
                // Update existing config
                await this.executeQuery(
                    `UPDATE server_config SET 
                        server_name = ?,
                        settings = ?,
                        channels = ?,
                        roles = ?,
                        economy = ?,
                        games = ?,
                        security = ?,
                        setup_complete = ?,
                        setup_date = ?,
                        updated_at = NOW()
                     WHERE server_id = ?`,
                    [
                        serverName,
                        JSON.stringify(config.settings || {}),
                        JSON.stringify(config.channels || {}),
                        JSON.stringify(config.roles || {}),
                        JSON.stringify(config.economy || {}),
                        JSON.stringify(config.games || {}),
                        JSON.stringify(config.security || {}),
                        config.setup_complete || false,
                        config.setup_date || null,
                        serverId
                    ]
                );
            } else {
                // Insert new config
                await this.executeQuery(
                    `INSERT INTO server_config (
                        server_id, server_name, settings, channels, roles, 
                        economy, games, security, setup_complete, setup_date
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        serverId,
                        serverName,
                        JSON.stringify(config.settings || {}),
                        JSON.stringify(config.channels || {}),
                        JSON.stringify(config.roles || {}),
                        JSON.stringify(config.economy || {}),
                        JSON.stringify(config.games || {}),
                        JSON.stringify(config.security || {}),
                        config.setup_complete || false,
                        config.setup_date || null
                    ]
                );
            }
            return true;
        } catch (error) {
            logger.error(`Failed to save server config: ${error.message}`);
            return false;
        }
    }

    /**
     * Close database connections
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
        }
        logger.info('Database adapter connections closed');
    }

    // ========================= VOTE TRACKING OPERATIONS =========================

    /**
     * Get user vote data
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID (kept for compatibility)
     * @returns {Object|null} Vote data
     */
    async getUserVoteData(userId, guildId = null) {
        try {
            const result = await this.executeQuery(
                'SELECT * FROM user_votes WHERE user_id = ?',
                [userId]
            );
            
            return result.length > 0 ? result[0] : null;
        } catch (error) {
            logger.error(`Error getting user vote data: ${error.message}`);
            return null;
        }
    }

    /**
     * Update user vote data
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID (kept for compatibility)
     * @param {Object} voteData - Vote data to update
     * @returns {boolean} Success status
     */
    async updateUserVoteData(userId, guildId = null, voteData) {
        try {
            const existing = await this.executeQuery(
                'SELECT user_id FROM user_votes WHERE user_id = ?',
                [userId]
            );

            if (existing.length > 0) {
                // Update existing record
                await this.executeQuery(
                    `UPDATE user_votes SET 
                        total_votes = ?,
                        last_vote_ts = ?,
                        total_earned = ?,
                        vote_streak = ?,
                        can_use_earnmoney = ?,
                        updated_at = NOW()
                     WHERE user_id = ?`,
                    [
                        voteData.total_votes,
                        voteData.last_vote_ts,
                        voteData.total_earned,
                        voteData.vote_streak,
                        voteData.can_use_earnmoney,
                        userId
                    ]
                );
            } else {
                // Insert new record
                await this.executeQuery(
                    `INSERT INTO user_votes 
                        (user_id, total_votes, last_vote_ts, total_earned, vote_streak, can_use_earnmoney) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        userId,
                        voteData.total_votes,
                        voteData.last_vote_ts,
                        voteData.total_earned,
                        voteData.vote_streak,
                        voteData.can_use_earnmoney
                    ]
                );
            }
            
            return true;
        } catch (error) {
            logger.error(`Error updating user vote data: ${error.message}`);
            return false;
        }
    }

    /**
     * Get top voters leaderboard
     * @param {number} limit - Number of top voters to return
     * @returns {Array} Array of top voters
     */
    async getTopVoters(limit = 10) {
        try {
            const result = await this.executeQuery(
                `SELECT user_id, total_votes, total_earned, vote_streak 
                 FROM user_votes 
                 WHERE total_votes > 0 
                 ORDER BY total_votes DESC, vote_streak DESC 
                 LIMIT ?`,
                [limit]
            );
            
            return result;
        } catch (error) {
            logger.error(`Error getting top voters: ${error.message}`);
            return [];
        }
    }

    /**
     * Initialize vote tracking table
     */
    async initializeVoteSchema() {
        const createVoteTable = `
            CREATE TABLE IF NOT EXISTS user_votes (
                user_id VARCHAR(20) PRIMARY KEY,
                total_votes INT NOT NULL DEFAULT 0,
                last_vote_ts BIGINT NOT NULL DEFAULT 0,
                total_earned DECIMAL(20,2) NOT NULL DEFAULT 0.00,
                vote_streak INT NOT NULL DEFAULT 0,
                can_use_earnmoney BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_total_votes (total_votes),
                INDEX idx_last_vote (last_vote_ts),
                INDEX idx_vote_streak (vote_streak),
                INDEX idx_earnmoney (can_use_earnmoney)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `;

        try {
            await this.executeQuery(createVoteTable);
            
            // Add vote_streak column if it doesn't exist (migration)
            try {
                await this.executeQuerySilent(`
                    ALTER TABLE user_votes 
                    ADD COLUMN vote_streak INT NOT NULL DEFAULT 0 AFTER total_earned
                `, [], ['Duplicate column name']);
                logger.info('Added vote_streak column to existing table');
            } catch (alterError) {
                // Column might already exist, which is fine - suppress duplicate column errors
                if (!alterError.message.includes('Duplicate column name')) {
                    logger.warn(`Vote streak column migration: ${alterError.message}`);
                }
            }
            
            // Add index for vote_streak if it doesn't exist
            try {
                await this.executeQuerySilent(`
                    ALTER TABLE user_votes 
                    ADD INDEX idx_vote_streak (vote_streak)
                `, [], ['Duplicate key name']);
                logger.info('Added vote_streak index');
            } catch (indexError) {
                // Index might already exist - suppress duplicate key errors
                if (!indexError.message.includes('Duplicate key name')) {
                    logger.warn(`Vote streak index creation: ${indexError.message}`);
                }
            }
            
            logger.info('Vote tracking schema initialized');
            return true;
        } catch (error) {
            logger.error(`Error initializing vote schema: ${error.message}`);
            return false;
        }
    }

    // ========================= LOTTERY POOL OPERATIONS =========================

    /**
     * Add amount to lottery pool with tier-specific caps
     */
    async addToLotteryPool(guildId, amount, tier = 1) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();
            
            const currentWeekStart = this.getCurrentWeekStart();
            const maxPrizePool = tier === 1 ? 5000000 : 20000000; // 5M cap for tier 1, 20M for tier 2
            const basePrize = tier === 1 ? 400000 : 3000000; // Base prizes
            
            // First try to add tier column if it doesn't exist
            try {
                await connection.execute('ALTER TABLE lottery_info ADD COLUMN tier INT DEFAULT 1');
            } catch (alterError) {
                // Column already exists, continue
            }
            
            // Get current prize pool for this tier
            let query, params;
            if (tier === 1) {
                query = 'SELECT total_prize FROM lottery_info WHERE guild_id = ? AND (tier = 1 OR tier IS NULL)';
                params = [guildId];
            } else {
                query = 'SELECT total_prize FROM lottery_info WHERE guild_id = ? AND tier = ?';
                params = [guildId, tier];
            }
            
            const [currentInfo] = await connection.execute(query, params);
            
            let currentPrize = basePrize; // Default base pool for tier
            if (currentInfo.length > 0) {
                currentPrize = currentInfo[0].total_prize || basePrize;
            }
            
            // Calculate how much can actually be added (respecting the tier cap)
            const availableSpace = maxPrizePool - currentPrize;
            const actualAmountToAdd = Math.min(amount, Math.max(0, availableSpace));
            
            if (actualAmountToAdd > 0) {
                // Add to lottery pool with tier support - use explicit tier handling
                const [existingRecord] = await connection.execute(
                    'SELECT total_prize FROM lottery_info WHERE guild_id = ? AND tier = ?',
                    [guildId, tier]
                );
                
                if (existingRecord.length > 0) {
                    // Update existing record for this tier
                    await connection.execute(
                        'UPDATE lottery_info SET total_prize = LEAST(total_prize + ?, ?) WHERE guild_id = ? AND tier = ?',
                        [actualAmountToAdd, maxPrizePool, guildId, tier]
                    );
                } else {
                    // Insert new record for this tier
                    await connection.execute(
                        'INSERT INTO lottery_info (guild_id, total_tickets, total_prize, current_week_start, tier) VALUES (?, 0, ?, ?, ?)',
                        [guildId, basePrize + actualAmountToAdd, currentWeekStart, tier]
                    );
                }
                
                await connection.commit();
                
                const capText = tier === 1 ? '5M' : '20M';
                if (actualAmountToAdd < amount) {
                    logger.info(`Added ${actualAmountToAdd} to tier ${tier} lottery pool for guild ${guildId} (capped at ${capText}, ${amount - actualAmountToAdd} overflow prevented)`);
                } else {
                    logger.info(`Added ${actualAmountToAdd} to tier ${tier} lottery pool for guild ${guildId}`);
                }
                
                return { success: true, amountAdded: actualAmountToAdd, overflow: amount - actualAmountToAdd };
            } else {
                await connection.rollback();
                const capText = tier === 1 ? '5M' : '20M';
                logger.info(`Tier ${tier} lottery pool at maximum (${capText}) for guild ${guildId}, no money added`);
                return { success: true, amountAdded: 0, overflow: amount };
            }
            
        } catch (error) {
            await connection.rollback();
            logger.error(`Error adding to tier ${tier} lottery pool: ${error.message}`);
            return { success: false, error: error.message };
        } finally {
            connection.release();
        }
    }

    /**
     * Get current lottery pool amount
     */
    async getLotteryPool(guildId) {
        try {
            // Return a default pool amount since lottery tables aren't implemented yet
            return 100000; // $100K default pool
        } catch (error) {
            logger.error(`Error getting lottery pool: ${error.message}`);
            return 0;
        }
    }

    /**
     * Set lottery pool amount
     */
    async setLotteryPool(guildId, amount) {
        try {
            logger.info(`Set lottery pool to ${amount} for guild ${guildId || 'global'}`);
            return true;
        } catch (error) {
            logger.error(`Error setting lottery pool: ${error.message}`);
            return false;
        }
    }

    /**
     * Conduct lottery drawing with MariaDB integration for specific tier
     */
    async conductLotteryDrawing(guildId, tier = 1) {
        const connection = await this.pool.getConnection();
        
        try {
            await connection.beginTransaction();
            logger.info(`Conducting lottery drawing for guild ${guildId || 'global'} tier ${tier}`);
            
            // Get lottery info for specific tier
            const [lotteryInfo] = await connection.execute(
                'SELECT * FROM lottery_info WHERE guild_id = ? AND tier = ?',
                [guildId, tier]
            );
            
            if (!lotteryInfo.length) {
                await connection.rollback();
                return {
                    success: false,
                    reason: `No lottery info found for this server tier ${tier}`
                };
            }
            
            const lottery = lotteryInfo[0];
            const currentWeekStart = lottery.current_week_start;
            
            // Get all participants for this tier - if week_start mismatch, get most recent week's tickets
            let [participants] = await connection.execute(
                `SELECT user_id, SUM(ticket_count) as ticket_count 
                 FROM lottery_tickets 
                 WHERE guild_id = ? AND week_start = ? AND tier = ?
                 GROUP BY user_id
                 ORDER BY user_id`,
                [guildId, currentWeekStart, tier]
            );
            
            // Track which week we're actually using for tickets
            let actualWeekStart = currentWeekStart;
            
            // If no participants found with current week, try to find most recent tickets for this tier
            if (participants.length === 0) {
                // First get the most recent week with tickets for this tier
                const [recentWeeks] = await connection.execute(
                    `SELECT DISTINCT week_start 
                     FROM lottery_tickets 
                     WHERE guild_id = ? AND tier = ?
                     ORDER BY week_start DESC 
                     LIMIT 1`,
                    [guildId, tier]
                );
                
                if (recentWeeks.length > 0) {
                    const mostRecentWeek = recentWeeks[0].week_start;
                    
                    // Now get participants for that week and tier, grouped by user
                    const [recentParticipants] = await connection.execute(
                        `SELECT user_id, SUM(ticket_count) as ticket_count 
                         FROM lottery_tickets 
                         WHERE guild_id = ? AND week_start = ? AND tier = ?
                         GROUP BY user_id
                         ORDER BY user_id`,
                        [guildId, mostRecentWeek, tier]
                    );
                    
                    participants = recentParticipants;
                    actualWeekStart = mostRecentWeek;
                    logger.info(`Tier ${tier}: Using tickets from week ${mostRecentWeek} (${participants.length} unique participants)`);
                }
            }
            
            if (participants.length === 0) {
                await connection.rollback();
                return {
                    success: false,
                    reason: `No participants in lottery tier ${tier}`,
                    participants: participants.length,
                    total_prize: lottery.total_prize,
                    tier: tier
                };
            }
            
            // Calculate total tickets and create weighted pool
            let totalTickets = 0;
            const ticketPool = [];
            
            for (const participant of participants) {
                totalTickets += participant.ticket_count;
                // Add user to pool based on ticket count (weighted)
                for (let i = 0; i < participant.ticket_count; i++) {
                    ticketPool.push(participant.user_id);
                }
            }
            
            // Prize distribution: 1st: 45%, 2nd: 45%, 3rd: 10%
            const totalPrize = lottery.total_prize;
            const firstPrize = Math.floor(totalPrize * 0.45);
            const secondPrize = Math.floor(totalPrize * 0.45);  
            const thirdPrize = Math.floor(totalPrize * 0.10);
            
            // Draw winners (ensure no duplicates)
            const winners = [];
            const usedUserIds = new Set();
            const { secureRandomInt } = require('./rng');
            
            // Draw 3 unique winners
            while (winners.length < 3 && usedUserIds.size < participants.length) {
                const randomIndex = secureRandomInt(0, ticketPool.length);
                const winnerId = ticketPool[randomIndex];
                
                if (!usedUserIds.has(winnerId)) {
                    usedUserIds.add(winnerId);
                    const winnerData = participants.find(p => p.user_id === winnerId);
                    
                    let prize;
                    let place;
                    if (winners.length === 0) {
                        prize = firstPrize;
                        place = 1;
                    } else if (winners.length === 1) {
                        prize = secondPrize;
                        place = 2;
                    } else {
                        prize = thirdPrize;
                        place = 3;
                    }
                    
                    winners.push({
                        userId: winnerId,
                        place: place,
                        prize: prize,
                        ticketsOwned: winnerData.ticket_count
                    });
                }
            }
            
            // Save winners to database
            for (const winner of winners) {
                await connection.execute(
                    `INSERT INTO lottery_winners (user_id, guild_id, week_start, tickets_owned, total_tickets, prize_amount)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [winner.userId, guildId, actualWeekStart, winner.ticketsOwned, totalTickets, winner.prize]
                );
                
                // Award prize to winner
                await connection.execute(
                    'UPDATE user_balances SET wallet = wallet + ? WHERE user_id = ?',
                    [winner.prize, winner.userId]
                );
            }
            
            // Reset lottery for next week for this specific tier
            const nextWeekStart = new Date();
            nextWeekStart.setDate(nextWeekStart.getDate() + 7);
            nextWeekStart.setUTCHours(0, 0, 0, 0);
            
            // Set appropriate default prize pools for each tier
            const defaultPrizePool = tier === 1 ? 400000.00 : 3000000.00;
            
            await connection.execute(
                `UPDATE lottery_info 
                 SET total_tickets = 0, total_prize = ?, current_week_start = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE guild_id = ? AND tier = ?`,
                [defaultPrizePool, nextWeekStart.toISOString().slice(0, 10), guildId, tier]
            );
            
            // Clear tickets for next week for this tier (use the actual week we drew from)
            await connection.execute(
                'DELETE FROM lottery_tickets WHERE guild_id = ? AND week_start = ? AND tier = ?',
                [guildId, actualWeekStart, tier]
            );
            
            await connection.commit();
            
            return {
                success: true,
                winners: winners,
                total_prize: totalPrize,
                totalParticipants: participants.length,
                total_tickets: totalTickets,
                drawingDate: new Date(),
                tier: tier,
                prizeBreakdown: {
                    first: firstPrize,
                    second: secondPrize,
                    third: thirdPrize
                }
            };
            
        } catch (error) {
            await connection.rollback();
            logger.error(`Error conducting lottery drawing: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        } finally {
            connection.release();
        }
    }

    /**
     * Save lottery history to database
     */
    async saveLotteryHistory(guildId, results) {
        try {
            // The lottery winners are already saved in conductLotteryDrawing
            // This function can be used for additional historical tracking if needed
            logger.info(`Lottery history saved for guild ${guildId}: ${results.winners?.length || 0} winners, total prize: ${results.total_prize}`);
            return true;
        } catch (error) {
            logger.error(`Error saving lottery history: ${error.message}`);
            return false;
        }
    }

    /**
     * Check for and recover orphaned lottery tickets from previous weeks
     * This handles the case where week rollover occurred without a successful drawing
     */
    async checkAndRecoverOrphanedTickets(guildId) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();
            
            const currentWeekStart = this.getCurrentWeekStart();
            logger.info(`Checking for orphaned lottery tickets. Current week: ${currentWeekStart}`);
            
            // Get all tickets from previous week(s) that might be orphaned
            const [orphanedTickets] = await connection.execute(
                'SELECT * FROM lottery_tickets WHERE guild_id = ? AND week_start < ? ORDER BY week_start DESC',
                [guildId, currentWeekStart]
            );
            
            if (orphanedTickets.length > 0) {
                const mostRecentWeek = orphanedTickets[0].week_start;
                const ticketsFromRecentWeek = orphanedTickets.filter(ticket => ticket.week_start === mostRecentWeek);
                
                logger.info(`Found ${ticketsFromRecentWeek.length} orphaned tickets from week ${mostRecentWeek}`);
                
                // Check if there was a successful drawing for that week by looking at lottery_winners
                const [winnerResults] = await connection.execute(
                    'SELECT COUNT(*) as winner_count FROM lottery_winners WHERE guild_id = ? AND week_start = ?',
                    [guildId, mostRecentWeek]
                );
                
                const hadSuccessfulDrawing = winnerResults[0].winner_count > 0;
                
                if (!hadSuccessfulDrawing && ticketsFromRecentWeek.length > 0) {
                    logger.warn(`Week ${mostRecentWeek} had ${ticketsFromRecentWeek.length} tickets but no winners recorded - recovering tickets`);
                    
                    // Calculate total tickets and cost from orphaned tickets
                    let totalOrphanedTickets = 0;
                    let totalOrphanedCost = 0;
                    
                    for (const ticket of ticketsFromRecentWeek) {
                        totalOrphanedTickets += ticket.ticket_count;
                        totalOrphanedCost += ticket.purchase_cost;
                    }
                    
                    // Migrate orphaned tickets to current week
                    for (const ticket of ticketsFromRecentWeek) {
                        await connection.execute(
                            `INSERT INTO lottery_tickets (user_id, guild_id, ticket_count, purchase_cost, week_start, purchased_at)
                             VALUES (?, ?, ?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE 
                             ticket_count = ticket_count + VALUES(ticket_count),
                             purchase_cost = purchase_cost + VALUES(purchase_cost)`,
                            [ticket.user_id, guildId, ticket.ticket_count, ticket.purchase_cost, currentWeekStart, new Date()]
                        );
                    }
                    
                    // Update lottery_info with recovered tickets
                    await connection.execute(
                        `INSERT INTO lottery_info (guild_id, total_tickets, current_week_start)
                         VALUES (?, ?, ?)
                         ON DUPLICATE KEY UPDATE total_tickets = total_tickets + ?`,
                        [guildId, totalOrphanedTickets, currentWeekStart, totalOrphanedTickets]
                    );
                    
                    // Clean up old orphaned tickets
                    await connection.execute(
                        'DELETE FROM lottery_tickets WHERE guild_id = ? AND week_start = ?',
                        [guildId, mostRecentWeek]
                    );
                    
                    await connection.commit();
                    
                    logger.info(`Successfully recovered ${totalOrphanedTickets} tickets worth $${totalOrphanedCost} from week ${mostRecentWeek}`);
                    return {
                        success: true,
                        recovered: totalOrphanedTickets,
                        details: `Recovered ${totalOrphanedTickets} tickets worth $${totalOrphanedCost} from week ${mostRecentWeek}`
                    };
                } else if (hadSuccessfulDrawing) {
                    logger.info(`Week ${mostRecentWeek} had successful drawing - no recovery needed`);
                    await connection.rollback();
                } else {
                    logger.info(`No orphaned tickets found that need recovery`);
                    await connection.rollback();
                }
            } else {
                logger.info('No orphaned tickets found');
                await connection.rollback();
            }
            
            return { success: true, recovered: 0 };
            
        } catch (error) {
            await connection.rollback();
            logger.error(`Error checking for orphaned tickets: ${error.message}`);
            return { success: false, recovered: 0, reason: error.message };
        } finally {
            connection.release();
        }
    }

    /**
     * Award lottery tickets to a user (developer command)
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {number} ticketAmount - Number of tickets to award
     * @param {number} equivalentCost - Equivalent cost for tracking
     * @param {string} reason - Reason for award
     * @param {string} awardedBy - Developer who awarded tickets
     * @returns {boolean} Success status
     */
    async awardLotteryTickets(userId, guildId, ticketAmount, equivalentCost, reason, awardedBy) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();

            const currentWeekStart = this.getCurrentWeekStart();

            // Add tickets to user's lottery record
            await connection.execute(
                `INSERT INTO lottery_tickets (user_id, guild_id, ticket_count, purchase_cost, week_start, purchased_at, awarded_manually, award_reason, awarded_by)
                 VALUES (?, ?, ?, ?, ?, ?, TRUE, ?, ?)
                 ON DUPLICATE KEY UPDATE 
                 ticket_count = ticket_count + VALUES(ticket_count),
                 purchase_cost = purchase_cost + VALUES(purchase_cost)`,
                [userId, guildId, ticketAmount, equivalentCost, currentWeekStart, new Date(), reason, awardedBy]
            );

            // Update lottery_info total tickets
            await connection.execute(
                `INSERT INTO lottery_info (guild_id, total_tickets, current_week_start)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE total_tickets = total_tickets + ?`,
                [guildId, ticketAmount, currentWeekStart, ticketAmount]
            );

            await connection.commit();
            
            logger.info(`Awarded ${ticketAmount} lottery tickets to user ${userId} by ${awardedBy}. Reason: ${reason}`);
            return true;

        } catch (error) {
            await connection.rollback();
            logger.error(`Error awarding lottery tickets: ${error.message}`);
            return false;
        } finally {
            connection.release();
        }
    }

    /**
     * Synchronize lottery_info total_tickets with actual ticket count
     * @param {string} guildId - Guild ID
     * @returns {Object} Sync results
     */
    async syncLotteryTicketCount(guildId) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();
            
            const currentWeekStart = this.getCurrentWeekStart();
            
            // Get actual ticket count
            const [actualRows] = await connection.execute(
                'SELECT SUM(ticket_count) as actual_total FROM lottery_tickets WHERE guild_id = ? AND week_start = ?',
                [guildId, currentWeekStart]
            );
            
            const actualTotal = parseInt(actualRows[0]?.actual_total || 0);
            
            // Get current database value
            const [infoRows] = await connection.execute(
                'SELECT total_tickets FROM lottery_info WHERE guild_id = ?',
                [guildId]
            );
            
            const databaseTotal = parseInt(infoRows[0]?.total_tickets || 0);
            
            if (actualTotal !== databaseTotal) {
                // Update lottery_info to match actual count
                await connection.execute(
                    `INSERT INTO lottery_info (guild_id, total_tickets, current_week_start)
                     VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE total_tickets = VALUES(total_tickets)`,
                    [guildId, actualTotal, currentWeekStart]
                );
                
                await connection.commit();
                
                logger.info(`Synced lottery ticket count for guild ${guildId}: ${databaseTotal} -> ${actualTotal}`);
                return {
                    success: true,
                    updated: true,
                    previousCount: databaseTotal,
                    actualCount: actualTotal,
                    difference: actualTotal - databaseTotal
                };
            } else {
                await connection.rollback();
                return {
                    success: true,
                    updated: false,
                    actualCount: actualTotal,
                    message: 'Ticket count already synchronized'
                };
            }
            
        } catch (error) {
            await connection.rollback();
            logger.error(`Error syncing lottery ticket count: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        } finally {
            connection.release();
        }
    }

    /**
     * Get lottery drawing history
     * @param {string} guildId - Guild ID
     * @param {number} limit - Number of recent drawings to fetch
     * @returns {Array} Array of drawing results
     */
    async getLotteryHistory(guildId, limit = 10) {
        const connection = await this.pool.getConnection();
        try {
            const [rows] = await connection.execute(
                `SELECT 
                    week_start,
                    winners,
                    total_prize,
                    total_participants,
                    drawing_date,
                    winner_count
                FROM lottery_winners 
                WHERE guild_id = ? 
                ORDER BY drawing_date DESC 
                LIMIT ?`,
                [guildId, limit]
            );

            return rows.map(row => ({
                week_start: row.week_start,
                winners: JSON.parse(row.winners || '[]'),
                total_prize: parseFloat(row.total_prize || 0),
                total_participants: parseInt(row.total_participants || 0),
                drawing_date: row.drawing_date,
                winner_count: parseInt(row.winner_count || 0)
            }));

        } catch (error) {
            logger.error(`Error getting lottery history: ${error.message}`);
            return [];
        } finally {
            connection.release();
        }
    }

    // ========================= ECONOMY ANALYSIS OPERATIONS =========================

    /**
     * Get all users for a guild (for admin and analysis purposes)
     * @param {string} guildId - Guild ID (kept for compatibility, data is global)
     * @returns {Array} Array of user balance data
     */
    async getAllUsers(guildId = null) {
        try {
            const [rows] = await this.pool.execute(
                'SELECT user_id, wallet, bank, username, created_at, updated_at FROM user_balances ORDER BY (wallet + bank) DESC'
            );
            return rows;
        } catch (error) {
            logger.error(`Error getting all users: ${error.message}`);
            return [];
        }
    }

    /**
     * Get game statistics for economy analysis
     * @param {string} guildId - Guild ID (kept for compatibility)
     * @returns {Object} Game statistics by game type
     */
    async getGameStatistics(guildId = null) {
        try {
            const [rows] = await this.pool.execute(
                `SELECT 
                    game_type,
                    COUNT(*) as total_games,
                    SUM(wins) as total_wins,
                    SUM(losses) as total_losses,
                    SUM(total_wagered) as total_wagered,
                    SUM(total_won) as total_won,
                    AVG(total_wagered) as avg_bet,
                    MAX(biggest_win) as biggest_win,
                    MIN(biggest_loss) as biggest_loss
                 FROM user_stats 
                 WHERE game_type IS NOT NULL
                 GROUP BY game_type
                 HAVING total_games > 0
                 ORDER BY total_wagered DESC`
            );

            const gameStats = {};
            for (const row of rows) {
                gameStats[row.game_type] = {
                    total_games: row.total_games,
                    total_wins: row.total_wins || 0,
                    total_losses: row.total_losses || 0,
                    total_wagered: parseFloat(row.total_wagered) || 0,
                    total_won: parseFloat(row.total_won) || 0,
                    avg_bet: parseFloat(row.avg_bet) || 0,
                    biggest_win: parseFloat(row.biggest_win) || 0,
                    biggest_loss: parseFloat(row.biggest_loss) || 0
                };
            }

            return gameStats;
        } catch (error) {
            logger.error(`Error getting game statistics: ${error.message}`);
            return {};
        }
    }

    /**
     * Get user's most recent game activity
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID (kept for compatibility)
     * @returns {Object|null} Last activity data
     */
    async getUserLastActivity(userId, guildId = null) {
        try {
            // Convert undefined to null for SQL compatibility
            const safeUserId = userId ?? null;
            const safeGuildId = guildId ?? null;

            const result = await this.executeQuery(
                `SELECT 
                    MAX(played_at) as lastGamePlayed,
                    COUNT(*) as totalGames,
                    game_type as lastGameType
                FROM game_results 
                WHERE user_id = ? 
                GROUP BY user_id
                ORDER BY lastGamePlayed DESC
                LIMIT 1`,
                [safeUserId]
            );

            if (result.length === 0) {
                return null;
            }

            return {
                lastGamePlayed: result[0].lastGamePlayed,
                totalGames: result[0].totalGames,
                lastGameType: result[0].lastGameType
            };
        } catch (error) {
            logger.error(`Error getting user last activity: ${error.message}`);
            return null;
        }
    }

    /**
     * Get user level data
     */
    async getUserLevel(userId, guildId) {
        try {
            // Convert undefined to null for SQL compatibility
            const safeUserId = userId ?? null;
            const safeGuildId = guildId ?? null;

            const result = await this.executeQuery(
                `SELECT * FROM user_levels WHERE user_id = ? AND guild_id = ?`,
                [safeUserId, safeGuildId]
            );

            if (result.length > 0) {
                return result[0];
            }

            // Create initial level record - use INSERT IGNORE to prevent duplicates
            await this.executeQuery(
                `INSERT IGNORE INTO user_levels (user_id, guild_id, level, xp, total_xp) 
                 VALUES (?, ?, 1, 0, 0)`,
                [userId, guildId]
            );

            return {
                user_id: userId,
                guild_id: guildId,
                level: 1,
                xp: 0,
                total_xp: 0,
                games_played: 0,
                games_won: 0,
                messages_sent: 0,
                last_level_up: null,
                last_xp_gain: null,
                created_at: new Date(),
                updated_at: new Date()
            };
        } catch (error) {
            logger.error(`Error getting user level: ${error.message}`);
            throw error;
        }
    }

    /**
     * Add XP to user
     */
    async addXpToUser(userId, guildId, xpAmount, reason = 'unknown') {
        try {
            // Ensure user level record exists
            await this.getUserLevel(userId, guildId);

            // Calculate new level
            const currentData = await this.getUserLevel(userId, guildId);
            const newTotalXp = currentData.total_xp + xpAmount;
            const newLevel = this.calculateLevel(newTotalXp);
            const newCurrentXp = this.calculateCurrentXp(newTotalXp);
            const leveledUp = newLevel > currentData.level;

            // Update XP and level
            await this.executeQuery(
                `UPDATE user_levels 
                 SET xp = ?, total_xp = ?, level = ?, last_xp_gain = NOW(),
                     last_level_up = CASE WHEN ? THEN NOW() ELSE last_level_up END
                 WHERE user_id = ? AND guild_id = ?`,
                [newCurrentXp, newTotalXp, newLevel, leveledUp, userId, guildId]
            );

            logger.info(`Added ${xpAmount} XP to ${userId} for ${reason} (Level: ${currentData.level} -> ${newLevel})`);

            return {
                leveledUp,
                levelUp: leveledUp, // Add alias for compatibility
                oldLevel: currentData.level,
                newLevel,
                xpGained: xpAmount,
                newTotalXp,
                newCurrentXp
            };
        } catch (error) {
            logger.error(`Error adding XP: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update game stats for user
     */
    async updateGameStats(userId, guildId, won = false) {
        try {
            await this.executeQuery(
                `UPDATE user_levels 
                 SET games_played = games_played + 1,
                     games_won = games_won + CASE WHEN ? THEN 1 ELSE 0 END
                 WHERE user_id = ? AND guild_id = ?`,
                [won, userId, guildId]
            );
        } catch (error) {
            logger.error(`Error updating game stats: ${error.message}`);
        }
    }

    /**
     * Calculate level from total XP
     */
    calculateLevel(totalXp) {
        // Improved level formula: Level = floor(sqrt(totalXP / 50)) + 1
        // This gives a more reasonable progression curve:
        // Level 2: 50 XP, Level 3: 200 XP, Level 4: 450 XP, Level 5: 800 XP
        // Much more achievable with 15-30 XP per game
        return Math.floor(Math.sqrt(totalXp / 50)) + 1;
    }

    /**
     * Calculate XP needed for a specific level
     */
    calculateXpForLevel(level) {
        // XP needed = (level - 1)^2 * 50
        return Math.pow(level - 1, 2) * 50;
    }

    /**
     * Calculate current level XP (XP within current level)
     */
    calculateCurrentXp(totalXp) {
        const level = this.calculateLevel(totalXp);
        const xpForCurrentLevel = this.calculateXpForLevel(level);
        return totalXp - xpForCurrentLevel;
    }

    /**
     * Calculate XP needed for next level
     */
    calculateXpForNextLevel(totalXp) {
        const currentLevel = this.calculateLevel(totalXp);
        const xpForNextLevel = this.calculateXpForLevel(currentLevel + 1);
        return xpForNextLevel - totalXp;
    }

    /**
     * Get level leaderboard
     */
    async getLevelLeaderboard(guildId, limit = 10) {
        try {
            const result = await this.executeQuery(
                `SELECT ul.*, ub.username 
                 FROM user_levels ul
                 LEFT JOIN user_balances ub ON ul.user_id = ub.user_id
                 WHERE ul.guild_id = ?
                 ORDER BY ul.total_xp DESC, ul.level DESC
                 LIMIT ?`,
                [guildId, limit]
            );

            return result;
        } catch (error) {
            logger.error(`Error getting level leaderboard: ${error.message}`);
            return [];
        }
    }

    // ========================= SCRATCH TICKET OPERATIONS =========================

    /**
     * Create a new scratch ticket
     */
    async createScratchTicket(ticketId, userId, guildId, channelId, ticketData, symbols, winningCombination = null, wonAmount = 0) {
        try {
            console.log(`[SCRATCH DEBUG] Creating ticket in DB: ${ticketId}, user: ${userId}, guild: ${guildId}`);
            
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
            
            const query = `
                INSERT INTO scratch_tickets (
                    id, user_id, guild_id, channel_id, ticket_data, symbols, 
                    winning_combination, scratched_positions, expires_at, won_amount, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'dropped')
            `;
            
            const params = [
                ticketId, 
                userId, 
                guildId, 
                channelId,
                JSON.stringify(ticketData),
                JSON.stringify(symbols),
                winningCombination ? JSON.stringify(winningCombination) : null,
                JSON.stringify([]), // Initialize with empty array
                expiresAt,
                wonAmount
            ];
            
            console.log(`[SCRATCH DEBUG] SQL params:`, params);
            
            await this.executeQuery(query, params);
            
            console.log(`[SCRATCH DEBUG] Database insert successful for ticket ${ticketId}`);
            logger.info(`Created scratch ticket ${ticketId} for user ${userId}`);
            return true;
        } catch (error) {
            console.error(`[SCRATCH DEBUG] Database insert failed:`, error);
            logger.error(`Error creating scratch ticket: ${error.message}`);
            return false;
        }
    }

    /**
     * Get scratch ticket by ID
     */
    async getScratchTicket(ticketId) {
        try {
            console.log(`[SCRATCH DEBUG] Querying for ticket: ${ticketId}`);
            
            const result = await this.executeQuery(
                'SELECT * FROM scratch_tickets WHERE id = ?',
                [ticketId]
            );
            
            console.log(`[SCRATCH DEBUG] Query result:`, result);
            console.log(`[SCRATCH DEBUG] Result length: ${result ? result.length : 'undefined'}`);

            if (result && result.length > 0) {
                const ticket = result[0];
                console.log(`[SCRATCH DEBUG] Found ticket:`, ticket);
                
                // Parse JSON fields
                ticket.ticket_data = JSON.parse(ticket.ticket_data);
                ticket.symbols = JSON.parse(ticket.symbols);
                if (ticket.winning_combination) {
                    ticket.winning_combination = JSON.parse(ticket.winning_combination);
                }
                if (ticket.scratched_positions) {
                    try {
                        const parsed = JSON.parse(ticket.scratched_positions);
                        // Ensure it's always an array
                        ticket.scratched_positions = Array.isArray(parsed) ? parsed : [];
                    } catch (e) {
                        ticket.scratched_positions = [];
                    }
                } else {
                    ticket.scratched_positions = [];
                }
                return ticket;
            }
            
            console.log(`[SCRATCH DEBUG] No ticket found with ID: ${ticketId}`);
            return null;
        } catch (error) {
            console.error(`[SCRATCH DEBUG] Error in getScratchTicket:`, error);
            logger.error(`Error getting scratch ticket: ${error.message}`);
            return null;
        }
    }

    /**
     * Update scratch ticket progress
     */
    async updateScratchTicket(ticketId, scratchedPositions, status = 'scratching') {
        try {
            const query = `
                UPDATE scratch_tickets 
                SET scratched_positions = ?, status = ?, 
                    scratched_at = CASE WHEN scratched_at IS NULL THEN NOW() ELSE scratched_at END
                WHERE id = ?
            `;
            
            await this.executeQuery(query, [
                JSON.stringify(scratchedPositions),
                status,
                ticketId
            ]);
            
            return true;
        } catch (error) {
            logger.error(`Error updating scratch ticket: ${error.message}`);
            return false;
        }
    }

    /**
     * Complete scratch ticket (win or lose)
     */
    async completeScratchTicket(ticketId, won, winAmount = 0) {
        try {
            const status = won ? 'won' : 'lost';
            const query = `
                UPDATE scratch_tickets 
                SET status = ?, won_amount = ?, completed_at = NOW()
                WHERE id = ?
            `;
            
            await this.executeQuery(query, [status, winAmount, ticketId]);
            
            // Update drop statistics if won
            if (won) {
                const ticket = await this.getScratchTicket(ticketId);
                if (ticket) {
                    await this.executeQuery(
                        'UPDATE scratch_drops SET total_wins = total_wins + 1, total_winnings = total_winnings + ? WHERE guild_id = ?',
                        [winAmount, ticket.guild_id]
                    );
                }
            }
            
            return true;
        } catch (error) {
            logger.error(`Error completing scratch ticket: ${error.message}`);
            return false;
        }
    }

    /**
     * Claim a scratch ticket for a user
     */
    async claimScratchTicket(ticketId, userId) {
        try {
            console.log(`[SCRATCH DEBUG] Claiming ticket ${ticketId} for user ${userId}`);
            
            const query = `
                UPDATE scratch_tickets 
                SET user_id = ?, status = 'active', claimed_by = ?
                WHERE id = ? AND status = 'dropped'
            `;
            
            const result = await this.executeQuery(query, [userId, userId, ticketId]);
            console.log(`[SCRATCH DEBUG] Claim result:`, result);
            console.log(`[SCRATCH DEBUG] Affected rows: ${result.affectedRows}`);
            
            return result.affectedRows > 0;
        } catch (error) {
            console.error(`[SCRATCH DEBUG] Error claiming ticket:`, error);
            logger.error(`Error claiming scratch ticket: ${error.message}`);
            return false;
        }
    }

    /**
     * Update scratched positions for a ticket
     */
    async updateScratchedPositions(ticketId, scratchedPositions) {
        try {
            const query = `
                UPDATE scratch_tickets 
                SET scratched_positions = ?, status = 'scratching'
                WHERE id = ?
            `;
            
            await this.executeQuery(query, [JSON.stringify(scratchedPositions), ticketId]);
            return true;
        } catch (error) {
            logger.error(`Error updating scratched positions: ${error.message}`);
            return false;
        }
    }

    /**
     * Get or create scratch drop settings for guild
     */
    async getScratchDropSettings(guildId) {
        try {
            // For now, return default settings since we don't have scratch_drops table
            // The manual drop system works, automatic drops can be added later
            return {
                guild_id: guildId,
                drop_enabled: false, // Disable automatic drops for now
                max_daily_drops: 2,
                daily_drops: 0,
                drop_count_reset: new Date().toISOString(),
                next_drop_time: null
            };

            // Original code (commented out until we create scratch_drops table):
            /*
            const result = await this.executeQuery(
                'SELECT * FROM scratch_drops WHERE guild_id = ?',
                [guildId]
            );

            if (result && result.length > 0) {
                return result[0];
            }
            */

            // Create default settings
            const query = `
                INSERT INTO scratch_drops (guild_id, last_drop_time, daily_drops, drop_count_reset)
                VALUES (?, NOW(), 0, CURRENT_DATE)
            `;
            
            await this.executeQuery(query, [guildId]);
            
            return await this.getScratchDropSettings(guildId);
        } catch (error) {
            logger.error(`Error getting scratch drop settings: ${error.message}`);
            return null;
        }
    }

    /**
     * Update scratch drop statistics
     */
    async updateScratchDropStats(guildId, nextDropTime = null) {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            const query = `
                UPDATE scratch_drops 
                SET last_drop_time = NOW(),
                    daily_drops = CASE 
                        WHEN drop_count_reset < CURRENT_DATE THEN 1
                        ELSE daily_drops + 1
                    END,
                    drop_count_reset = CURRENT_DATE,
                    total_drops = total_drops + 1,
                    next_drop_time = ?
                WHERE guild_id = ?
            `;
            
            await this.executeQuery(query, [nextDropTime, guildId]);
            return true;
        } catch (error) {
            logger.error(`Error updating scratch drop stats: ${error.message}`);
            return false;
        }
    }

    /**
     * Clean up expired scratch tickets
     */
    async cleanupExpiredScratchTickets() {
        try {
            const query = `
                UPDATE scratch_tickets 
                SET status = 'expired' 
                WHERE status IN ('active', 'scratching') AND expires_at < NOW()
            `;
            
            const result = await this.executeQuery(query, []);
            
            if (result.affectedRows > 0) {
                logger.info(`Expired ${result.affectedRows} scratch tickets`);
            }
            
            return result.affectedRows;
        } catch (error) {
            logger.error(`Error cleaning up expired tickets: ${error.message}`);
            return 0;
        }
    }

    /**
     * Get user's active scratch tickets
     */
    async getUserActiveScratchTickets(userId, guildId) {
        try {
            const result = await this.executeQuery(
                `SELECT * FROM scratch_tickets 
                 WHERE user_id = ? AND guild_id = ? AND status IN ('active', 'scratching')
                 ORDER BY created_at DESC`,
                [userId, guildId]
            );

            return result.map(ticket => {
                ticket.ticket_data = JSON.parse(ticket.ticket_data);
                ticket.symbols = JSON.parse(ticket.symbols);
                if (ticket.winning_combination) {
                    ticket.winning_combination = JSON.parse(ticket.winning_combination);
                }
                if (ticket.scratched_positions) {
                    try {
                        const parsed = JSON.parse(ticket.scratched_positions);
                        // Ensure it's always an array
                        ticket.scratched_positions = Array.isArray(parsed) ? parsed : [];
                    } catch (e) {
                        ticket.scratched_positions = [];
                    }
                } else {
                    ticket.scratched_positions = [];
                }
                return ticket;
            });
        } catch (error) {
            logger.error(`Error getting user active scratch tickets: ${error.message}`);
            return [];
        }
    }

    // ========================= SHOP OPERATIONS =========================

    /**
     * Get all shop items by category
     * @param {string} category - Category filter (optional)
     * @returns {Array} Array of shop items
     */
    async getShopItems(category = null) {
        try {
            let query = 'SELECT * FROM shop_items WHERE active = true';
            const params = [];

            if (category) {
                query += ' AND category = ?';
                params.push(category);
            }

            query += ' ORDER BY sort_order ASC, price ASC';

            const result = await this.executeQuery(query, params);
            return result;
        } catch (error) {
            logger.error(`Error getting shop items: ${error.message}`);
            return [];
        }
    }

    /**
     * Get shop item by ID
     * @param {number} itemId - Item ID
     * @returns {Object|null} Shop item
     */
    async getShopItem(itemId) {
        try {
            const result = await this.executeQuery(
                'SELECT * FROM shop_items WHERE id = ? AND active = true',
                [itemId]
            );
            return result.length > 0 ? result[0] : null;
        } catch (error) {
            logger.error(`Error getting shop item: ${error.message}`);
            return null;
        }
    }

    /**
     * Purchase shop item for user
     * @param {string} userId - User ID
     * @param {number} itemId - Item ID
     * @param {number} price - Price paid
     * @returns {boolean} Success status
     */
    async purchaseShopItem(userId, itemId, price) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();

            // Get item details
            const [itemResult] = await connection.execute(
                'SELECT * FROM shop_items WHERE id = ? AND active = true',
                [itemId]
            );

            if (itemResult.length === 0) {
                await connection.rollback();
                return false;
            }

            const item = itemResult[0];

            // Check if user already has this permanent item
            if (!item.duration_hours) {
                const [existingResult] = await connection.execute(
                    'SELECT id FROM user_shop_purchases WHERE user_id = ? AND item_id = ? AND active = true',
                    [userId, itemId]
                );

                if (existingResult.length > 0) {
                    await connection.rollback();
                    logger.warn(`User ${userId} already owns permanent item ${itemId}`);
                    return false;
                }
            }

            // Deduct money from wallet
            const [updateResult] = await connection.execute(
                'UPDATE user_balances SET wallet = wallet - ? WHERE user_id = ? AND wallet >= ?',
                [price, userId, price]
            );

            if (updateResult.affectedRows === 0) {
                await connection.rollback();
                return false; // Insufficient funds
            }

            // Calculate expiration time for time-limited items
            let expiresAt = null;
            if (item.duration_hours) {
                expiresAt = new Date(Date.now() + (item.duration_hours * 60 * 60 * 1000));
            }

            // Record purchase
            await connection.execute(
                'INSERT INTO user_shop_purchases (user_id, item_id, expires_at) VALUES (?, ?, ?)',
                [userId, itemId, expiresAt]
            );

            // If it's a boost item, add to active boosts
            if (item.category === 'boosts') {
                const metadata = item.metadata ? JSON.parse(item.metadata) : {};
                const multiplier = metadata.multiplier || 1.5;
                const boostType = metadata.boost_type || 'general';

                await connection.execute(
                    `INSERT INTO user_active_boosts (user_id, boost_type, multiplier, expires_at) 
                     VALUES (?, ?, ?, ?) 
                     ON DUPLICATE KEY UPDATE 
                     multiplier = VALUES(multiplier), 
                     expires_at = VALUES(expires_at)`,
                    [userId, boostType, multiplier, expiresAt]
                );
            }

            await connection.commit();
            logger.info(`User ${userId} purchased item ${itemId} for ${price}`);
            return true;
        } catch (error) {
            await connection.rollback();
            logger.error(`Error purchasing shop item: ${error.message}`);
            return false;
        } finally {
            connection.release();
        }
    }

    /**
     * Get user's shop purchases
     * @param {string} userId - User ID
     * @param {boolean} activeOnly - Only return active purchases
     * @returns {Array} Array of purchases with item details
     */
    async getUserShopPurchases(userId, activeOnly = true) {
        try {
            let query = `
                SELECT usp.*, si.name, si.description, si.category, si.duration_hours, si.metadata
                FROM user_shop_purchases usp
                LEFT JOIN shop_items si ON usp.item_id = si.id
                WHERE usp.user_id = ?
            `;

            const params = [userId];

            if (activeOnly) {
                query += ' AND usp.active = true AND (usp.expires_at IS NULL OR usp.expires_at > NOW())';
            }

            query += ' ORDER BY usp.purchased_at DESC';

            const result = await this.executeQuery(query, params);
            return result;
        } catch (error) {
            logger.error(`Error getting user shop purchases: ${error.message}`);
            return [];
        }
    }

    /**
     * Get user's active boosts
     * @param {string} userId - User ID
     * @returns {Array} Array of active boosts
     */
    async getUserActiveBoosts(userId) {
        try {
            const result = await this.executeQuery(
                'SELECT * FROM user_active_boosts WHERE user_id = ? AND expires_at > NOW()',
                [userId]
            );
            return result;
        } catch (error) {
            logger.error(`Error getting user active boosts: ${error.message}`);
            return [];
        }
    }

    /**
     * Check if user has specific boost active
     * @param {string} userId - User ID
     * @param {string} boostType - Type of boost to check
     * @returns {Object|null} Boost details or null
     */
    async getUserBoost(userId, boostType) {
        try {
            const result = await this.executeQuery(
                'SELECT * FROM user_active_boosts WHERE user_id = ? AND boost_type = ? AND expires_at > NOW()',
                [userId, boostType]
            );
            return result.length > 0 ? result[0] : null;
        } catch (error) {
            logger.error(`Error checking user boost: ${error.message}`);
            return null;
        }
    }

    /**
     * Clean up expired boosts and purchases
     * @returns {number} Number of cleaned up items
     */
    async cleanupExpiredShopItems() {
        try {
            let cleanedCount = 0;

            // Cleanup expired boosts
            const boostResult = await this.executeQuery(
                'DELETE FROM user_active_boosts WHERE expires_at <= NOW()'
            );
            cleanedCount += boostResult.affectedRows;

            // Mark expired purchases as inactive
            const purchaseResult = await this.executeQuery(
                'UPDATE user_shop_purchases SET active = false WHERE expires_at IS NOT NULL AND expires_at <= NOW() AND active = true'
            );
            cleanedCount += purchaseResult.affectedRows;

            if (cleanedCount > 0) {
                logger.info(`Cleaned up ${cleanedCount} expired shop items and boosts`);
            }

            return cleanedCount;
        } catch (error) {
            logger.error(`Error cleaning up expired shop items: ${error.message}`);
            return 0;
        }
    }

    /**
     * Initialize shop with default items
     */
    async initializeShopItems() {
        try {
            const defaultItems = [
                // Boosts
                {
                    name: '⚡ XP Boost',
                    description: 'Double XP gain for 24 hours',
                    category: 'boosts',
                    price: 1000000,
                    duration_hours: 24,
                    metadata: JSON.stringify({ boost_type: 'xp', multiplier: 2.0 }),
                    sort_order: 1
                },
                {
                    name: '💰 Economy Boost',
                    description: '1.5x earnings from all economy commands for 12 hours',
                    category: 'boosts', 
                    price: 2000000,
                    duration_hours: 12,
                    metadata: JSON.stringify({ boost_type: 'economy', multiplier: 1.5 }),
                    sort_order: 2
                },
                {
                    name: '🗳️ Vote Boost',
                    description: 'Double vote rewards for the weekend',
                    category: 'boosts',
                    price: 1600000,
                    duration_hours: 48,
                    metadata: JSON.stringify({ boost_type: 'vote', multiplier: 2.0 }),
                    sort_order: 3
                },

                // Unlocks
                {
                    name: '🔓 EarnMoney Unlock',
                    description: 'Bypass the 10 vote requirement for /earnmoney for 1.5 weeks',
                    category: 'unlocks',
                    price: 10000000,
                    duration_hours: 252,
                    metadata: JSON.stringify({ unlock_type: 'earnmoney_bypass' }),
                    sort_order: 1
                },

                // Decorations
                {
                    name: '🥇 Golden Frame',
                    description: 'Golden border for your profile picture',
                    category: 'decorations',
                    price: 3000000,
                    duration_hours: null,
                    metadata: JSON.stringify({ decoration_type: 'frame', color: 'gold' }),
                    sort_order: 1
                },
                {
                    name: '💎 Diamond Frame',
                    description: 'Sparkling diamond border for your profile picture',
                    category: 'decorations',
                    price: 6000000,
                    duration_hours: null,
                    metadata: JSON.stringify({ decoration_type: 'frame', color: 'diamond' }),
                    sort_order: 2
                },

                // Role Colors
                {
                    name: '🔴 Red Name',
                    description: 'Red colored username in chat',
                    category: 'roles',
                    price: 4000000,
                    duration_hours: null,
                    metadata: JSON.stringify({ role_color: '#ff0000', role_name: 'Red VIP' }),
                    sort_order: 1
                },
                {
                    name: '🔵 Blue Name',
                    description: 'Blue colored username in chat',
                    category: 'roles',
                    price: 4000000,
                    duration_hours: null,
                    metadata: JSON.stringify({ role_color: '#0080ff', role_name: 'Blue VIP' }),
                    sort_order: 2
                },
                {
                    name: '🟣 Purple Name',
                    description: 'Purple colored username in chat',
                    category: 'roles',
                    price: 8000000,
                    duration_hours: null,
                    metadata: JSON.stringify({ role_color: '#8000ff', role_name: 'Purple VIP' }),
                    sort_order: 3
                },
                {
                    name: '🟡 Gold Name',
                    description: 'Prestigious gold colored username',
                    category: 'roles',
                    price: 20000000,
                    duration_hours: null,
                    metadata: JSON.stringify({ role_color: '#ffd700', role_name: 'Gold VIP' }),
                    sort_order: 4
                },
                {
                    name: '🟢 Green Name',
                    description: 'Fresh green colored username in chat',
                    category: 'roles',
                    price: 4500000,
                    duration_hours: null,
                    metadata: JSON.stringify({ role_color: '#00ff00', role_name: 'Green VIP' }),
                    sort_order: 5
                },
                {
                    name: '🟠 Orange Name',
                    description: 'Vibrant orange colored username in chat',
                    category: 'roles',
                    price: 5000000,
                    duration_hours: null,
                    metadata: JSON.stringify({ role_color: '#ff8000', role_name: 'Orange VIP' }),
                    sort_order: 6
                },
                {
                    name: '🌸 Pink Name',
                    description: 'Cute pink colored username in chat',
                    category: 'roles',
                    price: 6000000,
                    duration_hours: null,
                    metadata: JSON.stringify({ role_color: '#ff69b4', role_name: 'Pink VIP' }),
                    sort_order: 7
                },
                {
                    name: '🩵 Cyan Name',
                    description: 'Cool cyan colored username in chat',
                    category: 'roles',
                    price: 6500000,
                    duration_hours: null,
                    metadata: JSON.stringify({ role_color: '#00ffff', role_name: 'Cyan VIP' }),
                    sort_order: 8
                },
                {
                    name: '🤍 Silver Name',
                    description: 'Elegant silver colored username in chat',
                    category: 'roles',
                    price: 12000000,
                    duration_hours: null,
                    metadata: JSON.stringify({ role_color: '#c0c0c0', role_name: 'Silver VIP' }),
                    sort_order: 9
                },
                {
                    name: '🖤 Dark Purple Name',
                    description: 'Mysterious dark purple username in chat',
                    category: 'roles',
                    price: 15000000,
                    duration_hours: null,
                    metadata: JSON.stringify({ role_color: '#4b0082', role_name: 'Dark Purple VIP' }),
                    sort_order: 10
                },
                {
                    name: '💎 Diamond Name',
                    description: 'Ultra-premium diamond white username',
                    category: 'roles',
                    price: 50000000,
                    duration_hours: null,
                    metadata: JSON.stringify({ role_color: '#ffffff', role_name: 'Diamond VIP' }),
                    sort_order: 11
                },

                // Utilities
                {
                    name: '⏰ Cooldown Reducer',
                    description: '50% faster cooldowns for work, beg, and crime commands',
                    category: 'utilities',
                    price: 12000000,
                    duration_hours: null,
                    metadata: JSON.stringify({ utility_type: 'cooldown_reduction', reduction: 0.5 }),
                    sort_order: 1
                }
            ];

            // Insert items only if they don't exist (check by name)
            for (const item of defaultItems) {
                const existing = await this.executeQuery(
                    'SELECT id FROM shop_items WHERE name = ?',
                    [item.name]
                );
                
                if (existing.length === 0) {
                    await this.executeQuery(
                        `INSERT INTO shop_items (name, description, category, price, duration_hours, metadata, sort_order)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [item.name, item.description, item.category, item.price, item.duration_hours, item.metadata, item.sort_order]
                    );
                }
            }

            logger.info('Shop items initialized successfully');
            return true;
        } catch (error) {
            logger.error(`Error initializing shop items: ${error.message}`);
            return false;
        }
    }

    /**
     * Get user settings
     * @param {string} userId - User ID
     * @returns {Object|null} User settings object or null
     */
    async getUserSettings(userId) {
        try {
            const result = await this.executeQuery(
                'SELECT * FROM user_settings WHERE user_id = ?',
                [userId]
            );
            return result.length > 0 ? result[0] : null;
        } catch (error) {
            logger.error(`Error getting user settings: ${error.message}`);
            return null;
        }
    }

    /**
     * Set user setting
     * @param {string} userId - User ID
     * @param {string} settingKey - Setting key
     * @param {any} settingValue - Setting value
     * @returns {boolean} Success status
     */
    async setUserSetting(userId, settingKey, settingValue) {
        try {
            // Insert or update user setting
            await this.executeQuery(
                `INSERT INTO user_settings (user_id, ${settingKey}) 
                 VALUES (?, ?) 
                 ON DUPLICATE KEY UPDATE 
                 ${settingKey} = VALUES(${settingKey}), 
                 updated_at = CURRENT_TIMESTAMP`,
                [userId, settingValue]
            );
            
            logger.info(`Updated user setting for ${userId}: ${settingKey} = ${settingValue}`);
            return true;
        } catch (error) {
            logger.error(`Error setting user setting: ${error.message}`);
            return false;
        }
    }

    /**
     * Update user settings (multiple at once)
     * @param {string} userId - User ID  
     * @param {Object} settings - Settings object
     * @returns {boolean} Success status
     */
    async updateUserSettings(userId, settings) {
        try {
            const settingKeys = Object.keys(settings);
            const settingValues = Object.values(settings);
            
            if (settingKeys.length === 0) {
                return true; // No settings to update
            }
            
            // Build the query dynamically
            const insertFields = ['user_id', ...settingKeys];
            const insertValues = [userId, ...settingValues];
            const updateFields = settingKeys.map(key => `${key} = VALUES(${key})`);
            
            const query = `
                INSERT INTO user_settings (${insertFields.join(', ')}) 
                VALUES (${insertFields.map(() => '?').join(', ')}) 
                ON DUPLICATE KEY UPDATE 
                ${updateFields.join(', ')}, 
                updated_at = CURRENT_TIMESTAMP
            `;
            
            await this.executeQuery(query, insertValues);
            
            logger.info(`Updated user settings for ${userId}: ${JSON.stringify(settings)}`);
            return true;
        } catch (error) {
            logger.error(`Error updating user settings: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Check if user is in off-economy status
     */
    async isOffEconomy(userId) {
        try {
            const DEVELOPER_ID = '466050111680544798'; // Developer ID hardcoded
            return userId === DEVELOPER_ID;
        } catch (error) {
            logger.error(`Error checking off economy status: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Toggle user's off-economy status
     * @param {string} userId - User ID
     * @param {boolean} offEconomyStatus - New off-economy status (true = off economy, false = on economy)
     * @returns {boolean} Success status
     */
    async toggleOffEconomy(userId, offEconomyStatus) {
        try {
            await this.executeQuery(
                'UPDATE user_balances SET off_economy = ? WHERE user_id = ?',
                [offEconomyStatus, userId]
            );
            
            logger.info(`Toggled off-economy status for ${userId} to ${offEconomyStatus}`);
            return true;
        } catch (error) {
            logger.error(`Error toggling off-economy status: ${error.message}`);
            return false;
        }
    }

    /**
     * Collect ML data asynchronously
     */
    async collectMLDataAsync(userId, guildId, gameType, won, betAmount, payout, metadata = {}) {
        try {
            // Get additional context for ML analysis
            const userBalance = await this.getUserBalance(userId, guildId);
            const userWealthBefore = parseFloat(userBalance.wallet || 0) + parseFloat(userBalance.bank || 0) + parseFloat(betAmount || 0); // Add back bet amount for before-game wealth
            const userWealthAfter = parseFloat(userBalance.wallet || 0) + parseFloat(userBalance.bank || 0);
            
            // Get user's recent game activity for behavioral patterns
            const recentGames = await this.getGameHistory(userId, gameType, 10);
            let winStreak = 0, lossStreak = 0;
            for (const game of recentGames) {
                if (game.won) {
                    if (lossStreak > 0) break;
                    winStreak++;
                } else {
                    if (winStreak > 0) break;
                    lossStreak++;
                }
            }
            
            // Calculate today's activity
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayGames = recentGames.filter(g => new Date(g.created_at) >= todayStart);
            const gamesPlayedToday = todayGames.length;
            const totalWinsToday = todayGames.filter(g => g.won).length;
            const totalLossesToday = gamesPlayedToday - totalWinsToday;
            
            // Categorize bet pattern
            let betPattern = 'NORMAL';
            if (betAmount < userWealthBefore * 0.01) betPattern = 'CONSERVATIVE';
            else if (betAmount > userWealthBefore * 0.1) betPattern = 'AGGRESSIVE';
            
            // Determine risk level based on betting patterns
            let riskLevel = 'MEDIUM';
            if (betAmount > userWealthBefore * 0.2) riskLevel = 'HIGH';
            else if (betAmount < userWealthBefore * 0.02) riskLevel = 'LOW';
            
            // Prepare comprehensive ML data
            const mlData = {
                gameType,
                userId,
                guildId,
                betAmount,
                payout,
                won,
                userWealthBefore,
                userWealthAfter,
                gameSpecificData: metadata,
                winStreak,
                lossStreak,
                gamesPlayedToday,
                totalWinsToday,
                totalLossesToday,
                betPattern,
                riskLevel,
                serverEconomicHealth: 100, // Default value, could be enhanced with real server metrics
                activePlayersCount: 1, // Could be enhanced with real active player count
                totalServerWealth: userWealthAfter, // Simplified - could be enhanced with actual server wealth
                sessionDuration: 0, // Could be enhanced with actual session tracking
                suspiciousActivity: false, // Could be enhanced with fraud detection
                houseEdgeApplied: metadata.houseEdgeApplied || 0,
                multiplierReduction: metadata.multiplierReduction || 0,
                wealthTierMultiplier: metadata.wealthTierMultiplier || 1
            };
            
            // Send to ML data collector
            await gameDataCollector.collectGameData(mlData);
            
        } catch (error) {
            // Silently fail to avoid disrupting game flow
            logger.debug(`ML data collection failed for ${gameType} game by ${userId}: ${error.message}`);
        }
    }

    /**
     * Apply balance integrity constraints to prevent negative balances and fraud
     */
    async applyBalanceIntegrityConstraints() {
        // Prevent multiple applications of the same migration
        if (this.balanceIntegrityApplied) {
            logger.debug('Balance integrity constraints already applied, skipping');
            return;
        }

        try {
            const BalanceIntegrityMigration = require('./balanceIntegrityMigration');
            const migration = new BalanceIntegrityMigration(this);
            
            const result = await migration.applyBalanceIntegrityConstraints();
            
            if (result.success) {
                logger.info('✅ Balance integrity constraints applied successfully');
                
                // Mark as applied to prevent duplicate runs
                this.balanceIntegrityApplied = true;
                
                // Test the constraints
                await migration.testConstraints();
            } else {
                logger.warn(`⚠️ Balance integrity constraints failed: ${result.error}`);
            }
            
            return result;
            
        } catch (error) {
            logger.error(`Failed to apply balance integrity constraints: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // =================
    // MARRIAGE SYSTEM
    // =================

    /**
     * Create a marriage proposal
     */
    async createMarriageProposal(proposerId, proposerName, recipientId, recipientName, guildId, proposalMessage) {
        try {
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
            
            const query = `
                INSERT INTO marriage_proposals (proposer_id, proposer_name, recipient_id, recipient_name, guild_id, proposal_message, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            const [result] = await this.pool.execute(query, [
                proposerId, proposerName, recipientId, recipientName, guildId, proposalMessage, expiresAt
            ]);
            
            logger.info(`Marriage proposal created: ${proposerName} -> ${recipientName}`);
            return { success: true, proposalId: result.insertId };
            
        } catch (error) {
            logger.error(`Error creating marriage proposal: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get pending marriage proposals for a user
     */
    async getPendingMarriageProposals(userId, guildId = null) {
        try {
            // Make proposals global - don't filter by guild_id
            const query = `
                SELECT * FROM marriage_proposals 
                WHERE recipient_id = ? AND status = 'pending' AND expires_at > NOW()
                ORDER BY created_at DESC
            `;
            
            const [rows] = await this.pool.execute(query, [userId]);
            return { success: true, proposals: rows };
            
        } catch (error) {
            logger.error(`Error getting pending proposals: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get sent marriage proposals for a user
     */
    async getSentMarriageProposals(userId, guildId = null, status = 'accepted') {
        try {
            // Make proposals global - don't filter by guild_id
            const query = `
                SELECT * FROM marriage_proposals 
                WHERE proposer_id = ? AND status = ?
                ORDER BY created_at DESC
            `;
            
            const [rows] = await this.pool.execute(query, [userId, status]);
            return { success: true, proposals: rows };
            
        } catch (error) {
            logger.error(`Error getting sent proposals: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Respond to a marriage proposal
     */
    async respondToMarriageProposal(proposalId, response) {
        try {
            const query = `
                UPDATE marriage_proposals 
                SET status = ?, responded_at = NOW() 
                WHERE id = ? AND status = 'pending'
            `;
            
            const [result] = await this.pool.execute(query, [response, proposalId]);
            
            if (result.affectedRows === 0) {
                return { success: false, error: 'Proposal not found or already responded to' };
            }
            
            logger.info(`Marriage proposal ${proposalId} ${response}`);
            return { success: true };
            
        } catch (error) {
            logger.error(`Error responding to proposal: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Create a marriage
     */
    async createMarriage(partner1Id, partner1Name, partner1Role, partner2Id, partner2Name, partner2Role, guildId, ceremonyData) {
        try {
            const query = `
                INSERT INTO marriages (partner1_id, partner1_name, partner1_role, partner2_id, partner2_name, partner2_role, guild_id, ceremony_data)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const [result] = await this.pool.execute(query, [
                partner1Id, partner1Name, partner1Role, partner2Id, partner2Name, partner2Role, guildId, JSON.stringify(ceremonyData)
            ]);
            
            logger.info(`Marriage created: ${partner1Name} (${partner1Role}) & ${partner2Name} (${partner2Role})`);
            return { success: true, marriageId: result.insertId };
            
        } catch (error) {
            logger.error(`Error creating marriage: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get marriage status for a user
     */
    async getUserMarriage(userId, guildId = null) {
        try {
            // Make marriage data global - don't filter by guild_id
            const query = `
                SELECT * FROM marriages 
                WHERE (partner1_id = ? OR partner2_id = ?) AND status = 'active'
            `;
            
            const [rows] = await this.pool.execute(query, [userId, userId]);
            
            if (rows.length === 0) {
                return { success: true, married: false, marriage: null };
            }
            
            const marriage = rows[0];
            const isPartner1 = marriage.partner1_id === userId;
            
            return {
                success: true,
                married: true,
                marriage: {
                    ...marriage,
                    userRole: isPartner1 ? marriage.partner1_role : marriage.partner2_role,
                    partnerId: isPartner1 ? marriage.partner2_id : marriage.partner1_id,
                    partnerName: isPartner1 ? marriage.partner2_name : marriage.partner1_name,
                    partnerRole: isPartner1 ? marriage.partner2_role : marriage.partner1_role
                }
            };
            
        } catch (error) {
            logger.error(`Error getting user marriage: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update marriage shared bank
     */
    async updateMarriageSharedBank(marriageId, amount) {
        try {
            const query = `
                UPDATE marriages 
                SET shared_bank = shared_bank + ? 
                WHERE id = ? AND status = 'active'
            `;
            
            const [result] = await this.pool.execute(query, [amount, marriageId]);
            
            if (result.affectedRows === 0) {
                return { success: false, error: 'Marriage not found or not active' };
            }
            
            return { success: true };
            
        } catch (error) {
            logger.error(`Error updating marriage shared bank: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Divorce a marriage
     */
    async divorceMarriage(marriageId, reason) {
        try {
            const query = `
                UPDATE marriages 
                SET status = 'divorced', divorced_at = NOW(), divorce_reason = ?
                WHERE id = ? AND status = 'active'
            `;
            
            const [result] = await this.pool.execute(query, [reason, marriageId]);
            
            if (result.affectedRows === 0) {
                return { success: false, error: 'Marriage not found or already divorced' };
            }
            
            logger.info(`Marriage ${marriageId} divorced: ${reason}`);
            return { success: true };
            
        } catch (error) {
            logger.error(`Error divorcing marriage: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if two users are married
     */
    async areUsersMarried(userId1, userId2, guildId = null) {
        try {
            // Make marriage check global - don't filter by guild_id
            const query = `
                SELECT id FROM marriages 
                WHERE ((partner1_id = ? AND partner2_id = ?) OR (partner1_id = ? AND partner2_id = ?)) 
                AND status = 'active'
            `;
            
            const [rows] = await this.pool.execute(query, [userId1, userId2, userId2, userId1]);
            return { success: true, married: rows.length > 0, marriageId: rows[0]?.id || null };
            
        } catch (error) {
            logger.error(`Error checking if users are married: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Transfer money to shared bank account
     */
    async transferToSharedBank(userId, guildId, amount) {
        try {
            // Get user's marriage
            const marriageData = await this.getUserMarriage(userId, guildId);
            if (!marriageData.married) {
                return { success: false, error: 'User is not married' };
            }

            // Get user's balance
            const userBalance = await this.getUserBalance(userId, guildId);
            if (userBalance.wallet < amount) {
                return { success: false, error: 'Insufficient funds' };
            }

            // Start transaction
            const connection = await this.pool.getConnection();
            try {
                await connection.beginTransaction();

                // Deduct from user's wallet
                await connection.execute(
                    'UPDATE user_balances SET wallet = wallet - ? WHERE user_id = ?',
                    [amount, userId]
                );

                // Add to shared bank
                await connection.execute(
                    'UPDATE marriages SET shared_bank = shared_bank + ? WHERE id = ? AND status = ?',
                    [amount, marriageData.marriage.id, 'active']
                );

                await connection.commit();
                
                // Invalidate user's balance cache after successful transaction
                try {
                    const nodeCache = require('./nodeCache');
                    const cacheKey = `casino:balance:${userId}:${guildId}`;
                    await nodeCache.del(cacheKey);
                    logger.debug(`🗑️ Invalidated cache for ${userId} after marriage transfer`);
                } catch (cacheError) {
                    logger.debug(`Cache invalidation failed: ${cacheError.message}`);
                }
                
                logger.info(`${amount} transferred to shared bank by user ${userId}`);
                return { success: true, newSharedBalance: marriageData.marriage.shared_bank + amount };

            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }

        } catch (error) {
            logger.error(`Error transferring to shared bank: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Withdraw money from shared bank account
     */
    async withdrawFromSharedBank(userId, guildId, amount) {
        try {
            // Get user's marriage
            const marriageData = await this.getUserMarriage(userId, guildId);
            if (!marriageData.married) {
                return { success: false, error: 'User is not married' };
            }

            if (marriageData.marriage.shared_bank < amount) {
                return { success: false, error: 'Insufficient funds in shared bank' };
            }

            // Start transaction
            const connection = await this.pool.getConnection();
            try {
                await connection.beginTransaction();

                // Deduct from shared bank
                await connection.execute(
                    'UPDATE marriages SET shared_bank = shared_bank - ? WHERE id = ? AND status = ?',
                    [amount, marriageData.marriage.id, 'active']
                );

                // Add to user's wallet
                await connection.execute(
                    'UPDATE user_balances SET wallet = wallet + ? WHERE user_id = ?',
                    [amount, userId]
                );

                await connection.commit();
                
                // Invalidate user's balance cache after successful transaction
                try {
                    const nodeCache = require('./nodeCache');
                    const cacheKey = `casino:balance:${userId}:${guildId}`;
                    await nodeCache.del(cacheKey);
                    logger.debug(`🗑️ Invalidated cache for ${userId} after marriage withdrawal`);
                } catch (cacheError) {
                    logger.debug(`Cache invalidation failed: ${cacheError.message}`);
                }
                
                logger.info(`${amount} withdrawn from shared bank by user ${userId}`);
                return { success: true, newSharedBalance: marriageData.marriage.shared_bank - amount };

            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }

        } catch (error) {
            logger.error(`Error withdrawing from shared bank: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // ================================
    // MARRIAGE TASK COMPLETION TRACKING
    // ================================

    /**
     * Mark a marriage task as completed
     */
    async completeMarriageTask(marriageId, taskNumber, completedBy, completionData = null) {
        try {
            // Get current week start using consistent calculation
            const weekStart = this.getWeekStart();

            const query = `
                INSERT INTO marriage_task_completions (marriage_id, task_number, completed_by, week_start, completion_data, completed_at)
                VALUES (?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE 
                    completed_by = VALUES(completed_by),
                    completion_data = VALUES(completion_data),
                    completed_at = NOW()
            `;
            
            // Debug logging
            logger.info(`Completing task ${taskNumber} for marriage ${marriageId}`);
            logger.info(`Week start calculated as: ${weekStart.toISOString()} (${weekStart.toDateString()})`);
            logger.info(`Task data: taskNumber=${taskNumber}, completedBy=${completedBy}`);
            
            await this.pool.execute(query, [
                marriageId, 
                taskNumber, 
                completedBy, 
                weekStart, 
                completionData ? JSON.stringify(completionData) : null
            ]);
            
            logger.info(`Marriage task ${taskNumber} completed for marriage ${marriageId} by ${completedBy}`);
            return { success: true };
            
        } catch (error) {
            logger.error(`Error completing marriage task: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get marriage task completion status for current week
     */
    async getMarriageTaskStatus(marriageId, weekStart = null) {
        try {
            if (!weekStart) {
                // Use consistent week start calculation
                weekStart = this.getWeekStart();
            }

            // First, let's see what's actually in the database
            const debugQuery = `
                SELECT task_number, completed_by, completed_at, week_start
                FROM marriage_task_completions 
                WHERE marriage_id = ?
            `;
            const [allRows] = await this.pool.execute(debugQuery, [marriageId]);
            logger.info(`DEBUG: All task completions for marriage ${marriageId}:`);
            allRows.forEach(row => {
                const weekStartDate = new Date(row.week_start);
                logger.info(`  Task ${row.task_number}: completed_at=${row.completed_at}, week_start=${weekStartDate.toISOString()} (${weekStartDate.toDateString()})`);
            });

            const query = `
                SELECT task_number, completed_by, completed_at, completion_data
                FROM marriage_task_completions 
                WHERE marriage_id = ? AND week_start = ?
            `;
            
            // Debug logging
            logger.info(`Retrieving task status for marriage ${marriageId}`);
            logger.info(`Week start calculated as: ${weekStart.toISOString()} (${weekStart.toDateString()})`);
            
            const [rows] = await this.pool.execute(query, [marriageId, weekStart]);
            
            logger.info(`Found ${rows.length} completed tasks:`, rows.map(r => `task${r.task_number}`));
            
            const tasks = {};
            rows.forEach(row => {
                tasks[`task${row.task_number}`] = {
                    completed: true,
                    completedBy: row.completed_by,
                    completedAt: row.completed_at,
                    completionData: row.completion_data ? JSON.parse(row.completion_data) : null
                };
            });
            
            return { tasks, weekStart };
            
        } catch (error) {
            logger.error(`Error getting marriage task status: ${error.message}`);
            logger.error(`Full error details:`, error);
            
            // Check if it's a table doesn't exist error
            if (error.code === 'ER_NO_SUCH_TABLE') {
                logger.warn('marriage_task_completions table does not exist yet. Creating tables...');
                // Try to initialize tables
                try {
                    await this.initializeTables();
                } catch (initError) {
                    logger.error(`Failed to initialize tables: ${initError.message}`);
                }
            }
            
            return { tasks: {}, weekStart: null };
        }
    }

    /**
     * Reset marriage tasks for new week (cleanup old completions)
     */
    async resetMarriageTasksForWeek(marriageId) {
        try {
            // Delete task completions older than 4 weeks
            const fourWeeksAgo = new Date();
            fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
            
            const query = `
                DELETE FROM marriage_task_completions 
                WHERE marriage_id = ? AND week_start < ?
            `;
            
            const [result] = await this.pool.execute(query, [marriageId, fourWeeksAgo]);
            
            logger.info(`Cleaned up ${result.affectedRows} old task completions for marriage ${marriageId}`);
            return { success: true, deletedRows: result.affectedRows };
            
        } catch (error) {
            logger.error(`Error resetting marriage tasks: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get marriage task history
     */
    async getMarriageTaskHistory(marriageId, limit = 10) {
        try {
            const query = `
                SELECT task_number, completed_by, completed_at, week_start, completion_data
                FROM marriage_task_completions 
                WHERE marriage_id = ?
                ORDER BY completed_at DESC
                LIMIT ?
            `;
            
            const [rows] = await this.pool.execute(query, [marriageId, limit]);
            
            return rows.map(row => ({
                taskNumber: row.task_number,
                completedBy: row.completed_by,
                completedAt: row.completed_at,
                weekStart: row.week_start,
                completionData: row.completion_data ? JSON.parse(row.completion_data) : null
            }));
            
        } catch (error) {
            logger.error(`Error getting marriage task history: ${error.message}`);
            return [];
        }
    }

    /**
     * Debug method to check what's in the task completions table
     */
    async debugTaskCompletions(marriageId) {
        try {
            const query = `
                SELECT marriage_id, task_number, completed_by, week_start, completed_at
                FROM marriage_task_completions 
                WHERE marriage_id = ?
                ORDER BY completed_at DESC
            `;
            
            const [rows] = await this.pool.execute(query, [marriageId]);
            logger.info(`All task completions for marriage ${marriageId}:`, rows);
            return rows;
            
        } catch (error) {
            logger.error(`Error debugging task completions: ${error.message}`);
            return [];
        }
    }

    /**
     * Temporary method to fix existing task completion dates
     */
    async fixTaskCompletionDates(marriageId) {
        try {
            // Get all existing completions
            const query = `
                SELECT id, completed_at, week_start
                FROM marriage_task_completions 
                WHERE marriage_id = ?
            `;
            
            const [rows] = await this.pool.execute(query, [marriageId]);
            let fixedCount = 0;
            
            for (const row of rows) {
                // Calculate correct week start for this completion
                const completedAt = new Date(row.completed_at);
                const correctWeekStart = this.getWeekStart(completedAt);
                
                // Check if week_start needs correction
                const existingWeekStart = new Date(row.week_start);
                const needsUpdate = existingWeekStart.getTime() !== correctWeekStart.getTime();
                
                if (needsUpdate) {
                    // Update week_start only
                    await this.pool.execute(
                        'UPDATE marriage_task_completions SET week_start = ? WHERE id = ?',
                        [correctWeekStart, row.id]
                    );
                    fixedCount++;
                    logger.info(`Fixed completion ${row.id}: ${existingWeekStart.toISOString()} -> ${correctWeekStart.toISOString()}`);
                }
            }
            
            logger.info(`Fixed ${fixedCount} task completion dates for marriage ${marriageId}`);
            return { success: true, updated: fixedCount };
            
        } catch (error) {
            logger.error(`Error fixing task completion dates: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // ================================
    // Marriage XP System
    // ================================

    /**
     * Award XP to a marriage for completing challenges
     */
    async awardMarriageXP(marriageId, xpAmount, source, details = null) {
        try {
            // First check if marriage exists
            const [marriageRows] = await this.pool.execute(
                'SELECT id FROM marriages WHERE id = ? AND status = ?',
                [marriageId, 'active']
            );

            if (marriageRows.length === 0) {
                throw new Error('Marriage not found or inactive');
            }

            // Get current XP or initialize if not exists
            let [xpRows] = await this.pool.execute(
                'SELECT total_xp, level FROM marriage_xp WHERE marriage_id = ?',
                [marriageId]
            );

            const currentXP = xpRows.length > 0 ? xpRows[0].total_xp : 0;
            const newTotalXP = currentXP + xpAmount;

            // Calculate new level
            const { getMarriageLevelByXP } = require('./marriageLevels');
            const newLevel = getMarriageLevelByXP(newTotalXP);
            const oldLevel = getMarriageLevelByXP(currentXP);

            if (xpRows.length === 0) {
                // Insert new XP record
                await this.pool.execute(
                    'INSERT INTO marriage_xp (marriage_id, total_xp, level, last_updated) VALUES (?, ?, ?, NOW())',
                    [marriageId, newTotalXP, newLevel.level]
                );
            } else {
                // Update existing XP record
                await this.pool.execute(
                    'UPDATE marriage_xp SET total_xp = ?, level = ?, last_updated = NOW() WHERE marriage_id = ?',
                    [newTotalXP, newLevel.level, marriageId]
                );
            }

            // Log XP transaction
            await this.pool.execute(
                'INSERT INTO marriage_xp_history (marriage_id, xp_awarded, source, details, awarded_at) VALUES (?, ?, ?, ?, NOW())',
                [marriageId, xpAmount, source, details]
            );

            logger.info(`Awarded ${xpAmount} XP to marriage ${marriageId} from ${source}. Total: ${newTotalXP}`);

            return {
                success: true,
                xpAwarded: xpAmount,
                newTotalXP,
                oldLevel: oldLevel.level,
                newLevel: newLevel.level,
                leveledUp: newLevel.level > oldLevel.level,
                levelData: newLevel
            };

        } catch (error) {
            logger.error(`Error awarding marriage XP: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get marriage XP and level data
     */
    async getMarriageXP(marriageId) {
        try {
            const [rows] = await this.pool.execute(
                'SELECT total_xp, level, last_updated FROM marriage_xp WHERE marriage_id = ?',
                [marriageId]
            );

            if (rows.length === 0) {
                // Return default values for new marriage
                return {
                    marriageId,
                    totalXP: 0,
                    level: 1,
                    lastUpdated: null,
                    exists: false
                };
            }

            return {
                marriageId,
                totalXP: rows[0].total_xp,
                level: rows[0].level,
                lastUpdated: rows[0].last_updated,
                exists: true
            };

        } catch (error) {
            logger.error(`Error getting marriage XP: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get marriage XP history
     */
    async getMarriageXPHistory(marriageId, limit = 10) {
        try {
            const [rows] = await this.pool.execute(
                'SELECT xp_awarded, source, details, awarded_at FROM marriage_xp_history WHERE marriage_id = ? ORDER BY awarded_at DESC LIMIT ?',
                [marriageId, limit]
            );

            return rows;

        } catch (error) {
            logger.error(`Error getting marriage XP history: ${error.message}`);
            throw error;
        }
    }

    // ======================= POEM VOTING SYSTEM =======================

    /**
     * Save poem voting data to database
     */
    async savePoemVote(poemId, messageId, channelId, guildId, poemData, expiresAt = null) {
        try {
            const query = `
                INSERT INTO poem_votes (poem_id, message_id, channel_id, guild_id, poem_data, expires_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                message_id = VALUES(message_id),
                channel_id = VALUES(channel_id),
                poem_data = VALUES(poem_data),
                expires_at = VALUES(expires_at)
            `;
            
            const [result] = await this.pool.execute(query, [
                poemId, messageId, channelId, guildId, 
                JSON.stringify(poemData), expiresAt
            ]);
            
            logger.info(`Saved poem voting data for poem ${poemId}`);
            return { success: true, result };
            
        } catch (error) {
            logger.error(`Error saving poem vote: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get poem voting data by poem ID
     */
    async getPoemVote(poemId) {
        try {
            const query = `
                SELECT poem_id, message_id, channel_id, guild_id, upvotes, downvotes, 
                       voters, poem_data, created_at, expires_at
                FROM poem_votes 
                WHERE poem_id = ?
            `;
            
            const [rows] = await this.pool.execute(query, [poemId]);
            
            if (rows.length === 0) {
                return null;
            }
            
            const row = rows[0];
            return {
                poemId: row.poem_id,
                messageId: row.message_id,
                channelId: row.channel_id,
                guildId: row.guild_id,
                upvotes: row.upvotes,
                downvotes: row.downvotes,
                voters: row.voters ? JSON.parse(row.voters) : [],
                poemData: row.poem_data ? JSON.parse(row.poem_data) : {},
                createdAt: row.created_at,
                expiresAt: row.expires_at
            };
            
        } catch (error) {
            logger.error(`Error getting poem vote: ${error.message}`);
            return null;
        }
    }

    /**
     * Update poem vote count and voter list
     */
    async updatePoemVote(poemId, voteType, userId) {
        try {
            // First get current data
            const currentData = await this.getPoemVote(poemId);
            if (!currentData) {
                throw new Error(`Poem ${poemId} not found`);
            }

            // Check if user already voted
            if (currentData.voters.includes(userId)) {
                return { success: false, reason: 'already_voted' };
            }

            // Update vote counts and voter list
            const newVoters = [...currentData.voters, userId];
            const newUpvotes = voteType === 'up' ? currentData.upvotes + 1 : currentData.upvotes;
            const newDownvotes = voteType === 'down' ? currentData.downvotes + 1 : currentData.downvotes;

            const query = `
                UPDATE poem_votes 
                SET upvotes = ?, downvotes = ?, voters = ?
                WHERE poem_id = ?
            `;
            
            const [result] = await this.pool.execute(query, [
                newUpvotes, newDownvotes, JSON.stringify(newVoters), poemId
            ]);
            
            logger.info(`Updated vote for poem ${poemId}: ${voteType} vote by ${userId}`);
            
            return { 
                success: true, 
                upvotes: newUpvotes, 
                downvotes: newDownvotes,
                voters: newVoters
            };
            
        } catch (error) {
            logger.error(`Error updating poem vote: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get all active poem votes for a guild
     */
    async getActivePoemVotes(guildId) {
        try {
            const query = `
                SELECT poem_id, message_id, channel_id, upvotes, downvotes, 
                       voters, poem_data, created_at, expires_at
                FROM poem_votes 
                WHERE guild_id = ? AND (expires_at IS NULL OR expires_at > NOW())
                ORDER BY created_at DESC
            `;
            
            const [rows] = await this.pool.execute(query, [guildId]);
            
            return rows.map(row => ({
                poemId: row.poem_id,
                messageId: row.message_id,
                channelId: row.channel_id,
                upvotes: row.upvotes,
                downvotes: row.downvotes,
                voters: row.voters ? JSON.parse(row.voters) : [],
                poemData: row.poem_data ? JSON.parse(row.poem_data) : {},
                createdAt: row.created_at,
                expiresAt: row.expires_at
            }));
            
        } catch (error) {
            logger.error(`Error getting active poem votes: ${error.message}`);
            return [];
        }
    }

    /**
     * Initialize marriage XP tables
     */
    async initializeMarriageXPTables() {
        try {
            // Create marriage_xp table
            await this.pool.execute(`
                CREATE TABLE IF NOT EXISTS marriage_xp (
                    marriage_id INT PRIMARY KEY,
                    total_xp INT NOT NULL DEFAULT 0,
                    level INT NOT NULL DEFAULT 1,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (marriage_id) REFERENCES marriages(id) ON DELETE CASCADE
                )
            `);

            // Create marriage_xp_history table
            await this.pool.execute(`
                CREATE TABLE IF NOT EXISTS marriage_xp_history (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    marriage_id INT NOT NULL,
                    xp_awarded INT NOT NULL,
                    source VARCHAR(50) NOT NULL,
                    details TEXT,
                    awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (marriage_id) REFERENCES marriages(id) ON DELETE CASCADE,
                    INDEX idx_marriage_awarded (marriage_id, awarded_at)
                )
            `);

            logger.info('Marriage XP tables initialized successfully');

        } catch (error) {
            logger.error(`Error initializing marriage XP tables: ${error.message}`);
            throw error;
        }
    }

    /**
     * Cache or update guild member data
     */
    async cacheGuildMember(memberData) {
        try {
            // Validate memberData
            if (!memberData || !memberData.userId || !memberData.guildId) {
                logger.debug(`Invalid memberData for cacheGuildMember:`, memberData);
                return { success: false, error: 'Invalid memberData, missing userId or guildId' };
            }

            const memberId = `${memberData.userId}_${memberData.guildId}`;
            
            const query = `
                INSERT INTO guild_members (
                    id, user_id, guild_id, username, display_name, nickname,
                    roles, permissions, is_owner, is_administrator, is_moderator,
                    is_booster, premium_since, joined_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    username = VALUES(username),
                    display_name = VALUES(display_name),
                    nickname = VALUES(nickname),
                    roles = VALUES(roles),
                    permissions = VALUES(permissions),
                    is_owner = VALUES(is_owner),
                    is_administrator = VALUES(is_administrator),
                    is_moderator = VALUES(is_moderator),
                    is_booster = VALUES(is_booster),
                    premium_since = VALUES(premium_since),
                    joined_at = VALUES(joined_at),
                    last_updated = CURRENT_TIMESTAMP
            `;

            const values = [
                memberId,
                memberData.userId,
                memberData.guildId,
                memberData.username || null,
                memberData.displayName || null,
                memberData.nickname || null,
                JSON.stringify(memberData.roles || []),
                memberData.permissions || null,
                memberData.isOwner || false,
                memberData.isAdministrator || false,
                memberData.isModerator || false,
                memberData.isBooster || false,
                memberData.premiumSince || null,
                memberData.joinedAt || null
            ];

            await this.pool.execute(query, values);
            return { success: true };

        } catch (error) {
            logger.error(`Error caching guild member: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get cached guild member data
     */
    async getCachedGuildMember(userId, guildId) {
        try {
            // Validate parameters
            if (!userId || !guildId) {
                logger.debug(`Invalid parameters for getCachedGuildMember: userId=${userId}, guildId=${guildId}`);
                return { success: false, member: null, error: 'Invalid userId or guildId' };
            }

            const query = `
                SELECT * FROM guild_members 
                WHERE user_id = ? AND guild_id = ?
            `;
            
            const [rows] = await this.pool.execute(query, [userId, guildId]);
            
            if (rows.length === 0) {
                return { success: false, member: null };
            }

            const member = rows[0];
            
            // Parse JSON roles
            if (member.roles) {
                try {
                    member.roles = JSON.parse(member.roles);
                } catch (e) {
                    member.roles = [];
                }
            }

            return { success: true, member };

        } catch (error) {
            logger.error(`Error getting cached guild member: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if user has specific role (using cached data)
     */
    async userHasRole(userId, guildId, roleId) {
        try {
            // Validate parameters
            if (!userId || !guildId || !roleId) {
                logger.debug(`Invalid parameters for userHasRole: userId=${userId}, guildId=${guildId}, roleId=${roleId}`);
                return { success: false, hasRole: false, error: 'Invalid parameters' };
            }

            const { success, member } = await this.getCachedGuildMember(userId, guildId);
            
            if (!success || !member) {
                return { success: false, hasRole: false };
            }

            const hasRole = member.roles && member.roles.includes(roleId);
            return { success: true, hasRole };

        } catch (error) {
            logger.error(`Error checking user role: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if user is administrator (using cached data)
     */
    async isUserAdmin(userId, guildId) {
        try {
            // Validate parameters
            if (!userId || !guildId) {
                logger.debug(`Invalid parameters for isUserAdmin: userId=${userId}, guildId=${guildId}`);
                return { success: false, isAdmin: false, error: 'Invalid parameters' };
            }

            const { success, member } = await this.getCachedGuildMember(userId, guildId);
            
            if (!success || !member) {
                return { success: false, isAdmin: false };
            }

            return { success: true, isAdmin: member.is_administrator || member.is_owner };

        } catch (error) {
            logger.error(`Error checking admin status: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if user is moderator (using cached data)
     */
    async isUserModerator(userId, guildId) {
        try {
            // Validate parameters
            if (!userId || !guildId) {
                logger.debug(`Invalid parameters for isUserModerator: userId=${userId}, guildId=${guildId}`);
                return { success: false, isModerator: false, error: 'Invalid parameters' };
            }

            const { success, member } = await this.getCachedGuildMember(userId, guildId);
            
            if (!success || !member) {
                return { success: false, isModerator: false };
            }

            return { success: true, isModerator: member.is_moderator || member.is_administrator || member.is_owner };

        } catch (error) {
            logger.error(`Error checking moderator status: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if user is server booster (using cached data)
     */
    async isUserBooster(userId, guildId) {
        try {
            // Validate parameters
            if (!userId || !guildId) {
                logger.debug(`Invalid parameters for isUserBooster: userId=${userId}, guildId=${guildId}`);
                return { success: false, isBooster: false, error: 'Invalid parameters' };
            }

            const { success, member } = await this.getCachedGuildMember(userId, guildId);
            
            if (!success || !member) {
                return { success: false, isBooster: false };
            }

            return { success: true, isBooster: member.is_booster };

        } catch (error) {
            logger.error(`Error checking booster status: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update user roles in cache
     */
    async updateUserRoles(userId, guildId, roles) {
        try {
            const query = `
                UPDATE guild_members 
                SET roles = ?, last_updated = CURRENT_TIMESTAMP
                WHERE user_id = ? AND guild_id = ?
            `;
            
            await this.pool.execute(query, [JSON.stringify(roles), userId, guildId]);
            return { success: true };

        } catch (error) {
            logger.error(`Error updating user roles: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}

// Export singleton instance
module.exports = new DatabaseAdapter();