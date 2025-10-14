# Protection Integration Guide

## 🔒 Ensuring Non-Economy Players & Developers Are Protected

This guide shows **exactly** how to integrate protection for:
1. **Developer** - Always exempt from all restrictions
2. **Non-economy players** - Get full multipliers
3. **Safe fallbacks** - If economy system fails

---

## 📋 Environment Setup

First, add to your `.env` file:

```env
# Developer ID (always exempt from economy)
DEVELOPER_ID=YOUR_DISCORD_USER_ID

# Optional: Other exempt users (comma-separated)
EXEMPT_USER_IDS=user_id_1,user_id_2,user_id_3
```

---

## 🎮 Integration Pattern (All Games)

### Step 1: Import Protection Helpers

```javascript
// At the top of your game file
const { calculateProtectedPayout, shouldApplyEconomy } = require('../BULLETPROOF_ECONOMY/v2/ProtectionHelpers');
```

### Step 2: Replace Payout Calculation

**BEFORE (Unsafe - no protection):**
```javascript
// DON'T DO THIS - no protection!
const payout = betAmount * baseMultiplier;
```

**AFTER (Safe - with protection):**
```javascript
// DO THIS - fully protected
const payoutCalc = await calculateProtectedPayout(
    userId,
    guildId,
    betAmount,
    baseMultiplier,
    'slots_regular' // or 'blackjack_win', 'roulette_number', etc.
);

const payout = payoutCalc.netPayout;

// Optional: Show user if economy was applied
if (!payoutCalc.economyApplied) {
    console.log(`User ${userId} exempt: ${payoutCalc.exemptReason}`);
}
```

---

## 🎰 Example: Slots Integration

```javascript
// GAMES/slots.js

const { calculateProtectedPayout, shouldApplyEconomy } = require('../BULLETPROOF_ECONOMY/v2/ProtectionHelpers');

async function calculatePayoutWithProtection(symbols, betAmount, userId, guildId) {
    // Check for win condition
    if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
        const symbol = symbols[0];
        const symbolData = SLOT_SYMBOLS[symbol];
        const baseMultiplier = symbolData.payout || symbolData.basePayout || 1.0;

        // Calculate payout with full protection
        const payoutCalc = await calculateProtectedPayout(
            userId,
            guildId,
            betAmount,
            baseMultiplier,
            'slots_regular'
        );

        return {
            won: true,
            payout: payoutCalc.netPayout,
            baseMultiplier: baseMultiplier,
            finalMultiplier: payoutCalc.finalMultiplier,
            economyApplied: payoutCalc.economyApplied,
            exemptReason: payoutCalc.exemptReason,
            type: `🎰 JACKPOT! Three ${symbolData.name}s!`
        };
    }

    // No win
    return {
        won: false,
        payout: 0,
        type: '💥 No matches - Try again!'
    };
}
```

---

## 🃏 Example: Blackjack Integration

```javascript
// GAMES/blackjack.js

const { calculateProtectedPayout, isExemptFromEconomy } = require('../BULLETPROOF_ECONOMY/v2/ProtectionHelpers');

class BlackjackGame {
    async calculateHandResult(playerHand, userId, guildId) {
        const playerValue = playerHand.getValue();
        const dealerValue = this.dealerHand.getValue();
        const effectiveBet = this.betAmount;

        let baseMultiplier = 0;
        let outcome = '';
        let won = false;

        // Determine outcome and base multiplier
        if (playerHand.isBusted()) {
            return { outcome: 'BUSTED', payout: 0, won: false };
        } else if (playerHand.isBlackjack() && !this.dealerHand.isBlackjack()) {
            baseMultiplier = 2.5;
            outcome = 'BLACKJACK';
            won = true;
        } else if (playerValue > dealerValue && !this.dealerHand.isBusted()) {
            baseMultiplier = 2.0;
            outcome = 'WIN';
            won = true;
        } else if (playerValue === dealerValue) {
            return { outcome: 'PUSH', payout: effectiveBet, won: false };
        } else {
            return { outcome: 'LOSE', payout: 0, won: false };
        }

        // Calculate payout with protection
        const payoutCalc = await calculateProtectedPayout(
            userId,
            guildId,
            effectiveBet,
            baseMultiplier,
            outcome === 'BLACKJACK' ? 'blackjack_bj' : 'blackjack_win'
        );

        return {
            outcome: outcome,
            payout: payoutCalc.netPayout,
            won: won,
            baseMultiplier: baseMultiplier,
            finalMultiplier: payoutCalc.finalMultiplier,
            economyApplied: payoutCalc.economyApplied,
            exemptReason: payoutCalc.exemptReason
        };
    }
}
```

---

## 🎲 Example: Roulette Integration

```javascript
// GAMES/roulette.js

const { calculateProtectedPayout, shouldApplyEconomy } = require('../BULLETPROOF_ECONOMY/v2/ProtectionHelpers');

class RouletteGame {
    async calculatePayoutWithProtection(result, userId, guildId) {
        const { type, amount } = this.currentBet;

        // Determine if bet won
        const won = this.checkIfWon(result, type);
        if (!won) return 0;

        // Get base multiplier
        const baseMultiplier = this.getBaseMultiplier(type);

        // Determine game type for minimum enforcement
        let gameType = 'roulette_color';
        if (['number', 'green'].includes(type)) {
            gameType = 'roulette_number';
        } else if (['dozen1', 'dozen2', 'dozen3', 'column1', 'column2', 'column3'].includes(type)) {
            gameType = 'roulette_dozen';
        }

        // Calculate payout with protection
        const payoutCalc = await calculateProtectedPayout(
            userId,
            guildId,
            amount,
            baseMultiplier,
            gameType
        );

        this.lastPayout = payoutCalc.netPayout;
        return payoutCalc.netPayout;
    }

    getBaseMultiplier(betType) {
        const multipliers = {
            'red': 2, 'black': 2, 'odd': 2, 'even': 2, 'low': 2, 'high': 2,
            'dozen1': 3, 'dozen2': 3, 'dozen3': 3,
            'column1': 3, 'column2': 3, 'column3': 3,
            'number': 36, 'green': 36, 'basket': 7
        };
        return multipliers[betType] || 0;
    }
}
```

