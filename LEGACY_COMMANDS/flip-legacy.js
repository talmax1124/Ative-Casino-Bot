/**
 * Coin Flip command with balance-based win rate adjustments
 * Demonstrates the new balance-based adjustment system
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage, parseAmount } = require('../UTILS/common');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const UniversalGameIntegrator = require('../UTILS/UniversalGameIntegrator');
const logger = require('../UTILS/logger');

// Create game integrator instance
const gameIntegrator = new UniversalGameIntegrator('flip');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('flip')
        .setDescription('Flip a coin with balance-based odds (2x payout)')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to bet')
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
        const username = interaction.user.displayName;
        const amountStr = interaction.options.getString('amount');
        const userChoice = interaction.options.getString('choice');
        const guildId = await getGuildId(interaction);

        try {
            await interaction.deferReply();

            // Validate and parse bet amount
            const amount = parseAmount(amountStr);
            if (!amount || amount <= 0) {
                const errorEmbed = buildSessionEmbed({
                    title: '❌ Invalid Bet Amount',
                    topFields: [
                        { name: 'Error', value: 'Please enter a valid bet amount (e.g., 1000, 1k, 1m)' }
                    ],
                    stageText: 'INVALID BET',
                    color: 0xFF0000,
                    footer: 'Coin Flip • Balance-Based Odds'
                });
                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // Get user balance and validate bet
            await dbManager.ensureUser(userId, username);
            const balance = await dbManager.getUserBalance(userId, guildId);
            
            if (balance.wallet < amount) {
                const errorEmbed = buildSessionEmbed({
                    title: '💸 Insufficient Funds',
                    topFields: [
                        { name: 'Wallet Balance', value: fmt(balance.wallet) },
                        { name: 'Bet Amount', value: fmt(amount) },
                        { name: 'Needed', value: fmt(amount - balance.wallet) }
                    ],
                    stageText: 'INSUFFICIENT FUNDS',
                    color: 0xFF6B6B,
                    footer: 'Coin Flip • Balance-Based Odds'
                });
                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // Get balance-based adjustments for display
            const balanceAdjustments = await gameIntegrator.getBalanceAdjustments(
                userId, 
                guildId, 
                0.5, // 50% base win rate for coin flip
                amount * 2, // 2x payout multiplier
                0.05 // 5% base house edge
            );

            // Deduct bet amount
            const newWalletAmount = balance.wallet - amount;
            await dbManager.setUserBalance(userId, guildId, newWalletAmount, balance.bank);

            // Generate outcome using balance-based system
            const won = await gameIntegrator.generateGameOutcome(
                0.5, // 50% base win probability 
                0.05, // 5% house edge
                null, // no player profile
                userId, 
                guildId
            );

            // Calculate payout using balance-based system
            let payout = 0;
            if (won) {
                payout = await gameIntegrator.calculatePayout(
                    amount, 
                    2.0, // 2x multiplier for coin flip
                    true,
                    0.05, // 5% house edge
                    userId, 
                    guildId
                );
            }

            // Apply payout if won
            let finalBalance = newWalletAmount;
            if (won) {
                finalBalance += payout;
                await dbManager.setUserBalance(userId, guildId, finalBalance, balance.bank);
            }

            // Determine actual coin result (for display)
            const coinResult = won ? userChoice : (userChoice === 'heads' ? 'tails' : 'heads');
            const resultEmoji = coinResult === 'heads' ? '🪙' : '🎯';
            const choiceEmoji = userChoice === 'heads' ? '🪙' : '🎯';

            // Build result embed
            const topFields = [{
                name: `${resultEmoji} Coin Flip Result`,
                value: `**Your Choice:** ${choiceEmoji} ${userChoice.charAt(0).toUpperCase() + userChoice.slice(1)}\n` +
                       `**Coin Landed:** ${resultEmoji} ${coinResult.charAt(0).toUpperCase() + coinResult.slice(1)}\n` +
                       `**Outcome:** ${won ? '✅ You Win!' : '❌ You Lose!'}`
            }];

            // Add balance adjustment info if available
            if (balanceAdjustments) {
                const adjustmentSummary = require('../UTILS/balanceBasedAdjuster').generateAdjustmentSummary(balanceAdjustments);
                if (adjustmentSummary) {
                    topFields.push({
                        name: '⚖️ Balance-Based Adjustments',
                        value: adjustmentSummary
                    });
                }
            }

            const bankFields = [
                { name: '🎯 Bet Amount', value: fmt(amount), inline: true },
                { name: won ? '💰 Payout' : '💸 Lost', value: fmt(won ? payout : amount), inline: true },
                { name: '💵 New Balance', value: fmt(finalBalance), inline: true }
            ];

            // Color and stage based on outcome
            const color = won ? 0x00FF00 : 0xFF0000;
            const stageText = won ? 'FLIP WON' : 'FLIP LOST';
            
            // Determine footer text based on off-economy status
            const footerText = balanceAdjustments?.offEconomy 
                ? 'Coin Flip • Off Economy • ATIVE Casino'
                : 'Coin Flip • Balance-Based Odds • ATIVE Casino';

            const embed = buildSessionEmbed({
                title: `🪙 ${username}'s Coin Flip ${won ? 'Win!' : 'Loss!'}`,
                topFields,
                bankFields,
                stageText,
                color,
                footer: footerText
            });

            await interaction.editReply({ embeds: [embed] });

            // Log the game result
            const logMessage = `Coin flip: ${username} bet ${fmt(amount)} on ${userChoice}, coin landed ${coinResult} - ${won ? `Won ${fmt(payout)}` : `Lost ${fmt(amount)}`} - Balance: ${fmt(finalBalance)}`;
            await sendLogMessage(
                interaction.client,
                'games',
                logMessage,
                userId,
                guildId
            );

            // Record game result for analytics
            try {
                await dbManager.recordGameResult(
                    userId,
                    guildId,
                    'flip',
                    won,
                    amount,
                    won ? payout : 0,
                    {
                        userChoice,
                        coinResult,
                        balanceTier: balanceAdjustments?.balanceTier || 'NORMAL'
                    }
                );
            } catch (error) {
                logger.error(`Failed to record flip result: ${error.message}`);
            }

        } catch (error) {
            logger.error(`Error in flip command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Flip Error',
                topFields: [
                    { name: '🔧 System Error', value: 'Failed to process coin flip. Please try again.' }
                ],
                stageText: 'ERROR',
                color: 0xFF0000,
                footer: 'Coin Flip System Error'
            });

            try {
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: 64 });
                }
            } catch (replyError) {
                logger.error(`Failed to send flip error reply: ${replyError.message}`);
            }
        }
    }
};