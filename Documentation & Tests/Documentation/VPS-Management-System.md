# 🖥️ VPS Management System Documentation

## Overview

The VPS Management System provides comprehensive server and bot management capabilities directly through Discord. This system automates critical operations like bot restarts, updates, system monitoring, backups, and maintenance tasks.

## System Architecture

```
scripts/
├── restart.js           # Bot restart management
├── update.js            # Automated updates and git operations
├── monitor.js           # System monitoring and health checks
├── backup.js            # Backup creation and management
├── maintenance.js       # Database and system maintenance
├── deploy.js            # Deployment utilities
└── utils/
    ├── process-manager.js   # Process lifecycle management
    ├── git-manager.js       # Git repository operations
    ├── system-info.js       # Hardware monitoring
    └── logger.js           # Enhanced logging utilities
```

## Core Features

### 🔄 Bot Restart Management
- **Graceful shutdowns** with state preservation
- **Connection cleanup** and resource management
- **Startup verification** with health checks
- **Progress tracking** and status reporting

### 🔄 Automated Updates
- **Git repository management** with branch switching
- **Dependency updates** (npm install)
- **Rollback capabilities** on failure
- **Pre-update backups** for safety
- **Verification testing** after updates

### 📊 System Monitoring
- **Real-time metrics** (CPU, memory, disk usage)
- **Network connectivity** testing
- **Process monitoring** and resource usage
- **Health status** assessment with thresholds
- **Alert generation** for critical issues

### 💾 Backup System
- **Automated backups** of database and configuration
- **Compressed archives** with metadata
- **Backup verification** and integrity checks
- **Retention policies** with automatic cleanup
- **Incremental backup** support

### 🔧 Maintenance Tasks
- **Database cleanup** and optimization
- **Log rotation** and archival
- **Cache clearing** and memory optimization
- **Performance analysis** and reporting
- **Scheduled maintenance** capabilities

### 🚀 Deployment Utilities
- **Staging/Production** environment management
- **Health checks** before and after deployment
- **Rollback mechanisms** for failed deployments
- **Configuration management** across environments
- **Zero-downtime** deployment strategies

## Discord Integration

### Developer Panel Access
The VPS management interface is accessible through the enhanced `/dev vps` command:

```
/dev vps
```

### Interactive Button Interface
- **🔄 Restart Bot** - Graceful bot restart with progress tracking
- **🔄 Update Bot** - Git pull and dependency updates
- **📊 System Status** - Real-time system metrics display
- **📊 Monitor System** - Continuous monitoring with alerts
- **💾 Create Backup** - Manual backup creation
- **🔧 Run Maintenance** - Database and system cleanup
- **📋 View Logs** - Recent log entries and error tracking
- **❓ Help** - Comprehensive usage documentation

### Security Features
- **Developer-only access** (Discord ID: `466050111680544798`)
- **Command verification** and authorization
- **Operation logging** for audit trails
- **Safe failure modes** with automatic rollback
- **Resource protection** against abuse

## Usage Examples

### Basic Operations

#### Restart Bot
```javascript
// Triggered via Discord button or programmatically
const restartManager = require('./scripts/restart.js');
const result = await restartManager.performRestart({
    reason: 'Manual restart requested',
    saveState: true,
    timeout: 30000
});
```

#### System Status Check
```javascript
// Get comprehensive system overview
const monitor = require('./scripts/monitor.js');
const status = await monitor.getSystemStatus();
console.log(`CPU: ${status.cpu.usage}%, Memory: ${status.memory.usagePercent}%`);
```

#### Create Backup
```javascript
// Create full system backup
const backupManager = require('./scripts/backup.js');
const backup = await backupManager.createBackup({
    includeDatabase: true,
    includeLogs: true,
    compress: true
});
```

### Advanced Operations

#### Automated Update with Rollback
```javascript
const updateManager = require('./scripts/update.js');
const result = await updateManager.performUpdate({
    branch: 'main',
    createBackup: true,
    verifyAfterUpdate: true,
    rollbackOnFailure: true
});
```

#### Scheduled Maintenance
```javascript
const maintenanceManager = require('./scripts/maintenance.js');
await maintenanceManager.runFullMaintenance({
    cleanupLogs: true,
    optimizeDatabase: true,
    generateReport: true
});
```

## Configuration

### Environment Variables
Required environment variables for VPS management:

