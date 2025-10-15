const logger = require('./logger');

class WinLossValidator {
    constructor() {
        this.validationEnabled = true;
        this.logAnomalies = true;
        this.stats = {
            validationsPerformed: 0,
            anomaliesDetected: 0,
            correctionsApplied: 0
        };
    }

    /**
     * Validate game outcome to ensure players don't lose money when they should win
     * @param {Object} gameResult - The game result object
     * @param {number} gameResult.betAmount - Original bet amount
     * @param {number} gameResult.payout - Calculated payout
     * @param {boolean} gameResult.isWin - Whether the player won
     * @param {string} gameResult.gameType - Type of game
     * @param {string} gameResult.userId - Player's user ID
     * @returns {Object} Validated and possibly corrected game result
     */
    validateGameOutcome(gameResult) {
        if (!this.validationEnabled) {
            return gameResult;
        }

        this.stats.validationsPerformed++;
        
        const {
            betAmount,
            payout,
            isWin,
            gameType,
            userId,
            multiplier = null,
            details = {}
        } = gameResult;

        // Create a copy to avoid modifying the original
        let validatedResult = { ...gameResult };
        let correctionApplied = false;
        let anomalyDetected = false;

        // Basic validation: if player wins, payout should be at least the bet amount
        if (isWin && payout < betAmount) {
            anomalyDetected = true;
            this.stats.anomaliesDetected++;
            
            // Correct the payout to at least return the bet amount
            const minValidPayout = betAmount;
            validatedResult.payout = Math.max(payout, minValidPayout);
            correctionApplied = true;

            if (this.logAnomalies) {
                logger.warn(`🚨 Win/Loss Anomaly Detected and Corrected`, {
                    userId,
                    gameType,
                    betAmount,
                    originalPayout: payout,
                    correctedPayout: validatedResult.payout,
                    reason: 'Player won but payout was less than bet amount'
                });
            }
        }

        // Negative payout validation: payouts should never be negative
        if (payout < 0) {
            anomalyDetected = true;
            this.stats.anomaliesDetected++;
            
            // If it's a win, give at least the bet back; if it's a loss, payout should be 0
            validatedResult.payout = isWin ? betAmount : 0;
            correctionApplied = true;

            if (this.logAnomalies) {
                logger.warn(`🚨 Negative Payout Detected and Corrected`, {
                    userId,
                    gameType,
                    betAmount,
                    originalPayout: payout,
                    correctedPayout: validatedResult.payout,
                    isWin,
                    reason: 'Payout was negative'
                });
            }
        }

        // Multiplier consistency validation
        if (multiplier !== null && isWin) {
            const expectedPayout = betAmount * multiplier;
            const tolerance = 0.01; // Allow small floating point differences
            
            if (Math.abs(payout - expectedPayout) > tolerance) {
                anomalyDetected = true;
                this.stats.anomaliesDetected++;
                
                // Use the multiplier-based calculation as the correct payout
                validatedResult.payout = expectedPayout;
                correctionApplied = true;

                if (this.logAnomalies) {
                    logger.warn(`🚨 Multiplier Inconsistency Detected and Corrected`, {
                        userId,
                        gameType,
                        betAmount,
                        multiplier,
                        originalPayout: payout,
                        expectedPayout,
                        correctedPayout: validatedResult.payout,
                        reason: 'Payout did not match multiplier calculation'
                    });
                }
            }
        }

        // Game-specific validations
        validatedResult = this.performGameSpecificValidation(validatedResult);

        if (correctionApplied) {
            this.stats.correctionsApplied++;
            validatedResult.validationApplied = true;
            validatedResult.originalPayout = payout;
        }

        return validatedResult;
    }

    /**
     * Perform game-specific validation rules
     * @param {Object} gameResult - The game result to validate
     * @returns {Object} Validated game result
     */
    performGameSpecificValidation(gameResult) {
        const { gameType, isWin, betAmount, payout } = gameResult;

        switch (gameType.toLowerCase()) {
            case 'blackjack':
                return this.validateBlackjackResult(gameResult);
            case 'slots':
                return this.validateSlotsResult(gameResult);
            case 'roulette':
                return this.validateRouletteResult(gameResult);
            case 'flip':
            case 'coinflip':
                return this.validateCoinFlipResult(gameResult);
            default:
                return gameResult;
        }
    }

    /**
     * Validate blackjack-specific rules
     */
    validateBlackjackResult(gameResult) {
        const { isWin, betAmount, payout, details = {} } = gameResult;
        let validatedResult = { ...gameResult };

        if (isWin) {
            // Standard win should be at least 1x (return bet + bet as profit)
            // Blackjack should be 1.5x (return bet + 1.5x bet as profit)
            const isBlackjack = details.isBlackjack || false;
            const minExpectedPayout = isBlackjack ? betAmount * 2.5 : betAmount * 2.0;
            
            if (payout < minExpectedPayout - 0.01) { // Small tolerance for floating point
                validatedResult.payout = minExpectedPayout;
                this.logCorrection('blackjack', gameResult, validatedResult.payout, 
                    `Blackjack win payout too low (expected min: ${minExpectedPayout})`);
            }
        }

        return validatedResult;
    }

