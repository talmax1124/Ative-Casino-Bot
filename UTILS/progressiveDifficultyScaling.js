/**
 * PROGRESSIVE DIFFICULTY SCALING SYSTEM
 * Makes it mathematically harder to win as wealth increases
 * No artificial limits - just progressively tougher odds
 */

const logger = require('./logger');
const dbManager = require('./database');

class ProgressiveDifficultyScaling {
    constructor() {
        // Wealth tiers with progressive difficulty multipliers
        this.wealthTiers = [
            { min: 0,           max: 1_000_000,     difficultyMultiplier: 1.0,   name: "Starter" },      // No extra difficulty
            { min: 1_000_000,   max: 5_000_000,     difficultyMultiplier: 1.05,  name: "Wealthy" },      // 5% harder
            { min: 5_000_000,   max: 25_000_000,    difficultyMultiplier: 1.15,  name: "Rich" },         // 15% harder
            { min: 25_000_000,  max: 100_000_000,   difficultyMultiplier: 1.30,  name: "Very Rich" },    // 30% harder
            { min: 100_000_000, max: 500_000_000,   difficultyMultiplier: 1.50,  name: "Ultra Rich" },   // 50% harder
            { min: 500_000_000, max: 1_000_000_000, difficultyMultiplier: 1.75,  name: "Elite" },        // 75% harder
            { min: 1_000_000_000, max: Infinity,    difficultyMultiplier: 2.00,  name: "Legendary" }     // 100% harder (billionaire tier)
        ];

        // Game-specific scaling factors
        this.gameScalingFactors = {
            'slots': 1.0,           // Full scaling
            'blackjack': 0.7,       // Reduced scaling (skill-based)
            'roulette': 1.0,        // Full scaling
            'plinko': 1.2,          // Increased scaling (high variance)
            'crash': 1.3,           // Increased scaling (very high variance)
            'keno': 0.8,            // Reduced scaling (already high house edge)
            'mines': 1.1,           // Slight increase
            'bingo': 0.9,           // Slight reduction
            'lottery': 0.5,         // Much reduced (already very difficult)
            'scratch': 0.6          // Reduced (already difficult)
        };

        // Progressive taxation on big wins (very smooth, gradual increases)
        this.winTaxBrackets = [
            { min: 0,          max: 50_000,     taxRate: 0.00 },  // No tax on small wins
            { min: 50_000,     max: 100_000,    taxRate: 0.01 },  // 1% tax
            { min: 100_000,    max: 250_000,    taxRate: 0.02 },  // 2% tax
            { min: 250_000,    max: 500_000,    taxRate: 0.03 },  // 3% tax
            { min: 500_000,    max: 1_000_000,  taxRate: 0.04 },  // 4% tax
            { min: 1_000_000,  max: 2_000_000,  taxRate: 0.05 },  // 5% tax
            { min: 2_000_000,  max: 3_500_000,  taxRate: 0.06 },  // 6% tax
            { min: 3_500_000,  max: 5_000_000,  taxRate: 0.07 },  // 7% tax
            { min: 5_000_000,  max: 7_500_000,  taxRate: 0.08 },  // 8% tax
            { min: 7_500_000,  max: 10_000_000, taxRate: 0.09 },  // 9% tax
            { min: 10_000_000, max: 15_000_000, taxRate: 0.10 },  // 10% tax
            { min: 15_000_000, max: 20_000_000, taxRate: 0.11 },  // 11% tax
            { min: 20_000_000, max: 30_000_000, taxRate: 0.12 },  // 12% tax
            { min: 30_000_000, max: 50_000_000, taxRate: 0.13 },  // 13% tax
            { min: 50_000_000, max: 75_000_000, taxRate: 0.14 },  // 14% tax
            { min: 75_000_000, max: 100_000_000, taxRate: 0.15 }, // 15% tax
            { min: 100_000_000, max: Infinity,  taxRate: 0.16 }   // 16% max tax (much more reasonable)
        ];

        // Hot streak detection (the more you win, the harder it gets)
        this.hotStreakMultipliers = {
            consecutiveWins: {
                3: 1.05,    // 5% harder after 3 wins
                5: 1.10,    // 10% harder after 5 wins
                7: 1.15,    // 15% harder after 7 wins
                10: 1.25,   // 25% harder after 10 wins
                15: 1.40    // 40% harder after 15 wins
            },
            recentWinRate: {
                0.7: 1.05,  // 5% harder if 70%+ win rate in last 20 games
                0.8: 1.15,  // 15% harder if 80%+ win rate
                0.9: 1.30   // 30% harder if 90%+ win rate (nearly impossible)
            }
        };

        // Wealth velocity tracking (how fast someone is gaining wealth)
        this.velocityPenalties = {
            hourly: {
                threshold: 0.20,    // 20% wealth gain per hour
                maxPenalty: 1.15    // Up to 15% harder
            },
            daily: {
                threshold: 0.50,    // 50% wealth gain per day
                maxPenalty: 1.25    // Up to 25% harder
            },
            weekly: {
                threshold: 2.00,    // 200% wealth gain per week
                maxPenalty: 1.40    // Up to 40% harder
            }
        };
    }

