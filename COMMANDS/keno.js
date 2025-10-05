/**
 * KENO Game Command - Number Selection Lottery
 * Players select 1-10 numbers from 1-80, system draws 20 numbers
 * Balanced payouts: 5 spots: 2 matches = 0.5x, 3 matches = 2x, 4 matches = 20x, 5 matches = 200x
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { sendLogMessage, parseAmount, fmt, getGuildId } = require('../UTILS/common');
const sessionManager = require('../UTILS/sessionManager');
const { SessionState } = sessionManager;
const logger = require('../UTILS/logger');

// KENO Configuration
const KENO_CONFIG = {
    MIN_BET: 10,           // Minimum $10 entry
    MIN_NUMBERS: 1,        // Minimum 1 number to pick
    MAX_NUMBERS: 10,       // Maximum 10 numbers to pick
    TOTAL_NUMBERS: 80,     // Numbers 1-80 available
    DRAW_COUNT: 20         // 20 numbers drawn
};

// PROGRESSIVE DIFFICULTY MODES
const KENO_MODES = {
    safe: {
        name: '🛡️ Safe',
        description: 'Conservative mode with standard payouts',
        minBet: 500,
        maxSingleMatchMultiplier: 2.0,
        emoji: '🛡️',
        color: '#4CAF50'
    },
    balanced: {
        name: '⚖️ Balanced',
        description: 'Standard mode with traditional payouts',
        minBet: 1000,
        maxSingleMatchMultiplier: 3.0,
        emoji: '⚖️',
        color: '#FF9800'
    },
    risky: {
        name: '⚡ Risky',
        description: 'High risk with enhanced payouts',
        minBet: 2500,
        maxSingleMatchMultiplier: 3.0,
        emoji: '⚡',
        color: '#FF8800'
    },
    extreme: {
        name: '🔥 Extreme',
        description: 'Maximum risk with premium payouts',
        minBet: 5000,
        maxSingleMatchMultiplier: 3.0,
        emoji: '🔥',
        color: '#FF0000'
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('keno')
        .setDescription('🎲 KENO - Simple lottery! We pick numbers for you, house draws 20, matches = wins!')
        .addStringOption(option =>
            option.setName('bet')
                .setDescription(`Bet amount (Min: $${KENO_CONFIG.MIN_BET}) - supports K/M/B suffixes (no max limit!)`)
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('spots')
                .setDescription('How many numbers to auto-pick (1-5, default 5) - More = bigger wins but harder to match!')
                .setMinValue(1)
                .setMaxValue(5)
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Risk mode (higher modes have better payouts but higher minimum bets)')
                .setRequired(false)
                .addChoices(
                    { name: '🛡️ Safe (Min: $500, Max Single Match: 2x)', value: 'safe' },
                    { name: '⚖️ Balanced (Min: $1K, Max Single Match: 3x)', value: 'balanced' },
                    { name: '⚡ Risky (Min: $2.5K, Max Single Match: 3x)', value: 'risky' },
                    { name: '🔥 Extreme (Min: $5K, Max Single Match: 3x)', value: 'extreme' }
                )
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = interaction.guildId;
        const betAmountStr = interaction.options.getString('bet');
        const spots = Math.min(interaction.options.getInteger('spots') || 5, 5); // Default 5 spots, max 5
        const selectedMode = interaction.options.getString('mode') || 'balanced';
        const quickPick = true; // ALWAYS use quickpick for simplicity

        // Get mode configuration
        const modeConfig = KENO_MODES[selectedMode] || KENO_MODES.balanced;

        try {
            // Defer reply immediately to prevent timeout
            await interaction.deferReply();

            // Check maintenance mode first
            const maintenanceGuard = require('../UTILS/maintenanceGuard');
            const maintenanceCheck = await maintenanceGuard.check(guildId, 'keno');
            if (!maintenanceCheck.allowed) {
                return await interaction.editReply({ embeds: [maintenanceCheck.embed] });
            }

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
                modeConfig.minBet,
                null // No max bet limit - bulletproof economy handles risk
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
                betPreDeducted: true, // Bet already deducted by PayoutManager
                timeout: 300000, // 5 minutes
                metadata: {
                    gamePhase: quickPick ? 'quickpick' : 'selecting',
                    spots: spots,
                    selectedNumbers: [],
                    quickPick: quickPick,
                    betAmount: betAmount,
                    mode: selectedMode,
                    modeConfig: modeConfig
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

            // End the session after game completion
            await sessionManager.endSession(sessionId, {
                outcome: 'COMPLETED',
                reason: 'game_completed'
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
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }
            } catch (replyError) {
                logger.error(`Failed to send error reply: ${replyError.message}`);
            }
        }
    }
};