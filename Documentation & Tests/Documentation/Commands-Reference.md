# 🎮 ATIVE Casino Bot - Commands Reference

## Overview

This document provides a comprehensive reference for all slash commands available in the ATIVE Casino Bot. Commands are organized by category with detailed usage instructions, permissions, and examples.

---

## 💰 Economy Commands

### `/balance [user]`
Check wallet and bank balances.

**Parameters:**
- `user` (optional): User to check (admin only for others)

**Usage:**
```
/balance                    # Check your own balance
/balance @username          # Check another user's balance (admin)
```

**Response:**
- Wallet amount (spending money)
- Bank amount (savings)
- Total combined balance

**Tiers:**
- Bronze: $0 - $9,999
- Silver: $10,000 - $99,999
- Gold: $100,000 - $999,999
- Platinum: $1,000,000+
- Diamond: $10,000,000+
- Legendary: $100,000,000+
- Mythic: $1,000,000,000+

** Rewards for each tier.**
Gold: 
- 2% interest on bank balance
Platinum:
- 3% interest on bank balance
- Access to exclusive games
Diamond:
- 5% interest on bank balance
- Higher betting limits
- GIF PERMISSIONS
Legendary:
- 7% interest on bank balance
- Custom bot profile badge
Mythic:
- 10% interest on bank balance
- Priority support

**Rules to maintain tiers:**
- Must maintain minimum balance for tier
- Inactivity over 10 days results in tier downgrade
---

### `/work`
Earn money through virtual jobs.

**Features:**
- Random job assignments
- Variable pay rates
- Cooldown periods to prevent spam
- Different job types with flavor text

**Example Jobs:**
- Office work: $500-$2,000
- Delivery service: $300-$1,500
- Freelance work: $800-$3,000

---

### `/sendmoney <user> <amount>`
Transfer money between users.

**Parameters:**
- `user` (required): Recipient user
- `amount` (required): Amount to transfer

**Features:**
- 5% transaction fee (goes to lottery pool)
- Requires sufficient wallet funds
- Both parties notified of transfer
- Transaction logged for audit

**Usage:**
```
/sendmoney @friend 1000     # Send $1,000 (5% fee = $50)
```

---

## 🎰 Casino Games

### `/slots <bet>`
Play classic slot machine.

**Parameters:**
- `bet` (required): Amount to wager

**Features:**
- 3-reel classic slots
- Multiple winning combinations
- Jackpot opportunities
- Visual reel display
- Help button with rules

**Symbols:**
- 🍒 Cherries - Low payout
- 🍋 Lemon - Low payout
- 🍊 Orange - Medium payout
- 🍇 Grapes - Medium payout
- 🍉 Watermelon - High payout
- 💎 Diamond - Very high payout
- 7️⃣ Lucky 7 - Jackpot symbol

---

### `/multi-slots <bet> [lines]`
Play advanced multi-line slots.

**Parameters:**
- `bet` (required): Base bet amount
- `lines` (optional): Number of paylines (1-25)

**Features:**
- Up to 25 paylines
- Buffalo bonus rounds
- Multiplier symbols
- Progressive features
- Interactive bonus games

---

### `/blackjack <bet>`
Play blackjack against the dealer.

**Parameters:**
- `bet` (required): Amount to wager

**Features:**
- Standard blackjack rules
- Visual card display
- Hit, Stand, Double Down, Split
- Blackjack pays 3:2
- Insurance available on dealer Ace
- Interactive buttons for actions

**Actions:**
- **Hit**: Take another card
- **Stand**: Keep current hand
- **Double Down**: Double bet, take one card
- **Split**: Split pairs into two hands

---

### `/crash <bet> [auto_cashout]`
Play the crash multiplier game.

**Parameters:**
- `bet` (required): Amount to wager
- `auto_cashout` (optional): Automatic cashout multiplier

**Features:**
- Real-time multiplier climbing
- Cash out before crash
- Auto-cashout settings
- Live betting rounds
- Multiplayer support

**Strategy:**
- Higher multipliers = higher risk
- Cash out early for safe wins
- Auto-cashout prevents losses

---

### `/duck [mode]`
Play the duck road crossing game.

**Parameters:**
- `mode` (optional): Game difficulty (easy, medium, hard)

**Features:**
- Road crossing gameplay
- Multiple difficulty levels
- Dynamic obstacles
- Progressive rewards
- Visual game board

**Modes:**
- **Easy**: Slow traffic, higher success rate
- **Medium**: Moderate traffic, balanced risk
- **Hard**: Fast traffic, maximum rewards

---

### `/wordchain`
Play word association game.

**Features:**
- Build word chains
- Vocabulary challenges
- Points for creativity
- Time-based rounds
- Dictionary validation

---

## 🎫 Lottery System

### `/lottery status`
Check current lottery information.

**Information Displayed:**
- Current prize pool
- Your tickets for this week
- Drawing schedule
- Time until next drawing
- Previous winners

---

### `/purchaselottery <count>`
Buy lottery tickets for the weekly drawing.

**Parameters:**
- `count` (required): Number of tickets (1-7)

**Features:**
- $12,000 per ticket
- Maximum 7 tickets per person per week
- Automatic drawing Sundays at 10 AM EST
- 3 guaranteed winners (45%, 45%, 10%)

