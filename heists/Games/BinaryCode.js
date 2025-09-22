/**
 * Binary Code Game - Color-to-Number Encoding Mini-Game for Heists
 * 
 * GAME RULES:
 * - Show a color sequence with corresponding numbers as example
 * - Ask player to decode a new color sequence using the same mapping
 * - Player must input the correct numerical code
 * - 4 rounds with increasing sequence length
 * - 3 Lives total
 * - CSPRNG for sequence generation
 * 
 * PROGRESSION:
 * Round 1: 3 colors
 * Round 2: 4 colors  
 * Round 3: 5 colors
 * Round 4: 6 colors
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { secureRandomInt } = require('../../UTILS/rng');
const logger = require('../../UTILS/logger');

class BinaryCodeGame {
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
        
        // Color configuration
        this.colors = [
            { emoji: '🔴', name: 'Red', value: null },
            { emoji: '🟢', name: 'Green', value: null },
            { emoji: '🔵', name: 'Blue', value: null },
            { emoji: '🟡', name: 'Yellow', value: null },
            { emoji: '🟠', name: 'Orange', value: null },
            { emoji: '🟣', name: 'Purple', value: null }
        ];
        
        // Current round data
        this.colorMapping = {};
        this.exampleSequence = [];
        this.targetSequence = [];
        this.correctAnswer = '';
    }

    async start(interaction) {
        this.client = interaction.client;
        
        try {
            this.generateRound();
            
            const embed = this.createGameEmbed();
            const components = this.createActionButton();
            
            const reply = await interaction.editReply({
                embeds: [embed],
                components: components
            });
            
            this.gameMessage = reply;
            this.setupButtonHandler();
            
        } catch (error) {
            logger.error(`Binary code game start failed: ${error.message}`);
            throw error;
        }
    }

    generateRound() {
        const sequenceLength = 2 + this.currentRound;
        
        this.colorMapping = {};
        const usedNumbers = new Set();
        
        const colorsNeeded = Math.min(sequenceLength + 1, this.colors.length);
        
        for (let i = 0; i < colorsNeeded; i++) {
            let randomNumber;
            do {
                randomNumber = secureRandomInt(1, 10);
            } while (usedNumbers.has(randomNumber));
            
            usedNumbers.add(randomNumber);
            this.colorMapping[this.colors[i].emoji] = randomNumber;
        }
        
        this.exampleSequence = [];
        for (let i = 0; i < sequenceLength; i++) {
            const colorIndex = secureRandomInt(0, colorsNeeded);
            this.exampleSequence.push(this.colors[colorIndex].emoji);
        }
        
        this.targetSequence = [];
        for (let i = 0; i < sequenceLength; i++) {
            const colorIndex = secureRandomInt(0, colorsNeeded);
            this.targetSequence.push(this.colors[colorIndex].emoji);
        }
        
        this.correctAnswer = this.targetSequence
            .map(color => this.colorMapping[color])
            .join(' ');
        
        logger.info(`Binary code game round ${this.currentRound} generated: target sequence length ${sequenceLength}, correct answer: ${this.correctAnswer}`);
    }

    createGameEmbed() {
        const sequenceLength = 2 + this.currentRound;
        
        let description = '';
        
        if (this.gamePhase === 'showing') {
            const exampleNumbers = this.exampleSequence
                .map(color => this.colorMapping[color])
                .join(' ');
            
            description = `**🔢 BINARY CODE CHALLENGE**\n\n` +
                         `**EXAMPLE MAPPING:**\n` +
                         `${this.exampleSequence.join('')} = ${exampleNumbers}\n\n` +
                         `**YOUR TASK:**\n` +
                         `What's the code for: ${this.targetSequence.join('')}?\n\n` +
                         `⚠️ **Instructions:**\n` +
                         `- Use the color-to-number mapping shown above\n` +
                         `- Enter numbers separated by spaces\n` +
                         `- Example format: "3 1 4"\n\n` +
                         `Click "Enter Code" when ready:`;
        } else if (this.gamePhase === 'complete') {
            description = `**🎉 BINARY CODE COMPLETE!**\n\n` +
                         `You successfully decoded all color sequences!\n` +
                         `The security encryption has been bypassed!\n\n` +
                         `**Mission Status:** SUCCESS ✅`;
        } else if (this.gamePhase === 'failed') {
            description = `**💀 DECRYPTION FAILED!**\n\n` +
                         `You failed to crack the binary code system!\n` +
                         `The security system detected your intrusion!\n\n` +
                         `**Mission Status:** FAILED ❌`;
        }

        const embed = new EmbedBuilder()
            .setTitle('🔢 BINARY CODE GAME')
            .setDescription(description)
            .addFields(
                {
                    name: '📊 Decryption Progress',
                    value: `**Round:** ${this.currentRound}/${this.maxRounds}\n**Sequence Length:** ${sequenceLength} colors\n**Lives:** ${'❤️'.repeat(this.lives)} ${this.lives < 3 ? '💔'.repeat(3 - this.lives) : ''}`,
                    inline: true
                },
                {
                    name: '🎯 Status',
                    value: this.getStatusText(),
                    inline: true
                }
            )
            .setColor(this.getEmbedColor())
            .setFooter({ text: 'Binary Code Game - Decode the color sequences!' });

        if (this.gamePhase === 'showing') {
            const mappingText = Object.entries(this.colorMapping)
                .map(([color, number]) => `${color} = ${number}`)
                .join('\n');
            
            embed.addFields({
                name: '🎨 Color Mapping',
                value: mappingText,
                inline: false
            });
        }

        return embed;
    }

    getStatusText() {
        switch (this.gamePhase) {
            case 'showing': return '🔍 Analyzing pattern...';
            case 'complete': return '🎉 Decryption Complete!';
            case 'failed': return '💀 System Breached!';
            default: return 'Decrypting...';
        }
    }

    getEmbedColor() {
        switch (this.gamePhase) {
            case 'showing': return 0x4169E1;
            case 'complete': return 0x00FF00;
            case 'failed': return 0xFF0000;
            default: return 0x4169E1;
        }
    }

    createActionButton() {
        const button = new ButtonBuilder()
            .setCustomId('enter_code')
            .setLabel('🔢 Enter Code')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(this.gamePhase !== 'showing');
        
        return [new ActionRowBuilder().addComponents(button)];
    }

    setupButtonHandler() {
        if (!this.client || !this.gameMessage) return;

        const filter = (buttonInteraction) => {
            return buttonInteraction.customId === 'enter_code' && 
                   buttonInteraction.user.id === this.userId;
        };

        if (this.collector) {
            this.collector.stop();
        }

        this.collector = this.gameMessage.createMessageComponentCollector({
            filter,
            time: 120000
        });

        this.collector.on('collect', async (buttonInteraction) => {
            try {
                if (this.gamePhase !== 'showing') return;
                
                await this.showCodeModal(buttonInteraction);
            } catch (error) {
                logger.error(`Binary code game button interaction error: ${error.message}`);
            }
        });

        this.collector.on('end', async (_, reason) => {
            if (reason === 'time' && this.gamePhase === 'showing') {
                await this.handleTimeout();
            }
        });
    }

    async showCodeModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('code_input_modal')
            .setTitle('🔢 Enter Binary Code');

        const codeInput = new TextInputBuilder()
            .setCustomId('code_input')
            .setLabel('Enter the decoded numbers (separated by spaces)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Example: 3 1 4')
            .setRequired(true)
            .setMaxLength(50);

        modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
        
        await interaction.showModal(modal);
        
        try {
            const modalSubmission = await interaction.awaitModalSubmit({
                time: 60000,
                filter: (modalInteraction) => modalInteraction.customId === 'code_input_modal' && modalInteraction.user.id === this.userId
            });

            const userInput = modalSubmission.fields.getTextInputValue('code_input').trim();
            await modalSubmission.deferUpdate();
            
            await this.handleCodeSubmission(userInput);
            
        } catch (error) {
            if (error.message.includes('time')) {
                await this.handleTimeout();
            } else {
                logger.error(`Modal submission error: ${error.message}`);
            }
        }
    }

    async handleCodeSubmission(userInput) {
        try {
            if (this.collector) {
                this.collector.stop();
            }
            
            const normalizedInput = userInput.replace(/\s+/g, ' ').trim();
            
            if (normalizedInput === this.correctAnswer) {
                await this.handleCorrectAnswer();
            } else {
                await this.handleWrongAnswer(normalizedInput);
            }
            
        } catch (error) {
            logger.error(`Binary code game submission handling failed: ${error.message}`);
        }
    }

    async handleCorrectAnswer() {
        if (this.currentRound >= this.maxRounds) {
            this.gamePhase = 'complete';
            const embed = this.createGameEmbed();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: []
            });
        } else {
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Code Cracked!')
                .setDescription(`**Excellent!** You decoded the sequence correctly.\n\n**Correct Code:** ${this.correctAnswer}\n\n**Round ${this.currentRound} Complete**\n\nPreparing next encryption level...`)
                .setColor(0x00FF00);
            
            await this.gameMessage.edit({
                embeds: [successEmbed],
                components: []
            });
            
            await this.sleep(3000);
            
            this.currentRound++;
            this.generateRound();
            
            const embed = this.createGameEmbed();
            const components = this.createActionButton();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: components
            });
            
            this.setupButtonHandler();
        }
    }

    async handleWrongAnswer(userInput) {
        this.lives--;
        
        if (this.lives <= 0) {
            this.gamePhase = 'failed';
            const embed = this.createGameEmbed();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: []
            });
        } else {
            const failEmbed = new EmbedBuilder()
                .setTitle('❌ Incorrect Code!')
                .setDescription(`**Wrong!** That's not the correct sequence.\n\n**Your Answer:** ${userInput}\n**Correct Answer:** ${this.correctAnswer}\n\n**Lives remaining:** ${'❤️'.repeat(this.lives)}\n\nTrying the same sequence again in 3 seconds...`)
                .setColor(0xFF4444);
            
            await this.gameMessage.edit({
                embeds: [failEmbed],
                components: []
            });
            
            await this.sleep(3000);
            
            const embed = this.createGameEmbed();
            const components = this.createActionButton();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: components
            });
            
            this.setupButtonHandler();
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
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('⏰ Time\'s Up!')
                .setDescription(`You took too long to decode the sequence! The system detected suspicious activity.\n\n**Lives remaining:** ${'❤️'.repeat(this.lives)}\n\nTrying the same sequence again in 2 seconds...`)
                .setColor(0xFFAA00);
            
            await this.gameMessage.edit({
                embeds: [timeoutEmbed],
                components: []
            });
            
            await this.sleep(2000);
            
            const embed = this.createGameEmbed();
            const components = this.createActionButton();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: components
            });
            
            this.setupButtonHandler();
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = BinaryCodeGame;