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

// CEELO Configuration
const CEELO_CONFIG = {
    MIN_BET: 5,            // Minimum $5 entry
    MAX_BET: 25000,        // Maximum $25K bet (per CLAUDE.md)
    PAYOUT_MULTIPLIER: 1   // 1:1 even money
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ceelo')
        .setDescription('🎲 CEELO - Simple dice game! You vs House, 3 dice each, best hand wins 1:1!')
        .addStringOption(option =>
            option.setName('bet')
                .setDescription(`Bet amount (Min: $${CEELO_CONFIG.MIN_BET}, Max: ${fmt(CEELO_CONFIG.MAX_BET)}) - supports K/M/B suffixes`)
                .setRequired(true)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = interaction.guildId;
        const betAmountStr = interaction.options.getString('bet');

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
            const check = await sessionGuard.check(userId, guildId, 'ceelo', interaction.client);
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
                GameType.CEELO,
                CEELO_CONFIG.MIN_BET,
                CEELO_CONFIG.MAX_BET
            );
            
            if (!validation.isValid) {
                return await interaction.editReply({ embeds: [validation.errorEmbed] });
            }
            
            const betAmount = validation.parsedAmount;
            logger.info(`CEELO started by ${username} (${userId}) with bet ${fmt(betAmount)}`);

            // Create session for CEELO
            const sessionResult = await sessionManager.createSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: 'ceelo',
                betAmount,
                timeout: 120000, // 2 minutes
                metadata: {
                    gamePhase: 'playing',
                    betAmount: betAmount
                }
            });

            if (!sessionResult.success) {
                throw new Error(`Session creation failed: ${sessionResult.error}`);
            }

            const sessionId = sessionResult.sessionId;

            // Start the CEELO game
            const { handleCeeloGame } = require('../GAMES/ceelo');
            await handleCeeloGame(interaction, interaction.client, sessionId, {
                userId: userId,
                username: username,
                betAmount: betAmount,
                channelId: interaction.channelId,
                guildId: guildId
            });

        } catch (error) {
            logger.error(`CEELO command failed: ${error?.stack || error}`);
            
            try {
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `CEELO error for ${interaction.user.tag} (${userId}) — ${error.message}`,
                    userId,
                    guildId
                );
            } catch (_) {}

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