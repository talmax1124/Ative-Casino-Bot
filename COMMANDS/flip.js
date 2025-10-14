/**
 * 🚀 HYBRID ENGINE-POWERED COIN FLIP COMMAND
 * Combines original coin flip mechanics with new Engine system
 * Best of both worlds: Simple gameplay + Advanced analytics!
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const dbManager = require('../UTILS/database');

// 🚀 HYBRID ENGINE SYSTEM - Analytics + Original Mechanics Integration
const GameEngine = require('../ENGINES/GameEngine');
const CommunicationEngine = require('../ENGINES/CommunicationEngine');
const AnalyticsEngine = require('../ENGINES/AnalyticsEngine');

// 💎 LUXURY UI ENHANCEMENT SYSTEM
const { 
    LUXURY_ICONS, 
    LUXURY_COLORS, 
    createLuxuryEmbed, 
    enhanceGameResult, 
    createProgressAnimation,
    formatLuxuryCurrency,
    getTierColors
} = require('../UTILS/luxuryUI');

// 🎪 TEXT ANIMATION SYSTEM
const {
    createCoinFlipAnimation,
    createWinAnimation,
    playAnimation,
    addSparkleEffect,
    createDramaticPause
} = require('../UTILS/textAnimations');
const sessionManager = require('../UTILS/sessionManager');
const logger = require('../UTILS/logger');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const levelingSystem = require('../UTILS/levelingSystem');

// Game constants
const FLIP_CONFIG = {
    WIN_MULTIPLIER: 2.0,    // 2x payout for correct guess
    MIN_BET: 100,           // Minimum $100 bet
    MAX_BET: null           // No max bet limit
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('flip')
        .setDescription('🪙 Classic coin flip - heads or tails?')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to bet (supports K/M/B, "all", "half")')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('choice')
                .setDescription('Choose heads or tails')
                .setRequired(true)
                .addChoices(
                    { name: '🪙 Heads', value: 'heads' },
                    { name: '🎯 Tails', value: 'tails' }
                )
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName || 'Player';
        const amount = interaction.options.getString('amount');
        const playerChoice = interaction.options.getString('choice');
        const guildId = await getGuildId(interaction);

        try {
            // Check maintenance mode first
            const maintenanceGuard = require('../UTILS/maintenanceGuard');
            const maintenanceCheck = await maintenanceGuard.check(guildId, 'flip');
            if (!maintenanceCheck.allowed) {
                return await interaction.reply({ embeds: [maintenanceCheck.embed], flags: 64 });
            }

            // Validate session before proceeding
            const sessionGuard = require('../UTILS/sessionGuard');
            const check = await sessionGuard.check(userId, guildId, 'flip', interaction.client);
            if (!check.allowed) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Session Error')
                    .setDescription(check.message)
                    .setColor(0xFF0000)
                    .setTimestamp();
                return await interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }

            // Ensure user exists and get balance
            await dbManager.ensureUser(userId, username);
            const userBalance = await dbManager.getUserBalance(userId, guildId);

            // Validate and deduct bet
            const validation = await PayoutManager.validateAndDeductBet(
                interaction,
                amount,
                GameType.FLIP,
                FLIP_CONFIG.MIN_BET,
                FLIP_CONFIG.MAX_BET
            );

            if (!validation.isValid) {
                return await interaction.reply({ embeds: [validation.errorEmbed], flags: 64 });
            }

            const betAmount = validation.parsedAmount;
            
            // 🎮 START GAME USING HYBRID ENGINE SYSTEM - Analytics + Original Mechanics
            const engineGameResult = await GameEngine.startGame('flip', userId, guildId, betAmount, {
                playerChoice: playerChoice
            });
            
            if (!engineGameResult.success) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Game Error')
                    .setDescription(`Cannot start game: ${engineGameResult.error}`)
                    .setColor(0xFF0000);
                return await interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            const { gameId: engineGameId, settings } = engineGameResult;
            
            // 📊 RECORD ENGINE ANALYTICS
            const analyticsEngine = AnalyticsEngine.getInstance();
            await analyticsEngine.recordGameEvent(userId, guildId, 'flip_start', {
                gameId: engineGameId,
                betAmount: betAmount,
                playerChoice: playerChoice,
                playerTier: settings.playerTier || 'Bronze'
            });

            // Create game session
            const sessionResult = await sessionManager.createSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: 'flip',
                betAmount,
                betPreDeducted: true,
                timeout: 30000, // 30 seconds
                metadata: {
                    playerChoice,
                    gamePhase: 'flipping'
                },
                interaction
            });

            if (!sessionResult.success) {
                throw new Error(`Session creation failed: ${sessionResult.error}`);
            }

            const sessionId = sessionResult.sessionId;

            // 🎰 GENERATE ENGINE OUTCOME - Analytics + Original Logic
            const engineOutcome = await GameEngine.generateGameOutcome(engineGameId, {
                gameType: 'flip',
                betAmount: betAmount,
                playerData: {
                    userId: userId,
                    guildId: guildId,
                    tier: settings.playerTier || 'Bronze'
                },
                gameConfig: {
                    playerChoice: playerChoice
                }
            });
            
            // Flip the coin (50/50 chance)
            const coinResult = Math.random() < 0.5 ? 'heads' : 'tails';
            const won = playerChoice === coinResult;
            const payout = won ? betAmount * FLIP_CONFIG.WIN_MULTIPLIER : 0;
            
            // 📊 RECORD ENGINE ANALYTICS
            await analyticsEngine.recordGameEvent(userId, guildId, 'flip_result', {
                gameId: engineGameId,
                coinResult: coinResult,
                playerChoice: playerChoice,
                won: won,
                payout: payout
            });

            // Create game result
            const gameResult = new GameResult({
                userId,
                guildId,
                gameType: GameType.FLIP,
                betAmount,
                payout,
                won,
                specialResult: null
            });

            // Process payout
            const payoutResult = await PayoutManager.processGamePayout(gameResult, interaction);

            if (!payoutResult.success) {
                logger.error(`Failed to process flip payout for user ${userId}`);
                await PayoutManager.refundBet(userId, guildId, betAmount, 'Payout processing failed');
                
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Game Error')
                    .setDescription('An error occurred processing your game. Your bet has been refunded.')
                    .setColor(0xFF0000);
                
                return await interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }

            // Record game result
            try {
                await dbManager.recordGameResult(
                    userId,
                    guildId,
                    'flip',
                    won,
                    betAmount,
                    payout,
                    {
                        playerChoice,
                        coinResult,
                        multiplier: won ? FLIP_CONFIG.WIN_MULTIPLIER : 0
                    }
                );
            } catch (recordError) {
                logger.warn(`Failed to record flip game result: ${recordError.message}`);
            }

            // Add XP for game completion
            try {
                const xpResult = await levelingSystem.handleGameComplete(userId, guildId, 'flip', won, null);
                
                if (xpResult && xpResult.leveledUp) {
                    const levelUpEmbed = levelingSystem.createLevelUpEmbed(interaction.user, xpResult.newLevel);
                    await levelingSystem.processLevelUpRewards(userId, guildId, xpResult.newLevel);
                    
                    try {
                        const levelUpChannel = interaction.client.channels.cache.get('1411018763008217208');
                        if (levelUpChannel) {
                            await levelUpChannel.send({ 
                                content: `<@${userId}>, you are now level ${xpResult.newLevel}!`,
                                embeds: [levelUpEmbed] 
                            });
                        }
                    } catch (levelError) {
                        logger.debug(`Could not send level up message: ${levelError.message}`);
                    }
                }
            } catch (xpError) {
                logger.debug(`Could not award XP for flip: ${xpError.message}`);
            }

            // Get updated balance
            const finalBalance = await dbManager.getUserBalance(userId, guildId);

            // Check for playfor context
            const playForRecipient = global.playForContext?.recipientName;
            const playingForSomeoneElse = playForRecipient && global.playForContext.recipientId;

            // Create result embed
            const topFields = [
                {
                    name: '🪙 Coin Result',
                    value: `${coinResult === 'heads' ? '🪙' : '🎯'} **${coinResult.toUpperCase()}**`,
                    inline: true
                },
                {
                    name: '🎯 Your Choice',
                    value: `${playerChoice === 'heads' ? '🪙' : '🎯'} **${(playerChoice || 'UNKNOWN').toUpperCase()}**`,
                    inline: true
                },
                {
                    name: '🎲 Result',
                    value: won ? '✅ **CORRECT!**' : '❌ **WRONG!**',
                    inline: true
                }
            ];

            // Add playfor indicator if applicable
            if (playingForSomeoneElse) {
                topFields.unshift({
                    name: '🎁 Playing For',
                    value: `@${playForRecipient}`,
                    inline: true
                });
            }
            
            // 🚀 ADD ENGINE ANALYTICS TO EMBED
            if (settings && engineGameId) {
                topFields.push(
                    { name: 'Player Tier', value: settings.playerTier || 'Bronze', inline: true },
                    { name: 'Game ID', value: `#${engineGameId.toString().slice(-6)}`, inline: true }
                );
            }

            const bankFields = [
                { name: '💰 Bet', value: fmt(betAmount), inline: true },
                { name: '💵 Wallet', value: fmt(finalBalance.wallet), inline: true },
                { name: '🏦 Bank', value: fmt(finalBalance.bank), inline: true }
            ];

            if (won) {
                bankFields.splice(1, 0, { name: '💸 Payout', value: fmt(payout), inline: true });
            }

            let stageText, color, resultMessage;
            
            if (won) {
                stageText = 'WINNER!';
                color = 0x00ff00;
                if (playingForSomeoneElse) {
                    resultMessage = `🎉 **YOU WIN!** Won ${fmt(payout - betAmount)} for **@${playForRecipient}**!`;
                } else {
                    resultMessage = `🎉 **YOU WIN!** Won ${fmt(payout - betAmount)}`;
                }
            } else {
                stageText = 'TRY AGAIN';
                color = 0xff0000;
                if (playingForSomeoneElse) {
                    resultMessage = `💸 **YOU LOSE!** @${playForRecipient} gets nothing.`;
                } else {
                    resultMessage = `💸 **YOU LOSE!** Lost ${fmt(betAmount)}.`;
                }
            }

            const embed = buildSessionEmbed({
                title: `🪙 ${interaction.user.displayName}'s Coin Flip`,
                topFields,
                bankFields,
                stageText,
                color,
                footer: won ? 'Lucky guess!' : 'Better luck next time!'
            });

            // 🏁 END GAME WITH ENGINE SYSTEM
            await GameEngine.endGame(engineGameId, {
                outcome: won ? 'WIN' : 'LOSS',
                finalPayout: payout,
                playerData: {
                    userId: userId,
                    guildId: guildId,
                    finalBalance: finalBalance
                },
                gameData: {
                    coinResult: coinResult,
                    playerChoice: playerChoice,
                    multiplier: won ? FLIP_CONFIG.WIN_MULTIPLIER : 0
                }
            });
            
            // 📊 RECORD FINAL ANALYTICS
            await analyticsEngine.recordGameEvent(userId, guildId, 'flip_complete', {
                gameId: engineGameId,
                outcome: won ? 'WIN' : 'LOSS',
                finalPayout: payout,
                netChange: payout - betAmount,
                duration: Date.now() - engineGameResult.startTime
            });
            
            // Complete session
            await sessionManager.endSession(sessionId, {
                outcome: won ? 'WIN' : 'LOSS',
                coinResult,
                playerChoice,
                payout,
                won
            });

            // 🪙 PHASE 1: Dramatic text-based coin flip animation
            await interaction.deferReply();
            
            const tierColors = getTierColors(settings?.playerTier || 'Bronze');
            
            // Create coin flip animation sequence
            const flipAnimation = createCoinFlipAnimation(playerChoice);
            const dramaticPauses = createDramaticPause();
            
            // Base embed template for animation
            const animationTemplate = {
                title: `${LUXURY_ICONS.CROWN} ${interaction.user.displayName}'s Luxury Coin Flip ${LUXURY_ICONS.CROWN}`,
                color: tierColors[0],
                fields: [
                    {
                        name: 'Your Choice',
                        value: `${playerChoice === 'heads' ? '👑' : '⭐'} **${(playerChoice || 'UNKNOWN').toUpperCase()}**`,
                        inline: true
                    },
                    {
                        name: 'Bet Amount',
                        value: formatLuxuryCurrency(betAmount),
                        inline: true
                    }
                ],
                footer: 'The fate of your coins hangs in the balance...'
            };
            
            // Play the dramatic coin flip animation
            const allFrames = [...flipAnimation, ...dramaticPauses];
            await playAnimation(interaction, allFrames, animationTemplate, 180);
            
            // 🪙 PHASE 2: Show luxury result with enhanced styling and win animations
            const winLevel = won && payout >= betAmount * 1.8 ? 'big' : 'normal';
            const enhancedResult = enhanceGameResult('flip', won ? 'CORRECT!' : 'WRONG!', {
                won,
                multiplier: won ? FLIP_CONFIG.WIN_MULTIPLIER : 0
            });
            
            // Create win animation if player won
            let winAnimationFrames = [];
            if (won) {
                const multiplier = FLIP_CONFIG.WIN_MULTIPLIER;
                winAnimationFrames = createWinAnimation(multiplier);
            }
            
            const finalEmbed = createLuxuryEmbed('flip', {
                title: `${LUXURY_ICONS.DIAMOND} ${interaction.user.displayName}'s Luxury Coin Flip ${LUXURY_ICONS.DIAMOND}`,
                color: won ? LUXURY_COLORS.GOLD : LUXURY_COLORS.RUBY,
                winLevel: winLevel,
                fields: [
                    {
                        name: 'Coin Result',
                        value: `${coinResult === 'heads' ? '👑' : '⭐'} **${coinResult.toUpperCase()}**`,
                        inline: true
                    },
                    {
                        name: 'Your Choice',
                        value: `${playerChoice === 'heads' ? '👑' : '⭐'} **${(playerChoice || 'UNKNOWN').toUpperCase()}**`,
                        inline: true
                    },
                    {
                        name: 'Result',
                        value: enhancedResult,
                        inline: true
                    },
                    // Add playfor indicator if applicable
                    ...(playingForSomeoneElse ? [{
                        name: `${LUXURY_ICONS.RING} Playing For`,
                        value: `${LUXURY_ICONS.CROWN} @${playForRecipient} ${LUXURY_ICONS.CROWN}`,
                        inline: true
                    }] : []),
                    // 🚀 ADD ENGINE ANALYTICS TO EMBED
                    ...(settings && engineGameId ? [
                        { name: 'Player Tier', value: settings.playerTier || 'Bronze', inline: true },
                        { name: 'Game ID', value: `#${engineGameId.toString().slice(-6)}`, inline: true }
                    ] : []),
                    // Banking section
                    {
                        name: 'BANKING',
                        value: '\u200B',
                        inline: false
                    },
                    {
                        name: '💰 Bet',
                        value: formatLuxuryCurrency(betAmount),
                        inline: true
                    },
                    ...(won ? [{
                        name: '✨ Payout',
                        value: formatLuxuryCurrency(payout, { showPlus: true }),
                        inline: true
                    }] : []),
                    {
                        name: '💵 Wallet',
                        value: formatLuxuryCurrency(finalBalance.wallet),
                        inline: true
                    },
                    {
                        name: '🏦 Bank',
                        value: formatLuxuryCurrency(finalBalance.bank),
                        inline: true
                    }
                ],
                footer: won ? 'Fortune favors the bold!' : 'The house always remembers...'
            });
            
            await interaction.editReply({ content: resultMessage, embeds: [finalEmbed] });
            
            // 🎉 PHASE 3: Play win animation if player won
            if (won && winAnimationFrames.length > 0) {
                // Wait a moment before win celebration
                await new Promise(resolve => setTimeout(resolve, 800));
                
                // Play win animation
                const winTemplate = {
                    ...animationTemplate,
                    title: `${LUXURY_ICONS.TROPHY} ${interaction.user.displayName} WINS! ${LUXURY_ICONS.TROPHY}`,
                    color: LUXURY_COLORS.GOLD,
                    footer: `Congratulations! You won ${formatLuxuryCurrency(payout - betAmount)}!`
                };
                
                await playAnimation(interaction, winAnimationFrames, winTemplate, 150);
                
                // Return to final result
                await new Promise(resolve => setTimeout(resolve, 500));
                await interaction.editReply({ content: resultMessage, embeds: [finalEmbed] });
            }

            // Log game result
            await sendLogMessage(
                interaction.client,
                'game',
                `Coin flip: ${interaction.user.displayName} ${won ? 'won' : 'lost'} ${fmt(won ? payout - betAmount : betAmount)} (${coinResult})`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error in flip command: ${error.message}`);
            
            try {
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `Flip error for ${interaction.user.tag} (${userId}) — ${error.message}`,
                    userId,
                    guildId
                );
            } catch (_) {}

            // Handle session error and cleanup
            try {
                const userSession = sessionManager.getUserActiveSession(userId);
                if (userSession) {
                    await sessionManager.cancelSession(userSession.sessionId, 'Flip game error', true);
                }
            } catch (sessionError) {
                logger.error(`Failed to handle session error: ${sessionError.message}`);
            }

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Game Error')
                .setDescription('An error occurred while playing coin flip. Your bet has been refunded.')
                .setColor(0xFF0000);

            try {
                await interaction.reply({ embeds: [errorEmbed], flags: 64 });
            } catch (replyError) {
                logger.error(`Failed to send flip error reply: ${replyError.message}`);
            }
        }
    }
};