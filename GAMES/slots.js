/**
 * Slots Game Logic
 * Contains all slot machine game mechanics and calculations
 */

const { secureRandomChoice, secureRandomInt } = require('../UTILS/rng');

// Slot symbols with their weights and multipliers
const SLOT_SYMBOLS = {
    '🍒': { weight: 30, multiplier: 2 },   // Cherry - common, low payout
    '🍋': { weight: 25, multiplier: 3 },   // Lemon
    '🍊': { weight: 20, multiplier: 4 },   // Orange
    '🍇': { weight: 15, multiplier: 5 },   // Grapes
    '🔔': { weight: 8, multiplier: 10 },   // Bell
    '💎': { weight: 2, multiplier: 50 },   // Diamond - rare, high payout
    '🎰': { weight: 1, multiplier: 100 }   // Jackpot - very rare
};

// Special combinations
const SPECIAL_COMBINATIONS = {
    '777': { symbols: ['🎰', '🎰', '🎰'], multiplier: 1000, name: 'MEGA JACKPOT' },
    'diamonds': { symbols: ['💎', '💎', '💎'], multiplier: 200, name: 'DIAMOND JACKPOT' },
    'bells': { symbols: ['🔔', '🔔', '🔔'], multiplier: 50, name: 'BELL BONUS' }
};

/**
 * Get weighted random symbol
 */
function getRandomSymbol() {
    const symbols = Object.keys(SLOT_SYMBOLS);
    const weights = symbols.map(symbol => SLOT_SYMBOLS[symbol].weight);
    
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const randomValue = secureRandomInt(0, totalWeight);
    
    let currentWeight = 0;
    for (let i = 0; i < symbols.length; i++) {
        currentWeight += weights[i];
        if (randomValue < currentWeight) {
            return symbols[i];
        }
    }
    
    return symbols[0]; // Fallback
}

/**
 * Spin the slot machine
 */
function spinSlots() {
    return [
        getRandomSymbol(),
        getRandomSymbol(),
        getRandomSymbol()
    ];
}

/**
 * Calculate payout based on slot results
 */
function calculatePayout(symbols, betAmount) {
    const [symbol1, symbol2, symbol3] = symbols;
    
    // Check for special combinations first
    for (const [key, combo] of Object.entries(SPECIAL_COMBINATIONS)) {
        if (symbols.every((symbol, index) => symbol === combo.symbols[index])) {
            return {
                payout: betAmount * combo.multiplier,
                multiplier: combo.multiplier,
                type: combo.name,
                won: true
            };
        }
    }
    
    // Check for three of a kind
    if (symbol1 === symbol2 && symbol2 === symbol3) {
        const multiplier = SLOT_SYMBOLS[symbol1].multiplier;
        return {
            payout: betAmount * multiplier,
            multiplier: multiplier,
            type: 'THREE OF A KIND',
            won: true
        };
    }
    
    // Check for two of a kind
    let matchedSymbol = null;
    let matchCount = 0;
    
    if (symbol1 === symbol2 || symbol1 === symbol3) {
        matchedSymbol = symbol1;
        matchCount = 2;
    } else if (symbol2 === symbol3) {
        matchedSymbol = symbol2;
        matchCount = 2;
    }
    
    if (matchedSymbol && matchCount === 2) {
        const baseMultiplier = SLOT_SYMBOLS[matchedSymbol].multiplier;
        const multiplier = baseMultiplier * 0.5; // Half payout for two of a kind
        
        if (multiplier >= 1) {
            return {
                payout: betAmount * multiplier,
                multiplier: multiplier,
                type: 'TWO OF A KIND',
                won: true
            };
        }
    }
    
    // No win
    return {
        payout: 0,
        multiplier: 0,
        type: 'NO MATCH',
        won: false
    };
}

/**
 * Create slot display for Discord
 */
function createSlotDisplay(symbols) {
    return `
╔═══════════════╗
║ ${symbols[0]} ║ ${symbols[1]} ║ ${symbols[2]} ║
╚═══════════════╝
    `;
}

module.exports = {
    SLOT_SYMBOLS,
    SPECIAL_COMBINATIONS,
    spinSlots,
    calculatePayout,
    createSlotDisplay
};