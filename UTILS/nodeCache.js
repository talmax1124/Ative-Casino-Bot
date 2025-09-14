/**
 * COMPREHENSIVE NODE CACHE MANAGER
 * High-performance in-memory caching system for casino operations
 * Improves database performance and provides fast data access
 */

const NodeCache = require('node-cache');
const logger = require('./logger');
const { EventEmitter } = require('events');

// Cache TTL configurations (in seconds)
const CACHE_TTL = {
    USER_BALANCE: 300,        // 5 minutes - frequently updated
    USER_PROFILE: 1800,       // 30 minutes - relatively static
    GAME_SESSION: 900,        // 15 minutes - active sessions
    LEADERBOARDS: 600,        // 10 minutes - competitive data
    GAME_STATS: 3600,         // 1 hour - statistical data
    TUNING_CONFIG: 1200,      // 20 minutes - AI tuning settings
    SECURITY_DATA: 60,        // 1 minute - security checks
    GUILD_SETTINGS: 7200,     // 2 hours - guild configurations
    ECONOMY_DATA: 1800,       // 30 minutes - economic metrics
    AI_RESPONSES: 3600        // 1 hour - AI generated content
};

// Cache key prefixes for organization
const CACHE_KEYS = {
    USER_BALANCE: 'balance',
    USER_PROFILE: 'profile', 
    USER_SESSION: 'session',
    GAME_STATE: 'game',
    LEADERBOARD: 'lb',
    GUILD_CONFIG: 'guild',
    SECURITY: 'sec',
    TUNING: 'tune',
    ECONOMY: 'econ',
    AI_CACHE: 'ai',
    RATE_LIMIT: 'rate'
};

class NodeCacheManager extends EventEmitter {
    constructor() {
        super();
        
        this.client = new NodeCache({
            stdTTL: 3600, // Default 1 hour TTL
            checkperiod: 120, // Check for expired keys every 2 minutes
            useClones: false, // Better performance
            maxKeys: 10000, // Prevent memory issues
            deleteOnExpire: true
        });
        this.isConnected = true; // Always connected for in-memory cache
        
        // Performance metrics
        this.metrics = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            errors: 0
        };
        
