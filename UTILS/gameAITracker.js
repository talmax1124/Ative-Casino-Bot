/**
 * Game AI Tracker - Centralized AI Monitoring for All Games
 * Tracks game performance, player behavior, and applies AI-driven adjustments
 */

const dbManager = require('./database');
const logger = require('./logger');
const wealthCeiling = require('./wealthCeiling');

class GameAITracker {
    constructor() {
        // Game performance tracking
        this.gameStats = new Map();
        this.playerPatterns = new Map();
        
        // AI adjustment thresholds
        this.suspiciousThresholds = {
            highWinRate: 0.65,           // Above 65% win rate is suspicious
            largeWinMultiplier: 25,      // Wins above 25x are flagged
            rapidWealthGrowth: 10000000, // $10M growth in 24h is flagged
            consecutiveWins: 8,          // More than 8 wins in a row
            unusualBetPattern: 5         // Dramatic bet size changes
        };

        // AI responses to suspicious activity
        this.aiResponses = {
            reduceMultipliers: 0.25,     // 25% reduction for suspicious players
            increaseTaxes: 0.15,         // Additional 15% tax
            limitBets: 0.5,              // 50% of normal bet limits
            requireCooldown: 300000      // 5 minute cooldown between games
        };

        // Track game session data
        this.activeSessions = new Map();
    }

    /**
     * Track the start of a game session
     * @param {string} userId - User ID
     * @param {string} gameType - Type of game
     * @param {number} betAmount - Bet amount
     * @returns {Promise<object>} AI tracking data
     */
    async trackGameStart(userId, gameType, betAmount) {
        const sessionId = `${userId}_${gameType}_${Date.now()}`;
        
        try {
            // Get player's current wealth and patterns
            const balance = await dbManager.getUserBalance(userId);
            const totalWealth = balance.wallet + balance.bank;
            
            // Initialize or update player pattern tracking
            if (!this.playerPatterns.has(userId)) {
                this.playerPatterns.set(userId, {
                    gamesPlayed: 0,
                    totalWagered: 0,
                    totalWon: 0,
                    winStreak: 0,
                    lossStreak: 0,
                    lastGameTime: 0,
                    suspiciousFlags: 0,
                    recentWins: [],
                    recentBets: [],
                    flaggedBehaviors: []
                });
            }

            const playerData = this.playerPatterns.get(userId);
            
            // Analyze betting pattern
            const betAnalysis = this.analyzeBettingPattern(playerData, betAmount);
            
            // Check for suspicious rapid play
            const timeSinceLastGame = Date.now() - playerData.lastGameTime;
            const isRapidPlay = timeSinceLastGame < 10000; // Less than 10 seconds
            
            // Create session tracking
            this.activeSessions.set(sessionId, {
                userId,
                gameType,
                betAmount,
                startTime: Date.now(),
                startWealth: totalWealth,
                aiFlags: [],
                suspicious: betAnalysis.suspicious || isRapidPlay
            });

            // Update player data
            playerData.gamesPlayed++;
            playerData.totalWagered += betAmount;
            playerData.lastGameTime = Date.now();
            playerData.recentBets.push({ amount: betAmount, time: Date.now() });
            
            // Keep only last 10 bets for pattern analysis
            if (playerData.recentBets.length > 10) {
                playerData.recentBets.shift();
            }

            // Calculate AI adjustments based on wealth and patterns
            const aiAdjustments = await this.calculateAIAdjustments(userId, playerData, totalWealth);

            logger.debug(`🤖 AI Game Start Tracking: ${userId} - ${gameType} - Bet: ${betAmount} - Flags: ${aiAdjustments.flags.join(', ')}`);

            return {
                sessionId,
                aiAdjustments,
                wealthTier: this.getWealthTier(totalWealth),
                suspiciousActivity: betAnalysis.suspicious || isRapidPlay,
                recommendations: aiAdjustments.recommendations
            };

        } catch (error) {
            logger.error(`AI tracking failed for game start: ${error.message}`);
            return {
                sessionId,
                aiAdjustments: { multiplierAdjustment: 1.0, flags: [] },
                wealthTier: "Unknown",
                suspiciousActivity: false,
                recommendations: []
            };
        }
    }

