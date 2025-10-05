/**
 * Crash Game - Minimal, stable implementation
 * Exports:
 *  - CRASH_MODES
 *  - crashManager
 *  - startCrashGame(interaction, selectedMode, betAmount)
 *  - handleButtonInteraction(interaction, client, game)
 *  - handleModalSubmit(interaction, client, game)
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
const { fmt, parseAmount, resolveAmount, sendLogMessage } = require('../UTILS/common');
const sessionManager = require('../UTILS/sessionManager');
const { GameType } = require('../UTILS/gameUtils');
const logger = require('../UTILS/logger');
const uasDataExporter = require('../UTILS/uasDataExporter');

const CRASH_MODES = {
  safe:   { name: '🛡️ Safe',    minBet: 500,  maxMultiplier: 1.5, color: 0x4CAF50 },
  balanced:{ name: '⚖️ Balanced', minBet: 1000, maxMultiplier: 2.0, color: 0xFF9800 },
  risky:  { name: '⚡ Risky',   minBet: 2500, maxMultiplier: 2.5, color: 0xF44336 },
  extreme:{ name: '🔥 Extreme', minBet: 5000, maxMultiplier: 3.0, color: 0x9C27B0 }
};

function randFloat() { return Math.random(); }

function generateCrashPoint(maxMultiplier) {
  // IMPROVED: More player-friendly distribution - higher crash points more likely
  const r = randFloat();
  let cp;
  
  // 70% chance for favorable crashes (75-90% of max multiplier range)
  if (r < 0.7) {
    const minRange = 1.0 + (maxMultiplier - 1.0) * 0.75; // Start at 75% of max range
    const maxRange = 1.0 + (maxMultiplier - 1.0) * 0.9;  // Up to 90% of max range
    cp = minRange + (randFloat() * (maxRange - minRange));
  }
  // 20% chance for mid-range crashes (50-75% of max multiplier range)
  else if (r < 0.9) {
    const minRange = 1.0 + (maxMultiplier - 1.0) * 0.5;  // Start at 50% of max range
    const maxRange = 1.0 + (maxMultiplier - 1.0) * 0.75; // Up to 75% of max range
    cp = minRange + (randFloat() * (maxRange - minRange));
  }
  // 10% chance for early crashes (keep some risk)
  else {
    cp = 1.0 + (randFloat() * (maxMultiplier - 1.0) * 0.5);
  }
  
  return Math.min(maxMultiplier, Number(cp.toFixed(2)));
}

function calcMultiplier(startTime, crashPoint) {
  const elapsed = (Date.now() - startTime) / 1000;
  if (elapsed <= 0) return 1.0;
  // Smooth growth towards crash point
  const growth = Math.min(crashPoint, 1.0 + elapsed * 0.15 + Math.max(0, elapsed - 6) * 0.05);
  return Number(growth.toFixed(2));
}

class CrashGame {
  constructor(channelId, guildId, ownerId, ownerUsername, modeKey) {
    this.channelId = channelId;
    this.guildId = guildId;
    this.ownerId = ownerId;
    this.ownerUsername = ownerUsername;
    this.modeKey = modeKey || 'balanced';
    this.mode = CRASH_MODES[this.modeKey] || CRASH_MODES.balanced;
    this.players = new Map(); // userId -> { username, bet, cashedOut, winnings, cashOutMultiplier }
    this.state = 'betting';
    this.startTime = null;
    this.crashPoint = generateCrashPoint(this.mode.maxMultiplier);
    this.currentMultiplier = 1.0;
    this.gameMessage = null;
    this.updateInterval = null;
    this.bettingTimeout = null;
    this.createdAt = Date.now();
  }

  async addPlayer(userId, username, betAmount) {
    if (this.state !== 'betting') return { success: false, reason: 'BETTING_CLOSED' };
    if (this.players.has(userId)) return { success: false, reason: 'ALREADY_JOINED' };

    try {
      const bal = await dbManager.getUserBalance(userId, this.guildId);
      if (!bal || bal.wallet < betAmount) {
        return { success: false, reason: 'INSUFFICIENT_FUNDS', currentBalance: bal ? bal.wallet : 0 };
      }
      const ok = await dbManager.updateUserBalance(userId, this.guildId, -betAmount, 0);
      if (!ok) return { success: false, reason: 'DEDUCTION_FAILED' };
    } catch (e) {
      logger.error(`Crash addPlayer balance error: ${e.message}`);
      return { success: false, reason: 'BALANCE_ERROR' };
    }

    this.players.set(userId, { username, bet: betAmount, cashedOut: false, winnings: 0, cashOutMultiplier: 0 });
    // Log bet deduction
    try {
      await sendLogMessage(require('..').client || null, 'game', `Crash bet placed: ${username} bet ${fmt(betAmount)}`, userId, this.guildId);
    } catch (_) {}
    return { success: true };
  }

  cashOut(userId) {
    if (this.state !== 'running') return null;
    const p = this.players.get(userId);
    if (!p || p.cashedOut) return null;
    p.cashedOut = true;
    p.cashOutMultiplier = this.currentMultiplier;
    p.winnings = Math.floor(p.bet * this.currentMultiplier);
    // Credit winnings (bet already deducted)
    dbManager.updateUserBalance(userId, this.guildId, p.winnings, 0).catch(() => {});
    
    // Export to UAS for centralized analysis
    try {
      uasDataExporter.exportGameResult({
        userId,
        guildId: this.guildId,
        gameType: 'crash',
        betAmount: p.bet,
        winnings: p.winnings,
        won: true, // They cashed out successfully
        metadata: {
          mode: this.modeKey,
          cashOutMultiplier: this.currentMultiplier,
          crashPoint: this.crashPoint,
          gameTimestamp: Date.now()
        }
      }).catch(exportError => {
        logger.debug(`Failed to export crash result to UAS: ${exportError.message}`);
      });
    } catch (_) {}
    
    try {
      sendLogMessage(require('..').client || null, 'game', `Crash cashout: ${p.username} at ${this.currentMultiplier.toFixed(2)}x -> +${fmt(p.winnings)}`, userId, this.guildId);
    } catch (_) {}
    return p.winnings;
  }

  createEmbed() {
    let title, color, description;
    if (this.state === 'betting') {
      title = `💰 ${this.ownerUsername}'s Crash - Betting`;
      color = 0x00FF00;
      const timeRemaining = 60 - Math.floor((Date.now() - this.createdAt) / 1000);
      description = `Mode: ${this.mode.name} • Min bet: ${fmt(this.mode.minBet)} • Max: ${this.mode.maxMultiplier}x\n` +
                    `⏱️ Time remaining: ${Math.max(0, timeRemaining)}s`;
    } else if (this.state === 'running') {
      title = `🚀 Crash - ${this.currentMultiplier.toFixed(2)}x`;
      color = 0xFFAA00;
      description = `Crash at: ${this.crashPoint.toFixed(2)}x`;
    } else if (this.state === 'crashed') {
      title = `💥 CRASHED at ${this.crashPoint.toFixed(2)}x!`;
      color = 0xFF0000;
      description = `Game over. Click Play Again to start a new round.`;
    } else {
      title = '🏁 Game Finished';
      color = 0x666666;
      description = 'Game ended';
    }

    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
    if (this.players.size > 0) {
      const list = Array.from(this.players.values()).map(p => `• ${p.username}: ${fmt(p.bet)} ${p.cashedOut ? `✅ ${p.cashOutMultiplier.toFixed(2)}x (+${fmt(p.winnings)})` : '⏳ Active'}`).slice(0, 10).join('\n');
      embed.addFields({ name: `Players (${this.players.size})`, value: list || 'No players', inline: false });
    }
    return embed;
  }

  createButtons() {
    const buttons = [];
    if (this.state === 'betting') {
      buttons.push(new ButtonBuilder().setCustomId('crash_join').setLabel('💰 Place Bet').setStyle(ButtonStyle.Success));
      if (this.players.size > 0) buttons.push(new ButtonBuilder().setCustomId('crash_start').setLabel(`🚀 Start (${this.players.size})`).setStyle(ButtonStyle.Primary));
    } else if (this.state === 'running') {
      buttons.push(new ButtonBuilder().setCustomId('crash_cashout').setLabel(`💸 Cash Out (${this.currentMultiplier.toFixed(2)}x)`).setStyle(ButtonStyle.Danger));
    } else if (this.state === 'crashed' || this.state === 'finished') {
      buttons.push(new ButtonBuilder().setCustomId('crash_play_again').setLabel('🎮 Play Again').setStyle(ButtonStyle.Secondary));
    }
    return buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
  }

  async startGame() {
    if (this.state !== 'betting' || this.players.size === 0) return false;
    this.state = 'running';
    this.startTime = Date.now();
    this.currentMultiplier = 1.0;
    if (this.bettingTimeout) { clearTimeout(this.bettingTimeout); this.bettingTimeout = null; }
    this.updateInterval = setInterval(async () => {
      try { await this.updateGame(); } catch (e) { logger.error(`Crash update error: ${e.message}`); await this.crashGame('error'); }
    }, 1000);
    await this.updateMessage();
    return true;
  }

  async updateGame() {
    if (this.state !== 'running') return;
    this.currentMultiplier = calcMultiplier(this.startTime, this.crashPoint);
    if (this.currentMultiplier >= this.crashPoint) {
      await this.crashGame();
      return;
    }
    // Safety timeout
    const elapsed = (Date.now() - this.startTime) / 1000;
    if (elapsed > 30) return this.crashGame('timeout');
    await this.updateMessage();
  }

  async updateMessage() {
    if (!this.gameMessage) return;
    const embed = this.createEmbed();
    await this.gameMessage.edit({ embeds: [embed], components: this.createButtons() }).catch(() => {});
  }

  async crashGame() {
    if (this.state === 'crashed') return;
    this.state = 'crashed';
    this.currentMultiplier = this.crashPoint;
    if (this.updateInterval) { clearInterval(this.updateInterval); this.updateInterval = null; }
    
    // Export losing players to UAS
    for (const [userId, p] of this.players.entries()) {
      if (!p.cashedOut) {
        try {
          uasDataExporter.exportGameResult({
            userId,
            guildId: this.guildId,
            gameType: 'crash',
            betAmount: p.bet,
            winnings: 0, // They lost
            won: false,
            metadata: {
              mode: this.modeKey,
              crashPoint: this.crashPoint,
              gameTimestamp: Date.now()
            }
          }).catch(exportError => {
            logger.debug(`Failed to export crash loss to UAS: ${exportError.message}`);
          });
        } catch (_) {}
      }
    }
    
    await this.updateMessage();
  }

  cleanup() {
    if (this.updateInterval) clearInterval(this.updateInterval);
    if (this.bettingTimeout) clearTimeout(this.bettingTimeout);
    this.updateInterval = null;
    this.bettingTimeout = null;
  }
}

class CrashManager {
  constructor() { this.games = new Map(); } // channelId -> CrashGame
  createGame(channelId, guildId, sessionId, ownerId, ownerUsername, modeKey) {
    const game = new CrashGame(channelId, guildId, ownerId, ownerUsername, modeKey);
    this.games.set(channelId, game);
    return game;
  }
  getGame(channelId) { return this.games.get(channelId) || null; }
  getAllChannelGames(channelId) { return this.getGame(channelId) ? [this.getGame(channelId)] : []; }
  removeGame(channelId) { const g = this.games.get(channelId); if (g) g.cleanup(); this.games.delete(channelId); }
  cleanup() { for (const g of this.games.values()) g.cleanup(); this.games.clear(); }
}

const crashManager = new CrashManager();

  async function handleButtonInteraction(interaction, client, game) {
  const action = interaction.customId.replace('crash_', '');
  try {
    if (action === 'join') {
      // show modal
      const modal = new ModalBuilder().setCustomId('crash_bet_modal').setTitle('💰 Place Your Bet');
      const bet = new TextInputBuilder().setCustomId('bet_amount').setLabel('Bet Amount').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(bet));
      await interaction.showModal(modal);
    } else if (action === 'start') {
      if (game.players.size === 0) return await interaction.reply({ content: '❌ No players have joined!', flags: MessageFlags.Ephemeral });
      await game.startGame();
      await interaction.deferUpdate();
    } else if (action === 'cashout') {
      const winnings = game.cashOut(interaction.user.id);
      if (winnings === null) return await interaction.reply({ content: '❌ You are not in this game or already cashed out!', flags: MessageFlags.Ephemeral });
      await interaction.reply({ content: `✅ Cashed out at ${game.currentMultiplier.toFixed(2)}x → +${fmt(winnings)}`, flags: MessageFlags.Ephemeral });
      try {
        await sendLogMessage(client, 'game', `Crash cashout: ${interaction.user.displayName} at ${game.currentMultiplier.toFixed(2)}x -> +${fmt(winnings)}`, interaction.user.id, interaction.guildId);
      } catch (_) {}
    } else if (action === 'play_again') {
      // new game in same channel
      crashManager.removeGame(interaction.channelId);
      const newGame = crashManager.createGame(interaction.channelId, interaction.guildId, null, interaction.user.id, interaction.user.displayName, game.modeKey);
      const embed = newGame.createEmbed();
      const components = newGame.createButtons();
      const msg = await interaction.reply({ embeds: [embed], components });
      const fetched = await interaction.fetchReply();
      newGame.gameMessage = fetched;
      newGame.bettingTimeout = setTimeout(async () => {
        if (newGame.state === 'betting' && newGame.players.size > 0) await newGame.startGame();
      }, 60000);
    } else {
      await interaction.reply({ content: '❌ Unknown action', flags: MessageFlags.Ephemeral });
    }
  } catch (e) {
    logger.error(`Crash button error: ${e.message}`);
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Error', flags: MessageFlags.Ephemeral });
  }
}

  async function handleModalSubmit(interaction, client, game) {
  if (interaction.customId !== 'crash_bet_modal') return;
  try {
    if (game.state !== 'betting') return await interaction.reply({ content: '❌ Betting is closed!', flags: MessageFlags.Ephemeral });
    const amtStr = interaction.fields.getTextInputValue('bet_amount');
    const parsed = parseAmount(amtStr);
    const bal = await dbManager.getUserBalance(interaction.user.id, interaction.guildId);
    if (!bal) return await interaction.reply({ content: '❌ Could not fetch balance.', flags: MessageFlags.Ephemeral });
    const bet = await resolveAmount(parsed, bal.wallet);
    if (!bet || bet < (game.mode.minBet || 1)) {
      return await interaction.reply({ content: `❌ Invalid bet. Minimum: ${fmt(game.mode.minBet)}`, flags: MessageFlags.Ephemeral });
    }
    const res = await game.addPlayer(interaction.user.id, interaction.user.displayName, bet);
    if (!res.success) {
      let msg = '❌ Cannot join game';
      if (res.reason === 'INSUFFICIENT_FUNDS') msg = `❌ Insufficient funds. You have ${fmt(res.currentBalance)}`;
      if (res.reason === 'ALREADY_JOINED') msg = '❌ You already joined this game';
      if (res.reason === 'BETTING_CLOSED') msg = '❌ Betting is closed';
      return await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }
    await game.updateMessage();
    await interaction.reply({ content: `✅ Bet placed: ${fmt(bet)}!`, flags: MessageFlags.Ephemeral });
    try {
      await sendLogMessage(client, 'game', `Crash bet placed: ${interaction.user.displayName} bet ${fmt(bet)}`, interaction.user.id, interaction.guildId);
    } catch (_) {}
  } catch (e) {
    logger.error(`Crash modal error: ${e.message}`);
    try { await interaction.reply({ content: '❌ Error placing bet.', flags: MessageFlags.Ephemeral }); } catch (_) {}
  }
}

async function handleGameExecution(interaction, client, sessionId = null, initialBetData = null) {
  const modeKey = initialBetData?.mode || 'balanced';
  const game = crashManager.createGame(interaction.channelId, interaction.guildId, sessionId, interaction.user.id, interaction.user.displayName, modeKey);
  const embed = game.createEmbed();
  const components = game.createButtons();
  await interaction.editReply({ embeds: [embed], components });
  const fetched = await interaction.fetchReply();
  game.gameMessage = fetched;
  game.bettingTimeout = setTimeout(async () => {
    if (game.state === 'betting' && game.players.size > 0) await game.startGame();
  }, 60000);
}

async function startCrashGame(interaction, selectedMode = 'balanced', betAmount = 0) {
  // Create a short session to align with existing session flow
  const session = await sessionManager.createSession({
    userId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    gameType: GameType.CRASH,
    betAmount: betAmount,
    timeout: 120000,
    metadata: { mode: selectedMode }
  });
  if (!session.success) throw new Error(`Session creation failed: ${session.error}`);
  await handleGameExecution(interaction, interaction.client, session.sessionId, { mode: selectedMode });
}

module.exports = {
  CRASH_MODES,
  crashManager,
  startCrashGame,
  handleButtonInteraction,
  handleModalSubmit,
  handleGameExecution
};
