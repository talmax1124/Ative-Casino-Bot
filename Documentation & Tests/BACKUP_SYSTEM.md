# 🛡️ ATIVE Casino Bot - Backup System

## Overview

The ATIVE Casino Bot Backup System provides automated, secure, and reliable database backups to protect against data loss during server upgrades, crashes, or corruption.

## ✨ Features

- **Automated Scheduling**: Daily and custom backup schedules
- **Cloud Storage**: Support for Dropbox, AWS S3, Google Cloud, Azure, and webhooks
- **Encryption**: AES-256 encryption for sensitive data
- **Compression**: Gzip compression to reduce storage usage
- **Integrity Verification**: Checksum validation for backup files
- **Emergency Recovery**: Automatic pre-restoration backups
- **Discord Integration**: Full management via Discord commands
- **Health Monitoring**: Automatic system health checks

## 🚀 Quick Setup

### 1. Basic Setup (Local Backups Only)

The backup system works out of the box with your existing database configuration:

```bash
# Your existing database environment variables are used automatically
MARIADB_HOST=your_host
MARIADB_USER=your_user
MARIADB_PASSWORD=your_password
MARIADB_DATABASE=your_database
```

### 2. Enable Cloud Backups (Recommended)

#### Option A: Dropbox (Easiest)
```bash
# Get access token from: https://www.dropbox.com/developers/apps
DROPBOX_ACCESS_TOKEN=your_dropbox_token
```

#### Option B: AWS S3
```bash
AWS_ACCESS_KEY_ID=your_key_id
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET=your_bucket_name
AWS_REGION=us-east-1
```

#### Option C: Generic Webhook
```bash
# Upload to any HTTP endpoint
BACKUP_WEBHOOK_URL=https://your-server.com/backup-upload
BACKUP_WEBHOOK_HEADERS='{"Authorization":"Bearer your-token"}'
```

### 3. Optional Security
```bash
# Set encryption key for backup files (generate with: openssl rand -hex 32)
BACKUP_ENCRYPTION_KEY=your_64_character_hex_key

# Webhook URL for backup notifications
BACKUP_WEBHOOK_URL=your_discord_webhook_url
```

## 🎮 Discord Commands

### `/backup create [type]`
Create a manual backup
- `type`: `full` (default) or `incremental`

### `/backup list [limit]`
List available backups
- `limit`: Number of backups to show (default: 10)

### `/backup status`
Show backup system status and statistics

### `/backup restore <backup_id> <confirm>`
⚠️ **DANGEROUS**: Restore database from backup
- `backup_id`: ID of backup to restore from
- `confirm`: Must be `true` to proceed

### `/backup schedule <action>`
Manage automated backup schedules
- `action`: `status`, `start`, or `stop`

### `/backup cloud <action>`
Manage cloud backup settings
- `action`: `status` or `test`

## 📅 Automated Schedules

The system includes these default schedules:

- **Daily Full Backup**: Every day at 3 AM UTC
- **Health Checks**: Every hour
- **Emergency Backups**: Triggered when no recent backups exist

## 🔧 Integration

### Add to Your Bot

In your main bot file (`index.js`), add:

```javascript
// Add backup system initialization
const backupInit = require('./UTILS/backupInit');

// In your bot initialization function
async function initializeBot() {
    // ... your existing initialization code ...
    
    // Initialize backup system
    await backupInit.initialize();
    
    // ... rest of your code ...
}

// In your shutdown handler
process.on('SIGINT', async () => {
    // ... your existing shutdown code ...
    
    // Shutdown backup system
    backupInit.shutdown();
    
    process.exit(0);
});
```

### Test Your Setup

Run the test script to verify everything is working:

```bash
node test-backup-system.js
```

## 🔐 Security Features

### Encryption
- All backups are encrypted with AES-256 by default
- Encryption keys are stored in environment variables
- Encrypted files cannot be read without the key

### Access Control
- Backup commands are restricted to the bot developer
- All backup operations are logged
- Restoration requires explicit confirmation

### Data Integrity
- SHA-256 checksums verify file integrity
- Backup validation before restoration
- Automatic pre-restoration backups for safety

## 📊 Monitoring & Alerts

