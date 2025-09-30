/**
 * Comprehensive Webhook Endpoint Testing Script
 * Tests all voting webhook endpoints and verifies functionality
 */

const axios = require('axios');
require('dotenv').config();

// Configuration - UPDATE THESE VALUES
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || 'http://199.244.48.46:25565';
const TEST_USER_ID = '466050111680544798'; // Your Discord user ID

// Environment variables
const TOPGG_WEBHOOK_SECRET = process.env.TOPGG_WEBHOOK_SECRET;
const RANKTOP_WEBHOOK_SECRET = process.env.RANKTOP_WEBHOOK_SECRET;

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

console.log(`${colors.bright}${colors.blue}╔════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.bright}${colors.blue}║     WEBHOOK ENDPOINT TESTER             ║${colors.reset}`);
console.log(`${colors.bright}${colors.blue}╚════════════════════════════════════════╝${colors.reset}`);

async function testEndpointStatus() {
    console.log(`\n${colors.cyan}Testing endpoint availability...${colors.reset}`);
    
    try {
        // Test health endpoint
        const healthResponse = await axios.get(`${WEBHOOK_BASE_URL}/health`);
        console.log(`${colors.green}✓ Health endpoint:${colors.reset} ${healthResponse.status} - ${healthResponse.data.status}`);
        
        // Test webhook test endpoint
        const webhookTestResponse = await axios.get(`${WEBHOOK_BASE_URL}/webhook-test`);
        console.log(`${colors.green}✓ Webhook test endpoint:${colors.reset} ${webhookTestResponse.status}`);
        console.log(`${colors.yellow}Environment status:${colors.reset}`);
        Object.entries(webhookTestResponse.data.environment).forEach(([key, value]) => {
            const status = value === 'Set' ? colors.green : colors.red;
            console.log(`  ${key}: ${status}${value}${colors.reset}`);
        });
        
        return true;
    } catch (error) {
        console.log(`${colors.red}✗ Endpoint test failed:${colors.reset} ${error.message}`);
        return false;
    }
}

