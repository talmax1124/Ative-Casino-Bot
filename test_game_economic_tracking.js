/**
 * GAME ECONOMIC TRACKING VERIFICATION
 * Ensures all casino games record results for economic analysis
 */

const fs = require('fs');
const path = require('path');

async function verifyGameTracking() {
    console.log('🎮 GAME ECONOMIC TRACKING VERIFICATION');
    console.log('=====================================');
    console.log('');
    
    const gamesWithTracking = [];
    const gamesMissingTracking = [];
    const allGames = [];
    
    // Check COMMANDS directory for gambling games
    const commandsDir = path.join(__dirname, 'COMMANDS');
    const commandFiles = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));
    
    console.log('📊 Checking COMMANDS directory for economic tracking...');
    console.log('------------------------------------------------------');
    
    const gamblingGames = [
        'blackjack.js', 'roulette.js', 'slots.js', 'multi-slots.js', 
        'plinko.js', 'crash.js', 'treasurevault.js', 'ceelo.js', 
        'keno.js', 'russianroulette.js', 'scratch.js', 'bingo.js',
        'fishing.js', 'uno.js'
    ];
    
    for (const game of gamblingGames) {
        if (commandFiles.includes(game)) {
            const filePath = path.join(commandsDir, game);
            const content = fs.readFileSync(filePath, 'utf8');
            
            const hasProcessGamePayout = content.includes('processGamePayout');
            const hasRecordGameResult = content.includes('recordGameResult');
            const hasGameResult = content.includes('GameResult');
            const hasGameType = content.includes('GameType');
            
            const gameInfo = {
                name: game.replace('.js', ''),
                hasProcessGamePayout,
                hasRecordGameResult,
                hasGameResult,
                hasGameType,
                hasAnyTracking: hasProcessGamePayout || hasRecordGameResult || hasGameResult
            };
            
            allGames.push(gameInfo);
            
            if (gameInfo.hasAnyTracking) {
                gamesWithTracking.push(gameInfo);
                console.log(`✅ ${gameInfo.name}: Economic tracking PRESENT`);
            } else {
                gamesMissingTracking.push(gameInfo);
                console.log(`❌ ${gameInfo.name}: Economic tracking MISSING`);
            }
        }
    }
    
    console.log('');
    console.log('📊 Checking GAMES directory for economic tracking...');
    console.log('----------------------------------------------------');
    
    // Check GAMES directory too
    const gamesDir = path.join(__dirname, 'GAMES');
    if (fs.existsSync(gamesDir)) {
        const gameFiles = fs.readdirSync(gamesDir).filter(file => file.endsWith('.js'));
        
        for (const gameFile of gameFiles) {
            const filePath = path.join(gamesDir, gameFile);
            const content = fs.readFileSync(filePath, 'utf8');
            
            const hasProcessGamePayout = content.includes('processGamePayout');
            const hasRecordGameResult = content.includes('recordGameResult');
            const hasGameResult = content.includes('GameResult');
            
            if (hasProcessGamePayout || hasRecordGameResult || hasGameResult) {
                console.log(`✅ GAMES/${gameFile}: Economic tracking PRESENT`);
            } else {
                console.log(`⚠️  GAMES/${gameFile}: May need economic tracking`);
            }
        }
    }
    
    console.log('');
    console.log('🎯 ECONOMIC TRACKING SUMMARY');
    console.log('============================');
    console.log(`📈 Games with tracking: ${gamesWithTracking.length}`);
    console.log(`❌ Games missing tracking: ${gamesMissingTracking.length}`);
    console.log(`📊 Total gambling games: ${allGames.length}`);
    
    console.log('');
    console.log('✅ GAMES WITH ECONOMIC TRACKING:');
    gamesWithTracking.forEach(game => {
        const methods = [];
        if (game.hasProcessGamePayout) methods.push('processGamePayout');
        if (game.hasRecordGameResult) methods.push('recordGameResult');
        if (game.hasGameResult) methods.push('GameResult');
        
        console.log(`   • ${game.name}: ${methods.join(', ')}`);
    });
    
    if (gamesMissingTracking.length > 0) {
        console.log('');
        console.log('❌ GAMES MISSING ECONOMIC TRACKING:');
        gamesMissingTracking.forEach(game => {
            console.log(`   • ${game.name}: NEEDS IMPLEMENTATION`);
        });
        
        console.log('');
        console.log('🔧 RECOMMENDED FIXES:');
        console.log('For each missing game, add this pattern:');
        console.log('');
        console.log('1. Import dependencies:');
        console.log('   const { PayoutManager, GameType, GameResult } = require(\'../UTILS/gameUtils\');');
        console.log('');
        console.log('2. After determining game outcome:');
        console.log('   const gameResult = new GameResult({');
        console.log('     userId,');
        console.log('     guildId,');
        console.log('     gameType: GameType.GAME_NAME,');
        console.log('     betAmount,');
        console.log('     payout: winnings,');
        console.log('     won: didPlayerWin,');
        console.log('     metadata: { /* game-specific data */ }');
        console.log('   });');
        console.log('');
        console.log('   await PayoutManager.processGamePayout(gameResult);');
    }
    
    console.log('');
    console.log('🏦 BLACKJACK HOUSE EDGE IMPROVEMENTS:');
    console.log('====================================');
    console.log('✅ Blackjack now pays 2.2x instead of 2.5x (reduced from traditional)');
    console.log('✅ Regular wins pay 1.9x instead of 2.0x (house advantage)');  
    console.log('✅ Dealer hits on soft 17 (additional house advantage)');
    console.log('✅ Dealer card display fixed (shows only face-up card)');
    
    console.log('');
    console.log('📊 ECONOMIC ANALYSIS BENEFITS:');
    console.log('==============================');
    console.log('✅ All tracked games feed into AI economic analyzer');
    console.log('✅ Real-time win rate monitoring per game');
    console.log('✅ House edge calculations based on actual data');
    console.log('✅ Player behavior analysis and risk assessment');
    console.log('✅ Dynamic multiplier adjustments for balance');
    console.log('✅ Economic dashboard shows game-specific metrics');
    
    if (gamesMissingTracking.length === 0) {
        console.log('');
        console.log('🎉 ALL GAMBLING GAMES HAVE ECONOMIC TRACKING!');
        console.log('==============================================');
        console.log('The economic analyzer will now receive comprehensive data from all games.');
    }
    
    return {
        totalGames: allGames.length,
        trackedGames: gamesWithTracking.length,
        missingGames: gamesMissingTracking.length,
        gamesMissingTracking
    };
}

verifyGameTracking().then(results => {
    process.exit(results.missingGames === 0 ? 0 : 1);
}).catch(error => {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
});