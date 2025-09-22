/**
 * Mash The Keyboard Game - Button Mashing Mini-Game for Heists
 * 
 * GAME RULES:
 * - Bot says: "Type 💪 FAST!"
 * - Players spam the 💪 emoji as fast as possible
 * - 5-second time limit for mashing
 * - Whoever spams the most in 5 seconds wins
 * - 4 rounds with increasing difficulty
 * - 3 Lives total
 * - Multiplayer support
 * 
 * PROGRESSION:
 * Round 1: 5 seconds, need 15+ presses
 * Round 2: 5 seconds, need 20+ presses  
 * Round 3: 5 seconds, need 25+ presses
 * Round 4: 5 seconds, need 30+ presses
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { secureRandomInt } = require('../../UTILS/rng');
const logger = require('../../UTILS/logger');

class MashTheKeyboardGame {
    constructor(config) {
        this.userId = config.userId;
        this.username = config.username;
        this.channelId = config.channelId;
        this.guildId = config.guildId;
        
        // Game state
        this.currentRound = 1;
        this.maxRounds = 4;
        this.lives = 3;
        this.gamePhase = 'waiting'; // 'waiting', 'countdown', 'mashing', 'complete', 'failed'
        this.gameMessage = null;
        this.client = null;
        this.collector = null;
        
        // Mashing configuration
        this.mashDuration = 5000; // 5 seconds
        this.requiredPresses = 10 + (this.currentRound * 5); // 15, 20, 25, 30
        this.startTime = null;
        this.participants = new Map(); // Track all participants and their press counts
        this.winner = null;
        
        this.roundResults = [];
    }

    async start(interaction) {
        this.client = interaction.client;
        
        try {
            this.updateRequiredPresses();
            
            const embed = this.createGameEmbed();
            const components = this.createActionButton();
            
            const reply = await interaction.editReply({
                embeds: [embed],
                components: components
            });
            
            this.gameMessage = reply;
            this.setupButtonHandler();
            
        } catch (error) {
            logger.error(`Mash The Keyboard game start failed: ${error.message}`);
            throw error;
        }
    }

    updateRequiredPresses() {
        this.requiredPresses = 10 + (this.currentRound * 5); // 15, 20, 25, 30
        logger.info(`Mash The Keyboard round ${this.currentRound}: need ${this.requiredPresses}+ presses in 5 seconds`);
    }

    createGameEmbed() {
        let description = '';
        
        if (this.gamePhase === 'waiting') {
            description = `**💪 MASH THE KEYBOARD**\n\n` +
                         `**ROUND ${this.currentRound}**\n\n` +
                         `Get ready for the ultimate button mashing challenge!\n\n` +
                         `**INSTRUCTIONS:**\n` +
                         `• Click "Start Mashing" to begin\n` +
                         `• When countdown ends, spam 💪 as fast as possible!\n` +
                         `• You have 5 seconds to type as many 💪 as you can\n` +
                         `• Need ${this.requiredPresses}+ presses to pass this round\n\n` +
                         `💪 **Target:** ${this.requiredPresses} presses in 5 seconds\n\n` +
                         `Click the button below when ready:`;
        } else if (this.gamePhase === 'countdown') {
            description = `**💪 MASH THE KEYBOARD**\n\n` +
                         `**GET READY TO MASH!**\n\n` +
                         `⚡ Prepare your fingers...\n` +
                         `🎯 Get ready to spam 💪...\n` +
                         `⏰ Starting very soon...\n\n` +
                         `💪 **Remember:** Type 💪 as fast as possible!`;
        } else if (this.gamePhase === 'mashing') {
            const timeLeft = Math.max(0, Math.ceil((this.mashDuration - (Date.now() - this.startTime)) / 1000));
            const leaderboard = this.getLeaderboardText();
            
            description = `**💪 MASH THE KEYBOARD**\n\n` +
                         `# 💪 TYPE 💪 FAST! 💪\n\n` +
                         `**⏰ TIME LEFT: ${timeLeft} SECONDS**\n\n` +
                         `**📊 CURRENT SCORES:**\n${leaderboard}\n\n` +
                         `**🎯 TARGET: ${this.requiredPresses} presses**\n\n` +
                         `💪💪💪 MASH FASTER! 💪💪💪`;
        } else if (this.gamePhase === 'complete') {
            description = `**🎉 MASHING COMPLETE!**\n\n` +
                         `You completed all button mashing rounds!\n` +
                         `Your fingers are lightning fast!\n\n` +
                         `**Final Results:**\n${this.getRoundResultsText()}\n\n` +
                         `**Mission Status:** SUCCESS ✅`;
        } else if (this.gamePhase === 'failed') {
            description = `**💀 MASHING FAILED!**\n\n` +
                         `Your fingers weren't fast enough!\n` +
                         `The button mashing challenge defeated you!\n\n` +
                         `**Mission Status:** FAILED ❌`;
        }

        const embed = new EmbedBuilder()
            .setTitle('💪 MASH THE KEYBOARD')
            .setDescription(description)
            .addFields(
                {
                    name: '📊 Mashing Progress',
                    value: `**Round:** ${this.currentRound}/${this.maxRounds}\n**Target:** ${this.requiredPresses} presses\n**Lives:** ${'❤️'.repeat(this.lives)} ${this.lives < 3 ? '💔'.repeat(3 - this.lives) : ''}`,
                    inline: true
                },
                {
                    name: '🎯 Status',
                    value: this.getStatusText(),
                    inline: true
                }
            )
            .setColor(this.getEmbedColor())
            .setFooter({ text: 'Mash The Keyboard - Spam 💪 as fast as you can!' });

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

    getLeaderboardText() {
        if (this.participants.size === 0) {
            return '*(No participants yet)*';
        }
        
        const sorted = Array.from(this.participants.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5); // Top 5
        
        return sorted.map((entry, index) => {
            const [, data] = entry;
            const medal = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][index];
            return `${medal} **${data.username}:** ${data.count} presses`;
        }).join('\n');
    }

    getCurrentRoundResult() {
        if (!this.winner) return 'No winner yet';
        
        const passed = this.winner.count >= this.requiredPresses;
        const resultText = passed ? '✅ PASSED!' : '❌ Failed to reach target';
        
        return `**Winner:** ${this.winner.username}\n**Presses:** ${this.winner.count}/${this.requiredPresses}\n**Result:** ${resultText}`;
    }

    getRoundResultsText() {
        return this.roundResults.map((result, index) => {
            const status = result.passed ? '✅' : '❌';
            return `**Round ${index + 1}:** ${result.winner} (${result.count} presses) ${status}`;
        }).join('\n');
    }

    getStatusText() {
        switch (this.gamePhase) {
            case 'waiting': return '⏳ Preparing to mash...';
            case 'countdown': return '🎯 Get ready...';
            case 'mashing': return '💪 MASHING!';
            case 'complete': return '🎉 Mashing Complete!';
            case 'failed': return '💀 Mashing Failed!';
            default: return 'In progress...';
        }
    }

    getEmbedColor() {
        switch (this.gamePhase) {
            case 'waiting': return 0x4169E1; // Blue - waiting
            case 'countdown': return 0xFFA500; // Orange - getting ready
            case 'mashing': return 0xFF0000; // Red - intense action!
            case 'complete': return 0x00FF00; // Green - success
            case 'failed': return 0x8B0000; // Dark red - failed
            default: return 0x4169E1;
        }
    }

    createActionButton() {
        const button = new ButtonBuilder()
            .setCustomId('start_mashing')
            .setLabel('💪 Start Mashing')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(this.gamePhase !== 'waiting');
        
        return [new ActionRowBuilder().addComponents(button)];
    }

    setupButtonHandler() {
        if (!this.client || !this.gameMessage) return;

        const filter = (buttonInteraction) => {
            return buttonInteraction.customId === 'start_mashing' && 
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
                
                await this.startMashingSequence();
            } catch (error) {
                logger.error(`Mash The Keyboard button interaction error: ${error.message}`);
            }
        });

        this.collector.on('end', async (_, reason) => {
            if (reason === 'time' && this.gamePhase === 'waiting') {
                await this.handleNoParticipants();
            }
        });
    }

    async startMashingSequence() {
        try {
            if (this.collector) {
                this.collector.stop();
            }
            
            // Clear participants for this round
            this.participants.clear();
            this.winner = null;
            
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
                    .setTitle('💪 MASH THE KEYBOARD')
                    .setDescription(`**GET READY!**\n\n# ${i}\n\n💪 Prepare to spam 💪 emoji!`)
                    .setColor(0xFFA500);
                
                await this.gameMessage.edit({
                    embeds: [countEmbed],
                    components: []
                });
                
                await this.sleep(1000);
            }
            
            // Start mashing phase
            this.gamePhase = 'mashing';
            this.startTime = Date.now();
            const mashEmbed = this.createGameEmbed();
            
            await this.gameMessage.edit({
                embeds: [mashEmbed],
                components: []
            });
            
            // Set up message listener for 💪 emoji spam
            this.setupMessageListener();
            
            // Update leaderboard every 500ms
            this.startLeaderboardUpdates();
            
        } catch (error) {
            logger.error(`Mash The Keyboard sequence failed: ${error.message}`);
        }
    }

    setupMessageListener() {
        if (!this.client) return;

        const messageFilter = (message) => {
            return message.channelId === this.channelId && 
                   message.content.trim() === '💪' &&
                   !message.author.bot;
        };

        const messageCollector = this.client.channels.cache.get(this.channelId)?.createMessageCollector({
            filter: messageFilter,
            time: this.mashDuration
        });

        if (!messageCollector) {
            logger.error('Could not create message collector for Mash The Keyboard');
            return;
        }

        messageCollector.on('collect', async (message) => {
            try {
                const userId = message.author.id;
                const username = message.author.displayName || message.author.username;
                
                // Initialize or increment participant count
                if (!this.participants.has(userId)) {
                    this.participants.set(userId, {
                        username,
                        count: 0
                    });
                }
                
                this.participants.get(userId).count++;
                
                // Delete the message to keep chat clean (optional)
                try {
                    await message.delete();
                } catch (deleteError) {
                    // Ignore deletion errors (might not have permissions)
                }
                
            } catch (error) {
                logger.error(`Message collection error: ${error.message}`);
            }
        });

        messageCollector.on('end', async () => {
            await this.handleMashingEnd();
        });
    }

    startLeaderboardUpdates() {
        const updateInterval = setInterval(async () => {
            if (this.gamePhase !== 'mashing') {
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
                // Ignore update errors during intense spamming
            }
        }, 500);
        
        // Clear interval after mashing duration
        setTimeout(() => {
            clearInterval(updateInterval);
        }, this.mashDuration + 1000);
    }

    async handleMashingEnd() {
        try {
            // Find winner (highest count)
            let highestCount = 0;
            let winnerData = null;
            
            for (const [userId, data] of this.participants) {
                if (data.count > highestCount) {
                    highestCount = data.count;
                    winnerData = { ...data, userId };
                }
            }
            
            this.winner = winnerData;
            
            if (this.winner && this.winner.count >= this.requiredPresses) {
                // Round passed
                await this.handleRoundWin();
            } else {
                // Round failed
                await this.handleRoundFail();
            }
        } catch (error) {
            logger.error(`Mashing end handling failed: ${error.message}`);
        }
    }

    async handleRoundWin() {
        // Record round result
        this.roundResults.push({
            winner: this.winner.username,
            count: this.winner.count,
            target: this.requiredPresses,
            passed: true,
            round: this.currentRound
        });
        
        // Show round result
        const resultEmbed = new EmbedBuilder()
            .setTitle('🏆 Round Passed!')
            .setDescription(`**${this.winner.username}** mashed the fastest!\n\n**Presses:** ${this.winner.count}/${this.requiredPresses} ✅\n**Result:** Target reached!\n\nNext round starting in 3 seconds...`)
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
            this.updateRequiredPresses();
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
        if (this.winner) {
            this.roundResults.push({
                winner: this.winner.username,
                count: this.winner.count,
                target: this.requiredPresses,
                passed: false,
                round: this.currentRound
            });
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
            // Show fail message and retry
            const bestCount = this.winner ? this.winner.count : 0;
            const failEmbed = new EmbedBuilder()
                .setTitle('❌ Round Failed!')
                .setDescription(`Not fast enough! Target not reached.\n\n**Best Score:** ${bestCount}/${this.requiredPresses} ❌\n**Lives remaining:** ${'❤️'.repeat(this.lives)}\n\nTrying the same round again in 3 seconds...`)
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

module.exports = MashTheKeyboardGame;