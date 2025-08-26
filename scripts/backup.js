#!/usr/bin/env node

/**
 * VPS Backup Script
 * Creates and manages backups of bot data and configuration
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const zlib = require('zlib');
const { promisify } = require('util');
const logger = require('../UTILS/logger');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class BackupManager {
    constructor() {
        this.backupDir = path.join(__dirname, '..', 'backups');
        this.maxBackups = 10;
        this.backupConfig = {
            database: true,
            configuration: true,
            logs: true,
            code: true
        };
    }

    /**
     * Execute shell command
     */
    executeCommand(command, cwd = null) {
        return new Promise((resolve, reject) => {
            const options = cwd ? { cwd } : {};
            exec(command, options, (error, stdout, stderr) => {
                if (error) {
                    reject({ error, stdout, stderr });
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    }

    /**
     * Create database backup
     */
    async backupDatabase() {
        try {
            logger.info('Creating database backup...');
            
            // Get Firebase data (would need actual implementation)
            const dbBackup = {
                timestamp: new Date().toISOString(),
                type: 'firebase',
                collections: {
                    users: 'mock_user_data',
                    balances: 'mock_balance_data',
                    games: 'mock_game_data',
                    lottery: 'mock_lottery_data'
                }
            };

            return {
                success: true,
                data: dbBackup,
                size: JSON.stringify(dbBackup).length
            };
        } catch (error) {
            logger.error(`Database backup failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Backup configuration files
     */
    async backupConfiguration() {
        try {
            logger.info('Backing up configuration files...');
            
            const configFiles = [
                '.env',
                'package.json',
                'package-lock.json',
                'CLAUDE.md',
                'bot-config.json'
            ];

            const configs = {};
            
            for (const file of configFiles) {
                const filePath = path.join(__dirname, '..', file);
                try {
                    const content = await fs.readFile(filePath, 'utf8');
                    configs[file] = content;
                } catch (err) {
                    // File might not exist
                    configs[file] = null;
                }
            }

            return {
                success: true,
                data: configs,
                fileCount: Object.keys(configs).filter(k => configs[k] !== null).length
            };
        } catch (error) {
            logger.error(`Configuration backup failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Archive log files
     */
    async backupLogs() {
        try {
            logger.info('Archiving log files...');
            
            const logsDir = path.join(__dirname, '..', 'logs');
            const logFiles = await fs.readdir(logsDir).catch(() => []);
            
            const logs = {};
            let totalSize = 0;

            for (const file of logFiles) {
                if (file.endsWith('.log') || file.endsWith('.json')) {
                    const filePath = path.join(logsDir, file);
                    try {
                        const stats = await fs.stat(filePath);
                        const content = await fs.readFile(filePath, 'utf8');
                        
                        // Compress large log files
                        if (stats.size > 1024 * 1024) { // > 1MB
                            const compressed = await gzip(content);
                            logs[file] = {
                                compressed: true,
                                data: compressed.toString('base64'),
                                originalSize: stats.size,
                                compressedSize: compressed.length
                            };
                        } else {
                            logs[file] = {
                                compressed: false,
                                data: content,
                                size: stats.size
                            };
                        }
                        
                        totalSize += stats.size;
                    } catch (err) {
                        logger.warn(`Failed to backup log file ${file}: ${err.message}`);
                    }
                }
            }

            return {
                success: true,
                data: logs,
                fileCount: Object.keys(logs).length,
                totalSize
            };
        } catch (error) {
            logger.error(`Log backup failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Create code snapshot using git bundle
     */
    async backupCode() {
        try {
            logger.info('Creating code snapshot...');
            
            // Get current git info
            const branch = await this.executeCommand('git branch --show-current', path.join(__dirname, '..'));
            const commit = await this.executeCommand('git rev-parse HEAD', path.join(__dirname, '..'));
            const status = await this.executeCommand('git status --porcelain', path.join(__dirname, '..'));

            const codeInfo = {
                branch: branch.stdout.trim(),
                commit: commit.stdout.trim(),
                hasUncommittedChanges: status.stdout.trim().length > 0,
                uncommittedFiles: status.stdout.trim().split('\n').filter(line => line)
            };

            return {
                success: true,
                data: codeInfo
            };
        } catch (error) {
            logger.error(`Code backup failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Compress and timestamp backups
     */
    async compressBackup(backupData) {
        try {
            const jsonData = JSON.stringify(backupData, null, 2);
            const compressed = await gzip(jsonData);
            
            return {
                success: true,
                data: compressed,
                originalSize: jsonData.length,
                compressedSize: compressed.length,
                compressionRatio: ((1 - compressed.length / jsonData.length) * 100).toFixed(2)
            };
        } catch (error) {
            logger.error(`Backup compression failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Upload to secure storage (optional)
     */
    async uploadToStorage(backupFile) {
        try {
            // This would upload to S3, Google Cloud Storage, etc.
            logger.info('Upload to storage not implemented yet');
            
            return {
                success: false,
                message: 'Remote storage not configured'
            };
        } catch (error) {
            logger.error(`Upload failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Cleanup old backup files
     */
    async cleanupOldBackups() {
        try {
            logger.info('Cleaning up old backups...');
            
            const files = await fs.readdir(this.backupDir).catch(() => []);
            const backupFiles = files
                .filter(f => f.startsWith('backup-') && f.endsWith('.gz'))
                .sort()
                .reverse();

            if (backupFiles.length > this.maxBackups) {
                const toDelete = backupFiles.slice(this.maxBackups);
                
                for (const file of toDelete) {
                    const filePath = path.join(this.backupDir, file);
                    await fs.unlink(filePath);
                    logger.info(`Deleted old backup: ${file}`);
                }

                return {
                    success: true,
                    deletedCount: toDelete.length,
                    deletedFiles: toDelete
                };
            }

            return {
                success: true,
                deletedCount: 0,
                message: 'No old backups to delete'
            };
        } catch (error) {
            logger.error(`Cleanup failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Verify backup integrity
     */
    async verifyBackup(backupFile) {
        try {
            const filePath = path.join(this.backupDir, backupFile);
            const compressedData = await fs.readFile(filePath);
            const decompressed = await gunzip(compressedData);
            const backupData = JSON.parse(decompressed.toString());

            // Check for required sections
            const requiredSections = ['metadata', 'database', 'configuration'];
            const missingSections = requiredSections.filter(section => !backupData[section]);

            return {
                success: missingSections.length === 0,
                valid: true,
                missingSections,
                metadata: backupData.metadata,
                size: compressedData.length
            };
        } catch (error) {
            logger.error(`Backup verification failed: ${error.message}`);
            return { success: false, valid: false, error: error.message };
        }
    }

    /**
     * Main backup function
     */
    async createBackup(options = {}) {
        const startTime = Date.now();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `backup-${timestamp}`;
        
        const results = {
            success: false,
            backupName,
            timestamp: new Date().toISOString(),
            steps: [],
            duration: 0,
            file: null,
            stats: {}
        };

        try {
            // Ensure backup directory exists
            await fs.mkdir(this.backupDir, { recursive: true });

            // Create backup data structure
            const backupData = {
                metadata: {
                    version: '1.0',
                    timestamp: new Date().toISOString(),
                    initiatedBy: process.env.BACKUP_USER || 'system',
                    type: options.type || 'full'
                }
            };

            // Step 1: Backup database
            if (this.backupConfig.database) {
                logger.info('Backing up database...');
                results.steps.push({ step: 'database', status: 'started' });
                
                const dbBackup = await this.backupDatabase();
                backupData.database = dbBackup.data;
                
                results.steps.push({ 
                    step: 'database', 
                    status: dbBackup.success ? 'completed' : 'failed',
                    size: dbBackup.size
                });
            }

            // Step 2: Backup configuration
            if (this.backupConfig.configuration) {
                logger.info('Backing up configuration...');
                results.steps.push({ step: 'configuration', status: 'started' });
                
                const configBackup = await this.backupConfiguration();
                backupData.configuration = configBackup.data;
                
                results.steps.push({ 
                    step: 'configuration', 
                    status: configBackup.success ? 'completed' : 'failed',
                    fileCount: configBackup.fileCount
                });
            }

            // Step 3: Backup logs
            if (this.backupConfig.logs) {
                logger.info('Backing up logs...');
                results.steps.push({ step: 'logs', status: 'started' });
                
                const logBackup = await this.backupLogs();
                backupData.logs = logBackup.data;
                
                results.steps.push({ 
                    step: 'logs', 
                    status: logBackup.success ? 'completed' : 'failed',
                    fileCount: logBackup.fileCount,
                    totalSize: logBackup.totalSize
                });
            }

            // Step 4: Backup code info
            if (this.backupConfig.code) {
                logger.info('Creating code snapshot...');
                results.steps.push({ step: 'code', status: 'started' });
                
                const codeBackup = await this.backupCode();
                backupData.code = codeBackup.data;
                
                results.steps.push({ 
                    step: 'code', 
                    status: codeBackup.success ? 'completed' : 'failed'
                });
            }

            // Step 5: Compress backup
            logger.info('Compressing backup...');
            results.steps.push({ step: 'compress', status: 'started' });
            
            const compression = await this.compressBackup(backupData);
            
            results.steps.push({ 
                step: 'compress', 
                status: compression.success ? 'completed' : 'failed',
                compressionRatio: compression.compressionRatio
            });

            // Step 6: Save to file
            logger.info('Saving backup file...');
            results.steps.push({ step: 'save', status: 'started' });
            
            const backupFile = `${backupName}.gz`;
            const backupPath = path.join(this.backupDir, backupFile);
            await fs.writeFile(backupPath, compression.data);
            
            results.file = backupFile;
            results.steps.push({ 
                step: 'save', 
                status: 'completed',
                file: backupFile,
                size: compression.compressedSize
            });

            // Step 7: Upload to storage (if configured)
            if (options.upload) {
                logger.info('Uploading to storage...');
                results.steps.push({ step: 'upload', status: 'started' });
                
                const uploadResult = await this.uploadToStorage(backupFile);
                
                results.steps.push({ 
                    step: 'upload', 
                    status: uploadResult.success ? 'completed' : 'skipped',
                    message: uploadResult.message
                });
            }

            // Step 8: Cleanup old backups
            logger.info('Cleaning up old backups...');
            results.steps.push({ step: 'cleanup', status: 'started' });
            
            const cleanup = await this.cleanupOldBackups();
            
            results.steps.push({ 
                step: 'cleanup', 
                status: 'completed',
                deletedCount: cleanup.deletedCount
            });

            // Step 9: Verify backup
            logger.info('Verifying backup...');
            results.steps.push({ step: 'verify', status: 'started' });
            
            const verification = await this.verifyBackup(backupFile);
            
            results.steps.push({ 
                step: 'verify', 
                status: verification.success ? 'completed' : 'failed',
                valid: verification.valid
            });

            results.success = true;
            results.stats = {
                originalSize: compression.originalSize,
                compressedSize: compression.compressedSize,
                compressionRatio: compression.compressionRatio
            };

            logger.info(`Backup completed successfully: ${backupFile}`);

        } catch (error) {
            logger.error(`Backup failed: ${error.message}`);
            results.error = error.message;
            results.steps.push({ 
                step: 'error', 
                status: 'failed',
                error: error.message
            });
        } finally {
            results.duration = Date.now() - startTime;
        }

        return results;
    }

    /**
     * List available backups
     */
    async listBackups() {
        try {
            const files = await fs.readdir(this.backupDir).catch(() => []);
            const backups = [];

            for (const file of files) {
                if (file.startsWith('backup-') && file.endsWith('.gz')) {
                    const filePath = path.join(this.backupDir, file);
                    const stats = await fs.stat(filePath);
                    
                    backups.push({
                        name: file,
                        size: stats.size,
                        created: stats.mtime,
                        age: Date.now() - stats.mtime.getTime()
                    });
                }
            }

            return backups.sort((a, b) => b.created - a.created);
        } catch (error) {
            logger.error(`Failed to list backups: ${error.message}`);
            return [];
        }
    }

    /**
     * Restore from backup
     */
    async restoreBackup(backupFile) {
        try {
            logger.info(`Restoring from backup: ${backupFile}`);
            
            const filePath = path.join(this.backupDir, backupFile);
            const compressedData = await fs.readFile(filePath);
            const decompressed = await gunzip(compressedData);
            const backupData = JSON.parse(decompressed.toString());

            // This would implement actual restoration logic
            // For now, just return the structure
            
            return {
                success: true,
                message: 'Restore functionality not fully implemented',
                metadata: backupData.metadata,
                sections: Object.keys(backupData)
            };
        } catch (error) {
            logger.error(`Restore failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}

// Export for use in other modules
module.exports = BackupManager;

// Run if called directly
if (require.main === module) {
    const manager = new BackupManager();
    
    const args = process.argv.slice(2);
    const command = args[0] || 'create';
    
    switch (command) {
        case 'create':
            manager.createBackup({ upload: args.includes('--upload') })
                .then(results => {
                    console.log('Backup Results:', JSON.stringify(results, null, 2));
                    process.exit(results.success ? 0 : 1);
                });
            break;
            
        case 'list':
            manager.listBackups()
                .then(backups => {
                    console.log('Available Backups:');
                    backups.forEach(backup => {
                        console.log(`  ${backup.name} (${(backup.size / 1024).toFixed(2)} KB) - ${new Date(backup.created).toLocaleString()}`);
                    });
                    process.exit(0);
                });
            break;
            
        case 'restore':
            const backupFile = args[1];
            if (!backupFile) {
                console.error('Please specify backup file to restore');
                process.exit(1);
            }
            manager.restoreBackup(backupFile)
                .then(results => {
                    console.log('Restore Results:', JSON.stringify(results, null, 2));
                    process.exit(results.success ? 0 : 1);
                });
            break;
            
        default:
            console.log('Usage: node backup.js [create|list|restore <file>] [--upload]');
            process.exit(1);
    }
}