/**
 * ANTI-BILLIONAIRE MATHEMATICAL SYSTEM
 * Advanced mathematical protection against extreme wealth accumulation
 * Uses logarithmic scaling, exponential difficulty curves, and probability manipulation
 */

const logger = require('./logger');
const progressiveDifficultyScaling = require('./progressiveDifficultyScaling');
const wealthTrendAnalyzer = require('./wealthTrendAnalyzer');

class AntiBillionaireSystem {
    constructor() {
        // Mathematical constants for wealth curve calculations
        this.WEALTH_CURVE_CONSTANTS = {
            INFLECTION_POINT: 100_000_000,      // $100M - where difficulty really kicks in
            BILLIONAIRE_THRESHOLD: 1_000_000_000, // $1B - ultimate target to protect
            LOGARITHMIC_BASE: 1.5,               // Base for logarithmic scaling
            EXPONENTIAL_FACTOR: 2.718281828,     // Euler's number for exponential curves
            GOLDEN_RATIO: 1.618033988749895      // Golden ratio for mathematical elegance
        };

        // Wealth zones with different mathematical treatments
        this.wealthZones = [
            {
                name: "Safe Zone",
                min: 0,
                max: 10_000_000,
                difficultyFormula: "linear",
                maxDifficulty: 1.1,
                description: "Minimal scaling for normal players"
            },
            {
                name: "Caution Zone", 
                min: 10_000_000,
                max: 50_000_000,
                difficultyFormula: "logarithmic",
                maxDifficulty: 1.3,
                description: "Gentle logarithmic scaling begins"
            },
            {
                name: "Danger Zone",
                min: 50_000_000,
                max: 250_000_000,
                difficultyFormula: "exponential",
                maxDifficulty: 1.8,
                description: "Exponential difficulty scaling"
            },
            {
                name: "Critical Zone",
                min: 250_000_000,
                max: 750_000_000,
                difficultyFormula: "compound",
                maxDifficulty: 2.5,
                description: "Compound mathematical barriers"
            },
            {
                name: "Billionaire Prevention Zone",
                min: 750_000_000,
                max: Infinity,
                difficultyFormula: "asymptotic",
                maxDifficulty: 5.0,
                description: "Asymptotic approach - nearly impossible to progress"
            }
        ];

        // Probability manipulation curves
        this.probabilityCurves = {
            // Smooth probability reduction (not harsh jumps)
            winProbabilityReduction: {
                base: (wealth) => Math.log(wealth / 1_000_000 + 1) / Math.log(1000) * 0.15, // Max 15% reduction
                formula: "logarithmic"
            },
            
            // Big win probability scaling (reduces jackpot chances)
            bigWinReduction: {
                base: (wealth) => Math.min(0.5, Math.pow(wealth / 100_000_000, 0.3)), // Max 50% reduction
                formula: "power_law"
            },
            
            // Streak breaking probability (higher chance to break winning streaks)
            streakBreaker: {
                base: (consecutiveWins) => Math.min(0.3, consecutiveWins * 0.03), // Max 30% streak break chance
                formula: "linear"
            }
        };

        // Mathematical win size scaling
        this.winScaling = {
            // Progressive win size reduction for ultra-wealthy
            sizeReduction: {
                threshold: 100_000_000,
                formula: (wealth, baseWin) => {
                    if (wealth < this.winScaling.sizeReduction.threshold) return baseWin;
                    
                    const excessWealth = wealth - this.winScaling.sizeReduction.threshold;
                    const reductionFactor = 1 - Math.min(0.4, Math.log(excessWealth / 100_000_000 + 1) / 10);
                    return baseWin * reductionFactor;
                }
            },
            
            // Maximum single win caps (progressive)
            maxWinCaps: [
                { wealthThreshold: 0,           maxWinPercent: 2.0,  maxWinAbsolute: null },         // No absolute cap
                { wealthThreshold: 100_000_000, maxWinPercent: 1.0,  maxWinAbsolute: 50_000_000 },   // 1% or 50M max
                { wealthThreshold: 500_000_000, maxWinPercent: 0.5,  maxWinAbsolute: 25_000_000 },   // 0.5% or 25M max
                { wealthThreshold: 750_000_000, maxWinPercent: 0.2,  maxWinAbsolute: 10_000_000 }    // 0.2% or 10M max
            ]
        };

        // Economic balance targets
        this.balanceTargets = {
            maxBillionaires: 1,           // Only 1 billionaire allowed at a time
            wealthConcentration: 0.15,    // Max 15% of total wealth in top 1%
            growthVelocityLimit: 0.05,    // Max 5% of economy growth per day per player
            inflationProtection: true     // Protect against economy inflation
        };
    }

