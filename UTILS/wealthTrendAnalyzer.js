/**
 * WEALTH TREND ANALYZER
 * Advanced mathematical analysis to detect and prevent exploitation patterns
 * Uses statistical analysis, pattern recognition, and predictive modeling
 */

const logger = require('./logger');
const dbManager = require('./database');

class WealthTrendAnalyzer {
    constructor() {
        // Statistical thresholds for anomaly detection
        this.anomalyThresholds = {
            // Z-score thresholds (standard deviations from mean)
            winRateAnomaly: 2.5,        // 2.5σ above average win rate
            wealthGrowthAnomaly: 3.0,   // 3.0σ above average wealth growth
            frequencyAnomaly: 2.0,      // 2.0σ above average game frequency
            
            // Absolute thresholds
            impossibleWinRate: 0.85,    // 85%+ win rate over 50+ games
            extremeWealthGrowth: 10.0,  // 1000%+ growth in 24 hours
            suspiciousFrequency: 100    // 100+ games per hour
        };

        // Pattern detection algorithms
        this.patterns = {
            // Martingale system detection
            martingale: {
                consecutiveDoubles: 5,      // 5+ consecutive bet doublings
                progressionRatio: 1.8       // Bet increases by 1.8x+ after losses
            },
            
            // Card counting patterns (for blackjack)
            cardCounting: {
                betVariation: 5.0,          // 5x+ bet variation
                winRateIncrease: 0.15,      // 15% above expected win rate
                timingPatterns: true        // Unusual betting timing
            },
            
            // Bot/automation detection
            automation: {
                perfectTiming: 0.1,         // <0.1s variance in response times
                repetitivePatterns: 0.95,   // 95%+ identical action patterns
                inhumanFrequency: 50       // 50+ actions per minute sustained
            }
        };

        // Wealth milestone tracking (billionaire prevention)
        this.wealthMilestones = [
            { threshold: 50_000_000,   name: "50M Threshold",   scrutinyLevel: 1.2 },
            { threshold: 100_000_000,  name: "100M Threshold",  scrutinyLevel: 1.5 },
            { threshold: 250_000_000,  name: "250M Threshold",  scrutinyLevel: 2.0 },
            { threshold: 500_000_000,  name: "500M Threshold",  scrutinyLevel: 3.0 },
            { threshold: 750_000_000,  name: "750M Threshold",  scrutinyLevel: 4.0 },
            { threshold: 1_000_000_000, name: "Billionaire",    scrutinyLevel: 5.0 }
        ];

        // Moving averages for trend analysis
        this.movingAverages = new Map();
        this.playerProfiles = new Map();
    }

    /**
     * Analyze a player's wealth trends and patterns
     * @param {string} userId - Player ID
     * @param {Object} gameData - Latest game data
     * @returns {Object} Analysis result with risk factors
     */
    async analyzePlayerTrends(userId, gameData) {
        try {
            const profile = await this.getPlayerProfile(userId);
            const analysis = {
                riskScore: 0,
                anomalies: [],
                patterns: [],
                recommendations: [],
                scrutinyLevel: 1.0
            };

            // 1. Statistical anomaly detection
            const anomalies = await this.detectStatisticalAnomalies(userId, profile);
            analysis.anomalies = anomalies;
            analysis.riskScore += anomalies.length * 0.2;

            // 2. Pattern detection
            const patterns = await this.detectSuspiciousPatterns(userId, profile);
            analysis.patterns = patterns;
            analysis.riskScore += patterns.length * 0.3;

            // 3. Wealth milestone analysis
            const milestone = this.analyzeWealthMilestone(profile.currentWealth);
            if (milestone) {
                analysis.scrutinyLevel = milestone.scrutinyLevel;
                analysis.riskScore += (milestone.scrutinyLevel - 1) * 0.1;
            }

            // 4. Velocity analysis
            const velocity = await this.analyzeWealthVelocity(userId, profile);
            analysis.velocity = velocity;
            analysis.riskScore += velocity.riskContribution;

            // 5. Comparative analysis (vs other players)
            const comparative = await this.performComparativeAnalysis(userId, profile);
            analysis.comparative = comparative;
            analysis.riskScore += comparative.riskContribution;

            // 6. Generate recommendations
            analysis.recommendations = this.generateRecommendations(analysis);

            // Cap risk score and determine action level
            analysis.riskScore = Math.min(analysis.riskScore, 10.0);
            analysis.actionLevel = this.determineActionLevel(analysis.riskScore);

            // Log high-risk players
            if (analysis.riskScore > 3.0) {
                logger.warn(`🚨 High-risk player detected: ${userId} - Risk Score: ${analysis.riskScore.toFixed(2)}`);
            }

            return analysis;

        } catch (error) {
            logger.error(`Wealth trend analysis error for ${userId}: ${error.message}`);
            return {
                riskScore: 0,
                anomalies: [],
                patterns: [],
                recommendations: ["Analysis error - using default settings"],
                scrutinyLevel: 1.0,
                actionLevel: "none"
            };
        }
    }

