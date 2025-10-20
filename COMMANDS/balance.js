/**
 * Balance command for ATIVE Casino Bot
 * Shows simplified balance information
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { secureRandomFloat } = require('../UTILS/rng');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage, getEconomicTier } = require('../UTILS/common');
const logger = require('../UTILS/logger');

// Developer ID for Off-Economy status
const DEVELOPER_ID = '466050111680544798';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your balance or another user\'s balance')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to check balance for')
                .setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;
        const username = targetUser.displayName;
        const guildId = await getGuildId(interaction);

        try {
            await interaction.deferReply();

            // Ensure user exists in database
            await dbManager.ensureUser(userId, username);
            
            // Force cache refresh to ensure accurate balance display
            try {
                const nodeCache = require('../UTILS/nodeCache');
                const cacheKey = `casino:balance:${userId}:${guildId}`;
                await nodeCache.del(cacheKey);
                logger.debug(`🔄 Forced cache refresh for balance command`);
            } catch (cacheError) {
                logger.debug(`Balance cache refresh failed: ${cacheError.message}`);
            }
            
            // Get balance information
            const balance = await dbManager.getUserBalance(userId, guildId);
            const totalBalance = parseFloat(balance.wallet) + parseFloat(balance.bank);
            const tier = getEconomicTier(totalBalance);
            
            // Check if this is the developer (Off-Economy status)
            const isOffEconomy = targetUser.id === DEVELOPER_ID;

            // Determine color and status based on total balance
            let embedColor = 0x2ECC71; // Green default
            let statusEmoji = '💰';
            let statusText = 'Getting Started';
            
            if (isOffEconomy) {
                embedColor = 0x9B59B6; // Purple for developer
                statusEmoji = '🛡️';
                statusText = 'Developer';
            } else if (totalBalance >= 10000000) {
                embedColor = 0xFFD700; // Gold for 10M+
                statusEmoji = '👑';
                statusText = 'Casino Royalty';
            } else if (totalBalance >= 1000000) {
                embedColor = 0xE74C3C; // Red for 1M+
                statusEmoji = '💎';
                statusText = 'High Roller';
            } else if (totalBalance >= 100000) {
                embedColor = 0x3498DB; // Blue for 100K+
                statusEmoji = '⭐';
                statusText = 'Rising Star';
            } else if (totalBalance >= 10000) {
                embedColor = 0x9B59B6; // Purple for 10K+
                statusEmoji = '🎯';
                statusText = 'Player';
            }

            // Create attractive embed with better styling
            const embed = new EmbedBuilder()
                .setTitle(`${statusEmoji} ${username}'s Casino Balance`)
                .setColor(embedColor)
                .setDescription(`**${statusText}** • ${tier.name}`)
                .addFields(
                    { name: '\u200B', value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', inline: false },
                    { 
                        name: '💰 Financial Overview', 
                        value: `\`\`\`yaml\nWallet: ${fmt(balance.wallet)}\nBank:   ${fmt(balance.bank)}\nTotal:  ${fmt(totalBalance)}\`\`\``, 
                        inline: false 
                    },
                    { name: '\u200B', value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', inline: false }
                )
                .addFields(
                    { name: '💵 Available Cash', value: `**${fmt(balance.wallet)}**`, inline: true },
                    { name: '🏦 Banked Safely', value: `**${fmt(balance.bank)}**`, inline: true },
                    { name: '💎 Net Worth', value: `**${fmt(totalBalance)}**`, inline: true }
                );

            // Add tier information
            if (!isOffEconomy) {
                const tierInfo = this.getTierDescription(totalBalance);
                embed.addFields(
                    { name: '\u200B', value: '\u200B', inline: false },
                    { 
                        name: `🎖️ ${tier.name}`, 
                        value: tierInfo, 
                        inline: false 
                    }
                );
            } else {
                embed.addFields(
                    { name: '\u200B', value: '\u200B', inline: false },
                    { 
                        name: '🛡️ Developer Status', 
                        value: '• **Off-Economy Protection**\n• **Cannot be robbed**\n• **Admin privileges**', 
                        inline: false 
                    }
                );
            }

            // Add footer with personalized message
            const footerMessages = [
                'Keep climbing those tiers!',
                'Your money is working for you!',
                'Smart banking pays off!',
                'Fortune favors the bold!',
                'Every dollar counts!'
            ];
            const randomFooter = footerMessages[Math.floor(secureRandomFloat(0, footerMessages.length))];
            
            embed.setFooter({ text: `💰 ${randomFooter} • ATIVE Casino` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Log balance check (only for other users)
            if (targetUser.id !== interaction.user.id) {
                await sendLogMessage(
                    interaction.client,
                    'economy',
                    `Balance check: ${interaction.user.displayName} viewed ${username}'s balance (${fmt(totalBalance)} total)`,
                    interaction.user.id,
                    guildId
                );
            }

        } catch (error) {
            logger.error(`Error processing balance command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Balance Error')
                .setDescription('Unable to retrieve balance information.')
                .setColor(0xFF0000)
                .setFooter({ text: 'Please try again later' })
                .setTimestamp();

            try {
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: 64 });
                }

                // Send error log
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `Balance error for ${interaction.user.displayName} checking ${username} — ${error.message}`,
                    interaction.user.id,
                    guildId
                );
            } catch (replyError) {
                // Handle specific Discord interaction errors gracefully
                if (replyError.message && replyError.message.includes('Unknown interaction')) {
                    logger.debug(`Balance interaction expired for user ${interaction.user.id} - command processed but couldn't send reply`);
                } else if (replyError.code === 10062) {
                    logger.debug(`Balance interaction expired (code 10062) for user ${interaction.user.id} - command processed but couldn't send reply`);
                } else {
                    logger.error(`Failed to send balance error reply: ${replyError.message}`);
                }
            }
        }
    },

    // Helper method to get tier descriptions
    getTierDescription(totalBalance) {
        if (totalBalance >= 10000000) {
            return '• **Elite Casino Member**\n• **Maximum Interest Rate**\n• **Premium Perks Available**';
        } else if (totalBalance >= 1000000) {
            return '• **High-Stakes Player**\n• **Excellent Interest Rate**\n• **VIP Treatment**';
        } else if (totalBalance >= 100000) {
            return '• **Experienced Gambler**\n• **Good Interest Rate**\n• **Special Bonuses**';
        } else if (totalBalance >= 10000) {
            return '• **Active Player**\n• **Standard Interest Rate**\n• **Regular Bonuses**';
        } else {
            return '• **Welcome to the Casino!**\n• **Basic Interest Rate**\n• **Starter Bonuses**';
        }
    }
};