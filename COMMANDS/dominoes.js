/**
 * Simple Domino Game Command
 * Traditional domino gameplay with simple, clear interface
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { fmt, parseAmount, getGuildId } = require('../UTILS/common');
const { 
    createDominoGame, 
    getDominoGame, 
    removeDominoGame, 
    getActiveGamesForChannel 
} = require('../GAMES/dominoes');
const fixedDominoRenderer = require('../UTILS/fixedDominoRenderer');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');

const MIN_BET = 500;
const MAX_BET = 100000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dominoes')
        .setDescription('Play traditional Puerto Rican dominoes')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Bet amount (supports 1k, 2.5m, 1b, all, half) - Leave empty for no bet')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('players')
                .setDescription('Number of players (2-4)')
                .setRequired(false)
                .setMinValue(2)
                .setMaxValue(4)
        ),

    async execute(interaction) {
        await interaction.deferReply();
        
        const userId = interaction.user.id;
        const channelId = interaction.channelId;
        const guildId = await getGuildId(interaction);
        const username = interaction.user.displayName;
        const betAmountStr = interaction.options.getString('amount');
        const maxPlayers = interaction.options.getInteger('players') || 4;

        try {
            // Check for existing games
            const existingGames = getActiveGamesForChannel(channelId);
            if (existingGames.length > 0) {
                return await interaction.editReply({
                    content: '❌ There is already a domino game running in this channel.'
                });
            }

            // Parse bet amount (optional)
            let betAmount = 0;
            if (betAmountStr) {
                betAmount = parseAmount(betAmountStr);
                if (!betAmount || betAmount < MIN_BET || betAmount > MAX_BET) {
                    return await interaction.editReply({
                        content: `❌ Invalid bet amount. Must be between ${fmt(MIN_BET)} and ${fmt(MAX_BET)}, or leave empty for no bet.`
                    });
                }

                // Check balance only if betting
                const balanceData = await dbManager.getUserBalance(userId, guildId);
                if (balanceData.wallet < betAmount) {
                    return await interaction.editReply({
                        content: `❌ Insufficient balance. You need ${fmt(betAmount)} but only have ${fmt(balanceData.wallet)}.`
                    });
                }
            }

            // Create game
            const gameId = `domino_${userId}_${Date.now()}`;
            const game = createDominoGame(gameId, channelId, userId, betAmount);
            game.maxPlayers = maxPlayers;
            
            // Add host
            game.addPlayer(userId, username);

            // Create lobby embed
            const embed = await buildLobbyEmbed(game);
            const buttons = buildLobbyButtons(gameId, game);

            const response = await interaction.editReply({
                embeds: [embed],
                components: [buttons]
            });

            // Set up interaction collector
            setupGameCollector(response, game);

        } catch (error) {
            logger.error('Error in dominoes execute:', error);
            await interaction.editReply({
                content: '❌ An error occurred while starting the game.'
            });
        }
    }
};

async function buildLobbyEmbed(game) {
    const isBettingGame = game.betAmount > 0;
    
    const embed = new EmbedBuilder()
        .setTitle('🎲 Puerto Rican Dominoes - Lobby')
        .setDescription(
            `**Traditional Domino Game**\n\n` +
            (isBettingGame ? 
                `💰 **Betting Game:** ${fmt(game.betAmount)} per player\n` : 
                `🎯 **Fun Game:** No betting, just for fun!\n`) +
            `**Players:** ${game.players.length}/${game.maxPlayers}\n\n` +
            `**Players Joined:**\n` +
            game.players.map(p => `• ${p.username} ${p.isBot ? '🤖' : ''}`).join('\n') + '\n\n' +
            `**How to Play:**\n` +
            `• Each player gets 7 dominoes\n` +
            `• Play dominoes by matching numbers\n` +
            `• First to empty their hand wins\n` +
            `• Draw from boneyard if you can't play`
        )
        .setColor(isBettingGame ? '#2E8B57' : '#4169E1')
        .setFooter({ text: 'Click Join to play or Fill with Bots to start immediately!' })
        .setTimestamp();

    return embed;
}

function buildLobbyButtons(gameId, game) {
    const buttons = [];
    
    if (game.players.length < game.maxPlayers) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`domino_join_${gameId}`)
                .setLabel('Join Game')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎮')
        );
        
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`domino_fillbots_${gameId}`)
                .setLabel('Fill with Bots')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🤖')
        );
    }
    
    buttons.push(
        new ButtonBuilder()
            .setCustomId(`domino_start_${gameId}`)
            .setLabel('Start Game')
            .setStyle(ButtonStyle.Success)
            .setEmoji('▶️')
            .setDisabled(game.players.length < 2)
    );
    
    buttons.push(
        new ButtonBuilder()
            .setCustomId(`domino_cancel_${gameId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
    );
    
    return new ActionRowBuilder().addComponents(buttons);
}

function buildGameButtons(gameId) {
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`domino_hand_${gameId}`)
                .setLabel('View Hand')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('👁️'),
            new ButtonBuilder()
                .setCustomId(`domino_board_${gameId}`)
                .setLabel('View Board')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🎯'),
            new ButtonBuilder()
                .setCustomId(`domino_play_${gameId}`)
                .setLabel('Play Domino')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🎲')
        );

    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`domino_draw_${gameId}`)
                .setLabel('Draw Domino')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📥'),
            new ButtonBuilder()
                .setCustomId(`domino_pass_${gameId}`)
                .setLabel('Pass Turn')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⏭️'),
            new ButtonBuilder()
                .setCustomId(`domino_quit_${gameId}`)
                .setLabel('Quit Game')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🚪')
        );

    return [row1, row2];
}

async function buildGameEmbed(game) {
    const currentPlayer = game.getCurrentPlayer();
    const gameState = game.getGameState();
    
    // Generate the board image
    const boardImagePath = await fixedDominoRenderer.generateProperBoard(
        gameState.board, gameState.leftEnd, gameState.rightEnd
    );
    
    const embed = new EmbedBuilder()
        .setTitle('🎲 Puerto Rican Dominoes - In Progress')
        .setDescription(
            `**Round ${gameState.roundNumber}**\n\n` +
            `**Current Turn:** ${currentPlayer.username} ${currentPlayer.isBot ? '🤖' : ''}\n\n` +
            `**Board Status:**\n` +
            `• Tiles Played: ${gameState.board.length}\n` +
            `• Left End: ${gameState.leftEnd || 'None'}\n` +
            `• Right End: ${gameState.rightEnd || 'None'}\n` +
            `• Boneyard: ${gameState.boneyardSize} tiles left\n\n` +
            `**Players:**\n` +
            gameState.players.map(p => 
                `• ${p.username} ${p.isBot ? '🤖' : ''}: ${p.handSize} tiles ${p.hasDrawn ? '(drawn)' : ''}`
            ).join('\n')
        )
        .setColor('#2E8B57')
        .setImage('attachment://board.png')
        .setFooter({ text: 'Use the buttons below to play!' })
        .setTimestamp();

    return { embed, boardImagePath };
}

function setupGameCollector(message, game) {
    const collector = message.createMessageComponentCollector({
        filter: (i) => i.customId.includes(`domino_`) && i.customId.includes(game.gameId),
        time: 1800000 // 30 minutes
    });

    collector.on('collect', async (interaction) => {
        try {
            await handleGameInteraction(interaction, game);
        } catch (error) {
            logger.error('Error handling simple domino interaction:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An error occurred.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        }
    });

    collector.on('end', () => {
        logger.debug(`Simple domino collector ended for game ${game.gameId}`);
    });

    // Process bot turns
    processBotTurns(game, message);
}

async function handleGameInteraction(interaction, game) {
    const userId = interaction.user.id;
    const action = interaction.customId.split('_')[1];
    
    // Determine if this should be private
    const isPrivate = ['hand', 'play'].includes(action);
    
    if (!interaction.replied && !interaction.deferred) {
        await interaction.deferReply({ flags: isPrivate ? MessageFlags.Ephemeral : undefined });
    }
    
    switch (action) {
        case 'join':
            await handleJoin(interaction, game);
            break;
        case 'fillbots':
            await handleFillBots(interaction, game);
            break;
        case 'start':
            await handleStart(interaction, game);
            break;
        case 'cancel':
            await handleCancel(interaction, game);
            break;
        case 'hand':
            await handleViewHand(interaction, game);
            break;
        case 'board':
            await handleViewBoard(interaction, game);
            break;
        case 'play':
            await handlePlayDomino(interaction, game);
            break;
        case 'draw':
            await handleDraw(interaction, game);
            break;
        case 'pass':
            await handlePass(interaction, game);
            break;
        case 'quit':
            await handleQuit(interaction, game);
            break;
    }
}

async function handleJoin(interaction, game) {
    const userId = interaction.user.id;
    const username = interaction.user.displayName;
    
    if (game.players.find(p => p.userId === userId)) {
        return await interaction.editReply({ content: '❌ You are already in this game!' });
    }
    
    if (!game.addPlayer(userId, username)) {
        return await interaction.editReply({ content: '❌ Game is full!' });
    }
    
    const embed = await buildLobbyEmbed(game);
    const buttons = buildLobbyButtons(game.gameId, game);
    
    await interaction.message.edit({ embeds: [embed], components: [buttons] });
    await interaction.editReply({ content: '✅ Joined the game!' });
}

async function handleFillBots(interaction, game) {
    if (game.hostUserId !== interaction.user.id) {
        return await interaction.editReply({ content: '❌ Only the host can add bots!' });
    }
    
    while (game.players.length < game.maxPlayers) {
        game.addBot();
    }
    
    const embed = await buildLobbyEmbed(game);
    const buttons = buildLobbyButtons(game.gameId, game);
    
    await interaction.message.edit({ embeds: [embed], components: [buttons] });
    await interaction.editReply({ content: '✅ Filled game with bots!' });
}

async function handleStart(interaction, game) {
    if (game.hostUserId !== interaction.user.id) {
        return await interaction.editReply({ content: '❌ Only the host can start the game!' });
    }
    
    if (!game.startGame()) {
        return await interaction.editReply({ content: '❌ Cannot start game (need at least 2 players)!' });
    }
    
    // Deduct bets (only if betting game)
    if (game.betAmount > 0) {
        const guildId = await getGuildId(interaction);
        for (const player of game.players) {
            if (!player.isBot) {
                await dbManager.updateBalance(player.userId, guildId, -game.betAmount);
            }
        }
    }
    
    const gameData = await buildGameEmbed(game);
    const buttons = buildGameButtons(game.gameId);
    
    const gameMessage = await interaction.message.edit({ 
        embeds: [gameData.embed], 
        components: buttons,
        files: [{ attachment: gameData.boardImagePath, name: 'board.png' }]
    });
    game.gameMessage = gameMessage;
    
    // Clean up board image after sending
    setTimeout(() => {
        try {
            const fs = require('fs');
            if (fs.existsSync(gameData.boardImagePath)) fs.unlinkSync(gameData.boardImagePath);
        } catch (e) {}
    }, 5000);
    
    await interaction.editReply({ content: '✅ Game started!' });
    
    // Process bot turn if needed
    if (game.getCurrentPlayer().isBot) {
        setTimeout(() => processBotTurn(game), 2000);
    }
}

async function handleCancel(interaction, game) {
    if (game.hostUserId !== interaction.user.id) {
        return await interaction.editReply({ content: '❌ Only the host can cancel!' });
    }
    
    removeDominoGame(game.gameId);
    
    const embed = new EmbedBuilder()
        .setTitle('🎲 Game Cancelled')
        .setDescription('The domino game has been cancelled.')
        .setColor('#FF4444')
        .setTimestamp();
    
    await interaction.message.edit({ embeds: [embed], components: [] });
    await interaction.editReply({ content: '✅ Game cancelled!' });
}

async function handleViewHand(interaction, game) {
    const userId = interaction.user.id;
    const player = game.players.find(p => p.userId === userId);
    
    if (!player) {
        return await interaction.editReply({ content: '❌ You are not in this game!' });
    }
    
    try {
        const playableTiles = game.getPlayableTiles(player);
        const playableIndices = player.hand.map((tile, index) => 
            playableTiles.some(pt => pt.equals(tile)) ? index : -1
        ).filter(index => index !== -1);
        
        const handImagePath = await fixedDominoRenderer.generateHandView(player.hand, playableIndices);
        
        const embed = new EmbedBuilder()
            .setTitle('👁️ Your Hand')
            .setDescription(
                `**${player.hand.length} dominoes in your hand**\n\n` +
                `**Playable tiles:** ${playableTiles.length}\n` +
                `**Board ends:** Left: ${game.leftEnd || 'None'}, Right: ${game.rightEnd || 'None'}\n\n` +
                `**Your tiles:**\n` +
                player.hand.map((tile, i) => {
                    const isPlayable = playableIndices.includes(i);
                    return `${i + 1}. ${tile.toString()} ${isPlayable ? '✅' : '⚪'}`;
                }).join('\n')
            )
            .setColor('#2E8B57')
            .setImage('attachment://hand.png')
            .setFooter({ text: 'Green numbers = playable tiles' });
        
        await interaction.editReply({
            embeds: [embed],
            files: [{ attachment: handImagePath, name: 'hand.png' }]
        });
        
        // Cleanup
        setTimeout(() => {
            try {
                const fs = require('fs');
                if (fs.existsSync(handImagePath)) fs.unlinkSync(handImagePath);
            } catch (e) {}
        }, 5000);
        
    } catch (error) {
        logger.error('Error generating hand view:', error);
        await interaction.editReply({ content: '❌ Error displaying hand.' });
    }
}

async function handleViewBoard(interaction, game) {
    try {
        const boardImagePath = await fixedDominoRenderer.generateProperBoard(
            game.board, game.leftEnd, game.rightEnd
        );
        
        const embed = new EmbedBuilder()
            .setTitle('🎯 Game Board')
            .setDescription(
                `**Tiles on board:** ${game.board.length}\n` +
                `**Left end:** ${game.leftEnd || 'None'}\n` +
                `**Right end:** ${game.rightEnd || 'None'}\n` +
                `**Boneyard:** ${game.boneyard.length} tiles remaining\n\n` +
                `To play a domino, it must match one of the end numbers.`
            )
            .setColor('#2E8B57')
            .setImage('attachment://board.png');
        
        await interaction.editReply({
            embeds: [embed],
            files: [{ attachment: boardImagePath, name: 'board.png' }]
        });
        
        // Cleanup
        setTimeout(() => {
            try {
                const fs = require('fs');
                if (fs.existsSync(boardImagePath)) fs.unlinkSync(boardImagePath);
            } catch (e) {}
        }, 5000);
        
    } catch (error) {
        logger.error('Error generating board view:', error);
        await interaction.editReply({ content: '❌ Error displaying board.' });
    }
}

async function handlePlayDomino(interaction, game) {
    const userId = interaction.user.id;
    const player = game.players.find(p => p.userId === userId);
    
    if (!player || game.getCurrentPlayer() !== player) {
        return await interaction.editReply({ content: '❌ Not your turn!' });
    }
    
    const playableTiles = game.getPlayableTiles(player);
    if (playableTiles.length === 0) {
        return await interaction.editReply({ content: '❌ You have no playable tiles! Draw or pass.' });
    }
    
    // Create selection menu
    const options = playableTiles.map((tile, index) => ({
        label: tile.toString(),
        value: `${index}`,
        description: `Play domino ${tile.toString()}`
    }));
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`domino_select_${game.gameId}`)
        .setPlaceholder('Choose a domino to play')
        .addOptions(options.slice(0, 25)); // Discord limit
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    await interaction.editReply({
        content: '🎲 **Choose a domino to play:**',
        components: [row]
    });
    
    // Set up selection collector
    const filter = (i) => i.customId === `domino_select_${game.gameId}` && i.user.id === userId;
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000, max: 1 });
    
    collector.on('collect', async (selectInteraction) => {
        const tileIndex = parseInt(selectInteraction.values[0]);
        const selectedTile = playableTiles[tileIndex];
        
        await selectInteraction.deferReply({ flags: MessageFlags.Ephemeral });
        
        // Check if we need to ask for side (left/right)
        if (game.board.length > 0 && 
            selectedTile.canConnectTo(game.leftEnd) && 
            selectedTile.canConnectTo(game.rightEnd)) {
            
            // Ask for side
            const sideButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`domino_left_${game.gameId}_${tileIndex}`)
                        .setLabel('Play on Left')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`domino_right_${game.gameId}_${tileIndex}`)
                        .setLabel('Play on Right')
                        .setStyle(ButtonStyle.Primary)
                );
            
            await selectInteraction.editReply({
                content: `🎲 **Playing ${selectedTile.toString()}** - Choose which side:`,
                components: [sideButtons]
            });
            
            // Set up side selection
            const sideFilter = (i) => i.customId.includes(`domino_left_${game.gameId}`) || i.customId.includes(`domino_right_${game.gameId}`);
            const sideCollector = selectInteraction.channel.createMessageComponentCollector({ filter: sideFilter, time: 30000, max: 1 });
            
            sideCollector.on('collect', async (sideInteraction) => {
                const side = sideInteraction.customId.includes('left') ? 'left' : 'right';
                await sideInteraction.deferUpdate();
                
                const result = game.playTile(player, selectedTile, side);
                await finishTilePlay(result, sideInteraction, game, selectedTile);
            });
            
        } else {
            // Play automatically
            const result = game.playTile(player, selectedTile);
            await finishTilePlay(result, selectInteraction, game, selectedTile);
        }
    });
}

async function finishTilePlay(result, interaction, game, tile) {
    if (result.success) {
        await interaction.editReply({
            content: `✅ Played ${tile.toString()}! ${result.message}`,
            components: []
        });
        
        if (game.gamePhase === 'finished') {
            await handleGameEnd(game, result.winner);
        } else {
            await updateGameDisplay(game);
            
            // Process bot turn
            if (game.getCurrentPlayer().isBot) {
                setTimeout(() => processBotTurn(game), 2000);
            }
        }
    } else {
        await interaction.editReply({
            content: `❌ ${result.message}`,
            components: []
        });
    }
}

async function handleDraw(interaction, game) {
    const userId = interaction.user.id;
    const player = game.players.find(p => p.userId === userId);
    
    if (!player || game.getCurrentPlayer() !== player) {
        return await interaction.editReply({ content: '❌ Not your turn!' });
    }
    
    const result = game.drawTile(player);
    
    if (result.success) {
        await interaction.editReply({ content: `✅ ${result.message}` });
        
        if (!result.message.includes('passed')) {
            await updateGameDisplay(game);
        }
        
        if (game.getCurrentPlayer().isBot) {
            setTimeout(() => processBotTurn(game), 1500);
        }
    } else {
        await interaction.editReply({ content: `❌ ${result.message}` });
    }
}

async function handlePass(interaction, game) {
    const userId = interaction.user.id;
    const player = game.players.find(p => p.userId === userId);
    
    if (!player || game.getCurrentPlayer() !== player) {
        return await interaction.editReply({ content: '❌ Not your turn!' });
    }
    
    const result = game.passTurn(player);
    
    if (result.success) {
        await interaction.editReply({ content: `✅ ${result.message}` });
        await updateGameDisplay(game);
        
        if (game.gamePhase === 'finished') {
            await handleGameEnd(game, null);
        } else if (game.getCurrentPlayer().isBot) {
            setTimeout(() => processBotTurn(game), 1500);
        }
    } else {
        await interaction.editReply({ content: `❌ ${result.message}` });
    }
}

async function handleQuit(interaction, game) {
    const userId = interaction.user.id;
    
    if (game.gamePhase === 'playing' && game.hostUserId !== userId) {
        return await interaction.editReply({ content: '❌ Cannot quit during game!' });
    }
    
    removeDominoGame(game.gameId);
    
    const embed = new EmbedBuilder()
        .setTitle('🎲 Game Ended')
        .setDescription('The domino game has been ended.')
        .setColor('#FF4444')
        .setTimestamp();
    
    await game.gameMessage.edit({ embeds: [embed], components: [] });
    await interaction.editReply({ content: '✅ Game ended!' });
}

async function updateGameDisplay(game) {
    if (!game.gameMessage) return;
    
    try {
        const gameData = await buildGameEmbed(game);
        const buttons = buildGameButtons(game.gameId);
        
        await game.gameMessage.edit({ 
            embeds: [gameData.embed], 
            components: buttons,
            files: [{ attachment: gameData.boardImagePath, name: 'board.png' }]
        });
        
        // Clean up board image after sending
        setTimeout(() => {
            try {
                const fs = require('fs');
                if (fs.existsSync(gameData.boardImagePath)) fs.unlinkSync(gameData.boardImagePath);
            } catch (e) {}
        }, 5000);
        
    } catch (error) {
        logger.error('Error updating game display:', error);
    }
}

async function processBotTurn(game) {
    try {
        const currentPlayer = game.getCurrentPlayer();
        if (!currentPlayer || !currentPlayer.isBot || game.gamePhase !== 'playing') {
            return;
        }
        
        const botMove = game.getBotMove(currentPlayer);
        if (!botMove) return;
        
        let result;
        
        switch (botMove.action) {
            case 'play':
                result = game.playTile(currentPlayer, botMove.tile, botMove.side);
                break;
            case 'draw':
                result = game.drawTile(currentPlayer);
                break;
            case 'pass':
                result = game.passTurn(currentPlayer);
                break;
        }
        
        if (result?.success) {
            if (game.gamePhase === 'finished') {
                await handleGameEnd(game, result.winner);
            } else {
                await updateGameDisplay(game);
                
                // Continue with next bot if needed
                if (game.getCurrentPlayer().isBot) {
                    setTimeout(() => processBotTurn(game), 2000);
                }
            }
        }
        
    } catch (error) {
        logger.error('Error in bot turn:', error);
    }
}

async function processBotTurns(game, message) {
    // Initial bot processing setup
    game.gameMessage = message;
}

async function handleGameEnd(game, winner) {
    try {
        const guildId = game.channelId; // Assuming we can get guild from channel
        
        let embed;
        
        if (winner) {
            // Someone won by emptying their hand
            const isBettingGame = game.betAmount > 0;
            
            if (isBettingGame) {
                const winAmount = game.betAmount * game.players.length;
                
                if (!winner.isBot) {
                    await dbManager.updateBalance(winner.userId, guildId, winAmount);
                }
                
                embed = new EmbedBuilder()
                    .setTitle('🏆 Game Complete!')
                    .setDescription(
                        `**Winner: ${winner.username}** ${winner.isBot ? '🤖' : ''}\n\n` +
                        `💰 **Prize:** ${fmt(winAmount)}\n` +
                        `**Final Scores:**\n` +
                        game.players.map(p => 
                            `• ${p.username}: ${p.hand.length} tiles left`
                        ).join('\n')
                    )
                    .setColor('#FFD700');
            } else {
                embed = new EmbedBuilder()
                    .setTitle('🏆 Game Complete!')
                    .setDescription(
                        `**Winner: ${winner.username}** ${winner.isBot ? '🤖' : ''}\n\n` +
                        `🎯 **Fun Game Complete!** No betting involved.\n` +
                        `**Final Scores:**\n` +
                        game.players.map(p => 
                            `• ${p.username}: ${p.hand.length} tiles left`
                        ).join('\n')
                    )
                    .setColor('#4169E1');
            }
        } else {
            // Game blocked - lowest pip count wins
            const pipCounts = game.players.map(p => ({
                player: p,
                pips: p.hand.reduce((sum, tile) => sum + tile.totalPips, 0)
            }));
            
            const winnerData = pipCounts.reduce((min, current) => 
                current.pips < min.pips ? current : min
            );
            
            const isBettingGame = game.betAmount > 0;
            
            if (isBettingGame) {
                const winAmount = game.betAmount * game.players.length;
                
                if (!winnerData.player.isBot) {
                    await dbManager.updateBalance(winnerData.player.userId, guildId, winAmount);
                }
                
                embed = new EmbedBuilder()
                    .setTitle('🔒 Game Blocked!')
                    .setDescription(
                        `**Winner: ${winnerData.player.username}** (lowest pip count)\n\n` +
                        `💰 **Prize:** ${fmt(winAmount)}\n` +
                        `**Final Pip Counts:**\n` +
                        pipCounts.map(p => 
                            `• ${p.player.username}: ${p.pips} pips`
                        ).join('\n')
                    )
                    .setColor('#FF8C00');
            } else {
                embed = new EmbedBuilder()
                    .setTitle('🔒 Game Blocked!')
                    .setDescription(
                        `**Winner: ${winnerData.player.username}** (lowest pip count)\n\n` +
                        `🎯 **Fun Game Complete!** No betting involved.\n` +
                        `**Final Pip Counts:**\n` +
                        pipCounts.map(p => 
                            `• ${p.player.username}: ${p.pips} pips`
                        ).join('\n')
                    )
                    .setColor('#4169E1');
            }
        }
        
        embed.setFooter({ text: 'Thanks for playing Puerto Rican Dominoes!' })
             .setTimestamp();
        
        await game.gameMessage.edit({ embeds: [embed], components: [] });
        removeDominoGame(game.gameId);
        
    } catch (error) {
        logger.error('Error handling game end:', error);
    }
}
