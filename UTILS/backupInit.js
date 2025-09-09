/**
 * ATIVE Casino Bot - Backup System Initialization
 * Easy integration for the main bot file
 */

const logger = require('./logger');
const BackupScheduler = require('./backupScheduler');

class BackupInit {
    constructor() {
        this.scheduler = null;
        this.initialized = false;
    }

    /**
     * Initialize the backup system
     * Call this in your main bot initialization
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            logger.info('🛡️ Initializing Backup System...');

            // Create scheduler instance
            this.scheduler = new BackupScheduler();

            // Determine cloud configuration
            const cloudConfig = this.getCloudConfig();

            // Initialize scheduler with cloud config
            await this.scheduler.initialize(cloudConfig);

            this.initialized = true;
            logger.info('✅ Backup System initialized successfully');

            // Log backup system status
            const status = this.scheduler.getStatus();
            logger.info(`📊 Backup System Status - Schedules: ${Object.keys(status.schedules).length}, Cloud: ${status.cloudEnabled ? status.cloudProvider : 'disabled'}`);

        } catch (error) {
            logger.error(`❌ Failed to initialize Backup System: ${error.message}`);
            logger.warn('⚠️ Backup System will be disabled. Bot will continue without automated backups.');
        }
    }

    /**
     * Get cloud configuration from environment variables
     */
    getCloudConfig() {
        // Check for Dropbox configuration (simplest to set up)
        if (process.env.DROPBOX_ACCESS_TOKEN) {
            return {
                provider: 'dropbox',
                accessToken: process.env.DROPBOX_ACCESS_TOKEN
            };
        }

        // Check for webhook configuration (generic HTTP upload)
        if (process.env.BACKUP_WEBHOOK_URL) {
            return {
                provider: 'webhook',
                uploadUrl: process.env.BACKUP_WEBHOOK_URL,
                headers: process.env.BACKUP_WEBHOOK_HEADERS ? JSON.parse(process.env.BACKUP_WEBHOOK_HEADERS) : {}
            };
        }

        // Check for AWS S3 configuration
        if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_S3_BUCKET) {
            return {
                provider: 'aws',
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                bucket: process.env.AWS_S3_BUCKET,
                region: process.env.AWS_REGION || 'us-east-1'
            };
        }

        // Check for Google Cloud configuration
        if (process.env.GOOGLE_CLOUD_PROJECT_ID && process.env.GOOGLE_CLOUD_KEY_FILE && process.env.GOOGLE_CLOUD_BUCKET) {
            return {
                provider: 'gcp',
                projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
                keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
                bucketName: process.env.GOOGLE_CLOUD_BUCKET
            };
        }

        // Check for Azure configuration
        if (process.env.AZURE_STORAGE_ACCOUNT && process.env.AZURE_STORAGE_KEY && process.env.AZURE_CONTAINER) {
            return {
                provider: 'azure',
                accountName: process.env.AZURE_STORAGE_ACCOUNT,
                accountKey: process.env.AZURE_STORAGE_KEY,
                containerName: process.env.AZURE_CONTAINER
            };
        }

        // No cloud configuration found
        return null;
    }

    /**
     * Trigger manual backup (for emergency situations)
     */
    async createEmergencyBackup() {
        if (!this.initialized || !this.scheduler) {
            throw new Error('Backup system not initialized');
        }

        logger.info('🚨 Creating emergency backup...');
        return await this.scheduler.runManualBackup('full');
    }

    /**
     * Get backup system status
     */
    getStatus() {
        if (!this.initialized || !this.scheduler) {
            return {
                initialized: false,
                error: 'Backup system not initialized'
            };
        }

        return this.scheduler.getStatus();
    }

    /**
     * Shutdown backup system gracefully
     */
    shutdown() {
        if (this.scheduler) {
            this.scheduler.stop();
            logger.info('🛑 Backup System shutdown complete');
        }
        this.initialized = false;
    }
}

// Export singleton instance
module.exports = new BackupInit();