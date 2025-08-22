# 🎰 ATIVE Casino Bot - Project Instructions

## Overview
ATIVE Casino Bot is an **online casino-style Discord bot** built **entirely in JavaScript** using the **Discord.js v14 library**.  
- **Primary Language & Framework**: JavaScript (Node.js) with Discord.js v14.  
- **Purpose**: Provide a fun, casino-like environment in Discord with games, betting, and an economy system.  
- **Testing & Runtime**: The bot is run locally with:  

```bash
node index.js
```  

After each test, verify the bot is running and then stop it cleanly with **Ctrl+C**.  

---

## Project Structure  

```
ative_casino_bot/
├── index.js                 # Main bot entry point
├── package.json             # Dependencies and scripts
├── COMMANDS/                # Slash command implementations
│   ├── admin.js             # Admin commands
│   ├── blackjack.js         # Blackjack command
│   ├── dev.js               # Developer commands
│   ├── general.js           # Economy commands (balance, work, etc.)
│   ├── polls.js             # Polling system
│   └── slots.js             # Slots command
├── GAMES/                   # Game logic modules
│   ├── blackjack.js         # Blackjack mechanics
│   └── slots.js             # Slot machine mechanics
├── UTILS/                   # Utility modules
│   ├── common.js            # Common helpers
│   ├── database.js          # Firebase Firestore operations
│   ├── firebase.js          # Firebase configuration
│   ├── gameUtils.js         # Game management utilities
│   ├── logger.js            # Winston logging configuration
│   └── rng.js               # Cryptographically secure RNG
└── assets/                  # Game assets (images, sounds)
    ├── blackjack/           # Card images
    └── slots/               # Slot machine images
```

---

## High-Level Roles  

- **Developer (Owner)**  
  - Discord ID: `466050111680544798`.  
  - Full access to all commands, economy management, and admin functionality.  

- **Admins**  
  - Based on server role during initial setup.  
  - Can access all bot commands and manage users (ban, kick, reset balances, etc.).  

- **Moderators (Mods)**  
  - Based on server role.  
  - Can access all game/economy commands but **not admin-only commands** (ban, kick, economy overrides).  

---

## Commands  

- All commands are **slash-prefixed (`/`)**.  
- Implemented in the **COMMANDS/** folder using `SlashCommandBuilder`.  
- Must be **modular and reusable**, supporting future expansion.  

Examples:  
- `/balance` → Show user’s balance.  
- `/slots` → Play slots.  
- `/blackjack` → Play blackjack.  
- `/crasheco` (Admin-only) → Warn and mute economy abusers.  

---

## Utilities  

- Located in **UTILS/** folder.  
- Must be **reusable and modular**.  
- Includes:  
  - `common.js` → Shared helper functions.  
  - `database.js` → Firebase Firestore operations.  
  - `rng.js` → Cryptographically secure random number generation.  
  - `logger.js` → Centralized logging with Winston.  
- If a new utility is needed, it should be added to **UTILS** instead of duplicating code.  

---

## Economy  

- **Virtual Currency System**:  
  - Users can earn and spend casino credits.  
  - Balances are stored persistently in **Firebase Firestore**.  

- **Anti-Abuse Measures**:  
  - `/crasheco` → Admin-only command to warn and auto-mute exploiters (5 minutes).  
  - Repeat offenders → permanent ban.  
  - All suspicious activity must be logged in **channel `1405096821512212521`**.  

- **Fair & Balanced**:  
  - Games must ensure fair odds.  
  - Any imbalance or error is logged.  

---

## Games  

- Supported games: **Blackjack, Slots, Roulette (future), etc.**  
- Requirements:  
  - Each game has its own file in **GAMES/**.  
  - Must be fun, engaging, and casino-themed.  
  - Each game must have a **“?” help button** with instructions.  
  - All game actions/results logged to **channel `1405096821512212521`**.  

---

## Logging  

- **Logger**: All logs must use a consistent format via **Winston**.  
- **Errors**: Must include the **command name + error message**.  
- **Log Categories**:  
  - Commands executed.  
  - Game activity (start/end/results).  
  - Economy actions (earn, spend, balance changes).  
  - Admin/mod actions.  
- **Error Channel**: All errors → **`1405096821512212521`**. 

- If a game has an issue, turn the panel red and log the error with details.

- **Log Format**:  
  - Timestamp.  
  - Command name.  
  - User ID.  
  - Action performed.  
  - Result (success/error).
  - Error message (if any).

- Documentation for Commands, Utilites, Games, and All other features must be placed in the **Documentation & Tests/Documentation** folder. (This includes any new features or changes made to the bot. As well as any commands to deploy to Railway, VPS, etc.)
---

## Images  

- **Theme Consistency**: All images must match the casino aesthetic.  
- **Use Canvas**: For generating and manipulating images.  
- **Use Cases**: Displaying game results (slots reels, blackjack cards), balances, and stats.  
- **Utilities**: Centralized in **UTILS/**. New image functions should go there.  
- **Quality**: Images must be high-resolution and error-free.  

---

## Database (Firebase Firestore)  

- **Storage Needs**:  
  - User balances.  
  - Game results.  
  - Logs of actions for transparency.  

- **Scalability**: Must handle large numbers of concurrent users.  
- **Implementation**: Centralized in `UTILS/database.js` using Firebase Admin SDK.  

---

## Testing  

- Each command and utility must include **tests**. If need to create a test file, place it in the **Documentation & Tests/Tests** folder.  
- Test via:  

```bash
node index.js
```  

- Validate:  
  - Commands execute without errors.  
  - Games function fairly.  
  - Database writes persist correctly.  
  - Logs are generated consistently.  

---

## Dependencies  

Main dependencies include:  
- **discord.js v14** → Bot framework.  
- **firebase-admin** → Database (Firestore).  
- **winston** → Logging.  
- **canvas** → Image generation.  
- **dotenv** → Environment management.  
- **crypto (built-in)** → RNG.  

---

## Environment Variables  

Required:  
- `DISCORD_TOKEN` → Bot token.  
- `CLIENT_ID` → Discord application client ID.  
- `FIREBASE_PROJECT_ID` → Firebase project ID.  
- `FIREBASE_PRIVATE_KEY` → Firebase private key.  
- `FIREBASE_CLIENT_EMAIL` → Firebase client email.  
- `ENVIRONMENT` → "development" or "production".  
- `ANNOUNCE_CHANNEL_ID` → (Optional) Announcement channel.  

---

## Important Instructions  

- **Do what is asked; nothing more, nothing less.**  
- **Never create new files unless necessary.**  
- Prefer editing existing files instead of duplicating.  
- Documentation must go into the **Documentation & Tests/** folder.  