const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const dbManager = require('../../UTILS/database');
const { getGuildId } = require('../../UTILS/common');
const logger = require('../../UTILS/logger');

/**
 * CoupleTrivia Game - Week 2, Task 2
 * Each partner creates 3 trivia questions about their relationship for the other to answer
 */
class CoupleTriviaGame {
    constructor() {
        this.questionTypes = [
            'Where was our first...?',
            'What is my favorite...?',
            'When did we first...?',
            'What was I wearing when...?',
            'What did I say about...?',
            'How do I feel about...?',
            'What is our special...?',
            'Who said "..." first?'
        ];
    }

    /**
     * Create the main trivia game embed
     */
    createTriviaEmbed(marriage, currentUser, triviaData = null) {
        const partnerName = currentUser.id === marriage.partner1_id ? marriage.partner2_name : marriage.partner1_name;
        const partnerId = currentUser.id === marriage.partner1_id ? marriage.partner2_id : marriage.partner1_id;

        const embed = new EmbedBuilder()
            .setTitle('🧠 Couple Trivia Challenge!')
            .setDescription(
                `**${marriage.partner1_name}** & **${marriage.partner2_name}**\n\n` +
                `💡 **How it works:**\n` +
                `• Each partner creates 3 trivia questions about your relationship\n` +
                `• Then you take turns answering each other's questions\n` +
                `• Test how well you really know each other!\n\n` +
                `📝 **Example Questions:**\n` +
                `• "Where was our first date?"\n` +
                `• "What's my favorite pizza topping?"\n` +
                `• "What movie did we watch on our anniversary?"`
            )
            .setColor(0x9C27B0);

        if (!triviaData || (!triviaData.questions1 && !triviaData.questions2)) {
            // Initial state - no questions created yet
            embed.addFields({
                name: '🎯 Get Started',
                value: 'Both partners need to create their 3 questions first!',
                inline: false
            });

            const createButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`trivia_create_${marriage.id}_${currentUser.id}`)
                        .setLabel('📝 Create My Questions')
                        .setStyle(ButtonStyle.Primary)
                );

