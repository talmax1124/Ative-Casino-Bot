/**
 * Animated Plinko command - Full animation without button timeouts!
 * All parameters in the command - no button interactions needed
 */

const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmtFull, getGuildId, sendLogMessage, parseAmount, resolveAmount } = require('../UTILS/common');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const { PLINKO_MODES, getCurrentPlinkoModes, randomizeMultipliers, createPlinkoImage, simulatePlinkoDrop } = require('../UTILS/plinkoCanvas');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const SMGameType = { PLINKO: 'plinko' };
const sessionManager = require('../UTILS/sessionManager');
const logger = require('../UTILS/logger');
const transparentPayoutManager = require('../UTILS/transparentPayoutManager');
const uasDataExporter = require('../UTILS/uasDataExporter');
const { secureRandomFloat, secureRandomInt, secureRandomBytes } = require('../UTILS/rng');

// UNIVERSAL GAME INTEGRATION - ALL SYSTEMS
const UniversalGameIntegrator = require('../UTILS/UniversalGameIntegrator');
const gameIntegrator = new UniversalGameIntegrator('plinko');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('plinko')
        .setDescription('🎯 Play Plinko - Full animation experience!')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Bet amount (use K/M/B suffixes, A for all, H for half)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Difficulty mode (higher modes have higher minimum bets)')
                .setRequired(false)
                .addChoices(
                    { name: '🟢 Easy (Min: $500)', value: 'Easy' },
                    { name: '🟡 Medium (Min: $1K)', value: 'Medium' },
                    { name: '🔴 Hard (Min: $2.5K)', value: 'Hard' },
                    { name: '💀 Nightmare (Min: $5K, Max: 3.0x)', value: 'Nightmare' }
                )
        ), // Removed slot option - drop position is always random

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const username = interaction.user.displayName;
        const betAmountStr = interaction.options.getString('amount');
        const selectedMode = interaction.options.getString('mode') || 'Medium';
        // Slot is always random now

        try {
            logger.debug(`Plinko execute called by ${username} (${userId}) in guild ${guildId} amount='${betAmountStr}', mode='${selectedMode}'`);
            // Immediately defer to prevent timeout
            await interaction.deferReply();

            // Ensure user exists and get balance
            await dbManager.ensureUser(userId, username);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Check if user can create a new session
            // Session validation now handled by GameSessionIntegrator above
            // Remove this legacy check
            /*const canCreate = await sessionManager.canCreateSession(userId);
            if (!canCreate.allowed) {
                const embed = buildSessionEmbed({
                    title: \`❌ \${username}'s Plinko\`,
                    topFields: [
                        { name: 'Session Limit Reached', value: canCreate.reason + '\\nUse \`/stopgame\` to cancel active sessions.' }
                    ],
                    color: 0xFF0000,
                    footer: 'Plinko Game • Session Manager'
                });

                await interaction.editReply({ embeds: [embed] });
                return;
            }*/

            // Check maintenance mode first
            const maintenanceGuard = require('../UTILS/maintenanceGuard');
            const maintenanceCheck = await maintenanceGuard.check(guildId, 'plinko');
            if (!maintenanceCheck.allowed) {
                return await interaction.editReply({ embeds: [maintenanceCheck.embed] });
            }

            // Validate session using new system (correct order/flag)
            const sessionGuard = require('../UTILS/sessionGuard');
            const check = await sessionGuard.check(userId, guildId, SMGameType.PLINKO, interaction.client);
            if (!check.allowed) {
                const errorEmbed = buildSessionEmbed({
                    title: `❌ ${username}'s Plinko`,
                    topFields: [ { name: 'Session Error', value: check.message } ],
                    color: 0xFF0000,
                    footer: 'Plinko Game • Session Manager'
                });
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Get mode-specific minimum bet from plinko modes
            const { getCurrentPlinkoModes } = require('../UTILS/plinkoCanvas');
            const allModes = await getCurrentPlinkoModes(guildId);
            const modeData = allModes[selectedMode];
            const modeMinBet = modeData ? modeData.minBet : 100; // Fallback to 100 if mode not found
            
            // Use PayoutManager to validate and deduct bet IMMEDIATELY with mode-specific minimum
            const validationResult = await PayoutManager.validateAndDeductBet(
                interaction,
                betAmountStr,
                GameType.PLINKO,
                modeMinBet, // Mode-specific minimum bet
                null     // No max bet - advanced risk engine handles limits
            );

            if (!validationResult.isValid) {
                await interaction.editReply({ embeds: [validationResult.errorEmbed] });
                return;
            }

            const betAmount = validationResult.parsedAmount;

        // ENHANCED SESSION SECURITY CHECK
        const sessionCheck = await gameIntegrator.checkGameSession(userId, guildId, 'plinko', betAmount);
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

            const newWalletAfterBet = validationResult.newWallet;
            
            // Use FIXED multipliers from plinko.js - NO DYNAMIC ADJUSTMENTS
            const { startPlinkoGame } = require('../GAMES/plinko');
            // RNG functions available from top-level import
            const normalizedMode = selectedMode.toLowerCase(); // Convert to lowercase
            const gameSession = startPlinkoGame(userId, username, betAmount, interaction.channelId, normalizedMode);
            
            // Get base multipliers and randomize their positions 
            // Check if mode exists first
            if (!gameSession.modes || !gameSession.modes[normalizedMode]) {
                logger.error(`Invalid mode '${normalizedMode}' - modes available:`, Object.keys(gameSession.modes || {}));
                throw new Error(`Invalid game mode: ${normalizedMode}`);
            }
            const baseMultipliers = gameSession.modes[normalizedMode].multipliers;
            
            // Use the same multipliers for both display and calculations (fix the disconnect)
            const shuffledMultipliers = [...baseMultipliers].sort(() => secureRandomFloat() - 0.5);
            const slots = shuffledMultipliers.length;
            
            // Drop slot is always random
            const dropSlot = secureRandomInt(0, slots);

            // Create game session using new system
            const sessionResult = await sessionManager.createSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: SMGameType.PLINKO,
                betAmount,
                betPreDeducted: true,
                timeout: 300000, // 5 minutes for plinko animation
                metadata: {
                    mode: selectedMode,
                    dropSlot,
                    slots,
                    multipliers: shuffledMultipliers,
                    interaction: {
                        id: interaction.id,
                        user: interaction.user.tag
                    }
                }
            });

            if (!sessionResult.success) {
                throw new Error(`Session creation failed: ${sessionResult.error}`);
            }

            const sessionId = sessionResult.sessionId;

            // Get updated balance after bet deduction
            const updatedBalance = await dbManager.getUserBalance(userId, guildId);

            // Get mode colors
            const modeColors = {
                easy: 0x00FF00,    // Green
                medium: 0xFFFF00,  // Yellow  
                hard: 0xFF0000,    // Red
                nightmare: 0x800080 // Purple
            };

            // Show initial game setup with help info
            const topFields = [
                { name: '🎮 Game Starting!', value: `Preparing your plinko board...\n\n**Mode:** ${modeData.name}\n**Drop Slot:** Random\n**Bet:** ${fmtFull(betAmount)}` },
                { name: '❓ How to Play', value: '• Ball drops from a random starting position\n• Bounces randomly down the pegs\n• Lands in a multiplier slot at bottom\n• Win = Bet × Multiplier', inline: false }
            ];
            
            // Check if this is a playfor game
            const playForRecipient = global.playForContext?.recipientName;
            const playingForSomeoneElse = playForRecipient && global.playForContext.recipientId;
            
            if (playingForSomeoneElse) {
                topFields.splice(1, 0, {
                    name: '🎁 Playing For',
                    value: `@${playForRecipient}`,
                    inline: true
                });
            }
            
            const setupEmbed = buildSessionEmbed({
                title: `🎯 ${username}'s ${selectedMode} Plinko`,
                topFields,
                bankFields: [
                    { name: 'Difficulty Modes', value: '🟢 Easy: Safe multipliers\n🟡 Medium: Balanced risk\n🔴 Hard: High risk/reward\n💀 Nightmare: Extreme variance', inline: true }
                ],
                stageText: 'PREPARING BOARD',
                color: modeColors[normalizedMode] || 0x00FF00,
                footer: 'Plinko • Get ready!'
            });

            await interaction.editReply({ embeds: [setupEmbed] });
            
            // Brief pause for setup
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Update session with game start
            await sessionManager.updateSession(sessionId, {
                gameData: {
                    gameStarted: true,
                    multipliers: shuffledMultipliers,
                    startTime: Date.now()
                },
                action: 'game_start'
            });

            // Run the full animated plinko game
            await playAnimatedPlinko(interaction, {
                userId,
                username,
                betAmount,
                mode: selectedMode,
                modeData,
                multipliers: shuffledMultipliers,  // Use same multipliers for both UI and calculations
                slots,
                dropSlot,
                newWallet: updatedBalance.wallet,
                bankBalance: updatedBalance.bank,
                sessionId
            }, guildId);

        } catch (error) {
            logger.error(`Error in plinko command: ${error.message}`);
            try {
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `Plinko error for ${interaction.user.tag} (${userId}) — ${error.message}`,
                    userId,
                    guildId
                );
            } catch (_) {}
            
            // Try to cancel session and refund on error
            try {
                const userSession = sessionManager.getUserActiveSession(userId);
                if (userSession) {
                    await sessionManager.cancelSession(userSession.sessionId, 'Plinko game error', true);
                }
            } catch (refundError) {
                logger.error(`Failed to handle plinko session error: ${refundError.message}`);
            }

            const errorEmbed = buildSessionEmbed({
                title: `❌ ${username}'s Plinko`,
                topFields: [
                    { name: 'System Error', value: 'Something went wrong during the game.\nNo money was deducted.' }
                ],
                color: 0xFF0000,
                footer: 'Plinko Game'
            });

            try {
                await interaction.editReply({ embeds: [errorEmbed] });
            } catch (replyError) {
                logger.error(`Failed to send error reply: ${replyError.message}`);
            }
        }
    }
};

