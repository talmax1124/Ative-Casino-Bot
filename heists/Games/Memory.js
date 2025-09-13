/**
 * Memory The Game - Pattern Memorization Mini-Game for Heists
 * 
 * GAME RULES:
 * - Use disabled buttons to show the pattern first
 * - Then edit the buttons to enable it for the user to repeat
 * - Do random patterns of increasing length until 4 rounds are complete
 * - 3 Lives total
 * - CSPRNG for pattern generation
 * 
 * PROGRESSION:
 * Round 1: 3 buttons in sequence
 * Round 2: 4 buttons in sequence  
 * Round 3: 5 buttons in sequence
 * Round 4: 6 buttons in sequence (final round)
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { secureRandomInt } = require('../../UTILS/rng');
const logger = require('../../UTILS/logger');

class MemoryGame {
    constructor(config) {
        this.userId = config.userId;
        this.username = config.username;
        this.channelId = config.channelId;
        this.guildId = config.guildId;
        
        // Game state
        this.currentRound = 1;
        this.maxRounds = 4;
        this.lives = 3;
        this.pattern = [];
        this.userInput = [];
        this.gamePhase = 'showing'; // 'showing', 'waiting', 'complete', 'failed'
        this.gameMessage = null;
        this.client = null;
        this.collector = null;
        
        // Button configuration - 9 buttons in 3x3 grid
        this.buttonCount = 9;
        this.buttonEmojis = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤'];
    }

    /**
     * Start the memory game
     */
    async start(interaction) {
        this.client = interaction.client;
        
        try {
            // Generate pattern for round 1 (3 buttons)
            this.generatePattern();
            
            // Create initial embed and show pattern
            const embed = this.createGameEmbed();
            const components = this.createButtons(true); // Start with disabled buttons
            
            const reply = await interaction.editReply({
                embeds: [embed],
                components: components
            });
            
            this.gameMessage = reply;
            
            // Show pattern sequence
            await this.showPattern();
            
        } catch (error) {
            logger.error(`Memory game start failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate random pattern for current round using CSPRNG
     */
    generatePattern() {
        const patternLength = 2 + this.currentRound; // Round 1=3, Round 2=4, Round 3=5, Round 4=6
        this.pattern = [];
        
        for (let i = 0; i < patternLength; i++) {
            // Use CSPRNG to generate secure random button indices
            const buttonIndex = secureRandomInt(0, this.buttonCount);
            this.pattern.push(buttonIndex);
        }
        
        logger.info(`Memory game pattern generated for round ${this.currentRound}: length ${patternLength}`);
    }

    /**
     * Create game embed
     */
    createGameEmbed() {
        const patternLength = 2 + this.currentRound;
        
        let description = '';
        if (this.gamePhase === 'showing') {
            description = `**🧠 MEMORIZE THE PATTERN!**\n\nWatch carefully as the buttons light up in sequence.\nYou'll need to repeat the pattern exactly.\n\n`;
        } else if (this.gamePhase === 'waiting') {
            description = `**🎯 REPEAT THE PATTERN!**\n\nClick the buttons in the same order you saw them light up.\n\n`;
        } else if (this.gamePhase === 'complete') {
            description = `**🎉 MEMORY GAME COMPLETE!**\n\nYou successfully completed all 4 rounds!\nExcellent memory skills!\n\n`;
        } else if (this.gamePhase === 'failed') {
            description = `**💀 GAME OVER!**\n\nYou ran out of lives. The security system detected you!\nPattern memorization failed.\n\n`;
        }

        const embed = new EmbedBuilder()
            .setTitle('🧠 MEMORY GAME - Pattern Memorization')
            .setDescription(description)
            .addFields(
                {
                    name: '📊 Game Progress',
                    value: `**Round:** ${this.currentRound}/${this.maxRounds}\n**Pattern Length:** ${patternLength} buttons\n**Lives:** ${'❤️'.repeat(this.lives)} ${this.lives < 3 ? '💔'.repeat(3 - this.lives) : ''}`,
                    inline: true
                },
                {
                    name: '🎯 Your Progress',
                    value: `**Input:** ${this.userInput.length}/${this.pattern.length}\n**Status:** ${this.getStatusText()}`,
                    inline: true
                }
            )
            .setColor(this.getEmbedColor())
            .setFooter({ text: 'Memory Game - Complete all 4 rounds to win!' });

        return embed;
    }

    /**
     * Get status text for embed
     */
    getStatusText() {
        switch (this.gamePhase) {
            case 'showing': return '👀 Watching pattern';
            case 'waiting': return '🤔 Your turn to input';
            case 'complete': return '🎉 Victory!';
            case 'failed': return '💀 Failed';
            default: return 'Playing...';
        }
    }

    /**
     * Get embed color based on game state
     */
    getEmbedColor() {
        switch (this.gamePhase) {
            case 'showing': return 0x4169E1; // Blue - watching
            case 'waiting': return 0xFFA500; // Orange - input time
            case 'complete': return 0x00FF00; // Green - success
            case 'failed': return 0xFF0000; // Red - failed
            default: return 0x4169E1;
        }
    }

    /**
     * Create button grid (3x3)
     */
    createButtons(disabled = false) {
        const components = [];
        
        // Create 3 rows of 3 buttons each
        for (let row = 0; row < 3; row++) {
            const actionRow = new ActionRowBuilder();
            
            for (let col = 0; col < 3; col++) {
                const buttonIndex = row * 3 + col;
                const emoji = this.buttonEmojis[buttonIndex];
                
                const button = new ButtonBuilder()
                    .setCustomId(`memory_btn_${buttonIndex}`)
                    .setEmoji(emoji)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled);
                
                actionRow.addComponents(button);
            }
            
            components.push(actionRow);
        }
        
        return components;
    }

    /**
     * Show the pattern sequence with visual effects
     */
    async showPattern() {
        try {
            this.gamePhase = 'showing';
            
            // Wait a moment before starting
            await this.sleep(1000);
            
            // Show each button in the pattern
            for (let i = 0; i < this.pattern.length; i++) {
                const buttonIndex = this.pattern[i];
                
                // Light up the button (make it green and primary)
                const components = this.createButtons(true);
                const targetRow = Math.floor(buttonIndex / 3);
                const targetCol = buttonIndex % 3;
                
                components[targetRow].components[targetCol]
                    .setStyle(ButtonStyle.Success)
                    .setLabel(`${i + 1}`); // Show sequence number
                
                const embed = this.createGameEmbed();
                try {
                    await this.gameMessage.edit({
                        embeds: [embed],
                        components: components
                    });
                } catch (error) {
                    if (error.message.includes('Unknown interaction')) {
                        logger.warn('Memory game: Interaction expired, game may have ended');
                        return;
                    }
                    throw error;
                }
                
                // Keep lit for 800ms
                await this.sleep(800);
                
                // Turn off (back to normal)
                const normalComponents = this.createButtons(true);
                try {
                    await this.gameMessage.edit({
                        embeds: [embed],
                        components: normalComponents
                    });
                } catch (error) {
                    if (error.message.includes('Unknown interaction')) {
                        logger.warn('Memory game: Interaction expired during pattern display');
                        return;
                    }
                    throw error;
                }
                
                // Short pause between buttons
                if (i < this.pattern.length - 1) {
                    await this.sleep(400);
                }
            }
            
            // Wait a moment then enable buttons for user input
            await this.sleep(1000);
            this.gamePhase = 'waiting';
            this.userInput = [];
            
            const embed = this.createGameEmbed();
            const enabledComponents = this.createButtons(false);
            
            try {
                await this.gameMessage.edit({
                    embeds: [embed],
                    components: enabledComponents
                });
            } catch (error) {
                if (error.message.includes('Unknown interaction')) {
                    logger.warn('Memory game: Interaction expired while enabling buttons');
                    return;
                }
                throw error;
            }
            
            // Set up button listener AFTER buttons are enabled
            // This ensures the timer only starts when user can actually input
            this.setupButtonHandler();
            
        } catch (error) {
            logger.error(`Memory game show pattern failed: ${error.message}`);
        }
    }

    /**
     * Setup button interaction handler
     */
    setupButtonHandler() {
        if (!this.client || !this.gameMessage) return;

        const filter = (buttonInteraction) => {
            return buttonInteraction.customId.startsWith('memory_btn_') && 
                   buttonInteraction.user.id === this.userId;
        };

        // Clear any existing collector
        if (this.collector) {
            this.collector.stop();
        }

        this.collector = this.gameMessage.createMessageComponentCollector({
            filter,
            time: 45000 // 45 seconds to input (more generous)
        });

        this.collector.on('collect', async (buttonInteraction) => {
            try {
                await buttonInteraction.deferUpdate();
                
                if (this.gamePhase !== 'waiting') return;
                
                const buttonIndex = parseInt(buttonInteraction.customId.split('_')[2]);
                await this.handleButtonPress(buttonIndex);
            } catch (error) {
                if (error.message.includes('already been acknowledged')) {
                    // Ignore duplicate acknowledgment errors
                    return;
                }
                logger.error(`Memory game button interaction error: ${error.message}`);
            }
        });

        this.collector.on('end', async (collected, reason) => {
            if (reason === 'time' && this.gamePhase === 'waiting') {
                await this.handleTimeout();
            }
        });
    }

    /**
     * Handle button press
     */
    async handleButtonPress(buttonIndex) {
        try {
            this.userInput.push(buttonIndex);
            
            // Check if this button is correct
            const currentStep = this.userInput.length - 1;
            const expectedButton = this.pattern[currentStep];
            
            if (buttonIndex !== expectedButton) {
                // Wrong button - lose a life
                await this.handleWrongInput();
                return;
            }
            
            // Correct button - check if pattern is complete
            if (this.userInput.length === this.pattern.length) {
                // Pattern complete - advance to next round or win
                await this.handleRoundComplete();
            } else {
                // Continue with current round - update display
                const embed = this.createGameEmbed();
                const components = this.createButtons(false);
                
                try {
                    await this.gameMessage.edit({
                        embeds: [embed],
                        components: components
                    });
                } catch (error) {
                    if (error.message.includes('Unknown interaction')) {
                        logger.warn('Memory game: Interaction expired during button press update');
                        return;
                    }
                    throw error;
                }
            }
            
        } catch (error) {
            logger.error(`Memory game button press failed: ${error.message}`);
        }
    }

    /**
     * Handle wrong input
     */
    async handleWrongInput() {
        this.lives--;
        
        // Stop current collector
        if (this.collector) {
            this.collector.stop();
        }
        
        if (this.lives <= 0) {
            // Game over
            this.gamePhase = 'failed';
            const embed = this.createGameEmbed();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: []
            });
        } else {
            // Try again with same pattern
            this.userInput = [];
            
            // Show failure message briefly
            const failEmbed = new EmbedBuilder()
                .setTitle('❌ Wrong Pattern!')
                .setDescription(`That's not right! You lost a life.\n\n**Lives remaining:** ${'❤️'.repeat(this.lives)}\n\nTrying again in 2 seconds...`)
                .setColor(0xFF4444);
            
            await this.gameMessage.edit({
                embeds: [failEmbed],
                components: []
            });
            
            await this.sleep(2000);
            
            // Show pattern again
            await this.showPattern();
        }
    }

    /**
     * Handle round completion
     */
    async handleRoundComplete() {
        // Stop current collector
        if (this.collector) {
            this.collector.stop();
        }
        
        if (this.currentRound >= this.maxRounds) {
            // Game complete!
            this.gamePhase = 'complete';
            const embed = this.createGameEmbed();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: []
            });
        } else {
            // Advance to next round
            this.currentRound++;
            
            // Show success message
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Round Complete!')
                .setDescription(`Perfect! You remembered the pattern correctly.\n\n**Round ${this.currentRound - 1} Complete**\n\nStarting Round ${this.currentRound} in 3 seconds...`)
                .setColor(0x00FF00);
            
            await this.gameMessage.edit({
                embeds: [successEmbed],
                components: []
            });
            
            await this.sleep(3000);
            
            // Generate new pattern and continue
            this.generatePattern();
            await this.showPattern();
        }
    }

    /**
     * Handle timeout
     */
    async handleTimeout() {
        this.lives--;
        
        // Stop current collector
        if (this.collector) {
            this.collector.stop();
        }
        
        if (this.lives <= 0) {
            this.gamePhase = 'failed';
            const embed = this.createGameEmbed();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: []
            });
        } else {
            // Try again
            this.userInput = [];
            
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('⏰ Time\'s Up!')
                .setDescription(`You took too long! You lost a life.\n\n**Lives remaining:** ${'❤️'.repeat(this.lives)}\n\nTrying again in 2 seconds...`)
                .setColor(0xFFAA00);
            
            await this.gameMessage.edit({
                embeds: [timeoutEmbed],
                components: []
            });
            
            await this.sleep(2000);
            await this.showPattern();
        }
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = MemoryGame;