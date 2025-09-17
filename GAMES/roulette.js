/**
 * Roulette Game Logic
 * American roulette with single zero (0-36)
 */

const { secureRandomInt } = require('../UTILS/rng');

class RouletteGame {
    constructor(userId, betAmount) {
        this.userId = userId;
        this.betAmount = betAmount;
        this.currentBet = null;
        this.lastResult = null;
        this.lastPayout = 0;
        this.isSpinning = false;
        this.gameEnded = false;
        this.sessionId = null;
        
        // American roulette wheel layout (0, 00, 1-36)
        this.wheelNumbers = ['00', 0, ...Array.from({ length: 36 }, (_, i) => i + 1)];
        
        // Define red and black numbers (American wheel)
        this.redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
        this.blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
        this.greenNumbers = [0, '00'];
    }

    /**
     * Place a bet on the roulette table
     * @param {string} betType - Type of bet (red, black, odd, even, low, high, dozen1, dozen2, dozen3, column1, column2, column3, number, green, basket)
     * @param {number} amount - Amount to bet
     * @param {Array} numbers - Specific numbers for number bets
     */
    placeBet(betType, amount, numbers = null) {
        if (this.isSpinning || this.gameEnded) {
            throw new Error('Cannot place bet while game is in progress or ended');
        }

        this.currentBet = {
            type: betType,
            amount: amount,
            numbers: numbers
        };
    }

    /**
     * Clear the current bet
     */
    clearBet() {
        if (this.isSpinning) {
            throw new Error('Cannot clear bet while game is spinning');
        }

        this.currentBet = null;
    }

    /**
     * Reset the game state for error recovery
     */
    resetGameState() {
        this.isSpinning = false;
        this.gameEnded = false;
        this.lastResult = null;
        this.lastPayout = 0;
        this.currentBet = null;
    }

    /**
     * Spin the roulette wheel with house-biased RNG
     * @returns {number|string} The winning number (0, '00', or 1-36)
     */
    spin() {
        if (!this.currentBet) {
            throw new Error('No bet placed');
        }

        // Allow re-spinning if game was reset or if we're just starting
        if (this.gameEnded && this.lastResult !== null) {
            throw new Error('Game already completed');
        }

        // HOUSE-BIASED RNG SYSTEM
        const betType = this.currentBet.type;
        let result;

        // Increased chance for house-favorable outcomes based on bet type
        const houseBias = secureRandomInt(1, 100); // 1-100

        if (betType === 'red' || betType === 'black') {
            // For color bets: 35% chance to hit green (house wins)
            if (houseBias <= 35) {
                result = secureRandomInt(0, 2) === 0 ? 0 : '00'; // Green
            } else {
                // 65% for normal spin
                const randomIndex = secureRandomInt(0, 38);
                result = this.wheelNumbers[randomIndex];
            }
        } else if (betType === 'odd' || betType === 'even' || betType === 'low' || betType === 'high') {
            // For 50/50 bets: 40% chance to hit unfavorable numbers
            if (houseBias <= 40) {
                // Force losing outcome
                result = this.generateLosingNumber(betType);
            } else {
                const randomIndex = secureRandomInt(0, 38);
                result = this.wheelNumbers[randomIndex];
            }
        } else if (betType === 'dozen1' || betType === 'dozen2' || betType === 'dozen3') {
            // For dozen bets: 50% chance to hit other dozens or green
            if (houseBias <= 50) {
                result = this.generateLosingNumber(betType);
            } else {
                const randomIndex = secureRandomInt(0, 38);
                result = this.wheelNumbers[randomIndex];
            }
        } else if (betType === 'number') {
            // For single numbers: 95% chance to miss (was ~97.4% naturally)
            if (houseBias <= 95) {
                result = this.generateLosingNumber(betType);
            } else {
                // 5% chance to actually hit the number
                result = this.currentBet.numbers[0];
            }
        } else if (betType === 'green') {
            // For green bets: 85% chance to hit non-green
            if (houseBias <= 85) {
                const nonGreenNumbers = this.wheelNumbers.filter(n => n !== 0 && n !== '00');
                const randomIndex = secureRandomInt(0, nonGreenNumbers.length);
                result = nonGreenNumbers[randomIndex];
            } else {
                result = secureRandomInt(0, 2) === 0 ? 0 : '00';
            }
        } else if (betType === 'basket') {
            // For basket bets: 90% chance to miss (VERY SLIM as requested)
            if (houseBias <= 90) {
                const nonBasketNumbers = this.wheelNumbers.filter(n => 
                    n !== 0 && n !== '00' && n !== 1 && n !== 2 && n !== 3
                );
                const randomIndex = secureRandomInt(0, nonBasketNumbers.length);
                result = nonBasketNumbers[randomIndex];
            } else {
                // 10% chance to hit basket
                const basketNumbers = [0, '00', 1, 2, 3];
                const randomIndex = secureRandomInt(0, basketNumbers.length);
                result = basketNumbers[randomIndex];
            }
        } else {
            // Default: normal random spin for other bet types
            const randomIndex = secureRandomInt(0, 38);
            result = this.wheelNumbers[randomIndex];
        }
        
        this.lastResult = result;
        this.isSpinning = false;
        this.gameEnded = true;

        return result;
    }

