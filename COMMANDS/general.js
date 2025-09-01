/**
 * General economy commands for the casino bot
 * Includes balance, earn, work, beg, crime, and other economy features
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtFull, fmtDelta, getGuildId, sendLogMessage, getTierDisplay, getEconomicTier, calculateDailyInterest } = require('../UTILS/common');
const { secureRandomInt, secureRandomFloat, secureRandomChance } = require('../UTILS/rng');
const UITemplates = require('../UTILS/uiTemplates');
const logger = require('../UTILS/logger');
const levelingSystem = require('../UTILS/levelingSystem');

// Developer ID for Off-Economy status
const DEVELOPER_ID = '466050111680544798';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your current balance')
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Check your balance or another user\'s balance')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to check balance for (admin only)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('shop')
                .setDescription('Get the link to the casino web shop')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'shop') {
            const shopEmbed = new EmbedBuilder()
                .setTitle('🛒 ATIVE Casino Web Shop')
                .setDescription('**Purchase coins and VIP subscriptions through our secure web store!**')
                .addFields(
                    {
                        name: '💰 Available Products',
                        value: '• **200K Coins** - $9.99\n• **500K Coins** - $19.99\n• **1M Coins** - $39.99\n• **Diamond VIP** - $4.99/month\n• **Ruby VIP** - $9.99/month',
                        inline: false
                    },
                    {
                        name: '🔐 Secure Payment',
                        value: '• **PayPal** payment processing\n• **Discord OAuth2** login\n• **Instant** coin delivery\n• **Automatic** role assignment',
                        inline: false
                    }
                )
                .setColor(0x00D4FF)
                .setThumbnail(interaction.client.user.displayAvatarURL())
                .setFooter({ text: '🎰 ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.reply({
                content: '🌐 **Visit our web shop:** https://ative-casino-bot-production.up.railway.app/shop',
                embeds: [shopEmbed],
                ephemeral: false
            });
            return;
        } else if (subcommand === 'check') {
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
                
                // Check if this is the developer (Off-Economy status)
                const isOffEconomy = targetUser.id === DEVELOPER_ID;

                // Get aggregated win/loss stats across all games
                const gameStats = await this.getAggregatedGameStats(userId, guildId);

                // Use gameSessionKit for consistent UI styling
                const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
                
                const topFields = [];
                
                // Main balance information
                topFields.push({
                    name: '💰 BALANCE OVERVIEW',
                    value: `💵 **Wallet:** ${fmtFull(balance.wallet)}\n🏦 **Bank:** ${fmtFull(balance.bank)}\n💎 **Total Worth:** ${fmtFull(totalBalance)}`,
                    inline: false
                });

                // Status information (tier or off-economy)
                if (isOffEconomy) {
                    topFields.push({
                        name: '🛡️ DEVELOPER STATUS',
                        value: `**Status:** Off-Economy (Developer)\n**Protection:** Cannot be robbed\n**System Access:** Full admin privileges`,
                        inline: false
                    });
                } else {
                    topFields.push({
                        name: '🎖️ ECONOMIC STATUS',
                        value: `**Tier:** ${getTierDisplay(totalBalance)}\n**Interest Rate:** ${tier.interest > 0 ? `${(tier.interest * 100).toFixed(0)}% Annual` : 'None'}\n**Daily Interest:** ${dailyInterest > 0 ? fmtFull(dailyInterest) : 'None'}`,
                        inline: false
                    });
                }

                // Gaming statistics
                if (gameStats.totalGames > 0) {
                    const winRate = ((gameStats.totalWins / gameStats.totalGames) * 100).toFixed(1);
                    const netProfit = gameStats.totalWon - gameStats.totalWagered;
                    const netText = netProfit >= 0 ? `+${fmtFull(netProfit)}` : fmtFull(netProfit);
                    const netEmoji = netProfit >= 0 ? '✅' : '❌';
                    
                    topFields.push({
                        name: '🎮 GAMING STATISTICS',
                        value: `**Games Played:** ${gameStats.totalGames.toLocaleString()}\n**Win Rate:** ${winRate}% (${gameStats.totalWins}W/${gameStats.totalLosses}L)\n**Net Profit:** ${netEmoji} ${netText}`,
                        inline: false
                    });
                } else {
                    topFields.push({
                        name: '🎮 GAMING STATISTICS',
                        value: `**Games Played:** 0\n**Win Rate:** N/A\n**Net Profit:** No gambling activity`,
                        inline: false
                    });
                }

                // Bank fields for consistent layout
                const bankFields = [
                    { name: '💵 Wallet Balance', value: fmtFull(balance.wallet), inline: true },
                    { name: '🏦 Bank Balance', value: fmtFull(balance.bank), inline: true },
                    { name: '💎 Total Worth', value: fmtFull(totalBalance), inline: true }
                ];

                const embed = buildSessionEmbed({
                    title: `💰 ${targetUser.displayName}'s Balance`,
                    topFields,
                    bankFields,
                    stageText: isOffEconomy ? 'OFF-ECONOMY' : tier.name.toUpperCase(),
                    color: isOffEconomy ? 0x9B59B6 : (tier.color || 0x3498DB),
                    footer: `Balance Command • Use /mystats for detailed game statistics`
                });

                await interaction.reply({ embeds: [embed] });
            } catch (error) {
                logger.error(`Error in balance check: ${error.message}`);
                
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '❌ An error occurred while checking balance. Please try again.',
                        ephemeral: true
                    });
                }
            }
        } else {
            // Invalid subcommand - should not happen but handle gracefully
            await interaction.reply({
                content: '❌ Invalid subcommand. Please try again.',
                ephemeral: true
            });
            return;
        }
    },

    /**
     * Get aggregated game statistics across all games for a user
     */
    async getAggregatedGameStats(userId, guildId) {
        try {
            // List of all possible game types
            const gameTypes = [
                'blackjack', 'slots', 'multi-slots', 'crash', 'duck', 'fishing', 
                'plinko', 'rps', 'bingo', 'battleship', 'uno', 'roulette', 
                'baccarat', 'coinflip', 'dice', 'heist', 'lottery'
            ];

            let totalWins = 0;
            let totalLosses = 0;
            let totalWagered = 0;
            let totalWon = 0;

            for (const gameType of gameTypes) {
                try {
                    const stats = await dbManager.getUserStats(userId, guildId, gameType);
                    if (stats) {
                        totalWins += stats.wins || 0;
                        totalLosses += stats.losses || 0;
                        totalWagered += stats.total_wagered || 0;
                        totalWon += stats.total_won || 0;
                    }
                } catch (error) {
                    // Skip this game type if error occurs
                    continue;
                }
            }

            return {
                totalWins,
                totalLosses,
                totalGames: totalWins + totalLosses,
                totalWagered,
                totalWon
            };
        } catch (error) {
            logger.error(`Error getting aggregated game stats: ${error.message}`);
            return {
                totalWins: 0,
                totalLosses: 0,
                totalGames: 0,
                totalWagered: 0,
                totalWon: 0
            };
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

                const cooldownEmbed = UITemplates.createErrorEmbed('Earn', {
                    description: `You can earn again in ${hours}h ${minutes}m ${seconds}s`,
                    title: '⏰ Cooldown Active',
                    isLoss: false,
                    color: UITemplates.getColors().WARNING
                });

                return await interaction.reply({ embeds: [cooldownEmbed], flags: MessageFlags.Ephemeral });
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

            const embed = UITemplates.createStandardGameEmbed(
                'Earnings Collected!',
                `You earned **${fmt(totalEarning)}** from hourly earnings!`,
                newWallet,
                {
                    minBet: 0,
                    maxBet: 0,
                    wins: 0,
                    losses: 0,
                    gameSpecific: [
                        { name: '💰 Amount Earned', value: fmt(totalEarning), inline: true },
                        { name: '🔄 Change', value: fmtDelta(newWallet, balance.wallet), inline: true },
                        { name: '⏰ Next Earn', value: 'Available in 1 hour', inline: true }
                    ]
                }
            ).setColor(UITemplates.getColors().SUCCESS);

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
            
            if (!interaction.replied && !interaction.deferred) {
                try {
                    const errorEmbed = UITemplates.createErrorEmbed('Earn', {
                        description: 'Failed to process earning. Please try again.',
                        error: error.message,
                        isLoss: false
                    });

                    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                } catch (replyError) {
                    logger.error(`Failed to send earn error reply: ${replyError.message}`);
                }
            }
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
            
            // Add XP for work
            const xpResult = await levelingSystem.handleWork(userId, guildId);

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
            
            if (!interaction.replied && !interaction.deferred) {
                try {
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('❌ Error')
                        .setDescription('Failed to process work. Please try again.')
                        .setColor(0xFF0000);

                    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                } catch (replyError) {
                    logger.error(`Failed to send work error reply: ${replyError.message}`);
                }
            }
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
            
            if (!interaction.replied && !interaction.deferred) {
                try {
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('❌ Begging Failed')
                        .setDescription('Something went wrong while begging. Please try again.')
                        .setColor(0xFF0000)
                        .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                        .setFooter({ text: '🛠️ Error • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

                    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                } catch (replyError) {
                    logger.error(`Failed to send beg error reply: ${replyError.message}`);
                }
            }
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
            
            if (!interaction.replied && !interaction.deferred) {
                try {
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('❌ Crime Failed')
                        .setDescription('Your crime was unsuccessful! Better luck next time.')
                        .setColor(0xFF0000)
                        .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                        .setFooter({ text: '🛠️ Error • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

                    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                } catch (replyError) {
                    logger.error(`Failed to send crime error reply: ${replyError.message}`);
                }
            }
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
            
            if (!interaction.replied && !interaction.deferred) {
                try {
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('❌ Heist Failed')
                        .setDescription('Your heist was foiled! The authorities were waiting for you.')
                        .addFields({ name: '🚨 Result', value: 'Mission compromised - try again later', inline: false })
                        .setColor(0xFF0000)
                        .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                        .setFooter({ text: '🛠️ Error • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

                    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                } catch (replyError) {
                    logger.error(`Failed to send heist error reply: ${replyError.message}`);
                }
            }
        }
    }
};

// Profile command to view level and stats
const profileCommand = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View your level and stats')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to view profile of')
                .setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;
        const guildId = await getGuildId(interaction);

        try {
            // Get user level data
            const levelData = await levelingSystem.getUserLevel(userId, guildId);
            
            if (!levelData) {
                return await interaction.reply({ 
                    content: 'Failed to retrieve profile data. Please try again later.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            // Create profile embed
            const profileEmbed = levelingSystem.createProfileEmbed(targetUser, levelData);
            
            await interaction.reply({ embeds: [profileEmbed] });

        } catch (error) {
            logger.error(`Error in profile command: ${error.message}`);
            
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({ 
                        content: 'An error occurred while fetching the profile.', 
                        flags: MessageFlags.Ephemeral 
                    });
                } catch (replyError) {
                    logger.error(`Failed to send profile error reply: ${replyError.message}`);
                }
            }
        }
    }
};

// Level Leaderboard command
const leaderboardCommand = {
    data: new SlashCommandBuilder()
        .setName('levels')
        .setDescription('View the server level leaderboard'),

    async execute(interaction) {
        const guildId = await getGuildId(interaction);

        try {
            // Get leaderboard data
            const leaderboard = await levelingSystem.getLeaderboard(guildId, 10);
            
            if (!leaderboard || leaderboard.length === 0) {
                return await interaction.reply({ 
                    content: 'No leaderboard data available yet.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            // Create leaderboard embed
            const embed = new EmbedBuilder()
                .setTitle('🏆 Level Leaderboard')
                .setColor(0xFFD700)
                .setDescription('Top 10 users by level and XP')
                .setTimestamp();

            let description = '';
            for (let i = 0; i < leaderboard.length; i++) {
                const entry = leaderboard[i];
                const position = i + 1;
                const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `**${position}.**`;
                
                try {
                    const user = await interaction.client.users.fetch(entry.user_id);
                    description += `${medal} ${user.username} - Level ${entry.level} (${entry.total_xp.toLocaleString()} XP)\n`;
                } catch {
                    description += `${medal} Unknown User - Level ${entry.level} (${entry.total_xp.toLocaleString()} XP)\n`;
                }
            }

            embed.setDescription(description);
            
            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            logger.error(`Error in leaderboard command: ${error.message}`);
            
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({ 
                        content: 'An error occurred while fetching the leaderboard.', 
                        flags: MessageFlags.Ephemeral 
                    });
                } catch (replyError) {
                    logger.error(`Failed to send leaderboard error reply: ${replyError.message}`);
                }
            }
        }
    }
};

// Test XP command (Developer only)
const testXpCommand = {
    data: new SlashCommandBuilder()
        .setName('testxp')
        .setDescription('Test XP system (Developer only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to give XP to')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of XP to give')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10000)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        
        // Check if user is developer
        if (userId !== '466050111680544798') {
            return await interaction.reply({ 
                content: '❌ This command is only available to the developer.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        try {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const xpAmount = interaction.options.getInteger('amount') || 100;
            const targetUserId = targetUser.id;

            logger.info(`Developer ${userId} is giving ${xpAmount} XP to ${targetUserId}`);

            // Add XP
            const result = await levelingSystem.addXp(targetUserId, guildId, xpAmount, 'developer_test');
            
            if (!result) {
                return await interaction.reply({ 
                    content: '❌ Failed to add XP. Check logs for details.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            let response = `✅ Added ${xpAmount} XP to ${targetUser.username}!\n`;
            response += `New Total: ${result.totalXp} XP (Level ${result.level || result.newLevel})`;

            if (result.leveledUp) {
                response += `\n\n🎉 **LEVEL UP!** ${targetUser.username} is now level ${result.newLevel}!`;
                
                // Send level up notification
                try {
                    const levelUpChannel = interaction.client.channels.cache.get('1411018763008217208');
                    if (levelUpChannel) {
                        const levelUpEmbed = levelingSystem.createLevelUpEmbed(targetUser, result.newLevel);
                        await levelUpChannel.send({ 
                            content: `<@${targetUserId}>, you are now level ${result.newLevel}! (Test XP)`,
                            embeds: [levelUpEmbed] 
                        });
                    }
                } catch (levelError) {
                    logger.error(`Failed to send test level up notification: ${levelError.message}`);
                }
            }

            await interaction.reply({ content: response, flags: MessageFlags.Ephemeral });

        } catch (error) {
            logger.error(`Error in testxp command: ${error.message}`);
            
            await interaction.reply({ 
                content: '❌ An error occurred while testing XP.', 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
};

// Set XP command (Developer only) - Sets absolute XP values
const setXpCommand = {
    data: new SlashCommandBuilder()
        .setName('setxp')
        .setDescription('Set absolute XP and level for a user (Developer only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to set XP for')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('xp')
                .setDescription('Total XP to set')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100000)
        )
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Level to set (optional - will calculate from XP if not provided)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(100)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        
        // Check if user is developer
        if (userId !== '466050111680544798') {
            return await interaction.reply({ 
                content: '❌ This command is only available to the developer.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        try {
            const targetUser = interaction.options.getUser('user');
            const newTotalXp = interaction.options.getInteger('xp');
            const manualLevel = interaction.options.getInteger('level');
            const targetUserId = targetUser.id;

            // Calculate level from XP if not manually provided
            const newLevel = manualLevel || levelingSystem.calculateLevel(newTotalXp);

            logger.info(`Developer ${userId} is setting ${targetUserId} to ${newTotalXp} XP (Level ${newLevel})`);

            // Check if database is initialized
            if (!dbManager.databaseAdapter || !dbManager.databaseAdapter.pool) {
                return await interaction.reply({ 
                    content: '❌ Database not initialized.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            const pool = dbManager.databaseAdapter.pool;

            // Get current user data to see old values
            const oldData = await levelingSystem.getUserLevel(targetUserId, guildId);
            if (!oldData) {
                return await interaction.reply({ 
                    content: '❌ Failed to get user data.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            // Use direct database update for absolute XP setting
            const [result] = await pool.execute(
                `INSERT INTO user_levels (user_id, guild_id, level, xp, total_xp, games_played, games_won, messages_sent, last_level_up) 
                 VALUES (?, ?, ?, ?, ?, 0, 0, 0, CURRENT_TIMESTAMP)
                 ON DUPLICATE KEY UPDATE 
                 level = ?, xp = ?, total_xp = ?, last_level_up = CURRENT_TIMESTAMP`,
                [targetUserId, guildId, newLevel, newTotalXp, newTotalXp, newLevel, newTotalXp, newTotalXp]
            );

            if (result.affectedRows === 0) {
                return await interaction.reply({ 
                    content: '❌ Failed to set XP. Check logs for details.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            let response = `✅ Set XP for ${targetUser.username}!\n`;
            response += `Previous: ${oldData.total_xp} XP (Level ${oldData.level})\n`;
            response += `New: ${newTotalXp} XP (Level ${newLevel})`;

            if (newLevel > oldData.level) {
                response += `\n\n🎉 **LEVEL UP!** ${targetUser.username} is now level ${newLevel}!`;
                
                // Send level up notification if leveled up
                try {
                    const levelUpChannel = interaction.client.channels.cache.get('1411018763008217208');
                    if (levelUpChannel) {
                        const levelUpEmbed = levelingSystem.createLevelUpEmbed(targetUser, newLevel);
                        await levelUpChannel.send({ 
                            content: `<@${targetUserId}>, you are now level ${newLevel}! (Manual XP Set)`,
                            embeds: [levelUpEmbed] 
                        });
                    }
                } catch (levelError) {
                    logger.error(`Failed to send manual level up notification: ${levelError.message}`);
                }
            }

            await interaction.reply({ content: response, flags: MessageFlags.Ephemeral });

        } catch (error) {
            logger.error(`Error in setxp command: ${error.message}`);
            
            await interaction.reply({ 
                content: '❌ An error occurred while setting XP.', 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
};

// Debug XP command (Developer only) - Check XP tracking status
const debugXpCommand = {
    data: new SlashCommandBuilder()
        .setName('debugxp')
        .setDescription('Debug XP system for a user (Developer only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to debug XP for')
                .setRequired(true)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        
        // Check if user is developer
        if (userId !== '466050111680544798') {
            return await interaction.reply({ 
                content: '❌ This command is only available to the developer.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        try {
            const targetUser = interaction.options.getUser('user');
            const targetUserId = targetUser.id;

            // Check database connection
            if (!dbManager.databaseAdapter || !dbManager.databaseAdapter.pool) {
                return await interaction.reply({ 
                    content: '❌ Database not initialized.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            const pool = dbManager.databaseAdapter.pool;

            // Get raw database data
            const [rows] = await pool.execute(
                'SELECT * FROM user_levels WHERE user_id = ? AND guild_id = ?',
                [targetUserId, guildId]
            );

            let response = `🔍 **XP Debug for ${targetUser.username}**\n\n`;

            if (rows.length === 0) {
                response += '❌ **No record found in database**\n';
                response += 'User has never received XP or their record is missing.\n\n';
                
                // Try to create a fresh record
                response += '🔧 **Creating fresh user record...**\n';
                const userData = await levelingSystem.getUserLevel(targetUserId, guildId);
                if (userData) {
                    response += `✅ User record created: Level ${userData.level}, ${userData.total_xp} XP`;
                } else {
                    response += '❌ Failed to create user record';
                }
            } else {
                const data = rows[0];
                response += `📊 **Database Record:**\n`;
                response += `• Level: ${data.level}\n`;
                response += `• Current XP: ${data.xp}\n`;
                response += `• Total XP: ${data.total_xp}\n`;
                response += `• Games Played: ${data.games_played}\n`;
                response += `• Games Won: ${data.games_won}\n`;
                response += `• Messages Sent: ${data.messages_sent}\n`;
                response += `• Last Level Up: ${data.last_level_up || 'Never'}\n\n`;

                // Calculate expected level
                const expectedLevel = levelingSystem.calculateLevel(data.total_xp);
                if (expectedLevel !== data.level) {
                    response += `⚠️ **Level Mismatch!**\n`;
                    response += `Expected Level: ${expectedLevel} (from ${data.total_xp} XP)\n`;
                    response += `Stored Level: ${data.level}\n\n`;
                }

                // Test adding XP
                response += `🧪 **Testing XP Addition...**\n`;
                const testResult = await levelingSystem.addXp(targetUserId, guildId, 1, 'debug_test');
                if (testResult) {
                    response += `✅ XP system working - added 1 XP successfully\n`;
                    response += `New Total: ${testResult.totalXp} XP`;
                    if (testResult.leveledUp) {
                        response += ` (LEVEL UP to ${testResult.newLevel}!)`;
                    }
                } else {
                    response += `❌ XP system failed - check logs for errors`;
                }
            }

            await interaction.reply({ content: response, flags: MessageFlags.Ephemeral });

        } catch (error) {
            logger.error(`Error in debugxp command: ${error.message}`, { error: error.stack });
            
            await interaction.reply({ 
                content: `❌ An error occurred during XP debug: ${error.message}`, 
                flags: MessageFlags.Ephemeral 
            });
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
    heistCommand,
    profileCommand,
    leaderboardCommand,
    testXpCommand,
    setXpCommand,
    debugXpCommand
};