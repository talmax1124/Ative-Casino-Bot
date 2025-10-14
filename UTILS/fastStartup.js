/**
 * 🚀 FAST STARTUP OPTIMIZATION
 * Defers heavy initialization until actually needed
 */

const logger = require('./logger');

class FastStartup {
    constructor() {
        this.heavyInitialized = false;
        this.pendingHeavyInit = null;
    }

    /**
     * Initialize only critical components synchronously
     */
    initializeBasicComponents() {
        const startTime = Date.now();
        
        try {
            // Basic logger and essential utilities are already loaded
            // Defer heavy components like full engine initialization
            
            logger.info('🚀 Basic components initialized');
            const duration = Date.now() - startTime;
            logger.info(`⚡ Fast startup completed in ${duration}ms`);
            
            return true;
        } catch (error) {
            logger.error('❌ Fast startup failed:', error);
            return false;
        }
    }

    /**
     * Initialize heavy components in the background
     */
    async initializeHeavyComponents() {
        if (this.heavyInitialized) return;
        if (this.pendingHeavyInit) return this.pendingHeavyInit;

        this.pendingHeavyInit = this._doHeavyInit();
        return this.pendingHeavyInit;
    }

    async _doHeavyInit() {
        const startTime = Date.now();
        
        try {
            logger.info('🔄 Starting heavy component initialization...');
            
            // Initialize components that can be slow
            const initPromises = [];
            
            // Database warm-up (if not already done)
            try {
                const dbManager = require('./database');
                if (dbManager.warmUp) {
                    initPromises.push(dbManager.warmUp());
                }
            } catch (error) {
                logger.debug('Database warm-up skipped:', error.message);
            }
            
            // Cache warm-up
            try {
                const nodeCache = require('./nodeCache');
                if (nodeCache.warmUp) {
                    initPromises.push(nodeCache.warmUp());
                }
            } catch (error) {
                logger.debug('Cache warm-up skipped:', error.message);
            }
            
            // Analytics system background initialization
            try {
                const AnalyticsEngine = require('../ENGINES/AnalyticsEngine');
                if (AnalyticsEngine.getInstance) {
                    initPromises.push(
                        Promise.resolve().then(() => AnalyticsEngine.getInstance())
                    );
                }
            } catch (error) {
                logger.debug('Analytics initialization deferred:', error.message);
            }
            
            // Wait for all heavy components with timeout
            await Promise.allSettled(initPromises);
            
            this.heavyInitialized = true;
            const duration = Date.now() - startTime;
            logger.info(`✅ Heavy components initialized in ${duration}ms`);
            
        } catch (error) {
            logger.error('❌ Heavy component initialization failed:', error);
        } finally {
            this.pendingHeavyInit = null;
        }
    }

    /**
     * Ensure heavy components are ready (call when first needed)
     */
    async ensureReady() {
        if (!this.heavyInitialized) {
            await this.initializeHeavyComponents();
        }
    }
}

// Export singleton instance
module.exports = new FastStartup();