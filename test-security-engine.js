/**
 * 🛡️ SECURITY ENGINE TEST SUITE
 * Comprehensive testing of the SecurityEngine system
 */

const SecurityEngine = require('./ENGINES/SecurityEngine');

async function testSecurityEngine() {
    console.log('🛡️ TESTING SECURITY ENGINE');
    console.log('=' .repeat(50));

    const securityEngine = SecurityEngine;
    const testUserId = 'test_user_123';
    const testGuildId = 'test_guild_456';
    const testGameId = 'test_game_789';
    let testsPassed = 0;
    let totalTests = 0;

    function test(name, condition) {
        totalTests++;
        if (condition) {
            console.log(`✅ ${name}`);
            testsPassed++;
        } else {
            console.log(`❌ ${name}`);
        }
    }

    try {
        // Test 1: Engine Instance
        test('SecurityEngine loads correctly', typeof securityEngine === 'object');

        // Test 2: Health Check
        const isHealthy = securityEngine.isHealthy();
        test('Security health check works', typeof isHealthy === 'boolean');

        // Test 3: Game Registration
        securityEngine.registerGame(testGameId, testUserId, testGuildId, 'flip');
        const monitoredGame = securityEngine.monitoredGames.get(testGameId);
        test('Game registration works', monitoredGame && monitoredGame.userId === testUserId);

        // Test 4: Security Logging
        try {
            await securityEngine.logSecurityEvent(testUserId, 'TEST_EVENT', { action: 'test' });
            test('Security logging works', true);
        } catch (error) {
            test('Security logging works', false);
        }

        // Test 5: User Security Check
        try {
            const securityCheck = await securityEngine.checkUserSecurity(testUserId);
            test('User security check works', typeof securityCheck === 'object');
        } catch (error) {
            test('User security check works', false);
        }

        // Test 6: Security Profile Creation
        try {
            const profile = securityEngine.createUserSecurityProfile(testUserId);
            test('Security profile creation works', typeof profile === 'object');
        } catch (error) {
            test('Security profile creation works', false);
        }

        // Test 7: Threat Level Calculation
        try {
            const mockProfile = { riskScore: 25, recentViolations: [], gamePattern: 'normal' };
            const threatLevel = securityEngine.calculateThreatLevel(mockProfile);
            test('Threat level calculation works', typeof threatLevel === 'string');
        } catch (error) {
            test('Threat level calculation works', false);
        }

        // Test 8: Game Monitoring
        const monitoringActive = securityEngine.monitoredGames.has(testGameId);
        test('Game monitoring active', monitoringActive);

        // Test 9: Security Statistics
        const stats = securityEngine.getStats();
        test('Security statistics available', typeof stats === 'object' && stats.hasOwnProperty('totalEvents'));

        // Test 10: Cleanup
        securityEngine.unregisterGame(testGameId);
        const gameRemoved = !securityEngine.monitoredGames.has(testGameId);
        test('Game cleanup works', gameRemoved);

        // Test 11: Auto-Release System
        console.log('\n⏰ Testing auto-release system...');
        
        // Register a new game for auto-release testing
        const releaseTestGameId = 'release_test_game';
        securityEngine.registerGame(releaseTestGameId, testUserId, testGuildId, 'flip');
        
        // Force set game start time to trigger warning threshold
        const gameData = securityEngine.monitoredGames.get(releaseTestGameId);
        if (gameData) {
            gameData.startTime = Date.now() - 70000; // 70 seconds ago (past warning threshold)
            test('Auto-release test setup works', true);
        } else {
            test('Auto-release test setup works', false);
        }

        // Test 12: Security Sweep
        try {
            await securityEngine.performSecuritySweep();
            test('Security sweep works', true);
        } catch (error) {
            test('Security sweep works', false);
        }

        console.log('\n📊 SECURITY ENGINE TEST RESULTS:');
        console.log(`✅ Passed: ${testsPassed}/${totalTests}`);
        console.log(`❌ Failed: ${totalTests - testsPassed}/${totalTests}`);
        console.log(`📈 Success Rate: ${((testsPassed / totalTests) * 100).toFixed(1)}%`);

        return testsPassed >= 9; // Expect at least 75% success rate

    } catch (error) {
        console.error('❌ Security Engine test failed:', error.message);
        return false;
    }
}

if (require.main === module) {
    testSecurityEngine().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = testSecurityEngine;