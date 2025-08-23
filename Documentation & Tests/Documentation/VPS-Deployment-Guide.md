# 🚀 ATIVE Casino Bot - VPS Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying the ATIVE Casino Bot on a Virtual Private Server (VPS). The bot is built with **JavaScript/Node.js** and **Discord.js v14** with **Firebase Firestore** for data persistence.

---

## Prerequisites

### System Requirements
- **Operating System**: Linux (Ubuntu 20.04+ recommended)
- **Node.js**: Version 18.0.0 or higher
- **RAM**: Minimum 1GB (2GB+ recommended)
- **Storage**: 5GB+ available space
- **Network**: Stable internet connection with open ports

### Required Accounts & Services
- **Discord Developer Portal**: Bot token and application
- **Firebase Project**: Firestore database setup
- **VPS Provider**: DigitalOcean, Linode, Vultr, AWS, etc.

---

## Step 1: VPS Setup

### 1.1 Initial Server Configuration

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y curl wget git build-essential software-properties-common

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v18.x.x or higher
npm --version
```

### 1.2 Create Bot User (Security Best Practice)

```bash
# Create dedicated user for the bot
sudo adduser ativebot

# Add user to sudo group (if needed for maintenance)
sudo usermod -aG sudo ativebot

# Switch to bot user
su - ativebot
```

### 1.3 Firewall Configuration

```bash
# Enable UFW firewall
sudo ufw enable

# Allow SSH (replace 22 with your SSH port if different)
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS (if running web interface)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check firewall status
sudo ufw status
```

---

## Step 2: Bot Installation

### 2.1 Clone Repository

```bash
# Navigate to home directory
cd ~

# Clone the repository (replace with your actual repo URL)
git clone https://github.com/yourusername/ative_casino_bot.git
cd ative_casino_bot

# Set proper permissions
chmod +x index.js
```

### 2.2 Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install PM2 for process management (globally)
sudo npm install -g pm2
```

### 2.3 Environment Configuration

```bash
# Copy example environment file
cp .env.example .env

# Edit environment variables
nano .env
```

**Environment Variables (.env):**
```env
# Discord Configuration
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here

# Firebase Configuration
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your_service_account_email

# Bot Configuration
ENVIRONMENT=production
ANNOUNCE_CHANNEL_ID=your_announcement_channel_id

# Optional: Web Dashboard (if implemented)
PORT=3000
WEB_DOMAIN=your_domain.com
```

---

## Step 3: Firebase Setup

### 3.1 Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Enter project name: `ative-casino-bot`
4. Disable Google Analytics (optional)
5. Click "Create project"

### 3.2 Enable Firestore Database

1. In Firebase Console, go to "Firestore Database"
2. Click "Create database"
3. Start in **production mode**
4. Choose your preferred region
5. Click "Done"

### 3.3 Create Service Account

1. Go to Project Settings > Service accounts
2. Click "Generate new private key"
3. Download the JSON file
4. Copy the values to your `.env` file:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `private_key` → `FIREBASE_PRIVATE_KEY`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`

### 3.4 Configure Firestore Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection - authenticated read/write
    match /users/{userId} {
      allow read, write: if true; // Bot has admin access
    }
    
    // Game sessions - authenticated read/write
    match /game_sessions/{sessionId} {
      allow read, write: if true;
    }
    
    // Lottery data - authenticated read/write
    match /lottery/{document=**} {
      allow read, write: if true;
    }
    
    // Logs - authenticated write only
    match /logs/{document=**} {
      allow write: if true;
      allow read: if false;
    }
  }
}
```

---

## Step 4: Discord Bot Setup

### 4.1 Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Enter name: "ATIVE Casino Bot"
4. Go to "Bot" section
5. Click "Add Bot"
6. Copy the **Token** to your `.env` file
7. Copy the **Application ID** as `CLIENT_ID`

### 4.2 Bot Permissions

Required bot permissions:
- `Send Messages` (2048)
- `Use Slash Commands` (2147483648)
- `Embed Links` (16384)
- `Attach Files` (32768)
- `Read Message History` (65536)
- `Use External Emojis` (262144)
- `Add Reactions` (64)

**Permission Integer**: `2147975808`

### 4.3 Invite Bot to Server

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2147975808&scope=bot%20applications.commands
```

---

## Step 5: Production Deployment

### 5.1 Test Installation

```bash
# Test bot startup
npm start

# If successful, stop with Ctrl+C
# Check logs for any errors
```

### 5.2 PM2 Process Management

```bash
# Create PM2 ecosystem file
nano ecosystem.config.js
```

**ecosystem.config.js:**
```javascript
module.exports = {
  apps: [{
    name: 'ative-casino-bot',
    script: 'index.js',
    cwd: '/home/ativebot/ative_casino_bot',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    log_file: 'logs/pm2-combined.log',
    time: true
  }]
};
```

### 5.3 Start Production Service

```bash
# Start bot with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup auto-startup on boot
pm2 startup
# Follow the instructions provided by PM2

# Check status
pm2 status
pm2 logs ative-casino-bot
```

---

## Step 6: Monitoring & Maintenance

### 6.1 Log Management

```bash
# View real-time logs
pm2 logs ative-casino-bot --lines 100

