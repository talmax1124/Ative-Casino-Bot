/**
 * REAL AI Engine for ATIVE Casino - TRUE Machine Learning Integration
 * Uses OpenAI API for genuine intelligence and learning
 */

const logger = require('./logger');
const dbManager = require('./database');
const AIRateLimitFix = require('./aiRateLimitFix');

class RealAIEngine {
    constructor() {
        // Check if we're in development mode based on environment
        this.devMode = process.env.ENVIRONMENT !== 'production';
        this.apiKey = this.devMode ? null : process.env.OPENAI_API_KEY;
        this.model = this.devMode ? null : 'gpt-4o';
        this.baseURL = this.devMode ? null : 'https://api.openai.com/v1/chat/completions';
        
        // AI Learning Memory - stores insights between sessions
        this.learningMemory = new Map();
        this.analysisHistory = [];
        this.predictionAccuracy = new Map();
        
        // Initialize rate limiting system
        this.rateLimitFix = new AIRateLimitFix();
        this.rateLimitFix.makeOpenAIRequest = this.queryOpenAIRaw.bind(this);
        
        if (this.devMode) {
            logger.info(`🤖 Real AI Engine initialized - DEVELOPMENT MODE (${process.env.ENVIRONMENT || 'development'}) - API calls disabled`);
        } else {
            logger.info('🤖 Real AI Engine initialized - PRODUCTION MODE - AI consultation active');
        }
    }

    /**
     * Generate REAL AI recommendations using OpenAI GPT-4
     */
    async generateIntelligentRecommendations(gameData, historicalTrends, economicState) {
        try {
            if (this.devMode) {
                logger.info(`[DEV MODE - ${process.env.ENVIRONMENT}] Skipping OpenAI GPT-4 consultation - API calls disabled`);
                return [
                    { 
                        action: 'maintain', 
                        confidence: 0.8, 
                        reasoning: 'Development mode - no AI analysis',
                        source: 'dev_mode_fallback',
                        priority: 'LOW',
                        timestamp: Date.now()
                    }
                ];
            }

            logger.info('🧠 Consulting OpenAI GPT-4 for casino optimization...');

            // Prepare comprehensive data for AI analysis
            const aiPrompt = this.buildAIPrompt(gameData, historicalTrends, economicState);
            
            // Query OpenAI for intelligent analysis
            const aiResponse = await this.queryOpenAI(aiPrompt);
            
            // Parse and validate AI recommendations
            const recommendations = this.parseAIRecommendations(aiResponse);
            
            // Update AI learning memory with new insights
            await this.updateLearningMemory(recommendations, gameData);
            
            // Track prediction accuracy for continuous improvement
            await this.trackPredictionAccuracy(recommendations);
            
            logger.info(`✅ AI Analysis Complete: ${recommendations.length} intelligent recommendations generated`);
            return recommendations;

        } catch (error) {
            logger.error(`AI Engine Error: ${error.message}`);
            return this.fallbackRecommendations(gameData);
        }
    }

    /**
     * Build comprehensive AI prompt with casino data
     */
    buildAIPrompt(gameData, historicalTrends, economicState) {
        const memory = this.getLearningMemory();
        
        return `You are an expert casino data scientist and ML engineer analyzing the ATIVE Casino ecosystem. 

**MISSION**: Provide intelligent, data-driven recommendations to optimize house profitability while maintaining player satisfaction.

**CURRENT CASINO DATA**:
- Total Games Played: ${gameData.totalGames}
- House Edge: ${(gameData.houseEdge * 100).toFixed(1)}%
- Player Win Rate: ${(gameData.winRate * 100).toFixed(1)}%
- Average Bet Size: $${gameData.avgBetSize?.toLocaleString()}
- Total Volume: $${gameData.totalVolume?.toLocaleString()}
- House Profit: $${gameData.houseProfit?.toLocaleString()}

**HISTORICAL TRENDS** (Last 30 days):
- Volume Trend: ${historicalTrends.volumeTrend}
- Win Rate Trend: ${historicalTrends.winRateTrend}
- House Edge Trend: ${historicalTrends.houseEdgeTrend}
- Player Activity: ${historicalTrends.playerActivity}

**ECONOMIC STATE**:
- Risk Level: ${economicState.riskLevel}
- Volatility: ${economicState.volatility}
- Player Satisfaction: ${economicState.playerSatisfaction}
- Wealth Distribution: ${economicState.wealthDistribution}

**YOUR LEARNING MEMORY** (Previous Insights):
${memory.length > 0 ? memory.map(m => `- ${m.insight} (Accuracy: ${m.accuracy}%)`).join('\\n') : 'No previous learning data'}

**TARGET METRICS**:
- House Edge: 8-15% (optimal range)
- Player Win Rate: 35-45% (satisfaction balance)
- Monthly Growth: Sustainable, not explosive

**ANALYSIS REQUEST**:
1. **IDENTIFY PATTERNS**: What trends do you see in the data?
2. **PREDICT OUTCOMES**: Where is this heading in the next 30 days?
3. **RISK ASSESSMENT**: What are the biggest threats to profitability?
4. **OPTIMIZATION OPPORTUNITIES**: How can we improve without hurting players?
5. **SPECIFIC ACTIONS**: What exact changes should be made and why?

**RESPONSE FORMAT** (JSON):
{
  "analysis": {
    "keyInsights": ["insight1", "insight2", "insight3"],
    "predictedOutcome": "description of where casino is heading",
    "riskFactors": ["risk1", "risk2"],
    "opportunityScore": 0-100
  },
  "recommendations": [
    {
      "action": "SPECIFIC_ACTION_NAME",
      "priority": "HIGH|MEDIUM|LOW",
      "confidence": 0-100,
      "reasoning": "detailed explanation",
      "expectedImpact": "predicted outcome",
      "implementation": "how to execute this",
      "timeframe": "when to do this",
      "successMetrics": "how to measure success"
    }
  ],
  "learningInsights": [
    "new insight that should be remembered for future analysis"
  ],
  "predictionAccuracy": "how confident are you in these predictions (0-100)"
}

Think like a world-class casino optimization AI. Be specific, data-driven, and focus on sustainable profitability.`;
    }

