// crash.js — Discord.js v14 implementation of the Crash game
// SOLO PLAY with optional multiplayer - just like crash.py
// Players can start a game, place bets, and cash out individually

const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage, parseAmount } = require('../UTILS/common');
const { buildSessionEmbed, buildButtons } = require('../UTILS/gameSessionKit');
const { CrashGraphRenderer } = require('../UTILS/crashGraphRenderer');
const GameSessionIntegrator = require('../UTILS/gameSessionIntegrator');
const logger = require('../UTILS/logger');

const log = logger;
const ERROR_CHANNEL_ID = "1405096821512212521";
const DEV_ID = "466050111680544798";

function isDev(id) { return id === DEV_ID; }
function isAdmin(member) {
  return member?.permissions?.has('Administrator') || isDev(member?.id);
}

// Crash game configuration - Fast-paced visual performance
const CRASH_CONFIG = {
  min_bet: 10.0,
  max_bet: 100000.0,
  // Faster update intervals for more exciting gameplay
  visual_update_interval: 500,   // Update image every 0.5 seconds - twice as fast!
  computation_interval: 50,      // Compute every 50ms for ultra-smooth graph
  max_multiplier: 50.0,
  house_edge: 0.03,
  // Graph settings
  graph_width: 800,
  graph_height: 400,
  max_players_display: 8
};

async function sendError(client, msg) {
  try {
    const ch = await client.channels.fetch(ERROR_CHANNEL_ID);
    await ch?.send({ content: msg });
  } catch (e) {
    log.error("sendError failed: %s", e?.stack || e);
  }
}

// ===== Crash Game State Management =====
class CrashGameState {
  constructor(channelId, guildId) {
    this.channelId = channelId;
    this.guildId = guildId;
    this.players = new Map(); // userId -> {bet, username, cashed_out, cash_out_multiplier, winnings}
    this.game_active = false;
    this.betting_phase = true;
    this.current_multiplier = 1.00;
    this.crash_point = 0.0;
    this.start_time = 0.0;
    this.crashed = false;
    this.game_message = null;
    this.compute_interval = null;
    this.visual_interval = null;
    
    // Graph renderer for visual representation
    this.graphRenderer = new CrashGraphRenderer(CRASH_CONFIG.graph_width, CRASH_CONFIG.graph_height);
    
    // Unique instance id to guard against late cleanups removing a new game
    this.instanceId = Date.now() + Math.random();
  }

  addPlayer(userId, username, betAmount) {
    if (!this.betting_phase || this.players.has(userId)) {
      return false;
    }

    this.players.set(userId, {
      bet: betAmount,
      username: username,
      cashed_out: false,
      cash_out_multiplier: 0.0,
      winnings: 0.0
    });
    return true;
  }

  cashOutPlayer(userId) {
    if (!this.players.has(userId) || this.players.get(userId).cashed_out || this.crashed) {
      return null;
    }

    const player = this.players.get(userId);
    player.cashed_out = true;
    player.cash_out_multiplier = this.current_multiplier;
    player.winnings = player.bet * this.current_multiplier;

    return player.winnings;
  }

  generateCrashPoint() {
    // More player-friendly distribution with house edge
    const rand = Math.random();

    let cp;
    if (rand < 0.08) { // 8% chance of early crash (1.01x - 1.30x)
      cp = 1.01 + Math.random() * 0.29;
    } else if (rand < 0.25) { // 17% chance of low crash (1.3x - 2.5x)
      cp = 1.3 + Math.random() * 1.2;
    } else if (rand < 0.55) { // 30% chance of medium crash (2.5x - 4.8x)
      cp = 2.5 + Math.random() * 2.3;
    } else if (rand < 0.70) { // 15% chance around 5x (4.8x - 5.5x)
      cp = 4.8 + Math.random() * 0.7;
    } else if (rand < 0.85) { // 15% chance high (5.5x - 10x)
      cp = 5.5 + Math.random() * 4.5;
    } else { // 15% chance very high (10x+)
      cp = 10.0 + Math.random() * 40.0;
    }
    // Apply mild house edge and clamp
    const edged = cp * (1.0 - CRASH_CONFIG.house_edge * (cp >= 4.5 && cp <= 5.5 ? 1.5 : 0.75));
    return Math.min(Math.max(edged, 1.01), CRASH_CONFIG.max_multiplier);
  }
}

