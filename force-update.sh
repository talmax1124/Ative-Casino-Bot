#!/bin/bash

# Force Update Script for Pterodactyl Deployment
# This script handles git conflicts and forces updates

echo "🔄 Force updating repository..."

# Stash any local changes (especially .env)
echo "📦 Stashing local changes..."
git stash push -u -m "Server local changes - $(date)"

# Force reset to remote state
echo "🔄 Resetting to remote state..."
git reset --hard HEAD

# Pull latest changes
echo "⬇️ Pulling latest changes..."
git pull origin main

# Check if pull was successful
if [ $? -eq 0 ]; then
    echo "✅ Successfully updated to latest version!"
else
    echo "❌ Failed to pull latest changes"
    exit 1
fi

echo "✅ Force update completed successfully!"