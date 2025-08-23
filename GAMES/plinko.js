/**
 * Plinko Game Implementation for ATIVE Casino Bot
 * Converted from Python plinko.py with multiple difficulty modes
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { secureRandomInt } = require('../UTILS/rng');
const { fmt } = require('../UTILS/common');

class PlinkoGameSession {
    constructor(userId, username, betAmount, channelId, mode = 'easy') {
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
        
        // Define game modes and their multipliers
        this.modes = {
            easy: {
                name: '=â Easy',
                description: 'Lower risk, steady rewards',
                multipliers: [0.5, 1.0, 1.2, 1.5, 2.0, 1.5, 1.2, 1.0, 0.5],
                maxMultiplier: 2.0
            },
            medium: {
                name: '=á Medium', 
                description: 'Balanced risk and reward',
                multipliers: [0.3, 0.8, 1.5, 2.5, 4.0, 2.5, 1.5, 0.8, 0.3],
                maxMultiplier: 4.0
            },
            hard: {
                name: '=à Hard',
                description: 'High risk, high reward',
                multipliers: [0.1, 0.5, 1.0, 3.0, 8.0, 3.0, 1.0, 0.5, 0.1],
                maxMultiplier: 8.0
            },
            nightmare: {
                name: '=4 Nightmare',
                description: 'Extreme risk, massive rewards',
                multipliers: [0.0, 0.2, 0.5, 2.0, 16.0, 2.0, 0.5, 0.2, 0.0],
                maxMultiplier: 16.0
            }
        };
        
        this.board = this.generateBoard();
    }

    generateBoard() {
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
                line += 'Ï ';
            }
            
            board.push(line.trim());
        }
        
        // Add the bottom slots with multipliers
        const multipliers = this.modes[this.mode].multipliers;
        let bottomLine = '';
        for (let i = 0; i < multipliers.length; i++) {
            bottomLine += `${multipliers[i]}x `;
        }
        board.push(bottomLine.trim());
        
        return board;
    }

    simulateDrop(dropPosition) {
        // Simulate ball drop physics
        let position = dropPosition;
        const path = [position];
        const multipliers = this.modes[this.mode].multipliers;
        
        // Simulate bounces down the board
        for (let row = 1; row < 10; row++) {
            // Each peg has a 50% chance to bounce left or right
            const bounce = secureRandomInt(0, 2);
            if (bounce === 0 && position > 0) {
                position -= 1; // Bounce left
            } else if (bounce === 1 && position < row) {
                position += 1; // Bounce right
            }
            // Clamp position to valid range
            position = Math.max(0, Math.min(position, row));
            path.push(position);
        }
        
        // Final slot is determined by last position
        const finalSlot = Math.min(position, multipliers.length - 1);
        const multiplier = multipliers[finalSlot];
        const winnings = Math.floor(this.betAmount * multiplier);
        
        return {
            path,
            finalSlot,
            multiplier,
            winnings,
            profit: winnings - this.betAmount
        };
    }

    getModeSelectionEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('<¯ Plinko - Select Difficulty')
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

    getDropSelectionEmbed() {
        const mode = this.modes[this.mode];
        const embed = new EmbedBuilder()
            .setTitle(`<¯ Plinko - ${mode.name}`)
            .setDescription(`**Bet Amount:** ${fmt(this.betAmount)}\n**Mode:** ${mode.description}\n\nSelect where to drop the ball:`)
            .setColor(this.getModeColor())
            .setThumbnail('https://i.imgur.com/plinko.png');

        // Show the board
        const boardText = '```\n' + this.board.join('\n') + '\n```';
        embed.addFields({
            name: '<² Plinko Board',
            value: boardText,
            inline: false
        });

        // Show multipliers
        const multiplierText = this.modes[this.mode].multipliers.map((m, i) => `${i + 1}: ${m}x`).join(' | ');
        embed.addFields({
            name: '=° Slot Multipliers',
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
            .setTitle(`<¯ Plinko Result - ${mode.name}`)
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
                name: '<‰ Congratulations!',
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
                    .setLabel('=â Easy')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`plinko_mode_medium_${this.channelId}`)
                    .setLabel('=á Medium')
                    .setStyle(ButtonStyle.Primary)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`plinko_mode_hard_${this.channelId}`)
                    .setLabel('=à Hard')
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

    setMode(mode) {
        this.mode = mode;
        this.board = this.generateBoard();
    }

    setDropPosition(position) {
        this.dropPosition = position;
        this.result = this.simulateDrop(position - 1); // Convert to 0-based index
        this.winAmount = this.result.winnings;
    }

    static getHelpEmbed() {
        return new EmbedBuilder()
            .setTitle('<¯ Plinko Game Help')
            .setDescription('Drop a ball down the Plinko board and watch it bounce!')
            .setColor(0x00FF00)
            .addFields(
                {
                    name: '<® How to Play',
                    value: '1. Choose your difficulty mode\n2. Select where to drop the ball (1-9)\n3. Watch the ball bounce down the board\n4. Win based on which slot it lands in!',
                    inline: false
                },
                {
                    name: '<¯ Difficulty Modes',
                    value: '=â **Easy:** Lower risk, steady rewards (max 2x)\n=á **Medium:** Balanced risk/reward (max 4x)\n=à **Hard:** High risk, high reward (max 8x)\n=4 **Nightmare:** Extreme risk, massive rewards (max 16x)',
                    inline: false
                },
                {
                    name: '=° Payouts',
                    value: 'Each slot has a different multiplier. Center slots often have higher multipliers, but it depends on the mode!',
                    inline: false
                },
                {
                    name: '<² RNG',
                    value: 'The ball bounces randomly at each peg using cryptographically secure randomization.',
                    inline: false
                }
            )
            .setFooter({ text: 'Minimum bet: 50 chips | Use /plinko <amount> to play!' });
    }
}

// Game session management
const activePlinkoGames = new Map();

function startPlinkoGame(userId, username, betAmount, channelId) {
    const game = new PlinkoGameSession(userId, username, betAmount, channelId);
    activePlinkoGames.set(channelId, game);
    return game;
}

function getPlinkoGame(channelId) {
    return activePlinkoGames.get(channelId) || null;
}

function endPlinkoGame(channelId) {
    return activePlinkoGames.delete(channelId);
}

function handlePlinkoAction(interaction, action, value = null) {
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
                game.setMode(value);
                return { success: true, action: 'mode_selected' };
                
            case 'drop':
                const position = parseInt(value);
                if (position < 1 || position > 9) {
                    return { success: false, error: 'Invalid drop position' };
                }
                game.setDropPosition(position);
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