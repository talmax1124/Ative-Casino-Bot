/**
 * Blackjack Game Logic
 * Contains all blackjack game mechanics and card logic
 */

const { secureRandomShuffle } = require('../UTILS/rng');

// Card definitions
const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

class Card {
    constructor(rank, suit) {
        this.rank = rank;
        this.suit = suit;
    }

    getValue() {
        if (this.rank === 'A') return 11;
        if (['J', 'Q', 'K'].includes(this.rank)) return 10;
        return parseInt(this.rank);
    }

    toString() {
        return `${this.rank}${this.suit}`;
    }
}

class Deck {
    constructor() {
        this.cards = [];
        this.reset();
    }

    reset() {
        this.cards = [];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                this.cards.push(new Card(rank, suit));
            }
        }
        this.shuffle();
    }

    shuffle() {
        secureRandomShuffle(this.cards);
    }

    dealCard() {
        if (this.cards.length === 0) {
            this.reset();
        }
        return this.cards.pop();
    }
}

class BlackjackHand {
    constructor() {
        this.cards = [];
        this.stood = false;
    }

    addCard(card) {
        this.cards.push(card);
    }

    stand() {
        this.stood = true;
    }

    isStood() {
        return this.stood;
    }

    getValue() {
        let value = 0;
        let aces = 0;

        for (const card of this.cards) {
            if (card.rank === 'A') {
                aces++;
                value += 11;
            } else {
                value += card.getValue();
            }
        }

        // Adjust for aces
        while (value > 21 && aces > 0) {
            value -= 10;
            aces--;
        }

        return value;
    }

    isBusted() {
        return this.getValue() > 21;
    }

    isBlackjack() {
        return this.cards.length === 2 && this.getValue() === 21;
    }

    toString() {
        return this.cards.map(card => card.toString()).join(' ');
    }

    getDisplayString(hideFirst = false) {
        if (hideFirst && this.cards.length > 0) {
            const visibleCards = this.cards.slice(1).map(card => card.toString()).join(' ');
            return `🂠 ${visibleCards}`;
        }
        return this.toString();
    }
}

class BlackjackGame {
    constructor(userId, betAmount) {
        this.userId = userId;
        this.betAmount = betAmount;
        this.deck = new Deck();
        this.playerHand = new BlackjackHand();
        this.dealerHand = new BlackjackHand();
        this.gameEnded = false;
        this.splitHands = [];
        this.currentHandIndex = 0;
        this.doubled = false;
    }

    dealInitialCards() {
        // Deal two cards to player and dealer
        this.playerHand.addCard(this.deck.dealCard());
        this.dealerHand.addCard(this.deck.dealCard());
        this.playerHand.addCard(this.deck.dealCard());
        this.dealerHand.addCard(this.deck.dealCard());
    }

    canSplit() {
        return this.playerHand.cards.length === 2 && 
               this.playerHand.cards[0].rank === this.playerHand.cards[1].rank &&
               this.splitHands.length === 0;
    }

    canDouble() {
        const currentHand = this.getCurrentHand();
        return currentHand.cards.length === 2 && !this.gameEnded;
    }

    split() {
        if (!this.canSplit()) return false;

        const card1 = this.playerHand.cards[0];
        const card2 = this.playerHand.cards[1];

        this.splitHands = [new BlackjackHand(), new BlackjackHand()];
        this.splitHands[0].addCard(card1);
        this.splitHands[1].addCard(card2);

        // Deal one more card to each split hand
        this.splitHands[0].addCard(this.deck.dealCard());
        this.splitHands[1].addCard(this.deck.dealCard());

        this.currentHandIndex = 0;
        return true;
    }

    getCurrentHand() {
        if (this.splitHands.length > 0) {
            return this.splitHands[this.currentHandIndex];
        }
        return this.playerHand;
    }

    hit() {
        const currentHand = this.getCurrentHand();
        currentHand.addCard(this.deck.dealCard());
        
        // Check if busted or reached 21
        if (currentHand.isBusted() || currentHand.getValue() === 21) {
            this.nextHand();
        }
    }

    stand() {
        this.nextHand();
    }

    doubleDown() {
        const currentHand = this.getCurrentHand();
        if (currentHand.cards.length !== 2) return false; // Can only double on first two cards
        
        this.doubled = true;
        this.betAmount *= 2; // Double the bet
        currentHand.addCard(this.deck.dealCard()); // Deal one more card
        this.nextHand(); // Automatically stand after doubling
        return true;
    }

    nextHand() {
        if (this.splitHands.length > 0 && this.currentHandIndex < this.splitHands.length - 1) {
            this.currentHandIndex++;
        } else {
            this.dealerPlay();
        }
    }

    dealerPlay() {
        while (this.dealerHand.getValue() < 17) {
            this.dealerHand.addCard(this.deck.dealCard());
        }
        this.gameEnded = true;
    }

    getResults() {
        const results = [];
        
        if (this.splitHands.length > 0) {
            // Handle split hands
            for (let i = 0; i < this.splitHands.length; i++) {
                const hand = this.splitHands[i];
                const result = this.calculateHandResult(hand);
                results.push({
                    hand: i + 1,
                    ...result
                });
            }
        } else {
            // Handle single hand
            const result = this.calculateHandResult(this.playerHand);
            results.push(result);
        }

        return results;
    }

    calculateHandResult(playerHand) {
        const playerValue = playerHand.getValue();
        const dealerValue = this.dealerHand.getValue();
        
        let multiplier = 0;
        let outcome = '';

        if (playerHand.isBusted()) {
            multiplier = 0;
            outcome = 'BUSTED';
        } else if (playerHand.isBlackjack() && this.dealerHand.isBlackjack()) {
            // Both have blackjack - it's a PUSH
            multiplier = 1;
            outcome = 'PUSH';
        } else if (playerHand.isBlackjack() && !this.dealerHand.isBlackjack()) {
            multiplier = 2.5;
            outcome = 'BLACKJACK';
        } else if (this.dealerHand.isBusted()) {
            multiplier = 2;
            outcome = 'DEALER BUSTED';
        } else if (playerValue > dealerValue) {
            multiplier = 2;
            outcome = 'WIN';
        } else if (playerValue === dealerValue) {
            multiplier = 1;
            outcome = 'PUSH';
        } else {
            multiplier = 0;
            outcome = 'LOSE';
        }

        return {
            outcome,
            multiplier,
            payout: this.betAmount * multiplier,
            won: multiplier > 1
        };
    }

    /**
     * Check if current hand is complete (busted or stood)
     */
    isCurrentHandComplete() {
        if (this.splitHands.length > 0) {
            const currentHand = this.splitHands[this.currentHandIndex];
            return currentHand.isBusted() || currentHand.isStood();
        } else {
            return this.playerHand.isBusted() || this.gameEnded;
        }
    }

    /**
     * Check if all split hands are complete
     */
    allHandsComplete() {
        if (this.splitHands.length === 0) {
            return this.gameEnded || this.playerHand.isBusted();
        }
        
        return this.splitHands.every(hand => hand.isBusted() || hand.isStood());
    }
}

module.exports = {
    Card,
    Deck,
    BlackjackHand,
    BlackjackGame,
    SUITS,
    RANKS
};