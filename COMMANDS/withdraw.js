/**
 * Withdraw command for ATIVE Casino Bot
 * Simple, clear interface for withdrawing money from bank
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage, resolveAmount } = require('../UTILS/common');
const sessionManager = require('../UTILS/sessionManager');
const logger = require('../UTILS/logger');

// Simple transaction lock to prevent duplicate executions
const transactionLocks = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('🏧 Move money from bank → wallet (for spending)')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to withdraw (number, "all", "half")')
                .setRequired(true)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = await getGuildId(interaction);
        const amountStr = interaction.options.getString('amount');

        await interaction.deferReply();

        // Create transaction lock key
        const lockKey = `${userId}:withdraw:${Date.now()}`;
        
        // Check if there's already a pending withdrawal
        const existingLock = Array.from(transactionLocks.keys()).find(key => key.startsWith(`${userId}:withdraw:`));
        if (existingLock) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('⏳ Please Wait')
                .setDescription('You already have a withdrawal in progress.')
                .setColor(0xFFAA00)
                .setFooter({ text: 'ATIVE Casino' });
            
            await interaction.editReply({ embeds: [errorEmbed] });
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
                const errorEmbed = new EmbedBuilder()
                    .setTitle('🎮 Game in Progress')
                    .setDescription(`Finish your **${activeSession.gameType}** game first!`)
                    .setColor(0xFF6600)
                    .setFooter({ text: 'Complete your game to withdraw' });
                
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Get current balance
            const balance = await dbManager.getUserBalance(userId, guildId);
            const currentWallet = parseFloat(balance.wallet) || 0;
            const currentBank = parseFloat(balance.bank) || 0;

            // Check if bank is empty
            if (currentBank <= 0) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('🏦 Bank is Empty')
                    .setDescription('You have no money in your bank to withdraw.')
                    .addFields(
                        { name: '💵 Wallet', value: fmt(currentWallet), inline: true },
                        { name: '🏦 Bank', value: fmt(0), inline: true }
                    )
                    .setColor(0xFF0000)
                    .setFooter({ text: 'Deposit money first to withdraw later' });
                
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Parse amount
            let withdrawAmount;
            try {
                withdrawAmount = resolveAmount(amountStr, currentBank);
                if (withdrawAmount === null || withdrawAmount <= 0) {
                    throw new Error('Invalid amount');
                }
            } catch (error) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Invalid Amount')
                    .setDescription(`**"${amountStr}"** is not valid`)
                    .addFields({
                        name: '✅ Valid Examples',
                        value: '• `1000` or `1k`\n• `all` (entire bank)\n• `half` (50% of bank)',
                        inline: false
                    })
                    .setColor(0xFF0000)
                    .setFooter({ text: 'Try again with a valid amount' });
                
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Check if user has enough money in bank
            if (withdrawAmount > currentBank) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Not Enough in Bank')
                    .setColor(0xFF0000)
                    .addFields(
                        { name: '🏦 Your Bank', value: fmt(currentBank), inline: true },
                        { name: '📤 Trying to Withdraw', value: fmt(withdrawAmount), inline: true }
                    )
                    .setFooter({ text: 'You cannot withdraw more than you have' });
                
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Round to 2 decimal places
            withdrawAmount = Math.floor(withdrawAmount * 100) / 100;

            // Process the withdrawal
            const success = await dbManager.updateUserBalance(
                userId,
                guildId,
                withdrawAmount,  // Add to wallet
                -withdrawAmount  // Remove from bank
            );

            if (!success) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Transaction Failed')
                    .setDescription('Could not process your withdrawal. Please try again.')
                    .setColor(0xFF0000)
                    .setFooter({ text: 'ATIVE Casino' });
                
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Force cache refresh
            try {
                const nodeCache = require('../UTILS/nodeCache');
                const cacheKey = `casino:balance:${userId}:${guildId}`;
                await nodeCache.del(cacheKey);
            } catch (cacheError) {
                // Silent fail
            }

            // Get updated balance
            const newBalance = await dbManager.getUserBalance(userId, guildId);
            const newWallet = parseFloat(newBalance.wallet);
            const newBank = parseFloat(newBalance.bank);

            // Create success embed with clear separation
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Withdrawal Successful')
                .setColor(0x00FF00)
                .setDescription(`**Moved ${fmt(withdrawAmount)} to your wallet**`)
                .addFields(
                    { name: '\u200B', value: '**📤 FROM BANK**', inline: false },
                    { name: 'Before', value: fmt(currentBank), inline: true },
                    { name: 'After', value: fmt(newBank), inline: true },
                    { name: 'Change', value: `-${fmt(withdrawAmount)}`, inline: true },
                    { name: '\u200B', value: '**📥 TO WALLET**', inline: false },
                    { name: 'Before', value: fmt(currentWallet), inline: true },
                    { name: 'After', value: fmt(newWallet), inline: true },
                    { name: 'Change', value: `+${fmt(withdrawAmount)}`, inline: true }
                )
                .setFooter({ text: 'Your money is ready to use!' })
                .setTimestamp();

            await interaction.editReply({ embeds: [successEmbed] });

            // Log transaction
            logger.info(`User ${username} (${userId}) withdrew ${fmt(withdrawAmount)} from bank`);
            
            await sendLogMessage(
                interaction.client,
                'economy',
                `Withdrawal: ${username} moved ${fmt(withdrawAmount)} from bank`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error in withdraw command: ${error.message}`);

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ System Error')
                .setDescription('Something went wrong. Please try again.')
                .setColor(0xFF0000)
                .setFooter({ text: 'ATIVE Casino' });
            
            await interaction.editReply({ embeds: [errorEmbed] });

        } finally {
            // Always release the transaction lock
            transactionLocks.delete(lockKey);
        }
    }
};