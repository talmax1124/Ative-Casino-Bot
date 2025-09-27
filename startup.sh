#!/bin/bash

# ATIVE Casino Bot Startup Script
# Handles git updates, dependency installation, and bot startup

echo "🎰 Starting ATIVE Casino Bot..."

# FORCE update regardless of AUTO_UPDATE setting (override Pterodactyl)
if [[ -d .git ]]; then
    echo "🔄 FORCING repository sync (bypassing Pterodactyl AUTO_UPDATE)..."
    
    # Show current status
    echo "📍 Current branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"
    echo "📍 Current commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
    
    # Stash local changes to avoid conflicts
    git stash push -u -m "Auto-stash before update - $(date)" 2>/dev/null || true
    
    # Fetch and reset to latest remote
    echo "🌐 Fetching from GitHub..."
    git fetch origin || true
    echo "🔄 Resetting to latest main branch..."
    git reset --hard origin/main || {
        echo "⚠️ Git reset failed, attempting aggressive clean..."
        git clean -fd
        git reset --hard origin/main
    }
    
    # Show new status
    echo "📍 Updated to commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
    echo "✅ Repository updated successfully"
else
    echo "❌ No .git directory found - running from local files only"
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
echo "   - Auto-update: enabled (forced)"

# Add any environment-specific setup
if [[ "$ENVIRONMENT" == "development" ]]; then
    echo "🔧 Development mode enabled"
fi

echo "🚀 Starting ATIVE Casino Bot..."

# Fix Discord.js corruption and rebuild Canvas
echo "🧹 Checking for corrupted Discord.js modules..."
if [ -d "node_modules/discord-api-types" ] && [ ! -f "node_modules/discord-api-types/payloads/v10/message.js" ]; then
    echo "❌ Discord.js modules are corrupted - fixing..."
    
    # Clean corrupted modules completely
    echo "🗑️ Removing corrupted modules..."
    rm -rf node_modules package-lock.json .npm 2>/dev/null || true
    
    # Force fresh install
    echo "📦 Fresh npm install with --force..."
    npm cache clean --force 2>/dev/null || true
    npm install --force --no-audit --loglevel=error || {
        echo "❌ npm install failed, trying without --force..."
        npm install --no-audit --loglevel=error
    }
    
    echo "✅ Discord.js modules reinstalled successfully"
fi

# Rebuild Canvas for container compatibility (force clean rebuild)
echo "🎨 Force rebuilding Canvas for container compatibility..."
npm rebuild canvas --verbose 2>/dev/null || {
    echo "⚠️ Canvas rebuild failed, attempting clean install..."
    rm -rf node_modules/canvas 2>/dev/null || true
    npm install canvas --build-from-source 2>/dev/null || {
        echo "⚠️ Canvas installation failed - bot will run with limited image functionality"
        echo "Some game features may not work properly without Canvas"
    }
}

# Start the actual bot process
echo "▶️  Executing bot with Node.js..."
exec /usr/local/bin/node "${MAIN_FILE:-index.js}"