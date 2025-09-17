/**
 * Yahtzee Game Logic
 * Complete Yahtzee game implementation with dice rolling, scoring, and game state management
 */

const { secureRandomDice } = require('../UTILS/rng');

// Yahtzee scoring combinations
const SCORING_CATEGORIES = {
    // Upper section
    ONES: 'ones',
    TWOS: 'twos', 
    THREES: 'threes',
    FOURS: 'fours',
    FIVES: 'fives',
    SIXES: 'sixes',
    
    // Lower section
    THREE_OF_A_KIND: 'three_of_a_kind',
    FOUR_OF_A_KIND: 'four_of_a_kind',
    FULL_HOUSE: 'full_house',
    SMALL_STRAIGHT: 'small_straight',
    LARGE_STRAIGHT: 'large_straight',
    YAHTZEE: 'yahtzee',
    CHANCE: 'chance'
};

const UPPER_SECTION = [
    SCORING_CATEGORIES.ONES,
    SCORING_CATEGORIES.TWOS,
    SCORING_CATEGORIES.THREES,
    SCORING_CATEGORIES.FOURS,
    SCORING_CATEGORIES.FIVES,
    SCORING_CATEGORIES.SIXES
];

const LOWER_SECTION = [
    SCORING_CATEGORIES.THREE_OF_A_KIND,
    SCORING_CATEGORIES.FOUR_OF_A_KIND,
    SCORING_CATEGORIES.FULL_HOUSE,
    SCORING_CATEGORIES.SMALL_STRAIGHT,
    SCORING_CATEGORIES.LARGE_STRAIGHT,
    SCORING_CATEGORIES.YAHTZEE,
    SCORING_CATEGORIES.CHANCE
];

class YahtzeeDice {
    constructor() {
        this.values = [0, 0, 0, 0, 0]; // 5 dice
        this.kept = [false, false, false, false, false]; // Which dice to keep
    }

    roll() {
        for (let i = 0; i < 5; i++) {
            if (!this.kept[i]) {
                this.values[i] = secureRandomDice(6);
            }
        }
    }

    keepDie(index) {
        if (index >= 0 && index < 5) {
            this.kept[index] = true;
        }
    }

    releaseDie(index) {
        if (index >= 0 && index < 5) {
            this.kept[index] = false;
        }
    }

    toggleKeep(index) {
        if (index >= 0 && index < 5) {
            this.kept[index] = !this.kept[index];
        }
    }

    releaseAll() {
        this.kept.fill(false);
    }

    getValues() {
        return [...this.values];
    }

    getKeptStatus() {
        return [...this.kept];
    }

    getSortedValues() {
        return [...this.values].sort((a, b) => a - b);
    }

    toString() {
        return this.values.map((val, i) => `${val}${this.kept[i] ? '🔒' : ''}`).join(' ');
    }
}

class YahtzeeScorer {
    static scoreUpperSection(dice, number) {
        return dice.filter(die => die === number).length * number;
    }

    static scoreThreeOfAKind(dice) {
        const counts = YahtzeeScorer.getCounts(dice);
        const hasThreeOfAKind = Object.values(counts).some(count => count >= 3);
        return hasThreeOfAKind ? dice.reduce((sum, die) => sum + die, 0) : 0;
    }

    static scoreFourOfAKind(dice) {
        const counts = YahtzeeScorer.getCounts(dice);
        const hasFourOfAKind = Object.values(counts).some(count => count >= 4);
        return hasFourOfAKind ? dice.reduce((sum, die) => sum + die, 0) : 0;
    }

    static scoreFullHouse(dice) {
        const counts = Object.values(YahtzeeScorer.getCounts(dice)).sort((a, b) => b - a);
        return (counts[0] === 3 && counts[1] === 2) ? 25 : 0;
    }

    static scoreSmallStraight(dice) {
        const uniqueValues = [...new Set(dice)].sort();
        
        // Check for 1-2-3-4, 2-3-4-5, or 3-4-5-6
        const straights = [
            [1, 2, 3, 4],
            [2, 3, 4, 5], 
            [3, 4, 5, 6]
        ];

        for (const straight of straights) {
            if (straight.every(value => uniqueValues.includes(value))) {
                return 30;
            }
        }
        return 0;
    }

    static scoreLargeStraight(dice) {
        const uniqueValues = [...new Set(dice)].sort();
        
        // Check for 1-2-3-4-5 or 2-3-4-5-6
        const largeStraights = [
            [1, 2, 3, 4, 5],
            [2, 3, 4, 5, 6]
        ];

        for (const straight of largeStraights) {
            if (straight.every(value => uniqueValues.includes(value)) && uniqueValues.length === 5) {
                return 40;
            }
        }
        return 0;
    }

