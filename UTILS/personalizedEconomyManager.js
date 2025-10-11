/**
 * PERSONALIZED ECONOMY MANAGER
 * Tracks individual user impact on economy and adjusts payouts accordingly
 * Users who impact economy more get reduced payouts, low-impact users get bonuses
 */

const marketCapManager = require('./marketCapManager');
const logger = require('./logger');
const securityLogger = require('./securityLogger');
const economyChannelLogger = require('./economyChannelLogger');

class PersonalizedEconomyManager {
    constructor() {
        // Track individual user economic impact
        this.userImpactData = new Map(); // userId -> impact data
        
        // Economic impact thresholds (monthly amounts)
        this.IMPACT_THRESHOLDS = {
            WHALE: 50000000000,      // $50B+ monthly - major impact
            HIGH_ROLLER: 10000000000, // $10B+ monthly - significant impact  
            REGULAR: 1000000000,      // $1B+ monthly - moderate impact
            CASUAL: 100000000,        // $100M+ monthly - low impact
            MINIMAL: 0                // Under $100M - minimal impact
        };
        
        // Payout multipliers based on impact level
        this.PAYOUT_MULTIPLIERS = {
            WHALE: 0.1,      // 90% reduction for massive impact
            HIGH_ROLLER: 0.3, // 70% reduction for high impact
            REGULAR: 0.7,     // 30% reduction for moderate impact
            CASUAL: 1.0,      // Normal payouts for low impact
            MINIMAL: 2.0      // 100% bonus for minimal impact
        };
        
        // Leaderboard for top economic impactors
        this.economicLeaderboard = [];
        
        // Analysis intervals
        this.setupAnalysisIntervals();
        
        logger.info('Personalized Economy Manager initialized', {
            monthlyCapTrillion: marketCapManager.MONTHLY_MARKET_CAP / 1000000000000,
            thresholds: this.IMPACT_THRESHOLDS,
            multipliers: this.PAYOUT_MULTIPLIERS
        });
    }
    
    setupAnalysisIntervals() {
        // Deep analysis every 5 minutes
        setInterval(() => {
            this.runDeepEconomicAnalysis();
        }, 5 * 60 * 1000); // 5 minutes
        
        // Update leaderboard every minute
        setInterval(() => {
            this.updateEconomicLeaderboard();
        }, 60 * 1000); // 1 minute
        
        // Reset monthly data
        setInterval(() => {
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            // Check if month changed
            if (this.lastResetMonth !== currentMonth || this.lastResetYear !== currentYear) {
                this.resetMonthlyUserData();
                this.lastResetMonth = currentMonth;
                this.lastResetYear = currentYear;
            }
        }, 60 * 60 * 1000); // Check every hour
    }
    
    recordUserTransaction(userId, amount, gameType, transactionType = 'bet') {
        try {
            // Get or create user impact data
            if (!this.userImpactData.has(userId)) {
                this.userImpactData.set(userId, {
                    monthlyVolume: 0,
                    dailyVolume: 0,
                    totalBets: 0,
                    totalWins: 0,
                    totalWinnings: 0,
                    gameBreakdown: {},
                    impactLevel: 'MINIMAL',
                    personalMultiplier: 2.0,
                    lastActivity: new Date(),
                    joinDate: new Date()
                });
            }
            
            const userData = this.userImpactData.get(userId);
            
            // Update user data
            userData.monthlyVolume += amount;
            userData.dailyVolume += amount;
            userData.totalBets += (transactionType === 'bet' ? 1 : 0);
            userData.totalWins += (transactionType === 'payout' ? 1 : 0);
            userData.totalWinnings += (transactionType === 'payout' ? amount : 0);
            userData.lastActivity = new Date();
            
            // Update game breakdown
            if (!userData.gameBreakdown[gameType]) {
                userData.gameBreakdown[gameType] = {
                    volume: 0,
                    bets: 0,
                    wins: 0,
                    winnings: 0
                };
            }
            
            const gameData = userData.gameBreakdown[gameType];
            gameData.volume += amount;
            gameData.bets += (transactionType === 'bet' ? 1 : 0);
            gameData.wins += (transactionType === 'payout' ? 1 : 0);
            gameData.winnings += (transactionType === 'payout' ? amount : 0);
            
            // Recalculate impact level and personal multiplier
            this.calculateUserImpact(userId);
            
            // Log significant impacts
            if (amount > 1000000) { // $1M+
                this.logToChannel('LARGE_TRANSACTION', {
                    userId: userId,
                    amount: amount,
                    gameType: gameType,
                    transactionType: transactionType,
                    monthlyVolume: userData.monthlyVolume,
                    impactLevel: userData.impactLevel,
                    personalMultiplier: userData.personalMultiplier
                });
            }
            
        } catch (error) {
            logger.error(`Failed to record user transaction: ${error.message}`);
        }
    }
    
