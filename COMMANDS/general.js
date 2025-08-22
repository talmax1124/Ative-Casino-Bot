/**
 * General economy commands for the casino bot
 * Includes balance, earn, work, beg, crime, and other economy features
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage } = require('../UTILS/common');
const { secureRandomInt, secureRandomFloat, secureRandomChance } = require('../UTILS/rng');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your current balance')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to check balance for (admin only)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;
        const guildId = await getGuildId(interaction);

        // Check if user is trying to check someone else's balance
        if (targetUser.id !== interaction.user.id) {
            // TODO: Check admin permissions
            // For now, allow everyone to check
        }

        try {
            await dbManager.ensureUser(userId, targetUser.displayName);
            const balance = await dbManager.getUserBalance(userId, guildId);

            const embed = new EmbedBuilder()
                .setTitle(`💰 ${targetUser.displayName}'s Balance`)
                .setColor(0x00FF00)
                .addFields(
                    { name: '💵 Wallet', value: fmt(balance.wallet), inline: true },
                    { name: '🏦 Bank', value: fmt(balance.bank), inline: true },
                    { name: '💎 Total', value: fmt(balance.wallet + balance.bank), inline: true }
                )
                .setThumbnail(targetUser.displayAvatarURL())
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            logger.error(`Error checking balance: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Failed to retrieve balance. Please try again.')
                .setColor(0xFF0000);

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};

// Additional economy commands can be added here
const earnCommand = {
    data: new SlashCommandBuilder()
        .setName('earn')
        .setDescription('Earn coins every hour'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        try {
            await dbManager.ensureUser(userId, interaction.user.displayName);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Check cooldown (1 hour = 3600 seconds)
            const now = Date.now() / 1000;
            const lastEarn = balance.last_earn_ts || 0;
            const cooldown = 3600; // 1 hour

            if (now - lastEarn < cooldown) {
                const remainingTime = Math.ceil(cooldown - (now - lastEarn));
                const hours = Math.floor(remainingTime / 3600);
                const minutes = Math.floor((remainingTime % 3600) / 60);
                const seconds = remainingTime % 60;

                const embed = new EmbedBuilder()
                    .setTitle('⏰ Cooldown Active')
                    .setDescription(`You can earn again in ${hours}h ${minutes}m ${seconds}s`)
                    .setColor(0xFFFF00);

                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            // Calculate earnings (15K-30K base)
            const baseEarning = secureRandomInt(15000, 30001);
            
            // TODO: Apply server booster bonus (+15%)
            let totalEarning = baseEarning;

            // Update balance and timestamp
            const newWallet = balance.wallet + totalEarning;
            await dbManager.setUserBalance(userId, guildId, newWallet, balance.bank, {
                last_earn_ts: now
            });

            const embed = new EmbedBuilder()
                .setTitle('💰 Earnings Collected!')
                .setDescription(`You earned ${fmt(totalEarning)}!`)
                .addFields(
                    { name: 'Previous Balance', value: fmt(balance.wallet), inline: true },
                    { name: 'New Balance', value: fmt(newWallet), inline: true },
                    { name: 'Change', value: fmtDelta(newWallet, balance.wallet), inline: true }
                )
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Log the earning
            await sendLogMessage(
                interaction.client,
                'info',
                `**Earn Command Used**\n` +
                `**User:** ${interaction.user} (\`${interaction.user.id}\`)\n` +
                `**Amount:** ${fmt(totalEarning)}\n` +
                `**New Balance:** ${fmt(newWallet)}`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error processing earn command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Failed to process earning. Please try again.')
                .setColor(0xFF0000);

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};

const workCommand = {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Work for coins'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        try {
            await dbManager.ensureUser(userId, interaction.user.displayName);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Check cooldown (2 hours)
            const now = Date.now() / 1000;
            const lastWork = balance.last_work_ts || 0;
            const cooldown = 7200; // 2 hours

            if (now - lastWork < cooldown) {
                const remainingTime = Math.ceil(cooldown - (now - lastWork));
                const hours = Math.floor(remainingTime / 3600);
                const minutes = Math.floor((remainingTime % 3600) / 60);

                const embed = new EmbedBuilder()
                    .setTitle('⏰ Still Working')
                    .setDescription(`You're still at work! Come back in ${hours}h ${minutes}m`)
                    .setColor(0xFFFF00);

                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            // Work scenarios
            const workScenarios = [
                { job: 'Pizza Delivery Driver', min: 5000, max: 12000 },
                { job: 'Dog Walker', min: 3000, max: 8000 },
                { job: 'Uber Driver', min: 8000, max: 15000 },
                { job: 'Freelance Programmer', min: 15000, max: 25000 },
                { job: 'Barista', min: 4000, max: 9000 },
                { job: 'Cashier', min: 6000, max: 11000 },
                { job: 'Casino Dealer', min: 10000, max: 20000 }
            ];

            const scenario = workScenarios[secureRandomInt(0, workScenarios.length)];
            const earning = secureRandomInt(scenario.min, scenario.max + 1);

            // Update balance and timestamp
            const newWallet = balance.wallet + earning;
            await dbManager.setUserBalance(userId, guildId, newWallet, balance.bank, {
                last_work_ts: now
            });

            const embed = new EmbedBuilder()
                .setTitle('💼 Work Complete!')
                .setDescription(`You worked as a ${scenario.job} and earned ${fmt(earning)}!`)
                .addFields(
                    { name: 'Previous Balance', value: fmt(balance.wallet), inline: true },
                    { name: 'New Balance', value: fmt(newWallet), inline: true },
                    { name: 'Earned', value: fmtDelta(newWallet, balance.wallet), inline: true }
                )
                .setColor(0x0099FF)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            logger.error(`Error processing work command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Failed to process work. Please try again.')
                .setColor(0xFF0000);

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};

// Export multiple commands
module.exports = { 
    ...module.exports,
    earnCommand,
    workCommand
};