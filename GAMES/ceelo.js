/**
 * CEELO Game Logic - Traditional Chinese Dice Game (4-5-6)
 * Player and house each roll 3 dice, hand rankings determine winner
 * 1:1 even money payouts with natural house edge from game mechanics
 */

const { EmbedBuilder } = require('discord.js');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const dbManager = require('../UTILS/database');
const sessionManager = require('../UTILS/sessionManager');
const { fmt } = require('../UTILS/common');
const logger = require('../UTILS/logger');
const { secureRandomInt, generateProvablyFairRandom, generateAntiStreakRandom } = require('../UTILS/rng');

// CEELO Configuration
const CONFIG = {
    PAYOUT_MULTIPLIER: 1 // 1:1 even money
};

// Hand rankings (higher is better)
const HAND_RANKINGS = {
    FOUR_FIVE_SIX: 10,    // 4-5-6 (highest)
    TRIPS_6: 9,           // 6-6-6
    TRIPS_5: 8,           // 5-5-5  
    TRIPS_4: 7,           // 4-4-4
    TRIPS_3: 6,           // 3-3-3
    TRIPS_2: 5,           // 2-2-2
    TRIPS_1: 4,           // 1-1-1
    POINT: 3,             // Pair + different die (point = different die value)
    TRASH: 1              // No valid combination
};

// Dice emojis for display
const DICE_EMOJIS = {
    1: '⚀',
    2: '⚁', 
    3: '⚂',
    4: '⚃',
    5: '⚄',
    6: '⚅'
};

class CeeloGame {
    constructor(sessionId, gameConfig) {
        this.sessionId = sessionId;
        this.userId = gameConfig.userId;
        this.username = gameConfig.username;
        this.betAmount = gameConfig.betAmount;
        this.channelId = gameConfig.channelId;
        this.guildId = gameConfig.guildId;
        
        this.playerDice = [];
        this.houseDice = [];
        this.playerHand = null;
        this.houseHand = null;
        this.winner = null;
        this.payout = 0;
        
        this.client = null;
    }

    /**
     * Main game execution handler
     */
    async execute(interaction, client) {
        this.client = client;
        
        try {
            // Roll dice for both player and house
            this.rollDice();
            
            // Evaluate hands
            this.playerHand = this.evaluateHand(this.playerDice);
            this.houseHand = this.evaluateHand(this.houseDice);
            
            // Determine winner
            this.determineWinner();
            
            // Calculate payout
            if (this.winner === 'player') {
                this.payout = this.betAmount * CONFIG.PAYOUT_MULTIPLIER;
            }
            
            // Play the game and show results
            await this.showResults(interaction);
            
        } catch (error) {
            logger.error(`CEELO game execution failed: ${error.message}`);
            await this.cleanup();
            throw error;
        }
    }

    /**
     * Roll 3 dice for both player and house using advanced CSPRNG
     */
    rollDice() {
        // Generate provably fair dice rolls for player
        const playerFairRoll = generateProvablyFairRandom('ceelo_player', this.userId, 0, 216); // 6^3 = 216 combinations
        const playerRollValue = playerFairRoll.value;
        
        // Convert single value to three dice (base-6 decomposition)
        this.playerDice = [
            Math.floor(playerRollValue / 36) + 1,
            Math.floor((playerRollValue % 36) / 6) + 1,
            (playerRollValue % 6) + 1
        ].sort((a, b) => a - b);
        
        // Generate house dice with anti-streak protection (check recent player results)
        const possibleValues = [1, 2, 3, 4, 5, 6];
        this.houseDice = [
            generateAntiStreakRandom(this.playerDice, possibleValues, 2),
            secureRandomInt(1, 7),
            secureRandomInt(1, 7)
        ].sort((a, b) => a - b);
    }

    /**
     * Evaluate a hand and return its ranking and details
     */
    evaluateHand(dice) {
        const [a, b, c] = dice.sort((x, y) => x - y);
        
        // Check for 4-5-6 (automatic win)
        if (a === 4 && b === 5 && c === 6) {
            return {
                type: 'FOUR_FIVE_SIX',
                ranking: HAND_RANKINGS.FOUR_FIVE_SIX,
                description: '4-5-6 (Natural)',
                value: 456
            };
        }
        
        // Check for trips (three of a kind)
        if (a === b && b === c) {
            return {
                type: `TRIPS_${a}`,
                ranking: HAND_RANKINGS[`TRIPS_${a}`],
                description: `${a}-${a}-${a} (Trip ${a}s)`,
                value: a
            };
        }
        
        // Check for point (pair + different)
        let point = null;
        if (a === b) point = c;
        else if (b === c) point = a;
        else if (a === c) point = b;
        
        if (point !== null) {
            return {
                type: 'POINT',
                ranking: HAND_RANKINGS.POINT,
                description: `Point ${point}`,
                value: point
            };
        }
        
        // Trash (no valid combination)
        return {
            type: 'TRASH',
            ranking: HAND_RANKINGS.TRASH,
            description: 'Trash',
            value: a + b + c // Use total for tie-breaking
        };
    }

