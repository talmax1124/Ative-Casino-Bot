/**
 * Plinko Game Implementation for ATIVE Casino Bot
 * Converted from Python plinko.py with multiple difficulty modes
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { secureRandomInt, secureRandomFloat, secureRandomBytes } = require('../UTILS/rng');
const { fmt, sendLogMessage } = require('../UTILS/common');
const logger = require('../UTILS/logger');
const adaptiveGameMechanics = require('../UTILS/adaptiveGameMechanics');

class PlinkoGameSession {
    constructor(userId, username, betAmount, channelId, mode = 'easy', currentWealth = 0) {
        this.userId = userId;
        this.username = username;
        this.betAmount = betAmount;
        this.channelId = channelId;
        this.mode = mode;
        this.gameActive = true;
        this.createdAt = Date.now();
        this.dropPosition = null;
        this.result = null;
        this.winAmount = 0;
        this.currentWealth = currentWealth;
        
        // UPDATED BALANCED MULTIPLIERS - ECONOMICALLY BALANCED
        // Most slots should result in losses to maintain house edge
        this.baseModes = {
            easy: {
                name: '🟢 Easy',
                description: 'Lower risk, moderate rewards (~15% house edge)',
                multipliers: [0.2, 0.4, 0.6, 0.8, 1.2, 0.8, 0.6, 0.4, 0.2], // Max 1.2x multiplier
                maxMultiplier: 1.2
            },
            medium: {
                name: '🟡 Medium', 
                description: 'Balanced risk and reward (~20% house edge)',
                multipliers: [0.1, 0.2, 0.3, 0.5, 0.8, 1.0, 1.5, 1.0, 0.8], // Max 1.5x multiplier
                maxMultiplier: 1.5
            },
            hard: {
                name: '🔴 Hard',
                description: 'High risk, high reward (~25% house edge)',
                multipliers: [0.0, 0.1, 0.2, 0.3, 0.5, 0.8, 1.8, 0.8, 0.5], // Max 1.8x multiplier
                maxMultiplier: 1.8
            },
            nightmare: {
                name: '💀 Nightmare',
                description: 'Maximum risk for maximum reward (~30% house edge)',
                multipliers: [0.0, 0.0, 0.1, 0.2, 0.3, 0.4, 2.0, 0.4, 0.3], // Max 2.0x multiplier
                maxMultiplier: 2.0
            }
        };
        
        // Use fixed modes (no more dynamic multipliers)
        this.modes = this.baseModes;
        
        // Board will be generated when needed
    }

    /**
     * Get final multipliers with adaptive adjustment for player wealth
     * Automatically adjusts multipliers based on wealth while keeping them honest
     * SECURITY: Enhanced with comprehensive validation and caps
     */
    async getFinalMultipliers() {
        let multipliers;
        
        try {
            // Get adaptive multipliers based on player wealth
            const adaptedMultipliers = await adaptiveGameMechanics.getAdaptedPlinkoMultipliers(
                this.userId, 
                this.currentWealth, 
                this.betAmount
            );
            
            // Apply to the selected mode if we got adapted multipliers
            if (adaptedMultipliers && Array.isArray(adaptedMultipliers) && adaptedMultipliers.length > 0) {
                multipliers = adaptedMultipliers;
            } else {
                // Fallback to fixed multipliers for the selected mode
                multipliers = [...this.modes[this.mode].multipliers]; // Create copy to avoid mutation
            }
        } catch (adaptError) {
            logger.warn(`Error getting adaptive multipliers: ${adaptError.message}, using fallback`);
            multipliers = [...this.modes[this.mode].multipliers];
        }
        
        // CRITICAL SECURITY: Validate and cap ALL multipliers to prevent exploitation
        const ABSOLUTE_MAX_MULTIPLIER = 3.0; // Hard cap - NO EXCEPTIONS
        const validatedMultipliers = multipliers.map((multiplier, index) => {
            // Validate multiplier is a finite positive number
            if (!Number.isFinite(multiplier) || multiplier < 0) {
                logger.warn(`SECURITY: Invalid multiplier at position ${index}: ${multiplier}, using 0.0`);
                return 0.0;
            }
            
            // Cap multiplier to prevent exploitation
            const originalMultiplier = multiplier;
            const cappedMultiplier = Math.min(multiplier, ABSOLUTE_MAX_MULTIPLIER);
            
            if (originalMultiplier > ABSOLUTE_MAX_MULTIPLIER) {
                logger.warn(`SECURITY: Plinko multiplier capped from ${originalMultiplier} to ${cappedMultiplier} at position ${index}`);
            }
            
            return cappedMultiplier;
        });
        
        // SECURITY: Ensure we have the correct number of multipliers (9 for plinko)
        if (validatedMultipliers.length !== 9) {
            logger.error(`SECURITY: Invalid multiplier array length: ${validatedMultipliers.length}, expected 9. Using fallback.`);
            return this.modes[this.mode].multipliers.map(m => Math.min(m, ABSOLUTE_MAX_MULTIPLIER));
        }
        
        return validatedMultipliers;
    }

    async generateBoard() {
        // Generate a text-based Plinko board representation
        const rows = 10;
        const board = [];
        
        // Generate the board structure
        for (let row = 0; row < rows; row++) {
            let line = '';
            const spaces = rows - row;
            
            // Add leading spaces
            line += ' '.repeat(spaces);
            
            // Add pegs (represented by dots)
            for (let col = 0; col <= row; col++) {
                line += '� ';
            }
            
            board.push(line.trim());
        }
        
        // Add the bottom slots with adaptive multipliers
        const multipliers = await this.getFinalMultipliers();
        let bottomLine = '';
        for (let i = 0; i < multipliers.length; i++) {
            bottomLine += `${multipliers[i]}x `;
        }
        board.push(bottomLine.trim());
        
        return board;
    }

    async simulateDrop(dropPosition) {
        // SECURITY: Validate drop position
        if (!Number.isInteger(dropPosition) || dropPosition < 0 || dropPosition >= 9) {
            throw new Error(`Invalid drop position: ${dropPosition}. Must be 0-8.`);
        }
        
        // Simulate ball drop physics with PROPER RANDOMIZATION
        let position = dropPosition;
        const path = [position];
        
        // SECURITY: Get validated multipliers with caps already applied
        const multipliers = await this.getFinalMultipliers();
        
        // SECURITY: Validate multipliers array
        if (!Array.isArray(multipliers) || multipliers.length !== 9) {
            throw new Error(`Invalid multipliers array: ${multipliers}`);
        }
        
        // Simulate bounces down the board - PURE RANDOM, NO MANIPULATION
        for (let row = 1; row < 10; row++) {
            // True 50/50 chance to bounce left or right using CSPRNG
            const bounce = secureRandomInt(0, 2);
            
            // SECURITY: Validate random value
            if (!Number.isInteger(bounce) || bounce < 0 || bounce >= 2) {
                logger.warn(`Invalid random bounce value: ${bounce}, using fallback`);
                // Fallback to safer random method
                const fallbackBounce = gameIntegrator.secureRandom() < 0.5 ? 0 : 1;
                bounce = fallbackBounce;
            }
            
            if (bounce === 0 && position > 0) {
                position -= 1; // Bounce left
            } else if (bounce === 1 && position < row) {
                position += 1; // Bounce right
            }
            
            // Clamp position to valid range with extra validation
            position = Math.max(0, Math.min(position, row));
            
            // SECURITY: Validate position is within bounds
            if (!Number.isInteger(position) || position < 0 || position > row) {
                logger.error(`Invalid position during bounce: ${position} at row ${row}`);
                position = Math.max(0, Math.min(dropPosition, row)); // Reset to safe position
            }
            
            path.push(position);
        }
        
        // Final slot is determined by last position with bounds checking
        const finalSlot = Math.max(0, Math.min(position, multipliers.length - 1));
        
        // SECURITY: Validate final slot
        if (!Number.isInteger(finalSlot) || finalSlot < 0 || finalSlot >= multipliers.length) {
            throw new Error(`Invalid final slot: ${finalSlot}. Array length: ${multipliers.length}`);
        }
        
        let multiplier = multipliers[finalSlot];
        
        // SECURITY: Final validation of multiplier (should already be capped by getFinalMultipliers)
        const ABSOLUTE_MAX_MULTIPLIER = 3.0;
        if (!Number.isFinite(multiplier) || multiplier < 0) {
            logger.error(`CRITICAL: Invalid multiplier at slot ${finalSlot}: ${multiplier}, using 0.0`);
            multiplier = 0.0;
        } else if (multiplier > ABSOLUTE_MAX_MULTIPLIER) {
            logger.error(`CRITICAL: Multiplier exceeded cap at slot ${finalSlot}: ${multiplier}, capping to ${ABSOLUTE_MAX_MULTIPLIER}`);
            multiplier = ABSOLUTE_MAX_MULTIPLIER;
        }
        
        // SECURITY: Validate bet amount before calculation
        if (!Number.isFinite(this.betAmount) || this.betAmount <= 0) {
            throw new Error(`Invalid bet amount: ${this.betAmount}`);
        }
        
        const winnings = Math.round((this.betAmount * multiplier) * 100) / 100;
        
        // SECURITY: Validate winnings calculation
        if (!Number.isFinite(winnings) || winnings < 0) {
            logger.error(`Invalid winnings calculation: ${winnings} (bet: ${this.betAmount}, multiplier: ${multiplier})`);
            throw new Error('Winnings calculation error');
        }
        
        // SECURITY: Cap maximum possible winnings to prevent exploitation
        const maxPossibleWinnings = this.betAmount * ABSOLUTE_MAX_MULTIPLIER;
        const cappedWinnings = Math.min(winnings, maxPossibleWinnings);
        
        if (winnings > maxPossibleWinnings) {
            logger.error(`CRITICAL: Winnings exceeded maximum possible: ${winnings} > ${maxPossibleWinnings}, capping`);
        }
        
        // Log suspicious high wins for monitoring (lowered threshold due to security cap)
        if (multiplier >= 2.5) {
            logger.warn(`Plinko High Win Alert: User ${this.userId} hit ${multiplier}x multiplier on ${this.mode} mode`);
            
            // Log to security system
            try {
                const securityLogger = require('../UTILS/securityLogger');
                securityLogger.logSecurityEvent(this.userId, 'GAME_HIGH_WIN', {
                    game: 'plinko',
                    mode: this.mode,
                    multiplier: multiplier,
                    betAmount: this.betAmount,
                    winnings: cappedWinnings,
                    finalSlot: finalSlot
                });
            } catch (secLogError) {
                logger.error(`Security logging error: ${secLogError.message}`);
            }
        }
        
        // Log all zero multiplier hits (total losses)
        if (multiplier === 0.0) {
            logger.info(`Plinko Total Loss: User ${this.userId} lost entire bet on ${this.mode} mode`);
        }
        
        return {
            path,
            finalSlot,
            multiplier,
            winnings: cappedWinnings,
            profit: cappedWinnings - this.betAmount,
            mode: this.mode,
            betAmount: this.betAmount
        };
    }

    getModeSelectionEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('<� Plinko - Select Difficulty')
            .setDescription(`**Bet Amount:** ${fmt(this.betAmount)}\n\nChoose your risk level:`)
            .setColor(0x00FF00)
            .setThumbnail('https://i.imgur.com/plinko.png');

        // Add fields for each mode
        Object.keys(this.modes).forEach(key => {
            const mode = this.modes[key];
            embed.addFields({
                name: mode.name,
                value: `${mode.description}\n**Max Multiplier:** ${mode.maxMultiplier}x`,
                inline: true
            });
        });

        embed.setFooter({ text: 'Select a difficulty mode to continue' });
        return embed;
    }

    async getDropSelectionEmbed() {
        const mode = this.modes[this.mode];
        const embed = new EmbedBuilder()
            .setTitle(`<� Plinko - ${mode.name}`)
            .setDescription(`**Bet Amount:** ${fmt(this.betAmount)}\n**Mode:** ${mode.description}\n\nSelect where to drop the ball:`)
            .setColor(this.getModeColor())
            .setThumbnail('https://i.imgur.com/plinko.png');

        // Show the board with adaptive multipliers
        const board = await this.generateBoard();
        const boardText = '```\n' + board.join('\n') + '\n```';
        embed.addFields({
            name: '<� Plinko Board',
            value: boardText,
            inline: false
        });

        // Show adaptive multipliers (honest display)
        const multipliers = await this.getFinalMultipliers();
        const multiplierText = multipliers.map((m, i) => `${i + 1}: ${m}x`).join(' | ');
        embed.addFields({
            name: '=� Slot Multipliers',
            value: `\`${multiplierText}\``,
            inline: false
        });

        embed.setFooter({ text: 'Choose position 1-9 to drop the ball' });
        return embed;
    }

    getResultEmbed(result) {
        const mode = this.modes[this.mode];
        const isWin = result.profit > 0;
        const color = isWin ? 0x00FF00 : result.profit === 0 ? 0xFFFF00 : 0xFF0000;
        
        const embed = new EmbedBuilder()
            .setTitle(`<� Plinko Result - ${mode.name}`)
            .setColor(color)
            .setThumbnail('https://i.imgur.com/plinko.png');

        // Result summary
        const resultText = [
            `**Drop Position:** ${this.dropPosition}`,
            `**Final Slot:** ${result.finalSlot + 1}`,
            `**Multiplier:** ${result.multiplier}x`,
            `**Bet Amount:** ${fmt(this.betAmount)}`,
            `**Winnings:** ${fmt(result.winnings)}`,
            `**Profit:** ${result.profit >= 0 ? '+' : ''}${fmt(result.profit)}`
        ].join('\n');

        embed.setDescription(resultText);

        // Add result emoji
        if (result.profit > 0) {
            embed.addFields({
                name: '<� Congratulations!',
                value: `You won ${fmt(result.winnings)}!`,
                inline: false
            });
        } else if (result.profit === 0) {
            embed.addFields({
                name: '= Break Even',
                value: 'You got your bet back!',
                inline: false
            });
        } else {
            embed.addFields({
                name: '=" Better Luck Next Time',
                value: `You lost ${fmt(Math.abs(result.profit))}`,
                inline: false
            });
        }

        embed.setFooter({ text: 'Thanks for playing Plinko!' });
        return embed;
    }

    getModeColor() {
        const colors = {
            easy: 0x00FF00,    // Green
            medium: 0xFFFF00,  // Yellow
            hard: 0xFF8800,    // Orange
            nightmare: 0xFF0000 // Red
        };
        return colors[this.mode] || 0x00FF00;
    }

    createModeSelectionButtons() {
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`plinko_mode_easy_${this.channelId}`)
                    .setLabel('=� Easy')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`plinko_mode_medium_${this.channelId}`)
                    .setLabel('=� Medium')
                    .setStyle(ButtonStyle.Primary)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`plinko_mode_hard_${this.channelId}`)
                    .setLabel('=� Hard')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`plinko_mode_nightmare_${this.channelId}`)
                    .setLabel('=4 Nightmare')
                    .setStyle(ButtonStyle.Danger)
            );

        return [row1, row2];
    }

    createDropPositionButtons() {
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`plinko_drop_1_${this.channelId}`)
                    .setLabel('1')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`plinko_drop_2_${this.channelId}`)
                    .setLabel('2')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`plinko_drop_3_${this.channelId}`)
                    .setLabel('3')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`plinko_drop_4_${this.channelId}`)
                    .setLabel('4')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`plinko_drop_5_${this.channelId}`)
                    .setLabel('5')
                    .setStyle(ButtonStyle.Primary)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`plinko_drop_6_${this.channelId}`)
                    .setLabel('6')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`plinko_drop_7_${this.channelId}`)
                    .setLabel('7')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`plinko_drop_8_${this.channelId}`)
                    .setLabel('8')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`plinko_drop_9_${this.channelId}`)
                    .setLabel('9')
                    .setStyle(ButtonStyle.Secondary)
            );

        return [row1, row2];
    }

    async setMode(mode) {
        this.mode = mode;
        this.board = await this.generateBoard();
    }

    async setDropPosition(position) {
        this.dropPosition = position;
        this.result = await this.simulateDrop(position - 1); // Convert to 0-based index
        this.winAmount = this.result.winnings;
    }

    static getHelpEmbed() {
        return new EmbedBuilder()
            .setTitle('<� Plinko Game Help')
            .setDescription('Drop a ball down the Plinko board and watch it bounce!')
            .setColor(0x00FF00)
            .addFields(
                {
                    name: '<� How to Play',
                    value: '1. Choose your difficulty mode\n2. Select where to drop the ball (1-9)\n3. Watch the ball bounce down the board\n4. Win based on which slot it lands in!',
                    inline: false
                },
                {
                    name: '<� Difficulty Modes',
                    value: '=� **Easy:** Lower risk, steady rewards (max 2x)\n=� **Medium:** Balanced risk/reward (max 4x)\n=� **Hard:** High risk, high reward (max 8x)\n=4 **Nightmare:** Extreme risk, massive rewards (max 16x)',
                    inline: false
                },
                {
                    name: '=� Payouts',
                    value: 'Each slot has a different multiplier. Center slots often have higher multipliers, but it depends on the mode!',
                    inline: false
                },
                {
                    name: '<� RNG',
                    value: 'The ball bounces randomly at each peg using cryptographically secure randomization.',
                    inline: false
                }
            )
            .setFooter({ text: 'Minimum bet: 50 chips | Use /plinko <amount> to play!' });
    }
}

