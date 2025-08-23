# 🔧 ATIVE Casino Bot - Utilities Documentation

## Overview

The UTILS directory contains essential utility modules that provide core functionality across the ATIVE Casino Bot. These modules handle database operations, common functions, logging, random number generation, and more.

---

## 📚 Core Utility Modules

### 💾 `database.js` - Firebase Database Manager

**Purpose**: Handles all Firebase Firestore operations for persistent data storage.

#### Class: DatabaseManager

**Initialization:**
```javascript
const dbManager = require('./UTILS/database');
await dbManager.initialize();
```

#### Key Methods:

**User Balance Operations:**
```javascript
// Get user balance (creates default if not exists)
const balance = await dbManager.getUserBalance(userId, guildId);
// Returns: { wallet, bank, last_earn_ts, game_active, etc. }

// Update user balance
await dbManager.updateUserBalance(userId, guildId, updates);

// Ensure user exists in database
await dbManager.ensureUser(userId, displayName);
```

**Transaction Operations:**
```javascript
// Add money to wallet
await dbManager.addMoney(userId, guildId, amount, reason);

// Remove money from wallet (with validation)
await dbManager.removeMoney(userId, guildId, amount, reason);

// Transfer between wallet and bank
await dbManager.transferToBank(userId, guildId, amount);
await dbManager.transferToWallet(userId, guildId, amount);
```

**Game Session Management:**
```javascript
// Set user game status
await dbManager.setGameActive(userId, guildId, isActive);

// Track game results
await dbManager.recordGameResult(userId, guildId, gameType, result);
```

**Admin Operations:**
```javascript
// Reset user balance (admin only)
await dbManager.resetUserBalance(userId, guildId);

// Ban/unban users
await dbManager.banUser(userId, reason);
await dbManager.unbanUser(userId);
await dbManager.isUserBanned(userId);
```

**Lottery System:**
```javascript
// Lottery ticket management
await dbManager.buyLotteryTickets(userId, guildId, count, cost);
await dbManager.getLotteryStatus(guildId);
await dbManager.processLotteryDrawing(guildId, winners);
```

#### Database Schema:

**User Balances Collection:**
```javascript
{
    user_id: "discord_user_id",
    wallet: 1000.0,          // Active spending money
    bank: 0.0,               // Secure savings
    last_earn_ts: 0.0,       // Last /work command
    last_rob_ts: 0.0,        // Last rob attempt
    game_active: false,      // Currently in a game
    created_at: Date,
    updated_at: Date
}
```

**Game Sessions Collection:**
```javascript
{
    session_id: "unique_id",
    user_id: "discord_user_id",
    guild_id: "discord_guild_id",
    game_type: "blackjack|slots|crash",
    bet_amount: 1000,
    start_time: Date,
    end_time: Date,
    result: { /* game-specific data */ }
}
```

**Lottery Collection:**
```javascript
{
    guild_id: "discord_guild_id",
    current_pot: 400000.0,
    tickets: [
        { user_id: "id", count: 3, purchase_time: Date }
    ],
    drawing_time: Date,
    winners: [/* previous winners */]
}
```

---

### 🛠️ `common.js` - Common Utility Functions

**Purpose**: Shared helper functions to reduce code duplication across the bot.

#### Money Formatting Functions:

```javascript
const { fmt, fmtFull, fmtDelta, fmtDeltaColored } = require('./UTILS/common');

// Abbreviated formatting (for compact displays)
fmt(1500000)      // "$1.50M"
fmt(2500)         // "$2.50K"
fmt(100.50)       // "$100.50"

// Full formatting (for detailed displays)
fmtFull(1500000)  // "$1,500,000.00"
fmtFull(2500.75)  // "$2,500.75"

// Delta formatting (change indicators)
fmtDelta(1500, 1000)          // "(+500.00)"
fmtDeltaColored(1500, 1000)   // "**+$500.00**"
```

#### Amount Parsing:
```javascript
// Parse user input amounts
const amount = parseAmount("1k");     // 1000
const amount = parseAmount("2.5m");   // 2500000
const amount = parseAmount("all");    // Requires context
```

#### Discord Utilities:
```javascript
// Get guild ID with fallback
const guildId = await getGuildId(interaction);

// Send formatted log messages
await sendLogMessage(client, 'info', 'Game started', userId, guildId);
await sendLogMessage(client, 'error', 'Database error', userId, guildId);
```