    /**
     * Generate a losing number for a specific bet type
     * @param {string} betType - The bet type
     * @returns {number|string} A number that loses for this bet type
     */
    generateLosingNumber(betType) {
        switch (betType) {
            case 'red':
                // Return black or green
                const nonRed = [...this.blackNumbers, 0, '00'];
                return nonRed[secureRandomInt(0, nonRed.length)];
            case 'black':
                // Return red or green
                const nonBlack = [...this.redNumbers, 0, '00'];
                return nonBlack[secureRandomInt(0, nonBlack.length)];
            case 'odd':
                // Return even or green
                const evenAndGreen = this.wheelNumbers.filter(n => 
                    n === 0 || n === '00' || (typeof n === 'number' && n % 2 === 0)
                );
                return evenAndGreen[secureRandomInt(0, evenAndGreen.length)];
            case 'even':
                // Return odd or green
                const oddAndGreen = this.wheelNumbers.filter(n => 
                    n === 0 || n === '00' || (typeof n === 'number' && n % 2 === 1)
                );
                return oddAndGreen[secureRandomInt(0, oddAndGreen.length)];
            case 'low':
                // Return high (19-36) or green
                const highAndGreen = [...Array.from({ length: 18 }, (_, i) => i + 19), 0, '00'];
                return highAndGreen[secureRandomInt(0, highAndGreen.length)];
            case 'high':
                // Return low (1-18) or green
                const lowAndGreen = [...Array.from({ length: 18 }, (_, i) => i + 1), 0, '00'];
                return lowAndGreen[secureRandomInt(0, lowAndGreen.length)];
            case 'dozen1':
                // Return dozen2, dozen3, or green
                const nonDozen1 = [...Array.from({ length: 24 }, (_, i) => i + 13), 0, '00'];
                return nonDozen1[secureRandomInt(0, nonDozen1.length)];
            case 'dozen2':
                // Return dozen1, dozen3, or green
                const nonDozen2 = [...Array.from({ length: 12 }, (_, i) => i + 1), 
                                 ...Array.from({ length: 12 }, (_, i) => i + 25), 0, '00'];
                return nonDozen2[secureRandomInt(0, nonDozen2.length)];
            case 'dozen3':
                // Return dozen1, dozen2, or green
                const nonDozen3 = [...Array.from({ length: 24 }, (_, i) => i + 1), 0, '00'];
                return nonDozen3[secureRandomInt(0, nonDozen3.length)];
            case 'number':
                // Return any number except the bet number
                const betNumber = this.currentBet.numbers[0];
                const otherNumbers = this.wheelNumbers.filter(n => n !== betNumber);
                return otherNumbers[secureRandomInt(0, otherNumbers.length)];
            default:
                // Fallback to green
                return secureRandomInt(0, 2) === 0 ? 0 : '00';
        }
    }

