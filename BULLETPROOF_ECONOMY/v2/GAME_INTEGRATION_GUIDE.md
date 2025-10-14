# Game Integration Guide - Wealth-Based Balance System

## 🎯 Overview

This guide shows exactly how to integrate the **GameBalanceController** and **GameEngineUI** into your existing games (slots, blackjack, roulette, etc.).

The system provides:
- ✅ **NO MAX BETS** - Players can bet as much as they want
- ✅ **Wealth-based multiplier scaling** - Wealthier players get reduced multipliers
- ✅ **Dynamic UI updates** - Shows adjusted multipliers transparently
- ✅ **House edge scaling** - Additional payout reduction at high wealth

---

## 📦 Step 1: Initialize in EconomyCore

First, ensure GameBalanceController is available globally through the economy system:

```javascript
// In BULLETPROOF_ECONOMY/v2/EconomyCore.js

const GameBalanceController = require('./GameBalanceController');
const GameEngineUI = require('./GameEngineUI');

class EconomyCore {
    constructor(database, logger, config = null) {
        this.database = database;
        this.logger = logger;
        this.config = config || require('./config');

        // Initialize game balance controller
        this.gameBalance = new GameBalanceController(database, this.config);

        // Initialize game UI adapter
        this.gameUI = new GameEngineUI(this.gameBalance);

        // ... rest of initialization
    }

    // Expose game balance methods
    getGameBalance() {
        return this.gameBalance;
    }

    getGameUI() {
        return this.gameUI;
    }
}
```

---

## 🎰 Step 2: Update Slots

### File: `GAMES/slots.js`

Add wealth-based multiplier adjustment to slot payouts:

```javascript
// At the top of the file
const GameBalanceController = require('../BULLETPROOF_ECONOMY/v2/GameBalanceController');

/**
 * Calculate payout with wealth-based adjustments
 */
async function calculatePayoutWithWealthScaling(symbols, betAmount, userId, guildId) {
    // Get game balance controller from global economy
    const gameBalance = global.economy ? global.economy.getGameBalance() : null;

    if (!gameBalance) {
        // Fallback to normal calculation if economy not initialized
        return calculatePayout(symbols, betAmount);
    }

    // Get user wealth
    const wealth = await gameBalance.getUserWealth(userId, guildId);

    // Check for three of a kind
    if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
        const symbol = symbols[0];
        const symbolData = SLOT_SYMBOLS[symbol];
        const baseMultiplier = symbolData.payout || symbolData.basePayout || 1.0;

        // Apply wealth-based scaling
        const adjustedMultiplier = gameBalance.applyWealthScaling(
            baseMultiplier,
            wealth,
            'slots_regular'
        );

        // Calculate gross payout
        const grossPayout = betAmount * adjustedMultiplier;

        // Apply house edge
        const netPayout = gameBalance.applyHouseEdge(grossPayout, wealth);

        return {
            won: true,
            payout: Math.floor(netPayout),
            multiplier: adjustedMultiplier,
            baseMultiplier: baseMultiplier,
            wealthAdjusted: true,
            type: `🎰 JACKPOT! Three ${symbolData.name}s!`
        };
    }

    // Check for two of a kind
    const counts = {};
    symbols.forEach(symbol => {
        counts[symbol] = (counts[symbol] || 0) + 1;
    });

    for (const symbol in counts) {
        if (counts[symbol] === 2) {
            const symbolData = SLOT_SYMBOLS[symbol];
            const baseMultiplier = (symbolData.payout || symbolData.basePayout || 1.0) * 0.85;

            // Apply wealth-based scaling
            const adjustedMultiplier = gameBalance.applyWealthScaling(
                baseMultiplier,
                wealth,
                'slots_regular'
            );

            const grossPayout = betAmount * adjustedMultiplier;
            const netPayout = gameBalance.applyHouseEdge(grossPayout, wealth);

            return {
                won: true,
                payout: Math.floor(netPayout),
                multiplier: adjustedMultiplier,
                baseMultiplier: baseMultiplier,
                wealthAdjusted: true,
                type: `🎯 Two ${symbolData.name}s!`
            };
        }
    }

    // No matches
    return {
        won: false,
        payout: 0,
        multiplier: 0,
        type: '💥 No matches - Try again!'
    };
}

// Export the new function
module.exports = {
    // ... existing exports
    calculatePayoutWithWealthScaling
};
```

### In your slots command file (COMMANDS/slots.js):

```javascript
// When showing multipliers to user before play
const gameUI = global.economy ? global.economy.getGameUI() : null;

if (gameUI) {
    const slotsUI = await gameUI.generateSlotsUI(userId, guildId, SLOT_SYMBOLS);

    // Show the adjusted multipliers
    const embed = {
        title: '🎰 Slots - Your Multipliers',
        description: slotsUI.symbolsDisplay.join('\n'),
        color: slotsUI.wealthInfo.color,
        footer: {
            text: slotsUI.wealthInfo.message
        }
    };

    await interaction.reply({ embeds: [embed] });
}

// When calculating payout after spin
const result = await calculatePayoutWithWealthScaling(
    finalSymbols,
    betAmount,
    interaction.user.id,
    interaction.guild?.id
);
```

---

## 🃏 Step 3: Update Blackjack

### File: `GAMES/blackjack.js`

Add wealth-based multiplier adjustment:

```javascript
// At the top of BlackjackGame class constructor
class BlackjackGame {
    constructor(userId, betAmount, guildId = null, modeConfig = null, currentWealth = 0) {
        this.userId = userId;
        this.guildId = guildId;
        this.betAmount = betAmount;
        this.currentWealth = currentWealth;

        // Store base mode config
        this.baseModeConfig = modeConfig || {
            name: 'Balanced',
            blackjackMultiplier: 2.5,
            winMultiplier: 2.0,
            houseEdge: 0.005
        };

        // Will be set to adjusted config
        this.modeConfig = this.baseModeConfig;

        // ... rest of initialization
    }

    /**
     * Initialize with wealth-based adjustments
     */
    async initializeWithWealthScaling() {
        const gameBalance = global.economy ? global.economy.getGameBalance() : null;

        if (!gameBalance) {
            return; // Use base config
        }

        const wealth = await gameBalance.getUserWealth(this.userId, this.guildId);
        this.currentWealth = wealth;

        // Get adjusted multipliers
        const adjusted = await gameBalance.getAdjustedBlackjackMultipliers(
            this.userId,
            this.guildId,
            this.baseModeConfig
        );

        this.modeConfig = adjusted.modeConfig;
    }

    /**
     * Calculate hand result with wealth adjustments
     */
    async calculateHandResult(playerHand, options = {}) {
        const playerValue = playerHand.getValue();
        const dealerValue = this.dealerHand.getValue();
        const effectiveBet = this.betAmount * playerHand.getBetMultiplier();

        let payout = 0;
        let outcome = '';
        let won = false;

        // Use the adjusted modeConfig multipliers
        if (playerHand.isBusted()) {
            payout = 0;
            outcome = 'BUSTED';
            won = false;
        } else if (this.dealerHand.isBusted()) {
            payout = effectiveBet * this.modeConfig.winMultiplier;
            outcome = 'DEALER BUSTED';
            won = true;
        } else if (playerHand.isBlackjack() && !this.dealerHand.isBlackjack()) {
            payout = effectiveBet * this.modeConfig.blackjackMultiplier;
            outcome = 'BLACKJACK';
            won = true;
        } else if (playerValue === dealerValue) {
            payout = effectiveBet;
            outcome = 'PUSH';
            won = false;
        } else if (playerValue > dealerValue) {
            payout = effectiveBet * this.modeConfig.winMultiplier;
            outcome = 'WIN';
            won = true;
        } else {
            payout = 0;
            outcome = 'LOSE';
            won = false;
        }

        // Apply house edge if economy system active
        if (global.economy && this.currentWealth > 0) {
            const gameBalance = global.economy.getGameBalance();
            const adjustment = await gameBalance.applyFinalPayoutAdjustment(
                this.userId,
                this.guildId,
                payout
            );
            payout = adjustment.netPayout;
        }

        return {
            outcome,
            payout: Math.floor(payout),
            won,
            betAmount: effectiveBet,
            // ... other fields
        };
    }
}
```

### In your blackjack command file (COMMANDS/blackjack.js):

```javascript
// When starting a game
const game = new BlackjackGame(userId, betAmount, guildId);

// Initialize with wealth scaling
await game.initializeWithWealthScaling();

// Show adjusted multipliers to user
const gameUI = global.economy ? global.economy.getGameUI() : null;
if (gameUI) {
    const bjUI = await gameUI.generateBlackjackUI(userId, guildId, game.baseModeConfig);

    // Show in embed
    const embed = {
        title: '🃏 Blackjack - Your Multipliers',
        description: bjUI.payoutsDisplay.join('\n'),
        // ... rest of embed
    };
}
```

---

## 🎲 Step 4: Update Roulette

### File: `GAMES/roulette.js`

Add wealth-based multiplier adjustment:

```javascript
class RouletteGame {
    constructor(userId, betAmount, guildId = null) {
        this.userId = userId;
        this.guildId = guildId;
        this.betAmount = betAmount;
        this.currentWealth = 0;
        // ... rest of initialization
    }

    /**
     * Calculate payout with wealth-based adjustments
     */
    async calculatePayoutWithWealthScaling(result) {
        if (!this.currentBet) return 0;

        const { type, amount, numbers } = this.currentBet;

        // Determine if bet won
        let won = false;
        const numResult = result === '00' ? '00' : Number(result);

        // ... bet winning logic (same as before)

        if (!won) {
            this.lastPayout = 0;
            return 0;
        }

        // Get base payout multiplier
        let basePayout = 0;
        switch (type) {
            case 'red':
            case 'black':
            case 'odd':
            case 'even':
            case 'low':
            case 'high':
                basePayout = 2;
                break;
            case 'dozen1':
            case 'dozen2':
            case 'dozen3':
            case 'column1':
            case 'column2':
            case 'column3':
                basePayout = 3;
                break;
            case 'number':
            case 'green':
                basePayout = 36;
                break;
            case 'basket':
                basePayout = 7;
                break;
        }

        // Apply wealth-based scaling
        const gameBalance = global.economy ? global.economy.getGameBalance() : null;

        if (!gameBalance) {
            // Fallback to normal calculation
            const payout = amount * basePayout;
            this.lastPayout = payout;
            return payout;
        }

        const wealth = await gameBalance.getUserWealth(this.userId, this.guildId);
        this.currentWealth = wealth;

        // Get adjusted multiplier
        const adjusted = await gameBalance.getAdjustedRouletteMultipliers(
            this.userId,
            this.guildId,
            basePayout,
            type
        );

        // Calculate payout with adjustments
        const payoutCalc = gameBalance.calculateAdjustedPayout(
            amount,
            basePayout,
            wealth,
            'roulette_' + (type === 'number' || type === 'green' ? 'number' : type === 'dozen1' ? 'dozen' : 'color')
        );

        this.lastPayout = payoutCalc.netPayout;
        return payoutCalc.netPayout;
    }

    /**
     * Get adjusted payout odds for display
     */
    async getAdjustedPayoutOdds(betType) {
        const basePayout = this.getBasePayoutForType(betType);

        const gameBalance = global.economy ? global.economy.getGameBalance() : null;
        if (!gameBalance) {
            return this.formatMultiplier(basePayout);
        }

        const wealth = await gameBalance.getUserWealth(this.userId, this.guildId);
        const adjusted = await gameBalance.getAdjustedRouletteMultipliers(
            this.userId,
            this.guildId,
            basePayout,
            betType
        );

        // Show both base and adjusted if different
        if (Math.abs(basePayout - adjusted.adjustedPayout) < 0.01) {
            return this.formatMultiplier(adjusted.adjustedPayout);
        }

        return `~~${this.formatMultiplier(basePayout)}~~ → **${this.formatMultiplier(adjusted.adjustedPayout)}**`;
    }

    getBasePayoutForType(betType) {
        const payouts = {
            'red': 2, 'black': 2, 'odd': 2, 'even': 2, 'low': 2, 'high': 2,
            'dozen1': 3, 'dozen2': 3, 'dozen3': 3,
            'column1': 3, 'column2': 3, 'column3': 3,
            'number': 36, 'green': 36, 'basket': 7
        };
        return payouts[betType] || 0;
    }
}
```

### In your roulette command file (COMMANDS/roulette.js):

```javascript
// When showing bet options
const gameUI = global.economy ? global.economy.getGameUI() : null;

if (gameUI) {
    const rouletteUI = await gameUI.generateRouletteUI(userId, guildId);

    const embed = {
        title: '🎲 Roulette - Your Multipliers',
        description: rouletteUI.payoutsDisplay.join('\n'),
        color: rouletteUI.wealthInfo.color,
        footer: {
            text: rouletteUI.wealthInfo.message
        }
    };

    await interaction.reply({ embeds: [embed] });
}

// When calculating result
const game = new RouletteGame(userId, betAmount, guildId);
game.placeBet(betType, betAmount, numbers);
const result = game.spin();
const payout = await game.calculatePayoutWithWealthScaling(result);
```

---

## 📊 Step 5: Add Wealth Info Command

Create a new command to show users their current multiplier scaling:

