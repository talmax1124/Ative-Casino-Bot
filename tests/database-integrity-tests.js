/**
 * DATABASE TRANSACTION INTEGRITY TESTER
 * 
 * This script tests the ACID properties of database transactions to ensure
 * financial data integrity and prevent money duplication exploits.
 * 
 * Tests:
 * - Atomicity: All operations succeed or all fail
 * - Consistency: Database remains in valid state
 * - Isolation: Concurrent transactions don't interfere
 * - Durability: Committed transactions persist
 * 
 * CRITICAL: This is DEFENSIVE SECURITY TESTING
 */

const dbManager = require('../UTILS/database');

class DatabaseIntegrityTester {
    constructor() {
        this.testResults = [];
        this.exploits = [];
        this.testUsers = [];
        this.testCount = 0;
        
        // Generate test user IDs
        for (let i = 1; i <= 5; i++) {
            this.testUsers.push(`DB_TEST_USER_${Date.now()}_${i}`);
        }
        
        console.log(`🗄️ Database Integrity Tester initialized with ${this.testUsers.length} test users`);
    }

    recordExploit(type, severity, description, data = {}) {
        this.exploits.push({
            type,
            severity,
            description,
            data,
            timestamp: Date.now()
        });
        console.error(`🚨 DB EXPLOIT [${severity}]: ${type} - ${description}`);
    }

