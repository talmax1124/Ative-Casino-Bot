/**
 * Optimized AI Service
 * Reduces token usage through caching, prompt optimization, and smart routing
 */

const axios = require('axios');
const logger = require('./logger');
const aiCacheManager = require('./aiCacheManager');

class OptimizedAIService {
    constructor() {
        this.apiKey = process.env.OPENAI_API_KEY || 'sk-proj-R891OUst3H19ndpAQ8BNhBbsuTlXGghi4NYMijxqRimrm9omrx1AcBNiy37_G0n8UskVfn8nmYT3BlbkFJAzmS81PDjXVrX77UHfD8fJyNVrGBipkjgkuqyYdaLD1YSKu-standalone-bot';
        this.baseURL = 'https://api.openai.com/v1/chat/completions';
        
        // Token usage tracking
        this.tokenUsage = {
            total: 0,
            today: 0,
            thisHour: 0,
            lastReset: Date.now()
        };
        
        // Cost tracking (rough estimates)
        this.costTracking = {
            totalCost: 0,
            todayCost: 0
        };
        
        // Rate limiting - reduced to prevent 429 errors
        this.requestQueue = [];
        this.processingQueue = false;
        this.maxConcurrentRequests = 1; // Reduced from 3 to prevent rate limits
        this.activeRequests = 0;
        this.lastRequestTime = 0;
        this.minRequestInterval = 1000; // Minimum 1s between requests
        
        // Fallback responses for common questions
        this.fallbackResponses = {
            balance: "To check your balance, use the `/balance` command! It shows your wallet, bank, and total funds.",
            help: "Use `/help` to see all available commands, or `/help games` for game-specific help!",
            games: "We have 16+ exciting games! Try `/slots`, `/blackjack`, `/roulette`, `/crash`, and more! Use `/help games` for the complete list.",
            earnings: "Earn money with `/work` (1hr cooldown), `/crime` (30min), `/beg` (1hr), or play games to win big!",
            lottery: "Buy lottery tickets with `/purchaselottery`! Drawings happen Tuesdays & Saturdays at 10AM EST."
        };
    }

    /**
     * Initialize the AI service
     */
    async initialize() {
        await aiCacheManager.initialize();
        logger.info('🤖 Optimized AI Service initialized');
        
        // Start periodic cleanup
        setInterval(() => this.performMaintenance(), 60000); // Every minute
    }

    /**
     * Get optimized AI response with caching and fallback
     */
    async getOptimizedResponse(question, context, username, userIsAdmin = false, isJoke = false) {
        try {
            // Step 1: Check cache first
            const contextType = isJoke ? 'joke' : (userIsAdmin ? 'admin' : 'general');
            const cachedResponse = await aiCacheManager.getCachedResponse(question, contextType, null, isJoke);
            
            if (cachedResponse) {
                logger.info(`💰 Token saved via cache for question: "${question.substring(0, 50)}..."`);
                return cachedResponse.response;
            }
            
            // Step 2: Try fallback for common questions
            if (!isJoke && !userIsAdmin) {
                const fallback = this.tryFallbackResponse(question);
                if (fallback) {
                    logger.info(`⚡ Token saved via fallback for question: "${question.substring(0, 50)}..."`);
                    // Cache the fallback response
                    await aiCacheManager.cacheResponse(question, fallback, contextType);
                    return fallback;
                }
            }
            
            // Step 3: Use AI with optimized prompts
            const optimizedPrompt = this.optimizePrompt(context, question, username, userIsAdmin, isJoke);
            const response = await this.makeAIRequest(optimizedPrompt, isJoke);
            
            // Step 4: Cache the response
            await aiCacheManager.cacheResponse(question, response, contextType, null, isJoke);
            
            return response;
            
        } catch (error) {
            logger.error(`Optimized AI service error: ${error.message}`);
            
            // Special handling for rate limit errors
            if (error.message.includes('Rate limit exceeded') || error.message.includes('429')) {
                logger.warn('Using fallback due to rate limiting');
                // Try one more fallback attempt
                const fallback = this.tryFallbackResponse(question);
                if (fallback) {
                    await aiCacheManager.cacheResponse(question, fallback, contextType);
                    return fallback;
                }
            }
            
            return this.getEmergencyFallback(question, isJoke);
        }
    }

