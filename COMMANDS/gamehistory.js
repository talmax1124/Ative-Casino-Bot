/**
 * Game History Command
 * Shows the last 20 games played by a user, optionally filtered by game type
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
    'multi-slots'
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gamehistory')
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
                    { name: '🎰 Multi-Slots', value: 'multi-slots' }
                )
        )
        .addUserOption(option =>
            option.setName('user')
                .setDescription('View another user\'s game history (optional)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const gameType = interaction.options.getString('game');
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;
        const guildId = await getGuildId(interaction);

        try {
            // Ensure user exists in database
            await dbManager.ensureUser(userId, targetUser.displayName);

            // Get game history
            const history = await dbManager.getGameHistory(userId, gameType, 20);

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`🎮 Game History - ${targetUser.displayName}`)
                .setColor(0x00ff00)
                .setTimestamp()
                .setFooter({ text: 'Last 20 games' });

            if (!history || history.length === 0) {
                embed.setDescription('No game history found' + (gameType ? ` for ${gameType}` : ''));
                return await interaction.reply({ 
                    embeds: [embed], 
                    flags: MessageFlags.Ephemeral 
                });
            }

            // Format game emoji
            function getGameEmoji(game) {
                const gameEmojis = {
                    'blackjack': '🃏',
                    'slots': '🎰',
                    'treasurevault': '🏛️',
                    'crash': '📈',
                    'plinko': '🎯',
                    'uno': '🃏',
                    'fishing': '🎣',
                    'bingo': '🎱',
                    'duck': '🦆',
                    'wordchain': '📝',
                    'battleship': '🚢',
                    'rps': '✂️',
                    'yahtzee': '🎲',
                    'multi-slots': '🎰'
                };
                return gameEmojis[game] || '🎮';
            }

            // Build history description
            let description = '';
            let totalBet = 0;
            let totalWon = 0;
            let wins = 0;
            let losses = 0;

            history.forEach((game, index) => {
                const emoji = getGameEmoji(game.game_type);
                const result = game.won ? '✅' : '❌';
                const profit = game.payout - game.bet_amount;
                const profitStr = profit >= 0 ? `+${fmt(profit)}` : fmt(profit);
                const timestamp = new Date(game.played_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                description += `**${index + 1}.** ${emoji} **${game.game_type}** ${result}\n`;
                description += `   💵 Bet: ${fmt(game.bet_amount)} → ${profitStr}\n`;
                description += `   🕒 ${timestamp}\n\n`;

                totalBet += parseFloat(game.bet_amount);
                totalWon += parseFloat(game.payout);
                if (game.won) wins++;
                else losses++;
            });

            // Add statistics
            const totalProfit = totalWon - totalBet;
            const winRate = history.length > 0 ? ((wins / history.length) * 100).toFixed(1) : 0;
            
            embed.setDescription(description);
            embed.addFields(
                {
                    name: '📊 Statistics',
                    value: [
                        `**Games Played:** ${history.length}`,
                        `**Win Rate:** ${winRate}% (${wins}W/${losses}L)`,
                        `**Total Bet:** ${fmt(totalBet)}`,
                        `**Total Payout:** ${fmt(totalWon)}`,
                        `**Net Profit:** ${totalProfit >= 0 ? '+' : ''}${fmt(totalProfit)}`
                    ].join('\n'),
                    inline: false
                }
            );

            // If filtering by game type, add to title
            if (gameType) {
                embed.setTitle(`${getGameEmoji(gameType)} ${gameType.charAt(0).toUpperCase() + gameType.slice(1)} History - ${targetUser.displayName}`);
            }

            await interaction.reply({ 
                embeds: [embed]
            });

        } catch (error) {
            logger.error(`Error in gamehistory command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred while fetching game history.')
                .setColor(0xff0000)
                .setTimestamp();

            await interaction.reply({ 
                embeds: [errorEmbed], 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
};