    /**
     * Calculate mathematical difficulty for preventing billionaire status
     * @param {string} userId - Player ID
     * @param {number} currentWealth - Player's current wealth
     * @param {number} betAmount - Amount being bet
     * @param {string} gameType - Type of game
     * @returns {Object} Difficulty calculation with mathematical breakdown
     */
    async calculateAntiBillionaireDifficulty(userId, currentWealth, betAmount, gameType) {
        try {
            const zone = this.getWealthZone(currentWealth);
            const difficulty = {
                zone: zone.name,
                baseDifficulty: 1.0,
                wealthScaling: 1.0,
                trendAdjustment: 1.0,
                probabilityAdjustment: 1.0,
                winSizeScaling: 1.0,
                totalMultiplier: 1.0,
                explanation: [],
                mathematicalBreakdown: {}
            };

            // 1. Wealth zone difficulty
            difficulty.wealthScaling = this.calculateWealthZoneDifficulty(currentWealth, zone);
            difficulty.explanation.push(`${zone.name}: ${((difficulty.wealthScaling - 1) * 100).toFixed(1)}% harder`);

            // 2. Trend-based adjustments
            const trendAnalysis = await wealthTrendAnalyzer.analyzePlayerTrends(userId, { currentWealth, betAmount, gameType });
            difficulty.trendAdjustment = 1 + (trendAnalysis.riskScore * 0.05); // 5% per risk point
            if (difficulty.trendAdjustment > 1.01) {
                difficulty.explanation.push(`Risk patterns: ${((difficulty.trendAdjustment - 1) * 100).toFixed(1)}% harder`);
            }

            // 3. Progressive difficulty scaling
            const progressiveResult = await progressiveDifficultyScaling.calculateDifficulty(userId, gameType, betAmount, currentWealth);
            difficulty.progressiveScaling = progressiveResult.totalMultiplier;
            if (difficulty.progressiveScaling > 1.01) {
                difficulty.explanation.push(`Progressive scaling: ${((difficulty.progressiveScaling - 1) * 100).toFixed(1)}% harder`);
            }

            // 4. Probability manipulation
            difficulty.probabilityAdjustment = this.calculateProbabilityAdjustment(currentWealth, trendAnalysis);
            if (difficulty.probabilityAdjustment > 1.01) {
                difficulty.explanation.push(`Probability adjustment: ${((difficulty.probabilityAdjustment - 1) * 100).toFixed(1)}% harder`);
            }

            // 5. Win size scaling
            difficulty.winSizeScaling = this.calculateWinSizeScaling(currentWealth);
            if (difficulty.winSizeScaling < 0.99) {
                difficulty.explanation.push(`Win size reduction: ${((1 - difficulty.winSizeScaling) * 100).toFixed(1)}% smaller wins`);
            }

            // Combine all factors
            difficulty.totalMultiplier = difficulty.wealthScaling * 
                                       difficulty.trendAdjustment * 
                                       difficulty.progressiveScaling * 
                                       difficulty.probabilityAdjustment;

            // Mathematical breakdown for transparency
            difficulty.mathematicalBreakdown = {
                wealthPercentile: this.calculateWealthPercentile(currentWealth),
                billionaireProgress: (currentWealth / this.WEALTH_CURVE_CONSTANTS.BILLIONAIRE_THRESHOLD) * 100,
                asymptoteProximity: this.calculateAsymptoteProximity(currentWealth),
                expectedGamesTo1B: this.estimateGamesToBillionaire(currentWealth, difficulty.totalMultiplier),
                mathematicalFormula: this.generateMathematicalFormula(zone, currentWealth)
            };

            // Cap total difficulty to prevent impossibility
            difficulty.totalMultiplier = Math.min(difficulty.totalMultiplier, zone.maxDifficulty);

            // Log significant anti-billionaire interventions
            if (difficulty.totalMultiplier > 1.5) {
                logger.warn(`🛡️ Anti-Billionaire System: ${userId} - Wealth: ${this.formatWealth(currentWealth)} - Difficulty: ${(difficulty.totalMultiplier * 100 - 100).toFixed(0)}% harder`);
            }

            return difficulty;

        } catch (error) {
            logger.error(`Anti-billionaire calculation error: ${error.message}`);
            return {
                zone: "Error",
                totalMultiplier: 1.0,
                winSizeScaling: 1.0,
                explanation: ["Calculation error - using default difficulty"],
                mathematicalBreakdown: {}
            };
        }
    }

