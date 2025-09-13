/**
 * EconomicAnalyzer - AI-Powered Economic Analysis Engine
 * Uses ChatGPT to analyze casino economy metrics and generate insights
 */

const EventEmitter = require('events');
const axios = require('axios');
const logger = require('../../UTILS/logger');

class EconomicAnalyzer extends EventEmitter {
    constructor(config, auditLogger) {
        super();
        
        this.config = config;
        this.auditLogger = auditLogger;
        
        // OpenAI API configuration
        this.apiKey = config.openaiApiKey;
        this.model = config.model || 'gpt-4';
        this.maxTokens = config.maxTokens || 2000;
        this.temperature = config.temperature || 0.3; // Lower for more consistent analysis
        
        // Rate limiting for OpenAI API calls
        this.lastAPICall = 0;
        this.minTimeBetweenCalls = 2000; // 2 seconds between calls
        
        // Analysis history for context
        this.analysisHistory = [];
        this.maxHistorySize = 10;
        
        // Economic knowledge base
        this.economicContext = this.buildEconomicContext();
    }

    async initialize() {
        if (!this.apiKey) {
            throw new Error('OpenAI API key is required for EconomicAnalyzer');
        }
        
        logger.info('EconomicAnalyzer initialized with ChatGPT integration');
        return true;
    }

    /**
     * Analyze economic metrics using ChatGPT
     */
    async analyze(metrics) {
        try {
            logger.info('Starting AI economic analysis...');
            
            // Prepare analysis prompt
            const prompt = this.buildAnalysisPrompt(metrics);
            
            // Get AI analysis
            const aiResponse = await this.queryOpenAI(prompt);
            
            // Parse and validate response
            const analysis = this.parseAnalysisResponse(aiResponse, metrics);
            
            // Store in history
            this.addToHistory({
                timestamp: new Date(),
                metrics,
                analysis,
                rawResponse: aiResponse
            });
            
            await this.auditLogger.log('analysis', 'AI economic analysis completed', {
                tokensUsed: aiResponse.usage?.total_tokens || 0,
                issuesIdentified: analysis.issues?.length || 0,
                severity: analysis.overallSeverity
            });
            
            return analysis;
            
        } catch (error) {
            logger.error(`Economic analysis failed: ${error.message}`);
            await this.auditLogger.log('error', 'AI analysis failed', {
                error: error.message,
                hasApiKey: !!this.apiKey
            });
            
            // Fallback to rule-based analysis
            return this.fallbackAnalysis(metrics);
        }
    }

    /**
     * Build comprehensive analysis prompt for ChatGPT
     */
    buildAnalysisPrompt(metrics) {
        const recentHistory = this.getRecentAnalysisContext();
        
        return `You are an expert casino economic analyst. Analyze these real-time casino economy metrics and provide actionable insights.

CASINO ECONOMIC CONTEXT:
${this.economicContext}

CURRENT METRICS:
${JSON.stringify(metrics, null, 2)}

RECENT ANALYSIS HISTORY:
${recentHistory}

ANALYSIS REQUIREMENTS:
1. Identify economic issues (inflation, deflation, liquidity problems, imbalanced games)
2. Assess severity: low, medium, high, critical
3. Suggest small, safe economic adjustments (max 5% changes)
4. Consider player experience impact
5. Prioritize stability over aggressive optimization

RESPONSE FORMAT (JSON):
{
  "overallSeverity": "low|medium|high|critical",
  "economicHealth": {
    "score": 0-100,
    "trend": "improving|stable|declining",
    "primaryConcern": "brief description"
  },
  "issues": [
    {
      "type": "inflation|deflation|liquidity|game_imbalance|volume|distribution",
      "severity": "low|medium|high|critical",
      "description": "clear problem description",
      "impact": "player/economic impact",
      "confidence": 0-100,
      "affectedSystems": ["game1", "game2"]
    }
  ],
  "recommendations": [
    {
      "action": "adjust_payout|modify_limits|adjust_house_edge|modify_drop_rates",
      "target": "specific game or system",
      "adjustment": "percentage or specific change",
      "reasoning": "why this helps",
      "priority": "low|medium|high",
      "expectedImpact": 0-100,
      "riskLevel": "low|medium|high"
    }
  ],
  "marketInsights": {
    "playerBehavior": "observed trends",
    "gamePopularity": "popularity shifts",
    "wealthDistribution": "distribution analysis",
    "predictions": "short-term predictions"
  },
  "confidence": 0-100,
  "reasoning": "overall analysis reasoning"
}

Focus on small, incremental changes. Avoid dramatic adjustments that could destabilize the economy.`;
    }

