# 🤖 Discord VPS Integration Documentation

## Overview

The Discord VPS Integration provides seamless server management capabilities directly through Discord slash commands and interactive buttons. This system allows authorized developers to manage VPS operations without leaving the Discord environment.

## Discord Command Integration

### Primary Command: `/dev vps`

The VPS management system is accessed through the enhanced developer panel:

```
/dev vps
```

**Access Control**: Developer only (Discord ID: `466050111680544798`)

### Command Structure in dev.js

#### Enhanced Dev Command Registration
```javascript
// In COMMANDS/dev.js - Command registration
const command = new SlashCommandBuilder()
    .setName('dev')
    .setDescription('Developer commands and tools')
    .addStringOption(option =>
        option.setName('action')
            .setDescription('Developer action to perform')
            .setRequired(false)
            .addChoices(
                { name: 'Panel', value: 'panel' },
                { name: 'VPS Management', value: 'vps' },
                { name: 'System Status', value: 'status' }
            )
    );
```

#### VPS Subcommand Handler
```javascript
// Enhanced execute method with VPS support
async execute(interaction) {
    const action = interaction.options.getString('action') || 'panel';
    
    switch (action) {
        case 'vps':
            await this.showVPSPanel(interaction);
            break;
        case 'status':
            await this.showSystemStatus(interaction);
            break;
        default:
            await this.showDeveloperPanel(interaction);
            break;
    }
}
```

## Interactive Button Interface

### VPS Management Panel Layout

The VPS panel presents an organized interface with categorized buttons:

#### **System Control Buttons**
```javascript
const systemControlRow = new ActionRowBuilder()
    .addComponents(
        new ButtonBuilder()
            .setCustomId('vps_restart')
            .setLabel('🔄 Restart Bot')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('vps_update')
            .setLabel('🔄 Update Bot')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('vps_status')
            .setLabel('📊 System Status')
            .setStyle(ButtonStyle.Secondary)
    );
```

#### **Monitoring & Maintenance Buttons**
```javascript
const maintenanceRow = new ActionRowBuilder()
    .addComponents(
        new ButtonBuilder()
            .setCustomId('vps_monitor')
            .setLabel('📊 Monitor System')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('vps_backup')
            .setLabel('💾 Create Backup')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('vps_maintenance')
            .setLabel('🔧 Run Maintenance')
            .setStyle(ButtonStyle.Secondary)
    );
```

#### **Utility Buttons**
```javascript
const utilityRow = new ActionRowBuilder()
    .addComponents(
        new ButtonBuilder()
            .setCustomId('vps_logs')
            .setLabel('📋 View Logs')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('vps_help')
            .setLabel('❓ Help')
            .setStyle(ButtonStyle.Secondary)
    );
```

### Button Interaction Handlers

#### Core Handler Structure
```javascript
// In COMMANDS/dev.js - Button handlers object
this.buttonHandlers = {
    'vps_restart': this.handleBotRestart.bind(this),
    'vps_update': this.handleBotUpdate.bind(this),
    'vps_status': this.handleSystemStatus.bind(this),
    'vps_monitor': this.handleSystemMonitor.bind(this),
    'vps_backup': this.handleCreateBackup.bind(this),
    'vps_maintenance': this.handleMaintenance.bind(this),
    'vps_logs': this.handleViewLogs.bind(this),
    'vps_help': this.handleVPSHelp.bind(this)
};
```

#### Individual Button Handlers

##### 🔄 Bot Restart Handler
```javascript
async handleBotRestart(interaction) {
    await interaction.deferReply();
    
    try {
        // Create progress embed
        const progressEmbed = UITemplates.createStandardGameEmbed(
            'Bot Restart in Progress',
            '🔄 Performing graceful bot restart...'
        );
        
        await interaction.editReply({ embeds: [progressEmbed] });
        
        // Execute restart
        const RestartManager = require('../scripts/restart.js');
        const restartManager = new RestartManager();
        const result = await restartManager.performRestart({
            reason: 'Manual restart via Discord',
            saveState: true
        });
        
        // Update with results
        const resultEmbed = UITemplates.createStandardGameEmbed(
            result.success ? 'Bot Restart Completed' : 'Bot Restart Failed',
            result.message || 'Restart operation completed'
        );
        
        if (result.success) {
            resultEmbed.setColor('#00FF00');
        } else {
            resultEmbed.setColor('#FF0000');
        }
        
        await interaction.editReply({ embeds: [resultEmbed] });
        
    } catch (error) {
        const errorEmbed = UITemplates.createErrorEmbed(
            'Restart Failed',
            `Failed to restart bot: ${error.message}`
        );
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}
```

