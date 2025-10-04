/**
 * User History Command
 * Shows user's recent transactions and game history
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId } = require('../UTILS/common');
const logger = require('../UTILS/logger');

// Supported game types
const GAME_TYPES = [
    'blackjack',
    'slots',
    'treasurevault',
    'crash',
    'plinko',
    'uno',
    'fishing',
    'bingo',
    'duck',
    'wordchain',
    'battleship',
    'rps',
    'yahtzee',
    'multi-slots',
    'roulette',
    'keno',
    'ceelo',
    'russianroulette',
    'mines',
    'scratch'
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('userhistory')
        .setDescription('View your recent transactions and game history')
        .addSubcommand(subcommand =>
            subcommand
                .setName('games')
                .setDescription('View your recent game history')
                .addStringOption(option =>
                    option.setName('game')
                        .setDescription('Filter by specific game type')
                        .setRequired(false)
                        .addChoices(
                            { name: '🃏 Blackjack', value: 'blackjack' },
                            { name: '🎰 Slots', value: 'slots' },
                            { name: '🏛️ Treasure Vault', value: 'treasurevault' },
                            { name: '📈 Crash', value: 'crash' },
                            { name: '🎯 Plinko', value: 'plinko' },
                            { name: '🃏 UNO', value: 'uno' },
                            { name: '🎣 Fishing', value: 'fishing' },
                            { name: '🎱 Bingo', value: 'bingo' },
                            { name: '🦆 Duck Game', value: 'duck' },
                            { name: '📝 Word Chain', value: 'wordchain' },
                            { name: '🚢 Battleship', value: 'battleship' },
                            { name: '✂️ Rock Paper Scissors', value: 'rps' },
                            { name: '🎲 Yahtzee', value: 'yahtzee' },
                            { name: '🎰 Multi-Slots', value: 'multi-slots' },
                            { name: '🔴 Roulette', value: 'roulette' },
                            { name: '🎯 Keno', value: 'keno' },
                            { name: '🎲 Ceelo', value: 'ceelo' },
                            { name: '🔫 Russian Roulette', value: 'russianroulette' },
                            { name: '💣 Mines', value: 'mines' },
                            { name: '🎫 Scratch', value: 'scratch' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('transactions')
                .setDescription('View your recent transaction history')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Filter by transaction type')
                        .setRequired(false)
                        .addChoices(
                            { name: '💰 All Transactions', value: 'all' },
                            { name: '✅ Gains', value: 'gain' },
                            { name: '❌ Losses', value: 'loss' },
                            { name: '🎮 Game Results', value: 'game' },
                            { name: '💸 Transfers', value: 'transfer' },
                            { name: '🎁 Rewards', value: 'reward' }
                        )
                )
        ),

    async execute(interaction) {
        // Check if interaction is valid
        if (!interaction.isRepliable()) {
            console.log('[ERROR] Interaction not repliable in userhistory command');
            return;
        }

        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const subcommand = interaction.options.getSubcommand();

        try {
            await dbManager.ensureUser(userId, interaction.user.displayName);

            if (subcommand === 'games') {
                const gameFilter = interaction.options.getString('game');
                await this.showGameHistory(interaction, userId, guildId, gameFilter);
            } else if (subcommand === 'transactions') {
                const typeFilter = interaction.options.getString('type') || 'all';
                await this.showTransactionHistory(interaction, userId, guildId, typeFilter);
            }

        } catch (error) {
            logger.error(`Error in userhistory command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred while retrieving your history. Please try again later.')
                .setColor(0xFF0000)
                .setTimestamp();

            if (interaction.isRepliable()) {
                try {
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    } else {
                        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    }
                } catch (replyError) {
                    logger.error(`Failed to send error message: ${replyError.message}`);
                }
            }
        }
    },

    async showGameHistory(interaction, userId, guildId, gameFilter) {
        try {
            // Get game history from database
            const gameHistory = await this.getGameHistory(userId, guildId, gameFilter);
            
            if (!gameHistory || gameHistory.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('🎮 Game History')
                    .setDescription(gameFilter 
                        ? `No ${gameFilter} games found in your history.`
                        : 'No games found in your history. Start playing to see your results here!')
                    .setColor(0x4CAF50)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Format game history
            let historyText = '';
            let totalWinnings = 0;
            let totalLosses = 0;
            let gamesWon = 0;
            let gamesLost = 0;

            for (const game of gameHistory.slice(0, 10)) {
                const gameIcon = this.getGameIcon(game.game_type);
                const resultIcon = game.net_change >= 0 ? '✅' : '❌';
                const changeText = game.net_change >= 0 ? `+${fmt(game.net_change)}` : fmt(game.net_change);
                const timeAgo = this.getTimeAgo(new Date(game.timestamp));
                
                historyText += `${gameIcon} **${game.game_type}** ${resultIcon} ${changeText} *${timeAgo}*\\n`;
                
                if (game.net_change >= 0) {
                    totalWinnings += game.net_change;
                    gamesWon++;
                } else {
                    totalLosses += Math.abs(game.net_change);
                    gamesLost++;
                }
            }

            const totalGames = gamesWon + gamesLost;
            const winRate = totalGames > 0 ? ((gamesWon / totalGames) * 100).toFixed(1) : '0.0';

            const embed = new EmbedBuilder()
                .setTitle(`🎮 Game History ${gameFilter ? `- ${gameFilter}` : ''}`)
                .setDescription(`Here are your last ${Math.min(gameHistory.length, 10)} games:`)
                .addFields(
                    {
                        name: '📊 Statistics',
                        value: `**Games:** ${totalGames}\\n**Win Rate:** ${winRate}%\\n**Winnings:** ${fmt(totalWinnings)}\\n**Losses:** ${fmt(totalLosses)}`,
                        inline: true
                    },
                    {
                        name: '🎯 Performance',
                        value: `**Won:** ${gamesWon}\\n**Lost:** ${gamesLost}\\n**Net:** ${fmt(totalWinnings - totalLosses)}`,
                        inline: true
                    },
                    {
                        name: '📈 Recent Games',
                        value: historyText || 'No games found',
                        inline: false
                    }
                )
                .setColor(totalWinnings >= totalLosses ? 0x4CAF50 : 0xFF5722)
                .setFooter({ text: `Showing last ${Math.min(gameHistory.length, 10)} games` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        } catch (error) {
            logger.error(`Error showing game history: ${error.message}`);
            throw error;
        }
    },

    async showTransactionHistory(interaction, userId, guildId, typeFilter) {
        try {
            // Get transaction history (placeholder - you'll need to implement this based on your database)
            const transactions = await this.getTransactionHistory(userId, guildId, typeFilter);
            
            if (!transactions || transactions.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('💰 Transaction History')
                    .setDescription('No transactions found in your history.')
                    .setColor(0x4CAF50)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Format transaction history
            let transactionText = '';
            let totalIn = 0;
            let totalOut = 0;

            for (const tx of transactions.slice(0, 10)) {
                const typeIcon = this.getTransactionIcon(tx.type);
                const amountText = tx.amount >= 0 ? `+${fmt(tx.amount)}` : fmt(tx.amount);
                const timeAgo = this.getTimeAgo(new Date(tx.timestamp));
                
                transactionText += `${typeIcon} **${tx.description}** ${amountText} *${timeAgo}*\\n`;
                
                if (tx.amount >= 0) {
                    totalIn += tx.amount;
                } else {
                    totalOut += Math.abs(tx.amount);
                }
            }

            const embed = new EmbedBuilder()
                .setTitle(`💰 Transaction History ${typeFilter !== 'all' ? `- ${typeFilter}` : ''}`)
                .setDescription(`Here are your last ${Math.min(transactions.length, 10)} transactions:`)
                .addFields(
                    {
                        name: '📊 Summary',
                        value: `**Total In:** ${fmt(totalIn)}\\n**Total Out:** ${fmt(totalOut)}\\n**Net:** ${fmt(totalIn - totalOut)}`,
                        inline: true
                    },
                    {
                        name: '📈 Recent Transactions',
                        value: transactionText || 'No transactions found',
                        inline: false
                    }
                )
                .setColor(totalIn >= totalOut ? 0x4CAF50 : 0xFF5722)
                .setFooter({ text: `Showing last ${Math.min(transactions.length, 10)} transactions` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        } catch (error) {
            logger.error(`Error showing transaction history: ${error.message}`);
            throw error;
        }
    },

    async getGameHistory(userId, guildId, gameFilter) {
        try {
            // This is a placeholder - implement based on your database structure
            // You might have a game_results or game_history table
            let query = `
                SELECT game_type, bet_amount, win_amount, 
                       (win_amount - bet_amount) as net_change, 
                       timestamp
                FROM game_results 
                WHERE user_id = ? AND guild_id = ?
            `;
            
            const params = [userId, guildId];
            
            if (gameFilter) {
                query += ` AND game_type = ?`;
                params.push(gameFilter);
            }
            
            query += ` ORDER BY timestamp DESC LIMIT 20`;
            
            // For now, return empty array - you'll need to implement this with your actual database adapter
            return [];
            
        } catch (error) {
            logger.error(`Error getting game history: ${error.message}`);
            return [];
        }
    },

    async getTransactionHistory(userId, guildId, typeFilter) {
        try {
            // This is a placeholder - implement based on your database structure
            // You might have a transactions or wallet_history table
            let query = `
                SELECT type, amount, description, timestamp
                FROM transactions 
                WHERE user_id = ? AND guild_id = ?
            `;
            
            const params = [userId, guildId];
            
            if (typeFilter !== 'all') {
                query += ` AND type = ?`;
                params.push(typeFilter);
            }
            
            query += ` ORDER BY timestamp DESC LIMIT 20`;
            
            // For now, return empty array - you'll need to implement this with your actual database adapter
            return [];
            
        } catch (error) {
            logger.error(`Error getting transaction history: ${error.message}`);
            return [];
        }
    },

    getGameIcon(gameType) {
        const icons = {
            blackjack: '🃏',
            slots: '🎰',
            treasurevault: '🏛️',
            crash: '📈',
            plinko: '🎯',
            uno: '🃏',
            fishing: '🎣',
            bingo: '🎱',
            duck: '🦆',
            wordchain: '📝',
            battleship: '🚢',
            rps: '✂️',
            yahtzee: '🎲',
            'multi-slots': '🎰',
            roulette: '🔴',
            keno: '🎯',
            ceelo: '🎲',
            russianroulette: '🔫',
            mines: '💣',
            scratch: '🎫'
        };
        return icons[gameType] || '🎮';
    },

    getTransactionIcon(type) {
        const icons = {
            game: '🎮',
            transfer: '💸',
            reward: '🎁',
            gain: '✅',
            loss: '❌',
            deposit: '💰',
            withdrawal: '🏦'
        };
        return icons[type] || '💰';
    },

    getTimeAgo(date) {
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'just now';
    }
};