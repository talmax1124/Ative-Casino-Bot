/**
 * Slots game mechanics for ATIVE Casino Bot
 * Includes both regular 3-slot and 3x3 matrix modes with animation
 */

const Canvas = require('canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');
const logger = require('../UTILS/logger');
const { secureRandomFloat, secureRandomInt, secureRandomChoice, secureRandomBytes } = require('../UTILS/rng');
const securityLogger = require('../UTILS/securityLogger');

// BASE slot symbols - These get automatically adapted based on player wealth
// Players always see honest multipliers - the symbols adapt behind the scenes
// IMPROVED: Increased frequencies for better win rates while keeping payouts the same
const BASE_SLOT_SYMBOLS = {
    'cherries': { name: 'Cherries', emoji: '🍒', rarity: 50, basePayout: 1.05 },    // +15 more frequent
    'lemon': { name: 'Lemon', emoji: '🍋', rarity: 40, basePayout: 1.1 },         // +10 more frequent
    'orange': { name: 'Orange', emoji: '🍊', rarity: 30, basePayout: 1.2 },       // +10 more frequent
    'grapes': { name: 'Grapes', emoji: '🍇', rarity: 15, basePayout: 1.4 },       // +5 more frequent
    'watermelon': { name: 'Watermelon', emoji: '🍉', rarity: 5, basePayout: 1.6 }, // +2 more frequent
    'bar': { name: 'Bar', emoji: '📊', rarity: 2.5, basePayout: 1.8 },            // +1 more frequent
    'seven': { name: 'Lucky Seven', emoji: '7️⃣', rarity: 0.8, basePayout: 2.0 },  // 2x more frequent
    'diamond': { name: 'Diamond', emoji: '💎', rarity: 0.15, basePayout: 2.0 },   // Nearly 2x more frequent
    'buffalo': { name: 'Buffalo', emoji: '🦬', rarity: 0.05, basePayout: 2.0 },   // 2.5x more frequent
    'jackpot': { name: 'Jackpot', emoji: '🎰', rarity: 0.01, basePayout: 2.0 }    // 10x more frequent (but still rare)
};

// Default slot symbols (for backward compatibility)
const SLOT_SYMBOLS = BASE_SLOT_SYMBOLS;

/**
 * Get adapted slot symbols for a specific player
 * Automatically adjusts multipliers based on wealth while keeping them honest
 */
async function getAdaptedSlotSymbols(userId, currentWealth, betAmount) {
    const adaptiveGameMechanics = require('../UTILS/adaptiveGameMechanics');
    const adaptedSymbols = await adaptiveGameMechanics.getAdaptedSlotSymbols(userId, currentWealth, betAmount);
    
    // Convert to the format expected by the slots game
    const symbols = {};
    Object.entries(BASE_SLOT_SYMBOLS).forEach(([key, baseSymbol]) => {
        symbols[key] = {
            ...baseSymbol,
            payout: adaptedSymbols[key]?.payout || baseSymbol.basePayout
        };
    });
    
    return symbols;
}

// Matrix mode symbols - Max 2.2x multipliers, economically balanced (IMPROVED win rates)
const MATRIX_SYMBOLS = {
    'cherries': { name: 'Cherries', emoji: '🍒', rarity: 42, payout: 1.1 },        // +10 more frequent
    'lemon': { name: 'Lemon', emoji: '🍋', rarity: 35, payout: 1.2 },             // +8 more frequent
    'orange': { name: 'Orange', emoji: '🍊', rarity: 28, payout: 1.3 },           // +6 more frequent
    'grapes': { name: 'Grapes', emoji: '🍇', rarity: 20, payout: 1.5 },           // +4 more frequent
    'watermelon': { name: 'Watermelon', emoji: '🍉', rarity: 9, payout: 1.7 },    // +2.5 more frequent
    'bar': { name: 'Bar', emoji: '📊', rarity: 4, payout: 1.9 },                  // +1.2 more frequent
    'seven': { name: 'Lucky Seven', emoji: '7️⃣', rarity: 1.8, payout: 2.2 },     // +0.7 more frequent
    'diamond': { name: 'Diamond', emoji: '💎', rarity: 0.8, payout: 2.2 },       // Nearly 2x more frequent
    'buffalo': { name: 'Buffalo', emoji: '🦬', rarity: 0.18, payout: 2.2 },      // 2x more frequent + triggers bonus
    'jackpot': { name: 'Jackpot', emoji: '🎰', rarity: 0.05, payout: 2.2 }       // 2x more frequent but still rare
};

// Special combinations
const TWO_MATCH_MULTIPLIER = 0.75;
const MATRIX_MIN_BET = 35000;

// Color schemes for each symbol (more prominent backgrounds)
const SYMBOL_COLORS = {
    'cherries': '#FFCCCC',   // Prominent red
    'lemon': '#FFF700',      // Vibrant yellow
    'orange': '#FFCC80',     // Rich orange
    'grapes': '#D1C4E9',     // Purple
    'watermelon': '#C8E6C8',  // Fresh green
    'bar': '#BBDEFB',        // Prominent blue
    'seven': '#FFE082',      // Rich gold
    'diamond': '#B3E5FC',    // Bright cyan
    'buffalo': '#D7CCC8',    // Warm brown
    'jackpot': '#F8BBD9'     // Vibrant pink
};


/**
 * Draw a rounded rectangle
 */
function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

/**
 * Load slot symbol image with fallback
 */
