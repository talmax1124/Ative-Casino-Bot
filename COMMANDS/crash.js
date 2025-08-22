/**
 * Crash multiplier game command for the casino bot
 * Players bet on a rising multiplier that can crash at any time
 */

const { SlashCommandBuilder } = require('discord.js');
const crashGame = require('../GAMES/crash');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('crash')
        .setDescription('Start a new Crash multiplier game with your bet')
        .addIntegerOption(option => option
            .setName('minbet')
            .setDescription('Your bet amount to start the game')
            .setRequired(true)
            .setMinValue(10)),

    async execute(interaction) {
        await crashGame.handleGameExecution(interaction, interaction.client);
    }
};