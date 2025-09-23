/**
 * Game Utilities for Casino Bot
 * Centralizes all repetitive game management functions including payouts, validation, 
 * errors, timeouts, and admin utilities
 */

const { EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const progressiveTax = require('./progressiveTax');
// const wealthCeiling = require('./wealthCeiling'); // DISABLED - replaced by allInManager
// AI tracking removed
const BulletproofEconomyController = require('../BULLETPROOF_ECONOMY/BulletproofEconomyController');
// wealthBasedBetLimits removed - no bet limits enforced
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

// Initialize bulletproof economy controller
let bulletproofEconomy = null;
(async () => {
    try {
        bulletproofEconomy = new BulletproofEconomyController();
        await bulletproofEconomy.initialize();
        logger.info('✅ Bulletproof Economy Controller initialized successfully');
    } catch (error) {
        logger.error(`Failed to initialize Bulletproof Economy Controller: ${error.message}`);
    }
})();

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
    YAHTZEE: 'yahtzee',
    LOTTERY: 'lottery',
    ROULETTE: 'roulette',
    RUSSIAN_ROULETTE: 'russianroulette',
    CEELO: 'ceelo',
    TREASURE_VAULT: 'treasurevault',
    QUIZ: 'quiz',
    MINES: 'mines'
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
        specialResult = null,
        choice = null,
        metadata = {}
    }) {
        this.userId = userId;
        this.guildId = guildId;
        this.gameType = gameType;
        this.betAmount = betAmount;
        this.payout = payout;
        this.won = won;
        this.choice = choice;
        this.sessionGames = sessionGames;
        this.sessionTotalBet = sessionTotalBet;
        this.sessionTotalWinnings = sessionTotalWinnings;
        this.bonusTriggered = bonusTriggered;
        this.specialResult = specialResult;
        this.metadata = metadata;
    }
}

