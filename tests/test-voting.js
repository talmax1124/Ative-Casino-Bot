/**
 * Voting System Test Script
 * Tests all 3 voting webhooks: Bot, Server, and Rank.top
 */

const axios = require('axios');
require('dotenv').config();

// Configuration
const WEBHOOK_BASE_URL = 'http://localhost:3001'; // Change to your bot's webhook URL
const TEST_USER_ID = '123456789'; // Replace with your Discord user ID

// Webhook secrets from environment
const TOPGG_WEBHOOK_SECRET = process.env.TOPGG_WEBHOOK_SECRET || 'test-topgg-secret';
const RANKTOP_WEBHOOK_SECRET = process.env.RANKTOP_WEBHOOK_SECRET || 'test-ranktop-secret';

// Test data for different vote types
const voteTests = {
    bot: {
        name: 'Bot Vote (Top.GG)',
        endpoint: '/topgg/webhook',
        headers: {
            'Authorization': `Bearer ${TOPGG_WEBHOOK_SECRET}`,
            'Content-Type': 'application/json'
        },
        body: {
            bot: '1403236218900185088',
            user: TEST_USER_ID,
            type: 'upvote',
            isWeekend: new Date().getDay() === 0 || new Date().getDay() === 6,
            query: '',
            timestamp: Date.now()
        },
        expectedReward: '25,000 coins + bonuses'
    },
    server: {
        name: 'Server Vote (Top.GG) - API Polling',
        endpoint: 'N/A - Uses API polling, not webhooks',
        note: 'Server votes are detected automatically via Top.GG API polling every 60 seconds',
        expectedReward: '25,000 coins + bonuses'
    },
    ranktop: {
        name: 'Rank.top Vote',
        endpoint: '/ranktop/webhook',
        headers: {
            'Authorization': `Bearer ${RANKTOP_WEBHOOK_SECRET}`,
            'Content-Type': 'application/json'
        },
        body: {
            user: TEST_USER_ID,
            bot: '1403236218900185088',
            timestamp: Date.now()
        },
        expectedReward: '1 free lottery ticket'
    }
};

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

// Test function for individual vote type
async function testVote(voteType) {
    const test = voteTests[voteType];
    
    console.log(`\n${colors.cyan}═══════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}Testing: ${test.name}${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════${colors.reset}`);
    
    if (voteType === 'server') {
        console.log(`${colors.yellow}Endpoint:${colors.reset} ${test.endpoint}`);
        console.log(`${colors.yellow}Expected Reward:${colors.reset} ${test.expectedReward}`);
        console.log(`${colors.yellow}Note:${colors.reset} ${test.note}`);
        console.log(`\n${colors.blue}Server votes cannot be tested via webhook.${colors.reset}`);
        console.log(`${colors.blue}To test server voting:${colors.reset}`);
        console.log(`${colors.blue}1. Make sure TOPGG_SERVER_TOKEN is set in your .env${colors.reset}`);
        console.log(`${colors.blue}2. Vote for the server on Top.GG${colors.reset}`);
        console.log(`${colors.blue}3. Wait up to 60 seconds for the polling system to detect it${colors.reset}`);
        return true;
    }
    
    console.log(`${colors.yellow}Endpoint:${colors.reset} ${WEBHOOK_BASE_URL}${test.endpoint}`);
    console.log(`${colors.yellow}Expected Reward:${colors.reset} ${test.expectedReward}`);
    console.log(`${colors.yellow}User ID:${colors.reset} ${TEST_USER_ID}`);
    
    try {
        console.log(`\n${colors.blue}Sending webhook...${colors.reset}`);
        
        const response = await axios.post(
            `${WEBHOOK_BASE_URL}${test.endpoint}`,
            test.body,
            { headers: test.headers }
        );
        
        console.log(`${colors.green}✓ Success!${colors.reset}`);
        console.log(`${colors.green}Status:${colors.reset} ${response.status}`);
        console.log(`${colors.green}Response:${colors.reset}`, response.data);
        
        return true;
    } catch (error) {
        console.log(`${colors.red}✗ Failed!${colors.reset}`);
        
        if (error.response) {
            console.log(`${colors.red}Status:${colors.reset} ${error.response.status}`);
            console.log(`${colors.red}Error:${colors.reset}`, error.response.data);
        } else {
            console.log(`${colors.red}Error:${colors.reset}`, error.message);
        }
        
        return false;
    }
}

