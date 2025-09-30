/**
 * Know Each Other Quiz Task Game - Week 1 Task 4
 * Using the new MarriageTaskUtil system
 */

const marriageTaskUtil = require('../MarriageTaskUtil');
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const logger = require('../logger');

class QuizTaskGame {
    constructor() {
        this.init();
    }

    init() {
        // Register this game with the marriage task system
        marriageTaskUtil.registerGame('week1_task4', 'quiz', {
            title: '🧠 Week 1 - Task 4: Know Each Other Quiz',
            description: 'Test how well you know each other!',
            instructions: '• Answer questions about your partner\n• See how well you know each other\n• Learn something new!',
            buttonLabel: 'Start Quiz',
            buttonEmoji: '🧠',
            color: 0xF39C12,
            requiresBothPartners: true,
            autoComplete: true, // Auto-complete when quiz finishes
            allowReplay: true,
            startHandler: this.handleStart.bind(this)
        });

        logger.info('QuizTaskGame registered with MarriageTaskUtil');
    }

    async handleStart(interaction, session, util) {
        try {
            const marriage = session.marriage;
            
            // Try to use the existing KnowEachOtherQuiz system if available
            try {
                const { KnowEachOtherQuizGame } = require('../../marriages/Games/KnowEachOtherQuiz');
                const game = new KnowEachOtherQuizGame();
                
                // Start the existing game
                const gameData = await game.startQuiz(interaction, marriage.id);
                
                await util.safeReply(interaction, {
                    embeds: [gameData.embed],
                    components: gameData.components || []
                });
                
                // Store the game instance in session
                session.gameData = { quizGame: game };
                return;
                
            } catch (gameError) {
                // Fall back to simple implementation
                logger.warn('KnowEachOtherQuiz game not found, creating simple version');
            }
            
            // Simple quiz questions
            const quizQuestions = [
                "What is your partner's favorite color?",
                "What is your partner's biggest fear?",
                "What is your partner's dream vacation destination?",
                "What is your partner's favorite food?",
                "What makes your partner happiest?",
                "What is your partner's biggest goal in life?",
                "What is your partner's favorite movie or TV show?",
                "What is one thing your partner is really good at?"
            ];
            
            // Simple implementation
            const embed = new EmbedBuilder()
                .setTitle('🧠 **Know Each Other Quiz!**')
                .setDescription(`**${marriage.partner1.name}** & **${marriage.partner2.name}**\n\nTime to test how well you know each other! 💕`)
                .setColor(0xF39C12)
                .addFields(
                    {
                        name: '📋 Quiz Format',
                        value: '• 8 questions about each other\n• Take turns answering\n• No wrong answers - learn together!',
                        inline: false
                    },
                    {
                        name: '❓ First Question',
                        value: `${marriage.partner1.name}: "${quizQuestions[0]}"`,
                        inline: false
                    },
                    {
                        name: '👥 Instructions',
                        value: 'Click "Answer Question" to provide your answer!',
                        inline: false
                    }
                );

            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`quiz_game_answer_${session.sessionId}`)
                        .setLabel('Answer Question 💭')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('💭'),
                    new ButtonBuilder()
                        .setCustomId(`quiz_game_next_${session.sessionId}`)
                        .setLabel('Next Question ➡️')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('➡️')
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(`quiz_game_complete_${session.sessionId}`)
                        .setLabel('Finish Quiz ✅')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅')
                        .setDisabled(true)
                );

            await util.safeReply(interaction, {
                embeds: [embed],
                components: [actionButtons]
            });

