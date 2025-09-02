/**
 * RELEASE Command - Manual Session Cleanup for ATIVE Utility Bot
 * Admin/Mod only - Release users from stuck game sessions
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('release')
        .setDescription('Release a user from stuck game sessions')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to release from game sessions')
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for releasing the user')
                .setRequired(false))
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
                
                return await interaction.reply({ embeds: [embed], flags: InteractionResponseFlags.Ephemeral });
            }

            await interaction.deferReply({ flags: InteractionResponseFlags.Ephemeral });

            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'Manual session release';

            // This would integrate with the main casino bot's session system
            // For now, we'll create a placeholder response
            const embed = new EmbedBuilder()
                .setTitle('🎮 Session Release')
                .setDescription(`Attempting to release ${targetUser} from any active game sessions...`)
                .addFields(
                    { name: 'Target User', value: targetUser.toString(), inline: true },
                    { name: 'Moderator', value: interaction.user.toString(), inline: true },
                    { name: 'Reason', value: reason, inline: true }
                )
                .setColor(0x0099FF)
                .setTimestamp();

            // Log the action
            logger.moderation('release', interaction.user.tag, targetUser.tag, reason);

            // Note: This would need to integrate with the main casino bot's session management
            embed.addFields({
                name: 'Status',
                value: '⚠️ **Integration Required**\nThis command needs to be connected to the main casino bot\'s session management system.',
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });

            // Update activity for shift tracking
            if (interaction.client.shiftManager) {
                interaction.client.shiftManager.updateActivity(interaction.user.id);
            }

        } catch (error) {
            logger.error('Error in release command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing the release command.')
                .setColor(0xFF0000)
                .setTimestamp();
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: InteractionResponseFlags.Ephemeral });
            }
        }
    }
};