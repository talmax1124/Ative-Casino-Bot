/**
 * Daily Check-In Task Game
 * Both partners must check in morning and night for 4+ days
 */

const marriageTaskUtil = require('../MarriageTaskUtil');
const buttonUtility = require('../../UTILS/buttonUtility');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const logger = require('../../UTILS/logger');
const dbManager = require('../../UTILS/database');

class DailyCheckInTaskGame {
    constructor() {
        this.init();
    }

    init() {
        marriageTaskUtil.registerGame('week5_task5', 'checkin', {
            title: '☀️ Daily Check-In',
            description: 'Check in with each other daily for 4 days.',
            instructions: '• Morning and night check-ins\n• Both partners participate\n• Complete 4+ days to finish',
            buttonLabel: 'Check In',
            buttonEmoji: '☀️',
            color: 0xFFD700,
            requiresBothPartners: false,
            autoComplete: false,
            startHandler: this.handleStart.bind(this)
        });
        logger.info('DailyCheckInTaskGame registered');
    }

    async handleStart(interaction, session, util) {
        try {
            const marriage = session.marriage;
            const userId = interaction.user.id;
            const today = new Date().toISOString().split('T')[0];
            const hour = new Date().getHours();
            const checkType = hour < 12 ? 'morning' : 'night';

            // Check if already checked in
            const checkQuery = `
                SELECT * FROM marriage_daily_checkins 
                WHERE marriage_id = ? AND user_id = ? 
                AND checkin_date = ? AND checkin_type = ?
            `;
            
            const [existing] = await dbManager.databaseAdapter.pool.execute(checkQuery, [
                marriage.id, userId, today, checkType
            ]);

            if (existing.length > 0) {
                await util.safeReply(interaction, {
                    content: `☑️ You've already done your ${checkType} check-in today!`,
                    ephemeral: true
                });
                return;
            }

            // Get check-in progress
            const progress = await this.getCheckInProgress(marriage.id);

            const embed = new EmbedBuilder()
                .setTitle(`${checkType === 'morning' ? '☀️ Good Morning' : '🌙 Good Night'} Check-In`)
                .setDescription(`Daily check-in for **${marriage.partner1_name}** & **${marriage.partner2_name}**`)
                .setColor(checkType === 'morning' ? 0xFFD700 : 0x191970);

            // Show progress
            const daysCompleted = Math.floor(progress.totalCheckins / 4); // Both partners, 2x per day
            embed.addFields(
                { name: '📊 Progress', value: `Days completed: ${daysCompleted}/4`, inline: true },
                { name: '✅ Total Check-ins', value: `${progress.totalCheckins}`, inline: true }
            );

            if (progress.recentCheckins.length > 0) {
                const recent = progress.recentCheckins.slice(0, 5).map(c => 
                    `${c.checkin_type === 'morning' ? '☀️' : '🌙'} ${c.user_id === marriage.partner1_id ? marriage.partner1_name : marriage.partner2_name} - ${new Date(c.checkin_date).toLocaleDateString()}`
                ).join('\n');
                embed.addFields({ name: '📅 Recent Check-ins', value: recent, inline: false });
            }

            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`checkin_confirm_${marriage.id}_${userId}_${checkType}`)
                        .setLabel(`${checkType === 'morning' ? 'Good Morning!' : 'Good Night!'}`)
                        .setEmoji(checkType === 'morning' ? '☀️' : '🌙')
                        .setStyle(ButtonStyle.Primary)
                );

            await util.safeReply(interaction, {
                embeds: [embed],
                components: [buttons]
            });
            
            let message;
            try {
                message = await interaction.fetchReply();
            } catch (fetchError) {
                logger.warn(`Could not fetch reply for check-in collector setup: ${fetchError.message}`);
                return; // Cannot setup collector without message reference
            }

            // Setup collector
            buttonUtility.setupCollector(message, {
                filter: (i) => i.user.id === userId,
                time: 60000,
                max: 1,
                onCollect: async (i) => {
                    await this.recordCheckIn(i, marriage, userId, checkType, util);
                }
            });

        } catch (error) {
            logger.error(`Error in DailyCheckInTaskGame: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error with daily check-in.',
                ephemeral: true
            });
        }
    }

    async recordCheckIn(interaction, marriage, userId, checkType, util) {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            // Record check-in
            const insertQuery = `
                INSERT INTO marriage_daily_checkins 
                (marriage_id, user_id, checkin_type, checkin_date, created_at)
                VALUES (?, ?, ?, ?, NOW())
            `;
            
            await dbManager.databaseAdapter.pool.execute(insertQuery, [
                marriage.id, userId, checkType, today
            ]);

            // Get updated progress
            const progress = await this.getCheckInProgress(marriage.id);
            const daysCompleted = Math.floor(progress.totalCheckins / 4);

            const embed = new EmbedBuilder()
                .setTitle('✅ Check-in Recorded!')
                .setDescription(`Your ${checkType} check-in has been recorded.`)
                .setColor(0x00FF00)
                .addFields(
                    { name: '📊 Progress', value: `Days completed: ${daysCompleted}/4`, inline: true }
                );

            // Check if task is complete (4+ days)
            if (daysCompleted >= 4 && !progress.taskCompleted) {
                embed.addFields({ 
                    name: '🎉 Task Complete!', 
                    value: 'You\'ve completed 4 days of check-ins!', 
                    inline: false 
                });
                
                await marriageTaskUtil.markTaskCompleted(marriage.id, 21, 'both', {
                    daysCompleted: daysCompleted,
                    totalCheckins: progress.totalCheckins
                });
            }

            await util.safeReply(interaction, {
                embeds: [embed],
                components: []
            });

        } catch (error) {
            logger.error(`Error recording check-in: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error recording check-in.',
                ephemeral: true
            });
        }
    }

    async getCheckInProgress(marriageId) {
        try {
            const query = `
                SELECT * FROM marriage_daily_checkins 
                WHERE marriage_id = ? 
                ORDER BY created_at DESC
            `;
            
            const [checkins] = await dbManager.databaseAdapter.pool.execute(query, [marriageId]);
            
            return {
                totalCheckins: checkins.length,
                recentCheckins: checkins.slice(0, 10),
                taskCompleted: checkins.length >= 16 // 4 days * 2 people * 2 times per day
            };
        } catch (error) {
            logger.error(`Error getting check-in progress: ${error.message}`);
            return { totalCheckins: 0, recentCheckins: [], taskCompleted: false };
        }
    }
}

module.exports = DailyCheckInTaskGame;