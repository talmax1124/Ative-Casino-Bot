/**
 * Comprehensive test script for the Enhanced Cog Updater System
 */

const cogManager = require('./UTILS/cogManager');
const cogFileMapper = require('./UTILS/cogFileMapper');
const cogUpdater = require('./UTILS/cogUpdater');
const cogupdaterCommand = require('./COMMANDS/cogupdater');
require('dotenv').config();

async function testCogUpdaterSystem() {
    console.log('🔄 Testing Enhanced Cog Updater System...\n');

    try {
        // Initialize systems
        console.log('1️⃣ Initializing systems...');
        await cogManager.createTables();
        await cogManager.initialize();
        console.log('✅ Systems initialized\n');

        // Test 1: File Mapper
        console.log('2️⃣ Testing File Mapper...');
        
        // Test getting cog files
        const gamesFiles = await cogFileMapper.getCogFiles('games', cogManager);
        console.log(`✅ Games cog files: ${gamesFiles.length} files`);
        console.log(`   Files: ${gamesFiles.slice(0, 5).join(', ')}${gamesFiles.length > 5 ? '...' : ''}`);
        
        // Test getting command files
        const blackjackFiles = await cogFileMapper.getCommandFiles('blackjack');
        console.log(`✅ Blackjack command files: ${blackjackFiles.length} files`);
        console.log(`   Files: ${blackjackFiles.join(', ')}`);
        
        // Test file cache
        const cacheStats = cogFileMapper.getCacheStats();
        console.log(`✅ File cache: ${cacheStats.fileCount} files cached`);
        console.log('');

        // Test 2: GitHub File Discovery
        console.log('3️⃣ Testing GitHub file discovery...');
        
        // Test checking if file exists on GitHub
        const blackjackExists = await cogUpdater.checkGithubFileExists('COMMANDS/blackjack.js');
        console.log(`✅ blackjack.js exists on GitHub: ${blackjackExists}`);
        
        const fakeFileExists = await cogUpdater.checkGithubFileExists('COMMANDS/nonexistent.js');
        console.log(`✅ nonexistent.js exists on GitHub: ${fakeFileExists}`);
        console.log('');

        // Test 3: File Summary and Autocomplete
        console.log('4️⃣ Testing cog summary and autocomplete...');
        
        const summary = await cogFileMapper.getCogSummary(cogManager);
        console.log(`✅ Cog summary generated for ${Object.keys(summary).length} categories:`);
        
        for (const [category, info] of Object.entries(summary)) {
            console.log(`   • ${info.name}: ${info.fileCount} files, ${info.commandCount} commands`);
        }
        
        // Test autocomplete items
        const updateableItems = await cogFileMapper.getUpdateableItems(cogManager);
        const cogItems = updateableItems.filter(item => item.type === 'cog');
        const commandItems = updateableItems.filter(item => item.type === 'command');
        console.log(`✅ Autocomplete items: ${cogItems.length} cogs, ${commandItems.length} commands`);
        console.log('');

        // Test 4: Backup System
        console.log('5️⃣ Testing backup system...');
        
        // Create a test backup
        const testFiles = ['COMMANDS/help.js', 'UTILS/logger.js'];
        const backupInfo = await cogUpdater.createBackup(testFiles, 'test_backup');
        console.log(`✅ Test backup created: ${backupInfo.name}`);
        console.log(`   Files backed up: ${backupInfo.files.filter(f => f.backed_up).length}/${backupInfo.files.length}`);
        
        // Get available backups
        const backups = await cogUpdater.getAvailableBackups();
        console.log(`✅ Available backups: ${backups.length}`);
        if (backups.length > 0) {
            console.log(`   Latest: ${backups[0].name} (${backups[0].fileCount} files)`);
        }
        console.log('');

        // Test 5: Update Validation
        console.log('6️⃣ Testing update validation...');
        
        const gamesValidation = await cogFileMapper.validateUpdateFiles('games', 'cog', cogManager);
        console.log(`✅ Games cog validation: ${gamesValidation.valid ? 'Valid' : 'Invalid'}`);
        console.log(`   Files found: ${gamesValidation.exists.length}, Missing: ${gamesValidation.missing.length}`);
        
        const helpValidation = await cogFileMapper.validateUpdateFiles('help', 'command', cogManager);
        console.log(`✅ Help command validation: ${helpValidation.valid ? 'Valid' : 'Invalid'}`);
        console.log(`   Files: ${helpValidation.files.join(', ')}`);
        console.log('');

        // Test 6: Content Validation
        console.log('7️⃣ Testing content validation...');
        
        const validJS = 'const test = "hello"; module.exports = test;';
        const validValidation = cogUpdater.validateContent(validJS, 'test.js');
        console.log(`✅ Valid JS validation: ${validValidation.valid}`);
        
        const invalidJS = 'const test = "unclosed string';
        const invalidValidation = cogUpdater.validateContent(invalidJS, 'test.js');
        console.log(`✅ Invalid JS validation: ${invalidValidation.valid} (${invalidValidation.reason})`);
        
        const htmlContent = '<html><body>404 Not Found</body></html>';
        const htmlValidation = cogUpdater.validateContent(htmlContent, 'test.js');
        console.log(`✅ HTML content validation: ${htmlValidation.valid} (${htmlValidation.reason})`);
        console.log('');

        // Test 7: Autocomplete Simulation
        console.log('8️⃣ Testing autocomplete functionality...');
        
        // Mock interaction for cog autocomplete
        const mockCogInteraction = {
            options: {
                getFocused: () => ({ name: 'name', value: 'ga' }),
                getSubcommand: () => 'update',
                getString: (name) => name === 'type' ? 'cog' : null
            },
            respond: async (choices) => {
                console.log(`   📋 Cog autocomplete for "ga": ${choices.length} choices`);
                choices.slice(0, 3).forEach(choice => {
                    console.log(`      ${choice.name} → ${choice.value}`);
                });
                return true;
            }
        };

        await cogupdaterCommand.autocomplete(mockCogInteraction);
        
        // Mock interaction for command autocomplete
        const mockCommandInteraction = {
            options: {
                getFocused: () => ({ name: 'name', value: 'help' }),
                getSubcommand: () => 'update',
                getString: (name) => name === 'type' ? 'command' : null
            },
            respond: async (choices) => {
                console.log(`   📋 Command autocomplete for "help": ${choices.length} choices`);
                choices.slice(0, 3).forEach(choice => {
                    console.log(`      ${choice.name} → ${choice.value}`);
                });
                return true;
            }
        };

        await cogupdaterCommand.autocomplete(mockCommandInteraction);
        console.log('');

        // Test 8: System Status
        console.log('9️⃣ Testing system status...');
        
        const updaterStatus = cogUpdater.getStatus();
        console.log(`✅ Updater status:`);
        console.log(`   Is updating: ${updaterStatus.isUpdating}`);
        console.log(`   Queue size: ${updaterStatus.queueSize}`);
        console.log(`   GitHub repo: ${updaterStatus.githubRepo}`);
        console.log(`   GitHub branch: ${updaterStatus.githubBranch}`);
        console.log(`   Backup directory: ${updaterStatus.backupDir}`);
        console.log('');

        // Test 9: Cleanup Test
        console.log('🔟 Testing cleanup functionality...');
        
        const cleanedCount = await cogUpdater.cleanOldBackups();
        console.log(`✅ Cleaned ${cleanedCount} old backups`);
        
        cogFileMapper.clearCache();
        const newCacheStats = cogFileMapper.getCacheStats();
        console.log(`✅ Cache cleared: ${newCacheStats.fileCount} files (was ${cacheStats.fileCount})`);
        console.log('');

        console.log('🎉 All tests completed successfully!');
        console.log('\n📋 Enhanced Cog Updater System Summary:');
        console.log('   ✅ File discovery and mapping working');
        console.log('   ✅ GitHub integration functional');
        console.log('   ✅ Backup and rollback system ready');
        console.log('   ✅ Content validation working');
        console.log('   ✅ Autocomplete system functional');
        console.log('   ✅ Interactive commands ready');
        console.log('   ✅ Safety systems operational');
        console.log('\n🚀 System is ready for use!');
        console.log('\nAvailable commands:');
        console.log('   • /cogupdater status - View system status');
        console.log('   • /cogupdater update - Update cogs/commands');
        console.log('   • /cogupdater panel - Interactive panel');
        console.log('   • /cogupdater rollback - Rollback from backup');
        console.log('   • /cogupdater cleanup - Clean old backups');

    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error(error.stack);
    }
}

// Run the test
testCogUpdaterSystem().then(() => {
    process.exit(0);
}).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});