/**
 * Play the full animated plinko game
 */
async function playAnimatedPlinko(interaction, gameData, guildId) {
    const { userId, username, betAmount, mode, modeData, multipliers, slots, dropSlot } = gameData;
    
    // Get mode colors
    const modeColors = {
        Easy: 0x00FF00,      // Green
        Medium: 0xFFFF00,    // Yellow  
        Hard: 0xFF0000,      // Red
        Nightmare: 0x800080  // Purple
    };
    
    const rows = 10; // Fixed number of rows
    
    try {
        // Map slot to simulation coordinates
        const startPos = dropSlot - ((slots - 1) / 2);

        // Run simulation to get ball path
        const { slotIndex: finalSlot, path: ballPath } = simulatePlinkoDrop(
            rows,
            slots,
            startPos
        );

        // Use unified multipliers for both UI and payout 
        const finalMultiplier = multipliers[finalSlot];
        
        // Calculate winnings using the same multiplier shown in UI
        const winnings = Math.round((betAmount * finalMultiplier) * 100) / 100;
        const won = winnings > betAmount; // Win if they get more than their bet back

        // Create animation frames using the same multipliers shown to player
        const animationFrames = [];
        
        // Initial frame
        animationFrames.push(createPlinkoImage(
            rows,
            slots,
            multipliers,
            null,
            -1,
            mode
        ));

        // Animation frames showing ball dropping
        for (let i = 0; i <= Math.min(ballPath.length, rows + 1); i++) {
            animationFrames.push(createPlinkoImage(
                rows,
                slots,
                multipliers,
                ballPath,
                i,
                mode
            ));
        }

        // Final frame with winning slot highlighted
        animationFrames.push(createPlinkoImage(
            rows,
            slots,
            multipliers,
            ballPath,
            rows + 1,
            mode,
            finalSlot
        ));

        // Show ball drop starting
        const topFields = [
            { name: 'Ball Released!', value: `🔴 Ball dropped from random position!\nWatch it bounce through the pegs...` }
        ];
        
        // Check if this is a playfor game
        const playForRecipient = global.playForContext?.recipientName;
        const playingForSomeoneElse = playForRecipient && global.playForContext.recipientId;
        
        if (playingForSomeoneElse) {
            topFields.splice(0, 0, {
                name: '🎁 Playing For',
                value: `@${playForRecipient}`,
                inline: true
            });
        }
        
        let embed = buildSessionEmbed({
            title: `🎯 ${username}'s ${mode} Plinko`,
            topFields,
            stageText: 'BALL DROPPING',
            color: modeColors[mode] || 0x00FF00,
            footer: 'Plinko • Ball in motion!'
        });

        const attachment = new AttachmentBuilder(animationFrames[0], { name: 'plinko_initial.png' });
        embed.image = 'attachment://plinko_initial.png';

        await interaction.editReply({ embeds: [embed], files: [attachment] });

        // Animate through frames with delays
        for (let i = 1; i < animationFrames.length - 1; i++) {
            await new Promise(resolve => setTimeout(resolve, 500)); // Shorter delay for smoother animation

            const frameTopFields = [
                { name: 'Ball Bouncing', value: `⚡ Ball bouncing through pegs...\nRow ${Math.min(i, rows)}/${rows}` }
            ];
            
            if (playingForSomeoneElse) {
                frameTopFields.splice(0, 0, {
                    name: '🎁 Playing For',
                    value: `@${playForRecipient}`,
                    inline: true
                });
            }

            const frameEmbed = buildSessionEmbed({
                title: `🎯 ${username}'s ${mode} Plinko`,
                topFields: frameTopFields,
                stageText: 'BALL BOUNCING',
                color: modeColors[mode] || 0x00FF00,
                footer: 'Plinko • Almost there!',
                image: `attachment://plinko_frame_${i}.png`
            });

            const frameAttachment = new AttachmentBuilder(animationFrames[i], { name: `plinko_frame_${i}.png` });

            await interaction.editReply({ embeds: [frameEmbed], files: [frameAttachment] });
        }

        // Final pause before results
        await new Promise(resolve => setTimeout(resolve, 800));

        // Show final results
        await showFinalResults(interaction, gameData, animationFrames[animationFrames.length - 1], finalSlot, finalMultiplier, winnings, won, guildId);

    } catch (error) {
        logger.error(`Error in animated plinko game: ${error.message}`);
        throw error;
    }
}

