/**
 * MariaDB Database Adapter for ATIVE Casino Bot
 * Pure MariaDB implementation for database operations
 */

const mysql = require('mysql2/promise');
const logger = require('./logger');
const { secureRandomInt } = require('./rng');

class DatabaseAdapter {
    constructor() {
        this.mariadbConnection = null;
        this.useMariaDB = false;
        this.initialized = false;
        
        // Connection pool for MariaDB
        this.pool = null;
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
                purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_week (user_id, guild_id, week_start),
                INDEX idx_week_start (week_start)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS lottery_info (
                guild_id VARCHAR(20) PRIMARY KEY,
                total_tickets INT NOT NULL DEFAULT 0,
                total_prize DECIMAL(20,2) NOT NULL DEFAULT 400000.00,
                next_drawing TIMESTAMP NULL,
                current_week_start DATE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
                user_id VARCHAR(20) NOT NULL,
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
                `ALTER TABLE scratch_tickets MODIFY COLUMN status ENUM('dropped', 'active', 'scratching', 'won', 'lost', 'expired') DEFAULT 'dropped'`
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
        const connection = await this.pool.getConnection();
        try {
            const [results] = await connection.execute(query, params);
            return results; // Return the actual results, not wrapped in extra array
        } finally {
            connection.release();
        }
    }

    // ========================= USER BALANCE OPERATIONS =========================

    /**
     * Get user balance
     */
    async getUserBalance(userId, guildId = null) {
        try {
            const rows = await this.executeQuery(
                'SELECT * FROM user_balances WHERE user_id = ?', 
                [userId]
            );
            
            if (rows.length > 0) {
                const row = rows[0];
                
                // Validate and sanitize balance values
                let wallet = parseFloat(row.wallet);
                let bank = parseFloat(row.bank);
                
                if (isNaN(wallet) || !isFinite(wallet)) {
                    logger.error(`Invalid wallet value in database for user ${userId}: ${row.wallet}, resetting to 0`);
                    wallet = 0;
                }
                if (isNaN(bank) || !isFinite(bank)) {
                    logger.error(`Invalid bank value in database for user ${userId}: ${row.bank}, resetting to 0`);
                    bank = 0;
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
                const walletValue = parseFloat(wallet);
                if (isNaN(walletValue) || !isFinite(walletValue)) {
                    logger.error(`Invalid wallet value for user ${userId}: ${wallet} (converted to ${walletValue})`);
                    return false;
                }
                updateFields.push('wallet = ?');
                updateValues.push(walletValue);
            }
            if (bank !== null) {
                const bankValue = parseFloat(bank);
                if (isNaN(bankValue) || !isFinite(bankValue)) {
                    logger.error(`Invalid bank value for user ${userId}: ${bank} (converted to ${bankValue})`);
                    return false;
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
    async ensureUser(userId, username = null) {
        await this.getUserBalance(userId); // This will create user if not exists
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
            let query;
            let params;

            if (gameType) {
                // Get stats for specific game type
                query = 'SELECT * FROM user_stats WHERE user_id = ? AND game_type = ?';
                params = [userId, gameType];
            } else {
                // Get all stats for user, organized by game type
                query = 'SELECT * FROM user_stats WHERE user_id = ?';
                params = [userId];
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
        return true;
    }

    async getLotteryInfo(guildId) {
        return {
            base_prize: 400000,
            tax_pool: 0,
            total_prize: 400000,
            total_tickets: 0,
            participants: {},
            lastDrawing: null
        };
    }

    async getUserLotteryTickets(userId, guildId) {
        try {
            // Get current week start (Sunday)
            const currentWeekStart = this.getCurrentWeekStart();
            
            const [rows] = await this.pool.execute(
                `SELECT COALESCE(SUM(ticket_count), 0) as total_tickets 
                 FROM lottery_tickets 
                 WHERE user_id = ? AND guild_id = ? AND week_start = ?`,
                [userId, guildId, currentWeekStart]
            );
            
            return rows[0].total_tickets || 0;
        } catch (error) {
            logger.error(`Failed to get user lottery tickets: ${error.message}`);
            return 0;
        }
    }

    async purchaseLotteryTickets(userId, guildId, ticketCount, totalCost) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();
            
            // Get current week start
            const currentWeekStart = this.getCurrentWeekStart();
            
            // Check current ticket count to enforce 7 ticket limit
            const [currentTicketsResult] = await connection.execute(
                `SELECT COALESCE(SUM(ticket_count), 0) as total_tickets 
                 FROM lottery_tickets 
                 WHERE user_id = ? AND guild_id = ? AND week_start = ?`,
                [userId, guildId, currentWeekStart]
            );
            
            const currentTickets = currentTicketsResult[0].total_tickets || 0;
            
            // Check if purchase would exceed 7 ticket limit
            if (currentTickets + ticketCount > 7) {
                await connection.rollback();
                logger.warn(`User ${userId} attempted to purchase ${ticketCount} tickets but already has ${currentTickets}/7`);
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
            
            // Insert or update lottery tickets (one record per user per week)
            await connection.execute(
                `INSERT INTO lottery_tickets (user_id, guild_id, ticket_count, purchase_cost, week_start, purchased_at) 
                 VALUES (?, ?, ?, ?, ?, NOW()) 
                 ON DUPLICATE KEY UPDATE 
                 ticket_count = ticket_count + ?, 
                 purchase_cost = purchase_cost + ?,
                 purchased_at = NOW()`,
                [userId, guildId, ticketCount, totalCost, currentWeekStart, ticketCount, totalCost]
            );
            
            // Update lottery info
            await connection.execute(
                `INSERT INTO lottery_info (guild_id, total_tickets, current_week_start) 
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE total_tickets = total_tickets + ?`,
                [guildId, ticketCount, currentWeekStart, ticketCount]
            );
            
            await connection.commit();
            logger.info(`User ${userId} purchased ${ticketCount} lottery tickets for $${totalCost} (now has ${currentTickets + ticketCount}/7)`);
            return true;
        } catch (error) {
            await connection.rollback();
            logger.error(`Failed to purchase lottery tickets: ${error.message}`);
            return false;
        } finally {
            connection.release();
        }
    }

    async getAllLotteryTickets(guildId) {
        try {
            const [rows] = await this.pool.execute(
                'SELECT user_id, SUM(ticket_count) as tickets FROM lottery_tickets WHERE guild_id = ? AND week_start = (SELECT current_week_start FROM lottery_info WHERE guild_id = ?) GROUP BY user_id',
                [guildId, guildId]
            );
            return rows;
        } catch (error) {
            logger.error(`Error getting all lottery tickets: ${error.message}`);
            return [];
        }
    }

    async getLotteryInfo(guildId) {
        try {
            const currentWeekStart = this.getCurrentWeekStart();
            
            const [rows] = await this.pool.execute(
                'SELECT * FROM lottery_info WHERE guild_id = ?',
                [guildId]
            );
            
            if (rows.length === 0) {
                // Create default lottery info for guild
                await this.pool.execute(
                    'INSERT INTO lottery_info (guild_id, total_tickets, total_prize, current_week_start) VALUES (?, 0, 400000.00, ?)',
                    [guildId, currentWeekStart]
                );
                
                return {
                    total_tickets: 0,
                    total_prize: 400000,
                    next_drawing: null,
                    current_week_start: currentWeekStart
                };
            }
            
            return rows[0];
        } catch (error) {
            logger.error(`Failed to get lottery info: ${error.message}`);
            return {
                total_tickets: 0,
                total_prize: 400000,
                next_drawing: null,
                current_week_start: this.getCurrentWeekStart()
            };
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
     * Record game result for statistics
     */
    async recordGameResult(userId, guildId, gameType, won, betAmount, payout, metadata = {}) {
        try {
            // Insert into game_results table for history tracking
            await this.pool.execute(
                `INSERT INTO game_results (user_id, guild_id, game_type, bet_amount, payout, won, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [userId, guildId, gameType, betAmount, payout, won, JSON.stringify(metadata)]
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
                await this.executeQuery(`
                    ALTER TABLE user_votes 
                    ADD COLUMN vote_streak INT NOT NULL DEFAULT 0 AFTER total_earned
                `);
                logger.info('Added vote_streak column to existing table');
            } catch (alterError) {
                // Column might already exist, which is fine
                if (!alterError.message.includes('Duplicate column name')) {
                    logger.warn(`Vote streak column migration: ${alterError.message}`);
                }
            }
            
            // Add index for vote_streak if it doesn't exist
            try {
                await this.executeQuery(`
                    ALTER TABLE user_votes 
                    ADD INDEX idx_vote_streak (vote_streak)
                `);
                logger.info('Added vote_streak index');
            } catch (indexError) {
                // Index might already exist
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
     * Add amount to lottery pool
     */
    async addToLotteryPool(guildId, amount) {
        try {
            const query = `
                INSERT INTO lottery (guild_id, total_prize, week_start) 
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                total_prize = total_prize + VALUES(total_prize)
            `;
            
            const weekStart = this.getCurrentWeekStart();
            await this.connection.execute(query, [guildId, amount, weekStart]);
            
            logger.info(`Added ${amount} to lottery pool for guild ${guildId || 'global'}`);
            return true;
        } catch (error) {
            logger.error(`Error adding to lottery pool: ${error.message}`);
            return false;
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
     * Conduct lottery drawing (placeholder implementation)
     */
    async conductLotteryDrawing(guildId) {
        try {
            logger.info(`Conducting lottery drawing for guild ${guildId || 'global'}`);
            
            // Placeholder implementation - return basic structure
            return {
                success: true,
                winner: null,
                prize: 0,
                participants: 0,
                message: "No lottery system implemented yet"
            };
        } catch (error) {
            logger.error(`Error conducting lottery drawing: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
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
            const result = await this.executeQuery(
                `SELECT 
                    MAX(created_at) as lastGamePlayed,
                    COUNT(*) as totalGames,
                    game_type as lastGameType
                FROM game_results 
                WHERE user_id = ? 
                GROUP BY user_id
                ORDER BY lastGamePlayed DESC
                LIMIT 1`,
                [userId]
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
            const [result] = await this.executeQuery(
                `SELECT * FROM user_levels WHERE user_id = ? AND guild_id = ?`,
                [userId, guildId]
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
        // Level formula: Level = floor(sqrt(totalXP / 100)) + 1
        // This gives a nice progression curve where higher levels require more XP
        return Math.floor(Math.sqrt(totalXp / 100)) + 1;
    }

    /**
     * Calculate XP needed for a specific level
     */
    calculateXpForLevel(level) {
        // XP needed = (level - 1)^2 * 100
        return Math.pow(level - 1, 2) * 100;
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
            const [result] = await this.executeQuery(
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
                    winning_combination, expires_at, won_amount, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'dropped')
            `;
            
            const params = [
                ticketId, 
                userId, 
                guildId, 
                channelId,
                JSON.stringify(ticketData),
                JSON.stringify(symbols),
                winningCombination ? JSON.stringify(winningCombination) : null,
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
                    ticket.scratched_positions = JSON.parse(ticket.scratched_positions);
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
            const [result] = await this.executeQuery(
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
                    ticket.scratched_positions = JSON.parse(ticket.scratched_positions);
                }
                return ticket;
            });
        } catch (error) {
            logger.error(`Error getting user active scratch tickets: ${error.message}`);
            return [];
        }
    }
}

// Export singleton instance
module.exports = new DatabaseAdapter();