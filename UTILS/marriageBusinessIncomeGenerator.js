/**
 * Marriage Business Income Generator
 * Automatically generates hourly income for all active marriage businesses
 */

const dbManager = require('./databaseAdapter');
const logger = require('./logger');

class MarriageBusinessIncomeGenerator {
    constructor() {
        this.intervalId = null;
        this.isRunning = false;
        this.intervalMs = 60 * 60 * 1000; // 1 hour in milliseconds
    }

    /**
     * Start the income generation system
     */
    start() {
        if (this.isRunning) {
            logger.warn('Marriage business income generator is already running');
            return;
        }

        logger.info('Starting marriage business income generator...');
        
        // Run immediately on start
        this.generateIncome();
        
        // Then run every hour
        this.intervalId = setInterval(() => {
            this.generateIncome();
        }, this.intervalMs);
        
        this.isRunning = true;
        logger.info(`Marriage business income generator started - running every ${this.intervalMs / 1000 / 60} minutes`);
    }

    /**
     * Stop the income generation system
     */
    stop() {
        if (!this.isRunning) {
            logger.warn('Marriage business income generator is not running');
            return;
        }

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.isRunning = false;
        logger.info('Marriage business income generator stopped');
    }

    /**
     * Generate income for all eligible businesses
     */
    async generateIncome() {
        try {
            logger.info('Generating marriage business income...');
            
            const result = await dbManager.generateMarriageBusinessIncome();
            
            if (result.success) {
                if (result.processed > 0) {
                    logger.info(`Marriage business income generated: ${result.processed} businesses processed, total earnings: ${result.totalEarnings.toLocaleString()}`);
                } else {
                    logger.debug('No marriage businesses eligible for income generation at this time');
                }
            } else {
                logger.error(`Failed to generate marriage business income: ${result.error}`);
            }

        } catch (error) {
            logger.error(`Error in marriage business income generation: ${error.message}`);
        }
    }

    /**
     * Get the current status of the generator
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            intervalMs: this.intervalMs,
            nextRunIn: this.isRunning ? this.intervalMs : null
        };
    }

    /**
     * Force a manual income generation run
     */
    async forceGeneration() {
        logger.info('Forcing manual marriage business income generation...');
        return await this.generateIncome();
    }
}

// Export singleton instance
module.exports = new MarriageBusinessIncomeGenerator();