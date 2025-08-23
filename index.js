/**
 * ATIVE Casino Bot - Main Entry Point
 * Professional Discord casino bot built with JavaScript
 */

const { Client, GatewayIntentBits, Collection, EmbedBuilder, MessageFlags } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const logger = require('./UTILS/logger');
const dbManager = require('./UTILS/database');
const { sendLogMessage } = require('./UTILS/common');
const panelManager = require('./UTILS/panelManager');
const { LotteryGame } = require('./GAMES/lottery');

// Bot configuration
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ENVIRONMENT = process.env.ENVIRONMENT || 'development';
const ANNOUNCE_CHANNEL_ID = process.env.ANNOUNCE_CHANNEL_ID;
const LOG_CHANNEL_ID = '1405096821512212521'; // From CLAUDE.md

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

    // Initialize database
    try {
        await dbManager.initialize();
        logger.info('Database initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize database:', error);
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
});

client.on('interactionCreate', async interaction => {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            logger.warn(`No command matching ${interaction.commandName} was found`);
            return;
        }

        // Check if command is disabled (import the helper function)
        const devModule = require('./COMMANDS/dev');
        if (devModule.isCommandDisabled && devModule.isCommandDisabled(interaction.commandName)) {
            const embed = new EmbedBuilder()
                .setTitle('🚫 Command Disabled')
                .setDescription('This command has been temporarily disabled by an administrator.')
                .setColor(0xFF6600);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        try {
            await command.execute(interaction);
        } catch (error) {
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

            // Send user-friendly error message
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Command Error')
                .setDescription('An error occurred while processing your command. The administrators have been notified.')
                .setColor(0xFF0000)
                .setTimestamp();

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
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
                const game = crashGame.crashManager.getGame(interaction.channelId, interaction.guildId);
                await crashGame.handleModalSubmit(interaction, game);
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
            else if (interaction.customId === 'battleship_place_modal' || interaction.customId === 'battleship_attack_modal') {
                const battleshipCommand = client.commands.get('battleship');
                if (battleshipCommand && battleshipCommand.handleModal) {
                    await battleshipCommand.handleModal(interaction);
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
            // Check if this is a panel-related select menu
            if (interaction.customId.includes('panel_action')) {
                const panelCommand = client.commands.get('panel');
                if (panelCommand && panelCommand.handleSelectMenu) {
                    await panelCommand.handleSelectMenu(interaction);
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
            // Handle UNO card selection
            else if (interaction.customId.startsWith('uno_card_select_')) {
                const unoCommand = client.commands.get('uno');
                if (unoCommand && unoCommand.handleCardSelection) {
                    const cardIndex = interaction.values[0];
                    await unoCommand.handleCardSelection(interaction, cardIndex);
                }
            }
            // Handle help category selection
            else if (interaction.customId === 'help_category_select') {
                const helpCommand = client.commands.get('help');
                if (helpCommand) {
                    const selectedCategory = interaction.values[0];
                    const tempInteraction = { ...interaction };
                    tempInteraction.options = {
                        getString: (name) => name === 'category' ? selectedCategory : null
                    };
                    await helpCommand.execute(tempInteraction);
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
        } catch (error) {
            logger.error(`Error handling select menu ${interaction.customId}:`, error);

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Menu Error')
                .setDescription('An error occurred while processing your selection.')
                .setColor(0xFF0000);

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
    // Handle button interactions
    else if (interaction.isButton()) {
        const customId = interaction.customId;

        try {
            // Handle blackjack buttons (new namespace format: bj-{userId}:{action})
            if (customId.startsWith('bj-')) {
                const [namespace, actionId] = customId.split(':');
                const userId = namespace.split('-')[1];

                // Verify the user is the game owner
                if (userId === interaction.user.id) {
                    const blackjackCommand = client.commands.get('blackjack');
                    if (blackjackCommand && blackjackCommand.handleBlackjackAction) {
                        await blackjackCommand.handleBlackjackAction(interaction, actionId);
                    }
                } else {
                    await interaction.reply({
                        content: 'This is not your game!',
                        ephemeral: true
                    });
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
                            await interaction.reply({
                                content: 'This is not your game!',
                                ephemeral: true
                            });
                        }
                    } else if (customId.startsWith('duck-cancel-')) {
                        const userId = customId.split('-')[2];
                        
                        if (userId === interaction.user.id) {
                            await duckCommand.handleCancel(interaction);
                        } else {
                            await interaction.reply({
                                content: 'This is not your game!',
                                ephemeral: true
                            });
                        }
                    } else if (customId.startsWith('duck-')) {
                        const [namespace, actionId] = customId.split(':');
                        const userId = namespace.split('-')[1];
                        
                        if (userId === interaction.user.id) {
                            await duckCommand.handleGameAction(interaction, actionId);
                        } else {
                            await interaction.reply({
                                content: 'This is not your game!',
                                ephemeral: true
                            });
                        }
                    }
                }
            }
            // Handle crash buttons (namespace: crash:...)
            else if (customId.startsWith('crash:')) {
                const crashGame = require('./GAMES/crash');
                const game = crashGame.crashManager.getGame(interaction.channelId, interaction.guildId);
                await crashGame.handleButtonInteraction(interaction, game, client);
            }
            // Handle poll buttons
            else if (customId.startsWith('poll_')) {
                const pollCommand = client.commands.get('polls');
                if (pollCommand && pollCommand.buttonHandlers && pollCommand.buttonHandlers[customId]) {
                    await pollCommand.buttonHandlers[customId](interaction);
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
                await handleLotteryButtons(interaction, customId);
            }
            // Handle game help buttons
            else if (customId === 'slots_help') {
                await showSlotsHelp(interaction);
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
                if (leaderboardCommand) {
                    const { getGuildId } = require('./UTILS/common');
                    const guildId = await getGuildId(interaction);
                    
                    if (customId === 'leaderboard_money') {
                        // Re-use the original command but specify category
                        const tempInteraction = { ...interaction };
                        tempInteraction.options = {
                            getString: (name) => name === 'category' ? 'money' : null
                        };
                        await leaderboardCommand.execute(tempInteraction);
                    } else if (customId === 'leaderboard_winloss') {
                        const tempInteraction = { ...interaction };
                        tempInteraction.options = {
                            getString: (name) => name === 'category' ? 'winloss' : null
                        };
                        await leaderboardCommand.execute(tempInteraction);
                    } else if (customId === 'leaderboard_tiers') {
                        const tempInteraction = { ...interaction };
                        tempInteraction.options = {
                            getString: (name) => name === 'category' ? 'tiers' : null
                        };
                        await leaderboardCommand.execute(tempInteraction);
                    } else if (customId === 'leaderboard_refresh') {
                        // Get current category from embed title and refresh
                        const embed = interaction.message.embeds[0];
                        let category = 'money'; // default
                        if (embed && embed.title) {
                            if (embed.title.includes('Win/Loss')) category = 'winloss';
                            else if (embed.title.includes('Tier')) category = 'tiers';
                        }
                        
                        const tempInteraction = { ...interaction };
                        tempInteraction.options = {
                            getString: (name) => name === 'category' ? category : null
                        };
                        await leaderboardCommand.execute(tempInteraction);
                    }
                }
            }
            // Handle help buttons
            else if (customId.startsWith('help_')) {
                const helpCommand = client.commands.get('help');
                if (helpCommand) {
                    if (customId === 'help_back_main') {
                        // Show main help
                        const tempInteraction = { ...interaction };
                        tempInteraction.options = {
                            getString: (name) => null
                        };
                        await helpCommand.execute(tempInteraction);
                    } else if (customId === 'help_refresh') {
                        // Refresh current category
                        const embed = interaction.message.embeds[0];
                        let category = null;
                        if (embed && embed.title) {
                            if (embed.title.includes('Games')) category = 'games';
                            else if (embed.title.includes('Economy')) category = 'economy';
                            else if (embed.title.includes('Lottery')) category = 'lottery';
                            else if (embed.title.includes('Admin')) category = 'admin';
                            else if (embed.title.includes('Tier')) category = 'tiers';
                            else if (embed.title.includes('Security')) category = 'security';
                        }
                        
                        const tempInteraction = { ...interaction };
                        tempInteraction.options = {
                            getString: (name) => name === 'category' ? category : null
                        };
                        await helpCommand.execute(tempInteraction);
                    } else if (customId === 'help_commands_list') {
                        // Show all commands list
                        await showAllCommandsList(interaction);
                    } else if (customId === 'help_getting_started') {
                        // Show getting started guide
                        await showGettingStartedGuide(interaction);
                    } else if (customId === 'help_support') {
                        // Show support information
                        await showSupportInfo(interaction);
                    }
                }
            }
        } catch (error) {
            logger.error(`Error handling button ${customId}:`, error);

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Button Error')
                .setDescription('An error occurred while processing your action.')
                .setColor(0xFF0000);

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
    // Handle Battleship buttons (namespace: battleship_{action})
    else if (interaction.isButton() && interaction.customId.startsWith('battleship_')) {
        try {
            // Extract full action after prefix so multi-word actions work
            const action = interaction.customId.substring('battleship_'.length);
            const battleshipCommand = client.commands.get('battleship');
            if (battleshipCommand && battleshipCommand.handleButtonInteraction) {
                await battleshipCommand.handleButtonInteraction(interaction, action);
            }
        } catch (error) {
            logger.error(`Error handling Battleship button: ${error.message}`);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Button Error')
                .setDescription('An error occurred while processing your action.')
                .setColor(0xFF0000);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
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
    } catch (error) {
        logger.error(`Error processing follow-up action: ${error.message}`);
    }
});

client.on('error', error => {
    logger.error('Discord client error:', error);
});

client.on('warn', warning => {
    logger.warn('Discord client warning:', warning);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', error => {
    logger.error('Unhandled promise rejection:', error);
});

// Handle uncaught exceptions
process.on('uncaughtException', error => {
    logger.error('Uncaught exception:', error);
    process.exit(1);
});

// ========================= HELP SYSTEM HELPER FUNCTIONS =========================

/**
 * Show all commands list
 */
async function showAllCommandsList(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('📋 All Available Commands')
        .setDescription('**Complete list of all bot commands organized by category:**')
        .addFields(
            {
                name: '🎰 Casino Games',
                value: '`/slots` `/multi-slots` `/blackjack` `/crash` `/fishing` `/plinko` `/rps` `/duck` `/bingo` `/uno` `/battleship` `/wordchain`',
                inline: false
            },
            {
                name: '💰 Economy Commands',
                value: '`/balance` `/work` `/beg` `/crime` `/heist` `/rob` `/sendmoney` `/leaderboard`',
                inline: false
            },
            {
                name: '🎟️ Lottery System',
                value: '`/lottery` `/purchaselottery` `/updatelotterypanel`',
                inline: false
            },
            {
                name: '👑 Admin Commands',
                value: '`/addmoney` `/setmoney` `/crasheco` `/setup` `/panel` `/backup` `/stopgame` `/stopcrash` `/polls`',
                inline: false
            },
            {
                name: '📊 Information & Help',
                value: '`/help` `/status` `/leaderboard`',
                inline: false
            }
        )
        .setColor(0x3498DB)
        .setThumbnail('📋')
        .setFooter({ text: '📋 Commands List • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    const backButton = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('help_back_main')
                .setLabel('🔙 Back to Help')
                .setStyle(ButtonStyle.Secondary)
        );

    await interaction.update({ embeds: [embed], components: [backButton] });
}

/**
 * Show getting started guide
 */
async function showGettingStartedGuide(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🚀 Getting Started with ATIVE Casino Bot')
        .setDescription('**New to the casino? Follow this step-by-step guide to get started!**')
        .addFields(
            {
                name: '1️⃣ Check Your Starting Balance',
                value: 'Use `/balance` to see your starting $1,000 wallet balance.\nYour wallet is for spending, your bank is for saving!',
                inline: false
            },
            {
                name: '2️⃣ Earn More Money',
                value: '• `/work` - Work various jobs (5K-30K every hour)\n• `/beg` - Ask for handouts (1K-10K every hour)\n• `/crime` - Quick petty crimes (1K-5K every 30min)\n• `/heist` - Big score attempts (10K-30K every 2.5hrs)',
                inline: false
            },
            {
                name: '3️⃣ Try Your First Game',
                value: '• `/slots 100` - Simple slot machine (great for beginners)\n• `/blackjack 500` - Classic card game with strategy\n• `/fishing 250` - Risk vs reward fishing game\n• Remember to click the **?** button for game help!',
                inline: false
            },
            {
                name: '4️⃣ Manage Your Money',
                value: '• **Bank your earnings** to earn interest and protect from robbery\n• **Check your tier** - higher tiers get better benefits\n• **Send money** to friends with `/sendmoney`\n• **Rob others** with `/rob` (but be careful of the risks!)',
                inline: false
            },
            {
                name: '5️⃣ Join the Community',
                value: '• Buy **lottery tickets** for weekly big prizes\n• Check the **leaderboard** to see top players\n• **Play PvP games** like Battleship and UNO\n• **Follow the rules** and have fun!',
                inline: false
            },
            {
                name: '💡 Pro Tips',
                value: '• **Higher tiers** get interest on bank balance\n• **Can\'t rob 2+ tiers higher** - grow your wealth first\n• **All games have help buttons** - use them!\n• **Economy commands have cooldowns** - be patient',
                inline: false
            }
        )
        .setColor(0x2ECC71)
        .setThumbnail('🚀')
        .setFooter({ text: '🚀 Getting Started • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    const backButton = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('help_back_main')
                .setLabel('🔙 Back to Help')
                .setStyle(ButtonStyle.Secondary)
        );

    await interaction.update({ embeds: [embed], components: [backButton] });
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
                value: '**GitHub Issues:** [claude-code/issues](https://github.com/anthropics/claude-code/issues)\nDetailed bug reports help us fix issues faster!',
                inline: false
            },
            {
                name: '📊 Bot Logs & Monitoring',
                value: '**Logs Channel:** <#1405096821512212521>\nAll bot activities are logged here for transparency.',
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
        .setThumbnail('💬')
        .setFooter({ text: '💬 Support Info • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('help_back_main')
                .setLabel('🔙 Back to Help')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setURL('https://github.com/anthropics/claude-code/issues')
                .setLabel('🐛 Report Bug')
                .setStyle(ButtonStyle.Link)
        );

    await interaction.update({ embeds: [embed], components: [buttons] });
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
        .setThumbnail('🎰')
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

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

// Start the bot
client.login(TOKEN).catch(error => {
    logger.error('Failed to login:', error);
    process.exit(1);
});