```javascript
// COMMANDS/economy-info.js

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('economy-info')
        .setDescription('View your current wealth and game multiplier scaling'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild?.id;

        if (!global.economy) {
            return await interaction.reply({
                content: '❌ Economy system not initialized.',
                ephemeral: true
            });
        }

        try {
            const gameBalance = global.economy.getGameBalance();
            const wealth = await gameBalance.getUserWealth(userId, guildId);
            const wealthInfo = gameBalance.getWealthBracketInfo(wealth);

            const embed = {
                title: '💰 Your Economy Profile',
                color: global.economy.getGameUI().getWealthColor(wealth),
                fields: [
                    {
                        name: '💎 Total Wealth',
                        value: `$${wealth.toLocaleString()}`,
                        inline: true
                    },
                    {
                        name: '🏆 Bracket',
                        value: wealthInfo.bracketName,
                        inline: true
                    },
                    {
                        name: '🎰 Multiplier Scale',
                        value: `${wealthInfo.multiplierPercent}% of base odds`,
                        inline: true
                    },
                    {
                        name: '🏦 House Edge',
                        value: `${wealthInfo.houseEdgePercent}%`,
                        inline: true
                    },
                    {
                        name: '📊 Daily Tax',
                        value: `${(wealth * 0.0005).toLocaleString()} (0.05%)`,
                        inline: true
                    },
                    {
                        name: '⏳ Daily Decay',
                        value: `${(wealth * 0.0001).toLocaleString()} (0.01%)`,
                        inline: true
                    },
                    {
                        name: 'ℹ️ Status',
                        value: wealthInfo.message,
                        inline: false
                    }
                ],
                footer: {
                    text: 'Use /slots-info, /blackjack-info, or /roulette-info for game-specific multipliers'
                }
            };

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Economy info error:', error);
            await interaction.reply({
                content: '❌ Failed to retrieve economy information.',
                ephemeral: true
            });
        }
    }
};
```

---

## 🎮 Step 6: Add Game-Specific Info Commands

### Slots Info:
```javascript
// COMMANDS/slots-info.js
const gameUI = global.economy.getGameUI();
const slotsUI = await gameUI.generateSlotsUI(userId, guildId, SLOT_SYMBOLS);
await interaction.reply({ embeds: [slotsUI.embed] });
```

### Blackjack Info:
```javascript
// COMMANDS/blackjack-info.js
const baseModeConfig = {
    blackjackMultiplier: 2.5,
    winMultiplier: 2.0,
    houseEdge: 0.005
};
const gameUI = global.economy.getGameUI();
const bjUI = await gameUI.generateBlackjackUI(userId, guildId, baseModeConfig);
await interaction.reply({ embeds: [bjUI.embed] });
```

### Roulette Info:
```javascript
// COMMANDS/roulette-info.js
const gameUI = global.economy.getGameUI();
const rouletteUI = await gameUI.generateRouletteUI(userId, guildId);
await interaction.reply({ embeds: [rouletteUI.embed] });
```

---

## 📈 Step 7: Add Bet Preview

Show users exactly what they'll win/lose before betting:

```javascript
// In any game command, before executing the bet
const gameUI = global.economy.getGameUI();

const preview = await gameUI.generateBetPreview(
    interaction.user.id,
    interaction.guild?.id,
    betAmount,
    36, // base multiplier (e.g., roulette green)
    'roulette_number'
);

const confirmEmbed = {
    ...preview.embed,
    title: '🎲 Confirm Your Bet',
    description: 'React to confirm or cancel'
};

await interaction.reply({ embeds: [confirmEmbed] });
```

---

## 🔧 Testing Checklist

1. **Initialize System**:
   ```javascript
   // In your main bot file
   await global.economy.initialize();
   console.log('Game balance system ready!');
   ```

2. **Test with Poor User** (<$1M):
   - Should see 100% multipliers
   - Full game odds
   - Easy to win

3. **Test with Rich User** ($100M):
   - Should see ~40% multipliers
   - Reduced payouts
   - Harder to maintain wealth

4. **Test with Billionaire** ($1B+):
   - Should see ~8% multipliers
   - Very reduced payouts
   - Nearly impossible to grow wealth

5. **Test UI Commands**:
   - `/economy-info` - Shows wealth bracket
   - `/slots-info` - Shows adjusted slot multipliers
   - `/blackjack-info` - Shows adjusted BJ multipliers
   - `/roulette-info` - Shows adjusted roulette multipliers

---

## ⚠️ Common Pitfalls

1. **Don't forget to await** `initializeWithWealthScaling()` in game constructors
2. **Always check if `global.economy` exists** before using game balance
3. **Use `Math.floor()` on final payouts** to avoid decimal issues
4. **Store guildId** in game classes for proper wealth calculation
5. **Update UI before each game** - wealth may have changed since last play

---

## 🎯 Expected Behavior

- **Poor players**: Full multipliers, easy wins, fun progression
- **Million-dollar players**: Slight reduction, still very playable
- **Hundred-million players**: Significant reduction, need skill
- **Billionaires**: Severe reduction, slow drain inevitable

---

*Version: 1.0.0 - Game Integration*
*Complete guide for wealth-based balance system*