async function loadSymbolImage(symbol) {
    try {
        const assetsPath = path.join(__dirname, '..', 'assets', 'slots');
        const imagePath = path.join(assetsPath, `${symbol}.png`);
        const image = await Canvas.loadImage(imagePath);
        return image;
    } catch (error) {
        logger.warn(`Failed to load symbol image for ${symbol}, using fallback`);
        // Create colored fallback square
        const canvas = Canvas.createCanvas(100, 100);
        const ctx = canvas.getContext('2d');
        const colors = {
            'cherries': '#FF69B4', 'lemon': '#FFFF00', 'orange': '#FFA500',
            'grapes': '#800080', 'watermelon': '#90EE90', 'bar': '#4B0082',
            'seven': '#FFD700', 'diamond': '#00BFFF', 'buffalo': '#8B4513',
            'jackpot': '#FF4500'
        };
        ctx.fillStyle = colors[symbol] || '#808080';
        ctx.fillRect(0, 0, 100, 100);
        return canvas;
    }
}

// Global distribution tracking for security monitoring
const DISTRIBUTION_TRACKER = {
    regular: {},
    matrix: {},
    totalSpins: { regular: 0, matrix: 0 },
    resetInterval: 10000 // Reset every 10,000 spins for accuracy
};

/**
 * SECURITY: Reset distribution tracking to prevent memory buildup
 */
function resetDistributionTracking() {
    DISTRIBUTION_TRACKER.regular = {};
    DISTRIBUTION_TRACKER.matrix = {};
    DISTRIBUTION_TRACKER.totalSpins.regular = 0;
    DISTRIBUTION_TRACKER.totalSpins.matrix = 0;
}

/**
 * SECURITY: Validate symbol distribution and detect anomalies
 */
function validateSymbolDistribution(matrixMode = false) {
    const mode = matrixMode ? 'matrix' : 'regular';
    const symbolDict = matrixMode ? MATRIX_SYMBOLS : SLOT_SYMBOLS;
    const tracker = DISTRIBUTION_TRACKER[mode];
    const totalSpins = DISTRIBUTION_TRACKER.totalSpins[mode];
    
    if (totalSpins < 1000) return; // Need sufficient sample size
    
    Object.keys(symbolDict).forEach(symbol => {
        const expected = symbolDict[symbol].rarity;
        const actual = (tracker[symbol] || 0) / totalSpins * 100;
        const deviation = Math.abs(actual - expected) / expected;
        
        // SECURITY: Alert if deviation exceeds 50% (indicates potential manipulation)
        if (deviation > 0.5) {
            logger.warn(`SECURITY: Symbol distribution anomaly detected - Symbol: ${symbol}, Expected: ${expected.toFixed(4)}%, Actual: ${actual.toFixed(4)}%, Deviation: ${(deviation * 100).toFixed(1)}%`);
            
            // Log to security system
            try {
                securityLogger.logSecurityEvent('SYSTEM', 'RNG_ANOMALY', {
                    game: 'slots',
                    mode: mode,
                    symbol: symbol,
                    expected: expected,
                    actual: actual,
                    deviation: deviation,
                    totalSample: totalSpins
                });
            } catch (secLogError) {
                logger.error(`Security logging error: ${secLogError.message}`);
            }
        }
    });
    
    // Reset tracking periodically to prevent memory buildup
    if (totalSpins >= DISTRIBUTION_TRACKER.resetInterval) {
        logger.info(`Resetting RNG distribution tracking after ${totalSpins} spins`);
        resetDistributionTracking();
    }
}

/**
 * Get weighted random symbol with enhanced security and distribution tracking
 */
function getWeightedSymbol(matrixMode = false, entropy = 0, adaptedSymbols = null) {
    const symbolDict = matrixMode ? MATRIX_SYMBOLS : (adaptedSymbols || SLOT_SYMBOLS);
    const symbols = Object.keys(symbolDict);
    
    // SECURITY: Validate symbol dictionary integrity
    if (!symbols.length) {
        throw new Error('Symbol dictionary is empty');
    }
    
    // SECURITY: Validate all symbol rarities are positive numbers
    for (const symbol of symbols) {
        const rarity = symbolDict[symbol].rarity;
        if (!Number.isFinite(rarity) || rarity <= 0) {
            throw new Error(`Invalid rarity for symbol ${symbol}: ${rarity}`);
        }
    }
    
    // Add entropy-based weight adjustment to reduce patterns (reduced from ±5% to ±2%)
    const baseWeights = symbols.map(symbol => symbolDict[symbol].rarity);
    const adjustedWeights = baseWeights.map((weight, index) => {
        // SECURITY: Reduced entropy variation to prevent exploitation
        const adjustment = Math.sin(entropy + index * 0.7) * 0.02; // Reduced from 0.05 to 0.02
        const adjustedWeight = Math.max(0.01, weight * (1 + adjustment));
        
        // SECURITY: Validate adjusted weight
        if (!Number.isFinite(adjustedWeight) || adjustedWeight <= 0) {
            logger.warn(`Invalid adjusted weight for ${symbol}: ${adjustedWeight}, using base weight: ${weight}`);
            return weight;
        }
        
        return adjustedWeight;
    });
    
    // SECURITY: Validate total weight before selection
    const totalWeight = adjustedWeights.reduce((sum, weight) => sum + weight, 0);
    if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
        throw new Error(`Invalid total weight: ${totalWeight}`);
    }
    
    // Weighted choice using CSPRNG
    const randomValue = secureRandomFloat(0, totalWeight);
    
    // SECURITY: Validate random value
    if (!Number.isFinite(randomValue) || randomValue < 0) {
        throw new Error(`Invalid random value: ${randomValue}`);
    }
    
    let currentWeight = 0;
    let selectedSymbol = null;
    
    for (let i = 0; i < symbols.length; i++) {
        currentWeight += adjustedWeights[i];
        if (randomValue <= currentWeight) {
            selectedSymbol = symbols[i];
            break;
        }
    }
    
    // SECURITY: Ensure a symbol was selected (fallback to first symbol)
    if (!selectedSymbol) {
        logger.warn(`No symbol selected with randomValue ${randomValue} and totalWeight ${totalWeight}, using fallback`);
        selectedSymbol = symbols[0];
    }
    
    // SECURITY: Track distribution for anomaly detection
    const mode = matrixMode ? 'matrix' : 'regular';
    if (!DISTRIBUTION_TRACKER[mode][selectedSymbol]) {
        DISTRIBUTION_TRACKER[mode][selectedSymbol] = 0;
    }
    DISTRIBUTION_TRACKER[mode][selectedSymbol]++;
    DISTRIBUTION_TRACKER.totalSpins[mode]++;
    
    // SECURITY: Periodically validate distribution
    if (DISTRIBUTION_TRACKER.totalSpins[mode] % 500 === 0) {
        validateSymbolDistribution(matrixMode);
    }
    
    return selectedSymbol;
}

