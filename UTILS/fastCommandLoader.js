/**
 * 🚀 FAST COMMAND LOADER
 * Non-blocking command loading system
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class FastCommandLoader {
    constructor() {
        this.commands = new Map();
        this.loaded = false;
        this.loading = false;
    }

    /**
     * Start loading commands in background
     */
    async startBackgroundLoading(client) {
        if (this.loading || this.loaded) return;
        this.loading = true;

        // Use setImmediate to defer to next tick
        setImmediate(async () => {
            try {
                await this.loadAllCommands(client);
                this.loaded = true;
                this.loading = false;
                logger.info(`🚀 Fast command loader: ${this.commands.size} commands loaded in background`);
            } catch (error) {
                logger.error('Background command loading failed:', error);
                this.loading = false;
            }
        });
    }

    /**
     * Load commands with parallel processing
     */
    async loadAllCommands(client) {
        const commandsPath = path.join(process.cwd(), 'COMMANDS');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        // Process commands in batches for better performance
        const batchSize = 10;
        const batches = [];
        
        for (let i = 0; i < commandFiles.length; i += batchSize) {
            batches.push(commandFiles.slice(i, i + batchSize));
        }

        // Load batches sequentially to avoid overwhelming the system
        for (const batch of batches) {
            const batchPromises = batch.map(file => this.loadSingleCommand(file, client));
            await Promise.allSettled(batchPromises);
        }
    }

    /**
     * Load a single command file
     */
    async loadSingleCommand(file, client) {
        try {
            const filePath = path.join(process.cwd(), 'COMMANDS', file);
            
            // Clear require cache to allow hot reloading
            delete require.cache[require.resolve(filePath)];
            
            const command = require(filePath);
            
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                this.commands.set(command.data.name, command);
                
                // Handle special multi-command files
                await this.handleSpecialCommands(file, command, client);
                
                return { success: true, file, name: command.data.name };
            } else {
                logger.warn(`Command file ${file} is missing 'data' or 'execute' property`);
                return { success: false, file, error: 'Missing data or execute' };
            }
        } catch (error) {
            logger.error(`Failed to load command ${file}: ${error.message}`);
            return { success: false, file, error: error.message };
        }
    }

    /**
     * Handle special multi-command files (simplified)
     */
    async handleSpecialCommands(file, command, client) {
        const specialFiles = {
            'dev.js': ['reloadCommand', 'logsCommand', 'stopCrashCommand', 'cogCommand'],
            'general.js': ['profileCommand', 'leaderboardCommand', 'testXpCommand', 'setXpCommand', 'debugXpCommand', 'fixXpCommand'],
            'admin.js': ['drawLotteryCommand', 'portalAnnouncementCommand', 'portalCommand']
        };

        const commandNames = specialFiles[file];
        if (!commandNames) return;

        for (const cmdName of commandNames) {
            if (command[cmdName] && command[cmdName].data) {
                // Skip duplicates
                if (cmdName === 'stopCrashCommand' && command[cmdName].data.name === 'stopcrash') continue;
                
                client.commands.set(command[cmdName].data.name, command[cmdName]);
                this.commands.set(command[cmdName].data.name, command[cmdName]);
            }
        }
    }

    /**
     * Get command data for registration (only when needed)
     */
    getCommandData() {
        const commands = [];
        for (const command of this.commands.values()) {
            if (command.data && command.data.toJSON) {
                commands.push(command.data.toJSON());
            }
        }
        return commands;
    }

    /**
     * Wait for commands to be loaded (with timeout)
     */
    async waitForLoaded(timeout = 10000) {
        const start = Date.now();
        while (!this.loaded && (Date.now() - start) < timeout) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return this.loaded;
    }
}

module.exports = new FastCommandLoader();