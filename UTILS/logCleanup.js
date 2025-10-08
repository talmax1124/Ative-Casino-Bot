/**
 * Log Cleanup Utility
 * Clears all past logs on bot startup to keep only current run logs
 */

const fs = require('fs');
const path = require('path');

class LogCleanup {
    constructor() {
        this.logsDir = path.join(process.cwd(), 'logs');
    }

    /**
     * Clean up all log files on startup
     */
    cleanupLogs() {
        try {
            // Ensure logs directory exists
            if (!fs.existsSync(this.logsDir)) {
                fs.mkdirSync(this.logsDir, { recursive: true });
                console.log('✅ [LOG CLEANUP] Created logs directory');
                return;
            }

            // Get all files in logs directory
            const files = fs.readdirSync(this.logsDir);
            let deletedCount = 0;
            let totalSize = 0;

            // Delete all log files (including combined logs, error logs, and rotated logs)
            for (const file of files) {
                const filePath = path.join(this.logsDir, file);
                
                // Only delete actual log files (skip directories and non-log files)
                if (file.endsWith('.log') || file.includes('combined') || file.includes('error')) {
                    try {
                        // Get file size for logging
                        const stats = fs.statSync(filePath);
                        totalSize += stats.size;
                        
                        // Delete the file
                        fs.unlinkSync(filePath);
                        deletedCount++;
                    } catch (error) {
                        console.warn(`⚠️ [LOG CLEANUP] Could not delete ${file}: ${error.message}`);
                    }
                }
            }

            if (deletedCount > 0) {
                const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
                console.log(`✅ [LOG CLEANUP] Deleted ${deletedCount} log files (${sizeMB}MB freed)`);
            } else {
                console.log('✅ [LOG CLEANUP] No log files to clean');
            }

        } catch (error) {
            console.error(`❌ [LOG CLEANUP] Error during cleanup: ${error.message}`);
        }
    }

    /**
     * Get current log file sizes for monitoring
     */
    getLogStats() {
        try {
            if (!fs.existsSync(this.logsDir)) {
                return { totalFiles: 0, totalSize: 0 };
            }

            const files = fs.readdirSync(this.logsDir);
            let totalSize = 0;

            for (const file of files) {
                const filePath = path.join(this.logsDir, file);
                try {
                    const stats = fs.statSync(filePath);
                    totalSize += stats.size;
                } catch (error) {
                    // Skip files we can't read
                }
            }

            return {
                totalFiles: files.length,
                totalSize: totalSize,
                totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
            };
        } catch (error) {
            return { totalFiles: 0, totalSize: 0, error: error.message };
        }
    }
}

module.exports = new LogCleanup();