/**
 * Fast Button Tap Reaction Game - Quick Emoji Reaction Mini-Game for Heists
 * 
 * GAME RULES:
 * - Show one of three emojis: 🃏💎👑 quickly in chat
 * - Players must react with the correct emoji within 2 seconds
 * - 3 Lives total - lose a life for wrong reaction or timeout
 * - Random emoji selection using CSPRNG
 * - Fast-paced reaction testing game
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { secureRandomInt } = require('../../UTILS/rng');
const logger = require('../../UTILS/logger');

class ReactionGame {
    constructor(config) {
        this.userId = config.userId;
        this.username = config.username;
        this.channelId = config.channelId;
        this.guildId = config.guildId;
        
        // Game state
        this.lives = 3;
        this.score = 0;
        this.round = 1;
        this.maxRounds = 10;
        this.gamePhase = 'ready'; // 'ready', 'showing', 'waiting', 'complete', 'failed'
        this.gameMessage = null;
        this.client = null;
        this.collector = null;
        this.currentEmoji = null;
        this.reactionTimeout = null;
        this.userResponse = null;
        this.responseTime = null;
        
        // Game emojis for button reactions
        this.gameEmojis = [
            { 
                display: '🃏', 
                emoji: '🃏',
                id: 'joker',
                description: 'Joker'
            },
            { 
                display: '💎', 
                emoji: '💎',
                id: 'diamond',
                description: 'Diamond'
            },
            { 
                display: '👑', 
                emoji: '👑',
                id: 'crown',
                description: 'Crown'
            }
        ];
    }

    /**
     * Start the reaction game
     */
    async start(interaction) {
        this.client = interaction.client;
        
        try {
            // Create initial embed
            const embed = this.createGameEmbed();
            
            const reply = await interaction.editReply({
                embeds: [embed]
            });
            
            this.gameMessage = reply;
            
            // Start first round after brief delay
            await this.sleep(2000);
            await this.startRound();
            
        } catch (error) {
            logger.error(`Reaction game start failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Start a new round
     */
    async startRound() {
        try {
            if (this.round > this.maxRounds) {
                await this.handleGameComplete();
                return;
            }

            this.gamePhase = 'showing';
            
            // Select random emoji using CSPRNG
            const emojiIndex = secureRandomInt(0, this.gameEmojis.length);
            this.currentEmoji = this.gameEmojis[emojiIndex];
            
            // Show "GET READY" message
            const readyEmbed = new EmbedBuilder()
                .setTitle('⚡ FAST REACTION GAME')
                .setDescription(`**GET READY!**\n\nRound ${this.round}/${this.maxRounds}\n\nWatch for the emoji and react quickly!`)
                .addFields(
                    {
                        name: '📊 Game Status',
                        value: `**Lives:** ${'❤️'.repeat(this.lives)} ${this.lives < 3 ? '💔'.repeat(3 - this.lives) : ''}\n**Score:** ${this.score}\n**Round:** ${this.round}/${this.maxRounds}`,
                        inline: true
                    }
                )
                .setColor(0xFFA500)
                .setFooter({ text: 'React with the correct emoji within 2 seconds!' });

            await this.gameMessage.edit({ embeds: [readyEmbed] });
            
            // Random delay before showing emoji (0.5 to 2 seconds)
            const delay = 500 + secureRandomInt(0, 1500);
            await this.sleep(delay);
            
            // Show the emoji
            await this.showEmoji();
            
        } catch (error) {
            logger.error(`Reaction game round start failed: ${error.message}`);
        }
    }

    /**
     * Show the emoji and start button timer
     */
    async showEmoji() {
        try {
            this.gamePhase = 'waiting';
            this.userResponse = null;
            this.responseTime = Date.now();
            
            // Create large emoji display in code block for consistency
            const largeEmoji = this.currentEmoji.display.repeat(15); // 15 emojis in a row
            const emojiRows = [];
            
            // Create 2 rows of the emoji for a clear display
            for (let i = 0; i < 2; i++) {
                emojiRows.push(largeEmoji);
            }
            
            const emojiDisplay = emojiRows.join('\n');
            
            // Simple embed with large emoji in code block
            const emojiEmbed = new EmbedBuilder()
                .setDescription(`\`\`\`\n${emojiDisplay}\n\`\`\``)
                .setColor(0x000000);

            // Create buttons for all three emojis
            const buttons = this.createReactionButtons();
            
            await this.gameMessage.edit({ 
                embeds: [emojiEmbed], 
                components: [buttons]
            });
            
            // Set up button collector
            this.setupButtonHandler();
            
            // Set timeout for 1.5 seconds
            this.reactionTimeout = setTimeout(async () => {
                await this.evaluateResponse();
            }, 1500);
            
        } catch (error) {
            logger.error(`Reaction game show emoji failed: ${error.message}`);
        }
    }

    /**
     * Create simple reaction buttons
     */
    createReactionButtons() {
        const row = new ActionRowBuilder();
        
        // Add all three emoji buttons - simple and clean
        for (const emoji of this.gameEmojis) {
            const button = new ButtonBuilder()
                .setCustomId(`reaction_${emoji.id}`)
                .setEmoji(emoji.emoji)
                .setStyle(ButtonStyle.Secondary);
            row.addComponents(button);
        }
        
        return row;
    }
    
    /**
     * Setup button handler
     */
    setupButtonHandler() {
        if (!this.client || !this.gameMessage) return;

        const filter = (buttonInteraction) => {
            return buttonInteraction.customId.startsWith('reaction_') && 
                   buttonInteraction.user.id === this.userId;
        };

        // Clear any existing collector
        if (this.collector) {
            this.collector.stop();
        }

        this.collector = this.gameMessage.createMessageComponentCollector({
            filter,
            time: 2000 // Slightly longer than timeout
        });

        this.collector.on('collect', async (buttonInteraction) => {
            try {
                if (this.gamePhase !== 'waiting') {
                    await buttonInteraction.deferUpdate();
                    return;
                }
                
                // Record the user's response and timing first
                const clickedId = buttonInteraction.customId.split('_')[1];
                this.userResponse = clickedId;
                this.responseTime = Date.now() - this.responseTime;
                
                logger.debug(`Button clicked: ${clickedId}, Response time: ${this.responseTime}ms`);
                
                // Acknowledge the interaction by removing buttons
                await buttonInteraction.update({
                    embeds: [new EmbedBuilder()
                        .setTitle('⏳')
                        .setColor(0x000000)],
                    components: [] // Remove buttons
                });
                
            } catch (error) {
                logger.error(`Reaction game button handling error: ${error.message}`);
                try {
                    if (!buttonInteraction.replied && !buttonInteraction.deferred) {
                        await buttonInteraction.deferUpdate();
                    }
                } catch (deferError) {
                    logger.error(`Failed to defer interaction: ${deferError.message}`);
                }
            }
        });

        this.collector.on('end', () => {
            // Clean up handled in evaluateResponse
        });
    }

    /**
     * Evaluate the user's response after timeout
     */
    async evaluateResponse() {
        try {
            // Stop current collector
            if (this.collector) {
                this.collector.stop();
            }
            
            // Clear timeout
            if (this.reactionTimeout) {
                clearTimeout(this.reactionTimeout);
                this.reactionTimeout = null;
            }
            
            // Check if user responded and if it was correct
            if (this.userResponse === null) {
                // No response - timeout
                await this.handleTimeout();
            } else if (this.userResponse === this.currentEmoji.id) {
                // Correct response!
                logger.debug(`Correct response: ${this.userResponse} in ${this.responseTime}ms`);
                this.score += 10;
                await this.handleCorrectReaction();
            } else {
                // Wrong response
                logger.debug(`Wrong response: got "${this.userResponse}", expected "${this.currentEmoji.id}"`);
                await this.handleWrongReaction();
            }
            
        } catch (error) {
            logger.error(`Reaction game response evaluation failed: ${error.message}`);
        }
    }

    /**
     * Handle correct reaction
     */
    async handleCorrectReaction() {
        this.gamePhase = 'ready';
        
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ CORRECT REACTION!')
            .setDescription(`**Perfect response!** You clicked ${this.currentEmoji.emoji} correctly!\n\n⚡ **Response time: ${this.responseTime}ms**\n🎆 **+10 points**`)
            .addFields(
                {
                    name: '📊 Game Progress',
                    value: `**Round:** ${this.round}/${this.maxRounds}\n**Lives:** ${'❤️'.repeat(this.lives)}\n**Score:** ${this.score} points`,
                    inline: true
                },
                {
                    name: '🎯 Performance',
                    value: `**Reaction:** Excellent\n**Speed:** ${this.responseTime < 1000 ? 'Lightning' : 'Good'}\n**Accuracy:** Perfect`,
                    inline: true
                }
            )
            .setColor(0x00FF00)
            .setFooter({ text: 'Reaction Game - Great reflexes! Next round starting...' });

        await this.gameMessage.edit({ embeds: [successEmbed] });
        
        // Clear reactions for next round
        await this.clearComponents();
        
        // Move to next round
        this.round++;
        await this.sleep(1500);
        await this.startRound();
    }

    /**
     * Handle wrong reaction
     */
    async handleWrongReaction() {
        this.lives--;
        
        // Stop current collector
        if (this.collector) {
            this.collector.stop();
        }
        
        if (this.lives <= 0) {
            // Game over
            await this.handleGameOver();
        } else {
            // Try again
            this.gamePhase = 'ready';
            
            const wrongEmbed = new EmbedBuilder()
                .setTitle('❌ WRONG REACTION!')
                .setDescription(`**Incorrect!**\n\nYou should have reacted with ${this.currentEmoji.reaction}\n\n**Lost a life!**`)
                .addFields(
                    {
                        name: '📊 Game Status',
                        value: `**Lives:** ${'❤️'.repeat(this.lives)} ${this.lives < 3 ? '💔'.repeat(3 - this.lives) : ''}\n**Score:** ${this.score}\n**Round:** ${this.round}/${this.maxRounds}`,
                        inline: true
                    }
                )
                .setColor(0xFF4444)
                .setFooter({ text: 'Be more careful! Next round starting soon...' });

            await this.gameMessage.edit({ embeds: [wrongEmbed] });
            
            // Clear reactions
            await this.clearComponents();
            
            // Continue with next round
            this.round++;
            await this.sleep(2000);
            await this.startRound();
        }
    }

    /**
     * Handle timeout
     */
    async handleTimeout() {
        if (this.gamePhase !== 'waiting') return;
        
        this.lives--;
        
        // Stop current collector
        if (this.collector) {
            this.collector.stop();
        }
        
        // First show a suspenseful "processing" state  
        const processingEmbed = new EmbedBuilder()
            .setTitle('⏳ TIME UP!')
            .setDescription('**Evaluating...**')
            .setColor(0xFFAA00);
            
        await this.gameMessage.edit({ embeds: [processingEmbed], components: [] });
        await this.sleep(200); // Very short delay for timeout
        
        if (this.lives <= 0) {
            // Game over
            await this.handleGameOver();
        } else {
            // Try again
            this.gamePhase = 'ready';
            
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('⏰ TOO SLOW!')
                .setDescription(`**Time ran out!**\n\nYou had 1.5 seconds to click ${this.currentEmoji.emoji}\n\n⚡ **Be faster next time!**\n💔 **Lost a life!**`)
                .addFields(
                    {
                        name: '📊 Game Status',
                        value: `**Lives:** ${'❤️'.repeat(this.lives)} ${this.lives < 3 ? '💔'.repeat(3 - this.lives) : ''}\n**Score:** ${this.score}\n**Round:** ${this.round}/${this.maxRounds}`,
                        inline: true
                    }
                )
                .setColor(0xFFAA00)
                .setFooter({ text: 'Lightning reflexes needed! Next round starting...' });

            await this.gameMessage.edit({ embeds: [timeoutEmbed] });
            
            // Continue with next round
            this.round++;
            await this.sleep(2000);
            await this.startRound();
        }
    }

    /**
     * Handle game over
     */
    async handleGameOver() {
        this.gamePhase = 'failed';
        
        const gameOverEmbed = new EmbedBuilder()
            .setTitle('💀 GAME OVER!')
            .setDescription(`**You ran out of lives!**\n\nYour reflexes weren't fast enough for this heist.\nThe security system caught you!`)
            .addFields(
                {
                    name: '📊 Final Stats',
                    value: `**Final Score:** ${this.score}\n**Rounds Completed:** ${this.round - 1}/${this.maxRounds}\n**Lives:** 💔💔💔`,
                    inline: false
                }
            )
            .setColor(0xFF0000)
            .setFooter({ text: 'Reaction Game - Better luck next time!' });

        await this.gameMessage.edit({ embeds: [gameOverEmbed] });
        await this.clearComponents();
    }

    /**
     * Handle game completion
     */
    async handleGameComplete() {
        this.gamePhase = 'complete';
        
        const completeEmbed = new EmbedBuilder()
            .setTitle('🎉 REACTION MASTER!')
            .setDescription(`**Incredible reflexes!**\n\nYou completed all ${this.maxRounds} rounds!\nYour lightning-fast reactions got you through!`)
            .addFields(
                {
                    name: '📊 Final Stats',
                    value: `**Final Score:** ${this.score}\n**Rounds Completed:** ${this.maxRounds}/${this.maxRounds}\n**Lives:** ${'❤️'.repeat(this.lives)}`,
                    inline: false
                }
            )
            .setColor(0x00FF00)
            .setFooter({ text: 'Reaction Game - Perfect completion!' });

        await this.gameMessage.edit({ embeds: [completeEmbed] });
        await this.clearComponents();
    }

    /**
     * Create initial game embed
     */
    createGameEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('⚡ FAST REACTION GAME')
            .setDescription(`**Welcome to the Reaction Test!**\n\nWatch for emojis: 🃏💎👑\nReact with the correct emoji within 2 seconds!\n\n**Starting in 2 seconds...**`)
            .addFields(
                {
                    name: '📊 Game Status',
                    value: `**Lives:** ${'❤️'.repeat(this.lives)}\n**Score:** ${this.score}\n**Round:** ${this.round}/${this.maxRounds}`,
                    inline: true
                },
                {
                    name: '🎯 Rules',
                    value: `• React within 2 seconds\n• Use correct emoji reaction\n• 3 lives total\n• 10 points per correct reaction`,
                    inline: true
                }
            )
            .setColor(0x4169E1)
            .setFooter({ text: 'Reaction Game - Test your reflexes!' });

        return embed;
    }

    /**
     * Clear all components from game message
     */
    async clearComponents() {
        try {
            if (this.gameMessage) {
                await this.gameMessage.edit({ components: [] });
            }
        } catch (error) {
            // Ignore errors for component clearing
            logger.warn(`Could not clear components: ${error.message}`);
        }
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = ReactionGame;