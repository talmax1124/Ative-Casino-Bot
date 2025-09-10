/**
 * Intelligent Recommendation Engine - Advanced AI for Economy Optimization
 * Learns from previous adjustments and avoids repetitive recommendations
 */

const logger = require('./logger');
const dbManager = require('./database');

class IntelligentRecommendationEngine {
    constructor() {
        this.adjustmentHistory = new Map(); // Track what adjustments were made
        this.recommendationHistory = new Map(); // Track previous recommendations
        this.learningThreshold = 7; // Days to consider for learning
        this.cooldownPeriod = 3; // Days to wait before repeating recommendations
    }

    /**
     * Generate intelligent recommendations that learn from history
     */
    async generateIntelligentRecommendations(gameType, currentStats, historicalData) {
        try {
            // Get recent adjustments and recommendations
            const recentAdjustments = await this.getRecentAdjustments(gameType);
            const recentRecommendations = await this.getRecentRecommendations(gameType);

            // Analyze current economic state
            const economicAnalysis = this.analyzeEconomicState(currentStats, historicalData);
            
            // Generate base recommendations
            const baseRecommendations = this.generateBaseRecommendations(economicAnalysis);
            
            // Filter out recently applied or ineffective recommendations
            const intelligentRecommendations = this.filterAndPrioritizeRecommendations(
                baseRecommendations,
                recentAdjustments,
                recentRecommendations,
                economicAnalysis
            );

            // Learn from patterns and suggest advanced actions
            const learningBasedRecommendations = await this.generateLearningBasedRecommendations(
                gameType,
                economicAnalysis,
                historicalData
            );

            // Combine and rank all recommendations
            const finalRecommendations = this.combineAndRankRecommendations(
                intelligentRecommendations,
                learningBasedRecommendations,
                economicAnalysis
            );

            // Record these recommendations for future learning
            await this.recordRecommendations(gameType, finalRecommendations);

            return finalRecommendations;

        } catch (error) {
            logger.error(`Intelligent recommendation generation failed: ${error.message}`);
            return ['MAINTAIN_CURRENT_SETTINGS'];
        }
    }

    /**
     * Analyze current economic state comprehensively
     */
    analyzeEconomicState(currentStats, historicalData) {
        const analysis = {
            // Basic metrics
            houseEdge: currentStats.houseEdge || 0,
            winRate: currentStats.winRate || 0,
            avgBetSize: currentStats.avgBetSize || 0,
            profitability: currentStats.houseProfit || 0,
            
            // Trends (compare with historical data)
            houseEdgeTrend: this.calculateTrend(historicalData, 'houseEdge'),
            winRateTrend: this.calculateTrend(historicalData, 'winRate'),
            volumeTrend: this.calculateTrend(historicalData, 'totalVolume'),
            
            // Stability indicators
            volatility: this.calculateVolatility(historicalData),
            consistency: this.calculateConsistency(currentStats),
            
            // Risk factors
            riskLevel: this.assessRiskLevel(currentStats, historicalData),
            urgency: this.assessUrgency(currentStats),
            
            // Performance indicators
            efficiency: this.calculateEfficiency(currentStats),
            playerSatisfaction: this.estimatePlayerSatisfaction(currentStats),
            
            // Advanced metrics
            wealthDistribution: this.analyzeWealthDistribution(historicalData),
            betPatternShift: this.analyzeBetPatterns(historicalData),
            seasonalEffects: this.analyzeSeasonalPatterns(historicalData)
        };

        return analysis;
    }

