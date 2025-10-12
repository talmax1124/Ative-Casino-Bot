/**
 * KENO Game Logic - Number Selection Lottery
 * Players pick numbers, system draws 20, payouts based on matches
 * Balanced multipliers: 5 spots: 2 matches = 0.5x, 3 matches = 2x, 4 matches = 20x, 5 matches = 200x
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const dbManager = require('../UTILS/database');
const sessionManager = require('../UTILS/sessionManager');
const { fmt } = require('../UTILS/common');
const logger = require('../UTILS/logger');
const { secureRandomInt, secureRandomFloat, secureRandomBytes } = require('../UTILS/rng');
const BulletproofEconomyController = require('../BULLETPROOF_ECONOMY/BulletproofEconomyController');
// UNIVERSAL GAME INTEGRATION - ALL SYSTEMS
const UniversalGameIntegrator = require('../UTILS/UniversalGameIntegrator');
const securityLogger = require('../UTILS/securityLogger');
const sessionGuard = require('../UTILS/sessionGuard');
const transparentPayoutManager = require('../UTILS/transparentPayoutManager');
const tuningManager = require('../UTILS/tuningManager');

// Initialize game integrator
const gameIntegrator = new UniversalGameIntegrator('keno');


// KENO Configuration - Simplified for 1-5 numbers only
const CONFIG = {
    TOTAL_NUMBERS: 80,     // Numbers 1-80 available
    DRAW_COUNT: 20,        // 20 numbers drawn
    MIN_SPOTS: 1,
    MAX_SPOTS: 5           // Simplified to max 5 numbers
};

// BALANCED KENO payout table - Max 3x multiplier, fun but safe
const PAYOUT_TABLE = {
    1: { 1: 2.8 },                           // 1 spot: 1 match = 2.8x (good payout)
    2: { 2: 3.0 },                           // 2 spots: need both to win = 3x (max payout)
    3: { 2: 1.8, 3: 3.0 },                   // 3 spots: 2 matches = 1.8x, all 3 = 3x (max payout)
    4: { 2: 1.2, 3: 2.5, 4: 3.0 },          // 4 spots: increasing payouts up to 3x
    5: { 2: 0.8, 3: 1.5, 4: 2.5, 5: 3.0 }   // 5 spots: challenging but max 3x payout
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
        // Check for playfor context
        const playForRecipient = global.playForContext?.recipientName;
        const winningForSomeoneElse = playForRecipient && global.playForContext.recipientId;
        
        const topFields = [];
        
        // Add Playing For field if applicable
        if (winningForSomeoneElse) {
            topFields.push({
                name: '🎁 Playing For',
                value: `@${playForRecipient}`,
                inline: false
            });
        }
        
        topFields.push(
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
        );
        
        const title = winningForSomeoneElse ? `🎲 KENO - NUMBER SELECTION (for @${playForRecipient})` : `🎲 KENO - NUMBER SELECTION`;
        
        return buildSessionEmbed({
            title,
            topFields,
            stageText: 'PICK YOUR LUCKY NUMBERS',
            color: 0x4169E1,
            footer: 'Select numbers from the buttons below'
        });
    }

    /**
     * Create number selection buttons - simplified interface
     */
    createNumberButtons() {
        const components = [];
        
        // Row 1: Numbers 1-10
        const row1 = [];
        for (let i = 1; i <= 5; i++) {
            const isSelected = this.selectedNumbers.includes(i);
            row1.push(
                new ButtonBuilder()
                    .setCustomId(`keno_num_${i}_${this.sessionId}`)
                    .setLabel(i.toString())
                    .setStyle(isSelected ? ButtonStyle.Success : ButtonStyle.Secondary)
            );
        }
        components.push(new ActionRowBuilder().addComponents(row1));
        
        // Row 2: Numbers 6-10
        const row2 = [];
        for (let i = 6; i <= 10; i++) {
            const isSelected = this.selectedNumbers.includes(i);
            row2.push(
                new ButtonBuilder()
                    .setCustomId(`keno_num_${i}_${this.sessionId}`)
                    .setLabel(i.toString())
                    .setStyle(isSelected ? ButtonStyle.Success : ButtonStyle.Secondary)
            );
        }
        components.push(new ActionRowBuilder().addComponents(row2));
        
        // Row 3: Number range selector buttons
        const rangeButtons = [
            new ButtonBuilder()
                .setCustomId(`keno_range_11_20_${this.sessionId}`)
                .setLabel('11-20')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`keno_range_21_40_${this.sessionId}`)
                .setLabel('21-40')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`keno_range_41_60_${this.sessionId}`)
                .setLabel('41-60')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`keno_range_61_80_${this.sessionId}`)
                .setLabel('61-80')
                .setStyle(ButtonStyle.Primary)
        ];
        components.push(new ActionRowBuilder().addComponents(rangeButtons));
        
        // Row 4: Control buttons
        const controlButtons = [];
        
        // Quick Pick ALL
        controlButtons.push(
            new ButtonBuilder()
                .setCustomId(`keno_quickpick_${this.sessionId}`)
                .setLabel(`🎲 Quick Pick All`)
                .setStyle(ButtonStyle.Primary)
        );
        
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
            } else if (customId.startsWith(`keno_range_`)) {
                const rangeParts = customId.split('_');
                const startNum = parseInt(rangeParts[2]);
                const endNum = parseInt(rangeParts[3]);
                await this.showRangeNumbers(startNum, endNum, buttonInteraction);
            } else if (customId === `keno_quickpick_${this.sessionId}`) {
                await this.quickPickAll(buttonInteraction);
            } else if (customId === `keno_play_${this.sessionId}`) {
                collector.stop();
                await this.playGame(buttonInteraction);
            } else if (customId === `keno_clear_${this.sessionId}`) {
                await this.clearSelection(buttonInteraction);
            } else if (customId === `keno_back_${this.sessionId}`) {
                await this.backToMainSelection(buttonInteraction);
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
     * Quick pick all numbers
     */
    async quickPickAll(interaction) {
        this.selectedNumbers = this.generateRandomNumbers(this.spots);
        
        // Update display
        const embed = this.createSelectionEmbed();
        const components = this.createNumberButtons();
        
        await interaction.editReply({
            embeds: [embed],
            components: components
        });
    }

    /**
     * Show numbers in a specific range for selection
     */
    async showRangeNumbers(startNum, endNum, interaction) {
        // Create a temporary UI showing numbers in the range
        const embed = new EmbedBuilder()
            .setTitle(`🎲 KENO - Select from ${startNum}-${endNum}`)
            .setDescription(`**Currently Selected:** ${this.selectedNumbers.length}/${this.spots}\n**Numbers:** ${this.selectedNumbers.sort((a,b) => a-b).join(', ') || 'None yet'}`)
            .addFields({
                name: `Available Numbers (${startNum}-${endNum})`,
                value: `Click the numbers you want to select from this range`,
                inline: false
            })
            .setColor(0x4169E1);

        const components = [];
        
        // Create buttons for the range (max 5 per row)
        let currentRow = [];
        for (let num = startNum; num <= endNum; num++) {
            const isSelected = this.selectedNumbers.includes(num);
            
            currentRow.push(
                new ButtonBuilder()
                    .setCustomId(`keno_num_${num}_${this.sessionId}`)
                    .setLabel(num.toString())
                    .setStyle(isSelected ? ButtonStyle.Success : ButtonStyle.Secondary)
            );
            
            if (currentRow.length === 5) {
                components.push(new ActionRowBuilder().addComponents(currentRow));
                currentRow = [];
            }
        }
        
        // Add remaining buttons
        if (currentRow.length > 0) {
            components.push(new ActionRowBuilder().addComponents(currentRow));
        }
        
        // Add back button
        const backButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`keno_back_${this.sessionId}`)
                .setLabel('⬅️ Back to Main')
                .setStyle(ButtonStyle.Secondary)
        );
        components.push(backButton);
        
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
     * Go back to main selection screen
     */
    async backToMainSelection(interaction) {
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
        this.payout = Math.round((this.betAmount * this.multiplier) * 100) / 100;
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
            const embed = await this.createResultEmbed();
            
            // Process payout using correct GameResult object
            const gameResult = new GameResult({
                userId: this.userId,
                guildId: this.guildId,
                gameType: GameType.KENO,
                betAmount: this.betAmount,
                payout: this.payout,
                won: this.payout > 0,
                metadata: {
                    spots: this.spots,
                    selectedNumbers: this.selectedNumbers,
                    drawnNumbers: this.drawnNumbers,
                    matches: this.matches,
                    multiplier: this.multiplier
                }
            });

            if (this.payout > 0) {
                await PayoutManager.processGamePayout(gameResult);
            }

            // Session completion will be handled by the command handler

            // Log game result
            await dbManager.recordGameResult(
                this.userId, 
                this.guildId, 
                GameType.KENO, 
                this.payout > 0, // won
                this.betAmount,  // betAmount
                this.payout,     // payout
                {
                    result: gameResult,
                    spots: this.spots,
                    selectedNumbers: this.selectedNumbers,
                    drawnNumbers: this.drawnNumbers,
                    matches: this.matches,
                    multiplier: this.multiplier
                }
            );

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
     * Create result embed with clear explanations
     */
    async createResultEmbed() {
        const matchedNumbers = this.selectedNumbers.filter(num => this.drawnNumbers.includes(num));
        const won = this.payout > 0;
        
        // Calculate economy-adjusted payout to show accurate amount to user
        let displayPayout = this.payout;
        if (won && this.payout > 0) {
            try {
                const bulletproofEconomy = new BulletproofEconomyController();
                await bulletproofEconomy.initialize();
                const economyResult = await bulletproofEconomy.processGame({
                    gameType: 'keno',
                    userId: this.userId,
                    betAmount: this.betAmount,
                    originalPayout: this.payout,
                    won: true,
                    guildId: this.guildId
                });
                if (economyResult && economyResult.adjustedPayout !== undefined) {
                    displayPayout = economyResult.adjustedPayout;
                }
            } catch (error) {
                logger.warn(`Failed to calculate economy-adjusted payout for display: ${error.message}`);
                // Use original payout if economy calculation fails
            }
        }
        
        // Create number display with clear highlighting
        const selectedDisplay = this.selectedNumbers.map(num => 
            this.drawnNumbers.includes(num) ? `**${num}** ✅` : `${num}`
        ).join(' ');
        
        // Check for playfor context
        const playForRecipient = global.playForContext?.recipientName;
        const winningForSomeoneElse = playForRecipient && global.playForContext.recipientId;
        
        // Simplified explanation of what happened
        let winExplanation = '';
        if (won) {
            if (winningForSomeoneElse) {
                winExplanation = `🎉 **WIN FOR @${playForRecipient}!** You matched ${this.matches} out of your ${this.spots} numbers.\n` +
                               `With ${this.spots} numbers picked, you needed ${Math.min(...Object.keys(PAYOUT_TABLE[this.spots]).map(Number))} matches to win.\n` +
                               `Your ${this.matches} matches earned ${this.multiplier}x your bet = ${fmt(displayPayout)} for @${playForRecipient}!`;
            } else {
                winExplanation = `🎉 **YOU WON!** You matched ${this.matches} out of your ${this.spots} numbers.\n` +
                               `With ${this.spots} numbers picked, you needed ${Math.min(...Object.keys(PAYOUT_TABLE[this.spots]).map(Number))} matches to win.\n` +
                               `Your ${this.matches} matches earned ${this.multiplier}x your bet = ${fmt(displayPayout)}!`;
            }
        } else {
            const minToWin = Math.min(...Object.keys(PAYOUT_TABLE[this.spots]).map(Number));
            winExplanation = `❌ **No payout this time.** You matched ${this.matches} out of your ${this.spots} numbers.\n` +
                           `With ${this.spots} numbers picked, you needed at least ${minToWin} matches to win.\n` +
                           `Better luck next time!`;
        }
        
        let topFields = [
            {
                name: '🎯 YOUR NUMBERS (Auto-Selected)',
                value: selectedDisplay,
                inline: false
            },
            {
                name: '🎲 HOUSE DREW 20 NUMBERS', 
                value: this.drawnNumbers.join(' '),
                inline: false
            },
            {
                name: '📊 WHAT HAPPENED?',
                value: winExplanation,
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
        
        let title = `🎲 KENO Results - ${this.matches} Match${this.matches !== 1 ? 'es' : ''}`;
        if (winningForSomeoneElse && won) {
            title = `🎲 KENO Results - Won for @${playForRecipient}!`;
        }
        
        let stageText = won ? `🎊 WINNER! 🎊` : `${this.matches}/${this.spots} matches`;
        if (winningForSomeoneElse && won) {
            stageText = `WON FOR @${playForRecipient}!`;
        }
        
        let footer = `KENO TIP: More numbers = bigger multipliers but harder to match! Current: ${this.spots} numbers picked`;
        if (winningForSomeoneElse) {
            footer = `Playing for @${playForRecipient} • ` + footer;
        }
        
        return buildSessionEmbed({
            title,
            topFields,
            stageText,
            color: won ? 0x00FF00 : 0xFF4444,
            footer
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

            // Refund the bet - add money back to wallet
            try {
                await dbManager.addMoney(this.userId, this.guildId, this.betAmount);
                logger.info(`KENO timeout refund: ${fmt(this.betAmount)} refunded to user ${this.userId}`);
            } catch (refundError) {
                logger.error(`Failed to refund KENO timeout: ${refundError.message}`);
            }

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