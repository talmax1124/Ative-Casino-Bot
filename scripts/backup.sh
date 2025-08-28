#!/bin/bash

# ATIVE Casino Bot - Database Backup Script
# Creates backups of bot data for disaster recovery

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
BOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${BOT_DIR}/backups"
LOG_FILE="${BOT_DIR}/logs/backup.log"
DATE_FORMAT=$(date +"%Y%m%d_%H%M%S")

# Source environment variables
if [ -f "${BOT_DIR}/.env" ]; then
    source "${BOT_DIR}/.env"
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"
mkdir -p "${BOT_DIR}/logs"

# Logging function
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_message "🗄️  Starting database backup process..."

# Backup MariaDB if configured
if [ -n "$MARIADB_HOST" ] && [ -n "$MARIADB_USER" ] && [ -n "$MARIADB_PASSWORD" ] && [ -n "$MARIADB_DATABASE" ]; then
    log_message "📊 Backing up MariaDB database..."
    
    BACKUP_FILE="${BACKUP_DIR}/mariadb_backup_${DATE_FORMAT}.sql"
    
    if command -v mysqldump >/dev/null 2>&1; then
        mysqldump -h"$MARIADB_HOST" -P"${MARIADB_PORT:-3306}" -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE" > "$BACKUP_FILE" 2>/dev/null
        
        if [ $? -eq 0 ] && [ -s "$BACKUP_FILE" ]; then
            # Compress the backup
            gzip "$BACKUP_FILE"
            log_message "✅ MariaDB backup completed: ${BACKUP_FILE}.gz"
        else
            log_message "❌ MariaDB backup failed"
            rm -f "$BACKUP_FILE" 2>/dev/null
        fi
    else
        log_message "⚠️  mysqldump not available for MariaDB backup"
    fi
fi

# Backup PostgreSQL if configured
if [ -n "$POSTGRES_HOST" ] && [ -n "$POSTGRES_USER" ] && [ -n "$POSTGRES_PASSWORD" ] && [ -n "$POSTGRES_DATABASE" ]; then
    log_message "🐘 Backing up PostgreSQL database..."
    
    BACKUP_FILE="${BACKUP_DIR}/postgres_backup_${DATE_FORMAT}.sql"
    
    if command -v pg_dump >/dev/null 2>&1; then
        PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h "$POSTGRES_HOST" -p "${POSTGRES_PORT:-5432}" -U "$POSTGRES_USER" -d "$POSTGRES_DATABASE" > "$BACKUP_FILE" 2>/dev/null
        
        if [ $? -eq 0 ] && [ -s "$BACKUP_FILE" ]; then
            # Compress the backup
            gzip "$BACKUP_FILE"
            log_message "✅ PostgreSQL backup completed: ${BACKUP_FILE}.gz"
        else
            log_message "❌ PostgreSQL backup failed"
            rm -f "$BACKUP_FILE" 2>/dev/null
        fi
    else
        log_message "⚠️  pg_dump not available for PostgreSQL backup"
    fi
fi

# Backup Firebase data if configured (using Node.js script)
if [ -n "$FIREBASE_PROJECT_ID" ] && [ "$FIREBASE_PROJECT_ID" != "your_firebase_project_id" ]; then
    log_message "🔥 Backing up Firebase data..."
    
    BACKUP_FILE="${BACKUP_DIR}/firebase_backup_${DATE_FORMAT}.json"
    
    node -e "
        require('dotenv').config();
        const db = require('../UTILS/database');
        
        async function backupFirebase() {
            try {
                await db.initialize();
                const backup = await db.createBackup();
                require('fs').writeFileSync('$BACKUP_FILE', JSON.stringify(backup, null, 2));
                console.log('Firebase backup completed');
            } catch (error) {
                console.error('Firebase backup failed:', error.message);
                process.exit(1);
            }
        }
        
        backupFirebase();
    " 2>/dev/null
    
    if [ $? -eq 0 ] && [ -s "$BACKUP_FILE" ]; then
        # Compress the backup
        gzip "$BACKUP_FILE"
        log_message "✅ Firebase backup completed: ${BACKUP_FILE}.gz"
    else
        log_message "❌ Firebase backup failed"
        rm -f "$BACKUP_FILE" 2>/dev/null
    fi
fi

# Backup configuration files
CONFIG_BACKUP="${BACKUP_DIR}/config_backup_${DATE_FORMAT}.tar.gz"
log_message "⚙️  Backing up configuration files..."

tar -czf "$CONFIG_BACKUP" \
    -C "$BOT_DIR" \
    --exclude="node_modules" \
    --exclude="logs" \
    --exclude="backups" \
    --exclude="temp" \
    --exclude=".git" \
    .env \
    package.json \
    COMMANDS/ \
    GAMES/ \
    UTILS/ \
    assets/ \
    2>/dev/null

if [ $? -eq 0 ] && [ -s "$CONFIG_BACKUP" ]; then
    log_message "✅ Configuration backup completed: $CONFIG_BACKUP"
else
    log_message "❌ Configuration backup failed"
    rm -f "$CONFIG_BACKUP" 2>/dev/null
fi

# Clean up old backups (keep last 7 days by default)
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}
log_message "🧹 Cleaning up backups older than $RETENTION_DAYS days..."

find "$BACKUP_DIR" -name "*.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null

# Calculate backup directory size
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
BACKUP_COUNT=$(find "$BACKUP_DIR" -type f \( -name "*.gz" -o -name "*.tar.gz" \) | wc -l)

log_message "📊 Backup summary: $BACKUP_COUNT files, $BACKUP_SIZE total"
log_message "✅ Backup process completed"

# Send notification if Discord webhook is configured
if [ -n "$BACKUP_WEBHOOK_URL" ]; then
    curl -H "Content-Type: application/json" \
         -X POST \
         -d "{\"content\":\"🗄️ **Casino Bot Backup Completed**\n📊 Files: $BACKUP_COUNT\n💾 Size: $BACKUP_SIZE\n🕒 $(date)\"}" \
         "$BACKUP_WEBHOOK_URL" \
         >/dev/null 2>&1
fi