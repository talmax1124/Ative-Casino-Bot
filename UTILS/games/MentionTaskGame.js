/**
 * Example: Mention Task Game
 * 
 * This shows how simple it is to create a new marriage task game
 * using the MarriageTaskUtil system!
 */

const marriageTaskUtil = require('../MarriageTaskUtil');
const { EmbedBuilder } = require('discord.js');
const logger = require('../logger');

class MentionTaskGame {
    constructor() {
        this.niceWords = [
            'amazing', 'wonderful', 'awesome', 'incredible', 'fantastic', 'brilliant', 'outstanding',
            'remarkable', 'exceptional', 'magnificent', 'marvelous', 'spectacular', 'superb',
            'excellent', 'perfect', 'beautiful', 'lovely', 'adorable', 'charming', 'delightful',
            'sweet', 'kind', 'caring', 'thoughtful', 'generous', 'supportive', 'inspiring',
            'talented', 'smart', 'clever', 'funny', 'hilarious', 'entertaining', 'fun',
            'cool', 'rad', 'neat', 'great', 'good', 'nice', 'pleasant', 'friendly',
            'special', 'unique', 'precious', 'valuable', 'important', 'loved', 'cherished',
            'handsome', 'gorgeous', 'pretty', 'attractive', 'stunning', 'cute', 'hot'
        ];
        
        this.init();
    }

    init() {
        // Register this game with the marriage task system
        marriageTaskUtil.registerGame('week2_task1', 'mention', {
            title: '💖 Week 2 - Task 1: Mention Task',
            description: 'Mention your spouse and say something nice about them!',
            instructions: '• Mention your spouse and say something nice about them\n• We\'ll track your mentions automatically throughout the week!\n• Use positive words like: amazing, wonderful, kind, talented, caring',
            buttonLabel: 'View Progress',
            buttonEmoji: '💖',
            color: 0xFF69B4,
            requiresBothPartners: true,
            autoComplete: false, // We handle completion manually when both partners complete
            allowReplay: true,
            startHandler: this.handleStart.bind(this)
        });

        logger.info('MentionTaskGame registered with MarriageTaskUtil');
    }

    async handleStart(interaction, session, util) {
        try {
            const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
            const marriage = session.marriage;
            
            // Get current progress
            const progress = await this.getProgress(marriage.id);
            
            const embed = new EmbedBuilder()
                .setTitle('💖 Week 2 - Task 1: Mention Task')
                .setDescription(`**${marriage.partner1.name}** & **${marriage.partner2.name}**\n\n📝 **Your Mission:**\n• Mention your spouse and say something nice about them in any channel\n• Then click the "I Mentioned My Spouse!" button below to mark your progress\n• Use positive words like: amazing, wonderful, kind, talented, caring`)
                .setColor(0xFF69B4);

            // Add progress fields for both partners
            const partner1Progress = progress.partner1 || { mentions: 0, completed: false };
            const partner2Progress = progress.partner2 || { mentions: 0, completed: false };

            embed.addFields(
                { 
                    name: `📊 ${marriage.partner1.name}'s Progress`, 
                    value: partner1Progress.completed ? 
                        '✅ **Completed!** Nice mention submitted!' : 
                        `⏳ **In Progress** (${partner1Progress.mentions} mentions submitted)`,
                    inline: true 
                },
                { 
                    name: `📊 ${marriage.partner2.name}'s Progress`, 
                    value: partner2Progress.completed ? 
                        '✅ **Completed!** Nice mention submitted!' : 
                        `⏳ **In Progress** (${partner2Progress.mentions} mentions submitted)`,
                    inline: true 
                }
            );

            const bothCompleted = partner1Progress.completed && partner2Progress.completed;
            if (bothCompleted) {
                embed.setColor(0x00FF00);
                embed.addFields({
                    name: '🎉 Task Status',
                    value: '**COMPLETED!** Both partners have submitted their nice mentions!',
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '📝 Task Status',
                    value: 'Click the button below after mentioning your spouse with nice words!',
                    inline: false
                });
            }

            // Create interaction button for submitting mentions (only if not completed)
            const components = [];
            if (!bothCompleted) {
                const currentUserProgress = session.marriage.currentUser === marriage.partner1.id ? partner1Progress : partner2Progress;
                if (!currentUserProgress.completed) {
                    const submitButton = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`mention_game_submit_${session.sessionId}`)
                                .setLabel('I Mentioned My Spouse! 💖')
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('💖')
                        );
                    components.push(submitButton);
                }
            }

            await util.safeReply(interaction, {
                embeds: [embed],
                components: components
            });

            // Don't end session immediately if there are active buttons
            if (components.length === 0) {
                util.endGameSession(session.sessionId);
            }
            
        } catch (error) {
            logger.error(`Error in MentionTaskGame.handleStart: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error loading Mention Task progress. Please try again.',
                components: []
            });
        }
    }

    // Handle button interactions for this game
    async handleGameAction(interaction, actionType, sessionId) {
        try {
            if (actionType === 'submit') {
                await this.handleMentionSubmit(interaction, sessionId);
            } else {
                await interaction.reply({
                    content: '❌ Unknown action for Mention Task.',
                    ephemeral: true
                });
            }
        } catch (error) {
            logger.error(`Error in MentionTaskGame.handleGameAction: ${error.message}`);
            await interaction.reply({
                content: '❌ Error processing mention task action.',
                ephemeral: true
            });
        }
    }

    async handleMentionSubmit(interaction, sessionId) {
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
            
            // Check if user is part of this marriage
            if (userId !== marriage.partner1.id && userId !== marriage.partner2.id) {
                return await interaction.reply({
                    content: '❌ You are not part of this marriage!',
                    ephemeral: true
                });
            }

            // Get current progress
            const progress = await this.getProgress(marriage.id);
            const isPartner1 = userId === marriage.partner1.id;
            const userProgress = isPartner1 ? progress.partner1 : progress.partner2;

            if (userProgress.completed) {
                return await interaction.reply({
                    content: '✅ You have already completed this task!',
                    ephemeral: true
                });
            }

            // Update progress using existing method
            const marriageTaskCommand = require('../../COMMANDS/marriage-task');
            await marriageTaskCommand.updateMentionTaskProgress(marriage.id, userId, true);

            // Check if both partners completed and mark overall task as done
            const updatedProgress = await this.getProgress(marriage.id);
            if (updatedProgress.partner1.completed && updatedProgress.partner2.completed) {
                await marriageTaskUtil.markTaskCompleted(marriage.id, 1, userId, {
                    completedBy: 'both_partners',
                    completionType: 'mention_task_interactive'
                });
            }

            // Update the display
            await this.handleStart(interaction, session, marriageTaskUtil);

        } catch (error) {
            logger.error(`Error in handleMentionSubmit: ${error.message}`);
            await interaction.reply({
                content: '❌ Error submitting mention. Please try again.',
                ephemeral: true
            });
        }
    }

    async getProgress(marriageId) {
        try {
            // Call the existing mention task progress methods from marriage-task
            const marriageTaskCommand = require('../../COMMANDS/marriage-task');
            return await marriageTaskCommand.getMentionTaskProgress(marriageId);
        } catch (error) {
            logger.error(`Error getting mention progress: ${error.message}`);
            return {
                partner1: { mentions: 0, completed: false },
                partner2: { mentions: 0, completed: false }
            };
        }
    }

    // Note: Message-based mention checking removed to work without message content intent
    // Users now use the interactive button to submit their mentions
}

module.exports = MentionTaskGame;