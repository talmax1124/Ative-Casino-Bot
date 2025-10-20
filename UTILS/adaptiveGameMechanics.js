/**
 * ADAPTIVE GAME MECHANICS SYSTEM
 * Automatically adjusts game odds, multipliers, and probabilities based on player wealth
 * Players see honest multipliers - the games themselves become harder
 */

const antiBillionaireSystem = require('./antiBillionaireSystem');
const progressiveDifficultyScaling = require('./progressiveDifficultyScaling');
const logger = require('./logger');

class AdaptiveGameMechanics {
    constructor() {
        // Base game configurations that get adapted
        this.baseGameConfigs = {
            slots: {
                baseMultipliers: [1.05, 1.1, 1.2, 1.4, 1.6, 1.8, 2.0],
                baseWinChance: 0.45
            },
            plinko: {
                baseMultipliers: [0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.5],
                baseWinChance: 0.4
            },
            crash: {
                baseCrashPoints: [1.2, 1.5, 2.0, 3.0, 5.0, 10.0, 50.0],
                baseWinChance: 0.5
            },
            blackjack: {
                baseWinChance: 0.49,
                perfectStrategyBonus: 0.005
            },
            roulette: {
                singleNumberPayout: 35,
                colorPayout: 1.8,
                baseWinChances: { single: 1/37, color: 18/37 }
            },
            mines: {
                baseWinChance: 0.7,
                baseMultiplierCap: 5.0
            }
        };
    }

    /**
     * Get adapted game configuration for a specific player
     * @param {string} gameType - Type of game
     * @param {string} userId - Player ID
     * @param {number} currentWealth - Player's current wealth
     * @param {number} betAmount - Amount being bet
     * @returns {Object} Adapted game configuration
     */
    async getAdaptedGameConfig(gameType, userId, currentWealth, betAmount) {
        try {
            // Get base configuration
            const baseConfig = this.baseGameConfigs[gameType];
            if (!baseConfig) {
                logger.warn(`No base config for game type: ${gameType}`);
                return null;
            }

            // For players under $10M, return base configuration
            if (currentWealth < 10_000_000) {
                return {
                    ...baseConfig,
                    adaptationLevel: 'none',
                    adjustmentReason: 'Standard player - no adaptation needed'
                };
            }

            // Calculate difficulty adjustment
            const difficultyResult = await antiBillionaireSystem.calculateAntiBillionaireDifficulty(
                userId, currentWealth, betAmount, gameType
            );

            // Adapt the configuration based on difficulty
            const adaptedConfig = this.applyDifficultyToConfig(baseConfig, difficultyResult, gameType);

            adaptedConfig.adaptationLevel = this.getAdaptationLevel(difficultyResult.totalMultiplier);
            adaptedConfig.adjustmentReason = difficultyResult.explanation.join(', ');
            adaptedConfig.originalDifficulty = difficultyResult.totalMultiplier;

            // Log adaptation for admin monitoring
            if (difficultyResult.totalMultiplier > 1.2) {
                logger.info(`🎮 Game adaptation: ${gameType} for ${userId} - ${((difficultyResult.totalMultiplier - 1) * 100).toFixed(0)}% harder`);
            }

            return adaptedConfig;

        } catch (error) {
            logger.error(`Adaptive game mechanics error: ${error.message}`);
            return this.baseGameConfigs[gameType] || null;
        }
    }

