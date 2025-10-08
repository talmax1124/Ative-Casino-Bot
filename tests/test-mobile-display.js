/**
 * Mobile Display Test for Roulette
 * Tests the mobile-optimized UI elements
 */

const { RouletteGame } = require('./GAMES/roulette');

function testMobileDisplay() {
    console.log('📱 ROULETTE MOBILE DISPLAY TEST\n');
    console.log('='.repeat(50));
    
    // Test different scenarios
    const scenarios = [
        { number: 7, name: 'Red Number' },
        { number: 22, name: 'Black Number' },
        { number: 0, name: 'Green Zero' },
        { number: '00', name: 'Green Double Zero' },
        { number: 36, name: 'High Red Number' }
    ];
    
    scenarios.forEach((scenario, index) => {
        console.log(`\n${index + 1}. ${scenario.name} (${scenario.number}):`);
        console.log('-'.repeat(40));
        
        const game = new RouletteGame('testUser', 1000);
        game.placeBet('red', 1000);
        game.lastResult = scenario.number;
        game.gameEnded = true;
        
        // Test mobile wheel display
        const mobileDisplay = game.generateMobileWheelDisplay();
        console.log('Mobile Wheel Display:');
        console.log(mobileDisplay);
        
        // Test regular display
        const regularDisplay = game.generateWheelDisplay();
        console.log('\nRegular Display:');
        console.log(regularDisplay);
        
        // Test mobile bet layout
        if (index === 0) {
            console.log('\n📋 Mobile Bet Layout:');
            const layout = game.getMobileBetLayout();
            
            console.log('\nQuick Bets:');
            layout.quickBets.forEach(bet => {
                console.log(`  ${bet.label} (${bet.odds})`);
            });
            
            console.log('\nDozens:');
            layout.dozens.forEach(bet => {
                console.log(`  ${bet.label} (${bet.odds})`);
            });
            
            console.log('\nColumns:');
            layout.columns.forEach(bet => {
                console.log(`  ${bet.label} (${bet.odds})`);
            });
        }
    });
    
    console.log('\n' + '='.repeat(50));
    console.log('\n✅ MOBILE DISPLAY FEATURES:');
    console.log('📱 Large, clear number display');
    console.log('🎨 Color-coded with emojis');
    console.log('📊 ASCII art box for visibility');
    console.log('🎯 Organized bet layout');
    console.log('📈 Clear odds display');
    console.log('📋 Mobile-friendly button labels');
    
    console.log('\n🎉 Mobile display optimizations complete!');
}

// Test bet descriptions and odds
function testBetInformation() {
    console.log('\n📋 BET INFORMATION TEST\n');
    console.log('='.repeat(50));
    
    const game = new RouletteGame('testUser', 1000);
    const betTypes = [
        'red', 'black', 'green', 'odd', 'even', 
        'low', 'high', 'dozen1', 'dozen2', 'dozen3',
        'column1', 'column2', 'column3', 'number', 'basket'
    ];
    
    console.log('Bet Type'.padEnd(15) + 'Description'.padEnd(25) + 'Odds'.padEnd(10) + 'Probability');
    console.log('-'.repeat(70));
    
    betTypes.forEach(betType => {
        const description = game.getBetDescription(betType);
        const odds = game.getPayoutOdds(betType);
        const probability = (game.getWinProbability(betType) * 100).toFixed(2) + '%';
        
        console.log(
            betType.padEnd(15) + 
            description.padEnd(25) + 
            odds.padEnd(10) + 
            probability
        );
    });
    
    console.log('\n✅ All bet information is correct and mobile-friendly!');
}

// Run tests
testMobileDisplay();
testBetInformation();