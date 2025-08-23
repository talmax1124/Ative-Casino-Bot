/**
 * UNO help command for ATIVE Casino Bot
 * Shows detailed information about the UNO game
 */

const { SlashCommandBuilder } = require('discord.js');
const { UnoGameSession } = require('../GAMES/uno');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unohelp')
        .setDescription('🎴 Learn how to play UNO card game'),

    async execute(interaction) {
        const helpEmbed = UnoGameSession.getHelpEmbed();
        await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    }
};