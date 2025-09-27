/**
 * Panel Manager for role-based administrative panels
 * Handles Developer, Admin, and Mod panels with dropdown actions
 */

const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { exec } = require('child_process');
const { promisify } = require('util');
const dbManager = require('./database');
const { clearActiveGame, getAllActiveGames, fmt, fmtDelta, sendLogMessage, getGuildId } = require('./common');
const logger = require('./logger');

const execAsync = promisify(exec);

// Role definitions
const DEVELOPER_ID = '466050111680544798';

class PanelManager {
    constructor() {
        this.activeActions = new Map(); // Track active dropdown actions
    }

    /**
     * Check if user has developer permissions
     */
    isDeveloper(userId) {
        return userId === DEVELOPER_ID;
    }

    /**
     * Check if user has admin permissions
     */
    isAdmin(member) {
        return member.permissions.has('Administrator') || this.isDeveloper(member.user.id);
    }

    /**
     * Check if user has mod permissions
     */
    isMod(member) {
        return member.permissions.has('ModerateMembers') || this.isAdmin(member);
    }

    /**
     * Create Developer Panel
     */
    createDeveloperPanel(interaction) {
        if (!this.isDeveloper(interaction.user.id)) {
            return {
                embeds: [new EmbedBuilder()
                    .setTitle('❌ Access Denied')
                    .setDescription('You do not have developer permissions.')
                    .setColor('#ff0000')],
                flags: MessageFlags.Ephemeral
            };
        }

        const embed = new EmbedBuilder()
            .setTitle('🔧 Developer Control Panel')
            .setDescription('Select an action from the dropdown menu below.')
            .addFields([
                { name: '🎮 Game Management', value: 'Stop active games, manage game states', inline: true },
                { name: '💰 Economy Management', value: 'Add/remove money, refund transactions', inline: true },
                { name: '🔄 System Management', value: 'Restart bot, update code, view logs', inline: true },
                { name: '📊 Database Management', value: 'Backup, restore, manage user data', inline: true },
                { name: '🛠️ Bot Management', value: 'Update status, manage guilds', inline: true },
                { name: '📋 Monitoring', value: 'View system stats, active games', inline: true }
            ])
            .setColor('#00ff00')
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('dev_panel_action')
            .setPlaceholder('Choose a developer action...')
            .addOptions([
                {
                    label: 'Commands',
                    description: 'View and manage bot commands',
                    value: 'commands',
                    emoji: '⚙️'
                },
                {
                    label: 'Disable Command',
                    description: 'Disable a bot command',
                    value: 'disable_command',
                    emoji: '🚫'
                },
                {
                    label: 'Enable Command',
                    description: 'Enable a bot command',
                    value: 'enable_command',
                    emoji: '✅'
                },
                {
                    label: 'View Logs',
                    description: 'View recent bot logs',
                    value: 'logs',
                    emoji: '📄'
                },
                {
                    label: 'Reload Command',
                    description: 'Reload a specific command',
                    value: 'reload_command',
                    emoji: '🔄'
                },
                {
                    label: 'System Status',
                    description: 'View system status and statistics',
                    value: 'status',
                    emoji: '📊'
                },
                {
                    label: 'Stop Game',
                    description: 'Force stop an active game for a user',
                    value: 'stop_game',
                    emoji: '🛑'
                },
                {
                    label: 'Update Lottery',
                    description: 'Update lottery panel information',
                    value: 'update_lottery',
                    emoji: '🎰'
                },
                {
                    label: 'VPS Controls',
                    description: 'VPS deployment and management',
                    value: 'vps_controls',
                    emoji: '🖥️'
                },
                {
                    label: 'Add Money',
                    description: 'Add money to a user\'s balance',
                    value: 'add_money',
                    emoji: '💰'
                },
                {
                    label: 'Refund Transaction',
                    description: 'Refund a user\'s last transaction',
                    value: 'refund',
                    emoji: '↩️'
                },
                {
                    label: 'Database Backup',
                    description: 'Create a backup of the database',
                    value: 'db_backup',
                    emoji: '💾'
                },
                {
                    label: 'Active Games Status',
                    description: 'Check active games before restart/shutdown',
                    value: 'active_games_status',
                    emoji: '🎮'
                },
                {
                    label: 'Inactivity Tax Status',
                    description: 'Check inactive users and potential taxes',
                    value: 'tax_status',
                    emoji: '💸'
                },
                {
                    label: 'Run Inactivity Taxes',
                    description: 'Process taxes for inactive users (3+ days)',
                    value: 'run_taxes',
                    emoji: '🏛️'
                },
                {
                    label: 'Wealth Tax Status',
                    description: 'Check wealthy users and high-stakes activity',
                    value: 'wealth_tax_status',
                    emoji: '💎'
                },
                {
                    label: 'Run Wealth Taxes',
                    description: 'Tax rich users who don\'t gamble high stakes',
                    value: 'run_wealth_taxes',
                    emoji: '🏦'
                },
                {
                    label: 'Restart Bot',
                    description: 'Restart the bot with updated code',
                    value: 'restart_bot',
                    emoji: '🔄'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        return {
            embeds: [embed],
            components: [row],
            flags: MessageFlags.Ephemeral
        };
    }

    /**
     * Create Admin Panel
     */
    createAdminPanel(interaction) {
        if (!this.isAdmin(interaction.member)) {
            return {
                embeds: [new EmbedBuilder()
                    .setTitle('❌ Access Denied')
                    .setDescription('You do not have admin permissions.')
                    .setColor('#ff0000')],
                flags: MessageFlags.Ephemeral
            };
        }

        const embed = new EmbedBuilder()
            .setTitle('⚖️ Admin Control Panel')
            .setDescription('Administrative actions for server management.')
            .addFields([
                { name: '👤 User Management', value: 'Manage user accounts and balances', inline: true },
                { name: '🎲 Game Oversight', value: 'Monitor and manage casino games', inline: true },
                { name: '📊 Economy Control', value: 'Adjust economy settings and rates', inline: true }
            ])
            .setColor('#ffa500')
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_panel_action')
            .setPlaceholder('Choose an admin action...')
            .addOptions([
                {
                    label: 'View User Balance',
                    description: 'Check any user\'s current balance',
                    value: 'view_balance',
                    emoji: '👁️'
                },
                {
                    label: 'Reset User Balance',
                    description: 'Reset a user\'s balance to default',
                    value: 'reset_balance',
                    emoji: '🔄'
                },
                {
                    label: 'Game Statistics',
                    description: 'View detailed game statistics',
                    value: 'game_stats',
                    emoji: '📈'
                },
                {
                    label: 'Active Games Monitor',
                    description: 'Monitor all currently active games',
                    value: 'active_games',
                    emoji: '🎮'
                },
                {
                    label: 'Economy Report',
                    description: 'Generate economy health report',
                    value: 'economy_report',
                    emoji: '📊'
                },
                {
                    label: 'User Activity',
                    description: 'View user activity and engagement',
                    value: 'user_activity',
                    emoji: '📋'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        return {
            embeds: [embed],
            components: [row],
            flags: MessageFlags.Ephemeral
        };
    }

    /**
     * Create Mod Panel
     */
    createModPanel(interaction) {
        if (!this.isMod(interaction.member)) {
            return {
                embeds: [new EmbedBuilder()
                    .setTitle('❌ Access Denied')
                    .setDescription('You do not have moderator permissions.')
                    .setColor('#ff0000')],
                flags: MessageFlags.Ephemeral
            };
        }

        const embed = new EmbedBuilder()
            .setTitle('🛡️ Moderator Control Panel')
            .setDescription('Moderation tools for maintaining server order.')
            .addFields([
                { name: '🔍 Monitoring', value: 'Monitor user behavior and game activity', inline: true },
                { name: '⚠️ Warnings', value: 'Issue warnings and temporary restrictions', inline: true },
                { name: '📊 Reports', value: 'Generate moderation reports', inline: true }
            ])
            .setColor('#00bfff')
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('mod_panel_action')
            .setPlaceholder('Choose a moderation action...')
            .addOptions([
                {
                    label: 'Check User Games',
                    description: 'View a user\'s current game status',
                    value: 'check_user_games',
                    emoji: '🔍'
                },
                {
                    label: 'Issue Warning',
                    description: 'Send a warning to a user',
                    value: 'issue_warning',
                    emoji: '⚠️'
                },
                {
                    label: 'Temporary Game Ban',
                    description: 'Temporarily ban user from games',
                    value: 'temp_game_ban',
                    emoji: '🚫'
                },
                {
                    label: 'View Recent Activity',
                    description: 'Check recent bot activity logs',
                    value: 'recent_activity',
                    emoji: '📋'
                },
                {
                    label: 'Economy Abuse Check',
                    description: 'Check for potential economy abuse',
                    value: 'abuse_check',
                    emoji: '🔎'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        return {
            embeds: [embed],
            components: [row],
            flags: MessageFlags.Ephemeral
        };
    }

    /**
     * Handle Developer Panel Actions
     */
    async handleDeveloperAction(interaction) {
        if (!this.isDeveloper(interaction.user.id)) {
            return await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('❌ Access Denied')
                    .setDescription('You do not have developer permissions.')
                    .setColor('#ff0000')],
                flags: MessageFlags.Ephemeral
            });
        }

        const action = interaction.values[0];

        try {
            switch (action) {
                case 'commands':
                    return await this.handleCommands(interaction);
                case 'disable_command':
                    return await this.handleDisableCommand(interaction);
                case 'enable_command':
                    return await this.handleEnableCommand(interaction);
                case 'logs':
                    return await this.handleLogs(interaction);
                case 'reload_command':
                    return await this.handleReloadCommand(interaction);
                case 'status':
                    return await this.handleSystemStats(interaction);
                case 'stop_game':
                    return await this.handleStopGame(interaction);
                case 'update_lottery':
                    return await this.handleUpdateLottery(interaction);
                case 'vps_controls':
                    return await this.handleVPSControls(interaction);
                case 'add_money':
                    return await this.handleAddMoney(interaction);
                case 'refund':
                    return await this.handleRefund(interaction);
                case 'db_backup':
                    return await this.handleDatabaseBackup(interaction);
                case 'active_games_status':
                    return await this.handleActiveGamesStatus(interaction);
                case 'tax_status':
                    return await this.handleTaxStatus(interaction);
                case 'run_taxes':
                    return await this.handleRunTaxes(interaction);
                case 'wealth_tax_status':
                    return await this.handleWealthTaxStatus(interaction);
                case 'run_wealth_taxes':
                    return await this.handleRunWealthTaxes(interaction);
                case 'restart_bot':
                    return await this.handleRestartBot(interaction);
                default:
                    throw new Error(`Unknown action: ${action}`);
            }
        } catch (error) {
            logger.error(`Developer panel action error: ${error.message}`);
            await sendLogMessage(interaction.client, 'error', `Developer panel error: ${error.message}`);
            
            return await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('❌ Action Failed')
                    .setDescription(`Failed to execute action: ${error.message}`)
                    .setColor('#ff0000')],
                flags: MessageFlags.Ephemeral
            });
        }
    }

    /**
     * Handle Commands List Action
     */
    async handleCommands(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const devModule = require('../COMMANDS/dev');
            const allCommands = Array.from(interaction.client.commands.keys()).sort();
            const enabledCommands = allCommands.filter(cmd => !devModule.isCommandDisabled(cmd));
            const disabledCommands = allCommands.filter(cmd => devModule.isCommandDisabled(cmd));

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
                .setColor('#0099FF')
                .addFields(
                    { name: 'Total Commands', value: allCommands.length.toString(), inline: true },
                    { name: 'Enabled', value: enabledCommands.length.toString(), inline: true },
                    { name: 'Disabled', value: disabledCommands.length.toString(), inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            throw new Error(`Failed to retrieve command status: ${error.message}`);
        }
    }

    /**
     * Handle Disable Command Action
     */
    async handleDisableCommand(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🚫 Disable Command')
            .setDescription('Please use the `/dev disable` command to disable specific commands. This provides better control and validation.')
            .setColor('#FFA500')
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /**
     * Handle Enable Command Action
     */
    async handleEnableCommand(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('✅ Enable Command')
            .setDescription('Please use the `/dev enable` command to enable specific commands. This provides better control and validation.')
            .setColor('#FFA500')
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /**
     * Handle Logs Action
     */
    async handleLogs(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const fs = require('fs').promises;
            const path = require('path');

            const logPath = path.join(process.cwd(), 'logs', 'combined.log');
            
            try {
                await fs.access(logPath);
            } catch (error) {
                const embed = new EmbedBuilder()
                    .setTitle('📄 No Logs Found')
                    .setDescription('Log file not found or empty.')
                    .setColor('#FFFF00');
                
                return await interaction.editReply({ embeds: [embed] });
            }

            const { stdout } = await execAsync(`tail -n 20 "${logPath}"`);
            
            let logContent = stdout.trim();
            if (logContent.length > 1900) {
                logContent = logContent.substring(logContent.length - 1900) + '...';
            }

            const embed = new EmbedBuilder()
                .setTitle(`📄 Recent Logs (20 lines)`)
                .setDescription(`\`\`\`\n${logContent}\n\`\`\``)
                .setColor('#0099FF')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            throw new Error(`Failed to retrieve logs: ${error.message}`);
        }
    }

    /**
     * Handle Reload Command Action
     */
    async handleReloadCommand(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🔄 Reload Command')
            .setDescription('Please use the `/dev reload` command to reload specific commands. This provides better control and validation.')
            .setColor('#FFA500')
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /**
     * Handle Update Lottery Action
     */
    async handleUpdateLottery(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🎰 Update Lottery')
            .setDescription('Please use the `/dev updatelottery` command to update the lottery panel. This ensures proper validation and server verification.')
            .setColor('#FFA500')
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /**
     * Handle VPS Controls Action
     */
    async handleVPSControls(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🖥️ VPS Controls')
            .setDescription('Please use the `/dev vps` command for VPS deployment controls. Available actions:\n\n• `pull_restart` - Pull latest code and restart\n• `restart` - Restart bot only\n• `pull` - Pull latest code only\n• `status` - Check VPS status\n• `logs` - View VPS logs')
            .setColor('#FFA500')
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /**
     * Handle Add Money Action
     */
    async handleAddMoney(interaction) {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

        const modal = new ModalBuilder()
            .setCustomId('add_money_modal')
            .setTitle('💰 Add Money to User Balance');

        const userIdInput = new TextInputBuilder()
            .setCustomId('user_id')
            .setLabel('User ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter the user ID (e.g., 123456789012345678)')
            .setRequired(true)
            .setMaxLength(20);

        const amountInput = new TextInputBuilder()
            .setCustomId('amount')
            .setLabel('Amount')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter amount to add (e.g., 1000)')
            .setRequired(true)
            .setMaxLength(10);

        const userIdRow = new ActionRowBuilder().addComponents(userIdInput);
        const amountRow = new ActionRowBuilder().addComponents(amountInput);

        modal.addComponents(userIdRow, amountRow);

        await interaction.showModal(modal);
    }

    /**
     * Handle Refund Action
     */
    async handleRefund(interaction) {
        try {
            // Get active games to show users who might need refunds
            const activeGames = getAllActiveGames();
            
            // For now, we'll create a simple user dropdown. In a full implementation,
            // this would query recent transactions from the database
            const options = [];
            
            if (activeGames.length > 0) {
                for (const game of activeGames.slice(0, 25)) { // Limit to 25 options
                    try {
                        const user = await interaction.client.users.fetch(game.userId);
                        options.push({
                            label: `${user.displayName} - ${game.gameType}`,
                            description: `Refund transaction for ${user.displayName}`,
                            value: game.userId
                        });
                    } catch (error) {
                        // User not found, skip
                    }
                }
            }
            
            if (options.length === 0) {
                await interaction.reply({
                    content: '❌ No users with recent activity found. Refund functionality requires recent game activity to identify users.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('refund_user_select')
                .setPlaceholder('Select a user to refund their transaction')
                .addOptions(options);
                
            const row = new ActionRowBuilder().addComponents(selectMenu);
            
            const embed = new EmbedBuilder()
                .setTitle('💸 Refund Transaction')
                .setDescription(`Select a user to refund their last transaction:`)
                .setColor(0x0099FF);
                
            await interaction.reply({ 
                embeds: [embed], 
                components: [row], 
                flags: MessageFlags.Ephemeral 
            });
            
        } catch (error) {
            logger.error(`Error in handleRefund: ${error.message}`);
            await interaction.reply({
                content: 'An error occurred while loading user list.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    /**
     * Handle Stop Game Action
     */
    async handleStopGame(interaction) {
        try {
            const activeGames = getAllActiveGames();
            
            if (activeGames.length === 0) {
                await interaction.reply({
                    content: '❌ No active games found to stop.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            
            const options = [];
            for (const game of activeGames.slice(0, 25)) { // Limit to 25 options
                try {
                    const user = await interaction.client.users.fetch(game.userId);
                    options.push({
                        label: `${user.displayName} - ${game.gameType}`,
                        description: `Stop ${game.gameType} game for ${user.displayName}`,
                        value: game.userId
                    });
                } catch (error) {
                    // User not found, use ID instead
                    options.push({
                        label: `User ${game.userId} - ${game.gameType}`,
                        description: `Stop ${game.gameType} game for user`,
                        value: game.userId
                    });
                }
            }
            
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('stop_game_user_select')
                .setPlaceholder('Select a user to stop their active game')
                .addOptions(options);
                
            const row = new ActionRowBuilder().addComponents(selectMenu);
            
            const embed = new EmbedBuilder()
                .setTitle('🛑 Stop Active Game')
                .setDescription(`Found ${activeGames.length} active game(s). Select a user to stop their game:`)
                .setColor(0x0099FF);
                
            await interaction.reply({ 
                embeds: [embed], 
                components: [row], 
                flags: MessageFlags.Ephemeral 
            });
            
        } catch (error) {
            logger.error(`Error in handleStopGame: ${error.message}`);
            await interaction.reply({
                content: 'An error occurred while loading active games.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    /**
     * Handle Restart Bot Action
     */
    async handleRestartBot(interaction) {
        const { ButtonBuilder, ButtonStyle } = require('discord.js');
        
        const confirmButton = new ButtonBuilder()
            .setCustomId('confirm_restart_bot')
            .setLabel('Confirm Restart')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔄');

        const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_restart_bot')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌');

        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

        const embed = new EmbedBuilder()
            .setTitle('🔄 Confirm Bot Restart')
            .setDescription('⚠️ **WARNING**: This will restart the entire bot!\n\n• All active games will be terminated\n• Users may experience brief downtime\n• Bot will restart with latest code\n\nAre you sure you want to proceed?')
            .setColor('#ffa500')
            .setTimestamp();

        await interaction.reply({ 
            embeds: [embed], 
            components: [row], 
            flags: MessageFlags.Ephemeral 
        });
    }

    /**
     * Handle Database Backup Action
     */
    async handleDatabaseBackup(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const backupData = await dbManager.createBackup();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `backup-${timestamp}.json`;

            const embed = new EmbedBuilder()
                .setTitle('💾 Database Backup Created')
                .setDescription(`Backup created successfully: \`${filename}\``)
                .addFields([
                    { name: 'Records Backed Up', value: backupData.recordCount.toString(), inline: true },
                    { name: 'Backup Size', value: `${(JSON.stringify(backupData).length / 1024).toFixed(2)} KB`, inline: true },
                    { name: 'Timestamp', value: new Date().toLocaleString(), inline: true }
                ])
                .setColor('#00ff00')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            await sendLogMessage(interaction.client, 'info', `Database backup created by ${interaction.user.tag}`);

        } catch (error) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Backup Failed')
                .setDescription(`Failed to create backup: ${error.message}`)
                .setColor('#ff0000');

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    /**
     * Handle System Stats Action
     */
    async handleSystemStats(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const { stdout: cpuInfo } = await execAsync('top -l 1 | grep "CPU usage"');
            const { stdout: memInfo } = await execAsync('top -l 1 | grep "PhysMem"');
            
            const uptime = process.uptime();
            const uptimeHours = Math.floor(uptime / 3600);
            const uptimeMinutes = Math.floor((uptime % 3600) / 60);

            const embed = new EmbedBuilder()
                .setTitle('📊 System Statistics')
                .addFields([
                    { name: 'Bot Uptime', value: `${uptimeHours}h ${uptimeMinutes}m`, inline: true },
                    { name: 'Memory Usage', value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`, inline: true },
                    { name: 'Node.js Version', value: process.version, inline: true },
                    { name: 'CPU Info', value: cpuInfo.trim(), inline: false },
                    { name: 'Memory Info', value: memInfo.trim(), inline: false }
                ])
                .setColor('#00bfff')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Stats Error')
                .setDescription(`Failed to retrieve system stats: ${error.message}`)
                .setColor('#ff0000');

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    /**
     * Handle Emergency Shutdown Action
     */
    async handleEmergencyShutdown(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🚨 Emergency Shutdown Initiated')
            .setDescription('Bot will shutdown immediately!')
            .setColor('#ff0000')
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        await sendLogMessage(interaction.client, 'error', `Emergency shutdown initiated by ${interaction.user.tag}`);

        process.exit(1);
    }

    /**
     * Handle Clear All Games Action
     */
    async handleClearAllGames(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const clearedGames = await clearActiveGame(null, true); // Clear all games

            const embed = new EmbedBuilder()
                .setTitle('🧹 All Games Cleared')
                .setDescription(`Successfully cleared ${clearedGames} active games.`)
                .setColor('#00ff00')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            await sendLogMessage(interaction.client, 'warn', `All active games cleared by ${interaction.user.tag}`);

        } catch (error) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Clear Games Failed')
                .setDescription(`Failed to clear games: ${error.message}`)
                .setColor('#ff0000');

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    /**
     * Process follow-up actions from user input
     */
    async processFollowUpAction(message) {
        const action = this.activeActions.get(message.author.id);
        if (!action || Date.now() - action.timestamp > 300000) { // 5 minute timeout
            return;
        }

        try {
            // Panel manager message content disabled - use modal/button interactions instead
            await message.reply('❌ Text-based panel commands disabled. Use `/panel` slash command with buttons and modals.');
            return;
            
            // Original message content code disabled:
            // const args = message.content.trim().split(' ');
            // switch (action.action) {
            //     case 'stop_game':
            //         if (args.length !== 1) {
            //             return message.reply('Invalid format. Use: `userID`');
            //         }
            //         await this.executeStopGame(message, args[0]);
            //         break;
            // }

            this.activeActions.delete(message.author.id);
        } catch (error) {
            logger.error(`Follow-up action error: ${error.message}`);
            message.reply(`Action failed: ${error.message}`);
        }
    }

    /**
     * Execute Add Money
     */
    async executeAddMoney(message, userId, amount) {
        if (isNaN(amount) || amount <= 0) {
            return message.reply('Invalid amount. Must be a positive number.');
        }

        try {
            const guildId = getGuildId(message.guild);
            await dbManager.updateUserBalance(userId, guildId, amount);

            const embed = new EmbedBuilder()
                .setTitle('💰 Money Added')
                .setDescription(`Successfully added ${fmt(amount)} to <@${userId}>'s balance.`)
                .setColor('#00ff00')
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await sendLogMessage(message.client, 'admin', `${message.author.tag} added ${fmt(amount)} to user ${userId}`);

        } catch (error) {
            throw new Error(`Failed to add money: ${error.message}`);
        }
    }

    /**
     * Execute Refund
     */
    async executeRefund(message, userId) {
        try {
            const guildId = getGuildId(message.guild);
            const userData = await dbManager.getUser(userId, guildId);
            
            if (!userData || !userData.lastTransaction) {
                return message.reply('No recent transaction found for this user.');
            }

            const refundAmount = Math.abs(userData.lastTransaction.amount);
            await dbManager.updateBalance(userId, guildId, refundAmount);

            const embed = new EmbedBuilder()
                .setTitle('↩️ Transaction Refunded')
                .setDescription(`Refunded ${fmt(refundAmount)} to <@${userId}>.`)
                .setColor('#00ff00')
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await sendLogMessage(message.client, 'admin', `${message.author.tag} refunded ${fmt(refundAmount)} to user ${userId}`);

        } catch (error) {
            throw new Error(`Failed to process refund: ${error.message}`);
        }
    }

    /**
     * Execute Stop Game
     */
    async executeStopGame(message, userId) {
        try {
            // Attempt to stop the runtime game if it's Word Chain
            try {
                const activeGames = getAllActiveGames();
                const g = activeGames.find(x => x.userId === userId);
                if (g && g.gameType === 'wordchain') {
                    const wc = require('../COMMANDS/wordchain');
                    if (wc && typeof wc.forceStop === 'function') {
                        await wc.forceStop(userId);
                    }
                }
            } catch (e) {
                // ignore
            }

            const cleared = await clearActiveGame(userId);
            
            const embed = new EmbedBuilder()
                .setTitle('🛑 Game Stopped')
                .setDescription(cleared ? 
                    `Successfully stopped active game for <@${userId}>.` : 
                    `No active game found for <@${userId}>.`)
                .setColor(cleared ? '#00ff00' : '#ffa500')
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            if (cleared) {
                await sendLogMessage(message.client, 'admin', `${message.author.tag} stopped game for user ${userId}`);
            }

        } catch (error) {
            throw new Error(`Failed to stop game: ${error.message}`);
        }
    }

    /**
     * Handle Refund User Select Menu
     */
    async handleRefundUserSelect(interaction) {
        try {
            const userId = interaction.values[0];
            
            // For now, we'll show a confirmation message
            // In a full implementation, this would query and refund the user's last transaction
            const embed = new EmbedBuilder()
                .setTitle('💸 Refund Processing')
                .setDescription(`Refund functionality for user <@${userId}> would be processed here.\n\n**Note:** Full refund functionality requires transaction history implementation.`)
                .setColor(0xFFA500)
                .setTimestamp();
                
            await interaction.update({ embeds: [embed], components: [] });
            
            // Log the action
            logger.info(`${interaction.user.tag} initiated refund process for user ${userId}`);
            await sendLogMessage(
                interaction.client, 
                'admin',
                `${interaction.user.tag} initiated refund process for user ${userId}`,
                interaction.user.id,
                interaction.guildId
            );
            
        } catch (error) {
            logger.error(`Error in handleRefundUserSelect: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Refund Error')
                .setDescription('An error occurred while processing the refund.')
                .setColor(0xFF0000);
                
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }

    /**
     * Handle Stop Game User Select Menu
     */
    async handleStopGameUserSelect(interaction) {
        try {
            const userId = interaction.values[0];
            const activeGames = getAllActiveGames();
            const userGame = activeGames.find(game => game.userId === userId);

            if (!userGame) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Game Not Found')
                    .setDescription('The selected user no longer has an active game.')
                    .setColor(0xFF0000);
                
                return await interaction.update({ embeds: [embed], components: [] });
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
                .setDescription(`Successfully stopped ${userGame.gameType} game for ${userName}.`)
                .setColor(0x00FF00)
                .setTimestamp();
            
            await interaction.update({ embeds: [embed], components: [] });
            
            logger.info(`${interaction.user.tag} stopped ${userGame.gameType} game for user ${userId}`);
            await sendLogMessage(
                interaction.client,
                'admin', 
                `${interaction.user.tag} stopped ${userGame.gameType} game for user ${userId}`,
                interaction.user.id,
                interaction.guildId
            );
            
        } catch (error) {
            logger.error(`Error in handleStopGameUserSelect: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Stop Game Error')
                .setDescription('An error occurred while stopping the game.')
                .setColor(0xFF0000);
                
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }

    /**
     * Handle Add Money Modal Submission
     */
    async handleAddMoneyModal(interaction) {
        try {
            const userId = interaction.fields.getTextInputValue('user_id');
            const amountStr = interaction.fields.getTextInputValue('amount');
            const amount = parseInt(amountStr);

            if (isNaN(amount) || amount <= 0) {
                return await interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setTitle('❌ Invalid Amount')
                        .setDescription('Please enter a valid positive number.')
                        .setColor('#ff0000')],
                    flags: MessageFlags.Ephemeral
                });
            }

            if (!/^\d{17,20}$/.test(userId)) {
                return await interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setTitle('❌ Invalid User ID')
                        .setDescription('Please enter a valid Discord user ID (17-20 digits).')
                        .setColor('#ff0000')],
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const guildId = getGuildId(interaction.guild);
            await dbManager.updateUserBalance(userId, guildId, amount);

            let userMention = `<@${userId}>`;
            try {
                const user = await interaction.client.users.fetch(userId);
                userMention = `${user.displayName} (<@${userId}>)`;
            } catch (error) {
                // Use fallback if user not found
            }

            const embed = new EmbedBuilder()
                .setTitle('💰 Money Added Successfully')
                .setDescription(`Added ${fmt(amount)} to ${userMention}'s balance.`)
                .setColor('#00ff00')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            await sendLogMessage(interaction.client, 'admin', `${interaction.user.tag} added ${fmt(amount)} to user ${userId}`);

        } catch (error) {
            logger.error(`Add money modal error: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Action Failed')
                .setDescription(`Failed to add money: ${error.message}`)
                .setColor('#ff0000');

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }

    /**
     * Handle button interactions for panels
     */
    async handleButtonInteraction(interaction) {
        const { customId } = interaction;

        try {
            switch (customId) {
                case 'confirm_restart_bot':
                    return await this.executeRestartBot(interaction);
                case 'cancel_restart_bot':
                    return await this.cancelRestartBot(interaction);
                case 'confirm_run_taxes':
                    return await this.handleTaxConfirmation(interaction, 'confirm');
                case 'cancel_run_taxes':
                    return await this.handleTaxConfirmation(interaction, 'cancel');
                case 'confirm_run_wealth_taxes':
                    return await this.handleWealthTaxConfirmation(interaction, 'confirm');
                case 'cancel_run_wealth_taxes':
                    return await this.handleWealthTaxConfirmation(interaction, 'cancel');
                default:
                    logger.warn(`Unknown panel button interaction: ${customId}`);
                    return;
            }
        } catch (error) {
            logger.error(`Panel button interaction error: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Action Failed')
                .setDescription(`Failed to process action: ${error.message}`)
                .setColor('#ff0000');

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }

    /**
     * Execute bot restart after confirmation
     */
    async executeRestartBot(interaction) {
        if (!this.isDeveloper(interaction.user.id)) {
            return await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('❌ Access Denied')
                    .setDescription('You do not have developer permissions.')
                    .setColor('#ff0000')],
                flags: MessageFlags.Ephemeral
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🔄 Bot Restart In Progress')
            .setDescription('✅ Restart confirmed! Bot will restart in 5 seconds...\n\n🔄 **Status**: Shutting down gracefully\n⏱️ **ETA**: 5 seconds')
            .setColor('#ff0000')
            .setTimestamp();

        await interaction.update({ embeds: [embed], components: [] });
        await sendLogMessage(interaction.client, 'warn', `Bot restart confirmed and executed by ${interaction.user.tag}`);

        // Gracefully shutdown
        setTimeout(() => {
            process.exit(0);
        }, 5000);
    }

    /**
     * Cancel bot restart
     */
    async cancelRestartBot(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Restart Cancelled')
            .setDescription('Bot restart has been cancelled. No action was taken.')
            .setColor('#00ff00')
            .setTimestamp();

        await interaction.update({ embeds: [embed], components: [] });
        logger.info(`Bot restart cancelled by ${interaction.user.tag}`);
    }

    /**
     * Handle Active Games Status Action
     */
    async handleActiveGamesStatus(interaction) {
        try {
            const gracefulShutdown = require('./gracefulShutdown');
            const statusMessage = await gracefulShutdown.getStatusMessage();
            const activeGamesSummary = await gracefulShutdown.getActiveGamesSummary();

            const embed = new EmbedBuilder()
                .setTitle('🎮 Active Games Status')
                .setDescription(statusMessage)
                .addFields([
                    { name: 'Legacy Games', value: activeGamesSummary.legacyGames.length.toString(), inline: true },
                    { name: 'Session Games', value: activeGamesSummary.sessionGames.length.toString(), inline: true },
                    { name: 'Total Active', value: activeGamesSummary.totalCount.toString(), inline: true }
                ])
                .setColor(activeGamesSummary.totalCount > 0 ? '#FFA500' : '#00FF00')
                .setTimestamp();

            if (activeGamesSummary.totalCount > 0) {
                embed.addFields({
                    name: '💡 Restart Options',
                    value: '• Use **VPS Controls** → **Pull & Restart** for graceful restart\n• System will wait up to 5 minutes for games to complete\n• Games will be forced to stop if timeout exceeded',
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '✅ Ready for Restart',
                    value: 'No active games found - safe to restart anytime',
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Status Check Failed')
                .setDescription(`Failed to check active games: ${error.message}`)
                .setColor('#ff0000');

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    /**
     * Handle Tax Status Check Action (DISABLED)
     */
    async handleTaxStatus(interaction) {
        try {
            // Inactivity tax system has been disabled
            const disabledEmbed = new EmbedBuilder()
                .setTitle('💸 Inactivity Tax System')
                .setDescription('The inactivity tax system has been disabled.\n\nUsers will no longer be taxed for inactivity.')
                .setColor('#00FF00')
                .addFields({
                    name: '📋 Status',
                    value: '**DISABLED** - No taxes will be collected',
                    inline: false
                });
            
            await interaction.editReply({ embeds: [disabledEmbed] });

        } catch (error) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Tax Status Check Failed')
                .setDescription(`Failed to check tax status: ${error.message}`)
                .setColor('#ff0000');

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    /**
     * Handle Run Taxes Action (DISABLED)
     */
    async handleRunTaxes(interaction) {
        try {
            // Inactivity tax system has been disabled
            const disabledEmbed = new EmbedBuilder()
                .setTitle('💸 Inactivity Tax System')
                .setDescription('The inactivity tax system has been disabled.\n\nNo taxes can be run or collected.')
                .setColor('#00FF00')
                .addFields({
                    name: '📋 Status',
                    value: '**DISABLED** - Tax collection is not available',
                    inline: false
                });
            
            await interaction.editReply({ embeds: [disabledEmbed] });
            return; // Tax system disabled - exit function

            // OLD CODE - Tax system disabled
            // Show confirmation message
            const confirmEmbed = new EmbedBuilder()
                .setTitle('🏛️ Run Inactivity Taxes')
                .setDescription('⚠️ **WARNING**: This will tax all inactive users (3+ days)\n\nAre you sure you want to proceed?')
                .addFields([
                    { name: 'What happens:', value: '• Users inactive 3+ days get taxed\n• Higher tiers = higher tax rates (1%-6%)\n• Developer account is exempt\n• Minimum $1,000 balance required', inline: false },
                    { name: 'Tax Rates:', value: 'Bronze: 1% | Silver: 1.5% | Gold: 2%\nPlatinum: 3% | Diamond: 4%\nLegendary: 5% | Mythic: 6%', inline: false }
                ])
                .setColor('#FF6600')
                .setFooter({ text: 'This action cannot be undone!' });

            const confirmButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm_run_taxes')
                        .setLabel('✅ Run Taxes')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('cancel_run_taxes')
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.editReply({ embeds: [confirmEmbed], components: [confirmButton] });

        } catch (error) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Tax Setup Failed')
                .setDescription(`Failed to setup tax run: ${error.message}`)
                .setColor('#ff0000');

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    /**
     * Handle Tax Confirmation
     */
    async handleTaxConfirmation(interaction, action) {
        try {
            if (action === 'cancel') {
                const cancelEmbed = new EmbedBuilder()
                    .setTitle('❌ Tax Run Cancelled')
                    .setDescription('Inactivity tax processing has been cancelled.')
                    .setColor('#FFA500');

                await interaction.update({ embeds: [cancelEmbed], components: [] });
                return;
            }

            // Show processing message
            const processingEmbed = new EmbedBuilder()
                .setTitle('🏛️ Processing Inactivity Taxes...')
                .setDescription('Analyzing all users and applying taxes to inactive accounts...\n\n⏳ This may take a few moments...')
                .setColor('#FFA500');

            await interaction.update({ embeds: [processingEmbed], components: [] });

            // Run the actual tax process
            const inactivityTax = require('./inactivityTax');
            const guildId = interaction.guildId;
            
            const result = await inactivityTax.processInactivityTaxes(guildId, interaction.client);

            let embed;
            if (result.success) {
                let description = `**✅ Tax Processing Complete**\n\n`;
                description += `• Users Processed: ${result.usersProcessed}\n`;
                description += `• Users Taxed: ${result.usersTaxed}\n`;
                description += `• Total Revenue: ${fmt(result.totalTaxCollected)}\n`;
                description += `• Processing Time: ${Math.round(result.processingTime/1000)}s\n\n`;

                if (result.usersTaxed === 0) {
                    description += `🎉 No inactive users found - everyone is actively playing!`;
                } else {
                    description += `💰 ${fmt(result.totalTaxCollected)} collected from inactive players.`;
                }

                embed = new EmbedBuilder()
                    .setTitle('🏛️ Inactivity Tax Collection Complete')
                    .setDescription(description)
                    .setColor('#00FF00')
                    .setTimestamp();
            } else {
                embed = new EmbedBuilder()
                    .setTitle('❌ Tax Processing Failed')
                    .setDescription(`Error: ${result.error}`)
                    .setColor('#FF0000');
            }

            await interaction.editReply({ embeds: [embed], components: [] });
            await sendLogMessage(interaction.client, 'info', `Inactivity taxes processed by ${interaction.user.tag}: ${result.usersTaxed} users taxed for ${fmt(result.totalTaxCollected || 0)}`, interaction.user.id, guildId);

        } catch (error) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Tax Processing Error')
                .setDescription(`Failed to process taxes: ${error.message}`)
                .setColor('#ff0000');

            await interaction.editReply({ embeds: [errorEmbed], components: [] });
            logger.error(`Tax processing error: ${error.message}`);
        }
    }

    /**
     * Handle Wealth Tax Status Check Action
     */
    async handleWealthTaxStatus(interaction) {
        try {
            // wealthTax system removed - using bulletproof economy
            const guildId = interaction.guildId;
            
            // Show loading message
            const loadingEmbed = new EmbedBuilder()
                .setTitle('💎 Checking Wealth Tax Status...')
                .setDescription('Analyzing wealthy users and high-stakes gambling activity...')
                .setColor('#FFA500');
            
            await interaction.editReply({ embeds: [loadingEmbed] });

            // Return message that wealth tax system has been replaced
            const embed = new EmbedBuilder()
                .setTitle('💰 Wealth Control Status')
                .setDescription('The old wealth tax system has been replaced with the **Bulletproof Economy System**.\n\nWealth control is now handled automatically through:\n• Dynamic house edge adjustment\n• AI risk management\n• Intelligent payout optimization')
                .setColor('#00FF00');
                
            return await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Wealth Tax Status Check Failed')
                .setDescription(`Failed to check wealth tax status: ${error.message}`)
                .setColor('#ff0000');

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    /**
     * Handle Run Wealth Taxes Action
     */
    async handleRunWealthTaxes(interaction) {
        try {
            // Return message that wealth tax system has been replaced
            const embed = new EmbedBuilder()
                .setTitle('💰 Wealth Tax System Removed')
                .setDescription('The old wealth tax system has been completely replaced with the **Bulletproof Economy System**.\n\nWealth control is now handled automatically and in real-time through:\n• Dynamic house edge adjustment\n• AI-powered risk management\n• Intelligent payout optimization\n\nNo manual wealth tax processing is needed anymore!')
                .setColor('#00FF00');
                
            await interaction.editReply({ embeds: [embed], components: [] });

        } catch (error) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`An error occurred: ${error.message}`)
                .setColor('#ff0000');

            await interaction.editReply({ embeds: [errorEmbed], components: [] });
        }
    }
}

module.exports = new PanelManager();
