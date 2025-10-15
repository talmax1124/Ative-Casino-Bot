#!/bin/bash

# ATIVE Casino Bot Startup Script
# Handles git updates, dependency installation, and bot startup

echo "🎰 Starting ATIVE Casino Bot..."

# Quick update check (skip if SKIP_CANVAS_REBUILD=1 for ultra-fast startup)
if [[ -d .git ]] && [[ "${SKIP_CANVAS_REBUILD:-0}" != "1" ]]; then
    echo "🔄 Quick update check..."
    
    CURRENT=$(git rev-parse HEAD 2>/dev/null)
    git fetch origin -q 2>/dev/null || true
    LATEST=$(git rev-parse origin/main 2>/dev/null)
    
    if [[ "$CURRENT" != "$LATEST" ]]; then
        echo "📦 Updates available, pulling..."
        git stash push -u -m "Auto-stash" -q 2>/dev/null || true
        git reset --hard origin/main -q
        echo "✅ Updated to: $(git rev-parse --short HEAD)"
    else
        echo "✅ Already up to date"
    fi
elif [[ "${SKIP_CANVAS_REBUILD:-0}" == "1" ]]; then
    echo "⚡ Skipping git update for faster startup"
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

# Quick Discord.js check (skip full corruption scan for speed)
if [[ "${SKIP_CANVAS_REBUILD:-0}" == "1" ]]; then
    echo "⚡ Fast startup mode - skipping module checks"
else
    echo "🧹 Quick module health check..."
    if [ ! -f "node_modules/discord.js/package.json" ]; then
        echo "❌ Discord.js missing - reinstalling..."
        npm install discord.js --no-audit --silent
    fi
    
    # Only rebuild Canvas if it's actually missing or broken
    if [ ! -f "node_modules/canvas/lib/bindings.js" ] && command -v node-pre-gyp >/dev/null 2>&1; then
        echo "🎨 Canvas missing - installing..."
        npm install canvas detect-libc --no-audit --silent || echo "⚠️ Canvas install failed"
    else
        echo "🎨 Canvas already available"
    fi
fi

# Start the actual bot process
echo "▶️  Executing bot with Node.js..."
exec /usr/local/bin/node "${MAIN_FILE:-index.js}"