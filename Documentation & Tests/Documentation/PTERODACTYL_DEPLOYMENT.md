# 🦕 ATIVE Casino Bot - Pterodactyl Deployment Guide

## Overview
This guide will walk you through deploying the ATIVE Casino Bot on a Pterodactyl panel, which provides a web-based game server management interface. The bot has been optimized for Pterodactyl with automatic database setup, health monitoring, and backup systems.

## Prerequisites

### Required Software
- **Pterodactyl Panel**: Version 1.0+ with Node.js support
- **Database**: MariaDB 10.4+ or PostgreSQL 12+ (recommended) or Firebase (fallback)
- **Node.js**: Version 18.0+ (specified in package.json engines)

### Required Information
- Discord Bot Token
- Discord Application Client ID
- Database credentials (MariaDB/PostgreSQL)
- Pterodactyl panel access

## Step 1: Database Setup

### Option A: MariaDB (Recommended for Pterodactyl)
1. **Create Database** in your Pterodactyl panel:
   - Navigate to Databases section
   - Create new database named `ative_casino`
   - Note the host, port, username, and password

2. **Verify Connection**:
   ```bash
   mysql -h your_host -P 3306 -u your_username -p your_password
   USE ative_casino;
   ```

### Option B: PostgreSQL (Alternative)
1. **Setup PostgreSQL** (if available):
   ```sql
   CREATE DATABASE ative_casino;
   CREATE USER casino_user WITH PASSWORD 'secure_password';
   GRANT ALL PRIVILEGES ON DATABASE ative_casino TO casino_user;
   ```

### Option C: Firebase (Fallback)
If MariaDB/PostgreSQL is not available, the bot will automatically fall back to Firebase:
1. Create Firebase project
2. Enable Firestore
3. Generate service account key
4. Configure in environment variables

## Step 2: Server Configuration

### 1. Create New Server
In your Pterodactyl panel:
- **Server Name**: ATIVE Casino Bot
- **Description**: Discord Casino Bot with Multi-Database Support
- **Egg**: Node.js (Generic or Discord Bot)
- **Docker Image**: `quay.io/parkervcp/yolks:nodejs_18` (or latest)

### 2. Resource Allocation
**Recommended minimum resources:**
- **Memory**: 512MB (1GB recommended)
- **CPU**: 50% (100% for heavy usage)
- **Disk**: 2GB (for logs, backups, assets)
- **Network**: No specific limits needed

### 3. Startup Configuration
```bash
# Startup Command
node index.js

# Installation Script (if needed)
npm install --production
```

## Step 3: File Upload and Configuration

### 1. Upload Bot Files
Upload all bot files to your Pterodactyl server:
```
ative_casino_bot/
├── index.js
├── package.json
├── startup.sh (main startup script)
├── .env.pterodactyl (template)
├── COMMANDS/
├── GAMES/
├── UTILS/
├── scripts/
└── assets/
```

### 2. Configure Environment Variables
1. **Copy template**: `cp .env.pterodactyl .env`
2. **Edit .env** with your actual values:

```bash
# Essential Configuration
DISCORD_TOKEN=your_actual_bot_token
CLIENT_ID=your_actual_client_id
ENVIRONMENT=production

# MariaDB Configuration (Primary)
MARIADB_HOST=your_database_host
MARIADB_PORT=3306
MARIADB_USER=your_db_username  
MARIADB_PASSWORD=your_db_password
MARIADB_DATABASE=ative_casino

# Logging and Monitoring
LOG_CHANNEL_ID=1405096821512212521
DEVELOPER_ID=466050111680544798
PORT=3000
ENABLE_HEALTH_CHECKS=true

# Backup Configuration
BACKUP_RETENTION_DAYS=7
```

### 3. Set Startup Command
In Pterodactyl panel settings, set:
```bash
# Primary startup command
bash startup.sh

# Or direct Node.js startup
node index.js
```

## Step 4: Initial Setup and Testing

### 1. First Boot
1. **Start the server** in Pterodactyl console
2. **Watch startup logs** for any configuration errors
3. **Verify database connection** in console output

Expected startup sequence:
```
🎰 Starting ATIVE Casino Bot...
🔍 Validating environment configuration...
✅ MariaDB configuration detected
📦 Installing/updating dependencies...
🗄️ Setting up database schema...
✅ Database setup completed successfully!
🚀 Starting ATIVE Casino Bot...
📊 Environment: production
```

### 2. Database Schema Initialization
The bot automatically creates all necessary tables on first run:
- `user_balances` - User wallet/bank data
- `user_stats` - Game statistics
- `user_profiles` - Discord profile cache
- `server_config` - Guild configurations
- `lottery`, `lottery_data`, `lottery_tickets` - Lottery system
- And more...

### 3. Test Commands
Once bot is online, test these commands in Discord:
- `/balance` - Check if database operations work
- `/help` - Verify command registration
- `/work` - Test economy system

## Step 5: Advanced Configuration

### 1. Health Monitoring
The bot includes automated health checks:
```bash
# Setup monitoring (auto-configured on startup)
./scripts/cron-setup.sh
```

Health check monitors:
- Bot process status
- Database connectivity  
- Discord API connectivity
- Memory/CPU usage

### 2. Automated Backups
Backups are automatically configured:
- **Database backups**: Every 6 hours
- **Configuration backups**: Daily
- **Retention**: 7 days (configurable)
- **Location**: `/home/container/backups/`

### 3. Log Management
Logs are automatically managed:
- **Main log**: `/home/container/logs/casino-bot.log`
- **Health checks**: `/home/container/logs/health-check.log`
- **Backups**: `/home/container/logs/backup.log`
- **Rotation**: Daily at midnight

## Step 6: Discord Configuration

