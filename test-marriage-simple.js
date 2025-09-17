/**
 * Simple Marriage System Test - Tests command structure and validation logic
 * This test doesn't require database connection, just tests the command structure
 */

const fs = require('fs');
const path = require('path');

class SimpleMarriageTest {
    constructor() {
        this.testResults = [];
    }

    async runTests() {
        console.log('🧪 Running Simple Marriage System Tests...\n');
        
        await this.testCommandFiles();
        await this.testDatabaseMethods();
        await this.testAssets();
        await this.testConfiguration();
        
        this.displayResults();
    }

    async testCommandFiles() {
        console.log('📁 Testing command files...');
        
        const commandFiles = [
            'propose.js',
            'start-marriage.js', 
            'marriage-profile.js',
            'divorce.js',
            'shared-bank.js'
        ];

        for (const file of commandFiles) {
            const filePath = path.join(__dirname, 'COMMANDS', file);
            
            try {
                if (fs.existsSync(filePath)) {
                    const command = require(filePath);
                    
                    // Test basic structure
                    if (command.data && command.execute) {
                        this.addTestResult(`✅ ${file} structure`, true);
                        
                        // Test command data
                        if (command.data.name && command.data.description) {
                            this.addTestResult(`✅ ${file} command data`, true);
                        } else {
                            this.addTestResult(`❌ ${file} command data`, false, 'Missing name or description');
                        }
                    } else {
                        this.addTestResult(`❌ ${file} structure`, false, 'Missing data or execute');
                    }
                } else {
                    this.addTestResult(`❌ ${file} exists`, false, 'File not found');
                }
            } catch (error) {
                this.addTestResult(`❌ ${file} loading`, false, error.message);
            }
        }
    }

    async testDatabaseMethods() {
        console.log('\n🗄️ Testing database methods...');
        
        try {
            const dbAdapter = require('./UTILS/databaseAdapter');
            
            const marriageMethods = [
                'createMarriageProposal',
                'getPendingMarriageProposals',
                'respondToMarriageProposal',
                'createMarriage',
                'getUserMarriage',
                'areUsersMarried',
                'transferToSharedBank',
                'withdrawFromSharedBank',
                'divorceMarriage'
            ];

            for (const method of marriageMethods) {
                if (typeof dbAdapter[method] === 'function') {
                    this.addTestResult(`✅ Database method: ${method}`, true);
                } else {
                    this.addTestResult(`❌ Database method: ${method}`, false, 'Method not found');
                }
            }
        } catch (error) {
            this.addTestResult('❌ Database adapter loading', false, error.message);
        }
    }

    async testAssets() {
        console.log('\n🖼️ Testing wedding assets...');
        
        const assetFiles = [
            'officiant.jpg',
            'flowergirl.jpg',
            'ring-bearer.png',
            'husband-waiting.jpg',
            'wife.jpg',
            'kissing.gif'
        ];

        const assetsPath = path.join(__dirname, 'assets', 'wedding');
        
        for (const asset of assetFiles) {
            const assetPath = path.join(assetsPath, asset);
            
            if (fs.existsSync(assetPath)) {
                this.addTestResult(`✅ Asset: ${asset}`, true);
            } else {
                this.addTestResult(`❌ Asset: ${asset}`, false, 'File not found');
            }
        }
    }

    async testConfiguration() {
        console.log('\n⚙️ Testing configuration...');
        
        // Test if marriage tables are defined in database adapter
        try {
            const dbAdapterContent = fs.readFileSync('./UTILS/databaseAdapter.js', 'utf8');
            
            if (dbAdapterContent.includes('marriage_proposals') && 
                dbAdapterContent.includes('marriages')) {
                this.addTestResult('✅ Marriage tables defined', true);
            } else {
                this.addTestResult('❌ Marriage tables defined', false, 'Tables not found in schema');
            }

            // Test if button handlers are removed from index.js
            const indexContent = fs.readFileSync('./index.js', 'utf8');
            
            if (!indexContent.includes('marriage_accept_') && 
                !indexContent.includes('marriage_reject_')) {
                this.addTestResult('✅ Button handlers removed', true);
            } else {
                this.addTestResult('❌ Button handlers removed', false, 'Old button handlers still present');
            }

            // Test if divorce handlers are present
            if (indexContent.includes('divorce_confirm_') && 
                indexContent.includes('divorce_cancel_')) {
                this.addTestResult('✅ Divorce handlers present', true);
            } else {
                this.addTestResult('❌ Divorce handlers present', false, 'Divorce handlers not found');
            }

            // Test if sendmoney has marriage tax logic
            const sendmoneyContent = fs.readFileSync('./COMMANDS/sendmoney.js', 'utf8');
            
            if (sendmoneyContent.includes('areUsersMarried') && 
                sendmoneyContent.includes('0.02') && 
                sendmoneyContent.includes('0.05')) {
                this.addTestResult('✅ Marriage tax rates implemented', true);
            } else {
                this.addTestResult('❌ Marriage tax rates implemented', false, 'Tax logic not found');
            }

        } catch (error) {
            this.addTestResult('❌ Configuration check', false, error.message);
        }
    }

    addTestResult(description, passed, error = null) {
        this.testResults.push({
            description,
            passed,
            error
        });
        
        const status = passed ? '✅' : '❌';
        const errorMsg = error ? ` (${error})` : '';
        console.log(`${status} ${description}${errorMsg}`);
    }

    displayResults() {
        console.log('\n📊 Test Results Summary:');
        console.log('=' .repeat(50));
        
        const passed = this.testResults.filter(r => r.passed).length;
        const total = this.testResults.length;
        const failedTests = this.testResults.filter(r => !r.passed);
        
        console.log(`✅ Passed: ${passed}/${total}`);
        console.log(`❌ Failed: ${total - passed}/${total}`);
        console.log(`📈 Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
        
        if (failedTests.length > 0) {
            console.log('\n❌ Failed Tests:');
            failedTests.forEach(test => {
                console.log(`  • ${test.description}: ${test.error}`);
            });
        }
        
        console.log('\n🎉 Simple marriage system testing completed!');
        
        if (passed === total) {
            console.log('\n🎊 ALL TESTS PASSED! Marriage system is ready! 💍');
        } else {
            console.log('\n⚠️ Some tests failed. Please review the issues above.');
        }
    }
}

// Run the tests
async function runSimpleTests() {
    const tester = new SimpleMarriageTest();
    await tester.runTests();
}

// Export for external use
module.exports = { SimpleMarriageTest, runSimpleTests };

// Run if called directly
if (require.main === module) {
    runSimpleTests().catch(console.error);
}