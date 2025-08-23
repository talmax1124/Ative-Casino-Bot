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

            const embed = new EmbedBuilder()
                .setTitle('🤖 Utility Bot Status')
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
                    { name: '📋 Git Info', value: gitInfo, inline: false }
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



const stopCrashCommand = {
    data: new SlashCommandBuilder()
        .setName('stopcrash')
        .setDescription('Stop active crash games (Developer only)')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to stop crash game in (optional - shows list if not provided)')
                .setRequired(false)
        ),

    async execute(interaction) {
        if (!isDeveloper(interaction.user.id)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Permission Denied')
                .setDescription('This command is restricted to the developer.')
                .setColor(0xFF0000);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const targetChannel = interaction.options.getChannel('channel');
        const { getAllActiveCrashGames, stopCrashGame } = require('../GAMES/crash');
        const activeGames = getAllActiveCrashGames();

        if (activeGames.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('🚀 No Active Crash Games')
                .setDescription('No crash games are currently running.')
                .setColor(0xFFFF00);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (targetChannel) {
            // Stop specific channel's crash game
            const result = await stopCrashGame(interaction.guildId, targetChannel.id);
            
            if (!result.success) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ No Active Game')
                    .setDescription(`No crash game found in ${targetChannel}.`)
                    .setColor(0xFF0000);
                
                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            const embed = new EmbedBuilder()
                .setTitle('🛑 Crash Game Stopped')
                .setDescription(result.message)
                .setColor(0x00FF00)
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            
            logger.info(`Developer ${interaction.user.tag} stopped crash game in channel ${targetChannel.id}`);
            
        } else {
            // Show list of active crash games for selection
            if (activeGames.length > 25) {
                const embed = new EmbedBuilder()
                    .setTitle('⚠️ Too Many Active Games')
                    .setDescription(`There are ${activeGames.length} active crash games. Please specify a channel directly.`)
                    .setColor(0xFFFF00);
                
                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            const options = [];
            for (const game of activeGames) {
                const channel = await interaction.client.channels.fetch(game.channelId).catch(() => null);
                const channelName = channel ? `#${channel.name}` : `Channel ${game.channelId}`;
                
                options.push({
                    label: `${channelName} (${game.playersCount} players)`,
                    description: `${game.state.toUpperCase()} - Stop crash game in ${channelName}`,
                    value: game.regKey
                });
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('stop_crash_select')
                .setPlaceholder('Select a crash game to stop')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const embed = new EmbedBuilder()
                .setTitle('🚀 Active Crash Games')
                .setDescription(`Found ${activeGames.length} active crash game(s). Select one to stop:`)
                .setColor(0x0099FF);

            await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
        }
    }
};

// Interaction handler for stop crash select menu
const stopCrashSelectHandler = {
    customId: 'stop_crash_select',
    async execute(interaction) {
        if (!isDeveloper(interaction.user.id)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Permission Denied')
                .setDescription('This action is restricted to the developer.')
                .setColor(0xFF0000);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const regKey = interaction.values[0];
        const [guildId, channelId] = regKey.split(':');
        const { stopCrashGame } = require('../GAMES/crash');
        
        const result = await stopCrashGame(guildId, channelId);

        if (!result.success) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Game Not Found')
                .setDescription('The selected crash game is no longer active.')
                .setColor(0xFF0000);
            
            return await interaction.update({ embeds: [embed], components: [] });
        }

        const embed = new EmbedBuilder()
            .setTitle('🛑 Crash Game Stopped')
            .setDescription(result.message)
            .setColor(0x00FF00)
            .setTimestamp();
        
        await interaction.update({ embeds: [embed], components: [] });
        
        logger.info(`Developer ${interaction.user.tag} stopped crash game in channel ${channelId}`);
    }
};

const cogCommand = {
    data: new SlashCommandBuilder()
        .setName('cog')
        .setDescription('Manage command cogs (Enable/Disable commands) (Developer only)')
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
                .setName('list')
                .setDescription('List all commands and their status')
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
                const protectedCommands = ['cog', 'status'];
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

            } else if (subcommand === 'list') {
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
                    .setTitle('⚙️ Command Cog Status')
                    .setDescription(description)
                    .setColor(0x0099FF)
                    .addFields(
                        { name: 'Total Commands', value: allCommands.length.toString(), inline: true },
                        { name: 'Enabled', value: enabledCommands.length.toString(), inline: true },
                        { name: 'Disabled', value: disabledCommands.length.toString(), inline: true }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

        } catch (error) {
            logger.error(`Error in cog command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred while managing command cogs.')
                .setColor(0xFF0000);

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    },

    async autocomplete(interaction) {
        if (!isDeveloper(interaction.user.id)) {
            return await interaction.respond([]);
        }

        const focusedValue = interaction.options.getFocused().toLowerCase();
        const subcommand = interaction.options.getSubcommand();
        
        let commandChoices = [];
        const allCommands = Array.from(interaction.client.commands.keys());

        if (subcommand === 'disable') {
            // Show only enabled commands (excluding protected ones)
            const protectedCommands = ['cog', 'status'];
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
    }
};

// Helper function to check if a command is disabled
function isCommandDisabled(commandName) {
    return disabledCogs.has(commandName);
}

// Export multiple commands
module.exports = {
    data: statusCommand.data,
    execute: statusCommand.execute,
    reloadCommand,
    logsCommand,
    stopCrashCommand,
    cogCommand,
    
    // Helper functions
    isCommandDisabled,
    
    // Interaction handlers
    selectMenuHandlers: {
        stop_crash_select: stopCrashSelectHandler
    }
};