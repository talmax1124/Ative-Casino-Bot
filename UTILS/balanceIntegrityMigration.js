/**
 * BALANCE INTEGRITY MIGRATION
 * Adds database constraints to prevent negative balances and ensure data integrity
 * 
 * CRITICAL: These constraints prevent balance corruption and fraud
 */

const logger = require('./logger');

class BalanceIntegrityMigration {
    constructor(databaseAdapter) {
        this.adapter = databaseAdapter;
        this.migrationVersion = '1.0.0';
    }

    /**
     * Apply balance integrity constraints to the database
     */
    async applyBalanceIntegrityConstraints() {
        try {
            logger.info('Applying balance integrity constraints...');

            // Get database connection
            const connection = await this.adapter.pool.getConnection();

            try {
                // Start transaction for atomic migration
                await connection.beginTransaction();

                // 1. Add CHECK constraints to prevent negative balances
                await this.addBalanceConstraints(connection);

                // 2. Add triggers for balance validation
                await this.addBalanceValidationTriggers(connection);

                // 3. Add audit table for balance changes
                await this.createBalanceAuditTable(connection);

                // 4. Add balance reconciliation functions
                await this.addReconciliationFunctions(connection);

                // Commit all changes
                await connection.commit();
                
                logger.info('✅ Balance integrity constraints applied successfully');
                return { success: true, message: 'Balance integrity constraints applied' };

            } catch (error) {
                // Rollback on error
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }

        } catch (error) {
            logger.error(`Failed to apply balance integrity constraints: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Add CHECK constraints to prevent negative balances
     */
    async addBalanceConstraints(connection) {
        // First, check which constraints already exist
        const existingConstraints = await this.getExistingConstraints(connection);
        
        const constraints = [
            {
                name: 'chk_wallet_non_negative',
                sql: `ALTER TABLE user_balances ADD CONSTRAINT chk_wallet_non_negative CHECK (wallet >= 0.00)`
            },
            {
                name: 'chk_bank_non_negative',
                sql: `ALTER TABLE user_balances ADD CONSTRAINT chk_bank_non_negative CHECK (bank >= 0.00)`
            },
            {
                name: 'chk_wallet_max_limit',
                sql: `ALTER TABLE user_balances ADD CONSTRAINT chk_wallet_max_limit CHECK (wallet <= 1000000000.00)`
            },
            {
                name: 'chk_bank_max_limit',
                sql: `ALTER TABLE user_balances ADD CONSTRAINT chk_bank_max_limit CHECK (bank <= 1000000000.00)`
            },
            {
                name: 'chk_wallet_precision',
                sql: `ALTER TABLE user_balances ADD CONSTRAINT chk_wallet_precision CHECK (wallet = ROUND(wallet, 2))`
            },
            {
                name: 'chk_bank_precision',
                sql: `ALTER TABLE user_balances ADD CONSTRAINT chk_bank_precision CHECK (bank = ROUND(bank, 2))`
            }
        ];

        for (const constraint of constraints) {
            // Skip if constraint already exists
            if (existingConstraints.includes(constraint.name)) {
                logger.debug(`Constraint ${constraint.name} already exists, skipping`);
                continue;
            }

            try {
                // For max limit constraints, check if data violates before adding
                if (constraint.name.includes('max_limit')) {
                    const violatingData = await this.checkDataViolatesMaxLimit(connection, constraint.name);
                    if (violatingData > 0) {
                        logger.warn(`Cannot add ${constraint.name}: ${violatingData} records exceed limit`);
                        await this.handleMaxLimitViolations(connection, constraint.name);
                        continue;
                    }
                }

                await connection.execute(constraint.sql);
                logger.info(`✅ Applied constraint: ${constraint.name}`);
            } catch (error) {
                if (error.code === 'ER_DUP_KEYNAME' || 
                    error.message.includes('Duplicate CHECK constraint name') ||
                    error.message.includes('Duplicate key name')) {
                    logger.debug(`Constraint ${constraint.name} already exists`);
                } else {
                    logger.warn(`Failed to add constraint ${constraint.name}: ${error.message}`);
                }
            }
        }
    }

    /**
     * Get existing constraints on user_balances table
     */
    async getExistingConstraints(connection) {
        try {
            const [rows] = await connection.execute(`
                SELECT CONSTRAINT_NAME 
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'user_balances' 
                AND CONSTRAINT_TYPE = 'CHECK'
            `);
            return rows.map(row => row.CONSTRAINT_NAME);
        } catch (error) {
            logger.debug(`Could not fetch existing constraints: ${error.message}`);
            return [];
        }
    }

    /**
     * Check if data violates max limit constraints
     */
    async checkDataViolatesMaxLimit(connection, constraintName) {
        try {
            let query;
            if (constraintName === 'chk_wallet_max_limit') {
                query = 'SELECT COUNT(*) as count FROM user_balances WHERE wallet > 1000000000.00';
            } else if (constraintName === 'chk_bank_max_limit') {
                query = 'SELECT COUNT(*) as count FROM user_balances WHERE bank > 1000000000.00';
            } else {
                return 0;
            }

            const [rows] = await connection.execute(query);
            return rows[0].count;
        } catch (error) {
            logger.error(`Error checking data violations for ${constraintName}: ${error.message}`);
            return 0;
        }
    }

    /**
     * Handle records that violate max limit constraints
     */
    async handleMaxLimitViolations(connection, constraintName) {
        try {
            let updateQuery;
            const maxLimit = 1000000000.00;
            
            if (constraintName === 'chk_wallet_max_limit') {
                updateQuery = `UPDATE user_balances SET wallet = ${maxLimit} WHERE wallet > ${maxLimit}`;
            } else if (constraintName === 'chk_bank_max_limit') {
                updateQuery = `UPDATE user_balances SET bank = ${maxLimit} WHERE bank > ${maxLimit}`;
            } else {
                return;
            }

            const [result] = await connection.execute(updateQuery);
            if (result.affectedRows > 0) {
                logger.info(`✅ Capped ${result.affectedRows} records to max limit for ${constraintName}`);
            }
        } catch (error) {
            logger.error(`Error handling max limit violations for ${constraintName}: ${error.message}`);
        }
    }

    /**
     * Add triggers for balance validation
     */
    async addBalanceValidationTriggers(connection) {
        // Drop existing triggers first
        const dropTriggers = [
            'DROP TRIGGER IF EXISTS before_balance_update',
            'DROP TRIGGER IF EXISTS after_balance_update'
        ];

        for (const drop of dropTriggers) {
            try {
                await connection.execute(drop);
            } catch (error) {
                // Ignore if trigger doesn't exist
            }
        }

        // Create BEFORE UPDATE trigger for validation
        const beforeTrigger = `
            CREATE TRIGGER before_balance_update 
            BEFORE UPDATE ON user_balances
            FOR EACH ROW
            BEGIN
                -- Prevent negative balances
                IF NEW.wallet < 0.00 THEN
                    SIGNAL SQLSTATE '45000' 
                    SET MESSAGE_TEXT = 'Wallet balance cannot be negative';
                END IF;
                
                IF NEW.bank < 0.00 THEN
                    SIGNAL SQLSTATE '45000' 
                    SET MESSAGE_TEXT = 'Bank balance cannot be negative';
                END IF;
                
                -- Round to 2 decimal places
                SET NEW.wallet = ROUND(NEW.wallet, 2);
                SET NEW.bank = ROUND(NEW.bank, 2);
                
                -- Update timestamp
                SET NEW.updated_at = CURRENT_TIMESTAMP;
            END`;

        // Create AFTER UPDATE trigger for audit logging
        const afterTrigger = `
            CREATE TRIGGER after_balance_update 
            AFTER UPDATE ON user_balances
            FOR EACH ROW
            BEGIN
                -- Log balance changes to audit table
                INSERT INTO balance_audit (
                    user_id, 
                    old_wallet, 
                    new_wallet, 
                    old_bank, 
                    new_bank,
                    wallet_change,
                    bank_change,
                    change_reason,
                    timestamp
                ) VALUES (
                    NEW.user_id,
                    OLD.wallet,
                    NEW.wallet,
                    OLD.bank,
                    NEW.bank,
                    NEW.wallet - OLD.wallet,
                    NEW.bank - OLD.bank,
                    'database_update',
                    CURRENT_TIMESTAMP
                );
            END`;

        try {
            await connection.execute(beforeTrigger);
            logger.info('✅ Created before_balance_update trigger');
        } catch (error) {
            logger.error(`Failed to create before trigger: ${error.message}`);
        }

        try {
            await connection.execute(afterTrigger);
            logger.info('✅ Created after_balance_update trigger');
        } catch (error) {
            logger.error(`Failed to create after trigger: ${error.message}`);
        }
    }

    /**
     * Create balance audit table for tracking all balance changes
     */
    async createBalanceAuditTable(connection) {
        const createAuditTable = `
            CREATE TABLE IF NOT EXISTS balance_audit (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                old_wallet DECIMAL(20,2) NOT NULL,
                new_wallet DECIMAL(20,2) NOT NULL,
                old_bank DECIMAL(20,2) NOT NULL,
                new_bank DECIMAL(20,2) NOT NULL,
                wallet_change DECIMAL(20,2) NOT NULL,
                bank_change DECIMAL(20,2) NOT NULL,
                change_reason VARCHAR(255) DEFAULT 'unknown',
                game_type VARCHAR(50) DEFAULT NULL,
                transaction_id VARCHAR(100) DEFAULT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_id (user_id),
                INDEX idx_timestamp (timestamp),
                INDEX idx_change_reason (change_reason)
            ) ENGINE=InnoDB CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

        try {
            await connection.execute(createAuditTable);
            logger.info('✅ Created balance_audit table');
        } catch (error) {
            logger.error(`Failed to create audit table: ${error.message}`);
        }
    }

    /**
     * Add stored procedures for balance reconciliation
     */
    async addReconciliationFunctions(connection) {
        // Drop existing procedures
        const dropProcedures = [
            'DROP PROCEDURE IF EXISTS ReconcileUserBalance',
            'DROP PROCEDURE IF EXISTS ValidateAllBalances'
        ];

        for (const drop of dropProcedures) {
            try {
                await connection.execute(drop);
            } catch (error) {
                // Ignore if procedure doesn't exist
            }
        }

        // Create balance reconciliation procedure
        const reconcileProcedure = `
            CREATE PROCEDURE ReconcileUserBalance(IN target_user_id VARCHAR(20))
            BEGIN
                DECLARE current_wallet DECIMAL(20,2);
                DECLARE current_bank DECIMAL(20,2);
                DECLARE calculated_wallet DECIMAL(20,2);
                DECLARE calculated_bank DECIMAL(20,2);
                
                -- Get current balances
                SELECT wallet, bank INTO current_wallet, current_bank 
                FROM user_balances 
                WHERE user_id = target_user_id;
                
                -- Calculate expected balances from audit trail
                SELECT 
                    COALESCE(1000.00 + SUM(wallet_change), 1000.00),
                    COALESCE(SUM(bank_change), 0.00)
                INTO calculated_wallet, calculated_bank
                FROM balance_audit 
                WHERE user_id = target_user_id;
                
                -- Return reconciliation report
                SELECT 
                    target_user_id as user_id,
                    current_wallet,
                    calculated_wallet,
                    current_bank,
                    calculated_bank,
                    (current_wallet - calculated_wallet) as wallet_discrepancy,
                    (current_bank - calculated_bank) as bank_discrepancy,
                    CASE 
                        WHEN ABS(current_wallet - calculated_wallet) > 0.01 
                        OR ABS(current_bank - calculated_bank) > 0.01 
                        THEN 'DISCREPANCY_FOUND' 
                        ELSE 'BALANCED' 
                    END as status;
            END`;

        // Create validation procedure for all balances
        const validateProcedure = `
            CREATE PROCEDURE ValidateAllBalances()
            BEGIN
                SELECT 
                    COUNT(*) as total_users,
                    COUNT(CASE WHEN wallet < 0 THEN 1 END) as negative_wallet_count,
                    COUNT(CASE WHEN bank < 0 THEN 1 END) as negative_bank_count,
                    COUNT(CASE WHEN wallet > 1000000000 THEN 1 END) as excessive_wallet_count,
                    COUNT(CASE WHEN bank > 1000000000 THEN 1 END) as excessive_bank_count,
                    MIN(wallet) as min_wallet,
                    MAX(wallet) as max_wallet,
                    MIN(bank) as min_bank,
                    MAX(bank) as max_bank,
                    SUM(wallet + bank) as total_economy_value
                FROM user_balances;
            END`;

        try {
            await connection.execute(reconcileProcedure);
            logger.info('✅ Created ReconcileUserBalance procedure');
        } catch (error) {
            logger.error(`Failed to create reconcile procedure: ${error.message}`);
        }

        try {
            await connection.execute(validateProcedure);
            logger.info('✅ Created ValidateAllBalances procedure');
        } catch (error) {
            logger.error(`Failed to create validate procedure: ${error.message}`);
        }
    }

    /**
     * Test the integrity constraints
     */
    async testConstraints() {
        try {
            const connection = await this.adapter.pool.getConnection();
            
            try {
                // Test negative balance prevention
                logger.info('Testing balance integrity constraints...');
                
                // This should fail due to negative balance constraint
                try {
                    await connection.execute(
                        'INSERT INTO user_balances (user_id, wallet, bank) VALUES (?, ?, ?)',
                        ['test_negative', -100.00, 0.00]
                    );
                    logger.error('❌ CONSTRAINT FAILURE: Negative balance was allowed!');
                } catch (error) {
                    if (error.message.includes('chk_wallet_non_negative') || 
                        error.message.includes('Wallet balance cannot be negative')) {
                        logger.info('✅ Negative balance constraint working correctly');
                    } else {
                        logger.error(`❌ Unexpected error: ${error.message}`);
                    }
                }
                
                // Clean up test data
                await connection.execute('DELETE FROM user_balances WHERE user_id = ?', ['test_negative']);
                
            } finally {
                connection.release();
            }
            
            return { success: true, message: 'Constraint tests completed' };
            
        } catch (error) {
            logger.error(`Constraint test failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}

module.exports = BalanceIntegrityMigration;