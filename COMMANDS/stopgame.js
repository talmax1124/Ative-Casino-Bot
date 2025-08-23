/**
 * Stop Game command for developers
 * Allows developers to stop active games for users
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const logger = require('../UTILS/logger');
const { getAllActiveGames, clearActiveGame } = require('../UTILS/common');

// Developer user ID from environment or hardcoded
const DEVELOPER_USER_ID = process.env.DEVELOPER_USER_ID || '466050111680544798';

// Helper function to check developer permissions
function isDeveloper(userId) {
    return userId === DEVELOPER_USER_ID;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stopgame')
        .setDescription('Stop active game for a user (Developer only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to stop game for (optional - shows list if not provided)')
                .setRequired(false)
        ),

    async execute(interaction) {
        // Check developer permissions
        if (!isDeveloper(interaction.user.id)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Access Denied')
                .setDescription('This command is restricted to developers only.')
                .setColor(0xFF0000);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const targetUser = interaction.options.getUser('user');
        const activeGames = getAllActiveGames();

        if (activeGames.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('🎮 No Active Games')
                .setDescription('There are currently no active games to stop.')
                .setColor(0x0099FF);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (targetUser) {
            // Stop specific user's game
            const userActiveGame = activeGames.find(game => game.userId === targetUser.id);
            
            if (!userActiveGame) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ No Active Game')
                    .setDescription(`${targetUser.displayName} does not have any active games.`)
                    .setColor(0xFF0000);
                
                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            // Handle crash games specifically
            if (userActiveGame.gameType === 'crash') {
                try {
                    const { stopCrashGame } = require('../GAMES/crash');
                    await stopCrashGame(interaction.guildId, userActiveGame.channelId);
                } catch (error) {
                    logger.warn(`Failed to stop crash game: ${error.message}`);
                }
            }

            // Try to stop wordchain instance if applicable
            try {
                if (userActiveGame.gameType === 'wordchain') {
                    const wc = require('./wordchain');
                    if (wc && typeof wc.forceStop === 'function') {
                        await wc.forceStop(targetUser.id);
                    }
                }
            } catch (e) {
                logger.warn(`Failed to force stop wordchain: ${e.message}`);
            }

            clearActiveGame(targetUser.id);
            
            const embed = new EmbedBuilder()
                .setTitle('🛑 Game Stopped')
                .setDescription(`Successfully stopped ${userActiveGame.gameType} game for ${targetUser.displayName}.`)
                .setColor(0x00FF00)
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            
            logger.info(`Developer ${interaction.user.tag} stopped ${userActiveGame.gameType} game for user ${targetUser.id}`);
            
        } else {
            // Show list of active games for selection
            const options = [];
            
            for (const game of activeGames.slice(0, 25)) { // Discord limit
                try {
                    const user = await interaction.client.users.fetch(game.userId);
                    const channelInfo = game.channelId ? ` in <#${game.channelId}>` : '';
                    options.push({
                        label: `${user.displayName} - ${game.gameType}`,
                        description: `Stop ${game.gameType} game for ${user.displayName}${channelInfo}`,
                        value: `${game.userId}:${game.gameType}:${game.channelId || ''}`
                    });
                } catch (error) {
                    // User not found, use ID instead
                    const channelInfo = game.channelId ? ` in <#${game.channelId}>` : '';
                    options.push({
                        label: `User ${game.userId} - ${game.gameType}`,
                        description: `Stop ${game.gameType} game for user${channelInfo}`,
                        value: `${game.userId}:${game.gameType}:${game.channelId || ''}`
                    });
                }
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('stop_game_select')
                .setPlaceholder('Select a user to stop their game')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const embed = new EmbedBuilder()
                .setTitle('🎮 Active Games')
                .setDescription(`Found ${activeGames.length} active game(s). Select a user to stop their game:`)
                .setColor(0x0099FF);

            await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
        }
    },

    // Select menu handler
    async handleSelectMenu(interaction) {
        if (!isDeveloper(interaction.user.id)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Access Denied')
                .setDescription('This command is restricted to developers only.')
                .setColor(0xFF0000);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const [userId, gameType, channelId] = interaction.values[0].split(':');
        const activeGames = getAllActiveGames();
        const userGame = activeGames.find(game => game.userId === userId);

        if (!userGame) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Game Not Found')
                .setDescription('The selected user no longer has an active game.')
                .setColor(0xFF0000);
            
            return await interaction.update({ embeds: [embed], components: [] });
        }

        // Handle crash games specifically
        if (gameType === 'crash' && channelId) {
            try {
                const { stopCrashGame } = require('../GAMES/crash');
                await stopCrashGame(interaction.guildId, channelId);
            } catch (error) {
                logger.warn(`Failed to stop crash game: ${error.message}`);
            }
        }

        // Try to stop wordchain instance if applicable
        try {
            if (gameType === 'wordchain') {
                const wc = require('./wordchain');
                if (wc && typeof wc.forceStop === 'function') {
                    await wc.forceStop(userId);
                }
            }
        } catch (e) {
            logger.warn(`Failed to force stop wordchain: ${e.message}`);
        }

        clearActiveGame(userId);

        let userName = `User ${userId}`;
        try {
            const user = await interaction.client.users.fetch(userId);
            userName = user.displayName;
        } catch (error) {
            // Use fallback name if user not found
        }

        const embed = new EmbedBuilder()
            .setTitle('🛑 Game Stopped')
            .setDescription(`Successfully stopped ${gameType} game for ${userName}.`)
            .setColor(0x00FF00)
            .setTimestamp();
        
        await interaction.update({ embeds: [embed], components: [] });
        
        logger.info(`Developer ${interaction.user.tag} stopped ${gameType} game for user ${userId}`);
    }
};
