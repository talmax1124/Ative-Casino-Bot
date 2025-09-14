/**
 * AI Cache Manager with NodeCache
 * Reduces token usage by caching AI responses intelligently
 */

const NodeCache = require('node-cache');
const crypto = require('crypto');
const logger = require('./logger');

class AICacheManager {
    constructor() {
        this.client = new NodeCache({
            stdTTL: 3600, // Default 1 hour TTL
            checkperiod: 120, // Check for expired keys every 2 minutes
            useClones: false, // Better performance
            maxKeys: 5000, // Prevent memory issues
            deleteOnExpire: true
        });
        this.isConnected = true; // Always connected for in-memory cache
        this.fallbackCache = new Map(); // Backup fallback (though not really needed with NodeCache)
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

        // Initialize immediately since NodeCache is in-memory
        this.initialize();
    }

    /**
     * Initialize NodeCache (always succeeds)
     */
    async initialize() {
        try {
            logger.info('✅ NodeCache connected for AI caching');
            this.isConnected = true;
        } catch (error) {
            logger.warn(`NodeCache initialization failed: ${error.message} - using fallback cache`);
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
                const cached = this.client.get(cacheKey);
                if (cached) {
                    logger.info(`🎯 AI cache hit: ${cacheKey}`);
                    return cached;
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
                this.client.set(cacheKey, cacheData, ttl);
                logger.debug(`💾 AI response cached in NodeCache: ${cacheKey} (TTL: ${ttl}s)`);
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
                const keys = this.client.keys();
                const matchingKeys = keys.filter(key => key.startsWith('ai_cache:') && 
                    (pattern === '*' || key.includes(pattern)));
                
                if (matchingKeys.length > 0) {
                    matchingKeys.forEach(key => this.client.del(key));
                    logger.info(`🧹 Cleared ${matchingKeys.length} AI cache entries`);
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
                nodeCacheKeys: 0,
                totalMemoryUsage: 'N/A (in-memory)'
            };

            if (this.isConnected && this.client) {
                const keys = this.client.keys();
                const aiCacheKeys = keys.filter(key => key.startsWith('ai_cache:'));
                stats.nodeCacheKeys = aiCacheKeys.length;
                stats.totalKeys = keys.length;
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
     * Disconnect NodeCache (graceful shutdown)
     */
    async disconnect() {
        try {
            if (this.client && this.isConnected) {
                this.client.flushAll();
                this.client.close();
                logger.info('NodeCache AI cache disconnected');
            }
        } catch (error) {
            logger.error(`NodeCache disconnect error: ${error.message}`);
        }
    }
}

// Export singleton instance
module.exports = new AICacheManager();