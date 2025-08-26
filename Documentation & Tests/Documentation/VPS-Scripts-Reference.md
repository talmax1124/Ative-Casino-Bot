# 📋 VPS Scripts Reference Guide

## Core Scripts Overview

### 🔄 restart.js - Bot Restart Management

**Purpose**: Provides graceful bot restart capabilities with state preservation and verification.

**Class**: `BotRestartManager`

#### Key Methods:
```javascript
// Perform complete bot restart
async performRestart(options = {})
// Options: { reason, saveState, timeout, skipVerification }

// Save current bot state before restart
async saveCurrentState()

// Stop bot gracefully with cleanup
async stopBot()

// Start bot with verification
async startBot()

// Verify bot startup success
async verifyStartup(timeout = 60000)
```

#### Usage Example:
```javascript
const RestartManager = require('./scripts/restart.js');
const restartManager = new RestartManager();

const result = await restartManager.performRestart({
    reason: 'Manual restart requested',
    saveState: true,
    timeout: 30000
});

console.log(result.success ? 'Restart completed' : 'Restart failed');
```

#### Features:
- **Graceful shutdown** with Discord connection cleanup
- **State preservation** for active sessions
- **Startup verification** with health checks
- **Progress tracking** and status updates
- **Error recovery** with detailed reporting

---

### 🔄 update.js - Automated Update Management

**Purpose**: Handles automated git updates, dependency management, and rollback capabilities.

**Class**: `BotUpdateManager`

#### Key Methods:
```javascript
// Perform complete update process
async performUpdate(options = {})
// Options: { branch, force, createBackup, skipDependencies }

// Pull latest changes from git
async pullLatestChanges()

// Update npm dependencies
async updateDependencies()

// Create pre-update backup
async createPreUpdateBackup()

// Rollback to previous version
async rollbackUpdate()

// Verify update success
async verifyUpdate()
```

#### Usage Example:
```javascript
const UpdateManager = require('./scripts/update.js');
const updateManager = new UpdateManager();

const result = await updateManager.performUpdate({
    branch: 'main',
    createBackup: true,
    verifyAfterUpdate: true
});

console.log(`Update ${result.success ? 'successful' : 'failed'}`);
```

#### Features:
- **Git repository management** with branch switching
- **Automatic dependency updates** with conflict resolution
- **Pre-update backups** for safety
- **Rollback capabilities** on failure
- **Update verification** with testing

---

### 📊 monitor.js - System Monitoring

**Purpose**: Provides comprehensive system monitoring with real-time metrics and health assessment.

**Class**: `SystemMonitor`

#### Key Methods:
```javascript
// Get comprehensive system status
async getSystemStatus()

// Collect system metrics
async collectMetrics()

// Generate detailed system report
async generateReport(metrics)

// Check system health thresholds
async checkThresholds(metrics)

// Start continuous monitoring
async startContinuousMonitoring(interval = 60000)

// Get performance history
async getPerformanceHistory(duration = '1h')
```

#### Usage Example:
```javascript
const SystemMonitor = require('./scripts/monitor.js');
const monitor = new SystemMonitor();

const status = await monitor.getSystemStatus();
console.log(`System Health: ${status.health.status}`);
console.log(`CPU: ${status.cpu.usage}%, Memory: ${status.memory.usagePercent}%`);
```

#### Features:
- **Real-time metrics** (CPU, memory, disk, network)
- **Health assessment** with configurable thresholds
- **Performance history** tracking
- **Alert generation** for critical issues
- **Continuous monitoring** with scheduling

---

### 💾 backup.js - Backup Management

**Purpose**: Automated backup creation, verification, and management system.

**Class**: `BackupManager`

#### Key Methods:
```javascript
// Create comprehensive backup
async createBackup(options = {})
// Options: { includeDatabase, includeLogs, compress }

// Verify backup integrity
async verifyBackup(backupPath)

// Restore from backup
async restoreFromBackup(backupPath)

// Clean up old backups
async cleanupOldBackups(retentionDays = 30)

// List available backups
async listBackups()

// Get backup statistics
async getBackupStats()
```

#### Usage Example:
```javascript
const BackupManager = require('./scripts/backup.js');
const backupManager = new BackupManager();

const backup = await backupManager.createBackup({
    includeDatabase: true,
    includeLogs: true,
    compress: true
});

console.log(`Backup created: ${backup.backupName}`);
```

#### Features:
- **Comprehensive backups** (database, logs, configuration)
- **Compression and encryption** support
- **Integrity verification** with checksums
- **Retention policies** with automatic cleanup
- **Incremental backup** capabilities

---

### 🔧 maintenance.js - System Maintenance

**Purpose**: Automated database and system maintenance with optimization and cleanup.

**Class**: `MaintenanceManager`

#### Key Methods:
```javascript
// Run complete maintenance routine
async runFullMaintenance()

// Clean up database
async cleanupDatabase()

// Optimize database performance
async optimizeDatabase()

// Rotate and clean logs
async cleanupLogs()

// Clear system caches
async clearCaches()

// Generate maintenance report
async generateMaintenanceReport()
```

#### Usage Example:
```javascript
const MaintenanceManager = require('./scripts/maintenance.js');
const maintenance = new MaintenanceManager();

const result = await maintenance.runFullMaintenance();
console.log(`Maintenance completed: ${result.tasksCompleted} tasks`);
```