// Main test runner
async function runTests() {
    console.log(`${colors.bright}${colors.blue}╔════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}║     VOTING SYSTEM WEBHOOK TESTER       ║${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}╚════════════════════════════════════════╝${colors.reset}`);
    
    console.log(`\n${colors.yellow}Configuration:${colors.reset}`);
    console.log(`  Webhook URL: ${WEBHOOK_BASE_URL}`);
    console.log(`  Test User ID: ${TEST_USER_ID}`);
    console.log(`  Is Weekend: ${new Date().getDay() === 0 || new Date().getDay() === 6}`);
    
    const results = {
        bot: false,
        server: false,
        ranktop: false
    };
    
    // Test each vote type with delay between tests
    for (const voteType of Object.keys(voteTests)) {
        results[voteType] = await testVote(voteType);
        
        // Wait 2 seconds between tests to avoid rate limiting
        if (voteType !== 'ranktop') {
            console.log(`\n${colors.yellow}Waiting 2 seconds before next test...${colors.reset}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    // Summary
    console.log(`\n${colors.cyan}═══════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}TEST SUMMARY${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════${colors.reset}`);
    
    let passed = 0;
    let failed = 0;
    
    for (const [type, success] of Object.entries(results)) {
        if (success) {
            console.log(`${colors.green}✓${colors.reset} ${voteTests[type].name}: ${colors.green}PASSED${colors.reset}`);
            passed++;
        } else {
            console.log(`${colors.red}✗${colors.reset} ${voteTests[type].name}: ${colors.red}FAILED${colors.reset}`);
            failed++;
        }
    }
    
    console.log(`\n${colors.bright}Results: ${colors.green}${passed} passed${colors.reset}, ${colors.red}${failed} failed${colors.reset}`);
}

// Interactive menu
async function interactiveMenu() {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const question = (text) => new Promise(resolve => rl.question(text, resolve));
    
    console.log(`${colors.bright}${colors.blue}╔════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}║     VOTING SYSTEM WEBHOOK TESTER       ║${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}╚════════════════════════════════════════╝${colors.reset}`);
    
    while (true) {
        console.log(`\n${colors.cyan}Select an option:${colors.reset}`);
        console.log('1. Test Bot Vote (Top.GG)');
        console.log('2. Test Server Vote (Top.GG)');
        console.log('3. Test Rank.top Vote');
        console.log('4. Test All Votes');
        console.log('5. Configure Settings');
        console.log('6. Exit');
        
        const choice = await question(`\n${colors.yellow}Enter choice (1-6):${colors.reset} `);
        
        switch(choice) {
            case '1':
                await testVote('bot');
                break;
            case '2':
                await testVote('server');
                break;
            case '3':
                await testVote('ranktop');
                break;
            case '4':
                await runTests();
                break;
            case '5':
                console.log('\n' + colors.yellow + 'Current Settings:' + colors.reset);
                console.log(`Webhook URL: ${WEBHOOK_BASE_URL}`);
                console.log(`User ID: ${TEST_USER_ID}`);
                console.log('\nEdit the script to change these values.');
                break;
            case '6':
                console.log(colors.green + '\nGoodbye!' + colors.reset);
                rl.close();
                return;
            default:
                console.log(colors.red + 'Invalid choice!' + colors.reset);
        }
        
        await question('\nPress Enter to continue...');
    }
}

// Check command line arguments
const args = process.argv.slice(2);

if (args[0] === '--interactive' || args[0] === '-i') {
    interactiveMenu();
} else if (args[0] === '--help' || args[0] === '-h') {
    console.log(`
${colors.bright}Usage:${colors.reset}
  node test-voting.js              Run all tests
  node test-voting.js -i           Interactive mode
  node test-voting.js bot          Test bot vote only
  node test-voting.js server       Test server vote only
  node test-voting.js ranktop      Test Rank.top vote only
  node test-voting.js -h           Show this help

${colors.bright}Configuration:${colors.reset}
  Edit the script to change:
  - WEBHOOK_BASE_URL (default: http://localhost:3001)
  - TEST_USER_ID (your Discord user ID)

${colors.bright}Environment Variables:${colors.reset}
  TOPGG_WEBHOOK_SECRET      Top.GG webhook secret
  RANKTOP_WEBHOOK_SECRET    Rank.top webhook secret
`);
} else if (args[0] && voteTests[args[0]]) {
    testVote(args[0]).then(() => process.exit(0));
} else {
    runTests().then(() => process.exit(0));
}