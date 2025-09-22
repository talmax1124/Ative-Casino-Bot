/**
 * Basic earn command for simple earnings
 * 15K-30K range with 1 hour cooldown
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage, calculateBoosterBonus } = require('../UTILS/common');
const { secureRandomChoice, secureRandomInt } = require('../UTILS/rng');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const shopManager = require('../UTILS/shopManager');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('earn')
        .setDescription('Basic earning command (15K-30K every hour)'),

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
            const lastEarn = balance.last_earn_ts || 0;
            const cooldown = 3600; // 1 hour

            if (now - lastEarn < cooldown) {
                const remainingTime = Math.ceil(cooldown - (now - lastEarn));
                const hours = Math.floor(remainingTime / 3600);
                const minutes = Math.floor((remainingTime % 3600) / 60);
                const seconds = remainingTime % 60;

                const embed = buildSessionEmbed({
                    title: `💰 ${username}'s Earning Status`,
                    topFields: [
                        { name: '⏰ Already Earned', value: `You already claimed your earnings!\nCome back in ${hours}h ${minutes}m ${seconds}s` }
                    ],
                    stageText: 'ON COOLDOWN',
                    color: 0xFFAA00,
                    footer: 'Earn Command • 1 hour cooldown'
                });

                return await interaction.editReply({ embeds: [embed] });
            }

            // Earn scenarios (15K-30K range)
            const earnScenarios = [
                { source: 'Daily login bonus', min: 15000, max: 25000 },
                { source: 'Found money in couch cushions', min: 15000, max: 20000 },
                { source: 'Cashback reward from purchases', min: 18000, max: 28000 },
                { source: 'Interest from investments', min: 20000, max: 30000 },
                { source: 'Refund from canceled subscription', min: 16000, max: 24000 },
                { source: 'Bonus from loyalty program', min: 17000, max: 26000 },
                { source: 'Gift card you forgot about', min: 15000, max: 22000 }
            ];

            const scenario = secureRandomChoice(earnScenarios);
            const baseEarning = secureRandomInt(scenario.min, scenario.max + 1);

            // Apply shop economy boosts
            const boostResult = await shopManager.applyEconomyBoosts(userId, baseEarning, 'earn');
            const boostedEarning = boostResult.amount;

            // Calculate server booster bonus (5% on boosted earnings)
            const boosterInfo = await calculateBoosterBonus(boostedEarning, interaction.user.id, interaction.guildId, interaction.guild);
            const boosterBonus = boosterInfo.amount;
            const totalEarning = boostedEarning + boosterBonus;

            // Validate and sanitize balance values
            const currentWallet = parseFloat(balance.wallet) || 0;
            const currentBank = parseFloat(balance.bank) || 0;
            
            // Update balance and timestamp
            const newWallet = currentWallet + totalEarning;
            await dbManager.setUserBalance(userId, guildId, newWallet, currentBank, {
                last_earn_ts: now
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
            let stageText = 'EARNINGS COLLECTED';
            
            if (hasShopBoosts && hasServerBoost) {
                titleSuffix = ' (🚀 SUPER BOOSTED)';
                stageText = 'EARNINGS COLLECTED + BOOSTS';
            } else if (hasShopBoosts || hasServerBoost) {
                titleSuffix = ' (🚀 BOOSTED)';
                stageText = 'EARNINGS COLLECTED + BOOST';
            }

            // Earning details in topFields
            const topFields = [{
                name: `💰 EARNINGS COLLECTED${titleSuffix}`,
                value: `**Source:** ${scenario.source}\n` +
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
                    { name: '📅 Next Earn', value: 'In 1 hour', inline: true }
                );
            }
            
            // Build the embed using gameSessionKit
            const embed = buildSessionEmbed({
                title: `💰 ${username}'s Earnings Collected!${titleSuffix}`,
                topFields,
                bankFields,
                stageText,
                color: 0x00CC88,
                footer: '💰 Earn • 1 hour cooldown • ATIVE Casino'
            });

            await interaction.editReply({ embeds: [embed] });

            // Record game result for ML analysis
            try {
                await dbManager.recordGameResult(
                    userId,
                    guildId,
                    'earn',
                    0, // No bet amount for earn
                    totalEarning,
                    true, // Always a "win" when successful
                    {
                        source: scenario.source,
                        baseEarning: baseEarning,
                        shopBoosts: hasShopBoosts,
                        serverBoost: hasServerBoost,
                        boosterBonus: boosterBonus
                    }
                );
            } catch (error) {
                logger.error(`Failed to record earn result: ${error.message}`);
            }

            // Log the earning with boost information
            let logMessage = `Earnings collected: ${username} earned ${fmt(totalEarning)} from ${scenario.source}`;
            
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
            logger.error(`Error processing earn command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Earn Failed',
                topFields: [
                    { name: '🔧 System Error', value: 'Failed to process earnings. Please try again.' }
                ],
                stageText: 'ERROR',
                color: 0xFF0000,
                footer: 'Earn System Error'
            });

            try {
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: 64 });
                }
            } catch (replyError) {
                logger.error(`Failed to send earn error reply: ${replyError.message}`);
            }
        }
    }
};