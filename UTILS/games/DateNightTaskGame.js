/**
 * Date Night RPG Task Game - Week 2 Task 3
 * Using the new MarriageTaskUtil system
 */

const marriageTaskUtil = require('../MarriageTaskUtil');
const { EmbedBuilder } = require('discord.js');
const logger = require('../logger');

class DateNightTaskGame {
    constructor() {
        this.init();
    }

    init() {
        // Register this game with the marriage task system
        marriageTaskUtil.registerGame('week2_task3', 'datenight', {
            title: '🌙 Week 2 - Task 3: Date Night RPG',
            description: 'Go on a virtual adventure together!',
            instructions: '• Choose-your-own adventure scenarios\n• Romantic storylines\n• Multiple paths and endings',
            buttonLabel: 'Start Adventure',
            buttonEmoji: '🎭',
            color: 0x9932CC,
            requiresBothPartners: true,
            autoComplete: false, // We handle completion manually
            allowReplay: true,
            startHandler: this.handleStart.bind(this)
        });

        logger.info('DateNightTaskGame registered with MarriageTaskUtil');
    }

    async handleStart(interaction, session, util) {
        try {
            const marriage = session.marriage;
            
            // Try to use the existing DateNightRPG system if available
            try {
                const { DateNightRPGGame } = require('../../marriages/Games/DateNightRPG');
                const game = new DateNightRPGGame();
                
                // Start the existing game
                const gameEmbed = await game.createStartEmbed(interaction.user);
                
                await util.safeReply(interaction, {
                    embeds: [gameEmbed.embed],
                    components: gameEmbed.components
                });
                
                // Store the game instance in session for later use
                session.gameData = { rpgGame: game };
                return;
                
            } catch (rpgError) {
                // Fall back to placeholder if DateNightRPG doesn't exist
                logger.warn('DateNightRPG not found, showing placeholder');
            }
            
            // Placeholder implementation
            const embed = new EmbedBuilder()
                .setTitle('🎭 **Date Night Adventure Starting!**')
                .setDescription(`**${marriage.partner1.name}** & **${marriage.partner2.name}**\n\nThis feature is being enhanced! Stay tuned for choose-your-own adventure scenarios.`)
                .setColor(0x9932CC)
                .addFields({
                    name: '🚧 Enhancement in Progress',
                    value: 'We\'re working on an amazing RPG system with branching storylines, romantic scenarios, and multiple endings!',
                    inline: false
                });

            await util.safeReply(interaction, {
                embeds: [embed],
                components: []
            });

            // End session immediately for placeholder
            util.endGameSession(session.sessionId, {
                result: 'placeholder_viewed'
            });
            
        } catch (error) {
            logger.error(`Error in DateNightTaskGame.handleStart: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error loading Date Night RPG. Please try again.',
                components: []
            });
        }
    }
}

module.exports = DateNightTaskGame;