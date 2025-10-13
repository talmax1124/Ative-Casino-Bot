/**
 * Slots game command for the casino bot
 * Classic slot machine with various symbols and multipliers
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { fmt, fmtDelta, getGuildId, sendLogMessage, parseAmount } = require('../UTILS/common');
const { spinSlots, calculatePayout, createSlotDisplay, createSlotsImage, createSpinningSlotGIF } = require('../GAMES/slots');
// economyAnalyzer moved to UAS bot - using static base modes for now
const SMGameType = { SLOTS: 'slots' };
const sessionManager = require('../UTILS/sessionManager');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');
const transparentPayoutManager = require('../UTILS/transparentPayoutManager');
const securityLogger = require('../UTILS/securityLogger');
// EconomyGuardianInterface removed - using bulletproof economy
const tuningManager = require('../UTILS/tuningManager');
const comprehensiveLogger = require('../UTILS/comprehensiveLogger');
const uasDataExporter = require('../UTILS/uasDataExporter');

// UNIVERSAL GAME INTEGRATION - ALL SYSTEMS
const UniversalGameIntegrator = require('../UTILS/UniversalGameIntegrator');
const gameIntegrator = new UniversalGameIntegrator('slots');

// SLOTS DIFFICULTY MODES - Progressive risk/reward system
const SLOTS_MODES = {
    safe: {
        name: '🛡️ Safe',
        minBet: 500,
        maxMultiplier: 1.8,
        description: 'Min: $500, Max Multiplier: 1.8x'
    },
    balanced: {
        name: '⚖️ Balanced', 
        minBet: 1000,
        maxMultiplier: 2.0,
        description: 'Min: $1K, Max Multiplier: 2.0x'
    },
    risky: {
        name: '⚡ Risky',
        minBet: 2500, 
        maxMultiplier: 2.2,
        description: 'Min: $2.5K, Max Multiplier: 2.2x'
    },
    extreme: {
        name: '🔥 Extreme',
        minBet: 5000,
        maxMultiplier: 2.2,
        description: 'Min: $5K, Max Multiplier: 2.2x'
    }
};

/**
 * Create slots result embed using gameSessionKit style
 */
