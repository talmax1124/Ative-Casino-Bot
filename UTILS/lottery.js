/**
 * Lottery utility functions for ATIVE Casino Bot
 * Helper functions for lottery operations, formatting, and integration
 */

const dbManager = require('./database');
const { fmt } = require('./common');
const logger = require('./logger');

// Global lottery panel tracking for persistent panels
let lotteryPanelMessage = null;
const LOTTERY_CHANNEL_ID = '1406136478714826824';
const DESIGNATED_SERVER_ID = '1403244656845787167';

/**
 * Calculate the next Tuesday or Saturday at 10 AM EST and return as Unix timestamp
 */
function getNextLotteryTimestamp() {
    const now = new Date();
    
    // Convert to EST (UTC-5, or UTC-4 during DST)
    // For simplicity, we'll use a fixed UTC-5 offset
    const estOffset = -5 * 60; // EST is UTC-5 in minutes
    const estTime = new Date(now.getTime() + (estOffset * 60 * 1000));
    
    const currentDay = estTime.getDay(); // 0 = Sunday, 1 = Monday, 2 = Tuesday, ..., 6 = Saturday
    const currentHour = estTime.getHours();
    
    // Drawing days: Tuesday (2) and Saturday (6)
    const drawingDays = [2, 6];
    let nextDrawing;
    
    // Check if today is a drawing day and it's before 10 AM
    if (drawingDays.includes(currentDay) && currentHour < 10) {
        // Today's drawing at 10 AM
        nextDrawing = new Date(estTime);
        nextDrawing.setHours(10, 0, 0, 0);
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
        nextDrawing = new Date(estTime);
        nextDrawing.setDate(nextDrawing.getDate() + daysAhead);
        nextDrawing.setHours(10, 0, 0, 0);
    }
    
    // Convert back to UTC for timestamp
    const utcTimestamp = Math.floor((nextDrawing.getTime() - (estOffset * 60 * 1000)) / 1000);
    return utcTimestamp;
}

/**
 * Find all lottery panel messages, scanning deeper history (up to maxToScan).
 * Returns newest first.
 */
async function findAllLotteryPanels(bot, maxToScan = 500) {
    const results = [];
    try {
        const channel = bot.channels.cache.get(LOTTERY_CHANNEL_ID);
        if (!channel) {
            logger.error(`Could not find lottery channel ${LOTTERY_CHANNEL_ID}`);
            return results;
        }

        let lastId = undefined;
        let scanned = 0;
        while (scanned < maxToScan) {
            const batchSize = Math.min(100, maxToScan - scanned);
            const batch = await channel.messages.fetch({ limit: batchSize, before: lastId });
            if (!batch.size) break;

            for (const msg of batch.values()) {
                scanned++;
                lastId = msg.id;
                if (
                    msg.author?.id === bot.user.id &&
                    msg.embeds?.length > 0 &&
                    (msg.embeds[0]?.title?.includes('Weekly Lottery System') ||
                     msg.embeds[0]?.title?.includes('Dual-Tier Lottery System') ||
                     msg.embeds[0]?.title?.includes('Lottery System'))
                ) {
                    results.push(msg);
                }
            }

            if (batch.size < batchSize) break; // no more messages
        }
    } catch (error) {
        logger.error(`Error scanning lottery panels: ${error.message}`);
    }
    return results;
}

/**
 * Find and track the newest existing lottery panel message.
 */
async function findAndTrackLotteryPanel(bot, guildId) {
    try {
        // Note: Lottery system is enabled in all environments
        
        if (guildId !== DESIGNATED_SERVER_ID) return null;

        const panels = await findAllLotteryPanels(bot, 500);
        if (panels.length > 0) {
            lotteryPanelMessage = panels[0]; // Newest first
            logger.info(`Found existing lottery panel message ${lotteryPanelMessage.id} in channel ${LOTTERY_CHANNEL_ID}`);
            return lotteryPanelMessage;
        }

        logger.info(`No existing lottery panel found in channel ${LOTTERY_CHANNEL_ID}`);
        return null;
    } catch (error) {
        logger.error(`Error finding lottery panel: ${error.message}`);
        return null;
    }
}

/**
 * Update the lottery panel with current information
 */
