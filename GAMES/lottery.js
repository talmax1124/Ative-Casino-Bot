/**
 * Lottery Game Logic for ATIVE Casino Bot
 * Handles lottery drawings, scheduling, and winner announcements
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const moment = require('moment-timezone');
const dbManager = require('../UTILS/database');
const { fmt, sendLogMessage } = require('../UTILS/common');
const { secureRandomInt } = require('../UTILS/rng');
const logger = require('../UTILS/logger');
const Canvas = require('canvas');

// Lottery configuration
const LOTTERY_CHANNEL_ID = '1406136478714826824';
const DESIGNATED_SERVER_ID = '1403244656845787167';

class LotteryGame {
    constructor(bot) {
        this.bot = bot;
        this.scheduledDrawing = null;
        this.isDrawingInProgress = false;
        this.panelMessageId = null;
    }

    /**
     * Initialize lottery scheduling and hourly panel updates
     */
    async initialize() {
        try {
            // Schedule the next lottery drawing
            await this.scheduleNextDrawing();
            
            // Schedule hourly panel updates
            await this.scheduleHourlyPanelUpdates();
            
            logger.info('Lottery game initialized with scheduling and hourly panel updates');
        } catch (error) {
            logger.error(`Error initializing lottery game: ${error.message}`);
        }
    }

    /**
     * Schedule the next lottery drawing for Sunday 10 AM EST
     */
    async scheduleNextDrawing() {
        try {
            // Clear existing timeout if any
            if (this.scheduledDrawing) {
                clearTimeout(this.scheduledDrawing);
            }

            const nextDrawingTime = this.getNextSundayTimestamp();
            const now = Math.floor(Date.now() / 1000);
            const timeUntilDrawing = (nextDrawingTime - now) * 1000; // Convert to milliseconds

            logger.info(`Next lottery drawing scheduled for ${new Date(nextDrawingTime * 1000).toLocaleString()} (in ${Math.round(timeUntilDrawing / (1000 * 60 * 60))} hours)`);

            // Schedule the drawing
            this.scheduledDrawing = setTimeout(async () => {
                await this.conductWeeklyDrawing();
                // Schedule the next drawing after this one completes
                await this.scheduleNextDrawing();
            }, timeUntilDrawing);

        } catch (error) {
            logger.error(`Error scheduling lottery drawing: ${error.message}`);
        }
    }

    /**
     * Schedule hourly lottery panel updates
     */
    async scheduleHourlyPanelUpdates() {
        try {
            // Update panel every hour
            const hourlyInterval = 60 * 60 * 1000; // 1 hour in milliseconds
            setInterval(async () => {
                try {
                    await this.upsertLotteryPanel();
                    logger.info('Hourly lottery panel update completed');
                } catch (error) {
                    logger.error(`Error in hourly lottery panel update: ${error.message}`);
                }
            }, hourlyInterval);
            
            // Also run an immediate initial update
            setTimeout(async () => {
                try {
                    await this.upsertLotteryPanel();
                    logger.info('Initial lottery panel update completed');
                } catch (error) {
                    logger.error(`Error in initial lottery panel update: ${error.message}`);
                }
            }, 10 * 1000); // after 10 seconds to allow bot caches
            
            logger.info('Hourly lottery panel updates scheduled');
        } catch (error) {
            logger.error(`Error scheduling hourly panel updates: ${error.message}`);
        }
    }

    /**
     * Calculate next Sunday 10 AM EST timestamp
     */
    getNextSundayTimestamp() {
        const nowNY = moment.tz('America/New_York');
        let next = nowNY.clone().day(0).hour(10).minute(0).second(0).millisecond(0);
        if (nowNY.day() > 0 || (nowNY.day() === 0 && nowNY.hour() >= 10)) {
            next = nowNY.clone().day(7).hour(10).minute(0).second(0).millisecond(0);
        }
        return next.tz('UTC').unix();
    }

    /**
     * Create or update a public lottery panel with current info
     */
    async upsertLotteryPanel() {
        try {
            const channel = this.bot.channels.cache.get(LOTTERY_CHANNEL_ID);
            if (!channel) {
                logger.error(`Lottery channel not found: ${LOTTERY_CHANNEL_ID}`);
                return;
            }

            const info = await dbManager.getLotteryInfo(DESIGNATED_SERVER_ID);
            const nextTs = this.getNextSundayTimestamp();

            const embed = new EmbedBuilder()
                .setTitle('🎟️ Weekly Lottery System')
                .setColor(0xFFD700)
                .setDescription('Every Sunday at 10 AM Eastern (America/New_York), we draw 3 winners!')
                .addFields(
                    { name: '💰 Current Prize Pool', value: `**${fmt(info.total_prize || 400000)}**`, inline: true },
                    { name: '🎫 Tickets Sold', value: `**${info.total_tickets || 0}**`, inline: true },
                    { name: '⏰ Next Drawing', value: `<t:${nextTs}:F>\n<t:${nextTs}:R>`, inline: true },
                    { name: 'How to Buy', value: 'Use `/purchaselottery [count]` • $12,000 per ticket • Max 7/week', inline: false },
                    { name: 'Prize Distribution', value: '🥇 45% • 🥈 45% • 🥉 10%', inline: false }
                )
                .setFooter({ text: '🍀 Good luck! • Last updated' })
                .setTimestamp();

            const help = new ButtonBuilder().setCustomId('lottery_help_panel').setLabel('How It Works').setEmoji('❓').setStyle(ButtonStyle.Secondary);
            const row = new ActionRowBuilder().addComponents(help);

            let message = null;
            if (this.panelMessageId) {
                try {
                    message = await channel.messages.fetch(this.panelMessageId);
                } catch {
                    message = null;
                }
            }
            if (!message) {
                // Try to find an existing recent panel by title
                const msgs = await channel.messages.fetch({ limit: 30 });
                message = msgs.find(m => m.author.id === this.bot.user.id && m.embeds?.[0]?.title?.includes('Weekly Lottery System')) || null;
            }

            if (message) {
                await message.edit({ embeds: [embed], components: [row] });
                this.panelMessageId = message.id;
            } else {
                const sent = await channel.send({ embeds: [embed], components: [row] });
                this.panelMessageId = sent.id;
            }
        } catch (error) {
            logger.error(`upsertLotteryPanel error: ${error.message}`);
        }
    }

    /**
     * Conduct the weekly lottery drawing
     */
    async conductWeeklyDrawing() {
        if (this.isDrawingInProgress) {
            logger.warn('Lottery drawing already in progress, skipping');
            return;
        }

        this.isDrawingInProgress = true;
        logger.info('Starting weekly lottery drawing');

        try {
            const guildId = DESIGNATED_SERVER_ID;
            const results = await dbManager.conductLotteryDrawing(guildId);

            if (results.success) {
                // Save to history
                await dbManager.saveLotteryHistory(guildId, results);
                
                // Announce winners
                await this.announceWinners(results);
                
                logger.info('Weekly lottery drawing completed successfully');
            } else {
                // Handle cases where drawing couldn't be conducted
                await this.handleDrawingFailure(results);
            }

        } catch (error) {
            logger.error(`Error during weekly lottery drawing: ${error.message}`);
            await this.handleDrawingError(error);
        } finally {
            this.isDrawingInProgress = false;
        }
    }

    /**
     * Announce lottery winners in the lottery channel
     */
    async announceWinners(results) {
        try {
            const channel = this.bot.channels.cache.get(LOTTERY_CHANNEL_ID);
            if (!channel) {
                logger.error(`Could not find lottery channel ${LOTTERY_CHANNEL_ID}`);
                return;
            }

            // Create winner announcement image
            const winnerImage = await this.createWinnerAnnouncementImage(results);

            const embed = new EmbedBuilder()
                .setTitle('🎊 LOTTERY DRAWING RESULTS! 🎊')
                .setColor(0xFFD700)
                .setDescription(`**Weekly lottery drawing has been completed!**\n\nTotal Prize Pool: **${fmt(results.total_prize)}**\nParticipants: **${results.totalParticipants}** players\nTickets Sold: **${results.total_tickets}**`)
                .addFields(
                    {
                        name: '🥇 1st Place Winner',
                        value: `<@${results.winners[0].userId}>\n**Prize: ${fmt(results.winners[0].prize)}**`,
                        inline: true
                    },
                    {
                        name: '🥈 2nd Place Winner',
                        value: `<@${results.winners[1].userId}>\n**Prize: ${fmt(results.winners[1].prize)}**`,
                        inline: true
                    },
                    {
                        name: '🥉 3rd Place Winner',
                        value: `<@${results.winners[2].userId}>\n**Prize: ${fmt(results.winners[2].prize)}**`,
                        inline: true
                    }
                )
                .addField(
                    '💰 Prize Distribution',
                    `All prizes have been automatically deposited into winners' **BANK** accounts!`,
                    false
                )
                .setImage('attachment://winners.png')
                .setFooter({ text: '🎟️ New lottery week starts now! Buy tickets for next Sunday\'s drawing!' })
                .setTimestamp();

            // Create buttons for next week
            const buyButton = new ButtonBuilder()
                .setCustomId('lottery_buy_new_week')
                .setLabel('Buy Tickets for Next Week')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎫');

            const statusButton = new ButtonBuilder()
                .setCustomId('lottery_status_new_week')
                .setLabel('Check New Week Status')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📊');

            const row = new ActionRowBuilder().addComponents(buyButton, statusButton);

            // Send winner announcement
            await channel.send({
                content: '🎊 **LOTTERY WINNERS ANNOUNCED!** 🎊\n@everyone',
                embeds: [embed],
                files: [{ attachment: winnerImage, name: 'winners.png' }],
                components: [row]
            });

            // Log to admin channel
            await sendLogMessage(
                this.bot,
                'game',
                `Lottery drawing completed! Winners: 1st: <@${results.winners[0].userId}> (${fmt(results.winners[0].prize)}), 2nd: <@${results.winners[1].userId}> (${fmt(results.winners[1].prize)}), 3rd: <@${results.winners[2].userId}> (${fmt(results.winners[2].prize)})`,
                null,
                DESIGNATED_SERVER_ID
            );

        } catch (error) {
            logger.error(`Error announcing lottery winners: ${error.message}`);
        }
    }

    /**
     * Handle drawing failure (not enough participants, etc.)
     */
    async handleDrawingFailure(results) {
        try {
            const channel = this.bot.channels.cache.get(LOTTERY_CHANNEL_ID);
            if (!channel) {
                logger.error(`Could not find lottery channel ${LOTTERY_CHANNEL_ID}`);
                return;
            }

            let description;
            if (results.reason === 'insufficient_participants') {
                description = `**Not enough participants for this week's drawing!**\n\nWe need at least 3 participants, but only had **${results.participants}**.\n\n💰 **Good news:** The current prize pool will roll over to next week, making it even bigger!`;
            } else {
                description = `**This week's lottery drawing could not be completed.**\n\nReason: ${results.reason}\n\n💰 The prize pool will roll over to next week.`;
            }

            const embed = new EmbedBuilder()
                .setTitle('🎟️ Lottery Drawing Update')
                .setColor(0xFFA500)
                .setDescription(description)
                .addField(
                    '📅 Next Week',
                    'The lottery continues next Sunday at 10 AM EST!\nBuy your tickets now for a chance to win the rolled-over prize pool!',
                    false
                )
                .setFooter({ text: '🎟️ Use /lottery buy to purchase tickets for next week!' })
                .setTimestamp();

            await channel.send({ embeds: [embed] });

            // Log the failure
            await sendLogMessage(
                this.bot,
                'game',
                `Lottery drawing failed: ${results.reason}. Prize pool rolled over.`,
                null,
                DESIGNATED_SERVER_ID
            );

        } catch (error) {
            logger.error(`Error handling lottery drawing failure: ${error.message}`);
        }
    }

    /**
     * Handle drawing error
     */
    async handleDrawingError(error) {
        try {
            // Log error to admin channel
            await sendLogMessage(
                this.bot,
                'error',
                `Lottery drawing error: ${error.message}`,
                null,
                DESIGNATED_SERVER_ID
            );

        } catch (logError) {
            logger.error(`Error logging lottery drawing error: ${logError.message}`);
        }
    }

    /**
     * Create winner announcement image using Canvas
     */
    async createWinnerAnnouncementImage(results) {
        const canvas = Canvas.createCanvas(1200, 800);
        const ctx = canvas.getContext('2d');

        // Background gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, 800);
        gradient.addColorStop(0, '#FFD700');
        gradient.addColorStop(1, '#FFA500');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1200, 800);

        // Border
        ctx.strokeStyle = '#B8860B';
        ctx.lineWidth = 8;
        ctx.strokeRect(10, 10, 1180, 780);

        // Title
        ctx.font = 'bold 60px Arial';
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.fillText('🎊 LOTTERY WINNERS! 🎊', 600, 100);

        // Prize pool
        ctx.font = 'bold 32px Arial';
        ctx.fillStyle = '#8B0000';
        ctx.fillText(`Total Prize Pool: ${fmt(results.total_prize)}`, 600, 160);

        // Winners
        const winners = [
            { place: '🥇 1st Place', y: 250 },
            { place: '🥈 2nd Place', y: 350 },
            { place: '🥉 3rd Place', y: 450 }
        ];

        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'left';

        for (let i = 0; i < winners.length; i++) {
            const winner = results.winners[i];
            const winnerInfo = winners[i];
            
            // Place
            ctx.fillStyle = '#000000';
            ctx.fillText(winnerInfo.place, 50, winnerInfo.y);
            
            // User mention (we'll use user ID since we can't resolve names without guild context)
            ctx.fillStyle = '#4169E1';
            ctx.fillText(`User: ${winner.userId}`, 300, winnerInfo.y);
            
            // Prize
            ctx.fillStyle = '#008000';
            ctx.fillText(`Prize: ${fmt(winner.prize)}`, 700, winnerInfo.y);
        }

        // Footer
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.fillText('Prizes have been deposited to winners\' BANK accounts!', 600, 600);
        ctx.fillText('🎟️ New lottery week starts now! 🎟️', 600, 650);
        ctx.fillText('Use /lottery buy to purchase tickets for next week!', 600, 700);

        // Date
        ctx.font = '18px Arial';
        ctx.fillStyle = '#666666';
        ctx.fillText(`Drawing Date: ${results.drawingDate.toLocaleString()}`, 600, 750);

        return canvas.toBuffer();
    }

    /**
     * Process money transfer tax for lottery pool
     */
    async processMoneySendTax(guildId, taxAmount, client = null) {
        try {
            if (guildId === DESIGNATED_SERVER_ID && taxAmount > 0) {
                await dbManager.addToLotteryPool(guildId, taxAmount, client);
                logger.info(`Added ${taxAmount} from money transfer tax to lottery pool`);
                return true;
            }
            return false;
        } catch (error) {
            logger.error(`Error processing lottery tax: ${error.message}`);
            return false;
        }
    }

    /**
     * Check if prize pool exceeds maximum (400M) and trigger early drawing
     */
    async checkPrizePoolLimit(guildId) {
        try {
            const lotteryInfo = await dbManager.getLotteryInfo(guildId);
            const maxPrizePool = 400000000; // 400M
            
            if (lotteryInfo.total_prize >= maxPrizePool) {
                logger.info(`Prize pool (${lotteryInfo.total_prize}) exceeds maximum (${maxPrizePool}), triggering early drawing`);
                
                // Cancel current scheduled drawing
                if (this.scheduledDrawing) {
                    clearTimeout(this.scheduledDrawing);
                }
                
                // Conduct immediate drawing
                await this.conductWeeklyDrawing();
                
                // Reschedule for next Sunday
                await this.scheduleNextDrawing();
                
                return true;
            }
            return false;
        } catch (error) {
            logger.error(`Error checking prize pool limit: ${error.message}`);
            return false;
        }
    }

    /**
     * Get lottery statistics for display
     */
    async getLotteryStats(guildId) {
        try {
            const lotteryInfo = await dbManager.getLotteryInfo(guildId);
            const history = await dbManager.getLotteryHistory(guildId, 5);
            
            return {
                currentPrize: lotteryInfo.total_prize,
                total_tickets: lotteryInfo.total_tickets,
                participantCount: Object.keys(lotteryInfo.participants).length,
                nextDrawing: this.getNextSundayTimestamp(),
                recentDrawings: history
            };
        } catch (error) {
            logger.error(`Error getting lottery stats: ${error.message}`);
            return {
                currentPrize: 400000,
                total_tickets: 0,
                participantCount: 0,
                nextDrawing: this.getNextSundayTimestamp(),
                recentDrawings: []
            };
        }
    }
}

module.exports = { LotteryGame };