##### 🔄 Bot Update Handler
```javascript
async handleBotUpdate(interaction) {
    await interaction.deferReply();
    
    try {
        const progressEmbed = UITemplates.createStandardGameEmbed(
            'Bot Update in Progress',
            '🔄 Pulling latest changes and updating dependencies...'
        );
        
        await interaction.editReply({ embeds: [progressEmbed] });
        
        const UpdateManager = require('../scripts/update.js');
        const updateManager = new UpdateManager();
        const result = await updateManager.performUpdate({
            createBackup: true,
            verifyAfterUpdate: true
        });
        
        const resultEmbed = UITemplates.createStandardGameEmbed(
            result.success ? 'Bot Update Completed' : 'Bot Update Failed',
            result.message || 'Update operation completed'
        );
        
        resultEmbed.setColor(result.success ? '#00FF00' : '#FF0000');
        
        // Add update details
        if (result.changes) {
            resultEmbed.addFields(
                { name: 'Files Changed', value: `${result.changes.length}`, inline: true },
                { name: 'Dependencies Updated', value: result.dependenciesUpdated ? 'Yes' : 'No', inline: true }
            );
        }
        
        await interaction.editReply({ embeds: [resultEmbed] });
        
    } catch (error) {
        const errorEmbed = UITemplates.createErrorEmbed(
            'Update Failed',
            `Failed to update bot: ${error.message}`
        );
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}
```

##### 📊 System Status Handler
```javascript
async handleSystemStatus(interaction) {
    await interaction.deferReply();
    
    try {
        const SystemInfo = require('../scripts/utils/system-info.js');
        const systemInfo = new SystemInfo();
        const overview = await systemInfo.getSystemOverview();
        
        const statusEmbed = UITemplates.createStandardGameEmbed(
            '📊 System Status Overview',
            'Current system performance and health metrics'
        );
        
        // Add system metrics fields
        statusEmbed.addFields(
            {
                name: '🖥️ CPU',
                value: `**Cores:** ${overview.cpu.cores}\n**Architecture:** ${overview.cpu.architecture}\n**Load:** ${overview.loadAverage ? overview.loadAverage['1min'] : 'N/A'}`,
                inline: true
            },
            {
                name: '💾 Memory',
                value: `**Usage:** ${overview.memory.usagePercent}%\n**Used:** ${systemInfo.formatBytes(overview.memory.used)}\n**Total:** ${systemInfo.formatBytes(overview.memory.total)}`,
                inline: true
            },
            {
                name: '💿 Disk',
                value: overview.disk ? 
                    `**Usage:** ${overview.disk.usePercent}%\n**Used:** ${overview.disk.used}\n**Available:** ${overview.disk.available}` :
                    'Not available',
                inline: true
            },
            {
                name: '🌐 Network',
                value: `**Connectivity:** ${overview.network.connectivity.connected ? '✅ Connected' : '❌ Disconnected'}\n**Interfaces:** ${overview.network.interfaces.length}`,
                inline: true
            },
            {
                name: '⏰ Uptime',
                value: `**System:** ${overview.uptime.formatted}\n**Environment:** ${overview.environment.environment}`,
                inline: true
            },
            {
                name: '🔄 Processes',
                value: `**Top Processes:** ${overview.processes.length}\n**Bot PID:** ${overview.environment.pid}`,
                inline: true
            }
        );
        
        // Set color based on system health
        const health = await systemInfo.getHealthStatus();
        const healthColors = {
            'healthy': '#00FF00',
            'warning': '#FFA500',
            'critical': '#FF0000',
            'error': '#8B0000'
        };
        
        statusEmbed.setColor(healthColors[health.status] || '#808080');
        statusEmbed.setFooter({ 
            text: `System Health: ${health.status.toUpperCase()} | Last Updated: ${new Date().toLocaleString()}` 
        });
        
        await interaction.editReply({ embeds: [statusEmbed] });
        
    } catch (error) {
        const errorEmbed = UITemplates.createErrorEmbed(
            'Status Check Failed',
            `Failed to get system status: ${error.message}`
        );
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}
```

## Integration with Main Bot (index.js)

### Button Interaction Router
```javascript
// In index.js - Button interaction handling
client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        const customId = interaction.customId;
        
        // Handle VPS management buttons
        if (customId.startsWith('vps_')) {
            const devCommand = client.commands.get('dev');
            if (devCommand && devCommand.buttonHandlers && devCommand.buttonHandlers[customId]) {
                try {
                    await devCommand.buttonHandlers[customId](interaction);
                } catch (error) {
                    logger.error('VPS button handler error:', error);
                    
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '❌ An error occurred while processing the VPS command.',
                            ephemeral: true
                        });
                    }
                }
            }
            return;
        }
        
        // Handle other button interactions...
    }
});
```

