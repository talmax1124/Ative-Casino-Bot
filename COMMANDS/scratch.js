/**
 * Scratch Ticket Command for ATIVE Casino Bot
 * Player interface for viewing active scratch tickets
 */

const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getGuildId, fmtFull } = require('../UTILS/common');
const dbManager = require('../UTILS/database');
const scratchGenerator = require('../UTILS/scratchTicketGenerator');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('scratch')
        .setDescription('🎫 View your active scratch tickets and statistics')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('What to do')
                .setRequired(false)
                .addChoices(
                    { name: 'My Tickets', value: 'tickets' },
                    { name: 'Statistics', value: 'stats' },
                    { name: 'How to Play', value: 'help' }
                )
        ),

    async execute(interaction) {
        const guildId = await getGuildId(interaction);
        const userId = interaction.user.id;
        const action = interaction.options.getString('action') || 'tickets';

        try {
            await interaction.deferReply();

            switch (action) {
                case 'tickets':
                    await this.showUserTickets(interaction, userId, guildId);
                    break;
                case 'stats':
                    await this.showScratchStats(interaction, guildId);
                    break;
                case 'help':
                    await this.showHelpInfo(interaction);
                    break;
                default:
                    await interaction.editReply({ content: 'Invalid action specified.' });
            }

        } catch (error) {
            logger.error(`Error in scratch command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Failed to process scratch ticket request. Please try again.')
                .setColor(0xFF0000);

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed] });
            }
        }
    },

    async showUserTickets(interaction, userId, guildId) {
        try {
            const activeTickets = await dbManager.getUserActiveScratchTickets(userId, guildId);
            
            if (activeTickets.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('🎫 Your Scratch Tickets')
                    .setDescription('You don\'t have any active scratch tickets right now.\n\n' +
                                  '💡 **Tip:** Scratch tickets drop randomly in channels throughout the day. ' +
                                  'Keep an eye out for the golden ticket notification!')
                    .setColor(0xFFD700)
                    .addFields(
                        { name: '🎯 How to Get Tickets', value: '• Watch for random drops in channels\n• Max 2 tickets drop per day\n• First to claim gets the ticket!', inline: false },
                        { name: '🎲 How to Win', value: '• Scratch to reveal 9 symbols\n• Match 3 identical symbols\n• Win $150K, $250K, or $400K!', inline: false }
                    )
                    .setFooter({ text: '🍀 Good luck!' })
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            // Show active tickets
            for (const ticket of activeTickets) {
                // Ensure scratchedPositions is always an array
                let scratchedPositions = ticket.scratched_positions;
                if (!Array.isArray(scratchedPositions)) {
                    scratchedPositions = [];
                }
                const timeLeft = Math.max(0, Math.floor((new Date(ticket.expires_at).getTime() - Date.now()) / 1000 / 60));
                
                const embed = new EmbedBuilder()
                    .setTitle(`🎫 Scratch Ticket #${ticket.id}`)
                    .setColor(0x00FF99)
                    .addFields(
                        { name: '📊 Progress', value: `${scratchedPositions.length}/9 scratched`, inline: true },
                        { name: '⏰ Time Left', value: `${timeLeft} minutes`, inline: true },
                        { name: '🎯 Goal', value: 'Find 3 matching symbols', inline: true }
                    )
                    .setFooter({ text: 'Use the buttons on your ticket to scratch!' })
                    .setTimestamp();

                // Create ticket image if possible
                let files = [];
                try {
                    const ticketImage = await scratchGenerator.createTicketImage(ticket, scratchedPositions);
                    if (ticketImage) {
                        const attachment = new AttachmentBuilder(ticketImage, { name: `scratch-ticket-${ticket.id}.png` });
                        embed.setImage(`attachment://scratch-ticket-${ticket.id}.png`);
                        files.push(attachment);
                    }
                } catch (imageError) {
                    logger.warn(`Could not create ticket image: ${imageError.message}`);
                    // Create text-based grid display
                    let gridDisplay = '';
                    const symbols = ticket.symbols;
                    
                    for (let row = 0; row < 3; row++) {
                        for (let col = 0; col < 3; col++) {
                            const index = row * 3 + col;
                            const isScratched = scratchedPositions.includes(index);
                            gridDisplay += isScratched ? symbols[index] : '❓';
                            if (col < 2) gridDisplay += ' ';
                        }
                        if (row < 2) gridDisplay += '\n';
                    }
                    
                    embed.addFields({ name: '🎯 Scratch Areas', value: `\`\`\`\n${gridDisplay}\n\`\`\``, inline: false });
                }

                if (files.length > 0) {
                    await interaction.editReply({ embeds: [embed], files });
                } else {
                    await interaction.editReply({ embeds: [embed] });
                }
            }

        } catch (error) {
            logger.error(`Error showing user tickets: ${error.message}`);
            throw error;
        }
    },

    async showScratchStats(interaction, guildId) {
        try {
            const dropSettings = await dbManager.getScratchDropSettings(guildId);
            
            if (!dropSettings) {
                const embed = new EmbedBuilder()
                    .setTitle('📊 Scratch Ticket Statistics')
                    .setDescription('No scratch ticket data available for this server yet.')
                    .setColor(0xFFD700);
                
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            const today = new Date().toDateString();
            const resetDate = new Date(dropSettings.drop_count_reset).toDateString();
            const dailyDrops = today === resetDate ? dropSettings.daily_drops : 0;
            
            // Calculate win rate
            const winRate = dropSettings.total_drops > 0 ? 
                ((dropSettings.total_wins / dropSettings.total_drops) * 100).toFixed(1) : '0.0';

            const embed = new EmbedBuilder()
                .setTitle('📊 Server Scratch Ticket Statistics')
                .setColor(0xFFD700)
                .addFields(
                    { name: '📅 Today', value: `${dailyDrops}/${dropSettings.max_daily_drops} drops`, inline: true },
                    { name: '🎫 Total Drops', value: dropSettings.total_drops.toLocaleString(), inline: true },
                    { name: '🏆 Total Wins', value: dropSettings.total_wins.toLocaleString(), inline: true },
                    { name: '💰 Total Winnings', value: fmtFull(dropSettings.total_winnings), inline: true },
                    { name: '📈 Win Rate', value: `${winRate}%`, inline: true },
                    { name: '🎯 Status', value: dropSettings.drop_enabled ? '✅ Drops Active' : '❌ Drops Disabled', inline: true }
                )
                .setFooter({ text: '🍀 Statistics reset daily' })
                .setTimestamp();

            if (dropSettings.next_drop_time) {
                const nextDrop = new Date(dropSettings.next_drop_time);
                embed.addFields({ 
                    name: '⏰ Next Drop', 
                    value: `<t:${Math.floor(nextDrop.getTime() / 1000)}:R>`, 
                    inline: false 
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error(`Error showing scratch stats: ${error.message}`);
            throw error;
        }
    },

    async showHelpInfo(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🎫 Scratch Tickets Guide')
            .setDescription('Learn how to play and win with scratch tickets!')
            .setColor(0xFFD700)
            .addFields(
                { 
                    name: '🎯 How to Get Tickets', 
                    value: '• **Random Drops**: Up to 2 tickets drop randomly each day in active channels\n' +
                           '• **Quick Claim**: First person to click "Claim Ticket" gets it\n' +
                           '• **Time Limit**: 5 minutes to claim before it expires', 
                    inline: false 
                },
                { 
                    name: '🎲 How to Play', 
                    value: '• **Scratch Interface**: Click the "?" buttons to reveal symbols\n' +
                           '• **Win Condition**: Match 3 identical symbols anywhere\n' +
                           '• **Time Limit**: 10 minutes to complete scratching', 
                    inline: false 
                },
                { 
                    name: '💰 Prizes', 
                    value: '🥉 **$150,000** - Most common win (9% chance)\n' +
                           '🥈 **$250,000** - Good win (4.5% chance)\n' +
                           '🥇 **$400,000** - Jackpot! (1.5% chance)', 
                    inline: false 
                },
                { 
                    name: '📋 Rules', 
                    value: '• Only 1 active ticket per player\n' +
                           '• Tickets expire after 10 minutes\n' +
                           '• Prizes are added directly to your wallet\n' +
                           '• No purchase required - completely free!', 
                    inline: false 
                },
                { 
                    name: '💡 Tips', 
                    value: '• Stay active in channels to catch drops\n' +
                           '• Use `/scratch tickets` to view your active tickets\n' +
                           '• Check `/scratch stats` for server statistics', 
                    inline: false 
                }
            )
            .setFooter({ text: '🍀 Good luck scratching!' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};