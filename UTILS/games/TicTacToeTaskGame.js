/**
 * Tic Tac Toe Task Game - Week 1 Task 1
 * Using the new MarriageTaskUtil system
 */

const marriageTaskUtil = require('../MarriageTaskUtil');
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const logger = require('../logger');

class TicTacToeTaskGame {
    constructor() {
        this.init();
    }

    init() {
        // Register this game with the marriage task system
        marriageTaskUtil.registerGame('week1_task1', 'tictactoe', {
            title: '⭕ Week 1 - Task 1: Tic Tac Toe',
            description: 'Play a game of tic tac toe together!',
            instructions: '• One partner starts as X, the other as O\n• Take turns clicking the grid\n• First to get 3 in a row wins!',
            buttonLabel: 'Start Tic Tac Toe',
            buttonEmoji: '⭕',
            color: 0x3498DB,
            requiresBothPartners: true,
            autoComplete: true, // Auto-complete when game finishes
            allowReplay: true,
            startHandler: this.handleStart.bind(this)
        });

        logger.info('TicTacToeTaskGame registered with MarriageTaskUtil');
    }

    async handleStart(interaction, session, util) {
        try {
            const marriage = session.marriage;
            
            // Try to use the existing TicTacToe system if available
            try {
                const { TicTacToeGame } = require('../../marriages/Games/TicTacToe');
                const game = new TicTacToeGame();
                
                // Start the existing game
                const gameData = await game.createNewGame(interaction.user.id, marriage.partnerUser);
                
                await util.safeReply(interaction, {
                    embeds: [gameData.embed],
                    components: gameData.components
                });
                
                // Store the game instance in session for completion tracking
                session.gameData = { ticTacToeGame: game, gameId: gameData.gameId };
                return;
                
            } catch (gameError) {
                // Fall back to simple implementation
                logger.warn('TicTacToe game not found, creating simple version');
            }
            
            // Simple implementation
            const embed = new EmbedBuilder()
                .setTitle('⭕ **Tic Tac Toe Game Starting!**')
                .setDescription(`**${marriage.partner1.name}** vs **${marriage.partner2.name}**\n\nClick "Complete Task" when you've finished playing tic tac toe together!`)
                .setColor(0x3498DB)
                .addFields({
                    name: '🎮 How to Play',
                    value: '• Take turns clicking squares\n• Get 3 in a row to win\n• Have fun!',
                    inline: false
                });

            const completeButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`tictactoe_game_complete_${session.sessionId}`)
                        .setLabel('Complete Task ✅')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅')
                );

            await util.safeReply(interaction, {
                embeds: [embed],
                components: [completeButton]
            });
            
        } catch (error) {
            logger.error(`Error in TicTacToeTaskGame.handleStart: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error loading Tic Tac Toe game. Please try again.',
                components: []
            });
        }
    }

    // Handle button interactions for this game
    async handleGameAction(interaction, actionType, sessionId) {
        try {
            if (actionType === 'complete') {
                await this.handleTaskComplete(interaction, sessionId);
            } else {
                await interaction.reply({
                    content: '❌ Unknown action for Tic Tac Toe.',
                    ephemeral: true
                });
            }
        } catch (error) {
            logger.error(`Error in TicTacToeTaskGame.handleGameAction: ${error.message}`);
            await interaction.reply({
                content: '❌ Error processing tic tac toe action.',
                ephemeral: true
            });
        }
    }

    async handleTaskComplete(interaction, sessionId) {
        try {
            const marriageTaskUtil = require('../MarriageTaskUtil');
            const session = marriageTaskUtil.getGameSession(sessionId);
            
            if (!session) {
                return await interaction.reply({
                    content: '❌ Session expired. Please start the task again.',
                    ephemeral: true
                });
            }

            const marriage = session.marriage;
            const userId = interaction.user.id;
            
            // Check if user is part of this marriage
            if (userId !== marriage.partner1.id && userId !== marriage.partner2.id) {
                return await interaction.reply({
                    content: '❌ You are not part of this marriage!',
                    ephemeral: true
                });
            }

            // Mark task as completed
            await marriageTaskUtil.markTaskCompleted(marriage.id, 1, userId, {
                completedBy: userId,
                completionType: 'tic_tac_toe_manual',
                completedAt: new Date().toISOString()
            });

            // Update the display
            const embed = new EmbedBuilder()
                .setTitle('✅ **Tic Tac Toe Task Complete!**')
                .setDescription(`**${marriage.partner1.name}** & **${marriage.partner2.name}**\n\nGreat job completing your tic tac toe game! ⭕`)
                .setColor(0x00FF00)
                .addFields({
                    name: '🎉 Task Status',
                    value: '**COMPLETED!** You can now move on to the next task.',
                    inline: false
                });

            await interaction.update({
                embeds: [embed],
                components: []
            });

            // End the session
            marriageTaskUtil.endGameSession(sessionId, {
                result: 'task_completed',
                completedBy: userId
            });

        } catch (error) {
            logger.error(`Error in handleTaskComplete: ${error.message}`);
            await interaction.reply({
                content: '❌ Error completing task. Please try again.',
                ephemeral: true
            });
        }
    }
}

module.exports = TicTacToeTaskGame;