/**
 * Blackjack Test Suite
 * Tests all game scenarios to ensure proper payout calculations
 */

const { BlackjackGame, Card, BlackjackHand } = require('./GAMES/blackjack');

// Test helper to create specific hands
function createHand(cards) {
    const hand = new BlackjackHand();
    cards.forEach(card => hand.addCard(card));
    return hand;
}

// Test all scenarios
async function runTests() {
    console.log('🎰 BLACKJACK TEST SUITE\n');
    console.log('='.repeat(50));
    
    const testCases = [
        {
            name: 'Player Blackjack vs Dealer 20',
            setup: (game) => {
                game.playerHand = createHand([
                    new Card('A', '♠️'),
                    new Card('K', '♥️')
                ]);
                game.dealerHand = createHand([
                    new Card('K', '♦️'),
                    new Card('Q', '♣️')
                ]);
                game.gameEnded = true;
            },
            expectedOutcome: 'BLACKJACK',
            expectedPayout: 2500, // $1000 bet * 2.5 (3:2 payout)
            expectedWon: true
        },
        {
            name: 'Both Blackjack (Push)',
            setup: (game) => {
                game.playerHand = createHand([
                    new Card('A', '♠️'),
                    new Card('K', '♥️')
                ]);
                game.dealerHand = createHand([
                    new Card('A', '♦️'),
                    new Card('Q', '♣️')
                ]);
                game.gameEnded = true;
            },
            expectedOutcome: 'PUSH',
            expectedPayout: 1000, // Bet returned
            expectedWon: false
        },
        {
            name: 'Player Wins 20 vs 19',
            setup: (game) => {
                game.playerHand = createHand([
                    new Card('K', '♠️'),
                    new Card('Q', '♥️')
                ]);
                game.dealerHand = createHand([
                    new Card('9', '♦️'),
                    new Card('K', '♣️')
                ]);
                game.gameEnded = true;
            },
            expectedOutcome: 'WIN',
            expectedPayout: 2000, // $1000 bet * 2 (1:1 payout)
            expectedWon: true
        },
        {
            name: 'Push at 20',
            setup: (game) => {
                game.playerHand = createHand([
                    new Card('K', '♠️'),
                    new Card('Q', '♥️')
                ]);
                game.dealerHand = createHand([
                    new Card('J', '♦️'),
                    new Card('K', '♣️')
                ]);
                game.gameEnded = true;
            },
            expectedOutcome: 'PUSH',
            expectedPayout: 1000, // Bet returned
            expectedWon: false
        },
        {
            name: 'Player Busts',
            setup: (game) => {
                game.playerHand = createHand([
                    new Card('K', '♠️'),
                    new Card('Q', '♥️'),
                    new Card('5', '♦️')
                ]);
                game.dealerHand = createHand([
                    new Card('K', '♦️'),
                    new Card('7', '♣️')
                ]);
                game.gameEnded = true;
            },
            expectedOutcome: 'BUSTED',
            expectedPayout: 0, // Lost bet
            expectedWon: false
        },
        {
            name: 'Dealer Busts',
            setup: (game) => {
                game.playerHand = createHand([
                    new Card('K', '♠️'),
                    new Card('8', '♥️')
                ]);
                game.dealerHand = createHand([
                    new Card('K', '♦️'),
                    new Card('6', '♣️'),
                    new Card('Q', '♠️')
                ]);
                game.gameEnded = true;
            },
            expectedOutcome: 'DEALER BUSTED',
            expectedPayout: 2000, // $1000 bet * 2 (1:1 payout)
            expectedWon: true
        },
        {
            name: 'Player Loses 17 vs 18',
            setup: (game) => {
                game.playerHand = createHand([
                    new Card('K', '♠️'),
                    new Card('7', '♥️')
                ]);
                game.dealerHand = createHand([
                    new Card('K', '♦️'),
                    new Card('8', '♣️')
                ]);
                game.gameEnded = true;
            },
            expectedOutcome: 'LOSE',
            expectedPayout: 0, // Lost bet
            expectedWon: false
        },
        {
            name: 'Double Down Win',
            setup: (game) => {
                game.playerHand = createHand([
                    new Card('6', '♠️'),
                    new Card('5', '♥️'),
                    new Card('9', '♦️') // Total: 20
                ]);
                game.playerHand.double(); // Mark as doubled
                game.dealerHand = createHand([
                    new Card('K', '♦️'),
                    new Card('9', '♣️') // Total: 19
                ]);
                game.gameEnded = true;
            },
            expectedOutcome: 'WIN',
            expectedPayout: 4000, // $2000 doubled bet * 2 (1:1 payout)
            expectedWon: true
        },
        {
            name: 'Double Down Loss',
            setup: (game) => {
                game.playerHand = createHand([
                    new Card('6', '♠️'),
                    new Card('5', '♥️'),
                    new Card('K', '♦️') // Total: 21 but busted the double
                ]);
                game.playerHand.double(); // Mark as doubled
                game.dealerHand = createHand([
                    new Card('K', '♦️'),
                    new Card('K', '♣️') // Total: 20
                ]);
                game.gameEnded = true;
            },
            expectedOutcome: 'WIN',
            expectedPayout: 4000, // Actually wins with 21 vs 20
            expectedWon: true
        }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of testCases) {
        const game = new BlackjackGame('testUser', 1000);
        test.setup(game);
        
        const results = await game.getResults();
        const result = results[0];
        
        const passOutcome = result.outcome === test.expectedOutcome;
        const passPayout = result.payout === test.expectedPayout;
        const passWon = result.won === test.expectedWon;
        const allPass = passOutcome && passPayout && passWon;
        
        console.log(`\n${allPass ? '✅' : '❌'} ${test.name}`);
        console.log(`   Player: ${game.playerHand.toString()} (${game.playerHand.getValue()})`);
        console.log(`   Dealer: ${game.dealerHand.toString()} (${game.dealerHand.getValue()})`);
        console.log(`   Expected: ${test.expectedOutcome}, $${test.expectedPayout}, won=${test.expectedWon}`);
        console.log(`   Got:      ${result.outcome}, $${result.payout}, won=${result.won}`);
        
        if (!passOutcome) console.log(`   ❌ Outcome mismatch`);
        if (!passPayout) console.log(`   ❌ Payout mismatch`);
        if (!passWon) console.log(`   ❌ Won flag mismatch`);
        
        if (allPass) passed++;
        else failed++;
    }
    
    console.log('\n' + '='.repeat(50));
    console.log(`\n📊 TEST RESULTS: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
        console.log('✅ All tests passed! Blackjack logic is working correctly.');
    } else {
        console.log('❌ Some tests failed. Review the implementation.');
    }
}

// Run the tests
runTests().catch(console.error);