    /**
     * Query OpenAI API with economic analysis prompt
     */
    async queryOpenAI(prompt) {
        // Apply rate limiting
        await this.enforceRateLimit();
        
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: this.model,
            messages: [
                {
                    role: "system",
                    content: "You are a casino economic analyst expert. Always respond with valid JSON following the exact format requested. Be precise, concise, and focus on actionable insights."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_tokens: this.maxTokens,
            temperature: this.temperature,
            response_format: { type: "json_object" }
        }, {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data;
    }

    /**
     * Parse and validate ChatGPT analysis response
     */
    parseAnalysisResponse(aiResponse, originalMetrics) {
        try {
            const content = aiResponse.choices[0]?.message?.content;
            if (!content) {
                throw new Error('Empty response from OpenAI');
            }

            const analysis = JSON.parse(content);
            
            // Validate required fields
            const required = ['overallSeverity', 'economicHealth', 'issues', 'recommendations'];
            for (const field of required) {
                if (!analysis[field]) {
                    throw new Error(`Missing required field: ${field}`);
                }
            }
            
            // Validate severity levels
            const validSeverities = ['low', 'medium', 'high', 'critical'];
            if (!validSeverities.includes(analysis.overallSeverity)) {
                analysis.overallSeverity = 'medium';
            }
            
            // Validate and sanitize recommendations
            analysis.recommendations = this.validateRecommendations(analysis.recommendations);
            
            // Add metadata
            analysis.timestamp = new Date().toISOString();
            analysis.aiModel = this.model;
            analysis.tokensUsed = aiResponse.usage?.total_tokens || 0;
            analysis.originalMetrics = originalMetrics;
            
            return analysis;
            
        } catch (error) {
            logger.error(`Failed to parse AI response: ${error.message}`);
            throw new Error(`Invalid AI response format: ${error.message}`);
        }
    }

    /**
     * Validate and sanitize AI recommendations for safety
     */
    validateRecommendations(recommendations) {
        if (!Array.isArray(recommendations)) {
            return [];
        }
        
        return recommendations
            .filter(rec => rec && typeof rec === 'object')
            .map(rec => {
                // Ensure safe adjustment ranges
                if (rec.adjustment && typeof rec.adjustment === 'string') {
                    const percentage = parseFloat(rec.adjustment.replace(/[%]/g, ''));
                    if (!isNaN(percentage)) {
                        // Cap adjustments at 5%
                        const cappedPercentage = Math.max(-5, Math.min(5, percentage));
                        rec.adjustment = `${cappedPercentage}%`;
                        
                        if (Math.abs(cappedPercentage) !== Math.abs(percentage)) {
                            rec.reasoning = `${rec.reasoning} (Adjustment capped at 5% for safety)`;
                        }
                    }
                }
                
                // Validate action types
                const validActions = ['adjust_payout', 'modify_limits', 'adjust_house_edge', 'modify_drop_rates'];
                if (!validActions.includes(rec.action)) {
                    rec.action = 'adjust_payout'; // Default safe action
                }
                
                // Ensure risk level is set
                if (!rec.riskLevel || !['low', 'medium', 'high'].includes(rec.riskLevel)) {
                    rec.riskLevel = 'medium';
                }
                
                return rec;
            })
            .slice(0, 5); // Limit to 5 recommendations max
    }

    /**
     * Fallback rule-based analysis when AI fails
     */
    fallbackAnalysis(metrics) {
        logger.info('Using fallback rule-based economic analysis');
        
        const issues = [];
        const recommendations = [];
        let overallSeverity = 'low';
        
        // Check inflation/deflation
        if (metrics.economicHealth?.inflationRate) {
            if (metrics.economicHealth.inflationRate > 0.1) {
                issues.push({
                    type: 'inflation',
                    severity: 'high',
                    description: 'High inflation detected in economy',
                    impact: 'Currency losing value, players may lose confidence',
                    confidence: 90,
                    affectedSystems: ['all_games']
                });
                
                recommendations.push({
                    action: 'adjust_house_edge',
                    target: 'high_volume_games',
                    adjustment: '2%',
                    reasoning: 'Increase house edge to reduce money supply',
                    priority: 'high',
                    expectedImpact: 70,
                    riskLevel: 'medium'
                });
                
                overallSeverity = 'high';
            } else if (metrics.economicHealth.inflationRate < -0.05) {
                issues.push({
                    type: 'deflation',
                    severity: 'medium',
                    description: 'Deflation detected in economy',
                    impact: 'Money supply shrinking, reduced economic activity',
                    confidence: 85,
                    affectedSystems: ['all_games']
                });
                
                overallSeverity = 'medium';
            }
        }
        
        // Check liquidity
        if (metrics.economicHealth?.liquidityRatio > 0.2) {
            issues.push({
                type: 'liquidity',
                severity: 'medium',
                description: 'High number of users with low balances',
                impact: 'Reduced player engagement and game activity',
                confidence: 80,
                affectedSystems: ['user_retention']
            });
        }
        
        // Check game imbalances
        if (metrics.gamePerformance?.games) {
            for (const [game, stats] of Object.entries(metrics.gamePerformance.games)) {
                if (stats.houseEdge < 0.01) {
                    issues.push({
                        type: 'game_imbalance',
                        severity: 'medium',
                        description: `${game} has very low house edge`,
                        impact: 'Game may be unprofitable',
                        confidence: 85,
                        affectedSystems: [game]
                    });
                    
                    recommendations.push({
                        action: 'adjust_house_edge',
                        target: game,
                        adjustment: '1%',
                        reasoning: 'Increase house edge to ensure profitability',
                        priority: 'medium',
                        expectedImpact: 50,
                        riskLevel: 'low'
                    });
                }
            }
        }
        
        return {
            overallSeverity,
            economicHealth: {
                score: Math.max(0, 100 - (issues.length * 20)),
                trend: 'stable',
                primaryConcern: issues[0]?.description || 'No major concerns'
            },
            issues,
            recommendations,
            marketInsights: {
                playerBehavior: 'Limited analysis available',
                gamePopularity: 'Requires more data',
                wealthDistribution: 'Monitoring required',
                predictions: 'Fallback analysis - limited predictions'
            },
            confidence: 60,
            reasoning: 'Fallback rule-based analysis due to AI unavailability',
            timestamp: new Date().toISOString(),
            aiModel: 'fallback',
            tokensUsed: 0
        };
    }

    /**
     * Build economic context for ChatGPT
     */
    buildEconomicContext() {
        return `
CASINO ECONOMY FUNDAMENTALS:
- Virtual currency system with wallet/bank balances
- House edge ensures long-term profitability
- Player retention depends on fair, engaging gameplay
- Economic stability prevents inflation/deflation spirals
- Wealth distribution affects player engagement

GAME TYPES AND ECONOMICS:
- Slots: High volume, consistent house edge
- Blackjack: Skill-based, lower house edge
- Roulette: Pure chance, moderate house edge
- Crash: High volatility, social element
- Scratch tickets: Periodic drops, excitement spikes

ECONOMIC HEALTH INDICATORS:
- Inflation rate: Money supply growth vs economic activity
- Liquidity ratio: Users with sufficient balances for gameplay
- Velocity: How quickly money circulates through games
- Gini coefficient: Wealth distribution inequality
- House edge effectiveness: Actual vs theoretical returns

RISK FACTORS:
- Rapid adjustments can cause player exodus
- Excessive house edge reduces player satisfaction
- Economic instability affects long-term retention
- Wealth concentration limits participation

ADJUSTMENT PRINCIPLES:
- Small, gradual changes (1-5% maximum)
- Monitor player behavior impact
- Maintain competitive house edges
- Preserve game excitement and fairness
- Consider cross-game economic effects
`;
    }

    /**
     * Get recent analysis context for continuity
     */
    getRecentAnalysisContext() {
        if (this.analysisHistory.length === 0) {
            return 'No previous analysis history available.';
        }
        
        const recent = this.analysisHistory.slice(-3);
        return recent.map(entry => 
            `${entry.timestamp.toISOString()}: ${entry.analysis.overallSeverity} severity, ${entry.analysis.issues?.length || 0} issues identified`
        ).join('\n');
    }

    /**
     * Add analysis to history
     */
    addToHistory(entry) {
        this.analysisHistory.push(entry);
        
        // Maintain maximum history size
        if (this.analysisHistory.length > this.maxHistorySize) {
            this.analysisHistory.shift();
        }
    }

    /**
     * Get analysis history
     */
    getHistory(limit = 10) {
        return this.analysisHistory.slice(-limit);
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.apiKey = this.config.openaiApiKey;
        this.model = this.config.model || 'gpt-4';
        
        logger.info('EconomicAnalyzer configuration updated');
    }

    /**
     * Test AI connectivity
     */
    async testConnection() {
        try {
            const response = await this.queryOpenAI('Test connection. Respond with {"status": "connected"}');
            const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
            return parsed.status === 'connected';
        } catch (error) {
            logger.error(`AI connection test failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Enforce rate limiting for OpenAI API calls
     */
    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastAPICall;
        
        if (timeSinceLastCall < this.minTimeBetweenCalls) {
            const waitTime = this.minTimeBetweenCalls - timeSinceLastCall;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastAPICall = Date.now();
    }
}

module.exports = EconomicAnalyzer;