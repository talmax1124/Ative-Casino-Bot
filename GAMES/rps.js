/**
 * Rock Paper Scissors Game Logic for ATIVE Casino Bot
 * Two players face off in the classic game with turn-based play
 * Best of 3 rounds format with animated reveals
 */

const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { fmt } = require('../UTILS/common');
const logger = require('../UTILS/logger');

// Game choices
const CHOICES = {
    ROCK: { emoji: '🪨', name: 'Rock' },
    PAPER: { emoji: '📄', name: 'Paper' },
    SCISSORS: { emoji: '✂️', name: 'Scissors' }
};

// Animation sequences for reveals
const CHOICE_ANIMATIONS = {
    ROCK: ['🤛', '✊', '🪨'],
    PAPER: ['🤚', '✋', '📄'],
    SCISSORS: ['✌️', '✂️', '✂️']
};

/**
 * RPS Game Session Class
 */
class RPSGameSession {
    constructor(player1Id, player1Name, potAmount, channelId) {
        this.player1Id = player1Id;
        this.player1Name = player1Name;
        this.player2Id = null;
        this.player2Name = null;
        this.potAmount = potAmount;
        this.totalPot = potAmount * 2; // Both players contribute
        this.channelId = channelId;
        
        // Game state
        this.player1Choice = null;
        this.player2Choice = null;
        this.started = false;
        this.finished = false;
        this.currentRound = 1;
        this.maxRounds = 3;
        this.player1Wins = 0;
        this.player2Wins = 0;
        this.currentTurn = 1; // 1 for player1, 2 for player2
        this.bothChose = false;
        
        logger.info(`RPS game created: ${player1Name} (${player1Id}) bet ${potAmount}`);
    }

    /**
     * Add second player to the game
     */
    addPlayer2(player2Id, player2Name) {
        this.player2Id = player2Id;
        this.player2Name = player2Name;
        this.started = true;
        logger.info(`Player 2 joined RPS game: ${player2Name} (${player2Id})`);
    }

    /**
     * Reset choices for next round
     */
    resetChoices() {
        this.player1Choice = null;
        this.player2Choice = null;
        this.bothChose = false;
        this.currentTurn = 1; // Player 1 always goes first
    }

    /**
     * Make a choice for a player
     */
    makeChoice(playerId, choice) {
        if (this.finished || this.bothChose) {
            return { success: false, error: 'Game is finished or both players have chosen' };
        }

        if (playerId === this.player1Id) {
            if (this.player1Choice) {
                return { success: false, error: 'Player 1 has already chosen' };
            }
            this.player1Choice = choice;
            this.currentTurn = 2; // Switch to player 2's turn
        } else if (playerId === this.player2Id) {
            if (this.player2Choice) {
                return { success: false, error: 'Player 2 has already chosen' };
            }
            this.player2Choice = choice;
        } else {
            return { success: false, error: 'Invalid player' };
        }

        // Check if both players have chosen
        if (this.player1Choice && this.player2Choice) {
            this.bothChose = true;
        }

        return { success: true };
    }

    /**
     * Get the winner of the current round
     * @returns {number} 0 = tie, 1 = player1 wins, 2 = player2 wins
     */
    getRoundWinner() {
        if (!this.player1Choice || !this.player2Choice) {
            return null;
        }

        const choice1 = this.player1Choice;
        const choice2 = this.player2Choice;

        if (choice1 === choice2) {
            return 0; // Tie
        }

        // Define winning combinations
        const wins = {
            'ROCK-SCISSORS': 1,
            'PAPER-ROCK': 1,
            'SCISSORS-PAPER': 1,
            'SCISSORS-ROCK': 2,
            'ROCK-PAPER': 2,
            'PAPER-SCISSORS': 2
        };

        return wins[`${choice1}-${choice2}`] || 0;
    }

    /**
     * Process round result and update wins
     */
    processRound() {
        const winner = this.getRoundWinner();
        
        if (winner === 1) {
            this.player1Wins++;
        } else if (winner === 2) {
            this.player2Wins++;
        }

        return {
            winner,
            player1Choice: this.player1Choice,
            player2Choice: this.player2Choice,
            gameOver: this.isGameOver().gameOver,
            finalWinner: this.isGameOver().winner
        };
    }

