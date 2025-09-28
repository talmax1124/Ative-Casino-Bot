const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const { validateAmount } = require('../UTILS/moneyFormatter');
const logger = require('../UTILS/logger');
const nodeCache = require('../UTILS/nodeCache');
const axios = require('axios');
const QuickChart = require('quickchart-js');

// Stock price cache TTL - 30 minutes (1800 seconds)
const STOCK_CACHE_TTL = 1800;
const STOCK_CACHE_KEY = 'stocks:prices';

// Popular stock symbols for easier access
const POPULAR_STOCKS = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'AMD', 'UBER'
];

// API endpoints and configurations
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
        periodMinutes: 60, // 25 requests per day for free tier
        keyEnvVar: 'ALPHA_VANTAGE_API_KEY'
    },
    finnhub: {
        name: 'Finnhub',
        priority: 3,
        rateLimitPerPeriod: 50,
        periodMinutes: 60, // 60 calls per minute free
        keyEnvVar: 'FINNHUB_API_KEY'
    },
    twelvedata: {
        name: 'Twelve Data',
        priority: 4,
        rateLimitPerPeriod: 80,
        periodMinutes: 60, // 800 calls per day free
        keyEnvVar: 'TWELVE_DATA_API_KEY'
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('marriage-stocks')
        .setDescription('Marriage-only stock trading system with real-time data and charts')
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
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('shares')
                        .setDescription('Number of shares to sell')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(100000)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('portfolio')
                .setDescription('View your marriage stock portfolio')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('popular')
                .setDescription('View popular stocks with quick buy buttons')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('analytics')
                .setDescription('View detailed portfolio analytics with charts')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        await interaction.deferReply();

        try {
            // Check if user is married
            const marriageData = await dbManager.getUserMarriage(userId, guildId);

            if (!marriageData.married) {
                await interaction.editReply({
                    content: '💍 **Marriage Required!**\n\nThe stock trading system is exclusively available to married couples in ATIVE Casino. This ensures shared financial responsibility and decision-making.\n\nUse `/propose` to start your love story and gain access to advanced trading features! 💒'
                });
                return;
            }

            switch (subcommand) {
                case 'price':
                    await this.handlePrice(interaction, userId, guildId);
                    break;
                case 'buy':
                    await this.handleBuy(interaction, userId, guildId, marriageData.marriage);
                    break;
                case 'sell':
                    await this.handleSell(interaction, userId, guildId, marriageData.marriage);
                    break;
                case 'portfolio':
                    await this.handlePortfolio(interaction, userId, guildId, marriageData.marriage);
                    break;
                case 'popular':
                    await this.handlePopular(interaction, userId, guildId);
                    break;
                case 'analytics':
                    await this.handleAnalytics(interaction, userId, guildId, marriageData.marriage);
                    break;
            }

        } catch (error) {
            logger.error(`Error in stocks command: ${error.message}`);
            
            await interaction.editReply({
                content: '❌ An error occurred while processing your stock request. Please try again later.'
            });
        }
    },

    async handlePrice(interaction, userId, guildId) {
        const symbol = interaction.options.getString('symbol').toUpperCase().trim();

        // Basic symbol validation
        if (!symbol || symbol.length < 1 || symbol.length > 5 || !/^[A-Z]+$/.test(symbol)) {
            await interaction.editReply({
                content: `❌ Invalid stock symbol **${symbol}**. Please use a valid stock ticker (1-5 letters, e.g., AAPL, MSFT, GOOGL).`
            });
            return;
        }

        try {
            const stockData = await this.getStockPrice(symbol);

            if (!stockData) {
                await interaction.editReply({
                    content: `❌ Could not find stock data for symbol **${symbol}**. Please check the symbol and try again.\n\n💡 **Try:** AAPL, MSFT, GOOGL, TSLA, AMZN, META, NVDA`
                });
                return;
            }

            // Generate price chart
            const chartUrl = await this.generatePriceChart(symbol, stockData);

            const priceEmbed = new EmbedBuilder()
                .setTitle(`📈 ${symbol} Stock Price`)
                .setDescription(`Current market data for **${symbol}**${stockData.isMockData ? ' *(Demo Data)*' : ''}`)
                .addFields(
                    {
                        name: '💰 Current Price',
                        value: `$${stockData.price.toFixed(2)}`,
                        inline: true
                    },
                    {
                        name: '📊 24h Change',
                        value: `${stockData.change >= 0 ? '+' : ''}$${stockData.change.toFixed(2)} (${stockData.changePercent >= 0 ? '+' : ''}${stockData.changePercent.toFixed(2)}%)`,
                        inline: true
                    },
                    {
                        name: '📈 Open',
                        value: stockData.open ? `$${stockData.open.toFixed(2)}` : 'N/A',
                        inline: true
                    },
                    {
                        name: '📊 High',
                        value: stockData.high ? `$${stockData.high.toFixed(2)}` : 'N/A',
                        inline: true
                    },
                    {
                        name: '📉 Low',
                        value: stockData.low ? `$${stockData.low.toFixed(2)}` : 'N/A',
                        inline: true
                    },
                    {
                        name: '📦 Volume',
                        value: stockData.volume ? stockData.volume.toLocaleString() : 'N/A',
                        inline: true
                    },
                    {
                        name: '🕐 Last Updated',
                        value: new Date(stockData.timestamp).toLocaleString(),
                        inline: false
                    }
                )
                .setColor(stockData.change >= 0 ? 0x00FF00 : 0xFF0000)
                .setTimestamp()
                .setFooter({ text: '📈 ATIVE Casino Stock Trading' });

            if (chartUrl) {
                priceEmbed.setImage(chartUrl);
            }

            await interaction.editReply({ embeds: [priceEmbed] });

        } catch (error) {
            logger.error(`Error getting stock price: ${error.message}`);
            await interaction.editReply({
                content: '❌ Failed to fetch stock price. Please try again later.'
            });
        }
    },

    async handleBuy(interaction, userId, guildId, marriage) {
        const symbol = interaction.options.getString('symbol').toUpperCase();
        const shares = interaction.options.getInteger('shares');

        try {
            const stockData = await this.getStockPrice(symbol);

            if (!stockData) {
                await interaction.editReply({
                    content: `❌ Could not find stock data for symbol **${symbol}**. Please check the symbol and try again.`
                });
                return;
            }

            const totalCost = stockData.price * shares;
            const minimumCost = 100; // Minimum $100 investment

            if (totalCost < minimumCost) {
                await interaction.editReply({
                    content: `❌ Minimum investment is $${minimumCost}. Your order (${shares} shares × $${stockData.price.toFixed(2)}) = $${totalCost.toFixed(2)}.`
                });
                return;
            }

            // Check marriage shared bank balance
            if (marriage.shared_bank < totalCost) {
                await interaction.editReply({
                    content: `❌ Insufficient funds in marriage shared bank.\n\n**Required:** ${fmt(totalCost)}\n**Available:** ${fmt(marriage.shared_bank)}\n\nUse \`/marriage-bank deposit\` to add funds to your shared account.`
                });
                return;
            }

            // Create purchase confirmation
            const confirmEmbed = new EmbedBuilder()
                .setTitle('📊 Stock Purchase Confirmation')
                .setDescription(`**${interaction.user.displayName}** wants to purchase stocks for the marriage`)
                .addFields(
                    {
                        name: '📈 Stock',
                        value: symbol,
                        inline: true
                    },
                    {
                        name: '📦 Shares',
                        value: shares.toString(),
                        inline: true
                    },
                    {
                        name: '💰 Price per Share',
                        value: `$${stockData.price.toFixed(2)}`,
                        inline: true
                    },
                    {
                        name: '💸 Total Cost',
                        value: fmt(totalCost),
                        inline: true
                    },
                    {
                        name: '🏦 Shared Bank Balance',
                        value: fmt(marriage.shared_bank),
                        inline: true
                    },
                    {
                        name: '💳 Remaining After Purchase',
                        value: fmt(marriage.shared_bank - totalCost),
                        inline: true
                    }
                )
                .setColor(0xFFD700)
                .setTimestamp()
                .setFooter({ text: '⚠️ This will be deducted from your marriage shared bank' });

            const confirmButton = new ButtonBuilder()
                .setCustomId(`stock_buy_${symbol}_${shares}_${stockData.price.toFixed(2)}`)
                .setLabel('✅ Confirm Purchase')
                .setStyle(ButtonStyle.Success);

            const cancelButton = new ButtonBuilder()
                .setCustomId('stock_cancel')
                .setLabel('❌ Cancel')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

            const confirmMessage = await interaction.editReply({ 
                embeds: [confirmEmbed],
                components: [row]
            });

            // Wait for button interaction
            try {
                const buttonInteraction = await confirmMessage.awaitMessageComponent({
                    filter: (i) => i.user.id === userId,
                    time: 60000 // 1 minute timeout
                });

                if (buttonInteraction.customId === 'stock_cancel') {
                    await buttonInteraction.update({
                        content: '❌ Stock purchase cancelled.',
                        embeds: [],
                        components: []
                    });
                    return;
                }

                // Process the purchase
                await this.processPurchase(buttonInteraction, userId, guildId, symbol, shares, stockData.price, marriage);

            } catch (timeoutError) {
                await interaction.editReply({
                    content: '⏰ Purchase confirmation timed out. Please try again.',
                    embeds: [],
                    components: []
                });
            }

        } catch (error) {
            logger.error(`Error in stock buy: ${error.message}`);
            await interaction.editReply({
                content: '❌ Failed to process stock purchase. Please try again later.'
            });
        }
    },

    async processPurchase(interaction, userId, guildId, symbol, shares, pricePerShare, marriage) {
        try {
            const totalCost = pricePerShare * shares;

            // Deduct from shared bank
            const deductResult = await dbManager.withdrawFromSharedBank(userId, guildId, totalCost);

            if (!deductResult.success) {
                await interaction.update({
                    content: `❌ Purchase failed: ${deductResult.error}`,
                    embeds: [],
                    components: []
                });
                return;
            }

            // Record stock purchase in database
            await this.recordStockTransaction(marriage.id, symbol, shares, pricePerShare, 'buy', guildId, userId);

            // Success embed
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Stock Purchase Successful!')
                .setDescription(`**${interaction.user.displayName}** purchased stocks for the marriage`)
                .addFields(
                    {
                        name: '📈 Stock Purchased',
                        value: `${shares} shares of **${symbol}**`,
                        inline: false
                    },
                    {
                        name: '💰 Total Cost',
                        value: fmt(totalCost),
                        inline: true
                    },
                    {
                        name: '💳 New Shared Bank Balance',
                        value: fmt(deductResult.newSharedBalance),
                        inline: true
                    }
                )
                .setColor(0x00FF00)
                .setTimestamp()
                .setFooter({ text: '📊 ATIVE Casino Stock Trading' });

            await interaction.update({ 
                embeds: [successEmbed],
                components: []
            });

            // Log the transaction
            await sendLogMessage(
                interaction.client,
                'economy',
                `Stock purchase: ${interaction.user.displayName} bought ${shares} shares of ${symbol} for ${fmt(totalCost)}`,
                userId,
                guildId
            );

            // Notify partner
            try {
                const partnerId = marriage.partner1_id === userId ? marriage.partner2_id : marriage.partner1_id;
                const partner = await interaction.client.users.fetch(partnerId);
                await partner.send(`📈 Your spouse **${interaction.user.displayName}** purchased ${shares} shares of **${symbol}** for ${fmt(totalCost)} from your marriage shared bank!\n\nNew balance: ${fmt(deductResult.newSharedBalance)}`);
            } catch (dmError) {
                logger.info(`Could not notify partner of stock purchase: ${dmError.message}`);
            }

        } catch (error) {
            logger.error(`Error processing stock purchase: ${error.message}`);
            logger.error(`Purchase details: Symbol=${symbol}, Shares=${shares}, Price=${pricePerShare}, UserId=${userId}, MarriageId=${marriage.id}`);
            logger.error(`Error stack: ${error.stack}`);
            
            // Provide more specific error message
            let errorMsg = '❌ An error occurred during the purchase.';
            if (error.message.includes('withdraw')) {
                errorMsg = '❌ Failed to withdraw from shared bank. Please check your balance.';
            } else if (error.message.includes('transaction') || error.message.includes('database')) {
                errorMsg = '❌ Failed to record the transaction. Please try again.';
            } else if (error.message.includes('interaction')) {
                errorMsg = '❌ Failed to update the interaction. Please try the command again.';
            }
            
            await interaction.update({
                content: `${errorMsg}\n\n**Debug Info:** ${error.message}`,
                embeds: [],
                components: []
            });
        }
    },

    async handleSell(interaction, userId, guildId, marriage) {
        const symbol = interaction.options.getString('symbol').toUpperCase();
        const shares = interaction.options.getInteger('shares');

        try {
            // Check if marriage owns this stock
            const ownedShares = await this.getOwnedShares(marriage.id, symbol, guildId);

            if (ownedShares < shares) {
                await interaction.editReply({
                    content: `❌ Insufficient shares to sell.\n\n**You own:** ${ownedShares} shares of ${symbol}\n**Trying to sell:** ${shares} shares`
                });
                return;
            }

            const stockData = await this.getStockPrice(symbol);

            if (!stockData) {
                await interaction.editReply({
                    content: `❌ Could not get current price for **${symbol}**. Please try again later.`
                });
                return;
            }

            const totalValue = stockData.price * shares;

            // Process the sale
            await this.recordStockTransaction(marriage.id, symbol, shares, stockData.price, 'sell', guildId, userId);

            // Add to shared bank
            const addResult = await dbManager.addToSharedBank(marriage.partner1_id, guildId, totalValue);

            if (!addResult.success) {
                await interaction.editReply({
                    content: `❌ Sale failed: ${addResult.error}`
                });
                return;
            }

            // Success embed
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Stock Sale Successful!')
                .setDescription(`**${interaction.user.displayName}** sold stocks from the marriage portfolio`)
                .addFields(
                    {
                        name: '📉 Stock Sold',
                        value: `${shares} shares of **${symbol}**`,
                        inline: false
                    },
                    {
                        name: '💰 Total Received',
                        value: fmt(totalValue),
                        inline: true
                    },
                    {
                        name: '💳 New Shared Bank Balance',
                        value: fmt(addResult.newSharedBalance),
                        inline: true
                    }
                )
                .setColor(0x00FF00)
                .setTimestamp()
                .setFooter({ text: '📊 ATIVE Casino Stock Trading' });

            await interaction.editReply({ embeds: [successEmbed] });

            // Log the transaction
            await sendLogMessage(
                interaction.client,
                'economy',
                `Stock sale: ${interaction.user.displayName} sold ${shares} shares of ${symbol} for ${fmt(totalValue)}`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error in stock sell: ${error.message}`);
            await interaction.editReply({
                content: '❌ Failed to process stock sale. Please try again later.'
            });
        }
    },

    async handlePortfolio(interaction, userId, guildId, marriage) {
        try {
            const portfolio = await this.getMarriagePortfolio(marriage.id, guildId);

            if (!portfolio || portfolio.length === 0) {
                await interaction.editReply({
                    content: '📊 **Empty Portfolio**\n\nYour marriage doesn\'t own any stocks yet. Use `/stocks buy` to start investing!'
                });
                return;
            }

            let totalValue = 0;
            let portfolioFields = [];

            for (const holding of portfolio) {
                const currentPrice = await this.getStockPrice(holding.symbol);
                const currentValue = currentPrice ? currentPrice.price * holding.shares : 0;
                const profit = currentValue - (holding.avg_price * holding.shares);
                const profitPercent = holding.avg_price > 0 ? ((profit / (holding.avg_price * holding.shares)) * 100) : 0;

                totalValue += currentValue;

                portfolioFields.push({
                    name: `📈 ${holding.symbol}`,
                    value: `**Shares:** ${holding.shares}\n**Avg Cost:** $${holding.avg_price.toFixed(2)}\n**Current:** $${currentPrice ? currentPrice.price.toFixed(2) : 'N/A'}\n**Value:** ${fmt(currentValue)}\n**P/L:** ${profit >= 0 ? '+' : ''}${fmt(profit)} (${profitPercent >= 0 ? '+' : ''}${profitPercent.toFixed(2)}%)`,
                    inline: true
                });
            }

            // Generate portfolio charts
            const portfolioChartUrl = await this.generatePortfolioChart(portfolio, marriage.id);
            const profitLossChartUrl = await this.generateProfitLossChart(portfolio);

            const portfolioEmbed = new EmbedBuilder()
                .setTitle('📊 Marriage Stock Portfolio')
                .setDescription(`<@${marriage.partner1_id}> & <@${marriage.partner2_id}>`)
                .addFields(
                    {
                        name: '💰 Total Portfolio Value',
                        value: fmt(totalValue),
                        inline: true
                    },
                    {
                        name: '💳 Shared Bank Balance',
                        value: fmt(marriage.shared_bank),
                        inline: true
                    },
                    {
                        name: '💎 Combined Net Worth',
                        value: fmt(totalValue + marriage.shared_bank),
                        inline: true
                    },
                    ...portfolioFields
                )
                .setColor(0x4169E1)
                .setTimestamp()
                .setFooter({ text: '📊 ATIVE Casino Stock Portfolio' });

            if (portfolioChartUrl) {
                portfolioEmbed.setImage(portfolioChartUrl);
            }

            const embeds = [portfolioEmbed];

            // Add profit/loss chart as a second embed if available
            if (profitLossChartUrl) {
                const profitLossEmbed = new EmbedBuilder()
                    .setTitle('📈 Profit/Loss Analysis')
                    .setImage(profitLossChartUrl)
                    .setColor(0xFF6B35)
                    .setTimestamp();
                embeds.push(profitLossEmbed);
            }

            await interaction.editReply({ embeds });

        } catch (error) {
            logger.error(`Error getting portfolio: ${error.message}`);
            await interaction.editReply({
                content: '❌ Failed to load portfolio. Please try again later.'
            });
        }
    },

    async handlePopular(interaction, userId, guildId) {
        try {
            const popularEmbed = new EmbedBuilder()
                .setTitle('📈 Popular Stocks')
                .setDescription('Quick access to popular stock symbols with real-time prices')
                .setColor(0x1E90FF)
                .setTimestamp()
                .setFooter({ text: '📊 ATIVE Casino Stock Trading • Click stock symbol for quick buy' });

            let stockFields = [];

            for (const symbol of POPULAR_STOCKS) {
                try {
                    const stockData = await this.getStockPrice(symbol);
                    if (stockData) {
                        stockFields.push({
                            name: `📈 ${symbol}`,
                            value: `**Price:** $${stockData.price.toFixed(2)}\n**Change:** ${stockData.change >= 0 ? '+' : ''}$${stockData.change.toFixed(2)} (${stockData.changePercent >= 0 ? '+' : ''}${stockData.changePercent.toFixed(2)}%)`,
                            inline: true
                        });
                    }
                } catch (error) {
                    logger.error(`Error getting price for ${symbol}: ${error.message}`);
                }
            }

            if (stockFields.length > 0) {
                popularEmbed.addFields(stockFields);
            } else {
                popularEmbed.setDescription('❌ Unable to load stock prices. Please try again later.');
            }

            await interaction.editReply({ embeds: [popularEmbed] });

        } catch (error) {
            logger.error(`Error getting popular stocks: ${error.message}`);
            await interaction.editReply({
                content: '❌ Failed to load popular stocks. Please try again later.'
            });
        }
    },

    async handleAnalytics(interaction, userId, guildId, marriage) {
        try {
            const portfolio = await this.getMarriagePortfolio(marriage.id, guildId);
            
            if (!portfolio || portfolio.length === 0) {
                await interaction.editReply({
                    content: '📊 **No Analytics Available**\n\nYour marriage portfolio is empty. Start investing with `/stocks buy` to see detailed analytics!'
                });
                return;
            }

            // Get transaction history for this marriage
            const transactions = await dbManager.databaseAdapter.executeQuery(`
                SELECT symbol, transaction_type, shares, price_per_share, total_amount, executed_by, created_at
                FROM marriage_stock_transactions 
                WHERE marriage_id = ? 
                ORDER BY created_at DESC 
                LIMIT 20
            `, [marriage.id]);

            // Calculate analytics
            let totalInvested = 0;
            let totalCurrentValue = 0;
            let totalTransactions = transactions.length;
            let totalBuyTransactions = transactions.filter(t => t.transaction_type === 'buy').length;
            let totalSellTransactions = transactions.filter(t => t.transaction_type === 'sell').length;

            const analyticsData = await Promise.all(
                portfolio.map(async holding => {
                    const currentPrice = await this.getStockPrice(holding.symbol);
                    const currentValue = currentPrice ? currentPrice.price * holding.shares : 0;
                    const profit = currentValue - holding.total_invested;
                    
                    totalInvested += holding.total_invested;
                    totalCurrentValue += currentValue;
                    
                    return {
                        ...holding,
                        currentPrice: currentPrice ? currentPrice.price : 0,
                        currentValue,
                        profit,
                        profitPercent: holding.total_invested > 0 ? (profit / holding.total_invested) * 100 : 0
                    };
                })
            );

            const totalProfit = totalCurrentValue - totalInvested;
            const totalProfitPercent = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;
            const bestPerformer = analyticsData.reduce((best, current) => 
                current.profitPercent > best.profitPercent ? current : best, analyticsData[0]);
            const worstPerformer = analyticsData.reduce((worst, current) => 
                current.profitPercent < worst.profitPercent ? current : worst, analyticsData[0]);

            // Generate charts
            const portfolioChartUrl = await this.generatePortfolioChart(portfolio, marriage.id);
            const profitLossChartUrl = await this.generateProfitLossChart(portfolio);

            const analyticsEmbed = new EmbedBuilder()
                .setTitle('📊 Advanced Portfolio Analytics')
                .setDescription(`<@${marriage.partner1_id}> & <@${marriage.partner2_id}>`)
                .addFields(
                    {
                        name: '💰 Portfolio Summary',
                        value: `**Total Invested:** ${fmt(totalInvested)}\n**Current Value:** ${fmt(totalCurrentValue)}\n**Total P/L:** ${totalProfit >= 0 ? '+' : ''}${fmt(totalProfit)} (${totalProfitPercent >= 0 ? '+' : ''}${totalProfitPercent.toFixed(2)}%)`,
                        inline: false
                    },
                    {
                        name: '📈 Best Performer',
                        value: `**${bestPerformer.symbol}:** ${bestPerformer.profitPercent >= 0 ? '+' : ''}${bestPerformer.profitPercent.toFixed(2)}%\n${fmt(bestPerformer.profit)} profit`,
                        inline: true
                    },
                    {
                        name: '📉 Worst Performer',
                        value: `**${worstPerformer.symbol}:** ${worstPerformer.profitPercent >= 0 ? '+' : ''}${worstPerformer.profitPercent.toFixed(2)}%\n${fmt(worstPerformer.profit)} ${worstPerformer.profit >= 0 ? 'profit' : 'loss'}`,
                        inline: true
                    },
                    {
                        name: '📊 Trading Activity',
                        value: `**Total Transactions:** ${totalTransactions}\n**Buys:** ${totalBuyTransactions} | **Sells:** ${totalSellTransactions}`,
                        inline: true
                    },
                    {
                        name: '💎 Diversification',
                        value: `**Holdings:** ${portfolio.length} different stocks\n**Avg. Position:** ${fmt(totalCurrentValue / portfolio.length)}`,
                        inline: true
                    },
                    {
                        name: '🏦 Liquidity',
                        value: `**Cash Available:** ${fmt(marriage.shared_bank)}\n**Total Net Worth:** ${fmt(totalCurrentValue + marriage.shared_bank)}`,
                        inline: true
                    }
                )
                .setColor(totalProfit >= 0 ? 0x00FF88 : 0xFF4757)
                .setTimestamp()
                .setFooter({ text: '📊 ATIVE Casino Advanced Analytics' });

            if (portfolioChartUrl) {
                analyticsEmbed.setImage(portfolioChartUrl);
            }

            const embeds = [analyticsEmbed];

            // Add profit/loss chart as a second embed
            if (profitLossChartUrl) {
                const profitLossEmbed = new EmbedBuilder()
                    .setTitle('📈 Profit/Loss Breakdown')
                    .setDescription('Individual stock performance analysis')
                    .setImage(profitLossChartUrl)
                    .setColor(0xFF6B35)
                    .setTimestamp();
                embeds.push(profitLossEmbed);
            }

            // Add recent transactions if available
            if (transactions.length > 0) {
                const recentTransactions = transactions.slice(0, 5).map(tx => {
                    const date = new Date(tx.created_at).toLocaleDateString();
                    const type = tx.transaction_type === 'buy' ? '🟢 BUY' : '🔴 SELL';
                    return `${type} ${tx.shares} ${tx.symbol} @ $${tx.price_per_share} (${date})`;
                }).join('\n');

                const transactionEmbed = new EmbedBuilder()
                    .setTitle('📋 Recent Transactions')
                    .setDescription(recentTransactions)
                    .setColor(0x74B9FF)
                    .setTimestamp()
                    .setFooter({ text: `Showing last 5 of ${totalTransactions} transactions` });
                
                embeds.push(transactionEmbed);
            }

            await interaction.editReply({ embeds });

        } catch (error) {
            logger.error(`Error getting analytics: ${error.message}`);
            await interaction.editReply({
                content: '❌ Failed to generate analytics. Please try again later.'
            });
        }
    },

    async getStockPrice(symbol) {
        try {
            // Check cache first - ALWAYS prioritize cache to respect API limits
            const cacheKey = `${STOCK_CACHE_KEY}:${symbol}`;
            const cachedData = await nodeCache.get(cacheKey);

            if (cachedData) {
                logger.info(`📈 Using cached stock data for ${symbol} (expires in ${Math.round((cachedData.cacheExpiry - Date.now()) / 60000)} minutes)`);
                return cachedData;
            }

            // Try each API in priority order
            const availableAPIs = await this.getAvailableAPIs();
            
            for (const apiName of availableAPIs) {
                try {
                    const stockData = await this.fetchFromAPI(apiName, symbol);
                    if (stockData) {
                        // Cache successful data
                        await nodeCache.set(cacheKey, stockData, STOCK_CACHE_TTL);
                        
                        // Also store in extended cache for emergency fallback
                        const extendedCacheKey = `${STOCK_CACHE_KEY}:extended:${symbol}`;
                        await nodeCache.set(extendedCacheKey, stockData, 86400); // 24 hours

                        logger.info(`📈 Successfully fetched ${symbol} from ${API_CONFIGS[apiName].name}`);
                        return stockData;
                    }
                } catch (apiError) {
                    logger.warn(`${API_CONFIGS[apiName].name} failed for ${symbol}: ${apiError.message}`);
                    continue; // Try next API
                }
            }

            // If all APIs failed, try extended cache
            const extendedCacheKey = `${STOCK_CACHE_KEY}:extended:${symbol}`;
            const extendedCache = await nodeCache.get(extendedCacheKey);
            if (extendedCache) {
                logger.info(`📈 Using extended cache for ${symbol} (all APIs failed)`);
                extendedCache.dataSource = 'Extended Cache';
                extendedCache.cacheExpiry = Date.now() + (STOCK_CACHE_TTL * 1000);
                return extendedCache;
            }

            // Final fallback: Yahoo Finance scraping
            try {
                const yahooData = await this.fetchFromYahooFinance(symbol);
                if (yahooData) {
                    logger.info(`📈 Fallback: fetched ${symbol} from Yahoo Finance scraping`);
                    await nodeCache.set(cacheKey, yahooData, STOCK_CACHE_TTL);
                    return yahooData;
                }
            } catch (yahooError) {
                logger.warn(`Yahoo Finance fallback failed: ${yahooError.message}`);
            }

            // Ultimate fallback: mock data with clear indication
            logger.warn(`All data sources failed for ${symbol}, using mock data`);
            const mockData = {
                symbol: symbol.toUpperCase(),
                price: Math.random() * 200 + 50,
                change: (Math.random() - 0.5) * 10,
                changePercent: (Math.random() - 0.5) * 5,
                timestamp: Date.now(),
                cacheExpiry: Date.now() + (STOCK_CACHE_TTL * 1000),
                isMockData: true,
                dataSource: 'Mock Data (All APIs Failed)',
                allAPIsFailed: true
            };
            
            await nodeCache.set(cacheKey, mockData, STOCK_CACHE_TTL);
            return mockData;

        } catch (error) {
            logger.error(`Critical error in getStockPrice for ${symbol}: ${error.message}`);
            return null;
        }
    },

    async getAvailableAPIs() {
        const apis = [];
        
        // Sort APIs by priority and check availability
        const sortedAPIs = Object.entries(API_CONFIGS)
            .sort(([,a], [,b]) => a.priority - b.priority);

        for (const [apiName, config] of sortedAPIs) {
            // Check if API key is available
            if (!process.env[config.keyEnvVar]) {
                logger.debug(`${config.name} API key not configured, skipping`);
                continue;
            }

            // Check rate limits
            const rateLimitKey = `${apiName}_api_calls`;
            const apiCalls = await nodeCache.get(rateLimitKey) || 0;
            
            if (apiCalls >= config.rateLimitPerPeriod) {
                logger.debug(`${config.name} rate limit reached (${apiCalls}/${config.rateLimitPerPeriod}), skipping`);
                continue;
            }

            apis.push(apiName);
        }

        return apis;
    },

    async fetchFromAPI(apiName, symbol) {
        const config = API_CONFIGS[apiName];
        const apiKey = process.env[config.keyEnvVar];
        
        // Increment rate limit counter
        const rateLimitKey = `${apiName}_api_calls`;
        const currentCalls = await nodeCache.get(rateLimitKey) || 0;
        await nodeCache.set(rateLimitKey, currentCalls + 1, config.periodMinutes * 60);

        logger.info(`🌐 Fetching ${symbol} from ${config.name} (call ${currentCalls + 1}/${config.rateLimitPerPeriod})`);

        switch (apiName) {
            case 'polygon':
                return await this.fetchFromPolygon(symbol, apiKey);
            case 'alphavantage':
                return await this.fetchFromAlphaVantage(symbol, apiKey);
            case 'finnhub':
                return await this.fetchFromFinnhub(symbol, apiKey);
            case 'twelvedata':
                return await this.fetchFromTwelveData(symbol, apiKey);
            default:
                throw new Error(`Unknown API: ${apiName}`);
        }
    },

    async fetchFromPolygon(symbol, apiKey) {
        const response = await axios.get(`https://api.polygon.io/v2/aggs/ticker/${symbol.toUpperCase()}/prev`, {
            params: {
                apiKey: apiKey,
                adjusted: true
            },
            timeout: 10000,
            headers: { 'User-Agent': 'ATIVE-Casino-Bot/1.0' }
        });

        if (response.data?.status === 'OK' && response.data.results?.length > 0) {
            const result = response.data.results[0];
            return {
                symbol: symbol.toUpperCase(),
                price: result.c,
                open: result.o,
                high: result.h,
                low: result.l,
                volume: result.v,
                change: result.c - result.o,
                changePercent: ((result.c - result.o) / result.o) * 100,
                timestamp: result.t,
                vwap: result.vw || null,
                cacheExpiry: Date.now() + (STOCK_CACHE_TTL * 1000),
                dataSource: 'Polygon.io',
                isMockData: false
            };
        }
        throw new Error('No data from Polygon.io');
    },

    async fetchFromAlphaVantage(symbol, apiKey) {
        const response = await axios.get('https://www.alphavantage.co/query', {
            params: {
                function: 'GLOBAL_QUOTE',
                symbol: symbol.toUpperCase(),
                apikey: apiKey
            },
            timeout: 10000
        });

        const quote = response.data['Global Quote'];
        if (quote && quote['05. price']) {
            const price = parseFloat(quote['05. price']);
            const change = parseFloat(quote['09. change']);
            const changePercent = parseFloat(quote['10. change percent'].replace('%', ''));
            
            return {
                symbol: symbol.toUpperCase(),
                price: price,
                open: parseFloat(quote['02. open']),
                high: parseFloat(quote['03. high']),
                low: parseFloat(quote['04. low']),
                volume: parseInt(quote['06. volume']),
                change: change,
                changePercent: changePercent,
                timestamp: Date.now(),
                cacheExpiry: Date.now() + (STOCK_CACHE_TTL * 1000),
                dataSource: 'Alpha Vantage',
                isMockData: false
            };
        }
        throw new Error('No data from Alpha Vantage');
    },

    async fetchFromFinnhub(symbol, apiKey) {
        const response = await axios.get('https://finnhub.io/api/v1/quote', {
            params: {
                symbol: symbol.toUpperCase(),
                token: apiKey
            },
            timeout: 10000
        });

        if (response.data && response.data.c > 0) {
            const data = response.data;
            const change = data.c - data.pc; // current - previous close
            const changePercent = (change / data.pc) * 100;
            
            return {
                symbol: symbol.toUpperCase(),
                price: data.c, // current price
                open: data.o, // open
                high: data.h, // high
                low: data.l, // low
                volume: null, // Finnhub doesn't provide volume in this endpoint
                change: change,
                changePercent: changePercent,
                timestamp: data.t * 1000, // convert to milliseconds
                cacheExpiry: Date.now() + (STOCK_CACHE_TTL * 1000),
                dataSource: 'Finnhub',
                isMockData: false
            };
        }
        throw new Error('No data from Finnhub');
    },

    async fetchFromTwelveData(symbol, apiKey) {
        const response = await axios.get('https://api.twelvedata.com/quote', {
            params: {
                symbol: symbol.toUpperCase(),
                apikey: apiKey
            },
            timeout: 10000
        });

        if (response.data && response.data.close) {
            const data = response.data;
            const price = parseFloat(data.close);
            const change = parseFloat(data.change);
            const changePercent = parseFloat(data.percent_change);
            
            return {
                symbol: symbol.toUpperCase(),
                price: price,
                open: parseFloat(data.open),
                high: parseFloat(data.high),
                low: parseFloat(data.low),
                volume: parseInt(data.volume),
                change: change,
                changePercent: changePercent,
                timestamp: new Date(data.datetime).getTime(),
                cacheExpiry: Date.now() + (STOCK_CACHE_TTL * 1000),
                dataSource: 'Twelve Data',
                isMockData: false
            };
        }
        throw new Error('No data from Twelve Data');
    },

    async fetchFromYahooFinance(symbol) {
        // Yahoo Finance fallback (no API key required)
        const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol.toUpperCase()}`, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ATIVE-Casino-Bot/1.0)'
            }
        });

        if (response.data?.chart?.result?.[0]) {
            const result = response.data.chart.result[0];
            const meta = result.meta;
            const quote = result.indicators.quote[0];
            
            if (meta.regularMarketPrice) {
                const price = meta.regularMarketPrice;
                const previousClose = meta.previousClose || meta.chartPreviousClose;
                const change = price - previousClose;
                const changePercent = (change / previousClose) * 100;
                
                return {
                    symbol: symbol.toUpperCase(),
                    price: price,
                    open: quote.open?.[0] || null,
                    high: quote.high?.[0] || null,
                    low: quote.low?.[0] || null,
                    volume: quote.volume?.[0] || null,
                    change: change,
                    changePercent: changePercent,
                    timestamp: Date.now(),
                    cacheExpiry: Date.now() + (STOCK_CACHE_TTL * 1000),
                    dataSource: 'Yahoo Finance (Fallback)',
                    isMockData: false
                };
            }
        }
        throw new Error('No data from Yahoo Finance');
    },

    async recordStockTransaction(marriageId, symbol, shares, pricePerShare, type, guildId, executedBy) {
        try {
            const totalAmount = shares * pricePerShare;
            
            logger.info(`Recording stock transaction: Marriage ${marriageId}, ${type} ${shares} shares of ${symbol} at $${pricePerShare}`);

            // Record the transaction in the transactions table
            await dbManager.databaseAdapter.executeQuery(`
                INSERT INTO marriage_stock_transactions 
                (marriage_id, symbol, transaction_type, shares, price_per_share, total_amount, executed_by, guild_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [marriageId, symbol, type, shares, pricePerShare, totalAmount, executedBy, guildId]);

            logger.info(`Transaction recorded in marriage_stock_transactions table`);

            // Update or create holdings record
            if (type === 'buy') {
                logger.info(`Updating holdings after buy...`);
                await this.updateHoldingsAfterBuy(marriageId, symbol, shares, pricePerShare, totalAmount);
            } else if (type === 'sell') {
                logger.info(`Updating holdings after sell...`);
                await this.updateHoldingsAfterSell(marriageId, symbol, shares);
            }

            logger.info(`Stock transaction completed successfully: Marriage ${marriageId} ${type} ${shares} shares of ${symbol} at $${pricePerShare}`);
            return true;
        } catch (error) {
            logger.error(`Error recording stock transaction: ${error.message}`);
            logger.error(`Transaction params: marriageId=${marriageId}, symbol=${symbol}, shares=${shares}, price=${pricePerShare}, type=${type}`);
            throw error;
        }
    },

    async updateHoldingsAfterBuy(marriageId, symbol, shares, pricePerShare, totalAmount) {
        try {
            // Check if holding already exists
            const existing = await dbManager.databaseAdapter.executeQuery(`
                SELECT shares, avg_price, total_invested FROM marriage_stock_holdings 
                WHERE marriage_id = ? AND symbol = ?
            `, [marriageId, symbol]);

            if (existing.length > 0) {
                // Update existing holding with new average price
                const currentShares = parseInt(existing[0].shares);
                const currentInvested = parseFloat(existing[0].total_invested);
                const newTotalShares = currentShares + shares;
                const newTotalInvested = currentInvested + totalAmount;
                const newAvgPrice = newTotalInvested / newTotalShares;

                await dbManager.databaseAdapter.executeQuery(`
                    UPDATE marriage_stock_holdings 
                    SET shares = ?, avg_price = ?, total_invested = ?, updated_at = NOW()
                    WHERE marriage_id = ? AND symbol = ?
                `, [newTotalShares, newAvgPrice, newTotalInvested, marriageId, symbol]);
            } else {
                // Create new holding
                await dbManager.databaseAdapter.executeQuery(`
                    INSERT INTO marriage_stock_holdings 
                    (marriage_id, symbol, shares, avg_price, total_invested)
                    VALUES (?, ?, ?, ?, ?)
                `, [marriageId, symbol, shares, pricePerShare, totalAmount]);
            }
        } catch (error) {
            logger.error(`Error updating holdings after buy: ${error.message}`);
            throw error;
        }
    },

    async updateHoldingsAfterSell(marriageId, symbol, shares) {
        try {
            const holding = await dbManager.databaseAdapter.executeQuery(`
                SELECT shares, avg_price, total_invested FROM marriage_stock_holdings 
                WHERE marriage_id = ? AND symbol = ?
            `, [marriageId, symbol]);

            if (holding.length > 0) {
                const currentShares = parseInt(holding[0].shares);
                const currentInvested = parseFloat(holding[0].total_invested);
                const avgPrice = parseFloat(holding[0].avg_price);
                
                const newShares = currentShares - shares;
                const soldValue = shares * avgPrice;
                const newInvested = Math.max(0, currentInvested - soldValue);

                if (newShares <= 0) {
                    // Remove holding if no shares left
                    await dbManager.databaseAdapter.executeQuery(`
                        DELETE FROM marriage_stock_holdings 
                        WHERE marriage_id = ? AND symbol = ?
                    `, [marriageId, symbol]);
                } else {
                    // Update holding
                    await dbManager.databaseAdapter.executeQuery(`
                        UPDATE marriage_stock_holdings 
                        SET shares = ?, total_invested = ?, updated_at = NOW()
                        WHERE marriage_id = ? AND symbol = ?
                    `, [newShares, newInvested, marriageId, symbol]);
                }
            }
        } catch (error) {
            logger.error(`Error updating holdings after sell: ${error.message}`);
            throw error;
        }
    },

    async getOwnedShares(marriageId, symbol, guildId) {
        try {
            const holdings = await dbManager.databaseAdapter.executeQuery(`
                SELECT shares FROM marriage_stock_holdings 
                WHERE marriage_id = ? AND symbol = ?
            `, [marriageId, symbol]);

            if (holdings.length > 0) {
                return holdings[0].shares;
            }
            return 0;
        } catch (error) {
            logger.error(`Error getting owned shares: ${error.message}`);
            return 0;
        }
    },

    async getMarriagePortfolio(marriageId, guildId) {
        try {
            const holdings = await dbManager.databaseAdapter.executeQuery(`
                SELECT symbol, shares, avg_price, total_invested, created_at, updated_at
                FROM marriage_stock_holdings 
                WHERE marriage_id = ? AND shares > 0
                ORDER BY symbol ASC
            `, [marriageId]);

            return holdings.map(holding => ({
                symbol: holding.symbol,
                shares: holding.shares,
                avg_price: parseFloat(holding.avg_price),
                total_invested: parseFloat(holding.total_invested),
                created_at: holding.created_at,
                updated_at: holding.updated_at
            }));
        } catch (error) {
            logger.error(`Error getting marriage portfolio: ${error.message}`);
            return [];
        }
    },

    // ========================= CHART GENERATION METHODS =========================

    async generatePriceChart(symbol, stockData, transactions = []) {
        try {
            const chart = new QuickChart();
            chart.setWidth(600); // Reduced from 800
            chart.setHeight(300); // Reduced from 400
            chart.setBackgroundColor('#2c2f33');

            // Generate simpler historical data for smaller URLs
            const historicalData = await this.generateHistoricalData(symbol, stockData);
            
            // Reduce data points to minimize URL length
            const reducedData = historicalData.filter((_, index) => index % 3 === 0); // Every 3rd point
            
            const labels = reducedData.map((point, index) => {
                // Use shorter date format
                const date = new Date(point.timestamp);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            });
            
            const prices = reducedData.map(point => Math.round(point.price * 100) / 100); // Round to 2 decimals

            // Simplified config to reduce URL length
            const config = {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        data: prices,
                        borderColor: stockData.change >= 0 ? '#0f0' : '#f00',
                        backgroundColor: stockData.change >= 0 ? 'rgba(0,255,0,0.1)' : 'rgba(255,0,0,0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    plugins: {
                        title: {
                            display: true,
                            text: `${symbol} - $${stockData.price.toFixed(2)}`,
                            color: '#fff'
                        },
                        legend: { display: false }
                    },
                    scales: {
                        x: { 
                            grid: { color: '#444' },
                            ticks: { color: '#fff', maxTicksLimit: 5 }
                        },
                        y: {
                            grid: { color: '#444' },
                            ticks: { 
                                color: '#fff',
                                maxTicksLimit: 5,
                                callback: function(value) { return '$' + value; }
                            }
                        }
                    },
                    elements: { point: { radius: 0 } } // Remove data points
                }
            };

            chart.setConfig(config);
            const url = chart.getUrl();
            
            // Check URL length and return null if too long
            if (url.length > 2000) {
                logger.warn(`Chart URL too long (${url.length} chars), skipping chart for ${symbol}`);
                return null;
            }
            
            return url;
        } catch (error) {
            logger.error(`Error generating price chart: ${error.message}`);
            return null;
        }
    },

    async generatePortfolioChart(portfolio, marriageId) {
        try {
            if (!portfolio || portfolio.length === 0) return null;

            const chart = new QuickChart();
            chart.setWidth(500); // Reduced size
            chart.setHeight(300); // Reduced size
            chart.setBackgroundColor('#2c2f33');

            // Calculate current values for each holding
            const portfolioWithCurrentValues = await Promise.all(
                portfolio.slice(0, 8).map(async holding => { // Limit to 8 holdings max
                    const currentPrice = await this.getStockPrice(holding.symbol);
                    const currentValue = currentPrice ? currentPrice.price * holding.shares : 0;
                    const profit = currentValue - holding.total_invested;
                    const profitPercent = holding.total_invested > 0 ? (profit / holding.total_invested) * 100 : 0;
                    
                    return {
                        ...holding,
                        currentPrice: currentPrice ? currentPrice.price : 0,
                        currentValue: Math.round(currentValue),
                        profit,
                        profitPercent
                    };
                })
            );

            // Create simplified pie chart
            const symbols = portfolioWithCurrentValues.map(h => h.symbol);
            const values = portfolioWithCurrentValues.map(h => h.currentValue);
            const colors = ['#f00', '#0f0', '#00f', '#ff0', '#f0f', '#0ff', '#ffa500', '#800080'];

            const config = {
                type: 'doughnut',
                data: {
                    labels: symbols,
                    datasets: [{
                        data: values,
                        backgroundColor: colors.slice(0, symbols.length),
                        borderWidth: 2
                    }]
                },
                options: {
                    plugins: {
                        title: {
                            display: true,
                            text: `Portfolio Distribution`,
                            color: '#fff'
                        },
                        legend: {
                            position: 'bottom',
                            labels: { 
                                color: '#fff',
                                font: { size: 10 }
                            }
                        }
                    }
                }
            };

            chart.setConfig(config);
            const url = chart.getUrl();
            
            // Check URL length
            if (url.length > 2000) {
                logger.warn(`Portfolio chart URL too long (${url.length} chars), skipping`);
                return null;
            }
            
            return url;
        } catch (error) {
            logger.error(`Error generating portfolio chart: ${error.message}`);
            return null;
        }
    },

    async generateProfitLossChart(portfolio) {
        try {
            if (!portfolio || portfolio.length === 0) return null;

            const chart = new QuickChart();
            chart.setWidth(500); // Reduced size
            chart.setHeight(300); // Reduced size
            chart.setBackgroundColor('#2c2f33');

            // Calculate P&L for each holding (limit to 6 holdings)
            const profitLossData = await Promise.all(
                portfolio.slice(0, 6).map(async holding => {
                    const currentPrice = await this.getStockPrice(holding.symbol);
                    const currentValue = currentPrice ? currentPrice.price * holding.shares : 0;
                    const profit = Math.round(currentValue - holding.total_invested);
                    
                    return {
                        symbol: holding.symbol,
                        profit
                    };
                })
            );

            const symbols = profitLossData.map(p => p.symbol);
            const profits = profitLossData.map(p => p.profit);
            const colors = profits.map(p => p >= 0 ? '#0f0' : '#f00');

            const config = {
                type: 'bar',
                data: {
                    labels: symbols,
                    datasets: [{
                        data: profits,
                        backgroundColor: colors,
                        borderWidth: 1
                    }]
                },
                options: {
                    plugins: {
                        title: {
                            display: true,
                            text: 'Profit/Loss',
                            color: '#fff'
                        },
                        legend: { display: false }
                    },
                    scales: {
                        x: {
                            grid: { color: '#444' },
                            ticks: { color: '#fff' }
                        },
                        y: {
                            grid: { color: '#444' },
                            ticks: { 
                                color: '#fff',
                                callback: function(value) { 
                                    return '$' + value; 
                                }
                            }
                        }
                    }
                }
            };

            chart.setConfig(config);
            const url = chart.getUrl();
            
            // Check URL length
            if (url.length > 2000) {
                logger.warn(`P&L chart URL too long (${url.length} chars), skipping`);
                return null;
            }
            
            return url;
        } catch (error) {
            logger.error(`Error generating profit/loss chart: ${error.message}`);
            return null;
        }
    },

    async generateHistoricalData(symbol, currentData) {
        // In a real implementation, you'd fetch actual historical data
        // For now, generate mock historical data based on current price
        const points = [];
        const basePrice = currentData.price;
        const volatility = 0.02; // 2% daily volatility
        
        for (let i = 30; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            
            // Generate random walk from current price
            const randomChange = (Math.random() - 0.5) * volatility * 2;
            const price = basePrice * (1 + randomChange * (i / 30)); // Trend toward current price
            
            points.push({
                timestamp: date.getTime(),
                price: Math.max(price, basePrice * 0.5) // Don't go below 50% of current
            });
        }
        
        return points;
    }
};