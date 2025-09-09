/**
 * Cooldown Command - Display all user cooldowns and limits
 * Shows current cooldowns for all economy and game commands
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getGuildId } = require('../UTILS/common');
const dbManager = require('../UTILS/database');
const { fmt } = require('../UTILS/moneyFormatter');
const logger = require('../UTILS/logger');

// Cooldown durations (in milliseconds)
const COOLDOWNS = {
    work: 4 * 60 * 60 * 1000, // 4 hours
    beg: 45 * 60 * 1000, // 45 minutes
    crime: 2 * 60 * 60 * 1000, // 2 hours
    heist: 24 * 60 * 60 * 1000, // 24 hours
    rob: 2 * 60 * 60 * 1000, // 2 hours (approximate, varies by user)
    earn: 24 * 60 * 60 * 1000, // 24 hours (earnmoney command)
    // Send money has daily reset instead of cooldown
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cooldown')
        .setDescription('Check your command cooldowns and daily limits')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Check another user\'s cooldowns (optional)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const guildId = await getGuildId(interaction);
        
        try {
            await interaction.deferReply();

            // Get user balance for cooldown data
            const userBalance = await dbManager.getUserBalance(targetUser.id, guildId);
            const now = Date.now();
            
            // Calculate remaining cooldowns
            const cooldownData = [];

            // Work cooldown - ensure timestamp is in milliseconds
            const lastWork = (userBalance.last_work_ts || 0);
            const lastWorkMs = lastWork < 1000000000000 ? lastWork * 1000 : lastWork; // Convert if in seconds
            const workRemaining = Math.max(0, COOLDOWNS.work - (now - lastWorkMs));
            cooldownData.push({
                command: '💼 Work',
                remaining: workRemaining,
                description: 'Earn daily income'
            });

            // Beg cooldown - ensure timestamp is in milliseconds
            const lastBeg = (userBalance.last_beg_ts || 0);
            const lastBegMs = lastBeg < 1000000000000 ? lastBeg * 1000 : lastBeg;
            const begRemaining = Math.max(0, COOLDOWNS.beg - (now - lastBegMs));
            cooldownData.push({
                command: '🤲 Beg',
                remaining: begRemaining,
                description: 'Ask for spare change'
            });

            // Crime cooldown - ensure timestamp is in milliseconds
            const lastCrime = (userBalance.last_crime_ts || 0);
            const lastCrimeMs = lastCrime < 1000000000000 ? lastCrime * 1000 : lastCrime;
            const crimeRemaining = Math.max(0, COOLDOWNS.crime - (now - lastCrimeMs));
            cooldownData.push({
                command: '🔫 Crime',
                remaining: crimeRemaining,
                description: 'Commit crimes for money'
            });

            // Heist cooldown - ensure timestamp is in milliseconds
            const lastHeist = (userBalance.last_heist_ts || 0);
            const lastHeistMs = lastHeist < 1000000000000 ? lastHeist * 1000 : lastHeist;
            const heistRemaining = Math.max(0, COOLDOWNS.heist - (now - lastHeistMs));
            cooldownData.push({
                command: '🏦 Heist',
                remaining: heistRemaining,
                description: 'Plan elaborate heists'
            });

            // Rob cooldown (approximate, actual varies by user) - ensure timestamp is in milliseconds
            const lastRob = (userBalance.last_rob_ts || 0);
            const lastRobMs = lastRob < 1000000000000 ? lastRob * 1000 : lastRob;
            const robRemaining = Math.max(0, COOLDOWNS.rob - (now - lastRobMs));
            cooldownData.push({
                command: '🔒 Rob',
                remaining: robRemaining,
                description: 'Rob other users'
            });

            // Earn money cooldown - ensure timestamp is in milliseconds
            const lastEarn = (userBalance.last_earn_ts || 0);
            const lastEarnMs = lastEarn < 1000000000000 ? lastEarn * 1000 : lastEarn;
            const earnRemaining = Math.max(0, COOLDOWNS.earn - (now - lastEarnMs));
            cooldownData.push({
                command: '💰 Earn Money',
                remaining: earnRemaining,
                description: 'Vote rewards & bonuses'
            });

            // Daily send limit
            const today = Math.floor(now / (1000 * 60 * 60 * 24));
            const lastResetDay = Math.floor((userBalance.last_send_reset || 0) / (1000 * 60 * 60 * 24));
            const dailySent = (today > lastResetDay) ? 0 : (userBalance.daily_sent || 0);
            const DAILY_SEND_LIMIT = 45000000;
            const sendRemaining = DAILY_SEND_LIMIT - dailySent;
            
            // Build embed
            const embed = new EmbedBuilder()
                .setTitle(`⏱️ ${targetUser.displayName || targetUser.username}'s Cooldowns`)
                .setThumbnail(targetUser.displayAvatarURL())
                .setColor(0x3498DB)
                .setTimestamp();

            // Add cooldown fields
            let cooldownText = '';
            for (const cooldown of cooldownData) {
                const status = cooldown.remaining > 0 
                    ? `⏳ ${formatDuration(cooldown.remaining)}` 
                    : '✅ Ready';
                
                cooldownText += `**${cooldown.command}**\n${status} - ${cooldown.description}\n\n`;
            }

            embed.addFields({
                name: '⏱️ Command Cooldowns',
                value: cooldownText,
                inline: false
            });

            // Add daily limits section
            let limitsText = '';
            limitsText += `**💸 Send Money**\n`;
            if (sendRemaining <= 0) {
                limitsText += `🚫 Daily limit reached (${fmt(DAILY_SEND_LIMIT)})\n`;
                const nextReset = Math.ceil(now / (1000 * 60 * 60 * 24)) * (1000 * 60 * 60 * 24);
                const resetTime = formatDuration(nextReset - now);
                limitsText += `Resets in: ${resetTime}\n`;
            } else {
                limitsText += `✅ ${fmt(sendRemaining)} remaining today\n`;
                limitsText += `Sent: ${fmt(dailySent)} / ${fmt(DAILY_SEND_LIMIT)}\n`;
            }

            embed.addFields({
                name: '📊 Daily Limits',
                value: limitsText,
                inline: false
            });

            // Add helpful tips
            const readyCommands = cooldownData.filter(c => c.remaining === 0).length;
            const onCooldown = cooldownData.length - readyCommands;
            
            embed.addFields({
                name: '📋 Summary',
                value: `**Ready:** ${readyCommands} commands\n**On Cooldown:** ${onCooldown} commands\n**Tip:** Use commands when ready to maximize earnings!`,
                inline: false
            });

            embed.setFooter({ 
                text: '⏱️ Cooldowns help balance the economy • Times are approximate' 
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error(`Error in cooldown command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Failed to fetch cooldown information. Please try again.')
                .setColor(0xFF0000);

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed] });
            }
        }
    }
};

/**
 * Format duration in milliseconds to human readable string
 */
function formatDuration(ms) {
    if (ms <= 0) return '0s';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        const remainingHours = hours % 24;
        if (remainingHours > 0) {
            return `${days}d ${remainingHours}h`;
        }
        return `${days}d`;
    } else if (hours > 0) {
        const remainingMinutes = minutes % 60;
        if (remainingMinutes > 0) {
            return `${hours}h ${remainingMinutes}m`;
        }
        return `${hours}h`;
    } else if (minutes > 0) {
        const remainingSeconds = seconds % 60;
        if (remainingSeconds > 0 && minutes < 5) { // Only show seconds for short durations
            return `${minutes}m ${remainingSeconds}s`;
        }
        return `${minutes}m`;
    } else {
        return `${seconds}s`;
    }
}