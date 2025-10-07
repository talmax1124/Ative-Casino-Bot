/**
 * Vacation Planning Task Game
 * Collaborative checklist for planning a dream vacation
 */

const marriageTaskUtil = require('../MarriageTaskUtil');
const buttonUtility = require('../../UTILS/buttonUtility');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const logger = require('../../UTILS/logger');
const dbManager = require('../../UTILS/database');

class VacationPlanTaskGame {
    constructor() {
        this.init();
    }

    init() {
        marriageTaskUtil.registerGame('week5_task4', 'vacation', {
            title: '✈️ Vacation Planning',
            description: 'Plan your dream vacation together!',
            instructions: '• Add destinations and activities\n• Both partners contribute\n• Both must click "Finished" when ready',
            buttonLabel: 'Plan Vacation',
            buttonEmoji: '✈️',
            color: 0x00BFFF,
            requiresBothPartners: false,
            autoComplete: false,
            startHandler: this.handleStart.bind(this)
        });
        logger.info('VacationPlanTaskGame registered');
    }

    async handleStart(interaction, session, util) {
        try {
            const marriage = session.marriage;
            const sessionId = session.sessionId;
            const userId = interaction.user.id;

            // Initialize session if needed
            await this.initializeSession(sessionId, marriage);

            // Get current checklist
            const items = await this.getChecklistItems(sessionId);
            const sessionData = await this.getSessionStatus(sessionId);

            const embed = new EmbedBuilder()
                .setTitle('✈️ Vacation Planning Checklist')
                .setDescription(`Plan your dream vacation with **${marriage.partner1_name}** & **${marriage.partner2_name}**`)
                .setColor(0x00BFFF);

            // Add checklist items
            if (items.length > 0) {
                const itemList = items.map((item, index) => 
                    `${index + 1}. ${item.is_completed ? '✅' : '⬜'} ${item.item_text}`
                ).join('\n');
                embed.addFields({ 
                    name: '📋 Checklist', 
                    value: itemList || 'No items yet', 
                    inline: false 
                });
            } else {
                embed.addFields({ 
                    name: '📋 Checklist', 
                    value: 'No items yet - start adding!', 
                    inline: false 
                });
            }

            // Add status
            const p1Done = sessionData?.partner1_finished ? '✅' : '⏳';
            const p2Done = sessionData?.partner2_finished ? '✅' : '⏳';
            embed.addFields({ 
                name: '👥 Partner Status', 
                value: `${marriage.partner1_name}: ${p1Done}\n${marriage.partner2_name}: ${p2Done}`,
                inline: true 
            });

            // Create buttons
            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`vacation_add_${sessionId}`)
                        .setLabel('Add Item')
                        .setEmoji('➕')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`vacation_finish_${sessionId}_${userId}`)
                        .setLabel('Finished Planning')
                        .setEmoji('✅')
                        .setStyle(ButtonStyle.Success)
                );

            await util.safeReply(interaction, {
                embeds: [embed],
                components: [buttons]
            });

            // Attach a collector to handle add/finish buttons for this message
            let message;
            try {
                message = await interaction.fetchReply();
            } catch (fetchError) {
                logger.warn(`Could not fetch reply for vacation collector setup: ${fetchError.message}`);
                return; // Cannot setup collector without message reference
            }
            const partners = new Set([marriage.partner1_id, marriage.partner2_id]);
            
            buttonUtility.setupCollector(message, {
                filter: (i) => partners.has(i.user.id) && (i.customId.startsWith(`vacation_add_${sessionId}`) || i.customId.startsWith(`vacation_finish_${sessionId}_`)),
                time: 300000, // 5 minutes
                onCollect: async (i) => {
                    try {
                        if (i.customId.startsWith(`vacation_add_${sessionId}`)) {
                            // Show modal to add a checklist item
                            const modal = new ModalBuilder()
                                .setCustomId(`vacation_modal_${sessionId}`)
                                .setTitle('Add Vacation Item');

                            const input = new TextInputBuilder()
                                .setCustomId('vacation_item')
                                .setLabel('What to add?')
                                .setStyle(TextInputStyle.Paragraph)
                                .setRequired(true)
                                .setMaxLength(500);

                            const row = new ActionRowBuilder().addComponents(input);
                            modal.addComponents(row);
                            await i.showModal(modal);
                            return;
                        }

                        if (i.customId.startsWith(`vacation_finish_${sessionId}_`)) {
                            const finisherId = i.user.id;
                            const isP1 = finisherId === marriage.partner1_id;

                            const updateQuery = isP1
                                ? `UPDATE marriage_vacation_sessions SET partner1_finished = TRUE WHERE session_id = ?`
                                : `UPDATE marriage_vacation_sessions SET partner2_finished = TRUE WHERE session_id = ?`;
                            await dbManager.databaseAdapter.pool.execute(updateQuery, [sessionId]);

                            // Re-check session status
                            const status = await this.getSessionStatus(sessionId);

                            // If both finished, mark task completed
                            if (status?.partner1_finished && status?.partner2_finished && !status.completed) {
                                // Count items
                                const items = await this.getChecklistItems(sessionId);
                                // Mark completion in DB session
                                try {
                                    await dbManager.databaseAdapter.pool.execute(
                                        `UPDATE marriage_vacation_sessions SET completed = TRUE, completed_at = NOW() WHERE session_id = ?`,
                                        [sessionId]
                                    );
                                } catch (_) {}

                                await marriageTaskUtil.markTaskCompleted(marriage.id, 20, 'both', {
                                    itemCount: items.length,
                                    sessionId
                                });

                                const done = new EmbedBuilder()
                                    .setTitle('🎉 Vacation Planning Complete!')
                                    .setDescription(`Great teamwork, ${marriage.partner1_name} & ${marriage.partner2_name}!`)
                                    .setColor(0x00FF00)
                                    .addFields({ name: '📋 Items Planned', value: `${items.length}`, inline: true });
                                await util.safeReply(i, { embeds: [done], components: [] });
                                return;
                            }

                            // Otherwise, refresh the planning panel
                            await this.handleStart(i, session, util);
                            return;
                        }
                    } catch (err) {
                        const msg = err?.message || '';
                        if (msg.includes('already been sent or deferred') || 
                            msg.includes('already been acknowledged') ||
                            err.code === 40060) {
                            // Non-critical - interaction was already handled
                            logger.debug('Vacation collector: interaction already acknowledged');
                        } else {
                            logger.error(`Vacation collector error: ${err.message}`);
                            await util.safeReply(i, { content: '❌ Error processing your action.', ephemeral: true });
                        }
                    }
                }
            });

        } catch (error) {
            logger.error(`Error in VacationPlanTaskGame: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error starting vacation planning.',
                ephemeral: true
            });
        }
    }

    async initializeSession(sessionId, marriage) {
        try {
            const checkQuery = `SELECT * FROM marriage_vacation_sessions WHERE session_id = ?`;
            const [existing] = await dbManager.databaseAdapter.pool.execute(checkQuery, [sessionId]);
            
            if (existing.length === 0) {
                const insertQuery = `
                    INSERT INTO marriage_vacation_sessions 
                    (session_id, marriage_id, partner1_id, partner2_id, created_at)
                    VALUES (?, ?, ?, ?, NOW())
                `;
                await dbManager.databaseAdapter.pool.execute(insertQuery, [
                    sessionId, marriage.id, marriage.partner1_id, marriage.partner2_id
                ]);
            }
        } catch (error) {
            logger.error(`Error initializing vacation session: ${error.message}`);
        }
    }

    async getChecklistItems(sessionId) {
        try {
            const query = `SELECT * FROM marriage_vacation_plans WHERE session_id = ? ORDER BY created_at`;
            const [items] = await dbManager.databaseAdapter.pool.execute(query, [sessionId]);
            return items;
        } catch (error) {
            logger.error(`Error getting checklist: ${error.message}`);
            return [];
        }
    }

    async getSessionStatus(sessionId) {
        try {
            const query = `SELECT * FROM marriage_vacation_sessions WHERE session_id = ?`;
            const [sessions] = await dbManager.databaseAdapter.pool.execute(query, [sessionId]);
            return sessions[0] || null;
        } catch (error) {
            logger.error(`Error getting session status: ${error.message}`);
            return null;
        }
    }

    /**
     * Handle add-item modal submit
     */
    async handleModalSubmit(interaction, sessionId) {
        try {
            const marriageTaskUtil = require('../MarriageTaskUtil');
            const session = marriageTaskUtil.getGameSession(sessionId);
            const itemText = interaction.fields.getTextInputValue('vacation_item');

            // Find marriage id from active session or DB
            let marriageId = session?.marriage?.id;
            if (!marriageId) {
                const status = await this.getSessionStatus(sessionId);
                marriageId = status?.marriage_id;
            }

            if (!marriageId) {
                return await interaction.reply({ content: '❌ Session not found. Please restart the task.', ephemeral: true });
            }

            // Insert item
            const insertQuery = `
                INSERT INTO marriage_vacation_plans (session_id, marriage_id, item_text, added_by)
                VALUES (?, ?, ?, ?)
            `;
            await dbManager.databaseAdapter.pool.execute(insertQuery, [
                sessionId,
                marriageId,
                itemText,
                interaction.user.id
            ]);

            await interaction.reply({ content: `✅ Added: "${itemText}"`, ephemeral: true });

            // Refresh panel if we have an active session to update
            if (session) {
                // Build a faux util for safeReply
                const util = marriageTaskUtil;
                await this.handleStart(interaction, session, util);
            }
        } catch (error) {
            logger.error(`Error handling vacation modal submit: ${error.message}`);
            try {
                await interaction.reply({ content: '❌ Failed to add item.', ephemeral: true });
            } catch (_) {}
        }
    }
}

module.exports = VacationPlanTaskGame;
