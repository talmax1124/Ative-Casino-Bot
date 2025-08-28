/**
 * MariaDB Database Adapter for ATIVE Casino Bot
 * Provides unified database access with automatic fallback between MariaDB and Firebase
 */

const mysql = require('mysql2/promise');
const logger = require('./logger');
const { secureRandomInt } = require('./rng');

class DatabaseAdapter {
    constructor() {
        this.mariadbConnection = null;
        this.firebaseDb = null;
        this.useMariaDB = false;
        this.initialized = false;
        
        // Connection pool for MariaDB
        this.pool = null;
    }

    /**
     * Initialize database connections
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Try to initialize MariaDB first
            await this.initializeMariaDB();
            this.useMariaDB = true;
            logger.info('Database adapter initialized with MariaDB');
        } catch (mariaError) {
            logger.warn(`MariaDB connection failed: ${mariaError.message}, falling back to Firebase`);
            
            // Fall back to Firebase
            try {
                const firebaseConfig = require('./firebase');
                this.firebaseDb = await firebaseConfig.initialize();
                this.useMariaDB = false;
                logger.info('Database adapter initialized with Firebase (fallback)');
            } catch (firebaseError) {
                logger.error(`Both database connections failed - MariaDB: ${mariaError.message}, Firebase: ${firebaseError.message}`);
                throw new Error('No database connection available');
            }
        }

        this.initialized = true;
    }

    /**
     * Initialize MariaDB connection pool
     */
    async initializeMariaDB() {
        const config = {
            host: process.env.MARIADB_HOST || 'localhost',
            port: parseInt(process.env.MARIADB_PORT) || 3306,
            user: process.env.MARIADB_USER || 'root',
            password: process.env.MARIADB_PASSWORD || '',
            database: process.env.MARIADB_DATABASE || 'ative_casino',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            acquireTimeout: 60000,
            timeout: 60000,
            reconnect: true,
            charset: 'utf8mb4',
            timezone: '+00:00'
        };

        this.pool = mysql.createPool(config);
        
        // Test connection
        const connection = await this.pool.getConnection();
        await connection.ping();
        connection.release();

        // Initialize database schema if needed
        await this.initializeSchema();
    }

