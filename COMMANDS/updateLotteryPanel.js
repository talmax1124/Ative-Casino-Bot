/**
 * Update Lottery Panel command for the casino bot
 * Updates the lottery panel in the lottery channel (Developer/Admin only)
 */

const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { updateLotteryPanel, LOTTERY_CHANNEL_ID, DESIGNATED_SERVER_ID } = require('../UTILS/lottery');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const logger = require('../UTILS/logger');
const Canvas = require('canvas');

// Developer user ID from environment or hardcoded
const DEVELOPER_USER_ID = process.env.DEVELOPER_USER_ID || '466050111680544798';

// Helper function to check developer/admin permissions
async function hasUpdatePermission(userId, guildId) {
    // Developer always has permission
    if (userId === DEVELOPER_USER_ID) {
        return true;
    }
    
    // TODO: Add admin role checking here if needed
    // For now, only developer can use this command
    return false;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('updatelotterypanel')
        .setDescription('Update the lottery information panel in the lottery channel (Admin only)'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        try {
            // Check permissions
            const hasPermission = await hasUpdatePermission(userId, guildId);
            if (!hasPermission) {
                await interaction.reply({
                    content: '❌ You do not have permission to use this command. This command is restricted to developers and administrators.',
                    ephemeral: true
                });
                return;
            }

            // Only work in the designated server
            if (guildId !== DESIGNATED_SERVER_ID) {
                await interaction.reply({
                    content: '❌ This command can only be used in the designated lottery server.',
                    ephemeral: true
                });
                return;
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                // Get current lottery info
                const lotteryInfo = await dbManager.getLotteryInfo(guildId);
                
                // Create the lottery panel
                await this.createLotteryPanel(interaction, lotteryInfo);

                await interaction.editReply({
                    content: '✅ Lottery panel has been updated successfully in the lottery channel!'
                });

                // Log the action
                await sendLogMessage(
                    interaction.client,
                    'admin',
                    `Lottery panel updated by ${interaction.user.displayName} in channel <#${LOTTERY_CHANNEL_ID}>`,
                    userId,
                    guildId
                );

            } catch (error) {
                logger.error(`Error updating lottery panel: ${error.message}`);
                
                await interaction.editReply({
                    content: '❌ An error occurred while updating the lottery panel. Please check the logs for details.'
                });
            }

        } catch (error) {
            logger.error(`Error in updateLotteryPanel command: ${error.message}`);
            
            if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ An error occurred while processing the command.',
                });
            } else {
                await interaction.reply({
                    content: '❌ An error occurred while processing the command.',
                    ephemeral: true
                });
            }
        }
    },

    async createLotteryPanel(interaction, lotteryInfo) {
        const channel = interaction.client.channels.cache.get(LOTTERY_CHANNEL_ID);
        if (!channel) {
            throw new Error(`Could not find lottery channel ${LOTTERY_CHANNEL_ID}`);
        }

        const nextDrawingTime = this.getNextSundayTimestamp();

        // Create the lottery panel image using Canvas
        const panelImage = await this.createLotteryPanelImage(lotteryInfo);

        const embed = new EmbedBuilder()
            .setTitle('🎟️ Weekly Lottery System')
            .setColor(0xFFD700)
            .setDescription('**Try your luck in our weekly lottery drawings!**\n\nEvery Sunday at 10 AM EST, we draw 3 lucky winners! 1st and 2nd place get 45% each, 3rd place gets 10%!')
            .addFields(
                {
                    name: '💰 Current Prize Pool',
                    value: `**${fmt(lotteryInfo.total_prize || 400000)}**\n*Updates with each money transfer (5% tax goes to lottery)*`,
                    inline: true
                },
                {
                    name: '🎫 Tickets Sold This Week',
                    value: `**${lotteryInfo.total_tickets || 0}** tickets\n*Max 7 tickets per person*`,
                    inline: true
                },
                {
                    name: '⏰ Next Drawing',
                    value: `<t:${nextDrawingTime}:F>\n<t:${nextDrawingTime}:R>\n*Every Sunday at 10 AM EST*`,
                    inline: true
                },
                {
                    name: '🎫 How to Buy Tickets',
                    value: 'Use `/purchaselottery [count]` to purchase tickets\n• **$12,000** per ticket\n• Maximum **7 tickets** per person per week\n• Tickets reset after each drawing',
                    inline: false
                },
                {
                    name: '🏆 Prize Distribution',
                    value: '🥇 **1st Winner:** 45% of total prize pool\n🥈 **2nd Winner:** 45% of total prize pool\n🥉 **3rd Winner:** 10% of total prize pool\n*Three winners with guaranteed prizes!*',
                    inline: false
                },
                {
                    name: '💡 How Prize Pool Grows',
                    value: '• **Base Prize:** $400,000 every week\n• **Money Transfer Tax:** 5% of all `/sendmoney` transfers\n• **Ticket Sales:** All ticket money goes to next week\'s pool\n• **No Winner:** Prize rolls over to next week',
                    inline: false
                },
                {
                    name: '📋 Lottery Commands',
                    value: '`/purchaselottery [count]` - Buy 1-7 lottery tickets\n`/lottery` - Check your lottery status and tickets\n`/balance` - View your wallet and bank balance',
                    inline: false
                }
            )
            .setImage('attachment://lottery-panel.png')
            .setFooter({ text: '🍀 Good luck! • Last Updated' })
            .setTimestamp();

        const buyButton = new ButtonBuilder()
            .setCustomId('lottery_buy_panel')
            .setLabel('Buy Tickets')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎫');

        const statusButton = new ButtonBuilder()
            .setCustomId('lottery_status_panel')
            .setLabel('Check My Status')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📊');

        const helpButton = new ButtonBuilder()
            .setCustomId('lottery_help_panel')
            .setLabel('How It Works')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❓');

        const row = new ActionRowBuilder().addComponents(buyButton, statusButton, helpButton);

        const message = await channel.send({
            embeds: [embed],
            files: [{ attachment: panelImage, name: 'lottery-panel.png' }],
            components: [row]
        });

        // Set the panel message in lottery utils for future updates
        const lotteryUtils = require('../UTILS/lottery');
        lotteryUtils.setLotteryPanelMessage(message);

        return message;
    },

    // Helper method to get next Sunday at 10 AM EST timestamp
    getNextSundayTimestamp() {
        const now = new Date();
        const estOffset = -5 * 60; // EST is UTC-5 in minutes
        const estTime = new Date(now.getTime() + (estOffset * 60 * 1000));
        
        // Find days until next Sunday (0 = Sunday, 6 = Saturday)
        const daysUntilSunday = (7 - estTime.getDay()) % 7;
        
        let nextSunday;
        if (daysUntilSunday === 0) {
            // Today is Sunday
            nextSunday = new Date(estTime);
            nextSunday.setHours(10, 0, 0, 0);
            
            // If it's already past 10 AM, go to next Sunday
            if (estTime.getHours() >= 10) {
                nextSunday.setDate(nextSunday.getDate() + 7);
            }
        } else {
            // Not Sunday, calculate next Sunday
            nextSunday = new Date(estTime);
            nextSunday.setDate(nextSunday.getDate() + daysUntilSunday);
            nextSunday.setHours(10, 0, 0, 0);
        }
        
        // Convert back to UTC for timestamp
        const utcTimestamp = Math.floor((nextSunday.getTime() - (estOffset * 60 * 1000)) / 1000);
        return utcTimestamp;
    },

    // Create lottery panel image using Canvas
    async createLotteryPanelImage(lotteryInfo) {
        const canvas = Canvas.createCanvas(1200, 800);
        const ctx = canvas.getContext('2d');

        // Background gradient (casino theme)
        const gradient = ctx.createLinearGradient(0, 0, 0, 800);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1200, 800);

        // Border
        ctx.strokeStyle = '#00ff41';
        ctx.lineWidth = 6;
        ctx.strokeRect(10, 10, 1180, 780);

        // Title
        ctx.font = 'bold 52px Arial';
        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'center';
        ctx.fillText('🎟️ WEEKLY LOTTERY SYSTEM', 600, 80);

        // Prize Pool
        ctx.font = 'bold 38px Arial';
        ctx.fillStyle = '#00ff41';
        ctx.fillText(`CURRENT PRIZE POOL: ${fmt(lotteryInfo.total_prize || 400000)}`, 600, 150);

        // Tickets Sold
        ctx.font = '28px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`Tickets Sold This Week: ${lotteryInfo.total_tickets || 0}`, 600, 200);

        // Prize Distribution
        ctx.font = '24px Arial';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('🏆 PRIZE DISTRIBUTION:', 50, 280);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('🥇 1st Place: 45% of Prize Pool', 80, 320);
        ctx.fillText('🥈 2nd Place: 45% of Prize Pool', 80, 360);
        ctx.fillText('🥉 3rd Place: 10% of Prize Pool', 80, 400);

        // How to participate
        ctx.fillStyle = '#FFD700';
        ctx.fillText('🎫 HOW TO PARTICIPATE:', 50, 480);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('• Use /purchaselottery [count] to buy tickets', 80, 520);
        ctx.fillText('• $12,000 per ticket • Maximum 7 tickets per person', 80, 560);
        ctx.fillText('• Drawings every Sunday at 10 AM EST', 80, 600);
        ctx.fillText('• Winnings go directly to your BANK account', 80, 640);

        // Next drawing time
        const nextDrawing = this.getNextSundayTimestamp();
        const drawingDate = new Date(nextDrawing * 1000);
        ctx.font = '20px Arial';
        ctx.fillStyle = '#00ff41';
        ctx.textAlign = 'right';
        ctx.fillText(`Next Drawing: ${drawingDate.toLocaleDateString()} at 10:00 AM EST`, 1150, 720);
        
        // Commands
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFD700';
        ctx.font = '22px Arial';
        ctx.fillText('Use /lottery to check your status • Use /purchaselottery to buy tickets', 600, 750);

        return canvas.toBuffer();
    }
};