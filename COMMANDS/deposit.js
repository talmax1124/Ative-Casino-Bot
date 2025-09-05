/**
 * Deposit command for ATIVE Casino Bot
 * Allows users to deposit money from wallet to bank
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage, parseAmount, resolveAmount } = require('../UTILS/common');
const sessionManager = require('../UTILS/sessionManager');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const logger = require('../UTILS/logger');

// Simple transaction lock to prevent duplicate executions
const transactionLocks = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('💳 Deposit money from your wallet to your bank')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to deposit (supports K/M/B, "all", "half")')
                .setRequired(true)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = await getGuildId(interaction);
        const amountStr = interaction.options.getString('amount');

        // MUST defer immediately to prevent "Unknown interaction" error
        await interaction.deferReply();

        // Create transaction lock key
        const lockKey = `${userId}:deposit:${amountStr}:${Date.now().toString().slice(-6)}`;
        
        // Check if there's already a pending deposit for this user
        const existingLock = Array.from(transactionLocks.keys()).find(key => key.startsWith(`${userId}:deposit:`));
        if (existingLock) {
            await interaction.editReply({
                content: '❌ You already have a pending deposit. Please wait for it to complete.'
            });
            return;
        }

        // Set transaction lock
        transactionLocks.set(lockKey, Date.now());

        try {
            // Clean up old locks (older than 30 seconds)
            const now = Date.now();
            for (const [key, timestamp] of transactionLocks.entries()) {
                if (now - timestamp > 30000) {
                    transactionLocks.delete(key);
                }
            }

            // Ensure user exists
            await dbManager.ensureUser(userId, username);

            // Check if user has an active game session
            const activeSession = sessionManager.getUserActiveSession(userId);
            if (activeSession) {
                const topFields = [
                    {
                        name: '🎮 ACTIVE GAME DETECTED',
                        value: `You cannot deposit money while playing **${activeSession.gameType}**!\n\nFinish your current game first, then try again.`,
                        inline: false
                    }
                ];

                const embed = buildSessionEmbed({
                    title: '❌ Deposit Blocked',
                    topFields,
                    stageText: 'GAME IN PROGRESS',
                    color: 0xFF6600,
                    footer: 'Banking System - Game Protection'
                });

                return await interaction.editReply({ embeds: [embed] });
            }

            // Get current balance
            const balance = await dbManager.getUserBalance(userId, guildId);
            const currentWallet = parseFloat(balance.wallet) || 0;
            const currentBank = parseFloat(balance.bank) || 0;

            // Parse and resolve amount
            let resolvedAmount;
            try {
                const parsed = parseAmount(amountStr);
                if (parsed === null) {
                    throw new Error('Invalid amount format');
                }
                
                resolvedAmount = resolveAmount(parsed, currentWallet);
                if (resolvedAmount === null || resolvedAmount <= 0) {
                    throw new Error('Invalid amount format');
                }
            } catch (error) {
                const topFields = [
                    {
                        name: '❌ INVALID AMOUNT',
                        value: `"${amountStr}" is not a valid amount.\n\n**Valid formats:**\n• Numbers: 1000, 1.5k, 2.3m\n• Shortcuts: all, half`,
                        inline: false
                    }
                ];

                const embed = buildSessionEmbed({
                    title: '❌ Deposit Error',
                    topFields,
                    stageText: 'INVALID FORMAT',
                    color: 0xFF0000,
                    footer: 'Banking System Error'
                });

                return await interaction.editReply({ embeds: [embed] });
            }

            // Validate amount
            if (resolvedAmount <= 0) {
                const topFields = [
                    {
                        name: '❌ INVALID AMOUNT',
                        value: 'Deposit amount must be greater than $0.',
                        inline: false
                    }
                ];

                const embed = buildSessionEmbed({
                    title: '❌ Deposit Error',
                    topFields,
                    stageText: 'INVALID AMOUNT',
                    color: 0xFF0000,
                    footer: 'Banking System Error'
                });

                return await interaction.editReply({ embeds: [embed] });
            }

            if (resolvedAmount > currentWallet) {
                const topFields = [
                    {
                        name: '❌ INSUFFICIENT FUNDS',
                        value: `You don't have enough money in your wallet!\n\n**Deposit Amount:** \`\`\`css\n${fmt(resolvedAmount)}\n\`\`\``,
                        inline: false
                    }
                ];

                const bankFields = [
                    { name: '💵 Wallet', value: fmt(currentWallet), inline: true },
                    { name: '🏦 Bank', value: fmt(currentBank), inline: true },
                    { name: '💎 Total', value: fmt(currentWallet + currentBank), inline: true }
                ];

                const embed = buildSessionEmbed({
                    title: '❌ Deposit Failed',
                    topFields,
                    bankFields,
                    stageText: 'INSUFFICIENT FUNDS',
                    color: 0xFF0000,
                    footer: 'Banking System Error'
                });

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
                const topFields = [
                    {
                        name: '❌ TRANSACTION FAILED',
                        value: 'Failed to process your deposit.\nPlease try again.',
                        inline: false
                    }
                ];

                const embed = buildSessionEmbed({
                    title: '❌ Banking Error',
                    topFields,
                    stageText: 'TRANSACTION FAILED',
                    color: 0xFF0000,
                    footer: 'Banking System Error'
                });

                return await interaction.editReply({ embeds: [embed] });
            }

            // Get updated balance for display
            const newBalance = await dbManager.getUserBalance(userId, guildId);

            // Create success embed
            const topFields = [
                {
                    name: '💳 DEPOSIT COMPLETE',
                    value: `**Successfully deposited to bank**\n\`\`\`diff\n- Wallet: ${fmt(currentWallet)}\n+ Bank: ${fmt(newBalance.bank)}\n+ Amount: ${fmt(depositAmount)}\`\`\``,
                    inline: false
                }
            ];

            const bankFields = [
                { name: '💵 Wallet Balance', value: fmt(newBalance.wallet), inline: true },
                { name: '🏦 Bank Balance', value: fmt(newBalance.bank), inline: true },
                { name: '💎 Total Worth', value: fmt(newBalance.wallet + newBalance.bank), inline: true }
            ];

            const embed = buildSessionEmbed({
                title: `💳 ${username}'s Deposit`,
                topFields,
                bankFields,
                stageText: 'DEPOSIT SUCCESS',
                color: 0x00FF00,
                footer: 'Your bank balance is safe and secure!'
            });

            await interaction.editReply({ embeds: [embed] });

            // Log transaction
            logger.info(`User ${username} (${userId}) deposited ${fmt(depositAmount)} to bank`);

            // Send log message
            try {
                await sendLogMessage(
                    interaction.client,
                    'economy',
                    `Bank deposit: ${username} deposited ${fmt(depositAmount)} (Wallet: ${fmt(newBalance.wallet)}, Bank: ${fmt(newBalance.bank)})`,
                    userId,
                    guildId
                );
            } catch (logError) {
                logger.error(`Failed to send deposit log: ${logError.message}`);
            }

        } catch (error) {
            logger.error(`Error in deposit command: ${error.message}`);

            try {
                const topFields = [
                    {
                        name: '❌ SYSTEM ERROR',
                        value: 'An error occurred while processing\nyour deposit.',
                        inline: false
                    }
                ];

                const errorEmbed = buildSessionEmbed({
                    title: '❌ Deposit Failed',
                    topFields,
                    stageText: 'SYSTEM ERROR',
                    color: 0xFF0000,
                    footer: 'Banking System Error'
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
                        `Deposit error for ${username} (${userId}) with amount "${amountStr}" — ${error.message}`,
                        userId,
                        guildId
                    );
                } catch (logError) {
                    logger.error(`Failed to send error log: ${logError.message}`);
                }
            } catch (replyError) {
                logger.error(`Failed to send error reply in deposit command: ${replyError.message}`);
            }
        } finally {
            // Always release the transaction lock
            transactionLocks.delete(lockKey);
        }
    }
};