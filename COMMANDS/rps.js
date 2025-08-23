/**
 * Rock Paper Scissors command handler for ATIVE Casino Bot
 * Handles multiplayer RPS games with betting and turn-based gameplay
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage, parseAmount } = require('../UTILS/common');
const { 
    RPSGameSession,
    startRPSGame,
    getRPSGame,
    endRPSGame,
    handleRPSAction,
    createAnimationEmbeds
} = require('../GAMES/rps');
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
            // Check if there's already an active RPS game in this channel
            const existingGame = getRPSGame(channelId);
            if (existingGame) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Game Already Active')
                    .setDescription(`There's already an active RPS game in this channel!\n\n**Players:** ${existingGame.player1Name}${existingGame.player2Name ? ` vs ${existingGame.player2Name}` : ' (waiting for opponent)'}`)
                    .setColor(0xFF0000);

                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Ensure user exists and check for active games
            await dbManager.ensureUser(userId, username);
            
            const balance = await dbManager.getUserBalance(userId, guildId);
            if (balance.game_active) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Game Already Active')
                    .setDescription('You already have an active game session! Finish your current game first.')
                    .setColor(0xFF0000);
                
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Parse bet amount
            const amountStr = interaction.options.getString('amount');
            let betAmount;
            
            try {
                betAmount = parseAmount(amountStr, balance.wallet);
            } catch (error) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Invalid Amount')
                    .setDescription(`Invalid amount format: ${error.message}`)
                    .setColor(0xFF0000);
                
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Validate bet amount
            const MIN_BET = 50;
            if (betAmount < MIN_BET) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Minimum Bet Required')
                    .setDescription(`Minimum bet for RPS is ${fmt(MIN_BET)}!`)
                    .setColor(0xFF0000);
                
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            if (betAmount > balance.wallet) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Insufficient Funds')
                    .setDescription(`You only have ${fmt(balance.wallet)} in your wallet!\n\nUse \`/balance\` to check your funds.`)
                    .setColor(0xFF0000);
                
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Deduct bet from player 1's wallet and set game as active
            const newWalletBalance = balance.wallet - betAmount;
            
            await dbManager.updateUserBalance(userId, guildId, {
                wallet: newWalletBalance,
                game_active: true
            });

            // Create RPS game
            const rpsGame = startRPSGame(userId, username, betAmount, channelId);

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
            
            const embed = new EmbedBuilder()
                .setTitle('❌ Command Error')
                .setDescription('An error occurred while starting the RPS game. Please try again.')
                .setColor(0xFF0000);
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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

            if (player2Balance.game_active) {
                await interaction.reply({
                    content: '❌ You already have an active game session!',
                    ephemeral: true
                });
                return;
            }

            // Deduct bet from player 2 and set game as active
            const newPlayer2Wallet = player2Balance.wallet - game.potAmount;
            
            await dbManager.updateUserBalance(player2Id, guildId, {
                wallet: newPlayer2Wallet,
                game_active: true
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

            // Clear game active status for both players
            await dbManager.updateUserBalance(game.player1Id, guildId, { game_active: false });
            await dbManager.updateUserBalance(game.player2Id, guildId, { game_active: false });

            if (finalWinner === 0) {
                // Tie game - refund both players
                await dbManager.updateUserBalance(game.player1Id, guildId, { 
                    wallet: (await dbManager.getUserBalance(game.player1Id, guildId)).wallet + game.potAmount 
                });
                await dbManager.updateUserBalance(game.player2Id, guildId, { 
                    wallet: (await dbManager.getUserBalance(game.player2Id, guildId)).wallet + game.potAmount 
                });

                // Record tie results
                await dbManager.recordGameResult(game.player1Id, guildId, 'rps', false, game.potAmount, 0, {
                    opponent: game.player2Name,
                    finalScore: `${game.player1Wins}-${game.player2Wins}`,
                    result: 'tie'
                });
                await dbManager.recordGameResult(game.player2Id, guildId, 'rps', false, game.potAmount, 0, {
                    opponent: game.player1Name,
                    finalScore: `${game.player2Wins}-${game.player1Wins}`,
                    result: 'tie'
                });
            } else {
                // Someone won
                const winnerId = finalWinner === 1 ? game.player1Id : game.player2Id;
                const loserId = finalWinner === 1 ? game.player2Id : game.player1Id;
                const winnerName = finalWinner === 1 ? game.player1Name : game.player2Name;
                const loserName = finalWinner === 1 ? game.player2Name : game.player1Name;

                // Give prize to winner
                await dbManager.updateUserBalance(winnerId, guildId, { 
                    wallet: (await dbManager.getUserBalance(winnerId, guildId)).wallet + game.totalPot 
                });

                // Record game results
                await dbManager.recordGameResult(winnerId, guildId, 'rps', true, game.potAmount, game.totalPot, {
                    opponent: loserName,
                    finalScore: finalWinner === 1 ? `${game.player1Wins}-${game.player2Wins}` : `${game.player2Wins}-${game.player1Wins}`,
                    result: 'win'
                });
                await dbManager.recordGameResult(loserId, guildId, 'rps', false, game.potAmount, 0, {
                    opponent: winnerName,
                    finalScore: finalWinner === 1 ? `${game.player2Wins}-${game.player1Wins}` : `${game.player1Wins}-${game.player2Wins}`,
                    result: 'loss'
                });
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
                    await dbManager.updateUserBalance(game.player1Id, guildId, { game_active: false });
                    if (game.player2Id) {
                        await dbManager.updateUserBalance(game.player2Id, guildId, { game_active: false });
                    }
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