    /**
     * Calculate payout based on bet and result with custom multipliers
     * @param {number|string} result - The winning number (0, '00', or 1-36)
     * @returns {number} Payout amount
     */
    calculatePayout(result) {
        if (!this.currentBet) {
            return 0;
        }

        const { type, amount, numbers } = this.currentBet;
        let won = false;

        // Convert result to number for comparisons (except '00')
        const numResult = result === '00' ? '00' : Number(result);

        switch (type) {
            case 'red':
                won = typeof numResult === 'number' && this.redNumbers.includes(numResult);
                break;
            case 'black':
                won = typeof numResult === 'number' && this.blackNumbers.includes(numResult);
                break;
            case 'odd':
                won = typeof numResult === 'number' && numResult !== 0 && numResult % 2 === 1;
                break;
            case 'even':
                won = typeof numResult === 'number' && numResult !== 0 && numResult % 2 === 0;
                break;
            case 'low':
                won = typeof numResult === 'number' && numResult >= 1 && numResult <= 18;
                break;
            case 'high':
                won = typeof numResult === 'number' && numResult >= 19 && numResult <= 36;
                break;
            case 'dozen1':
                won = typeof numResult === 'number' && numResult >= 1 && numResult <= 12;
                break;
            case 'dozen2':
                won = typeof numResult === 'number' && numResult >= 13 && numResult <= 24;
                break;
            case 'dozen3':
                won = typeof numResult === 'number' && numResult >= 25 && numResult <= 36;
                break;
            case 'column1':
                won = typeof numResult === 'number' && numResult > 0 && (numResult - 1) % 3 === 0;
                break;
            case 'column2':
                won = typeof numResult === 'number' && numResult > 0 && (numResult - 2) % 3 === 0;
                break;
            case 'column3':
                won = typeof numResult === 'number' && numResult > 0 && (numResult - 3) % 3 === 0;
                break;
            case 'number':
                won = numbers && (numbers.includes(numResult) || numbers.includes(result));
                break;
            case 'green':
                won = result === 0 || result === '00';
                break;
            case 'basket':
                // Basket bet covers 0, 00, 1, 2, 3
                won = result === 0 || result === '00' || numResult === 1 || numResult === 2 || numResult === 3;
                break;
            default:
                won = false;
        }

        if (!won) {
            this.lastPayout = 0;
            return 0;
        }

        // Calculate payout based on reduced multipliers for house edge
        let payout = 0;
        switch (type) {
            case 'red':
            case 'black':
                // Color bets: 1.8x payout (reduced from 2x)
                payout = amount * 1.8;
                break;
            case 'odd':
            case 'even':
                // Even/odd bets: 1.8x payout (reduced from 2x)
                payout = amount * 1.8;
                break;
            case 'low':
            case 'high':
                // 1-18/19-36 bets: 1.8x payout (reduced from 2x)
                payout = amount * 1.8;
                break;
            case 'dozen1':
            case 'dozen2':
            case 'dozen3':
                // Dozen bets: 2.5x payout (reduced from 3.0x)
                payout = amount * 2.5;
                break;
            case 'column1':
            case 'column2':
            case 'column3':
                // Column bets: 2.5x payout (reduced from 3.0x)
                payout = amount * 2.5;
                break;
            case 'number':
                // All number bets: 4.5x payout (reduced from 6x)
                payout = amount * 4.5;
                break;
            case 'green':
                // Green bet (0 or 00): 4.5x payout (reduced from 6x)
                payout = amount * 4.5;
                break;
            case 'basket':
                // Basket bet: 2.2x payout (VERY SLIM - reduced from 6x)
                payout = amount * 2.2;
                break;
            default:
                payout = 0;
        }

        this.lastPayout = payout;
        return payout;
    }

    /**
     * Get the color of a number
     * @param {number|string} number - The number to check
     * @returns {string} Color ('red', 'black', or 'green')
     */
    getNumberColor(number) {
        if (number === 0 || number === '00') return 'green';
        const num = Number(number);
        if (this.redNumbers.includes(num)) return 'red';
        if (this.blackNumbers.includes(num)) return 'black';
        return 'green'; // Fallback
    }

    /**
     * Check if a bet type is valid
     * @param {string} betType - The bet type to check
     * @returns {boolean} True if valid
     */
    isValidBetType(betType) {
        const validTypes = [
            'red', 'black', 'odd', 'even', 'low', 'high',
            'dozen1', 'dozen2', 'dozen3',
            'column1', 'column2', 'column3',
            'number', 'green', 'basket'
        ];
        return validTypes.includes(betType);
    }

    /**
     * Get bet type description for display
     * @param {string} betType - The bet type
     * @returns {string} Human-readable description
     */
    getBetDescription(betType) {
        const descriptions = {
            'red': 'Red Numbers',
            'black': 'Black Numbers',
            'odd': 'Odd Numbers',
            'even': 'Even Numbers',
            'low': 'Low (1-18)',
            'high': 'High (19-36)',
            'dozen1': '1st Dozen (1-12)',
            'dozen2': '2nd Dozen (13-24)',
            'dozen3': '3rd Dozen (25-36)',
            'column1': '1st Column',
            'column2': '2nd Column',
            'column3': '3rd Column',
            'number': 'Straight Up',
            'green': 'Green (0, 00)',
            'basket': 'Basket (0, 00, 1, 2, 3)'
        };
        return descriptions[betType] || 'Unknown Bet';
    }

