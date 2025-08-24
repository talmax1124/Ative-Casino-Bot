/**
 * Economy Data Generator - Creates sample data for fraud detection training
 * Generates realistic user behavior patterns and known fraud cases
 */

const dbManager = require('./database');
const logger = require('./logger');
const { secureRandomInt, secureRandomFloat } = require('./rng');

class EconomyDataGenerator {
    constructor() {
        this.gameTypes = ['blackjack', 'slots', 'plinko', 'crash', 'roulette'];
        this.normalBehaviorPatterns = {
            avgBetSize: [100, 500, 1000, 2500, 5000],
            winRates: [0.35, 0.40, 0.45, 0.48, 0.52], // Realistic win rates
            sessionLengths: [10, 25, 50, 100, 200], // Number of games per session
            timeBetweenGames: [30, 60, 120, 300, 600], // Seconds between games
            gamePreferences: ['balanced', 'slots_heavy', 'blackjack_heavy', 'mixed', 'conservative']
        };
        this.fraudPatterns = {
            avgBetSize: [10000, 25000, 50000, 100000], // Unusually large bets
            winRates: [0.75, 0.85, 0.90, 0.95], // Impossibly high win rates
            sessionLengths: [500, 1000, 2000, 5000], // Marathon sessions
            timeBetweenGames: [5, 10, 15, 20], // Bot-like rapid play
            gamePreferences: ['exploit_focused', 'high_variance_only', 'coordinated']
        };
    }

