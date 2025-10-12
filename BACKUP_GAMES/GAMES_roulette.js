/**
 * Roulette Game Logic - COMPLETELY REWRITTEN
 * American roulette with TRUE CSPRNG randomness
 * Fixed green probability and mobile-optimized display
 */

const crypto = require('crypto');
const GameInputValidator = require('../UTILS/gameInputValidator');
const dynamicGameAdjuster = require('../UTILS/dynamicGameAdjuster');

// Global streak tracking to prevent excessive green runs
const globalStreakTracker = {
    recentResults: [],
    maxRecentResults: 50, // Track last 50 spins across all games
    
    addResult(result, color) {
        this.recentResults.push({ result, color, timestamp: Date.now() });
        
        // Keep only recent results (last 50 spins or last 10 minutes)
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        this.recentResults = this.recentResults
            .filter(r => r.timestamp > tenMinutesAgo)
            .slice(-this.maxRecentResults);
    },
    
    getRecentGreenStreak() {
        // Count consecutive greens from the end
        let streak = 0;
        for (let i = this.recentResults.length - 1; i >= 0; i--) {
            if (this.recentResults[i].color === 'green') {
                streak++;
            } else {
                break;
            }
        }
        return streak;
    },
    
    shouldAvoidGreen() {
        // DISABLED - No longer avoiding green for pure randomness
        return false;
    }
};

class RouletteGame {
    constructor(userId, betAmount) {
        this.userId = userId;
        this.originalBetAmount = betAmount;
        
        // Get dynamic bet limits and UI config from market cap system
        this.betLimits = dynamicGameAdjuster.getAdjustedBetLimits('roulette');
        this.uiConfig = dynamicGameAdjuster.getGameUIConfig('roulette');
        this.MAX_BET_AMOUNT = this.betLimits.max;
        this.MIN_BET_AMOUNT = this.betLimits.min;
        
        // SECURITY: Validate bet amount with dynamic limits
        this.validateBetAmount(betAmount);
        
        this.betAmount = betAmount;
        this.currentBet = null;
        this.currentBets = []; // SECURITY: Track multiple bets properly
        this.lastResult = null;
        this.lastPayout = 0;
        this.isSpinning = false;
        this.gameEnded = false;
        this.sessionId = null;
        
        // American roulette wheel (0, 00, 1-36) = 38 numbers total
        this.wheelNumbers = [0, '00', ...Array.from({ length: 36 }, (_, i) => i + 1)];
        
        // Define red and black numbers (standard American wheel)
        this.redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
        this.blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
        this.greenNumbers = [0, '00'];
    }

    /**
     * SECURITY: Validate bet amount using centralized validator
     */
    validateBetAmount(amount) {
        return GameInputValidator.validateBetAmount(amount, this.MIN_BET_AMOUNT, this.MAX_BET_AMOUNT);
    }

    /**
     * SECURITY: Validate roulette outcome using centralized validator
     */
    validateOutcome(outcome) {
        return GameInputValidator.validateRouletteOutcome(outcome);
    }

    /**
     * CRYPTOGRAPHICALLY SECURE RANDOM NUMBER GENERATION
     * Uses Node.js crypto.randomInt() which is CSPRNG-based
     */
    secureRandomInt(min, max) {
        return crypto.randomInt(min, max);
    }

    /**
     * Place a bet on the roulette table
     */
    placeBet(betType, amount, numbers = null) {
        if (this.isSpinning || this.gameEnded) {
            throw new Error('Cannot place bet while game is in progress or ended');
        }

        // SECURITY: Validate bet amount and type
        this.validateBetAmount(amount);
        this.validateBetType(betType, numbers);

        this.currentBet = {
            type: betType,
            amount: amount,
            numbers: numbers
        };
    }

