/**
 * RPS help command for ATIVE Casino Bot
 * Shows detailed information about the Rock Paper Scissors game
 */

const { SlashCommandBuilder } = require('discord.js');
const { RPSGameSession } = require('../GAMES/rps');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rpshelp')
        .setDescription('⚔️ Show detailed Rock Paper Scissors game help and information'),

    async execute(interaction) {
        const helpEmbed = RPSGameSession.getHelpEmbed();
        await interaction.reply({ embeds: [helpEmbed] });
    }
};