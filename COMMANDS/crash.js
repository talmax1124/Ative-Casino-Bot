/**
 * Crash game command
 * Starts or joins a Crash betting round and wires button/modal interactions
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
// sessionManager removed (Firebase dependency) - using mock implementation
const sessionManager = {
    getAllActiveSessions: () => [],
    getSessionStats: () => ({ active: 0, total: 0 }),
    getActiveSessionCount: () => 0,
    getUserSessions: (userId) => [],
    getSession: (sessionId) => null,
    endSession: async (sessionId) => ({ success: true }),
    cancelSession: async (sessionId, reason) => ({ success: true }),
    cancelUserSessions: async (userId, reason) => ({ success: true }),
    createSession: async (sessionConfig) => {
        try {
            const sessionId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            return {
                success: true, 
                sessionId,
                session: {
                    ...sessionConfig,
                    sessionId,
                    createdAt: Date.now(),
                    state: 'active'
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message || 'Failed to create mock session'
            };
        }
    },
    forceCleanup: async () => ({ success: true })
};
const SMGameType = { CRASH: 'crash' };
const GameSessionIntegrator = require('../UTILS/gameSessionIntegrator');
const sessionGuard = require('../UTILS/sessionGuard');
const logger = require('../UTILS/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crash')
    .setDescription('Start or join a Crash round — bet and cash out before it crashes!'),

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
        betAmount: 0, // No initial bet required
        timeout: 120000, // 2 minutes
        metadata: {
          gamePhase: 'joining',
          betPlaced: false,
          initialBet: 0
        },
        interaction
      });

      if (!sessionResult.success) {
        throw new Error(`Session creation failed: ${sessionResult.error}`);
      }

      const sessionId = sessionResult.sessionId;

      // Pass session info to crash game handler without initial bet
      const { handleGameExecution } = require('../GAMES/crash');
      await handleGameExecution(interaction, interaction.client, sessionId, {
        initialBet: 0,
        userId: userId,
        username: username
      });

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

