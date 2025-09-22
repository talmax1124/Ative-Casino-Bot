/**
 * Migration script to update ml_game_data table schema
 * Increases the precision of user_wealth_before and user_wealth_after columns
 */

const dbManager = require('./database');
const logger = require('./logger');

class MLTableMigration {
    async migrate() {
        try {
            logger.info('Starting ML table migration...');

            // Check if database adapter is available
            if (!dbManager.usingAdapter || !dbManager.databaseAdapter) {
                logger.warn('Database adapter not available for migration');
                return false;
            }

            // Check if table exists
            const tableExists = await this.checkTableExists();
            if (!tableExists) {
                logger.info('ml_game_data table does not exist, migration not needed');
                return true;
            }

            // Check current column structure
            const currentColumns = await this.getColumnInfo();
            const needsMigration = this.checkNeedsMigration(currentColumns);

            if (!needsMigration) {
                logger.info('ml_game_data table already has correct column types');
                return true;
            }

            // Perform the migration
            await this.performMigration();
            
            logger.info('ML table migration completed successfully');
            return true;

        } catch (error) {
            logger.error(`ML table migration failed: ${error.message}`);
            return false;
        }
    }

    async checkTableExists() {
        try {
            const query = `
                SELECT COUNT(*) as count 
                FROM information_schema.tables 
                WHERE table_name = 'ml_game_data'
            `;
            const result = await dbManager.databaseAdapter.executeQuery(query);
            return result[0].count > 0;
        } catch (error) {
            logger.warn(`Could not check if table exists: ${error.message}`);
            return false;
        }
    }

    async getColumnInfo() {
        try {
            const query = `
                SELECT column_name, data_type, numeric_precision, numeric_scale 
                FROM information_schema.columns 
                WHERE table_name = 'ml_game_data' 
                AND column_name IN ('user_wealth_before', 'user_wealth_after')
            `;
            const result = await dbManager.databaseAdapter.executeQuery(query);
            return result;
        } catch (error) {
            logger.warn(`Could not get column info: ${error.message}`);
            return [];
        }
    }

    checkNeedsMigration(columns) {
        for (const column of columns) {
            if ((column.column_name === 'user_wealth_before' || column.column_name === 'user_wealth_after') &&
                column.numeric_precision < 20) {
                return true;
            }
        }
        return false;
    }

    async performMigration() {
        try {
            logger.info('Modifying user_wealth_before column...');
            await dbManager.databaseAdapter.executeQuery(`
                ALTER TABLE ml_game_data 
                MODIFY COLUMN user_wealth_before DECIMAL(20,2) NOT NULL
            `);

            logger.info('Modifying user_wealth_after column...');
            await dbManager.databaseAdapter.executeQuery(`
                ALTER TABLE ml_game_data 
                MODIFY COLUMN user_wealth_after DECIMAL(20,2) NOT NULL
            `);

            logger.info('Column modifications completed');
        } catch (error) {
            throw new Error(`Migration queries failed: ${error.message}`);
        }
    }
}

module.exports = { MLTableMigration };