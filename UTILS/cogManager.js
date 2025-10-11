/**
 * Cog Management System for ATIVE Casino Bot
 * Handles enabling/disabling commands and organizing them by categories
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const dbManager = require('./database');

// Authorized users who can manage cogs
const AUTHORIZED_COG_MANAGERS = ['466050111680544798', '1326438668591829068', '1399233099224846460'];

class CogManager {
    constructor() {
        this.cogCategories = {
            'games': {
                name: 'Games',
                description: 'Casino games and gambling commands',
                commands: ['blackjack', 'slots', 'roulette', 'crash', 'plinko', 'mines', 'keno', 'ceelo', 'bingo', 'lottery', 'multi-slots', 'russianroulette', 'scratch']
            },
            'economy': {
                name: 'Economy',
                description: 'Money management and economy commands',
                commands: ['balance', 'deposit', 'withdraw', 'sendmoney', 'buymoney', 'shop', 'rewards']
            },
            'earn': {
                name: 'Earning Commands',
                description: 'Commands to earn money and experience',
                commands: ['work', 'crime', 'beg', 'dailytask', 'weekly', 'monthly', 'earnmoney', 'fishing', 'treasurevault']
            },
            'social': {
                name: 'Social & Fun',
                description: 'Social interaction and fun commands',
                commands: ['marriage', 'profile', 'leaderboard', 'rob', 'robstats', 'polls', 'duck', 'rps']
            },
            'admin': {
                name: 'Administration',
                description: 'Server administration and management commands',
                commands: ['admin', 'setup', 'backup', 'vote', 'release']
            },
            'utility': {
                name: 'Utility',
                description: 'General utility and information commands',
                commands: ['help', 'stats', 'userhistory', 'cooldown', 'sessionstatus', 'stopmysession', 'stopgame']
            },
            'games-advanced': {
                name: 'Advanced Games',
                description: 'Complex multiplayer and strategic games',
                commands: ['uno', 'battleship', 'texasholdem', 'dominoes', 'yahtzee', 'chess', 'wordchain', 'heist-game']
            },
            'betting': {
                name: 'Sports Betting',
                description: 'Sports betting and prediction commands',
                commands: ['sportbet']
            }
        };

        this.disabledCogs = new Set();
        this.disabledCommands = new Set();
        this.initialized = false;
    }

    async initialize() {
        try {
            await this.loadDisabledCogs();
            await this.loadDisabledCommands();
            this.initialized = true;
            logger.info('CogManager initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize CogManager:', error);
            throw error;
        }
    }

    async loadDisabledCogs() {
        try {
            // Initialize database if needed
            if (!dbManager.initialized) {
                await dbManager.initialize();
            }
            
            const result = await dbManager.databaseAdapter.executeQuery(
                'SELECT category_name FROM disabled_cogs WHERE guild_id = ?',
                [process.env.GUILD_ID || 'global']
            );
            
            this.disabledCogs.clear();
            result.forEach(row => this.disabledCogs.add(row.category_name));
            
            logger.debug(`Loaded ${this.disabledCogs.size} disabled cogs`);
        } catch (error) {
            logger.error('Error loading disabled cogs:', error);
            // Continue with empty set if table doesn't exist
        }
    }

    async loadDisabledCommands() {
        try {
            // Initialize database if needed
            if (!dbManager.initialized) {
                await dbManager.initialize();
            }
            
            const result = await dbManager.databaseAdapter.executeQuery(
                'SELECT command_name FROM disabled_commands WHERE guild_id = ?',
                [process.env.GUILD_ID || 'global']
            );
            
            this.disabledCommands.clear();
            result.forEach(row => this.disabledCommands.add(row.command_name));
            
            logger.debug(`Loaded ${this.disabledCommands.size} disabled commands`);
        } catch (error) {
            logger.error('Error loading disabled commands:', error);
            // Continue with empty set if table doesn't exist
        }
    }

    async enableCog(categoryName) {
        if (!this.cogCategories[categoryName]) {
            throw new Error(`Cog category '${categoryName}' does not exist`);
        }

        try {
            // Initialize database if needed
            if (!dbManager.initialized) {
                await dbManager.initialize();
            }
            
            await dbManager.databaseAdapter.executeQuery(
                'DELETE FROM disabled_cogs WHERE guild_id = ? AND category_name = ?',
                [process.env.GUILD_ID || 'global', categoryName]
            );
            
            this.disabledCogs.delete(categoryName);
            
            // Also enable all commands in this category
            const category = this.cogCategories[categoryName];
            for (const commandName of category.commands) {
                await this.enableCommand(commandName);
            }
            
            logger.info(`Enabled cog category: ${categoryName}`);
            return true;
        } catch (error) {
            logger.error(`Error enabling cog ${categoryName}:`, error);
            throw error;
        }
    }

    async disableCog(categoryName) {
        if (!this.cogCategories[categoryName]) {
            throw new Error(`Cog category '${categoryName}' does not exist`);
        }

        try {
            // Initialize database if needed
            if (!dbManager.initialized) {
                await dbManager.initialize();
            }
            
            await dbManager.databaseAdapter.executeQuery(
                'INSERT IGNORE INTO disabled_cogs (guild_id, category_name, disabled_at) VALUES (?, ?, NOW())',
                [process.env.GUILD_ID || 'global', categoryName]
            );
            
            this.disabledCogs.add(categoryName);
            
            // Also disable all commands in this category
            const category = this.cogCategories[categoryName];
            for (const commandName of category.commands) {
                await this.disableCommand(commandName);
            }
            
            logger.info(`Disabled cog category: ${categoryName}`);
            return true;
        } catch (error) {
            logger.error(`Error disabling cog ${categoryName}:`, error);
            throw error;
        }
    }

    async enableCommand(commandName) {
        try {
            // Initialize database if needed
            if (!dbManager.initialized) {
                await dbManager.initialize();
            }
            
            await dbManager.databaseAdapter.executeQuery(
                'DELETE FROM disabled_commands WHERE guild_id = ? AND command_name = ?',
                [process.env.GUILD_ID || 'global', commandName]
            );
            
            this.disabledCommands.delete(commandName);
            logger.debug(`Enabled command: ${commandName}`);
            return true;
        } catch (error) {
            logger.error(`Error enabling command ${commandName}:`, error);
            throw error;
        }
    }

    async disableCommand(commandName) {
        try {
            // Initialize database if needed
            if (!dbManager.initialized) {
                await dbManager.initialize();
            }
            
            await dbManager.databaseAdapter.executeQuery(
                'INSERT IGNORE INTO disabled_commands (guild_id, command_name, disabled_at) VALUES (?, ?, NOW())',
                [process.env.GUILD_ID || 'global', commandName]
            );
            
            this.disabledCommands.add(commandName);
            logger.debug(`Disabled command: ${commandName}`);
            return true;
        } catch (error) {
            logger.error(`Error disabling command ${commandName}:`, error);
            throw error;
        }
    }

    isCommandEnabled(commandName) {
        // Check if command is directly disabled
        if (this.disabledCommands.has(commandName)) {
            return false;
        }

        // Check if command's category is disabled
        for (const [categoryName, category] of Object.entries(this.cogCategories)) {
            if (category.commands.includes(commandName) && this.disabledCogs.has(categoryName)) {
                return false;
            }
        }

        return true;
    }

    isCogEnabled(categoryName) {
        return !this.disabledCogs.has(categoryName);
    }

    getCommandCategory(commandName) {
        for (const [categoryName, category] of Object.entries(this.cogCategories)) {
            if (category.commands.includes(commandName)) {
                return categoryName;
            }
        }
        return 'uncategorized';
    }

    getCogStatus() {
        const status = {};
        
        for (const [categoryName, category] of Object.entries(this.cogCategories)) {
            const enabledCommands = category.commands.filter(cmd => this.isCommandEnabled(cmd));
            const disabledCommands = category.commands.filter(cmd => !this.isCommandEnabled(cmd));
            
            status[categoryName] = {
                name: category.name,
                description: category.description,
                enabled: this.isCogEnabled(categoryName),
                totalCommands: category.commands.length,
                enabledCommands: enabledCommands.length,
                disabledCommands: disabledCommands.length,
                commands: {
                    enabled: enabledCommands,
                    disabled: disabledCommands
                }
            };
        }
        
        return status;
    }

    async createTables() {
        try {
            // Initialize database if needed
            if (!dbManager.initialized) {
                await dbManager.initialize();
            }
            
            await dbManager.databaseAdapter.executeQuery(`
                CREATE TABLE IF NOT EXISTS disabled_cogs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    guild_id VARCHAR(20) NOT NULL,
                    category_name VARCHAR(50) NOT NULL,
                    disabled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_guild_category (guild_id, category_name)
                )
            `);

            await dbManager.databaseAdapter.executeQuery(`
                CREATE TABLE IF NOT EXISTS disabled_commands (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    guild_id VARCHAR(20) NOT NULL,
                    command_name VARCHAR(50) NOT NULL,
                    disabled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_guild_command (guild_id, command_name)
                )
            `);

            logger.info('Cog management tables created successfully');
        } catch (error) {
            logger.error('Error creating cog management tables:', error);
            throw error;
        }
    }

    // Middleware function to check if command is enabled before execution
    checkCommandEnabled(commandName) {
        return (interaction, next) => {
            if (!this.isCommandEnabled(commandName)) {
                return interaction.reply({
                    content: `❌ The command \`${commandName}\` is currently disabled.`,
                    ephemeral: true
                });
            }
            return next();
        };
    }

    // Get all available categories
    getCategories() {
        return Object.keys(this.cogCategories);
    }

    // Get category info
    getCategoryInfo(categoryName) {
        return this.cogCategories[categoryName] || null;
    }

    // Check if user is authorized to manage cogs
    isUserAuthorized(userId) {
        return AUTHORIZED_COG_MANAGERS.includes(userId);
    }

    // Bulk operations
    async enableAllCogs() {
        const results = [];
        for (const categoryName of Object.keys(this.cogCategories)) {
            try {
                await this.enableCog(categoryName);
                results.push({ category: categoryName, success: true });
            } catch (error) {
                results.push({ category: categoryName, success: false, error: error.message });
            }
        }
        return results;
    }

    async disableAllCogs() {
        const results = [];
        for (const categoryName of Object.keys(this.cogCategories)) {
            try {
                await this.disableCog(categoryName);
                results.push({ category: categoryName, success: true });
            } catch (error) {
                results.push({ category: categoryName, success: false, error: error.message });
            }
        }
        return results;
    }
}

// Export singleton instance
const cogManager = new CogManager();
module.exports = cogManager;
module.exports.AUTHORIZED_COG_MANAGERS = AUTHORIZED_COG_MANAGERS;