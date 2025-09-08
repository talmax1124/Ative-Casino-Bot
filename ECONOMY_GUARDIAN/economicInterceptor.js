/**
 * Economic Command Interceptor - AI-Driven Transaction Control
 * Intercepts ALL economic commands for comprehensive AI analysis and control
 */

const logger = require('../UTILS/logger');
const dbManager = require('../UTILS/database');
const { fmt } = require('../UTILS/common');

class EconomicInterceptor {
    constructor(economyGuardian) {
        this.guardian = economyGuardian;
        this.userProfiles = new Map(); // Per-user economic profiles
        this.transactionHistory = [];
        this.riskProfiles = new Map();
        
        // High-performance caching for fast gameplay
        this.multiplierCache = new Map(); // Cache multipliers for 5 minutes
        this.economicHealthCache = { data: null, timestamp: 0, ttl: 60000 }; // 1 minute TTL
        this.giniCache = { value: 0, timestamp: 0, ttl: 300000 }; // 5 minute TTL
        this.payoutTextCache = new Map(); // Cache adjusted payout texts
        
        // AI decision thresholds
        this.thresholds = {
            suspiciousWinStreak: 5,      // 5+ wins in a row
            highValueTransaction: 50000,  // $50k+ transactions
            rapidTransactions: 10,        // 10+ transactions per minute
            unusualBetPattern: 3.0,       // 3x normal bet size
            riskScoreLimit: 0.8,         // Risk score 0-1 (0.8+ is high risk)
            wealthTaxThreshold: 500000000 // $500M wealth tax threshold
        };
        
        // Exempt users (admin, developers, off-economy)
        this.exemptUsers = new Set();
        
        logger.info('Economic Interceptor initialized - AI analyzing all transactions');
    }

    /**
     * MAIN INTERCEPTION POINT
     * All economic commands must go through this method
     */
    async interceptCommand(interaction, commandType, amount, metadata = {}) {
        try {
            const userId = interaction.user.id;
            const guildId = interaction.guild?.id || 'DM';
            
            // Check exemptions
            if (this.isExemptUser(userId)) {
                return { allowed: true, reason: 'exempt_user' };
            }
            
            // Get/create user profile
            const userProfile = await this.getUserProfile(userId);
            
            // Real-time AI analysis
            const analysisResult = await this.analyzeTransaction({
                userId,
                guildId,
                commandType,
                amount,
                metadata,
                userProfile,
                timestamp: Date.now()
            });
            
            // Update user profile
            await this.updateUserProfile(userId, analysisResult);
            
            // 🏦 ChatGPT Wealth Tax Assessment for high-net-worth players
            const wealthTaxResult = await this.assessWealthTax(userId, userProfile);
            
            // AI decision making (including tax considerations)
            const decision = await this.makeAIDecision(analysisResult, wealthTaxResult);
            
            // Log transaction for learning
            this.logTransaction({
                userId,
                guildId,
                commandType,
                amount,
                decision,
                riskScore: analysisResult.riskScore,
                timestamp: Date.now()
            });
            
            return decision;
            
        } catch (error) {
            logger.error(`Economic interception error: ${error.message}`);
            // Fail-safe: allow transaction but log error
            return { 
                allowed: true, 
                reason: 'error_failsafe', 
                error: error.message 
            };
        }
    }

    /**
     * COMPREHENSIVE USER PROFILING
     * Creates detailed economic profiles for each user
     */
    async getUserProfile(userId) {
        if (this.userProfiles.has(userId)) {
            return this.userProfiles.get(userId);
        }
        
        // Create new profile from database history
        const profile = await this.buildUserProfile(userId);
        this.userProfiles.set(userId, profile);
        return profile;
    }

    async buildUserProfile(userId) {
        try {
            // Get user's economic history from database
            const gameResults = await dbManager.databaseAdapter.executeQuery(`
                SELECT game_type, bet_amount, payout, won, played_at, metadata
                FROM game_results 
                WHERE user_id = ? 
                ORDER BY played_at DESC 
                LIMIT 1000
            `, [userId]);
            
            const userBalance = await dbManager.getUserBalance(userId);
            
            // Calculate comprehensive statistics
            const totalGames = gameResults.length;
            const totalWagered = gameResults.reduce((sum, game) => sum + parseFloat(game.bet_amount), 0);
            const totalWon = gameResults.reduce((sum, game) => sum + parseFloat(game.payout), 0);
            const winRate = totalGames > 0 ? gameResults.filter(g => g.won).length / totalGames : 0;
            
            // Advanced profiling
            const profile = {
                userId,
                created: Date.now(),
                lastUpdate: Date.now(),
                
                // Basic stats
                totalGames,
                totalWagered,
                totalWon,
                netProfitLoss: totalWon - totalWagered,
                winRate,
                currentBalance: (userBalance.wallet || 0) + (userBalance.bank || 0),
                
                // Behavioral patterns
                averageBetSize: totalGames > 0 ? totalWagered / totalGames : 0,
                favoriteGames: this.calculateGamePreferences(gameResults),
                bettingPatterns: this.analyzeBettingPatterns(gameResults),
                winStreaks: this.calculateStreakData(gameResults),
                
                // Risk assessment
                riskScore: 0,
                suspiciousActivity: [],
                flaggedTransactions: 0,
                
                // AI insights
                playerType: this.classifyPlayerType(gameResults, userBalance),
                economicImpact: this.calculateEconomicImpact(totalWagered, totalWon),
                retentionRisk: this.calculateRetentionRisk(gameResults)
            };
            
            // Calculate comprehensive risk score
            profile.riskScore = this.calculateRiskScore(profile);
            
            return profile;
            
        } catch (error) {
            logger.error(`Profile building error for ${userId}: ${error.message}`);
            return this.createDefaultProfile(userId);
        }
    }

