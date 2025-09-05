/**
 * ATIVE Casino Bot - Main Entry Point
 * Professional Discord casino bot built with JavaScript
 */

const { Client, GatewayIntentBits, Collection, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const logger = require('./UTILS/logger');
const dbManager = require('./UTILS/database');
// Economy analyzer moved to UAS bot
// Removed Firebase-dependent modules: economyMonitor, sessionManager
const { sendLogMessage } = require('./UTILS/common');
const panelManager = require('./UTILS/panelManager');
const SafeInteractionHandler = require('./UTILS/interactionHandler');
const { LotteryGame } = require('./GAMES/lottery');
const ScratchTicketSystem = require('./GAMES/scratchTickets');
const storageMonitor = require('./UTILS/storageMonitor');
// Leveling system moved to UAS bot
// Removed: const serverProducts = require('./UTILS/serverProducts'); // Web-based purchases now

// Bot configuration
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ENVIRONMENT = process.env.ENVIRONMENT || 'development';
const ANNOUNCE_CHANNEL_ID = process.env.ANNOUNCE_CHANNEL_ID;
const LOG_CHANNEL_ID = '1405096821512212521'; // General bot activity log channel

// Validation
if (!TOKEN) {
    throw new Error('DISCORD_TOKEN is missing. Put it in a .env file or environment variable.');
}

// Environment info
const IS_PRODUCTION = ENVIRONMENT === 'production';
const IS_DEVELOPMENT = ENVIRONMENT === 'development';

logger.info(`Starting ATIVE Casino Bot in ${ENVIRONMENT.toUpperCase()} mode`);

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Set start time for uptime tracking
client.startTime = Date.now();

// Commands collection
client.commands = new Collection();

// Load commands from COMMANDS folder
async function loadCommands() {
    const commandsPath = path.join(__dirname, 'COMMANDS');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    const commands = [];

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            commands.push(command.data.toJSON());
            logger.info(`Loaded command: ${command.data.name}`);

            // Handle special case for dev.js which has multiple commands
            if (file === 'dev.js') {
                // Load additional commands from dev module
                if (command.reloadCommand && command.reloadCommand.data) {
                    client.commands.set(command.reloadCommand.data.name, command.reloadCommand);
                    commands.push(command.reloadCommand.data.toJSON());
                    logger.info(`Loaded command: ${command.reloadCommand.data.name}`);
                }
                if (command.logsCommand && command.logsCommand.data) {
                    client.commands.set(command.logsCommand.data.name, command.logsCommand);
                    commands.push(command.logsCommand.data.toJSON());
                    logger.info(`Loaded command: ${command.logsCommand.data.name}`);
                }
                if (command.stopCrashCommand && command.stopCrashCommand.data) {
                    // Skip loading stopcrash from dev.js since it exists as a separate file
                    if (command.stopCrashCommand.data.name !== 'stopcrash') {
                        client.commands.set(command.stopCrashCommand.data.name, command.stopCrashCommand);
                        commands.push(command.stopCrashCommand.data.toJSON());
                        logger.info(`Loaded command: ${command.stopCrashCommand.data.name}`);
                    }
                }
                if (command.cogCommand && command.cogCommand.data) {
                    client.commands.set(command.cogCommand.data.name, command.cogCommand);
                    commands.push(command.cogCommand.data.toJSON());
                    logger.info(`Loaded command: ${command.cogCommand.data.name}`);
                }
            }

            // Handle special case for general.js which has multiple commands
            if (file === 'general.js') {
                // Load additional commands from general module
                if (command.profileCommand && command.profileCommand.data) {
                    client.commands.set(command.profileCommand.data.name, command.profileCommand);
                    commands.push(command.profileCommand.data.toJSON());
                    logger.info(`Loaded command: ${command.profileCommand.data.name}`);
                }
                if (command.leaderboardCommand && command.leaderboardCommand.data) {
                    client.commands.set(command.leaderboardCommand.data.name, command.leaderboardCommand);
                    commands.push(command.leaderboardCommand.data.toJSON());
                    logger.info(`Loaded command: ${command.leaderboardCommand.data.name}`);
                }
                if (command.testXpCommand && command.testXpCommand.data) {
                    client.commands.set(command.testXpCommand.data.name, command.testXpCommand);
                    commands.push(command.testXpCommand.data.toJSON());
                    logger.info(`Loaded command: ${command.testXpCommand.data.name}`);
                }
                if (command.setXpCommand && command.setXpCommand.data) {
                    client.commands.set(command.setXpCommand.data.name, command.setXpCommand);
                    commands.push(command.setXpCommand.data.toJSON());
                    logger.info(`Loaded command: ${command.setXpCommand.data.name}`);
                }
                if (command.debugXpCommand && command.debugXpCommand.data) {
                    client.commands.set(command.debugXpCommand.data.name, command.debugXpCommand);
                    commands.push(command.debugXpCommand.data.toJSON());
                    logger.info(`Loaded command: ${command.debugXpCommand.data.name}`);
                }
                if (command.fixXpCommand && command.fixXpCommand.data) {
                    client.commands.set(command.fixXpCommand.data.name, command.fixXpCommand);
                    commands.push(command.fixXpCommand.data.toJSON());
                    logger.info(`Loaded command: ${command.fixXpCommand.data.name}`);
                }
            }

            // Handle special case for admin.js which has multiple commands
            if (file === 'admin.js') {
                // Load additional commands from admin module
                // SetMoney command removed - functionality available via editmoney
                // Backup command removed - functionality moved to developer panel
                if (command.drawLotteryCommand && command.drawLotteryCommand.data) {
                    client.commands.set(command.drawLotteryCommand.data.name, command.drawLotteryCommand);
                    commands.push(command.drawLotteryCommand.data.toJSON());
                    logger.info(`Loaded command: ${command.drawLotteryCommand.data.name}`);
                }
                if (command.portalAnnouncementCommand && command.portalAnnouncementCommand.data) {
                    client.commands.set(command.portalAnnouncementCommand.data.name, command.portalAnnouncementCommand);
                    commands.push(command.portalAnnouncementCommand.data.toJSON());
                    logger.info(`Loaded command: ${command.portalAnnouncementCommand.data.name}`);
                }
                if (command.portalCommand && command.portalCommand.data) {
                    client.commands.set(command.portalCommand.data.name, command.portalCommand);
                    commands.push(command.portalCommand.data.toJSON());
                    logger.info(`Loaded command: ${command.portalCommand.data.name}`);
                }
            }
        } else {
            logger.warn(`Command at ${filePath} is missing required "data" or "execute" property`);
        }
    }

    return commands;
}

// Register slash commands
async function registerCommands(commands) {
    if (!CLIENT_ID) {
        logger.warn('CLIENT_ID not provided, skipping command registration');
        return;
    }

    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        logger.info('Started refreshing application (/) commands');

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );

        logger.info(`Successfully reloaded ${commands.length} application (/) commands`);
    } catch (error) {
        logger.error('Failed to register commands:', error);
    }
}

// Send startup notification
async function sendStartupNotification() {
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for bot to be ready

    try {
        const startupType = '🚀 ATIVE Casino Bot Started';
        const commandCount = client.commands.size;

        const embedDescription = `**Type**: ${startupType}\n` +
            `**Environment**: ${ENVIRONMENT.toUpperCase()}\n` +
            `**Bot User**: ${client.user} (\`${client.user.id}\`)\n` +
            `**Commands Loaded**: ${commandCount}\n` +
            `**Language**: JavaScript/Node.js\n` +
            `**Features**: Casino Games, Economy, Admin Tools`;

        await sendLogMessage(
            client,
            'info',
            `✅ **ATIVE Casino Bot Started Successfully**\n${embedDescription}`,
            null
        );

        logger.info('Startup notification sent successfully');
    } catch (error) {
        logger.error(`Failed to send startup notification: ${error.message}`);
    }
}

/**
 * Handle lottery button interactions
 */
async function handleLotteryButtons(interaction, customId) {
    const lotteryCommand = client.commands.get('lottery');
    if (!lotteryCommand) {
        await interaction.reply({ content: 'Lottery system not available.', ephemeral: true });
        return;
    }

    const userId = interaction.user.id;
    const guildId = interaction.guildId || 'global';

    try {
        switch (customId) {
            case 'lottery_buy':
            case 'lottery_buy_panel':
            case 'lottery_buy_new_week':
                // Show modal for ticket count input
                const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

                const modal = new ModalBuilder()
                    .setCustomId('lottery_buy_modal')
                    .setTitle('🎫 Buy Lottery Tickets');

                const ticketInput = new TextInputBuilder()
                    .setCustomId('ticket_count')
                    .setLabel('Number of tickets (1-7)')
                    .setStyle(TextInputStyle.Short)
                    .setMinLength(1)
                    .setMaxLength(1)
                    .setPlaceholder('Enter number between 1-7')
                    .setRequired(true);

                const firstActionRow = new ActionRowBuilder().addComponents(ticketInput);
                modal.addComponents(firstActionRow);

                await interaction.showModal(modal);
                break;

            case 'lottery_status':
            case 'lottery_status_panel':
            case 'lottery_status_new_week':
                await lotteryCommand.showPlayerLotteryStatus(interaction, userId, guildId);
                break;

            case 'lottery_help':
            case 'lottery_help_panel':
                const helpEmbed = new EmbedBuilder()
                    .setTitle('🎫 Lottery Help')
                    .setColor(0xFFD700)
                    .setDescription('**How the Weekly Lottery Works**')
                    .addFields(
                        {
                            name: '🎟️ Buying Tickets',
                            value: '• Use `/lottery buy [count]` or click "Buy Tickets"\n• Each ticket costs **$12,000**\n• Maximum **7 tickets** per person per week\n• More tickets = higher chance to win!',
                            inline: false
                        },
                        {
                            name: '🏆 Prize Distribution',
                            value: '• **1st Place:** 45% of total prize pool\n• **2nd Place:** 45% of total prize pool\n• **3rd Place:** 10% of total prize pool\n• Three winners guaranteed every week!',
                            inline: false
                        },
                        {
                            name: '📅 Drawing Schedule',
                            value: '• Every **Sunday at 10 AM EST**\n• Automatic drawings with instant payouts\n• Prizes go directly to your **BANK** account\n• New lottery week starts immediately after',
                            inline: false
                        },
                        {
                            name: '💰 Prize Pool Growth',
                            value: '• **Base:** $400,000 every week\n• **Money Transfer Tax:** 5% of all `/sendmoney` transfers\n• **Rollover:** If pot exceeds $400M, drawing happens immediately\n• **No Winners:** Prize rolls over to next week',
                            inline: false
                        },
                        {
                            name: '📋 Useful Commands',
                            value: '`/lottery status` - Check your tickets and current prize pool\n`/lottery buy [count]` - Purchase 1-7 lottery tickets\n`/balance` - Check your wallet and bank balance\n`/sendmoney [user] [amount]` - Send money (5% tax helps lottery pool)',
                            inline: false
                        }
                    )
                    .setFooter({ text: '🍀 Good luck! May the odds be in your favor!' })
                    .setTimestamp();

                await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
                break;

            default:
                await interaction.reply({ content: 'Unknown lottery action.', ephemeral: true });
        }
    } catch (error) {
        logger.error(`Error handling lottery button ${customId}: ${error.message}`);
        await interaction.reply({
            content: 'An error occurred while processing your lottery request.',
            ephemeral: true
        });
    }
}