    /**
     * Generate comprehensive sample data for economy monitor training
     */
    async generateSampleData(options = {}) {
        const {
            normalUsers = 100,
            fraudUsers = 20,
            daysOfHistory = 30,
            clearExisting = false
        } = options;

        try {
            logger.info(`Economy Data Generator: Starting data generation (${normalUsers} normal, ${fraudUsers} fraud users)`);

            if (clearExisting) {
                await this.clearExistingData();
            }

            // Generate normal user data
            const normalUserData = await this.generateNormalUsers(normalUsers, daysOfHistory);
            
            // Generate fraud case data
            const fraudUserData = await this.generateFraudUsers(fraudUsers, daysOfHistory);

            // Generate economy snapshots
            await this.generateEconomySnapshots(daysOfHistory);

            // Generate user balances
            await this.generateUserBalances([...normalUserData, ...fraudUserData]);

            logger.info(`Economy Data Generator: Generated complete dataset successfully`);

            return {
                normalUsers: normalUserData.length,
                fraudUsers: fraudUserData.length,
                totalTransactions: normalUserData.reduce((sum, u) => sum + u.transactions.length, 0) + 
                                 fraudUserData.reduce((sum, u) => sum + u.transactions.length, 0),
                economySnapshots: daysOfHistory * 24, // Hourly snapshots
                status: 'success'
            };

        } catch (error) {
            logger.error(`Economy Data Generator: Error generating data: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate normal user behavior patterns
     */
    async generateNormalUsers(count, days) {
        const users = [];
        const now = Date.now();

        for (let i = 0; i < count; i++) {
            const userId = `normal_user_${i}_${Date.now()}_${secureRandomInt(1000, 9999)}`;
            const pattern = this.selectRandomPattern(this.normalBehaviorPatterns);
            
            const userData = {
                userId,
                type: 'normal',
                pattern,
                transactions: [],
                behaviorProfile: this.generateBehaviorProfile('normal', pattern),
                createdAt: now - (days * 24 * 60 * 60 * 1000) + secureRandomInt(0, days * 24 * 60 * 60 * 1000)
            };

            // Generate transaction history
            userData.transactions = this.generateTransactionHistory(userData, days, 'normal');

            users.push(userData);

            // Save to Firebase
            await this.saveUserData(userData);
        }

        logger.info(`Economy Data Generator: Generated ${count} normal users`);
        return users;
    }

    /**
     * Generate fraudulent user behavior patterns
     */
    async generateFraudUsers(count, days) {
        const users = [];
        const now = Date.now();

        for (let i = 0; i < count; i++) {
            const userId = `fraud_user_${i}_${Date.now()}_${secureRandomInt(1000, 9999)}`;
            const pattern = this.selectRandomPattern(this.fraudPatterns);
            
            const userData = {
                userId,
                type: 'fraud',
                pattern,
                transactions: [],
                behaviorProfile: this.generateBehaviorProfile('fraud', pattern),
                createdAt: now - (days * 24 * 60 * 60 * 1000) + secureRandomInt(0, days * 24 * 60 * 60 * 1000),
                fraudType: this.selectFraudType()
            };

            // Generate transaction history
            userData.transactions = this.generateTransactionHistory(userData, days, 'fraud');

            users.push(userData);

            // Save to Firebase as confirmed fraud case
            await this.saveFraudCase(userData);
        }

        logger.info(`Economy Data Generator: Generated ${count} fraud users`);
        return users;
    }

    /**
     * Generate realistic transaction history
     */
    generateTransactionHistory(userData, days, userType) {
        const transactions = [];
        const now = Date.now();
        const startTime = now - (days * 24 * 60 * 60 * 1000);
        
        let currentTime = startTime + secureRandomInt(0, 24 * 60 * 60 * 1000);
        let currentBalance = secureRandomInt(1000, 10000); // Starting balance
        
        const sessionCount = userType === 'normal' 
            ? secureRandomInt(5, 30) 
            : secureRandomInt(20, 100);

        for (let session = 0; session < sessionCount && currentTime < now; session++) {
            const sessionLength = userType === 'normal'
                ? userData.pattern.sessionLengths[secureRandomInt(0, userData.pattern.sessionLengths.length)]
                : userData.pattern.sessionLengths[secureRandomInt(0, userData.pattern.sessionLengths.length)];

            for (let game = 0; game < sessionLength && currentTime < now; game++) {
                const transaction = this.generateTransaction(userData, currentTime, currentBalance, userType);
                if (transaction) {
                    transactions.push(transaction);
                    currentBalance += transaction.amount;
                    
                    // Ensure balance doesn't go negative
                    if (currentBalance < 0) {
                        currentBalance = secureRandomInt(100, 1000);
                    }
                }

                // Time between games
                const timeBetween = userType === 'normal'
                    ? userData.pattern.timeBetweenGames[secureRandomInt(0, userData.pattern.timeBetweenGames.length)] * 1000
                    : userData.pattern.timeBetweenGames[secureRandomInt(0, userData.pattern.timeBetweenGames.length)] * 1000;

                currentTime += timeBetween + secureRandomInt(-timeBetween * 0.3, timeBetween * 0.3);
            }

            // Break between sessions (hours)
            currentTime += secureRandomInt(1, 12) * 60 * 60 * 1000;
        }

        return transactions.sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Generate individual transaction
     */
    generateTransaction(userData, timestamp, currentBalance, userType) {
        const gameType = this.gameTypes[secureRandomInt(0, this.gameTypes.length)];
        
        let betSize = userType === 'normal'
            ? userData.pattern.avgBetSize[secureRandomInt(0, userData.pattern.avgBetSize.length)]
            : userData.pattern.avgBetSize[secureRandomInt(0, userData.pattern.avgBetSize.length)];

        // Add randomness to bet size
        betSize = Math.floor(betSize * (0.5 + secureRandomFloat() * 1.5));
        
        // Don't bet more than balance allows
        betSize = Math.min(betSize, currentBalance * 0.5);
        if (betSize <= 0) return null;

        const winRate = userType === 'normal'
            ? userData.pattern.winRates[secureRandomInt(0, userData.pattern.winRates.length)]
            : userData.pattern.winRates[secureRandomInt(0, userData.pattern.winRates.length)];

        const won = secureRandomFloat() < winRate;
        const winMultiplier = this.getGameWinMultiplier(gameType, won);
        const winnings = won ? Math.floor(betSize * winMultiplier) : 0;
        const netAmount = winnings - betSize;

        return {
            timestamp,
            userId: userData.userId,
            game: gameType,
            betAmount: betSize,
            won,
            winnings,
            amount: netAmount,
            multiplier: winMultiplier,
            metadata: {
                userType,
                sessionId: `session_${Math.floor(timestamp / (60 * 60 * 1000))}`,
                fraudPattern: userData.fraudType || 'none'
            }
        };
    }

    /**
     * Get realistic win multipliers for different games
     */
    getGameWinMultiplier(gameType, won) {
        if (!won) return 0;

        const multipliers = {
            blackjack: [1.5, 2.0, 2.5], // Normal blackjack payouts
            slots: [1.2, 1.5, 2.0, 3.0, 5.0, 10.0, 25.0], // Various slot payouts
            plinko: [0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0, 25.0], // Plinko multipliers
            crash: [1.1, 1.5, 2.0, 3.0, 5.0, 10.0], // Crash multipliers
            roulette: [1.0, 2.0, 35.0] // Even money, red/black, single number
        };

        const gameMultipliers = multipliers[gameType] || [1.5, 2.0];
        return gameMultipliers[secureRandomInt(0, gameMultipliers.length)];
    }

    /**
     * Generate behavior profile for ML training
     */
    generateBehaviorProfile(userType, pattern) {
        return {
            avgBetSize: pattern.avgBetSize[0],
            preferredGames: this.selectPreferredGames(pattern.gamePreferences[0]),
            playStyle: userType === 'normal' ? 'casual' : 'aggressive',
            riskTolerance: userType === 'normal' ? 'moderate' : 'high',
            activityLevel: userType === 'normal' ? 'regular' : 'intense',
            consistency: userType === 'normal' ? secureRandomFloat() * 0.3 + 0.5 : secureRandomFloat() * 0.2 + 0.8
        };
    }

    /**
     * Select preferred games based on pattern
     */
    selectPreferredGames(preference) {
        const preferences = {
            balanced: ['blackjack', 'slots', 'plinko'],
            slots_heavy: ['slots', 'plinko', 'crash'],
            blackjack_heavy: ['blackjack', 'roulette'],
            mixed: this.gameTypes,
            conservative: ['blackjack', 'roulette'],
            exploit_focused: ['plinko', 'crash'], // Fraud pattern
            high_variance_only: ['crash', 'plinko'], // Fraud pattern
            coordinated: ['slots', 'plinko'] // Fraud pattern
        };

        return preferences[preference] || preferences.balanced;
    }

    /**
     * Select fraud type
     */
    selectFraudType() {
        const fraudTypes = [
            'bot_automation',
            'win_rate_manipulation',
            'coordinated_activity',
            'exploit_abuse',
            'rapid_scaling',
            'timing_manipulation'
        ];
        
        return fraudTypes[secureRandomInt(0, fraudTypes.length)];
    }

    /**
     * Select random pattern from available patterns
     */
    selectRandomPattern(patterns) {
        return {
            avgBetSize: [patterns.avgBetSize[secureRandomInt(0, patterns.avgBetSize.length)]],
            winRates: [patterns.winRates[secureRandomInt(0, patterns.winRates.length)]],
            sessionLengths: [patterns.sessionLengths[secureRandomInt(0, patterns.sessionLengths.length)]],
            timeBetweenGames: [patterns.timeBetweenGames[secureRandomInt(0, patterns.timeBetweenGames.length)]],
            gamePreferences: [patterns.gamePreferences[secureRandomInt(0, patterns.gamePreferences.length)]]
        };
    }

    /**
     * Generate economy snapshots for historical data
     */
    async generateEconomySnapshots(days) {
        const snapshots = [];
        const now = Date.now();
        const startTime = now - (days * 24 * 60 * 60 * 1000);
        
        let totalMoney = secureRandomInt(1000000, 5000000);
        let activeUsers = secureRandomInt(50, 200);

        // Generate hourly snapshots
        for (let hour = 0; hour < days * 24; hour++) {
            const timestamp = startTime + (hour * 60 * 60 * 1000);
            
            // Simulate economic changes
            const growthRate = (secureRandomFloat() - 0.5) * 0.1; // -5% to +5% change
            totalMoney = Math.floor(totalMoney * (1 + growthRate));
            activeUsers = Math.max(10, activeUsers + secureRandomInt(-10, 15));

            const snapshot = {
                timestamp,
                totalMoney,
                averageBalance: Math.floor(totalMoney / activeUsers),
                medianBalance: Math.floor(totalMoney / activeUsers * 0.7),
                moneyVelocity: secureRandomFloat() * 2,
                inflationRate: growthRate,
                giniCoefficient: 0.3 + secureRandomFloat() * 0.4,
                topPlayerConcentration: 0.15 + secureRandomFloat() * 0.25,
                dailyTransactionVolume: secureRandomInt(50000, 500000),
                activeUsers,
                newUsers: secureRandomInt(0, 5)
            };

            snapshots.push(snapshot);

            // Save to Firebase
            await dbManager.db.collection('economy_snapshots').add(snapshot);
        }

        logger.info(`Economy Data Generator: Generated ${snapshots.length} economy snapshots`);
        return snapshots;
    }

    /**
     * Generate user balance records
     */
    async generateUserBalances(allUsers) {
        for (const user of allUsers) {
            const totalTransacted = user.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
            const netWinnings = user.transactions.reduce((sum, t) => sum + t.amount, 0);
            const startingBalance = secureRandomInt(1000, 10000);
            
            const balance = {
                userId: user.userId,
                wallet: Math.max(0, startingBalance + netWinnings),
                bank: secureRandomInt(0, startingBalance),
                totalWagered: totalTransacted,
                totalWon: user.transactions.filter(t => t.won).reduce((sum, t) => sum + t.winnings, 0),
                gamesPlayed: user.transactions.length,
                lastActive: user.transactions.length > 0 ? user.transactions[user.transactions.length - 1].timestamp : user.createdAt,
                createdAt: user.createdAt,
                gameActive: false,
                userType: user.type
            };

            await dbManager.db.collection('user_balances').doc(user.userId).set(balance);
        }

        logger.info(`Economy Data Generator: Generated ${allUsers.length} user balance records`);
    }

    /**
     * Save user transaction data
     */
    async saveUserData(userData) {
        // Save each transaction
        for (const transaction of userData.transactions) {
            await dbManager.db.collection('user_transactions').add(transaction);
            
            // Also save as game result for economy monitor
            await dbManager.db.collection('game_results').add({
                user_id: userData.userId,
                game_type: transaction.game,
                bet_amount: transaction.betAmount,
                winnings: transaction.winnings,
                won: transaction.won,
                timestamp: transaction.timestamp,
                metadata: transaction.metadata
            });
        }

        // Save user profile
        await dbManager.db.collection('user_profiles').doc(userData.userId).set({
            userId: userData.userId,
            type: userData.type,
            behaviorProfile: userData.behaviorProfile,
            createdAt: userData.createdAt,
            transactionCount: userData.transactions.length
        });
    }

    /**
     * Save fraud case data
     */
    async saveFraudCase(userData) {
        await this.saveUserData(userData);

        // Mark as confirmed fraud case
        await dbManager.db.collection('fraud_cases').add({
            userId: userData.userId,
            fraudType: userData.fraudType,
            confirmed: true,
            detectedAt: userData.createdAt,
            evidence: {
                suspiciousPatterns: this.generateFraudEvidence(userData),
                transactionCount: userData.transactions.length,
                avgBetSize: userData.transactions.reduce((sum, t) => sum + t.betAmount, 0) / userData.transactions.length,
                winRate: userData.transactions.filter(t => t.won).length / userData.transactions.length
            }
        });
    }

    /**
     * Generate fraud evidence for training
     */
    generateFraudEvidence(userData) {
        const evidence = [];
        
        switch (userData.fraudType) {
            case 'bot_automation':
                evidence.push('Extremely consistent timing patterns');
                evidence.push('Identical bet sequences repeated');
                break;
            case 'win_rate_manipulation':
                evidence.push('Impossibly high win rate sustained over time');
                evidence.push('Win rate significantly above statistical expectation');
                break;
            case 'coordinated_activity':
                evidence.push('Synchronized activity with other accounts');
                evidence.push('Similar betting patterns across multiple accounts');
                break;
            case 'exploit_abuse':
                evidence.push('Unusual game selection patterns');
                evidence.push('Exploitation of specific game mechanics');
                break;
            case 'rapid_scaling':
                evidence.push('Exponential increase in bet sizes');
                evidence.push('Rapid accumulation of wealth');
                break;
            case 'timing_manipulation':
                evidence.push('Precise timing patterns suggesting automation');
                evidence.push('Response times below human capability');
                break;
        }

        return evidence;
    }

    /**
     * Clear existing sample data
     */
    async clearExistingData() {
        logger.info('Economy Data Generator: Clearing existing sample data...');

        const collections = [
            'user_transactions',
            'game_results', 
            'economy_snapshots',
            'user_profiles',
            'fraud_cases'
        ];

        for (const collection of collections) {
            // Delete sample data (identified by user IDs containing 'user_')
            const snapshot = await dbManager.db.collection(collection).get();
            
            const batch = dbManager.db.batch();
            let count = 0;
            
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.userId && (data.userId.includes('normal_user_') || data.userId.includes('fraud_user_'))) {
                    batch.delete(doc.ref);
                    count++;
                }
                // Also delete economy snapshots from the sample period
                if (collection === 'economy_snapshots' && count < 100) {
                    batch.delete(doc.ref);
                    count++;
                }
            });
            
            if (count > 0) {
                await batch.commit();
                logger.info(`Economy Data Generator: Cleared ${count} records from ${collection}`);
            }
        }
    }

    /**
     * Get generation statistics
     */
    async getGenerationStats() {
        const stats = {};

        const collections = ['user_transactions', 'game_results', 'economy_snapshots', 'user_profiles', 'fraud_cases'];
        
        for (const collection of collections) {
            const snapshot = await dbManager.db.collection(collection).get();
            stats[collection] = snapshot.size;
        }

        return stats;
    }
}

module.exports = new EconomyDataGenerator();