    /**
     * ADVANCED TRANSACTION ANALYSIS
     * AI-powered analysis of each transaction
     */
    async analyzeTransaction(transaction) {
        const { userId, commandType, amount, userProfile, metadata } = transaction;
        
        // Multi-dimensional analysis
        const analysis = {
            userId,
            commandType,
            amount,
            timestamp: transaction.timestamp,
            
            // Pattern analysis
            betSizeAnomaly: this.analyzeBetSizeAnomaly(amount, userProfile),
            frequencyAnomaly: this.analyzeFrequencyAnomaly(userId),
            gameChoiceAnomaly: this.analyzeGameChoiceAnomaly(commandType, userProfile),
            
            // Risk indicators
            isHighValue: amount >= this.thresholds.highValueTransaction,
            isRapidTransaction: this.checkRapidTransactions(userId),
            isWinStreak: this.checkWinStreak(userId),
            isUnusualPattern: this.checkUnusualPattern(transaction),
            
            // Economic impact
            economicImpact: this.assessEconomicImpact(transaction),
            balanceRatio: amount / Math.max(userProfile.currentBalance, 1),
            
            // AI predictions
            predictedOutcome: await this.predictTransactionOutcome(transaction),
            adjustmentRecommendation: await this.calculateAdjustmentRecommendation(transaction)
        };
        
        // Calculate overall risk score
        analysis.riskScore = this.calculateTransactionRisk(analysis);
        
        return analysis;
    }

    /**
     * AI DECISION MAKING ENGINE - SILENT OPTIMIZATION MODE
     * Always allows transactions, focuses on fast payout adjustments + wealth taxation
     */
    async makeAIDecision(analysis, wealthTaxResult = null) {
        const { riskScore, economicImpact, userId, commandType, amount } = analysis;
        
        // Silent logging for high-risk transactions (no blocking)
        if (riskScore >= this.thresholds.riskScoreLimit) {
            logger.info(`🔍 High-risk transaction (silent): ${userId} - ${commandType} - ${fmt(amount)} - Risk: ${riskScore.toFixed(3)}`);
        }
        
        // Log wealth tax assessments
        if (wealthTaxResult?.taxApplied) {
            logger.info(`🏦 Wealth Tax Applied: ${userId} - ${fmt(wealthTaxResult.taxAmount)} (${wealthTaxResult.taxRate.toFixed(1)}%)`);
            logger.info(`💰 AI Tax Reasoning: ${wealthTaxResult.reasoning}`);
        }
        
        // Fast dynamic multiplier calculation (cached for performance)
        const multiplierAdjustment = await this.calculateDynamicMultiplierFast(analysis, wealthTaxResult);
        
        // Always allow with AI adjustments applied silently
        return {
            allowed: true,
            reason: 'silent_ai_optimization',
            riskScore,
            multiplierAdjustment,
            wealthTaxResult,
            silent: true // Flag for silent operation
        };
    }

    /**
     * CHATGPT-POWERED GINI COEFFICIENT ANALYSIS
     * Let AI calculate and interpret wealth inequality
     */
    async calculateGiniCoefficient() {
        try {
            // Get all user balances for ChatGPT analysis
            const balances = await dbManager.databaseAdapter.executeQuery(`
                SELECT (wallet + bank) as total_balance 
                FROM user_balances 
                WHERE (wallet + bank) > 0
                ORDER BY total_balance ASC
                LIMIT 1000
            `);
            
            if (balances.length === 0) return { gini: 0, interpretation: 'No economic data', recommendation: 'Continue monitoring' };
            
            const balanceValues = balances.map(b => parseFloat(b.total_balance));
            
            // Ask ChatGPT to calculate GINI and provide economic interpretation
            const giniAnalysis = await this.guardian.economicAnalyzer.queryOpenAI(`
                You are an expert economist analyzing a casino economy. Calculate the GINI coefficient for wealth inequality and provide economic recommendations.
                
                USER BALANCE DATA:
                - Total users: ${balanceValues.length}
                - Balance distribution: ${JSON.stringify(balanceValues.slice(0, 100))}... (showing first 100)
                - Minimum balance: $${Math.min(...balanceValues).toLocaleString()}
                - Maximum balance: $${Math.max(...balanceValues).toLocaleString()}
                - Average balance: $${(balanceValues.reduce((a, b) => a + b, 0) / balanceValues.length).toLocaleString()}
                
                Please respond with JSON:
                {
                    "gini_coefficient": number (0-1),
                    "inequality_level": "low/moderate/high/extreme",
                    "interpretation": "detailed explanation",
                    "economic_recommendations": ["recommendation1", "recommendation2"],
                    "multiplier_adjustments": {
                        "wealthy_players": number (0.5-1.5),
                        "average_players": number (0.5-1.5),
                        "new_players": number (0.5-1.5)
                    }
                }
            `);
            
            logger.info(`🤖 ChatGPT GINI Analysis: ${giniAnalysis.inequality_level} inequality (${giniAnalysis.gini_coefficient.toFixed(4)})`);
            logger.info(`🤖 AI Recommendation: ${giniAnalysis.interpretation}`);
            
            return giniAnalysis;
            
        } catch (error) {
            logger.error(`ChatGPT GINI analysis error: ${error.message}`);
            return { gini_coefficient: 0.5, inequality_level: 'unknown', interpretation: 'Analysis failed', multiplier_adjustments: { wealthy_players: 1.0, average_players: 1.0, new_players: 1.0 }};
        }
    }