    /**
     * Apply win size limitations and progressive taxation
     * @param {number} baseWin - Base win amount
     * @param {number} playerWealth - Player's current wealth
     * @param {Object} gameContext - Game context
     * @returns {Object} Modified win calculation
     */
    applyWinLimitations(baseWin, playerWealth, gameContext = {}) {
        let adjustedWin = baseWin;
        const limitations = {
            originalWin: baseWin,
            adjustedWin: baseWin,
            reductions: [],
            caps: [],
            taxes: []
        };

        // 1. Progressive win size scaling
        if (playerWealth > this.winScaling.sizeReduction.threshold) {
            const scaledWin = this.winScaling.sizeReduction.formula(playerWealth, baseWin);
            const reduction = baseWin - scaledWin;
            
            if (reduction > 0) {
                adjustedWin = scaledWin;
                limitations.reductions.push({
                    type: "wealth_scaling",
                    amount: reduction,
                    reason: "Progressive win size reduction for ultra-wealthy"
                });
            }
        }

        // 2. Apply maximum win caps
        for (const cap of this.winScaling.maxWinCaps) {
            if (playerWealth >= cap.wealthThreshold) {
                const percentCap = playerWealth * cap.maxWinPercent;
                const absoluteCap = cap.maxWinAbsolute || Infinity;
                const effectiveCap = Math.min(percentCap, absoluteCap);

                if (adjustedWin > effectiveCap) {
                    const cappedAmount = adjustedWin - effectiveCap;
                    adjustedWin = effectiveCap;
                    limitations.caps.push({
                        type: "win_cap",
                        amount: cappedAmount,
                        cap: effectiveCap,
                        reason: `Win cap for ${this.formatWealth(cap.wealthThreshold)}+ wealth tier`
                    });
                }
                break; // Use the most restrictive cap
            }
        }

        // 3. Progressive taxation on large wins
        if (adjustedWin > 1_000_000) { // Tax wins over 1M
            const tax = progressiveDifficultyScaling.calculateProgressiveTax(adjustedWin, playerWealth);
            if (tax.taxAmount > 0) {
                adjustedWin = tax.afterTaxWin;
                limitations.taxes.push({
                    type: "progressive_tax",
                    amount: tax.taxAmount,
                    rate: tax.taxRate,
                    reason: "Progressive taxation on large wins"
                });
            }
        }

        limitations.adjustedWin = adjustedWin;
        limitations.totalReduction = baseWin - adjustedWin;
        limitations.reductionPercent = baseWin > 0 ? (limitations.totalReduction / baseWin) * 100 : 0;

        return limitations;
    }

    /**
     * Get wealth zone for current wealth level
     * @param {number} wealth - Current wealth
     * @returns {Object} Wealth zone information
     */
    getWealthZone(wealth) {
        return this.wealthZones.find(zone => wealth >= zone.min && wealth < zone.max) ||
               this.wealthZones[this.wealthZones.length - 1];
    }

    /**
     * Calculate wealth zone difficulty using appropriate mathematical formula
     * @param {number} wealth - Current wealth
     * @param {Object} zone - Wealth zone
     * @returns {number} Difficulty multiplier
     */
    calculateWealthZoneDifficulty(wealth, zone) {
        const normalizedWealth = (wealth - zone.min) / (zone.max - zone.min);
        
        switch (zone.difficultyFormula) {
            case "linear":
                return 1 + (normalizedWealth * (zone.maxDifficulty - 1));
                
            case "logarithmic":
                return 1 + (Math.log(normalizedWealth * (this.WEALTH_CURVE_CONSTANTS.LOGARITHMIC_BASE - 1) + 1) / 
                           Math.log(this.WEALTH_CURVE_CONSTANTS.LOGARITHMIC_BASE)) * (zone.maxDifficulty - 1);
                
            case "exponential":
                return 1 + (Math.pow(normalizedWealth, this.WEALTH_CURVE_CONSTANTS.GOLDEN_RATIO)) * (zone.maxDifficulty - 1);
                
            case "compound":
                const base = Math.log(normalizedWealth + 1) / Math.log(2);
                const exp = Math.pow(normalizedWealth, 1.5);
                return 1 + ((base + exp) / 2) * (zone.maxDifficulty - 1);
                
            case "asymptotic":
                // Asymptotic approach - gets very hard very fast near billionaire status
                const asymptote = 1 - Math.exp(-normalizedWealth * 5);
                return 1 + asymptote * (zone.maxDifficulty - 1);
                
            default:
                return 1.0;
        }
    }