// Event handlers
client.once('clientReady', async () => {
    logger.info(`ATIVE Casino Bot logged in as ${client.user.tag} (ID: ${client.user.id})`);
    
    // Set custom activity status
    client.user.setActivity("you lose 😂", { type: 'WATCHING' });
    logger.info('Bot activity status set');

    // Initialize database
    try {
        await dbManager.initialize();
        logger.info('Database initialized successfully');
        
        // Economy analyzer moved to UAS bot
        logger.info('Economy system now managed by UAS bot');
        
        // Initialize server products database table
        // Removed: serverProducts initialization - using web-based purchases now
        logger.info('Server products system initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize database and economy systems:', error);
        process.exit(1);
    }

    // Load and register commands
    try {
        const commands = await loadCommands();
        await registerCommands(commands);
        logger.info(`Loaded ${commands.length} commands`);
    } catch (error) {
        logger.error('Failed to load commands:', error);
    }

    // Initialize lottery system
    try {
        client.lotteryGame = new LotteryGame(client);
        await client.lotteryGame.initialize();
        logger.info('Lottery system initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize lottery system:', error);
    }

    // Initialize scratch ticket system
    try {
        client.scratchTicketSystem = new ScratchTicketSystem(client);
        await client.scratchTicketSystem.initialize();
        logger.info('Scratch ticket system initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize scratch ticket system:', error);
    }

    // Initialize Economy Monitor
    try {
        // economyMonitor removed (Firebase dependency)
        logger.info('Economy Monitor initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize Economy Monitor:', error);
    }

    // Initialize Session Manager
    try {
        // sessionManager removed (Firebase dependency)
        logger.info('Session Manager initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize Session Manager:', error);
    }

    // Initialize Storage Monitor
    try {
        storageMonitor.startMonitoring(client);
        logger.info('Storage monitoring initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize storage monitor:', error);
    }

    // Send startup notification
    setTimeout(sendStartupNotification, 1000);

    // Send online announcement to logs channel (ONLY in development)
    if (IS_DEVELOPMENT) {
        try {
            const logsChannel = await client.channels.fetch('1405096821512212521');
            if (logsChannel) {
                await logsChannel.send('🎰 ATIVE Casino Bot is now online in DEVELOPMENT mode! Use `/help` to see commands.');
                logger.info('Sent development announcement to logs channel');
            }
        } catch (error) {
            logger.warn(`Failed to send online message to logs: ${error.message}`);
        }
    } else if (IS_PRODUCTION) {
        logger.info('Running in production mode - no announcement message');
    }

    // Start announcement processor
    startAnnouncementProcessor();
});

// Announcement processor disabled (Firebase dependency removed)
async function startAnnouncementProcessor() {
    logger.info('Announcement processor disabled (Firebase dependency removed)');
    // No-op function - announcement processing removed with Firebase
}

// Premium role assignment disabled (Firebase dependency removed)
async function handlePremiumRoleAssignment(userId) {
    logger.info('Premium role assignment disabled (Firebase dependency removed)');
    // No-op function - premium role assignment removed with Firebase
}

