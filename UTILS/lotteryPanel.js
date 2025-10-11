/**
 * Lottery Panel helper
 * Provides createLotteryPanel for use via the dev panel.
 */

const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');
const {
    getNextLotteryTimestamp,
    setLotteryPanelMessage,
    findAndTrackLotteryPanel,
    getLotteryPanelMessage,
    cleanupDuplicatePanels,
    LOTTERY_CHANNEL_ID,
    DESIGNATED_SERVER_ID
} = require('./lottery');
const { fmt } = require('./common');

/**
 * Create or update the lottery information panel.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {Object} lotteryInfo - Current lottery info from DB
 */
async function createLotteryPanel(interaction, lotteryInfo = {}) {
    try {
        const guildId = interaction.guildId;
        if (guildId !== DESIGNATED_SERVER_ID) {
            throw new Error('Not in designated lottery server');
        }

        const channel = interaction.client.channels.cache.get(LOTTERY_CHANNEL_ID)
            || await interaction.client.channels.fetch(LOTTERY_CHANNEL_ID).catch(() => null);

        if (!channel) {
            throw new Error(`Lottery channel ${LOTTERY_CHANNEL_ID} not found`);
        }

        // Get data for both lottery tiers
        const dbManager = require('./database');
        
        // Tier 1 data
        const tier1Info = await dbManager.getLotteryInfo(guildId, 1);
        const tier1Prize = tier1Info.total_prize || 400000;
        const tier1TicketCount = tier1Info.total_tickets || 0;
        
        // Tier 2 data  
        const tier2Info = await dbManager.getLotteryInfo(guildId, 2);
        const tier2Prize = tier2Info.total_prize || 3000000;
        const tier2TicketCount = tier2Info.total_tickets || 0;

        const embed = new EmbedBuilder()
            .setTitle('🎟️ Dual-Tier Lottery System')
            .setDescription('**Two exciting lottery tiers with different stakes and massive prizes!**\n\n🎯 Every Tuesday & Saturday at 10 AM EST, we draw winners for both tiers!\n🏆 Each tier has its own separate prize pool and drawings!')
            .setColor(0xFFD700)
            .addFields(
                {
                    name: '🥇 **TIER 1 - STANDARD LOTTERY**',
                    value: `💰 **Prize Pool:** ${fmt(tier1Prize)} (Max: $5M)\n🎫 **Tickets Sold:** ${tier1TicketCount}\n💳 **Price:** $50,000 per ticket\n📊 **Max:** 10 tickets per person\n🎮 **Commands:** \`/lottery\`, \`/purchaselottery\``,
                    inline: true
                },
                {
                    name: '💎 **TIER 2 - HIGH STAKES**',
                    value: `💰 **Prize Pool:** ${fmt(tier2Prize)} (Max: $20M)\n🎫 **Tickets Sold:** ${tier2TicketCount}\n💳 **Price:** $200,000 per ticket\n📊 **Max:** 10 tickets per person\n🎮 **Commands:** \`/lottery viewstatus\`, \`/lottery purchasetier2\``,
                    inline: true
                },
                {
                    name: '🗓️ Next Drawing',
                    value: `<t:${getNextLotteryTimestamp()}:F>\n<t:${getNextLotteryTimestamp()}:R>\n*Both tiers drawn simultaneously!*`,
                    inline: false
                },
                {
                    name: '🏆 Prize Distribution (Same for Both Tiers)',
                    value: '• 🥇 **1st Winner:** 45% of total prize pool\n• 🥈 **2nd Winner:** 45% of total prize pool\n• 🥉 **3rd Winner:** 10% of total prize pool\n*Three winners guaranteed per tier!*',
                    inline: false
                },
                {
                    name: '📈 How Prize Pools Grow',
                    value: '**Tier 1:** Base $400K, grows to $5M max via ticket sales\n**Tier 2:** Base $3M, grows to $20M max via ticket sales\n• Money Transfer Tax (5%) → Tier 1\n• Ticket Sales → Respective tier pools\n• No Winners → Prizes roll over',
                    inline: false
                },
                {
                    name: '🎯 Choose Your Stakes',
                    value: '**💡 Play Strategy:**\n• Play **Tier 1** for affordable fun with great prizes\n• Play **Tier 2** for high-stakes, massive rewards\n• Play **BOTH** to maximize your winning chances!\n• Each tier is completely independent',
                    inline: false
                }
            )
            .setFooter({ text: 'Two tiers, double the excitement! • Created' })
            .setTimestamp();

        // Try to find existing panel first and update it
        let message = await findAndTrackLotteryPanel(interaction.client, guildId);
        if (message) {
            await message.edit({ embeds: [embed] });
        } else {
            // Create a new panel message if none exists
            message = await channel.send({ embeds: [embed] });
        }

        // Track it for future automatic updates
        setLotteryPanelMessage(message);

        // Ensure the panel is pinned for visibility
        try {
            if (!message.pinned) {
                await message.pin();
            }
        } catch (pinErr) {
            logger.warn(`Unable to pin lottery panel ${message.id}: ${pinErr.message}`);
        }

        // Unpin any older duplicate panels to keep only one pinned panel
        await cleanupDuplicatePanels(interaction.client, message.id);

        logger.info(`Lottery panel present in channel ${LOTTERY_CHANNEL_ID} (msg ${message.id}) by ${interaction.user.id}`);
        return message;
    } catch (error) {
        logger.error(`createLotteryPanel error: ${error.message}`);
        throw error;
    }
}

module.exports = {
    createLotteryPanel
};

