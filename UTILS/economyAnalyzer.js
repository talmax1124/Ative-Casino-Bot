/**
 * Economy Analyzer and Dynamic Multiplier System
 * Analyzes server economy health and adjusts game multipliers accordingly
 */

const dbManager = require('./database');
const logger = require('./logger');
const { getGuildId } = require('./common');

class EconomyAnalyzer {
    constructor() {
        this.analysisCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes cache
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        // Start periodic analysis
        this.startPeriodicAnalysis();
        this.initialized = true;
        logger.info('Economy Analyzer initialized');
    }

    /**
     * Start periodic economy analysis (every 10 minutes)
     */
    startPeriodicAnalysis() {
        setInterval(async () => {
            try {
                await this.runFullEconomyAnalysis();
            } catch (error) {
                logger.error(`Error in periodic economy analysis: ${error.message}`);
            }
        }, 10 * 60 * 1000); // 10 minutes
    }

    /**
     * Run comprehensive economy analysis
     */
    async runFullEconomyAnalysis(guildId = null) {
        try {
            logger.info('Running comprehensive economy analysis...');
            
            const analysis = {
                timestamp: Date.now(),
                totalUsers: 0,
                totalWealth: 0,
                averageBalance: 0,
                medianBalance: 0,
                wealthDistribution: {},
                gameStats: {},
                winLossRatios: {},
                economyHealth: 'UNKNOWN',
                inflationRate: 0,
                recommendations: []
            };

            // Get all users
            const allUsers = await dbManager.getAllUsers(guildId);
            if (!allUsers || allUsers.length === 0) {
                logger.warn('No users found for economy analysis');
                return this.getDefaultAnalysis();
            }

            analysis.totalUsers = allUsers.length;

            // Calculate wealth statistics
            const balances = allUsers.map(user => (user.wallet || 0) + (user.bank || 0));
            analysis.totalWealth = balances.reduce((sum, balance) => sum + balance, 0);
            analysis.averageBalance = analysis.totalWealth / analysis.totalUsers;
            
            // Calculate median balance
            const sortedBalances = balances.sort((a, b) => a - b);
            const mid = Math.floor(sortedBalances.length / 2);
            analysis.medianBalance = sortedBalances.length % 2 !== 0 
                ? sortedBalances[mid] 
                : (sortedBalances[mid - 1] + sortedBalances[mid]) / 2;

            // Analyze wealth distribution
            analysis.wealthDistribution = this.analyzeWealthDistribution(balances);

            // Get game statistics
            analysis.gameStats = await this.analyzeGameStatistics(guildId);

            // Calculate win/loss ratios for each game
            analysis.winLossRatios = this.calculateWinLossRatios(analysis.gameStats);

            // Determine economy health
            analysis.economyHealth = this.determineEconomyHealth(analysis);

            // Calculate inflation rate (based on recent wealth changes)
            analysis.inflationRate = await this.calculateInflationRate(guildId);

            // Generate recommendations
            analysis.recommendations = this.generateRecommendations(analysis);

            // Cache the analysis
            this.analysisCache.set(guildId || 'global', analysis);

            logger.info(`Economy analysis complete: Health=${analysis.economyHealth}, AvgBalance=${Math.floor(analysis.averageBalance)}, Users=${analysis.totalUsers}`);
            
            return analysis;

        } catch (error) {
            logger.error(`Error in economy analysis: ${error.message}`);
            return this.getDefaultAnalysis();
        }
    }

    /**
     * Analyze wealth distribution patterns
     */
    analyzeWealthDistribution(balances) {
        const distribution = {
            poor: 0,      // < 50K
            middle: 0,    // 50K - 500K  
            rich: 0,      // 500K - 2M
            wealthy: 0,   // 2M - 10M
            elite: 0      // > 10M
        };

        balances.forEach(balance => {
            if (balance < 50000) distribution.poor++;
            else if (balance < 500000) distribution.middle++;
            else if (balance < 2000000) distribution.rich++;
            else if (balance < 10000000) distribution.wealthy++;
            else distribution.elite++;
        });

        // Calculate percentages
        const total = balances.length;
        return {
            poor: { count: distribution.poor, percentage: (distribution.poor / total) * 100 },
            middle: { count: distribution.middle, percentage: (distribution.middle / total) * 100 },
            rich: { count: distribution.rich, percentage: (distribution.rich / total) * 100 },
            wealthy: { count: distribution.wealthy, percentage: (distribution.wealthy / total) * 100 },
            elite: { count: distribution.elite, percentage: (distribution.elite / total) * 100 }
        };
    }

