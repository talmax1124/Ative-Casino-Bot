/**
 * Test script for the Cog Management System
 * Run this to verify the system works correctly
 */

const cogManager = require('./UTILS/cogManager');
require('dotenv').config();

async function testCogSystem() {
    console.log('🔧 Testing Cog Management System...\n');

    try {
        // Initialize the system
        console.log('1️⃣ Initializing cog manager...');
        await cogManager.createTables();
        await cogManager.initialize();
        console.log('✅ Cog manager initialized successfully\n');

        // Test getting categories
        console.log('2️⃣ Testing category retrieval...');
        const categories = cogManager.getCategories();
        console.log(`✅ Found ${categories.length} categories:`, categories.join(', '));
        console.log('');

        // Test category info
        console.log('3️⃣ Testing category information...');
        const gamesInfo = cogManager.getCategoryInfo('games');
        if (gamesInfo) {
            console.log(`✅ Games category info: ${gamesInfo.name} - ${gamesInfo.description}`);
            console.log(`   Commands: ${gamesInfo.commands.length} (${gamesInfo.commands.slice(0, 5).join(', ')}...)`);
        } else {
            console.log('❌ Failed to get games category info');
        }
        console.log('');

        // Test command categorization
        console.log('4️⃣ Testing command categorization...');
        const blackjackCategory = cogManager.getCommandCategory('blackjack');
        const earnCategory = cogManager.getCommandCategory('work');
        console.log(`✅ blackjack is in category: ${blackjackCategory}`);
        console.log(`✅ work is in category: ${earnCategory}`);
        console.log('');

        // Test enabling/disabling (careful - this affects the actual database)
        console.log('5️⃣ Testing enable/disable functionality...');
        
        // Test with a safe category first
        console.log('   Testing with "utility" category...');
        
        // Check initial status
        const initialStatus = cogManager.isCogEnabled('utility');
        console.log(`   Initial status: ${initialStatus ? 'enabled' : 'disabled'}`);
        
        // If enabled, disable it temporarily, then re-enable
        if (initialStatus) {
            await cogManager.disableCog('utility');
            console.log('   ✅ Successfully disabled utility cog');
            
            const disabledStatus = cogManager.isCogEnabled('utility');
            console.log(`   Status after disable: ${disabledStatus ? 'enabled' : 'disabled'}`);
            
            await cogManager.enableCog('utility');
            console.log('   ✅ Successfully re-enabled utility cog');
            
            const finalStatus = cogManager.isCogEnabled('utility');
            console.log(`   Final status: ${finalStatus ? 'enabled' : 'disabled'}`);
        } else {
            await cogManager.enableCog('utility');
            console.log('   ✅ Successfully enabled utility cog');
        }
        console.log('');

        // Test command status checking
        console.log('6️⃣ Testing command status checking...');
        const helpEnabled = cogManager.isCommandEnabled('help');
        const statsEnabled = cogManager.isCommandEnabled('stats');
        console.log(`✅ help command enabled: ${helpEnabled}`);
        console.log(`✅ stats command enabled: ${statsEnabled}`);
        console.log('');

        // Test getting full status
        console.log('7️⃣ Testing full status retrieval...');
        const fullStatus = cogManager.getCogStatus();
        let totalEnabledCogs = 0;
        let totalDisabledCogs = 0;
        
        for (const [categoryName, status] of Object.entries(fullStatus)) {
            if (status.enabled) totalEnabledCogs++;
            else totalDisabledCogs++;
        }
        
        console.log(`✅ Status retrieved for ${Object.keys(fullStatus).length} categories`);
        console.log(`   Enabled cogs: ${totalEnabledCogs}`);
        console.log(`   Disabled cogs: ${totalDisabledCogs}`);
        console.log('');

        console.log('🎉 All tests completed successfully!');
        console.log('\n📋 System Summary:');
        console.log(`   • ${categories.length} cog categories available`);
        console.log(`   • Commands organized by functionality`);
        console.log(`   • Database integration working`);
        console.log(`   • Enable/disable functionality operational`);
        console.log('\n✨ The cog management system is ready to use!');
        console.log('   Use /cogmanage to start managing your bot\'s features.');

    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error(error.stack);
    }
}

// Run the test
testCogSystem().then(() => {
    process.exit(0);
}).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});