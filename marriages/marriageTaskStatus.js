/**
 * Marriage Task Status Manager - Rotation-Aware
 * Handles task completion tracking across different rotation weeks
 */

const dbManager = require('../UTILS/database');
const marriageTaskRotation = require('./marriageTaskRotation');
const logger = require('../UTILS/logger');

class MarriageTaskStatusManager {
    constructor() {
        this.tableName = 'marriage_task_completions_v2';
    }

    /**
     * Get the current rotation info for task tracking
     */
    getCurrentRotationInfo() {
        const currentTaskSet = marriageTaskRotation.getCurrentTaskSet();
        if (!currentTaskSet) {
            logger.error('Failed to get current task set for rotation info');
            return null;
        }

        const rotationConfig = marriageTaskRotation.getRotationConfig();
        if (!rotationConfig) {
            logger.error('Failed to get rotation config');
            return null;
        }

        // Calculate which rotation period we're in
        const now = new Date();
        const rotationStart = new Date(rotationConfig.rotationStartDate);
        const daysSinceStart = Math.floor((now - rotationStart) / (1000 * 60 * 60 * 24));
        const rotationPeriod = Math.max(0, Math.floor(daysSinceStart / rotationConfig.rotationIntervalDays));

        return {
            rotationId: currentTaskSet.id,
            rotationName: currentTaskSet.name,
            rotationIndex: currentTaskSet.rotation,
            rotationPeriod: rotationPeriod,
            periodStart: new Date(rotationStart.getTime() + (rotationPeriod * rotationConfig.rotationIntervalDays * 24 * 60 * 60 * 1000))
        };
    }

    /**
     * Get task completion status for current rotation
     */
    async getTaskStatus(marriageId) {
        try {
            const rotationInfo = this.getCurrentRotationInfo();
            if (!rotationInfo) {
                // Fallback to legacy system
                return await dbManager.getMarriageTaskStatus(marriageId);
            }

            // Check if using database adapter
            if (dbManager.usingAdapter && dbManager.databaseAdapter.pool) {
                // Ensure table exists
                await this.initializeTable();
                const query = `
                    SELECT task_number, completed_by, completed_at, completion_data, 
                           rotation_id, rotation_period
                    FROM ${this.tableName} 
                    WHERE marriage_id = ? 
                    AND rotation_id = ?
                `;

                const [rows] = await dbManager.databaseAdapter.pool.execute(query, [
                    marriageId, 
                    rotationInfo.rotationId
                ]);

                const tasks = {};
                rows.forEach(row => {
                    // For Week 5, map task numbers back to 1-6 for display
                    let displayTaskNumber = row.task_number;
                    if (rotationInfo.rotationId === 'week5') {
                        // Week 5 uses task numbers 17-22, map them back to 1-6
                        const week5TaskMapping = {
                            17: 1, // House Design
                            18: 2, // Connect 4
                            19: 3, // Love Letters
                            20: 4, // Vacation Planning
                            21: 5, // Daily Check-In
                            22: 6  // Virtual Pet
                        };
                        displayTaskNumber = week5TaskMapping[row.task_number] || row.task_number;
                    }
                    
                    tasks[`task${displayTaskNumber}`] = {
                        completed: true,
                        completedBy: row.completed_by,
                        completedAt: row.completed_at,
                        completionData: row.completion_data ? JSON.parse(row.completion_data) : null
                    };
                });

                return {
                    tasks,
                    rotationInfo,
                    weekStart: rotationInfo.periodStart
                };
            } else {
                // Fallback to legacy system for non-database setups
                logger.warn(`Marriage task status falling back to legacy system - no database adapter for marriage ${marriageId}`);
                return await dbManager.getMarriageTaskStatus(marriageId);
            }
        } catch (error) {
            logger.error(`Error getting rotation-aware task status: ${error.message}`);
            logger.warn(`Marriage task status falling back to legacy system due to error for marriage ${marriageId}`);
            // Fallback to legacy system
            return await dbManager.getMarriageTaskStatus(marriageId);
        }
    }

    /**
     * Mark task as completed for current rotation
     */
    async markTaskComplete(marriageId, taskNumber, completedBy, completionData = null) {
        try {
            const rotationInfo = this.getCurrentRotationInfo();
            if (!rotationInfo) {
                // Fallback to legacy system
                return await dbManager.markMarriageTaskComplete(marriageId, taskNumber, completedBy, completionData);
            }

            // Check if using database adapter
            if (dbManager.usingAdapter && dbManager.databaseAdapter.pool) {
                // Ensure table exists
                await this.initializeTable();
                const query = `
                    INSERT INTO ${this.tableName} 
                    (marriage_id, task_number, completed_by, rotation_id, rotation_name, 
                     rotation_period, period_start, completion_data, completed_at)
                    VALUES (?, ?, ?, ?, ?, 0, NOW(), ?, NOW())
                    ON DUPLICATE KEY UPDATE 
                        completed_by = VALUES(completed_by),
                        completion_data = VALUES(completion_data),
                        completed_at = NOW()
                `;

                await dbManager.databaseAdapter.pool.execute(query, [
                    marriageId,
                    taskNumber,
                    completedBy,
                    rotationInfo.rotationId,
                    rotationInfo.rotationName,
                    completionData ? JSON.stringify(completionData) : null
                ]);

                logger.info(`Task ${taskNumber} completed for marriage ${marriageId} in rotation ${rotationInfo.rotationName}`);
                return true;
            } else {
                // Fallback to legacy system
                return await dbManager.markMarriageTaskComplete(marriageId, taskNumber, completedBy, completionData);
            }
        } catch (error) {
            logger.error(`Error marking task complete with rotation: ${error.message}`);
            // Try fallback to legacy system
            try {
                return await dbManager.markMarriageTaskComplete(marriageId, taskNumber, completedBy, completionData);
            } catch (fallbackError) {
                logger.error(`Fallback also failed: ${fallbackError.message}`);
                return false;
            }
        }
    }

