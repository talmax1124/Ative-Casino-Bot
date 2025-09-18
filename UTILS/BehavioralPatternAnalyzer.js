/**
 * Behavioral Pattern Analysis System
 * Advanced trend analysis mechanism that detects patterns across multiple dimensions:
 * - Temporal patterns (time-based behavior)
 * - Cross-game patterns (behavior across different games)
 * - Statistical anomalies (outliers in normal distribution)
 * - Betting behavior patterns (progression, timing, amounts)
 * - Social patterns (comparing to peer groups)
 */

const logger = require('./logger');
const dbManager = require('./database');
const { fmt } = require('./common');

class BehavioralPatternAnalyzer {
    constructor() {
        // Player behavior tracking
        this.playerBehaviorData = new Map();
        
        // Statistical baselines for anomaly detection
        this.gameBaselines = new Map();
        
        // Cross-game correlation tracking
        this.crossGamePatterns = new Map();
        
        // Temporal pattern detection
        this.temporalPatterns = new Map();
        
        // Anomaly detection thresholds
        this.anomalySigmas = {
            winRate: 2.5,           // 2.5 standard deviations for win rate
            betProgression: 3.0,    // 3.0 standard deviations for bet progression
            gameSession: 2.0,       // 2.0 standard deviations for session behavior
            crossGame: 2.5,         // 2.5 standard deviations for cross-game patterns
            temporal: 2.0           // 2.0 standard deviations for temporal patterns
        };
        
        // Initialize baselines
        this.initializeBaselines();
        
        // Start periodic analysis
        this.startPeriodicAnalysis();
    }
    
    /**
     * Initialize statistical baselines for each game
     */
    initializeBaselines() {
        const gameTypes = ['slots', 'blackjack', 'roulette', 'ceelo', 'crash', 'plinko', 'treasurevault'];
        
        for (const gameType of gameTypes) {
            this.gameBaselines.set(gameType, {
                averageWinRate: 0.45,        // Expected win rate
                stdDevWinRate: 0.15,         // Standard deviation of win rates
                averageBetProgression: 1.0,  // Expected bet progression multiplier
                stdDevBetProgression: 0.3,   // Standard deviation of bet progression
                averageSessionLength: 10,    // Expected games per session
                stdDevSessionLength: 5,      // Standard deviation of session length
                averageWinSize: 1.5,         // Expected win multiplier
                stdDevWinSize: 2.0,          // Standard deviation of win size
                lastUpdated: Date.now()
            });
        }
        
        logger.info('📊 Behavioral Pattern Analyzer: Statistical baselines initialized');
    }
    
    /**
     * Record a game event for behavioral analysis
     */
    async recordGameEvent(gameEvent) {
        try {
            const { userId, gameType, betAmount, payout, won, timestamp, metadata } = gameEvent;
            
            // Initialize player data if needed
            if (!this.playerBehaviorData.has(userId)) {
                this.playerBehaviorData.set(userId, {
                    totalGames: 0,
                    gameHistory: [],
                    crossGameBehavior: {},
                    temporalPatterns: {},
                    statisticalProfile: {},
                    anomalyFlags: [],
                    riskScore: 0.5,
                    lastAnalysis: 0
                });
            }
            
            const playerData = this.playerBehaviorData.get(userId);
            
            // Record the game event
            const gameRecord = {
                gameType,
                betAmount,
                payout,
                won,
                timestamp: timestamp || Date.now(),
                multiplier: betAmount > 0 ? payout / betAmount : 0,
                metadata: metadata || {}
            };
            
            playerData.gameHistory.push(gameRecord);
            playerData.totalGames++;
            
            // Keep only recent history (last 1000 games)
            if (playerData.gameHistory.length > 1000) {
                playerData.gameHistory.splice(0, playerData.gameHistory.length - 1000);
            }
            
            // Update cross-game behavior
            if (!playerData.crossGameBehavior[gameType]) {
                playerData.crossGameBehavior[gameType] = {
                    games: 0,
                    wins: 0,
                    totalBet: 0,
                    totalPayout: 0,
                    bigWins: 0,
                    lastPlayed: 0
                };
            }
            
            const gameStats = playerData.crossGameBehavior[gameType];
            gameStats.games++;
            gameStats.totalBet += betAmount;
            gameStats.totalPayout += payout;
            gameStats.lastPlayed = gameRecord.timestamp;
            
            if (won) {
                gameStats.wins++;
                if (gameRecord.multiplier >= 10) {
                    gameStats.bigWins++;
                }
            }
            
            // Trigger analysis if significant event or periodic check needed
            if (this.shouldTriggerAnalysis(playerData, gameRecord)) {
                await this.analyzePlayerBehavior(userId);
            }
            
        } catch (error) {
            logger.error(`Error recording game event for behavioral analysis: ${error.message}`);
        }
    }
    
