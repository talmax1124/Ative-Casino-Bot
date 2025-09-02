/**
 * Warn Command - Issue warnings to users
 * Auto-mute after 3 warnings
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const dbManager = require('../../UTILS/database');
const logger = require('../../UTILS/logger');
const ms = require('ms');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Issue a warning to a user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to warn')
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for the warning')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
        try {
            // Check if user is admin or mod
            const member = interaction.member;
            const roleNames = member.roles.cache.map(role => role.name.toLowerCase());
            const isAdmin = roleNames.some(role => role.includes('admin'));
            const isMod = roleNames.some(role => role.includes('mod'));
            const isDev = interaction.user.id === process.env.DEVELOPER_USER_ID;

            if (!isAdmin && !isMod && !isDev) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Access Denied')
                    .setDescription('This command is restricted to administrators and moderators only.')
                    .setColor(0xFF0000)
                    .setTimestamp();
                
                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            await interaction.deferReply();

            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');

            // Check if target is admin/dev (cannot warn)
            const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            
            if (targetMember) {
                const targetRoles = targetMember.roles.cache.map(role => role.name.toLowerCase());
                const targetIsAdmin = targetRoles.some(role => role.includes('admin'));
                const targetIsDev = targetUser.id === process.env.DEVELOPER_USER_ID;

                if (targetIsAdmin || targetIsDev) {
                    const embed = new EmbedBuilder()
                        .setTitle('❌ Cannot Warn')
                        .setDescription('You cannot warn administrators or developers.')
                        .setColor(0xFF0000)
                        .setTimestamp();
                    
                    return await interaction.editReply({ embeds: [embed] });
                }
            }

            // Add warning to database
            const warningCount = await dbManager.addWarning(
                interaction.guild.id,
                targetUser.id,
                interaction.user.id,
                reason
            );

            // Log moderation action
            await dbManager.logModerationAction(
                interaction.guild.id,
                interaction.user.id,
                targetUser.id,
                'warn',
                reason,
                null
            );

            // Create warning embed
            const embed = new EmbedBuilder()
                .setTitle('⚠️ User Warned')
                .setDescription(`Successfully warned **${targetUser.tag}**`)
                .addFields(
                    { name: 'User', value: `${targetUser} (${targetUser.id})`, inline: false },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Warning Count', value: `${warningCount}/3`, inline: true },
                    { name: 'Moderator', value: interaction.user.toString(), inline: true }
                )
                .setColor(0xFFAA00)
                .setThumbnail(targetUser.displayAvatarURL())
                .setTimestamp();

            // Check if user needs auto-mute (3 warnings)
            if (warningCount >= 3) {
                try {
                    // Find muted role or create it
                    let mutedRole = interaction.guild.roles.cache.find(role => role.name === 'Muted');
                    
                    if (!mutedRole) {
                        mutedRole = await interaction.guild.roles.create({
                            name: 'Muted',
                            color: '#808080',
                            permissions: [],
                            reason: 'Auto-created for muting system'
                        });

                        // Set up channel permissions for muted role
                        for (const channel of interaction.guild.channels.cache.values()) {
                            if (channel.isTextBased()) {
                                await channel.permissionOverwrites.edit(mutedRole, {
                                    SendMessages: false,
                                    AddReactions: false,
                                    CreatePublicThreads: false,
                                    CreatePrivateThreads: false
                                }).catch(console.error);
                            }
                        }
                    }

                    // Apply mute
                    if (targetMember && mutedRole) {
                        await targetMember.roles.add(mutedRole, '3 warnings reached - auto-mute');
                        
                        // Log auto-mute
                        await dbManager.logModerationAction(
                            interaction.guild.id,
                            interaction.client.user.id,
                            targetUser.id,
                            'mute',
                            '3 warnings reached - automatic 1 hour mute',
                            '1h'
                        );

                        embed.addFields({
                            name: '🔇 Auto-Mute Applied',
                            value: 'User has reached 3 warnings and has been automatically muted for 1 hour.',
                            inline: false
                        });

                        embed.setColor(0xFF0000);

                        // Schedule unmute after 1 hour
                        setTimeout(async () => {
                            try {
                                if (targetMember.roles.cache.has(mutedRole.id)) {
                                    await targetMember.roles.remove(mutedRole, 'Auto-mute expired (1 hour)');
                                    
                                    // Log unmute
                                    await dbManager.logModerationAction(
                                        interaction.guild.id,
                                        interaction.client.user.id,
                                        targetUser.id,
                                        'unmute',
                                        'Auto-mute expired (3 warnings)',
                                        null
                                    );

                                    logger.info(`Auto-unmuted ${targetUser.tag} after 1 hour (3 warnings)`);
                                }
                            } catch (error) {
                                logger.error(`Failed to auto-unmute ${targetUser.tag}:`, error);
                            }
                        }, 60 * 60 * 1000); // 1 hour
                    }

                } catch (error) {
                    logger.error('Failed to apply auto-mute:', error);
                    embed.addFields({
                        name: '⚠️ Auto-Mute Failed',
                        value: 'User reached 3 warnings but auto-mute failed. Please mute manually.',
                        inline: false
                    });
                }
            } else {
                const remaining = 3 - warningCount;
                embed.addFields({
                    name: 'ℹ️ Next Action',
                    value: `User will be auto-muted for 1 hour after ${remaining} more warning(s).`,
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

            // Try to DM the user
            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle('⚠️ You received a warning')
                    .setDescription(`You received a warning in **${interaction.guild.name}**`)
                    .addFields(
                        { name: 'Reason', value: reason, inline: false },
                        { name: 'Warning Count', value: `${warningCount}/3`, inline: true },
                        { name: 'Moderator', value: interaction.user.tag, inline: true }
                    )
                    .setColor(0xFFAA00)
                    .setTimestamp();

                if (warningCount >= 3) {
                    dmEmbed.addFields({
                        name: '🔇 Auto-Mute Applied',
                        value: 'You have reached 3 warnings and have been automatically muted for 1 hour.',
                        inline: false
                    });
                    dmEmbed.setColor(0xFF0000);
                } else {
                    dmEmbed.addFields({
                        name: 'ℹ️ Warning',
                        value: `You will be automatically muted for 1 hour if you receive ${3 - warningCount} more warning(s).`,
                        inline: false
                    });
                }

                await targetUser.send({ embeds: [dmEmbed] });
            } catch (error) {
                logger.warn(`Could not DM user ${targetUser.tag} about warning`);
            }

            // Update activity for shift tracking
            if (interaction.client.shiftManager) {
                interaction.client.shiftManager.updateActivity(interaction.user.id);
            }

        } catch (error) {
            logger.error('Error in warn command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Warning Failed')
                .setDescription('An error occurred while issuing the warning.')
                .setColor(0xFF0000)
                .setTimestamp();
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};