/**
 * StateManager - Persistent State Management for EconomyGuardian
 * Handles configuration persistence, state recovery, and data backup
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../../UTILS/logger');

class StateManager {
    constructor(config) {
        this.config = config;
        
        // Storage configuration
        this.storageDir = config.storageDir || path.join(__dirname, '../../data/economy_guardian');
        this.backupDir = path.join(this.storageDir, 'backups');
        this.maxBackups = config.maxBackups || 10;
        
        // State cache
        this.stateCache = new Map();
        this.lastSaved = new Map();
        
        // Auto-save configuration
        this.autoSaveInterval = config.autoSaveInterval || 5 * 60 * 1000; // 5 minutes
        this.autoSaveTimer = null;
        
        // Encryption (optional)
        this.encryptionEnabled = config.encryptionEnabled || false;
        this.encryptionKey = config.encryptionKey || null;
        
        if (this.encryptionEnabled && !this.encryptionKey) {
            this.encryptionKey = crypto.randomBytes(32); // Generate random key
            logger.warn('Generated random encryption key - state will not persist across restarts');
        }
    }

    async initialize() {
        try {
            logger.info('Initializing StateManager...');
            
            // Create directories
            await this.ensureDirectories();
            
            // Load existing state files
            await this.loadAllStates();
            
            // Start auto-save timer
            this.startAutoSave();
            
            logger.info(`StateManager initialized with storage at: ${this.storageDir}`);
            return true;
            
        } catch (error) {
            logger.error(`StateManager initialization failed: ${error.message}`);
            throw error;
        }
    }

    async shutdown() {
        // Stop auto-save
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }
        
        // Save all pending state
        await this.saveAllStates();
        
        logger.info('StateManager shut down gracefully');
    }

    /**
     * Save state data with optional encryption
     */
    async saveState(key, data) {
        try {
            if (!key || typeof key !== 'string') {
                throw new Error('State key must be a non-empty string');
            }
            
            // Add metadata
            const stateData = {
                key,
                data,
                timestamp: new Date().toISOString(),
                version: '1.0',
                checksum: this.calculateChecksum(data)
            };
            
            // Update cache
            this.stateCache.set(key, stateData);
            this.lastSaved.set(key, Date.now());
            
            // Prepare file content
            let content = JSON.stringify(stateData, null, 2);
            
            // Encrypt if enabled
            if (this.encryptionEnabled) {
                content = this.encrypt(content);
            }
            
            // Write to file
            const filePath = this.getStateFilePath(key);
            await fs.writeFile(filePath, content, 'utf8');
            
            logger.debug(`State saved: ${key}`);
            return true;
            
        } catch (error) {
            logger.error(`Failed to save state '${key}': ${error.message}`);
            throw error;
        }
    }

    /**
     * Load state data with optional decryption
     */
    async loadState(key) {
        try {
            if (!key || typeof key !== 'string') {
                throw new Error('State key must be a non-empty string');
            }
            
            // Check cache first
            if (this.stateCache.has(key)) {
                return this.stateCache.get(key).data;
            }
            
            const filePath = this.getStateFilePath(key);
            
            // Check if file exists
            try {
                await fs.access(filePath);
            } catch {
                // File doesn't exist
                return null;
            }
            
            // Read file content
            let content = await fs.readFile(filePath, 'utf8');
            
            // Decrypt if needed
            if (this.encryptionEnabled) {
                content = this.decrypt(content);
            }
            
            // Parse data
            const stateData = JSON.parse(content);
            
            // Validate checksum
            if (stateData.checksum && !this.validateChecksum(stateData.data, stateData.checksum)) {
                logger.warn(`Checksum validation failed for state: ${key}`);
            }
            
            // Update cache
            this.stateCache.set(key, stateData);
            
            logger.debug(`State loaded: ${key}`);
            return stateData.data;
            
        } catch (error) {
            logger.error(`Failed to load state '${key}': ${error.message}`);
            return null;
        }
    }

    /**
     * Delete state data
     */
    async deleteState(key) {
        try {
            const filePath = this.getStateFilePath(key);
            
            // Remove from cache
            this.stateCache.delete(key);
            this.lastSaved.delete(key);
            
            // Delete file
            try {
                await fs.unlink(filePath);
                logger.debug(`State deleted: ${key}`);
                return true;
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    throw error;
                }
                return false; // File didn't exist
            }
            
        } catch (error) {
            logger.error(`Failed to delete state '${key}': ${error.message}`);
            throw error;
        }
    }

    /**
     * List all available state keys
     */
    async listStates() {
        try {
            const files = await fs.readdir(this.storageDir);
            const stateFiles = files.filter(file => file.endsWith('.json'));
            return stateFiles.map(file => file.replace('.json', ''));
        } catch (error) {
            logger.error(`Failed to list states: ${error.message}`);
            return [];
        }
    }

    /**
     * Create backup of current state
     */
    async createBackup(label = null) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = label ? `backup_${label}_${timestamp}` : `backup_${timestamp}`;
            const backupPath = path.join(this.backupDir, backupName);
            
            // Create backup directory
            await fs.mkdir(backupPath, { recursive: true });
            
            // Copy all state files
            const stateKeys = await this.listStates();
            const backupManifest = {
                timestamp,
                label,
                states: [],
                totalFiles: stateKeys.length
            };
            
            for (const key of stateKeys) {
                const sourceFile = this.getStateFilePath(key);
                const backupFile = path.join(backupPath, `${key}.json`);
                
                try {
                    await fs.copyFile(sourceFile, backupFile);
                    backupManifest.states.push(key);
                } catch (error) {
                    logger.warn(`Failed to backup state '${key}': ${error.message}`);
                }
            }
            
            // Save manifest
            await fs.writeFile(
                path.join(backupPath, 'manifest.json'),
                JSON.stringify(backupManifest, null, 2)
            );
            
            // Cleanup old backups
            await this.cleanupOldBackups();
            
            logger.info(`Backup created: ${backupName} (${backupManifest.states.length} states)`);
            return { path: backupPath, manifest: backupManifest };
            
        } catch (error) {
            logger.error(`Backup creation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Restore from backup
     */
    async restoreFromBackup(backupName) {
        try {
            const backupPath = path.join(this.backupDir, backupName);
            const manifestPath = path.join(backupPath, 'manifest.json');
            
            // Read manifest
            const manifestContent = await fs.readFile(manifestPath, 'utf8');
            const manifest = JSON.parse(manifestContent);
            
            logger.info(`Restoring from backup: ${backupName}`);
            
            // Restore each state
            let restoredCount = 0;
            for (const key of manifest.states) {
                try {
                    const backupFile = path.join(backupPath, `${key}.json`);
                    const stateFile = this.getStateFilePath(key);
                    
                    await fs.copyFile(backupFile, stateFile);
                    
                    // Clear cache to force reload
                    this.stateCache.delete(key);
                    
                    restoredCount++;
                } catch (error) {
                    logger.warn(`Failed to restore state '${key}': ${error.message}`);
                }
            }
            
            logger.info(`Backup restored: ${restoredCount}/${manifest.states.length} states`);
            return { restoredCount, totalStates: manifest.states.length };
            
        } catch (error) {
            logger.error(`Backup restoration failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get state file path
     */
    getStateFilePath(key) {
        const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
        return path.join(this.storageDir, `${sanitizedKey}.json`);
    }

    /**
     * Ensure required directories exist
     */
    async ensureDirectories() {
        await fs.mkdir(this.storageDir, { recursive: true });
        await fs.mkdir(this.backupDir, { recursive: true });
    }

    /**
     * Load all existing state files into cache
     */
    async loadAllStates() {
        try {
            const stateKeys = await this.listStates();
            let loadedCount = 0;
            
            for (const key of stateKeys) {
                try {
                    await this.loadState(key);
                    loadedCount++;
                } catch (error) {
                    logger.warn(`Failed to load state '${key}': ${error.message}`);
                }
            }
            
            logger.info(`Loaded ${loadedCount}/${stateKeys.length} existing states`);
            
        } catch (error) {
            logger.error(`Failed to load existing states: ${error.message}`);
        }
    }

    /**
     * Save all cached states
     */
    async saveAllStates() {
        let savedCount = 0;
        const errors = [];
        
        for (const [key, stateData] of this.stateCache) {
            try {
                await this.saveState(key, stateData.data);
                savedCount++;
            } catch (error) {
                errors.push({ key, error: error.message });
            }
        }
        
        if (errors.length > 0) {
            logger.warn(`Failed to save ${errors.length} states:`, errors);
        }
        
        logger.debug(`Saved ${savedCount} states to disk`);
        return { savedCount, errors };
    }

    /**
     * Start auto-save timer
     */
    startAutoSave() {
        this.autoSaveTimer = setInterval(async () => {
            try {
                await this.saveAllStates();
            } catch (error) {
                logger.error(`Auto-save failed: ${error.message}`);
            }
        }, this.autoSaveInterval);
        
        logger.debug(`Auto-save enabled (interval: ${this.autoSaveInterval / 1000}s)`);
    }

    /**
     * Cleanup old backups
     */
    async cleanupOldBackups() {
        try {
            const backups = await fs.readdir(this.backupDir);
            const backupDirs = backups.filter(name => name.startsWith('backup_'));
            
            if (backupDirs.length <= this.maxBackups) {
                return;
            }
            
            // Sort by creation time (newest first)
            const backupInfo = await Promise.all(
                backupDirs.map(async (dir) => {
                    const dirPath = path.join(this.backupDir, dir);
                    const stat = await fs.stat(dirPath);
                    return { name: dir, path: dirPath, created: stat.ctime };
                })
            );
            
            backupInfo.sort((a, b) => b.created - a.created);
            
            // Remove oldest backups
            const toRemove = backupInfo.slice(this.maxBackups);
            for (const backup of toRemove) {
                await fs.rmdir(backup.path, { recursive: true });
                logger.debug(`Removed old backup: ${backup.name}`);
            }
            
            if (toRemove.length > 0) {
                logger.info(`Cleaned up ${toRemove.length} old backups`);
            }
            
        } catch (error) {
            logger.error(`Backup cleanup failed: ${error.message}`);
        }
    }

    /**
     * Calculate checksum for data integrity
     */
    calculateChecksum(data) {
        const content = JSON.stringify(data);
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Validate checksum
     */
    validateChecksum(data, expectedChecksum) {
        const actualChecksum = this.calculateChecksum(data);
        return actualChecksum === expectedChecksum;
    }

    /**
     * Encrypt content
     */
    encrypt(content) {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not configured');
        }
        
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
        
        let encrypted = cipher.update(content, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return JSON.stringify({
            encrypted,
            iv: iv.toString('hex'),
            algorithm: 'aes-256-cbc'
        });
    }

    /**
     * Decrypt content
     */
    decrypt(encryptedContent) {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not configured');
        }
        
        const { encrypted, iv } = JSON.parse(encryptedContent);
        const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    /**
     * Get storage statistics
     */
    async getStorageStats() {
        try {
            const states = await this.listStates();
            const backups = await fs.readdir(this.backupDir);
            
            let totalSize = 0;
            for (const key of states) {
                const filePath = this.getStateFilePath(key);
                try {
                    const stat = await fs.stat(filePath);
                    totalSize += stat.size;
                } catch {
                    // Ignore missing files
                }
            }
            
            return {
                totalStates: states.length,
                cachedStates: this.stateCache.size,
                totalBackups: backups.filter(b => b.startsWith('backup_')).length,
                storageSize: totalSize,
                storagePath: this.storageDir,
                encryptionEnabled: this.encryptionEnabled
            };
            
        } catch (error) {
            logger.error(`Failed to get storage stats: ${error.message}`);
            return null;
        }
    }

    /**
     * Export all states to a single file
     */
    async exportStates(filePath) {
        try {
            const states = await this.listStates();
            const exportData = {
                timestamp: new Date().toISOString(),
                version: '1.0',
                states: {}
            };
            
            for (const key of states) {
                const data = await this.loadState(key);
                if (data) {
                    exportData.states[key] = data;
                }
            }
            
            await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));
            
            logger.info(`Exported ${Object.keys(exportData.states).length} states to: ${filePath}`);
            return exportData;
            
        } catch (error) {
            logger.error(`State export failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Import states from exported file
     */
    async importStates(filePath, overwrite = false) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const importData = JSON.parse(content);
            
            if (!importData.states || typeof importData.states !== 'object') {
                throw new Error('Invalid export file format');
            }
            
            let importedCount = 0;
            let skippedCount = 0;
            
            for (const [key, data] of Object.entries(importData.states)) {
                // Check if state already exists
                if (!overwrite && this.stateCache.has(key)) {
                    skippedCount++;
                    continue;
                }
                
                await this.saveState(key, data);
                importedCount++;
            }
            
            logger.info(`Import complete: ${importedCount} imported, ${skippedCount} skipped`);
            return { importedCount, skippedCount };
            
        } catch (error) {
            logger.error(`State import failed: ${error.message}`);
            throw error;
        }
    }
}

module.exports = StateManager;