const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const logger = require('../UTILS/logger');
const dbManager = require('../UTILS/database');
const { hasAdminRole, hasModRole, getAllActiveGames, clearActiveGame, getActiveGame } = require('../UTILS/common');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('release')
        .setDescription('Release users from the active game session lock (admin/mod)')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('User to release from session lock')
                .setRequired(false)
        )
        .addBooleanOption(opt =>
            opt.setName('all')
                .setDescription('Release everyone from session locks')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            // Permission check: admin or mod
            const guildId = interaction.guildId;
            const isAdmin = await hasAdminRole(interaction.member, guildId);
            const isMod = await hasModRole(interaction.member, guildId);
            if (!isAdmin && !isMod) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Access Denied')
                    .setDescription('You must be an admin or moderator to use /release.')
                    .setColor(0xFF0000);
                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            const targetUser = interaction.options.getUser('user');
            const releaseAll = interaction.options.getBoolean('all') || false;

            if (releaseAll) {
                // Clear in-memory registry first
                const active = getAllActiveGames();
                const clearedCount = clearActiveGame(null, true);

                // Also clear persistent DB locks for those known users
                let dbCleared = 0;
                for (const g of active) {
                    try {
                        const ok = await dbManager.setUserBalance(g.userId, interaction.guildId, null, null, { game_active: false });
                        if (ok) dbCleared++;
                    } catch (_) { }
                }

                const embed = new EmbedBuilder()
                    .setTitle('🔓 Sessions Released')
                    .setDescription(`Cleared session locks for ${clearedCount} user(s).`)
                    .addFields({ name: 'Database Flags Reset', value: `${dbCleared} user(s)`, inline: true })
                    .setColor(0x2ECC71)
                    .setTimestamp();
                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            if (targetUser) {
                const hadGame = getActiveGame(targetUser.id);
                const success = clearActiveGame(targetUser.id);
                // Also clear DB game_active flag for commands that use it
                let dbReset = false;
                try {
                    dbReset = await dbManager.setUserBalance(targetUser.id, interaction.guildId, null, null, { game_active: false });
                } catch (_) { }

                const embed = new EmbedBuilder()
                    .setTitle(success ? '🔓 User Released' : 'ℹ️ No Session Found')
                    .setDescription(success
                        ? `Released ${targetUser} from their '${hadGame || 'unknown'}' session lock.`
                        : `${targetUser} did not have an active session lock.`)
                    .setColor(success ? 0x2ECC71 : 0x3498DB)
                    .setTimestamp();

                if (dbReset) {
                    embed.addFields({ name: 'Database Flag', value: 'game_active cleared', inline: true });
                }

                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            // No args: show summary and guidance
            const active = getAllActiveGames();
            const embed = new EmbedBuilder()
                .setTitle('🎮 Active Session Locks')
                .setDescription(active.length
                    ? `There are ${active.length} user(s) with session locks.`
                    : 'No users currently have session locks.')
                .setColor(0x0099FF)
                .setTimestamp();

            if (active.length) {
                const preview = active.slice(0, 10).map(g => `• <@${g.userId}> — ${g.gameType}`).join('\n');
                embed.addFields({ name: 'Preview', value: preview, inline: false });
                if (active.length > 10) embed.setFooter({ text: `+${active.length - 10} more...` });
            }

            embed.addFields({ name: 'Usage', value: 'Use /release user:@User or /release all:true', inline: false });

            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        } catch (error) {
            logger.error(`release command error: ${error.stack || error}`);
            try {
                await interaction.reply({ content: '❌ Failed to execute /release.', flags: MessageFlags.Ephemeral });
            } catch { }
        }
    }
};