    /**
     * Apply difficulty adjustments to game configuration
     * @param {Object} baseConfig - Base game configuration
     * @param {Object} difficultyResult - Difficulty calculation result
     * @param {string} gameType - Game type
     * @returns {Object} Adapted configuration
     */
    applyDifficultyToConfig(baseConfig, difficultyResult, gameType) {
        const adapted = JSON.parse(JSON.stringify(baseConfig)); // Deep clone
        const difficultyMultiplier = difficultyResult.totalMultiplier;

        switch (gameType) {
            case 'slots':
                adapted.adaptedMultipliers = adapted.baseMultipliers.map(mult => 
                    Math.max(0.5, mult / difficultyMultiplier) // Never go below 0.5x
                );
                adapted.adaptedWinChance = Math.max(0.1, adapted.baseWinChance / difficultyMultiplier);
                break;

            case 'plinko':
                adapted.adaptedMultipliers = adapted.baseMultipliers.map(mult => 
                    mult > 1.0 ? Math.max(1.0, mult / difficultyMultiplier) : mult
                );
                adapted.adaptedWinChance = Math.max(0.2, adapted.baseWinChance / Math.sqrt(difficultyMultiplier));
                break;

            case 'crash':
                // Make crash points happen sooner (lower multipliers)
                adapted.adaptedCrashPoints = adapted.baseCrashPoints.map(point => 
                    Math.max(1.01, point / Math.sqrt(difficultyMultiplier))
                );
                adapted.adaptedWinChance = Math.max(0.2, adapted.baseWinChance / difficultyMultiplier);
                break;

            case 'blackjack':
                // Reduce perfect strategy bonus and win chance
                adapted.adaptedWinChance = Math.max(0.3, adapted.baseWinChance / difficultyMultiplier);
                adapted.adaptedPerfectStrategyBonus = adapted.perfectStrategyBonus / difficultyMultiplier;
                break;

            case 'roulette':
                // Reduce payouts while keeping probabilities honest
                adapted.adaptedSingleNumberPayout = Math.max(20, adapted.singleNumberPayout / difficultyMultiplier);
                adapted.adaptedColorPayout = Math.max(1.2, adapted.colorPayout / difficultyMultiplier);
                adapted.adaptedWinChances = adapted.baseWinChances; // Keep probabilities honest
                break;

            case 'mines':
                // Reduce win chance and multiplier cap for mines
                adapted.adaptedWinChance = Math.max(0.3, adapted.baseWinChance / difficultyMultiplier);
                adapted.adaptedMultiplierCap = Math.max(2.0, adapted.baseMultiplierCap / Math.sqrt(difficultyMultiplier));
                break;

            default:
                // Generic adaptation: reduce all positive multipliers
                Object.keys(adapted).forEach(key => {
                    if (key.includes('multiplier') || key.includes('Multiplier')) {
                        if (Array.isArray(adapted[key])) {
                            adapted[key] = adapted[key].map(mult => 
                                mult > 1.0 ? Math.max(1.0, mult / difficultyMultiplier) : mult
                            );
                        } else if (typeof adapted[key] === 'number' && adapted[key] > 1.0) {
                            adapted[key] = Math.max(1.0, adapted[key] / difficultyMultiplier);
                        }
                    }
                });
                break;
        }

        return adapted;
    }

    /**
     * Get slots symbol configuration adapted for player
     * @param {string} userId - Player ID
     * @param {number} currentWealth - Current wealth
     * @param {number} betAmount - Bet amount
     * @returns {Object} Adapted slot symbols with honest multipliers
     */
    async getAdaptedSlotSymbols(userId, currentWealth, betAmount) {
        const adaptedConfig = await this.getAdaptedGameConfig('slots', userId, currentWealth, betAmount);
        
        if (!adaptedConfig || !adaptedConfig.adaptedMultipliers) {
            // Return base symbols
            return {
                'cherries': { emoji: '🍒', rarity: 35, payout: 1.05 },
                'lemon': { emoji: '🍋', rarity: 30, payout: 1.1 },
                'orange': { emoji: '🍊', rarity: 20, payout: 1.2 },
                'grapes': { emoji: '🍇', rarity: 10, payout: 1.4 },
                'watermelon': { emoji: '🍉', rarity: 3, payout: 1.6 },
                'bar': { emoji: '📊', rarity: 1.5, payout: 1.8 },
                'seven': { emoji: '7️⃣', rarity: 0.4, payout: 2.0 }
            };
        }

        // Return adapted symbols with honest multipliers
        const adaptedMultipliers = adaptedConfig.adaptedMultipliers;
        return {
            'cherries': { emoji: '🍒', rarity: 35, payout: adaptedMultipliers[0] || 1.05 },
            'lemon': { emoji: '🍋', rarity: 30, payout: adaptedMultipliers[1] || 1.1 },
            'orange': { emoji: '🍊', rarity: 20, payout: adaptedMultipliers[2] || 1.2 },
            'grapes': { emoji: '🍇', rarity: 10, payout: adaptedMultipliers[3] || 1.4 },
            'watermelon': { emoji: '🍉', rarity: 3, payout: adaptedMultipliers[4] || 1.6 },
            'bar': { emoji: '📊', rarity: 1.5, payout: adaptedMultipliers[5] || 1.8 },
            'seven': { emoji: '7️⃣', rarity: 0.4, payout: adaptedMultipliers[6] || 2.0 }
        };
    }

