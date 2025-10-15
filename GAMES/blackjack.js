/**
 * Blackjack Game Logic - COMPLETELY REWRITTEN
 * Fixed payout calculations and game mechanics
 */

const { secureRandomShuffle, secureRandomFloat, secureRandomInt, secureRandomBytes } = require('../UTILS/rng');
const logger = require('../UTILS/logger');
const securityLogger = require('../UTILS/securityLogger');
const GameInputValidator = require('../UTILS/gameInputValidator');
// UNIVERSAL GAME INTEGRATION - ALL SYSTEMS
const UniversalGameIntegrator = require('../UTILS/UniversalGameIntegrator');
const sessionGuard = require('../UTILS/sessionGuard');
const transparentPayoutManager = require('../UTILS/transparentPayoutManager');
const tuningManager = require('../UTILS/tuningManager');

// Initialize game integrator
const gameIntegrator = new UniversalGameIntegrator('blackjack');


// Card definitions
const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

class Card {
    constructor(rank, suit) {
        // SECURITY: Validate card rank and suit
        this.validateRank(rank);
        this.validateSuit(suit);
        
        this.rank = rank;
        this.suit = suit;
    }

    /**
     * SECURITY: Validate card rank using centralized validator
     */
    validateRank(rank) {
        return GameInputValidator.validateCardRank(rank);
    }

    /**
     * SECURITY: Validate card suit using centralized validator
     */
    validateSuit(suit) {
        return GameInputValidator.validateCardSuit(suit);
    }

    getValue() {
        if (this.rank === 'A') return 11;
        if (['J', 'Q', 'K'].includes(this.rank)) return 10;
        
        // SECURITY: Validate numerical rank before parsing
        const numValue = parseInt(this.rank);
        if (isNaN(numValue) || numValue < 2 || numValue > 10) {
            throw new Error(`Invalid numerical card rank: ${this.rank}`);
        }
        
        return numValue;
    }

    toString() {
        return `${this.rank}${this.suit}`;
    }
}

class Deck {
    constructor() {
        this.cards = [];
        this.dealtCards = []; // Track dealt cards to prevent duplication
        this.shuffleCount = 0;
        this.reset();
    }

