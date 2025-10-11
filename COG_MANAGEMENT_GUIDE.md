# 🔧 Cog Management System Guide

## Overview

The Cog Management System allows server administrators to enable or disable bot features by organizing commands into logical categories called "cogs". This provides fine-grained control over which features are available in your server.

## Features

- **Category-based Management**: Commands are organized into 8 logical categories
- **Individual Command Control**: Enable/disable specific commands within categories
- **Interactive Panel**: Easy-to-use interface for managing cogs
- **Persistent Settings**: Cog states are saved to the database
- **Admin-only Access**: Only server administrators can manage cogs
- **Real-time Updates**: Changes take effect immediately

## Available Cog Categories

### 🎮 Games
Casino games and gambling commands
- **Commands**: blackjack, slots, roulette, crash, plinko, mines, keno, ceelo, bingo, lottery, multi-slots, russianroulette, scratch

### 💰 Economy  
Money management and economy commands
- **Commands**: balance, deposit, withdraw, sendmoney, buymoney, shop, rewards

### 💼 Earning Commands
Commands to earn money and experience  
- **Commands**: work, crime, beg, dailytask, weekly, monthly, earnmoney, fishing, treasurevault

### 👥 Social & Fun
Social interaction and fun commands
- **Commands**: marriage, profile, leaderboard, rob, robstats, polls, duck, rps

### ⚙️ Administration
Server administration and management commands
- **Commands**: admin, setup, backup, vote, release

### 🛠️ Utility
General utility and information commands
- **Commands**: help, stats, userhistory, cooldown, sessionstatus, stopmysession, stopgame

### 🎯 Advanced Games
Complex multiplayer and strategic games
- **Commands**: uno, battleship, texasholdem, dominoes, yahtzee, chess, wordchain, heist-game

### 🏈 Sports Betting
Sports betting and prediction commands
- **Commands**: sportbet

## How to Use

### Interactive Panel Method (Recommended)

1. Use `/cogmanage panel` to open the interactive management interface
2. Select a cog category from the dropdown menu
3. Use the buttons to enable/disable the selected cog
4. Use "Enable All Cogs" or "Disable All Cogs" for bulk operations
5. Click "Refresh Status" to update the display

### Command Line Method

#### View Status
```
/cogmanage status
```
Shows the current status of all cogs and their commands.

#### Enable a Cog Category
```
/cogmanage enable type:Cog Category name:games
```
Enables all commands in the "games" category.

#### Disable a Cog Category  
```
/cogmanage disable type:Cog Category name:economy
```
Disables all commands in the "economy" category.

#### Enable Individual Command
```
/cogmanage enable type:Individual Command name:blackjack
```
Enables just the blackjack command.

#### Disable Individual Command
```
/cogmanage disable type:Individual Command name:slots
```
Disables just the slots command.

## Permission Requirements

- **Authorized Users Only**: Only specific authorized users can use cog management commands
  - User IDs: `466050111680544798`, `1326438668591829068`, `1399233099224846460`
- **Bot Permissions**: The bot needs database access to store cog states

## Technical Details

### Database Tables

The system creates two tables:

1. **disabled_cogs**: Stores disabled cog categories
2. **disabled_commands**: Stores individually disabled commands

### Command Checking

When a user tries to run a command, the bot:
1. Checks if the specific command is disabled
2. Checks if the command's category is disabled  
3. If either check fails, shows a "Command Disabled" message
4. Otherwise, executes the command normally

### Integration

The cog system is integrated into the main bot interaction handler, so it works automatically with all existing commands without requiring code changes to individual command files.

## Troubleshooting

### Commands Not Working After Setup

1. Verify the database connection is working
2. Check that the cog management tables were created
3. Use `/cogmanage status` to verify the command's cog is enabled
4. Try re-enabling the cog or specific command

### Permission Errors

1. Ensure your user ID is in the authorized users list
2. Check that the bot has proper database access
3. Verify the bot is not in maintenance mode

### Panel Not Responding

1. Try using the command-line method instead
2. Click "Refresh Status" to reload the panel
3. Check bot logs for any error messages

## Advanced Usage

### Testing the System

Run the test script to verify everything works:
```bash
node test-cog-system.js
```

### Programmatic Access

Developers can use the cogManager module directly:

```javascript
const cogManager = require('./UTILS/cogManager');

// Check if command is enabled
if (cogManager.isCommandEnabled('blackjack')) {
    // Execute command logic
}

// Enable/disable cogs programmatically
await cogManager.enableCog('games');
await cogManager.disableCommand('slots');
```

## Security Considerations

- Only administrators can manage cogs
- Database operations are protected against SQL injection
- Cog states persist across bot restarts
- Invalid commands/categories are rejected safely

## Support

If you encounter issues with the cog management system:

1. Check the bot logs for error messages
2. Verify database connectivity
3. Test with the included test script
4. Contact the bot developer with specific error details

---

*This cog management system provides powerful control over your bot's features while maintaining security and ease of use.*