/**
 * OPTIMIZED Crash Game - Lightweight, Reliable Implementation
 * Focuses on stability and performance over complex graphics
 * Uses text-based visualization and minimal Discord API calls
 */

const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require('discord.js');

const dbManager = require('../UTILS/database');
const { fmt, parseAmount } = require('../UTILS/common');
const GameSessionIntegrator = require('../UTILS/gameSessionIntegrator');
const logger = require('../UTILS/logger');

// Optimized configuration - much more conservative
const CRASH_CONFIG = {
  min_bet: 10,
  max_bet: 100000,
  update_interval: 1000,      // Update every 1 second (was 500ms)
  max_multiplier: 50.0,
  house_edge: 0.03,
  max_duration: 30,           // Max 30 seconds per game
  betting_duration: 15        // 15 seconds to place bets
};

// Simple crash point generation
function generateCrashPoint() {
  const rand = Math.random();
  
  // Simple probability curve - no complex math
  if (rand < 0.33) return 1.0 + (Math.random() * 1.5); // 1.0x - 2.5x (33%)
  if (rand < 0.66) return 2.5 + (Math.random() * 2.5); // 2.5x - 5.0x (33%)
  if (rand < 0.90) return 5.0 + (Math.random() * 10);  // 5.0x - 15.0x (24%)
  return 15.0 + (Math.random() * 35);                   // 15.0x - 50.0x (10%)
}

// Simple multiplier calculation
function calculateMultiplier(startTime, crashPoint) {
  const elapsed = (Date.now() - startTime) / 1000;
  const progress = elapsed / 10; // 10 seconds to reach reasonable multipliers
  const multiplier = 1.0 + (progress * 2) + (Math.pow(progress, 1.8) * 3);
  return Math.min(multiplier, crashPoint);
}

// Lightweight game state management
class OptimizedCrashGame {
  constructor(channelId, guildId) {
    this.channelId = channelId;
    this.guildId = guildId;
    this.players = new Map();
    this.state = 'betting'; // betting, running, crashed, finished
    this.startTime = null;
    this.crashPoint = generateCrashPoint();
    this.currentMultiplier = 1.0;
    this.gameMessage = null;
    this.updateInterval = null;
    this.bettingTimeout = null;
    this.sessionId = null;
    
    logger.info(`Created optimized crash game for channel ${channelId} with crash point ${this.crashPoint.toFixed(2)}x`);
  }

  async addPlayer(userId, username, betAmount) {
    if (this.state !== 'betting') return false;
    
    // Don't add player if they're already in the game
    if (this.players.has(userId)) return false;
    
    // Deduct bet upfront like other casino games
    try {
      const userBalance = await dbManager.getUserBalance(userId, this.guildId);
      if (userBalance.wallet < betAmount) {
        return false; // Insufficient funds
      }
      
      // Deduct the bet amount
      const success = await dbManager.setUserBalance(userId, this.guildId, userBalance.wallet - betAmount, userBalance.bank);
      if (!success) {
        return false; // Failed to deduct
      }
    } catch (error) {
      logger.error(`Failed to deduct bet for crash player ${userId}: ${error.message}`);
      return false;
    }
    
    this.players.set(userId, {
      username,
      bet: betAmount,
      cashedOut: false,
      cashOutMultiplier: 0,
      winnings: 0
    });
    
    return true;
  }

  cashOut(userId) {
    if (this.state !== 'running') return null;
    
    const player = this.players.get(userId);
    if (!player || player.cashedOut) return null;
    
    player.cashedOut = true;
    player.cashOutMultiplier = this.currentMultiplier;
    player.winnings = Math.floor(player.bet * this.currentMultiplier);
    
    return player.winnings;
  }

