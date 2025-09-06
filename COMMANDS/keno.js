/**
 * KENO Game Command - Number Selection Lottery
 * Players select 1-10 numbers from 1-80, system draws 20 numbers
 * Low multiplier payouts: 1 match = 1.2x, 2 matches = 2x, 3 matches = 2.7x
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { sendLogMessage, parseAmount, fmt } = require('../UTILS/common');
const sessionManager = require('../UTILS/sessionManager');
const { SessionState } = sessionManager;
const logger = require('../UTILS/logger');

// KENO Configuration
const KENO_CONFIG = {
    MIN_BET: 10,           // Minimum $10 entry
    MAX_BET: 50000,        // Maximum $50K entry  
    MIN_NUMBERS: 1,        // Minimum 1 number to pick
    MAX_NUMBERS: 10,       // Maximum 10 numbers to pick
    TOTAL_NUMBERS: 80,     // Numbers 1-80 available
    DRAW_COUNT: 20         // 20 numbers drawn
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('keno')
        .setDescription('🎲 Play KENO - Pick numbers and match the draw!')
        .addStringOption(option =>
            option.setName('bet')
                .setDescription(`Bet amount ($${KENO_CONFIG.MIN_BET} - $${KENO_CONFIG.MAX_BET.toLocaleString()}) - supports K/M/B suffixes`)
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('spots')
                .setDescription('How many numbers to pick (1-10)')
                .setMinValue(KENO_CONFIG.MIN_NUMBERS)
                .setMaxValue(KENO_CONFIG.MAX_NUMBERS)
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('quickpick')
                .setDescription('Auto-select random numbers instead of manual selection')
                .setRequired(false)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = interaction.guildId;
        const betAmountStr = interaction.options.getString('bet');
        const spots = interaction.options.getInteger('spots') || 5; // Default 5 spots
        const quickPick = interaction.options.getBoolean('quickpick') || false;

        try {
            // Defer reply immediately to prevent timeout
            await interaction.deferReply();

            // Session guard check
            const sessionGuard = require('../UTILS/sessionGuard');
            const check = await sessionGuard.check(userId, guildId, 'keno', interaction.client);
            if (!check.allowed) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Session Error')
                    .setDescription(check.message)
                    .setColor(0xFF0000);
                return await interaction.editReply({ embeds: [embed] });
            }

            // Use PayoutManager for bet validation and deduction
            const validation = await PayoutManager.validateAndDeductBet(
                interaction,
                betAmountStr,
                GameType.KENO,
                KENO_CONFIG.MIN_BET,
                KENO_CONFIG.MAX_BET
            );
            
            if (!validation.isValid) {
                return await interaction.editReply({ embeds: [validation.errorEmbed] });
            }
            
            const betAmount = validation.parsedAmount;
            logger.info(`KENO started by ${username} (${userId}) with bet ${fmt(betAmount)} for ${spots} spots`);

            // Create session for KENO
            const sessionResult = await sessionManager.createSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: 'keno',
                betAmount,
                timeout: 300000, // 5 minutes
                metadata: {
                    gamePhase: quickPick ? 'quickpick' : 'selecting',
                    spots: spots,
                    selectedNumbers: [],
                    quickPick: quickPick,
                    betAmount: betAmount
                }
            });

            if (!sessionResult.success) {
                throw new Error(`Session creation failed: ${sessionResult.error}`);
            }

            const sessionId = sessionResult.sessionId;

            // Start the KENO game
            const { handleKenoGame } = require('../GAMES/keno');
            await handleKenoGame(interaction, interaction.client, sessionId, {
                userId: userId,
                username: username,
                betAmount: betAmount,
                channelId: interaction.channelId,
                guildId: guildId,
                spots: spots,
                quickPick: quickPick
            });

        } catch (error) {
            logger.error(`KENO command failed: ${error?.stack || error}`);
            
            try {
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `KENO error for ${interaction.user.tag} (${userId}) — ${error.message}`,
                    userId,
                    guildId
                );
            } catch (_) {}

            // Enhanced session cleanup
            try {
                await sessionManager.forceCleanupUser(userId, guildId, 'KENO initialization error');
                logger.info(`Forced cleanup completed for user ${userId} after KENO command failure`);
            } catch (cleanupError) {
                logger.error(`Failed to cleanup after KENO command error: ${cleanupError.message}`);
            }

            const embed = new EmbedBuilder()
                .setTitle('❌ KENO Error')
                .setDescription('Failed to start KENO game. Please try again.')
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