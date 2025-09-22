/**
 * Quick Draw Showdown Game - Reaction Time Mini-Game for Heists
 * 
 * GAME RULES:
 * - Bot posts "READY… STEADY… DRAW!" after a random delay
 * - First player to type "HIT" wins the round
 * - Success depends on player role:
 *   - If Muscle wins → clean success
 *   - If another player wins → partial success, Suspicion +1
 *   - If nobody reacts in time → fail
 * - 4 rounds total
 * - 3 Lives total
 * - CSPRNG for random delay timing
 * 
 * PROGRESSION:
 * - Each round has different random delay (2-8 seconds)
 * - Reaction window gets shorter each round
 * - Multiple players can participate simultaneously
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { secureRandomInt } = require('../../UTILS/rng');
const logger = require('../../UTILS/logger');

class QuickDrawShowdownGame {
    constructor(config) {
        this.userId = config.userId;
        this.username = config.username;
        this.channelId = config.channelId;
        this.guildId = config.guildId;
        
        // Game state
        this.currentRound = 1;
        this.maxRounds = 4;
        this.lives = 3;
        this.gamePhase = 'waiting'; // 'waiting', 'ready', 'steady', 'draw', 'complete', 'failed'
        this.gameMessage = null;
        this.client = null;
        this.collector = null;
        
        // Quick Draw configuration
        this.drawDelay = 0; // Random delay before DRAW
        this.reactionWindow = 3000; // Time to react after DRAW
        this.drawTime = null;
        this.winner = null;
        this.participants = new Map(); // Track all participants and their reaction times
        
        // Player role (for now, assume single player is "Muscle" - can be extended for multiplayer)
        this.playerRole = 'muscle'; // Can be 'muscle', 'hacker', 'lookout', etc.
        
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
            logger.error(`Quick Draw Showdown game start failed: ${error.message}`);
            throw error;
        }
    }

    generateRoundSettings() {
        // Random delay between 2-8 seconds before DRAW
        this.drawDelay = secureRandomInt(2000, 8000);
        
        // Reaction window gets shorter each round (3s, 2.5s, 2s, 1.5s)
        this.reactionWindow = Math.max(1500, 3500 - (this.currentRound * 500));
        
        logger.info(`Quick Draw round ${this.currentRound}: delay=${this.drawDelay}ms, window=${this.reactionWindow}ms`);
    }

    createGameEmbed() {
        let description = '';
        
        if (this.gamePhase === 'waiting') {
            description = `**🤠 QUICK DRAW SHOWDOWN**\n\n` +
                         `**ROUND ${this.currentRound}**\n\n` +
                         `Get ready for a classic western showdown!\n\n` +
                         `**INSTRUCTIONS:**\n` +
                         `• Click "Join Showdown" to participate\n` +
                         `• Watch for the "DRAW!" command\n` +
                         `• Type "HIT" as fast as possible when you see it\n` +
                         `• Fastest draw wins the round!\n\n` +
                         `⚡ **Reaction Window:** ${this.reactionWindow / 1000}s\n\n` +
                         `Click the button below when ready:`;
        } else if (this.gamePhase === 'ready') {
            description = `**🤠 QUICK DRAW SHOWDOWN**\n\n` +
                         `**READY…**\n\n` +
                         `⚡ Get your fingers ready...\n` +
                         `🎯 Watch for the signal...\n` +
                         `⏰ It's coming soon...`;
        } else if (this.gamePhase === 'steady') {
            description = `**🤠 QUICK DRAW SHOWDOWN**\n\n` +
                         `**STEADY…**\n\n` +
                         `⚡ Almost time...\n` +
                         `🎯 Stay focused...\n` +
                         `⏰ Any moment now...`;
        } else if (this.gamePhase === 'draw') {
            description = `**🤠 QUICK DRAW SHOWDOWN**\n\n` +
                         `# 🔥 DRAW! 🔥\n\n` +
                         `**TYPE "HIT" NOW!**\n\n` +
                         `⚡ Be the fastest!\n` +
                         `🎯 Type it exactly: HIT\n` +
                         `⏰ ${this.reactionWindow / 1000} seconds remaining!`;
        } else if (this.gamePhase === 'complete') {
            description = `**🎉 SHOWDOWN COMPLETE!**\n\n` +
                         `You completed all quick draw rounds!\n` +
                         `Your reflexes are sharp and ready for action!\n\n` +
                         `**Final Results:**\n${this.getRoundResultsText()}\n\n` +
                         `**Mission Status:** SUCCESS ✅`;
        } else if (this.gamePhase === 'failed') {
            description = `**💀 SHOWDOWN FAILED!**\n\n` +
                         `Your reflexes weren't quick enough!\n` +
                         `The enemy got the drop on you!\n\n` +
                         `**Mission Status:** FAILED ❌`;
        }

        const embed = new EmbedBuilder()
            .setTitle('🤠 QUICK DRAW SHOWDOWN')
            .setDescription(description)
            .addFields(
                {
                    name: '📊 Showdown Progress',
                    value: `**Round:** ${this.currentRound}/${this.maxRounds}\n**Lives:** ${'❤️'.repeat(this.lives)} ${this.lives < 3 ? '💔'.repeat(3 - this.lives) : ''}\n**Role:** ${this.playerRole.toUpperCase()}`,
                    inline: true
                },
                {
                    name: '🎯 Status',
                    value: this.getStatusText(),
                    inline: true
                }
            )
            .setColor(this.getEmbedColor())
            .setFooter({ text: 'Quick Draw Showdown - Be the fastest gun in the west!' });

        // Add current round result if available
        if (this.winner && this.gamePhase !== 'complete' && this.gamePhase !== 'failed') {
            embed.addFields({
                name: '🏆 Round Result',
                value: this.getCurrentRoundResult(),
                inline: false
            });
        }

        return embed;
    }

    getCurrentRoundResult() {
        if (!this.winner) return 'No winner yet';
        
        const reactionTime = this.winner.reactionTime;
        const resultText = this.getRoundOutcome();
        
        return `**Winner:** ${this.winner.username}\n**Time:** ${reactionTime}ms\n**Result:** ${resultText}`;
    }

    getRoundResultsText() {
        return this.roundResults.map((result, index) => {
            return `**Round ${index + 1}:** ${result.winner} (${result.time}ms) - ${result.outcome}`;
        }).join('\n');
    }

    getRoundOutcome() {
        if (!this.winner) return 'No winner';
        
        // For single player mode, assume they are "muscle"
        if (this.winner.role === 'muscle') {
            return '🎯 Clean Success';
        } else {
            return '⚠️ Partial Success (Suspicion +1)';
        }
    }

    getStatusText() {
        switch (this.gamePhase) {
            case 'waiting': return '⏳ Preparing for showdown...';
            case 'ready': return '🎯 READY...';
            case 'steady': return '⚡ STEADY...';
            case 'draw': return '🔥 DRAW!';
            case 'complete': return '🎉 Showdown Complete!';
            case 'failed': return '💀 Showdown Failed!';
            default: return 'In progress...';
        }
    }

    getEmbedColor() {
        switch (this.gamePhase) {
            case 'waiting': return 0x8B4513; // Brown - western theme
            case 'ready': return 0xFFA500; // Orange - getting ready
            case 'steady': return 0xFF4500; // Red-orange - tension
            case 'draw': return 0xFF0000; // Red - action!
            case 'complete': return 0x00FF00; // Green - success
            case 'failed': return 0x8B0000; // Dark red - failed
            default: return 0x8B4513;
        }
    }

    createActionButton() {
        const button = new ButtonBuilder()
            .setCustomId('join_showdown')
            .setLabel('🤠 Join Showdown')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(this.gamePhase !== 'waiting');
        
        return [new ActionRowBuilder().addComponents(button)];
    }

    setupButtonHandler() {
        if (!this.client || !this.gameMessage) return;

        const filter = (buttonInteraction) => {
            return buttonInteraction.customId === 'join_showdown' && 
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
                logger.error(`Quick Draw button interaction error: ${error.message}`);
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
            
            // READY phase
            this.gamePhase = 'ready';
            const readyEmbed = this.createGameEmbed();
            
            await this.gameMessage.edit({
                embeds: [readyEmbed],
                components: []
            });
            
            await this.sleep(1500);
            
            // STEADY phase
            this.gamePhase = 'steady';
            const steadyEmbed = this.createGameEmbed();
            
            await this.gameMessage.edit({
                embeds: [steadyEmbed],
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
            logger.error(`Quick Draw sequence failed: ${error.message}`);
        }
    }

    setupMessageListener() {
        if (!this.client) return;

        const messageFilter = (message) => {
            return message.channelId === this.channelId && 
                   message.content.trim().toLowerCase() === 'hit' &&
                   !message.author.bot;
        };

        const messageCollector = this.client.channels.cache.get(this.channelId)?.createMessageCollector({
            filter: messageFilter,
            time: this.reactionWindow
        });

        if (!messageCollector) {
            logger.error('Could not create message collector for Quick Draw');
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
                        role: userId === this.userId ? this.playerRole : 'other'
                    });
                    
                    // Set winner as first responder
                    if (!this.winner) {
                        this.winner = this.participants.get(userId);
                        this.winner.userId = userId;
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
                await this.handleRoundWin();
            } else {
                // Nobody responded in time
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
            outcome: this.getRoundOutcome(),
            round: this.currentRound
        });
        
        // Show round result
        const resultEmbed = new EmbedBuilder()
            .setTitle('🏆 Round Winner!')
            .setDescription(`**${this.winner.username}** was fastest on the draw!\n\n**Reaction Time:** ${this.winner.reactionTime}ms\n**Result:** ${this.getRoundOutcome()}\n\nNext round starting in 3 seconds...`)
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

    async handleRoundTimeout() {
        this.lives--;
        
        if (this.lives <= 0) {
            // Game over
            this.gamePhase = 'failed';
            const embed = this.createGameEmbed();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: []
            });
        } else {
            // Show timeout message and retry
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('⏰ Too Slow!')
                .setDescription(`Nobody was fast enough on the draw!\n\n**Lives remaining:** ${'❤️'.repeat(this.lives)}\n\nTrying the same round again in 3 seconds...`)
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

module.exports = QuickDrawShowdownGame;