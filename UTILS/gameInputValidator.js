/**
 * Comprehensive Input Validation for Casino Games
 * SECURITY: Centralized validation to prevent exploits across all games
 */

const logger = require('./logger');

class GameInputValidator {
    /**
     * SECURITY: Validate bet amounts across all games
     */
    static validateBetAmount(amount, minBet = 1, maxBet = Infinity) {
        // Type validation
        if (typeof amount !== 'number') {
            throw new Error(`Invalid bet amount type: expected number, got ${typeof amount}`);
        }
        
        // Finite validation (but allow very large numbers)
        if (!Number.isFinite(amount)) {
            throw new Error(`Invalid bet amount: must be finite, got ${amount}`);
        }
        
        // Range validation
        if (amount <= 0) {
            throw new Error(`Invalid bet amount: must be positive, got ${amount}`);
        }
        
        if (amount < minBet) {
            throw new Error(`Bet amount too small: minimum ${minBet}, got ${amount}`);
        }
        
        // NO MAXIMUM BET LIMIT - REMOVED
        // if (amount > maxBet) {
        //     throw new Error(`Bet amount too large: maximum ${maxBet}, got ${amount}`);
        // }
        
        // Integer validation for currency
        if (!Number.isInteger(amount)) {
            throw new Error(`Invalid bet amount: must be integer, got ${amount}`);
        }
        
        return true;
    }
    
    /**
     * SECURITY: Validate multipliers to prevent exploitation
     */
    static validateMultiplier(multiplier, minMultiplier = 0, maxMultiplier = 5.0) {
        if (typeof multiplier !== 'number') {
            throw new Error(`Invalid multiplier type: expected number, got ${typeof multiplier}`);
        }
        
        if (!Number.isFinite(multiplier)) {
            throw new Error(`Invalid multiplier: must be finite, got ${multiplier}`);
        }
        
        if (multiplier < minMultiplier) {
            throw new Error(`Multiplier too small: minimum ${minMultiplier}, got ${multiplier}`);
        }
        
        if (multiplier > maxMultiplier) {
            throw new Error(`Multiplier too large: maximum ${maxMultiplier}, got ${multiplier}`);
        }
        
        return true;
    }
    
    /**
     * SECURITY: Validate user IDs
     */
    static validateUserId(userId) {
        if (typeof userId !== 'string') {
            throw new Error(`Invalid userId type: expected string, got ${typeof userId}`);
        }
        
        if (userId.length === 0) {
            throw new Error('UserId cannot be empty');
        }
        
        // Discord snowflake validation (17-20 digits)
        if (!/^\d{17,20}$/.test(userId)) {
            throw new Error(`Invalid userId format: ${userId}`);
        }
        
        return true;
    }
    
    /**
     * SECURITY: Validate guild IDs
     */
    static validateGuildId(guildId) {
        if (!guildId) {
            throw new Error('GuildId is required');
        }
        
        if (typeof guildId !== 'string') {
            throw new Error(`Invalid guildId type: expected string, got ${typeof guildId}`);
        }
        
        // Discord snowflake validation
        if (!/^\d{17,20}$/.test(guildId)) {
            throw new Error(`Invalid guildId format: ${guildId}`);
        }
        
        return true;
    }
    
    /**
     * SECURITY: Validate roulette bet types and outcomes
     */
    static validateRouletteBet(betType, outcome) {
        const validBetTypes = [
            'straight', 'split', 'street', 'corner', 'line', 'dozen', 'column',
            'red', 'black', 'odd', 'even', 'low', 'high'
        ];
        
        if (!validBetTypes.includes(betType)) {
            throw new Error(`Invalid roulette bet type: ${betType}`);
        }
        
        // Validate outcome for roulette
        this.validateRouletteOutcome(outcome);
        
        return true;
    }
    
    /**
     * SECURITY: Validate roulette outcomes
     */
    static validateRouletteOutcome(outcome) {
        const validOutcomes = [0, '00', ...Array.from({length: 36}, (_, i) => i + 1)];
        
        if (!validOutcomes.includes(outcome)) {
            throw new Error(`Invalid roulette outcome: ${outcome}`);
        }
        
        return true;
    }
    
    /**
     * SECURITY: Validate blackjack card ranks
     */
    static validateCardRank(rank) {
        const validRanks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        
        if (!validRanks.includes(rank)) {
            throw new Error(`Invalid card rank: ${rank}`);
        }
        
        return true;
    }
    
    /**
     * SECURITY: Validate blackjack card suits
     */
    static validateCardSuit(suit) {
        const validSuits = ['♠️', '♥️', '♦️', '♣️'];
        
        if (!validSuits.includes(suit)) {
            throw new Error(`Invalid card suit: ${suit}`);
        }
        
        return true;
    }
    
