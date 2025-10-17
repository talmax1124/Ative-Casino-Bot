/**
 * EarnMoney command - Available only to users with 10+ votes and active streak
 * Combines all economy commands (/earn, /work, /beg, /crime, /heist) into one
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
        .setName('earnmoney')
        .setDescription('Claim all economy commands at once (5min cooldown, requires 10+ votes & active streak)'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = await getGuildId(interaction);

        try {
            await interaction.deferReply();
            await dbManager.ensureUser(userId, username);
            
            // Check if user has voting privileges OR shop unlock for /earnmoney
            const voteData = await dbManager.getUserVoteData(userId, guildId);
            const hasShopUnlock = await shopManager.hasEarnmoneyUnlock(userId);
            
            if (!hasShopUnlock && (!voteData || !voteData.can_use_earnmoney)) {
                const totalVotes = voteData?.total_votes || 0;
                const currentStreak = voteData?.vote_streak || 0;
                
                const lockEmbed = buildSessionEmbed({
                    title: '🔒 EarnMoney Command Locked',
                    topFields: [
                        { name: '🗳️ Requirements Not Met', value: 'This command requires **10+ votes AND an active voting streak**!' },
                        { name: '📊 Your Stats', value: `Votes: ${totalVotes}/10\nStreak: ${currentStreak} days` },
                        { name: '🛒 Alternative', value: 'You can also purchase the **EarnMoney Unlock** from `/shop browse` to bypass this requirement for 1.5 weeks!' }
                    ],
                    stageText: 'VOTING OR PURCHASE REQUIRED',
                    color: 0xFF6B6B,
                    footer: 'Use /vote to start building your voting streak or visit the shop!'
                });

                return await interaction.editReply({ embeds: [lockEmbed] });
            }
            
            // Get current balance and check cooldowns
            const balance = await dbManager.getUserBalance(userId, guildId);
            const now = Date.now();
            
            // Check overall earnmoney cooldown (prevent spam - 5 minute cooldown)
            const lastEarnmoney = balance.last_earnmoney_ts || 0;
            const earnmoneyCooldown = 5 * 60 * 1000; // 5 minutes
            
            if (now - lastEarnmoney < earnmoneyCooldown) {
                const remainingMs = Math.max(0, earnmoneyCooldown - (now - lastEarnmoney));
                const totalSeconds = Math.ceil(remainingMs / 1000);
                const minutes = Math.floor(totalSeconds / 60);
                const seconds = totalSeconds % 60;

                const cooldownEmbed = buildSessionEmbed({
                    title: '⏰ EarnMoney Cooldown Active',
                    topFields: [
                        { name: '🕐 Please Wait', value: `You can use /earnmoney again in **${minutes}m ${seconds}s**` },
                        { name: '🚫 Anti-Spam Protection', value: 'This prevents excessive command usage and ensures fair play for everyone.' }
                    ],
                    stageText: 'EARNMONEY COOLDOWN',
                    color: 0xFFAA00,
                    footer: 'EarnMoney has a 5-minute cooldown between uses'
                });

                return await interaction.editReply({ embeds: [cooldownEmbed] });
            }
            
            // Check all cooldowns and calculate earnings
            const results = {
                earn: await this.processEarn(balance, now),
                work: await this.processWork(balance, now),
                beg: await this.processBeg(balance, now),
                crime: await this.processCrime(balance, now),
                heist: await this.processHeist(balance, now),
                dailytask: await this.processDailyTask(balance, now),
                quiz: await this.processQuiz(balance, now)
            };

            // Calculate total earnings
            const baseEarnings = Object.values(results).reduce((sum, result) => sum + (result.earned || 0), 0);
            
            // Apply shop economy boosts
            const boostResult = await shopManager.applyEconomyBoosts(userId, baseEarnings, 'earnmoney');
            const boostedEarnings = boostResult.amount;
            
            // Calculate server booster bonus (5% on boosted earnings) - guild-specific
            const boosterInfo = await calculateBoosterBonus(boostedEarnings, interaction.user.id, interaction.guildId, interaction.guild);
            const boosterBonus = boosterInfo.amount;
            const totalEarned = boostedEarnings + boosterBonus;
            
            if (baseEarnings === 0) {
                // DO NOT update earnmoney timestamp when no earnings to prevent cooldown bypass
                const cooldowns = Object.entries(results)
                    .filter(([_, result]) => result.cooldownRemaining > 0)
                    .map(([command, result]) => {
                        const remainingMs = Math.max(0, result.cooldownRemaining);
                        const totalSeconds = Math.ceil(remainingMs / 1000);
                        const minutes = Math.floor(totalSeconds / 60);
                        const seconds = totalSeconds % 60;
                        return `${this.getCommandEmoji(command)} **${command}**: ${minutes}m ${seconds}s`;
                    });

                const cooldownEmbed = buildSessionEmbed({
                    title: '⏰ All Commands on Cooldown',
                    topFields: [
                        { name: '🕐 Active Cooldowns', value: cooldowns.join('\n') || 'No active cooldowns' },
                        { name: '💡 Tip', value: 'Come back when your cooldowns expire to claim multiple commands at once!' }
                    ],
                    stageText: 'WAIT FOR COOLDOWNS',
                    color: 0xFFAA00,
                    footer: 'Individual command cooldowns must expire first'
                });

                return await interaction.editReply({ embeds: [cooldownEmbed] });
            }

            const newWallet = parseFloat(balance.wallet) + totalEarned;
            
            const updateFields = {};
            updateFields.last_earnmoney_ts = now;
            if (results.earn.earned > 0) updateFields.last_earn_ts = now;
            if (results.work.earned > 0) updateFields.last_work_ts = now;
            if (results.beg.earned > 0) updateFields.last_beg_ts = now;
            if (results.crime.earned > 0) updateFields.last_crime_ts = now;
            if (results.heist.earned > 0) updateFields.last_heist_ts = now;
            if (results.dailytask.earned > 0) updateFields.last_dailytask_ts = now;
            if (results.quiz.earned > 0) updateFields.last_quiz_ts = now;

            const balanceUpdateSuccess = await dbManager.setUserBalance(userId, guildId, newWallet, balance.bank, updateFields);
            
            if (!balanceUpdateSuccess) {
                logger.error(`Failed to update balance and cooldowns for user ${userId} in earnmoney`);
                const errorEmbed = buildSessionEmbed({
                    title: '❌ EarnMoney Update Failed',
                    topFields: [
                        { name: '🛠️ Database Error', value: 'Failed to save your earnings and cooldowns. Please try again.' }
                    ],
                    stageText: 'UPDATE FAILED',
                    color: 0xFF0000,
                    footer: 'Your balance was not changed'
                });
                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // Create earnings fields for display
            const earnedFields = Object.entries(results)
                .filter(([_, result]) => result.earned > 0)
                .map(([command, result]) => ({ 
                    name: `${this.getCommandEmoji(command)} ${command.toUpperCase()}`, 
                    value: `${fmt(result.earned)}\n*${result.description}*`, 
                    inline: true 
                }));

            // Banking information with boost display
            const boostDisplay = shopManager.formatBoostInfo(boostResult.boosts);
            const hasShopBoosts = boostResult.boosted;
            const hasServerBoost = boosterInfo.isBooster;
            
            const bankFields = [];
            
            if (hasShopBoosts && hasServerBoost) {
                // Both shop and server boosts
                bankFields.push(
                    { name: '💎 Total Earned', value: `${fmt(totalEarned)}${boostDisplay} + 🚀 +${fmt(boosterBonus)}`, inline: true },
                    { name: '💵 New Balance', value: fmt(newWallet), inline: true },
                    { name: '🎯 Boosts Active', value: `Shop${boostDisplay} + Server Boost (+5%)`, inline: true }
                );
            } else if (hasShopBoosts) {
                // Shop boosts only
                bankFields.push(
                    { name: '💎 Total Earned', value: `${fmt(totalEarned)}${boostDisplay}`, inline: true },
                    { name: '💵 New Balance', value: fmt(newWallet), inline: true },
                    { name: '🚀 Shop Boosts', value: boostDisplay.trim(), inline: true }
                );
            } else if (hasServerBoost) {
                // Server boost only
                bankFields.push(
                    { name: '💎 Total Earned', value: `${fmt(totalEarned)} (🚀 +${fmt(boosterBonus)})`, inline: true },
                    { name: '💵 New Balance', value: fmt(newWallet), inline: true },
                    { name: '🚀 Boost Active', value: '+5% Server Boost', inline: true }
                );
            } else {
                // No boosts
                bankFields.push(
                    { name: '💎 Total Earned', value: fmt(totalEarned), inline: true },
                    { name: '💵 New Balance', value: fmt(newWallet), inline: true },
                    { name: '📈 Change', value: fmtDelta(totalEarned), inline: true }
                );
            }

            // Determine title and stage text based on active boosts
            let titleSuffix = '';
            let stageText = 'ALL COMMANDS CLAIMED';
            
            if (hasShopBoosts && hasServerBoost) {
                titleSuffix = ' (🚀 SUPER BOOSTED)';
                stageText = 'ALL COMMANDS CLAIMED + BOOSTS';
            } else if (hasShopBoosts || hasServerBoost) {
                titleSuffix = ' (🚀 BOOSTED)';
                stageText = 'ALL COMMANDS CLAIMED + BOOST';
            }
            
            const successEmbed = buildSessionEmbed({
                title: `💰 ${username}'s EarnMoney Success!${titleSuffix}`,
                topFields: earnedFields,
                bankFields,
                stageText,
                color: 0x00FF00,
                footer: `🗳️ ${hasShopUnlock ? 'Shop unlock active (1.5 weeks)' : 'Exclusive to voters'} • ${earnedFields.length} commands claimed • ATIVE Casino`
            });

            await interaction.editReply({ embeds: [successEmbed] });

            // Record game result for ML analysis
            try {
                await dbManager.recordGameResult(
                    userId,
                    guildId,
                    'earnmoney',
                    true, // Always a "win" when successful
                    0, // No bet amount for earnmoney
                    totalEarned,
                    {
                        commandsClaimed: earnedFields.length,
                        shopUnlock: hasShopUnlock,
                        shopBoosts: hasShopBoosts,
                        serverBoost: hasServerBoost,
                        boosterBonus: boosterBonus
                    }
                );
            } catch (error) {
                logger.error(`Failed to record earnmoney result: ${error.message}`);
            }

            // Log the earnmoney usage
            let logMessage = `EarnMoney claimed: ${username} earned ${fmt(totalEarned)} from ${earnedFields.length} commands`;
            
            if (hasShopBoosts) {
                logMessage += ` (Shop boost: ${fmt(baseEarnings)} -> ${fmt(boostedEarnings)})`;
            }
            
            if (hasServerBoost) {
                logMessage += ` (Server boost: +${fmt(boosterBonus)})`;
            }
            
            if (hasShopUnlock) {
                logMessage += ' (Shop unlock used)';
            } else if (voteData) {
                logMessage += ` (Votes: ${voteData.total_votes}, Streak: ${voteData.vote_streak} days)`;
            }
            
            logMessage += ` - New Balance: ${fmt(newWallet)}`;
            
            if (interaction?.client) {
                await sendLogMessage(
                    interaction.client,
                    'economy',
                    logMessage,
                    userId,
                    guildId
                );
            }

        } catch (error) {
            logger.error(`Error processing earnmoney command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ EarnMoney Error',
                topFields: [
                    { name: '🔧 System Error', value: 'Failed to process earnmoney command. Please try again.' }
                ],
                stageText: 'SYSTEM ERROR',
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
                if (interaction?.client) {
                    await sendLogMessage(
                        interaction.client,
                        'error',
                        `EarnMoney error for ${username} (${userId}) — ${error.message}`,
                        userId,
                        guildId
                    );
                }
            } catch (replyError) {
                logger.error(`Failed to send earnmoney error reply: ${replyError.message}`);
            }
        }
    },

    /**
     * Process earn command logic
     */
    async processEarn(balance, now) {
        const lastEarn = balance.last_earn_ts || 0;
        const cooldown = 60 * 60 * 1000; // 1 hour
        
        if (now - lastEarn < cooldown) {
            return { earned: 0, cooldownRemaining: cooldown - (now - lastEarn), description: '' };
        }
        
        const earning = secureRandomInt(75000, 150001);
        return { 
            earned: earning, 
            cooldownRemaining: 0, 
            description: 'Hourly earnings collected!' 
        };
    },

    /**
     * Process work command logic (uses existing work command logic)
     */
    async processWork(balance, now) {
        const lastWork = balance.last_work_ts || 0;
        const cooldown = 60 * 60 * 1000; // 1 hour
        
        if (now - lastWork < cooldown) {
            return { earned: 0, cooldownRemaining: cooldown - (now - lastWork), description: '' };
        }
        
        const workScenarios = [
            { job: 'Pizza Delivery Driver', min: 25000, max: 60000 },
            { job: 'Dog Walker', min: 25000, max: 40000 },
            { job: 'Uber Driver', min: 40000, max: 75000 },
            { job: 'Freelance Web Designer', min: 60000, max: 100000 },
            { job: 'Casino Dealer', min: 50000, max: 90000 },
            { job: 'Security Guard', min: 30000, max: 70000 }
        ];

        const scenario = secureRandomChoice(workScenarios);
        const earning = secureRandomInt(scenario.min, scenario.max + 1);
        
        return { 
            earned: earning, 
            cooldownRemaining: 0, 
            description: `Worked as ${scenario.job}` 
        };
    },

    /**
     * Process beg command logic (uses existing beg command logic)
     */
    async processBeg(balance, now) {
        const lastBeg = balance.last_beg_ts || 0;
        const cooldown = 60 * 60 * 1000; // 1 hour
        
        if (now - lastBeg < cooldown) {
            return { earned: 0, cooldownRemaining: cooldown - (now - lastBeg), description: '' };
        }
        
        const begScenarios = [
            { person: 'a kind stranger', min: 5000, max: 15000 },
            { person: 'a wealthy businessman', min: 10000, max: 25000 },
            { person: 'a generous tourist', min: 7500, max: 20000 },
            { person: 'a sympathetic casino employee', min: 12500, max: 30000 },
            { person: 'a lucky high roller', min: 15000, max: 40000 }
        ];

        const scenario = secureRandomChoice(begScenarios);
        const earning = secureRandomInt(scenario.min, scenario.max + 1);
        
        return { 
            earned: earning, 
            cooldownRemaining: 0, 
            description: `Approached ${scenario.person}` 
        };
    },

    /**
     * Process crime command logic (uses existing crime command logic)
     */
    async processCrime(balance, now) {
        const lastCrime = balance.last_crime_ts || 0;
        const cooldown = 30 * 60 * 1000; // 30 minutes
        
        if (now - lastCrime < cooldown) {
            return { earned: 0, cooldownRemaining: cooldown - (now - lastCrime), description: '' };
        }
        
        const crimeScenarios = [
            { crime: 'Pickpocketed a distracted gambler', min: 5000, max: 12500 },
            { crime: 'Found forgotten chips under a slot machine', min: 6000, max: 15000 },
            { crime: 'Swiped loose change from a fountain', min: 5000, max: 9000 },
            { crime: 'Sold fake casino "insider tips"', min: 10000, max: 20000 },
            { crime: 'Collected dropped betting slips', min: 7500, max: 17500 },
            { crime: 'Scammed tourists with rigged dice', min: 12500, max: 25000 },
            { crime: 'Snuck extra chips during confusion', min: 9000, max: 21000 }
        ];

        const scenario = secureRandomChoice(crimeScenarios);
        const earning = secureRandomInt(scenario.min, scenario.max + 1);
        
        return { 
            earned: earning, 
            cooldownRemaining: 0, 
            description: scenario.crime 
        };
    },

    /**
     * Process heist command logic (uses existing heist command logic)  
     */
    async processHeist(balance, now) {
        const lastHeist = balance.last_heist_ts || 0;
        const cooldown = 150 * 60 * 1000; // 2.5 hours
        
        if (now - lastHeist < cooldown) {
            return { earned: 0, cooldownRemaining: cooldown - (now - lastHeist), description: '' };
        }
        
        const heistScenarios = [
            { target: 'Casino Vault', min: 100000, max: 150000 },
            { target: 'High-Stakes Poker Room', min: 75000, max: 125000 },
            { target: 'VIP Lounge', min: 60000, max: 110000 },
            { target: 'Sports Betting Counter', min: 90000, max: 140000 },
            { target: 'Slot Machine Jackpot', min: 80000, max: 130000 }
        ];

        const scenario = secureRandomChoice(heistScenarios);
        const earning = secureRandomInt(scenario.min, scenario.max + 1);
        
        return { 
            earned: earning, 
            cooldownRemaining: 0, 
            description: `Robbed ${scenario.target}` 
        };
    },

    /**
     * Process daily task command logic
     */
    async processDailyTask(balance, now) {
        const lastTask = balance.last_dailytask_ts || 0;
        const cooldown = 24 * 60 * 60 * 1000; // 24 hours
        
        if (now - lastTask < cooldown) {
            return { earned: 0, cooldownRemaining: cooldown - (now - lastTask), description: '' };
        }
        
        const taskScenarios = [
            { task: 'Cleaned casino floors', min: 25000, max: 40000 },
            { task: 'Organized chip inventory', min: 30000, max: 50000 },
            { task: 'Assisted VIP guests', min: 40000, max: 60000 },
            { task: 'Maintained slot machines', min: 27500, max: 47500 },
            { task: 'Counted card deck inventory', min: 35000, max: 55000 },
            { task: 'Updated security protocols', min: 45000, max: 75000 }
        ];

        const scenario = secureRandomChoice(taskScenarios);
        const earning = secureRandomInt(scenario.min, scenario.max + 1);
        
        return { 
            earned: earning, 
            cooldownRemaining: 0, 
            description: scenario.task 
        };
    },

    /**
     * Process quiz command logic  
     */
    async processQuiz(balance, now) {
        const lastQuiz = balance.last_quiz_ts || 0;
        const cooldown = 2 * 60 * 60 * 1000; // 2 hours
        
        if (now - lastQuiz < cooldown) {
            return { earned: 0, cooldownRemaining: cooldown - (now - lastQuiz), description: '' };
        }
        
        const quizTopics = [
            { topic: 'Casino History trivia', min: 15000, max: 25000 },
            { topic: 'Poker knowledge quiz', min: 20000, max: 30000 },
            { topic: 'Mathematics challenge', min: 17500, max: 27500 },
            { topic: 'General knowledge test', min: 15000, max: 22500 },
            { topic: 'Gaming strategy questions', min: 22500, max: 35000 },
            { topic: 'Lucky number predictions', min: 25000, max: 40000 }
        ];

        const topic = secureRandomChoice(quizTopics);
        const earning = secureRandomInt(topic.min, topic.max + 1);
        
        return { 
            earned: earning, 
            cooldownRemaining: 0, 
            description: `Completed ${topic.topic}` 
        };
    },

    /**
     * Get emoji for command
     */
    getCommandEmoji(command) {
        const emojis = {
            earn: '💰',
            work: '💼',
            beg: '🤲',
            crime: '🦹',
            heist: '🎭',
            dailytask: '📋',
            quiz: '🧠'
        };
        return emojis[command] || '💸';
    }
};