    /**
     * Check if the game is over
     */
    isGameOver() {
        // Game is over when someone wins 2 out of 3 rounds
        if (this.player1Wins >= 2) {
            return { gameOver: true, winner: 1 };
        } else if (this.player2Wins >= 2) {
            return { gameOver: true, winner: 2 };
        } else if (this.currentRound >= 3 && this.bothChose) {
            // All 3 rounds played, determine winner by wins
            if (this.player1Wins > this.player2Wins) {
                return { gameOver: true, winner: 1 };
            } else if (this.player2Wins > this.player1Wins) {
                return { gameOver: true, winner: 2 };
            } else {
                return { gameOver: true, winner: 0 }; // Tie
            }
        }
        return { gameOver: false, winner: null };
    }

    /**
     * Create game buttons
     */
    createButtons(disabled = false) {
        const rockButton = new ButtonBuilder()
            .setCustomId(`rps-${this.channelId}:rock`)
            .setLabel('Rock')
            .setEmoji('🪨')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || this.bothChose || this.finished || !this.started);

        const paperButton = new ButtonBuilder()
            .setCustomId(`rps-${this.channelId}:paper`)
            .setLabel('Paper')
            .setEmoji('📄')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || this.bothChose || this.finished || !this.started);

        const scissorsButton = new ButtonBuilder()
            .setCustomId(`rps-${this.channelId}:scissors`)
            .setLabel('Scissors')
            .setEmoji('✂️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || this.bothChose || this.finished || !this.started);

        const joinButton = new ButtonBuilder()
            .setCustomId(`rps-${this.channelId}:join`)
            .setLabel('Join Game')
            .setEmoji('⚔️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || this.started);

        const helpButton = new ButtonBuilder()
            .setCustomId(`rps-${this.channelId}:help`)
            .setLabel('Help')
            .setEmoji('❓')
            .setStyle(ButtonStyle.Secondary);

        const row1 = new ActionRowBuilder().addComponents(rockButton, paperButton, scissorsButton);
        const row2 = new ActionRowBuilder().addComponents(joinButton, helpButton);

        return [row1, row2];
    }

    /**
     * Get waiting embed (before player 2 joins)
     */
    getWaitingEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('⚔️ Rock Paper Scissors Game Created!')
            .setDescription(
                `**${this.player1Name}** started a game!\n\n` +
                `💰 **Bet Amount:** ${fmt(this.potAmount)} each\n` +
                `🎯 **Prize Pool:** ${fmt(this.totalPot)}\n` +
                `🎮 **Format:** Best of 3 rounds\n\n` +
                `**Waiting for another player to join...**`
            )
            .setColor(0x2ECC71) // Green
            .setFooter({ text: "Click 'Join Game' to challenge this player!" });

        return embed;
    }

    /**
     * Get round embed for active gameplay
     */
    getRoundEmbed() {
        if (!this.started) {
            return this.getWaitingEmbed();
        }

        const p1Status = this.player1Choice ? '✅ has chosen' : 
                        (this.currentTurn === 1 ? '⏳ choosing now' : '⏳ waiting');
        const p2Status = this.player2Choice ? '✅ has chosen' : 
                        (this.currentTurn === 2 ? '⏳ choosing now' : '⏳ waiting');

        const description = `**${this.player1Name}**: ${p1Status}\n` +
                           `**${this.player2Name}**: ${p2Status}`;

        const embed = new EmbedBuilder()
            .setTitle(`⚔️ Rock Paper Scissors - Round ${this.currentRound}`)
            .setDescription(description)
            .setColor(0xE67E22) // Orange
            .addFields(
                { name: '💰 Prize Pool', value: fmt(this.totalPot), inline: true },
                { name: '🏆 Score', value: `${this.player1Wins} - ${this.player2Wins}`, inline: true }
            );

        const currentPlayer = this.currentTurn === 1 ? this.player1Name : this.player2Name;
        embed.setFooter({ text: `It's your turn, ${currentPlayer} — choose now` });

        return embed;
    }

    /**
     * Get result embed after round completion
     */
    getResultEmbed(roundResult) {
        const { winner, player1Choice, player2Choice } = roundResult;
        
        let resultText, resultColor;
        if (winner === 1) {
            resultText = `🎉 **${this.player1Name} wins this round!**`;
            resultColor = 0x2ECC71; // Green
        } else if (winner === 2) {
            resultText = `🎉 **${this.player2Name} wins this round!**`;
            resultColor = 0x2ECC71; // Green
        } else {
            resultText = '🤝 **It\'s a tie!**';
            resultColor = 0xF1C40F; // Yellow
        }

        const embed = new EmbedBuilder()
            .setTitle(`⚔️ Round ${this.currentRound} Results`)
            .setDescription(
                `**${this.player1Name}** chose ${CHOICES[player1Choice].emoji} ${CHOICES[player1Choice].name}\n` +
                `**${this.player2Name}** chose ${CHOICES[player2Choice].emoji} ${CHOICES[player2Choice].name}\n\n` +
                resultText
            )
            .setColor(resultColor)
            .addFields(
                { name: '🏆 Score', value: `${this.player1Wins} - ${this.player2Wins}`, inline: true },
                { name: '💰 Prize Pool', value: fmt(this.totalPot), inline: true }
            );

        return embed;
    }

    /**
     * Get final game embed
     */
    getFinalEmbed(finalWinner) {
        if (finalWinner === 0) {
            // Tie game
            const embed = new EmbedBuilder()
                .setTitle('🤝 Game Tied!')
                .setDescription(
                    `**Final Score:** ${this.player1Wins} - ${this.player2Wins}\n\n` +
                    `Both players have been refunded ${fmt(this.potAmount)}!`
                )
                .setColor(0xF1C40F); // Yellow

            return embed;
        } else {
            // Winner determined
            const winnerName = finalWinner === 1 ? this.player1Name : this.player2Name;
            const loserName = finalWinner === 1 ? this.player2Name : this.player1Name;

            const embed = new EmbedBuilder()
                .setTitle('🏆 Game Complete!')
                .setDescription(
                    `**${winnerName}** defeats **${loserName}**!\n\n` +
                    `**Final Score:** ${this.player1Wins} - ${this.player2Wins}\n` +
                    `**Prize Won:** ${fmt(this.totalPot)}`
                )
                .setColor(0xF1C40F) // Gold
                .addFields(
                    { name: '🎉 Winner', value: winnerName, inline: true },
                    { name: '💰 Prize', value: fmt(this.totalPot), inline: true }
                );

            return embed;
        }
    }

    /**
     * Get help embed
     */
    static getHelpEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('⚔️ Rock Paper Scissors Help')
            .setDescription('Challenge another player to a classic game!')
            .setColor(0x3498DB)
            .addFields(
                {
                    name: '🎮 How to Play',
                    value: '`/rps [amount]` - Start a game and wait for someone to join\n' +
                           'Players take turns choosing Rock, Paper, or Scissors\n' +
                           'Best of 3 rounds wins the entire prize pool!',
                    inline: false
                },
                {
                    name: '🪨📄✂️ Game Rules',
                    value: '🪨 **Rock** beats ✂️ **Scissors**\n' +
                           '📄 **Paper** beats 🪨 **Rock**\n' +
                           '✂️ **Scissors** beats 📄 **Paper**\n' +
                           'Same choice = Tie (no points)',
                    inline: false
                },
                {
                    name: '🏆 Winning Conditions',
                    value: '• First to win **2 rounds** wins the game\n' +
                           '• Winner takes the **entire prize pool**\n' +
                           '• Tied games refund both players\n' +
                           '• Turn-based: Player 1 chooses first each round',
                    inline: false
                },
                {
                    name: '💰 Betting',
                    value: '• Both players contribute the same amount\n' +
                           '• Prize pool = 2x the bet amount\n' +
                           '• Minimum bet: $50\n' +
                           '• Use shortcuts: "1k", "all", "half"',
                    inline: false
                },
                {
                    name: '🎯 Game Features',
                    value: '• **Best of 3** rounds format\n' +
                           '• **Animated reveals** for dramatic effect\n' +
                           '• **Turn-based play** prevents rushing\n' +
                           '• **Fair and secure** with server validation',
                    inline: false
                }
            )
            .setFooter({ text: '⚔️ May the best strategist win!' });

        return embed;
    }
}

