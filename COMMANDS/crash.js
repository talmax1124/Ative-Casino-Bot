/**
 * Crash game command
 * Starts or joins a Crash betting round and wires button/modal interactions
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const logger = require('../UTILS/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crash')
    .setDescription('Start or join a Crash round — bet and cash out before it crashes!')
    .addStringOption(opt =>
      opt.setName('minbet')
        .setDescription('Your bet amount (e.g., 1000, 5k, 2m)')
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      const { handleGameExecution } = require('../GAMES/crash');
      await handleGameExecution(interaction, interaction.client);
    } catch (error) {
      logger.error(`crash command failed: ${error?.stack || error}`);
      const embed = new EmbedBuilder()
        .setTitle('❌ Crash Error')
        .setDescription('Failed to start or join the Crash game.')
        .setColor(0xFF0000);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
    }
  }
};

