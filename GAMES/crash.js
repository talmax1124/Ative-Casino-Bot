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
  TextInputStyle
} = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage, parseAmount } = require('../UTILS/common');
const gameSessionKit = require('../UTILS/gameSessionKit');
const logger = require('../UTILS/logger');

const log = logger;
const ERROR_CHANNEL_ID = "1405096821512212521";
const DEV_ID = "466050111680544798";

function isDev(id) { return id === DEV_ID; }
function isAdmin(member) {
  return member?.permissions?.has('Administrator') || isDev(member?.id);
}

// Crash game configuration
const CRASH_CONFIG = {
  min_bet: 10.0,
  max_bet: 100000.0,
  update_interval: 500, // 500ms updates
  max_multiplier: 50.0,
  house_edge: 0.03
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
    this.update_interval = null;
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

    if (rand < 0.08) { // 8% chance of early crash (1.0x - 1.3x)
      return 1.0 + Math.random() * 0.3;
    } else if (rand < 0.25) { // 17% chance of low crash (1.3x - 2.5x)
      return 1.3 + Math.random() * 1.2;
    } else if (rand < 0.55) { // 30% chance of medium crash (2.5x - 4.8x)
      return 2.5 + Math.random() * 2.3;
    } else if (rand < 0.70) { // 15% chance around 5x (4.8x - 5.5x)
      return 4.8 + Math.random() * 0.7;
    } else if (rand < 0.85) { // 15% chance high (5.5x - 10x)
      return 5.5 + Math.random() * 4.5;
    } else { // 15% chance very high (10x+)
      return 10.0 + Math.random() * 40.0;
    }
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

  removeGame(channelId) {
    if (this.games.has(channelId)) {
      const game = this.games.get(channelId);
      if (game.update_interval) {
        clearInterval(game.update_interval);
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

  const gameStage = `🚀 **CRASH — BETTING PHASE**`;
  const gameContent = `Place your bets! Others can join by clicking "Place Bet".\n\n**Current Bets:**\n${playerList}\n\n💡 Click "Start Game" when ready to begin!`;

  return gameSessionKit.buildSessionEmbed({
    gameStage: gameStage,
    gameContent: gameContent,
    userInfo: `${game.players.size} player${game.players.size !== 1 ? 's' : ''} betting`
  });
}

function buildGameEmbed(game) {
  const cashedOut = Array.from(game.players.values())
    .filter(p => p.cashed_out)
    .map(p => `✅ ${p.username} — ${fmt(Math.floor(p.winnings))} @ x${p.cash_out_multiplier.toFixed(2)}`)
    .slice(0, 6).join("\n") || "(none)";

  const stillIn = Array.from(game.players.values())
    .filter(p => !p.cashed_out)
    .map(p => `• ${p.username} — bet ${fmt(p.bet)}`)
    .slice(0, 6).join("\n") || "(none)";

  const gameStage = `🚀 **CRASH — LIVE**`;
  const multiplierText = `**x${game.current_multiplier.toFixed(2)}**`;

  let statusText = "💡 Cash out to secure winnings!";
  if (game.current_multiplier >= 10) statusText = "🔥 HIGH MULTIPLIER! Cash out soon? 🔥";
  else if (game.current_multiplier >= 5) statusText = "⚡ Getting risky! When will you cash out? ⚡";

  const gameContent = `## ${multiplierText}\n\n**Cashed Out:**\n${cashedOut}\n\n**Still In:**\n${stillIn}\n\n${statusText}`;

  return gameSessionKit.buildSessionEmbed({
    gameStage: gameStage,
    gameContent: gameContent,
    userInfo: `${game.players.size} players in round`
  });
}

function buildResultEmbed(game) {
  const winners = Array.from(game.players.values()).filter(p => p.cashed_out);
  const losers = Array.from(game.players.values()).filter(p => !p.cashed_out);

  const winLines = winners.map(p => `✅ **${p.username}** cashed @ x${p.cash_out_multiplier.toFixed(2)} → +${fmt(Math.floor(p.winnings))}`);
  const loseLines = losers.map(p => `❌ **${p.username}** lost ${fmt(p.bet)}`);

  const gameStage = `💥 **CRASH — ROUND OVER**`;
  const gameContent = `## **Crashed at x${game.crash_point.toFixed(2)}**\n\n**Winners:**\n${winLines.join("\n") || "(none)"}\n\n**Losers:**\n${loseLines.join("\n") || "(none)"}`;

  return gameSessionKit.buildSessionEmbed({
    gameStage: gameStage,
    gameContent: gameContent,
    userInfo: `${winners.length} winner${winners.length !== 1 ? 's' : ''}, ${losers.length} loser${losers.length !== 1 ? 's' : ''}`
  });
}

function bettingButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("crash_help").setLabel("?").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("crash_place_bet").setLabel("💰 Place Bet").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("crash_start_game").setLabel("🚀 Start Game").setStyle(ButtonStyle.Primary),
  );
}

function gameButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("crash_help").setLabel("?").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("crash_cashout").setLabel("💸 Cash Out").setStyle(ButtonStyle.Danger),
  );
}