class ValidationResult {
    constructor({
        isValid,
        errorEmbed = null,
        parsedAmount = null,
        newWallet = null,
        aiTracking = null
    }) {
        this.isValid = isValid;
        this.errorEmbed = errorEmbed;
        this.parsedAmount = parsedAmount;
        this.newWallet = newWallet;
        this.aiTracking = aiTracking;
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
    static async validateBet(
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
        await dbManager.ensureUser(userId, interaction.user.displayName, guildId);
        
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

        // NO MAX BET LIMITS - UNLIMITED BETTING ALLOWED
        // All wealth protection is handled by house edge, trend analysis, and progressive taxation
        // Players can bet their entire balance if they want to take the risk
        
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
        
        // Return successful validation WITHOUT deducting money
        return new ValidationResult({
            isValid: true,
            parsedAmount: parsedAmount,
            userBalance: balance
        });
    }

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
        await dbManager.ensureUser(userId, interaction.user.displayName, guildId);
        
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

        // NO MAX BET LIMITS - UNLIMITED BETTING ALLOWED
        // All wealth protection is handled by house edge, trend analysis, and progressive taxation
        // Players can bet their entire balance if they want to take the risk
        
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
        
        // Bet tracking removed - no bet limits enforced
        // All risk management handled by house edge and trend analysis
        
        // Set active game (only for legacy games, modern games use Unified Session Manager)
        // Comprehensive list to avoid touching legacy registry for any supported game
        const modernGames = [
            'blackjack','slots','crash','plinko','uno','wordchain','fishing','battleship','rps',
            'bingo','duck','duck_game','multi_slots','matrix_slots','yahtzee','treasurevault',
            'war','keno','spades','31','thirtyone','poker','lottery','ceelo','russianroulette',
            'roulette','heist','quiz','mines'
        ];
        if (!modernGames.includes(gameType.toLowerCase())) {
            setActiveGame(userId, gameType);
        }
        
        logger.info(`User ${userId} placed bet of ${fmt(parsedAmount)} for ${gameType}`);
        
        // AI tracking removed
        
        return new ValidationResult({
            isValid: true,
            parsedAmount: parsedAmount,
            newWallet: currentWallet - parsedAmount, // Wallet after bet deduction
            aiTracking: null // AI tracking removed - using bulletproof economy
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
        
        // Process game through bulletproof economy system for house edge optimization
        let finalPayout = payout;
        if (bulletproofEconomy) {
            try {
                const economyResult = await bulletproofEconomy.processGame({
                    gameType,
                    userId,
                    betAmount,
                    originalPayout: payout,
                    won,
                    guildId,
                    choice: gameResult.choice || gameResult.metadata?.choice || 'unknown',
                    metadata: gameResult.metadata || {}
                });
                
                // Apply bulletproof economy adjustments
                if (economyResult && economyResult.adjustedPayout !== undefined) {
                    finalPayout = economyResult.adjustedPayout;
                    
                    // Log significant adjustments
                    if (Math.abs(finalPayout - payout) > betAmount * 0.1) {
                        logger.warn(`🎯 Bulletproof Economy adjusted payout: ${gameType} - Original: ${fmt(payout)} -> Adjusted: ${fmt(finalPayout)} (${((finalPayout/payout - 1) * 100).toFixed(1)}%)`);
                    }
                }
            } catch (economyError) {
                logger.error(`Bulletproof economy processing failed: ${economyError.message}`);
                // Continue with original payout if economy system fails
            }
        }
        
        // Apply fairness override to ensure reasonable house edges
        const fairnessOverride = require('./fairnessOverride');
        const fairnessResult = fairnessOverride.ensureFairPayout(gameType, betAmount, finalPayout, gameResult);
        
        if (fairnessResult.override) {
            logger.info(`🛡️ Fairness override applied: ${gameType} - ${fairnessResult.reason} - Payout: ${fmt(finalPayout)} → ${fmt(fairnessResult.payout)}`);
            finalPayout = fairnessResult.payout;
        }

        // Apply advanced mathematical protections for wealth control
        try {
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            const currentWealth = userBalance.wallet + userBalance.bank;
            
            // Only apply advanced protections to players with significant wealth (10M+)
            if (currentWealth > 10_000_000) {
                const antiBillionaireSystem = require('./antiBillionaireSystem');
                
                // Calculate mathematical difficulty adjustments
                const difficultyResult = await antiBillionaireSystem.calculateAntiBillionaireDifficulty(
                    userId, currentWealth, betAmount, gameType
                );
                
                // Apply difficulty adjustments to payout (if won)
                if (won && difficultyResult.totalMultiplier > 1.01) {
                    const adjustedPayout = finalPayout / difficultyResult.totalMultiplier;
                    logger.info(`🎯 Wealth protection: ${userId} - Difficulty: ${(difficultyResult.totalMultiplier * 100 - 100).toFixed(1)}% - Payout: ${fmt(finalPayout)} → ${fmt(adjustedPayout)}`);
                    finalPayout = adjustedPayout;
                }
                
                // Apply win size limitations for very large wins
                if (won && finalPayout > betAmount * 2) { // Only for wins larger than 2x bet
                    const winLimitations = antiBillionaireSystem.applyWinLimitations(
                        finalPayout - betAmount, // Only the profit portion
                        currentWealth,
                        { gameType, betAmount }
                    );
                    
                    if (winLimitations.totalReduction > 0) {
                        const limitedPayout = betAmount + winLimitations.adjustedWin;
                        logger.warn(`💰 Win limitation applied: ${userId} - Reduction: ${fmt(winLimitations.totalReduction)} (${winLimitations.reductionPercent.toFixed(1)}%) - Payout: ${fmt(finalPayout)} → ${fmt(limitedPayout)}`);
                        finalPayout = limitedPayout;
                    }
                }
            }
        } catch (protectionError) {
            logger.error(`Advanced protection system error: ${protectionError.message}`);
            // Continue with existing payout if protection system fails
        }

        // Protection systems work invisibly - players only see their adjusted results
        // All multipliers, odds, and payouts are automatically calculated to reflect their actual chances
        // No UI indicators are shown - the game simply becomes harder mathematically
        
        // Log all game results for anti-abuse monitoring and trend analysis
        const resultMultiplier = betAmount > 0 ? (finalPayout / betAmount) : 0;
        if (won && resultMultiplier >= 10) {
            logger.warn(`HIGH WIN ALERT: User ${userId} won ${finalPayout} (${resultMultiplier.toFixed(2)}x) in ${gameType}`);
            
            // Report big wins to trend analyzer for immediate analysis
            try {
                const trendAnalyzerIntegration = require('./trendAnalyzerIntegration');
                await trendAnalyzerIntegration.reportBigWin(
                    gameType, 
                    userId, 
                    finalPayout - betAmount, // Report only the winnings, not the returned bet
                    betAmount,
                    { 
                        originalPayout: payout,
                        adjustedPayout: finalPayout,
                        multiplier: resultMultiplier,
                        timestamp: Date.now()
                    }
                );
            } catch (trendError) {
                logger.error(`Failed to report big win to trend analyzer: ${trendError.message}`);
            }
        } else if (!won && finalPayout === 0) {
            logger.info(`Total Loss: User ${userId} lost entire bet ${betAmount} in ${gameType}`);
        }
        
        try {
            // Get current balance
            const balance = await dbManager.getUserBalance(userId, guildId);
            
            // Validate payout amount
            if (isNaN(finalPayout) || !isFinite(finalPayout)) {
                logger.error(`Invalid payout amount for user ${userId}: ${finalPayout}`);
                return { success: false, error: 'Invalid payout amount' };
            }
            
            // Since bet was already deducted, finalPayout is the full amount to give back
            // If player loses: finalPayout = 0 (they get nothing back)  
            // If player wins: finalPayout = bet + winnings (they get their bet back plus profit)
            // Bulletproof economy may have adjusted this value above

            // Apply progressive tax on remaining winnings (only if they won and payout > bet amount)
            let taxAmount = 0;
            if (won && finalPayout > betAmount) {
                const winnings = finalPayout - betAmount; // Only tax the profit, not the returned bet
                if (winnings > 10000) { // Only apply tax on winnings over $10K
                    const taxResult = await progressiveTax.applyTax(userId, winnings);
                    const taxedWinnings = taxResult.netPayout;
                    taxAmount = taxResult.taxAmount;
                    finalPayout = betAmount + taxedWinnings; // Bet + taxed winnings
                    gameResult.taxApplied = true;
                    gameResult.taxAmount = taxAmount;
                    gameResult.taxRate = taxResult.taxRate;
                }
            }
            
            let newWallet = safeAdd(balance.wallet, finalPayout);
            
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
            const totalPayoutWithBonus = finalPayout + boosterBonus;
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
            
            // Record detailed game result for history tracking
            await dbManager.recordGameResult(
                userId,
                guildId,
                gameType,
                won,
                betAmount,
                won ? payout : 0,
                {
                    finalPayout: finalPayout,
                    boosterBonus: boosterBonus,
                    taxAmount: taxAmount || 0,
                    multiplier: payout > 0 ? (payout / betAmount) : 0
                }
            );
            
            // Clear active game (only for legacy games, modern games use Unified Session Manager)
            const modernGames = [
                'blackjack','slots','crash','plinko','uno','wordchain','fishing','battleship','rps',
                'bingo','duck','duck_game','multi_slots','matrix_slots','yahtzee','treasurevault',
                'war','keno','spades','31','thirtyone','poker','lottery','ceelo','russianroulette',
                'roulette','heist','mines'
            ];
            if (gameType && !modernGames.includes(gameType.toLowerCase())) {
                clearActiveGame(userId);
            }
            
            logger.info(`Processed payout for ${userId}: ${fmt(payout)} (${won ? 'win' : 'loss'})`);
            
            // Record activity for log summaries
            if (global.client && global.client.logSummaryManager) {
                global.client.logSummaryManager.recordGameActivity(
                    gameType, 
                    userId, 
                    betAmount, 
                    finalPayout + boosterBonus, 
                    won
                );
            }
            
            // AI analysis removed
            
            // Report game result to behavioral analyzer for pattern detection
            try {
                const trendAnalyzerIntegration = require('./trendAnalyzerIntegration');
                await trendAnalyzerIntegration.reportGameResult(
                    userId,
                    gameType,
                    betAmount,
                    finalPayout,
                    won ? 'win' : 'loss',
                    {
                        multiplier: betAmount > 0 ? (finalPayout / betAmount) : 0,
                        boosterBonus: boosterBonus,
                        taxAmount: taxAmount || 0,
                        timestamp: Date.now()
                    }
                );
            } catch (behavioralError) {
                logger.error(`Failed to report game result to behavioral analyzer: ${behavioralError.message}`);
            }
            
            return {
                success: true,
                newWallet: newWallet,
                boosterBonus: boosterBonus,
                finalPayout: payout + boosterBonus,
                isBooster: gameResult.isBooster || false,
                boosterPercentage: gameResult.isBooster ? 2 : 0,
                aiTracking: null // AI analysis removed - using bulletproof economy
            };
            
        } catch (error) {
            logger.error(`Error processing payout for ${userId}: ${error.message}`);
            // Clear active game (only for legacy games, modern games use Unified Session Manager)
            const modernGames = [
                'blackjack','slots','crash','plinko','uno','wordchain','fishing','battleship','rps',
                'bingo','duck','duck_game','multi_slots','matrix_slots','yahtzee','treasurevault',
                'war','keno','spades','31','thirtyone','poker','lottery','ceelo','russianroulette',
                'roulette','heist','mines'
            ];
            if (gameType && !modernGames.includes(gameType.toLowerCase())) {
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
                const modernGames = [
                    'blackjack','slots','crash','plinko','uno','wordchain','fishing','battleship','rps',
                    'bingo','duck','duck_game','multi_slots','matrix_slots','yahtzee','treasurevault',
                    'war','keno','spades','31','thirtyone','poker','lottery','ceelo','russianroulette',
                    'roulette','heist'
                ];
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
            // Only apply booster bonus for the specific guild
            if (guildId !== '1403244656845787167') {
                return { amount: 0, isBooster: false, reason: 'Booster benefits only available in specific guild' };
            }

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
        const guildId = await getGuildId(interaction);
        
        // Check if user has active game
        if (hasActiveGame(userId)) {
            return {
                canStart: false,
                reason: 'You already have an active game.'
            };
        }
        
        // Check if user exists in database
        await dbManager.ensureUser(userId, interaction.user.displayName, guildId);
        
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

// ========================= GAME TRACKING =========================

/**
 * Record a game choice for trend analysis
 * @param {string} gameType - Type of game
 * @param {string} userId - Discord user ID  
 * @param {string} choice - Player's choice
 * @param {Object} metadata - Additional metadata
 */
async function recordGameChoice(gameType, userId, choice, metadata = {}) {
    try {
        // Get global trend analyzer instance if available
        if (global.trendAnalyzer) {
            await global.trendAnalyzer.recordChoice(gameType, userId, choice, metadata);
        }
    } catch (error) {
        logger.error(`Failed to record game choice for ${gameType}: ${error.message}`);
    }
}

// ========================= EXPORTS =========================

module.exports = {
    GameType,
    GameResult,
    ValidationResult,
    PayoutManager,
    GameValidator,
    TimeoutManager,
    recordGameChoice
};