    /**
     * CHATGPT-POWERED DYNAMIC MULTIPLIER SYSTEM
     * Let AI determine all multiplier adjustments with wealth tax considerations
     */
    async calculateDynamicMultiplierFast(analysis, wealthTaxResult = null) {
        const { commandType, userProfile, economicImpact, userId } = analysis;
        
        // Check cache first for performance
        const cacheKey = `${userId}_${commandType}_${Math.floor(Date.now() / 300000)}`; // 5-minute cache
        if (this.multiplierCache.has(cacheKey)) {
            return this.multiplierCache.get(cacheKey);
        }
        
        try {
            // Get cached economic data
            const giniData = await this.getFastGini();
            const economicHealth = await this.getFastEconomicHealth();
            
            // Ask ChatGPT to calculate the specific multiplier for this user/game
            const multiplierAnalysis = await this.guardian.economicAnalyzer.queryOpenAI(`
                You are an AI casino economist. Calculate the optimal payout multiplier for this specific transaction.
                
                PLAYER PROFILE:
                - Player Type: ${userProfile.playerType}
                - Total Wagered: $${userProfile.totalWagered.toLocaleString()}
                - Net Profit/Loss: $${userProfile.netProfitLoss.toLocaleString()}
                - Win Rate: ${(userProfile.winRate * 100).toFixed(1)}%
                - Current Balance: $${userProfile.currentBalance.toLocaleString()}
                - Economic Impact: ${(userProfile.economicImpact * 100).toFixed(1)}%
                
                WEALTH TAX STATUS:
                ${wealthTaxResult ? `
                - Wealth Tax Applied: YES (${wealthTaxResult.taxRate.toFixed(1)}% - $${wealthTaxResult.taxAmount.toLocaleString()})
                - Tax Type: ${wealthTaxResult.taxType}
                - Tax Reasoning: ${wealthTaxResult.reasoning}
                - Additional Multiplier Reduction: ${(wealthTaxResult.additionalMultiplierReduction || 0).toFixed(3)}
                ` : `
                - Wealth Tax Applied: NO (Player under $500M threshold)
                `}
                
                ECONOMY STATUS:
                - GINI Coefficient: ${giniData.gini_coefficient || 0.5} (${giniData.inequality_level || 'unknown'})
                - Current Status: ${economicHealth.status || 'stable'}
                - Game Type: ${commandType}
                - Bet Amount: $${analysis.amount}
                
                CONSTRAINTS:
                - Multiplier must be between 0.5x and 1.5x
                - Wealthy players (whales) should get reduced multipliers during high inequality
                - New players should get slight boosts to encourage retention
                - Economic crises require reduced payouts, expansions allow increased payouts
                - Players who paid wealth tax should get additional multiplier reductions as specified
                
                Please respond with JSON:
                {
                    "final_multiplier": number (0.5-1.5, factor in wealth tax reductions),
                    "reasoning": "explanation of the decision including wealth tax considerations",
                    "economic_impact": "positive/negative/neutral",
                    "player_specific_adjustment": number (-0.1 to +0.1),
                    "economic_health_adjustment": number (-0.1 to +0.1),
                    "wealth_tax_multiplier_impact": number (0-0.2, additional reduction for taxed players),
                    "confidence": number (0-1)
                }
            `);
            
            const result = {
                baseMultiplier: 1.0,
                finalMultiplier: multiplierAnalysis.final_multiplier,
                aiReasoning: multiplierAnalysis.reasoning,
                economicImpact: multiplierAnalysis.economic_impact,
                playerAdjustment: multiplierAnalysis.player_specific_adjustment,
                economicAdjustment: multiplierAnalysis.economic_health_adjustment,
                wealthTaxMultiplierImpact: multiplierAnalysis.wealth_tax_multiplier_impact || 0,
                confidence: multiplierAnalysis.confidence
            };
            
            // Log significant adjustments
            if (Math.abs(result.finalMultiplier - 1.0) > 0.05) {
                const wealthTaxInfo = wealthTaxResult?.taxApplied ? ` [Wealth Tax: ${wealthTaxResult.taxRate.toFixed(1)}%]` : '';
                logger.info(`🤖 ChatGPT Multiplier: ${userId} ${commandType} - ${result.finalMultiplier.toFixed(3)}x${wealthTaxInfo} (${multiplierAnalysis.reasoning})`);
            }
            
            // Cache result
            this.multiplierCache.set(cacheKey, result);
            
            // Clean cache periodically
            if (this.multiplierCache.size > 1000) {
                const oldKeys = Array.from(this.multiplierCache.keys()).slice(0, 500);
                oldKeys.forEach(key => this.multiplierCache.delete(key));
            }
            
            return result;
            
        } catch (error) {
            logger.error(`ChatGPT multiplier analysis error: ${error.message}`);
            // Fallback to neutral multiplier
            return {
                baseMultiplier: 1.0,
                finalMultiplier: 1.0,
                aiReasoning: 'AI analysis failed, using default',
                economicImpact: 'neutral',
                confidence: 0
            };
        }
    }

