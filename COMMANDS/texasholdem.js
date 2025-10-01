/**
 * Texas Hold'em Poker Command Handler for ATIVE Casino Bot
 * Multiplayer poker game with betting system, lobby management, and modern UI
 * Features reliable button interactions, tournament mode, and comprehensive poker gameplay
 */

const { SlashCommandBuilder, MessageFlags, ButtonBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { fmt, fmtDelta, getGuildId, sendLogMessage, parseAmount } = require('../UTILS/common');
const { 
    TexasHoldemGame, 
    createTexasHoldemGame, 
    getTexasHoldemGame, 
    deleteTexasHoldemGame,
    BETTING_ACTIONS,
    GAME_PHASES,
    HAND_RANKINGS
} = require('../GAMES/texasholdem');
const GamePanel = require('../UTILS/gamePanel');
const sessionManager = require('../UTILS/sessionManager');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');
const levelingSystem = require('../UTILS/levelingSystem');
const tuningManager = require('../UTILS/tuningManager');
const allInManager = require('../UTILS/allInManager');
const TexasHoldemRenderer = require('../UTILS/texasHoldemRenderer');

// Game type constant
const SMGameType = { TEXAS_HOLDEM: 'texas_holdem' };

// Minimum and maximum buy-in amounts
const MIN_BUY_IN = 1000;
const MAX_BUY_IN = 10000000;

// Action timeout in milliseconds
const ACTION_TIMEOUT = 45000; // 45 seconds

// Initialize renderer
const renderer = new TexasHoldemRenderer();

/**
 * Create game lobby embed
 */
function createLobbyEmbed(game, guildId) {
    const players = Array.from(game.players.values());
    const playerList = players.length > 0 
        ? players.map((p, i) => `${i + 1}. ${p.username} - ${fmt(p.chipCount)} chips`).join('\n')
        : 'No players yet';
    
    const embed = new EmbedBuilder()
        .setTitle('🃏 Texas Hold\'em Poker Lobby')
        .setDescription(`**Buy-in:** ${fmt(game.buyInAmount)}\n**Blinds:** ${fmt(game.blindStructure.small)}/${fmt(game.blindStructure.big)}`)
        .addFields(
            { 
                name: `👥 Players (${players.length}/${game.maxPlayers})`, 
                value: playerList,
                inline: false 
            },
            {
                name: '🎮 Game Info',
                value: `**Min Players:** ${game.minPlayers}\n**Status:** ${game.waitingForPlayers ? 'Waiting for players' : 'Starting soon...'}`,
                inline: true
            }
        )
        .setColor(0x00AA00)
        .setTimestamp()
        .setFooter({ text: 'Click Join to enter the game!' });

    return embed;
}

/**
 * Create main game embed (public view - NO private cards)
 */
async function createGameEmbed(game) {
    const currentPlayer = game.getCurrentPlayer();
    const gameState = game.getGameState();
    
    // Simplified main description - just essential info
    let description = `**Hand #${gameState.handNumber}** • ${gameState.phase.replace('_', ' ').toUpperCase()}`;
    
    if (gameState.currentPlayer) {
        description += `\n🎮 **${gameState.currentPlayer.username}'s Turn** ⏰`;
    }

    const embed = new EmbedBuilder()
        .setTitle('🃏 Texas Hold\'em Poker')
        .setDescription(description)
        .setColor(0x2E7D32)
        .setTimestamp();

    // Clean game info section
    const gameInfo = [];
    gameInfo.push(`💰 **Pot:** ${fmt(gameState.totalPot)}`);
    gameInfo.push(`🎯 **Bet:** ${fmt(gameState.currentBet)}`);
    gameInfo.push(`🎲 **Blinds:** ${fmt(gameState.blinds.small)}/${fmt(gameState.blinds.big)}`);
    
    embed.addFields({
        name: '📊 Game Status',
        value: gameInfo.join(' • '),
        inline: false
    });

    // Add side pots if they exist
    if (gameState.pots && gameState.pots.length > 1) {
        const sidePots = gameState.pots.slice(1).map((pot, index) => 
            `Side Pot ${index + 1}: ${fmt(pot.amount)}`
        ).join('\n');
        
        embed.addFields({
            name: '💼 Side Pots',
            value: sidePots,
            inline: false
        });
    }

    // Community cards with better formatting
    if (gameState.communityCards.length > 0) {
        const cardDisplay = gameState.communityCards.map(card => `\`${card.toString()}\``).join(' ');
        let phaseText = '';
        if (gameState.communityCards.length === 3) phaseText = 'FLOP';
        else if (gameState.communityCards.length === 4) phaseText = 'TURN';
        else if (gameState.communityCards.length === 5) phaseText = 'RIVER';
        
        embed.addFields({
            name: `🏠 Community Cards - ${phaseText}`,
            value: cardDisplay,
            inline: false
        });
    }

    // Simplified players status
    const activePlayers = gameState.players.filter(p => p.isActive);
    if (activePlayers.length > 0) {
        const playerStatus = activePlayers.map(p => {
            let status = `**${p.username}**`;
            
            // Current turn indicator
            if (currentPlayer && p.userId === currentPlayer.userId) {
                status += ' ⬅️';
            }
            
            // Status indicators (prioritize most important)
            if (p.hasFolded) {
                status += ' ❌';
            } else if (p.isAllIn) {
                status += ' 🚀';
            } else if (p.currentBet > 0) {
                status += ` 🎯${fmt(p.currentBet)}`;
            }
            
            status += ` (${fmt(p.chipCount)})`;
            
            return status;
        }).join(' • ');
        
        embed.addFields({
            name: '👥 Players',
            value: playerStatus,
            inline: false
        });
    }

    // Generate table image (without private cards for main view)
    let tableImageBuffer = null;
    try {
        tableImageBuffer = await renderer.createTableImage(gameState, null); // null = no viewing user, public view
        if (tableImageBuffer) {
            embed.setImage('attachment://poker-table.png');
        }
    } catch (error) {
        logger.warn(`Failed to generate poker table image: ${error.message}`);
    }

    return { embed, tableImage: tableImageBuffer };
}

/**
 * Create private player embed (ephemeral - shows ONLY to specific player)
 */
async function createPrivatePlayerEmbed(game, userId) {
    const player = game.players.get(userId);
    const currentPlayer = game.getCurrentPlayer();
    
    if (!player) {
        return {
            embed: new EmbedBuilder()
                .setTitle('👁️ Spectating Texas Hold\'em')
                .setDescription('You are watching this poker game')
                .setColor(0x85929E)
                .setTimestamp(),
            image: null
        };
    }

    const embed = new EmbedBuilder()
        .setTitle('🎴 Your Private Hand')
        .setColor(player.userId === currentPlayer?.userId ? 0xF1C40F : 0x3498DB)
        .setTimestamp();

    // Generate private hand image
    let privateHandImage = null;
    try {
        const renderer = new TexasHoldemRenderer();
        privateHandImage = await renderer.createPrivateHandImage(player, game.communityCards);
        if (privateHandImage) {
            embed.setImage('attachment://private-hand.png');
        }
    } catch (error) {
        logger.error(`Error creating private hand image for ${player.username}: ${error.message}`);
    }

    // Show player's private cards as text backup
    if (player.holeCards && player.holeCards.length > 0) {
        const handDisplay = player.holeCards.map(card => `\`${card.toString()}\``).join(' ');
        embed.addFields({
            name: '🎴 Your Hole Cards (Private)',
            value: handDisplay,
            inline: false
        });
    }

    // Player stats
    embed.addFields(
        {
            name: '💰 Your Chips',
            value: fmt(player.chipCount),
            inline: true
        },
        {
            name: '🎯 Your Current Bet',
            value: player.currentBet > 0 ? fmt(player.currentBet) : 'No bet',
            inline: true
        },
        {
            name: '🪑 Your Seat',
            value: `Seat ${player.seatNumber + 1}`,
            inline: true
        }
    );

    if (player.lastAction) {
        embed.addFields({
            name: '🎯 Your Last Action',
            value: player.lastAction.toUpperCase(),
            inline: true
        });
    }

    // Turn indicator
    if (player.userId === currentPlayer?.userId) {
        embed.addFields({
            name: '⏰ Your Turn!',
            value: 'It\'s your turn to act. Choose an action below.',
            inline: false
        });
    } else if (currentPlayer) {
        embed.addFields({
            name: '⏳ Waiting',
            value: `Waiting for ${currentPlayer.username} to act...`,
            inline: false
        });
    }

    return {
        embed,
        image: privateHandImage
    };
}

/**
 * Send private hand info to all players via ephemeral messages
 */
async function sendPrivateHandsToPlayers(game, interaction) {
    for (const player of game.players.values()) {
        try {
            const privateData = await createPrivatePlayerEmbed(game, player.userId);
            
            // Send ephemeral follow-up to each player
            if (player.userId === interaction.user.id) {
                // For the interaction user, use editReply or followUp
                const messageData = { 
                    embeds: [privateData.embed], 
                    flags: MessageFlags.Ephemeral 
                };
                if (privateData.image) {
                    messageData.files = [{ attachment: privateData.image, name: 'private-hand.png' }];
                }
                await interaction.followUp(messageData);
            } else {
                // For other players, we need to send via DM or they need to click a button
                // Since Discord doesn't allow sending ephemeral to other users,
                // we'll handle this when they interact with the game
            }
        } catch (error) {
            logger.warn(`Failed to send private hand to ${player.username}: ${error.message}`);
        }
    }
}

/**
 * Update game state for all players
 */
async function updateGameStateForAllPlayers(game, interaction) {
    // Update main public message
    const gameData = await createGameEmbed(game);
    const actionButtons = createActionButtons(game);
    
    const messageData = { embeds: [gameData.embed], components: actionButtons };
    if (gameData.tableImage) {
        messageData.files = [{ attachment: gameData.tableImage, name: 'poker-table.png' }];
    }

    await interaction.update(messageData);
    
    // Send turn notification message that auto-deletes after 10 seconds
    const currentPlayer = game.getCurrentPlayer();
    if (currentPlayer) {
        try {
            const turnMessage = await interaction.followUp({
                content: `<@${currentPlayer.userId}>, it's your turn for Texas Hold'em! ⏰`,
                flags: 0 // Not ephemeral - everyone can see
            });
            
            // Delete the turn notification after 10 seconds
            setTimeout(async () => {
                try {
                    await turnMessage.delete();
                } catch (deleteError) {
                    logger.warn(`Failed to delete turn notification: ${deleteError.message}`);
                }
            }, 10000);
        } catch (error) {
            logger.warn(`Failed to send turn notification: ${error.message}`);
        }
    }
    
    // Send private hand to the acting player
    if (currentPlayer && currentPlayer.userId === interaction.user.id) {
        try {
            const privateData = await createPrivatePlayerEmbed(game, interaction.user.id);
            const messageData = { 
                embeds: [privateData.embed], 
                flags: MessageFlags.Ephemeral 
            };
            if (privateData.image) {
                messageData.files = [{ attachment: privateData.image, name: 'private-hand.png' }];
            }
            await interaction.followUp(messageData);
        } catch (error) {
            logger.warn(`Failed to send private hand follow-up: ${error.message}`);
        }
    }
}

/**
 * Create lobby buttons - Universal buttons that work for any user
 */
function createLobbyButtons(game, currentUserId = null) {
    const canStart = game.seatOrder.length >= game.minPlayers;
    const gameIsFull = game.seatOrder.length >= game.maxPlayers;
    
    const buttons = [];
    
    // ALWAYS show join button unless game is full
    if (!gameIsFull) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`th-general-join`)
                .setLabel(`Join Game (${game.seatOrder.length}/${game.maxPlayers})`)
                .setEmoji('🎮')
                .setStyle(ButtonStyle.Primary)
        );
    }
    
    // Leave button - works for any player in the game
    buttons.push(
        new ButtonBuilder()
            .setCustomId(`th-player-leave`)
            .setLabel('Leave Game')
            .setEmoji('🚪')
            .setStyle(ButtonStyle.Secondary)
    );
    
    // Start button - works for creator only (verified in handler)
    if (canStart && game.waitingForPlayers) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`th-creator-start`)
                .setLabel('Start Game')
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Success)
        );
    }
    
    // Cancel button - works for creator only (verified in handler)
    buttons.push(
        new ButtonBuilder()
            .setCustomId(`th-creator-cancel`)
            .setLabel('Cancel Game')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
    );
    
    // Help button (always available)
    buttons.push(
        new ButtonBuilder()
            .setCustomId(`th-general-help`)
            .setLabel('Help')
            .setEmoji('❓')
            .setStyle(ButtonStyle.Secondary)
    );
    
    const rows = [];
    if (buttons.length > 0) {
        // Split buttons into rows of max 5
        for (let i = 0; i < buttons.length; i += 5) {
            const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
            rows.push(row);
        }
    }
    
    return rows;
}

