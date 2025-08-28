#!/bin/bash

# ATIVE Casino Bot - Health Check Script
# Monitors bot status and performs health checks

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
BOT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="${BOT_DIR}/logs/health-check.log"
PID_FILE="${BOT_DIR}/temp/bot.pid"

# Source environment variables
if [ -f "${BOT_DIR}/.env" ]; then
    source "${BOT_DIR}/.env"
fi

# Health check port (default 3000)
HEALTH_PORT=${PORT:-3000}

# Logging function
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check if bot process is running
check_bot_process() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            return 0  # Process is running
        else
            rm -f "$PID_FILE"
            return 1  # Process is not running
        fi
    else
        # Try to find by process name
        if pgrep -f "node.*index.js" >/dev/null; then
            return 0  # Process found
        else
            return 1  # Process not found
        fi
    fi
}

# Check database connectivity
check_database() {
    if [ -n "$MARIADB_HOST" ] && [ -n "$MARIADB_USER" ]; then
        # Check MariaDB connection
        if command -v mysql >/dev/null 2>&1; then
            mysql -h"$MARIADB_HOST" -P"${MARIADB_PORT:-3306}" -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" -e "SELECT 1;" "$MARIADB_DATABASE" >/dev/null 2>&1
            return $?
        fi
    elif [ -n "$POSTGRES_HOST" ] && [ -n "$POSTGRES_USER" ]; then
        # Check PostgreSQL connection
        if command -v pg_isready >/dev/null 2>&1; then
            PGPASSWORD="$POSTGRES_PASSWORD" pg_isready -h "$POSTGRES_HOST" -p "${POSTGRES_PORT:-5432}" -U "$POSTGRES_USER" -d "$POSTGRES_DATABASE" >/dev/null 2>&1
            return $?
        fi
    fi
    
    # If no database tools available or Firebase only, assume OK
    return 0
}

# Check Discord API connectivity
check_discord_api() {
    if command -v curl >/dev/null 2>&1; then
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://discord.com/api/v10/gateway" --max-time 10)
        if [ "$HTTP_CODE" = "200" ]; then
            return 0
        else
            return 1
        fi
    else
        # If curl is not available, assume OK
        return 0
    fi
}

# Check bot API health endpoint (if enabled)
check_bot_api() {
    if [ "$ENABLE_HEALTH_CHECKS" = "true" ] && command -v curl >/dev/null 2>&1; then
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${HEALTH_PORT}/health" --max-time 5)
        if [ "$HTTP_CODE" = "200" ]; then
            return 0
        else
            return 1
        fi
    else
        return 0
    fi
}

# Get system metrics
get_system_metrics() {
    # Memory usage
    if command -v free >/dev/null 2>&1; then
        MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
    else
        MEMORY_USAGE="N/A"
    fi
    
    # CPU usage (5-second average)
    if command -v top >/dev/null 2>&1; then
        CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | awk -F'%' '{print $1}')
    else
        CPU_USAGE="N/A"
    fi
    
    # Disk usage
    DISK_USAGE=$(df -h "$BOT_DIR" | tail -1 | awk '{print $5}' | sed 's/%//')
    
    echo "Memory: ${MEMORY_USAGE}%, CPU: ${CPU_USAGE}%, Disk: ${DISK_USAGE}%"
}

# Main health check function
perform_health_check() {
    log_message "🏥 Performing health check..."
    
    local status="✅"
    local issues=""
    
    # Check bot process
    if ! check_bot_process; then
        status="❌"
        issues="$issues Bot process not running."
    fi
    
    # Check database
    if ! check_database; then
        status="⚠️"
        issues="$issues Database connectivity issue."
    fi
    
    # Check Discord API
    if ! check_discord_api; then
        status="⚠️"
        issues="$issues Discord API connectivity issue."
    fi
    
    # Check bot API
    if ! check_bot_api; then
        status="⚠️"
        issues="$issues Bot API health check failed."
    fi
    
    # Get system metrics
    METRICS=$(get_system_metrics)
    
    if [ -n "$issues" ]; then
        log_message "$status Health check failed: $issues"
        log_message "📊 System metrics: $METRICS"
        
        # Send alert if webhook is configured
        if [ -n "$HEALTH_WEBHOOK_URL" ]; then
            send_health_alert "$issues" "$METRICS"
        fi
        
        return 1
    else
        log_message "$status Health check passed"
        log_message "📊 System metrics: $METRICS"
        return 0
    fi
}

# Send health alert via Discord webhook
send_health_alert() {
    local issues="$1"
    local metrics="$2"
    
    if command -v curl >/dev/null 2>&1; then
        curl -H "Content-Type: application/json" \
             -X POST \
             -d "{\"content\":\"🚨 **Casino Bot Health Alert**\n❌ Issues: $issues\n📊 Metrics: $metrics\n🕒 $(date)\"}" \
             "$HEALTH_WEBHOOK_URL" \
             >/dev/null 2>&1
    fi
}

# Restart bot if unhealthy (optional)
restart_bot_if_needed() {
    if [ "$AUTO_RESTART_ON_FAILURE" = "true" ]; then
        log_message "🔄 Auto-restart enabled, attempting to restart bot..."
        
        # Kill existing process
        if [ -f "$PID_FILE" ]; then
            PID=$(cat "$PID_FILE")
            kill -TERM "$PID" 2>/dev/null
            sleep 5
            kill -KILL "$PID" 2>/dev/null
            rm -f "$PID_FILE"
        fi
        
        # Start bot
        cd "$BOT_DIR"
        nohup node index.js > /dev/null 2>&1 &
        echo $! > "$PID_FILE"
        
        log_message "🚀 Bot restart attempted"
    fi
}

# Main execution
main() {
    # Create necessary directories
    mkdir -p "${BOT_DIR}/logs"
    mkdir -p "${BOT_DIR}/temp"
    
    if perform_health_check; then
        exit 0
    else
        restart_bot_if_needed
        exit 1
    fi
}

# Run if called directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi