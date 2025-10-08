/**
 * Vote command for Top.GG integration
 * Users can vote for rewards and check their vote status
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, StringSelectMenuBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt } = require('../UTILS/common');
const logger = require('../UTILS/logger');
const { createEvents } = require('ics');
const moment = require('moment-timezone');
const SafeInteractionHandler = require('../UTILS/interactionHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Vote for the bot on Top.GG - Get rewards, check stats, and set reminders!'),

    async execute(interaction) {
        const userId = interaction.user.id;

        try {
            await this.showUnifiedVoteInterface(interaction, userId);
        } catch (error) {
            console.error('Vote command error:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing the vote command.',
                ephemeral: true
            });
        }
    },

    async showUnifiedVoteInterface(interaction, userId) {
        try {
            // Get user vote data from database
            const voteData = await dbManager.getUserVoteData(userId);
            
            // Calculate voting status
            const votingStatus = this.calculateVotingStatus(voteData);
            
            // Create main dashboard embed
            const dashboardEmbed = this.createDashboardEmbed(interaction, voteData, votingStatus);
            
            // Create navigation and action buttons
            const actionButtons = this.createActionButtons(votingStatus.canVoteNow);
            const navButtons = this.createNavigationButtons();
            
            await interaction.reply({
                embeds: [dashboardEmbed],
                components: [...actionButtons, navButtons]
            });
            const response = await interaction.fetchReply();

            // Set up collectors for all interactions
            await this.setupCollectors(response, interaction, voteData, votingStatus);

        } catch (error) {
            console.error('Error showing unified vote interface:', error);
            await interaction.reply({
                content: '❌ Failed to load voting interface.',
                ephemeral: true
            });
        }
    },

    calculateVotingStatus(voteData) {
        if (!voteData) {
            return {
                canVoteNow: true,
                isFirstTime: true,
                currentStreak: 0,
                isStreakValid: true,
                nextVoteTime: Date.now(),
                hoursSinceLastVote: 0,
                totalVotes: 0,
                totalEarned: 0
            };
        }

        const lastVoteTime = voteData.last_vote_ts || 0;
        const currentTime = Date.now();
        const nextVoteTime = lastVoteTime + (12 * 60 * 60 * 1000);
        const hoursSinceLastVote = (currentTime - lastVoteTime) / (1000 * 60 * 60);
        
        const canVoteNow = (lastVoteTime === 0) || (currentTime >= nextVoteTime);
        const storedStreak = voteData.vote_streak || 0;
        
        // Streak is broken if more than 18 hours since last vote (12h wait + 6h grace period)
        // This ensures streaks don't persist beyond when voting becomes available again
        const isStreakValid = hoursSinceLastVote <= 18 || lastVoteTime === 0;
        const currentStreak = isStreakValid ? storedStreak : 0;

        return {
            canVoteNow,
            isFirstTime: lastVoteTime === 0,
            currentStreak,
            isStreakValid,
            nextVoteTime,
            hoursSinceLastVote,
            totalVotes: voteData.total_votes || 0,
            totalEarned: voteData.total_earned || 0,
            lastVoteTime,
            storedStreak,
            canUseEarnmoney: voteData.can_use_earnmoney
        };
    },

    createDashboardEmbed(interaction, voteData, status) {
        const embed = new EmbedBuilder()
            .setTitle('🗳️ ATIVE Casino Bot - Voting Dashboard')
            .setDescription(`**${interaction.user.username}**, here's your complete voting overview!`)
            .setColor(status.canVoteNow ? 0x00D4FF : 0x64748b)
            .setThumbnail(interaction.client.user.displayAvatarURL())
            .setTimestamp();

        // Voting Status Section
        let statusText = '';
        if (status.isFirstTime) {
            statusText = '🆕 **Ready to vote for the first time!**\nStart your voting journey now!';
        } else if (status.canVoteNow) {
            statusText = '✅ **Vote Available Now!**\nClaim your rewards immediately!';
        } else {
            const hoursRemaining = 12 - status.hoursSinceLastVote;
            const hours = Math.floor(hoursRemaining);
            const minutes = Math.floor((hoursRemaining - hours) * 60);
            statusText = `⏳ **Next vote in ${hours}h ${minutes}m**\n<t:${Math.floor(status.nextVoteTime / 1000)}:R>`;
        }

        embed.addFields(
            {
                name: '🎯 Voting Status',
                value: statusText,
                inline: false
            },
            {
                name: '📊 Your Stats',
                value: `**${status.totalVotes}** votes • **${fmt(status.totalEarned)}** coins earned`,
                inline: true
            },
            {
                name: '🔥 Current Streak',
                value: this.getStreakDisplay(status.currentStreak, status.isStreakValid, status.storedStreak),
                inline: true
            },
            {
                name: '🎯 /earnmoney Status',
                value: this.getEarnmoneyStatus(status.totalVotes, status.currentStreak, status.canUseEarnmoney),
                inline: true
            },
            {
                name: '💰 Vote Rewards',
                value: '• **Bot Vote**: 75,000 coins + bonuses\n• **Rank.top Vote**: 3 free lottery tickets\n• **Server Vote**: 75,000 coins + bonuses\n• **Weekend Bonus**: +50% extra coins\n• **Streak Bonuses**: Up to 3M coins!',
                inline: false
            }
        );

        if (!status.isFirstTime) {
            embed.addFields({
                name: '📅 Last Vote',
                value: `<t:${Math.floor(status.lastVoteTime / 1000)}:R>`,
                inline: true
            });
        }

        embed.setFooter({ 
            text: '🎰 ATIVE Casino • Vote every 12 hours for maximum rewards!',
            iconURL: interaction.client.user.displayAvatarURL()
        });

        return embed;
    },

    createActionButtons(canVoteNow) {
        const actionRows = [];
        
        // First row: Voting buttons
        const voteRow = new ActionRowBuilder();
        
        if (canVoteNow) {
            voteRow.addComponents(
                new ButtonBuilder()
                    .setLabel('🤖 Vote Bot')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://top.gg/bot/1403236218900185088/vote')
                    .setEmoji('🗳️'),
                new ButtonBuilder()
                    .setLabel('🏆 Vote Server')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://top.gg/servers/1403244656845787167/vote')
                    .setEmoji('🤝'),
                new ButtonBuilder()
                    .setLabel('🎟️ Vote Rank.top')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://rank.top/bot/1403236218900185088/vote')
                    .setEmoji('🎫')
            );
        } else {
            voteRow.addComponents(
                new ButtonBuilder()
                    .setLabel('🤖 Vote Bot')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://top.gg/bot/1403236218900185088/vote')
                    .setEmoji('🗳️'),
                new ButtonBuilder()
                    .setLabel('🏆 Vote Server')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://top.gg/servers/1403244656845787167/vote')
                    .setEmoji('🤝'),
                new ButtonBuilder()
                    .setLabel('🎟️ Vote Rank.top')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://rank.top/bot/1403236218900185088/vote')
                    .setEmoji('🎫')
            );
        }
        
        actionRows.push(voteRow);
        
        // Second row: Action buttons
        const actionRow = new ActionRowBuilder();
        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId('vote_remind_me')
                .setLabel('Set Reminder')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⏰'),
            new ButtonBuilder()
                .setCustomId('vote_refresh')
                .setLabel('Refresh')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔄')
        );
        
        actionRows.push(actionRow);
        
        return actionRows;
    },

    createNavigationButtons() {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('vote_detailed_stats')
                    .setLabel('📊 Detailed Stats')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📈'),
                new ButtonBuilder()
                    .setCustomId('vote_rewards_info')
                    .setLabel('💰 Rewards Info')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('💎'),
                new ButtonBuilder()
                    .setCustomId('vote_leaderboard')
                    .setLabel('🏆 Leaderboard')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('👑')
            );
    },

    async setupCollectors(response, interaction, voteData, votingStatus) {
        const filter = i => i.user.id === interaction.user.id;
        const collector = response.createMessageComponentCollector({
            filter,
            time: 300000 // 5 minutes
        });

        collector.on('collect', async (i) => {
            try {
                // Check if interaction is still valid
                if (!SafeInteractionHandler.isValid(i)) {
                    logger.debug(`Skipping expired interaction: ${i.customId}`);
                    return;
                }

                switch (i.customId) {
                    case 'vote_remind_me':
                        await this.handleReminderRequest(i, votingStatus.nextVoteTime);
                        break;
                    case 'vote_refresh':
                        await this.handleRefresh(i);
                        break;
                    case 'vote_detailed_stats':
                        await this.showDetailedStats(i, voteData, votingStatus);
                        break;
                    case 'vote_rewards_info':
                        await this.showRewardsInfo(i);
                        break;
                    case 'vote_leaderboard':
                        await this.showLeaderboard(i);
                        break;
                    case 'back_to_dashboard':
                        await this.backToDashboard(i);
                        break;
                }
            } catch (error) {
                if (error.code === 10062) {
                    logger.debug(`Unknown interaction error: ${i.customId}`);
                    return;
                }
                console.error('Collector error:', error);
                await SafeInteractionHandler.safeReply(i, {
                    content: '❌ An error occurred while processing your request.',
                    ephemeral: true
                });
            }
        });

        collector.on('end', () => {
            // Disable buttons when collector expires
            const disabledComponents = response.components.map(row => {
                const newRow = ActionRowBuilder.from(row);
                newRow.components.forEach(component => {
                    if (component.data.style !== ButtonStyle.Link) {
                        component.setDisabled(true);
                    }
                });
                return newRow;
            });

            interaction.editReply({ components: disabledComponents }).catch(() => {});
        });
    },

    async handleRefresh(interaction) {
        const userId = interaction.user.id;
        const voteData = await dbManager.getUserVoteData(userId);
        const votingStatus = this.calculateVotingStatus(voteData);
        
        const dashboardEmbed = this.createDashboardEmbed(interaction, voteData, votingStatus);
        const actionButtons = this.createActionButtons(votingStatus.canVoteNow);
        const navButtons = this.createNavigationButtons();

        await interaction.update({
            embeds: [dashboardEmbed],
            components: [...actionButtons, navButtons]
        });
    },

    async showDetailedStats(interaction, voteData, status) {
        const statsEmbed = new EmbedBuilder()
            .setTitle('📊 Detailed Voting Statistics')
            .setDescription(`**${interaction.user.username}**'s complete voting history`)
            .addFields(
                {
                    name: '📈 Vote Metrics',
                    value: `**Total Votes:** ${status.totalVotes}\n**Total Earned:** ${fmt(status.totalEarned)} coins\n**Average per Vote:** ${status.totalVotes > 0 ? fmt(Math.round(status.totalEarned / status.totalVotes)) : '0'} coins`,
                    inline: true
                },
                {
                    name: '🔥 Streak Information',
                    value: `**Current Streak:** ${status.currentStreak} days\n**Streak Status:** ${status.isStreakValid ? '✅ Active' : '💔 Broken'}\n**Best Streak:** ${status.storedStreak} days`,
                    inline: true
                },
                {
                    name: '⏰ Timing Details',
                    value: status.isFirstTime ? 
                        '🆕 **First Time Voter**\nReady to start your journey!' :
                        `**Last Vote:** <t:${Math.floor(status.lastVoteTime / 1000)}:R>\n**Next Vote:** <t:${Math.floor(status.nextVoteTime / 1000)}:R>\n**Hours Since Last:** ${status.hoursSinceLastVote.toFixed(1)}h`,
                    inline: false
                },
                {
                    name: '🎯 Feature Access',
                    value: this.getEarnmoneyStatus(status.totalVotes, status.currentStreak, status.canUseEarnmoney),
                    inline: true
                },
                {
                    name: '💎 Streak Milestones',
                    value: `**7 days:** ${status.currentStreak >= 7 ? '✅' : '🔒'} +150K coins\n**30 days:** ${status.currentStreak >= 30 ? '✅' : '🔒'} +600K coins\n**100 days:** ${status.currentStreak >= 100 ? '✅' : '🔒'} +3M coins`,
                    inline: true
                }
            )
            .setColor(0x00D4FF)
            .setThumbnail(interaction.user.displayAvatarURL())
            .setTimestamp();

        const backButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('back_to_dashboard')
                    .setLabel('← Back to Dashboard')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🏠')
            );

        const voteButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('🤖 Vote Bot')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://top.gg/bot/1403236218900185088/vote'),
                new ButtonBuilder()
                    .setLabel('🏆 Vote Server')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://top.gg/servers/1403244656845787167/vote'),
                new ButtonBuilder()
                    .setLabel('🎟️ Vote Rank.top')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://rank.top/bot/1403236218900185088/vote')
            );

        await interaction.update({
            embeds: [statsEmbed],
            components: [backButton, voteButtons]
        });
    },

    async showRewardsInfo(interaction) {
        const rewardsEmbed = new EmbedBuilder()
            .setTitle('💰 Complete Rewards Guide')
            .setDescription('Everything you need to know about voting rewards!')
            .addFields(
                {
                    name: '🗳️ Base Voting Rewards',
                    value: '• **75,000 coins** per vote\n• Vote **every 12 hours**\n• Automatic reward delivery',
                    inline: false
                },
                {
                    name: '🎊 Weekend Bonus',
                    value: '• **+50% extra coins** on weekends\n• Friday 6PM - Monday 6AM\n• **112,500 coins** per weekend vote!',
                    inline: true
                },
                {
                    name: '🔥 Streak Bonuses',
                    value: '• **7 days:** +150,000 coins\n• **30 days:** +600,000 coins\n• **100 days:** +3,000,000 coins!',
                    inline: true
                },
                {
                    name: '🎯 Special Features',
                    value: '• **10+ votes:** Unlock `/earnmoney`\n• **Active streak required** for earnmoney\n• **Exclusive perks** for loyal voters',
                    inline: false
                },
                {
                    name: '⚠️ Important Notes',
                    value: '• Streak resets after 21 hours\n• Must vote every 12 hours to maintain\n• Rewards delivered automatically',
                    inline: true
                },
                {
                    name: '🏆 Pro Tips',
                    value: '• Set reminders to maintain streaks\n• Vote during weekends for bonus\n• Consistency is key for big rewards!',
                    inline: true
                }
            )
            .setColor(0xFFD700)
            .setThumbnail(interaction.client.user.displayAvatarURL())
            .setFooter({ text: '🎰 ATIVE Casino • Every vote counts!' })
            .setTimestamp();

        const backButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('back_to_dashboard')
                    .setLabel('← Back to Dashboard')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🏠')
            );

        const voteButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('🤖 Vote Bot')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://top.gg/bot/1403236218900185088/vote'),
                new ButtonBuilder()
                    .setLabel('🏆 Vote Server')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://top.gg/servers/1403244656845787167/vote'),
                new ButtonBuilder()
                    .setLabel('🎟️ Vote Rank.top')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://rank.top/bot/1403236218900185088/vote')
            );

        await interaction.update({
            embeds: [rewardsEmbed],
            components: [backButton, voteButtons]
        });
    },

    async showLeaderboard(interaction) {
        try {
            // Get top voters from database
            const topVoters = await dbManager.getTopVoters(10);
            
            let leaderboardText = '';
            if (topVoters && topVoters.length > 0) {
                for (let i = 0; i < topVoters.length; i++) {
                    const voter = topVoters[i];
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                    leaderboardText += `${medal} <@${voter.user_id}> - **${voter.total_votes}** votes (${voter.vote_streak} streak)\n`;
                }
            } else {
                leaderboardText = 'No voting data available yet. Be the first to vote!';
            }

            const leaderboardEmbed = new EmbedBuilder()
                .setTitle('🏆 Top Voters Leaderboard')
                .setDescription('Hall of Fame - Our most dedicated voters!')
                .addFields(
                    {
                        name: '👑 Leaderboard',
                        value: leaderboardText,
                        inline: false
                    },
                    {
                        name: '🎯 How to Climb',
                        value: '• Vote consistently every 12 hours\n• Maintain voting streaks\n• Spread the word about ATIVE Casino!',
                        inline: false
                    }
                )
                .setColor(0xFFD700)
                .setThumbnail(interaction.client.user.displayAvatarURL())
                .setFooter({ text: '🎰 ATIVE Casino • Compete for the top spot!' })
                .setTimestamp();

            const backButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('back_to_dashboard')
                        .setLabel('← Back to Dashboard')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🏠')
                );

            const voteButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('🤖 Vote Bot')
                        .setStyle(ButtonStyle.Link)
                        .setURL('https://top.gg/bot/1403236218900185088/vote'),
                    new ButtonBuilder()
                        .setLabel('🏆 Vote Server')
                        .setStyle(ButtonStyle.Link)
                        .setURL('https://top.gg/servers/1403244656845787167/vote'),
                    new ButtonBuilder()
                        .setLabel('🎟️ Vote Rank.top')
                        .setStyle(ButtonStyle.Link)
                        .setURL('https://rank.top/bot/1403236218900185088/vote')
                );

            await interaction.update({
                embeds: [leaderboardEmbed],
                components: [backButton, voteButtons]
            });

        } catch (error) {
            console.error('Error showing leaderboard:', error);
            await interaction.reply({
                content: '❌ Failed to load leaderboard.',
                ephemeral: true
            });
        }
    },

    async backToDashboard(interaction) {
        const userId = interaction.user.id;
        const voteData = await dbManager.getUserVoteData(userId);
        const votingStatus = this.calculateVotingStatus(voteData);
        
        const dashboardEmbed = this.createDashboardEmbed(interaction, voteData, votingStatus);
        const actionButtons = this.createActionButtons(votingStatus.canVoteNow);
        const navButtons = this.createNavigationButtons();

        await interaction.update({
            embeds: [dashboardEmbed],
            components: [...actionButtons, navButtons]
        });
    },


    /**
     * Get formatted earnmoney status message
     */
    getEarnmoneyStatus(totalVotes, currentStreak, canUseEarnmoney) {
        if (totalVotes < 10) {
            return `🔒 **Locked**\n${totalVotes}/10 votes needed`;
        } else if (currentStreak === 0) {
            return `❌ **Lost Streak**\nHave ${totalVotes} votes but streak broken`;
        } else if (canUseEarnmoney) {
            return `✅ **Unlocked**\n${totalVotes} votes, ${currentStreak} day streak`;
        } else {
            return `⏳ **Processing**\nShould unlock on next vote`;
        }
    },

    /**
     * Get formatted streak display
     */
    getStreakDisplay(currentStreak, isStreakValid, storedStreak) {
        if (!isStreakValid && storedStreak > 0) {
            return `💔 **Broken**\nWas ${storedStreak} day${storedStreak !== 1 ? 's' : ''}`;
        } else if (currentStreak === 0) {
            return `🆕 **No streak yet**\nStart voting daily!`;
        } else {
            return `🔥 **${currentStreak} day${currentStreak !== 1 ? 's' : ''}**\nKeep it up!`;
        }
    },

    /**
     * Get next vote time display
     */
    getNextVoteDisplay(canVoteNow, nextVoteTime, lastVoteTime, hoursSinceLastVote) {
        if (lastVoteTime === 0) {
            return '🆕 **Ready Now!**\nFirst time voting';
        } else if (canVoteNow) {
            return '✅ **Available Now!**\nCan vote for rewards';
        } else {
            const hoursRemaining = 12 - hoursSinceLastVote;
            const hours = Math.floor(hoursRemaining);
            const minutes = Math.floor((hoursRemaining - hours) * 60);
            return `⏳ **In ${hours}h ${minutes}m**\n<t:${Math.floor(nextVoteTime / 1000)}:R>`;
        }
    },

    /**
     * Handle reminder request from user
     */
    async handleReminderRequest(interaction, nextVoteTime = null) {
        // Calculate next vote time if not provided
        if (!nextVoteTime) {
            nextVoteTime = Date.now() + (12 * 60 * 60 * 1000); // 12 hours from now
        }

        // Create select menu for reminder type
        const reminderMenu = new StringSelectMenuBuilder()
            .setCustomId('reminder_type')
            .setPlaceholder('Choose reminder type')
            .addOptions([
                {
                    label: '📅 Download ICS Calendar File',
                    description: 'Works with Apple Calendar, Outlook, etc.',
                    value: 'ics',
                    emoji: '📁'
                },
                {
                    label: '📱 Add to Google Calendar',
                    description: 'Direct link to add to Google Calendar',
                    value: 'google',
                    emoji: '🔗'
                },
                {
                    label: '📧 Discord DM Reminder',
                    description: 'Get a DM when it\'s time to vote',
                    value: 'dm',
                    emoji: '💬'
                },
                {
                    label: '🔔 All Reminders',
                    description: 'Get both calendar file and Google link',
                    value: 'all',
                    emoji: '✨'
                }
            ]);

        const menuRow = new ActionRowBuilder().addComponents(reminderMenu);

        const reminderEmbed = new EmbedBuilder()
            .setTitle('⏰ Set Vote Reminder')
            .setDescription('Choose how you\'d like to be reminded to vote!')
            .addFields({
                name: '📅 Next Vote Time',
                value: `<t:${Math.floor(nextVoteTime / 1000)}:F>`,
                inline: false
            })
            .setColor(0x00D4FF)
            .setFooter({ text: 'Select an option below' });

        await interaction.reply({
            embeds: [reminderEmbed],
            components: [menuRow],
            ephemeral: true
        });

        // Collect the selection
        const filter = i => i.customId === 'reminder_type' && i.user.id === interaction.user.id;
        const menuCollector = interaction.channel.createMessageComponentCollector({ filter, time: 30000, max: 1 });

        menuCollector.on('collect', async (menuInteraction) => {
            try {
                // Check if interaction is still valid
                if (!SafeInteractionHandler.isValid(menuInteraction)) {
                    logger.debug(`Skipping expired menu interaction: ${menuInteraction.customId}`);
                    return;
                }
                
                const reminderType = menuInteraction.values[0];
                await this.createReminder(menuInteraction, reminderType, nextVoteTime);
            } catch (error) {
                if (error.code === 10062) {
                    logger.debug(`Unknown interaction error in reminder: ${menuInteraction.customId}`);
                    return;
                }
                logger.error('Error handling vote reminder:', error);
            }
        });

        menuCollector.on('end', collected => {
            if (collected.size === 0) {
                interaction.editReply({
                    content: '⏱️ Reminder selection timed out.',
                    embeds: [],
                    components: []
                }).catch(() => {});
            }
        });
    },

    /**
     * Create reminder based on user selection
     */
    async createReminder(interaction, type, nextVoteTime) {
        const voteDate = new Date(nextVoteTime);
        const components = [];
        const embeds = [];
        const files = [];

        if (type === 'ics' || type === 'all') {
            // Generate ICS file
            const icsFile = await this.generateICSFile(voteDate);
            if (icsFile) {
                files.push(icsFile);
            }
        }

        if (type === 'google' || type === 'all') {
            // Generate Google Calendar URL
            const googleUrl = this.generateGoogleCalendarURL(voteDate);
            const googleButton = new ButtonBuilder()
                .setLabel('📅 Add to Google Calendar')
                .setStyle(ButtonStyle.Link)
                .setURL(googleUrl)
                .setEmoji('📱');
            
            if (components.length === 0) {
                components.push(new ActionRowBuilder());
            }
            components[0].addComponents(googleButton);
        }

        if (type === 'dm') {
            // Set up DM reminder (would need a database to persist)
            embeds.push(new EmbedBuilder()
                .setTitle('💬 DM Reminder Set!')
                .setDescription(`I'll try to DM you when it's time to vote!\n\n**Note:** Make sure your DMs are open from server members.`)
                .addFields({
                    name: '⏰ Reminder Time',
                    value: `<t:${Math.floor(nextVoteTime / 1000)}:F>`
                })
                .setColor(0x00FF00)
                .setFooter({ text: 'This feature requires DMs to be enabled' }));
            
            // Store reminder in database (implementation would go here)
            this.scheduleDMReminder(interaction.user.id, nextVoteTime);
        }

        // Create success embed
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Vote Reminder Created!')
            .setDescription('Your reminder has been set up successfully.')
            .addFields(
                {
                    name: '📅 Vote Time',
                    value: `<t:${Math.floor(nextVoteTime / 1000)}:F>`,
                    inline: true
                },
                {
                    name: '⏰ Time Until Vote',
                    value: `<t:${Math.floor(nextVoteTime / 1000)}:R>`,
                    inline: true
                }
            )
            .setColor(0x00FF00)
            .setFooter({ text: '🎰 ATIVE Casino • Vote every 12 hours!' });

        if (embeds.length === 0) {
            embeds.push(successEmbed);
        }

        // Always add vote buttons
        const voteButtons = [
            new ButtonBuilder()
                .setLabel('🤖 Vote Bot')
                .setStyle(ButtonStyle.Link)
                .setURL('https://top.gg/bot/1403236218900185088/vote'),
            new ButtonBuilder()
                .setLabel('🏆 Vote Server')
                .setStyle(ButtonStyle.Link)
                .setURL('https://top.gg/servers/1403244656845787167/vote'),
            new ButtonBuilder()
                .setLabel('🎟️ Vote Rank.top')
                .setStyle(ButtonStyle.Link)
                .setURL('https://rank.top/bot/1403236218900185088/vote')
        ];
        
        // Add a new row for vote buttons
        const voteRow = new ActionRowBuilder();
        voteRow.addComponents(...voteButtons);
        components.push(voteRow);

        await interaction.update({
            embeds: embeds,
            components: components,
            files: files
        });
    },

    /**
     * Generate ICS calendar file for vote reminder
     */
    async generateICSFile(voteDate) {
        try {
            // Create recurring event (every 12 hours)
            const event = {
                start: [
                    voteDate.getFullYear(),
                    voteDate.getMonth() + 1,
                    voteDate.getDate(),
                    voteDate.getHours(),
                    voteDate.getMinutes()
                ],
                duration: { minutes: 15 },
                title: `🗳️ Vote for ATIVE Casino Bot`,
                description: `Time to vote for ATIVE Casino Bot on Top.GG!\n\n` +
                           `Rewards:\n` +
                           `• 75,000 coins per vote\n` +
                           `• Weekend bonus: +50% extra\n` +
                           `• Streak bonuses up to 3M coins!\n\n` +
                           `Vote here: https://top.gg/bot/1403236218900185088/vote`,
                url: 'https://top.gg/bot/1403236218900185088/vote',
                location: 'Discord - ATIVE Casino Bot',
                alarms: [
                    {
                        action: 'display',
                        description: 'Time to vote for ATIVE Casino Bot!',
                        trigger: { minutes: 5 } // 5 minutes before
                    }
                ],
                recurrenceRule: 'FREQ=HOURLY;INTERVAL=12' // Every 12 hours
            };

            const { error, value } = createEvents([event]);
            
            if (error) {
                logger.error('Error creating ICS file:', error);
                return null;
            }

            // Create attachment
            const buffer = Buffer.from(value, 'utf-8');
            const attachment = new AttachmentBuilder(buffer, {
                name: 'ative_vote_reminder.ics',
                description: 'ATIVE Casino Bot vote reminder calendar file'
            });

            return attachment;
        } catch (error) {
            logger.error('Error generating ICS file:', error);
            return null;
        }
    },

    /**
     * Generate Google Calendar URL
     */
    generateGoogleCalendarURL(voteDate) {
        const startTime = moment(voteDate).format('YYYYMMDDTHHmmss');
        const endTime = moment(voteDate).add(15, 'minutes').format('YYYYMMDDTHHmmss');
        
        const eventDetails = {
            text: '🗳️ Vote for ATIVE Casino Bot',
            dates: `${startTime}/${endTime}`,
            details: `Time to vote for ATIVE Casino Bot on Top.GG!\n\n` +
                    `Rewards:\n` +
                    `• 75,000 coins per vote\n` +
                    `• Weekend bonus: +50% extra\n` +
                    `• Streak bonuses up to 3M coins!\n\n` +
                    `Vote here: https://top.gg/bot/1403236218900185088/vote`,
            location: 'Discord - ATIVE Casino Bot'
        };

        // Build Google Calendar URL
        const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
        const params = new URLSearchParams({
            text: eventDetails.text,
            dates: eventDetails.dates,
            details: eventDetails.details,
            location: eventDetails.location,
            recur: 'RRULE:FREQ=HOURLY;INTERVAL=12' // Recurring every 12 hours
        });

        return `${baseUrl}&${params.toString()}`;
    },

    /**
     * Schedule a DM reminder (stub - would need persistent storage)
     */
    async scheduleDMReminder(userId, reminderTime) {
        // This would typically store the reminder in a database
        // and have a separate process check and send DMs
        logger.info(`DM reminder scheduled for user ${userId} at ${new Date(reminderTime).toISOString()}`);
        
        // For demonstration, we'll set a timeout if the reminder is within 24 hours
        const timeUntilReminder = reminderTime - Date.now();
        if (timeUntilReminder > 0 && timeUntilReminder < 24 * 60 * 60 * 1000) {
            setTimeout(async () => {
                try {
                    const client = require('../index').client; // Would need proper client reference
                    const user = await client.users.fetch(userId);
                    
                    const reminderEmbed = new EmbedBuilder()
                        .setTitle('🗳️ Time to Vote!')
                        .setDescription('Your 12-hour vote cooldown is up! Time to vote for ATIVE Casino Bot and earn rewards!')
                        .addFields(
                            {
                                name: '💰 Rewards',
                                value: '75,000+ coins await!',
                                inline: true
                            },
                            {
                                name: '🔗 Vote Link',
                                value: '[Click here to vote](https://top.gg/bot/1403236218900185088/vote)',
                                inline: true
                            }
                        )
                        .setColor(0x00D4FF)
                        .setTimestamp();

                    await user.send({ embeds: [reminderEmbed] });
                } catch (error) {
                    logger.error(`Failed to send DM reminder to ${userId}:`, error);
                }
            }, timeUntilReminder);
        }
    }
};