/**
 * Create game action buttons - Universal buttons that work for any player
 */
function createActionButtons(game, currentUserId = null) {
    const buttons = [];
    const currentPlayer = game.getCurrentPlayer();
    
    // Don't show action buttons during showdown or when ready for next hand
    if (game.phase === GAME_PHASES.SHOWDOWN || game.readyForNextHand) {
        // Return empty during showdown - processHandCompletion will handle buttons
        return [];
    }
    
    // Always show basic game buttons if game is active
    if (game.gameActive) {
        // Add check hand button (always available for players in game)
        buttons.push(
            new ButtonBuilder()
                .setCustomId('th-action-checkhand')
                .setLabel('Check Hand')
                .setEmoji('👁️')
                .setStyle(ButtonStyle.Secondary)
        );
        
        // Add help button
        buttons.push(
            new ButtonBuilder()
                .setCustomId('th-general-help')
                .setLabel('Help')
                .setEmoji('❓')
                .setStyle(ButtonStyle.Secondary)
        );
    }
    
    // Add action buttons only if current player can act
    if (currentPlayer && currentPlayer.canAct()) {
        const availableActions = currentPlayer.getAvailableActions(game.currentBet, game.minRaise);
        
        for (const action of availableActions) {
            let button = new ButtonBuilder()
                .setCustomId(`th-action-${action}`)
                .setStyle(ButtonStyle.Secondary);
                
            switch (action) {
                case BETTING_ACTIONS.FOLD:
                    button.setLabel('Fold').setEmoji('❌').setStyle(ButtonStyle.Danger);
                    break;
                case BETTING_ACTIONS.CHECK:
                    button.setLabel('Check').setEmoji('✅').setStyle(ButtonStyle.Secondary);
                    break;
                case BETTING_ACTIONS.CALL:
                    const callAmount = game.currentBet - currentPlayer.currentBet;
                    button.setLabel(`Call ${fmt(callAmount)}`).setEmoji('📞').setStyle(ButtonStyle.Primary);
                    break;
                case BETTING_ACTIONS.BET:
                    button.setLabel('Bet').setEmoji('💰').setStyle(ButtonStyle.Success);
                    break;
                case BETTING_ACTIONS.RAISE:
                    button.setLabel('Raise').setEmoji('⬆️').setStyle(ButtonStyle.Success);
                    break;
                case BETTING_ACTIONS.ALL_IN:
                    button.setLabel(`All-In (${fmt(currentPlayer.chipCount)})`).setEmoji('🚀').setStyle(ButtonStyle.Danger);
                    break;
            }
            
            buttons.push(button);
        }
    }
    
    const rows = [];
    if (buttons.length > 0) {
        // Split buttons into rows of max 5
        for (let i = 0; i < buttons.length; i += 5) {
            const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
            rows.push(row);
        }
    }
    
    return rows;
}

