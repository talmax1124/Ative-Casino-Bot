/**
 * Heist Game Command - Test heist mini-games
 * Allows testing individual heist games for development purposes
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fmt } = require('../UTILS/common');
const logger = require('../UTILS/logger');

// Available heist games
const HEIST_GAMES = {
    'memory': {
        name: 'Memory',
        description: 'Pattern memorization game - remember and repeat the sequence',
        file: '../heists/Games/Memory.js'
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('heist-game')
        .setDescription('🎯 Test heist mini-games for development')
        .addStringOption(option =>
            option.setName('game')
                .setDescription('Which heist game to play')
                .setRequired(true)
                .addChoices(
                    { name: 'Memory - Pattern memorization', value: 'memory' }
                )
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const gameType = interaction.options.getString('game');

        try {
            // Defer reply immediately
            await interaction.deferReply();

            // Check if game exists
            const gameConfig = HEIST_GAMES[gameType];
            if (!gameConfig) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Invalid Game')
                    .setDescription('That heist game doesn\'t exist.')
                    .setColor(0xFF0000);
                return await interaction.editReply({ embeds: [embed] });
            }

            logger.info(`Heist game '${gameType}' started by ${username} (${userId})`);

            // Load and execute the specific game
            try {
                const GameClass = require(gameConfig.file);
                const game = new GameClass({
                    userId,
                    username,
                    channelId: interaction.channelId,
                    guildId: interaction.guildId
                });

                await game.start(interaction);

            } catch (gameError) {
                logger.error(`Failed to load heist game '${gameType}': ${gameError.message}`);
                
                const embed = new EmbedBuilder()
                    .setTitle('❌ Game Error')
                    .setDescription(`Failed to start ${gameConfig.name}. The game may not be implemented yet.`)
                    .setColor(0xFF0000);
                
                return await interaction.editReply({ embeds: [embed] });
            }

        } catch (error) {
            logger.error(`Heist game command failed: ${error?.stack || error}`);
            
            const embed = new EmbedBuilder()
                .setTitle('❌ Command Error')
                .setDescription('Failed to execute heist game command. Please try again.')
                .setColor(0xFF0000);

            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ embeds: [embed] });
                } else {
                    await interaction.reply({ embeds: [embed] });
                }
            } catch (replyError) {
                logger.error(`Failed to send error reply: ${replyError.message}`);
            }
        }
    }
};