    /**
     * Calculate probability adjustments
     * @param {number} wealth - Current wealth
     * @param {Object} trendAnalysis - Trend analysis result
     * @returns {number} Probability adjustment multiplier
     */
    calculateProbabilityAdjustment(wealth, trendAnalysis) {
        let adjustment = 1.0;
        
        // Base probability reduction for high wealth
        const baseReduction = this.probabilityCurves.winProbabilityReduction.base(wealth);
        adjustment += baseReduction;
        
        // Additional adjustment for high-risk patterns
        if (trendAnalysis.riskScore > 3.0) {
            adjustment += (trendAnalysis.riskScore - 3.0) * 0.02;
        }
        
        return adjustment;
    }

    /**
     * Calculate win size scaling
     * @param {number} wealth - Current wealth
     * @returns {number} Win size scaling factor
     */
    calculateWinSizeScaling(wealth) {
        if (wealth < this.winScaling.sizeReduction.threshold) {
            return 1.0;
        }
        
        const excessWealth = wealth - this.winScaling.sizeReduction.threshold;
        const reductionFactor = 1 - Math.min(0.4, Math.log(excessWealth / 100_000_000 + 1) / 10);
        return Math.max(0.6, reductionFactor); // Never reduce wins by more than 40%
    }

    /**
     * Mathematical helper methods
     */
    calculateWealthPercentile(wealth) {
        // Simplified - would use real population data
        if (wealth < 1_000_000) return 50;
        if (wealth < 10_000_000) return 80;
        if (wealth < 50_000_000) return 95;
        if (wealth < 100_000_000) return 98;
        if (wealth < 500_000_000) return 99.5;
        return 99.9;
    }

    calculateAsymptoteProximity(wealth) {
        return 1 - Math.exp(-(wealth / this.WEALTH_CURVE_CONSTANTS.BILLIONAIRE_THRESHOLD) * 3);
    }

    estimateGamesToBillionaire(currentWealth, difficulty) {
        if (currentWealth >= this.WEALTH_CURVE_CONSTANTS.BILLIONAIRE_THRESHOLD) return 0;
        
        const remaining = this.WEALTH_CURVE_CONSTANTS.BILLIONAIRE_THRESHOLD - currentWealth;
        const estimatedGamesPerMillion = 1000 * difficulty; // Rough estimate
        return Math.round((remaining / 1_000_000) * estimatedGamesPerMillion);
    }

    generateMathematicalFormula(zone, wealth) {
        switch (zone.difficultyFormula) {
            case "logarithmic":
                return `log₁.₅(w/100M + 1)`;
            case "exponential":
                return `w^φ where φ = ${this.WEALTH_CURVE_CONSTANTS.GOLDEN_RATIO.toFixed(3)}`;
            case "asymptotic":
                return `1 - e^(-5w/1B)`;
            default:
                return zone.difficultyFormula;
        }
    }

    formatWealth(wealth) {
        if (wealth >= 1_000_000_000) return `$${(wealth / 1_000_000_000).toFixed(1)}B`;
        if (wealth >= 1_000_000) return `$${(wealth / 1_000_000).toFixed(1)}M`;
        if (wealth >= 1_000) return `$${(wealth / 1_000).toFixed(1)}K`;
        return `$${wealth.toFixed(0)}`;
    }

    /**
     * Get system status
     * @returns {Object} System status and statistics
     */
    getSystemStatus() {
        return {
            zones: this.wealthZones.length,
            maxDifficulty: Math.max(...this.wealthZones.map(z => z.maxDifficulty)),
            billionaireThreshold: this.WEALTH_CURVE_CONSTANTS.BILLIONAIRE_THRESHOLD,
            inflectionPoint: this.WEALTH_CURVE_CONSTANTS.INFLECTION_POINT,
            balanceTargets: this.balanceTargets,
            activeProtections: ["wealth_scaling", "probability_adjustment", "win_size_scaling", "progressive_taxation"]
        };
    }
}

// Export singleton
module.exports = new AntiBillionaireSystem();