/**
 * Generate entropy seed using CSPRNG
 */
function generateEntropy() {
    return Date.now() * Math.PI + secureRandomFloat(0, 1000);
}


/**
 * Generate regular slot result (3 symbols) with better randomization
 */
function spinSlots() {
    const entropy = generateEntropy();
    return [
        getWeightedSymbol(false, entropy),
        getWeightedSymbol(false, entropy * 1.3),
        getWeightedSymbol(false, entropy * 1.7)
    ];
}

/**
 * Generate matrix slot result (3x3 grid) with improved distribution
 */
function spinMatrixSlots() {
    const matrix = [];
    
    // Generate each position with completely independent entropy
    for (let row = 0; row < 3; row++) {
        const matrixRow = [];
        for (let col = 0; col < 3; col++) {
            // Each position gets completely fresh entropy - no patterns possible
            const independentEntropy = generateEntropy() + secureRandomFloat(0, 1000);
            matrixRow.push(getWeightedSymbol(true, independentEntropy));
        }
        matrix.push(matrixRow);
    }
    
    return matrix;
}

/**
 * Calculate payout for regular slots
 */
function calculatePayout(symbols, betAmount, personalizedPayouts = null, modeConfig = null) {
    // Check for three of a kind
    if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
        const symbol = symbols[0];
        const symbolData = SLOT_SYMBOLS[symbol];
        
        // Use personalized payout if available, otherwise use default
        let multiplier = symbolData.payout || symbolData.basePayout || 1.0;
        if (personalizedPayouts && personalizedPayouts[symbol] && !isNaN(personalizedPayouts[symbol])) {
            multiplier = personalizedPayouts[symbol];
        }
        
        // Validate multiplier to prevent NaN propagation
        if (isNaN(multiplier) || !isFinite(multiplier) || multiplier < 0) {
            logger.warn(`Invalid multiplier for symbol ${symbol}: ${multiplier}, using fallback 1.0`);
            multiplier = 1.0;
        }
        
        // Apply mode-specific maximum multiplier cap
        if (modeConfig && modeConfig.maxMatrixMultiplier) {
            multiplier = Math.min(multiplier, modeConfig.maxMatrixMultiplier);
        }
        
        // CRITICAL SECURITY FIX: Hard cap ALL multipliers to prevent exploitation
        const ABSOLUTE_MAX_MULTIPLIER = 3.0; // No multiplier can exceed 3x EVER
        const originalMultiplier = multiplier;
        multiplier = Math.min(multiplier, ABSOLUTE_MAX_MULTIPLIER);
        
        const payout = betAmount * multiplier;
        
        // SECURITY: Log any multiplier capping for monitoring
        if (originalMultiplier > ABSOLUTE_MAX_MULTIPLIER) {
            logger.warn(`SECURITY: Slots multiplier capped from ${originalMultiplier} to ${multiplier} for bet ${betAmount}`);
        }
        
        // Final validation to prevent NaN payout
        if (isNaN(payout) || !isFinite(payout)) {
            logger.error(`Invalid payout calculation in three-of-a-kind: betAmount=${betAmount}, multiplier=${multiplier}, result=${payout}`);
            return {
                won: false,
                payout: 0,
                multiplier: 0,
                type: '💥 Calculation error - Try again!'
            };
        }
        
        return {
            won: true,
            payout: payout,
            multiplier: multiplier,
            type: `🎰 JACKPOT! Three ${symbolData.name}s!`
        };
    }

    // Check for two of a kind (partial win)
    const counts = {};
    symbols.forEach(symbol => {
        counts[symbol] = (counts[symbol] || 0) + 1;
    });
    
    // Find if we have exactly 2 of the same symbol
    for (const symbol in counts) {
        if (counts[symbol] === 2) {
            const symbolData = SLOT_SYMBOLS[symbol];
            
            // Two of a kind pays at reduced rate
            let baseMultiplier = symbolData.payout || symbolData.basePayout || 1.0;
            if (personalizedPayouts && personalizedPayouts[symbol] && !isNaN(personalizedPayouts[symbol])) {
                baseMultiplier = personalizedPayouts[symbol];
            }
            
            // IMPROVED: Better partial win rate (was TWO_MATCH_MULTIPLIER=0.75, now 0.85)
            let multiplier = baseMultiplier * 0.85;
            
            // Validate multiplier to prevent NaN propagation
            if (isNaN(multiplier) || !isFinite(multiplier) || multiplier < 0) {
                logger.warn(`Invalid two-match multiplier for symbol ${symbol}: ${multiplier}, using fallback 0.85`);
                multiplier = 0.85;
            }
            
            // Apply mode-specific maximum multiplier cap
            if (modeConfig && modeConfig.maxMatrixMultiplier) {
                multiplier = Math.min(multiplier, modeConfig.maxMatrixMultiplier);
            }
            
            const payout = betAmount * multiplier;
            
            // Final validation to prevent NaN payout
            if (isNaN(payout) || !isFinite(payout)) {
                logger.error(`Invalid payout calculation in two-of-a-kind: betAmount=${betAmount}, multiplier=${multiplier}, result=${payout}`);
                return {
                    won: false,
                    payout: 0,
                    multiplier: 0,
                    type: '💥 Calculation error - Try again!'
                };
            }
            
            return {
                won: true,
                payout: payout,
                multiplier: multiplier,
                type: `🎯 Two ${symbolData.name}s!`
            };
        }
    }

    // No matches
    return {
        won: false,
        payout: 0,
        multiplier: 0,
        type: '💥 No matches - Try again!'
    };
}