        // Initialize
        this.initialize();
    }

    /**
     * Initialize NodeCache with event handlers
     */
    async initialize() {
        try {
            logger.info(`🔄 Initializing NodeCache in-memory cache...`);
            
            // Set up event handlers for NodeCache
            this.client.on('set', (key, value) => {
                this.metrics.sets++;
            });

            this.client.on('del', (key, value) => {
                this.metrics.deletes++;
            });

            this.client.on('expired', (key, value) => {
                // Auto-cleanup handled by NodeCache
            });

            logger.info('✅ NodeCache initialized and ready');
            this.emit('connected');
            
        } catch (error) {
            logger.error(`❌ NodeCache initialization failed: ${error.message}`);
            this.metrics.errors++;
        }
    }

    /**
     * Get cache statistics (NodeCache is always healthy)
     */
    getHealth() {
        return {
            isConnected: this.isConnected,
            cacheSize: this.client.keys().length,
            metrics: this.metrics
        };
    }

    /**
     * Generate cache key with prefix
     */
    generateKey(prefix, identifier) {
        return `casino:${prefix}:${identifier}`;
    }

    /**
     * SET - Cache data with TTL
     */
    async set(key, value, ttl = 3600) {
        try {
            const success = this.client.set(key, value, ttl);
            if (success) {
                this.metrics.sets++;
                return true;
            }
            return false;
        } catch (error) {
            logger.error(`💥 NodeCache SET error for key ${key}: ${error.message}`);
            this.metrics.errors++;
            return false;
        }
    }

    /**
     * GET - Retrieve cached data
     */
    async get(key) {
        try {
            const result = this.client.get(key);
            if (result !== undefined) {
                this.metrics.hits++;
                return result;
            }
            this.metrics.misses++;
            return null;
        } catch (error) {
            logger.error(`💥 NodeCache GET error for key ${key}: ${error.message}`);
            this.metrics.errors++;
            return null;
        }
    }

    /**
     * DELETE - Remove cached data
     */
    async del(key) {
        try {
            const deleted = this.client.del(key);
            if (deleted > 0) {
                this.metrics.deletes++;
                return true;
            }
            return false;
        } catch (error) {
            logger.error(`💥 NodeCache DELETE error for key ${key}: ${error.message}`);
            this.metrics.errors++;
            return false;
        }
    }

    /**
     * EXISTS - Check if key exists
     */
    async exists(key) {
        try {
            return this.client.has(key);
        } catch (error) {
            logger.error(`💥 NodeCache EXISTS error for key ${key}: ${error.message}`);
            return false;
        }
    }

    /**
     * TTL - Get time to live for key
     */
    async ttl(key) {
        try {
            return this.client.getTtl(key);
        } catch (error) {
            logger.error(`💥 NodeCache TTL error for key ${key}: ${error.message}`);
            return -1;
        }
    }

    /**
     * CACHE USER BALANCE - High frequency data
     */
    async cacheUserBalance(userId, guildId, balanceData) {
        const key = this.generateKey(CACHE_KEYS.USER_BALANCE, `${userId}:${guildId}`);
        return await this.set(key, balanceData, CACHE_TTL.USER_BALANCE);
    }

    /**
     * GET USER BALANCE - High frequency data
     */
    async getUserBalance(userId, guildId) {
        const key = this.generateKey(CACHE_KEYS.USER_BALANCE, `${userId}:${guildId}`);
        return await this.get(key);
    }

    /**
     * CACHE GAME SESSION
     */
    async cacheGameSession(sessionId, sessionData) {
        const key = this.generateKey(CACHE_KEYS.GAME_STATE, sessionId);
        return await this.set(key, sessionData, CACHE_TTL.GAME_SESSION);
    }

    /**
     * GET GAME SESSION
     */
    async getGameSession(sessionId) {
        const key = this.generateKey(CACHE_KEYS.GAME_STATE, sessionId);
        return await this.get(key);
    }

    /**
     * RATE LIMITING - Check rate limit
     */
    async checkRateLimit(identifier, limit, windowSeconds) {
        const key = this.generateKey(CACHE_KEYS.RATE_LIMIT, identifier);
        
        try {
            const current = this.client.get(key) || 0;
            
            if (current >= limit) {
                const ttl = this.client.getTtl(key);
                return { allowed: false, current, limit, reset: ttl > 0 ? ttl : windowSeconds };
            }
            
            // Increment counter
            const newCount = current + 1;
            this.client.set(key, newCount, windowSeconds);
            
            return { allowed: true, current: newCount, limit, reset: windowSeconds };
        } catch (error) {
            logger.error(`💥 Rate limit check error: ${error.message}`);
            return { allowed: true, current: 0, limit, reset: windowSeconds }; // Fail open
        }
    }

    /**
     * Get all keys in cache
     */
    async getKeys() {
        try {
            return this.client.keys();
        } catch (error) {
            logger.error(`💥 NodeCache KEYS error: ${error.message}`);
            return [];
        }
    }

    /**
     * Get comprehensive cache statistics
     */
    getStats() {
        const hitRate = this.metrics.hits + this.metrics.misses > 0 
            ? ((this.metrics.hits / (this.metrics.hits + this.metrics.misses)) * 100).toFixed(2)
            : 0;
            
        return {
            connected: this.isConnected,
            cacheSize: this.client.keys().length,
            metrics: {
                ...this.metrics,
                hitRate: `${hitRate}%`
            },
            cacheInfo: {
                maxKeys: this.client.options.maxKeys || 'unlimited',
                stdTTL: this.client.options.stdTTL || 3600,
                checkPeriod: this.client.options.checkperiod || 120
            }
        };
    }

    /**
     * Clear all cache data (use with caution)
     */
    async flushAll() {
        try {
            this.client.flushAll();
            logger.warn('🧹 NodeCache cleared');
            
            // Reset metrics
            this.metrics = {
                hits: 0,
                misses: 0,
                sets: 0,
                deletes: 0,
                errors: 0
            };
            
            return true;
        } catch (error) {
            logger.error(`💥 Cache flush error: ${error.message}`);
            return false;
        }
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        logger.info('🔄 Shutting down NodeCache manager...');
        
        try {
            this.client.flushAll();
            this.client.close();
            logger.info('✅ NodeCache cleared and closed gracefully');
        } catch (error) {
            logger.error(`NodeCache shutdown error: ${error.message}`);
        }
        
        logger.info('✅ NodeCache manager shutdown complete');
    }
}

// Create singleton instance
const nodeCache = new NodeCacheManager();

// Graceful shutdown
process.on('SIGINT', async () => {
    await nodeCache.shutdown();
});

process.on('SIGTERM', async () => {
    await nodeCache.shutdown();
});

module.exports = nodeCache;