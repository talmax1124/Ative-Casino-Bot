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
            // Handle dev select menus
            else if (interaction.customId === 'stop_game_select') {
                const devCommand = client.commands.get('status'); // dev.js is exported as status command
                if (devCommand && devCommand.selectMenuHandlers && devCommand.selectMenuHandlers[interaction.customId]) {
                    await devCommand.selectMenuHandlers[interaction.customId].execute(interaction);
                }
            }
            // Handle crash stop select menu
            else if (interaction.customId === 'stop_crash_select') {
                const stopCrashCommand = client.commands.get('stopcrash');
                if (stopCrashCommand && stopCrashCommand.handleSelectMenu) {
                    await stopCrashCommand.handleSelectMenu(interaction);
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
            // Handle lottery buttons
            else if (customId.startsWith('lottery_')) {
                await handleLotteryButtons(interaction, customId);
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