    /**
     * Get adapted plinko multipliers
     * @param {string} userId - Player ID
     * @param {number} currentWealth - Current wealth
     * @param {number} betAmount - Bet amount
     * @returns {Array} Adapted plinko multipliers
     */
    async getAdaptedPlinkoMultipliers(userId, currentWealth, betAmount) {
        const adaptedConfig = await this.getAdaptedGameConfig('plinko', userId, currentWealth, betAmount);
        return adaptedConfig?.adaptedMultipliers || adaptedConfig?.baseMultipliers || [0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.5];
    }

    /**
     * Get adapted crash multiplier threshold
     * @param {string} userId - Player ID
     * @param {number} currentWealth - Current wealth
     * @param {number} betAmount - Bet amount
     * @returns {number} Crash point where game ends
     */
    async getAdaptedCrashPoint(userId, currentWealth, betAmount) {
        const adaptedConfig = await this.getAdaptedGameConfig('crash', userId, currentWealth, betAmount);
        const crashPoints = adaptedConfig?.adaptedCrashPoints || adaptedConfig?.baseCrashPoints || [1.2, 1.5, 2.0, 3.0, 5.0, 10.0, 50.0];
        
        // Randomly select a crash point weighted by difficulty
        const weights = [0.3, 0.25, 0.2, 0.15, 0.07, 0.025, 0.005]; // Higher chance of early crash
        const random = Math.random();
        let cumulative = 0;
        
        for (let i = 0; i < weights.length && i < crashPoints.length; i++) {
            cumulative += weights[i];
            if (random <= cumulative) {
                return crashPoints[i];
            }
        }
        
        return crashPoints[0]; // Fallback to lowest crash point
    }

    /**
     * Get adapted roulette payouts
     * @param {string} userId - Player ID
     * @param {number} currentWealth - Current wealth
     * @param {number} betAmount - Bet amount
     * @returns {Object} Adapted roulette payouts
     */
    async getAdaptedRoulettePayouts(userId, currentWealth, betAmount) {
        const adaptedConfig = await this.getAdaptedGameConfig('roulette', userId, currentWealth, betAmount);
        
        return {
            singleNumber: adaptedConfig?.adaptedSingleNumberPayout || adaptedConfig?.singleNumberPayout || 35,
            color: adaptedConfig?.adaptedColorPayout || adaptedConfig?.colorPayout || 1.8,
            winChances: adaptedConfig?.adaptedWinChances || adaptedConfig?.baseWinChances || { single: 1/37, color: 18/37 }
        };
    }

    /**
     * Get adaptation level description
     * @param {number} difficultyMultiplier - Difficulty multiplier
     * @returns {string} Adaptation level
     */
    getAdaptationLevel(difficultyMultiplier) {
        if (difficultyMultiplier <= 1.1) return 'minimal';
        if (difficultyMultiplier <= 1.3) return 'light';
        if (difficultyMultiplier <= 1.6) return 'moderate';
        if (difficultyMultiplier <= 2.0) return 'significant';
        return 'maximum';
    }

    /**
     * Check if player should see adapted mechanics
     * @param {number} currentWealth - Player's current wealth
     * @returns {boolean} Whether to apply adaptations
     */
    shouldApplyAdaptation(currentWealth) {
        return currentWealth >= 10_000_000;
    }

    /**
     * Get system status for monitoring
     * @returns {Object} System status
     */
    getSystemStatus() {
        return {
            gameTypes: Object.keys(this.baseGameConfigs),
            adaptationThreshold: 10_000_000,
            features: [
                'Dynamic multiplier adjustment',
                'Win probability scaling', 
                'Honest display multipliers',
                'Invisible difficulty scaling'
            ]
        };
    }
}

// Export singleton
module.exports = new AdaptiveGameMechanics();