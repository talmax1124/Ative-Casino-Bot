/**
 * Game Balance Controller - Wealth-Based Game Scaling
 *
 * NO MAX BETS - Instead uses aggressive multiplier scaling
 * to prevent wealthy players from maintaining/growing wealth through gambling.
 *
 * Key Principle: The wealthier you are, the less favorable the game odds become.
 * This creates natural economic pressure without hard limits.
 */

const Decimal = require('decimal.js');
const logger = require('../../UTILS/logger');

class GameBalanceController {
    constructor(database, config) {
        this.database = database;
        this.config = config || require('./config');

        // Wealth-based multiplier scaling brackets
        // NO MAX BETS, but multipliers scale down aggressively at high wealth
        this.multiplierBrackets = [
            { min: 0, max: 1000000, scale: 1.0 },              // <$1M: 100% - full multipliers
            { min: 1000000, max: 5000000, scale: 0.95 },       // $1M-$5M: 95%
            { min: 5000000, max: 10000000, scale: 0.90 },      // $5M-$10M: 90%
            { min: 10000000, max: 25000000, scale: 0.80 },     // $10M-$25M: 80%
            { min: 25000000, max: 50000000, scale: 0.70 },     // $25M-$50M: 70%
            { min: 50000000, max: 100000000, scale: 0.55 },    // $50M-$100M: 55%
            { min: 100000000, max: 250000000, scale: 0.40 },   // $100M-$250M: 40%
            { min: 250000000, max: 500000000, scale: 0.25 },   // $250M-$500M: 25%
            { min: 500000000, max: 1000000000, scale: 0.15 },  // $500M-$1B: 15%
            { min: 1000000000, max: 5000000000, scale: 0.08 }, // $1B-$5B: 8%
            { min: 5000000000, max: Infinity, scale: 0.04 }    // $5B+: 4%
        ];

        // House edge scaling by wealth (applied as payout reduction)
        this.houseEdgeBrackets = [
            { min: 0, max: 1000000, edge: 0.005 },             // <$1M: 0.5%
            { min: 1000000, max: 10000000, edge: 0.01 },       // $1M-$10M: 1%
            { min: 10000000, max: 50000000, edge: 0.02 },      // $10M-$50M: 2%
            { min: 50000000, max: 100000000, edge: 0.035 },    // $50M-$100M: 3.5%
            { min: 100000000, max: 500000000, edge: 0.05 },    // $100M-$500M: 5%
            { min: 500000000, max: 1000000000, edge: 0.08 },   // $500M-$1B: 8%
            { min: 1000000000, max: 5000000000, edge: 0.12 },  // $1B-$5B: 12%
            { min: 5000000000, max: Infinity, edge: 0.15 }     // $5B+: 15%
        ];

        // Minimum multipliers to keep games playable
        // IMPORTANT: Minimums must be > 1.0 so "winning" means actually winning!
        this.minimumMultipliers = {
            slots_regular: 1.1,      // Min 1.1x (10% profit on wins)
            slots_matrix: 1.1,       // Min 1.1x
            blackjack_win: 1.2,      // Min 1.2x (at least get bet back + 20%)
            blackjack_bj: 1.5,       // Min 1.5x for blackjack
            roulette_color: 1.3,     // Min 1.3x for red/black (30% profit)
            roulette_dozen: 1.5,     // Min 1.5x for dozens (50% profit)
            roulette_number: 3.0     // Min 3x for single number (down from 36x, but still 3x profit!)
        };

        // Stats tracking
        this.stats = {
            adjustmentsApplied: 0,
            totalWealthScaled: new Decimal(0),
            gamesByWealth: {}
        };

        logger.info('GameBalanceController initialized - NO MAX BETS, wealth-based multiplier scaling active');
    }

    /**
     * Get user's current total wealth
     */
    async getUserWealth(userId, guildId = null) {
        try {
            const balance = await this.database.getUserBalance(userId, guildId);
            const totalWealth = (balance.wallet || 0) + (balance.bank || 0);
            return totalWealth;
        } catch (error) {
            logger.error(`Error getting user wealth for ${userId}: ${error.message}`);
            return 0;
        }
    }

    /**
     * Get multiplier scale factor based on wealth
     */
    getMultiplierScale(wealth) {
        const w = new Decimal(wealth);

        for (const bracket of this.multiplierBrackets) {
            if (w.gte(bracket.min) && w.lt(bracket.max)) {
                return bracket.scale;
            }
        }

        // Default to most restrictive if somehow out of range
        return this.multiplierBrackets[this.multiplierBrackets.length - 1].scale;
    }

    /**
     * Get house edge based on wealth
     */
    getHouseEdge(wealth) {
        const w = new Decimal(wealth);

        for (const bracket of this.houseEdgeBrackets) {
            if (w.gte(bracket.min) && w.lt(bracket.max)) {
                return bracket.edge;
            }
        }

        // Default to most restrictive
        return this.houseEdgeBrackets[this.houseEdgeBrackets.length - 1].edge;
    }

