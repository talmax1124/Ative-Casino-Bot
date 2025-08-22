// fishing.js — Discord.js v14 implementation of a Fishing economy minigame
// Tech: JavaScript (Node.js), discord.js v14, Firebase via your UTILS/database.js, Winston via UTILS/logger.js
// Placement: This file can live in COMMANDS/ as a self-contained command module. Game data persists per-user.

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { getLogger } from "../UTILS/logger.js";
import { incrementBalance, decrementBalance } from "../UTILS/database.js";
import { formatCurrency, ensureNumber } from "../UTILS/common.js";
import { secureRandomInt } from "../UTILS/rng.js";

// If you already expose helpers in database.js for arbitrary JSON blobs,
// implement these there and keep the same function signatures:
//   - getUserGameData(userId, gameKey)
//   - setUserGameData(userId, gameKey, data)
import { getUserGameData, setUserGameData } from "../UTILS/database.js";

const log = getLogger("FISHING");
const ERROR_CHANNEL_ID = "1405096821512212521"; // centralized error channel
const DEV_ID = "466050111680544798"; // owner override

function isDev(id) { return id === DEV_ID; }

async function sendError(client, msg) {
  try {
    const ch = await client.channels.fetch(ERROR_CHANNEL_ID);
    await ch?.send({ content: msg });
  } catch (e) { log.error("sendError failed: %s", e?.stack || e); }
}

// ====== Game Data Model ======
// Stored per-user under gameKey = "fishing".
// {
//   rod: { key: "basic"|"advanced"|"pro", durability: number },
//   bait: { key: "none"|"worm"|"minnow"|"lure", qty: number },
//   inv: [{ name, rarity, value, weight } ...],
//   lastCastAt: epoch_ms,
//   stats: { casts, catches, biggestWeight, totalValue },
// }

const DEFAULT_DATA = () => ({
  rod: { key: "basic", durability: 100 },
  bait: { key: "none", qty: 0 },
  inv: [],
  lastCastAt: 0,
  stats: { casts: 0, catches: 0, biggestWeight: 0, totalValue: 0 },
});

// Rods
const RODS = {
  basic:    { name: "Basic Rod",    price: 0,   maxDur: 100, repairPer: 50, repairCost: 100 },
  advanced: { name: "Advanced Rod", price: 1500, maxDur: 200, repairPer: 80, repairCost: 250 },
  pro:      { name: "Pro Rod",      price: 5000, maxDur: 350, repairPer: 120, repairCost: 600 },
};

// Bait
const BAIT = {
  none:   { name: "No Bait",   rarityBoost: 0,   price: 0 },
  worm:   { name: "Worm",       rarityBoost: 2,   price: 25 },
  minnow: { name: "Minnow",     rarityBoost: 4,   price: 60 },
  lure:   { name: "Shiny Lure", rarityBoost: 6,   price: 120 },
};

// Fish tables by rarity
const FISH_TABLE = [
  // weight in kg, value in credits
  { rarity: "common",    base: 70,  list: [
    { name: "Bluegill", value: [20, 40], weight: [0.2, 1.1] },
    { name: "Crappie", value: [20, 45], weight: [0.3, 1.4] },
    { name: "Carp", value: [15, 35], weight: [0.8, 4.0] },
    { name: "Perch", value: [22, 45], weight: [0.2, 1.2] },
  ]},
  { rarity: "uncommon", base: 22,  list: [
    { name: "Trout", value: [40, 90], weight: [0.5, 2.5] },
    { name: "Catfish", value: [45, 100], weight: [1.0, 6.0] },
    { name: "Bass", value: [50, 110], weight: [0.7, 3.5] },
  ]},
  { rarity: "rare",      base: 7,   list: [
    { name: "Salmon", value: [90, 160], weight: [1.5, 7.0] },
    { name: "Pike", value: [100, 200], weight: [2.0, 9.0] },
  ]},
  { rarity: "legendary", base: 1,   list: [
    { name: "Golden Koi", value: [450, 900], weight: [3.0, 12.0] },
    { name: "Ancient Sturgeon", value: [600, 1200], weight: [6.0, 20.0] },
  ]},
];

function weightedChoice(boost = 0) {
  const total = FISH_TABLE.reduce((acc, r) => acc + r.base, 0) + boost;
  let roll = secureRandomInt(1, total);
  for (const tier of FISH_TABLE) {
    const w = tier.base + Math.floor(boost * (tier.rarity === "legendary" ? 0.5 : tier.rarity === "rare" ? 0.35 : tier.rarity === "uncommon" ? 0.15 : 0));
    if (roll <= w) return tier;
    roll -= w;
  }
  return FISH_TABLE[0];
}

function randBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function rollFrom([a, b], digits = 2) {
  const v = randBetween(a, b);
  const m = Math.pow(10, digits);
  return Math.round(v * m) / m;
}

