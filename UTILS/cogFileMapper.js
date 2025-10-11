/**
 * Cog File Mapper - Enhanced file discovery and mapping system
 * Maps cog categories and commands to their actual files for updates
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class CogFileMapper {
    constructor() {
        this.fileCache = new Map();
        this.lastScan = null;
        this.scanInterval = 5 * 60 * 1000; // 5 minutes cache
        
        // GitHub repository information
        this.githubRepo = 'talmax1124/Ative-Casino-Bot';
        this.githubBranch = 'main';
        this.githubBaseUrl = `https://raw.githubusercontent.com/${this.githubRepo}/${this.githubBranch}`;
        
        // Core directory structure
        this.directories = {
            commands: 'COMMANDS',
            games: 'GAMES',
            utils: 'UTILS',
            admin: 'COMMANDS/ADMIN'
        };
        
        // Utility file dependencies for different categories
        this.utilityDependencies = {
            'games': [
                'UTILS/gameUtils.js',
                'UTILS/gamePanel.js', 
                'UTILS/gamePanelUtil.js',
                'UTILS/gameSessionKit.js',
                'UTILS/PayoutManager.js',
                'UTILS/sessionManager.js'
            ],
            'economy': [
                'UTILS/database.js',
                'UTILS/PayoutManager.js',
                'UTILS/moneyFormatter.js',
                'UTILS/balanceIntegrityMigration.js'
            ],
            'admin': [
                'UTILS/database.js',
                'UTILS/backupManager.js',
                'UTILS/setupWizard.js'
            ],
            'social': [
                'UTILS/database.js',
                'UTILS/levelingSystem.js'
            ]
        };
    }

    /**
     * Get all files for a specific cog category
     */
    async getCogFiles(categoryName, cogManager) {
        try {
            await this.ensureFileCache();
            
            const categoryInfo = cogManager.getCategoryInfo(categoryName);
            if (!categoryInfo) {
                throw new Error(`Unknown cog category: ${categoryName}`);
            }

            const allFiles = new Set();
            
            // Add command files for each command in the category
            for (const commandName of categoryInfo.commands) {
                const commandFiles = await this.getCommandFiles(commandName);
                commandFiles.forEach(file => allFiles.add(file));
            }
            
            // Add utility dependencies for this category
            if (this.utilityDependencies[categoryName]) {
                for (const utilFile of this.utilityDependencies[categoryName]) {
                    if (await this.fileExists(utilFile)) {
                        allFiles.add(utilFile);
                    }
                }
            }
            
            return Array.from(allFiles);
        } catch (error) {
            logger.error(`Error getting files for cog ${categoryName}:`, error);
            throw error;
        }
    }

    /**
     * Get all files for a specific command
     */
    async getCommandFiles(commandName) {
        try {
            await this.ensureFileCache();
            
            const files = [];
            
            // Main command file
            const mainCommandFile = `COMMANDS/${commandName}.js`;
            if (await this.fileExists(mainCommandFile)) {
                files.push(mainCommandFile);
            }
            
            // Check for game file
            const gameFile = `GAMES/${commandName}.js`;
            if (await this.fileExists(gameFile)) {
                files.push(gameFile);
            }
            
            // Check for alternative game file naming
            const altGameFile = `GAMES/${commandName}Game.js`;
            if (await this.fileExists(altGameFile)) {
                files.push(altGameFile);
            }
            
            // Check for specialized command variations
            const variations = [
                `COMMANDS/${commandName}-game.js`,
                `COMMANDS/${commandName}Command.js`,
                `GAMES/${commandName.toLowerCase()}.js`,
                `GAMES/${this.capitalize(commandName)}.js`
            ];
            
            for (const variation of variations) {
                if (await this.fileExists(variation) && !files.includes(variation)) {
                    files.push(variation);
                }
            }
            
            // Check admin commands
            const adminCommandFile = `COMMANDS/ADMIN/${commandName}.js`;
            if (await this.fileExists(adminCommandFile)) {
                files.push(adminCommandFile);
            }
            
            return files;
        } catch (error) {
            logger.error(`Error getting files for command ${commandName}:`, error);
            return [];
        }
    }

    /**
     * Scan local filesystem to build file cache
     */
    async scanLocalFiles() {
        try {
            const fileMap = new Map();
            
            // Scan COMMANDS directory
            await this.scanDirectory('COMMANDS', fileMap);
            
            // Scan GAMES directory
            await this.scanDirectory('GAMES', fileMap);
            
            // Scan UTILS directory
            await this.scanDirectory('UTILS', fileMap);
            
            // Scan COMMANDS/ADMIN directory
            await this.scanDirectory('COMMANDS/ADMIN', fileMap);
            
            this.fileCache = fileMap;
            this.lastScan = Date.now();
            
            logger.info(`Scanned ${fileMap.size} files for cog mapping`);
            return fileMap;
        } catch (error) {
            logger.error('Error scanning local files:', error);
            throw error;
        }
    }

    /**
     * Scan a specific directory
     */
    async scanDirectory(dirPath, fileMap) {
        try {
            const fullPath = path.join(process.cwd(), dirPath);
            const files = await fs.readdir(fullPath);
            
            for (const file of files) {
                if (file.endsWith('.js')) {
                    const relativePath = `${dirPath}/${file}`;
                    const stats = await fs.stat(path.join(fullPath, file));
                    
                    fileMap.set(relativePath, {
                        path: relativePath,
                        name: file,
                        size: stats.size,
                        modified: stats.mtime,
                        exists: true
                    });
                }
            }
        } catch (error) {
            // Directory might not exist, that's ok
            logger.debug(`Could not scan directory ${dirPath}: ${error.message}`);
        }
    }

    /**
     * Check if a file exists in cache
     */
    async fileExists(filePath) {
        await this.ensureFileCache();
        return this.fileCache.has(filePath);
    }

    /**
     * Ensure file cache is up to date
     */
    async ensureFileCache() {
        const now = Date.now();
        if (!this.lastScan || (now - this.lastScan) > this.scanInterval) {
            await this.scanLocalFiles();
        }
    }

    /**
     * Get GitHub URL for a file
     */
    getGithubUrl(filePath) {
        return `${this.githubBaseUrl}/${filePath}`;
    }

    /**
     * Get all available cog categories with their file counts
     */
    async getCogSummary(cogManager) {
        try {
            const summary = {};
            const categories = cogManager.getCategories();
            
            for (const categoryName of categories) {
                const files = await this.getCogFiles(categoryName, cogManager);
                const categoryInfo = cogManager.getCategoryInfo(categoryName);
                
                summary[categoryName] = {
                    name: categoryInfo.name,
                    description: categoryInfo.description,
                    commands: categoryInfo.commands,
                    fileCount: files.length,
                    files: files,
                    commandCount: categoryInfo.commands.length
                };
            }
            
            return summary;
        } catch (error) {
            logger.error('Error getting cog summary:', error);
            throw error;
        }
    }

    /**
     * Get update-able files for autocomplete
     */
    async getUpdateableItems(cogManager) {
        try {
            const items = [];
            
            // Add cog categories
            const categories = cogManager.getCategories();
            for (const categoryName of categories) {
                const categoryInfo = cogManager.getCategoryInfo(categoryName);
                const files = await this.getCogFiles(categoryName, cogManager);
                
                items.push({
                    type: 'cog',
                    name: `📁 ${categoryInfo.name} (${files.length} files)`,
                    value: categoryName,
                    fileCount: files.length
                });
            }
            
            // Add individual commands
            const allCommands = new Set();
            for (const categoryName of categories) {
                const categoryInfo = cogManager.getCategoryInfo(categoryName);
                for (const command of categoryInfo.commands) {
                    if (!allCommands.has(command)) {
                        allCommands.add(command);
                        const files = await this.getCommandFiles(command);
                        const category = cogManager.getCommandCategory(command);
                        const categoryInfo = cogManager.getCategoryInfo(category);
                        
                        items.push({
                            type: 'command',
                            name: `🔧 ${command} (${categoryInfo.name})`,
                            value: command,
                            fileCount: files.length
                        });
                    }
                }
            }
            
            return items;
        } catch (error) {
            logger.error('Error getting updateable items:', error);
            return [];
        }
    }

    /**
     * Validate that all required files exist for an update
     */
    async validateUpdateFiles(categoryOrCommand, type, cogManager) {
        try {
            let files = [];
            
            if (type === 'cog') {
                files = await this.getCogFiles(categoryOrCommand, cogManager);
            } else {
                files = await this.getCommandFiles(categoryOrCommand);
            }
            
            const validation = {
                valid: true,
                files: files,
                missing: [],
                exists: []
            };
            
            for (const file of files) {
                if (await this.fileExists(file)) {
                    validation.exists.push(file);
                } else {
                    validation.missing.push(file);
                }
            }
            
            // It's ok if some files are missing (they might not exist locally but exist on GitHub)
            // We'll validate GitHub existence during the actual update
            
            return validation;
        } catch (error) {
            logger.error('Error validating update files:', error);
            return { valid: false, error: error.message, files: [] };
        }
    }

    /**
     * Helper function to capitalize first letter
     */
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Clear file cache (force rescan)
     */
    clearCache() {
        this.fileCache.clear();
        this.lastScan = null;
        logger.debug('File cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            fileCount: this.fileCache.size,
            lastScan: this.lastScan,
            cacheAge: this.lastScan ? Date.now() - this.lastScan : null
        };
    }
}

// Export singleton instance
const cogFileMapper = new CogFileMapper();
module.exports = cogFileMapper;