    /**
     * Validate slots-specific rules
     */
    validateSlotsResult(gameResult) {
        const { isWin, betAmount, payout } = gameResult;
        let validatedResult = { ...gameResult };

        if (isWin && payout < betAmount) {
            // Any slots win should return at least the bet amount
            validatedResult.payout = betAmount;
            this.logCorrection('slots', gameResult, validatedResult.payout, 
                'Slots win should return at least the bet amount');
        }

        return validatedResult;
    }

    /**
     * Validate roulette-specific rules
     */
    validateRouletteResult(gameResult) {
        const { isWin, betAmount, payout, details = {} } = gameResult;
        let validatedResult = { ...gameResult };

        if (isWin) {
            // Roulette wins should follow standard payout ratios
            const betType = details.betType;
            let minExpectedMultiplier = 2; // Default to even money bets

            // Set expected multipliers based on bet type
            if (betType === 'straight') minExpectedMultiplier = 36;
            else if (betType === 'split') minExpectedMultiplier = 18;
            else if (betType === 'street') minExpectedMultiplier = 12;
            else if (betType === 'corner') minExpectedMultiplier = 9;
            else if (betType === 'line') minExpectedMultiplier = 6;
            else if (betType === 'column' || betType === 'dozen') minExpectedMultiplier = 3;

            const minExpectedPayout = betAmount * minExpectedMultiplier;
            
            if (payout < minExpectedPayout - 0.01) {
                validatedResult.payout = minExpectedPayout;
                this.logCorrection('roulette', gameResult, validatedResult.payout, 
                    `Roulette ${betType} win payout too low (expected min: ${minExpectedPayout})`);
            }
        }

        return validatedResult;
    }

    /**
     * Validate coin flip-specific rules
     */
    validateCoinFlipResult(gameResult) {
        const { isWin, betAmount, payout } = gameResult;
        let validatedResult = { ...gameResult };

        if (isWin) {
            // Coin flip win should be 2x the bet (bet + bet as profit)
            const expectedPayout = betAmount * 2;
            
            if (payout < expectedPayout - 0.01) {
                validatedResult.payout = expectedPayout;
                this.logCorrection('coinflip', gameResult, validatedResult.payout, 
                    `Coin flip win should be 2x bet amount (expected: ${expectedPayout})`);
            }
        }

        return validatedResult;
    }

    /**
     * Log a correction that was applied
     */
    logCorrection(gameType, originalResult, correctedPayout, reason) {
        if (this.logAnomalies) {
            this.stats.anomaliesDetected++;
            this.stats.correctionsApplied++;
            
            logger.warn(`🚨 Game-Specific Validation Correction Applied`, {
                gameType,
                userId: originalResult.userId,
                betAmount: originalResult.betAmount,
                originalPayout: originalResult.payout,
                correctedPayout,
                reason
            });
        }
    }

    /**
     * Validate a batch of game results
     * @param {Array} gameResults - Array of game results to validate
     * @returns {Array} Array of validated game results
     */
    validateBatch(gameResults) {
        return gameResults.map(result => this.validateGameOutcome(result));
    }

    /**
     * Get validation statistics
     * @returns {Object} Statistics about validations performed
     */
    getStats() {
        return {
            ...this.stats,
            anomalyRate: this.stats.validationsPerformed > 0 
                ? (this.stats.anomaliesDetected / this.stats.validationsPerformed * 100).toFixed(2) + '%'
                : '0%',
            correctionRate: this.stats.validationsPerformed > 0 
                ? (this.stats.correctionsApplied / this.stats.validationsPerformed * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            validationsPerformed: 0,
            anomaliesDetected: 0,
            correctionsApplied: 0
        };
    }

    /**
     * Enable or disable validation
     * @param {boolean} enabled - Whether validation should be enabled
     */
    setValidationEnabled(enabled) {
        this.validationEnabled = enabled;
        logger.info(`🔧 Win/Loss Validation ${enabled ? 'Enabled' : 'Disabled'}`);
    }

    /**
     * Enable or disable anomaly logging
     * @param {boolean} enabled - Whether anomaly logging should be enabled
     */
    setAnomalyLogging(enabled) {
        this.logAnomalies = enabled;
        logger.info(`🔧 Win/Loss Anomaly Logging ${enabled ? 'Enabled' : 'Disabled'}`);
    }
}

// Create and export a singleton instance
const winLossValidator = new WinLossValidator();

module.exports = {
    WinLossValidator,
    winLossValidator
};