    calculateUserImpact(userId) {
        const userData = this.userImpactData.get(userId);
        if (!userData) return;
        
        const monthlyVolume = userData.monthlyVolume;
        let newImpactLevel;
        let newMultiplier;
        
        // Determine impact level based on monthly volume
        if (monthlyVolume >= this.IMPACT_THRESHOLDS.WHALE) {
            newImpactLevel = 'WHALE';
            newMultiplier = this.PAYOUT_MULTIPLIERS.WHALE;
        } else if (monthlyVolume >= this.IMPACT_THRESHOLDS.HIGH_ROLLER) {
            newImpactLevel = 'HIGH_ROLLER';
            newMultiplier = this.PAYOUT_MULTIPLIERS.HIGH_ROLLER;
        } else if (monthlyVolume >= this.IMPACT_THRESHOLDS.REGULAR) {
            newImpactLevel = 'REGULAR';
            newMultiplier = this.PAYOUT_MULTIPLIERS.REGULAR;
        } else if (monthlyVolume >= this.IMPACT_THRESHOLDS.CASUAL) {
            newImpactLevel = 'CASUAL';
            newMultiplier = this.PAYOUT_MULTIPLIERS.CASUAL;
        } else {
            newImpactLevel = 'MINIMAL';
            newMultiplier = this.PAYOUT_MULTIPLIERS.MINIMAL;
        }
        
        // Log impact level changes
        if (newImpactLevel !== userData.impactLevel) {
            logger.warn(`User impact level changed: ${userId} ${userData.impactLevel} -> ${newImpactLevel}`, {
                monthlyVolume: monthlyVolume,
                oldMultiplier: userData.personalMultiplier,
                newMultiplier: newMultiplier
            });
            
            economyChannelLogger.logPersonalizedAdjustment(
                userId,
                userData.impactLevel,
                newImpactLevel,
                userData.personalMultiplier,
                newMultiplier,
                `Monthly volume: $${monthlyVolume.toLocaleString()} (${((monthlyVolume / marketCapManager.MONTHLY_MARKET_CAP) * 100).toFixed(4)}% of cap)`
            );
        }
        
        userData.impactLevel = newImpactLevel;
        userData.personalMultiplier = newMultiplier;
    }
    
    getPersonalizedPayout(userId, basePayout, gameType) {
        const userData = this.userImpactData.get(userId);
        if (!userData) {
            // New user gets bonus multiplier
            return basePayout * this.PAYOUT_MULTIPLIERS.MINIMAL;
        }
        
        // Apply personal multiplier
        const personalizedPayout = basePayout * userData.personalMultiplier;
        
        // Also apply global market multiplier for additional balance
        const globalMultiplier = marketCapManager.getEconomicMultiplier();
        const finalPayout = personalizedPayout * globalMultiplier;
        
        // Log significant payout adjustments
        const reduction = ((basePayout - finalPayout) / basePayout) * 100;
        if (Math.abs(reduction) > 50) { // More than 50% adjustment
            economyChannelLogger.logUserPayout(
                userId,
                gameType,
                basePayout,
                finalPayout,
                userData.personalMultiplier * globalMultiplier,
                userData.impactLevel
            );
        }
        
        return Math.max(finalPayout, basePayout * 0.01); // Minimum 1% of base payout
    }
    
    getUserImpactData(userId) {
        return this.userImpactData.get(userId) || null;
    }
    
