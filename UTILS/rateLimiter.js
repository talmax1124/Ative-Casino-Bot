/**
 * Rate Limiter Utility - Prevents abuse of AI and resource-intensive commands
 * Supports role-based exemptions (system, admin, developer)
 */

const logger = require('./logger');

class RateLimiter {
    constructor() {
        this.userRequestCounts = new Map(); // userId -> { count, resetTime, lastReset }
        this.cleanupInterval = null;
        this.startCleanup();
    }

    /**
     * Start automatic cleanup of expired entries
     */
    startCleanup() {
        // Clean up expired entries every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredEntries();
        }, 5 * 60 * 1000);
    }

    /**
     * Stop automatic cleanup
     */
    stopCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Clean up expired rate limit entries
     */
    cleanupExpiredEntries() {
        const now = Date.now();
        let cleaned = 0;

        for (const [userId, data] of this.userRequestCounts.entries()) {
            if (now >= data.resetTime) {
                this.userRequestCounts.delete(userId);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.debug(`Rate limiter cleanup: removed ${cleaned} expired entries`);
        }
    }

    /**
     * Check if user has admin permissions
     */
    async hasAdminPermissions(interaction) {
        const userId = interaction.user.id;
        const DEVELOPER_ID = '466050111680544798';
        
        // Developer always has admin permissions
        if (userId === DEVELOPER_ID) {
            return true;
        }
        
        try {
            // Check if user has Administrator permission or specific roles
            const member = await interaction.guild.members.fetch(userId);
            
            // Check for Administrator permission
            if (member.permissions.has('Administrator')) {
                return true;
            }
            
            // Check for specific admin roles
            const adminRoles = ['Admin', 'Administrator', 'Owner', 'Staff'];
            const hasAdminRole = member.roles.cache.some(role => 
                adminRoles.some(adminRole => 
                    role.name.toLowerCase().includes(adminRole.toLowerCase())
                )
            );
            
            return hasAdminRole;
            
        } catch (error) {
            logger.error(`Error checking admin permissions for rate limiting: ${error.message}`);
            return false;
        }
    }

    /**
     * Check if user is exempt from rate limiting
     * @param {string} userId - User ID to check
     * @param {object} interaction - Discord interaction object
     * @returns {Promise<{exempt: boolean, reason: string}>}
     */
    async isExempt(userId, interaction) {
        const DEVELOPER_ID = '466050111680544798';
        
        // Developer is always exempt
        if (userId === DEVELOPER_ID) {
            return { exempt: true, reason: 'Developer' };
        }

        // Check for admin permissions
        const isAdmin = await this.hasAdminPermissions(interaction);
        if (isAdmin) {
            return { exempt: true, reason: 'Administrator' };
        }

        // Check for system/bot accounts (just in case)
        if (interaction.user.bot || interaction.user.system) {
            return { exempt: true, reason: 'System Account' };
        }

        return { exempt: false, reason: 'Regular User' };
    }

    /**
     * Check if user is rate limited
     * @param {string} userId - User ID to check
     * @param {object} interaction - Discord interaction object
     * @param {object} limits - Rate limit configuration
     * @returns {Promise<{allowed: boolean, remaining: number, resetTime: number, exemptReason?: string}>}
     */
    async checkRateLimit(userId, interaction, limits = {}) {
        // Default rate limits
        const defaultLimits = {
            requestsPerHour: 10,        // 10 requests per hour for regular users
            requestsPerDay: 50,         // 50 requests per day for regular users
            windowHours: 1              // 1 hour window
        };

        const config = { ...defaultLimits, ...limits };
        const now = Date.now();
        
        // Check if user is exempt
        const exemptCheck = await this.isExempt(userId, interaction);
        if (exemptCheck.exempt) {
            logger.debug(`Rate limit exempt: ${userId} (${exemptCheck.reason})`);
            return { 
                allowed: true, 
                remaining: Infinity, 
                resetTime: now + (config.windowHours * 60 * 60 * 1000),
                exemptReason: exemptCheck.reason 
            };
        }

        // Get or create user rate limit data
        let userData = this.userRequestCounts.get(userId);
        const windowMs = config.windowHours * 60 * 60 * 1000;

        if (!userData || now >= userData.resetTime) {
            // Create new window or reset expired window
            userData = {
                count: 0,
                resetTime: now + windowMs,
                lastReset: now
            };
            this.userRequestCounts.set(userId, userData);
        }

        // Check if user has exceeded rate limit
        if (userData.count >= config.requestsPerHour) {
            const timeUntilReset = Math.ceil((userData.resetTime - now) / 1000 / 60); // minutes
            
            logger.warn(`Rate limit exceeded: ${userId} (${userData.count}/${config.requestsPerHour} requests, resets in ${timeUntilReset}m)`);
            
            return {
                allowed: false,
                remaining: 0,
                resetTime: userData.resetTime,
                timeUntilReset: timeUntilReset
            };
        }

        // Increment request count
        userData.count++;
        this.userRequestCounts.set(userId, userData);

        const remaining = config.requestsPerHour - userData.count;
        
        logger.debug(`Rate limit check: ${userId} (${userData.count}/${config.requestsPerHour} requests, ${remaining} remaining)`);

        return {
            allowed: true,
            remaining: remaining,
            resetTime: userData.resetTime
        };
    }

    /**
     * Get rate limit status for a user
     * @param {string} userId - User ID to check
     * @returns {object} Current rate limit status
     */
    getRateLimitStatus(userId) {
        const userData = this.userRequestCounts.get(userId);
        const now = Date.now();

        if (!userData || now >= userData.resetTime) {
            return {
                count: 0,
                remaining: 10, // Default limit
                resetTime: null,
                isActive: false
            };
        }

        return {
            count: userData.count,
            remaining: Math.max(0, 10 - userData.count), // Assuming default limit of 10
            resetTime: userData.resetTime,
            isActive: true,
            timeUntilReset: Math.ceil((userData.resetTime - now) / 1000 / 60) // minutes
        };
    }

    /**
     * Reset rate limit for a specific user (admin function)
     * @param {string} userId - User ID to reset
     * @returns {boolean} Success status
     */
    resetUserRateLimit(userId) {
        const deleted = this.userRequestCounts.delete(userId);
        if (deleted) {
            logger.info(`Rate limit reset for user: ${userId}`);
        }
        return deleted;
    }

    /**
     * Get all current rate limit data (admin function)
     * @returns {Array} Array of rate limit data
     */
    getAllRateLimitData() {
        const now = Date.now();
        const data = [];

        for (const [userId, userData] of this.userRequestCounts.entries()) {
            if (now < userData.resetTime) { // Only active rate limits
                data.push({
                    userId,
                    count: userData.count,
                    resetTime: userData.resetTime,
                    timeUntilReset: Math.ceil((userData.resetTime - now) / 1000 / 60)
                });
            }
        }

        return data.sort((a, b) => b.count - a.count); // Sort by usage descending
    }
}

// Create singleton instance
const rateLimiter = new RateLimiter();

// Graceful shutdown
process.on('SIGINT', () => {
    rateLimiter.stopCleanup();
});

process.on('SIGTERM', () => {
    rateLimiter.stopCleanup();
});

module.exports = rateLimiter;