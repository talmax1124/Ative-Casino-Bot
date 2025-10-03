/**
 * Vacation Planning Task Game
 * Collaborative checklist for planning a dream vacation
 */

const marriageTaskUtil = require('../MarriageTaskUtil');
const buttonUtility = require('../../UTILS/buttonUtility');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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
                .setDescription(`Plan your dream vacation with **${marriage.partner1.name}** & **${marriage.partner2.name}**`)
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
                value: `${marriage.partner1.name}: ${p1Done}\n${marriage.partner2.name}: ${p2Done}`,
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
                    sessionId, marriage.id, marriage.partner1.id, marriage.partner2.id
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
}

module.exports = VacationPlanTaskGame;