    /**
     * Apply wealth-based scaling to a game multiplier
     *
     * @param {number} baseMultiplier - Base game multiplier (e.g., 36 for roulette single number)
     * @param {number} wealth - User's total wealth
     * @param {string} gameType - Type of game/bet for minimum enforcement
     * @returns {number} - Adjusted multiplier
     */
    applyWealthScaling(baseMultiplier, wealth, gameType = 'generic') {
        // Get wealth-based scale
        const scale = this.getMultiplierScale(wealth);

        // Apply scaling
        let adjustedMultiplier = baseMultiplier * scale;

        // Enforce minimum multiplier for game type
        const minMultiplier = this.minimumMultipliers[gameType] || 0.5;
        adjustedMultiplier = Math.max(adjustedMultiplier, minMultiplier);

        // Track stats
        this.stats.adjustmentsApplied++;
        this.stats.totalWealthScaled = this.stats.totalWealthScaled.plus(wealth);

        logger.debug(`Multiplier scaling: base=${baseMultiplier}, wealth=$${wealth}, scale=${scale}, adjusted=${adjustedMultiplier.toFixed(2)}, gameType=${gameType}`);

        return adjustedMultiplier;
    }

    /**
     * Apply house edge to a payout amount
     * Reduces the payout by a percentage based on wealth
     *
     * @param {number} grossPayout - Gross payout before house edge
     * @param {number} wealth - User's total wealth
     * @returns {number} - Net payout after house edge
     */
    applyHouseEdge(grossPayout, wealth) {
        const edge = this.getHouseEdge(wealth);
        const reduction = grossPayout * edge;
        const netPayout = grossPayout - reduction;

        logger.debug(`House edge: gross=$${grossPayout}, wealth=$${wealth}, edge=${(edge*100).toFixed(1)}%, reduction=$${reduction.toFixed(2)}, net=$${netPayout.toFixed(2)}`);

        return netPayout;
    }

    /**
     * Calculate final payout with all adjustments
     *
     * @param {number} betAmount - Amount wagered
     * @param {number} baseMultiplier - Base game multiplier
     * @param {number} wealth - User's total wealth
     * @param {string} gameType - Type of game/bet
     * @returns {object} - Detailed payout breakdown
     */
    calculateAdjustedPayout(betAmount, baseMultiplier, wealth, gameType = 'generic') {
        // Step 1: Apply wealth-based multiplier scaling
        const adjustedMultiplier = this.applyWealthScaling(baseMultiplier, wealth, gameType);

        // Step 2: Calculate gross payout
        const grossPayout = betAmount * adjustedMultiplier;

        // Step 3: Apply house edge
        const netPayout = this.applyHouseEdge(grossPayout, wealth);

        return {
            betAmount: betAmount,
            baseMultiplier: baseMultiplier,
            adjustedMultiplier: adjustedMultiplier,
            multiplierScale: this.getMultiplierScale(wealth),
            grossPayout: grossPayout,
            houseEdge: this.getHouseEdge(wealth),
            houseEdgeAmount: grossPayout - netPayout,
            netPayout: Math.floor(netPayout), // Floor to prevent decimal issues
            effectiveMultiplier: netPayout / betAmount
        };
    }

    /**
     * Get wealth bracket description for UI
     */
    getWealthBracketInfo(wealth) {
        const w = new Decimal(wealth);
        const scale = this.getMultiplierScale(wealth);
        const edge = this.getHouseEdge(wealth);

        let bracketName = '';
        if (w.lt(1000000)) bracketName = 'Beginner';
        else if (w.lt(10000000)) bracketName = 'Growing';
        else if (w.lt(50000000)) bracketName = 'Established';
        else if (w.lt(100000000)) bracketName = 'Wealthy';
        else if (w.lt(500000000)) bracketName = 'Very Wealthy';
        else if (w.lt(1000000000)) bracketName = 'Ultra Rich';
        else if (w.lt(5000000000)) bracketName = 'Billionaire';
        else bracketName = 'Mega Billionaire';

        return {
            bracketName: bracketName,
            totalWealth: wealth,
            multiplierScale: scale,
            multiplierPercent: (scale * 100).toFixed(0),
            houseEdge: edge,
            houseEdgePercent: (edge * 100).toFixed(1),
            message: this.getWealthMessage(wealth)
        };
    }

