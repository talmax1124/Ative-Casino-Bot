/**
 * Rob command - steal money from other users with tier restrictions
 * Takes 8% of target's balance on success, 4% penalty on failure
 * Cannot rob 3+ tiers higher or the developer
 */

const { SlashCommandBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage, getEconomicTier, getAllTiers } = require('../UTILS/common');
const { secureRandomChance } = require('../UTILS/rng');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const logger = require('../UTILS/logger');
const robStatsManager = require('../UTILS/robStatsManager');

const DEVELOPER_ID = '466050111680544798'; // From CLAUDE.md
const ROB_COOLDOWN = 3600; // 1 hour cooldown

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rob')
        .setDescription('Attempt to rob another user (8% success, 4% penalty on failure)')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('User to rob')
                .setRequired(true)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = await getGuildId(interaction);
        const targetUser = interaction.options.getUser('target');
        const targetId = targetUser.id;

        try {
            await interaction.deferReply();

            // Cannot rob yourself
            if (userId === targetId) {
                const errorEmbed = buildSessionEmbed({
                    title: '❌ Invalid Target',
                    topFields: [
                        { name: '🚫 Self-Rob Denied', value: 'You cannot rob yourself! Find another target.' }
                    ],
                    stageText: 'INVALID ROBBERY',
                    color: 0xFF0000,
                    footer: 'Choose a different user to rob'
                });

                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // Economy badge system removed - using bulletproof economy

            // Cannot rob the developer
            if (targetId === DEVELOPER_ID) {
                const errorEmbed = buildSessionEmbed({
                    title: '🛡️ Protected Target',
                    topFields: [
                        { name: '👑 Developer Protection', value: 'The developer cannot be robbed! They control the economy.' }
                    ],
                    stageText: 'PROTECTED USER',
                    color: 0xFF6B6B,
                    footer: 'Find a different target'
                });

                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // Ensure both users exist
            await dbManager.ensureUser(userId, username);
            await dbManager.ensureUser(targetId, targetUser.displayName);

            // Get balances
            const robberBalance = await dbManager.getUserBalance(userId, guildId);
            const targetBalance = await dbManager.getUserBalance(targetId, guildId);

            // Check cooldown
            const now = Date.now() / 1000;
            const lastRob = robberBalance.last_rob_ts || 0;

            if (now - lastRob < ROB_COOLDOWN) {
                const remainingTime = Math.ceil(ROB_COOLDOWN - (now - lastRob));
                const minutes = Math.floor(remainingTime / 60);
                const seconds = remainingTime % 60;

                const cooldownEmbed = buildSessionEmbed({
                    title: '⏰ Robbery Cooldown',
                    topFields: [
                        { name: '🕐 Still Laying Low', value: `You must wait ${minutes}m ${seconds}s before your next robbery attempt.` }
                    ],
                    stageText: 'COOLDOWN ACTIVE',
                    color: 0xFFAA00,
                    footer: 'Rob Command • 1 hour cooldown'
                });

                return await interaction.editReply({ embeds: [cooldownEmbed] });
            }

            // Check tier restrictions
            const robberTier = getEconomicTier(robberBalance.wallet + robberBalance.bank);
            const targetTier = getEconomicTier(targetBalance.wallet + targetBalance.bank);
            const allTiers = getAllTiers();
            
            const robberTierIndex = allTiers.findIndex(tier => tier.name === robberTier.name);
            const targetTierIndex = allTiers.findIndex(tier => tier.name === targetTier.name);

            // Cannot rob someone 3+ tiers higher
            if (targetTierIndex >= robberTierIndex + 3) {
                const errorEmbed = buildSessionEmbed({
                    title: '🚫 Target Too Powerful',
                    topFields: [
                        { name: '⚡ Tier Restriction', value: `You (${robberTier.name}) cannot rob someone 3+ tiers higher (${targetTier.name})!` },
                        { name: '📊 Tier Difference', value: `Target is ${targetTierIndex - robberTierIndex} tiers above you` }
                    ],
                    stageText: 'ROBBERY BLOCKED',
                    color: 0xFF6B6B,
                    footer: 'Find a target closer to your tier level'
                });

                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // Target must have at least $1000 in wallet to rob (only wallet can be robbed)
            if (targetBalance.wallet < 1000) {
                const errorEmbed = buildSessionEmbed({
                    title: '💸 Target Too Poor',
                    topFields: [
                        { name: '🏦 Insufficient Funds', value: `${targetUser.displayName} doesn't have enough money in their wallet to rob (less than $1,000 wallet).` }
                    ],
                    stageText: 'TARGET TOO POOR',
                    color: 0xFFAA00,
                    footer: 'Find a wealthier target'
                });

                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // Calculate success chance (40% base chance - reduced for economic balance)
            const SUCCESS_CHANCE = 40;
            const success = secureRandomChance(SUCCESS_CHANCE);
            
            // Calculate amounts - only rob from wallet
            const robAmount = Math.floor(targetBalance.wallet * 0.08); // 8% of target's wallet only
            const penaltyAmount = Math.floor(robberBalance.wallet * 0.04); // 4% penalty of robber's wallet
            let actualPenalty = 0; // Initialize actualPenalty for all cases

            let resultEmbed;
            
            if (success && robAmount > 0) {
                // Successful robbery
                // Take from target's wallet only
                const newTargetWallet = targetBalance.wallet - robAmount;
                const newRobberWallet = robberBalance.wallet + robAmount;

                // Update balances (target bank remains unchanged)
                await dbManager.setUserBalance(targetId, guildId, newTargetWallet, targetBalance.bank);
                await dbManager.setUserBalance(userId, guildId, newRobberWallet, robberBalance.bank, {
                    last_rob_ts: now
                });

                resultEmbed = buildSessionEmbed({
                    title: `🎭 ${username}'s Robbery Success!`,
                    topFields: [
                        { name: '💰 ROBBERY COMPLETE', value: `Successfully robbed **${targetUser.displayName}** and stole ${fmt(robAmount)}!` },
                        { name: '🎯 Victim', value: `${targetUser.displayName} (${targetTier.name})`, inline: true },
                        { name: '💎 Amount Stolen', value: fmt(robAmount), inline: true },
                        { name: '📈 Success Rate', value: `${SUCCESS_CHANCE}%`, inline: true }
                    ],
                    bankFields: [
                        { name: 'Your New Balance', value: fmt(newRobberWallet), inline: true },
                        { name: 'Target Wallet Remaining', value: fmt(newTargetWallet), inline: true },
                        { name: 'Next Rob Available', value: 'In 1 hour', inline: true }
                    ],
                    stageText: 'ROBBERY SUCCESS',
                    color: 0x8B0000,
                    footer: '🎭 Rob Command • 1 hour cooldown • ATIVE Casino'
                });

                // Log successful robbery
                await sendLogMessage(
                    interaction.client,
                    'economy',
                    `Successful robbery: ${username} stole ${fmt(robAmount)} from ${targetUser.displayName} (${robberTier.name} → ${targetTier.name})`,
                    userId,
                    guildId
                );

            } else {
                // Failed robbery - apply penalty if robber has enough money
                actualPenalty = Math.min(penaltyAmount, robberBalance.wallet);
                const newRobberWallet = robberBalance.wallet - actualPenalty;

                await dbManager.setUserBalance(userId, guildId, newRobberWallet, robberBalance.bank, {
                    last_rob_ts: now
                });

                resultEmbed = buildSessionEmbed({
                    title: `🚨 ${username}'s Robbery Failed!`,
                    topFields: [
                        { name: '❌ ROBBERY FAILED', value: `Your robbery attempt on **${targetUser.displayName}** was unsuccessful!` },
                        { name: '💸 Penalty Applied', value: `Lost ${fmt(actualPenalty)} as penalty (4% of wallet)` },
                        { name: '🎯 Target', value: `${targetUser.displayName} (${targetTier.name})`, inline: true },
                        { name: '📉 Success Rate', value: `${SUCCESS_CHANCE}%`, inline: true },
                        { name: '⚠️ Risk Taken', value: fmt(penaltyAmount), inline: true }
                    ],
                    bankFields: [
                        { name: 'Penalty Lost', value: fmt(actualPenalty), inline: true },
                        { name: 'Your New Balance', value: fmt(newRobberWallet), inline: true },
                        { name: 'Next Attempt', value: 'In 1 hour', inline: true }
                    ],
                    stageText: 'ROBBERY FAILED',
                    color: 0xFF0000,
                    footer: '🚨 Rob Command • Failed attempts have consequences • ATIVE Casino'
                });

                // Log failed robbery
                await sendLogMessage(
                    interaction.client,
                    'economy',
                    `Failed robbery: ${username} lost ${fmt(actualPenalty)} penalty trying to rob ${targetUser.displayName} (${robberTier.name} → ${targetTier.name})`,
                    userId,
                    guildId
                );
            }

            await interaction.editReply({ embeds: [resultEmbed] });

            // Record comprehensive rob stats
            try {
                await robStatsManager.recordRobbery(
                    {
                        id: userId,
                        name: username,
                        balance: robberBalance
                    },
                    {
                        id: targetId,
                        name: targetUser.displayName,
                        balance: targetBalance
                    },
                    success,
                    success ? robAmount : 0,
                    success ? 0 : actualPenalty,
                    guildId
                );
            } catch (error) {
                logger.error(`Failed to record rob stats: ${error.message}`);
            }

            // Record game result for ML analysis
            try {
                await dbManager.recordGameResult(
                    userId,
                    guildId,
                    'rob',
                    success, // True if successful robbery
                    0, // No bet amount for robbery
                    success ? robAmount : -penaltyAmount, // Positive if successful, negative if failed
                    {
                        targetUser: targetUser.displayName,
                        targetWallet: targetBalance.wallet,
                        robAmount: robAmount,
                        penaltyAmount: penaltyAmount,
                        successChance: SUCCESS_CHANCE
                    }
                );
            } catch (error) {
                logger.error(`Failed to record rob result: ${error.message}`);
            }

        } catch (error) {
            logger.error(`Error processing rob command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Robbery Error',
                topFields: [
                    { name: '🔧 System Error', value: 'Failed to process robbery. The heist has been aborted!' }
                ],
                stageText: 'HEIST ABORTED',
                color: 0xFF0000,
                footer: 'Please try again later'
            });

            try {
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: 64 });
                }

                // Send error log
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `Rob error for ${username} (${userId}) targeting ${targetUser?.displayName} — ${error.message}`,
                    userId,
                    guildId
                );
            } catch (replyError) {
                logger.error(`Failed to send rob error reply: ${replyError.message}`);
            }
        }
    }
};