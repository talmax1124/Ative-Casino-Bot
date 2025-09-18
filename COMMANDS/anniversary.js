const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const marriageAnniversaryManager = require('../UTILS/marriageAnniversaryManager');
const { fmt, getGuildId } = require('../UTILS/common');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('anniversary')
        .setDescription('Marriage anniversary management and information')
        .addSubcommand(subcommand =>
            subcommand
                .setName('upcoming')
                .setDescription('View upcoming anniversaries in this server')
                .addIntegerOption(option =>
                    option.setName('days')
                        .setDescription('How many days ahead to check (default: 7)')
                        .setMinValue(1)
                        .setMaxValue(30)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View anniversary notification statistics')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Manually trigger anniversary check (Admin only)')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = await getGuildId(interaction);

        await interaction.deferReply();

        try {
            switch (subcommand) {
                case 'upcoming':
                    await this.handleUpcomingAnniversaries(interaction, guildId);
                    break;
                case 'stats':
                    await this.handleAnniversaryStats(interaction, guildId);
                    break;
                case 'check':
                    await this.handleManualCheck(interaction);
                    break;
            }
        } catch (error) {
            logger.error(`Error in anniversary command: ${error.message}`);
            
            await interaction.editReply({
                content: '❌ An error occurred while processing the anniversary command. Please try again later.'
            });
        }
    },

    async handleUpcomingAnniversaries(interaction, guildId) {
        const daysAhead = interaction.options.getInteger('days') || 7;
        
        const upcomingAnniversaries = await marriageAnniversaryManager.getUpcomingAnniversaries(guildId, daysAhead);
        
        const embed = new EmbedBuilder()
            .setTitle('💒 Upcoming Monthly Anniversaries')
            .setColor(0xFF69B4)
            .setTimestamp()
            .setFooter({ text: 'ATIVE Casino Marriage Registry' });

        if (upcomingAnniversaries.length === 0) {
            embed.setDescription(`No monthly anniversaries found in the next ${daysAhead} days. 💔`);
        } else {
            let description = `**📅 Next ${daysAhead} days:**\n\n`;
            
            for (const anniversary of upcomingAnniversaries) {
                const monthText = anniversary.monthsMarried === 1 ? 'month' : 'months';
                const dayText = anniversary.daysUntil === 1 ? 'day' : 'days';
                const emoji = this.getAnniversaryEmoji(anniversary.monthsMarried);
                
                description += `${emoji} **${anniversary.monthsMarried}-Month Anniversary**\n`;
                description += `• <@${anniversary.partner1_id}> & <@${anniversary.partner2_id}>\n`;
                description += `• In **${anniversary.daysUntil} ${dayText}** (${anniversary.anniversaryDate.toLocaleDateString()})\n\n`;
            }
            
            embed.setDescription(description);
        }
        
        await interaction.editReply({ embeds: [embed] });
    },

    async handleAnniversaryStats(interaction, guildId) {
        const stats = await marriageAnniversaryManager.getAnniversaryStats(guildId);
        
        if (!stats) {
            await interaction.editReply({
                content: '❌ Unable to retrieve anniversary statistics at this time.'
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('📊 Anniversary Notification Statistics')
            .setColor(0xFF69B4)
            .addFields(
                {
                    name: '💒 Marriages with Notifications',
                    value: stats.marriages_with_notifications.toString(),
                    inline: true
                },
                {
                    name: '📨 Total Notifications Sent',
                    value: stats.total_notifications_sent.toString(),
                    inline: true
                },
                {
                    name: '⏰ Average Marriage Length',
                    value: `${Math.round(stats.avg_months_married || 0)} months`,
                    inline: true
                },
                {
                    name: '🏆 Longest Marriage',
                    value: `${stats.longest_marriage_months || 0} months`,
                    inline: true
                },
                {
                    name: '✅ Successful DM Deliveries',
                    value: `${stats.partner1_notifications + stats.partner2_notifications} / ${stats.total_notifications_sent * 2}`,
                    inline: true
                },
                {
                    name: '📈 Success Rate',
                    value: stats.total_notifications_sent > 0 
                        ? `${Math.round(((stats.partner1_notifications + stats.partner2_notifications) / (stats.total_notifications_sent * 2)) * 100)}%`
                        : '0%',
                    inline: true
                }
            )
            .setTimestamp()
            .setFooter({ text: 'ATIVE Casino Marriage Registry' });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleManualCheck(interaction) {
        // Check if user has admin permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.editReply({
                content: '❌ You need Administrator permissions to manually trigger anniversary checks.'
            });
            return;
        }

        await interaction.editReply({
            content: '🔄 Manually triggering anniversary check...'
        });

        try {
            await marriageAnniversaryManager.triggerAnniversaryCheck();
            
            await interaction.editReply({
                content: '✅ Anniversary check completed! Any couples with anniversaries today should have received DM notifications.'
            });
        } catch (error) {
            logger.error(`Error during manual anniversary check: ${error.message}`);
            
            await interaction.editReply({
                content: '❌ An error occurred during the anniversary check. Check the logs for details.'
            });
        }
    },

    getAnniversaryEmoji(monthsMarried) {
        if (monthsMarried >= 12) return '🎆'; // 1+ years
        if (monthsMarried >= 6) return '💎';  // 6+ months
        if (monthsMarried >= 3) return '🌟';  // 3+ months
        return '💕'; // 1-2 months
    }
};