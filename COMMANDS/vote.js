/**
 * Vote command for Top.GG integration
 * Users can vote for rewards and check their vote status
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt } = require('../UTILS/common');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Vote for the bot on Top.GG and get rewards!')
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Get voting information and links')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Check your voting statistics')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        try {
            if (subcommand === 'info') {
                await this.showVoteInfo(interaction);
            } else if (subcommand === 'stats') {
                await this.showVoteStats(interaction, userId);
            }
        } catch (error) {
            console.error('Vote command error:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing the vote command.',
                ephemeral: true
            });
        }
    },

    async showVoteInfo(interaction) {
        const voteEmbed = new EmbedBuilder()
            .setTitle('🗳️ Vote for ATIVE Casino Bot!')
            .setDescription('**Support the bot and get awesome rewards!**')
            .addFields(
                {
                    name: '💰 Voting Rewards',
                    value: '• **25,000 coins** per vote\n• **Weekend Bonus**: +50% extra coins\n• **Streak Bonuses**: Up to 1M coins!',
                    inline: false
                },
                {
                    name: '🏆 Streak Bonuses',
                    value: '• **7 days**: +50K coins\n• **30 days**: +200K coins\n• **100 days**: +1M coins!',
                    inline: false
                },
                {
                    name: '⏰ Voting Schedule',
                    value: '• Vote **every 12 hours**\n• Automatic rewards via webhook\n• Streak resets if you miss a day',
                    inline: false
                },
                {
                    name: '🔗 Vote Links',
                    value: '[🗳️ **Vote on Top.GG**](https://top.gg/bot/1403236218900185088/vote)\n[📊 **Bot Page**](https://top.gg/bot/1403236218900185088)',
                    inline: false
                }
            )
            .setColor(0x00D4FF)
            .setThumbnail(interaction.client.user.displayAvatarURL())
            .setFooter({ 
                text: '🎰 ATIVE Casino • Every vote helps us grow!',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTimestamp();

        await interaction.reply({ embeds: [voteEmbed] });
    },

    async showVoteStats(interaction, userId) {
        try {
            // Get user vote data from database
            const voteData = await dbManager.databaseAdapter.getUserVoteData(userId);

            if (!voteData) {
                const noStatsEmbed = new EmbedBuilder()
                    .setTitle('🗳️ No Voting History')
                    .setDescription('You haven\'t voted yet! Use `/vote info` to get started.')
                    .setColor(0xFF6B35)
                    .setFooter({ text: '🎰 ATIVE Casino' });

                await interaction.reply({ embeds: [noStatsEmbed] });
                return;
            }

            // Calculate time until next vote (12 hours)
            const lastVoteTime = voteData.last_vote_ts || 0;
            const nextVoteTime = lastVoteTime + (12 * 60 * 60 * 1000);
            const canVoteNow = Date.now() >= nextVoteTime;
            
            // Calculate current streak
            const hoursSinceLastVote = (Date.now() - lastVoteTime) / (1000 * 60 * 60);
            const currentStreak = voteData.vote_streak || 0;

            const statsEmbed = new EmbedBuilder()
                .setTitle('🗳️ Your Voting Statistics')
                .setDescription(`**${interaction.user.username}**'s voting history`)
                .addFields(
                    {
                        name: '📊 Vote Count',
                        value: `${voteData.total_votes || 0} total votes`,
                        inline: true
                    },
                    {
                        name: '💰 Total Earned',
                        value: `${fmt(voteData.total_earned || 0)} coins`,
                        inline: true
                    },
                    {
                        name: '🔥 Current Streak',
                        value: `${currentStreak} day${currentStreak !== 1 ? 's' : ''}`,
                        inline: true
                    },
                    {
                        name: '⏰ Next Vote',
                        value: canVoteNow ? '**Available Now!**' : `<t:${Math.floor(nextVoteTime / 1000)}:R>`,
                        inline: true
                    },
                    {
                        name: '🎯 Status',
                        value: voteData.can_use_earnmoney ? '✅ Active Voter' : '❌ Need to vote',
                        inline: true
                    },
                    {
                        name: '📅 Last Vote',
                        value: lastVoteTime > 0 ? `<t:${Math.floor(lastVoteTime / 1000)}:R>` : 'Never',
                        inline: true
                    }
                )
                .setColor(canVoteNow ? 0x00D4FF : 0x64748b)
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({ text: '🎰 ATIVE Casino • Vote every 12 hours!' })
                .setTimestamp();

            if (canVoteNow) {
                statsEmbed.addFields({
                    name: '🔗 Ready to Vote?',
                    value: '[🗳️ **Vote Now on Top.GG**](https://top.gg/bot/1403236218900185088/vote)',
                    inline: false
                });
            }

            await interaction.reply({ embeds: [statsEmbed] });

        } catch (error) {
            console.error('Error getting vote stats:', error);
            await interaction.reply({
                content: '❌ Failed to retrieve voting statistics.',
                ephemeral: true
            });
        }
    }
};