/**
 * Stop Crash command for developers
 * Allows developers to stop active crash games
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const logger = require('../UTILS/logger');

// Developer user ID from environment or hardcoded
const DEVELOPER_USER_ID = process.env.DEVELOPER_USER_ID || '466050111680544798';

// Helper function to check developer permissions
function isDeveloper(userId) {
    return userId === DEVELOPER_USER_ID;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stopcrash')
        .setDescription('Stop active crash games (Developer only)')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to stop crash game in (optional - shows list if not provided)')
                .setRequired(false)
        ),

    async execute(interaction) {
        if (!isDeveloper(interaction.user.id)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Permission Denied')
                .setDescription('This command is restricted to the developer.')
                .setColor(0xFF0000);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const targetChannel = interaction.options.getChannel('channel');
        const { getAllActiveCrashGames, stopCrashGame } = require('../GAMES/crash');
        const activeGames = getAllActiveCrashGames();

        if (activeGames.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('🚀 No Active Crash Games')
                .setDescription('No crash games are currently running.')
                .setColor(0xFFFF00);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (targetChannel) {
            // Stop specific channel's crash game
            const result = await stopCrashGame(interaction.guildId, targetChannel.id);
            
            if (!result.success) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ No Active Game')
                    .setDescription(`No crash game found in ${targetChannel}.`)
                    .setColor(0xFF0000);
                
                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            const embed = new EmbedBuilder()
                .setTitle('🛑 Crash Game Stopped')
                .setDescription(result.message)
                .setColor(0x00FF00)
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            
            logger.info(`Developer ${interaction.user.tag} stopped crash game in channel ${targetChannel.id}`);
            
        } else {
            // Show list of active crash games for selection
            if (activeGames.length > 25) {
                const embed = new EmbedBuilder()
                    .setTitle('⚠️ Too Many Active Games')
                    .setDescription(`There are ${activeGames.length} active crash games. Please specify a channel directly.`)
                    .setColor(0xFFFF00);
                
                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            const options = [];
            for (const game of activeGames) {
                const channel = await interaction.client.channels.fetch(game.channelId).catch(() => null);
                const channelName = channel ? `#${channel.name}` : `Channel ${game.channelId}`;
                
                options.push({
                    label: `${channelName} (${game.playersCount} players)`,
                    description: `${game.state.toUpperCase()} - Stop crash game in ${channelName}`,
                    value: game.regKey
                });
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('stop_crash_select')
                .setPlaceholder('Select a crash game to stop')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const embed = new EmbedBuilder()
                .setTitle('🚀 Active Crash Games')
                .setDescription(`Found ${activeGames.length} active crash game(s). Select one to stop:`)
                .setColor(0x0099FF);

            await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
        }
    },

    // Select menu handler
    async handleSelectMenu(interaction) {
        if (!isDeveloper(interaction.user.id)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Permission Denied')
                .setDescription('This action is restricted to the developer.')
                .setColor(0xFF0000);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const regKey = interaction.values[0];
        const [guildId, channelId] = regKey.split(':');
        const { stopCrashGame } = require('../GAMES/crash');
        
        const result = await stopCrashGame(guildId, channelId);

        if (!result.success) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Game Not Found')
                .setDescription('The selected crash game is no longer active.')
                .setColor(0xFF0000);
            
            return await interaction.update({ embeds: [embed], components: [] });
        }

        const embed = new EmbedBuilder()
            .setTitle('🛑 Crash Game Stopped')
            .setDescription(result.message)
            .setColor(0x00FF00)
            .setTimestamp();
        
        await interaction.update({ embeds: [embed], components: [] });
        
        logger.info(`Developer ${interaction.user.tag} stopped crash game in channel ${channelId}`);
    }
};