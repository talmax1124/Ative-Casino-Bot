/**
 * Simple Love Letter Exchange Task Game
 * Partners write letters directly to each other via DM
 */

const marriageTaskUtil = require('../MarriageTaskUtil');
const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const logger = require('../../UTILS/logger');
const dbManager = require('../../UTILS/database');

class LoveLetterTaskGame {
    constructor() {
        this.init();
    }

    init() {
        marriageTaskUtil.registerGame('week5_task3', 'loveletter', {
            title: '💌 Love Letter Exchange',
            description: 'Write heartfelt letters to each other privately.',
            instructions: '• Write a letter to your partner\n• It will be sent directly to them via DM\n• Express your feelings!',
            buttonLabel: 'Write Letter',
            buttonEmoji: '💌',
            color: 0xFF69B4,
            requiresBothPartners: false,
            autoComplete: false,
            startHandler: this.handleStart.bind(this)
        });

        logger.info('Simple LoveLetterTaskGame registered');
    }

    async handleStart(interaction, session, util) {
        try {
            const marriage = session.marriage;
            const userId = interaction.user.id;
            const partnerName = userId === marriage.partner1_id ? 
                marriage.partner2_name : marriage.partner1_name;

            // Create modal directly
            const modal = new ModalBuilder()
                .setCustomId(`simple_letter_${userId}_${Date.now()}`)
                .setTitle(`Love Letter to ${partnerName}`);

            const letterInput = new TextInputBuilder()
                .setCustomId('letter_content')
                .setLabel('Your Love Letter')
                .setPlaceholder(`Dear ${partnerName}...`)
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMinLength(20)
                .setMaxLength(1000);

            const actionRow = new ActionRowBuilder().addComponents(letterInput);
            modal.addComponents(actionRow);

            // Check if interaction can show modal
            if (!interaction.replied && !interaction.deferred) {
                await interaction.showModal(modal);
            } else {
                logger.warn('Cannot show modal - interaction already handled');
                return;
            }

        } catch (error) {
            logger.error(`Error in simple love letter start: ${error.message}`);
            // Only try to reply if we can
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await util.safeReply(interaction, {
                        content: '❌ Error starting love letter. Please try again.',
                        flags: MessageFlags.Ephemeral
                    });
                } catch (replyError) {
                    logger.error(`Could not send error message: ${replyError.message}`);
                }
            }
        }
    }

    async handleModalSubmit(interaction) {
        try {
            const letterContent = interaction.fields.getTextInputValue('letter_content');
            const userId = interaction.user.id;

            // Get marriage info
            const marriage = await this.getMarriageByUser(userId);
            if (!marriage) {
                await interaction.reply({
                    content: '❌ No marriage found. You must be married to send love letters.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Get partner info
            const isPartner1 = userId === marriage.partner1_id;
            const partnerId = isPartner1 ? marriage.partner2_id : marriage.partner1_id;
            const partnerName = isPartner1 ? marriage.partner2_name : marriage.partner1_name;
            const senderName = isPartner1 ? marriage.partner1_name : marriage.partner2_name;

            // Create love letter embed
            const letterEmbed = new EmbedBuilder()
                .setTitle('💌 You\'ve Received a Love Letter!')
                .setDescription(`**From:** ${senderName}\n\n${letterContent}`)
                .setColor(0xFF69B4)
                .setFooter({ text: 'Sent with love through Marriage Tasks' })
                .setTimestamp();

            // Validate interaction object
            if (!interaction || !interaction.client) {
                logger.error('Invalid interaction object in love letter submission');
                return;
            }

            // Try to send DM to partner
            try {
                const partner = await interaction.client.users.fetch(partnerId);
                await partner.send({ embeds: [letterEmbed] });

                // Confirm to sender
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: `💌 Your love letter has been sent to ${partnerName} via DM!`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                // Save to database for completion tracking
                await this.saveLetter(marriage.id, userId, partnerId, letterContent);

                // Check if task should be completed
                await this.checkTaskCompletion(marriage.id, interaction);

            } catch (dmError) {
                logger.error(`Failed to DM letter: ${dmError.message}`);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: `❌ Couldn't send DM to ${partnerName}. Make sure they allow DMs from server members.`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

        } catch (error) {
            logger.error(`Error in love letter modal submit: ${error.message}`);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Error sending your letter. Please try again.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }

    async saveLetter(marriageId, senderId, recipientId, content) {
        try {
            // Generate a simple session ID for the letter
            const sessionId = `letter_${marriageId}_${Date.now()}`;
            
            const query = `
                INSERT INTO marriage_love_letters 
                (session_id, marriage_id, sender_id, recipient_id, letter_content, is_sent, created_at)
                VALUES (?, ?, ?, ?, ?, TRUE, NOW())
                ON DUPLICATE KEY UPDATE 
                letter_content = VALUES(letter_content), 
                is_sent = TRUE, 
                created_at = NOW()
            `;

            await dbManager.databaseAdapter.pool.execute(query, [
                sessionId, marriageId, senderId, recipientId, content
            ]);
        } catch (error) {
            logger.error(`Error saving letter: ${error.message}`);
        }
    }

    async checkTaskCompletion(marriageId, interaction) {
        try {
            // Check if both partners have sent letters
            const query = `
                SELECT COUNT(DISTINCT sender_id) as sender_count 
                FROM marriage_love_letters 
                WHERE marriage_id = ? AND is_sent = TRUE
            `;
            
            const [results] = await dbManager.databaseAdapter.pool.execute(query, [marriageId]);
            
            if (results[0] && results[0].sender_count >= 2) {
                // Both partners have sent letters - mark task complete
                await marriageTaskUtil.markTaskCompleted(marriageId, 19, 'both', {
                    lettersExchanged: 2,
                    completedAt: new Date().toISOString()
                });
                
                logger.info(`Love letter task completed for marriage ${marriageId}`);
            }
        } catch (error) {
            logger.error(`Error checking task completion: ${error.message}`);
        }
    }

    async getMarriageByUser(userId) {
        try {
            const query = `
                SELECT * FROM marriages 
                WHERE (partner1_id = ? OR partner2_id = ?) 
                AND status = 'active'
                LIMIT 1
            `;
            const [results] = await dbManager.databaseAdapter.pool.execute(query, [userId, userId]);
            return results[0] || null;
        } catch (error) {
            logger.error(`Error getting marriage: ${error.message}`);
            return null;
        }
    }
}

module.exports = LoveLetterTaskGame;