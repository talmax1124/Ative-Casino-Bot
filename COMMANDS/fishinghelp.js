/**
 * Fishing help command for ATIVE Casino Bot
 * Shows detailed information about the fishing game
 */

const { SlashCommandBuilder } = require('discord.js');
const { FishingGame } = require('../GAMES/fishing');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fishinghelp')
        .setDescription('🎣 Show detailed fishing game help and information'),

    async execute(interaction) {
        const helpEmbed = FishingGame.getHelpEmbed();
        await interaction.reply({ embeds: [helpEmbed] });
    }
};