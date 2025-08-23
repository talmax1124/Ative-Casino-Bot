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
                    label: 'Stop Game',
                    description: 'Force stop an active game for a user',
                    value: 'stop_game',
                    emoji: '🛑'
                },
                {
                    label: 'Restart Bot',
                    description: 'Restart the bot with updated code',
                    value: 'restart_bot',
                    emoji: '🔄'
                },
                {
                    label: 'Database Backup',
                    description: 'Create a backup of the database',
                    value: 'db_backup',
                    emoji: '💾'
                },
                {
                    label: 'View System Stats',
                    description: 'Display bot performance metrics',
                    value: 'system_stats',
                    emoji: '📊'
                },
                {
                    label: 'Emergency Shutdown',
                    description: 'Immediately shutdown the bot',
                    value: 'emergency_shutdown',
                    emoji: '🚨'
                },
                {
                    label: 'Clear All Games',
                    description: 'Force clear all active games',
                    value: 'clear_all_games',
                    emoji: '🧹'
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
                case 'add_money':
                    return await this.handleAddMoney(interaction);
                case 'refund':
                    return await this.handleRefund(interaction);
                case 'stop_game':
                    return await this.handleStopGame(interaction);
                case 'restart_bot':
                    return await this.handleRestartBot(interaction);
                case 'db_backup':
                    return await this.handleDatabaseBackup(interaction);
                case 'system_stats':
                    return await this.handleSystemStats(interaction);
                case 'emergency_shutdown':
                    return await this.handleEmergencyShutdown(interaction);
                case 'clear_all_games':
                    return await this.handleClearAllGames(interaction);
                default:
                    throw new Error(`Unknown action: ${action}`);
            }
        } catch (error) {
            logger.error(`Developer panel action error: ${error.message}`);
            await sendLogMessage(interaction.client, `Developer panel error: ${error.message}`);
            
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
     * Handle Add Money Action
     */
    async handleAddMoney(interaction) {
        await interaction.reply({
            content: 'Please provide the user ID and amount (format: `userID amount`):',
            flags: MessageFlags.Ephemeral
        });

        // Store action state for follow-up
        this.activeActions.set(interaction.user.id, {
            action: 'add_money',
            channelId: interaction.channelId,
            timestamp: Date.now()
        });
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
        const embed = new EmbedBuilder()
            .setTitle('🔄 Bot Restart Initiated')
            .setDescription('The bot will restart with updated code in 5 seconds...')
            .setColor('#ffa500')
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        await sendLogMessage(interaction.client, `Bot restart initiated by ${interaction.user.tag}`);

        setTimeout(() => {
            process.exit(0);
        }, 5000);
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
            await sendLogMessage(interaction.client, `Database backup created by ${interaction.user.tag}`);

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
        await sendLogMessage(interaction.client, `Emergency shutdown initiated by ${interaction.user.tag}`);

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
            await sendLogMessage(interaction.client, `All active games cleared by ${interaction.user.tag}`);

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
            const args = message.content.trim().split(' ');

            switch (action.action) {
                case 'add_money':
                    if (args.length !== 2) {
                        return message.reply('Invalid format. Use: `userID amount`');
                    }
                    await this.executeAddMoney(message, args[0], parseInt(args[1]));
                    break;

                case 'refund':
                    if (args.length !== 1) {
                        return message.reply('Invalid format. Use: `userID`');
                    }
                    await this.executeRefund(message, args[0]);
                    break;

                case 'stop_game':
                    if (args.length !== 1) {
                        return message.reply('Invalid format. Use: `userID`');
                    }
                    await this.executeStopGame(message, args[0]);
                    break;
            }

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
            await dbManager.updateBalance(userId, guildId, amount);

            const embed = new EmbedBuilder()
                .setTitle('💰 Money Added')
                .setDescription(`Successfully added ${fmt(amount)} to <@${userId}>'s balance.`)
                .setColor('#00ff00')
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await sendLogMessage(message.client, `${message.author.tag} added ${fmt(amount)} to user ${userId}`);

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
            await sendLogMessage(message.client, `${message.author.tag} refunded ${fmt(refundAmount)} to user ${userId}`);

        } catch (error) {
            throw new Error(`Failed to process refund: ${error.message}`);
        }
    }

    /**
     * Execute Stop Game
     */
    async executeStopGame(message, userId) {
        try {
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
                await sendLogMessage(message.client, `${message.author.tag} stopped game for user ${userId}`);
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
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
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
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
}

module.exports = new PanelManager();