async function testBotVoteWebhook() {
    console.log(`\n${colors.cyan}Testing Top.GG Bot Vote Webhook...${colors.reset}`);
    
    try {
        const response = await axios.post(
            `${WEBHOOK_BASE_URL}/topgg/webhook`,
            {
                bot: '1403236218900185088',
                user: TEST_USER_ID,
                type: 'upvote',
                isWeekend: new Date().getDay() === 0 || new Date().getDay() === 6,
                query: '',
                timestamp: Date.now()
            },
            {
                headers: {
                    'Authorization': `Bearer ${TOPGG_WEBHOOK_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log(`${colors.green}✓ Bot vote webhook:${colors.reset} ${response.status} - ${response.data}`);
        return true;
    } catch (error) {
        console.log(`${colors.red}✗ Bot vote webhook failed:${colors.reset}`);
        if (error.response) {
            console.log(`  Status: ${error.response.status}`);
            console.log(`  Error: ${JSON.stringify(error.response.data)}`);
        } else {
            console.log(`  Error: ${error.message}`);
        }
        return false;
    }
}

async function testRanktopVoteWebhook() {
    console.log(`\n${colors.cyan}Testing Rank.top Vote Webhook...${colors.reset}`);
    
    try {
        const crypto = require('crypto');
        const body = {
            user: TEST_USER_ID,
            bot: '1403236218900185088',
            timestamp: Date.now()
        };
        
        // Generate HMAC signature like the webhook expects
        const signature = crypto.createHmac('sha256', RANKTOP_WEBHOOK_SECRET)
            .update(JSON.stringify(body))
            .digest('hex');
        
        const response = await axios.post(
            `${WEBHOOK_BASE_URL}/ranktop/webhook`,
            body,
            {
                headers: {
                    'x-signature': signature,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log(`${colors.green}✓ Rank.top vote webhook:${colors.reset} ${response.status} - ${response.data}`);
        return true;
    } catch (error) {
        console.log(`${colors.red}✗ Rank.top vote webhook failed:${colors.reset}`);
        if (error.response) {
            console.log(`  Status: ${error.response.status}`);
            console.log(`  Error: ${JSON.stringify(error.response.data)}`);
        } else {
            console.log(`  Error: ${error.message}`);
        }
        return false;
    }
}

async function testInvalidRequests() {
    console.log(`\n${colors.cyan}Testing security (invalid requests)...${colors.reset}`);
    
    // Test invalid authorization
    try {
        await axios.post(
            `${WEBHOOK_BASE_URL}/topgg/webhook`,
            { user: TEST_USER_ID },
            { headers: { 'Authorization': 'Bearer invalid-secret' } }
        );
        console.log(`${colors.red}✗ Security test failed - accepted invalid auth${colors.reset}`);
    } catch (error) {
        if (error.response && error.response.status === 401) {
            console.log(`${colors.green}✓ Security test passed - rejected invalid auth${colors.reset}`);
        } else {
            console.log(`${colors.yellow}? Security test unclear:${colors.reset} ${error.message}`);
        }
    }
    
    // Test missing user ID
    try {
        await axios.post(
            `${WEBHOOK_BASE_URL}/topgg/webhook`,
            { bot: '1403236218900185088' },
            { headers: { 'Authorization': `Bearer ${TOPGG_WEBHOOK_SECRET}` } }
        );
        console.log(`${colors.red}✗ Validation test failed - accepted missing user${colors.reset}`);
    } catch (error) {
        if (error.response && error.response.status === 400) {
            console.log(`${colors.green}✓ Validation test passed - rejected missing user${colors.reset}`);
        } else {
            console.log(`${colors.yellow}? Validation test unclear:${colors.reset} ${error.message}`);
        }
    }
}

async function runAllTests() {
    console.log(`\n${colors.yellow}Configuration:${colors.reset}`);
    console.log(`  Webhook URL: ${WEBHOOK_BASE_URL}`);
    console.log(`  Test User ID: ${TEST_USER_ID}`);
    console.log(`  Top.GG Secret: ${TOPGG_WEBHOOK_SECRET ? 'Set' : 'Missing'}`);
    console.log(`  Rank.top Secret: ${RANKTOP_WEBHOOK_SECRET ? 'Set' : 'Missing'}`);
    
    if (TEST_USER_ID === 'YOUR_DISCORD_USER_ID_HERE') {
        console.log(`\n${colors.red}⚠️  Please update TEST_USER_ID in the script with your Discord user ID${colors.reset}`);
        return;
    }
    
    const results = {
        endpoint: false,
        botVote: false,
        ranktopVote: false
    };
    
    // Run tests
    results.endpoint = await testEndpointStatus();
    
    if (results.endpoint) {
        results.botVote = await testBotVoteWebhook();
        results.ranktopVote = await testRanktopVoteWebhook();
        await testInvalidRequests();
    }
    
    // Summary
    console.log(`\n${colors.cyan}═══════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}TEST SUMMARY${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════${colors.reset}`);
    
    const tests = [
        ['Endpoint Status', results.endpoint],
        ['Bot Vote Webhook', results.botVote],
        ['Rank.top Vote Webhook', results.ranktopVote]
    ];
    
    let passed = 0;
    tests.forEach(([name, success]) => {
        if (success) {
            console.log(`${colors.green}✓${colors.reset} ${name}: ${colors.green}PASSED${colors.reset}`);
            passed++;
        } else {
            console.log(`${colors.red}✗${colors.reset} ${name}: ${colors.red}FAILED${colors.reset}`);
        }
    });
    
    console.log(`\n${colors.bright}Results: ${colors.green}${passed}/${tests.length} passed${colors.reset}`);
    
    if (passed === tests.length) {
        console.log(`\n${colors.green}🎉 All webhook endpoints are working correctly!${colors.reset}`);
        console.log(`${colors.green}✓ Users can now vote and receive rewards${colors.reset}`);
        console.log(`${colors.green}✓ Bot votes → 25,000 coins + bonuses${colors.reset}`);
        console.log(`${colors.green}✓ Rank.top votes → 1 free lottery ticket${colors.reset}`);
    } else {
        console.log(`\n${colors.red}❌ Some tests failed. Check the logs above for details.${colors.reset}`);
    }
}

// Run the tests
runAllTests().catch(error => {
    console.error(`${colors.red}Test runner error:${colors.reset}`, error.message);
});