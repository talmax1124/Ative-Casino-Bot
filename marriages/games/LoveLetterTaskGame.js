/**
 * Love Letter Exchange Task Game
 * Partners write private letters to each other that are revealed when both complete
 */

const marriageTaskUtil = require('../MarriageTaskUtil');
const buttonUtility = require('../../UTILS/buttonUtility');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
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
            instructions: '• Each partner writes a letter\n• Letters are delivered when both are done\n• Express your feelings!',
            buttonLabel: 'Write Letter',
            buttonEmoji: '💌',
            color: 0xFF69B4,
            requiresBothPartners: false,
            autoComplete: true,
            startHandler: this.handleStart.bind(this)
        });

        logger.info('LoveLetterTaskGame registered');
    }

    async handleStart(interaction, session, util) {
        try {
            const marriage = session.marriage;
            const userId = interaction.user.id;
            const sessionId = session.sessionId;

            // Check if user already wrote a letter
            const checkQuery = `
                SELECT * FROM marriage_love_letters 
                WHERE session_id = ? AND sender_id = ?
            `;
            
            const [existing] = await dbManager.databaseAdapter.pool.execute(checkQuery, [sessionId, userId]);
            
            if (existing.length > 0 && existing[0].is_sent) {
                const partnerName = userId === marriage.partner1_id ? 
                    marriage.partner2_name : marriage.partner1_name;
                    
                await util.safeReply(interaction, {
                    content: `💌 You've already written your letter! Waiting for ${partnerName} to write theirs.`,
                    ephemeral: true
                });
                return;
            }

            // Create embed with button to open modal
            const embed = new EmbedBuilder()
                .setTitle('💌 Write Your Love Letter')
                .setDescription(`Write a heartfelt letter to **${userId === marriage.partner1_id ? marriage.partner2_name : marriage.partner1_name}**`)
                .setColor(0xFF69B4)
                .addFields(
                    { 
                        name: '📝 Guidelines', 
                        value: '• Express your feelings\n• Share what you appreciate\n• Be genuine and heartfelt',
                        inline: false 
                    },
                    {
                        name: '🔒 Privacy',
                        value: 'Your letter will only be revealed when both partners have written theirs.',
                        inline: false
                    }
                );

            const button = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`letter_write_${sessionId}`)
                        .setLabel('Write Love Letter')
                        .setEmoji('✍️')
                        .setStyle(ButtonStyle.Primary)
                );

            await util.safeReply(interaction, {
                embeds: [embed],
                components: [button],
                ephemeral: true
            });
            
            const message = await interaction.fetchReply();

            // Setup collector for button
            buttonUtility.setupCollector(message, {
                filter: (i) => i.user.id === userId,
                time: 300000, // 5 minutes
                max: 1,
                onCollect: async (i) => {
                    await this.showLetterModal(i, session);
                }
            });

        } catch (error) {
            logger.error(`Error in LoveLetterTaskGame.handleStart: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error starting love letter exchange.',
                ephemeral: true
            });
        }
    }

    async showLetterModal(interaction, session) {
        const marriage = session.marriage;
        const userId = interaction.user.id;
        const recipientName = userId === marriage.partner1_id ? 
            marriage.partner2_name : marriage.partner1_name;

        // Create modal
        const modal = new ModalBuilder()
            .setCustomId(`letter_modal_${session.sessionId}`)
            .setTitle(`Love Letter to ${recipientName}`);

        const letterInput = new TextInputBuilder()
            .setCustomId('letter_content')
            .setLabel('Your Love Letter')
            .setPlaceholder('Dear ' + recipientName + '...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(50)
            .setMaxLength(1000);

        const actionRow = new ActionRowBuilder().addComponents(letterInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    }

    async handleModalSubmit(interaction, sessionId) {
        try {
            const letterContent = interaction.fields.getTextInputValue('letter_content');
            const userId = interaction.user.id;

            // Get session data
            const sessionQuery = `
                SELECT * FROM marriage_vacation_sessions WHERE session_id = ?
            `;
            let sessions = [];
            try {
                const res = await dbManager.databaseAdapter.executeQuery(sessionQuery, [sessionId]);
                sessions = Array.isArray(res) && Array.isArray(res[0]) ? res[0] : (Array.isArray(res) ? res : []);
            } catch (e) {
                // Fallback to pool if executeQuery not available
                const tmp = await dbManager.databaseAdapter.pool.execute(sessionQuery, [sessionId]);
                sessions = tmp[0] || [];
            }
            
            if (sessions.length === 0) {
                // Create session if doesn't exist
                const marriage = await this.getMarriageByUser(userId);
                if (marriage) {
                    const createSessionQuery = `
                        INSERT INTO marriage_vacation_sessions (session_id, marriage_id, partner1_id, partner2_id)
                        VALUES (?, ?, ?, ?)
                    `;
                    await dbManager.databaseAdapter.executeQuery(createSessionQuery, [
                        sessionId, marriage.id, marriage.partner1_id, marriage.partner2_id
                    ]);
                }
            }

            const sessionData = sessions[0] || await this.getSessionData(sessionId);
            const recipientId = userId === sessionData.partner1_id ? 
                sessionData.partner2_id : sessionData.partner1_id;

            // Save letter to database
            const insertQuery = `
                INSERT INTO marriage_love_letters 
                (session_id, marriage_id, sender_id, recipient_id, letter_content, is_sent, created_at)
                VALUES (?, ?, ?, ?, ?, TRUE, NOW())
            `;

            try {
                await dbManager.databaseAdapter.executeQuery(insertQuery, [
                    sessionId,
                    sessionData.marriage_id,
                    userId,
                    recipientId,
                    letterContent
                ]);
            } catch (_) {
                await dbManager.databaseAdapter.pool.execute(insertQuery, [
                    sessionId,
                    sessionData.marriage_id,
                    userId,
                    recipientId,
                    letterContent
                ]);
            }

            await interaction.reply({
                content: '💌 Your love letter has been written and sealed!',
                ephemeral: true
            });

            // Check if both partners have written letters
            await this.checkAndDeliverLetters(sessionId, sessionData.marriage_id, interaction);

        } catch (error) {
            logger.error(`Error handling letter modal: ${error.message}`);
            await interaction.reply({
                content: '❌ Error saving your letter. Please try again.',
                ephemeral: true
            });
        }
    }

    async checkAndDeliverLetters(sessionId, marriageId, interaction) {
        try {
            // Get all letters for this session
            const query = `
                SELECT * FROM marriage_love_letters 
                WHERE session_id = ? AND is_sent = TRUE
            `;
            
            let letters = [];
            try {
                const res = await dbManager.databaseAdapter.executeQuery(query, [sessionId]);
                letters = Array.isArray(res) && Array.isArray(res[0]) ? res[0] : (Array.isArray(res) ? res : []);
            } catch (e) {
                const tmp = await dbManager.databaseAdapter.pool.execute(query, [sessionId]);
                letters = tmp[0] || [];
            }

            if (letters.length >= 2) {
                // Both partners have written letters - deliver them!
                for (const letter of letters) {
                    await this.deliverLetter(letter, interaction);
                }

                // Mark task as completed
                await marriageTaskUtil.markTaskCompleted(marriageId, 19, 'both', {
                    lettersExchanged: 2,
                    completedAt: new Date().toISOString()
                });

                // Update letters as read
                const updateQuery = `
                    UPDATE marriage_love_letters 
                    SET is_read = TRUE, read_at = NOW() 
                    WHERE session_id = ?
                `;
                try {
                    await dbManager.databaseAdapter.executeQuery(updateQuery, [sessionId]);
                } catch (_) {
                    await dbManager.databaseAdapter.pool.execute(updateQuery, [sessionId]);
                }
            } else {
                // Notify the other partner
                const letter = letters[0];
                try {
                    const guild = interaction.guild;
                    const channel = interaction.channel;
                    const recipientUser = await guild.members.fetch(letter.recipient_id);
                    
                    if (recipientUser && channel) {
                        await channel.send({
                            content: `<@${letter.recipient_id}> Your partner has written their love letter! Use \`/marriage-task\` to write yours and complete Task 3.`,
                            allowedMentions: { users: [letter.recipient_id] }
                        });
                    }
                } catch (notifyError) {
                    logger.error(`Failed to notify partner: ${notifyError.message}`);
                }
            }
        } catch (error) {
            logger.error(`Error checking and delivering letters: ${error.message}`);
        }
    }

    async deliverLetter(letter, interaction) {
        try {
            const client = interaction.client;
            const recipient = await client.users.fetch(letter.recipient_id);
            const sender = await client.users.fetch(letter.sender_id);

            if (recipient) {
                const embed = new EmbedBuilder()
                    .setTitle('💌 You\'ve Received a Love Letter!')
                    .setDescription(`**From:** ${sender.username}\n\n${letter.letter_content}`)
                    .setColor(0xFF69B4)
                    .setFooter({ text: 'Sent with love through Marriage Tasks' })
                    .setTimestamp();

                try {
                    await recipient.send({ embeds: [embed] });
                } catch (dmError) {
                    logger.error(`Failed to DM letter to ${recipient.id}: ${dmError.message}`);
                    // Try to send in channel instead
                    if (interaction.channel) {
                        await interaction.channel.send({
                            content: `<@${letter.recipient_id}> Your love letter is ready! (Couldn't DM, so here it is):`,
                            embeds: [embed],
                            allowedMentions: { users: [letter.recipient_id] }
                        });
                    }
                }
            }
        } catch (error) {
            logger.error(`Error delivering letter: ${error.message}`);
        }
    }

    async getMarriageByUser(userId) {
        try {
            const query = `
                SELECT * FROM marriages 
                WHERE (partner1 = ? OR partner2 = ?) 
                AND status = 'married'
                LIMIT 1
            `;
            const [results] = await dbManager.databaseAdapter.pool.execute(query, [userId, userId]);
            return results[0] || null;
        } catch (error) {
            logger.error(`Error getting marriage: ${error.message}`);
            return null;
        }
    }

    async getSessionData(sessionId) {
        try {
            const query = `SELECT * FROM marriage_vacation_sessions WHERE session_id = ?`;
            const [results] = await dbManager.databaseAdapter.pool.execute(query, [sessionId]);
            return results[0] || null;
        } catch (error) {
            logger.error(`Error getting session data: ${error.message}`);
            return null;
        }
    }
}

module.exports = LoveLetterTaskGame;
