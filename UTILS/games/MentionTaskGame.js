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
            const marriage = session.marriage;
            
            // Get current progress
            const progress = await this.getProgress(marriage.id);
            
            const embed = new EmbedBuilder()
                .setTitle('💖 Week 2 - Task 1: Mention Task')
                .setDescription(`**${marriage.partner1.name}** & **${marriage.partner2.name}**\n\n📝 **Your Mission:**\n• Mention your spouse and say something nice about them\n• We'll track your mentions automatically throughout the week!\n• Use positive words like: amazing, wonderful, kind, talented, caring`)
                .setColor(0xFF69B4);

            // Add progress fields for both partners
            const partner1Progress = progress.partner1 || { mentions: 0, completed: false };
            const partner2Progress = progress.partner2 || { mentions: 0, completed: false };

            embed.addFields(
                { 
                    name: `📊 ${marriage.partner1.name}'s Progress`, 
                    value: partner1Progress.completed ? 
                        '✅ **Completed!** Nice mention detected!' : 
                        `⏳ **In Progress** (${partner1Progress.mentions} nice mentions found)`,
                    inline: true 
                },
                { 
                    name: `📊 ${marriage.partner2.name}'s Progress`, 
                    value: partner2Progress.completed ? 
                        '✅ **Completed!** Nice mention detected!' : 
                        `⏳ **In Progress** (${partner2Progress.mentions} nice mentions found)`,
                    inline: true 
                }
            );

            const bothCompleted = partner1Progress.completed && partner2Progress.completed;
            if (bothCompleted) {
                embed.setColor(0x00FF00);
                embed.addFields({
                    name: '🎉 Task Status',
                    value: '**COMPLETED!** Both partners have mentioned each other with nice messages!',
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '📝 Task Status',
                    value: 'Automatic tracking active - just mention your spouse with nice words in any channel!',
                    inline: false
                });
            }

            await util.safeReply(interaction, {
                embeds: [embed],
                components: []
            });

            // End session immediately since this is just a progress view
            util.endGameSession(session.sessionId);
            
        } catch (error) {
            logger.error(`Error in MentionTaskGame.handleStart: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error loading Mention Task progress. Please try again.',
                components: []
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

    // Check message for mention task progress - called by message listener
    async checkMention(message) {
        try {
            // Get user's marriage info
            const userId = message.author.id;
            const guildId = message.guildId;
            
            const dbManager = require('../database');
            const marriageQuery = `
                SELECT m.*, 
                       u1.username as partner1_name, 
                       u2.username as partner2_name 
                FROM marriages m 
                LEFT JOIN users u1 ON m.partner1_id COLLATE utf8mb4_unicode_ci = u1.user_id COLLATE utf8mb4_unicode_ci
                LEFT JOIN users u2 ON m.partner2_id COLLATE utf8mb4_unicode_ci = u2.user_id COLLATE utf8mb4_unicode_ci
                WHERE (m.partner1_id = ? OR m.partner2_id = ?) AND m.status = 'active'
            `;
            
            const marriages = await dbManager.databaseAdapter.executeQuery(marriageQuery, [userId, userId]);
            
            if (!marriages || marriages.length === 0) {
                return; // User not married
            }

            const marriage = marriages[0];
            const progress = await this.getProgress(marriage.id);
            const isPartner1 = message.author.id === marriage.partner1_id;
            const userProgress = isPartner1 ? progress.partner1 : progress.partner2;
            
            if (userProgress.completed) {
                return; // Already completed
            }

            // Check if they mentioned their spouse
            const spouseId = isPartner1 ? marriage.partner2_id : marriage.partner1_id;
            const mentionedSpouse = message.mentions.users.has(spouseId);
            
            if (!mentionedSpouse) {
                return; // Didn't mention spouse
            }

            // Check for nice words
            const messageText = message.content.toLowerCase();
            const foundWords = this.niceWords.filter(word => messageText.includes(word.toLowerCase()));

            if (foundWords.length === 0) {
                return; // No nice words found
            }

            // Update progress using the existing method from marriage-task
            const marriageTaskCommand = require('../../COMMANDS/marriage-task');
            await marriageTaskCommand.updateMentionTaskProgress(marriage.id, message.author.id, true);

            // Send a reaction to acknowledge the mention
            try {
                await message.react('💖');
            } catch (reactionError) {
                // Ignore reaction errors
            }

            // Check if both partners completed the task and mark overall task as done
            const updatedProgress = await this.getProgress(marriage.id);
            if (updatedProgress.partner1.completed && updatedProgress.partner2.completed) {
                // Both completed - mark task as done in marriageTaskStatus
                const marriageTaskUtil = require('../MarriageTaskUtil');
                await marriageTaskUtil.markTaskCompleted(marriage.id, 1, 'system', {
                    completedBy: 'both_partners',
                    completionType: 'mention_task'
                });
                logger.info(`Task 1 (Mention Task) marked as complete for marriage ${marriage.id}`);
            }

        } catch (error) {
            logger.error(`Error checking mention for task: ${error.message}`);
        }
    }
}

module.exports = MentionTaskGame;