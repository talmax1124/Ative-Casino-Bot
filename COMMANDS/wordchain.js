/**
 * Word Chain game command
 */

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder } = require('discord.js');
const { fmt, getGuildId, sendLogMessage, setActiveGame, clearActiveGame } = require('../UTILS/common');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');
const GameSessionIntegrator = require('../UTILS/gameSessionIntegrator');
const levelingSystem = require('../UTILS/levelingSystem');
const { WordChainGame, buildGameEmbed, buildLobbyButtons, wordValidator } = require('../GAMES/wordchain');

// Per-channel active game registry
const activeGames = new Map(); // channelId -> { game, message, buttonCollector, msgCollector, turnTimer }

async function ensureNoActiveGame(interaction) {
    const channelId = interaction.channel.id;
    if (activeGames.has(channelId)) {
        const data = activeGames.get(channelId);
        if (data && data.game && data.game.state !== 'finished') {
            await interaction.reply({ content: '❌ A Word Chain game is already running in this channel.', flags: MessageFlags.Ephemeral });
            return false;
        }
    }
    return true;
}

async function payoutWinner(game) {
    try {
        if (!game.potEnabled) return;
        const paid = [...game.players.values()].filter(p => p.paidPot);
        if (paid.length === 0) return;
        const total = game.potAmount * paid.length;
        const winner = game.activePlayers[0];
        if (!winner) return;
        await dbManager.updateUserBalance(winner.user.id, game.guildId, total, 0);
    } catch (e) {
        logger.error(`WordChain payout error: ${e.message}`);
    }
}

async function updateTurnNotice(interaction, game) {
    const cp = game.currentPlayer;
    if (!cp) return;
    const text = `🔗 <@${cp.user.id}>, type a word starting with **${game.lastLetter.toUpperCase()}**. You have **${game.turnTimeout}s**! You have **${cp.lives}** lives left!`;
    try {
        // Post a fresh message each turn
        game.turnMessage = await interaction.channel.send({ content: text });
    } catch (e) {
        logger.warn(`WordChain turn notice failed: ${e.message}`);
    }
}

function startTurnTimer(interaction, game, updatePanel) {
    // Clear previous timers
    if (game.turnTimer) clearTimeout(game.turnTimer);
    if (game.state !== 'playing') return;

    // Mark turn start
    game.turnStart = Date.now();
    updateTurnNotice(interaction, game);

    // Hard timeout
    game.turnTimer = setTimeout(async () => {
        // Timeout -> lose life -> next turn
        game.handleTimeout();
        await updatePanel();
        if (game.state === 'finished') {
            await endGame(interaction, game, updatePanel);
            return;
        }
        startTurnTimer(interaction, game, updatePanel);
    }, game.turnTimeout * 1000);
}

