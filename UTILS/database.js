/**
 * Firebase Database Management for ATIVE Casino Bot
 * Firebase Firestore-based persistent storage for user data, server configurations, and game stats
 */

const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const firebaseConfig = require('./firebase');
const logger = require('./logger');
const { secureRandomInt } = require('./rng');

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
     * Get user's most recent game activity across all games
     */
    async getUserLastActivity(userId, guildId = null) {
        try {
            const snapshot = await this.db.collection('user_stats')
                .where('user_id', '==', userId)
                .orderBy('last_game_played', 'desc')
                .limit(1)
                .get();

            if (snapshot.empty) {
                return null;
            }

            const doc = snapshot.docs[0];
            const data = doc.data();
            
            return {
                lastGamePlayed: data.last_game_played?.toDate() || null,
                gameType: data.game_type,
                updatedAt: data.updated_at?.toDate() || null
            };
        } catch (error) {
            logger.error(`Error getting user last activity: ${error.message}`);
            return null;
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
     * @param {Object} userProfile - Optional user profile data for updating
     * @returns {boolean} Success status
     */
    async updateUserStats(userId, guildId = null, gameType = null, win = null, wagered = 0, result = 0, userProfile = null) {
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
                updated_at: new Date(),
                last_game_played: new Date() // Track when user last played any game
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
            
            // Also update global user stats for leaderboard
            await this.updateGlobalUserStats(userId, win, result);
            
            // Update user profile if provided (capture Discord info for leaderboards)
            if (userProfile) {
                await this.updateUserProfile(userId, userProfile);
            }
            
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
        // Update username if provided
        if (username) {
            await this.updateUsername(userId, username);
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
                    const randomIndex = secureRandomInt(0, weightedParticipants.length);
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

    // ========================= LEADERBOARD OPERATIONS =========================

    /**
     * Get top users by total balance (wallet + bank) with usernames
     * @param {string} guildId - Guild ID
     * @param {number} limit - Number of users to return
     * @returns {Array} Array of user balance data with usernames
     */
    async getTopUsersByBalance(guildId, limit = 10) {
        try {
            // Get all user balances
            const balancesSnapshot = await this.db.collection('user_balances')
                .orderBy('updated_at', 'desc')
                .limit(Math.min(limit * 2, 100)) // Get more than needed in case some have 0 balance
                .get();
            
            const users = [];
            
            for (const doc of balancesSnapshot.docs) {
                const data = doc.data();
                const totalBalance = (parseFloat(data.wallet) || 0) + (parseFloat(data.bank) || 0);
                
                if (totalBalance > 0) { // Only include users with positive balance
                    users.push({
                        user_id: doc.id,
                        username: data.username || null, // Keep null to trigger Discord lookup
                        wallet: parseFloat(data.wallet) || 0,
                        bank: parseFloat(data.bank) || 0,
                        total_balance: totalBalance,
                        updated_at: data.updated_at
                    });
                }
            }
            
            // Sort by total balance (descending)
            users.sort((a, b) => b.total_balance - a.total_balance);
            
            return users.slice(0, limit);
        } catch (error) {
            logger.error(`Error getting top users by balance: ${error.message}`);
            return [];
        }
    }

    // ========================= POLL OPERATIONS =========================

    /**
     * Store a new poll document
     * @param {string} pollId - Poll ID
     * @param {Object} pollData - Poll payload
     * @returns {boolean} Success status
     */
    async storePoll(pollId, pollData) {
        try {
            const docRef = this.db.collection('polls').doc(pollId);
            await docRef.set({
                ...pollData,
                created_at: pollData.created_at ? new Date(pollData.created_at) : new Date(),
                updated_at: new Date()
            }, { merge: true });
            logger.info(`Stored poll ${pollId}`);
            return true;
        } catch (error) {
            logger.error(`Error storing poll ${pollId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Update poll votes
     * @param {string} pollId - Poll ID
     * @param {Object} votes - Votes map
     * @returns {boolean} Success status
     */
    async updatePollVotes(pollId, votes) {
        try {
            const docRef = this.db.collection('polls').doc(pollId);
            await docRef.set({ votes, updated_at: new Date() }, { merge: true });
            return true;
        } catch (error) {
            logger.error(`Error updating poll votes for ${pollId}: ${error.message}`);
            return false;
        }
    }

    /**
     * End a poll (set active=false)
     * @param {string} pollId - Poll ID
     * @returns {boolean} Success status
     */
    async endPoll(pollId) {
        try {
            const docRef = this.db.collection('polls').doc(pollId);
            await docRef.set({ active: false, ended_at: new Date(), updated_at: new Date() }, { merge: true });
            logger.info(`Ended poll ${pollId}`);
            return true;
        } catch (error) {
            logger.error(`Error ending poll ${pollId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Get top users by wins with game statistics
     * Aggregates across per-game docs, falling back to global totals when present.
     * @param {string} guildId - Guild ID (kept for API compatibility)
     * @param {number} limit - Number of users to return
     * @returns {Array} Array of user game statistics
     */
    async getTopUsersByWins(guildId, limit = 10) {
        try {
            // Fetch a broad slice of stats to aggregate. We avoid orderBy to include per-game docs.
            const statsSnapshot = await this.db.collection('user_stats')
                .limit(500)
                .get();

            const aggregate = new Map(); // userId -> { wins, losses, username, hasGlobal }

            for (const doc of statsSnapshot.docs) {
                const data = doc.data() || {};

                // Determine if this is a global stats doc (doc.id is the userId) or a per-game doc (id includes '_')
                const isPerGame = Boolean(data.game_type) || doc.id.includes('_');

                if (isPerGame) {
                    const userId = data.user_id || (doc.id.split('_')[0] || null);
                    if (!userId) continue;

                    const wins = parseInt(data.wins) || 0;
                    const losses = parseInt(data.losses) || 0;

                    if (!aggregate.has(userId)) {
                        aggregate.set(userId, { wins: 0, losses: 0, username: data.username || null, hasGlobal: false });
                    }
                    const entry = aggregate.get(userId);
                    entry.wins += wins;
                    entry.losses += losses;
                    if (!entry.username && data.username) entry.username = data.username;
                } else {
                    // Global totals
                    const userId = doc.id;
                    const totalWins = parseInt(data.total_wins) || 0;
                    const totalLosses = parseInt(data.total_losses) || 0;

                    if (!aggregate.has(userId)) {
                        aggregate.set(userId, { wins: 0, losses: 0, username: data.username || null, hasGlobal: false });
                    }
                    const entry = aggregate.get(userId);
                    entry.wins = totalWins; // Prefer global
                    entry.losses = totalLosses;
                    entry.username = entry.username || data.username || null;
                    entry.hasGlobal = true;
                }
            }

            // Build array and compute totals
            const users = [];
            for (const [userId, entry] of aggregate.entries()) {
                const totalWins = entry.wins || 0;
                const totalLosses = entry.losses || 0;
                if (totalWins > 0 || totalLosses > 0) {
                    users.push({
                        user_id: userId,
                        username: entry.username || null,
                        total_wins: totalWins,
                        total_losses: totalLosses,
                        total_games: totalWins + totalLosses,
                        win_rate: totalWins + totalLosses > 0 ? (totalWins / (totalWins + totalLosses)) * 100 : 0
                    });
                }
            }

            // Sort by wins desc, then win rate desc
            users.sort((a, b) => {
                if (b.total_wins !== a.total_wins) return b.total_wins - a.total_wins;
                return b.win_rate - a.win_rate;
            });

            return users.slice(0, limit);
        } catch (error) {
            logger.error(`Error getting top users by wins: ${error.message}`);
            return [];
        }
    }

    /**
     * Update global user statistics for leaderboard
     * @param {string} userId - Discord user ID
     * @param {boolean} win - Whether the game was won
     * @param {number} result - Game result amount
     * @returns {boolean} Success status
     */
    async updateGlobalUserStats(userId, win, result) {
        try {
            const docRef = this.db.collection('user_stats').doc(userId);
            
            // Get current stats or create new
            const doc = await docRef.get();
            const currentStats = doc.exists ? doc.data() : {
                total_wins: 0,
                total_losses: 0,
                total_games_played: 0,
                total_winnings: 0,
                total_losses_amount: 0,
                created_at: new Date()
            };
            
            // Update stats
            const updateData = {
                total_games_played: (currentStats.total_games_played || 0) + 1,
                updated_at: new Date()
            };
            
            if (win) {
                updateData.total_wins = (currentStats.total_wins || 0) + 1;
                updateData.total_winnings = (currentStats.total_winnings || 0) + result;
            } else {
                updateData.total_losses = (currentStats.total_losses || 0) + 1;
                updateData.total_losses_amount = (currentStats.total_losses_amount || 0) + Math.abs(result);
            }
            
            // Preserve existing fields
            updateData.total_wins = updateData.total_wins || currentStats.total_wins || 0;
            updateData.total_losses = updateData.total_losses || currentStats.total_losses || 0;
            updateData.total_winnings = updateData.total_winnings || currentStats.total_winnings || 0;
            updateData.total_losses_amount = updateData.total_losses_amount || currentStats.total_losses_amount || 0;
            updateData.created_at = currentStats.created_at || new Date();
            
            await docRef.set(updateData, { merge: true });
            
            return true;
        } catch (error) {
            logger.error(`Error updating global user stats for ${userId}: ${error.message}`);
            return false;
        }
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
        try {
            const docRef = this.db.collection('user_stats').doc(userId);
            
            // Get current stats or create new
            const doc = await docRef.get();
            const currentStats = doc.exists ? doc.data() : {
                total_wins: 0,
                total_losses: 0,
                total_games_played: 0,
                total_winnings: 0,
                total_losses_amount: 0,
                games_by_type: {},
                created_at: new Date()
            };
            
            // Update stats
            const updateData = {
                total_games_played: (currentStats.total_games_played || 0) + 1,
                updated_at: new Date(),
                username: currentStats.username || 'Unknown' // Preserve username if exists
            };
            
            if (won) {
                updateData.total_wins = (currentStats.total_wins || 0) + 1;
                updateData.total_winnings = (currentStats.total_winnings || 0) + amount;
            } else {
                updateData.total_losses = (currentStats.total_losses || 0) + 1;
                updateData.total_losses_amount = (currentStats.total_losses_amount || 0) + amount;
            }
            
            // Update game type stats
            const gameStats = currentStats.games_by_type || {};
            if (!gameStats[gameType]) {
                gameStats[gameType] = { wins: 0, losses: 0, total: 0 };
            }
            
            if (won) {
                gameStats[gameType].wins++;
            } else {
                gameStats[gameType].losses++;
            }
            gameStats[gameType].total++;
            
            updateData.games_by_type = gameStats;
            
            // Use set to create or update the document
            await docRef.set({ ...currentStats, ...updateData }, { merge: true });
            
            logger.info(`Updated game stats for user ${userId}: ${won ? 'win' : 'loss'} in ${gameType}`);
            return true;
        } catch (error) {
            logger.error(`Error updating game stats: ${error.message}`);
            return false;
        }
    }

    /**
     * Update username in user records (called when user uses commands)
     * @param {string} userId - Discord user ID
     * @param {string} username - Discord username
     */
    async updateUsername(userId, username) {
        try {
            // Update in balances collection
            const balanceRef = this.db.collection('user_balances').doc(userId);
            await balanceRef.set({ username }, { merge: true });
            
            // Update in stats collection if it exists
            const statsRef = this.db.collection('user_stats').doc(userId);
            const statsDoc = await statsRef.get();
            if (statsDoc.exists) {
                await statsRef.set({ username }, { merge: true });
            }
            
            return true;
        } catch (error) {
            logger.error(`Error updating username: ${error.message}`);
            return false;
        }
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
        const fallbackAvatarUrl = 'https://images.pexels.com/photos/1759531/pexels-photo-1759531.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500';
        
        try {
            // Construct avatar URL if needed
            let avatarUrl = fallbackAvatarUrl;
            
            if (profileData.avatar) {
                if (profileData.avatar.startsWith('https://')) {
                    avatarUrl = profileData.avatar;
                } else {
                    avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${profileData.avatar}.png?size=256`;
                }
            }
            
            const profileUpdateData = {
                username: profileData.username || null,
                displayName: profileData.displayName || profileData.username || null,
                avatarUrl: avatarUrl,
                lastProfileUpdate: new Date(),
                updated_at: new Date()
            };
            
            // Update in user_profiles collection for leaderboard use
            const profileRef = this.db.collection('user_profiles').doc(userId);
            await profileRef.set(profileUpdateData, { merge: true });
            
            // Also update username in balances collection for compatibility
            if (profileData.username) {
                const balanceRef = this.db.collection('user_balances').doc(userId);
                await balanceRef.set({ username: profileData.username }, { merge: true });
            }
            
            logger.info(`Updated profile for user ${userId}: ${profileData.username}`);
            return true;
        } catch (error) {
            logger.error(`Error updating user profile for ${userId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Get user profile data
     * @param {string} userId - Discord user ID
     * @returns {Object} User profile data
     */
    async getUserProfile(userId) {
        const fallbackAvatarUrl = 'https://images.pexels.com/photos/1759531/pexels-photo-1759531.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500';
        
        try {
            const profileRef = this.db.collection('user_profiles').doc(userId);
            const profileDoc = await profileRef.get();
            
            if (profileDoc.exists) {
                const data = profileDoc.data();
                return {
                    userId: userId,
                    username: data.username || 'Unknown User',
                    displayName: data.displayName || data.username || 'Unknown User',
                    avatarUrl: data.avatarUrl || fallbackAvatarUrl,
                    lastProfileUpdate: data.lastProfileUpdate || null
                };
            } else {
                // Return default profile with fallback avatar
                return {
                    userId: userId,
                    username: 'Unknown User',
                    displayName: 'Unknown User',
                    avatarUrl: fallbackAvatarUrl,
                    lastProfileUpdate: null
                };
            }
        } catch (error) {
            logger.error(`Error getting user profile for ${userId}: ${error.message}`);
            return {
                userId: userId,
                username: 'Unknown User',
                displayName: 'Unknown User',
                avatarUrl: fallbackAvatarUrl,
                lastProfileUpdate: null
            };
        }
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
        try {
            const balanceRef = this.db.collection('user_balances').doc(userId);
            await balanceRef.set({
                wallet: 1000, // Default starting amount
                bank: 0,
                updated_at: new Date(),
                resetCount: admin.firestore.FieldValue.increment(1),
                resetAt: new Date(),
                guildId: guildId
            }, { merge: true });
            
            logger.info(`Reset balance for user ${userId} in guild ${guildId}`);
            return true;
        } catch (error) {
            logger.error(`Error resetting user balance: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get game statistics for a guild
     */
    async getGameStatistics(guildId) {
        try {
            // This is a placeholder implementation
            // In a real implementation, you'd query game logs/results
            
            const usersSnapshot = await this.db
                .collection('user_balances')
                .limit(100)
                .get();

            let totalGames = 0;
            let totalWinnings = 0;
            let activePlayers = 0;

            usersSnapshot.forEach(doc => {
                const data = doc.data();
                // Count as active if played recently (last update within 30 days)
                const lastUpdate = data.updated_at?.toDate() || new Date(0);
                const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                if (lastUpdate > thirtyDaysAgo) activePlayers++;
                
                // Simulate totals (replace with real game log queries)
                totalGames += 1;
                totalWinnings += (data.wallet || 0) - 1000; // Assuming 1000 starting balance
            });

            // Simulate popular game detection (replace with real data)
            const popularGame = totalGames > 0 ? 'Blackjack' : 'None';
            const revenue = Math.floor(totalWinnings * 0.05); // 5% house edge simulation
            const houseEdge = totalGames > 0 ? '5.2%' : 'N/A';

            return {
                totalGames,
                totalWinnings,
                popularGame,
                activePlayers,
                revenue,
                houseEdge
            };
        } catch (error) {
            logger.error(`Error getting game statistics: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get all users for a guild (for admin purposes)
     */
    async getAllUsers(guildId) {
        try {
            const snapshot = await this.db
                .collection('user_balances')
                .limit(100)
                .get();

            const users = [];
            snapshot.forEach(doc => {
                users.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            return users;
        } catch (error) {
            logger.error(`Error getting all users: ${error.message}`);
            throw error;
        }
    }

    /**
     * Log admin/moderator actions for audit trail
     */
    async logAdminAction(userId, guildId, action, details, moderatorId) {
        try {
            await this.db.collection('admin_logs').add({
                userId,
                guildId,
                action,
                details,
                moderatorId,
                timestamp: new Date(),
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            logger.info(`Logged admin action: ${action} by ${moderatorId} for user ${userId}`);
            return true;
        } catch (error) {
            logger.error(`Error logging admin action: ${error.message}`);
            return false;
        }
    }

    /**
     * Store user warning
     */
    async addUserWarning(userId, guildId, message, moderatorId) {
        try {
            await this.db.collection('user_warnings').add({
                userId,
                guildId,
                message,
                moderatorId,
                timestamp: new Date(),
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            logger.info(`Added warning for user ${userId} by ${moderatorId}`);
            return true;
        } catch (error) {
            logger.error(`Error adding user warning: ${error.message}`);
            return false;
        }
    }

    /**
     * Store temporary game ban
     */
    async addGameBan(userId, guildId, duration, reason, moderatorId) {
        try {
            const expiry = new Date(Date.now() + duration * 60 * 60 * 1000);
            
            await this.db.collection('game_bans').add({
                userId,
                guildId,
                duration,
                reason,
                moderatorId,
                expiry: expiry,
                active: true,
                timestamp: new Date(),
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            logger.info(`Added game ban for user ${userId} by ${moderatorId} (${duration}h)`);
            return true;
        } catch (error) {
            logger.error(`Error adding game ban: ${error.message}`);
            return false;
        }
    }

    /**
     * Check if user is currently banned from games
     */
    async isUserBannedFromGames(userId, guildId) {
        try {
            const snapshot = await this.db
                .collection('game_bans')
                .where('userId', '==', userId)
                .where('guildId', '==', guildId)
                .where('active', '==', true)
                .where('expiry', '>', new Date())
                .get();

            return !snapshot.empty;
        } catch (error) {
            logger.error(`Error checking game ban: ${error.message}`);
            return false; // Default to not banned if error
        }
    }

    // ========================= SERVER CONFIGURATION OPERATIONS =========================

    /**
     * Get server configuration from Firestore
     * @param {string} serverId - Discord guild ID
     * @returns {Object|null} Server configuration data
     */
    async getServerConfig(serverId) {
        try {
            const docRef = this.db.collection('server_config').doc(serverId);
            const doc = await docRef.get();
            
            if (doc.exists) {
                return doc.data();
            }
            
            return null;
        } catch (error) {
            logger.error(`Error getting server config: ${error.message}`);
            return null;
        }
    }

    /**
     * Save server configuration to Firestore
     * @param {string} serverId - Discord guild ID  
     * @param {Object} configData - Configuration data
     * @returns {boolean} Success status
     */
    async saveServerConfig(serverId, configData) {
        try {
            const docRef = this.db.collection('server_config').doc(serverId);
            
            const serverConfig = {
                serverId,
                serverName: configData.serverName,
                settings: configData.settings || {},
                channels: {
                    gamesChannelId: configData.channels?.gamesChannelId || null,
                    logsChannelId: configData.channels?.logsChannelId || null,
                    adminChannelId: configData.channels?.adminChannelId || null
                },
                roles: {
                    adminRoles: configData.roles?.adminRoles || [],
                    moderatorRoles: configData.roles?.moderatorRoles || []
                },
                economy: {
                    startingBalance: configData.economy?.startingBalance || 1000,
                    dailyBonus: configData.economy?.dailyBonus || 100,
                    currencySymbol: configData.economy?.currencySymbol || '🪙',
                    currencyName: configData.economy?.currencyName || 'coins',
                    minBet: configData.economy?.minBet || 10,
                    maxBet: configData.economy?.maxBet || 10000
                },
                games: {
                    casino: configData.games?.casino || ['slots', 'blackjack', 'fishing', 'plinko'],
                    miniGames: configData.games?.miniGames || ['uno', 'duckhunt', 'rps'],
                    strategy: configData.games?.strategy || ['battleship'],
                    maxConcurrentGames: configData.games?.maxConcurrentGames || 3,
                    houseEdge: configData.games?.houseEdge || 2
                },
                security: {
                    maxBetsPerHour: configData.security?.maxBetsPerHour || 100,
                    suspiciousThreshold: configData.security?.suspiciousThreshold || 50,
                    minAccountAge: configData.security?.minAccountAge || 7,
                    muteDuration: configData.security?.muteDuration || 5,
                    banThreshold: configData.security?.banThreshold || 3,
                    loggingEnabled: configData.security?.loggingEnabled !== false
                },
                setupComplete: configData.setupComplete || false,
                setupDate: configData.setupDate || new Date().toISOString(),
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now()
            };

            await docRef.set(serverConfig);
            logger.info(`Server configuration saved for guild ${serverId} (${configData.serverName})`);
            return true;
        } catch (error) {
            logger.error(`Error saving server config: ${error.message}`);
            return false;
        }
    }

    /**
     * Update specific server configuration fields
     * @param {string} serverId - Discord guild ID
     * @param {Object} updates - Fields to update
     * @returns {boolean} Success status
     */
    async updateServerConfig(serverId, updates) {
        try {
            const docRef = this.db.collection('server_config').doc(serverId);
            
            const updateData = {
                ...updates,
                updatedAt: Timestamp.now()
            };

            await docRef.update(updateData);
            logger.info(`Server configuration updated for guild ${serverId}`);
            return true;
        } catch (error) {
            logger.error(`Error updating server config: ${error.message}`);
            return false;
        }
    }

    /**
     * Delete server configuration
     * @param {string} serverId - Discord guild ID
     * @returns {boolean} Success status
     */
    async deleteServerConfig(serverId) {
        try {
            const docRef = this.db.collection('server_config').doc(serverId);
            await docRef.delete();
            
            logger.info(`Server configuration deleted for guild ${serverId}`);
            return true;
        } catch (error) {
            logger.error(`Error deleting server config: ${error.message}`);
            return false;
        }
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
}

// Export singleton instance
module.exports = new DatabaseManager();