    static scoreYahtzee(dice) {
        const counts = YahtzeeScorer.getCounts(dice);
        return Object.values(counts).some(count => count === 5) ? 50 : 0;
    }

    static scoreChance(dice) {
        return dice.reduce((sum, die) => sum + die, 0);
    }

    static getCounts(dice) {
        const counts = {};
        dice.forEach(die => {
            counts[die] = (counts[die] || 0) + 1;
        });
        return counts;
    }

    static isYahtzee(dice) {
        return YahtzeeScorer.scoreYahtzee(dice) > 0;
    }

    static getYahtzeeNumber(dice) {
        if (YahtzeeScorer.isYahtzee(dice)) {
            return dice[0]; // All dice are the same
        }
        return null;
    }

    static scoreCategory(category, dice) {
        switch (category) {
            case SCORING_CATEGORIES.ONES:
                return YahtzeeScorer.scoreUpperSection(dice, 1);
            case SCORING_CATEGORIES.TWOS:
                return YahtzeeScorer.scoreUpperSection(dice, 2);
            case SCORING_CATEGORIES.THREES:
                return YahtzeeScorer.scoreUpperSection(dice, 3);
            case SCORING_CATEGORIES.FOURS:
                return YahtzeeScorer.scoreUpperSection(dice, 4);
            case SCORING_CATEGORIES.FIVES:
                return YahtzeeScorer.scoreUpperSection(dice, 5);
            case SCORING_CATEGORIES.SIXES:
                return YahtzeeScorer.scoreUpperSection(dice, 6);
            case SCORING_CATEGORIES.THREE_OF_A_KIND:
                return YahtzeeScorer.scoreThreeOfAKind(dice);
            case SCORING_CATEGORIES.FOUR_OF_A_KIND:
                return YahtzeeScorer.scoreFourOfAKind(dice);
            case SCORING_CATEGORIES.FULL_HOUSE:
                return YahtzeeScorer.scoreFullHouse(dice);
            case SCORING_CATEGORIES.SMALL_STRAIGHT:
                return YahtzeeScorer.scoreSmallStraight(dice);
            case SCORING_CATEGORIES.LARGE_STRAIGHT:
                return YahtzeeScorer.scoreLargeStraight(dice);
            case SCORING_CATEGORIES.YAHTZEE:
                return YahtzeeScorer.scoreYahtzee(dice);
            case SCORING_CATEGORIES.CHANCE:
                return YahtzeeScorer.scoreChance(dice);
            default:
                return 0;
        }
    }
}

class YahtzeeGame {
    constructor(userId, betAmount = 0) {
        this.userId = userId;
        this.betAmount = betAmount;
        this.dice = new YahtzeeDice();
        this.rollsLeft = 3;
        this.currentRound = 1;
        this.maxRounds = 13; // 13 scoring categories
        this.gameEnded = false;
        
        // Scorecard - tracks scores for each category
        this.scorecard = {};
        UPPER_SECTION.concat(LOWER_SECTION).forEach(category => {
            this.scorecard[category] = null; // null = not scored yet
        });
        
        this.yahtzeeCount = 0; // Track multiple yahtzees
        this.bonusYahtzees = []; // Track bonus yahtzee scores
        
        // Game state
        this.totalScore = 0;
        this.upperSectionScore = 0;
        this.lowerSectionScore = 0;
        this.upperSectionBonus = 0;
    }

    rollDice() {
        if (this.rollsLeft <= 0 || this.gameEnded) {
            return false;
        }
        
        this.dice.roll();
        this.rollsLeft--;
        return true;
    }

    keepDie(index) {
        this.dice.keepDie(index);
    }

    releaseDie(index) {
        this.dice.releaseDie(index);
    }

    toggleKeep(index) {
        this.dice.toggleKeep(index);
    }

