/**
 * GAME SYSTEM VALIDATOR
 * Validates that all casino games are properly integrated with all systems
 * Provides real-time monitoring and automatic enforcement
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class GameSystemValidator {
    constructor() {
        this.requiredIntegrations = [
            'secureRandom', 'CSPRNG', 'crypto.random', // CSPRNG usage
            'transparentPayoutManager', 'BulletproofEconomy', // Payout systems
            'securityLogger', 'tuningManager', // Monitoring systems
            'sessionManager', 'sessionGuard' // Session management
        ];

        this.gameDirectories = [
            '/Users/carlosdiazplaza/ative_casino_bot/COMMANDS',
            '/Users/carlosdiazplaza/ative_casino_bot/GAMES'
        ];

        this.validationResults = new Map();
        this.lastValidation = null;
    }

    /**
     * Validate all casino games for proper system integration
     */
    async validateAllGames() {
        const results = {
            totalGames: 0,
            validGames: 0,
            invalidGames: 0,
            missingIntegrations: [],
            gameResults: new Map()
        };

        logger.info('🔍 Starting comprehensive game system validation...');

        for (const directory of this.gameDirectories) {
            await this.validateGamesInDirectory(directory, results);
        }

        this.validationResults = results;
        this.lastValidation = Date.now();

        // Log summary
        logger.info(`✅ Game Validation Complete:`);
        logger.info(`   Total Games: ${results.totalGames}`);
        logger.info(`   Valid Games: ${results.validGames}`);
        logger.info(`   Invalid Games: ${results.invalidGames}`);
        
        if (results.invalidGames > 0) {
            logger.warn(`⚠️ ${results.invalidGames} games need attention:`);
            for (const [game, issues] of results.gameResults) {
                if (issues.length > 0) {
                    logger.warn(`   ${game}: ${issues.join(', ')}`);
                }
            }
        }

        return results;
    }

    /**
     * Validate games in a specific directory
     */
    async validateGamesInDirectory(directory, results) {
        try {
            const files = fs.readdirSync(directory);
            const gameFiles = files.filter(file => 
                file.endsWith('.js') && 
                this.isGameFile(file)
            );

            for (const file of gameFiles) {
                const filePath = path.join(directory, file);
                const gameResult = await this.validateGameFile(filePath);
                
                results.totalGames++;
                results.gameResults.set(file, gameResult.issues);
                
                if (gameResult.isValid) {
                    results.validGames++;
                } else {
                    results.invalidGames++;
                    results.missingIntegrations.push(...gameResult.issues);
                }
            }
        } catch (error) {
            logger.error(`Error validating directory ${directory}: ${error.message}`);
        }
    }

    /**
     * Check if a file is a casino game file
     */
    isGameFile(filename) {
        const gameNames = [
            'slots', 'blackjack', 'roulette', 'crash', 'plinko',
            'poker', 'baccarat', 'keno', 'mines', 'wheel',
            'dice', 'coinflip', 'bingo', 'lottery', 'scratch'
        ];

        return gameNames.some(game => 
            filename.toLowerCase().includes(game) ||
            filename.toLowerCase().startsWith(game)
        );
    }

    /**
     * Validate a specific game file
     */
    async validateGameFile(filePath) {
        const result = {
            isValid: true,
            issues: []
        };

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Check for CSPRNG usage
            if (!this.hasCSPRNG(content)) {
                result.issues.push('Missing CSPRNG (using Math.random)');
                result.isValid = false;
            }

            // Check for bulletproof economy integration
            if (!this.hasBulletproofEconomy(content)) {
                result.issues.push('Missing Bulletproof Economy integration');
                result.isValid = false;
            }

            // Check for security logging
            if (!this.hasSecurityLogging(content)) {
                result.issues.push('Missing security logging');
                result.isValid = false;
            }

            // Check for session management
            if (!this.hasSessionManagement(content)) {
                result.issues.push('Missing session management');
                result.isValid = false;
            }

            // Check for transparent payout processing
            if (!this.hasTransparentPayout(content)) {
                result.issues.push('Missing transparent payout processing');
                result.isValid = false;
            }

        } catch (error) {
            result.issues.push(`File read error: ${error.message}`);
            result.isValid = false;
        }

        return result;
    }

    /**
     * Check if file uses CSPRNG
     */
    hasCSPRNG(content) {
        return (
            content.includes('secureRandom') ||
            content.includes('crypto.random') ||
            content.includes('CSPRNG') ||
            (content.includes('crypto') && !content.includes('Math.random()'))
        );
    }

    /**
     * Check if file has bulletproof economy integration
     */
    hasBulletproofEconomy(content) {
        return (
            content.includes('BulletproofEconomy') ||
            content.includes('transparentPayoutManager') ||
            content.includes('UniversalGameIntegrator')
        );
    }

    /**
     * Check if file has security logging
     */
    hasSecurityLogging(content) {
        return (
            content.includes('securityLogger') ||
            content.includes('logSecurityEvent')
        );
    }

    /**
     * Check if file has session management
     */
    hasSessionManagement(content) {
        return (
            content.includes('sessionManager') ||
            content.includes('sessionGuard') ||
            content.includes('canCreateSession')
        );
    }

    /**
     * Check if file has transparent payout processing
     */
    hasTransparentPayout(content) {
        return (
            content.includes('transparentPayoutManager') ||
            content.includes('processGamePayout') ||
            content.includes('tuningManager')
        );
    }

    /**
     * Generate auto-fix suggestions for games
     */
    generateFixSuggestions(gameFile, issues) {
        const suggestions = [];

        if (issues.includes('Missing CSPRNG (using Math.random)')) {
            suggestions.push({
                issue: 'CSPRNG',
                fix: 'Replace Math.random() with secureRandomFloat() from ../UTILS/rng',
                code: "const { secureRandomFloat } = require('../UTILS/rng');"
            });
        }

        if (issues.includes('Missing Bulletproof Economy integration')) {
            suggestions.push({
                issue: 'Bulletproof Economy',
                fix: 'Add UniversalGameIntegrator for full system integration',
                code: "const UniversalGameIntegrator = require('../UTILS/UniversalGameIntegrator');"
            });
        }

        if (issues.includes('Missing security logging')) {
            suggestions.push({
                issue: 'Security Logging',
                fix: 'Add security event logging for game actions',
                code: "const securityLogger = require('../UTILS/securityLogger');"
            });
        }

        return suggestions;
    }

    /**
     * Get validation report
     */
    getValidationReport() {
        if (!this.lastValidation) {
            return { error: 'No validation performed yet' };
        }

        return {
            lastValidation: new Date(this.lastValidation).toISOString(),
            results: this.validationResults,
            summary: {
                complianceRate: (this.validationResults.validGames / this.validationResults.totalGames * 100).toFixed(1) + '%',
                needsAttention: this.validationResults.invalidGames,
                allSystemsIntegrated: this.validationResults.invalidGames === 0
            }
        };
    }

    /**
     * Monitor games in real-time
     */
    startMonitoring(intervalMs = 300000) { // 5 minutes
        setInterval(async () => {
            await this.validateAllGames();
        }, intervalMs);

        logger.info('🔄 Game system monitoring started');
    }
}

module.exports = new GameSystemValidator();