    /**
     * Determine the winner based on hand rankings
     */
    determineWinner() {
        if (this.playerHand.ranking > this.houseHand.ranking) {
            this.winner = 'player';
        } else if (this.houseHand.ranking > this.playerHand.ranking) {
            this.winner = 'house';
        } else {
            // Same ranking, compare values
            if (this.playerHand.ranking === HAND_RANKINGS.TRASH) {
                // For trash hands, lowest total wins
                this.winner = this.playerHand.value < this.houseHand.value ? 'player' : 'house';
            } else {
                // For other hands, highest value wins
                if (this.playerHand.value > this.houseHand.value) {
                    this.winner = 'player';
                } else if (this.houseHand.value > this.playerHand.value) {
                    this.winner = 'house';
                } else {
                    this.winner = 'tie';
                }
            }
        }
    }

    /**
     * Show game results
     */
    async showResults(interaction) {
        try {
            // Create result embed
            const embed = this.createResultEmbed();
            
            // Process payout if player won
            let gameResult = GameResult.LOSS;
            if (this.winner === 'player') {
                const success = await PayoutManager.processGamePayout(
                    this.userId,
                    this.guildId,
                    this.payout,
                    GameType.CEELO,
                    `CEELO win - ${this.playerHand.description} beats ${this.houseHand.description}`
                );
                gameResult = success ? GameResult.WIN : GameResult.ERROR;
            } else if (this.winner === 'tie') {
                // Refund on tie
                await PayoutManager.processGamePayout(
                    this.userId,
                    this.guildId,
                    this.betAmount,
                    GameType.CEELO,
                    'CEELO tie refund'
                );
                gameResult = GameResult.TIE;
            }

            // Update session as completed
            await sessionManager.updateSession(this.sessionId, { state: 'completed' });

            // Log game result
            await dbManager.recordGameResult(this.userId, this.guildId, GameType.CEELO, {
                betAmount: this.betAmount,
                payout: this.payout,
                result: gameResult,
                playerDice: this.playerDice,
                houseDice: this.houseDice,
                playerHand: this.playerHand.description,
                houseHand: this.houseHand.description,
                winner: this.winner
            });

            // Send final result
            await interaction.editReply({
                embeds: [embed],
                components: []
            });
            
            // Cleanup after showing result
            setTimeout(() => {
                this.cleanup();
            }, 30000);

        } catch (error) {
            logger.error(`CEELO show results failed: ${error.message}`);
            await this.cleanup();
            throw error;
        }
    }

    /**
     * Create result embed
     */
    createResultEmbed() {
        const won = this.winner === 'player';
        const tie = this.winner === 'tie';
        
        // Format dice displays
        const playerDiceDisplay = this.playerDice.map(die => DICE_EMOJIS[die]).join(' ');
        const houseDiceDisplay = this.houseDice.map(die => DICE_EMOJIS[die]).join(' ');
        
        let resultText = '';
        let color = 0xFF4444; // Default to loss red
        let stageText = 'HOUSE WINS';
        
        if (won) {
            resultText = `🎉 **YOU WIN!**\nYour ${this.playerHand.description} beats House ${this.houseHand.description}`;
            color = 0x00FF00;
            stageText = 'WINNER!';
        } else if (tie) {
            resultText = `🤝 **TIE GAME**\nBoth rolled ${this.playerHand.description} - Bet refunded`;
            color = 0xFFAA00;
            stageText = 'TIE - REFUNDED';
        } else {
            resultText = `😔 **HOUSE WINS**\nHouse ${this.houseHand.description} beats your ${this.playerHand.description}`;
        }
        
        return buildSessionEmbed({
            title: `🎲 CEELO - ${tie ? 'TIE' : (won ? 'WINNER!' : 'HOUSE WINS')}`,
            topFields: [
                {
                    name: '🎯 YOUR ROLL',
                    value: `${playerDiceDisplay}\n**${this.playerHand.description}**`,
                    inline: true
                },
                {
                    name: '🏠 HOUSE ROLL', 
                    value: `${houseDiceDisplay}\n**${this.houseHand.description}**`,
                    inline: true
                },
                {
                    name: '📊 RESULT',
                    value: `${resultText}\n\n**Bet:** ${fmt(this.betAmount)}\n**Payout:** ${fmt(this.payout)}`,
                    inline: false
                }
            ],
            stageText: stageText,
            color: color,
            footer: this.getHandExplanation()
        });
    }

    /**
     * Get hand ranking explanation for footer
     */
    getHandExplanation() {
        return '4-5-6 > Trips > Point > Trash (lowest total wins for trash)';
    }

    /**
     * Cleanup game resources
     */
    async cleanup() {
        try {
            await sessionManager.endSession(this.sessionId, 'CEELO game completed');
        } catch (error) {
            logger.error(`CEELO cleanup failed: ${error.message}`);
        }
    }
}

/**
 * Main game handler function
 */
async function handleCeeloGame(interaction, client, sessionId, gameConfig) {
    const game = new CeeloGame(sessionId, gameConfig);
    await game.execute(interaction, client);
}

module.exports = {
    handleCeeloGame,
    CeeloGame,
    HAND_RANKINGS,
    CONFIG
};