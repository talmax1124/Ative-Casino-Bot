/**
 * Withdraw command for ATIVE Casino Bot
 * Allows users to withdraw money from bank to wallet
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtFull, fmtDelta, getGuildId, sendLogMessage, parseAmount, resolveAmount } = require('../UTILS/common');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('🏧 Withdraw money from your bank to your wallet')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to withdraw (use "all" or "half" for shortcuts)')
                .setRequired(true)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = await getGuildId(interaction);
        const amountStr = interaction.options.getString('amount');

        try {
            await interaction.deferReply();

            // Ensure user exists
            await dbManager.ensureUser(userId, username);

            // Get current balance
            const balance = await dbManager.getUserBalance(userId, guildId);
            const currentWallet = balance.wallet;
            const currentBank = balance.bank;

            // Parse amount
            const parsedAmount = parseAmount(amountStr);
            if (parsedAmount === null) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Invalid Amount')
                    .setDescription(`"${amountStr}" is not a valid amount.\n\n**Valid formats:**\n• Numbers: \`1000\`, \`1.5k\`, \`2.3m\`\n• Shortcuts: \`all\`, \`half\``)
                    .setColor(0xFF0000)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Resolve special amounts (all/half) - use bank amount for resolution
            const resolvedAmount = resolveAmount(parsedAmount, currentBank);

            // Validate amount
            if (resolvedAmount <= 0) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Invalid Amount')
                    .setDescription('Withdrawal amount must be greater than $0.')
                    .setColor(0xFF0000)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            if (resolvedAmount > currentBank) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Insufficient Funds')
                    .setDescription(`You don't have enough money in your bank!\n\n**Your Bank:** ${fmtFull(currentBank)}\n**Withdrawal Amount:** ${fmtFull(resolvedAmount)}`)
                    .setColor(0xFF0000)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Round to 2 decimal places
            const withdrawAmount = Math.floor(resolvedAmount * 100) / 100;

            // Update balance (move from bank to wallet)
            const success = await dbManager.updateUserBalance(
                userId,
                guildId,
                withdrawAmount, // Add to wallet
                -withdrawAmount // Remove from bank
            );

            if (!success) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Transaction Failed')
                    .setDescription('Failed to process your withdrawal. Please try again.')
                    .setColor(0xFF0000)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Get updated balance for display
            const newBalance = await dbManager.getUserBalance(userId, guildId);

            // Create success embed
            const embed = new EmbedBuilder()
                .setTitle('🏧 Withdrawal Successful')
                .setDescription(`You successfully withdrew ${fmtFull(withdrawAmount)} from your bank!`)
                .setColor(0x00FF00)
                .addFields(
                    { name: '💵 Wallet', value: `${fmtFull(currentWallet)} → **${fmtFull(newBalance.wallet)}**`, inline: true },
                    { name: '🏦 Bank', value: `${fmtFull(currentBank)} → **${fmtFull(newBalance.bank)}**`, inline: true },
                    { name: '💎 Total', value: fmtFull(newBalance.wallet + newBalance.bank), inline: true }
                )
                .setFooter({ text: '💡 Keep money in your bank to earn daily interest!' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Log transaction
            logger.info(`User ${username} (${userId}) withdrew ${fmtFull(withdrawAmount)} from bank`);

            // Send log message
            try {
                await sendLogMessage(
                    interaction.client,
                    'info',
                    `**🏧 Bank Withdrawal**\n` +
                    `**User:** ${interaction.user} (\`${userId}\`)\n` +
                    `**Amount:** ${fmtFull(withdrawAmount)}\n` +
                    `**New Wallet:** ${fmtFull(newBalance.wallet)}\n` +
                    `**New Bank:** ${fmtFull(newBalance.bank)}`,
                    userId,
                    guildId
                );
            } catch (logError) {
                logger.error(`Failed to send withdrawal log: ${logError.message}`);
            }

        } catch (error) {
            logger.error(`Error in withdraw command: ${error.message}`);

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing your withdrawal.')
                .setColor(0xFF0000)
                .setTimestamp();

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Send error log
            try {
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `**Withdraw Command Error**\n` +
                    `**User:** ${interaction.user} (\`${userId}\`)\n` +
                    `**Amount:** ${amountStr}\n` +
                    `**Error:** \`${error.message}\``,
                    userId,
                    guildId
                );
            } catch (logError) {
                logger.error(`Failed to send error log: ${logError.message}`);
            }
        }
    }
};