# 🚀 VPS Management System - Usage Guide

## Quick Start Guide

### Prerequisites
- Developer access to the Discord bot (Discord ID: `466050111680544798`)
- Bot running with VPS scripts installed
- Proper environment variables configured

### Basic Usage
1. Open Discord and navigate to your bot's server
2. Type `/dev vps` to open the VPS Management Panel  
3. Click any button to perform VPS operations
4. Monitor operation progress through embed updates

---

## Step-by-Step Operations

### 🔄 Restarting the Bot

**When to use**: When the bot is unresponsive, after configuration changes, or for routine maintenance.

**Steps**:
1. Run `/dev vps` command
2. Click **🔄 Restart Bot** button
3. Confirm the restart (if prompted)
4. Monitor the progress embed for completion
5. Verify bot functionality after restart

**Expected Outcome**: Bot will gracefully shutdown, save current state, and restart with verification.

**Typical Duration**: 30-60 seconds

**Example Flow**:
```
[16:30:15] User clicks "🔄 Restart Bot"
[16:30:15] System: "🔄 Performing graceful bot restart..."
[16:30:20] System: "Saving current state..."
[16:30:25] System: "Stopping bot processes..."
[16:30:35] System: "Starting bot..."
[16:30:45] System: "Verifying startup..."
[16:30:50] System: "✅ Bot restart completed successfully"
```

---

### 🔄 Updating the Bot

**When to use**: To pull latest code changes, update dependencies, or deploy new features.

**Steps**:
1. Run `/dev vps` command
2. Click **🔄 Update Bot** button
3. Wait for git pull and dependency updates
4. Review update summary
5. Monitor automatic restart (if needed)

**Expected Outcome**: Latest code pulled, dependencies updated, bot restarted with new changes.

**Typical Duration**: 2-5 minutes

**Example Flow**:
```
[16:35:10] User clicks "🔄 Update Bot"
[16:35:10] System: "🔄 Pulling latest changes and updating dependencies..."
[16:35:15] System: "Creating backup..."
[16:35:25] System: "Pulling from git repository..."
[16:35:35] System: "Updating npm dependencies..."
[16:37:20] System: "Verifying update..."
[16:37:25] System: "✅ Bot update completed - 12 files changed"
```

---

### 📊 Checking System Status

**When to use**: To monitor system health, check resource usage, or troubleshoot performance issues.

**Steps**:
1. Run `/dev vps` command
2. Click **📊 System Status** button
3. Review the comprehensive system metrics
4. Check health status indicator (color-coded)

**Information Provided**:
- **CPU**: Cores, architecture, current load
- **Memory**: Usage percentage, used/total memory
- **Disk**: Usage percentage, available space
- **Network**: Connectivity status, interface count
- **Uptime**: System uptime, environment info
- **Processes**: Running processes, bot PID

**Example Output**:
```
📊 System Status Overview

🖥️ CPU                    💾 Memory                 💿 Disk
Cores: 4                  Usage: 67%                Usage: 45%
Architecture: x64         Used: 2.1 GB              Used: 15 GB
Load: 1.2                 Total: 4.0 GB             Available: 18 GB

🌐 Network                ⏰ Uptime                 🔄 Processes  
Connectivity: ✅ Connected System: 5d 12h 34m        Top Processes: 5
Interfaces: 3             Environment: production    Bot PID: 1234

System Health: HEALTHY | Last Updated: 4:35:22 PM
```

---

### 📊 System Monitoring

**When to use**: For continuous monitoring, performance analysis, or detecting issues early.

**Steps**:
1. Run `/dev vps` command
2. Click **📊 Monitor System** button
3. Review detailed performance report
4. Check for any warnings or alerts
5. Monitor trends over time

**Features**:
- Real-time performance metrics
- Historical data analysis  
- Threshold-based alerts
- Resource usage trends
- Performance recommendations

**Monitoring Categories**:
- **CPU Usage**: Load averages, process utilization
- **Memory Usage**: Physical memory, swap usage, process memory
- **Disk Usage**: Space utilization, I/O performance
- **Network**: Connectivity, throughput, latency
- **Application**: Bot performance, error rates, response times

