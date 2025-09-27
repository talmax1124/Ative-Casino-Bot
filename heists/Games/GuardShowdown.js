/**
 * Guard Showdown Game - Quick Reaction Mini-Game for Heists
 * 
 * GAME RULES:
 * - Bot posts "DRAW" after a random delay
 * - First player to type "HIT" wins
 * - All other players fail
 * - Single elimination per round
 * - 4 rounds total
 * - 3 Lives total
 * - CSPRNG for random delay timing
 * 
 * PROGRESSION:
 * - Each round has different random delay (1-6 seconds)
 * - Reaction window gets shorter each round
 * - Only one winner per round
 * - Multiplayer competitive
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { secureRandomInt } = require('../../UTILS/rng');
const logger = require('../../UTILS/logger');

class GuardShowdownGame {
    constructor(config) {
        this.userId = config.userId;
        this.username = config.username;
        this.channelId = config.channelId;
        this.guildId = config.guildId;
        
        // Game state
        this.currentRound = 1;
        this.maxRounds = 4;
        this.lives = 3;
        this.gamePhase = 'waiting'; // 'waiting', 'ready', 'draw', 'complete', 'failed'
        this.gameMessage = null;
        this.client = null;
        this.collector = null;
        
        // Showdown configuration
        this.drawDelay = 0; // Random delay before DRAW
        this.reactionWindow = 5000 - (this.currentRound * 500); // 5s, 4.5s, 4s, 3.5s
        this.drawTime = null;
        this.winner = null;
        this.participants = new Map(); // Track all participants and their reaction times
        
        this.roundResults = [];
    }

    async start(interaction) {
        this.client = interaction.client;
        
        try {
            this.generateRoundSettings();
            
            const embed = this.createGameEmbed();
            const components = this.createActionButton();
            
            const reply = await interaction.editReply({
                embeds: [embed],
                components: components
            });
            
            this.gameMessage = reply;
            this.setupButtonHandler();
            
        } catch (error) {
            logger.error(`Guard Showdown game start failed: ${error.message}`);
            throw error;
        }
    }

    generateRoundSettings() {
        // Random delay between 1-6 seconds before DRAW
        this.drawDelay = secureRandomInt(1000, 6000);
        
        // Reaction window gets shorter each round
        this.reactionWindow = 5000 - (this.currentRound * 500); // 5s, 4.5s, 4s, 3.5s
        
        logger.info(`Guard Showdown round ${this.currentRound}: delay=${this.drawDelay}ms, window=${this.reactionWindow}ms`);
    }

    createGameEmbed() {
        let description = '';
        
        if (this.gamePhase === 'waiting') {
            description = `**� GUARD SHOWDOWN**\n\n` +
                         `**ROUND ${this.currentRound}**\n\n` +
                         `Face off against the security guard in a quick draw duel!\n\n` +
                         `**INSTRUCTIONS:**\n` +
                         `" Click "Join Showdown" to participate\n` +
                         `" Watch for the "DRAW!" command after a random delay\n` +
                         `" Type "HIT" as fast as possible when you see it\n` +
                         `" Only the FIRST person to type "HIT" wins!\n` +
                         `" Everyone else fails the round\n\n` +
                         `� **Reaction Window:** ${this.reactionWindow / 1000}s\n\n` +
                         `Click the button below when ready:`;
        } else if (this.gamePhase === 'ready') {
            description = `**� GUARD SHOWDOWN**\n\n` +
                         `**GET READY...**\n\n` +
                         `<� The guard is watching...\n` +
                         `� Stay alert and focused...\n` +
                         `� The draw command is coming soon...\n\n` +
                         `**First to type "HIT" after "DRAW!" wins!**`;
        } else if (this.gamePhase === 'draw') {
            description = `**� GUARD SHOWDOWN**\n\n` +
                         `# =% DRAW! =%\n\n` +
                         `**TYPE "HIT" NOW!**\n\n` +
                         `� Be the fastest!\n` +
                         `<� Type it exactly: HIT\n` +
                         `� Only the first one wins!\n\n` +
                         `**${this.reactionWindow / 1000} seconds remaining!**`;
        } else if (this.gamePhase === 'complete') {
            description = `**<� GUARD SHOWDOWN COMPLETE!**\n\n` +
                         `You survived all encounters with the security guards!\n` +
                         `Your reflexes are razor-sharp!\n\n` +
                         `**Final Results:**\n${this.getRoundResultsText()}\n\n` +
                         `**Mission Status:** SUCCESS `;
        } else if (this.gamePhase === 'failed') {
            description = `**=� GUARD SHOWDOWN FAILED!**\n\n` +
                         `The security guard was faster than you!\n` +
                         `You were caught in the act!\n\n` +
                         `**Mission Status:** FAILED L`;
        }

        const embed = new EmbedBuilder()
            .setTitle('� GUARD SHOWDOWN')
            .setDescription(description)
            .addFields(
                {
                    name: '=� Showdown Progress',
                    value: `**Round:** ${this.currentRound}/${this.maxRounds}\n**Lives:** ${'d'.repeat(this.lives)} ${this.lives < 3 ? '=�'.repeat(3 - this.lives) : ''}\n**Type:** Single Elimination`,
                    inline: true
                },
                {
                    name: '<� Status',
                    value: this.getStatusText(),
                    inline: true
                }
            )
            .setColor(this.getEmbedColor())
            .setFooter({ text: 'Guard Showdown - First to type HIT wins!' });

        // Add current round result if available
        if (this.winner && this.gamePhase !== 'complete' && this.gamePhase !== 'failed') {
            embed.addFields({
                name: '<� Round Result',
                value: this.getCurrentRoundResult(),
                inline: false
            });
        }

        return embed;
    }

    getCurrentRoundResult() {
        if (!this.winner) return 'No winner yet';
        
        const reactionTime = this.winner.reactionTime;
        const participantCount = this.participants.size;
        
        return `**Winner:** ${this.winner.username}\n**Reaction Time:** ${reactionTime}ms\n**Competitors:** ${participantCount} players\n**Result:** <� Victory!`;
    }

    getRoundResultsText() {
        return this.roundResults.map((result, index) => {
            return `**Round ${index + 1}:** ${result.winner} (${result.time}ms) vs ${result.competitors} others`;
        }).join('\n');
    }

    getStatusText() {
        switch (this.gamePhase) {
            case 'waiting': return '� Preparing for duel...';
            case 'ready': return '<� GET READY...';
            case 'draw': return '=% DRAW!';
            case 'complete': return '<� All Duels Won!';
            case 'failed': return '=� Outgunned!';
            default: return 'In progress...';
        }
    }

    getEmbedColor() {
        switch (this.gamePhase) {
            case 'waiting': return 0x8B4513; // Brown - western theme
            case 'ready': return 0xFFA500; // Orange - tension
            case 'draw': return 0xFF0000; // Red - action!
            case 'complete': return 0x00FF00; // Green - success
            case 'failed': return 0x8B0000; // Dark red - failed
            default: return 0x8B4513;
        }
    }

    createActionButton() {
        const button = new ButtonBuilder()
            .setCustomId('join_guard_showdown')
            .setLabel('� Join Showdown')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(this.gamePhase !== 'waiting');
        
        return [new ActionRowBuilder().addComponents(button)];
    }

    setupButtonHandler() {
        if (!this.client || !this.gameMessage) return;

        const filter = (buttonInteraction) => {
            return buttonInteraction.customId === 'join_guard_showdown' && 
                   buttonInteraction.user.id === this.userId;
        };

        if (this.collector) {
            this.collector.stop();
        }

        this.collector = this.gameMessage.createMessageComponentCollector({
            filter,
            time: 30000 // 30 seconds to join
        });

        this.collector.on('collect', async (buttonInteraction) => {
            try {
                await buttonInteraction.deferUpdate();
                
                if (this.gamePhase !== 'waiting') return;
                
                await this.startShowdownSequence();
            } catch (error) {
                logger.error(`Guard Showdown button interaction error: ${error.message}`);
            }
        });

        this.collector.on('end', async (_, reason) => {
            if (reason === 'time' && this.gamePhase === 'waiting') {
                await this.handleNoParticipants();
            }
        });
    }

    async startShowdownSequence() {
        try {
            if (this.collector) {
                this.collector.stop();
            }
            
            // Clear participants for this round
            this.participants.clear();
            this.winner = null;
            
            // Ready phase
            this.gamePhase = 'ready';
            const readyEmbed = this.createGameEmbed();
            
            await this.gameMessage.edit({
                embeds: [readyEmbed],
                components: []
            });
            
            await this.sleep(1500);
            
            // Random delay before DRAW
            await this.sleep(this.drawDelay);
            
            // DRAW phase
            this.gamePhase = 'draw';
            this.drawTime = Date.now();
            const drawEmbed = this.createGameEmbed();
            
            await this.gameMessage.edit({
                embeds: [drawEmbed],
                components: []
            });
            
            // Set up message listener for "HIT" responses
            this.setupMessageListener();
            
        } catch (error) {
            logger.error(`Guard Showdown sequence failed: ${error.message}`);
        }
    }

    setupMessageListener() {
        if (!this.client) return;

        const messageFilter = (message) => {
            return message.channelId === this.channelId && 
                   false && // DISABLED: message content reading
                   !message.author.bot;
        };

        const messageCollector = this.client.channels.cache.get(this.channelId)?.createMessageCollector({
            filter: messageFilter,
            time: this.reactionWindow
        });

        if (!messageCollector) {
            logger.error('Could not create message collector for Guard Showdown');
            return;
        }

        messageCollector.on('collect', async (message) => {
            try {
                const reactionTime = Date.now() - this.drawTime;
                const userId = message.author.id;
                const username = message.author.displayName || message.author.username;
                
                // Only count the first response from each user
                if (!this.participants.has(userId)) {
                    this.participants.set(userId, {
                        username,
                        reactionTime,
                        timestamp: Date.now()
                    });
                    
                    // Set winner as FIRST responder overall (not per user)
                    if (!this.winner) {
                        this.winner = {
                            username,
                            userId,
                            reactionTime
                        };
                        messageCollector.stop('winner_found');
                    }
                }
            } catch (error) {
                logger.error(`Message collection error: ${error.message}`);
            }
        });

        messageCollector.on('end', async (_, reason) => {
            await this.handleRoundEnd(reason);
        });
    }

    async handleRoundEnd(reason) {
        try {
            if (reason === 'winner_found' && this.winner) {
                // Someone won the round
                if (this.winner.userId === this.userId) {
                    // Player won
                    await this.handleRoundWin();
                } else {
                    // Another player won, main player failed
                    await this.handleRoundLoss();
                }
            } else {
                // Nobody responded in time - player failed
                await this.handleRoundTimeout();
            }
        } catch (error) {
            logger.error(`Round end handling failed: ${error.message}`);
        }
    }

    async handleRoundWin() {
        // Record round result
        this.roundResults.push({
            winner: this.winner.username,
            time: this.winner.reactionTime,
            competitors: this.participants.size - 1,
            won: true,
            round: this.currentRound
        });
        
        // Show round result
        const resultEmbed = new EmbedBuilder()
            .setTitle('<� Duel Won!')
            .setDescription(`**You were the fastest draw!**\n\n**Your Time:** ${this.winner.reactionTime}ms\n**Competitors:** ${this.participants.size - 1} other players\n**Result:** You outgunned the guard!\n\nNext round starting in 3 seconds...`)
            .setColor(0x00FF00);
        
        await this.gameMessage.edit({
            embeds: [resultEmbed],
            components: []
        });
        
        await this.sleep(3000);
        
        // Advance to next round or complete game
        if (this.currentRound >= this.maxRounds) {
            this.gamePhase = 'complete';
            const embed = this.createGameEmbed();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: []
            });
        } else {
            this.currentRound++;
            this.generateRoundSettings();
            this.gamePhase = 'waiting';
            
            const embed = this.createGameEmbed();
            const components = this.createActionButton();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: components
            });
            
            this.setupButtonHandler();
        }
    }

    async handleRoundLoss() {
        this.lives--;
        
        // Record round result
        this.roundResults.push({
            winner: this.winner.username,
            time: this.winner.reactionTime,
            competitors: this.participants.size - 1,
            won: false,
            round: this.currentRound
        });
        
        if (this.lives <= 0) {
            // Game over
            this.gamePhase = 'failed';
            const embed = this.createGameEmbed();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: []
            });
        } else {
            // Show loss message and retry
            const lossEmbed = new EmbedBuilder()
                .setTitle('L Duel Lost!')
                .setDescription(`**${this.winner.username}** was faster than you!\n\n**Winner's Time:** ${this.winner.reactionTime}ms\n**Result:** The other player outgunned you!\n\n**Lives remaining:** ${'d'.repeat(this.lives)}\n\nTrying the same round again in 3 seconds...`)
                .setColor(0xFF4444);
            
            await this.gameMessage.edit({
                embeds: [lossEmbed],
                components: []
            });
            
            await this.sleep(3000);
            
            // Retry same round
            this.gamePhase = 'waiting';
            const embed = this.createGameEmbed();
            const components = this.createActionButton();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: components
            });
            
            this.setupButtonHandler();
        }
    }

    async handleRoundTimeout() {
        this.lives--;
        
        if (this.lives <= 0) {
            this.gamePhase = 'failed';
            const embed = this.createGameEmbed();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: []
            });
        } else {
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('� Too Slow!')
                .setDescription(`Nobody was fast enough! The guard caught you off guard.\n\n**Lives remaining:** ${'d'.repeat(this.lives)}\n\nTrying the same round again in 3 seconds...`)
                .setColor(0xFFAA00);
            
            await this.gameMessage.edit({
                embeds: [timeoutEmbed],
                components: []
            });
            
            await this.sleep(3000);
            
            // Retry same round
            this.gamePhase = 'waiting';
            const embed = this.createGameEmbed();
            const components = this.createActionButton();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: components
            });
            
            this.setupButtonHandler();
        }
    }

    async handleNoParticipants() {
        this.gamePhase = 'failed';
        const embed = this.createGameEmbed();
        
        await this.gameMessage.edit({
            embeds: [embed],
            components: []
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = GuardShowdownGame;