    /**
     * Initialize database schema for MariaDB
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
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_updated_at (updated_at)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS user_stats (
                id VARCHAR(50) PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                game_type VARCHAR(50) DEFAULT NULL,
                wins INT NOT NULL DEFAULT 0,
                losses INT NOT NULL DEFAULT 0,
                total_wagered DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                total_won DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                biggest_win DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                biggest_loss DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                total_wins INT NOT NULL DEFAULT 0,
                total_losses INT NOT NULL DEFAULT 0,
                total_games_played INT NOT NULL DEFAULT 0,
                total_winnings DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                total_losses_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
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

            `CREATE TABLE IF NOT EXISTS lottery (
                guild_id VARCHAR(20) PRIMARY KEY,
                base_prize DECIMAL(15,2) NOT NULL DEFAULT 400000.00,
                tax_pool DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                total_prize DECIMAL(15,2) NOT NULL DEFAULT 400000.00,
                total_tickets INT NOT NULL DEFAULT 0,
                week_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS lottery_data (
                guild_id VARCHAR(20) PRIMARY KEY,
                participants JSON DEFAULT NULL,
                total_prize DECIMAL(15,2) NOT NULL DEFAULT 400000.00,
                total_tickets INT NOT NULL DEFAULT 0,
                current_week_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_drawing TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS lottery_tickets (
                id VARCHAR(50) PRIMARY KEY,
                guild_id VARCHAR(20) NOT NULL,
                user_id VARCHAR(20) NOT NULL,
                tickets INT NOT NULL DEFAULT 0,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_guild_user (guild_id, user_id),
                INDEX idx_guild (guild_id)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS lottery_history (
                id VARCHAR(50) PRIMARY KEY,
                guild_id VARCHAR(20) NOT NULL,
                winners JSON DEFAULT NULL,
                total_prize DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                total_participants INT NOT NULL DEFAULT 0,
                total_tickets INT NOT NULL DEFAULT 0,
                drawing_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_guild_date (guild_id, drawing_date)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS polls (
                poll_id VARCHAR(50) PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT DEFAULT NULL,
                options JSON DEFAULT NULL,
                votes JSON DEFAULT NULL,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                creator_id VARCHAR(20) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                channel_id VARCHAR(20) NOT NULL,
                ends_at TIMESTAMP NULL,
                ended_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_guild_active (guild_id, active)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS admin_logs (
                id VARCHAR(50) PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                action VARCHAR(100) NOT NULL,
                details TEXT DEFAULT NULL,
                moderator_id VARCHAR(20) NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_action (user_id, action),
                INDEX idx_guild_timestamp (guild_id, timestamp)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS user_warnings (
                id VARCHAR(50) PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                message TEXT NOT NULL,
                moderator_id VARCHAR(20) NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_warnings (user_id, guild_id)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            `CREATE TABLE IF NOT EXISTS game_bans (
                id VARCHAR(50) PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                duration INT NOT NULL,
                reason TEXT NOT NULL,
                moderator_id VARCHAR(20) NOT NULL,
                expiry TIMESTAMP NOT NULL,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_active_expiry (user_id, guild_id, active, expiry)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        ];

        const connection = await this.pool.getConnection();
        try {
            for (const query of createTables) {
                await connection.execute(query);
            }
            logger.info('MariaDB schema initialized successfully');
        } finally {
            connection.release();
        }
    }

    /**
     * Execute query with automatic fallback
     */
    async executeQuery(query, params = []) {
        if (this.useMariaDB) {
            const connection = await this.pool.getConnection();
            try {
                const [results] = await connection.execute(query, params);
                return results;
            } finally {
                connection.release();
            }
        } else {
            throw new Error('Query execution only available with MariaDB');
        }
    }

    // ========================= USER BALANCE OPERATIONS =========================