async function updateLotteryPanel(bot, guildId) {
    try {
        // Note: Lottery system is enabled in all environments
        
        logger.info(`updateLotteryPanel called for guild ${guildId}`);
        
        // Only update for the designated lottery server
        if (guildId !== DESIGNATED_SERVER_ID) {
            logger.info(`Guild ${guildId} is not the designated lottery server ${DESIGNATED_SERVER_ID}, skipping update`);
            return;
        }
        
        // Check if we have a tracked lottery panel
        if (!lotteryPanelMessage) {
            logger.info(`No lottery panel tracked for guild ${guildId}, trying to find existing one`);
            // Try to find and track existing panel
            await findAndTrackLotteryPanel(bot, guildId);
            
            // If still not found, exit
            if (!lotteryPanelMessage) {
                logger.info(`No lottery panel found or tracked for guild ${guildId}`);
                return;
            }
        }
        
        // Get current lottery info
        let currentPrize;
        let ticketCount;
        try {
            const lotteryInfo = await dbManager.getLotteryInfo(guildId, 1); // Tier 1
            currentPrize = lotteryInfo.total_prize || 400000;
            ticketCount = lotteryInfo.total_tickets || 0;
            logger.info(`Retrieved lottery info - Prize: ${currentPrize}, Tickets: ${ticketCount}`);
        } catch (error) {
            logger.error(`Error getting lottery info: ${error.message}`);
            currentPrize = 400000;
            ticketCount = 0;
        }
        
        // Get tier 2 lottery info
        let tier2Prize, tier2TicketCount;
        try {
            const tier2LotteryInfo = await dbManager.getLotteryInfo(guildId, 2);
            tier2Prize = tier2LotteryInfo.total_prize || 3000000;
            tier2TicketCount = tier2LotteryInfo.total_tickets || 0;
            logger.info(`Retrieved tier 2 lottery info - Prize: ${tier2Prize}, Tickets: ${tier2TicketCount}`);
        } catch (error) {
            logger.error(`Error getting tier 2 lottery info: ${error.message}`);
            tier2Prize = 3000000;
            tier2TicketCount = 0;
        }

        // Create updated embed with both tiers
        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setTitle('🎟️ Dual-Tier Lottery System')
            .setDescription('**Two exciting lottery tiers with different stakes and prizes!**\n\nEvery Tuesday & Saturday at 10 AM EST, we draw winners for both tiers!')
            .setColor(0xFFD700)
            .addFields(
                {
                    name: '🥇 **TIER 1 LOTTERY**',
                    value: `💰 **Prize Pool:** ${fmt(currentPrize)} (Max: $5M)\n🎫 **Tickets Sold:** ${ticketCount}\n💳 **Price:** $50,000 per ticket\n📊 **Max Tickets:** 10 per person`,
                    inline: true
                },
                {
                    name: '💎 **TIER 2 HIGH STAKES**',
                    value: `💰 **Prize Pool:** ${fmt(tier2Prize)} (Max: $20M)\n🎫 **Tickets Sold:** ${tier2TicketCount}\n💳 **Price:** $200,000 per ticket\n📊 **Max Tickets:** 10 per person`,
                    inline: true
                },
                {
                    name: '🗓️ Next Drawing',
                    value: `<t:${getNextLotteryTimestamp()}:F>\n<t:${getNextLotteryTimestamp()}:R>\n*Both tiers drawn simultaneously*`,
                    inline: false
                },
                {
                    name: '🛒 How to Play',
                    value: '**Tier 1:** Use `/lottery` and `/purchaselottery`\n**Tier 2:** Use `/lottery2` and `/purchaselottery2`\n• Each tier has separate tickets and prizes\n• You can play both tiers simultaneously\n• Tickets reset after each drawing',
                    inline: false
                },
                {
                    name: '🏆 Prize Distribution',
                    value: '• 1st Winner: 45% of total prize pool\n• 2nd Winner: 45% of total prize pool\n• 3rd Winner: 10% of total prize pool\n*Three winners with guaranteed prizes!*',
                    inline: false
                },
                {
                    name: '📈 How Prize Pools Grow',
                    value: '**Tier 1:** Base $400K, grows via ticket sales to $5M max\n**Tier 2:** Base $3M, grows via ticket sales to $20M max\n• Money Transfer Tax: 5% goes to Tier 1\n• Ticket Sales: All ticket money goes to respective tier\n• No Winner: Prize rolls over to next week',
                    inline: false
                },
                {
                    name: '📋 Lottery Commands',
                    value: '**Tier 1:**\n`/lottery` - Check tier 1 status\n`/purchaselottery` - Buy tier 1 tickets\n\n**Tier 2:**\n`/lottery2` - Check tier 2 status\n`/purchaselottery2` - Buy tier 2 tickets',
                    inline: false
                }
            )
            .setFooter({ text: 'Good luck! • Last Updated' })
            .setTimestamp();
        
        // Update the message
        logger.info(`About to edit message ${lotteryPanelMessage.id} for guild ${guildId}`);
        await lotteryPanelMessage.edit({ embeds: [embed] });
        logger.info(`Successfully updated lottery panel for guild ${guildId}`);
        
    } catch (error) {
        if (error.code === 10008) { // Message not found
            // Message was deleted, remove from tracking
            lotteryPanelMessage = null;
            logger.info(`Lottery panel message deleted for guild ${guildId}, removed from tracking`);
        } else {
            logger.error(`Error updating lottery panel for guild ${guildId}: ${error.message}`);
        }
    }
}