---

## 👑 Admin Commands

### `/admin stats`
Display comprehensive bot statistics.

**Information:**
- Active users count
- Total economy value
- Game statistics
- System health metrics
- Database status

**Permissions:** Admin role required

---

### `/admin ban <user> [reason]`
Ban a user from using the bot.

**Parameters:**
- `user` (required): User to ban
- `reason` (optional): Ban reason

**Features:**
- Prevents all bot access
- Reason logged for reference
- Can be reversed with unban
- Notifies user of ban

---

### `/admin unban <user>`
Remove bot ban from user.

**Parameters:**
- `user` (required): User to unban

---

### `/admin resetbalance <user>`
Reset a user's economy balance.

**Parameters:**
- `user` (required): User to reset

**Warning:** This action cannot be undone!

---

### `/crasheco <user>`
Apply economy abuse punishment.

**Parameters:**
- `user` (required): User suspected of abuse

**Actions:**
- 5-minute automatic mute
- Warning message sent
- Activity logged for review
- Repeat offenses = permanent ban

---

## 🔧 Developer Commands

### `/dev status`
Display detailed bot status information.

**Information:**
- Bot uptime
- Memory usage
- Active connections
- Command statistics
- Error rates

**Permissions:** Developer only (ID: 466050111680544798)

---

### `/dev reload [component]`
Reload bot components without restart.

**Parameters:**
- `component` (optional): Specific component to reload

**Components:**
- commands
- games
- database
- config

---

## 🎛️ Panel System

### `/panel`
Open the master admin control panel.

**Features:**
- Interactive dropdown menus
- Bulk user operations
- Game management controls
- System monitoring tools
- Quick action shortcuts

**Panel Sections:**
- **User Management**: Bans, refunds, balance resets
- **Game Control**: Stop games, manage sessions
- **System Tools**: Logs, statistics, maintenance
- **Economy**: Bulk operations, fraud detection

---

## 🔄 Game Management

### `/stopgame`
Force stop active games across channels.

**Features:**
- Select menu with active games
- Refund players automatically
- Log game terminations
- Admin notification system

---

### `/stopcrash`
Stop active crash games specifically.

**Features:**
- Emergency crash game termination
- Player refund processing
- Session cleanup
- Activity logging

---

## 🗳️ Polling System

### `/polls create <question> [options]`
Create interactive polls.

**Parameters:**
- `question` (required): Poll question
- `options` (optional): Poll options (comma-separated)

**Features:**
- Multiple choice options
- Real-time vote counting
- Anonymous voting
- Time-based polls

---

## 📊 Information Commands

### `/help [command]`
Get help information about commands.

**Parameters:**
- `command` (optional): Specific command help

**Features:**
- Command list overview
- Detailed usage examples
- Permission requirements
- Related commands

---

## 🎮 Game-Specific Features

### Interactive Help Systems
Most games include "?" help buttons that provide:
- Complete rule explanations
- Strategy guides
- Payout information
- Example gameplay

### Button Controls
Games use Discord buttons for actions:
- **Blackjack**: Hit, Stand, Double, Split
- **Slots**: Spin, Help, Settings
- **Crash**: Bet, Cash Out, Auto-settings
- **Duck**: Movement controls


### Visual Feedback
Games provide rich visual feedback:
- Card images for blackjack
- Slot reel animations
- Progress bars for crash
- Game board displays

---

## 🔐 Permission System

### User Levels
1. **Regular Users**: Basic games and economy
2. **Moderators**: Advanced game management
3. **Admins**: User management and system controls
4. **Developer**: Full system access

### Role Verification
Commands automatically check:
- Discord server roles
- Bot-specific permissions
- Developer whitelist
- Game ownership (for user-specific games)

---

## 🛡️ Anti-Abuse Features

### Rate Limiting
- Commands have cooldown periods
- Prevents spam and abuse
- Different limits per command type
- Admin override available

### Input Validation
- All parameters validated
- SQL injection prevention
- XSS protection
- Range checking for numeric inputs

### Activity Monitoring
- All commands logged
- Suspicious pattern detection
- Automatic abuse prevention
- Manual review system

---

## 📝 Usage Examples

### Basic Economy Flow
```
/balance                    # Check starting balance
/work                      # Earn some money
/slots 100                 # Play slots with $100
/balance                   # Check updated balance
/purchaselottery 3         # Buy 3 lottery tickets
```

### Game Session
```
/blackjack 500             # Start blackjack with $500 bet
# Use buttons: Hit, Stand, Double Down
/crash 1000 2.5            # Crash game with auto-cashout at 2.5x
/multi-slots 200 10        # Multi-slots $200 bet, 10 lines
```

### Admin Tasks
```
/admin stats               # Check bot statistics
/panel                     # Open admin panel
/admin resetbalance @user  # Reset user's balance
/stopgame                  # Emergency stop games
```

---

## 🔄 Command Updates

Commands are regularly updated with new features:
- New game modes and options
- Enhanced security measures
- Performance improvements
- User experience enhancements

Check the bot's announcement channel for update notifications and new command features.

---

**Note:** All commands require the bot to be properly configured with Discord slash command permissions. Some commands may have additional server-specific permission requirements.