/**
 * Calculate payout for matrix slots
 */
function calculateMatrixPayout(matrix, betAmount, modeConfig = null) {
    let totalPayout = 0;
    const resultMessages = [];
    const winningLines = [];
    let buffaloBonus = false;

    // Check horizontal lines
    for (let row = 0; row < 3; row++) {
        const line = [matrix[row][0], matrix[row][1], matrix[row][2]];
        if (line[0] === line[1] && line[1] === line[2]) {
            const symbol = line[0];
            const symbolData = MATRIX_SYMBOLS[symbol];
            
            if (symbol === 'buffalo') {
                let bonusMultiplier = 2.2; // 2.2x for buffalo bonus in matrix - balanced
                if (modeConfig && modeConfig.maxMatrixMultiplier) {
                    bonusMultiplier = Math.min(bonusMultiplier, modeConfig.maxMatrixMultiplier);
                }
                // CRITICAL SECURITY FIX: Cap buffalo bonuses to prevent stacking exploits
                bonusMultiplier = Math.min(bonusMultiplier, 2.5); // Hard cap at 2.5x
                const bonusPayout = betAmount * bonusMultiplier;
                
                // SECURITY: Prevent unlimited stacking by capping total payout per spin
                const proposedTotal = totalPayout + bonusPayout;
                const maxTotalPayout = betAmount * 10.0; // Maximum 10x total per spin
                if (proposedTotal > maxTotalPayout) {
                    const cappedBonus = maxTotalPayout - totalPayout;
                    logger.warn(`SECURITY: Buffalo bonus capped from ${bonusPayout} to ${cappedBonus} to prevent stacking exploit`);
                    totalPayout = maxTotalPayout;
                    resultMessages.push(`🦬 BUFFALO BONUS! Line: +${cappedBonus.toLocaleString()} (CAPPED)`);
                } else {
                    totalPayout += bonusPayout;
                    resultMessages.push(`🦬 BUFFALO BONUS! Line: +${bonusPayout.toLocaleString()}`);
                }
                winningLines.push({ type: 'horizontal', row, col: 0, endRow: row, endCol: 2 });
                buffaloBonus = true;
            } else {
                let lineMultiplier = symbolData.payout;
                if (modeConfig && modeConfig.maxMatrixMultiplier) {
                    lineMultiplier = Math.min(lineMultiplier, modeConfig.maxMatrixMultiplier);
                }
                // SECURITY: Cap all line multipliers
                lineMultiplier = Math.min(lineMultiplier, 3.0);
                const linePayout = betAmount * lineMultiplier;
                
                // SECURITY: Check total payout cap
                const proposedTotal = totalPayout + linePayout;
                const maxTotalPayout = betAmount * 10.0;
                if (proposedTotal > maxTotalPayout) {
                    const cappedPayout = maxTotalPayout - totalPayout;
                    totalPayout = maxTotalPayout;
                    resultMessages.push(`${symbolData.name} Line: +${cappedPayout.toLocaleString()} (CAPPED)`);
                } else {
                    totalPayout += linePayout;
                    resultMessages.push(`${symbolData.name} Line: +${linePayout.toLocaleString()}`);
                }
                winningLines.push({ type: 'horizontal', row, col: 0, endRow: row, endCol: 2 });
            }
        }
    }

    // Check vertical lines
    for (let col = 0; col < 3; col++) {
        const line = [matrix[0][col], matrix[1][col], matrix[2][col]];
        if (line[0] === line[1] && line[1] === line[2]) {
            const symbol = line[0];
            const symbolData = MATRIX_SYMBOLS[symbol];
            
            if (symbol === 'buffalo') {
                let bonusMultiplier = 3;
                if (modeConfig && modeConfig.maxMatrixMultiplier) {
                    bonusMultiplier = Math.min(bonusMultiplier, modeConfig.maxMatrixMultiplier);
                }
                // SECURITY: Cap buffalo bonuses
                bonusMultiplier = Math.min(bonusMultiplier, 2.5);
                const bonusPayout = betAmount * bonusMultiplier;
                
                // SECURITY: Prevent stacking exploits
                const proposedTotal = totalPayout + bonusPayout;
                const maxTotalPayout = betAmount * 10.0;
                if (proposedTotal > maxTotalPayout) {
                    const cappedBonus = maxTotalPayout - totalPayout;
                    logger.warn(`SECURITY: Buffalo column bonus capped from ${bonusPayout} to ${cappedBonus}`);
                    totalPayout = maxTotalPayout;
                    resultMessages.push(`🦬 BUFFALO BONUS! Column: +${cappedBonus.toLocaleString()} (CAPPED)`);
                } else {
                    totalPayout += bonusPayout;
                    resultMessages.push(`🦬 BUFFALO BONUS! Column: +${bonusPayout.toLocaleString()}`);
                }
                winningLines.push({ type: 'vertical', row: 0, col, endRow: 2, endCol: col });
                buffaloBonus = true;
            } else {
                let lineMultiplier = symbolData.payout;
                if (modeConfig && modeConfig.maxMatrixMultiplier) {
                    lineMultiplier = Math.min(lineMultiplier, modeConfig.maxMatrixMultiplier);
                }
                // SECURITY: Cap line multipliers
                lineMultiplier = Math.min(lineMultiplier, 3.0);
                const linePayout = betAmount * lineMultiplier;
                
                // SECURITY: Check total payout cap
                const proposedTotal = totalPayout + linePayout;
                const maxTotalPayout = betAmount * 10.0;
                if (proposedTotal > maxTotalPayout) {
                    const cappedPayout = maxTotalPayout - totalPayout;
                    totalPayout = maxTotalPayout;
                    resultMessages.push(`${symbolData.name} Column: +${cappedPayout.toLocaleString()} (CAPPED)`);
                } else {
                    totalPayout += linePayout;
                    resultMessages.push(`${symbolData.name} Column: +${linePayout.toLocaleString()}`);
                }
                winningLines.push({ type: 'vertical', row: 0, col, endRow: 2, endCol: col });
            }
        }
    }

    // Check diagonals
    const diagonal1 = [matrix[0][0], matrix[1][1], matrix[2][2]];
    if (diagonal1[0] === diagonal1[1] && diagonal1[1] === diagonal1[2]) {
        const symbol = diagonal1[0];
        const symbolData = MATRIX_SYMBOLS[symbol];
        
        if (symbol === 'buffalo') {
            let bonusMultiplier = 3;
            if (modeConfig && modeConfig.maxMatrixMultiplier) {
                bonusMultiplier = Math.min(bonusMultiplier, modeConfig.maxMatrixMultiplier);
            }
            // SECURITY: Cap buffalo bonuses
            bonusMultiplier = Math.min(bonusMultiplier, 2.5);
            const bonusPayout = betAmount * bonusMultiplier;
            
            // SECURITY: Prevent stacking exploits
            const proposedTotal = totalPayout + bonusPayout;
            const maxTotalPayout = betAmount * 10.0;
            if (proposedTotal > maxTotalPayout) {
                const cappedBonus = maxTotalPayout - totalPayout;
                logger.warn(`SECURITY: Buffalo diagonal1 bonus capped from ${bonusPayout} to ${cappedBonus}`);
                totalPayout = maxTotalPayout;
                resultMessages.push(`🦬 BUFFALO BONUS! Diagonal: +${cappedBonus.toLocaleString()} (CAPPED)`);
            } else {
                totalPayout += bonusPayout;
                resultMessages.push(`🦬 BUFFALO BONUS! Diagonal: +${bonusPayout.toLocaleString()}`);
            }
            winningLines.push({ type: 'diagonal1', row: 0, col: 0, endRow: 2, endCol: 2 });
            buffaloBonus = true;
        } else {
            let lineMultiplier = symbolData.payout;
            if (modeConfig && modeConfig.maxMatrixMultiplier) {
                lineMultiplier = Math.min(lineMultiplier, modeConfig.maxMatrixMultiplier);
            }
            // SECURITY: Cap line multipliers
            lineMultiplier = Math.min(lineMultiplier, 3.0);
            const linePayout = betAmount * lineMultiplier;
            
            // SECURITY: Check total payout cap
            const proposedTotal = totalPayout + linePayout;
            const maxTotalPayout = betAmount * 10.0;
            if (proposedTotal > maxTotalPayout) {
                const cappedPayout = maxTotalPayout - totalPayout;
                totalPayout = maxTotalPayout;
                resultMessages.push(`${symbolData.name} Diagonal: +${cappedPayout.toLocaleString()} (CAPPED)`);
            } else {
                totalPayout += linePayout;
                resultMessages.push(`${symbolData.name} Diagonal: +${linePayout.toLocaleString()}`);
            }
            winningLines.push({ type: 'diagonal1', row: 0, col: 0, endRow: 2, endCol: 2 });
        }
    }

    const diagonal2 = [matrix[0][2], matrix[1][1], matrix[2][0]];
    if (diagonal2[0] === diagonal2[1] && diagonal2[1] === diagonal2[2]) {
        const symbol = diagonal2[0];
        const symbolData = MATRIX_SYMBOLS[symbol];
        
        if (symbol === 'buffalo') {
            let bonusMultiplier = 3;
            if (modeConfig && modeConfig.maxMatrixMultiplier) {
                bonusMultiplier = Math.min(bonusMultiplier, modeConfig.maxMatrixMultiplier);
            }
            // SECURITY: Cap buffalo bonuses
            bonusMultiplier = Math.min(bonusMultiplier, 2.5);
            const bonusPayout = betAmount * bonusMultiplier;
            
            // SECURITY: Prevent stacking exploits
            const proposedTotal = totalPayout + bonusPayout;
            const maxTotalPayout = betAmount * 10.0;
            if (proposedTotal > maxTotalPayout) {
                const cappedBonus = maxTotalPayout - totalPayout;
                logger.warn(`SECURITY: Buffalo diagonal2 bonus capped from ${bonusPayout} to ${cappedBonus}`);
                totalPayout = maxTotalPayout;
                resultMessages.push(`🦬 BUFFALO BONUS! Diagonal: +${cappedBonus.toLocaleString()} (CAPPED)`);
            } else {
                totalPayout += bonusPayout;
                resultMessages.push(`🦬 BUFFALO BONUS! Diagonal: +${bonusPayout.toLocaleString()}`);
            }
            winningLines.push({ type: 'diagonal2', row: 0, col: 2, endRow: 2, endCol: 0 });
            buffaloBonus = true;
        } else {
            let lineMultiplier = symbolData.payout;
            if (modeConfig && modeConfig.maxMatrixMultiplier) {
                lineMultiplier = Math.min(lineMultiplier, modeConfig.maxMatrixMultiplier);
            }
            // SECURITY: Cap line multipliers
            lineMultiplier = Math.min(lineMultiplier, 3.0);
            const linePayout = betAmount * lineMultiplier;
            
            // SECURITY: Check total payout cap
            const proposedTotal = totalPayout + linePayout;
            const maxTotalPayout = betAmount * 10.0;
            if (proposedTotal > maxTotalPayout) {
                const cappedPayout = maxTotalPayout - totalPayout;
                totalPayout = maxTotalPayout;
            } else {
                totalPayout += linePayout;
            }
            resultMessages.push(`${symbolData.name} Diagonal: +${linePayout.toLocaleString()}`);
            winningLines.push({ type: 'diagonal2', row: 0, col: 2, endRow: 2, endCol: 0 });
        }
    }

    return {
        won: totalPayout > 0,
        payout: totalPayout,
        multiplier: totalPayout > 0 ? totalPayout / betAmount : 0,
        type: totalPayout > 0 ? resultMessages.join('; ') : '💥 No winning lines - Try again!',
        winningLines,
        buffaloBonus,
        freeSpins: buffaloBonus ? 5 : 0
    };
}

