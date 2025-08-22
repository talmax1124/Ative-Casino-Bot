# ATIVE Casino Bot - JavaScript Version

A complete Discord casino bot system built in JavaScript/Node.js, featuring two separate Discord bots for better organization and scalability.

## Project Structure

```
ative_casino_bot/
├── casino-bot/          # Bot 1: Casino Games & Economy
├── utility-bot/         # Bot 2: Admin, Mod, Dev Tools
├── shared/              # Shared utilities and Firebase
└── README.md
```

## Features

### Casino Bot
- **Economy System**: `/earn`, `/work`, `/beg`, `/balance` commands
- **Casino Games**: 
  - 🎰 **Slots** - Classic slot machine with jackpots and multipliers
  - 🃏 **Blackjack** - Full featured with hit, stand, double down, split
  - 🎲 **More games** - Additional casino games coming soon
- **Balance Management**: Wallet and bank system with secure transactions
- **Statistics Tracking**: Detailed per-game and overall performance stats
- **Server Booster Bonuses**: 15% extra earnings for server boosters

### Utility Bot
- **Admin Commands**: `/addmoney`, `/setmoney`, `/backup`, user management
- **Mod Commands**: Moderation tools and server controls
- **Dev Commands**: `/status`, `/reload`, `/logs`, system management
- **Polls System**: Interactive voting with real-time updates
- **Logging**: Comprehensive audit trail for all actions

## Installation

### Prerequisites
- Node.js 18.0.0 or higher
- npm or yarn package manager
- Discord bot tokens (one for each bot)
- Firebase project with Firestore enabled

### Quick Setup

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd ative_casino_bot
   npm run install:all
   ```

2. **Configure Environment**
   ```bash
   npm run setup
   ```
   This will guide you through setting up Discord tokens and Firebase credentials.

3. **Start Development**
   ```bash
   npm run dev
   ```

4. **Start Production**
   ```bash
   npm start
   ```

### Manual Configuration

Copy example files and edit:
```bash
cp casino-bot/.env.example casino-bot/.env
cp utility-bot/.env.example utility-bot/.env
```

## Bot Configuration

### Discord Applications Required

Create two Discord applications at https://discord.com/developers/applications:

1. **"ATIVE Casino Bot"** - for games and economy
2. **"ATIVE Casino Utility Bot"** - for admin and moderation

### Required Permissions

#### Casino Bot
- Send Messages
- Use Slash Commands
- Embed Links
- Read Message History
- Add Reactions

#### Utility Bot
- Send Messages
- Use Slash Commands
- Embed Links
- Manage Messages
- Manage Roles
- View Audit Log

## Available Commands

### Casino Bot Commands
```
/balance                     # Check your balance
/earn                       # Earn coins every hour
/work                       # Work for coins every 2 hours
/slots <amount>             # Play slot machine
/blackjack <amount>         # Play blackjack
```

### Utility Bot Commands
```
/status                     # System status (dev only)
/addmoney <user> <amount>   # Add money to user (admin only)
/setmoney <user> <amount>   # Set user balance (admin only)
/backup                     # Create database backup (admin only)
/polls                      # Create interactive polls
/logs <lines>               # View recent logs (dev only)
/reload <command>           # Reload a command (dev only)
```

## Firebase Database

The system uses Firebase Firestore with these collections:

- `user_balances` - User wallet and bank balances
- `user_stats` - Game statistics per user per game type
- `guild_configs` - Server-specific configuration
- `polls` - Active and completed polls
- `purchases` - Coin purchase history
- `jackpots` - Jackpot win records

## Development

### Adding New Games

1. Create command file in `casino-bot/commands/`
2. Use `GameUtils` and `PayoutManager` for consistency
3. Follow existing patterns for bet validation
4. Add game type to `GameType` enum

### Code Style
- ESLint for linting: `npm run lint`
- Consistent error handling and logging
- Follow existing patterns and conventions

## Deployment

### Using PM2 (Recommended)
```bash
npm install -g pm2
pm2 start casino-bot/index.js --name "ative-casino-bot"
pm2 start utility-bot/index.js --name "ative-utility-bot"
pm2 save
pm2 startup
```

### Using Docker
```bash
docker build -t ative-casino-bot ./casino-bot
docker build -t ative-utility-bot ./utility-bot
docker run -d --name casino-bot --env-file casino-bot/.env ative-casino-bot
docker run -d --name utility-bot --env-file utility-bot/.env ative-utility-bot
```

## Security Features

- 🔐 Cryptographically secure random number generation
- 🛡️ Role-based permission system
- 📝 Comprehensive audit logging
- 🔥 Firebase security rules
- 🚫 Input validation and sanitization

## Monitoring

- Winston logging with file rotation
- Discord channel logging for important events
- Error tracking and performance monitoring
- Real-time system status monitoring

## Support

- Create issues in the GitHub repository
- Check logs for troubleshooting
- Review Firebase console for database issues

## License

This project is licensed under the MIT License.

---

**ATIVE Casino Bot** - The ultimate Discord casino experience! 🎰🃏🎲