    /**
     * Generate base recommendations using advanced logic
     */
    generateBaseRecommendations(analysis) {
        const recommendations = [];
        const priority = [];

        // House Edge Optimization (8-15% target range)
        if (analysis.houseEdge < 8) {
            if (analysis.houseEdgeTrend === 'declining') {
                recommendations.push('URGENT_INCREASE_HOUSE_EDGE');
                priority.push('HIGH');
            } else {
                recommendations.push('INCREASE_HOUSE_EDGE');
                priority.push('MEDIUM');
            }
        } else if (analysis.houseEdge > 15) {
            if (analysis.playerSatisfaction < 0.3) {
                recommendations.push('URGENT_DECREASE_HOUSE_EDGE');
                priority.push('HIGH');
            } else {
                recommendations.push('DECREASE_HOUSE_EDGE');
                priority.push('MEDIUM');
            }
        } else if (analysis.houseEdge >= 8 && analysis.houseEdge <= 12) {
            // Optimal range - consider advanced optimizations
            if (analysis.volumeTrend === 'declining') {
                recommendations.push('OPTIMIZE_FOR_VOLUME');
                priority.push('LOW');
            } else if (analysis.efficiency < 0.8) {
                recommendations.push('OPTIMIZE_EFFICIENCY');
                priority.push('LOW');
            }
        }

        // Win Rate Analysis (35-45% target for player satisfaction)
        if (analysis.winRate > 50) {
            recommendations.push('REDUCE_WIN_PROBABILITY');
            priority.push('HIGH');
        } else if (analysis.winRate < 30) {
            recommendations.push('INCREASE_WIN_PROBABILITY');
            priority.push('HIGH');
        }

        // Betting Behavior Analysis
        if (analysis.avgBetSize > 100000 && analysis.riskLevel === 'HIGH') {
            recommendations.push('MONITOR_HIGH_ROLLERS');
            priority.push('MEDIUM');
        }

        if (analysis.betPatternShift === 'aggressive_shift') {
            recommendations.push('IMPLEMENT_COOLING_MEASURES');
            priority.push('MEDIUM');
        }

        // Volatility Management
        if (analysis.volatility > 0.8) {
            recommendations.push('STABILIZE_ECONOMY');
            priority.push('HIGH');
        }

        // Max Bet Considerations
        if (analysis.houseEdge >= 10 && analysis.consistency > 0.8 && analysis.riskLevel === 'LOW') {
            recommendations.push('INCREASE_MAX_BET');
            priority.push('LOW');
        } else if (analysis.riskLevel === 'HIGH' && analysis.volatility > 0.6) {
            recommendations.push('DECREASE_MAX_BET');
            priority.push('MEDIUM');
        }

        return recommendations.map((rec, index) => ({
            recommendation: rec,
            priority: priority[index],
            confidence: this.calculateConfidence(analysis, rec),
            reasoning: this.generateReasoning(analysis, rec)
        }));
    }

    /**
     * Filter recommendations based on history and effectiveness
     */
    filterAndPrioritizeRecommendations(baseRecommendations, recentAdjustments, recentRecommendations, analysis) {
        return baseRecommendations.filter(rec => {
            // Don't repeat recent recommendations unless urgent
            const wasRecentlyRecommended = recentRecommendations.some(prev => 
                prev.recommendation === rec.recommendation && 
                this.daysSince(prev.date) < this.cooldownPeriod
            );

            if (wasRecentlyRecommended && rec.priority !== 'HIGH') {
                return false;
            }

            // Don't recommend if opposite adjustment was just made
            const recentOpposite = this.findRecentOppositeAdjustment(rec.recommendation, recentAdjustments);
            if (recentOpposite && this.daysSince(recentOpposite.date) < 2) {
                return false;
            }

            // Don't recommend if same adjustment was recently made and didn't help
            const sameAdjustment = recentAdjustments.find(adj => 
                this.isSameType(adj.type, rec.recommendation) &&
                this.daysSince(adj.date) < this.learningThreshold
            );

            if (sameAdjustment && !this.wasAdjustmentEffective(sameAdjustment, analysis)) {
                return false;
            }

            return true;
        });
    }

