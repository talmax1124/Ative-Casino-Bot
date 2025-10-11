const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const { validateAmount } = require('../UTILS/moneyFormatter');
const logger = require('../UTILS/logger');
const nodeCache = require('../UTILS/nodeCache');
const axios = require('axios');
const QuickChart = require('quickchart-js');

// Stock price cache TTL - 30 minutes
const STOCK_CACHE_TTL = 1800;
const STOCK_CACHE_KEY = 'stocks:prices';

// Popular stock symbols
const POPULAR_STOCKS = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'AMD', 'UBER'
];

// API configurations for stocks
const API_CONFIGS = {
    polygon: {
        name: 'Polygon.io',
        priority: 1,
        rateLimitPerPeriod: 4,
        periodMinutes: 30,
        keyEnvVar: 'POLYGON_API_KEY'
    },
    alphavantage: {
        name: 'Alpha Vantage',
        priority: 2,
        rateLimitPerPeriod: 25,
        periodMinutes: 60,
        keyEnvVar: 'ALPHA_VANTAGE_API_KEY'
    },
    finnhub: {
        name: 'Finnhub',
        priority: 3,
        rateLimitPerPeriod: 50,
        periodMinutes: 60,
        keyEnvVar: 'FINNHUB_API_KEY'
    },
    twelvedata: {
        name: 'Twelve Data',
        priority: 4,
        rateLimitPerPeriod: 80,
        periodMinutes: 60,
        keyEnvVar: 'TWELVE_DATA_API_KEY'
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('marriage')
        .setDescription('Marriage system - manage your marriage, shared bank, stocks, and tasks')
        .addSubcommandGroup(group =>
            group
                .setName('bank')
                .setDescription('Manage your shared marriage bank account')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('balance')
                        .setDescription('Check your shared bank balance')
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('deposit')
                        .setDescription('Deposit money into shared bank')
                        .addStringOption(option =>
                            option.setName('amount')
                                .setDescription('Amount to deposit (supports K/M/B/T, "all", "half")')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('withdraw')
                        .setDescription('Withdraw money from shared bank')
                        .addStringOption(option =>
                            option.setName('amount')
                                .setDescription('Amount to withdraw (supports K/M/B/T, "all", "half")')
                                .setRequired(true)
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('profile')
                .setDescription('View your marriage profile')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('View another user\'s marriage profile')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('tasks')
                .setDescription('View and complete weekly marriage tasks')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Choose an action')
                        .setRequired(true)
                        .addChoices(
                            { name: 'View Tasks', value: 'view' },
                            { name: 'Complete Task', value: 'complete' }
                        )
                )
                .addIntegerOption(option =>
                    option.setName('task_number')
                        .setDescription('Task number to complete (1-10)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(10)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('propose')
                .setDescription('Propose marriage to another user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to propose to')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Your proposal message (optional)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('ceremony')
                .setDescription('Start your wedding ceremony after proposal acceptance')
                .addStringOption(option =>
                    option.setName('role')
                        .setDescription('Your role in the marriage')
                        .addChoices(
                            { name: 'Husband', value: 'husband' },
                            { name: 'Wife', value: 'wife' }
                        )
                        .setRequired(true)
                )
                .addUserOption(option =>
                    option.setName('maid_of_honor')
                        .setDescription('Choose maid of honor (optional)')
                        .setRequired(false)
                )
                .addUserOption(option =>
                    option.setName('best_person')
                        .setDescription('Choose best man/woman (optional)')
                        .setRequired(false)
                )
                .addUserOption(option =>
                    option.setName('flower_girl')
                        .setDescription('Choose flower girl (optional)')
                        .setRequired(false)
                )
                .addUserOption(option =>
                    option.setName('ring_bearer')
                        .setDescription('Choose ring bearer (optional)')
                        .setRequired(false)
                )
                .addUserOption(option =>
                    option.setName('officiant')
                        .setDescription('Choose officiant (optional)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('divorce')
                .setDescription('End your marriage (irreversible action)')
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for divorce (optional)')
                        .setRequired(false)
                )
        )
        .addSubcommandGroup(group =>
            group
                .setName('stocks')
                .setDescription('Marriage-only stock trading system')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('price')
                        .setDescription('Get current stock price')
                        .addStringOption(option =>
                            option.setName('symbol')
                                .setDescription('Stock symbol (e.g., AAPL, MSFT)')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('buy')
                        .setDescription('Purchase stocks')
                        .addStringOption(option =>
                            option.setName('symbol')
                                .setDescription('Stock symbol (e.g., AAPL, MSFT)')
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option.setName('shares')
                                .setDescription('Number of shares to buy')
                                .setRequired(true)
                                .setMinValue(1)
                                .setMaxValue(100000)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('sell')
                        .setDescription('Sell stocks')
                        .addStringOption(option =>
                            option.setName('symbol')
                                .setDescription('Stock symbol (e.g., AAPL, MSFT)')
                                .setRequired(false)
                        )
                        .addIntegerOption(option =>
                            option.setName('shares')
                                .setDescription('Number of shares to sell')
                                .setRequired(false)
                                .setMinValue(1)
                                .setMaxValue(100000)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('portfolio')
                        .setDescription('View your stock portfolio')
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('popular')
                        .setDescription('View popular stocks to invest in')
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('analytics')
                        .setDescription('View advanced portfolio analytics')
                )
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        
        await interaction.deferReply();

        try {
            // Check if user is married (except for profile viewing)
            const subcommand = interaction.options.getSubcommand();
            const group = interaction.options.getSubcommandGroup();
            
            // Handle propose and ceremony without marriage requirement
            if (subcommand === 'propose') {
                await this.handlePropose(interaction, userId, guildId);
            } else if (subcommand === 'ceremony') {
                await this.handleCeremony(interaction, userId, guildId);
            } else if (subcommand === 'profile' && interaction.options.getUser('user')) {
                // Handle profile viewing for other users
                await this.handleProfile(interaction, userId, guildId);
            } else {
                // Check if user is married for other features
                const marriageData = await dbManager.getUserMarriage(userId, guildId);
                
                if (!marriageData.married && subcommand !== 'profile') {
                    await interaction.editReply({
                        content: '❌ You need to be married to use this feature! Use `/marriage propose` to start your love story.'
                    });
                    return;
                }
                
                // Route to appropriate handler
                if (group === 'bank') {
                    await this.handleBank(interaction, userId, guildId, marriageData.marriage);
                } else if (group === 'stocks') {
                    await this.handleStocks(interaction, userId, guildId, marriageData.marriage);
                } else if (subcommand === 'tasks') {
                    await this.handleTasks(interaction, userId, guildId, marriageData.marriage);
                } else if (subcommand === 'profile') {
                    await this.handleProfile(interaction, userId, guildId);
                } else if (subcommand === 'divorce') {
                    await this.handleDivorce(interaction, userId, guildId, marriageData.marriage);
                }
            }

        } catch (error) {
            logger.error(`Error in marriage command: ${error.message}`);
            await interaction.editReply({
                content: '❌ An error occurred. Please try again later.'
            });
        }
    },

    // Bank handlers
    async handleBank(interaction, userId, guildId, marriage) {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'balance':
                await this.handleBankBalance(interaction, marriage);
                break;
            case 'deposit':
                await this.handleBankDeposit(interaction, userId, guildId, marriage);
                break;
            case 'withdraw':
                await this.handleBankWithdraw(interaction, userId, guildId, marriage);
                break;
        }
    },

    async handleBankBalance(interaction, marriage) {
        const balanceEmbed = new EmbedBuilder()
            .setTitle('💰 Marriage Shared Bank Account')
            .setDescription(`<@${marriage.partner1_id}> & <@${marriage.partner2_id}>`)
            .addFields(
                {
                    name: '💳 Current Balance',
                    value: fmt(marriage.shared_bank),
                    inline: true
                },
                {
                    name: '📊 Account Status',
                    value: 'Active',
                    inline: true
                },
                {
                    name: '👫 Account Holders',
                    value: `• <@${marriage.partner1_id}>\n• <@${marriage.partner2_id}>`,
                    inline: false
                },
                {
                    name: '💡 Tips',
                    value: '• Both partners can deposit and withdraw\n• Use `/marriage bank deposit` to add funds\n• Use `/marriage bank withdraw` to take funds\n• No transaction fees between spouses',
                    inline: false
                }
            )
            .setColor(0x00D4AA)
            .setTimestamp()
            .setFooter({ text: '💒 ATIVE Casino Marriage Banking' });

        await interaction.editReply({ embeds: [balanceEmbed] });
    },

    async handleBankDeposit(interaction, userId, guildId, marriage) {
        const amountStr = interaction.options.getString('amount');
        const userBalance = await dbManager.getUserBalance(userId, guildId);
        const validation = validateAmount(amountStr, userBalance.wallet, 100);
        
        if (!validation.isValid) {
            await interaction.editReply({ content: `❌ ${validation.error}` });
            return;
        }
        
        const amount = validation.amount;
        const result = await dbManager.transferToSharedBank(userId, guildId, amount);

        if (!result.success) {
            await interaction.editReply({ content: `❌ Deposit failed: ${result.error}` });
            return;
        }

        // Invalidate cache
        try {
            const cacheKey = `casino:balance:${userId}:${guildId}`;
            await nodeCache.del(cacheKey);
        } catch (cacheError) {
            logger.debug(`Cache refresh failed: ${cacheError.message}`);
        }

        const updatedUserBalance = await dbManager.getUserBalance(userId, guildId);

        const depositEmbed = new EmbedBuilder()
            .setTitle('💰 Deposit Successful')
            .setDescription(`**${interaction.user.displayName}** deposited ${fmt(amount)} into the marriage shared bank!`)
            .addFields(
                {
                    name: '💳 New Shared Balance',
                    value: fmt(result.newSharedBalance),
                    inline: true
                },
                {
                    name: '💸 Amount Deposited',
                    value: fmt(amount),
                    inline: true
                },
                {
                    name: '💼 Your New Wallet',
                    value: fmt(updatedUserBalance.wallet),
                    inline: true
                }
            )
            .setColor(0x00FF00)
            .setTimestamp()
            .setFooter({ text: '💒 ATIVE Casino Marriage Banking' });

        await interaction.editReply({ embeds: [depositEmbed] });

        await sendLogMessage(
            interaction.client,
            'economy',
            `Marriage bank deposit: ${interaction.user.displayName} deposited ${fmt(amount)}`,
            userId,
            guildId
        );

        // Notify partner
        try {
            const partnerId = marriage.partner1_id === userId ? marriage.partner2_id : marriage.partner1_id;
            const partner = await interaction.client.users.fetch(partnerId);
            await partner.send(`💰 Your spouse **${interaction.user.displayName}** deposited ${fmt(amount)} into your shared marriage bank account!\n\nNew balance: ${fmt(result.newSharedBalance)}`);
        } catch (dmError) {
            logger.info(`Could not notify partner of deposit: ${dmError.message}`);
        }
    },

    async handleBankWithdraw(interaction, userId, guildId, marriage) {
        const amountStr = interaction.options.getString('amount');
        const validation = validateAmount(amountStr, marriage.shared_bank, 100);
        
        if (!validation.isValid) {
            await interaction.editReply({ content: `❌ ${validation.error}` });
            return;
        }
        
        const amount = validation.amount;
        const result = await dbManager.withdrawFromSharedBank(userId, guildId, amount);

        if (!result.success) {
            await interaction.editReply({ content: `❌ Withdrawal failed: ${result.error}` });
            return;
        }

        // Invalidate cache
        try {
            const cacheKey = `casino:balance:${userId}:${guildId}`;
            await nodeCache.del(cacheKey);
        } catch (cacheError) {
            logger.debug(`Cache refresh failed: ${cacheError.message}`);
        }

        const userBalance = await dbManager.getUserBalance(userId, guildId);

        const withdrawEmbed = new EmbedBuilder()
            .setTitle('💰 Withdrawal Successful')
            .setDescription(`**${interaction.user.displayName}** withdrew ${fmt(amount)} from the marriage shared bank!`)
            .addFields(
                {
                    name: '💳 New Shared Balance',
                    value: fmt(result.newSharedBalance),
                    inline: true
                },
                {
                    name: '💸 Amount Withdrawn',
                    value: fmt(amount),
                    inline: true
                },
                {
                    name: '💼 Your New Wallet',
                    value: fmt(userBalance.wallet),
                    inline: true
                }
            )
            .setColor(0xFF9500)
            .setTimestamp()
            .setFooter({ text: '💒 ATIVE Casino Marriage Banking' });

        await interaction.editReply({ embeds: [withdrawEmbed] });

        await sendLogMessage(
            interaction.client,
            'economy',
            `Marriage bank withdrawal: ${interaction.user.displayName} withdrew ${fmt(amount)}`,
            userId,
            guildId
        );

        // Notify partner
        try {
            const partnerId = marriage.partner1_id === userId ? marriage.partner2_id : marriage.partner1_id;
            const partner = await interaction.client.users.fetch(partnerId);
            await partner.send(`💸 Your spouse **${interaction.user.displayName}** withdrew ${fmt(amount)} from your shared marriage bank account.\n\nRemaining balance: ${fmt(result.newSharedBalance)}`);
        } catch (dmError) {
            logger.info(`Could not notify partner of withdrawal: ${dmError.message}`);
        }
    },

    // Profile handler
    async handleProfile(interaction, userId, guildId) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const targetId = targetUser.id;
        
        const marriageData = await dbManager.getUserMarriage(targetId, guildId);
        
        if (!marriageData.married) {
            if (targetId === userId) {
                await interaction.editReply({
                    content: '❌ You are not married yet! Use `/marriage propose` to find your special someone.'
                });
            } else {
                await interaction.editReply({
                    content: `❌ **${targetUser.displayName}** is not married yet.`
                });
            }
            return;
        }

        const marriage = marriageData.marriage;
        const partnerId = marriage.partner1_id === targetId ? marriage.partner2_id : marriage.partner1_id;
        
        let partner;
        try {
            partner = await interaction.client.users.fetch(partnerId);
        } catch (error) {
            partner = { displayName: 'Unknown User', id: partnerId };
        }

        const marriageDate = new Date(marriage.created_at);
        const daysTogether = Math.floor((Date.now() - marriageDate) / (1000 * 60 * 60 * 24));
        
        // Get task progress
        const weeklyTasks = marriage.weekly_tasks || [];
        const completedTasks = weeklyTasks.filter(task => task.completed).length;
        const totalTasks = weeklyTasks.length;

        // Get stock portfolio value
        const portfolio = await dbManager.getMarriageStockPortfolio(marriage.marriage_id);
        let portfolioValue = 0;
        
        if (portfolio && portfolio.length > 0) {
            for (const stock of portfolio) {
                const cachedPrice = await nodeCache.get(`stock:${stock.symbol}:price`);
                if (cachedPrice) {
                    portfolioValue += cachedPrice * stock.shares;
                }
            }
        }

        const profileEmbed = new EmbedBuilder()
            .setTitle(`💒 Marriage Profile`)
            .setDescription(`**${targetUser.displayName}** & **${partner.displayName}**`)
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
                {
                    name: '💑 Partners',
                    value: `<@${targetId}> & <@${partnerId}>`,
                    inline: false
                },
                {
                    name: '📅 Anniversary',
                    value: `${marriageDate.toLocaleDateString()}\n(${daysTogether} days together)`,
                    inline: true
                },
                {
                    name: '💰 Shared Bank',
                    value: fmt(marriage.shared_bank),
                    inline: true
                },
                {
                    name: '📈 Stock Portfolio',
                    value: portfolioValue > 0 ? fmt(portfolioValue) : 'No investments',
                    inline: true
                },
                {
                    name: '📊 Marriage Stats',
                    value: `**Level:** ${marriage.level || 1}\n**XP:** ${marriage.xp || 0}/${(marriage.level || 1) * 100}\n**Tasks:** ${completedTasks}/${totalTasks} this week`,
                    inline: true
                },
                {
                    name: '🏆 Achievements',
                    value: this.getAchievements(marriage, daysTogether),
                    inline: true
                }
            )
            .setColor(0xFF69B4)
            .setTimestamp()
            .setFooter({ text: '💒 ATIVE Casino Marriage System' });

        await interaction.editReply({ embeds: [profileEmbed] });
    },

    getAchievements(marriage, daysTogether) {
        const achievements = [];
        
        if (daysTogether >= 7) achievements.push('💏 Week Together');
        if (daysTogether >= 30) achievements.push('💑 Month Together');
        if (daysTogether >= 100) achievements.push('💖 100 Days');
        if (daysTogether >= 365) achievements.push('💍 Anniversary');
        
        if (marriage.shared_bank >= 1000000) achievements.push('💰 Millionaires');
        if (marriage.shared_bank >= 10000000) achievements.push('💎 Wealthy');
        
        if (marriage.level >= 10) achievements.push('⭐ Level 10');
        if (marriage.level >= 25) achievements.push('🌟 Level 25');
        if (marriage.level >= 50) achievements.push('✨ Level 50');
        
        return achievements.length > 0 ? achievements.join('\n') : 'None yet';
    },

    // Tasks handler
    async handleTasks(interaction, userId, guildId, marriage) {
        const marriageTaskModule = require('./marriage-task.js');
        
        // Pass the interaction to the existing marriage-task handler logic
        const action = interaction.options.getString('action');
        const taskNumber = interaction.options.getInteger('task_number');
        
        // Create a modified interaction that matches what the old command expects
        const modifiedInteraction = {
            ...interaction,
            options: {
                ...interaction.options,
                getString: (key) => {
                    if (key === 'action') return action;
                    return interaction.options.getString(key);
                },
                getInteger: (key) => {
                    if (key === 'task_number') return taskNumber;
                    return interaction.options.getInteger(key);
                }
            }
        };
        
        // Execute the old command's logic
        await marriageTaskModule.execute(modifiedInteraction);
    },

    // Stocks handlers
    async handleStocks(interaction, userId, guildId, marriage) {
        const marriageStocksModule = require('./marriage-stocks.js');
        
        // Execute the old command's logic
        await marriageStocksModule.execute(interaction);
    },

    // Propose handler
    async handlePropose(interaction, userId, guildId) {
        const proposeModule = require('./propose.js');
        await proposeModule.execute(interaction);
    },

    // Ceremony handler  
    async handleCeremony(interaction, userId, guildId) {
        const ceremonyModule = require('./start-marriage.js');
        await ceremonyModule.execute(interaction);
    },

    // Divorce handler
    async handleDivorce(interaction, userId, guildId, marriage) {
        const divorceModule = require('./divorce.js');
        await divorceModule.execute(interaction);
    }
};