---

### 💾 Creating Backups

**When to use**: Before major updates, after significant configuration changes, or for regular data protection.

**Steps**:
1. Run `/dev vps` command
2. Click **💾 Create Backup** button
3. Wait for backup creation and verification
4. Note the backup filename for future reference

**Backup Contents**:
- Database (Firebase Firestore data)
- Configuration files and environment variables
- Application logs and error logs
- Bot source code (current state)
- Custom assets and resources

**Expected Outcome**: Compressed backup file created with verification checksum.

**Example Flow**:
```
[16:40:10] User clicks "💾 Create Backup"
[16:40:10] System: "💾 Creating comprehensive backup..."
[16:40:15] System: "Backing up database..."
[16:40:25] System: "Backing up configuration..."
[16:40:30] System: "Backing up logs..."
[16:40:35] System: "Compressing backup..."
[16:40:45] System: "Verifying backup integrity..."
[16:40:50] System: "✅ Backup created: backup_2024-01-15_16-40-50.tar.gz (15.2 MB)"
```

---

### 🔧 Running Maintenance

**When to use**: For regular system cleanup, database optimization, or performance tuning.

**Steps**:
1. Run `/dev vps` command
2. Click **🔧 Run Maintenance** button
3. Wait for all maintenance tasks to complete
4. Review maintenance report

**Maintenance Tasks**:
- **Database Cleanup**: Remove expired data, optimize indexes
- **Log Rotation**: Archive old logs, compress historical data
- **Cache Clearing**: Clear temporary files, reset caches
- **Performance Analysis**: Generate performance report
- **System Cleanup**: Remove temporary files, clean up processes

**Expected Outcome**: System optimized, unnecessary data cleaned, performance report generated.

**Typical Duration**: 1-3 minutes

---

### 📋 Viewing Logs

**When to use**: For troubleshooting issues, monitoring bot activity, or auditing operations.

**Steps**:
1. Run `/dev vps` command
2. Click **📋 View Logs** button
3. Review recent log entries
4. Use filters to find specific events

**Log Categories**:
- **System Operations**: VPS script executions
- **Bot Activity**: Commands, interactions, errors
- **Performance Metrics**: Resource usage, response times
- **Security Events**: Access attempts, authorization failures
- **Error Events**: Exceptions, failures, recovery actions

**Log Format**:
```json
{
  "timestamp": "2024-01-15T16:45:30.123Z",
  "level": "info",
  "script": "restart",
  "message": "Bot restart completed successfully",
  "duration": 30000,
  "success": true,
  "user": "developer"
}
```

---

### ❓ Getting Help

**When to use**: When you need guidance on VPS operations or troubleshooting assistance.

**Steps**:
1. Run `/dev vps` command
2. Click **❓ Help** button
3. Browse help categories
4. Follow step-by-step guides

**Help Topics Available**:
- **Quick Start**: Basic usage guide
- **Operations**: Detailed operation instructions
- **Troubleshooting**: Common issues and solutions
- **Configuration**: Settings and customization
- **Safety**: Best practices and precautions

---

## Advanced Usage Scenarios

### 🔧 Emergency Recovery

**Scenario**: Bot is completely unresponsive or crashed.

**Steps**:
1. Try `/dev vps` → **🔄 Restart Bot** first
2. If restart fails, check **📊 System Status** for resource issues
3. If system is healthy, try **🔄 Update Bot** to get latest fixes
4. As last resort, use manual server restart

**Prevention**: Regular monitoring and maintenance help prevent emergency scenarios.

### 🚀 Deployment Workflow

**Scenario**: Deploying new features or updates to production.

**Recommended Workflow**:
1. **💾 Create Backup** - Always backup before major changes
2. **📊 System Status** - Ensure system is healthy
3. **🔄 Update Bot** - Pull latest changes and update
4. **📊 Monitor System** - Watch for any issues after update
5. **📋 View Logs** - Verify successful deployment

### 🔍 Performance Troubleshooting

**Scenario**: Bot is slow or experiencing performance issues.

