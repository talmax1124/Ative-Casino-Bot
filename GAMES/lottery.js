/**
 * Lottery Game Logic for ATIVE Casino Bot
 * Handles lottery drawings, scheduling, and winner announcements
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const moment = require('moment-timezone');
const dbManager = require('../UTILS/database');
const { fmt, sendLogMessage } = require('../UTILS/common');
// RNG imports removed - not used in lottery.js
const logger = require('../UTILS/logger');
// Canvas removed - no image generation

// Lottery configuration
const LOTTERY_CHANNEL_ID = '1406136478714826824';
const DESIGNATED_SERVER_ID = '1403244656845787167';
const LOTTERY_ROLE_ID = '1414864446140059668';

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
            // Note: Lottery system is enabled in all environments
            
            // First, recover any orphaned tickets from the week rollover bug
            await this.recoverOrphanedTickets();
            
            // Check if we missed any drawings during downtime (with safer logic)
            await this.checkMissedDrawingsSafely();
            
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
     * Schedule the next lottery drawing for Tuesday and Saturday at 10 AM EST
     */
    async scheduleNextDrawing() {
        try {
            // Note: Lottery system is enabled in all environments
            
            // Clear existing timeout if any
            if (this.scheduledDrawing) {
                clearTimeout(this.scheduledDrawing);
            }

            const nextDrawingTime = this.getNextDrawingTimestamp();
            const now = Math.floor(Date.now() / 1000);
            const timeUntilDrawing = (nextDrawingTime - now) * 1000; // Convert to milliseconds

            const drawingDate = new Date(nextDrawingTime * 1000);
            const dayName = drawingDate.toLocaleDateString('en-US', { weekday: 'long' });
            logger.info(`Next lottery drawing scheduled for ${dayName}, ${drawingDate.toLocaleString()} (in ${Math.round(timeUntilDrawing / (1000 * 60 * 60))} hours)`);

            // Schedule 5-minute reminder (if drawing is more than 5 minutes away)
            const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
            if (timeUntilDrawing > fiveMinutes) {
                const reminderTime = timeUntilDrawing - fiveMinutes;
                setTimeout(async () => {
                    await this.sendDrawingReminder();
                }, reminderTime);
                logger.info(`Lottery reminder scheduled in ${Math.round(reminderTime / (1000 * 60))} minutes`);
            }

            // Schedule the drawing
            this.scheduledDrawing = setTimeout(async () => {
                const success = await this.conductWeeklyDrawing();
                if (!success) {
                    // Multi-tier fallback system
                    logger.warn('Lottery drawing failed, implementing fallback strategy...');
                    
                    // Fallback 1: Retry in 5 minutes
                    setTimeout(async () => {
                        const retry1 = await this.conductWeeklyDrawing();
                        if (!retry1) {
                            // Fallback 2: Retry in 15 minutes
                            logger.error('Lottery drawing retry 1 failed, scheduling retry 2 in 15 minutes...');
                            setTimeout(async () => {
                                const retry2 = await this.conductWeeklyDrawing();
                                if (!retry2) {
                                    // Fallback 3: Send critical alert to admin
                                    logger.error('CRITICAL: All lottery drawing attempts failed! Manual intervention required.');
                                    await this.sendCriticalAlert();
                                }
                            }, 15 * 60 * 1000); // 15 minutes
                        }
                    }, 5 * 60 * 1000); // 5 minutes
                }
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
            // Note: Lottery system is enabled in all environments
            
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
     * Safely check if we missed any drawings during bot downtime
     * More conservative approach to prevent accidental resets
     */
    async checkMissedDrawingsSafely() {
        try {
            // Note: Lottery system checks for missed drawings in all environments
            
            logger.info('Checking for missed lottery drawings during downtime...');
            
            const lotteryInfo = await dbManager.getLotteryInfo(DESIGNATED_SERVER_ID);
            logger.info(`Current lottery status: ${lotteryInfo.total_tickets} tickets, prize pool: $${lotteryInfo.total_prize}`);
            
            // Only conduct missed drawing if there are participants
            if (lotteryInfo.total_tickets > 0) {
                // Check if we actually have participants
                const allTickets = await dbManager.getAllLotteryTickets(DESIGNATED_SERVER_ID);
                if (allTickets.length > 0) {
                    logger.info(`Found ${allTickets.length} participants with ${lotteryInfo.total_tickets} total tickets - eligible for drawing`);
                    
                    // Additional safety: Only trigger if we're well past a drawing time
                    const nowNY = moment.tz('America/New_York');
                    const currentDay = nowNY.day();
                    const currentHour = nowNY.hour();
                    
                    // Much more restrictive: Only trigger on specific days with clear missed drawing evidence
                    const shouldTriggerMissedDrawing = 
                        ((currentDay === 2 || currentDay === 6) && currentHour > 15) || // Same day, 5+ hours past drawing time
                        ((currentDay === 3) && currentHour > 6) || // Wednesday morning after Tuesday drawing
                        ((currentDay === 0) && currentHour > 6);   // Sunday morning after Saturday drawing
                    
                    if (shouldTriggerMissedDrawing) {
                        // Additional safety check: verify next drawing timestamp is actually in the future
                        const nextDrawingTime = this.getNextDrawingTimestamp();
                        const nowTimestamp = Math.floor(Date.now() / 1000);
                        
                        // Only conduct if the next scheduled drawing is properly in the future (at least 1 hour from now)
                        if (nextDrawingTime > (nowTimestamp + 3600)) {
                            logger.warn('Detected likely missed drawing - conducting lottery now');
                            const success = await this.conductWeeklyDrawing();
                            if (success) {
                                logger.info('Successfully conducted missed lottery drawing on startup');
                            } else {
                                logger.error('Failed to conduct missed lottery drawing on startup - tickets preserved');
                            }
                        } else {
                            logger.info('Next drawing timestamp check failed - skipping missed drawing to prevent duplicate draws');
                        }
                    } else {
                        logger.info('Tickets found but timing suggests no missed drawing needed');
                    }
                } else {
                    logger.info(`No participants found - no drawing to conduct`);
                }
            } else {
                logger.info('No active lottery tickets found - no missed drawing to conduct');
            }
        } catch (error) {
            logger.error(`Error checking for missed drawings: ${error.message}`);
        }
    }

    /**
     * Calculate next Tuesday or Saturday 10 AM EST timestamp
     * Drawing days: Tuesday (2) and Saturday (6)
     */
    getNextDrawingTimestamp() {
        const nowNY = moment.tz('America/New_York');
        const currentDay = nowNY.day(); // 0=Sunday, 1=Monday, 2=Tuesday, ..., 6=Saturday
        const currentHour = nowNY.hour();
        
        // Drawing days: Tuesday (2) and Saturday (6)
        const drawingDays = [2, 6]; // Tuesday and Saturday
        let nextDrawing = null;
        
        // Check if today is a drawing day and it's before 10 AM
        if (drawingDays.includes(currentDay) && currentHour < 10) {
            // Today's drawing at 10 AM
            nextDrawing = nowNY.clone().hour(10).minute(0).second(0).millisecond(0);
        } else {
            // Find next drawing day
            let daysAhead = 0;
            for (let i = 1; i <= 7; i++) {
                const futureDay = (currentDay + i) % 7;
                if (drawingDays.includes(futureDay)) {
                    daysAhead = i;
                    break;
                }
            }
            nextDrawing = nowNY.clone().add(daysAhead, 'days').hour(10).minute(0).second(0).millisecond(0);
        }
        
        return nextDrawing.tz('UTC').unix();
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
            const nextTs = this.getNextDrawingTimestamp();

            const embed = new EmbedBuilder()
                .setTitle('🎟️ Bi-Weekly Lottery System')
                .setColor(0xFFD700)
                .setDescription('Every Tuesday & Saturday at 10 AM Eastern (America/New_York), we draw 3 winners!')
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
     * Send 5-minute drawing reminder to lottery channel
     */
    async sendDrawingReminder() {
        try {
            const channel = this.bot.channels.cache.get(LOTTERY_CHANNEL_ID);
            if (!channel) {
                logger.error(`Could not find lottery channel ${LOTTERY_CHANNEL_ID} for reminder`);
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('🚨 LOTTERY DRAWING IN 5 MINUTES! 🚨')
                .setColor(0xFF4500)
                .setDescription('**Final call to purchase your lottery tickets!**\n\nThe bi-weekly lottery drawing starts in just **5 minutes**!')
                .addFields(
                    { name: '🎫 How to Buy', value: 'Use `/purchaselottery [count]` right now!', inline: true },
                    { name: '💰 Cost', value: '$12,000 per ticket', inline: true },
                    { name: '⏰ Time Left', value: '**5 minutes!**', inline: true }
                )
                .setFooter({ text: 'Last chance to get in on this drawing!' })
                .setTimestamp();

            await channel.send({
                content: `@everyone <@&${LOTTERY_ROLE_ID}> 🎟️ **FINAL CALL FOR LOTTERY TICKETS!** 🎟️`,
                embeds: [embed]
            });

            logger.info('Lottery drawing reminder sent to channel');
        } catch (error) {
            logger.error(`Error sending lottery drawing reminder: ${error.message}`);
        }
    }

    /**
     * Conduct the bi-weekly lottery drawing (Tuesday and Saturday)
     */
    async conductWeeklyDrawing() {
        // Note: Lottery system is enabled in all environments
        
        if (this.isDrawingInProgress) {
            logger.warn('Lottery drawing already in progress, skipping');
            return false;
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
                return true;
            } else {
                // Handle cases where drawing couldn't be conducted
                await this.handleDrawingFailure(results);
                return false;
            }

        } catch (error) {
            logger.error(`Error during weekly lottery drawing: ${error.message}`);
            await this.handleDrawingError(error);
            return false;
        } finally {
            this.isDrawingInProgress = false;
        }
    }

    /**
     * Announce lottery winners in the lottery channel
     */
    async announceWinners(results) {
        try {
            // Note: Lottery system is enabled in all environments
            
            const channel = this.bot.channels.cache.get(LOTTERY_CHANNEL_ID);
            if (!channel) {
                logger.error(`Could not find lottery channel ${LOTTERY_CHANNEL_ID}`);
                return;
            }

            // No image generation needed

            const embed = new EmbedBuilder()
                .setTitle('🎊 LOTTERY DRAWING RESULTS! 🎊')
                .setColor(0xFFD700)
                .setDescription(`**Bi-weekly lottery drawing has been completed!**\n\nTotal Prize Pool: **${fmt(results.total_prize)}**\nParticipants: **${results.totalParticipants}** players\nTickets Sold: **${results.total_tickets}**`);

            // Add winner fields dynamically based on number of winners
            const winnerEmojis = ['🥇', '🥈', '🥉'];
            const placeNames = ['1st Place Winner', '2nd Place Winner', '3rd Place Winner'];
            
            for (let i = 0; i < results.winners.length && i < 3; i++) {
                const winner = results.winners[i];
                embed.addFields({
                    name: `${winnerEmojis[i]} ${placeNames[i]}`,
                    value: `<@${winner.userId}>\n**Prize: ${fmt(winner.prize)}**`,
                    inline: true
                });
            }
            
            embed
                .addFields({
                    name: '💰 Prize Distribution',
                    value: `All prizes have been automatically deposited into winners' **BANK** accounts!`,
                    inline: false
                })
                .setFooter({ text: '🎟️ New lottery period starts now! Buy tickets for next Tuesday or Saturday drawing!' })
                .setTimestamp();

            // Delete old lottery panel before sending results
            if (this.panelMessageId) {
                try {
                    const oldPanelMessage = await channel.messages.fetch(this.panelMessageId);
                    await oldPanelMessage.delete();
                    logger.info('Deleted old lottery panel before announcing winners');
                } catch (error) {
                    logger.warn(`Could not delete old lottery panel: ${error.message}`);
                }
                this.panelMessageId = null;
            }

            // Send winner announcement (no buttons, no images)
            await channel.send({
                content: `🎊 **LOTTERY WINNERS ANNOUNCED!** 🎊\n@everyone <@&${LOTTERY_ROLE_ID}>`,
                embeds: [embed]
            });
            
            // Create new lottery panel for next drawing period
            setTimeout(async () => {
                await this.upsertLotteryPanel();
                logger.info('Created new lottery panel after drawing completion');
            }, 5000); // Wait 5 seconds before creating new panel

            // Log to admin channel - dynamically build winners message
            const winnersText = results.winners.map((winner, index) => {
                const places = ['1st', '2nd', '3rd'];
                return `${places[index]}: <@${winner.userId}> (${fmt(winner.prize)})`;
            }).join(', ');
            
            await sendLogMessage(
                this.bot,
                'game',
                `Lottery drawing completed! Winners: ${winnersText}`,
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
            if (results.reason === 'No participants in lottery') {
                description = `**No participants for this week's drawing!**\n\nNo one purchased tickets for this drawing period.\n\n💰 **Good news:** The current prize pool will roll over to next week, making it even bigger!`;
            } else {
                description = `**This week's lottery drawing could not be completed.**\n\nReason: ${results.reason}\n\n💰 The prize pool will roll over to next week.`;
            }

            const embed = new EmbedBuilder()
                .setTitle('🎟️ Lottery Drawing Update')
                .setColor(0xFFA500)
                .setDescription(description)
                .addFields({
                    name: '📅 Next Week',
                    value: 'The lottery continues next Tuesday & Saturday at 10 AM EST!\nBuy your tickets now for a chance to win the rolled-over prize pool!',
                    inline: false
                })
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
     * Send critical alert when all drawing attempts fail
     */
    async sendCriticalAlert() {
        try {
            // Send alert to both logs and lottery channel
            await sendLogMessage(
                this.bot,
                'error',
                `🚨 CRITICAL LOTTERY FAILURE: All automated drawing attempts failed! Use /drawlottery CONFIRM to manually trigger the drawing immediately.`,
                null,
                DESIGNATED_SERVER_ID
            );

            // Also send to lottery channel as emergency notice
            const channel = this.bot.channels.cache.get(LOTTERY_CHANNEL_ID);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setTitle('🚨 LOTTERY DRAWING ALERT')
                    .setColor(0xFF0000)
                    .setDescription('**TECHNICAL ISSUE DETECTED**\n\nThe automated lottery drawing encountered an error. Our administrators have been notified and will manually conduct the drawing shortly.\n\n**Your tickets are safe and the drawing will still occur!**')
                    .addFields({ 
                        name: 'What happens now?', 
                        value: '• Admins have been alerted\n• Manual drawing will be conducted\n• All tickets remain valid\n• Winners will be announced normally', 
                        inline: false 
                    })
                    .setFooter({ text: 'We apologize for any inconvenience' })
                    .setTimestamp();

                await channel.send({ embeds: [embed] });
            }

            // Try to use lottery restart handler if available
            if (this.bot.restartLotterySystem) {
                logger.info('Attempting automatic lottery system restart after critical failure...');
                const restartSuccess = await this.bot.restartLotterySystem();
                if (restartSuccess) {
                    logger.info('Lottery system automatically restarted after critical failure');
                } else {
                    logger.error('Automatic lottery restart failed - manual intervention required');
                }
            }

        } catch (alertError) {
            logger.error(`Failed to send critical lottery alert: ${alertError.message}`);
            
            // Final fallback: At least log the critical error
            try {
                console.error('CRITICAL LOTTERY SYSTEM FAILURE - ALL FALLBACKS EXHAUSTED');
                console.error('Manual intervention required immediately');
            } catch (consoleError) {
                // Absolute last resort - if even console.error fails, the system is in a very bad state
            }
        }
    }

    // Image generation removed - using simple text-based announcements

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
            const maxPrizePool = 400000; // 400K
            
            if (lotteryInfo.total_prize >= maxPrizePool) {
                logger.info(`Prize pool (${lotteryInfo.total_prize}) exceeds maximum (${maxPrizePool}), triggering early drawing`);
                
                // Cancel current scheduled drawing
                if (this.scheduledDrawing) {
                    clearTimeout(this.scheduledDrawing);
                }
                
                // Conduct immediate drawing
                await this.conductWeeklyDrawing();
                
                // Reschedule for next drawing (Tuesday/Saturday)
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
                nextDrawing: this.getNextDrawingTimestamp(),
                recentDrawings: history
            };
        } catch (error) {
            logger.error(`Error getting lottery stats: ${error.message}`);
            return {
                currentPrize: 400000,
                total_tickets: 0,
                participantCount: 0,
                nextDrawing: this.getNextDrawingTimestamp(),
                recentDrawings: []
            };
        }
    }

    /**
     * Recover orphaned lottery tickets from previous weeks due to rollover bug
     */
    async recoverOrphanedTickets() {
        try {
            // Note: Lottery system is enabled in all environments
            
            logger.info('Checking for orphaned lottery tickets to recover...');
            
            let recoveryResult;
            try {
                recoveryResult = await dbManager.checkAndRecoverOrphanedTickets(DESIGNATED_SERVER_ID);
            } catch (recoveryError) {
                logger.warn(`Error calling checkAndRecoverOrphanedTickets: ${recoveryError.message}`);
                recoveryResult = { success: false, reason: 'error', error: recoveryError.message };
            }
            
            if (recoveryResult.success) {
                if (recoveryResult.recovered > 0) {
                    logger.info(`🎫 TICKET RECOVERY: Successfully recovered ${recoveryResult.recovered} orphaned tickets`);
                    logger.info(`Recovery details: ${recoveryResult.details}`);
                    
                    // Update the lottery panel to reflect the recovered tickets
                    try {
                        await this.upsertLotteryPanel();
                        logger.info('Updated lottery panel after ticket recovery');
                    } catch (panelError) {
                        logger.error(`Failed to update lottery panel after recovery: ${panelError.message}`);
                    }
                } else {
                    logger.info('No orphaned tickets found - all tickets properly assigned');
                }
            } else {
                // Suppress known "no_database" error to clean up startup logs
                if (recoveryResult.reason === 'no_database') {
                    logger.debug(`Ticket recovery skipped: database adapter not available`);
                } else {
                    logger.warn(`Ticket recovery failed: ${recoveryResult.reason}`);
                }
            }
        } catch (error) {
            logger.error(`Error during ticket recovery process: ${error.message}`);
        }
    }
}

module.exports = { LotteryGame };