    /**
     * Try to use a fallback response for common questions
     */
    tryFallbackResponse(question) {
        const lowerQuestion = question.toLowerCase();
        
        // Balance questions
        if (lowerQuestion.includes('balance') || lowerQuestion.includes('money') || lowerQuestion.includes('funds')) {
            return this.fallbackResponses.balance;
        }
        
        // Help questions
        if (lowerQuestion.includes('help') || lowerQuestion.includes('commands') || lowerQuestion.includes('how do i')) {
            return this.fallbackResponses.help;
        }
        
        // Game questions
        if (lowerQuestion.includes('game') || lowerQuestion.includes('play') || lowerQuestion.includes('bet')) {
            return this.fallbackResponses.games;
        }
        
        // Earning questions
        if (lowerQuestion.includes('earn') || lowerQuestion.includes('work') || lowerQuestion.includes('income')) {
            return this.fallbackResponses.earnings;
        }
        
        // Lottery questions
        if (lowerQuestion.includes('lottery') || lowerQuestion.includes('ticket')) {
            return this.fallbackResponses.lottery;
        }
        
        return null;
    }

    /**
     * Optimize prompts to reduce token usage
     */
    optimizePrompt(context, question, username, userIsAdmin, isJoke) {
        if (isJoke) {
            // Ultra-minimal joke prompt
            return {
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: "system",
                        content: "You are a professional comedian. Create an original, funny joke based on the user's request. Return ONLY the joke, no extra text."
                    },
                    {
                        role: "user",
                        content: `Make a joke about: "${question}"`
                    }
                ],
                max_tokens: 100,
                temperature: 0.9
            };
        }
        
        // Compress context for regular responses
        const compressedContext = this.compressContext(context, userIsAdmin);
        
        return {
            model: 'gpt-4o-mini', // Cheaper than gpt-4
            messages: [
                {
                    role: "system",
                    content: compressedContext
                },
                {
                    role: "user",
                    content: `USER: ${username}\nQ: "${question}"\n\nBe helpful, specific, and concise (max 800 chars).`
                }
            ],
            max_tokens: 300, // Reduced from 1000
            temperature: 0.7
        };
    }

    /**
     * Compress context to reduce token usage
     */
    compressContext(context, userIsAdmin) {
        if (userIsAdmin) {
            // Keep admin context mostly intact
            return context.substring(0, 1500); // Limit admin context
        }
        
        // Heavily compress regular context
        const essentialInfo = `You are ATIVE, the casino AI assistant. 🎰

GAMES: /blackjack, /slots, /roulette, /crash, /plinko, /treasurevault, /keno, etc.
ECONOMY: /balance, /work, /deposit, /withdraw, /sendmoney
LOTTERY: /purchaselottery (Tues/Sat drawings)
HELP: /help [category]

Be helpful, use emojis, encourage playing games. Keep responses under 800 characters.`;
        
        return essentialInfo;
    }

    /**
     * Make AI request with retry logic and rate limiting
     */
    async makeAIRequest(prompt, isJoke = false) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ prompt, isJoke, resolve, reject });
            this.processQueue();
        });
    }

    /**
     * Process request queue with rate limiting
     */
    async processQueue() {
        if (this.processingQueue || this.activeRequests >= this.maxConcurrentRequests || this.requestQueue.length === 0) {
            return;
        }
        
        this.processingQueue = true;
        
        while (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
            const request = this.requestQueue.shift();
            this.activeRequests++;
            
            this.executeRequest(request).finally(() => {
                this.activeRequests--;
                this.processQueue(); // Continue processing
            });
        }
        
        this.processingQueue = false;
    }

    /**
     * Execute individual AI request
     */
    async executeRequest({ prompt, isJoke, resolve, reject }) {
        const maxRetries = 2; // Reduced retries
        let attempt = 0;
        
        // Rate limiting - ensure minimum interval between requests
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
            const waitTime = this.minRequestInterval - timeSinceLastRequest;
            logger.debug(`Rate limiting: waiting ${waitTime}ms before request`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        this.lastRequestTime = Date.now();
        
        while (attempt < maxRetries) {
            try {
                const startTime = Date.now();
                
                const response = await axios.post(this.baseURL, prompt, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 8000 // Reduced timeout
                });
                
                const responseTime = Date.now() - startTime;
                const result = response.data.choices[0]?.message?.content?.trim();
                
                if (!result) {
                    throw new Error('Empty AI response');
                }
                
                // Track usage
                this.trackUsage(response.data.usage, responseTime, isJoke);
                
                logger.info(`🤖 AI response generated (${responseTime}ms, ${response.data.usage?.total_tokens || 0} tokens)`);
                return resolve(result);
                
            } catch (error) {
                attempt++;
                
                if (error.response?.status === 429) {
                    // Rate limited - wait much longer and potentially skip request
                    const delay = Math.min(5000 * Math.pow(2, attempt), 30000); // Cap at 30s
                    logger.warn(`AI rate limited (429), waiting ${delay}ms (attempt ${attempt}/${maxRetries})`);
                    
                    if (attempt >= maxRetries) {
                        // Use fallback instead of continuing to retry
                        logger.error('Rate limit exceeded, using fallback response');
                        return reject(new Error('Rate limit exceeded - using fallback'));
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                
                if (attempt >= maxRetries) {
                    logger.error(`AI request failed after ${maxRetries} attempts: ${error.message}`);
                    return reject(error);
                }
                
                // Small delay before retry
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }

    /**
     * Track token usage and costs
     */
    trackUsage(usage, responseTime, isJoke) {
        if (!usage) return;
        
        const tokens = usage.total_tokens || 0;
        this.tokenUsage.total += tokens;
        this.tokenUsage.today += tokens;
        this.tokenUsage.thisHour += tokens;
        
        // Rough cost calculation (GPT-4o-mini pricing)
        const cost = (usage.prompt_tokens * 0.000015) + (usage.completion_tokens * 0.0006);
        this.costTracking.totalCost += cost;
        this.costTracking.todayCost += cost;
        
        logger.debug(`💰 AI usage: ${tokens} tokens, $${cost.toFixed(4)} cost, ${responseTime}ms`);
    }

    /**
     * Get emergency fallback response
     */
    getEmergencyFallback(question, isJoke) {
        if (isJoke) {
            const jokes = [
                "Why don't casinos ever hire comedians? Because they always fold under pressure!",
                "What do you call a gambling robot? A slot bot!",
                "Why did the coin go to therapy? It was feeling a bit flipped out!"
            ];
            return jokes[Math.floor(Math.random() * jokes.length)];
        }
        
        return "I'm experiencing some technical difficulties right now! Try using `/help` for command information, or ask again in a moment. 🤖";
    }

    /**
     * Get usage statistics
     */
    getUsageStats() {
        return {
            tokens: this.tokenUsage,
            costs: this.costTracking,
            queue: {
                pending: this.requestQueue.length,
                active: this.activeRequests
            },
            cache: aiCacheManager.getStats()
        };
    }

    /**
     * Periodic maintenance
     */
    performMaintenance() {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        const oneDay = 24 * oneHour;
        
        // Reset hourly counter
        if (now - this.tokenUsage.lastReset > oneHour) {
            this.tokenUsage.thisHour = 0;
            this.tokenUsage.lastReset = now;
            
            // Reset daily counter at midnight
            const lastMidnight = new Date().setHours(0, 0, 0, 0);
            if (this.tokenUsage.lastReset < lastMidnight) {
                this.tokenUsage.today = 0;
                this.costTracking.todayCost = 0;
            }
        }
        
        // Clean fallback cache
        aiCacheManager.cleanupFallbackCache();
        
        // Log stats periodically
        if (Math.random() < 0.1) { // 10% chance to log stats
            logger.info(`💰 AI Usage: ${this.tokenUsage.thisHour} tokens/hour, $${this.costTracking.todayCost.toFixed(2)}/day`);
        }
    }

    /**
     * Reset usage statistics
     */
    resetStats() {
        this.tokenUsage = {
            total: 0,
            today: 0,
            thisHour: 0,
            lastReset: Date.now()
        };
        this.costTracking = {
            totalCost: 0,
            todayCost: 0
        };
        logger.info('🔄 AI usage statistics reset');
    }
}

module.exports = new OptimizedAIService();