async function endGame(interaction, game, updatePanel) {
    try {
        if (game.tickInterval) clearInterval(game.tickInterval);
        if (game.turnTimer) clearTimeout(game.turnTimer);
        if (game.collector) game.collector.stop('finished');
        await payoutWinner(game);
        await updatePanel();
        // Process XP and complete sessions for all participants
        for (const p of game.players.values()) {
            const won = game.activePlayers.length > 0 && game.activePlayers[0].user.id === p.user.id;
            
            // Add XP for game completion
            const xpResult = await levelingSystem.handleGameComplete(p.user.id, game.guildId, 'wordchain', won);
            
            // Check for level up
            if (xpResult && xpResult.leveledUp) {
                try {
                    const levelUpChannel = interaction.client.channels.cache.get('1411018763008217208');
                    if (levelUpChannel) {
                        const levelUpEmbed = levelingSystem.createLevelUpEmbed(p.user, xpResult.newLevel);
                        await levelUpChannel.send({ 
                            content: `<@${p.user.id}>, you are now level ${xpResult.newLevel}!`,
                            embeds: [levelUpEmbed] 
                        });
                    }
                } catch (levelError) {
                    logger.error(`Failed to send level up notification: ${levelError.message}`);
                }
            }
            
            // Complete session if exists
            if (p.sessionId) {
                await GameSessionIntegrator.completeGameSession(p.sessionId, {
                    outcome: won ? 'WON' : 'LOST',
                    payout: won ? (game.potAmount * game.players.size) : 0,
                    won: won
                });
            }
        }
        // Mark turn notice as finished
        if (game.turnMessage) {
            try { await game.turnMessage.edit({ content: '✅ Game ended.' }); } catch {}
        }
        const winner = game.activePlayers[0];
        const totalPaid = game.potEnabled ? fmt(game.potAmount * [...game.players.values()].filter(p => p.paidPot).length) : null;
        const winText = winner ? `🏆 ${winner.user} wins${totalPaid ? ` and takes ${totalPaid}!` : '!'}` : '🤝 Draw!';
        await interaction.followUp({ content: winText });
    } catch (e) {
        logger.error(`Error ending WordChain: ${e.message}`);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wordchain')
        .setDescription('Start a Word Chain game in this channel')
        .addNumberOption(o => o.setName('pot').setDescription('Optional pot amount (0 to disable)').setMinValue(0))
        .addIntegerOption(o => o.setName('lives').setDescription('Lives per player (1-10)').setMinValue(1).setMaxValue(10))
        .addIntegerOption(o => o.setName('timeout').setDescription('Seconds per turn (5-120)').setMinValue(5).setMaxValue(120)),

    async execute(interaction) {
        const ok = await ensureNoActiveGame(interaction);
        if (!ok) return;

        await interaction.deferReply();

        const userId = interaction.user.id;
        const channel = interaction.channel;
        const guildId = await getGuildId(interaction);
        const pot = interaction.options.getNumber('pot') ?? 0;
        const lives = interaction.options.getInteger('lives') ?? 3;
        const timeout = interaction.options.getInteger('timeout') ?? 30;
        
        // Modern session validation
        const sessionValidation = await GameSessionIntegrator.validateGameSession(userId, 'wordchain', guildId);
        if (!sessionValidation.valid) {
            const errorEmbed = GameSessionIntegrator.createValidationErrorEmbed(
                interaction.user.displayName, 
                'wordchain', 
                sessionValidation
            );
            return await interaction.editReply({ embeds: [errorEmbed] });
        }

        const game = new WordChainGame(channel, guildId, interaction.user);
        game.potAmount = pot;
        game.potEnabled = pot > 0;
        game.livesPerPlayer = lives;
        game.turnTimeout = timeout;
        // sync host lives
        const hostPlayer = game.players.get(interaction.user.id);
        if (hostPlayer) hostPlayer.lives = lives;

        const updatePanel = async () => {
            const embed = buildGameEmbed(game);
            const row = game.state === 'waiting' ? buildLobbyButtons(game) : null;
            if (game.message) {
                await game.message.edit({ embeds: [embed], components: row ? [row] : [] });
            }
        };

        const embed = buildGameEmbed(game);
        const row = buildLobbyButtons(game);
        const message = await interaction.editReply({ embeds: [embed], components: [row] });
        game.message = message;

        // Component collector
        const collector = message.createMessageComponentCollector({ time: 30 * 60 * 1000 });

        collector.on('collect', async (i) => {
            if (!i.customId.startsWith(`wc-${game.channelId}:`)) return;
            const action = i.customId.split(':')[1];
            if (action === 'join') {
                if (game.players.has(i.user.id)) {
                    return i.reply({ content: '❌ You are already in the game.', ephemeral: true });
                }
                if (game.addPlayer(i.user)) {
                    await i.reply({ content: '✅ Joined!', ephemeral: true });
                    await updatePanel();
                } else {
                    await i.reply({ content: '❌ Game full (max 10) or already joined.', ephemeral: true });
                }
            } else if (action === 'pay') {
                const p = game.players.get(i.user.id);
                if (!p) return i.reply({ content: '❌ Join the game first.', ephemeral: true });
                if (p.paidPot) return i.reply({ content: '❌ You already paid into the pot.', ephemeral: true });
                const bal = await dbManager.getUserBalance(i.user.id, guildId);
                if (bal.wallet < game.potAmount) {
                    return i.reply({ content: `❌ Insufficient funds. Need ${fmt(game.potAmount)}, have ${fmt(bal.wallet)}.`, ephemeral: true });
                }
                // Create session for pot players
                const sessionResult = await GameSessionIntegrator.createGameSession({
                    userId: i.user.id,
                    guildId,
                    channelId: channel.id,
                    gameType: 'wordchain',
                    betAmount: game.potAmount,
                    timeout: 1800000, // 30 minutes for WordChain
                    metadata: {
                        gamePhase: 'active',
                        multiplayer: true,
                        wordchainGame: true
                    },
                    interaction: i
                });
                
                if (!sessionResult.success) {
                    return i.reply({ content: '❌ Failed to create game session.', ephemeral: true });
                }
                
                const ok = await dbManager.updateUserBalance(i.user.id, guildId, -game.potAmount, 0);
                if (!ok) {
                    // Clean up session on payment failure
                    await GameSessionIntegrator.handleGameError(i.user.id, 'wordchain', game.potAmount, guildId, 'Payment failed');
                    return i.reply({ content: '❌ Failed to deduct pot.', ephemeral: true });
                }
                
                p.paidPot = true;
                p.sessionId = sessionResult.sessionId; // Store session ID for later completion
                await i.reply({ content: `✅ Paid ${fmt(game.potAmount)} into the pot.`, ephemeral: true });
                await updatePanel();
            } else if (action === 'leave') {
                if (!game.players.has(i.user.id)) {
                    return i.reply({ content: "❌ You're not in this game.", ephemeral: true });
                }
                if (i.user.id === game.host.id && game.players.size > 1) {
                    return i.reply({ content: '❌ Host cannot leave while others joined.', ephemeral: true });
                }
                const p = game.players.get(i.user.id);
                if (p.paidPot) await dbManager.updateUserBalance(i.user.id, guildId, game.potAmount, 0);
                if (game.removePlayer(i.user.id)) {
                    await i.reply({ content: '👋 Left the game.', ephemeral: true });
                    await updatePanel();
                } else {
                    await i.reply({ content: '❌ Cannot leave while playing.', ephemeral: true });
                }
            } else if (action === 'start') {
                if (i.user.id !== game.host.id) {
                    return i.reply({ content: '❌ Only the host can start the game.', ephemeral: true });
                }
                if (!game.start()) {
                    return i.reply({ content: '❌ Need at least 2 players to start.', ephemeral: true });
                }
                await i.reply({ content: '🔗 Game started! Type your words in chat when it is your turn.', ephemeral: false });
                await updatePanel();
                // Register active game for all participants
                for (const p of game.players.values()) setActiveGame(p.user.id, 'wordchain');

                // Start message collector for this channel
                const filter = (m) => !m.author.bot && m.channel.id === game.channelId;
                const msgCollector = interaction.channel.createMessageCollector({ filter, time: 30 * 60 * 1000 });
                game.collector = msgCollector;

                const processTurn = async () => {
                    clearTimeout(game.turnTimer);
                    startTurnTimer(interaction, game, updatePanel);
                };
                await processTurn();

                msgCollector.on('collect', async (m) => {
                    try {
                        logger.info(`WordChain: Received message "${m.content}" from ${m.author.displayName} (${m.author.id})`);
                        
                        if (game.state !== 'playing') {
                            logger.info(`WordChain: Ignoring message - game state is ${game.state}`);
                            return;
                        }
                        
                        // Only consider messages from the current player
                        if (m.author.id !== game.currentPlayerId) {
                            logger.info(`WordChain: Ignoring message - not current player (current: ${game.currentPlayerId}, sender: ${m.author.id})`);
                            return;
                        }
                        
                        logger.info(`WordChain: Processing word "${m.content}" from current player ${m.author.displayName}`);
                        
                        // Prevent race with timeout firing while processing
                        if (game.turnTimer) clearTimeout(game.turnTimer);
                        const { ok, msg, ended } = await game.submitWord(m.author.id, m.content);
                        if (ok) {
                            await m.react('✅');
                            logger.info(`WordChain: Word "${m.content}" accepted`);
                        } else {
                            await m.react('❌');
                            await m.reply({ content: msg, allowedMentions: { repliedUser: false } });
                            logger.info(`WordChain: Word "${m.content}" rejected: ${msg}`);
                        }
                        await updatePanel();
                        if (ended || game.state === 'finished') {
                            await endGame(interaction, game, updatePanel);
                            msgCollector.stop('finished');
                            return;
                        }
                        // Restart timer for next player
                        startTurnTimer(interaction, game, updatePanel);
                    } catch (e) {
                        logger.error(`WordChain message handler error: ${e.message}`);
                    }
                });

                msgCollector.on('end', async () => {
                    clearTimeout(game.turnTimer);
                });
            } else if (action === 'help') {
                const help = new EmbedBuilder()
                    .setTitle('🔗 How to Play Word Chain')
                    .setDescription('Type valid English words in this channel that start with the last letter of the previous word. Only the current player can play their turn.')
                    .addFields(
                        { name: 'Rules', value: '• No repeats\n• Valid words only\n• Turn timer applies\n• Invalid/timeout = lose a life', inline: false },
                        { name: 'Start', value: `Game begins from WORD → required letter is 'D'`, inline: false }
                    )
                    .setColor(0x00BFFF);
                await i.reply({ embeds: [help], ephemeral: true });
            }
        });

        collector.on('end', () => {
            // no-op
        });

        activeGames.set(channel.id, { game, message, buttonCollector: collector });
    },

    // Developer hook: force stop a game by user id
    async forceStop(userId) {
        for (const [channelId, ctx] of activeGames.entries()) {
            const game = ctx.game;
            if (game && game.players.has(userId)) {
                try {
                    if (game.tickInterval) clearInterval(game.tickInterval);
                    if (game.turnTimer) clearTimeout(game.turnTimer);
                    if (game.collector) game.collector.stop('dev-stop');
                    for (const p of game.players.values()) clearActiveGame(p.user.id);
                    if (game.turnMessage) {
                        try { await game.turnMessage.edit({ content: '🛑 Game stopped by developer.' }); } catch {}
                    }
                    // Update panel to finished look
                    game.state = 'finished';
                    const embed = buildGameEmbed(game);
                    if (game.message) await game.message.edit({ embeds: [embed], components: [] });
                    await game.channel.send('🛑 Word Chain game has been stopped by a developer.');
                } catch (e) {
                    logger.error(`forceStop failed: ${e.message}`);
                } finally {
                    activeGames.delete(channelId);
                }
                return true;
            }
        }
        return false;
    }
};