    /**
     * DYNAMIC MULTIPLIER SYSTEM
     * Adjusts game multipliers based on economic health
     */
    async calculateDynamicMultiplier(analysis) {
        const { commandType, userProfile, economicImpact } = analysis;
        
        // Get current economic health
        const gini = await this.calculateGiniCoefficient();
        const economicHealth = await this.guardian.metricsCollector.collectEconomicHealth();
        
        // Base multiplier (from game config)
        let baseMultiplier = 1.0;
        
        // Adjust based on wealth distribution (Gini)
        let giniAdjustment = 0;
        if (gini > 0.8) {
            // High inequality - reduce payouts for wealthy players
            giniAdjustment = userProfile.economicImpact > 0.1 ? -0.05 : 0.02;
        } else if (gini < 0.3) {
            // Low inequality - slightly increase payouts
            giniAdjustment = 0.01;
        }
        
        // Adjust based on user's economic profile
        let profileAdjustment = 0;
        if (userProfile.playerType === 'whale' && userProfile.netProfitLoss > 0) {
            profileAdjustment = -0.03; // Reduce multipliers for profitable whales
        } else if (userProfile.playerType === 'new_player') {
            profileAdjustment = 0.02; // Boost new players
        }
        
        // Economic health adjustment
        let healthAdjustment = 0;
        if (economicHealth.inflationRate > 0.05) {
            healthAdjustment = -0.02; // Reduce payouts during inflation
        } else if (economicHealth.deflationRate < -0.03) {
            healthAdjustment = 0.015; // Increase payouts during deflation
        }
        
        const finalMultiplier = baseMultiplier + giniAdjustment + profileAdjustment + healthAdjustment;
        
        return {
            baseMultiplier,
            giniAdjustment,
            profileAdjustment,
            healthAdjustment,
            finalMultiplier: Math.max(0.5, Math.min(1.5, finalMultiplier)) // Cap between 0.5x and 1.5x
        };
    }

    /**
     * HELPER METHODS
     */
    
    isExemptUser(userId) {
        const developerId = '466050111680544798';
        return userId === developerId || this.exemptUsers.has(userId);
    }

