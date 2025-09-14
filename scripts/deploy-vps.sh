#!/bin/bash

# ATIVE Casino Bot VPS Deployment Script
# One-command deployment with Redis setup

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_step() {
    echo -e "${BLUE}🚀 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Configuration
DEPLOYMENT_DIR="/opt/casino-bot"
SERVICE_USER="casino"

print_step "Starting ATIVE Casino Bot VPS deployment..."

# 1. System Updates
print_step "Updating system packages..."
sudo apt update && sudo apt upgrade -y
print_success "System updated"

# 2. Install Node.js (if not present)
if ! command -v node > /dev/null 2>&1; then
    print_step "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    print_success "Node.js installed: $(node --version)"
else
    print_success "Node.js already installed: $(node --version)"
fi

# 3. Install PM2 (if not present)
if ! command -v pm2 > /dev/null 2>&1; then
    print_step "Installing PM2 process manager..."
    sudo npm install -g pm2
    print_success "PM2 installed"
else
    print_success "PM2 already installed"
fi

# 4. Create service user
if ! id "$SERVICE_USER" &>/dev/null; then
    print_step "Creating service user: $SERVICE_USER"
    sudo useradd -r -s /bin/bash -m -d /home/$SERVICE_USER $SERVICE_USER
    print_success "Service user created"
else
    print_success "Service user already exists"
fi

# 5. Create deployment directory
print_step "Setting up deployment directory..."
sudo mkdir -p "$DEPLOYMENT_DIR"
sudo chown "$SERVICE_USER:$SERVICE_USER" "$DEPLOYMENT_DIR"
print_success "Deployment directory ready: $DEPLOYMENT_DIR"

# 6. Install Redis
print_step "Installing and configuring Redis..."
sudo apt install -y redis-server

# Configure Redis for production
sudo cp /etc/redis/redis.conf /etc/redis/redis.conf.backup
sudo tee /etc/redis/redis.conf > /dev/null <<'EOF'
bind 127.0.0.1
port 6379
timeout 300
tcp-keepalive 60
maxmemory 512mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec
loglevel notice
logfile /var/log/redis/redis-server.log
EOF

# Start and enable Redis
sudo systemctl enable redis-server
sudo systemctl restart redis-server

# Test Redis
sleep 2
if redis-cli ping > /dev/null 2>&1; then
    print_success "Redis installed and running"
else
    print_error "Redis installation failed"
    exit 1
fi

# 7. Copy bot files
print_step "Deploying bot files..."
sudo cp -r . "$DEPLOYMENT_DIR/"
sudo chown -R "$SERVICE_USER:$SERVICE_USER" "$DEPLOYMENT_DIR"

# 8. Install dependencies
print_step "Installing bot dependencies..."
cd "$DEPLOYMENT_DIR"
sudo -u "$SERVICE_USER" npm install --production
print_success "Dependencies installed"

# 9. Create .env file template
if [ ! -f "$DEPLOYMENT_DIR/.env" ]; then
    print_step "Creating .env template..."
    sudo -u "$SERVICE_USER" tee "$DEPLOYMENT_DIR/.env" > /dev/null <<'EOF'
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here

# Database Configuration (MariaDB/MySQL)
MYSQL_HOST=localhost
MYSQL_USER=casino_bot
MYSQL_PASSWORD=your_database_password_here
MYSQL_DATABASE=casino_bot

# Redis Cache Configuration
REDIS_URL=redis://localhost:6379

# OpenAI API (Optional)
OPENAI_API_KEY=your_openai_api_key_here

# Environment
NODE_ENV=production
ENVIRONMENT=production
EOF
    print_warning ".env file created - PLEASE CONFIGURE IT WITH YOUR TOKENS!"
else
    print_success ".env file already exists"
fi

# 10. Set up systemd service
print_step "Creating systemd service..."
sudo tee /etc/systemd/system/casino-bot.service > /dev/null <<EOF
[Unit]
Description=ATIVE Casino Bot
After=network.target redis-server.service
Requires=redis-server.service

[Service]
Type=forking
User=$SERVICE_USER
WorkingDirectory=$DEPLOYMENT_DIR
ExecStart=/usr/bin/pm2 start $DEPLOYMENT_DIR/index.js --name "casino-bot" --env production
ExecReload=/usr/bin/pm2 restart casino-bot
ExecStop=/usr/bin/pm2 stop casino-bot
PIDFile=/home/$SERVICE_USER/.pm2/pm2.pid
Restart=always
RestartSec=10

Environment=NODE_ENV=production
Environment=PATH=/usr/bin:/usr/local/bin
Environment=PM2_HOME=/home/$SERVICE_USER/.pm2

# Security settings
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$DEPLOYMENT_DIR
ReadWritePaths=/home/$SERVICE_USER
ReadWritePaths=/tmp

[Install]
WantedBy=multi-user.target
EOF

# 11. Set up log rotation
print_step "Configuring log rotation..."
sudo tee /etc/logrotate.d/casino-bot > /dev/null <<'EOF'
/opt/casino-bot/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 casino casino
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

# 12. Create startup script
print_step "Creating management scripts..."
sudo tee /usr/local/bin/casino-bot > /dev/null <<EOF
#!/bin/bash
# Casino Bot Management Script

case "\$1" in
    start)
        sudo systemctl start casino-bot
        echo "Casino Bot started"
        ;;
    stop)
        sudo systemctl stop casino-bot  
        echo "Casino Bot stopped"
        ;;
    restart)
        sudo systemctl restart casino-bot
        echo "Casino Bot restarted"
        ;;
    status)
        sudo systemctl status casino-bot
        echo ""
        echo "Redis Status:"
        redis-cli ping && echo "Redis: OK" || echo "Redis: FAILED"
        echo ""
        echo "Bot Logs (last 10 lines):"
        sudo -u $SERVICE_USER pm2 logs casino-bot --lines 10
        ;;
    logs)
        sudo -u $SERVICE_USER pm2 logs casino-bot
        ;;
    monitor)
        sudo -u $SERVICE_USER pm2 monit
        ;;
    *)
        echo "Usage: casino-bot {start|stop|restart|status|logs|monitor}"
        exit 1
esac
EOF

sudo chmod +x /usr/local/bin/casino-bot
print_success "Management script created: casino-bot {start|stop|restart|status|logs|monitor}"

# 13. Enable and start services
print_step "Enabling services..."
sudo systemctl daemon-reload
sudo systemctl enable casino-bot
print_success "Services configured"

# 14. Final status
echo ""
print_success "ATIVE Casino Bot deployment complete!"
echo ""
echo "🎯 NEXT STEPS:"
echo "================================"
echo "1. Edit configuration: sudo nano $DEPLOYMENT_DIR/.env"
echo "2. Start the bot: casino-bot start"
echo "3. Check status: casino-bot status"
echo "4. View logs: casino-bot logs"
echo "5. Monitor: casino-bot monitor"
echo ""
echo "🔧 USEFUL COMMANDS:"
echo "================================"
echo "Start:    casino-bot start"
echo "Stop:     casino-bot stop"
echo "Restart:  casino-bot restart"
echo "Status:   casino-bot status"
echo "Logs:     casino-bot logs"
echo "Monitor:  casino-bot monitor"
echo ""
echo "📊 REDIS COMMANDS:"
echo "================================"
echo "Test:     redis-cli ping"
echo "Monitor:  redis-cli monitor"
echo "Info:     redis-cli info"
echo ""
print_warning "Don't forget to configure your .env file with proper tokens!"
echo ""