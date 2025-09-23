/**
 * Crime command for quick petty crimes
 * 1K-5K range with 30 minute cooldown
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage, calculateBoosterBonus } = require('../UTILS/common');
const { secureRandomChoice, secureRandomInt } = require('../UTILS/rng');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const { checkEarningsCooldown, createCooldownBlockEmbed } = require('../UTILS/earningsCooldown');
const { PayoutManager } = require('../UTILS/gameUtils');
const sessionManager = require('../UTILS/sessionManager');
const tuningManager = require('../UTILS/tuningManager');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('Commit petty crimes for quick cash (1K-5K every 30 minutes)'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = await getGuildId(interaction);

        try {
            await interaction.deferReply();

            await dbManager.ensureUser(userId, username);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Check if any other earning command is on cooldown
            const cooldownBlock = checkEarningsCooldown(balance, 'crime');
            if (cooldownBlock) {
                const embed = createCooldownBlockEmbed(username, 'crime', cooldownBlock);
                return await interaction.editReply({ embeds: [embed] });
            }

            // Check crime-specific cooldown (30 minutes)
            const now = Date.now() / 1000;
            const lastCrime = balance.last_crime_ts || 0;
            const cooldown = 1800; // 30 minutes

            if (now - lastCrime < cooldown) {
                const remainingTime = Math.ceil(cooldown - (now - lastCrime));
                const minutes = Math.floor(remainingTime / 60);
                const seconds = remainingTime % 60;

                const embed = buildSessionEmbed({
                    title: `🚨 ${username}'s Criminal Status`,
                    topFields: [
                        { name: '🚨 Laying Low', value: `The heat is still on!\nLay low for ${minutes}m ${seconds}s before your next crime` }
                    ],
                    stageText: 'HIDING FROM POLICE',
                    color: 0xFF6B6B,
                    footer: 'Crime Command • 30 minute cooldown'
                });

                return await interaction.editReply({ embeds: [embed] });
            }

            // Crime scenarios (1K-5K range)
            const crimeScenarios = [
                { crime: 'Pickpocketed a distracted gambler', min: 1000, max: 2500 },
                { crime: 'Found forgotten chips under a slot machine', min: 1200, max: 3000 },
                { crime: 'Swiped loose change from a fountain', min: 1000, max: 1800 },
                { crime: 'Sold fake casino "insider tips"', min: 2000, max: 4000 },
                { crime: 'Collected dropped betting slips', min: 1500, max: 3500 },
                { crime: 'Scammed tourists with rigged dice', min: 2500, max: 5000 },
                { crime: 'Snuck extra chips during confusion', min: 1800, max: 4200 }
            ];

            const scenario = secureRandomChoice(crimeScenarios);
            const baseEarning = secureRandomInt(scenario.min, scenario.max + 1);

            // Apply tuning manager adjustments for fair gameplay
            const tuningAdjustment = await tuningManager.getAdjustedPayout('crime', baseEarning, 0);
            const adjustedEarning = tuningAdjustment.adjustedPayout;

            // Calculate server booster bonus (5%) on adjusted amount
            const boosterInfo = await calculateBoosterBonus(adjustedEarning, interaction.user.id, interaction.guildId, interaction.guild);
            const boosterBonus = boosterInfo.amount;
            const totalEarning = adjustedEarning + boosterBonus;

            // Create game result object for payout processing
            const gameResult = {
                type: 'crime',
                userId: userId,
                guildId: guildId,
                betAmount: 0, // No bet for crime
                payout: totalEarning,
                won: true,
                scenario: scenario.crime,
                baseEarning: adjustedEarning,
                boosterBonus: boosterBonus,
                isBooster: boosterInfo.isBooster,
                tuningMultiplier: (1 + tuningAdjustment.payoutDelta)
            };

            // Process payout through modern payout manager
            const payoutResult = await PayoutManager.processGamePayout(gameResult, interaction);

            // Validate and sanitize balance values
            const currentWallet = parseFloat(balance.wallet) || 0;
            const currentBank = parseFloat(balance.bank) || 0;
            
            // Update balance and timestamp
            const newWallet = currentWallet + totalEarning;
            await dbManager.setUserBalance(userId, guildId, newWallet, currentBank, {
                last_crime_ts: now
            });


            // Build earnings display with tuning and booster bonus if applicable
            let earningsDisplay = `+ Base Earnings: ${fmt(tuningAdjustment.originalPayout)}`;
            if (tuningAdjustment.payoutDelta !== 0) {
                const adjustmentPercent = (tuningAdjustment.payoutDelta * 100).toFixed(1);
                earningsDisplay += `\n+ Tuning Adjustment: ${adjustmentPercent > 0 ? '+' : ''}${adjustmentPercent}%`;
            }
            if (boosterInfo.isBooster && boosterBonus > 0) {
                earningsDisplay += `\n+ Booster Bonus (5%): ${fmt(boosterBonus)}`;
                earningsDisplay += `\n= Total Earned: ${fmt(totalEarning)}`;
            }

            // Crime details in topFields
            const topFields = [{
                name: boosterInfo.isBooster ? '🦹 CRIME COMPLETE (🚀 BOOSTED)' : '🦹 CRIME COMPLETE',
                value: `**${scenario.crime}**\n` +
                       `\`\`\`diff\n${earningsDisplay}\n  Previous: ${fmt(currentWallet)}\n+ New Balance: ${fmt(newWallet)}\`\`\``,
                inline: false
            }];

            // Balance information in bankFields
            const bankFields = [
                { name: 'Crime Earnings', value: fmt(totalEarning), inline: true },
                { name: 'Current Balance', value: fmt(newWallet), inline: true },
                { name: boosterInfo.isBooster ? '🚀 Booster Status' : 'Next Crime Available', value: boosterInfo.isBooster ? 'Active (+5%)' : 'In 30 minutes', inline: true }
            ];

            // Stage text for current status
            const stageText = 'CRIME SUCCESS';
            
            // Build the embed using gameSessionKit
            const embed = buildSessionEmbed({
                title: `🦹 ${username}'s Crime Complete!`,
                topFields,
                bankFields,
                stageText,
                color: 0x8B0000,
                footer: '🦹 Crime • 30 minute cooldown • ATIVE Casino'
            });

            await interaction.editReply({ embeds: [embed] });

            // End session with success result
            try {
                await sessionManager.endSession(interaction.user.id, {
                    type: 'crime',
                    result: 'success',
                    earning: totalEarning,
                    scenario: scenario.crime
                });
            } catch (error) {
                logger.error(`Failed to end crime session: ${error.message}`);
            }

            // Record game result for ML analysis
            try {
                await dbManager.recordGameResult(
                    userId,
                    guildId,
                    'crime',
                    true, // Always a "win" when successful
                    0, // No bet amount for crime
                    totalEarning,
                    {
                        crime: scenario.crime,
                        baseEarning: baseEarning,
                        boosterBonus: boosterBonus,
                        isBooster: boosterInfo.isBooster
                    }
                );
            } catch (error) {
                logger.error(`Failed to record crime result: ${error.message}`);
            }

            // Log the crime
            const logMessage = boosterInfo.isBooster 
                ? `Crime completed (BOOSTED): ${username} ${scenario.crime.toLowerCase()} and earned ${fmt(totalEarning)} (base: ${fmt(baseEarning)} + boost: ${fmt(boosterBonus)}) - Balance: ${fmt(newWallet)}`
                : `Crime completed: ${username} ${scenario.crime.toLowerCase()} and earned ${fmt(totalEarning)} - Balance: ${fmt(newWallet)}`;
            
            await sendLogMessage(
                interaction.client,
                'economy',
                logMessage,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error processing crime command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Crime Failed',
                topFields: [
                    { name: '🚨 Busted!', value: 'Your crime was unsuccessful! Better luck next time.' }
                ],
                stageText: 'CRIME FAILED',
                color: 0xFF0000,
                footer: 'Crime System Error'
            });

            try {
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: 64 });
                }
            } catch (replyError) {
                logger.error(`Failed to send crime error reply: ${replyError.message}`);
            }
        }
    }
};
