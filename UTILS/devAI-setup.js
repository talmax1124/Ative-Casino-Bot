/**
 * DevAI Setup Helper
 * Helps configure environment variables and test the system
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

class DevAISetup {
    constructor() {
        this.envPath = path.join(__dirname, '../.env');
        this.requiredEnvVars = ['OPENAI_API_KEY'];
    }

    /**
     * Check if DevAI is properly configured
     */
    async checkConfiguration() {
        const results = {
            configured: true,
            missing: [],
            suggestions: []
        };

        // Check for .env file
        if (!fs.existsSync(this.envPath)) {
            results.configured = false;
            results.suggestions.push('Create a .env file in the project root');
            return results;
        }

        // Read .env file
        const envContent = fs.readFileSync(this.envPath, 'utf8');
        
        // Check required environment variables
        for (const envVar of this.requiredEnvVars) {
            if (!envContent.includes(`${envVar}=`) || envContent.includes(`${envVar}=`)) {
                const value = process.env[envVar];
                if (!value || value.trim() === '') {
                    results.configured = false;
                    results.missing.push(envVar);
                }
            }
        }

        // Add suggestions
        if (results.missing.includes('OPENAI_API_KEY')) {
            results.suggestions.push(
                'Get OpenAI API key from: https://platform.openai.com/api-keys',
                'Add to .env file: OPENAI_API_KEY=your_api_key_here'
            );
        }

        return results;
    }

    /**
     * Generate example .env configuration
     */
    generateEnvExample() {
        return `
# DevAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Optional: Custom deployment commands (comma-separated)
DEVAI_DEPLOY_COMMANDS=pm2 restart ative-casino-bot,systemctl restart nginx

# Optional: Enable auto-restart by default (true/false)
DEVAI_AUTO_RESTART=false

# Optional: Maximum execution time for AI requests (seconds)
DEVAI_TIMEOUT=300
`;
    }

    /**
     * Test DevAI system components
     */
    async testSystem() {
        const results = {
            openai: false,
            filesystem: false,
            commands: false,
            overall: false
        };

        try {
            // Test OpenAI connection
            const OpenAI = require('openai');
            if (process.env.OPENAI_API_KEY) {
                const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
                // Simple test call
                await openai.models.list();
                results.openai = true;
            }
        } catch (error) {
            console.error('OpenAI test failed:', error.message);
        }

        try {
            // Test filesystem operations
            const testFile = path.join(__dirname, 'devai-test.tmp');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            results.filesystem = true;
        } catch (error) {
            console.error('Filesystem test failed:', error.message);
        }

        try {
            // Test command execution
            const { execSync } = require('child_process');
            execSync('echo "test"', { timeout: 5000 });
            results.commands = true;
        } catch (error) {
            console.error('Command execution test failed:', error.message);
        }

        results.overall = results.openai && results.filesystem && results.commands;
        return results;
    }

    /**
     * Display setup status
     */
    async displayStatus() {
        console.log('🤖 DevAI Setup Status Check\n');

        const config = await this.checkConfiguration();
        
        if (config.configured) {
            console.log('✅ Configuration: Complete');
        } else {
            console.log('❌ Configuration: Incomplete');
            if (config.missing.length > 0) {
                console.log('   Missing variables:', config.missing.join(', '));
            }
            if (config.suggestions.length > 0) {
                console.log('   Suggestions:');
                config.suggestions.forEach(suggestion => {
                    console.log(`   - ${suggestion}`);
                });
            }
        }

        if (config.configured) {
            console.log('\n🧪 Running system tests...');
            const tests = await this.testSystem();
            
            console.log(`${tests.openai ? '✅' : '❌'} OpenAI Connection`);
            console.log(`${tests.filesystem ? '✅' : '❌'} Filesystem Access`);
            console.log(`${tests.commands ? '✅' : '❌'} Command Execution`);
            console.log(`${tests.overall ? '✅' : '❌'} Overall Status`);
        }

        console.log('\n📋 Example .env configuration:');
        console.log(this.generateEnvExample());
    }
}

// If run directly, display status
if (require.main === module) {
    const setup = new DevAISetup();
    setup.displayStatus().catch(console.error);
}

module.exports = DevAISetup;