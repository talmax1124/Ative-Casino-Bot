/**
 * Game Personalization Integration Template
 * Step-by-step guide for adding personalized mechanics to any game
 */

/* 
=============================================================================
STEP 1: Import the PersonalizedGameHelper in your game command
=============================================================================
*/

// At the top of your game command file (e.g., COMMANDS/yourgame.js)
const PersonalizedGameHelper = require('../UTILS/personalizedGameHelper');

/* 
=============================================================================
STEP 2: Get personalized configuration after bet validation
=============================================================================
*/

// After successful PayoutManager.validateAndDeductBet()
async function handleGameCommand(interaction) {
    const userId = interaction.user.id;
    
    // ... your existing bet validation code ...
    const validation = await PayoutManager.validateAndDeductBet(/* params */);
    if (!validation.isValid) return;

    // GET PERSONALIZED CONFIG FOR YOUR GAME
    const personalizedConfig = await PersonalizedGameHelper.getPersonalizedYourGame(userId, validation);
    // For existing games, use: getPersonalizedBlackjack, getPersonalizedSlots, getPersonalizedRoulette, etc.
    
    // ... continue with your game logic ...
}

/* 
=============================================================================
STEP 3: Modify your game logic to use personalized values
=============================================================================
*/

// EXAMPLE 1: Using personalized multipliers
function calculateGameResult(betAmount, outcome, personalizedConfig) {
    let baseMultiplier = 2.0; // Your game's default multiplier
    
    // Use personalized multiplier instead of fixed value
    const personalizedMultiplier = personalizedConfig.payouts[outcome] || baseMultiplier;
    
    const payout = betAmount * personalizedMultiplier;
    
    return {
        won: personalizedMultiplier > 1.0,
        payout: payout,
        multiplier: personalizedMultiplier,
        outcome: outcome,
        // Include personalization info for logging
        personalization: {
            tier: personalizedConfig.wealthTier,
            reduction: personalizedConfig.personalizationLevel,
            reasons: personalizedConfig.reasons
        }
    };
}

// EXAMPLE 2: Using personalized odds/probabilities  
function determineGameOutcome(personalizedConfig) {
    // Instead of fixed odds like 0.25 (25% win chance)
    const baseWinChance = 0.25;
    
    // Use personalized win chance
    const personalizedWinChance = personalizedConfig.winChance || baseWinChance;
    
    const randomValue = Math.random();
    const won = randomValue < personalizedWinChance;
    
    return {
        won: won,
        winChance: personalizedWinChance,
        randomValue: randomValue
    };
}

/* 
=============================================================================
STEP 4: Add personalization to your existing game files (GAMES/ folder)
=============================================================================
*/

// MODIFY your existing game logic functions to accept personalizedConfig

// BEFORE (fixed values):
function calculatePayout(symbols, betAmount) {
    const FIXED_PAYOUTS = { cherry: 2, diamond: 10, jackpot: 100 };
    const symbol = symbols[0];
    const multiplier = FIXED_PAYOUTS[symbol] || 0;
    return betAmount * multiplier;
}

// AFTER (personalized values):
function calculatePayout(symbols, betAmount, personalizedPayouts = null) {
    const FIXED_PAYOUTS = { cherry: 2, diamond: 10, jackpot: 100 };
    const symbol = symbols[0];
    
    // Use personalized payout if available, otherwise use default
    let multiplier = FIXED_PAYOUTS[symbol] || 0;
    if (personalizedPayouts && personalizedPayouts[symbol]) {
        multiplier = personalizedPayouts[symbol];
    }
    
    return betAmount * multiplier;
}

/* 
=============================================================================
STEP 5: Add logging for personalization transparency  
=============================================================================
*/

// Log significant personalizations
if (personalizedConfig.personalizationLevel > 0.3) {
    logger.warn(`🎮 PERSONALIZED GAME: ${userId} - ${gameType} - Tier: ${personalizedConfig.wealthTier} - Reduction: ${(personalizedConfig.personalizationLevel * 100).toFixed(1)}%`);
    logger.warn(`🎮 Reasons: ${personalizedConfig.reasons.join(', ')}`);
}

/* 
=============================================================================
STEP 6: Include personalization in game results
=============================================================================
*/

// When creating GameResult, include personalization metadata
const gameResult = new GameResult({
    userId,
    guildId,
    gameType: 'yourGame',
    betAmount,
    payout: finalPayout,
    won: won,
    metadata: {
        sessionId: aiTracking?.sessionId,
        personalization: {
            tier: personalizedConfig.wealthTier,
            level: personalizedConfig.personalizationLevel,
            originalMultiplier: baseMultiplier,
            personalizedMultiplier: personalizedMultiplier,
            reasons: personalizedConfig.reasons
        }
    }
});

/* 
=============================================================================
STEP 7: Add your game to the Dynamic Game Personalizer config
=============================================================================
*/

// In UTILS/dynamicGamePersonalizer.js, add your game to baseGameConfigs:

yourGame: {
    basePayout: { 
        outcome1: 2.0,     // 2x multiplier for outcome1
        outcome2: 5.0,     // 5x multiplier for outcome2  
        outcome3: 10.0     // 10x multiplier for outcome3
    },
    baseOdds: { 
        winChance: 0.25,        // 25% base win chance
        bigWinChance: 0.05      // 5% base big win chance
    }
},

/* 
=============================================================================
STEP 8: Add helper method to PersonalizedGameHelper.js
=============================================================================
*/

// Add this method to PersonalizedGameHelper.js:

static async getPersonalizedYourGame(userId, validation = null) {
    const config = await dynamicGamePersonalizer.getPersonalizedGameConfig(
        userId, 'yourGame', validation?.aiTracking
    );

    const basePayouts = config?.basePayout || { outcome1: 2.0, outcome2: 5.0, outcome3: 10.0 };

    return {
        // Personalized payouts
        payouts: config?.personalizedPayout || basePayouts,
        
        // Personalized odds
        winChance: config?.personalizedOdds?.winChance || config?.baseOdds?.winChance || 0.25,
        bigWinChance: config?.personalizedOdds?.bigWinChance || config?.baseOdds?.bigWinChance || 0.05,
        
        // Metadata
        personalizationLevel: config?.metadata?.personalizationLevel || 0,
        wealthTier: config?.metadata?.wealthTier || "Regular",
        reasons: config?.metadata?.factors?.reasons || []
    };
}

/* 
=============================================================================
COMPLETE INTEGRATION CHECKLIST:
=============================================================================

✅ Import PersonalizedGameHelper in your command file
✅ Get personalized config after bet validation  
✅ Modify game logic to use personalized multipliers
✅ Modify game logic to use personalized odds/probabilities
✅ Add personalization parameters to your game functions  
✅ Add logging for significant personalizations
✅ Include personalization data in GameResult metadata
✅ Add your game config to dynamicGamePersonalizer.js
✅ Add helper method to PersonalizedGameHelper.js
✅ Test with players of different wealth tiers

=============================================================================
RESULT: Your game now automatically adjusts ALL mechanics based on:
- Player wealth level (most important factor)
- AI behavior analysis  
- Win/loss patterns
- Suspicious activity detection

Ultra-wealthy players (900M+) will experience:
- 85-95% reduced multipliers
- Reduced win probabilities  
- Lower jackpot chances
- All automatically applied per-game!
=============================================================================
*/

module.exports = {
    // This is a template file - no exports needed
    // Use this as a guide for integrating personalization into any game
};