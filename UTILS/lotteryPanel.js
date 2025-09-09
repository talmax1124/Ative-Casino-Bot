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

        const currentPrize = lotteryInfo.total_prize || 400000;
        const ticketCount = lotteryInfo.total_tickets || 0;

        const embed = new EmbedBuilder()
            .setTitle('🎟️ Bi-Weekly Lottery System')
            .setDescription('**Try your luck in our bi-weekly lottery drawings!**\n\nEvery Tuesday & Saturday at 10 AM EST, we draw 3 lucky winners! 1st and 2nd place get 45% each, 3rd place gets 10%!')
            .setColor(0xFFD700)
            .addFields(
                {
                    name: '💰 Current Prize Pool',
                    value: `**${fmt(currentPrize)}**\n*Updates with each money transfer (5% tax goes to lottery)*`,
                    inline: true
                },
                {
                    name: '🎫 Tickets Sold This Week',
                    value: `**${ticketCount}** tickets\n*Max 7 tickets per person*`,
                    inline: true
                },
                {
                    name: '🗓️ Next Drawing',
                    value: `<t:${getNextLotteryTimestamp()}:F>\n<t:${getNextLotteryTimestamp()}:R>\n*Every Tuesday & Saturday at 10 AM EST*`,
                    inline: true
                },
                {
                    name: '🛒 How to Buy Tickets',
                    value: 'Use `/lottery buy [count]` to purchase tickets\n• Price: **$12,000** per ticket\n• Maximum: **7 tickets** per person per week\n• Tickets reset after each drawing',
                    inline: false
                },
                {
                    name: '🏆 Prize Distribution',
                    value: '• 1st Winner: 45% of total prize pool\n• 2nd Winner: 45% of total prize pool\n• 3rd Winner: 10% of total prize pool\n*Three winners with guaranteed prizes!*',
                    inline: false
                },
                {
                    name: '📈 How Prize Pool Grows',
                    value: '• Base Prize: $400,000 every week\n• Money Transfer Tax: 5% of all `/sendmoney` transfers\n• Ticket Sales: All ticket money goes to next week\'s pool\n• No Winner: Prize rolls over to next week',
                    inline: false
                },
                {
                    name: '📋 Lottery Commands',
                    value: '`/lottery buy [count]` - Buy 1-7 lottery tickets\n`/lottery status` - Check current lottery status\n`/balance` - View your wallet and bank',
                    inline: false
                }
            )
            .setFooter({ text: 'Good luck! • Created' })
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