/**
 * Get lottery panel message reference
 */
function getLotteryPanelMessage() {
    return lotteryPanelMessage;
}

/**
 * Set lottery panel message reference
 */
function setLotteryPanelMessage(message) {
    lotteryPanelMessage = message;
}

/**
 * Clear lottery panel message reference
 */
function clearLotteryPanelMessage() {
    lotteryPanelMessage = null;
}

/**
 * Unpin older duplicate lottery panels, keeping the provided message pinned.
 * Only affects messages authored by the bot with the panel title.
 */
async function cleanupDuplicatePanels(bot, keepMessageId) {
    try {
        const channel = bot.channels.cache.get(LOTTERY_CHANNEL_ID);
        if (!channel) return;

        const pinned = await channel.messages.fetchPinned().catch(() => null);
        if (!pinned) return;

        for (const msg of pinned.values()) {
            const isPanel = msg.author?.id === bot.user.id && msg.embeds?.[0]?.title && 
                           (msg.embeds[0].title.includes('Weekly Lottery System') ||
                            msg.embeds[0].title.includes('Dual-Tier Lottery System') ||
                            msg.embeds[0].title.includes('Lottery System'));
            if (isPanel && msg.id !== keepMessageId && msg.pinned) {
                try {
                    await msg.unpin();
                    logger.info(`Unpinned duplicate lottery panel ${msg.id}`);
                } catch (err) {
                    logger.warn(`Failed to unpin duplicate panel ${msg.id}: ${err.message}`);
                }
            }
        }
    } catch (error) {
        logger.error(`Error cleaning up duplicate panels: ${error.message}`);
    }
}

/**
 * Format lottery prize amounts
 */
function formatLotteryPrize(amount) {
    return fmt(amount);
}

/**
 * Calculate lottery prize distribution
 */
function calculatePrizeDistribution(total_prize) {
    return {
        first: Math.floor(total_prize * 0.45),   // 45%
        second: Math.floor(total_prize * 0.45),  // 45%
        third: Math.floor(total_prize * 0.10)    // 10%
    };
}

/**
 * Validate ticket purchase parameters
 */
function validateTicketPurchase(ticketCount, currentTickets, balance, ticketPrice = 50000) {
    const errors = [];
    
    if (ticketCount < 1 || ticketCount > 10) {
        errors.push('Ticket count must be between 1 and 10');
    }
    
    if (currentTickets + ticketCount > 10) {
        errors.push(`You can only have a maximum of 10 tickets per week. You currently have ${currentTickets} tickets.`);
    }
    
    const totalCost = ticketCount * ticketPrice;
    if (balance < totalCost) {
        errors.push(`Insufficient funds! You need ${fmt(totalCost)} but only have ${fmt(balance)} in your wallet.`);
    }
    
    return {
        valid: errors.length === 0,
        errors,
        totalCost
    };
}

/**
 * Check if lottery pool should trigger early drawing (400M+ limit)
 */
async function checkEarlyDrawingTrigger(guildId) {
    try {
        const lotteryInfo = await dbManager.getLotteryInfo(guildId, 1); // Tier 1
        const maxPrizePool = 400000000; // 400M as specified
        
        return lotteryInfo.total_prize >= maxPrizePool;
    } catch (error) {
        logger.error(`Error checking early drawing trigger: ${error.message}`);
        return false;
    }
}

module.exports = {
    getNextLotteryTimestamp,
    findAndTrackLotteryPanel,
    updateLotteryPanel,
    getLotteryPanelMessage,
    setLotteryPanelMessage,
    clearLotteryPanelMessage,
    findAllLotteryPanels,
    cleanupDuplicatePanels,
    formatLotteryPrize,
    calculatePrizeDistribution,
    validateTicketPurchase,
    checkEarlyDrawingTrigger,
    LOTTERY_CHANNEL_ID,
    DESIGNATED_SERVER_ID
};