function catchFish(currentBaitKey = "none") {
  const boost = BAIT[currentBaitKey]?.rarityBoost || 0;
  const tier = weightedChoice(boost);
  const pool = tier.list;
  const pick = pool[secureRandomInt(0, pool.length - 1)];
  const weight = rollFrom(pick.weight, 2);
  const value = Math.floor(rollFrom(pick.value, 0));
  return { name: pick.name, rarity: tier.rarity, weight, value };
}

const COOLDOWN_MS = 15_000; // 15s per cast
const DURABILITY_LOSS = 3;  // per cast

async function withUserData(userId, mutate) {
  let data = await getUserGameData(userId, "fishing");
  if (!data) data = DEFAULT_DATA();
  const after = await mutate(data) || data;
  await setUserGameData(userId, "fishing", after);
  return after;
}

// ===== Embeds =====
function fishToLine(f) {
  const icon = f.rarity === "legendary" ? "🌟" : f.rarity === "rare" ? "💎" : f.rarity === "uncommon" ? "✨" : "🐟";
  return `${icon} **${f.name}** — ${f.weight}kg — +${formatCurrency(f.value)} (${f.rarity})`;
}

function invEmbed(user, data) {
  const value = data.inv.reduce((s, f) => s + f.value, 0);
  const lines = data.inv.slice(0, 20).map(fishToLine).join("\n") || "(empty)";
  const extra = data.inv.length > 20 ? `\n…and ${data.inv.length - 20} more` : "";
  return new EmbedBuilder()
    .setTitle(`🎣 ${user.username}'s Tackle Box`)
    .addFields(
      { name: "Rod", value: `${RODS[data.rod.key].name} — ${data.rod.durability}/${RODS[data.rod.key].maxDur} durability`, inline: false },
      { name: "Bait", value: `${BAIT[data.bait.key].name} (x${data.bait.qty})`, inline: true },
      { name: "Total Value", value: formatCurrency(value), inline: true },
    )
    .setDescription(lines + extra)
    .setColor(0x4ac1ff);
}

function statsEmbed(user, data) {
  return new EmbedBuilder()
    .setTitle(`📊 ${user.username}'s Fishing Stats`)
    .addFields(
      { name: "Casts", value: String(data.stats.casts), inline: true },
      { name: "Catches", value: String(data.stats.catches), inline: true },
      { name: "Biggest", value: `${data.stats.biggestWeight}kg`, inline: true },
      { name: "Rod", value: `${RODS[data.rod.key].name} (${data.rod.durability}/${RODS[data.rod.key].maxDur})`, inline: false },
      { name: "Bait", value: `${BAIT[data.bait.key].name} (x${data.bait.qty})`, inline: true },
    )
    .setColor(0x33e676);
}

// ===== Slash Command Definition =====
export const data = new SlashCommandBuilder()
  .setName("fishing")
  .setDescription("Go fishing for loot and sell your catch!")
  .addSubcommand(sc => sc
    .setName("cast")
    .setDescription("Cast your line and try to catch a fish!"))
  .addSubcommand(sc => sc
    .setName("inventory")
    .setDescription("View your caught fish"))
  .addSubcommand(sc => sc
    .setName("sell")
    .setDescription("Sell fish from your inventory")
    .addStringOption(o => o.setName("what").setDescription("all | common | uncommon | rare | legendary").setRequired(true)))
  .addSubcommandGroup(g => g
    .setName("rod")
    .setDescription("Manage your fishing rod")
    .addSubcommand(sc => sc.setName("buy").setDescription("Buy a new rod").addStringOption(o => o.setName("type").setDescription("basic|advanced|pro").setRequired(true)))
    .addSubcommand(sc => sc.setName("repair").setDescription("Repair your current rod"))
    .addSubcommand(sc => sc.setName("info").setDescription("Show rod info")))
  .addSubcommandGroup(g => g
    .setName("bait")
    .setDescription("Manage bait")
    .addSubcommand(sc => sc.setName("buy").setDescription("Buy bait").addStringOption(o => o.setName("type").setDescription("worm|minnow|lure").setRequired(true)).addIntegerOption(o => o.setName("qty").setDescription("Quantity").setRequired(true)))
    .addSubcommand(sc => sc.setName("equip").setDescription("Equip bait").addStringOption(o => o.setName("type").setDescription("worm|minnow|lure|none").setRequired(true)))
    .addSubcommand(sc => sc.setName("info").setDescription("Show bait info")))
  .addSubcommand(sc => sc
    .setName("stats")
    .setDescription("View your fishing stats"))
  .addSubcommand(sc => sc
    .setName("help")
    .setDescription("How to play"));