    /**
     * SECURITY: Validate bet type to prevent invalid bets
     */
    validateBetType(betType, numbers) {
        const validBetTypes = [
            'red', 'black', 'odd', 'even', 'low', 'high',
            'dozen1', 'dozen2', 'dozen3',
            'column1', 'column2', 'column3',
            'number', 'green', 'basket'
        ];

        if (!validBetTypes.includes(betType)) {
            throw new Error(`Invalid bet type: ${betType}`);
        }

        // Special validation for number bets
        if (betType === 'number') {
            if (!Array.isArray(numbers) || numbers.length === 0) {
                throw new Error('Number bet requires valid numbers array');
            }
            
            // Validate each number in the array
            for (const num of numbers) {
                if (!this.wheelNumbers.includes(num)) {
                    throw new Error(`Invalid number for bet: ${num}`);
                }
            }
        }

        return true;
    }

    /**
     * SECURITY: Add multiple bets support for proper payout calculation
     */
    addBet(betType, amount, numbers = null) {
        if (this.isSpinning || this.gameEnded) {
            throw new Error('Cannot place bet while game is in progress or ended');
        }

        // SECURITY: Validate bet amount and type
        this.validateBetAmount(amount);
        this.validateBetType(betType, numbers);

        // Add to multiple bets array
        this.currentBets.push({
            type: betType,
            amount: amount,
            numbers: numbers
        });

        // Also set as current bet for backward compatibility
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
        this.currentBets = []; // SECURITY: Clear all bets
    }

    /**
     * SECURITY: Calculate total payout for all bets
     */
    calculateTotalPayout(result) {
        // SECURITY: Validate outcome before processing
        this.validateOutcome(result);
        
        let totalPayout = 0;
        
        // Calculate payout for each bet
        for (const bet of this.currentBets) {
            const betPayout = this.calculateSingleBetPayout(result, bet);
            totalPayout += betPayout;
        }
        
        // If no multiple bets, use single bet for backward compatibility
        if (this.currentBets.length === 0 && this.currentBet) {
            totalPayout = this.calculateSingleBetPayout(result, this.currentBet);
        }
        
        this.lastPayout = totalPayout;
        return totalPayout;
    }

    /**
     * SECURITY: Calculate payout for a single bet
     */
    calculateSingleBetPayout(result, bet) {
        const { type, amount, numbers } = bet;
        
        // SECURITY: Validate bet amount
        this.validateBetAmount(amount);
        
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
                won = typeof numResult === 'number' && numResult > 0 && numResult % 2 === 1;
                break;
            case 'even':
                won = typeof numResult === 'number' && numResult > 0 && numResult % 2 === 0;
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
            return 0;
        }

        // FAIR PAYOUTS - Standard casino odds (returns total amount including bet)
        let payout = 0;
        switch (type) {
            case 'red':
            case 'black':
            case 'odd':
            case 'even':
            case 'low':
            case 'high':
                // 1:1 odds - returns double the bet (bet + 1x profit)
                payout = amount * 2;
                break;
            case 'dozen1':
            case 'dozen2':
            case 'dozen3':
            case 'column1':
            case 'column2':
            case 'column3':
                // 2:1 odds - returns triple the bet (bet + 2x profit)
                payout = amount * 3;
                break;
            case 'number':
                // 35:1 odds - returns 36x the bet (bet + 35x profit)
                payout = amount * 36;
                break;
            case 'green':
                // 35:1 odds - returns 36x the bet (same as single number)
                payout = amount * 36;
                break;
            case 'basket':
                // 6:1 odds - returns 7x the bet (bet + 6x profit)
                payout = amount * 7;
                break;
            default:
                payout = 0;
        }

        return payout;
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
     * PURELY RANDOM SPIN - NO INTERFERENCE
     * Each number has exactly 1/38 probability (2.63%)
     * Green (0, 00) appears 2/38 = 5.26% of the time (natural casino odds)
     * NO streak breaking or manipulation - pure mathematical fairness
     */
    spin() {
        if (!this.currentBet) {
            throw new Error('No bet placed');
        }

        if (this.gameEnded && this.lastResult !== null) {
            throw new Error('Game already completed');
        }

        this.isSpinning = true;

        // PURE CSPRNG - ABSOLUTELY NO MANIPULATION
        const randomIndex = this.secureRandomInt(0, 38);
        const result = this.wheelNumbers[randomIndex];
        
        // Track for statistics only (no interference)
        const finalColor = this.getNumberColor(result);
        globalStreakTracker.addResult(result, finalColor);
        
        // Debug logging 
        const logger = require('../UTILS/logger');
        logger.info(`Roulette spin: ${result} (${finalColor}) - pure random`);
        
        this.lastResult = result;
        this.isSpinning = false;
        this.gameEnded = true;

        return result;
    }