    /**
     * Calculate progressive difficulty for a player
     * @param {string} userId - Player ID
     * @param {string} gameType - Type of game
     * @param {number} betAmount - Amount being bet
     * @param {number} currentWealth - Player's current total wealth
     * @returns {Object} Difficulty calculation result
     */
    async calculateDifficulty(userId, gameType, betAmount, currentWealth) {
        try {
            let totalDifficultyMultiplier = 1.0;
            const breakdown = {
                baseDifficulty: 1.0,
                wealthTier: 1.0,
                hotStreak: 1.0,
                velocity: 1.0,
                gameSpecific: 1.0
            };

            // 1. Wealth tier difficulty
            const wealthTier = this.getWealthTier(currentWealth);
            breakdown.wealthTier = wealthTier.difficultyMultiplier;
            totalDifficultyMultiplier *= breakdown.wealthTier;

            // 2. Game-specific scaling
            const gameScaling = this.gameScalingFactors[gameType] || 1.0;
            breakdown.gameSpecific = gameScaling;
            totalDifficultyMultiplier *= gameScaling;

            // 3. Hot streak detection
            const hotStreakMultiplier = await this.calculateHotStreakPenalty(userId);
            breakdown.hotStreak = hotStreakMultiplier;
            totalDifficultyMultiplier *= hotStreakMultiplier;

            // 4. Wealth velocity penalty
            const velocityMultiplier = await this.calculateVelocityPenalty(userId, currentWealth);
            breakdown.velocity = velocityMultiplier;
            totalDifficultyMultiplier *= velocityMultiplier;

            // 5. Bet size consideration (bigger bets = slightly harder for the ultra-wealthy)
            if (currentWealth > 100_000_000 && betAmount > currentWealth * 0.1) {
                const betPenalty = 1 + Math.log(betAmount / (currentWealth * 0.1)) * 0.02;
                totalDifficultyMultiplier *= Math.min(betPenalty, 1.10); // Cap at 10% penalty
                breakdown.betSize = betPenalty;
            }

            const result = {
                totalMultiplier: Math.round(totalDifficultyMultiplier * 1000) / 1000,
                breakdown,
                wealthTier: wealthTier.name,
                explanation: this.generateExplanation(breakdown, wealthTier),
                isHardMode: totalDifficultyMultiplier > 1.2
            };

            // Log significant difficulty adjustments
            if (totalDifficultyMultiplier > 1.15) {
                logger.info(`🎯 Progressive Difficulty: ${userId} (${wealthTier.name}) - ${gameType} difficulty: ${(totalDifficultyMultiplier * 100 - 100).toFixed(1)}% harder`);
            }

            return result;

        } catch (error) {
            logger.error(`Progressive difficulty calculation error: ${error.message}`);
            return {
                totalMultiplier: 1.0,
                breakdown: { baseDifficulty: 1.0 },
                wealthTier: "Unknown",
                explanation: "Standard difficulty (calculation error)",
                isHardMode: false
            };
        }
    }

