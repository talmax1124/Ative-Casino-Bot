/**
 * Simon Says Digital Game - Emoji Sequence Memory Mini-Game for Heists
 * 
 * GAME RULES:
 * - Bot shows a sequence of colored emojis (🔵🟡🔴)
 * - Player must repeat the sequence in exact order using buttons
 * - Each round adds more emojis to the sequence
 * - Wrong order results in losing a life
 * - 3 Lives total
 * - CSPRNG for sequence generation
 * 
 * PROGRESSION:
 * Round 1: 3 emojis
 * Round 2: 4 emojis  
 * Round 3: 5 emojis
 * Round 4: 6 emojis
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { secureRandomInt } = require('../../UTILS/rng');
const logger = require('../../UTILS/logger');

class SimonSaysDigitalGame {
    constructor(config) {
        this.userId = config.userId;
        this.username = config.username;
        this.channelId = config.channelId;
        this.guildId = config.guildId;
        
        // Game state
        this.currentRound = 1;
        this.maxRounds = 4;
        this.lives = 3;
        this.gamePhase = 'showing'; // 'showing', 'waiting', 'complete', 'failed'
        this.gameMessage = null;
        this.client = null;
        this.collector = null;
        
        // Emoji configuration for Simon Says
        this.emojis = [
            { emoji: '🔵', name: 'Blue Circle', id: 'blue' },
            { emoji: '🟡', name: 'Yellow Circle', id: 'yellow' },
            { emoji: '🔴', name: 'Red Circle', id: 'red' },
            { emoji: '🟢', name: 'Green Circle', id: 'green' },
            { emoji: '🟣', name: 'Purple Circle', id: 'purple' },
            { emoji: '🟠', name: 'Orange Circle', id: 'orange' }
        ];
        
        // Current round data
        this.sequence = [];
        this.playerInput = [];
        this.currentStep = 0;
    }

    async start(interaction) {
        this.client = interaction.client;
        
        try {
            this.generateSequence();
            
            const embed = this.createGameEmbed();
            const components = this.createEmojiButtons(true); // Start disabled during sequence display
            
            const reply = await interaction.editReply({
                embeds: [embed],
                components: components
            });
            
            this.gameMessage = reply;
            
            // Show the sequence first
            await this.showSequence();
            
        } catch (error) {
            logger.error(`Simon Says Digital game start failed: ${error.message}`);
            throw error;
        }
    }

    generateSequence() {
        const sequenceLength = 2 + this.currentRound; // Round 1=3, Round 2=4, etc.
        
        this.sequence = [];
        for (let i = 0; i < sequenceLength; i++) {
            const randomIndex = secureRandomInt(0, this.emojis.length);
            this.sequence.push(this.emojis[randomIndex].id);
        }
        
        logger.info(`Simon Says Digital round ${this.currentRound} generated: sequence length ${sequenceLength}, sequence: ${this.sequence.join(',')}`);
    }

    createGameEmbed() {
        const sequenceLength = 2 + this.currentRound;
        
        let description = '';
        
        if (this.gamePhase === 'showing') {
            description = `**🎮 SIMON SAYS DIGITAL**\n\n` +
                         `**MEMORIZE THE SEQUENCE!**\n\n` +
                         `Watch carefully as the emojis appear in order.\n` +
                         `You'll need to repeat the exact sequence using the buttons below.\n\n` +
                         `**Current Sequence:** ${this.getSequenceDisplay()}\n\n` +
                         `⚠️ **Pay attention** - the sequence will be shown step by step!`;
        } else if (this.gamePhase === 'waiting') {
            description = `**🎯 REPEAT THE SEQUENCE!**\n\n` +
                         `Click the emoji buttons in the same order you saw them.\n\n` +
                         `**Target Sequence:** ${this.getSequenceDisplay()}\n` +
                         `**Your Progress:** ${this.getPlayerProgress()}\n\n` +
                         `Click the emojis in order:`;
        } else if (this.gamePhase === 'complete') {
            description = `**🎉 SIMON SAYS COMPLETE!**\n\n` +
                         `You successfully repeated all sequences!\n` +
                         `Perfect memory and timing!\n\n` +
                         `**Mission Status:** SUCCESS ✅`;
        } else if (this.gamePhase === 'failed') {
            description = `**💀 SEQUENCE FAILED!**\n\n` +
                         `You couldn't follow Simon's commands!\n` +
                         `The digital security system detected the error!\n\n` +
                         `**Mission Status:** FAILED ❌`;
        }

        const embed = new EmbedBuilder()
            .setTitle('🎮 SIMON SAYS DIGITAL')
            .setDescription(description)
            .addFields(
                {
                    name: '📊 Memory Progress',
                    value: `**Round:** ${this.currentRound}/${this.maxRounds}\n**Sequence Length:** ${sequenceLength} emojis\n**Lives:** ${'❤️'.repeat(this.lives)} ${this.lives < 3 ? '💔'.repeat(3 - this.lives) : ''}`,
                    inline: true
                },
                {
                    name: '🎯 Status',
                    value: this.getStatusText(),
                    inline: true
                }
            )
            .setColor(this.getEmbedColor())
            .setFooter({ text: 'Simon Says Digital - Follow the sequence exactly!' });

        return embed;
    }

    getSequenceDisplay() {
        if (this.gamePhase === 'showing') {
            // During showing phase, show progress of what's been revealed
            return this.sequence.slice(0, this.currentStep + 1)
                .map(id => this.emojis.find(e => e.id === id).emoji)
                .join(' ') + (this.currentStep < this.sequence.length - 1 ? ' ?' : '');
        } else {
            // During waiting phase, show full sequence
            return this.sequence
                .map(id => this.emojis.find(e => e.id === id).emoji)
                .join(' ');
        }
    }

    getPlayerProgress() {
        const playerEmojis = this.playerInput
            .map(id => this.emojis.find(e => e.id === id).emoji)
            .join(' ');
        
        const remaining = this.sequence.length - this.playerInput.length;
        const placeholder = '❓'.repeat(remaining);
        
        return `${playerEmojis}${playerEmojis ? ' ' : ''}${placeholder} (${this.playerInput.length}/${this.sequence.length})`;
    }

    getStatusText() {
        switch (this.gamePhase) {
            case 'showing': return '👀 Watching sequence...';
            case 'waiting': return '🤔 Your turn to repeat';
            case 'complete': return '🎉 Perfect Memory!';
            case 'failed': return '💀 Sequence Failed!';
            default: return 'Playing...';
        }
    }

    getEmbedColor() {
        switch (this.gamePhase) {
            case 'showing': return 0x4169E1; // Blue - watching
            case 'waiting': return 0xFFA500; // Orange - input time
            case 'complete': return 0x00FF00; // Green - success
            case 'failed': return 0xFF0000; // Red - failed
            default: return 0x4169E1;
        }
    }

    createEmojiButtons(disabled = false) {
        const components = [];
        
        // Create 2 rows of 3 buttons each
        for (let row = 0; row < 2; row++) {
            const actionRow = new ActionRowBuilder();
            
            for (let col = 0; col < 3; col++) {
                const emojiIndex = row * 3 + col;
                if (emojiIndex < this.emojis.length) {
                    const emojiData = this.emojis[emojiIndex];
                    
                    const button = new ButtonBuilder()
                        .setCustomId(`simon_${emojiData.id}`)
                        .setEmoji(emojiData.emoji)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(disabled);
                    
                    actionRow.addComponents(button);
                }
            }
            
            if (actionRow.components.length > 0) {
                components.push(actionRow);
            }
        }
        
        return components;
    }

    async showSequence() {
        try {
            this.gamePhase = 'showing';
            this.currentStep = 0;
            
            // Wait a moment before starting
            await this.sleep(1000);
            
            // Show each emoji in the sequence one by one
            for (let i = 0; i < this.sequence.length; i++) {
                this.currentStep = i;
                const currentEmojiId = this.sequence[i];
                
                // Light up the current emoji (make it green and primary)
                const components = this.createEmojiButtons(true);
                const targetEmoji = this.emojis.find(e => e.id === currentEmojiId);
                
                // Find and highlight the button
                for (const row of components) {
                    for (const button of row.components) {
                        if (button.data.custom_id === `simon_${currentEmojiId}`) {
                            button.setStyle(ButtonStyle.Success);
                            break;
                        }
                    }
                }
                
                const embed = this.createGameEmbed();
                try {
                    await this.gameMessage.edit({
                        embeds: [embed],
                        components: components
                    });
                } catch (error) {
                    if (error.message.includes('Unknown interaction')) {
                        logger.warn('Simon Says Digital: Interaction expired during sequence display');
                        return;
                    }
                    throw error;
                }
                
                // Keep lit for 1 second
                await this.sleep(1000);
                
                // Turn off (back to normal)
                const normalComponents = this.createEmojiButtons(true);
                try {
                    await this.gameMessage.edit({
                        embeds: [embed],
                        components: normalComponents
                    });
                } catch (error) {
                    if (error.message.includes('Unknown interaction')) {
                        logger.warn('Simon Says Digital: Interaction expired during sequence reset');
                        return;
                    }
                    throw error;
                }
                
                // Short pause between emojis
                if (i < this.sequence.length - 1) {
                    await this.sleep(500);
                }
            }
            
            // Wait a moment then enable buttons for user input
            await this.sleep(1000);
            this.gamePhase = 'waiting';
            this.playerInput = [];
            
            const embed = this.createGameEmbed();
            const enabledComponents = this.createEmojiButtons(false);
            
            try {
                await this.gameMessage.edit({
                    embeds: [embed],
                    components: enabledComponents
                });
            } catch (error) {
                if (error.message.includes('Unknown interaction')) {
                    logger.warn('Simon Says Digital: Interaction expired while enabling buttons');
                    return;
                }
                throw error;
            }
            
            this.setupButtonHandler();
            
        } catch (error) {
            logger.error(`Simon Says Digital show sequence failed: ${error.message}`);
        }
    }

    setupButtonHandler() {
        if (!this.client || !this.gameMessage) return;

        const filter = (buttonInteraction) => {
            return buttonInteraction.customId.startsWith('simon_') && 
                   buttonInteraction.user.id === this.userId;
        };

        if (this.collector) {
            this.collector.stop();
        }

        this.collector = this.gameMessage.createMessageComponentCollector({
            filter,
            time: 60000 // 60 seconds to complete sequence
        });

        this.collector.on('collect', async (buttonInteraction) => {
            try {
                await buttonInteraction.deferUpdate();
                
                if (this.gamePhase !== 'waiting') return;
                
                const emojiId = buttonInteraction.customId.split('_')[1];
                await this.handleEmojiPress(emojiId);
            } catch (error) {
                if (error.message.includes('already been acknowledged')) {
                    return;
                }
                logger.error(`Simon Says Digital button interaction error: ${error.message}`);
            }
        });

        this.collector.on('end', async (_, reason) => {
            if (reason === 'time' && this.gamePhase === 'waiting') {
                await this.handleTimeout();
            }
        });
    }

    async handleEmojiPress(emojiId) {
        try {
            this.playerInput.push(emojiId);
            
            // Check if this emoji is correct for current position
            const currentPosition = this.playerInput.length - 1;
            const expectedEmojiId = this.sequence[currentPosition];
            
            if (emojiId !== expectedEmojiId) {
                // Wrong emoji - lose a life
                await this.handleWrongInput();
                return;
            }
            
            // Correct emoji - check if sequence is complete
            if (this.playerInput.length === this.sequence.length) {
                // Sequence complete - advance to next round or win
                await this.handleRoundComplete();
            } else {
                // Continue with current sequence - update display
                const embed = this.createGameEmbed();
                const components = this.createEmojiButtons(false);
                
                try {
                    await this.gameMessage.edit({
                        embeds: [embed],
                        components: components
                    });
                } catch (error) {
                    if (error.message.includes('Unknown interaction')) {
                        logger.warn('Simon Says Digital: Interaction expired during progress update');
                        return;
                    }
                    throw error;
                }
            }
            
        } catch (error) {
            logger.error(`Simon Says Digital emoji press failed: ${error.message}`);
        }
    }

    async handleWrongInput() {
        this.lives--;
        
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
            // Try again with same sequence
            this.playerInput = [];
            
            const wrongEmoji = this.emojis.find(e => e.id === this.playerInput[this.playerInput.length - 1]);
            const correctEmoji = this.emojis.find(e => e.id === this.sequence[this.playerInput.length - 1]);
            
            const failEmbed = new EmbedBuilder()
                .setTitle('❌ Wrong Sequence!')
                .setDescription(`That's not right! You lost a life.\n\n**Expected:** ${correctEmoji?.emoji || '?'}\n**You clicked:** ${wrongEmoji?.emoji || '?'}\n\n**Lives remaining:** ${'❤️'.repeat(this.lives)}\n\nShowing sequence again in 2 seconds...`)
                .setColor(0xFF4444);
            
            await this.gameMessage.edit({
                embeds: [failEmbed],
                components: []
            });
            
            await this.sleep(2000);
            
            // Show sequence again
            await this.showSequence();
        }
    }

    async handleRoundComplete() {
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
            
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Sequence Perfect!')
                .setDescription(`Excellent! You repeated the sequence flawlessly.\n\n**Round ${this.currentRound - 1} Complete**\n\nStarting Round ${this.currentRound} in 3 seconds...`)
                .setColor(0x00FF00);
            
            await this.gameMessage.edit({
                embeds: [successEmbed],
                components: []
            });
            
            await this.sleep(3000);
            
            // Generate new sequence and continue
            this.generateSequence();
            await this.showSequence();
        }
    }

    async handleTimeout() {
        this.lives--;
        
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
            this.playerInput = [];
            
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('⏰ Time\'s Up!')
                .setDescription(`You took too long to repeat the sequence! You lost a life.\n\n**Lives remaining:** ${'❤️'.repeat(this.lives)}\n\nShowing sequence again in 2 seconds...`)
                .setColor(0xFFAA00);
            
            await this.gameMessage.edit({
                embeds: [timeoutEmbed],
                components: []
            });
            
            await this.sleep(2000);
            await this.showSequence();
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = SimonSaysDigitalGame;