    /**
     * Track the end of a game session
     * @param {string} sessionId - Session ID from trackGameStart
     * @param {boolean} won - Whether player won
     * @param {number} payout - Payout amount
     * @returns {Promise<object>} AI analysis results
     */
    async trackGameEnd(sessionId, won, payout) {
        try {
            const session = this.activeSessions.get(sessionId);
            if (!session) {
                logger.warn(`No active session found for ID: ${sessionId}`);
                return { analysis: "No session data", flags: [] };
            }

            const { userId, gameType, betAmount, startWealth, startTime } = session;
            const playerData = this.playerPatterns.get(userId);
            
            if (!playerData) {
                logger.warn(`No player data found for user: ${userId}`);
                return { analysis: "No player data", flags: [] };
            }

            // Update player statistics
            if (won) {
                playerData.totalWon += payout;
                playerData.winStreak++;
                playerData.lossStreak = 0;
                playerData.recentWins.push({
                    game: gameType,
                    bet: betAmount,
                    payout: payout,
                    multiplier: payout / betAmount,
                    time: Date.now()
                });
            } else {
                playerData.lossStreak++;
                playerData.winStreak = 0;
            }

            // Keep only last 20 wins for analysis
            if (playerData.recentWins.length > 20) {
                playerData.recentWins.shift();
            }

            // Analyze for suspicious patterns
            const suspiciousFlags = this.analyzeSuspiciousActivity(playerData, won, payout, betAmount);
            
            // Get current wealth for growth analysis
            const balance = await dbManager.getUserBalance(userId);
            const currentWealth = balance.wallet + balance.bank;
            const wealthGrowth = currentWealth - startWealth;

            // Flag rapid wealth growth
            if (wealthGrowth > this.suspiciousThresholds.rapidWealthGrowth) {
                suspiciousFlags.push(`Rapid wealth growth: +$${wealthGrowth.toLocaleString()}`);
            }

            // Update game statistics
            this.updateGameStats(gameType, won, betAmount, payout);

            // Clean up session
            this.activeSessions.delete(sessionId);

            const analysis = {
                userId,
                gameType,
                won,
                payout,
                wealthGrowth,
                suspiciousFlags,
                winRate: playerData.gamesPlayed > 0 ? (playerData.recentWins.length / Math.min(playerData.gamesPlayed, 20)) : 0,
                winStreak: playerData.winStreak,
                lossStreak: playerData.lossStreak,
                flaggedForReview: suspiciousFlags.length > 0,
                aiRecommendations: this.generateAIRecommendations(playerData, suspiciousFlags)
            };

            // Log significant events
            if (suspiciousFlags.length > 0) {
                logger.warn(`🚨 SUSPICIOUS ACTIVITY: ${userId} - ${gameType} - Flags: ${suspiciousFlags.join(', ')}`);
            }

            if (payout > 1000000) {
                logger.info(`💰 LARGE WIN: ${userId} won $${payout.toLocaleString()} in ${gameType} (${(payout/betAmount).toFixed(1)}x)`);
            }

            return analysis;

        } catch (error) {
            logger.error(`AI tracking failed for game end: ${error.message}`);
            return { analysis: "Error in tracking", flags: [`Error: ${error.message}`] };
        }
    }

    /**
     * Analyze betting patterns for suspicious behavior
     * @private
     */
    analyzeBettingPattern(playerData, currentBet) {
        if (playerData.recentBets.length === 0) {
            return { suspicious: false, reasons: [] };
        }

        const reasons = [];
        let suspicious = false;

        // Check for dramatic bet size increases
        const lastBet = playerData.recentBets[playerData.recentBets.length - 1];
        if (currentBet > lastBet.amount * 10) {
            reasons.push("Dramatic bet increase (10x+)");
            suspicious = true;
        }

        // Check for very high bet amounts relative to total wagered
        if (playerData.totalWagered > 0 && currentBet > playerData.totalWagered * 0.5) {
            reasons.push("Unusually large bet relative to history");
            suspicious = true;
        }

        return { suspicious, reasons };
    }

