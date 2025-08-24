/**
 * Plinko command handler for ATIVE Casino Bot
 * Enhanced with Canvas image generation and realistic physics
 * Based on Python reference implementation
 */

const { SlashCommandBuilder, MessageFlags, ButtonBuilder, ActionRowBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmtFull, getGuildId, sendLogMessage, parseAmount } = require('../UTILS/common');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const { PLINKO_MODES, randomizeMultipliers, createPlinkoImage, simulatePlinkoDrop } = require('../UTILS/plinkoCanvas');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { safeReply, safeDefer, safeUpdate, getInteractionState, createErrorEmbed } = require('../UTILS/interactionUtils');
const logger = require('../UTILS/logger');

// Active games registry
const activePlinkoGames = new Map();

const plinkoCommand = {
    data: new SlashCommandBuilder()
        .setName('plinko')
        .setDescription('🎯 Play Plinko - Drop a ball through pegs for multipliers!')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Bet amount (use K/M/B suffixes, A for all, H for half)')
                .setRequired(true)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const channelId = interaction.channelId;
        const guildId = await getGuildId(interaction);
        const username = interaction.user.displayName;

        // Immediately defer to prevent timeout
        const deferred = await safeDefer(interaction);
        if (!deferred) {
            logger.warn(`Failed to defer plinko interaction for user ${userId}`);
            return;
        }

        try {
            // Check if there's already an active Plinko game for this user
            if (activePlinkoGames.has(userId)) {
                const embed = buildSessionEmbed({
                    title: `❌ ${username}'s Plinko`,
                    topFields: [
                        { name: 'Game Already Active', value: 'You already have an active Plinko game!\nFinish your current game first.' }
                    ],
                    color: 0xFF0000,
                    footer: 'Plinko Game'
                });

                await safeReply(interaction, { embeds: [embed] });
                return;
            }

            // Ensure user exists and get balance
            await dbManager.ensureUser(userId, username);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Check if user has an active game
            if (balance.game_active) {
                const embed = buildSessionEmbed({
                    title: `❌ ${username}'s Plinko`,
                    topFields: [
                        { name: 'Game Already Active', value: 'You have an active game session.\nFinish it before starting Plinko.' }
                    ],
                    color: 0xFF0000,
                    footer: 'Plinko Game'
                });

                await safeReply(interaction, { embeds: [embed] });
                return;
            }

            // Parse and validate bet amount
            const betAmount = parseAmount(interaction.options.getString('amount'), balance.wallet);

            if (betAmount <= 0) {
                const embed = buildSessionEmbed({
                    title: `❌ ${username}'s Plinko`,
                    topFields: [
                        { name: 'Invalid Bet', value: 'Bet amount must be greater than 0!' }
                    ],
                    color: 0xFF0000,
                    footer: 'Plinko Game'
                });

                await safeReply(interaction, { embeds: [embed] });
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

                await safeReply(interaction, { embeds: [embed] });
                return;
            }

            // Deduct bet and set game active
            await dbManager.updateUserBalance(userId, guildId, -betAmount, 0, { game_active: true });

            // Create mode selection view
            await showModeSelection(interaction, userId, username, betAmount, balance.wallet - betAmount, balance.bank);

        } catch (error) {
            logger.error(`Error in plinko command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: `❌ ${username}'s Plinko`,
                topFields: [
                    { name: 'System Error', value: 'Something went wrong while starting the game.\nPlease try again.' }
                ],
                color: 0xFF0000,
                footer: 'Plinko Game'
            });

            await safeReply(interaction, { embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};

/**
 * Show mode selection interface
 */
async function showModeSelection(interaction, userId, username, betAmount, newWallet, bankBalance) {
    // Create mode selection buttons
    const buttons = new ActionRowBuilder();
    
    Object.entries(PLINKO_MODES).forEach(([modeName, modeData]) => {
        let style;
        if (modeName === 'Easy') style = ButtonStyle.Success;
        else if (modeName === 'Medium') style = ButtonStyle.Primary;
        else if (modeName === 'Hard') style = ButtonStyle.Danger;
        else style = ButtonStyle.Secondary;

        buttons.addComponents(
            new ButtonBuilder()
                .setCustomId(`plinko_mode_${modeName.toLowerCase()}`)
                .setLabel(modeName)
                .setEmoji(modeData.emoji)
                .setStyle(style)
        );
    });

    // Create mode selection embed
    const topFields = [
        { name: 'Choose Your Risk Level', value: 'Select a difficulty mode to start playing!\n⚠️ **Warning: All modes favor the house!**' }
    ];

    // Add mode descriptions
    Object.entries(PLINKO_MODES).forEach(([modeName, modeData]) => {
        const houseEdge = (modeData.house_edge * 100).toFixed(0);
        const minMult = Math.min(...modeData.multipliers).toFixed(1);
        const maxMult = Math.max(...modeData.multipliers).toFixed(1);

        topFields.push({
            name: `${modeData.emoji} ${modeName} Mode`,
            value: `${modeData.description}\n🎰 Range: **${minMult}x - ${maxMult}x**\n🏠 House Edge: **${houseEdge}%**\n⚡ Rows: ${modeData.rows}`,
            inline: true
        });
    });

    const embed = buildSessionEmbed({
        title: `🎯 ${username}'s Plinko - Mode Selection`,
        topFields,
        bankFields: [
            { name: 'Bet Amount', value: fmtFull(betAmount), inline: true },
            { name: 'Remaining Wallet', value: fmtFull(newWallet), inline: true },
            { name: 'Bank Balance', value: fmtFull(bankBalance), inline: true }
        ],
        stageText: 'SELECT MODE',
        color: 0xFFD700,
        footer: '🚨 Gambling is risky! Only bet what you can afford to lose.'
    });

    await safeReply(interaction, { embeds: [embed], components: [buttons] });

    // Store game session
    activePlinkoGames.set(userId, {
        username,
        betAmount,
        newWallet,
        bankBalance,
        stage: 'mode_selection'
    });
}

/**
 * Handle Plinko button interactions
 */
async function handlePlinkoButtonInteraction(interaction, action) {
    const userId = interaction.user.id;
    const guildId = await getGuildId(interaction);
    
    // Log interaction state for debugging
    const state = getInteractionState(interaction);
    logger.info(`Plinko button interaction: ${JSON.stringify(state)}`);
    
    if (!activePlinkoGames.has(userId)) {
        await safeReply(interaction, { 
            content: '❌ No active Plinko game found.', 
            flags: MessageFlags.Ephemeral 
        });
        return;
    }

    const gameSession = activePlinkoGames.get(userId);

    try {
        if (action.startsWith('mode_')) {
            await handleModeSelection(interaction, action, gameSession, userId, guildId);
        } else if (action.startsWith('slot_') || action === 'random') {
            await handleSlotSelection(interaction, action, gameSession, userId, guildId);
        }
    } catch (error) {
        logger.error(`Error in Plinko button interaction: ${error.message}`);
        
        const errorEmbed = buildSessionEmbed({
            title: `❌ ${gameSession.username}'s Plinko`,
            topFields: [
                { name: 'System Error', value: 'Something went wrong.\nPlease try again.' }
            ],
            color: 0xFF0000,
            footer: 'Plinko Game'
        });

        const success = await safeUpdate(interaction, { embeds: [errorEmbed], components: [] });
        if (!success) {
            // Fallback - try to send as new reply
            await safeReply(interaction, { embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
        
        // Cleanup and refund
        await cleanup(userId, guildId, gameSession.betAmount);
    }
}

/**
 * Handle mode selection
 */
async function handleModeSelection(interaction, action, gameSession, userId, guildId) {
    if (gameSession.stage !== 'mode_selection') {
        await safeReply(interaction, { 
            content: '❌ Invalid game state.', 
            flags: MessageFlags.Ephemeral 
        });
        return;
    }

    const modeName = action.split('_')[1];
    const mode = modeName.charAt(0).toUpperCase() + modeName.slice(1);
    const modeData = PLINKO_MODES[mode];
    
    if (!modeData) {
        await safeReply(interaction, { 
            content: '❌ Invalid mode selected.', 
            flags: MessageFlags.Ephemeral 
        });
        return;
    }

    // Update game session
    gameSession.mode = mode;
    gameSession.modeData = modeData;
    gameSession.multipliers = randomizeMultipliers(modeData.multipliers);
    gameSession.slots = gameSession.multipliers.length;
    gameSession.stage = 'slot_selection';

    // Create initial board image
    const initialImage = createPlinkoImage(
        modeData.rows,
        gameSession.slots,
        gameSession.multipliers,
        null,
        -1,
        mode
    );

    // Create slot selection buttons
    const components = [];
    const buttonsPerRow = mode === 'Nightmare' ? 4 : 5;
    const totalRows = Math.ceil(gameSession.slots / buttonsPerRow);
    
    for (let row = 0; row < totalRows; row++) {
        const actionRow = new ActionRowBuilder();
        const startIdx = row * buttonsPerRow;
        const endIdx = Math.min(startIdx + buttonsPerRow, gameSession.slots);
        
        for (let i = startIdx; i < endIdx; i++) {
            const mult = gameSession.multipliers[i];
            let style = ButtonStyle.Secondary;
            
            if (mode !== 'Nightmare') {
                if (mult >= 2.0) style = ButtonStyle.Success;
                else if (mult >= 1.0) style = ButtonStyle.Primary;
                else if (mult >= 0.5) style = ButtonStyle.Secondary;
                else style = ButtonStyle.Danger;
            }

            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`plinko_slot_${i}`)
                    .setLabel(`${i + 1}`)
                    .setStyle(style)
            );
        }
        components.push(actionRow);
    }

    // Add random button
    const randomRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('plinko_random')
                .setLabel('🎲 Random')
                .setStyle(ButtonStyle.Secondary)
        );
    components.push(randomRow);

    const legendText = mode === 'Nightmare' ? 
        'Nightmare layout: buttons grouped as G1..G? (4 per group).\n25x slots are placed 4 away from each edge.' :
        `Buttons grouped as G1..G? (${buttonsPerRow} per group) for clarity.\nMultiplier bands: danger/low/medium/high based on values.`;

    const embed = buildSessionEmbed({
        title: `🎯 ${gameSession.username}'s ${mode} Plinko`,
        topFields: [
            { name: 'Choose Drop Slot', value: `Select where to drop the ball or press 🎲 Random.\n\n${legendText}` }
        ],
        bankFields: [
            { name: 'Bet Amount', value: fmtFull(gameSession.betAmount), inline: true },
            { name: 'Mode', value: `${modeData.emoji} ${mode}`, inline: true },
            { name: 'Rows', value: modeData.rows.toString(), inline: true }
        ],
        stageText: 'SELECT DROP SLOT',
        color: parseInt(modeData.color.replace('#', ''), 16),
        footer: 'Plinko Game'
    });

    const attachment = new AttachmentBuilder(initialImage, { name: 'plinko_board.png' });
    embed.image = { url: 'attachment://plinko_board.png' };

    await safeUpdate(interaction, { embeds: [embed], files: [attachment], components });
}

/**
 * Handle slot selection and run the game
 */
async function handleSlotSelection(interaction, action, gameSession, userId, guildId) {
    if (gameSession.stage !== 'slot_selection') {
        await safeReply(interaction, { 
            content: '❌ Invalid game state.', 
            flags: MessageFlags.Ephemeral 
        });
        return;
    }

    let dropSlot;
    if (action === 'random') {
        dropSlot = Math.floor(Math.random() * gameSession.slots);
    } else {
        dropSlot = parseInt(action.split('_')[1]);
    }

    if (dropSlot < 0 || dropSlot >= gameSession.slots) {
        await safeReply(interaction, { 
            content: '❌ Invalid slot selected.', 
            flags: MessageFlags.Ephemeral 
        });
        return;
    }

    // Update game stage
    gameSession.stage = 'playing';

    // Map slot to simulation coordinates
    const startPos = dropSlot - ((gameSession.slots - 1) / 2);

    // Run simulation
    const { slotIndex: finalSlot, path: ballPath } = simulatePlinkoDrop(
        gameSession.modeData.rows,
        gameSession.slots,
        startPos
    );

    const finalMultiplier = gameSession.multipliers[finalSlot];
    const winnings = gameSession.betAmount * finalMultiplier;
    const won = winnings >= gameSession.betAmount;

    // Create animation frames
    const animationFrames = [];
    
    // Initial frame
    animationFrames.push(createPlinkoImage(
        gameSession.modeData.rows,
        gameSession.slots,
        gameSession.multipliers,
        null,
        -1,
        gameSession.mode
    ));

    // Animation frames
    for (let i = 0; i <= Math.min(ballPath.length, gameSession.modeData.rows + 1); i++) {
        animationFrames.push(createPlinkoImage(
            gameSession.modeData.rows,
            gameSession.slots,
            gameSession.multipliers,
            ballPath,
            i,
            gameSession.mode
        ));
    }

    // Final frame with winning slot highlighted
    animationFrames.push(createPlinkoImage(
        gameSession.modeData.rows,
        gameSession.slots,
        gameSession.multipliers,
        ballPath,
        gameSession.modeData.rows + 1,
        gameSession.mode,
        finalSlot
    ));

    // Start animation
    await playAnimation(interaction, gameSession, animationFrames, dropSlot, finalSlot, finalMultiplier, winnings, won, userId, guildId);
}

/**
 * Play the Plinko animation
 */
async function playAnimation(interaction, gameSession, frames, dropSlot, finalSlot, finalMultiplier, winnings, won, userId, guildId) {
    // Initial animation frame
    let embed = buildSessionEmbed({
        title: `🎯 ${gameSession.username}'s ${gameSession.mode} Plinko`,
        topFields: [
            { name: 'Ball Released!', value: `🔴 Ball dropped from slot #${dropSlot + 1}!` }
        ],
        stageText: 'BALL DROPPING',
        color: parseInt(gameSession.modeData.color.replace('#', ''), 16),
        footer: 'Plinko Game'
    });

    let attachment = new AttachmentBuilder(frames[0], { name: 'plinko_initial.png' });
    embed.image = { url: 'attachment://plinko_initial.png' };

    await safeUpdate(interaction, { embeds: [embed], files: [attachment], components: [] });

    // Animate through frames
    for (let i = 1; i < frames.length - 1; i++) {
        await new Promise(resolve => setTimeout(resolve, 600));

        const frameEmbed = buildSessionEmbed({
            title: `🎯 ${gameSession.username}'s ${gameSession.mode} Plinko`,
            topFields: [
                { name: 'Ball Bouncing', value: `⚡ Ball bouncing through pegs... Row ${i}/${gameSession.modeData.rows}` }
            ],
            stageText: 'BALL BOUNCING',
            color: parseInt(gameSession.modeData.color.replace('#', ''), 16),
            footer: 'Plinko Game'
        });

        const frameAttachment = new AttachmentBuilder(frames[i], { name: `plinko_frame_${i}.png` });
        frameEmbed.image = { url: `attachment://plinko_frame_${i}.png` };

        await safeReply(interaction, { embeds: [frameEmbed], files: [frameAttachment] });
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Final result
    await showFinalResult(interaction, gameSession, frames[frames.length - 1], finalSlot, finalMultiplier, winnings, won, userId, guildId);
}

/**
 * Show final game result
 */
async function showFinalResult(interaction, gameSession, finalImage, finalSlot, finalMultiplier, winnings, won, userId, guildId) {
    // Update user balance and clear game active status
    const newWallet = gameSession.newWallet + winnings;
    await dbManager.updateUserBalance(userId, guildId, winnings, 0, { game_active: false });

    // Record game result using PayoutManager
    const gameResult = new GameResult({
        userId,
        guildId,
        gameType: GameType.PLINKO,
        betAmount: gameSession.betAmount,
        payout: winnings,
        won,
        metadata: {
            mode: gameSession.mode,
            dropSlot: finalSlot,
            finalMultiplier,
            housedEdge: gameSession.modeData.house_edge
        }
    });

    await PayoutManager.processGamePayout(gameResult);

    // Determine result type
    let resultTitle, resultEmoji, resultColor;
    if (winnings >= gameSession.betAmount * 20) {
        resultTitle = '💰 MASSIVE WIN! 💰';
        resultEmoji = '🌟';
        resultColor = 0xFFD700;
    } else if (winnings >= gameSession.betAmount * 5) {
        resultTitle = '🎉 BIG WIN!';
        resultEmoji = '🎊';
        resultColor = 0x00FF00;
    } else if (winnings > gameSession.betAmount) {
        resultTitle = '✅ WIN!';
        resultEmoji = '🎯';
        resultColor = 0x32CD32;
    } else if (winnings === gameSession.betAmount) {
        resultTitle = '🤝 BREAK EVEN';
        resultEmoji = '⚖️';
        resultColor = 0xFFD700;
    } else {
        resultTitle = '💥 LOSS';
        resultEmoji = '😢';
        resultColor = 0xFF0000;
    }

    // Special nightmare mode messages
    if (gameSession.mode === 'Nightmare') {
        if (winnings >= gameSession.betAmount * 100) {
            resultTitle = '💀 NIGHTMARE JACKPOT! 💀';
            resultEmoji = '👑';
        } else if (winnings < gameSession.betAmount * 0.01) {
            resultTitle = '💀 NIGHTMARE CONSUMED YOU! 💀';
            resultEmoji = '💀';
        }
    }

    const netChange = winnings - gameSession.betAmount;
    const netText = netChange >= 0 ? `+${fmtFull(netChange)}` : fmtFull(netChange);

    const embed = buildSessionEmbed({
        title: `${resultEmoji} ${gameSession.username}'s Plinko Result`,
        topFields: [
            { name: 'Result', value: `**${resultTitle}**` },
            { name: 'Mode', value: `${gameSession.modeData.emoji} ${gameSession.mode}`, inline: true },
            { name: 'Landing Slot', value: `**#${finalSlot + 1}** of ${gameSession.slots}`, inline: true },
            { name: 'Multiplier', value: `**${finalMultiplier.toFixed(2)}x**`, inline: true }
        ],
        bankFields: [
            { name: 'Bet Amount', value: fmtFull(gameSession.betAmount), inline: true },
            { name: 'Winnings', value: fmtFull(winnings), inline: true },
            { name: 'Net Change', value: netText, inline: true },
            { name: 'New Wallet', value: fmtFull(newWallet), inline: true }
        ],
        stageText: won ? 'WINNER!' : 'BETTER LUCK NEXT TIME',
        color: resultColor,
        footer: `🏠 House Edge: ${(gameSession.modeData.house_edge * 100).toFixed(0)}% | Gamble Responsibly!`
    });

    const attachment = new AttachmentBuilder(finalImage, { name: 'plinko_final.png' });
    embed.image = { url: 'attachment://plinko_final.png' };

    await safeReply(interaction, { embeds: [embed], files: [attachment] });

    // Cleanup
    activePlinkoGames.delete(userId);

    // Log the result
    await sendLogMessage(
        interaction.client,
        won ? 'info' : 'warn',
        `**Plinko Game Result**\n` +
        `**User:** ${gameSession.username} (\`${userId}\`)\n` +
        `**Mode:** ${gameSession.mode}\n` +
        `**Bet:** ${fmtFull(gameSession.betAmount)}\n` +
        `**Slot:** #${finalSlot + 1} (${finalMultiplier.toFixed(2)}x)\n` +
        `**Winnings:** ${fmtFull(winnings)}\n` +
        `**Net:** ${netText}`,
        userId,
        guildId
    );
}

/**
 * Cleanup function for error cases
 */
async function cleanup(userId, guildId, betAmount) {
    activePlinkoGames.delete(userId);
    
    // Refund bet and clear game active status
    await dbManager.updateUserBalance(userId, guildId, betAmount, 0, { game_active: false });
    
    logger.info(`Plinko cleanup: Refunded ${betAmount} to user ${userId}`);
}

// Export both the command and the button handler
module.exports = {
    ...plinkoCommand,
    handlePlinkoButtonInteraction
};