**Diagnostic Steps**:
1. **📊 System Status** - Check resource usage (CPU, memory, disk)
2. **📊 Monitor System** - Look for resource bottlenecks
3. **📋 View Logs** - Check for error patterns
4. **🔧 Run Maintenance** - Clean up and optimize system
5. **🔄 Restart Bot** - Fresh start after optimization

### 🛡️ Security Monitoring

**Scenario**: Monitoring for security issues or unauthorized access.

**Security Checklist**:
1. **📋 View Logs** - Review security events and access attempts
2. **📊 Monitor System** - Check for unusual resource usage
3. **💾 Create Backup** - Ensure data is protected
4. **🔧 Run Maintenance** - Clean up potential security artifacts

---

## Best Practices

### 📅 Regular Maintenance Schedule

**Daily**:
- Check **📊 System Status** for health overview
- Monitor resource usage trends

**Weekly**:
- **🔧 Run Maintenance** for system optimization
- **💾 Create Backup** for data protection
- **📋 View Logs** for error pattern analysis

**Monthly**:
- **🔄 Update Bot** with latest features and fixes
- Review performance trends and optimization needs
- Audit security logs and access patterns

### ⚡ Performance Optimization

**Resource Management**:
- Monitor CPU usage - keep under 80% average
- Watch memory usage - maintain below 85%
- Keep disk usage under 80% for optimal performance
- Ensure stable network connectivity

**Operational Efficiency**:
- Regular maintenance prevents issues
- Proactive monitoring catches problems early
- Timely updates ensure security and stability
- Backup strategy protects against data loss

### 🛡️ Safety Precautions

**Before Major Operations**:
- Always create backup before updates
- Check system status before changes
- Avoid operations during peak usage
- Have rollback plan ready

**During Operations**:
- Monitor progress through embed updates
- Don't interrupt operations in progress
- Watch for error messages or warnings
- Be prepared to rollback if needed

**After Operations**:
- Verify operation success
- Check system status post-operation
- Monitor logs for any issues
- Test bot functionality

---

## Troubleshooting Guide

### Common Issues and Solutions

#### 🚫 "Access Denied" Error
**Cause**: User doesn't have developer permissions.
**Solution**: Only developer (Discord ID: `466050111680544798`) can use VPS commands.

#### ⏱️ Operation Timeout
**Cause**: Operation takes longer than expected.
**Solution**: Check system resources, wait for completion, or restart if stuck.

#### 🔄 Restart Fails
**Cause**: Process conflicts or resource issues.
**Solutions**:
1. Check system status for resource problems
2. Kill conflicting processes manually
3. Restart VPS server if necessary

#### 📦 Update Fails
**Cause**: Git conflicts, network issues, or dependency problems.
**Solutions**:
1. Check network connectivity
2. Resolve git conflicts manually
3. Update dependencies separately
4. Use rollback if available

#### 📊 Monitoring Not Working  
**Cause**: System command access or permission issues.
**Solutions**:
1. Verify script permissions
2. Check system command availability
3. Restart monitoring service

#### 💾 Backup Fails
**Cause**: Disk space, permissions, or database access issues.
**Solutions**:
1. Free up disk space
2. Check file permissions
3. Verify database connectivity
4. Try manual backup

### Emergency Procedures

#### Complete System Failure
1. Access VPS directly (SSH/console)
2. Check system logs: `tail -f /var/log/syslog`
3. Restart bot process manually: `node index.js`
4. If needed, restart entire VPS
5. Use Discord VPS panel once bot is responsive

#### Data Recovery
1. Locate most recent backup file
2. Stop bot process
3. Restore from backup archive
4. Verify data integrity
5. Restart bot and test functionality

### Getting Additional Help

**Discord Support**:
- Use **❓ Help** button in VPS panel
- Check embedded documentation and guides

**Log Analysis**:
- Use **📋 View Logs** for error details
- Look for patterns in error messages
- Check timestamps for issue correlation

**System Diagnostics**:
- Use **📊 System Status** for resource analysis
- **📊 Monitor System** for performance trends
- Compare metrics before and after issues

---

*This usage guide provides comprehensive instructions for operating the VPS Management System. For technical implementation details, see the VPS Scripts Reference and Discord Integration documentation.*