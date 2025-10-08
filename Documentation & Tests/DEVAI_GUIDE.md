# 🤖 DevAI System - AI-Powered Development Assistant

## Overview

The DevAI system allows you to use AI (ChatGPT) directly within Discord to code, fix bugs, create features, and manage your bot automatically. It can even restart your VPS after making changes!

## 🚀 Quick Setup

### 1. Get OpenAI API Key
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy the key

### 2. Add to Environment
Add this to your `.env` file:
```env
OPENAI_API_KEY=your_api_key_here
```

### 3. Test Setup
```bash
node UTILS/devAI-setup.js
```

## 🎯 Commands

### `/devai fix`
Fix bugs and errors in your bot
```
/devai fix issue: The blackjack command is giving wrong payouts auto_restart: true
/devai fix issue: Users getting "interaction failed" on slots
/devai fix issue: Database connection errors in logs
```

### `/devai create`
Create new features or commands
```
/devai create feature: Add a new poker game with Texas Hold'em rules
/devai create feature: Create a daily bonus command that gives coins
/devai create feature: Add a leaderboard for highest wins
```

### `/devai optimize`
Optimize performance and code
```
/devai optimize target: Database queries are too slow
/devai optimize target: Commands taking too long to respond
/devai optimize target: Memory usage is too high
```

### `/devai test`
Run automated tests
```
/devai test
/devai test specific_test: blackjack
```

### `/devai status`
Check system status
```
/devai status
```

## 🔄 Auto-Restart Features

When you set `auto_restart: true`, the system will:

1. **Make the changes** - AI codes the fix/feature
2. **Run tests** - Validates the changes work
3. **Deploy automatically** - Restarts your bot/VPS
4. **Send results** - Shows you what happened

### Default Restart Commands
- `pm2 restart ative-casino-bot` (if using PM2)
- `systemctl restart ative-casino-bot` (if using systemd)
- `sudo reboot` (full VPS restart as last resort)

### Custom Restart Commands
Add to your `.env`:
```env
DEVAI_DEPLOY_COMMANDS=pm2 restart bot,nginx -s reload,custom-deploy-script.sh
```

## 🛡️ Security Features

- **Developer-only** - Only your Discord ID can use these commands
- **File restrictions** - Can only modify safe directories (COMMANDS/, GAMES/, UTILS/)
- **Backup system** - Automatically backs up files before changes
- **Validation** - Blocks dangerous code patterns
- **Testing** - Runs tests before deployment

## 📊 Example Workflow

```
You: /devai fix issue: Slots game is crashing when someone wins auto_restart: true

DevAI:
1. 🔍 Analyzing codebase...
2. 🤖 AI generating fix...
3. 💾 Creating backups...
4. ✏️ Applying changes to COMMANDS/slots.js
5. 🧪 Running tests... (3/3 passed)
6. 🚀 Restarting bot...
7. ✅ Fix complete! Bot is back online.
```

## 🧪 Automated Testing

The system automatically runs these tests:
- **Syntax Check** - Ensures code is valid JavaScript
- **ESLint** - Code quality and style checks
- **Bot Startup** - Tests that bot can start without errors
- **Existing Tests** - Runs any test files in `/tests/` folder

## 🔧 Advanced Configuration

### Environment Variables
```env
# Required
OPENAI_API_KEY=your_key_here

# Optional
DEVAI_DEPLOY_COMMANDS=pm2 restart bot,custom-script.sh
DEVAI_AUTO_RESTART=false
DEVAI_TIMEOUT=300
```

### Custom Test Commands
The system will automatically detect and run test files in your `/tests/` folder.

## 🚨 Error Handling

If something goes wrong:
- **Automatic rollback** - Restores from backup if tests fail
- **Error logging** - Detailed logs of what went wrong
- **Safe mode** - Won't restart if tests fail

## 💡 Pro Tips

1. **Be specific** - "Fix blackjack payouts" is better than "fix bugs"
2. **Use auto-restart** - For quick fixes and features
3. **Test first** - Use `/devai test` before major changes
4. **Monitor logs** - Check bot logs after AI changes
5. **Backup important changes** - AI changes are auto-backed up

## 🎯 Example Use Cases

### Bug Fixes
- "Users can't withdraw money from bank"
- "Lottery command showing wrong time"
- "Database errors when playing crash"

### New Features
- "Add a coinflip game with 50/50 odds"
- "Create admin command to reset user balance"
- "Add weekly bonus for active players"

### Optimizations
- "Speed up database queries"
- "Reduce memory usage"
- "Make commands respond faster"

## 🔍 Troubleshooting

### Command Not Working
```bash
# Check setup
node UTILS/devAI-setup.js

# Check logs
tail -f logs/error.log
```

### API Key Issues
- Verify key is correct in `.env`
- Check OpenAI account has credits
- Ensure key has proper permissions

### Permission Errors
- Only the developer (your Discord ID) can use these commands
- Check `DEVELOPER_ID` in the code matches your Discord ID

---

## 🎉 Ready to Use!

Once configured, you can literally tell your bot to fix itself or add new features just by typing a Discord command. The AI will understand your request, write the code, test it, and deploy it automatically!

Try it out:
```
/devai fix issue: Make the help command look better auto_restart: true
```