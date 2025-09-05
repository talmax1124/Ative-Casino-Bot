/**
 * Off Economy Badge Utility
 * Provides functions to check and display Off Economy status in games
 */

const dbManager = require('./database');
const logger = require('./logger');

class OffEconomyBadge {
    /**
     * Check if a user is off economy
     */
    static async isOffEconomy(userId) {
        try {
            return await dbManager.databaseAdapter.isOffEconomy(userId);
        } catch (error) {
            logger.error(`Error checking off economy status: ${error.message}`);
            return false;
        }
    }

    /**
     * Get the badge text for a user
     */
    static async getBadgeText(userId, position = 'top') {
        try {
            const isOffEco = await this.isOffEconomy(userId);
            if (!isOffEco) return '';

            switch (position) {
                case 'top':
                    return '🔴 **OFF ECO**';
                case 'inline':
                    return '🔴 OFF ECO';
                case 'compact':
                    return '🔴';
                case 'text':
                    return 'OFF ECO';
                default:
                    return '🔴 **OFF ECO**';
            }
        } catch (error) {
            logger.error(`Error getting badge text: ${error.message}`);
            return '';
        }
    }

    /**
     * Get badge for embed field
     */
    static async getEmbedBadge(userId) {
        try {
            const isOffEco = await this.isOffEconomy(userId);
            return isOffEco ? {
                name: '🔴 Off Economy Player',
                value: 'This player competes in Off Economy leaderboards',
                inline: true
            } : null;
        } catch (error) {
            logger.error(`Error getting embed badge: ${error.message}`);
            return null;
        }
    }

    /**
     * Get user display name with badge
     */
    static async getUserDisplayWithBadge(user, compact = false) {
        try {
            const isOffEco = await this.isOffEconomy(user.id);
            const displayName = user.displayName || user.username;
            
            if (!isOffEco) return displayName;
            
            if (compact) {
                return `${displayName} 🔴`;
            } else {
                return `${displayName} 🔴 **OFF ECO**`;
            }
        } catch (error) {
            logger.error(`Error getting user display with badge: ${error.message}`);
            return user.displayName || user.username;
        }
    }

    /**
     * Format game result text with badge
     */
    static async formatGameResultWithBadge(userId, username, resultText) {
        try {
            const badge = await this.getBadgeText(userId, 'inline');
            if (!badge) return resultText;

            // Add badge to the beginning of the result text
            return `${badge}\n${resultText}`;
        } catch (error) {
            logger.error(`Error formatting game result with badge: ${error.message}`);
            return resultText;
        }
    }

    /**
     * Get multiple users' off economy status at once (for performance)
     */
    static async getMultipleUsersStatus(userIds) {
        try {
            const statuses = new Map();
            
            // Get all statuses in one query
            const results = await dbManager.databaseAdapter.executeQuery(`
                SELECT user_id, off_economy 
                FROM user_balances 
                WHERE user_id IN (${userIds.map(() => '?').join(',')})
            `, userIds);

            // Map results
            for (const result of results) {
                statuses.set(result.user_id, Boolean(result.off_economy));
            }

            // Set false for any users not found
            for (const userId of userIds) {
                if (!statuses.has(userId)) {
                    statuses.set(userId, false);
                }
            }

            return statuses;
        } catch (error) {
            logger.error(`Error getting multiple users off economy status: ${error.message}`);
            // Return all false on error
            const statuses = new Map();
            for (const userId of userIds) {
                statuses.set(userId, false);
            }
            return statuses;
        }
    }

    /**
     * Create badge for game panel header
     */
    static async getGamePanelBadge(userId) {
        try {
            const isOffEco = await this.isOffEconomy(userId);
            if (!isOffEco) return '';

            return `\n\n🔴 **THIS PLAYER IS OFF ECO** 🔴`;
        } catch (error) {
            logger.error(`Error getting game panel badge: ${error.message}`);
            return '';
        }
    }
}

module.exports = OffEconomyBadge;