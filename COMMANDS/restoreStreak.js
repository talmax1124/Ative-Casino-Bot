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
        .setDescription('Restore a user\'s voting streak to their highest recorded value (Admin only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user whose streak to restore')
                .setRequired(true)
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
                    ephemeral: true 
                });
            }

            await interaction.deferReply();

            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';

            // Get current vote data
            const currentVoteData = await dbManager.getUserVoteData(targetUser.id);
            
            if (!currentVoteData) {
                const noDataEmbed = new EmbedBuilder()
                    .setTitle('❌ No Vote Data')
                    .setDescription(`${targetUser.username} has no voting data. They need to vote at least once before their streak can be restored.`)
                    .setColor(0xFF0000);

                return await interaction.editReply({ embeds: [noDataEmbed] });
            }

            // Calculate the user's voting status to get their highest streak
            const { calculateVotingStatus } = require('./vote');
            const votingStatus = calculateVotingStatus(currentVoteData);
            
            // Use the stored streak (highest recorded) as the restore value
            const highestStreak = currentVoteData.vote_streak || 0;
            
            if (highestStreak === 0) {
                const noStreakEmbed = new EmbedBuilder()
                    .setTitle('❌ No Streak to Restore')
                    .setDescription(`${targetUser.username} has no recorded voting streak to restore.`)
                    .setColor(0xFF0000);

                return await interaction.editReply({ embeds: [noStreakEmbed] });
            }

            // Check if streak is already active
            if (votingStatus.isStreakValid && votingStatus.currentStreak > 0) {
                const alreadyActiveEmbed = new EmbedBuilder()
                    .setTitle('ℹ️ Streak Already Active')
                    .setDescription(`${targetUser.username} already has an active streak of ${votingStatus.currentStreak} days.`)
                    .addFields({
                        name: '🔥 Current Status',
                        value: `Active streak: ${votingStatus.currentStreak} days\nHighest recorded: ${highestStreak} days`,
                        inline: false
                    })
                    .setColor(0xFFD700);

                return await interaction.editReply({ embeds: [alreadyActiveEmbed] });
            }

            // Prepare updated vote data - restore to highest streak
            const updatedVoteData = {
                ...currentVoteData,
                vote_streak: highestStreak
            };

            // Update the vote data
            const success = await dbManager.updateUserVoteData(targetUser.id, updatedVoteData);

            if (success) {
                // Log the action
                logger.info(`Streak restored: ${interaction.user.username} (${interaction.user.id}) restored ${targetUser.username} (${targetUser.id}) streak to ${highestStreak} (highest recorded). Reason: ${reason}`);

                // Create success embed
                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Streak Restored Successfully')
                    .setDescription(`Successfully restored voting streak for ${targetUser.username} to their highest recorded value!`)
                    .addFields(
                        {
                            name: '👤 User',
                            value: `${targetUser.username} (${targetUser.id})`,
                            inline: true
                        },
                        {
                            name: '🔥 Previous Status',
                            value: `${votingStatus.currentStreak} days (${votingStatus.isStreakValid ? 'Active' : 'Broken'})`,
                            inline: true
                        },
                        {
                            name: '🔥 Restored Streak',
                            value: `${highestStreak} days`,
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
                            value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
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
                        .setDescription(`Good news! Your voting streak has been restored to your highest recorded value by an administrator.`)
                        .addFields(
                            {
                                name: '🔥 Your Restored Streak',
                                value: `${highestStreak} days`,
                                inline: true
                            },
                            {
                                name: '📝 Reason',
                                value: reason,
                                inline: true
                            },
                            {
                                name: '⚠️ Important',
                                value: 'This is a one-time restoration to your highest recorded streak. If you lose it again, you\'ll need to rebuild it naturally.',
                                inline: false
                            },
                            {
                                name: '🗳️ Keep Voting!',
                                value: 'Remember to vote every 12 hours to maintain your streak!',
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
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};