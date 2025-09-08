const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const { validateAmount, formatMoneyFull } = require('../UTILS/moneyFormatter');
const logger = require('../UTILS/logger');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const OffEconomyBadge = require('../UTILS/offEconomyBadge');

// Simple transaction lock to prevent duplicate executions
const transactionLocks = new Map();

// Designated server ID for lottery pool
const DESIGNATED_SERVER_ID = '1402968479002558464';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sendmoney')
        .setDescription('Send money to another user (5% tax goes to lottery pool)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to send money to')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to send (supports K/M/B/T, "all", "half" - minimum $1,000)')
                .setRequired(true)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const amountStr = interaction.options.getString('amount');
        const senderId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        // Check if user is trying to send money to themselves
        if (targetUser.id === senderId) {
            await interaction.reply({
                content: '❌ You cannot send money to yourself!',
                flags: 64
            });
            return;
        }

        // Check if target is a bot
        if (targetUser.bot) {
            await interaction.reply({
                content: '❌ You cannot send money to bots!',
                flags: 64
            });
            return;
        }

        // Check economy type restrictions - Off Economy can only send to Off Economy
        const senderOffEco = await OffEconomyBadge.isOffEconomy(senderId);
        const targetOffEco = await OffEconomyBadge.isOffEconomy(targetUser.id);

        if (senderOffEco !== targetOffEco) {
            const economyType = senderOffEco ? 'Off Economy' : 'Regular Economy';
            const targetEconomyType = targetOffEco ? 'Off Economy' : 'Regular Economy';
            
            await interaction.reply({
                content: `🔴 **Economy Type Mismatch**\n\n` +
                        `You (${economyType}) cannot send money to users from ${targetEconomyType}!\n\n` +
                        `You can only send money to users in the same economy type.`,
                flags: 64
            });
            return;
        }

        // MUST defer immediately to prevent "Unknown interaction" error
        await interaction.deferReply();

        // Create transaction lock key
        const lockKey = `${senderId}:${targetUser.id}:${amountStr}:${Date.now().toString().slice(-6)}`;
        
        // Check if there's already a pending transaction for this user
        const existingLock = Array.from(transactionLocks.keys()).find(key => key.startsWith(`${senderId}:`));
        if (existingLock) {
            await interaction.editReply({
                content: '❌ You already have a pending money transfer. Please wait for it to complete.'
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

            // Ensure both users exist in database
            await dbManager.ensureUser(senderId, interaction.user.displayName);
            await dbManager.ensureUser(targetUser.id, targetUser.displayName);

            // Get sender's balance
            const senderBalance = await dbManager.getUserBalance(senderId, guildId);
            
            // Check and reset daily send limit if needed
            const today = Math.floor(now / (1000 * 60 * 60 * 24)); // Days since epoch
            const lastResetDay = Math.floor((senderBalance.last_send_reset || 0) / (1000 * 60 * 60 * 24));
            
            let dailySent = senderBalance.daily_sent || 0;
            if (today > lastResetDay) {
                dailySent = 0; // Reset daily limit
            }
            
            // Validate and parse amount
            const validation = validateAmount(amountStr, senderBalance.wallet, 1000); // Minimum $1,000
            
            if (!validation.isValid) {
                await interaction.editReply({
                    content: `❌ ${validation.error}`
                });
                return;
            }
            
            const amount = validation.amount;
            
            // Check daily send limit ($45M)
            const DAILY_SEND_LIMIT = 45000000;
            if (dailySent + amount > DAILY_SEND_LIMIT) {
                const remaining = DAILY_SEND_LIMIT - dailySent;
                await interaction.editReply({
                    content: `❌ **Daily Send Limit Reached!**\n\n` +
                            `You can send up to $45M per day.\n` +
                            `Already sent today: ${fmt(dailySent)}\n` +
                            `Remaining today: ${fmt(Math.max(0, remaining))}\n` +
                            `Limit resets at midnight UTC.`
                });
                return;
            }

            // Calculate tax (5% for lottery pool)
            const taxRate = 0.05;
            const taxAmount = Math.floor(amount * taxRate);
            const netAmount = amount - taxAmount; // Amount recipient receives

            // Process the transfer using a transaction
            const transferResult = await this.processMoneyTransfer(
                senderId, 
                targetUser.id, 
                guildId, 
                amount, 
                netAmount, 
                taxAmount,
                interaction,
                dailySent + amount,
                now
            );

            if (transferResult.success) {
                // Get recipient's new balance for display
                const recipientBalance = await dbManager.getUserBalance(targetUser.id, guildId);
                
                // Transfer details in topFields
                const topFields = [{
                    name: '💸 TRANSFER DETAILS',
                    value: `**${interaction.user.displayName}** ➜ **${targetUser.displayName}**\n` +
                           `\`\`\`yaml\nAmount Sent: ${fmt(amount)}\nRecipient Gets: ${fmt(netAmount)}\nTax (5%): ${fmt(taxAmount)}\`\`\``,
                    inline: false
                }];

                // Balance information in bankFields with horizontal layout
                const bankFields = [
                    { name: `${interaction.user.displayName}'s Balance`, value: fmt(transferResult.newSenderBalance), inline: true },
                    { name: `${targetUser.displayName}'s Balance`, value: fmt(recipientBalance.wallet), inline: true },
                    { name: 'Lottery Pool', value: guildId === DESIGNATED_SERVER_ID ? '✅ Tax Added' : '❌ Not Main Server', inline: true }
                ];

                // Stage text for current status
                const stageText = 'TRANSFER COMPLETE';
                
                // Build the embed using gameSessionKit
                const embed = buildSessionEmbed({
                    title: '💸 Money Transfer Successful',
                    topFields,
                    bankFields,
                    stageText,
                    color: 0x00FF00,
                    footer: '💸 SendMoney • 5% tax supports weekly lottery • ATIVE Casino'
                });

                await interaction.editReply({ embeds: [embed] });

                // Log the transfer
                await sendLogMessage(
                    interaction.client,
                    'economy',
                    `Money transfer: ${interaction.user.displayName} sent ${fmt(amount)} to ${targetUser.displayName} (net: ${fmt(netAmount)}, tax: ${fmt(taxAmount)})`,
                    senderId,
                    guildId
                );

                // Try to notify the recipient via DM (optional)
                try {
                    const recipientEmbed = new EmbedBuilder()
                        .setTitle('💰 Money Received!')
                        .setDescription(`${interaction.user.displayName} sent you ${fmt(netAmount)}!`)
                        .addFields(
                            {
                                name: 'Amount Received',
                                value: fmt(netAmount),
                                inline: true
                            },
                            {
                                name: 'From',
                                value: interaction.user.displayName,
                                inline: true
                            }
                        )
                        .setColor(0x00FF00)
                        .setTimestamp();

                    await targetUser.send({ embeds: [recipientEmbed] });
                } catch (dmError) {
                    // If DM fails, it's not critical - just log it
                    logger.info(`Could not DM recipient ${targetUser.id}: ${dmError.message}`);
                }

            } else {
                throw new Error(transferResult.error || 'Transfer failed');
            }

            // Update lottery panel after money transfer (economic activity affects lottery dynamics)
            try {
                const { updateLotteryPanel } = require('../UTILS/lottery');
                if (updateLotteryPanel) {
                    await updateLotteryPanel(interaction.client, guildId);
                    logger.info('Updated lottery panel after money transfer');
                }
            } catch (lotteryError) {
                // Non-critical error - log but don't fail the command
                logger.warn(`Could not update lottery panels: ${lotteryError.message}`);
            }

        } catch (error) {
            logger.error(`Error in sendmoney command: ${error.message}`);
            
            try {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Transfer Failed')
                    .setDescription('An error occurred while processing your money transfer. Please try again.')
                    .setColor(0xFF0000);

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ embeds: [errorEmbed], flags: 64 });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: 64 });
                }
            } catch (replyError) {
                logger.error(`Failed to send error reply in sendmoney command: ${replyError.message}`);
                // Don't rethrow - let global handler deal with it if this fails
            }
        } finally {
            // Always release the transaction lock
            transactionLocks.delete(lockKey);
        }
    },

    /**
     * Process money transfer between users with lottery tax
     */
    async processMoneyTransfer(senderId, recipientId, guildId, grossAmount, netAmount, taxAmount, interaction, newDailySent, timestamp) {
        try {
            // Get both user balances first
            const senderBalance = await dbManager.getUserBalance(senderId, guildId);
            const recipientBalance = await dbManager.getUserBalance(recipientId, guildId);

            // Double-check sender has enough funds
            if (senderBalance.wallet < grossAmount) {
                throw new Error('Insufficient funds');
            }

            // Calculate new balances
            const newSenderWallet = senderBalance.wallet - grossAmount;
            const newRecipientWallet = recipientBalance.wallet + netAmount;

            // Update sender balance with daily send tracking
            const senderUpdateSuccess = await dbManager.updateUserBalance(
                senderId, 
                guildId, 
                -grossAmount, // Deduct from wallet
                0, // No bank change
                {
                    daily_sent: newDailySent,
                    last_send_reset: timestamp
                }
            );

            if (!senderUpdateSuccess) {
                throw new Error('Failed to update sender balance');
            }

            // Update recipient balance
            const recipientUpdateSuccess = await dbManager.updateUserBalance(
                recipientId, 
                guildId, 
                netAmount, // Add to wallet
                0 // No bank change
            );

            if (!recipientUpdateSuccess) {
                // Rollback sender balance if recipient update fails
                await dbManager.updateUserBalance(
                    senderId, 
                    guildId, 
                    grossAmount, // Add back to wallet
                    0, // No bank change
                    {
                        daily_sent: senderBalance.daily_sent || 0, // Reset to original
                        last_send_reset: senderBalance.last_send_reset || 0 // Reset to original
                    }
                );
                throw new Error('Failed to update recipient balance');
            }

            // Add tax to lottery pool (only for designated server)
            if (guildId === DESIGNATED_SERVER_ID && taxAmount > 0) {
                try {
                    await dbManager.addToLotteryPool(guildId, taxAmount);
                    logger.info(`Added ${fmt(taxAmount)} from money transfer to lottery pool`);
                    
                    // Update the lottery panel to reflect the new pool amount
                    const { updateLotteryPanel } = require('../UTILS/lottery');
                    if (updateLotteryPanel) {
                        try {
                            await updateLotteryPanel(interaction.client, guildId);
                            logger.info('Successfully updated lottery panel after money transfer');
                        } catch (panelError) {
                            logger.error(`Failed to update lottery panel: ${panelError.message}`);
                            // Don't fail the transfer if panel update fails
                        }
                    }
                } catch (lotteryError) {
                    logger.error(`Error adding tax to lottery pool: ${lotteryError.message}`);
                    // Don't fail the transfer if lottery tax fails
                }
            }

            return {
                success: true,
                newSenderBalance: newSenderWallet,
                newRecipientBalance: newRecipientWallet
            };

        } catch (error) {
            logger.error(`Error processing money transfer: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
};