// Game session management with anti-abuse tracking
const activePlinkoGames = new Map();
const userAbusivePatterns = new Map(); // Track potentially abusive patterns

function startPlinkoGame(userId, username, betAmount, channelId, mode = 'easy') {
    // Check for rapid-fire gaming (anti-abuse)
    const lastGameTime = userAbusivePatterns.get(userId);
    if (lastGameTime && Date.now() - lastGameTime < 3000) {
        throw new Error('Please wait 3 seconds between games');
    }
    
    const game = new PlinkoGameSession(userId, username, betAmount, channelId, mode);
    
    // NO MORE DYNAMIC MULTIPLIERS - Using fixed multipliers only
    userAbusivePatterns.set(userId, Date.now());
    activePlinkoGames.set(channelId, game);
    return game;
}

function getPlinkoGame(channelId) {
    return activePlinkoGames.get(channelId) || null;
}

function endPlinkoGame(channelId) {
    const game = activePlinkoGames.get(channelId);
    if (game && game.result) {
        // Log game result for audit trail
        const logData = {
            userId: game.userId,
            username: game.username,
            mode: game.mode,
            betAmount: game.betAmount,
            multiplier: game.result.multiplier,
            winnings: game.winAmount,
            profit: game.result.profit,
            timestamp: new Date().toISOString()
        };
        
        // Log suspicious patterns
        if (game.result.multiplier >= 5.0) {
            logger.warn(`Plinko Game Ended - HIGH WIN: ${JSON.stringify(logData)}`);
        } else if (game.result.multiplier === 0.0) {
            logger.info(`Plinko Game Ended - TOTAL LOSS: ${JSON.stringify(logData)}`);
        }
        
        // Clean up excessive win tracking after 30 minutes
        setTimeout(() => {
            userAbusivePatterns.delete(game.userId);
        }, 30 * 60 * 1000);
    }
    return activePlinkoGames.delete(channelId);
}

async function handlePlinkoAction(interaction, action, value = null) {
    const channelId = interaction.channelId;
    const userId = interaction.user.id;
    const game = getPlinkoGame(channelId);
    
    if (!game) {
        return { success: false, error: 'No active Plinko game found' };
    }
    
    if (game.userId !== userId) {
        return { success: false, error: 'This is not your game' };
    }
    
    try {
        switch (action) {
            case 'mode':
                await game.setMode(value);
                return { success: true, action: 'mode_selected' };
                
            case 'drop':
                const position = parseInt(value);
                if (position < 1 || position > 9) {
                    return { success: false, error: 'Invalid drop position' };
                }
                await game.setDropPosition(position);
                return { success: true, action: 'ball_dropped', result: game.result };
                
            default:
                return { success: false, error: 'Invalid action' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = {
    PlinkoGameSession,
    startPlinkoGame,
    getPlinkoGame,
    endPlinkoGame,
    handlePlinkoAction
};