/**
 * Create bet amount selection menu
 */
function createBetAmountMenu(game, userId, action) {
    const player = game.players.get(userId);
    if (!player) return null;
    
    const options = [];
    let minBet, maxBet;
    
    if (action === BETTING_ACTIONS.BET) {
        // For betting (when no one has bet yet)
        minBet = game.blindStructure.big;
        maxBet = player.chipCount;
    } else if (action === BETTING_ACTIONS.RAISE) {
        // For raising (when someone has already bet)
        const callAmount = game.currentBet - player.currentBet;
        minBet = Math.max(game.currentBet + game.minRaise, callAmount + game.minRaise);
        maxBet = player.chipCount + player.currentBet; // Total amount player can put in
    }
    
    // Ensure minBet doesn't exceed player's available chips
    if (minBet > maxBet) {
        return null; // Player can't make this action
    }
    
    // Create smart preset amounts based on the action
    let presetAmounts;
    if (action === BETTING_ACTIONS.RAISE) {
        // For raises, show meaningful raise sizes
        presetAmounts = [
            minBet, // Minimum raise
            Math.floor(game.getTotalPot() * 0.5 + game.currentBet), // Half pot raise
            Math.floor(game.getTotalPot() + game.currentBet), // Pot-sized raise
            Math.floor(game.getTotalPot() * 2 + game.currentBet), // 2x pot raise
            maxBet // All-in
        ];
    } else {
        // For bets, show percentage of stack
        presetAmounts = [
            minBet,
            Math.floor(maxBet * 0.25),
            Math.floor(maxBet * 0.5),
            Math.floor(maxBet * 0.75),
            maxBet
        ];
    }
    
    // Filter and deduplicate amounts
    presetAmounts = presetAmounts
        .filter((amount, index, arr) => amount >= minBet && amount <= maxBet && arr.indexOf(amount) === index)
        .sort((a, b) => a - b);
    
    for (const amount of presetAmounts) {
        const actionDescription = action === BETTING_ACTIONS.RAISE ? 
            `Raise to ${fmt(amount)}` : 
            `${action} ${fmt(amount)}`;
            
        options.push({
            label: fmt(amount),
            description: actionDescription,
            value: `${action}_${amount}`
        });
    }
    
    // Add custom amount option
    options.push({
        label: '💬 Custom Amount',
        description: 'Type your own amount',
        value: `${action}_custom`,
        emoji: '✏️'
    });
    
    if (options.length === 0) {
        return null;
    }
    
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`th-betmenu-bet_amount`)
        .setPlaceholder(`Select ${action} amount`)
        .addOptions(options.slice(0, 25)); // Discord limit
    
    return new ActionRowBuilder().addComponents(menu);
}

