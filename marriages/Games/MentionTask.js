const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../../UTILS/database');
const { getGuildId } = require('../../UTILS/common');
const logger = require('../../UTILS/logger');

/**
 * MentionTask Game - Week 2, Task 1
 * Users must mention their spouse 
 */
class MentionTaskGame {
    constructor() {
        this.niceWords = [
            'amazing', 'wonderful', 'awesome', 'incredible', 'fantastic', 'brilliant', 'outstanding',
            'remarkable', 'exceptional', 'magnificent', 'marvelous', 'spectacular', 'superb',
            'excellent', 'perfect', 'beautiful', 'lovely', 'adorable', 'charming', 'delightful',
            'sweet', 'kind', 'caring', 'thoughtful', 'generous', 'supportive', 'inspiring',
            'talented', 'smart', 'clever', 'funny', 'hilarious', 'entertaining', 'fun',
            'cool', 'rad', 'neat', 'great', 'good', 'nice', 'pleasant', 'friendly',
            'special', 'unique', 'precious', 'valuable', 'important', 'loved', 'cherished'
        ];
    }

    /**
     * Check if a message contains nice words
     */
    containsNiceWords(message) {
        const messageText = message.toLowerCase();
        const foundWords = this.niceWords.filter(word => 
            messageText.includes(word.toLowerCase())
        );
        return foundWords;
    }

    /**
     * Extract mentioned user IDs from message
     */
    extractMentions(message) {
        const mentionPattern = /<@!?(\d+)>/g;
        const mentions = [];
        let match;
        
        while ((match = mentionPattern.exec(message)) !== null) {
            mentions.push(match[1]);
        }
        
        return mentions;
    }

    /**
     * Create the initial task embed
     */
    createTaskEmbed(marriage, currentUser) {
        const embed = new EmbedBuilder()
            .setTitle('💖 Mention Task - Spread the Love!')
            .setDescription(
                `**${marriage.partner1_name}** & **${marriage.partner2_name}**\n\n` +
                `📝 **Your Mission:**\n` +
                `• Mention your spouse and say something nice about them\n` +
                `• Mention 2 other people and say nice things about them too\n` +
                `• Each mention should be in a separate message\n` +
                `• Use kind, positive words in your messages\n\n` +
                `💡 **Examples of nice words:** amazing, wonderful, kind, talented, funny, caring, special`
            )
            .setColor(0xFF69B4)
            .addFields(
                { name: '📊 Progress', value: 'Click "Start Task" to begin tracking your mentions!', inline: false },
                { name: '⏰ Instructions', value: 'After clicking start, you have 10 minutes to send your 3 mention messages in this channel.', inline: false }
            )
            .setFooter({ text: 'Marriage Task 1 • Week 2' });

        const startButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`mention_start_${marriage.id}_${currentUser.id}`)
                    .setLabel('🚀 Start Task')
                    .setStyle(ButtonStyle.Success)
            );

        return { embed, components: [startButton] };
    }

    /**
     * Create progress tracking embed
     */
    createProgressEmbed(marriage, currentUser, mentions = []) {
        const spouseId = currentUser.id === marriage.partner1_id ? marriage.partner2_id : marriage.partner1_id;
        const spouseName = currentUser.id === marriage.partner1_id ? marriage.partner2_name : marriage.partner1_name;

        // Check what's been completed
        const spouseMention = mentions.find(m => m.userId === spouseId);
        const otherMentions = mentions.filter(m => m.userId !== spouseId && m.userId !== currentUser.id);

        let progressText = '';
        
        // Spouse mention
        if (spouseMention) {
            progressText += `✅ **${spouseName}** (Spouse)\n   "${spouseMention.message}"\n   Nice words: ${spouseMention.niceWords.join(', ')}\n\n`;
        } else {
            progressText += `⏳ **${spouseName}** (Spouse) - Not mentioned yet\n\n`;
        }

        // Other mentions
        for (let i = 0; i < 2; i++) {
            if (otherMentions[i]) {
                const mention = otherMentions[i];
                progressText += `✅ **${mention.userName}** (Person ${i + 1})\n   "${mention.message}"\n   Nice words: ${mention.niceWords.join(', ')}\n\n`;
            } else {
                progressText += `⏳ **Person ${i + 1}** - Not mentioned yet\n\n`;
            }
        }

        const totalComplete = (spouseMention ? 1 : 0) + otherMentions.length;
        const isComplete = totalComplete >= 3;

        const embed = new EmbedBuilder()
            .setTitle('💖 Mention Task - Progress Tracking')
            .setDescription(
                `**${currentUser.displayName}** is spreading the love!\n\n` +
                `**Progress: ${totalComplete}/3 mentions completed**\n\n` +
                progressText +
                (isComplete ? 
                    `🎉 **Task Complete!** You've successfully mentioned your spouse and 2 others with lovely messages!` :
                    `📝 Keep going! ${3 - totalComplete} more mention${3 - totalComplete > 1 ? 's' : ''} needed.`
                )
            )
            .setColor(isComplete ? 0x00FF00 : 0xFFAA00)
            .setFooter({ text: `Marriage Task 1 • ${isComplete ? 'Complete!' : 'In Progress...'}` });

        if (isComplete) {
            const completeButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`mention_complete_${marriage.id}_${currentUser.id}`)
                        .setLabel('🎉 Mark Task Complete')
                        .setStyle(ButtonStyle.Success)
                );

            return { embed, components: [completeButton] };
        }

        return { embed, components: [] };
    }

    /**
     * Process a mention message
     */
    async processMention(message, marriage, currentUser) {
        const messageText = message.content;
        const mentions = this.extractMentions(messageText);
        const niceWords = this.containsNiceWords(messageText);

        if (mentions.length === 0) {
            return { 
                success: false, 
                reason: 'No mentions found in message' 
            };
        }

        if (niceWords.length === 0) {
            return { 
                success: false, 
                reason: 'No nice words found in message. Try using words like: wonderful, amazing, kind, talented, funny, caring!' 
            };
        }

        // Get mentioned user info
        const mentionedUserId = mentions[0]; // Take first mention
        let mentionedUserName = 'Unknown User';
        
        try {
            const mentionedUser = await message.guild.members.fetch(mentionedUserId);
            mentionedUserName = mentionedUser.displayName;
        } catch (error) {
            // Use the mention as fallback
            mentionedUserName = `<@${mentionedUserId}>`;
        }

        return {
            success: true,
            mention: {
                userId: mentionedUserId,
                userName: mentionedUserName,
                message: messageText,
                niceWords: niceWords,
                timestamp: message.createdTimestamp
            }
        };
    }
}

module.exports = { MentionTaskGame };