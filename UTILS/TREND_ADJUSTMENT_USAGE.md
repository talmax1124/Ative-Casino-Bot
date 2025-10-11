# Trend Adjustment System - Usage Guide

## Overview
The advanced trend adjustment system automatically adjusts win rates and house edges based on player patterns, behavior, and skill level. This ensures optimal house profitability while maintaining game fairness.

## Quick Integration

### 1. Basic Win/Loss Decision
```javascript
const GameAdjustmentHelper = require('../UTILS/gameAdjustmentHelper');

// In your game logic, determine if player should win
const shouldWin = await GameAdjustmentHelper.shouldPlayerWin(
    userId,           // Player ID
    'blackjack',      // Game type
    0.49             // Base win chance (49%)
);

if (shouldWin) {
    // Player wins
} else {
    // Player loses
}
```

### 2. Payout Adjustment
```javascript
// After calculating base payout
let finalPayout = basePayout;

// Apply house edge adjustment
finalPayout = await GameAdjustmentHelper.adjustPayout(
    userId,
    'slots',
    basePayout,
    detectedPatterns  // Optional: patterns object
);
```

### 3. Multiplier Adjustment
```javascript
// For games with multipliers (crash, plinko, etc.)
const adjustedMultiplier = await GameAdjustmentHelper.adjustMultiplier(
    userId,
    'crash',
    2.5,              // Base multiplier
    patterns          // Detected patterns
);
```

### 4. Complete Outcome Adjustment
```javascript
// After determining game outcome
const outcome = {
    won: true,
    payout: 10000,
    betAmount: 5000,
    choice: 'red'    // Player's choice
};

// Check and potentially adjust outcome
const finalOutcome = await GameAdjustmentHelper.checkOutcomeAdjustment(
    userId,
    'roulette',
    outcome
);

// Use finalOutcome.payout and finalOutcome.won
```

### 5. Pattern Detection
```javascript
// Track player choices
const recentChoices = ['red', 'red', 'black', 'red', 'red'];

// Detect patterns
const patterns = await GameAdjustmentHelper.detectPatterns(
    userId,
    'roulette',
    recentChoices
);

// patterns will contain: { sequential: {...}, cyclic: {...}, etc. }
```

### 6. Difficulty Adjustment (Skill Games)
```javascript
// For skill-based games
const difficulty = await GameAdjustmentHelper.getDifficultyAdjustment(
    userId,
    'quiz'
);

// Use difficulty settings
const timeLimit = baseTime / difficulty.speedMultiplier;
const requiredAccuracy = difficulty.accuracyRequirement;
```

## Full Integration Example - Blackjack

```javascript
// In blackjack command
const GameAdjustmentHelper = require('../UTILS/gameAdjustmentHelper');

// Before game starts - check if player should be restricted
const action = await GameAdjustmentHelper.getRecommendedAction(userId);
if (action.action === 'block') {
    return await interaction.reply('You have been restricted from playing.');
}

// During game - track choices
const playerChoices = [];
playerChoices.push(action); // 'hit', 'stand', etc.

// Detect patterns
const patterns = await GameAdjustmentHelper.detectPatterns(
    userId, 
    'blackjack',
    playerChoices
);

// When determining outcome
let outcome = calculateBlackjackOutcome(); // Your existing logic

// Apply adjustments
outcome = await GameAdjustmentHelper.checkOutcomeAdjustment(
    userId,
    'blackjack',
    outcome
);

// Adjust payout based on house edge
if (outcome.won) {
    outcome.payout = await GameAdjustmentHelper.adjustPayout(
        userId,
        'blackjack',
        outcome.payout,
        patterns
    );
}
```

## Pattern Types

### Sequential Patterns
- Detects predictable sequences (A→B→C)
- Triggers when confidence > 65%
- Adjustment: +15% house edge

### Cyclic Patterns
- Detects repeating cycles
- Cycle lengths 2-5
- Adjustment: +12% house edge

### Clustering Patterns
- Detects grouping of similar choices
- 50% more clustering than random
- Adjustment: +10% house edge

### Markov Chain Patterns
- Detects state transition patterns
- High probability transitions
- Adjustment: +18% house edge

## Player Skill Levels

### Novice
- Win rate: 52%
- House edge: Base
- No penalties

### Intermediate
- Win rate: 45%
- House edge: Base + 5%
- Minor adjustments

### Expert
- Win rate: 38%
- House edge: Base + 15%
- Significant penalties

### Exploiter
- Win rate: 20%
- House edge: Base + 35%
- Maximum penalties

## Automatic Adjustments

### Win Streak Penalty
- After 5+ consecutive wins
- -2% win rate per additional win
- Maximum -30% penalty

### Profit Ratio Penalty
- When profit > 150% of investment
- -10% win rate per 100% excess
- Maximum -25% penalty

### Suspicious Activity
- High win rate (>70%)
- Excessive profits (>250%)
- Impossible streaks (>10)
- Bot-speed play (>10 games/min)

## Monitoring & Metrics

### Check Player Status
```javascript
const isSuspicious = await GameAdjustmentHelper.isSuspicious(userId);
if (isSuspicious) {
    // Log or alert admins
}
```

### Get Player Report
```javascript
const trendIntegration = require('../UTILS/trendAnalyzerIntegration');
const report = await trendIntegration.getPlayerReport(userId);

console.log(report);
// {
//   skillLevel: 'expert',
//   totalGames: 150,
//   winRate: 0.65,
//   profitRatio: 2.3,
//   suspiciousActivity: true,
//   currentAdjustments: {...}
// }
```

## Important Notes

1. **Invisible Adjustments**: All adjustments are mathematical and invisible to players
2. **Automatic Decay**: Adjustments decay 1% per hour, profiles decay 0.5% per day
3. **Fairness**: Minimum 15% win rate maintained even for exploiters
4. **Logging**: Significant adjustments are logged for monitoring
5. **Performance**: Pattern detection is cached for 5 minutes

## Testing

To test adjustments:
1. Create a test player profile with many wins
2. The system will automatically detect patterns
3. Watch win rates decrease and house edge increase
4. Check logs for adjustment messages

## Troubleshooting

- If adjustments aren't applying: Check that trend analyzer is initialized
- If patterns aren't detected: Ensure minimum 20 choices recorded
- If win rates too low: Check for decay and profile cleanup
- If performance issues: Check pattern cache size

## Configuration

Edit `AdvancedTrendAdjuster.js` config section to adjust:
- Base house edges
- Adjustment factors
- Detection thresholds
- Decay rates
- Win rate limits