    /**
     * Get informative message about wealth effects
     */
    getWealthMessage(wealth) {
        const w = new Decimal(wealth);

        if (w.lt(1000000)) {
            return 'Full game multipliers! Build your fortune!';
        } else if (w.lt(10000000)) {
            return 'Slight multiplier reduction - you\'re doing great!';
        } else if (w.lt(50000000)) {
            return 'Moderate multiplier scaling - maintain your wealth wisely';
        } else if (w.lt(100000000)) {
            return 'Significant multiplier reduction - big wins are harder';
        } else if (w.lt(500000000)) {
            return 'Heavy multiplier scaling - gambling is risky at this wealth';
        } else if (w.lt(1000000000)) {
            return 'Severe multiplier reduction - extremely difficult to maintain';
        } else {
            return 'Maximum multiplier reduction - billions cannot be sustained';
        }
    }

    /**
     * SLOTS: Get adjusted slot symbols with wealth-based multipliers
     */
    async getAdjustedSlotMultipliers(userId, guildId, baseSymbols) {
        const wealth = await this.getUserWealth(userId, guildId);
        const adjustedSymbols = {};

        for (const [key, symbolData] of Object.entries(baseSymbols)) {
            const baseMultiplier = symbolData.payout || symbolData.basePayout || 1.0;
            const adjustedMultiplier = this.applyWealthScaling(
                baseMultiplier,
                wealth,
                'slots_regular'
            );

            adjustedSymbols[key] = {
                ...symbolData,
                basePayout: baseMultiplier,
                payout: adjustedMultiplier
            };
        }

        return {
            symbols: adjustedSymbols,
            wealth: wealth,
            scale: this.getMultiplierScale(wealth)
        };
    }

    /**
     * BLACKJACK: Get adjusted blackjack multipliers
     */
    async getAdjustedBlackjackMultipliers(userId, guildId, baseModeConfig) {
        const wealth = await this.getUserWealth(userId, guildId);

        const adjustedConfig = {
            ...baseModeConfig,
            blackjackMultiplier: this.applyWealthScaling(
                baseModeConfig.blackjackMultiplier || 2.5,
                wealth,
                'blackjack_bj'
            ),
            winMultiplier: this.applyWealthScaling(
                baseModeConfig.winMultiplier || 2.0,
                wealth,
                'blackjack_win'
            ),
            houseEdge: this.getHouseEdge(wealth),
            originalBlackjackMultiplier: baseModeConfig.blackjackMultiplier,
            originalWinMultiplier: baseModeConfig.winMultiplier
        };

        return {
            modeConfig: adjustedConfig,
            wealth: wealth,
            scale: this.getMultiplierScale(wealth)
        };
    }

    /**
     * ROULETTE: Get adjusted roulette multipliers
     */
    async getAdjustedRouletteMultipliers(userId, guildId, basePayout, betType) {
        const wealth = await this.getUserWealth(userId, guildId);

        // Determine game type for minimum enforcement
        let gameType = 'roulette_color';
        if (['number', 'green'].includes(betType)) gameType = 'roulette_number';
        else if (['dozen1', 'dozen2', 'dozen3', 'column1', 'column2', 'column3'].includes(betType)) gameType = 'roulette_dozen';

        const adjustedMultiplier = this.applyWealthScaling(
            basePayout,
            wealth,
            gameType
        );

        return {
            basePayout: basePayout,
            adjustedPayout: adjustedMultiplier,
            wealth: wealth,
            scale: this.getMultiplierScale(wealth),
            houseEdge: this.getHouseEdge(wealth)
        };
    }

    /**
     * Apply final payout adjustment (includes house edge)
     */
    async applyFinalPayoutAdjustment(userId, guildId, grossPayout) {
        const wealth = await this.getUserWealth(userId, guildId);
        const netPayout = this.applyHouseEdge(grossPayout, wealth);

        return {
            grossPayout: grossPayout,
            netPayout: Math.floor(netPayout),
            houseEdge: this.getHouseEdge(wealth),
            reduction: grossPayout - netPayout
        };
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            adjustmentsApplied: this.stats.adjustmentsApplied,
            averageWealth: this.stats.adjustmentsApplied > 0
                ? this.stats.totalWealthScaled.div(this.stats.adjustmentsApplied).toNumber()
                : 0,
            gamesByWealth: this.stats.gamesByWealth
        };
    }

    /**
     * Example calculation for display
     */
    getExampleCalculation(wealth, game = 'roulette', betAmount = 1000000) {
        let baseMultiplier;
        let gameType;

        switch(game) {
            case 'roulette_number':
                baseMultiplier = 36;
                gameType = 'roulette_number';
                break;
            case 'roulette_color':
                baseMultiplier = 2;
                gameType = 'roulette_color';
                break;
            case 'blackjack':
                baseMultiplier = 2.5;
                gameType = 'blackjack_bj';
                break;
            case 'slots':
                baseMultiplier = 2.0;
                gameType = 'slots_regular';
                break;
            default:
                baseMultiplier = 2;
                gameType = 'generic';
        }

        return this.calculateAdjustedPayout(betAmount, baseMultiplier, wealth, gameType);
    }
}

module.exports = GameBalanceController;