### Health Checks
- Database connectivity tests every hour
- Backup age monitoring (alerts if > 24 hours old)
- Disk space usage warnings
- Automatic emergency backups when needed

### Notifications
- Discord webhook notifications for backup events
- Success/failure alerts for scheduled backups
- Critical alerts for system issues

## 🛠️ Troubleshooting

### Common Issues

#### "Cannot find module 'node-cron'"
```bash
npm install node-cron
```

#### "mysqldump not found"
Install MySQL client tools:
```bash
# Ubuntu/Debian
sudo apt-get install mysql-client

# CentOS/RHEL
sudo yum install mysql

# macOS
brew install mysql-client
```

#### "Backup directory not accessible"
Ensure the bot has write permissions to the backup directory.

### Testing Individual Components

#### Test Database Connection
```bash
node -e "
const dbManager = require('./UTILS/database');
dbManager.initialize().then(() => console.log('✅ Database OK')).catch(console.error);
"
```

#### Test Cloud Upload
Use the `/backup cloud test` command in Discord.

#### Manual Backup
Use the `/backup create` command in Discord.

## 📋 File Structure

```
UTILS/
├── backupManager.js      # Core backup functionality
├── backupScheduler.js    # Automated scheduling
├── backupRestore.js      # Restoration utilities
├── cloudStorage.js       # Cloud provider integrations
└── backupInit.js         # Easy initialization

COMMANDS/
└── backup.js             # Discord slash command

backups/                  # Local backup storage
├── backup_full_*.sql.gz.enc  # Backup files
└── backup_full_*.meta        # Backup metadata

test-backup-system.js     # System validation script
```

## 🔄 Backup Lifecycle

1. **Creation**: Automated or manual backup creation
2. **Compression**: Gzip compression to reduce size
3. **Encryption**: AES-256 encryption for security
4. **Storage**: Local storage with cloud upload
5. **Verification**: Checksum validation
6. **Retention**: Automatic cleanup of old backups
7. **Monitoring**: Health checks and alerting

## 🚨 Emergency Recovery

### If Database is Corrupted

1. Use `/backup list` to find a good backup
2. Use `/backup restore <backup_id> true` to restore
3. The system automatically creates a pre-restoration backup
4. Restart the bot after restoration

### If Backup System Fails

1. Check logs for errors
2. Run `node test-backup-system.js` to diagnose
3. Verify environment variables are set
4. Check disk space and permissions
5. Test database connectivity

## 📈 Best Practices

### For Server Admins
- Set up cloud backups for off-site storage
- Test restoration process in a development environment
- Monitor backup notifications regularly
- Keep encryption keys secure and backed up
- Schedule backups during low-activity periods

### For Developers
- Always test the backup system after database schema changes
- Use incremental backups for frequent changes
- Validate backup integrity before major deployments
- Keep backup retention policies appropriate for your data volume

## 🔗 Cloud Provider Setup

### Dropbox Setup
1. Go to https://www.dropbox.com/developers/apps
2. Create a new app with "Full Dropbox" access
3. Generate an access token
4. Set `DROPBOX_ACCESS_TOKEN` environment variable

### AWS S3 Setup
1. Create an S3 bucket in AWS console
2. Create an IAM user with S3 write permissions
3. Set environment variables for credentials

### Webhook Setup
1. Set up an HTTP endpoint that accepts file uploads
2. Configure authentication if needed
3. Set `BACKUP_WEBHOOK_URL` environment variable

## 📞 Support

If you encounter issues:
1. Run the test script: `node test-backup-system.js`
2. Check the bot logs for error messages
3. Verify all environment variables are correctly set
4. Test with a manual backup first: `/backup create`

The backup system is designed to be reliable and fail-safe. If you have questions or need assistance, the diagnostic tools should help identify any issues quickly.

## 🎯 Summary

This backup system provides enterprise-grade protection for your casino bot's data:

✅ **Automated daily backups**  
✅ **Cloud storage integration**  
✅ **Encryption and compression**  
✅ **Discord command interface**  
✅ **Emergency recovery tools**  
✅ **Health monitoring**  
✅ **Easy setup and testing**  

Your data is now protected against server upgrades, hardware failures, and accidental data loss!