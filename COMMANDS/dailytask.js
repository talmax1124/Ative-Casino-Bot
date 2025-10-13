/**
 * Daily Task command - Complete simple tasks to earn money
 * 5K-15K reward based on task completion
 * No cooldown restrictions
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage, calculateBoosterBonus } = require('../UTILS/common');
const { secureRandomChoice, secureRandomInt } = require('../UTILS/rng');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
// Removed global earnings cooldown - commands now run independently
const { PayoutManager } = require('../UTILS/gameUtils');
const sessionManager = require('../UTILS/sessionManager');
const tuningManager = require('../UTILS/tuningManager');
const shopManager = require('../UTILS/shopManager');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dailytask')
        .setDescription('Complete a daily task to earn money (25K-75K)'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = await getGuildId(interaction);

        try {
            await interaction.deferReply();

            await dbManager.ensureUser(userId, username);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // No cooldown restrictions - tasks available anytime

            // Daily task scenarios
            const taskScenarios = [
                { 
                    task: 'Help an elderly person cross the street',
                    instruction: 'React with ❤️ to show you helped them',
                    emoji: '❤️',
                    reward: { min: 40000, max: 60000 }
                },
                { 
                    task: 'Clean up litter in the park',
                    instruction: 'React with 🌱 to confirm you cleaned up',
                    emoji: '🌱',
                    reward: { min: 30000, max: 50000 }
                },
                { 
                    task: 'Feed stray cats in the neighborhood',
                    instruction: 'React with 🐱 to show you fed them',
                    emoji: '🐱',
                    reward: { min: 35000, max: 55000 }
                },
                { 
                    task: 'Donate old clothes to charity',
                    instruction: 'React with 👕 to confirm your donation',
                    emoji: '👕',
                    reward: { min: 45000, max: 65000 }
                },
                { 
                    task: 'Volunteer at the local food bank',
                    instruction: 'React with 🍞 to confirm your volunteer work',
                    emoji: '🍞',
                    reward: { min: 50000, max: 75000 }
                },
                { 
                    task: 'Write a positive review for a local business',
                    instruction: 'React with ⭐ to show you wrote the review',
                    emoji: '⭐',
                    reward: { min: 25000, max: 45000 }
                },
                { 
                    task: 'Call a family member you haven\'t talked to in a while',
                    instruction: 'React with 📞 to confirm you made the call',
                    emoji: '📞',
                    reward: { min: 40000, max: 60000 }
                },
                { 
                    task: 'Plant a tree or flowers in your community',
                    instruction: 'React with 🌳 to show you planted something',
                    emoji: '🌳',
                    reward: { min: 55000, max: 75000 }
                }
            ];

            const scenario = secureRandomChoice(taskScenarios);
            
            // Task presentation embed
            const taskEmbed = buildSessionEmbed({
                title: `📋 ${username}'s Daily Task`,
                topFields: [
                    { 
                        name: '🎯 Today\'s Task', 
                        value: `**${scenario.task}**\n\n${scenario.instruction}\n\n*Reward: ${fmt(scenario.reward.min)} - ${fmt(scenario.reward.max)}*`
                    }
                ],
                stageText: 'TASK ASSIGNED',
                color: 0x4169E1,
                footer: '📋 Daily Task • Complete the task to earn your reward!'
            });

            const reply = await interaction.editReply({ embeds: [taskEmbed] });
            
            // Add the required reaction with improved error handling
            try {
                // Ensure we have a valid message object with channel access
                if (!reply.channel) {
                    // If channel is not cached, fetch the message
                    const channel = await interaction.client.channels.fetch(interaction.channelId);
                    const message = await channel.messages.fetch(reply.id);
                    await message.react(scenario.emoji);
                } else {
                    await reply.react(scenario.emoji);
                }
            } catch (reactionError) {
                logger.error(`Failed to add reaction: ${reactionError.message}`);
                // Fall back to button completion if reactions don't work
                const buttonRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('complete_task')
                            .setLabel('Complete Task')
                            .setEmoji(scenario.emoji)
                            .setStyle(ButtonStyle.Success)
                    );
                
                await interaction.editReply({ 
                    embeds: [taskEmbed],
                    components: [buttonRow]
                });
                return;
            }

            // Wait for user reaction (30 seconds timeout)
            const filter = (reaction, user) => {
                // Handle both unicode emojis and custom emojis
                const emojiMatch = reaction.emoji.name === scenario.emoji || 
                                 reaction.emoji.toString() === scenario.emoji ||
                                 reaction.emoji.id === scenario.emoji;
                return emojiMatch && user.id === userId && !user.bot;
            };
            
            // Function to handle task completion
            async function handleTaskCompletion() {
                // Task completed! Calculate reward
                const baseEarning = secureRandomInt(scenario.reward.min, scenario.reward.max + 1);

                // Apply tuning manager adjustments for fair gameplay
                const tuningAdjustment = await tuningManager.getAdjustedPayout('dailytask', baseEarning, 0);
                const adjustedEarning = tuningAdjustment.adjustedPayout;

                // Apply shop economy boosts on adjusted amount
                const boostResult = await shopManager.applyEconomyBoosts(userId, adjustedEarning, 'dailytask');
                const boostedEarning = boostResult.amount;

                // Calculate server booster bonus (5% on boosted earnings)
                const boosterInfo = await calculateBoosterBonus(boostedEarning, interaction.user.id, interaction.guildId, interaction.guild);
                const boosterBonus = boosterInfo.amount;
                const totalEarning = boostedEarning + boosterBonus;

                // Create game result object for payout processing
                const gameResult = {
                    type: 'dailytask',
                    gameType: 'dailytask', // Add explicit gameType field
                    userId: userId,
                    guildId: guildId,
                    betAmount: 0, // No bet for daily task
                    payout: totalEarning,
                    won: true,
                    task: scenario.task,
                    baseEarning: adjustedEarning,
                    shopBoosts: boostResult.boosts,
                    boosterBonus: boosterBonus,
                    isBooster: boosterInfo.isBooster,
                    tuningMultiplier: (1 + tuningAdjustment.payoutDelta)
                };

                // Process payout through modern payout manager
                const payoutResult = await PayoutManager.processGamePayout(gameResult, interaction);

                // Update balance
                const currentWallet = parseFloat(balance.wallet) || 0;
                const currentBank = parseFloat(balance.bank) || 0;
                const newWallet = currentWallet + totalEarning;
                
                await dbManager.setUserBalance(userId, guildId, newWallet, currentBank);


                // Build success display
                const hasShopBoosts = boostResult.boosted;
                const hasServerBoost = boosterInfo.isBooster && boosterBonus > 0;
                const boostDisplay = shopManager.formatBoostInfo(boostResult.boosts);

                let earningsDisplay = `+ Base Reward: ${fmt(tuningAdjustment.originalPayout)}`;
                
                if (tuningAdjustment.payoutDelta !== 0) {
                    const adjustmentPercent = (tuningAdjustment.payoutDelta * 100).toFixed(1);
                    earningsDisplay += `\n+ Tuning Adjustment: ${adjustmentPercent > 0 ? '+' : ''}${adjustmentPercent}%`;
                }
                
                if (hasShopBoosts) {
                    earningsDisplay += `\n+ Shop Boost: ${fmt(boostedEarning - adjustedEarning)}${boostDisplay}`;
                }
                
                if (hasServerBoost) {
                    earningsDisplay += `\n+ Server Boost (5%): ${fmt(boosterBonus)}`;
                }
                
                earningsDisplay += `\n= Total Earned: ${fmt(totalEarning)}`;

                // Determine title and stage text based on active boosts
                let titleSuffix = '';
                let stageText = 'TASK COMPLETED';
                
                if (hasShopBoosts && hasServerBoost) {
                    titleSuffix = ' (🚀 SUPER BOOSTED)';
                    stageText = 'TASK COMPLETED + BOOSTS';
                } else if (hasShopBoosts || hasServerBoost) {
                    titleSuffix = ' (🚀 BOOSTED)';
                    stageText = 'TASK COMPLETED + BOOST';
                }

                const successEmbed = buildSessionEmbed({
                    title: `📋 ${username}'s Task Completed!${titleSuffix}`,
                    topFields: [{
                        name: `✅ TASK COMPLETE${titleSuffix}`,
                        value: `**${scenario.task}**\n\n` +
                               `\`\`\`diff\n${earningsDisplay}\n  Previous: ${fmt(currentWallet)}\n+ New Balance: ${fmt(newWallet)}\`\`\``,
                        inline: false
                    }],
                    bankFields: [
                        { name: '💎 Task Reward', value: fmt(totalEarning), inline: true },
                        { name: '💵 New Balance', value: fmt(newWallet), inline: true },
                        { name: '✅ Status', value: 'Task Complete', inline: true }
                    ],
                    stageText,
                    color: 0x00FF00,
                    footer: '📋 Task Complete • Ready for another task anytime!'
                });

                await interaction.editReply({ embeds: [successEmbed] });

                // Session handling removed - daily tasks don't need explicit session management

                // Record game result for ML analysis
                try {
                    await dbManager.recordGameResult(
                        userId,
                        guildId,
                        'dailytask',
                        true, // Always a "win" when completed
                        0, // No bet amount for tasks
                        totalEarning,
                        {
                            task: scenario.task,
                            baseEarning: baseEarning,
                            shopBoosts: hasShopBoosts,
                            serverBoost: hasServerBoost,
                            boosterBonus: boosterBonus
                        }
                    );
                } catch (error) {
                    logger.error(`Failed to record daily task result: ${error.message}`);
                }

                // Log the task completion
                let logMessage = `Daily task completed: ${username} ${scenario.task.toLowerCase()} and earned ${fmt(totalEarning)}`;
                
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
            }
            
            try {
                const collected = await reply.awaitReactions({ filter, max: 1, time: 30000, errors: ['time'] });
                
                if (collected.size > 0) {
                    await handleTaskCompletion();
                }
                
            } catch (error) {
                // Timeout - task not completed
                const timeoutEmbed = buildSessionEmbed({
                    title: `📋 ${username}'s Task Timeout`,
                    topFields: [
                        { name: '⏰ Time\'s Up!', value: 'You didn\'t complete the task in time.\nTry again tomorrow for a new task!' }
                    ],
                    stageText: 'TASK TIMEOUT',
                    color: 0xFFAA00,
                    footer: 'Daily Task • Try again anytime!'
                });

                await interaction.editReply({ embeds: [timeoutEmbed] });
            }

        } catch (error) {
            logger.error(`Error processing daily task command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Daily Task Error',
                topFields: [
                    { name: '🔧 System Error', value: 'Failed to process daily task. Please try again.' }
                ],
                stageText: 'ERROR',
                color: 0xFF0000,
                footer: 'Daily Task System Error'
            });

            try {
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: 64 });
                }
            } catch (replyError) {
                logger.error(`Failed to send daily task error reply: ${replyError.message}`);
            }
        }
    },

    // Handle button-based completion when reactions fail
    async handleButtonCompletion(interaction, scenario, userId, guildId, username, balance, now) {

        // Function to handle task completion
        async function handleTaskCompletion() {
            // Task completed! Calculate reward
            const baseEarning = secureRandomInt(scenario.reward.min, scenario.reward.max + 1);

            // Apply tuning manager adjustments for fair gameplay
            const tuningAdjustment = await tuningManager.getAdjustedPayout('dailytask', baseEarning, 0);
            const adjustedEarning = tuningAdjustment.adjustedPayout;

            // Apply shop economy boosts on adjusted amount
            const boostResult = await shopManager.applyEconomyBoosts(userId, adjustedEarning, 'dailytask');
            const boostedEarning = boostResult.amount;

            // Calculate server booster bonus (5% on boosted earnings)
            const boosterInfo = await calculateBoosterBonus(boostedEarning, interaction.user.id, interaction.guildId, interaction.guild);
            const boosterBonus = boosterInfo.amount;
            const totalEarning = boostedEarning + boosterBonus;

            // Create game result object for payout processing
            const gameResult = {
                type: 'dailytask',
                gameType: 'dailytask', // Add explicit gameType field
                userId: userId,
                guildId: guildId,
                betAmount: 0, // No bet for daily task
                payout: totalEarning,
                won: true,
                task: scenario.task,
                baseEarning: adjustedEarning,
                shopBoosts: boostResult.boosts,
                boosterBonus: boosterBonus,
                isBooster: boosterInfo.isBooster,
                tuningMultiplier: (1 + tuningAdjustment.payoutDelta)
            };

            // Process payout through modern payout manager
            const payoutResult = await PayoutManager.processGamePayout(gameResult, interaction);

            // Update balance
            const currentWallet = parseFloat(balance.wallet) || 0;
            const currentBank = parseFloat(balance.bank) || 0;
            const newWallet = currentWallet + totalEarning;
            
            await dbManager.setUserBalance(userId, guildId, newWallet, currentBank);

            // Update completion embed
            const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
            const completionEmbed = buildSessionEmbed({
                title: `✅ ${username}'s Daily Task Complete!`,
                topFields: [
                    {
                        name: '🎯 Completed Task',
                        value: `**${scenario.task}**`,
                        inline: false
                    },
                    {
                        name: '💰 Reward Earned',
                        value: `**${fmt(totalEarning)}**`,
                        inline: true
                    },
                    {
                        name: '💵 New Balance',
                        value: `**${fmt(newWallet)}**`,
                        inline: true
                    }
                ],
                stageText: 'TASK COMPLETED',
                color: 0x00FF00,
                footer: '✅ Task completed successfully!'
            });

            // Show completion message
            await interaction.editReply({ embeds: [completionEmbed], components: [] });
            
            // Log completion
            logger.info(`Daily task completed by ${username} (${userId}): ${scenario.task} - earned ${totalEarning}`);
        }

        // Use button completion method
        const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
        const altEmbed = buildSessionEmbed({
            title: `📋 ${username}'s Daily Task`,
            topFields: [
                { 
                    name: '🎯 Today\'s Task', 
                    value: `**${scenario.task}**\n\nClick the button below to complete this task\n\n*Reward: ${fmt(scenario.reward.min)} - ${fmt(scenario.reward.max)}*`
                }
            ],
            stageText: 'TASK ASSIGNED',
            color: 0x4169E1,
            footer: '📋 Daily Task • Click to complete!'
        });

        // Create complete button
        const completeButton = new ButtonBuilder()
            .setCustomId(`dailytask_complete_${userId}`)
            .setLabel('Complete Task ✅')
            .setStyle(ButtonStyle.Success);

        const taskRow = new ActionRowBuilder().addComponents(completeButton);
        
        const taskMessage = await interaction.editReply({ 
            embeds: [altEmbed],
            components: [taskRow]
        });
        
        // Wait for button click
        try {
            const buttonCollector = taskMessage.createMessageComponentCollector({
                filter: (i) => i.user.id === userId && i.customId === `dailytask_complete_${userId}`,
                time: 30000,
                max: 1
            });

            const buttonInteraction = await new Promise((resolve, reject) => {
                buttonCollector.on('collect', resolve);
                buttonCollector.on('end', (collected) => {
                    if (collected.size === 0) {
                        reject(new Error('Task completion timed out'));
                    }
                });
            });

            // Update button to show completion
            await buttonInteraction.update({
                embeds: [altEmbed],
                components: []
            });

            // Continue with task completion logic
            await handleTaskCompletion();
            
        } catch (buttonError) {
            logger.error(`Failed to collect completion button: ${buttonError.message}`);
            throw new Error('Task interaction failed');
        }
    }
};