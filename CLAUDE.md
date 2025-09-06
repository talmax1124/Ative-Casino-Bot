# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 🎰 ATIVE Casino Bot

## Overview
ATIVE Casino Bot is a Discord casino bot built entirely in JavaScript using Discord.js v14. It provides a complete casino ecosystem with betting, economy, and multiple games.

## Development Commands

```bash
# Run the bot
node index.js

# Development mode with auto-restart
npm run dev

# Linting
npm run lint
npm run lint:fix

# Testing
npm test
npm run test:health

# Stop cleanly with Ctrl+C
```

## Architecture

### Core Systems

#### Session Management (`UTILS/sessionManager.js`)
- Unified session manager handles all game sessions
- Prevents duplicate games and race conditions
- Automatic timeout handling (5 minutes default)
- Session states: CREATED, IN_PROGRESS, COMPLETED, CANCELLED, EXPIRED
- All modern games use this system (blackjack, slots, crash, plinko, uno, etc.)

#### Database Layer (`UTILS/database.js` + `UTILS/databaseAdapter.js`)
- MariaDB as primary database
- Adapter pattern for database abstraction
- Key tables:
  - `user_balances`: Wallet/bank balances
  - `user_stats`: Aggregated game statistics
  - `game_results`: Individual game history (added for tracking)
  - `server_config`: Per-server configuration
  - `lottery_tickets`, `lottery_info`, `lottery_winners`: Lottery system

#### Economy System
- Virtual currency with wallet/bank separation
- Bet validation through `PayoutManager.validateAndDeductBet()`
- Automatic payout processing with `PayoutManager.processGamePayout()`
- Server booster bonus support (5% boost)
- Anti-abuse monitoring with high-win alerts

#### Game Framework
- Games split between `/COMMANDS` (slash commands) and `/GAMES` (game logic)
- Standardized game flow:
  1. Session validation via `sessionGuard.check()`
  2. Bet validation and deduction
  3. Game session creation
  4. Game logic execution
  5. Payout processing
  6. Session cleanup
- All games must log results via `dbManager.recordGameResult()`

### Critical Channels
- Error logs: `1405096821512212521`
- Suspicious activity: `1409016191049142434`
- Level up notifications: `1411018763008217208`

### Key Patterns

#### Command Structure
```javascript
// Standard command template
module.exports = {
    data: new SlashCommandBuilder()
        .setName('commandname')
        .setDescription('Description'),
    async execute(interaction) {
        // 1. Session guard check
        // 2. Validate and deduct bet
        // 3. Create session
        // 4. Execute game logic
        // 5. Process payout
        // 6. End session
    }
}
```

#### Session Protection
```javascript
const sessionGuard = require('../UTILS/sessionGuard');
const check = await sessionGuard.check(userId, guildId, gameType, interaction.client);
if (!check.allowed) {
    // Handle session error
}
```

#### Bet Processing
```javascript
const validation = await PayoutManager.validateAndDeductBet(
    interaction, amount, gameType, minBet, maxBet
);
if (!validation.isValid) {
    return await interaction.reply({ embeds: [validation.errorEmbed] });
}
```

## Game Limits
- **Blackjack**: Min $1, No maximum (supports "all in" for entire wallet)
- **Roulette**: Min $10, Max $10M
- **Slots**: Min $1, Max $175K (high multiplier limit - up to 100x)
- **Multi-Slots**: Min $1, Max $175K (high multiplier limit - up to 100x)
- **Plinko**: Min $100, Max $175K (high multiplier limit - up to 10x)  
- **Crash**: Min $10, Max $175K (high multiplier limit - up to 15x)
- **Treasure Vault**: Min $100, Max $300K (reduced due to multipliers up to 3.5x)
- **KENO**: Min $10, Max $50K (conservative multipliers - max 50x)
- **CEELO**: Min $5, Max $25K (1:1 payouts, traditional dice game)

## Environment Variables
Required in `.env`:
- `DISCORD_TOKEN`
- `CLIENT_ID`
- `MARIADB_HOST`, `MARIADB_PORT`, `MARIADB_USER`, `MARIADB_PASSWORD`, `MARIADB_DATABASE`
- `ENVIRONMENT` (development/production)

## UAS Bot Integration

### Overview
The UAS (Unified Administrative System) bot handles administrative functions separately from the casino bot. It provides moderation, security, and server management capabilities.

### UAS Repository Structure
- **Standalone Repository**: `/Users/carlosdiazplaza/uas-standalone-bot/`
- **GitHub**: `https://github.com/talmax1124/uas-security-bot`
- **Purpose**: Administrative commands, moderation, security features
- **Auto-Update**: Server pulls from GitHub on restart

### Working with UAS
When making changes to administrative functions:
1. **ALWAYS** work in `/Users/carlosdiazplaza/uas-standalone-bot/`
2. **NEVER** modify UAS files in the casino bot repository
3. After changes, **ALWAYS** commit and push:
```bash
cd /Users/carlosdiazplaza/uas-standalone-bot/
git add . && git commit -m "[Description] 

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>" && git push
```
4. Notify user: "✅ UAS changes committed! Server will auto-update on restart."

### UAS Components
- `/COMMANDS/ADMIN/`: Administrative commands (ban, kick, role management)
- `/COMMANDS/MOD/`: Moderation commands (mute, warn, timeout)
- `/COMMANDS/SECURITY/`: Security features (anti-raid, verification)
- `/COMMANDS/UTILITY/`: Utility commands (server info, user info)
- `/UTILS/`: Shared utilities for UAS functionality

## Important Rules

### Code Organization
- **Never create new files unless absolutely necessary** - prefer editing existing files
- Utilities go in `/UTILS`, not duplicated across commands
- Game logic separated from command handlers
- Documentation goes in `/Documentation & Tests/`
- UAS administrative functions stay in standalone repository

### Session Management
- Always use unified session manager for new games
- Never bypass session guards
- Properly end sessions on game completion or error

### Error Handling
- All errors logged via Winston logger
- Game errors turn panel red and log details
- Refund bets on critical errors

### Security
- Developer ID hardcoded: `466050111680544798`
- Role-based permissions (Admin/Mod)
- All suspicious activity logged
- UAS bot handles server security and moderation

### Database Operations
- Use relative updates to prevent race conditions
- Always validate numeric values before database operations
- Record all game results for history tracking

## Testing Checklist
- Commands execute without errors
- Games function with correct odds
- Database writes persist correctly
- Sessions properly managed (no duplicates, proper cleanup)
- Logs generated for all game activities
- Refunds processed on errors
- Always Show A To-Do List. As well, as make sure that the code that is generated to be tested thoroughly.
- Make sure all games, commands, have consistent UI!
- When making a new feature, make it into a new git branch.
- Try to not be verbose. Just show me what you are working on. Do not show me any code. Just a To do List, and (WORKING) and test each functionality completely after each completed to do list to ensure nothing breaks!