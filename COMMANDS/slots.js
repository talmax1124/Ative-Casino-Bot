/**
 * Slots game command for the casino bot
 * Classic slot machine with various symbols and multipliers
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { fmt, fmtDelta, getGuildId, sendLogMessage } = require('../UTILS/common');
const { spinSlots, calculatePayout, createSlotDisplay, createSlotsImage, createSpinningSlotGIF } = require('../GAMES/slots');
// economyAnalyzer moved to UAS bot - using static base modes for now
const SMGameType = { SLOTS: 'slots' };
const sessionManager = require('../UTILS/sessionManager');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');
const OffEconomyBadge = require('../UTILS/offEconomyBadge');
const transparentPayoutManager = require('../UTILS/transparentPayoutManager');
const EconomyGuardianInterface = require('../UTILS/economyGuardianInterface');
const tuningManager = require('../UTILS/tuningManager');


/**
 * Create slots result embed using gameSessionKit style
 */
async function createSlotsEmbed(user, symbols, result, betAmount, userBalance, oldWallet, aiResult = null) {
    // Get off economy badge for the user
    const offEcoBadge = await OffEconomyBadge.getGamePanelBadge(user.id);
    const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
    
    const topFields = [];
    
    // Slot display (raw text; formatted by buildSessionEmbed)
    const slotDisplay = createSlotDisplay(symbols);
    topFields.push({
        name: '🎲 SLOT RESULT',
        value: slotDisplay,
        inline: false
    });

    // Banking fields
    const bankFields = [
        { name: '💰 Bet', value: fmt(betAmount), inline: true },
        { name: '💵 Wallet', value: fmt(userBalance.wallet), inline: true },
        { name: '🏦 Bank', value: fmt(userBalance.bank), inline: true }
    ];

    if (result.won) {
        bankFields.splice(1, 0, 
            { name: '🎯 Multiplier', value: `x${result.multiplier.toFixed(2)}`, inline: true },
            { name: '💸 Payout', value: fmt(result.payout), inline: true }
        );
    }

    // Determine game state and color
    let stageText = '';
    let color = 0x00ff00; // Default green

    if (result.won) {
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
    } else {
        stageText = 'TRY AGAIN';
        color = 0xff0000; // Red
    }

    // Get economic indicators if AI result is available
    let economicFooter = result.won ? result.type : 'Better luck next time!';
    if (aiResult) {
        try {
            const economicIndicators = EconomyGuardianInterface.getEconomicIndicators(user.client);
            economicFooter += ` • Economy: ${economicIndicators.status} (${economicIndicators.gini})`;
        } catch (error) {
            // Ignore errors getting economic indicators
        }
    }

    return buildSessionEmbed({
        title: `🎰 ${user.displayName}'s Slots${offEcoBadge}`,
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
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const amount = interaction.options.getString('amount');
        const guildId = await getGuildId(interaction);

        try {
            logger.debug(`Slots execute called by ${username} (${userId}) in guild ${guildId} with amount '${amount}'`);
            
            // Check maintenance mode first
            const maintenanceGuard = require('../UTILS/maintenanceGuard');
            const maintenanceCheck = await maintenanceGuard.check(guildId, 'slots');
            if (!maintenanceCheck.allowed) {
                return await interaction.reply({ embeds: [maintenanceCheck.embed], flags: MessageFlags.Ephemeral });
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
                return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // 🎛️ INITIALIZE AI TUNING SYSTEM
            await tuningManager.initialize();
            
            // Ensure user exists and get balance
            await dbManager.ensureUser(userId, username);
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            logger.debug(`Fetched user balance for ${userId}: wallet=${userBalance.wallet}, bank=${userBalance.bank}`);

            // 🎛️ GET AI-REGULATED MAX BET LIMIT (allows higher bets with safety)
            const maxBetConfig = await tuningManager.getMaxBetLimit(userId, 'slots', 100000000);
            const dynamicMaxBet = maxBetConfig.maxBet;
            
            // Validate and deduct bet with AI-regulated limits
            const validation = await PayoutManager.validateAndDeductBet(
                interaction,
                amount,
                GameType.SLOTS,
                1,               // Min bet: $1
                dynamicMaxBet    // Max bet: AI-regulated (can be much higher now!)
            );
            
            // Log max bet changes for monitoring
            if (maxBetConfig.adjustmentApplied || maxBetConfig.userCapped) {
                logger.info(`🎛️ SLOTS MAX BET: ${userId} -> ${fmt(dynamicMaxBet)} (${maxBetConfig.userCapped ? 'user-capped' : 'AI-adjusted'})`);
            }

            if (!validation.isValid) {
                return await interaction.reply({ embeds: [validation.errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const betAmount = validation.parsedAmount;
            logger.debug(`Bet validated for ${userId}: parsedAmount=${betAmount}`);
            const oldWallet = validation.newWallet + betAmount; // Wallet before bet

            // AI Economic Interception - Silent optimization and wealth tax assessment
            const aiResult = await EconomyGuardianInterface.interceptEconomicCommand(
                interaction, 'slots', betAmount, { 
                    userBalance: userBalance.wallet + userBalance.bank, 
                    gameType: 'casino_game' 
                }
            );

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
                    symbols: []
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

            // Get personalized payouts for this player
            const PersonalizedGameHelper = require('../UTILS/personalizedGameHelper');
            const personalizedConfig = await PersonalizedGameHelper.getPersonalizedSlots(userId, validation);
            
            // Spin the slots for real result immediately
            const symbols = spinSlots();
            const baseResult = calculatePayout(symbols, betAmount, personalizedConfig.payouts);
            
            // 🎰 APPLY AI TUNING SYSTEM - REAL ECONOMIC REGULATION
            const tuningAdjustment = await tuningManager.getAdjustedPayout('slots', baseResult.payout, betAmount);
            const regulatedPayout = baseResult.won ? tuningAdjustment.adjustedPayout : 0;
            
            // Apply AI multiplier adjustment to tuning-regulated payout
            const aiMultiplier = aiResult.multiplierAdjustment?.finalMultiplier || 1.0;
            const aiAdjustedPayout = regulatedPayout > 0 ? Math.floor(regulatedPayout * aiMultiplier) : 0;
            const aiAdjustedResult = {
                ...baseResult,
                payout: aiAdjustedPayout
            };
            
            // Log tuning application for monitoring
            if (tuningAdjustment.payoutDelta !== 0 || tuningAdjustment.feeApplied) {
                logger.info(`🎛️ SLOTS TUNING: ${baseResult.payout} -> ${regulatedPayout} (delta: ${(tuningAdjustment.payoutDelta * 100).toFixed(1)}%, fee: ${tuningAdjustment.feeApplied})`);
            }
            
            // Apply transparent payout system - show full multiplier in UI but adjust actual payout
            const transparentResult = await transparentPayoutManager.processTransparentPayout(
                userId,
                'slots',
                betAmount,
                baseResult.multiplier,
                { symbols, winType: baseResult.type }
            );
            
            // Combine AI multiplier with transparent payout - AI takes precedence for actual payout
            const finalActualPayout = aiAdjustedResult.won ? Math.min(aiAdjustedPayout, transparentResult.actualPayout) : 0;
            
            // Use UI multiplier for display, AI-adjusted payout for winnings
            const result = {
                ...baseResult,
                multiplier: transparentResult.uiMultiplier,  // Show attractive multiplier
                payout: finalActualPayout,                    // AI and transparent system adjusted payout
                displayMultiplier: transparentResult.uiMultiplier,
                actualMultiplier: baseResult.multiplier,
                aiMultiplier: aiMultiplier,                  // Track AI adjustment
                transparentPayout: transparentResult.actualPayout
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
            const userOffEcoBadge = await OffEconomyBadge.getGamePanelBadge(interaction.user.id);
            const spinningEmbed = buildSessionEmbed({
                title: `🎰 ${interaction.user.displayName}'s Slots${userOffEcoBadge}`,
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
                        
                        // Create final result embed
                        const finalEmbed = await createSlotsEmbed(
                            interaction.user,
                            symbols,
                            result,
                            betAmount,
                            finalBalance,
                            oldWallet,
                            aiResult
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

                        // Show wealth tax notification if applied
                        if (aiResult?.wealthTaxResult?.taxApplied) {
                            const taxNotificationEmbed = EconomyGuardianInterface.createWealthTaxNotificationEmbed(
                                aiResult.wealthTaxResult, 
                                finalBalance
                            );
                            
                            if (taxNotificationEmbed) {
                                // Send tax notification as a follow-up message
                                try {
                                    await interaction.followUp({ 
                                        embeds: [taxNotificationEmbed], 
                                        flags: MessageFlags.Ephemeral 
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

            // Log AI transaction result for audit
            try {
                await EconomyGuardianInterface.logTransactionResult(interaction, 'slots', betAmount, result, aiResult);
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
            
            // Handle game error with session cleanup and refund
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
                    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }
            } catch (replyError) {
                logger.error(`Failed to send slots error reply: ${replyError.message}`);
            }
        }
    }
};
