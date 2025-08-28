#!/bin/bash

# ATIVE Casino Bot - Cron Job Setup Script
# Sets up automated tasks for the bot

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
BOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "⏰ Setting up cron jobs for ATIVE Casino Bot..."

# Make scripts executable
chmod +x "${SCRIPT_DIR}/backup.sh"
chmod +x "${SCRIPT_DIR}/health-check.sh"
chmod +x "${SCRIPT_DIR}/logrotate.sh"

# Remove existing cron jobs for this bot (clean slate)
crontab -l 2>/dev/null | grep -v "ative-casino-bot" | crontab -

# Create new crontab
(
    echo "# ATIVE Casino Bot - Automated Tasks"
    echo ""
    
    # Health checks every 5 minutes
    echo "# Health check every 5 minutes"
    echo "*/5 * * * * ${SCRIPT_DIR}/health-check.sh # ative-casino-bot-health"
    echo ""
    
    # Database backup every 6 hours
    echo "# Database backup every 6 hours"
    echo "0 */6 * * * ${SCRIPT_DIR}/backup.sh # ative-casino-bot-backup"
    echo ""
    
    # Log rotation daily at midnight
    echo "# Log rotation daily at midnight"
    echo "0 0 * * * ${SCRIPT_DIR}/logrotate.sh # ative-casino-bot-logrotate"
    echo ""
    
    # Weekly system cleanup (Sundays at 2 AM)
    echo "# Weekly cleanup on Sundays at 2 AM"
    echo "0 2 * * 0 find ${BOT_DIR}/temp -type f -mtime +7 -delete # ative-casino-bot-cleanup"
    echo ""
    
) | crontab -

# Verify cron jobs were added
echo "✅ Cron jobs configured:"
crontab -l | grep "ative-casino-bot"

echo ""
echo "📋 Scheduled tasks:"
echo "  • Health checks: Every 5 minutes"
echo "  • Database backups: Every 6 hours"  
echo "  • Log rotation: Daily at midnight"
echo "  • Temp cleanup: Weekly on Sundays at 2 AM"
echo ""
echo "🔧 To view all cron jobs: crontab -l"
echo "🔧 To edit cron jobs: crontab -e"
echo "🗑️  To remove all bot cron jobs: crontab -l | grep -v 'ative-casino-bot' | crontab -"