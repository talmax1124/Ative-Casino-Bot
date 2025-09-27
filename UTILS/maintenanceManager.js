/**
 * Maintenance Manager - Controls game availability during updates
 */

const logger = require('./logger');

class MaintenanceManager {
    constructor() {
        this.databaseAdapter = null;
    }

    async initialize() {
        if (!this.databaseAdapter) {
            this.databaseAdapter = require('./databaseAdapter');
        }
    }

    /**
     * Check if maintenance mode is enabled for a guild
     * @param {string} guildId - Guild ID
     * @returns {boolean} True if maintenance mode is active
     */
    async isMaintenanceMode(guildId) {
        try {
            await this.initialize();
            
            // Check if database adapter is properly initialized
            if (!this.databaseAdapter || !this.databaseAdapter.initialized) {
                logger.warn(`Database adapter not initialized when checking maintenance mode for guild ${guildId}`);
                return false; // Default to allowing games if database isn't ready
            }
            
            const config = await this.databaseAdapter.getServerConfig(guildId);
            
            if (!config || !config.settings) {
                return false;
            }

            return config.settings.maintenanceMode || false;
        } catch (error) {
            logger.error(`Error checking maintenance mode: ${error.message}`);
            logger.error(`Error stack: ${error.stack}`);
            logger.error(`Guild ID: ${guildId}`);
            
            // Check for specific database connection issues
            if (error.message.includes('Database not initialized') || 
                error.message.includes('pool is null') ||
                error.message.includes('Connection') ||
                error.message.includes('ECONNREFUSED') ||
                error.message.includes('Received one or more errors')) {
                logger.warn(`Database connection issue when checking maintenance mode - defaulting to allow games`);
            }
            
            return false; // Default to allowing games if there's an error
        }
    }

    /**
     * Enable maintenance mode for a guild
     * @param {string} guildId - Guild ID
     * @param {string} guildName - Guild name
     * @returns {boolean} Success status
     */
    async enableMaintenance(guildId, guildName) {
        try {
            await this.initialize();
            const config = await this.databaseAdapter.getServerConfig(guildId) || {};
            
            // Update settings to enable maintenance mode
            const updatedConfig = {
                ...config,
                settings: {
                    ...(config.settings || {}),
                    maintenanceMode: true,
                    maintenanceEnabledAt: new Date().toISOString()
                }
            };

            const success = await this.databaseAdapter.saveServerConfig(guildId, guildName, updatedConfig);
            
            if (success) {
                logger.info(`Maintenance mode ENABLED for guild ${guildId} (${guildName})`);
            }
            
            return success;
        } catch (error) {
            logger.error(`Error enabling maintenance mode: ${error.message}`);
            return false;
        }
    }

    /**
     * Disable maintenance mode for a guild
     * @param {string} guildId - Guild ID
     * @param {string} guildName - Guild name
     * @returns {boolean} Success status
     */
    async disableMaintenance(guildId, guildName) {
        try {
            await this.initialize();
            const config = await this.databaseAdapter.getServerConfig(guildId) || {};
            
            // Update settings to disable maintenance mode
            const updatedConfig = {
                ...config,
                settings: {
                    ...(config.settings || {}),
                    maintenanceMode: false,
                    maintenanceDisabledAt: new Date().toISOString()
                }
            };

            const success = await this.databaseAdapter.saveServerConfig(guildId, guildName, updatedConfig);
            
            if (success) {
                logger.info(`Maintenance mode DISABLED for guild ${guildId} (${guildName})`);
            }
            
            return success;
        } catch (error) {
            logger.error(`Error disabling maintenance mode: ${error.message}`);
            return false;
        }
    }

    /**
     * Get maintenance status details for a guild
     * @param {string} guildId - Guild ID
     * @returns {Object} Maintenance status details
     */
    async getMaintenanceStatus(guildId) {
        try {
            await this.initialize();
            const config = await this.databaseAdapter.getServerConfig(guildId);
            
            if (!config || !config.settings) {
                return {
                    enabled: false,
                    enabledAt: null,
                    disabledAt: null
                };
            }

            return {
                enabled: config.settings.maintenanceMode || false,
                enabledAt: config.settings.maintenanceEnabledAt || null,
                disabledAt: config.settings.maintenanceDisabledAt || null
            };
        } catch (error) {
            logger.error(`Error getting maintenance status: ${error.message}`);
            return {
                enabled: false,
                enabledAt: null,
                disabledAt: null
            };
        }
    }
}

// Export singleton instance
module.exports = new MaintenanceManager();