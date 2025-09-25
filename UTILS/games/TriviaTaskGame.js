/**
 * Trivia Task Game - Week 2 Task 2
 * Using the new MarriageTaskUtil system
 */

const marriageTaskUtil = require('../MarriageTaskUtil');
const { EmbedBuilder } = require('discord.js');
const logger = require('../logger');

class TriviaTaskGame {
    constructor() {
        this.init();
    }

    init() {
        // Register this game with the marriage task system
        marriageTaskUtil.registerGame('week2_task2', 'trivia', {
            title: '❓ Week 2 - Task 2: Couple Trivia',
            description: 'Answer questions about each other!',
            instructions: '• One partner creates 3 questions\n• The other partner answers them\n• Switch roles and repeat!',
            buttonLabel: 'Start Trivia',
            buttonEmoji: '🤔',
            color: 0xFF69B4,
            requiresBothPartners: true,
            autoComplete: false, // We handle completion manually
            allowReplay: true,
            startHandler: this.handleStart.bind(this)
        });

        logger.info('TriviaTaskGame registered with MarriageTaskUtil');
    }

    async handleStart(interaction, session, util) {
        try {
            const marriage = session.marriage;
            
            const embed = new EmbedBuilder()
                .setTitle('🤔 **Couple Trivia Starting!**')
                .setDescription(`**${marriage.partner1.name}** & **${marriage.partner2.name}**\n\nThis feature is coming soon! Stay tuned for fun trivia questions about each other.`)
                .setColor(0xFF69B4)
                .addFields({
                    name: '🚧 Coming Soon',
                    value: 'We\'re working on an amazing trivia system with custom questions, scoring, and fun challenges!',
                    inline: false
                });

            await util.safeReply(interaction, {
                embeds: [embed],
                components: []
            });

            // End session immediately since this is just a placeholder
            util.endGameSession(session.sessionId, {
                result: 'placeholder_viewed'
            });
            
        } catch (error) {
            logger.error(`Error in TriviaTaskGame.handleStart: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error loading Trivia Task. Please try again.',
                components: []
            });
        }
    }
}

module.exports = TriviaTaskGame;