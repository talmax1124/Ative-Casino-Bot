/**
 * Developer commands for the utility bot
 * System management and developer utilities
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../UTILS/logger');
const { getAllActiveGames, clearActiveGame } = require('../UTILS/common');
const { sessionManager } = require('../UTILS/sessionManager');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');

// Store disabled commands (cogs)
const disabledCogs = new Set();

const execAsync = promisify(exec);

// Developer user ID from environment or hardcoded
const DEVELOPER_USER_ID = process.env.DEVELOPER_USER_ID || '466050111680544798';

// Helper function to check developer permissions
function isDeveloper(userId) {
    return userId === DEVELOPER_USER_ID;
}

// Helper function to format uptime
function formatUptime(uptimeMs) {
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

const statusCommand = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Show bot status and system information (Developer only)'),

    async execute(interaction) {
        // Check developer permissions
        if (!isDeveloper(interaction.user.id)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Permission Denied')
                .setDescription('This command is restricted to the developer.')
                .setColor(0xFF0000);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // Get system information
            const uptime = Date.now() - interaction.client.startTime;
            const memUsage = process.memoryUsage();
            
            // Get Node.js version
            const nodeVersion = process.version;
            
            // Get Discord.js version
            const djsVersion = require('discord.js').version;
            
            // Get Git information (if available)
            let gitInfo = 'Not available';
            try {
                const { stdout } = await execAsync('git rev-parse --short HEAD && git log -1 --pretty=%s');
                const [hash, message] = stdout.trim().split('\n');
                gitInfo = `\`${hash}\` - ${message}`;
            } catch (error) {
                // Git not available or not in a git repository
            }

            // Get CPU usage (approximate)
            const cpuUsage = process.cpuUsage();
            const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000).toFixed(2);

            // Get session manager statistics
            const sessionStats = sessionManager.getSessionStats();
            const activeGames = getAllActiveGames();

            const embed = new EmbedBuilder()
                .setTitle('🤖 ATIVE Casino Bot Status')
                .setColor(0x00FF00)
                .addFields(
                    { name: '⏱️ Uptime', value: formatUptime(uptime), inline: true },
                    { name: '🏓 Ping', value: `${interaction.client.ws.ping}ms`, inline: true },
                    { name: '📊 Memory Usage', value: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`, inline: true },
                    { name: '🔧 Node.js', value: nodeVersion, inline: true },
                    { name: '📚 Discord.js', value: djsVersion, inline: true },
                    { name: '💾 CPU Usage', value: `${cpuPercent}ms`, inline: true },
                    { name: '🌐 Environment', value: process.env.NODE_ENV || 'development', inline: true },
                    { name: '🏠 Platform', value: process.platform, inline: true },
                    { name: '⚙️ Arch', value: process.arch, inline: true },
                    { name: '📋 Git Info', value: gitInfo, inline: false },
                    { name: '🎮 Session Manager', value: `**${sessionStats.activeSessions}** active sessions\n**${sessionStats.activeUsers}** active users\n**${sessionStats.totalSessions}** total created`, inline: true },
                    { name: '🎲 Legacy Games', value: `**${activeGames.length}** active (legacy system)`, inline: true },
                    { name: '📈 Session Stats', value: `**${sessionStats.completedSessions}** completed\n**${sessionStats.timeoutSessions}** timeouts\n**${sessionStats.cancelledSessions}** cancelled`, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error(`Error in status command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Failed to retrieve system status.')
                .setColor(0xFF0000);

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};

// Additional dev commands
const reloadCommand = {
    data: new SlashCommandBuilder()
        .setName('reload')
        .setDescription('Reload a command (Developer only)')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('Command name to reload')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!isDeveloper(interaction.user.id)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Permission Denied')
                .setDescription('This command is restricted to the developer.')
                .setColor(0xFF0000);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const commandName = interaction.options.getString('command');

        try {
            // Check if command exists
            const command = interaction.client.commands.get(commandName);
            if (!command) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Command Not Found')
                    .setDescription(`Command \`${commandName}\` not found.`)
                    .setColor(0xFF0000);
                
                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            // Clear require cache
            const commandPath = path.join(__dirname, `${commandName}.js`);
            delete require.cache[require.resolve(commandPath)];

            // Reload command
            const newCommand = require(commandPath);
            interaction.client.commands.set(newCommand.data.name, newCommand);

            const embed = new EmbedBuilder()
                .setTitle('🔄 Command Reloaded')
                .setDescription(`Successfully reloaded command \`${commandName}\`.`)
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

            logger.info(`Developer ${interaction.user.tag} reloaded command: ${commandName}`);

        } catch (error) {
            logger.error(`Error reloading command ${commandName}: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Reload Failed')
                .setDescription(`Failed to reload command \`${commandName}\`: ${error.message}`)
                .setColor(0xFF0000);

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};

const logsCommand = {
    data: new SlashCommandBuilder()
        .setName('logs')
        .setDescription('View recent logs (Developer only)')
        .addIntegerOption(option =>
            option.setName('lines')
                .setDescription('Number of lines to show (default: 20)')
                .setMinValue(1)
                .setMaxValue(100)
        ),

    async execute(interaction) {
        if (!isDeveloper(interaction.user.id)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Permission Denied')
                .setDescription('This command is restricted to the developer.')
                .setColor(0xFF0000);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const lines = interaction.options.getInteger('lines') || 20;

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // Read recent logs
            const logPath = path.join(process.cwd(), 'logs', 'combined.log');
            
            try {
                await fs.access(logPath);
            } catch (error) {
                const embed = new EmbedBuilder()
                    .setTitle('📄 No Logs Found')
                    .setDescription('Log file not found or empty.')
                    .setColor(0xFFFF00);
                
                return await interaction.editReply({ embeds: [embed] });
            }

            // Get last N lines of log file
            const { stdout } = await execAsync(`tail -n ${lines} "${logPath}"`);
            
            // Truncate if too long for Discord
            let logContent = stdout.trim();
            if (logContent.length > 1900) {
                logContent = logContent.substring(logContent.length - 1900) + '...';
            }

            const embed = new EmbedBuilder()
                .setTitle(`📄 Recent Logs (${lines} lines)`)
                .setDescription(`\`\`\`\n${logContent}\n\`\`\``)
                .setColor(0x0099FF)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error(`Error in logs command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Failed to retrieve logs.')
                .setColor(0xFF0000);

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};



// Interaction handler for dev stop game select menu
const devStopGameSelectHandler = {
    customId: 'dev_stop_game_select',
    async execute(interaction) {
        if (!isDeveloper(interaction.user.id)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Permission Denied')
                .setDescription('This action is restricted to the developer.')
                .setColor(0xFF0000);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const [userId, gameType, channelId] = interaction.values[0].split(':');
        const { getAllActiveGames, clearActiveGame } = require('../UTILS/common');
        const activeGames = getAllActiveGames();
        const userGame = activeGames.find(game => game.userId === userId);

        if (!userGame) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Game Not Found')
                .setDescription('The selected user no longer has an active game.')
                .setColor(0xFF0000);
            
            return await interaction.update({ embeds: [embed], components: [] });
        }

        // Handle crash games specifically
        if (gameType === 'crash' && channelId) {
            try {
                const { stopCrashGame } = require('../GAMES/crash');
                await stopCrashGame(interaction.guildId, channelId);
            } catch (error) {
                logger.warn(`Failed to stop crash game: ${error.message}`);
            }
        }

        // Try to stop wordchain instance if applicable
        try {
            if (gameType === 'wordchain') {
                const wc = require('./wordchain');
                if (wc && typeof wc.forceStop === 'function') {
                    await wc.forceStop(userId);
                }
            }
        } catch (e) {
            logger.warn(`Failed to force stop wordchain: ${e.message}`);
        }

        clearActiveGame(userId);

        let userName = `User ${userId}`;
        try {
            const user = await interaction.client.users.fetch(userId);
            userName = user.displayName;
        } catch (error) {
            // Use fallback name if user not found
        }

        const embed = new EmbedBuilder()
            .setTitle('🛑 Game Stopped')
            .setDescription(`Successfully stopped ${gameType} game for ${userName}.`)
            .setColor(0x00FF00)
            .setTimestamp();
        
        await interaction.update({ embeds: [embed], components: [] });
        
        logger.info(`Developer ${interaction.user.tag} stopped ${gameType} game for user ${userId}`);
    }
};

// Add dev panel functionality for command management (formerly /cog)
const devPanelCommand = {
    data: new SlashCommandBuilder()
        .setName('dev')
        .setDescription('Developer control panel')
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable a command')
                .addStringOption(option =>
                    option.setName('command')
                        .setDescription('Command name to disable')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable a command')
                .addStringOption(option =>
                    option.setName('command')
                        .setDescription('Command name to enable')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('commands')
                .setDescription('List all commands and their status')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show bot status and system information')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('logs')
                .setDescription('View recent logs')
                .addIntegerOption(option =>
                    option.setName('lines')
                        .setDescription('Number of lines to show (default: 20)')
                        .setMinValue(1)
                        .setMaxValue(100)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reload')
                .setDescription('Reload a command')
                .addStringOption(option =>
                    option.setName('command')
                        .setDescription('Command name to reload')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('updatelottery')
                .setDescription('Update the lottery information panel in the lottery channel')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stopgame')
                .setDescription('Stop active games for users')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to stop game for (optional - shows list if not provided)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('vps')
                .setDescription('VPS deployment controls')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Action to perform')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Pull & Restart', value: 'pull_restart' },
                            { name: 'Restart Only', value: 'restart' },
                            { name: 'Pull Only', value: 'pull' },
                            { name: 'Status', value: 'status' },
                            { name: 'Logs', value: 'logs' }
                        )
                )
                .addIntegerOption(option =>
                    option.setName('lines')
                        .setDescription('Number of log lines to show (for logs action)')
                        .setMinValue(10)
                        .setMaxValue(100)
                )
        ),

    async execute(interaction) {
        if (!isDeveloper(interaction.user.id)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Permission Denied')
                .setDescription('This command is restricted to the developer.')
                .setColor(0xFF0000);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommand === 'disable') {
                const commandName = interaction.options.getString('command');
                
                // Check if command exists
                const command = interaction.client.commands.get(commandName);
                if (!command) {
                    const embed = new EmbedBuilder()
                        .setTitle('❌ Command Not Found')
                        .setDescription(`Command \`${commandName}\` does not exist.`)
                        .setColor(0xFF0000);
                    
                    return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                }

                // Prevent disabling essential commands
                const protectedCommands = ['dev', 'status'];
                if (protectedCommands.includes(commandName)) {
                    const embed = new EmbedBuilder()
                        .setTitle('🔒 Protected Command')
                        .setDescription(`Command \`${commandName}\` cannot be disabled as it's essential for bot management.`)
                        .setColor(0xFF0000);
                    
                    return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                }

                // Add to disabled set
                disabledCogs.add(commandName);

                const embed = new EmbedBuilder()
                    .setTitle('🚫 Command Disabled')
                    .setDescription(`Command \`${commandName}\` has been disabled.`)
                    .setColor(0xFF6600)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                logger.info(`Developer ${interaction.user.tag} disabled command: ${commandName}`);

            } else if (subcommand === 'enable') {
                const commandName = interaction.options.getString('command');
                
                // Check if command exists
                const command = interaction.client.commands.get(commandName);
                if (!command) {
                    const embed = new EmbedBuilder()
                        .setTitle('❌ Command Not Found')
                        .setDescription(`Command \`${commandName}\` does not exist.`)
                        .setColor(0xFF0000);
                    
                    return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                }

                // Check if command is disabled
                if (!disabledCogs.has(commandName)) {
                    const embed = new EmbedBuilder()
                        .setTitle('✅ Command Already Enabled')
                        .setDescription(`Command \`${commandName}\` is already enabled.`)
                        .setColor(0x00FF00);
                    
                    return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                }

                // Remove from disabled set
                disabledCogs.delete(commandName);

                const embed = new EmbedBuilder()
                    .setTitle('✅ Command Enabled')
                    .setDescription(`Command \`${commandName}\` has been enabled.`)
                    .setColor(0x00FF00)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                logger.info(`Developer ${interaction.user.tag} enabled command: ${commandName}`);

            } else if (subcommand === 'commands') {
                const allCommands = Array.from(interaction.client.commands.keys()).sort();
                const enabledCommands = allCommands.filter(cmd => !disabledCogs.has(cmd));
                const disabledCommands = allCommands.filter(cmd => disabledCogs.has(cmd));

                let description = '';
                
                if (enabledCommands.length > 0) {
                    description += `**✅ Enabled Commands (${enabledCommands.length}):**\n`;
                    description += enabledCommands.map(cmd => `\`${cmd}\``).join(', ') + '\n\n';
                }

                if (disabledCommands.length > 0) {
                    description += `**🚫 Disabled Commands (${disabledCommands.length}):**\n`;
                    description += disabledCommands.map(cmd => `\`${cmd}\``).join(', ');
                } else {
                    description += `**🚫 Disabled Commands:** None`;
                }

                const embed = new EmbedBuilder()
                    .setTitle('⚙️ Command Status')
                    .setDescription(description)
                    .setColor(0x0099FF)
                    .addFields(
                        { name: 'Total Commands', value: allCommands.length.toString(), inline: true },
                        { name: 'Enabled', value: enabledCommands.length.toString(), inline: true },
                        { name: 'Disabled', value: disabledCommands.length.toString(), inline: true }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

            } else if (subcommand === 'status') {
                // Execute status command functionality
                await statusCommand.execute(interaction);
                
            } else if (subcommand === 'logs') {
                // Execute logs command functionality
                await logsCommand.execute(interaction);
                
            } else if (subcommand === 'reload') {
                // Execute reload command functionality
                await reloadCommand.execute(interaction);
                
            } else if (subcommand === 'updatelottery') {
                // Execute update lottery panel functionality
                await updateLotteryPanelCommand.execute(interaction);
                
            } else if (subcommand === 'vps') {
                const action = interaction.options.getString('action');
                const lines = interaction.options.getInteger('lines') || 50;
                
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                
                try {
                    let result = '';
                    let embed;
                    
                    switch (action) {
                        case 'pull_restart':
                            // Check for active games first
                            const gracefulShutdown = require('../UTILS/gracefulShutdown');
                            const statusMessage = await gracefulShutdown.getStatusMessage();
                            
                            embed = new EmbedBuilder()
                                .setTitle('🔄 VPS: Pull & Restart')
                                .setDescription(`Checking for active games before restart...\n\n${statusMessage}`)
                                .setColor(0xFFFF00);
                            
                            await interaction.editReply({ embeds: [embed] });
                            
                            // Initiate graceful shutdown
                            const shutdownResult = await gracefulShutdown.initiateGracefulShutdown('VPS Pull & Restart', 5);
                            
                            if (shutdownResult.forced) {
                                embed = new EmbedBuilder()
                                    .setTitle('⚠️ VPS: Forced Restart')
                                    .setDescription(`**Warning**: Had to force restart after 5 minutes\n**Active games**: ${shutdownResult.activeGames.totalCount}\n**Wait time**: ${Math.round(shutdownResult.waitTime/1000)}s\n\nProceeding with git pull and restart...`)
                                    .setColor(0xFF6600);
                                await interaction.editReply({ embeds: [embed] });
                            } else {
                                embed = new EmbedBuilder()
                                    .setTitle('✅ VPS: Games Completed')
                                    .setDescription(`All games finished! Proceeding with git pull and restart...\n**Wait time**: ${Math.round(shutdownResult.waitTime/1000)}s`)
                                    .setColor(0x00FF00);
                                await interaction.editReply({ embeds: [embed] });
                            }
                            
                            // Execute git pull and restart commands on VPS
                            const pullRestartScript = `
                                cd ~/AtiveCasino &&
                                git pull origin main &&
                                npm install &&
                                pm2 restart ative-casino-bot || (pm2 start index.js --name ative-casino-bot && echo "Started new PM2 process")
                            `;
                            
                            const { stdout: pullRestartOutput, stderr: pullRestartError } = await execAsync(
                                `ssh root@ativecasino "${pullRestartScript}"`
                            );
                            
                            result = pullRestartOutput || pullRestartError || 'No output';
                            
                            embed = new EmbedBuilder()
                                .setTitle('✅ VPS: Pull & Restart Complete')
                                .setDescription(`\`\`\`\n${result.slice(-1800)}\n\`\`\``)
                                .setColor(0x00FF00)
                                .setTimestamp();
                            break;
                            
                        case 'restart':
                            // Check for active games first
                            const gracefulShutdownRestart = require('../UTILS/gracefulShutdown');
                            const statusMessageRestart = await gracefulShutdownRestart.getStatusMessage();
                            
                            embed = new EmbedBuilder()
                                .setTitle('🔄 VPS: Restarting Bot')
                                .setDescription(`Checking for active games before restart...\n\n${statusMessageRestart}`)
                                .setColor(0xFFFF00);
                            
                            await interaction.editReply({ embeds: [embed] });
                            
                            // Initiate graceful shutdown
                            const shutdownResultRestart = await gracefulShutdownRestart.initiateGracefulShutdown('VPS Restart', 5);
                            
                            if (shutdownResultRestart.forced) {
                                embed = new EmbedBuilder()
                                    .setTitle('⚠️ VPS: Forced Restart')
                                    .setDescription(`**Warning**: Had to force restart after 5 minutes\n**Active games**: ${shutdownResultRestart.activeGames.totalCount}\n**Wait time**: ${Math.round(shutdownResultRestart.waitTime/1000)}s\n\nProceeding with restart...`)
                                    .setColor(0xFF6600);
                                await interaction.editReply({ embeds: [embed] });
                            } else {
                                embed = new EmbedBuilder()
                                    .setTitle('✅ VPS: Games Completed')
                                    .setDescription(`All games finished! Proceeding with restart...\n**Wait time**: ${Math.round(shutdownResultRestart.waitTime/1000)}s`)
                                    .setColor(0x00FF00);
                                await interaction.editReply({ embeds: [embed] });
                            }
                            
                            const { stdout: restartOutput, stderr: restartError } = await execAsync(
                                `ssh root@ativecasino "cd ~/AtiveCasino && pm2 restart ative-casino-bot"`
                            );
                            
                            result = restartOutput || restartError || 'Bot restarted';
                            
                            embed = new EmbedBuilder()
                                .setTitle('✅ VPS: Bot Restarted')
                                .setDescription(`\`\`\`\n${result}\n\`\`\``)
                                .setColor(0x00FF00)
                                .setTimestamp();
                            break;
                            
                        case 'pull':
                            const { stdout: pullOutput, stderr: pullError } = await execAsync(
                                `ssh root@ativecasino "cd ~/AtiveCasino && git pull origin main && npm install"`
                            );
                            
                            result = pullOutput || pullError || 'Pull completed';
                            
                            embed = new EmbedBuilder()
                                .setTitle('📥 VPS: Code Updated')
                                .setDescription(`\`\`\`\n${result.slice(-1800)}\n\`\`\``)
                                .setColor(0x0099FF)
                                .setTimestamp();
                            break;
                            
                        case 'status':
                            const { stdout: statusOutput, stderr: statusError } = await execAsync(
                                `ssh root@ativecasino "cd ~/AtiveCasino && pm2 status ative-casino-bot && echo '---' && git log -1 --oneline"`
                            );
                            
                            result = statusOutput || statusError || 'Status check failed';
                            
                            embed = new EmbedBuilder()
                                .setTitle('📊 VPS: Status')
                                .setDescription(`\`\`\`\n${result}\n\`\`\``)
                                .setColor(0x0099FF)
                                .setTimestamp();
                            break;
                            
                        case 'logs':
                            const { stdout: logsOutput, stderr: logsError } = await execAsync(
                                `ssh root@ativecasino "cd ~/AtiveCasino && pm2 logs ative-casino-bot --lines ${lines} --nostream"`
                            );
                            
                            result = logsOutput || logsError || 'No logs available';
                            
                            // Truncate if too long
                            if (result.length > 1900) {
                                result = '...' + result.slice(-1800);
                            }
                            
                            embed = new EmbedBuilder()
                                .setTitle(`📄 VPS: Recent Logs (${lines} lines)`)
                                .setDescription(`\`\`\`\n${result}\n\`\`\``)
                                .setColor(0x0099FF)
                                .setTimestamp();
                            break;
                    }
                    
                    await interaction.editReply({ embeds: [embed] });
                    logger.info(`Developer ${interaction.user.tag} executed VPS action: ${action}`);
                    
                } catch (error) {
                    logger.error(`VPS command error: ${error.message}`);
                    
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('❌ VPS Command Failed')
                        .setDescription(`Failed to execute ${action}: ${error.message}`)
                        .setColor(0xFF0000);
                    
                    await interaction.editReply({ embeds: [errorEmbed] });
                }
                
            } else if (subcommand === 'stopgame') {
                // Execute stop game functionality
                const targetUser = interaction.options.getUser('user');
                const { getAllActiveGames, clearActiveGame } = require('../UTILS/common');
                const activeGames = getAllActiveGames();

                if (activeGames.length === 0) {
                    const embed = new EmbedBuilder()
                        .setTitle('🎮 No Active Games')
                        .setDescription('There are currently no active games to stop.')
                        .setColor(0x0099FF);
                    
                    return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                }

                if (targetUser) {
                    // Stop specific user's game
                    const userActiveGame = activeGames.find(game => game.userId === targetUser.id);
                    
                    if (!userActiveGame) {
                        const embed = new EmbedBuilder()
                            .setTitle('❌ No Active Game')
                            .setDescription(`${targetUser.displayName} does not have any active games.`)
                            .setColor(0xFF0000);
                        
                        return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                    }

                    // Handle crash games specifically
                    if (userActiveGame.gameType === 'crash') {
                        try {
                            const { stopCrashGame } = require('../GAMES/crash');
                            await stopCrashGame(interaction.guildId, userActiveGame.channelId);
                        } catch (error) {
                            logger.warn(`Failed to stop crash game: ${error.message}`);
                        }
                    }

                    // Try to stop wordchain instance if applicable
                    try {
                        if (userActiveGame.gameType === 'wordchain') {
                            const wc = require('./wordchain');
                            if (wc && typeof wc.forceStop === 'function') {
                                await wc.forceStop(targetUser.id);
                            }
                        }
                    } catch (e) {
                        logger.warn(`Failed to force stop wordchain: ${e.message}`);
                    }

                    clearActiveGame(targetUser.id);
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🛑 Game Stopped')
                        .setDescription(`Successfully stopped ${userActiveGame.gameType} game for ${targetUser.displayName}.`)
                        .setColor(0x00FF00)
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                    
                    logger.info(`Developer ${interaction.user.tag} stopped ${userActiveGame.gameType} game for user ${targetUser.id}`);
                    
                } else {
                    // Show list of active games for selection
                    const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
                    const options = [];
                    
                    for (const game of activeGames.slice(0, 25)) { // Discord limit
                        try {
                            const user = await interaction.client.users.fetch(game.userId);
                            const channelInfo = game.channelId ? ` in <#${game.channelId}>` : '';
                            options.push({
                                label: `${user.displayName} - ${game.gameType}`,
                                description: `Stop ${game.gameType} game for ${user.displayName}${channelInfo}`,
                                value: `${game.userId}:${game.gameType}:${game.channelId || ''}`
                            });
                        } catch (error) {
                            // User not found, use ID instead
                            const channelInfo = game.channelId ? ` in <#${game.channelId}>` : '';
                            options.push({
                                label: `User ${game.userId} - ${game.gameType}`,
                                description: `Stop ${game.gameType} game for user${channelInfo}`,
                                value: `${game.userId}:${game.gameType}:${game.channelId || ''}`
                            });
                        }
                    }

                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId('dev_stop_game_select')
                        .setPlaceholder('Select a game to stop')
                        .addOptions(options);

                    const row = new ActionRowBuilder().addComponents(selectMenu);

                    const embed = new EmbedBuilder()
                        .setTitle('🎮 Active Games')
                        .setDescription(`Found ${activeGames.length} active game(s). Select a game to stop:`)
                        .setColor(0x0099FF);

                    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
                }
            }

        } catch (error) {
            logger.error(`Error in dev command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred in the dev panel.')
                .setColor(0xFF0000);

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    },

    async autocomplete(interaction) {
        if (!isDeveloper(interaction.user.id)) {
            return await interaction.respond([]);
        }

        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'disable' || subcommand === 'enable') {
            const focusedValue = interaction.options.getFocused().toLowerCase();
            let commandChoices = [];
            const allCommands = Array.from(interaction.client.commands.keys());

            if (subcommand === 'disable') {
                // Show only enabled commands (excluding protected ones)
                const protectedCommands = ['dev', 'status'];
                commandChoices = allCommands.filter(cmd => 
                    !disabledCogs.has(cmd) && 
                    !protectedCommands.includes(cmd) &&
                    cmd.toLowerCase().includes(focusedValue)
                );
            } else if (subcommand === 'enable') {
                // Show only disabled commands
                commandChoices = allCommands.filter(cmd => 
                    disabledCogs.has(cmd) && 
                    cmd.toLowerCase().includes(focusedValue)
                );
            }

            const response = commandChoices
                .slice(0, 25) // Discord limit
                .map(cmd => ({ name: cmd, value: cmd }));

            await interaction.respond(response);
        } else if (subcommand === 'reload') {
            // Show all commands for reload
            const focusedValue = interaction.options.getFocused().toLowerCase();
            const allCommands = Array.from(interaction.client.commands.keys());
            const commandChoices = allCommands.filter(cmd => 
                cmd.toLowerCase().includes(focusedValue)
            );

            const response = commandChoices
                .slice(0, 25)
                .map(cmd => ({ name: cmd, value: cmd }));

            await interaction.respond(response);
        }
    }
};

// Add update lottery panel command to dev panel
const updateLotteryPanelCommand = {
    data: new SlashCommandBuilder()
        .setName('updatelotterypanel')
        .setDescription('Update the lottery information panel in the lottery channel (Developer only)'),

    async execute(interaction) {
        if (!isDeveloper(interaction.user.id)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Permission Denied')
                .setDescription('This command is restricted to the developer.')
                .setColor(0xFF0000);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const { updateLotteryPanel, LOTTERY_CHANNEL_ID, DESIGNATED_SERVER_ID } = require('../UTILS/lottery');
        const dbManager = require('../UTILS/database');
        const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
        
        const guildId = await getGuildId(interaction);
        
        // Only work in the designated server
        if (guildId !== DESIGNATED_SERVER_ID) {
            await interaction.reply({
                content: '❌ This command can only be used in the designated lottery server.',
                ephemeral: true
            });
            return;
        }

        try {
            await interaction.deferReply({ ephemeral: true });

            // Get current lottery info
            const lotteryInfo = await dbManager.getLotteryInfo(guildId);
            
            // Import the updateLotteryPanel command functionality
            const updateLotteryPanelModule = require('../UTILS/lotteryPanel');
            
            // Create the lottery panel
            await updateLotteryPanelModule.createLotteryPanel(interaction, lotteryInfo);

            await interaction.editReply({
                content: '✅ Lottery panel has been updated successfully in the lottery channel!'
            });

            // Log the action
            await sendLogMessage(
                interaction.client,
                'admin',
                `Lottery panel updated by ${interaction.user.displayName} in channel <#${LOTTERY_CHANNEL_ID}>`,
                interaction.user.id,
                guildId
            );

        } catch (error) {
            logger.error(`Error updating lottery panel: ${error.message}`);
            
            await interaction.editReply({
                content: '❌ An error occurred while updating the lottery panel. Please check the logs for details.'
            });
        }
    }
};

// Helper function to check if a command is disabled
function isCommandDisabled(commandName) {
    return disabledCogs.has(commandName);
}

// Export the unified dev command
module.exports = {
    data: devPanelCommand.data,
    execute: devPanelCommand.execute,
    autocomplete: devPanelCommand.autocomplete,
    
    // Keep individual commands for internal use
    statusCommand,
    reloadCommand,
    logsCommand,
    updateLotteryPanelCommand,
    
    // Helper functions
    isCommandDisabled,
    
    // Interaction handlers
    selectMenuHandlers: {
        dev_stop_game_select: devStopGameSelectHandler
    }
};