/**
 * Create custom amount modal
 */
function createCustomAmountModal(action, minAmount, maxAmount) {
    const modal = new ModalBuilder()
        .setCustomId(`th-modal-${action}-amount`)
        .setTitle(`${action.charAt(0).toUpperCase() + action.slice(1)} Amount`);

    const amountInput = new TextInputBuilder()
        .setCustomId('amount')
        .setLabel(`Enter ${action} amount (${fmt(minAmount)} - ${fmt(maxAmount)})`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`e.g., ${fmt(Math.floor((minAmount + maxAmount) / 2))}`)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(20);

    const firstActionRow = new ActionRowBuilder().addComponents(amountInput);
    modal.addComponents(firstActionRow);

    return modal;
}

/**
 * Create results embed for showdown
 */
function createResultsEmbed(game, winners, pots) {
    const embed = new EmbedBuilder()
        .setTitle('🏆 Showdown Results')
        .setColor(0xFFD700)
        .setTimestamp();
    
    let description = `**Hand #${game.handNumber} Complete**\n\n`;
    
    // Show community cards
    if (game.communityCards.length > 0) {
        const cardDisplay = game.communityCards.map(card => card.toString()).join(' ');
        description += `**Community Cards:** ${cardDisplay}\n\n`;
    }
    
    // Show results for each pot
    pots.forEach((pot, index) => {
        const potType = pot.type === 'main' ? 'Main Pot' : `Side Pot ${index}`;
        description += `**${potType}: ${fmt(pot.amount)}**\n`;
        
        if (pot.winners) {
            const winnerNames = pot.winners.map(w => w.username).join(', ');
            const winAmount = Math.floor(pot.amount / pot.winners.length);
            description += `🏆 Winner${pot.winners.length > 1 ? 's' : ''}: ${winnerNames}\n`;
            description += `💰 Each wins: ${fmt(winAmount)}\n`;
            description += `🃏 Winning hand: ${pot.winningHand}\n\n`;
        } else if (pot.winner) {
            description += `🏆 Winner: ${pot.winner.username}\n`;
            description += `💰 Wins: ${fmt(pot.amount)}\n`;
            description += `🃏 Winning hand: ${pot.winningHand}\n\n`;
        }
    });
    
    embed.setDescription(description);
    
    // Show all player hands
    const activePlayers = Array.from(game.players.values()).filter(p => !p.hasFolded);
    if (activePlayers.length > 0) {
        const handResults = activePlayers.map(player => {
            const handStr = player.holeCards.map(c => c.toString()).join(' ');
            const bestHand = player.bestHand ? player.bestHand.name : 'Unknown';
            return `**${player.username}:** ${handStr} (${bestHand})`;
        }).join('\n');
        
        embed.addFields({
            name: '🎴 Player Hands',
            value: handResults,
            inline: false
        });
    }
    
    return embed;
}

/**
 * Process hand completion and payouts
 */