// Game Manager
class CrashGameManager {
  constructor() {
    this.games = new Map(); // channelId -> CrashGameState
  }

  getGame(channelId, guildId) {
    if (!this.games.has(channelId)) {
      this.games.set(channelId, new CrashGameState(channelId, guildId));
    }
    return this.games.get(channelId);
  }

  // Get existing game without creating new one
  getExistingGame(channelId) {
    return this.games.get(channelId);
  }

  removeGame(channelId) {
    if (this.games.has(channelId)) {
      const game = this.games.get(channelId);
      if (game.compute_interval) {
        clearInterval(game.compute_interval);
        game.compute_interval = null;
      }
      if (game.visual_interval) {
        clearInterval(game.visual_interval);
        game.visual_interval = null;
      }
      this.games.delete(channelId);
    }
  }

  forceRemoveGame(channelId) {
    // For admin use - refund all players who haven't cashed out
    if (this.games.has(channelId)) {
      const game = this.games.get(channelId);
      // Refund logic can be added here if needed
      this.removeGame(channelId);
      return true;
    }
    return false;
  }
}

// Global game manager
const crashManager = new CrashGameManager();

// ===== Embeds & UI =====
function buildBettingEmbed(game) {
  const playerList = Array.from(game.players.values()).map(p =>
    `• **${p.username}** — ${fmt(p.bet)}`
  ).join("\n") || "No bets placed yet";

  return buildSessionEmbed({
    title: "<a:carcrash:1408536513012043847> Crash Game - Betting Phase",
    topFields: [
      {
        name: `👥 PLAYERS READY (${game.players.size})`,
        value: playerList.length > 900 ? playerList.substring(0, 900) + "..." : playerList,
        inline: false
      },
      {
        name: "❓ HOW TO PLAY",
        value: "• Place your bet before the round starts\n• Watch the multiplier increase from 1.00x\n• Cash out before it crashes!\n• If you don't cash out in time, you lose your bet",
        inline: false
      }
    ],
    bankFields: [
      {
        name: "💰 POT",
        value: game.players.size > 0
          ? fmt(Array.from(game.players.values()).reduce((sum, p) => sum + p.bet, 0))
          : fmt(0),
        inline: true
      },
      {
        name: "💡 RANGE",
        value: `${fmt(CRASH_CONFIG.min_bet)} - ${fmt(CRASH_CONFIG.max_bet)}`,
        inline: true
      }
    ],
    stageText: "PLACE YOUR BETS",
    color: 0x00ff00,
    footer: "The multiplier will rise until it crashes - cash out before it does!"
  });
}

// Visual graph-based embed builder
async function buildGameEmbed(game) {
  const mult = game.current_multiplier;
  const color = mult < 2.0 ? 0x00FF00 : mult < 5.0 ? 0xFFFF00 : 0xFF0000;

  // Generate the live graph image
  const graphBuffer = game.graphRenderer.render();

  const topFields = [];

  // Player information - kept minimal for performance
  let cashedOut = 0;
  let stillIn = 0;
  const playerSummary = [];
  
  for (const player of game.players.values()) {
    if (player.cashed_out) {
      cashedOut++;
      if (playerSummary.length < CRASH_CONFIG.max_players_display / 2) {
        playerSummary.push(`✅ ${player.username} @ x${player.cash_out_multiplier.toFixed(2)}`);
      }
    } else {
      stillIn++;
      if (playerSummary.length < CRASH_CONFIG.max_players_display / 2) {
        playerSummary.push(`🎯 ${player.username}`);
      }
    }
  }

  // Show player summary
  if (playerSummary.length > 0) {
    topFields.push({
      name: `👥 PLAYERS (${stillIn} active, ${cashedOut} cashed out)`,
      value: playerSummary.join(" • ") + (game.players.size > CRASH_CONFIG.max_players_display ? "..." : ""),
      inline: false
    });
  }

  const embed = buildSessionEmbed({
    title: "<a:carcrash:1408536513012043847> Crash Game - Live Round",
    topFields,
    bankFields: [{
      name: "🚀 MULTIPLIER",
      value: `${mult.toFixed(2)}x`,
      inline: true
    }, {
      name: "⏱️ TIME",
      value: `${((Date.now() - game.start_time) / 1000).toFixed(1)}s`,
      inline: true
    }],
    stageText: game.crashed ? "CRASHED!" : "LIVE",
    color,
    footer: "💡 Watch the graph and cash out before it crashes!"
  });

  return { embed, graphBuffer };
}

