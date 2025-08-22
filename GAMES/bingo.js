// bingo.js — Discord.js v14 rewrite of the multiplayer BINGO game from Python
// Primary stack: JavaScript (Node.js) + discord.js v14 + canvas (for images) + Firebase (for persistence)
// Folders assumed by your project spec: COMMANDS/, GAMES/, UTILS/
// This file can live in GAMES/ as the core logic, with a thin COMMANDS/bingo.js wrapper that wires slash commands.

import {
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ComponentType,
  bold
} from "discord.js";
import { createCanvas, loadImage } from "canvas";

// ==== UTILS: adapt these imports to your actual UTILS paths ====
import { getLogger } from "../UTILS/logger.js"; // Winston logger factory
import { getDb, incrementBalance, decrementBalance, getUserBalance, setGameState, getGameState, endGamePayouts } from "../UTILS/database.js";
import { secureRandomInt } from "../UTILS/rng.js";
import { formatCurrency, ensureNumber } from "../UTILS/common.js";

const log = getLogger("BINGO");
const ERROR_CHANNEL_ID = "1405096821512212521"; // central error/log channel
const DEV_ID = "466050111680544798"; // owner override

// ==== Helpers: roles ====
function isDev(userId) {
  return userId === DEV_ID;
}

function hasAdmin(member) {
  if (!member) return false;
  if (isDev(member.id)) return true;
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

function hasMod(member) {
  if (!member) return false;
  if (hasAdmin(member)) return true;
  // Customize with a specific mod role name/id if desired
  return member.roles.cache.some(r => /mod|moderator/i.test(r.name));
}

async function sendLog(channelOrClient, message) {
  try {
    const channel = typeof channelOrClient.send === "function"
      ? channelOrClient
      : await channelOrClient.channels.fetch(ERROR_CHANNEL_ID);
    if (channel) await channel.send({ content: message });
  } catch (e) {
    log.error("Failed to send log: %s", e?.stack || e);
  }
}

// ==== BINGO constants ====
const BINGO_COLUMNS = [
  { key: "B", min: 1, max: 15 },
  { key: "I", min: 16, max: 30 },
  { key: "N", min: 31, max: 45 },
  { key: "G", min: 46, max: 60 },
  { key: "O", min: 61, max: 75 },
];

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function generateCard() {
  // 5x5 grid; free center (row 2, col 2)
  const grid = Array.from({ length: 5 }, () => Array(5).fill(null));
  for (let col = 0; col < 5; col++) {
    const { min, max } = BINGO_COLUMNS[col];
    const nums = [];
    for (let n = min; n <= max; n++) nums.push(n);
    shuffle(nums);
    for (let row = 0; row < 5; row++) {
      if (row === 2 && col === 2) {
        grid[row][col] = "FREE"; // center free
      } else {
        grid[row][col] = nums[row];
      }
    }
  }
  return grid;
}

function hasBingo(marked) {
  // marked: Set of keys like `r{row}c{col}` or special "FREE"
  const at = (r, c) => (r === 2 && c === 2) || marked.has(`r${r}c${c}`);

  // rows
  for (let r = 0; r < 5; r++) {
    if (at(r, 0) && at(r, 1) && at(r, 2) && at(r, 3) && at(r, 4)) return true;
  }
  // cols
  for (let c = 0; c < 5; c++) {
    if (at(0, c) && at(1, c) && at(2, c) && at(3, c) && at(4, c)) return true;
  }
  // diagonals
  if (at(0, 0) && at(1, 1) && at(2, 2) && at(3, 3) && at(4, 4)) return true;
  if (at(0, 4) && at(1, 3) && at(2, 2) && at(3, 1) && at(4, 0)) return true;

  return false;
}

function buildCalledDeck() {
  const nums = [];
  for (let i = 1; i <= 75; i++) nums.push(i);
  return shuffle(nums);
}

// ==== Rendering ====
async function renderCard({ grid, marked }) {
  const cell = 96; // px
  const pad = 32;
  const w = pad * 2 + cell * 5;
  const h = pad * 2 + cell * 6; // extra header row for B I N G O
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");

  // background
  ctx.fillStyle = "#0c1222"; // deep casino navy
  ctx.fillRect(0, 0, w, h);

  // header
  const letters = ["B", "I", "N", "G", "O"];
  ctx.font = "bold 64px Poppins, Arial";
  ctx.fillStyle = "#ffd54a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let c = 0; c < 5; c++) {
    const x = pad + cell * c + cell / 2;
    const y = pad + cell / 2;
    ctx.fillText(letters[c], x, y);
  }

  // grid
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const x = pad + cell * c;
      const y = pad + cell + cell * r;
      ctx.strokeRect(x, y, cell, cell);

      const v = grid[r][c];
      ctx.font = v === "FREE" ? "bold 28px Poppins, Arial" : "bold 32px Poppins, Arial";
      ctx.fillStyle = "#e6eefc";
      ctx.fillText(v === "FREE" ? "FREE" : String(v), x + cell / 2, y + cell / 2);

      const isMarked = (r === 2 && c === 2) || marked.has(`r${r}c${c}`);
      if (isMarked) {
        // chip
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, 28, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 86, 82, 0.85)"; // red chip
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      }
    }
  }

  return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "bingo_card.png" });
}

