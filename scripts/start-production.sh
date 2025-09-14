#!/bin/bash

# ATIVE Casino Bot - Production Start Script with Redis Support
# Handles Redis setup, health checks, and graceful startup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$BOT_DIR/logs"
PID_FILE="$BOT_DIR/casino-bot.pid"
REDIS_PID_FILE="/var/run/redis/redis-server.pid"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

print_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1${NC}"
}

# Function to check if Redis is running
check_redis() {
    if redis-cli ping > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to start Redis if not running
ensure_redis() {
    print_status "Checking Redis status..."
    
    if check_redis; then
        print_success "Redis is already running"
        REDIS_INFO=$(redis-cli info server | grep redis_version | cut -d: -f2 | tr -d '\r')
        print_status "Redis version: $REDIS_INFO"
        return 0
    fi
    
    print_warning "Redis not responding, attempting to start..."
    
    # Try to start Redis service
    if command -v systemctl > /dev/null 2>&1; then
        if systemctl is-active --quiet casino-redis; then
            print_success "Casino Redis service is active"
        elif systemctl is-active --quiet redis-server; then
            print_success "Redis server service is active"  
        elif systemctl is-active --quiet redis; then
            print_success "Redis service is active"
        else
            print_status "Starting Redis service..."
            if sudo systemctl start redis-server 2>/dev/null || sudo systemctl start redis 2>/dev/null || sudo systemctl start casino-redis 2>/dev/null; then
                sleep 2
                if check_redis; then
                    print_success "Redis service started successfully"
                else
                    print_error "Redis service started but not responding"
                    return 1
                fi
            else
                print_warning "Could not start Redis service, trying manual start..."
                
                # Try manual Redis start
                if command -v redis-server > /dev/null 2>&1; then
                    nohup redis-server --daemonize yes > /dev/null 2>&1 &
                    sleep 3
                    if check_redis; then
                        print_success "Redis started manually"
                    else
                        print_error "Failed to start Redis manually"
                        return 1
                    fi
                else
                    print_error "Redis not installed. Please run: ./scripts/install-redis.sh"
                    return 1
                fi
            fi
        fi
    else
        # Non-systemd systems
        if command -v redis-server > /dev/null 2>&1; then
            print_status "Starting Redis manually (no systemd)..."
            nohup redis-server --daemonize yes > /dev/null 2>&1 &
            sleep 3
            if check_redis; then
                print_success "Redis started successfully"
            else
                print_error "Failed to start Redis"
                return 1
            fi
        else
            print_error "Redis not found. Please install Redis first."
            return 1
        fi
    fi
}

# Function to check bot requirements
check_requirements() {
    print_status "Checking system requirements..."
    
    # Check Node.js
    if command -v node > /dev/null 2>&1; then
        NODE_VERSION=$(node --version)
        print_success "Node.js: $NODE_VERSION"
    else
        print_error "Node.js not found. Please install Node.js first."
        exit 1
    fi
    
    # Check npm packages
    if [ ! -d "$BOT_DIR/node_modules" ]; then
        print_warning "Node modules not found, installing..."
        cd "$BOT_DIR"
        npm install --production
        print_success "Dependencies installed"
    fi
    
    # Check environment file
    if [ ! -f "$BOT_DIR/.env" ]; then
        print_error ".env file not found. Please create it with required variables."
        exit 1
    fi
    
    # Set Redis URL if not present
    if ! grep -q "REDIS_URL" "$BOT_DIR/.env"; then
        print_status "Adding Redis URL to .env file..."
        echo "" >> "$BOT_DIR/.env"
        echo "# Redis Cache Configuration" >> "$BOT_DIR/.env" 
        echo "REDIS_URL=redis://localhost:6379" >> "$BOT_DIR/.env"
        print_success "Redis URL added to .env"
    fi
}

# Function to create log directory
setup_logging() {
    if [ ! -d "$LOG_DIR" ]; then
        mkdir -p "$LOG_DIR"
        print_success "Log directory created: $LOG_DIR"
    fi
}

# Function to stop existing bot instance
stop_existing_bot() {
    if [ -f "$PID_FILE" ]; then
        OLD_PID=$(cat "$PID_FILE")
        if kill -0 "$OLD_PID" 2>/dev/null; then
            print_status "Stopping existing bot instance (PID: $OLD_PID)..."
            kill "$OLD_PID"
            sleep 3
            if kill -0 "$OLD_PID" 2>/dev/null; then
                print_warning "Forcing bot shutdown..."
                kill -9 "$OLD_PID"
            fi
            print_success "Existing bot stopped"
        fi
        rm -f "$PID_FILE"
    fi
}

# Function to start the bot
start_bot() {
    print_status "Starting ATIVE Casino Bot in production mode..."
    
    cd "$BOT_DIR"
    
    # Set production environment
    export NODE_ENV=production
    export ENVIRONMENT=production
    
    # Start bot with PM2 if available, otherwise use nohup
    if command -v pm2 > /dev/null 2>&1; then
        print_status "Using PM2 for process management..."
        
        # Stop existing PM2 process if running
        pm2 delete casino-bot 2>/dev/null || true
        
        # Start with PM2
        pm2 start index.js \
            --name "casino-bot" \
            --log "$LOG_DIR/casino-bot.log" \
            --error "$LOG_DIR/casino-bot-error.log" \
            --out "$LOG_DIR/casino-bot-out.log" \
            --time \
            --restart-delay=5000 \
            --max-restarts=10 \
            --env NODE_ENV=production \
            --env ENVIRONMENT=production
            
        # Save PM2 configuration
        pm2 save
        pm2 startup
        
        print_success "Casino Bot started with PM2"
        print_status "Monitor with: pm2 monit"
        print_status "Logs: pm2 logs casino-bot"
        
    else
        print_status "Using nohup for process management..."
        
        # Start with nohup
        nohup node index.js > "$LOG_DIR/casino-bot.log" 2>&1 &
        echo $! > "$PID_FILE"
        
        print_success "Casino Bot started with PID: $(cat $PID_FILE)"
        print_status "Logs: tail -f $LOG_DIR/casino-bot.log"
    fi
}

# Function to verify bot startup
verify_startup() {
    print_status "Verifying bot startup..."
    
    sleep 5
    
    if command -v pm2 > /dev/null 2>&1; then
        if pm2 list | grep -q "casino-bot.*online"; then
            print_success "Bot is running successfully with PM2"
            
            # Show Redis connection status in logs
            sleep 2
            print_status "Recent bot logs:"
            pm2 logs casino-bot --lines 10
        else
            print_error "Bot failed to start with PM2"
            pm2 logs casino-bot --lines 20
            exit 1
        fi
    else
        if [ -f "$PID_FILE" ]; then
            PID=$(cat "$PID_FILE")
            if kill -0 "$PID" 2>/dev/null; then
                print_success "Bot is running with PID: $PID"
                
                # Show recent logs
                print_status "Recent bot logs:"
                tail -n 10 "$LOG_DIR/casino-bot.log"
            else
                print_error "Bot process not found"
                print_status "Error logs:"
                tail -n 20 "$LOG_DIR/casino-bot.log"
                exit 1
            fi
        else
            print_error "PID file not found"
            exit 1
        fi
    fi
}

# Function to show system status
show_status() {
    echo ""
    echo "🎰 ===== ATIVE CASINO BOT STATUS ====="
    echo ""
    
    # Redis status
    if check_redis; then
        REDIS_MEMORY=$(redis-cli info memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
        REDIS_KEYS=$(redis-cli dbsize)
        print_success "Redis: Connected (Memory: $REDIS_MEMORY, Keys: $REDIS_KEYS)"
    else
        print_warning "Redis: Disconnected (Bot will use fallback mode)"
    fi
    
    # Bot status
    if command -v pm2 > /dev/null 2>&1; then
        echo ""
        pm2 list | grep casino-bot || print_warning "Bot not found in PM2"
    else
        if [ -f "$PID_FILE" ] && kill -0 "$(cat $PID_FILE)" 2>/dev/null; then
            print_success "Bot: Running (PID: $(cat $PID_FILE))"
        else
            print_warning "Bot: Not running"
        fi
    fi
    
    echo ""
    echo "📊 Management Commands:"
    echo "  View logs: pm2 logs casino-bot"
    echo "  Restart:   pm2 restart casino-bot"
    echo "  Stop:      pm2 stop casino-bot"
    echo "  Monitor:   pm2 monit"
    echo ""
    echo "🎯 Discord Commands:"
    echo "  /redis-status - Check cache performance"
    echo "  /system-status - Full system health"
    echo ""
    echo "====================================="
}

# Main execution
main() {
    echo ""
    echo "🎰 ATIVE CASINO BOT - PRODUCTION STARTUP"
    echo "========================================"
    echo ""
    
    # Run all setup steps
    check_requirements
    setup_logging
    ensure_redis
    stop_existing_bot
    start_bot
    verify_startup
    show_status
    
    print_success "Casino Bot startup complete!"
    echo ""
}

# Handle script arguments
case "${1:-start}" in
    "start")
        main
        ;;
    "stop")
        print_status "Stopping Casino Bot..."
        stop_existing_bot
        pm2 stop casino-bot 2>/dev/null || true
        print_success "Bot stopped"
        ;;
    "restart")
        print_status "Restarting Casino Bot..."
        pm2 restart casino-bot 2>/dev/null || { stop_existing_bot; start_bot; }
        print_success "Bot restarted"
        ;;
    "status")
        show_status
        ;;
    "logs")
        if command -v pm2 > /dev/null 2>&1; then
            pm2 logs casino-bot
        else
            tail -f "$LOG_DIR/casino-bot.log"
        fi
        ;;
    "redis")
        ensure_redis
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|redis}"
        echo ""
        echo "Commands:"
        echo "  start   - Start the casino bot with Redis"
        echo "  stop    - Stop the casino bot"
        echo "  restart - Restart the casino bot"
        echo "  status  - Show bot and Redis status"
        echo "  logs    - Show bot logs"
        echo "  redis   - Ensure Redis is running"
        exit 1
        ;;
esac