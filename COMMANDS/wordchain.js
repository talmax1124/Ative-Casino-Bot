/**
 * Word Chain game command
 */

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { fmt, getGuildId, sendLogMessage, setActiveGame, clearActiveGame } = require('../UTILS/common');
const dbManager = require('../UTILS/database');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const logger = require('../UTILS/logger');
const sessionManager = require('../UTILS/sessionManager');
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
    // Payout handled via SessionManager.endSession for each participant; no direct DB credit here
    return;
}

async function updateTurnNotice(interaction, game) {
    const cp = game.currentPlayer;
    if (!cp) return;
    
    // Create button for current player to input word
    const wordButton = new ButtonBuilder()
        .setCustomId(`wc-word:${game.channelId}:${cp.user.id}`)
        .setLabel(`Type word starting with '${game.lastLetter.toUpperCase()}'`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📝');
    
    const row = new ActionRowBuilder().addComponents(wordButton);
    
    const text = `🔗 <@${cp.user.id}>, click the button below to type a word starting with **${game.lastLetter.toUpperCase()}**. You have **${game.turnTimeout}s**! You have **${cp.lives}** lives left!`;
    
    try {
        // Post a fresh message each turn with button
        game.turnMessage = await interaction.channel.send({ 
            content: text,
            components: [row]
        });
        
        // Set up button collector for turn input
        const buttonCollector = game.turnMessage.createMessageComponentCollector({ 
            filter: (i) => i.customId.startsWith(`wc-word:${game.channelId}`) && i.user.id === cp.user.id,
            time: game.turnTimeout * 1000
        });
        
        buttonCollector.on('collect', async (i) => {
            await handleWordInputModal(i, game, interaction);
        });
        
        game.turnButtonCollector = buttonCollector;
        
    } catch (e) {
        logger.warn(`WordChain turn notice failed: ${e.message}`);
    }
}

function startTurnTimer(interaction, game, updatePanel) {
    // Clear previous timers and collectors
    if (game.turnTimer) clearTimeout(game.turnTimer);
    if (game.turnButtonCollector) game.turnButtonCollector.stop();
    if (game.state !== 'playing') return;

    // Mark turn start
    game.turnStart = Date.now();
    updateTurnNotice(interaction, game);

    // Hard timeout
    game.turnTimer = setTimeout(async () => {
        // Clean up turn message and collector
        if (game.turnButtonCollector) game.turnButtonCollector.stop();
        if (game.turnMessage) {
            try {
                await game.turnMessage.edit({ 
                    content: `⏰ <@${game.currentPlayer.user.id}> timed out!`,
                    components: [] 
                });
            } catch {}
        }
        
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

async function handleWordInputModal(buttonInteraction, game, originalInteraction) {
    try {
        const modal = new ModalBuilder()
            .setCustomId(`wc-modal:${game.channelId}:${buttonInteraction.user.id}`)
            .setTitle(`Word starting with '${game.lastLetter.toUpperCase()}'`);

        const wordInput = new TextInputBuilder()
            .setCustomId('word_input')
            .setLabel(`Enter a word starting with '${game.lastLetter.toUpperCase()}'`)
            .setStyle(TextInputStyle.Short)
            .setMinLength(2)
            .setMaxLength(50)
            .setRequired(true)
            .setPlaceholder(`Word starting with '${game.lastLetter.toUpperCase()}'...`);

        const row = new ActionRowBuilder().addComponents(wordInput);
        modal.addComponents(row);

        await buttonInteraction.showModal(modal);

        // Set up modal submit handler
        const filter = (i) => i.customId === `wc-modal:${game.channelId}:${buttonInteraction.user.id}`;
        
        try {
            const modalInteraction = await buttonInteraction.awaitModalSubmit({ 
                filter, 
                time: (game.turnTimeout - 2) * 1000 // Give a bit less time than the turn timeout
            });

            const submittedWord = modalInteraction.fields.getTextInputValue('word_input').trim();
            
            logger.info(`WordChain: Received word "${submittedWord}" from ${modalInteraction.user.displayName} via modal`);

            // Clear the turn timer since we got input
            if (game.turnTimer) clearTimeout(game.turnTimer);
            if (game.turnButtonCollector) game.turnButtonCollector.stop();

            // Process the word
            const { ok, msg, ended } = await game.submitWord(modalInteraction.user.id, submittedWord);
            
            if (ok) {
                await modalInteraction.reply({ 
                    content: `✅ "${submittedWord}" accepted!`, 
                    flags: MessageFlags.Ephemeral 
                });
                
                // Update turn message to show what was submitted
                if (game.turnMessage) {
                    try {
                        await game.turnMessage.edit({
                            content: `✅ ${modalInteraction.user} said **${submittedWord}**. Next letter: **${game.lastLetter.toUpperCase()}**`,
                            components: []
                        });
                    } catch {}
                }
                
                logger.info(`WordChain: Word "${submittedWord}" accepted`);
            } else {
                await modalInteraction.reply({ 
                    content: `❌ ${msg}`, 
                    flags: MessageFlags.Ephemeral 
                });
                
                // Update turn message to show rejection
                if (game.turnMessage) {
                    try {
                        await game.turnMessage.edit({
                            content: `❌ ${modalInteraction.user} tried "${submittedWord}" but it was rejected: ${msg}`,
                            components: []
                        });
                    } catch {}
                }
                
                logger.info(`WordChain: Word "${submittedWord}" rejected: ${msg}`);
            }

            // Update the game panel
            const updatePanel = async () => {
                const embed = buildGameEmbed(game);
                const row = game.state === 'waiting' ? buildLobbyButtons(game) : null;
                if (game.message) {
                    await game.message.edit({ embeds: [embed], components: row ? [row] : [] });
                }
            };
            
            await updatePanel();

            if (ended || game.state === 'finished') {
                await endGame(originalInteraction, game, updatePanel);
                return;
            }

            // Start next turn if game continues
            if (game.state === 'playing') {
                startTurnTimer(originalInteraction, game, updatePanel);
            }

        } catch (timeoutError) {
            // Modal submission timed out
            logger.info(`WordChain: Modal submission timed out for ${buttonInteraction.user.displayName}`);
            // The turn timer will handle the timeout
        }

    } catch (error) {
        logger.error(`WordChain modal error: ${error.message}`);
        try {
            await buttonInteraction.reply({ 
                content: '❌ Error processing word input. Please try again.', 
                flags: MessageFlags.Ephemeral 
            });
        } catch {}
    }
}

async function endGame(interaction, game, updatePanel) {
    try {
        if (game.tickInterval) clearInterval(game.tickInterval);
        if (game.turnTimer) clearTimeout(game.turnTimer);
        if (game.turnButtonCollector) game.turnButtonCollector.stop();
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
                await sessionManager.endSession(p.sessionId, {
                    outcome: won ? 'WON' : 'LOST',
                    payout: won ? (game.potAmount * game.players.size) : 0,
                    won: won
                });
            }
        }
        // Clean up turn message and collector
        if (game.turnButtonCollector) game.turnButtonCollector.stop();
        if (game.turnMessage) {
            try { await game.turnMessage.edit({ content: '✅ Game ended.', components: [] }); } catch {}
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
        
        // Modern session validation (correct order/flag)
        const sessionGuard = require('../UTILS/sessionGuard');
        const check = await sessionGuard.check(userId, guildId, 'wordchain', interaction.client);
        if (!check.allowed) {
            const errorEmbed = new EmbedBuilder().setTitle("❌ Session Error").setDescription(check.message).setColor(0xFF0000);
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
                    return i.reply({ content: '❌ You are already in the game.', flags: MessageFlags.Ephemeral });
                }
                if (game.addPlayer(i.user)) {
                    await i.reply({ content: '✅ Joined!', flags: MessageFlags.Ephemeral });
                    await updatePanel();
                } else {
                    await i.reply({ content: '❌ Game full (max 10) or already joined.', flags: MessageFlags.Ephemeral });
                }
            } else if (action === 'pay') {
                const p = game.players.get(i.user.id);
                if (!p) return i.reply({ content: '❌ Join the game first.', flags: MessageFlags.Ephemeral });
                if (p.paidPot) return i.reply({ content: '❌ You already paid into the pot.', flags: MessageFlags.Ephemeral });
                // Validate and deduct pot amount using PayoutManager
                const potValidation = await PayoutManager.validateAndDeductBet(
                    i,
                    game.potAmount.toString(),
                    GameType.WORDCHAIN,
                    1, // Minimum pot amount
                    null   // No maximum pot limit
                );
                
                if (!potValidation.isValid) {
                    return i.reply({ 
                        content: `❌ ${potValidation.errorEmbed.data.description}`, 
                        flags: MessageFlags.Ephemeral 
                    });
                }
                
                // Guard + create session for pot players
                const sessionGuard = require('../UTILS/sessionGuard');
                const check = await sessionGuard.check(i.user.id, guildId, 'wordchain', i.client);
                if (!check.allowed) {
                    return i.reply({ content: `❌ ${check.message}`, flags: MessageFlags.Ephemeral });
                }
                // Create session for pot players
                const sessionResult = await sessionManager.createSession({
                    userId: i.user.id,
                    guildId,
                    channelId: channel.id,
                    gameType: 'wordchain',
                    betAmount: game.potAmount,
                    betPreDeducted: true,
                    timeout: 1800000, // 30 minutes for WordChain
                    metadata: {
                        gamePhase: 'active',
                        multiplayer: true,
                        wordchainGame: true
                    },
                    interaction: i
                });
                
                if (!sessionResult.success) {
                    // Refund the pot amount if session creation fails
                    await PayoutManager.refundBet(i.user.id, guildId, game.potAmount, 'WordChain session creation failed');
                    return i.reply({ content: '❌ Failed to create game session.', flags: MessageFlags.Ephemeral });
                }
                
                p.paidPot = true;
                p.sessionId = sessionResult.sessionId; // Store session ID for later completion
                await i.reply({ content: `✅ Paid ${fmt(game.potAmount)} into the pot.`, flags: MessageFlags.Ephemeral });
                await updatePanel();
            } else if (action === 'leave') {
                if (!game.players.has(i.user.id)) {
                    return i.reply({ content: "❌ You're not in this game.", flags: MessageFlags.Ephemeral });
                }
                if (i.user.id === game.host.id && game.players.size > 1) {
                    return i.reply({ content: '❌ Host cannot leave while others joined.', flags: MessageFlags.Ephemeral });
                }
                const p = game.players.get(i.user.id);
                if (p.paidPot) await PayoutManager.refundBet(i.user.id, guildId, game.potAmount, 'Left WordChain game');
                if (game.removePlayer(i.user.id)) {
                    await i.reply({ content: '👋 Left the game.', flags: MessageFlags.Ephemeral });
                    await updatePanel();
                } else {
                    await i.reply({ content: '❌ Cannot leave while playing.', flags: MessageFlags.Ephemeral });
                }
            } else if (action === 'start') {
                if (i.user.id !== game.host.id) {
                    return i.reply({ content: '❌ Only the host can start the game.', flags: MessageFlags.Ephemeral });
                }
                if (!game.start()) {
                    return i.reply({ content: '❌ Need at least 2 players to start.', flags: MessageFlags.Ephemeral });
                }
                await i.reply({ content: '🔗 Game started! Click the button when it\'s your turn to enter words.', flags: undefined });
                await updatePanel();
                // Register active game for all participants
                for (const p of game.players.values()) setActiveGame(p.user.id, 'wordchain');

                // Start the first turn
                const processTurn = async () => {
                    clearTimeout(game.turnTimer);
                    startTurnTimer(interaction, game, updatePanel);
                };
                await processTurn();
            } else if (action === 'help') {
                const help = new EmbedBuilder()
                    .setTitle('🔗 How to Play Word Chain')
                    .setDescription('Click the button when it\'s your turn to enter a word that starts with the last letter of the previous word.')
                    .addFields(
                        { name: 'How to Play', value: '• Wait for your turn\n• Click the button to open word input\n• Enter a valid English word\n• Submit before time runs out', inline: false },
                        { name: 'Rules', value: '• No repeats\n• Valid words only\n• Turn timer applies\n• Invalid/timeout = lose a life', inline: false },
                        { name: 'Start', value: `Game begins from WORD → required letter is 'D'`, inline: false }
                    )
                    .setColor(0x00BFFF);
                await i.reply({ embeds: [help], flags: MessageFlags.Ephemeral });
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
                    if (game.turnButtonCollector) game.turnButtonCollector.stop();
                    if (game.collector) game.collector.stop('dev-stop');
                    
                    // Complete all active sessions before clearing
                    for (const p of game.players.values()) {
                        clearActiveGame(p.user.id);
                        
                        // Complete session if exists
                        if (p.sessionId) {
                            try {
                                await sessionManager.endSession(p.sessionId, {
                                    outcome: 'CANCELLED',
                                    reason: 'Game stopped by developer',
                                    payout: 0,
                                    won: false
                                });
                                logger.info(`Completed session ${p.sessionId} for user ${p.user.id} (dev stop)`);
                            } catch (error) {
                                logger.error(`Failed to complete session ${p.sessionId} on dev stop: ${error.message}`);
                            }
                        }
                    }
                    
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
