/**
 * Blackjack Game Logic - COMPLETELY REWRITTEN
 * Fixed payout calculations and game mechanics
 */

const { secureRandomShuffle } = require('../UTILS/rng');
const logger = require('../UTILS/logger');

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
        this.doubled = false;
        this.betMultiplier = 1; // For tracking double down
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

    double() {
        this.doubled = true;
        this.betMultiplier = 2;
    }

    isDoubled() {
        return this.doubled;
    }

    getBetMultiplier() {
        return this.betMultiplier;
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

    isSoft() {
        // A hand is soft if it contains an ace counted as 11
        let value = 0;
        let aces = 0;
        let usedAces = 0;

        for (const card of this.cards) {
            if (card.rank === 'A') {
                aces++;
                value += 11;
            } else {
                value += card.getValue();
            }
        }

        // Count how many aces need to be reduced
        while (value > 21 && usedAces < aces) {
            value -= 10;
            usedAces++;
        }

        // Hand is soft if we have aces and at least one is still counted as 11
        return aces > 0 && usedAces < aces;
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
    constructor(userId, betAmount, modeConfig = null, currentWealth = 0) {
        this.userId = userId;
        this.betAmount = betAmount;
        this.currentWealth = currentWealth;
        this.modeConfig = modeConfig || {
            name: 'Balanced',
            blackjackMultiplier: 2.5,  // Standard 3:2 payout (bet + 1.5x profit)
            winMultiplier: 2.0,         // Standard 1:1 payout (bet + 1x profit)
            houseEdge: 0.005            // 0.5% house edge
        };
        this.deck = new Deck();
        this.playerHand = new BlackjackHand();
        this.dealerHand = new BlackjackHand();
        this.gameEnded = false;
        this.splitHands = [];
        this.currentHandIndex = 0;
        this.doubled = false;
        this.insuranceOffered = false;
        this.insuranceTaken = false;
        this.insuranceAmount = 0;
    }

    dealInitialCards() {
        // Deal two cards to player and dealer
        this.playerHand.addCard(this.deck.dealCard());
        this.dealerHand.addCard(this.deck.dealCard());
        this.playerHand.addCard(this.deck.dealCard());
        this.dealerHand.addCard(this.deck.dealCard());
        
        // Check if insurance should be offered
        if (this.dealerHand.cards[0].rank === 'A') {
            this.insuranceOffered = true;
        }
    }

    canOfferInsurance() {
        return this.insuranceOffered && !this.insuranceTaken && !this.gameEnded;
    }

    takeInsurance() {
        if (!this.canOfferInsurance()) return false;
        
        // Insurance costs half the original bet
        this.insuranceAmount = Math.floor(this.betAmount / 2);
        this.insuranceTaken = true;
        this.insuranceOffered = false;
        return true;
    }

    declineInsurance() {
        this.insuranceOffered = false;
        return true;
    }

    dealerHasBlackjack() {
        return this.dealerHand.getValue() === 21 && this.dealerHand.cards.length === 2;
    }

    canSplit() {
        return this.playerHand.cards.length === 2 && 
               this.playerHand.cards[0].rank === this.playerHand.cards[1].rank &&
               this.splitHands.length === 0;
    }

    canDouble() {
        const currentHand = this.getCurrentHand();
        if (this.gameEnded) return false;
        if (!currentHand || !currentHand.cards || currentHand.cards.length !== 2) return false;
        // Standard double down rules: any two cards
        return true;
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
            // Add bounds checking to prevent undefined access
            if (this.currentHandIndex >= 0 && this.currentHandIndex < this.splitHands.length) {
                return this.splitHands[this.currentHandIndex];
            }
            // Fallback to first split hand if index is invalid
            return this.splitHands[0] || this.playerHand;
        }
        return this.playerHand;
    }

    hit() {
        const currentHand = this.getCurrentHand();
        if (!currentHand || !currentHand.cards) return false;
        
        currentHand.addCard(this.deck.dealCard());
        
        // Check if busted or reached 21
        if (currentHand.isBusted() || currentHand.getValue() === 21) {
            this.nextHand();
        }
    }

    stand() {
        // Mark current hand as stood before moving to next
        const currentHand = this.getCurrentHand();
        if (currentHand && currentHand.cards) {
            currentHand.stand();
        }
        this.nextHand();
    }

    doubleDown() {
        const currentHand = this.getCurrentHand();
        if (!currentHand || !currentHand.cards || currentHand.cards.length !== 2) return false;
        
        // Mark the current hand as doubled
        currentHand.double();
        
        // If this is the main hand (no splits), also set the global doubled flag
        if (this.splitHands.length === 0) {
            this.doubled = true;
        }
        
        currentHand.addCard(this.deck.dealCard());
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
        // Standard rules: dealer stands on all 17s
        while (this.dealerHand.getValue() < 17) {
            this.dealerHand.addCard(this.deck.dealCard());
        }
        this.gameEnded = true;
    }

    /**
     * COMPLETELY REWRITTEN RESULT CALCULATION
     * This is the core fix - proper payout calculation for all scenarios
     */
    async getResults(options = {}) {
        const results = [];
        
        if (this.splitHands.length > 0) {
            // Handle split hands
            for (let i = 0; i < this.splitHands.length; i++) {
                const hand = this.splitHands[i];
                const result = await this.calculateHandResult(hand, options);
                results.push({
                    hand: i + 1,
                    ...result
                });
            }
        } else {
            // Handle single hand
            const result = await this.calculateHandResult(this.playerHand, options);
            results.push(result);
        }

        return results;
    }

    /**
     * CORE FIX: Proper payout calculation
     * Returns the TOTAL amount to give back to the player (including their original bet)
     */
    async calculateHandResult(playerHand, options = {}) {
        const playerValue = playerHand.getValue();
        const dealerValue = this.dealerHand.getValue();
        const effectiveBet = this.betAmount * playerHand.getBetMultiplier();
        
        let payout = 0;  // Total amount to return to player
        let outcome = '';
        let won = false;

        // CRITICAL FIX: Calculate payouts correctly
        if (playerHand.isBusted()) {
            // Player busted - loses bet (payout = 0)
            payout = 0;
            outcome = 'BUSTED';
            won = false;
        } else if (this.dealerHand.isBusted()) {
            // Dealer busted - player wins
            payout = effectiveBet * (this.modeConfig?.winMultiplier || 2.0);
            outcome = 'DEALER BUSTED';
            won = true;
        } else if (playerHand.isBlackjack() && !this.dealerHand.isBlackjack()) {
            // Player blackjack (dealer doesn't have blackjack)
            payout = effectiveBet * (this.modeConfig?.blackjackMultiplier || 2.5);
            outcome = 'BLACKJACK';
            won = true;
        } else if (playerHand.isBlackjack() && this.dealerHand.isBlackjack()) {
            // Both have blackjack - push
            payout = effectiveBet;  // Return bet
            outcome = 'PUSH';
            won = false;
        } else if (playerValue === dealerValue) {
            // Push - return bet
            payout = effectiveBet;  // Return bet
            outcome = 'PUSH';
            won = false;
        } else if (playerValue > dealerValue) {
            // Player wins
            payout = effectiveBet * (this.modeConfig?.winMultiplier || 2.0);
            outcome = 'WIN';
            won = true;
        } else {
            // Player loses
            payout = 0;
            outcome = 'LOSE';
            won = false;
        }

        // Calculate insurance payout if applicable
        let insurancePayout = 0;
        let insuranceWon = false;
        if (this.insuranceTaken && (this.splitHands.length === 0 || playerHand === this.splitHands[0])) {
            if (this.dealerHasBlackjack()) {
                // Insurance wins - pays 2:1 (returns 3x the insurance bet)
                insurancePayout = this.insuranceAmount * 3;
                insuranceWon = true;
            }
            // If dealer doesn't have blackjack, insurance bet is lost (no payout)
        }

        logger.info(`Blackjack result: outcome=${outcome}, bet=${effectiveBet}, payout=${payout}, won=${won}`);

        return {
            outcome,
            payout,  // Total amount to return (including original bet for wins/pushes)
            won,
            betAmount: effectiveBet,
            doubled: playerHand.isDoubled(),
            insurancePayout,
            insuranceWon,
            insuranceAmount: this.insuranceTaken ? this.insuranceAmount : 0,
            playerValue,
            dealerValue
        };
    }

    /**
     * Check if current hand is complete (busted or stood)
     */
    isCurrentHandComplete() {
        if (this.splitHands.length > 0) {
            const currentHand = this.getCurrentHand();
            if (!currentHand) return true;
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
        
        return this.splitHands.filter(hand => hand && hand.cards).every(hand => hand.isBusted() || hand.isStood());
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