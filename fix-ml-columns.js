#!/usr/bin/env node

/**
 * Quick fix script to update ML table column sizes
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

async function fixMLColumns() {
    let connection;
    try {
        console.log('Connecting to database...');
        connection = await mysql.createConnection({
            host: process.env.DATABASE_HOST,
            user: process.env.DATABASE_USER,
            password: process.env.DATABASE_PASSWORD,
            database: process.env.DATABASE_NAME,
            charset: 'utf8mb4'
        });

        console.log('Connected to database');

        // Check if table exists
        const [tables] = await connection.execute(`
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_name = 'ml_game_data' AND table_schema = ?
        `, [process.env.DATABASE_NAME]);

        if (tables[0].count === 0) {
            console.log('ml_game_data table does not exist, no migration needed');
            return;
        }

        // Check current column structure
        const [columns] = await connection.execute(`
            SELECT column_name, data_type, numeric_precision, numeric_scale 
            FROM information_schema.columns 
            WHERE table_name = 'ml_game_data' 
            AND table_schema = ?
            AND column_name IN ('user_wealth_before', 'user_wealth_after')
        `, [process.env.DATABASE_NAME]);

        let needsMigration = false;
        for (const column of columns) {
            if (column.numeric_precision < 20) {
                needsMigration = true;
                console.log(`Column ${column.column_name} has precision ${column.numeric_precision}, needs migration`);
            }
        }

        if (!needsMigration) {
            console.log('Columns already have correct precision');
            return;
        }

        // Perform migration
        console.log('Updating user_wealth_before column...');
        await connection.execute(`
            ALTER TABLE ml_game_data 
            MODIFY COLUMN user_wealth_before DECIMAL(20,2) NOT NULL
        `);

        console.log('Updating user_wealth_after column...');
        await connection.execute(`
            ALTER TABLE ml_game_data 
            MODIFY COLUMN user_wealth_after DECIMAL(20,2) NOT NULL
        `);

        console.log('✅ Migration completed successfully');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

fixMLColumns();