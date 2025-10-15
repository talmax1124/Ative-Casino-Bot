/**
 * Work command for earning money through various jobs
 * 5K-30K range with 1 hour cooldown
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage, calculateBoosterBonus } = require('../UTILS/common');
const { secureRandomChoice, secureRandomInt } = require('../UTILS/rng');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const shopManager = require('../UTILS/shopManager');
const logger = require('../UTILS/logger');

const WORK_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

function formatCooldown(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (hours === 0 && seconds > 0) parts.push(`${seconds}s`);

    return parts.length > 0 ? parts.join(' ') : '0s';
}

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

            const now = Date.now();
            const lastWorkTs = balance.last_work_ts || 0;
            const cooldownRemaining = (lastWorkTs + WORK_COOLDOWN_MS) - now;

            if (cooldownRemaining > 0) {
                const nextAvailable = lastWorkTs + WORK_COOLDOWN_MS;
                const cooldownEmbed = buildSessionEmbed({
                    title: `⏳ ${username}, take a break!`,
                    topFields: [
                        {
                            name: 'Cooldown Active',
                            value: `You can work again in **${formatCooldown(cooldownRemaining)}** (<t:${Math.floor(nextAvailable / 1000)}:R>).`,
                            inline: false
                        }
                    ],
                    bankFields: [
                        {
                            name: 'Last Shift',
                            value: lastWorkTs > 0 ? `<t:${Math.floor(lastWorkTs / 1000)}:R>` : 'No history',
                            inline: true
                        },
                        {
                            name: 'Wallet',
                            value: fmt(balance.wallet || 0),
                            inline: true
                        },
                        {
                            name: 'Next Shift',
                            value: `<t:${Math.floor(nextAvailable / 1000)}:R>`,
                            inline: true
                        }
                    ],
                    stageText: 'ON BREAK',
                    color: 0xFFA726,
                    footer: 'Work Cooldown'
                });

                await interaction.editReply({ embeds: [cooldownEmbed] });
                return;
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

            const updateSuccess = await dbManager.updateUserBalance(
                userId,
                guildId,
                totalEarning,
                0,
                { last_work_ts: now }
            );

            if (!updateSuccess) {
                throw new Error('Failed to update balance for work payout');
            }

            // Refresh balance for accurate display
            let refreshedBalance = null;
            try {
                refreshedBalance = await dbManager.getUserBalance(userId, guildId);
            } catch (refreshError) {
                logger.warn(`Could not refresh balance after work: ${refreshError.message}`);
            }

            const newWallet = refreshedBalance ? (parseFloat(refreshedBalance.wallet) || currentWallet + totalEarning) : (currentWallet + totalEarning);
            const nextShiftTs = now + WORK_COOLDOWN_MS;

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
                    { name: '🎯 Boosts Active', value: `Shop${boostDisplay} + Server (+5%)`, inline: true },
                    { name: '⏱️ Next Shift', value: `<t:${Math.floor(nextShiftTs / 1000)}:R>`, inline: true }
                );
            } else if (hasShopBoosts) {
                // Shop boosts only
                bankFields.push(
                    { name: '💎 Total Earned', value: `${fmt(totalEarning)}${boostDisplay}`, inline: true },
                    { name: '💵 New Balance', value: fmt(newWallet), inline: true },
                    { name: '🚀 Shop Boosts', value: boostDisplay.trim(), inline: true },
                    { name: '⏱️ Next Shift', value: `<t:${Math.floor(nextShiftTs / 1000)}:R>`, inline: true }
                );
            } else if (hasServerBoost) {
                // Server boost only
                bankFields.push(
                    { name: '💎 Total Earned', value: `${fmt(totalEarning)} (🚀 +${fmt(boosterBonus)})`, inline: true },
                    { name: '💵 New Balance', value: fmt(newWallet), inline: true },
                    { name: '🚀 Boost Active', value: 'Server (+5%)', inline: true },
                    { name: '⏱️ Next Shift', value: `<t:${Math.floor(nextShiftTs / 1000)}:R>`, inline: true }
                );
            } else {
                // No boosts
                bankFields.push(
                    { name: '💎 Total Earned', value: fmt(totalEarning), inline: true },
                    { name: '💵 New Balance', value: fmt(newWallet), inline: true },
                    { name: '⏱️ Next Shift', value: `<t:${Math.floor(nextShiftTs / 1000)}:R>`, inline: true }
                );
            }
            
            // Build the embed using gameSessionKit
            const embed = buildSessionEmbed({
                title: `💼 ${username}'s Work Complete!${titleSuffix}`,
                topFields,
                bankFields,
                stageText,
                color: 0x0099FF,
                footer: '💼 Work • ATIVE Casino'
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
