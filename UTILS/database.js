/**
 * Database Management for ATIVE Casino Bot
 * MariaDB only support
 */

const logger = require('./logger');
const { secureRandomInt } = require('./rng');

class DatabaseManager {
    constructor() {
        this.db = null;
        this.databaseAdapter = null;
        this.initialized = false;
        this.usingAdapter = false;
    }

    /**
     * Initialize database connection with MariaDB only
     */
    async initialize() {
        if (this.initialized) return;

        // Use the database adapter (MariaDB only)
        try {
            const databaseAdapter = require('./databaseAdapter');
            this.databaseAdapter = databaseAdapter;
            await this.databaseAdapter.initialize();
            this.usingAdapter = true;
            this.initialized = true;
            logger.info('Database manager initialized with MariaDB');
            return;
        } catch (adapterError) {
            logger.error(`Database connection failed: ${adapterError.message}`);
            throw new Error(`Database connection failed: ${adapterError.message}`);
        }
    }

    // ========================= USER BALANCE OPERATIONS =========================

    /**
     * Get user balance
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID (kept for API compatibility but data is now global)
     * @returns {Object} User balance data
     */
    async getUserBalance(userId, guildId = null) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getUserBalance(userId, guildId);
        }

        // Return default balance if no adapter
        return {
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
    }

    /**
     * Update user balance
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID (kept for API compatibility)
     * @param {number} walletChange - Change in wallet amount
     * @param {number} bankChange - Change in bank amount
     * @param {Object} kwargs - Additional fields to update
     * @returns {boolean} Success status
     */
    async updateUserBalance(userId, guildId = null, walletChange = 0, bankChange = 0, kwargs = {}) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.updateUserBalance(userId, guildId, walletChange, bankChange, kwargs);
        }
        return false;
    }

    /**
     * Set user balance (absolute values)
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID (kept for API compatibility)
     * @param {number} wallet - New wallet amount
     * @param {number} bank - New bank amount
     * @param {Object} kwargs - Additional fields to set
     * @returns {boolean} Success status
     */
    async setUserBalance(userId, guildId = null, wallet = null, bank = null, kwargs = {}) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.setUserBalance(userId, guildId, wallet, bank, kwargs);
        }
        return false;
    }

    // ========================= USER STATS OPERATIONS =========================

    /**
     * Get user game statistics
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID (kept for API compatibility)
     * @param {string} gameType - Specific game type or null for all stats
     * @returns {Object} User statistics
     */
    async getUserStats(userId, guildId = null, gameType = null) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getUserStats(userId, guildId, gameType);
        }
        return {};
    }

    /**
     * Get user's most recent game activity across all games
     */
    async getUserLastActivity(userId, guildId = null) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getUserLastActivity(userId, guildId);
        }
        return null;
    }

    /**
     * Update user game statistics
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID (kept for API compatibility)
     * @param {string} gameType - Game type
     * @param {boolean} win - Whether the game was won
     * @param {number} wagered - Amount wagered
     * @param {number} result - Game result amount
     * @param {Object} userProfile - Optional user profile data for updating
     * @returns {boolean} Success status
     */
    async updateUserStats(userId, guildId = null, gameType = null, win = null, wagered = 0, result = 0, userProfile = null) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.updateUserStats(userId, guildId, gameType, win, wagered, result, userProfile);
        }
        return false;
    }

    // ========================= COMPATIBILITY METHODS =========================

    /**
     * Ensure user exists (compatibility method)
     * @param {string} userId - Discord user ID
     * @param {string} username - Username (optional)
     * @param {string} guildId - Guild ID (optional, for level records)
     */
    async ensureUser(userId, username = null, guildId = null) {
        if (this.usingAdapter) {
            await this.databaseAdapter.ensureUser(userId, username, guildId);
        }
    }

    /**
     * Get user balances (compatibility method)
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID
     * @returns {Array} [wallet, bank] amounts
     */
    async getBalances(userId, guildId) {
        const balance = await this.getUserBalance(userId, guildId);
        return [balance.wallet, balance.bank];
    }

    /**
     * Set user balances (compatibility method)
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID
     * @param {number} wallet - Wallet amount
     * @param {number} bank - Bank amount
     * @returns {Array} [wallet, bank] amounts
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
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID
     * @param {number} delta - Amount to change
     * @param {number} floor - Minimum allowed value
     * @returns {Array} [success, newAmount]
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

    // ========================= LOTTERY OPERATIONS =========================

    /**
     * Get lottery information for a guild
     * @param {string} guildId - Guild ID
     * @returns {Object} Lottery information
     */
    async getLotteryInfo(guildId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getLotteryInfo(guildId);
        }
        return {
            base_prize: 400000,
            tax_pool: 0,
            total_prize: 400000,
            total_tickets: 0,
            participants: {},
            lastDrawing: null
        };
    }

    /**
     * Get user's lottery tickets for current week
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID
     * @returns {number} Number of tickets
     */
    async getUserLotteryTickets(userId, guildId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getUserLotteryTickets(userId, guildId);
        }
        return 0;
    }

    /**
     * Purchase lottery tickets for a user
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID
     * @param {number} ticketCount - Number of tickets to purchase
     * @param {number} totalCost - Total cost of tickets
     * @returns {boolean} Success status
     */
    async purchaseLotteryTickets(userId, guildId, ticketCount, totalCost) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.purchaseLotteryTickets(userId, guildId, ticketCount, totalCost);
        }
        return false;
    }

    async getUserLotteryTickets(userId, guildId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getUserLotteryTickets(userId, guildId);
        }
        return 0;
    }

    async getLotteryInfo(guildId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getLotteryInfo(guildId);
        }
        return { total_tickets: 0, total_prize: 400000 };
    }

    async getAllLotteryTickets(guildId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getAllLotteryTickets(guildId);
        }
        return [];
    }

    async purchaseLotteryTickets(userId, guildId, ticketCount, totalCost) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.purchaseLotteryTickets(userId, guildId, ticketCount, totalCost);
        }
        return false;
    }

    /**
     * Add money to lottery prize pool (from money transfer tax)
     * @param {string} guildId - Guild ID
     * @param {number} amount - Amount to add to prize pool
     * @returns {boolean} Success status
     */
    async addToLotteryPool(guildId, amount, client = null) {
        if (this.usingAdapter) {
            const result = await this.databaseAdapter.addToLotteryPool(guildId, amount);
            
            // Auto-update lottery panel if client is provided
            if (result && client) {
                try {
                    const { updateLotteryPanel } = require('./lottery');
                    await updateLotteryPanel(client, guildId);
                    logger.info('Auto-updated lottery panel after pool addition');
                } catch (panelError) {
                    logger.error(`Failed to auto-update lottery panel: ${panelError.message}`);
                    // Don't fail the operation if panel update fails
                }
            }
            
            return result;
        }
        return false;
    }

    /**
     * Conduct lottery drawing and select winners
     * @param {string} guildId - Guild ID
     * @returns {Object} Drawing results
     */
    async conductLotteryDrawing(guildId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.conductLotteryDrawing(guildId);
        }
        return { success: false, reason: 'no_database' };
    }

    /**
     * Reset lottery for new week
     * @param {string} guildId - Guild ID
     * @param {boolean} hadWinners - Whether there were winners (affects prize rollover)
     * @returns {boolean} Success status
     */
    async resetLotteryWeek(guildId, hadWinners = true) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.resetLotteryWeek(guildId, hadWinners);
        }
        return false;
    }

    /**
     * Get lottery drawing history
     * @param {string} guildId - Guild ID
     * @param {number} limit - Number of recent drawings to fetch
     * @returns {Array} Array of drawing results
     */
    async getLotteryHistory(guildId, limit = 10) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getLotteryHistory(guildId, limit);
        }
        return [];
    }

    /**
     * Save lottery drawing results to history
     * @param {string} guildId - Guild ID
     * @param {Object} results - Drawing results
     * @returns {boolean} Success status
     */
    async saveLotteryHistory(guildId, results) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.saveLotteryHistory(guildId, results);
        }
        return false;
    }

    /**
     * Check and recover orphaned lottery tickets from previous weeks
     * @param {string} guildId - Guild ID
     * @returns {Object} Recovery results
     */
    async checkAndRecoverOrphanedTickets(guildId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.checkAndRecoverOrphanedTickets(guildId);
        }
        return { success: false, recovered: 0, reason: 'no_database' };
    }

    // ========================= BACKUP OPERATIONS =========================

    /**
     * Create a backup of all database collections
     * @returns {Object} Backup data with record count
     */
    async createBackup() {
        if (this.usingAdapter) {
            return await this.databaseAdapter.createBackup();
        }
        throw new Error('Database not initialized');
    }

    /**
     * Get user data (alias for getUserBalance for panel compatibility)
     */
    async getUser(userId, guildId) {
        const balance = await this.getUserBalance(userId, guildId);
        return {
            ...balance,
            lastTransaction: null // Add this when we implement transaction tracking
        };
    }

    // ========================= LEADERBOARD OPERATIONS =========================

    /**
     * Get top users by total balance (wallet + bank) with usernames
     * @param {string} guildId - Guild ID
     * @param {number} limit - Number of users to return
     * @returns {Array} Array of user balance data with usernames
     */
    async getTopUsersByBalance(guildId, limit = 10) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getTopUsersByBalance(guildId, limit);
        }
        return [];
    }

    // ========================= POLL OPERATIONS =========================

    /**
     * Store a new poll document
     * @param {string} pollId - Poll ID
     * @param {Object} pollData - Poll payload
     * @returns {boolean} Success status
     */
    async storePoll(pollId, pollData) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.storePoll(pollId, pollData);
        }
        return false;
    }

    /**
     * Update poll votes
     * @param {string} pollId - Poll ID
     * @param {Object} votes - Votes map
     * @returns {boolean} Success status
     */
    async updatePollVotes(pollId, votes) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.updatePollVotes(pollId, votes);
        }
        return false;
    }

    /**
     * End a poll (set active=false)
     * @param {string} pollId - Poll ID
     * @returns {boolean} Success status
     */
    async endPoll(pollId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.endPoll(pollId);
        }
        return false;
    }

    /**
     * Get top users by wins with game statistics
     * @param {string} guildId - Guild ID (kept for API compatibility)
     * @param {number} limit - Number of users to return
     * @returns {Array} Array of user game statistics
     */
    async getTopUsersByWins(guildId, limit = 10) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getTopUsersByWins(guildId, limit);
        }
        return [];
    }

    /**
     * Record game result for statistics
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Discord guild ID
     * @param {string} gameType - Type of game played
     * @param {boolean} won - Whether the game was won
     * @param {number} betAmount - Amount bet
     * @param {number} payout - Amount won/lost
     * @param {object} metadata - Additional game data
     * @returns {boolean} Success status
     */
    async recordGameResult(userId, guildId, gameType, won, betAmount, payout, metadata = {}) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.recordGameResult(userId, guildId, gameType, won, betAmount, payout, metadata);
        }
        return false;
    }

    /**
     * Get game history for a user
     * @param {string} userId - Discord user ID
     * @param {string} gameType - Optional game type filter
     * @param {number} limit - Number of results to return
     * @returns {Array} Array of game results
     */
    async getGameHistory(userId, gameType = null, limit = 20) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getGameHistory(userId, gameType, limit);
        }
        return [];
    }

    /**
     * Update global user statistics for leaderboard
     * @param {string} userId - Discord user ID
     * @param {boolean} win - Whether the game was won
     * @param {number} result - Game result amount
     * @returns {boolean} Success status
     */
    async updateGlobalUserStats(userId, win, result) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.updateGlobalUserStats(userId, win, result);
        }
        return false;
    }

    /**
     * Update user game statistics
     * @param {string} userId - Discord user ID
     * @param {boolean} won - Whether the user won the game
     * @param {string} gameType - Type of game played
     * @param {number} amount - Amount won/lost
     * @returns {boolean} Success status
     */
    async updateGameStats(userId, won, gameType = 'unknown', amount = 0) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.updateGameStats(userId, won, gameType, amount);
        }
        return false;
    }

    /**
     * Update username in user records (called when user uses commands)
     * @param {string} userId - Discord user ID
     * @param {string} username - Discord username
     */
    async updateUsername(userId, username) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.updateUsername(userId, username);
        }
        return false;
    }

    /**
     * Update user profile data including avatar and display name
     * @param {string} userId - Discord user ID
     * @param {Object} profileData - Profile data object
     * @param {string} profileData.username - Discord username
     * @param {string} profileData.displayName - Discord display name
     * @param {string} profileData.avatar - Discord avatar hash or URL
     */
    async updateUserProfile(userId, profileData) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.updateUserProfile(userId, profileData);
        }
        return false;
    }

    /**
     * Get user profile data
     * @param {string} userId - Discord user ID
     * @returns {Object} User profile data
     */
    async getUserProfile(userId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getUserProfile(userId);
        }
        const fallbackAvatarUrl = 'https://images.pexels.com/photos/1759531/pexels-photo-1759531.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500';
        return {
            userId: userId,
            username: 'Unknown User',
            displayName: 'Unknown User',
            avatarUrl: fallbackAvatarUrl,
            lastProfileUpdate: null
        };
    }

    /**
     * Extract profile data from Discord interaction
     * @param {Object} interaction - Discord interaction object
     * @returns {Object} Profile data object
     */
    extractProfileFromInteraction(interaction) {
        try {
            const user = interaction.user;
            return {
                username: user.username,
                displayName: user.displayName || user.globalName || user.username,
                avatar: user.avatar // This is the avatar hash, not URL
            };
        } catch (error) {
            logger.error(`Error extracting profile from interaction: ${error.message}`);
            return null;
        }
    }

    /**
     * Reset user balance to default values
     */
    async resetUserBalance(userId, guildId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.resetUserBalance(userId, guildId);
        }
        throw new Error('Database not initialized');
    }

    /**
     * Get game statistics for a guild
     */
    async getGameStatistics(guildId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getGameStatistics(guildId);
        }
        throw new Error('Database not initialized');
    }

    /**
     * Get all users for a guild (for admin purposes)
     */
    async getAllUsers(guildId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getAllUsers(guildId);
        }
        throw new Error('Database not initialized');
    }

    /**
     * Log admin/moderator actions for audit trail
     */
    async logAdminAction(userId, guildId, action, details, moderatorId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.logAdminAction(userId, guildId, action, details, moderatorId);
        }
        return false;
    }

    /**
     * Store user warning
     */
    async addUserWarning(userId, guildId, message, moderatorId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.addUserWarning(userId, guildId, message, moderatorId);
        }
        return false;
    }

    /**
     * Store temporary game ban
     */
    async addGameBan(userId, guildId, duration, reason, moderatorId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.addGameBan(userId, guildId, duration, reason, moderatorId);
        }
        return false;
    }

    /**
     * Check if user is currently banned from games
     */
    async isUserBannedFromGames(userId, guildId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.isUserBannedFromGames(userId, guildId);
        }
        return false; // Default to not banned if error
    }

    // ========================= SERVER CONFIGURATION OPERATIONS =========================

    /**
     * Get server configuration
     * @param {string} serverId - Discord guild ID
     * @returns {Object|null} Server configuration data
     */
    async getServerConfig(serverId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getServerConfig(serverId);
        }
        return null;
    }

    /**
     * Save server configuration
     * @param {string} serverId - Discord guild ID  
     * @param {Object} configData - Configuration data
     * @returns {boolean} Success status
     */
    async saveServerConfig(serverId, configData) {
        if (this.usingAdapter) {
            // Extract server name from configData if it exists
            const serverName = configData.serverName || 'Unknown Server';
            return await this.databaseAdapter.saveServerConfig(serverId, serverName, configData);
        }
        return false;
    }

    /**
     * Update specific server configuration fields
     * @param {string} serverId - Discord guild ID
     * @param {Object} updates - Fields to update
     * @returns {boolean} Success status
     */
    async updateServerConfig(serverId, updates) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.updateServerConfig(serverId, updates);
        }
        return false;
    }

    /**
     * Delete server configuration
     * @param {string} serverId - Discord guild ID
     * @returns {boolean} Success status
     */
    async deleteServerConfig(serverId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.deleteServerConfig(serverId);
        }
        return false;
    }

    /**
     * Initialize default server configuration
     * @param {string} serverId - Discord guild ID
     * @param {string} serverName - Discord guild name
     * @returns {Object} Default configuration
     */
    getDefaultServerConfig(serverId, serverName) {
        return {
            serverId,
            serverName,
            settings: {},
            channels: {
                gamesChannelId: null,
                logsChannelId: null,
                adminChannelId: null
            },
            roles: {
                adminRoles: [],
                moderatorRoles: []
            },
            economy: {
                startingBalance: 1000,
                dailyBonus: 100,
                currencySymbol: '🪙',
                currencyName: 'coins',
                minBet: 10,
                maxBet: 10000
            },
            games: {
                casino: ['slots', 'blackjack', 'fishing', 'plinko'],
                miniGames: ['uno', 'duckhunt', 'rps'],
                strategy: ['battleship'],
                maxConcurrentGames: 3,
                houseEdge: 2
            },
            security: {
                maxBetsPerHour: 100,
                suspiciousThreshold: 50,
                minAccountAge: 7,
                muteDuration: 5,
                banThreshold: 3,
                loggingEnabled: true
            },
            setupComplete: false,
            setupDate: null
        };
    }

    // ========================= VOTE TRACKING OPERATIONS =========================

    /**
     * Get user vote data
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID (kept for compatibility)
     * @returns {Object|null} Vote data
     */
    async getUserVoteData(userId, guildId = null) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getUserVoteData(userId, guildId);
        }
        return null;
    }

    /**
     * Update user vote data
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID (kept for compatibility)
     * @param {Object} voteData - Vote data to update
     * @returns {boolean} Success status
     */
    async updateUserVoteData(userId, guildId = null, voteData) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.updateUserVoteData(userId, guildId, voteData);
        }
        return false;
    }

    /**
     * Initialize vote tracking schema
     * @returns {boolean} Success status
     */
    async initializeVoteSchema() {
        if (this.usingAdapter) {
            return await this.databaseAdapter.initializeVoteSchema();
        }
        return false;
    }

    // ========================= LEVEL SYSTEM OPERATIONS =========================

    /**
     * Get user level data
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @returns {Object} User level data
     */
    async getUserLevel(userId, guildId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getUserLevel(userId, guildId);
        }
        throw new Error('Database not initialized');
    }

    /**
     * Add XP to user
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {number} xpAmount - Amount of XP to add
     * @param {string} reason - Reason for XP gain
     * @returns {Object} XP result with level up info
     */
    async addXpToUser(userId, guildId, xpAmount, reason = 'unknown') {
        if (this.usingAdapter) {
            return await this.databaseAdapter.addXpToUser(userId, guildId, xpAmount, reason);
        }
        throw new Error('Database not initialized');
    }

    /**
     * Update game statistics
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {boolean} won - Whether the user won
     */
    async updateGameStats(userId, guildId, won = false) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.updateGameStats(userId, guildId, won);
        }
    }

    /**
     * Calculate level from total XP
     * @param {number} totalXp - Total XP amount
     * @returns {number} Calculated level
     */
    calculateLevel(totalXp) {
        if (this.usingAdapter) {
            return this.databaseAdapter.calculateLevel(totalXp);
        }
        return 1;
    }

    /**
     * Calculate XP needed for next level
     * @param {number} totalXp - Current total XP
     * @returns {number} XP needed for next level
     */
    calculateXpForNextLevel(totalXp) {
        if (this.usingAdapter) {
            return this.databaseAdapter.calculateXpForNextLevel(totalXp);
        }
        return 100;
    }

    /**
     * Get level leaderboard
     * @param {string} guildId - Guild ID
     * @param {number} limit - Number of users to return
     * @returns {Array} Level leaderboard
     */
    async getLevelLeaderboard(guildId, limit = 10) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getLevelLeaderboard(guildId, limit);
        }
        return [];
    }

    // ========================= SCRATCH TICKET OPERATIONS =========================

    /**
     * Create a new scratch ticket
     * @param {string} ticketId - Unique ticket ID
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {string} channelId - Channel ID where ticket was dropped
     * @param {Object} ticketData - Ticket metadata
     * @param {Array} symbols - 3x3 grid of symbols
     * @param {Array} winningCombination - Winning combination if any
     * @param {number} wonAmount - Amount won (0 if losing ticket)
     * @returns {boolean} Success status
     */
    async createScratchTicket(ticketId, userId, guildId, channelId, ticketData, symbols, winningCombination = null, wonAmount = 0) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.createScratchTicket(ticketId, userId, guildId, channelId, ticketData, symbols, winningCombination, wonAmount);
        }
        throw new Error('Database not initialized');
    }

    /**
     * Get scratch ticket by ID
     * @param {string} ticketId - Ticket ID
     * @returns {Object|null} Ticket data
     */
    async getScratchTicket(ticketId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getScratchTicket(ticketId);
        }
        throw new Error('Database not initialized');
    }

    /**
     * Update scratch ticket progress
     * @param {string} ticketId - Ticket ID
     * @param {Array} scratchedPositions - Array of scratched positions
     * @param {string} status - Ticket status
     * @returns {boolean} Success status
     */
    async updateScratchTicket(ticketId, scratchedPositions, status = 'scratching') {
        if (this.usingAdapter) {
            return await this.databaseAdapter.updateScratchTicket(ticketId, scratchedPositions, status);
        }
        return false;
    }

    /**
     * Complete scratch ticket (win or lose)
     * @param {string} ticketId - Ticket ID
     * @param {boolean} won - Whether the user won
     * @param {number} winAmount - Amount won
     * @returns {boolean} Success status
     */
    async completeScratchTicket(ticketId, won, winAmount = 0) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.completeScratchTicket(ticketId, won, winAmount);
        }
        return false;
    }

    /**
     * Claim a scratch ticket for a user
     * @param {string} ticketId - Ticket ID
     * @param {string} userId - User ID claiming the ticket
     * @returns {boolean} Success status
     */
    async claimScratchTicket(ticketId, userId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.claimScratchTicket(ticketId, userId);
        }
        return false;
    }

    /**
     * Update scratched positions for a ticket
     * @param {string} ticketId - Ticket ID
     * @param {Array} scratchedPositions - Array of scratched position numbers
     * @returns {boolean} Success status
     */
    async updateScratchedPositions(ticketId, scratchedPositions) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.updateScratchedPositions(ticketId, scratchedPositions);
        }
        return false;
    }

    /**
     * Get or create scratch drop settings for guild
     * @param {string} guildId - Guild ID
     * @returns {Object|null} Drop settings
     */
    async getScratchDropSettings(guildId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getScratchDropSettings(guildId);
        }
        return null;
    }

    /**
     * Update scratch drop statistics
     * @param {string} guildId - Guild ID
     * @param {Date} nextDropTime - Next scheduled drop time
     * @returns {boolean} Success status
     */
    async updateScratchDropStats(guildId, nextDropTime = null) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.updateScratchDropStats(guildId, nextDropTime);
        }
        return false;
    }

    /**
     * Clean up expired scratch tickets
     * @returns {number} Number of expired tickets
     */
    async cleanupExpiredScratchTickets() {
        if (this.usingAdapter) {
            return await this.databaseAdapter.cleanupExpiredScratchTickets();
        }
        return 0;
    }

    /**
     * Get user's active scratch tickets
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @returns {Array} Active scratch tickets
     */
    async getUserActiveScratchTickets(userId, guildId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getUserActiveScratchTickets(userId, guildId);
        }
        return [];
    }

    // ========================= SHOP OPERATIONS =========================

    /**
     * Get all shop items by category
     * @param {string} category - Category filter (optional)
     * @returns {Array} Array of shop items
     */
    async getShopItems(category = null) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getShopItems(category);
        }
        return [];
    }

    /**
     * Get shop item by ID
     * @param {number} itemId - Item ID
     * @returns {Object|null} Shop item
     */
    async getShopItem(itemId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getShopItem(itemId);
        }
        return null;
    }

    /**
     * Purchase shop item for user
     * @param {string} userId - User ID
     * @param {number} itemId - Item ID
     * @param {number} price - Price paid
     * @returns {boolean} Success status
     */
    async purchaseShopItem(userId, itemId, price) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.purchaseShopItem(userId, itemId, price);
        }
        return false;
    }

    /**
     * Get user's shop purchases
     * @param {string} userId - User ID
     * @param {boolean} activeOnly - Only return active purchases
     * @returns {Array} Array of purchases with item details
     */
    async getUserShopPurchases(userId, activeOnly = true) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getUserShopPurchases(userId, activeOnly);
        }
        return [];
    }

    /**
     * Get user's active boosts
     * @param {string} userId - User ID
     * @returns {Array} Array of active boosts
     */
    async getUserActiveBoosts(userId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getUserActiveBoosts(userId);
        }
        return [];
    }

    /**
     * Check if user has specific boost active
     * @param {string} userId - User ID
     * @param {string} boostType - Type of boost to check
     * @returns {Object|null} Boost details or null
     */
    async getUserBoost(userId, boostType) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getUserBoost(userId, boostType);
        }
        return null;
    }

    /**
     * Clean up expired boosts and purchases
     * @returns {number} Number of cleaned up items
     */
    async cleanupExpiredShopItems() {
        if (this.usingAdapter) {
            return await this.databaseAdapter.cleanupExpiredShopItems();
        }
        return 0;
    }

    /**
     * Initialize shop with default items
     */
    async initializeShopItems() {
        if (this.usingAdapter) {
            return await this.databaseAdapter.initializeShopItems();
        }
        return false;
    }

    // ========================= USER SETTINGS =========================

    /**
     * Get user settings
     * @param {string} userId - User ID
     * @returns {Object|null} User settings object or null
     */
    async getUserSettings(userId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getUserSettings(userId);
        }
        return null;
    }

    /**
     * Set user setting
     * @param {string} userId - User ID
     * @param {string} settingKey - Setting key
     * @param {any} settingValue - Setting value
     * @returns {boolean} Success status
     */
    async setUserSetting(userId, settingKey, settingValue) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.setUserSetting(userId, settingKey, settingValue);
        }
        return false;
    }

    /**
     * Update user settings (multiple at once)
     * @param {string} userId - User ID  
     * @param {Object} settings - Settings object
     * @returns {boolean} Success status
     */
    async updateUserSettings(userId, settings) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.updateUserSettings(userId, settings);
        }
        return false;
    }
}

// Export singleton instance
module.exports = new DatabaseManager();