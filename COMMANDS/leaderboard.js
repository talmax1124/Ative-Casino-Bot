/**
 * Leaderboard command showing Wins/Losses and Money Rankings by Economic Tier
 * Displays user rankings based on total balance and game statistics
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtFull, getGuildId, getTierDisplay, getEconomicTier, getAllTiers } = require('../UTILS/common');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View server leaderboards for money and game statistics')
        .addStringOption(option =>
            option.setName('category')
                .setDescription('Leaderboard category to display')
                .setRequired(false)
                .addChoices(
                    { name: '💰 Money Rankings', value: 'money' },
                    { name: '🏆 Win/Loss Records', value: 'winloss' },
                    { name: '🎖️ Economic Tiers', value: 'tiers' }
                )
        ),

    async execute(interaction) {
        const category = interaction.options.getString('category') || 'money';
        const guildId = await getGuildId(interaction);

        try {
            await interaction.deferReply();

            switch (category) {
                case 'money':
                    await showMoneyLeaderboard(interaction, guildId);
                    break;
                case 'winloss':
                    await showWinLossLeaderboard(interaction, guildId);
                    break;
                case 'tiers':
                    await showTierInformation(interaction);
                    break;
                default:
                    await showMoneyLeaderboard(interaction, guildId);
            }

        } catch (error) {
            logger.error(`Error in leaderboard command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Leaderboard Error')
                .setDescription('Unable to load leaderboard data. Please try again.')
                .setColor(0xFF0000)
                .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                .setFooter({ text: '🛠️ Error • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};

/**
 * Display money leaderboard organized by economic tiers
 */
async function showMoneyLeaderboard(interaction, guildId) {
    // Get all users with balances in this guild
    const users = await dbManager.getTopUsersByBalance(guildId, 50); // Get top 50 users
    
    if (!users || users.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('💰 Money Leaderboard')
            .setDescription('No users found with balances in this server.')
            .setColor(0xFFD700)
            .setThumbnail(interaction.client.user.displayAvatarURL())
            .setFooter({ text: '💰 Money Rankings • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

        return await interaction.editReply({ embeds: [embed] });
    }

    // Group users by economic tiers
    const tiers = getAllTiers().reverse(); // Start with highest tiers
    const tierGroups = {};
    
    // Initialize tier groups
    for (const tier of tiers) {
        tierGroups[tier.key] = [];
    }

    // Categorize users by their economic tier
    for (const user of users) {
        const totalBalance = (user.wallet || 0) + (user.bank || 0);
        const tier = getEconomicTier(totalBalance);
        
        if (totalBalance > 0) { // Only show users with positive balance
            tierGroups[tier.key].push({
                ...user,
                totalBalance,
                tier
            });
        }
    }

    // Sort users within each tier by total balance (descending)
    for (const tierKey of Object.keys(tierGroups)) {
        tierGroups[tierKey].sort((a, b) => b.totalBalance - a.totalBalance);
    }

    // Build embed
    const embed = new EmbedBuilder()
        .setTitle('💰 Money Leaderboard - Economic Tiers')
        .setDescription('Rankings organized by economic tiers based on total balance (Wallet + Bank)')
        .setColor(0xFFD700)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setFooter({ text: '💰 Money Rankings • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    let overallRank = 1;
    let hasResults = false;

    // Add fields for each tier with users
    for (const tier of tiers) {
        const tierUsers = tierGroups[tier.key];
        if (tierUsers.length === 0) continue;

        hasResults = true;
        let tierText = '';
        const maxUsersPerTier = 5; // Limit to prevent embed from being too long

        for (let i = 0; i < Math.min(tierUsers.length, maxUsersPerTier); i++) {
            const user = tierUsers[i];
            const medal = overallRank <= 3 ? ['🥇', '🥈', '🥉'][overallRank - 1] : `#${overallRank}`;
            
            tierText += `${medal} **${user.username || 'Unknown'}**\n`;
            tierText += `   💰 ${fmtFull(user.totalBalance)} (💵 ${fmt(user.wallet || 0)} | 🏦 ${fmt(user.bank || 0)})\n`;
            
            overallRank++;
        }

        if (tierUsers.length > maxUsersPerTier) {
            tierText += `\n*...and ${tierUsers.length - maxUsersPerTier} more in this tier*`;
        }

        embed.addFields({
            name: `${tier.emoji} ${tier.name} Tier (${fmtFull(tier.min)} - ${tier.max === Infinity ? '∞' : fmtFull(tier.max)})`,
            value: tierText || 'No users in this tier',
            inline: false
        });
    }

    if (!hasResults) {
        embed.setDescription('No users found with positive balances to display.');
    }

    // Add navigation buttons
    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('leaderboard_winloss')
                .setLabel('🏆 Win/Loss Records')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('leaderboard_tiers')
                .setLabel('🎖️ Tier Information')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('leaderboard_refresh')
                .setLabel('🔄 Refresh')
                .setStyle(ButtonStyle.Primary)
        );

    await interaction.editReply({ embeds: [embed], components: [buttons] });
}

/**
 * Display win/loss leaderboard
 */
async function showWinLossLeaderboard(interaction, guildId) {
    // Get users with game statistics
    const users = await dbManager.getTopUsersByWins(guildId, 20); // Get top 20 by wins
    
    if (!users || users.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('🏆 Win/Loss Leaderboard')
            .setDescription('No game statistics found for users in this server.')
            .setColor(0x00FF00)
            .setThumbnail(interaction.client.user.displayAvatarURL())
            .setFooter({ text: '🏆 Win/Loss Records • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

        return await interaction.editReply({ embeds: [embed] });
    }

    const embed = new EmbedBuilder()
        .setTitle('🏆 Win/Loss Leaderboard')
        .setDescription('Top players ranked by game performance')
        .setColor(0x00FF00)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setFooter({ text: '🏆 Win/Loss Records • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    // Most Wins section
    let winsText = '';
    for (let i = 0; i < Math.min(users.length, 10); i++) {
        const user = users[i];
        const medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : `#${i + 1}`;
        const wins = user.total_wins || 0;
        const losses = user.total_losses || 0;
        const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0.0';
        
        winsText += `${medal} **${user.username || 'Unknown'}**\n`;
        winsText += `   ✅ ${wins} wins | ❌ ${losses} losses | 📊 ${winRate}% WR\n`;
    }

    embed.addFields({
        name: '🏆 Most Wins',
        value: winsText || 'No wins recorded',
        inline: false
    });

    // Best Win Rate section (minimum 10 games played)
    const qualifiedUsers = users.filter(user => {
        const totalGames = (user.total_wins || 0) + (user.total_losses || 0);
        return totalGames >= 10;
    });

    qualifiedUsers.sort((a, b) => {
        const aWinRate = (a.total_wins || 0) / ((a.total_wins || 0) + (a.total_losses || 0));
        const bWinRate = (b.total_wins || 0) / ((b.total_wins || 0) + (b.total_losses || 0));
        return bWinRate - aWinRate;
    });

    let winRateText = '';
    for (let i = 0; i < Math.min(qualifiedUsers.length, 5); i++) {
        const user = qualifiedUsers[i];
        const wins = user.total_wins || 0;
        const losses = user.total_losses || 0;
        const winRate = ((wins / (wins + losses)) * 100).toFixed(1);
        const totalGames = wins + losses;
        
        winRateText += `${i + 1}. **${user.username || 'Unknown'}** - ${winRate}%\n`;
        winRateText += `   📊 ${wins}W/${losses}L (${totalGames} games)\n`;
    }

    embed.addFields({
        name: '📊 Best Win Rate (10+ games)',
        value: winRateText || 'No qualified players',
        inline: false
    });

    // Add navigation buttons
    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('leaderboard_money')
                .setLabel('💰 Money Rankings')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('leaderboard_tiers')
                .setLabel('🎖️ Tier Information')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('leaderboard_refresh')
                .setLabel('🔄 Refresh')
                .setStyle(ButtonStyle.Primary)
        );

    await interaction.editReply({ embeds: [embed], components: [buttons] });
}

/**
 * Display economic tier information
 */
async function showTierInformation(interaction) {
    const tiers = getAllTiers().reverse(); // Show from highest to lowest

    const embed = new EmbedBuilder()
        .setTitle('🎖️ Economic Tier System')
        .setDescription('Advance through tiers by accumulating wealth and earn exclusive benefits!')
        .setColor(0x9B59B6)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setFooter({ text: '🎖️ Economic Tiers • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    for (const tier of tiers) {
        const rangeText = tier.max === Infinity ? `${fmtFull(tier.min)}+` : `${fmtFull(tier.min)} - ${fmtFull(tier.max)}`;
        const interestText = tier.interest > 0 ? `\n💰 **${(tier.interest * 100).toFixed(0)}% Annual Interest** on bank balance` : '';
        
        let benefitsText = '';
        if (tier.key === 'PLATINUM') benefitsText += '\n🎮 Access to exclusive games';
        if (tier.key === 'DIAMOND') benefitsText += '\n🔝 Higher betting limits\n🖼️ GIF permissions';
        if (tier.key === 'LEGENDARY') benefitsText += '\n🏷️ Custom bot profile badge';
        if (tier.key === 'MYTHIC') benefitsText += '\n⚡ Priority support';

        embed.addFields({
            name: `${tier.emoji} ${tier.name} Tier`,
            value: `💰 **Balance Range:** ${rangeText}${interestText}${benefitsText}`,
            inline: true
        });
    }

    embed.addFields({
        name: '📋 Tier Rules',
        value: '• Tiers based on **total balance** (wallet + bank)\n• Must maintain minimum balance for tier\n• Interest calculated daily on **bank balance only**\n• Inactivity over 10 days results in tier downgrade',
        inline: false
    });

    // Add navigation buttons
    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('leaderboard_money')
                .setLabel('💰 Money Rankings')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('leaderboard_winloss')
                .setLabel('🏆 Win/Loss Records')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('leaderboard_refresh')
                .setLabel('🔄 Refresh')
                .setStyle(ButtonStyle.Primary)
        );

    await interaction.editReply({ embeds: [embed], components: [buttons] });
}