client.on('interactionCreate', async interaction => {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            logger.warn(`No command matching ${interaction.commandName} was found`);
            return;
        }

        // Command disabling functionality moved to developer panel
        // (commented out since devModule was removed)

        try {
            await command.execute(interaction);
        } catch (error) {
            // Skip logging for expired interactions
            if (error.code === 10062) {
                logger.debug(`Command interaction expired: ${interaction.commandName}`);
                return;
            }
            
            logger.error(`Error executing command ${interaction.commandName}:`, error);

            // Send error log to designated channel
            try {
                await sendLogMessage(
                    client,
                    'error',
                    `**Command Error:** \`/${interaction.commandName}\`\n` +
                    `**User:** ${interaction.user} (\`${interaction.user.id}\`)\n` +
                    `**Error:** \`${error.name}: ${error.message}\`\n` +
                    `**Channel:** ${interaction.channel}`,
                    interaction.user.id,
                    interaction.guildId
                );
            } catch (logError) {
                logger.error(`Failed to send error log: ${logError.message}`);
            }

            // Send user-friendly error message using safe handler
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Command Error')
                .setDescription('An error occurred while processing your command. The administrators have been notified.')
                .setColor(0xFF0000)
                .setTimestamp();

            await SafeInteractionHandler.safeReply(interaction, { 
                embeds: [errorEmbed], 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
    // Handle modal submissions
    else if (interaction.isModalSubmit()) {
        try {
            if (interaction.customId === 'lottery_buy_modal') {
                const ticketCountStr = interaction.fields.getTextInputValue('ticket_count');
                const ticketCount = parseInt(ticketCountStr);

                // Validate input
                if (isNaN(ticketCount) || ticketCount < 1 || ticketCount > 7) {
                    await interaction.reply({
                        content: '❌ Invalid ticket count! Please enter a number between 1 and 7.',
                        ephemeral: true
                    });
                    return;
                }

                // Execute lottery buy command
                const lotteryCommand = client.commands.get('lottery');
                if (lotteryCommand) {
                    // Simulate the options for handleBuyTickets
                    const mockInteraction = {
                        ...interaction,
                        options: {
                            getInteger: (name) => {
                                if (name === 'count') return ticketCount;
                                return null;
                            }
                        }
                    };

                    // Use the purchaselottery command instead
                    const purchaseCommand = client.commands.get('purchaselottery');
                    if (purchaseCommand) {
                        const purchaseMockInteraction = {
                            ...interaction,
                            options: {
                                getInteger: (name) => {
                                    if (name === 'count') return ticketCount;
                                    return null;
                                }
                            }
                        };
                        await purchaseCommand.execute(purchaseMockInteraction);
                    } else {
                        throw new Error('Purchase lottery command not found');
                    }
                } else {
                    await interaction.reply({
                        content: '❌ Lottery system not available.',
                        ephemeral: true
                    });
                }
            }
            // Handle crash bet modal centrally
            else if (interaction.customId === 'crash_bet_modal') {
                const crashGame = require('./GAMES/crash');
                const game = crashGame.crashManager.getGame(interaction.channelId);
                if (game) {
                    logger.info(`Crash modal submit - gameKey: ${game.gameKey}, current players: ${game.players.size}`);
                    await crashGame.handleModalSubmit(interaction, client, game);
                } else {
                    logger.error(`No crash game found for modal submit in channel ${interaction.channelId}`);
                    await interaction.reply({ content: '❌ Game session expired. Please start a new game.', ephemeral: true });
                }
            }
            // stopmysession confirmation modal
            else if (interaction.customId.startsWith('stopmysession_confirm')) {
                const cmd = client.commands.get('stopmysession');
                if (cmd && cmd.handleConfirmModal) {
                    await cmd.handleConfirmModal(interaction);
                }
            }
            // Handle bingo join modal
            else if (interaction.customId === 'bingo_join_modal') {
                const bingoCommand = client.commands.get('bingo');
                if (bingoCommand && bingoCommand.handleJoinModal) {
                    await bingoCommand.handleJoinModal(interaction);
                }
            }
            // Handle uno join modal
            else if (interaction.customId === 'uno_join_modal') {
                const unoCommand = client.commands.get('uno');
                if (unoCommand && unoCommand.handleJoinModal) {
                    await unoCommand.handleJoinModal(interaction);
                }
            }
            // Battleship modals
            else if (interaction.customId === 'battleship_place_modal' || interaction.customId.startsWith('battleship_attack_modal_')) {
                const battleshipCommand = client.commands.get('battleship');
                if (battleshipCommand && battleshipCommand.handleModal) {
                    await battleshipCommand.handleModal(interaction);
                }
            }
            // Panel system modals
            else if (interaction.customId === 'add_money_modal') {
                await panelManager.handleAddMoneyModal(interaction);
            }
            else if (interaction.customId === 'view_balance_modal') {
                const panelCommand = client.commands.get('panel');
                if (panelCommand && panelCommand.handleViewBalanceModal) {
                    await panelCommand.handleViewBalanceModal(interaction);
                }
            }
            else if (interaction.customId === 'reset_balance_modal') {
                const panelCommand = client.commands.get('panel');
                if (panelCommand && panelCommand.handleResetBalanceModal) {
                    await panelCommand.handleResetBalanceModal(interaction);
                }
            }
            else if (interaction.customId === 'check_user_games_modal') {
                const panelCommand = client.commands.get('panel');
                if (panelCommand && panelCommand.handleCheckUserGamesModal) {
                    await panelCommand.handleCheckUserGamesModal(interaction);
                }
            }
            else if (interaction.customId === 'issue_warning_modal') {
                const panelCommand = client.commands.get('panel');
                if (panelCommand && panelCommand.handleIssueWarningModal) {
                    await panelCommand.handleIssueWarningModal(interaction);
                }
            }
            else if (interaction.customId === 'temp_game_ban_modal') {
                const panelCommand = client.commands.get('panel');
                if (panelCommand && panelCommand.handleTempGameBanModal) {
                    await panelCommand.handleTempGameBanModal(interaction);
                }
            }
            // Release command modals
            else if (interaction.customId === 'confirm_release_all') {
                const releaseCommand = client.commands.get('release');
                if (releaseCommand && releaseCommand.handleReleaseConfirmationModal) {
                    await releaseCommand.handleReleaseConfirmationModal(interaction);
                }
            }
            else if (interaction.customId === 'confirm_emergency_clear') {
                const releaseCommand = client.commands.get('release');
                if (releaseCommand && releaseCommand.handleEmergencyClearModal) {
                    await releaseCommand.handleEmergencyClearModal(interaction);
                }
            }
        } catch (error) {
            logger.error(`Error handling modal ${interaction.customId}: ${error.message}`);

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Modal Error')
                .setDescription('An error occurred while processing your submission.')
                .setColor(0xFF0000);

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
    // Handle select menu interactions
    else if (interaction.isStringSelectMenu()) {
        try {
            // Check if interaction has expired
            if (!SafeInteractionHandler.isValid(interaction)) {
                logger.debug(`Select menu interaction expired: ${interaction.customId}`);
                return;
            }
            // Handle setup wizard select menus
            if (interaction.customId.startsWith('setup_')) {
                const { SetupInteractionHandler } = require('./UTILS/setupInteractionHandler');
                await SetupInteractionHandler.handleSetupInteraction(interaction);
            }
            // Check if this is a panel-related select menu
            else if (interaction.customId.includes('panel_action')) {
                const panelCommand = client.commands.get('panel');
                if (panelCommand && panelCommand.handleSelectMenu) {
                    await panelCommand.handleSelectMenu(interaction);
                }
            }
            // Handle blackjack bet selection dropdown
            else if (interaction.customId === 'blackjack_bet_select') {
                const blackjackCommand = client.commands.get('blackjack');
                if (blackjackCommand) {
                    const betAmount = parseInt(interaction.values[0].replace('play_again_', ''));
                    await blackjackCommand.startNewGame(interaction, betAmount);
                }
            }
            // Handle roulette bet selection dropdown (for play again)
            else if (interaction.customId === 'roulette_bet_select') {
                const rouletteCommand = client.commands.get('roulette');
                if (rouletteCommand) {
                    const betAmount = parseInt(interaction.values[0].replace('play_again_', ''));
                    await rouletteCommand.startNewGame(interaction, betAmount);
                }
            }
            // Handle roulette number selection dropdown
            else if (interaction.customId.startsWith('roulette-') && interaction.customId.includes('-number-select')) {
                const parts = interaction.customId.split('-');
                if (parts.length >= 3) {
                    const userId = parts[1];
                    
                    // Verify the user is the game owner
                    if (userId === interaction.user.id) {
                        const rouletteCommand = client.commands.get('roulette');
                        if (rouletteCommand && rouletteCommand.handleNumberSelect) {
                            await rouletteCommand.handleNumberSelect(interaction, interaction.values[0]);
                        }
                    } else {
                        await SafeInteractionHandler.safeReply(interaction, {
                            content: 'This is not your game!',
                            flags: MessageFlags.Ephemeral
                        });
                    }
                }
            }
            // Handle roulette dozen selection dropdown
            else if (interaction.customId.startsWith('roulette-') && interaction.customId.includes('-dozen-select')) {
                const parts = interaction.customId.split('-');
                if (parts.length >= 3) {
                    const userId = parts[1];
                    
                    // Verify the user is the game owner
                    if (userId === interaction.user.id) {
                        const rouletteCommand = client.commands.get('roulette');
                        if (rouletteCommand && rouletteCommand.handleDozenSelect) {
                            await rouletteCommand.handleDozenSelect(interaction, interaction.values[0]);
                        }
                    } else {
                        await SafeInteractionHandler.safeReply(interaction, {
                            content: 'This is not your game!',
                            flags: MessageFlags.Ephemeral
                        });
                    }
                }
            }
            // Handle other select menus from different commands
            else if (interaction.customId === 'blackjack_help') {
                const blackjackCommand = client.commands.get('blackjack');
                if (blackjackCommand && blackjackCommand.handleSelectMenu) {
                    await blackjackCommand.handleSelectMenu(interaction);
                }
            }
            // Handle stop game select menu
            else if (interaction.customId === 'stop_game_select') {
                const stopGameCommand = client.commands.get('stopgame');
                if (stopGameCommand && stopGameCommand.handleSelectMenu) {
                    await stopGameCommand.handleSelectMenu(interaction);
                }
            }
            // Handle crash stop select menu
            else if (interaction.customId === 'stop_crash_select') {
                const stopCrashCommand = client.commands.get('stopcrash');
                if (stopCrashCommand && stopCrashCommand.handleSelectMenu) {
                    await stopCrashCommand.handleSelectMenu(interaction);
                }
            }
            // Handle panel refund user select menu
            else if (interaction.customId === 'refund_user_select') {
                await panelManager.handleRefundUserSelect(interaction);
            }
            // Handle panel stop game user select menu
            else if (interaction.customId === 'stop_game_user_select') {
                await panelManager.handleStopGameUserSelect(interaction);
            }
            // Handle release command select menus
            else if (interaction.customId === 'release_action' || 
                     interaction.customId === 'release_user_action' || 
                     interaction.customId === 'release_admin_action') {
                const releaseCommand = client.commands.get('release');
                if (releaseCommand && releaseCommand.handleSelectMenuInteraction) {
                    const action = interaction.values[0];
                    await releaseCommand.handleSelectMenuInteraction(interaction, action);
                }
            }
            // Handle UNO card selection
            else if (interaction.customId.startsWith('uno_card_select_')) {
                const unoCommand = client.commands.get('uno');
                if (unoCommand && unoCommand.handleCardSelection) {
                    const cardIndex = interaction.values[0];
                    await unoCommand.handleCardSelection(interaction, cardIndex);
                }
            }
            // Handle Yahtzee scoring category selection
            else if (interaction.customId === 'yahtzee_score_category') {
                const yahtzeeCommand = client.commands.get('yahtzee');
                if (yahtzeeCommand && yahtzeeCommand.handleInteraction) {
                    await yahtzeeCommand.handleInteraction(interaction);
                }
            }
            // Handle modern help category selection
            else if (interaction.customId === 'help_category_select') {
                try {
                    const selectedCategory = interaction.values[0];
                    logger.info(`Help category selected: ${selectedCategory} by user ${interaction.user.id}`);
                    
                    // Import help functions
                    const { showCategoryHelp, handleHelpError } = require('./COMMANDS/help');
                    
                    // Always defer update for select menus to prevent timeout
                    if (!interaction.deferred && !interaction.replied) {
                        await interaction.deferUpdate();
                    }
                    
                    // Show the selected category
                    await showCategoryHelp(interaction, selectedCategory);
                    
                } catch (error) {
                    logger.error(`Critical error in help category selection: ${error.message}\nStack: ${error.stack}`);
                    
                    // Use the centralized error handler
                    try {
                        const { handleHelpError } = require('./COMMANDS/help');
                        await handleHelpError(interaction, error);
                    } catch (fallbackError) {
                        logger.error(`Fallback error handler failed: ${fallbackError.message}`);
                        
                        // Last resort error handling
                        try {
                            const errorMessage = '⚠️ A critical error occurred. Please try `/help` again.';
                            if (interaction.deferred) {
                                await interaction.editReply({ content: errorMessage, embeds: [], components: [] });
                            } else if (!interaction.replied) {
                                await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
                            }
                        } catch (finalError) {
                            logger.error(`Final error handler failed: ${finalError.message}`);
                        }
                    }
                }
            }
            // Handle UNO color selection
            else if (interaction.customId.startsWith('uno_color_select_')) {
                const unoCommand = client.commands.get('uno');
                if (unoCommand && unoCommand.handleColorSelection) {
                    const parts = interaction.customId.split('_');
                    const cardIndex = parts[3]; // uno_color_select_{channelId}_{cardIndex}
                    const chosenColor = interaction.values[0];
                    await unoCommand.handleColorSelection(interaction, cardIndex, chosenColor);
                }
            }
            // Handle battleship dropdown selections
            else if (interaction.customId.startsWith('battleship_place_') || interaction.customId.startsWith('battleship_attack_')) {
                const battleshipCommand = client.commands.get('battleship');
                if (battleshipCommand && battleshipCommand.handleSelectMenu) {
                    await battleshipCommand.handleSelectMenu(interaction);
                } else {
                    await interaction.reply({ content: '❌ Battleship handler not available.', ephemeral: true });
                }
            }
            // Handle blackjack bet selection for Play Again
            else if (interaction.customId === 'blackjack_bet_select') {
                const betAmount = interaction.values[0];
                
                // Create a proper mock slash command interaction for blackjack
                const mockInteraction = {
                    ...interaction,
                    options: {
                        getString: (name) => name === 'amount' ? betAmount : null,
                        getInteger: (name) => name === 'amount' ? parseInt(betAmount) : null
                    },
                    // Override interaction response methods to use update instead of reply
                    reply: async (data) => {
                        return await interaction.update(data);
                    },
                    editReply: async (data) => {
                        return await interaction.editReply(data);
                    },
                    followUp: async (data) => {
                        return await interaction.followUp(data);
                    },
                    // Track interaction state
                    replied: false,
                    deferred: false
                };
                
                try {
                    const blackjackCommand = client.commands.get('blackjack');
                    if (blackjackCommand) {
                        await blackjackCommand.execute(mockInteraction);
                    } else {
                        await interaction.update({
                            content: '❌ Blackjack command not available. Please try again.',
                            embeds: [],
                            components: []
                        });
                    }
                } catch (error) {
                    logger.error(`Error starting blackjack from Play Again: ${error.message}`);
                    
                    try {
                        if (!interaction.replied) {
                            await interaction.update({
                                content: '❌ Error starting blackjack game. Please try using `/blackjack` directly.',
                                embeds: [],
                                components: []
                            });
                        } else {
                            await interaction.followUp({
                                content: '❌ Error starting blackjack game. Please try using `/blackjack` directly.',
                                ephemeral: true
                            });
                        }
                    } catch (updateError) {
                        logger.error(`Failed to send error message: ${updateError.message}`);
                    }
                }
            }
            
            // Handle VPS management select menus (future expansion)
            else if (interaction.customId.startsWith('vps_')) {
                try {
                    const devCommand = client.commands.get('dev');
                    if (devCommand && devCommand.selectMenuHandlers && devCommand.selectMenuHandlers[interaction.customId]) {
                        await devCommand.selectMenuHandlers[interaction.customId].execute(interaction);
                    } else {
                        logger.warn(`VPS select menu handler not found: ${interaction.customId}`);
                        await interaction.reply({
                            content: '❌ VPS management option not available.',
                            ephemeral: true
                        });
                    }
                } catch (vpsError) {
                    logger.error(`Error handling VPS select menu ${interaction.customId}:`, vpsError);
                    
                    const UITemplates = require('./UTILS/uiTemplates');
                    const errorEmbed = UITemplates.createErrorEmbed('VPS Management', {
                        description: `Failed to process VPS selection`,
                        error: vpsError.message,
                        isLoss: false
                    });
                    
                    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
            }
            
        } catch (error) {
            // Handle expired interactions
            if (error.code === 10062) {
                logger.debug(`Select menu interaction expired: ${interaction.customId}`);
                return;
            }
            
            logger.error(`Error handling select menu ${interaction.customId}:`, error);

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Menu Error')
                .setDescription('An error occurred while processing your selection.')
                .setColor(0xFF0000);

            await SafeInteractionHandler.safeReply(interaction, { 
                embeds: [errorEmbed], 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
    // Handle button interactions
    else if (interaction.isButton()) {
        const customId = interaction.customId;

        try {
            // Check if interaction has expired
            if (!SafeInteractionHandler.isValid(interaction)) {
                logger.debug(`Button interaction expired: ${customId}`);
                return;
            }
            // Handle blackjack buttons (format: bj-{userId}-{action})
            if (customId.startsWith('bj-')) {
                const parts = customId.split('-');
                if (parts.length >= 3) {
                    const userId = parts[1];
                    const actionId = parts.slice(2).join('-'); // Handle multi-part action names

                    // Verify the user is the game owner
                    if (userId === interaction.user.id) {
                        const blackjackCommand = client.commands.get('blackjack');
                        if (blackjackCommand && blackjackCommand.handleBlackjackAction) {
                            await blackjackCommand.handleBlackjackAction(interaction, actionId);
                        }
                    } else {
                        await SafeInteractionHandler.safeReply(interaction, {
                            content: 'This is not your game!',
                            flags: MessageFlags.Ephemeral
                        });
                    }
                }
            }
            // Handle duck game buttons
            else if (customId.startsWith('duck-mode-') || customId.startsWith('duck-cancel-') || customId.startsWith('duck-')) {
                const duckCommand = client.commands.get('duck');
                if (duckCommand) {
                    if (customId.startsWith('duck-mode-')) {
                        const parts = customId.split('-');
                        const userId = parts[2];
                        const mode = parts[3];
                        
                        if (userId === interaction.user.id) {
                            await duckCommand.handleModeSelect(interaction, mode);
                        } else {
                            await SafeInteractionHandler.safeReply(interaction, {
                                content: 'This is not your game!',
                                flags: MessageFlags.Ephemeral
                            });
                        }
                    } else if (customId.startsWith('duck-cancel-')) {
                        const userId = customId.split('-')[2];
                        
                        if (userId === interaction.user.id) {
                            await duckCommand.handleCancel(interaction);
                        } else {
                            await SafeInteractionHandler.safeReply(interaction, {
                                content: 'This is not your game!',
                                flags: MessageFlags.Ephemeral
                            });
                        }
                    } else if (customId.startsWith('duck-')) {
                        const [namespace, actionId] = customId.split(':');
                        const userId = namespace.split('-')[1];
                        
                        if (userId === interaction.user.id) {
                            await duckCommand.handleGameAction(interaction, actionId);
                        } else {
                            await SafeInteractionHandler.safeReply(interaction, {
                                content: 'This is not your game!',
                                flags: MessageFlags.Ephemeral
                            });
                        }
                    }
                }
            }
            // Handle crash buttons (namespace: crash_...)
            else if (customId.startsWith('crash_')) {
                const crashGame = require('./GAMES/crash');
                // Look for any game in the channel that users can interact with
                const game = crashGame.crashManager.getGame(interaction.channelId);
                if (game) {
                    logger.info(`Crash button interaction: ${customId} by ${interaction.user.displayName} - gameKey: ${game.gameKey}, state: ${game.state}, players: ${game.players.size}`);
                    await crashGame.handleButtonInteraction(interaction, client, game);
                } else {
                    // Log all available games for debugging
                    const allGames = crashGame.crashManager.getAllChannelGames(interaction.channelId);
                    logger.warn(`No crash game found for button interaction: ${customId} by ${interaction.user.displayName} in channel ${interaction.channelId}. Total games in channel: ${allGames.length}`);
                    await interaction.reply({ content: '❌ No active crash game found. The game may have ended or expired.', ephemeral: true });
                }
            }
            // Handle scratch ticket buttons (claim_scratch_{ticketId} and scratch_{ticketId}_{position})
            else if (customId.startsWith('claim_scratch_') || customId.startsWith('scratch_')) {
                if (client.scratchTicketSystem) {
                    await client.scratchTicketSystem.handleButtonInteraction(interaction);
                } else {
                    logger.error('Scratch ticket system not initialized');
                    await SafeInteractionHandler.safeReply(interaction, {
                        content: '❌ Scratch ticket system is not available.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
            // Handle poll buttons
            else if (customId.startsWith('poll_')) {
                const pollCommand = client.commands.get('polls');
                if (pollCommand && pollCommand.buttonHandlers) {
                    if (customId.startsWith('poll_vote_')) {
                        // Format: poll_vote_{pollId}_{optionIndex}
                        const parts = customId.split('_');
                        const pollId = parts.slice(2, -1).join('_');
                        const optionIndex = parseInt(parts[parts.length - 1], 10);
                        if (!Number.isNaN(optionIndex) && pollId) {
                            await pollCommand.buttonHandlers.poll_vote(interaction, pollId, optionIndex);
                        }
                    } else if (customId.startsWith('poll_end_')) {
                        // Format: poll_end_{pollId}
                        const pollId = customId.substring('poll_end_'.length);
                        if (pollId) {
                            await pollCommand.buttonHandlers.poll_end(interaction, pollId);
                        }
                    }
                }
            }
            // Handle buffalo bonus buttons
            else if (customId.startsWith('buffalo-bonus-') || customId.startsWith('bonus-')) {
                const multiSlotsCommand = client.commands.get('multi-slots');
                if (multiSlotsCommand) {
                    if (customId.startsWith('buffalo-bonus-')) {
                        const userId = customId.split('-')[2];
                        if (userId === interaction.user.id) {
                            await multiSlotsCommand.handleBuffaloBonus(interaction);
                        } else {
                            await interaction.reply({
                                content: 'This is not your bonus game!',
                                ephemeral: true
                            });
                        }
                    } else if (customId.startsWith('bonus-')) {
                        const [namespace, actionId] = customId.split(':');
                        const userId = namespace.split('-')[1];
                        
                        if (userId === interaction.user.id) {
                            if (actionId === 'spin') {
                                await multiSlotsCommand.handleBonusSpin(interaction);
                            }
                        } else {
                            await interaction.reply({
                                content: 'This is not your bonus game!',
                                ephemeral: true
                            });
                        }
                    }
                }
            }
            // Handle fishing buttons (namespace: fishing-{userId}:{action})
            else if (customId.startsWith('fishing-')) {
                const [namespace, actionId] = customId.split(':');
                const userId = namespace.split('-')[1];
                
                if (userId === interaction.user.id) {
                    const fishingCommand = client.commands.get('fishing');
                    if (fishingCommand && fishingCommand.handleButtonInteraction) {
                        await fishingCommand.handleButtonInteraction(interaction, actionId);
                    }
                } else {
                    await interaction.reply({
                        content: 'This is not your fishing session!',
                        ephemeral: true
                    });
                }
            }
            // Handle roulette buttons (format: roulette-{userId}-{action})
            else if (customId.startsWith('roulette-')) {
                const parts = customId.split('-');
                if (parts.length >= 3) {
                    const userId = parts[1];
                    const actionId = parts.slice(2).join('-');

                    // Verify the user is the game owner
                    if (userId === interaction.user.id) {
                        const rouletteCommand = client.commands.get('roulette');
                        if (rouletteCommand && rouletteCommand.handleRouletteAction) {
                            await rouletteCommand.handleRouletteAction(interaction, actionId);
                        }
                    } else {
                        await SafeInteractionHandler.safeReply(interaction, {
                            content: 'This is not your game!',
                            flags: MessageFlags.Ephemeral
                        });
                    }
                }
            }
            // Handle RPS buttons (namespace: rps-{channelId}:{action})
            else if (customId.startsWith('rps-')) {
                const [namespace, actionId] = customId.split(':');
                const rpsCommand = client.commands.get('rps');
                if (rpsCommand && rpsCommand.handleButtonInteraction) {
                    await rpsCommand.handleButtonInteraction(interaction, actionId);
                }
            }
            // Handle Plinko buttons (namespace: plinko_{action}_{value}_{channelId})
            else if (customId.startsWith('plinko_')) {
                const parts = customId.split('_');
                const action = parts[1]; // mode or drop
                const value = parts[2];  // mode name or drop position
                
                const plinkoCommand = client.commands.get('plinko');
                if (plinkoCommand && plinkoCommand.handleButtonInteraction) {
                    await plinkoCommand.handleButtonInteraction(interaction, action, value);
                }
            }
            // Handle Yahtzee buttons and selects
            else if (customId.startsWith('yahtzee_')) {
                const yahtzeeCommand = client.commands.get('yahtzee');
                if (yahtzeeCommand && yahtzeeCommand.handleInteraction) {
                    await yahtzeeCommand.handleInteraction(interaction);
                }
            }
            // Handle Bingo buttons (namespace: bingo_{action}_{channelId})
            else if (customId.startsWith('bingo_')) {
                const parts = customId.split('_');
                
                if (parts[1] === 'card' && parts.length >= 6) {
                    // Interactive card button click: bingo_card_{userId}_{row}_{col}_{number}
                    const row = parseInt(parts[3]);
                    const col = parseInt(parts[4]);
                    const number = parseInt(parts[5]);
                    
                    const bingoCommand = client.commands.get('bingo');
                    if (bingoCommand && bingoCommand.handleButtonInteraction) {
                        await bingoCommand.handleButtonInteraction(interaction, 'card_click', row, col, number);
                    }
                } else {
                    // Regular bingo buttons: bingo_{action}_{channelId}
                    const action = parts[1]; // join, start, leave, show_card, interactive_card, game_status
                    
                    const bingoCommand = client.commands.get('bingo');
                    if (bingoCommand && bingoCommand.handleButtonInteraction) {
                        await bingoCommand.handleButtonInteraction(interaction, action);
                    }
                }
            }
            // Handle UNO buttons (namespace: uno_{action}_{channelId})
            else if (customId.startsWith('uno_')) {
                const parts = customId.split('_');
                const action = parts[1]; // join, start, leave, hand, draw, play, uno, status
                
                const unoCommand = client.commands.get('uno');
                if (unoCommand && unoCommand.handleButtonInteraction) {
                    await unoCommand.handleButtonInteraction(interaction, action);
                }
            }
            // Handle lottery buttons
            else if (customId.startsWith('lottery_')) {
                const action = customId.substring('lottery_'.length);
                
                // Try new lottery command first for specific actions
                const lotteryCommand = client.commands.get('lottery');
                if (lotteryCommand && lotteryCommand.handleButtonInteraction && 
                    ['buy_tickets', 'rules', 'my_tickets', 'prizes', 'cancel_game'].includes(action)) {
                    await lotteryCommand.handleButtonInteraction(interaction, action);
                } 
                // Try purchaselottery command for purchase-specific actions (buy_1, buy_2, view_tickets, etc.)
                else {
                    const purchaseLotteryCommand = client.commands.get('purchaselottery');
                    if (purchaseLotteryCommand && purchaseLotteryCommand.handleButtonInteraction) {
                        await purchaseLotteryCommand.handleButtonInteraction(interaction, action);
                    } else {
                        // Fallback to old lottery handling
                        await handleLotteryButtons(interaction, customId);
                    }
                }
            }
            // Handle mystats buttons
            else if (customId.startsWith('mystats_')) {
                const mystatsCommand = client.commands.get('mystats');
                if (mystatsCommand && mystatsCommand.handleButtonInteraction) {
                    await mystatsCommand.handleButtonInteraction(interaction, customId);
                }
            }
            // Handle myitems buttons
            else if (customId.startsWith('myitems_')) {
                const myitemsCommand = client.commands.get('myitems');
                if (myitemsCommand && myitemsCommand.handleButtonInteraction) {
                    await myitemsCommand.handleButtonInteraction(interaction, customId);
                }
            }
            // Handle game help buttons
            else if (customId === 'slots_help') {
                try {
                    await showSlotsHelp(interaction);
                } catch (error) {
                    logger.error(`Error showing slots help: ${error.message}`);
                    // If interaction has expired, don't try to reply
                    if (error.message.includes('Unknown interaction') || error.code === 10062) {
                        logger.warn(`Slots help interaction expired for user ${interaction.user.id}`);
                        return;
                    }
                    // For other errors, try to send error response
                    try {
                        const errorEmbed = new EmbedBuilder()
                            .setTitle('❌ Help Error')
                            .setDescription('Unable to show help at this time.')
                            .setColor(0xFF0000);
                        
                        if (interaction.replied || interaction.deferred) {
                            await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                        } else {
                            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                        }
                    } catch (replyError) {
                        logger.error(`Failed to send help error reply: ${replyError.message}`);
                    }
                }
            }
            else if (customId === 'blackjack_help') {
                await showBlackjackHelp(interaction);
            }
            else if (customId === 'fishing_help') {
                await showFishingHelp(interaction);
            }
            else if (customId === 'close_help') {
                await interaction.update({ content: '✅ Help closed!', embeds: [], components: [] });
                // Delete the message after a short delay
                setTimeout(async () => {
                    try {
                        await interaction.deleteReply();
                    } catch (error) {
                        // Ignore errors (message might already be deleted)
                    }
                }, 2000);
            }
            // Handle leaderboard buttons
            else if (customId.startsWith('leaderboard_')) {
                const leaderboardCommand = client.commands.get('leaderboard');
                if (leaderboardCommand && leaderboardCommand.handleButtonInteraction) {
                    await leaderboardCommand.handleButtonInteraction(interaction, customId);
                }
            }
            // Handle treasurevault buttons (namespace: treasurevault_...)
            else if (customId.startsWith('treasurevault_')) {
                const treasurevaultCommand = client.commands.get('treasurevault');
                if (treasurevaultCommand && treasurevaultCommand.handleButtonInteraction) {
                    await treasurevaultCommand.handleButtonInteraction(interaction, customId);
                } else {
                    await interaction.reply({
                        content: '❌ Treasure Vault game not available. Please try again.',
                        ephemeral: true
                    });
                }
            }
            // Handle panel system buttons
            else if (customId === 'confirm_restart_bot' || customId === 'cancel_restart_bot') {
                await panelManager.handleButtonInteraction(interaction);
            }
            // Handle battleship buttons (namespace: battleship_{action})
            else if (customId.startsWith('battleship_')) {
                try {
                    const action = customId.substring('battleship_'.length);
                    const battleshipCommand = client.commands.get('battleship');
                    if (battleshipCommand && battleshipCommand.handleButtonInteraction) {
                        await battleshipCommand.handleButtonInteraction(interaction, action);
                    } else {
                        logger.error('Battleship command or handler not found');
                        await interaction.reply({
                            content: '❌ Battleship handler not available. Please try again.',
                            ephemeral: true
                        });
                    }
                } catch (error) {
                    logger.error(`Error handling Battleship button ${customId}:`, error);
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('❌ Battleship Error')
                        .setDescription('An error occurred while processing your battleship action.')
                        .setColor(0xFF0000);
                    
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    } else {
                        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    }
                }
            }
            // Handle plinko buttons (namespace: plinko_{action})
            else if (customId.startsWith('plinko_')) {
                try {
                    const action = customId.substring('plinko_'.length);
                    const plinkoCommand = client.commands.get('plinko');
                    if (plinkoCommand && plinkoCommand.handlePlinkoButtonInteraction) {
                        await plinkoCommand.handlePlinkoButtonInteraction(interaction, action);
                    } else {
                        logger.error('Plinko command or handler not found');
                        await interaction.reply({
                            content: '❌ Plinko handler not available. Please try again.',
                            ephemeral: true
                        });
                    }
                } catch (error) {
                    logger.error(`Error handling Plinko button ${customId}:`, error);
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('❌ Plinko Error')
                        .setDescription('An error occurred while processing your Plinko action.')
                        .setColor(0xFF0000);
                    
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    } else {
                        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    }
                }
            }
            // Handle setup wizard buttons and select menus
            else if (customId.startsWith('setup_')) {
                const { SetupInteractionHandler } = require('./UTILS/setupInteractionHandler');
                await SetupInteractionHandler.handleSetupInteraction(interaction);
            }
            // Handle modern help system buttons
            else if (customId.startsWith('help_')) {
                try {
                    logger.info(`Help button clicked: ${customId} by user ${interaction.user.id}`);
                    
                    // Import help functions
                    const { showMainHelp, showCategoryHelp, handleHelpError, HELP_CATEGORIES } = require('./COMMANDS/help');
                    
                    // Always defer update for buttons
                    if (!interaction.deferred && !interaction.replied) {
                        await interaction.deferUpdate();
                    }

                    // Handle different button types
                    switch (customId) {
                        case 'help_back_main':
                        case 'help_close':
                            if (customId === 'help_close') {
                                // Close help with a simple message
                                await interaction.editReply({ 
                                    content: '✅ **Help closed!** Use `/help` anytime to access the help system again.', 
                                    embeds: [], 
                                    components: [] 
                                });
                            } else {
                                await showMainHelp(interaction);
                            }
                            break;

                        case 'help_refresh_category':
                            // Determine current category from embed title
                            const embed = interaction.message.embeds[0];
                            let category = null;
                            if (embed && embed.title) {
                                // Match category based on title content
                                for (const [key, catInfo] of Object.entries(HELP_CATEGORIES)) {
                                    if (embed.title.includes(catInfo.name)) {
                                        category = key;
                                        break;
                                    }
                                }
                            }
                            
                            if (category) {
                                await showCategoryHelp(interaction, category);
                            } else {
                                await showMainHelp(interaction);
                            }
                            break;

                        case 'help_all_commands':
                            await showAllCommandsList(interaction);
                            break;

                        case 'help_quick_start':
                            await showQuickStartGuide(interaction);
                            break;

                        case 'help_tutorials':
                            await showTutorialsList(interaction);
                            break;

                        case 'help_support':
                            await showSupportInfo(interaction);
                            break;

                        case 'help_stats':
                            await showBotStats(interaction);
                            break;

                        case 'help_changelog':
                            await showChangelog(interaction);
                            break;

                        default:
                            // Handle category-specific buttons (examples, tips, FAQ, tutorials)
                            if (customId.includes('_examples_') || customId.includes('_tips_') || 
                                customId.includes('_faq_') || customId.includes('_tutorial_')) {
                                
                                await showAdvancedHelpContent(interaction, customId);
                            } else {
                                logger.warn(`Unknown help button: ${customId}`);
                                await showMainHelp(interaction);
                            }
                            break;
                    }

                } catch (error) {
                    logger.error(`Critical error in help button ${customId}: ${error.message}\nStack: ${error.stack}`);
                    
                    // Use centralized error handling
                    try {
                        const { handleHelpError } = require('./COMMANDS/help');
                        await handleHelpError(interaction, error);
                    } catch (fallbackError) {
                        logger.error(`Help button fallback error: ${fallbackError.message}`);
                        
                        try {
                            const errorMessage = '⚠️ Help system error. Try `/help` to restart.';
                            if (interaction.deferred) {
                                await interaction.editReply({ content: errorMessage, embeds: [], components: [] });
                            } else if (!interaction.replied) {
                                await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
                            }
                        } catch (finalError) {
                            logger.error(`Final help button error handler failed: ${finalError.message}`);
                        }
                    }
                }
            }
            // Handle vote reminder button
            else if (customId === 'vote_remind_me') {
                await handleVoteReminder(interaction);
            }
            
            // Handle VPS management buttons
            else if (customId.startsWith('vps_')) {
                try {
                    const devCommand = client.commands.get('dev');
                    if (devCommand && devCommand.buttonHandlers && devCommand.buttonHandlers[customId]) {
                        await devCommand.buttonHandlers[customId](interaction);
                    } else {
                        logger.warn(`VPS button handler not found: ${customId}`);
                        await interaction.reply({
                            content: '❌ VPS management function not available.',
                            ephemeral: true
                        });
                    }
                } catch (vpsError) {
                    logger.error(`Error handling VPS button ${customId}:`, vpsError);
                    
                    const UITemplates = require('./UTILS/uiTemplates');
                    const errorEmbed = UITemplates.createErrorEmbed('VPS Management', {
                        description: `Failed to execute VPS operation: ${customId.replace('vps_', '')}`,
                        error: vpsError.message,
                        isLoss: false
                    });
                    
                    if (interaction.deferred || interaction.replied) {
                        await interaction.editReply({ embeds: [errorEmbed] });
                    } else {
                        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                    }
                }
            }
            // Handle shop buttons
            else if (customId === 'open_premium_shop' || customId === 'shop_help') {
                const shopCommand = client.commands.get('shop');
                if (shopCommand && shopCommand.handleButtonInteraction) {
                    await shopCommand.handleButtonInteraction(interaction);
                } else {
                    await interaction.reply({
                        content: '❌ Shop not available at the moment.',
                        ephemeral: true
                    });
                }
            }
            // Handle generic game buttons (game_play_again, game_quit)
            else if (customId.startsWith('game_')) {
                const action = customId.substring('game_'.length);
                
                // Handle new play again with amount format
                if (action.startsWith('play_again_')) {
                    const betAmount = parseInt(action.replace('play_again_', ''));
                    
                    // Determine which game to restart based on the embed content
                    const embed = interaction.message.embeds[0];
                    let gameType = null;
                    
                    if (embed && embed.title) {
                        if (embed.title.includes('Blackjack') || embed.title.includes('🃏')) {
                            gameType = 'blackjack';
                        } else if (embed.title.includes('Roulette') || embed.title.includes('American Roulette')) {
                            gameType = 'roulette';
                        } else if (embed.title.includes('Slots')) {
                            gameType = 'slots';
                        } else if (embed.title.includes('Crash') || embed.title.includes('🚁')) {
                            gameType = 'crash';
                        }
                    }
                    
                    if (gameType === 'blackjack' && betAmount > 0) {
                        // Start a new blackjack game directly with the specified bet
                        const blackjackCommand = require('./COMMANDS/blackjack');
                        
                        // Create a fake interaction with the bet amount
                        const fakeInteraction = {
                            ...interaction,
                            commandName: 'blackjack',
                            options: {
                                getInteger: (name) => name === 'bet' ? betAmount : null
                            },
                            deferReply: async () => await interaction.deferUpdate(),
                            editReply: async (data) => await interaction.editReply(data),
                            reply: async (data) => await interaction.editReply(data)
                        };
                        
                        try {
                            await blackjackCommand.execute(fakeInteraction);
                        } catch (error) {
                            await interaction.reply({
                                content: `❌ Error starting new game. Please use \`/blackjack bet:${betAmount}\` directly.`,
                                flags: MessageFlags.Ephemeral
                            });
                        }
                    } else if (gameType === 'roulette' && betAmount > 0) {
                        // Start a new roulette game directly with the specified bet
                        const rouletteCommand = require('./COMMANDS/roulette');
                        
                        // Create a fake interaction with the bet amount
                        const fakeInteraction = {
                            ...interaction,
                            commandName: 'roulette',
                            options: {
                                getString: (name) => name === 'amount' ? betAmount.toString() : null
                            },
                            deferReply: async () => await interaction.deferUpdate(),
                            editReply: async (data) => await interaction.editReply(data),
                            reply: async (data) => await interaction.editReply(data),
                            replied: false,
                            deferred: true
                        };
                        
                        try {
                            await rouletteCommand.execute(fakeInteraction);
                        } catch (error) {
                            await interaction.reply({
                                content: `❌ Error starting new game. Please use \`/roulette amount:${betAmount}\` directly.`,
                                flags: MessageFlags.Ephemeral
                            });
                        }
                    } else {
                        await interaction.reply({
                            content: `🎮 To play ${gameType || 'again'} with bet $${betAmount}, please use the command directly.`,
                            flags: MessageFlags.Ephemeral
                        });
                    }
                } else if (action === 'play_again') {
                    // Determine which game to restart based on the embed content
                    const embed = interaction.message.embeds[0];
                    let gameType = null;
                    
                    if (embed && embed.title) {
                        if (embed.title.includes('Blackjack') || embed.title.includes('🃏')) {
                            gameType = 'blackjack';
                        } else if (embed.title.includes('Roulette') || embed.title.includes('American Roulette')) {
                            gameType = 'roulette';
                        } else if (embed.title.includes('Slots')) {
                            gameType = 'slots';
                        } else if (embed.title.includes('Crash') || embed.title.includes('🚁')) {
                            gameType = 'crash';
                        }
                    }
                    
                    if (gameType === 'blackjack') {
                        // For blackjack, show bet selection interface
                        const { EmbedBuilder } = require('discord.js');
                        const GamePanel = require('./UTILS/gamePanel');
                        const dbManager = require('./UTILS/database');
                        const { getGuildId } = require('./UTILS/common');
                        
                        try {
                            const guildId = await getGuildId(interaction);
                            const userBalance = await dbManager.getUserBalance(interaction.user.id, guildId);
                            
                            const betEmbed = new EmbedBuilder()
                                .setTitle('🃏 Play Blackjack Again')
                                .setDescription(`Select your bet amount to start a new game of Blackjack.`)
                                .addFields([
                                    { name: '💵 Wallet', value: `$${userBalance.wallet.toLocaleString()}`, inline: true },
                                    { name: '🏦 Bank', value: `$${userBalance.bank.toLocaleString()}`, inline: true }
                                ])
                                .setColor(0x00ff00)
                                .setTimestamp();
                            
                            const betSelector = GamePanel.createBetSelector({
                                balance: userBalance.wallet,
                                minBet: 10,
                                customId: 'blackjack_bet_select'
                            });
                            
                            if (betSelector) {
                                await interaction.update({
                                    embeds: [betEmbed],
                                    components: [betSelector]
                                });
                            } else {
                                await interaction.reply({
                                    content: '❌ Insufficient balance to play Blackjack. You need at least $10.',
                                    ephemeral: true
                                });
                            }
                        } catch (error) {
                            await interaction.reply({
                                content: '❌ Error loading bet selection. Please try using `/blackjack` directly.',
                                ephemeral: true
                            });
                        }
                    } else if (gameType) {
                        // For other games, just tell user to use command directly
                        await interaction.reply({
                            content: `🎮 To play ${gameType} again, please use the \`/${gameType}\` command.`,
                            ephemeral: true
                        });
                    } else {
                        await interaction.reply({
                            content: '❌ Unable to determine which game to restart. Please use the game command directly.',
                            ephemeral: true
                        });
                    }
                } else if (action === 'quit') {
                    // End the game session but keep the message visible
                    const endEmbed = new EmbedBuilder()
                        .setTitle('🚪 Game Session Ended')
                        .setDescription('The game session has been ended by the player.')
                        .setColor(0x808080)
                        .setTimestamp();
                    
                    await interaction.update({
                        content: null,
                        embeds: [endEmbed],
                        components: [] // Remove all buttons but keep the message
                    });
                } else {
                    await interaction.reply({
                        content: `❌ Unknown game action: ${action}`,
                        ephemeral: true
                    });
                }
            }
            // Handle vote buttons - TEMPORARILY COMMENTED OUT (Top.GG not configured)
            /*
            else if (customId === 'check_vote' || customId === 'vote_reminder') {
                const voteCommand = client.commands.get('vote');
                
                if (customId === 'check_vote') {
                    // Process the vote claim
                    const result = await voteCommand.processVote(interaction.user.id, interaction.guild.id, interaction);
                    
                    if (result.success) {
                        await interaction.update({
                            embeds: [result.embed],
                            components: []
                        });
                    } else {
                        await interaction.reply({
                            content: '❌ Unable to verify vote. Please make sure you voted and try again in a few minutes.',
                            ephemeral: true
                        });
                    }
                } else if (customId === 'vote_reminder') {
                    // Set a reminder for when they can vote again
                    await interaction.reply({
                        content: '⏰ I\'ll remind you when you can vote again! (Note: This is a placeholder - actual reminder system would need to be implemented)',
                        ephemeral: true
                    });
                }
            }
            */
            
        } catch (error) {
            // Handle "Unknown interaction" errors gracefully (interaction expired)
            if (error.message.includes('Unknown interaction') || error.code === 10062) {
                logger.debug(`Button interaction expired for customId: ${customId}, user: ${interaction.user.id}`);
                return; // Silently ignore expired interactions
            }
            
            logger.error(`Error handling button ${customId}:`, error);

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Button Error')
                .setDescription('An error occurred while processing your action.')
                .setColor(0xFF0000);

            // Use safe interaction handler
            await SafeInteractionHandler.safeReply(interaction, { 
                embeds: [errorEmbed], 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
    // Handle autocomplete interactions
    else if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);

        if (!command || !command.autocomplete) {
            return;
        }

        try {
            await command.autocomplete(interaction);
        } catch (error) {
            logger.error(`Error handling autocomplete for ${interaction.commandName}:`, error);
        }
    }
});

// Handle messages for follow-up actions from panels
client.on('messageCreate', async message => {
    // Ignore bot messages and system messages
    if (message.author.bot || message.system) return;

    try {
        // Check if this message is a follow-up to a panel action
        await panelManager.processFollowUpAction(message);
        
        // XP system moved to UAS bot
        logger.debug(`XP system now handled by UAS bot`);
    } catch (error) {
        logger.error(`Error processing message: ${error.message}`);
    }
});

// ========================= DISCORD SERVER PRODUCTS HANDLERS =========================

// Removed Discord entitlement handlers - using web-based purchases now

// ========================= ERROR HANDLERS =========================

client.on('error', async error => {
    logger.error('Discord client error:', error);
    try { await sendLogMessage(client, 'error', `Discord client error: ${error.message}`); } catch (_) {}
});

client.on('warn', async warning => {
    logger.warn('Discord client warning:', warning);
    try { await sendLogMessage(client, 'warn', `Discord client warning: ${warning}`); } catch (_) {}
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async error => {
    logger.error('Unhandled promise rejection:', error);
    try { await sendLogMessage(client, 'error', `Unhandled rejection: ${error?.message || error}`); } catch (_) {}
});

// ========================= VOTE REMINDER SYSTEM =========================

/**
 * Handle vote reminder button
 */
async function handleVoteReminder(interaction) {
    try {
        const userId = interaction.user.id;
        
        // Get user's current vote data to determine when they can vote next
        const voteData = await dbManager.databaseAdapter.getUserVoteData(userId);
        const lastVoteTime = voteData?.last_vote_ts || 0;
        const nextVoteTime = lastVoteTime + (12 * 60 * 60 * 1000); // 12 hours after last vote
        const timeUntilVote = nextVoteTime - Date.now();
        
        if (timeUntilVote <= 0) {
            // Can vote now
            await interaction.reply({
                content: '🗳️ **You can vote right now!** Click the "Vote on Top.GG" button above! 🚀',
                ephemeral: true
            });
            return;
        }
        
        // Set reminder for when they can vote
        const reminderTime = timeUntilVote;
        const reminderTimeFormatted = Math.floor(reminderTime / (1000 * 60 * 60)) + 'h ' + 
                                    Math.floor((reminderTime % (1000 * 60 * 60)) / (1000 * 60)) + 'm';
        
        await interaction.reply({
            content: `⏰ **Reminder Set!** I'll remind you to vote in **${reminderTimeFormatted}**!\n\n💡 *You can vote every 12 hours for maximum rewards and streak bonuses!*`,
            ephemeral: true
        });
        
        // Schedule the reminder
        setTimeout(async () => {
            try {
                const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                const reminderEmbed = new EmbedBuilder()
                    .setTitle('🗳️ Time to Vote!')
                    .setDescription(`**${interaction.user.username}**, it's time to vote for ATIVE Casino Bot on Top.GG!`)
                    .addFields(
                        {
                            name: '💰 Vote Rewards',
                            value: '• **25,000 coins** per vote\n• **Weekend Bonus**: +50% extra coins\n• **Streak Bonuses**: Up to 1M coins!',
                            inline: false
                        },
                        {
                            name: '🔗 Vote Now',
                            value: '[🗳️ **Click here to vote!**](https://top.gg/bot/1403236218900185088/vote)',
                            inline: false
                        }
                    )
                    .setColor(0x00D4FF)
                    .setThumbnail(interaction.client.user.displayAvatarURL())
                    .setFooter({ text: '🎰 ATIVE Casino • Reminder System' })
                    .setTimestamp();
                
                const voteButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('🗳️ Vote on Top.GG')
                            .setStyle(ButtonStyle.Link)
                            .setURL('https://top.gg/bot/1403236218900185088/vote')
                    );
                
                await interaction.user.send({ 
                    embeds: [reminderEmbed], 
                    components: [voteButton] 
                }).catch(() => {
                    // If DM fails, that's okay - user might have DMs disabled
                    logger.info(`Failed to send vote reminder DM to ${interaction.user.username}`);
                });
                
            } catch (error) {
                logger.error(`Error sending vote reminder: ${error.message}`);
            }
        }, reminderTime);
        
        logger.info(`Vote reminder set for ${interaction.user.username} (${userId}) - ${reminderTimeFormatted}`);
        
    } catch (error) {
        logger.error(`Error handling vote reminder: ${error.message}`);
        await interaction.reply({
            content: '❌ Failed to set vote reminder. Please try again.',
            ephemeral: true
        });
    }
}

// ========================= TOP.GG WEBHOOK SERVER =========================

const express = require('express');
const uasConnector = require('./UTILS/uasConnector');
const app = express();
const PORT = process.env.WEBHOOK_PORT || 3001;

app.use(express.json());

// Initialize UAS Connector with Express app
uasConnector.initialize(app);

// Role assignment webhook endpoint
app.post('/role-assignment', async (req, res) => {
    try {
        const { userId, guildId, roleId, action, reason } = req.body;
        
        // Validate required fields
        if (!userId || !guildId || !roleId || !action) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: userId, guildId, roleId, action' 
            });
        }
        
        // Validate action
        if (!['assign', 'remove'].includes(action)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid action. Must be "assign" or "remove"' 
            });
        }
        
        // Get guild and member
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ 
                success: false, 
                error: 'Guild not found or bot not in guild' 
            });
        }
        
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found in guild' 
            });
        }
        
        const role = guild.roles.cache.get(roleId);
        if (!role) {
            return res.status(404).json({ 
                success: false, 
                error: 'Role not found in guild' 
            });
        }
        
        // Perform role action
        if (action === 'assign') {
            if (member.roles.cache.has(roleId)) {
                return res.status(200).json({ 
                    success: true, 
                    message: 'User already has this role',
                    alreadyHadRole: true
                });
            }
            
            await member.roles.add(roleId, reason || 'Subscription purchase');
            
            logger.info(`Role assigned: ${role.name} to ${member.user.username} (${userId}) in ${guild.name}`);
            
            res.status(200).json({ 
                success: true, 
                message: `Role ${role.name} assigned successfully`,
                action: 'assigned',
                roleName: role.name,
                userName: member.user.username
            });
            
        } else { // action === 'remove'
            if (!member.roles.cache.has(roleId)) {
                return res.status(200).json({ 
                    success: true, 
                    message: 'User does not have this role',
                    alreadyRemovedRole: true
                });
            }
            
            await member.roles.remove(roleId, reason || 'Subscription cancelled');
            
            logger.info(`Role removed: ${role.name} from ${member.user.username} (${userId}) in ${guild.name}`);
            
            res.status(200).json({ 
                success: true, 
                message: `Role ${role.name} removed successfully`,
                action: 'removed',
                roleName: role.name,
                userName: member.user.username
            });
        }
        
    } catch (error) {
        logger.error(`Role assignment webhook error: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Top.GG webhook endpoint
app.post('/topgg/webhook', async (req, res) => {
    try {
        // Initialize TopGG manager
        const TopGGManager = require('./UTILS/topgg');
        const topggManager = new TopGGManager(client);
        
        // Handle the webhook
        await topggManager.handleVoteWebhook(req, res);
    } catch (error) {
        logger.error(`Top.GG webhook server error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        uptime: Math.floor((Date.now() - client.startTime) / 1000),
        timestamp: new Date().toISOString()
    });
});

// Start webhook server
app.listen(PORT, () => {
    logger.info(`Webhook server running on port ${PORT}`);
    logger.info(`Available endpoints: /role-assignment, /topgg/webhook, /health, /uas/sessions/*`);
});

// Handle uncaught exceptions
process.on('uncaughtException', async error => {
    logger.error('Uncaught exception:', error);
    try { await sendLogMessage(client, 'error', `Uncaught exception: ${error?.message || error}`); } catch (_) {}
    process.exit(1);
});

// ========================= MODERN HELP SYSTEM HELPER FUNCTIONS =========================

/**
 * Show comprehensive commands list with modern UI
 */
async function showAllCommandsList(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('📋 Complete Command Reference')
        .setDescription('**🎯 All ATIVE Casino Bot commands organized by category**\n\n*Click any command name for detailed help and examples.*\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
            {
                name: '🎰 **Casino Games** 🎰',
                value: '```yaml\nSlot Games:   /slots, /multi-slots\nCard Games:   /blackjack\nSkill Games:  /crash, /fishing, /plinko, /rps\nParty Games:  /duck, /bingo, /uno\nPvP Games:    /battleship, /wordchain\n```\n🎯 **All games include interactive help buttons**',
                inline: false
            },
            {
                name: '💰 **Economy & Finance** 💰',
                value: '```yaml\nIncome:       /work, /beg, /crime, /heist\nManagement:   /balance, /sendmoney\nRisk:         /rob\nProgress:     /leaderboard\n```\n💡 **Pro Tip:** Use `/balance` panel for banking operations',
                inline: false
            },
            {
                name: '🎟️ **Lottery System** 🎟️',
                value: '```yaml\nView Status:  /lottery\nBuy Tickets:  /purchaselottery <1-7>\nDrawings:     Every Sunday 10AM EST\n```\n🏆 **Weekly prizes with guaranteed winners**',
                inline: false
            },
            {
                name: '👑 **Administration** 👑',
                value: '```yaml\nSetup:        /setup, /panel\nEconomy:      /editmoney\nGames:        /stopgame, /stopcrash\nLottery:      /drawlottery, /setuplottery\nCommunity:    /polls\n```\n🔒 **Admin permissions required**',
                inline: false
            },
            {
                name: '📊 **Information & Stats** 📊',
                value: '```yaml\nHelp System:  /help [category]\nBot Status:   /status\nRankings:     /leaderboard [type]\n```\n📈 **Real-time statistics and comprehensive help**',
                inline: false
            },
            {
                name: '🎯 **Command Usage Tips** 🎯',
                value: '• **📱 Slash Commands:** All commands use `/` prefix\n• **❓ Interactive Help:** Most commands have help buttons\n• **🎮 Game Tutorials:** Use `?` button in games for rules\n• **⏰ Cooldowns:** Economy commands have cooldown timers\n• **🔒 Permissions:** Some commands require admin roles\n• **📊 Context Help:** Use `/help [category]` for detailed guides',
                inline: false
            }
        )
        .setColor(0x3498DB)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setFooter({ 
            text: '📋 Command Reference • All 25+ Commands • ATIVE Casino Bot', 
            iconURL: interaction.client.user.displayAvatarURL() 
        })
        .setTimestamp();

    const navButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('help_back_main')
                .setLabel('🏠 Main Help')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🏠'),
            new ButtonBuilder()
                .setCustomId('help_quick_start')
                .setLabel('🚀 Quick Start')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🚀'),
            new ButtonBuilder()
                .setCustomId('help_tutorials')
                .setLabel('📚 Tutorials')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📚'),
            new ButtonBuilder()
                .setCustomId('help_close')
                .setLabel('❌ Close')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );

    const safeReply = async () => {
        try {
            if (interaction.deferred) {
                await interaction.editReply({ embeds: [embed], components: [navButtons] });
            } else {
                await interaction.reply({ embeds: [embed], components: [navButtons] });
            }
        } catch (error) {
            logger.error(`Failed to send commands list: ${error.message}`);
            const { handleHelpError } = require('./COMMANDS/help');
            await handleHelpError(interaction, error);
        }
    };

    await safeReply();
}

/**
 * Modern quick start guide with step-by-step tutorial
 */
async function showQuickStartGuide(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🚀 Quick Start Tutorial')
        .setDescription('**🎯 New Player? Get Started in 5 Minutes!**\n\n*Follow this interactive guide to master ATIVE Casino Bot quickly.*\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
            {
                name: '1️⃣ **Check Your Starting Funds** 💰',
                value: '```bash\n/balance\n```\n🎯 **You start with $1,000 in your wallet!**\n💡 **Wallet** = spending money | **Bank** = secure savings with interest',
                inline: false
            },
            {
                name: '2️⃣ **Earn Your First Income** 💼',
                value: '```bash\n/work    # $5K-30K every hour\n/beg     # $1K-10K every hour  \n/crime   # $1K-5K every 30min\n```\n🎯 **Pro Strategy:** Use all income sources for maximum earnings\n⏰ **Cooldowns prevent spam** - plan your income rotation',
                inline: false
            },
            {
                name: '3️⃣ **Play Your First Game** 🎰',
                value: '```bash\n/slots 100        # Safe bet for beginners\n/blackjack 500    # Strategy-based card game\n/fishing 250      # Risk vs reward adventure\n```\n🎯 **Every game has a ? button** with full rules and strategies\n⚠️ **Start small** - learn the games before big bets',
                inline: false
            },
            {
                name: '4️⃣ **Secure Your Wealth** 🏦',
                value: '• **📊 Use `/balance` panel** to deposit money into bank\n• **💰 Bank money earns interest** based on your tier\n• **🛡️ Banked money is safe** from robbery attempts\n• **📈 Higher total balance** = higher tier = more benefits',
                inline: false
            },
            {
                name: '5️⃣ **Join the Community** 🎉',
                value: '```bash\n/purchaselottery 1    # Buy lottery tickets (Sunday draws)\n/leaderboard          # See top players and your rank\n/uno                  # Play social games with others\n```\n🎯 **Weekly lottery** has guaranteed winners with massive prizes',
                inline: false
            },
            {
                name: '🎯 **Success Tips & Strategies** 🎯',
                value: '• **🏦 Bank Priority:** Always bank excess funds for interest\n• **🎖️ Tier Focus:** Higher tiers = better protection & perks\n• **🎲 Smart Gaming:** Learn odds, use help buttons\n• **⏰ Cooldown Management:** Rotate all income sources\n• **🎟️ Lottery Strategy:** Max 7 tickets per week for best odds\n• **🤝 Community:** Join games, make friends, have fun!',
                inline: false
            }
        )
        .setColor(0x2ECC71)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setFooter({ 
            text: '🚀 Quick Start • 5-Minute Tutorial • ATIVE Casino Bot', 
            iconURL: interaction.client.user.displayAvatarURL() 
        })
        .setTimestamp();

    const actionButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('help_back_main')
                .setLabel('🏠 Main Help')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🏠'),
            new ButtonBuilder()
                .setCustomId('help_all_commands')
                .setLabel('📋 All Commands')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📋'),
            new ButtonBuilder()
                .setCustomId('help_tutorials')
                .setLabel('📚 More Tutorials')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📚'),
            new ButtonBuilder()
                .setCustomId('help_close')
                .setLabel('❌ Close')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );

    const safeReply = async () => {
        try {
            if (interaction.deferred) {
                await interaction.editReply({ embeds: [embed], components: [actionButtons] });
            } else {
                await interaction.reply({ embeds: [embed], components: [actionButtons] });
            }
        } catch (error) {
            logger.error(`Failed to send quick start guide: ${error.message}`);
            const { handleHelpError } = require('./COMMANDS/help');
            await handleHelpError(interaction, error);
        }
    };

    await safeReply();
}

