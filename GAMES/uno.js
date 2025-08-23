/**
 * UNO Game Implementation for ATIVE Casino Bot
 * Multiplayer card game with betting system
 * Features visual cards, special actions, and tournament-style gameplay
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { secureRandomInt } = require('../UTILS/rng');
const { fmt } = require('../UTILS/common');
const path = require('path');

// Card colors and types
const UNO_COLORS = ['Red', 'Blue', 'Green', 'Yellow'];
const UNO_NUMBERS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const UNO_ACTIONS = ['Skip', 'Reverse', 'Draw'];
const UNO_WILDS = ['Wild', 'Wild_Draw'];

class UnoCard {
    constructor(color, value, type = 'number') {
        this.color = color;
        this.value = value;
        this.type = type; // 'number', 'action', 'wild'
        this.points = this.calculatePoints();
    }

    calculatePoints() {
        if (this.type === 'wild') {
            return this.value === 'Wild_Draw' ? 50 : 50;
        }
        if (this.type === 'action') {
            return 20;
        }
        return parseInt(this.value) || 0;
    }

    toString() {
        if (this.type === 'wild') {
            return this.value === 'Wild_Draw' ? 'Wild +4' : 'Wild';
        }
        if (this.type === 'action') {
            const actionMap = {
                'Skip': 'Skip',
                'Reverse': 'Reverse',
                'Draw': '+2'
            };
            return `${this.color} ${actionMap[this.value]}`;
        }
        return `${this.color} ${this.value}`;
    }

    getImagePath() {
        const baseDir = '/assets/uno/';
        if (this.type === 'wild') {
            return path.join(baseDir, `${this.value}.png`);
        }
        return path.join(baseDir, `${this.color}_${this.value}.png`);
    }

    canPlayOn(topCard, currentColor = null) {
        // Wild cards can be played on anything
        if (this.type === 'wild') {
            return true;
        }

        // Same color or same value
        if (this.color === topCard.color || this.value === topCard.value) {
            return true;
        }

        // Check current color if it was changed by a wild card
        if (currentColor && this.color === currentColor) {
            return true;
        }

        return false;
    }
}

class UnoPlayer {
    constructor(userId, username, betAmount) {
        this.userId = userId;
        this.username = username;
        this.betAmount = betAmount;
        this.hand = [];
        this.isActive = true;
        this.hasCalledUno = false;
        this.skipped = false;
        this.timeLastPlayed = Date.now();
    }

    addCard(card) {
        this.hand.push(card);
        // Reset UNO call if player draws cards and has more than 2
        if (this.hand.length > 2) {
            this.hasCalledUno = false;
        }
    }

    removeCard(cardIndex) {
        if (cardIndex >= 0 && cardIndex < this.hand.length) {
            return this.hand.splice(cardIndex, 1)[0];
        }
        return null;
    }

    getPlayableCards(topCard, currentColor = null) {
        return this.hand
            .map((card, index) => ({ card, index }))
            .filter(({ card }) => card.canPlayOn(topCard, currentColor));
    }

    getHandValue() {
        return this.hand.reduce((sum, card) => sum + card.points, 0);
    }

    hasWon() {
        return this.hand.length === 0;
    }

    canCallUno() {
        return this.hand.length === 2 && !this.hasCalledUno;
    }

    getHandDisplay(showCards = false) {
        if (!showCards) {
            return `${this.hand.length} cards`;
        }
        
        return this.hand.map((card, index) => `${index + 1}. ${card.toString()}`).join('\n');
    }
}

class UnoGameSession {
    constructor(channelId, guildId, starterBet) {
        this.channelId = channelId;
        this.guildId = guildId;
        this.starterBet = starterBet;
        this.players = new Map();
        this.deck = [];
        this.discardPile = [];
        this.currentPlayerIndex = 0;
        this.direction = 1; // 1 for clockwise, -1 for counter-clockwise
        this.gameActive = false;
        this.waitingForPlayers = true;
        this.gameEnded = false;
        this.currentColor = null;
        this.drawStack = 0; // For stacking +2 and +4 cards
        this.winner = null;
        this.gameStartTime = null;
        this.turnTimeout = 60; // 60 seconds per turn
        this.currentTurnTimeout = null;
        this.gameChannel = null;
        this.mainGameInteraction = null;
        this.maxPlayers = 8;
        this.minPlayers = 2;
    }

    createDeck() {
        const deck = [];

        // Add number cards (0-9)
        for (const color of UNO_COLORS) {
            // One 0 card per color
            deck.push(new UnoCard(color, '0', 'number'));
            
            // Two of each number 1-9 per color
            for (const number of UNO_NUMBERS.slice(1)) {
                deck.push(new UnoCard(color, number, 'number'));
                deck.push(new UnoCard(color, number, 'number'));
            }

            // Action cards (two of each per color)
            for (const action of UNO_ACTIONS) {
                deck.push(new UnoCard(color, action, 'action'));
                deck.push(new UnoCard(color, action, 'action'));
            }
        }

        // Wild cards (4 of each)
        for (let i = 0; i < 4; i++) {
            deck.push(new UnoCard(null, 'Wild', 'wild'));
            deck.push(new UnoCard(null, 'Wild_Draw', 'wild'));
        }

        return deck;
    }

    shuffleDeck(deck = this.deck) {
        // Fisher-Yates shuffle with secure random
        for (let i = deck.length - 1; i > 0; i--) {
            const j = secureRandomInt(0, i + 1);
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    dealCards() {
        const playerArray = Array.from(this.players.values());
        
        // Deal 7 cards to each player
        for (let i = 0; i < 7; i++) {
            for (const player of playerArray) {
                if (this.deck.length === 0) {
                    this.reshuffleDeck();
                }
                player.addCard(this.deck.pop());
            }
        }

        // Place first card on discard pile
        let firstCard;
        do {
            if (this.deck.length === 0) {
                this.reshuffleDeck();
            }
            firstCard = this.deck.pop();
        } while (firstCard.type === 'wild' || (firstCard.type === 'action' && firstCard.value === 'Draw'));

        this.discardPile.push(firstCard);
        this.currentColor = firstCard.color;
    }

    reshuffleDeck() {
        if (this.discardPile.length <= 1) return;

        // Keep the top card, shuffle the rest back into deck
        const topCard = this.discardPile.pop();
        this.deck = this.shuffleDeck([...this.discardPile]);
        this.discardPile = [topCard];

        // Reset wild card colors in reshuffled cards
        this.deck.forEach(card => {
            if (card.type === 'wild') {
                card.color = null;
            }
        });
    }

    drawCard(player, count = 1) {
        for (let i = 0; i < count; i++) {
            if (this.deck.length === 0) {
                this.reshuffleDeck();
                if (this.deck.length === 0) break; // Shouldn't happen, but safety check
            }
            player.addCard(this.deck.pop());
        }
    }

    addPlayer(userId, username) {
        if (this.players.has(userId)) return false;
        if (this.players.size >= this.maxPlayers) return false;
        if (this.gameActive) return false;

        this.players.set(userId, new UnoPlayer(userId, username, this.starterBet));
        return true;
    }

    removePlayer(userId) {
        if (!this.players.has(userId)) return false;
        if (this.gameActive) return false;

        this.players.delete(userId);
        return true;
    }

    canStartGame() {
        return this.players.size >= this.minPlayers && !this.gameActive;
    }

    startGame() {
        if (!this.canStartGame()) return false;

        this.gameActive = true;
        this.waitingForPlayers = false;
        this.gameStartTime = Date.now();
        
        // Create and shuffle deck
        this.deck = this.createDeck();
        this.shuffleDeck();

        // Deal initial cards
        this.dealCards();

        // Set random starting player
        this.currentPlayerIndex = secureRandomInt(0, this.players.size);

        // Handle special first card effects
        const topCard = this.getTopCard();
        if (topCard.type === 'action') {
            this.handleActionCard(topCard);
        }

        this.startTurnTimeout();
        return true;
    }

    getCurrentPlayer() {
        const playerArray = Array.from(this.players.values());
        return playerArray[this.currentPlayerIndex];
    }

    getNextPlayerIndex() {
        const playerCount = this.players.size;
        return (this.currentPlayerIndex + this.direction + playerCount) % playerCount;
    }

    nextTurn() {
        this.currentPlayerIndex = this.getNextPlayerIndex();
        this.clearTurnTimeout();
        
        // Skip players who are no longer active
        let attempts = 0;
        while (!this.getCurrentPlayer().isActive && attempts < this.players.size) {
            this.currentPlayerIndex = this.getNextPlayerIndex();
            attempts++;
        }

        if (attempts < this.players.size) {
            this.startTurnTimeout();
        }
    }

    getTopCard() {
        return this.discardPile[this.discardPile.length - 1];
    }

    playCard(player, cardIndex, chosenColor = null) {
        const card = player.removeCard(cardIndex);
        if (!card) return false;

        // Place card on discard pile
        this.discardPile.push(card);

        // Handle wild card color change
        if (card.type === 'wild') {
            this.currentColor = chosenColor || UNO_COLORS[secureRandomInt(0, UNO_COLORS.length)];
            card.color = this.currentColor; // Temporarily set for display
        } else {
            this.currentColor = card.color;
        }

        // Handle action cards
        if (card.type === 'action' || (card.type === 'wild' && card.value === 'Wild_Draw')) {
            this.handleActionCard(card);
        } else {
            this.nextTurn();
        }

        // Check for win condition
        if (player.hasWon()) {
            this.endGame(player);
            return true;
        }

        // Check if player should have called UNO
        if (player.hand.length === 1 && !player.hasCalledUno) {
            // Penalty: draw 2 cards
            this.drawCard(player, 2);
        }

        return true;
    }

    handleActionCard(card) {
        switch (card.value) {
            case 'Skip':
                this.nextTurn(); // Skip next player
                this.nextTurn(); // Move to player after
                break;

            case 'Reverse':
                this.direction *= -1;
                if (this.players.size === 2) {
                    // In 2-player game, reverse acts like skip
                    this.nextTurn();
                }
                this.nextTurn();
                break;

            case 'Draw':
                this.drawStack += 2;
                this.nextTurn();
                break;

            case 'Wild_Draw':
                this.drawStack += 4;
                this.nextTurn();
                break;

            default:
                this.nextTurn();
                break;
        }
    }

    handleDrawStack() {
        if (this.drawStack > 0) {
            const currentPlayer = this.getCurrentPlayer();
            this.drawCard(currentPlayer, this.drawStack);
            this.drawStack = 0;
            this.nextTurn();
            return true;
        }
        return false;
    }

    callUno(player) {
        if (player.canCallUno()) {
            player.hasCalledUno = true;
            return true;
        }
        return false;
    }

    startTurnTimeout() {
        if (this.currentTurnTimeout) {
            clearTimeout(this.currentTurnTimeout);
        }

        this.currentTurnTimeout = setTimeout(() => {
            // Auto-draw and skip turn
            const currentPlayer = this.getCurrentPlayer();
            if (this.drawStack > 0) {
                this.handleDrawStack();
            } else {
                this.drawCard(currentPlayer, 1);
                this.nextTurn();
            }
        }, this.turnTimeout * 1000);
    }

    clearTurnTimeout() {
        if (this.currentTurnTimeout) {
            clearTimeout(this.currentTurnTimeout);
            this.currentTurnTimeout = null;
        }
    }

    endGame(winner = null) {
        this.gameEnded = true;
        this.winner = winner;
        this.clearTurnTimeout();
        
        if (winner) {
            // Calculate points from other players' hands
            let totalPoints = 0;
            for (const player of this.players.values()) {
                if (player.userId !== winner.userId) {
                    totalPoints += player.getHandValue();
                }
            }
            winner.points = totalPoints;
        }
    }

    forceEndGame() {
        this.endGame();
    }

    // UI Generation Methods
    getLobbyEmbed(notification = null) {
        const embed = new EmbedBuilder()
            .setTitle('<� UNO Game Lobby')
            .setDescription('Join the UNO game!')
            .setColor(0xFF0000);

        if (notification) {
            embed.setDescription(embed.data.description + `\n\n${notification}`);
        }

        if (this.players.size > 0) {
            const playerList = Array.from(this.players.values())
                .map(p => `" **${p.username}**`)
                .join('\n');

            embed.addFields({
                name: `Players (${this.players.size}/${this.maxPlayers})`,
                value: playerList,
                inline: false
            });
        } else {
            embed.addFields({
                name: 'Players',
                value: 'No players yet!',
                inline: false
            });
        }

        embed.addFields({
            name: 'Game Info',
            value: `" **Buy-in:** ${fmt(this.starterBet)}\n" **Min Players:** ${this.minPlayers}\n" **Max Players:** ${this.maxPlayers}\n" **Turn Timeout:** ${this.turnTimeout}s`,
            inline: false
        });

        embed.setFooter({ text: '<� Classic UNO with a twist!' });
        return embed;
    }

    getGameEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('<� UNO Game in Progress')
            .setColor(this.getColorCode(this.currentColor));

        const currentPlayer = this.getCurrentPlayer();
        const topCard = this.getTopCard();

        embed.setDescription(
            `**Current Player:** ${currentPlayer.username}\n` +
            `**Top Card:** ${topCard.toString()}\n` +
            `**Current Color:** ${this.currentColor || topCard.color}`
        );

        // Player status
        const playerStatus = Array.from(this.players.values())
            .map(p => {
                let status = `**${p.username}:** ${p.hand.length} cards`;
                if (p.hasCalledUno && p.hand.length === 1) {
                    status += ' =% UNO!';
                }
                if (p.userId === currentPlayer.userId) {
                    status = `� ${status}`;
                }
                return status;
            })
            .join('\n');

        embed.addFields({
            name: '=e Players',
            value: playerStatus,
            inline: false
        });

        if (this.drawStack > 0) {
            embed.addFields({
                name: '� Draw Stack',
                value: `+${this.drawStack} cards to draw!`,
                inline: true
            });
        }

        const remainingCards = this.deck.length;
        embed.addFields({
            name: '=� Deck',
            value: `${remainingCards} cards remaining`,
            inline: true
        });

        embed.setFooter({ text: `Direction: ${this.direction === 1 ? 'Clockwise' : 'Counter-clockwise'} | Prize Pool: ${fmt(this.players.size * this.starterBet)}` });
        return embed;
    }

    getPlayerHandEmbed(player) {
        const embed = new EmbedBuilder()
            .setTitle('<� Your UNO Hand')
            .setColor(0x0000FF);

        const topCard = this.getTopCard();
        const playableCards = player.getPlayableCards(topCard, this.currentColor);

        embed.setDescription(
            `**Top Card:** ${topCard.toString()}\n` +
            `**Current Color:** ${this.currentColor || topCard.color}\n` +
            `**Your Turn:** ${player.userId === this.getCurrentPlayer().userId ? 'Yes �' : 'No'}`
        );

        embed.addFields({
            name: `<� Your Cards (${player.hand.length})`,
            value: player.getHandDisplay(true) || 'No cards',
            inline: false
        });

        if (playableCards.length > 0) {
            const playableText = playableCards
                .map(({ card, index }) => `${index + 1}. ${card.toString()}`)
                .join('\n');

            embed.addFields({
                name: ' Playable Cards',
                value: playableText,
                inline: false
            });
        }

        if (player.canCallUno()) {
            embed.addFields({
                name: '=% UNO Available!',
                value: 'You can call UNO!',
                inline: false
            });
        }

        return embed;
    }

    getColorCode(color) {
        const colors = {
            'Red': 0xFF0000,
            'Blue': 0x0000FF,
            'Green': 0x00FF00,
            'Yellow': 0xFFFF00
        };
        return colors[color] || 0x808080;
    }

    createLobbyButtons() {
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`uno_join_${this.channelId}`)
                    .setLabel('Join Game')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('<�'),
                new ButtonBuilder()
                    .setCustomId(`uno_start_${this.channelId}`)
                    .setLabel('Start Game')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('=�')
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`uno_leave_${this.channelId}`)
                    .setLabel('Leave Game')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('=�')
            );

        const row3 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`uno_help_${this.channelId}`)
                    .setLabel('?')
                    .setStyle(ButtonStyle.Secondary)
            );

        return [row1, row2, row3];
    }

    createGameButtons(player) {
        const isCurrentPlayer = player.userId === this.getCurrentPlayer().userId;

        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`uno_hand_${this.channelId}`)
                    .setLabel('Show Hand')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('<�'),
                new ButtonBuilder()
                    .setCustomId(`uno_draw_${this.channelId}`)
                    .setLabel('Draw Card')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('=�')
                    .setDisabled(!isCurrentPlayer),
                new ButtonBuilder()
                    .setCustomId(`uno_play_${this.channelId}`)
                    .setLabel('Play Card')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('�')
                    .setDisabled(!isCurrentPlayer)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`uno_uno_${this.channelId}`)
                    .setLabel('Call UNO!')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('=%')
                    .setDisabled(!player.canCallUno()),
                new ButtonBuilder()
                    .setCustomId(`uno_status_${this.channelId}`)
                    .setLabel('Game Status')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('=�')
            );

        return [row1, row2];
    }

    static getHelpEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('<� UNO Game Guide')
            .setDescription('Learn how to play UNO!')
            .setColor(0xFF0000);

        embed.addFields(
            {
                name: '<� Game Overview',
                value: '" **Players:** 2-8 per game\n" **Buy-in:** Set by game starter\n" **Goal:** Be first to play all your cards\n" **Prize:** Winner takes entire pot',
                inline: false
            },
            {
                name: '=� How to Play',
                value: '1. Use `/uno <amount>` to start a game\n2. Players join and starter begins the game\n3. Play cards that match color or number\n4. Use action cards strategically\n5. Call "UNO" when you have one card left\n6. First to empty their hand wins!',
                inline: false
            },
            {
                name: '<� Card Types',
                value: '" **Number Cards:** 0-9 in four colors\n" **Skip:** Next player loses their turn\n" **Reverse:** Direction of play reverses\n" **+2:** Next player draws 2 cards\n" **Wild:** Choose any color\n" **Wild +4:** Choose color, next player draws 4',
                inline: false
            },
            {
                name: '� Special Rules',
                value: '" **UNO Call:** Must call when you have 1 card\n" **Penalty:** Draw 2 cards if you forget to call UNO\n" **Stacking:** +2 and +4 cards can be stacked\n" **Turn Timer:** 60 seconds per turn\n" **Auto-play:** Game continues if player times out',
                inline: false
            },
            {
                name: '<� Winning',
                value: '" First player to play all cards wins\n" Winner gets points based on cards in other players\' hands\n" Winner takes the entire prize pool\n" Games typically last 10-20 minutes',
                inline: false
            }
        );

        embed.setFooter({ text: '=� Use /uno <amount> to start playing! <�' });
        return embed;
    }
}

// Game session management
const activeUnoGames = new Map();

function startUnoGame(channelId, guildId, starterBet) {
    const game = new UnoGameSession(channelId, guildId, starterBet);
    activeUnoGames.set(channelId, game);
    return game;
}

function getUnoGame(channelId) {
    return activeUnoGames.get(channelId) || null;
}

function endUnoGame(channelId) {
    const game = activeUnoGames.get(channelId);
    if (game) {
        game.clearTurnTimeout();
        activeUnoGames.delete(channelId);
        return true;
    }
    return false;
}

function handleUnoAction(interaction, action, ...params) {
    const channelId = interaction.channelId;
    const userId = interaction.user.id;
    const game = getUnoGame(channelId);
    
    if (!game) {
        return { success: false, error: 'No active UNO game found' };
    }
    
    const player = game.players.get(userId);
    if (!player && !['join', 'start', 'status'].includes(action)) {
        return { success: false, error: 'You are not in this game' };
    }
    
    try {
        switch (action) {
            case 'join':
                if (game.players.has(userId)) {
                    return { success: false, error: 'You are already in this game' };
                }
                if (game.gameActive) {
                    return { success: false, error: 'Cannot join while game is in progress' };
                }
                return { success: true, action: 'show_join_confirmation' };
                
            case 'start':
                if (!game.canStartGame()) {
                    return { success: false, error: 'Need at least 2 players to start' };
                }
                return { success: true, action: 'start_game' };
                
            case 'leave':
                if (game.gameActive) {
                    return { success: false, error: 'Cannot leave during active game' };
                }
                return { success: true, action: 'leave_game' };
                
            case 'hand':
                return { success: true, action: 'show_hand' };
                
            case 'draw':
                if (game.getCurrentPlayer().userId !== userId) {
                    return { success: false, error: 'Not your turn' };
                }
                return { success: true, action: 'draw_card' };
                
            case 'play':
                if (game.getCurrentPlayer().userId !== userId) {
                    return { success: false, error: 'Not your turn' };
                }
                return { success: true, action: 'show_card_selection' };
                
            case 'uno':
                if (!player.canCallUno()) {
                    return { success: false, error: 'Cannot call UNO right now' };
                }
                return { success: true, action: 'call_uno' };
                
            case 'status':
                return { success: true, action: 'show_game_status' };
                
            case 'play_card':
                const [cardIndex, chosenColor] = params;
                if (game.getCurrentPlayer().userId !== userId) {
                    return { success: false, error: 'Not your turn' };
                }
                return { success: true, action: 'play_selected_card', cardIndex, chosenColor };
                
            case 'help':
                return { success: true, action: 'show_help' };
                
            default:
                return { success: false, error: 'Invalid action' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = {
    UnoGameSession,
    UnoPlayer,
    UnoCard,
    startUnoGame,
    getUnoGame,
    endUnoGame,
    handleUnoAction,
    UNO_COLORS
};