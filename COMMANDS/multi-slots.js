/**
 * Matrix Slots game command (3x3 slots with multiple paylines)
 * Buffalo symbol triggers bonus rounds with 5 free spins and 3x multiplier
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const { 
    spinMatrixSlots, 
    calculateMatrixPayout, 
    createMatrixImage,
    createSpinningMatrixGIF,
    MATRIX_MIN_BET
} = require('../GAMES/slots');
const { 
    createMatrixEmbed, 
    handleBuffaloBonusStart, 
    handleBuffaloBonusSpin 
} = require('../GAMES/multi-slots');
const dbManager = require('../UTILS/database');
const sessionManager = require('../UTILS/sessionManager');
const logger = require('../UTILS/logger');
const comprehensiveLogger = require('../UTILS/comprehensiveLogger');

// PROGRESSIVE DIFFICULTY MODES
const MULTI_SLOTS_MODES = {
    safe: {
        name: '🛡️ Safe',
        description: 'Conservative mode with standard payouts',
        minBet: 500,
        maxMatrixMultiplier: 3.0,
        emoji: '🛡️',
        color: '#4CAF50'
    },
    balanced: {
        name: '⚖️ Balanced',
        description: 'Standard mode with traditional payouts',
        minBet: 1000,
        maxMatrixMultiplier: 5.0,
        emoji: '⚖️',
        color: '#FF9800'
    },
    risky: {
        name: '⚡ Risky',
        description: 'High risk with enhanced payouts',
        minBet: 2500,
        maxMatrixMultiplier: 5.0,
        emoji: '⚡',
        color: '#FF8800'
    },
    extreme: {
        name: '🔥 Extreme',
        description: 'Maximum risk with premium payouts',
        minBet: 5000,
        maxMatrixMultiplier: 5.0,
        emoji: '🔥',
        color: '#FF0000'
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('multi-slots')
        .setDescription('Play the 3x3 matrix slots with multiple paylines! Buffalo triggers bonus rounds!')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to bet (supports K/M/B, "all", "half")')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Risk mode (higher modes have better payouts but higher minimum bets)')
                .setRequired(false)
                .addChoices(
                    { name: '🛡️ Safe (Min: $500, Max Matrix: 3x)', value: 'safe' },
                    { name: '⚖️ Balanced (Min: $1K, Max Matrix: 5x)', value: 'balanced' },
                    { name: '⚡ Risky (Min: $2.5K, Max Matrix: 5x)', value: 'risky' },
                    { name: '🔥 Extreme (Min: $5K, Max Matrix: 5x)', value: 'extreme' }
                )
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName || 'Player';
        const amount = interaction.options.getString('amount');
        const selectedMode = interaction.options.getString('mode') || 'balanced';
        const guildId = await getGuildId(interaction);

        // Get mode configuration
        const modeConfig = MULTI_SLOTS_MODES[selectedMode] || MULTI_SLOTS_MODES.balanced;

        try {
            // Check maintenance mode first
            const maintenanceGuard = require('../UTILS/maintenanceGuard');
            const maintenanceCheck = await maintenanceGuard.check(guildId, 'multi-slots');
            if (!maintenanceCheck.allowed) {
                return await interaction.reply({ embeds: [maintenanceCheck.embed], flags: MessageFlags.Ephemeral });
            }

            // Guard session before any processing
            const sessionGuard = require('../UTILS/sessionGuard');
            const check = await sessionGuard.check(userId, guildId, 'multi-slots', interaction.client);
            if (!check.allowed) {
                const embed = new EmbedBuilder().setTitle('❌ Session Error').setDescription(check.message).setColor(0xFF0000);
                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
            // Ensure user exists and get balance
            await dbManager.ensureUser(userId, username);
            const userBalance = await dbManager.getUserBalance(userId, guildId);

            // Validate and deduct bet with special matrix requirements
            const validation = await PayoutManager.validateAndDeductBet(
                interaction,
                amount,
                GameType.MULTI_SLOTS,
                modeConfig.minBet,      // Mode-specific minimum bet
                null,                // No max bet limit
                { matrixMinBet: MATRIX_MIN_BET }  // Special requirement for matrix mode
            );

            if (!validation.isValid) {
                return await interaction.reply({ embeds: [validation.errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const betAmount = validation.parsedAmount;

        // ENHANCED SESSION SECURITY CHECK
        const sessionCheck = await gameIntegrator.checkGameSession(userId, guildId, 'multi-slots', betAmount);
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

            const oldWallet = validation.newWallet + betAmount;

            // Create game session
            const sessionResult = await sessionManager.createSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: 'multi-slots',
                betAmount,
                betPreDeducted: true,
                timeout: 180000, // 3 minutes for Multi-Slots
                metadata: {
                    gamePhase: 'active',
                    singlePlayer: true,
                    mode: selectedMode,
                    modeConfig: modeConfig
                },
                interaction
            });
            
            if (!sessionResult.success) {
                await PayoutManager.refundBet(userId, guildId, betAmount, 'Failed to create session');
                const embed = new EmbedBuilder()
                    .setTitle('❌ Session Error')
                    .setDescription(`Failed to create game session: ${sessionResult.error}`)
                    .setColor(0xFF0000);
                
                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            // Defer reply for animation and image generation
            await interaction.deferReply();

            // Spin the matrix slots for real result immediately
            const matrix = spinMatrixSlots();
            const result = calculateMatrixPayout(matrix, betAmount, modeConfig); // Apply mode restrictions

            // Check for buffalo bonus
            const buffaloBonus = result.buffaloBonus;

            // Create game result
            const gameResult = new GameResult({
                userId: userId,
                guildId: guildId,
                gameType: GameType.MULTI_SLOTS,
                betAmount: betAmount,
                payout: result.payout,
                won: result.won,

        // BULLETPROOF ECONOMY AND SECURITY PROCESSING
        try {
            const gameResult = await gameIntegrator.processGameResult({
                userId,
                guildId,
                gameType: 'multi-slots',
                betAmount,
                originalPayout: result.payout || 0,
                won: result.won || false
            });
            
            if (gameResult.success) {
                result.payout = gameResult.finalPayout;
            }
        } catch (gameError) {
            logger.warn(`Game result processing failed: ${gameError.message}`);
        }

                specialResult: buffaloBonus ? 'Buffalo Bonus Triggered' : result.type
            });

            // Process payout
            const payoutResult = await PayoutManager.processGamePayout(gameResult);

            // Record game result for AI learning
            try {
                await dbManager.recordGameResult(
                    userId,
                    guildId,
                    'multi-slots',
                    result.won,
                    betAmount,
                    result.payout,
                    {
                        matrix: result.symbols,
                        winType: result.type,
                        multiplier: result.multiplier,
                        houseEdge: 0.25,
                        gameType: 'multi-slots',
                        buffaloBonus: buffaloBonus || false
                    }
                );
            } catch (aiError) {
                logger.error(`Failed to record multi-slots game result for AI: ${aiError.message}`);
            }

            // Add XP for game completion
            try {
                const levelingSystem = require('../UTILS/levelingSystem');
                const specialResult = result.multiplier >= 5 ? 'big_win' : 
                                   result.multiplier >= 20 ? 'massive_win' : null;
                
                const xpResult = await levelingSystem.handleGameComplete(userId, guildId, 'multi-slots', result.won, specialResult);
                
                // Handle level up if occurred
                if (xpResult && xpResult.levelUp) {
                    const levelUpEmbed = levelingSystem.createLevelUpEmbed(interaction.user, xpResult.newLevel);
                    
                    // Award level-up rewards
                    await levelingSystem.processLevelUpRewards(userId, guildId, xpResult.newLevel);
                    
                    // Send level up message in level up channel
                    try {
                        const levelUpChannel = interaction.client.channels.cache.get('1411018763008217208');
                        if (levelUpChannel) {
                            await levelUpChannel.send({ embeds: [levelUpEmbed] });
                        }
                    } catch (levelError) {
                        logger.debug(`Could not send level up message: ${levelError.message}`);
                    }
                }
            } catch (xpError) {
                logger.debug(`Could not award XP for multi-slots: ${xpError.message}`);
            }

            if (!payoutResult.success) {
                logger.error(`Failed to process matrix slots payout for user ${userId}`);
                await PayoutManager.refundBet(userId, guildId, betAmount, 'Payout processing failed');
                
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Game Error')
                    .setDescription('An error occurred processing your game. Your bet has been refunded.')
                    .setColor(0xFF0000);
                
                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // Get updated balance
            const finalBalance = await dbManager.getUserBalance(userId, guildId);

            // PHASE 1: Show animated matrix GIF first (minimal spinning embed)
            const animatedGIF = await createSpinningMatrixGIF(matrix);

            const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
// UNIVERSAL GAME INTEGRATION - ALL SYSTEMS
const UniversalGameIntegrator = require('../UTILS/UniversalGameIntegrator');
const securityLogger = require('../UTILS/securityLogger');
const sessionGuard = require('../UTILS/sessionGuard');
const transparentPayoutManager = require('../UTILS/transparentPayoutManager');
const tuningManager = require('../UTILS/tuningManager');
const { secureRandomFloat, secureRandomInt, secureRandomBytes } = require('../UTILS/rng');

// Initialize game integrator
const gameIntegrator = new UniversalGameIntegrator('multi-slots');

            const spinningEmbed = buildSessionEmbed({
                title: `🎰 ${interaction.user.displayName}'s Matrix Slots`,
                topFields: [
                    { name: 'Spinning', value: 'Matrix reels are spinning... 🎞️', inline: false },
                    { name: '❓ How to Play', value: '• 3x3 matrix with 8 paylines\n• Match symbols on paylines to win\n• 🦬 Buffalo = 5 free spins with 3x multiplier!\n• More matches = bigger wins!', inline: false }
                ],
                bankFields: [
                    { name: 'Paylines', value: 'Horizontal, Vertical, Diagonal', inline: true },
                    { name: 'Special', value: '🦬 Buffalo Bonus Round', inline: true }
                ],
                stageText: 'MATRIX SPINNING...',
                color: 0xFFD700,
                footer: 'Good luck!'
            });

            const animationData = { embeds: [spinningEmbed] };

            if (animatedGIF) {
                animationData.files = [{ attachment: animatedGIF, name: 'matrix-animation.gif' }];
                spinningEmbed.setImage('attachment://matrix-animation.gif');
            }

            // If buffalo bonus triggered, add button and create bonus session
            if (buffaloBonus) {
                const bonusButtons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`buffalo-bonus-${userId}`)
                            .setLabel('🦬 Start Buffalo Bonus!')
                            .setStyle(ButtonStyle.Success)
                    );
                
                animationData.components = [bonusButtons];

                // Create bonus session using game logic
                await handleBuffaloBonusStart(interaction, userId, betAmount, finalBalance, guildId);
            }

            await interaction.editReply(animationData);

            // PHASE 2: After GIF finishes, show static result
            // Wait for animation to complete (GIF has 60 frames * ~80-330ms = ~12 seconds)
            setTimeout(async () => {
                try {
                    const staticImage = await createMatrixImage(matrix, result.winningLines || [], result.won);
                    
                    // Create final result embed
                    const finalEmbed = createMatrixEmbed(
                        interaction.user,
                        matrix,
                        result,
                        betAmount,
                        finalBalance,
                        buffaloBonus
                    );

                    const finalData = { embeds: [finalEmbed], attachments: [] };

                    if (staticImage) {
                        finalData.files = [{ attachment: staticImage, name: 'matrix-result.png' }];
                        finalEmbed.setImage('attachment://matrix-result.png');
                    }

                    // Preserve buffalo bonus button if it was triggered
                    if (buffaloBonus) {
                        const bonusButtons = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`buffalo-bonus-${userId}`)
                                    .setLabel('🦬 Start Buffalo Bonus!')
                                    .setStyle(ButtonStyle.Success)
                            );
                        
                        finalData.components = [bonusButtons];
                    }

                    await interaction.editReply(finalData);
                } catch (error) {
                    logger.error(`Error updating matrix slots to static result: ${error.message}`);
                }
            }, 13000); // 13 second delay to ensure matrix GIF completes

            // Log game result
            await sendLogMessage(
                interaction.client,
                'game',
                `Matrix slots: ${interaction.user.displayName} ${result.won ? 'won' : 'lost'} ${fmt(Math.abs(result.payout - betAmount))} ${buffaloBonus ? '+ Buffalo Bonus!' : ''}`,
                userId,
                guildId
            );

            // Log significant wins
            if (result.won && result.multiplier >= 50) {
                logger.info(`Big matrix slots win: ${interaction.user.tag} (${userId}) won ${fmt(result.payout)} with ${result.multiplier}x multiplier`);
            }

            // Log game result with comprehensive logger
            try {
                await comprehensiveLogger.logGame(userId, username || 'Player', 'multi-slots', result.won ? 'WIN' : 'LOSS', {
                    betAmount,
                    payout: result.payout,
                    multiplier: result.multiplier,
                    matrix: result.symbols,
                    mode: selectedMode,
                    buffaloBonus: buffaloBonus || false,
                    playForRecipient: global.playForContext?.recipientName || null
                });
            } catch (logError) {
                logger.warn(`Failed to log multi-slots game with comprehensive logger: ${logError.message}`);
            }

            // Complete session (payout already processed via PayoutManager above)
            await sessionManager.endSession(sessionResult.sessionId, {
                outcome: result.won ? 'WON' : 'LOST',
                payout: 0,
                won: result.won,
                netChange: result.payout - betAmount
            });

        } catch (error) {
            logger.error(`Error in multi-slots command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Game Error')
                .setDescription('An error occurred while playing matrix slots. Please try again.')
                .setColor(0xFF0000);

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    },

    // Buffalo bonus handler
    async handleBuffaloBonus(interaction) {
        try {
            await interaction.deferUpdate();
            
            const result = await handleBuffaloBonusSpin(interaction);
            
            if (!result.success) {
                return await interaction.followUp({
                    content: result.error || 'An error occurred during the bonus game.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // The interaction.editReply is now handled inside handleBuffaloBonusSpin

            // If bonus ended, log completion
            if (result.bonusEnded) {
                await sendLogMessage(
                    interaction.client,
                    'game',
                    `Buffalo bonus completed: ${interaction.user.displayName} won ${result.totalBonusWinnings} total`,
                    interaction.user.id,
                    result.guildId
                );
            }

        } catch (error) {
            logger.error(`Error in buffalo bonus handler: ${error.message}`);
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred during the bonus game.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    },

    // Bonus spin handler
    async handleBonusSpin(interaction) {
        await this.handleBuffaloBonus(interaction);
    }
};