    /**
     * Analyze game statistics across all games
     */
    async analyzeGameStatistics(guildId) {
        try {
            const gameStats = await dbManager.getGameStatistics(guildId);
            return gameStats || {};
        } catch (error) {
            logger.error(`Error getting game statistics: ${error.message}`);
            return {};
        }
    }

    /**
     * Calculate win/loss ratios for each game
     */
    calculateWinLossRatios(gameStats) {
        const ratios = {};
        
        for (const [game, stats] of Object.entries(gameStats)) {
            if (stats.total_games > 0) {
                ratios[game] = {
                    winRate: (stats.total_wins / stats.total_games) * 100,
                    houseEdge: ((stats.total_wagered - stats.total_won) / stats.total_wagered) * 100,
                    avgBet: stats.total_wagered / stats.total_games,
                    profitPerGame: (stats.total_wagered - stats.total_won) / stats.total_games,
                    totalProfit: stats.total_wagered - stats.total_won
                };
            }
        }
        
        return ratios;
    }

    /**
     * Determine overall economy health
     */
    determineEconomyHealth(analysis) {
        let healthScore = 0;
        
        // Factor 1: Wealth distribution balance (30% weight)
        const distribution = analysis.wealthDistribution;
        if (distribution.poor.percentage < 60) healthScore += 30;
        else if (distribution.poor.percentage < 75) healthScore += 20;
        else if (distribution.poor.percentage < 85) healthScore += 10;
        
        // Factor 2: Average game house edge (40% weight)
        let totalHouseEdge = 0;
        let gameCount = 0;
        
        for (const [game, ratio] of Object.entries(analysis.winLossRatios)) {
            if (ratio.houseEdge > 0) {
                totalHouseEdge += ratio.houseEdge;
                gameCount++;
            }
        }
        
        const avgHouseEdge = gameCount > 0 ? totalHouseEdge / gameCount : 0;
        if (avgHouseEdge > 15) healthScore += 40;
        else if (avgHouseEdge > 10) healthScore += 35;
        else if (avgHouseEdge > 5) healthScore += 25;
        else if (avgHouseEdge > 2) healthScore += 15;
        else if (avgHouseEdge > -5) healthScore += 5;
        
        // Factor 3: User activity and engagement (20% weight)
        if (analysis.totalUsers > 100) healthScore += 20;
        else if (analysis.totalUsers > 50) healthScore += 15;
        else if (analysis.totalUsers > 20) healthScore += 10;
        else if (analysis.totalUsers > 5) healthScore += 5;
        
        // Factor 4: Inflation rate (10% weight)
        if (analysis.inflationRate < 5) healthScore += 10;
        else if (analysis.inflationRate < 15) healthScore += 5;
        
        // Determine health level
        if (healthScore >= 80) return 'EXCELLENT';
        else if (healthScore >= 65) return 'GOOD';
        else if (healthScore >= 50) return 'FAIR';
        else if (healthScore >= 35) return 'POOR';
        else return 'CRITICAL';
    }

    /**
     * Calculate inflation rate based on recent wealth changes
     */
    async calculateInflationRate(guildId) {
        try {
            // This is a simplified calculation
            // In a real implementation, you'd track wealth over time
            return 0; // Placeholder for now
        } catch (error) {
            logger.error(`Error calculating inflation rate: ${error.message}`);
            return 0;
        }
    }

    /**
     * Generate economy recommendations
     */
    generateRecommendations(analysis) {
        const recommendations = [];
        
        // Check wealth distribution
        if (analysis.wealthDistribution.poor.percentage > 80) {
            recommendations.push({
                type: 'CRITICAL',
                category: 'WEALTH_DISTRIBUTION',
                message: 'Too many poor players - increase earning opportunities or reduce game difficulty',
                action: 'INCREASE_PAYOUTS'
            });
        }
        
        // Check game house edges
        for (const [game, ratio] of Object.entries(analysis.winLossRatios)) {
            if (ratio.houseEdge < 2) {
                recommendations.push({
                    type: 'WARNING',
                    category: 'GAME_BALANCE',
                    message: `${game} house edge too low (${ratio.houseEdge.toFixed(1)}%) - players winning too much`,
                    action: 'REDUCE_MULTIPLIERS',
                    game: game
                });
            } else if (ratio.houseEdge > 25) {
                recommendations.push({
                    type: 'WARNING', 
                    category: 'GAME_BALANCE',
                    message: `${game} house edge too high (${ratio.houseEdge.toFixed(1)}%) - players losing too much`,
                    action: 'INCREASE_MULTIPLIERS',
                    game: game
                });
            }
        }
        
        return recommendations;
    }

