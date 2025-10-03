/**
 * House Design & Furniture Quiz Task Game
 * Partners answer questions about their dream home and see compatibility
 */

const marriageTaskUtil = require('../MarriageTaskUtil');
const buttonUtility = require('../../UTILS/buttonUtility');
const { EmbedBuilder, MessageFlags } = require('discord.js');
const logger = require('../../UTILS/logger');
const dbManager = require('../../UTILS/database');

class HouseDesignTaskGame {
    constructor() {
        this.questions = [
            {
                id: 'style',
                question: 'What home style do you prefer?',
                options: ['Modern', 'Traditional', 'Rustic', 'Industrial']
            },
            {
                id: 'size',
                question: 'Ideal home size?',
                options: ['Cozy (1-2 BR)', 'Medium (3-4 BR)', 'Large (5+ BR)', 'Mansion']
            },
            {
                id: 'location',
                question: 'Where would you like to live?',
                options: ['City Center', 'Suburbs', 'Countryside', 'Beach/Lake']
            },
            {
                id: 'kitchen',
                question: 'Kitchen style preference?',
                options: ['Open Concept', 'Traditional Closed', 'Galley', 'Island Kitchen']
            },
            {
                id: 'colors',
                question: 'Favorite color palette?',
                options: ['Neutral/White', 'Warm/Earth', 'Cool/Blue-Grey', 'Bold/Vibrant']
            },
            {
                id: 'flooring',
                question: 'Preferred flooring?',
                options: ['Hardwood', 'Tile', 'Carpet', 'Mixed Materials']
            },
            {
                id: 'outdoor',
                question: 'Outdoor space priority?',
                options: ['Large Garden', 'Pool Area', 'Patio/Deck', 'Minimal Outdoor']
            },
            {
                id: 'bedroom',
                question: 'Master bedroom must-have?',
                options: ['Walk-in Closet', 'En-suite Bath', 'Balcony', 'Sitting Area']
            },
            {
                id: 'living',
                question: 'Living room focus?',
                options: ['Entertainment Center', 'Conversation Area', 'Library/Books', 'Minimalist']
            },
            {
                id: 'special',
                question: 'Special room priority?',
                options: ['Home Office', 'Game Room', 'Home Theater', 'Gym']
            }
        ];
        this.init();
    }

    init() {
        marriageTaskUtil.registerGame('week5_task1', 'housedesign', {
            title: '🏠 House Design & Furniture Quiz',
            description: 'Discover your dream home compatibility! Both partners answer questions about their ideal home.',
            instructions: '• Each partner answers 10 questions\n• See how compatible your dream homes are\n• Complete the quiz to finish the task',
            buttonLabel: 'Start House Quiz',
            buttonEmoji: '🏠',
            color: 0x8B4513,
            requiresBothPartners: true,
            autoComplete: false,
            startHandler: this.handleStart.bind(this)
        });

        logger.info('HouseDesignTaskGame registered');
    }

