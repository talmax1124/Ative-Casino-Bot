/**
 * CEELO Game Command - Traditional Chinese Dice Game (4-5-6)
 * Player and house roll 3 dice each, best hand wins
 * Simple 1:1 even money payouts
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { sendLogMessage, parseAmount, fmt } = require('../UTILS/common');
const sessionManager = require('../UTILS/sessionManager');
const { SessionState } = sessionManager;
const logger = require('../UTILS/logger');
const comprehensiveLogger = require('../UTILS/comprehensiveLogger');
const tuningManager = require('../UTILS/tuningManager');
const uasDataExporter = require('../UTILS/uasDataExporter');

// UNIVERSAL GAME INTEGRATION - ALL SYSTEMS
const UniversalGameIntegrator = require('../UTILS/UniversalGameIntegrator');
const gameIntegrator = new UniversalGameIntegrator('ceelo');

// CEELO Configuration - IMPROVED: Restored fair 1:1 payouts
const CEELO_CONFIG = {
    MIN_BET: 5,            // Minimum $5 entry
    PAYOUT_MULTIPLIER: 1.0 // RESTORED: 1:1 even money (fair traditional game)
};

// PROGRESSIVE DIFFICULTY MODES - ALL HOUSE FAVORABLE NOW
const CEELO_MODES = {
    safe: {
        name: '🛡️ Safe',
        description: 'Conservative mode with reduced payouts',
        minBet: 500,
        evenMoneyMultiplier: 1.9, // FIXED: 1.9x payout (90% profit)
        emoji: '🛡️',
        color: '#4CAF50'
    },
    balanced: {
        name: '⚖️ Balanced',
        description: 'Standard mode with moderate house edge',
        minBet: 1000,
        evenMoneyMultiplier: 1.8, // FIXED: 1.8x payout (80% profit)
        emoji: '⚖️',
        color: '#FF9800'
    },
    risky: {
        name: '⚡ Risky',
        description: 'High risk with lower payouts',
        minBet: 2500,
        evenMoneyMultiplier: 1.7, // FIXED: 1.7x payout (70% profit)
        emoji: '⚡',
        color: '#FF8800'
    },
    extreme: {
        name: '🔥 Extreme',
        description: 'Maximum risk with minimal payouts',
        minBet: 5000,
        evenMoneyMultiplier: 1.6, // FIXED: 1.6x payout (60% profit)
        emoji: '🔥',
        color: '#FF0000'
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ceelo')
        .setDescription('🎲 CEELO - Simple dice game! You vs House, 3 dice each, best hand wins 1:1!')
        .addStringOption(option =>
            option.setName('bet')
                .setDescription(`Bet amount (Min: $${CEELO_CONFIG.MIN_BET}) - supports K/M/B suffixes (no max limit!)`)
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Risk mode (higher modes have better payouts but higher minimum bets)')
                .setRequired(false)
                .addChoices(
                    { name: '🛡️ Safe (Min: $500, Payout: 0.98x)', value: 'safe' },
                    { name: '⚖️ Balanced (Min: $1K, Payout: 0.97x)', value: 'balanced' },
                    { name: '⚡ Risky (Min: $2.5K, Payout: 0.95x)', value: 'risky' },
                    { name: '🔥 Extreme (Min: $5K, Payout: 0.93x)', value: 'extreme' }
                )
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = interaction.guildId;
        const betAmountStr = interaction.options.getString('bet');
        const selectedMode = interaction.options.getString('mode') || 'balanced';

        // Get mode configuration
        const modeConfig = CEELO_MODES[selectedMode] || CEELO_MODES.balanced;

        try {
            // Defer reply immediately to prevent timeout
            await interaction.deferReply();

            // Check maintenance mode first
            const maintenanceGuard = require('../UTILS/maintenanceGuard');
            const maintenanceCheck = await maintenanceGuard.check(guildId, 'ceelo');
            if (!maintenanceCheck.allowed) {
                return await interaction.editReply({ embeds: [maintenanceCheck.embed] });
            }

            // Session guard check
            const sessionGuard = require('../UTILS/sessionGuard');
            const check = await sessionGuard.check(userId, guildId, 'ceelo', interaction.client || null);
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
                GameType.CEELO,
                modeConfig.minBet,
                null // No max bet limit - bulletproof economy handles all risk
            );
            
            if (!validation.isValid) {
                return await interaction.editReply({ embeds: [validation.errorEmbed] });
            }
            
            const betAmount = validation.parsedAmount;

        // ENHANCED SESSION SECURITY CHECK
        const sessionCheck = await gameIntegrator.checkGameSession(userId, guildId, 'ceelo', betAmount);
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

            logger.info(`CEELO started by ${username} (${userId}) with bet ${fmt(betAmount)}`);

            // Create session for CEELO
            const sessionResult = await sessionManager.createSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: 'ceelo',
                betAmount,
                betPreDeducted: true, // Bet already deducted by PayoutManager
                timeout: 120000, // 2 minutes
                metadata: {
                    gamePhase: 'playing',
                    betAmount: betAmount,
                    mode: selectedMode,
                    modeConfig: modeConfig
                }
            });

            if (!sessionResult.success) {
                throw new Error(`Session creation failed: ${sessionResult.error}`);
            }

            const sessionId = sessionResult.sessionId;

            // Start the CEELO game
            const { handleCeeloGame } = require('../GAMES/ceelo');

            await handleCeeloGame(interaction, interaction.client || null, sessionId, {
                userId: userId,
                username: username,
                betAmount: betAmount,
                channelId: interaction.channelId,
                guildId: guildId
            });

        } catch (error) {
            logger.error(`CEELO command failed: ${error?.stack || error}`);
            
            if (interaction?.client) {
                try {
                    await sendLogMessage(
                        interaction.client,
                        'error',
                        `CEELO error for ${interaction.user.tag} (${userId}) — ${error.message}`,
                        userId,
                        guildId
                    );
                } catch (_) {}
            }

            // Enhanced session cleanup
            try {
                await sessionManager.forceCleanupUser(userId, guildId, 'CEELO initialization error');
                logger.info(`Forced cleanup completed for user ${userId} after CEELO command failure`);
            } catch (cleanupError) {
                logger.error(`Failed to cleanup after CEELO command error: ${cleanupError.message}`);
            }

            const embed = new EmbedBuilder()
                .setTitle('❌ CEELO Error')
                .setDescription('Failed to start CEELO game. Please try again.')
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