    /**
     * Generate learning-based recommendations using historical patterns
     */
    async generateLearningBasedRecommendations(gameType, analysis, historicalData) {
        const recommendations = [];

        try {
            // Pattern-based learning
            const patterns = this.identifyPatterns(historicalData);
            
            if (patterns.cyclicalTrend) {
                recommendations.push({
                    recommendation: 'APPLY_CYCLICAL_ADJUSTMENT',
                    priority: 'LOW',
                    confidence: patterns.confidence,
                    reasoning: `Detected cyclical pattern: ${patterns.description}`
                });
            }

            if (patterns.emergingTrend) {
                recommendations.push({
                    recommendation: 'PROACTIVE_TREND_ADJUSTMENT',
                    priority: 'MEDIUM',
                    confidence: patterns.confidence,
                    reasoning: `Emerging trend detected: ${patterns.trendDescription}`
                });
            }

            // Predictive recommendations
            const prediction = this.predictFutureState(analysis, historicalData);
            
            if (prediction.risk === 'HIGH') {
                recommendations.push({
                    recommendation: 'PREVENTIVE_MEASURES',
                    priority: 'HIGH',
                    confidence: prediction.confidence,
                    reasoning: `Predicted risk: ${prediction.riskDescription}`
                });
            }

            // Optimization opportunities
            const optimizations = this.identifyOptimizationOpportunities(analysis, historicalData);
            recommendations.push(...optimizations);

        } catch (error) {
            logger.debug(`Learning-based recommendations failed: ${error.message}`);
        }

        return recommendations;
    }

    /**
     * Calculate recommendation confidence based on data quality and patterns
     */
    calculateConfidence(analysis, recommendation) {
        let confidence = 0.5; // Base confidence

        // Increase confidence based on data quality
        if (analysis.consistency > 0.8) confidence += 0.2;
        if (analysis.volatility < 0.3) confidence += 0.1;

        // Increase confidence for clear indicators
        if (recommendation.includes('URGENT')) confidence += 0.2;
        if (analysis.riskLevel === 'HIGH' && recommendation.includes('DECREASE')) confidence += 0.15;
        if (analysis.houseEdge < 5 && recommendation.includes('INCREASE')) confidence += 0.25;

        return Math.min(1.0, confidence);
    }

    /**
     * Generate human-readable reasoning for recommendations
     */
    generateReasoning(analysis, recommendation) {
        const reasons = {
            'INCREASE_HOUSE_EDGE': `House edge at ${analysis.houseEdge.toFixed(1)}% is below optimal range (8-15%)`,
            'DECREASE_HOUSE_EDGE': `House edge at ${analysis.houseEdge.toFixed(1)}% is too aggressive, may hurt player retention`,
            'REDUCE_WIN_PROBABILITY': `Player win rate at ${(analysis.winRate * 100).toFixed(1)}% is too high`,
            'INCREASE_WIN_PROBABILITY': `Player win rate at ${(analysis.winRate * 100).toFixed(1)}% is too low, players getting frustrated`,
            'MONITOR_HIGH_ROLLERS': `Average bet size $${(analysis.avgBetSize / 1000).toFixed(0)}K indicates high-roller activity`,
            'INCREASE_MAX_BET': `Stable economy (${analysis.houseEdge.toFixed(1)}% edge) supports higher limits`,
            'MAINTAIN_CURRENT_SETTINGS': `All metrics within optimal ranges, no changes needed`
        };

        return reasons[recommendation] || `Analysis suggests this adjustment for improved performance`;
    }

