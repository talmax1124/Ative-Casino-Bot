/**
 * Slots game command for the casino bot
 * Classic slot machine with various symbols and multipliers
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { fmt, fmtDelta, getGuildId, sendLogMessage } = require('../UTILS/common');
const { spinSlots, calculatePayout, createSlotDisplay, createSlotsImage, createSpinningSlotGIF } = require('../GAMES/slots');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');


/**
 * Create slots result embed using gameSessionKit style
 */
function createSlotsEmbed(user, symbols, result, betAmount, userBalance, oldWallet) {
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

    return buildSessionEmbed({
        title: `🎰 ${user.displayName}'s Slots`,
        topFields,
        bankFields,
        stageText,
        color,
        footer: result.won ? result.type : 'Better luck next time!'
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
        const amount = interaction.options.getString('amount');
        const guildId = await getGuildId(interaction);

        try {
            // Ensure user exists and get balance
            await dbManager.ensureUser(userId, interaction.user.displayName);
            const userBalance = await dbManager.getUserBalance(userId, guildId);

            // Validate and deduct bet
            const validation = await PayoutManager.validateAndDeductBet(
                interaction,
                amount,
                GameType.SLOTS,
                1,        // Min bet: $1
                1000000   // Max bet: $1M
            );

            if (!validation.isValid) {
                return await interaction.reply({ embeds: [validation.errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const betAmount = validation.parsedAmount;
            const oldWallet = validation.newWallet + betAmount; // Wallet before bet

            // Defer reply for animation and image generation
            await interaction.deferReply();

            // Spin the slots for real result immediately
            const symbols = spinSlots();
            const result = calculatePayout(symbols, betAmount);

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

            // Process payout
            const payoutResult = await PayoutManager.processGamePayout(gameResult);

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
            // Wait for animation to complete (GIF has 50 frames * ~50-250ms = ~7.5 seconds)
            setTimeout(async () => {
                try {
                    const staticImage = await createSlotsImage(symbols, result.won);
                    
                    // Create final result embed
                    const finalEmbed = createSlotsEmbed(
                        interaction.user,
                        symbols,
                        result,
                        betAmount,
                        finalBalance,
                        oldWallet
                    );

                    // Add booster bonus info if applicable
                    if (payoutResult.boosterBonus > 0) {
                        finalEmbed.addFields(
                            { name: '🚀 Booster Bonus', value: fmt(payoutResult.boosterBonus), inline: true }
                        );
                    }

                    const finalData = { embeds: [finalEmbed], attachments: [] };

                    if (staticImage) {
                        finalData.files = [{ attachment: staticImage, name: 'slots-result.png' }];
                        finalEmbed.setImage('attachment://slots-result.png');
                    }

                    await interaction.editReply(finalData);
                } catch (error) {
                    logger.error(`Error updating slots to static result: ${error.message}`);
                }
            }, 8000); // 8 second delay to ensure GIF completes

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

        } catch (error) {
            logger.error(`Error in slots command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Game Error')
                .setDescription('An error occurred while playing slots. Please try again.')
                .setColor(0xFF0000);

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};
