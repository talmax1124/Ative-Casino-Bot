/**
 * Crash game command
 * Starts or joins a Crash betting round and wires button/modal interactions
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { sendLogMessage, parseAmount, resolveAmount } = require('../UTILS/common');
const dbManager = require('../UTILS/database');
// Using real GameSessionIntegrator for session management
const sessionManager = require('../UTILS/sessionManager');
const { SessionState } = sessionManager;
const logger = require('../UTILS/logger');
const allInManager = require('../UTILS/allInManager');

// BULLETPROOF ECONOMY AND SECURITY INTEGRATIONS
const transparentPayoutManager = require('../UTILS/transparentPayoutManager');
const securityLogger = require('../UTILS/securityLogger');
const tuningManager = require('../UTILS/tuningManager');
const sessionGuard = require('../UTILS/sessionGuard');
const BulletproofEconomyController = require('../BULLETPROOF_ECONOMY/BulletproofEconomyController');

// Initialize bulletproof economy
let bulletproofEconomy = null;
try {
    bulletproofEconomy = new BulletproofEconomyController();
    bulletproofEconomy.initialize().catch(err => {
        logger.warn(`Crash: Bulletproof Economy initialization failed: ${err.message}`);
    });
} catch (e) {
    logger.warn(`Crash: Bulletproof Economy not available: ${e.message}`);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crash')
    .setDescription('Start or join a Crash round — bet and cash out before it crashes!')
    .addStringOption(option =>
      option.setName('bet')
        .setDescription('Your bet amount (e.g., 1000, 1k, 50%, all)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Risk mode (higher modes have higher minimum bets and max multipliers)')
        .setRequired(false)
        .addChoices(
          { name: '🛡️ Safe (Min: $500, Max: 1.5x)', value: 'safe' },
          { name: '⚖️ Balanced (Min: $1K, Max: 2.0x)', value: 'balanced' },
          { name: '⚡ Risky (Min: $2.5K, Max: 2.0x)', value: 'risky' },
          { name: '🔥 Extreme (Min: $5K, Max: 2.0x)', value: 'extreme' }
        )
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const username = interaction.user.displayName;
    const guildId = interaction.guildId;
    const selectedMode = interaction.options.getString('mode') || 'balanced';
    const betString = interaction.options.getString('bet');

    try {
      await interaction.deferReply();
      
      logger.debug(`Crash execute called by ${username} (${userId}) in guild ${guildId} with bet ${betString} and mode ${selectedMode}`);

      // Import crash modes to check minimum bets
      const { CRASH_MODES } = require('../GAMES/crash');
      const modeConfig = CRASH_MODES[selectedMode] || CRASH_MODES.balanced;

      // Get user balance first
      const userBalance = await dbManager.getUserBalance(userId, guildId);
      if (!userBalance) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Database Error')
          .setDescription('Unable to fetch your balance. Please try again.')
          .setColor(0xFF0000);
        return await interaction.editReply({ embeds: [embed] });
      }

      // Parse and validate bet amount
      const parsedAmount = parseAmount(betString);
      if (parsedAmount === null) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Invalid Bet Amount')
          .setDescription(`Invalid bet format: \`${betString}\`\n\nValid formats: 1000, 1k, 50%, all`)
          .setColor(0xFF0000);
        return await interaction.editReply({ embeds: [embed] });
      }

      // Resolve the actual bet amount
      const betAmount = await resolveAmount(parsedAmount, userBalance.wallet);

        // ENHANCED SESSION SECURITY CHECK
        const sessionCheck = await gameIntegrator.checkGameSession(userId, guildId, 'crash', betAmount);
        if (!sessionCheck.allowed) {
            return await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('❌ Game Access Denied')
                    .setDescription(sessionCheck.message)
                    .setTimestamp()],
                ephemeral: true
            });
        }

      if (betAmount === null || betAmount <= 0) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Invalid Bet Amount')
          .setDescription('Bet amount must be positive.')
          .setColor(0xFF0000);
        return await interaction.editReply({ embeds: [embed] });
      }

      // Check if user has enough balance
      if (betAmount > userBalance.wallet) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Insufficient Funds')
          .setDescription(`You need ${betAmount} coins but only have ${userBalance.wallet} coins.\n\nUse \`/work\` or other commands to earn more coins!`)
          .setColor(0xFF0000);
        return await interaction.editReply({ embeds: [embed] });
      }

      // Check minimum bet for selected mode
      if (betAmount < modeConfig.minBet) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Bet Too Low')
          .setDescription(`Minimum bet for ${modeConfig.name} mode is ${modeConfig.minBet} coins.\n\nYour bet: ${betAmount} coins`)
          .setColor(0xFF0000);
        return await interaction.editReply({ embeds: [embed] });
      }

      // Check maintenance mode first
      const maintenanceGuard = require('../UTILS/maintenanceGuard');
      const maintenanceCheck = await maintenanceGuard.check(guildId, 'crash');
      if (!maintenanceCheck.allowed) {
        return await interaction.editReply({ embeds: [maintenanceCheck.embed] });
      }

      // Check if user can create session (via sessionGuard)
      const sessionGuard = require('../UTILS/sessionGuard');
      const check = await sessionGuard.check(userId, guildId, GameType.CRASH, interaction.client);
      if (!check.allowed) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Session Error')
          .setDescription(check.message)
          .setColor(0xFF0000);
        return await interaction.editReply({ embeds: [embed] });
      }

      // Start crash game with selected mode - don't pre-deduct money
      const { startCrashGame } = require('../GAMES/crash');
// UNIVERSAL GAME INTEGRATION - ALL SYSTEMS
const UniversalGameIntegrator = require('../UTILS/UniversalGameIntegrator');
const securityLogger = require('../UTILS/securityLogger');
const sessionGuard = require('../UTILS/sessionGuard');
const transparentPayoutManager = require('../UTILS/transparentPayoutManager');
const tuningManager = require('../UTILS/tuningManager');
const { secureRandomFloat, secureRandomInt, secureRandomBytes } = require('../UTILS/rng');

// Initialize game integrator
const gameIntegrator = new UniversalGameIntegrator('crash');

      await startCrashGame(interaction, selectedMode, 0); // Pass 0 to prevent auto-betting

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
