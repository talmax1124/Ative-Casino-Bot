/**
 * Plant Tree Task Game - Week 1 Task 2
 * Using the new MarriageTaskUtil system
 */

const marriageTaskUtil = require('../MarriageTaskUtil');
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const logger = require('../logger');

class PlantTreeTaskGame {
    constructor() {
        this.init();
    }

    init() {
        // Register this game with the marriage task system
        marriageTaskUtil.registerGame('week1_task2', 'planttree', {
            title: '🌱 Week 1 - Task 2: Plant a Tree',
            description: 'Plant a virtual tree and keep it alive for a week!',
            instructions: '• Plant your tree together\n• Water it daily\n• Watch it grow over the week!',
            buttonLabel: 'Start Growing',
            buttonEmoji: '🌱',
            color: 0x27AE60,
            requiresBothPartners: true,
            autoComplete: false, // Manual completion after a week
            allowReplay: true,
            startHandler: this.handleStart.bind(this)
        });

        logger.info('PlantTreeTaskGame registered with MarriageTaskUtil');
    }

    async handleStart(interaction, session, util) {
        try {
            const marriage = session.marriage;
            
            // Try to use the existing PlantATree system if available
            try {
                const { PlantATreeGame } = require('../../marriages/Games/PlantATree');
                const game = new PlantATreeGame();
                
                // Start the existing game
                const gameData = await game.startTreePlanting(interaction, marriage.id);
                
                await util.safeReply(interaction, {
                    embeds: [gameData.embed],
                    components: gameData.components || []
                });
                
                // Store the game instance in session
                session.gameData = { plantTreeGame: game };
                return;
                
            } catch (gameError) {
                // Fall back to simple implementation
                logger.warn('PlantATree game not found, creating simple version');
            }
            
            // Simple implementation
            const embed = new EmbedBuilder()
                .setTitle('🌱 **Tree Planting Started!**')
                .setDescription(`**${marriage.partner1.name}** & **${marriage.partner2.name}**\n\nYou've planted your virtual tree! 🌱\n\nCome back daily to water it and watch it grow!`)
                .setColor(0x27AE60)
                .addFields(
                    {
                        name: '🌱 Your Tree',
                        value: '```\n     🌱\n    🟫🟫\n   🟫🟫🟫\n```',
                        inline: true
                    },
                    {
                        name: '💧 Care Instructions',
                        value: '• Click "Water Tree" once per day\n• Watch your tree grow over the week\n• Complete the task after 7 days!',
                        inline: false
                    },
                    {
                        name: '📅 Progress',
                        value: 'Day 1/7 - Tree planted!',
                        inline: false
                    }
                );

            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`planttree_game_water_${session.sessionId}`)
                        .setLabel('Water Tree 💧')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('💧'),
                    new ButtonBuilder()
                        .setCustomId(`planttree_game_complete_${session.sessionId}`)
                        .setLabel('Complete Task ✅')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅')
                        .setDisabled(true) // Enable after 7 days
                );

            await util.safeReply(interaction, {
                embeds: [embed],
                components: [actionButtons]
            });