    /**
     * Helper methods for trend analysis
     */
    calculateTrend(historicalData, metric) {
        if (!historicalData || historicalData.length < 3) return 'insufficient_data';
        
        const recent = historicalData.slice(-3);
        const values = recent.map(d => d[metric]).filter(v => v !== undefined);
        
        if (values.length < 2) return 'insufficient_data';
        
        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));
        
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        
        const change = (secondAvg - firstAvg) / firstAvg;
        
        if (change > 0.1) return 'increasing';
        if (change < -0.1) return 'declining';
        return 'stable';
    }

    calculateVolatility(historicalData) {
        if (!historicalData || historicalData.length < 3) return 0.5;
        
        // Calculate volatility based on house edge fluctuations
        const edges = historicalData.map(d => d.houseEdge).filter(e => e !== undefined);
        if (edges.length < 2) return 0.5;
        
        const mean = edges.reduce((a, b) => a + b, 0) / edges.length;
        const variance = edges.reduce((sum, edge) => sum + Math.pow(edge - mean, 2), 0) / edges.length;
        
        return Math.min(1.0, Math.sqrt(variance) / mean);
    }

    /**
     * Store recommendations for future learning
     */
    async recordRecommendations(gameType, recommendations) {
        try {
            const query = `
                INSERT INTO ml_recommendations (game_type, recommendations, confidence_scores, timestamp)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                recommendations = VALUES(recommendations),
                confidence_scores = VALUES(confidence_scores),
                timestamp = VALUES(timestamp)
            `;

            const recommendationData = {
                recommendations: recommendations.map(r => r.recommendation),
                confidences: recommendations.map(r => r.confidence),
                priorities: recommendations.map(r => r.priority)
            };

            await dbManager.databaseAdapter.executeQuery(query, [
                gameType,
                JSON.stringify(recommendationData),
                JSON.stringify(recommendations.map(r => r.confidence)),
                Date.now()
            ]);

        } catch (error) {
            // Create table if it doesn't exist
            if (error.message.includes("doesn't exist")) {
                await this.createRecommendationTable();
                return this.recordRecommendations(gameType, recommendations);
            }
            logger.debug(`Could not record recommendations: ${error.message}`);
        }
    }

    /**
     * Create recommendation tracking table
     */
    async createRecommendationTable() {
        try {
            const createQuery = `
                CREATE TABLE IF NOT EXISTS ml_recommendations (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    game_type VARCHAR(50) NOT NULL,
                    recommendations JSON NOT NULL,
                    confidence_scores JSON NOT NULL,
                    applied BOOLEAN DEFAULT FALSE,
                    effectiveness_score DECIMAL(3,2) DEFAULT NULL,
                    timestamp BIGINT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_game_timestamp (game_type, timestamp),
                    INDEX idx_game_type (game_type),
                    INDEX idx_timestamp (timestamp)
                )
            `;

            await dbManager.databaseAdapter.executeQuery(createQuery);
            logger.info('ML recommendations table created successfully');

        } catch (error) {
            logger.error(`Failed to create ML recommendations table: ${error.message}`);
        }
    }

    /**
     * Get recent adjustments for learning
     */
    async getRecentAdjustments(gameType) {
        try {
            const cutoff = Date.now() - (this.learningThreshold * 24 * 60 * 60 * 1000);
            
            const query = `
                SELECT * FROM economy_adjustments 
                WHERE game_type = ? AND timestamp >= ?
                ORDER BY timestamp DESC
            `;

            return await dbManager.databaseAdapter.executeQuery(query, [gameType, cutoff]) || [];

        } catch (error) {
            logger.debug(`Could not retrieve recent adjustments: ${error.message}`);
            return [];
        }
    }

    /**
     * Get recent recommendations for learning
     */
    async getRecentRecommendations(gameType) {
        try {
            const cutoff = Date.now() - (this.cooldownPeriod * 24 * 60 * 60 * 1000);
            
            const query = `
                SELECT * FROM ml_recommendations 
                WHERE game_type = ? AND timestamp >= ?
                ORDER BY timestamp DESC
            `;

            return await dbManager.databaseAdapter.executeQuery(query, [gameType, cutoff]) || [];

        } catch (error) {
            logger.debug(`Could not retrieve recent recommendations: ${error.message}`);
            return [];
        }
    }

    // Additional helper methods...
    daysSince(timestamp) {
        return (Date.now() - timestamp) / (24 * 60 * 60 * 1000);
    }

    findRecentOppositeAdjustment(recommendation, adjustments) {
        const opposites = {
            'INCREASE_HOUSE_EDGE': 'DECREASE_HOUSE_EDGE',
            'DECREASE_HOUSE_EDGE': 'INCREASE_HOUSE_EDGE',
            'INCREASE_MAX_BET': 'DECREASE_MAX_BET',
            'DECREASE_MAX_BET': 'INCREASE_MAX_BET'
        };

        const opposite = opposites[recommendation];
        return adjustments.find(adj => adj.type === opposite);
    }

    isSameType(adjustmentType, recommendation) {
        // Map adjustment types to recommendation types
        const mapping = {
            'house_edge_increase': 'INCREASE_HOUSE_EDGE',
            'house_edge_decrease': 'DECREASE_HOUSE_EDGE',
            'max_bet_increase': 'INCREASE_MAX_BET',
            'max_bet_decrease': 'DECREASE_MAX_BET'
        };

        return mapping[adjustmentType] === recommendation;
    }

    wasAdjustmentEffective(adjustment, currentAnalysis) {
        // Determine if a previous adjustment actually improved the situation
        // This would need historical comparison logic
        return currentAnalysis.houseEdge >= 8 && currentAnalysis.houseEdge <= 15;
    }

    identifyPatterns(historicalData) {
        // Stub for pattern identification
        return { cyclicalTrend: false, emergingTrend: false };
    }

    predictFutureState(analysis, historicalData) {
        // Stub for prediction logic
        return { risk: 'LOW', confidence: 0.7 };
    }

    identifyOptimizationOpportunities(analysis, historicalData) {
        // Stub for optimization identification
        return [];
    }

    calculateConsistency(stats) {
        // Calculate how consistent the metrics are
        return 0.8; // Placeholder
    }

    assessRiskLevel(currentStats, historicalData) {
        if (currentStats.houseEdge < 5) return 'HIGH';
        if (currentStats.houseEdge > 20) return 'HIGH';
        return 'LOW';
    }

    assessUrgency(currentStats) {
        return currentStats.houseEdge < 5 || currentStats.houseEdge > 20 ? 'HIGH' : 'LOW';
    }

    calculateEfficiency(stats) {
        // Calculate how efficiently the house edge converts to profit
        return stats.houseProfit > 0 ? 0.8 : 0.3;
    }

    estimatePlayerSatisfaction(stats) {
        // Estimate based on win rate and house edge
        const idealWinRate = 0.4;
        const winRateScore = 1 - Math.abs(stats.winRate - idealWinRate) / idealWinRate;
        
        const idealHouseEdge = 0.12;
        const houseEdgeScore = 1 - Math.abs((stats.houseEdge / 100) - idealHouseEdge) / idealHouseEdge;
        
        return (winRateScore + houseEdgeScore) / 2;
    }

    analyzeWealthDistribution(historicalData) {
        return 'balanced'; // Placeholder
    }

    analyzeBetPatterns(historicalData) {
        return 'stable'; // Placeholder
    }

    analyzeSeasonalPatterns(historicalData) {
        return 'none'; // Placeholder
    }

    combineAndRankRecommendations(intelligent, learningBased, analysis) {
        const all = [...intelligent, ...learningBased];
        
        // Sort by priority and confidence
        return all.sort((a, b) => {
            const priorityOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
            const aPriority = priorityOrder[a.priority] || 1;
            const bPriority = priorityOrder[b.priority] || 1;
            
            if (aPriority !== bPriority) {
                return bPriority - aPriority;
            }
            
            return b.confidence - a.confidence;
        }).slice(0, 5); // Return top 5 recommendations
    }
}

// Export singleton instance
const intelligentRecommendationEngine = new IntelligentRecommendationEngine();

module.exports = {
    intelligentRecommendationEngine,
    IntelligentRecommendationEngine
};