    /**
     * Apply progressive taxation to a win
     * @param {number} winAmount - Amount won (profit, not total payout)
     * @param {number} playerWealth - Player's current wealth
     * @returns {Object} Tax calculation result
     */
    calculateProgressiveTax(winAmount, playerWealth) {
        if (winAmount <= 0) {
            return { taxAmount: 0, afterTaxWin: winAmount, taxRate: 0 };
        }

        let totalTax = 0;
        let remainingWin = winAmount;

        // Apply progressive tax brackets
        for (const bracket of this.winTaxBrackets) {
            if (remainingWin <= 0) break;

            const taxableAmount = Math.min(
                remainingWin,
                Math.max(0, bracket.max - Math.max(bracket.min, winAmount - remainingWin))
            );

            const bracketTax = taxableAmount * bracket.taxRate;
            totalTax += bracketTax;
            remainingWin -= taxableAmount;
        }

        // Additional wealth-based tax for ultra-wealthy (very gentle curve)
        if (playerWealth > 100_000_000) {
            const wealthTaxRate = Math.min(0.02, Math.log(playerWealth / 100_000_000) * 0.005); // Max 2% additional, very gentle
            const additionalTax = winAmount * wealthTaxRate;
            totalTax += additionalTax;
        }

        const afterTaxWin = winAmount - totalTax;
        const effectiveTaxRate = winAmount > 0 ? totalTax / winAmount : 0;

        return {
            taxAmount: Math.round(totalTax),
            afterTaxWin: Math.round(afterTaxWin),
            taxRate: Math.round(effectiveTaxRate * 1000) / 10, // Percentage with 1 decimal
            breakdown: "Progressive taxation applied"
        };
    }

    /**
     * Get wealth tier for a player
     * @param {number} wealth - Player's total wealth
     * @returns {Object} Wealth tier information
     */
    getWealthTier(wealth) {
        return this.wealthTiers.find(tier => wealth >= tier.min && wealth < tier.max) 
               || this.wealthTiers[this.wealthTiers.length - 1];
    }

    /**
     * Calculate hot streak penalty
     * @param {string} userId - Player ID
     * @returns {number} Hot streak multiplier
     */
    async calculateHotStreakPenalty(userId) {
        try {
            // Get recent game history (simplified - would query real database)
            const recentGames = await this.getRecentGames(userId, 20);
            
            if (recentGames.length < 5) {
                return 1.0; // Not enough data
            }

            let consecutiveWins = 0;
            let wins = 0;

            // Count consecutive wins and total win rate
            for (let i = 0; i < recentGames.length; i++) {
                if (recentGames[i].won) {
                    wins++;
                    if (i === consecutiveWins) {
                        consecutiveWins++;
                    }
                } else {
                    break; // Break consecutive streak
                }
            }

            const winRate = wins / recentGames.length;

            // Apply consecutive wins penalty
            let penalty = 1.0;
            for (const [threshold, multiplier] of Object.entries(this.hotStreakMultipliers.consecutiveWins)) {
                if (consecutiveWins >= parseInt(threshold)) {
                    penalty = Math.max(penalty, multiplier);
                }
            }

            // Apply win rate penalty
            for (const [threshold, multiplier] of Object.entries(this.hotStreakMultipliers.recentWinRate)) {
                if (winRate >= parseFloat(threshold)) {
                    penalty = Math.max(penalty, multiplier);
                }
            }

            return penalty;

        } catch (error) {
            logger.error(`Hot streak calculation error: ${error.message}`);
            return 1.0;
        }
    }