/**
 * Show support information
 */
async function showSupportInfo(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('💬 Support & Community')
        .setDescription('**Need help? Found a bug? Want to give feedback?**\n\nHere are all the ways to get support and connect with the community.')
        .addFields(
            {
                name: '🐛 Report Bugs & Issues',
                value: '**Contact Admins:** Report bugs directly to server administrators\nDetailed bug reports help us fix issues faster!',
                inline: false
            },
            {
                name: '📊 Bot Logs & Monitoring',
                value: '**General Log Channel:** <#1405096821512212521>\n**Economy Monitor:** <#1409016191049142434>\nBot activities and economy monitored separately.',
                inline: false
            },
            {
                name: '👨‍💻 Developer Contact',
                value: '**Developer ID:** `466050111680544798`\nFor critical issues or direct feedback.',
                inline: false
            },
            {
                name: '📚 Documentation',
                value: '• Use `/help [category]` for specific help topics\n• Every game has a **?** help button\n• Check `/leaderboard tiers` for tier information\n• Use `/status` for bot health information',
                inline: false
            },
            {
                name: '🤝 Community Guidelines',
                value: '• **Be respectful** to other players\n• **Don\'t exploit bugs** - report them instead\n• **Follow Discord TOS** at all times\n• **Have fun** and enjoy the games!',
                inline: false
            },
            {
                name: '⚡ Quick Support Commands',
                value: '• `/help` - This help system\n• `/status` - Bot status and uptime\n• `/balance` - Check your account\n• `/setup` - Server setup (admins only)',
                inline: false
            }
        )
        .setColor(0x9B59B6)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setFooter({ text: '💬 Support Info • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('help_back_main')
                .setLabel('🔙 Back to Help')
                .setStyle(ButtonStyle.Secondary)
        );

    const safeReply = async () => {
        try {
            if (interaction.deferred) {
                await interaction.editReply({ embeds: [embed], components: [buttons] });
            } else if (interaction.replied) {
                await interaction.followUp({ embeds: [embed], components: [buttons] });
            } else {
                await interaction.reply({ embeds: [embed], components: [buttons] });
            }
        } catch (error) {
            logger.error(`Failed to send support info: ${error.message}`);
        }
    };

    await safeReply();
}

/**
 * Show slots game help
 */
async function showSlotsHelp(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🎰 Slots - How to Play')
        .setDescription('**Classic 3-reel slot machine with exciting payouts!**\n\nSpin the reels and match symbols for big wins!')
        .addFields(
            {
                name: '🎯 How to Play',
                value: '1. Use `/slots <amount>` to bet any amount\n2. Watch the reels spin with animation\n3. Match symbols across the payline to win\n4. Bigger matches = bigger multipliers!',
                inline: false
            },
            {
                name: '🍒 Symbol Payouts',
                value: '🍒 **Cherries** - 2x payout\n🍋 **Lemon** - 3x payout\n🍊 **Orange** - 5x payout\n🍇 **Grapes** - 8x payout\n🍉 **Watermelon** - 12x payout\n💎 **Diamond** - 25x payout\n7️⃣ **Lucky 7** - 100x JACKPOT!',
                inline: false
            },
            {
                name: '💰 Winning Combinations',
                value: '• **3 of the same symbol** = Full payout\n• **2 of the same symbol** = Partial payout\n• **Mixed fruits** = Small consolation prize\n• **Triple 7s** = MASSIVE JACKPOT!',
                inline: false
            },
            {
                name: '🚀 Special Features',
                value: '• **Animated reels** for realistic experience\n• **Static result image** shows final outcome\n• **Booster bonus** for server boosters\n• **Fair RNG** ensures random results',
                inline: false
            },
            {
                name: '💡 Pro Tips',
                value: '• Start with smaller bets to learn\n• Higher bets = higher potential wins\n• Look for fruit combinations\n• Triple 7s are rare but worth it!',
                inline: false
            }
        )
        .setColor(0xFFD700)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setFooter({ text: '🎰 Slots Help • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    const closeButton = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('close_help')
                .setLabel('✅ Got it!')
                .setStyle(ButtonStyle.Success)
        );

    await interaction.reply({ embeds: [embed], components: [closeButton], ephemeral: true });
}

/**
 * Show blackjack game help
 */
async function showBlackjackHelp(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🃏 Blackjack - How to Play')
        .setDescription('**Beat the dealer by getting as close to 21 as possible without going over!**\n\nClassic casino card game with strategy and luck.')
        .addFields(
            {
                name: '🎯 Objective',
                value: '• Get your cards closer to 21 than the dealer\n• Don\'t go over 21 (that\'s a "bust")\n• Blackjack (21 with 2 cards) pays 3:2\n• Regular wins pay 1:1',
                inline: false
            },
            {
                name: '🃏 Card Values',
                value: '• **Number cards** = Face value (2-10)\n• **Face cards** (J, Q, K) = 10 points\n• **Aces** = 1 or 11 (whichever is better)\n• **Soft hand** = Hand with Ace counting as 11',
                inline: false
            },
            {
                name: '🎮 Your Actions',
                value: '**Hit** - Take another card\n**Stand** - Keep your current hand\n**Double Down** - Double bet, take exactly 1 card\n**Split** - Split pairs into 2 hands (coming soon)\n**Insurance** - Side bet when dealer shows Ace',
                inline: false
            },
            {
                name: '🏠 Dealer Rules',
                value: '• Dealer hits on 16 or less\n• Dealer stands on 17 or more\n• Dealer checks for blackjack with Ace/10 showing\n• Dealer wins ties (push)',
                inline: false
            },
            {
                name: '💡 Strategy Tips',
                value: '• **Hit** on 11 or less (can\'t bust)\n• **Stand** on 17 or more (risky to hit)\n• **Double down** on 10 or 11 vs weak dealer\n• **Consider dealer\'s up card** before deciding\n• **Insurance** is usually not worth it',
                inline: false
            }
        )
        .setColor(0x000000)
        .setThumbnail('🃏')
        .setFooter({ text: '🃏 Blackjack Help • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    const closeButton = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('close_help')
                .setLabel('✅ Got it!')
                .setStyle(ButtonStyle.Success)
        );

    await interaction.reply({ embeds: [embed], components: [closeButton], ephemeral: true });
}

/**
 * Show fishing game help
 */
async function showFishingHelp(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🎣 Fishing - How to Play')
        .setDescription('**Cast your line and reel in multipliers!**\n\nA unique risk vs reward game where patience pays off.')
        .addFields(
            {
                name: '🎯 How to Play',
                value: '1. Use `/fishing <amount>` to cast your line\n2. Choose your fishing spot and strategy\n3. Wait for fish to bite\n4. Reel in for multiplier rewards!',
                inline: false
            },
            {
                name: '🐟 Fish Types',
                value: '🐟 **Common Fish** - Small but reliable catches\n🐠 **Uncommon Fish** - Better rewards\n🐡 **Rare Fish** - Significant multipliers\n🐙 **Legendary Fish** - Massive payouts\n🦈 **Red Fish of Doom** - Highest risk, highest reward!',
                inline: false
            },
            {
                name: '⚖️ Risk vs Reward',
                value: '• **Shallow water** = Safer, smaller fish\n• **Deep water** = Riskier, bigger fish\n• **Legendary spots** = Rare but incredible catches\n• **Weather affects** fish activity',
                inline: false
            },
            {
                name: '🎮 Strategy Elements',
                value: '• Choose your **bait type** for different fish\n• **Patience** increases chances of rare fish\n• **Timing** your reel-in for bonus multipliers\n• **Location** affects what fish appear',
                inline: false
            },
            {
                name: '💡 Pro Tips',
                value: '• Start with smaller bets to learn patterns\n• **Legendary fish** are worth the wait\n• Watch for **Red Fish warnings**\n• Use **weather** to your advantage\n• **Practice timing** for perfect catches',
                inline: false
            }
        )
        .setColor(0x1E90FF)
        .setThumbnail('🎣')
        .setFooter({ text: '🎣 Fishing Help • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    const closeButton = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('close_help')
                .setLabel('✅ Got it!')
                .setStyle(ButtonStyle.Success)
        );

    await interaction.reply({ embeds: [embed], components: [closeButton], ephemeral: true });
}

// Graceful shutdown utility to check for active games
async function checkActiveGames() {
    const activeGameSessions = [];
    
    // Check each game command for active games
    const gameCommands = ['blackjack', 'slots', 'crash', 'plinko', 'duck', 'treasurevault', 'fishing', 'uno', 'rps', 'multi-slots'];
    
    for (const gameName of gameCommands) {
        const command = client.commands.get(gameName);
        if (command) {
            // Check if command has activeGames Map
            if (command.activeGames && command.activeGames.size > 0) {
                activeGameSessions.push({
                    game: gameName,
                    count: command.activeGames.size,
                    players: Array.from(command.activeGames.keys())
                });
            }
            
            // Check for module-level activeGames exports
            try {
                const gameModule = require(`./COMMANDS/${gameName}.js`);
                if (gameModule.activeGames && gameModule.activeGames.size > 0) {
                    activeGameSessions.push({
                        game: gameName,
                        count: gameModule.activeGames.size,
                        players: Array.from(gameModule.activeGames.keys())
                    });
                }
            } catch (err) {
                // Some games may not export activeGames
            }
        }
    }
    
    return activeGameSessions;
}

// Enhanced graceful shutdown with channel notifications
const gracefulShutdown = require('./UTILS/gracefulShutdown');

// Initialize graceful shutdown manager with client after ready
client.once('clientReady', () => {
    gracefulShutdown.initialize(client);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Received SIGINT, starting enhanced graceful shutdown...');
    
    try {
        // Stop storage monitoring
        storageMonitor.stopMonitoring();
        logger.info('Storage monitoring stopped');
        
        const result = await gracefulShutdown.initiateGracefulShutdown('SIGINT received', 5);
        logger.info(`Graceful shutdown completed: ${result.message}`);
    } catch (error) {
        logger.error(`Error during graceful shutdown: ${error.message}`);
    }
    
    client.destroy();
    process.exit(0);
});

// Initialize health check server for Railway deployment
const HealthCheckServer = require('./UTILS/healthCheck');
let healthCheckServer;

// Start health check server
if (process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production') {
    healthCheckServer = new HealthCheckServer(client);
    healthCheckServer.start();
}

// Enhanced shutdown handler for Railway
process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, starting enhanced graceful shutdown...');
    
    try {
        // Stop storage monitoring
        storageMonitor.stopMonitoring();
        logger.info('Storage monitoring stopped');
        
        // Stop health check server
        if (healthCheckServer) {
            healthCheckServer.stop();
        }
        
        const result = await gracefulShutdown.initiateGracefulShutdown('SIGTERM received (deployment)', 3);
        logger.info(`Graceful shutdown completed: ${result.message}`);
    } catch (error) {
        logger.error(`Error during graceful shutdown: ${error.message}`);
    }
    
    client.destroy();
    process.exit(0);
});

// ========================= ADDITIONAL HELP SYSTEM FUNCTIONS =========================

/**
 * Show tutorials list
 */
async function showTutorialsList(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('📚 Tutorial Library')
        .setDescription('**🎯 Available Tutorials and Guides**')
        .addFields({
            name: '📋 Current Tutorials',
            value: '• 🚀 Quick Start Guide\n• 📋 All Commands\n• 💰 Economy Guide\n• 🎰 Game Strategies',
            inline: false
        })
        .setColor(0x8E44AD);

    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('help_back_main')
                .setLabel('🏠 Back')
                .setStyle(ButtonStyle.Primary)
        );

    if (interaction.deferred) {
        await interaction.editReply({ embeds: [embed], components: [buttons] });
    } else {
        await interaction.reply({ embeds: [embed], components: [buttons] });
    }
}

async function showBotStats(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('📊 Bot Statistics')
        .setDescription('📈 **Coming Soon!** Comprehensive statistics.')
        .setColor(0x3498DB);
    
    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('help_back_main')
                .setLabel('🏠 Back')
                .setStyle(ButtonStyle.Primary)
        );

    if (interaction.deferred) {
        await interaction.editReply({ embeds: [embed], components: [buttons] });
    }
}

async function showChangelog(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('📰 What\'s New')
        .setDescription('🚀 **Coming Soon!** Latest updates.')
        .setColor(0xE67E22);
    
    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('help_back_main')
                .setLabel('🏠 Back')
                .setStyle(ButtonStyle.Primary)
        );

    if (interaction.deferred) {
        await interaction.editReply({ embeds: [embed], components: [buttons] });
    }
}

async function showAdvancedHelpContent(interaction, customId) {
    const embed = new EmbedBuilder()
        .setTitle('🔧 Advanced Help')
        .setDescription('⚡ **Coming Soon!** Advanced tutorials.')
        .setColor(0x9B59B6);
    
    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('help_back_main')
                .setLabel('🏠 Back')
                .setStyle(ButtonStyle.Primary)
        );

    if (interaction.deferred) {
        await interaction.editReply({ embeds: [embed], components: [buttons] });
    }
}

// Start the bot
client.login(TOKEN).catch(error => {
    logger.error('Failed to login:', error);
    process.exit(1);
});