    /**
     * Get payout odds for display
     * @param {string} betType - The bet type
     * @returns {string} Odds description
     */
    getPayoutOdds(betType) {
        // Displayed odds must match calculatePayout() multipliers exactly
        const odds = {
            'red': '1.8x',
            'black': '1.8x',
            'odd': '1.8x',
            'even': '1.8x',
            'low': '1.8x',
            'high': '1.8x',
            'dozen1': '2.5x',
            'dozen2': '2.5x',
            'dozen3': '2.5x',
            'column1': '2.5x',
            'column2': '2.5x',
            'column3': '2.5x',
            'number': '4.5x',
            'green': '4.5x',
            'basket': '2.2x'
        };
        return odds[betType] || '0x';
    }

    /**
     * Get winning probability for a bet type (HOUSE-BIASED with reduced win rates)
     * @param {string} betType - The bet type
     * @returns {number} Probability (0-1)
     */
    getWinProbability(betType) {
        // These reflect the ACTUAL win chances with house bias applied
        const probabilities = {
            'red': 0.31,           // ~31% (was 47.4%) - 35% forced green losses
            'black': 0.31,         // ~31% (was 47.4%) - 35% forced green losses
            'odd': 0.28,           // ~28% (was 47.4%) - 40% forced losses
            'even': 0.28,          // ~28% (was 47.4%) - 40% forced losses
            'low': 0.28,           // ~28% (was 47.4%) - 40% forced losses
            'high': 0.28,          // ~28% (was 47.4%) - 40% forced losses
            'dozen1': 0.16,        // ~16% (was 31.6%) - 50% forced losses
            'dozen2': 0.16,        // ~16% (was 31.6%) - 50% forced losses
            'dozen3': 0.16,        // ~16% (was 31.6%) - 50% forced losses
            'column1': 0.16,       // ~16% (was 31.6%) - similar to dozens
            'column2': 0.16,       // ~16% (was 31.6%) - similar to dozens
            'column3': 0.16,       // ~16% (was 31.6%) - similar to dozens
            'number': 0.05,        // 5% (was 2.6%) - 95% forced misses
            'green': 0.15,         // 15% (was 5.3%) - 85% forced non-green
            'basket': 0.10         // 10% (was 13.2%) - 90% forced misses - VERY SLIM
        };
        return probabilities[betType] || 0;
    }

    /**
     * Get all numbers that would win for a bet type
     * @param {string} betType - The bet type
     * @returns {Array} Array of winning numbers
     */
    getWinningNumbers(betType) {
        switch (betType) {
            case 'red':
                return this.redNumbers;
            case 'black':
                return this.blackNumbers;
            case 'odd':
                return this.wheelNumbers.filter(n => n !== 0 && n % 2 === 1);
            case 'even':
                return this.wheelNumbers.filter(n => n !== 0 && n % 2 === 0);
            case 'low':
                return Array.from({ length: 18 }, (_, i) => i + 1);
            case 'high':
                return Array.from({ length: 18 }, (_, i) => i + 19);
            case 'dozen1':
                return Array.from({ length: 12 }, (_, i) => i + 1);
            case 'dozen2':
                return Array.from({ length: 12 }, (_, i) => i + 13);
            case 'dozen3':
                return Array.from({ length: 12 }, (_, i) => i + 25);
            case 'column1':
                return [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];
            case 'column2':
                return [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
            case 'column3':
                return [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];
            default:
                return [];
        }
    }

    /**
     * Generate a visual representation of the roulette wheel
     * @returns {string} ASCII art wheel
     */
    generateWheelDisplay() {
        const sectors = [];
        // European wheel order (starting from 0 and going clockwise)
        const wheelOrder = [
            0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
            24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
        ];
        
        for (let i = 0; i < wheelOrder.length; i++) {
            const num = wheelOrder[i];
            const color = this.getNumberColor(num);
            const emoji = color === 'red' ? '🔴' : color === 'black' ? '⚫' : '🟢';
            sectors.push(`${emoji}${num}`);
        }
        
        return sectors.join(' ');
    }
}

module.exports = { RouletteGame };