/**
 * Create animated visual display for regular slots
 */
function createSlotDisplay(symbols) {
    const emojis = symbols.map(symbol => SLOT_SYMBOLS[symbol].emoji);
    return `${emojis[0]} ${emojis[1]} ${emojis[2]}`;
}


/**
 * Create visual display for matrix slots
 */
function createMatrixDisplay(matrix) {
    const lines = matrix.map(row => 
        row.map(symbol => MATRIX_SYMBOLS[symbol].emoji).join(' ')
    );
    return lines.join('\n');
}


/**
 * Generate slot machine image for regular slots
 */
async function createSlotsImage(symbols, won = false) {
    try {
        const canvas = Canvas.createCanvas(600, 200);
        const ctx = canvas.getContext('2d');

        // White background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 600, 200);

        // Draw symbols only
        const symbolSize = 120;
        const symbolSpacing = 180; // Increased from 150 to 180
        const startX = 50; // Increased from 40 to 50
        const startY = 40;

        for (let i = 0; i < symbols.length; i++) {
            const symbol = symbols[i];
            const x = startX + (i * symbolSpacing);
            const y = startY;

            // Draw rounded background with symbol color (bigger card)
            ctx.fillStyle = SYMBOL_COLORS[symbol] || '#F5F5F5';
            drawRoundedRect(ctx, x - 20, y - 20, symbolSize + 40, symbolSize + 40, 20);
            ctx.fill();

            try {
                const symbolImage = await loadSymbolImage(symbol);
                ctx.drawImage(symbolImage, x, y, symbolSize, symbolSize);
            } catch (error) {
                // Fallback to emoji
                ctx.fillStyle = '#000000';
                ctx.font = '60px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(SLOT_SYMBOLS[symbol].emoji, x + symbolSize/2, y + symbolSize/2 + 20);
            }
        }

        return canvas.toBuffer('image/png');
    } catch (error) {
        logger.error(`Error creating slots image: ${error.message}`);
        return null;
    }
}

