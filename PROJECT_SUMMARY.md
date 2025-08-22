# ATIVE Casino Bot Project Summary

## Project Overview

**ATIVE Casino Bot** is a comprehensive Discord casino system built in JavaScript/Node.js, featuring two specialized Discord bots for optimal performance and organization.

## Architecture

### Two-Bot System
- **Casino Bot**: Handles all gaming and economy features
- **Utility Bot**: Manages administration, moderation, and system utilities

### Technology Stack
- **Runtime**: Node.js 18+
- **Framework**: Discord.js v14
- **Database**: Firebase Firestore
- **Logging**: Winston
- **Security**: Cryptographic RNG, role-based permissions

## Features Implemented

### 🎰 Casino Bot Features
- **Economy Commands**:
  - `/balance` - Check wallet and bank balances
  - `/earn` - Hourly coin earning (15K-30K)
  - `/work` - Work for coins every 2 hours

- **Casino Games**:
  - 🎰 **Slots**: Full-featured slot machine with:
    - Multiple symbols with different rarities
    - Progressive jackpots and multipliers
    - Special combinations (777, diamonds, bells)
    - Secure random number generation
  
  - 🃏 **Blackjack**: Complete implementation with:
    - Hit, stand, double down mechanics
    - Split functionality for pairs
    - Dealer AI following standard rules
    - Real-time game state management

- **Balance Management**:
  - Secure wallet and bank system
  - Transaction validation and error handling
  - Server booster bonuses (+15%)

- **Statistics Tracking**:
  - Per-game statistics (wins, losses, biggest wins)
  - Overall performance metrics
  - Leaderboards and rankings

### 🛠️ Utility Bot Features
- **Admin Commands**:
  - `/addmoney` - Add coins to user accounts
  - `/setmoney` - Set user balance directly
  - `/backup` - Create database backups

- **Developer Commands**:
  - `/status` - System status and performance metrics
  - `/logs` - View recent application logs
  - `/reload` - Hot reload commands during development

- **Polls System**:
  - Interactive voting with real-time updates
  - Multiple time formats (30m, 2h, 1d)
  - Progress bars and vote tracking
  - Admin controls for poll management

- **Permission System**:
  - Role-based access control
  - Admin, mod, and developer tiers
  - Comprehensive audit logging

## Database Schema

Firebase Firestore collections:

```
user_balances/          # User wallet and bank data
├── {userId}/
    ├── wallet: number
    ├── bank: number
    ├── last_earn_ts: timestamp
    └── ...

user_stats/             # Game performance statistics
├── {userId}_{gameType}/
    ├── wins: number
    ├── losses: number
    ├── total_wagered: number
    ├── biggest_win: number
    └── ...

polls/                  # Active and completed polls
├── {pollId}/
    ├── question: string
    ├── options: array
    ├── votes: object
    ├── active: boolean
    └── ...

guild_configs/          # Server-specific settings
purchases/              # Coin purchase history
jackpots/              # Jackpot win records
```

## Security Features

- 🔐 **Cryptographic Security**: All random numbers use Node.js crypto module
- 🛡️ **Input Validation**: Comprehensive sanitization of user inputs
- 📝 **Audit Logging**: All admin actions logged with timestamps
- 🔥 **Firebase Rules**: Secure database access patterns
- 🚫 **Permission Checks**: Role-based command restrictions

## Development Features

- **Hot Reload**: Commands can be reloaded without bot restart
- **Error Handling**: Comprehensive error catching and user feedback
- **Logging System**: Multi-level logging with file rotation
- **Development Mode**: Auto-restart with nodemon
- **Code Organization**: Modular structure with shared utilities

## Deployment Ready

### Production Features
- **PM2 Integration**: Process management and auto-restart
- **Docker Support**: Containerized deployment
- **Environment Configs**: Separate dev/prod configurations
- **Health Monitoring**: System status and performance tracking

### Scalability
- **Separate Bot Architecture**: Independent scaling of casino vs utility features
- **Shared Database**: Unified data storage across both bots
- **Microservice Pattern**: Each bot can be deployed independently

## File Structure

```
ative_casino_bot/
├── casino-bot/              # Casino games and economy
│   ├── commands/            # Game commands
│   ├── utils/               # Casino-specific utilities
│   ├── assets/              # Game assets (cards, slots)
│   └── index.js             # Casino bot entry point
│
├── utility-bot/             # Admin and system management
│   ├── commands/            # Admin/mod/dev commands
│   └── index.js             # Utility bot entry point
│
├── shared/                  # Common utilities
│   ├── firebase/            # Database configuration
│   └── utils/               # Shared functions
│
├── scripts/                 # Setup and maintenance scripts
├── README.md               # Project documentation
├── INSTALLATION.md         # Setup guide
└── package.json            # Root package configuration
```

## Getting Started

1. **Quick Setup**:
   ```bash
   npm run install:all
   npm run setup
   npm run dev
   ```

2. **Production Deployment**:
   ```bash
   npm start
   # or with PM2
   pm2 start casino-bot/index.js --name "ative-casino-bot"
   pm2 start utility-bot/index.js --name "ative-utility-bot"
   ```

## Future Expansion

The modular architecture supports easy addition of:
- New casino games (poker, roulette, etc.)
- Additional economy features
- Enhanced admin tools
- Multi-server support
- Advanced statistics and analytics

---

**ATIVE Casino Bot** - Professional Discord casino experience built for scale and security! 🎰🃏🎲