    updateEconomicLeaderboard() {
        try {
            // Sort users by monthly volume
            const sortedUsers = Array.from(this.userImpactData.entries())
                .map(([userId, data]) => ({
                    userId: userId,
                    monthlyVolume: data.monthlyVolume,
                    impactLevel: data.impactLevel,
                    personalMultiplier: data.personalMultiplier,
                    totalBets: data.totalBets,
                    totalWinnings: data.totalWinnings
                }))
                .sort((a, b) => b.monthlyVolume - a.monthlyVolume)
                .slice(0, 20); // Top 20
            
            this.economicLeaderboard = sortedUsers;
            
            // Log leaderboard changes
            if (sortedUsers.length > 0) {
                logger.info('Economic leaderboard updated', {
                    topUser: sortedUsers[0],
                    totalUsers: this.userImpactData.size,
                    whaleCount: sortedUsers.filter(u => u.impactLevel === 'WHALE').length,
                    highRollerCount: sortedUsers.filter(u => u.impactLevel === 'HIGH_ROLLER').length
                });
            }
            
        } catch (error) {
            logger.error(`Failed to update economic leaderboard: ${error.message}`);
        }
    }
    
    async runDeepEconomicAnalysis() {
        try {
            const analysisStart = Date.now();
            
            // Gather comprehensive data
            const marketStatus = marketCapManager.getMarketStatus();
            const totalUsers = this.userImpactData.size;
            const activeUsers = Array.from(this.userImpactData.values())
                .filter(user => Date.now() - user.lastActivity.getTime() < 24 * 60 * 60 * 1000).length;
            
            // Calculate distribution metrics
            const impactDistribution = {
                WHALE: 0, HIGH_ROLLER: 0, REGULAR: 0, CASUAL: 0, MINIMAL: 0
            };
            
            let totalUserVolume = 0;
            let totalUserWinnings = 0;
            const gameDistribution = {};
            
            for (const userData of this.userImpactData.values()) {
                impactDistribution[userData.impactLevel]++;
                totalUserVolume += userData.monthlyVolume;
                totalUserWinnings += userData.totalWinnings;
                
                for (const [game, gameData] of Object.entries(userData.gameBreakdown)) {
                    if (!gameDistribution[game]) {
                        gameDistribution[game] = { volume: 0, bets: 0, wins: 0, winnings: 0 };
                    }
                    gameDistribution[game].volume += gameData.volume;
                    gameDistribution[game].bets += gameData.bets;
                    gameDistribution[game].wins += gameData.wins;
                    gameDistribution[game].winnings += gameData.winnings;
                }
            }
            
            // Calculate economic health metrics
            const houseEdge = totalUserVolume > 0 ? ((totalUserVolume - totalUserWinnings) / totalUserVolume) * 100 : 0;
            const averageUserVolume = totalUsers > 0 ? totalUserVolume / totalUsers : 0;
            const whaleImpactPercentage = totalUserVolume > 0 ? 
                (Array.from(this.userImpactData.values())
                    .filter(u => u.impactLevel === 'WHALE')
                    .reduce((sum, u) => sum + u.monthlyVolume, 0) / totalUserVolume) * 100 : 0;
            
            // Detect concerning patterns
            const concerns = [];
            if (whaleImpactPercentage > 70) {
                concerns.push(`Whale dominance: ${whaleImpactPercentage.toFixed(1)}% of economy`);
            }
            if (houseEdge < 5) {
                concerns.push(`Low house edge: ${houseEdge.toFixed(2)}%`);
            }
            if (houseEdge > 50) {
                concerns.push(`Excessive house edge: ${houseEdge.toFixed(2)}%`);
            }
            if (activeUsers < totalUsers * 0.1) {
                concerns.push(`Low activity: ${activeUsers}/${totalUsers} users active`);
            }
            
            const analysis = {
                timestamp: new Date().toISOString(),
                analysisTime: Date.now() - analysisStart,
                marketStatus: marketStatus,
                userMetrics: {
                    totalUsers: totalUsers,
                    activeUsers: activeUsers,
                    impactDistribution: impactDistribution,
                    averageUserVolume: averageUserVolume,
                    whaleImpactPercentage: whaleImpactPercentage
                },
                economicHealth: {
                    houseEdge: houseEdge,
                    totalVolume: totalUserVolume,
                    totalWinnings: totalUserWinnings,
                    netProfit: totalUserVolume - totalUserWinnings
                },
                gameDistribution: gameDistribution,
                leaderboard: this.economicLeaderboard.slice(0, 5),
                concerns: concerns,
                recommendations: this.generateRecommendations(concerns, impactDistribution, houseEdge)
            };
            
            // Log comprehensive analysis
            economyChannelLogger.logDeepAnalysis(
                analysis.analysisTime,
                totalUsers,
                totalUserVolume,
                concerns.length > 2 ? 'HIGH' : concerns.length > 0 ? 'MEDIUM' : 'LOW',
                analysis.recommendations.join(' | ')
            );
            
            // Auto-adjust system based on analysis
            await this.autoAdjustEconomicSystem(analysis);
            
            logger.info('Deep economic analysis completed', {
                analysisTime: analysis.analysisTime + 'ms',
                totalUsers: totalUsers,
                concerns: concerns.length,
                houseEdge: houseEdge.toFixed(2) + '%'
            });
            
        } catch (error) {
            logger.error(`Failed to run deep economic analysis: ${error.message}`);
            economyChannelLogger.logSecurityAlert(
                'ANALYSIS_ERROR',
                null,
                `Deep economic analysis failed: ${error.message}`,
                'System logged error for admin review'
            );
        }
    }
    
