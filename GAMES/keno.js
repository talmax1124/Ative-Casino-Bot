/**
 * KENO Game Logic - Number Selection Lottery
 * Players pick numbers, system draws 20, payouts based on matches
 * Conservative multipliers: 1 match = 1.2x, 2 matches = 2x, 3 matches = 2.7x
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const dbManager = require('../UTILS/database');
const sessionManager = require('../UTILS/sessionManager');
const { fmt } = require('../UTILS/common');
const logger = require('../UTILS/logger');
const { secureRandomShuffle, generateProvablyFairRandom } = require('../UTILS/rng');

// KENO Configuration
const CONFIG = {
    TOTAL_NUMBERS: 80,     // Numbers 1-80 available
    DRAW_COUNT: 20,        // 20 numbers drawn
    MIN_SPOTS: 1,
    MAX_SPOTS: 10
};

// Conservative KENO payout table
const PAYOUT_TABLE = {
    1: { 1: 1.2 },                           // 1 spot: 1 match = 1.2x
    2: { 2: 2.0 },                           // 2 spots: 2 matches = 2x  
    3: { 2: 1.0, 3: 2.7 },                   // 3 spots: 2 matches = 1x, 3 matches = 2.7x
    4: { 2: 0.5, 3: 1.5, 4: 3.5 },          // 4 spots: progressive payouts
    5: { 3: 0.8, 4: 2.0, 5: 5.0 },          // 5 spots: conservative multipliers
    6: { 3: 0.5, 4: 1.2, 5: 3.0, 6: 8.0 },  // 6 spots: balanced payouts
    7: { 4: 0.8, 5: 2.0, 6: 4.0, 7: 12.0 }, // 7 spots: moderate scaling
    8: { 5: 1.0, 6: 2.5, 7: 6.0, 8: 20.0 }, // 8 spots: controlled high-end
    9: { 5: 0.8, 6: 2.0, 7: 5.0, 8: 15.0, 9: 35.0 }, // 9 spots: rare big win
    10: { 5: 0.5, 6: 1.5, 7: 4.0, 8: 12.0, 9: 25.0, 10: 50.0 } // 10 spots: max payout 50x
};

class KenoGame {
    constructor(sessionId, gameConfig) {
        this.sessionId = sessionId;
        this.userId = gameConfig.userId;
        this.username = gameConfig.username;
        this.betAmount = gameConfig.betAmount;
        this.channelId = gameConfig.channelId;
        this.guildId = gameConfig.guildId;
        this.spots = gameConfig.spots;
        this.quickPick = gameConfig.quickPick;
        
        this.selectedNumbers = [];
        this.drawnNumbers = [];
        this.matches = 0;
        this.multiplier = 0;
        this.payout = 0;
        
        this.gameMessage = null;
        this.client = null;
    }

    /**
     * Main game execution handler
     */
    async execute(interaction, client) {
        this.client = client;
        
        try {
            if (this.quickPick) {
                // Auto-select numbers and play immediately
                this.selectedNumbers = this.generateRandomNumbers(this.spots);
                await this.playGame(interaction);
            } else {
                // Show number selection interface
                await this.startNumberSelection(interaction);
            }
        } catch (error) {
            logger.error(`KENO game execution failed: ${error.message}`);
            await this.cleanup();
            throw error;
        }
    }

    /**
     * Start number selection interface
     */
    async startNumberSelection(interaction) {
        const embed = this.createSelectionEmbed();
        const components = this.createNumberButtons();
        
        const reply = await interaction.editReply({
            embeds: [embed],
            components: components
        });
        
        this.gameMessage = reply;
        this.setupButtonHandler();
    }

    /**
     * Create number selection embed
     */
    createSelectionEmbed() {
        return buildSessionEmbed({
            title: `🎲 KENO - NUMBER SELECTION`,
            topFields: [
                {
                    name: '🎯 SELECT YOUR NUMBERS',
                    value: `**Spots to Pick:** ${this.spots}\n**Selected:** ${this.selectedNumbers.length}/${this.spots}\n**Numbers:** ${this.selectedNumbers.length > 0 ? this.selectedNumbers.sort((a,b) => a-b).join(', ') : 'None yet'}`,
                    inline: false
                },
                {
                    name: '💰 BET INFO',
                    value: `**Bet Amount:** ${fmt(this.betAmount)}\n**Max Payout:** ${fmt(this.betAmount * this.getMaxMultiplier())}x`,
                    inline: false
                }
            ],
            stageText: 'PICK YOUR LUCKY NUMBERS',
            color: 0x4169E1,
            footer: 'Select numbers from the buttons below'
        });
    }

    /**
     * Create number selection buttons (1-80)
     */
    createNumberButtons() {
        const components = [];
        
        // Create 4 rows of 20 numbers each (1-20, 21-40, 41-60, 61-80)
        for (let row = 0; row < 4; row++) {
            const buttons = [];
            for (let col = 0; col < 20; col++) {
                const number = row * 20 + col + 1;
                const isSelected = this.selectedNumbers.includes(number);
                
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`keno_num_${number}_${this.sessionId}`)
                        .setLabel(number.toString())
                        .setStyle(isSelected ? ButtonStyle.Success : ButtonStyle.Secondary)
                        .setDisabled(false)
                );
            }
            components.push(new ActionRowBuilder().addComponents(buttons));
        }
        
        // Add control buttons
        const controlButtons = [];
        
        // Quick Pick remaining
        if (this.selectedNumbers.length < this.spots) {
            controlButtons.push(
                new ButtonBuilder()
                    .setCustomId(`keno_quickpick_${this.sessionId}`)
                    .setLabel(`🎲 Quick Pick (${this.spots - this.selectedNumbers.length})`)
                    .setStyle(ButtonStyle.Primary)
            );
        }
        
        // Play button (enabled when correct number selected)
        controlButtons.push(
            new ButtonBuilder()
                .setCustomId(`keno_play_${this.sessionId}`)
                .setLabel('🎯 PLAY KENO')
                .setStyle(ButtonStyle.Success)
                .setDisabled(this.selectedNumbers.length !== this.spots)
        );
        
        // Clear selection
        if (this.selectedNumbers.length > 0) {
            controlButtons.push(
                new ButtonBuilder()
                    .setCustomId(`keno_clear_${this.sessionId}`)
                    .setLabel('🗑️ Clear')
                    .setStyle(ButtonStyle.Danger)
            );
        }
        
        components.push(new ActionRowBuilder().addComponents(controlButtons));
        
        return components;
    }

    /**
     * Setup button interaction handler
     */
    setupButtonHandler() {
        if (!this.client) return;

        const filter = (buttonInteraction) => {
            return buttonInteraction.customId.includes(this.sessionId) && 
                   buttonInteraction.user.id === this.userId;
        };

        const collector = this.gameMessage.createMessageComponentCollector({
            filter,
            time: 300000 // 5 minutes
        });

        collector.on('collect', async (buttonInteraction) => {
            await buttonInteraction.deferUpdate();
            
            const customId = buttonInteraction.customId;
            
            if (customId.startsWith(`keno_num_`)) {
                const number = parseInt(customId.split('_')[2]);
                await this.toggleNumber(number, buttonInteraction);
            } else if (customId === `keno_quickpick_${this.sessionId}`) {
                await this.quickPickRemaining(buttonInteraction);
            } else if (customId === `keno_play_${this.sessionId}`) {
                collector.stop();
                await this.playGame(buttonInteraction);
            } else if (customId === `keno_clear_${this.sessionId}`) {
                await this.clearSelection(buttonInteraction);
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                await this.handleTimeout();
            }
        });
    }

    /**
     * Toggle number selection
     */
    async toggleNumber(number, interaction) {
        if (this.selectedNumbers.includes(number)) {
            // Remove number
            this.selectedNumbers = this.selectedNumbers.filter(n => n !== number);
        } else {
            // Add number if not at limit
            if (this.selectedNumbers.length < this.spots) {
                this.selectedNumbers.push(number);
            }
        }
        
        // Update display
        const embed = this.createSelectionEmbed();
        const components = this.createNumberButtons();
        
        await interaction.editReply({
            embeds: [embed],
            components: components
        });
    }

    /**
     * Quick pick remaining numbers
     */
    async quickPickRemaining(interaction) {
        const remaining = this.spots - this.selectedNumbers.length;
        const availableNumbers = [];
        
        for (let i = 1; i <= CONFIG.TOTAL_NUMBERS; i++) {
            if (!this.selectedNumbers.includes(i)) {
                availableNumbers.push(i);
            }
        }
        
        // Randomly select remaining numbers
        for (let i = 0; i < remaining; i++) {
            const randomIndex = secureRandomInt(0, availableNumbers.length);
            this.selectedNumbers.push(availableNumbers.splice(randomIndex, 1)[0]);
        }
        
        // Update display
        const embed = this.createSelectionEmbed();
        const components = this.createNumberButtons();
        
        await interaction.editReply({
            embeds: [embed],
            components: components
        });
    }

    /**
     * Clear all selected numbers
     */
    async clearSelection(interaction) {
        this.selectedNumbers = [];
        
        const embed = this.createSelectionEmbed();
        const components = this.createNumberButtons();
        
        await interaction.editReply({
            embeds: [embed],
            components: components
        });
    }

    /**
     * Generate random numbers for quick pick
     */
    generateRandomNumbers(count) {
        const numbers = [];
        const available = Array.from({length: CONFIG.TOTAL_NUMBERS}, (_, i) => i + 1);
        
        for (let i = 0; i < count; i++) {
            const randomIndex = secureRandomInt(0, available.length);
            numbers.push(available.splice(randomIndex, 1)[0]);
        }
        
        return numbers.sort((a, b) => a - b);
    }

    /**
     * Draw 20 random numbers
     */
    drawNumbers() {
        const available = Array.from({length: CONFIG.TOTAL_NUMBERS}, (_, i) => i + 1);
        this.drawnNumbers = [];
        
        for (let i = 0; i < CONFIG.DRAW_COUNT; i++) {
            const randomIndex = secureRandomInt(0, available.length);
            this.drawnNumbers.push(available.splice(randomIndex, 1)[0]);
        }
        
        this.drawnNumbers.sort((a, b) => a - b);
    }

    /**
     * Calculate matches and payout
     */
    calculatePayout() {
        this.matches = this.selectedNumbers.filter(num => this.drawnNumbers.includes(num)).length;
        
        const payoutTable = PAYOUT_TABLE[this.spots];
        this.multiplier = payoutTable[this.matches] || 0;
        this.payout = Math.floor(this.betAmount * this.multiplier);
    }

    /**
     * Play the game
     */
    async playGame(interaction) {
        try {
            // Draw numbers and calculate results
            this.drawNumbers();
            this.calculatePayout();
            
            // Create result embed
            const embed = this.createResultEmbed();
            
            // Process payout if won
            let gameResult = GameResult.LOSS;
            if (this.payout > 0) {
                const success = await PayoutManager.processGamePayout(
                    this.userId,
                    this.guildId,
                    this.payout,
                    GameType.KENO,
                    `KENO win - ${this.matches}/${this.spots} matches`
                );
                gameResult = success ? GameResult.WIN : GameResult.ERROR;
            }

            // Update session as completed
            await sessionManager.updateSessionState(this.sessionId, sessionManager.SessionState.COMPLETED);

            // Log game result
            await dbManager.recordGameResult(this.userId, this.guildId, GameType.KENO, {
                betAmount: this.betAmount,
                payout: this.payout,
                result: gameResult,
                spots: this.spots,
                selectedNumbers: this.selectedNumbers,
                drawnNumbers: this.drawnNumbers,
                matches: this.matches,
                multiplier: this.multiplier
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
            logger.error(`KENO game play failed: ${error.message}`);
            await this.cleanup();
            throw error;
        }
    }

    /**
     * Create result embed
     */
    createResultEmbed() {
        const matchedNumbers = this.selectedNumbers.filter(num => this.drawnNumbers.includes(num));
        const won = this.payout > 0;
        
        // Create number display
        const selectedDisplay = this.selectedNumbers.map(num => 
            this.drawnNumbers.includes(num) ? `**${num}**` : `${num}`
        ).join(' ');
        
        const drawnDisplay = this.drawnNumbers.join(' ');
        
        return buildSessionEmbed({
            title: `🎲 KENO - ${won ? 'WINNER!' : 'NO WIN'}`,
            topFields: [
                {
                    name: '🎯 YOUR NUMBERS',
                    value: `${selectedDisplay}\n**Matched:** ${matchedNumbers.join(', ') || 'None'}`,
                    inline: false
                },
                {
                    name: '🔢 DRAWN NUMBERS', 
                    value: `${drawnDisplay}`,
                    inline: false
                },
                {
                    name: '📊 RESULTS',
                    value: `**Matches:** ${this.matches}/${this.spots}\n**Multiplier:** ${this.multiplier}x\n**Payout:** ${fmt(this.payout)}`,
                    inline: false
                }
            ],
            stageText: won ? `${this.matches} MATCHES!` : 'BETTER LUCK NEXT TIME',
            color: won ? 0x00FF00 : 0xFF4444,
            footer: `Bet: ${fmt(this.betAmount)} | ${this.matches} matches out of ${this.spots} picks`
        });
    }

    /**
     * Get maximum possible multiplier for this spot count
     */
    getMaxMultiplier() {
        const payoutTable = PAYOUT_TABLE[this.spots];
        return Math.max(...Object.values(payoutTable));
    }

    /**
     * Handle timeout
     */
    async handleTimeout() {
        try {
            const embed = new EmbedBuilder()
                .setTitle('⏰ KENO - Time Expired')
                .setDescription('Number selection timed out. Your bet has been refunded.')
                .setColor(0xFFAA00);

            // Refund the bet
            await PayoutManager.processGamePayout(
                this.userId,
                this.guildId,
                this.betAmount,
                GameType.KENO,
                'KENO timeout refund'
            );

            if (this.gameMessage) {
                await this.gameMessage.edit({
                    embeds: [embed],
                    components: []
                });
            }

            await this.cleanup();
        } catch (error) {
            logger.error(`KENO timeout handling failed: ${error.message}`);
        }
    }

    /**
     * Cleanup game resources
     */
    async cleanup() {
        try {
            await sessionManager.endSession(this.sessionId, 'KENO game completed');
        } catch (error) {
            logger.error(`KENO cleanup failed: ${error.message}`);
        }
    }
}

/**
 * Main game handler function
 */
async function handleKenoGame(interaction, client, sessionId, gameConfig) {
    const game = new KenoGame(sessionId, gameConfig);
    await game.execute(interaction, client);
}

module.exports = {
    handleKenoGame,
    KenoGame,
    PAYOUT_TABLE,
    CONFIG
};