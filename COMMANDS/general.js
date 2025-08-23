/**
 * General economy commands for the casino bot
 * Includes balance, earn, work, beg, crime, and other economy features
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtFull, fmtDelta, getGuildId, sendLogMessage, getTierDisplay, getEconomicTier, calculateDailyInterest } = require('../UTILS/common');
const { secureRandomInt, secureRandomFloat, secureRandomChance } = require('../UTILS/rng');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your current balance')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to check balance for (admin only)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;
        const guildId = await getGuildId(interaction);

        // Check if user is trying to check someone else's balance
        if (targetUser.id !== interaction.user.id) {
            // TODO: Check admin permissions
            // For now, allow everyone to check
        }

        try {
            await dbManager.ensureUser(userId, targetUser.displayName);
            const balance = await dbManager.getUserBalance(userId, guildId);

            const totalBalance = balance.wallet + balance.bank;
            const tier = getEconomicTier(totalBalance);
            const dailyInterest = calculateDailyInterest(balance.bank, totalBalance);

            // Use gameSessionKit for consistent UI styling
            const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
            
            // Balance details in topFields
            const topFields = [{
                name: '💰 BALANCE OVERVIEW',
                value: `**Player:** ${targetUser.displayName}\n` +
                       `\`\`\`fix\nWallet: ${fmtFull(balance.wallet)}    Bank: ${fmtFull(balance.bank)}    Total: ${fmtFull(totalBalance)}\`\`\``,
                inline: false
            }];

            // Financial information in bankFields
            const bankFields = [
                { name: '💵 Wallet Balance', value: fmtFull(balance.wallet), inline: true },
                { name: '🏦 Bank Balance', value: fmtFull(balance.bank), inline: true },
                { name: '💎 Total Worth', value: fmtFull(totalBalance), inline: true },
                { name: '🎖️ Economic Tier', value: getTierDisplay(totalBalance), inline: true },
                { name: '💰 Daily Interest', value: dailyInterest > 0 ? fmtFull(dailyInterest) : 'None', inline: true },
                { name: '📊 Interest Rate', value: tier.interest > 0 ? `${(tier.interest * 100).toFixed(0)}% Annual` : 'N/A', inline: true }
            ];

            // Stage text for current status
            const stageText = 'BALANCE CHECK';
            
            // Build the embed using gameSessionKit
            const embed = buildSessionEmbed({
                title: `💰 ${targetUser.displayName}'s Balance`,
                topFields,
                bankFields,
                stageText,
                color: tier.color,
                footer: '💰 Balance • Economic Tier System • ATIVE Casino'
            });

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            logger.error(`Error checking balance: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Failed to retrieve balance. Please try again.')
                .setColor(0xFF0000);

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};

// Additional economy commands can be added here
const earnCommand = {
    data: new SlashCommandBuilder()
        .setName('earn')
        .setDescription('Earn coins every hour'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        try {
            await dbManager.ensureUser(userId, interaction.user.displayName);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Check cooldown (1 hour = 3600 seconds)
            const now = Date.now() / 1000;
            const lastEarn = balance.last_earn_ts || 0;
            const cooldown = 3600; // 1 hour

            if (now - lastEarn < cooldown) {
                const remainingTime = Math.ceil(cooldown - (now - lastEarn));
                const hours = Math.floor(remainingTime / 3600);
                const minutes = Math.floor((remainingTime % 3600) / 60);
                const seconds = remainingTime % 60;

                const embed = new EmbedBuilder()
                    .setTitle('⏰ Cooldown Active')
                    .setDescription(`You can earn again in ${hours}h ${minutes}m ${seconds}s`)
                    .setColor(0xFFFF00);

                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            // Calculate earnings (15K-30K base)
            const baseEarning = secureRandomInt(15000, 30001);
            
            // TODO: Apply server booster bonus (+15%)
            let totalEarning = baseEarning;

            // Update balance and timestamp
            const newWallet = balance.wallet + totalEarning;
            await dbManager.setUserBalance(userId, guildId, newWallet, balance.bank, {
                last_earn_ts: now
            });

            const embed = new EmbedBuilder()
                .setTitle('💰 Earnings Collected!')
                .setDescription(`You earned ${fmt(totalEarning)}!`)
                .addFields(
                    { name: 'Previous Balance', value: fmt(balance.wallet), inline: true },
                    { name: 'New Balance', value: fmt(newWallet), inline: true },
                    { name: 'Change', value: fmtDelta(newWallet, balance.wallet), inline: true }
                )
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Log the earning
            await sendLogMessage(
                interaction.client,
                'info',
                `**Earn Command Used**\n` +
                `**User:** ${interaction.user} (\`${interaction.user.id}\`)\n` +
                `**Amount:** ${fmt(totalEarning)}\n` +
                `**New Balance:** ${fmt(newWallet)}`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error processing earn command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Failed to process earning. Please try again.')
                .setColor(0xFF0000);

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};

const workCommand = {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Work for coins'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        try {
            await dbManager.ensureUser(userId, interaction.user.displayName);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Check cooldown (1 hour)
            const now = Date.now() / 1000;
            const lastWork = balance.last_work_ts || 0;
            const cooldown = 3600; // 1 hour

            if (now - lastWork < cooldown) {
                const remainingTime = Math.ceil(cooldown - (now - lastWork));
                const hours = Math.floor(remainingTime / 3600);
                const minutes = Math.floor((remainingTime % 3600) / 60);

                const embed = new EmbedBuilder()
                    .setTitle('⏰ Still Working')
                    .setDescription(`You're still at work! Come back in ${hours}h ${minutes}m`)
                    .setColor(0xFFFF00);

                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            // Work scenarios (5K-30K range)
            const workScenarios = [
                { job: 'Pizza Delivery Driver', min: 5000, max: 12000 },
                { job: 'Dog Walker', min: 5000, max: 8000 },
                { job: 'Uber Driver', min: 8000, max: 15000 },
                { job: 'Freelance Programmer', min: 15000, max: 30000 },
                { job: 'Barista', min: 5000, max: 9000 },
                { job: 'Cashier', min: 6000, max: 11000 },
                { job: 'Casino Dealer', min: 10000, max: 25000 },
                { job: 'Construction Worker', min: 12000, max: 22000 },
                { job: 'Delivery Driver', min: 8000, max: 18000 }
            ];

            const scenario = workScenarios[secureRandomInt(0, workScenarios.length)];
            const earning = secureRandomInt(scenario.min, scenario.max + 1);

            // Update balance and timestamp
            const newWallet = balance.wallet + earning;
            await dbManager.setUserBalance(userId, guildId, newWallet, balance.bank, {
                last_work_ts: now
            });

            const embed = new EmbedBuilder()
                .setTitle('💼 Work Complete!')
                .setDescription(`You worked as a ${scenario.job} and earned ${fmt(earning)}!`)
                .addFields(
                    { name: 'Previous Balance', value: fmt(balance.wallet), inline: true },
                    { name: 'New Balance', value: fmt(newWallet), inline: true },
                    { name: 'Earned', value: fmtDelta(newWallet, balance.wallet), inline: true }
                )
                .setColor(0x0099FF)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            logger.error(`Error processing work command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Failed to process work. Please try again.')
                .setColor(0xFF0000);

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};

const begCommand = {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('Beg for coins (1K-10K every hour)'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        try {
            await dbManager.ensureUser(userId, interaction.user.displayName);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Check cooldown (1 hour)
            const now = Date.now() / 1000;
            const lastBeg = balance.last_beg_ts || 0;
            const cooldown = 3600; // 1 hour

            if (now - lastBeg < cooldown) {
                const remainingTime = Math.ceil(cooldown - (now - lastBeg));
                const hours = Math.floor(remainingTime / 3600);
                const minutes = Math.floor((remainingTime % 3600) / 60);
                const seconds = remainingTime % 60;

                const embed = new EmbedBuilder()
                    .setTitle('🤲 Already Begged')
                    .setDescription(`You already begged recently! Come back in ${hours}h ${minutes}m ${seconds}s`)
                    .setColor(0xFFAA00)
                    .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                    .setFooter({ text: '🤲 Beg Command • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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

            const scenario = begScenarios[secureRandomInt(0, begScenarios.length)];
            const earning = secureRandomInt(scenario.min, scenario.max + 1);

            // Update balance and timestamp
            const newWallet = balance.wallet + earning;
            await dbManager.setUserBalance(userId, guildId, newWallet, balance.bank, {
                last_beg_ts: now
            });

            const embed = new EmbedBuilder()
                .setTitle('🤲 Begging Success!')
                .setDescription(`You approached ${scenario.person} and they ${scenario.message}!`)
                .addFields(
                    { name: '💰 Amount Received', value: fmt(earning), inline: true },
                    { name: '💵 Previous Balance', value: fmt(balance.wallet), inline: true },
                    { name: '💸 New Balance', value: fmt(newWallet), inline: true }
                )
                .setColor(0x32CD32)
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({ text: '🤲 Beg Command • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Log the begging
            await sendLogMessage(
                interaction.client,
                'info',
                `**Beg Command Used**\n` +
                `**User:** ${interaction.user} (\`${interaction.user.id}\`)\n` +
                `**Amount:** ${fmt(earning)}\n` +
                `**Scenario:** ${scenario.person} ${scenario.message}\n` +
                `**New Balance:** ${fmt(newWallet)}`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error processing beg command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Begging Failed')
                .setDescription('Something went wrong while begging. Please try again.')
                .setColor(0xFF0000)
                .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                .setFooter({ text: '🛠️ Error • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};

const crimeCommand = {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('Commit petty crimes for quick cash (1K-5K every 30 minutes)'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        try {
            await dbManager.ensureUser(userId, interaction.user.displayName);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Check cooldown (30 minutes)
            const now = Date.now() / 1000;
            const lastCrime = balance.last_crime_ts || 0;
            const cooldown = 1800; // 30 minutes

            if (now - lastCrime < cooldown) {
                const remainingTime = Math.ceil(cooldown - (now - lastCrime));
                const minutes = Math.floor(remainingTime / 60);
                const seconds = remainingTime % 60;

                const embed = new EmbedBuilder()
                    .setTitle('🚨 Laying Low')
                    .setDescription(`The heat is still on! Lay low for ${minutes}m ${seconds}s before your next crime`)
                    .setColor(0xFF6B6B)
                    .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                    .setFooter({ text: '🚨 Crime Command • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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

            const scenario = crimeScenarios[secureRandomInt(0, crimeScenarios.length)];
            const earning = secureRandomInt(scenario.min, scenario.max + 1);

            // Update balance and timestamp
            const newWallet = balance.wallet + earning;
            await dbManager.setUserBalance(userId, guildId, newWallet, balance.bank, {
                last_crime_ts: now
            });

            const embed = new EmbedBuilder()
                .setTitle('🦹 Crime Complete!')
                .setDescription(`You successfully ${scenario.crime.toLowerCase()} and got away with ${fmt(earning)}!`)
                .addFields(
                    { name: '💰 Crime Earnings', value: fmt(earning), inline: true },
                    { name: '💵 Previous Balance', value: fmt(balance.wallet), inline: true },
                    { name: '💸 New Balance', value: fmt(newWallet), inline: true }
                )
                .setColor(0x8B0000)
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({ text: '🦹 Crime Command • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Log the crime
            await sendLogMessage(
                interaction.client,
                'info',
                `**Crime Command Used**\n` +
                `**User:** ${interaction.user} (\`${interaction.user.id}\`)\n` +
                `**Amount:** ${fmt(earning)}\n` +
                `**Crime:** ${scenario.crime}\n` +
                `**New Balance:** ${fmt(newWallet)}`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error processing crime command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Crime Failed')
                .setDescription('Your crime was unsuccessful! Better luck next time.')
                .setColor(0xFF0000)
                .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                .setFooter({ text: '🛠️ Error • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};

const heistCommand = {
    data: new SlashCommandBuilder()
        .setName('heist')
        .setDescription('Plan and execute a heist for big money (10K-30K every 2.5 hours)'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        try {
            await dbManager.ensureUser(userId, interaction.user.displayName);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Check cooldown (2.5 hours)
            const now = Date.now() / 1000;
            const lastHeist = balance.last_heist_ts || 0;
            const cooldown = 9000; // 2.5 hours (2.5 * 60 * 60)

            if (now - lastHeist < cooldown) {
                const remainingTime = Math.ceil(cooldown - (now - lastHeist));
                const hours = Math.floor(remainingTime / 3600);
                const minutes = Math.floor((remainingTime % 3600) / 60);

                const embed = new EmbedBuilder()
                    .setTitle('🎭 Planning Phase')
                    .setDescription(`You're still planning your next big heist! Come back in ${hours}h ${minutes}m`)
                    .addFields({ name: '🕵️ Status', value: 'Gathering intel and assembling crew...', inline: false })
                    .setColor(0x4B0082)
                    .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                    .setFooter({ text: '🎭 Heist Command • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            // Heist scenarios with different tasks (10K-30K range)
            const heistScenarios = [
                { 
                    target: 'Casino Vault', 
                    task: 'Disable security cameras and crack the safe',
                    difficulty: 'Expert',
                    min: 20000, 
                    max: 30000 
                },
                { 
                    target: 'High-Stakes Poker Room', 
                    task: 'Distract dealers while team swipes chips',
                    difficulty: 'Advanced',
                    min: 15000, 
                    max: 25000 
                },
                { 
                    target: 'VIP Lounge', 
                    task: 'Infiltrate exclusive party and rob wealthy patrons',
                    difficulty: 'Intermediate',
                    min: 12000, 
                    max: 22000 
                },
                { 
                    target: 'Armored Car', 
                    task: 'Intercept cash delivery to casino',
                    difficulty: 'Expert',
                    min: 18000, 
                    max: 28000 
                },
                { 
                    target: 'Casino Floor', 
                    task: 'Create diversion and steal from multiple machines',
                    difficulty: 'Beginner',
                    min: 10000, 
                    max: 18000 
                },
                { 
                    target: 'Private Game Room', 
                    task: 'Rob underground high-stakes game',
                    difficulty: 'Advanced',
                    min: 16000, 
                    max: 26000 
                }
            ];

            const scenario = heistScenarios[secureRandomInt(0, heistScenarios.length)];
            const earning = secureRandomInt(scenario.min, scenario.max + 1);

            // Update balance and timestamp
            const newWallet = balance.wallet + earning;
            await dbManager.setUserBalance(userId, guildId, newWallet, balance.bank, {
                last_heist_ts: now
            });

            const embed = new EmbedBuilder()
                .setTitle('🎭 Heist Successful!')
                .setDescription(`**Target:** ${scenario.target}\n**Mission:** ${scenario.task}`)
                .addFields(
                    { name: '🎯 Difficulty', value: scenario.difficulty, inline: true },
                    { name: '💰 Heist Earnings', value: fmt(earning), inline: true },
                    { name: '💎 Success Rate', value: '100%', inline: true },
                    { name: '💵 Previous Balance', value: fmt(balance.wallet), inline: true },
                    { name: '💸 New Balance', value: fmt(newWallet), inline: true },
                    { name: '📈 Profit', value: fmtDelta(newWallet, balance.wallet), inline: true }
                )
                .setColor(0x9932CC)
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({ text: '🎭 Heist Command • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Log the heist
            await sendLogMessage(
                interaction.client,
                'info',
                `**Heist Command Used**\n` +
                `**User:** ${interaction.user} (\`${interaction.user.id}\`)\n` +
                `**Amount:** ${fmt(earning)}\n` +
                `**Target:** ${scenario.target}\n` +
                `**Task:** ${scenario.task}\n` +
                `**Difficulty:** ${scenario.difficulty}\n` +
                `**New Balance:** ${fmt(newWallet)}`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error processing heist command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Heist Failed')
                .setDescription('Your heist was foiled! The authorities were waiting for you.')
                .addFields({ name: '🚨 Result', value: 'Mission compromised - try again later', inline: false })
                .setColor(0xFF0000)
                .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                .setFooter({ text: '🛠️ Error • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};

// Export multiple commands
module.exports = { 
    ...module.exports,
    earnCommand,
    workCommand,
    begCommand,
    crimeCommand,
    heistCommand
};