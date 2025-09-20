const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../../UTILS/database');
const { getGuildId } = require('../../UTILS/common');
const logger = require('../../UTILS/logger');

// Quiz question templates
const QUIZ_QUESTIONS = [
    {
        id: 'favorite_color',
        question: "What is your partner's favorite color?",
        options: ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Pink', 'Black', 'White']
    },
    {
        id: 'favorite_food',
        question: "What is your partner's favorite food?",
        options: ['Pizza', 'Pasta', 'Burgers', 'Sushi', 'Tacos', 'Salad', 'Steak', 'Ice Cream']
    },
    {
        id: 'dream_vacation',
        question: "Where would your partner want to go on their dream vacation?",
        options: ['Beach', 'Mountains', 'City', 'Countryside', 'Desert', 'Forest', 'Space', 'Home']
    },
    {
        id: 'biggest_fear',
        question: "What is your partner most afraid of?",
        options: ['Spiders', 'Heights', 'Public Speaking', 'Dark', 'Clowns', 'Water', 'Failure', 'Being Alone']
    },
    {
        id: 'childhood_pet',
        question: "What type of pet did your partner have as a child?",
        options: ['Dog', 'Cat', 'Bird', 'Fish', 'Hamster', 'Rabbit', 'Turtle', 'No Pet']
    },
    {
        id: 'morning_person',
        question: "Is your partner a morning person or night owl?",
        options: ['Early Bird', 'Night Owl', 'Depends on Day', 'Neither']
    },
    {
        id: 'love_language',
        question: "What is your partner's love language?",
        options: ['Words of Affirmation', 'Acts of Service', 'Receiving Gifts', 'Quality Time', 'Physical Touch']
    },
    {
        id: 'ideal_date',
        question: "What would be your partner's ideal date?",
        options: ['Dinner & Movie', 'Outdoor Adventure', 'Home & Netflix', 'Concert/Show', 'Museum/Gallery', 'Gaming Together', 'Cooking Together', 'Road Trip']
    }
];

class KnowEachOtherQuiz {
    constructor(player1, player2) {
        this.player1 = player1;
        this.player2 = player2;
        this.questions = this.selectRandomQuestions(5);
        this.currentQuestionIndex = 0;
        this.player1Answers = new Map();
        this.player2Answers = new Map();
        this.phase = 'setup'; // setup, player1_answering, player2_answering, results
        this.scores = { player1: 0, player2: 0 };
    }

    selectRandomQuestions(count) {
        const shuffled = [...QUIZ_QUESTIONS].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    }

    getCurrentQuestion() {
        return this.questions[this.currentQuestionIndex];
    }

    hasMoreQuestions() {
        return this.currentQuestionIndex < this.questions.length;
    }

    nextQuestion() {
        this.currentQuestionIndex++;
    }

    recordAnswer(playerId, questionId, answer) {
        if (playerId === this.player1.id) {
            this.player1Answers.set(questionId, answer);
        } else {
            this.player2Answers.set(questionId, answer);
        }
    }

    calculateScores() {
        let player1Score = 0;
        let player2Score = 0;

        for (const question of this.questions) {
            const player1Answer = this.player1Answers.get(question.id);
            const player2Answer = this.player2Answers.get(question.id);

            // Player 1's answer about Player 2 vs Player 2's actual answer
            if (player1Answer === player2Answer) {
                player1Score++;
            }

            // Player 2's answer about Player 1 vs Player 1's actual answer  
            if (player2Answer === player1Answer) {
                player2Score++;
            }
        }

        this.scores = { player1: player1Score, player2: player2Score };
        return this.scores;
    }

    createQuestionEmbed(forPlayer, aboutPlayer) {
        const question = this.getCurrentQuestion();
        const embed = new EmbedBuilder()
            .setTitle('💕 Know Each Other Quiz')
            .setDescription(`**${forPlayer.name}**, answer this question about **${aboutPlayer.name}**:\n\n**${question.question}**`)
            .addFields({
                name: '📊 Progress',
                value: `Question ${this.currentQuestionIndex + 1} of ${this.questions.length}`,
                inline: true
            })
            .setColor(0xFF69B4);

        return embed;
    }

