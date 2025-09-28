/**
 * Test script for Economy Analyzer & Optimizer
 */

require('dotenv').config();
const EconomyOptimizer = require('./ECONOMY_GUARDIAN/economyOptimizer');
const logger = require('./UTILS/logger');

async function testEconomyAnalyzer() {
    console.log('🧪 Testing Economy Analyzer & Optimizer...\n');
    
    try {
        // Initialize database adapter first
        console.log('1. Initializing database adapter...');
        const databaseAdapter = require('./UTILS/databaseAdapter');
        await databaseAdapter.initialize();
        console.log('✅ Database adapter initialized successfully\n');
        
        // Initialize optimizer
        console.log('2. Initializing EconomyOptimizer...');
        const optimizer = new EconomyOptimizer({
            // No external AI dependencies
            autoStart: false
        });
        
        await optimizer.initialize();
        console.log('✅ EconomyOptimizer initialized successfully\n');
        
        // Test schema creation
        console.log('3. Testing database schema...');
        const connection = optimizer.db;
        
        // Check if tables exist
        const [tables] = await connection.execute(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_name IN ('tuning', 'regulator_log', 'user_balances', 'transactions')
        `);
        
        console.log('✅ Found tables:', tables.map(t => t.TABLE_NAME || t.table_name).join(', '));
        
        // Test KPI calculation
        console.log('\n4. Testing KPI calculation...');
        const kpis = await optimizer.calculateKPIs();
        
        console.log('✅ KPIs calculated successfully:');
        console.log(`   - Money Supply: ${kpis.moneySupply}`);
        console.log(`   - Overall RTP: ${(kpis.overallRTP * 100).toFixed(2)}%`);
        console.log(`   - Supply Growth: ${kpis.supplyGrowthPct.toFixed(2)}%/day`);
        console.log(`   - Gini Index: ${kpis.giniIndex.toFixed(3)}`);
        console.log(`   - Active Users: ${kpis.activeUsers}`);
        console.log(`   - Games tracked: ${Object.keys(kpis.perGameRTP).length}`);
        
        // Test risk diagnosis
        console.log('\n5. Testing risk diagnosis...');
        const risks = optimizer.diagnoseRisks(kpis);
        console.log(`✅ Found ${risks.length} risks:`);
        risks.forEach(risk => {
            console.log(`   - ${risk.type}: ${risk.message} (${risk.severity})`);
        });
        
        // Test patch generation
        console.log('\n6. Testing patch generation...');
        const patches = optimizer.generateCandidatePatches(kpis, risks);
        console.log(`✅ Generated ${patches.length} candidate patches:`);
        patches.forEach(patch => {
            console.log(`   - ${patch.action}: ${patch.reason}`);
        });
        
        // Test safety checks
        console.log('\n7. Testing safety checks...');
        const safePatches = optimizer.safetyCheckPatches(patches, kpis);
        console.log(`✅ ${safePatches.length}/${patches.length} patches passed safety checks`);
        
        // Test abuse detection
        console.log('\n8. Testing abuse detection...');
        const abuseFlags = await optimizer.detectAbuseSignals(kpis);
        console.log(`✅ Found ${abuseFlags.length} abuse flags:`);
        abuseFlags.forEach(flag => {
            console.log(`   - User ${flag.userId}: ${flag.reason}`);
        });
        
        // Test full optimization cycle
        console.log('\n9. Testing full optimization cycle...');
        const result = await optimizer.runOptimizationCycle();
        
        console.log('✅ Full optimization cycle completed:');
        console.log(`   - Analysis: ${result.analysis}`);
        console.log(`   - Suggestions: ${result.suggestions.length}`);
        console.log(`   - Abuse Flags: ${result.abuseFlags.length}`);
        console.log(`   - Applied Patch: ${result.appliedPatch ? result.appliedPatch.action : 'None'}`);
        
        console.log('\n🎉 All tests passed! Economy Analyzer is working correctly.');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the test
testEconomyAnalyzer().then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
}).catch(error => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
});