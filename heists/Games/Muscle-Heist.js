/**
 * Muscle Heist Game - 4-stage brute force mini-game for heists
 * 
 * GAME RULES:
 * - Stage 1: Strength Roll (d100 + team support bonuses)
 * - Stage 2: Button Mashing (spam 💪 emojis)
 * - Stage 3: Push Challenge (collaborative button spamming)
 * - Stage 4: Guard Showdown (quick draw reaction test)
 * 
 * PROGRESSION:
 * Multi-player cooperative game with 4 sequential stages
 * Team must pass all stages to complete the heist
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { secureRandomInt } = require('../../UTILS/rng');
const logger = require('../../UTILS/logger');

class MuscleHeistGame {
    constructor(config) {
        this.userId = config.userId;
        this.username = config.username;
        this.channelId = config.channelId;
        this.guildId = config.guildId;
        
        // Game configuration
        this.JOIN_WINDOW = 20;
        this.SUPPORT_BONUS_PER = 5;
        this.SUPPORT_BONUS_CAP = 25;
        this.BUTTON_MASH_SECONDS = 5;
        this.PUSH_TIME_BASE = 12;
        this.PUSH_TIME_PER_PLAYER = 2;
        this.PUSH_TARGET_BASE = 60;
        this.DRAW_DELAY_MIN = 2;
        this.DRAW_DELAY_MAX = 5;
        
        // Game state
        this.active = true;
        this.started = false;
        this.leaderId = this.userId;
        this.target = 50; // Default target, will be set dynamically
        this.players = [this.userId];
        this.supporters = new Set();
        this.messages = {};
        this.client = null;
        this.channel = null;
    }

    mention(id) {
        return `<@${id}>`;
    }

    progressBar(current, total, width = 26) {
        const t = Math.max(1, total);
        const ratio = Math.max(0, Math.min(1, current / t));
        const filled = Math.round(ratio * width);
        return `[${'█'.repeat(filled)}${' '.repeat(width - filled)}] ${Math.floor(ratio * 100)}%`;
    }

    wait(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    /**
     * Start the muscle heist game
     */
    async start(interaction) {
        this.client = interaction.client;
        this.channel = interaction.channel;
        
        // Set a default target for the game (can be randomized)
        this.target = secureRandomInt(30, 81); // Random target between 30-80
        
        logger.info(`Muscle Heist started by ${this.username} (${this.userId}) with target ${this.target}`);

        // LOBBY
        const joinRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('join_heist')
                .setStyle(ButtonStyle.Success)
                .setLabel('Join Heist')
                .setEmoji('🧑‍🤝‍🧑')
        );

        const lobbyEmbed = new EmbedBuilder()
            .setTitle('💪 MUSCLE HEIST LOBBY')
            .setColor(0xFFA500)
            .setDescription('A 4-stage brute force heist requiring teamwork and quick reflexes!')
            .addFields(
                { name: 'Leader', value: this.mention(this.leaderId), inline: true },
                { name: 'Target (Stage 1)', value: `${this.target} (d100, support bonus possible)`, inline: true },
                { name: 'Players', value: `${this.players.length}/6 players`, inline: true }
            )
            .setFooter({ text: `Join window: ${this.JOIN_WINDOW}s` });

        await interaction.editReply({ embeds: [lobbyEmbed], components: [joinRow] });
        const lobbyMsg = await interaction.fetchReply();
        this.messages.lobby = lobbyMsg;

        const joinCollector = lobbyMsg.createMessageComponentCollector({ time: this.JOIN_WINDOW * 1000 });
        joinCollector.on('collect', async (i) => {
            if (i.customId !== 'join_heist') return;
            if (this.players.includes(i.user.id)) {
                return i.reply({ content: 'You are already in the heist!', ephemeral: true });
            }
            if (this.players.length >= 6) {
                return i.reply({ content: 'Heist is full! (6 players max)', ephemeral: true });
            }
            this.players.push(i.user.id);
            await i.reply({ content: `${i.user} joined! (${this.players.length} players)`, ephemeral: true });
        });

        joinCollector.on('end', async () => {
            this.started = true;
            await lobbyMsg.edit({ components: [] });
            await interaction.followUp(
                `🔒 Lobby closed. Players (${this.players.length}): ${this.players.map(id => this.mention(id)).join(', ')}`
            );

            // STAGE 1
            await this.stage1_StrengthRoll();
        });
    }

    async stage1_StrengthRoll() {
        if (!this.active) return;

        const supportRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('support_leader')
                .setStyle(ButtonStyle.Primary)
                .setLabel('Support the Leader (+5)')
                .setEmoji('💪')
        );

        const embed = new EmbedBuilder()
            .setTitle('🟡 Stage 1 – Strength Roll (d100)')
            .setColor(0xFFD700)
            .setDescription(
                `Leader: ${this.mention(this.leaderId)}\n` +
                `Target: **${this.target}**\n` +
                `Press **Support** for +${this.SUPPORT_BONUS_PER} (max +${this.SUPPORT_BONUS_CAP}). **10s** window!`
            );

        const msg = await this.channel.send({ embeds: [embed], components: [supportRow] });
        this.messages.stage1 = msg;

        const collector = msg.createMessageComponentCollector({ time: 10_000 });
        collector.on('collect', async (i) => {
            if (i.customId !== 'support_leader') return;
            if (!this.players.includes(i.user.id)) {
                return i.reply({ content: 'Only heist players can support.', ephemeral: true });
            }
            if (i.user.id === this.leaderId) {
                return i.reply({ content: 'Leader cannot support themselves.', ephemeral: true });
            }
            if (this.supporters.has(i.user.id)) {
                return i.reply({ content: 'You already supported.', ephemeral: true });
            }
            this.supporters.add(i.user.id);
            const bonus = Math.min(this.SUPPORT_BONUS_CAP, this.SUPPORT_BONUS_PER * this.supporters.size);
            await i.reply({ content: `Support counted! Current bonus: **+${bonus}**`, ephemeral: true });
        });

        collector.on('end', async () => {
            await msg.edit({ components: [] });

            const bonus = Math.min(this.SUPPORT_BONUS_CAP, this.SUPPORT_BONUS_PER * this.supporters.size);
            const roll = secureRandomInt(1, 101); // 1..100
            const total = roll + bonus;
            const success = total >= this.target;

            await this.channel.send(`🎲 Roll: **${roll}** | Bonus: **+${bonus}** | Total: **${total}** → ${success ? '✅ **SUCCESS!**' : '❌ **FAIL!**'}`);

            if (!success) {
                await this.channel.send('💥 Heist failed at Stage 1! The security was too strong.');
                this.active = false;
                return;
            }
            await this.stage2_ButtonMashing();
        });
    }

    async stage2_ButtonMashing() {
        if (!this.active) return;

        const embed = new EmbedBuilder()
            .setTitle('🟡 Stage 2 – Button Mashing')
            .setColor(0xFFD700)
            .setDescription(`**Type "💪" as many times as you can in ${this.BUTTON_MASH_SECONDS}s!** Messages containing the emoji are counted.`);

        const msg = await this.channel.send({ embeds: [embed] });
        this.messages.stage2 = msg;

        const counts = new Map();
        this.players.forEach((id) => counts.set(id, 0));

        const collector = this.channel.createMessageCollector({
            time: this.BUTTON_MASH_SECONDS * 1000,
            filter: (m) => !m.author.bot && this.players.includes(m.author.id) && m.content.includes('💪'),
        });

        await this.channel.send('🚨 **GO!**');
        collector.on('collect', (m) => {
            const found = (m.content.match(/💪/g) || []).length;
            counts.set(m.author.id, (counts.get(m.author.id) || 0) + found);
        });

        collector.on('end', async () => {
            await this.channel.send('⏰ **STOP!**');

            if ([...counts.values()].every((v) => v === 0)) {
                await this.channel.send('💥 Nobody sent 💪 — heist fails here!');
                this.active = false;
                return;
            }

            const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
            const [winnerId, winCount] = sorted[0];
            const scoreboard = sorted.map(([uid, c]) => `${this.mention(uid)}: **${c}**`).join('\n');

            await this.channel.send(`🏆 Winner: ${this.mention(winnerId)} with **${winCount}**\n\n**Scoreboard:**\n${scoreboard}`);

            await this.stage3_PushChallenge();
        });
    }

    async stage3_PushChallenge() {
        if (!this.active) return;

        const playerCount = Math.max(1, this.players.length);
        const pushTime = this.PUSH_TIME_BASE + Math.max(0, playerCount - 1) * this.PUSH_TIME_PER_PLAYER;
        const pushTarget = Math.floor(this.PUSH_TARGET_BASE * (1 + (playerCount - 1) * 0.25));
        let current = 0;

        const pushRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('push_bar')
                .setStyle(ButtonStyle.Danger)
                .setLabel('PUSH!')
                .setEmoji('🏋️')
        );

        const makeEmbed = () =>
            new EmbedBuilder()
                .setTitle('🟡 Stage 3 – Push Challenge')
                .setColor(0xFFD700)
                .setDescription(
                    `Spam **PUSH!** to fill the bar before time runs out.\n` +
                    `Time: **${pushTime}s** – Target: **${pushTarget}** points\n\n` +
                    `${this.progressBar(current, pushTarget)}\nPoints: **${current}/${pushTarget}**`
                );

        const msg = await this.channel.send({ embeds: [makeEmbed()], components: [pushRow] });
        this.messages.stage3 = msg;

        const btnCollector = msg.createMessageComponentCollector({ time: pushTime * 1000 });
        btnCollector.on('collect', async (i) => {
            if (i.customId !== 'push_bar') return;
            if (!this.players.includes(i.user.id)) {
                return i.reply({ content: 'Only heist players can PUSH!', ephemeral: true });
            }
            current += 1;
            await i.deferUpdate();
        });

        const updater = setInterval(() => {
            msg.edit({ embeds: [makeEmbed()], components: [pushRow] }).catch(() => {});
            if (current >= pushTarget) {
                clearInterval(updater);
                btnCollector.stop('filled');
            }
        }, 400);

        btnCollector.on('end', async () => {
            clearInterval(updater);
            await msg.edit({ components: [] });

            if (current < pushTarget) {
                await this.channel.send('💥 Time is up — bar not full! Heist failed.');
                this.active = false;
                return;
            }
            await this.channel.send('✅ Stage 3 passed!');
            await this.stage4_GuardShowdown();
        });
    }

    async stage4_GuardShowdown() {
        if (!this.active) return;

        const embed = new EmbedBuilder()
            .setTitle('🟡 Stage 4 – Guard Showdown')
            .setColor(0xFFD700)
            .setDescription('Wait for **DRAW**… once it appears, the **first** player to type `HIT` wins. Too early = fail.');

        await this.channel.send({ embeds: [embed] });

        const delay = secureRandomInt(this.DRAW_DELAY_MIN, this.DRAW_DELAY_MAX + 1);
        await this.wait(delay * 1000);
        await this.channel.send('🔫 **DRAW!** (type `HIT`)');
        const drawTime = Date.now();

        let winner = null;
        const collector = this.channel.createMessageCollector({
            time: 4_000,
            filter: (m) =>
                !m.author.bot &&
                this.players.includes(m.author.id) &&
                m.content.trim().toLowerCase() === 'hit',
        });

        collector.on('collect', (m) => {
            if (winner) return;
            // Must come after the DRAW
            if (m.createdTimestamp >= drawTime) {
                winner = m.author.id;
                collector.stop('winner');
            }
        });

        collector.on('end', async () => {
            if (!winner) {
                await this.channel.send('💥 Nobody typed `HIT` in time — heist narrowly failed!');
                this.active = false;
                return;
            }
            
            const successEmbed = new EmbedBuilder()
                .setTitle('🎉 MUSCLE HEIST COMPLETE!')
                .setColor(0x00FF00)
                .setDescription(`All stages cleared through brute force and teamwork!`)
                .addFields(
                    { name: '🏆 Showdown Winner', value: this.mention(winner), inline: true },
                    { name: '👥 Team Members', value: this.players.map(id => this.mention(id)).join(', '), inline: false }
                );
                
            await this.channel.send({ embeds: [successEmbed] });
            this.active = false;
            
            logger.info(`Muscle Heist completed by team: ${this.players.join(', ')}`);
        });
    }
}

module.exports = MuscleHeistGame;