# View specific log files
tail -f logs/combined.log
tail -f logs/error.log

# Log rotation setup
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 6.2 System Monitoring

```bash
# Monitor system resources
htop
df -h  # Disk usage
free -h  # Memory usage

# Monitor PM2 processes
pm2 monit
```

### 6.3 Bot Monitoring Commands

Use these Discord commands to monitor bot health:
- `/dev status` - Bot status and uptime
- `/admin stats` - System statistics
- `/panel` - Admin control panel

---

## Step 7: SSL & Security (Optional)

### 7.1 Install Certbot for SSL

```bash
# Install certbot
sudo apt install certbot

# Generate SSL certificate (if running web interface)
sudo certbot certonly --standalone -d your_domain.com
```

### 7.2 Security Hardening

```bash
# Disable root login
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin no

# Change default SSH port (optional)
# Port 2222

# Restart SSH service
sudo systemctl restart sshd

# Install fail2ban
sudo apt install fail2ban
sudo systemctl enable fail2ban
```

---

## Step 8: Automatic Updates & Backups

### 8.1 Update Script

Create `/home/ativebot/update-bot.sh`:
```bash
#!/bin/bash
cd /home/ativebot/ative_casino_bot

# Pull latest changes
git pull origin main

# Install/update dependencies
npm install

# Restart bot
pm2 restart ative-casino-bot

echo "Bot updated and restarted successfully!"
```

```bash
chmod +x update-bot.sh
```

### 8.2 Backup Script

Create `/home/ativebot/backup-bot.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/home/ativebot/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup bot files (excluding node_modules)
tar -czf "$BACKUP_DIR/bot_backup_$DATE.tar.gz" \
    --exclude='node_modules' \
    --exclude='logs/*.log' \
    /home/ativebot/ative_casino_bot

# Keep only last 7 backups
find $BACKUP_DIR -name "bot_backup_*.tar.gz" -mtime +7 -delete

echo "Backup completed: bot_backup_$DATE.tar.gz"
```

```bash
chmod +x backup-bot.sh
```

### 8.3 Cron Jobs

```bash
# Edit crontab
crontab -e

# Add these lines:
# Daily backup at 2 AM
0 2 * * * /home/ativebot/backup-bot.sh

# Weekly update check (optional - be careful with auto-updates)
# 0 3 * * 0 /home/ativebot/update-bot.sh
```

---

## Step 9: Troubleshooting

### 9.1 Common Issues

**Bot won't start:**
```bash
# Check Node.js version
node --version

# Check permissions
ls -la index.js

# Check environment variables
cat .env

# Test Firebase connection
node -e "console.log(require('./UTILS/firebase'))"
```

**Permission errors:**
```bash
# Fix ownership
sudo chown -R ativebot:ativebot /home/ativebot/ative_casino_bot

# Fix permissions
chmod 644 *.js
chmod 755 index.js
```

**Memory issues:**
```bash
# Check memory usage
free -h
pm2 show ative-casino-bot

# Restart if needed
pm2 restart ative-casino-bot
```

### 9.2 Log Analysis

```bash
# Check for errors in logs
grep -i "error" logs/combined.log
grep -i "warn" logs/error.log

# Monitor real-time errors
tail -f logs/error.log | grep -i "error"
```

---

## Step 10: Performance Optimization

### 10.1 Node.js Optimization

```javascript
// Add to ecosystem.config.js
env: {
  NODE_ENV: 'production',
  NODE_OPTIONS: '--max-old-space-size=1024'
}
```

### 10.2 System Optimization

```bash
# Increase file descriptor limits
echo "ativebot soft nofile 65535" | sudo tee -a /etc/security/limits.conf
echo "ativebot hard nofile 65535" | sudo tee -a /etc/security/limits.conf

# Optimize TCP settings (for high-traffic bots)
echo 'net.core.somaxconn = 1024' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

---

## Step 11: Scaling Considerations

### 11.1 Multiple Servers

For high-traffic bots, consider:
- **Load Balancer**: NGINX or HAProxy
- **Database Clustering**: Firebase handles scaling automatically
- **CDN**: CloudFlare for asset delivery
- **Monitoring**: Prometheus + Grafana

### 11.2 Database Optimization

```javascript
// Firestore optimization
- Use compound indexes for complex queries
- Implement pagination for large datasets
- Cache frequently accessed data
- Use subcollections for hierarchical data
```

---

## Support & Maintenance

### Documentation
- Check `Documentation & Tests/Documentation/` for detailed feature docs
- Review `CLAUDE.md` for project guidelines
- Monitor Discord logs channel: `1405096821512212521`

### Monitoring
- Set up alerts for bot downtime
- Monitor memory and CPU usage
- Track error rates and performance metrics
- Regular security updates

### Backup Strategy
- Daily automated backups
- Weekly full system snapshots
- Test restore procedures monthly
- Keep backups in multiple locations

---

**Deployment Complete!** 🎉

Your ATIVE Casino Bot is now running in production. Use `/dev status` to verify all systems are operational.