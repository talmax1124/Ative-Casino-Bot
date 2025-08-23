/**
 * Word Chain game logic and manager
 */

const { buildSessionEmbed, buildButtons } = require('../UTILS/gameSessionKit');
const fs = require('fs');
const path = require('path');
const { fmt, getGuildId, setActiveGame, clearActiveGame } = require('../UTILS/common');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');

// ========================= WORD VALIDATION =========================

class WordValidator {
  constructor() {
    this.cache = new Map();
    // Small fallback dictionary used if API is unavailable
    this.fallback = new Set([
            'word','dog','cat','time','game','tree','house','book','river','table','chair','phone','light','music','sound','apple','orange','grape','lemon','melon','tiger','rabbit','eagle','snake','lamp','water','fire','earth','air','work','play','love','life','door','road','path','stone','storm','cloud','rain','snow','wind','bread','cheese','sugar','salt','spice','paper','glass','metal','steel'
    ]);
    this.offline = null; // Set loaded from data/*.txt
  }

  loadOffline() {
    if (this.offline) return this.offline;
    const dictDir = path.join(__dirname, '..', 'data');
    const set = new Set();
    try {
      const files = fs.readdirSync(dictDir).filter(f => f.endsWith('.txt'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(dictDir, file), 'utf8');
          for (const line of content.split(/\r?\n/)) {
            const lw = line.toLowerCase();
            if (/^[a-z]{2,}$/.test(lw)) set.add(lw);
          }
        } catch (e) {
          logger.warn(`WordChain: failed reading ${file}: ${e.message}`);
        }
      }
      this.offline = set;
      // Add simple morphology expansions for a richer vocabulary
      const expanded = this.expandMorphology(this.offline);
      this.offline = expanded;
      logger.info(`WordChain offline dictionary loaded from ${files.length} file(s): ${expanded.size} words (with morphology)`);
    } catch (e) {
      logger.warn(`WordChain: no offline dictionary found (${e.message})`);
      this.offline = new Set();
    }
    return this.offline;
  }

  /**
   * Expand dictionary with simple morphology variants (plural, 3rd person, past, ing)
   * Conservative rules to keep memory reasonable.
   */
  expandMorphology(baseSet) {
    const add = new Set(baseSet);

    const isVowel = (c) => 'aeiou'.includes(c);
    const endsWithAny = (w, arr) => arr.some(s => w.endsWith(s));

    for (const w of baseSet) {
      if (w.length < 3 || w.length > 15) continue;
      // Skip words that already look inflected
      if (/(ing|ed|ies|es|s)$/.test(w)) continue;

      const last = w[w.length - 1];
      const last2 = w[w.length - 2] || '';
      const last3 = w[w.length - 3] || '';

      // Plural / third-person singular
      if (w.endsWith('y') && !isVowel(last2)) {
        add.add(w.slice(0, -1) + 'ies');
      } else if (endsWithAny(w, ['s','x','z','ch','sh'])) {
        add.add(w + 'es');
      } else {
        add.add(w + 's');
      }

      // Past tense
      if (w.endsWith('e')) {
        add.add(w + 'd');
      } else if (!endsWithAny(w, ['w','x','y']) && !isVowel(last) && isVowel(last2) && last3 && !isVowel(last3)) {
        // CVC doubling (e.g., hop -> hopped)
        add.add(w + last + 'ed');
      } else {
        add.add(w + 'ed');
      }

      // Present participle (-ing)
      if (w.endsWith('ie')) {
        add.add(w.slice(0, -2) + 'ying');
      } else if (w.endsWith('e') && !w.endsWith('ee')) {
        add.add(w.slice(0, -1) + 'ing');
      } else if (!endsWithAny(w, ['w','x','y']) && !isVowel(last) && isVowel(last2) && last3 && !isVowel(last3)) {
        add.add(w + last + 'ing');
      } else {
        add.add(w + 'ing');
      }
    }

    return add;
  }

  async isValidWord(word) {
    const w = String(word || '').toLowerCase().trim();
    if (!/^[a-z]{2,}$/.test(w)) {
      return false;
    }
    if (this.cache.has(w)) return this.cache.get(w);

    // Load offline dictionary lazily (aggregate of all .txt files)
    if (!this.offline) this.loadOffline();

    // Prefer offline dictionary first
    if (this.offline && this.offline.size) {
      const ok = this.offline.has(w);
      this.cache.set(w, ok);
      if (ok) return true;
    }

    try {
      // Node 18+ has global fetch
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`, { method: 'GET' });
      const ok = res && res.status === 200;
      this.cache.set(w, ok);
      return ok;
    } catch (e) {
      logger.warn(`Word validation fallback for '${w}': ${e.message}`);
      const ok = this.fallback.has(w);
      this.cache.set(w, ok);
      return ok;
    }
  }
}

const wordValidator = new WordValidator();

// ========================= GAME MODEL =========================

class Player {
    constructor(user) {
        this.user = user;
        this.lives = 3;
        this.paidPot = false;
        this.isOut = false;
        this.words = [];
    }

    get statusEmoji() {
        if (this.isOut) return '💀';
        if (this.lives === 1) return '💔';
        if (this.lives === 2) return '💛';
        return '💚';
    }
}

class WordChainGame {
    constructor(channel, guildId, hostUser) {
        this.channel = channel;
        this.channelId = channel.id;
        this.guildId = guildId;
        this.host = hostUser;
        this.players = new Map(); // userId -> Player
        this.state = 'waiting'; // waiting | playing | finished
        this.potAmount = 0;
        this.potEnabled = false;
        this.livesPerPlayer = 3;
        this.turnTimeout = 30; // seconds
        this.currentWord = 'word';
        this.lastLetter = 'd';
        this.usedWords = new Set(['word']);
        this.wordChain = ['word'];
        this.currentPlayerId = null;
        this.turnTimer = null;
        this.collector = null;
        this.message = null; // game panel message

        this.addPlayer(hostUser);
    }

    addPlayer(user) {
        if (this.players.has(user.id) || this.players.size >= 10) return false;
        const p = new Player(user);
        p.lives = this.livesPerPlayer;
        this.players.set(user.id, p);
        return true;
    }

    removePlayer(userId) {
        if (!this.players.has(userId)) return false;
        if (this.state !== 'waiting') return false;
        this.players.delete(userId);
        return true;
    }

    get activePlayers() {
        return [...this.players.values()].filter(p => !p.isOut);
    }

    canStart() {
        return this.state === 'waiting' && this.players.size >= 2;
    }

    start() {
        if (!this.canStart()) return false;
        this.state = 'playing';
        this.usedWords = new Set(['word']);
        this.wordChain = ['word'];
        this.currentWord = 'word';
        this.lastLetter = 'd';
        // First player = host order join
        const first = this.activePlayers[0];
        if (first) this.currentPlayerId = first.user.id;
        return true;
    }

    nextTurn() {
        const actives = this.activePlayers;
        if (actives.length <= 1) {
            this.state = 'finished';
            return;
        }
        const idx = actives.findIndex(p => p.user.id === this.currentPlayerId);
        const nextIdx = (idx + 1) % actives.length;
        this.currentPlayerId = actives[nextIdx].user.id;
    }

    get currentPlayer() {
        return this.players.get(this.currentPlayerId) || null;
    }

    async submitWord(userId, content) {
        if (this.state !== 'playing') return { ok: false, msg: 'Game is not active.' };
        if (userId !== this.currentPlayerId) return { ok: false, msg: "It's not your turn." };
        const player = this.players.get(userId);
        if (!player || player.isOut) return { ok: false, msg: 'Player not in game.' };

        const word = String(content || '').toLowerCase().trim();
        if (!/^[a-z]{2,}$/.test(word)) {
            // Non-word -> lose a life
            player.lives -= 1;
            if (player.lives <= 0) player.isOut = true;
            this.nextTurn();
            return { ok: false, msg: 'Invalid format. Use a single English word. -1 life.' };
        }
        if (this.usedWords.has(word)) {
            player.lives -= 1;
            if (player.lives <= 0) player.isOut = true;
            this.nextTurn();
            return { ok: false, msg: 'Word already used! -1 life.' };
        }
        if (!word.startsWith(this.lastLetter)) {
            player.lives -= 1;
            if (player.lives <= 0) player.isOut = true;
            this.nextTurn();
            return { ok: false, msg: `Word must start with '${this.lastLetter.toUpperCase()}'. -1 life.` };
        }

        const valid = await wordValidator.isValidWord(word);
        if (!valid) {
            // Lose a life for invalid word
            player.lives -= 1;
            if (player.lives <= 0) player.isOut = true;
            // Move turn regardless
            this.nextTurn();
            return { ok: false, msg: 'Not a valid English word. -1 life.' };
        }

        // Accept
        this.usedWords.add(word);
        player.words.push(word);
        this.wordChain.push(word);
        this.currentWord = word;
        this.lastLetter = word[word.length - 1];

        // Move to next and possibly finish
        this.nextTurn();
        const ended = this.state === 'finished';
        return { ok: true, msg: `Accepted: ${word.toUpperCase()}`, ended };
    }

    handleTimeout() {
        if (this.state !== 'playing') return;
        const player = this.currentPlayer;
        if (!player) return;
        player.lives -= 1;
        if (player.lives <= 0) player.isOut = true;
        this.nextTurn();
    }
}

// ========================= UI HELPERS =========================

function buildGameEmbed(game) {
    const top = [];

    // Word chain display
    const recent = game.wordChain.slice(-6).map(w => w.toUpperCase()).join(' → ');
    top.push({ name: '🔗 Word Chain', value: recent || 'WORD', inline: false });

    if (game.state === 'playing') {
        const cp = game.currentPlayer;
        top.push({ name: '📝 Your Turn', value: cp ? `<@${cp.user.id}> → starts with '${game.lastLetter.toUpperCase()}'` : '—', inline: false });
    }

    // Players + lives
    const lines = [...game.players.values()].map(p => `${p.statusEmoji} ${p.user.displayName} • Lives: ${p.lives}${p.paidPot ? ' • 💰' : ''}`);
    top.push({ name: '👥 Players', value: lines.join('\n') || '—', inline: false });

    if (game.potEnabled) {
        const paidCount = [...game.players.values()].filter(p => p.paidPot).length;
        const total = game.potAmount * paidCount;
        top.push({ name: '💰 Prize Pot', value: fmt(total), inline: true });
    }

    const stage = game.state === 'waiting' ? 'LOBBY' : (game.state === 'playing' ? 'GAME' : 'FINISHED');
    const color = game.state === 'finished' ? 0xFFD700 : (game.state === 'playing' ? 0x00BFFF : 0x888888);

    return buildSessionEmbed({
        title: `🔗 ${game.host.displayName}'s Word Chain`,
        topFields: top,
        bankFields: [],
        stageText: stage,
        color,
        footer: game.state === 'waiting' ? 'Join and press Start when ready.' : (game.state === 'playing' ? `Start letter: '${game.currentWord.slice(-1).toUpperCase()}'` : 'Game over')
    });
}

function buildLobbyButtons(game) {
    const ns = `wc-${game.channelId}`;
    return buildButtons(ns, [
        { id: 'join', label: '🎮 Join', style: 1 },
        ...(game.potEnabled ? [{ id: 'pay', label: `💰 Pay ${fmt(game.potAmount)}`, style: 2 }] : []),
        { id: 'leave', label: '🚪 Leave', style: 2 },
        { id: 'start', label: '▶️ Start', style: 1 },
        { id: 'help', label: '❓ How to Play', style: 2 }
    ]);
}

module.exports = {
    WordChainGame,
    wordValidator,
    buildGameEmbed,
    buildLobbyButtons
};
