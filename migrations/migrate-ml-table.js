#!/usr/bin/env node

/**
 * Script to run ML table migration
 * Updates user_wealth columns to handle larger values
 */

const { MLTableMigration } = require('./UTILS/mlTableMigration');

async function runMigration() {
    console.log('🔄 Starting ML table migration...');
    
    const migration = new MLTableMigration();
    const success = await migration.migrate();
    
    if (success) {
        console.log('✅ Migration completed successfully');
        process.exit(0);
    } else {
        console.log('❌ Migration failed');
        process.exit(1);
    }
}

runMigration().catch(error => {
    console.error('💥 Migration script error:', error.message);
    process.exit(1);
});