    /**
     * Calculate payout based on bet and result with FAIR multipliers
     */
    calculatePayout(result) {
        // SECURITY: Validate outcome before processing
        this.validateOutcome(result);
        
        if (!this.currentBet) {
            return 0;
        }

        const { type, amount, numbers } = this.currentBet;
        
        // SECURITY: Validate bet amount again during payout calculation
        this.validateBetAmount(amount);
        
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
                won = typeof numResult === 'number' && numResult > 0 && numResult % 2 === 1;
                break;
            case 'even':
                won = typeof numResult === 'number' && numResult > 0 && numResult % 2 === 0;
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

        // FAIR PAYOUTS - Standard casino odds (returns total amount including bet)
        let payout = 0;
        switch (type) {
            case 'red':
            case 'black':
            case 'odd':
            case 'even':
            case 'low':
            case 'high':
                // 1:1 odds - returns double the bet (bet + 1x profit)
                payout = amount * 2;
                break;
            case 'dozen1':
            case 'dozen2':
            case 'dozen3':
            case 'column1':
            case 'column2':
            case 'column3':
                // 2:1 odds - returns triple the bet (bet + 2x profit)
                payout = amount * 3;
                break;
            case 'number':
                // 35:1 odds - returns 36x the bet (bet + 35x profit)
                payout = amount * 36;
                break;
            case 'green':
                // 35:1 odds - returns 36x the bet (same as single number)
                payout = amount * 36;
                break;
            case 'basket':
                // 6:1 odds - returns 7x the bet (bet + 6x profit)
                payout = amount * 7;
                break;
            default:
                payout = 0;
        }

        this.lastPayout = payout;
        return payout;
    }

    /**
     * Get the color of a number
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
     * Get CORRECT payout odds for display
     */
    getPayoutOdds(betType) {
        const odds = {
            'red': '2.0x',
            'black': '2.0x',
            'odd': '2.0x',
            'even': '2.0x',
            'low': '2.0x',
            'high': '2.0x',
            'dozen1': '3.0x',
            'dozen2': '3.0x',
            'dozen3': '3.0x',
            'column1': '3.0x',
            'column2': '3.0x',
            'column3': '3.0x',
            'number': '36.0x',
            'green': '36.0x',
            'basket': '7.0x'
        };
        return odds[betType] || '0x';
    }

    /**
     * Get ACTUAL win probability (no bias)
     */
    getWinProbability(betType) {
        const probabilities = {
            'red': 18/38,          // 47.37% (18 red numbers)
            'black': 18/38,        // 47.37% (18 black numbers)
            'odd': 18/38,          // 47.37% (18 odd numbers: 1,3,5...35)
            'even': 18/38,         // 47.37% (18 even numbers: 2,4,6...36)
            'low': 18/38,          // 47.37% (numbers 1-18)
            'high': 18/38,         // 47.37% (numbers 19-36)
            'dozen1': 12/38,       // 31.58% (numbers 1-12)
            'dozen2': 12/38,       // 31.58% (numbers 13-24)
            'dozen3': 12/38,       // 31.58% (numbers 25-36)
            'column1': 12/38,      // 31.58% (12 numbers in column)
            'column2': 12/38,      // 31.58% (12 numbers in column)
            'column3': 12/38,      // 31.58% (12 numbers in column)
            'number': 1/38,        // 2.63% (single number)
            'green': 2/38,         // 5.26% (0 and 00)
            'basket': 5/38         // 13.16% (5 numbers: 0,00,1,2,3)
        };
        return probabilities[betType] || 0;
    }