// ===== Game Management Functions =====
async function handleGameExecution(interaction, client) {
  try {
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;
    const userId = interaction.user.id;
    const username = interaction.user.displayName;

    // Get or create game for this channel
    const game = crashManager.getGame(channelId, guildId);

    // Check if there's already an active game
    if (game.game_active || !game.betting_phase) {
      return interaction.reply({
        content: "❌ A crash game is already running in this channel. Wait for it to finish!",
        ephemeral: true
      });
    }

    // Get the bet amount from command options (if starting fresh game)
    const betInputRaw = interaction.options.getString("minbet", true);
    const betAmount = parseAmount(betInputRaw);
    if (betAmount === null) {
      return interaction.reply({
        content: `❌ Invalid bet amount! Enter a number, or use K (thousand), M (million), B (billion) suffixes.`,
        ephemeral: true
      });
    }

    // Validate bet amount
    if (betAmount < CRASH_CONFIG.min_bet || betAmount > CRASH_CONFIG.max_bet) {
      return interaction.reply({
        content: `❌ Bet must be between ${fmt(CRASH_CONFIG.min_bet)} and ${fmt(CRASH_CONFIG.max_bet)}! You can use K, M, B suffixes (e.g. 10k, 2.5m, 1b).`,
        ephemeral: true
      });
    }

    // Check user balance and deduct bet
    const userBalance = await dbManager.getUserBalance(userId, guildId);
    if (userBalance.wallet < betAmount) {
      return interaction.reply({
        content: `❌ Insufficient funds! You need ${fmt(betAmount)} but only have ${fmt(userBalance.wallet)}.`,
        ephemeral: true
      });
    }

    // Deduct the bet
    await dbManager.decrementBalance(userId, guildId, betAmount, 'wallet');

    // Add player to game
    game.addPlayer(userId, username, betAmount);

    // Send initial betting phase message
    const embed = buildBettingEmbed(game);
    const msg = await interaction.reply({
      embeds: [embed],
      components: [bettingButtons()],
      fetchReply: true
    });

    game.game_message = msg;

    // Set up button collector
    const collector = msg.createMessageComponentCollector({ time: 300000 }); // 5 minutes
    collector.on("collect", async (i) => {
      await handleButtonInteraction(i, game, client);
    });

    return;

  } catch (err) {
    log.error("/crash error: %s", err?.stack || err);
    try { await sendError(interaction.client, `[/crash] ${err?.message || err}`); } catch { }
    if (interaction.deferred || interaction.replied) {
      return interaction.followUp({ content: "An error occurred.", ephemeral: true });
    } else {
      return interaction.reply({ content: "An error occurred.", ephemeral: true });
    }
  }
}

// Button interaction handler
async function handleButtonInteraction(interaction, game, client) {
  try {
    if (interaction.customId === "crash_help") {
      return interaction.reply({
        ephemeral: true,
        content: "🚀 **Crash Game Rules:**\n\nPlace a bet and watch the multiplier rise from x1.00! Cash out before it crashes to win bet × multiplier. If you don't cash out in time, you lose your bet.\n\n💡 **Tips:** Higher multipliers = higher risk! Cash out early for safer wins."
      });
    }

    if (interaction.customId === "crash_place_bet") {
      if (!game.betting_phase) {
        return interaction.reply({ ephemeral: true, content: "❌ Betting phase is over! Wait for the next round." });
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

    if (interaction.customId === "crash_start_game") {
      if (!game.betting_phase) {
        return interaction.reply({ ephemeral: true, content: "❌ Game is already starting!" });
      }

      if (game.players.size === 0) {
        return interaction.reply({ ephemeral: true, content: "❌ No bets placed yet! Click 'Place Bet' first." });
      }

      // Start the game
      game.betting_phase = false;
      game.game_active = true;
      game.start_time = Date.now();
      game.crash_point = game.generateCrashPoint();
      game.crashed = false;
      game.current_multiplier = 1.00;

      // Update to game view
      const embed = buildGameEmbed(game);
      await interaction.update({ embeds: [embed], components: [gameButtons()] });

      // Start game loop
      await startGameLoop(game, client);
    }

    if (interaction.customId === "crash_cashout") {
      if (!game.game_active || game.crashed) {
        return interaction.reply({ ephemeral: true, content: "❌ No active round to cash out from!" });
      }

      const winnings = game.cashOutPlayer(interaction.user.id);
      if (winnings === null) {
        return interaction.reply({ ephemeral: true, content: "❌ You are not in this round or already cashed out!" });
      }

      // Give winnings to player
      await dbManager.incrementBalance(interaction.user.id, game.guildId, Math.floor(winnings), 'wallet');

      const player = game.players.get(interaction.user.id);
      return interaction.reply({
        ephemeral: true,
        content: `✅ Cashed out at **x${player.cash_out_multiplier.toFixed(2)}** → +${fmt(Math.floor(winnings))}!`
      });
    }

  } catch (error) {
    log.error("Button interaction error:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ ephemeral: true, content: "❌ An error occurred!" });
    }
  }
}

// Game loop function
async function startGameLoop(game, client) {
  game.update_interval = setInterval(async () => {
    if (!game.game_active || game.crashed) {
      clearInterval(game.update_interval);
      return;
    }

    // Calculate current multiplier based on time
    const elapsed = (Date.now() - game.start_time) / 1000; // seconds
    game.current_multiplier = 1.0 + elapsed * 0.5; // Grows by 0.5x per second

    // Check if crashed
    if (game.current_multiplier >= game.crash_point) {
      game.crashed = true;
      game.game_active = false;
      clearInterval(game.update_interval);

      // Show final results
      const embed = buildResultEmbed(game);
      try {
        await game.game_message.edit({ embeds: [embed], components: [] });
      } catch (error) {
        log.error("Failed to update crash result:", error);
      }

      // Clean up game after 30 seconds
      setTimeout(() => {
        crashManager.removeGame(game.channelId);
      }, 30000);

      return;
    }

    // Update the display
    try {
      const embed = buildGameEmbed(game);
      await game.game_message.edit({ embeds: [embed], components: [gameButtons()] });
    } catch (error) {
      // Message might be deleted, stop the game
      clearInterval(game.update_interval);
      crashManager.removeGame(game.channelId);
    }

  }, CRASH_CONFIG.update_interval);
}

// Function to stop crash game for admin/dev panel
async function stopCrashGame(guildId, channelId) {
  const game = crashManager.games.get(channelId);

  if (!game) {
    return { success: false, message: 'No active crash game found in this channel.' };
  }

  // Stop the game
  if (game.update_interval) {
    clearInterval(game.update_interval);
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
  buildBettingEmbed,
  buildGameEmbed,
  buildResultEmbed,
  bettingButtons,
  gameButtons,
  stopCrashGame,
  getAllActiveCrashGames,
  startGameLoop
};