### 1. Bot Permissions
Required Discord permissions:
- Send Messages
- Use Slash Commands
- Embed Links
- Attach Files
- Read Message History
- Add Reactions
- Use External Emojis

### 2. Slash Commands Registration
Commands are automatically registered on bot startup. If needed, manually trigger:
```bash
# In bot console
/dev deploy-commands
```

### 3. Server Setup
Use `/setup` command in your Discord server to configure:
- Admin roles
- Game channels
- Economy settings
- Security settings

## Troubleshooting

### Common Issues

**1. Database Connection Failed**
```
❌ MariaDB connection failed, falling back to Firebase
```
- Verify database credentials in `.env`
- Check if database server is running
- Ensure firewall allows connections
- Test connection manually with mysql client

**2. Permission Denied Errors**
```
EACCES: permission denied, open '/home/container/.env'
```
```bash
# Fix permissions
chmod 644 /home/container/.env
chmod +x /home/container/startup.sh
chmod +x /home/container/scripts/*.sh
```

**3. Memory Issues**
```
JavaScript heap out of memory
```
- Increase memory allocation in Pterodactyl panel
- Enable memory optimization in `.env`:
```bash
MAX_MEMORY_USAGE=512
```

**4. Discord Token Invalid**
```
Error [TokenInvalid]: An invalid token was provided.
```
- Regenerate bot token in Discord Developer Portal
- Update `DISCORD_TOKEN` in `.env`
- Restart server

**5. Commands Not Working**
```
This interaction failed
```
- Check bot has proper permissions in Discord server
- Verify bot is in server and online
- Try `/dev deploy-commands` to re-register

### Log Analysis

**Check startup logs:**
```bash
# In Pterodactyl console
tail -f logs/casino-bot.log
```

**Check health status:**
```bash
./scripts/health-check.sh
```

**Database status check:**
```bash
# MariaDB
mysql -h$MARIADB_HOST -u$MARIADB_USER -p$MARIADB_PASSWORD -e "SHOW TABLES;" $MARIADB_DATABASE
```

## Maintenance

### Regular Maintenance Tasks

**1. Update Dependencies**
```bash
npm update
npm audit fix
```

**2. Database Maintenance**
```bash
# Optimize tables (MariaDB)
mysql -h$MARIADB_HOST -u$MARIADB_USER -p$MARIADB_PASSWORD -e "OPTIMIZE TABLE user_balances, user_stats;" $MARIADB_DATABASE
```

**3. Log Cleanup**
Automatic log rotation is configured, but manual cleanup:
```bash
find /home/container/logs -name "*.log.*" -mtime +7 -delete
```

**4. Backup Verification**
Check backup integrity:
```bash
ls -la /home/container/backups/
./scripts/backup.sh # Manual backup
```

### Performance Optimization

**1. Database Optimization**
- Regularly analyze slow queries
- Optimize indexes for user lookup patterns
- Consider connection pooling adjustments

**2. Memory Management**
```bash
# Monitor memory usage
free -h
ps aux | grep node
```

**3. Enable Clustering** (for high load)
```bash
# In .env
ENABLE_CLUSTERING=true
CLUSTER_WORKERS=2
```

## Security Best Practices

### 1. Environment Security
- Never commit `.env` to version control
- Use strong database passwords
- Regularly rotate Discord bot token
- Limit database user permissions

### 2. Panel Security
- Enable 2FA on Pterodactyl account
- Use strong panel passwords
- Regularly update Pterodactyl panel
- Monitor server access logs

### 3. Bot Security
- Monitor suspicious economy activity
- Set reasonable rate limits
- Log all admin actions
- Regular backup verification

## Scaling and Production

### Horizontal Scaling
For multiple servers/high load:

1. **Database Clustering**: Use MariaDB Galera or PostgreSQL streaming replication
2. **Load Balancing**: Multiple bot instances with shared database
3. **Redis Caching**: Add Redis for session management
4. **Monitoring**: Prometheus + Grafana for metrics

### Production Checklist
- [ ] Environment variables configured
- [ ] Database properly secured  
- [ ] SSL/TLS enabled for database connections
- [ ] Backups tested and verified
- [ ] Health monitoring configured
- [ ] Log rotation working
- [ ] Discord permissions reviewed
- [ ] Rate limiting configured
- [ ] Error alerting setup

## Support and Resources

### Getting Help
- **Documentation**: `/home/container/Documentation & Tests/Documentation/`
- **Logs**: `/home/container/logs/`
- **Health Check**: `./scripts/health-check.sh`
- **Manual Backup**: `./scripts/backup.sh`

### Useful Commands
```bash
# Restart bot
pm2 restart casino-bot  # if using PM2
# or kill process and restart via panel

# View real-time logs  
tail -f logs/casino-bot.log

# Database backup
./scripts/backup.sh

# Health status
./scripts/health-check.sh

# Setup cron jobs
./scripts/cron-setup.sh
```

### Emergency Recovery
If bot crashes or data is corrupted:

1. **Stop bot** via Pterodactyl panel
2. **Restore from backup**:
   ```bash
   # Database restore (MariaDB)
   mysql -h$MARIADB_HOST -u$MARIADB_USER -p$MARIADB_PASSWORD $MARIADB_DATABASE < backups/mariadb_backup_YYYYMMDD_HHMMSS.sql
   ```
3. **Verify configuration** in `.env`
4. **Restart bot** via panel
5. **Test functionality** with `/balance` command

---

## Conclusion

Your ATIVE Casino Bot is now deployed and configured for Pterodactyl! The bot includes comprehensive database management, automated backups, health monitoring, and fallback systems to ensure reliable operation.

For additional configuration options, see the other documentation files in the `Documentation & Tests/Documentation/` directory.

**Happy Gaming! 🎰**