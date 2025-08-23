/**
 * Bingo help command for ATIVE Casino Bot
 * Shows detailed information about the BINGO game
 */

const { SlashCommandBuilder } = require('discord.js');
const { BingoGameSession } = require('../GAMES/bingo');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bingohelp')
        .setDescription('🎯 Learn how to play multiplayer BINGO'),

    async execute(interaction) {
        const helpEmbed = BingoGameSession.getHelpEmbed();
        await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    }
};