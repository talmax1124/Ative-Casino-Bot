/**
 * Crash game command
 * Starts or joins a Crash betting round and wires button/modal interactions
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { sessionManager, GameType: SMGameType } = require('../UTILS/sessionManager');
const GameSessionIntegrator = require('../UTILS/gameSessionIntegrator');
const sessionGuard = require('../UTILS/sessionGuard');
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
    const userId = interaction.user.id;
    const username = interaction.user.displayName;
    const guildId = interaction.guildId;

    try {
      // Validate session before proceeding
      const sessionValidation = await GameSessionIntegrator.validateGameSession(userId, SMGameType.CRASH, guildId);
      if (!sessionValidation.valid) {
        const errorEmbed = GameSessionIntegrator.createValidationErrorEmbed(username, 'crash', sessionValidation);
        return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }

      // Create session for crash game with enhanced protection
      const sessionResult = await sessionGuard.createSafeSession({
        userId,
        guildId,
        channelId: interaction.channelId,
        gameType: SMGameType.CRASH,
        betAmount: 0, // Will be set when bet is placed
        timeout: 120000, // 2 minutes
        metadata: {
          gamePhase: 'joining',
          betPlaced: false
        },
        interaction
      });

      if (!sessionResult.success) {
        throw new Error(`Session creation failed: ${sessionResult.error}`);
      }

      const sessionId = sessionResult.sessionId;

      // Pass session info to crash game handler
      const { handleGameExecution } = require('../GAMES/crash');
      await handleGameExecution(interaction, interaction.client, sessionId);

    } catch (error) {
      logger.error(`crash command failed: ${error?.stack || error}`);
      
      // Handle game error with session cleanup
      await GameSessionIntegrator.handleGameError(userId, SMGameType.CRASH, 0, guildId, 'Crash game initialization error');
      
      const embed = new EmbedBuilder()
        .setTitle('❌ Crash Error')
        .setDescription('Failed to start or join the Crash game. Please try again.')
        .setColor(0xFF0000);

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        logger.error(`Failed to send crash error reply: ${replyError.message}`);
      }
    }
  }
};

