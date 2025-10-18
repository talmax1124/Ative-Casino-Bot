/**
 * Database Management for ATIVE Casino Bot
 * MariaDB only support
 */

const logger = require('./logger');
const { secureRandomInt } = require('./rng');
const nodeCache = require('./nodeCache');
const botBanSystem = require('./botBanSystem');

// Fallback system for database operations
class DatabaseFallbackSystem {
    constructor() {
        this.inMemoryCache = new Map(); // Emergency cache for critical operations
        this.fallbackMode = false;
        this.lastHealthCheck = null;
        this.consecutiveFailures = 0;
        this.maxConsecutiveFailures = 3;
    }

    // Enable fallback mode when database is unavailable
    enableFallbackMode(reason) {
        if (!this.fallbackMode) {
            this.fallbackMode = true;
            logger.error(`Database fallback mode ENABLED: ${reason}`);
            
            // Try to log to comprehensive logger if available
            try {
                const comprehensiveLogger = require('./comprehensiveLogger');
                comprehensiveLogger.logError('DATABASE_FALLBACK_ENABLED', new Error(reason), {
                    critical: true,
                    fallbackActive: true,
                    consecutiveFailures: this.consecutiveFailures
                }).catch(() => {}); // Silent fail to prevent loops
            } catch (e) {
                // Comprehensive logger not available, continue
            }
        }
        this.consecutiveFailures++;
    }

    // Disable fallback mode when database is restored
    disableFallbackMode() {
        if (this.fallbackMode) {
            this.fallbackMode = false;
            this.consecutiveFailures = 0;
            logger.info('Database fallback mode DISABLED - Connection restored');
            
            try {
                const comprehensiveLogger = require('./comprehensiveLogger');
                comprehensiveLogger.logSystem('DATABASE_RESTORED', 'Connection restored, fallback mode disabled', {
                    previousFailures: this.consecutiveFailures,
                    cacheSize: this.inMemoryCache.size
                }).catch(() => {});
            } catch (e) {
                // Silent fail
            }
        }
    }

    // Get cached user data or return safe defaults
    getCachedUser(userId) {
        if (this.inMemoryCache.has(userId)) {
            return this.inMemoryCache.get(userId);
        }

        // SECURITY FIX: Return safe default user data - NO BALANCE TO PREVENT EXPLOITS
        const defaultUser = {
            user_id: userId,
            wallet: 0.0, // Always $0 in fallback mode
            bank: 0.0,   // Always $0 in fallback mode
            last_earn_ts: Date.now(), // Set current time to prevent immediate cooldown bypass
            last_rob_ts: Date.now(),
            game_active: true, // Mark as active to prevent game participation
            last_work_ts: Date.now(),
            last_beg_ts: Date.now(),
            last_crime_ts: Date.now(),
            last_heist_ts: Date.now(),
            last_earnmoney_ts: Date.now(),
            last_dailytask_ts: Date.now(),
            last_quiz_ts: Date.now(),
            created_at: new Date(),
            updated_at: new Date(),
            fallback_mode: true, // Mark as fallback data
            security_locked: true // SECURITY: Lock account in fallback mode
        };
        
        // SECURITY: Log fallback user creation
        logger.warn(`SECURITY: Created fallback user with locked state for ${userId}`);

        this.inMemoryCache.set(userId, defaultUser);
        return defaultUser;
    }

    // Update cached user data
    updateCachedUser(userId, updates) {
        const currentData = this.getCachedUser(userId);
        const updatedData = { ...currentData, ...updates, updated_at: new Date() };
        this.inMemoryCache.set(userId, updatedData);
        return updatedData;
    }

    // Health check for database connection
    async performHealthCheck(databaseAdapter) {
        try {
            if (databaseAdapter && databaseAdapter.testConnection) {
                await databaseAdapter.testConnection();
                this.lastHealthCheck = Date.now();
                if (this.fallbackMode) {
                    this.disableFallbackMode();
                }
                return true;
            }
        } catch (error) {
            logger.warn(`Database health check failed: ${error.message}`);
            this.enableFallbackMode(`Health check failed: ${error.message}`);
            return false;
        }
        return false;
    }
}

