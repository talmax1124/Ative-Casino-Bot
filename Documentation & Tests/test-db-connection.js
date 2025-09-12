#!/usr/bin/env node

/**
 * Simple MariaDB Connection Test
 * Tests database connectivity with current environment variables
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function testConnection() {
    console.log('🔍 Testing MariaDB Connection...');
    console.log('=====================================');
    
    const config = {
        host: process.env.MARIADB_HOST || 'localhost',
        port: parseInt(process.env.MARIADB_PORT) || 3306,
        user: process.env.MARIADB_USER || 'root',
        password: process.env.MARIADB_PASSWORD || '',
        database: process.env.MARIADB_DATABASE || 'ative_casino',
        charset: 'utf8mb4',
        timezone: '+00:00'
    };
    
    console.log(`📡 Connection Details:`);
    console.log(`   Host: ${config.host}`);
    console.log(`   Port: ${config.port}`);
    console.log(`   User: ${config.user}`);
    console.log(`   Database: ${config.database}`);
    console.log(`   Password: ${config.password ? '[SET]' : '[NOT SET]'}`);
    
    let connection;
    try {
        console.log('\n🔗 Attempting connection...');
        connection = await mysql.createConnection(config);
        
        console.log('✅ Connection established successfully!');
        
        // Test basic query
        console.log('\n🧪 Testing basic query...');
        const [rows] = await connection.execute('SELECT 1 as test');
        console.log(`✅ Query result: ${rows[0].test}`);
        
        // Test database access
        console.log('\n📊 Testing database access...');
        const [tables] = await connection.execute('SHOW TABLES');
        console.log(`✅ Found ${tables.length} tables in database`);
        
        // Try to create a test table
        console.log('\n🔧 Testing table creation...');
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS connection_test (
                id INT AUTO_INCREMENT PRIMARY KEY,
                test_data VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Test table created successfully');
        
        // Insert test data
        await connection.execute(
            'INSERT INTO connection_test (test_data) VALUES (?)',
            ['Connection test successful']
        );
        console.log('✅ Test data inserted successfully');
        
        // Read test data
        const [testRows] = await connection.execute(
            'SELECT * FROM connection_test ORDER BY created_at DESC LIMIT 1'
        );
        console.log(`✅ Test data read: ${testRows[0].test_data}`);
        
        // Clean up
        await connection.execute('DROP TABLE connection_test');
        console.log('✅ Test table cleaned up');
        
        console.log('\n🎉 All database tests passed!');
        console.log('Your MariaDB connection is working properly.');
        
    } catch (error) {
        console.error('\n❌ Database connection failed:');
        console.error(`   Error: ${error.message}`);
        console.error(`   Code: ${error.code || 'Unknown'}`);
        
        if (error.code === 'ECONNREFUSED') {
            console.error('\n💡 Troubleshooting:');
            console.error('   - Check if MariaDB server is running');
            console.error('   - Verify host and port are correct');
            console.error('   - Check firewall settings');
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('\n💡 Troubleshooting:');
            console.error('   - Check username and password');
            console.error('   - Verify user has access to the database');
            console.error('   - Check user permissions');
        } else if (error.code === 'ER_BAD_DB_ERROR') {
            console.error('\n💡 Troubleshooting:');
            console.error('   - Check if database exists');
            console.error('   - Create database if needed');
        }
        
        process.exit(1);
        
    } finally {
        if (connection) {
            await connection.end();
            console.log('\n🔌 Connection closed');
        }
    }
}

// Run if called directly
if (require.main === module) {
    testConnection();
}

module.exports = { testConnection };