#### Time & Date Utilities:
```javascript
// Format timestamps
const timeStr = formatTimestamp(Date.now());

// Calculate time differences
const timeLeft = calculateTimeLeft(targetTime);
```

#### Validation Functions:
```javascript
// Validate bet amounts
const isValid = isValidBet(amount, minBet, maxBet);

// Validate user permissions
const hasPermission = checkAdminPermissions(member);

// Sanitize user input
const clean = sanitizeInput(userInput);
```

---

### 🎲 `rng.js` - Cryptographically Secure Random Number Generation

**Purpose**: Provides secure randomness for all casino games to ensure fair play.

#### Core Functions:

```javascript
const { 
    secureRandomInt, 
    secureRandomFloat, 
    secureRandomChance,
    secureWeightedChoice,
    secureRandomShuffle 
} = require('./UTILS/rng');

// Random integers
const dice = secureRandomInt(1, 7);        // 1-6 inclusive
const card = secureRandomInt(0, 52);       // 0-51 inclusive

// Random floats
const multiplier = secureRandomFloat(1.0, 10.0);   // 1.0 to 10.0
const probability = secureRandomFloat();            // 0.0 to 1.0

// Probability checks
const success = secureRandomChance(0.7);    // 70% chance true

// Weighted selection
const symbols = ['cherry', 'lemon', 'bar'];
const weights = [50, 30, 20];
const result = secureWeightedChoice(symbols, weights);

// Array shuffling (for card decks)
const deck = ['A♠', 'K♠', 'Q♠', /* ... */];
secureRandomShuffle(deck);  // Modifies array in-place
```

#### Specialized Gaming Functions:

```javascript
// Crash game multiplier generation
const crashPoint = generateCrashMultiplier(houseEdge);

// Slot machine reels
const reels = generateSlotReels(symbolWeights);

// Blackjack deck creation and shuffling
const shuffledDeck = createShuffledDeck();

// Hazard positioning (Duck game)
const hazardLane = getSecureHazard(totalLanes);
```

#### Security Features:
- **Cryptographically Secure**: Uses Node.js `crypto.randomInt()`
- **Fallback System**: Graceful degradation if crypto fails
- **Input Validation**: Range checking and type validation
- **Performance Optimized**: Efficient algorithms for frequent use

---

### 📝 `logger.js` - Winston Logging System

**Purpose**: Centralized logging with multiple output destinations and log levels.

#### Configuration:

```javascript
const logger = require('./UTILS/logger');

// Log levels: error, warn, info, debug
logger.error('Critical system error', { error: err.message, userId });
logger.warn('Configuration issue detected', { setting: 'invalid_value' });
logger.info('User action logged', { action: 'blackjack_win', amount: 1000 });
logger.debug('Database query executed', { query: 'getUserBalance' });
```

#### Output Destinations:

**Console Output:**
- Development: Full logs with colors
- Production: Error and warn levels only

**File Logging:**
```
logs/
├── combined.log    # All log levels
├── error.log       # Error level only
└── pm2-*.log       # PM2 process logs
```

**Discord Channel:**
- Real-time logs sent to configured channel
- Error alerts for immediate attention
- Game activity and admin actions

#### Log Format:
```
2024-01-15 12:34:56 [INFO] Command executed: blackjack
  User: john_doe (123456789012345678)
  Guild: My Server (987654321098765432)
  Bet: $1,000.00
  Result: WIN (+$1,500.00)
```

---

### 🎮 `gameUtils.js` - Game Management Utilities

**Purpose**: Common game functions and session management.

#### Session Management:
```javascript
const { createGameSession, endGameSession, validateGameSession } = require('./UTILS/gameUtils');

// Create new game session
const sessionId = await createGameSession(userId, gameType, betAmount);

// Validate active session
const isValid = await validateGameSession(sessionId, userId);

// End game session with results
await endGameSession(sessionId, gameResult);
```

#### Game State Utilities:
```javascript
// Check if user has active game
const hasActiveGame = await userHasActiveGame(userId);

// Get game session data
const session = await getGameSession(sessionId);

// Update game state
await updateGameState(sessionId, newState);
```

#### Payout Calculations:
```javascript
// Calculate game payouts
const payout = calculatePayout(betAmount, winMultiplier);

// Apply house edge
const adjustedPayout = applyHouseEdge(rawPayout, houseEdge);

// Process winnings
await processWinnings(userId, guildId, winAmount);
```

---

### 🔥 `firebase.js` - Firebase Configuration

**Purpose**: Firebase initialization and connection management.

