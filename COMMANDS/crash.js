/**
 * Crash game command
 * Starts or joins a Crash betting round and wires button/modal interactions
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { sendLogMessage } = require('../UTILS/common');
// Using real GameSessionIntegrator for session management
const sessionManager = require('../UTILS/sessionManager');
const { SessionState } = sessionManager;
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
      logger.debug(`Crash execute called by ${username} (${userId}) in guild ${guildId}`);

      // Check if user can create session
      const canCreate = await sessionManager.canCreateSession(userId, guildId, GameType.CRASH);
      if (!canCreate.allowed) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Session Error')
          .setDescription(canCreate.message)
          .setColor(0xFF0000);
        return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      // Quick balance check to provide better error messages
      const dbManager = require('../UTILS/database');
      const userBalance = await dbManager.getUserBalance(userId, guildId);
      if (userBalance.wallet <= 0) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Insufficient Funds')
          .setDescription(`You need at least 10 coins to play Crash, but you have ${userBalance.wallet} coins.\n\nUse \`/work\` or other commands to earn more coins!`)
          .setColor(0xFF0000);
        return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      // Create session for crash game
      const sessionResult = await sessionManager.createSession({
        userId,
        guildId,
        channelId: interaction.channelId,
        gameType: GameType.CRASH,
        betAmount: 0, // No initial bet required
        timeout: 120000, // 2 minutes
        metadata: {
          gamePhase: 'joining',
          betPlaced: false,
          initialBet: 0
        }
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
      try {
        await sendLogMessage(
          interaction.client,
          'error',
          `Crash error for ${interaction.user.tag} (${userId}) — ${error.message}`,
          userId,
          guildId
        );
      } catch (_) {}
      
      // Enhanced session cleanup with better error handling
      try {
        await sessionManager.forceCleanupUser(userId, guildId, 'Crash game initialization error');
        
        logger.info(`Forced cleanup completed for user ${userId} after crash command failure`);
      } catch (cleanupError) {
        logger.error(`Failed to cleanup after crash command error: ${cleanupError.message}`);
      }
      
      const embed = new EmbedBuilder()
        .setTitle('❌ Crash Error')
        .setDescription('Failed to start the Crash game. Your session has been reset - please try again.')
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
