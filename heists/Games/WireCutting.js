/**
 * Wire Cutting Game - Riddle-based Wire Selection Mini-Game for Heists
 * 
 * GAME RULES:
 * - Present 4 colored wires: Red, Blue, Green, Yellow
 * - Show a riddle/hint that describes which wire is safe to cut
 * - Player must choose the correct wire based on the riddle
 * - Wrong choice results in losing a life
 * - 3 Lives total
 * - CSPRNG for riddle selection
 * 
 * PROGRESSION:
 * - Multiple rounds with increasingly complex riddles
 * - Each round has a different riddle and correct wire
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { secureRandomInt } = require('../../UTILS/rng');
const logger = require('../../UTILS/logger');

class WireCuttingGame {
    constructor(config) {
        this.userId = config.userId;
        this.username = config.username;
        this.channelId = config.channelId;
        this.guildId = config.guildId;
        
        // Game state
        this.currentRound = 1;
        this.maxRounds = 4;
        this.lives = 3;
        this.correctWire = null;
        this.gamePhase = 'waiting'; // 'waiting', 'complete', 'failed'
        this.gameMessage = null;
        this.client = null;
        this.collector = null;
        
        // Wire configuration
        this.wires = [
            { id: 'red', name: 'Red Wire', emoji: '=4', style: ButtonStyle.Danger },
            { id: 'blue', name: 'Blue Wire', emoji: '=5', style: ButtonStyle.Primary },
            { id: 'green', name: 'Green Wire', emoji: '=�', style: ButtonStyle.Success },
            { id: 'yellow', name: 'Yellow Wire', emoji: '=�', style: ButtonStyle.Secondary }
        ];
        
        // Riddle sets for each round
        this.riddles = [
            // Round 1 - Simple color riddles
            [
                { riddle: "Cut the wire that matches the color of fresh grass and nature.", answer: 'green' },
                { riddle: "Cut the wire that shares its color with the vast ocean and clear skies.", answer: 'blue' },
                { riddle: "Cut the wire that glows like the bright sun and golden coins.", answer: 'yellow' },
                { riddle: "Cut the wire that burns with the color of fire and passion.", answer: 'red' }
            ],
            // Round 2 - Element/nature riddles
            [
                { riddle: "Cut the wire colored like flowing blood through mortal veins.", answer: 'red' },
                { riddle: "Cut the wire that matches the endless depths of the midnight sea.", answer: 'blue' },
                { riddle: "Cut the wire colored like the first leaves of spring's awakening.", answer: 'green' },
                { riddle: "Cut the wire that shines like lightning striking the earth.", answer: 'yellow' }
            ],
            // Round 3 - Abstract/poetic riddles
            [
                { riddle: "Cut the wire of caution and warning, the color that says 'stop'.", answer: 'red' },
                { riddle: "Cut the wire of tranquil peace, the color of serenity and calm.", answer: 'blue' },
                { riddle: "Cut the wire of prosperity and growth, the color of life itself.", answer: 'green' },
                { riddle: "Cut the wire of bright energy, the color that demands attention.", answer: 'yellow' }
            ],
            // Round 4 - Complex riddles
            [
                { riddle: "Cut the wire that shares its hue with roses given in romance and rubies worn by kings.", answer: 'red' },
                { riddle: "Cut the wire colored like sapphires in royal crowns and the infinite cosmos above.", answer: 'blue' },
                { riddle: "Cut the wire that mirrors emeralds in dragon hoards and forests in their prime.", answer: 'green' },
                { riddle: "Cut the wire that gleams like citrine gems and fields of golden wheat at harvest.", answer: 'yellow' }
            ]
        ];
        
        this.currentRiddle = null;
    }

    /**
     * Start the wire cutting game
     */
    async start(interaction) {
        this.client = interaction.client;
        
        try {
            // Generate riddle for round 1
            this.generateRiddle();
            
            // Create initial embed and components
            const embed = this.createGameEmbed();
            const components = this.createWireButtons();
            
            const reply = await interaction.editReply({
                embeds: [embed],
                components: components
            });
            
            this.gameMessage = reply;
            
            // Set up button handler
            this.setupButtonHandler();
            
        } catch (error) {
            logger.error(`Wire cutting game start failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate random riddle for current round using CSPRNG
     */
    generateRiddle() {
        const roundIndex = this.currentRound - 1;
        const riddleSet = this.riddles[roundIndex];
        
        // Use CSPRNG to select random riddle
        const riddleIndex = secureRandomInt(0, riddleSet.length);
        this.currentRiddle = riddleSet[riddleIndex];
        this.correctWire = this.currentRiddle.answer;
        
        logger.info(`Wire cutting game riddle generated for round ${this.currentRound}: correct wire is ${this.correctWire}`);
    }

    /**
     * Create game embed
     */
    createGameEmbed() {
        let description = '';
        
        if (this.gamePhase === 'waiting') {
            description = `**= WIRE CUTTING CHALLENGE**\n\n` +
                         `**RIDDLE:**\n*${this.currentRiddle.riddle}*\n\n` +
                         `� **WARNING:** Cutting the wrong wire will trigger the alarm!\n` +
                         `Choose carefully - you only get one chance per riddle.\n\n` +
                         `Click the wire you believe is safe to cut:`;
        } else if (this.gamePhase === 'complete') {
            description = `**<� WIRE CUTTING COMPLETE!**\n\n` +
                         `You successfully solved all riddles and cut the correct wires!\n` +
                         `The security system has been bypassed!\n\n` +
                         `**Mission Status:** SUCCESS `;
        } else if (this.gamePhase === 'failed') {
            description = `**=� SECURITY ALARM TRIGGERED!**\n\n` +
                         `You cut the wrong wire and triggered the security system!\n` +
                         `The heist has been compromised!\n\n` +
                         `**Mission Status:** FAILED L`;
        }

        const embed = new EmbedBuilder()
            .setTitle('=� WIRE CUTTING GAME')
            .setDescription(description)
            .addFields(
                {
                    name: '=� Mission Progress',
                    value: `**Round:** ${this.currentRound}/${this.maxRounds}\n**Lives:** ${'d'.repeat(this.lives)} ${this.lives < 3 ? '=�'.repeat(3 - this.lives) : ''}`,
                    inline: true
                },
                {
                    name: '<� Status',
                    value: this.getStatusText(),
                    inline: true
                }
            )
            .setColor(this.getEmbedColor())
            .setFooter({ text: 'Wire Cutting Game - Solve the riddles to bypass security!' });

        return embed;
    }

    /**
     * Get status text for embed
     */
    getStatusText() {
        switch (this.gamePhase) {
            case 'waiting': return '> Analyzing riddle...';
            case 'complete': return '<� Mission Complete!';
            case 'failed': return '=� Security Breach!';
            default: return 'In progress...';
        }
    }

    /**
     * Get embed color based on game state
     */
    getEmbedColor() {
        switch (this.gamePhase) {
            case 'waiting': return 0xFFA500; // Orange - thinking
            case 'complete': return 0x00FF00; // Green - success
            case 'failed': return 0xFF0000; // Red - failed
            default: return 0xFFA500;
        }
    }

    /**
     * Create wire selection buttons
     */
    createWireButtons() {
        const actionRow = new ActionRowBuilder();
        
        for (const wire of this.wires) {
            const button = new ButtonBuilder()
                .setCustomId(`wire_${wire.id}`)
                .setLabel(`${wire.emoji} ${wire.name}`)
                .setStyle(wire.style)
                .setDisabled(this.gamePhase !== 'waiting');
            
            actionRow.addComponents(button);
        }
        
        return [actionRow];
    }

    /**
     * Setup button interaction handler
     */
    setupButtonHandler() {
        if (!this.client || !this.gameMessage) return;

        const filter = (buttonInteraction) => {
            return buttonInteraction.customId.startsWith('wire_') && 
                   buttonInteraction.user.id === this.userId;
        };

        // Clear any existing collector
        if (this.collector) {
            this.collector.stop();
        }

        this.collector = this.gameMessage.createMessageComponentCollector({
            filter,
            time: 60000 // 60 seconds to choose
        });

        this.collector.on('collect', async (buttonInteraction) => {
            try {
                await buttonInteraction.deferUpdate();
                
                if (this.gamePhase !== 'waiting') return;
                
                const wireColor = buttonInteraction.customId.split('_')[1];
                await this.handleWireChoice(wireColor);
            } catch (error) {
                if (error.message.includes('already been acknowledged')) {
                    return;
                }
                logger.error(`Wire cutting game button interaction error: ${error.message}`);
            }
        });

        this.collector.on('end', async (_, reason) => {
            if (reason === 'time' && this.gamePhase === 'waiting') {
                await this.handleTimeout();
            }
        });
    }

    /**
     * Handle wire choice
     */
    async handleWireChoice(wireColor) {
        try {
            // Stop current collector
            if (this.collector) {
                this.collector.stop();
            }
            
            if (wireColor === this.correctWire) {
                // Correct wire chosen
                await this.handleCorrectChoice();
            } else {
                // Wrong wire chosen
                await this.handleWrongChoice(wireColor);
            }
            
        } catch (error) {
            logger.error(`Wire cutting game choice handling failed: ${error.message}`);
        }
    }

    /**
     * Handle correct wire choice
     */
    async handleCorrectChoice() {
        if (this.currentRound >= this.maxRounds) {
            // Game complete!
            this.gamePhase = 'complete';
            const embed = this.createGameEmbed();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: []
            });
        } else {
            // Show success message and advance to next round
            const wireInfo = this.wires.find(w => w.id === this.correctWire);
            const successEmbed = new EmbedBuilder()
                .setTitle(' Correct Wire Cut!')
                .setDescription(`**Perfect!** You cut the ${wireInfo.emoji} ${wireInfo.name} safely.\n\nThe riddle was solved correctly and you bypassed this security layer.\n\n**Round ${this.currentRound} Complete**\n\nPreparing next security challenge...`)
                .setColor(0x00FF00);
            
            await this.gameMessage.edit({
                embeds: [successEmbed],
                components: []
            });
            
            await this.sleep(3000);
            
            // Advance to next round
            this.currentRound++;
            this.generateRiddle();
            
            const embed = this.createGameEmbed();
            const components = this.createWireButtons();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: components
            });
            
            this.setupButtonHandler();
        }
    }

    /**
     * Handle wrong wire choice
     */
    async handleWrongChoice(chosenWire) {
        this.lives--;
        
        const chosenWireInfo = this.wires.find(w => w.id === chosenWire);
        const correctWireInfo = this.wires.find(w => w.id === this.correctWire);
        
        if (this.lives <= 0) {
            // Game over
            this.gamePhase = 'failed';
            const embed = this.createGameEmbed();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: []
            });
        } else {
            // Show failure message and try again
            const failEmbed = new EmbedBuilder()
                .setTitle('=� Wrong Wire!')
                .setDescription(`**BZZZZT!** You cut the ${chosenWireInfo.emoji} ${chosenWireInfo.name} and triggered a minor alarm!\n\n**The correct answer was:** ${correctWireInfo.emoji} ${correctWireInfo.name}\n\n**Lives remaining:** ${'d'.repeat(this.lives)}\n\nTrying the same riddle again in 3 seconds...`)
                .setColor(0xFF4444);
            
            await this.gameMessage.edit({
                embeds: [failEmbed],
                components: []
            });
            
            await this.sleep(3000);
            
            // Try same riddle again
            const embed = this.createGameEmbed();
            const components = this.createWireButtons();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: components
            });
            
            this.setupButtonHandler();
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
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('� Time\'s Up!')
                .setDescription(`You took too long to cut a wire! The security system noticed the delay.\n\n**Lives remaining:** ${'d'.repeat(this.lives)}\n\nTrying the same riddle again in 2 seconds...`)
                .setColor(0xFFAA00);
            
            await this.gameMessage.edit({
                embeds: [timeoutEmbed],
                components: []
            });
            
            await this.sleep(2000);
            
            const embed = this.createGameEmbed();
            const components = this.createWireButtons();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: components
            });
            
            this.setupButtonHandler();
        }
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = WireCuttingGame;