export async function execute(interaction, client) {
  try {
    const sub = interaction.options.getSubcommand(false);
    const subGroup = interaction.options.getSubcommandGroup(false);

    // ===== CAST =====
    if (sub === "cast") {
      const data = await withUserData(interaction.user.id, d => d);
      const now = Date.now();
      const cdLeft = Math.max(0, data.lastCastAt + COOLDOWN_MS - now);
      if (cdLeft > 0) {
        const secs = Math.ceil(cdLeft / 1000);
        return interaction.reply({ content: `⏳ Cooldown: **${secs}s**`, ephemeral: true });
      }

      if (data.rod.durability <= 0) {
        return interaction.reply({ content: "Your rod is broken. Repair it with **/fishing rod repair**.", ephemeral: true });
      }

      // Perform catch
      const fish = catchFish(data.bait.key);
      data.inv.push(fish);
      data.stats.casts += 1;
      data.stats.catches += 1;
      data.stats.biggestWeight = Math.max(data.stats.biggestWeight, fish.weight);
      data.stats.totalValue += fish.value;
      data.rod.durability = Math.max(0, data.rod.durability - DURABILITY_LOSS);
      data.lastCastAt = now;

      // Consume bait (25% chance to consume)
      if (data.bait.key !== "none" && data.bait.qty > 0) {
        if (Math.random() < 0.25) data.bait.qty -= 1;
        if (data.bait.qty <= 0) data.bait.key = "none";
      }

      await setUserGameData(interaction.user.id, "fishing", data);

      const icon = fish.rarity === "legendary" ? "🌟" : fish.rarity === "rare" ? "💎" : fish.rarity === "uncommon" ? "✨" : "🐟";
      const embed = new EmbedBuilder()
        .setTitle(`${icon} You caught a ${fish.name}!`)
        .setDescription(`${fish.rarity.toUpperCase()} — **${fish.weight}kg** — worth **${formatCurrency(fish.value)}**`)
        .addFields(
          { name: "Rod", value: `${RODS[data.rod.key].name} — ${data.rod.durability}/${RODS[data.rod.key].maxDur} durability`, inline: false },
          { name: "Bait", value: `${BAIT[data.bait.key].name} (x${data.bait.qty})`, inline: true },
        )
        .setColor(fish.rarity === "legendary" ? 0xffc107 : fish.rarity === "rare" ? 0x9c27b0 : fish.rarity === "uncommon" ? 0x03a9f4 : 0x4caf50);

      return interaction.reply({ embeds: [embed] });
    }

    // ===== INVENTORY =====
    if (sub === "inventory") {
      const data = await withUserData(interaction.user.id, d => d);
      return interaction.reply({ embeds: [invEmbed(interaction.user, data)], ephemeral: true });
    }

    // ===== SELL =====
    if (sub === "sell") {
      const what = interaction.options.getString("what", true).toLowerCase();
      const data = await withUserData(interaction.user.id, d => d);

      let filter;
      if (what === "all") filter = () => true;
      else if (["common","uncommon","rare","legendary"].includes(what)) filter = f => f.rarity === what;
      else return interaction.reply({ content: "Choose: all | common | uncommon | rare | legendary", ephemeral: true });

      const sellList = data.inv.filter(filter);
      if (sellList.length === 0) return interaction.reply({ content: "No fish to sell for that selection.", ephemeral: true });

      const total = sellList.reduce((s, f) => s + f.value, 0);
      data.inv = data.inv.filter(f => !filter(f));
      await setUserGameData(interaction.user.id, "fishing", data);
      await incrementBalance(interaction.user.id, total);

      return interaction.reply({ content: `🪙 Sold **${sellList.length}** fish for **${formatCurrency(total)}**.` });
    }

    // ===== ROD GROUP =====
    if (subGroup === "rod") {
      const sub2 = interaction.options.getSubcommand();
      const data = await withUserData(interaction.user.id, d => d);

      if (sub2 === "buy") {
        const type = interaction.options.getString("type", true).toLowerCase();
        if (!RODS[type]) return interaction.reply({ content: "Rod types: basic | advanced | pro", ephemeral: true });
        const rod = RODS[type];
        if (data.rod.key === type) return interaction.reply({ content: "You already have that rod equipped.", ephemeral: true });
        if (rod.price > 0) await decrementBalance(interaction.user.id, rod.price);
        data.rod = { key: type, durability: rod.maxDur };
        await setUserGameData(interaction.user.id, "fishing", data);
        return interaction.reply({ content: `Purchased **${rod.name}** for ${formatCurrency(rod.price)}.` });
      }

      if (sub2 === "repair") {
        const rod = RODS[data.rod.key];
        const need = rod.maxDur - data.rod.durability;
        if (need <= 0) return interaction.reply({ content: "Your rod is already at full durability.", ephemeral: true });
        await decrementBalance(interaction.user.id, rod.repairCost);
        data.rod.durability = Math.min(rod.maxDur, data.rod.durability + rod.repairPer);
        await setUserGameData(interaction.user.id, "fishing", data);
        return interaction.reply({ content: `🔧 Repaired **${rod.name}** (+${rod.repairPer}). Durability: ${data.rod.durability}/${rod.maxDur}. Cost: ${formatCurrency(rod.repairCost)}.` });
      }

      if (sub2 === "info") {
        const rod = RODS[data.rod.key];
        return interaction.reply({ embeds: [new EmbedBuilder()
          .setTitle("🎣 Rod Info")
          .setDescription(`${rod.name} — Durability ${data.rod.durability}/${rod.maxDur}`)
          .addFields(
            { name: "Repair", value: `+${rod.repairPer} for ${formatCurrency(rod.repairCost)}`, inline: true },
            { name: "Upgrade", value: `basic → advanced → pro`, inline: true },
          )
          .setColor(0x90caf9)
        ], ephemeral: true });
      }
    }

    // ===== BAIT GROUP =====
    if (subGroup === "bait") {
      const sub2 = interaction.options.getSubcommand();
      const data = await withUserData(interaction.user.id, d => d);

      if (sub2 === "buy") {
        const type = interaction.options.getString("type", true).toLowerCase();
        const qty = interaction.options.getInteger("qty", true);
        if (!BAIT[type] || type === "none") return interaction.reply({ content: "Bait types: worm | minnow | lure", ephemeral: true });
        const cost = BAIT[type].price * qty;
        await decrementBalance(interaction.user.id, cost);
        if (data.bait.key === type) data.bait.qty += qty; else { data.bait.key = type; data.bait.qty = (data.bait.qty || 0) + qty; }
        await setUserGameData(interaction.user.id, "fishing", data);
        return interaction.reply({ content: `Bought **${qty}× ${BAIT[type].name}** for ${formatCurrency(cost)}.` });
      }

      if (sub2 === "equip") {
        const type = interaction.options.getString("type", true).toLowerCase();
        if (!BAIT[type]) return interaction.reply({ content: "Bait types: worm | minnow | lure | none", ephemeral: true });
        if (type !== "none" && data.bait.key !== type && data.bait.qty <= 0) {
          return interaction.reply({ content: `You have no ${BAIT[type].name}. Buy some with **/fishing bait buy**.`, ephemeral: true });
        }
        data.bait.key = type;
        await setUserGameData(interaction.user.id, "fishing", data);
        return interaction.reply({ content: `Equipped **${BAIT[type].name}**.` });
      }

      if (sub2 === "info") {
        const lines = Object.entries(BAIT)
          .filter(([k]) => k !== "none")
          .map(([k, v]) => `• **${v.name}** — ${formatCurrency(v.price)} each — rarity boost +${v.rarityBoost}`)
          .join("\n");
        return interaction.reply({ embeds: [new EmbedBuilder()
          .setTitle("🪱 Bait Info")
          .setDescription(lines || "No bait types defined.")
          .addFields({ name: "Equipped", value: `${BAIT[data.bait.key].name} (x${data.bait.qty})` })
          .setColor(0xa5d6a7)
        ], ephemeral: true });
      }
    }

    // ===== STATS =====
    if (sub === "stats") {
      const data = await withUserData(interaction.user.id, d => d);
      return interaction.reply({ embeds: [statsEmbed(interaction.user, data)], ephemeral: true });
    }

    // ===== HELP =====
    if (sub === "help") {
      return interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder()
        .setTitle("📘 Fishing — Help")
        .setDescription("Cast your line, catch fish of varying rarities, then sell them for credits. Upgrade rods and equip bait to improve your odds.")
        .addFields(
          { name: "Basics", value: "/fishing cast — 15s cooldown. Each cast reduces durability. Repair via /fishing rod repair." },
          { name: "Inventory", value: "/fishing inventory — View fish. /fishing sell all|<rarity> — Sell fish for credits." },
          { name: "Gear", value: "/fishing rod buy <type> — basic|advanced|pro. /fishing bait buy|equip|info" },
          { name: "Rarities", value: "common < uncommon < rare < legendary" },
        )
        .setColor(0x64b5f6)
      ]});
    }

    // Fallback
    return interaction.reply({ content: "Unknown subcommand. Use /fishing help", ephemeral: true });

  } catch (err) {
    log.error("/fishing error: %s", err?.stack || err);
    try { await sendError(interaction.client, `[/fishing] ${err?.message || err}`); } catch {}
    if (interaction.deferred || interaction.replied) {
      return interaction.followUp({ content: "An error occurred.", ephemeral: true });
    } else {
      return interaction.reply({ content: "An error occurred.", ephemeral: true });
    }
  }
}
