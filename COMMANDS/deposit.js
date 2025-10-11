/**
 * Deposit command for ATIVE Casino Bot
 * Simple, clear interface for depositing money to bank
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
        .setName('deposit')
        .setDescription('💳 Move money from wallet → bank (safe storage)')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to deposit (number, "all", "half")')
                .setRequired(true)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = await getGuildId(interaction);
        const amountStr = interaction.options.getString('amount');

        await interaction.deferReply();

        // Create transaction lock key
        const lockKey = `${userId}:deposit:${Date.now()}`;
        
        // Check if there's already a pending deposit
        const existingLock = Array.from(transactionLocks.keys()).find(key => key.startsWith(`${userId}:deposit:`));
        if (existingLock) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('⏳ Please Wait')
                .setDescription('You already have a deposit in progress.')
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
                    .setFooter({ text: 'Complete your game to deposit' });
                
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Get current balance
            const balance = await dbManager.getUserBalance(userId, guildId);
            const currentWallet = parseFloat(balance.wallet) || 0;
            const currentBank = parseFloat(balance.bank) || 0;

            // Parse amount
            let depositAmount;
            try {
                depositAmount = resolveAmount(amountStr, currentWallet);
                if (depositAmount === null || depositAmount <= 0) {
                    throw new Error('Invalid amount');
                }
            } catch (error) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Invalid Amount')
                    .setDescription(`**"${amountStr}"** is not valid`)
                    .addFields({
                        name: '✅ Valid Examples',
                        value: '• `1000` or `1k`\n• `all` (entire wallet)\n• `half` (50% of wallet)',
                        inline: false
                    })
                    .setColor(0xFF0000)
                    .setFooter({ text: 'Try again with a valid amount' });
                
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Check if user has enough money
            if (depositAmount > currentWallet) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Not Enough Money')
                    .setColor(0xFF0000)
                    .addFields(
                        { name: '💵 Your Wallet', value: fmt(currentWallet), inline: true },
                        { name: '📤 Trying to Deposit', value: fmt(depositAmount), inline: true }
                    )
                    .setFooter({ text: 'You cannot deposit more than you have' });
                
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Round to 2 decimal places
            depositAmount = Math.floor(depositAmount * 100) / 100;

            // Process the deposit
            const success = await dbManager.updateUserBalance(
                userId,
                guildId,
                -depositAmount, // Remove from wallet
                depositAmount   // Add to bank
            );

            if (!success) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Transaction Failed')
                    .setDescription('Could not process your deposit. Please try again.')
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
                .setTitle('✅ Deposit Successful')
                .setColor(0x00FF00)
                .setDescription(`**Moved ${fmt(depositAmount)} to your bank**`)
                .addFields(
                    { name: '\u200B', value: '**📤 FROM WALLET**', inline: false },
                    { name: 'Before', value: fmt(currentWallet), inline: true },
                    { name: 'After', value: fmt(newWallet), inline: true },
                    { name: 'Change', value: `-${fmt(depositAmount)}`, inline: true },
                    { name: '\u200B', value: '**📥 TO BANK**', inline: false },
                    { name: 'Before', value: fmt(currentBank), inline: true },
                    { name: 'After', value: fmt(newBank), inline: true },
                    { name: 'Change', value: `+${fmt(depositAmount)}`, inline: true }
                )
                .setFooter({ text: 'Your money is now safe in the bank!' })
                .setTimestamp();

            await interaction.editReply({ embeds: [successEmbed] });

            // Log transaction
            logger.info(`User ${username} (${userId}) deposited ${fmt(depositAmount)} to bank`);
            
            await sendLogMessage(
                interaction.client,
                'economy',
                `Deposit: ${username} moved ${fmt(depositAmount)} to bank`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error in deposit command: ${error.message}`);

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