/**
 * Generate 3x3 matrix slots image
 */
async function createMatrixImage(matrix, winningLines = [], won = false) {
    try {
        // Canvas sized for just the symbols
        const canvasWidth = 500;
        const canvasHeight = 500;
        const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');

        // White background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Layout constants
        const cellSize = 120;
        const cellSpacing = 40; // Increased from 20 to 40
        const startX = 30; // Increased from 20 to 30
        const startY = 30; // Increased from 20 to 30

        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const symbol = matrix[row][col];
                const x = startX + (col * (cellSize + cellSpacing));
                const y = startY + (row * (cellSize + cellSpacing));

                // Draw non-overlapping background card with proper boundaries (match animation)
                const cardX = x - 5;
                const cardY = y - 5;
                const cardWidth = cellSize + 10;
                const cardHeight = cellSize + 10;
                
                ctx.fillStyle = SYMBOL_COLORS[symbol] || '#F5F5F5';
                drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 12);
                ctx.fill();
                
                // Add subtle border to prevent color bleeding (match animation)
                ctx.strokeStyle = '#DDDDDD';
                ctx.lineWidth = 1;
                drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 12);
                ctx.stroke();

                try {
                    const symbolImage = await loadSymbolImage(symbol);
                    // Draw the symbol image, properly centered and sized (match animation)
                    const imageSize = cellSize - 10; // Slightly smaller than cell
                    const imageX = x + (cellSize - imageSize) / 2;
                    const imageY = y + (cellSize - imageSize) / 2;
                    ctx.drawImage(symbolImage, imageX, imageY, imageSize, imageSize);
                } catch (error) {
                    // Fallback to emoji (match animation style)
                    ctx.fillStyle = '#000000';
                    ctx.font = 'bold 70px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(MATRIX_SYMBOLS[symbol].emoji, x + cellSize/2, y + cellSize/2);
                }
            }
        }

        // Draw winning lines if any
        if (won && winningLines.length > 0) {
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 8;
            winningLines.forEach(line => {
                const stride = cellSize + cellSpacing;
                const sX = startX + (line.col * stride) + cellSize / 2;
                const sY = startY + (line.row * stride) + cellSize / 2;
                const eX = startX + (line.endCol * stride) + cellSize / 2;
                const eY = startY + (line.endRow * stride) + cellSize / 2;
                
                ctx.beginPath();
                ctx.moveTo(sX, sY);
                ctx.lineTo(eX, eY);
                ctx.stroke();
            });
        }

        return canvas.toBuffer('image/png');
    } catch (error) {
        logger.error(`Error creating matrix image: ${error.message}`);
        return null;
    }
}