// ==== Game Model ====
class BingoPlayer {
  constructor(user) {
    this.userId = user.id;
    this.username = user.username;
    this.grid = generateCard();
    this.marked = new Set(); // keys like r{row}c{col}
    // center free
    this.marked.add("r2c2");
  }

  canMark(number) {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (this.grid[r][c] === number) return { r, c };
      }
    }
    return null;
  }

  mark(number) {
    const hit = this.canMark(number);
    if (!hit) return false;
    const key = `r${hit.r}c${hit.c}`;
    this.marked.add(key);
    return true;
  }

  isWinner() {
    return hasBingo(this.marked);
  }
}

class BingoGame {
  constructor({ guildId, channelId, hostId, bet, intervalSec = 10 }) {
    this.guildId = guildId;
    this.channelId = channelId;
    this.hostId = hostId;
    this.bet = ensureNumber(bet);
    this.intervalSec = intervalSec;

    this.players = new Map(); // userId -> BingoPlayer
    this.called = new Set();
    this.deck = buildCalledDeck();
    this.timer = null;
    this.active = true;
    this.pot = 0;
  }

  async addPlayer(user, client) {
    if (this.players.has(user.id)) return false;

    // take bet
    await decrementBalance(user.id, this.bet).catch(async (e) => {
      await sendLog(client, `BINGO bet failed for <@${user.id}>: ${e}`);
      throw e;
    });
    this.pot += this.bet;

    const p = new BingoPlayer(user);
    this.players.set(user.id, p);
    return true;
  }

  nextNumber() {
    while (this.deck.length) {
      const n = this.deck.pop();
      if (!this.called.has(n)) {
        this.called.add(n);
        return n;
      }
    }
    return null; // exhausted
  }

  async payoutWinners(client, winners) {
    if (!winners.length) return;
    const prize = Math.floor(this.pot / winners.length);
    for (const w of winners) {
      await incrementBalance(w.userId, prize).catch(async (e) => {
        await sendLog(client, `Payout failed for <@${w.userId}>: ${e}`);
      });
    }
    this.active = false;
  }
}

// Registry by guild/channel so multiple games can exist in parallel
const registry = new Map(); // key `${guildId}:${channelId}` -> BingoGame
function keyOf(guildId, channelId) { return `${guildId}:${channelId}`; }

// ==== Slash Commands (wrap as COMMANDS/bingo.js if you split) ====
export const data = new SlashCommandBuilder()
  .setName("bingo")
  .setDescription("Play Multiplayer BINGO")
  .addSubcommand(sc => sc
    .setName("start")
    .setDescription("Start a new Bingo game")
    .addIntegerOption(o => o.setName("bet").setDescription("Bet amount").setRequired(true))
    .addIntegerOption(o => o.setName("interval").setDescription("Seconds between calls (default 10)")))
  .addSubcommand(sc => sc
    .setName("join")
    .setDescription("Join the active Bingo game"))
  .addSubcommand(sc => sc
    .setName("card")
    .setDescription("Show your Bingo card"))
  .addSubcommand(sc => sc
    .setName("call")
    .setDescription("Call next number (admin/dev only)"))
  .addSubcommand(sc => sc
    .setName("stop")
    .setDescription("Stop the current Bingo game (admin/dev only)"))
  .addSubcommand(sc => sc
    .setName("status")
    .setDescription("Show current game status"));

export async function execute(interaction, client) {
  try {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;
    const regKey = keyOf(guildId, channelId);
    let game = registry.get(regKey);

    if (sub === "start") {
      const bet = interaction.options.getInteger("bet", true);
      const interval = interaction.options.getInteger("interval") || 10;

      if (game && game.active) {
        return interaction.reply({ content: "A Bingo game is already running in this channel.", ephemeral: true });
      }

      game = new BingoGame({ guildId, channelId, hostId: interaction.user.id, bet, intervalSec: interval });
      registry.set(regKey, game);

      // Host auto-joins and pays bet
      await game.addPlayer(interaction.user, client);

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle("🎉 BINGO Started!")
          .setDescription(`Bet: **${formatCurrency(bet)}**\nInterval: **${interval}s**\nUse **/bingo join** to enter.\nUse **/bingo card** to see your card.`)
          .setColor(0xffd54a)
        ]
      });

      // Start auto-caller
      game.timer = setInterval(async () => {
        if (!game.active) return clearInterval(game.timer);
        const n = game.nextNumber();
        if (n == null) {
          clearInterval(game.timer);
          await interaction.followUp({ content: "All numbers have been called. Game over." });
          game.active = false;
          return;
        }
        const col = BINGO_COLUMNS.find(c => n >= c.min && n <= c.max).key;
        await interaction.followUp({ content: `**${col}-${n}**` });
      }, game.intervalSec * 1000);

      return;
    }

    if (!game || !game.active) {
      return interaction.reply({ content: "No active Bingo game in this channel. Use /bingo start.", ephemeral: true });
    }

    if (sub === "join") {
      if (game.players.has(interaction.user.id)) {
        return interaction.reply({ content: "You are already in this game.", ephemeral: true });
      }
      await game.addPlayer(interaction.user, client);
      return interaction.reply({ content: `You joined the game! Current pot: **${formatCurrency(game.pot)}**`, ephemeral: true });
    }

    if (sub === "card") {
      const player = game.players.get(interaction.user.id);
      if (!player) return interaction.reply({ content: "Join first with /bingo join.", ephemeral: true });
      const file = await renderCard({ grid: player.grid, marked: player.marked });
      return interaction.reply({ files: [file], ephemeral: true });
    }

    if (sub === "call") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!(isDev(interaction.user.id) || hasAdmin(member) || hasMod(member))) {
        return interaction.reply({ content: "Only admins/mods/dev can call numbers manually.", ephemeral: true });
      }
      const n = game.nextNumber();
      if (n == null) return interaction.reply({ content: "Deck exhausted.", ephemeral: true });
      const col = BINGO_COLUMNS.find(c => n >= c.min && n <= c.max).key;
      return interaction.reply({ content: `**${col}-${n}**` });
    }

    if (sub === "status") {
      const calledList = Array.from(game.called).sort((a,b)=>a-b).map(n => {
        const c = BINGO_COLUMNS.find(x => n >= x.min && n <= x.max).key;
        return `${c}${n}`;
      }).join(", ");
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle("BINGO Status")
          .addFields(
            { name: "Players", value: String(game.players.size), inline: true },
            { name: "Pot", value: formatCurrency(game.pot), inline: true },
            { name: "Called", value: calledList || "(none)", inline: false },
          )
          .setColor(0x4ad6ff)
        ]
      });
    }

    if (sub === "stop") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!(isDev(interaction.user.id) || hasAdmin(member))) {
        return interaction.reply({ content: "Only admins/dev can stop a game.", ephemeral: true });
      }
      game.active = false;
      if (game.timer) clearInterval(game.timer);
      return interaction.reply({ content: "Game stopped." });
    }

  } catch (err) {
    log.error("/bingo error: %s", err?.stack || err);
    try { await sendLog(interaction.client, `[/bingo] ${err?.message || err}`); } catch {}
    if (interaction.deferred || interaction.replied) {
      return interaction.followUp({ content: "An error occurred.", ephemeral: true });
    } else {
      return interaction.reply({ content: "An error occurred.", ephemeral: true });
    }
  }
}

// OPTIONAL: If you wire commands via a loader, export { data, execute } from COMMANDS/bingo.js
// If you prefer keeping this in GAMES/, then make a thin wrapper command file to import and re-export these.