/**
 * Send Money command for the casino bot
 * Allows users to transfer money to each other with 5% tax going to lottery pool
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const { DESIGNATED_SERVER_ID } = require('../UTILS/lottery');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sendmoney')
        .setDescription('Send money to another user (5% tax goes to lottery pool)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to send money to')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to send (minimum $1,000)')
                .setRequired(true)
                .setMinValue(1000)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const senderId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        // Check if user is trying to send money to themselves
        if (targetUser.id === senderId) {
            await interaction.reply({
                content: '❌ You cannot send money to yourself!',
                ephemeral: true
            });
            return;
        }

        // Check if target is a bot
        if (targetUser.bot) {
            await interaction.reply({
                content: '❌ You cannot send money to bots!',
                ephemeral: true
            });
            return;
        }

        try {
            // Ensure both users exist in database
            await dbManager.ensureUser(senderId, interaction.user.displayName);
            await dbManager.ensureUser(targetUser.id, targetUser.displayName);

            // Get sender's balance
            const senderBalance = await dbManager.getUserBalance(senderId, guildId);
            
            // Check if sender has enough money
            if (senderBalance.wallet < amount) {
                await interaction.reply({
                    content: `❌ Insufficient funds! You need ${fmt(amount)} but only have ${fmt(senderBalance.wallet)} in your wallet.`,
                    ephemeral: true
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
                taxAmount
            );

            if (transferResult.success) {
                // Get recipient's new balance for display
                const recipientBalance = await dbManager.getUserBalance(targetUser.id, guildId);
                
                // Use gameSessionKit for consistent UI styling
                const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
                
                // Transfer details in topFields
                const topFields = [{
                    name: '💸 TRANSFER DETAILS',
                    value: `**${interaction.user.displayName}** ➜ **${targetUser.displayName}**\n` +
                           `\`\`\`fix\nAmount Sent: ${fmt(amount)}    Recipient Gets: ${fmt(netAmount)}    Tax (5%): ${fmt(taxAmount)}\`\`\``,
                    inline: false
                }];

                // Balance information in bankFields with horizontal layout
                const bankFields = [
                    { name: `${interaction.user.displayName}'s Balance`, value: fmt(transferResult.newSenderBalance), inline: true },
                    { name: `${targetUser.displayName}'s Balance`, value: fmt(recipientBalance.wallet), inline: true },
                    { name: 'Lottery Pool', value: guildId === DESIGNATED_SERVER_ID ? '✅ Tax Added' : '❌ Main Server Only', inline: true }
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

                await interaction.reply({ embeds: [embed] });

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

        } catch (error) {
            logger.error(`Error in sendmoney command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Transfer Failed')
                .setDescription('An error occurred while processing your money transfer. Please try again.')
                .setColor(0xFF0000);

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },

    /**
     * Process money transfer between users with lottery tax
     */
    async processMoneyTransfer(senderId, recipientId, guildId, grossAmount, netAmount, taxAmount) {
        try {
            // Use Firestore transaction to ensure atomicity
            const senderRef = dbManager.db.collection('user_balances').doc(senderId);
            const recipientRef = dbManager.db.collection('user_balances').doc(recipientId);

            const result = await dbManager.db.runTransaction(async (transaction) => {
                // Get both user balances
                const senderDoc = await transaction.get(senderRef);
                const recipientDoc = await transaction.get(recipientRef);

                if (!senderDoc.exists || !recipientDoc.exists) {
                    throw new Error('User not found in database');
                }

                const senderData = senderDoc.data();
                const recipientData = recipientDoc.data();

                // Double-check sender has enough funds
                if (senderData.wallet < grossAmount) {
                    throw new Error('Insufficient funds');
                }

                // Update balances
                const newSenderWallet = senderData.wallet - grossAmount;
                const newRecipientWallet = recipientData.wallet + netAmount;

                // Update sender
                transaction.update(senderRef, {
                    wallet: newSenderWallet,
                    updated_at: new Date()
                });

                // Update recipient
                transaction.update(recipientRef, {
                    wallet: newRecipientWallet,
                    updated_at: new Date()
                });

                return {
                    newSenderBalance: newSenderWallet,
                    newRecipientBalance: newRecipientWallet
                };
            });

            // Add tax to lottery pool (only for designated server)
            if (guildId === DESIGNATED_SERVER_ID && taxAmount > 0) {
                try {
                    // Get lottery game instance from client if available
                    const client = require('../index.js'); // This might need adjustment
                    if (client.lotteryGame) {
                        await client.lotteryGame.processMoneySendTax(guildId, taxAmount);
                    } else {
                        // Fallback direct database call
                        await dbManager.addToLotteryPool(guildId, taxAmount);
                    }
                    logger.info(`Added ${taxAmount} from money transfer to lottery pool`);
                } catch (lotteryError) {
                    logger.error(`Error adding tax to lottery pool: ${lotteryError.message}`);
                    // Don't fail the transfer if lottery tax fails
                }
            }

            return {
                success: true,
                newSenderBalance: result.newSenderBalance,
                newRecipientBalance: result.newRecipientBalance
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