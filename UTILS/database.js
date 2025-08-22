/**
 * Firebase Database Management for ATIVE Casino Bot
 * Firebase Firestore-based persistent storage for user data, server configurations, and game stats
 */

const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const firebaseConfig = require('./firebase');
const logger = require('./logger');

class DatabaseManager {
    constructor() {
        this.db = null;
        this.initialized = false;
    }

    /**
     * Initialize database connection
     */
    async initialize() {
        if (!this.initialized) {
            this.db = await firebaseConfig.initialize();
            this.initialized = true;
            logger.info('Firebase database manager initialized');
        }
    }

    // ========================= USER BALANCE OPERATIONS =========================

    /**
     * Get user balance from Firestore
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID (kept for API compatibility but data is now global)
     * @returns {Object} User balance data
     */
    async getUserBalance(userId, guildId = null) {
        try {
            const docRef = this.db.collection('user_balances').doc(userId);
            const doc = await docRef.get();
            
            if (doc.exists) {
                const data = doc.data();
                return {
                    user_id: userId,
                    wallet: parseFloat(data.wallet || 1000.0),
                    bank: parseFloat(data.bank || 0.0),
                    last_earn_ts: parseFloat(data.last_earn_ts || 0.0),
                    last_rob_ts: parseFloat(data.last_rob_ts || 0.0),
                    game_active: Boolean(data.game_active || false),
                    last_work_ts: parseFloat(data.last_work_ts || 0.0),
                    last_beg_ts: parseFloat(data.last_beg_ts || 0.0),
                    last_crime_ts: parseFloat(data.last_crime_ts || 0.0),
                    last_heist_ts: parseFloat(data.last_heist_ts || 0.0),
                    created_at: data.created_at || new Date(),
                    updated_at: data.updated_at || new Date()
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
                
                await docRef.set(defaultBalance);
                return defaultBalance;
            }
        } catch (error) {
            logger.error(`Error getting user balance: ${error.message}`);
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
                created_at: new Date(),
                updated_at: new Date()
            };
        }
    }

    /**
     * Update user balance in Firestore
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID (kept for API compatibility)
     * @param {number} walletChange - Change in wallet amount
     * @param {number} bankChange - Change in bank amount
     * @param {Object} kwargs - Additional fields to update
     * @returns {boolean} Success status
     */
    async updateUserBalance(userId, guildId = null, walletChange = 0, bankChange = 0, kwargs = {}) {
        try {
            const docRef = this.db.collection('user_balances').doc(userId);
            
            // Get current balance
            const current = await this.getUserBalance(userId, null);
            
            // Calculate new values
            const updateData = {
                wallet: current.wallet + walletChange,
                bank: current.bank + bankChange,
                updated_at: new Date()
            };
            
            // Add any additional fields
            for (const [key, value] of Object.entries(kwargs)) {
                if (key !== 'user_id' && key !== 'guild_id') {
                    updateData[key] = value;
                }
            }
            
            // Update document
            await docRef.update(updateData);
            
            logger.info(`Updated balance for user ${userId}: wallet_change=${walletChange}, bank_change=${bankChange}`);
            return true;
        } catch (error) {
            logger.error(`Error updating user balance: ${error.message}`);
            return false;
        }
    }

