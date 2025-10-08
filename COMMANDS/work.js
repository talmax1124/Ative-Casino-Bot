/**
 * Work command for earning money through various jobs
 * 5K-30K range with 1 hour cooldown
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage, calculateBoosterBonus } = require('../UTILS/common');
const { secureRandomChoice, secureRandomInt } = require('../UTILS/rng');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
// Removed global earnings cooldown - commands now run independently
const shopManager = require('../UTILS/shopManager');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Work for coins (25K-150K every hour)'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = await getGuildId(interaction);

        try {
            await interaction.deferReply();

            await dbManager.ensureUser(userId, username);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Independent cooldown - no global restriction

            // Check work-specific cooldown (1 hour)
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

            // Work scenarios (25K-150K range)
            const workScenarios = [
                { job: 'Pizza Delivery Driver', min: 25000, max: 60000 },
                { job: 'Dog Walker', min: 25000, max: 40000 },
                { job: 'Uber Driver', min: 40000, max: 75000 },
                { job: 'Freelance Programmer', min: 75000, max: 150000 },
                { job: 'Barista', min: 25000, max: 45000 },
                { job: 'Cashier', min: 30000, max: 55000 },
                { job: 'Casino Dealer', min: 50000, max: 125000 },
                { job: 'Construction Worker', min: 60000, max: 110000 },
                { job: 'Delivery Driver', min: 40000, max: 90000 }
            ];

            const scenario = secureRandomChoice(workScenarios);
            const baseEarning = secureRandomInt(scenario.min, scenario.max + 1);

            // Apply shop economy boosts
            const boostResult = await shopManager.applyEconomyBoosts(userId, baseEarning, 'work');
            const boostedEarning = boostResult.amount;

            // Calculate server booster bonus (5% on boosted earnings) - guild-specific
            const boosterInfo = await calculateBoosterBonus(boostedEarning, interaction.user.id, interaction.guildId, interaction.guild);
            const boosterBonus = boosterInfo.amount;
            const totalEarning = boostedEarning + boosterBonus;

            // Validate and sanitize balance values
            const currentWallet = parseFloat(balance.wallet) || 0;
            const currentBank = parseFloat(balance.bank) || 0;
            
            // Update balance and timestamp
            const newWallet = currentWallet + totalEarning;
            await dbManager.setUserBalance(userId, guildId, newWallet, currentBank, {
                last_work_ts: now
            });

            // Build earnings display with shop and server boosts
            const hasShopBoosts = boostResult.boosted;
            const hasServerBoost = boosterInfo.isBooster && boosterBonus > 0;
            const boostDisplay = shopManager.formatBoostInfo(boostResult.boosts);

            let earningsDisplay = `+ Base Earnings: ${fmt(baseEarning)}`;
            
            if (hasShopBoosts) {
                earningsDisplay += `\n+ Shop Boost: ${fmt(boostedEarning - baseEarning)}${boostDisplay}`;
            }
            
            if (hasServerBoost) {
                earningsDisplay += `\n+ Server Boost (5%): ${fmt(boosterBonus)}`;
            }
            
            earningsDisplay += `\n= Total Earned: ${fmt(totalEarning)}`;

            // Determine title and stage text based on active boosts
            let titleSuffix = '';
            let stageText = 'WORK COMPLETE';
            
            if (hasShopBoosts && hasServerBoost) {
                titleSuffix = ' (🚀 SUPER BOOSTED)';
                stageText = 'WORK COMPLETE + BOOSTS';
            } else if (hasShopBoosts || hasServerBoost) {
                titleSuffix = ' (🚀 BOOSTED)';
                stageText = 'WORK COMPLETE + BOOST';
            }

            // Work details in topFields
            const topFields = [{
                name: `💼 WORK COMPLETED${titleSuffix}`,
                value: `**Job:** ${scenario.job}\n` +
                       `\`\`\`diff\n${earningsDisplay}\n  Previous: ${fmt(currentWallet)}\n+ New Balance: ${fmt(newWallet)}\`\`\``,
                inline: false
            }];

            // Balance information in bankFields  
            const bankFields = [];
            
            if (hasShopBoosts && hasServerBoost) {
                // Both shop and server boosts
                bankFields.push(
                    { name: '💎 Total Earned', value: `${fmt(totalEarning)}${boostDisplay} + 🚀 +${fmt(boosterBonus)}`, inline: true },
                    { name: '💵 New Balance', value: fmt(newWallet), inline: true },
                    { name: '🎯 Boosts Active', value: `Shop${boostDisplay} + Server (+5%)`, inline: true }
                );
            } else if (hasShopBoosts) {
                // Shop boosts only
                bankFields.push(
                    { name: '💎 Total Earned', value: `${fmt(totalEarning)}${boostDisplay}`, inline: true },
                    { name: '💵 New Balance', value: fmt(newWallet), inline: true },
                    { name: '🚀 Shop Boosts', value: boostDisplay.trim(), inline: true }
                );
            } else if (hasServerBoost) {
                // Server boost only
                bankFields.push(
                    { name: '💎 Total Earned', value: `${fmt(totalEarning)} (🚀 +${fmt(boosterBonus)})`, inline: true },
                    { name: '💵 New Balance', value: fmt(newWallet), inline: true },
                    { name: '🚀 Boost Active', value: 'Server (+5%)', inline: true }
                );
            } else {
                // No boosts
                bankFields.push(
                    { name: '💎 Total Earned', value: fmt(totalEarning), inline: true },
                    { name: '💵 New Balance', value: fmt(newWallet), inline: true },
                    { name: '📅 Next Work', value: 'In 1 hour', inline: true }
                );
            }
            
            // Build the embed using gameSessionKit
            const embed = buildSessionEmbed({
                title: `💼 ${username}'s Work Complete!${titleSuffix}`,
                topFields,
                bankFields,
                stageText,
                color: 0x0099FF,
                footer: '💼 Work • 1 hour cooldown • ATIVE Casino'
            });

            await interaction.editReply({ embeds: [embed] });

            // Record game result for ML analysis
            try {
                await dbManager.recordGameResult(
                    userId,
                    guildId,
                    'work',
                    true, // Always a "win" when successful
                    0, // No bet amount for work
                    totalEarning,
                    {
                        job: scenario.job,
                        baseEarning: baseEarning,
                        shopBoosts: hasShopBoosts,
                        serverBoost: hasServerBoost,
                        boosterBonus: boosterBonus
                    }
                );
            } catch (error) {
                logger.error(`Failed to record work result: ${error.message}`);
            }

            // Log the work with boost information
            let logMessage = `Work completed: ${username} worked as ${scenario.job} and earned ${fmt(totalEarning)}`;
            
            if (hasShopBoosts) {
                logMessage += ` (Shop boost: ${fmt(baseEarning)} -> ${fmt(boostedEarning)})`;
            }
            
            if (hasServerBoost) {
                logMessage += ` (Server boost: +${fmt(boosterBonus)})`;
            }
            
            logMessage += ` - Balance: ${fmt(newWallet)}`;
            
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