    /**
     * Calculate wealth velocity penalty
     * @param {string} userId - Player ID
     * @param {number} currentWealth - Current wealth
     * @returns {number} Velocity penalty multiplier
     */
    async calculateVelocityPenalty(userId, currentWealth) {
        try {
            const now = Date.now();
            const penalties = [];

            // Check hourly velocity
            const hourAgo = now - (60 * 60 * 1000);
            const hourlyGrowth = await this.getWealthGrowth(userId, hourAgo, currentWealth);
            if (hourlyGrowth > this.velocityPenalties.hourly.threshold) {
                const penalty = 1 + Math.min(
                    hourlyGrowth - this.velocityPenalties.hourly.threshold,
                    this.velocityPenalties.hourly.maxPenalty - 1
                );
                penalties.push(penalty);
            }

            // Check daily velocity
            const dayAgo = now - (24 * 60 * 60 * 1000);
            const dailyGrowth = await this.getWealthGrowth(userId, dayAgo, currentWealth);
            if (dailyGrowth > this.velocityPenalties.daily.threshold) {
                const penalty = 1 + Math.min(
                    (dailyGrowth - this.velocityPenalties.daily.threshold) / 2,
                    this.velocityPenalties.daily.maxPenalty - 1
                );
                penalties.push(penalty);
            }

            // Check weekly velocity
            const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
            const weeklyGrowth = await this.getWealthGrowth(userId, weekAgo, currentWealth);
            if (weeklyGrowth > this.velocityPenalties.weekly.threshold) {
                const penalty = 1 + Math.min(
                    (weeklyGrowth - this.velocityPenalties.weekly.threshold) / 5,
                    this.velocityPenalties.weekly.maxPenalty - 1
                );
                penalties.push(penalty);
            }

            // Return the highest penalty (most restrictive)
            return penalties.length > 0 ? Math.max(...penalties) : 1.0;

        } catch (error) {
            logger.error(`Velocity penalty calculation error: ${error.message}`);
            return 1.0;
        }
    }

    /**
     * Generate human-readable explanation
     * @param {Object} breakdown - Difficulty breakdown
     * @param {Object} wealthTier - Wealth tier info
     * @returns {string} Explanation text
     */
    generateExplanation(breakdown, wealthTier) {
        const parts = [];
        
        if (breakdown.wealthTier > 1.0) {
            parts.push(`${wealthTier.name} tier (+${((breakdown.wealthTier - 1) * 100).toFixed(0)}% difficulty)`);
        }
        
        if (breakdown.hotStreak > 1.0) {
            parts.push(`Hot streak detected (+${((breakdown.hotStreak - 1) * 100).toFixed(0)}% difficulty)`);
        }
        
        if (breakdown.velocity > 1.0) {
            parts.push(`Rapid wealth growth (+${((breakdown.velocity - 1) * 100).toFixed(0)}% difficulty)`);
        }

        return parts.length > 0 ? parts.join(', ') : 'Standard difficulty';
    }

    /**
     * Helper methods for database queries (simplified)
     */
    async getRecentGames(userId, limit) {
        // Simplified - would query actual game history
        return [];
    }

    async getWealthGrowth(userId, fromTimestamp, currentWealth) {
        // Simplified - would calculate actual wealth growth rate
        return 0;
    }

    /**
     * Get system stats
     * @returns {Object} System statistics
     */
    getSystemStats() {
        return {
            wealthTiers: this.wealthTiers.length,
            maxDifficulty: Math.max(...this.wealthTiers.map(t => t.difficultyMultiplier)),
            gameTypes: Object.keys(this.gameScalingFactors).length,
            taxBrackets: this.winTaxBrackets.length,
            maxTaxRate: Math.max(...this.winTaxBrackets.map(b => b.taxRate))
        };
    }
}

// Export singleton
module.exports = new ProgressiveDifficultyScaling();