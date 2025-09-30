/**
 * Poem Together Task Game - Week 1 Task 3
 * Using the new MarriageTaskUtil system
 */

const marriageTaskUtil = require('../MarriageTaskUtil');
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const logger = require('../logger');

class PoemTaskGame {
    constructor() {
        this.init();
    }

    init() {
        // Register this game with the marriage task system
        marriageTaskUtil.registerGame('week1_task3', 'poem', {
            title: '📝 Week 1 - Task 3: Nature Poem',
            description: 'Write a poem about nature together!',
            instructions: '• Create a beautiful poem about nature\n• Take turns writing lines\n• Let others vote on your creation!',
            buttonLabel: 'Start Writing',
            buttonEmoji: '📝',
            color: 0x8E44AD,
            requiresBothPartners: true,
            autoComplete: false, // Complete after voting
            allowReplay: true,
            startHandler: this.handleStart.bind(this)
        });

        logger.info('PoemTaskGame registered with MarriageTaskUtil');
    }

    async handleStart(interaction, session, util) {
        try {
            const marriage = session.marriage;
            
            // Try to use the existing PoemTogether system if available
            try {
                const { PoemTogetherGame } = require('../../marriages/Games/PoemTogether');
                const game = new PoemTogetherGame();
                
                // Start the existing game
                const gameData = await game.startPoem(interaction, marriage.id);
                
                await util.safeReply(interaction, {
                    embeds: [gameData.embed],
                    components: gameData.components || []
                });
                
                // Store the game instance in session
                session.gameData = { poemGame: game };
                return;
                
            } catch (gameError) {
                // Fall back to simple implementation
                logger.warn('PoemTogether game not found, creating simple version');
            }
            
            // Simple implementation
            const embed = new EmbedBuilder()
                .setTitle('📝 **Nature Poem Creation!**')
                .setDescription(`**${marriage.partner1.name}** & **${marriage.partner2.name}**\n\nTime to create a beautiful poem about nature together! 🌿`)
                .setColor(0x8E44AD)
                .addFields(
                    {
                        name: '📖 Your Poem So Far',
                        value: '*Start your poem here...*',
                        inline: false
                    },
                    {
                        name: '📝 Instructions',
                        value: '• Take turns adding lines to your poem\n• Focus on nature themes (trees, flowers, seasons, etc.)\n• Make it meaningful and beautiful!',
                        inline: false
                    },
                    {
                        name: '👥 Next Turn',
                        value: `${marriage.partner1.name} starts first!`,
                        inline: false
                    }
                );

            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`poem_game_addline_${session.sessionId}`)
                        .setLabel('Add Line 📝')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📝'),
                    new ButtonBuilder()
                        .setCustomId(`poem_game_complete_${session.sessionId}`)
                        .setLabel('Finish Poem ✅')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅')
                        .setDisabled(true) // Enable after some lines
                );

            await util.safeReply(interaction, {
                embeds: [embed],
                components: [actionButtons]
            });

            // Initialize poem data
            session.gameData = {
                poemLines: [],
                currentTurn: marriage.partner1.id,
                turnCount: 0
            };
            
        } catch (error) {
            logger.error(`Error in PoemTaskGame.handleStart: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error starting poem creation. Please try again.',
                components: []
            });
        }
    }

    // Handle button interactions for this game
    async handleGameAction(interaction, actionType, sessionId) {
        try {
            if (actionType === 'addline') {
                await this.handleAddLine(interaction, sessionId);
            } else if (actionType === 'complete') {
                await this.handleTaskComplete(interaction, sessionId);
            } else {
                await interaction.reply({
                    content: '❌ Unknown action for Poem Task.',
                    ephemeral: true
                });
            }
        } catch (error) {
            logger.error(`Error in PoemTaskGame.handleGameAction: ${error.message}`);
            await interaction.reply({
                content: '❌ Error processing poem action.',
                ephemeral: true
            });
        }
    }

    async handleAddLine(interaction, sessionId) {
        try {
            const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
            
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
            const gameData = session.gameData;
            
            // Check if it's their turn
            if (userId !== gameData.currentTurn) {
                const currentTurnName = gameData.currentTurn === marriage.partner1.id ? 
                    marriage.partner1.name : marriage.partner2.name;
                return await interaction.reply({
                    content: `❌ It's ${currentTurnName}'s turn to add a line!`,
                    ephemeral: true
                });
            }

            // Create modal for line input
            const modal = new ModalBuilder()
                .setCustomId(`poem_line_${sessionId}`)
                .setTitle('Add a Line to Your Poem');

            const lineInput = new TextInputBuilder()
                .setCustomId('poem_line')
                .setLabel('Your poem line about nature:')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., "The gentle breeze whispers through the trees"')
                .setRequired(true)
                .setMaxLength(100);

            const firstActionRow = new ActionRowBuilder().addComponents(lineInput);
            modal.addComponents(firstActionRow);

            await interaction.showModal(modal);

        } catch (error) {
            logger.error(`Error in handleAddLine: ${error.message}`);
            await interaction.reply({
                content: '❌ Error showing poem input. Please try again.',
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
            const gameData = session.gameData;
            
            // Check if user is part of this marriage
            if (userId !== marriage.partner1.id && userId !== marriage.partner2.id) {
                return await interaction.reply({
                    content: '❌ You are not part of this marriage!',
                    ephemeral: true
                });
            }

            // Mark task as completed
            await marriageTaskUtil.markTaskCompleted(marriage.id, 3, userId, {
                completedBy: userId,
                completionType: 'nature_poem',
                poemLines: gameData.poemLines,
                totalLines: gameData.poemLines.length,
                completedAt: new Date().toISOString()
            });

            // Final poem display
            const finalPoem = gameData.poemLines.length > 0 ? 
                gameData.poemLines.join('\n') : 
                '*A beautiful poem about nature was created!*';

            const embed = new EmbedBuilder()
                .setTitle('📝 **Nature Poem Complete!**')
                .setDescription(`**${marriage.partner1.name}** & **${marriage.partner2.name}**\n\nYour beautiful nature poem is finished! 🌿`)
                .setColor(0x00FF00)
                .addFields(
                    {
                        name: '🌿 Your Nature Poem',
                        value: `*"${finalPoem}"*`,
                        inline: false
                    },
                    {
                        name: '🎉 Task Status',
                        value: '**COMPLETED!** Your creative collaboration shows the beauty of working together!',
                        inline: false
                    }
                );

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

module.exports = PoemTaskGame;