#### Features:
- **Database optimization** and cleanup
- **Log rotation** and archival
- **Cache management** and clearing
- **Performance analysis** and reporting
- **Scheduled maintenance** capabilities

---

### 🚀 deploy.js - Deployment Management

**Purpose**: Handles staging and production deployments with health checks and rollback.

**Class**: `DeploymentManager`

#### Key Methods:
```javascript
// Deploy to production environment
async deployToProduction(options = {})

// Deploy to staging environment
async deployToStaging(options = {})

// Perform health check
async performHealthCheck()

// Rollback deployment
async rollbackDeployment()

// Switch between environments
async switchEnvironment(target)

// Validate deployment
async validateDeployment()
```

#### Usage Example:
```javascript
const DeploymentManager = require('./scripts/deploy.js');
const deployment = new DeploymentManager();

const result = await deployment.deployToProduction({
    performHealthCheck: true,
    rollbackOnFailure: true
});

console.log(`Deployment ${result.success ? 'successful' : 'failed'}`);
```

#### Features:
- **Environment management** (staging/production)
- **Health checks** before and after deployment
- **Rollback mechanisms** for failed deployments
- **Zero-downtime** deployment strategies
- **Configuration management** across environments

---

## Utility Scripts

### 🔧 process-manager.js - Process Management

**Purpose**: Manages bot process lifecycle with graceful operations.

**Class**: `ProcessManager`

#### Key Methods:
```javascript
// Start bot process
async startProcess(scriptPath, options = {})

// Stop process gracefully
async stopProcess(pid, timeout = 30000)

// Restart process
async restartProcess(pid)

// Check process status
async getProcessStatus(pid)

// Kill process forcefully
async killProcess(pid)
```

---

### 🔧 git-manager.js - Git Operations

**Purpose**: Centralized git repository management utilities.

**Class**: `GitManager`

#### Key Methods:
```javascript
// Execute git command
async executeGitCommand(command, options = {})

// Get current branch
async getCurrentBranch()

// Check repository status
async getRepoStatus()

// Create and switch branch
async createBranch(branchName)

// Merge branches
async mergeBranch(targetBranch)
```

---

### 🔧 system-info.js - System Information

**Purpose**: Hardware and system information gathering utilities.

**Class**: `SystemInfo`

#### Key Methods:
```javascript
// Get comprehensive system overview
async getSystemOverview()

// Get CPU information
getCPUInfo()

// Get memory information
getMemoryInfo()

// Get disk usage
async getDiskUsage(path = '.')

// Check network connectivity
async checkConnectivity(host = 'google.com')
```

---

### 🔧 logger.js - Enhanced Logging

**Purpose**: Enhanced logging utilities specifically for VPS scripts.

**Class**: `ScriptLogger`

#### Key Methods:
```javascript
// Log information
async info(message, metadata = {})

// Log warnings
async warn(message, metadata = {})

// Log errors
async error(message, metadata = {})

// Start operation logging
async startOperation(operation, metadata = {})

// Complete operation logging
async completeOperation(operation, duration, success)
```

---

## Configuration Options

### Global Configuration
```javascript
// config/vps-config.js
module.exports = {
    restart: {
        gracefulShutdownTimeout: 30000,
        startupVerificationTimeout: 60000,
        maxRestartAttempts: 3,
        saveStateBeforeRestart: true
    },
    update: {
        defaultBranch: 'main',
        createBackupBeforeUpdate: true,
        verifyAfterUpdate: true,
        rollbackOnFailure: true,
        dependencyUpdateTimeout: 300000
    },
    monitor: {
        interval: 60000,
        thresholds: {
            cpu: { warning: 70, critical: 90 },
            memory: { warning: 80, critical: 95 },
            disk: { warning: 80, critical: 95 }
        },
        historyRetention: '7d'
    },
    backup: {
        retentionDays: 30,
        compressionLevel: 6,
        verifyBackups: true,
        includeDatabase: true,
        includeLogs: true
    },
    maintenance: {
        schedule: '0 2 * * *', // Daily at 2 AM
        cleanupLogs: true,
        optimizeDatabase: true,
        clearCaches: true,
        generateReport: true
    }
};
```

### Environment-Specific Settings
```javascript
// Production settings
const productionConfig = {
    logLevel: 'info',
    performanceMonitoring: true,
    autoRestart: true,
    maintenanceWindow: '02:00-04:00'
};

// Development settings
const developmentConfig = {
    logLevel: 'debug',
    performanceMonitoring: false,
    autoRestart: false,
    maintenanceWindow: 'anytime'
};
```

---

## Error Codes and Messages

### Common Error Codes
- **VPS_001**: Script execution failed
- **VPS_002**: Process management error
- **VPS_003**: Git operation failed
- **VPS_004**: System monitoring error
- **VPS_005**: Backup operation failed
- **VPS_006**: Maintenance task failed
- **VPS_007**: Deployment error
- **VPS_008**: Configuration error
- **VPS_009**: Permission denied
- **VPS_010**: Resource unavailable

### Error Recovery Procedures
Each script implements standardized error recovery:
1. **Log error** with detailed context
2. **Attempt automatic recovery** if possible
3. **Rollback changes** if necessary
4. **Notify administrator** for manual intervention
5. **Preserve system stability** above all else

---

*This reference guide covers all VPS scripts and their functionality. For implementation examples and usage patterns, see the main VPS Management System documentation.*