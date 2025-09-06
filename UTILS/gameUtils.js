/**
 * Game Utilities for Casino Bot
 * Centralizes all repetitive game management functions including payouts, validation, 
 * errors, timeouts, and admin utilities
 */

const { EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const { 
    fmt, 
    getGuildId, 
    hasAdminRole, 
    hasModRole, 
    buildInsufficientFundsEmbed,
    buildInvalidBetEmbed,
    buildGameActiveEmbed,
    parseAmount,
    resolveAmount,
    hasActiveGame,
    setActiveGame,
    clearActiveGame,
    sendLogMessage,
    safeAdd,
    safeSubtract
} = require('./common');
const logger = require('./logger');
const sessionManager = require('./sessionManager');

// ========================= ENUMS AND CONSTANTS =========================

const GameType = {
    BLACKJACK: 'blackjack',
    SLOTS: 'slots',
    PLINKO: 'plinko',
    POKER: 'poker',
    UNO: 'uno',
    WAR: 'war',
    FISHING: 'fishing',
    KENO: 'keno',
    HEIST: 'heist',
    CRASH: 'crash',
    BINGO: 'bingo',
    SPADES: 'spades',
    THIRTYONE: '31',
    ROCKPAPERSCISSORS: 'rps',
    MATRIX_SLOTS: 'matrix_slots',
    DUCK_GAME: 'duck_game',
    MULTI_SLOTS: 'multi_slots',
    BATTLESHIP: 'battleship',
    WORDCHAIN: 'wordchain',
    RUSSIAN_ROULETTE: 'russianroulette',
    CEELO: 'ceelo'
};

// ========================= DATA CLASSES =========================

class GameResult {
    constructor({
        userId,
        guildId,
        gameType,
        betAmount,
        payout,
        won,
        sessionGames = 1,
        sessionTotalBet = 0.0,
        sessionTotalWinnings = 0.0,
        bonusTriggered = false,
        specialResult = null
    }) {
        this.userId = userId;
        this.guildId = guildId;
        this.gameType = gameType;
        this.betAmount = betAmount;
        this.payout = payout;
        this.won = won;
        this.sessionGames = sessionGames;
        this.sessionTotalBet = sessionTotalBet;
        this.sessionTotalWinnings = sessionTotalWinnings;
        this.bonusTriggered = bonusTriggered;
        this.specialResult = specialResult;
    }
}

class ValidationResult {
    constructor({
        isValid,
        errorEmbed = null,
        parsedAmount = null,
        newWallet = null
    }) {
        this.isValid = isValid;
        this.errorEmbed = errorEmbed;
        this.parsedAmount = parsedAmount;
        this.newWallet = newWallet;
    }
}

// ========================= PAYOUT MANAGER =========================

class PayoutManager {
    /**
     * Validate bet amount and deduct from user wallet
     * @param {Interaction} interaction - Discord interaction
     * @param {string} amount - Bet amount as string (supports K/M/B, A, H)
     * @param {string} gameType - Type of game being played
     * @param {number} minBet - Minimum bet amount
     * @param {number} maxBet - Maximum bet amount (optional)
     * @param {Object} specialRequirements - Game-specific requirements
     * @returns {ValidationResult} Validation result with status and parsed data
     */
    static async validateAndDeductBet(
        interaction,
        amount,
        gameType,
        minBet = 1.0,
        maxBet = null,
        specialRequirements = null
    ) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        
        // Ensure user exists in database
        await dbManager.ensureUser(userId, interaction.user.displayName);
        
        // Defensive legacy lock auto-clear using Unified Session Manager
        if (hasActiveGame(userId)) {
            try {
                const canCreate = await sessionManager.canCreateSession(userId, guildId, gameType);
                if (canCreate && canCreate.allowed) {
                    // Legacy registry says active, but SessionManager allows creation -> clear stale lock
                    clearActiveGame(userId);
                } else {
                    return new ValidationResult({
                        isValid: false,
                        errorEmbed: buildGameActiveEmbed()
                    });
                }
            } catch (_) {
                return new ValidationResult({
                    isValid: false,
                    errorEmbed: buildGameActiveEmbed()
                });
            }
        }
        
        // Get current balance
        const balance = await dbManager.getUserBalance(userId, guildId);
        
        // If database legacy flag is set but no active sessions, clear it
        try {
            if (balance.game_active) {
                const active = sessionManager.getUserActiveSession(userId);
                if (!active) {
                    await dbManager.updateUserBalance(userId, guildId, 0, 0, { game_active: false });
                }
            }
        } catch (_) {}
        const currentWallet = balance.wallet;
        
        // Parse and resolve amount
        let parsedAmount = parseAmount(amount);
        if (parsedAmount === null) {
            return new ValidationResult({
                isValid: false,
                errorEmbed: buildInvalidBetEmbed('Invalid bet amount format. Use numbers, K/M/B suffixes, "all", or "half".')
            });
        }
        
        parsedAmount = resolveAmount(parsedAmount, currentWallet);
        if (parsedAmount === null || parsedAmount <= 0) {
            return new ValidationResult({
                isValid: false,
                errorEmbed: buildInvalidBetEmbed('Bet amount must be greater than 0.')
            });
        }
        
        // Check minimum bet
        if (parsedAmount < minBet) {
            return new ValidationResult({
                isValid: false,
                errorEmbed: buildInvalidBetEmbed(`Minimum bet is ${fmt(minBet)}.`)
            });
        }
        
        // Check maximum bet
        if (maxBet && parsedAmount > maxBet) {
            return new ValidationResult({
                isValid: false,
                errorEmbed: buildInvalidBetEmbed(`Maximum bet is ${fmt(maxBet)}.`)
            });
        }
        
        // Check special requirements
        if (specialRequirements) {
            // Example: Matrix slots minimum bet
            if (specialRequirements.matrixMinBet && parsedAmount < specialRequirements.matrixMinBet) {
                return new ValidationResult({
                    isValid: false,
                    errorEmbed: buildInvalidBetEmbed(`This game mode requires a minimum bet of ${fmt(specialRequirements.matrixMinBet)}.`)
                });
            }
        }
        
        // Check if user has sufficient funds
        if (parsedAmount > currentWallet) {
            return new ValidationResult({
                isValid: false,
                errorEmbed: buildInsufficientFundsEmbed(parsedAmount, currentWallet)
            });
        }
        
        // Deduct bet upfront like a real casino - use relative update to prevent race conditions
        const success = await dbManager.updateUserBalance(userId, guildId, -parsedAmount, 0);
        if (!success) {
            return new ValidationResult({
                isValid: false,
                errorEmbed: buildInvalidBetEmbed('Failed to process bet. Please try again.')
            });
        }
        
        // Set active game (only for legacy games, modern games use Unified Session Manager)
        // Comprehensive list to avoid touching legacy registry for any supported game
        const modernGames = [
            'blackjack','slots','crash','plinko','uno','wordchain','fishing','battleship','rps',
            'bingo','duck','duck_game','multi_slots','matrix_slots','yahtzee','treasurevault',
            'war','keno','spades','31','thirtyone','poker','lottery'
        ];
        if (!modernGames.includes(gameType.toLowerCase())) {
            setActiveGame(userId, gameType);
        }
        
        logger.info(`User ${userId} placed bet of ${fmt(parsedAmount)} for ${gameType}`);
        
        return new ValidationResult({
            isValid: true,
            parsedAmount: parsedAmount,
            newWallet: currentWallet - parsedAmount // Wallet after bet deduction
        });
    }
    
    /**
     * Process game payout and update user balance and stats
     * @param {GameResult} gameResult - Game result data
     * @param {Interaction} interaction - Discord interaction for profile data extraction
     * @returns {Object} Payout result with new balance
     */
    static async processGamePayout(gameResult, interaction = null) {
        const { userId, guildId, gameType, betAmount, payout, won } = gameResult;
        
        // Log all game results for anti-abuse monitoring
        const resultMultiplier = betAmount > 0 ? (payout / betAmount) : 0;
        if (won && resultMultiplier >= 10) {
            logger.warn(`HIGH WIN ALERT: User ${userId} won ${payout} (${resultMultiplier.toFixed(2)}x) in ${gameType}`);
        } else if (!won && payout === 0) {
            logger.info(`Total Loss: User ${userId} lost entire bet ${betAmount} in ${gameType}`);
        }
        
        try {
            // Get current balance
            const balance = await dbManager.getUserBalance(userId, guildId);
            
            // Validate payout amount
            const payoutValue = parseFloat(payout) || 0;
            if (isNaN(payoutValue) || !isFinite(payoutValue)) {
                logger.error(`Invalid payout amount for user ${userId}: ${payout}`);
                return { success: false, error: 'Invalid payout amount' };
            }
            
            // Since bet was already deducted, payout is the full amount to give back
            // If player loses: payout = 0 (they get nothing back)
            // If player wins: payout = bet + winnings (they get their bet back plus profit)
            let newWallet = safeAdd(balance.wallet, payoutValue);
            
            // Apply server booster bonus if applicable (only on wins, not pushes)
            const boosterInfo = await this._calculateBoosterBonus(userId, guildId, payout, interaction, won);
            const boosterBonus = boosterInfo.amount;
            if (boosterBonus > 0) {
                newWallet = safeAdd(newWallet, boosterBonus);
                gameResult.bonusTriggered = true;
                gameResult.isBooster = boosterInfo.isBooster;
                gameResult.boosterBonusAmount = boosterBonus;
            }
            
            // Update balance - use relative update to prevent race conditions
            const totalPayoutWithBonus = payoutValue + boosterBonus;
            const success = await dbManager.updateUserBalance(userId, guildId, totalPayoutWithBonus, 0);
            
            if (!success) {
                logger.error(`Failed to update balance for user ${userId} after game ${gameType}`);
                return {
                    success: false,
                    newWallet: balance.wallet,
                    boosterBonus: 0
                };
            }
            
            // Calculate new wallet for return value
            newWallet = safeAdd(balance.wallet, totalPayoutWithBonus);
            
            // Extract profile data for leaderboard use
            let profileData = null;
            if (interaction) {
                profileData = dbManager.extractProfileFromInteraction(interaction);
            }
            
            // Log booster bonus if applied
            if (boosterBonus > 0) {
                logger.info(`Booster bonus applied for ${userId}: +${fmt(boosterBonus)} (5% boost)`);
            }
            
            // Update game statistics with profile data
            await dbManager.updateUserStats(
                userId,
                guildId,
                gameType,
                won,
                betAmount,
                won ? payout : -betAmount,
                profileData
            );
            
            // Clear active game (only for legacy games, modern games use Unified Session Manager)
            const modernGames = [
                'blackjack','slots','crash','plinko','uno','wordchain','fishing','battleship','rps',
                'bingo','duck','duck_game','multi_slots','matrix_slots','yahtzee','treasurevault',
                'war','keno','spades','31','thirtyone','poker','lottery'
            ];
            if (!modernGames.includes(gameType.toLowerCase())) {
                clearActiveGame(userId);
            }
            
            logger.info(`Processed payout for ${userId}: ${fmt(payout)} (${won ? 'win' : 'loss'})`);
            
            return {
                success: true,
                newWallet: newWallet,
                boosterBonus: boosterBonus,
                finalPayout: payout + boosterBonus,
                isBooster: gameResult.isBooster || false,
                boosterPercentage: gameResult.isBooster ? 2 : 0
            };
            
        } catch (error) {
            logger.error(`Error processing payout for ${userId}: ${error.message}`);
            // Clear active game (only for legacy games, modern games use Unified Session Manager)
            const modernGames = [
                'blackjack','slots','crash','plinko','uno','wordchain','fishing','battleship','rps',
                'bingo','duck','duck_game','multi_slots','matrix_slots','yahtzee','treasurevault',
                'war','keno','spades','31','thirtyone','poker','lottery'
            ];
            if (!modernGames.includes(gameType.toLowerCase())) {
                clearActiveGame(userId);
            }
            return {
                success: false,
                newWallet: 0,
                boosterBonus: 0
            };
        }
    }
    
    /**
     * Refund bet amount to user (admin function)
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID
     * @param {number} amount - Amount to refund
     * @param {string} reason - Reason for refund
     * @returns {boolean} Success status
     */
    static async refundBet(userId, guildId, amount, reason = 'Game stopped by admin') {
        try {
            // Validate refund amount
            const refundAmount = parseFloat(amount) || 0;
            if (isNaN(refundAmount) || !isFinite(refundAmount) || refundAmount < 0) {
                logger.error(`Invalid refund amount for user ${userId}: ${amount}`);
                return false;
            }
            
            // Use relative update for refunds to prevent race conditions
            const success = await dbManager.updateUserBalance(userId, guildId, refundAmount, 0);
            
            if (success) {
                // Clear active game (only for legacy games, modern games use GameSessionIntegrator)
                const modernGames = ['blackjack', 'slots', 'crash', 'plinko', 'uno', 'wordchain', 'fishing', 'battleship'];
                const gameType = reason.includes('blackjack') ? 'blackjack' : 
                                reason.includes('slots') ? 'slots' : 
                                reason.includes('crash') ? 'crash' : 
                                reason.includes('plinko') ? 'plinko' : 
                                reason.includes('uno') ? 'uno' :
                                reason.includes('wordchain') ? 'wordchain' :
                                reason.includes('fishing') ? 'fishing' :
                                reason.includes('battleship') ? 'battleship' : 'unknown';
                if (!modernGames.includes(gameType.toLowerCase())) {
                    clearActiveGame(userId);
                }
                logger.info(`Refunded ${fmt(amount)} to user ${userId}: ${reason}`);
            }
            
            return success;
        } catch (error) {
            logger.error(`Error refunding bet for ${userId}: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Calculate server booster bonus (5% extra on wins)
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID
     * @param {number} payout - Base payout amount
     * @param {Object} interaction - Discord interaction for member checking
     * @returns {Object} Bonus info with amount and isBooster flag
     */
    static async _calculateBoosterBonus(userId, guildId, payout, interaction = null, won = false) {
        try {
            // Check if we have the interaction and member data
            if (interaction && interaction.member) {
                // Check if user has booster role
                const member = interaction.member;
                const isBooster = member.premiumSinceTimestamp !== null && member.premiumSinceTimestamp > 0;
                
                // Only apply bonus to actual wins, not pushes/ties
                if (isBooster && payout > 0 && won) {
                    // Calculate 5% bonus on winnings
                    const bonusAmount = Math.floor(payout * 0.05);
                    return { amount: bonusAmount, isBooster: true };
                }
            }
            
            return { amount: 0, isBooster: false };
        } catch (error) {
            logger.error(`Error checking booster status: ${error.message}`);
            return { amount: 0, isBooster: false };
        }
    }
}

// ========================= GAME VALIDATION =========================

class GameValidator {
    /**
     * Check if user can start a new game
     * @param {Interaction} interaction - Discord interaction
     * @param {string} gameType - Type of game
     * @returns {Object} Validation result
     */
    static async canStartGame(interaction, gameType) {
        const userId = interaction.user.id;
        
        // Check if user has active game
        if (hasActiveGame(userId)) {
            return {
                canStart: false,
                reason: 'You already have an active game.'
            };
        }
        
        // Check if user exists in database
        await dbManager.ensureUser(userId, interaction.user.displayName);
        
        return {
            canStart: true,
            reason: null
        };
    }
    
    /**
     * Validate admin/mod permissions for game management
     * @param {Interaction} interaction - Discord interaction
     * @returns {boolean} True if user has permissions
     */
    static async hasGameManagementPermissions(interaction) {
        if (!interaction.member) {
            return false;
        }
        
        const guildId = await getGuildId(interaction);
        return await hasAdminRole(interaction.member, guildId) || await hasModRole(interaction.member, guildId);
    }
}

// ========================= TIMEOUT MANAGER =========================

class TimeoutManager {
    static timeouts = new Map();
    
    /**
     * Set a timeout for user interaction
     * @param {string} userId - Discord user ID
     * @param {number} seconds - Timeout duration in seconds
     * @param {Function} callback - Callback function to execute on timeout
     */
    static setTimeout(userId, seconds, callback) {
        // Clear existing timeout if any
        this.clearTimeout(userId);
        
        const timeoutId = setTimeout(() => {
            this.timeouts.delete(userId);
            callback();
        }, seconds * 1000);
        
        this.timeouts.set(userId, timeoutId);
    }
    
    /**
     * Clear timeout for user
     * @param {string} userId - Discord user ID
     */
    static clearTimeout(userId) {
        const timeoutId = this.timeouts.get(userId);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.timeouts.delete(userId);
        }
    }
    
    /**
     * Check if user has active timeout
     * @param {string} userId - Discord user ID
     * @returns {boolean} True if user has active timeout
     */
    static hasTimeout(userId) {
        return this.timeouts.has(userId);
    }
}

// ========================= EXPORTS =========================

module.exports = {
    GameType,
    GameResult,
    ValidationResult,
    PayoutManager,
    GameValidator,
    TimeoutManager
};
