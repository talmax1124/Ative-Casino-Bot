/**
 * Matrix Slots game command (3x3 slots with multiple paylines)
 * Buffalo symbol triggers bonus rounds with 5 free spins and 3x multiplier
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { getGuildId, sendLogMessage } = require('../UTILS/common');
const { 
    spinMatrixSlots, 
    calculateMatrixPayout, 
    createMatrixImage,
    createSpinningMatrixDisplay,
    createSpinningMatrixGIF,
    MATRIX_MIN_BET
} = require('../GAMES/slots');
const { 
    createMatrixEmbed, 
    handleBuffaloBonusStart, 
    handleBuffaloBonusSpin 
} = require('../GAMES/multi-slots');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('multi-slots')
        .setDescription('Play the 3x3 matrix slots with multiple paylines! Buffalo triggers bonus rounds!')
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

            // Validate and deduct bet with special matrix requirements
            const validation = await PayoutManager.validateAndDeductBet(
                interaction,
                amount,
                GameType.MULTI_SLOTS,
                1,                      // Min bet: $1
                5000000,                // Max bet: $5M
                { matrixMinBet: MATRIX_MIN_BET }  // Special requirement for matrix mode
            );

            if (!validation.isValid) {
                return await interaction.reply({ embeds: [validation.errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const betAmount = validation.parsedAmount;
            const oldWallet = validation.newWallet + betAmount;

            // Defer reply for animation and image generation
            await interaction.deferReply();

            // Show spinning animation first
            const spinningEmbed = new EmbedBuilder()
                .setTitle('🎰 SLOTS MATRIX 3x3 🎰')
                .setColor(0xFFFF00)
                .addFields({
                    name: '🎲 SPINNING MATRIX...',
                    value: `\`\`\`${createSpinningMatrixDisplay()}\`\`\``,
                    inline: false
                })
                .setDescription('🎰 **Spinning the 3x3 matrix...** 🎰')
                .setFooter({ text: 'Buffalo bonus available!' });

            await interaction.editReply({ embeds: [spinningEmbed] });

            // Wait for animation effect (3 seconds for matrix)
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Spin the matrix slots for real result
            const matrix = spinMatrixSlots();
            const result = calculateMatrixPayout(matrix, betAmount);

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
                specialResult: buffaloBonus ? 'Buffalo Bonus Triggered' : result.type
            });

            // Process payout
            const payoutResult = await PayoutManager.processGamePayout(gameResult);

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

            // PHASE 1: Show animated matrix GIF first
            const animatedGIF = await createSpinningMatrixGIF(matrix);

            // Create result embed for animation phase
            const animationEmbed = createMatrixEmbed(
                interaction.user,
                matrix,
                result,
                betAmount,
                finalBalance,
                buffaloBonus
            );

            const animationData = { embeds: [animationEmbed] };

            if (animatedGIF) {
                animationData.files = [{ attachment: animatedGIF, name: 'matrix-animation.gif' }];
                animationEmbed.setImage('attachment://matrix-animation.gif');
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

                    const finalData = { embeds: [finalEmbed] };

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
                    ephemeral: true
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
                    ephemeral: true
                });
            }
        }
    },

    // Bonus spin handler
    async handleBonusSpin(interaction) {
        await this.handleBuffaloBonus(interaction);
    }
};