    /**
     * Get user balance
     */
    async getUserBalance(userId, guildId = null) {
        if (this.useMariaDB) {
            try {
                const [rows] = await this.executeQuery(
                    'SELECT * FROM user_balances WHERE user_id = ?', 
                    [userId]
                );
                
                if (rows.length > 0) {
                    const row = rows[0];
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
                        `INSERT INTO user_balances 
                         (user_id, wallet, bank, last_earn_ts, last_rob_ts, game_active, 
                          last_work_ts, last_beg_ts, last_crime_ts, last_heist_ts) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [userId, 1000.0, 0.0, 0.0, 0.0, false, 0.0, 0.0, 0.0, 0.0]
                    );

                    return defaultBalance;
                }
            } catch (error) {
                logger.error(`MariaDB getUserBalance error: ${error.message}`);
                // Fall back to Firebase if available
                if (this.firebaseDb) {
                    return await this.getFirebaseUserBalance(userId, guildId);
                }
                throw error;
            }
        } else {
            return await this.getFirebaseUserBalance(userId, guildId);
        }
    }

    /**
     * Firebase fallback for getUserBalance
     */
    async getFirebaseUserBalance(userId, guildId) {
        // Use existing Firebase logic from database.js
        const firebaseManager = require('./database');
        return await firebaseManager.getUserBalance(userId, guildId);
    }

    /**
     * Update user balance
     */
    async updateUserBalance(userId, guildId = null, walletChange = 0, bankChange = 0, kwargs = {}) {
        if (this.useMariaDB) {
            try {
                const current = await this.getUserBalance(userId, guildId);
                const newWallet = current.wallet + walletChange;
                const newBank = current.bank + bankChange;

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
                if (this.firebaseDb) {
                    const firebaseManager = require('./database');
                    return await firebaseManager.updateUserBalance(userId, guildId, walletChange, bankChange, kwargs);
                }
                return false;
            }
        } else {
            const firebaseManager = require('./database');
            return await firebaseManager.updateUserBalance(userId, guildId, walletChange, bankChange, kwargs);
        }
    }

    /**
     * Set user balance (absolute values)
     */
    async setUserBalance(userId, guildId = null, wallet = null, bank = null, kwargs = {}) {
        if (this.useMariaDB) {
            try {
                const updateFields = ['updated_at = NOW()'];
                const updateValues = [];

                if (wallet !== null) {
                    updateFields.push('wallet = ?');
                    updateValues.push(parseFloat(wallet));
                }
                if (bank !== null) {
                    updateFields.push('bank = ?');
                    updateValues.push(parseFloat(bank));
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
                if (this.firebaseDb) {
                    const firebaseManager = require('./database');
                    return await firebaseManager.setUserBalance(userId, guildId, wallet, bank, kwargs);
                }
                return false;
            }
        } else {
            const firebaseManager = require('./database');
            return await firebaseManager.setUserBalance(userId, guildId, wallet, bank, kwargs);
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
        
        const success = await this.setUserBalance(userId, guildId, newWallet, balance.bank);
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

    // ========================= DELEGATION METHODS =========================
    // For features not yet implemented in MariaDB, delegate to Firebase

    async getUserStats(userId, guildId = null, gameType = null) {
        if (this.firebaseDb) {
            const firebaseManager = require('./database');
            return await firebaseManager.getUserStats(userId, guildId, gameType);
        }
        return {};
    }

    async updateUserStats(userId, guildId = null, gameType = null, win = null, wagered = 0, result = 0, userProfile = null) {
        if (this.firebaseDb) {
            const firebaseManager = require('./database');
            return await firebaseManager.updateUserStats(userId, guildId, gameType, win, wagered, result, userProfile);
        }
        return false;
    }

    async updateUsername(userId, username) {
        if (this.useMariaDB) {
            try {
                await this.executeQuery(
                    'UPDATE user_balances SET username = ? WHERE user_id = ?',
                    [username, userId]
                );
                return true;
            } catch (error) {
                logger.error(`MariaDB updateUsername error: ${error.message}`);
            }
        }
        
        if (this.firebaseDb) {
            const firebaseManager = require('./database');
            return await firebaseManager.updateUsername(userId, username);
        }
        return false;
    }

    // Delegate remaining methods to Firebase for now
    async getLotteryInfo(guildId) {
        if (this.firebaseDb) {
            const firebaseManager = require('./database');
            return await firebaseManager.getLotteryInfo(guildId);
        }
        return {};
    }

    async getUserLotteryTickets(userId, guildId) {
        if (this.firebaseDb) {
            const firebaseManager = require('./database');
            return await firebaseManager.getUserLotteryTickets(userId, guildId);
        }
        return 0;
    }

    async purchaseLotteryTickets(userId, guildId, ticketCount, totalCost) {
        if (this.firebaseDb) {
            const firebaseManager = require('./database');
            return await firebaseManager.purchaseLotteryTickets(userId, guildId, ticketCount, totalCost);
        }
        return false;
    }

    async getTopUsersByBalance(guildId, limit = 10) {
        if (this.firebaseDb) {
            const firebaseManager = require('./database');
            return await firebaseManager.getTopUsersByBalance(guildId, limit);
        }
        return [];
    }

    async getTopUsersByWins(guildId, limit = 10) {
        if (this.firebaseDb) {
            const firebaseManager = require('./database');
            return await firebaseManager.getTopUsersByWins(guildId, limit);
        }
        return [];
    }

    // Add all other methods as delegations for now...
    async storePoll(pollId, pollData) {
        if (this.firebaseDb) {
            const firebaseManager = require('./database');
            return await firebaseManager.storePoll(pollId, pollData);
        }
        return false;
    }

    async updatePollVotes(pollId, votes) {
        if (this.firebaseDb) {
            const firebaseManager = require('./database');
            return await firebaseManager.updatePollVotes(pollId, votes);
        }
        return false;
    }

    async endPoll(pollId) {
        if (this.firebaseDb) {
            const firebaseManager = require('./database');
            return await firebaseManager.endPoll(pollId);
        }
        return false;
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
}

// Export singleton instance
module.exports = new DatabaseAdapter();