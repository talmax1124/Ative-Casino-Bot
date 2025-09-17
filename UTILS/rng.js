/**
 * Cryptographically Secure Pseudorandom Number Generator (CSPRNG)
 * Uses Node.js crypto.randomBytes for all random generation
 */

const crypto = require('crypto');

/**
 * Generate cryptographically secure random integer
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (exclusive)
 * @returns {number} Random integer in range [min, max)
 */
function secureRandomInt(min, max) {
    if (min >= max) {
        throw new Error('Invalid range: min must be less than max');
    }
    
    const range = max - min;
    const bytesNeeded = Math.ceil(Math.log2(range) / 8);
    const maxValue = Math.pow(256, bytesNeeded);
    const threshold = Math.floor(maxValue / range) * range;
    
    // Rejection sampling to avoid modulo bias
    let randomValue;
    do {
        const randomBytes = crypto.randomBytes(bytesNeeded);
        randomValue = 0;
        for (let i = 0; i < bytesNeeded; i++) {
            randomValue = (randomValue << 8) + randomBytes[i];
        }
    } while (randomValue >= threshold);
    
    return min + (randomValue % range);
}

/**
 * Generate cryptographically secure random float
 * @param {number} min - Minimum value (inclusive, default: 0)
 * @param {number} max - Maximum value (exclusive, default: 1)
 * @returns {number} Random float in range [min, max)
 */
function secureRandomFloat(min = 0, max = 1) {
    // Use 8 bytes for high precision
    const randomBytes = crypto.randomBytes(8);
    let randomValue = 0;
    
    // Convert bytes to integer
    for (let i = 0; i < 8; i++) {
        randomValue = (randomValue * 256) + randomBytes[i];
    }
    
    // Convert to float between 0 and 1
    const maxInt = Math.pow(256, 8);
    const ratio = randomValue / maxInt;
    
    return min + (ratio * (max - min));
}

/**
 * Generate cryptographically secure random boolean
 * @param {number} probability - Probability of returning true (0-1, default: 0.5)
 * @returns {boolean} Random boolean value
 */
function secureRandomBool(probability = 0.5) {
    return secureRandomFloat() < probability;
}

/**
 * Pick random element from array using CSPRNG
 * @param {Array} array - Array to pick from
 * @returns {*} Random element from array
 */
function secureRandomChoice(array) {
    if (!Array.isArray(array) || array.length === 0) {
        return null;
    }
    const index = secureRandomInt(0, array.length);
    return array[index];
}

/**
 * Shuffle array using Fisher-Yates algorithm with CSPRNG
 * @param {Array} array - Array to shuffle (modifies original)
 * @returns {Array} Shuffled array
 */
function secureRandomShuffle(array) {
    if (!Array.isArray(array)) {
        return array;
    }
    
    for (let i = array.length - 1; i > 0; i--) {
        const j = secureRandomInt(0, i + 1);
        [array[i], array[j]] = [array[j], array[i]];
    }
    
    return array;
}

/**
 * Generate random percentage chance (0-100) using CSPRNG
 * @returns {number} Random percentage
 */
function secureRandomPercentage() {
    return secureRandomFloat(0, 100);
}

/**
 * Check if random event occurs based on percentage chance using CSPRNG
 * @param {number} chance - Percentage chance (0-100)
 * @returns {boolean} True if event occurs
 */
function secureRandomChance(chance) {
    return secureRandomFloat(0, 100) < chance;
}

/**
 * Weighted random selection using CSPRNG
 * @param {Array} items - Array of items to choose from
 * @param {Array} weights - Array of weights corresponding to items
 * @returns {*} Randomly selected item based on weights
 */
function secureWeightedChoice(items, weights) {
    if (!Array.isArray(items) || !Array.isArray(weights) || items.length !== weights.length) {
        return null;
    }
    
    if (items.length === 0) {
        return null;
    }
    
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) {
        return secureRandomChoice(items);
    }
    
    const randomValue = secureRandomFloat(0, totalWeight);
    
    let currentWeight = 0;
    for (let i = 0; i < items.length; i++) {
        currentWeight += weights[i];
        if (randomValue <= currentWeight) {
            return items[i];
        }
    }
    
    return items[items.length - 1];
}

/**
 * Generate cryptographically secure random UUID v4
 * @returns {string} Random UUID
 */
function secureRandomUUID() {
    return crypto.randomUUID();
}

/**
 * Generate cryptographically secure random hex string
 * @param {number} length - Length of hex string (default: 32)
 * @returns {string} Random hex string
 */
function secureRandomHex(length = 32) {
    const bytes = Math.ceil(length / 2);
    return crypto.randomBytes(bytes).toString('hex').substring(0, length);
}

/**
 * Generate cryptographically secure random bytes
 * @param {number} size - Number of bytes to generate
 * @returns {Buffer} Random bytes
 */
function secureRandomBytes(size) {
    return crypto.randomBytes(size);
}

/**
 * CSPRNG random for casino games
 * @param {string} gameType - Type of game (ignored in simple implementation)
 * @param {string} userId - User ID (ignored in simple implementation)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {Object} Result with value
 */
function generateProvablyFairRandom(gameType, userId, min, max) {
    return {
        value: secureRandomInt(min, max),
        proof: {
            method: 'CSPRNG',
            timestamp: Date.now()
        }
    };
}

/**
 * Generate CSPRNG random (ignores anti-streak for simplicity)
 * @param {Array} recentResults - Recent results (ignored)
 * @param {Array} possibleValues - Possible values to choose from
 * @param {number} maxStreakLength - Maximum allowed streak (ignored)
 * @returns {*} Random value
 */
function generateAntiStreakRandom(recentResults, possibleValues, maxStreakLength = 3) {
    return secureRandomChoice(possibleValues);
}

/**
 * Return a CSPRNG hazard lane index
 * @param {number} totalLanes - Total number of lanes (default: 5)
 * @returns {number} Random lane index in range [0, totalLanes-1]
 */
function getSecureHazard(totalLanes = 5) {
    const lanes = Math.max(1, Math.floor(totalLanes));
    return secureRandomInt(0, lanes);
}

/**
 * Generate multiple CSPRNG random numbers
 * @param {number} count - Number of values to generate
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {Array} Array of random numbers
 */
function secureRandomMultiple(count, min, max) {
    const results = [];
    for (let i = 0; i < count; i++) {
        results.push(secureRandomInt(min, max));
    }
    return results;
}

/**
 * Generate CSPRNG dice roll
 * @param {number} sides - Number of sides on die (default: 6)
 * @returns {number} Random number from 1 to sides
 */
function secureRandomDice(sides = 6) {
    return secureRandomInt(1, sides + 1);
}

/**
 * Generate multiple CSPRNG dice rolls
 * @param {number} count - Number of dice
 * @param {number} sides - Number of sides per die (default: 6)
 * @returns {Array} Array of dice roll results
 */
function secureRandomDiceMultiple(count, sides = 6) {
    const results = [];
    for (let i = 0; i < count; i++) {
        results.push(secureRandomDice(sides));
    }
    return results;
}

module.exports = {
    secureRandomInt,
    secureRandomFloat,
    secureRandomBool,
    secureRandomChoice,
    secureRandomShuffle,
    secureRandomPercentage,
    secureRandomChance,
    secureWeightedChoice,
    secureRandomUUID,
    secureRandomHex,
    secureRandomBytes,
    generateProvablyFairRandom,
    generateAntiStreakRandom,
    getSecureHazard,
    secureRandomMultiple,
    secureRandomDice,
    secureRandomDiceMultiple
};