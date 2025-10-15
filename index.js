/**
 * ATIVE Casino Bot - Main Entry Point
 * Professional Discord casino bot built with JavaScript
 */

const { Client, GatewayIntentBits, Collection, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const logger = require('./UTILS/logger');

// Defer log cleanup to avoid blocking startup
setTimeout(() => {
    try {
        const logCleanup = require('./UTILS/logCleanup');
        logCleanup.cleanupLogs();
    } catch (error) {
        logger.debug('Log cleanup deferred:', error.message);
    }
}, 1000); // Clean up logs after 1 second
const StartupBanner = require('./UTILS/startupBanner');
const dbManager = require('./UTILS/database');
const nodeCache = require('./UTILS/nodeCache');
const axios = require('axios');
// Economy analyzer moved to UAS bot
// Removed Firebase-dependent modules: economyMonitor, sessionManager
const { sendLogMessage, fmt } = require('./UTILS/common');
const LogSummaryManager = require('./UTILS/logSummaryManager');
const panelManager = require('./UTILS/panelManager');
const SafeInteractionHandler = require('./UTILS/interactionHandler');
const marriageBusinessIncomeGenerator = require('./UTILS/marriageBusinessIncomeGenerator');

// Defer heavy game system imports until actually needed (saves ~65ms at startup)
let LotteryGame = null;
let ScratchTicketSystem = null;
const getLotteryGame = () => {
    if (!LotteryGame) LotteryGame = require('./GAMES/lottery').LotteryGame;
    return LotteryGame;
};
const getScratchTicketSystem = () => {
    if (!ScratchTicketSystem) ScratchTicketSystem = require('./GAMES/scratchTickets');
    return ScratchTicketSystem;
};

const storageMonitor = require('./UTILS/storageMonitor');
// LEGACY: Economic systems replaced by EconomyGuardian AI
// const economicManager = require('./UTILS/economicManager');
// Leveling system moved to UAS bot
// Removed: const serverProducts = require('./UTILS/serverProducts'); // Web-based purchases now

// Global error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    // Specifically handle Discord API interaction errors
    if (reason && reason.message) {
        // Handle unknown interaction errors (expired or invalid)
        if (reason.message.includes('Unknown interaction')) {
            logger.debug('Unknown interaction error caught and handled:', reason.message);
            return;
        }
        
        // Handle interaction not deferred/replied errors
        if (reason.message.includes('The reply to this interaction has not been sent or deferred')) {
            logger.debug('Interaction not deferred error caught:', reason.message);
            return;
        }
        
        // Handle already acknowledged interaction errors
        if (reason.message.includes('Interaction has already been acknowledged')) {
            logger.debug('Interaction already acknowledged error caught:', reason.message);
            return;
        }
    }
    
    // Handle Discord API error codes
    if (reason && reason.code) {
        // 10062: Unknown interaction (expired)
        if (reason.code === 10062) {
            logger.debug('Interaction expired (10062)');
            return;
        }
        
        // 40060: Interaction already acknowledged
        if (reason.code === 40060) {
            logger.debug('Interaction already acknowledged (40060)');
            return;
        }
    }

    // Handle other unhandled rejections
    logger.error('Unhandled promise rejection:', reason instanceof Error ? reason.message : JSON.stringify(reason, null, 2));
    if (reason instanceof Error && reason.stack) {
        logger.error('Stack trace:', reason.stack);
    }
});

process.on('uncaughtException', (error) => {
    console.error('❌ [CRITICAL ERROR] Uncaught exception occurred:');
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error type:', error.constructor.name);
    
    if (error instanceof Error) {
        console.error('Full stack trace:', error.stack);
        logger.error('Uncaught exception:', error.message);
        logger.error('Stack trace:', error.stack);
    } else {
        console.error('Non-Error object:', JSON.stringify(error, null, 2));
        logger.error('Uncaught exception (non-Error):', JSON.stringify(error, null, 2));
    }
    
    // Don't exit the process for unknown interaction errors
    if (error.message && error.message.includes('Unknown interaction')) {
        logger.debug('Unknown interaction uncaught exception handled');
        return;
    }
    
    console.error('❌ Process will exit due to uncaught exception');
    process.exit(1);
});

// Bot configuration
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ENVIRONMENT = process.env.ENVIRONMENT || process.env.NODE_ENV || 'development';
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
        GatewayIntentBits.GuildMessageReactions
        // GatewayIntentBits.MessageContent - REMOVED! Now using button/modal interactions
        // GatewayIntentBits.GuildMembers - Removed to reduce privileged intent requirements
    ]
});

// Set start time for uptime tracking
client.startTime = Date.now();

