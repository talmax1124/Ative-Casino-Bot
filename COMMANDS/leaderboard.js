/**
 * Leaderboard Command - Show wealth rankings with Off Economy support
 * Displays regular and Off Economy leaderboards with interactive buttons
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getGuildId, getTierDisplay } = require('../UTILS/common');
const dbManager = require('../UTILS/database');
const { fmt } = require('../UTILS/moneyFormatter');
const logger = require('../UTILS/logger');

// Helper to chunk text into field-safe pieces (Discord: max 1024 per field)
function chunkText(text, size = 950) {
    if (!text) return ['No data'];
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        chunks.push(text.slice(i, i + size));
        i += size;
    }
    return chunks.length ? chunks : ['No data'];
}

// Helper to log embed diagnostics and Discord.js error details
function logEmbedDiagnostics(embed, components = [], context = 'embed') {
    try {
        const data = typeof embed.toJSON === 'function' ? embed.toJSON() : (embed || {});
        const titleLen = (data.title || '').length;
        const descLen = (data.description || '').length;
        const footerLen = (data.footer?.text || '').length;
        const fields = Array.isArray(data.fields) ? data.fields : [];
        const fieldCount = fields.length;
        const fieldLens = fields.map((f, i) => ({ idx: i, nameLen: (f.name || '').length, valueLen: (f.value || '').length }));
        const componentsCount = Array.isArray(components) ? components.length : 0;
        const approxTotal = titleLen + descLen + footerLen + fieldLens.reduce((s, f) => s + f.nameLen + f.valueLen, 0);
        logger.warn(`[${context}] Embed diagnostics: title=${titleLen}, desc=${descLen}, footer=${footerLen}, fields=${fieldCount}, components=${componentsCount}, approxTotal=${approxTotal}`);
        if (fieldCount > 0) {
            // Only log first few to avoid spam
            const preview = fieldLens.slice(0, 5).map(f => `#${f.idx} name=${f.nameLen} value=${f.valueLen}`).join('; ');
            logger.warn(`[${context}] Field lengths (first 5): ${preview}${fieldCount > 5 ? ' …' : ''}`);
        }
    } catch (e) {
        logger.debug(`Failed to log embed diagnostics: ${e.message}`);
    }
}

function logDiscordErrorDetails(error, context = 'discord') {
    try {
        const raw = error?.rawError || error?.data || error;
        if (raw) {
            logger.error(`[${context}] Raw error: ${typeof raw === 'object' ? JSON.stringify(raw) : String(raw)}`);
        }
        if (error?.errors) {
            logger.error(`[${context}] Nested errors: ${JSON.stringify(error.errors)}`);
        }
        if (error?.requestBody) {
            logger.error(`[${context}] Request body size: ${JSON.stringify({ jsonBytes: Buffer.byteLength(JSON.stringify(error.requestBody.json || {})) })}`);
        }
    } catch (e) {
        logger.debug(`Failed to log discord error details: ${e.message}`);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View different types of leaderboards')
        .addStringOption(option =>
            option.setName('category')
                .setDescription('Choose leaderboard category')
                .setRequired(false)
                .addChoices(
                    { name: '💰 Wealth Rankings - Top Players', value: 'server' },
                    { name: '🌍 All Players - Full Network', value: 'global' },
                    { name: '🏆 Wins/Losses - Game Performance', value: 'winloss' },
                    { name: '🔴 Off-Economy - Separate Rankings', value: 'offeco' }
                )
        )
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Number of users to show (5-25)')
                .setMinValue(5)
                .setMaxValue(25)
                .setRequired(false)
        ),

    async execute(interaction) {
        const category = interaction.options.getString('category') || 'server';
        const limit = interaction.options.getInteger('limit') || 10;
        const guildId = await getGuildId(interaction);
        
        logger.info(`Leaderboard command called: category=${category}, limit=${limit}, guildId=${guildId}, user=${interaction.user.id}`);
        
        try {
            await interaction.deferReply();

            switch (category) {
                case 'server':
                    await this.showServerLeaderboard(interaction, guildId, limit);
                    break;
                case 'global':
                    await this.showGlobalLeaderboard(interaction, limit);
                    break;
                case 'winloss':
                    await this.showWinLossLeaderboard(interaction, guildId, limit);
                    break;
                case 'offeco':
                    await this.showOffEconomyLeaderboard(interaction, guildId, limit);
                    break;
                default:
                    await this.showServerLeaderboard(interaction, guildId, limit);
            }

        } catch (error) {
            logger.error(`Error in leaderboard command: ${error.message}`);
            logger.error('Full leaderboard error stack:', error.stack);
            logger.error('Error details:', JSON.stringify(error, null, 2));
            logDiscordErrorDetails(error, 'leaderboard_execute');
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Failed to fetch leaderboard data. Please try again.')
                .setColor(0xFF0000);

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed] });
            }
        }
    },

    // Helper method to create navigation buttons
    createNavigationButtons(activeCategory) {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('leaderboard_server')
                    .setLabel('💰 Top Players')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(activeCategory === 'server'),
                new ButtonBuilder()
                    .setCustomId('leaderboard_global')
                    .setLabel('🌍 All Players')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(activeCategory === 'global'),
                new ButtonBuilder()
                    .setCustomId('leaderboard_winloss')
                    .setLabel('🏆 W/L')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(activeCategory === 'winloss'),
                new ButtonBuilder()
                    .setCustomId('leaderboard_offeco')
                    .setLabel('🔴 Off-Eco')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(activeCategory === 'offeco')
            );
    },

    // Helper method to remove duplicate users from results
    removeDuplicateUsers(users) {
        const seen = new Set();
        return users.filter(user => {
            if (seen.has(user.user_id)) {
                return false;
            }
            seen.add(user.user_id);
            return true;
        });
    },

    // Helper method to create leaderboard embed
    createLeaderboardEmbed(title, description, users, limit, color, category) {
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setTimestamp();

        if (users.length === 0) {
            embed.addFields({
                name: '📭 No Data',
                value: 'No users found for this leaderboard category yet!',
                inline: false
            });
            return embed;
        }

        let leaderboardText = '';
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const rank = i + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `**${rank}.**`;
            const username = user.username || `User ${user.user_id}`;
            const tierDisplay = getTierDisplay(parseFloat(user.total_balance));
            
            // Calculate win rate
            const totalGames = parseInt(user.total_games) || 0;
            const wins = parseInt(user.total_wins) || 0;
            const losses = parseInt(user.total_losses) || 0;
            const winRate = totalGames > 0 ? ((wins / totalGames) * 100).toFixed(1) : '0.0';
            
            leaderboardText += `${medal} **${username}** ${tierDisplay}\n`;
            leaderboardText += `\`\`\`💰 ${fmt(user.total_balance)} (💳${fmt(user.wallet)} 🏛️${fmt(user.bank)})\n`;
            leaderboardText += `🎮 ${totalGames} • 🏆${wins}W 💀${losses}L • ${winRate}%WR\`\`\`\n`;
        }

        // Add leaderboard text as fields (chunk if needed)
        const chunks = chunkText(leaderboardText);
        chunks.forEach((chunk, idx) => {
            embed.addFields({
                name: idx === 0 ? '📊 Rankings' : '📊 Rankings (cont.)',
                value: chunk,
                inline: false
            });
        });

        // Add summary statistics
        if (users.length > 0) {
            const totalWealth = users.reduce((sum, u) => sum + parseFloat(u.total_balance), 0);
            const avgWealth = totalWealth / users.length;
            const totalGames = users.reduce((sum, u) => sum + (parseInt(u.total_games) || 0), 0);
            const totalWins = users.reduce((sum, u) => sum + (parseInt(u.total_wins) || 0), 0);
            const overallWinRate = totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : '0.0';
            
            embed.addFields({
                name: '💎 Summary Stats',
                value: `**Wealth:** ${fmt(totalWealth)} total • ${fmt(avgWealth)} avg\n**Gaming:** ${totalGames.toLocaleString()} games • ${overallWinRate}% win rate`,
                inline: false
            });
        }

        return embed;
    },

    async showServerLeaderboard(interaction, guildId, limit, isUpdate = false) {
        logger.info(`Starting server leaderboard query: guildId=${guildId}, limit=${limit}`);
        
        try {
            const users = await dbManager.databaseAdapter.executeQuery(`
                SELECT DISTINCT
                    ub.user_id,
                    ub.username,
                    (ub.wallet + ub.bank) as total_balance,
                    ub.wallet,
                    ub.bank,
                    COALESCE(us.total_wins, 0) as total_wins,
                    COALESCE(us.total_losses, 0) as total_losses,
                    COALESCE(us.total_games_played, 0) as total_games
                FROM user_balances ub
                LEFT JOIN user_stats us ON ub.user_id = us.user_id
                WHERE (ub.off_economy = FALSE OR ub.off_economy IS NULL)
                    AND (ub.wallet + ub.bank) > 0
                    AND ub.user_id != '466050111680544798'
                ORDER BY total_balance DESC
                LIMIT ?
            `, [limit]);

            const uniqueUsers = this.removeDuplicateUsers(users);
            
            const totalUsers = await dbManager.databaseAdapter.executeQuery(`
                SELECT COUNT(DISTINCT user_id) as count
                FROM user_balances 
                WHERE (off_economy = FALSE OR off_economy IS NULL)
                    AND (wallet + bank) > 0
                    AND user_id != '466050111680544798'
            `);

            const embed = this.createLeaderboardEmbed(
                '💰 Top Players - Wealth Rankings',
                `Top wealth rankings across all servers (${totalUsers[0]?.count || 0} total users)`,
                uniqueUsers,
                limit,
                0x4A90E2,
                'server'
            );

            const components = [this.createNavigationButtons('server')];
            
            if (isUpdate) {
                await interaction.editReply({ embeds: [embed], components });
            } else {
                await interaction.editReply({ embeds: [embed], components });
                this.setupButtonCollector(interaction, guildId, limit);
            }

        } catch (error) {
            logger.error('Error in server leaderboard:', error.message);
            throw error;
        }
    },

    async showGlobalLeaderboard(interaction, limit, isUpdate = false) {
        logger.info(`Starting global leaderboard query: limit=${limit}`);
        
        try {
            const users = await dbManager.databaseAdapter.executeQuery(`
                SELECT DISTINCT
                    ub.user_id,
                    ub.username,
                    (ub.wallet + ub.bank) as total_balance,
                    ub.wallet,
                    ub.bank,
                    COALESCE(us.total_wins, 0) as total_wins,
                    COALESCE(us.total_losses, 0) as total_losses,
                    COALESCE(us.total_games_played, 0) as total_games
                FROM user_balances ub
                LEFT JOIN user_stats us ON ub.user_id = us.user_id
                WHERE (ub.off_economy = FALSE OR ub.off_economy IS NULL)
                    AND (ub.wallet + ub.bank) > 0
                    AND ub.user_id != '466050111680544798'
                ORDER BY total_balance DESC
                LIMIT ?
            `, [limit]);

            const uniqueUsers = this.removeDuplicateUsers(users);
            
            const totalUsers = await dbManager.databaseAdapter.executeQuery(`
                SELECT COUNT(DISTINCT user_id) as count
                FROM user_balances 
                WHERE (off_economy = FALSE OR off_economy IS NULL)
                    AND (wallet + bank) > 0
                    AND user_id != '466050111680544798'
            `);

            const embed = this.createLeaderboardEmbed(
                '🌍 All Players - Complete Network Rankings',
                `All player wealth rankings (${totalUsers[0]?.count || 0} total users across network)`,
                uniqueUsers,
                limit,
                0x34A853,
                'global'
            );

            const components = [this.createNavigationButtons('global')];
            
            if (isUpdate) {
                await interaction.editReply({ embeds: [embed], components });
            } else {
                await interaction.editReply({ embeds: [embed], components });
                this.setupButtonCollector(interaction, null, limit);
            }

        } catch (error) {
            logger.error('Error in global leaderboard:', error.message);
            throw error;
        }
    },

    async showWinLossLeaderboard(interaction, guildId, limit, isUpdate = false) {
        logger.info(`Starting win/loss leaderboard query: guildId=${guildId}, limit=${limit}`);
        
        try {
            const users = await dbManager.databaseAdapter.executeQuery(`
                SELECT DISTINCT
                    ub.user_id,
                    ub.username,
                    (ub.wallet + ub.bank) as total_balance,
                    ub.wallet,
                    ub.bank,
                    COALESCE(us.total_wins, 0) as total_wins,
                    COALESCE(us.total_losses, 0) as total_losses,
                    COALESCE(us.total_games_played, 0) as total_games,
                    CASE 
                        WHEN COALESCE(us.total_games_played, 0) > 0 
                        THEN (COALESCE(us.total_wins, 0) * 100.0 / COALESCE(us.total_games_played, 0))
                        ELSE 0 
                    END as win_rate
                FROM user_balances ub
                LEFT JOIN user_stats us ON ub.user_id = us.user_id
                WHERE (ub.off_economy = FALSE OR ub.off_economy IS NULL)
                    AND ub.user_id != '466050111680544798'
                    AND COALESCE(us.total_games_played, 0) >= 5
                ORDER BY win_rate DESC, total_games DESC
                LIMIT ?
            `, [limit]);

            const uniqueUsers = this.removeDuplicateUsers(users);
            
            const totalUsers = await dbManager.databaseAdapter.executeQuery(`
                SELECT COUNT(DISTINCT ub.user_id) as count
                FROM user_balances ub
                LEFT JOIN user_stats us ON ub.user_id = us.user_id
                WHERE (ub.off_economy = FALSE OR ub.off_economy IS NULL)
                    AND ub.user_id != '466050111680544798'
                    AND COALESCE(us.total_games_played, 0) >= 5
            `);

            const embed = new EmbedBuilder()
                .setTitle('🏆 Win/Loss Leaderboard - Game Performance')
                .setDescription(`Top performers by win rate (min 5 games, ${totalUsers[0]?.count || 0} qualified users)`)
                .setColor(0xFF9500)
                .setTimestamp();

            if (uniqueUsers.length === 0) {
                embed.addFields({
                    name: '📭 No Qualified Players',
                    value: 'No players with 5+ games found yet!',
                    inline: false
                });
            } else {
                let leaderboardText = '';
                for (let i = 0; i < uniqueUsers.length; i++) {
                    const user = uniqueUsers[i];
                    const rank = i + 1;
                    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `**${rank}.**`;
                    const username = user.username || `User ${user.user_id}`;
                    
                    const totalGames = parseInt(user.total_games) || 0;
                    const wins = parseInt(user.total_wins) || 0;
                    const losses = parseInt(user.total_losses) || 0;
                    const winRate = parseFloat(user.win_rate) || 0;
                    
                    leaderboardText += `${medal} **${username}**\n`;
                    leaderboardText += `\`\`\`🏆 ${winRate.toFixed(1)}% WR • ${wins}W-${losses}L • ${totalGames} games\n`;
                    leaderboardText += `💰 ${fmt(user.total_balance)}\`\`\`\n`;
                }

                const chunks = chunkText(leaderboardText);
                chunks.forEach((chunk, idx) => {
                    embed.addFields({
                        name: idx === 0 ? '🎯 Performance Rankings' : '🎯 Performance Rankings (cont.)',
                        value: chunk,
                        inline: false
                    });
                });
            }

            const components = [this.createNavigationButtons('winloss')];
            
            if (isUpdate) {
                await interaction.editReply({ embeds: [embed], components });
            } else {
                await interaction.editReply({ embeds: [embed], components });
                this.setupButtonCollector(interaction, guildId, limit);
            }

        } catch (error) {
            logger.error('Error in win/loss leaderboard:', error.message);
            throw error;
        }
    },

    async showOffEconomyLeaderboard(interaction, guildId, limit, isUpdate = false) {
        logger.info(`Starting off economy leaderboard query: guildId=${guildId}, limit=${limit}`);
        
        try {
            const users = await dbManager.databaseAdapter.executeQuery(`
                SELECT DISTINCT
                    ub.user_id,
                    ub.username,
                    (ub.wallet + ub.bank) as total_balance,
                    ub.wallet,
                    ub.bank,
                    COALESCE(us.total_wins, 0) as total_wins,
                    COALESCE(us.total_losses, 0) as total_losses,
                    COALESCE(us.total_games_played, 0) as total_games
                FROM user_balances ub
                LEFT JOIN user_stats us ON ub.user_id = us.user_id
                WHERE ub.off_economy = TRUE 
                    AND (ub.wallet + ub.bank) > 0
                ORDER BY total_balance DESC
                LIMIT ?
            `, [limit]);

            const uniqueUsers = this.removeDuplicateUsers(users);
            
            const totalUsers = await dbManager.databaseAdapter.executeQuery(`
                SELECT COUNT(DISTINCT user_id) as count
                FROM user_balances 
                WHERE off_economy = TRUE 
                    AND (wallet + bank) > 0
            `);

            const embed = new EmbedBuilder()
                .setTitle('🔴 Off-Economy Leaderboard - Separate Rankings')
                .setDescription(`Exclusive rankings for Off-Economy users (${totalUsers[0]?.count || 0} total users)`)
                .setColor(0xE74C3C)
                .setTimestamp();

            if (uniqueUsers.length === 0) {
                embed.addFields({
                    name: '🔴 No Off-Economy Users',
                    value: 'No Off-Economy users yet!\n\nAdmins can move users off-economy using `/moveoffeco`',
                    inline: false
                });
            } else {
                let leaderboardText = '';
                for (let i = 0; i < uniqueUsers.length; i++) {
                    const user = uniqueUsers[i];
                    const rank = i + 1;
                    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `**${rank}.**`;
                    const username = user.username || `User ${user.user_id}`;
                    const tierDisplay = getTierDisplay(parseFloat(user.total_balance));
                    
                    const totalGames = parseInt(user.total_games) || 0;
                    const wins = parseInt(user.total_wins) || 0;
                    const losses = parseInt(user.total_losses) || 0;
                    const winRate = totalGames > 0 ? ((wins / totalGames) * 100).toFixed(1) : '0.0';
                    
                    leaderboardText += `${medal} **${username}** ${tierDisplay} 🔴\n`;
                    leaderboardText += `\`\`\`💰 ${fmt(user.total_balance)} (💳${fmt(user.wallet)} 🏛️${fmt(user.bank)})\n`;
                    leaderboardText += `🎮 ${totalGames} • 🏆${wins}W 💀${losses}L • ${winRate}%WR\`\`\`\n`;
                }

                const chunks = chunkText(leaderboardText);
                chunks.forEach((chunk, idx) => {
                    embed.addFields({
                        name: idx === 0 ? '🔴 Off-Economy Rankings' : '🔴 Off-Economy Rankings (cont.)',
                        value: chunk,
                        inline: false
                    });
                });

                // Add Off-Economy info
                embed.addFields({
                    name: '🔴 What is Off-Economy?',
                    value: '• Separate competitive ranking system\n• Special "OFF ECO" badges in games\n• Compete only vs other Off-Economy players\n• Same money system, different leaderboard',
                    inline: false
                });

                // Add statistics
                const totalWealth = uniqueUsers.reduce((sum, u) => sum + parseFloat(u.total_balance), 0);
                const avgWealth = totalWealth / uniqueUsers.length;
                const totalGames = uniqueUsers.reduce((sum, u) => sum + (parseInt(u.total_games) || 0), 0);
                const totalWins = uniqueUsers.reduce((sum, u) => sum + (parseInt(u.total_wins) || 0), 0);
                const overallWinRate = totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : '0.0';

                embed.addFields({
                    name: '💎 Off-Eco Summary',
                    value: `**Wealth:** ${fmt(totalWealth)} total • ${fmt(avgWealth)} avg\n**Gaming:** ${totalGames.toLocaleString()} games • ${overallWinRate}% win rate`,
                    inline: false
                });
            }

            const components = [this.createNavigationButtons('offeco')];
            
            if (isUpdate) {
                await interaction.editReply({ embeds: [embed], components });
            } else {
                await interaction.editReply({ embeds: [embed], components });
                this.setupButtonCollector(interaction, guildId, limit);
            }

        } catch (error) {
            logger.error('Error in off-economy leaderboard:', error.message);
            throw error;
        }
    },

    // Setup button collector for all leaderboard types
    setupButtonCollector(interaction, guildId, limit) {
        const filter = (i) => i.customId.startsWith('leaderboard_') && i.user.id === interaction.user.id;
        const collector = interaction.channel.createMessageComponentCollector({ 
            filter, 
            time: 300000 // 5 minutes
        });

        collector.on('collect', async (i) => {
            try {
                if (!i.deferred && !i.replied) {
                    await i.deferUpdate();
                }

                switch (i.customId) {
                    case 'leaderboard_server':
                        await this.showServerLeaderboard(i, guildId, limit, true);
                        break;
                    case 'leaderboard_global':
                        await this.showGlobalLeaderboard(i, limit, true);
                        break;
                    case 'leaderboard_winloss':
                        await this.showWinLossLeaderboard(i, guildId, limit, true);
                        break;
                    case 'leaderboard_offeco':
                        await this.showOffEconomyLeaderboard(i, guildId, limit, true);
                        break;
                }
            } catch (error) {
                logger.error(`Leaderboard button error (${i.customId}): ${error.message}`);
            }
        });

        collector.on('end', () => {
            // Disable all buttons after collector ends
            const disabledRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('disabled_server')
                        .setLabel('🏠 Server')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('disabled_global')
                        .setLabel('🌍 Global')
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('disabled_winloss')
                        .setLabel('🏆 W/L')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('disabled_offeco')
                        .setLabel('🔴 Off-Eco')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(true)
                );

            interaction.editReply({ components: [disabledRow] }).catch(() => {
                // Ignore errors if message was deleted
            });
        });
    }
};
