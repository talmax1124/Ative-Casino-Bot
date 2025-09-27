/**
 * Withdraw command for ATIVE Casino Bot
 * Allows users to withdraw money from bank to wallet
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage, parseAmount, resolveAmount } = require('../UTILS/common');
const sessionManager = require('../UTILS/sessionManager');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('🏧 Withdraw money from your bank to your wallet')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to withdraw (supports K/M/B, "all", "half")')
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

            // Check if user has an active game session
            const activeSession = sessionManager.getUserActiveSession(userId);
            if (activeSession) {
                const errorEmbed = buildSessionEmbed({
                    title: '❌ Withdrawal Blocked',
                    topFields: [
                        { name: '🎮 Active Game Detected', value: `You cannot withdraw money while playing **${activeSession.gameType}**!\n\nFinish your current game first, then try again.` }
                    ],
                    stageText: 'GAME IN PROGRESS',
                    color: 0xFF0000,
                    footer: 'Complete your game to continue'
                });

                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // Get current balance
            const balance = await dbManager.getUserBalance(userId, guildId);
            const currentWallet = parseFloat(balance.wallet) || 0;
            const currentBank = parseFloat(balance.bank) || 0;
            
            // Validate balance data
            if (!balance || typeof balance !== 'object') {
                const errorEmbed = buildSessionEmbed({
                    title: '❌ Withdrawal Failed',
                    topFields: [
                        { name: '🔍 Balance Error', value: 'Unable to retrieve your balance. Please try again.' }
                    ],
                    stageText: 'ERROR',
                    color: 0xFF0000,
                    footer: 'Bank System Error'
                });

                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // Parse and resolve amount
            let resolvedAmount;
            try {
                const parsed = parseAmount(amountStr);
                if (parsed === null) {
                    throw new Error('Invalid amount format');
                }
                
                resolvedAmount = resolveAmount(parsed, currentBank);
                if (resolvedAmount === null || resolvedAmount <= 0) {
                    throw new Error('Invalid amount format');
                }
            } catch (error) {
                const errorEmbed = buildSessionEmbed({
                    title: '❌ Invalid Amount',
                    topFields: [
                        { name: '💰 Input Error', value: `"${amountStr}" is not a valid amount.` },
                        { name: '📝 Valid Formats', value: '• Numbers: 1000, 1.5k, 2.3m\n• Shortcuts: all, half' }
                    ],
                    stageText: 'INVALID INPUT',
                    color: 0xFF0000,
                    footer: 'Check your amount format'
                });

                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // Validate amount
            if (resolvedAmount <= 0) {
                let errorMessage = 'Withdrawal amount must be greater than $0.';
                
                if (amountStr.toLowerCase().includes('all') && currentBank === 0) {
                    errorMessage = `You don't have any money in your bank to withdraw!`;
                } else if (amountStr.toLowerCase().includes('half') && currentBank === 0) {
                    errorMessage = `You don't have any money in your bank to withdraw!`;
                }
                
                const errorEmbed = buildSessionEmbed({
                    title: '❌ Insufficient Funds',
                    topFields: [
                        { name: '🏦 Bank Balance', value: fmt(currentBank) },
                        { name: '💰 Wallet Balance', value: fmt(currentWallet) }
                    ],
                    stageText: errorMessage,
                    color: 0xFF0000,
                    footer: 'Bank System'
                });

                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            if (resolvedAmount > currentBank) {
                const errorEmbed = buildSessionEmbed({
                    title: '❌ Insufficient Bank Funds',
                    topFields: [
                        { name: '💸 Requested Amount', value: fmt(resolvedAmount) },
                        { name: '🏦 Available in Bank', value: fmt(currentBank) },
                        { name: '💰 Current Wallet', value: fmt(currentWallet) }
                    ],
                    stageText: 'NOT ENOUGH FUNDS',
                    color: 0xFF0000,
                    footer: 'Bank System'
                });

                return await interaction.editReply({ embeds: [errorEmbed] });
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
                const errorEmbed = buildSessionEmbed({
                    title: '❌ Transaction Failed',
                    topFields: [
                        { name: '🔧 System Error', value: 'Failed to process your withdrawal. Please try again.' }
                    ],
                    stageText: 'TRANSACTION FAILED',
                    color: 0xFF0000,
                    footer: 'Bank System Error'
                });

                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // Force cache refresh to ensure immediate balance display
            try {
                const nodeCache = require('../UTILS/nodeCache');
                const cacheKey = `casino:balance:${userId}:${guildId}`;
                await nodeCache.del(cacheKey);
                logger.debug(`🔄 Forced cache refresh for withdraw display`);
            } catch (cacheError) {
                logger.debug(`Cache refresh failed: ${cacheError.message}`);
            }

            // Get updated balance for display
            const newBalance = await dbManager.getUserBalance(userId, guildId);

            // Create success embed
            const successEmbed = buildSessionEmbed({
                title: `🏧 ${username}'s Bank Withdrawal`,
                topFields: [
                    { 
                        name: '💸 WITHDRAWAL COMPLETE', 
                        value: `**Successfully withdrew from bank**\n\`\`\`diff\n- Bank: ${fmt(currentBank)}\n+ Wallet: ${fmt(newBalance.wallet)}\n+ Amount: ${fmt(withdrawAmount)}\`\`\``, 
                        inline: false 
                    }
                ],
                bankFields: [
                    { name: '💵 Wallet Balance', value: fmt(newBalance.wallet), inline: true },
                    { name: '🏦 Bank Balance', value: fmt(newBalance.bank), inline: true },
                    { name: '💎 Total Worth', value: fmt(parseFloat(newBalance.wallet) + parseFloat(newBalance.bank)), inline: true }
                ],
                stageText: 'WITHDRAWAL SUCCESS',
                color: 0x00FF00,
                footer: '🏧 Bank System • ATIVE Casino'
            });

            await interaction.editReply({ embeds: [successEmbed] });

            // Log transaction
            logger.info(`User ${username} (${userId}) withdrew ${fmt(withdrawAmount)} from bank`);

            // Send log message
            try {
                await sendLogMessage(
                    interaction.client,
                    'economy',
                    `Bank withdrawal: ${username} withdrew ${fmt(withdrawAmount)} (Wallet: ${fmt(newBalance.wallet)}, Bank: ${fmt(newBalance.bank)})`,
                    userId,
                    guildId
                );
            } catch (logError) {
                logger.error(`Failed to send withdrawal log: ${logError.message}`);
            }

        } catch (error) {
            logger.error(`Error in withdraw command: ${error.message}`);

            try {
                const errorEmbed = buildSessionEmbed({
                    title: '❌ Withdrawal Error',
                    topFields: [
                        { name: '🔧 System Error', value: 'An error occurred while processing your withdrawal.' }
                    ],
                    stageText: 'SYSTEM ERROR',
                    color: 0xFF0000,
                    footer: 'Please try again later'
                });

                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: 64 });
                }

                // Send error log
                try {
                    await sendLogMessage(
                        interaction.client,
                        'error',
                        `Withdraw error for ${username} (${userId}) with amount "${amountStr}" — ${error.message}`,
                        userId,
                        guildId
                    );
                } catch (logError) {
                    logger.error(`Failed to send error log: ${logError.message}`);
                }
            } catch (replyError) {
                logger.error(`Failed to send error reply in withdraw command: ${replyError.message}`);
            }
        }
    }
};