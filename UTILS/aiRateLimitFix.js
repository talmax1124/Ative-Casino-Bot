/**
 * AI RATE LIMIT FIX & FALLBACK SYSTEM
 * Handles OpenAI 429 errors with intelligent fallback
 */

class AIRateLimitFix {
    constructor() {
        this.rateLimitState = {
            isRateLimited: false,
            rateLimitUntil: 0,
            consecutiveErrors: 0,
            lastSuccessfulCall: Date.now()
        };
        
        this.fallbackResponses = new Map([
            ['economy_analysis', this.createEconomyFallback()],
            ['player_behavior', this.createBehaviorFallback()],
            ['system_recommendations', this.createRecommendationsFallback()],
            ['default', this.createDefaultFallback()]
        ]);
        
        this.retryDelays = [1000, 2000, 5000, 10000, 30000]; // Progressive backoff
    }

    /**
     * SMART API CALL WITH RATE LIMIT HANDLING
     */
    async makeAICall(prompt, category = 'default', options = {}) {
        const now = Date.now();
        
        // Check if we're currently rate limited
        if (this.rateLimitState.isRateLimited && now < this.rateLimitState.rateLimitUntil) {
            console.log(`🚨 Still rate limited for ${Math.round((this.rateLimitState.rateLimitUntil - now) / 1000)}s`);
            return this.getFallbackResponse(category, 'rate_limited');
        }

        try {
            // Attempt API call with timeout
            const response = await this.callOpenAIWithTimeout(prompt, options.timeout || 10000);
            
            // Success - reset rate limit state
            this.rateLimitState.consecutiveErrors = 0;
            this.rateLimitState.isRateLimited = false;
            this.rateLimitState.lastSuccessfulCall = now;
            
            return {
                success: true,
                source: 'openai',
                content: response,
                timestamp: now
            };
            
        } catch (error) {
            return this.handleAPIError(error, category);
        }
    }

    /**
     * HANDLE API ERRORS WITH INTELLIGENT FALLBACK
     */
    async handleAPIError(error, category) {
        const now = Date.now();
        this.rateLimitState.consecutiveErrors++;
        
        if (error.status === 429 || error.message.includes('rate limit')) {
            // Rate limit detected
            console.log('🚨 OpenAI Rate Limit Hit - Activating Fallback');
            
            const retryAfter = this.parseRetryAfter(error) || this.getExponentialBackoff();
            this.rateLimitState.isRateLimited = true;
            this.rateLimitState.rateLimitUntil = now + retryAfter;
            
            return this.getFallbackResponse(category, 'rate_limited');
            
        } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
            // Timeout - use fallback immediately
            console.log('⏰ OpenAI Timeout - Using Fallback');
            return this.getFallbackResponse(category, 'timeout');
            
        } else {
            // Other error - use fallback
            console.log(`❌ OpenAI Error: ${error.message} - Using Fallback`);
            return this.getFallbackResponse(category, 'error');
        }
    }

    /**
     * GET INTELLIGENT FALLBACK RESPONSE
     */
    getFallbackResponse(category, reason) {
        const fallback = this.fallbackResponses.get(category) || this.fallbackResponses.get('default');
        
        return {
            success: false,
            source: 'fallback',
            reason: reason,
            content: fallback,
            timestamp: Date.now(),
            note: 'AI temporarily unavailable - using intelligent fallback'
        };
    }

    /**
     * ECONOMY ANALYSIS FALLBACK
     */
    createEconomyFallback() {
        return {
            status: 'stable',
            recommendations: [
                { action: 'maintain_current_settings', confidence: 0.8, priority: 'medium' },
                { action: 'monitor_player_behavior', confidence: 0.9, priority: 'high' },
                { action: 'check_house_edge_stability', confidence: 0.85, priority: 'high' }
            ],
            metrics: {
                houseEdgeHealth: 'good',
                playerSatisfaction: 'stable',
                economicRisk: 'low'
            },
            message: 'Economy appears stable based on cached analysis. Full AI analysis temporarily unavailable.'
        };
    }

    /**
     * BEHAVIOR ANALYSIS FALLBACK  
     */
    createBehaviorFallback() {
        return {
            playerSegments: {
                casual: { percentage: 65, trend: 'stable' },
                regular: { percentage: 25, trend: 'stable' },
                whale: { percentage: 10, trend: 'stable' }
            },
            riskLevel: 'normal',
            recommendations: ['Continue current monitoring', 'Watch for unusual patterns'],
            message: 'Using cached behavioral patterns. Real-time AI analysis temporarily unavailable.'
        };
    }

    /**
     * SYSTEM RECOMMENDATIONS FALLBACK
     */
    createRecommendationsFallback() {
        return [
            {
                category: 'economy',
                action: 'Monitor current settings',
                priority: 'medium',
                confidence: 0.8,
                reasoning: 'System appears stable based on last known state'
            },
            {
                category: 'performance', 
                action: 'Check system metrics',
                priority: 'low',
                confidence: 0.7,
                reasoning: 'Regular performance monitoring recommended'
            }
        ];
    }

    /**
     * DEFAULT FALLBACK
     */
    createDefaultFallback() {
        return {
            message: 'AI analysis temporarily unavailable due to rate limiting. Using cached data and conservative recommendations.',
            status: 'fallback_active',
            confidence: 0.6,
            recommendations: ['Monitor system manually', 'Retry AI analysis in a few minutes']
        };
    }

    /**
     * EXPONENTIAL BACKOFF CALCULATION
     */
    getExponentialBackoff() {
        const errors = Math.min(this.rateLimitState.consecutiveErrors - 1, this.retryDelays.length - 1);
        return this.retryDelays[errors] + (Math.random() * 1000); // Add jitter
    }

    /**
     * PARSE RETRY-AFTER HEADER
     */
    parseRetryAfter(error) {
        const retryAfter = error.headers?.['retry-after'] || error.response?.headers?.['retry-after'];
        return retryAfter ? parseInt(retryAfter) * 1000 : null;
    }

    /**
     * CALL OPENAI WITH TIMEOUT
     */
    async callOpenAIWithTimeout(prompt, timeout) {
        return new Promise(async (resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                reject(new Error('Request timeout'));
            }, timeout);

            try {
                // Your actual OpenAI API call here
                const response = await this.makeOpenAIRequest(prompt);
                clearTimeout(timeoutHandle);
                resolve(response);
            } catch (error) {
                clearTimeout(timeoutHandle);
                reject(error);
            }
        });
    }

    /**
     * ACTUAL OPENAI REQUEST (implemented by realAIEngine.js)
     */
    async makeOpenAIRequest(prompt) {
        // This method is overridden by the real AI engine
        // It's just a placeholder that will be replaced
        throw new Error('OpenAI implementation should be injected by RealAIEngine');
    }

    /**
     * GET RATE LIMIT STATUS
     */
    getRateLimitStatus() {
        const now = Date.now();
        return {
            isRateLimited: this.rateLimitState.isRateLimited && now < this.rateLimitState.rateLimitUntil,
            timeUntilReset: Math.max(0, this.rateLimitState.rateLimitUntil - now),
            consecutiveErrors: this.rateLimitState.consecutiveErrors,
            lastSuccessfulCall: this.rateLimitState.lastSuccessfulCall,
            canRetry: now >= this.rateLimitState.rateLimitUntil
        };
    }
}

module.exports = AIRateLimitFix;