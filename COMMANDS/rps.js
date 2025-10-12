/**
 * Rock Paper Scissors command handler for ATIVE Casino Bot
 * Handles multiplayer RPS games with betting and turn-based gameplay
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage, clearActiveGame } = require('../UTILS/common');
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
const sessionManager = require('../UTILS/sessionManager');
const { SessionState } = sessionManager;
const logger = require('../UTILS/logger');

// Game type constant
const SMGameType = { RPS: 'rps' };

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
            logger.debug(`RPS execute called by ${username} (${userId}) in guild ${guildId}`);
            
            // Check maintenance mode first
            const maintenanceGuard = require('../UTILS/maintenanceGuard');
            const maintenanceCheck = await maintenanceGuard.check(guildId, 'rps');
            if (!maintenanceCheck.allowed) {
                return await interaction.reply({ embeds: [maintenanceCheck.embed], flags: MessageFlags.Ephemeral });
            }

            // Validate session before proceeding (via sessionGuard)
            const sessionGuard = require('../UTILS/sessionGuard');
// UNIVERSAL GAME INTEGRATION - ALL SYSTEMS
const UniversalGameIntegrator = require('../UTILS/UniversalGameIntegrator');
const securityLogger = require('../UTILS/securityLogger');
const sessionGuard = require('../UTILS/sessionGuard');
const transparentPayoutManager = require('../UTILS/transparentPayoutManager');
const tuningManager = require('../UTILS/tuningManager');
const { secureRandomFloat, secureRandomInt, secureRandomBytes } = require('../UTILS/rng');

// Initialize game integrator
const gameIntegrator = new UniversalGameIntegrator('rps');

            const check = await sessionGuard.check(userId, guildId, SMGameType.RPS, interaction.client);
            if (!check.allowed) {
                const errorEmbed = new EmbedBuilder().setTitle("❌ Session Error").setDescription(check.message).setColor(0xFF0000);
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
                null         // No max bet limit
            );

            if (!validationResult.isValid) {
                await interaction.reply({ embeds: [validationResult.errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            const betAmount = validationResult.parsedAmount;

        // ENHANCED SESSION SECURITY CHECK
        const sessionCheck = await gameIntegrator.checkGameSession(userId, guildId, 'rps', betAmount);
        if (!sessionCheck.allowed) {
            return await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('❌ Game Access Denied')
                    .setDescription(sessionCheck.message)
                    .setTimestamp()],
                ephemeral: true
            });
        }

            const newWalletBalance = validationResult.newWallet;

            // Create game session
            const sessionResult = await sessionManager.createSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: SMGameType.RPS,
                betAmount,
                betPreDeducted: true,
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
            try {
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `RPS error for ${interaction.user.tag} (${userId}) — ${error.message}`,
                    userId,
                    guildId
                );
            } catch (_) {}
            
            // Handle game error with session cleanup and refund
            try {
                const userSession = sessionManager.getUserActiveSession(userId);
                if (userSession) {
                    await sessionManager.cancelSession(userSession.sessionId, 'RPS game error', true);
                }
            } catch (sessionError) {
                logger.error(`Failed to handle RPS session error: ${sessionError.message}`);
            }

            const embed = buildSessionEmbed({
                title: `❌ ${username}'s RPS`,
                topFields: [
                    { name: 'System Error', value: 'Something went wrong during the game. Please try again.' }
                ],
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
            logger.debug(`RPS action '${action}' by ${userId} in guild ${guildId}`);
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
                                await sessionManager.updateSession(game.sessionId, {
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
            try {
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `RPS action error (${action}) for ${interaction.user.tag} (${userId}) — ${error.message}`,
                    userId,
                    guildId
                );
            } catch (_) {}
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
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Legacy game_active check removed
            /*if (player2Balance.game_active) {
                await interaction.reply({
                    content: '❌ You already have an active game session!',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }*/

            // Create session for player 2 (guarded)
            const sessionGuard = require('../UTILS/sessionGuard');
            const check = await sessionGuard.check(player2Id, guildId, SMGameType.RPS, interaction.client);
            if (!check.allowed) {
                await interaction.reply({ content: `❌ ${check.message}`, flags: MessageFlags.Ephemeral });
                return;
            }
            // Proceed to create session
            const player2SessionResult = await sessionManager.createSession({
                userId: player2Id,
                guildId,
                channelId,
                gameType: SMGameType.RPS,
                betAmount: game.potAmount,
                // Let SessionManager deduct player 2's bet and set game_active
                betPreDeducted: false,
                timeout: 300000, // 5 minutes
                metadata: {
                    gamePhase: 'playing',
                    isPlayer2: true,
                    player1Id: game.player1Id,
                    player1Name: game.player1Name
                },
                interaction
            });

            if (!player2SessionResult.success) {
                await interaction.reply({
                    content: `❌ Failed to create game session: ${player2SessionResult.error}`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Store player2's session ID in the game
            game.player2SessionId = player2SessionResult.sessionId;

            // Bet for player 2 has been deducted by SessionManager above

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
                flags: MessageFlags.Ephemeral
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

            // Determine payouts for each player
            let p1Payout = 0;
            let p2Payout = 0;
            if (finalWinner === 0) {
                // Tie: refund bets
                p1Payout = game.potAmount;
                if (!game.vsBot) p2Payout = game.potAmount;
                // Record tie stats
                await dbManager.updateUserStats(game.player1Id, guildId, 'rps', false, game.potAmount, 0);
                if (!game.vsBot) {
                    await dbManager.updateUserStats(game.player2Id, guildId, 'rps', false, game.potAmount, 0);
                }
            } else {
                // Win/Loss
                if (game.vsBot) {
                    // Only player 1 is a real user
                    if (finalWinner === 1) {
                        p1Payout = game.potAmount * 2; // return bet + profit
                        await dbManager.updateUserStats(game.player1Id, guildId, 'rps', true, game.potAmount, p1Payout);
                    } else {
                        await dbManager.updateUserStats(game.player1Id, guildId, 'rps', false, game.potAmount, 0);
                    }
                } else {
                    // Multiplayer
                    if (finalWinner === 1) {
                        p1Payout = game.totalPot; // both bets to winner
                        p2Payout = 0;
                        await dbManager.updateUserStats(game.player1Id, guildId, 'rps', true, game.potAmount, p1Payout);
                        await dbManager.updateUserStats(game.player2Id, guildId, 'rps', false, game.potAmount, 0);
                    } else if (finalWinner === 2) {
                        p1Payout = 0;
                        p2Payout = game.totalPot;
                        await dbManager.updateUserStats(game.player2Id, guildId, 'rps', true, game.potAmount, p2Payout);
                        await dbManager.updateUserStats(game.player1Id, guildId, 'rps', false, game.potAmount, 0);
                    }
                }
            }

            // Show final results
            const finalEmbed = game.getFinalEmbed(finalWinner);
            await interaction.editReply({
                embeds: [finalEmbed],
                components: []
            });

            // Check if this is a playfor game
            const playForRecipient = global.playForContext?.recipientName;
            const winningForSomeoneElse = playForRecipient && global.playForContext.recipientId;

            // Log game completion
            let resultText = '';
            if (finalWinner === 0) {
                resultText = 'Tie (Both Refunded)';
            } else if (finalWinner === 1) {
                resultText = winningForSomeoneElse ? `${game.player1Name} Wins for @${playForRecipient}` : `${game.player1Name} Wins`;
            } else {
                resultText = winningForSomeoneElse ? `${game.player2Name} Wins for @${playForRecipient}` : `${game.player2Name} Wins`;
            }

            const logMessage = `⚔️ **RPS Game Completed**\n` +
                             `**Players:** ${game.player1Name} vs ${game.player2Name}\n` +
                             `**Final Score:** ${game.player1Wins} - ${game.player2Wins}\n` +
                             `**Prize Pool:** ${fmt(game.totalPot)}\n` +
                             `**Result:** ${resultText}\n` +
                             (winningForSomeoneElse ? `**Playing For:** @${playForRecipient}\n` : '') +
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

            // Process payouts using PayoutManager for comprehensive bet size analysis
            // Player 1 payout processing
            if (p1Payout > 0) {
                try {
                    const p1GameResult = new GameResult({
                        userId: game.player1Id,
                        guildId: guildId,
                        gameType: GameType.RPS,
                        betAmount: game.potAmount,
                        payout: p1Payout,
                        won: finalWinner === 1,
                        choice: game.player1Choice || 'unknown',
                        metadata: { 
                            opponent: game.vsBot ? 'bot' : 'player',
                            finalScore: `${game.player1Wins}-${game.player2Wins}`,
                            rounds: game.currentRound,
                            choice: game.player1Choice
                        }
                    });
                    await PayoutManager.processGamePayout(p1GameResult);
                    logger.info(`Processed RPS payout for player 1 (${game.player1Id}): ${fmt(p1Payout)}`);
                } catch (payoutError) {
                    logger.error(`Failed to process player 1 RPS payout: ${payoutError.message}`);
                }
            }
            
            // Player 2 payout processing (not for bot games)
            if (game.player2Id && !game.vsBot && p2Payout > 0) {
                try {
                    const p2GameResult = new GameResult({
                        userId: game.player2Id,
                        guildId: guildId,
                        gameType: GameType.RPS,
                        betAmount: game.potAmount,
                        payout: p2Payout,
                        won: finalWinner === 2,
                        choice: game.player2Choice || 'unknown',
                        metadata: { 
                            opponent: 'player',
                            finalScore: `${game.player2Wins}-${game.player1Wins}`,
                            rounds: game.currentRound,
                            choice: game.player2Choice
                        }
                    });
                    await PayoutManager.processGamePayout(p2GameResult);
                    logger.info(`Processed RPS payout for player 2 (${game.player2Id}): ${fmt(p2Payout)}`);
                } catch (payoutError) {
                    logger.error(`Failed to process player 2 RPS payout: ${payoutError.message}`);
                }
            }
            
            // Complete sessions without payouts (PayoutManager handled the wallet updates)
            if (game.sessionId) {
                try {
                    await sessionManager.endSession(game.sessionId, {
                        payout: 0, // PayoutManager already processed the payout
                        won: finalWinner === 1,
                        reason: 'completed'
                    });
                    logger.info(`Completed RPS session ${game.sessionId} for player 1 (${game.player1Id})`);
                } catch (sessionError) {
                    logger.error(`Failed to complete player 1 RPS session: ${sessionError.message}`);
                }
            }
            
            // Complete player 2 session if exists (not for bot games)
            if (game.player2SessionId && !game.vsBot) {
                try {
                    await sessionManager.endSession(game.player2SessionId, {
                        payout: 0, // PayoutManager already processed the payout
                        won: finalWinner === 2,
                        reason: 'completed'
                    });
                    logger.info(`Completed RPS session ${game.player2SessionId} for player 2 (${game.player2Id})`);
                } catch (sessionError) {
                    logger.error(`Failed to complete player 2 RPS session: ${sessionError.message}`);
                }
            }

            // Remove game from active games
            endRPSGame(channelId);

            // Extra safety: clear any legacy active-game flags
            try { clearActiveGame(game.player1Id); } catch {}
            if (!game.vsBot && game.player2Id) { try { clearActiveGame(game.player2Id); } catch {} }

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