  // Create simple text-based visualization (no Canvas/images needed)
  createVisualization() {
    const width = 30;
    const lines = [];
    
    // Header
    lines.push(`📈 CRASH GAME - ${this.currentMultiplier.toFixed(2)}x`);
    lines.push('```');
    
    // Simple ASCII graph
    const progress = Math.min((this.currentMultiplier - 1) / 9, 1); // Scale for 1x-10x
    const barLength = Math.floor(progress * width);
    const bar = '█'.repeat(barLength) + '░'.repeat(width - barLength);
    
    lines.push(`Multiplier: [${bar}] ${this.currentMultiplier.toFixed(2)}x`);
    lines.push(`Crash Point: ${this.state === 'crashed' ? this.crashPoint.toFixed(2) + 'x' : '???'}x`);
    lines.push('```');
    
    // Player status
    const activePlayers = Array.from(this.players.values()).filter(p => !p.cashedOut).length;
    const cashedOutPlayers = Array.from(this.players.values()).filter(p => p.cashedOut).length;
    
    lines.push(`👥 Players: ${activePlayers} active, ${cashedOutPlayers} cashed out`);
    
    return lines.join('\n');
  }

  createEmbed() {
    let title, color, description;
    
    switch (this.state) {
      case 'betting':
        title = '💰 Crash - Betting Phase';
        color = 0x00FF00;
        description = 'Place your bets! Game starts soon...';
        break;
      case 'running':
        title = `🚀 Crash - ${this.currentMultiplier.toFixed(2)}x`;
        color = 0xFFAA00;
        description = this.createVisualization();
        break;
      case 'crashed':
        title = `💥 CRASHED at ${this.crashPoint.toFixed(2)}x!`;
        color = 0xFF0000;
        description = this.createVisualization();
        break;
      default:
        title = '🎮 Crash Game';
        color = 0x999999;
        description = 'Game ended';
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp();

    // Add player list
    if (this.players.size > 0) {
      const playerList = Array.from(this.players.entries())
        .map(([userId, player]) => {
          const status = player.cashedOut 
            ? `✅ ${player.cashOutMultiplier.toFixed(2)}x (+${fmt(player.winnings)})`
            : (this.state === 'crashed' ? '❌ Lost' : '⏳ Active');
          return `• **${player.username}**: ${fmt(player.bet)} ${status}`;
        })
        .slice(0, 10) // Limit to 10 players for embed size
        .join('\n');

      embed.addFields([{
        name: `Players (${this.players.size})`,
        value: playerList || 'No players',
        inline: false
      }]);
    }

    return embed;
  }

  createButtons() {
    const buttons = [];
    
    if (this.state === 'betting') {
      buttons.push(
        new ButtonBuilder()
          .setCustomId('crash_join')
          .setLabel('💰 Place Bet')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('crash_start')
          .setLabel('🚀 Start Game')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(this.players.size === 0)
      );
    } else if (this.state === 'running') {
      buttons.push(
        new ButtonBuilder()
          .setCustomId('crash_cashout')
          .setLabel(`💸 Cash Out (${this.currentMultiplier.toFixed(2)}x)`)
          .setStyle(ButtonStyle.Danger)
      );
    }

    return buttons.length > 0 ? [new ActionRowBuilder().addComponents(buttons)] : [];
  }

  async startGame() {
    if (this.state !== 'betting' || this.players.size === 0) return false;
    
    this.state = 'running';
    this.startTime = Date.now();
    this.currentMultiplier = 1.0;
    
    // Clear betting timeout
    if (this.bettingTimeout) {
      clearTimeout(this.bettingTimeout);
      this.bettingTimeout = null;
    }
    
    // Start update loop (much slower and safer)
    this.updateInterval = setInterval(async () => {
      try {
        await this.updateGame();
      } catch (error) {
        logger.error(`Crash game update error: ${error.message}`);
        await this.crashGame('System error');
      }
    }, CRASH_CONFIG.update_interval);
    
    await this.updateMessage();
    return true;
  }

  async updateGame() {
    if (this.state !== 'running') return;
    
    this.currentMultiplier = calculateMultiplier(this.startTime, this.crashPoint);
    
    // Check for crash
    if (this.currentMultiplier >= this.crashPoint) {
      await this.crashGame();
      return;
    }
    
    // Safety timeout - max game duration
    const elapsed = (Date.now() - this.startTime) / 1000;
    if (elapsed > CRASH_CONFIG.max_duration) {
      await this.crashGame('Game timeout');
      return;
    }
    
    // Update message (less frequently)
    await this.updateMessage();
  }

  async crashGame(reason = 'Natural crash') {
    if (this.state === 'crashed') return;
    
    this.state = 'crashed';
    this.currentMultiplier = this.crashPoint;
    
    // Clear update interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    // Process all players - bet was already deducted, so we only add winnings back
    for (const [userId, player] of this.players.entries()) {
      try {
        if (player.cashedOut) {
          // Player cashed out: give them their winnings
          await dbManager.updateUserBalance(userId, this.guildId, player.winnings, 0);
          logger.info(`Crash payout: ${player.username} won ${fmt(player.winnings)} (cashed out at ${player.cashOutMultiplier.toFixed(2)}x)`);
        } else {
          // Player didn't cash out: they lose their bet (already deducted, no action needed)
          logger.info(`Crash loss: ${player.username} lost ${fmt(player.bet)} (didn't cash out)`);
        }
      } catch (error) {
        logger.error(`Failed to process crash payout for ${userId}: ${error.message}`);
      }
    }
    
    await this.updateMessage();
    
    // Complete session
    if (this.sessionId) {
      try {
        const winners = Array.from(this.players.values()).filter(p => p.cashedOut);
        await GameSessionIntegrator.completeGameSession(this.sessionId, {
          outcome: winners.length > 0 ? 'SOME_WINNERS' : 'ALL_LOST',
          crashPoint: this.crashPoint,
          totalPlayers: this.players.size,
          winners: winners.length,
          gameCompleted: true
        });
      } catch (error) {
        logger.error(`Failed to complete crash session: ${error.message}`);
      }
    }
    
    logger.info(`Crash game crashed at ${this.crashPoint.toFixed(2)}x (${reason})`);
  }

  async updateMessage() {
    if (!this.gameMessage) return;
    
    try {
      const embed = this.createEmbed();
      const components = this.createButtons();
      
      await this.gameMessage.edit({
        embeds: [embed],
        components
      });
    } catch (error) {
      logger.error(`Failed to update crash message: ${error.message}`);
    }
  }

  cleanup() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    if (this.bettingTimeout) {
      clearTimeout(this.bettingTimeout);
      this.bettingTimeout = null;
    }
  }
}

