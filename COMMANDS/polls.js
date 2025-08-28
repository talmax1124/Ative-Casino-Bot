/**
 * Polls system for the utility bot
 * Interactive voting system with real-time updates
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');

// Active polls storage (in-memory for quick access)
const activePolls = new Map();

// Helper function to check mod/admin permissions
async function hasModPermissions(member) {
    // Check if user is server owner
    if (member.guild.ownerId === member.id) {
        return true;
    }
    
    // Check for Administrator permission
    if (member.permissions.has('Administrator')) {
        return true;
    }
    
    // Check for Moderate Members permission
    if (member.permissions.has('ModerateMembers')) {
        return true;
    }
    
    // Check for mod/admin roles
    const modRoles = ['mod', 'moderator', 'admin', 'administrator', 'owner'];
    return member.roles.cache.some(role => 
        modRoles.some(modRole => 
            role.name.toLowerCase().includes(modRole)
        )
    );
}

// Parse time string (e.g., "30m", "2h", "1d")
function parseTimeString(timeStr) {
    const match = timeStr.match(/^(\d+)([mhd])$/i);
    if (!match) return null;
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    const multipliers = {
        'm': 60 * 1000,      // minutes to milliseconds
        'h': 60 * 60 * 1000, // hours to milliseconds
        'd': 24 * 60 * 60 * 1000 // days to milliseconds
    };
    
    return value * multipliers[unit];
}

// Create poll embed with results
function createPollEmbed(pollData, showResults = false) {
    const embed = new EmbedBuilder()
        .setTitle(`📊 ${pollData.question}`)
        .setColor(pollData.active ? 0x00FF00 : 0x808080)
        .setFooter({ 
            text: `Poll by ${pollData.creator_name} • ${pollData.active ? 'Active' : 'Ended'}` 
        })
        .setTimestamp(new Date(pollData.created_at));

    if (pollData.description) {
        embed.setDescription(pollData.description);
    }

    // Add expiration info
    if (pollData.expires_at && pollData.active) {
        const expiresAt = new Date(pollData.expires_at);
        embed.addFields(
            { name: '⏰ Expires', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true }
        );
    }

    // Calculate vote counts
    const votes = pollData.votes || {};
    const totalVotes = Object.values(votes).reduce((sum, count) => sum + count, 0);

    // Add options with vote counts/percentages
    const optionsText = pollData.options.map((option, index) => {
        const voteCount = votes[index] || 0;
        const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
        const bar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
        // Always show live results with progress bars and counts
        return `**${index + 1}.** ${option}\n\`${bar}\` ${voteCount} votes (${percentage}%)`;
    }).join('\n\n');

    embed.addFields(
        { name: '📋 Options', value: optionsText, inline: false }
    );

    // Always display total votes so users see live counts
    embed.addFields(
        { name: '🗳️ Total Votes', value: totalVotes.toString(), inline: true }
    );

    return embed;
}

// Create poll buttons
function createPollButtons(pollData) {
    if (!pollData.active) return [];

    const buttons = [];
    for (let i = 0; i < Math.min(pollData.options.length, 5); i++) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`poll_vote_${pollData.poll_id}_${i}`)
                .setLabel(`${i + 1}`)
                .setStyle(ButtonStyle.Primary)
        );
    }

    // Add end poll button for mods/admins
    buttons.push(
        new ButtonBuilder()
            .setCustomId(`poll_end_${pollData.poll_id}`)
            .setLabel('End Poll')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🛑')
    );

    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }

    return rows;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('polls')
        .setDescription('Create a new poll')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('The poll question')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('options')
                .setDescription('Poll options separated by semicolons (;)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Poll duration (e.g., "30m", "2h", "1d")')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Optional poll description')
                .setRequired(false)
        ),

    async execute(interaction) {
        const question = interaction.options.getString('question');
        const optionsStr = interaction.options.getString('options');
        const durationStr = interaction.options.getString('duration');
        const description = interaction.options.getString('description');

        // Parse options
        const options = optionsStr.split(';').map(opt => opt.trim()).filter(opt => opt.length > 0);
        
        if (options.length < 2) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Invalid Options')
                .setDescription('You need at least 2 options for a poll.')
                .setColor(0xFF0000);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (options.length > 10) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Too Many Options')
                .setDescription('Polls can have at most 10 options.')
                .setColor(0xFF0000);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // Parse duration
        const durationMs = parseTimeString(durationStr);
        if (!durationMs) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Invalid Duration')
                .setDescription('Duration must be in format like "30m", "2h", or "1d".')
                .setColor(0xFF0000);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        try {
            // Create poll data
            const pollId = `poll_${Date.now()}_${interaction.user.id}`;
            const now = new Date();
            const expiresAt = new Date(now.getTime() + durationMs);

            const pollData = {
                poll_id: pollId,
                question: question,
                description: description,
                options: options,
                creator_id: interaction.user.id,
                creator_name: interaction.user.displayName,
                guild_id: interaction.guildId,
                channel_id: interaction.channelId,
                created_at: now.toISOString(),
                expires_at: expiresAt.toISOString(),
                active: true,
                votes: {},
                voters: []
            };

            // Store in database
            const success = await dbManager.storePoll(pollId, pollData);
            if (!success) {
                throw new Error('Failed to store poll in database');
            }

            // Store in memory for quick access
            activePolls.set(pollId, pollData);

            // Create poll embed and buttons
            const embed = createPollEmbed(pollData);
            const buttons = createPollButtons(pollData);

            await interaction.reply({ embeds: [embed], components: buttons });

            // Set timeout to automatically end poll
            setTimeout(async () => {
                try {
                    const pollData = activePolls.get(pollId);
                    if (pollData && pollData.active) {
                        pollData.active = false;
                        await dbManager.endPoll(pollId);
                        activePolls.delete(pollId);

                        // Update the message
                        const endedEmbed = createPollEmbed(pollData, true);
                        endedEmbed.setTitle(`📊 ${pollData.question} (ENDED)`);
                        
                        await interaction.editReply({ 
                            embeds: [endedEmbed], 
                            components: [] 
                        });
                    }
                } catch (error) {
                    logger.error(`Error auto-ending poll ${pollId}: ${error.message}`);
                }
            }, durationMs);

            logger.info(`Poll created: ${pollId} by ${interaction.user.tag}`);

        } catch (error) {
            logger.error(`Error creating poll: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Failed to create poll. Please try again.')
                .setColor(0xFF0000);

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};

// Export button handlers for poll interactions
module.exports.buttonHandlers = {
    // Handle poll voting
    poll_vote: async (interaction, pollId, optionIndex) => {
        const userId = interaction.user.id;
        const pollData = activePolls.get(pollId);

        if (!pollData || !pollData.active) {
            return await interaction.reply({ 
                content: 'This poll is no longer active.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        // Check if user already voted
        if (pollData.voters.includes(userId)) {
            return await interaction.reply({ 
                content: 'You have already voted in this poll.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        // Record vote
        if (!pollData.votes[optionIndex]) {
            pollData.votes[optionIndex] = 0;
        }
        pollData.votes[optionIndex]++;
        pollData.voters.push(userId);

        // Update in database
        await dbManager.updatePollVotes(pollId, pollData.votes);

        // Update the poll message
        const embed = createPollEmbed(pollData);
        const buttons = createPollButtons(pollData);

        await interaction.update({ embeds: [embed], components: buttons });
        
        // Send confirmation
        await interaction.followUp({ 
            content: `✅ Your vote for "${pollData.options[optionIndex]}" has been recorded!`, 
            flags: MessageFlags.Ephemeral 
        });
    },

    // Handle poll ending
    poll_end: async (interaction, pollId) => {
        // Check permissions
        if (!await hasModPermissions(interaction.member)) {
            return await interaction.reply({ 
                content: 'You need mod/admin permissions to end polls.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        const pollData = activePolls.get(pollId);
        if (!pollData || !pollData.active) {
            return await interaction.reply({ 
                content: 'This poll is already ended.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        // End the poll
        pollData.active = false;
        await dbManager.endPoll(pollId);
        activePolls.delete(pollId);

        // Update the message
        const endedEmbed = createPollEmbed(pollData, true);
        endedEmbed.setTitle(`📊 ${pollData.question} (ENDED BY ${interaction.user.displayName})`);
        
        await interaction.update({ 
            embeds: [endedEmbed], 
            components: [] 
        });

        logger.info(`Poll ${pollId} ended by ${interaction.user.tag}`);
    }
};
