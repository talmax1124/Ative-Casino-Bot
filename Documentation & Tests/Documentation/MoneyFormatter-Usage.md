# Money Formatter Utility Documentation

## Overview

The Money Formatter utility (`UTILS/moneyFormatter.js`) provides comprehensive money parsing, formatting, and validation functions for ATIVE Casino Bot. It supports various input formats including K/M/B/T suffixes and special keywords.

## Key Features

- **Universal Money Parsing**: Supports numbers, K/M/B/T suffixes, and special keywords
- **Input Validation**: Comprehensive validation with clear error messages  
- **Multiple Formats**: Both abbreviated and full formatting options
- **Special Keywords**: "all", "half", "quarter", "min", "max" support
- **Backward Compatibility**: Maintains compatibility with existing `fmt` functions

## Supported Input Formats

### Numeric Values
- `1000` - Raw numbers
- `1,000` - Numbers with commas
- `1000.50` - Decimal numbers

### Suffixes
- `K` - Thousands (1k = 1,000)
- `M` - Millions (1m = 1,000,000)  
- `B` - Billions (1b = 1,000,000,000)
- `T` - Trillions (1t = 1,000,000,000,000)
- `Q` - Quadrillions (1q = 1,000,000,000,000,000)

### Special Keywords
- `all` or `a` - All available wallet balance
- `half` or `h` - Half of wallet balance
- `quarter` or `q` - Quarter of wallet balance
- `min` - Minimum allowed amount
- `max` - Maximum allowed amount (same as `all`)

### Examples
```
"100k" → 100,000
"2.5m" → 2,500,000
"1b" → 1,000,000,000
"all" → User's full wallet balance
"half" → 50% of wallet balance
"quarter" → 25% of wallet balance
```

## Core Functions

### `parseAmount(amountStr)`
Parses amount strings into numbers or special keywords.

```javascript
const { parseAmount } = require('../UTILS/moneyFormatter');

parseAmount("100k");     // Returns: 100000
parseAmount("2.5m");     // Returns: 2500000
parseAmount("all");      // Returns: "all"
parseAmount("invalid");  // Returns: null
```

### `resolveAmount(amount, walletAmount, minAmount, maxAmount)`
Resolves special keywords to actual amounts based on wallet balance.

```javascript
const { resolveAmount } = require('../UTILS/moneyFormatter');

resolveAmount("all", 50000);      // Returns: 50000
resolveAmount("half", 50000);     // Returns: 25000
resolveAmount(10000, 50000);      // Returns: 10000
resolveAmount("all", 50000, 1000, 30000); // Returns: 30000 (capped)
```

### `validateAmount(amountStr, walletAmount, minAmount, maxAmount)`
Comprehensive validation with error messages.

```javascript
const { validateAmount } = require('../UTILS/moneyFormatter');

const result = validateAmount("100k", 50000, 1000);
if (result.isValid) {
    console.log("Amount:", result.amount); // 100000
} else {
    console.log("Error:", result.error);
}
```

### Formatting Functions

```javascript
const { formatMoney, formatMoneyFull, formatDelta } = require('../UTILS/moneyFormatter');

formatMoney(1500);        // Returns: "$1.50K"
formatMoneyFull(1500);    // Returns: "$1,500.00"
formatDelta(1500, 1000);  // Returns: "+$500.00"
```

## Implementation Examples

### Basic Command with Money Input

```javascript
const { SlashCommandBuilder } = require('discord.js');
const { validateAmount, formatMoneyFull } = require('../UTILS/moneyFormatter');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('example')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to bet (supports K/M/B/T, "all", "half")')
                .setRequired(true)
        ),

    async execute(interaction) {
        const amountStr = interaction.options.getString('amount');
        const userBalance = await getUserBalance(interaction.user.id);
        
        // Validate amount
        const validation = validateAmount(amountStr, userBalance.wallet, 100);
        
        if (!validation.isValid) {
            return await interaction.reply({
                content: `❌ ${validation.error}`,
                ephemeral: true
            });
        }
        
        const amount = validation.amount;
        // Proceed with validated amount...
    }
};
```

### Advanced Usage with Custom Limits

```javascript
const { validateAmount } = require('../UTILS/moneyFormatter');

// Custom validation with min/max limits
const validation = validateAmount(
    userInput,        // e.g., "5k"
    userWallet,       // e.g., 100000
    1000,            // min: $1,000
    50000            // max: $50,000
);

if (validation.isValid) {
    // Use validation.amount
} else {
    // Show validation.error
}
```

## Updated Commands

The following commands have been updated to use the Money Formatter utility:

### ✅ Commands Using PayoutManager (Already Support K/M/B/T)
- `/blackjack` - Uses PayoutManager.validateAndDeductBet()
- `/slots` - Uses PayoutManager.validateAndDeductBet()
- `/duck` - Uses PayoutManager.validateAndDeductBet()
- `/plinko` - Uses parseAmount() directly
- `/fishing` - Uses parseAmount() 
- `/rps` - Uses parseAmount()
- `/battleship` - Uses parseAmount()
- `/bingo` - Uses parseAmount()
- `/uno` - Uses parseAmount()

### ✅ Recently Updated Commands
- `/sendmoney` - Updated from integer to string option with K/M/B/T support
- `/admin` (addmoney/setmoney) - Updated from integer to string option with K/M/B/T support

### Commands That May Need Review
- `/crash` - Uses string option but custom parsing (appears to support K/M already)
- `/withdraw` - Uses parseAmount() 
- `/deposit` - Uses parseAmount()

## Benefits

1. **Consistency**: All commands use the same parsing logic
2. **User Experience**: Users can use familiar abbreviations (1k, 5m, etc.)
3. **Flexibility**: Supports "all", "half" for convenience
4. **Validation**: Clear error messages for invalid inputs
5. **Maintainability**: Centralized money handling logic
6. **Performance**: Optimized parsing with proper error handling

## Migration Guide

### For New Commands
```javascript
// Old way (don't do this)
.addIntegerOption(option =>
    option.setName('amount')
        .setDescription('Amount')
        .setRequired(true)
)

// New way (recommended)
.addStringOption(option =>
    option.setName('amount')
        .setDescription('Amount (supports K/M/B/T, "all", "half")')
        .setRequired(true)
)
```

### In Execute Function
```javascript
// Old way
const amount = interaction.options.getInteger('amount');
if (amount > userWallet) {
    // handle error
}

// New way
const amountStr = interaction.options.getString('amount');
const validation = validateAmount(amountStr, userWallet, minAmount);
if (!validation.isValid) {
    return await interaction.reply({ content: `❌ ${validation.error}`, ephemeral: true });
}
const amount = validation.amount;
```

## Testing Examples

```javascript
// Test various inputs
console.log(parseAmount("1000"));    // 1000
console.log(parseAmount("5k"));      // 5000
console.log(parseAmount("2.5m"));    // 2500000
console.log(parseAmount("1b"));      // 1000000000
console.log(parseAmount("all"));     // "all"
console.log(parseAmount("half"));    // "half"
console.log(parseAmount("invalid")); // null

// Test formatting
console.log(formatMoney(1500));      // "$1.50K"
console.log(formatMoneyFull(1500));  // "$1,500.00"
```

This utility ensures consistent, user-friendly money handling across all bot commands while maintaining backward compatibility and providing comprehensive validation.