async function createSlotsEmbed(user, symbols, result, betAmount, userBalance, oldWallet, guildId = null, aiResult = null) {
    // Extract userId for game result processing
    const userId = user ? user.id : null;
    
    // Economy badge removed - using bulletproof economy system
    const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
    
    const topFields = [];
    
    // Check if this is a playfor game
    const playForRecipient = global.playForContext?.recipientName;
    const winningForSomeoneElse = playForRecipient && global.playForContext.recipientId;
    
    // Slot display (raw text; formatted by buildSessionEmbed)
    const slotDisplay = createSlotDisplay(symbols);
    topFields.push({
        name: '🎲 SLOT RESULT',
        value: slotDisplay,
        inline: false
    });
    
    // Add playfor context if applicable
    if (winningForSomeoneElse) {
        topFields.push({
            name: '🎁 Playing For',
            value: `@${playForRecipient}`,
            inline: true
        });
    }

    // Banking fields
    const bankFields = [
        { name: '💰 Bet', value: fmt(betAmount), inline: true },
        { name: '💵 Wallet', value: fmt(userBalance.wallet), inline: true },
        { name: '🏦 Bank', value: fmt(userBalance.bank), inline: true }
    ];

    if (result.won) {

        // BULLETPROOF ECONOMY AND SECURITY PROCESSING
        try {
            const gameResult = await gameIntegrator.processGameResult({
                userId,
                guildId,
                gameType: 'slots',
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

        bankFields.splice(1, 0, 
            { name: '🎯 Multiplier', value: `x${result.multiplier.toFixed(2)}`, inline: true },
            { name: '💸 Payout', value: fmt(result.payout), inline: true }
        );
    }

    // Determine game state and color
    let stageText = '';
    let color = 0x00ff00; // Default green

    if (result.won) {
        if (winningForSomeoneElse) {
            if (result.multiplier >= 100) {
                stageText = `INCREDIBLE WIN FOR @${playForRecipient}!`;
                color = 0xFFD700; // Gold
            } else if (result.multiplier >= 50) {
                stageText = `AMAZING WIN FOR @${playForRecipient}!`;
                color = 0x00ff00; // Green
            } else {
                stageText = `WON FOR @${playForRecipient}!`;
                color = 0x00ff00; // Green
            }
        } else {
            if (result.multiplier >= 100) {
                stageText = 'INCREDIBLE WIN!';
                color = 0xFFD700; // Gold
            } else if (result.multiplier >= 50) {
                stageText = 'AMAZING WIN!';
                color = 0x00ff00; // Green
            } else {
                stageText = 'WINNER!';
                color = 0x00ff00; // Green
            }
        }
    } else {
        stageText = 'TRY AGAIN';
        color = 0xff0000; // Red
    }

    // Get economic indicators if AI result is available
    let economicFooter = result.won ? result.type : 'Better luck next time!';
    if (winningForSomeoneElse && result.won) {
        economicFooter = `${result.type} - Winnings sent to @${playForRecipient}!`;
    }
    if (aiResult) {
        // EconomyGuardianInterface removed - using bulletproof economy
    }

    // Protection systems are invisible to players - they just see their actual odds/results

    return buildSessionEmbed({
        title: `🎰 ${user.displayName}'s Slots`,
        topFields,
        bankFields,
        stageText,
        color,
        footer: economicFooter
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Play the slot machine!')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to bet (supports K/M/B, "all", "half")')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Risk mode (higher modes have better multipliers but higher minimum bets)')
                .setRequired(false)
                .addChoices(
                    { name: '🛡️ Safe (Min: $500, Max: 2x)', value: 'safe' },
                    { name: '⚖️ Balanced (Min: $1K, Max: 2.5x)', value: 'balanced' },
                    { name: '⚡ Risky (Min: $2.5K, Max: 3x)', value: 'risky' },
                    { name: '🔥 Extreme (Min: $5K, Max: 3.5x)', value: 'extreme' }
                )
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName || 'Player';
        const amount = interaction.options.getString('amount');
        const mode = interaction.options.getString('mode') || 'balanced'; // Default to balanced mode
        const guildId = await getGuildId(interaction);
        
        // Get mode configuration
        const modeConfig = SLOTS_MODES[mode];
        if (!modeConfig) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Invalid Mode')
                .setDescription('Invalid game mode selected.')
                .setColor(0xFF0000);
            return await interaction.reply({ embeds: [errorEmbed], flags: 64 });
        }

        try {
            logger.debug(`Slots execute called by ${username} (${userId}) in guild ${guildId} with amount '${amount}' and mode '${mode}'`);
            
            // Check maintenance mode first
            const maintenanceGuard = require('../UTILS/maintenanceGuard');
            const maintenanceCheck = await maintenanceGuard.check(guildId, 'slots');
            if (!maintenanceCheck.allowed) {
                return await interaction.reply({ embeds: [maintenanceCheck.embed], flags: 64 });
            }
            
            // Validate session before proceeding (via sessionGuard)
            const sessionGuard = require('../UTILS/sessionGuard');
            const check = await sessionGuard.check(userId, guildId, SMGameType.SLOTS, interaction.client);
            logger.debug(`canCreateSession result for ${userId}: ${JSON.stringify({ allowed: check.allowed, reason: check.code })}`);
            if (!check.allowed) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Session Error')
                    .setDescription(check.message)
                    .setColor(0xFF0000)
                    .setTimestamp();
                return await interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }

            // 🎛️ INITIALIZE AI TUNING SYSTEM
            await tuningManager.initialize();
            
            // Ensure user exists and get balance
            await dbManager.ensureUser(userId, username);
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            logger.debug(`Fetched user balance for ${userId}: wallet=${userBalance.wallet}, bank=${userBalance.bank}`);

            // Validate and deduct bet using mode-specific minimum
            const validation = await PayoutManager.validateAndDeductBet(
                interaction,
                amount,
                GameType.SLOTS,
                modeConfig.minBet,  // Mode-specific minimum bet
                null                // No max bet limit - bulletproof economy handles risk
            );

            if (!validation.isValid) {
                return await interaction.reply({ embeds: [validation.errorEmbed], flags: 64 });
            }

            const betAmount = validation.parsedAmount;

        // ENHANCED SESSION SECURITY CHECK
        const sessionCheck = await gameIntegrator.checkGameSession(userId, guildId, 'slots', betAmount);
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

        // Get balance adjustments for display purposes
        const balanceAdjustments = await gameIntegrator.getBalanceAdjustments(userId, guildId, 0.4, betAmount * modeConfig.maxMultiplier, 0.25);
        if (balanceAdjustments) {
            logger.debug(`Balance adjustments for ${username}: ${JSON.stringify(balanceAdjustments)}`);
        }

        // Security logging with balance context
        await securityLogger.logSecurityEvent(userId, 'GAME_BET', {
            amount: betAmount,
            game: 'slots',
            mode: mode,
            balanceAdjustments: balanceAdjustments
        }, guildId);

            logger.debug(`Bet validated for ${userId}: parsedAmount=${betAmount}`);
            const oldWallet = validation.newWallet + betAmount; // Wallet before bet

            // EconomyGuardianInterface removed - using bulletproof economy
            const aiResult = null;

            // Create game session
            const sessionResult = await sessionManager.createSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: SMGameType.SLOTS,
                betAmount,
                betPreDeducted: true,
                timeout: 60000, // 1 minute
                metadata: {
                    gamePhase: 'spinning',
                    symbols: [],
                    mode: mode,
                    modeConfig: modeConfig
                },
                interaction
            });

            if (!sessionResult.success) {
                throw new Error(`Session creation failed: ${sessionResult.error}`);
            }

            const sessionId = sessionResult.sessionId;
            logger.debug(`Slots session created: ${sessionId} for ${userId}`);

            // Defer reply for animation and image generation
            await interaction.deferReply();

            // Personalized game helper removed - using bulletproof economy
            const personalizedConfig = { payouts: { cherry: 2, lemon: 3, orange: 5, bar: 10, seven: 20 } }; // Default payouts
            
            // Spin the slots for real result immediately
            const symbols = spinSlots();
            const baseResult = calculatePayout(symbols, betAmount, personalizedConfig.payouts, modeConfig);
            
            // Validate base result to prevent NaN propagation
            if (isNaN(baseResult.payout) || isNaN(baseResult.multiplier) || !isFinite(baseResult.payout) || !isFinite(baseResult.multiplier)) {
                logger.error(`Invalid base result from calculatePayout: payout=${baseResult.payout}, multiplier=${baseResult.multiplier}, symbols=${JSON.stringify(symbols)}, betAmount=${betAmount}`);
                throw new Error('Invalid payout calculation - game cancelled');
            }
            
            // 🎰 APPLY AI TUNING SYSTEM - REAL ECONOMIC REGULATION
            const tuningAdjustment = await tuningManager.getAdjustedPayout('slots', baseResult.payout, betAmount);
            const regulatedPayout = baseResult.won ? tuningAdjustment.adjustedPayout : 0;
            
            // Validate tuning adjustment to prevent NaN propagation
            if (isNaN(tuningAdjustment.adjustedPayout) || !isFinite(tuningAdjustment.adjustedPayout)) {
                logger.error(`Invalid tuning adjustment: adjustedPayout=${tuningAdjustment.adjustedPayout}, originalPayout=${baseResult.payout}, betAmount=${betAmount}`);
                throw new Error('Invalid tuning calculation - game cancelled');
            }
            
            // Apply AI multiplier adjustment to tuning-regulated payout
            const aiMultiplier = aiResult?.multiplierAdjustment?.finalMultiplier || 1.0;
            const aiAdjustedPayout = regulatedPayout > 0 ? Math.round((regulatedPayout * aiMultiplier) * 100) / 100 : 0;
            const aiAdjustedResult = {
                ...baseResult,
                payout: aiAdjustedPayout
            };
            
            // Log tuning application for monitoring
            if (tuningAdjustment.payoutDelta !== 0 || tuningAdjustment.feeApplied) {
                logger.info(`🎛️ SLOTS TUNING: ${baseResult.payout} -> ${regulatedPayout} (delta: ${(tuningAdjustment.payoutDelta * 100).toFixed(1)}%, fee: ${tuningAdjustment.feeApplied})`);
            }
            
            // Calculate transparent multiplier for display
            const transparentMultiplier = transparentPayoutManager.calculateTransparentMultiplier(
                baseResult.multiplier, 
                'slots'
            );
            
            // Final payout is the AI-adjusted payout
            const finalActualPayout = aiAdjustedResult.won ? aiAdjustedPayout : 0;
            
            // Final validation to prevent NaN values from reaching PayoutManager
            if (isNaN(finalActualPayout) || !isFinite(finalActualPayout)) {
                logger.error(`Invalid final payout calculation: finalActualPayout=${finalActualPayout}, aiAdjustedPayout=${aiAdjustedPayout}`);
                throw new Error('Invalid final payout calculation - game cancelled');
            }
            
            // Use transparent multiplier for display, AI-adjusted payout for winnings
            const result = {
                ...baseResult,
                multiplier: transparentMultiplier,  // Show transparent multiplier
                payout: Math.max(0, Math.round(finalActualPayout * 100) / 100), // Ensure non-negative with consistent rounding
                displayMultiplier: transparentMultiplier,
                actualMultiplier: baseResult.multiplier,
                aiMultiplier: aiMultiplier,                  // Track AI adjustment
                transparentPayout: finalActualPayout
            };

            // Update session with spin results
            await sessionManager.updateSession(sessionId, {
                gameData: {
                    symbols,
                    result,
                    gamePhase: 'completed',
                    gameStarted: true
                }
            }, 'spin_complete');

            // Create game result
            const gameResult = new GameResult({
                userId: userId,
                guildId: guildId,
                gameType: GameType.SLOTS,
                betAmount: betAmount,
                payout: result.payout,
                won: result.won,
                specialResult: result.type
            });

            // Process payout (pass interaction for profile capture)
            const payoutResult = await PayoutManager.processGamePayout(gameResult, interaction);

            if (!payoutResult.success) {
                logger.error(`Failed to process slots payout for user ${userId}`);
                // Refund the bet
                await PayoutManager.refundBet(userId, guildId, betAmount, 'Payout processing failed');
                
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Game Error')
                    .setDescription('An error occurred processing your game. Your bet has been refunded.')
                    .setColor(0xFF0000);
                
                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // Record game result for statistics AND economy analyzer
            try {
                // ENHANCED SECURITY LOGGING FOR ULTRA-AGGRESSIVE SYSTEMS
                try {
                    // Log the bet first with enhanced metadata
                    await securityLogger.logSecurityEvent(userId, 'GAME_BET', {
                        game: 'slots',
                        amount: betAmount,
                        mode: mode,
                        timestamp: Date.now(),
                        sessionStart: true
                    });
                    
                    // Log the result with comprehensive tracking data
                    await securityLogger.logSecurityEvent(userId, result.won ? 'GAME_WIN' : 'GAME_LOSS', {
                        game: 'slots',
                        amount: result.won ? result.payout : betAmount,
                        betAmount: betAmount,
                        multiplier: result.multiplier,
                        symbols: symbols,
                        winType: result.type,
                        consecutivePlay: true,
                        payoutRatio: result.won ? (result.payout / betAmount) : 0,
                        timestamp: Date.now()
                    });
                } catch (secErr) {
                    logger.warn(`Enhanced slots security logging failed: ${secErr.message}`);
                }
                await dbManager.recordGameResult(
                    userId, 
                    guildId, 
                    'slots', 
                    result.won, 
                    betAmount, 
                    result.payout,
                    {
                        multiplier: result.multiplier,
                        symbols: result.symbols,
                        type: result.type,
                        lines: result.winningLines?.length || 0
                    }
                );
                
                // 📊 RECORD FOR AI ECONOMY ANALYZER
                await tuningManager.recordGameResult(userId, 'slots', betAmount, result.payout, result.won);
                
                // 🔗 EXPORT TO UAS BOT FOR CENTRALIZED ANALYSIS
                // Fetch final balance after payout for accurate export
                let finalBalanceForExport = null;
                try {
                    finalBalanceForExport = await dbManager.getUserBalance(userId, guildId);
                } catch (e) {
                    logger.warn(`Failed to fetch final balance for export: ${e.message}`);
                }

                await uasDataExporter.exportGameResult({
                    gameType: 'slots',
                    userId: userId,
                    guildId: guildId,
                    betAmount: betAmount,
                    payout: result.payout,
                    won: result.won,
                    multiplier: result.multiplier,
                    houseEdgeApplied: null,
                    userWealthBefore: userBalance?.wallet || null,
                    userWealthAfter: finalBalanceForExport?.wallet || null,
                    metadata: {
                        symbols: symbols,
                        mode: mode,
                        type: result.type,
                        tuningApplied: tuningAdjustment?.payoutDelta || 0,
                        aiAdjustment: aiResult?.multiplierAdjustment?.finalMultiplier || 1
                    }
                });
                
            } catch (recordError) {
                logger.warn(`Failed to record slots game result: ${recordError.message}`);
            }

            // Add XP for game completion
            try {
                const levelingSystem = require('../UTILS/levelingSystem');
                const specialResult = result.multiplier >= 5 ? 'big_win' : 
                                   result.multiplier >= 20 ? 'massive_win' : null;
                
                const xpResult = await levelingSystem.handleGameComplete(userId, guildId, 'slots', result.won, specialResult);
                
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
                logger.debug(`Could not award XP for slots: ${xpError.message}`);
            }

            // Get updated balance
            const finalBalance = await dbManager.getUserBalance(userId, guildId);

            // PHASE 1: Show animated GIF first (no result/bet fields yet)
            const animatedGIF = await createSpinningSlotGIF(symbols);

            // Build a minimal "spinning" embed so users see the GIF first
            const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
            
            const spinningEmbed = buildSessionEmbed({
                title: `🎰 ${interaction.user.displayName}'s Slots`,
                topFields: [
                    { name: 'Spinning', value: 'Reels are spinning... 🎞️', inline: false },
                ],
                bankFields: [],
                stageText: 'SPINNING...',
                color: 0xFFD700,
                footer: 'Good luck!'
            });

            const animationData = { embeds: [spinningEmbed] };
            if (animatedGIF) {
                animationData.files = [{ attachment: animatedGIF, name: 'slots-animation.gif' }];
                spinningEmbed.setImage('attachment://slots-animation.gif');
            }

            await interaction.editReply(animationData);

            // PHASE 2: After GIF finishes, show static result
            // Wait for animation to complete (GIF has 25 frames * 60ms = 1.5 seconds)
            setTimeout(async () => {
                try {
                    // Check if interaction is still valid before proceeding
                    if (interaction.replied || interaction.deferred) {
                        const staticImage = await createSlotsImage(symbols, result.won);
                        
                        // Get fresh balance for the embed to avoid scoping issues
                        const currentBalance = await dbManager.getUserBalance(userId, guildId);
                        
                        // Create final result embed
                        const finalEmbed = await createSlotsEmbed(
                            interaction.user,
                            symbols,
                            result,
                            betAmount,
                            currentBalance,
                            oldWallet,
                            guildId,
                            aiResult
                        );
                        
                        // Add mode information to the embed
                        finalEmbed.addFields(
                            { name: '🎮 Mode', value: `${modeConfig.name} ${modeConfig.description}`, inline: true }
                        );

                        // Add booster bonus info if applicable
                        if (payoutResult.boosterBonus > 0) {
                            finalEmbed.addFields(
                                { name: '🚀 Booster Bonus', value: `+${fmt(payoutResult.boosterBonus)} (2% boost!)`, inline: true }
                            );
                            
                            // Add celebration message for boosters
                            if (result.won) {
                                finalEmbed.setDescription(
                                    (finalEmbed.data.description || '') + 
                                    `\n\n✨ **Server Booster Bonus Applied!** You earned an extra 2% on your win!`
                                );
                            }
                        }

                        // Wealth tax notifications removed - using bulletproof economy
                        if (false) { // aiResult is now null
                            const taxNotificationEmbed = null;
                            
                            if (taxNotificationEmbed) {
                                // Send tax notification as a follow-up message
                                try {
                                    await interaction.followUp({ 
                                        embeds: [taxNotificationEmbed], 
                                        flags: 64 
                                    });
                                } catch (followUpError) {
                                    logger.warn(`Failed to send wealth tax notification: ${followUpError.message}`);
                                }
                            }
                        }

                        // Add help button
                        const helpButton = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('slots_help')
                                    .setLabel('❓ How to Play')
                                    .setStyle(ButtonStyle.Secondary)
                            );

                        const finalData = { 
                            embeds: [finalEmbed], 
                            attachments: [], 
                            components: [helpButton] 
                        };

                        if (staticImage) {
                            finalData.files = [{ attachment: staticImage, name: 'slots-result.png' }];
                            finalEmbed.setImage('attachment://slots-result.png');
                        }

                        await interaction.editReply(finalData);
                        
                        // Complete session after final result shown
                        await sessionManager.endSession(sessionId, {
                            outcome: result.won ? 'WIN' : 'LOSS',
                            symbols,
                            finalPayout: result.payout,
                            multiplier: result.multiplier,
                            won: result.won,
                            netChange: result.payout - betAmount
                        });
                    } else {
                        logger.warn(`Slots interaction expired for user ${userId}, cannot update to static result`);
                    }
                    
                } catch (error) {
                    logger.error(`Error updating slots to static result: ${error.message}`);
                    // Don't throw here as it would crash the setTimeout callback
                }
            }, 2000); // 2 second delay for fast animation (25 frames * 60ms = 1.5s + 0.5s buffer)

            // Log game result
            await sendLogMessage(
                interaction.client,
                'game',
                `Slots game: ${interaction.user.displayName} ${result.won ? 'won' : 'lost'} ${fmt(Math.abs(result.payout - betAmount))} (${result.multiplier.toFixed(2)}x)`,
                userId,
                guildId
            );

            // Log significant wins
            if (result.won && result.multiplier >= 50) {
                logger.info(`Big slots win: ${interaction.user.tag} (${userId}) won ${fmt(result.payout)} with ${result.multiplier}x multiplier`);
            }

            // Log game result with comprehensive logger
            try {
                await comprehensiveLogger.logGame(userId, username || 'Player', 'slots', result.won ? 'WIN' : 'LOSS', {
                    betAmount,
                    payout: result.payout,
                    multiplier: result.multiplier,
                    symbols: symbols,
                    mode: mode,
                    playForRecipient: global.playForContext?.recipientName || null
                });
            } catch (logError) {
                logger.warn(`Failed to log slots game with comprehensive logger: ${logError.message}`);
            }

            // Log AI transaction result for audit
            try {
                // EconomyGuardianInterface logging removed - using bulletproof economy
            } catch (logError) {
                logger.warn(`Failed to log AI transaction result: ${logError.message}`);
            }

        } catch (error) {
            logger.error(`Error in slots command: ${error.message}`);
            try {
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `Slots error for ${interaction.user.tag} (${userId}) — ${error.message}`,
                    userId,
                    guildId
                );
            } catch (_) {}
            
            // Process refund if we can determine the bet amount
            let refundAmount = 0;
            try {
                const amount = interaction.options.getString('amount');
                const parsedAmount = parseAmount(amount);
                if (parsedAmount > 0) {
                    refundAmount = parsedAmount;
                    await PayoutManager.refundBet(userId, guildId, refundAmount, 'Slots game error');
                    logger.info(`Refunded ${refundAmount} to user ${userId} for slots error`);
                }
            } catch (refundError) {
                logger.error(`Failed to process slots refund: ${refundError.message}`);
            }
            
            // Handle session error and cleanup
            try {
                const userSession = sessionManager.getUserActiveSession(userId);
                if (userSession) {
                    await sessionManager.cancelSession(userSession.sessionId, 'Slots game error', true);
                }
            } catch (sessionError) {
                logger.error(`Failed to handle session error: ${sessionError.message}`);
            }
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Game Error')
                .setDescription('An error occurred while playing slots. Your bet has been refunded.')
                .setColor(0xFF0000);

            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: 64 });
                }
            } catch (replyError) {
                logger.error(`Failed to send slots error reply: ${replyError.message}`);
            }
        }
    }
};
