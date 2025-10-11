/**
 * Enhanced Cog Updater System
 * Handles GitHub file discovery, downloading, backup, and rollback
 */

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const logger = require('./logger');
const cogFileMapper = require('./cogFileMapper');

class CogUpdater {
    constructor() {
        this.backupDir = path.join(process.cwd(), 'backups', 'cogs');
        this.updateQueue = new Map();
        this.isUpdating = false;
        
        // GitHub API configuration
        this.githubApi = 'https://api.github.com';
        this.githubRepo = 'talmax1124/Ative-Casino-Bot';
        this.githubBranch = 'main';
        this.repositoryExists = false; // Will be checked on first use
        this.githubToken = process.env.GITHUB_TOKEN || process.env.ACCESS_TOKEN || null;
        
        // Ensure backup directory exists
        this.ensureBackupDirectory();
    }

    /**
     * Ensure backup directory exists
     */
    async ensureBackupDirectory() {
        try {
            await fs.mkdir(this.backupDir, { recursive: true });
            logger.debug(`Backup directory ready: ${this.backupDir}`);
        } catch (error) {
            logger.error('Failed to create backup directory:', error);
        }
    }

    /**
     * Get headers for GitHub API requests
     */
    getGithubHeaders() {
        const headers = { 'User-Agent': 'ATIVE-Casino-Bot' };
        if (this.githubToken) {
            headers['Authorization'] = `Bearer ${this.githubToken}`;
        }
        return headers;
    }

    /**
     * Check if file exists on GitHub
     */
    async checkGithubFileExists(filePath) {
        return new Promise((resolve) => {
            // First check if repository exists
            if (!this.repositoryExists) {
                const repoUrl = `${this.githubApi}/repos/${this.githubRepo}`;
                https.get(repoUrl, { headers: this.getGithubHeaders() }, (repoRes) => {
                    if (repoRes.statusCode !== 200) {
                        if (repoRes.statusCode === 404) {
                            logger.warn(`Repository ${this.githubRepo} not found (404). It may be private or the name is incorrect.`);
                        } else if (repoRes.statusCode === 401) {
                            logger.warn(`Repository ${this.githubRepo} requires authentication (401). Please set GITHUB_TOKEN environment variable.`);
                        } else {
                            logger.warn(`Repository ${this.githubRepo} returned ${repoRes.statusCode}: ${repoRes.statusMessage}`);
                        }
                        resolve(false);
                        return;
                    }
                    this.repositoryExists = true;
                    
                    // Now check file
                    const url = `${this.githubApi}/repos/${this.githubRepo}/contents/${filePath}?ref=${this.githubBranch}`;
                    https.get(url, { headers: this.getGithubHeaders() }, (res) => {
                        resolve(res.statusCode === 200);
                    }).on('error', () => {
                        resolve(false);
                    });
                }).on('error', () => {
                    resolve(false);
                });
            } else {
                const url = `${this.githubApi}/repos/${this.githubRepo}/contents/${filePath}?ref=${this.githubBranch}`;
                https.get(url, { headers: this.getGithubHeaders() }, (res) => {
                    resolve(res.statusCode === 200);
                }).on('error', () => {
                    resolve(false);
                });
            }
        });
    }