            // Initialize quiz data
            session.gameData = {
                questions: quizQuestions,
                currentQuestion: 0,
                currentTurn: marriage.partner1.id,
                answers: [],
                questionsAsked: marriage.partner1.id
            };
            
        } catch (error) {
            logger.error(`Error in QuizTaskGame.handleStart: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error starting quiz. Please try again.',
                components: []
            });
        }
    }

    // Handle button interactions for this game
    async handleGameAction(interaction, actionType, sessionId) {
        try {
            if (actionType === 'answer') {
                await this.handleAnswerQuestion(interaction, sessionId);
            } else if (actionType === 'next') {
                await this.handleNextQuestion(interaction, sessionId);
            } else if (actionType === 'complete') {
                await this.handleTaskComplete(interaction, sessionId);
            } else {
                await interaction.reply({
                    content: '❌ Unknown action for Quiz Task.',
                    ephemeral: true
                });
            }
        } catch (error) {
            logger.error(`Error in QuizTaskGame.handleGameAction: ${error.message}`);
            await interaction.reply({
                content: '❌ Error processing quiz action.',
                ephemeral: true
            });
        }
    }

    async handleAnswerQuestion(interaction, sessionId) {
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
            
            // Check if it's their turn (the person being asked the question)
            if (userId !== gameData.currentTurn) {
                const currentTurnName = gameData.currentTurn === marriage.partner1.id ? 
                    marriage.partner1.name : marriage.partner2.name;
                return await interaction.reply({
                    content: `❌ It's ${currentTurnName}'s turn to answer!`,
                    ephemeral: true
                });
            }

            // Create modal for answer input
            const modal = new ModalBuilder()
                .setCustomId(`quiz_answer_${sessionId}`)
                .setTitle('Answer the Quiz Question');

            const answerInput = new TextInputBuilder()
                .setCustomId('quiz_answer')
                .setLabel('Your answer:')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Type your answer here...')
                .setRequired(true)
                .setMaxLength(200);

            const firstActionRow = new ActionRowBuilder().addComponents(answerInput);
            modal.addComponents(firstActionRow);

            await interaction.showModal(modal);

        } catch (error) {
            logger.error(`Error in handleAnswerQuestion: ${error.message}`);
            await interaction.reply({
                content: '❌ Error showing answer input. Please try again.',
                ephemeral: true
            });
        }
    }

    async handleNextQuestion(interaction, sessionId) {
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
            const gameData = session.gameData;
            
            // Move to next question
            gameData.currentQuestion++;
            
            // Switch turns
            if (gameData.currentQuestion % 2 === 0) {
                gameData.currentTurn = marriage.partner1.id;
                gameData.questionsAsked = marriage.partner2.id;
            } else {
                gameData.currentTurn = marriage.partner2.id;
                gameData.questionsAsked = marriage.partner1.id;
            }

            const isLastQuestion = gameData.currentQuestion >= gameData.questions.length;
            
            if (isLastQuestion) {
                // Enable complete button
                const actionButtons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`quiz_game_answer_${sessionId}`)
                            .setLabel('Answer Question 💭')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('💭')
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId(`quiz_game_next_${sessionId}`)
                            .setLabel('Next Question ➡️')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('➡️')
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId(`quiz_game_complete_${sessionId}`)
                            .setLabel('Finish Quiz ✅')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('✅')
                    );

                const embed = new EmbedBuilder()
                    .setTitle('🧠 **Quiz Complete!**')
                    .setDescription(`**${marriage.partner1.name}** & **${marriage.partner2.name}**\n\nYou've answered all the questions! Time to finish the quiz.`)
                    .setColor(0x00FF00)
                    .addFields({
                        name: '🎉 Well Done!',
                        value: 'You both learned more about each other! Click "Finish Quiz" to complete the task.',
                        inline: false
                    });

                await interaction.update({
                    embeds: [embed],
                    components: [actionButtons]
                });
            } else {
                // Show next question
                const currentQuestionText = gameData.questions[gameData.currentQuestion];
                const askerName = gameData.questionsAsked === marriage.partner1.id ? 
                    marriage.partner1.name : marriage.partner2.name;
                const answererName = gameData.currentTurn === marriage.partner1.id ? 
                    marriage.partner1.name : marriage.partner2.name;

                const embed = new EmbedBuilder()
                    .setTitle('🧠 **Know Each Other Quiz!**')
                    .setDescription(`**${marriage.partner1.name}** & **${marriage.partner2.name}**\n\nQuestion ${gameData.currentQuestion + 1} of ${gameData.questions.length}`)
                    .setColor(0xF39C12)
                    .addFields(
                        {
                            name: '❓ Current Question',
                            value: `${askerName} asks ${answererName}: "${currentQuestionText}"`,
                            inline: false
                        },
                        {
                            name: '👥 Instructions',
                            value: `${answererName}, click "Answer Question" to provide your answer!`,
                            inline: false
                        }
                    );

                const actionButtons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`quiz_game_answer_${sessionId}`)
                            .setLabel('Answer Question 💭')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('💭'),
                        new ButtonBuilder()
                            .setCustomId(`quiz_game_next_${sessionId}`)
                            .setLabel('Next Question ➡️')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('➡️')
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId(`quiz_game_complete_${sessionId}`)
                            .setLabel('Finish Quiz ✅')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('✅')
                            .setDisabled(true)
                    );

                await interaction.update({
                    embeds: [embed],
                    components: [actionButtons]
                });
            }

        } catch (error) {
            logger.error(`Error in handleNextQuestion: ${error.message}`);
            await interaction.reply({
                content: '❌ Error moving to next question. Please try again.',
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
            await marriageTaskUtil.markTaskCompleted(marriage.id, 4, userId, {
                completedBy: userId,
                completionType: 'know_each_other_quiz',
                questionsAnswered: gameData.answers.length,
                totalQuestions: gameData.questions.length,
                completedAt: new Date().toISOString()
            });

            // Final display
            const embed = new EmbedBuilder()
                .setTitle('🧠 **Quiz Task Complete!**')
                .setDescription(`**${marriage.partner1.name}** & **${marriage.partner2.name}**\n\nCongratulations on completing the "Know Each Other" quiz! 💕`)
                .setColor(0x00FF00)
                .addFields(
                    {
                        name: '📊 Quiz Results',
                        value: `Questions answered: ${gameData.answers.length}\nNew things learned: Countless! 💕`,
                        inline: false
                    },
                    {
                        name: '🎉 Task Status',
                        value: '**COMPLETED!** You\'ve shown how much you care about knowing each other better!',
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

module.exports = QuizTaskGame;