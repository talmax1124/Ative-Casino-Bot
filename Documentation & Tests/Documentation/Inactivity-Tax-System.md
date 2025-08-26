# Inactivity Tax System

The ATIVE Casino Bot now includes an inactivity tax system that encourages active participation and prevents wealth hoarding.

## 📋 Overview

**Rule**: Players must play at least ONE game every 3 days to avoid taxation.

**Purpose**: 
- Encourage active gameplay 
- Prevent money hoarding
- Keep the economy dynamic
- Reward active players

## 💸 Tax Rates by Tier

The tax system uses progressive rates - higher tiers pay higher taxes!

| Tier | Tax Rate | Example ($100K) |
|------|----------|-----------------|
| 🥉 Bronze | 1.0% | $1,000 |
| 🥈 Silver | 1.5% | $1,500 |
| 🥇 Gold | 2.0% | $2,000 |
| 💎 Platinum | 3.0% | $3,000 |
| 💠 Diamond | 4.0% | $4,000 |
| 🌟 Legendary | 5.0% | $5,000 |
| ⚡ Mythic | 6.0% | $6,000 |

## 🛡️ Safety Features

### Minimum Balance Protection
- Only users with $1,000+ total balance can be taxed
- New/poor players are protected

### Developer Exemption  
- Developer account (ID: 466050111680544798) is completely exempt
- Shows "Off-Economy" status

### Tax Cap
- Maximum tax is 50% of total balance
- Prevents complete wealth wipe

## 🎮 How It Works

### Activity Tracking
- Every game played updates your "last played" timestamp
- System tracks your most recent activity across ALL games
- Includes: Slots, Blackjack, Duck Game, Crash, Fishing, etc.

### Inactivity Detection
1. **3 Day Timer**: Haven't played in 72+ hours = inactive
2. **Balance Check**: Must have $1,000+ to be taxed
3. **Tax Calculation**: Based on tier and total balance
4. **Deduction**: Taken from wallet first, then bank

### Tax Processing
- Taxes are applied manually by administrators
- All tax events are logged for transparency
- Users are notified of tax status changes

## 🔧 Admin Controls

### Via Developer Panel
Access through `/panel developer`:

1. **Inactivity Tax Status**
   - View all inactive users
   - See potential tax revenue  
   - Breakdown by tier
   - Top inactive users list

2. **Run Inactivity Taxes**
   - Process taxes for all eligible users
   - Confirmation required
   - Real-time progress updates
   - Comprehensive results summary

### Manual Commands
- Administrators can check individual user status
- Detailed activity and tax information
- Historical tax records

## 👤 User Features

### Check Your Status
Use `/taxstatus` to see:
- Current activity status
- Days since last game
- Potential tax amount
- Time until tax becomes due
- Your tier and rate

### Stay Active
Play any casino game to reset your activity timer:
- 🎰 Slots, Blackjack, Crash, Fishing
- 🦆 Duck Game, Battleship, UNO
- 🎯 Plinko, RPS, Bingo, Word Chain
- Any other casino game

## 📊 Example Scenarios

### Scenario 1: Active Player
```
User: John (Gold Tier - $150K)
Last Game: Yesterday
Status: ✅ Active - No tax due
Days until tax: 2 days
```

### Scenario 2: Inactive Player
```
User: Sarah (Diamond Tier - $500K) 
Last Game: 5 days ago
Status: ⚠️ INACTIVE - Subject to tax!
Tax Amount: $20,000 (4%)
```

### Scenario 3: Protected Player
```
User: Mike (Silver Tier - $800)
Last Game: 10 days ago  
Status: ✅ Safe from taxes
Reason: Balance below $1,000 minimum
```

### Scenario 4: Developer
```
User: Developer (Mythic Tier - $10M)
Last Game: Never
Status: 🛡️ Off-Economy - Exempt from taxes
```

## 🚨 Tax Processing Example

When taxes are processed:

```
🏛️ Inactivity Tax Collection Complete

• Users Processed: 1,247
• Users Taxed: 23  
• Total Revenue: $156,750
• Processing Time: 12s

💰 $156,750 collected from inactive players.
```

## 📈 Benefits

### For Active Players
- No taxes if you play regularly
- Encouragement to try different games
- Rewards for engagement

### For the Economy
- Prevents wealth stagnation
- Encourages money circulation
- Maintains balance between tiers
- Creates dynamic gameplay incentives

### For Server Health
- Encourages daily activity
- Reduces idle accounts
- Promotes community engagement

## ⚠️ Important Notes

1. **3-Day Grace Period**: You have 3 full days after your last game
2. **Any Game Counts**: Playing ANY casino game resets your timer
3. **Progressive Taxation**: Higher tiers pay more to prevent hoarding
4. **Transparent System**: All taxes are logged and tracked
5. **Admin Controlled**: Taxes are not automatic - admins decide when to process
6. **Fair Limits**: Maximum 50% tax prevents complete balance loss

## 🔮 Future Enhancements

- Automated tax scheduling
- Grace periods for vacations
- Tiered inactivity thresholds
- Activity rewards for consistent players
- Tax-free periods during special events

---

**Remember**: Stay active, play games, and keep your wealth safe from taxation! 🎰✨