// Active RPS games storage (by channel ID)
const activeRPSGames = new Map();

/**
 * Start a new RPS game
 */
function startRPSGame(player1Id, player1Name, potAmount, channelId) {
    const game = new RPSGameSession(player1Id, player1Name, potAmount, channelId);
    activeRPSGames.set(channelId, game);
    return game;
}

/**
 * Get active RPS game for channel
 */
function getRPSGame(channelId) {
    return activeRPSGames.get(channelId);
}

/**
 * End and remove RPS game
 */
function endRPSGame(channelId) {
    const game = activeRPSGames.get(channelId);
    if (game) {
        activeRPSGames.delete(channelId);
        logger.info(`RPS game ended in channel ${channelId}`);
    }
    return game;
}

/**
 * Handle RPS button interactions
 */
async function handleRPSAction(interaction, action) {
    const channelId = interaction.channelId;
    const game = getRPSGame(channelId);

    if (!game) {
        await interaction.reply({
            content: '❌ No active RPS game found in this channel! Use `/rps` to start a new game.',
            ephemeral: true
        });
        return;
    }

    try {
        switch (action) {
            case 'join':
                return await handleJoinGame(interaction, game);
            case 'rock':
            case 'paper':
            case 'scissors':
                return await handleChoice(interaction, game, action.toUpperCase());
            case 'help':
                return await handleHelpAction(interaction);
            default:
                await interaction.reply({
                    content: '❌ Unknown RPS action.',
                    ephemeral: true
                });
        }
    } catch (error) {
        logger.error(`Error handling RPS action ${action}:`, error);
        await interaction.reply({
            content: '❌ An error occurred while processing your RPS action.',
            ephemeral: true
        });
    }
}

