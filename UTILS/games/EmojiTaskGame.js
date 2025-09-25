/**
 * Emoji Guessing Task Game - Week 2 Task 4
 * Using the new MarriageTaskUtil system
 */

const marriageTaskUtil = require('../MarriageTaskUtil');
const { EmbedBuilder } = require('discord.js');
const logger = require('../logger');

class EmojiTaskGame {
    constructor() {
        this.init();
    }

    init() {
        // Register this game with the marriage task system
        marriageTaskUtil.registerGame('week2_task4', 'emoji', {
            title: '😀 Week 2 - Task 4: Emoji Guessing Game',
            description: 'Solve emoji puzzles together!',
            instructions: '• 6 emoji puzzles to solve\n• 3 hints available per puzzle\n• Work together to guess the answers',
            buttonLabel: 'Start Game',
            buttonEmoji: '🎯',
            color: 0xFFD700,
            requiresBothPartners: true,
            autoComplete: false, // We handle completion manually
            allowReplay: true,
            startHandler: this.handleStart.bind(this)
        });

        logger.info('EmojiTaskGame registered with MarriageTaskUtil');
    }

    async handleStart(interaction, session, util) {
        try {
            const marriage = session.marriage;
            
            const embed = new EmbedBuilder()
                .setTitle('🎯 **Emoji Guessing Game Starting!**')
                .setDescription(`**${marriage.partner1.name}** & **${marriage.partner2.name}**\n\nThis feature is coming soon! Stay tuned for emoji puzzles and challenges.`)
                .setColor(0xFFD700)
                .addFields({
                    name: '🚧 Coming Soon',
                    value: 'We\'re creating fun emoji puzzles with:\n• Movie titles in emojis\n• Song names in emojis\n• Famous phrases in emojis\n• Couple-themed challenges!',
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
            logger.error(`Error in EmojiTaskGame.handleStart: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error loading Emoji Game. Please try again.',
                components: []
            });
        }
    }
}

module.exports = EmojiTaskGame;