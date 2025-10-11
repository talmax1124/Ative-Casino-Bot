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
                    { name: '🔴 Off-Economy - Separate Rankings', value: 'offeco' },
                    { name: '💕 Marriage Leaderboard - Top Couples', value: 'marriage' }
                )
        )
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Number of users to show (5-50)')
                .setMinValue(5)
                .setMaxValue(50)
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
                case 'marriage':
                    await this.showMarriageLeaderboard(interaction, guildId, limit);
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

    // Helper: fetch Discord display names for users missing/placeholder names
    async enrichUsernames(users, client) {
        if (!Array.isArray(users) || users.length === 0) return users;
        const needsLookup = users.filter(u => {
            const name = (u.username || '').trim();
            if (!name) return true;
            const placeholder1 = /^User[\s-]?\d+$/i.test(name);
            const placeholder2 = name === `User ${u.user_id}` || name === `User-${u.user_id}`;
            return placeholder1 || placeholder2;
        });

        for (const u of needsLookup) {
            try {
                const discordUser = await client.users.fetch(u.user_id);
                const resolved = discordUser?.displayName || discordUser?.globalName || discordUser?.username;
                if (resolved) {
                    u.username = resolved;
                    // Best-effort: update DB username in background
                    try {
                        await dbManager.updateUsername(u.user_id, resolved);
                    } catch (e) {
                        // non-fatal
                    }
                }
            } catch (e) {
                // keep placeholder if fetch fails
            }
        }
        return users;
    },

    // Helper method to create navigation buttons
    createNavigationButtons(activeCategory) {
        const row1 = new ActionRowBuilder()
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
        
        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('leaderboard_marriage')
                    .setLabel('💕 Marriages')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(activeCategory === 'marriage')
            );
        
        return [row1, row2];
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
            // Over-fetch to ensure we can deduplicate to the requested limit
            const fetchLimit = Math.min(limit * 5, 100);
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
                    AND ub.user_id != '466050111680544798'
                ORDER BY total_balance DESC
                LIMIT ?
            `, [fetchLimit]);

            // Ensure unique users and cap to requested limit
            const uniqueUsers = this.removeDuplicateUsers(users).slice(0, limit);
            await this.enrichUsernames(uniqueUsers, interaction.client);
            
            const totalUsers = await dbManager.databaseAdapter.executeQuery(`
                SELECT COUNT(DISTINCT user_id) as count
                FROM user_balances 
                WHERE (off_economy = FALSE OR off_economy IS NULL)
                    AND (wallet + bank) > 1000
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

            const components = this.createNavigationButtons('server');
            
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
            const fetchLimit = Math.min(limit * 5, 100);
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
                    AND ub.user_id != '466050111680544798'
                ORDER BY total_balance DESC
                LIMIT ?
            `, [fetchLimit]);

            const uniqueUsers = this.removeDuplicateUsers(users).slice(0, limit);
            await this.enrichUsernames(uniqueUsers, interaction.client);
            
            const totalUsers = await dbManager.databaseAdapter.executeQuery(`
                SELECT COUNT(DISTINCT user_id) as count
                FROM user_balances 
                WHERE (off_economy = FALSE OR off_economy IS NULL)
                    AND (wallet + bank) > 1000
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

            const components = this.createNavigationButtons('global');
            
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
            const fetchLimit = Math.min(limit * 5, 100);
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
            `, [fetchLimit]);

            const uniqueUsers = this.removeDuplicateUsers(users).slice(0, limit);
            await this.enrichUsernames(uniqueUsers, interaction.client);
            
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

            const components = this.createNavigationButtons('winloss');
            
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
            const fetchLimit = Math.min(limit * 5, 100);
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
                ORDER BY total_balance DESC
                LIMIT ?
            `, [fetchLimit]);

            const uniqueUsers = this.removeDuplicateUsers(users).slice(0, limit);
            await this.enrichUsernames(uniqueUsers, interaction.client);
            
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

            const components = this.createNavigationButtons('offeco');
            
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

    async showMarriageLeaderboard(interaction, guildId, limit, isUpdate = false) {
        logger.info(`Starting marriage leaderboard query: guildId=${guildId}, limit=${limit}`);
        
        try {
            const marriages = await dbManager.databaseAdapter.executeQuery(`
                SELECT 
                    m.id as marriage_id,
                    m.partner1_name,
                    m.partner2_name,
                    m.married_at,
                    COALESCE(mx.level, ml.current_level, 1) as level,
                    COALESCE(mx.total_xp, ml.current_xp, 0) as total_xp,
                    DATEDIFF(NOW(), m.married_at) as days_married,
                    COALESCE(
                        (
                            SELECT SUM(
                                CASE WHEN mcp.challenge_1_completed = TRUE THEN 1 ELSE 0 END +
                                CASE WHEN mcp.challenge_2_completed = TRUE THEN 1 ELSE 0 END +
                                CASE WHEN mcp.challenge_3_completed = TRUE THEN 1 ELSE 0 END +
                                CASE WHEN mcp.challenge_4_completed = TRUE THEN 1 ELSE 0 END +
                                CASE WHEN mcp.bonus_challenge_completed = TRUE THEN 1 ELSE 0 END
                            ) FROM marriage_challenge_progress mcp 
                            WHERE mcp.marriage_id = m.id
                        ), 
                        COALESCE(ml.total_challenges_completed, 0)
                    ) as challenges_completed
                FROM marriages m
                LEFT JOIN marriage_xp mx ON m.id = mx.marriage_id
                LEFT JOIN marriage_levels ml ON m.id = ml.marriage_id
                WHERE m.status = 'active'
                ORDER BY total_xp DESC, level DESC, days_married DESC
                LIMIT ?
            `, [limit]);

            const totalMarriages = await dbManager.databaseAdapter.executeQuery(`
                SELECT COUNT(*) as count
                FROM marriages 
                WHERE status = 'active'
            `);

            const embed = new EmbedBuilder()
                .setTitle('💕 Marriage Leaderboard - Top Couples')
                .setDescription(`Most successful marriages ranked by XP and level (${totalMarriages[0]?.count || 0} active marriages)`)
                .setColor(0xFF69B4)
                .setTimestamp();

            if (marriages.length === 0) {
                embed.addFields({
                    name: '💔 No Active Marriages',
                    value: 'No active marriages found yet!\n\nUse `/marriage propose @user` to start a marriage!',
                    inline: false
                });
            } else {
                let leaderboardText = '';
                for (let i = 0; i < marriages.length; i++) {
                    const marriage = marriages[i];
                    const rank = i + 1;
                    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `**${rank}.**`;
                    
                    const level = parseInt(marriage.level) || 1;
                    const totalXp = parseInt(marriage.total_xp) || 0;
                    const daysMarried = parseInt(marriage.days_married) || 0;
                    const challenges = parseInt(marriage.challenges_completed) || 0;
                    
                    leaderboardText += `${medal} **${marriage.partner1_name}** 💕 **${marriage.partner2_name}**\n`;
                    leaderboardText += `\`\`\`⭐ Level ${level} \u2022 ${totalXp.toLocaleString()} XP\n`;
                    leaderboardText += `📅 ${daysMarried} days together \u2022 🏆 ${challenges} challenges\`\`\`\n`;
                }

                const chunks = chunkText(leaderboardText);
                chunks.forEach((chunk, idx) => {
                    embed.addFields({
                        name: idx === 0 ? '👑 Top Couples' : '👑 Top Couples (cont.)',
                        value: chunk,
                        inline: false
                    });
                });

                // Add marriage statistics
                if (marriages.length > 0) {
                    const totalXp = marriages.reduce((sum, m) => sum + (parseInt(m.total_xp) || 0), 0);
                    const avgXp = totalXp / marriages.length;
                    const totalDays = marriages.reduce((sum, m) => sum + (parseInt(m.days_married) || 0), 0);
                    const avgDays = totalDays / marriages.length;
                    const totalChallenges = marriages.reduce((sum, m) => sum + (parseInt(m.challenges_completed) || 0), 0);
                    
                    embed.addFields({
                        name: '📊 Marriage Statistics',
                        value: `**XP:** ${totalXp.toLocaleString()} total \u2022 ${Math.round(avgXp).toLocaleString()} avg\n**Duration:** ${Math.round(avgDays)} avg days \u2022 ${totalChallenges} total challenges`,
                        inline: false
                    });
                }
            }

            const components = this.createNavigationButtons('marriage');
            
            if (isUpdate) {
                await interaction.editReply({ embeds: [embed], components });
            } else {
                await interaction.editReply({ embeds: [embed], components });
                this.setupButtonCollector(interaction, guildId, limit);
            }

        } catch (error) {
            logger.error('Error in marriage leaderboard:', error.message);
            throw error;
        }
    },

    async showXPLeaderboard(interaction, guildId, limit, isUpdate = false) {
        logger.info(`Starting XP leaderboard query: guildId=${guildId}, limit=${limit}`);
        
        try {
            const users = await dbManager.databaseAdapter.executeQuery(`
                SELECT DISTINCT
                    ul.user_id,
                    ub.username,
                    ul.level,
                    ul.xp,
                    ul.total_xp,
                    ul.games_played,
                    ul.games_won,
                    ul.last_level_up,
                    ul.created_at,
                    (ub.wallet + ub.bank) as total_balance
                FROM user_levels ul
                LEFT JOIN user_balances ub ON ul.user_id COLLATE utf8mb4_unicode_ci = ub.user_id COLLATE utf8mb4_unicode_ci
                WHERE ub.user_id != '466050111680544798'
                    AND (ub.off_economy = FALSE OR ub.off_economy IS NULL)
                    AND ul.total_xp > 0
                ORDER BY ul.total_xp DESC, ul.level DESC
                LIMIT ?
            `, [limit]);

            // Resolve missing display names
            await this.enrichUsernames(users, interaction.client);

            const totalUsers = await dbManager.databaseAdapter.executeQuery(`
                SELECT COUNT(DISTINCT ul.user_id) as count
                FROM user_levels ul
                LEFT JOIN user_balances ub ON ul.user_id COLLATE utf8mb4_unicode_ci = ub.user_id COLLATE utf8mb4_unicode_ci
                WHERE ub.user_id != '466050111680544798'
                    AND (ub.off_economy = FALSE OR ub.off_economy IS NULL)
                    AND ul.total_xp > 0
            `);

            const embed = new EmbedBuilder()
                .setTitle('⭐ XP Leaderboard - Level Rankings')
                .setDescription(`Top players by experience points and level (${totalUsers[0]?.count || 0} total users)`)
                .setColor(0xFFD700)
                .setTimestamp();

            if (users.length === 0) {
                embed.addFields({
                    name: '🎮 No XP Data',
                    value: 'No users with XP data found yet!\n\nStart playing games to earn XP and level up!',
                    inline: false
                });
            } else {
                let leaderboardText = '';
                for (let i = 0; i < users.length; i++) {
                    const user = users[i];
                    const rank = i + 1;
                    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `**${rank}.**`;
                    const username = user.username || `User ${user.user_id}`;
                    
                    const level = parseInt(user.level) || 1;
                    const currentXp = parseInt(user.xp) || 0;
                    const totalXp = parseInt(user.total_xp) || 0;
                    const gamesPlayed = parseInt(user.games_played) || 0;
                    const gamesWon = parseInt(user.games_won) || 0;
                    const winRate = gamesPlayed > 0 ? ((gamesWon / gamesPlayed) * 100).toFixed(1) : '0.0';
                    
                    // Calculate XP needed for next level (simple formula: level * 1000)
                    const xpForNext = level * 1000;
                    const xpProgress = Math.min(currentXp, xpForNext);
                    const progressPercent = xpForNext > 0 ? ((xpProgress / xpForNext) * 100).toFixed(1) : '100.0';
                    
                    leaderboardText += `${medal} **${username}** - Level ${level}\n`;
                    leaderboardText += `\`\`\`⭐ ${totalXp.toLocaleString()} Total XP \u2022 ${currentXp}/${xpForNext} (${progressPercent}%)\n`;
                    leaderboardText += `🎮 ${gamesPlayed} games \u2022 ${winRate}% win rate\`\`\`\n`;
                }

                const chunks = chunkText(leaderboardText);
                chunks.forEach((chunk, idx) => {
                    embed.addFields({
                        name: idx === 0 ? '🏆 XP Champions' : '🏆 XP Champions (cont.)',
                        value: chunk,
                        inline: false
                    });
                });

                // Add XP statistics
                if (users.length > 0) {
                    const totalXp = users.reduce((sum, u) => sum + (parseInt(u.total_xp) || 0), 0);
                    const avgXp = totalXp / users.length;
                    const totalGames = users.reduce((sum, u) => sum + (parseInt(u.games_played) || 0), 0);
                    const totalWins = users.reduce((sum, u) => sum + (parseInt(u.games_won) || 0), 0);
                    const overallWinRate = totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : '0.0';
                    const avgLevel = users.reduce((sum, u) => sum + (parseInt(u.level) || 1), 0) / users.length;
                    
                    embed.addFields({
                        name: '📊 XP Statistics',
                        value: `**XP:** ${totalXp.toLocaleString()} total \u2022 ${Math.round(avgXp).toLocaleString()} avg\n**Levels:** ${avgLevel.toFixed(1)} avg level \u2022 **Gaming:** ${overallWinRate}% win rate`,
                        inline: false
                    });
                }
            }

            const components = this.createNavigationButtons('xp');
            
            if (isUpdate) {
                await interaction.editReply({ embeds: [embed], components });
            } else {
                await interaction.editReply({ embeds: [embed], components });
                this.setupButtonCollector(interaction, guildId, limit);
            }

        } catch (error) {
            logger.error('Error in XP leaderboard:', error.message);
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
                    case 'leaderboard_marriage':
                        await this.showMarriageLeaderboard(i, guildId, limit, true);
                        break;
                }
            } catch (error) {
                logger.error(`Leaderboard button error (${i.customId}): ${error.message}`);
            }
        });

        collector.on('end', () => {
            // Disable all buttons after collector ends
            const disabledRow1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('disabled_server')
                        .setLabel('💰 Top Players')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('disabled_global')
                        .setLabel('🌍 All Players')
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
            
            const disabledRow2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('disabled_marriage')
                        .setLabel('💕 Marriages')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );

            interaction.editReply({ components: [disabledRow1, disabledRow2] }).catch(() => {
                // Ignore errors if message was deleted
            });
        });
    }
};