    /**
     * Get task completion history across all rotations
     */
    async getTaskHistory(marriageId) {
        try {
            if (dbManager.usingAdapter && dbManager.databaseAdapter.pool) {
                const query = `
                    SELECT task_number, completed_by, completed_at, completion_data,
                           rotation_id, rotation_name, rotation_period, period_start
                    FROM ${this.tableName}
                    WHERE marriage_id = ?
                    ORDER BY rotation_period DESC, task_number ASC
                `;

                const [rows] = await dbManager.databaseAdapter.pool.execute(query, [marriageId]);

                const history = {};
                rows.forEach(row => {
                    const rotationKey = `${row.rotation_id}_${row.rotation_period}`;
                    if (!history[rotationKey]) {
                        history[rotationKey] = {
                            rotationId: row.rotation_id,
                            rotationName: row.rotation_name,
                            rotationPeriod: row.rotation_period,
                            periodStart: row.period_start,
                            tasks: {}
                        };
                    }
                    
                    history[rotationKey].tasks[`task${row.task_number}`] = {
                        completed: true,
                        completedBy: row.completed_by,
                        completedAt: row.completed_at,
                        completionData: row.completion_data ? JSON.parse(row.completion_data) : null
                    };
                });

                return history;
            } else {
                logger.warn('Database adapter not available for task history');
                return {};
            }
        } catch (error) {
            logger.error(`Error getting task history: ${error.message}`);
            return {};
        }
    }

    /**
     * Initialize the rotation-aware table if needed
     */
    async initializeTable() {
        try {
            if (dbManager.usingAdapter && dbManager.databaseAdapter.pool) {
                const createTableQuery = `
                    CREATE TABLE IF NOT EXISTS ${this.tableName} (
                        id INT PRIMARY KEY AUTO_INCREMENT,
                        marriage_id VARCHAR(255) NOT NULL,
                        task_number INT NOT NULL,
                        completed_by VARCHAR(255) NOT NULL,
                        rotation_id VARCHAR(255) NOT NULL,
                        rotation_name VARCHAR(255) NOT NULL,
                        rotation_period INT NOT NULL,
                        period_start DATE NOT NULL,
                        completion_data TEXT,
                        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY unique_task (marriage_id, task_number, rotation_id, rotation_period),
                        INDEX idx_marriage_rotation (marriage_id, rotation_id, rotation_period)
                    )
                `;

                await dbManager.databaseAdapter.pool.execute(createTableQuery);
                logger.info('Rotation-aware marriage task completion table initialized');
                return true;
            }
        } catch (error) {
            logger.error(`Error initializing rotation-aware table: ${error.message}`);
            return false;
        }
    }

    /**
     * Migrate existing task completions to rotation-aware system
     */
    async migrateFromLegacySystem() {
        try {
            if (!dbManager.usingAdapter || !dbManager.databaseAdapter.pool) {
                logger.warn('Database adapter not available for migration');
                return false;
            }

            // First, ensure our table exists
            await this.initializeTable();

            // Get all legacy completions
            const legacyQuery = `
                SELECT marriage_id, task_number, completed_by, completed_at, completion_data, week_start
                FROM marriage_task_completions
            `;

            const [legacyRows] = await dbManager.databaseAdapter.pool.execute(legacyQuery);
            
            if (legacyRows.length === 0) {
                logger.info('No legacy task completions to migrate');
                return true;
            }

            let migrated = 0;
            for (const row of legacyRows) {
                // Try to determine which rotation this belongs to based on week_start
                // For now, assume it's Week 1 (week1) and period 0
                // This can be refined based on actual dates if needed
                
                const insertQuery = `
                    INSERT IGNORE INTO ${this.tableName}
                    (marriage_id, task_number, completed_by, rotation_id, rotation_name, 
                     rotation_period, period_start, completion_data, completed_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                await dbManager.databaseAdapter.pool.execute(insertQuery, [
                    row.marriage_id,
                    row.task_number,
                    row.completed_by,
                    'week1', // Default to week 1
                    'Week 1 - Getting to Know Each Other',
                    0, // Default to period 0
                    row.week_start || new Date(),
                    row.completion_data,
                    row.completed_at
                ]);

                migrated++;
            }

            logger.info(`Successfully migrated ${migrated} legacy task completions to rotation-aware system`);
            return true;
        } catch (error) {
            logger.error(`Error migrating from legacy system: ${error.message}`);
            return false;
        }
    }
}

module.exports = new MarriageTaskStatusManager();