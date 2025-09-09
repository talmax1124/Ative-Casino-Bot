/**
 * ATIVE Casino Bot - Automated Backup Manager
 * Handles database backups with cloud storage integration
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const logger = require('./logger');

class BackupManager {
    constructor() {
        this.backupDir = path.join(process.cwd(), 'backups');
        this.config = {
            maxLocalBackups: 10,
            maxCloudBackups: 30,
            compressionLevel: 6,
            encryptionEnabled: true
        };
        
        // Critical tables that must be backed up
        this.criticalTables = [
            'user_balances',
            'user_stats', 
            'user_profiles',
            'user_levels',
            'game_results',
            'lottery_tickets',
            'lottery_info',
            'lottery_winners',
            'server_config',
            'scratch_tickets',
            'scratch_drops',
            'shop_items',
            'user_settings',
            'user_shop_purchases',
            'user_active_boosts',
            'user_votes',
            'purchases',
            'economic_changes'
        ];
    }

    /**
     * Initialize backup system
     */
    async initialize() {
        try {
            // Ensure backup directory exists
            await fs.mkdir(this.backupDir, { recursive: true });
            logger.info('🔄 Backup Manager initialized');
            
            // Validate database connection
            await this.validateConnection();
            
            return true;
        } catch (error) {
            logger.error(`Failed to initialize backup manager: ${error.message}`);
            throw error;
        }
    }

    /**
     * Validate database connection
     */
    async validateConnection() {
        const dbManager = require('./database');
        if (!dbManager.initialized) {
            await dbManager.initialize();
        }
        return true;
    }

    /**
     * Create full database backup
     */
    async createFullBackup(options = {}) {
        const backupId = this.generateBackupId();
        const timestamp = new Date().toISOString();
        
        logger.info(`🔄 Starting full backup: ${backupId}`);
        
        try {
            // Get database connection details
            const dbConfig = this.getDatabaseConfig();
            const backupFile = path.join(this.backupDir, `backup_${backupId}.sql`);
            
            // Create mysqldump command
            const dumpCommand = this.buildDumpCommand(dbConfig, backupFile);
            
            // Execute backup
            logger.info('📥 Creating database dump...');
            await execAsync(dumpCommand);
            
            // Verify backup file exists and has content
            const stats = await fs.stat(backupFile);
            if (stats.size === 0) {
                throw new Error('Backup file is empty');
            }
            
            // Compress backup if enabled
            let finalBackupFile = backupFile;
            if (options.compress !== false) {
                finalBackupFile = await this.compressBackup(backupFile);
                await fs.unlink(backupFile); // Remove uncompressed file
            }
            
            // Encrypt backup if enabled
            if (this.config.encryptionEnabled && options.encrypt !== false) {
                finalBackupFile = await this.encryptBackup(finalBackupFile);
            }
            
            // Create backup metadata
            const metadata = {
                id: backupId,
                timestamp: timestamp,
                type: 'full',
                size: (await fs.stat(finalBackupFile)).size,
                tables: this.criticalTables,
                encrypted: this.config.encryptionEnabled && options.encrypt !== false,
                compressed: options.compress !== false,
                checksum: await this.calculateChecksum(finalBackupFile)
            };
            
            // Save metadata
            await this.saveMetadata(backupId, metadata);
            
            logger.info(`✅ Full backup completed: ${backupId} (${this.formatBytes(metadata.size)})`);
            
            // Upload to cloud if configured
            if (options.upload !== false) {
                await this.uploadToCloud(finalBackupFile, metadata);
            }
            
            // Cleanup old backups
            await this.cleanupOldBackups();
            
            return {
                id: backupId,
                file: finalBackupFile,
                metadata: metadata
            };
            
        } catch (error) {
            logger.error(`❌ Backup failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create incremental backup (only changed data)
     */
    async createIncrementalBackup(lastBackupTimestamp) {
        const backupId = this.generateBackupId('inc');
        const timestamp = new Date().toISOString();
        
        logger.info(`🔄 Starting incremental backup: ${backupId}`);
        
        try {
            const dbManager = require('./database');
            const backupData = {};
            
            // Backup only recent changes
            for (const table of this.criticalTables) {
                const changes = await this.getTableChanges(table, lastBackupTimestamp);
                if (changes.length > 0) {
                    backupData[table] = changes;
                }
            }
            
            if (Object.keys(backupData).length === 0) {
                logger.info('📝 No changes detected, skipping incremental backup');
                return null;
            }
            
            // Save incremental data as JSON
            const backupFile = path.join(this.backupDir, `backup_${backupId}.json`);
            await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2));
            
            // Compress and encrypt
            let finalBackupFile = await this.compressBackup(backupFile);
            await fs.unlink(backupFile);
            
            if (this.config.encryptionEnabled) {
                finalBackupFile = await this.encryptBackup(finalBackupFile);
            }
            
            const metadata = {
                id: backupId,
                timestamp: timestamp,
                type: 'incremental',
                size: (await fs.stat(finalBackupFile)).size,
                changes: Object.keys(backupData),
                encrypted: this.config.encryptionEnabled,
                compressed: true,
                checksum: await this.calculateChecksum(finalBackupFile),
                basedOn: lastBackupTimestamp
            };
            
            await this.saveMetadata(backupId, metadata);
            
            logger.info(`✅ Incremental backup completed: ${backupId} (${metadata.changes.length} tables changed)`);
            
            return { id: backupId, file: finalBackupFile, metadata };
            
        } catch (error) {
            logger.error(`❌ Incremental backup failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Build mysqldump command
     */
    buildDumpCommand(dbConfig, outputFile) {
        const options = [
            '--single-transaction',
            '--routines',
            '--triggers',
            '--hex-blob',
            '--complete-insert',
            '--extended-insert',
            '--add-drop-table'
        ];
        
        return `mysqldump -h ${dbConfig.host} -P ${dbConfig.port} -u ${dbConfig.user} -p${dbConfig.password} ${options.join(' ')} ${dbConfig.database} > "${outputFile}"`;
    }

    /**
     * Get database configuration
     */
    getDatabaseConfig() {
        return {
            host: process.env.MARIADB_HOST || 'localhost',
            port: process.env.MARIADB_PORT || 3306,
            user: process.env.MARIADB_USER,
            password: process.env.MARIADB_PASSWORD,
            database: process.env.MARIADB_DATABASE
        };
    }

    /**
     * Compress backup file using gzip
     */
    async compressBackup(filePath) {
        const compressedPath = `${filePath}.gz`;
        await execAsync(`gzip -${this.config.compressionLevel} -c "${filePath}" > "${compressedPath}"`);
        return compressedPath;
    }

    /**
     * Encrypt backup file using AES-256
     */
    async encryptBackup(filePath) {
        const key = this.getEncryptionKey();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher('aes-256-cbc', key);
        
        const input = await fs.readFile(filePath);
        const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
        
        const encryptedPath = `${filePath}.enc`;
        await fs.writeFile(encryptedPath, Buffer.concat([iv, encrypted]));
        
        // Remove unencrypted file
        await fs.unlink(filePath);
        
        return encryptedPath;
    }

    /**
     * Calculate file checksum
     */
    async calculateChecksum(filePath) {
        const data = await fs.readFile(filePath);
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Generate unique backup ID
     */
    generateBackupId(prefix = 'full') {
        const timestamp = Date.now();
        const random = crypto.randomBytes(4).toString('hex');
        return `${prefix}_${timestamp}_${random}`;
    }

    /**
     * Save backup metadata
     */
    async saveMetadata(backupId, metadata) {
        const metadataPath = path.join(this.backupDir, `${backupId}.meta`);
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    }

    /**
     * Load backup metadata
     */
    async loadMetadata(backupId) {
        const metadataPath = path.join(this.backupDir, `${backupId}.meta`);
        const data = await fs.readFile(metadataPath, 'utf8');
        return JSON.parse(data);
    }

    /**
     * List all available backups
     */
    async listBackups() {
        const files = await fs.readdir(this.backupDir);
        const metaFiles = files.filter(f => f.endsWith('.meta'));
        
        const backups = [];
        for (const metaFile of metaFiles) {
            try {
                const backupId = metaFile.replace('.meta', '');
                const metadata = await this.loadMetadata(backupId);
                backups.push(metadata);
            } catch (error) {
                logger.warn(`Failed to load metadata for ${metaFile}: ${error.message}`);
            }
        }
        
        return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    /**
     * Cleanup old local backups
     */
    async cleanupOldBackups() {
        const backups = await this.listBackups();
        const localBackups = backups.filter(b => !b.cloudUploaded);
        
        if (localBackups.length > this.config.maxLocalBackups) {
            const toDelete = localBackups.slice(this.config.maxLocalBackups);
            
            for (const backup of toDelete) {
                try {
                    await this.deleteBackup(backup.id);
                    logger.info(`🗑️ Deleted old backup: ${backup.id}`);
                } catch (error) {
                    logger.warn(`Failed to delete backup ${backup.id}: ${error.message}`);
                }
            }
        }
    }

    /**
     * Delete a backup
     */
    async deleteBackup(backupId) {
        const files = await fs.readdir(this.backupDir);
        const backupFiles = files.filter(f => f.startsWith(backupId));
        
        for (const file of backupFiles) {
            await fs.unlink(path.join(this.backupDir, file));
        }
    }

    /**
     * Get table changes since timestamp (for incremental backups)
     */
    async getTableChanges(tableName, sinceTimestamp) {
        // This would need to be implemented based on your specific table structures
        // For now, return empty array (full backups will be used)
        return [];
    }

    /**
     * Get encryption key from environment or generate one
     */
    getEncryptionKey() {
        if (process.env.BACKUP_ENCRYPTION_KEY) {
            return process.env.BACKUP_ENCRYPTION_KEY;
        }
        
        // Generate a key and warn user to save it
        const key = crypto.randomBytes(32).toString('hex');
        logger.warn(`⚠️ Generated backup encryption key: ${key}`);
        logger.warn('⚠️ Save this key to environment variable BACKUP_ENCRYPTION_KEY');
        return key;
    }

    /**
     * Upload backup to cloud storage
     */
    async uploadToCloud(filePath, metadata) {
        // Placeholder for cloud upload implementation
        // Will be implemented based on chosen cloud provider
        logger.info('☁️ Cloud upload not yet configured');
        return false;
    }

    /**
     * Format bytes to human readable string
     */
    formatBytes(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
    }

    /**
     * Get backup system status
     */
    async getStatus() {
        const backups = await this.listBackups();
        const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
        
        return {
            totalBackups: backups.length,
            totalSize: this.formatBytes(totalSize),
            latestBackup: backups[0] || null,
            oldestBackup: backups[backups.length - 1] || null,
            backupDirectory: this.backupDir
        };
    }
}

module.exports = BackupManager;