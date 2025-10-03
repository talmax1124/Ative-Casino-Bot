/**
 * Marriage Task Database Tables Creation
 * Creates all necessary tables for the 6 new marriage tasks
 */

const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');

class MarriageTaskTables {
    async createAllTables() {
        const tables = [
            // Task 1: House Design Quiz
            {
                name: 'marriage_house_quiz',
                query: `
                    CREATE TABLE IF NOT EXISTS marriage_house_quiz (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        session_id VARCHAR(255) UNIQUE NOT NULL,
                        marriage_id INT NOT NULL,
                        partner1_id VARCHAR(255) NOT NULL,
                        partner2_id VARCHAR(255) NOT NULL,
                        partner1_answers TEXT,
                        partner2_answers TEXT,
                        compatibility_score FLOAT,
                        completed BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        completed_at TIMESTAMP NULL,
                        INDEX idx_marriage (marriage_id),
                        INDEX idx_session (session_id)
                    )
                `
            },
            // Task 2: Connect 4 Games
            {
                name: 'marriage_connect4_games',
                query: `
                    CREATE TABLE IF NOT EXISTS marriage_connect4_games (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        session_id VARCHAR(255) UNIQUE NOT NULL,
                        marriage_id INT NOT NULL,
                        player1_id VARCHAR(255) NOT NULL,
                        player2_id VARCHAR(255) NOT NULL,
                        board_state TEXT NOT NULL,
                        current_turn VARCHAR(255) NOT NULL,
                        winner_id VARCHAR(255),
                        moves_history TEXT,
                        game_status ENUM('active', 'completed', 'abandoned') DEFAULT 'active',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        completed_at TIMESTAMP NULL,
                        INDEX idx_marriage (marriage_id),
                        INDEX idx_session (session_id)
                    )
                `
            },
            // Task 3: Love Letters
            {
                name: 'marriage_love_letters',
                query: `
                    CREATE TABLE IF NOT EXISTS marriage_love_letters (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        session_id VARCHAR(255) NOT NULL,
                        marriage_id INT NOT NULL,
                        sender_id VARCHAR(255) NOT NULL,
                        recipient_id VARCHAR(255) NOT NULL,
                        letter_content TEXT NOT NULL,
                        is_sent BOOLEAN DEFAULT FALSE,
                        is_read BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        sent_at TIMESTAMP NULL,
                        read_at TIMESTAMP NULL,
                        INDEX idx_marriage_session (marriage_id, session_id),
                        INDEX idx_sender (sender_id),
                        INDEX idx_recipient (recipient_id)
                    )
                `
            },
            // Task 4: Vacation Planning
            {
                name: 'marriage_vacation_plans',
                query: `
                    CREATE TABLE IF NOT EXISTS marriage_vacation_plans (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        session_id VARCHAR(255) NOT NULL,
                        marriage_id INT NOT NULL,
                        item_text VARCHAR(500) NOT NULL,
                        added_by VARCHAR(255) NOT NULL,
                        category VARCHAR(100),
                        is_completed BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_marriage_session (marriage_id, session_id)
                    )
                `
            },
            // Vacation plan sessions
            {
                name: 'marriage_vacation_sessions',
                query: `
                    CREATE TABLE IF NOT EXISTS marriage_vacation_sessions (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        session_id VARCHAR(255) UNIQUE NOT NULL,
                        marriage_id INT NOT NULL,
                        partner1_id VARCHAR(255) NOT NULL,
                        partner2_id VARCHAR(255) NOT NULL,
                        partner1_finished BOOLEAN DEFAULT FALSE,
                        partner2_finished BOOLEAN DEFAULT FALSE,
                        completed BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        completed_at TIMESTAMP NULL,
                        INDEX idx_marriage (marriage_id)
                    )
                `
            },
            // Task 5: Daily Check-ins
            {
                name: 'marriage_daily_checkins',
                query: `
                    CREATE TABLE IF NOT EXISTS marriage_daily_checkins (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        marriage_id INT NOT NULL,
                        user_id VARCHAR(255) NOT NULL,
                        checkin_type ENUM('morning', 'night') NOT NULL,
                        checkin_date DATE NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY unique_checkin (marriage_id, user_id, checkin_type, checkin_date),
                        INDEX idx_marriage_date (marriage_id, checkin_date)
                    )
                `
            },
            // Task 6: Virtual Pets
            {
                name: 'marriage_virtual_pets',
                query: `
                    CREATE TABLE IF NOT EXISTS marriage_virtual_pets (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        pet_id VARCHAR(255) UNIQUE NOT NULL,
                        marriage_id INT NOT NULL,
                        pet_name VARCHAR(100) DEFAULT 'Fluffy',
                        pet_type VARCHAR(50) DEFAULT 'cat',
                        hunger INT DEFAULT 50,
                        thirst INT DEFAULT 50,
                        cleanliness INT DEFAULT 50,
                        happiness INT DEFAULT 50,
                        lives_remaining INT DEFAULT 3,
                        is_alive BOOLEAN DEFAULT TRUE,
                        last_fed TIMESTAMP NULL,
                        last_watered TIMESTAMP NULL,
                        last_cleaned TIMESTAMP NULL,
                        last_petted TIMESTAMP NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        last_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_marriage (marriage_id),
                        INDEX idx_pet_id (pet_id)
                    )
                `
            },
            // Pet interaction logs
            {
                name: 'marriage_pet_interactions',
                query: `
                    CREATE TABLE IF NOT EXISTS marriage_pet_interactions (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        pet_id VARCHAR(255) NOT NULL,
                        user_id VARCHAR(255) NOT NULL,
                        action_type ENUM('feed', 'water', 'clean', 'pet') NOT NULL,
                        action_result VARCHAR(255),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_pet (pet_id),
                        INDEX idx_user (user_id)
                    )
                `
            }
        ];

        let successCount = 0;
        let failureCount = 0;

        // Initialize database if needed
        if (!dbManager.databaseAdapter) {
            await dbManager.initialize();
        }

        for (const table of tables) {
            try {
                if (dbManager.databaseAdapter && dbManager.databaseAdapter.pool) {
                    await dbManager.databaseAdapter.pool.execute(table.query);
                    logger.info(`Created/verified table: ${table.name}`);
                    successCount++;
                } else if (dbManager.databaseAdapter && dbManager.databaseAdapter.executeQuery) {
                    await dbManager.databaseAdapter.executeQuery(table.query);
                    logger.info(`Created/verified table: ${table.name}`);
                    successCount++;
                } else {
                    logger.warn(`Database adapter not available for table: ${table.name}`);
                    failureCount++;
                }
            } catch (error) {
                logger.error(`Failed to create table ${table.name}: ${error.message}`);
                failureCount++;
            }
        }

        if (failureCount === 0) {
            logger.info(`✅ Marriage task tables initialization complete. Successfully created/verified ${successCount} tables.`);
        } else {
            logger.warn(`⚠️ Marriage task tables initialization complete. Success: ${successCount}, Failed: ${failureCount}`);
        }
        return { success: successCount, failed: failureCount };
    }

    // Helper method to get a connection
    async getConnection() {
        if (dbManager.databaseAdapter && dbManager.databaseAdapter.pool) {
            return dbManager.databaseAdapter.pool;
        }
        throw new Error('Database connection not available');
    }
}

module.exports = new MarriageTaskTables();