// Game manager
class OptimizedCrashManager {
  constructor() {
    this.games = new Map();
  }

  createGame(channelId, guildId) {
    // Clean up any existing game first
    const existing = this.games.get(channelId);
    if (existing) {
      existing.cleanup();
    }
    
    const game = new OptimizedCrashGame(channelId, guildId);
    this.games.set(channelId, game);
    return game;
  }

  getGame(channelId) {
    return this.games.get(channelId);
  }

  removeGame(channelId) {
    const game = this.games.get(channelId);
    if (game) {
      game.cleanup();
      this.games.delete(channelId);
    }
  }

  cleanup() {
    for (const [channelId, game] of this.games.entries()) {
      game.cleanup();
    }
    this.games.clear();
  }
}

const crashManager = new OptimizedCrashManager();

// Button interaction handlers
async function handleButtonInteraction(interaction, client, game) {
  const action = interaction.customId.replace('crash_', '');
  
  try {
    switch (action) {
      case 'join':
        await handleJoinGame(interaction, game);
        break;
      case 'start':
        await handleStartGame(interaction, game);
        break;
      case 'cashout':
        await handleCashOut(interaction, game);
        break;
      default:
        await interaction.reply({ content: '❌ Unknown action', flags: MessageFlags.Ephemeral });
    }
  } catch (error) {
    logger.error(`Crash button interaction error: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ An error occurred', flags: MessageFlags.Ephemeral });
    }
  }
}

async function handleJoinGame(interaction, game) {
  if (game.state !== 'betting') {
    return await interaction.reply({ content: '❌ Betting is closed!', flags: MessageFlags.Ephemeral });
  }
  
  // Show bet modal
  const modal = new ModalBuilder()
    .setCustomId('crash_bet_modal')
    .setTitle('💰 Place Your Bet');

  const betInput = new TextInputBuilder()
    .setCustomId('bet_amount')
    .setLabel('Bet Amount (10-100,000)')
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(10)
    .setRequired(true)
    .setPlaceholder('1000, 5k, etc.');

  modal.addComponents(new ActionRowBuilder().addComponents(betInput));
  await interaction.showModal(modal);
}

async function handleStartGame(interaction, game) {
  if (game.players.size === 0) {
    return await interaction.reply({ content: '❌ No players have joined!', flags: MessageFlags.Ephemeral });
  }
  
  game.startGame();
  await interaction.deferUpdate();
}

async function handleCashOut(interaction, game) {
  const userId = interaction.user.id;
  
  if (game.state !== 'running') {
    return await interaction.reply({ content: '❌ Game is not running!', flags: MessageFlags.Ephemeral });
  }
  
  const winnings = game.cashOut(userId);
  if (winnings === null) {
    return await interaction.reply({ content: '❌ You are not in this game or already cashed out!', flags: MessageFlags.Ephemeral });
  }
  
  await interaction.reply({
    content: `✅ Cashed out at **${game.currentMultiplier.toFixed(2)}x** → +${fmt(winnings)}!`,
    flags: MessageFlags.Ephemeral
  });
}

// Modal submission handler
async function handleModalSubmit(interaction, client, game) {
  if (interaction.customId !== 'crash_bet_modal') return;
  
  const userId = interaction.user.id;
  const username = interaction.user.displayName;
  const betAmountStr = interaction.fields.getTextInputValue('bet_amount');
  
  const betAmount = parseAmount(betAmountStr);
  if (!betAmount || betAmount < CRASH_CONFIG.min_bet || betAmount > CRASH_CONFIG.max_bet) {
    return await interaction.reply({
      content: `❌ Invalid bet amount! Must be between ${fmt(CRASH_CONFIG.min_bet)} and ${fmt(CRASH_CONFIG.max_bet)}`,
      flags: MessageFlags.Ephemeral
    });
  }
  
  // Add to game (addPlayer now deducts bet upfront)
  const addResult = await game.addPlayer(userId, username, betAmount);
  if (!addResult) {
    return await interaction.reply({
      content: '❌ Cannot join game at this time (insufficient funds or already joined)',
      flags: MessageFlags.Ephemeral
    });
  }
  
  await game.updateMessage();
  await interaction.reply({
    content: `✅ Bet placed: ${fmt(betAmount)}! Good luck! 🍀`,
    flags: MessageFlags.Ephemeral
  });
}

// Main game execution function
async function handleGameExecution(interaction, client, sessionId = null, initialBetData = null) {
  const channelId = interaction.channelId;
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const username = interaction.user.displayName;
  
  // Get or create game
  let game = crashManager.getGame(channelId);
  if (!game || game.state === 'finished' || game.state === 'crashed') {
    game = crashManager.createGame(channelId, guildId);
    game.sessionId = sessionId;
  }
  
  // Check if there's an initial bet from the command
  if (initialBetData && initialBetData.initialBet > 0) {
    const initialBet = initialBetData.initialBet;
    const betUserId = initialBetData.userId;
    const betUsername = initialBetData.username;
    
    try {
      // Add player with initial bet automatically (addPlayer now handles balance checking and deduction)
      const addResult = await game.addPlayer(betUserId, betUsername, initialBet);
      if (addResult) {
        logger.info(`Added ${betUsername} to crash game with initial bet ${fmt(initialBet)}`);
      } else {
        logger.warn(`Failed to add ${betUsername} to crash game (insufficient balance or other error)`);
      }
    } catch (error) {
      logger.error(`Failed to add player with initial bet: ${error.message}`);
    }
  }
  
  // Create initial message
  const embed = game.createEmbed();
  const components = game.createButtons();
  
  const message = await interaction.reply({
    embeds: [embed],
    components,
    fetchReply: true
  });
  
  game.gameMessage = message;
  
  // Start betting timer
  game.bettingTimeout = setTimeout(async () => {
    if (game.state === 'betting' && game.players.size > 0) {
      await game.startGame();
    }
  }, CRASH_CONFIG.betting_duration * 1000);
}

module.exports = {
  OptimizedCrashGame,
  OptimizedCrashManager,
  crashManager,
  handleGameExecution,
  handleButtonInteraction,
  handleModalSubmit,
  CRASH_CONFIG
};