/**
 * Rock Paper Scissors command handler for ATIVE Casino Bot
 * Handles multiplayer RPS games with betting and turn-based gameplay
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const { 
    RPSGameSession,
    startRPSGame,
    getRPSGame,
    endRPSGame,
    handleRPSAction,
    createAnimationEmbeds
} = require('../GAMES/rps');
// sessionManager removed (Firebase dependency) - using mock implementation
const sessionManager = {
    getAllActiveSessions: () => [],
    getSessionStats: () => ({ active: 0, total: 0 }),
    getActiveSessionCount: () => 0,
    getUserSessions: (userId) => [],
    getSession: (sessionId) => null,
    endSession: async (sessionId) => ({ success: true }),
    cancelSession: async (sessionId, reason) => ({ success: true }),
    cancelUserSessions: async (userId, reason) => ({ success: true })
};
const SMGameType = { RPS: 'rps' };
const GameSessionIntegrator = require('../UTILS/gameSessionIntegrator');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('⚔️ Start a Rock Paper Scissors game')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Bet amount (both players contribute this amount)')
                .setRequired(true)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const channelId = interaction.channelId;
        const guildId = await getGuildId(interaction);
        const username = interaction.user.displayName;

        try {
            // Validate session before proceeding
            const sessionValidation = await GameSessionIntegrator.validateGameSession(userId, SMGameType.RPS, guildId);
            if (!sessionValidation.valid) {
                const errorEmbed = GameSessionIntegrator.createValidationErrorEmbed(username, 'rps', sessionValidation);
                return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Check if there's already an active RPS game in this channel
            const existingGame = getRPSGame(channelId);
            if (existingGame) {
                const embed = buildSessionEmbed({
                    title: '❌ Game Already Active',
                    topFields: [{
                        name: 'Active RPS Game',
                        value: `**Players:** ${existingGame.player1Name}${existingGame.player2Name ? ` vs ${existingGame.player2Name}` : ' (waiting for opponent)'}`
                    }],
                    stageText: 'GAME IN PROGRESS',
                    color: 0xFF0000,
                    footer: 'Wait for the current game to finish or use /stopgame'
                });

                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Ensure user exists and check for active games
            await dbManager.ensureUser(userId, username);
            
            const balance = await dbManager.getUserBalance(userId, guildId);
            // Legacy game_active check removed - handled by GameSessionIntegrator
            /*if (balance.game_active) {
                const embed = buildSessionEmbed({
                    title: '❌ Game Already Active',
                    topFields: [{
                        name: 'Active Game Session',
                        value: 'You already have an active game session!\\nFinish your current game first.'
                    }],
                    stageText: 'SESSION ACTIVE',
                    color: 0xFF0000,
                    footer: 'Use /stopgame to cancel your active games'
                });
                
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }*/

            // Use PayoutManager to validate and deduct bet IMMEDIATELY
            const amountStr = interaction.options.getString('amount');
            const validationResult = await PayoutManager.validateAndDeductBet(
                interaction,
                amountStr,
                GameType.ROCKPAPERSCISSORS,
                50,        // Min bet: $50
                10000000     // Max bet: $10M
            );

            if (!validationResult.isValid) {
                await interaction.reply({ embeds: [validationResult.errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            const betAmount = validationResult.parsedAmount;
            const newWalletBalance = validationResult.newWallet;

            // Create game session
            const sessionResult = await GameSessionIntegrator.createGameSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: SMGameType.RPS,
                betAmount,
                timeout: 60000, // 1 minute
                metadata: {
                    gamePhase: 'waiting_for_opponent',
                    player1: username,
                    betAmount
                },
                interaction
            });

            if (!sessionResult.success) {
                throw new Error(`Session creation failed: ${sessionResult.error}`);
            }

            const sessionId = sessionResult.sessionId;

            // Bet already deducted by PayoutManager

            // Create RPS game
            const rpsGame = startRPSGame(userId, username, betAmount, channelId);
            
            // Store session ID in game for later completion
            rpsGame.sessionId = sessionResult.sessionId;

            // Create initial embed and buttons
            const initialEmbed = rpsGame.getWaitingEmbed();
            const buttons = rpsGame.createButtons();

            // Send initial message
            await interaction.reply({
                embeds: [initialEmbed],
                components: buttons
            });

            // Log game start
            logger.info(`RPS game started: ${username} (${userId}) bet ${betAmount} in channel ${channelId}`);
            
            await sendLogMessage(
                interaction.client,
                'info',
                `⚔️ **RPS Game Started**\n**Player 1:** ${username} (\`${userId}\`)\n**Bet:** ${fmt(betAmount)} each\n**Prize Pool:** ${fmt(betAmount * 2)}\n**Channel:** <#${channelId}>`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error executing RPS command: ${error.message}`, { userId, error: error.stack });
            
            // Handle game error with session cleanup and refund
            await GameSessionIntegrator.handleGameError(userId, SMGameType.RPS, betAmount || 0, guildId, 'RPS game error');
            
            const embed = buildSessionEmbed({
                title: '❌ Command Error',
                topFields: [{
                    name: 'Game Error',
                    value: 'An error occurred while starting the RPS game.\nYour bet has been refunded.'
                }],
                stageText: 'ERROR OCCURRED',
                color: 0xFF0000,
                footer: 'Please try again or contact support if the issue persists'
            });
            
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                }
            } catch (replyError) {
                logger.error(`Failed to send RPS error reply: ${replyError.message}`);
            }
        }
    },

    /**
     * Handle RPS button interactions
     */
    async handleButtonInteraction(interaction, action) {
        const channelId = interaction.channelId;
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        
        try {
            const result = await handleRPSAction(interaction, action);
            
            if (result && result.success) {
                switch (result.action) {
                    case 'join':
                        await this.handlePlayerJoin(interaction, channelId, guildId, result);
                        break;
                    case 'bot_joined':
                        // Bot has joined, update session metadata
                        const game = getRPSGame(channelId);
                        if (game && game.sessionId) {
                            try {
                                await GameSessionIntegrator.updateGameSession(game.sessionId, {
                                    gamePhase: 'playing',
                                    opponent: 'Casino Bot',
                                    vsBot: true
                                });
                                logger.info(`Updated RPS session ${game.sessionId} with bot opponent`);
                            } catch (sessionError) {
                                logger.error(`Failed to update session for bot join: ${sessionError.message}`);
                            }
                        }
                        logger.info(`Bot joined RPS game in channel ${channelId}`);
                        break;
                    case 'choice_made':
                        await this.updateGameDisplay(interaction, channelId);
                        break;
                    case 'process_round':
                        await this.processRound(interaction, channelId, guildId);
                        break;
                }
            }
        } catch (error) {
            logger.error(`Error handling RPS button interaction: ${error.message}`, { userId, action });
            
            if (!interaction.replied) {
                await interaction.reply({
                    content: '❌ An error occurred while processing your RPS action.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    },

    /**
     * Handle player joining the game
     */
    async handlePlayerJoin(interaction, channelId, guildId, result) {
        try {
            const game = getRPSGame(channelId);
            if (!game) return;

            const player2Id = result.player2Id;
            const player2Name = result.player2Name;

            // Check player 2's wallet and game status
            await dbManager.ensureUser(player2Id, player2Name);
            const player2Balance = await dbManager.getUserBalance(player2Id, guildId);

            if (player2Balance.wallet < game.potAmount) {
                await interaction.reply({
                    content: `❌ You need ${fmt(game.potAmount)} to join this game! You only have ${fmt(player2Balance.wallet)}.`,
                    ephemeral: true
                });
                return;
            }

            // Legacy game_active check removed
            /*if (player2Balance.game_active) {
                await interaction.reply({
                    content: '❌ You already have an active game session!',
                    ephemeral: true
                });
                return;
            }*/

            // Deduct bet from player 2 and set game as active
            const newPlayer2Wallet = player2Balance.wallet - game.potAmount;
            
            await dbManager.updateUserBalance(player2Id, guildId, {
                wallet: newPlayer2Wallet
            });

            // Add player 2 to the game
            game.addPlayer2(player2Id, player2Name);

            // Update display to show round 1
            const roundEmbed = game.getRoundEmbed();
            const buttons = game.createButtons();

            await interaction.update({
                embeds: [roundEmbed],
                components: buttons
            });

            // Log player join
            await sendLogMessage(
                interaction.client,
                'info',
                `⚔️ **RPS Game Started**\n**Player 1:** ${game.player1Name} (\`${game.player1Id}\`)\n**Player 2:** ${player2Name} (\`${player2Id}\`)\n**Prize Pool:** ${fmt(game.totalPot)}\n**Channel:** <#${channelId}>`,
                player2Id,
                guildId
            );

        } catch (error) {
            logger.error(`Error handling player join: ${error.message}`);
            await interaction.reply({
                content: '❌ An error occurred while joining the game.',
                ephemeral: true
            });
        }
    },

    /**
     * Update game display after a choice is made
     */
    async updateGameDisplay(interaction, channelId) {
        try {
            const game = getRPSGame(channelId);
            if (!game) return;

            const roundEmbed = game.getRoundEmbed();
            const buttons = game.createButtons();

            await interaction.update({
                embeds: [roundEmbed],
                components: buttons
            });
        } catch (error) {
            logger.error(`Error updating game display: ${error.message}`);
        }
    },

    /**
     * Process a completed round
     */
    async processRound(interaction, channelId, guildId) {
        try {
            const game = getRPSGame(channelId);
            if (!game) return;

            // Process the round
            const roundResult = game.processRound();
            
            // Show animation sequence
            await this.showRoundAnimation(interaction, game, roundResult);

            // Check if game is over
            if (roundResult.gameOver) {
                await this.endRPSSession(interaction, channelId, guildId, roundResult.finalWinner);
            } else {
                // Continue to next round
                game.currentRound++;
                game.resetChoices();
                
                // Show next round after delay
                setTimeout(async () => {
                    try {
                        const nextRoundEmbed = game.getRoundEmbed();
                        const buttons = game.createButtons();
                        
                        await interaction.editReply({
                            embeds: [nextRoundEmbed],
                            components: buttons
                        });
                    } catch (err) {
                        logger.error(`Error starting next round: ${err.message}`);
                    }
                }, 2000);
            }
        } catch (error) {
            logger.error(`Error processing round: ${error.message}`);
        }
    },

    /**
     * Show animated round reveal
     */
    async showRoundAnimation(interaction, game, roundResult) {
        try {
            // Update to acknowledge the interaction immediately
            await interaction.update({
                embeds: [game.getRoundEmbed()],
                components: []
            });

            // Create animation embeds
            const animationEmbeds = createAnimationEmbeds(game, game.currentRound);
            
            // Show animation sequence
            for (const embed of animationEmbeds) {
                await interaction.editReply({ embeds: [embed] });
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Show round results
            const resultEmbed = game.getResultEmbed(roundResult);
            await interaction.editReply({ embeds: [resultEmbed] });
            await new Promise(resolve => setTimeout(resolve, 3000));

        } catch (error) {
            logger.error(`Error in round animation: ${error.message}`);
        }
    },

    /**
     * End RPS session and update database
     */
    async endRPSSession(interaction, channelId, guildId, finalWinner) {
        try {
            const game = getRPSGame(channelId);
            if (!game) return;

            // Game active status handled by SessionManager
            // Legacy flag clearing removed

            if (finalWinner === 0) {
                // Tie game - refund player (bot games don't involve player 2 wallet)
                if (game.vsBot) {
                    await dbManager.updateUserBalance(game.player1Id, guildId, { 
                        wallet: (await dbManager.getUserBalance(game.player1Id, guildId)).wallet + game.potAmount 
                    });
                    // Record tie result for bot game
                    await dbManager.updateUserStats(game.player1Id, guildId, 'rps', false, game.potAmount, 0);
                } else {
                    // Regular multiplayer tie - refund both players
                    await dbManager.updateUserBalance(game.player1Id, guildId, { 
                        wallet: (await dbManager.getUserBalance(game.player1Id, guildId)).wallet + game.potAmount 
                    });
                    await dbManager.updateUserBalance(game.player2Id, guildId, { 
                        wallet: (await dbManager.getUserBalance(game.player2Id, guildId)).wallet + game.potAmount 
                    });

                    // Record tie results
                    await dbManager.updateUserStats(game.player1Id, guildId, 'rps', false, game.potAmount, 0);
                    await dbManager.updateUserStats(game.player2Id, guildId, 'rps', false, game.potAmount, 0);
                }
            } else {
                // Someone won
                const winnerId = finalWinner === 1 ? game.player1Id : game.player2Id;
                const loserId = finalWinner === 1 ? game.player2Id : game.player1Id;
                const winnerName = finalWinner === 1 ? game.player1Name : game.player2Name;
                const loserName = finalWinner === 1 ? game.player2Name : game.player1Name;

                if (game.vsBot) {
                    // Bot game - only update human player
                    if (finalWinner === 1) {
                        // Player wins vs bot
                        await dbManager.updateUserBalance(game.player1Id, guildId, { 
                            wallet: (await dbManager.getUserBalance(game.player1Id, guildId)).wallet + game.totalPot 
                        });
                        await dbManager.updateUserStats(game.player1Id, guildId, 'rps', true, game.potAmount, game.totalPot);
                    } else {
                        // Bot wins - player loses bet
                        await dbManager.updateUserStats(game.player1Id, guildId, 'rps', false, game.potAmount, 0);
                    }
                } else {
                    // Regular multiplayer game
                    // Give prize to winner
                    await dbManager.updateUserBalance(winnerId, guildId, { 
                        wallet: (await dbManager.getUserBalance(winnerId, guildId)).wallet + game.totalPot 
                    });

                    // Record game results
                    await dbManager.updateUserStats(winnerId, guildId, 'rps', true, game.potAmount, game.totalPot);
                    await dbManager.updateUserStats(loserId, guildId, 'rps', false, game.potAmount, 0);
                }
            }

            // Show final results
            const finalEmbed = game.getFinalEmbed(finalWinner);
            await interaction.editReply({
                embeds: [finalEmbed],
                components: []
            });

            // Log game completion
            const logMessage = `⚔️ **RPS Game Completed**\n` +
                             `**Players:** ${game.player1Name} vs ${game.player2Name}\n` +
                             `**Final Score:** ${game.player1Wins} - ${game.player2Wins}\n` +
                             `**Prize Pool:** ${fmt(game.totalPot)}\n` +
                             `**Result:** ${finalWinner === 0 ? 'Tie (Both Refunded)' : 
                                         finalWinner === 1 ? `${game.player1Name} Wins` : 
                                         `${game.player2Name} Wins`}\n` +
                             `**Channel:** <#${channelId}>`;

            await sendLogMessage(
                interaction.client,
                'info',
                logMessage,
                game.player1Id,
                guildId
            );

            logger.info(`RPS game completed in channel ${channelId}: ${finalWinner === 0 ? 'Tie' : 
                       finalWinner === 1 ? `${game.player1Name} wins` : `${game.player2Name} wins`}`);

            // Complete the game session
            if (game.sessionId) {
                try {
                    await GameSessionIntegrator.completeGameSession(game.sessionId, {
                        gameResult: finalWinner === 0 ? 'tie' : (finalWinner === 1 ? 'win' : 'loss'),
                        finalScore: `${game.player1Wins}-${game.player2Wins}`,
                        opponent: game.player2Name,
                        prizePaid: finalWinner === 1 ? game.totalPot : (finalWinner === 0 && game.vsBot ? game.potAmount : 0)
                    });
                    logger.info(`Completed RPS session ${game.sessionId} for user ${game.player1Id}`);
                } catch (sessionError) {
                    logger.error(`Failed to complete RPS session: ${sessionError.message}`);
                }
            }

            // Remove game from active games
            endRPSGame(channelId);

        } catch (error) {
            logger.error(`Error ending RPS session: ${error.message}`, error);
            
            // Ensure game is removed even if there was an error
            endRPSGame(channelId);
            
            // Try to clear game active status
            try {
                const game = getRPSGame(channelId);
                if (game) {
                    // Game active status handled by SessionManager
                    // Legacy flag clearing removed
                }
            } catch (dbError) {
                logger.error(`Failed to clear game_active status: ${dbError.message}`);
            }
        }
    },

    /**
     * Get help embed
     */
    getHelpEmbed() {
        return RPSGameSession.getHelpEmbed();
    }
};