            // Store initial tree data
            session.gameData = {
                plantedDate: new Date().toISOString(),
                waterCount: 1,
                treeStage: 1
            };
            
        } catch (error) {
            logger.error(`Error in PlantTreeTaskGame.handleStart: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error starting tree planting. Please try again.',
                components: []
            });
        }
    }

    // Handle button interactions for this game
    async handleGameAction(interaction, actionType, sessionId) {
        try {
            if (actionType === 'water') {
                await this.handleWaterTree(interaction, sessionId);
            } else if (actionType === 'complete') {
                await this.handleTaskComplete(interaction, sessionId);
            } else {
                await interaction.reply({
                    content: '❌ Unknown action for Plant Tree.',
                    ephemeral: true
                });
            }
        } catch (error) {
            logger.error(`Error in PlantTreeTaskGame.handleGameAction: ${error.message}`);
            await interaction.reply({
                content: '❌ Error processing plant tree action.',
                ephemeral: true
            });
        }
    }

    async handleWaterTree(interaction, sessionId) {
        try {
            const marriageTaskUtil = require('../MarriageTaskUtil');
            const session = marriageTaskUtil.getGameSession(sessionId);
            
            if (!session) {
                return await interaction.reply({
                    content: '❌ Session expired. Please start the task again.',
                    ephemeral: true
                });
            }

            const gameData = session.gameData;
            const plantedDate = new Date(gameData.plantedDate);
            const now = new Date();
            const daysSincePlanted = Math.floor((now - plantedDate) / (1000 * 60 * 60 * 24));

            // Update water count
            gameData.waterCount = (gameData.waterCount || 1) + 1;
            gameData.treeStage = Math.min(5, Math.floor(daysSincePlanted / 2) + 1);

            // Tree stages visualization
            const treeStages = [
                '```\n     🌱\n    🟫🟫\n   🟫🟫🟫\n```',
                '```\n    🌿🌿\n   🟫🟫🟫\n  🟫🟫🟫🟫\n```',
                '```\n   🌳🌳🌳\n  🟫🟫🟫🟫\n 🟫🟫🟫🟫🟫\n```',
                '```\n  🌳🌳🌳🌳\n 🟫🟫🟫🟫🟫\n🟫🟫🟫🟫🟫🟫\n```',
                '```\n 🌳🌳🌳🌳🌳\n🟫🟫🟫🟫🟫🟫\n🟫🟫🟫🟫🟫🟫\n    🌺🌺🌺\n```'
            ];

            const marriage = session.marriage;
            const canComplete = daysSincePlanted >= 7;

            const embed = new EmbedBuilder()
                .setTitle('💧 **Tree Watered!**')
                .setDescription(`**${marriage.partner1.name}** & **${marriage.partner2.name}**\n\nYour tree is growing beautifully! 🌱➡️🌳`)
                .setColor(0x27AE60)
                .addFields(
                    {
                        name: '🌳 Your Tree',
                        value: treeStages[Math.min(gameData.treeStage - 1, 4)],
                        inline: true
                    },
                    {
                        name: '💧 Care Stats',
                        value: `Times watered: ${gameData.waterCount}\nTree stage: ${gameData.treeStage}/5`,
                        inline: true
                    },
                    {
                        name: '📅 Progress',
                        value: `Day ${daysSincePlanted + 1}/7 - ${canComplete ? 'Ready to complete!' : 'Keep growing!'}`,
                        inline: false
                    }
                );

            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`planttree_game_water_${sessionId}`)
                        .setLabel('Water Tree 💧')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('💧'),
                    new ButtonBuilder()
                        .setCustomId(`planttree_game_complete_${sessionId}`)
                        .setLabel('Complete Task ✅')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅')
                        .setDisabled(!canComplete)
                );

            await interaction.update({
                embeds: [embed],
                components: [actionButtons]
            });

        } catch (error) {
            logger.error(`Error in handleWaterTree: ${error.message}`);
            await interaction.reply({
                content: '❌ Error watering tree. Please try again.',
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
            await marriageTaskUtil.markTaskCompleted(marriage.id, 2, userId, {
                completedBy: userId,
                completionType: 'plant_tree',
                waterCount: gameData.waterCount,
                treeStage: gameData.treeStage,
                completedAt: new Date().toISOString()
            });

            // Final tree display
            const embed = new EmbedBuilder()
                .setTitle('🌳 **Tree Growing Task Complete!**')
                .setDescription(`**${marriage.partner1.name}** & **${marriage.partner2.name}**\n\nCongratulations! Your tree has grown successfully! 🌱➡️🌳`)
                .setColor(0x00FF00)
                .addFields(
                    {
                        name: '🌳 Final Tree',
                        value: '```\n 🌳🌳🌳🌳🌳\n🟫🟫🟫🟫🟫🟫\n🟫🟫🟫🟫🟫🟫\n    🌺🌺🌺\n```',
                        inline: false
                    },
                    {
                        name: '🎉 Task Status',
                        value: '**COMPLETED!** Your dedication to growing this tree shows your commitment to each other!',
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

module.exports = PlantTreeTaskGame;