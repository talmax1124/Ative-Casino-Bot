/**
 * Push Challenge Game - Reaction Spam Progress Bar Mini-Game for Heists
 * 
 * GAME RULES:
 * - Bot shows a progress bar [====     ]
 * - Players must spam reactions (👊) to push it to full
 * - Must fill the bar completely before time runs out
 * - Each reaction adds progress to the bar
 * - 4 rounds with increasing difficulty
 * - 3 Lives total
 * - Multiplayer cooperation
 * 
 * PROGRESSION:
 * Round 1: Need 50 reactions in 20 seconds
 * Round 2: Need 75 reactions in 18 seconds  
 * Round 3: Need 100 reactions in 16 seconds
 * Round 4: Need 125 reactions in 14 seconds
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { secureRandomInt } = require('../../UTILS/rng');
const logger = require('../../UTILS/logger');

class PushChallengeGame {
    constructor(config) {
        this.userId = config.userId;
        this.username = config.username;
        this.channelId = config.channelId;
        this.guildId = config.guildId;
        
        // Game state
        this.currentRound = 1;
        this.maxRounds = 4;
        this.lives = 3;
        this.gamePhase = 'waiting'; // 'waiting', 'countdown', 'pushing', 'complete', 'failed'
        this.gameMessage = null;
        this.client = null;
        this.collector = null;
        
        // Push configuration
        this.targetPushes = 25 + (this.currentRound * 25); // 50, 75, 100, 125
        this.timeLimit = 22000 - (this.currentRound * 2000); // 20s, 18s, 16s, 14s
        this.currentPushes = 0;
        this.startTime = null;
        this.participants = new Set(); // Track unique participants
        this.pushEmoji = '👊';
        
        this.roundResults = [];
    }

    async start(interaction) {
        this.client = interaction.client;
        
        try {
            this.updateRoundSettings();
            
            const embed = this.createGameEmbed();
            const components = this.createActionButton();
            
            const reply = await interaction.editReply({
                embeds: [embed],
                components: components
            });
            
            this.gameMessage = reply;
            this.setupButtonHandler();
            
        } catch (error) {
            logger.error(`Push Challenge game start failed: ${error.message}`);
            throw error;
        }
    }

    updateRoundSettings() {
        this.targetPushes = 25 + (this.currentRound * 25); // 50, 75, 100, 125
        this.timeLimit = 22000 - (this.currentRound * 2000); // 20s, 18s, 16s, 14s
        this.currentPushes = 0;
        this.participants.clear();
        
        logger.info(`Push Challenge round ${this.currentRound}: need ${this.targetPushes} pushes in ${this.timeLimit/1000}s`);
    }

    createGameEmbed() {
        let description = '';
        
        if (this.gamePhase === 'waiting') {
            description = `**👊 PUSH CHALLENGE**\n\n` +
                         `**ROUND ${this.currentRound}**\n\n` +
                         `Work together to push the bar to maximum!\n\n` +
                         `**INSTRUCTIONS:**\n` +
                         `• Click "Start Push Challenge" to begin\n` +
                         `• When the challenge starts, react with ${this.pushEmoji} as fast as possible!\n` +
                         `• Fill the progress bar completely before time runs out\n` +
                         `• Everyone can help - teamwork is key!\n\n` +
                         `**🎯 TARGET:** ${this.targetPushes} pushes in ${this.timeLimit/1000} seconds\n\n` +
                         `Click the button below when ready:`;
        } else if (this.gamePhase === 'countdown') {
            description = `**👊 PUSH CHALLENGE**\n\n` +
                         `**GET READY TO PUSH!**\n\n` +
                         `⚡ Prepare to spam reactions...\n` +
                         `🎯 Get ready to push ${this.pushEmoji}...\n` +
                         `⏰ Starting very soon...\n\n` +
                         `**${this.getProgressBar()}**\n\n` +
                         `👊 **Remember:** React with ${this.pushEmoji} to push the bar!`;
        } else if (this.gamePhase === 'pushing') {
            const timeLeft = Math.max(0, Math.ceil((this.timeLimit - (Date.now() - this.startTime)) / 1000));
            const progressPercent = Math.round((this.currentPushes / this.targetPushes) * 100);
            
            description = `**👊 PUSH CHALLENGE**\n\n` +
                         `# 👊 PUSH! PUSH! PUSH! 👊\n\n` +
                         `**⏰ TIME LEFT: ${timeLeft} SECONDS**\n\n` +
                         `**${this.getProgressBar()}**\n\n` +
                         `**📊 PROGRESS:** ${this.currentPushes}/${this.targetPushes} pushes (${progressPercent}%)\n` +
                         `**👥 PUSHERS:** ${this.participants.size} players helping\n\n` +
                         `**React with ${this.pushEmoji} to push the bar forward!**`;
        } else if (this.gamePhase === 'complete') {
            description = `**🎉 PUSH CHALLENGE COMPLETE!**\n\n` +
                         `You completed all push challenges!\n` +
                         `Perfect teamwork and coordination!\n\n` +
                         `**Final Results:**\n${this.getRoundResultsText()}\n\n` +
                         `**Mission Status:** SUCCESS ✅`;
        } else if (this.gamePhase === 'failed') {
            description = `**💀 PUSH CHALLENGE FAILED!**\n\n` +
                         `The team couldn't push hard enough!\n` +
                         `The progress bar didn't reach the target!\n\n` +
                         `**Mission Status:** FAILED ❌`;
        }

        const embed = new EmbedBuilder()
            .setTitle('👊 PUSH CHALLENGE')
            .setDescription(description)
            .addFields(
                {
                    name: '📊 Challenge Progress',
                    value: `**Round:** ${this.currentRound}/${this.maxRounds}\n**Target:** ${this.targetPushes} pushes\n**Lives:** ${'❤️'.repeat(this.lives)} ${this.lives < 3 ? '💔'.repeat(3 - this.lives) : ''}`,
                    inline: true
                },
                {
                    name: '🎯 Status',
                    value: this.getStatusText(),
                    inline: true
                }
            )
            .setColor(this.getEmbedColor())
            .setFooter({ text: 'Push Challenge - Work together to fill the progress bar!' });

        // Add current round result if available
        if (this.gamePhase !== 'complete' && this.gamePhase !== 'failed' && this.gamePhase !== 'waiting') {
            embed.addFields({
                name: '🎯 Current Challenge',
                value: `**Time Limit:** ${this.timeLimit/1000} seconds\n**Progress Bar:** ${this.getProgressBar()}`,
                inline: false
            });
        }

        return embed;
    }

    getProgressBar() {
        const barLength = 20;
        const filledLength = Math.floor((this.currentPushes / this.targetPushes) * barLength);
        const emptyLength = barLength - filledLength;
        
        const filledBar = '█'.repeat(filledLength);
        const emptyBar = '░'.repeat(emptyLength);
        
        return `[${filledBar}${emptyBar}]`;
    }

    getRoundResultsText() {
        return this.roundResults.map((result, index) => {
            const status = result.success ? '✅' : '❌';
            return `**Round ${index + 1}:** ${result.pushes}/${result.target} pushes (${result.participants} players) ${status}`;
        }).join('\n');
    }

    getStatusText() {
        switch (this.gamePhase) {
            case 'waiting': return '⏳ Preparing to push...';
            case 'countdown': return '🎯 Get ready...';
            case 'pushing': return '👊 PUSHING!';
            case 'complete': return '🎉 All Challenges Complete!';
            case 'failed': return '💀 Challenge Failed!';
            default: return 'In progress...';
        }
    }

    getEmbedColor() {
        switch (this.gamePhase) {
            case 'waiting': return 0x4169E1; // Blue - waiting
            case 'countdown': return 0xFFA500; // Orange - getting ready
            case 'pushing': return 0xFF4500; // Red-orange - intense pushing!
            case 'complete': return 0x00FF00; // Green - success
            case 'failed': return 0x8B0000; // Dark red - failed
            default: return 0x4169E1;
        }
    }

    createActionButton() {
        const button = new ButtonBuilder()
            .setCustomId('start_push_challenge')
            .setLabel('👊 Start Push Challenge')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(this.gamePhase !== 'waiting');
        
        return [new ActionRowBuilder().addComponents(button)];
    }

    setupButtonHandler() {
        if (!this.client || !this.gameMessage) return;

        const filter = (buttonInteraction) => {
            return buttonInteraction.customId === 'start_push_challenge' && 
                   buttonInteraction.user.id === this.userId;
        };

        if (this.collector) {
            this.collector.stop();
        }

        this.collector = this.gameMessage.createMessageComponentCollector({
            filter,
            time: 30000 // 30 seconds to start
        });

        this.collector.on('collect', async (buttonInteraction) => {
            try {
                await buttonInteraction.deferUpdate();
                
                if (this.gamePhase !== 'waiting') return;
                
                await this.startPushSequence();
            } catch (error) {
                logger.error(`Push Challenge button interaction error: ${error.message}`);
            }
        });

        this.collector.on('end', async (_, reason) => {
            if (reason === 'time' && this.gamePhase === 'waiting') {
                await this.handleNoParticipants();
            }
        });
    }

    async startPushSequence() {
        try {
            if (this.collector) {
                this.collector.stop();
            }
            
            // Reset for this round
            this.currentPushes = 0;
            this.participants.clear();
            
            // Countdown phase
            this.gamePhase = 'countdown';
            const countdownEmbed = this.createGameEmbed();
            
            await this.gameMessage.edit({
                embeds: [countdownEmbed],
                components: []
            });
            
            // Countdown: 3, 2, 1
            for (let i = 3; i >= 1; i--) {
                const countEmbed = new EmbedBuilder()
                    .setTitle('👊 PUSH CHALLENGE')
                    .setDescription(`**GET READY!**\n\n# ${i}\n\n**${this.getProgressBar()}**\n\n👊 Prepare to spam ${this.pushEmoji} reactions!`)
                    .setColor(0xFFA500);
                
                await this.gameMessage.edit({
                    embeds: [countEmbed],
                    components: []
                });
                
                await this.sleep(1000);
            }
            
            // Start pushing phase
            this.gamePhase = 'pushing';
            this.startTime = Date.now();
            const pushEmbed = this.createGameEmbed();
            
            const messageReply = await this.gameMessage.edit({
                embeds: [pushEmbed],
                components: []
            });
            
            // Add the push emoji reaction to the message
            try {
                await messageReply.react(this.pushEmoji);
            } catch (error) {
                logger.error(`Failed to add initial reaction: ${error.message}`);
            }
            
            // Set up reaction listener
            this.setupReactionListener();
            
            // Update progress bar every 500ms
            this.startProgressUpdates();
            
        } catch (error) {
            logger.error(`Push Challenge sequence failed: ${error.message}`);
        }
    }

    setupReactionListener() {
        if (!this.client || !this.gameMessage) return;

        const reactionFilter = (reaction, user) => {
            return reaction.emoji.name === this.pushEmoji && !user.bot;
        };

        const reactionCollector = this.gameMessage.createReactionCollector({
            filter: reactionFilter,
            time: this.timeLimit
        });

        reactionCollector.on('collect', async (reaction, user) => {
            try {
                // Add participant
                this.participants.add(user.id);
                
                // Increment push count
                this.currentPushes++;
                
                // Check if target reached
                if (this.currentPushes >= this.targetPushes) {
                    reactionCollector.stop('target_reached');
                }
                
            } catch (error) {
                logger.error(`Reaction collection error: ${error.message}`);
            }
        });

        reactionCollector.on('end', async (_, reason) => {
            await this.handlePushingEnd(reason);
        });
    }

    startProgressUpdates() {
        const updateInterval = setInterval(async () => {
            if (this.gamePhase !== 'pushing') {
                clearInterval(updateInterval);
                return;
            }
            
            try {
                const embed = this.createGameEmbed();
                await this.gameMessage.edit({
                    embeds: [embed],
                    components: []
                });
            } catch (error) {
                // Ignore update errors during intense reaction spamming
            }
        }, 1000); // Update every second
        
        // Clear interval after time limit
        setTimeout(() => {
            clearInterval(updateInterval);
        }, this.timeLimit + 1000);
    }

    async handlePushingEnd(reason) {
        try {
            if (reason === 'target_reached') {
                // Challenge succeeded
                await this.handleRoundWin();
            } else {
                // Time ran out
                await this.handleRoundFail();
            }
        } catch (error) {
            logger.error(`Pushing end handling failed: ${error.message}`);
        }
    }

    async handleRoundWin() {
        // Record round result
        this.roundResults.push({
            pushes: this.currentPushes,
            target: this.targetPushes,
            participants: this.participants.size,
            success: true,
            round: this.currentRound
        });
        
        // Show round result
        const timeElapsed = Date.now() - this.startTime;
        const resultEmbed = new EmbedBuilder()
            .setTitle('🏆 Challenge Completed!')
            .setDescription(`**Perfect teamwork!** The progress bar was filled!\n\n**${this.getProgressBar()}**\n\n**Pushes:** ${this.currentPushes}/${this.targetPushes} ✅\n**Time taken:** ${Math.ceil(timeElapsed / 1000)} seconds\n**Team size:** ${this.participants.size} players\n\nNext round starting in 3 seconds...`)
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
            this.updateRoundSettings();
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

    async handleRoundFail() {
        this.lives--;
        
        // Record round result
        this.roundResults.push({
            pushes: this.currentPushes,
            target: this.targetPushes,
            participants: this.participants.size,
            success: false,
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
            // Show fail message and retry
            const progressPercent = Math.round((this.currentPushes / this.targetPushes) * 100);
            const failEmbed = new EmbedBuilder()
                .setTitle('❌ Challenge Failed!')
                .setDescription(`Time ran out! The progress bar wasn't filled completely.\n\n**${this.getProgressBar()}**\n\n**Progress:** ${this.currentPushes}/${this.targetPushes} pushes (${progressPercent}%) ❌\n**Team size:** ${this.participants.size} players\n**Lives remaining:** ${'❤️'.repeat(this.lives)}\n\nTrying the same round again in 3 seconds...`)
                .setColor(0xFF4444);
            
            await this.gameMessage.edit({
                embeds: [failEmbed],
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

module.exports = PushChallengeGame;