/**
 * Show final game results
 */
async function showFinalResults(interaction, gameData, finalImage, finalSlot, finalMultiplier, winnings, won, guildId) {
    const { userId, username, betAmount, mode, modeData, newWallet, sessionId } = gameData;
    
    // Calculate net change (winnings - bet since bet was already deducted)
    const netChange = winnings - betAmount;
    
    // Winnings will be processed by PayoutManager
    const finalWallet = newWallet + winnings;

    // Complete the session
    try {
        await sessionManager.endSession(sessionId, {
            finalSlot,
            finalMultiplier,
            winnings,
            won,
            netChange,
            completedAt: Date.now()
        });
    } catch (sessionError) {
        logger.error(`Failed to complete plinko session: ${sessionError.message}`);
    }

    // Record game result
    const gameResult = new GameResult({
        userId,
        guildId,
        gameType: GameType.PLINKO,
        betAmount,
        payout: winnings,
        won,
        metadata: {
            mode,
            dropSlot: finalSlot,
            finalMultiplier,
            housedEdge: 0.25 // 15% house edge
        }
    });

    await PayoutManager.processGamePayout(gameResult);

    // Export to UAS for centralized analysis
    try {
        await uasDataExporter.exportGameResult({
            userId,
            guildId,
            gameType: 'plinko',
            betAmount,
            winnings,
            won,
            metadata: {
                mode,
                finalSlot,
                finalMultiplier,
                dropSlot: finalSlot,
                houseEdge: 0.15,
                gameTimestamp: Date.now()
            }
        });
    } catch (exportError) {
        logger.debug(`Failed to export plinko result to UAS: ${exportError.message}`);
    }

    // Record game result for AI learning
    try {
        await dbManager.recordGameResult(
            userId,
            guildId,
            'plinko',
            won,
            betAmount,
            winnings,
            {
                mode: mode,
                slot: finalSlot,
                multiplier: finalMultiplier,
                houseEdge: 0.15,
                gameType: 'plinko'
            }
        );
    } catch (aiError) {
        logger.error(`Failed to record plinko game result for AI: ${aiError.message}`);
    }

    // Award XP for playing Plinko
    try {
        const levelingSystem = require('../UTILS/levelingSystem');
        const specialResult = winnings >= betAmount * 5 ? 'big_win' : 
                            winnings >= betAmount * 20 ? 'massive_win' : null;
        
        const levelResult = await levelingSystem.handleGameComplete(userId, guildId, 'plinko', won, specialResult);
        
        // Handle level up if occurred
        if (levelResult && levelResult.levelUp) {
            const levelUpEmbed = levelingSystem.createLevelUpEmbed(interaction.user, levelResult.newLevel);
            
            // Award level-up rewards
            await levelingSystem.processLevelUpRewards(userId, guildId, levelResult.newLevel);
            
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
        logger.debug(`Could not award XP for plinko: ${xpError.message}`);
    }

    // Check if this is a playfor game
    const playForRecipient = global.playForContext?.recipientName;
    const winningForSomeoneElse = playForRecipient && global.playForContext.recipientId;

    // Determine result type
    let resultTitle, resultEmoji, resultColor;
    if (winnings >= betAmount * 20) {
        resultTitle = winningForSomeoneElse ? `💰 MASSIVE WIN for @${playForRecipient}! 💰` : '💰 MASSIVE WIN! 💰';
        resultEmoji = '🌟';
        resultColor = 0xFFD700;
    } else if (winnings >= betAmount * 5) {
        resultTitle = winningForSomeoneElse ? `🎉 BIG WIN for @${playForRecipient}!` : '🎉 BIG WIN!';
        resultEmoji = '🎊';
        resultColor = 0x00FF00;
    } else if (winnings > betAmount) {
        resultTitle = winningForSomeoneElse ? `✅ WIN for @${playForRecipient}!` : '✅ WIN!';
        resultEmoji = '🎯';
        resultColor = 0x32CD32;
    } else if (winnings === betAmount) {
        resultTitle = '🤝 BREAK EVEN';
        resultEmoji = '⚖️';
        resultColor = 0xFFD700;
    } else {
        resultTitle = '💥 LOSS';
        resultEmoji = '😢';
        resultColor = 0xFF0000;
    }

    const netText = netChange >= 0 ? `+${fmtFull(netChange)}` : fmtFull(netChange);

    const topFields = [
        { name: 'Result', value: `**${resultTitle}**` },
        { name: 'Mode', value: `${modeData.emoji} ${mode}`, inline: true },
        { name: 'Landing Slot', value: `**#${finalSlot + 1}** of ${gameData.slots}`, inline: true },
        { name: 'Multiplier', value: `**${finalMultiplier.toFixed(2)}x**`, inline: true }
    ];
    
    // Add playfor context if applicable
    if (winningForSomeoneElse) {
        topFields.splice(1, 0, {
            name: '🎁 Playing For',
            value: `@${playForRecipient}`,
            inline: true
        });
    }
    
    let stageText = won ? 'WINNER!' : 'BETTER LUCK NEXT TIME';
    if (winningForSomeoneElse && won) {
        stageText = `WON FOR @${playForRecipient}!`;
    }
    
    let footer = `🏠 House Edge: 15% | Full Animation Complete!`;
    if (winningForSomeoneElse && won) {
        footer = `Winnings sent to @${playForRecipient}! | Full Animation Complete!`;
    }

    const embed = buildSessionEmbed({
        title: `${resultEmoji} ${username}'s Plinko Result`,
        topFields,
        bankFields: [
            { name: 'Bet Amount', value: fmtFull(betAmount), inline: true },
            { name: 'Winnings', value: fmtFull(winnings), inline: true },
            { name: 'Net Change', value: netText, inline: true },
            { name: 'New Wallet', value: fmtFull(finalWallet), inline: true }
        ],
        stageText,
        color: resultColor,
        footer,
        image: 'attachment://plinko_final.png'
    });

    const attachment = new AttachmentBuilder(finalImage, { name: 'plinko_final.png' });

    await interaction.editReply({ embeds: [embed], files: [attachment] });

    // Log the result
    await sendLogMessage(
        interaction.client,
        won ? 'info' : 'warn',
        `**Plinko Game Result**\n` +
        `**User:** ${username} (\`${userId}\`)\n` +
        `**Mode:** ${mode}\n` +
        `**Bet:** ${fmtFull(betAmount)}\n` +
        `**Slot:** #${finalSlot + 1} (${finalMultiplier.toFixed(2)}x)\n` +
        `**Winnings:** ${fmtFull(winnings)}\n` +
        `**Net:** ${netText}`,
        userId,
        guildId
    );
}