function buildResultEmbed(game) {
  const winners = Array.from(game.players.values()).filter(p => p.cashed_out);
  const losers = Array.from(game.players.values()).filter(p => !p.cashed_out);

  const winLines = winners.map(p => `${p.username} → x${p.cash_out_multiplier.toFixed(2)} (+${fmt(Math.floor(p.winnings))})`);
  const loseLines = losers.map(p => `${p.username} → (-${fmt(p.bet)})`);

  let totalWinnings = 0;
  let totalLost = 0;

  for (const winner of winners) {
    totalWinnings += winner.winnings;
  }

  for (const loser of losers) {
    totalLost += loser.bet;
  }

  const topFields = [];

  // Crash point display
  topFields.push({
    name: `💥 CRASHED AT x${game.crash_point.toFixed(2)}`,
    value: `The multiplier crashed! Game over.`,
    inline: false
  });

  // Winners section
  if (winners.length > 0) {
    topFields.push({
      name: `🏆 WINNERS (${winners.length})`,
      value: winLines.join("\n") || "None",
      inline: false
    });
  }

  // Losers section  
  if (losers.length > 0) {
    topFields.push({
      name: `😭 DIDN'T CASH OUT (${losers.length})`,
      value: loseLines.join("\n") || "None",
      inline: false
    });
  }

  // Banking summary
  const bankFields = [
    {
      name: "💰 WON",
      value: fmt(totalWinnings),
      inline: true
    },
    {
      name: "💸 LOST",
      value: fmt(totalLost),
      inline: true
    },
    {
      name: "👥 COUNT",
      value: game.players.size.toString(),
      inline: true
    }
  ];

  // Panel color: green if someone won, otherwise red
  const resultColor = winners.length > 0 ? 0x00ff66 : 0x8B0000;

  return buildSessionEmbed({
    title: "<a:carcrash:1408536513012043847> Crash Game - Round Over",
    topFields,
    bankFields,
    stageText: "CRASHED",
    color: resultColor,
    footer: "Ready for another round? Use /crash to play again!"
  });
}

function bettingButtons() {
  return buildButtons('crash', [
    { id: 'help', label: '?', style: ButtonStyle.Secondary },
    { id: 'place_bet', label: '💰 Place Bet', style: ButtonStyle.Success },
    { id: 'start_game', label: '🚀 Start Game', style: ButtonStyle.Primary }
  ]);
}

function gameButtons() {
  return buildButtons('crash', [
    { id: 'help', label: '?', style: ButtonStyle.Secondary },
    { id: 'cashout', label: '💸 Cash Out', style: ButtonStyle.Danger }
  ]);
}

// ===== Game Management Functions =====
async function handleGameExecution(interaction, client, sessionId = null) {
  try {
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;
    const userId = interaction.user.id;
    const username = interaction.user.displayName;

    // Get or create game for this channel (reset if a finished game is lingering)
    let game = crashManager.getGame(channelId, guildId);
    if (!game.game_active && (!game.betting_phase || game.crashed)) {
      // Previous game ended; clear it so a new round can start immediately
      crashManager.removeGame(channelId);
      game = crashManager.getGame(channelId, guildId);
    }
    
    // Store session ID for completion later
    if (sessionId) {
      game.sessionId = sessionId;
      game.sessionUserId = userId;
      game.sessionGuildId = guildId;
    }

    // Check if there's already an active game
    if (game.game_active || !game.betting_phase) {
      return interaction.reply({
        content: "❌ A crash game is already running in this channel. Wait for it to finish!",
        flags: MessageFlags.Ephemeral
      });
    }

    // Get the bet amount from command options (if starting fresh game)
    const betInputRaw = interaction.options.getString("minbet", true);
    const betAmount = parseAmount(betInputRaw);
    if (betAmount === null) {
      return interaction.reply({
        content: `❌ Invalid bet amount! Enter a number, or use K (thousand), M (million), B (billion) suffixes.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Validate bet amount
    if (betAmount < CRASH_CONFIG.min_bet || betAmount > CRASH_CONFIG.max_bet) {
      return interaction.reply({
        content: `❌ Bet must be between ${fmt(CRASH_CONFIG.min_bet)} and ${fmt(CRASH_CONFIG.max_bet)}! You can use K, M, B suffixes (e.g. 10k, 2.5m, 1b).`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Check user balance and deduct bet
    const userBalance = await dbManager.getUserBalance(userId, guildId);
    if (userBalance.wallet < betAmount) {
      return interaction.reply({
        content: `❌ Insufficient funds! You need ${fmt(betAmount)} but only have ${fmt(userBalance.wallet)}.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Deduct the bet
    await dbManager.updateUserBalance(userId, guildId, -betAmount, 0);

    // Add player to game
    game.addPlayer(userId, username, betAmount);

    // Send initial betting phase message
    const embed = buildBettingEmbed(game);
    const msg = await interaction.reply({
      embeds: [embed],
      components: [bettingButtons()]
    }).then(() => interaction.fetchReply());

    game.game_message = msg;

    return;

  } catch (err) {
    log.error("/crash error: %s", err?.stack || err);
    try { await sendError(interaction.client, `[/crash] ${err?.message || err}`); } catch { }
    if (interaction.deferred || interaction.replied) {
      return interaction.followUp({ content: "An error occurred.", flags: MessageFlags.Ephemeral });
    } else {
      return interaction.reply({ content: "An error occurred.", flags: MessageFlags.Ephemeral });
    }
  }
}

// Button interaction handler
async function handleButtonInteraction(interaction, game, client) {
  try {
    // Get existing game or return early if none exists
    if (!game) {
      game = crashManager.getExistingGame(interaction.channelId);
      if (!game) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: "❌ No active crash game in this channel!" });
      }
    }

    const isCurrentGameMessage = () => {
      return game && game.game_message && interaction.message && interaction.message.id === game.game_message.id;
    };
    if (interaction.customId === "crash:help") {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "🚀 **Crash Game Rules:**\n\nPlace a bet and watch the multiplier rise from x1.00! Cash out before it crashes to win bet × multiplier. If you don't cash out in time, you lose your bet.\n\n💡 **Tips:** Higher multipliers = higher risk! Cash out early for safer wins."
      });
    }

    if (interaction.customId === "crash:place_bet") {
      if (!isCurrentGameMessage()) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: "⏱️ That round has ended. Use /crash to join the current one." });
      }
      if (!game.betting_phase) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: "❌ Betting phase is over! Wait for the next round." });
      }

      // Show modal for bet amount
      const modal = new ModalBuilder()
        .setCustomId('crash_bet_modal')
        .setTitle('💰 Place Your Crash Bet');

      const betInput = new TextInputBuilder()
        .setCustomId('bet_amount')
        .setLabel('Bet Amount')
        .setStyle(TextInputStyle.Short)
        .setMinLength(1)
        .setMaxLength(20)
        .setPlaceholder('Enter amount (e.g. 1000, 5K, 2M, A, H, T)')
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(betInput);
      modal.addComponents(row);

      return interaction.showModal(modal);
    }

    if (interaction.customId === "crash:start_game") {
      if (!isCurrentGameMessage()) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: "⏱️ That round has ended. Use /crash to start or join the current one." });
      }
      if (!game.betting_phase) {
        // Component interactions should use ephemeral replies sparingly; we can ack with ephemeral
        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({ flags: MessageFlags.Ephemeral, content: "❌ Game is already starting!" });
        }
        return;
      }

      if (game.players.size === 0) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: "❌ No bets placed yet! Click 'Place Bet' first." });
      }

      // Start the game
      game.betting_phase = false;
      game.game_active = true;
      game.start_time = Date.now();
      game.crash_point = game.generateCrashPoint();
      game.crashed = false;
      game.current_multiplier = 1.00;

      // Reset graph renderer for new game
      game.graphRenderer.reset();

      // Initial update with graph
      try {
        const { embed, graphBuffer } = await buildGameEmbed(game);
        
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction.update({ 
            embeds: [embed], 
            files: [{ attachment: graphBuffer, name: 'crash-start.png' }],
            components: [gameButtons()] 
          });
          embed.setImage('attachment://crash-start.png');
        } else if (game.game_message) {
          await game.game_message.edit({ 
            embeds: [embed], 
            files: [{ attachment: graphBuffer, name: 'crash-start.png' }],
            components: [gameButtons()] 
          });
          embed.setImage('attachment://crash-start.png');
        }
      } catch (error) {
        log.error("Failed to start game with graph:", error);
        // Fallback without graph
        const simpleEmbed = buildSessionEmbed({
          title: "<a:carcrash:1408536513012043847> Crash Game - Starting...",
          topFields: [{ name: "🚀 STARTING", value: "Graph loading...", inline: false }],
          stageText: "STARTING",
          color: 0x00FF00
        });
        
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction.update({ embeds: [simpleEmbed], components: [gameButtons()] });
        } else if (game.game_message) {
          await game.game_message.edit({ embeds: [simpleEmbed], components: [gameButtons()] });
        }
      }

      // Start game loop
      await startGameLoop(game, client);
    }

    if (interaction.customId === "crash:cashout") {
      // Debug logging
      log.info(`Cash out attempt by ${interaction.user.id}: game_active=${game?.game_active}, crashed=${game?.crashed}, betting_phase=${game?.betting_phase}, has_player=${game?.players?.has(interaction.user.id)}`);
      
      // Improved game state validation
      if (!game) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: "❌ No active crash game found in this channel!" });
      }
      
      // Check if game is in active state (not betting phase, not crashed)
      if (!game.game_active || game.crashed || game.betting_phase) {
        return interaction.reply({ 
          flags: MessageFlags.Ephemeral, 
          content: `❌ No active round to cash out from! Game state: active=${game.game_active}, crashed=${game.crashed}, betting=${game.betting_phase}` 
        });
      }

      // Check if user is actually in the game
      if (!game.players.has(interaction.user.id)) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: "❌ You are not in this crash game!" });
      }

      const winnings = game.cashOutPlayer(interaction.user.id);
      if (winnings === null) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: "❌ You already cashed out or cannot cash out!" });
      }

      try {
        // Give winnings to player
        await dbManager.updateUserBalance(interaction.user.id, game.guildId, Math.floor(winnings), 0);

        const player = game.players.get(interaction.user.id);
        return interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: `✅ Cashed out at **x${player.cash_out_multiplier.toFixed(2)}** → +${fmt(Math.floor(winnings))}!`
        });
      } catch (error) {
        log.error("Cash out database error:", error);
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: "❌ Error processing cash out! Please try again." });
      }
    }

  } catch (error) {
    log.error("Button interaction error:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: "❌ An error occurred!" });
    }
  }
}