    /**
     * Detect statistical anomalies
     * @param {string} userId - Player ID
     * @param {Object} profile - Player profile
     * @returns {Array} Detected anomalies
     */
    async detectStatisticalAnomalies(userId, profile) {
        const anomalies = [];
        
        // Win rate anomaly
        if (profile.winRate > this.anomalyThresholds.impossibleWinRate && profile.totalGames > 50) {
            anomalies.push({
                type: "impossible_win_rate",
                severity: "high",
                value: profile.winRate,
                description: `${(profile.winRate * 100).toFixed(1)}% win rate over ${profile.totalGames} games`
            });
        }

        // Wealth growth anomaly
        const dailyGrowth = profile.wealthGrowthRates?.daily || 0;
        if (dailyGrowth > this.anomalyThresholds.extremeWealthGrowth) {
            anomalies.push({
                type: "extreme_wealth_growth",
                severity: "critical",
                value: dailyGrowth,
                description: `${(dailyGrowth * 100).toFixed(0)}% wealth growth in 24 hours`
            });
        }

        // Frequency anomaly
        const hourlyGameRate = profile.gameFrequency?.hourly || 0;
        if (hourlyGameRate > this.anomalyThresholds.suspiciousFrequency) {
            anomalies.push({
                type: "suspicious_frequency",
                severity: "medium",
                value: hourlyGameRate,
                description: `${hourlyGameRate} games per hour sustained`
            });
        }

        return anomalies;
    }

    /**
     * Detect suspicious patterns
     * @param {string} userId - Player ID
     * @param {Object} profile - Player profile
     * @returns {Array} Detected patterns
     */
    async detectSuspiciousPatterns(userId, profile) {
        const patterns = [];
        
        // Martingale system detection
        if (profile.bettingPatterns?.martingaleScore > 0.7) {
            patterns.push({
                type: "martingale_system",
                confidence: profile.bettingPatterns.martingaleScore,
                description: "Suspected Martingale betting system usage"
            });
        }

        // Automation detection
        if (profile.timingPatterns?.varianceScore < 0.1) {
            patterns.push({
                type: "possible_automation",
                confidence: 1 - profile.timingPatterns.varianceScore,
                description: "Unusually consistent response times suggesting automation"
            });
        }

        // Perfect play detection (for skill games)
        if (profile.skillMetrics?.blackjackOptimalPlay > 0.98) {
            patterns.push({
                type: "perfect_play",
                confidence: profile.skillMetrics.blackjackOptimalPlay,
                description: "Near-perfect strategic play indicating possible assistance"
            });
        }

        return patterns;
    }

    /**
     * Analyze wealth velocity
     * @param {string} userId - Player ID
     * @param {Object} profile - Player profile
     * @returns {Object} Velocity analysis
     */
    async analyzeWealthVelocity(userId, profile) {
        const velocity = {
            hourly: profile.wealthGrowthRates?.hourly || 0,
            daily: profile.wealthGrowthRates?.daily || 0,
            weekly: profile.wealthGrowthRates?.weekly || 0,
            riskContribution: 0
        };

        // Calculate risk contribution based on velocity
        if (velocity.hourly > 0.5) velocity.riskContribution += 0.5;  // 50%+ per hour
        if (velocity.daily > 2.0) velocity.riskContribution += 1.0;   // 200%+ per day
        if (velocity.weekly > 10.0) velocity.riskContribution += 2.0; // 1000%+ per week

        velocity.assessment = this.categorizeVelocity(velocity);
        return velocity;
    }

    /**
     * Perform comparative analysis vs other players
     * @param {string} userId - Player ID
     * @param {Object} profile - Player profile
     * @returns {Object} Comparative analysis
     */
    async performComparativeAnalysis(userId, profile) {
        // Get population statistics (simplified - would use real data)
        const populationStats = await this.getPopulationStatistics();
        
        const comparative = {
            wealthPercentile: this.calculatePercentile(profile.currentWealth, populationStats.wealthDistribution),
            winRatePercentile: this.calculatePercentile(profile.winRate, populationStats.winRateDistribution),
            growthPercentile: this.calculatePercentile(profile.wealthGrowthRates?.daily || 0, populationStats.growthDistribution),
            riskContribution: 0
        };

        // Higher percentiles = higher risk
        if (comparative.wealthPercentile > 95) comparative.riskContribution += 0.5;
        if (comparative.winRatePercentile > 99) comparative.riskContribution += 1.0;
        if (comparative.growthPercentile > 99.5) comparative.riskContribution += 2.0;

        return comparative;
    }

