# UAS Bot VPS Deployment Guide - Pterodactyl Panel

## Prerequisites
- Pterodactyl Panel admin access
- UAS bot Discord application token
- Database credentials (same as main casino bot)

## Step 1: Install UAS Bot Egg (Admin Required)

1. **Import the UAS Bot Egg:**
   - Login as admin to Pterodactyl Panel
   - Go to Admin Panel → Nests → Generic
   - Click "Import Egg"
   - Upload `egg-nodejs-uas-bot.json` from the uas folder
   - The egg includes:
     - ✅ Node.js 18+ support
     - ✅ Canvas dependencies
     - ✅ MySQL2 support
     - ✅ Discord.js v14
     - ✅ Auto slash command deployment
     - ✅ Winston logging
     - ✅ All UAS bot dependencies

## Step 2: Create New Server in Pterodactyl

1. **Create a new server using the UAS Bot egg:**
   - Name: `ATIVE UAS Bot`
   - Egg: `ATIVE UAS Bot - Node.js` (the one you just imported)
   - Memory: 512MB (minimum, 1GB recommended)  
   - Disk: 2GB (minimum)
   - CPU: 100%
   - **Port Allocation**: 25566 (or any available port different from main bot's 25565)

## Step 3: Configure Server Variables

1. **Go to your UAS server → Startup tab**
2. **Configure the following variables:**

### **🔧 Core Configuration:**
   - **Discord Bot Token**: Your UAS bot token
   - **Discord Client ID**: Your UAS bot client ID
   - **MariaDB Password**: Your database password
   - **Deploy Commands**: 1 (to auto-deploy slash commands)
   - **Environment**: production

### **📁 Deployment Method - Choose One:**

#### **Option A: Git Deployment (Recommended)**
   - **Git Repository URL**: `https://github.com/your-username/your-repo.git`
   - **Git Branch**: `main` (or your branch name)
   - **Auto Update from Git**: 1 (auto-pull updates on restart)

#### **Option B: Manual File Upload**
   - **Git Repository URL**: (leave empty)
   - **Git Branch**: (leave empty)
   - **Auto Update from Git**: 0

## Step 4: Deploy UAS Bot

### **🚀 Git Deployment (Recommended)**
**If you configured Git Repository URL above:**
1. **Start the server** - the egg will automatically:
   - Clone your repository
   - Handle subdirectories (if UAS bot is in `uas/` folder)
   - Install all dependencies
   - Deploy slash commands
   - Start the bot

### **📁 Manual File Upload**
**If you left Git Repository URL empty:**
1. **Upload files via File Manager:**
   ```bash
   cd /Users/carlosdiazplaza/ative_casino_bot
   tar -czf uas-bot.tar.gz uas/
   ```
   - Upload `uas-bot.tar.gz` to server
   - Extract: `tar -xzf uas-bot.tar.gz`
   - Move files: `mv uas/* . && rm -rf uas uas-bot.tar.gz`

2. **Start the server**

## Step 5: Start the Server

**The UAS Bot Egg handles everything automatically:**
- ✅ Installs all dependencies (Canvas, MySQL2, Discord.js, etc.)
- ✅ Deploys slash commands automatically
- ✅ Sets up logging directory
- ✅ Configures proper permissions

1. **Start server in Pterodactyl**
2. **Check console output for:**
   - ✅ Database connection successful
   - ✅ All commands loaded from ECONOMY folder
   - ✅ Discord login successful
   - ✅ "ATIVE Utility & Security Bot is ready!"

## Step 8: Verify Deployment

1. **Check Discord server for:**
   - UAS bot online status
   - Slash commands available (`/balance`, `/work`, `/editmoney`, etc.)

2. **Test key commands:**
   - `/balance` - Check economy system
   - `/panel` - Verify panel management
   - `/drawlottery` (admin) - Test admin functions

## Troubleshooting

### Common Issues:

1. **Port Conflict:**
   - **Error**: "Port already in use" or allocation conflicts
   - **Solution**: UAS bot uses port **25566** by default (main casino bot uses 25565)
   - **Note**: UAS bot doesn't actually use HTTP server, but Pterodactyl requires port allocation
   - Change port in server allocation if 25566 is unavailable

2. **Module not found errors:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Database connection failed:**
   - Verify database credentials in server variables
   - Check if main casino bot can connect from same VPS
   - Ensure both bots use same database (shared economy system)

4. **Discord login failed:**
   - Verify `DISCORD_TOKEN` in server variables
   - Ensure bot has proper permissions in Discord Developer Portal
   - Make sure you're using UAS bot token, not main casino bot token

5. **Commands not registering:**
   - Set "Deploy Commands" to 1 in server variables
   - Commands auto-deploy on startup
   - Manual deployment: `npm run deploy-commands`

6. **Permission errors:**
   ```bash
   chown -R container:container /home/container
   ```

### Log Monitoring:
```bash
# Check real-time logs
tail -f logs/combined.log

# Check error logs
tail -f logs/error.log
```

## File Structure on VPS
```
/home/container/
├── index.js
├── package.json
├── .env
├── COMMANDS/
│   ├── ADMIN/
│   ├── ECONOMY/
│   ├── MOD/
│   ├── SECURITY/
│   └── SHIFT/
├── UTILS/
├── EVENTS/
├── scripts/
│   └── deploy-commands.js
└── logs/
```

## Auto-Restart Configuration

1. **Enable auto-restart in Pterodactyl:**
   - Server Settings → Startup
   - Enable "Auto Start" if server crashes

2. **For manual restart schedule (optional):**
   ```bash
   # Add to cron (if available)
   0 6 * * * /usr/local/bin/pm2 restart uas-bot
   ```

## Security Notes

- ✅ Keep `.env` file secure (never commit to Git)
- ✅ Use production database credentials
- ✅ Monitor bot permissions in Discord
- ✅ Regular backup of configuration files

## Performance Monitoring

- **Memory Usage:** Monitor in Pterodactyl dashboard
- **CPU Usage:** Should be minimal when idle
- **Database Connections:** Check connection pool usage
- **Response Times:** Monitor command execution times

---

**Deployment Complete!** Your UAS bot should now be running on the VPS with all economy commands, admin tools, and utility functions operational.