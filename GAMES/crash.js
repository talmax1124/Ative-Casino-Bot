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
const { sendLogMessage } = require('../UTILS/common');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { secureRandomFloat } = require('../UTILS/rng');
const tuningManager = require('../UTILS/tuningManager');
const comprehensiveLogger = require('../UTILS/comprehensiveLogger');
const adaptiveGameMechanics = require('../UTILS/adaptiveGameMechanics');

// ECONOMIC SYSTEM COMPLIANT - Progressive difficulty modes with incremental multipliers to 3x max
const CRASH_MODES = {
  safe: {
    name: '🛡️ Safe',
    description: 'Conservative mode with lower crash risk',
    minBet: 500,
    maxMultiplier: 1.5,        // Small incremental cap at 1.5x
    houseEdge: 0.08,           // 8% house edge
    emoji: '🛡️',
    color: '#4CAF50'
  },
  balanced: {
    name: '⚖️ Balanced',
    description: 'Moderate risk with balanced rewards',
    minBet: 1000,
    maxMultiplier: 2.0,        // Medium incremental cap at 2.0x
    houseEdge: 0.10,           // 10% house edge
    emoji: '⚖️',
    color: '#FF9800'
  },
  risky: {
    name: '⚡ Risky',
    description: 'High risk with substantial rewards',
    minBet: 2500,
    maxMultiplier: 2.5,        // Higher incremental cap at 2.5x
    houseEdge: 0.12,           // 12% house edge
    emoji: '⚡',
    color: '#F44336'
  },
  extreme: {
    name: '🔥 Extreme',
    description: 'Maximum risk with highest rewards',
    minBet: 5000,
    maxMultiplier: 3.0,        // Maximum incremental cap at 3.0x
    houseEdge: 0.15,           // 15% house edge
    emoji: '🔥',
    color: '#9C27B0'
};

// Global configuration
const CRASH_CONFIG = {
  update_interval: 1000,      // Update every 1 second
  max_duration: 30,           // Max 30 seconds per game
  betting_duration: 60        // 60 seconds to place bets
};

// Adaptive crash point generation using wealth-based mechanics
async function generateAdaptiveCrashPoint(userId, currentWealth, betAmount, mode = 'balanced') {
  try {
    const adaptedCrashPoint = await adaptiveGameMechanics.getAdaptedCrashPoint(userId, currentWealth, betAmount);
    if (adaptedCrashPoint) {
      logger.info(`Adaptive crash point for user ${userId}: ${adaptedCrashPoint.toFixed(2)}x`);
      return adaptedCrashPoint;

  } catch (error) {
    logger.error(`Failed to get adaptive crash point: ${error.message}`);

  // Fallback to standard generation
  return generateCrashPoint(mode);

// Advanced crash point generation with CSPRNG and mode-specific maximums
function generateCrashPoint(mode = 'balanced') {
  const modeConfig = CRASH_MODES[mode] || CRASH_MODES.balanced;
  const maxMultiplier = modeConfig.maxMultiplier;
  
  // Generate random number for crash point
  const rand = secureRandomFloat(); // 0-1 range
  
  // Add volatility adjustment for more realistic crash patterns
  const volatilityRandom = secureRandomFloat();
  
  // Combine both randoms for enhanced unpredictability
  const combinedRand = (rand * 0.7) + (volatilityRandom * 0.3);
  
  let crashPoint;
  
  // Mode-specific probability curves with incremental progression
  if (maxMultiplier <= 1.5) {
    // Safe mode: 1.0x - 1.5x with conservative distribution
    if (combinedRand < 0.50) {
      crashPoint = 1.0 + (secureRandomFloat() * 0.3); // 1.0x - 1.3x (50%)
    } else {
      crashPoint = 1.3 + (secureRandomFloat() * 0.2); // 1.3x - 1.5x (50%)

  } else if (maxMultiplier <= 2.0) {
    // Balanced mode: 1.0x - 2.0x with moderate distribution
    if (combinedRand < 0.45) {
      crashPoint = 1.0 + (secureRandomFloat() * 0.5); // 1.0x - 1.5x (45%)
    } else if (combinedRand < 0.80) {
      crashPoint = 1.5 + (secureRandomFloat() * 0.3); // 1.5x - 1.8x (35%)
    } else {
      crashPoint = 1.8 + (secureRandomFloat() * 0.2); // 1.8x - 2.0x (20%)

  } else if (maxMultiplier <= 2.5) {
    // Risky mode: 1.0x - 2.5x with aggressive distribution
    if (combinedRand < 0.40) {
      crashPoint = 1.0 + (secureRandomFloat() * 0.6); // 1.0x - 1.6x (40%)
    } else if (combinedRand < 0.70) {
      crashPoint = 1.6 + (secureRandomFloat() * 0.4); // 1.6x - 2.0x (30%)
    } else if (combinedRand < 0.90) {
      crashPoint = 2.0 + (secureRandomFloat() * 0.3); // 2.0x - 2.3x (20%)
    } else {
      crashPoint = 2.3 + (secureRandomFloat() * 0.2); // 2.3x - 2.5x (10%)

  } else {
    // Extreme mode: 1.0x - 3.0x with maximum risk distribution
    if (combinedRand < 0.35) {
      crashPoint = 1.0 + (secureRandomFloat() * 0.7); // 1.0x - 1.7x (35%)
    } else if (combinedRand < 0.65) {
      crashPoint = 1.7 + (secureRandomFloat() * 0.5); // 1.7x - 2.2x (30%)
    } else if (combinedRand < 0.85) {
      crashPoint = 2.2 + (secureRandomFloat() * 0.5); // 2.2x - 2.7x (20%)
    } else if (combinedRand < 0.95) {
      crashPoint = 2.7 + (secureRandomFloat() * 0.2); // 2.7x - 2.9x (10%)
    } else {
      crashPoint = 2.9 + (secureRandomFloat() * 0.1); // 2.9x - 3.0x (5%)

  // Ensure we don't exceed mode-specific maximum
  return Math.min(maxMultiplier, Number(crashPoint.toFixed(2)));

// Improved multiplier calculation - starts at 1.00x with smaller increments
function calculateMultiplier(startTime, crashPoint) {
  const elapsed = (Date.now() - startTime) / 1000;
  
  // Start at exactly 1.00x and use smaller, more predictable increments
  if (elapsed <= 0) return 1.00;
  
  // Smaller increments: ~0.01x per 100ms for first few seconds, then accelerating
  let multiplier;
  if (elapsed < 5) {
    // Slow growth for first 5 seconds: 1.00x to ~1.50x
    multiplier = 1.00 + (elapsed * 0.10);
  } else if (elapsed < 10) {
    // Medium growth for next 5 seconds: 1.50x to ~2.00x  
    multiplier = 1.50 + ((elapsed - 5) * 0.10);
  } else {
    // Faster growth after 10 seconds: 2.00x toward max
    const fastPhase = elapsed - 10;
    multiplier = 2.00 + (fastPhase * 0.05) + (Math.pow(fastPhase, 1.2) * 0.02);

  return Math.min(Number(multiplier.toFixed(2)), crashPoint);

// Lightweight game state management with mode support
class OptimizedCrashGame {
  constructor(channelId, guildId, mode = 'balanced') {
    this.channelId = channelId;
    this.guildId = guildId;
    this.mode = mode;
    this.modeConfig = CRASH_MODES[mode] || CRASH_MODES.balanced;
    this.players = new Map();
    this.state = 'betting'; // betting, running, crashed, finished
    this.startTime = null;
    this.crashPoint = generateCrashPoint(mode);
    this.currentMultiplier = 1.0;
    this.gameMessage = null;
    this.updateInterval = null;
    this.bettingTimeout = null;
    this.sessionId = null;
    this.createdAt = Date.now();
    
    logger.info(`Created optimized crash game for channel ${channelId} in ${mode} mode with crash point ${this.crashPoint.toFixed(2)}x (max: ${this.modeConfig.maxMultiplier}x)`);

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

      const success = await dbManager.setUserBalance(userId, this.guildId, userBalance.wallet - betAmount, userBalance.bank);
      if (!success) {
        logger.error(`Crash: Failed to deduct bet for ${username}`);
        return { success: false, reason: 'DEDUCTION_FAILED' };

    } catch (error) {
      logger.error(`Crash: Balance error for ${userId}: ${error.message}`);
      return { success: false, reason: 'BALANCE_ERROR', error: error.message };

    this.players.set(userId, {
      username,
      bet: betAmount,
      cashedOut: false,
      cashOutMultiplier: 0,
      winnings: 0
    });
    
    logger.info(`Added ${username} to crash game with bet ${fmt(betAmount)}`);
    return { success: true };

  cashOut(userId) {
    if (this.state !== 'running') return null;
    
    const player = this.players.get(userId);
    if (!player || player.cashedOut) return null;
    
    player.cashedOut = true;
    player.cashOutMultiplier = this.currentMultiplier;
    player.winnings = Math.floor(player.bet * this.currentMultiplier);
    
    // Comprehensive logging for cashout
    comprehensiveLogger.logGame(userId, player.username || 'Player', 'crash', 'CASH_OUT', {
      betAmount: player.bet,
      multiplier: this.currentMultiplier,
      winnings: player.winnings,
      gameId: this.gameKey,
      timing: 'manual_cashout'
    }).catch(err => logger.error('Logging error:', err));
    
    return player.winnings;

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

  createEmbed() {
    let title, color, description;
    
    // Check if this is a playfor game
    const playForRecipient = global.playForContext?.recipientName;
    const winningForSomeoneElse = playForRecipient && global.playForContext.recipientId;
    
    // Add owner info to distinguish between multiple games
    let ownerInfo = this.ownerUsername ? `${this.ownerUsername}'s ` : '';
    if (winningForSomeoneElse) {
      ownerInfo = `${this.ownerUsername}'s (for @${playForRecipient}) `;
    }
    
    switch (this.state) {
      case 'betting':
        title = `💰 ${ownerInfo}Crash - Betting Phase`;
        color = 0x00FF00;
        const timeRemaining = this.bettingTimeout ? Math.max(0, Math.ceil((CRASH_CONFIG.betting_duration * 1000 - (Date.now() - (this.createdAt || Date.now()))) / 1000)) : CRASH_CONFIG.betting_duration;
        description = `🎯 Place your bets! ${this.modeConfig.emoji} ${this.modeConfig.name} Mode\nMinimum bet: ${fmt(this.modeConfig.minBet)} | Max multiplier: ${this.modeConfig.maxMultiplier}x\n⏱️ Time remaining: ${timeRemaining}s${this.players.size > 0 ? '\n🎮 Game will auto-start when timer reaches 0' : ''}`;
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

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setFooter({ text: this.ownerUsername ? 'Personal Crash Game • Others can start their own!' : 'Crash Game' })
      .setTimestamp();

    // Add Playing For field if applicable
    if (winningForSomeoneElse) {
      embed.addFields([{
        name: '🎁 Playing For',
        value: `@${playForRecipient}`,
        inline: true
      }]);
    }

    // Add player list
    if (this.players.size > 0) {
      const playerList = Array.from(this.players.entries())
        .map(([userId, player]) => {
          // Check if this is a playfor game
          const playForRecipient = global.playForContext?.recipientName;
          const winningForSomeoneElse = playForRecipient && global.playForContext.recipientId && global.playForContext.playerId === userId;
          
          const status = player.cashedOut 
            ? (winningForSomeoneElse 
                ? `✅ ${player.cashOutMultiplier.toFixed(2)}x (+${fmt(player.winnings)} for @${playForRecipient})`
                : `✅ ${player.cashOutMultiplier.toFixed(2)}x (+${fmt(player.winnings)})`)
            : (this.state === 'crashed' ? '❌ Lost' : '⏳ Active');
          
          const playerLabel = winningForSomeoneElse 
            ? `**${player.username}** (playing for @${playForRecipient})`
            : `**${player.username}**`;
            
          return `• ${playerLabel}: ${fmt(player.bet)} ${status}`;
        })
        .slice(0, 10) // Limit to 10 players for embed size
        .join('\n');

      embed.addFields([{
        name: `Players (${this.players.size})`,
        value: playerList || 'No players',
        inline: false
      }]);

    return embed;

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

    return buttons.length > 0 ? [new ActionRowBuilder().addComponents(buttons)] : [];

  async startGame() {
    if (this.state !== 'betting' || this.players.size === 0) return false;
    
    this.state = 'running';
    this.startTime = Date.now();
    this.currentMultiplier = 1.0;
    
    // Clear betting timeout
    if (this.bettingTimeout) {
      clearTimeout(this.bettingTimeout);
      this.bettingTimeout = null;

    // Start update loop (much slower and safer)
    this.updateInterval = setInterval(async () => {
      try {
        await this.updateGame();
      } catch (error) {
        logger.error(`Crash game update error: ${error.message}`);
        await this.crashGame('System error');

    }, CRASH_CONFIG.update_interval);
    
    await this.updateMessage();
    return true;

  async updateGame() {
    if (this.state !== 'running') return;
    
    this.currentMultiplier = calculateMultiplier(this.startTime, this.crashPoint);
    
    // Check for crash
    if (this.currentMultiplier >= this.crashPoint) {
      await this.crashGame();
      return;

    // Safety timeout - max game duration
    const elapsed = (Date.now() - this.startTime) / 1000;
    if (elapsed > CRASH_CONFIG.max_duration) {
      await this.crashGame('Game timeout');
      return;

    // Update message (less frequently)
    await this.updateMessage();

  async crashGame(reason = 'Natural crash') {
    if (this.state === 'crashed') return;
    
    this.state = 'crashed';
    this.currentMultiplier = this.crashPoint;
    
    // Comprehensive logging for game completion
    await comprehensiveLogger.logGame('SYSTEM', 'CRASH_SYSTEM', 'crash', 'GAME_CRASH', {
      gameId: this.gameKey,
      crashPoint: this.crashPoint,
      reason: reason,
      totalPlayers: this.players.size,
      playersActive: Array.from(this.players.values()).filter(p => !p.cashedOut).length,
      playersCashedOut: Array.from(this.players.values()).filter(p => p.cashedOut).length,
      totalBetsAmount: Array.from(this.players.values()).reduce((sum, p) => sum + p.bet, 0),
      potentialWinnings: Array.from(this.players.values()).reduce((sum, p) => sum + (p.cashedOut ? p.winnings : 0), 0)
    }).catch(err => logger.error('Logging error:', err));
    
    // Clear update interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;

    // Process all players - bet was already deducted, so we only add winnings back
    for (const [userId, player] of this.players.entries()) {
      try {
        const won = player.cashedOut;
        const payout = won ? player.winnings : 0;
        const netChange = won ? (player.winnings - player.bet) : -player.bet;
        
        // Comprehensive logging for each player outcome
        await comprehensiveLogger.logGame(userId, player.username || 'Player', 'crash', won ? 'WIN' : 'LOSS', {
          betAmount: player.bet,
          payout: payout,
          netChange: netChange,
          multiplier: won ? player.cashOutMultiplier : 0,
          crashPoint: this.crashPoint,
          cashedOut: player.cashedOut,
          gameId: this.gameKey,
          timing: won ? 'cashed_out_before_crash' : 'lost_to_crash'
        }).catch(err => logger.error('Logging error:', err));
        
        if (player.cashedOut) {
          // Player cashed out: give them their winnings
          await dbManager.updateUserBalance(userId, this.guildId, player.winnings, 0);
          logger.info(`Crash payout: ${player.username} won ${fmt(player.winnings)} (cashed out at ${player.cashOutMultiplier.toFixed(2)}x)`);
          
          // Log economic impact for winners
          await comprehensiveLogger.logEconomic('CRASH_WIN_PAYOUT', 'NORMAL', `Player won ${fmt(player.winnings)} from crash game`, {
            userId: userId,
            username: player.username,
            betAmount: player.bet,
            winnings: player.winnings,
            netProfit: netChange,
            multiplier: player.cashOutMultiplier,
            crashPoint: this.crashPoint,
            gameType: 'crash'
          }).catch(err => logger.error('Logging error:', err));
        } else {
          // Player didn't cash out: they lose their bet (already deducted, no action needed)
          logger.info(`Crash loss: ${player.username} lost ${fmt(player.bet)} (didn't cash out)`);
          
          // Log economic impact for losers
          await comprehensiveLogger.logEconomic('CRASH_LOSS', 'NORMAL', `Player lost ${fmt(player.bet)} to crash game`, {
            userId: userId,
            username: player.username,
            betAmount: player.bet,
            lossAmount: player.bet,
            crashPoint: this.crashPoint,
            gameType: 'crash'
          }).catch(err => logger.error('Logging error:', err));

        // Record game result for economic analysis
        const gameResult = new GameResult({
          userId,
          guildId: this.guildId,
          gameType: GameType.CRASH,
          betAmount: player.bet,
          payout: payout,
          won: won,
          metadata: {
            crashPoint: this.crashPoint,
            cashOutMultiplier: player.cashOutMultiplier || 0,
            cashedOut: player.cashedOut,
            houseEdge: CRASH_CONFIG.house_edge

        });
        
        await PayoutManager.processGamePayout(gameResult);
        
        // Record game result for AI learning
        try {
          await dbManager.recordGameResult(
            userId,
            this.guildId,
            'crash',
            won,
            player.bet,
            payout,
            {
              crashPoint: this.crashPoint,
              cashOutMultiplier: player.cashOutMultiplier || 0,
              cashedOut: player.cashedOut,
              houseEdge: CRASH_CONFIG.house_edge,
              gameType: 'crash',
              multiplier: player.cashedOut ? player.cashOutMultiplier : 0

          );
        } catch (aiError) {
          logger.error(`Failed to record crash game result for AI: ${aiError.message}`);

                try {
        const winners = Array.from(this.players.values()).filter(p => p.cashedOut);
        await sessionManager.endSession(this.sessionId, {
          outcome: winners.length > 0 ? 'SOME_WINNERS' : 'ALL_LOST',
          crashPoint: this.crashPoint,
          totalPlayers: this.players.size,
          winners: winners.length,
          gameCompleted: true
        });
      } catch (error) {
        logger.error(`Failed to complete crash session: ${error.message}`);

    logger.info(`Crash game crashed at ${this.crashPoint.toFixed(2)}x (${reason})`);
    
    // Keep the game results visible for a while, then finish
    setTimeout(async () => {
      this.state = 'finished';
      await this.updateMessage();
    }, 10000); // Show results for 10 seconds

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

  cleanup() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;

    if (this.bettingTimeout) {
      clearTimeout(this.bettingTimeout);
      this.bettingTimeout = null;

// Game manager
class OptimizedCrashManager {
  constructor() {
    this.games = new Map();

  createGame(channelId, guildId, sessionId = null, userId = null, username = null, mode = 'balanced') {
    // Create unique game key: use sessionId if provided, otherwise channelId
    // This prevents multiple games conflicting in the same channel
    let gameKey;
    if (sessionId) {
      gameKey = sessionId; // Use session ID as key for better tracking
    } else if (userId) {
      gameKey = `${channelId}_${userId}`; // User-specific game fallback
    } else {
      gameKey = channelId; // Channel-wide game

    // Clean up any existing game with this specific key
    const existing = this.games.get(gameKey);
    if (existing) {
      existing.cleanup();

    const game = new OptimizedCrashGame(channelId, guildId, mode);
    game.gameKey = gameKey; // Store the key for later reference
    game.ownerId = userId; // Store who owns this game session
    game.ownerUsername = username; // Store the owner's username
    this.games.set(gameKey, game);
    return game;

  getGame(channelId, userId = null) {
    // If userId is provided, look for user-specific game first
    if (userId) {
      const userGameKey = `${channelId}_${userId}`;
      const userGame = this.games.get(userGameKey);
      if (userGame) return userGame;

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

    return mostRecentGame;

  getUserGame(channelId, userId) {
    const userGameKey = `${channelId}_${userId}`;
    return this.games.get(userGameKey);

  getAllChannelGames(channelId) {
    const channelGames = [];
    for (const [key, gameInstance] of this.games.entries()) {
      if (gameInstance.channelId === channelId) {
        channelGames.push(gameInstance);

    return channelGames;

  removeGame(channelId) {
    // First try to remove by channelId
    let game = this.games.get(channelId);
    if (game) {
      game.cleanup();
      this.games.delete(channelId);
      return;

    // If not found by channelId, find by sessionId and remove
    for (const [key, gameInstance] of this.games.entries()) {
      if (gameInstance.channelId === channelId) {
        gameInstance.cleanup();
        this.games.delete(key);
        return;

  cleanup() {
    for (const [channelId, game] of this.games.entries()) {
      game.cleanup();

    this.games.clear();

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

  } catch (error) {
    logger.error(`Crash button interaction error: ${error.message}`);
    try {
      await sendLogMessage(
        client,
        'error',
        `Crash action error (${action}) for ${interaction.user.tag} (${interaction.user.id}) — ${error.message}`,
        interaction.user.id,
        interaction.guildId
      );
    } catch (_) {}
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ An error occurred', flags: MessageFlags.Ephemeral });

async function handleJoinGame(interaction, game) {
  logger.info(`handleJoinGame called - gameKey: ${game.gameKey}, state: ${game.state}, existing players: ${game.players.size}`);
  
  if (game.state !== 'betting') {
    logger.warn(`User ${interaction.user.displayName} tried to join crash game but state is '${game.state}' (not 'betting')`);
    return await interaction.reply({ content: '❌ Betting is closed!', flags: MessageFlags.Ephemeral });

  const userId = interaction.user.id;
  
  // Check if user already has a bet placed
  if (game.players.has(userId)) {
    const player = game.players.get(userId);
    logger.info(`User ${interaction.user.displayName} already in game with bet ${player.bet}`);
    return await interaction.reply({ 
      content: `✅ You already have a bet of ${fmt(player.bet)} in this game! Wait for the game to start.`, 
      flags: MessageFlags.Ephemeral 
    });

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

async function handleStartGame(interaction, game) {
  if (game.players.size === 0) {
    logger.warn(`Start game attempted but no players found in game state: ${game.state}, gameKey: ${game.gameKey}`);
    return await interaction.reply({ content: '❌ No players have joined!', flags: MessageFlags.Ephemeral });

  logger.info(`Starting crash game with ${game.players.size} players`);
  const started = await game.startGame();
  if (!started) {
    logger.error(`Failed to start crash game - state: ${game.state}, players: ${game.players.size}`);
    return await interaction.reply({ content: '❌ Failed to start game. Please try again.', flags: MessageFlags.Ephemeral });

  await interaction.deferUpdate();

async function handleCashOut(interaction, game) {
  const userId = interaction.user.id;
  
  if (game.state !== 'running') {
    return await interaction.reply({ content: '❌ Game is not running!', flags: MessageFlags.Ephemeral });

  const winnings = game.cashOut(userId);
  if (winnings === null) {
    return await interaction.reply({ content: '❌ You are not in this game or already cashed out!', flags: MessageFlags.Ephemeral });

  await interaction.reply({
    content: `✅ Cashed out at **${game.currentMultiplier.toFixed(2)}x** → +${fmt(winnings)}!`,
    flags: MessageFlags.Ephemeral
  });

async function handlePlayAgain(interaction, game) {
  if (game.state !== 'crashed' && game.state !== 'finished') {
    return await interaction.reply({ content: '❌ The current game is still active!', flags: MessageFlags.Ephemeral });

  const userId = interaction.user.id;
  const username = interaction.user.displayName;
  const channelId = interaction.channelId;
  const guildId = interaction.guildId;
  
  try {
    // Preserve the mode from the old game before cleanup
    const oldMode = game.mode || 'balanced';
    
    // Clean up the old game
    game.cleanup();
    crashManager.removeGame(channelId);
    
    // Create a completely new game with the same mode
    const newGame = crashManager.createGame(channelId, guildId, null, userId, username, oldMode);
    
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

          }, 300000); // 5 minutes total timeout

    }, CRASH_CONFIG.betting_duration * 1000);
    
    logger.info(`New crash game started by ${username} via Play Again button`);
    
  } catch (error) {
    logger.error(`Failed to start new crash game: ${error.message}`);
    await interaction.reply({
      content: '❌ Failed to start a new game. Please try using `/crash` instead.',
      flags: MessageFlags.Ephemeral
    });

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

  const parsedAmount = parseAmount(betAmountStr);
  
  // Get user balance to resolve 'all' and 'half' amounts
  const userBalance = await dbManager.getUserBalance(userId, interaction.guildId);
  if (!userBalance) {
    return await interaction.reply({
      content: '❌ Unable to fetch your balance. Please try again.',
      flags: MessageFlags.Ephemeral
    });

  // Resolve the actual bet amount using the common function
  const { resolveAmount } = require('../UTILS/common');
  const betAmount = await resolveAmount(parsedAmount, userBalance.wallet);
  
  // 🎛️ GET AI-REGULATED MAX BET LIMIT (Economic Compliance)
  try {
    await tuningManager.initialize();
    const maxBetConfig = await tuningManager.getMaxBetLimit(userId, 'crash', CRASH_CONFIG.max_bet);
    const dynamicMaxBet = maxBetConfig.maxBet;
    
    // Log comprehensive betting attempt
    await comprehensiveLogger.logGame(userId, username || 'Player', 'crash', 'BET_ATTEMPT', {
      betAmount: betAmount,
      maxBetAllowed: dynamicMaxBet,
      userCapped: maxBetConfig.userCapped,
      aiAdjusted: maxBetConfig.adjustmentApplied,
      guildId: interaction.guildId
    });
    
    if (!betAmount || betAmount < CRASH_CONFIG.min_bet || betAmount > dynamicMaxBet) {
      await comprehensiveLogger.logSecurity('INVALID_BET_ATTEMPT', 'LOW', `User ${username} attempted invalid bet: ${betAmount}`, {
        userId: userId,
        attemptedBet: betAmount,
        minBet: CRASH_CONFIG.min_bet,
        maxBet: dynamicMaxBet,
        game: 'crash'
      });
      
      return await interaction.reply({
        content: `❌ Invalid bet amount! Must be between ${fmt(CRASH_CONFIG.min_bet)} and ${fmt(dynamicMaxBet)}${maxBetConfig.userCapped ? ' (user limit)' : ''}`,
        flags: MessageFlags.Ephemeral
      });

  } catch (tuningError) {
    // Fallback to original limits if tuning system fails
    await comprehensiveLogger.logError('CRASH_TUNING_SYSTEM', tuningError, { 
      critical: false, 
      fallback: 'original_limits',
      userId: userId 
    });
    
    if (!betAmount || betAmount < CRASH_CONFIG.min_bet || betAmount > CRASH_CONFIG.max_bet) {
      return await interaction.reply({
        content: `❌ Invalid bet amount! Must be between ${fmt(CRASH_CONFIG.min_bet)} and ${fmt(CRASH_CONFIG.max_bet)}`,
        flags: MessageFlags.Ephemeral
      });

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

    return await interaction.reply({
      content: errorMessage,
      flags: MessageFlags.Ephemeral
    });

  await game.updateMessage();
  logger.info(`Player ${username} successfully added to game. Total players now: ${game.players.size}`);
  await interaction.reply({
    content: `✅ Bet placed: ${fmt(betAmount)}! Good luck! 🍀`,
    flags: MessageFlags.Ephemeral
  });

// Main game execution function
async function handleGameExecution(interaction, client, sessionId = null, initialBetData = null) {
  const channelId = interaction.channelId;
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const username = interaction.user.displayName;
  
  // Extract mode from session metadata or initialBetData
  let mode = 'balanced';
  if (sessionId) {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (session && session.metadata && session.metadata.mode) {
        mode = session.metadata.mode;

    } catch (error) {
      logger.warn(`Failed to get session metadata for mode: ${error.message}`);

  if (initialBetData && initialBetData.mode) {
    mode = initialBetData.mode;

  // Always create a new user-specific game - this allows multiple independent sessions
  // Each user gets their own crash game that doesn't interfere with others
  let game = crashManager.createGame(channelId, guildId, sessionId, userId, username, mode);
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

    } catch (error) {
      logger.error(`Exception adding player with initial bet: ${error.message}`);

  // Create initial message
  const embed = game.createEmbed();
  const components = game.createButtons();
  
  const message = await interaction.editReply({
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

        }, 300000); // 5 minutes total timeout

  }, CRASH_CONFIG.betting_duration * 1000);

// NEW: Entry point function for crash command
async function startCrashGame(interaction, selectedMode = 'balanced', betAmount = 0) {
  const userId = interaction.user.id;
  const guildId = interaction.guildId;
  const channelId = interaction.channelId;
  
  // Validate mode
  if (!CRASH_MODES[selectedMode]) {
    selectedMode = 'balanced';

  const mode = CRASH_MODES[selectedMode];
  
  // Create session for crash game with mode metadata
  const sessionResult = await sessionManager.createSession({
    userId,
    guildId,
    channelId: interaction.channelId,
    gameType: GameType.CRASH,
    betAmount: betAmount, // Initial bet amount provided
    timeout: 120000, // 2 minutes
    metadata: {
      gamePhase: 'joining',
      betPlaced: betAmount > 0,
      initialBet: betAmount,
      mode: selectedMode,
      minBet: mode.minBet,
      maxMultiplier: mode.maxMultiplier

  });

  if (!sessionResult.success) {
    throw new Error(`Session creation failed: ${sessionResult.error}`);

  const sessionId = sessionResult.sessionId;

  // Pass session info to crash game handler with initial bet
  await handleGameExecution(interaction, interaction.client, sessionId, {
    initialBet: betAmount,
    userId: userId,
    username: interaction.user.displayName,
    mode: selectedMode
  });

module.exports = {
  OptimizedCrashGame,
  OptimizedCrashManager,
  crashManager,
  handleGameExecution,
  handleButtonInteraction,
  handleModalSubmit,
  startCrashGame,
  CRASH_CONFIG,
  CRASH_MODES
};