// Modal submit handler
async function handleModalSubmit(interaction, game) {
  try {
    if (interaction.customId === 'crash_bet_modal') {
      const betInputRaw = interaction.fields.getTextInputValue('bet_amount');
      const betAmount = parseAmount(betInputRaw);

      if (betAmount === null) {
        return interaction.reply({
          content: `❌ Invalid bet amount! Enter a number, or use K (thousand), M (million), B (billion) suffixes.`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Validate bet amount
      if (betAmount < CRASH_CONFIG.min_bet || betAmount > CRASH_CONFIG.max_bet) {
        return interaction.reply({
          content: `❌ Bet must be between ${fmt(CRASH_CONFIG.min_bet)} and ${fmt(CRASH_CONFIG.max_bet)}! You can use K, M, B suffixes (e.g. 10k, 2.5m, 1b).`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Check if player already has a bet
      if (game.players.has(interaction.user.id)) {
        return interaction.reply({
          content: `❌ You already have a bet placed! Wait for the next round.`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Check user balance and deduct bet
      const userBalance = await dbManager.getUserBalance(interaction.user.id, game.guildId);
      if (userBalance.wallet < betAmount) {
        return interaction.reply({
          content: `❌ Insufficient funds! You need ${fmt(betAmount)} but only have ${fmt(userBalance.wallet)}.`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Deduct the bet
      await dbManager.updateUserBalance(interaction.user.id, game.guildId, -betAmount, 0);

      // Add player to game
      const success = game.addPlayer(interaction.user.id, interaction.user.displayName, betAmount);

      if (!success) {
        // Refund if adding failed
        await dbManager.updateUserBalance(interaction.user.id, game.guildId, betAmount, 0);
        return interaction.reply({
          content: `❌ Could not place bet. Betting phase may be over.`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Update the game embed
      const embed = buildBettingEmbed(game);
      await game.game_message.edit({ embeds: [embed], components: [bettingButtons()] });

      return interaction.reply({
        content: `✅ Bet placed: ${fmt(betAmount)}! Wait for the game to start.`,
        flags: MessageFlags.Ephemeral
      });
    }
  } catch (error) {
    log.error("Modal submit error:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: "❌ An error occurred!" });
    }
  }
}

// Revolutionary visual-based game loop with smooth graph updates
async function startGameLoop(game, client) {
  let lastVisualUpdate = 0;
  let isUpdatingVisual = false;

  // Computation loop - runs fast for smooth graph data
  const computeLoop = () => {
    if (!game.game_active || game.crashed) {
      if (game.compute_interval) {
        clearInterval(game.compute_interval);
        game.compute_interval = null;
      }
      return;
    }

    const now = Date.now();
    const elapsed = (now - game.start_time) / 1000;
    
    // Calculate multiplier with faster, more exciting curve
    const calc = 1.0 + (elapsed * 0.8) + (Math.pow(elapsed, 1.6) * 0.15);
    game.current_multiplier = Math.min(calc, game.crash_point + 0.01);

    // Add point to graph renderer
    game.graphRenderer.addPoint(elapsed, game.current_multiplier);

    // Check for crash
    if (game.current_multiplier >= game.crash_point) {
      game.crashed = true;
      game.game_active = false;
      
      // Set crash point on renderer for visual effect
      game.graphRenderer.setCrash(elapsed, game.crash_point);
      
      // Clear intervals
      if (game.compute_interval) {
        clearInterval(game.compute_interval);
        game.compute_interval = null;
      }
      if (game.visual_interval) {
        clearInterval(game.visual_interval);
        game.visual_interval = null;
      }

      // Show final result immediately
      setTimeout(async () => {
        try {
          const { embed, graphBuffer } = await buildGameEmbed(game);
          await game.game_message.edit({ 
            embeds: [embed], 
            files: [{ attachment: graphBuffer, name: 'crash-final.png' }],
            components: [] 
          });
          embed.setImage('attachment://crash-final.png');
          
          // Show results after a moment
          setTimeout(async () => {
            try {
              const resultEmbed = buildResultEmbed(game);
              await game.game_message.edit({ 
                embeds: [resultEmbed], 
                files: [],
                components: [] 
              });
            } catch (error) {
              log.error("Failed to show result embed:", error);
            }
          }, 3000);
          
        } catch (error) {
          log.error("Failed to show crash result:", error);
        }

        // Complete session immediately after showing results
        setTimeout(async () => {
          // Complete session if exists
          if (game.sessionId) {
            try {
              const GameSessionIntegrator = require('../UTILS/gameSessionIntegrator');
              const winners = Array.from(game.players.values()).filter(p => p.cashed_out);
              await GameSessionIntegrator.completeGameSession(game.sessionId, {
                outcome: winners.length > 0 ? 'SOME_WINNERS' : 'ALL_LOST',
                crashPoint: game.crash_point,
                totalPlayers: game.players.size,
                winners: winners.length,
                gameCompleted: true
              });
              log.info(`Completed crash game session ${game.sessionId} with ${winners.length} winners`);
            } catch (sessionError) {
              log.error(`Failed to complete crash session: ${sessionError.message}`);
            }
          }
        }, 3500); // Complete session right after results are shown
        
        // Cleanup game instance later
        setTimeout(() => {
          const current = crashManager.games.get(game.channelId);
          if (current && current.instanceId === game.instanceId) {
            crashManager.removeGame(game.channelId);
          }
        }, 10000);
      }, 500);
    }
  };

  // Visual update loop - runs slower, updates Discord
  const visualLoop = async () => {
    if (!game.game_active || game.crashed || isUpdatingVisual) return;

    isUpdatingVisual = true;
    
    try {
      const { embed, graphBuffer } = await buildGameEmbed(game);
      
      await game.game_message.edit({ 
        embeds: [embed], 
        files: [{ attachment: graphBuffer, name: 'crash-live.png' }],
        components: [gameButtons()] 
      });
      
      embed.setImage('attachment://crash-live.png');
      
    } catch (error) {
      log.error("Visual update failed:", error);
      // Don't stop the game for visual errors
    }
    
    isUpdatingVisual = false;
  };

  // Start computation loop (fast)
  game.compute_interval = setInterval(computeLoop, CRASH_CONFIG.computation_interval);
  
  // Start visual update loop (slower)  
  game.visual_interval = setInterval(visualLoop, CRASH_CONFIG.visual_update_interval);

  // Initial visual update
  setTimeout(visualLoop, 100);
}

// Function to stop crash game for admin/dev panel
async function stopCrashGame(guildId, channelId) {
  const game = crashManager.games.get(channelId);

  if (!game) {
    return { success: false, message: 'No active crash game found in this channel.' };
  }

  // Stop the game
  game.game_active = false;
  game.crashed = true;
  if (game.update_interval) {
    clearInterval(game.update_interval);
  }

  // Hide buttons when manually stopped
  if (game.game_message) {
    try {
      const embed = buildResultEmbed(game);
      await game.game_message.edit({
        embeds: [embed],
        components: [] // Remove all buttons
      });
    } catch (error) {
      log.error("Failed to update stopped game message:", error);
    }
  }

  crashManager.removeGame(channelId);

  return {
    success: true,
    message: `Stopped crash game in channel <#${channelId}> with ${game.players.size} players.`,
    playersCount: game.players.size
  };
}

// Function to get all active crash games
function getAllActiveCrashGames() {
  const activeGames = [];
  for (const [channelId, game] of crashManager.games.entries()) {
    if (game.game_active || game.betting_phase) {
      activeGames.push({
        regKey: channelId,
        guildId: game.guildId,
        channelId: channelId,
        state: game.game_active ? 'running' : 'betting',
        playersCount: game.players.size,
        hostId: null
      });
    }
  }
  return activeGames;
}

// Export the classes and functions for use in the command file
module.exports = {
  CrashGameState,
  CrashGameManager,
  crashManager,
  handleGameExecution,
  handleButtonInteraction,
  handleModalSubmit,
  buildBettingEmbed,
  buildGameEmbed,
  buildResultEmbed,
  bettingButtons,
  gameButtons,
  stopCrashGame,
  getAllActiveCrashGames,
  startGameLoop
};
