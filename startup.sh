#!/bin/bash

# ATIVE Casino Bot - Pterodactyl Startup Script
# This script initializes the bot environment and starts the application

echo "🎰 Starting ATIVE Casino Bot..."

# Set permissions
chmod +x /home/container/startup.sh
chmod +x /home/container/scripts/*.sh

# Create necessary directories
mkdir -p /home/container/logs
mkdir -p /home/container/backups
mkdir -p /home/container/temp

# Set proper permissions for directories
chmod 755 /home/container/logs
chmod 755 /home/container/backups
chmod 755 /home/container/temp

# Check if .env exists, if not copy from template
if [ ! -f "/home/container/.env" ]; then
    echo "⚠️  .env file not found. Creating from .env.pterodactyl template..."
    cp /home/container/.env.pterodactyl /home/container/.env
    echo "✅ Please configure your .env file with actual values before restarting"
    exit 1
fi

# Validate essential environment variables
echo "🔍 Validating environment configuration..."

if [ -z "$DISCORD_TOKEN" ] || [ "$DISCORD_TOKEN" = "your_discord_bot_token_here" ]; then
    echo "❌ DISCORD_TOKEN is not configured properly"
    exit 1
fi

if [ -z "$CLIENT_ID" ] || [ "$CLIENT_ID" = "your_discord_client_id_here" ]; then
    echo "❌ CLIENT_ID is not configured properly"
    exit 1
fi

# Check database configuration
DB_CONFIGURED=false

if [ -n "$MARIADB_HOST" ] && [ "$MARIADB_HOST" != "localhost" ] || [ -n "$MARIADB_PASSWORD" ] && [ "$MARIADB_PASSWORD" != "your_db_password" ]; then
    echo "✅ MariaDB configuration detected"
    DB_CONFIGURED=true
elif [ -n "$POSTGRES_HOST" ] && [ "$POSTGRES_HOST" != "localhost" ] || [ -n "$POSTGRES_PASSWORD" ] && [ "$POSTGRES_PASSWORD" != "your_pg_password" ]; then
    echo "✅ PostgreSQL configuration detected"
    DB_CONFIGURED=true
elif [ -n "$FIREBASE_PROJECT_ID" ] && [ "$FIREBASE_PROJECT_ID" != "your_firebase_project_id" ]; then
    echo "✅ Firebase configuration detected"
    DB_CONFIGURED=true
fi

if [ "$DB_CONFIGURED" = false ]; then
    echo "❌ No database configuration detected. Please configure MariaDB, PostgreSQL, or Firebase in your .env file"
    exit 1
fi

# Install dependencies if node_modules doesn't exist or package.json changed
if [ ! -d "/home/container/node_modules" ] || [ "/home/container/package.json" -nt "/home/container/node_modules" ]; then
    echo "📦 Installing/updating dependencies..."
    npm install --production
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
fi

# Run database setup if needed
if [ -f "/home/container/scripts/database-setup.js" ]; then
    echo "🗄️  Setting up database schema..."
    node /home/container/scripts/database-setup.js
    
    if [ $? -ne 0 ]; then
        echo "⚠️  Database setup had issues, but continuing..."
    fi
fi

# Health check setup
if [ "$ENABLE_HEALTH_CHECKS" = "true" ]; then
    echo "🏥 Starting health check monitor..."
    nohup node /home/container/scripts/health-check.js > /home/container/logs/health-check.log 2>&1 &
fi

# Setup log rotation
if [ -f "/home/container/scripts/logrotate.sh" ]; then
    echo "📋 Setting up log rotation..."
    chmod +x /home/container/scripts/logrotate.sh
    # Run log rotation daily
    (crontab -l 2>/dev/null; echo "0 0 * * * /home/container/scripts/logrotate.sh") | crontab -
fi

# Setup backup cron job
if [ -f "/home/container/scripts/backup.sh" ]; then
    echo "💾 Setting up automatic backups..."
    chmod +x /home/container/scripts/backup.sh
    # Run backup every 6 hours
    (crontab -l 2>/dev/null; echo "0 */6 * * * /home/container/scripts/backup.sh") | crontab -
fi

# Start cron service for scheduled tasks
if command -v cron >/dev/null 2>&1; then
    echo "⏰ Starting cron service..."
    service cron start
fi

echo "🚀 Starting ATIVE Casino Bot..."
echo "📊 Environment: $ENVIRONMENT"
echo "🆔 Client ID: $CLIENT_ID"
echo "📁 Working Directory: $(pwd)"
echo "🕒 Started at: $(date)"

# Start the bot with proper error handling
exec node index.js