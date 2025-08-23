/**
 * Deposit command for ATIVE Casino Bot
 * Allows users to deposit money from wallet to bank
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtFull, fmtDelta, getGuildId, sendLogMessage, parseAmount, resolveAmount } = require('../UTILS/common');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('💳 Deposit money from your wallet to your bank')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to deposit (use "all" or "half" for shortcuts)')
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

            // Resolve special amounts (all/half)
            const resolvedAmount = resolveAmount(parsedAmount, currentWallet);

            // Validate amount
            if (resolvedAmount <= 0) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Invalid Amount')
                    .setDescription('Deposit amount must be greater than $0.')
                    .setColor(0xFF0000)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            if (resolvedAmount > currentWallet) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Insufficient Funds')
                    .setDescription(`You don't have enough money in your wallet!\n\n**Your Wallet:** ${fmtFull(currentWallet)}\n**Deposit Amount:** ${fmtFull(resolvedAmount)}`)
                    .setColor(0xFF0000)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Round to 2 decimal places
            const depositAmount = Math.floor(resolvedAmount * 100) / 100;

            // Update balance (move from wallet to bank)
            const success = await dbManager.updateUserBalance(
                userId,
                guildId,
                -depositAmount, // Remove from wallet
                depositAmount   // Add to bank
            );

            if (!success) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Transaction Failed')
                    .setDescription('Failed to process your deposit. Please try again.')
                    .setColor(0xFF0000)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Get updated balance for display
            const newBalance = await dbManager.getUserBalance(userId, guildId);

            // Create success embed
            const embed = new EmbedBuilder()
                .setTitle('💳 Deposit Successful')
                .setDescription(`You successfully deposited ${fmtFull(depositAmount)} into your bank!`)
                .setColor(0x00FF00)
                .addFields(
                    { name: '💵 Wallet', value: `${fmtFull(currentWallet)} → **${fmtFull(newBalance.wallet)}**`, inline: true },
                    { name: '🏦 Bank', value: `${fmtFull(currentBank)} → **${fmtFull(newBalance.bank)}**`, inline: true },
                    { name: '💎 Total', value: fmtFull(newBalance.wallet + newBalance.bank), inline: true }
                )
                .setFooter({ text: '💡 Your bank balance earns daily interest!' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Log transaction
            logger.info(`User ${username} (${userId}) deposited ${fmtFull(depositAmount)} to bank`);

            // Send log message
            try {
                await sendLogMessage(
                    interaction.client,
                    'info',
                    `**💳 Bank Deposit**\n` +
                    `**User:** ${interaction.user} (\`${userId}\`)\n` +
                    `**Amount:** ${fmtFull(depositAmount)}\n` +
                    `**New Wallet:** ${fmtFull(newBalance.wallet)}\n` +
                    `**New Bank:** ${fmtFull(newBalance.bank)}`,
                    userId,
                    guildId
                );
            } catch (logError) {
                logger.error(`Failed to send deposit log: ${logError.message}`);
            }

        } catch (error) {
            logger.error(`Error in deposit command: ${error.message}`);

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing your deposit.')
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
                    `**Deposit Command Error**\n` +
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