/**
 * Create animated GIF of spinning slot machine with assets
 */
async function createSpinningSlotGIF(finalSymbols) {
    try {
        // Match static image dimensions exactly
        const canvas = Canvas.createCanvas(600, 200);
        const ctx = canvas.getContext('2d');
        const encoder = new GIFEncoder(600, 200);
        
        encoder.start();
        encoder.setRepeat(0);
        encoder.setQuality(20); // Improved quality (was 10)

        // Pre-load all symbol images
        const symbolKeys = Object.keys(SLOT_SYMBOLS);
        const symbolImages = {};
        for (const symbol of symbolKeys) {
            symbolImages[symbol] = await loadSymbolImage(symbol);
        }

        // Animation parameters - Fast, smooth casino-style animation
        const totalFrames = 25; // Shorter, faster animation
        const symbolSize = 120; // EXACTLY match static image
        const symbolSpacing = 180; // EXACTLY match static image - increased spacing  
        const startX = 50; // EXACTLY match static image - increased from 40 to 50
        const startY = 40; // EXACTLY match static image
        
        // Create reel strips for FAST vertical animation without overlapping
        const reelStrips = [];
        for (let i = 0; i < 3; i++) {
            const strip = [];
            // Fewer symbols for faster, cleaner animation
            for (let j = 0; j < 8; j++) {
                strip.push(secureRandomChoice(symbolKeys));
            }
            // Add the final result at the end
            strip.push(finalSymbols[i]);
            reelStrips.push(strip);
        }

        // Generate frames - FAST casino-style animation
        for (let frame = 0; frame < totalFrames; frame++) {
            // Fast, consistent timing for smooth casino animation
            const delay = 60; // Fixed 60ms delay for smooth, fast animation
            encoder.setDelay(delay);
            
            // Clear canvas completely
            ctx.clearRect(0, 0, 600, 200);
            
            // Set white background (match static image)
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, 600, 200);
            
            // Draw each reel with FAST vertical sliding
            for (let i = 0; i < 3; i++) {
                const x = startX + (i * symbolSpacing);
                const strip = reelStrips[i];
                
                // Calculate reel stopping times (staggered for realistic effect)
                const reelStopFrame = totalFrames - 8 + (i * 2); // Earlier stops, tighter stagger
                let symbolIndex = strip.length - 1; // Final symbol by default
                
                if (frame < reelStopFrame) {
                    // Still spinning - FAST vertical sliding without overlap
                    const spinSpeed = 15; // High constant speed for casino effect
                    const totalMovement = frame * spinSpeed;
                    symbolIndex = Math.floor(totalMovement / symbolSize) % (strip.length - 1);
                }
                
                // Draw SINGLE symbol cleanly - NO OVERLAPPING
                const symbolKey = strip[symbolIndex];
                const symbolImage = symbolImages[symbolKey];
                const symbolY = startY; // Fixed position - no vertical offset for clean animation
                
                // Draw rounded background with symbol color (EXACTLY match static image)
                ctx.fillStyle = SYMBOL_COLORS[symbolKey] || '#F5F5F5';
                drawRoundedRect(ctx, x - 20, symbolY - 20, symbolSize + 40, symbolSize + 40, 20);
                ctx.fill();
                
                if (symbolImage) {
                    ctx.drawImage(symbolImage, x, symbolY, symbolSize, symbolSize);
                } else {
                    // Fallback to emoji
                    ctx.fillStyle = '#000000';
                    ctx.font = 'bold 60px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(SLOT_SYMBOLS[symbolKey].emoji, x + symbolSize/2, symbolY + symbolSize/2 + 20);
                }
            }
            
            encoder.addFrame(ctx);
        }
        
        encoder.finish();
        return encoder.out.getData();
        
    } catch (error) {
        logger.error(`Error creating spinning slot GIF: ${error.message}`);
        return null;
    }
}

