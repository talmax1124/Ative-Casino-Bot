#!/bin/bash
# Pterodactyl Deployment Script for ATIVE Casino Bot

echo "🚀 Starting Pterodactyl deployment..."

# Create deployment package
echo "📦 Creating deployment package..."
tar -czf ative-casino-bot-deploy.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=*.log \
  --exclude=backups \
  --exclude=deploy-pterodactyl.sh \
  .

echo "✅ Deployment package created: ative-casino-bot-deploy.tar.gz"
echo ""
echo "📋 Next steps:"
echo "1. Upload ative-casino-bot-deploy.tar.gz to your Pterodactyl server"
echo "2. Extract it in /home/container/"
echo "3. Run: npm install --production"
echo "4. Set startup command: node index.js"
echo "5. Start the server"
echo ""
echo "🌐 Panel URL: https://panel.creativeduo.net"
echo "🆔 Server ID: 878cc9fa-3b4d-4ea3-8b05-d2e2800dd7ed"
echo "🏥 Health Check: Port 3000"
echo ""
echo "🎯 Your bot is ready for Pterodactyl deployment!"