    createSelectMenu(questionId) {
        const question = this.getCurrentQuestion();
        const options = question.options.map((option, index) => ({
            label: option,
            value: `${questionId}_${index}`,
            description: `Select ${option}`
        }));

        return new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('quiz_answer')
                    .setPlaceholder('Choose your answer...')
                    .addOptions(options)
            );
    }

    createResultsEmbed() {
        const player1Percentage = Math.round((this.scores.player1 / this.questions.length) * 100);
        const player2Percentage = Math.round((this.scores.player2 / this.questions.length) * 100);
        const averageScore = Math.round((player1Percentage + player2Percentage) / 2);

        let resultMessage = '';
        if (averageScore >= 80) {
            resultMessage = '🎉 Excellent! You know each other very well!';
        } else if (averageScore >= 60) {
            resultMessage = '👍 Good job! You have a solid understanding of each other.';
        } else if (averageScore >= 40) {
            resultMessage = '😅 Not bad, but there\'s room for improvement!';
        } else {
            resultMessage = '😬 Looks like you need to spend more time learning about each other!';
        }

        const embed = new EmbedBuilder()
            .setTitle('📊 Quiz Results')
            .setDescription(resultMessage)
            .addFields(
                {
                    name: `${this.player1.name}'s Score`,
                    value: `${this.scores.player1}/${this.questions.length} (${player1Percentage}%)`,
                    inline: true
                },
                {
                    name: `${this.player2.name}'s Score`,
                    value: `${this.scores.player2}/${this.questions.length} (${player2Percentage}%)`,
                    inline: true
                },
                {
                    name: 'Average Score',
                    value: `${averageScore}%`,
                    inline: true
                }
            )
            .setColor(averageScore >= 80 ? 0x00FF00 : averageScore >= 60 ? 0xFFFF00 : 0xFF0000)
            .setTimestamp();

        return embed;
    }

    createQuizHistoryButton() {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('quiz_history')
                    .setLabel('View Quiz History')
                    .setEmoji('📚')
                    .setStyle(ButtonStyle.Secondary)
            );
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('marriage-quiz')
        .setDescription('Take a quiz to see how well you know your spouse'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        await interaction.deferReply();

        try {
            // Check if user is married
            const marriageData = await dbManager.getUserMarriage(userId, guildId);
            if (!marriageData.married) {
                await interaction.editReply({
                    content: '❌ You must be married to take the marriage quiz! Use `/propose` to start your love story.'
                });
                return;
            }

            const marriage = marriageData.marriage;
            const partnerId = marriage.partnerId;
            const partnerName = marriage.partnerName;

            // Create new quiz
            const quiz = new KnowEachOtherQuiz(
                { id: userId, name: interaction.user.displayName },
                { id: partnerId, name: partnerName }
            );
            
            // Store quiz in memory
            global.marriageQuizzes = global.marriageQuizzes || new Map();
            const quizId = `quiz_${marriage.id}_${Date.now()}`;
            global.marriageQuizzes.set(quizId, quiz);

            const embed = new EmbedBuilder()
                .setTitle('💕 Know Each Other Quiz')
                .setDescription(`**${interaction.user.displayName}** wants to take a quiz with **${partnerName}**!\n\nThis quiz will test how well you know each other. Both partners will answer questions about themselves and about their partner.`)
                .addFields(
                    {
                        name: '📝 How it Works',
                        value: '1. Each person answers questions about their partner\n2. Compare answers to see how well you know each other\n3. Get a compatibility score!',
                        inline: false
                    },
                    {
                        name: '🎯 Goal',
                        value: 'Score 80% or higher together to complete the weekly challenge!',
                        inline: false
                    }
                )
                .setColor(0xFF69B4)
                .setFooter({ text: `Quiz ID: ${quizId}` });

            const startButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`start_quiz_${quizId}`)
                        .setLabel('Start Quiz')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🚀')
                );

            await interaction.editReply({
                content: `<@${partnerId}> You've been invited to take a compatibility quiz! 💕`,
                embeds: [embed],
                components: [startButton]
            });

        } catch (error) {
            logger.error(`Error in marriage-quiz command: ${error.message}`);
            await interaction.editReply({
                content: '❌ An error occurred while starting the quiz. Please try again later.'
            });
        }
    },

    async handleButtonInteraction(interaction) {
        if (!interaction.customId.startsWith('start_quiz_')) return;

        const quizId = interaction.customId.replace('start_quiz_', '');
        
        if (!global.marriageQuizzes?.has(quizId)) {
            await interaction.reply({
                content: '❌ Quiz session not found. Please start a new quiz with `/marriage-quiz`.',
                ephemeral: true
            });
            return;
        }

        const quiz = global.marriageQuizzes.get(quizId);
        
        // Only married partners can start the quiz
        if (interaction.user.id !== quiz.player1.id && interaction.user.id !== quiz.player2.id) {
            await interaction.reply({
                content: '❌ Only the married couple can participate in this quiz.',
                ephemeral: true
            });
            return;
        }

        // Start with player 1 answering about player 2
        quiz.phase = 'player1_answering';
        quiz.currentQuestionIndex = 0;

        const embed = quiz.createQuestionEmbed(quiz.player1, quiz.player2);
        const selectMenu = quiz.createSelectMenu(quiz.getCurrentQuestion().id);

        await interaction.update({
            content: `**Phase 1:** ${quiz.player1.name} is answering questions about ${quiz.player2.name}`,
            embeds: [embed],
            components: [selectMenu]
        });
    },

    async handleSelectInteraction(interaction) {
        if (interaction.customId !== 'quiz_answer') return;

        const quizId = interaction.message.embeds[0]?.footer?.text?.replace('Quiz ID: ', '');
        
        if (!quizId || !global.marriageQuizzes?.has(quizId)) {
            await interaction.reply({
                content: '❌ Quiz session not found. Please start a new quiz with `/marriage-quiz`.',
                ephemeral: true
            });
            return;
        }

        const quiz = global.marriageQuizzes.get(quizId);
        const [questionId, answerIndex] = interaction.values[0].split('_');
        const selectedAnswer = quiz.getCurrentQuestion().options[parseInt(answerIndex)];

        // Check if correct player is answering
        const expectedPlayerId = quiz.phase === 'player1_answering' ? quiz.player1.id : quiz.player2.id;
        if (interaction.user.id !== expectedPlayerId) {
            await interaction.reply({
                content: '❌ It\'s not your turn to answer!',
                ephemeral: true
            });
            return;
        }

        // Record the answer
        quiz.recordAnswer(interaction.user.id, questionId, selectedAnswer);
        quiz.nextQuestion();

        // Check if current phase is complete
        if (!quiz.hasMoreQuestions()) {
            if (quiz.phase === 'player1_answering') {
                // Start phase 2: player 2 answering about player 1
                quiz.phase = 'player2_answering';
                quiz.currentQuestionIndex = 0;

                const embed = quiz.createQuestionEmbed(quiz.player2, quiz.player1);
                const selectMenu = quiz.createSelectMenu(quiz.getCurrentQuestion().id);

                await interaction.update({
                    content: `**Phase 2:** ${quiz.player2.name} is answering questions about ${quiz.player1.name}`,
                    embeds: [embed],
                    components: [selectMenu]
                });
            } else {
                // Quiz complete - show results
                quiz.calculateScores();
                const resultsEmbed = quiz.createResultsEmbed();

                await interaction.update({
                    content: '🎉 Quiz Complete!',
                    embeds: [resultsEmbed],
                    components: []
                });

                // Clean up
                global.marriageQuizzes.delete(quizId);

                // TODO: Award XP if score is high enough for challenge completion
            }
        } else {
            // Continue with next question in same phase
            const currentPlayer = quiz.phase === 'player1_answering' ? quiz.player1 : quiz.player2;
            const aboutPlayer = quiz.phase === 'player1_answering' ? quiz.player2 : quiz.player1;
            
            const embed = quiz.createQuestionEmbed(currentPlayer, aboutPlayer);
            const selectMenu = quiz.createSelectMenu(quiz.getCurrentQuestion().id);

            await interaction.update({
                embeds: [embed],
                components: [selectMenu]
            });
        }
    }
};