/**
 * Create animated GIF of spinning matrix slots with assets
 */
async function createSpinningMatrixGIF(finalMatrix) {
    try {
        // Match static image dimensions exactly
        const canvas = Canvas.createCanvas(500, 500);
        const ctx = canvas.getContext('2d');
        const encoder = new GIFEncoder(500, 500);
        
        encoder.start();
        encoder.setRepeat(0);
        encoder.setQuality(10);

        // Pre-load all symbol images
        const symbolKeys = Object.keys(MATRIX_SYMBOLS);
        const symbolImages = {};
        for (const symbol of symbolKeys) {
            symbolImages[symbol] = await loadSymbolImage(symbol);
        }

        // Animation parameters - match static image layout
        const totalFrames = 30;
        const cellSize = 120; // Match static image
        const cellSpacing = 40; // Match static image
        const startX = 30; // Match static image
        const startY = 30; // Match static image
        
        // Create reel strips for each matrix cell
        const matrixStrips = [];
        for (let row = 0; row < 3; row++) {
            matrixStrips[row] = [];
            for (let col = 0; col < 3; col++) {
                const strip = [];
                // Add random symbols before the final result - reduced for performance
                for (let j = 0; j < 10; j++) {
                    strip.push(secureRandomChoice(symbolKeys));
                }
                // Add the final result at the end
                strip.push(finalMatrix[row][col]);
                matrixStrips[row][col] = strip;
            }
        }

        // Generate frames
        for (let frame = 0; frame < totalFrames; frame++) {
            // Variable delay - start fast, slow down at the end
            const progress = frame / (totalFrames - 1);
            const delay = Math.floor(60 + (progress * progress * 80)); // 60ms to 140ms - smoother animation
            encoder.setDelay(delay);
            
            // Completely clear canvas and reset all drawing states
            ctx.clearRect(0, 0, 500, 500);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0;
            
            // Solid white background
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, 500, 500);
            
            // Draw 3x3 matrix with proper spacing
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3; col++) {
                    const x = startX + (col * (cellSize + cellSpacing));
                    const y = startY + (row * (cellSize + cellSpacing));
                    
                    // Calculate which symbol to show based on animation progress
                    const strip = matrixStrips[row][col];
                    let symbolIndex;
                    
                    // Improved cascading effect - each cell stops at different times
                    const cellDelay = (row * 3 + col) * 1.5; // Reduced delay between cells
                    const cellStopFrame = Math.max(15, totalFrames - 12 + cellDelay);
                    
                    if (frame < cellStopFrame) {
                        // Still spinning - show cycling symbols with better timing
                        const spinSpeed = Math.max(2, Math.floor((totalFrames - frame) / 3));
                        symbolIndex = Math.floor((frame + col + row * 2) / spinSpeed) % (strip.length - 1);
                    } else {
                        // This cell has stopped - show final symbol
                        symbolIndex = strip.length - 1;
                    }
                    
                    const symbolKey = strip[symbolIndex];
                    const symbolImage = symbolImages[symbolKey];
                    
                    // Draw non-overlapping background card with proper boundaries
                    const cardX = x - 5;
                    const cardY = y - 5;
                    const cardWidth = cellSize + 10;
                    const cardHeight = cellSize + 10;
                    
                    ctx.fillStyle = SYMBOL_COLORS[symbolKey] || '#F5F5F5';
                    drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 12);
                    ctx.fill();
                    
                    // Add subtle border to prevent color bleeding
                    ctx.strokeStyle = '#DDDDDD';
                    ctx.lineWidth = 1;
                    drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 12);
                    ctx.stroke();
                    
                    if (symbolImage) {
                        // Draw the symbol image, properly centered and sized
                        const imageSize = cellSize - 10; // Slightly smaller than cell
                        const imageX = x + (cellSize - imageSize) / 2;
                        const imageY = y + (cellSize - imageSize) / 2;
                        ctx.drawImage(symbolImage, imageX, imageY, imageSize, imageSize);
                    } else {
                        // Fallback to emoji if image loading failed
                        ctx.fillStyle = '#000000';
                        ctx.font = 'bold 70px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(MATRIX_SYMBOLS[symbolKey].emoji, x + cellSize/2, y + cellSize/2);
                    }
                }
            }
            
            encoder.addFrame(ctx);
        }
        
        encoder.finish();
        return encoder.out.getData();
        
    } catch (error) {
        logger.error(`Error creating spinning matrix GIF: ${error.message}`);
        return null;
    }
}

module.exports = {
    SLOT_SYMBOLS,
    MATRIX_SYMBOLS,
    MATRIX_MIN_BET,
    getAdaptedSlotSymbols,
    spinSlots,
    spinMatrixSlots,
    calculatePayout,
    calculateMatrixPayout,
    createSlotDisplay,
    createMatrixDisplay,
    createSlotsImage,
    createMatrixImage,
    createSpinningSlotGIF,
    createSpinningMatrixGIF
};
