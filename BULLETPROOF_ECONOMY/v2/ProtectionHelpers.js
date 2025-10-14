/**
 * Protection Helpers for Game Balance System
 *
 * Ensures:
 * - Non-economy players get full multipliers
 * - Developer is always exempt
 * - Safe fallbacks if economy disabled
 */

/**
 * Check if user should be exempt from economy restrictions
 *
 * @param {string} userId - User ID to check
 * @returns {boolean} - True if user is exempt
 */
function isExemptFromEconomy(userId) {
    // Developer is always exempt
    if (process.env.DEVELOPER_ID && userId === process.env.DEVELOPER_ID) {
        return true;
    }

    // Add other exemptions here (e.g., staff, beta testers)
    const exemptIds = process.env.EXEMPT_USER_IDS ? process.env.EXEMPT_USER_IDS.split(',') : [];
    if (exemptIds.includes(userId)) {
        return true;
    }

    return false;
}

/**
 * Check if economy system is active
 *
 * @returns {boolean} - True if economy system is active
 */
function isEconomyActive() {
    return global.economy && global.economy.initialized;
}

/**
 * Safe wrapper for calculating game payout with economy scaling
 * Includes all protection checks
 *
 * @param {string} userId - User ID
 * @param {string} guildId - Guild ID (optional)
 * @param {number} betAmount - Bet amount
 * @param {number} baseMultiplier - Base game multiplier
 * @param {string} gameType - Game type (e.g., 'slots_regular', 'roulette_number')
 * @returns {Promise<object>} - Payout calculation with protection info
 */
async function calculateProtectedPayout(userId, guildId, betAmount, baseMultiplier, gameType) {
    // Check 1: Is user exempt?
    if (isExemptFromEconomy(userId)) {
        return {
            betAmount: betAmount,
            baseMultiplier: baseMultiplier,
            finalMultiplier: baseMultiplier,
            grossPayout: betAmount * baseMultiplier,
            netPayout: betAmount * baseMultiplier,
            economyApplied: false,
            exemptReason: 'Developer/Exempt User',
            houseEdge: 0,
            scale: 1.0
        };
    }

    // Check 2: Is economy system active?
    if (!isEconomyActive()) {
        return {
            betAmount: betAmount,
            baseMultiplier: baseMultiplier,
            finalMultiplier: baseMultiplier,
            grossPayout: betAmount * baseMultiplier,
            netPayout: betAmount * baseMultiplier,
            economyApplied: false,
            exemptReason: 'Economy System Disabled',
            houseEdge: 0,
            scale: 1.0
        };
    }

    // Check 3: Apply economy scaling
    try {
        const gameBalance = global.economy.getGameBalance();
        const wealth = await gameBalance.getUserWealth(userId, guildId);

        // If user has no wealth data (not in economy), give full multipliers
        if (wealth === 0 || wealth === null || wealth === undefined) {
            return {
                betAmount: betAmount,
                baseMultiplier: baseMultiplier,
                finalMultiplier: baseMultiplier,
                grossPayout: betAmount * baseMultiplier,
                netPayout: betAmount * baseMultiplier,
                economyApplied: false,
                exemptReason: 'No Economy Data',
                houseEdge: 0,
                scale: 1.0
            };
        }

        // Apply full economy scaling
        const payoutCalc = gameBalance.calculateAdjustedPayout(
            betAmount,
            baseMultiplier,
            wealth,
            gameType
        );

        return {
            ...payoutCalc,
            economyApplied: true,
            exemptReason: null,
            wealth: wealth
        };

    } catch (error) {
        console.error('Error in protected payout calculation:', error);

        // Fallback to full multipliers on error
        return {
            betAmount: betAmount,
            baseMultiplier: baseMultiplier,
            finalMultiplier: baseMultiplier,
            grossPayout: betAmount * baseMultiplier,
            netPayout: betAmount * baseMultiplier,
            economyApplied: false,
            exemptReason: 'Economy Error - Fallback',
            houseEdge: 0,
            scale: 1.0,
            error: error.message
        };
    }
}

/**
 * Quick check: Should we apply economy scaling?
 *
 * @param {string} userId - User ID
 * @returns {boolean} - True if economy should be applied
 */
function shouldApplyEconomy(userId) {
    // Developer always exempt
    if (isExemptFromEconomy(userId)) {
        return false;
    }

    // Economy must be active
    if (!isEconomyActive()) {
        return false;
    }

    return true;
}

/**
 * Get user's effective multiplier scale (for UI display)
 * Returns 1.0 (100%) if exempt or economy disabled
 *
 * @param {string} userId - User ID
 * @param {string} guildId - Guild ID (optional)
 * @returns {Promise<number>} - Multiplier scale (0.0 to 1.0)
 */
async function getUserMultiplierScale(userId, guildId = null) {
    // Exempt users get 100%
    if (isExemptFromEconomy(userId)) {
        return 1.0;
    }

    // Economy disabled = 100%
    if (!isEconomyActive()) {
        return 1.0;
    }

    try {
        const gameBalance = global.economy.getGameBalance();
        const wealth = await gameBalance.getUserWealth(userId, guildId);

        // No wealth data = 100%
        if (wealth === 0 || wealth === null || wealth === undefined) {
            return 1.0;
        }

        return gameBalance.getMultiplierScale(wealth);
    } catch (error) {
        console.error('Error getting multiplier scale:', error);
        return 1.0; // Fallback to 100%
    }
}

/**
 * Get protection status for UI display
 * Shows user why they're exempt (if applicable)
 *
 * @param {string} userId - User ID
 * @returns {object} - Protection status info
 */
function getProtectionStatus(userId) {
    if (process.env.DEVELOPER_ID && userId === process.env.DEVELOPER_ID) {
        return {
            protected: true,
            reason: 'Developer Account',
            fullMultipliers: true,
            noTaxDecay: true
        };
    }

    const exemptIds = process.env.EXEMPT_USER_IDS ? process.env.EXEMPT_USER_IDS.split(',') : [];
    if (exemptIds.includes(userId)) {
        return {
            protected: true,
            reason: 'Exempt Account',
            fullMultipliers: true,
            noTaxDecay: true
        };
    }

    if (!isEconomyActive()) {
        return {
            protected: true,
            reason: 'Economy System Disabled',
            fullMultipliers: true,
            noTaxDecay: false
        };
    }

    return {
        protected: false,
        reason: 'Regular Player',
        fullMultipliers: false,
        noTaxDecay: false
    };
}

module.exports = {
    isExemptFromEconomy,
    isEconomyActive,
    calculateProtectedPayout,
    shouldApplyEconomy,
    getUserMultiplierScale,
    getProtectionStatus
};