    /**
     * SECURITY: Validate plinko drop positions
     */
    static validatePlinkoPosition(position) {
        if (typeof position !== 'number') {
            throw new Error(`Invalid position type: expected number, got ${typeof position}`);
        }
        
        if (!Number.isInteger(position)) {
            throw new Error(`Invalid position: must be integer, got ${position}`);
        }
        
        if (position < 1 || position > 9) {
            throw new Error(`Invalid position: must be 1-9, got ${position}`);
        }
        
        return true;
    }
    
    /**
     * SECURITY: Validate slots symbols
     */
    static validateSlotSymbol(symbol) {
        const validSymbols = [
            'cherries', 'lemon', 'orange', 'grapes', 'watermelon', 
            'bar', 'seven', 'diamond', 'buffalo', 'jackpot'
        ];
        
        if (typeof symbol !== 'string') {
            throw new Error(`Invalid symbol type: expected string, got ${typeof symbol}`);
        }
        
        if (!validSymbols.includes(symbol)) {
            throw new Error(`Invalid slot symbol: ${symbol}`);
        }
        
        return true;
    }
    
    /**
     * SECURITY: Validate crash game modes
     */
    static validateCrashMode(mode) {
        const validModes = ['safe', 'balanced', 'risky', 'extreme'];
        
        if (typeof mode !== 'string') {
            throw new Error(`Invalid mode type: expected string, got ${typeof mode}`);
        }
        
        if (!validModes.includes(mode)) {
            throw new Error(`Invalid crash mode: ${mode}`);
        }
        
        return true;
    }
    
    /**
     * SECURITY: Validate timestamps to prevent timing attacks
     */
    static validateTimestamp(timestamp, maxAge = 10000) { // 10 seconds max age
        if (typeof timestamp !== 'number') {
            throw new Error(`Invalid timestamp type: expected number, got ${typeof timestamp}`);
        }
        
        if (!Number.isInteger(timestamp)) {
            throw new Error(`Invalid timestamp: must be integer, got ${timestamp}`);
        }
        
        if (timestamp <= 0) {
            throw new Error(`Invalid timestamp: must be positive, got ${timestamp}`);
        }
        
        const now = Date.now();
        const age = now - timestamp;
        
        // Check if timestamp is too old
        if (age > maxAge) {
            throw new Error(`Timestamp too old: age ${age}ms exceeds maximum ${maxAge}ms`);
        }
        
        // Check if timestamp is in the future (with small tolerance)
        if (age < -1000) { // 1 second tolerance for clock skew
            throw new Error(`Timestamp in future: ${timestamp} vs ${now}`);
        }
        
        return true;
    }
    
    /**
     * SECURITY: Validate game session data
     */
    static validateGameSession(sessionData) {
        if (!sessionData || typeof sessionData !== 'object') {
            throw new Error('Invalid session data: must be object');
        }
        
        // Validate required fields
        this.validateUserId(sessionData.userId);
        this.validateGuildId(sessionData.guildId);
        
        if (sessionData.betAmount !== undefined) {
            this.validateBetAmount(sessionData.betAmount);
        }
        
        if (sessionData.gameType) {
            const validGameTypes = ['roulette', 'blackjack', 'slots', 'plinko', 'crash'];
            if (!validGameTypes.includes(sessionData.gameType)) {
                throw new Error(`Invalid game type: ${sessionData.gameType}`);
            }
        }
        
        return true;
    }
    
    /**
     * SECURITY: Validate payout calculations
     */
    static validatePayout(betAmount, multiplier, payout) {
        this.validateBetAmount(betAmount);
        this.validateMultiplier(multiplier);
        
        if (typeof payout !== 'number') {
            throw new Error(`Invalid payout type: expected number, got ${typeof payout}`);
        }
        
        if (!Number.isFinite(payout)) {
            throw new Error(`Invalid payout: must be finite, got ${payout}`);
        }
        
        if (payout < 0) {
            throw new Error(`Invalid payout: must be non-negative, got ${payout}`);
        }
        
        // Calculate expected payout and validate
        const expectedPayout = Math.floor(betAmount * multiplier);
        if (Math.abs(payout - expectedPayout) > 1) { // Allow 1 unit tolerance for rounding
            throw new Error(`Payout calculation mismatch: expected ${expectedPayout}, got ${payout}`);
        }
        
        return true;
    }
    
    /**
     * SECURITY: Safe validation wrapper that logs errors
     */
    static safeValidate(validationFn, ...args) {
        try {
            return validationFn.apply(this, args);
        } catch (error) {
            logger.warn(`Input validation failed: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * SECURITY: Batch validation for multiple inputs
     */
    static validateBatch(validations) {
        const errors = [];
        
        for (const [name, validationFn, ...args] of validations) {
            try {
                validationFn.apply(this, args);
            } catch (error) {
                errors.push(`${name}: ${error.message}`);
            }
        }
        
        if (errors.length > 0) {
            throw new Error(`Validation failed: ${errors.join('; ')}`);
        }
        
        return true;
    }
}

module.exports = GameInputValidator;