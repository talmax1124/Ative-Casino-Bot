# Wealth Tax System

The ATIVE Casino Bot features a sophisticated wealth tax system designed to encourage high-stakes gambling and prevent wealth hoarding among the richest players.

## 🎯 Core Concept

**The Rule**: Rich players ($100K+) who don't gamble with high stakes get taxed heavily!

**High Stakes Definition**: Must bet at least 1% of your total wealth per game
- $100K wealth = $1,000+ bets required
- $1M wealth = $10,000+ bets required  
- $10M wealth = $100,000+ bets required

## 💎 Wealth Tax Brackets

Progressive taxation based on total balance (wallet + bank):

| Wealth Bracket | Range | Base Tax Rate | Example ($1M) |
|----------------|--------|---------------|---------------|
| 💼 **Upper Class** | $100K - $499K | 0.5% | $5,000 |
| 💰 **Rich** | $500K - $999K | 1.0% | $10,000 |
| 🏰 **Very Rich** | $1M - $4.9M | 2.0% | $20,000 |
| 💎 **Ultra Rich** | $5M - $9.9M | 3.0% | $30,000 |
| 🏦 **Mega Rich** | $10M - $49.9M | 4.0% | $40,000 |
| 👑 **Billionaire** | $50M+ | 5.0% | $50,000 |

## 📈 Tax Multipliers

Base rates are multiplied based on gambling behavior:

### 🚫 **No Gambling Activity** (2x Tax)
- Haven't played any real gambling games
- Economy commands like `/earn` don't count
- **Example**: Very Rich player pays 4% instead of 2%

### 📉 **Low Stakes Only** (1.5x Tax)  
- Playing gambling games but betting too small
- Average bet is under 1% of wealth
- **Example**: Ultra Rich player pays 4.5% instead of 3%

### 🎰 **High Stakes Gambling** (EXEMPT)
- Betting 1%+ of wealth consistently
- Playing real casino games regularly
- **Complete exemption from wealth tax**

## 🎲 What Counts as "Real Gambling"

**✅ Casino Games (Count):**
- Blackjack, Slots, Crash, Duck Game
- Fishing, Plinko, RPS, Bingo  
- Battleship, UNO, Roulette, Poker
- Lottery (if betting significant amounts)

**❌ Economy Commands (Don't Count):**
- `/earn`, `/work`, `/beg`, `/crime`
- `/daily`, `/weekly`, `/vote rewards`
- Any non-betting activities

## 🛡️ Exemptions & Protections

### Developer Protection
- Developer account (ID: 466050111680544798) completely exempt
- Shows "Off-Economy" status

### Wealth Threshold
- Only users with $100,000+ total balance are subject to wealth tax
- Lower wealth players are completely safe

### Tax Cap
- Maximum 10% of total wealth per tax event
- Prevents excessive taxation

### Activity Window
- Recent 14 days of gambling activity analyzed
- High-stakes requirement based on current wealth

## 🔧 Admin Controls

### Via Developer Panel (`/panel developer`)

**💎 Wealth Tax Status:**
- View all wealthy users ($100K+)
- See high-stakes gamblers vs. tax targets
- Breakdown by wealth brackets
- Potential tax revenue analysis

**🏦 Run Wealth Taxes:**
- Process taxes for eligible wealthy users
- Safety confirmation required
- Real-time processing updates
- Comprehensive results breakdown

## 👤 User Commands

### `/wealthstatus` Command
Check your wealth tax status:
- Current wealth bracket and tax rate
- High-stakes gambling requirement
- Recent betting activity analysis
- Tax exemption status
- Exact amounts and calculations

## 📊 Example Scenarios

### Scenario 1: High-Stakes Gambler (EXEMPT)
```
User: Alex (Very Rich - $2M)
Recent Activity: Average bet $25,000 (1.25% of wealth)
Status: ✅ EXEMPT - High stakes gambling
Tax: $0 (would be $40,000 base)
```

### Scenario 2: Low-Stakes Gambler (TAXED)
```  
User: Morgan (Ultra Rich - $7M)
Recent Activity: Average bet $10,000 (0.14% of wealth)
Status: ⚠️ TAXED - Low stakes only  
Tax: $315,000 (3% × 1.5x = 4.5%)
```

### Scenario 3: Wealth Hoarder (HEAVILY TAXED)
```
User: Taylor (Mega Rich - $25M)
Recent Activity: No gambling games played
Status: 🚫 HEAVILY TAXED - No gambling
Tax: $2,000,000 (4% × 2x = 8%)
```

### Scenario 4: Developer (PROTECTED)
```
User: Developer (Billionaire - $100M)
Recent Activity: Doesn't matter
Status: 🛡️ OFF-ECONOMY - Developer exempt
Tax: $0 (permanent protection)
```

## 🎯 Strategic Impact

### Encourages High-Stakes Gambling
- Rich players must bet big to avoid taxes
- Creates exciting high-stakes games
- Increases overall betting volume

### Prevents Wealth Hoarding  
- Can't just sit on millions without consequence
- Forces wealthy players to stay active
- Redistributes stagnant wealth

### Maintains Economic Balance
- Prevents extreme wealth concentration
- Keeps money flowing in economy
- Creates opportunities for others

### Rewards Active Gamblers
- High-stakes players get tax exemption
- Encourages skill development
- Creates competitive environment

## 💰 Tax Processing Example

When wealth taxes are processed:

```
🏦 Wealth Tax Collection Complete

• Wealthy Users Processed: 45
• Rich Users Taxed: 12
• Total Revenue: $2,840,500  
• Processing Time: 8s

💰 $2,840,500 collected from wealth hoarders.

Tax Breakdown:
• 5 users taxed for not gambling (2x rate)
• 7 users taxed for low stakes only (1.5x rate)
```

## 📋 Implementation Details

### Activity Tracking
- Analyzes gambling activity from last 14 days
- Calculates average bet size per game
- Compares to wealth-based thresholds
- Updates in real-time with each game

### Tax Calculation Process
1. **Wealth Check**: Must have $100K+ balance
2. **Activity Analysis**: Check recent gambling behavior  
3. **Bracket Assignment**: Determine wealth bracket
4. **Multiplier Application**: Apply behavior multiplier
5. **Tax Calculation**: Calculate final tax amount
6. **Deduction**: Take from wallet first, then bank

### Safety Features
- Comprehensive logging of all tax events
- Admin confirmation required for processing
- Detailed breakdown of tax reasons
- User notifications and status commands

## 🚀 Advanced Features

### Dynamic Thresholds
- High-stakes requirement scales with wealth
- Encourages proportional risk-taking
- Prevents gaming the system

### Multi-Game Analysis
- Tracks activity across all casino games
- Prevents focusing on just one game
- Encourages diverse gambling

### Historical Tracking  
- Maintains records of all tax events
- Enables trend analysis
- Supports appeals and reviews

## ⚡ Future Enhancements

- Automated scheduling for tax processing
- Grace periods for vacation/breaks  
- Seasonal tax rate adjustments
- Wealth tax-free events and promotions
- Advanced analytics and reporting

---

**Remember**: The best way to avoid wealth tax is to gamble big and gamble often! 🎰💎