### Command Registration Integration
```javascript
// Enhanced command registration in index.js
const commands = [];
const commandFiles = fs.readdirSync('./COMMANDS').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./COMMANDS/${file}`);
    if (command.data && command.execute) {
        commands.push(command.data.toJSON());
        client.commands.set(command.data.name, command);
        
        // Log VPS-enhanced commands
        if (command.buttonHandlers) {
            logger.info(`Loaded command with button handlers: ${command.data.name}`);
        }
    }
}
```

## UI Template Integration

### Consistent Embed Styling
All VPS operations use the standardized UI templates for consistency:

```javascript
// Success message template
const successEmbed = UITemplates.createStandardGameEmbed(
    'Operation Successful',
    'VPS operation completed successfully'
);
successEmbed.setColor('#00FF00');

// Error message template  
const errorEmbed = UITemplates.createErrorEmbed(
    'Operation Failed',
    'VPS operation encountered an error'
);

// Progress message template
const progressEmbed = UITemplates.createStandardGameEmbed(
    'Operation in Progress',
    '🔄 Please wait while the operation completes...'
);
progressEmbed.setColor('#FFA500');
```

### Progress Indicators
```javascript
// Multi-step progress tracking
const steps = ['Preparing...', 'Executing...', 'Verifying...', 'Completed'];
let currentStep = 0;

const updateProgress = async () => {
    const progressEmbed = UITemplates.createStandardGameEmbed(
        'VPS Operation Progress',
        `${steps[currentStep]} (${currentStep + 1}/${steps.length})`
    );
    
    await interaction.editReply({ embeds: [progressEmbed] });
    currentStep++;
};
```

## Security Implementation

### Access Control Verification
```javascript
// Developer access check
const isDeveloper = (userId) => {
    return userId === '466050111680544798';
};

// Command execution guard
async execute(interaction) {
    if (!isDeveloper(interaction.user.id)) {
        const accessDeniedEmbed = UITemplates.createErrorEmbed(
            'Access Denied',
            'This command is restricted to developers only.'
        );
        return interaction.reply({ embeds: [accessDeniedEmbed], ephemeral: true });
    }
    
    // Continue with command execution...
}
```

### Operation Logging
```javascript
// Comprehensive operation logging
const logVPSOperation = async (operation, user, result) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        operation,
        userId: user.id,
        username: user.username,
        success: result.success,
        error: result.error || null,
        duration: result.duration || 0
    };
    
    logger.info('VPS Operation', logEntry);
    
    // Send to monitoring channel if configured
    if (process.env.VPS_LOG_CHANNEL_ID) {
        const logChannel = client.channels.cache.get(process.env.VPS_LOG_CHANNEL_ID);
        if (logChannel) {
            const logEmbed = UITemplates.createStandardGameEmbed(
                'VPS Operation Log',
                `**Operation:** ${operation}\n**User:** ${user.username}\n**Result:** ${result.success ? '✅ Success' : '❌ Failed'}`
            );
            
            await logChannel.send({ embeds: [logEmbed] });
        }
    }
};
```

## Error Handling and Recovery

### Graceful Error Management
```javascript
// Standardized error handling pattern
const handleVPSError = async (interaction, operation, error) => {
    logger.error(`VPS ${operation} failed:`, {
        error: error.message,
        stack: error.stack,
        userId: interaction.user.id,
        timestamp: new Date().toISOString()
    });
    
    const errorEmbed = UITemplates.createErrorEmbed(
        `${operation} Failed`,
        `Operation failed: ${error.message}\n\nPlease check the logs for more details.`
    );
    
    errorEmbed.addFields(
        { name: 'Error Code', value: error.code || 'UNKNOWN', inline: true },
        { name: 'Timestamp', value: new Date().toLocaleString(), inline: true }
    );
    
    if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    } else {
        await interaction.editReply({ embeds: [errorEmbed] });
    }
};
```

### Timeout Handling
```javascript
// Operation timeout protection
const executeWithTimeout = async (operation, timeoutMs = 300000) => {
    return Promise.race([
        operation(),
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
        )
    ]);
};
```

## Performance Considerations

### Async Operation Management
- **Non-blocking operations** to prevent Discord interaction timeouts
- **Progress updates** for long-running operations
- **Timeout protection** for all VPS operations
- **Error recovery** with graceful degradation

### Resource Optimization
- **Efficient embed creation** with template reuse
- **Lazy loading** of VPS script modules
- **Connection pooling** for database operations
- **Memory cleanup** after operations

---

*This documentation covers the complete Discord integration for the VPS Management System. For specific implementation details and advanced configuration, see the VPS Scripts Reference and main system documentation.*