---

## 🎨 UI Integration (Show Protection Status)

```javascript
// Show user their protection status in balance/profile command

const { getProtectionStatus, getUserMultiplierScale } = require('../BULLETPROOF_ECONOMY/v2/ProtectionHelpers');

async function showEconomyProfile(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild?.id;

    const protection = getProtectionStatus(userId);
    const scale = await getUserMultiplierScale(userId, guildId);

    const embed = {
        title: '💰 Your Economy Profile',
        fields: []
    };

    // Show protection status if applicable
    if (protection.protected) {
        embed.fields.push({
            name: '🛡️ Protection Status',
            value: `**${protection.reason}**\n✅ Full game multipliers\n${protection.noTaxDecay ? '✅ No tax or decay' : ''}`,
            inline: false
        });
    } else {
        embed.fields.push({
            name: '🎰 Multiplier Scale',
            value: `${(scale * 100).toFixed(0)}% of base odds`,
            inline: true
        });
    }

    await interaction.reply({ embeds: [embed] });
}
```

---

## ✅ Protection Checklist

### Developer Protection ✅
- [x] Developer ID in `.env`
- [x] `isExemptFromEconomy()` checks developer ID
- [x] All games use `calculateProtectedPayout()`
- [x] Developer gets full multipliers always
- [x] Developer exempt from tax/decay

### Non-Economy Player Protection ✅
- [x] Players with no wealth data get full multipliers
- [x] `calculateProtectedPayout()` checks for wealth = 0
- [x] Fallback to full multipliers if economy disabled
- [x] No errors if user not in economy database

### Safe Fallbacks ✅
- [x] Economy disabled → full multipliers
- [x] Economy error → full multipliers
- [x] Missing wealth data → full multipliers
- [x] Try-catch blocks in all calculations

---

## 🧪 Testing Protection

```javascript
// Test script to verify protection

async function testProtection() {
    // Test 1: Developer
    const devPayout = await calculateProtectedPayout(
        process.env.DEVELOPER_ID,
        null,
        100000,
        36,
        'roulette_number'
    );
    console.assert(devPayout.economyApplied === false, 'Developer should be exempt');
    console.assert(devPayout.finalMultiplier === 36, 'Developer gets full multiplier');

    // Test 2: Non-economy player
    const nonEconPayout = await calculateProtectedPayout(
        'non_existent_user',
        null,
        100000,
        36,
        'roulette_number'
    );
    console.assert(nonEconPayout.economyApplied === false, 'Non-economy player should be exempt');

    // Test 3: Economy disabled
    global.economy = null;
    const disabledPayout = await calculateProtectedPayout(
        'any_user',
        null,
        100000,
        36,
        'roulette_number'
    );
    console.assert(disabledPayout.economyApplied === false, 'Should fallback when disabled');

    console.log('✅ All protection tests passed!');
}
```

---

## ⚠️ Common Mistakes to Avoid

### ❌ DON'T: Direct calculation without protection
```javascript
// UNSAFE - No protection!
const payout = betAmount * multiplier;
```

### ✅ DO: Use protection helper
```javascript
// SAFE - Fully protected
const payoutCalc = await calculateProtectedPayout(userId, guildId, betAmount, multiplier, gameType);
```

### ❌ DON'T: Assume economy is always active
```javascript
// UNSAFE - Will crash if economy disabled!
const gameBalance = global.economy.getGameBalance();
```

### ✅ DO: Check if economy exists
```javascript
// SAFE - Checks first
if (shouldApplyEconomy(userId)) {
    const gameBalance = global.economy.getGameBalance();
    // ...
}
```

### ❌ DON'T: Hardcode developer ID
```javascript
// UNSAFE - Hardcoded ID
if (userId === '123456789') {
    // exempt
}
```

### ✅ DO: Use environment variable
```javascript
// SAFE - From .env
if (isExemptFromEconomy(userId)) {
    // exempt
}
```

---

## 📊 Protection Summary

| User Type | Multipliers | Tax/Decay | House Edge | Notes |
|-----------|-------------|-----------|------------|-------|
| Developer | 100% (Full) | None | 0% | Always exempt |
| Exempt Users | 100% (Full) | None | 0% | In EXEMPT_USER_IDS |
| Non-Economy | 100% (Full) | None | 0% | No wealth data |
| Economy Disabled | 100% (Full) | None | 0% | Fallback mode |
| Regular Player | Wealth-based | Yes | Scaled | Full system |

---

## 🚀 Quick Start

1. Add developer ID to `.env`:
   ```env
   DEVELOPER_ID=123456789012345678
   ```

2. Import protection helpers in games:
   ```javascript
   const { calculateProtectedPayout } = require('../BULLETPROOF_ECONOMY/v2/ProtectionHelpers');
   ```

3. Replace payout calculations:
   ```javascript
   const payoutCalc = await calculateProtectedPayout(userId, guildId, bet, multiplier, gameType);
   const payout = payoutCalc.netPayout;
   ```

4. Test with developer account:
   ```bash
   # Should see "Economy System Disabled" or "Developer Account" in logs
   ```

**Done! Developer and non-economy players are fully protected!** ✅
