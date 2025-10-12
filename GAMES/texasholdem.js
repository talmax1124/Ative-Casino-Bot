/**
 * Texas Hold'em Poker Game Implementation for ATIVE Casino Bot
 * Professional multiplayer poker game with pot management, betting rounds, and hand evaluation
 * Features visual cards, tournament-style gameplay, and comprehensive poker rules
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { secureRandomInt, secureRandomShuffle } = require('../UTILS/rng');
const { fmt } = require('../UTILS/common');
const logger = require('../UTILS/logger');
const UniversalGameIntegrator = require('../UTILS/UniversalGameIntegrator');
const securityLogger = require('../UTILS/securityLogger');
const integrator = new UniversalGameIntegrator();

// Card suits and ranks for poker
const POKER_SUITS = ['♠️', '♥️', '♦️', '♣️'];
const POKER_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Hand rankings (higher number = better hand)
const HAND_RANKINGS = {
    HIGH_CARD: 1,
    PAIR: 2,
    TWO_PAIR: 3,
    THREE_OF_A_KIND: 4,
    STRAIGHT: 5,
    FLUSH: 6,
    FULL_HOUSE: 7,
    FOUR_OF_A_KIND: 8,
    STRAIGHT_FLUSH: 9,
    ROYAL_FLUSH: 10
};

// Betting actions
const BETTING_ACTIONS = {
    FOLD: 'fold',
    CHECK: 'check',
    CALL: 'call',
    BET: 'bet',
    RAISE: 'raise',
    ALL_IN: 'all_in'
};

// Game phases
const GAME_PHASES = {
    WAITING: 'waiting',
    PRE_FLOP: 'pre_flop',
    FLOP: 'flop',
    TURN: 'turn',
    RIVER: 'river',
    SHOWDOWN: 'showdown',
    FINISHED: 'finished'
};

class PokerCard {
    constructor(rank, suit) {
        this.rank = rank;
        this.suit = suit;
        this.value = this.calculateValue();
    }

    calculateValue() {
        if (this.rank === 'A') return 14;
        if (this.rank === 'K') return 13;
        if (this.rank === 'Q') return 12;
        if (this.rank === 'J') return 11;
        return parseInt(this.rank);
    }

    toString() {
        return `${this.rank}${this.suit}`;
    }

    getImagePath() {
        return `/assets/poker/${this.rank}_${this.suit.replace('️', '')}.png`;
    }

    // Check if card is red (hearts/diamonds)
    isRed() {
        return this.suit === '♥️' || this.suit === '♦️';
    }

    // Check if card is black (spades/clubs)
    isBlack() {
        return this.suit === '♠️' || this.suit === '♣️';
    }
}

class PokerDeck {
    constructor() {
        this.cards = [];
        this.reset();
    }

    reset() {
        this.cards = [];
        for (const suit of POKER_SUITS) {
            for (const rank of POKER_RANKS) {
                this.cards.push(new PokerCard(rank, suit));
            }
        }
        this.shuffle();
    }

    shuffle() {
        secureRandomShuffle(this.cards);
    }

    dealCard() {
        if (this.cards.length === 0) {
            throw new Error('Cannot deal from empty deck');
        }
        return this.cards.pop();
    }

    getCardsRemaining() {
        return this.cards.length;
    }
}

class PokerHand {
    constructor(cards = []) {
        this.cards = [...cards];
    }

    addCard(card) {
        this.cards.push(card);
    }

    // Evaluate the best 5-card hand from available cards
    static evaluateHand(holeCards, communityCards) {
        const allCards = [...holeCards, ...communityCards];
        if (allCards.length < 5) {
            throw new Error('Need at least 5 cards to evaluate hand');
        }

        let bestHand = null;
        let bestRank = 0;

        // Generate all possible 5-card combinations
        const combinations = PokerHand.getCombinations(allCards, 5);
        
        for (const combo of combinations) {
            const handRank = PokerHand.getHandRank(combo);
            if (handRank.rank > bestRank) {
                bestRank = handRank.rank;
                bestHand = {
                    cards: combo,
                    ...handRank
                };
            }
        }

        return bestHand;
    }

    // Generate all combinations of r elements from array
    static getCombinations(array, r) {
        const combinations = [];
        
        function backtrack(start, current) {
            if (current.length === r) {
                combinations.push([...current]);
                return;
            }
            
            for (let i = start; i < array.length; i++) {
                current.push(array[i]);
                backtrack(i + 1, current);
                current.pop();
            }
        }
        
        backtrack(0, []);
        return combinations;
    }

    // Get the rank of a 5-card hand
    static getHandRank(cards) {
        if (cards.length !== 5) {
            throw new Error('Hand must contain exactly 5 cards');
        }

        const sorted = [...cards].sort((a, b) => b.value - a.value);
        const ranks = sorted.map(card => card.value);
        const suits = sorted.map(card => card.suit);
        
        // Count occurrences of each rank
        const rankCounts = {};
        ranks.forEach(rank => {
            rankCounts[rank] = (rankCounts[rank] || 0) + 1;
        });
        
        const counts = Object.values(rankCounts).sort((a, b) => b - a);
        // Build groups: [{rankValue, count}], sorted by count desc then rank desc
        const groups = Object.entries(rankCounts)
            .map(([rv, cnt]) => ({ rankValue: parseInt(rv), count: cnt }))
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return b.rankValue - a.rankValue;
            });
        
        const isFlush = suits.every(suit => suit === suits[0]);
        const isStraight = PokerHand.isStraight(ranks);

        // Determine straight high card correctly (handles A-2-3-4-5 as 5-high)
        const straightHigh = PokerHand.getStraightHigh(ranks);
        
        // Royal Flush (10-J-Q-K-A of same suit)
        if (isFlush && isStraight && straightHigh === 14 && Math.min(...ranks) === 10) {
            return {
                rank: HAND_RANKINGS.ROYAL_FLUSH,
                name: 'Royal Flush',
                // For royal flush, kickers don't matter, but keep standard ordering
                kickers: [14, 13, 12, 11, 10]
            };
        }
        
        // Straight Flush
        if (isFlush && isStraight) {
            return {
                rank: HAND_RANKINGS.STRAIGHT_FLUSH,
                name: 'Straight Flush',
                // Kickers compare only by straight high
                kickers: [straightHigh, 0, 0, 0, 0]
            };
        }
        
        // Four of a Kind
        if (counts[0] === 4) {
            const quadRank = groups.find(g => g.count === 4).rankValue;
            const kicker = groups.find(g => g.count === 1).rankValue;
            return {
                rank: HAND_RANKINGS.FOUR_OF_A_KIND,
                name: 'Four of a Kind',
                kickers: [quadRank, kicker, 0, 0, 0]
            };
        }
        
        // Full House
        if (counts[0] === 3 && counts[1] === 2) {
            const tripRank = groups.find(g => g.count === 3).rankValue;
            const pairRank = groups.find(g => g.count === 2).rankValue;
            return {
                rank: HAND_RANKINGS.FULL_HOUSE,
                name: 'Full House',
                kickers: [tripRank, pairRank, 0, 0, 0]
            };
        }
        
        // Flush
        if (isFlush) {
            return {
                rank: HAND_RANKINGS.FLUSH,
                name: 'Flush',
                kickers: ranks
            };
        }
        
        // Straight
        if (isStraight) {
            return {
                rank: HAND_RANKINGS.STRAIGHT,
                name: 'Straight',
                kickers: [straightHigh, 0, 0, 0, 0]
            };
        }
        
        // Three of a Kind
        if (counts[0] === 3) {
            const tripRank = groups.find(g => g.count === 3).rankValue;
            const kickers = groups.filter(g => g.count === 1).map(g => g.rankValue).sort((a,b)=>b-a).slice(0,2);
            return {
                rank: HAND_RANKINGS.THREE_OF_A_KIND,
                name: 'Three of a Kind',
                kickers: [tripRank, kickers[0] || 0, kickers[1] || 0, 0, 0]
            };
        }
        
        // Two Pair
        if (counts[0] === 2 && counts[1] === 2) {
            const pairRanks = groups.filter(g => g.count === 2).map(g => g.rankValue).sort((a,b)=>b-a);
            const kicker = groups.filter(g => g.count === 1).map(g => g.rankValue).sort((a,b)=>b-a)[0] || 0;
            return {
                rank: HAND_RANKINGS.TWO_PAIR,
                name: 'Two Pair',
                kickers: [pairRanks[0], pairRanks[1], kicker, 0, 0]
            };
        }
        
        // Pair
        if (counts[0] === 2) {
            const pairRank = groups.find(g => g.count === 2).rankValue;
            const kickers = groups.filter(g => g.count === 1).map(g => g.rankValue).sort((a,b)=>b-a).slice(0,3);
            return {
                rank: HAND_RANKINGS.PAIR,
                name: 'Pair',
                kickers: [pairRank, kickers[0] || 0, kickers[1] || 0, kickers[2] || 0, 0]
            };
        }
        
        // High Card
        return {
            rank: HAND_RANKINGS.HIGH_CARD,
            name: 'High Card',
            kickers: ranks
        };
    }

    // Check if ranks form a straight
    static isStraight(ranks) {
        const sorted = [...ranks].sort((a, b) => a - b);
        
        // Check for regular straight
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] !== sorted[i-1] + 1) {
                break;
            }
            if (i === 4) return true;
        }
        
        // Check for A-2-3-4-5 straight (wheel)
        if (sorted[0] === 2 && sorted[1] === 3 && sorted[2] === 4 && sorted[3] === 5 && sorted[4] === 14) {
            return true;
        }
        
        return false;
    }

    // Return the top card value for a straight (handles A-2-3-4-5 as 5-high)
    static getStraightHigh(ranks) {
        const sorted = [...ranks].sort((a, b) => a - b);
        // Wheel straight: treat Ace as 1, high card is 5
        if (sorted[0] === 2 && sorted[1] === 3 && sorted[2] === 4 && sorted[3] === 5 && sorted[4] === 14) {
            return 5;
        }
        return Math.max(...sorted);
    }

    // Build kicker array for straight comparisons with proper A-5 handling
    static getStraightKickers(ranks) {
        const sorted = [...ranks].sort((a, b) => b - a);
        // If wheel, convert Ace to 1 and sort again
        const isWheel = ranks.includes(14) && ranks.includes(5) && ranks.includes(4) && ranks.includes(3) && ranks.includes(2);
        if (isWheel) {
            const adjusted = ranks.map(v => (v === 14 ? 1 : v)).sort((a, b) => b - a);
            return adjusted;
        }
        return sorted;
    }

    // Compare two hands (returns -1, 0, or 1)
    static compareHands(hand1, hand2) {
        if (hand1.rank !== hand2.rank) {
            return hand1.rank - hand2.rank;
        }
        
        // Same rank, compare kickers
        for (let i = 0; i < hand1.kickers.length; i++) {
            if (hand1.kickers[i] !== hand2.kickers[i]) {
                return hand1.kickers[i] - hand2.kickers[i];
            }
        }
        
        return 0; // Exact tie
    }

    toString() {
        return this.cards.map(card => card.toString()).join(' ');
    }
}

class PokerPlayer {
    constructor(userId, username, chipCount, seatNumber) {
        this.userId = userId;
        this.username = username;
        this.chipCount = chipCount;
        this.seatNumber = seatNumber;
        this.holeCards = [];
        this.currentBet = 0;
        this.totalBetThisRound = 0;
        this.hasFolded = false;
        this.isAllIn = false;
        this.isActive = true;
        this.bestHand = null;
        this.lastAction = null;
        this.timeoutWarnings = 0;
    }

    // Deal hole cards to player
    dealHoleCards(card1, card2) {
        this.holeCards = [card1, card2];
    }

    // Player actions
    fold() {
        this.hasFolded = true;
        // Don't set isActive to false - player is still in the game, just folded
        this.lastAction = BETTING_ACTIONS.FOLD;
    }

    check() {
        this.lastAction = BETTING_ACTIONS.CHECK;
    }

    call(amount) {
        const actualBet = Math.min(amount, this.chipCount);
        this.currentBet += actualBet;
        this.totalBetThisRound += actualBet;
        this.chipCount -= actualBet;
        
        if (this.chipCount === 0) {
            this.isAllIn = true;
        }
        
        this.lastAction = BETTING_ACTIONS.CALL;
        return actualBet;
    }

    bet(amount) {
        const actualBet = Math.min(amount, this.chipCount);
        this.currentBet = actualBet;
        this.totalBetThisRound += actualBet;
        this.chipCount -= actualBet;
        
        if (this.chipCount === 0) {
            this.isAllIn = true;
        }
        
        this.lastAction = BETTING_ACTIONS.BET;
        return actualBet;
    }

    raise(amount) {
        const actualBet = Math.min(amount, this.chipCount);
        this.currentBet += actualBet;
        this.totalBetThisRound += actualBet;
        this.chipCount -= actualBet;
        
        if (this.chipCount === 0) {
            this.isAllIn = true;
        }
        
        this.lastAction = BETTING_ACTIONS.RAISE;
        return actualBet;
    }

    allIn() {
        const amount = this.chipCount;
        this.currentBet += amount;
        this.totalBetThisRound += amount;
        this.chipCount = 0;
        this.isAllIn = true;
        this.lastAction = BETTING_ACTIONS.ALL_IN;
        return amount;
    }

    // Reset for new betting round
    resetForNewRound() {
        this.currentBet = 0;
        this.lastAction = null;
    }

    // Check if player can act
    canAct() {
        return this.isActive && !this.hasFolded && !this.isAllIn;
    }

    // Get available actions for this player
    getAvailableActions(currentBet, minRaise) {
        if (!this.canAct()) return [];
        
        const actions = [];
        
        // Can always fold
        actions.push(BETTING_ACTIONS.FOLD);
        
        // Can check if no bet to call
        if (currentBet === 0 || this.currentBet === currentBet) {
            actions.push(BETTING_ACTIONS.CHECK);
        }
        
        // Can call if there's a bet and player hasn't matched it
        if (currentBet > this.currentBet && this.chipCount > 0) {
            const callAmount = currentBet - this.currentBet;
            if (callAmount <= this.chipCount) {
                actions.push(BETTING_ACTIONS.CALL);
            }
        }
        
        // Can bet if no current bet
        if (currentBet === 0 && this.chipCount > 0) {
            actions.push(BETTING_ACTIONS.BET);
        }
        
        // Can raise if there's a bet and player has enough chips
        if (currentBet > 0 && this.chipCount > (currentBet - this.currentBet + minRaise)) {
            actions.push(BETTING_ACTIONS.RAISE);
        }
        
        // Can always go all-in if has chips
        if (this.chipCount > 0) {
            actions.push(BETTING_ACTIONS.ALL_IN);
        }
        
        return actions;
    }

    toString() {
        const status = this.hasFolded ? '[FOLDED]' : 
                     this.isAllIn ? '[ALL-IN]' : 
                     this.isActive ? '[ACTIVE]' : '[INACTIVE]';
        return `${this.username} ${status} (${fmt(this.chipCount)} chips)`;
    }
}

class TexasHoldemGame {
    constructor(channelId, creatorId, buyInAmount, blindStructure = null) {
        this.channelId = channelId;
        this.creatorId = creatorId;
        this.buyInAmount = buyInAmount;
        this.blindStructure = blindStructure || { small: Math.max(1, buyInAmount * 0.01), big: Math.max(2, buyInAmount * 0.02) };
        
        // Game state
        this.players = new Map(); // userId -> PokerPlayer
        this.seatOrder = []; // Array of userIds in seat order
        this.phase = GAME_PHASES.WAITING;
        this.deck = new PokerDeck();
        this.communityCards = [];
        this.pots = []; // Main pot and side pots
        this.currentPlayerIndex = 0;
        this.dealerPosition = 0;
        this.smallBlindPosition = 0;
        this.bigBlindPosition = 0;
        this.currentBet = 0;
        this.minRaise = 0;
        this.handNumber = 0;
        this.readyForNextHand = false;
        
        // Timing and session management
        this.gameStartTime = null;
        this.lastActionTime = Date.now();
        this.actionTimeoutMs = 30000; // 30 seconds per action
        this.sessionId = null;
        this.waitingForPlayers = true;
        this.gameActive = false;
        this.finished = false;
        
        // Tournament settings
        this.maxPlayers = 9;
        this.minPlayers = 2;
        this.tournamentMode = false;
        this.blindIncreaseInterval = null;
        this.blindLevel = 1;
        this.nextBlindIncrease = null;
        
        // Message management
        this.lastMessageId = null;
        this.spectators = new Set();
        
        logger.info(`Texas Hold'em game created in channel ${channelId} by ${creatorId} with buy-in ${fmt(buyInAmount)}`);
    }

    // Player management
    addPlayer(userId, username, chipCount = null) {
        if (this.players.has(userId)) {
            throw new Error('Player already in game');
        }
        
        if (this.seatOrder.length >= this.maxPlayers) {
            throw new Error('Game is full');
        }
        
        if (this.gameActive) {
            throw new Error('Cannot join game in progress');
        }
        
        const chips = chipCount || this.buyInAmount;
        const seatNumber = this.getNextAvailableSeat();
        const player = new PokerPlayer(userId, username, chips, seatNumber);
        
        this.players.set(userId, player);
        this.seatOrder.push(userId);
        
        logger.info(`Player ${username} (${userId}) joined Texas Hold'em game with ${fmt(chips)} chips`);
        
        // Auto-start if minimum players reached
        if (this.seatOrder.length >= this.minPlayers && this.seatOrder.length >= 2) {
            // Don't auto-start immediately, let players prepare
        }
        
        return player;
    }

    removePlayer(userId) {
        const player = this.players.get(userId);
        if (!player) {
            throw new Error('Player not in game');
        }
        
        if (this.gameActive && !player.hasFolded) {
            // Fold the player if game is active
            player.fold();
        }
        
        this.players.delete(userId);
        const seatIndex = this.seatOrder.indexOf(userId);
        if (seatIndex > -1) {
            this.seatOrder.splice(seatIndex, 1);
        }
        
        logger.info(`Player ${player.username} (${userId}) left Texas Hold'em game`);
        
        // Check if game should end
        if (this.gameActive && this.getActivePlayers().length < 2) {
            this.endGame('Insufficient players');
        }
    }

    getNextAvailableSeat() {
        for (let i = 0; i < this.maxPlayers; i++) {
            if (!this.seatOrder.find(userId => this.players.get(userId)?.seatNumber === i)) {
                return i;
            }
        }
        throw new Error('No available seats');
    }

    // Game flow methods
    startGame() {
        if (this.seatOrder.length < this.minPlayers) {
            throw new Error(`Need at least ${this.minPlayers} players to start`);
        }
        
        if (this.gameActive) {
            throw new Error('Game already active');
        }
        
        this.waitingForPlayers = false;
        this.gameActive = true;
        this.gameStartTime = Date.now();
        this.handNumber = 1;
        
        // Set positions
        this.dealerPosition = 0;
        this.setBlindPositions();
        
        // Start first hand
        this.startNewHand();
        
        logger.info(`Texas Hold'em game started with ${this.seatOrder.length} players`);
    }

    startNewHand() {
        if (this.getActivePlayers().length < 2) {
            this.endGame('Game over - insufficient players');
            return;
        }
        
        // Reset deck and cards
        this.deck = new PokerDeck();
        this.communityCards = [];
        this.pots = [];
        this.currentBet = 0;
        this.minRaise = this.blindStructure.big;
        this.phase = GAME_PHASES.PRE_FLOP;
        
        // Reset players for new hand
        for (const player of this.players.values()) {
            player.resetForNewRound();
            player.holeCards = [];
            player.hasFolded = false;
            player.isActive = player.chipCount > 0; // Only active if has chips
            player.bestHand = null;
            player.totalBetThisRound = 0;
        }
        
        // Deal hole cards
        this.dealHoleCards();
        
        // Post blinds
        this.postBlinds();
        
        // Set first player to act (after big blind)
        this.currentPlayerIndex = this.getNextActivePlayerIndex(this.bigBlindPosition);
        
        this.lastActionTime = Date.now();
        
        logger.info(`Hand #${this.handNumber} started in Texas Hold'em game`);
    }

    dealHoleCards() {
        // Deal 2 cards to each active player
        for (let round = 0; round < 2; round++) {
            for (const userId of this.seatOrder) {
                const player = this.players.get(userId);
                if (player && player.isActive) {
                    const card = this.deck.dealCard();
                    if (round === 0) {
                        player.holeCards = [card];
                    } else {
                        player.holeCards.push(card);
                    }
                }
            }
        }
    }

    postBlinds() {
        const smallBlindPlayer = this.players.get(this.seatOrder[this.smallBlindPosition]);
        const bigBlindPlayer = this.players.get(this.seatOrder[this.bigBlindPosition]);
        
        if (smallBlindPlayer && smallBlindPlayer.isActive) {
            const sbAmount = Math.min(this.blindStructure.small, smallBlindPlayer.chipCount);
            smallBlindPlayer.bet(sbAmount);
            this.currentBet = sbAmount;
        }
        
        if (bigBlindPlayer && bigBlindPlayer.isActive) {
            const bbAmount = Math.min(this.blindStructure.big, bigBlindPlayer.chipCount);
            bigBlindPlayer.bet(bbAmount);
            this.currentBet = Math.max(this.currentBet, bbAmount);
        }
        
        logger.debug(`Blinds posted: SB=${fmt(this.blindStructure.small)}, BB=${fmt(this.blindStructure.big)}`);
    }

    setBlindPositions() {
        const activeCount = this.getActivePlayers().length;
        
        if (activeCount === 2) {
            // Heads-up: dealer is small blind
            this.smallBlindPosition = this.dealerPosition;
            this.bigBlindPosition = this.getNextActivePlayerIndex(this.dealerPosition);
        } else {
            // Multi-way: small blind is after dealer
            this.smallBlindPosition = this.getNextActivePlayerIndex(this.dealerPosition);
            this.bigBlindPosition = this.getNextActivePlayerIndex(this.smallBlindPosition);
        }
    }

    // Betting round logic
    async processPlayerAction(userId, action, amount = 0) {
        const player = this.players.get(userId);
        if (!player) {
            throw new Error('Player not found');
        }
        
        if (!this.isPlayerTurn(userId)) {
            throw new Error('Not your turn');
        }
        
        if (!player.canAct()) {
            throw new Error('Player cannot act');
        }
        
        let actualAmount = 0;
        
        switch (action) {
            case BETTING_ACTIONS.FOLD:
                player.fold();
                break;
                
            case BETTING_ACTIONS.CHECK:
                if (this.currentBet > player.currentBet) {
                    throw new Error('Cannot check, must call or fold');
                }
                player.check();
                break;
                
            case BETTING_ACTIONS.CALL:
                const callAmount = this.currentBet - player.currentBet;
                if (callAmount <= 0) {
                    throw new Error('Nothing to call');
                }
                actualAmount = player.call(callAmount);
                break;
                
            case BETTING_ACTIONS.BET:
                if (this.currentBet > 0) {
                    throw new Error('Cannot bet, must call or raise');
                }
                if (amount < this.blindStructure.big) {
                    throw new Error(`Minimum bet is ${fmt(this.blindStructure.big)}`);
                }
                actualAmount = player.bet(amount);
                this.currentBet = player.currentBet;
                this.minRaise = amount;
                break;
                
            case BETTING_ACTIONS.RAISE:
                const raiseAmount = amount - this.currentBet;
                if (raiseAmount < this.minRaise) {
                    throw new Error(`Minimum raise is ${fmt(this.minRaise)}`);
                }
                actualAmount = player.raise(amount - player.currentBet);
                this.currentBet = player.currentBet;
                this.minRaise = raiseAmount;
                break;
                
            case BETTING_ACTIONS.ALL_IN:
                actualAmount = player.allIn();
                if (player.currentBet > this.currentBet) {
                    const raiseAmount = player.currentBet - this.currentBet;
                    this.currentBet = player.currentBet;
                    if (raiseAmount >= this.minRaise) {
                        this.minRaise = raiseAmount;
                    }
                }
                break;
                
            default:
                throw new Error('Invalid action');
        }
        
        this.lastActionTime = Date.now();
        
        // Move to next player or next phase
        if (this.isBettingRoundComplete()) {
            await this.completeBettingRound();
        } else {
            this.advanceToNextPlayer();
        }
        
        logger.debug(`Player ${player.username} performed action ${action} with amount ${fmt(actualAmount)}`);
        
        return actualAmount;
    }

    isBettingRoundComplete() {
        const playersInHand = this.getPlayersInHand();
        const playersCanAct = playersInHand.filter(p => p.canAct());
        
        // If no players can act (all folded or all-in), round is complete
        if (playersCanAct.length === 0) {
            return true;
        }
        
        // If only one player remains who isn't all-in, round is complete
        if (playersInHand.filter(p => !p.hasFolded && !p.isAllIn).length <= 1) {
            return true;
        }
        
        // Check if all players in hand have matched the current bet
        const allMatchedBet = playersCanAct.every(player => 
            player.currentBet === this.currentBet || player.isAllIn
        );
        
        if (!allMatchedBet) {
            return false;
        }
        
        // Additional check: ensure all players have had a chance to act
        // A betting round is only complete if all players in hand have either:
        // 1. Made an action this round (have lastAction set), OR
        // 2. Are all-in and cannot act
        const allPlayersActed = playersCanAct.every(player => {
            // Players who are all-in have acted by definition
            if (player.isAllIn) {
                return true;
            }
            
            // Players must have taken an action this round
            // Exception: in pre-flop, blinds count as having acted initially
            if (this.phase === GAME_PHASES.PRE_FLOP) {
                // Big blind and small blind players are considered to have acted initially
                const playerIndex = this.seatOrder.indexOf(player.userId);
                if (playerIndex === this.smallBlindPosition || playerIndex === this.bigBlindPosition) {
                    // But if there's been a raise since the blinds, they need to act again
                    return player.lastAction !== null || this.currentBet === player.currentBet;
                }
            }
            
            // For all other cases, player must have taken an action this round
            return player.lastAction !== null;
        });
        
        return allPlayersActed;
    }

    async completeBettingRound() {
        // Collect bets into pot
        this.collectBets();
        
        // Check if only one player remains in hand
        const playersInHand = this.getPlayersInHand();
        if (playersInHand.length <= 1) {
            // Only one player left, they win by default
            await this.awardPotsToLastPlayer();
            await this.endHand();
            return;
        }
        
        // Reset players for next round
        for (const player of this.players.values()) {
            player.resetForNewRound();
        }
        
        // Advance to next phase
        await this.advancePhase();
    }

    collectBets() {
        const playerBets = [];
        
        // Collect all bets
        for (const player of this.players.values()) {
            if (player.totalBetThisRound > 0) {
                playerBets.push({
                    userId: player.userId,
                    amount: player.totalBetThisRound,
                    isAllIn: player.isAllIn
                });
            }
        }
        
        // Create main pot and side pots
        this.createPots(playerBets);
        
        // Reset betting amounts
        for (const player of this.players.values()) {
            player.totalBetThisRound = 0;
        }
    }

    createPots(playerBets) {
        // Sort bets by amount (ascending)
        playerBets.sort((a, b) => a.amount - b.amount);

        let currentPotAmount = 0;
        let remainingPlayers = new Set(playerBets.map(bet => bet.userId));

        // Helper to compare eligible player sets
        const setsEqual = (a, b) => {
            if (!a || !b) return false;
            if (a.size !== b.size) return false;
            for (const v of a) if (!b.has(v)) return false;
            return true;
        };

        // Create side pots for all-in players
        for (let i = 0; i < playerBets.length; i++) {
            const currentBet = playerBets[i];
            const potContribution = currentBet.amount - currentPotAmount;

            if (potContribution > 0) {
                const amountToAdd = potContribution * remainingPlayers.size;

                // Decide pot type: only the very first pot overall is 'main'
                const isFirstOverallPot = this.pots.length === 0 && i === 0;

                // If not the first overall pot, try to merge into the most recent pot with same eligible players
                let merged = false;
                if (!isFirstOverallPot) {
                    const lastPot = this.pots[this.pots.length - 1];
                    if (lastPot && setsEqual(lastPot.eligiblePlayers, remainingPlayers)) {
                        lastPot.amount += amountToAdd;
                        merged = true;
                    }
                }

                if (!merged) {
                    const pot = {
                        amount: amountToAdd,
                        eligiblePlayers: new Set(remainingPlayers),
                        type: isFirstOverallPot ? 'main' : 'side'
                    };
                    this.pots.push(pot);
                }

                currentPotAmount = currentBet.amount;
            }

            // Remove all-in players from future pots
            if (currentBet.isAllIn) {
                remainingPlayers.delete(currentBet.userId);
            }
        }
    }

    async advancePhase() {
        // Check if all remaining players are all-in
        const playersInHand = this.getPlayersInHand();
        const playersCanAct = playersInHand.filter(p => p.canAct());
        const shouldAutoComplete = playersCanAct.length === 0 && playersInHand.length >= 2;
        
        switch (this.phase) {
            case GAME_PHASES.PRE_FLOP:
                this.phase = GAME_PHASES.FLOP;
                this.dealFlop();
                break;
            case GAME_PHASES.FLOP:
                this.phase = GAME_PHASES.TURN;
                this.dealTurn();
                break;
            case GAME_PHASES.TURN:
                this.phase = GAME_PHASES.RIVER;
                this.dealRiver();
                break;
            case GAME_PHASES.RIVER:
                this.phase = GAME_PHASES.SHOWDOWN;
                await this.showdown();
                return;
        }
        
        // If all players are all-in, auto-complete remaining rounds
        if (shouldAutoComplete) {
            // Recursively advance through remaining phases
            await this.advancePhase();
        } else {
            // Start new betting round
            this.currentBet = 0;
            this.minRaise = this.blindStructure.big;
            this.currentPlayerIndex = this.getNextActivePlayerIndex(this.dealerPosition);
        }
    }

    dealFlop() {
        // Burn one card, then deal 3 community cards
        this.deck.dealCard(); // Burn card
        for (let i = 0; i < 3; i++) {
            this.communityCards.push(this.deck.dealCard());
        }
        logger.debug(`Flop dealt: ${this.communityCards.map(c => c.toString()).join(' ')}`);
    }

    dealTurn() {
        // Burn one card, then deal 1 community card
        this.deck.dealCard(); // Burn card
        this.communityCards.push(this.deck.dealCard());
        logger.debug(`Turn dealt: ${this.communityCards[3].toString()}`);
    }

    dealRiver() {
        // Burn one card, then deal 1 community card
        this.deck.dealCard(); // Burn card
        this.communityCards.push(this.deck.dealCard());
        logger.debug(`River dealt: ${this.communityCards[4].toString()}`);
    }

    async showdown() {
        const playersInHand = this.getPlayersInHand();
        
        // Evaluate hands for all remaining players
        for (const player of playersInHand) {
            try {
                player.bestHand = PokerHand.evaluateHand(player.holeCards, this.communityCards);
            } catch (error) {
                logger.error(`Error evaluating hand for player ${player.username}: ${error.message}`);
                player.bestHand = {
                    rank: HAND_RANKINGS.HIGH_CARD,
                    name: 'High Card',
                    kickers: [2],
                    cards: []
                };
            }
        }
        
        // Distribute pots and get results
        const payoutResults = await this.distributePots();
        this.payoutResults = payoutResults;
        
        // Don't immediately end hand - let the UI update first
        // this.endHand() will be called from the command handler after showing results
    }

    async awardPotsToLastPlayer() {
        const playersInHand = this.getPlayersInHand();
        if (playersInHand.length !== 1) {
            logger.error('awardPotsToLastPlayer called with incorrect number of players');
            return;
        }

        const winner = playersInHand[0];
        const payoutResults = [];
        
        // Award all pots to the remaining player
        for (const pot of this.pots) {
            const winAmount = pot.amount;
            pot.winner = winner;
            pot.winningHand = 'Uncontested';
            
            payoutResults.push({
                userId: winner.userId,
                username: winner.username,
                amount: winAmount,
                won: true,
                handName: 'Uncontested'
            });
            
            logger.info(`Player ${winner.username} wins pot of ${winAmount} (uncontested)`);
        }
        
        this.payoutResults = payoutResults;
        return payoutResults;
    }

    async distributePots() {
        const payoutResults = [];
        
        for (const pot of this.pots) {
            const eligiblePlayers = Array.from(pot.eligiblePlayers)
                .map(userId => this.players.get(userId))
                .filter(player => player && !player.hasFolded);
            
            if (eligiblePlayers.length === 0) {
                continue; // This shouldn't happen, but safety check
            }
            
            if (eligiblePlayers.length === 1) {
                // Only one eligible player, they win the pot
                const winner = eligiblePlayers[0];
                const winAmount = pot.amount;
                pot.winner = winner;
                pot.winningHand = 'Uncontested';
                
                payoutResults.push({
                    userId: winner.userId,
                    username: winner.username,
                    amount: winAmount,
                    won: true,
                    handName: 'Uncontested'
                });
            } else {
                // Find best hand(s)
                let bestHandRank = -1;
                let winners = [];
                
                for (const player of eligiblePlayers) {
                    const handComparison = player.bestHand.rank;
                    if (handComparison > bestHandRank) {
                        bestHandRank = handComparison;
                        winners = [player];
                    } else if (handComparison === bestHandRank) {
                        // Need to compare kickers
                        const kickerComparison = PokerHand.compareHands(player.bestHand, winners[0].bestHand);
                        if (kickerComparison > 0) {
                            winners = [player];
                        } else if (kickerComparison === 0) {
                            winners.push(player);
                        }
                    }
                }
                
                // Split pot among winners
                const winAmount = Math.floor(pot.amount / winners.length);
                const remainder = pot.amount % winners.length;
                
                for (let i = 0; i < winners.length; i++) {
                    const bonus = i < remainder ? 1 : 0; // Distribute remainder
                    const totalWin = winAmount + bonus;
                    
                    payoutResults.push({
                        userId: winners[i].userId,
                        username: winners[i].username,
                        amount: totalWin,
                        won: true,
                        handName: winners[i].bestHand.name
                    });
                }
                
                pot.winners = winners;
                pot.winningHand = winners[0].bestHand.name;
            }
        }
        
        return payoutResults;
    }

    endHand() {
        this.handNumber++;
        
        // Tournament blind increases
        if (this.tournamentMode && this.handNumber >= this.nextBlindIncrease) {
            this.blindLevel++;
            this.blindStructure.small = Math.floor(this.blindStructure.small * 1.5);
            this.blindStructure.big = Math.floor(this.blindStructure.big * 1.5);
            this.nextBlindIncrease = this.handNumber + this.blindIncreaseInterval;
            
            logger.info(`Tournament blinds increased to ${this.blindStructure.small}/${this.blindStructure.big} (Level ${this.blindLevel})`);
        }
        
        // Remove players with no chips
        const playersToRemove = [];
        for (const [userId, player] of this.players) {
            if (player.chipCount <= 0) {
                playersToRemove.push(userId);
            }
        }
        
        for (const userId of playersToRemove) {
            this.removePlayer(userId);
        }
        
        // Check if game should continue
        if (this.getActivePlayers().length < 2) {
            this.endGame('Game over');
            return;
        }
        
        // Move dealer button
        this.dealerPosition = this.getNextActivePlayerIndex(this.dealerPosition);
        this.setBlindPositions();
        
        // Mark that we're ready for next hand
        this.readyForNextHand = true;
        // Don't auto-start next hand - wait for UI to update
    }

    endGame(reason = 'Game ended') {
        this.gameActive = false;
        this.finished = true;
        this.phase = GAME_PHASES.FINISHED;
        
        logger.info(`Texas Hold'em game ended: ${reason}`);
    }

    // Helper methods
    isPlayerTurn(userId) {
        if (this.currentPlayerIndex < 0 || this.currentPlayerIndex >= this.seatOrder.length) {
            return false;
        }
        return this.seatOrder[this.currentPlayerIndex] === userId;
    }

    getCurrentPlayer() {
        if (this.currentPlayerIndex < 0 || this.currentPlayerIndex >= this.seatOrder.length) {
            return null;
        }
        return this.players.get(this.seatOrder[this.currentPlayerIndex]);
    }

    getActivePlayers() {
        return Array.from(this.players.values()).filter(player => player.isActive);
    }

    // Get players who are still in the game (not folded)
    getPlayersInHand() {
        return Array.from(this.players.values()).filter(player => player.isActive && !player.hasFolded);
    }

    getNextActivePlayerIndex(startIndex) {
        for (let i = 1; i <= this.seatOrder.length; i++) {
            const index = (startIndex + i) % this.seatOrder.length;
            const player = this.players.get(this.seatOrder[index]);
            if (player && player.isActive && !player.hasFolded) {
                return index;
            }
        }
        return -1; // No active players found
    }

    advanceToNextPlayer() {
        this.currentPlayerIndex = this.getNextActivePlayerIndex(this.currentPlayerIndex);
    }

    getTotalPot() {
        return this.pots.reduce((total, pot) => total + pot.amount, 0);
    }

    // UI methods will be added in the command handler
    getGameState() {
        return {
            phase: this.phase,
            handNumber: this.handNumber,
            players: Array.from(this.players.values()),
            communityCards: this.communityCards,
            totalPot: this.getTotalPot(),
            currentBet: this.currentBet,
            currentPlayer: this.getCurrentPlayer(),
            blinds: this.blindStructure,
            gameActive: this.gameActive,
            waitingForPlayers: this.waitingForPlayers,
            payoutResults: this.payoutResults || [],
            pots: this.pots,
            dealerPosition: this.dealerPosition
        };
    }
}

// Game session management
const activeGames = new Map(); // channelId -> TexasHoldemGame

function createTexasHoldemGame(channelId, creatorId, buyInAmount, options = {}) {
    if (activeGames.has(channelId)) {
        throw new Error('Game already exists in this channel');
    }
    
    const game = new TexasHoldemGame(channelId, creatorId, buyInAmount, options.blindStructure);
    // Set max and min players from options
    if (options.maxPlayers) {
        game.maxPlayers = Math.min(Math.max(options.maxPlayers, 2), 9); // Clamp between 2-9
    }
    if (options.minPlayers) {
        game.minPlayers = Math.max(options.minPlayers, 2);
    }
    
    if (options.tournamentMode) {
        game.tournamentMode = true;
        
        // Set up tournament blind increases (every 10 hands)
        game.blindIncreaseInterval = 10;
        game.nextBlindIncrease = game.handNumber + game.blindIncreaseInterval;
    }
    
    activeGames.set(channelId, game);
    return game;
}

function getTexasHoldemGame(channelId) {
    return activeGames.get(channelId);
}

function deleteTexasHoldemGame(channelId) {
    return activeGames.delete(channelId);
}

module.exports = {
    PokerCard,
    PokerDeck,
    PokerHand,
    PokerPlayer,
    TexasHoldemGame,
    createTexasHoldemGame,
    getTexasHoldemGame,
    deleteTexasHoldemGame,
    POKER_SUITS,
    POKER_RANKS,
    HAND_RANKINGS,
    BETTING_ACTIONS,
    GAME_PHASES,
    activeGames
};
