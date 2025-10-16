/**
 * CEELO Game Logic - Traditional Chinese Dice Game (4-5-6)
 * Player and house each roll 3 dice, hand rankings determine winner
 * 1:1 even money payouts with natural house edge from game mechanics
 */

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const dbManager = require('../UTILS/database');
const sessionManager = require('../UTILS/sessionManager');
const { fmt } = require('../UTILS/common');
const logger = require('../UTILS/logger');
const { secureRandomDiceMultiple } = require('../UTILS/rng');
const Canvas = require('canvas');
const path = require('path');
const comprehensiveLogger = require('../UTILS/comprehensiveLogger');
const uasDataExporter = require('../UTILS/uasDataExporter');
// UNIVERSAL GAME INTEGRATION - ALL SYSTEMS
const UniversalGameIntegrator = require('../UTILS/UniversalGameIntegrator');
const securityLogger = require('../UTILS/securityLogger');
const sessionGuard = require('../UTILS/sessionGuard');
const transparentPayoutManager = require('../UTILS/transparentPayoutManager');
const tuningManager = require('../UTILS/tuningManager');
const { secureRandomFloat, secureRandomInt, secureRandomBytes } = require('../UTILS/rng');

// Initialize game integrator
const gameIntegrator = new UniversalGameIntegrator('ceelo');


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
    MIXED_NUMBERS: 1      // Mixed numbers (no special combination)
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
        this.client = client || null;
        
        try {
            // Get mode configuration from session metadata
            const session = sessionManager.getSession(this.sessionId);
            const modeConfig = session?.metadata?.modeConfig || { evenMoneyMultiplier: 1.0 };
            
            // Roll dice for both player and house
            this.rollDice();
            
            // Evaluate hands
            this.playerHand = this.evaluateHand(this.playerDice);
            this.houseHand = this.evaluateHand(this.houseDice);
            
            // Determine winner
            this.determineWinner();
            
            // Calculate payout using mode-specific multiplier
            if (this.winner === 'player') {
                // Use mode-specific multiplier - this is TOTAL payout, not added to bet
                const multiplier = modeConfig.evenMoneyMultiplier; // Direct multiplier of bet amount
                this.payout = this.betAmount * multiplier;
            } else if (this.winner === 'tie') {
                // Ties return most of the bet (small house edge)
                this.payout = this.betAmount * 1.0; // FIXED: Return full bet on tie (fair)
            } else {
                this.payout = 0; // No payout on loss
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
     * Roll 3 dice for both player and house using CSPRNG
     */
    rollDice() {
        // CSPRNG dice rolls for player
        this.playerDice = secureRandomDiceMultiple(3, 6).sort((a, b) => a - b);
        
        // CSPRNG dice rolls for house
        this.houseDice = secureRandomDiceMultiple(3, 6).sort((a, b) => a - b);
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
        
        // Mixed numbers (no valid combination)
        return {
            type: 'MIXED_NUMBERS',
            ranking: HAND_RANKINGS.MIXED_NUMBERS,
            description: 'Mixed Numbers',
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
            if (this.playerHand.ranking === HAND_RANKINGS.MIXED_NUMBERS) {
                // For mixed number hands, lowest total wins
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
     * Create dice image showing both player and house rolls
     */
    async createDiceImage() {
        try {
            const canvas = Canvas.createCanvas(900, 700);
            const ctx = canvas.getContext('2d');
            
            // Set background with elegant green gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, '#1B4332');   // Deep forest green
            gradient.addColorStop(0.5, '#2D5A3B'); // Mid green
            gradient.addColorStop(1, '#1B4332');   // Deep forest green
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Add elegant border with rounded corners
            ctx.strokeStyle = '#52B788';  // Bright accent green
            ctx.lineWidth = 4;
            ctx.setLineDash([]);
            
            // Rounded rectangle background
            const cornerRadius = 20;
            ctx.beginPath();
            ctx.moveTo(cornerRadius, 0);
            ctx.lineTo(canvas.width - cornerRadius, 0);
            ctx.quadraticCurveTo(canvas.width, 0, canvas.width, cornerRadius);
            ctx.lineTo(canvas.width, canvas.height - cornerRadius);
            ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - cornerRadius, canvas.height);
            ctx.lineTo(cornerRadius, canvas.height);
            ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - cornerRadius);
            ctx.lineTo(0, cornerRadius);
            ctx.quadraticCurveTo(0, 0, cornerRadius, 0);
            ctx.closePath();
            ctx.stroke();
            
            const diceSize = 180;
            const margin = 50;
            
            // Center calculations for both dice rows
            const totalDiceWidth = (3 * diceSize) + (2 * margin);
            const startX = (canvas.width - totalDiceWidth) / 2;
            
            // Player section with enhanced styling
            ctx.fillStyle = '#95D5B2';  // Light mint green
            ctx.font = 'bold 22px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 3;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            
            // Add player icon and text with more space
            const playerIcon = '👤';
            const playerText = `${playerIcon} YOUR ROLL`;
            const playerTextWidth = ctx.measureText(playerText).width;
            const playerTextX = (canvas.width - playerTextWidth) / 2;
            ctx.fillText(playerText, playerTextX, 35);
            
            // Reset shadow for dice
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            // Player dice with enhanced styling - centered with more spacing
            for (let i = 0; i < this.playerDice.length; i++) {
                const dice = this.playerDice[i];
                const filename = dice === 1 ? '1_dot.png' : `${dice}_dots.png`;
                const diceImage = await Canvas.loadImage(path.join(__dirname, '..', 'assets', 'dice_faces', filename));
                const x = startX + (i * (diceSize + margin));
                const y = 70;
                
                // Enhanced shadow with green tint
                ctx.fillStyle = 'rgba(27, 67, 50, 0.4)';
                ctx.fillRect(x + 6, y + 6, diceSize, diceSize);
                
                // White background for dice
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(x, y, diceSize, diceSize);
                
                // Draw dice with slight border
                ctx.strokeStyle = '#D6F5D6';
                ctx.lineWidth = 4;
                ctx.strokeRect(x, y, diceSize, diceSize);
                
                ctx.drawImage(diceImage, x, y, diceSize, diceSize);
            }
            
            // Add visual separator line with much more space
            ctx.strokeStyle = '#52B788';
            ctx.lineWidth = 4;
            ctx.setLineDash([10, 15]);
            ctx.beginPath();
            ctx.moveTo(70, 350);
            ctx.lineTo(canvas.width - 70, 350);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // House section with enhanced styling
            ctx.fillStyle = '#FB8500';  // Warm orange for house
            ctx.font = 'bold 22px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 3;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            
            // Add house icon and text with much more space
            const houseIcon = '🏠';
            const houseText = `${houseIcon} HOUSE ROLL`;
            const houseTextWidth = ctx.measureText(houseText).width;
            const houseTextX = (canvas.width - houseTextWidth) / 2;
            ctx.fillText(houseText, houseTextX, 410);
            
            // Reset shadow for dice
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            // House dice with enhanced styling - centered with much more spacing
            for (let i = 0; i < this.houseDice.length; i++) {
                const dice = this.houseDice[i];
                const filename = dice === 1 ? '1_dot.png' : `${dice}_dots.png`;
                const diceImage = await Canvas.loadImage(path.join(__dirname, '..', 'assets', 'dice_faces', filename));
                const x = startX + (i * (diceSize + margin));
                const y = 440;
                
                // Enhanced shadow with orange tint
                ctx.fillStyle = 'rgba(251, 133, 0, 0.3)';
                ctx.fillRect(x + 6, y + 6, diceSize, diceSize);
                
                // White background for dice
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(x, y, diceSize, diceSize);
                
                // Draw dice with slight border
                ctx.strokeStyle = '#FFE5CC';
                ctx.lineWidth = 4;
                ctx.strokeRect(x, y, diceSize, diceSize);
                
                ctx.drawImage(diceImage, x, y, diceSize, diceSize);
            }
            
            return canvas.toBuffer();
        } catch (error) {
            logger.error(`Failed to create dice image: ${error.message}`);
            return null;
        }
    }

    /**
     * Show game results
     */
    async showResults(interaction) {
        try {
            const won = this.winner === 'player';
            const tie = this.winner === 'tie';
            const netChange = won ? (this.payout - this.betAmount) : tie ? 0 : -this.betAmount;
            
            // Comprehensive logging for game result
            await comprehensiveLogger.logGame(this.userId, this.username || 'Player', 'ceelo', 
                won ? 'WIN' : tie ? 'TIE' : 'LOSS', {
                betAmount: this.betAmount,
                payout: this.payout,
                netChange: netChange,
                playerDice: this.playerDice,
                houseDice: this.houseDice,
                playerHand: this.playerHand.description,
                houseHand: this.houseHand.description,
                winner: this.winner,
                timing: 'game_complete'
            }).catch(err => logger.error('Logging error:', err));
            
            // Log economic impact
            if (won) {
                await comprehensiveLogger.logEconomic('CEELO_WIN_PAYOUT', 'NORMAL', `Player won ${fmt(this.payout)} from ceelo game`, {
                    userId: this.userId,
                    username: this.username,
                    betAmount: this.betAmount,
                    winnings: this.payout,
                    netProfit: netChange,
                    playerHand: this.playerHand.description,
                    houseHand: this.houseHand.description,
                    gameType: 'ceelo'
                }).catch(err => logger.error('Logging error:', err));
            } else if (!tie) {
                await comprehensiveLogger.logEconomic('CEELO_LOSS', 'NORMAL', `Player lost ${fmt(this.betAmount)} to ceelo game`, {
                    userId: this.userId,
                    username: this.username,
                    betAmount: this.betAmount,
                    lossAmount: this.betAmount,
                    playerHand: this.playerHand.description,
                    houseHand: this.houseHand.description,
                    gameType: 'ceelo'
                }).catch(err => logger.error('Logging error:', err));
            } else {
                await comprehensiveLogger.logEconomic('CEELO_TIE_REFUND', 'NORMAL', `Player tied ceelo game, bet refunded`, {
                    userId: this.userId,
                    username: this.username,
                    betAmount: this.betAmount,
                    refundAmount: this.betAmount,
                    playerHand: this.playerHand.description,
                    houseHand: this.houseHand.description,
                    gameType: 'ceelo'
                }).catch(err => logger.error('Logging error:', err));
            }
            
            // Create result embed
            const embed = this.createResultEmbed();
            
            // Create dice image
            const diceImageBuffer = await this.createDiceImage();
            
            // Process payout using GameResult object
            const gameResult = new GameResult({
                userId: this.userId,
                guildId: this.guildId,
                gameType: GameType.CEELO,
                betAmount: this.betAmount,
                payout: this.payout,
                won: won,
                metadata: {
                    playerDice: this.playerDice,
                    houseDice: this.houseDice,
                    playerHand: this.playerHand.description,
                    houseHand: this.houseHand.description,
                    winner: this.winner
                }
            });

            // Process payout for wins and ties (refunds)
            if (this.payout > 0) {
                await PayoutManager.processGamePayout(gameResult);
            }

            // Update session as completed
            await sessionManager.updateSession(this.sessionId, { state: 'completed' });

            // Log game result
            await dbManager.recordGameResult(
                this.userId, 
                this.guildId, 
                GameType.CEELO, 
                won, 
                this.betAmount, 
                this.payout,
                {
                    playerDice: this.playerDice,
                    houseDice: this.houseDice,
                    playerHand: this.playerHand.description,
                    houseHand: this.houseHand.description,
                    winner: this.winner
                }
            );

            // 🔗 EXPORT TO UAS BOT FOR CENTRALIZED ANALYSIS
            await uasDataExporter.exportGameResult({
                gameType: 'ceelo',
                userId: this.userId,
                guildId: this.guildId,
                betAmount: this.betAmount,
                payout: this.payout,
                won: won,
                multiplier: this.payout > 0 ? this.payout / this.betAmount : 0,
                metadata: {
                    playerDice: this.playerDice,
                    houseDice: this.houseDice,
                    playerHand: this.playerHand.description,
                    houseHand: this.houseHand.description,
                    winner: this.winner,
                    gameLength: Date.now() - this.startTime
                }
            });

            // Send final result with dice image
            const replyData = {
                embeds: [embed],
                components: []
            };
            
            if (diceImageBuffer) {
                const attachment = new AttachmentBuilder(diceImageBuffer, { name: 'ceelo-dice.png' });
                replyData.files = [attachment];
                embed.setImage('attachment://ceelo-dice.png');
            }
            
            await interaction.editReply(replyData);
            
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
     * Create result embed with clear explanations
     */
    createResultEmbed() {
        const won = this.winner === 'player';
        const tie = this.winner === 'tie';
        
        // Check for playfor context
        const playForRecipient = global.playForContext?.recipientName;
        const winningForSomeoneElse = playForRecipient && global.playForContext.recipientId;
        
        // Create simple explanation of what happened
        let whatHappened = '';
        if (won) {
            if (winningForSomeoneElse) {
                whatHappened = `🎉 **WIN FOR @${playForRecipient}!** Your ${this.playerHand.description} beat the house's ${this.houseHand.description}.\n` +
                              `You win your bet back plus an equal amount (1:1 payout) = ${fmt(this.payout)} for @${playForRecipient}!`;
            } else {
                whatHappened = `🎉 **YOU WON!** Your ${this.playerHand.description} beat the house's ${this.houseHand.description}.\n` +
                              `You win your bet back plus an equal amount (1:1 payout) = ${fmt(this.payout)}!`;
            }
        } else if (tie) {
            whatHappened = `🤝 **TIE GAME!** Both you and the house rolled ${this.playerHand.description}.\n` +
                          `Your bet is refunded - no winner, no loser.`;
        } else {
            whatHappened = `❌ **House Won.** The house's ${this.houseHand.description} beat your ${this.playerHand.description}.\n` +
                          `Better luck next roll!`;
        }
        
        let topFields = [
            {
                name: '🎯 YOUR DICE',
                value: `${this.playerDice.map(d => `⚀⚁⚂⚃⚄⚅`[d-1]).join(' ')} = **${this.playerHand.description}**`,
                inline: false
            },
            {
                name: '🏠 HOUSE DICE',
                value: `${this.houseDice.map(d => `⚀⚁⚂⚃⚄⚅`[d-1]).join(' ')} = **${this.houseHand.description}**`,
                inline: false
            },
            {
                name: '📊 WHAT HAPPENED?',
                value: whatHappened,
                inline: false
            }
        ];
        
        // Add playfor field if applicable
        if (winningForSomeoneElse) {
            topFields.push({
                name: '🎁 Playing For',
                value: `@${playForRecipient}`,
                inline: true
            });
        }
        
        let title = `🎲 CEELO Results - ${tie ? 'Tie Game' : (won ? 'You Won!' : 'House Won')}`;
        if (winningForSomeoneElse && won) {
            title = `🎲 CEELO Results - Won for @${playForRecipient}!`;
        }
        
        let stageText = won ? 'WINNER!' : tie ? 'TIE GAME' : 'HOUSE WINS';
        if (winningForSomeoneElse && won) {
            stageText = `WON FOR @${playForRecipient}!`;
        }
        
        let footer = 'CEELO TIP: 4-5-6 beats everything! Then three-of-a-kind, then pairs (point = the odd die)';
        if (winningForSomeoneElse) {
            footer = `Playing for @${playForRecipient} • ` + footer;
        }
        
        return buildSessionEmbed({
            title,
            topFields,
            stageText,
            color: won ? 0x00FF00 : tie ? 0xFFAA00 : 0xFF4444,
            footer
        });
    }

    /**
     * Get hand ranking explanation for footer
     */
    getHandExplanation() {
        return '4-5-6 > Three of a Kind > Point > Mixed Numbers (lowest total wins for mixed)'
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