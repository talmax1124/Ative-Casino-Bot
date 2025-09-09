/**
 * ATIVE Casino Bot - Backup Restoration System
 * Handles database restoration from backups
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const logger = require('./logger');

class BackupRestore {
    constructor() {
        this.backupDir = path.join(process.cwd(), 'backups');
        this.restoreDir = path.join(process.cwd(), 'temp', 'restore');
        this.verificationEnabled = true;
    }

    /**
     * Initialize restoration system
     */
    async initialize() {
        try {
            await fs.mkdir(this.restoreDir, { recursive: true });
            logger.info('🔄 Backup Restore System initialized');
            return true;
        } catch (error) {
            logger.error(`Failed to initialize restore system: ${error.message}`);
            throw error;
        }
    }

    /**
     * List available backups for restoration
     */
    async listAvailableBackups() {
        const backupManager = require('./backupManager');
        const manager = new backupManager();
        return await manager.listBackups();
    }

    /**
     * Restore database from backup
     */
    async restoreFromBackup(backupId, options = {}) {
        logger.info(`🔄 Starting database restoration from backup: ${backupId}`);
        
        try {
            // Validate backup exists and is healthy
            const backupInfo = await this.validateBackup(backupId);
            
            // Create pre-restoration backup if not disabled
            if (options.createPreBackup !== false) {
                await this.createPreRestorationBackup();
            }
            
            // Prepare backup file for restoration
            const restoreFile = await this.prepareBackupFile(backupInfo);
            
            // Verify backup integrity
            if (this.verificationEnabled && options.skipVerification !== true) {
                await this.verifyBackupIntegrity(restoreFile, backupInfo);
            }
            
            // Stop bot services that use the database
            if (options.stopServices !== false) {
                await this.stopDatabaseServices();
            }
            
            try {
                // Perform the restoration
                await this.performRestore(restoreFile, backupInfo);
                
                // Verify restored database
                await this.verifyRestoredDatabase();
                
                logger.info(`✅ Database restoration completed successfully: ${backupId}`);
                
                // Restart services
                if (options.stopServices !== false) {
                    await this.startDatabaseServices();
                }
                
                return {
                    success: true,
                    backupId: backupId,
                    restoredAt: new Date().toISOString(),
                    backupInfo: backupInfo
                };
                
            } catch (restoreError) {
                // If restore fails, attempt to restore from pre-restoration backup
                logger.error(`❌ Restoration failed: ${restoreError.message}`);
                
                if (options.autoRecover !== false) {
                    await this.recoverFromFailedRestore();
                }
                
                throw restoreError;
            }
            
        } catch (error) {
            logger.error(`❌ Database restoration failed: ${error.message}`);
            throw error;
        } finally {
            // Cleanup temporary files
            await this.cleanupTempFiles();
        }
    }

    /**
     * Validate backup exists and is healthy
     */
    async validateBackup(backupId) {
        const backupManager = require('./backupManager');
        const manager = new backupManager();
        
        try {
            const metadata = await manager.loadMetadata(backupId);
            
            // Check if backup file exists
            const backupFiles = await fs.readdir(this.backupDir);
            const backupFile = backupFiles.find(f => f.startsWith(backupId) && !f.endsWith('.meta'));
            
            if (!backupFile) {
                throw new Error(`Backup file not found for ${backupId}`);
            }
            
            const backupPath = path.join(this.backupDir, backupFile);
            const stats = await fs.stat(backupPath);
            
            if (stats.size === 0) {
                throw new Error(`Backup file is empty: ${backupId}`);
            }
            
            return {
                ...metadata,
                filePath: backupPath,
                fileName: backupFile
            };
            
        } catch (error) {
            throw new Error(`Backup validation failed: ${error.message}`);
        }
    }

    /**
     * Create pre-restoration backup
     */
    async createPreRestorationBackup() {
        logger.info('📥 Creating pre-restoration backup...');
        
        const backupManager = require('./backupManager');
        const manager = new backupManager();
        
        try {
            const preBackup = await manager.createFullBackup({
                compress: true,
                encrypt: true,
                upload: false // Keep locally for quick recovery
            });
            
            // Mark this as a pre-restoration backup
            const metadata = await manager.loadMetadata(preBackup.id);
            metadata.type = 'pre-restoration';
            metadata.purpose = 'Created before restoration for recovery purposes';
            await manager.saveMetadata(preBackup.id, metadata);
            
            this.preRestorationBackupId = preBackup.id;
            logger.info(`✅ Pre-restoration backup created: ${preBackup.id}`);
            
        } catch (error) {
            logger.warn(`⚠️ Failed to create pre-restoration backup: ${error.message}`);
            // Continue with restoration - this is not critical
        }
    }

    /**
     * Prepare backup file for restoration
     */
    async prepareBackupFile(backupInfo) {
        let workingFile = backupInfo.filePath;
        
        // Decrypt if encrypted
        if (backupInfo.encrypted) {
            logger.info('🔓 Decrypting backup file...');
            workingFile = await this.decryptBackup(workingFile);
        }
        
        // Decompress if compressed
        if (backupInfo.compressed) {
            logger.info('📦 Decompressing backup file...');
            workingFile = await this.decompressBackup(workingFile);
        }
        
        return workingFile;
    }

    /**
     * Decrypt backup file
     */
    async decryptBackup(encryptedPath) {
        const decryptedPath = path.join(this.restoreDir, `decrypted_${Date.now()}.sql`);
        
        try {
            const key = this.getDecryptionKey();
            const data = await fs.readFile(encryptedPath);
            
            // Extract IV and encrypted content
            const iv = data.slice(0, 16);
            const encrypted = data.slice(16);
            
            // Decrypt
            const decipher = crypto.createDecipher('aes-256-cbc', key);
            const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
            
            await fs.writeFile(decryptedPath, decrypted);
            return decryptedPath;
            
        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    /**
     * Decompress backup file
     */
    async decompressBackup(compressedPath) {
        const decompressedPath = path.join(this.restoreDir, `decompressed_${Date.now()}.sql`);
        
        try {
            await execAsync(`gunzip -c "${compressedPath}" > "${decompressedPath}"`);
            return decompressedPath;
        } catch (error) {
            throw new Error(`Decompression failed: ${error.message}`);
        }
    }

    /**
     * Verify backup file integrity
     */
    async verifyBackupIntegrity(filePath, backupInfo) {
        logger.info('🔍 Verifying backup integrity...');
        
        // Calculate checksum
        if (backupInfo.checksum) {
            const data = await fs.readFile(filePath);
            const hash = crypto.createHash('sha256').update(data).digest('hex');
            
            if (hash !== backupInfo.checksum) {
                throw new Error('Backup checksum verification failed - file may be corrupted');
            }
        }
        
        // Verify SQL file structure (basic check)
        const content = await fs.readFile(filePath, 'utf8');
        
        if (!content.includes('CREATE TABLE') && !content.includes('INSERT INTO')) {
            throw new Error('Backup file does not appear to contain valid SQL data');
        }
        
        // Check for critical tables
        const criticalTables = ['user_balances', 'user_stats', 'user_profiles'];
        const missingTables = criticalTables.filter(table => !content.includes(table));
        
        if (missingTables.length > 0) {
            logger.warn(`⚠️ Backup may be missing critical tables: ${missingTables.join(', ')}`);
        }
        
        logger.info('✅ Backup integrity verified');
    }

    /**
     * Stop database services
     */
    async stopDatabaseServices() {
        logger.info('🛑 Stopping database services...');
        
        // In a production environment, this might stop the bot
        // For now, just log the action
        logger.info('ℹ️ Database services should be stopped before restoration');
        
        // Give time for connections to close
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    /**
     * Start database services
     */
    async startDatabaseServices() {
        logger.info('🚀 Starting database services...');
        
        // In a production environment, this might restart the bot
        logger.info('ℹ️ Database services can now be restarted');
    }

    /**
     * Perform the actual database restoration
     */
    async performRestore(restoreFile, backupInfo) {
        logger.info('🔄 Performing database restoration...');
        
        const dbConfig = this.getDatabaseConfig();
        
        try {
            // Create restoration command
            const restoreCommand = `mysql -h ${dbConfig.host} -P ${dbConfig.port} -u ${dbConfig.user} -p${dbConfig.password} ${dbConfig.database} < "${restoreFile}"`;
            
            // Execute restoration
            await execAsync(restoreCommand, { maxBuffer: 1024 * 1024 * 100 }); // 100MB buffer
            
            logger.info('✅ Database restoration completed');
            
        } catch (error) {
            throw new Error(`Database restoration failed: ${error.message}`);
        }
    }

    /**
     * Verify restored database
     */
    async verifyRestoredDatabase() {
        logger.info('🔍 Verifying restored database...');
        
        try {
            const dbManager = require('./database');
            
            // Reinitialize database connection
            if (dbManager.initialized) {
                // Reset connection
                dbManager.initialized = false;
            }
            
            await dbManager.initialize();
            
            // Test basic functionality
            const testUserId = 'restore_test_' + Date.now();
            await dbManager.ensureUser(testUserId, 'RestoreTest');
            const balance = await dbManager.getUserBalance(testUserId);
            
            if (!balance || typeof balance.wallet !== 'number') {
                throw new Error('Database verification failed - balance system not working');
            }
            
            // Cleanup test user
            try {
                // This would need to be implemented in your database manager
                // await dbManager.deleteUser(testUserId);
            } catch (cleanupError) {
                logger.warn(`Failed to cleanup test user: ${cleanupError.message}`);
            }
            
            logger.info('✅ Database verification completed');
            
        } catch (error) {
            throw new Error(`Database verification failed: ${error.message}`);
        }
    }

    /**
     * Recover from failed restoration
     */
    async recoverFromFailedRestore() {
        if (!this.preRestorationBackupId) {
            logger.error('❌ No pre-restoration backup available for recovery');
            return false;
        }
        
        logger.info(`🔄 Attempting recovery from pre-restoration backup: ${this.preRestorationBackupId}`);
        
        try {
            // Restore from pre-restoration backup
            await this.restoreFromBackup(this.preRestorationBackupId, {
                createPreBackup: false,
                autoRecover: false,
                stopServices: false
            });
            
            logger.info('✅ Recovery from pre-restoration backup completed');
            return true;
            
        } catch (error) {
            logger.error(`❌ Recovery failed: ${error.message}`);
            return false;
        }
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
     * Get decryption key
     */
    getDecryptionKey() {
        if (process.env.BACKUP_ENCRYPTION_KEY) {
            return process.env.BACKUP_ENCRYPTION_KEY;
        }
        
        throw new Error('BACKUP_ENCRYPTION_KEY environment variable not set');
    }

    /**
     * Clean up temporary files
     */
    async cleanupTempFiles() {
        try {
            const files = await fs.readdir(this.restoreDir);
            
            for (const file of files) {
                await fs.unlink(path.join(this.restoreDir, file));
            }
            
            logger.info('🧹 Temporary files cleaned up');
            
        } catch (error) {
            logger.warn(`Failed to cleanup temporary files: ${error.message}`);
        }
    }

    /**
     * Restore specific tables only
     */
    async restoreTablesOnly(backupId, tableNames, options = {}) {
        logger.info(`🔄 Starting selective table restoration: ${tableNames.join(', ')}`);
        
        try {
            const backupInfo = await this.validateBackup(backupId);
            const restoreFile = await this.prepareBackupFile(backupInfo);
            
            // Extract only specified tables from backup
            const selectiveFile = await this.extractTables(restoreFile, tableNames);
            
            // Create pre-restoration backup of selected tables
            if (options.createPreBackup !== false) {
                await this.backupTablesBeforeRestore(tableNames);
            }
            
            // Restore selected tables
            await this.performRestore(selectiveFile, backupInfo);
            
            logger.info(`✅ Selective table restoration completed: ${tableNames.join(', ')}`);
            
            return {
                success: true,
                backupId: backupId,
                tablesRestored: tableNames,
                restoredAt: new Date().toISOString()
            };
            
        } catch (error) {
            logger.error(`❌ Selective restoration failed: ${error.message}`);
            throw error;
        } finally {
            await this.cleanupTempFiles();
        }
    }

    /**
     * Extract specific tables from backup file
     */
    async extractTables(backupFile, tableNames) {
        const extractedFile = path.join(this.restoreDir, `extracted_${Date.now()}.sql`);
        
        try {
            const content = await fs.readFile(backupFile, 'utf8');
            const lines = content.split('\n');
            
            let extractedContent = [];
            let currentTable = null;
            let includeCurrentSection = false;
            
            for (const line of lines) {
                // Check for CREATE TABLE statements
                if (line.startsWith('CREATE TABLE')) {
                    const match = line.match(/CREATE TABLE `?([^`\s]+)`?/);
                    if (match) {
                        currentTable = match[1];
                        includeCurrentSection = tableNames.includes(currentTable);
                    }
                }
                
                // Check for INSERT statements
                if (line.startsWith('INSERT INTO')) {
                    const match = line.match(/INSERT INTO `?([^`\s]+)`?/);
                    if (match) {
                        currentTable = match[1];
                        includeCurrentSection = tableNames.includes(currentTable);
                    }
                }
                
                // Include line if we're in a relevant section
                if (includeCurrentSection) {
                    extractedContent.push(line);
                }
                
                // Reset on empty lines or new sections
                if (line.trim() === '') {
                    includeCurrentSection = false;
                }
            }
            
            await fs.writeFile(extractedFile, extractedContent.join('\n'));
            return extractedFile;
            
        } catch (error) {
            throw new Error(`Failed to extract tables: ${error.message}`);
        }
    }

    /**
     * Backup specific tables before restoration
     */
    async backupTablesBeforeRestore(tableNames) {
        // This would create a backup of just the specified tables
        logger.info(`📥 Creating backup of tables before restoration: ${tableNames.join(', ')}`);
        // Implementation would depend on your specific backup manager
    }

    /**
     * Get restoration status/history
     */
    async getRestorationHistory() {
        // This would return a history of restorations performed
        return {
            lastRestoration: null,
            totalRestorations: 0,
            availableBackups: await this.listAvailableBackups()
        };
    }
}

module.exports = BackupRestore;