/**
 * AI Cache Manager with Redis
 * Reduces token usage by caching AI responses intelligently
 */

const Redis = require('redis');
const crypto = require('crypto');
const logger = require('./logger');

class AICacheManager {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.fallbackCache = new Map(); // In-memory fallback
        this.maxFallbackSize = 1000;
        
        // Cache TTL settings (in seconds)
        this.cacheTTL = {
            general: 3600,      // 1 hour for general responses
            jokes: 86400,       // 24 hours for jokes
            help: 7200,         // 2 hours for help content
            balance: 300,       // 5 minutes for balance checks
            session: 60,        // 1 minute for session checks
            admin: 1800         // 30 minutes for admin responses
        };
    }

    /**
     * Initialize Redis connection
     */
    async initialize() {
        try {
            // Only attempt Redis if URL is explicitly provided
            const redisUrl = process.env.REDIS_URL;
            if (!redisUrl) {
                logger.info('No Redis URL provided, using fallback cache only');
                this.isConnected = false;
                return;
            }

            // Try to connect to Redis (works with both local and hosted Redis)
            this.client = Redis.createClient({
                url: redisUrl,
                retry_strategy: (options) => {
                    if (options.error && options.error.code === 'ECONNREFUSED') {
                        logger.warn('Redis connection refused, using fallback cache');
                        return undefined; // Don't retry
                    }
                    if (options.times_connected > 3) {
                        logger.warn('Redis connection failed after 3 attempts, using fallback cache');
                        return undefined;
                    }
                    return Math.min(options.attempt * 100, 3000);
                }
            });

            this.client.on('error', (err) => {
                logger.warn(`Redis error: ${err.message} - using fallback cache`);
                this.isConnected = false;
            });

            this.client.on('connect', () => {
                logger.info('✅ Redis connected for AI caching');
                this.isConnected = true;
            });

            await this.client.connect();
            
        } catch (error) {
            logger.warn(`Redis initialization failed: ${error.message} - using fallback cache`);
            this.isConnected = false;
        }
    }

    /**
     * Generate cache key from question and context type
     */
    generateCacheKey(question, contextType = 'general', userId = null) {
        // Normalize question for better cache hits
        const normalized = question.toLowerCase()
            .replace(/[^\w\s]/g, '') // Remove punctuation
            .replace(/\s+/g, ' ')    // Normalize spaces
            .trim();
        
        // Create hash of normalized question + context type
        const hash = crypto.createHash('md5')
            .update(normalized + contextType)
            .digest('hex');
        
        return `ai_cache:${contextType}:${hash}`;
    }

    /**
     * Get cached response
     */
    async get(cacheKey) {
        try {
            if (this.isConnected && this.client) {
                const cached = await this.client.get(cacheKey);
                if (cached) {
                    logger.info(`🎯 AI cache hit: ${cacheKey}`);
                    return JSON.parse(cached);
                }
            } else {
                // Use fallback cache
                const cached = this.fallbackCache.get(cacheKey);
                if (cached && cached.expires > Date.now()) {
                    logger.info(`🎯 AI fallback cache hit: ${cacheKey}`);
                    return cached.data;
                } else if (cached) {
                    this.fallbackCache.delete(cacheKey);
                }
            }
            
            logger.debug(`❌ AI cache miss: ${cacheKey}`);
            return null;

        } catch (error) {
            logger.error(`AI cache get error: ${error.message}`);
            return null;
        }
    }

    /**
     * Set cached response
     */
    async set(cacheKey, response, ttl = this.cacheTTL.general) {
        try {
            const cacheData = {
                response: response,
                timestamp: Date.now(),
                ttl: ttl
            };

            if (this.isConnected && this.client) {
                await this.client.setEx(cacheKey, ttl, JSON.stringify(cacheData));
                logger.debug(`💾 AI response cached in Redis: ${cacheKey} (TTL: ${ttl}s)`);
            } else {
                // Use fallback cache with size limit
                if (this.fallbackCache.size >= this.maxFallbackSize) {
                    // Remove oldest entry
                    const firstKey = this.fallbackCache.keys().next().value;
                    this.fallbackCache.delete(firstKey);
                }
                
                this.fallbackCache.set(cacheKey, {
                    data: cacheData,
                    expires: Date.now() + (ttl * 1000)
                });
                logger.debug(`💾 AI response cached in fallback: ${cacheKey} (TTL: ${ttl}s)`);
            }

        } catch (error) {
            logger.error(`AI cache set error: ${error.message}`);
        }
    }

    /**
     * Determine appropriate cache TTL based on question type
     */
    determineCacheTTL(question, contextType, isJoke = false) {
        if (isJoke) return this.cacheTTL.jokes;
        
        const lowerQuestion = question.toLowerCase();
        
        // Very short TTL for balance/session checks (dynamic data)
        if (lowerQuestion.includes('balance') || lowerQuestion.includes('session')) {
            return this.cacheTTL.balance;
        }
        
        // Medium TTL for help content
        if (lowerQuestion.includes('help') || lowerQuestion.includes('how to')) {
            return this.cacheTTL.help;
        }
        
        // Short TTL for admin content  
        if (contextType === 'admin') {
            return this.cacheTTL.admin;
        }
        
        // Default TTL for general questions
        return this.cacheTTL.general;
    }

    /**
     * Smart cache check - returns cached response if appropriate
     */
    async getCachedResponse(question, contextType = 'general', userId = null, isJoke = false) {
        // Don't cache personal/user-specific questions
        const personalKeywords = ['my balance', 'my session', '@', 'user id:', userId];
        const hasPersonalContext = personalKeywords.some(keyword => 
            keyword && question.toLowerCase().includes(keyword.toString().toLowerCase())
        );
        
        if (hasPersonalContext && !isJoke) {
            logger.debug('Skipping cache for personal question');
            return null;
        }
        
        const cacheKey = this.generateCacheKey(question, contextType, userId);
        return await this.get(cacheKey);
    }

    /**
     * Cache AI response intelligently
     */
    async cacheResponse(question, response, contextType = 'general', userId = null, isJoke = false) {
        // Don't cache personal/user-specific responses
        const personalKeywords = ['my balance', 'my session', '@', 'user id:', userId];
        const hasPersonalContext = personalKeywords.some(keyword => 
            keyword && question.toLowerCase().includes(keyword.toString().toLowerCase())
        );
        
        if (hasPersonalContext && !isJoke) {
            logger.debug('Skipping cache for personal response');
            return;
        }
        
        const cacheKey = this.generateCacheKey(question, contextType, userId);
        const ttl = this.determineCacheTTL(question, contextType, isJoke);
        
        await this.set(cacheKey, response, ttl);
    }

    /**
     * Clear cache by pattern
     */
    async clearCache(pattern = '*') {
        try {
            if (this.isConnected && this.client) {
                const keys = await this.client.keys(`ai_cache:${pattern}`);
                if (keys.length > 0) {
                    await this.client.del(keys);
                    logger.info(`🧹 Cleared ${keys.length} AI cache entries`);
                }
            } else {
                // Clear fallback cache
                for (const key of this.fallbackCache.keys()) {
                    if (key.includes(pattern) || pattern === '*') {
                        this.fallbackCache.delete(key);
                    }
                }
                logger.info('🧹 Cleared fallback AI cache');
            }
        } catch (error) {
            logger.error(`AI cache clear error: ${error.message}`);
        }
    }

    /**
     * Get cache statistics
     */
    async getStats() {
        try {
            let stats = {
                connected: this.isConnected,
                fallbackCacheSize: this.fallbackCache.size,
                redisKeys: 0,
                totalMemoryUsage: 0
            };

            if (this.isConnected && this.client) {
                const keys = await this.client.keys('ai_cache:*');
                stats.redisKeys = keys.length;
                
                // Get memory usage if available
                try {
                    const info = await this.client.info('memory');
                    const memoryMatch = info.match(/used_memory:(\d+)/);
                    if (memoryMatch) {
                        stats.totalMemoryUsage = parseInt(memoryMatch[1]);
                    }
                } catch (memError) {
                    // Memory info not available
                }
            }

            return stats;
        } catch (error) {
            logger.error(`AI cache stats error: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * Cleanup expired fallback cache entries
     */
    cleanupFallbackCache() {
        const now = Date.now();
        for (const [key, value] of this.fallbackCache.entries()) {
            if (value.expires <= now) {
                this.fallbackCache.delete(key);
            }
        }
    }

    /**
     * Disconnect Redis
     */
    async disconnect() {
        try {
            if (this.client && this.isConnected) {
                await this.client.quit();
                logger.info('Redis AI cache disconnected');
            }
        } catch (error) {
            logger.error(`Redis disconnect error: ${error.message}`);
        }
    }
}

// Export singleton instance
module.exports = new AICacheManager();