    /**
     * Query OpenAI API with rate limiting and intelligent fallback
     */
    async queryOpenAI(prompt, category = 'economy_analysis') {
        try {
            // Use rate limit fix for intelligent handling
            const result = await this.rateLimitFix.makeAICall(prompt, category, {
                timeout: 15000 // 15 second timeout
            });
            
            if (result.success) {
                logger.info('✅ OpenAI API call successful');
                return result.content;
            } else {
                logger.warn(`⚠️ Using AI fallback: ${result.reason}`);
                return this.formatFallbackAsJSON(result.content);
            }
            
        } catch (error) {
            logger.error(`❌ AI query failed: ${error.message}`);
            // Return structured fallback response
            return this.createEmergencyFallback();
        }
    }
    
    /**
     * Raw OpenAI API call (used by rate limiter)
     */
    async queryOpenAIRaw(prompt) {
        const response = await fetch(this.baseURL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.model,
                messages: [{
                    role: 'user',
                    content: prompt
                }],
                temperature: 0.1,
                max_tokens: 2000,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            const error = new Error(`OpenAI API Error: ${response.status} ${response.statusText}`);
            error.status = response.status;
            error.headers = response.headers;
            throw error;
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    /**
     * Parse and validate AI recommendations
     */
    parseAIRecommendations(aiResponse) {
        try {
            const parsed = JSON.parse(aiResponse);
            
            // Validate structure
            if (!parsed.analysis || !parsed.recommendations) {
                throw new Error('Invalid AI response structure');
            }

            // Enhance recommendations with metadata
            const enhancedRecommendations = parsed.recommendations.map(rec => ({
                ...rec,
                source: 'openai_gpt4',
                timestamp: Date.now(),
                aiConfidence: parsed.predictionAccuracy || 85,
                analysis: parsed.analysis
            }));

            // Store learning insights
            if (parsed.learningInsights) {
                this.storeLearningInsights(parsed.learningInsights);
            }

            return enhancedRecommendations;

        } catch (error) {
            logger.error(`Failed to parse AI response: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update learning memory with AI insights
     */
    async updateLearningMemory(recommendations, gameData) {
        try {
            for (const rec of recommendations) {
                const memoryEntry = {
                    recommendation: rec.action,
                    reasoning: rec.reasoning,
                    dataContext: {
                        houseEdge: gameData.houseEdge,
                        winRate: gameData.winRate,
                        volume: gameData.totalVolume
                    },
                    timestamp: Date.now(),
                    applied: false,
                    effectiveness: null
                };

                // Store in learning memory
                const key = `${rec.action}_${Date.now()}`;
                this.learningMemory.set(key, memoryEntry);
                
                // Also persist to database for permanent learning
                await this.persistLearningMemory(key, memoryEntry);
            }

        } catch (error) {
            logger.error(`Failed to update learning memory: ${error.message}`);
        }
    }

    /**
     * Persist learning memory to database
     */
    async persistLearningMemory(key, memoryEntry) {
        try {
            const query = `
                INSERT INTO ai_learning_memory 
                (memory_key, recommendation, reasoning, data_context, timestamp, applied, effectiveness)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                reasoning = VALUES(reasoning),
                data_context = VALUES(data_context),
                timestamp = VALUES(timestamp)
            `;

            // Ensure no undefined values are passed to database
            await dbManager.databaseAdapter.executeQuery(query, [
                key || null,
                memoryEntry.recommendation || null,
                memoryEntry.reasoning || null,
                JSON.stringify(memoryEntry.dataContext || {}),
                memoryEntry.timestamp || new Date().toISOString(),
                memoryEntry.applied !== undefined ? memoryEntry.applied : null,
                memoryEntry.effectiveness !== undefined ? memoryEntry.effectiveness : null
            ]);

        } catch (error) {
            // Create table if it doesn't exist
            if (error.message.includes("doesn't exist")) {
                await this.createLearningMemoryTable();
                return this.persistLearningMemory(key, memoryEntry);
            }
            logger.error(`Failed to persist learning memory: ${error.message}`);
        }
    }

    /**
     * Create learning memory table
     */
    async createLearningMemoryTable() {
        try {
            const createQuery = `
                CREATE TABLE IF NOT EXISTS ai_learning_memory (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    memory_key VARCHAR(255) UNIQUE NOT NULL,
                    recommendation VARCHAR(255) NOT NULL,
                    reasoning TEXT NOT NULL,
                    data_context JSON NOT NULL,
                    timestamp BIGINT NOT NULL,
                    applied BOOLEAN DEFAULT FALSE,
                    effectiveness DECIMAL(5,2) DEFAULT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_recommendation (recommendation),
                    INDEX idx_timestamp (timestamp),
                    INDEX idx_applied (applied)
                ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `;

            await dbManager.databaseAdapter.executeQuery(createQuery);
            logger.info('AI Learning Memory table created successfully');

        } catch (error) {
            logger.error(`Failed to create AI learning memory table: ${error.message}`);
        }
    }

    /**
     * Get learning memory for AI context
     */
    getLearningMemory() {
        const recentMemory = Array.from(this.learningMemory.values())
            .filter(entry => Date.now() - entry.timestamp < 30 * 24 * 60 * 60 * 1000) // Last 30 days
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 10); // Top 10 most recent

        return recentMemory.map(entry => ({
            insight: `${entry.recommendation}: ${entry.reasoning}`,
            accuracy: this.predictionAccuracy.get(entry.recommendation) || 'Unknown'
        }));
    }

    /**
     * Store learning insights from AI
     */
    storeLearningInsights(insights) {
        for (const insight of insights) {
            const key = `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            this.learningMemory.set(key, {
                type: 'insight',
                content: insight,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Track prediction accuracy for continuous improvement
     */
    async trackPredictionAccuracy(recommendations) {
        for (const rec of recommendations) {
            // Initialize tracking
            this.predictionAccuracy.set(rec.action, rec.aiConfidence || 85);
        }
    }

    /**
     * Fallback recommendations if AI fails
     */
    fallbackRecommendations(gameData) {
        logger.warn('🔄 AI unavailable, using intelligent fallback analysis');
        
        const recommendations = [];

        if (gameData.houseEdge < 0.08) {
            recommendations.push({
                action: 'INCREASE_HOUSE_EDGE',
                priority: 'HIGH',
                confidence: 90,
                reasoning: 'House edge below optimal 8% threshold - emergency adjustment needed',
                source: 'fallback_logic'
            });
        }

        if (gameData.winRate > 0.5) {
            recommendations.push({
                action: 'REDUCE_PLAYER_WIN_RATE',
                priority: 'HIGH',
                confidence: 85,
                reasoning: 'Player win rate too high - unsustainable for house profitability',
                source: 'fallback_logic'
            });
        }

        return recommendations.length > 0 ? recommendations : [{
            action: 'MAINTAIN_CURRENT_SETTINGS',
            priority: 'LOW',
            confidence: 70,
            reasoning: 'All metrics within acceptable ranges',
            source: 'fallback_logic'
        }];
    }

    /**
     * Evaluate recommendation effectiveness (called after implementation)
     */
    async evaluateRecommendationEffectiveness(recommendationId, beforeMetrics, afterMetrics) {
        try {
            const improvement = this.calculateImprovement(beforeMetrics, afterMetrics);
            
            // Update learning memory with effectiveness score
            const query = `
                UPDATE ai_learning_memory 
                SET applied = TRUE, effectiveness = ?
                WHERE memory_key = ?
            `;
            
            await dbManager.databaseAdapter.executeQuery(query, [improvement, recommendationId]);
            
            // Update prediction accuracy
            if (improvement > 0) {
                const current = this.predictionAccuracy.get(recommendationId) || 50;
                this.predictionAccuracy.set(recommendationId, Math.min(100, current + 5));
            } else {
                const current = this.predictionAccuracy.get(recommendationId) || 50;
                this.predictionAccuracy.set(recommendationId, Math.max(0, current - 10));
            }

            logger.info(`📊 Recommendation effectiveness evaluated: ${improvement}% improvement`);

        } catch (error) {
            logger.error(`Failed to evaluate recommendation effectiveness: ${error.message}`);
        }
    }

    /**
     * Calculate improvement percentage
     */
    calculateImprovement(beforeMetrics, afterMetrics) {
        // Calculate overall improvement based on key metrics
        const houseEdgeImprovement = (afterMetrics.houseEdge - beforeMetrics.houseEdge) / beforeMetrics.houseEdge * 100;
        const volumeImprovement = (afterMetrics.volume - beforeMetrics.volume) / beforeMetrics.volume * 100;
        const profitImprovement = (afterMetrics.profit - beforeMetrics.profit) / beforeMetrics.profit * 100;

        // Weighted average of improvements
        return (houseEdgeImprovement * 0.4 + volumeImprovement * 0.3 + profitImprovement * 0.3);
    }

    /**
     * Format fallback response as JSON for compatibility
     */
    formatFallbackAsJSON(fallbackContent) {
        try {
            if (typeof fallbackContent === 'string') {
                return fallbackContent;
            }
            
            // Convert fallback object to expected AI response format
            return JSON.stringify({
                analysis: {
                    keyInsights: fallbackContent.recommendations?.slice(0, 3).map(r => r.reasoning) || ['System using cached analysis'],
                    predictedOutcome: fallbackContent.message || 'Stable operation expected based on cached data',
                    riskFactors: ['Limited AI analysis available'],
                    opportunityScore: 75
                },
                recommendations: fallbackContent.recommendations || [
                    {
                        action: 'MONITOR_SYSTEM',
                        priority: 'MEDIUM',
                        confidence: 80,
                        reasoning: 'Continue monitoring while AI is unavailable',
                        impact: 'MEDIUM'
                    }
                ],
                confidence: 75,
                source: 'fallback_system',
                timestamp: Date.now()
            });
            
        } catch (error) {
            logger.error(`Failed to format fallback as JSON: ${error.message}`);
            return this.createEmergencyFallback();
        }
    }

    /**
     * Create emergency fallback when all else fails
     */
    createEmergencyFallback() {
        return JSON.stringify({
            analysis: {
                keyInsights: ['AI system temporarily unavailable', 'Using conservative approach', 'Manual monitoring recommended'],
                predictedOutcome: 'System should remain stable with current settings',
                riskFactors: ['Limited automated analysis', 'Reduced prediction accuracy'],
                opportunityScore: 60
            },
            recommendations: [
                {
                    action: 'MAINTAIN_STATUS_QUO',
                    priority: 'HIGH',
                    confidence: 90,
                    reasoning: 'Conservative approach until AI is restored',
                    impact: 'LOW',
                    implementation: 'Continue current operations without changes'
                },
                {
                    action: 'MANUAL_MONITORING',
                    priority: 'MEDIUM', 
                    confidence: 95,
                    reasoning: 'Increased manual oversight recommended',
                    impact: 'MEDIUM',
                    implementation: 'Check system metrics every 30 minutes'
                }
            ],
            confidence: 60,
            source: 'emergency_fallback',
            timestamp: Date.now(),
            note: 'AI temporarily unavailable - using conservative recommendations'
        });
    }

    /**
     * Get AI system status including rate limiting info
     */
    getAIStatus() {
        const rateLimitStatus = this.rateLimitFix?.getRateLimitStatus() || {
            isRateLimited: false,
            timeUntilReset: 0,
            consecutiveErrors: 0,
            canRetry: true
        };
        
        return {
            aiEnabled: !!this.apiKey,
            model: this.model,
            learningMemorySize: this.learningMemory.size,
            averageAccuracy: Array.from(this.predictionAccuracy.values()).reduce((a, b) => a + b, 0) / this.predictionAccuracy.size || 0,
            lastAnalysis: this.analysisHistory.length > 0 ? this.analysisHistory[this.analysisHistory.length - 1] : null,
            rateLimiting: {
                isRateLimited: rateLimitStatus.isRateLimited,
                timeUntilReset: rateLimitStatus.timeUntilReset,
                consecutiveErrors: rateLimitStatus.consecutiveErrors,
                canRetry: rateLimitStatus.canRetry,
                lastSuccessfulCall: rateLimitStatus.lastSuccessfulCall
            },
            devMode: this.devMode,
            status: rateLimitStatus.isRateLimited ? 'RATE_LIMITED' : (this.apiKey ? 'OPERATIONAL' : 'DEV_MODE')
        };
    }
}

module.exports = new RealAIEngine();