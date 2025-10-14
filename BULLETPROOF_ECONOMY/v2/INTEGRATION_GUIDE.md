# Integration Guide - Bulletproof Economy V2

This guide shows you exactly how to integrate the new economy system into your bot.

## Step 1: Initialize in Your Main Bot File

In your `index.js` or main bot file, add the economy initialization:

```javascript
// At the top with your other requires
const EconomyCore = require('./BULLETPROOF_ECONOMY/v2/EconomyCore');
const database = require('./UTILS/database');
const logger = require('./UTILS/logger');

// Create global economy instance
global.economy = null;

// In your client.once('ready') event
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Initialize database
    await database.initialize();

    // Initialize economy system
    console.log('Initializing Bulletproof Economy V2...');
    global.economy = new EconomyCore(database, logger);
    await global.economy.initialize();
    console.log('✅ Economy system ready!');

    // Your other initialization code...
});
```

## Step 2: Update Work/Daily Commands

Replace your existing work/daily reward logic:

### OLD CODE (Example):
```javascript
// OLD - Don't use this
const reward = 500;
await database.updateUserBalance(userId, null, reward, 0);
```

### NEW CODE:
```javascript
// NEW - Use the economy system
async function executeWorkCommand(interaction) {
    const userId = interaction.user.id;

    try {
        // Issue work reward through economy system
        const result = await global.economy.issueReward(userId, 'WORK');

        if (result.success) {
            const embed = {
                color: 0x00FF00,
                title: '💼 Work Complete!',
                description: `You earned **$${result.amount}** coins!`,
                fields: [
                    {
                        name: 'Base Reward',
                        value: `$${result.baseAmount}`,
                        inline: true
                    },
                    {
                        name: 'Multiplier',
                        value: `${(result.multiplier * 100).toFixed(1)}%`,
                        inline: true
                    }
                ]
            };

            if (result.reduced) {
                embed.fields.push({
                    name: '📉 Diminishing Returns',
                    value: `Reduced by $${result.reductionAmount} due to wealth/repetition`
                });
            }

            await interaction.reply({ embeds: [embed] });
        } else {
            await interaction.reply({
                content: `❌ ${result.reason}${result.cooldown ? `\nCooldown: ${result.cooldownFormatted}` : ''}`,
                ephemeral: true
            });
        }
    } catch (error) {
        logger.error('Work command error:', error);
        await interaction.reply({
            content: '❌ An error occurred. Please try again.',
            ephemeral: true
        });
    }
}
```

## Step 3: Update Transfer/Give Commands

Replace your transfer logic:

### OLD CODE:
```javascript
// OLD - Don't use this
await database.updateUserBalance(senderId, null, -amount, 0);
await database.updateUserBalance(recipientId, null, amount, 0);
```

### NEW CODE:
```javascript
async function executeTransferCommand(interaction, recipientUser, amount) {
    const senderId = interaction.user.id;
    const recipientId = recipientUser.id;

    try {
        // Process transfer through economy system
        const result = await global.economy.processTransfer(
            senderId,
            recipientId,
            amount,
            'user_give'
        );

        if (result.success) {
            const embed = {
                color: 0x00FF00,
                title: '💸 Transfer Complete!',
                description: `Successfully sent **$${result.amount}** to ${recipientUser.username}!`,
                fields: [
                    {
                        name: 'Amount Sent',
                        value: `$${result.amount}`,
                        inline: true
                    },
                    {
                        name: 'Transaction Fee',
                        value: `$${result.fee} (${result.feePercentage.toFixed(2)}%)`,
                        inline: true
                    },
                    {
                        name: 'Total Deducted',
                        value: `$${result.totalDeducted}`,
                        inline: true
                    }
                ]
            };

            // Warning if flagged for collusion
            if (result.collusionCheck && result.collusionCheck.suspicious) {
                embed.footer = {
                    text: `⚠️ Transfer flagged (Score: ${result.collusionCheck.score.toFixed(1)})`
                };
            }

            await interaction.reply({ embeds: [embed] });
        } else {
            await interaction.reply({
                content: `❌ Transfer failed:\n${result.errors.join('\n')}`,
                ephemeral: true
            });
        }
    } catch (error) {
        logger.error('Transfer command error:', error);
        await interaction.reply({
            content: '❌ An error occurred. Please try again.',
            ephemeral: true
        });
    }
}
```

## Step 4: Update Balance Command

Add economy profile info to your balance command:

```javascript
async function executeBalanceCommand(interaction) {
    const userId = interaction.user.id;
    const user = interaction.user;

    try {
        // Get balance from database
        const balance = await database.getUserBalance(userId, null);

        // Get economy profile
        const profile = await global.economy.getUserEconomyProfile(userId);

        const embed = {
            color: 0x3498db,
            title: `💰 ${user.username}'s Economy Profile`,
            thumbnail: {
                url: user.displayAvatarURL()
            },
            fields: [
                {
                    name: '💵 Wallet',
                    value: `$${balance.wallet.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '🏦 Bank',
                    value: `$${balance.bank.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '💎 Total Wealth',
                    value: `$${profile.balance.total.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '📊 Tax Info',
                    value: `Rate: ${(profile.taxation.taxRate * 100).toFixed(2)}%\nNext tax: $${profile.taxation.nextTaxAmount.toFixed(0)}`,
                    inline: true
                },
                {
                    name: '🎯 Daily Limit',
                    value: `Max earnings: $${profile.limits.maxDailyEarnings.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '🔒 Status',
                    value: profile.security.frozen ? '🔒 **FROZEN**' : '✅ Active',
                    inline: true
                }
            ]
        };

        if (profile.security.suspicious) {
            embed.footer = {
                text: `⚠️ Account flagged (${profile.security.flags} flags)`
            };
        }

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        logger.error('Balance command error:', error);
        await interaction.reply({
            content: '❌ Failed to retrieve balance.',
            ephemeral: true
        });
    }
}
```

## Step 5: Add Admin Economy Command

Create a new admin-only economy stats command:

```javascript
async function executeEconomyStatsCommand(interaction) {
    // Check if user is admin
    if (interaction.user.id !== process.env.DEVELOPER_ID) {
        return await interaction.reply({
            content: '❌ Admin only command.',
            ephemeral: true
        });
    }

    try {
        const stats = global.economy.getEconomyStats();
        const health = await global.economy.healthCheck();

        const embed = {
            title: '📊 Economy System Statistics',
            color: health.overall === 'HEALTHY' ? 0x00FF00 : 0xFF0000,
            fields: [
                {
                    name: '🏦 Supply',
                    value: `Current: $${stats.supply.currentSupply.toLocaleString()}\nCap: $${stats.supply.supplyCap.toLocaleString()}\nUtilization: ${stats.supply.utilizationPercent.toFixed(2)}%\nEmergency Mode: ${stats.supply.emergencyMode ? '🚨 YES' : '✅ NO'}`,
                    inline: false
                },
                {
                    name: '💸 Minting & Burning',
                    value: `Minted: $${stats.supply.totalMinted.toLocaleString()}\nBurned: $${stats.supply.totalBurned.toLocaleString()}\nNet: $${stats.supply.netSupply.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '🏛️ Taxation',
                    value: `Taxes: $${stats.taxation.totalTaxesCollected.toLocaleString()}\nDecay: $${stats.taxation.totalDecayApplied.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '💱 Transactions',
                    value: `Count: ${stats.transactions.transactionCount}\nFees: $${stats.transactions.totalFeesCollected.toLocaleString()}\nAvg Fee: $${stats.transactions.averageFee.toFixed(2)}`,
                    inline: true
                },
                {
                    name: '🚨 Security',
                    value: `Suspicious: ${stats.collusion.suspiciousAccounts}\nFrozen: ${stats.collusion.frozenAccounts}\nCases: ${stats.collusion.totalCases}`,
                    inline: true
                },
                {
                    name: '⚡ System',
                    value: `Uptime: ${Math.floor(stats.system.uptime / 3600000)}h\nOperations: ${stats.system.operations}\nHealth: ${health.overall}`,
                    inline: false
                }
            ]
        };

        if (health.warnings.length > 0) {
            embed.fields.push({
                name: '⚠️ Warnings',
                value: health.warnings.join('\n')
            });
        }

        if (health.errors.length > 0) {
            embed.fields.push({
                name: '🚨 Errors',
                value: health.errors.join('\n')
            });
        }

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        logger.error('Economy stats error:', error);
        await interaction.reply({
            content: '❌ Failed to retrieve economy stats.',
            ephemeral: true
        });
    }
}
```

## Step 6: Game Integration

For game rewards (slots, blackjack, etc.), you don't need to change much because games don't go through the reward system - they directly modify balances. However, you should add validation:

```javascript
async function startGame(interaction, betAmount) {
    const userId = interaction.user.id;

    // Check if account is frozen
    const permission = await global.economy.checkUserPermission(userId, 'GAMES');
    if (!permission.allowed) {
        return await interaction.reply({
            content: `❌ ${permission.reason}`,
            ephemeral: true
        });
    }

    // Your existing game logic...
    // Games directly modify wallet through database.updateUserBalance()
    // This is fine - the economy system doesn't interfere with games
}
```

## Step 7: Optional - Fee Preview

Before transfers, show users the fee:

```javascript
async function showTransferPreview(interaction, amount) {
    const feeCalc = global.economy.calculateTransactionFee(amount);

    const embed = {
        title: '💸 Transfer Preview',
        color: 0x3498db,
        fields: [
            {
                name: 'Amount to Send',
                value: `$${amount.toLocaleString()}`,
                inline: true
            },
            {
                name: 'Transaction Fee',
                value: `$${feeCalc.fee.toLocaleString()} (${feeCalc.percentage.toFixed(2)}%)`,
                inline: true
            },
            {
                name: 'Total Cost',
                value: `$${(amount + feeCalc.fee).toLocaleString()}`,
                inline: true
            },
            {
                name: 'Recipient Gets',
                value: `$${feeCalc.netAmount.toLocaleString()}`,
                inline: false
            }
        ],
        footer: {
            text: 'Confirm to proceed'
        }
    };

    // Add confirmation buttons
    // ... your button logic
}
```

## Step 8: Reward Preview

Show users what they'll earn before working:

```javascript
async function showWorkPreview(interaction) {
    const userId = interaction.user.id;

    const calculation = await global.economy.calculateReward(userId, 'WORK');

    const embed = {
        title: '💼 Work Reward Preview',
        fields: [
            {
                name: 'Base Reward',
                value: `$${calculation.baseReward}`,
                inline: true
            },
            {
                name: 'Your Multiplier',
                value: `${(calculation.multiplier * 100).toFixed(1)}%`,
                inline: true
            },
            {
                name: 'You Will Earn',
                value: `$${calculation.finalReward}`,
                inline: true
            }
        ],
        footer: {
            text: `Reduced by $${calculation.reducedFromBase} due to wealth/repetition`
        }
    };

    // ... your command logic
}
```

## Step 9: Testing Checklist

Before deploying:

1. **Test Initialization**
   ```bash
   node index.js
   # Check logs for "Economy system ready!"
   ```

2. **Test Work Command**
   - Use `/work` as poor user → should get full reward
   - Use `/work` as rich user → should get reduced reward
   - Use `/work` repeatedly → should see cooldown

3. **Test Transfer**
   - Transfer small amount → should see small fee
   - Transfer large amount → should see large fee
   - Transfer repeatedly between two accounts → should trigger collusion warning

4. **Test Balance**
   - Check balance display shows economy profile
   - Verify tax info is shown

5. **Test Admin Stats**
   - Run economy stats command
   - Verify all systems show "OK"

## Step 10: Monitor and Tune

After deployment:

1. **Monitor Supply**
   ```javascript
   // Run this periodically (e.g., daily)
   const health = await global.economy.getSupplyHealth();
   if (!health.healthy) {
       console.warn('Supply issues:', health.warnings);
   }
   ```

2. **Review Collusion**
   ```javascript
   const stats = global.economy.getEconomyStats();
   console.log('Frozen accounts:', stats.collusion.frozenAccounts);
   // Review frozen accounts periodically
   ```

3. **Tune Parameters**
   - If users complain rewards are too low → adjust `config.js` multipliers
   - If supply grows too fast → increase tax rates or decay
   - If too many false positives → adjust collusion thresholds

## Quick Command Reference

```javascript
// Issue reward
await global.economy.issueReward(userId, 'WORK');

// Process transfer
await global.economy.processTransfer(senderId, recipientId, amount);

// Calculate reward (preview)
await global.economy.calculateReward(userId, 'WORK');

// Calculate fee (preview)
global.economy.calculateTransactionFee(amount);

// Get stats
global.economy.getEconomyStats();

// Health check
await global.economy.healthCheck();

// Get user profile
await global.economy.getUserEconomyProfile(userId);

// Check permission
await global.economy.checkUserPermission(userId, 'WORK');

// Admin: Manual tax cycle
await global.economy.runTaxationCycle();

// Admin: Manual decay cycle
await global.economy.runDecayCycle();

// Admin: Emergency burn
await global.economy.emergencyBurn(amount, reason);
```

## Common Pitfalls to Avoid

1. **Don't initialize multiple times** - Only call `initialize()` once
2. **Don't bypass the system** - Always use `issueReward()` for rewards, not direct database updates
3. **Don't ignore errors** - Always handle result.success === false
4. **Don't forget to check frozen status** - Call `checkUserPermission()` before critical operations
5. **Don't forget to initialize database first** - Economy requires database to be ready

## Migration Path

If you want to gradually migrate:

### Phase 1: Add Economy System (Non-Breaking)
- Initialize economy in parallel with old system
- Test commands without affecting production
- Monitor stats

### Phase 2: Migrate Work/Daily Commands
- Update only work and daily commands to use new system
- Keep transfers on old system
- Monitor for issues

### Phase 3: Migrate Transfers
- Update transfer commands to use new system
- Monitor collusion detection

### Phase 4: Full Cutover
- All economy operations go through new system
- Disable old economy code

---

**Need Help?**

Check the logs - the economy system logs extensively. Look for:
- `[EconomyCore]` - Main system events
- `[SupplyController]` - Minting/burning events
- `[TaxationSystem]` - Tax and decay events
- `[RewardController]` - Reward calculations
- `[TransactionManager]` - Transfer events
- `[AntiCollusionDetector]` - Security events

For detailed documentation, see `README.md`