    /**
     * Calculate AI adjustments based on player behavior and wealth
     * @private
     */
    async calculateAIAdjustments(userId, playerData, totalWealth) {
        const flags = [];
        let multiplierAdjustment = 1.0;
        const recommendations = [];

        // Wealth-based adjustments (integrated with wealth ceiling)
        const wealthData = await wealthCeiling.getWealthMultiplierReduction(userId);
        if (wealthData.reduction > 0) {
            multiplierAdjustment *= (1 - wealthData.reduction);
            flags.push(`Wealth ceiling: ${wealthData.milestone}`);
            recommendations.push(`Wealth-based multiplier reduction: ${(wealthData.reduction * 100).toFixed(1)}%`);
        }

        // Win rate adjustments
        const recentWinRate = playerData.recentWins.length / Math.min(playerData.gamesPlayed, 20);
        if (recentWinRate > this.suspiciousThresholds.highWinRate) {
            multiplierAdjustment *= 0.8; // 20% reduction
            flags.push(`High win rate: ${(recentWinRate * 100).toFixed(1)}%`);
            recommendations.push("Reducing multipliers due to high win rate");
        }

        // Win streak adjustments
        if (playerData.winStreak > this.suspiciousThresholds.consecutiveWins) {
            multiplierAdjustment *= 0.85; // 15% reduction
            flags.push(`Long win streak: ${playerData.winStreak}`);
            recommendations.push("Reducing multipliers due to win streak");
        }

        return {
            multiplierAdjustment,
            flags,
            recommendations,
            wealthTier: this.getWealthTier(totalWealth)
        };
    }

    /**
     * Analyze for suspicious activity patterns
     * @private
     */
    analyzeSuspiciousActivity(playerData, won, payout, betAmount) {
        const flags = [];

        if (won) {
            const multiplier = payout / betAmount;
            
            // Flag large multiplier wins
            if (multiplier > this.suspiciousThresholds.largeWinMultiplier) {
                flags.push(`Large multiplier win: ${multiplier.toFixed(1)}x`);
            }

            // Flag consecutive wins
            if (playerData.winStreak > this.suspiciousThresholds.consecutiveWins) {
                flags.push(`Extended win streak: ${playerData.winStreak}`);
            }

            // Flag unusual win patterns
            const recentWinRate = playerData.recentWins.length / Math.min(playerData.gamesPlayed, 20);
            if (recentWinRate > this.suspiciousThresholds.highWinRate) {
                flags.push(`Unusually high win rate: ${(recentWinRate * 100).toFixed(1)}%`);
            }
        }

        return flags;
    }

    /**
     * Update game-specific statistics
     * @private
     */
    updateGameStats(gameType, won, betAmount, payout) {
        if (!this.gameStats.has(gameType)) {
            this.gameStats.set(gameType, {
                totalGames: 0,
                totalWagered: 0,
                totalPaidOut: 0,
                playerWins: 0
            });
        }

        const stats = this.gameStats.get(gameType);
        stats.totalGames++;
        stats.totalWagered += betAmount;
        stats.totalPaidOut += payout;
        if (won) stats.playerWins++;
    }

    /**
     * Generate AI recommendations based on patterns
     * @private
     */
    generateAIRecommendations(playerData, suspiciousFlags) {
        const recommendations = [];

        if (suspiciousFlags.length > 3) {
            recommendations.push("Consider implementing cooldown period");
            recommendations.push("Apply additional multiplier reductions");
        }

        if (playerData.winStreak > 10) {
            recommendations.push("Significantly reduce multipliers");
            recommendations.push("Limit maximum bet amounts");
        }

        const recentWinRate = playerData.recentWins.length / Math.min(playerData.gamesPlayed, 20);
        if (recentWinRate > 0.8) {
            recommendations.push("Player showing abnormal luck - apply strict limits");
        }

        return recommendations;
    }

    /**
     * Get wealth tier for a player
     * @private
     */
    getWealthTier(totalWealth) {
        if (totalWealth < 1000000) return "Regular ($0-$1M)";
        if (totalWealth < 10000000) return "Millionaire ($1M-$10M)";
        if (totalWealth < 100000000) return "Multi-Millionaire ($10M-$100M)";
        if (totalWealth < 500000000) return "High Roller ($100M-$500M)";
        if (totalWealth < 900000000) return "Mega Whale ($500M-$900M)";
        if (totalWealth < 1000000000) return "Billionaire Candidate ($900M-$1B)";
        return "Billionaire ($1B+)";
    }

    /**
     * Get AI tracking summary for admin commands
     */
    getTrackingSummary() {
        const activePlayers = this.playerPatterns.size;
        const activeSessions = this.activeSessions.size;
        const suspiciousPlayers = Array.from(this.playerPatterns.values())
            .filter(player => player.suspiciousFlags > 0).length;

        return {
            activePlayers,
            activeSessions,
            suspiciousPlayers,
            gameStats: Object.fromEntries(this.gameStats)
        };
    }
}

module.exports = new GameAITracker();