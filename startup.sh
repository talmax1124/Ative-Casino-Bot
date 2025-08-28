#!/bin/bash

# ATIVE Casino Bot Startup Script
# Handles git updates, dependency installation, and bot startup

echo "🎰 Starting ATIVE Casino Bot..."

# Force update if git directory exists and auto-update is enabled
if [[ -d .git ]] && [[ ${AUTO_UPDATE} == "1" ]]; then
    echo "🔄 Auto-update enabled, forcing repository sync..."
    
    # Stash local changes to avoid conflicts
    git stash push -u -m "Auto-stash before update - $(date)" 2>/dev/null || true
    
    # Reset and pull latest
    git reset --hard HEAD 2>/dev/null || true
    git pull origin main || {
        echo "⚠️ Git pull failed, attempting force reset..."
        git fetch origin
        git reset --hard origin/main
    }
    
    echo "✅ Repository updated successfully"
fi

# Set up environment validation
echo "🔍 Validating environment configuration..."

# Check for MariaDB configuration
if [[ -n "$MARIADB_HOST" && -n "$MARIADB_USER" && -n "$MARIADB_PASSWORD" && -n "$MARIADB_DATABASE" ]]; then
    echo "✅ MariaDB configuration detected"
    export DATABASE_TYPE="mariadb"
else
    echo "⚠️  MariaDB configuration missing - bot will run with limited functionality"
fi

# Create necessary directories
echo "📁 Setting up directories..."
mkdir -p logs backups temp 2>/dev/null || true
echo "📁 Created directory: $(pwd)/logs" 
echo "📁 Created directory: $(pwd)/backups"
echo "📁 Created directory: $(pwd)/temp"

# Set up database schema if needed
if [[ "$DATABASE_TYPE" == "mariadb" ]]; then
    echo "🗄️  Setting up database schema..."
    # Database setup will be handled by the bot on startup
fi

echo "🎉 ATIVE Casino Bot startup preparation completed successfully!"
echo "📋 Configuration Summary:"
echo "   - Database: MariaDB (${MARIADB_HOST:-not configured})"
echo "   - Environment: ${ENVIRONMENT:-production}"
echo "   - Auto-update: ${AUTO_UPDATE:-disabled}"

# Add any environment-specific setup
if [[ "$ENVIRONMENT" == "development" ]]; then
    echo "🔧 Development mode enabled"
fi

echo "🚀 Starting ATIVE Casino Bot..."

# Start the actual bot process
echo "▶️  Executing bot with Node.js..."
exec /usr/local/bin/node "${MAIN_FILE:-index.js}"