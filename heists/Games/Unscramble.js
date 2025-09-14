/**
 * Unscramble Game - Word Unscrambling Mini-Game for Heists
 * 
 * GAME RULES:
 * - 3 words to unscramble total
 * - 30 seconds per word
 * - 3 lives total - lose a life for wrong answer or timeout
 * - Use Discord modal text input for answers
 * - Words selected from data/additional_words.txt and data/words.txt
 * - CSPRNG for secure random word selection
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { secureRandomInt } = require('../../UTILS/rng');
const logger = require('../../UTILS/logger');
const fs = require('fs');
const path = require('path');

class UnscrambleGame {
    constructor(config) {
        this.userId = config.userId;
        this.username = config.username;
        this.channelId = config.channelId;
        this.guildId = config.guildId;
        
        // Game state
        this.lives = 3;
        this.currentWord = 1;
        this.totalWords = 3;
        this.score = 0;
        this.gamePhase = 'ready'; // 'ready', 'waiting', 'complete', 'failed'
        this.gameMessage = null;
        this.client = null;
        this.timeoutHandler = null;
        this.collector = null;
        this.modalHandler = null;
        
        // Current word data
        this.originalWord = '';
        this.scrambledWord = '';
        this.startTime = null;
        
        // Word bank
        this.wordBank = [];
        this.loadWordBank();
    }

    /**
     * Load words from data files
     */
    loadWordBank() {
        try {
            // Load additional words (modern/slang words)
            const additionalWordsPath = path.join(__dirname, '../../data/additional_words.txt');
            if (fs.existsSync(additionalWordsPath)) {
                const additionalWords = fs.readFileSync(additionalWordsPath, 'utf8')
                    .split('\n')
                    .map(word => word.trim().toLowerCase())
                    .filter(word => word.length >= 4 && word.length <= 6); // Easier length range
                this.wordBank.push(...additionalWords);
            }
            
            // Load some easier words from main dictionary
            const wordsPath = path.join(__dirname, '../../data/words.txt');
            if (fs.existsSync(wordsPath)) {
                const mainWords = fs.readFileSync(wordsPath, 'utf8')
                    .split('\n')
                    .map(word => word.trim().toLowerCase())
                    .filter(word => 
                        word.length >= 4 && 
                        word.length <= 6 && // Shorter words for easier gameplay
                        /^[a-z]+$/.test(word) && // Only letters
                        !word.includes("'") && // No contractions
                        !word.includes('-') && // No hyphens
                        /[aeiou]/.test(word) // Must contain at least one vowel
                    )
                    .slice(2000, 2500); // Take common but not too obscure words
                this.wordBank.push(...mainWords);
            }
            
            logger.info(`Unscramble game loaded ${this.wordBank.length} words`);
            
        } catch (error) {
            logger.error(`Failed to load word bank: ${error.message}`);
            // Fallback easy word bank
            this.wordBank = [
                'house', 'money', 'cards', 'chips', 'dealer', 'table', 'wheel', 'lucky', 'prize', 'bonus',
                'casino', 'poker', 'slots', 'games', 'player', 'winner', 'chance', 'risky', 'stake', 'bluff',
                'royal', 'flush', 'trick', 'magic', 'skill', 'smart', 'quick', 'sharp', 'focus', 'alert'
            ];
        }
    }

    /**
     * Start the unscramble game
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
            
            // Start first word after brief delay
            await this.sleep(2000);
            await this.startWord();
            
        } catch (error) {
            logger.error(`Unscramble game start failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create game embed
     */
    createGameEmbed() {
        let description = '';
        
        if (this.gamePhase === 'ready') {
            description = `**🔤 UNSCRAMBLE CHALLENGE!**\n\nYou'll be given 3 scrambled words to solve.\nEach word has a 30-second time limit.\n\n**Starting in 2 seconds...**`;
        } else if (this.gamePhase === 'waiting') {
            const endTime = Math.floor((this.startTime + 45000) / 1000); // 45 seconds from start
            description = `**🎯 UNSCRAMBLE THIS WORD!**\n\nClick the button below to enter your answer:\n\n\`\`\`\n${this.scrambledWord.toUpperCase()}\n\`\`\`\n\n**⏱️ Ends:** <t:${endTime}:R>`;
        } else if (this.gamePhase === 'complete') {
            description = `**🎉 UNSCRAMBLE COMPLETE!**\n\nYou successfully unscrambled all 3 words!\nExcellent word skills!`;
        } else if (this.gamePhase === 'failed') {
            description = `**💀 GAME OVER!**\n\nYou ran out of lives. The security system detected you!\nWord unscrambling failed.`;
        }

        const embed = new EmbedBuilder()
            .setTitle('🔤 UNSCRAMBLE GAME - Word Puzzle')
            .setDescription(description)
            .addFields(
                {
                    name: '📊 Game Progress',
                    value: `**Word:** ${this.currentWord}/${this.totalWords}\n**Lives:** ${'❤️'.repeat(this.lives)} ${this.lives < 3 ? '💔'.repeat(3 - this.lives) : ''}\n**Score:** ${this.score} points`,
                    inline: true
                },
                {
                    name: '🎯 Your Progress',
                    value: `**Status:** ${this.getStatusText()}\n**Time Limit:** 45 seconds per word\n**Method:** Text input`,
                    inline: true
                }
            )
            .setColor(this.getEmbedColor())
            .setFooter({ text: 'Unscramble Game - Solve all 3 words to win!' });

        return embed;
    }

    /**
     * Get status text for embed
     */
    getStatusText() {
        switch (this.gamePhase) {
            case 'ready': return '🚀 Starting';
            case 'waiting': return '⏱️ Solving';
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
            case 'ready': return 0x4169E1; // Blue - starting
            case 'waiting': return 0xFFA500; // Orange - solving
            case 'complete': return 0x00FF00; // Green - success
            case 'failed': return 0xFF0000; // Red - failed
            default: return 0x4169E1;
        }
    }

    /**
     * Start a new word
     */
    async startWord() {
        try {
            if (this.currentWord > this.totalWords) {
                await this.handleGameComplete();
                return;
            }

            // Select random word using CSPRNG
            const wordIndex = secureRandomInt(0, this.wordBank.length);
            this.originalWord = this.wordBank[wordIndex];
            this.scrambledWord = this.scrambleWord(this.originalWord);
            
            logger.info(`Unscramble word ${this.currentWord}: "${this.originalWord}" scrambled to "${this.scrambledWord}"`);
            
            this.gamePhase = 'waiting';
            this.startTime = Date.now();
            
            // Show word with answer button
            const embed = this.createGameEmbed();
            const button = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('unscramble_answer')
                        .setLabel('📝 Enter Answer')
                        .setStyle(ButtonStyle.Primary)
                );
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: [button]
            });
            
            // Set up button handler and timeout
            this.setupButtonHandler();
            this.setupTimeout();
            
        } catch (error) {
            logger.error(`Unscramble start word failed: ${error.message}`);
        }
    }

    /**
     * Scramble a word using Fisher-Yates shuffle
     */
    scrambleWord(word) {
        const letters = word.toLowerCase().split('');
        let attempts = 0;
        let scrambled;
        
        // Keep trying until we get a different scrambled word
        do {
            const shuffled = [...letters];
            
            // Fisher-Yates shuffle with CSPRNG
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = secureRandomInt(0, i + 1);
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            
            scrambled = shuffled.join('');
            attempts++;
        } while (scrambled === word.toLowerCase() && attempts < 10);
        
        // If still same after 10 attempts, manually scramble
        if (scrambled === word.toLowerCase() && word.length > 3) {
            const letters = word.toLowerCase().split('');
            // Move first letter to middle
            const firstLetter = letters.shift();
            const midIndex = Math.floor(letters.length / 2);
            letters.splice(midIndex, 0, firstLetter);
            scrambled = letters.join('');
        }
        
        return scrambled;
    }

    /**
     * Setup button interaction handler
     */
    setupButtonHandler() {
        if (!this.client || !this.gameMessage) return;

        // Clean up existing collector
        if (this.collector) {
            this.collector.stop();
            this.collector = null;
        }

        const filter = (buttonInteraction) => {
            return buttonInteraction.customId === 'unscramble_answer' && 
                   buttonInteraction.user.id === this.userId;
        };

        this.collector = this.gameMessage.createMessageComponentCollector({
            filter,
            time: 50000, // Slightly longer than timeout
            max: 1 // Only collect one button press
        });

        this.collector.on('collect', async (buttonInteraction) => {
            try {
                if (this.gamePhase !== 'waiting') {
                    if (!buttonInteraction.replied && !buttonInteraction.deferred) {
                        await buttonInteraction.deferUpdate();
                    }
                    return;
                }
                
                await this.showAnswerModal(buttonInteraction);
                
            } catch (error) {
                logger.error(`Unscramble button handling error: ${error.message}`);
            }
        });

        this.collector.on('end', () => {
            this.collector = null;
        });
    }

    /**
     * Show modal for answer input
     */
    async showAnswerModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('unscramble_modal')
            .setTitle(`Unscramble: ${this.scrambledWord.toUpperCase()}`);

        const answerInput = new TextInputBuilder()
            .setCustomId('unscramble_input')
            .setLabel('Your Answer')
            .setPlaceholder('Enter the unscrambled word...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(20);

        const actionRow = new ActionRowBuilder().addComponents(answerInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
        
        // Set up modal handler
        this.setupModalHandler();
    }

    /**
     * Setup modal submission handler
     */
    setupModalHandler() {
        if (!this.client) return;

        // Clean up existing modal handler
        if (this.modalHandler) {
            this.client.removeListener('interactionCreate', this.modalHandler);
            this.modalHandler = null;
        }

        this.modalHandler = async (modalInteraction) => {
            try {
                if (!modalInteraction.isModalSubmit() || 
                    modalInteraction.customId !== 'unscramble_modal' || 
                    modalInteraction.user.id !== this.userId) {
                    return;
                }
                
                // Remove this listener immediately
                this.client.removeListener('interactionCreate', this.modalHandler);
                this.modalHandler = null;
                
                if (this.gamePhase !== 'waiting') {
                    if (!modalInteraction.replied && !modalInteraction.deferred) {
                        await modalInteraction.deferUpdate();
                    }
                    return;
                }
                
                const answer = modalInteraction.fields.getTextInputValue('unscramble_input').trim().toLowerCase();
                const responseTime = Date.now() - this.startTime;
                
                // Clear timeout
                if (this.timeoutHandler) {
                    clearTimeout(this.timeoutHandler);
                    this.timeoutHandler = null;
                }
                
                await modalInteraction.deferUpdate();
                await this.handleAnswer(answer, responseTime);
                
            } catch (error) {
                logger.error(`Unscramble modal handling error: ${error.message}`);
            }
        };
        
        this.client.on('interactionCreate', this.modalHandler);
    }

    /**
     * Setup 30-second timeout
     */
    setupTimeout() {
        if (this.timeoutHandler) {
            clearTimeout(this.timeoutHandler);
        }
        
        this.timeoutHandler = setTimeout(async () => {
            if (this.gamePhase === 'waiting') {
                await this.handleTimeout();
            }
        }, 45000); // 45 seconds
    }

    /**
     * Handle user answer
     */
    async handleAnswer(answer, responseTime) {
        try {
            if (answer === this.originalWord.toLowerCase()) {
                // Correct answer!
                this.score += Math.max(10, Math.floor(50 - (responseTime / 1000))); // More points for speed
                await this.handleCorrectAnswer(responseTime);
            } else {
                // Wrong answer
                await this.handleWrongAnswer(answer);
            }
            
        } catch (error) {
            logger.error(`Unscramble answer handling failed: ${error.message}`);
        }
    }

    /**
     * Handle correct answer
     */
    async handleCorrectAnswer(responseTime) {
        this.gamePhase = 'ready';
        
        const points = Math.max(10, Math.floor(50 - (responseTime / 1000)));
        const speedRating = responseTime < 5000 ? 'Lightning' : responseTime < 15000 ? 'Quick' : 'Steady';
        
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ CORRECT!')
            .setDescription(`**Perfect!** You unscrambled "${this.scrambledWord}" correctly!\n\n**Original word:** ${this.originalWord.toUpperCase()}\n**Response time:** ${Math.floor(responseTime / 1000)}s\n**Points earned:** +${points}`)
            .addFields(
                {
                    name: '📊 Game Progress',
                    value: `**Word:** ${this.currentWord}/${this.totalWords}\n**Lives:** ${'❤️'.repeat(this.lives)}\n**Score:** ${this.score} points`,
                    inline: true
                },
                {
                    name: '🎯 Performance',
                    value: `**Speed:** ${speedRating}\n**Accuracy:** Perfect\n**Bonus:** Speed bonus applied`,
                    inline: true
                }
            )
            .setColor(0x00FF00)
            .setFooter({ text: 'Unscramble Game - Excellent word skills!' });

        await this.gameMessage.edit({
            embeds: [successEmbed],
            components: []
        });
        
        // Move to next word
        this.currentWord++;
        await this.sleep(2000);
        await this.startWord();
    }

    /**
     * Handle wrong answer
     */
    async handleWrongAnswer(answer) {
        this.lives--;
        
        if (this.lives <= 0) {
            // Game over
            await this.handleGameOver();
        } else {
            // Try again with same word
            const wrongEmbed = new EmbedBuilder()
                .setTitle('❌ INCORRECT!')
                .setDescription(`**Wrong answer!** "${answer.toUpperCase()}" is not correct.\n\n**Scrambled word:** ${this.scrambledWord.toUpperCase()}\n**Your answer:** ${answer.toUpperCase()}\n\n**💔 Lost a life!**`)
                .addFields(
                    {
                        name: '📊 Game Progress',
                        value: `**Word:** ${this.currentWord}/${this.totalWords}\n**Lives:** ${'❤️'.repeat(this.lives)} ${this.lives < 3 ? '💔'.repeat(3 - this.lives) : ''}\n**Score:** ${this.score} points`,
                        inline: true
                    },
                    {
                        name: '🎯 Performance',
                        value: `**Accuracy:** Failed\n**Attempt:** Incorrect\n**Status:** Try again`,
                        inline: true
                    }
                )
                .setColor(0xFF4444)
                .setFooter({ text: 'Unscramble Game - Think harder and try again!' });

            await this.gameMessage.edit({
                embeds: [wrongEmbed],
                components: []
            });
            
            await this.sleep(3000);
            
            // Same word again but re-scrambled
            this.scrambledWord = this.scrambleWord(this.originalWord);
            this.startTime = Date.now();
            this.gamePhase = 'waiting';
            
            const retryEmbed = this.createGameEmbed();
            const button = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('unscramble_answer')
                        .setLabel('📝 Try Again')
                        .setStyle(ButtonStyle.Primary)
                );
            
            await this.gameMessage.edit({
                embeds: [retryEmbed],
                components: [button]
            });
            
            this.setupButtonHandler();
            this.setupTimeout();
        }
    }

    /**
     * Handle timeout
     */
    async handleTimeout() {
        this.lives--;
        
        if (this.lives <= 0) {
            await this.handleGameOver();
        } else {
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('⏰ TIME UP!')
                .setDescription(`**Time ran out!** You had 45 seconds to unscramble:\n\n**Scrambled word:** ${this.scrambledWord.toUpperCase()}\n**Correct answer:** ${this.originalWord.toUpperCase()}\n\n**💔 Lost a life!**`)
                .addFields(
                    {
                        name: '📊 Game Progress',
                        value: `**Word:** ${this.currentWord}/${this.totalWords}\n**Lives:** ${'❤️'.repeat(this.lives)} ${this.lives < 3 ? '💔'.repeat(3 - this.lives) : ''}\n**Score:** ${this.score} points`,
                        inline: true
                    },
                    {
                        name: '🎯 Performance',
                        value: `**Speed:** Too slow\n**Time:** >30s\n**Status:** Timeout`,
                        inline: true
                    }
                )
                .setColor(0xFFAA00)
                .setFooter({ text: 'Unscramble Game - Be faster next time!' });

            await this.gameMessage.edit({
                embeds: [timeoutEmbed],
                components: []
            });
            
            // Move to next word
            this.currentWord++;
            await this.sleep(3000);
            await this.startWord();
        }
    }

    /**
     * Handle game completion
     */
    async handleGameComplete() {
        this.gamePhase = 'complete';
        
        // Clean up all listeners and timers
        this.cleanup();
        
        const completeEmbed = new EmbedBuilder()
            .setTitle('🎉 UNSCRAMBLE MASTER!')
            .setDescription(`**Incredible word skills!** You unscrambled all ${this.totalWords} words!\n\nYour vocabulary expertise got you through the security!`)
            .addFields(
                {
                    name: '📊 Final Stats',
                    value: `**Words solved:** ${this.totalWords}/${this.totalWords}\n**Lives remaining:** ${'❤️'.repeat(this.lives)}\n**Final score:** ${this.score} points`,
                    inline: false
                }
            )
            .setColor(0x00FF00)
            .setFooter({ text: 'Unscramble Game - Perfect completion!' });

        await this.gameMessage.edit({
            embeds: [completeEmbed],
            components: []
        });
    }

    /**
     * Handle game over
     */
    async handleGameOver() {
        this.gamePhase = 'failed';
        
        // Clean up all listeners and timers
        this.cleanup();
        
        const gameOverEmbed = new EmbedBuilder()
            .setTitle('💀 GAME OVER!')
            .setDescription(`**You ran out of lives!** Your word skills weren't enough for this heist.\n\nThe security system caught you!`)
            .addFields(
                {
                    name: '📊 Final Stats',
                    value: `**Words solved:** ${this.currentWord - 1}/${this.totalWords}\n**Lives:** 💔💔💔\n**Final score:** ${this.score} points`,
                    inline: false
                }
            )
            .setColor(0xFF0000)
            .setFooter({ text: 'Unscramble Game - Better luck next time!' });

        await this.gameMessage.edit({
            embeds: [gameOverEmbed],
            components: []
        });
    }

    /**
     * Clean up all listeners and timers
     */
    cleanup() {
        // Clear timeout
        if (this.timeoutHandler) {
            clearTimeout(this.timeoutHandler);
            this.timeoutHandler = null;
        }
        
        // Clean up collector
        if (this.collector) {
            this.collector.stop();
            this.collector = null;
        }
        
        // Clean up modal handler
        if (this.modalHandler && this.client) {
            this.client.removeListener('interactionCreate', this.modalHandler);
            this.modalHandler = null;
        }
    }
    
    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = UnscrambleGame;