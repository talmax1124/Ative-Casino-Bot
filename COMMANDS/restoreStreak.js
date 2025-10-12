/**
 * Restore Streak Command - Admin command to restore a user's voting streak
 * Allows administrators to restore lost voting streaks
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('restorestreak')
        .setDescription('Restore a user\'s voting streak to a specified count (Admin only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user whose streak to restore')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('streakcount')
                .setDescription('The streak count to set (must be positive)')
                .setRequired(true)
                .setMinValue(1)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for restoring the streak')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            // Check if user has admin permissions
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Access Denied')
                    .setDescription('This command requires Administrator permissions.')
                    .setColor(0xFF0000);

                return await interaction.reply({ 
                    embeds: [errorEmbed], 
                    flags: MessageFlags.Ephemeral 
                });
            }

            await interaction.deferReply();

            const targetUser = interaction.options.getUser('user');
            const streakCount = interaction.options.getInteger('streakcount');
            const reason = interaction.options.getString('reason') || 'No reason provided';

            // Get current vote data or create new if doesn't exist
            let currentVoteData = await dbManager.getUserVoteData(targetUser.id);
            
            if (!currentVoteData) {
                // Create new vote data if user has never voted
                currentVoteData = {
                    user_id: targetUser.id,
                    last_vote_ts: 0,
                    vote_streak: 0,
                    total_votes: 0,
                    total_earned: 0,
                    can_use_earnmoney: 0
                };
            }

            // Calculate the user's voting status
            const { calculateVotingStatus } = require('./vote');
            const votingStatus = calculateVotingStatus(currentVoteData);

            // Set the current time as the last vote time to start the 19-hour countdown
            const currentTime = Date.now();
            
            // Prepare updated vote data - set to specified streak count and reset timer
            const updatedVoteData = {
                ...currentVoteData,
                vote_streak: streakCount,
                last_vote_ts: currentTime,
                total_votes: Math.max(currentVoteData.total_votes || 0, streakCount),
                total_earned: currentVoteData.total_earned || 0,
                can_use_earnmoney: currentVoteData.can_use_earnmoney || 0
            };

            // Update the vote data
            const success = await dbManager.updateUserVoteData(targetUser.id, null, updatedVoteData);

            if (success) {
                // Log the action
                logger.info(`Streak restored: ${interaction.user.username} (${interaction.user.id}) restored ${targetUser.username} (${targetUser.id}) streak to ${streakCount} days. Reason: ${reason}`);

                // Calculate next voting deadline (19 hours from now)
                const nextVoteDeadline = Math.floor((currentTime + (19 * 60 * 60 * 1000)) / 1000);

                // Create success embed
                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Streak Restored Successfully')
                    .setDescription(`Successfully restored voting streak for ${targetUser.username} to ${streakCount} days!`)
                    .addFields(
                        {
                            name: '👤 User',
                            value: `${targetUser.username} (${targetUser.id})`,
                            inline: true
                        },
                        {
                            name: '🔥 Previous Streak',
                            value: `${votingStatus.currentStreak || 0} days (${votingStatus.isStreakValid ? 'Active' : 'Broken'})`,
                            inline: true
                        },
                        {
                            name: '🔥 New Streak',
                            value: `${streakCount} days`,
                            inline: true
                        },
                        {
                            name: '⏰ Next Vote Deadline',
                            value: `<t:${nextVoteDeadline}:R>`,
                            inline: true
                        },
                        {
                            name: '🎯 Status',
                            value: '19-hour countdown started',
                            inline: true
                        },
                        {
                            name: '📝 Reason',
                            value: reason,
                            inline: false
                        },
                        {
                            name: '👮 Restored By',
                            value: `${interaction.user.username}`,
                            inline: true
                        },
                        {
                            name: '⏰ Timestamp',
                            value: `<t:${Math.floor(currentTime / 1000)}:F>`,
                            inline: true
                        }
                    )
                    .setColor(0x00FF00)
                    .setThumbnail(targetUser.displayAvatarURL())
                    .setFooter({ 
                        text: 'ATIVE Casino Bot - Streak Management',
                        iconURL: interaction.client.user.displayAvatarURL()
                    })
                    .setTimestamp();

                await interaction.editReply({ embeds: [successEmbed] });

                // Send DM to target user if possible
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setTitle('🔥 Voting Streak Restored!')
                        .setDescription(`Good news! Your voting streak has been restored to ${streakCount} days by an administrator.`)
                        .addFields(
                            {
                                name: '🔥 Your New Streak',
                                value: `${streakCount} days`,
                                inline: true
                            },
                            {
                                name: '⏰ Next Vote Due',
                                value: `<t:${nextVoteDeadline}:R>`,
                                inline: true
                            },
                            {
                                name: '📝 Reason',
                                value: reason,
                                inline: false
                            },
                            {
                                name: '⚠️ Important',
                                value: 'Your 19-hour countdown has started from now. You must vote within 19 hours to maintain your streak!',
                                inline: false
                            },
                            {
                                name: '🗳️ Keep Voting!',
                                value: 'Remember to vote every 12 hours for maximum rewards. Your streak remains safe for up to 19 hours.',
                                inline: false
                            }
                        )
                        .setColor(0x00FF00)
                        .setFooter({ text: 'ATIVE Casino Bot' })
                        .setTimestamp();

                    await targetUser.send({ embeds: [dmEmbed] });
                } catch (dmError) {
                    logger.debug(`Could not send DM to ${targetUser.username}: ${dmError.message}`);
                }

            } else {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Restore Failed')
                    .setDescription('Failed to restore the voting streak. Please check the logs and try again.')
                    .setColor(0xFF0000);

                await interaction.editReply({ embeds: [errorEmbed] });
            }

        } catch (error) {
            logger.error(`Error in restorestreak command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing the streak restoration.')
                .setColor(0xFF0000);

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};
