/**
 * Marriage Task Game Template
 * 
 * Copy this template to create new marriage task games easily!
 * Just replace the comments with your game logic.
 */

const marriageTaskUtil = require('../MarriageTaskUtil');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const logger = require('../logger');

class YourGameNameHere {
    constructor() {
        this.init();
    }

    init() {
        // Register your game with the marriage task system
        marriageTaskUtil.registerGame('week2_task4', 'your_game_type', {
            title: '🎮 Your Game Title Here',
            description: 'Describe what your game does here!',
            instructions: '• Step 1: Do something\n• Step 2: Do something else\n• Step 3: Complete the task!',
            buttonLabel: 'Start Game',
            buttonEmoji: '🎯',
            color: 0x00FF00, // Your theme color
            requiresBothPartners: true, // Set to false if only one partner needed
            autoComplete: true, // Set to false if you handle completion manually
            allowReplay: false, // Set to true if players can replay
            maxDuration: 15 * 60 * 1000, // 15 minutes in milliseconds
            startHandler: this.handleStart.bind(this)
        });

        logger.info('YourGameNameHere registered with MarriageTaskUtil');
    }

    /**
     * This is called when someone clicks the "Start Game" button
     */
    async handleStart(interaction, session, util) {
        try {
            const marriage = session.marriage;
            
            // Create your game's starting embed
            const embed = new EmbedBuilder()
                .setTitle('🎮 Your Game Has Started!')
                .setDescription(`**${marriage.partner1.name}** & **${marriage.partner2.name}**\n\nLet the fun begin!`)
                .setColor(0x00FF00);

            // Create action buttons for your game
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`your_game_action_${session.sessionId}`)
                        .setLabel('Do Action')
                        .setEmoji('⭐')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`your_game_quit_${session.sessionId}`)
                        .setLabel('Quit Game')
                        .setEmoji('❌')
                        .setStyle(ButtonStyle.Danger)
                );

            await util.safeReply(interaction, {
                embeds: [embed],
                components: [row]
            });

            // Store any game-specific data in the session
            session.gameData = {
                // Your game state here
                currentStep: 1,
                playersReady: [],
                // etc.
            };
            
        } catch (error) {
            logger.error(`Error in YourGameNameHere.handleStart: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error starting game. Please try again.',
                components: []
            });
        }
    }

    /**
     * Handle button clicks during your game
     * You'll need to add this to the button handler in index.js
     */
    async handleGameAction(interaction, actionType, sessionId) {
        try {
            const session = marriageTaskUtil.getGameSession(sessionId);
            if (!session || session.status !== 'active') {
                return await marriageTaskUtil.safeReply(interaction, {
                    content: '❌ Game session not found or expired.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Handle different action types
            switch (actionType) {
                case 'action':
                    await this.handleAction(interaction, session);
                    break;
                case 'quit':
                    await this.handleQuit(interaction, session);
                    break;
                default:
                    throw new Error(`Unknown action type: ${actionType}`);
            }
            
        } catch (error) {
            logger.error(`Error in handleGameAction: ${error.message}`);
            await marriageTaskUtil.safeReply(interaction, {
                content: '❌ Error processing game action.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    async handleAction(interaction, session) {
        // Handle your main game action here
        const embed = new EmbedBuilder()
            .setTitle('✅ Action Completed!')
            .setDescription('You did the thing!')
            .setColor(0x00FF00);

        await marriageTaskUtil.safeReply(interaction, {
            embeds: [embed],
            content: 'Great job! Game completed successfully!'
        });

        // Mark the task as completed
        marriageTaskUtil.endGameSession(session.sessionId, {
            completedBy: interaction.user.id,
            result: 'success'
        });
    }

    async handleQuit(interaction, session) {
        await marriageTaskUtil.safeReply(interaction, {
            content: '👋 Game ended. You can start again anytime!',
            components: []
        });

        // End the session without marking as completed
        marriageTaskUtil.endGameSession(session.sessionId, {
            result: 'quit'
        });
    }
}

module.exports = YourGameNameHere;