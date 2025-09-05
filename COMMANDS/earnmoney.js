/**
 * EarnMoney command - Available only to users with 10+ votes and active streak
 * Combines all economy commands (/earn, /work, /beg, /crime, /heist) into one
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage, calculateBoosterBonus } = require('../UTILS/common');
const { secureRandomInt } = require('../UTILS/rng');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('earnmoney')
        .setDescription('Claim all economy commands at once (requires 10+ votes & active streak)'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = await getGuildId(interaction);

        try {
            await interaction.deferReply();
            await dbManager.ensureUser(userId, username);
            
            // Check if user has voting privileges for /earnmoney
            const voteData = await dbManager.getUserVoteData(userId, guildId);
            
            if (!voteData || !voteData.can_use_earnmoney) {
                const totalVotes = voteData?.total_votes || 0;
                const currentStreak = voteData?.vote_streak || 0;
                
                const lockEmbed = buildSessionEmbed({
                    title: '🔒 EarnMoney Command Locked',
                    topFields: [
                        { name: '🗳️ Requirements Not Met', value: 'This command requires **10+ votes AND an active voting streak**!' },
                        { name: '📊 Your Stats', value: `Votes: ${totalVotes}/10\nStreak: ${currentStreak} days` }
                    ],
                    stageText: 'VOTING REQUIRED',
                    color: 0xFF6B6B,
                    footer: 'Use /vote to start building your voting streak!'
                });

                return await interaction.editReply({ embeds: [lockEmbed] });
            }
            
            // Get current balance and check cooldowns
            const balance = await dbManager.getUserBalance(userId, guildId);
            const now = Date.now() / 1000;
            
            // Check all cooldowns and calculate earnings
            const results = {
                earn: await this.processEarn(balance, now),
                work: await this.processWork(balance, now),
                beg: await this.processBeg(balance, now),
                crime: await this.processCrime(balance, now),
                heist: await this.processHeist(balance, now)
            };

            // Calculate total earnings
            const baseEarnings = Object.values(results).reduce((sum, result) => sum + (result.earned || 0), 0);
            
            // Calculate server booster bonus (2% on total earnings)
            const boosterInfo = calculateBoosterBonus(baseEarnings, interaction.member);
            const boosterBonus = boosterInfo.amount;
            const totalEarned = baseEarnings + boosterBonus;
            
            if (baseEarnings === 0) {
                const cooldowns = Object.entries(results)
                    .filter(([_, result]) => result.cooldownRemaining > 0)
                    .map(([command, result]) => {
                        const minutes = Math.floor(result.cooldownRemaining / 60);
                        const seconds = Math.floor(result.cooldownRemaining % 60);
                        return `${this.getCommandEmoji(command)} **${command}**: ${minutes}m ${seconds}s`;
                    });

                const cooldownEmbed = buildSessionEmbed({
                    title: '⏰ All Commands on Cooldown',
                    topFields: [
                        { name: '🕐 Active Cooldowns', value: cooldowns.join('\n') || 'No active cooldowns' }
                    ],
                    stageText: 'WAIT FOR COOLDOWNS',
                    color: 0xFFAA00,
                    footer: 'Come back when cooldowns expire!'
                });

                return await interaction.editReply({ embeds: [cooldownEmbed] });
            }

            // Update balance with total earnings
            const newWallet = balance.wallet + totalEarned;
            
            // Update all timestamps
            const updateFields = {};
            if (results.earn.earned > 0) updateFields.last_earn_ts = now;
            if (results.work.earned > 0) updateFields.last_work_ts = now;
            if (results.beg.earned > 0) updateFields.last_beg_ts = now;
            if (results.crime.earned > 0) updateFields.last_crime_ts = now;
            if (results.heist.earned > 0) updateFields.last_heist_ts = now;

            await dbManager.setUserBalance(userId, guildId, newWallet, balance.bank, updateFields);

            // Create earnings fields for display
            const earnedFields = Object.entries(results)
                .filter(([_, result]) => result.earned > 0)
                .map(([command, result]) => ({ 
                    name: `${this.getCommandEmoji(command)} ${command.toUpperCase()}`, 
                    value: `${fmt(result.earned)}\n*${result.description}*`, 
                    inline: true 
                }));

            // Banking information with boost display
            const bankFields = [
                { name: '💎 Total Earned', value: boosterInfo.isBooster ? `${fmt(totalEarned)} (🚀 +${fmt(boosterBonus)})` : fmt(totalEarned), inline: true },
                { name: '💵 New Balance', value: fmt(newWallet), inline: true },
                { name: boosterInfo.isBooster ? '🚀 Boost Active' : '📈 Change', value: boosterInfo.isBooster ? '+2% Bonus' : fmtDelta(totalEarned), inline: true }
            ];

            const successEmbed = buildSessionEmbed({
                title: boosterInfo.isBooster ? `💰 ${username}'s EarnMoney Success! (🚀 BOOSTED)` : `💰 ${username}'s EarnMoney Success!`,
                topFields: earnedFields,
                bankFields,
                stageText: boosterInfo.isBooster ? 'ALL COMMANDS CLAIMED + BOOST' : 'ALL COMMANDS CLAIMED',
                color: 0x00FF00,
                footer: `🗳️ Exclusive to voters • ${earnedFields.length} commands claimed • ATIVE Casino`
            });

            await interaction.editReply({ embeds: [successEmbed] });

            // Log the earnmoney usage
            const logMessage = boosterInfo.isBooster 
                ? `EarnMoney claimed (BOOSTED): ${username} earned ${fmt(totalEarned)} (base: ${fmt(baseEarnings)} + boost: ${fmt(boosterBonus)}) from ${earnedFields.length} commands (Votes: ${voteData.total_votes}, Streak: ${voteData.vote_streak} days) - New Balance: ${fmt(newWallet)}`
                : `EarnMoney claimed: ${username} earned ${fmt(totalEarned)} from ${earnedFields.length} commands (Votes: ${voteData.total_votes}, Streak: ${voteData.vote_streak} days) - New Balance: ${fmt(newWallet)}`;
            
            await sendLogMessage(
                interaction.client,
                'economy',
                logMessage,
                userId,
                guildId
            );

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
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `EarnMoney error for ${username} (${userId}) — ${error.message}`,
                    userId,
                    guildId
                );
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
        const cooldown = 3600; // 1 hour
        
        if (now - lastEarn < cooldown) {
            return { earned: 0, cooldownRemaining: cooldown - (now - lastEarn), description: '' };
        }
        
        const earning = secureRandomInt(15000, 30001);
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
        const cooldown = 3600; // 1 hour
        
        if (now - lastWork < cooldown) {
            return { earned: 0, cooldownRemaining: cooldown - (now - lastWork), description: '' };
        }
        
        const workScenarios = [
            { job: 'Pizza Delivery Driver', min: 5000, max: 12000 },
            { job: 'Dog Walker', min: 5000, max: 8000 },
            { job: 'Uber Driver', min: 8000, max: 15000 },
            { job: 'Freelance Web Designer', min: 12000, max: 20000 },
            { job: 'Casino Dealer', min: 10000, max: 18000 },
            { job: 'Security Guard', min: 6000, max: 14000 }
        ];

        const scenario = workScenarios[secureRandomInt(0, workScenarios.length)];
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
        const cooldown = 3600; // 1 hour
        
        if (now - lastBeg < cooldown) {
            return { earned: 0, cooldownRemaining: cooldown - (now - lastBeg), description: '' };
        }
        
        const begScenarios = [
            { person: 'a kind stranger', min: 1000, max: 3000 },
            { person: 'a wealthy businessman', min: 2000, max: 5000 },
            { person: 'a generous tourist', min: 1500, max: 4000 },
            { person: 'a sympathetic casino employee', min: 2500, max: 6000 },
            { person: 'a lucky high roller', min: 3000, max: 8000 }
        ];

        const scenario = begScenarios[secureRandomInt(0, begScenarios.length)];
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
        const cooldown = 1800; // 30 minutes
        
        if (now - lastCrime < cooldown) {
            return { earned: 0, cooldownRemaining: cooldown - (now - lastCrime), description: '' };
        }
        
        const crimeScenarios = [
            { crime: 'Pickpocketed a distracted gambler', min: 1000, max: 2500 },
            { crime: 'Found forgotten chips under a slot machine', min: 1200, max: 3000 },
            { crime: 'Swiped loose change from a fountain', min: 1000, max: 1800 },
            { crime: 'Sold fake casino "insider tips"', min: 2000, max: 4000 },
            { crime: 'Collected dropped betting slips', min: 1500, max: 3500 },
            { crime: 'Scammed tourists with rigged dice', min: 2500, max: 5000 },
            { crime: 'Snuck extra chips during confusion', min: 1800, max: 4200 }
        ];

        const scenario = crimeScenarios[secureRandomInt(0, crimeScenarios.length)];
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
        const cooldown = 9000; // 2.5 hours
        
        if (now - lastHeist < cooldown) {
            return { earned: 0, cooldownRemaining: cooldown - (now - lastHeist), description: '' };
        }
        
        const heistScenarios = [
            { target: 'Casino Vault', min: 20000, max: 30000 },
            { target: 'High-Stakes Poker Room', min: 15000, max: 25000 },
            { target: 'VIP Lounge', min: 12000, max: 22000 },
            { target: 'Sports Betting Counter', min: 18000, max: 28000 },
            { target: 'Slot Machine Jackpot', min: 16000, max: 26000 }
        ];

        const scenario = heistScenarios[secureRandomInt(0, heistScenarios.length)];
        const earning = secureRandomInt(scenario.min, scenario.max + 1);
        
        return { 
            earned: earning, 
            cooldownRemaining: 0, 
            description: `Robbed ${scenario.target}` 
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
            heist: '🎭'
        };
        return emojis[command] || '💸';
    }
};