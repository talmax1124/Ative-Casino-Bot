/**
 * Bot Ban Command - Developer Only
 * Allows the developer to manually ban users for economy violations
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const botBanSystem = require('../UTILS/botBanSystem');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');

const DEVELOPER_USER_ID = '466050111680544798';
const DEVELOPER_ROLE_ID = '1408165119946526872';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('botban')
        .setDescription('🔒 Developer only: Manage bot bans for economy violations')
        .addSubcommand(subcommand =>
            subcommand.setName('user')
                .setDescription('Ban a user for economy violations')
                .addUserOption(option =>
                    option.setName('target')
                        .setDescription('User to ban')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Ban reason')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Quintillion Threshold Exceeded', value: 'QUINTILLION_THRESHOLD' },
                            { name: 'Ten Billion Threshold Exceeded', value: 'TEN_BILLION_THRESHOLD' },
                            { name: 'Extreme Amount Detected', value: 'EXTREME_AMOUNT_THRESHOLD' },
                            { name: 'Exploit/Abuse Detected', value: 'MANUAL_EXPLOIT' },
                            { name: 'Economy System Abuse', value: 'ECONOMY_ABUSE' }
                        )))
        .addSubcommand(subcommand =>
            subcommand.setName('userid')
                .setDescription('Ban a user by their Discord ID')
                .addStringOption(option =>
                    option.setName('userid')
                        .setDescription('Discord User ID to ban')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Ban reason')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Quintillion Threshold Exceeded', value: 'QUINTILLION_THRESHOLD' },
                            { name: 'Ten Billion Threshold Exceeded', value: 'TEN_BILLION_THRESHOLD' },
                            { name: 'Extreme Amount Detected', value: 'EXTREME_AMOUNT_THRESHOLD' },
                            { name: 'Exploit/Abuse Detected', value: 'MANUAL_EXPLOIT' },
                            { name: 'Economy System Abuse', value: 'ECONOMY_ABUSE' }
                        )))
        .addSubcommand(subcommand =>
            subcommand.setName('unban')
                .setDescription('Unban a user')
                .addUserOption(option =>
                    option.setName('target')
                        .setDescription('User to unban')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('check')
                .setDescription('Check if a user is banned')
                .addUserOption(option =>
                    option.setName('target')
                        .setDescription('User to check')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('checkid')
                .setDescription('Check if a user is banned by their ID (database check)')
                .addStringOption(option =>
                    option.setName('userid')
                        .setDescription('Discord User ID to check')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('list')
                .setDescription('List all banned users'))
        .addSubcommand(subcommand =>
            subcommand.setName('stats')
                .setDescription('Show bot ban system statistics')),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        // Check if user is the developer
        const isDeveloper = interaction.user.id === DEVELOPER_USER_ID;
        const hasRole = interaction.member?.roles?.cache?.has(DEVELOPER_ROLE_ID);

        if (!isDeveloper && !hasRole) {
            return await interaction.editReply({
                content: '❌ **Access Denied**\n\nThis command is restricted to developers only.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'user':
                    await this.handleUserBan(interaction);
                    break;
                case 'userid':
                    await this.handleUserIdBan(interaction);
                    break;
                case 'unban':
                    await this.handleUnban(interaction);
                    break;
                case 'check':
                    await this.handleCheck(interaction);
                    break;
                case 'checkid':
                    await this.handleCheckId(interaction);
                    break;
                case 'list':
                    await this.handleList(interaction);
                    break;
                case 'stats':
                    await this.handleStats(interaction);
                    break;
                default:
                    await interaction.editReply('❌ Unknown subcommand.');
            }
        } catch (error) {
            logger.error(`Error in botban command: ${error.message}`);
            await interaction.editReply('❌ An error occurred while processing the command.');
        }
    },

    async handleUserBan(interaction) {
        const target = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason');

        if (target.bot) {
            return await interaction.editReply('❌ Cannot ban bots.');
        }

        if (target.id === DEVELOPER_USER_ID) {
            return await interaction.editReply('❌ Cannot ban the developer.');
        }

        // Check if already banned
        if (botBanSystem.isUserBanned(target.id)) {
            const banReason = botBanSystem.getBanReason(target.id);
            return await interaction.editReply(
                `❌ User **${target.username}** is already banned.\n` +
                `**Reason:** ${banReason.reason.replace(/_/g, ' ')}\n` +
                `**Amount:** ${botBanSystem.formatAmount(banReason.amount)}`
            );
        }

        // Get current balance
        const balance = await dbManager.getUserBalance(target.id);
        const totalAmount = (balance.wallet || 0) + (balance.bank || 0);

        // Create manual ban decision
        const banDecision = {
            reason: reason,
            amount: totalAmount,
            threshold: reason.includes('QUINTILLION') ? 1e18 : 
                      reason.includes('TEN_BILLION') ? 10e9 :
                      reason.includes('EXTREME') ? 1e15 : totalAmount,
            severity: 'MANUAL'
        };

        // Execute the ban
        const success = await botBanSystem.executeBan(target.id, banDecision, interaction.client);

        if (success) {
            const embed = new EmbedBuilder()
                .setTitle('🚫 User Banned Successfully')
                .setDescription(`**${target.username}** has been banned from the economy system.`)
                .addFields(
                    {
                        name: '👤 Target User',
                        value: `<@${target.id}> (${target.username})`,
                        inline: true
                    },
                    {
                        name: '⚠️ Reason',
                        value: reason.replace(/_/g, ' '),
                        inline: true
                    },
                    {
                        name: '💰 Balance at Ban',
                        value: botBanSystem.formatAmount(totalAmount),
                        inline: true
                    },
                    {
                        name: '👮 Banned By',
                        value: `<@${interaction.user.id}>`,
                        inline: true
                    },
                    {
                        name: '⏰ Ban Time',
                        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                        inline: true
                    }
                )
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            
            logger.info(`Manual bot ban executed by ${interaction.user.id} on ${target.id} for ${reason}`);
        } else {
            await interaction.editReply('❌ Failed to ban user. Check logs for details.');
        }
    },

    async handleUserIdBan(interaction) {
        const userId = interaction.options.getString('userid');
        const reason = interaction.options.getString('reason');

        // Validate Discord user ID format
        if (!/^\d{17,19}$/.test(userId)) {
            return await interaction.editReply('❌ Invalid Discord User ID format. Please provide a valid 17-19 digit user ID.');
        }

        if (userId === DEVELOPER_USER_ID) {
            return await interaction.editReply('❌ Cannot ban the developer.');
        }

        // Check if already banned
        if (botBanSystem.isUserBanned(userId)) {
            const banReason = botBanSystem.getBanReason(userId);
            return await interaction.editReply(
                `❌ User ID **${userId}** is already banned.\n` +
                `**Reason:** ${banReason.reason.replace(/_/g, ' ')}\n` +
                `**Amount:** ${botBanSystem.formatAmount(banReason.amount)}`
            );
        }

        // Get current balance
        const balance = await dbManager.getUserBalance(userId);
        const totalAmount = (balance.wallet || 0) + (balance.bank || 0);

        // Create manual ban decision
        const banDecision = {
            reason: reason,
            amount: totalAmount,
            threshold: reason.includes('QUINTILLION') ? 1e18 : 
                      reason.includes('TEN_BILLION') ? 10e9 :
                      reason.includes('EXTREME') ? 1e15 : totalAmount,
            severity: 'MANUAL'
        };

        // Execute the ban
        const success = await botBanSystem.executeBan(userId, banDecision, interaction.client);

        if (success) {
            const embed = new EmbedBuilder()
                .setTitle('🚫 User Banned Successfully')
                .setDescription(`User ID **${userId}** has been banned from the economy system.`)
                .addFields(
                    {
                        name: '👤 Target User ID',
                        value: userId,
                        inline: true
                    },
                    {
                        name: '⚠️ Reason',
                        value: reason.replace(/_/g, ' '),
                        inline: true
                    },
                    {
                        name: '💰 Balance at Ban',
                        value: botBanSystem.formatAmount(totalAmount),
                        inline: true
                    },
                    {
                        name: '👮 Banned By',
                        value: `<@${interaction.user.id}>`,
                        inline: true
                    },
                    {
                        name: '⏰ Ban Time',
                        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                        inline: true
                    }
                )
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            
            logger.info(`Manual bot ban executed by ${interaction.user.id} on ${userId} for ${reason}`);
        } else {
            await interaction.editReply('❌ Failed to ban user. Check logs for details.');
        }
    },

    async handleUnban(interaction) {
        const target = interaction.options.getUser('target');

        if (!botBanSystem.isUserBanned(target.id)) {
            return await interaction.editReply(`❌ User **${target.username}** is not banned.`);
        }

        const success = await botBanSystem.unbanUser(target.id, interaction.user.id);

        if (success) {
            const embed = new EmbedBuilder()
                .setTitle('✅ User Unbanned Successfully')
                .setDescription(`**${target.username}** has been unbanned and restored to the economy system.`)
                .addFields(
                    {
                        name: '👤 Target User',
                        value: `<@${target.id}> (${target.username})`,
                        inline: true
                    },
                    {
                        name: '👮 Unbanned By',
                        value: `<@${interaction.user.id}>`,
                        inline: true
                    },
                    {
                        name: '⏰ Unban Time',
                        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                        inline: true
                    },
                    {
                        name: '💰 Starting Balance',
                        value: '$1,000',
                        inline: true
                    }
                )
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            
            logger.info(`Manual unban executed by ${interaction.user.id} on ${target.id}`);
        } else {
            await interaction.editReply('❌ Failed to unban user. Check logs for details.');
        }
    },

    async handleCheck(interaction) {
        const target = interaction.options.getUser('target');
        const isBanned = botBanSystem.isUserBanned(target.id);

        if (isBanned) {
            const banReason = botBanSystem.getBanReason(target.id);
            const embed = new EmbedBuilder()
                .setTitle('🚫 User Ban Status')
                .setDescription(`**${target.username}** is currently **BANNED**.`)
                .addFields(
                    {
                        name: '⚠️ Ban Reason',
                        value: banReason.reason.replace(/_/g, ' '),
                        inline: true
                    },
                    {
                        name: '💰 Amount at Ban',
                        value: botBanSystem.formatAmount(banReason.amount),
                        inline: true
                    },
                    {
                        name: '🔴 Severity',
                        value: banReason.severity,
                        inline: true
                    }
                )
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else {
            const balance = await dbManager.getUserBalance(target.id);
            const totalAmount = (balance.wallet || 0) + (balance.bank || 0);
            
            const embed = new EmbedBuilder()
                .setTitle('✅ User Ban Status')
                .setDescription(`**${target.username}** is **NOT BANNED**.`)
                .addFields(
                    {
                        name: '💰 Current Balance',
                        value: botBanSystem.formatAmount(totalAmount),
                        inline: true
                    },
                    {
                        name: '🛡️ Status',
                        value: 'Active Economy Participant',
                        inline: true
                    }
                )
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    },

    async handleCheckId(interaction) {
        const userId = interaction.options.getString('userid');
        
        // Validate Discord user ID format
        if (!/^\d{17,19}$/.test(userId)) {
            return await interaction.editReply('❌ Invalid Discord User ID format. Please provide a valid 17-19 digit user ID.');
        }

        try {
            // Check database directly for ban status
            const banStatus = await botBanSystem.isUserBannedInDatabase(userId);
            
            if (banStatus.error) {
                return await interaction.editReply(`❌ Error checking user: ${banStatus.error}`);
            }

            if (banStatus.banned) {
                const embed = new EmbedBuilder()
                    .setTitle('🚫 User Ban Status (Database Check)')
                    .setDescription(`User ID **${userId}** is **BANNED** in the database.`)
                    .addFields(
                        {
                            name: '👤 User ID',
                            value: userId,
                            inline: true
                        },
                        {
                            name: '⚠️ Ban Reason',
                            value: banStatus.reason.replace(/_/g, ' '),
                            inline: true
                        },
                        {
                            name: '💰 Balance/Amount',
                            value: banStatus.amount ? botBanSystem.formatAmount(banStatus.amount) : 
                                   banStatus.originalAmount ? botBanSystem.formatAmount(banStatus.originalAmount) : 'Unknown',
                            inline: true
                        },
                        {
                            name: '🕐 Ban Timestamp',
                            value: banStatus.banTimestamp ? `<t:${Math.floor(new Date(banStatus.banTimestamp).getTime() / 1000)}:F>` : 'Unknown',
                            inline: true
                        },
                        {
                            name: '🚨 Status',
                            value: '**BLOCKED FROM ALL BOT USAGE**',
                            inline: false
                        }
                    )
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('✅ User Ban Status (Database Check)')
                    .setDescription(`User ID **${userId}** is **NOT BANNED**.`)
                    .addFields(
                        {
                            name: '👤 User ID',
                            value: userId,
                            inline: true
                        },
                        {
                            name: '💰 Current Balance',
                            value: banStatus.amount !== undefined ? botBanSystem.formatAmount(banStatus.amount) : 'Unknown',
                            inline: true
                        },
                        {
                            name: '🛡️ Status',
                            value: 'Can use bot normally',
                            inline: true
                        }
                    )
                    .setColor(0x00FF00)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            logger.error(`Error in checkid command: ${error.message}`);
            await interaction.editReply('❌ An error occurred while checking the user ID.');
        }
    },

    async handleList(interaction) {
        const stats = botBanSystem.getStats();
        
        if (stats.totalBans === 0) {
            return await interaction.editReply('✅ No users are currently banned.');
        }

        const bannedUsers = Array.from(botBanSystem.bannedUsers);
        const userList = bannedUsers.slice(0, 10).map(userId => {
            const banReason = botBanSystem.getBanReason(userId);
            return `• <@${userId}> - ${banReason.reason.replace(/_/g, ' ')} (${botBanSystem.formatAmount(banReason.amount)})`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setTitle('🚫 Banned Users List')
            .setDescription(userList)
            .addFields(
                {
                    name: '📊 Total Bans',
                    value: stats.totalBans.toString(),
                    inline: true
                },
                {
                    name: '📈 History Count',
                    value: stats.banHistory.toString(),
                    inline: true
                }
            )
            .setColor(0xFF0000)
            .setTimestamp();

        if (stats.totalBans > 10) {
            embed.setFooter({ text: `Showing first 10 of ${stats.totalBans} banned users` });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async handleStats(interaction) {
        const stats = botBanSystem.getStats();
        
        const embed = new EmbedBuilder()
            .setTitle('📊 Bot Ban System Statistics')
            .addFields(
                {
                    name: '🚫 Total Active Bans',
                    value: stats.totalBans.toString(),
                    inline: true
                },
                {
                    name: '📈 Total Ban History',
                    value: stats.banHistory.toString(),
                    inline: true
                },
                {
                    name: '🎯 Thresholds',
                    value: `• Quintillion: ${botBanSystem.formatAmount(stats.thresholds.QUINTILLION)}\n• Ten Billion: ${botBanSystem.formatAmount(stats.thresholds.THREE_BILLION)}\n• Extreme: ${botBanSystem.formatAmount(stats.thresholds.EXTREME_AMOUNT)}`,
                    inline: false
                }
            )
            .setColor(0x0099FF)
            .setTimestamp();

        if (stats.lastBan) {
            embed.addFields({
                name: '🕐 Last Ban',
                value: `<@${stats.lastBan.userId}> - ${stats.lastBan.reason.replace(/_/g, ' ')} (<t:${Math.floor(stats.lastBan.executedAt / 1000)}:R>)`,
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });
    }
};