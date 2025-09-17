const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/databaseAdapter');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const { validateAmount } = require('../UTILS/moneyFormatter');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shared-bank')
        .setDescription('Manage your marriage shared bank account')
        .addSubcommand(subcommand =>
            subcommand
                .setName('balance')
                .setDescription('Check your shared bank balance')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('deposit')
                .setDescription('Deposit money into shared bank')
                .addStringOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to deposit (supports K/M/B/T, "all", "half")')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('withdraw')
                .setDescription('Withdraw money from shared bank')
                .addStringOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to withdraw (supports K/M/B/T, "all", "half")')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        await interaction.deferReply();

        try {
            // Check if user is married
            const marriageData = await dbManager.getUserMarriage(userId, guildId);

            if (!marriageData.married) {
                await interaction.editReply({
                    content: '❌ You need to be married to use the shared bank! Use `/propose` to start your love story.'
                });
                return;
            }

            const marriage = marriageData.marriage;

            switch (subcommand) {
                case 'balance':
                    await this.handleBalance(interaction, marriage);
                    break;
                case 'deposit':
                    await this.handleDeposit(interaction, userId, guildId, marriage);
                    break;
                case 'withdraw':
                    await this.handleWithdraw(interaction, userId, guildId, marriage);
                    break;
            }

        } catch (error) {
            logger.error(`Error in shared-bank command: ${error.message}`);
            
            await interaction.editReply({
                content: '❌ An error occurred while managing your shared bank. Please try again later.'
            });
        }
    },

    async handleBalance(interaction, marriage) {
        const balanceEmbed = new EmbedBuilder()
            .setTitle('💰 Shared Bank Account')
            .setDescription(`**${marriage.partner1_name}** & **${marriage.partner2_name}**`)
            .addFields(
                {
                    name: '💳 Current Balance',
                    value: fmt(marriage.shared_bank),
                    inline: true
                },
                {
                    name: '📊 Account Status',
                    value: 'Active',
                    inline: true
                },
                {
                    name: '👫 Account Holders',
                    value: `• ${marriage.partner1_name}\n• ${marriage.partner2_name}`,
                    inline: false
                },
                {
                    name: '💡 Tips',
                    value: '• Both partners can deposit and withdraw\n• Use `/shared-bank deposit` to add funds\n• Use `/shared-bank withdraw` to take funds\n• No transaction fees between spouses',
                    inline: false
                }
            )
            .setColor(0x00D4AA)
            .setTimestamp()
            .setFooter({ text: '💒 ATIVE Casino Marriage Banking' });

        await interaction.editReply({ embeds: [balanceEmbed] });
    },

    async handleDeposit(interaction, userId, guildId, marriage) {
        const amountStr = interaction.options.getString('amount');
        
        // Get user's balance
        const userBalance = await dbManager.getUserBalance(userId, guildId);
        
        // Validate amount
        const validation = validateAmount(amountStr, userBalance.wallet, 100); // Minimum $100
        
        if (!validation.isValid) {
            await interaction.editReply({
                content: `❌ ${validation.error}`
            });
            return;
        }
        
        const amount = validation.amount;

        // Process the deposit
        const result = await dbManager.transferToSharedBank(userId, guildId, amount);

        if (!result.success) {
            await interaction.editReply({
                content: `❌ Deposit failed: ${result.error}`
            });
            return;
        }

        // Success embed
        const depositEmbed = new EmbedBuilder()
            .setTitle('💰 Deposit Successful')
            .setDescription(`**${interaction.user.displayName}** deposited ${fmt(amount)} into the shared bank!`)
            .addFields(
                {
                    name: '💳 New Shared Balance',
                    value: fmt(result.newSharedBalance),
                    inline: true
                },
                {
                    name: '💸 Amount Deposited',
                    value: fmt(amount),
                    inline: true
                },
                {
                    name: '💼 Your New Wallet',
                    value: fmt(userBalance.wallet - amount),
                    inline: true
                }
            )
            .setColor(0x00FF00)
            .setTimestamp()
            .setFooter({ text: '💒 ATIVE Casino Marriage Banking' });

        await interaction.editReply({ embeds: [depositEmbed] });

        // Log the deposit
        await sendLogMessage(
            interaction.client,
            'economy',
            `Shared bank deposit: ${interaction.user.displayName} deposited ${fmt(amount)}`,
            userId,
            guildId
        );

        // Notify partner
        try {
            const partner = await interaction.client.users.fetch(marriage.partnerId);
            await partner.send(`💰 Your spouse **${interaction.user.displayName}** deposited ${fmt(amount)} into your shared bank account!\n\nNew balance: ${fmt(result.newSharedBalance)}`);
        } catch (dmError) {
            logger.info(`Could not notify partner of deposit: ${dmError.message}`);
        }
    },

    async handleWithdraw(interaction, userId, guildId, marriage) {
        const amountStr = interaction.options.getString('amount');
        
        // Validate amount against shared bank balance
        const validation = validateAmount(amountStr, marriage.shared_bank, 100); // Minimum $100
        
        if (!validation.isValid) {
            await interaction.editReply({
                content: `❌ ${validation.error}`
            });
            return;
        }
        
        const amount = validation.amount;

        // Process the withdrawal
        const result = await dbManager.withdrawFromSharedBank(userId, guildId, amount);

        if (!result.success) {
            await interaction.editReply({
                content: `❌ Withdrawal failed: ${result.error}`
            });
            return;
        }

        // Get updated user balance
        const userBalance = await dbManager.getUserBalance(userId, guildId);

        // Success embed
        const withdrawEmbed = new EmbedBuilder()
            .setTitle('💰 Withdrawal Successful')
            .setDescription(`**${interaction.user.displayName}** withdrew ${fmt(amount)} from the shared bank!`)
            .addFields(
                {
                    name: '💳 New Shared Balance',
                    value: fmt(result.newSharedBalance),
                    inline: true
                },
                {
                    name: '💸 Amount Withdrawn',
                    value: fmt(amount),
                    inline: true
                },
                {
                    name: '💼 Your New Wallet',
                    value: fmt(userBalance.wallet),
                    inline: true
                }
            )
            .setColor(0xFF9500)
            .setTimestamp()
            .setFooter({ text: '💒 ATIVE Casino Marriage Banking' });

        await interaction.editReply({ embeds: [withdrawEmbed] });

        // Log the withdrawal
        await sendLogMessage(
            interaction.client,
            'economy',
            `Shared bank withdrawal: ${interaction.user.displayName} withdrew ${fmt(amount)}`,
            userId,
            guildId
        );

        // Notify partner
        try {
            const partner = await interaction.client.users.fetch(marriage.partnerId);
            await partner.send(`💸 Your spouse **${interaction.user.displayName}** withdrew ${fmt(amount)} from your shared bank account.\n\nRemaining balance: ${fmt(result.newSharedBalance)}`);
        } catch (dmError) {
            logger.info(`Could not notify partner of withdrawal: ${dmError.message}`);
        }
    }
};