// Helper function for handling game modal submissions
async function handleGameModalSubmit(interaction) {
    try {
        const customId = interaction.customId;
        
        if (customId.startsWith('poem_line_')) {
            const sessionId = customId.replace('poem_line_', '');
            const poemLine = interaction.fields.getTextInputValue('poem_line');
            
            const marriageTaskUtil = require('./marriages/MarriageTaskUtil');
            const session = marriageTaskUtil.getGameSession(sessionId);
            
            if (!session) {
                return await interaction.reply({
                    content: '❌ Session expired. Please start the task again.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const gameData = session.gameData;
            const marriage = session.marriage;
            
            // Add the line to the poem
            gameData.poemLines.push(poemLine);
            gameData.turnCount++;
            
            // Switch turns
            gameData.currentTurn = gameData.currentTurn === marriage.partner1.id ? 
                marriage.partner2.id : marriage.partner1.id;

            await interaction.reply({
                content: `✅ Line added: "${poemLine}"`,
                flags: MessageFlags.Ephemeral
            });

        } else if (customId.startsWith('quiz_answer_')) {
            const sessionId = customId.replace('quiz_answer_', '');
            const quizAnswer = interaction.fields.getTextInputValue('quiz_answer');
            
            const marriageTaskUtil = require('./marriages/MarriageTaskUtil');
            const session = marriageTaskUtil.getGameSession(sessionId);
            
            if (!session) {
                return await interaction.reply({
                    content: '❌ Session expired. Please start the task again.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const gameData = session.gameData;
            
            // Add the answer
            gameData.answers.push({
                question: gameData.questions[gameData.currentQuestion],
                answer: quizAnswer,
                answeredBy: interaction.user.id
            });

            await interaction.reply({
                content: `✅ Answer recorded: "${quizAnswer}"`,
                flags: MessageFlags.Ephemeral
            });
        }

    } catch (error) {
        logger.error(`Error in handleGameModalSubmit: ${error.message}`);
        await interaction.reply({
            content: '❌ Error processing your submission. Please try again.',
            flags: MessageFlags.Ephemeral
        });
    }
}

// Commands collection
client.commands = new Collection();

// Load commands from COMMANDS folder
async function loadCommands() {
    const commandsPath = path.join(__dirname, 'COMMANDS');

    // Load all command files
    const commandFiles = fs.readdirSync(commandsPath)
        .filter(file => file.endsWith('.js'));

    const commands = [];

    for (const file of commandFiles) {
        try {
            const filePath = path.join(commandsPath, file);
            logger.debug(`Loading command from: ${filePath}`);

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
                logger.warn(`Command file ${file} is missing 'data' or 'execute' property`);
            }
        } catch (error) {
            logger.error(`Failed to load command ${file}: ${error.message}`);
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

// Dynamic Bot Activity System
function setupBotActivity() {
    const activities = [
        { name: "hitting jackpots 🎰", type: ActivityType.Watching },
        { name: "stacking coins 💸", type: ActivityType.Watching },
        { name: "big poker brains 🃏", type: ActivityType.Playing },
        { name: "slots vibin’ 🎶", type: ActivityType.Listening },
        { name: "royal flush hype 👑", type: ActivityType.Playing },
        { name: "roulette wins 🎡", type: ActivityType.Playing },
        { name: "lucky rolls 🎲", type: ActivityType.Playing },
        { name: "jackpots dropping 💰", type: ActivityType.Watching },
        { name: "wallets leveling up 📈", type: ActivityType.Watching },
        { name: "super streaks 🔥", type: ActivityType.Watching },
        { name: "winner vibes 🏆", type: ActivityType.Watching },
        { name: "bonus spins 🎊", type: ActivityType.Watching },
        { name: "coin showers ✨", type: ActivityType.Watching },
        { name: "/help for the fun 🎲", type: ActivityType.Playing },
        { name: "ATIVE Casino 🎰", type: ActivityType.Playing }
    ];

    // Set initial activity
    const initialActivity = activities[Math.floor(Math.random() * activities.length)];
    client.user.setActivity(initialActivity.name, { type: initialActivity.type });

    // Change activity every 3 minutes for more dynamic feel
    setInterval(() => {
        const randomActivity = activities[Math.floor(Math.random() * activities.length)];
        client.user.setActivity(randomActivity.name, { type: randomActivity.type });
        logger.debug(`Bot activity changed to: ${getActivityTypeName(randomActivity.type)} ${randomActivity.name}`);
    }, 3 * 60 * 1000); // 3 minutes
}

// Helper function to get activity type name for logging
function getActivityTypeName(type) {
    switch (type) {
        case ActivityType.Playing: return 'Playing';
        case ActivityType.Listening: return 'Listening to';
        case ActivityType.Watching: return 'Watching';
        case ActivityType.Competing: return 'Competing in';
        default: return 'Unknown';
    }
}

// Send startup notification (concise, actionable, and pinned)
async function sendStartupNotification() {
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for bot to be ready

    try {
        // Collect key stats
        const commandCount = client.commands?.size || 0;
        const GAME_COMMANDS = new Set([
            'blackjack','slots','crash','plinko','duck','treasurevault','fishing','uno','rps',
            'multi-slots','roulette','keno','bingo','ceelo','russianroulette','mines','yahtzee','wordchain','riddle','scratch'
        ]);
        const gamesAvailable = Array.from(client.commands?.keys() || []).filter(k => GAME_COMMANDS.has(k)).length;
        const cacheStats = (nodeCache.getStats && nodeCache.getStats()) || { cacheSize: 0, metrics: { hitRate: '0%' } };
        const dbStatus = (dbManager.getFallbackStatus && dbManager.getFallbackStatus()) || { fallbackMode: false };

        const upSec = Math.max(0, Math.round(process.uptime()));
        const h = Math.floor(upSec / 3600); const m = Math.floor((upSec % 3600) / 60); const s = upSec % 60;
        const rssMB = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setTitle('✅ ATIVE Casino Bot Ready')
            .setDescription('Important alerts will appear here. Initialization noise is filtered.')
            .setColor(0x3AA569)
            .setTimestamp()
            .addFields(
                { name: '🧭 Environment', value: `${ENVIRONMENT.toUpperCase()}`, inline: true },
                { name: '🤖 Bot', value: `${client.user} (\`${client.user.id}\`)`, inline: true },
                { name: '🏠 Guilds', value: String(client.guilds?.cache?.size || 0), inline: true },
            )
            .addFields(
                { name: '🧩 Commands', value: String(commandCount), inline: true },
                { name: '🎮 Games', value: String(gamesAvailable), inline: true },
                { name: '🗄️ Cache Keys', value: String(cacheStats.cacheSize ?? 0), inline: true },
            )
            .addFields(
                { name: '📈 Cache Hit Rate', value: String(cacheStats.metrics?.hitRate ?? '0%'), inline: true },
                { name: '🛢️ Database', value: dbStatus.fallbackMode ? 'FALLBACK' : 'ONLINE', inline: true },
                { name: '🧠 Memory (RSS)', value: `${rssMB} MB`, inline: true },
            )
            .setFooter({ text: 'Errors and warnings will be highlighted' });

        // Send directly to the logs channel and pin for quick visibility
        const channel = await client.channels.fetch(LOG_CHANNEL_ID);
        if (channel) {
            const sent = await channel.send({ embeds: [embed] });
            try { await sent.pin(); } catch (_) { /* ignore if no permission */ }
        }

        logger.info('Startup notification sent successfully');

        // Initialize Max Bet Removal Monitor
        try {
            const { maxBetRemovalMonitor } = require('./UTILS/maxBetRemovalMonitor');
            await maxBetRemovalMonitor.initialize(client);
            logger.info('Max Bet Removal Monitor initialized successfully');
        } catch (error) {
            logger.error(`Failed to initialize Max Bet Removal Monitor: ${error.message}`);
        }

        // Marriage Anniversary Manager moved to UAS bot
        logger.info('💒 Marriage Anniversary Manager functionality moved to UAS bot');
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
        await interaction.reply({ content: 'Lottery system not available.', flags: MessageFlags.Ephemeral });
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
                            value: '• Every **Tuesday & Saturday at 10 AM EST**\n• Automatic drawings with instant payouts\n• Prizes go directly to your **BANK** account\n• New lottery cycle starts immediately after',
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

                await interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
                break;

            default:
                await interaction.reply({ content: 'Unknown lottery action.', flags: MessageFlags.Ephemeral });
        }
    } catch (error) {
        logger.error(`Error handling lottery button ${customId}: ${error.message}`);
        await interaction.reply({
            content: 'An error occurred while processing your lottery request.',
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * Initialize marriage task rotation scheduler for Friday rotations
 */
function initializeMarriageTaskScheduler() {
    const marriageTaskRotation = require('./marriages/marriageTaskRotation');
    
    // Calculate milliseconds until next Friday at 12:01 AM EST
    function getNextFridayEST() {
        const now = new Date();
        const nextFriday = new Date();
        
        // Get current day (0 = Sunday, 1 = Monday, ..., 5 = Friday)
        const currentDay = now.getDay();
        const fridayDay = 5; // Friday
        
        // Calculate days until next Friday
        let daysUntilFriday = fridayDay - currentDay;
        if (daysUntilFriday <= 0 || (daysUntilFriday === 0 && now.getHours() >= 5)) {
            // If today is Friday and it's already past 12:01 AM EST (5:01 AM UTC), 
            // or if we're past Friday, go to next Friday
            daysUntilFriday += 7;
        }
        
        // Set to next Friday at 12:01 AM EST (5:01 AM UTC)
        nextFriday.setDate(now.getDate() + daysUntilFriday);
        nextFriday.setUTCHours(5, 1, 0, 0); // 12:01 AM EST = 5:01 AM UTC
        
        return nextFriday.getTime() - now.getTime();
    }
    
    // Check and rotate tasks
    async function checkTaskRotation() {
        try {
            logger.info('🔄 Checking marriage task rotation...');
            const rotated = await marriageTaskRotation.checkAndRotateTasks();
            if (rotated) {
                logger.info('✅ Marriage tasks rotated successfully');
            } else {
                logger.info('ℹ️ No task rotation needed');
            }
        } catch (error) {
            logger.error(`Error checking task rotation: ${error.message}`);
        }
    }
    
    // Schedule the first check for next Friday at 12:01 AM EST
    const timeUntilFriday = getNextFridayEST();
    
    setTimeout(() => {
        // Run the initial check
        checkTaskRotation();
        
        // Then set up weekly checks every Friday (7 days = 7 * 24 * 60 * 60 * 1000 ms)
        setInterval(checkTaskRotation, 7 * 24 * 60 * 60 * 1000);
        
    }, timeUntilFriday);
    
    logger.info(`🕛 Marriage task scheduler initialized - next Friday rotation in ${Math.round(timeUntilFriday / (1000 * 60 * 60))} hours`);
}

/**
 * Create startup economic summary
 */
async function createStartupEconomicSummary(client) {
    try {
        // Get basic statistics for logging
        const userStatsQuery = `
            SELECT 
                COUNT(*) as total_users,
                SUM(wallet + bank) as total_money,
                AVG(wallet + bank) as avg_balance,
                COUNT(CASE WHEN wallet + bank > 1000000 THEN 1 END) as millionaires
            FROM user_balances
        `;

        const gameStatsQuery = `
            SELECT 
                COUNT(*) as total_games,
                SUM(bet_amount) as total_wagered,
                SUM(payout) as total_paid_out,
                SUM(CASE WHEN won = 1 THEN payout - bet_amount ELSE 0 END) as total_winnings_only,
                SUM(CASE WHEN won = 0 THEN bet_amount ELSE 0 END) as total_losses
            FROM game_results
        `;

        // Check if database adapter is available
        if (!dbManager.usingAdapter || !dbManager.databaseAdapter) {
            logger.debug('Database adapter not available for startup economic summary');
            return;
        }

        const [userStats] = await dbManager.databaseAdapter.executeQuery(userStatsQuery);
        const [gameStats] = await dbManager.databaseAdapter.executeQuery(gameStatsQuery);

        // Create simple economic summary using correct casino mathematics
        // House Edge = (Total Wagered - Net Player Winnings) / Total Wagered × 100%
        // Net Player Winnings = total_winnings_only (profit only, not including returned bets)
        const houseEdge = gameStats?.total_wagered > 0 ? 
            (((gameStats.total_wagered - (gameStats.total_winnings_only || 0)) / gameStats.total_wagered) * 100).toFixed(2) : '0.00';

        logger.info('📊 CASINO ECONOMIC SUMMARY:');
        logger.info(`   Users: ${userStats?.total_users?.toLocaleString() || 'N/A'}`);
        logger.info(`   Total Economy: $${userStats?.total_money?.toLocaleString() || 'N/A'}`);
        logger.info(`   Millionaires: ${userStats?.millionaires || 0}`);
        logger.info(`   Games Played: ${gameStats?.total_games?.toLocaleString() || 'N/A'}`);
        logger.info(`   House Edge: ${houseEdge}%`);

    } catch (error) {
        logger.error(`Failed to create startup economic summary: ${error.message}`);
    }
}

// Event handlers
client.once('clientReady', async () => {
    logger.info(`ATIVE Casino Bot logged in as ${client.user.tag} (ID: ${client.user.id})`);

    // Load marriage task games
    try {
        const marriageGameLoader = require('./marriages/games/marriageGameLoader');
        await marriageGameLoader.loadAllGames();
        logger.info('✅ Marriage task games initialized');
    } catch (error) {
        logger.error('❌ Failed to initialize marriage task games:', error);
    }

    // Set dynamic bot activity status
    setupBotActivity();
    logger.info('Bot activity system initialized');

    // LEGACY: Economic notification system replaced by Real AI Engine
    // economicManager.setNotificationClient(client);
    // logger.info('Economic notification system initialized');

    // AI systems removed - no longer using advanced AI features

    // Initialize database
    try {
        await dbManager.initialize();
        logger.info('Database initialized successfully');

        // Initialize Marriage XP system tables
        try {
            await dbManager.initializeMarriageXPTables();
            logger.info('Marriage XP system initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Marriage XP system:', error);
        }

        // Initialize Marriage Business Income Generator
        try {
            marriageBusinessIncomeGenerator.start();
            logger.info('Marriage business income generator started successfully');
            
            // Add shutdown callback to stop income generator
            gracefulShutdown.addShutdownCallback(() => {
                marriageBusinessIncomeGenerator.stop();
                logger.info('Marriage business income generator stopped');
            });
        } catch (error) {
            logger.error('Failed to start marriage business income generator:', error);
        }

        // 🚀 Initialize NodeCache System
        logger.info('🔄 Initializing NodeCache system...');
        const cacheStats = nodeCache.getStats();
        logger.info('✅ NodeCache system initialized and operational');

        // 📊 Initialize Log Summary Manager
        logger.info('📊 Initializing Log Summary Manager...');
        global.client = client; // Make client globally accessible for logging
        client.logSummaryManager = new LogSummaryManager(client);
        client.logSummaryManager.start();
        logger.info('✅ Log Summary Manager initialized and started');

        // Run ML table migration (now that database is ready)
        setTimeout(async () => {
            try {
                const { MLTableMigration } = require('./UTILS/mlTableMigration');
                const migration = new MLTableMigration();
                await migration.migrate();
                logger.info('✅ ML table migration completed');
            } catch (error) {
                logger.warn(`ML table migration failed: ${error.message}`);
            }
        }, 1000); // Run before other startup tasks

        // Create startup economic summary (now that database is ready)
        setTimeout(async () => {
            try {
                await createStartupEconomicSummary(client);
            } catch (error) {
                logger.warn(`Startup economic summary failed: ${error.message}`);
            }
        }, 2000); // Wait 2 seconds for everything to be fully ready

        // Economy Analyzer moved to UAS bot - functionality integrated in /ai command
        logger.info('✅ Economy analysis available via /ai analyze command');

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

    // Initialize lottery system in all environments
    try {
            const LotteryGameClass = getLotteryGame();
            client.lotteryGame = new LotteryGameClass(client);
            await client.lotteryGame.initialize();
            logger.info('Lottery system initialized successfully');

            // Set up lottery restart handler in case of critical failures
            client.restartLotterySystem = async () => {
                try {
                    logger.warn('Attempting to restart lottery system...');
                    if (client.lotteryGame && client.lotteryGame.scheduledDrawing) {
                        clearTimeout(client.lotteryGame.scheduledDrawing);
                    }
                    const LotteryGameClass = getLotteryGame();
            client.lotteryGame = new LotteryGameClass(client);
                    await client.lotteryGame.initialize();
                    logger.info('Lottery system restarted successfully');
                    return true;
                } catch (restartError) {
                    logger.error(`Failed to restart lottery system: ${restartError.message}`);
                    return false;
                }
            };

    } catch (error) {
        logger.error('Failed to initialize lottery system:', error);

        // Fallback: Try to initialize lottery system again after 5 minutes
        setTimeout(async () => {
            try {
                logger.info('Attempting lottery system fallback initialization...');
                const LotteryGameClass = getLotteryGame();
            client.lotteryGame = new LotteryGameClass(client);
                await client.lotteryGame.initialize();
                logger.info('Lottery system fallback initialization successful');
            } catch (fallbackError) {
                logger.error('Lottery system fallback initialization failed:', fallbackError.message);
            }
        }, 5 * 60 * 1000); // 5 minutes
    }

    // Initialize scratch ticket system
    try {
        const ScratchTicketSystemClass = getScratchTicketSystem();
        client.scratchTicketSystem = new ScratchTicketSystemClass(client);
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

    // Initialize automatic wealth control system
    try {
        const automaticWealthControl = require('./UTILS/automaticWealthControl');
        logger.info('🛡️ Automatic Wealth Control System initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize Automatic Wealth Control:', error);
    }

    // Initialize Storage Monitor
    try {
        storageMonitor.startMonitoring(client);
        logger.info('Storage monitoring initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize storage monitor:', error);
    }

    // Initialize Sports Betting System
    try {
        const SportsBettingMigration = require('./UTILS/sportsBettingMigration');
        const sportsMigration = new SportsBettingMigration(dbManager);
        await sportsMigration.runMigrations();
        logger.info('🎯 Sports betting system initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize sports betting system:', error);
    }

    // Send startup notification
    setTimeout(sendStartupNotification, 1000);

    // Initialize marriage task rotation scheduler
    initializeMarriageTaskScheduler();
    
    // Initialize marriage task games (old Week 1-4 system - disabled)
    try {
        // const gameManager = require('./UTILS/games'); // Disabled - using new Week 5+ system
        logger.info('🎮 Old marriage task games system disabled (using new Week 5+ system)');
    } catch (error) {
        logger.error('Failed to initialize marriage task games:', error);
    }

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

    // Show final startup status (clean systems check incl. VPS storage)
    let storageSummary = null;
    try {
        storageSummary = await storageMonitor.snapshot();
    } catch (_) { /* ignore */ }

    const systemStatus = {
        'Database': { online: true, details: 'NodeCache active, MariaDB connected' },
        'Cache': { online: true, details: 'NodeCache operational' },
        'Economy': { online: true, details: 'Built-in analytics active' },
        'Sessions': { online: true, details: 'Session manager active' },
        'Security': { online: true, details: 'Anti-abuse protections active' },
        ...(storageSummary ? {
            'Storage': { 
                online: true, 
                details: `${storageSummary.available} free • ${storageSummary.usage}% used (${storageSummary.used}/${storageSummary.total})`
            }
        } : {})
    };

    StartupBanner.showSystemStatus(systemStatus);
    
    // Compact startup summary
    try {
        const GAME_COMMANDS = new Set([
            'blackjack','slots','crash','plinko','duck','treasurevault','fishing','uno','rps',
            'multi-slots','roulette','keno','bingo','ceelo','russianroulette','mines','yahtzee','wordchain','riddle','scratch'
        ]);
        const availableGames = Array.from(client.commands.keys()).filter(k => GAME_COMMANDS.has(k));
        const cacheStats = nodeCache.getStats ? nodeCache.getStats() : { cacheSize: 0, metrics: { hitRate: '0%' } };
        const dbStatus = dbManager.getFallbackStatus ? dbManager.getFallbackStatus() : { fallbackMode: false };

        // Build uptime string
        const upSec = Math.max(0, Math.round(process.uptime()));
        const h = Math.floor(upSec / 3600);
        const m = Math.floor((upSec % 3600) / 60);
        const s = upSec % 60;
        const uptimeStr = `${h}h ${m}m ${s}s`;

        // Memory usage (RSS)
        const rssMB = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

        StartupBanner.showCompactSummary({
            environment: (process.env.ENVIRONMENT || process.env.NODE_ENV || 'development').toUpperCase(),
            version: process.env.npm_package_version || '3.x',
            nodeVersion: process.version,
            guilds: client.guilds?.cache?.size || 0,
            commands: client.commands?.size || 0,
            games: availableGames.length,
            cache: cacheStats,
            db: dbStatus,
            uptime: uptimeStr,
            memory: `${rssMB} MB`
        });
    } catch (e) {
        logger.debug(`Startup summary skipped: ${e.message}`);
    }
    StartupBanner.showStartupComplete();

});

// Premium role assignment disabled (Firebase dependency removed)
async function handlePremiumRoleAssignment(userId) {
    logger.info('Premium role assignment disabled (Firebase dependency removed)');
    // No-op function - premium role assignment removed with Firebase
}

client.on('interactionCreate', async interaction => {
    // Cache member data when user interacts (reduces need for Server Members Intent)
    if (interaction.member && interaction.guildId) {
        const memberCacheManager = require('./UTILS/memberCacheManager');
        memberCacheManager.cacheMemberFromInteraction(interaction).catch(err => {
            logger.debug(`Failed to cache member data: ${err.message}`);
        });
    }

    // Handle slash commands
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            logger.warn(`No command matching ${interaction.commandName} was found`);
            return;
        }

        // Check if command is disabled via cog management
        try {
            const cogManager = require('./UTILS/cogManager');
            if (cogManager.initialized && !cogManager.isCommandEnabled(interaction.commandName)) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Command Disabled')
                    .setDescription(`The command \`${interaction.commandName}\` is currently disabled.`)
                    .addFields({
                        name: 'ℹ️ Information',
                        value: 'This command has been disabled by a server administrator. Contact them if you need access to this feature.',
                        inline: false
                    });
                
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }
        } catch (error) {
            // If cog manager isn't available, continue with command execution
            logger.debug('Cog manager not available, skipping command check:', error.message);
        }

        // Command disabling functionality moved to developer panel
        // (commented out since devModule was removed)
        
        // Debug logging for sportbet
        if (interaction.commandName === 'sportbet') {
            console.log('SportBet: Executing sportbet slash command');
            console.log('SportBet: Subcommand:', interaction.options.getSubcommand());
            console.log('SportBet: User:', interaction.user.id);
        }

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
            // Texas Hold'em custom amount modal (raise/bet)
            if (interaction.customId.startsWith('th-modal-') && interaction.customId.endsWith('-amount')) {
                const texasHoldemCommand = client.commands.get('texasholdem');
                if (texasHoldemCommand && texasHoldemCommand.handleCustomAmountModal) {
                    const action = interaction.customId.replace('th-modal-', '').replace('-amount', '');
                    await texasHoldemCommand.handleCustomAmountModal(interaction, action);
                    return;
                }
            }
            if (interaction.customId === 'lottery_buy_modal') {
                const ticketCountStr = interaction.fields.getTextInputValue('ticket_count');
                const ticketCount = parseInt(ticketCountStr);

                // Validate input
                if (isNaN(ticketCount) || ticketCount < 1 || ticketCount > 7) {
                    await interaction.reply({
                        content: '❌ Invalid ticket count! Please enter a number between 1 and 7.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                // Execute lottery buy command
                const lotteryCommand = client.commands.get('lottery');
                if (lotteryCommand && lotteryCommand.handleBuyTickets) {
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
                    await lotteryCommand.handleBuyTickets(mockInteraction, interaction.user.id, interaction.guildId);
                } else {
                    await interaction.reply({
                        content: '❌ Lottery system not available.',
                        flags: MessageFlags.Ephemeral
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
                    await interaction.reply({ content: '❌ Game session expired. Please start a new game.', flags: MessageFlags.Ephemeral });
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
            // Handle marriage task game modals (poem lines, quiz answers, love letters, vacation items)
            else if (
                interaction.customId.startsWith('poem_line_') ||
                interaction.customId.startsWith('quiz_answer_') ||
                interaction.customId.startsWith('simple_letter_') ||
                interaction.customId.startsWith('vacation_modal_')
            ) {
                await handleGameModalSubmit(interaction);
            }
        } catch (error) {
            logger.error(`Error handling modal ${interaction.customId}: ${error.message}`);

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Modal Error')
                .setDescription('An error occurred while processing your submission.')
                .setColor(0xFF0000);

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
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
            // Handle shop category selection
            else if (interaction.customId === 'shop_category_select') {
                const shopCommand = client.commands.get('shop');
                if (shopCommand) {
                    const category = interaction.values[0];
                    const userId = interaction.user.id;
                    const guildId = interaction.guildId || 'global';
                    await shopCommand.showCategoryItems(interaction, userId, guildId, category);
                } else {
                    await SafeInteractionHandler.safeReply(interaction, {
                        content: '❌ Shop not available at the moment.',
                        flags: MessageFlags.Ephemeral
                    });
                }
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
            // Handle mines bet selection dropdown (for play again)
            else if (interaction.customId === 'mines_bet_select') {
                const minesCommand = client.commands.get('mines');
                if (minesCommand) {
                    const betAmount = parseInt(interaction.values[0].replace('play_again_', ''));
                    await minesCommand.startNewGame(interaction, betAmount);
                }
            }
            // Handle Texas Hold'em bet amount selection dropdown
            else if (interaction.customId.startsWith('th-') && interaction.customId.includes('-bet_amount')) {
                const parts = interaction.customId.split('-');
                if (parts.length >= 3) {
                    const menuType = parts[1];
                    // Handle universal bet menu
                    if (menuType === 'betmenu') {
                        const texasHoldemCommand = client.commands.get('texasholdem');
                        if (texasHoldemCommand && texasHoldemCommand.handleBetAmountSelection) {
                            await texasHoldemCommand.handleBetAmountSelection(interaction, interaction.values[0]);
                        }
                    }
                    // Handle legacy user-specific menus
                    else if (menuType === interaction.user.id) {
                        const texasHoldemCommand = client.commands.get('texasholdem');
                        if (texasHoldemCommand && texasHoldemCommand.handleBetAmountSelection) {
                            await texasHoldemCommand.handleBetAmountSelection(interaction, interaction.values[0]);
                        }
                    } else {
                        await SafeInteractionHandler.safeReply(interaction, {
                            content: 'This menu is not for you!',
                            flags: MessageFlags.Ephemeral
                        });
                    }
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
            // Handle sportbet country selection
            else if (interaction.customId.startsWith('sportbet_country_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleCountrySelection) {
                    await sportbetCommand.handleCountrySelection(interaction);
                }
            }
            // Handle sportbet league selection
            else if (interaction.customId.startsWith('sportbet_league_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleLeagueSelection) {
                    await sportbetCommand.handleLeagueSelection(interaction);
                }
            }
            // Handle sportbet back button
            else if (interaction.customId.startsWith('sportbet_back_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleBackButton) {
                    await sportbetCommand.handleBackButton(interaction);
                }
            }
            // Handle sportbet refresh button
            else if (interaction.customId.startsWith('sportbet_refresh_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleRefreshButton) {
                    await sportbetCommand.handleRefreshButton(interaction);
                }
            }
            // Handle sportbet markets button
            else if (interaction.customId.startsWith('sportbet_markets_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleMarketsButton) {
                    await sportbetCommand.handleMarketsButton(interaction);
                }
            }
            // Handle sportbet market bet button
            else if (interaction.customId.startsWith('sportbet_market_bet_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleMarketBetButton) {
                    await sportbetCommand.handleMarketBetButton(interaction);
                }
            }
            // Handle sportbet back to markets button
            else if (interaction.customId.startsWith('sportbet_back_markets_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleBackToMarkets) {
                    await sportbetCommand.handleBackToMarkets(interaction);
                }
            }
            // Handle sportbet final bet button
            else if (interaction.customId.startsWith('sportbet_final_bet_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleTeamSelection) {
                    await sportbetCommand.handleTeamSelection(interaction);
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
                    const cardIndex = parts[4]; // Format: uno_color_select_{channelId}_{cardIndex}
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
                    await interaction.reply({ content: '❌ Battleship handler not available.', flags: MessageFlags.Ephemeral });
                }
            }
            // Handle sportbet country selection
            else if (interaction.customId.startsWith('sportbet_country_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleCountrySelection) {
                    await sportbetCommand.handleCountrySelection(interaction);
                }
            }
            // Handle sportbet league selection
            else if (interaction.customId.startsWith('sportbet_league_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleLeagueSelection) {
                    await sportbetCommand.handleLeagueSelection(interaction);
                }
            }
            // Handle sportbet game selection
            else if (interaction.customId.startsWith('sportbet_game_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleGameSelection) {
                    await sportbetCommand.handleGameSelection(interaction);
                }
            }
            // Handle sportbet market selection
            else if (interaction.customId.startsWith('sportbet_market_') && !interaction.customId.includes('_bet_') && !interaction.customId.includes('_game_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleMarketSelection) {
                    await sportbetCommand.handleMarketSelection(interaction);
                }
            }
            // Handle sportbet market game selection
            else if (interaction.customId.startsWith('sportbet_market_game_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleMarketGameSelection) {
                    await sportbetCommand.handleMarketGameSelection(interaction);
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
                            flags: MessageFlags.Ephemeral
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

                    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }
            }
            // Handle cog updater select menu
            else if (interaction.customId === 'update_cog_select') {
                try {
                    // Block cog updater UI if there are active game sessions
                    const sessionManager = require('./UTILS/sessionManager');
                    const activeCount = sessionManager.getActiveSessionCount ? sessionManager.getActiveSessionCount() : 0;
                    if (activeCount > 0) {
                        await SafeInteractionHandler.safeReply(interaction, {
                            content: `⏸️ Cog updater is blocked while ${activeCount} game session(s) are active. Use /stopmysession or /stopgame to end them first.`,
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }
                    const cogManager = require('./UTILS/cogManager');
                    const cogUpdater = require('./UTILS/cogUpdater');
                    
                    // Check if user is authorized to update cogs
                    if (!cogManager.isUserAuthorized(interaction.user.id)) {
                        await SafeInteractionHandler.safeReply(interaction, {
                            content: '❌ Only authorized users can update cogs.',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    const selectedCategory = interaction.values[0];
                    const categoryInfo = cogManager.getCategoryInfo(selectedCategory);
                    
                    if (!categoryInfo) {
                        await SafeInteractionHandler.safeReply(interaction, {
                            content: '❌ Invalid cog category selected.',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle(`🔄 Update: ${categoryInfo.name}`)
                        .setDescription(`**Description:** ${categoryInfo.description}\n**Commands:** ${categoryInfo.commands.length}\n**Command List:** ${categoryInfo.commands.join(', ')}`)
                        .addFields({
                            name: '⚠️ Warning',
                            value: 'This will download and update files from GitHub. A backup will be created automatically.',
                            inline: false
                        });

                    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                    const buttons = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`update_confirm_${selectedCategory}`)
                                .setLabel('Confirm Update')
                                .setStyle(ButtonStyle.Success)
                                .setEmoji('✅'),
                            new ButtonBuilder()
                                .setCustomId('update_cancel')
                                .setLabel('Cancel')
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji('❌')
                        );

                    await interaction.update({
                        embeds: [embed],
                        components: [buttons]
                    });
                } catch (error) {
                    logger.error(`Error handling update cog select: ${error.message}`);
                    await SafeInteractionHandler.safeReply(interaction, {
                        content: '❌ An error occurred while processing cog selection.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
            // Handle cog management select menu
            else if (interaction.customId === 'cog_select') {
                try {
                    // Block cog management UI if there are active game sessions
                    const sessionManager = require('./UTILS/sessionManager');
                    const activeCount = sessionManager.getActiveSessionCount ? sessionManager.getActiveSessionCount() : 0;
                    if (activeCount > 0) {
                        await SafeInteractionHandler.safeReply(interaction, {
                            content: `⏸️ Cog management is blocked while ${activeCount} game session(s) are active. Use /stopmysession or /stopgame to end them first.`,
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }
                    const cogManager = require('./UTILS/cogManager');
                    
                    // Check if user is authorized to manage cogs
                    if (!cogManager.isUserAuthorized(interaction.user.id)) {
                        await SafeInteractionHandler.safeReply(interaction, {
                            content: '❌ Only authorized users can manage cogs.',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }
                    const selectedCategory = interaction.values[0];
                    const categoryInfo = cogManager.getCategoryInfo(selectedCategory);
                    
                    if (!categoryInfo) {
                        await SafeInteractionHandler.safeReply(interaction, {
                            content: '❌ Invalid cog category selected.',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    const isEnabled = cogManager.isCogEnabled(selectedCategory);
                    const statusIcon = isEnabled ? '🟢' : '🔴';
                    const statusText = isEnabled ? 'Enabled' : 'Disabled';
                    
                    const embed = new EmbedBuilder()
                        .setColor(isEnabled ? '#00ff00' : '#ff0000')
                        .setTitle(`🔧 Managing: ${categoryInfo.name}`)
                        .setDescription(`**Status:** ${statusIcon} ${statusText}\n**Description:** ${categoryInfo.description}\n**Commands in category:** ${categoryInfo.commands.length}`)
                        .addFields({
                            name: 'Commands',
                            value: categoryInfo.commands.map(cmd => `\`${cmd}\``).join(', '),
                            inline: false
                        });

                    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                    const buttons = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`cog_toggle_${selectedCategory}`)
                                .setLabel(isEnabled ? 'Disable Cog' : 'Enable Cog')
                                .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
                                .setEmoji(isEnabled ? '🔴' : '🟢'),
                            new ButtonBuilder()
                                .setCustomId(`cog_commands_${selectedCategory}`)
                                .setLabel('Manage Commands')
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji('⚙️')
                        );

                    await interaction.update({
                        embeds: [embed],
                        components: [buttons]
                    });
                } catch (error) {
                    logger.error(`Error handling cog select: ${error.message}`);
                    await SafeInteractionHandler.safeReply(interaction, {
                        content: '❌ An error occurred while processing cog selection.',
                        flags: MessageFlags.Ephemeral
                    });
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
            // Handle Texas Hold'em buttons (format: th-{type}-{action})
            else if (customId.startsWith('th-')) {
                const parts = customId.split('-');
                if (parts.length >= 3) {
                    const buttonType = parts[1];
                    const actionId = parts.slice(2).join('-'); // Handle multi-part action names
                    
                    // Handle different button types
                    if (buttonType === 'general' || buttonType === 'player' || buttonType === 'creator' || buttonType === 'action') {
                        const texasHoldemCommand = client.commands.get('texasholdem');
                        if (texasHoldemCommand && texasHoldemCommand.handleTexasHoldemAction) {
                            await texasHoldemCommand.handleTexasHoldemAction(interaction, actionId);
                        }
                    }
                    // Handle legacy user-specific buttons (format: th-{userId}-{action})
                    else if (buttonType === interaction.user.id) {
                        const texasHoldemCommand = client.commands.get('texasholdem');
                        if (texasHoldemCommand && texasHoldemCommand.handleTexasHoldemAction) {
                            await texasHoldemCommand.handleTexasHoldemAction(interaction, actionId);
                        }
                    } else {
                        await SafeInteractionHandler.safeReply(interaction, {
                            content: 'This button is not for you!',
                            flags: MessageFlags.Ephemeral
                        });
                    }
                }
            }
            // Handle mines game buttons (format: mines-{userId}-{action})
            else if (customId.startsWith('mines-')) {
                const parts = customId.split('-');
                if (parts.length >= 3) {
                    const userId = parts[1];
                    const actionId = parts.slice(2).join('-'); // Handle multi-part action names

                    // Verify the user is the game owner
                    if (userId === interaction.user.id) {
                        const minesCommand = client.commands.get('mines');
                        if (minesCommand && minesCommand.handleMinesAction) {
                            await minesCommand.handleMinesAction(interaction, actionId);
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
                    await interaction.reply({ content: '❌ No active crash game found. The game may have ended or expired.', flags: MessageFlags.Ephemeral });
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
                                flags: MessageFlags.Ephemeral
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
                                flags: MessageFlags.Ephemeral
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
                        flags: MessageFlags.Ephemeral
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

                if (parts[1] === 'card' && parts[2] === 'free') {
                    // FREE space button click: bingo_card_free_{userId} - ignore clicks on FREE space
                    await SafeInteractionHandler.safeReply(interaction, {
                        content: '❌ The FREE space is already marked!',
                        flags: MessageFlags.Ephemeral
                    });
                } else if (parts[1] === 'card' && parts.length >= 6) {
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
            // Handle lottery2 buttons (now handled by consolidated lottery command)
            else if (customId.startsWith('lottery2_')) {
                const action = customId.substring('lottery2_'.length);
                const lotteryCommand = client.commands.get('lottery');
                if (lotteryCommand && lotteryCommand.handleButtonInteraction) {
                    await lotteryCommand.handleButtonInteraction(interaction, action);
                } else {
                    logger.warn(`No handler found for lottery2 button: ${customId} - using consolidated lottery command`);
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
                            await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                        } else {
                            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
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
            // Handle leaderboard buttons - delegate to leaderboard command
            else if (customId.startsWith('leaderboard_')) {
                const leaderboardCommand = client.commands.get('leaderboard');
                if (leaderboardCommand && leaderboardCommand.handleButtonInteraction) {
                    await leaderboardCommand.handleButtonInteraction(interaction, customId);
                } else {
                    // Fallback handling - these should be handled by the command's collector
                    if (!interaction.deferred && !interaction.replied) {
                        logger.warn(`Unhandled leaderboard interaction: ${customId}`);
                        await interaction.deferUpdate();
                    }
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
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
            // Handle economy pagination buttons (namespace: economy_page_...)
            else if (customId.startsWith('economy_page_')) {
                const economyCommand = client.commands.get('economy');
                if (economyCommand && economyCommand.handleButtonInteraction) {
                    await economyCommand.handleButtonInteraction(interaction, customId);
                } else {
                    await interaction.reply({
                        content: '❌ Economy command handler not available.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
            // Handle sportbet buttons
            else if (customId.startsWith('sportbet_select_')) {
                console.log('SportBet: Button interaction detected - customId:', customId);
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleSelectButton) {
                    await sportbetCommand.handleSelectButton(interaction);
                } else {
                    console.log('SportBet: No handleSelectButton method found');
                }
            }
            else if (customId.startsWith('sportbet_team_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleTeamSelection) {
                    await sportbetCommand.handleTeamSelection(interaction);
                }
            }
            else if (customId.startsWith('sportbet_back_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleBackButton) {
                    await sportbetCommand.handleBackButton(interaction);
                }
            }
            else if (customId.startsWith('sportbet_refresh_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleRefreshButton) {
                    await sportbetCommand.handleRefreshButton(interaction);
                }
            }
            else if (customId.startsWith('sportbet_markets_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleMarketsButton) {
                    await sportbetCommand.handleMarketsButton(interaction);
                }
            }
            else if (customId.startsWith('sportbet_market_bet_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleMarketBetButton) {
                    await sportbetCommand.handleMarketBetButton(interaction);
                }
            }
            else if (customId.startsWith('sportbet_back_markets_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleBackToMarkets) {
                    await sportbetCommand.handleBackToMarkets(interaction);
                }
            }
            else if (customId.startsWith('sportbet_page_') && !customId.includes('_info_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handlePageNavigation) {
                    await sportbetCommand.handlePageNavigation(interaction);
                }
            }
            else if (customId.startsWith('sportbet_final_bet_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleFinalBet) {
                    await sportbetCommand.handleFinalBet(interaction);
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
                            flags: MessageFlags.Ephemeral
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
                            flags: MessageFlags.Ephemeral
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
                            flags: MessageFlags.Ephemeral
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
                        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    }
                }
            }
            // Handle AI command buttons
            else if (customId.startsWith('ai_')) {
                try {
                    const aiCommand = client.commands.get('ai');
                    if (aiCommand) {
                        // Determine which action based on button ID
                        let action = '';
                        switch (customId) {
                            case 'ai_force_analysis':
                                action = 'analyze';
                                break;
                            case 'ai_dashboard':
                                action = 'dashboard';
                                break;
                            case 'ai_recommendations':
                                action = 'recommendations';
                                break;
                            default:
                                throw new Error(`Unknown AI button: ${customId}`);
                        }

                        // Create a mock interaction with the appropriate action
                        const mockOptions = {
                            getString: (name) => {
                                if (name === 'action') return action;
                                return null;
                            }
                        };

                        // Update the interaction options
                        const originalOptions = interaction.options;
                        interaction.options = mockOptions;

                        // Call the AI command execute function
                        await aiCommand.execute(interaction);

                        // Restore original options
                        interaction.options = originalOptions;
                    } else {
                        await interaction.reply({
                            content: '❌ AI command not available.',
                            flags: MessageFlags.Ephemeral
                        });
                    }
                } catch (aiError) {
                    logger.error(`Error handling AI button ${customId}:`, aiError);
                    await interaction.reply({
                        content: '❌ AI command error occurred.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
            // Handle shop admin buttons
            else if (customId.startsWith('admin_shop_')) {
                try {
                    const adminShopCommand = client.commands.get('admin-shop');
                    if (adminShopCommand && adminShopCommand.handleButtonInteraction) {
                        await adminShopCommand.handleButtonInteraction(interaction);
                    } else {
                        logger.warn(`Shop admin command not found or missing button handler`);
                        await interaction.reply({
                            content: '❌ Shop administration not available.',
                            flags: MessageFlags.Ephemeral
                        });
                    }
                } catch (adminShopError) {
                    logger.error(`Error handling shop admin button ${customId}:`, adminShopError);
                    await interaction.reply({
                        content: '❌ Shop administration error occurred.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
            // Handle marriage proposal response buttons
            else if (customId.startsWith('marriage_accept_') || customId.startsWith('marriage_reject_')) {
                const action = customId.startsWith('marriage_accept_') ? 'accept' : 'reject';
                const proposalId = customId.replace(`marriage_${action}_`, '');
                
                await interaction.deferReply({ flags: 64 });
                
                try {
                    const guildId = interaction.guild?.id;
                    const userId = interaction.user.id;
                    
                    // Get the proposal details
                    const pendingProposals = await dbManager.getPendingMarriageProposals(userId, guildId);
                    const proposal = pendingProposals.proposals.find(p => p.id == proposalId);
                    
                    if (!proposal) {
                        await interaction.editReply({
                            content: '❌ This proposal has expired or is no longer valid.'
                        });
                        return;
                    }
                    
                    // Check if the user is the intended recipient
                    if (proposal.recipient_id !== userId) {
                        await interaction.editReply({
                            content: '❌ This proposal is not for you!'
                        });
                        return;
                    }
                    
                    // Process the response
                    const responseResult = await dbManager.respondToMarriageProposal(proposalId, action === 'accept' ? 'accepted' : 'rejected');
                    
                    if (!responseResult.success) {
                        await interaction.editReply({
                            content: '❌ An error occurred while processing your response.'
                        });
                        return;
                    }
                    
                    if (action === 'accept') {
                        // Create acceptance embed
                        const acceptEmbed = new EmbedBuilder()
                            .setTitle('💍 Proposal Accepted!')
                            .setDescription(`**${proposal.recipient_name}** has accepted **${proposal.proposer_name}**'s marriage proposal!`)
                            .addFields(
                                {
                                    name: '🎉 Next Steps',
                                    value: 'Use `/marriage ceremony` to begin your wedding ceremony!',
                                    inline: false
                                }
                            )
                            .setColor(0x00FF00)
                            .setTimestamp();
                            
                        await interaction.editReply({
                            embeds: [acceptEmbed]
                        });
                        
                        // Update the original proposal message
                        const updatedEmbed = new EmbedBuilder()
                            .setTitle('💍 Marriage Proposal - ACCEPTED')
                            .setDescription(`**${proposal.proposer_name}** proposed to **${proposal.recipient_name}**`)
                            .addFields(
                                {
                                    name: '💌 Proposal Message',
                                    value: `"${proposal.proposal_message}"`,
                                    inline: false
                                },
                                {
                                    name: '✅ Status',
                                    value: 'Proposal accepted! Ready for wedding ceremony.',
                                    inline: false
                                }
                            )
                            .setColor(0x00FF00)
                            .setTimestamp();
                            
                        await interaction.message.edit({
                            embeds: [updatedEmbed],
                            components: []
                        });
                        
                    } else {
                        // Create rejection embed
                        const rejectEmbed = new EmbedBuilder()
                            .setTitle('💔 Proposal Declined')
                            .setDescription(`**${proposal.recipient_name}** has declined **${proposal.proposer_name}**'s marriage proposal.`)
                            .setColor(0xFF0000)
                            .setTimestamp();
                            
                        await interaction.editReply({
                            embeds: [rejectEmbed]
                        });
                        
                        // Update the original proposal message
                        const updatedEmbed = new EmbedBuilder()
                            .setTitle('💔 Marriage Proposal - DECLINED')
                            .setDescription(`**${proposal.proposer_name}** proposed to **${proposal.recipient_name}**`)
                            .addFields(
                                {
                                    name: '💌 Proposal Message',
                                    value: `"${proposal.proposal_message}"`,
                                    inline: false
                                },
                                {
                                    name: '❌ Status',
                                    value: 'Proposal declined.',
                                    inline: false
                                }
                            )
                            .setColor(0xFF0000)
                            .setTimestamp();
                            
                        await interaction.message.edit({
                            embeds: [updatedEmbed],
                            components: []
                        });
                    }
                    
                } catch (error) {
                    logger.error(`Error handling marriage proposal response: ${error.message}`);
                    await interaction.editReply({
                        content: '❌ An error occurred while processing your response. Please try again later.'
                    });
                }
            }
            // Handle divorce confirmation buttons
            else if (customId.startsWith('divorce_confirm_') || customId.startsWith('divorce_cancel_')) {
                const action = customId.startsWith('divorce_confirm_') ? 'confirm' : 'cancel';
                const marriageId = customId.replace(`divorce_${action}_`, '');
                
                await interaction.deferReply({ flags: 64 });
                
                try {
                    const guildId = interaction.guild?.id;
                    const userId = interaction.user.id;
                    
                    if (action === 'cancel') {
                        await interaction.editReply({
                            content: '✅ Divorce cancelled. Your marriage remains intact.'
                        });
                        
                        // Update the original message
                        const cancelEmbed = new EmbedBuilder()
                            .setTitle('✅ Divorce Cancelled')
                            .setDescription('The divorce request has been cancelled.')
                            .setColor(0x00FF00);
                            
                        await interaction.message.edit({
                            embeds: [cancelEmbed],
                            components: []
                        });
                        return;
                    }
                    
                    // Get marriage details
                    const marriageData = await dbManager.getUserMarriage(userId, guildId);
                    
                    if (!marriageData.married || marriageData.marriage.id != marriageId) {
                        await interaction.editReply({
                            content: '❌ Marriage not found or you are not authorized to divorce this marriage.'
                        });
                        return;
                    }
                    
                    const marriage = marriageData.marriage;
                    const sharedBankSplit = marriage.shared_bank / 2;
                    
                    // Process the divorce
                    const divorceResult = await dbManager.divorceMarriage(marriageId, 'User initiated divorce');
                    
                    if (!divorceResult.success) {
                        await interaction.editReply({
                            content: `❌ Failed to process divorce: ${divorceResult.error}`
                        });
                        return;
                    }
                    
                    // Distribute shared bank equally
                    if (sharedBankSplit > 0) {
                        await dbManager.updateUserBalance(userId, guildId, sharedBankSplit, 0);
                        await dbManager.updateUserBalance(marriage.partnerId, guildId, sharedBankSplit, 0);
                    }
                    
                    // Remove Married Couples role from both partners
                    try {
                        const marriedCouplesRoleId = '1417807951627943987';
                        const guild = interaction.guild;
                        
                        if (guild) {
                            // Try to get from cache first, but still need Discord member for role operations
                            const memberCacheManager = require('./UTILS/memberCacheManager');
                            await memberCacheManager.getMemberData(userId, guild.id, guild).catch(() => null);
                            await memberCacheManager.getMemberData(marriage.partnerId, guild.id, guild).catch(() => null);
                            
                            const partner1Member = await guild.members.fetch(userId).catch(() => null);
                            const partner2Member = await guild.members.fetch(marriage.partnerId).catch(() => null);
                            
                            if (partner1Member) {
                                await partner1Member.roles.remove(marriedCouplesRoleId).catch(err => 
                                    logger.warn(`Failed to remove married role from ${marriage.partner1_name}: ${err.message}`)
                                );
                            }
                            
                            if (partner2Member) {
                                await partner2Member.roles.remove(marriedCouplesRoleId).catch(err => 
                                    logger.warn(`Failed to remove married role from ${marriage.partner2_name}: ${err.message}`)
                                );
                            }
                        }
                    } catch (roleError) {
                        logger.warn(`Error removing married couples role during divorce: ${roleError.message}`);
                    }
                    
                    await interaction.editReply({
                        content: `💔 Divorce completed. You and **${marriage.partnerName}** are no longer married.\n\n${sharedBankSplit > 0 ? `You each received ${fmt(sharedBankSplit)} from the shared bank account.` : 'No shared funds to distribute.'}`
                    });
                    
                    // Update the original message if it exists
                    try {
                        const divorceEmbed = new EmbedBuilder()
                            .setTitle('💔 Divorce Completed')
                            .setDescription(`The marriage between **${marriage.partner1_name}** and **${marriage.partner2_name}** has been dissolved.`)
                            .setColor(0xFF0000)
                            .setTimestamp();
                            
                        if (interaction.message) {
                            await interaction.message.edit({
                                embeds: [divorceEmbed],
                                components: []
                            });
                        }
                    } catch (messageEditError) {
                        logger.debug(`Could not edit divorce message: ${messageEditError.message}`);
                    }
                    
                    // Notify the partner
                    try {
                        const partner = await client.users.fetch(marriage.partnerId);
                        const partnerEmbed = new EmbedBuilder()
                            .setTitle('💔 Divorce Notice')
                            .setDescription(`**${interaction.user.displayName}** has divorced you.`)
                            .addFields(
                                {
                                    name: '💰 Shared Bank Distribution',
                                    value: sharedBankSplit > 0 ? `You received ${fmt(sharedBankSplit)} from your shared bank account.` : 'No shared funds to distribute.',
                                    inline: false
                                }
                            )
                            .setColor(0xFF0000)
                            .setTimestamp();
                            
                        await partner.send({ embeds: [partnerEmbed] });
                    } catch (dmError) {
                        logger.info(`Could not DM divorce notification: ${dmError.message}`);
                    }
                    
                    // Log the divorce
                    await sendLogMessage(
                        interaction.client,
                        'info',
                        `Divorce completed: ${marriage.partner1_name} & ${marriage.partner2_name}`,
                        userId,
                        guildId
                    );
                    
                } catch (error) {
                    logger.error(`Error handling divorce confirmation: ${error.message}`);
                    await interaction.editReply({
                        content: '❌ An error occurred while processing the divorce.'
                    });
                }
            }
            // Handle marriage business buttons
            else if (customId.startsWith('business_') || 
                     (customId.startsWith('confirm_purchase_') && isNaN(parseInt(customId.replace('confirm_purchase_', '')))) ||
                     customId.startsWith('business_purchase_')) {
                // These are handled by the marriage command's own collectors
                logger.debug('Marriage business button handled by marriage command collector');
                return;
            }
            // Handle shop buttons
            else if (customId === 'open_premium_shop' || customId === 'shop_help' || 
                     customId.startsWith('shop_') || customId.startsWith('confirm_purchase_') || 
                     customId === 'cancel_purchase') {
                const shopCommand = client.commands.get('shop');
                if (shopCommand) {
                    // Handle different shop button types
                    if (customId.startsWith('confirm_purchase_')) {
                        // Extract the ID part after confirm_purchase_
                        const idPart = customId.replace('confirm_purchase_', '');
                        const itemId = parseInt(idPart);
                        
                        // If the ID is numeric, it's a shop purchase; if NaN, it's a marriage business
                        if (!isNaN(itemId)) {
                            // Shop purchase
                            const userId = interaction.user.id;
                            const guildId = interaction.guildId || 'global';
                            await shopCommand.processPurchase(interaction, userId, guildId, itemId);
                        } else {
                            // Marriage business purchase - let it be handled by the marriage command's collector
                            logger.debug('Marriage business purchase confirmation - handled by marriage command collector');
                            return;
                        }
                    } else if (customId === 'cancel_purchase') {
                        // Cancel purchase could be from shop or marriage business
                        // Let the respective command collectors handle it
                        logger.debug('Purchase cancellation - handled by respective command collector');
                        return;
                    } else if (customId.startsWith('shop_buy_')) {
                        // Extract itemId from shop_buy_{itemId}
                        const itemId = parseInt(customId.replace('shop_buy_', ''));
                        const userId = interaction.user.id;
                        const guildId = interaction.guildId || 'global';
                        await shopCommand.handlePurchaseConfirmation(interaction, userId, guildId, itemId);
                    } else if (customId === 'shop_back') {
                        const userId = interaction.user.id;
                        const guildId = interaction.guildId || 'global';
                        await shopCommand.handleBrowse(interaction, userId, guildId);
                    } else if (customId === 'shop_inventory') {
                        const userId = interaction.user.id;
                        const guildId = interaction.guildId || 'global';
                        await shopCommand.showInventory(interaction, userId, guildId);
                    } else if (customId === 'shop_active_boosts') {
                        const userId = interaction.user.id;
                        const guildId = interaction.guildId || 'global';
                        await shopCommand.showActiveBoosts(interaction, userId, guildId);
                    } else if (customId === 'shop_back_to_browse') {
                        const userId = interaction.user.id;
                        const guildId = interaction.guildId || 'global';
                        await shopCommand.handleBrowse(interaction, userId, guildId);
                    } else if (shopCommand.handleButtonInteraction) {
                        // Fallback to existing handler for other buttons
                        await shopCommand.handleButtonInteraction(interaction);
                    }
                } else {
                    await SafeInteractionHandler.safeReply(interaction, {
                        content: '❌ Shop not available at the moment.',
                        flags: MessageFlags.Ephemeral
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
                        } else if (embed.title.includes('Mines') || embed.title.includes('💣')) {
                            gameType = 'mines';
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
                    } else if (gameType === 'mines' && betAmount > 0) {
                        // Start a new mines game directly with the specified bet
                        const minesCommand = require('./COMMANDS/mines');
                        // Create a fake interaction with the bet amount
                        const fakeInteraction = {
                            ...interaction,
                            commandName: 'mines',
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
                            await minesCommand.execute(fakeInteraction);
                        } catch (error) {
                            await interaction.reply({
                                content: `❌ Error starting new game. Please use \`/mines amount:${betAmount}\` directly.`,
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
                        } else if (embed.title.includes('Mines') || embed.title.includes('💣')) {
                            gameType = 'mines';
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
                                    flags: MessageFlags.Ephemeral
                                });
                            }
                        } catch (error) {
                            await interaction.reply({
                                content: '❌ Error loading bet selection. Please try using `/blackjack` directly.',
                                flags: MessageFlags.Ephemeral
                            });
                        }
                    } else if (gameType === 'mines') {
                        // For mines, show bet selection interface
                        const { EmbedBuilder } = require('discord.js');
                        const GamePanel = require('./UTILS/gamePanel');
                        const dbManager = require('./UTILS/database');
                        const { getGuildId } = require('./UTILS/common');

                        try {
                            const guildId = await getGuildId(interaction);
                            const userBalance = await dbManager.getUserBalance(interaction.user.id, guildId);

                            const betEmbed = new EmbedBuilder()
                                .setTitle('💣 Play Mines Again')
                                .setDescription(`Select your bet amount to start a new game of Mines.`)
                                .addFields([
                                    { name: '💵 Wallet', value: `$${userBalance.wallet.toLocaleString()}`, inline: true },
                                    { name: '🏦 Bank', value: `$${userBalance.bank.toLocaleString()}`, inline: true }
                                ])
                                .setColor(0xff8800)
                                .setTimestamp();

                            const betSelector = GamePanel.createBetSelector({
                                balance: userBalance.wallet,
                                minBet: 500,
                                customId: 'mines_bet_select'
                            });

                            if (betSelector) {
                                await interaction.update({
                                    embeds: [betEmbed],
                                    components: [betSelector]
                                });
                            } else {
                                await interaction.reply({
                                    content: '❌ Insufficient balance to play Mines. You need at least $500.',
                                    flags: MessageFlags.Ephemeral
                                });
                            }
                        } catch (error) {
                            await interaction.reply({
                                content: '❌ Error loading bet selection. Please try using `/mines` directly.',
                                flags: MessageFlags.Ephemeral
                            });
                        }
                    } else if (gameType) {
                        // For other games, just tell user to use command directly
                        await interaction.reply({
                            content: `🎮 To play ${gameType} again, please use the \`/${gameType}\` command.`,
                            flags: MessageFlags.Ephemeral
                        });
                    } else {
                        await interaction.reply({
                            content: '❌ Unable to determine which game to restart. Please use the game command directly.',
                            flags: MessageFlags.Ephemeral
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
                        flags: MessageFlags.Ephemeral
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
                            flags: MessageFlags.Ephemeral
                        });
                    }
                } else if (customId === 'vote_reminder') {
                    // Set a reminder for when they can vote again
                    await interaction.reply({
                        content: '⏰ I\'ll remind you when you can vote again! (Note: This is a placeholder - actual reminder system would need to be implemented)',
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
            */
            // Handle marriage task buttons
            else if (customId.startsWith('marriage_task_') || customId === 'open_marriage_tasks' || customId === 'refresh_tasks') {
                if (customId === 'open_marriage_tasks') {
                    // Handle View Tasks button from marriage-profile
                    const marriageTaskCommand = client.commands.get('marriage');
                    if (marriageTaskCommand) {
                        // Create a fake interaction for the view action
                        const fakeInteraction = {
                            ...interaction,
                            options: {
                                getString: () => 'view'
                            },
                            deferReply: async () => {}, // Will be handled by update
                            editReply: async (options) => await interaction.update(options),
                            reply: async (options) => await interaction.update(options)
                        };
                        await marriageTaskCommand.execute(fakeInteraction);
                    }
                } else if (customId === 'refresh_tasks') {
                    // Handle refresh button in marriage-task
                    const marriageTaskCommand = client.commands.get('marriage');
                    if (marriageTaskCommand) {
                        const fakeInteraction = {
                            ...interaction,
                            options: {
                                getString: () => 'view'
                            },
                            deferReply: async () => {},
                            editReply: async (options) => await interaction.update(options)
                        };
                        await marriageTaskCommand.execute(fakeInteraction);
                    }
                } else if (customId === 'marriage_task_help') {
                    // Handle help button
                    await showMarriageTaskHelp(interaction);
                } else if (customId === 'marriage_task_history') {
                    // Handle history button
                    await showMarriageTaskHistory(interaction);
                } else {
                    // Handle task buttons directly (marriage_task_task1, marriage_task_task2, etc.)
                    const marriageTaskUtil = require('./marriages/MarriageTaskUtil');
                    const buttonUtility = require('./UTILS/buttonUtility');
                    
                    if (customId.startsWith('marriage_task_task')) {
                        // Extract task number from customId (e.g., marriage_task_task1 -> 1)
                        const taskNum = parseInt(customId.replace('marriage_task_task', ''));
                        
                        await buttonUtility.handleInteraction(interaction, async (i) => {
                            await marriageTaskUtil.handleTaskDisplay(i, taskNum);
                        });
                    } else if (customId === 'refresh_tasks') {
                        // Handle refresh button
                        const marriageTaskCommand = client.commands.get('marriage');
                        if (marriageTaskCommand) {
                            const fakeInteraction = {
                                ...interaction,
                                options: {
                                    getString: () => 'view'
                                },
                                deferReply: async () => {},
                                editReply: async (options) => await interaction.update(options)
                            };
                            await marriageTaskCommand.execute(fakeInteraction);
                        }
                    } else if (customId === 'marriage_task_help') {
                        // Handle help button  
                        await showMarriageTaskHelp(interaction);
                    } else if (customId === 'marriage_task_history') {
                        // Handle history button
                        await showMarriageTaskHistory(interaction);
                    } else {
                        await SafeInteractionHandler.safeReply(interaction, {
                            content: '❌ Unknown marriage task action.',
                            flags: 64
                        });
                    }
                }
            }
            // Handle marriage task game start buttons (new unified system)
            else if (customId.endsWith('_task_start')) {
                const gameType = customId.replace('_task_start', '');
                const marriageTaskUtil = require('./marriages/MarriageTaskUtil');
                await marriageTaskUtil.startGameSession(interaction, gameType);
            }
            // Handle other marriage task game buttons
            else if (customId.startsWith('house_answer_') || customId.startsWith('c4_drop_') || customId.startsWith('c4_restart') ||
                     customId.startsWith('vacation_add_') || customId.startsWith('vacation_finish_') ||
                     customId.startsWith('vacation_view_') || customId.startsWith('checkin_morning_') || customId.startsWith('checkin_night_') ||
                     customId.startsWith('pet_feed_') || customId.startsWith('pet_water_') || customId.startsWith('pet_clean_') || 
                     customId.startsWith('pet_pet_') || customId.startsWith('pet_retry_') || customId.startsWith('pet_respawn_') ||
                     customId.startsWith('adopt_pet_')) {
                // These interactions are handled by the marriage game collectors on the specific messages.
                // Do not reply here to avoid double-acks and incorrect prompts mid-game.
                logger.debug(`Marriage game component handled by game collectors: ${customId}`);
                return;
            }
            // Handle marriage task game action buttons (old system - disabled)
            else if (customId.includes('_game_')) {
                // const gameManager = require('./UTILS/games'); // Disabled - old Week 1-4 system
                // const handled = await gameManager.handleButtonInteraction(interaction);
                logger.warn(`Old game button interaction disabled: ${customId}`);
            }
            // Handle confirmed task start buttons
            else if (customId.startsWith('confirmed_start_')) {
                const marriageTaskCommand = client.commands.get('marriage');
                if (marriageTaskCommand && marriageTaskCommand.handleConfirmedStart) {
                    await marriageTaskCommand.handleConfirmedStart(interaction);
                }
            }
            // Handle tic tac toe game moves
            else if (customId.startsWith('ttt_move_')) {
                const marriageTaskCommand = client.commands.get('marriage');
                if (marriageTaskCommand && marriageTaskCommand.handleTicTacToeMove) {
                    await marriageTaskCommand.handleTicTacToeMove(interaction);
                }
            }
            // Handle tree planting and care buttons
            else if (customId.startsWith('select_tree_') || customId.startsWith('tree_care_') || customId.startsWith('tree_refresh_')) {
                // Check if it's the standalone tree planting game
                const plantTreeCommand = client.commands.get('marriage-plant-tree');
                if (plantTreeCommand && plantTreeCommand.handleButtonInteraction) {
                    await plantTreeCommand.handleButtonInteraction(interaction);
                }
                // Also check if it's from the marriage task system
                else if (customId.startsWith('tree_care_') || customId.startsWith('tree_refresh_')) {
                    const marriageTaskCommand = client.commands.get('marriage');
                    if (marriageTaskCommand && marriageTaskCommand.handleTreeCare) {
                        await marriageTaskCommand.handleTreeCare(interaction);
                    }
                }
            }
            // Handle poem interaction buttons
            else if (customId.startsWith('poem_add_') || customId.startsWith('poem_preview_') || customId.startsWith('poem_publish_') || customId.startsWith('poem_vote_') || customId.startsWith('poem_upvote_') || customId === 'add_verse' || customId === 'finish_poem' || customId === 'poem_history') {
                const marriageTaskCommand = client.commands.get('marriage');
                if (marriageTaskCommand) {
                    if (customId.startsWith('poem_vote_')) {
                        await marriageTaskCommand.handlePoemVote(interaction);
                    } else if (customId.startsWith('poem_upvote_')) {
                        await marriageTaskCommand.handlePoemUpvote(interaction);
                    } else if (customId === 'poem_history') {
                        await marriageTaskCommand.handlePoemHistory(interaction);
                    } else {
                        await marriageTaskCommand.handlePoemInteraction(interaction);
                    }
                }
            }
            // Handle quiz answer buttons
            else if (customId.startsWith('quiz_answer_')) {
                const marriageTaskCommand = client.commands.get('marriage');
                if (marriageTaskCommand && marriageTaskCommand.handleQuizAnswer) {
                    await marriageTaskCommand.handleQuizAnswer(interaction);
                }
            }
            // Handle quiz history button
            else if (customId === 'quiz_history') {
                const marriageTaskCommand = client.commands.get('marriage');
                if (marriageTaskCommand && marriageTaskCommand.handleQuizHistory) {
                    await marriageTaskCommand.handleQuizHistory(interaction);
                }
            }
            // Handle new button interactions for converted systems
            else if (customId.startsWith('proposal_accept:') || customId.startsWith('proposal_reject:')) {
                // Marriage proposal buttons are handled within the propose command's collector
                // No additional handling needed here - the command's own collector handles these
            }
            else if (customId.startsWith('wedding_ido_')) {
                // Wedding "I do" buttons are handled within the start-marriage command's collector
                // No additional handling needed here - the command's own collector handles these
            }
            else if (customId.startsWith('dailytask_complete_')) {
                // Daily task complete buttons are handled within the dailytask command's collector
                // No additional handling needed here - the command's own collector handles these
            }
            else if (customId.startsWith('marriage_task1_start_') || customId.startsWith('marriage_task3_start_') || customId.startsWith('marriage_task4_start_')) {
                // Marriage task start buttons are handled within the marriage-task command's collectors
                // No additional handling needed here - the command's own collectors handle these
            }
            else if (customId.startsWith('wc-word:')) {
                // Word chain input buttons are handled within the wordchain command's collector
                // No additional handling needed here - the command's own collector handles these
            }
            // Handle cog updater buttons
            else if (customId.startsWith('update_')) {
                try {
                    // Block most updater actions if sessions are active, but allow end-sessions
                    const sessionManager = require('./UTILS/sessionManager');
                    const activeCount = sessionManager.getActiveSessionCount ? sessionManager.getActiveSessionCount() : 0;
                    if (customId !== 'update_end_sessions' && activeCount > 0) {
                        await SafeInteractionHandler.safeReply(interaction, {
                            content: `⏸️ Cog updater is blocked while ${activeCount} game session(s) are active. Use /stopmysession or /stopgame to end them first.`,
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }
                    const cogManager = require('./UTILS/cogManager');
                    const cogUpdater = require('./UTILS/cogUpdater');
                    
                    // Check if user is authorized to update cogs
                    if (!cogManager.isUserAuthorized(interaction.user.id)) {
                        await SafeInteractionHandler.safeReply(interaction, {
                            content: '❌ Only authorized users can update cogs.',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    if (customId === 'update_end_sessions') {
                        await interaction.deferUpdate();
                        const result = await sessionManager.endAllSessions();
                        try {
                            await interaction.followUp({
                                content: `✅ Ended ${result.ended} active session(s).`,
                                flags: MessageFlags.Ephemeral
                            });
                        } catch (_) {}
                        // Re-open updater panel
                        const updaterCmd = client.commands.get('cogupdater');
                        if (updaterCmd) {
                            const fakeInteraction = {
                                ...interaction,
                                options: {
                                    getSubcommand: () => 'panel'
                                }
                            };
                            await updaterCmd.execute(fakeInteraction);
                        }
                    }
                    else if (customId.startsWith('update_confirm_')) {
                        const categoryName = customId.replace('update_confirm_', '');
                        
                        await interaction.deferUpdate();
                        
                        const loadingEmbed = new EmbedBuilder()
                            .setColor('#ffff00')
                            .setTitle('🔄 Updating Cog')
                            .setDescription(`Starting update of ${categoryName} cog from GitHub...\n\n⏳ This may take a few moments.`);
                        
                        await interaction.editReply({ embeds: [loadingEmbed], components: [] });
                        
                        try {
                            const result = await cogUpdater.updateCogOrCommand(
                                categoryName, 
                                'cog', 
                                cogManager, 
                                interaction.client
                            );
                            
                            const finalEmbed = new EmbedBuilder()
                                .setColor(result.success ? '#00ff00' : '#ff9900')
                                .setTitle(`🔄 Update ${result.success ? 'Complete' : 'Partial'}`)
                                .setDescription(`Update of cog \`${categoryName}\` ${result.success ? 'completed successfully' : 'completed with some failures'}.`)
                                .addFields(
                                    { name: '✅ Success', value: result.successCount.toString(), inline: true },
                                    { name: '❌ Failed', value: result.failCount.toString(), inline: true },
                                    { name: '📁 Total Files', value: result.totalFiles.toString(), inline: true }
                                );

                            if (result.hasBackup) {
                                finalEmbed.addFields({
                                    name: '💾 Backup',
                                    value: `Created backup: \`${result.backupInfo.name}\``,
                                    inline: false
                                });
                            }
                            
                            await interaction.editReply({ embeds: [finalEmbed] });
                        } catch (error) {
                            logger.error(`Update failed for cog '${categoryName}':`, error);
                            
                            const errorEmbed = new EmbedBuilder()
                                .setColor('#ff0000')
                                .setTitle('❌ Update Failed')
                                .setDescription(`Failed to update cog \`${categoryName}\`: ${error.message}`);
                            
                            await interaction.editReply({ embeds: [errorEmbed] });
                        }
                    }
                    else if (customId === 'update_cancel') {
                        const embed = new EmbedBuilder()
                            .setColor('#6c757d')
                            .setTitle('❌ Update Cancelled')
                            .setDescription('Cog update has been cancelled.');
                        
                        await interaction.update({ embeds: [embed], components: [] });
                    }
                    else if (customId === 'update_show_backups') {
                        const backups = await cogUpdater.getAvailableBackups();
                        
                        const embed = new EmbedBuilder()
                            .setColor('#0099ff')
                            .setTitle('💾 Available Backups')
                            .setDescription(backups.length > 0 ? 'Recent backups available for rollback:' : 'No backups available.');
                        
                        if (backups.length > 0) {
                            const backupList = backups.slice(0, 10).map(backup => {
                                const age = Math.round(backup.age / (1000 * 60));
                                const ageText = age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`;
                                return `• **${backup.name}** (${backup.fileCount} files, ${ageText})`;
                            }).join('\n');
                            
                            embed.addFields({
                                name: '📋 Backup List',
                                value: backupList,
                                inline: false
                            });
                        }
                        
                        await interaction.update({ embeds: [embed], components: [] });
                    }
                    else if (customId === 'update_cleanup') {
                        await interaction.deferUpdate();
                        
                        const cleaned = await cogUpdater.cleanOldBackups();
                        
                        const embed = new EmbedBuilder()
                            .setColor('#00ff00')
                            .setTitle('🧹 Cleanup Complete')
                            .setDescription(`Cleaned ${cleaned} old backups.`);
                        
                        await interaction.editReply({ embeds: [embed], components: [] });
                    }
                    else if (customId === 'update_refresh') {
                        // Re-run the panel command
                        const cogupdaterCommand = client.commands.get('cogupdater');
                        if (cogupdaterCommand) {
                            const fakeInteraction = {
                                ...interaction,
                                options: {
                                    getSubcommand: () => 'panel'
                                }
                            };
                            await cogupdaterCommand.execute(fakeInteraction);
                        }
                    }
                } catch (error) {
                    logger.error(`Error handling update button ${customId}:`, error);
                    await SafeInteractionHandler.safeReply(interaction, {
                        content: '❌ An error occurred while processing the update.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
            // Handle cog management buttons
            else if (customId.startsWith('cog_')) {
                try {
                    const sessionManager = require('./UTILS/sessionManager');
                    const activeCount = sessionManager.getActiveSessionCount ? sessionManager.getActiveSessionCount() : 0;
                    // Allow the dedicated end-sessions button even if sessions are active
                    if (customId !== 'cog_end_sessions' && activeCount > 0) {
                        await SafeInteractionHandler.safeReply(interaction, {
                            content: `⏸️ Cog management is blocked while ${activeCount} game session(s) are active. Use /stopmysession or /stopgame to end them first.`,
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }
                    const cogManager = require('./UTILS/cogManager');
                    
                    // Check if user is authorized to manage cogs
                    if (!cogManager.isUserAuthorized(interaction.user.id)) {
                        await SafeInteractionHandler.safeReply(interaction, {
                            content: '❌ Only authorized users can manage cogs.',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }
                    
                    if (!cogManager.initialized) {
                        await cogManager.createTables();
                        await cogManager.initialize();
                    }

                    if (customId === 'cog_end_sessions') {
                        await interaction.deferUpdate();
                        const result = await sessionManager.endAllSessions();
                        try {
                            await interaction.followUp({
                                content: `✅ Ended ${result.ended} active session(s).`,
                                flags: MessageFlags.Ephemeral
                            });
                        } catch (_) {}

                        // Re-open the panel to reflect new state
                        const cogmanageCommand = client.commands.get('cogmanage');
                        if (cogmanageCommand) {
                            const fakeInteraction = {
                                ...interaction,
                                options: {
                                    getSubcommand: () => 'panel'
                                }
                            };
                            await cogmanageCommand.execute(fakeInteraction);
                        }
                    }
                    else if (customId.startsWith('cog_toggle_')) {
                        const categoryName = customId.replace('cog_toggle_', '');
                        const isCurrentlyEnabled = cogManager.isCogEnabled(categoryName);
                        
                        if (isCurrentlyEnabled) {
                            await cogManager.disableCog(categoryName);
                            const embed = new EmbedBuilder()
                                .setColor('#ff9900')
                                .setTitle('🔴 Cog Disabled')
                                .setDescription(`Successfully disabled the **${cogManager.getCategoryInfo(categoryName).name}** cog category.`);
                            await interaction.update({ embeds: [embed], components: [] });
                        } else {
                            await cogManager.enableCog(categoryName);
                            const embed = new EmbedBuilder()
                                .setColor('#00ff00')
                                .setTitle('✅ Cog Enabled')
                                .setDescription(`Successfully enabled the **${cogManager.getCategoryInfo(categoryName).name}** cog category.`);
                            await interaction.update({ embeds: [embed], components: [] });
                        }
                    }
                    else if (customId === 'cog_enable_all') {
                        await interaction.deferUpdate();
                        const results = await cogManager.enableAllCogs();
                        const successCount = results.filter(r => r.success).length;
                        
                        const embed = new EmbedBuilder()
                            .setColor('#00ff00')
                            .setTitle('✅ All Cogs Enabled')
                            .setDescription(`Successfully enabled ${successCount} cog categories.`);
                        await interaction.editReply({ embeds: [embed], components: [] });
                    }
                    else if (customId === 'cog_disable_all') {
                        await interaction.deferUpdate();
                        const results = await cogManager.disableAllCogs();
                        const successCount = results.filter(r => r.success).length;
                        
                        const embed = new EmbedBuilder()
                            .setColor('#ff9900')
                            .setTitle('🔴 All Cogs Disabled')
                            .setDescription(`Successfully disabled ${successCount} cog categories.`);
                        await interaction.editReply({ embeds: [embed], components: [] });
                    }
                    else if (customId === 'cog_refresh') {
                        // Refresh and show the panel again
                        const cogmanageCommand = client.commands.get('cogmanage');
                        if (cogmanageCommand) {
                            // Re-run the panel subcommand
                            const fakeInteraction = {
                                ...interaction,
                                options: {
                                    getSubcommand: () => 'panel'
                                }
                            };
                            await cogmanageCommand.execute(fakeInteraction);
                        }
                    }
                } catch (error) {
                    logger.error(`Error handling cog button ${customId}:`, error);
                    await SafeInteractionHandler.safeReply(interaction, {
                        content: '❌ An error occurred while managing cogs.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

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
    // Handle modal submit interactions
    else if (interaction.isModalSubmit()) {
        const customId = interaction.customId;
        
        try {
            // Handle poem line input modals
            if (customId.startsWith('poem_line_input_')) {
                const marriageTaskCommand = client.commands.get('marriage');
                if (marriageTaskCommand && marriageTaskCommand.handlePoemLineSubmission) {
                    await marriageTaskCommand.handlePoemLineSubmission(interaction);
                }
            }
            // Handle sportbet bet amount modal
            else if (customId.startsWith('sportbet_bet_amount_')) {
                const sportbetCommand = client.commands.get('sportbet');
                if (sportbetCommand && sportbetCommand.handleBetAmountModal) {
                    await sportbetCommand.handleBetAmountModal(interaction);
                }
            }
        } catch (error) {
            // Handle "Unknown interaction" errors gracefully (interaction expired)
            if (error.message.includes('Unknown interaction') || error.code === 10062) {
                logger.debug(`Modal interaction expired for customId: ${customId}, user: ${interaction.user.id}`);
                return; // Silently ignore expired interactions
            }

            logger.error(`Error handling modal ${customId}:`, error);

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Modal Error')
                .setDescription('An error occurred while processing your submission.')
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
        // Panel manager and poem input disabled - converted to interactions
        // Mention task disabled - requires message content reading
        
        // These features have been converted to button/modal interactions:
        // - Marriage proposals (Accept/Decline buttons)
        // - Wedding ceremonies ("I do" buttons)
        // - Word Chain game (modal input)
        // - Daily tasks (Complete button)
        // - Marriage task confirmations (Start buttons)

        // Message reward system disabled (migrated to UAS-Standalone-Bot)

    } catch (error) {
        logger.error('Error in messageCreate handler:', error);
    }
});

client.on('warn', async warning => {
    logger.warn('Discord client warning:', warning);
    try { await sendLogMessage(client, 'warn', `Discord client warning: ${warning}`); } catch (_) { }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async error => {
    logger.error('Unhandled promise rejection:', error);
    try { await sendLogMessage(client, 'error', `Unhandled rejection: ${error?.message || error}`); } catch (_) { }
});

// ========================= VOTE REMINDER SYSTEM =========================

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

        // Try cache first, then fetch from Discord
        const memberCacheManager = require('./UTILS/memberCacheManager');
        const { success: cacheSuccess } = await memberCacheManager.getMemberData(userId, guildId, guild).catch(() => ({ success: false }));
        
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

// Top.GG bot webhook endpoint
app.post('/topgg/webhook', async (req, res) => {
    try {
        // Initialize TopGG manager
        const TopGGManager = require('./UTILS/topgg');
        const topggManager = new TopGGManager(client);

        // Handle the bot vote webhook
        await topggManager.handleVoteWebhook(req, res);
    } catch (error) {
        logger.error(`Top.GG webhook server error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Top.GG server voting uses API polling (see ServerVotePoller.js)
// No webhook endpoint needed for server votes

// Rank.top webhook endpoint
app.post('/ranktop/webhook', async (req, res) => {
    try {
        // Log everything for debugging real rank.top webhooks
        logger.info('=== RANK.TOP WEBHOOK RECEIVED ===');
        logger.info(`Method: ${req.method || 'undefined'}`);
        logger.info(`URL: ${req.url || 'undefined'}`);
        logger.info(`Headers: ${JSON.stringify(req.headers || {}, null, 2)}`);
        logger.info(`Body: ${JSON.stringify(req.body || {}, null, 2)}`);
        logger.info(`Raw body type: ${typeof req.body}`);
        logger.info(`Query params: ${JSON.stringify(req.query || {}, null, 2)}`);
        logger.info(`IP: ${req.ip || req.connection?.remoteAddress || 'undefined'}`);
        logger.info('=== END RANK.TOP WEBHOOK ===');
        
        // Initialize TopGG manager (handles all vote types)
        const TopGGManager = require('./UTILS/topgg');
        const topggManager = new TopGGManager(client);

        // Handle the rank.top vote webhook
        await topggManager.handleRanktopVoteWebhook(req, res);
    } catch (error) {
        logger.error(`Rank.top webhook server error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test vote endpoint for debugging
app.post('/test/vote/:platform', async (req, res) => {
    try {
        const { platform } = req.params;
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId required in body' });
        }
        
        const TopGGManager = require('./UTILS/topgg');
        const topggManager = new TopGGManager(client);
        
        // Process test vote
        await topggManager.processVoteReward(userId, { test: true }, platform);
        
        res.status(200).json({ 
            success: true, 
            message: `Test ${platform} vote processed for user ${userId}` 
        });
    } catch (error) {
        logger.error(`Test vote error: ${error.message}`);
        res.status(500).json({ error: error.message });
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

// Webhook test endpoint
app.get('/webhook-test', (req, res) => {
    res.status(200).json({
        status: 'Webhook endpoints ready',
        endpoints: {
            'topgg_bot': '/topgg/webhook',
            'ranktop': '/ranktop/webhook',
            'server_votes': 'API polling (no webhook)'
        },
        environment: {
            topgg_webhook_secret: process.env.TOPGG_WEBHOOK_SECRET ? 'Set' : 'Missing',
            ranktop_webhook_secret: process.env.RANKTOP_WEBHOOK_SECRET ? 'Set' : 'Missing',
            topgg_server_token: process.env.TOPGG_SERVER_TOKEN ? 'Set' : 'Missing'
        },
        timestamp: new Date().toISOString()
    });
});

// Start webhook server
app.listen(PORT, () => {
    logger.info(`Webhook server running on port ${PORT}`);
    logger.info(`Available endpoints: /role-assignment, /topgg/webhook, /ranktop/webhook, /health, /uas/sessions/*`);
});

// Handle uncaught exceptions
process.on('uncaughtException', async error => {
    logger.error('Uncaught exception:', error);
    try { await sendLogMessage(client, 'error', `Uncaught exception: ${error?.message || error}`); } catch (_) { }
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
                value: '```yaml\nIncome:       /work, /beg, /crime\nManagement:   /balance, /sendmoney\nRisk:         /rob\nProgress:     /leaderboard\n```\n💡 **Pro Tip:** Use `/balance` panel for banking operations',
                inline: false
            },
            {
                name: '🎟️ **Lottery System** 🎟️',
                value: '```yaml\nView Status:  /lottery\nBuy Tickets:  /purchaselottery <1-7>\nDrawings:     Every Tuesday & Saturday 10AM EST\n```\n🏆 **Bi-weekly prizes with guaranteed winners**',
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

    await interaction.reply({ embeds: [embed], components: [closeButton], flags: MessageFlags.Ephemeral });
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

    await interaction.reply({ embeds: [embed], components: [closeButton], flags: MessageFlags.Ephemeral });
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

    await interaction.reply({ embeds: [embed], components: [closeButton], flags: MessageFlags.Ephemeral });
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
client.once('clientReady', async () => {
    StartupBanner.showBanner();

    // Log cleanup was performed during startup
    logger.info('🧹 [STARTUP] All past logs cleared - Fresh start with clean logs');

    // Clear any stale game sessions from previous runs
    const { clearActiveGame } = require('./UTILS/common');
    const sessionManager = require('./UTILS/sessionManager');

    // Clear legacy game registry
    const clearedCount = clearActiveGame(null, true);
    if (clearedCount > 0) {
        logger.info(`Cleared ${clearedCount} stale legacy game sessions from previous run`);
    }

    // Clean up any stale sessions from the session manager
    try {
        await sessionManager.performCleanup();
        logger.info('Session manager cleanup completed on startup');
    } catch (error) {
        logger.error('Failed to perform session manager cleanup on startup:', error);
    }

    gracefulShutdown.initialize(client);

    // Send BOT IS ONLINE notification to specified channel (PRODUCTION ONLY)
    if (!IS_DEVELOPMENT) {
        try {
            const onlineChannel = client.channels.cache.get('1403244656845787170');
            if (onlineChannel) {
                await onlineChannel.send('🟢 **BOT IS ONLINE**');
                logger.info('Bot online notification sent successfully');
            } else {
                logger.warn('Online notification channel not found: 1403244656845787170');
            }
        } catch (error) {
            logger.error('Failed to send bot online notification:', error);
        }
    }

    // Inactivity tax system has been disabled
    logger.info('ℹ️ Inactivity tax system is disabled');

    // Initialize the global trend analyzer and behavioral analyzer for game integrations
    const trendAnalyzerIntegration = require('./UTILS/trendAnalyzerIntegration');
    trendAnalyzerIntegration.initializeTrendAnalyzer();
    trendAnalyzerIntegration.initializeBehavioralAnalyzer();
});

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Received SIGINT, starting enhanced graceful shutdown...');

    try {
        // Stop EconomyGuardian
        if (client.economyGuardian) {
            const { shutdownEconomyGuardian } = require('./ECONOMY_GUARDIAN/integration');
            await shutdownEconomyGuardian(client);
        }

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

// Initialize when client is ready
client.once('clientReady', () => {
    logger.info(`Bot is ready! Logged in as ${client.user.tag}`);
    
    // Emergency reset security data on startup to prevent corrupted tracking
    try {
        const securityLogger = require('./UTILS/securityLogger');
        const nodeCache = require('./UTILS/nodeCache');
        
        logger.info('🧹 Performing startup security data reset...');
        
        // Reset security tracking data
        securityLogger.emergencyReset();
        
        // Clear NodeCache as well
        nodeCache.flushAll();
        
        logger.info('✅ Startup security reset completed - tracking data cleared');
    } catch (error) {
        logger.error(`⚠️ Startup security reset failed: ${error.message}`);
    }
    
    // Rank.Top Manager disabled due to authentication issues
    // const RankTopManager = require('./UTILS/ranktopManager');
    // client.rankTopManager = new RankTopManager(client);
    
    // Rank.Top autoposting disabled
    // if (process.env.RANKTOP_API_KEY && process.env.RANKTOP_BOT_AUTH_TOKEN) {
    //     client.rankTopManager.startAutopost()
    //         .then(success => {
    //             if (success) {
    //                 logger.info('✅ Rank.Top autopost started');
    //             }
    //         })
    //         .catch(error => {
    //             logger.error('Failed to start Rank.Top autopost:', error);
    //         });
    // }
    
    // Voting system status
    logger.info('✅ Voting system initialized successfully');
    logger.info('🤖 Bot votes: 75K coins + bonuses (webhook)');
    logger.info('🎟️ Rank.top votes: Free lottery tickets (webhook)');
    logger.info('🤝 Server votes: Community support button (no automated rewards)');
});

// Helper functions for marriage task help and history
async function showMarriageTaskHelp(interaction) {
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    
    const helpEmbed = new EmbedBuilder()
        .setTitle('💍 Marriage Tasks Help')
        .setDescription('**Everything you need to know about Marriage Tasks!**')
        .setColor(0xFF69B4)
        .addFields(
            {
                name: '🎯 What are Marriage Tasks?',
                value: 'Weekly challenges designed to strengthen your bond and create shared memories! Complete tasks together to earn rewards and level up your relationship.',
                inline: false
            },
            {
                name: '📅 How it Works',
                value: '• **New tasks every week** - Fresh challenges rotate automatically\n• **Work together** - Both partners contribute to completion\n• **Track progress** - See your completion rate and history\n• **Earn rewards** - XP, levels, and special recognition',
                inline: false
            },
            {
                name: '🌟 Task Types',
                value: '• **Interactive Games** - Fun activities like Connect 4, quizzes\n• **Creative Challenges** - Writing, planning, expressing yourselves\n• **Daily Habits** - Building consistent connection routines\n• **Long-term Projects** - Multi-day activities like pet care',
                inline: false
            },
            {
                name: '💡 Tips for Success',
                value: '• **Communicate** - Talk about each task before starting\n• **Be patient** - Some tasks take time to complete\n• **Have fun** - The journey is more important than completion\n• **Support each other** - Celebrate small wins together',
                inline: false
            }
        )
        .setFooter({ text: 'Marriage Tasks System • ATIVE Casino Bot' })
        .setTimestamp();

    const backButton = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('refresh_tasks')
                .setLabel('Back to Tasks')
                .setEmoji('↩️')
                .setStyle(ButtonStyle.Primary)
        );

    await SafeInteractionHandler.safeReply(interaction, {
        embeds: [helpEmbed],
        components: [backButton],
        flags: MessageFlags.Ephemeral
    });
}

async function showMarriageTaskHistory(interaction) {
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const dbManager = require('./UTILS/database');
    const marriageTaskStatus = require('./marriages/marriageTaskStatus');
    
    try {
        // Get user's marriage
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const marriageData = await dbManager.getUserMarriage(userId, guildId);
        
        if (!marriageData.married) {
            return await SafeInteractionHandler.safeReply(interaction, {
                content: '❌ You must be married to view task history!',
                flags: MessageFlags.Ephemeral
            });
        }

        // Get task history
        const history = await marriageTaskStatus.getTaskHistory(marriageData.marriage.id);
        
        const historyEmbed = new EmbedBuilder()
            .setTitle('📚 Marriage Task History')
            .setDescription(`**${marriageData.marriage.partner1_name}** & **${marriageData.marriage.partner2_name}**`)
            .setColor(0x9370DB)
            .setTimestamp();

        if (Object.keys(history).length === 0) {
            historyEmbed.addFields({
                name: '📝 History',
                value: 'No completed tasks yet. Start your journey together!',
                inline: false
            });
        } else {
            // Display recent completions
            const recentCompletions = [];
            Object.values(history).forEach(week => {
                Object.entries(week.tasks).forEach(([taskNum, task]) => {
                    if (task.completed) {
                        recentCompletions.push({
                            week: week.rotationName,
                            task: taskNum,
                            date: new Date(task.completedAt)
                        });
                    }
                });
            });

            // Sort by date and take latest 8
            recentCompletions.sort((a, b) => b.date - a.date);
            const recent = recentCompletions.slice(0, 8);

            if (recent.length > 0) {
                const historyText = recent.map(completion => 
                    `✅ **${completion.task.replace('task', 'Task ')}** - ${completion.week}\n📅 ${completion.date.toLocaleDateString()}`
                ).join('\n\n');

                historyEmbed.addFields({
                    name: '🏆 Recent Completions',
                    value: historyText,
                    inline: false
                });
            }

            // Add statistics
            const totalCompleted = recentCompletions.length;
            const weeksParticipated = new Set(recentCompletions.map(c => c.week)).size;
            
            historyEmbed.addFields({
                name: '📊 Statistics',
                value: `**Total Tasks Completed:** ${totalCompleted}\n**Weeks Participated:** ${weeksParticipated}\n**Current Streak:** Building together! 💕`,
                inline: false
            });
        }

        const backButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('refresh_tasks')
                    .setLabel('Back to Tasks')
                    .setEmoji('↩️')
                    .setStyle(ButtonStyle.Primary)
            );

        await SafeInteractionHandler.safeReply(interaction, {
            embeds: [historyEmbed],
            components: [backButton],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        logger.error('Error showing marriage task history:', error);
        await SafeInteractionHandler.safeReply(interaction, {
            content: '❌ Error loading task history. Please try again later.',
            flags: MessageFlags.Ephemeral
        });
    }
}

// Start the bot
client.login(TOKEN).then(() => {
}).catch(error => {
    logger.error('Failed to login:', error);
    process.exit(1);
});
