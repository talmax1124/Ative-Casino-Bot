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
        .setDescription('View wealth leaderboards')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Which leaderboard to show')
                .setRequired(false)
                .addChoices(
                    { name: '🏆 Regular Economy', value: 'regular' },
                    { name: '🔴 Off Economy', value: 'offeco' }
                )
        )
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Number of users to show (1-25)')
                .setMinValue(1)
                .setMaxValue(25)
                .setRequired(false)
        ),

    async execute(interaction) {
        const type = interaction.options.getString('type') || 'regular';
        const limit = interaction.options.getInteger('limit') || 10;
        const guildId = await getGuildId(interaction);
        
        logger.info(`Leaderboard command called: type=${type}, limit=${limit}, guildId=${guildId}, user=${interaction.user.id}`);
        
        try {
            await interaction.deferReply();

            if (type === 'offeco') {
                await this.showOffEconomyLeaderboard(interaction, guildId, limit);
            } else {
                await this.showRegularLeaderboard(interaction, guildId, limit);
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

    async showRegularLeaderboard(interaction, guildId, limit) {
        logger.info(`Starting regular leaderboard query: guildId=${guildId}, limit=${limit}`);
        // Get regular economy users (excluding developers, admins, and off-economy users) with win/loss stats
        let users;
        try {
            users = await dbManager.databaseAdapter.executeQuery(`
                SELECT 
                    ub.user_id,
                    ub.username,
                    (ub.wallet + ub.bank) as total_balance,
                    ub.wallet,
                    ub.bank,
                    ub.off_economy,
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
        } catch (error) {
            logger.error('Database error in regular leaderboard:', error.message);
            logger.error('Full error object:', error);
            // Fallback query without stats
            users = await dbManager.databaseAdapter.executeQuery(`
                SELECT 
                    user_id,
                    username,
                    (wallet + bank) as total_balance,
                    wallet,
                    bank,
                    off_economy,
                    0 as total_wins,
                    0 as total_losses,
                    0 as total_games
                FROM user_balances 
                WHERE (off_economy = FALSE OR off_economy IS NULL) 
                    AND (wallet + bank) > 0
                    AND user_id != '466050111680544798'
                ORDER BY total_balance DESC
                LIMIT ?
            `, [limit]);
        }
        logger.info(`Regular leaderboard users fetched: ${users.length} (limit=${limit}, guildId=${guildId})`);

        let totalUsers;
        try {
            totalUsers = await dbManager.databaseAdapter.executeQuery(`
                SELECT COUNT(*) as count
                FROM user_balances 
                WHERE (off_economy = FALSE OR off_economy IS NULL) 
                    AND (wallet + bank) > 0
                    AND user_id != '466050111680544798'
            `);
        } catch (error) {
            logger.error('Database error in regular leaderboard total count:', error.message);
            logger.error('Full error object (total count):', error);
            totalUsers = [{ count: 0 }]; // Fallback
        }

        const totalCount = totalUsers[0]?.count || 0;

        let leaderboardText = '';
        if (users.length === 0) {
            leaderboardText = 'No users found in regular economy yet!';
        } else {
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
                leaderboardText += `\`\`\`\n💰 ${fmt(user.total_balance)} (💳 ${fmt(user.wallet)} | 🏛️ ${fmt(user.bank)})\n`;
                leaderboardText += `🎮 ${totalGames} games • 🏆 ${wins}W • 💀 ${losses}L • ${winRate}% WR\n\`\`\`\n`;
            }
        }

        // Create action row with buttons
        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('leaderboard_regular')
                    .setLabel('🏆 Regular Economy')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true), // Currently selected
                new ButtonBuilder()
                    .setCustomId('leaderboard_offeco')
                    .setLabel('🔴 Off Economy')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('leaderboard_offeco_main')
                    .setLabel('OFF ECO LEADERBOARD')
                    .setStyle(ButtonStyle.Danger)
            );

        const embed = new EmbedBuilder()
            .setTitle('🏆 Regular Economy Leaderboard')
            .setDescription(`Top ${limit} users in regular economy (${totalCount} total users)\n🏆 **W**ins • 💀 **L**osses • **WR** Win Rate`)
            .setColor(0xFFD700)
            // Discord enforces a 1024 char max per field; chunk long text
            // into multiple fields to avoid AggregateError: "Received one or more errors"
            .setFooter({ 
                text: `🏆 Regular Economy • Use buttons to switch views • Top ${limit} of ${totalCount}` 
            })
            .setTimestamp();

        // Add leaderboard text as one or more fields (<=1024 each)
        const lbChunks = chunkText(leaderboardText);
        if (lbChunks.length > 1) {
            logger.warn(`Regular leaderboard text chunked into ${lbChunks.length} fields. First chunk length: ${lbChunks[0].length}`);
        }
        lbChunks.forEach((chunk, idx) => {
            embed.addFields({
                name: idx === 0 ? '💰 Wealth & Performance Rankings' : '💰 Wealth & Performance Rankings (cont.)',
                value: chunk,
                inline: false
            });
        });

        // Add statistics if we have users
        if (users.length > 0) {
            const totalWealth = users.reduce((sum, u) => sum + parseFloat(u.total_balance), 0);
            const avgWealth = totalWealth / users.length;
            const topUser = users[0];
            
            // Calculate gaming stats
            const totalGames = users.reduce((sum, u) => sum + (parseInt(u.total_games) || 0), 0);
            const totalWins = users.reduce((sum, u) => sum + (parseInt(u.total_wins) || 0), 0);
            const totalLosses = users.reduce((sum, u) => sum + (parseInt(u.total_losses) || 0), 0);
            const overallWinRate = totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : '0.0';
            
            embed.addFields({
                name: '📊 Wealth Statistics',
                value: `**Total Wealth:** ${fmt(totalWealth)}\n` +
                       `**Average:** ${fmt(avgWealth)}\n` +
                       `**Richest:** ${fmt(topUser.total_balance)}`,
                inline: true
            });
            
            embed.addFields({
                name: '🎮 Gaming Statistics',
                value: `**Total Games:** ${totalGames.toLocaleString()}\n` +
                       `**Total Wins:** ${totalWins.toLocaleString()}\n` +
                       `**Overall Win Rate:** ${overallWinRate}%`,
                inline: true
            });

            // Calculate tier distribution
            const tierCounts = {};
            users.forEach(user => {
                const tier = getTierDisplay(parseFloat(user.total_balance));
                const tierName = tier.split(' ')[1] || 'Unknown'; // Extract tier name
                tierCounts[tierName] = (tierCounts[tierName] || 0) + 1;
            });
            
            const topTiers = Object.entries(tierCounts)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 3)
                .map(([tier, count]) => `**${tier}:** ${count}`)
                .join('\n');

            embed.addFields({
                name: '🏆 Tier Distribution',
                value: topTiers || 'No tier data available',
                inline: true
            });
        }

        try {
            await interaction.editReply({ embeds: [embed], components: [actionRow] });
        } catch (error) {
            logger.error('Failed to send regular leaderboard embed:', error.message);
            logEmbedDiagnostics(embed, [actionRow], 'regular_leaderboard');
            logDiscordErrorDetails(error, 'regular_leaderboard');
            throw error; // Let caller handle user-facing error
        }

        // Set up button interaction collector
        const filter = (i) => i.customId.startsWith('leaderboard_') && i.user.id === interaction.user.id;
        const collector = interaction.channel.createMessageComponentCollector({ 
            filter, 
            time: 300000 // 5 minutes
        });

        collector.on('collect', async (i) => {
            try {
                if (i.customId === 'leaderboard_offeco' || i.customId === 'leaderboard_offeco_main') {
                    if (!i.deferred && !i.replied) {
                        await i.deferUpdate();
                    }
                    await this.showOffEconomyLeaderboard(i, guildId, limit, true);
                } else if (i.customId === 'leaderboard_regular') {
                    if (!i.deferred && !i.replied) {
                        await i.deferUpdate();
                    }
                    await this.showRegularLeaderboard(i, guildId, limit, true);
                }
            } catch (error) {
                logger.error(`Leaderboard button error (customId=${i.customId}): ${error.message}`);
                logDiscordErrorDetails(error, 'leaderboard_button');
            }
        });

        collector.on('end', () => {
            // Disable buttons after collector ends
            const disabledRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('leaderboard_regular_disabled')
                        .setLabel('🏆 Regular Economy')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('leaderboard_offeco_disabled')
                        .setLabel('🔴 Off Economy')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('leaderboard_offeco_main_disabled')
                        .setLabel('OFF ECO LEADERBOARD')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(true)
                );

            interaction.editReply({ components: [disabledRow] }).catch(() => {
                // Ignore errors if message was deleted
            });
        });
    },

    async showOffEconomyLeaderboard(interaction, guildId, limit, isUpdate = false) {
        logger.info(`Starting off economy leaderboard query: guildId=${guildId}, limit=${limit}, isUpdate=${isUpdate}`);
        // Get off economy users with win/loss stats
        let users;
        try {
            users = await dbManager.databaseAdapter.executeQuery(`
                SELECT 
                    ub.user_id,
                    ub.username,
                    (ub.wallet + ub.bank) as totalBalance,
                    ub.wallet,
                    ub.bank,
                    ub.off_economy,
                    COALESCE(us.total_wins, 0) as total_wins,
                    COALESCE(us.total_losses, 0) as total_losses,
                    COALESCE(us.total_games_played, 0) as total_games
                FROM user_balances ub
                LEFT JOIN user_stats us ON ub.user_id = us.user_id
                WHERE ub.off_economy = TRUE AND (ub.wallet + ub.bank) > 0
                ORDER BY totalBalance DESC
                LIMIT ?
            `, [limit]);
        } catch (error) {
            logger.error('Database error in off economy leaderboard:', error.message);
            logger.error('Full error object:', error);
            // Fallback query without stats
            users = await dbManager.databaseAdapter.executeQuery(`
                SELECT 
                    user_id,
                    username,
                    (wallet + bank) as totalBalance,
                    wallet,
                    bank,
                    off_economy,
                    0 as total_wins,
                    0 as total_losses,
                    0 as total_games
                FROM user_balances 
                WHERE off_economy = TRUE AND (wallet + bank) > 0
                ORDER BY totalBalance DESC
                LIMIT ?
            `, [limit]);
        }
        logger.info(`Off economy leaderboard users fetched: ${users.length} (limit=${limit}, guildId=${guildId})`);
        
        let totalOffEcoUsers;
        try {
            totalOffEcoUsers = await dbManager.databaseAdapter.executeQuery(`
                SELECT COUNT(*) as count
                FROM user_balances 
                WHERE off_economy = TRUE AND (wallet + bank) > 0
            `);
        } catch (error) {
            logger.error('Database error in off economy leaderboard total count:', error.message);
            logger.error('Full error object (off eco total count):', error);
            totalOffEcoUsers = [{ count: 0 }]; // Fallback
        }

        const totalCount = totalOffEcoUsers[0]?.count || 0;

        let leaderboardText = '';
        if (users.length === 0) {
            leaderboardText = '🔴 No Off Economy users yet!\n\nAdmins can move users off economy using `/moveoffeco`';
        } else {
            for (let i = 0; i < users.length; i++) {
                const user = users[i];
                const rank = i + 1;
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `**${rank}.**`;
                const tierDisplay = getTierDisplay(parseFloat(user.totalBalance));
                
                // Calculate win rate
                const totalGames = parseInt(user.total_games) || 0;
                const wins = parseInt(user.total_wins) || 0;
                const losses = parseInt(user.total_losses) || 0;
                const winRate = totalGames > 0 ? ((wins / totalGames) * 100).toFixed(1) : '0.0';
                
                leaderboardText += `${medal} **${user.username}** ${tierDisplay} 🔴\n`;
                leaderboardText += `\`\`\`\n💰 ${fmt(user.totalBalance)} (💳 ${fmt(user.wallet)} | 🏛️ ${fmt(user.bank)})\n`;
                leaderboardText += `🎮 ${totalGames} games • 🏆 ${wins}W • 💀 ${losses}L • ${winRate}% WR\n\`\`\`\n`;
            }
        }

        // Create action row with buttons
        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('leaderboard_regular')
                    .setLabel('🏆 Regular Economy')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('leaderboard_offeco')
                    .setLabel('🔴 Off Economy')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true), // Currently selected
                new ButtonBuilder()
                    .setCustomId('leaderboard_offeco_main')
                    .setLabel('OFF ECO LEADERBOARD')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true) // Currently selected
            );

        const embed = new EmbedBuilder()
            .setTitle('🔴 Off Economy Leaderboard')
            .setDescription(`Top ${limit} users in Off Economy (${totalCount} total users)\n🏆 **W**ins • 💀 **L**osses • **WR** Win Rate`)
            .setColor(0xFF6B6B)
            .setFooter({ 
                text: `🔴 Off Economy • Exclusive leaderboard • Top ${limit} of ${totalCount}` 
            })
            .setTimestamp();

        // Add leaderboard text as one or more fields (<=1024 each)
        const offEcoChunks = chunkText(leaderboardText);
        if (offEcoChunks.length > 1) {
            logger.warn(`Off economy leaderboard text chunked into ${offEcoChunks.length} fields. First chunk length: ${offEcoChunks[0].length}`);
        }
        offEcoChunks.forEach((chunk, idx) => {
            embed.addFields({
                name: idx === 0 ? '💰 Off Economy Wealth & Performance Rankings' : '💰 Off Economy Rankings (cont.)',
                value: chunk,
                inline: false
            });
        });

        embed.addFields({
                name: '🔴 What is Off Economy?',
                value: '• Separate competitive ranking system\n' +
                       '• Players get special "OFF ECO" badges in games\n' +
                       '• Compete only against other Off Economy players\n' +
                       '• Money and gameplay work exactly the same',
                inline: false
            });

        // Add statistics if we have users
        if (users.length > 0) {
            const totalWealth = users.reduce((sum, u) => sum + u.totalBalance, 0);
            const avgWealth = totalWealth / users.length;
            const topUser = users[0];
            
            // Calculate gaming stats for Off Economy
            const totalGames = users.reduce((sum, u) => sum + (parseInt(u.total_games) || 0), 0);
            const totalWins = users.reduce((sum, u) => sum + (parseInt(u.total_wins) || 0), 0);
            const totalLosses = users.reduce((sum, u) => sum + (parseInt(u.total_losses) || 0), 0);
            const overallWinRate = totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : '0.0';
            
            embed.addFields({
                name: '📊 Off Eco Wealth',
                value: `**Total Wealth:** ${fmt(totalWealth)}\n` +
                       `**Average:** ${fmt(avgWealth)}\n` +
                       `**Richest:** ${fmt(topUser.totalBalance)}`,
                inline: true
            });
            
            embed.addFields({
                name: '🎮 Off Eco Gaming',
                value: `**Total Games:** ${totalGames.toLocaleString()}\n` +
                       `**Total Wins:** ${totalWins.toLocaleString()}\n` +
                       `**Overall Win Rate:** ${overallWinRate}%`,
                inline: true
            });

            // Calculate tier distribution for Off Economy
            const tierCounts = {};
            users.forEach(user => {
                const tier = getTierDisplay(parseFloat(user.totalBalance));
                const tierName = tier.split(' ')[1] || 'Unknown'; // Extract tier name
                tierCounts[tierName] = (tierCounts[tierName] || 0) + 1;
            });
            
            const topTiers = Object.entries(tierCounts)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 3)
                .map(([tier, count]) => `**${tier}:** ${count}`)
                .join('\n');

            embed.addFields({
                name: '🏆 Off Eco Tiers',
                value: topTiers || 'No tier data available',
                inline: true
            });
        }

        try {
            await interaction.editReply({ embeds: [embed], components: [actionRow] });
        } catch (error) {
            logger.error('Failed to send off economy leaderboard embed:', error.message);
            logEmbedDiagnostics(embed, [actionRow], 'offeco_leaderboard');
            logDiscordErrorDetails(error, 'offeco_leaderboard');
            throw error;
        }

        if (isUpdate) {
            await interaction.editReply({ embeds: [embed], components: [actionRow] });
        } else {
            await interaction.editReply({ embeds: [embed], components: [actionRow] });

            // Set up button interaction collector (same as regular)
            const filter = (i) => i.customId.startsWith('leaderboard_') && i.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({ 
                filter, 
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (i) => {
                try {
                    if (i.customId === 'leaderboard_regular') {
                        if (!i.deferred && !i.replied) {
                            await i.deferUpdate();
                        }
                        await this.showRegularLeaderboard(i, guildId, limit, true);
                    } else if (i.customId === 'leaderboard_offeco' || i.customId === 'leaderboard_offeco_main') {
                        if (!i.deferred && !i.replied) {
                            await i.deferUpdate();
                        }
                        await this.showOffEconomyLeaderboard(i, guildId, limit, true);
                    }
                } catch (error) {
                    logger.error('Leaderboard button error:', error);
                }
            });

            collector.on('end', () => {
                // Disable buttons after collector ends
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('leaderboard_regular_disabled')
                            .setLabel('🏆 Regular Economy')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('leaderboard_offeco_disabled')
                            .setLabel('🔴 Off Economy')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('leaderboard_offeco_main_disabled')
                            .setLabel('OFF ECO LEADERBOARD')
                            .setStyle(ButtonStyle.Danger)
                            .setDisabled(true)
                    );

                interaction.editReply({ components: [disabledRow] }).catch(() => {
                    // Ignore errors if message was deleted
                });
            });
        }
    }
};