    generateRecommendations(concerns, impactDistribution, houseEdge) {
        const recommendations = [];
        
        if (concerns.some(c => c.includes('Whale dominance'))) {
            recommendations.push('Consider implementing progressive payout restrictions for whale users');
            recommendations.push('Monitor for potential market manipulation by high-volume users');
        }
        
        if (houseEdge < 5) {
            recommendations.push('Increase base house edge or reduce bonus multipliers');
            recommendations.push('Review payout calculations for potential exploits');
        }
        
        if (houseEdge > 50) {
            recommendations.push('Reduce restrictions or increase bonus multipliers for low-impact users');
            recommendations.push('Review if economy is too restrictive');
        }
        
        if (impactDistribution.MINIMAL < impactDistribution.WHALE) {
            recommendations.push('Encourage new player onboarding with better bonuses');
            recommendations.push('Review retention strategies for casual users');
        }
        
        return recommendations;
    }
    
    async autoAdjustEconomicSystem(analysis) {
        try {
            // Auto-adjust thresholds if needed
            if (analysis.concerns.some(c => c.includes('Whale dominance'))) {
                // Make whale threshold stricter
                this.IMPACT_THRESHOLDS.WHALE = Math.max(
                    this.IMPACT_THRESHOLDS.WHALE * 0.8, 
                    10000000000 // Never below $10B
                );
                
                logger.warn('Auto-adjusted whale threshold', {
                    newThreshold: this.IMPACT_THRESHOLDS.WHALE,
                    reason: 'Whale dominance detected'
                });
            }
            
            // Auto-adjust multipliers for balance
            if (analysis.economicHealth.houseEdge < 5) {
                // Reduce all multipliers slightly
                for (const level of Object.keys(this.PAYOUT_MULTIPLIERS)) {
                    this.PAYOUT_MULTIPLIERS[level] *= 0.95;
                }
                
                logger.warn('Auto-reduced payout multipliers', {
                    reason: 'Low house edge detected',
                    houseEdge: analysis.economicHealth.houseEdge
                });
            }
            
            if (analysis.economicHealth.houseEdge > 50) {
                // Increase multipliers for low-impact users
                this.PAYOUT_MULTIPLIERS.MINIMAL = Math.min(
                    this.PAYOUT_MULTIPLIERS.MINIMAL * 1.1,
                    3.0 // Cap at 3x
                );
                this.PAYOUT_MULTIPLIERS.CASUAL = Math.min(
                    this.PAYOUT_MULTIPLIERS.CASUAL * 1.05,
                    1.5 // Cap at 1.5x
                );
                
                logger.warn('Auto-increased multipliers for low-impact users', {
                    reason: 'Excessive house edge detected',
                    houseEdge: analysis.economicHealth.houseEdge
                });
            }
            
        } catch (error) {
            logger.error(`Failed to auto-adjust economic system: ${error.message}`);
        }
    }
    
    logToChannel(eventType, data) {
        try {
            // Log to console for now (will integrate with Discord channel)
            console.log(`📊 [ECONOMY] ${eventType}:`, JSON.stringify(data, null, 2));
            
            // Also log to security logger
            securityLogger.logSecurityEvent('ECONOMY_SYSTEM', eventType, data);
            
            // TODO: Post to Discord logs channel
            // This would integrate with the Discord client to post to a specific channel
            
        } catch (error) {
            logger.error(`Failed to log to channel: ${error.message}`);
        }
    }
    