#### Configuration:
```javascript
// Environment variables required:
process.env.FIREBASE_PROJECT_ID
process.env.FIREBASE_PRIVATE_KEY  
process.env.FIREBASE_CLIENT_EMAIL
```

#### Connection Management:
```javascript
const firebaseConfig = require('./UTILS/firebase');

// Initialize Firebase (called once on startup)
const db = await firebaseConfig.initialize();

// Get Firestore instance
const firestore = firebaseConfig.getFirestore();
```

#### Error Handling:
- Connection retry logic
- Graceful degradation for offline mode
- Credential validation
- Service account authentication

---

### 🎛️ `panelManager.js` - Admin Panel System

**Purpose**: Interactive admin control panels for bot management.

#### Panel Creation:
```javascript
const panelManager = require('./UTILS/panelManager');

// Create admin panel
const panel = await panelManager.createAdminPanel(interaction);

// Handle panel interactions
await panelManager.handlePanelAction(interaction, actionId);
```

#### Available Actions:
- **User Management**: Ban, unban, reset balances
- **Game Control**: Stop games, refund players
- **System Info**: Statistics, health checks
- **Bulk Operations**: Mass user operations

#### Interactive Elements:
- Dropdown menus for action selection
- User search and selection
- Confirmation dialogs
- Progress indicators

---

### 🎫 `lottery.js` - Lottery System Utilities

**Purpose**: Weekly lottery management and drawing automation.

#### Lottery Operations:
```javascript
const { LotteryGame } = require('./UTILS/lottery');

// Initialize lottery system
const lottery = new LotteryGame(client);
await lottery.initialize();

// Buy tickets
await lottery.buyTickets(userId, guildId, ticketCount);

// Check status
const status = await lottery.getStatus(guildId);

// Process drawing (automated)
await lottery.processWeeklyDrawing();
```

#### Drawing Schedule:
- **Every Sunday**: 10 AM EST automatic drawing
- **Emergency Drawing**: If pot exceeds $400M
- **Guaranteed Winners**: Always 3 winners per drawing
- **Prize Distribution**: 45%, 45%, 10%

---

### 🎮 `gameSessionKit.js` - Game Session Framework

**Purpose**: Standardized game session management and UI components.

#### Session Management:
```javascript
const { buildSessionEmbed, buildButtons } = require('./UTILS/gameSessionKit');

// Create game embed
const embed = buildSessionEmbed(gameData, userId);

// Create interactive buttons
const buttons = buildButtons(gameActions, userId);
```

#### Standard Components:
- Game status embeds
- Interactive button rows
- Progress indicators
- Result displays

---

## 🔧 Utility Integration

### Usage Patterns:

**Standard Game Flow:**
```javascript
// 1. Validate user and bet
const balance = await dbManager.getUserBalance(userId, guildId);
if (balance.wallet < betAmount) {
    return sendError('Insufficient funds');
}

// 2. Create game session
const sessionId = await gameUtils.createGameSession(userId, 'blackjack', betAmount);

// 3. Process game logic with secure RNG
const cards = rng.secureRandomShuffle(deck);
const result = processGame(cards);

// 4. Handle payout
if (result.won) {
    await dbManager.addMoney(userId, guildId, result.payout, 'blackjack_win');
}

// 5. Log activity
logger.info('Game completed', {
    user: userId,
    game: 'blackjack',
    bet: betAmount,
    result: result.won ? 'WIN' : 'LOSE',
    payout: result.payout || 0
});
```

**Error Handling Pattern:**
```javascript
try {
    // Game logic here
} catch (error) {
    logger.error('Game error', { error: error.message, userId, gameType });
    await sendLogMessage(client, 'error', `Game error: ${error.message}`, userId);
    
    // Refund player if money was taken
    if (moneyDeducted) {
        await dbManager.addMoney(userId, guildId, betAmount, 'error_refund');
    }
}
```

### Performance Considerations:

- **Database Caching**: Frequently accessed data cached in memory
- **Connection Pooling**: Efficient database connection management
- **Lazy Loading**: Utilities loaded only when needed
- **Error Recovery**: Graceful handling of service failures

### Security Features:

- **Input Sanitization**: All user inputs cleaned and validated
- **Rate Limiting**: Prevent abuse and spam
- **Permission Checking**: Role-based access control
- **Audit Logging**: Complete activity trails
- **Secure RNG**: Cryptographically secure randomness

This comprehensive utility system provides a robust foundation for all bot operations while maintaining security, performance, and reliability standards.