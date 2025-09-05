/**
 * Work command for earning money through various jobs
 * 5K-30K range with 1 hour cooldown
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage, calculateBoosterBonus } = require('../UTILS/common');
const { secureRandomInt } = require('../UTILS/rng');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Work for coins (5K-30K every hour)'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = await getGuildId(interaction);

        try {
            await interaction.deferReply();

            await dbManager.ensureUser(userId, username);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Check cooldown (1 hour)
            const now = Date.now() / 1000;
            const lastWork = balance.last_work_ts || 0;
            const cooldown = 3600; // 1 hour

            if (now - lastWork < cooldown) {
                const remainingTime = Math.ceil(cooldown - (now - lastWork));
                const hours = Math.floor(remainingTime / 3600);
                const minutes = Math.floor((remainingTime % 3600) / 60);
                const seconds = remainingTime % 60;

                const embed = buildSessionEmbed({
                    title: `💼 ${username}'s Work Status`,
                    topFields: [
                        { name: '⏰ Still Working', value: `You're still at work!\nCome back in ${hours}h ${minutes}m ${seconds}s` }
                    ],
                    stageText: 'WORK IN PROGRESS',
                    color: 0xFFAA00,
                    footer: 'Work Command • 1 hour cooldown'
                });

                return await interaction.editReply({ embeds: [embed] });
            }

            // Work scenarios (5K-30K range)
            const workScenarios = [
                { job: 'Pizza Delivery Driver', min: 5000, max: 12000 },
                { job: 'Dog Walker', min: 5000, max: 8000 },
                { job: 'Uber Driver', min: 8000, max: 15000 },
                { job: 'Freelance Programmer', min: 15000, max: 30000 },
                { job: 'Barista', min: 5000, max: 9000 },
                { job: 'Cashier', min: 6000, max: 11000 },
                { job: 'Casino Dealer', min: 10000, max: 25000 },
                { job: 'Construction Worker', min: 12000, max: 22000 },
                { job: 'Delivery Driver', min: 8000, max: 18000 }
            ];

            const scenario = workScenarios[secureRandomInt(0, workScenarios.length)];
            const baseEarning = secureRandomInt(scenario.min, scenario.max + 1);

            // Calculate server booster bonus (2%)
            const boosterInfo = calculateBoosterBonus(baseEarning, interaction.member);
            const boosterBonus = boosterInfo.amount;
            const totalEarning = baseEarning + boosterBonus;

            // Validate and sanitize balance values
            const currentWallet = parseFloat(balance.wallet) || 0;
            const currentBank = parseFloat(balance.bank) || 0;
            
            // Update balance and timestamp
            const newWallet = currentWallet + totalEarning;
            await dbManager.setUserBalance(userId, guildId, newWallet, currentBank, {
                last_work_ts: now
            });

            // Build earnings display with booster bonus if applicable
            let earningsDisplay = `+ Earnings: ${fmt(baseEarning)}`;
            if (boosterInfo.isBooster && boosterBonus > 0) {
                earningsDisplay += `\n+ Booster Bonus (2%): ${fmt(boosterBonus)}`;
                earningsDisplay += `\n= Total Earned: ${fmt(totalEarning)}`;
            }

            // Work details in topFields
            const topFields = [{
                name: boosterInfo.isBooster ? '💼 WORK COMPLETED (🚀 BOOSTED)' : '💼 WORK COMPLETED',
                value: `**Job:** ${scenario.job}\n` +
                       `\`\`\`diff\n${earningsDisplay}\n  Previous: ${fmt(currentWallet)}\n+ New Balance: ${fmt(newWallet)}\`\`\``,
                inline: false
            }];

            // Balance information in bankFields
            const bankFields = [
                { name: 'Amount Earned', value: fmt(totalEarning), inline: true },
                { name: 'Current Balance', value: fmt(newWallet), inline: true },
                { name: boosterInfo.isBooster ? '🚀 Booster Status' : 'Next Work Available', value: boosterInfo.isBooster ? 'Active (+2%)' : 'In 1 hour', inline: true }
            ];

            // Stage text for current status
            const stageText = 'WORK COMPLETE';
            
            // Build the embed using gameSessionKit
            const embed = buildSessionEmbed({
                title: `💼 ${username}'s Work Complete!`,
                topFields,
                bankFields,
                stageText,
                color: 0x0099FF,
                footer: '💼 Work • 1 hour cooldown • ATIVE Casino'
            });

            await interaction.editReply({ embeds: [embed] });

            // Log the work
            const logMessage = boosterInfo.isBooster 
                ? `Work completed (BOOSTED): ${username} worked as ${scenario.job} and earned ${fmt(totalEarning)} (base: ${fmt(baseEarning)} + boost: ${fmt(boosterBonus)}) - Balance: ${fmt(newWallet)}`
                : `Work completed: ${username} worked as ${scenario.job} and earned ${fmt(totalEarning)} - Balance: ${fmt(newWallet)}`;
            
            await sendLogMessage(
                interaction.client,
                'economy',
                logMessage,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error processing work command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Work Failed',
                topFields: [
                    { name: '🔧 System Error', value: 'Failed to process work. Please try again.' }
                ],
                stageText: 'ERROR',
                color: 0xFF0000,
                footer: 'Work System Error'
            });

            try {
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: 64 });
                }
            } catch (replyError) {
                logger.error(`Failed to send work error reply: ${replyError.message}`);
            }
        }
    }
};