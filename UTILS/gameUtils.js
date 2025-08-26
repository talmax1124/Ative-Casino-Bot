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
    clearActiveGame
} = require('./common');
const logger = require('./logger');

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
    MULTI_SLOTS: 'multi_slots'
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
        
        // Check if user already has active game
        if (hasActiveGame(userId)) {
            return new ValidationResult({
                isValid: false,
                errorEmbed: buildGameActiveEmbed()
            });
        }
        
        // Get current balance
        const balance = await dbManager.getUserBalance(userId, guildId);
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
        
        // Deduct bet from wallet
        const newWallet = currentWallet - parsedAmount;
        const success = await dbManager.setUserBalance(userId, guildId, newWallet, balance.bank);
        
        if (!success) {
            return new ValidationResult({
                isValid: false,
                errorEmbed: new EmbedBuilder()
                    .setTitle('❌ Transaction Failed')
                    .setDescription('Failed to process bet. Please try again.')
                    .setColor(0xFF0000)
                    .setTimestamp()
            });
        }
        
        // Set active game
        setActiveGame(userId, gameType);
        
        logger.info(`User ${userId} placed bet of ${fmt(parsedAmount)} for ${gameType}`);
        
        return new ValidationResult({
            isValid: true,
            parsedAmount: parsedAmount,
            newWallet: newWallet
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
        
        try {
            // Get current balance
            const balance = await dbManager.getUserBalance(userId, guildId);
            
            // Add payout to wallet
            let newWallet = balance.wallet + payout;
            
            // Apply server booster bonus if applicable
            const boosterBonus = await this._calculateBoosterBonus(userId, guildId, payout);
            if (boosterBonus > 0) {
                newWallet += boosterBonus;
                gameResult.bonusTriggered = true;
            }
            
            // Update balance
            const success = await dbManager.setUserBalance(userId, guildId, newWallet, balance.bank);
            
            if (!success) {
                logger.error(`Failed to update balance for user ${userId} after game ${gameType}`);
                return {
                    success: false,
                    newWallet: balance.wallet,
                    boosterBonus: 0
                };
            }
            
            // Extract profile data for leaderboard use
            let profileData = null;
            if (interaction) {
                profileData = dbManager.extractProfileFromInteraction(interaction);
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
            
            // Clear active game
            clearActiveGame(userId);
            
            logger.info(`Processed payout for ${userId}: ${fmt(payout)} (${won ? 'win' : 'loss'})`);
            
            return {
                success: true,
                newWallet: newWallet,
                boosterBonus: boosterBonus,
                finalPayout: payout + boosterBonus
            };
            
        } catch (error) {
            logger.error(`Error processing payout for ${userId}: ${error.message}`);
            clearActiveGame(userId);
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
            const balance = await dbManager.getUserBalance(userId, guildId);
            const newWallet = balance.wallet + amount;
            
            const success = await dbManager.setUserBalance(userId, guildId, newWallet, balance.bank);
            
            if (success) {
                clearActiveGame(userId);
                logger.info(`Refunded ${fmt(amount)} to user ${userId}: ${reason}`);
            }
            
            return success;
        } catch (error) {
            logger.error(`Error refunding bet for ${userId}: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Calculate server booster bonus (15% extra on wins)
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID
     * @param {number} payout - Base payout amount
     * @returns {number} Bonus amount
     */
    static async _calculateBoosterBonus(userId, guildId, payout) {
        // TODO: Implement server booster check
        // For now, return 0 - this would need Discord.js guild member fetching
        return 0;
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