    resetMonthlyUserData() {
        logger.warn('Resetting monthly user data');
        
        for (const userData of this.userImpactData.values()) {
            userData.monthlyVolume = 0;
            userData.dailyVolume = 0;
            // Keep lifetime stats but reset monthly counters
        }
        
        this.logToChannel('MONTHLY_RESET', {
            timestamp: new Date().toISOString(),
            usersReset: this.userImpactData.size
        });
    }
    
    // Admin functions
    getUserReport(userId) {
        const userData = this.userImpactData.get(userId);
        if (!userData) return null;
        
        return {
            userId: userId,
            impactLevel: userData.impactLevel,
            personalMultiplier: userData.personalMultiplier,
            monthlyVolume: userData.monthlyVolume,
            totalBets: userData.totalBets,
            totalWinnings: userData.totalWinnings,
            winRate: userData.totalBets > 0 ? (userData.totalWins / userData.totalBets * 100).toFixed(2) + '%' : '0%',
            marketImpact: (userData.monthlyVolume / marketCapManager.MONTHLY_MARKET_CAP * 100).toFixed(6) + '%',
            gameBreakdown: userData.gameBreakdown,
            lastActivity: userData.lastActivity,
            joinDate: userData.joinDate
        };
    }
    
    getEconomicLeaderboard() {
        return this.economicLeaderboard;
    }
    // Helper methods for dynamic game adjuster integration
    async getUserPayoutMultiplier(userId) {
        const userData = this.userImpactData.get(userId);
        if (!userData) {
            return this.PAYOUT_MULTIPLIERS.MINIMAL; // New users get bonus
        }
        return userData.personalMultiplier;
    }
    
    async getUserImpactLevel(userId) {
        const userData = this.userImpactData.get(userId);
        if (!userData) {
            return 'MINIMAL';
        }
        return userData.impactLevel;
    }
    
    async getUserEconomicScore(userId) {
        const userData = this.userImpactData.get(userId);
        if (!userData) {
            return 0;
        }
        
        // Calculate economic score based on volume and activity
        const volumeScore = userData.monthlyVolume / 1000000; // Score in millions
        const activityScore = userData.totalBets / 100; // Score per 100 bets
        const winRatio = userData.totalBets > 0 ? userData.totalWins / userData.totalBets : 0;
        const efficiencyScore = winRatio * 100;
        
        return volumeScore + activityScore + efficiencyScore;
    }
    
    async recordUserBet(userId, gameType, betAmount) {
        this.recordUserTransaction(userId, betAmount, gameType, 'bet');
        this.calculateUserImpact(userId);
        
        // Log user bet
        const userData = this.userImpactData.get(userId);
        if (userData) {
            economyChannelLogger.logUserBet(userId, gameType, betAmount, {
                impactLevel: userData.impactLevel,
                economicScore: await this.getUserEconomicScore(userId),
                payoutMultiplier: userData.personalMultiplier
            });
        }
    }
    
    async recordUserPayout(userId, gameType, payoutAmount, betAmount) {
        this.recordUserTransaction(userId, payoutAmount, gameType, 'payout');
        this.calculateUserImpact(userId);
        
        // Update leaderboard
        this.updateEconomicLeaderboard();
    }
    
    async getEconomicReport() {
        const totalUsers = this.userImpactData.size;
        const activeUsers = Array.from(this.userImpactData.values())
            .filter(user => Date.now() - user.lastActivity.getTime() < 24 * 60 * 60 * 1000).length;
        
        const totalVolume = Array.from(this.userImpactData.values())
            .reduce((sum, user) => sum + user.monthlyVolume, 0);
        
        const totalWinnings = Array.from(this.userImpactData.values())
            .reduce((sum, user) => sum + user.totalWinnings, 0);
        
        const impactDistribution = {};
        for (const level of Object.keys(this.PAYOUT_MULTIPLIERS)) {
            impactDistribution[level] = Array.from(this.userImpactData.values())
                .filter(user => user.impactLevel === level).length;
        }
        
        return {
            totalUsers: totalUsers,
            activeUsers: activeUsers,
            totalVolume: totalVolume,
            totalWinnings: totalWinnings,
            houseProfit: totalVolume - totalWinnings,
            houseEdge: totalVolume > 0 ? ((totalVolume - totalWinnings) / totalVolume * 100) : 0,
            impactDistribution: impactDistribution,
            leaderboard: this.economicLeaderboard.slice(0, 10)
        };
    }
}

// Create singleton instance
const personalizedEconomyManager = new PersonalizedEconomyManager();

module.exports = personalizedEconomyManager;