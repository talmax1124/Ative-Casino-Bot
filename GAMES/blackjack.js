/**
 * Blackjack Game Logic
 * Contains all blackjack game mechanics and card logic
 */

const { secureRandomShuffle } = require('../UTILS/rng');
const logger = require('../UTILS/logger');
const adaptiveGameMechanics = require('../UTILS/adaptiveGameMechanics');

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
            blackjackMultiplier: 1.5,
            winMultiplier: 1.0,
            houseEdge: 0.07
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
        // Slightly reduce player edge: allow double only on 9-11
        const val = currentHand.getValue();
        return val === 9 || val === 10 || val === 11;
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
        if (!currentHand || !currentHand.cards || currentHand.cards.length !== 2) return false; // Can only double on first two cards
        
        // Mark the current hand as doubled (this tracks it per hand for splits)
        currentHand.double();
        
        // If this is the main hand (no splits), also set the global doubled flag
        if (this.splitHands.length === 0) {
            this.doubled = true;
        }
        
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
        // More house-favorable rules: dealer hits on soft 17
        while (this.dealerHand.getValue() < 17 || (this.dealerHand.getValue() === 17 && this.dealerHand.isSoft())) {
            this.dealerHand.addCard(this.deck.dealCard());
        }
        this.gameEnded = true;
    }

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

    async calculateHandResult(playerHand, options = {}) {
        const playerValue = playerHand.getValue();
        const dealerValue = this.dealerHand.getValue();
        
        
        let baseMultiplier = 0;
        let outcome = '';

        if (playerHand.isBlackjack() && this.dealerHand.isBlackjack()) {
            // Both have blackjack - it's a PUSH (return bet)
            baseMultiplier = 1;
            outcome = 'PUSH';
        } else if (playerHand.isBlackjack() && !this.dealerHand.isBlackjack()) {
            baseMultiplier = options.personalizedPayouts?.blackjack || this.modeConfig?.blackjackMultiplier || 2.0;
            outcome = 'BLACKJACK';
        } else if (playerValue === dealerValue && !playerHand.isBusted()) {
            // Equal values are a push ONLY if neither player is busted
            baseMultiplier = 1;  // Push returns bet (1x multiplier)
            outcome = 'PUSH';
        } else if (playerHand.isBusted()) {
            // Player busted and dealer didn't have same value
            baseMultiplier = 0;
            outcome = 'BUSTED';
        } else if (this.dealerHand.isBusted()) {
            // Dealer busted and player didn't
            baseMultiplier = options.personalizedPayouts?.win || this.modeConfig?.winMultiplier || 1.2;
            outcome = 'DEALER BUSTED';
        } else if (playerValue > dealerValue) {
            baseMultiplier = options.personalizedPayouts?.win || this.modeConfig?.winMultiplier || 1.2;
            outcome = 'WIN';
        } else {
            baseMultiplier = 0;
            outcome = 'LOSE';
        }

        // Apply dynamic economic adjustments if winning
        let finalMultiplier = baseMultiplier;
        if (baseMultiplier > 1) {
            if (options.economicMultiplier) {
                // Legacy economic multiplier (for backward compatibility)
                const adjustedMultiplier = (baseMultiplier - 1) * options.economicMultiplier + 1;
                finalMultiplier = Math.max(1, adjustedMultiplier);
                
                if (finalMultiplier !== baseMultiplier) {
                    logger.info(`Blackjack multiplier adjusted: ${baseMultiplier.toFixed(2)}x → ${finalMultiplier.toFixed(2)}x (${((1 - options.economicMultiplier) * 100).toFixed(1)}% reduction)`);
                }
            } else if (this.currentWealth && this.currentWealth > 10_000_000) {
                // Use adaptive mechanics for wealthy players
                try {
                    const adaptedConfig = await adaptiveGameMechanics.getAdaptedGameConfig('blackjack', this.userId, this.currentWealth, this.betAmount);
                    if (adaptedConfig && adaptedConfig.adaptedWinChance) {
                        // Apply adaptive difficulty by reducing win chance (making the game harder)
                        const adaptedMultiplier = baseMultiplier * adaptedConfig.adaptedWinChance / adaptedConfig.baseWinChance;
                        finalMultiplier = Math.max(1, adaptedMultiplier);
                        
                        if (finalMultiplier !== baseMultiplier) {
                            logger.info(`Blackjack adaptive adjustment: ${baseMultiplier.toFixed(2)}x → ${finalMultiplier.toFixed(2)}x (wealth-based adaptation)`);
                        }
                    }
                } catch (error) {
                    logger.error(`Blackjack adaptive mechanics error: ${error.message}`);
                }
            }
        }

        // Calculate the effective bet amount for this hand (including double down)
        const effectiveBet = this.betAmount * playerHand.getBetMultiplier();
        
        // Determine if this is a "win" based on the base game outcome, not economic adjustments
        const isGameWin = baseMultiplier > 1;  // True win/loss based on game rules, not economic multiplier
        
        // Calculate insurance payout (only for the first hand in split scenarios)
        let insurancePayout = 0;
        let insuranceWon = false;
        if (this.insuranceTaken && (this.splitHands.length === 0 || playerHand === this.splitHands[0])) {
            if (this.dealerHasBlackjack()) {
                insurancePayout = this.insuranceAmount * 3; // Insurance pays 2:1 (returns 3x bet)
                insuranceWon = true;
            }
        }

        return {
            outcome,
            multiplier: finalMultiplier,
            baseMultiplier: baseMultiplier,  // Store original for reference
            payout: effectiveBet * finalMultiplier,  // Total amount to return to player (including bet)
            won: isGameWin,  // Based on game outcome, not economic adjustments
            betAmount: effectiveBet,  // The actual bet amount for this hand
            doubled: playerHand.isDoubled(),  // Whether this hand was doubled
            economicAdjusted: finalMultiplier !== baseMultiplier,  // Flag if economic system adjusted payout
            insurancePayout: insurancePayout,  // Insurance payout amount
            insuranceWon: insuranceWon,  // Whether insurance bet won
            insuranceAmount: this.insuranceTaken ? this.insuranceAmount : 0  // Insurance bet amount
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
        
        // Filter out any undefined hands and check completion
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
