/**
 * Beg command for earning small amounts of money
 * 5K-50K range with 1 hour cooldown
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage, calculateBoosterBonus } = require('../UTILS/common');
const { secureRandomChoice, secureRandomInt } = require('../UTILS/rng');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const { PayoutManager, GameResult } = require('../UTILS/gameUtils');
const sessionManager = require('../UTILS/sessionManager');
const tuningManager = require('../UTILS/tuningManager');
const logger = require('../UTILS/logger');

const BEG_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

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
        .setName('beg')
        .setDescription('Beg for coins (5K-50K every hour)'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = await getGuildId(interaction);

        try {
            await interaction.deferReply();

            await dbManager.ensureUser(userId, username);
            const balance = await dbManager.getUserBalance(userId, guildId);

            const now = Date.now();
            const lastBegTs = balance.last_beg_ts || 0;
            const cooldownRemaining = (lastBegTs + BEG_COOLDOWN_MS) - now;

            if (cooldownRemaining > 0) {
                const nextAvailable = lastBegTs + BEG_COOLDOWN_MS;
                const cooldownEmbed = buildSessionEmbed({
                    title: `⏳ ${username}, have some dignity!`,
                    topFields: [
                        {
                            name: 'Cooldown Active',
                            value: `You can beg again in **${formatCooldown(cooldownRemaining)}** (<t:${Math.floor(nextAvailable / 1000)}:R>).`,
                            inline: false
                        }
                    ],
                    bankFields: [
                        {
                            name: 'Last Beg',
                            value: lastBegTs > 0 ? `<t:${Math.floor(lastBegTs / 1000)}:R>` : 'No history',
                            inline: true
                        },
                        {
                            name: 'Wallet',
                            value: fmt(balance.wallet || 0),
                            inline: true
                        },
                        {
                            name: 'Next Beg',
                            value: `<t:${Math.floor(nextAvailable / 1000)}:R>`,
                            inline: true
                        }
                    ],
                    stageText: 'TOO SOON',
                    color: 0xFFA726,
                    footer: 'Beg Cooldown'
                });

                await interaction.editReply({ embeds: [cooldownEmbed] });
                return;
            }

            // Beg scenarios (5K-50K range)
            const begScenarios = [
                { person: 'a kind stranger', message: 'gave you some spare change', min: 5000, max: 15000 },
                { person: 'a wealthy businessman', message: 'tossed you a few bills', min: 10000, max: 25000 },
                { person: 'a generous tourist', message: 'shared their winnings', min: 7500, max: 20000 },
                { person: 'a casino patron', message: 'felt lucky and shared', min: 15000, max: 40000 },
                { person: 'a food truck owner', message: 'gave you their tips', min: 6000, max: 17500 },
                { person: 'a street performer', message: 'shared their earnings', min: 5000, max: 12500 },
                { person: 'a casino winner', message: 'shared their jackpot', min: 25000, max: 50000 }
            ];

            const scenario = secureRandomChoice(begScenarios);
            const baseEarning = secureRandomInt(scenario.min, scenario.max + 1);

            // Apply tuning manager adjustments for fair gameplay
            const tuningAdjustment = await tuningManager.getAdjustedPayout('beg', baseEarning, 0);
            const adjustedEarning = tuningAdjustment.adjustedPayout;

            // Calculate server booster bonus (5%) on adjusted amount
            const boosterInfo = await calculateBoosterBonus(adjustedEarning, interaction.user.id, interaction.guildId, interaction.guild);
            const boosterBonus = boosterInfo.amount;
            const totalEarning = adjustedEarning + boosterBonus;

            // Create game result object for payout processing
            const gameResult = new GameResult({
                gameType: 'beg',
                userId: userId,
                guildId: guildId,
                betAmount: 0, // No bet for begging
                payout: totalEarning,
                won: true,
                metadata: {
                    scenario: scenario.person,
                    baseEarning: adjustedEarning,
                    boosterBonus: boosterBonus,
                    isBooster: boosterInfo.isBooster,
                    tuningMultiplier: (1 + tuningAdjustment.payoutDelta)
                }
            });

            // Process payout through modern payout manager
            const payoutResult = await PayoutManager.processGamePayout(gameResult, interaction);
            
            // Update balance with beg timestamp
            const updateSuccess = await dbManager.updateUserBalance(
                userId,
                guildId,
                totalEarning,
                0,
                { last_beg_ts: now }
            );

            if (!updateSuccess) {
                throw new Error('Failed to update balance for beg payout');
            }

            // Refresh balance for accurate display
            let refreshedBalance = null;
            try {
                refreshedBalance = await dbManager.getUserBalance(userId, guildId);
            } catch (refreshError) {
                logger.warn(`Could not refresh balance after beg: ${refreshError.message}`);
            }

            const newWallet = refreshedBalance ? (parseFloat(refreshedBalance.wallet) || balance.wallet + totalEarning) : (balance.wallet + totalEarning);


            // Build earnings display with tuning and booster bonus if applicable
            let earningsDisplay = `+ Base Received: ${fmt(tuningAdjustment.originalPayout)}`;
            if (tuningAdjustment.payoutDelta !== 0) {
                const adjustmentPercent = (tuningAdjustment.payoutDelta * 100).toFixed(1);
                earningsDisplay += `\n+ Tuning Adjustment: ${adjustmentPercent > 0 ? '+' : ''}${adjustmentPercent}%`;
            }
            if (boosterInfo.isBooster && boosterBonus > 0) {
                earningsDisplay += `\n+ Booster Bonus (5%): ${fmt(boosterBonus)}`;
                earningsDisplay += `\n= Total Received: ${fmt(totalEarning)}`;
            }

            // Begging details in topFields
            const topFields = [{
                name: boosterInfo.isBooster ? '🤲 BEGGING SUCCESS (🚀 BOOSTED)' : '🤲 BEGGING SUCCESS',
                value: `**${scenario.person}** ${scenario.message}\n` +
                       `\`\`\`diff\n${earningsDisplay}\n  Previous: ${fmt(balance.wallet)}\n+ New Balance: ${fmt(newWallet)}\`\`\``,
                inline: false
            }];

            // Balance information in bankFields
            const bankFields = [
                { name: 'Amount Received', value: fmt(totalEarning), inline: true },
                { name: 'Current Balance', value: fmt(newWallet), inline: true },
                { name: boosterInfo.isBooster ? '🚀 Booster Status' : 'Beg Status', value: boosterInfo.isBooster ? 'Active (+5%)' : 'Ready to beg again!', inline: true }
            ];

            // Stage text for current status
            const stageText = 'BEGGING SUCCESS';
            
            // Build the embed using gameSessionKit
            const embed = buildSessionEmbed({
                title: `🤲 ${username}'s Begging Success!`,
                topFields,
                bankFields,
                stageText,
                color: 0x32CD32,
                footer: '🤲 Beg • 1 hour cooldown • ATIVE Casino'
            });

            await interaction.editReply({ embeds: [embed] });

            // End session with success result
            try {
                await sessionManager.endSession(interaction.user.id, {
                    type: 'beg',
                    result: 'success',
                    earning: totalEarning,
                    scenario: scenario.person
                });
            } catch (error) {
                logger.error(`Failed to end beg session: ${error.message}`);
            }

            // Record game result for ML analysis
            try {
                await dbManager.recordGameResult(
                    userId,
                    guildId,
                    'beg',
                    true, // Always a "win" when successful
                    0, // No bet amount for begging
                    totalEarning,
                    {
                        scenario: scenario.person,
                        baseEarning: baseEarning,
                        boosterBonus: boosterBonus,
                        isBooster: boosterInfo.isBooster
                    }
                );
            } catch (error) {
                logger.error(`Failed to record beg result: ${error.message}`);
            }

            // Log the begging
            const logMessage = boosterInfo.isBooster 
                ? `Beg success (BOOSTED): ${username} received ${fmt(totalEarning)} (base: ${fmt(baseEarning)} + boost: ${fmt(boosterBonus)}) from ${scenario.person} - Balance: ${fmt(newWallet)}`
                : `Beg success: ${username} received ${fmt(totalEarning)} from ${scenario.person} - Balance: ${fmt(newWallet)}`;
            
            await sendLogMessage(
                interaction.client,
                'economy',
                logMessage,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error processing beg command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Begging Failed',
                topFields: [
                    { name: '🔧 System Error', value: 'Something went wrong while begging. Please try again.' }
                ],
                stageText: 'ERROR',
                color: 0xFF0000,
                footer: 'Beg System Error'
            });

            try {
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: 64 });
                }
            } catch (replyError) {
                logger.error(`Failed to send beg error reply: ${replyError.message}`);
            }
        }
    }
};