async function processHandCompletion(game, interaction) {
    const guildId = await getGuildId(interaction);
    
    try {
        // Process payouts through economy system
        for (const result of game.payoutResults) {
            if (result.won && result.amount > 0) {
                // Add winnings to player account
                await dbManager.updateUserBalance(result.userId, guildId, result.amount, 0);
                
                // Record game result for statistics
                await dbManager.recordGameResult(
                    result.userId,
                    guildId,
                    'poker',
                    true,
                    game.buyInAmount, // Original buy-in as bet amount
                    result.amount,
                    {
                        handName: result.handName,
                        handNumber: game.handNumber,
                        playersInHand: game.players.size
                    }
                );
                
                // Add XP for poker win
                await levelingSystem.handleGameComplete(result.userId, guildId, 'poker', true, result.handName);
            }
        }
        
        // Create showdown results embed
        const resultsEmbed = createResultsEmbed(game, game.payoutResults, game.pots);
        
        // Generate hand result image if possible
        let handResultImage = null;
        try {
            const playerHands = {};
            for (const player of game.players.values()) {
                if (!player.hasFolded && player.bestHand) {
                    playerHands[player.userId] = {
                        playerName: player.username,
                        handName: player.bestHand.name,
                        holeCards: player.holeCards
                    };
                }
            }
            
            const winners = game.payoutResults.map(r => r.userId);
            handResultImage = await renderer.createHandResultImage(playerHands, game.communityCards, winners);
        } catch (error) {
            logger.warn(`Failed to generate hand result image: ${error.message}`);
        }
        
        // Call endHand to prepare for next hand
        game.endHand();
        
        // Create continue button for next hand if game is still active
        const components = [];
        if (game.gameActive && game.readyForNextHand) {
            const continueButton = new ButtonBuilder()
                .setCustomId('th-action-continue')
                .setLabel('Continue to Next Hand')
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Success);
            
            const quitButton = new ButtonBuilder()
                .setCustomId('th-action-quit')
                .setLabel('Leave Table')
                .setEmoji('🚪')
                .setStyle(ButtonStyle.Secondary);
            
            components.push(new ActionRowBuilder().addComponents(continueButton, quitButton));
        }
        
        const messageData = { embeds: [resultsEmbed], components };
        if (handResultImage) {
            messageData.files = [{ attachment: handResultImage, name: 'poker-results.png' }];
            resultsEmbed.setImage('attachment://poker-results.png');
        }
        
        await interaction.update(messageData);
        
        // Send winner mentions in the channel
        const winnerMentions = [];
        for (const result of game.payoutResults || []) {
            if (result.won && result.amount > 0) {
                winnerMentions.push(`<@${result.userId}> you have won Poker! 🎉 **+${fmt(result.amount)}**`);
            }
        }
        
        if (winnerMentions.length > 0) {
            // Send winner mentions as a follow-up message
            await interaction.followUp({
                content: winnerMentions.join('\n'),
                flags: 0 // Not ephemeral - everyone should see the winners
            });
        }
        
        // Clear payout results
        const winnerCount = winnerMentions.length;
        game.payoutResults = null;
        
        logger.info(`Texas Hold'em hand #${game.handNumber - 1} completed with ${winnerCount} winners`);
        
    } catch (error) {
        logger.error(`Error processing hand completion: ${error.message}`);
        
        // Fallback - just show basic results
        const resultsEmbed = createResultsEmbed(game, game.payoutResults || [], game.pots);
        await interaction.update({ embeds: [resultsEmbed], components: [] });
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('texasholdem')
        .setDescription('🃏 Start a multiplayer Texas Hold\'em poker game')
        .addStringOption(option =>
            option.setName('buyin')
                .setDescription('Buy-in amount for all players (supports K/M/B, "all", "half")')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('maxplayers')
                .setDescription('Maximum number of players (2-9)')
                .setRequired(false)
                .setMinValue(2)
                .setMaxValue(9)
        )
        .addBooleanOption(option =>
            option.setName('tournament')
                .setDescription('Enable tournament mode with increasing blinds')
                .setRequired(false)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const channelId = interaction.channelId;
        const guildId = await getGuildId(interaction);
        const username = interaction.user.displayName;
        const buyInStr = interaction.options.getString('buyin');
        const maxPlayers = interaction.options.getInteger('maxplayers') || 6;
        const tournamentMode = interaction.options.getBoolean('tournament') || false;

        logger.debug(`Texas Hold'em execute called by ${username} (${userId}) in guild ${guildId} buyin='${buyInStr}'`);

        try {
            // Check maintenance mode first
            const maintenanceGuard = require('../UTILS/maintenanceGuard');
            const maintenanceCheck = await maintenanceGuard.check(guildId, 'texasholdem');
            if (!maintenanceCheck.allowed) {
                return await interaction.reply({ embeds: [maintenanceCheck.embed], flags: MessageFlags.Ephemeral });
            }

            // Check if game already exists in this channel
            const existingGame = getTexasHoldemGame(channelId);
            if (existingGame) {
                if (existingGame.gameActive) {
                    const gameData = await createGameEmbed(existingGame);
                    const components = createActionButtons(existingGame);
                    const messageData = { embeds: [gameData.embed], components };
                    if (gameData.tableImage) {
                        messageData.files = [{ attachment: gameData.tableImage, name: 'poker-table.png' }];
                    }
                    
                    await interaction.reply(messageData);
                    
                    // Send private hand info if player is in game
                    if (existingGame.players.has(userId)) {
                        const privateData = await createPrivatePlayerEmbed(existingGame, userId);
                        const messageData = { 
                            embeds: [privateData.embed], 
                            flags: MessageFlags.Ephemeral 
                        };
                        if (privateData.image) {
                            messageData.files = [{ attachment: privateData.image, name: 'private-hand.png' }];
                        }
                        await interaction.followUp(messageData);
                    }
                    return;
                } else {
                    const embed = createLobbyEmbed(existingGame, guildId);
                    const components = createLobbyButtons(existingGame);
                    return await interaction.reply({ embeds: [embed], components });
                }
            }

            // Validate session before proceeding
            const sessionGuard = require('../UTILS/sessionGuard');
            const check = await sessionGuard.check(userId, guildId, SMGameType.TEXAS_HOLDEM, interaction.client);
            if (!check.allowed) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Session Error')
                    .setDescription(check.message)
                    .setColor(0xFF0000)
                    .setTimestamp();
                return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Parse and validate buy-in amount
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            const buyInAmount = parseAmount(buyInStr, userBalance.wallet + userBalance.bank);
            
            if (isNaN(buyInAmount) || buyInAmount < MIN_BUY_IN) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Invalid Buy-in')
                    .setDescription(`Buy-in must be at least ${fmt(MIN_BUY_IN)}`)
                    .setColor(0xFF0000);
                return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
            
            if (buyInAmount > MAX_BUY_IN) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Invalid Buy-in')
                    .setDescription(`Buy-in cannot exceed ${fmt(MAX_BUY_IN)}`)
                    .setColor(0xFF0000);
                return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Check if user has sufficient funds
            const totalFunds = userBalance.wallet + userBalance.bank;
            if (buyInAmount > totalFunds) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Insufficient Funds')
                    .setDescription(`You need ${fmt(buyInAmount)} but only have ${fmt(totalFunds)}`)
                    .setColor(0xFF0000);
                return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Initialize AI systems
            await tuningManager.initialize();
            await allInManager.initialize();

            // Create game
            const blindStructure = {
                small: Math.max(Math.floor(buyInAmount * 0.005), 1),
                big: Math.max(Math.floor(buyInAmount * 0.01), 2)
            };

            const game = createTexasHoldemGame(channelId, userId, buyInAmount, {
                blindStructure,
                tournamentMode,
                maxPlayers: maxPlayers || 6,  // Use the actual maxPlayers parameter
                minPlayers: 2
            });

            // Create lobby embed and buttons
            const lobbyEmbed = createLobbyEmbed(game, guildId);
            const lobbyButtons = createLobbyButtons(game);

            await interaction.reply({ 
                embeds: [lobbyEmbed], 
                components: lobbyButtons 
            });

            logger.info(`Texas Hold'em lobby created by ${username} in channel ${channelId} with buy-in ${fmt(buyInAmount)}`);

            // Log game creation
            await sendLogMessage(
                interaction.client,
                'game',
                `Texas Hold'em lobby created: ${username} with buy-in ${fmt(buyInAmount)}`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error in Texas Hold'em command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Texas Hold\'em Error')
                .setDescription('An error occurred while creating the game. Please try again.')
                .setColor(0xFF0000);

            if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            } else {
                logger.warn('Cannot send main execute error reply - interaction not repliable or already handled');
            }
        }
    },

    // Handle Texas Hold'em button actions
    handleTexasHoldemAction: async function(interaction, actionId) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const channelId = interaction.channelId;
        
        logger.debug(`Texas Hold'em action '${actionId}' by ${userId} in guild ${guildId}`);
        
        try {
            const game = getTexasHoldemGame(channelId);
            if (!game) {
                if (interaction.isRepliable()) {
                    return await interaction.reply({ 
                        content: 'No active Texas Hold\'em game found in this channel.', 
                        flags: MessageFlags.Ephemeral 
                    });
                } else {
                    logger.warn('Cannot send game not found reply - interaction not repliable');
                    return;
                }
            }

            const user = interaction.user;
            const username = user.displayName;

            switch (actionId) {
                case 'join':
                case 'general-join': {
                    if (game.players.has(userId)) {
                        if (interaction.isRepliable()) {
                            return await interaction.reply({ 
                                content: 'You are already in the game!', 
                                flags: MessageFlags.Ephemeral 
                            });
                        } else {
                            logger.warn('Cannot send already in game reply - interaction not repliable');
                            return;
                        }
                    }

                    if (game.gameActive) {
                        if (interaction.isRepliable()) {
                            return await interaction.reply({ 
                                content: 'Cannot join game in progress.', 
                                flags: MessageFlags.Ephemeral 
                            });
                        } else {
                            logger.warn('Cannot send join in progress reply - interaction not repliable');
                            return;
                        }
                    }

                    // Validate and deduct buy-in
                    const validation = await PayoutManager.validateAndDeductBet(
                        interaction,
                        game.buyInAmount.toString(),
                        GameType.POKER,
                        game.buyInAmount,
                        null
                    );

                    if (!validation.isValid) {
                        return await interaction.reply({ embeds: [validation.errorEmbed], flags: MessageFlags.Ephemeral });
                    }

                    // Add player to game
                    game.addPlayer(userId, username, game.buyInAmount);

                    // Update the lobby display for everyone
                    const lobbyEmbed = createLobbyEmbed(game, guildId);
                    // Create buttons that work for any user viewing the message
                    const lobbyButtons = createLobbyButtons(game);

                    await interaction.update({ embeds: [lobbyEmbed], components: lobbyButtons });

                    logger.info(`Player ${username} joined Texas Hold'em game in channel ${channelId}`);
                    break;
                }

                case 'leave':
                case 'player-leave': {
                    if (!game.players.has(userId)) {
                        if (interaction.isRepliable()) {
                            return await interaction.reply({ 
                                content: 'You are not in the game!', 
                                flags: MessageFlags.Ephemeral 
                            });
                        } else {
                            logger.warn('Cannot send not in game reply - interaction not repliable');
                            return;
                        }
                    }

                    // Refund buy-in if game hasn't started
                    if (!game.gameActive) {
                        await dbManager.updateUserBalance(userId, guildId, game.buyInAmount, 0);
                    }

                    game.removePlayer(userId);

                    // Update the lobby display for everyone
                    const lobbyEmbed = createLobbyEmbed(game, guildId);
                    // Create buttons that work for any user viewing the message
                    const lobbyButtons = createLobbyButtons(game);

                    await interaction.update({ embeds: [lobbyEmbed], components: lobbyButtons });

                    logger.info(`Player ${username} left Texas Hold'em game in channel ${channelId}`);
                    break;
                }

                case 'start':
                case 'creator-start': {
                    if (game.creatorId !== userId) {
                        if (interaction.isRepliable()) {
                            return await interaction.reply({ 
                                content: 'Only the game creator can start the game!', 
                                flags: MessageFlags.Ephemeral 
                            });
                        } else {
                            logger.warn('Cannot send creator only reply - interaction not repliable');
                            return;
                        }
                    }

                    if (game.seatOrder.length < game.minPlayers) {
                        if (interaction.isRepliable()) {
                            return await interaction.reply({ 
                                content: `Need at least ${game.minPlayers} players to start!`, 
                                flags: MessageFlags.Ephemeral 
                            });
                        } else {
                            logger.warn('Cannot send min players reply - interaction not repliable');
                            return;
                        }
                    }

                    game.startGame();

                    await updateGameStateForAllPlayers(game, interaction);
                    
                    // Send private hands to all players when game starts
                    for (const player of game.players.values()) {
                        if (player.userId !== userId) {
                            // Other players will get their private hands when they next interact
                            continue;
                        }
                    }

                    logger.info(`Texas Hold'em game started in channel ${channelId} with ${game.seatOrder.length} players`);
                    break;
                }

                case 'cancel':
                case 'creator-cancel': {
                    if (game.creatorId !== userId) {
                        return await interaction.reply({ 
                            content: 'Only the game creator can cancel the game!', 
                            flags: MessageFlags.Ephemeral 
                        });
                    }

                    // Refund all players
                    for (const player of game.players.values()) {
                        await dbManager.updateUserBalance(player.userId, guildId, game.buyInAmount, 0);
                    }

                    deleteTexasHoldemGame(channelId);

                    const cancelEmbed = new EmbedBuilder()
                        .setTitle('❌ Game Cancelled')
                        .setDescription('The Texas Hold\'em game has been cancelled. All buy-ins have been refunded.')
                        .setColor(0xFF0000);

                    await interaction.update({ embeds: [cancelEmbed], components: [] });

                    logger.info(`Texas Hold'em game cancelled in channel ${channelId}`);
                    break;
                }

                // Game actions (with action- prefix)
                case `action-${BETTING_ACTIONS.FOLD}`:
                case `action-${BETTING_ACTIONS.CHECK}`:
                case `action-${BETTING_ACTIONS.CALL}`:
                case `action-${BETTING_ACTIONS.ALL_IN}`:
                case BETTING_ACTIONS.FOLD:
                case BETTING_ACTIONS.CHECK:
                case BETTING_ACTIONS.CALL:
                case BETTING_ACTIONS.ALL_IN: {
                    if (!game.gameActive) {
                        if (interaction.isRepliable()) {
                            return await interaction.reply({ 
                                content: 'Game is not active!', 
                                flags: MessageFlags.Ephemeral 
                            });
                        } else {
                            logger.warn('Cannot send game not active reply - interaction not repliable');
                            return;
                        }
                    }

                    if (!game.isPlayerTurn(userId)) {
                        if (interaction.isRepliable()) {
                            return await interaction.reply({ 
                                content: 'It\'s not your turn!', 
                                flags: MessageFlags.Ephemeral 
                            });
                        } else {
                            logger.warn('Cannot send not your turn reply - interaction not repliable');
                            return;
                        }
                    }

                    // Extract the actual action from the actionId (remove action- prefix if present)
                    const actualAction = actionId.startsWith('action-') ? actionId.replace('action-', '') : actionId;
                    await game.processPlayerAction(userId, actualAction);

                    // Check if hand ended and process payouts (either showdown or uncontested win)
                    if (game.payoutResults) {
                        await processHandCompletion(game, interaction);
                        return;
                    }

                    await updateGameStateForAllPlayers(game, interaction);
                    break;
                }

                case `action-${BETTING_ACTIONS.BET}`:
                case `action-${BETTING_ACTIONS.RAISE}`:
                case BETTING_ACTIONS.BET:
                case BETTING_ACTIONS.RAISE: {
                    if (!game.gameActive) {
                        if (interaction.isRepliable()) {
                            return await interaction.reply({ 
                                content: 'Game is not active!', 
                                flags: MessageFlags.Ephemeral 
                            });
                        } else {
                            logger.warn('Cannot send game not active reply - interaction not repliable');
                            return;
                        }
                    }

                    if (!game.isPlayerTurn(userId)) {
                        if (interaction.isRepliable()) {
                            return await interaction.reply({ 
                                content: 'It\'s not your turn!', 
                                flags: MessageFlags.Ephemeral 
                            });
                        } else {
                            logger.warn('Cannot send not your turn reply - interaction not repliable');
                            return;
                        }
                    }

                    // Show bet amount selection
                    const actualAction = actionId.startsWith('action-') ? actionId.replace('action-', '') : actionId;
                    const betMenu = createBetAmountMenu(game, userId, actualAction);
                    if (betMenu) {
                        const gameData = await createGameEmbed(game);
                        
                        // IMPORTANT: Keep action buttons AND add bet menu
                        const actionButtons = createActionButtons(game);
                        const allComponents = [...actionButtons, betMenu];
                        
                        const messageData = { embeds: [gameData.embed], components: allComponents };
                        if (gameData.tableImage) {
                            messageData.files = [{ attachment: gameData.tableImage, name: 'poker-table.png' }];
                        }
                        await interaction.update(messageData);
                        
                        // Send private hand info
                        const privateData = await createPrivatePlayerEmbed(game, userId);
                        const privateMessageData = { 
                            embeds: [privateData.embed], 
                            flags: MessageFlags.Ephemeral 
                        };
                        if (privateData.image) {
                            privateMessageData.files = [{ attachment: privateData.image, name: 'private-hand.png' }];
                        }
                        await interaction.followUp(privateMessageData);
                    } else {
                        return await interaction.reply({ 
                            content: 'Invalid betting action!', 
                            flags: MessageFlags.Ephemeral 
                        });
                    }
                    break;
                }

                case 'continue':
                case 'action-continue': {
                    if (!game.gameActive || !game.readyForNextHand) {
                        return await interaction.reply({ 
                            content: 'Cannot continue - game is not ready for next hand!', 
                            flags: MessageFlags.Ephemeral 
                        });
                    }
                    
                    // Start the next hand
                    game.readyForNextHand = false;
                    game.startNewHand();
                    
                    // Update the game state for all players
                    await updateGameStateForAllPlayers(game, interaction);
                    break;
                }
                
                case 'quit':
                case 'action-quit': {
                    if (!game.players.has(userId)) {
                        return await interaction.reply({ 
                            content: 'You are not in the game!', 
                            flags: MessageFlags.Ephemeral 
                        });
                    }
                    
                    // Remove player from game
                    game.removePlayer(userId);
                    
                    // Check if game should end
                    if (game.getActivePlayers().length < 2) {
                        // Refund remaining player if any
                        const remainingPlayers = game.getActivePlayers();
                        if (remainingPlayers.length === 1) {
                            const lastPlayer = remainingPlayers[0];
                            await dbManager.updateUserBalance(lastPlayer.userId, guildId, lastPlayer.chipCount, 0);
                        }
                        
                        deleteTexasHoldemGame(channelId);
                        
                        const endEmbed = new EmbedBuilder()
                            .setTitle('🎮 Game Over')
                            .setDescription('Texas Hold\'em game has ended due to insufficient players.')
                            .setColor(0xFF0000);
                        
                        await interaction.update({ embeds: [endEmbed], components: [] });
                    } else {
                        // Continue with remaining players
                        await updateGameStateForAllPlayers(game, interaction);
                    }
                    break;
                }
                
                case 'checkhand':
                case 'action-checkhand':
                case 'player-checkhand': {
                    if (!game.gameActive) {
                        return await interaction.reply({ 
                            content: 'No active game to check hand!', 
                            flags: MessageFlags.Ephemeral 
                        });
                    }

                    const privateData = await createPrivatePlayerEmbed(game, userId);
                    const messageData = { 
                        embeds: [privateData.embed], 
                        flags: MessageFlags.Ephemeral 
                    };
                    if (privateData.image) {
                        messageData.files = [{ attachment: privateData.image, name: 'private-hand.png' }];
                    }
                    await interaction.reply(messageData);
                    break;
                }

                case 'help':
                case 'general-help': {
                    const helpEmbed = new EmbedBuilder()
                        .setTitle('🃏 Texas Hold\'em Help')
                        .setDescription('**How to Play Texas Hold\'em Poker**')
                        .addFields(
                            {
                                name: '🎯 Objective',
                                value: 'Make the best 5-card hand using your 2 hole cards and the 5 community cards',
                                inline: false
                            },
                            {
                                name: '🃏 Hand Rankings (Best to Worst)',
                                value: '1. Royal Flush\n2. Straight Flush\n3. Four of a Kind\n4. Full House\n5. Flush\n6. Straight\n7. Three of a Kind\n8. Two Pair\n9. Pair\n10. High Card',
                                inline: false
                            },
                            {
                                name: '🎮 Actions',
                                value: '**Fold:** Give up your hand\n**Check:** Pass if no bet\n**Call:** Match current bet\n**Bet:** Place first bet\n**Raise:** Increase the bet\n**All-In:** Bet all your chips',
                                inline: false
                            },
                            {
                                name: '🔄 Betting Rounds',
                                value: '1. **Pre-flop:** 2 hole cards dealt\n2. **Flop:** 3 community cards\n3. **Turn:** 4th community card\n4. **River:** 5th community card\n5. **Showdown:** Best hand wins',
                                inline: false
                            }
                        )
                        .setColor(0x0066CC)
                        .setTimestamp();

                    if (interaction.isRepliable()) {
                        await interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
                    } else {
                        logger.warn('Cannot send help reply - interaction not repliable');
                    }
                    break;
                }

                default:
                    logger.warn(`Unknown Texas Hold'em action: ${actionId}`);
                    if (interaction.isRepliable()) {
                        await interaction.reply({ 
                            content: 'Unknown action!', 
                            flags: MessageFlags.Ephemeral 
                        });
                    } else {
                        logger.warn('Cannot send unknown action reply - interaction not repliable');
                    }
            }

        } catch (error) {
            logger.error(`Texas Hold'em action error (${actionId}): ${error.message}`);
            
            // Check if interaction is still valid before responding
            if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: '❌ Error processing action. Please try again.', 
                    flags: MessageFlags.Ephemeral 
                });
            } else {
                logger.warn('Cannot send action error reply - interaction not repliable or already handled');
            }
        }
    },

    // Handle bet amount selection
    handleBetAmountSelection: async function(interaction, selection) {
        const userId = interaction.user.id;
        const channelId = interaction.channelId;
        
        try {
            const game = getTexasHoldemGame(channelId);
            if (!game || !game.gameActive) {
                if (interaction.isRepliable()) {
                    return await interaction.reply({ 
                        content: 'No active game found!', 
                        flags: MessageFlags.Ephemeral 
                    });
                } else {
                    logger.warn('Cannot send no active game reply - interaction not repliable');
                    return;
                }
            }

            if (!game.isPlayerTurn(userId)) {
                if (interaction.isRepliable()) {
                    return await interaction.reply({ 
                        content: 'It\'s not your turn!', 
                        flags: MessageFlags.Ephemeral 
                    });
                } else {
                    logger.warn('Cannot send not your turn reply - interaction not repliable');
                    return;
                }
            }

            const [action, amountStr] = selection.split('_');
            
            // Handle custom amount selection
            if (amountStr === 'custom') {
                const player = game.players.get(userId);
                let minBet, maxBet;
                
                if (action === BETTING_ACTIONS.BET) {
                    minBet = game.blindStructure.big;
                    maxBet = player.chipCount;
                } else if (action === BETTING_ACTIONS.RAISE) {
                    const callAmount = game.currentBet - player.currentBet;
                    minBet = Math.max(game.currentBet + game.minRaise, callAmount + game.minRaise);
                    maxBet = player.chipCount + player.currentBet;
                }
                
                const modal = createCustomAmountModal(action, minBet, maxBet);
                await interaction.showModal(modal);
                return;
            }

            const amount = parseInt(amountStr);
            if (isNaN(amount)) {
                if (interaction.isRepliable()) {
                    return await interaction.reply({ 
                        content: 'Invalid amount!', 
                        flags: MessageFlags.Ephemeral 
                    });
                } else {
                    logger.warn('Cannot send invalid amount reply - interaction not repliable');
                    return;
                }
            }

            await game.processPlayerAction(userId, action, amount);

            // Check if hand ended and process payouts (either showdown or uncontested win)
            if (game.payoutResults) {
                await processHandCompletion(game, interaction);
                return;
            }

            await updateGameStateForAllPlayers(game, interaction);

        } catch (error) {
            logger.error(`Bet amount selection error: ${error.message}`);
            
            if (interaction.isRepliable()) {
                await interaction.reply({ 
                    content: `❌ Error: ${error.message}`, 
                    flags: MessageFlags.Ephemeral 
                });
            } else {
                logger.warn('Cannot send bet error reply - interaction not repliable');
            }
        }
    },

    // Handle custom amount modal submission
    handleCustomAmountModal: async function(interaction, modalAction) {
        const userId = interaction.user.id;
        const channelId = interaction.channelId;
        const guildId = await getGuildId(interaction);
        
        try {
            const game = getTexasHoldemGame(channelId);
            if (!game || !game.gameActive) {
                return await interaction.reply({ 
                    content: 'No active game found!', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            if (!game.isPlayerTurn(userId)) {
                return await interaction.reply({ 
                    content: 'It\'s not your turn!', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            const amountInput = interaction.fields.getTextInputValue('amount');
            const amount = parseAmount(amountInput);
            
            if (!amount || amount <= 0) {
                return await interaction.reply({ 
                    content: 'Please enter a valid amount!', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            await game.processPlayerAction(userId, modalAction, amount);

            // Check if hand ended and process payouts (either showdown or uncontested win)
            if (game.payoutResults) {
                await processHandCompletion(game, interaction);
                return;
            }

            await updateGameStateForAllPlayers(game, interaction);

        } catch (error) {
            logger.error(`Custom amount modal error: ${error.message}`);
            
            await interaction.reply({ 
                content: `❌ Error: ${error.message}`, 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
};