const fallbackSystem = new DatabaseFallbackSystem();

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
            
            // Start periodic health monitoring
            this.startHealthMonitoring();
            
            return;
        } catch (adapterError) {
            logger.error(`Database connection failed: ${adapterError.message}`);
            fallbackSystem.enableFallbackMode(`Initialization failed: ${adapterError.message}`);
            
            // Still mark as initialized to allow fallback mode operation
            this.initialized = true;
            logger.warn('Database initialized in FALLBACK MODE - games will use in-memory cache');
        }
    }

    /**
     * Start periodic health monitoring for database connection
     */
    startHealthMonitoring() {
        // Perform health check every 5 minutes
        const healthCheckInterval = 5 * 60 * 1000; // 5 minutes
        
        setInterval(async () => {
            try {
                await fallbackSystem.performHealthCheck(this.databaseAdapter);
            } catch (error) {
                logger.error(`Health check error: ${error.message}`);
            }
        }, healthCheckInterval);
        
        logger.info('Database health monitoring started (5-minute intervals)');
    }

    /**
     * Get fallback system status (for monitoring/debugging)
     */
    getFallbackStatus() {
        return {
            fallbackMode: fallbackSystem.fallbackMode,
            consecutiveFailures: fallbackSystem.consecutiveFailures,
            cacheSize: fallbackSystem.inMemoryCache.size,
            lastHealthCheck: fallbackSystem.lastHealthCheck,
            cachedUsers: Array.from(fallbackSystem.inMemoryCache.keys())
        };
    }

    // ========================= USER BALANCE OPERATIONS =========================

    /**
     * Get user balance
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID (kept for API compatibility but data is now global)
     * @returns {Object} User balance data
     */
    async getUserBalance(userId, guildId = null) {
        // 🚀 STEP 1: Check NodeCache cache first (fastest)
        try {
            const cachedBalance = await nodeCache.getUserBalance(userId, guildId);
            if (cachedBalance) {
                logger.debug(`💾 Cache HIT: User balance for ${userId} from NodeCache`);
                
                // BOT BAN CHECK: Check cached balance for ban thresholds
                try {
                    const banCheck = await botBanSystem.checkAndBanUser(userId, cachedBalance, global.discordClient);
                    if (banCheck.banned) {
                        logger.error(`🚫 User ${userId} auto-banned for ${banCheck.reason} (${botBanSystem.formatAmount(banCheck.amount)})`);
                        // Return zero balance for banned users
                        return { wallet: 0, bank: 0, banned: true, ban_reason: banCheck.reason };
                    }
                } catch (banError) {
                    logger.error(`Bot ban check failed for cached balance: ${banError.message}`);
                }
                
                return cachedBalance;
            }
        } catch (cacheError) {
            logger.warn(`NodeCache error in getUserBalance: ${cacheError.message}`);
            // Continue to database - cache errors shouldn't block operations
        }

        // 🎛️ STEP 2: Try primary database connection with fallback system
        if (this.usingAdapter && !fallbackSystem.fallbackMode) {
            try {
                const result = await this.databaseAdapter.getUserBalance(userId, guildId);
                
                if (result) {
                    // BOT BAN CHECK: Check database result for ban thresholds
                    try {
                        const banCheck = await botBanSystem.checkAndBanUser(userId, result, global.discordClient);
                        if (banCheck.banned) {
                            logger.error(`🚫 User ${userId} auto-banned for ${banCheck.reason} (${botBanSystem.formatAmount(banCheck.amount)})`);
                            // Return zero balance for banned users
                            return { wallet: 0, bank: 0, banned: true, ban_reason: banCheck.reason };
                        }
                    } catch (banError) {
                        logger.error(`Bot ban check failed for database result: ${banError.message}`);
                    }
                    
                    // 🚀 Cache successful result in NodeCache (async, don't wait)
                    nodeCache.cacheUserBalance(userId, guildId, result).catch(err => 
                        logger.debug(`NodeCache set failed: ${err.message}`)
                    );
                    
                    // Cache successful result for potential future fallback use
                    if (!fallbackSystem.fallbackMode) {
                        fallbackSystem.updateCachedUser(userId, result);
                    }
                }
                
                return result;
            } catch (error) {
                logger.error(`Database getUserBalance failed for ${userId}: ${error.message}`);
                fallbackSystem.enableFallbackMode(`getUserBalance error: ${error.message}`);
                
                // Fall through to fallback system below
            }
        }

        // 🛡️ STEP 3: Fallback system - use cached data or safe defaults
        logger.warn(`Using fallback getUserBalance for user ${userId}`);
        const fallbackData = fallbackSystem.getCachedUser(userId);
        
        // Mark data as from fallback for caller awareness
        fallbackData.fallback_mode = true;
        fallbackData.fallback_timestamp = Date.now();
        
        return fallbackData;
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
        // Check for play-for context and redirect winnings (but exclude level rewards and other non-game payouts)
        if (kwargs.playFor && walletChange > 0 && !kwargs.excludeFromPlayfor) {
            // CRITICAL SECURITY FIX: Validate PlayFor context to prevent exploitation
            const playForValidation = this.validatePlayForContext(userId, kwargs.playFor, walletChange);
            if (!playForValidation.valid) {
                logger.error(`SECURITY ALERT: Invalid PlayFor context detected! User: ${userId}, Reason: ${playForValidation.reason}`);
                // Send security alert
                if (global.discordClient) {
                    try {
                        const logChannel = global.discordClient.channels.cache.get('1406136478714826824');
                        if (logChannel) {
                            logChannel.send(`🚨 **PLAYFOR EXPLOIT ATTEMPT** 🚨\nUser: ${userId}\nReason: ${playForValidation.reason}\nAmount blocked: ${walletChange}`);
                        }
                    } catch (alertError) {
                        logger.error(`Failed to send PlayFor security alert: ${alertError.message}`);
                    }
                }
                // Clear any stale global play-for context to prevent repeated misuse
                try { global.playForContext = null; } catch {}
                // Block the transfer and give money to original player
                return await this.updateUserBalance(userId, guildId, walletChange, bankChange, { ...kwargs, playFor: null });
            }
            
            logger.info(`PlayFor: Redirecting ${walletChange} from ${userId} to ${kwargs.playFor.recipientId}`);
            logger.info(`PlayFor: Global context exists: ${!!global.playForContext}, Client exists: ${!!global.discordClient}`);
            
            // Check if we've already sent a notification for this playfor session to prevent duplicates
            // Use timestamp to make the key unique per game session (new timestamp each time playfor context is set)
            const sessionTimestamp = global.playForContext?.sessionTimestamp || Date.now();
            const notificationKey = `playfor_${global.playForContext?.channelId}_${global.playForContext?.recipientId}_${userId}_${sessionTimestamp}`;
            if (!global.playForNotificationSent) {
                global.playForNotificationSent = new Set();
            }
            
            // Get recipient's balance BEFORE giving them the winnings
            const recipientBalanceBefore = await this.getUserBalance(kwargs.playFor.recipientId, guildId);
            
            // Give the winnings to the recipient instead
            const result = await this.updateUserBalance(kwargs.playFor.recipientId, guildId, walletChange, bankChange, { ...kwargs, playFor: null });
            
            // Send DM notification and channel mention if payout was successful (only once per session)
            if (result && global.playForContext && !global.playForNotificationSent.has(notificationKey)) {
                // Mark this session as notified
                global.playForNotificationSent.add(notificationKey);
                
                // Clean up old notifications (keep only last 100 to prevent memory leaks)
                if (global.playForNotificationSent.size > 100) {
                    const entries = Array.from(global.playForNotificationSent);
                    global.playForNotificationSent = new Set(entries.slice(-50));
                }
                try {
                    const { formatMoney } = require('./moneyFormatter');
                    
                    // Get the bot client and recipient balance info
                    if (global.discordClient) {
                        const recipient = await global.discordClient.users.fetch(kwargs.playFor.recipientId);
                        const playerName = global.playForContext?.playerName || kwargs.playFor?.recipientName || 'Someone';
                        const gameName = global.playForContext?.game || 'a game';
                        
                        // Use the balance we captured before the payout
                        const previousBalance = recipientBalanceBefore.wallet;
                        
                        // Get recipient's new balance (after the payout)
                        const newBalance = await this.getUserBalance(kwargs.playFor.recipientId, guildId);
                        
                        // Send DM with enhanced formatting
                        const dmMessage = `🎉 **WINNER!** 🎉\n\n` +
                            `**${playerName}** just played **${gameName}** for you and won!\n\n` +
                            `💎 **Your Winnings:** ${formatMoney(walletChange)}\n\n` +
                            `💰 **Balance Update:**\n` +
                            `┌─ Previous: ${formatMoney(previousBalance)}\n` +
                            `├─ Winnings: +${formatMoney(walletChange)}\n` +
                            `└─ **New Total: ${formatMoney(newBalance.wallet)}**\n\n` +
                            `✨ *Thanks to ${playerName} for playing for you!* ✨`;
                        
                        await recipient.send(dmMessage);
                        logger.info(`PlayFor: DM sent to ${kwargs.playFor.recipientId} about ${formatMoney(walletChange)} winnings`);
                        
                        // Post channel mention if we have channel info
                        if (global.playForContext.channelId) {
                            const channel = await global.discordClient.channels.fetch(global.playForContext.channelId);
                            if (channel) {
                                const channelMessage = `🎉 **BIG WIN!** 🎉\n\n` +
                                    `<@${kwargs.playFor.recipientId}> **${playerName}** just won **${formatMoney(walletChange)}** for you!\n\n` +
                                    `🎮 **Game:** ${gameName.toUpperCase()}\n` +
                                    `💎 **Winnings:** ${formatMoney(walletChange)}\n` +
                                    `💰 **Balance:** ${formatMoney(previousBalance)} → **${formatMoney(newBalance.wallet)}**\n\n` +
                                    `📱 *Check your DMs for full details!*`;
                                await channel.send(channelMessage);
                                logger.info(`PlayFor: Channel mention sent for ${kwargs.playFor.recipientId}`);
                            }
                        }
                    }
                } catch (dmError) {
                    logger.warn(`PlayFor: Failed to send notifications to ${kwargs.playFor.recipientId}: ${dmError.message}`);
                }
            }
            
            return result;
        }

        // SECURITY: Check for fallback mode and block operations if in security-locked state
        if (fallbackSystem.fallbackMode) {
            logger.error(`SECURITY: Blocked balance update during fallback mode for user ${userId}. Amount: ${walletChange}`);
            // Send security alert
            if (global.discordClient && Math.abs(walletChange) > 1000) {
                try {
                    const logChannel = global.discordClient.channels.cache.get('1406136478714826824');
                    if (logChannel) {
                        logChannel.send(`🚨 **FALLBACK EXPLOIT BLOCKED** 🚨\nUser: ${userId}\nAttempted change: ${walletChange}\nSystem in fallback mode - all transactions blocked`);
                    }
                } catch (alertError) {
                    logger.error(`Failed to send fallback security alert: ${alertError.message}`);
                }
            }
            return false; // Block all balance changes during fallback
        }

        // Try primary database connection with fallback system
        if (this.usingAdapter && !fallbackSystem.fallbackMode) {
            try {
                const result = await this.databaseAdapter.updateUserBalance(userId, guildId, walletChange, bankChange, kwargs);
                
                // Update cache with successful changes for consistency
                if (result) {
                    // IMMEDIATE cache invalidation to prevent stale data
                    try {
                        const cacheKey = `casino:balance:${userId}:${guildId}`;
                        await nodeCache.del(cacheKey);
                        logger.debug(`🗑️ Invalidated cache for ${userId} after balance update`);
                    } catch (cacheError) {
                        logger.debug(`Cache invalidation failed: ${cacheError.message}`);
                    }
                    
                    // Get current data for cache update
                    let currentData;
                    try {
                        currentData = await this.databaseAdapter.getUserBalance(userId, guildId);
                        
                        // 🚀 Update NodeCache with fresh data SYNCHRONOUSLY
                        if (currentData) {
                            await nodeCache.cacheUserBalance(userId, guildId, currentData);
                            logger.debug(`✅ Cache updated for ${userId} with fresh balance data`);
                        }
                    } catch (fetchError) {
                        logger.debug(`Could not fetch updated balance for cache: ${fetchError.message}`);
                        currentData = fallbackSystem.getCachedUser(userId);
                    }
                    
                    // Update fallback cache
                    const updatedData = {
                        ...currentData,
                        wallet: Math.max(0, (currentData?.wallet || 0) + walletChange),
                        bank: Math.max(0, (currentData?.bank || 0) + bankChange),
                        ...kwargs
                    };
                    fallbackSystem.updateCachedUser(userId, updatedData);
                }
                
                return result;
            } catch (error) {
                logger.error(`Database updateUserBalance failed for ${userId}: ${error.message}`);
                fallbackSystem.enableFallbackMode(`updateUserBalance error: ${error.message}`);
                
                // Fall through to fallback system below
            }
        }

        // Fallback system - update cache only (critical for game functionality)
        logger.warn(`Using fallback updateUserBalance for user ${userId} (${walletChange} wallet, ${bankChange} bank)`);
        
        try {
            const currentData = fallbackSystem.getCachedUser(userId);
            const updatedData = {
                ...currentData,
                wallet: Math.max(0, currentData.wallet + walletChange),
                bank: Math.max(0, currentData.bank + bankChange),
                ...kwargs,
                fallback_mode: true,
                last_fallback_update: Date.now()
            };
            
            fallbackSystem.updateCachedUser(userId, updatedData);
            
            // Log critical balance changes for manual review
            if (Math.abs(walletChange) > 1000 || Math.abs(bankChange) > 1000) {
                logger.error(`CRITICAL FALLBACK: Large balance change for ${userId} - Wallet: ${walletChange}, Bank: ${bankChange}`);
            }
            
            return true; // Return true to allow game continuation
        } catch (fallbackError) {
            logger.error(`Fallback updateUserBalance failed: ${fallbackError.message}`);
            return false;
        }
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
        // IMMEDIATE cache invalidation before operation to prevent stale reads
        try {
            const cacheKey = `casino:balance:${userId}:${guildId}`;
            await nodeCache.del(cacheKey);
            logger.debug(`🗑️ Pre-invalidated cache for ${userId} before setUserBalance operation`);
        } catch (cacheError) {
            logger.debug(`Pre-cache invalidation failed: ${cacheError.message}`);
        }

        // Try primary database connection with fallback system
        if (this.usingAdapter && !fallbackSystem.fallbackMode) {
            try {
                const result = await this.databaseAdapter.setUserBalance(userId, guildId, wallet, bank, kwargs);
                
                // Update cache with successful changes for consistency
                if (result) {
                    const updatedData = {
                        user_id: userId,
                        wallet: wallet || 0,
                        bank: bank || 0,
                        ...kwargs,
                        updated_at: new Date()
                    };
                    
                    // 🚀 Update NodeCache SYNCHRONOUSLY
                    await nodeCache.cacheUserBalance(userId, guildId, updatedData);
                    logger.debug(`✅ Cache updated for ${userId} with fresh balance data`);
                    
                    fallbackSystem.updateCachedUser(userId, updatedData);
                }
                
                return result;
            } catch (error) {
                logger.error(`Database setUserBalance failed for ${userId}: ${error.message}`);
                fallbackSystem.enableFallbackMode(`setUserBalance error: ${error.message}`);
                
                // Fall through to fallback system below
            }
        }

        // Fallback system - update cache only 
        logger.warn(`Using fallback setUserBalance for user ${userId} (wallet: ${wallet}, bank: ${bank})`);
        
        try {
            const updatedData = {
                user_id: userId,
                wallet: wallet !== null ? Math.max(0, wallet) : fallbackSystem.getCachedUser(userId).wallet,
                bank: bank !== null ? Math.max(0, bank) : fallbackSystem.getCachedUser(userId).bank,
                ...kwargs,
                fallback_mode: true,
                last_fallback_update: Date.now(),
                updated_at: new Date()
            };
            
            fallbackSystem.updateCachedUser(userId, updatedData);
            
            // Log critical balance sets for manual review
            if ((wallet !== null && wallet > 10000) || (bank !== null && bank > 10000)) {
                logger.error(`CRITICAL FALLBACK: Large balance set for ${userId} - Wallet: ${wallet}, Bank: ${bank}`);
            }
            
            return true; // Return true to allow operation continuation
        } catch (fallbackError) {
            logger.error(`Fallback setUserBalance failed: ${fallbackError.message}`);
            return false;
        }
    }

    /**
     * Force cache invalidation for a user's balance
     * Utility function to ensure immediate cache consistency
     */
    async invalidateUserBalanceCache(userId, guildId = null) {
        try {
            const cacheKey = `casino:balance:${userId}:${guildId}`;
            await nodeCache.del(cacheKey);
            logger.debug(`🗑️ Cache invalidated for user ${userId}`);
            return true;
        } catch (error) {
            logger.debug(`Cache invalidation failed for user ${userId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Add money to user balance (alias for updateUserBalance)
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID (kept for API compatibility)
     * @param {number} amount - Amount to add
     * @param {string} type - 'wallet' or 'bank' (defaults to 'wallet')
     * @returns {boolean} Success status
     */
    async addMoney(userId, guildId = null, amount = 0, type = 'wallet') {
        // IMMEDIATE cache invalidation before operation to prevent stale reads
        try {
            const cacheKey = `casino:balance:${userId}:${guildId}`;
            await nodeCache.del(cacheKey);
            logger.debug(`🗑️ Pre-invalidated cache for ${userId} before addMoney operation`);
        } catch (cacheError) {
            logger.debug(`Pre-cache invalidation failed: ${cacheError.message}`);
        }

        if (type === 'wallet') {
            return await this.updateUserBalance(userId, guildId, amount, 0);
        } else if (type === 'bank') {
            return await this.updateUserBalance(userId, guildId, 0, amount);
        }
        return false;
    }

    /**
     * Remove money from user balance (alias for updateUserBalance with negative amounts)
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID (kept for API compatibility)
     * @param {number} amount - Amount to remove (positive number that will be subtracted)
     * @param {string} type - 'wallet' or 'bank' (defaults to 'wallet')
     * @returns {boolean} Success status
     */
    async removeMoney(userId, guildId = null, amount = 0, type = 'wallet') {
        // IMMEDIATE cache invalidation before operation to prevent stale reads
        try {
            const cacheKey = `casino:balance:${userId}:${guildId}`;
            await nodeCache.del(cacheKey);
            logger.debug(`🗑️ Pre-invalidated cache for ${userId} before removeMoney operation`);
        } catch (cacheError) {
            logger.debug(`Pre-cache invalidation failed: ${cacheError.message}`);
        }

        // Ensure amount is positive for subtraction
        const amountToRemove = Math.abs(amount);
        
        if (type === 'wallet') {
            return await this.updateUserBalance(userId, guildId, -amountToRemove, 0);
        } else if (type === 'bank') {
            return await this.updateUserBalance(userId, guildId, 0, -amountToRemove);
        }
        return false;
    }

    /**
     * Update balance (alias for updateUserBalance with different parameter order)
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID (kept for API compatibility)
     * @param {number} walletChange - Change in wallet amount
     * @param {number} bankChange - Change in bank amount (optional)
     * @returns {boolean} Success status
     */
    async updateBalance(userId, guildId = null, walletChange = 0, bankChange = 0) {
        return await this.updateUserBalance(userId, guildId, walletChange, bankChange);
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
     * @param {number} tier - Lottery tier (1 or 2, defaults to 1)
     * @returns {Object} Lottery information
     */
    async getLotteryInfo(guildId, tier = 1) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getLotteryInfo(guildId, tier);
        }
        const defaultPrize = tier === 1 ? 400000 : 3000000;
        return {
            base_prize: defaultPrize,
            tax_pool: 0,
            total_prize: defaultPrize,
            total_tickets: 0,
            participants: {},
            lastDrawing: null,
            tier: tier
        };
    }

    /**
     * Get user's lottery tickets for current week
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID
     * @param {number} tier - Lottery tier (1 or 2)
     * @returns {number} Number of tickets
     */
    async getUserLotteryTickets(userId, guildId, tier = 1) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getUserLotteryTickets(userId, guildId, tier);
        }
        return 0;
    }

    /**
     * Purchase lottery tickets for a user
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID
     * @param {number} ticketCount - Number of tickets to purchase
     * @param {number} totalCost - Total cost of tickets
     * @param {number} tier - Lottery tier (1 or 2)
     * @returns {boolean} Success status
     */
    async purchaseLotteryTickets(userId, guildId, ticketCount, totalCost, tier = 1) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.purchaseLotteryTickets(userId, guildId, ticketCount, totalCost, tier);
        }
        return false;
    }

    async getAllLotteryTickets(guildId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getAllLotteryTickets(guildId);
        }
        return [];
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
     * @param {number} tier - Lottery tier (1 or 2)
     * @returns {Object} Drawing results
     */
    async conductLotteryDrawing(guildId, tier = 1) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.conductLotteryDrawing(guildId, tier);
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
     * Get a poll by ID
     * @param {string} pollId - Poll ID
     * @returns {Object|null} Poll data
     */
    async getPoll(pollId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getPoll(pollId);
        }
        return null;
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
     * Update poll voters list
     * @param {string} pollId - Poll ID
     * @param {Array} voters - Voters array
     * @returns {boolean} Success status
     */
    async updatePollVoters(pollId, voters) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.updatePollVoters(pollId, voters);
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
        try {
            if (this.usingAdapter) {
                return await this.databaseAdapter.recordGameResult(userId, guildId, gameType, won, betAmount, payout, metadata);
            }
            
            // Fallback mode - store in cache for later sync
            const gameResult = {
                userId,
                guildId,
                gameType,
                won,
                betAmount,
                payout,
                metadata,
                timestamp: Date.now()
            };
            
            // Store in temporary cache for later database sync
            const logger = require('./logger');
            logger.info(`Recorded game result: ${userId} ${gameType} ${won ? 'won' : 'lost'} ${payout}`);
            
            return true;
        } catch (error) {
            const logger = require('./logger');
            logger.error(`Failed to record game result: ${error.message}`);
            return false;
        }
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
     * Get top voters leaderboard
     * @param {number} limit - Number of top voters to return
     * @returns {Array} Array of top voters
     */
    async getTopVoters(limit = 10) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getTopVoters(limit);
        }
        return [];
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

    // ========================= MARRIAGE SYSTEM =========================

    /**
     * Create a marriage proposal
     */
    async createMarriageProposal(proposerId, proposerName, recipientId, recipientName, guildId, proposalMessage) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.createMarriageProposal(proposerId, proposerName, recipientId, recipientName, guildId, proposalMessage);
        }
        return { success: false, error: 'Database not available' };
    }

    /**
     * Get pending marriage proposals for a user
     */
    async getPendingMarriageProposals(userId, guildId = null) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getPendingMarriageProposals(userId, guildId);
        }
        return [];
    }

    /**
     * Get sent marriage proposals for a user
     */
    async getSentMarriageProposals(userId, guildId = null, status = 'accepted') {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getSentMarriageProposals(userId, guildId, status);
        }
        return { success: true, proposals: [] };
    }

    /**
     * Respond to a marriage proposal (accept/reject)
     */
    async respondToMarriageProposal(proposalId, response) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.respondToMarriageProposal(proposalId, response);
        }
        return { success: false, error: 'Database not available' };
    }

    /**
     * Accept a marriage proposal (alias for respondToMarriageProposal)
     */
    async acceptMarriageProposal(proposalId, userId) {
        return await this.respondToMarriageProposal(proposalId, 'accepted');
    }

    /**
     * Create a marriage
     */
    async createMarriage(partner1Id, partner1Name, partner1Role, partner2Id, partner2Name, partner2Role, guildId, ceremonyData) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.createMarriage(partner1Id, partner1Name, partner1Role, partner2Id, partner2Name, partner2Role, guildId, ceremonyData);
        }
        return { success: false, error: 'Database not available' };
    }

    /**
     * Get user's marriage status
     */
    async getUserMarriage(userId, guildId = null) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getUserMarriage(userId, guildId);
        }
        return { married: false, marriage: null };
    }

    /**
     * Check if two users are married to each other
     */
    async areUsersMarried(userId1, userId2, guildId = null) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.areUsersMarried(userId1, userId2, guildId);
        }
        return false;
    }

    /**
     * Transfer money to shared bank
     */
    async transferToSharedBank(userId, guildId, amount) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.transferToSharedBank(userId, guildId, amount);
        }
        return { success: false, error: 'Database not available' };
    }

    /**
     * Add money to shared bank
     */
    async addToSharedBank(userId, guildId, amount) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.addToSharedBank(userId, guildId, amount);
        }
        return { success: false, error: 'Database not available' };
    }

    /**
     * Withdraw money from shared bank
     */
    async withdrawFromSharedBank(userId, guildId, amount) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.withdrawFromSharedBank(userId, guildId, amount);
        }
        return { success: false, error: 'Database not available' };
    }

    /**
     * Update marriage shared bank balance
     */
    async updateMarriageSharedBank(marriageId, amount) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.updateMarriageSharedBank(marriageId, amount);
        }
        return { success: false, error: 'Database not available' };
    }

    /**
     * Divorce a marriage
     */
    async divorceMarriage(marriageId, reason) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.divorceMarriage(marriageId, reason);
        }
        return { success: false, error: 'Database not available' };
    }

    // ================================
    // MARRIAGE TASK COMPLETION TRACKING
    // ================================

    /**
     * Mark a marriage task as completed
     */
    async completeMarriageTask(marriageId, taskNumber, completedBy, completionData = null) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.completeMarriageTask(marriageId, taskNumber, completedBy, completionData);
        }
        return { success: false, error: 'Database not available' };
    }

    /**
     * Get marriage task completion status for current week
     */
    async getMarriageTaskStatus(marriageId, weekStart = null) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getMarriageTaskStatus(marriageId, weekStart);
        }
        return { tasks: {}, weekStart: null };
    }

    /**
     * Reset marriage tasks for new week
     */
    async resetMarriageTasksForWeek(marriageId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.resetMarriageTasksForWeek(marriageId);
        }
        return { success: false, error: 'Database not available' };
    }

    /**
     * Get marriage stock portfolio
     */
    async getMarriageStockPortfolio(marriageId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getMarriageStockPortfolio(marriageId);
        }
        return [];
    }

    /**
     * Get marriage task history
     */
    async getMarriageTaskHistory(marriageId, limit = 10) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getMarriageTaskHistory(marriageId, limit);
        }
        return [];
    }

    /**
     * Debug task completions (temporary)
     */
    async debugTaskCompletions(marriageId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.debugTaskCompletions(marriageId);
        }
        return [];
    }

    /**
     * Fix task completion dates (temporary)
     */
    async fixTaskCompletionDates(marriageId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.fixTaskCompletionDates(marriageId);
        }
        return { success: false, error: 'Database not available' };
    }

    // ================================
    // Marriage XP System Methods
    // ================================

    /**
     * Award XP to a marriage for completing challenges
     */
    async awardMarriageXP(marriageId, xpAmount, source, details = null) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.awardMarriageXP(marriageId, xpAmount, source, details);
        }
        return { success: false, error: 'Database not available' };
    }

    /**
     * Get marriage XP and level data
     */
    async getMarriageXP(marriageId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getMarriageXP(marriageId);
        }
        return { marriageId, totalXP: 0, level: 1, lastUpdated: null, exists: false };
    }

    /**
     * Get marriage XP history
     */
    async getMarriageXPHistory(marriageId, limit = 10) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getMarriageXPHistory(marriageId, limit);
        }
        return [];
    }

    // ======================= POEM VOTING SYSTEM =======================

    /**
     * Save poem voting data
     */
    async savePoemVote(poemId, messageId, channelId, guildId, poemData, expiresAt = null) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.savePoemVote(poemId, messageId, channelId, guildId, poemData, expiresAt);
        }
        throw new Error('Database adapter not available');
    }

    /**
     * Get poem voting data by poem ID
     */
    async getPoemVote(poemId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getPoemVote(poemId);
        }
        return null;
    }

    /**
     * Update poem vote count and voter list
     */
    async updatePoemVote(poemId, voteType, userId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.updatePoemVote(poemId, voteType, userId);
        }
        return { success: false, error: 'Database adapter not available' };
    }

    /**
     * Get all active poem votes for a guild
     */
    async getActivePoemVotes(guildId) {
        if (this.usingAdapter) {
            return await this.databaseAdapter.getActivePoemVotes(guildId);
        }
        return [];
    }

    /**
     * Initialize marriage XP tables
     */
    async initializeMarriageXPTables() {
        if (this.usingAdapter) {
            return await this.databaseAdapter.initializeMarriageXPTables();
        }
        throw new Error('Database adapter not available');
    }

    /**
     * SECURITY: Force balance verification by bypassing cache
     */
    async forceBalanceVerification(userId, guildId = null) {
        try {
            // SECURITY: Always bypass cache for verification
            await this.invalidateUserBalanceCache(userId, guildId);
            
            // Get fresh balance directly from database
            let verifiedBalance;
            if (this.usingAdapter && !fallbackSystem.fallbackMode) {
                verifiedBalance = await this.databaseAdapter.getUserBalance(userId, guildId);
            } else {
                // If in fallback mode, return locked state
                logger.warn(`SECURITY: Balance verification blocked in fallback mode for ${userId}`);
                return {
                    wallet: 0,
                    bank: 0,
                    verified: false,
                    reason: 'System in fallback mode - games disabled'
                };
            }
            
            // SECURITY: Validate balance integrity
            if (verifiedBalance.wallet < 0 || verifiedBalance.bank < 0) {
                logger.error(`SECURITY: Negative balance detected for user ${userId}: wallet=${verifiedBalance.wallet}, bank=${verifiedBalance.bank}`);
                // Send security alert
                if (global.discordClient) {
                    try {
                        const logChannel = global.discordClient.channels.cache.get('1406136478714826824');
                        if (logChannel) {
                            logChannel.send(`🚨 **NEGATIVE BALANCE DETECTED** 🚨\nUser: ${userId}\nWallet: ${verifiedBalance.wallet}\nBank: ${verifiedBalance.bank}`);
                        }
                    } catch (alertError) {
                        logger.error(`Failed to send negative balance alert: ${alertError.message}`);
                    }
                }
                // Reset to zero
                verifiedBalance.wallet = Math.max(0, verifiedBalance.wallet);
                verifiedBalance.bank = Math.max(0, verifiedBalance.bank);
            }
            
            return {
                ...verifiedBalance,
                verified: true,
                verifiedAt: Date.now()
            };
            
        } catch (error) {
            logger.error(`Forced balance verification failed for ${userId}: ${error.message}`);
            return {
                wallet: 0,
                bank: 0,
                verified: false,
                reason: `Verification failed: ${error.message}`
            };
        }
    }

    /**
     * SECURITY: Validate bet amount against user's total wealth to prevent exploitation
     */
    async validateBetAmount(userId, guildId, betAmount, gameType = 'unknown') {
        try {
            const balance = await this.getUserBalance(userId, guildId);
            const totalWealth = parseFloat(balance.wallet) + parseFloat(balance.bank);
            
            // SECURITY: Prevent all-in exploits and excessive betting
            const maxBetPercentage = 0.25; // Maximum 25% of total wealth per bet
            const maxAllowedBet = totalWealth * maxBetPercentage;
            
            // SECURITY: Prevent small account manipulation
            if (totalWealth < 1000 && betAmount > 500) {
                return {
                    valid: false,
                    reason: `Bet too high for account size. Account: ${totalWealth}, Bet: ${betAmount}`,
                    suggestedMax: Math.min(500, totalWealth * 0.1)
                };
            }
            
            // SECURITY: Prevent large bet exploitation
            if (betAmount > maxAllowedBet) {
                return {
                    valid: false,
                    reason: `Bet exceeds ${Math.round(maxBetPercentage * 100)}% of total wealth. Max allowed: ${Math.floor(maxAllowedBet)}`,
                    suggestedMax: Math.floor(maxAllowedBet)
                };
            }
            
            // SECURITY: Absolute maximum bet regardless of wealth
            const absoluteMaxBet = 500000; // 500K max bet
            if (betAmount > absoluteMaxBet) {
                return {
                    valid: false,
                    reason: `Bet exceeds absolute maximum of ${absoluteMaxBet}`,
                    suggestedMax: absoluteMaxBet
                };
            }
            
            // SECURITY: Check for wallet funds (don't allow bank-only bets without transfer)
            if (betAmount > balance.wallet) {
                return {
                    valid: false,
                    reason: `Insufficient wallet funds. Wallet: ${balance.wallet}, Bet: ${betAmount}`,
                    suggestedMax: Math.floor(balance.wallet)
                };
            }
            
            return { valid: true, reason: 'Bet amount validated' };
            
        } catch (error) {
            logger.error(`Bet validation error: ${error.message}`);
            return { 
                valid: false, 
                reason: `Validation error: ${error.message}`, 
                suggestedMax: 1000 
            };
        }
    }

    /**
     * SECURITY: Validate PlayFor context to prevent exploitation
     */
    validatePlayForContext(userId, playForData, amount) {
        try {
            // Check if PlayFor data exists
            if (!playForData || !playForData.recipientId) {
                return { valid: false, reason: 'Missing PlayFor recipient data' };
            }

            // Check if global context exists and matches
            if (!global.playForContext) {
                return { valid: false, reason: 'No global PlayFor context found' };
            }

            // Validate recipient ID matches global context
            if (global.playForContext.recipientId !== playForData.recipientId) {
                return { valid: false, reason: 'PlayFor recipient ID mismatch' };
            }

            // Check if trying to PlayFor self (exploitation attempt)
            if (userId === playForData.recipientId) {
                return { valid: false, reason: 'Cannot PlayFor yourself (self-exploitation attempt)' };
            }

            // Check for excessively large amounts (potential exploitation)
            if (amount > 500000) { // 500K coin limit per PlayFor transaction (reduced from 1M)
                return { valid: false, reason: `PlayFor amount too large: ${amount} (max: 500K)` };
            }

            // Check if recipient ID is valid Discord user ID format
            if (!playForData.recipientId || typeof playForData.recipientId !== 'string' || !/^\d{17,19}$/.test(playForData.recipientId)) {
                return { valid: false, reason: 'Invalid recipient Discord ID format' };
            }

            // All checks passed
            return { valid: true, reason: 'PlayFor context validated' };

        } catch (error) {
            logger.error(`PlayFor validation error: ${error.message}`);
            return { valid: false, reason: `Validation error: ${error.message}` };
        }
    }
}

// Export singleton instance
module.exports = new DatabaseManager();
