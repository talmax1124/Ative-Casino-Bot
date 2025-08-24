/**
 * Animated Plinko command - Full animation without button timeouts!
 * All parameters in the command - no button interactions needed
 */

const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmtFull, getGuildId, sendLogMessage, parseAmount } = require('../UTILS/common');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const { PLINKO_MODES, randomizeMultipliers, createPlinkoImage, simulatePlinkoDrop } = require('../UTILS/plinkoCanvas');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { sessionManager, GameType: SMGameType } = require('../UTILS/sessionManager');
const logger = require('../UTILS/logger');

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
                .setDescription('Difficulty mode')
                .setRequired(false)
                .addChoices(
                    { name: '🟢 Easy', value: 'Easy' },
                    { name: '🟡 Medium', value: 'Medium' },
                    { name: '🔴 Hard', value: 'Hard' },
                    { name: '💀 Nightmare', value: 'Nightmare' }
                )
        )
        .addIntegerOption(option =>
            option.setName('slot')
                .setDescription('Drop slot (1-based, random if not specified)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(25)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const username = interaction.user.displayName;
        const betAmountStr = interaction.options.getString('amount');
        const selectedMode = interaction.options.getString('mode') || 'Medium';
        const selectedSlot = interaction.options.getInteger('slot');

        try {
            // Immediately defer to prevent timeout
            await interaction.deferReply();

            // Ensure user exists and get balance
            await dbManager.ensureUser(userId, username);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Check if user can create a new session
            const canCreate = await sessionManager.canCreateSession(userId);
            if (!canCreate.allowed) {
                const embed = buildSessionEmbed({
                    title: `❌ ${username}'s Plinko`,
                    topFields: [
                        { name: 'Session Limit Reached', value: canCreate.reason + '\nUse `/stopgame` to cancel active sessions.' }
                    ],
                    color: 0xFF0000,
                    footer: 'Plinko Game • Session Manager'
                });

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            // Check legacy game_active field as fallback
            if (balance.game_active) {
                const embed = buildSessionEmbed({
                    title: `❌ ${username}'s Plinko`,
                    topFields: [
                        { name: 'Legacy Game Active', value: 'You have an active game session.\nFinish it before starting Plinko or use `/stopgame`.' }
                    ],
                    color: 0xFF0000,
                    footer: 'Plinko Game'
                });

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            // Parse and validate bet amount
            const betAmount = parseAmount(betAmountStr, balance.wallet);

            if (betAmount <= 0) {
                const embed = buildSessionEmbed({
                    title: `❌ ${username}'s Plinko`,
                    topFields: [
                        { name: 'Invalid Bet', value: 'Bet amount must be greater than 0!' }
                    ],
                    color: 0xFF0000,
                    footer: 'Plinko Game'
                });

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            if (betAmount > balance.wallet) {
                const embed = buildSessionEmbed({
                    title: `❌ ${username}'s Plinko`,
                    topFields: [
                        { name: 'Insufficient Funds', value: `You need ${fmtFull(betAmount)} but only have ${fmtFull(balance.wallet)}!` }
                    ],
                    bankFields: [
                        { name: 'Wallet', value: fmtFull(balance.wallet), inline: true },
                        { name: 'Bank', value: fmtFull(balance.bank), inline: true }
                    ],
                    color: 0xFF0000,
                    footer: 'Plinko Game'
                });

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            // Get mode data
            const modeData = PLINKO_MODES[selectedMode];
            if (!modeData) {
                await interaction.editReply({ content: 'Invalid mode selected!' });
                return;
            }

            // Setup game parameters first
            const multipliers = randomizeMultipliers(modeData.multipliers);
            const slots = multipliers.length;
            
            // Determine drop slot
            let dropSlot;
            if (selectedSlot) {
                dropSlot = Math.min(selectedSlot - 1, slots - 1); // Convert to 0-based
            } else {
                dropSlot = Math.floor(Math.random() * slots);
            }

            // Create game session
            const sessionResult = await sessionManager.createSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: SMGameType.PLINKO,
                betAmount,
                timeout: 300000, // 5 minutes for plinko animation
                metadata: {
                    mode: selectedMode,
                    dropSlot,
                    slots,
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

            // Deduct bet amount (but keep legacy game_active for compatibility)
            await dbManager.updateUserBalance(userId, guildId, -betAmount, 0, { game_active: true });

            // Show initial game setup
            const setupEmbed = buildSessionEmbed({
                title: `🎯 ${username}'s ${selectedMode} Plinko`,
                topFields: [
                    { name: '🎮 Game Starting!', value: `Preparing your plinko board...\n\n**Mode:** ${modeData.emoji} ${selectedMode}\n**Drop Slot:** #${dropSlot + 1}\n**Bet:** ${fmtFull(betAmount)}` }
                ],
                stageText: 'PREPARING BOARD',
                color: parseInt(modeData.color.replace('#', ''), 16),
                footer: 'Plinko • Get ready!'
            });

            await interaction.editReply({ embeds: [setupEmbed] });
            
            // Brief pause for setup
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Update session with game start
            await sessionManager.updateSession(sessionId, {
                gameData: {
                    gameStarted: true,
                    multipliers,
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
                multipliers,
                slots,
                dropSlot,
                newWallet: balance.wallet - betAmount,
                bankBalance: balance.bank,
                sessionId
            }, guildId);

        } catch (error) {
            logger.error(`Error in plinko command: ${error.message}`);
            
            // Try to cancel session and refund on error
            try {
                const userSessions = sessionManager.getUserSessions(userId);
                for (const session of userSessions) {
                    if (session.gameType === SMGameType.PLINKO) {
                        await sessionManager.cancelSession(
                            session.sessionId, 
                            'Game error - refund processed',
                            'system'
                        );
                    }
                }
                
                // Also update legacy balance
                await dbManager.updateUserBalance(userId, guildId, betAmount || 0, 0, { game_active: false });
            } catch (refundError) {
                logger.error(`Failed to refund plinko bet: ${refundError.message}`);
            }

            const errorEmbed = buildSessionEmbed({
                title: `❌ ${username}'s Plinko`,
                topFields: [
                    { name: 'System Error', value: 'Something went wrong during the game.\nYour bet has been refunded.' }
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
    
    try {
        // Map slot to simulation coordinates
        const startPos = dropSlot - ((slots - 1) / 2);

        // Run simulation to get ball path
        const { slotIndex: finalSlot, path: ballPath } = simulatePlinkoDrop(
            modeData.rows,
            slots,
            startPos
        );

        const finalMultiplier = multipliers[finalSlot];
        const winnings = Math.floor(betAmount * finalMultiplier);
        const won = winnings >= betAmount;

        // Create animation frames
        const animationFrames = [];
        
        // Initial frame
        animationFrames.push(createPlinkoImage(
            modeData.rows,
            slots,
            multipliers,
            null,
            -1,
            mode
        ));

        // Animation frames showing ball dropping
        for (let i = 0; i <= Math.min(ballPath.length, modeData.rows + 1); i++) {
            animationFrames.push(createPlinkoImage(
                modeData.rows,
                slots,
                multipliers,
                ballPath,
                i,
                mode
            ));
        }

        // Final frame with winning slot highlighted
        animationFrames.push(createPlinkoImage(
            modeData.rows,
            slots,
            multipliers,
            ballPath,
            modeData.rows + 1,
            mode,
            finalSlot
        ));

        // Show ball drop starting
        let embed = buildSessionEmbed({
            title: `🎯 ${username}'s ${mode} Plinko`,
            topFields: [
                { name: 'Ball Released!', value: `🔴 Ball dropped from slot #${dropSlot + 1}!\nWatch it bounce through the pegs...` }
            ],
            stageText: 'BALL DROPPING',
            color: parseInt(modeData.color.replace('#', ''), 16),
            footer: 'Plinko • Ball in motion!'
        });

        const attachment = new AttachmentBuilder(animationFrames[0], { name: 'plinko_initial.png' });
        embed.image = 'attachment://plinko_initial.png';

        await interaction.editReply({ embeds: [embed], files: [attachment] });

        // Animate through frames with delays
        for (let i = 1; i < animationFrames.length - 1; i++) {
            await new Promise(resolve => setTimeout(resolve, 500)); // Shorter delay for smoother animation

            const frameEmbed = buildSessionEmbed({
                title: `🎯 ${username}'s ${mode} Plinko`,
                topFields: [
                    { name: 'Ball Bouncing', value: `⚡ Ball bouncing through pegs...\nRow ${Math.min(i, modeData.rows)}/${modeData.rows}` }
                ],
                stageText: 'BALL BOUNCING',
                color: parseInt(modeData.color.replace('#', ''), 16),
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
    
    // Update user balance and clear game active status
    const finalWallet = newWallet + winnings;
    await dbManager.updateUserBalance(userId, guildId, winnings, 0, { game_active: false });

    // Complete the session
    try {
        await sessionManager.completeSession(sessionId, {
            finalSlot,
            finalMultiplier,
            winnings,
            won,
            netChange: winnings - betAmount,
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
            housedEdge: modeData.house_edge
        }
    });

    await PayoutManager.processGamePayout(gameResult);

    // Determine result type
    let resultTitle, resultEmoji, resultColor;
    if (winnings >= betAmount * 20) {
        resultTitle = '💰 MASSIVE WIN! 💰';
        resultEmoji = '🌟';
        resultColor = 0xFFD700;
    } else if (winnings >= betAmount * 5) {
        resultTitle = '🎉 BIG WIN!';
        resultEmoji = '🎊';
        resultColor = 0x00FF00;
    } else if (winnings > betAmount) {
        resultTitle = '✅ WIN!';
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

    const netChange = winnings - betAmount;
    const netText = netChange >= 0 ? `+${fmtFull(netChange)}` : fmtFull(netChange);

    const embed = buildSessionEmbed({
        title: `${resultEmoji} ${username}'s Plinko Result`,
        topFields: [
            { name: 'Result', value: `**${resultTitle}**` },
            { name: 'Mode', value: `${modeData.emoji} ${mode}`, inline: true },
            { name: 'Landing Slot', value: `**#${finalSlot + 1}** of ${gameData.slots}`, inline: true },
            { name: 'Multiplier', value: `**${finalMultiplier.toFixed(2)}x**`, inline: true }
        ],
        bankFields: [
            { name: 'Bet Amount', value: fmtFull(betAmount), inline: true },
            { name: 'Winnings', value: fmtFull(winnings), inline: true },
            { name: 'Net Change', value: netText, inline: true },
            { name: 'New Wallet', value: fmtFull(finalWallet), inline: true }
        ],
        stageText: won ? 'WINNER!' : 'BETTER LUCK NEXT TIME',
        color: resultColor,
        footer: `🏠 House Edge: ${(modeData.house_edge * 100).toFixed(0)}% | Full Animation Complete!`,
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