    async handleStart(interaction, session, util) {
        try {
            const marriage = session.marriage;
            const userId = interaction.user.id;
            
            // Create session in database
            const sessionId = session.sessionId;
            const query = `
                INSERT INTO marriage_house_quiz 
                (session_id, marriage_id, partner1_id, partner2_id)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE session_id = session_id
            `;
            
            await dbManager.databaseAdapter.executeQuery(query, [
                sessionId,
                marriage.id,
                marriage.partner1.id,
                marriage.partner2.id
            ]);

            // Store game data in session
            session.gameData = {
                currentQuestion: 0,
                partner1Answers: {},
                partner2Answers: {},
                activeUser: userId,
                sessionId: sessionId
            };

            // Start first question
            await this.showQuestion(interaction, session, 0, util);

        } catch (error) {
            logger.error(`Error in HouseDesignTaskGame.handleStart: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error starting house design quiz.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    async showQuestion(interaction, session, questionIndex, util) {
        const marriage = session.marriage;
        const userId = interaction.user.id;
        const isPartner1 = userId === marriage.partner1.id;
        const gameData = session.gameData;

        // Check if this user already answered
        const userAnswers = isPartner1 ? gameData.partner1Answers : gameData.partner2Answers;
        
        if (questionIndex >= this.questions.length) {
            // User finished their questions
            await this.handleUserComplete(interaction, session, util);
            return;
        }

        const question = this.questions[questionIndex];
        
        const embed = new EmbedBuilder()
            .setTitle(`🏠 Question ${questionIndex + 1}/${this.questions.length}`)
            .setDescription(`**${question.question}**`)
            .setColor(0x8B4513)
            .setFooter({ 
                text: `Answering as: ${isPartner1 ? marriage.partner1.name : marriage.partner2.name}`
            });

        // Create buttons for options
        const buttons = buttonUtility.createButtonRow(
            question.options.map((option, index) => ({
                customId: `house_answer_${questionIndex}_${index}`,
                label: option,
                style: index % 2 === 0 ? 1 : 2
            }))
        );

        await util.safeReply(interaction, {
            embeds: [embed],
            components: [buttons]
        });
        
        const message = await interaction.fetchReply();

        // Setup collector
        buttonUtility.setupCollector(message, {
            filter: (i) => i.user.id === userId,
            time: 60000,
            max: 1,
            onCollect: async (i) => {
                const [, , qIndex, aIndex] = i.customId.split('_');
                const answerIndex = parseInt(aIndex);
                const answer = question.options[answerIndex];
                
                // Store answer
                userAnswers[question.id] = answer;
                
                // Move to next question
                await this.showQuestion(i, session, questionIndex + 1, util);
            },
            onEnd: (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    interaction.followUp({
                        content: '⏰ Quiz timed out. Please restart.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
        });
    }

    async handleUserComplete(interaction, session, util) {
        const marriage = session.marriage;
        const userId = interaction.user.id;
        const isPartner1 = userId === marriage.partner1.id;
        const gameData = session.gameData;

        // Save user's answers to database
        const answersJson = JSON.stringify(isPartner1 ? gameData.partner1Answers : gameData.partner2Answers);
        const updateField = isPartner1 ? 'partner1_answers' : 'partner2_answers';
        
        const updateQuery = `
            UPDATE marriage_house_quiz 
            SET ${updateField} = ?
            WHERE session_id = ?
        `;
        
        await dbManager.databaseAdapter.executeQuery(updateQuery, [answersJson, gameData.sessionId]);

        // Check if both partners completed
        const checkQuery = `
            SELECT partner1_answers, partner2_answers 
            FROM marriage_house_quiz 
            WHERE session_id = ?
        `;
        
        const [results] = await dbManager.databaseAdapter.pool.execute(checkQuery, [gameData.sessionId]);
        const quizData = results[0];

        if (quizData.partner1_answers && quizData.partner2_answers) {
            // Both completed - calculate compatibility
            await this.calculateAndShowResults(interaction, session, util, quizData);
        } else {
            // Waiting for partner
            const partnerName = isPartner1 ? marriage.partner2.name : marriage.partner1.name;
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Your Answers Submitted!')
                .setDescription(`Great job! Now waiting for **${partnerName}** to complete their quiz.`)
                .setColor(0x00FF00)
                .addFields({
                    name: '⏳ Status',
                    value: 'Your partner will be notified to take the quiz.',
                    inline: false
                });

            await util.safeReply(interaction, {
                embeds: [embed],
                components: []
            });

            // Notify partner via mention (not DM)
            const partnerId = isPartner1 ? marriage.partner2.id : marriage.partner1.id;
            try {
                await interaction.followUp({
                    content: `<@${partnerId}> Your partner has completed the house design quiz! Use the marriage task command to take your turn.`,
                    allowedMentions: { users: [partnerId] }
                });
            } catch (error) {
                logger.error(`Failed to notify partner: ${error.message}`);
            }
        }
    }

    async calculateAndShowResults(interaction, session, util, quizData) {
        const marriage = session.marriage;
        const p1Answers = JSON.parse(quizData.partner1_answers);
        const p2Answers = JSON.parse(quizData.partner2_answers);

        // Calculate compatibility
        let matches = 0;
        const totalQuestions = this.questions.length;
        const comparison = [];

        for (const question of this.questions) {
            const p1Answer = p1Answers[question.id];
            const p2Answer = p2Answers[question.id];
            
            if (p1Answer === p2Answer) {
                matches++;
                comparison.push(`✅ **${question.question}**\nBoth chose: ${p1Answer}`);
            } else {
                comparison.push(`❌ **${question.question}**\n${marriage.partner1.name}: ${p1Answer}\n${marriage.partner2.name}: ${p2Answer}`);
            }
        }

        const compatibility = Math.round((matches / totalQuestions) * 100);

        // Update database with results
        const completeQuery = `
            UPDATE marriage_house_quiz 
            SET compatibility_score = ?, completed = TRUE, completed_at = NOW()
            WHERE session_id = ?
        `;
        
        await dbManager.databaseAdapter.executeQuery(completeQuery, [compatibility, session.sessionId]);

        // Create results embed
        const embed = new EmbedBuilder()
            .setTitle('🏠 Dream Home Compatibility Results!')
            .setDescription(`**${marriage.partner1.name}** & **${marriage.partner2.name}**`)
            .setColor(compatibility >= 70 ? 0x00FF00 : compatibility >= 40 ? 0xFFFF00 : 0xFF0000)
            .addFields(
                {
                    name: '💕 Compatibility Score',
                    value: `**${compatibility}%** (${matches}/${totalQuestions} matches)`,
                    inline: false
                },
                {
                    name: '📊 Comparison',
                    value: comparison.slice(0, 3).join('\n\n'),
                    inline: false
                }
            );

        if (compatibility >= 70) {
            embed.addFields({
                name: '🎉 Result',
                value: 'Amazing! You have very similar dream home visions!',
                inline: false
            });
        } else if (compatibility >= 40) {
            embed.addFields({
                name: '💭 Result',
                value: 'Some differences, but plenty of common ground to build on!',
                inline: false
            });
        } else {
            embed.addFields({
                name: '🤝 Result',
                value: 'Different visions, but opposites can create beautiful homes together!',
                inline: false
            });
        }

        await util.safeReply(interaction, {
            embeds: [embed],
            components: []
        });

        // Mark task as completed for both partners
        await marriageTaskUtil.markTaskCompleted(marriage.id, 17, 'both', {
            compatibility: compatibility,
            matches: matches,
            completedAt: new Date().toISOString()
        });

        // End session
        marriageTaskUtil.endGameSession(session.sessionId, {
            compatibility: compatibility
        });
    }
}

module.exports = HouseDesignTaskGame;