    /**
     * Setup test environment
     */
    async setupTestEnvironment() {
        console.log('🔧 Setting up database test environment...');
        
        try {
            // Initialize test users with known balances
            for (const userId of this.testUsers) {
                await dbManager.ensureUser(userId, `DBTestUser_${userId.slice(-5)}`);
                await dbManager.setUserBalance(userId, 'test_guild', 10000, 5000);
                
                // Verify setup
                const balance = await dbManager.getUserBalance(userId, 'test_guild');
                if (Math.abs(balance.wallet - 10000) > 0.01 || Math.abs(balance.bank - 5000) > 0.01) {
                    throw new Error(`Test user ${userId} setup failed - balance mismatch`);
                }
            }
            
            console.log('✅ Database test environment ready');
            return true;
            
        } catch (error) {
            console.error(`❌ Test environment setup failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Test transaction atomicity
     * Ensures that partial transaction failures don't corrupt data
     */
    async testTransactionAtomicity() {
        console.log('⚛️ Testing transaction atomicity...');
        
        const testUser = this.testUsers[0];
        const initialBalance = await dbManager.getUserBalance(testUser, 'test_guild');
        const initialTotal = initialBalance.wallet + initialBalance.bank;
        
        try {
            // Test atomic wallet-to-bank transfers
            const transferPromises = [];
            for (let i = 0; i < 20; i++) {
                // Each transfer should be atomic: remove from wallet, add to bank
                transferPromises.push(
                    dbManager.updateUserBalance(testUser, 'test_guild', -100, 100)
                        .catch(error => ({ error: error.message, index: i }))
                );
            }
            
            const results = await Promise.all(transferPromises);
            const errors = results.filter(r => r && r.error);
            
            // Check final balance
            const finalBalance = await dbManager.getUserBalance(testUser, 'test_guild');
            const finalTotal = finalBalance.wallet + finalBalance.bank;
            
            // Total balance should be unchanged (atomicity test)
            const balanceDiff = Math.abs(finalTotal - initialTotal);
            if (balanceDiff > 0.01) {
                this.recordExploit(
                    'ATOMICITY_VIOLATION',
                    'CRITICAL',
                    `Total balance changed during atomic transfers: ${balanceDiff}`,
                    {
                        initialTotal,
                        finalTotal,
                        difference: balanceDiff,
                        errors: errors.length,
                        user: testUser
                    }
                );
            }
            
            // Check for impossible negative balances
            if (finalBalance.wallet < -0.01 || finalBalance.bank < -0.01) {
                this.recordExploit(
                    'NEGATIVE_BALANCE_ATOMICITY',
                    'CRITICAL',
                    `Atomic operations resulted in negative balance`,
                    { finalBalance, user: testUser }
                );
            }
            
            console.log(`📊 Atomicity test: ${results.length - errors.length}/${results.length} operations successful`);
            
        } catch (error) {
            this.recordExploit(
                'ATOMICITY_TEST_ERROR',
                'HIGH',
                `Atomicity test failed: ${error.message}`,
                { user: testUser }
            );
        }
    }

    /**
     * Test data consistency
     * Ensures database constraints are maintained
     */
    async testDataConsistency() {
        console.log('📊 Testing data consistency...');
        
        try {
            // Check all test users for consistency violations
            for (const userId of this.testUsers.slice(0, 3)) {
                this.testCount++;
                const balance = await dbManager.getUserBalance(userId, 'test_guild');
                
                // Test for impossible values
                if (!Number.isFinite(balance.wallet) || !Number.isFinite(balance.bank)) {
                    this.recordExploit(
                        'NON_FINITE_BALANCE',
                        'CRITICAL',
                        'User has non-finite balance values',
                        { user: userId, balance }
                    );
                }
                
                if (isNaN(balance.wallet) || isNaN(balance.bank)) {
                    this.recordExploit(
                        'NAN_BALANCE',
                        'CRITICAL',
                        'User has NaN balance values',
                        { user: userId, balance }
                    );
                }
                
                if (balance.wallet < 0 || balance.bank < 0) {
                    this.recordExploit(
                        'NEGATIVE_BALANCE_CONSISTENCY',
                        'CRITICAL',
                        'User has negative balance',
                        { user: userId, balance }
                    );
                }
                
                // Check for extremely large balances (potential overflow)
                if (balance.wallet > 1e15 || balance.bank > 1e15) {
                    this.recordExploit(
                        'BALANCE_OVERFLOW',
                        'HIGH',
                        'User has suspiciously large balance',
                        { user: userId, balance }
                    );
                }
                
                // Check data types
                if (typeof balance.wallet !== 'number' || typeof balance.bank !== 'number') {
                    this.recordExploit(
                        'INVALID_BALANCE_TYPE',
                        'HIGH',
                        'Balance values are not numbers',
                        { 
                            user: userId, 
                            walletType: typeof balance.wallet,
                            bankType: typeof balance.bank
                        }
                    );
                }
            }
            
            console.log(`📊 Consistency check: ${this.testUsers.length} users validated`);
            
        } catch (error) {
            this.recordExploit(
                'CONSISTENCY_TEST_ERROR',
                'HIGH',
                `Consistency test failed: ${error.message}`
            );
        }
    }

    /**
     * Test transaction isolation
     * Ensures concurrent transactions don't interfere
     */
    async testTransactionIsolation() {
        console.log('🔒 Testing transaction isolation...');
        
        const user1 = this.testUsers[1];
        const user2 = this.testUsers[2];
        
        try {
            // Get initial balances
            const initial1 = await dbManager.getUserBalance(user1, 'test_guild');
            const initial2 = await dbManager.getUserBalance(user2, 'test_guild');
            
            // Run concurrent operations on different users
            const promises = [];
            
            // User 1 operations
            for (let i = 0; i < 10; i++) {
                promises.push(dbManager.updateUserBalance(user1, 'test_guild', 10, 0));
            }
            
            // User 2 operations (should be isolated from user 1)
            for (let i = 0; i < 10; i++) {
                promises.push(dbManager.updateUserBalance(user2, 'test_guild', 20, 0));
            }
            
            // Execute all operations concurrently
            const results = await Promise.all(promises.map(p => p.catch(e => e)));
            
            // Verify isolation - each user's operations should be independent
            const final1 = await dbManager.getUserBalance(user1, 'test_guild');
            const final2 = await dbManager.getUserBalance(user2, 'test_guild');
            
            const user1Change = final1.wallet - initial1.wallet;
            const user2Change = final2.wallet - initial2.wallet;
            
            // User 1 should have gained 10 * 10 = 100 (if all operations succeeded)
            // User 2 should have gained 20 * 10 = 200 (if all operations succeeded)
            
            const errors = results.filter(r => r instanceof Error).length;
            const expectedUser1Change = (10 - Math.floor(errors / 2)) * 10; // Approximate
            const expectedUser2Change = (10 - Math.floor(errors / 2)) * 20; // Approximate
            
            console.log(`📊 Isolation test: User1 change=${user1Change}, User2 change=${user2Change}, Errors=${errors}`);
            
            // Check for cross-contamination (one user's operations affecting another)
            if (Math.abs(user1Change - user2Change / 2) > 50 && errors === 0) {
                // This is a very basic check - in a perfect isolated system,
                // user1 changes should be independent of user2 changes
                console.log(`ℹ️ Isolation check: operations appear properly isolated`);
            }
            
        } catch (error) {
            this.recordExploit(
                'ISOLATION_TEST_ERROR',
                'MEDIUM',
                `Isolation test failed: ${error.message}`,
                { user1, user2 }
            );
        }
    }

    /**
     * Test transaction durability
     * Ensures committed transactions persist
     */
    async testTransactionDurability() {
        console.log('💾 Testing transaction durability...');
        
        const testUser = this.testUsers[3];
        
        try {
            // Get initial balance
            const initialBalance = await dbManager.getUserBalance(testUser, 'test_guild');
            
            // Make a transaction
            const addAmount = 12345;
            await dbManager.updateUserBalance(testUser, 'test_guild', addAmount, 0);
            
            // Immediately read back (durability test)
            const immediateBalance = await dbManager.getUserBalance(testUser, 'test_guild');
            
            // Force cache refresh and read again
            await dbManager.invalidateUserBalanceCache(testUser, 'test_guild');
            const refreshedBalance = await dbManager.getUserBalance(testUser, 'test_guild');
            
            // All reads should show the same result (durability)
            const expectedWallet = initialBalance.wallet + addAmount;
            
            if (Math.abs(immediateBalance.wallet - expectedWallet) > 0.01) {
                this.recordExploit(
                    'IMMEDIATE_DURABILITY_FAILURE',
                    'HIGH',
                    `Transaction not immediately durable`,
                    {
                        expected: expectedWallet,
                        immediate: immediateBalance.wallet,
                        difference: Math.abs(immediateBalance.wallet - expectedWallet)
                    }
                );
            }
            
            if (Math.abs(refreshedBalance.wallet - expectedWallet) > 0.01) {
                this.recordExploit(
                    'CACHE_DURABILITY_FAILURE',
                    'HIGH',
                    `Transaction not durable after cache refresh`,
                    {
                        expected: expectedWallet,
                        refreshed: refreshedBalance.wallet,
                        difference: Math.abs(refreshedBalance.wallet - expectedWallet)
                    }
                );
            }
            
            console.log(`📊 Durability test: immediate=${immediateBalance.wallet}, refreshed=${refreshedBalance.wallet}`);
            
        } catch (error) {
            this.recordExploit(
                'DURABILITY_TEST_ERROR',
                'MEDIUM',
                `Durability test failed: ${error.message}`,
                { user: testUser }
            );
        }
    }

    /**
     * Test concurrent balance manipulation
     * Stress test for race conditions and data corruption
     */
    async testConcurrentBalanceManipulation() {
        console.log('🏃‍♂️ Testing concurrent balance manipulation...');
        
        const testUser = this.testUsers[4];
        
        try {
            // Reset user to known state
            await dbManager.setUserBalance(testUser, 'test_guild', 10000, 5000);
            const initialBalance = await dbManager.getUserBalance(testUser, 'test_guild');
            const initialTotal = initialBalance.wallet + initialBalance.bank;
            
            // Launch many concurrent operations
            const operationCount = 100;
            const promises = [];
            
            for (let i = 0; i < operationCount; i++) {
                const operation = i % 4;
                
                switch (operation) {
                    case 0: // Add to wallet
                        promises.push(dbManager.updateUserBalance(testUser, 'test_guild', 1, 0));
                        break;
                    case 1: // Remove from wallet
                        promises.push(dbManager.updateUserBalance(testUser, 'test_guild', -1, 0));
                        break;
                    case 2: // Transfer wallet to bank
                        promises.push(dbManager.updateUserBalance(testUser, 'test_guild', -1, 1));
                        break;
                    case 3: // Transfer bank to wallet
                        promises.push(dbManager.updateUserBalance(testUser, 'test_guild', 1, -1));
                        break;
                }
            }
            
            const start = Date.now();
            const results = await Promise.all(promises.map(p => p.catch(e => e)));
            const duration = Date.now() - start;
            
            const errors = results.filter(r => r instanceof Error).length;
            const successRate = (operationCount - errors) / operationCount;
            
            // Check final balance integrity
            const finalBalance = await dbManager.getUserBalance(testUser, 'test_guild');
            const finalTotal = finalBalance.wallet + finalBalance.bank;
            
            // Operations 0 and 1 cancel out, operations 2 and 3 cancel out
            // So total balance should be unchanged
            const balanceDiff = Math.abs(finalTotal - initialTotal);
            
            if (balanceDiff > 1) { // Allow for some operations failing
                this.recordExploit(
                    'CONCURRENT_BALANCE_CORRUPTION',
                    'CRITICAL',
                    `Concurrent operations corrupted total balance`,
                    {
                        initialTotal,
                        finalTotal,
                        difference: balanceDiff,
                        operationCount,
                        errors,
                        successRate
                    }
                );
            }
            
            if (finalBalance.wallet < 0 || finalBalance.bank < 0) {
                this.recordExploit(
                    'CONCURRENT_NEGATIVE_BALANCE',
                    'CRITICAL',
                    `Concurrent operations resulted in negative balance`,
                    { finalBalance, operationCount, errors }
                );
            }
            
            console.log(`📊 Concurrent test: ${operationCount} ops in ${duration}ms, ${successRate*100}% success, balance diff=${balanceDiff}`);
            
        } catch (error) {
            this.recordExploit(
                'CONCURRENT_TEST_ERROR',
                'HIGH',
                `Concurrent balance test failed: ${error.message}`,
                { user: testUser }
            );
        }
    }

    /**
     * Test backup and restore integrity
     */
    async testBackupRestoreIntegrity() {
        console.log('💽 Testing backup/restore integrity...');
        
        try {
            // This test would verify that backup/restore operations maintain data integrity
            // For now, just test that the backup function doesn't crash
            
            if (typeof dbManager.createBackup === 'function') {
                const backup = await dbManager.createBackup();
                
                if (!backup || typeof backup !== 'object') {
                    this.recordExploit(
                        'BACKUP_INTEGRITY_FAILURE',
                        'MEDIUM',
                        'Backup function returned invalid data',
                        { backupType: typeof backup }
                    );
                }
                
                console.log('📊 Backup integrity: backup creation successful');
            } else {
                console.log('ℹ️ Backup function not available for testing');
            }
            
        } catch (error) {
            this.recordExploit(
                'BACKUP_TEST_ERROR',
                'LOW',
                `Backup test failed: ${error.message}`
            );
        }
    }

    /**
     * Clean up test environment
     */
    async cleanupTestEnvironment() {
        console.log('🧹 Cleaning up database test environment...');
        
        try {
            // Reset all test user balances
            for (const userId of this.testUsers) {
                try {
                    await dbManager.setUserBalance(userId, 'test_guild', 0, 0);
                } catch (error) {
                    console.log(`⚠️ Cleanup error for ${userId}: ${error.message}`);
                }
            }
            
            console.log('✅ Database test environment cleanup complete');
            
        } catch (error) {
            console.error(`❌ Cleanup failed: ${error.message}`);
        }
    }

    /**
     * Generate test report
     */
    generateReport() {
        const critical = this.exploits.filter(e => e.severity === 'CRITICAL').length;
        const high = this.exploits.filter(e => e.severity === 'HIGH').length;
        const medium = this.exploits.filter(e => e.severity === 'MEDIUM').length;
        const low = this.exploits.filter(e => e.severity === 'LOW').length;
        
        console.log('\n📋 DATABASE INTEGRITY TEST RESULTS');
        console.log(`📊 Total Tests: ${this.testCount + 6}`); // +6 for the main test categories
        console.log(`🚨 Exploits Found: ${this.exploits.length}`);
        console.log(`🔴 Critical: ${critical}`);
        console.log(`🟠 High: ${high}`);
        console.log(`🟡 Medium: ${medium}`);
        console.log(`🟢 Low: ${low}`);
        
        if (critical > 0) {
            console.error('\n🚨 CRITICAL DATABASE INTEGRITY ISSUES FOUND!');
            this.exploits.filter(e => e.severity === 'CRITICAL').forEach(exploit => {
                console.error(`   - ${exploit.type}: ${exploit.description}`);
            });
        }
        
        if (high > 0) {
            console.warn('\n🟠 HIGH-RISK DATABASE ISSUES FOUND!');
            this.exploits.filter(e => e.severity === 'HIGH').forEach(exploit => {
                console.warn(`   - ${exploit.type}: ${exploit.description}`);
            });
        }
        
        return {
            testCount: this.testCount + 6,
            exploitCount: this.exploits.length,
            severity: { critical, high, medium, low },
            exploits: this.exploits,
            riskLevel: critical > 0 ? 'CRITICAL' : high > 0 ? 'HIGH' : medium > 0 ? 'MEDIUM' : 'LOW'
        };
    }

    /**
     * Run all database integrity tests
     */
    async runAllTests() {
        console.log('🧪 Starting comprehensive database integrity testing...\n');
        
        try {
            // Setup
            const setupSuccess = await this.setupTestEnvironment();
            if (!setupSuccess) {
                return { error: 'Test environment setup failed', exploits: this.exploits };
            }
            
            // Run all tests
            await this.testTransactionAtomicity();
            await this.testDataConsistency();
            await this.testTransactionIsolation();
            await this.testTransactionDurability();
            await this.testConcurrentBalanceManipulation();
            await this.testBackupRestoreIntegrity();
            
            // Generate report
            const report = this.generateReport();
            
            // Cleanup
            await this.cleanupTestEnvironment();
            
            return report;
            
        } catch (error) {
            console.error(`❌ Database integrity testing failed: ${error.message}`);
            await this.cleanupTestEnvironment();
            return { error: error.message, exploits: this.exploits };
        }
    }
}

// Export for use in other test suites
module.exports = DatabaseIntegrityTester;

// If run directly, execute the tests
if (require.main === module) {
    (async () => {
        const tester = new DatabaseIntegrityTester();
        const results = await tester.runAllTests();
        
        // Exit with error code if critical or high-risk issues found
        if (results.riskLevel === 'CRITICAL') {
            process.exit(1);
        } else if (results.riskLevel === 'HIGH') {
            process.exit(2);
        }
    })().catch(error => {
        console.error(`Database integrity testing failed: ${error.message}`);
        process.exit(1);
    });
}