/**
 * Handle join game button
 */
async function handleJoinGame(interaction, game) {
    const userId = interaction.user.id;

    if (userId === game.player1Id) {
        await interaction.reply({
            content: '❌ You cannot play against yourself!',
            ephemeral: true
        });
        return { success: false };
    }

    if (game.started) {
        await interaction.reply({
            content: '❌ This game is already full!',
            ephemeral: true
        });
        return { success: false };
    }

    // Success - player can join (wallet validation will be done in command handler)
    return { 
        success: true, 
        action: 'join',
        player2Id: userId,
        player2Name: interaction.user.displayName
    };
}

/**
 * Handle choice button (rock, paper, scissors)
 */
async function handleChoice(interaction, game, choice) {
    const userId = interaction.user.id;

    if (!game.started) {
        await interaction.reply({
            content: '❌ Waiting for a second player to join!',
            ephemeral: true
        });
        return { success: false };
    }

    if (userId !== game.player1Id && userId !== game.player2Id) {
        await interaction.reply({
            content: '❌ You are not a player in this game!',
            ephemeral: true
        });
        return { success: false };
    }

    // Check if it's the player's turn
    const isPlayer1 = userId === game.player1Id;
    if ((isPlayer1 && game.currentTurn !== 1) || (!isPlayer1 && game.currentTurn !== 2)) {
        const currentPlayerName = game.currentTurn === 1 ? game.player1Name : game.player2Name;
        await interaction.reply({
            content: `❌ It's ${currentPlayerName}'s turn to choose!`,
            ephemeral: true
        });
        return { success: false };
    }

    // Make the choice
    const result = game.makeChoice(userId, choice);
    if (!result.success) {
        await interaction.reply({
            content: `❌ ${result.error}`,
            ephemeral: true
        });
        return { success: false };
    }

    // Update the game display
    if (game.bothChose) {
        // Both players have chosen, process the round
        return { 
            success: true, 
            action: 'process_round',
            bothChose: true
        };
    } else {
        // Update display to show current state
        return {
            success: true,
            action: 'choice_made',
            bothChose: false
        };
    }
}

/**
 * Handle help button
 */
async function handleHelpAction(interaction) {
    const helpEmbed = RPSGameSession.getHelpEmbed();
    await interaction.reply({
        embeds: [helpEmbed],
        ephemeral: true
    });
    return { success: true };
}

/**
 * Create animation embeds for round reveal
 */
function createAnimationEmbeds(game, roundNum) {
    const anim1 = CHOICE_ANIMATIONS[game.player1Choice];
    const anim2 = CHOICE_ANIMATIONS[game.player2Choice];
    
    return anim1.map((emoji1, index) => {
        const emoji2 = anim2[index];
        return new EmbedBuilder()
            .setTitle(`⚔️ Rock Paper Scissors - Round ${roundNum}`)
            .setDescription(
                `**${game.player1Name}** vs **${game.player2Name}**\n\n` +
                `${emoji1} vs ${emoji2}`
            )
            .setColor(0xE74C3C); // Red
    });
}

module.exports = {
    RPSGameSession,
    CHOICES,
    CHOICE_ANIMATIONS,
    startRPSGame,
    getRPSGame,
    endRPSGame,
    handleRPSAction,
    createAnimationEmbeds,
    activeRPSGames
};