```bash
# Discord Configuration
DISCORD_TOKEN=your_discord_token
CLIENT_ID=your_client_id

# Firebase Configuration  
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email

# VPS Configuration
ENVIRONMENT=production
LOG_LEVEL=info
BACKUP_RETENTION_DAYS=30
MAINTENANCE_SCHEDULE=0 2 * * * # Daily at 2 AM
```

### Script Configuration
Each script supports configuration options:

```javascript
// restart.js configuration
const restartConfig = {
    gracefulShutdownTimeout: 30000,
    startupVerificationTimeout: 60000,
    maxRestartAttempts: 3,
    saveStateBeforeRestart: true
};

// monitor.js thresholds
const monitorThresholds = {
    cpu: { warning: 70, critical: 90 },
    memory: { warning: 80, critical: 95 },
    disk: { warning: 80, critical: 95 }
};
```

## Error Handling

### Comprehensive Error Management
- **Graceful degradation** on component failures
- **Automatic retry** mechanisms with exponential backoff
- **Detailed error logging** with stack traces
- **User-friendly error messages** in Discord
- **Recovery procedures** for common failure scenarios

### Error Recovery Patterns
```javascript
// Example error recovery in update.js
try {
    await this.pullLatestChanges();
} catch (error) {
    logger.error('Git pull failed, attempting rollback', { error: error.message });
    await this.rollbackUpdate();
    throw new Error(`Update failed: ${error.message}. Rollback completed.`);
}
```

## Logging and Monitoring

### Comprehensive Logging
- **Structured JSON logging** with metadata
- **Log rotation** to prevent disk space issues
- **Multiple log levels** (debug, info, warn, error)
- **Operation tracking** with unique IDs
- **Performance metrics** collection

### Log Categories
- **System Operations** - Restart, update, maintenance events
- **Performance Metrics** - CPU, memory, disk usage trends
- **Error Events** - Failures, exceptions, recovery actions
- **Security Events** - Access attempts, authorization failures
- **Audit Trail** - Administrative actions and changes

## Performance Optimization

### Resource Management
- **Memory usage monitoring** with automatic cleanup
- **Process lifecycle** optimization
- **Database connection pooling** efficiency
- **Cache management** strategies
- **Background task** scheduling

### Scalability Considerations
- **Concurrent operation** handling
- **Resource contention** prevention
- **Load balancing** for multiple instances
- **Queue management** for operations
- **Graceful degradation** under high load

## Testing and Validation

### Automated Testing
```bash
# Test bot restart functionality
node scripts/restart.js --test

# Validate system monitoring
node scripts/monitor.js --validate

# Test backup creation
node scripts/backup.js --test-backup
```

### Manual Testing Checklist
- [ ] Bot restart completes successfully
- [ ] System monitoring displays accurate metrics
- [ ] Backups are created and verified
- [ ] Updates complete without errors
- [ ] Maintenance tasks run successfully
- [ ] Discord integration responds correctly

## Troubleshooting

### Common Issues

#### Bot Won't Restart
1. Check process permissions
2. Verify Discord token validity
3. Review system resource availability
4. Check log files for specific errors

#### Update Failures
1. Verify git repository status
2. Check network connectivity
3. Validate backup creation
4. Review dependency conflicts

#### System Monitoring Issues
1. Confirm system command availability
2. Check file system permissions
3. Verify network connectivity tests
4. Review threshold configurations

### Debug Commands
```bash
# Enable debug logging
NODE_ENV=development DEBUG=* node index.js

# Check system status manually
node scripts/monitor.js --debug

# Validate all VPS scripts
npm run test:vps
```

## Security Considerations

### Access Control
- **Developer-only access** to VPS commands
- **Command authorization** verification
- **Audit logging** for all operations
- **Safe operation modes** with confirmations

### Data Protection
- **Encrypted backups** with secure storage
- **Sensitive data** filtering in logs
- **Secure configuration** management
- **Network security** considerations

## Future Enhancements

### Planned Features
- **Multi-server management** capabilities
- **Automated scaling** based on load
- **Advanced alerting** with external notifications
- **Performance analytics** dashboard
- **Custom maintenance** script support

### Integration Opportunities
- **CI/CD pipeline** integration
- **External monitoring** service compatibility
- **Cloud deployment** automation
- **Container orchestration** support

---

*This documentation covers the complete VPS Management System implementation. For specific API references or advanced configuration options, see the individual script documentation files.*