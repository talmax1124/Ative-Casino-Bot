/**
 * Rank Command - Display user level and XP information
 * Shows current level, XP progress, and leaderboard
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getGuildId } = require('../UTILS/common');
const levelingSystem = require('../UTILS/levelingSystem');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Check your level and XP progress')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Check another user\'s rank (optional)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('view')
                .setDescription('What to view')
                .setRequired(false)
                .addChoices(
                    { name: 'My Rank', value: 'my' },
                    { name: 'Leaderboard', value: 'leaderboard' },
                    { name: 'Level Rewards', value: 'rewards' }
                )
        ),

    async execute(interaction) {
        const guildId = await getGuildId(interaction);
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const view = interaction.options.getString('view') || 'my';
        
        try {
            await interaction.deferReply();

            if (view === 'leaderboard') {
                await showLeaderboard(interaction, guildId);
            } else if (view === 'rewards') {
                await showLevelRewards(interaction);
            } else {
                await showUserRank(interaction, targetUser, guildId);
            }

        } catch (error) {
            logger.error(`Error in rank command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Failed to fetch rank information. Please try again.')
                .setColor(0xFF0000);

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed] });
            }
        }
    }
};

async function showUserRank(interaction, targetUser, guildId) {
    const levelData = await levelingSystem.getUserLevel(targetUser.id, guildId);
    
    // Calculate progress to next level
    const xpForNextLevel = dbManager.calculateXpForNextLevel(levelData.total_xp);
    const currentLevelXp = levelData.xp;
    const xpNeeded = Math.max(0, xpForNextLevel);
    
    // Create progress bar
    const progressTotal = 20;
    const progressFilled = Math.floor((currentLevelXp / (currentLevelXp + xpNeeded)) * progressTotal);
    const progressBar = '█'.repeat(progressFilled) + '░'.repeat(progressTotal - progressFilled);

    // Calculate win rate
    const winRate = levelData.games_played > 0 ? 
        ((levelData.games_won / levelData.games_played) * 100).toFixed(1) : '0.0';

    const embed = new EmbedBuilder()
        .setTitle(`🎯 ${targetUser.displayName || targetUser.username}'s Rank`)
        .setThumbnail(targetUser.displayAvatarURL())
        .setColor(0x00FF99)
        .addFields(
            { 
                name: '📊 Level Progress', 
                value: `**Level:** ${levelData.level} (${levelingSystem.getLevelStatus(levelData.level)})\n**XP:** ${levelData.xp.toLocaleString()} / ${(currentLevelXp + xpNeeded).toLocaleString()}\n**Total XP:** ${levelData.total_xp.toLocaleString()}\n\`${progressBar}\` ${((currentLevelXp / (currentLevelXp + xpNeeded)) * 100).toFixed(1)}%`, 
                inline: false 
            },
            { 
                name: '🎮 Game Statistics', 
                value: `**Games Played:** ${levelData.games_played.toLocaleString()}\n**Games Won:** ${levelData.games_won.toLocaleString()}\n**Win Rate:** ${winRate}%`, 
                inline: true 
            },
            { 
                name: '⏰ Activity', 
                value: `**Last Level Up:** ${levelData.last_level_up ? new Date(levelData.last_level_up).toLocaleDateString() : 'Never'}\n**Member Since:** ${new Date(levelData.created_at).toLocaleDateString()}`, 
                inline: true 
            }
        )
        .setFooter({ text: `🎯 Next level in ${xpNeeded.toLocaleString()} XP` })
        .setTimestamp();

    // Add next reward info if available
    const nextRewardLevel = getNextRewardLevel(levelData.level);
    if (nextRewardLevel) {
        embed.addFields({
            name: '🎁 Next Reward',
            value: `**Level ${nextRewardLevel.level}:** $${nextRewardLevel.money.toLocaleString()} - ${nextRewardLevel.message}`,
            inline: false
        });
    }

    await interaction.editReply({ embeds: [embed] });
}

async function showLeaderboard(interaction, guildId) {
    const leaderboard = await levelingSystem.getLevelLeaderboard(guildId, 10);
    
    if (leaderboard.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('📊 Level Leaderboard')
            .setDescription('No users found with level data yet!')
            .setColor(0xFFD700);
        
        return await interaction.editReply({ embeds: [embed] });
    }

    let description = '';
    for (let i = 0; i < leaderboard.length; i++) {
        const user = leaderboard[i];
        const rank = i + 1;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `**${rank}.**`;
        const username = user.username || `User ${user.user_id}`;
        
        description += `${medal} **${username}** - Level ${user.level} (${user.total_xp.toLocaleString()} XP)\n`;
    }

    const embed = new EmbedBuilder()
        .setTitle('🏆 Level Leaderboard')
        .setDescription(description)
        .setColor(0xFFD700)
        .setFooter({ text: '🎮 Keep playing to climb the ranks!' })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function showLevelRewards(interaction) {
    const rewards = [
        { level: 5, money: 5000, message: "🎉 Welcome bonus!" },
        { level: 10, money: 15000, message: "💰 Getting started!" },
        { level: 15, money: 25000, message: "🚀 Making progress!" },
        { level: 20, money: 50000, message: "⭐ Rising star!" },
        { level: 25, money: 75000, message: "💎 High roller!" },
        { level: 30, money: 100000, message: "👑 Casino elite!" },
        { level: 40, money: 200000, message: "🏆 Legendary gambler!" },
        { level: 50, money: 500000, message: "🎰 Casino Master!" }
    ];

    let description = '**💰 Level-Up Rewards:**\n\n';
    for (const reward of rewards) {
        description += `**Level ${reward.level}:** $${reward.money.toLocaleString()} - ${reward.message}\n`;
    }

    description += '\n**🎯 XP Sources:**\n';
    description += '• **Games:** 5-35 XP base + win bonus\n';
    description += '• **Big Wins:** +30 XP bonus (5x+ multiplier)\n';
    description += '• **Massive Wins:** +50 XP bonus (20x+ multiplier)\n';
    description += '• **Blackjack (21):** +25 XP bonus\n';
    description += '• **Chat Activity:** 2 XP per minute (rate limited)\n';

    const embed = new EmbedBuilder()
        .setTitle('🎁 Level System & Rewards')
        .setDescription(description)
        .setColor(0xFFD700)
        .setFooter({ text: '🎮 Level formula: √(Total XP ÷ 100) + 1' })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

function getNextRewardLevel(currentLevel) {
    const rewards = [
        { level: 5, money: 5000, message: "🎉 Welcome bonus!" },
        { level: 10, money: 15000, message: "💰 Getting started!" },
        { level: 15, money: 25000, message: "🚀 Making progress!" },
        { level: 20, money: 50000, message: "⭐ Rising star!" },
        { level: 25, money: 75000, message: "💎 High roller!" },
        { level: 30, money: 100000, message: "👑 Casino elite!" },
        { level: 40, money: 200000, message: "🏆 Legendary gambler!" },
        { level: 50, money: 500000, message: "🎰 Casino Master!" }
    ];

    return rewards.find(reward => reward.level > currentLevel) || null;
}