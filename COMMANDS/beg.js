/**
 * Beg command for earning small amounts of money
 * 1K-10K range with 1 hour cooldown
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage, calculateBoosterBonus } = require('../UTILS/common');
const { secureRandomChoice, secureRandomInt } = require('../UTILS/rng');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
// Removed global earnings cooldown - commands now run independently
const { PayoutManager, GameResult } = require('../UTILS/gameUtils');
const sessionManager = require('../UTILS/sessionManager');
const tuningManager = require('../UTILS/tuningManager');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('Beg for coins (1K-10K every hour)'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = await getGuildId(interaction);

        try {
            await interaction.deferReply();

            await dbManager.ensureUser(userId, username);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Independent cooldown - no global restriction

            // Check beg-specific cooldown (1 hour)
            const now = Date.now() / 1000;
            const lastBeg = balance.last_beg_ts || 0;
            const cooldown = 3600; // 1 hour

            if (now - lastBeg < cooldown) {
                const remainingTime = Math.ceil(cooldown - (now - lastBeg));
                const hours = Math.floor(remainingTime / 3600);
                const minutes = Math.floor((remainingTime % 3600) / 60);
                const seconds = remainingTime % 60;

                const embed = buildSessionEmbed({
                    title: `🤲 ${username}'s Begging Status`,
                    topFields: [
                        { name: '⏰ Already Begged', value: `You already begged recently!\nCome back in ${hours}h ${minutes}m ${seconds}s` }
                    ],
                    stageText: 'ON COOLDOWN',
                    color: 0xFFAA00,
                    footer: 'Beg Command • 1 hour cooldown'
                });

                return await interaction.editReply({ embeds: [embed] });
            }

            // Beg scenarios (1K-10K range)
            const begScenarios = [
                { person: 'a kind stranger', message: 'gave you some spare change', min: 1000, max: 3000 },
                { person: 'a wealthy businessman', message: 'tossed you a few bills', min: 2000, max: 5000 },
                { person: 'a generous tourist', message: 'shared their winnings', min: 1500, max: 4000 },
                { person: 'a casino patron', message: 'felt lucky and shared', min: 3000, max: 8000 },
                { person: 'a food truck owner', message: 'gave you their tips', min: 1200, max: 3500 },
                { person: 'a street performer', message: 'shared their earnings', min: 1000, max: 2500 },
                { person: 'a casino winner', message: 'shared their jackpot', min: 5000, max: 10000 }
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
            
            // Update balance and timestamp
            const newWallet = balance.wallet + totalEarning;
            await dbManager.setUserBalance(userId, guildId, newWallet, balance.bank, {
                last_beg_ts: now
            });


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
                { name: boosterInfo.isBooster ? '🚀 Booster Status' : 'Next Beg Available', value: boosterInfo.isBooster ? 'Active (+5%)' : 'In 1 hour', inline: true }
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