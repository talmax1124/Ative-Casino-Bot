/**
 * Slots game command for the casino bot
 * Classic slot machine with various symbols and multipliers
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { fmt, fmtDelta } = require('../UTILS/common');
const { spinSlots, calculatePayout, createSlotDisplay } = require('../GAMES/slots');
const logger = require('../UTILS/logger');


/**
 * Create slots result embed
 */
function createSlotsEmbed(user, symbols, result, betAmount, newWallet, oldWallet) {
    const embed = new EmbedBuilder()
        .setTitle('🎰 SLOT MACHINE 🎰')
        .setColor(result.won ? 0x00FF00 : 0xFF0000)
        .setTimestamp();
    
    // Slot display
    const slotDisplay = createSlotDisplay(symbols);
    
    embed.addFields(
        { name: '🎲 Result', value: `\`\`\`${slotDisplay}\`\`\``, inline: false }
    );
    
    if (result.won) {
        embed.setDescription(`🎉 **${result.type}!** 🎉`);
        embed.addFields(
            { name: '💰 Bet', value: fmt(betAmount), inline: true },
            { name: '🎯 Multiplier', value: `${result.multiplier}x`, inline: true },
            { name: '💸 Payout', value: fmt(result.payout), inline: true },
            { name: '💵 New Balance', value: `${fmt(newWallet)} ${fmtDelta(newWallet, oldWallet)}`, inline: false }
        );
        
        // Special jackpot message
        if (result.multiplier >= 100) {
            embed.setFooter({ text: '🎊 INCREDIBLE WIN! 🎊' });
        } else if (result.multiplier >= 50) {
            embed.setFooter({ text: '✨ AMAZING WIN! ✨' });
        }
    } else {
        embed.setDescription('😔 **No match this time!**');
        embed.addFields(
            { name: '💰 Bet', value: fmt(betAmount), inline: true },
            { name: '💸 Lost', value: fmt(betAmount), inline: true },
            { name: '💵 New Balance', value: `${fmt(newWallet)} ${fmtDelta(newWallet, oldWallet)}`, inline: true }
        );
        embed.setFooter({ text: 'Better luck next time!' });
    }
    
    return embed;
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

        try {
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

            // Spin the slots
            const symbols = spinSlots();
            const result = calculatePayout(symbols, betAmount);

            // Create game result
            const gameResult = new GameResult({
                userId: userId,
                guildId: interaction.guildId,
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
                await PayoutManager.refundBet(userId, interaction.guildId, betAmount, 'Payout processing failed');
                
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Game Error')
                    .setDescription('An error occurred processing your game. Your bet has been refunded.')
                    .setColor(0xFF0000);
                
                return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Create result embed
            const resultEmbed = createSlotsEmbed(
                interaction.user,
                symbols,
                result,
                betAmount,
                payoutResult.newWallet,
                oldWallet
            );

            // Add booster bonus info if applicable
            if (payoutResult.boosterBonus > 0) {
                resultEmbed.addFields(
                    { name: '🚀 Booster Bonus', value: fmt(payoutResult.boosterBonus), inline: true }
                );
            }

            await interaction.reply({ embeds: [resultEmbed] });

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
                await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};