    reset() {
        this.cards = [];
        this.dealtCards = [];
        this.shuffleCount = 0;
        
        // SECURITY: Create deck with integrity validation
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                this.cards.push(new Card(rank, suit));
            }
        }
        
        // SECURITY: Validate deck has correct number of cards
        if (this.cards.length !== 52) {
            throw new Error(`Deck creation failed: expected 52 cards, got ${this.cards.length}`);
        }
        
        this.shuffle();
    }

    shuffle() {
        // SECURITY: Ensure deck has cards to shuffle
        if (!Array.isArray(this.cards) || this.cards.length === 0) {
            throw new Error('Cannot shuffle empty deck');
        }
        
        // SECURITY: Validate deck integrity before shuffling
        this.validateDeckIntegrity();
        
        secureRandomShuffle(this.cards);
        this.shuffleCount++;
        
        // SECURITY: Log excessive shuffling (potential manipulation attempt)
        if (this.shuffleCount > 10) {
            if (logger && logger.warn) {
                logger.warn(`SECURITY: Excessive deck shuffling detected: ${this.shuffleCount} shuffles`);
            } else {
                console.warn(`SECURITY: Excessive deck shuffling detected: ${this.shuffleCount} shuffles`);
            }
        }
    }

    /**
     * SECURITY: Validate deck integrity to prevent card duplication
     */
    validateDeckIntegrity() {
        const cardSet = new Set();
        const duplicates = [];
        
        for (const card of this.cards) {
            if (!card || !card.rank || !card.suit) {
                throw new Error('Deck contains invalid card object');
            }
            
            const cardKey = `${card.rank}${card.suit}`;
            
            if (cardSet.has(cardKey)) {
                duplicates.push(cardKey);
            } else {
                cardSet.add(cardKey);
            }
        }
        
        if (duplicates.length > 0) {
            throw new Error(`Deck integrity violation: duplicate cards found: ${duplicates.join(', ')}`);
        }
        
        // SECURITY: Check for missing cards
        const expectedCards = SUITS.length * RANKS.length;
        if (this.cards.length + this.dealtCards.length !== expectedCards) {
            throw new Error(`Deck integrity violation: expected ${expectedCards} total cards, got ${this.cards.length + this.dealtCards.length}`);
        }
        
        return true;
    }

    dealCard() {
        // SECURITY: Validate deck state before dealing
        if (!Array.isArray(this.cards)) {
            throw new Error('Deck cards array is invalid');
        }
        
        if (this.cards.length === 0) {
            // SECURITY: Log deck reset for monitoring
            logger.info('Deck exhausted, resetting and reshuffling');
            this.reset();
        }
        
        const card = this.cards.pop();
        
        // SECURITY: Validate dealt card
        if (!card || !card.rank || !card.suit) {
            throw new Error('Dealt card is invalid');
        }
        
        // SECURITY: Track dealt card to prevent re-dealing
        const cardKey = `${card.rank}${card.suit}`;
        if (this.dealtCards.includes(cardKey)) {
            throw new Error(`Card already dealt: ${cardKey}`);
        }
        
        this.dealtCards.push(cardKey);
        
        return card;
    }

    /**
     * SECURITY: Get deck status for monitoring
     */
    getDeckStatus() {
        return {
            cardsRemaining: this.cards.length,
            cardsDealt: this.dealtCards.length,
            shuffleCount: this.shuffleCount,
            isValid: this.cards.length + this.dealtCards.length === 52
        };
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
        // SECURITY: Validate hand is not empty
        if (!Array.isArray(this.cards) || this.cards.length === 0) {
            return 0;
        }

        let value = 0;
        let aces = 0;

        for (const card of this.cards) {
            // SECURITY: Validate card object
            if (!card || typeof card !== 'object') {
                throw new Error('Invalid card object in hand');
            }

            // SECURITY: Validate card has required properties
            if (!card.rank || !card.suit) {
                throw new Error('Card missing rank or suit property');
            }

            try {
                if (card.rank === 'A') {
                    aces++;
                    value += 11;
                } else {
                    // This will throw an error for invalid cards due to our Card validation
                    const cardValue = card.getValue();
                    
                    // SECURITY: Ensure card value is valid
                    if (!Number.isFinite(cardValue) || cardValue < 1 || cardValue > 11) {
                        throw new Error(`Invalid card value: ${cardValue} for rank ${card.rank}`);
                    }
                    
                    value += cardValue;
                }
            } catch (error) {
                throw new Error(`Error calculating card value for ${card.rank}${card.suit}: ${error.message}`);
            }
        }

        // SECURITY: Validate calculated value is reasonable
        if (!Number.isFinite(value) || value < 0) {
            throw new Error(`Invalid hand value calculated: ${value}`);
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
        // SECURITY: Validate bet amount (no cap - handled by PayoutManager)
        this.betAmount = Math.max(0, betAmount || 0);
        this.currentWealth = currentWealth;
        this.modeConfig = modeConfig || {
            name: 'Balanced',
            blackjackMultiplier: 2.45,  // Slightly reduced from 2.5 to 2.45 (45% profit)
            winMultiplier: 1.98,        // Slightly reduced from 2.0 to 1.98 (98% profit)
            houseEdge: 0.025            // 2.5% house edge (more balanced)
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

    canDoubleDown() {
        return this.canDouble();
    }

    canHit() {
        if (this.gameEnded) return false;
        const currentHand = this.getCurrentHand();
        if (!currentHand || !currentHand.cards) return false;
        if (currentHand.isBusted()) return false;
        if (currentHand.getValue() === 21) return false;
        if (currentHand.isStood()) return false;
        return true;
    }

    isGameOver() {
        return this.gameEnded || this.allHandsComplete();
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
            const rawWinnings = effectiveBet * (this.modeConfig?.winMultiplier || 1.0);
            // SECURITY FIX: Cap dealer bust payouts to prevent exploitation
            const maxWinnings = effectiveBet * 1.0; // Max 1x winnings for dealer bust
            const winnings = Math.min(rawWinnings, maxWinnings);
            payout = effectiveBet + winnings; // Return bet + winnings
            outcome = 'DEALER BUSTED';
            won = true;
            if (rawWinnings > maxWinnings) {
                if (logger && logger.warn) {
                    logger.warn(`SECURITY: Dealer bust winnings capped from ${rawWinnings} to ${maxWinnings} for user ${this.userId}`);
                } else {
                    console.warn(`SECURITY: Dealer bust winnings capped from ${rawWinnings} to ${maxWinnings} for user ${this.userId}`);
                }
            }
        } else if (playerHand.isBlackjack() && !this.dealerHand.isBlackjack()) {
            // Player blackjack (dealer doesn't have blackjack)
            const rawWinnings = effectiveBet * (this.modeConfig?.blackjackMultiplier || 1.5);
            // SECURITY FIX: Cap blackjack payouts to prevent exploitation
            const maxWinnings = effectiveBet * 1.5; // Max 1.5x winnings for blackjack
            const winnings = Math.min(rawWinnings, maxWinnings);
            payout = effectiveBet + winnings; // Return bet + winnings
            outcome = 'BLACKJACK';
            won = true;
            if (rawWinnings > maxWinnings) {
                if (logger && logger.warn) {
                    logger.warn(`SECURITY: Blackjack winnings capped from ${rawWinnings} to ${maxWinnings} for user ${this.userId}`);
                } else {
                    console.warn(`SECURITY: Blackjack winnings capped from ${rawWinnings} to ${maxWinnings} for user ${this.userId}`);
                }
            }
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
            const rawWinnings = effectiveBet * (this.modeConfig?.winMultiplier || 1.0);
            // SECURITY FIX: Cap all win payouts to prevent exploitation
            const maxWinnings = effectiveBet * 1.0; // Max 1x winnings for regular wins
            const winnings = Math.min(rawWinnings, maxWinnings);
            payout = effectiveBet + winnings; // Return bet + winnings
            outcome = 'WIN';
            won = true;
            if (rawWinnings > maxWinnings) {
                if (logger && logger.warn) {
                    logger.warn(`SECURITY: Regular win winnings capped from ${rawWinnings} to ${maxWinnings} for user ${this.userId}`);
                } else {
                    console.warn(`SECURITY: Regular win winnings capped from ${rawWinnings} to ${maxWinnings} for user ${this.userId}`);
                }
            }
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
                const rawInsurancePayout = this.insuranceAmount * 3;
                // SECURITY FIX: Cap insurance payouts to prevent exploitation
                const maxInsurancePayout = this.insuranceAmount * 3; // Standard 2:1 insurance payout
                insurancePayout = Math.min(rawInsurancePayout, maxInsurancePayout);
                insuranceWon = true;
                if (rawInsurancePayout > maxInsurancePayout) {
                    if (logger && logger.warn) {
                        logger.warn(`SECURITY: Insurance payout capped from ${rawInsurancePayout} to ${maxInsurancePayout} for user ${this.userId}`);
                    } else {
                        console.warn(`SECURITY: Insurance payout capped from ${rawInsurancePayout} to ${maxInsurancePayout} for user ${this.userId}`);
                    }
                }
            }
            // If dealer doesn't have blackjack, insurance bet is lost (no payout)
        }

        // CRITICAL SECURITY CHECK: Final payout validation to prevent ANY exploitation
        const totalPayout = payout + insurancePayout;
        const maxAllowedPayout = effectiveBet * 3.0; // Maximum possible payout is 3x bet (blackjack + insurance)
        const finalPayout = Math.min(totalPayout, maxAllowedPayout);
        
        if (totalPayout > maxAllowedPayout) {
            logger.error(`CRITICAL SECURITY ALERT: Blackjack payout exceeded maximum allowed! User: ${this.userId}, Attempted: ${totalPayout}, Capped: ${finalPayout}`);
            // Send alert to admin channel
            if (global.discordClient) {
                try {
                    const logChannel = global.discordClient.channels.cache.get('1406136478714826824'); // Replace with actual log channel
                    if (logChannel) {
                        logChannel.send(`🚨 **SECURITY ALERT** 🚨\nBlackjack payout exploitation attempt!\nUser: ${this.userId}\nAttempted payout: ${totalPayout}\nCapped to: ${finalPayout}`);
                    }
                } catch (alertError) {
                    logger.error(`Failed to send security alert: ${alertError.message}`);
                }
            }
        }

        logger.info(`Blackjack result: outcome=${outcome}, bet=${effectiveBet}, payout=${payout}, insurance=${insurancePayout}, total=${finalPayout}, won=${won}`);

        // SECURITY: Log game result for monitoring
        try {
            if (won) {
                securityLogger.logSecurityEvent(this.userId, 'GAME_WIN', {
                    game: 'blackjack',
                    amount: finalPayout,
                    betAmount: effectiveBet,
                    outcome: outcome,
                    multiplier: finalPayout / effectiveBet
                });
            } else {
                securityLogger.logSecurityEvent(this.userId, 'GAME_LOSS', {
                    game: 'blackjack',
                    amount: effectiveBet,
                    betAmount: effectiveBet,
                    outcome: outcome
                });
            }
            
            // Log bet for activity monitoring
            securityLogger.logSecurityEvent(this.userId, 'GAME_BET', {
                game: 'blackjack',
                amount: effectiveBet
            });
        } catch (securityLogError) {
            logger.error(`Security logging error: ${securityLogError.message}`);
        }

        return {
            outcome,
            payout: finalPayout,  // Use security-capped final payout
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

    getGameResult() {
        if (!this.gameEnded) {
            return { result: 'in_progress', isBlackjack: false };
        }

        const playerHand = this.splitHands.length > 0 ? this.splitHands[0] : this.playerHand;
        const playerValue = playerHand.getValue();
        const dealerValue = this.dealerHand.getValue();
        const isBlackjack = playerHand.isBlackjack();

        // Check for player bust
        if (playerHand.isBusted()) {
            return { result: 'lose', isBlackjack: false };
        }

        // Check for dealer bust
        if (this.dealerHand.isBusted()) {
            return { result: 'win', isBlackjack };
        }

        // Compare hands
        if (playerValue > dealerValue) {
            return { result: 'win', isBlackjack };
        } else if (playerValue < dealerValue) {
            return { result: 'lose', isBlackjack: false };
        } else {
            return { result: 'push', isBlackjack };
        }
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