    /**
     * Determine if analysis should be triggered
     */
    shouldTriggerAnalysis(playerData, gameRecord) {
        const now = Date.now();
        const timeSinceLastAnalysis = now - playerData.lastAnalysis;
        
        // Trigger conditions
        return (
            gameRecord.multiplier >= 20 ||                    // Big win occurred
            timeSinceLastAnalysis > 30 * 60 * 1000 ||        // 30 minutes since last analysis
            playerData.totalGames % 50 === 0 ||              // Every 50 games
            gameRecord.payout >= 10000000                     // 10M+ payout
        );
    }
    
    /**
     * Comprehensive behavioral analysis for a player
     */
    async analyzePlayerBehavior(userId) {
        try {
            const playerData = this.playerBehaviorData.get(userId);
            if (!playerData || playerData.gameHistory.length < 10) {
                return null; // Need minimum data for analysis
            }
            
            playerData.lastAnalysis = Date.now();
            
            // 1. Temporal Pattern Analysis
            const temporalAnalysis = this.analyzeTemporalPatterns(playerData);
            
            // 2. Cross-Game Correlation Analysis
            const crossGameAnalysis = this.analyzeCrossGamePatterns(playerData);
            
            // 3. Statistical Anomaly Detection
            const anomalyAnalysis = this.detectStatisticalAnomalies(playerData);
            
            // 4. Betting Behavior Analysis
            const bettingAnalysis = this.analyzeBettingBehavior(playerData);
            
            // 5. Win Pattern Analysis
            const winPatternAnalysis = this.analyzeWinPatterns(playerData);
            
            // Combine all analyses
            const comprehensiveAnalysis = {
                userId,
                timestamp: Date.now(),
                temporal: temporalAnalysis,
                crossGame: crossGameAnalysis,
                anomalies: anomalyAnalysis,
                betting: bettingAnalysis,
                winPatterns: winPatternAnalysis,
                overallRiskScore: this.calculateOverallRiskScore([
                    temporalAnalysis, crossGameAnalysis, anomalyAnalysis, 
                    bettingAnalysis, winPatternAnalysis
                ])
            };
            
            // Update player risk score
            playerData.riskScore = comprehensiveAnalysis.overallRiskScore;
            
            // Log significant findings
            if (comprehensiveAnalysis.overallRiskScore > 0.8) {
                logger.warn(`🚩 HIGH RISK PLAYER DETECTED: ${userId} (Risk Score: ${(comprehensiveAnalysis.overallRiskScore * 100).toFixed(1)}%)`);
                this.logAnalysisFindings(comprehensiveAnalysis);
            }
            
            return comprehensiveAnalysis;
            
        } catch (error) {
            logger.error(`Error analyzing player behavior: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Analyze temporal patterns (time-based behavior)
     */
    analyzeTemporalPatterns(playerData) {
        const recentGames = playerData.gameHistory.slice(-100); // Last 100 games
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        const oneDay = 24 * oneHour;
        
        // Time distribution analysis
        const hourlyDistribution = new Array(24).fill(0);
        const weeklyDistribution = new Array(7).fill(0);
        
        recentGames.forEach(game => {
            const gameDate = new Date(game.timestamp);
            hourlyDistribution[gameDate.getHours()]++;
            weeklyDistribution[gameDate.getDay()]++;
        });
        
        // Session pattern analysis
        const sessions = this.identifySessions(recentGames);
        const averageSessionLength = sessions.reduce((sum, s) => sum + s.games, 0) / sessions.length;
        const averageSessionDuration = sessions.reduce((sum, s) => sum + s.duration, 0) / sessions.length;
        
        // Rapid play detection
        const rapidPlayPeriods = this.detectRapidPlayPeriods(recentGames);
        
        // Calculate temporal risk factors
        let temporalRisk = 0;
        
        // Risk: Very concentrated playing times (potential bot behavior)
        const maxHourlyConcentration = Math.max(...hourlyDistribution) / recentGames.length;
        if (maxHourlyConcentration > 0.5) temporalRisk += 0.3;
        
        // Risk: Extremely long sessions
        if (averageSessionLength > 50) temporalRisk += 0.2;
        
        // Risk: Very rapid consecutive games
        if (rapidPlayPeriods.length > 5) temporalRisk += 0.3;
        
        return {
            hourlyDistribution,
            weeklyDistribution,
            sessions: sessions.length,
            averageSessionLength,
            averageSessionDuration,
            rapidPlayPeriods: rapidPlayPeriods.length,
            temporalRisk: Math.min(temporalRisk, 1.0),
            patterns: {
                nightOwl: hourlyDistribution.slice(22).concat(hourlyDistribution.slice(0, 6)).reduce((a, b) => a + b, 0) > recentGames.length * 0.4,
                weekendWarrior: weeklyDistribution.slice(5).reduce((a, b) => a + b, 0) > recentGames.length * 0.6,
                rapidFire: rapidPlayPeriods.length > 3
            }
        };
    }
    
    /**
     * Analyze cross-game patterns
     */
    analyzeCrossGamePatterns(playerData) {
        const gameTypes = Object.keys(playerData.crossGameBehavior);
        let crossGameRisk = 0;
        
        // Calculate win rates per game
        const gameWinRates = {};
        const gameMultipliers = {};
        
        for (const gameType of gameTypes) {
            const stats = playerData.crossGameBehavior[gameType];
            gameWinRates[gameType] = stats.games > 0 ? stats.wins / stats.games : 0;
            gameMultipliers[gameType] = stats.totalBet > 0 ? stats.totalPayout / stats.totalBet : 0;
        }
        
        // Risk: Consistently high win rates across multiple games
        const highWinRateGames = Object.values(gameWinRates).filter(rate => rate > 0.6).length;
        if (highWinRateGames >= 3) crossGameRisk += 0.4;
        
        // Risk: Game switching after losses (loss chasing)
        const switchingPattern = this.detectGameSwitchingPattern(playerData.gameHistory);
        if (switchingPattern.lossChasing) crossGameRisk += 0.3;
        
        // Risk: Unusual specialization (only plays profitable games)
        const profitableGames = Object.keys(gameMultipliers).filter(game => gameMultipliers[game] > 1.1).length;
        if (profitableGames >= 2 && gameTypes.length <= 3) crossGameRisk += 0.3;
        
        return {
            gamesPlayed: gameTypes.length,
            gameWinRates,
            gameMultipliers,
            switchingPattern,
            crossGameRisk: Math.min(crossGameRisk, 1.0),
            specialization: this.calculateGameSpecialization(playerData.crossGameBehavior)
        };
    }
    
    /**
     * Detect statistical anomalies
     */
    detectStatisticalAnomalies(playerData) {
        const recentGames = playerData.gameHistory.slice(-200); // Last 200 games
        const anomalies = [];
        let anomalyRisk = 0;
        
        // Group by game type for analysis
        const gameGroups = {};
        recentGames.forEach(game => {
            if (!gameGroups[game.gameType]) gameGroups[game.gameType] = [];
            gameGroups[game.gameType].push(game);
        });
        
        for (const [gameType, games] of Object.entries(gameGroups)) {
            if (games.length < 20) continue; // Need minimum sample size
            
            const baseline = this.gameBaselines.get(gameType);
            if (!baseline) continue;
            
            // Calculate actual statistics
            const winRate = games.filter(g => g.won).length / games.length;
            const avgMultiplier = games.reduce((sum, g) => sum + g.multiplier, 0) / games.length;
            const bigWins = games.filter(g => g.multiplier >= 10).length;
            
            // Check for anomalies
            const winRateZ = Math.abs(winRate - baseline.averageWinRate) / baseline.stdDevWinRate;
            const multiplierZ = Math.abs(avgMultiplier - baseline.averageWinSize) / baseline.stdDevWinSize;
            
            if (winRateZ > this.anomalySigmas.winRate) {
                anomalies.push({
                    type: 'WIN_RATE_ANOMALY',
                    gameType,
                    actual: winRate,
                    expected: baseline.averageWinRate,
                    zScore: winRateZ,
                    severity: winRateZ > 3.0 ? 'HIGH' : 'MEDIUM'
                });
                anomalyRisk += winRateZ > 3.0 ? 0.4 : 0.2;
            }
            
            if (multiplierZ > this.anomalySigmas.gameSession) {
                anomalies.push({
                    type: 'MULTIPLIER_ANOMALY',
                    gameType,
                    actual: avgMultiplier,
                    expected: baseline.averageWinSize,
                    zScore: multiplierZ,
                    severity: multiplierZ > 3.0 ? 'HIGH' : 'MEDIUM'
                });
                anomalyRisk += multiplierZ > 3.0 ? 0.3 : 0.15;
            }
            
            // Check for excessive big wins
            const expectedBigWins = games.length * 0.02; // Expect ~2% big wins
            if (bigWins > expectedBigWins * 3) {
                anomalies.push({
                    type: 'EXCESSIVE_BIG_WINS',
                    gameType,
                    actual: bigWins,
                    expected: expectedBigWins,
                    severity: 'HIGH'
                });
                anomalyRisk += 0.5;
            }
        }
        
        return {
            anomalies,
            anomalyCount: anomalies.length,
            anomalyRisk: Math.min(anomalyRisk, 1.0),
            highSeverityAnomalies: anomalies.filter(a => a.severity === 'HIGH').length
        };
    }
    
    /**
     * Analyze betting behavior patterns
     */
    analyzeBettingBehavior(playerData) {
        const recentGames = playerData.gameHistory.slice(-100);
        let bettingRisk = 0;
        
        // Bet progression analysis
        const betProgression = this.analyzeBetProgression(recentGames);
        if (betProgression.isProgressive && betProgression.aggressiveness > 2.0) {
            bettingRisk += 0.3;
        }
        
        // Bet size volatility
        const betAmounts = recentGames.map(g => g.betAmount);
        const avgBet = betAmounts.reduce((a, b) => a + b, 0) / betAmounts.length;
        const betStdDev = Math.sqrt(betAmounts.reduce((sum, bet) => sum + Math.pow(bet - avgBet, 2), 0) / betAmounts.length);
        const coefficientOfVariation = betStdDev / avgBet;
        
        if (coefficientOfVariation > 2.0) {
            bettingRisk += 0.2;
        }
        
        // All-in behavior detection
        const allInGames = this.detectAllInBehavior(recentGames);
        if (allInGames.frequency > 0.2) {
            bettingRisk += 0.4;
        }
        
        return {
            betProgression,
            avgBetAmount: avgBet,
            betVolatility: coefficientOfVariation,
            allInBehavior: allInGames,
            bettingRisk: Math.min(bettingRisk, 1.0)
        };
    }
    
    /**
     * Analyze win patterns
     */
    analyzeWinPatterns(playerData) {
        const recentGames = playerData.gameHistory.slice(-100);
        const wins = recentGames.filter(g => g.won);
        let winPatternRisk = 0;
        
        // Win streak analysis
        const streaks = this.analyzeWinStreaks(recentGames);
        if (streaks.longestWinStreak > 15) {
            winPatternRisk += 0.4;
        }
        
        // Win timing analysis
        const winTiming = this.analyzeWinTiming(recentGames);
        if (winTiming.isUnusual) {
            winPatternRisk += 0.3;
        }
        
        // Win size distribution
        const winSizes = wins.map(w => w.multiplier);
        const largeWins = winSizes.filter(m => m >= 10).length;
        const largeWinRate = largeWins / wins.length;
        
        if (largeWinRate > 0.15) { // More than 15% of wins are 10x+
            winPatternRisk += 0.3;
        }
        
        return {
            streaks,
            winTiming,
            largeWinRate,
            avgWinMultiplier: winSizes.reduce((a, b) => a + b, 0) / winSizes.length,
            winPatternRisk: Math.min(winPatternRisk, 1.0)
        };
    }
    
    /**
     * Calculate overall risk score from all analyses
     */
    calculateOverallRiskScore(analyses) {
        const risks = analyses.map(analysis => {
            if (analysis.temporalRisk !== undefined) return analysis.temporalRisk;
            if (analysis.crossGameRisk !== undefined) return analysis.crossGameRisk;
            if (analysis.anomalyRisk !== undefined) return analysis.anomalyRisk;
            if (analysis.bettingRisk !== undefined) return analysis.bettingRisk;
            if (analysis.winPatternRisk !== undefined) return analysis.winPatternRisk;
            return 0;
        });
        
        // Weighted average with emphasis on anomalies and win patterns
        const weights = [0.15, 0.2, 0.3, 0.15, 0.2]; // temporal, cross-game, anomalies, betting, win patterns
        let weightedSum = 0;
        let totalWeight = 0;
        
        for (let i = 0; i < risks.length && i < weights.length; i++) {
            weightedSum += risks[i] * weights[i];
            totalWeight += weights[i];
        }
        
        return totalWeight > 0 ? weightedSum / totalWeight : 0;
    }
    
    /**
     * Helper methods for detailed analysis
     */
    identifySessions(games) {
        const sessions = [];
        let currentSession = null;
        const sessionGap = 30 * 60 * 1000; // 30 minutes
        
        games.forEach(game => {
            if (!currentSession || game.timestamp - currentSession.lastGame > sessionGap) {
                if (currentSession) sessions.push(currentSession);
                currentSession = {
                    start: game.timestamp,
                    lastGame: game.timestamp,
                    games: 1,
                    duration: 0
                };
            } else {
                currentSession.games++;
                currentSession.lastGame = game.timestamp;
                currentSession.duration = currentSession.lastGame - currentSession.start;
            }
        });
        
        if (currentSession) sessions.push(currentSession);
        return sessions;
    }
    
    detectRapidPlayPeriods(games) {
        const rapidPeriods = [];
        const rapidThreshold = 10 * 1000; // 10 seconds between games
        
        for (let i = 1; i < games.length; i++) {
            if (games[i].timestamp - games[i-1].timestamp < rapidThreshold) {
                rapidPeriods.push({
                    start: games[i-1].timestamp,
                    end: games[i].timestamp,
                    gap: games[i].timestamp - games[i-1].timestamp
                });
            }
        }
        
        return rapidPeriods;
    }
    
    detectGameSwitchingPattern(games) {
        let lossChasing = false;
        let switchAfterLoss = 0;
        let totalSwitches = 0;
        
        for (let i = 1; i < games.length; i++) {
            if (games[i].gameType !== games[i-1].gameType) {
                totalSwitches++;
                if (!games[i-1].won) {
                    switchAfterLoss++;
                }
            }
        }
        
        if (totalSwitches > 0 && switchAfterLoss / totalSwitches > 0.7) {
            lossChasing = true;
        }
        
        return {
            lossChasing,
            switchAfterLossRate: totalSwitches > 0 ? switchAfterLoss / totalSwitches : 0,
            totalSwitches
        };
    }
    
    calculateGameSpecialization(crossGameBehavior) {
        const gameTypes = Object.keys(crossGameBehavior);
        const totalGames = Object.values(crossGameBehavior).reduce((sum, stats) => sum + stats.games, 0);
        
        const concentrations = gameTypes.map(gameType => 
            crossGameBehavior[gameType].games / totalGames
        );
        
        const maxConcentration = Math.max(...concentrations);
        const entropy = -concentrations.reduce((sum, p) => 
            p > 0 ? sum + p * Math.log2(p) : sum, 0
        );
        
        return {
            maxConcentration,
            entropy,
            isSpecialized: maxConcentration > 0.8 || entropy < 1.0
        };
    }
    
    analyzeBetProgression(games) {
        const progressions = [];
        
        for (let i = 1; i < games.length; i++) {
            if (games[i].gameType === games[i-1].gameType) {
                const progression = games[i].betAmount / games[i-1].betAmount;
                progressions.push(progression);
            }
        }
        
        const avgProgression = progressions.reduce((a, b) => a + b, 0) / progressions.length;
        const increasingBets = progressions.filter(p => p > 1.5).length;
        
        return {
            isProgressive: avgProgression > 1.2,
            aggressiveness: avgProgression,
            increasingBetFreq: increasingBets / progressions.length
        };
    }
    
    detectAllInBehavior(games) {
        // This would need integration with balance data
        // For now, detect large bet jumps as proxy
        const largeBets = games.filter(g => g.betAmount >= 1000000).length;
        
        return {
            frequency: largeBets / games.length,
            count: largeBets
        };
    }
    
    analyzeWinStreaks(games) {
        let currentStreak = 0;
        let longestWinStreak = 0;
        let longestLossStreak = 0;
        let currentLossStreak = 0;
        
        games.forEach(game => {
            if (game.won) {
                currentStreak++;
                currentLossStreak = 0;
                longestWinStreak = Math.max(longestWinStreak, currentStreak);
            } else {
                currentLossStreak++;
                currentStreak = 0;
                longestLossStreak = Math.max(longestLossStreak, currentLossStreak);
            }
        });
        
        return {
            longestWinStreak,
            longestLossStreak,
            currentStreak: games[games.length - 1]?.won ? currentStreak : -currentLossStreak
        };
    }
    
    analyzeWinTiming(games) {
        const wins = games.filter(g => g.won);
        const winIntervals = [];
        
        for (let i = 1; i < wins.length; i++) {
            winIntervals.push(wins[i].timestamp - wins[i-1].timestamp);
        }
        
        const avgInterval = winIntervals.reduce((a, b) => a + b, 0) / winIntervals.length;
        const stdDev = Math.sqrt(
            winIntervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / winIntervals.length
        );
        
        // Check if wins are too regular (potential manipulation)
        const isUnusual = stdDev / avgInterval < 0.3; // Very consistent timing
        
        return {
            avgInterval,
            stdDev,
            isUnusual
        };
    }
    
    /**
     * Log significant analysis findings
     */
    logAnalysisFindings(analysis) {
        logger.warn(`📊 BEHAVIORAL ANALYSIS FINDINGS for ${analysis.userId}:`);
        
        if (analysis.temporal.temporalRisk > 0.5) {
            logger.warn(`   🕒 Temporal Risk: ${(analysis.temporal.temporalRisk * 100).toFixed(1)}% - ${JSON.stringify(analysis.temporal.patterns)}`);
        }
        
        if (analysis.crossGame.crossGameRisk > 0.5) {
            logger.warn(`   🎮 Cross-Game Risk: ${(analysis.crossGame.crossGameRisk * 100).toFixed(1)}% - Plays ${analysis.crossGame.gamesPlayed} games`);
        }
        
        if (analysis.anomalies.anomalyCount > 0) {
            logger.warn(`   📈 Statistical Anomalies: ${analysis.anomalies.anomalyCount} detected (${analysis.anomalies.highSeverityAnomalies} high severity)`);
        }
        
        if (analysis.betting.bettingRisk > 0.5) {
            logger.warn(`   💰 Betting Risk: ${(analysis.betting.bettingRisk * 100).toFixed(1)}% - Volatility: ${analysis.betting.betVolatility.toFixed(2)}`);
        }
        
        if (analysis.winPatterns.winPatternRisk > 0.5) {
            logger.warn(`   🏆 Win Pattern Risk: ${(analysis.winPatterns.winPatternRisk * 100).toFixed(1)}% - Large win rate: ${(analysis.winPatterns.largeWinRate * 100).toFixed(1)}%`);
        }
    }
    
    /**
     * Start periodic analysis of all players
     */
    startPeriodicAnalysis() {
        // Analyze all players every 15 minutes
        setInterval(() => {
            this.performPeriodicAnalysis();
        }, 15 * 60 * 1000);
        
        // Update baselines every hour
        setInterval(() => {
            this.updateBaselines();
        }, 60 * 60 * 1000);
        
        logger.info('🔄 Behavioral Pattern Analyzer: Periodic analysis started (15min intervals)');
    }
    
    async performPeriodicAnalysis() {
        try {
            let highRiskPlayers = 0;
            
            for (const [userId, playerData] of this.playerBehaviorData) {
                if (Date.now() - playerData.lastAnalysis > 30 * 60 * 1000) { // 30+ minutes since last analysis
                    const analysis = await this.analyzePlayerBehavior(userId);
                    if (analysis && analysis.overallRiskScore > 0.8) {
                        highRiskPlayers++;
                    }
                }
            }
            
            if (highRiskPlayers > 0) {
                logger.info(`📊 Periodic Analysis: ${highRiskPlayers} high-risk players detected`);
            }
            
        } catch (error) {
            logger.error(`Error in periodic behavioral analysis: ${error.message}`);
        }
    }
    
    async updateBaselines() {
        try {
            // Update statistical baselines based on recent player data
            // This would involve analyzing aggregate player behavior
            logger.debug('📊 Updated behavioral analysis baselines');
        } catch (error) {
            logger.error(`Error updating baselines: ${error.message}`);
        }
    }
    
    /**
     * Get comprehensive system status
     */
    getSystemStatus() {
        const totalPlayers = this.playerBehaviorData.size;
        let highRiskPlayers = 0;
        let activeAnalyses = 0;
        
        for (const [userId, playerData] of this.playerBehaviorData) {
            if (playerData.riskScore > 0.8) highRiskPlayers++;
            if (Date.now() - playerData.lastAnalysis < 60 * 60 * 1000) activeAnalyses++;
        }
        
        return {
            totalPlayersTracked: totalPlayers,
            highRiskPlayers,
            activeAnalyses,
            systemHealth: highRiskPlayers / Math.max(totalPlayers, 1) < 0.05 ? 'HEALTHY' : 'ALERT'
        };
    }
}

// Export singleton instance
module.exports = new BehavioralPatternAnalyzer();