    scoreCategory(category) {
        if (this.scorecard[category] !== null || this.gameEnded) {
            return false; // Category already scored
        }

        const diceValues = this.dice.getValues();
        let score = 0;
        let bonusScore = 0;

        // Check for Yahtzee bonus situations
        if (YahtzeeScorer.isYahtzee(diceValues)) {
            if (this.scorecard[SCORING_CATEGORIES.YAHTZEE] !== null) {
                // This is a bonus Yahtzee
                if (this.scorecard[SCORING_CATEGORIES.YAHTZEE] > 0) {
                    // Previous Yahtzee was successful, get 100 bonus points
                    bonusScore = 100;
                    this.bonusYahtzees.push(bonusScore);
                }
                
                // Handle joker rules for bonus Yahtzee
                const yahtzeeNumber = YahtzeeScorer.getYahtzeeNumber(diceValues);
                const upperCategory = this.getUpperSectionCategory(yahtzeeNumber);
                
                if (upperCategory && this.scorecard[upperCategory] === null) {
                    // Must fill upper section if available
                    category = upperCategory;
                }
                // Otherwise can choose any available lower section
            } else {
                // First Yahtzee
                this.yahtzeeCount++;
            }
        }

        // Score the category
        score = YahtzeeScorer.scoreCategory(category, diceValues);
        this.scorecard[category] = score;

        // Add to appropriate section totals
        if (UPPER_SECTION.includes(category)) {
            this.upperSectionScore += score;
        } else {
            this.lowerSectionScore += score;
        }

        // Add bonus score for multiple Yahtzees
        this.lowerSectionScore += bonusScore;

        // Check for upper section bonus (63+ points)
        if (this.isUpperSectionComplete() && this.upperSectionBonus === 0) {
            if (this.upperSectionScore >= 63) {
                this.upperSectionBonus = 35;
            }
        }

        // Calculate total score
        this.totalScore = this.upperSectionScore + this.lowerSectionScore + this.upperSectionBonus;

        // Prepare for next round
        this.nextRound();
        
        return true;
    }

    getUpperSectionCategory(number) {
        const categoryMap = {
            1: SCORING_CATEGORIES.ONES,
            2: SCORING_CATEGORIES.TWOS,
            3: SCORING_CATEGORIES.THREES,
            4: SCORING_CATEGORIES.FOURS,
            5: SCORING_CATEGORIES.FIVES,
            6: SCORING_CATEGORIES.SIXES
        };
        return categoryMap[number];
    }

    nextRound() {
        this.currentRound++;
        this.rollsLeft = 3;
        this.dice = new YahtzeeDice(); // Reset dice

        // Check if game is complete
        if (this.currentRound > this.maxRounds || this.isGameComplete()) {
            this.gameEnded = true;
        }
    }

    isGameComplete() {
        return Object.values(this.scorecard).every(score => score !== null);
    }

    isUpperSectionComplete() {
        return UPPER_SECTION.every(category => this.scorecard[category] !== null);
    }

    getAvailableCategories() {
        return Object.keys(this.scorecard).filter(category => this.scorecard[category] === null);
    }

    getPotentialScores() {
        const diceValues = this.dice.getValues();
        const potentials = {};
        
        this.getAvailableCategories().forEach(category => {
            potentials[category] = YahtzeeScorer.scoreCategory(category, diceValues);
        });
        
        return potentials;
    }

    getScorecard() {
        return {
            scores: { ...this.scorecard },
            upperSectionScore: this.upperSectionScore,
            lowerSectionScore: this.lowerSectionScore,
            upperSectionBonus: this.upperSectionBonus,
            bonusYahtzees: [...this.bonusYahtzees],
            totalScore: this.totalScore
        };
    }

    getGameState() {
        return {
            userId: this.userId,
            betAmount: this.betAmount,
            dice: {
                values: this.dice.getValues(),
                kept: this.dice.getKeptStatus()
            },
            rollsLeft: this.rollsLeft,
            currentRound: this.currentRound,
            gameEnded: this.gameEnded,
            scorecard: this.getScorecard(),
            availableCategories: this.getAvailableCategories(),
            potentialScores: this.getPotentialScores()
        };
    }

    // Game result for payout calculation
    getResult() {
        if (!this.gameEnded) {
            return null;
        }

        // Simple scoring system - higher scores get better multipliers
        let multiplier = 1; // Base return of bet
        
        if (this.totalScore >= 300) {
            multiplier = 2.2; // Excellent score (reduced from 3)
        } else if (this.totalScore >= 250) {
            multiplier = 1.8; // Great score (reduced from 2.5)
        } else if (this.totalScore >= 200) {
            multiplier = 1.5; // Good score (reduced from 2)
        } else if (this.totalScore >= 150) {
            multiplier = 1.3; // Decent score (reduced from 1.5)
        }

        // Bonus for Yahtzee
        if (this.scorecard[SCORING_CATEGORIES.YAHTZEE] > 0) {
            multiplier += 0.3; // Reduced from 0.5
        }

        // Bonus for multiple Yahtzees
        multiplier += this.bonusYahtzees.length * 0.15; // Reduced from 0.25

        return {
            outcome: this.totalScore >= 150 ? 'WIN' : 'LOSS',
            multiplier,
            payout: Math.floor(this.betAmount * multiplier),
            score: this.totalScore,
            won: multiplier > 1
        };
    }
}

module.exports = {
    YahtzeeGame,
    YahtzeeDice, 
    YahtzeeScorer,
    SCORING_CATEGORIES,
    UPPER_SECTION,
    LOWER_SECTION
};