    /**
     * Analyze wealth milestone proximity
     * @param {number} currentWealth - Current wealth
     * @returns {Object|null} Milestone info if approaching one
     */
    analyzeWealthMilestone(currentWealth) {
        for (const milestone of this.wealthMilestones) {
            if (currentWealth >= milestone.threshold * 0.8 && currentWealth < milestone.threshold) {
                return {
                    ...milestone,
                    proximity: (currentWealth / milestone.threshold),
                    description: `Approaching ${milestone.name} (${(currentWealth / milestone.threshold * 100).toFixed(1)}%)`
                };
            } else if (currentWealth >= milestone.threshold) {
                return {
                    ...milestone,
                    proximity: 1.0,
                    description: `Reached ${milestone.name}`
                };
            }
        }
        return null;
    }

    /**
     * Generate recommendations based on analysis
     * @param {Object} analysis - Analysis result
     * @returns {Array} Recommendations
     */
    generateRecommendations(analysis) {
        const recommendations = [];

        if (analysis.riskScore > 5.0) {
            recommendations.push("Apply maximum scrutiny level - manual review required");
        } else if (analysis.riskScore > 3.0) {
            recommendations.push("Increase house edge adjustments and monitoring");
        } else if (analysis.riskScore > 1.5) {
            recommendations.push("Apply moderate difficulty scaling");
        }

        if (analysis.anomalies.some(a => a.type === "impossible_win_rate")) {
            recommendations.push("Investigate for possible exploitation or cheating");
        }

        if (analysis.patterns.some(p => p.type === "possible_automation")) {
            recommendations.push("Implement additional CAPTCHA or timing validation");
        }

        if (analysis.scrutinyLevel > 3.0) {
            recommendations.push("Enable enhanced logging and manual verification");
        }

        return recommendations.length > 0 ? recommendations : ["Standard monitoring sufficient"];
    }

    /**
     * Determine action level based on risk score
     * @param {number} riskScore - Risk score
     * @returns {string} Action level
     */
    determineActionLevel(riskScore) {
        if (riskScore >= 7.0) return "critical";
        if (riskScore >= 5.0) return "high";
        if (riskScore >= 3.0) return "moderate";
        if (riskScore >= 1.5) return "low";
        return "none";
    }

    /**
     * Helper methods
     */
    async getPlayerProfile(userId) {
        // Simplified - would fetch real player data
        return {
            currentWealth: 10_000_000,
            winRate: 0.55,
            totalGames: 1000,
            wealthGrowthRates: { hourly: 0.1, daily: 0.5, weekly: 2.0 },
            gameFrequency: { hourly: 20, daily: 200 },
            bettingPatterns: { martingaleScore: 0.3 },
            timingPatterns: { varianceScore: 0.8 },
            skillMetrics: { blackjackOptimalPlay: 0.75 }
        };
    }

    async getPopulationStatistics() {
        // Simplified - would use real population data
        return {
            wealthDistribution: [1000, 5000, 10000, 50000, 100000, 500000, 1000000, 5000000],
            winRateDistribution: [0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7],
            growthDistribution: [0.0, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0]
        };
    }

    calculatePercentile(value, distribution) {
        const sorted = distribution.sort((a, b) => a - b);
        const index = sorted.findIndex(v => v >= value);
        return index === -1 ? 100 : (index / sorted.length) * 100;
    }

    categorizeVelocity(velocity) {
        if (velocity.daily > 5.0) return "extreme";
        if (velocity.daily > 2.0) return "very_high";
        if (velocity.daily > 1.0) return "high";
        if (velocity.daily > 0.5) return "moderate";
        return "normal";
    }

    /**
     * Get system statistics
     * @returns {Object} System stats
     */
    getSystemStats() {
        return {
            monitoredPlayers: this.playerProfiles.size,
            anomalyThresholds: this.anomalyThresholds,
            patternDetectors: Object.keys(this.patterns).length,
            wealthMilestones: this.wealthMilestones.length
        };
    }
}

// Export singleton
module.exports = new WealthTrendAnalyzer();