    /**
     * Set user balance (absolute values) in Firestore
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID (kept for API compatibility)
     * @param {number} wallet - New wallet amount
     * @param {number} bank - New bank amount
     * @param {Object} kwargs - Additional fields to set
     * @returns {boolean} Success status
     */
    async setUserBalance(userId, guildId = null, wallet = null, bank = null, kwargs = {}) {
        try {
            const docRef = this.db.collection('user_balances').doc(userId);
            
            const balanceData = {
                user_id: userId,
                updated_at: new Date()
            };
            
            // Only update provided values
            if (wallet !== null) {
                balanceData.wallet = parseFloat(wallet);
            }
            if (bank !== null) {
                balanceData.bank = parseFloat(bank);
            }
            
            // Add any additional fields
            for (const [key, value] of Object.entries(kwargs)) {
                balanceData[key] = value;
            }
            
            // Set document (create or overwrite)
            await docRef.set(balanceData, { merge: true });
            
            logger.info(`Set balance for user ${userId}: wallet=${wallet}, bank=${bank}`);
            return true;
        } catch (error) {
            logger.error(`Error setting user balance: ${error.message}`);
            return false;
        }
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
        try {
            if (gameType) {
                // Get specific game stats
                const docRef = this.db.collection('user_stats').doc(`${userId}_${gameType}`);
                const doc = await docRef.get();
                
                if (doc.exists) {
                    return doc.data();
                } else {
                    // Create default stats
                    const defaultStats = {
                        user_id: userId,
                        game_type: gameType,
                        wins: 0,
                        losses: 0,
                        total_wagered: 0.0,
                        total_won: 0.0,
                        biggest_win: 0.0,
                        biggest_loss: 0.0,
                        created_at: new Date(),
                        updated_at: new Date()
                    };
                    
                    await docRef.set(defaultStats);
                    return defaultStats;
                }
            } else {
                // Get all stats for user
                const query = this.db.collection('user_stats').where('user_id', '==', userId);
                const snapshot = await query.get();
                
                const allStats = {};
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const gameType = data.game_type;
                    if (gameType) {
                        allStats[gameType] = data;
                    }
                });
                
                return allStats;
            }
        } catch (error) {
            logger.error(`Error getting user stats: ${error.message}`);
            return {};
        }
    }

    /**
     * Update user game statistics
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID (kept for API compatibility)
     * @param {string} gameType - Game type
     * @param {boolean} win - Whether the game was won
     * @param {number} wagered - Amount wagered
     * @param {number} result - Game result amount
     * @returns {boolean} Success status
     */
    async updateUserStats(userId, guildId = null, gameType = null, win = null, wagered = 0, result = 0) {
        try {
            const docRef = this.db.collection('user_stats').doc(`${userId}_${gameType}`);
            const currentStats = await this.getUserStats(userId, null, gameType);
            
            // Update stats - ensure we have all required fields
            const updateData = {
                user_id: userId,
                game_type: gameType,
                wins: currentStats.wins + (win ? 1 : 0),
                losses: currentStats.losses + (win ? 0 : 1),
                total_wagered: currentStats.total_wagered + wagered,
                total_won: currentStats.total_won + (win ? result : 0),
                updated_at: new Date()
            };
            
            // Update biggest win/loss
            if (win && result > (currentStats.biggest_win || 0)) {
                updateData.biggest_win = result;
            } else if (!win && Math.abs(result) > (currentStats.biggest_loss || 0)) {
                updateData.biggest_loss = Math.abs(result);
            } else {
                // Preserve existing values
                updateData.biggest_win = currentStats.biggest_win || 0;
                updateData.biggest_loss = currentStats.biggest_loss || 0;
            }
            
            // Add created_at if not exists
            if (!currentStats.created_at) {
                updateData.created_at = new Date();
            } else {
                updateData.created_at = currentStats.created_at;
            }
            
            // Use set with merge to ensure document exists
            await docRef.set(updateData, { merge: true });
            
            logger.info(`Updated stats for ${userId}_${gameType}: wins=${updateData.wins}, losses=${updateData.losses}`);
            return true;
        } catch (error) {
            logger.error(`Error updating user stats for ${userId}_${gameType}: ${error.message}`);
            return false;
        }
    }

    // ========================= COMPATIBILITY METHODS =========================

    /**
     * Ensure user exists (compatibility method)
     * @param {string} userId - Discord user ID
     * @param {string} username - Username (optional)
     */
    async ensureUser(userId, username = null) {
        // Firebase handler automatically creates users when needed
        // This is a no-op for compatibility
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
        
        const success = await this.setUserBalance(userId, guildId, newWallet, balance.bank);
        return [success, newWallet];
    }

    // ========================= LOTTERY OPERATIONS =========================

    /**
     * Get lottery information for a guild
     * @param {string} guildId - Guild ID
     * @returns {Object} Lottery information
     */
    async getLotteryInfo(guildId) {
        try {
            // Get main lottery data
            const lotteryRef = this.db.collection('lottery').doc(guildId);
            const lotteryDoc = await lotteryRef.get();
            
            // Get lottery data for participants
            const dataRef = this.db.collection('lottery_data').doc(guildId);
            const dataDoc = await dataRef.get();
            
            let lotteryData, participantData;
            
            if (lotteryDoc.exists) {
                lotteryData = lotteryDoc.data();
            } else {
                // Create default lottery data
                lotteryData = {
                    base_prize: 400000,
                    tax_pool: 0,
                    total_prize: 400000,
                    total_tickets: 0,
                    week_start: new Date()
                };
                await lotteryRef.set(lotteryData);
            }
            
            if (dataDoc.exists) {
                participantData = dataDoc.data();
            } else {
                // Create default participant data
                participantData = {
                    created_at: new Date(),
                    currentWeekStart: new Date(),
                    lastDrawing: null,
                    participants: {},
                    totalPrize: lotteryData.total_prize,
                    totalTickets: lotteryData.total_tickets,
                    updated_at: new Date()
                };
                await dataRef.set(participantData);
            }
            
            // Combine data for compatibility with existing code
            return {
                base_prize: lotteryData.base_prize,
                tax_pool: lotteryData.tax_pool,
                total_prize: lotteryData.total_prize,
                total_tickets: lotteryData.total_tickets,
                week_start: lotteryData.week_start,
                participants: participantData.participants || {},
                lastDrawing: participantData.lastDrawing,
                currentWeekStart: participantData.currentWeekStart,
                created_at: participantData.created_at,
                updated_at: participantData.updated_at
            };
        } catch (error) {
            logger.error(`Error getting lottery info: ${error.message}`);
            return {
                base_prize: 400000,
                tax_pool: 0,
                total_prize: 400000,
                total_tickets: 0,
                participants: {},
                lastDrawing: null
            };
        }
    }

    /**
     * Get user's lottery tickets for current week
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID
     * @returns {number} Number of tickets
     */
    async getUserLotteryTickets(userId, guildId) {
        try {
            // Get from lottery_tickets collection
            const ticketRef = this.db.collection('lottery_tickets').doc(`${guildId}_${userId}`);
            const ticketDoc = await ticketRef.get();
            
            if (ticketDoc.exists) {
                const data = ticketDoc.data();
                return data.tickets || 0;
            }
            
            return 0;
        } catch (error) {
            logger.error(`Error getting user lottery tickets: ${error.message}`);
            return 0;
        }
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
        try {
            // Start a transaction
            const userRef = this.db.collection('user_balances').doc(userId);
            const lotteryRef = this.db.collection('lottery').doc(guildId);
            const dataRef = this.db.collection('lottery_data').doc(guildId);
            const ticketRef = this.db.collection('lottery_tickets').doc(`${guildId}_${userId}`);

            await this.db.runTransaction(async (transaction) => {
                // Get current user balance
                const userDoc = await transaction.get(userRef);
                const userData = userDoc.data();
                
                if (!userData || userData.wallet < totalCost) {
                    throw new Error('Insufficient funds');
                }

                // Get current lottery data
                const lotteryDoc = await transaction.get(lotteryRef);
                const dataDoc = await transaction.get(dataRef);
                const ticketDoc = await transaction.get(ticketRef);
                
                const lotteryData = lotteryDoc.exists ? lotteryDoc.data() : {
                    base_prize: 400000,
                    tax_pool: 0,
                    total_prize: 400000,
                    total_tickets: 0,
                    week_start: new Date()
                };
                
                const participantData = dataDoc.exists ? dataDoc.data() : {
                    created_at: new Date(),
                    currentWeekStart: new Date(),
                    lastDrawing: null,
                    participants: {},
                    totalPrize: lotteryData.total_prize,
                    totalTickets: 0,
                    updated_at: new Date()
                };
                
                const currentUserTickets = ticketDoc.exists ? ticketDoc.data().tickets : 0;

                // Update user balance
                transaction.update(userRef, {
                    wallet: userData.wallet - totalCost,
                    updated_at: new Date()
                });

                // Update lottery collection
                lotteryData.total_tickets += ticketCount;
                transaction.set(lotteryRef, lotteryData, { merge: true });
                
                // Update lottery_data collection participants
                participantData.participants[userId] = (participantData.participants[userId] || 0) + ticketCount;
                participantData.totalTickets = lotteryData.total_tickets;
                participantData.totalPrize = lotteryData.total_prize;
                participantData.updated_at = new Date();
                transaction.set(dataRef, participantData, { merge: true });
                
                // Update lottery_tickets collection
                transaction.set(ticketRef, {
                    guild_id: guildId,
                    user_id: userId,
                    tickets: currentUserTickets + ticketCount,
                    last_updated: new Date()
                }, { merge: true });
            });

            logger.info(`User ${userId} purchased ${ticketCount} lottery tickets for ${totalCost}`);
            return true;
        } catch (error) {
            logger.error(`Error purchasing lottery tickets: ${error.message}`);
            return false;
        }
    }

    /**
     * Add money to lottery prize pool (from money transfer tax)
     * @param {string} guildId - Guild ID
     * @param {number} amount - Amount to add to prize pool
     * @returns {boolean} Success status
     */
    async addToLotteryPool(guildId, amount) {
        try {
            const lotteryRef = this.db.collection('lottery').doc(guildId);
            const dataRef = this.db.collection('lottery_data').doc(guildId);
            
            const lotteryInfo = await this.getLotteryInfo(guildId);
            
            // Update both collections in a transaction
            await this.db.runTransaction(async (transaction) => {
                const newTotalPrize = lotteryInfo.total_prize + amount;
                const newTaxPool = lotteryInfo.tax_pool + amount;
                
                // Update lottery collection
                transaction.update(lotteryRef, {
                    total_prize: newTotalPrize,
                    tax_pool: newTaxPool
                });
                
                // Update lottery_data collection
                transaction.update(dataRef, {
                    totalPrize: newTotalPrize,
                    updated_at: new Date()
                });
            });

            logger.info(`Added ${amount} to lottery pool for guild ${guildId}`);
            return true;
        } catch (error) {
            logger.error(`Error adding to lottery pool: ${error.message}`);
            return false;
        }
    }

    /**
     * Conduct lottery drawing and select winners
     * @param {string} guildId - Guild ID
     * @returns {Object} Drawing results
     */
    async conductLotteryDrawing(guildId) {
        try {
            const lotteryInfo = await this.getLotteryInfo(guildId);
            const participants = Object.keys(lotteryInfo.participants);
            
            if (participants.length < 3) {
                // Not enough participants, roll over prize to next week
                await this.resetLotteryWeek(guildId, false);
                return {
                    success: false,
                    reason: 'insufficient_participants',
                    participants: participants.length
                };
            }

            // Create weighted list based on ticket counts from lottery_tickets collection
            const weightedParticipants = [];
            
            // Get all lottery tickets for this guild
            const ticketsSnapshot = await this.db.collection('lottery_tickets')
                .where('guild_id', '==', guildId)
                .get();
                
            const ticketData = {};
            ticketsSnapshot.forEach(doc => {
                const data = doc.data();
                ticketData[data.user_id] = data.tickets;
                
                // Add user to weighted list based on ticket count
                for (let i = 0; i < data.tickets; i++) {
                    weightedParticipants.push(data.user_id);
                }
            });

            // Randomly select 3 winners (no duplicates)
            const winners = [];
            const usedParticipants = new Set();

            for (let i = 0; i < 3; i++) {
                let winner;
                let attempts = 0;
                
                do {
                    const randomIndex = Math.floor(Math.random() * weightedParticipants.length);
                    winner = weightedParticipants[randomIndex];
                    attempts++;
                } while (usedParticipants.has(winner) && attempts < 100);

                if (!usedParticipants.has(winner)) {
                    winners.push(winner);
                    usedParticipants.add(winner);
                }
            }

            // Calculate prizes
            const total_prize = lotteryInfo.total_prize;
            const prizes = {
                first: Math.floor(total_prize * 0.45),  // 45%
                second: Math.floor(total_prize * 0.45), // 45%
                third: Math.floor(total_prize * 0.10)   // 10%
            };

            // Distribute prizes to winners' bank accounts
            for (let i = 0; i < winners.length; i++) {
                const winnerId = winners[i];
                let prizeAmount;
                
                if (i === 0) prizeAmount = prizes.first;
                else if (i === 1) prizeAmount = prizes.second;
                else prizeAmount = prizes.third;

                // Add to winner's bank balance
                await this.updateUserBalance(winnerId, guildId, 0, prizeAmount);
            }

            // Reset lottery for next week
            await this.resetLotteryWeek(guildId, true);

            const results = {
                success: true,
                total_prize,
                winners: [
                    { userId: winners[0], prize: prizes.first, place: 1 },
                    { userId: winners[1], prize: prizes.second, place: 2 },
                    { userId: winners[2], prize: prizes.third, place: 3 }
                ],
                totalParticipants: participants.length,
                total_tickets: lotteryInfo.total_tickets,
                drawingDate: new Date()
            };

            logger.info(`Lottery drawing completed for guild ${guildId}: ${JSON.stringify(results)}`);
            return results;
        } catch (error) {
            logger.error(`Error conducting lottery drawing: ${error.message}`);
            return { success: false, reason: 'error', error: error.message };
        }
    }

    /**
     * Reset lottery for new week
     * @param {string} guildId - Guild ID
     * @param {boolean} hadWinners - Whether there were winners (affects prize rollover)
     * @returns {boolean} Success status
     */
    async resetLotteryWeek(guildId, hadWinners = true) {
        try {
            const lotteryRef = this.db.collection('lottery').doc(guildId);
            const dataRef = this.db.collection('lottery_data').doc(guildId);
            const currentInfo = await this.getLotteryInfo(guildId);
            
            // Reset in a transaction
            await this.db.runTransaction(async (transaction) => {
                const newTotalPrize = hadWinners ? (currentInfo.base_prize + currentInfo.tax_pool) : currentInfo.total_prize;
                const newTaxPool = hadWinners ? 0 : currentInfo.tax_pool; // Reset tax pool if there were winners
                
                // Update lottery collection
                transaction.set(lotteryRef, {
                    base_prize: currentInfo.base_prize,
                    tax_pool: newTaxPool,
                    total_prize: newTotalPrize,
                    total_tickets: 0,
                    week_start: new Date()
                }, { merge: true });
                
                // Update lottery_data collection
                transaction.set(dataRef, {
                    participants: {},
                    totalPrize: newTotalPrize,
                    totalTickets: 0,
                    currentWeekStart: new Date(),
                    lastDrawing: hadWinners ? new Date() : currentInfo.lastDrawing,
                    updated_at: new Date()
                }, { merge: true });
            });
            
            // Clear all lottery tickets for this guild
            const ticketsSnapshot = await this.db.collection('lottery_tickets')
                .where('guild_id', '==', guildId)
                .get();
                
            const batch = this.db.batch();
            ticketsSnapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            
            logger.info(`Lottery week reset for guild ${guildId}, hadWinners: ${hadWinners}`);
            return true;
        } catch (error) {
            logger.error(`Error resetting lottery week: ${error.message}`);
            return false;
        }
    }

    /**
     * Get lottery drawing history
     * @param {string} guildId - Guild ID
     * @param {number} limit - Number of recent drawings to fetch
     * @returns {Array} Array of drawing results
     */
    async getLotteryHistory(guildId, limit = 10) {
        try {
            const snapshot = await this.db
                .collection('lottery_history')
                .where('guildId', '==', guildId)
                .orderBy('drawingDate', 'desc')
                .limit(limit)
                .get();
            
            const history = [];
            snapshot.forEach(doc => {
                history.push({ id: doc.id, ...doc.data() });
            });
            
            return history;
        } catch (error) {
            logger.error(`Error getting lottery history: ${error.message}`);
            return [];
        }
    }

    /**
     * Save lottery drawing results to history
     * @param {string} guildId - Guild ID
     * @param {Object} results - Drawing results
     * @returns {boolean} Success status
     */
    async saveLotteryHistory(guildId, results) {
        try {
            const docRef = this.db.collection('lottery_history').doc();
            await docRef.set({
                guildId,
                ...results,
                saved_at: new Date()
            });
            
            logger.info(`Lottery history saved for guild ${guildId}`);
            return true;
        } catch (error) {
            logger.error(`Error saving lottery history: ${error.message}`);
            return false;
        }
    }

    // ========================= BACKUP OPERATIONS =========================

    /**
     * Create a backup of all database collections
     * @returns {Object} Backup data with record count
     */
    async createBackup() {
        try {
            const backup = {
                timestamp: new Date().toISOString(),
                user_balances: {},
                user_stats: {},
                recordCount: 0
            };

            // Backup user balances
            const balancesSnapshot = await this.db.collection('user_balances').get();
            balancesSnapshot.forEach(doc => {
                backup.user_balances[doc.id] = doc.data();
                backup.recordCount++;
            });

            // Backup user stats
            const statsSnapshot = await this.db.collection('user_stats').get();
            statsSnapshot.forEach(doc => {
                backup.user_stats[doc.id] = doc.data();
                backup.recordCount++;
            });

            logger.info(`Database backup created with ${backup.recordCount} records`);
            return backup;
        } catch (error) {
            logger.error(`Error creating database backup: ${error.message}`);
            throw error;
        }
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
}

// Export singleton instance
module.exports = new DatabaseManager();