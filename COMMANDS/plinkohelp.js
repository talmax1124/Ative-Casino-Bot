/**
 * Plinko help command for ATIVE Casino Bot
 * Shows detailed information about the Plinko game
 */

const { SlashCommandBuilder } = require('discord.js');
const { PlinkoGameSession } = require('../GAMES/plinko');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('plinkohelp')
        .setDescription('🎯 Show detailed Plinko game help and information'),

    async execute(interaction) {
        const helpEmbed = PlinkoGameSession.getHelpEmbed();
        await interaction.reply({ embeds: [helpEmbed] });
    }
};