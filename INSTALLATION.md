# Installation Guide - ATIVE Casino Bot

This guide will help you install and configure the ATIVE Casino Bot with two separate Discord bots for optimal performance and organization.

## Prerequisites

### System Requirements
- **Node.js** 18.0.0 or higher
- **npm** or **yarn** package manager
- **Git** (for cloning and version control)

### Discord Requirements
- Two Discord bot applications (or one if you prefer to use the same bot for both)
- Bot tokens and client IDs
- Server with appropriate permissions

### Firebase Requirements
- Firebase project with Firestore enabled
- Service account credentials

## Step 1: Clone and Setup

```bash
# Clone the repository
git clone <your-repository-url>
cd ative_casino_bot

# Install dependencies for all projects
npm run install:all

# Or install manually
npm install
cd casino-bot && npm install
cd ../utility-bot && npm install
cd ../shared && npm install
cd ..
```

## Step 2: Discord Bot Setup

### Create Discord Applications

1. Go to https://discord.com/developers/applications
2. Create **two applications** (recommended) or use one for both:
   - **"ATIVE Casino Bot"** - for games and economy
   - **"ATIVE Casino Utility Bot"** - for admin and moderation

### Configure Bot Users

For each application:
1. Go to the **"Bot"** section
2. Click **"Add Bot"**
3. Copy the **Token** (keep it secret!)
4. Under **Privileged Gateway Intents**, enable:
   - Server Members Intent
   - Message Content Intent

### Get Client IDs

1. Go to **"General Information"** section
2. Copy the **Application ID** (this is your Client ID)

### Bot Permissions

When inviting the bots to your server, they need these permissions:

#### Casino Bot Permissions
- Send Messages
- Use Slash Commands
- Embed Links
- Read Message History
- Add Reactions
- Attach Files

#### Utility Bot Permissions
- Send Messages
- Use Slash Commands
- Embed Links
- Read Message History
- Manage Messages
- Manage Roles (for admin functions)
- View Audit Log

### Invite Bots to Server

Use this URL format (replace CLIENT_ID and PERMISSIONS):
```
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=PERMISSIONS&scope=bot%20applications.commands
```

## Step 3: Firebase Setup

### Create Firebase Project

1. Go to https://console.firebase.google.com/
2. Create a new project named "ATIVE Casino"
3. Enable **Firestore Database**
4. Set Firestore rules to allow read/write (for development):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### Generate Service Account

1. Go to **Project Settings** > **Service Accounts**
2. Click **"Generate new private key"**
3. Download the JSON file
4. Keep this file secure and never commit it to version control

## Step 4: Environment Configuration

### Automatic Setup (Recommended)

Run the interactive setup script:

```bash
npm run setup
```

This will guide you through configuring all environment variables.

### Manual Setup

Copy the example files:

```bash
cp casino-bot/.env.example casino-bot/.env
cp utility-bot/.env.example utility-bot/.env
```

Edit each `.env` file with your configuration:

#### Casino Bot (.env)
```env
# Discord Configuration
DISCORD_TOKEN=your_casino_bot_token_here
CLIENT_ID=your_casino_bot_client_id_here

# Environment
ENVIRONMENT=development
NODE_ENV=development

# Firebase (use your service account details)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your_service_account@your_project.iam.gserviceaccount.com

# Logging
LOG_LEVEL=info

# Developer ID (replace with your Discord user ID)
DEVELOPER_USER_ID=466050111680544798
```

#### Utility Bot (.env)
```env
# Discord Configuration
DISCORD_UTILITY_TOKEN=your_utility_bot_token_here
UTILITY_CLIENT_ID=your_utility_bot_client_id_here

# Firebase (same as casino bot)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your_service_account@your_project.iam.gserviceaccount.com

# Environment
ENVIRONMENT=development
NODE_ENV=development

# Developer ID
DEVELOPER_USER_ID=466050111680544798
```

## Step 5: Running the Bots

### Development Mode (Auto-restart on changes)

```bash
# Start both bots in development mode
npm run dev

# Or start individually
npm run dev:casino    # Casino bot only
npm run dev:utility   # Utility bot only
```

### Production Mode

```bash
# Start both bots
npm start

# Or start individually
npm run start:casino
npm run start:utility
```

## Step 6: Testing

### Verify Bot Status

1. Both bots should appear online in your Discord server
2. Try these test commands:
   - `/balance` (Casino Bot) - Check your balance
   - `/status` (Utility Bot) - Check bot status (developer only)

### Test Basic Functionality

#### Casino Bot
```
/balance                    # Check your balance
/earn                      # Earn some coins
/slots 100                 # Play slots
/blackjack 50              # Play blackjack
```

#### Utility Bot
```
/status                    # System status (dev only)
/polls question:"Test?" options:"Yes;No" duration:"5m"  # Create a poll
/addmoney user:@someone amount:1000  # Add money (admin only)
```

## Step 7: Production Deployment

### Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start both bots with PM2
pm2 start casino-bot/index.js --name "ative-casino-bot"
pm2 start utility-bot/index.js --name "ative-utility-bot"

# Save PM2 configuration
pm2 save

# Setup auto-restart on system reboot
pm2 startup
```

### Using Docker

```bash
# Build Docker images
docker build -t ative-casino-bot ./casino-bot
docker build -t ative-utility-bot ./utility-bot

# Run containers
docker run -d --name casino-bot --env-file casino-bot/.env ative-casino-bot
docker run -d --name utility-bot --env-file utility-bot/.env ative-utility-bot
```

### Environment Variables for Production

Set these in your production environment:
```env
ENVIRONMENT=production
NODE_ENV=production
LOG_LEVEL=warn
```

## Troubleshooting

### Common Issues

#### "Module not found" errors
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm run install:all
```

#### Firebase connection errors
- Verify your service account credentials
- Check that Firestore is enabled
- Ensure your IP is allowed (if using Firebase restrictions)

#### Discord connection errors
- Verify bot tokens are correct
- Check that required intents are enabled
- Ensure bots are invited to the server with correct permissions

#### Commands not appearing
```bash
# Commands should auto-register, but you can force refresh by:
# 1. Restart the bot
# 2. Wait a few minutes for Discord to update
# 3. Try in a different channel or server
```

### Logs

Check logs for errors:
```bash
# View recent logs
tail -f casino-bot/logs/combined.log
tail -f utility-bot/logs/error.log

# Or use the dev command (utility bot)
/logs lines:50
```

### Database Issues

If you need to reset the database:
1. Go to Firebase Console
2. Firestore Database
3. Delete collections or documents as needed
4. Restart the bots

## Support

- Create an issue in the GitHub repository
- Check the README.md for additional information
- Review Firebase console for database troubleshooting

## Security Notes

- Never commit `.env` files to version control
- Keep bot tokens and Firebase credentials secure
- Use appropriate Firestore security rules in production
- Regularly rotate credentials
- Use environment variables in production deployments

---

**ATIVE Casino Bot** - Professional Discord casino experience! 🎰