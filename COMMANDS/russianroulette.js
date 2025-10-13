/**
 * Russian Roulette Game Command - Fully Automated Multiplayer
 * Last person standing wins the entire pot
 * No manual input required after joining - completely automated gameplay
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { sendLogMessage, parseAmount, fmt, buildInvalidBetEmbed } = require('../UTILS/common');
const dbManager = require('../UTILS/database');
const sessionManager = require('../UTILS/sessionManager');
const { SessionState } = sessionManager;
const logger = require('../UTILS/logger');
const comprehensiveLogger = require('../UTILS/comprehensiveLogger');
const tuningManager = require('../UTILS/tuningManager');

// UNIVERSAL GAME INTEGRATION - ALL SYSTEMS
const UniversalGameIntegrator = require('../UTILS/UniversalGameIntegrator');
const gameIntegrator = new UniversalGameIntegrator('russianroulette');

// Russian Roulette Configuration
const ROULETTE_CONFIG = {
    MIN_BET: 50,           // Minimum $50 entry
    MIN_PLAYERS: 2,        // Minimum 2 players to start
    MAX_PLAYERS: null,     // No player limit - unlimited players allowed
    JOIN_TIME: 60000,      // 60 seconds to join
    HOUSE_EDGE: 0.08       // 2% house fee
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('russianroulette')
        .setDescription('🔫 Start a deadly game of Russian Roulette - last survivor wins all!')
        .addStringOption(option =>
            option.setName('bet')
                .setDescription(`Entry amount (minimum $${ROULETTE_CONFIG.MIN_BET}, NO MAX LIMIT - bet everything!) - supports K/M/B suffixes`)
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('time')
                .setDescription('Join time in seconds (15-300 seconds)')
                .setMinValue(15)
                .setMaxValue(300)
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('forcestart')
                .setDescription('Allow game to start early when minimum players join')
                .setRequired(false)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = interaction.guildId;
        const betAmountStr = interaction.options.getString('bet');
        const joinTime = interaction.options.getInteger('time') || 30; // Default 30 seconds (faster)
        const forceStart = interaction.options.getBoolean('forcestart') || false;

        try {
            // Defer reply immediately to prevent timeout
            await interaction.deferReply();

            // Check maintenance mode first
            const maintenanceGuard = require('../UTILS/maintenanceGuard');
            const maintenanceCheck = await maintenanceGuard.check(guildId, 'russianroulette');
            if (!maintenanceCheck.allowed) {
                return await interaction.editReply({ embeds: [maintenanceCheck.embed] });
            }

            // Session guard check
            const sessionGuard = require('../UTILS/sessionGuard');
            const check = await sessionGuard.check(userId, guildId, 'russianroulette', interaction.client);
            if (!check.allowed) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Session Error')
                    .setDescription(check.message)
                    .setColor(0xFF0000);
                return await interaction.editReply({ embeds: [embed] });
            }

            // 🎛️ GET AI-REGULATED MAX BET LIMIT (Economic Compliance)
            // Custom validation for Russian Roulette (no max bet limit)
            const parsedAmount = parseAmount(betAmountStr);
            if (isNaN(parsedAmount) || parsedAmount <= 0) {
                const embed = buildInvalidBetEmbed('Invalid bet amount.');
                return await interaction.editReply({ embeds: [embed] });
            }
            
            if (parsedAmount < ROULETTE_CONFIG.MIN_BET) {
                const embed = buildInvalidBetEmbed(`Minimum bet is ${fmt(ROULETTE_CONFIG.MIN_BET)}.`);
                return await interaction.editReply({ embeds: [embed] });
            }
            
            // Check if user has enough funds
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            if (userBalance.wallet < parsedAmount) {
                const embed = buildInvalidBetEmbed(`Insufficient funds. You have ${fmt(userBalance.wallet)} in your wallet.`);
                return await interaction.editReply({ embeds: [embed] });
            }
            
            const betAmount = parsedAmount;

        // ENHANCED SESSION SECURITY CHECK
        const sessionCheck = await gameIntegrator.checkGameSession(userId, guildId, 'russianroulette', betAmount);
        if (!sessionCheck.allowed) {
            return await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('❌ Game Access Denied')
                    .setDescription(sessionCheck.message)
                    .setTimestamp()],
                ephemeral: true
            });
        }

            logger.info(`Russian Roulette started by ${username} (${userId}) with bet ${fmt(betAmount)}`);

            // Create session for Russian Roulette
            const sessionResult = await sessionManager.createSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: 'russianroulette',
                betAmount,
                betPreDeducted: false, // Bet will be deducted when players join
                timeout: Math.max(300000, joinTime * 1000 + 60000), // joinTime + 1 minute buffer
                metadata: {
                    gamePhase: 'joining',
                    hostId: userId,
                    entryAmount: betAmount,
                    players: new Map(),
                    maxPlayers: ROULETTE_CONFIG.MAX_PLAYERS, // null = unlimited
                    joinTime: joinTime * 1000, // Convert to milliseconds
                    forceStart: forceStart
                },
                interaction
            });

            if (!sessionResult.success) {
                throw new Error(`Session creation failed: ${sessionResult.error}`);
            }

            const sessionId = sessionResult.sessionId;

            // Start the Russian Roulette game
            const { handleGameExecution } = require('../GAMES/russianRoulette');

            await handleGameExecution(interaction, interaction.client, sessionId, {
                hostId: userId,
                hostName: username,
                entryAmount: betAmount,
                channelId: interaction.channelId,
                guildId: guildId,
                joinTime: joinTime * 1000, // Convert to milliseconds
                forceStart: forceStart
            });

        } catch (error) {
            logger.error(`Russian Roulette command failed: ${error?.stack || error}`);
            
            try {
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `Russian Roulette error for ${interaction.user.tag} (${userId}) — ${error.message}`,
                    userId,
                    guildId
                );
            } catch (_) {}

            // No need to refund since money hasn't been deducted yet
            logger.info(`Russian Roulette error occurred before any money was charged for ${username} (${userId})`);

            // Enhanced session cleanup
            try {
                await sessionManager.forceCleanupUser(userId, guildId, 'Russian Roulette initialization error');
                logger.info(`Forced cleanup completed for user ${userId} after Russian Roulette command failure`);
            } catch (cleanupError) {
                logger.error(`Failed to cleanup after Russian Roulette command error: ${cleanupError.message}`);
            }

            // Create more specific error messages based on the error type
            let errorTitle = '❌ Russian Roulette Error';
            let errorDescription = 'Failed to start Russian Roulette game. Please try again.';
            
            // No money was charged, so no refund needed
            errorDescription += `\n\n💰 No money was charged - you can try again anytime.`;
            
            if (error.message.includes('Insufficient funds')) {
                errorTitle = '💰 Insufficient Funds';
                errorDescription = `You need at least **${fmt(ROULETTE_CONFIG.MIN_BET)}** in your wallet to start Russian Roulette.\n\nUse \`/balance\` to check your funds or \`/withdraw\` to move money from your bank.`;
            } else if (error.message.includes('Session creation failed')) {
                errorTitle = '⏱️ Session Error';
                errorDescription = 'Unable to create a game session. You might already have an active game running.\n\nUse \`/stopmysession\` to end any active sessions, then try again.';
            } else if (error.message.includes('already have an active')) {
                errorTitle = '🎮 Game Already Active';
                errorDescription = 'You already have a game in progress. Finish your current game or use \`/stopmysession\` to end it.';
            }

            const embed = new EmbedBuilder()
                .setTitle(errorTitle)
                .setDescription(errorDescription)
                .setColor(0xFF0000);

            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ embeds: [embed] });
                } else {
                    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                }
            } catch (replyError) {
                logger.error(`Failed to send error reply: ${replyError.message}`);
            }
        }
    }
};