    /**
     * Get cached analysis or run new one
     */
    async getEconomyAnalysis(guildId = null) {
        const cacheKey = guildId || 'global';
        const cached = this.analysisCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
            return cached;
        }
        
        return await this.runFullEconomyAnalysis(guildId);
    }

    /**
     * Get dynamic multipliers for a specific game
     */
    async getDynamicMultipliers(game, baseMultipliers, guildId = null) {
        try {
            const analysis = await this.getEconomyAnalysis(guildId);
            const gameRatio = analysis.winLossRatios[game];
            
            if (!gameRatio) {
                logger.warn(`No game data found for ${game}, using base multipliers`);
                return baseMultipliers;
            }

            // Calculate adjustment factor based on house edge
            let adjustmentFactor = 1.0;
            
            // Target house edge: 8-15% (healthy range)
            const targetHouseEdge = 12;
            const currentHouseEdge = gameRatio.houseEdge;
            
            if (currentHouseEdge < 5) {
                // House edge too low, reduce multipliers significantly
                adjustmentFactor = 0.6;
                logger.info(`${game}: House edge too low (${currentHouseEdge.toFixed(1)}%), reducing multipliers to ${adjustmentFactor}`);
            } else if (currentHouseEdge < 8) {
                // House edge low, reduce multipliers moderately
                adjustmentFactor = 0.75;
                logger.info(`${game}: House edge low (${currentHouseEdge.toFixed(1)}%), reducing multipliers to ${adjustmentFactor}`);
            } else if (currentHouseEdge > 25) {
                // House edge too high, increase multipliers
                adjustmentFactor = 1.3;
                logger.info(`${game}: House edge too high (${currentHouseEdge.toFixed(1)}%), increasing multipliers to ${adjustmentFactor}`);
            } else if (currentHouseEdge > 18) {
                // House edge high, increase multipliers slightly
                adjustmentFactor = 1.15;
                logger.info(`${game}: House edge high (${currentHouseEdge.toFixed(1)}%), increasing multipliers to ${adjustmentFactor}`);
            }

            // Apply additional adjustments based on economy health
            if (analysis.economyHealth === 'CRITICAL') {
                adjustmentFactor *= 0.8; // Further reduce payouts
            } else if (analysis.economyHealth === 'POOR') {
                adjustmentFactor *= 0.9;
            } else if (analysis.economyHealth === 'EXCELLENT') {
                adjustmentFactor *= 1.1; // Slightly increase payouts
            }

            // Apply the adjustment factor
            const adjustedMultipliers = baseMultipliers.map(mult => {
                const adjusted = mult * adjustmentFactor;
                return Math.round(adjusted * 100) / 100; // Round to 2 decimal places
            });

            logger.info(`${game}: Applied ${adjustmentFactor}x adjustment based on ${currentHouseEdge.toFixed(1)}% house edge and ${analysis.economyHealth} economy health`);
            
            return adjustedMultipliers;

        } catch (error) {
            logger.error(`Error getting dynamic multipliers for ${game}: ${error.message}`);
            return baseMultipliers;
        }
    }

    /**
     * Get default analysis for error cases
     */
    getDefaultAnalysis() {
        return {
            timestamp: Date.now(),
            totalUsers: 0,
            totalWealth: 0,
            averageBalance: 1000,
            medianBalance: 1000,
            wealthDistribution: {
                poor: { count: 0, percentage: 100 },
                middle: { count: 0, percentage: 0 },
                rich: { count: 0, percentage: 0 },
                wealthy: { count: 0, percentage: 0 },
                elite: { count: 0, percentage: 0 }
            },
            gameStats: {},
            winLossRatios: {},
            economyHealth: 'UNKNOWN',
            inflationRate: 0,
            recommendations: []
        };
    }

    /**
     * Get economy health status for display
     */
    async getEconomyHealthStatus(guildId = null) {
        const analysis = await this.getEconomyAnalysis(guildId);
        
        return {
            health: analysis.economyHealth,
            totalUsers: analysis.totalUsers,
            averageBalance: Math.floor(analysis.averageBalance),
            totalWealth: Math.floor(analysis.totalWealth),
            recommendations: analysis.recommendations.filter(r => r.type === 'CRITICAL').length
        };
    }
}

// Export singleton instance
module.exports = new EconomyAnalyzer();