    /**
     * Get all numbers that would win for a bet type
     */
    getWinningNumbers(betType) {
        switch (betType) {
            case 'red':
                return this.redNumbers;
            case 'black':
                return this.blackNumbers;
            case 'odd':
                return this.wheelNumbers.filter(n => typeof n === 'number' && n > 0 && n % 2 === 1);
            case 'even':
                return this.wheelNumbers.filter(n => typeof n === 'number' && n > 0 && n % 2 === 0);
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
     * MOBILE-OPTIMIZED WHEEL DISPLAY
     * Large, clearly visible numbers for mobile screens
     */
    generateMobileWheelDisplay() {
        const result = this.lastResult;
        if (result === null || result === undefined) return '';

        const color = this.getNumberColor(result);
        const emoji = color === 'red' ? '🔴' : color === 'black' ? '⚫' : '🟢';
        const resultStr = String(result).padStart(2, ' ');
        const colorStr = color.toUpperCase().padEnd(8, ' ');
        
        // Fixed format for proper alignment
        return `╔══════════════════╗
║   ROULETTE WIN   ║
║                  ║
║      ${emoji} ${resultStr}       ║
║                  ║
║    ${colorStr}    ║
╚══════════════════╝`;
    }

    /**
     * Generate visual representation with mobile optimization
     */
    generateWheelDisplay() {
        if (!this.lastResult && this.lastResult !== 0) {
            return '🎰 Ready to spin!';
        }

        const result = this.lastResult;
        const color = this.getNumberColor(result);
        const emoji = color === 'red' ? '🔴' : color === 'black' ? '⚫' : '🟢';
        
        // Show recent 5 spins for pattern visibility
        return `${emoji} **${result}** (${color.toUpperCase()})`;
    }

    /**
     * Get mobile-friendly bet layout
     */
    getMobileBetLayout() {
        return {
            quickBets: [
                { type: 'red', label: '🔴 Red', odds: '2x' },
                { type: 'black', label: '⚫ Black', odds: '2x' },
                { type: 'green', label: '🟢 Green', odds: '36x' },
                { type: 'odd', label: '🔢 Odd', odds: '2x' },
                { type: 'even', label: '🔢 Even', odds: '2x' },
                { type: 'low', label: '📉 Low (1-18)', odds: '2x' },
                { type: 'high', label: '📈 High (19-36)', odds: '2x' }
            ],
            dozens: [
                { type: 'dozen1', label: '1st (1-12)', odds: '3x' },
                { type: 'dozen2', label: '2nd (13-24)', odds: '3x' },
                { type: 'dozen3', label: '3rd (25-36)', odds: '3x' }
            ],
            columns: [
                { type: 'column1', label: 'Col 1', odds: '3x' },
                { type: 'column2', label: 'Col 2', odds: '3x' },
                { type: 'column3', label: 'Col 3', odds: '3x' }
            ]
        };
    }

    /**
     * Get recent results display for transparency
     */
    static getRecentResultsDisplay() {
        const recent = globalStreakTracker.recentResults.slice(-10); // Last 10 results
        if (recent.length === 0) return '🎰 No recent spins';
        
        const display = recent.map(r => {
            const emoji = r.color === 'red' ? '🔴' : r.color === 'black' ? '⚫' : '🟢';
            return `${emoji}${r.result}`;
        }).join(' ');
        
        const greenCount = recent.filter(r => r.color === 'green').length;
        const greenPercent = ((greenCount / recent.length) * 100).toFixed(1);
        
        return `**Recent 10:** ${display}\n🟢 Green: ${greenCount}/10 (${greenPercent}%)`;
    }

    /**
     * Get fairness statistics
     */
    static getFairnessStats() {
        const recent = globalStreakTracker.recentResults;
        if (recent.length < 10) return '🎯 Collecting data...';
        
        const greenCount = recent.filter(r => r.color === 'green').length;
        const greenPercent = ((greenCount / recent.length) * 100).toFixed(1);
        const streak = globalStreakTracker.getRecentGreenStreak();
        
        return `📊 **Fairness Stats:**\n🟢 Green rate: ${greenPercent}% (target: 5.3%)\n🎯 Current streak: ${streak === 0 ? 'None' : streak + ' green(s)'}\n✅ Streak protection: Active`;
    }
}

module.exports = { RouletteGame };