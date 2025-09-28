#!/bin/bash

# UAS Bot Deployment Archive Creator
# Creates a deployment-ready archive for Pterodactyl VPS

echo "🚀 Creating UAS Bot deployment archive..."

# Create temporary directory
TEMP_DIR="./uas_deploy_temp"
mkdir -p "$TEMP_DIR"

# Copy UAS bot files (excluding node_modules and logs)
echo "📁 Copying UAS bot files..."
rsync -av --progress ./uas/ "$TEMP_DIR/" \
    --exclude node_modules \
    --exclude logs \
    --exclude .env \
    --exclude "*.log" \
    --exclude ".DS_Store"

# Copy .env.example as template
cp ./uas/.env.example "$TEMP_DIR/.env.example"

# Copy the Pterodactyl egg file
cp ./uas/egg-nodejs-uas-bot.json "$TEMP_DIR/egg-nodejs-uas-bot.json"

# Create deployment archive
echo "📦 Creating deployment archive..."
tar -czf uas-bot-deploy.tar.gz -C "$TEMP_DIR" .

# Clean up temp directory
rm -rf "$TEMP_DIR"

echo "✅ Deployment archive created: uas-bot-deploy.tar.gz"
echo ""
echo "📋 Next steps for Pterodactyl deployment:"
echo "1. Import egg-nodejs-uas-bot.json in Pterodactyl Admin Panel"
echo "2. Create new server using 'ATIVE UAS Bot - Node.js' egg"
echo "3. Configure server variables (Discord token, database, etc.)"
echo "4. Upload uas-bot-deploy.tar.gz to your server"
echo "5. Extract: tar -xzf uas-bot-deploy.tar.gz"
echo "6. Start server - the egg handles everything automatically!"
echo ""
echo "📖 Full deployment guide: Documentation & Tests/Documentation/UAS_VPS_Deployment_Guide.md"