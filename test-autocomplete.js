/**
 * Test script for the autocomplete functionality
 */

const cogManager = require('./UTILS/cogManager');
const cogmanageCommand = require('./COMMANDS/cogmanage');
require('dotenv').config();

async function testAutocomplete() {
    console.log('🔧 Testing Cog Management Autocomplete...\n');

    try {
        // Initialize the system
        console.log('1️⃣ Initializing cog manager...');
        await cogManager.createTables();
        await cogManager.initialize();
        console.log('✅ Cog manager initialized\n');

        // Test 1: Simulate autocomplete for cog categories
        console.log('2️⃣ Testing cog category autocomplete...');
        
        // Mock interaction for cog categories
        const mockInteractionCogs = {
            options: {
                getFocused: () => ({ name: 'name', value: 'ga' }),
                getSubcommand: () => 'enable',
                getString: (name) => name === 'type' ? 'cog' : null
            },
            respond: async (choices) => {
                console.log(`   📋 Cog categories matching "ga":`);
                choices.forEach(choice => {
                    console.log(`      ${choice.name} → ${choice.value}`);
                });
                return true;
            }
        };

        await cogmanageCommand.autocomplete(mockInteractionCogs);
        console.log('');

        // Test 2: Simulate autocomplete for individual commands
        console.log('3️⃣ Testing individual command autocomplete...');
        
        const mockInteractionCommands = {
            options: {
                getFocused: () => ({ name: 'name', value: 'black' }),
                getSubcommand: () => 'disable',
                getString: (name) => name === 'type' ? 'command' : null
            },
            respond: async (choices) => {
                console.log(`   📋 Commands matching "black":`);
                choices.forEach(choice => {
                    console.log(`      ${choice.name} → ${choice.value}`);
                });
                return true;
            }
        };

        await cogmanageCommand.autocomplete(mockInteractionCommands);
        console.log('');

        // Test 3: Simulate autocomplete with no type selected
        console.log('4️⃣ Testing mixed autocomplete (no type selected)...');
        
        const mockInteractionMixed = {
            options: {
                getFocused: () => ({ name: 'name', value: 'work' }),
                getSubcommand: () => 'enable',
                getString: (name) => null // No type selected yet
            },
            respond: async (choices) => {
                console.log(`   📋 Mixed results matching "work":`);
                choices.slice(0, 10).forEach(choice => { // Show first 10
                    console.log(`      ${choice.name} → ${choice.value}`);
                });
                if (choices.length > 10) {
                    console.log(`      ... and ${choices.length - 10} more options`);
                }
                return true;
            }
        };

        await cogmanageCommand.autocomplete(mockInteractionMixed);
        console.log('');

        // Test 4: Show all available options
        console.log('5️⃣ Testing full list (empty search)...');
        
        const mockInteractionFull = {
            options: {
                getFocused: () => ({ name: 'name', value: '' }),
                getSubcommand: () => 'enable',
                getString: (name) => name === 'type' ? 'cog' : null
            },
            respond: async (choices) => {
                console.log(`   📋 All cog categories available:`);
                choices.forEach(choice => {
                    console.log(`      ${choice.name} → ${choice.value}`);
                });
                return true;
            }
        };

        await cogmanageCommand.autocomplete(mockInteractionFull);
        console.log('');

        console.log('🎉 Autocomplete testing completed successfully!');
        console.log('\n📋 How the autocomplete works:');
        console.log('   1. User types `/cogmanage enable type:Cog Category name:`');
        console.log('   2. Discord shows autocomplete suggestions as they type');
        console.log('   3. Suggestions are filtered by what they\'ve typed so far');
        console.log('   4. Different suggestions based on type (cog vs command)');
        console.log('   5. Up to 25 suggestions shown (Discord limit)');
        console.log('\n✨ User Experience:');
        console.log('   • 📁 Categories show with friendly names: "Games (games)"');
        console.log('   • 🎮 Commands show with category context: "blackjack (Games)"');
        console.log('   • 🔍 Smart filtering matches both names and values');
        console.log('   • 🚀 No more guessing cog or command names!');

    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error(error.stack);
    }
}

// Run the test
testAutocomplete().then(() => {
    process.exit(0);
}).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});