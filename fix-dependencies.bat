@echo off
echo 🔧 ATIVE Casino Bot - Dependency Fix Script
echo ==========================================

echo 🛑 Stopping existing processes...
taskkill /F /IM node.exe >nul 2>&1

echo 🗑️ Removing corrupted node_modules and package-lock.json...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del package-lock.json

echo 🧹 Clearing npm cache...
npm cache clean --force

echo 📦 Reinstalling dependencies from scratch...
npm install --no-optional --production

echo 🔨 Rebuilding native modules...
npm rebuild canvas

echo ✅ Verifying discord-api-types installation...
if exist "node_modules\discord-api-types\payloads\v10\message.js" (
    echo ✅ discord-api-types message.js found
) else (
    echo ❌ discord-api-types message.js still missing, trying alternative fix...
    npm uninstall discord-api-types
    npm install discord-api-types@latest
)

echo 🧪 Testing main file syntax...
node -c index.js && echo ✅ Syntax check passed || echo ❌ Syntax errors found

echo 🎉 Dependency fix complete!
echo You can now start the bot with: node index.js
pause