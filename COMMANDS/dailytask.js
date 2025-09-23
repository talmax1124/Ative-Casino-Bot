/**
 * Daily Task command - Complete simple tasks to earn money
 * 5K-15K reward based on task completion
 * 24 hour cooldown for new tasks
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage, calculateBoosterBonus } = require('../UTILS/common');
const { secureRandomChoice, secureRandomInt } = require('../UTILS/rng');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const { checkEarningsCooldown, createCooldownBlockEmbed } = require('../UTILS/earningsCooldown');
const shopManager = require('../UTILS/shopManager');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dailytask')
        .setDescription('Complete a daily task to earn money (5K-15K every 24 hours)'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = await getGuildId(interaction);

        try {
            await interaction.deferReply();

            await dbManager.ensureUser(userId, username);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Check if any other earning command is on cooldown
            const cooldownBlock = checkEarningsCooldown(balance, 'dailytask');
            if (cooldownBlock) {
                const embed = createCooldownBlockEmbed(username, 'dailytask', cooldownBlock);
                return await interaction.editReply({ embeds: [embed] });
            }

            // Check dailytask-specific cooldown (24 hours)
            const now = Date.now() / 1000;
            const lastTask = balance.last_dailytask_ts || 0;
            const cooldown = 86400; // 24 hours

            if (now - lastTask < cooldown) {
                const remainingTime = Math.ceil(cooldown - (now - lastTask));
                const hours = Math.floor(remainingTime / 3600);
                const minutes = Math.floor((remainingTime % 3600) / 60);

                const embed = buildSessionEmbed({
                    title: `📋 ${username}'s Daily Task Status`,
                    topFields: [
                        { name: '⏰ Task Completed', value: `You already completed today's task!\nCome back in ${hours}h ${minutes}m for a new one` }
                    ],
                    stageText: 'DAILY TASK COMPLETE',
                    color: 0x00AA00,
                    footer: 'Daily Task • 24 hour cooldown'
                });

                return await interaction.editReply({ embeds: [embed] });
            }

            // Daily task scenarios
            const taskScenarios = [
                { 
                    task: 'Help an elderly person cross the street',
                    instruction: 'React with ❤️ to show you helped them',
                    emoji: '❤️',
                    reward: { min: 8000, max: 12000 }
                },
                { 
                    task: 'Clean up litter in the park',
                    instruction: 'React with 🌱 to confirm you cleaned up',
                    emoji: '🌱',
                    reward: { min: 6000, max: 10000 }
                },
                { 
                    task: 'Feed stray cats in the neighborhood',
                    instruction: 'React with 🐱 to show you fed them',
                    emoji: '🐱',
                    reward: { min: 7000, max: 11000 }
                },
                { 
                    task: 'Donate old clothes to charity',
                    instruction: 'React with 👕 to confirm your donation',
                    emoji: '👕',
                    reward: { min: 9000, max: 13000 }
                },
                { 
                    task: 'Volunteer at the local food bank',
                    instruction: 'React with 🍞 to confirm your volunteer work',
                    emoji: '🍞',
                    reward: { min: 10000, max: 15000 }
                },
                { 
                    task: 'Write a positive review for a local business',
                    instruction: 'React with ⭐ to show you wrote the review',
                    emoji: '⭐',
                    reward: { min: 5000, max: 9000 }
                },
                { 
                    task: 'Call a family member you haven\'t talked to in a while',
                    instruction: 'React with 📞 to confirm you made the call',
                    emoji: '📞',
                    reward: { min: 8000, max: 12000 }
                },
                { 
                    task: 'Plant a tree or flowers in your community',
                    instruction: 'React with 🌳 to show you planted something',
                    emoji: '🌳',
                    reward: { min: 11000, max: 15000 }
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
            
            // Add the required reaction with error handling
            try {
                await reply.react(scenario.emoji);
            } catch (reactionError) {
                logger.error(`Failed to add reaction: ${reactionError.message}`);
                // If we can't add reactions, show alternative completion method
                const altEmbed = buildSessionEmbed({
                    title: `📋 ${username}'s Daily Task`,
                    topFields: [
                        { 
                            name: '🎯 Today\'s Task', 
                            value: `**${scenario.task}**\n\nType "complete" to finish this task\n\n*Reward: ${fmt(scenario.reward.min)} - ${fmt(scenario.reward.max)}*`
                        }
                    ],
                    stageText: 'TASK ASSIGNED',
                    color: 0x4169E1,
                    footer: '📋 Daily Task • Type "complete" to earn your reward!'
                });
                
                await interaction.editReply({ embeds: [altEmbed] });
                
                // Wait for message instead of reaction
                const messageFilter = (message) => {
                    return message.author.id === userId && message.content.toLowerCase() === 'complete';
                };
                
                try {
                    const messageCollected = await interaction.channel.awaitMessages({ 
                        filter: messageFilter, 
                        max: 1, 
                        time: 30000, 
                        errors: ['time'] 
                    });
                    
                    if (messageCollected.size > 0) {
                        // Continue with task completion logic
                        await handleTaskCompletion();
                        return;
                    }
                } catch (messageError) {
                    logger.error(`Failed to collect completion message: ${messageError.message}`);
                    throw new Error('Task interaction failed');
                }
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

                // Apply shop economy boosts
                const boostResult = await shopManager.applyEconomyBoosts(userId, baseEarning, 'dailytask');
                const boostedEarning = boostResult.amount;

                // Calculate server booster bonus (5% on boosted earnings)
                const boosterInfo = await calculateBoosterBonus(boostedEarning, interaction.user.id, interaction.guildId, interaction.guild);
                const boosterBonus = boosterInfo.amount;
                const totalEarning = boostedEarning + boosterBonus;

                // Update balance and timestamp
                const currentWallet = parseFloat(balance.wallet) || 0;
                const currentBank = parseFloat(balance.bank) || 0;
                const newWallet = currentWallet + totalEarning;
                
                await dbManager.setUserBalance(userId, guildId, newWallet, currentBank, {
                    last_dailytask_ts: now
                });

                // Build success display
                const hasShopBoosts = boostResult.boosted;
                const hasServerBoost = boosterInfo.isBooster && boosterBonus > 0;
                const boostDisplay = shopManager.formatBoostInfo(boostResult.boosts);

                let earningsDisplay = `+ Base Reward: ${fmt(baseEarning)}`;
                
                if (hasShopBoosts) {
                    earningsDisplay += `\n+ Shop Boost: ${fmt(boostedEarning - baseEarning)}${boostDisplay}`;
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
                        { name: '📅 Next Task', value: 'In 24 hours', inline: true }
                    ],
                    stageText,
                    color: 0x00FF00,
                    footer: '📋 Daily Task Complete • Come back tomorrow for a new task!'
                });

                await interaction.editReply({ embeds: [successEmbed] });

                // Record game result for ML analysis
                try {
                    await dbManager.recordGameResult(
                        userId,
                        guildId,
                        'dailytask',
                        0, // No bet amount for tasks
                        totalEarning,
                        true, // Always a "win" when completed
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
                    footer: 'Daily Task • Try again tomorrow!'
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
    }
};