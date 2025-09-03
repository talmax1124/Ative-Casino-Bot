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
const sessionManager = require('../UTILS/sessionManager');
const logger = require('../UTILS/logger');

// Optimized configuration - much more conservative
const CRASH_CONFIG = {
  min_bet: 10,
  max_bet: 100000,
  update_interval: 1000,      // Update every 1 second (was 500ms)
  max_multiplier: 15.0,
  house_edge: 0.03,
  max_duration: 30,           // Max 30 seconds per game
  betting_duration: 60        // 60 seconds to place bets (was 15)
};

// Simple crash point generation
function generateCrashPoint() {
  const rand = Math.random();
  
  // Simple probability curve - no complex math
  if (rand < 0.33) return 1.0 + (Math.random() * 1.5); // 1.0x - 2.5x (33%)
  if (rand < 0.66) return 2.5 + (Math.random() * 2.5); // 2.5x - 5.0x (33%)
  if (rand < 0.90) return 5.0 + (Math.random() * 10);  // 5.0x - 15.0x (24%)
  return Math.min(15.0, 15.0 + (Math.random() * 0));    // Max 15.0x (10%)
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
    this.createdAt = Date.now();
    
    logger.info(`Created optimized crash game for channel ${channelId} with crash point ${this.crashPoint.toFixed(2)}x`);
  }

  async addPlayer(userId, username, betAmount) {
    if (this.state !== 'betting') return { success: false, reason: 'BETTING_CLOSED' };
    
    // Don't add player if they're already in the game
    if (this.players.has(userId)) return { success: false, reason: 'ALREADY_JOINED' };
    
    // Deduct bet upfront like other casino games
    try {
      const userBalance = await dbManager.getUserBalance(userId, this.guildId);
      if (userBalance.wallet < betAmount) {
        logger.warn(`Crash: ${username} has insufficient funds (${userBalance.wallet} < ${betAmount})`);
        return { success: false, reason: 'INSUFFICIENT_FUNDS', currentBalance: userBalance.wallet };
      }
      
      const success = await dbManager.setUserBalance(userId, this.guildId, userBalance.wallet - betAmount, userBalance.bank);
      if (!success) {
        logger.error(`Crash: Failed to deduct bet for ${username}`);
        return { success: false, reason: 'DEDUCTION_FAILED' };
      }
    } catch (error) {
      logger.error(`Crash: Balance error for ${userId}: ${error.message}`);
      return { success: false, reason: 'BALANCE_ERROR', error: error.message };
    }
    
    this.players.set(userId, {
      username,
      bet: betAmount,
      cashedOut: false,
      cashOutMultiplier: 0,
      winnings: 0
    });
    
    logger.info(`Added ${username} to crash game with bet ${fmt(betAmount)}`);
    return { success: true };
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
    
    // Add owner info to distinguish between multiple games
    const ownerInfo = this.ownerUsername ? `${this.ownerUsername}'s ` : '';
    
    switch (this.state) {
      case 'betting':
        title = `💰 ${ownerInfo}Crash - Betting Phase`;
        color = 0x00FF00;
        const timeRemaining = this.bettingTimeout ? Math.max(0, Math.ceil((CRASH_CONFIG.betting_duration * 1000 - (Date.now() - (this.createdAt || Date.now()))) / 1000)) : CRASH_CONFIG.betting_duration;
        description = `🎯 Place your bets! Minimum bet: ${fmt(CRASH_CONFIG.min_bet)}\n⏱️ Time remaining: ${timeRemaining}s${this.players.size > 0 ? '\n🎮 Game will auto-start when timer reaches 0' : ''}`;
        break;
      case 'running':
        title = `🚀 ${ownerInfo}Crash - ${this.currentMultiplier.toFixed(2)}x`;
        color = 0xFFAA00;
        description = this.createVisualization();
        break;
      case 'crashed':
        title = `💥 ${ownerInfo}CRASHED at ${this.crashPoint.toFixed(2)}x!`;
        color = 0xFF0000;
        description = this.createVisualization();
        break;
      case 'finished':
        title = `🏁 ${ownerInfo}Game Finished`;
        color = 0x666666;
        description = `The game crashed at **${this.crashPoint.toFixed(2)}x**\n\nClick "Play Again" to start a new round!`;
        break;
      default:
        title = `🎮 ${ownerInfo}Crash Game`;
        color = 0x999999;
        description = 'Game ended';
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setFooter({ text: this.ownerUsername ? 'Personal Crash Game • Others can start their own!' : 'Crash Game' })
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
          .setStyle(ButtonStyle.Success)
      );
      
      // Show start game button if there are players
      if (this.players.size > 0) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('crash_start')
            .setLabel(`🚀 Start Game (${this.players.size} players)`)
            .setStyle(ButtonStyle.Primary)
        );
      }
    } else if (this.state === 'running') {
      buttons.push(
        new ButtonBuilder()
          .setCustomId('crash_cashout')
          .setLabel(`💸 Cash Out (${this.currentMultiplier.toFixed(2)}x)`)
          .setStyle(ButtonStyle.Danger)
      );
    } else if (this.state === 'crashed' || this.state === 'finished') {
      // Game is over - offer to play again
      buttons.push(
        new ButtonBuilder()
          .setCustomId('crash_play_again')
          .setLabel('🎮 Play Again')
          .setStyle(ButtonStyle.Secondary)
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
    
    // Keep the game results visible for a while, then finish
    setTimeout(async () => {
      this.state = 'finished';
      await this.updateMessage();
    }, 10000); // Show results for 10 seconds
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

  createGame(channelId, guildId, sessionId = null, userId = null, username = null) {
    // Create unique game key: use sessionId if provided, otherwise channelId
    // This prevents multiple games conflicting in the same channel
    let gameKey;
    if (sessionId) {
      gameKey = sessionId; // Use session ID as key for better tracking
    } else if (userId) {
      gameKey = `${channelId}_${userId}`; // User-specific game fallback
    } else {
      gameKey = channelId; // Channel-wide game
    }
    
    // Clean up any existing game with this specific key
    const existing = this.games.get(gameKey);
    if (existing) {
      existing.cleanup();
    }
    
    const game = new OptimizedCrashGame(channelId, guildId);
    game.gameKey = gameKey; // Store the key for later reference
    game.ownerId = userId; // Store who owns this game session
    game.ownerUsername = username; // Store the owner's username
    this.games.set(gameKey, game);
    return game;
  }

  getGame(channelId, userId = null) {
    // If userId is provided, look for user-specific game first
    if (userId) {
      const userGameKey = `${channelId}_${userId}`;
      const userGame = this.games.get(userGameKey);
      if (userGame) return userGame;
    }
    
    // First try to get by channelId (legacy)
    let game = this.games.get(channelId);
    if (game) return game;
    
    // If not found, try to find any game in this channel
    // Return the most recently created game in the channel
    let mostRecentGame = null;
    let mostRecentTime = 0;
    for (const [key, gameInstance] of this.games.entries()) {
      if (gameInstance.channelId === channelId) {
        if (!mostRecentGame || gameInstance.createdAt > mostRecentTime) {
          mostRecentGame = gameInstance;
          mostRecentTime = gameInstance.createdAt;
        }
      }
    }
    
    return mostRecentGame;
  }

  getUserGame(channelId, userId) {
    const userGameKey = `${channelId}_${userId}`;
    return this.games.get(userGameKey);
  }

  getAllChannelGames(channelId) {
    const channelGames = [];
    for (const [key, gameInstance] of this.games.entries()) {
      if (gameInstance.channelId === channelId) {
        channelGames.push(gameInstance);
      }
    }
    return channelGames;
  }

  removeGame(channelId) {
    // First try to remove by channelId
    let game = this.games.get(channelId);
    if (game) {
      game.cleanup();
      this.games.delete(channelId);
      return;
    }
    
    // If not found by channelId, find by sessionId and remove
    for (const [key, gameInstance] of this.games.entries()) {
      if (gameInstance.channelId === channelId) {
        gameInstance.cleanup();
        this.games.delete(key);
        return;
      }
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
      case 'play_again':
        await handlePlayAgain(interaction, game);
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
  logger.info(`handleJoinGame called - gameKey: ${game.gameKey}, state: ${game.state}, existing players: ${game.players.size}`);
  
  if (game.state !== 'betting') {
    logger.warn(`User ${interaction.user.displayName} tried to join crash game but state is '${game.state}' (not 'betting')`);
    return await interaction.reply({ content: '❌ Betting is closed!', flags: MessageFlags.Ephemeral });
  }
  
  const userId = interaction.user.id;
  
  // Check if user already has a bet placed
  if (game.players.has(userId)) {
    const player = game.players.get(userId);
    logger.info(`User ${interaction.user.displayName} already in game with bet ${player.bet}`);
    return await interaction.reply({ 
      content: `✅ You already have a bet of ${fmt(player.bet)} in this game! Wait for the game to start.`, 
      flags: MessageFlags.Ephemeral 
    });
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
    logger.warn(`Start game attempted but no players found in game state: ${game.state}, gameKey: ${game.gameKey}`);
    return await interaction.reply({ content: '❌ No players have joined!', flags: MessageFlags.Ephemeral });
  }
  
  logger.info(`Starting crash game with ${game.players.size} players`);
  const started = await game.startGame();
  if (!started) {
    logger.error(`Failed to start crash game - state: ${game.state}, players: ${game.players.size}`);
    return await interaction.reply({ content: '❌ Failed to start game. Please try again.', flags: MessageFlags.Ephemeral });
  }
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

async function handlePlayAgain(interaction, game) {
  if (game.state !== 'crashed' && game.state !== 'finished') {
    return await interaction.reply({ content: '❌ The current game is still active!', flags: MessageFlags.Ephemeral });
  }
  
  const userId = interaction.user.id;
  const username = interaction.user.displayName;
  const channelId = interaction.channelId;
  const guildId = interaction.guildId;
  
  try {
    // Clean up the old game
    game.cleanup();
    crashManager.removeGame(channelId);
    
    // Create a completely new game
    const newGame = crashManager.createGame(channelId, guildId, null, userId, username);
    
    // Create new embed and buttons
    const embed = newGame.createEmbed();
    const components = newGame.createButtons();
    
    // Reply with the new game
    const message = await interaction.reply({
      embeds: [embed],
      components
    });
    
    // Set up the new game message and timeout
    const fetchedMessage = await interaction.fetchReply();
    newGame.gameMessage = fetchedMessage;
    
    // Start betting timer
    newGame.bettingTimeout = setTimeout(async () => {
      if (newGame.state === 'betting') {
        if (newGame.players.size > 0) {
          logger.info(`Auto-starting crash game with ${newGame.players.size} players after ${CRASH_CONFIG.betting_duration}s`);
          await newGame.startGame();
        } else {
          logger.info(`Crash game betting phase ended with no players - keeping betting open`);
          // Keep the game in betting state but extend the timeout
          newGame.bettingTimeout = setTimeout(async () => {
            if (newGame.state === 'betting' && newGame.players.size === 0) {
              newGame.state = 'finished';
              await newGame.updateMessage();
              logger.info(`Crash game expired due to no players joining`);
            }
          }, 300000); // 5 minutes total timeout
        }
      }
    }, CRASH_CONFIG.betting_duration * 1000);
    
    logger.info(`New crash game started by ${username} via Play Again button`);
    
  } catch (error) {
    logger.error(`Failed to start new crash game: ${error.message}`);
    await interaction.reply({
      content: '❌ Failed to start a new game. Please try using `/crash` instead.',
      flags: MessageFlags.Ephemeral
    });
  }
}

// Modal submission handler
async function handleModalSubmit(interaction, client, game) {
  if (interaction.customId !== 'crash_bet_modal') return;
  
  const userId = interaction.user.id;
  const username = interaction.user.displayName;
  const betAmountStr = interaction.fields.getTextInputValue('bet_amount');
  
  // Check if user already has a bet placed (prevent double betting)
  if (game.players.has(userId)) {
    const player = game.players.get(userId);
    return await interaction.reply({
      content: `❌ You already have a bet of ${fmt(player.bet)} in this game!`,
      flags: MessageFlags.Ephemeral
    });
  }
  
  const betAmount = parseAmount(betAmountStr);
  if (!betAmount || betAmount < CRASH_CONFIG.min_bet || betAmount > CRASH_CONFIG.max_bet) {
    return await interaction.reply({
      content: `❌ Invalid bet amount! Must be between ${fmt(CRASH_CONFIG.min_bet)} and ${fmt(CRASH_CONFIG.max_bet)}`,
      flags: MessageFlags.Ephemeral
    });
  }
  
  // Add to game (addPlayer now deducts bet upfront)
  logger.info(`Adding player ${username} to game ${game.gameKey} with bet ${betAmount}`);
  const addResult = await game.addPlayer(userId, username, betAmount);
  logger.info(`Add player result for ${username}: ${JSON.stringify(addResult)}`);
  
  if (!addResult.success) {
    let errorMessage = '❌ Cannot join game at this time';
    
    switch (addResult.reason) {
      case 'INSUFFICIENT_FUNDS':
        errorMessage = `❌ Insufficient funds! You have ${fmt(addResult.currentBalance)} but need ${fmt(betAmount)}`;
        break;
      case 'ALREADY_JOINED':
        errorMessage = '❌ You already have a bet placed in this game!';
        break;
      case 'BETTING_CLOSED':
        errorMessage = '❌ Betting is closed for this game!';
        break;
      case 'DEDUCTION_FAILED':
        errorMessage = '❌ Failed to process your bet. Please try again.';
        break;
      case 'BALANCE_ERROR':
        errorMessage = '❌ Error checking your balance. Please try again.';
        break;
      default:
        errorMessage += ` (${addResult.reason})`;
    }
    
    return await interaction.reply({
      content: errorMessage,
      flags: MessageFlags.Ephemeral
    });
  }
  
  await game.updateMessage();
  logger.info(`Player ${username} successfully added to game. Total players now: ${game.players.size}`);
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
  
  // Always create a new user-specific game - this allows multiple independent sessions
  // Each user gets their own crash game that doesn't interfere with others
  let game = crashManager.createGame(channelId, guildId, sessionId, userId, username);
  game.sessionId = sessionId;
  
  // Check if there's an initial bet from the command
  if (initialBetData && initialBetData.initialBet > 0) {
    const initialBet = initialBetData.initialBet;
    const betUserId = initialBetData.userId;
    const betUsername = initialBetData.username;
    
    try {
      // Add player with initial bet automatically (addPlayer handles balance checking and deduction)
      const addResult = await game.addPlayer(betUserId, betUsername, initialBet);
      if (!addResult.success) {
        logger.warn(`Failed to add ${betUsername} to crash game with initial bet ${fmt(initialBet)}: ${addResult.reason}`);
      }
    } catch (error) {
      logger.error(`Exception adding player with initial bet: ${error.message}`);
    }
  }
  
  // Create initial message
  const embed = game.createEmbed();
  const components = game.createButtons();
  
  const message = await interaction.reply({
    embeds: [embed],
    components
  });
  
  // Fetch the message separately to avoid deprecation warning
  const fetchedMessage = await interaction.fetchReply();
  
  game.gameMessage = fetchedMessage;
  
  // Start betting timer - only auto-start if players join
  game.bettingTimeout = setTimeout(async () => {
    if (game.state === 'betting') {
      logger.info(`Betting timeout reached for game ${game.gameKey} - players: ${game.players.size}, player list: ${Array.from(game.players.keys()).join(', ')}`);
      if (game.players.size > 0) {
        logger.info(`Auto-starting crash game ${game.gameKey} with ${game.players.size} players after ${CRASH_CONFIG.betting_duration}s`);
        await game.startGame();
      } else {
        logger.info(`Crash game ${game.gameKey} betting phase ended with no players - keeping betting open`);
        // Keep the game in betting state but extend the timeout
        game.bettingTimeout = setTimeout(async () => {
          if (game.state === 'betting' && game.players.size === 0) {
            game.state = 'finished';
            await game.updateMessage();
            logger.info(`Crash game expired due to no players joining`);
          }
        }, 300000); // 5 minutes total timeout
      }
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