            return { embed, components: [createButton] };
        }

        // Show progress and question status
        let statusText = '';
        
        const partner1Questions = triviaData.questions1 ? JSON.parse(triviaData.questions1) : null;
        const partner2Questions = triviaData.questions2 ? JSON.parse(triviaData.questions2) : null;
        const partner1Answers = triviaData.answers1 ? JSON.parse(triviaData.answers1) : null;
        const partner2Answers = triviaData.answers2 ? JSON.parse(triviaData.answers2) : null;

        statusText += `**${marriage.partner1_name}:**\n`;
        statusText += `📝 Questions: ${partner1Questions ? '✅ Created' : '⏳ Pending'}\n`;
        statusText += `📋 Answered ${marriage.partner2_name}'s questions: ${partner1Answers ? '✅ Complete' : '⏳ Pending'}\n\n`;
        
        statusText += `**${marriage.partner2_name}:**\n`;
        statusText += `📝 Questions: ${partner2Questions ? '✅ Created' : '⏳ Pending'}\n`;
        statusText += `📋 Answered ${marriage.partner1_name}'s questions: ${partner2Answers ? '✅ Complete' : '⏳ Pending'}\n\n`;

        // Determine what actions are available
        const myQuestions = currentUser.id === marriage.partner1_id ? partner1Questions : partner2Questions;
        const partnerQuestions = currentUser.id === marriage.partner1_id ? partner2Questions : partner1Questions;
        const myAnswers = currentUser.id === marriage.partner1_id ? partner1Answers : partner2Answers;

        embed.addFields({ name: '📊 Progress', value: statusText, inline: false });

        const buttons = [];

        // Can create questions if haven't created them yet
        if (!myQuestions) {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`trivia_create_${marriage.id}_${currentUser.id}`)
                    .setLabel('📝 Create My Questions')
                    .setStyle(ButtonStyle.Primary)
            );
        }

        // Can answer questions if partner has created them and I haven't answered yet
        if (partnerQuestions && !myAnswers) {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`trivia_answer_${marriage.id}_${currentUser.id}`)
                    .setLabel(`🧠 Answer ${partnerName}'s Questions`)
                    .setStyle(ButtonStyle.Success)
            );
        }

        // Can view results if both have answered
        if (partner1Answers && partner2Answers) {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`trivia_results_${marriage.id}_${currentUser.id}`)
                    .setLabel('🏆 View Results')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        const components = buttons.length > 0 ? [new ActionRowBuilder().addComponents(buttons)] : [];
        
        embed.setFooter({ text: 'Marriage Task 2 • Couple Trivia' });

        return { embed, components };
    }

    /**
     * Create modal for question creation
     */
    createQuestionModal(marriageId, userId) {
        const modal = new ModalBuilder()
            .setCustomId(`trivia_questions_${marriageId}_${userId}`)
            .setTitle('Create Your 3 Trivia Questions');

        const question1 = new TextInputBuilder()
            .setCustomId('question1')
            .setLabel('Question 1 (and answer)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Example: Where was our first date? | The park')
            .setRequired(true)
            .setMaxLength(200);

        const question2 = new TextInputBuilder()
            .setCustomId('question2')
            .setLabel('Question 2 (and answer)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Example: What is my favorite color? | Blue')
            .setRequired(true)
            .setMaxLength(200);

        const question3 = new TextInputBuilder()
            .setCustomId('question3')
            .setLabel('Question 3 (and answer)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Example: What movie did we watch last? | The Princess Bride')
            .setRequired(true)
            .setMaxLength(200);

        modal.addComponents(
            new ActionRowBuilder().addComponents(question1),
            new ActionRowBuilder().addComponents(question2),
            new ActionRowBuilder().addComponents(question3)
        );

        return modal;
    }

    /**
     * Create modal for answering questions
     */
    createAnswerModal(marriageId, userId, questions) {
        const modal = new ModalBuilder()
            .setCustomId(`trivia_answers_${marriageId}_${userId}`)
            .setTitle('Answer Your Partner\'s Questions');

        const answer1 = new TextInputBuilder()
            .setCustomId('answer1')
            .setLabel(`Q1: ${questions[0].question}`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        const answer2 = new TextInputBuilder()
            .setCustomId('answer2')
            .setLabel(`Q2: ${questions[1].question}`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        const answer3 = new TextInputBuilder()
            .setCustomId('answer3')
            .setLabel(`Q3: ${questions[2].question}`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        modal.addComponents(
            new ActionRowBuilder().addComponents(answer1),
            new ActionRowBuilder().addComponents(answer2),
            new ActionRowBuilder().addComponents(answer3)
        );

        return modal;
    }

    /**
     * Process question creation
     */
    parseQuestions(modalData) {
        const questions = [];
        
        for (let i = 1; i <= 3; i++) {
            const questionAnswer = modalData[`question${i}`];
            if (questionAnswer && questionAnswer.includes('|')) {
                const [question, answer] = questionAnswer.split('|').map(s => s.trim());
                questions.push({ question, answer });
            } else {
                throw new Error(`Question ${i} must include both question and answer separated by "|"`);
            }
        }
        
        return questions;
    }

    /**
     * Calculate trivia results
     */
    calculateResults(questions, answers) {
        let correct = 0;
        const results = [];

        for (let i = 0; i < 3; i++) {
            const question = questions[i];
            const userAnswer = answers[i];
            const correctAnswer = question.answer;
            
            // Simple fuzzy matching (case insensitive, trim whitespace)
            const isCorrect = userAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim();
            
            if (isCorrect) correct++;
            
            results.push({
                question: question.question,
                userAnswer: userAnswer,
                correctAnswer: correctAnswer,
                isCorrect: isCorrect
            });
        }

        return { correct, total: 3, results };
    }

    /**
     * Create results display embed
     */
    createResultsEmbed(marriage, triviaData) {
        const partner1Questions = JSON.parse(triviaData.questions1);
        const partner2Questions = JSON.parse(triviaData.questions2);
        const partner1Answers = JSON.parse(triviaData.answers1);
        const partner2Answers = JSON.parse(triviaData.answers2);

        // Calculate results for both partners
        const partner1Results = this.calculateResults(partner2Questions, partner1Answers);
        const partner2Results = this.calculateResults(partner1Questions, partner2Answers);

        const embed = new EmbedBuilder()
            .setTitle('🏆 Couple Trivia Results!')
            .setDescription(
                `**${marriage.partner1_name}** & **${marriage.partner2_name}**\n\n` +
                `Let's see how well you know each other! 💕`
            )
            .setColor(0x4CAF50)
            .addFields(
                {
                    name: `📊 ${marriage.partner1_name}'s Score`,
                    value: `**${partner1Results.correct}/${partner1Results.total}** correct answers!`,
                    inline: true
                },
                {
                    name: `📊 ${marriage.partner2_name}'s Score`,
                    value: `**${partner2Results.correct}/${partner2Results.total}** correct answers!`,
                    inline: true
                },
                {
                    name: '💕 Overall',
                    value: `Combined Score: **${partner1Results.correct + partner2Results.correct}/6**`,
                    inline: true
                }
            );

        // Add detailed results
        let detailText = `**${marriage.partner1_name} answering ${marriage.partner2_name}'s questions:**\n`;
        partner1Results.results.forEach((result, i) => {
            detailText += `${result.isCorrect ? '✅' : '❌'} Q${i+1}: ${result.question}\n`;
            detailText += `   Your answer: "${result.userAnswer}"\n`;
            if (!result.isCorrect) {
                detailText += `   Correct answer: "${result.correctAnswer}"\n`;
            }
            detailText += '\n';
        });

        detailText += `**${marriage.partner2_name} answering ${marriage.partner1_name}'s questions:**\n`;
        partner2Results.results.forEach((result, i) => {
            detailText += `${result.isCorrect ? '✅' : '❌'} Q${i+1}: ${result.question}\n`;
            detailText += `   Your answer: "${result.userAnswer}"\n`;
            if (!result.isCorrect) {
                detailText += `   Correct answer: "${result.correctAnswer}"\n`;
            }
            detailText += '\n';
        });

        embed.addFields({ name: '📝 Detailed Results', value: detailText, inline: false });

        const totalScore = partner1Results.correct + partner2Results.correct;
        let message = '';
        if (totalScore === 6) {
            message = '🎉 Perfect! You two know each other amazingly well!';
        } else if (totalScore >= 4) {
            message = '💕 Great job! You have a strong connection!';
        } else if (totalScore >= 2) {
            message = '😊 Not bad! There\'s always more to learn about each other!';
        } else {
            message = '😅 Looks like you have some fun discoveries to make!';
        }

        embed.addFields({ name: '💌 Result', value: message, inline: false });
        embed.setFooter({ text: 'Marriage Task 2 • Trivia Complete!' });

        return embed;
    }

    /**
     * Create the initial start embed for the game
     */
    async createStartEmbed(user) {
        // Get user's marriage info
        const marriageData = await dbManager.getUserMarriage(user.id, user.guildId || '1403244656845787167');
        if (!marriageData || !marriageData.married) {
            throw new Error('User not married');
        }
        
        const marriage = marriageData.marriage;
        const partnerName = user.id === marriage.partner1_id ? marriage.partner2_name : marriage.partner1_name;
        
        const embed = new EmbedBuilder()
            .setTitle('❓ Couple Trivia Challenge!')
            .setDescription(
                `**${marriage.partner1_name}** & **${marriage.partner2_name}**\n\n` +
                `Time to test how well you know each other! 🧠💕\n\n` +
                `🎯 **How it works:**\n` +
                `• Each partner creates 3 trivia questions about your relationship\n` +
                `• Take turns answering each other's questions\n` +
                `• Learn fun facts and share sweet memories\n` +
                `• Complete all questions to finish the task!\n\n` +
                `Ready to start creating questions, **${user.displayName}**?`
            )
            .setColor('#FF69B4')
            .setFooter({ text: 'Marriage Task 2 • Test your couple knowledge!' });

        const startButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`trivia_begin_${marriage.id}_${user.id}`)
                    .setLabel('🚀 Start Creating Questions')
                    .setStyle(ButtonStyle.Primary)
            );

        return { embed, components: [startButton] };
    }
}

module.exports = { CoupleTriviaGame };