    calculateGamePreferences(gameResults) {
        const games = {};
        gameResults.forEach(game => {
            games[game.game_type] = (games[game.game_type] || 0) + 1;
        });
        return Object.entries(games)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3)
            .map(([game, count]) => ({ game, count }));
    }

    analyzeBettingPatterns(gameResults) {
        if (gameResults.length === 0) return { consistency: 1, volatility: 0 };
        
        const betSizes = gameResults.map(g => parseFloat(g.bet_amount));
        const mean = betSizes.reduce((a, b) => a + b, 0) / betSizes.length;
        const variance = betSizes.reduce((sum, bet) => sum + Math.pow(bet - mean, 2), 0) / betSizes.length;
        
        return {
            consistency: Math.max(0, 1 - (Math.sqrt(variance) / mean)),
            volatility: Math.sqrt(variance),
            averageBet: mean
        };
    }

    calculateStreakData(gameResults) {
        let currentStreak = 0;
        let maxWinStreak = 0;
        let maxLossStreak = 0;
        
        for (const game of gameResults) {
            if (game.won) {
                currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
                maxWinStreak = Math.max(maxWinStreak, currentStreak);
            } else {
                currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
                maxLossStreak = Math.min(maxLossStreak, currentStreak);
            }
        }
        
        return { maxWinStreak, maxLossStreak: Math.abs(maxLossStreak), currentStreak };
    }

    classifyPlayerType(gameResults, userBalance) {
        const totalWagered = gameResults.reduce((sum, game) => sum + parseFloat(game.bet_amount), 0);
        const gamesCount = gameResults.length;
        const balance = (userBalance.wallet || 0) + (userBalance.bank || 0);
        
        if (totalWagered > 10000000) return 'whale';
        if (totalWagered > 1000000) return 'high_roller';
        if (gamesCount > 1000) return 'regular';
        if (gamesCount < 10) return 'new_player';
        return 'casual';
    }

    calculateEconomicImpact(totalWagered, totalWon) {
        const totalVolume = totalWagered + totalWon;
        if (totalVolume < 1000000) return 0.01; // Low impact
        if (totalVolume < 10000000) return 0.05; // Medium impact
        return 0.1; // High impact
    }

    calculateRetentionRisk(gameResults) {
        if (gameResults.length === 0) return 0.5;
        
        const recentGames = gameResults.slice(0, 20); // Last 20 games
        const winRate = recentGames.filter(g => g.won).length / recentGames.length;
        const profitability = recentGames.reduce((sum, g) => sum + (parseFloat(g.payout) - parseFloat(g.bet_amount)), 0);
        
        // High losses = high retention risk
        if (profitability < -50000 && winRate < 0.2) return 0.8;
        if (profitability < -10000 && winRate < 0.3) return 0.6;
        return 0.3;
    }

    calculateRiskScore(profile) {
        let risk = 0;
        
        // High win rate is suspicious
        if (profile.winRate > 0.7) risk += 0.3;
        
        // Large net profit is suspicious
        if (profile.netProfitLoss > 1000000) risk += 0.2;
        
        // Unusual betting patterns
        if (profile.bettingPatterns.volatility > profile.bettingPatterns.averageBet * 5) risk += 0.15;
        
        // Win streaks
        if (profile.winStreaks.maxWinStreak > 10) risk += 0.2;
        
        // High economic impact
        if (profile.economicImpact > 0.05) risk += 0.1;
        
        return Math.min(1, risk);
    }

    calculateTransactionRisk(analysis) {
        let risk = 0;
        
        if (analysis.isHighValue) risk += 0.2;
        if (analysis.isRapidTransaction) risk += 0.15;
        if (analysis.isWinStreak) risk += 0.25;
        if (analysis.betSizeAnomaly > 3) risk += 0.3;
        if (analysis.balanceRatio > 0.5) risk += 0.1; // Betting >50% of balance
        
        return Math.min(1, risk);
    }

    createDefaultProfile(userId) {
        return {
            userId,
            created: Date.now(),
            lastUpdate: Date.now(),
            totalGames: 0,
            totalWagered: 0,
            totalWon: 0,
            netProfitLoss: 0,
            winRate: 0,
            currentBalance: 0,
            averageBetSize: 0,
            favoriteGames: [],
            bettingPatterns: { consistency: 1, volatility: 0, averageBet: 0 },
            winStreaks: { maxWinStreak: 0, maxLossStreak: 0, currentStreak: 0 },
            riskScore: 0,
            suspiciousActivity: [],
            flaggedTransactions: 0,
            playerType: 'new_player',
            economicImpact: 0.01,
            retentionRisk: 0.3
        };
    }

    // Placeholder methods for additional functionality
    analyzeBetSizeAnomaly(amount, userProfile) {
        return userProfile.averageBetSize > 0 ? amount / userProfile.averageBetSize : 1;
    }

    analyzeFrequencyAnomaly(userId) {
        // Check recent transaction frequency
        return false; // Placeholder
    }

    analyzeGameChoiceAnomaly(commandType, userProfile) {
        // Check if game choice is unusual for this user
        return false; // Placeholder
    }

    checkRapidTransactions(userId) {
        // Check if user is making transactions too quickly
        return false; // Placeholder
    }

    checkWinStreak(userId) {
        // Check current win streak
        return false; // Placeholder
    }

    checkUnusualPattern(transaction) {
        // Check for unusual patterns
        return false; // Placeholder
    }

    assessEconomicImpact(transaction) {
        // Assess impact on overall economy
        return 0.01; // Placeholder
    }

    async predictTransactionOutcome(transaction) {
        // AI prediction of transaction outcome
        return { confidence: 0.5, prediction: 'neutral' }; // Placeholder
    }

    async calculateAdjustmentRecommendation(transaction) {
        // AI recommendation for adjustments
        return { recommendation: 'none', confidence: 0.5 }; // Placeholder
    }

    async handleHighRiskTransaction(analysis) {
        // Handle high-risk transactions in controller mode
        return { allowed: false, reason: 'high_risk_blocked' }; // Placeholder
    }

    async flagForReview(analysis) {
        // Flag transaction for human review
        logger.warn(`Transaction flagged for review: ${analysis.userId} - Risk: ${analysis.riskScore}`);
    }

    async assessEconomicHealthImpact(analysis) {
        // Assess impact on economic health
        return { impact: 'neutral', confidence: 0.5 }; // Placeholder
    }

    async updateUserProfile(userId, analysisResult) {
        // Update user profile with new data
        const profile = this.userProfiles.get(userId);
        if (profile) {
            profile.lastUpdate = Date.now();
            profile.riskScore = Math.max(profile.riskScore, analysisResult.riskScore);
        }
    }

    logTransaction(transaction) {
        this.transactionHistory.push(transaction);
        
        // Keep only last 10000 transactions in memory
        if (this.transactionHistory.length > 10000) {
            this.transactionHistory = this.transactionHistory.slice(-10000);
        }
    }

    addExemptUser(userId) {
        this.exemptUsers.add(userId);
    }

    removeExemptUser(userId) {
        this.exemptUsers.delete(userId);
    }

    /**
     * FAST CACHED GINI CALCULATION - CHATGPT POWERED
     */
    async getFastGini() {
        const now = Date.now();
        if (this.giniCache.timestamp + this.giniCache.ttl > now) {
            return this.giniCache.value;
        }
        
        // Update cache with full ChatGPT analysis
        this.giniCache.value = await this.calculateGiniCoefficient();
        this.giniCache.timestamp = now;
        return this.giniCache.value;
    }

    /**
     * CHATGPT-POWERED ECONOMIC HEALTH ANALYSIS
     */
    async getFastEconomicHealth() {
        const now = Date.now();
        if (this.economicHealthCache.timestamp + this.economicHealthCache.ttl > now) {
            return this.economicHealthCache.data;
        }
        
        try {
            // Get recent economic data for ChatGPT analysis
            const recentTransactions = await dbManager.databaseAdapter.executeQuery(`
                SELECT game_type, bet_amount, payout, won, played_at
                FROM game_results 
                WHERE played_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
                ORDER BY played_at DESC 
                LIMIT 500
            `);
            
            if (recentTransactions.length === 0) {
                const defaultHealth = { status: 'stable', inflationRate: 0, deflationRate: 0, analysis: 'No recent activity' };
                this.economicHealthCache.data = defaultHealth;
                this.economicHealthCache.timestamp = now;
                return defaultHealth;
            }
            
            // Calculate basic statistics for ChatGPT
            const totalWagered = recentTransactions.reduce((sum, t) => sum + parseFloat(t.bet_amount), 0);
            const totalPaid = recentTransactions.reduce((sum, t) => sum + parseFloat(t.payout), 0);
            const houseEdge = ((totalWagered - totalPaid) / totalWagered * 100);
            const winRate = recentTransactions.filter(t => t.won).length / recentTransactions.length * 100;
            
            // Ask ChatGPT to analyze economic health
            const healthAnalysis = await this.guardian.economicAnalyzer.queryOpenAI(`
                You are an expert casino economist. Analyze the current economic health of this casino based on recent activity.
                
                RECENT ACTIVITY (Last Hour):
                - Total Transactions: ${recentTransactions.length}
                - Total Wagered: $${totalWagered.toLocaleString()}
                - Total Paid Out: $${totalPaid.toLocaleString()}
                - House Edge: ${houseEdge.toFixed(2)}%
                - Player Win Rate: ${winRate.toFixed(1)}%
                - Net Casino Revenue: $${(totalWagered - totalPaid).toLocaleString()}
                
                GAME BREAKDOWN:
                ${this.getGameBreakdown(recentTransactions)}
                
                Please respond with JSON:
                {
                    "status": "crisis/contracting/stable/expanding/booming",
                    "health_score": number (0-100),
                    "inflation_rate": number (-0.1 to 0.1),
                    "analysis": "detailed economic assessment",
                    "immediate_concerns": ["concern1", "concern2"],
                    "recommendations": ["action1", "action2"],
                    "emergency_actions_needed": boolean
                }
            `);
            
            logger.info(`🤖 ChatGPT Economic Health: ${healthAnalysis.status} (${healthAnalysis.health_score}/100)`);
            logger.info(`🤖 AI Analysis: ${healthAnalysis.analysis}`);
            
            if (healthAnalysis.emergency_actions_needed) {
                logger.warn(`🚨 ChatGPT EMERGENCY: ${healthAnalysis.immediate_concerns.join(', ')}`);
            }
            
            this.economicHealthCache.data = healthAnalysis;
            this.economicHealthCache.timestamp = now;
            return healthAnalysis;
            
        } catch (error) {
            logger.error(`ChatGPT economic health analysis error: ${error.message}`);
            const fallbackHealth = { status: 'unknown', health_score: 50, inflation_rate: 0, analysis: 'Analysis failed' };
            this.economicHealthCache.data = fallbackHealth;
            this.economicHealthCache.timestamp = now;
            return fallbackHealth;
        }
    }

    /**
     * CHATGPT-POWERED AUTOMATIC PAYOUT TEXT ADJUSTMENT
     * AI decides how to modify game descriptions based on economic conditions
     */
    async getAdjustedPayoutText(gameType, baseText) {
        try {
            const cacheKey = `${gameType}_text_${Math.floor(Date.now() / 300000)}`; // 5-minute cache
            
            if (this.payoutTextCache.has(cacheKey)) {
                return this.payoutTextCache.get(cacheKey);
            }
            
            const giniData = await this.getFastGini();
            const economicHealth = await this.getFastEconomicHealth();
            
            // Ask ChatGPT to adjust the game text based on economic conditions
            const textAdjustment = await this.guardian.economicAnalyzer.queryOpenAI(`
                You are an AI casino operator. Adjust this game's payout description text based on current economic conditions.
                
                GAME: ${gameType}
                ORIGINAL TEXT: "${baseText}"
                
                ECONOMIC CONDITIONS:
                - GINI Coefficient: ${giniData.gini_coefficient || 0.5} (${giniData.inequality_level || 'unknown'} inequality)
                - Economic Status: ${economicHealth.status || 'stable'} (${economicHealth.health_score || 50}/100)
                - Analysis: ${economicHealth.analysis || 'No analysis available'}
                
                INSTRUCTIONS:
                - If economy is in crisis/contracting: Reduce displayed payouts/multipliers by 10-15%
                - If economy is expanding/booming: Increase displayed payouts/multipliers by 5-10%
                - If stable: Keep original text
                - Add a subtle economic indicator emoji (📉 for reductions, 📈 for increases, 📊 for stable)
                - Keep changes minimal and professional
                
                Please respond with JSON:
                {
                    "adjusted_text": "the modified text",
                    "adjustment_type": "reduced/increased/stable",
                    "reasoning": "why this adjustment was made",
                    "economic_indicator": "emoji to add"
                }
            `);
            
            let finalText = textAdjustment.adjusted_text || baseText;
            
            // Add subtle economic indicator
            if (textAdjustment.economic_indicator && textAdjustment.adjustment_type !== 'stable') {
                finalText += `\n${textAdjustment.economic_indicator} *Dynamic economic adjustment*`;
            }
            
            // Log significant changes
            if (textAdjustment.adjustment_type !== 'stable') {
                logger.info(`🤖 ChatGPT Text Adjustment (${gameType}): ${textAdjustment.adjustment_type} - ${textAdjustment.reasoning}`);
            }
            
            // Cache result
            this.payoutTextCache.set(cacheKey, finalText);
            
            // Clean cache periodically
            if (this.payoutTextCache.size > 100) {
                const oldKeys = Array.from(this.payoutTextCache.keys()).slice(0, 50);
                oldKeys.forEach(key => this.payoutTextCache.delete(key));
            }
            
            return finalText;
            
        } catch (error) {
            logger.error(`ChatGPT text adjustment error: ${error.message}`);
            return baseText; // Fallback to original text
        }
    }

    /**
     * GET CURRENT ECONOMIC INDICATORS FOR UI - CHATGPT POWERED
     */
    getCurrentEconomicIndicators() {
        const giniData = this.giniCache.value || { gini_coefficient: 0.5, inequality_level: 'unknown' };
        const health = this.economicHealthCache.data || { status: 'stable', health_score: 50, inflation_rate: 0 };
        
        // Use ChatGPT's analysis for status and color
        let status = health.status || 'stable';
        let color = 0x00FF00; // Green (default)
        
        switch (status.toLowerCase()) {
            case 'crisis':
                color = 0xFF0000; // Red
                break;
            case 'contracting':
                color = 0xFF6600; // Orange  
                break;
            case 'stable':
                color = 0x00FF00; // Green
                break;
            case 'expanding':
                color = 0x0099FF; // Blue
                break;
            case 'booming':
                color = 0x00FF88; // Bright green
                break;
        }
        
        return {
            status: status.charAt(0).toUpperCase() + status.slice(1),
            color,
            gini: (giniData.gini_coefficient || 0).toFixed(3),
            healthScore: health.health_score || 50,
            inequality: giniData.inequality_level || 'unknown',
            aiAnalysis: health.analysis || 'No analysis available'
        };
    }

    /**
     * HELPER: Get game breakdown for ChatGPT analysis
     */
    getGameBreakdown(transactions) {
        const gameStats = {};
        transactions.forEach(tx => {
            if (!gameStats[tx.game_type]) {
                gameStats[tx.game_type] = { count: 0, wagered: 0, paid: 0, wins: 0 };
            }
            gameStats[tx.game_type].count++;
            gameStats[tx.game_type].wagered += parseFloat(tx.bet_amount);
            gameStats[tx.game_type].paid += parseFloat(tx.payout);
            if (tx.won) gameStats[tx.game_type].wins++;
        });

        return Object.entries(gameStats)
            .map(([game, stats]) => `${game}: ${stats.count} games, $${stats.wagered.toLocaleString()} wagered, $${stats.paid.toLocaleString()} paid, ${(stats.wins/stats.count*100).toFixed(1)}% win rate`)
            .join('\n');
    }

    /**
     * CHATGPT-POWERED WEALTH TAX ASSESSMENT
     * AI determines progressive taxation for players over $500M
     */
    async assessWealthTax(userId, userProfile) {
        try {
            const totalWealth = userProfile.currentBalance;
            
            // Only assess tax for players over $500M
            if (totalWealth < this.thresholds.wealthTaxThreshold) {
                return { taxApplied: false, taxAmount: 0, taxRate: 0, reasoning: 'Below wealth tax threshold' };
            }
            
            // Get current economic conditions for ChatGPT analysis
            const giniData = await this.getFastGini();
            const economicHealth = await this.getFastEconomicHealth();
            
            // Ask ChatGPT to determine appropriate wealth tax
            const taxAnalysis = await this.guardian.economicAnalyzer.queryOpenAI(`
                You are an AI tax policy expert for a casino economy. Determine progressive wealth tax for this high-net-worth player.
                
                PLAYER WEALTH PROFILE:
                - Total Balance: $${totalWealth.toLocaleString()}
                - Player Type: ${userProfile.playerType}
                - Net Profit/Loss: $${userProfile.netProfitLoss.toLocaleString()}
                - Economic Impact: ${(userProfile.economicImpact * 100).toFixed(1)}%
                - Win Rate: ${(userProfile.winRate * 100).toFixed(1)}%
                
                ECONOMY CONDITIONS:
                - GINI Coefficient: ${giniData.gini_coefficient || 0.5} (${giniData.inequality_level || 'unknown'} inequality)
                - Economic Health: ${economicHealth.status || 'stable'} (${economicHealth.health_score || 50}/100)
                - Analysis: ${economicHealth.analysis || 'No analysis'}
                
                WEALTH TAX POLICY:
                - Base threshold: $500M+ (this player qualifies)
                - During high inequality (GINI > 0.7): Increase tax rates by 50%
                - During economic crisis: Emergency wealth tax up to 5% per transaction
                - Profitable whales: Additional tax based on net winnings
                
                Please respond with JSON:
                {
                    "tax_rate": number (0.001-0.05, as decimal),
                    "tax_amount": number (calculated tax in dollars),
                    "reasoning": "detailed explanation",
                    "tax_type": "progressive/emergency/inequality/standard",
                    "apply_tax": boolean,
                    "additional_multiplier_reduction": number (0-0.2, additional payout reduction)
                }
            `);
            
            if (!taxAnalysis.apply_tax) {
                return { 
                    taxApplied: false, 
                    taxAmount: 0, 
                    taxRate: 0, 
                    reasoning: taxAnalysis.reasoning,
                    additionalMultiplierReduction: 0
                };
            }
            
            const taxAmount = Math.min(taxAnalysis.tax_amount, totalWealth * 0.05); // Cap at 5% of wealth
            
            // Apply the wealth tax to the user's balance
            await this.applyWealthTax(userId, taxAmount, taxAnalysis);
            
            logger.info(`🏦 ChatGPT Wealth Tax: ${userId} - $${taxAmount.toLocaleString()} (${(taxAnalysis.tax_rate * 100).toFixed(2)}%) - Type: ${taxAnalysis.tax_type}`);
            logger.info(`💰 Tax Reasoning: ${taxAnalysis.reasoning}`);
            
            return {
                taxApplied: true,
                taxAmount: taxAmount,
                taxRate: taxAnalysis.tax_rate * 100, // Convert to percentage
                reasoning: taxAnalysis.reasoning,
                taxType: taxAnalysis.tax_type,
                additionalMultiplierReduction: taxAnalysis.additional_multiplier_reduction || 0
            };
            
        } catch (error) {
            logger.error(`ChatGPT wealth tax analysis error: ${error.message}`);
            return { taxApplied: false, taxAmount: 0, taxRate: 0, reasoning: 'Tax analysis failed' };
        }
    }

    /**
     * APPLY WEALTH TAX TO USER BALANCE
     */
    async applyWealthTax(userId, taxAmount, taxAnalysis) {
        try {
            // Deduct from wallet first, then bank if needed
            const currentBalance = await dbManager.getUserBalance(userId);
            let walletDeduction = Math.min(taxAmount, currentBalance.wallet);
            let bankDeduction = taxAmount - walletDeduction;
            
            // Apply deductions
            if (walletDeduction > 0) {
                await dbManager.databaseAdapter.executeQuery(
                    'UPDATE user_balances SET wallet = wallet - ? WHERE user_id = ?',
                    [walletDeduction, userId]
                );
            }
            
            if (bankDeduction > 0) {
                await dbManager.databaseAdapter.executeQuery(
                    'UPDATE user_balances SET bank = bank - ? WHERE user_id = ?',
                    [bankDeduction, userId]
                );
            }
            
            // Log tax collection for audit
            await this.guardian.auditLogger?.logEntry({
                category: 'wealth_tax',
                event: 'tax_collected',
                severity: 'info',
                data: {
                    userId,
                    taxAmount,
                    taxRate: taxAnalysis.tax_rate,
                    taxType: taxAnalysis.tax_type,
                    reasoning: taxAnalysis.reasoning,
                    walletDeduction,
                    bankDeduction
                },
                source: 'WealthTaxSystem'
            });
            
        } catch (error) {
            logger.error(`Failed to apply wealth tax for ${userId}: ${error.message}`);
        }
    }
}

module.exports = EconomicInterceptor;