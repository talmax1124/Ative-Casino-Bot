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
     * Spin the roulette wheel
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

        // Generate random number for American wheel (0, 00, 1-36)
        const randomIndex = secureRandomInt(0, 38); // 0 to 37 inclusive for 38 slots
        const result = this.wheelNumbers[randomIndex];
        
        this.lastResult = result;
        this.isSpinning = false;
        this.gameEnded = true;

        return result;
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

        // Calculate payout based on custom multipliers
        let payout = 0;
        switch (type) {
            case 'red':
            case 'black':
                // Color bets: 2x payout
                payout = amount * 2;
                break;
            case 'odd':
            case 'even':
                // Even/odd bets: 2x payout
                payout = amount * 2;
                break;
            case 'low':
            case 'high':
                // 1-18/19-36 bets: 2x payout
                payout = amount * 2;
                break;
            case 'dozen1':
            case 'dozen2':
            case 'dozen3':
                // Dozen bets: 3.0x payout - balanced risk/reward
                payout = amount * 3.0;
                break;
            case 'column1':
            case 'column2':
            case 'column3':
                // Column bets: 3.0x payout - balanced risk/reward
                payout = amount * 3.0;
                break;
            case 'number':
                // All number bets: 6x payout - MAXIMUM ALLOWED
                payout = amount * 6.0;
                break;
            case 'green':
                // Green bet (0 or 00): 6x payout - MAXIMUM ALLOWED
                payout = amount * 6.0;
                break;
            case 'basket':
                // Basket bet: 6x payout - MAXIMUM ALLOWED
                payout = amount * 6.0;
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
        const odds = {
            'red': '2x',
            'black': '2x',
            'odd': '2x',
            'even': '2x',
            'low': '2x',
            'high': '2x',
            'dozen1': '2.2x',
            'dozen2': '2.2x',
            'dozen3': '2.2x',
            'column1': '2.2x',
            'column2': '2.2x',
            'column3': '2.2x',
            'number': '12.5x',
            'green': '6.0x',
            'basket': '5.2x'
        };
        return odds[betType] || '0x';
    }

    /**
     * Get winning probability for a bet type (American wheel with 38 slots)
     * @param {string} betType - The bet type
     * @returns {number} Probability (0-1)
     */
    getWinProbability(betType) {
        const probabilities = {
            'red': 18/38,          // 18 red numbers out of 38
            'black': 18/38,        // 18 black numbers out of 38
            'odd': 18/38,          // 18 odd numbers out of 38 (0 and 00 are neither)
            'even': 18/38,         // 18 even numbers out of 38
            'low': 18/38,          // Numbers 1-18
            'high': 18/38,         // Numbers 19-36
            'dozen1': 12/38,       // Numbers 1-12
            'dozen2': 12/38,       // Numbers 13-24
            'dozen3': 12/38,       // Numbers 25-36
            'column1': 12/38,      // Column 1
            'column2': 12/38,      // Column 2
            'column3': 12/38,      // Column 3
            'number': 1/38,        // Single number
            'green': 2/38,         // 0 and 00
            'basket': 5/38         // 0, 00, 1, 2, 3
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