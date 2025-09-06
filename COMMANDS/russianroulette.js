/**
 * Russian Roulette Game Command - Fully Automated Multiplayer
 * Last person standing wins the entire pot
 * No manual input required after joining - completely automated gameplay
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { sendLogMessage, parseAmount, fmt } = require('../UTILS/common');
const sessionManager = require('../UTILS/sessionManager');
const { SessionState } = sessionManager;
const logger = require('../UTILS/logger');

// Russian Roulette Configuration
const ROULETTE_CONFIG = {
    MIN_BET: 50,           // Minimum $50 entry
    MAX_BET: null,         // No maximum bet limit - bet everything you have!
    MIN_PLAYERS: 2,        // Minimum 2 players to start
    MAX_PLAYERS: null,     // No player limit - unlimited players allowed
    JOIN_TIME: 60000,      // 60 seconds to join
    HOUSE_EDGE: 0.02       // 2% house fee
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('russianroulette')
        .setDescription('🔫 Start a deadly game of Russian Roulette - last survivor wins all!')
        .addStringOption(option =>
            option.setName('bet')
                .setDescription(`Entry amount (minimum $${ROULETTE_CONFIG.MIN_BET}, no maximum!) - supports K/M/B suffixes`)
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
        const joinTime = interaction.options.getInteger('time') || 60; // Default 60 seconds
        const forceStart = interaction.options.getBoolean('forcestart') || false;

        try {
            // Defer reply immediately to prevent timeout
            await interaction.deferReply();

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

            // Use PayoutManager for bet validation and deduction (no max bet limit)
            const validation = await PayoutManager.validateAndDeductBet(
                interaction,
                betAmountStr,
                GameType.RUSSIAN_ROULETTE,
                ROULETTE_CONFIG.MIN_BET,
                null  // No maximum bet limit
            );
            
            if (!validation.isValid) {
                return await interaction.editReply({ embeds: [validation.errorEmbed] });
            }
            
            const betAmount = validation.parsedAmount;
            logger.info(`Russian Roulette started by ${username} (${userId}) with bet ${fmt(betAmount)}`);

            // Create session for Russian Roulette
            const sessionResult = await sessionManager.createSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: 'russianroulette',
                betAmount,
                timeout: Math.max(300000, joinTime * 1000 + 60000), // joinTime + 1 minute buffer
                metadata: {
                    gamePhase: 'joining',
                    hostId: userId,
                    entryAmount: betAmount,
                    players: new Map(),
                    maxPlayers: ROULETTE_CONFIG.MAX_PLAYERS, // null = unlimited
                    joinTime: joinTime * 1000, // Convert to milliseconds
                    forceStart: forceStart
                }
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

            // Enhanced session cleanup
            try {
                await sessionManager.forceCleanupUser(userId, guildId, 'Russian Roulette initialization error');
                logger.info(`Forced cleanup completed for user ${userId} after Russian Roulette command failure`);
            } catch (cleanupError) {
                logger.error(`Failed to cleanup after Russian Roulette command error: ${cleanupError.message}`);
            }

            const embed = new EmbedBuilder()
                .setTitle('❌ Russian Roulette Error')
                .setDescription('Failed to start Russian Roulette game. Please try again.')
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