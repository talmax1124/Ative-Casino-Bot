/**
 * Keypad Code Game - Number Guessing Mini-Game for Heists
 * 
 * GAME RULES:
 * - Generate a random number between 1-500
 * - Player has 8 attempts to crack the code
 * - Use button-based keypad interface to enter numbers
 * - After each guess, provide "higher" or "lower" feedback
 * - Win by guessing the exact number
 * - Interactive number pad with enter/clear buttons
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { secureRandomInt } = require('../../UTILS/rng');
const logger = require('../../UTILS/logger');

class KeypadCodeGame {
    constructor(config) {
        this.userId = config.userId;
        this.username = config.username;
        this.channelId = config.channelId;
        this.guildId = config.guildId;
        
        // Game state
        this.gamePhase = 'ready'; // 'ready', 'playing', 'complete', 'failed'
        this.secretNumber = 0;
        this.currentInput = '';
        this.attempts = [];
        this.currentAttempt = 1;
        this.maxAttempts = 8;
        this.timeLimit = 600000; // 10 minutes total
        this.startTime = null;
        
        // Discord objects
        this.gameMessage = null;
        this.client = null;
        this.collector = null;
        this.modalHandler = null;
        this.timeoutHandler = null;
    }

    /**
     * Start the keypad code game
     */
    async start(interaction) {
        this.client = interaction.client;
        
        try {
            // Generate secret number
            this.generateSecretNumber();
            this.startTime = Date.now();
            
            logger.info(`Keypad Code game started by ${this.username} (${this.userId}) - Secret number: ${this.secretNumber}`);
            
            // Set phase to playing first
            this.gamePhase = 'playing';
            
            // Create initial embed
            const embed = this.createGameEmbed();
            
            const reply = await interaction.editReply({
                embeds: [embed],
                components: this.createKeypadButtons()
            });
            
            this.gameMessage = reply;
            
            // Set up button handler and timeout
            this.setupButtonHandler();
            this.setupGameTimeout();
            
        } catch (error) {
            logger.error(`Keypad Code game start failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate a random number between 1-500
     */
    generateSecretNumber() {
        // Generate random number from 1 to 500 using CSPRNG
        this.secretNumber = secureRandomInt(1, 501); // 501 is exclusive, so max is 500
    }

    /**
     * Create game embed based on current state
     */
    createGameEmbed() {
        let title, description, color;
        
        switch (this.gamePhase) {
            case 'ready':
            case 'playing':
                title = '🔐 KEYPAD CODE BREAKER';
                description = this.createPlayingDescription();
                color = 0x4169E1;
                break;
                
            case 'complete':
                title = '🎉 SECURITY BYPASSED!';
                description = this.createWinDescription();
                color = 0x00FF00;
                break;
                
            case 'failed':
                title = '🚨 ACCESS DENIED!';
                description = this.createFailDescription();
                color = 0xFF0000;
                break;
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color);

        // Add keypad display and progress for playing phase
        if (this.gamePhase === 'playing') {
            embed.addFields(
                {
                    name: '🖥️ Keypad Display',
                    value: this.createKeypadDisplay(),
                    inline: false
                },
                {
                    name: '📊 Progress',
                    value: `**Attempts used:** ${this.currentAttempt - 1}/${this.maxAttempts}`,
                    inline: true
                }
            );
        }

        embed.setFooter({ 
            text: `Keypad Code Game - ${this.getPhaseDescription()}` 
        });

        return embed;
    }

    /**
     * Create playing phase description
     */
    createPlayingDescription() {
        if (this.attempts.length === 0) {
            return `**Crack the security code (1-500)**\n\n💡 **Tip:** Start with 250 to split the range efficiently!`;
        } else {
            const lastAttempt = this.attempts[this.attempts.length - 1];
            let description = `**Last guess:** \`${lastAttempt.guess}\` → ${this.getSimpleFeedback(lastAttempt.feedback)}\n\n`;
            
            // Add strategic hint
            description += this.getStrategicHint();
            
            return description;
        }
    }

    /**
     * Create visual keypad display
     */
    createKeypadDisplay() {
        const displayInput = this.currentInput || '___';
        
        // Create a visual keypad display with consistent 17-character width per line
        // Each line inside │ │ should be exactly 17 characters
        const centeredInput = displayInput.padStart(Math.floor((17 - displayInput.length) / 2) + displayInput.length, ' ').padEnd(17, ' ');
        
        return `\`\`\`\n` +
               `┌─────────────────┐\n` +
               `│  SECURITY PAD   │\n` +   // 17 chars: "  SECURITY PAD   "
               `├─────────────────┤\n` +
               `│                 │\n` +   // 17 chars: "                 "  
               `│${centeredInput}│\n` +       // 17 chars with input centered
               `│                 │\n` +   // 17 chars: "                 "
               `│ [1][2][3][4][5] │\n` +   // 17 chars: " [1][2][3][4][5] "
               `│ [6][7][8][9][0] │\n` +   // 17 chars: " [6][7][8][9][0] "
               `│                 │\n` +   // 17 chars: "                 "
               `│ [CLR]   [ENT]   │\n` +   // 17 chars: " [CLR]   [ENT]   "
               `└─────────────────┘\n` +
               `\`\`\``;
    }

    /**
     * Get simplified feedback display
     */
    getSimpleFeedback(feedback) {
        if (feedback.includes('Higher')) return '📈 **Higher**';
        if (feedback.includes('Lower')) return '📉 **Lower**';
        return '🎯 **Correct!**';
    }

    /**
     * Get strategic hint based on previous attempts
     */
    getStrategicHint() {
        if (this.attempts.length === 0) return '';
        
        // Calculate range based on all attempts
        let min = 1;
        let max = 500;
        
        for (const attempt of this.attempts) {
            const guess = parseInt(attempt.guess);
            if (attempt.feedback.includes('Higher')) {
                min = Math.max(min, guess + 1);
            } else if (attempt.feedback.includes('Lower')) {
                max = Math.min(max, guess - 1);
            }
        }
        
        const range = max - min + 1;
        const middle = Math.floor((min + max) / 2);
        
        // Simplified hints
        if (range <= 10) {
            return `🔥 **Very close!** Try ${middle} (${min}-${max})`;
        } else if (range <= 50) {
            return `🎯 **Getting warmer!** Try ${middle} (${min}-${max})`;
        } else {
            return `💡 **Range:** ${min}-${max} → Try ${middle}`;
        }
    }

    /**
     * Create win description
     */
    createWinDescription() {
        const timeElapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const attemptCount = this.currentAttempt - 1;
        
        return `**🎉 CODE CRACKED!**\n\n` +
               `**The secret number was \`${this.secretNumber}\`**\n\n` +
               `Solved in ${attemptCount} attempt${attemptCount !== 1 ? 's' : ''} (${Math.floor(timeElapsed / 60)}m ${timeElapsed % 60}s)\n\n` +
               `**Security system bypassed! The vault is accessible! 💰**`;
    }

    /**
     * Create fail description
     */
    createFailDescription() {
        return `**🚨 SECURITY LOCKOUT!**\n\n` +
               `**The secret number was \`${this.secretNumber}\`**\n\n` +
               `You've used all ${this.maxAttempts} attempts. The security system has activated!\n\n` +
               `**🔒 Heist failed - vault remains secure! 🏦**`;
    }

    /**
     * Get phase description for footer
     */
    getPhaseDescription() {
        switch (this.gamePhase) {
            case 'ready': return 'Starting security breach...';
            case 'playing': return 'Cracking the code...';
            case 'complete': return 'Code cracked successfully!';
            case 'failed': return 'Security lockout activated!';
            default: return 'Processing...';
        }
    }

    /**
     * Create keypad buttons with visual layout
     */
    createKeypadButtons() {
        if (this.gamePhase !== 'playing') return [];
        
        const components = [];
        
        // Row 1: 1 2 3 4 5
        components.push(new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('keypad_1').setLabel('1').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('keypad_2').setLabel('2').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('keypad_3').setLabel('3').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('keypad_4').setLabel('4').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('keypad_5').setLabel('5').setStyle(ButtonStyle.Secondary)
            ));
        
        // Row 2: 6 7 8 9 0
        components.push(new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('keypad_6').setLabel('6').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('keypad_7').setLabel('7').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('keypad_8').setLabel('8').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('keypad_9').setLabel('9').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('keypad_0').setLabel('0').setStyle(ButtonStyle.Secondary)
            ));
        
        // Row 3: Clear and Enter buttons
        components.push(new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('keypad_clear')
                    .setLabel('🗑️ Clear')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('keypad_spacer')
                    .setLabel('━━━━━━━')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('keypad_enter')
                    .setLabel('✅ Enter')
                    .setStyle(ButtonStyle.Success)
            ));
        
        return components;
    }

    /**
     * Setup button handler
     */
    setupButtonHandler() {
        if (!this.client || !this.gameMessage) return;

        this.clearCollector();

        const filter = (buttonInteraction) => {
            return buttonInteraction.customId.startsWith('keypad_') && 
                   buttonInteraction.user.id === this.userId;
        };

        this.collector = this.gameMessage.createMessageComponentCollector({
            filter,
            time: this.timeLimit
        });

        this.collector.on('collect', async (buttonInteraction) => {
            try {
                // Always defer the interaction first
                if (!buttonInteraction.deferred && !buttonInteraction.replied) {
                    await buttonInteraction.deferUpdate();
                }

                const buttonId = buttonInteraction.customId;
                
                if (buttonId.startsWith('keypad_') && buttonId !== 'keypad_display' && buttonId !== 'keypad_attempts' && buttonId !== 'keypad_spacer') {
                    await this.handleKeypadInput(buttonId, buttonInteraction);
                }
                
            } catch (error) {
                logger.error(`Keypad button handling error: ${error.message}`);
                if (!buttonInteraction.replied && !buttonInteraction.deferred) {
                    try {
                        await buttonInteraction.deferUpdate();
                    } catch (deferError) {
                        logger.error(`Failed to defer interaction: ${deferError.message}`);
                    }
                }
            }
        });

        this.collector.on('end', async (collected, reason) => {
            if (reason === 'time' && this.gamePhase === 'playing') {
                await this.handleGameTimeout();
            }
        });
    }

    /**
     * Handle keypad input (numbers, clear, enter)
     */
    async handleKeypadInput(buttonId, interaction) {
        if (buttonId === 'keypad_clear') {
            // Clear current input
            this.currentInput = '';
            
        } else if (buttonId === 'keypad_enter') {
            // Submit current input as guess
            if (this.currentInput === '' || this.currentInput === '0') {
                await interaction.followUp({
                    content: '❌ Please enter a number between 1-500!',
                    flags: 64
                });
                return;
            }
            
            const guess = parseInt(this.currentInput);
            if (guess < 1 || guess > 500) {
                await interaction.followUp({
                    content: '❌ Number must be between 1-500!',
                    flags: 64
                });
                return;
            }
            
            await interaction.followUp({
                content: `🔍 Analyzing guess: \`${guess}\`...`,
                flags: 64
            });
            
            this.currentInput = ''; // Clear input after submitting
            await this.processGuess(guess.toString());
            return;
            
        } else {
            // Number button pressed
            const digit = buttonId.replace('keypad_', '');
            
            // Don't allow numbers that would exceed 1000 or be too long
            if (this.currentInput.length >= 4) {
                await interaction.followUp({
                    content: '❌ Maximum 4 digits allowed!',
                    flags: 64
                });
                return;
            }
            
            // Don't allow leading zeros unless it's just "0"
            if (this.currentInput === '0' && digit !== '0') {
                this.currentInput = digit; // Replace "0" with the new digit
            } else if (this.currentInput === '' && digit === '0') {
                this.currentInput = '0'; // Allow single "0"
            } else if (this.currentInput === '0' && digit === '0') {
                return; // Don't allow multiple zeros
            } else {
                this.currentInput += digit;
            }
            
            // Check if the number would exceed 500
            const currentNumber = parseInt(this.currentInput);
            if (currentNumber > 500) {
                // Remove the last digit that caused it to exceed 500
                this.currentInput = this.currentInput.slice(0, -1);
                await interaction.followUp({
                    content: '❌ Number cannot exceed 500!',
                    flags: 64
                });
                return;
            }
        }
        
        // Update the keypad display
        await this.updateGameMessage(this.createKeypadButtons());
    }


    /**
     * Process a guess and provide feedback
     */
    async processGuess(guess) {
        try {
            const guessNumber = parseInt(guess);
            const feedback = this.analyzeFeedback(guessNumber);
            
            // Store the attempt
            this.attempts.push({
                guess: guess,
                feedback: feedback,
                attempt: this.currentAttempt
            });
            
            // Check if they got it right
            if (guessNumber === this.secretNumber) {
                // WIN!
                this.gamePhase = 'complete';
                await this.updateGameMessage([]);
                this.cleanup();
                return;
            }
            
            // Check if out of attempts
            if (this.currentAttempt >= this.maxAttempts) {
                // LOSE!
                this.gamePhase = 'failed';
                await this.updateGameMessage([]);
                this.cleanup();
                return;
            }
            
            // Continue playing
            this.currentAttempt++;
            await this.updateGameMessage(this.createKeypadButtons());
            
        } catch (error) {
            logger.error(`Process guess failed: ${error.message}`);
        }
    }

    /**
     * Analyze guess and provide higher/lower feedback
     */
    analyzeFeedback(guessNumber) {
        if (guessNumber === this.secretNumber) {
            return '🎯 **CORRECT!** You cracked the code!';
        } else if (guessNumber < this.secretNumber) {
            return '📈 **Higher** - The secret number is higher than your guess';
        } else {
            return '📉 **Lower** - The secret number is lower than your guess';
        }
    }

    /**
     * Handle game timeout
     */
    async handleGameTimeout() {
        try {
            this.gamePhase = 'failed';
            await this.updateGameMessage([]);
            this.cleanup();
        } catch (error) {
            logger.error(`Handle timeout failed: ${error.message}`);
        }
    }

    /**
     * Update game message
     */
    async updateGameMessage(components = []) {
        try {
            if (!this.gameMessage) return;
            
            const embed = this.createGameEmbed();
            await this.gameMessage.edit({
                embeds: [embed],
                components
            });
            
        } catch (error) {
            logger.error(`Update game message failed: ${error.message}`);
        }
    }

    /**
     * Setup game timeout
     */
    setupGameTimeout() {
        this.clearTimeout();
        this.timeoutHandler = setTimeout(async () => {
            if (this.gamePhase === 'playing') {
                await this.handleGameTimeout();
            }
        }, this.timeLimit);
    }

    /**
     * Utility methods for cleanup
     */
    clearTimeout() {
        if (this.timeoutHandler) {
            clearTimeout(this.timeoutHandler);
            this.timeoutHandler = null;
        }
    }

    clearCollector() {
        if (this.collector) {
            this.collector.stop();
            this.collector = null;
        }
    }


    cleanup() {
        this.clearTimeout();
        this.clearCollector();
    }
}

module.exports = KeypadCodeGame;