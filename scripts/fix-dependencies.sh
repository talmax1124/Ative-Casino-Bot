#!/bin/bash
echo "🔧 ATIVE Casino Bot - Dependency Fix Script"
echo "=========================================="

# Stop any running processes
echo "🛑 Stopping existing processes..."
pkill -f "node.*index.js" || true
pkill -f "node.*main" || true

# Remove corrupted dependencies
echo "🗑️ Removing corrupted node_modules and package-lock.json..."
rm -rf node_modules
rm -f package-lock.json

# Clear npm cache
echo "🧹 Clearing npm cache..."
npm cache clean --force

# Reinstall dependencies from scratch
echo "📦 Reinstalling dependencies from scratch..."
npm install --no-optional --production

# Rebuild native modules for container compatibility
echo "🔨 Rebuilding native modules..."
npm rebuild canvas || echo "Canvas rebuild warning (continuing anyway)"

# Verify critical dependencies
echo "✅ Verifying discord-api-types installation..."
if [ -f "node_modules/discord-api-types/payloads/v10/message.js" ]; then
    echo "✅ discord-api-types message.js found"
else
    echo "❌ discord-api-types message.js still missing, trying alternative fix..."
    npm uninstall discord-api-types
    npm install discord-api-types@latest
fi

# Test Node.js syntax
echo "🧪 Testing main file syntax..."
node -c index.js && echo "✅ Syntax check passed" || echo "❌ Syntax errors found"

echo "🎉 Dependency fix complete!"
echo "You can now start the bot with: node index.js"