    /**
     * Download file from GitHub
     */
    async downloadFromGithub(filePath) {
        return new Promise((resolve, reject) => {
            const url = cogFileMapper.getGithubUrl(filePath);
            
            https.get(url, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage} for ${filePath}`));
                    return;
                }
                
                let data = '';
                res.setEncoding('utf8');
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            }).on('error', reject);
        });
    }

    /**
     * Create backup of files before updating
     */
    async createBackup(files, backupName) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(this.backupDir, `${backupName}_${timestamp}`);
            
            await fs.mkdir(backupPath, { recursive: true });
            
            const backupInfo = {
                name: backupName,
                timestamp: timestamp,
                files: [],
                path: backupPath
            };
            
            for (const filePath of files) {
                try {
                    const fullPath = path.join(process.cwd(), filePath);
                    const content = await fs.readFile(fullPath, 'utf8');
                    
                    // Create directory structure in backup
                    const backupFilePath = path.join(backupPath, filePath);
                    const backupFileDir = path.dirname(backupFilePath);
                    await fs.mkdir(backupFileDir, { recursive: true });
                    
                    // Save file to backup
                    await fs.writeFile(backupFilePath, content, 'utf8');
                    
                    backupInfo.files.push({
                        path: filePath,
                        size: content.length,
                        backed_up: true
                    });
                    
                    logger.debug(`Backed up: ${filePath}`);
                } catch (error) {
                    logger.warn(`Could not backup ${filePath}: ${error.message}`);
                    backupInfo.files.push({
                        path: filePath,
                        error: error.message,
                        backed_up: false
                    });
                }
            }
            
            // Save backup metadata
            const metadataPath = path.join(backupPath, 'backup_info.json');
            await fs.writeFile(metadataPath, JSON.stringify(backupInfo, null, 2), 'utf8');
            
            logger.info(`Created backup: ${backupName} with ${backupInfo.files.length} files`);
            return backupInfo;
        } catch (error) {
            logger.error('Error creating backup:', error);
            throw error;
        }
    }

    /**
     * Rollback from backup
     */
    async rollbackFromBackup(backupPath) {
        try {
            const metadataPath = path.join(backupPath, 'backup_info.json');
            const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
            
            const results = [];
            
            for (const fileInfo of metadata.files) {
                if (fileInfo.backed_up) {
                    try {
                        const backupFilePath = path.join(backupPath, fileInfo.path);
                        const originalFilePath = path.join(process.cwd(), fileInfo.path);
                        
                        // Ensure directory exists
                        const originalFileDir = path.dirname(originalFilePath);
                        await fs.mkdir(originalFileDir, { recursive: true });
                        
                        // Copy from backup to original location
                        const content = await fs.readFile(backupFilePath, 'utf8');
                        await fs.writeFile(originalFilePath, content, 'utf8');
                        
                        results.push({ file: fileInfo.path, success: true });
                        logger.debug(`Restored: ${fileInfo.path}`);
                    } catch (error) {
                        results.push({ file: fileInfo.path, success: false, error: error.message });
                        logger.error(`Failed to restore ${fileInfo.path}:`, error);
                    }
                }
            }
            
            logger.info(`Rollback completed for ${metadata.name}: ${results.filter(r => r.success).length}/${results.length} files restored`);
            return { success: true, metadata, results };
        } catch (error) {
            logger.error('Error during rollback:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Validate downloaded content
     */
    validateContent(content, filePath) {
        // Basic validation checks
        if (!content || content.trim().length === 0) {
            return { valid: false, reason: 'Empty file content' };
        }
        
        // Check for JavaScript syntax if it's a JS file
        if (filePath.endsWith('.js')) {
            try {
                // Basic syntax check - try to create a function with the content
                new Function(content);
                return { valid: true };
            } catch (error) {
                return { valid: false, reason: `JavaScript syntax error: ${error.message}` };
            }
        }
        
        // Check for common error pages
        if (content.includes('404: Not Found') || content.includes('<html')) {
            return { valid: false, reason: 'Received HTML error page instead of file content' };
        }
        
        return { valid: true };
    }

    /**
     * Update a single file
     */
    async updateFile(filePath, client = null) {
        try {
            // Check if file exists on GitHub
            const githubExists = await this.checkGithubFileExists(filePath);
            if (!githubExists) {
                return { success: false, error: `File ${filePath} not found on GitHub` };
            }
            
            // Download from GitHub
            const content = await this.downloadFromGithub(filePath);
            
            // Validate content
            const validation = this.validateContent(content, filePath);
            if (!validation.valid) {
                return { success: false, error: `Invalid content: ${validation.reason}` };
            }
            
            // Write to local file
            const localPath = path.join(process.cwd(), filePath);
            const localDir = path.dirname(localPath);
            await fs.mkdir(localDir, { recursive: true });
            await fs.writeFile(localPath, content, 'utf8');
            
            // Reload if it's a command file and client is provided
            let reloadResult = null;
            if (client && filePath.includes('COMMANDS/')) {
                reloadResult = await this.reloadCommand(client, localPath);
            }
            
            return { 
                success: true, 
                file: filePath, 
                size: content.length,
                reloaded: !!reloadResult,
                reloadResult
            };
        } catch (error) {
            return { success: false, file: filePath, error: error.message };
        }
    }

    /**
     * Reload a command in the Discord client
     */
    async reloadCommand(client, filePath) {
        try {
            const fullPath = path.resolve(filePath);
            
            // Clear from require cache
            delete require.cache[fullPath];
            
            // For commands, update the client's command collection
            if (filePath.includes('COMMANDS/')) {
                const commandName = path.basename(filePath, '.js');
                
                // Remove old command
                client.commands.delete(commandName);
                
                // Load new command
                const command = require(fullPath);
                if (command.data && command.execute) {
                    client.commands.set(command.data.name, command);
                    return `✅ Reloaded command: ${commandName}`;
                } else {
                    return `⚠️ File loaded but no valid command found: ${commandName}`;
                }
            }
            
            return `✅ Reloaded file: ${path.basename(filePath)}`;
        } catch (error) {
            return `❌ Failed to reload ${path.basename(filePath)}: ${error.message}`;
        }
    }

    /**
     * Update multiple files (cog or command)
     */
    async updateCogOrCommand(name, type, cogManager, client = null, progressCallback = null) {
        if (this.isUpdating) {
            throw new Error('Another update is already in progress');
        }
        
        this.isUpdating = true;
        
        try {
            // Get files to update
            let files = [];
            if (type === 'cog') {
                files = await cogFileMapper.getCogFiles(name, cogManager);
            } else {
                files = await cogFileMapper.getCommandFiles(name);
            }
            
            if (files.length === 0) {
                throw new Error(`No files found for ${type} '${name}'`);
            }
            
            logger.info(`Starting update of ${type} '${name}' (${files.length} files)`);
            
            // Create backup
            const backupInfo = await this.createBackup(files, `${type}_${name}`);
            
            // Update progress
            if (progressCallback) progressCallback({ phase: 'backup', message: 'Backup created' });
            
            // Update files
            const results = [];
            let successCount = 0;
            let failCount = 0;
            
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                
                if (progressCallback) {
                    progressCallback({ 
                        phase: 'update', 
                        message: `Updating ${file}`, 
                        progress: Math.round((i / files.length) * 100)
                    });
                }
                
                const result = await this.updateFile(file, client);
                results.push(result);
                
                if (result.success) {
                    successCount++;
                } else {
                    failCount++;
                    logger.warn(`Failed to update ${file}: ${result.error}`);
                }
            }
            
            // If too many failures, offer rollback
            const failureRate = failCount / files.length;
            if (failureRate > 0.5) { // More than 50% failed
                logger.warn(`High failure rate (${Math.round(failureRate * 100)}%) detected, backup available for rollback`);
            }
            
            if (progressCallback) {
                progressCallback({ 
                    phase: 'complete', 
                    message: `Update complete: ${successCount}/${files.length} files updated`,
                    success: successCount,
                    failed: failCount
                });
            }
            
            logger.info(`Update completed for ${type} '${name}': ${successCount}/${files.length} files updated`);
            
            return {
                success: failCount === 0,
                name,
                type,
                totalFiles: files.length,
                successCount,
                failCount,
                results,
                backupInfo,
                hasBackup: true
            };
            
        } catch (error) {
            logger.error(`Error updating ${type} '${name}':`, error);
            throw error;
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * Get available backups
     */
    async getAvailableBackups() {
        try {
            const backups = [];
            const backupDirs = await fs.readdir(this.backupDir);
            
            for (const dir of backupDirs) {
                try {
                    const metadataPath = path.join(this.backupDir, dir, 'backup_info.json');
                    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
                    
                    const timestampDate = new Date(metadata.timestamp);
                    const age = isNaN(timestampDate.getTime()) ? 0 : Date.now() - timestampDate.getTime();
                    
                    backups.push({
                        name: metadata.name,
                        timestamp: metadata.timestamp,
                        fileCount: metadata.files.length,
                        path: path.join(this.backupDir, dir),
                        age: age
                    });
                } catch (error) {
                    // Skip invalid backup directories
                    logger.debug(`Skipping invalid backup directory: ${dir}`);
                }
            }
            
            // Sort by timestamp (newest first)
            backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            return backups;
        } catch (error) {
            logger.error('Error getting available backups:', error);
            return [];
        }
    }

    /**
     * Clean old backups (keep last 10 per cog/command)
     */
    async cleanOldBackups() {
        try {
            const backups = await this.getAvailableBackups();
            const backupsByName = new Map();
            
            // Group backups by name
            for (const backup of backups) {
                if (!backupsByName.has(backup.name)) {
                    backupsByName.set(backup.name, []);
                }
                backupsByName.get(backup.name).push(backup);
            }
            
            let cleaned = 0;
            
            // Keep only the latest 10 backups per name
            for (const [name, nameBackups] of backupsByName) {
                if (nameBackups.length > 10) {
                    const toDelete = nameBackups.slice(10);
                    
                    for (const backup of toDelete) {
                        try {
                            await fs.rmdir(backup.path, { recursive: true });
                            cleaned++;
                            logger.debug(`Cleaned old backup: ${backup.name}_${backup.timestamp}`);
                        } catch (error) {
                            logger.warn(`Failed to clean backup ${backup.path}:`, error);
                        }
                    }
                }
            }
            
            if (cleaned > 0) {
                logger.info(`Cleaned ${cleaned} old backups`);
            }
            
            return cleaned;
        } catch (error) {
            logger.error('Error cleaning old backups:', error);
            return 0;
        }
    }

    /**
     * Get updater status
     */
    getStatus() {
        return {
            isUpdating: this.isUpdating,
            queueSize: this.updateQueue.size,
            backupDir: this.backupDir,
            githubRepo: this.githubRepo,
            githubBranch: this.githubBranch,
            hasGithubToken: !!this.githubToken,
            repositoryExists: this.repositoryExists
        };
    }
}

// Export singleton instance
const cogUpdater = new CogUpdater();
module.exports = cogUpdater;