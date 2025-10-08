/**
 * Top.GG Integration for vote rewards
 * Handles webhooks and API calls for voting rewards
 */

const { EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const { fmt, sendLogMessage } = require('./common');
const logger = require('./logger');

class TopGGManager {
    constructor(client) {
        this.client = client;
        this.topggToken = process.env.TOPGG_BOT_ID;
        this.webhookSecret = process.env.TOPGG_WEBHOOK_SECRET || 'topgg-webhook-secret';
        this.botId = process.env.CLIENT_ID;
        
        // Rank.Top configuration (voting only, autoposter disabled)
        this.ranktopWebhookSecret = 'AtiveTopVotes2025'; // Hardcoded auth token for rank.top webhook
        
        // Voting rewards configuration by type
        this.voteRewards = {
            bot: {
                coins: 75000, // 75K coins per vote (3x increase)
                bonusMultiplier: 1.5, // Weekend bonus
                streakBonuses: {
                    7: 150000,   // 7 day streak: 150K bonus (3x increase)
                    30: 600000,  // 30 day streak: 600K bonus (3x increase)
                    100: 3000000 // 100 day streak: 3M bonus (3x increase)
                }
            },
            server: {
                coins: 75000, // Same as bot vote (3x increase)
                bonusMultiplier: 1.5, // Weekend bonus
                streakBonuses: {
                    7: 150000,   // 7 day streak: 150K bonus (3x increase)
                    30: 600000,  // 30 day streak: 600K bonus (3x increase)
                    100: 3000000 // 100 day streak: 3M bonus (3x increase)
                }
            },
            ranktop: {
                coins: 0, // No coins for rank.top votes
                lotteryTickets: 3, // 3 free lottery tickets per vote (3x increase)
                bonusMultiplier: 1.0, // No weekend bonus for lottery tickets
                streakBonuses: {} // No streak bonuses for lottery-only rewards
            }
        };
    }

    /**
     * Handle Top.GG webhook vote notification
     */
    async handleVoteWebhook(req, res) {
        try {
            logger.debug('Received Top.GG webhook request');
            logger.debug('Headers:', req.headers);
            logger.debug('Body:', req.body);

            // Verify webhook signature from Authorization header
            const authHeader = req.headers['authorization'];
            if (!this.verifyWebhookSignature(req.body, authHeader)) {
                logger.warn('Invalid Top.GG webhook authorization');
                logger.warn(`Expected format: Bearer ${this.webhookSecret}`);
                logger.warn(`Received: ${authHeader}`);
                return res.status(401).send('Unauthorized');
            }

            const voteData = req.body;
            const userId = voteData.user;
            
            if (!userId) {
                logger.error('No user ID in vote data:', voteData);
                return res.status(400).send('Bad Request - Missing user ID');
            }
            
            logger.info(`✅ Top.GG bot vote received from user: ${userId}`);

            // Process the vote reward with 'bot' type (default)
            await this.processVoteReward(userId, voteData, 'bot');
            
            logger.info(`✅ Successfully processed bot vote for user: ${userId}`);
            res.status(200).send('OK');
        } catch (error) {
            logger.error(`❌ Top.GG webhook error: ${error.message}`);
            logger.error('Stack trace:', error.stack);
            res.status(500).send('Internal Server Error');
        }
    }

    /**
     * Process vote reward for user
     */
    async processVoteReward(userId, voteData, voteType = 'bot') {
        try {
            // Handle rank.top votes separately (lottery tickets only, no streaks)
            if (voteType === 'ranktop') {
                const rewardConfig = this.voteRewards.ranktop;
                let lotteryTicketsGiven = 0;
                
                if (rewardConfig.lotteryTickets > 0) {
                    try {
                        // Give free lottery tickets using designated server ID
                        const lotteryGuildId = process.env.DESIGNATED_SERVER_ID || '1403244656845787167';
                        lotteryTicketsGiven = await this.giveFreeLotteryTickets(userId, lotteryGuildId, rewardConfig.lotteryTickets);
                        logger.info(`🎫 Gave ${lotteryTicketsGiven} free lottery tickets to user ${userId} for rank.top vote (requested: ${rewardConfig.lotteryTickets})`);
                    } catch (lotteryError) {
                        logger.error(`Failed to give lottery tickets to user ${userId}: ${lotteryError.message}`);
                    }
                }

                // Send notification for lottery tickets (always send notification, even if 0 tickets)
                try {
                    logger.info(`🎫 Sending Rank.Top notification to user ${userId} - ${lotteryTicketsGiven} tickets given`);
                    const user = await this.client.users.fetch(userId);
                    await this.sendVoteRewardNotification(user, 0, 0, 0, false, false, 0, voteType, lotteryTicketsGiven);
                    logger.info(`✅ Rank.Top notification sent successfully to user ${userId}`);
                } catch (userError) {
                    logger.error(`Failed to fetch user ${userId} for rank.top vote notification: ${userError.message}`);
                    try {
                        await this.sendVoteRewardNotification({ id: userId, username: 'Unknown User', displayAvatarURL: () => null }, 0, 0, 0, false, false, 0, voteType, lotteryTicketsGiven);
                        logger.info(`✅ Rank.Top fallback notification sent to user ${userId}`);
                    } catch (fallbackError) {
                        logger.error(`Failed to send Rank.Top fallback notification: ${fallbackError.message}`);
                    }
                }

                logger.info(`Rank.top vote processed: User ${userId} received ${lotteryTicketsGiven} lottery tickets`);
                return;
            }

            // Handle Top.GG votes (coins + streaks)
            const voteInfo = await dbManager.databaseAdapter.getUserVoteData(userId);
            const currentTime = Date.now();
            
            // Get rewards configuration for this vote type
            const rewardConfig = this.voteRewards[voteType] || this.voteRewards.bot;
            
            // Calculate reward amount
            let rewardAmount = rewardConfig.coins || 0;
            
            // Weekend bonus (Saturday/Sunday)
            const isWeekend = [0, 6].includes(new Date().getDay());
            if (isWeekend && rewardConfig.bonusMultiplier) {
                rewardAmount = Math.floor(rewardAmount * rewardConfig.bonusMultiplier);
            }

            // Calculate vote streak first
            const lastVoteTime = voteInfo?.last_vote_ts || 0;
            const hoursSinceLastVote = (currentTime - lastVoteTime) / (1000 * 60 * 60);
            // Streak continues if voting within reasonable window (11-18 hours)
            // 11h minimum prevents spam voting, 18h gives 6h grace period for streak continuation
            const isValidStreak = hoursSinceLastVote >= 11 && hoursSinceLastVote <= 18;
            
            let currentStreak;
            let streakBonus = 0;
            
            if (voteInfo && (isValidStreak || hoursSinceLastVote < 11)) {
                // Continue streak if:
                // 1. Valid streak timing (11-18 hours), OR
                // 2. Recent vote (less than 11 hours) - this handles restored streaks
                if (hoursSinceLastVote < 11) {
                    // Recent vote - likely a restored streak, continue the existing streak
                    currentStreak = voteInfo.vote_streak || 1;
                } else {
                    // Normal voting window - increment streak
                    currentStreak = (voteInfo.vote_streak || 0) + 1;
                }
                
                // Check for streak bonuses
                if (rewardConfig.streakBonuses && rewardConfig.streakBonuses[currentStreak]) {
                    streakBonus = rewardConfig.streakBonuses[currentStreak];
                    rewardAmount += streakBonus;
                }
            } else {
                currentStreak = 1; // Reset or start streak
            }

            const newVoteCount = (voteInfo?.total_votes || 0) + 1;
            
            // Update vote data
            const newVoteData = {
                total_votes: newVoteCount,
                last_vote_ts: currentTime,
                total_earned: (voteInfo?.total_earned || 0) + rewardAmount,
                vote_streak: currentStreak,
                // /earnmoney unlock: 10+ total votes AND current streak > 0 (not broken)
                can_use_earnmoney: newVoteCount >= 10 && currentStreak > 0
            };

            // Save vote data and add coins
            await dbManager.databaseAdapter.updateUserVoteData(userId, null, newVoteData);
            if (rewardAmount > 0) {
                await dbManager.adjustWallet(userId, null, rewardAmount);
            }

            // Get user for notification
            try {
                const user = await this.client.users.fetch(userId);
                
                // Send reward notification
                await this.sendVoteRewardNotification(user, rewardAmount, streakBonus, newVoteData.vote_streak, isWeekend, newVoteData.can_use_earnmoney, newVoteData.total_votes, voteType, 0);
            } catch (userError) {
                logger.error(`Failed to fetch user ${userId} for vote notification: ${userError.message}`);
                // Try to send notification without user object
                await this.sendVoteRewardNotification({ id: userId, username: 'Unknown User', displayAvatarURL: () => null }, rewardAmount, streakBonus, newVoteData.vote_streak, isWeekend, newVoteData.can_use_earnmoney, newVoteData.total_votes, voteType, 0);
            }

            logger.info(`Vote reward processed: User ${userId} received ${fmt(rewardAmount)} coins`);

        } catch (error) {
            logger.error(`Failed to process vote reward: ${error.message}`);
        }
    }

    /**
     * Send vote reward notification to user
     */
    async sendVoteRewardNotification(user, rewardAmount, streakBonus, streak, isWeekend, canUseEarnmoney, totalVotes, voteType = 'bot', lotteryTicketsGiven = 0) {
        try {
            // Set title and description based on vote type
            let title, description;
            switch (voteType) {
                case 'server':
                    title = '🏆 Thank You for Voting for Our Server!';
                    description = `**${user.username}**, thanks for voting for our server on Top.GG!`;
                    break;
                case 'ranktop':
                    title = '🎫 Thank You for Voting on Rank.Top!';
                    description = `**${user.username}**, thanks for voting on Rank.Top!`;
                    break;
                default:
                    title = '🗳️ Thank You for Voting!';
                    description = `**${user.username}**, thanks for voting on Top.GG!`;
            }

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor(voteType === 'ranktop' ? 0xFFD700 : 0x00D4FF);

            // Add reward fields based on vote type
            if (rewardAmount > 0) {
                embed.addFields({
                    name: '💰 Reward Earned',
                    value: `${fmt(rewardAmount)} coins`,
                    inline: true
                });
            }

            // Always show lottery ticket information for Rank.Top votes
            if (voteType === 'ranktop') {
                if (lotteryTicketsGiven > 0) {
                    embed.addFields({
                        name: '🎫 Lottery Tickets',
                        value: `${lotteryTicketsGiven} free ticket${lotteryTicketsGiven > 1 ? 's' : ''} added!`,
                        inline: true
                    });
                } else {
                    embed.addFields({
                        name: '🎫 Lottery Tickets',
                        value: `Weekly limit reached (10/10 tickets)\nResets every Monday at 00:00 UTC\nThanks for voting!`,
                        inline: true
                    });
                }
            } else if (lotteryTicketsGiven > 0) {
                // For non-ranktop votes, only show if tickets were given
                embed.addFields({
                    name: '🎫 Lottery Tickets',
                    value: `${lotteryTicketsGiven} free ticket${lotteryTicketsGiven > 1 ? 's' : ''} added!`,
                    inline: true
                });
            }

            // Only show streak and next vote for Top.GG votes, not rank.top
            if (voteType !== 'ranktop') {
                embed.addFields(
                    {
                        name: '🔥 Vote Streak',
                        value: `${streak} day${streak !== 1 ? 's' : ''}`,
                        inline: true
                    },
                    {
                        name: '⏰ Next Vote',
                        value: '<t:' + Math.floor((Date.now() + 12 * 60 * 60 * 1000) / 1000) + ':R>',
                        inline: true
                    }
                );
            }

            embed.setThumbnail(user.displayAvatarURL())
                .setFooter({ 
                    text: '🎰 ATIVE Casino • Vote every 12 hours for rewards!',
                    iconURL: this.client && this.client.user ? this.client.user.displayAvatarURL() : null
                })
                .setTimestamp();

            // Only show bonuses and earnmoney status for Top.GG votes, not rank.top
            if (voteType !== 'ranktop') {
                if (isWeekend) {
                    embed.addFields({
                        name: '🎉 Weekend Bonus!',
                        value: `+50% extra coins (${fmt(this.voteRewards.bot.coins * 0.5)})`,
                        inline: false
                    });
                }

                if (streakBonus > 0) {
                    embed.addFields({
                        name: '🏆 Streak Bonus!',
                        value: `${fmt(streakBonus)} bonus coins for ${streak} day streak!`,
                        inline: false
                    });
                }

                // Show /earnmoney status
                if (canUseEarnmoney) {
                    embed.addFields({
                        name: '💰 /earnmoney Unlocked!',
                        value: `You can use \`/earnmoney\` command! (${totalVotes} total votes, ${streak} day streak)`,
                        inline: false
                    });
                } else if (totalVotes < 10) {
                    embed.addFields({
                        name: '🎯 Progress to /earnmoney',
                        value: `${totalVotes}/10 votes needed to unlock \`/earnmoney\` command`,
                        inline: false
                    });
                } else if (streak === 0) {
                    embed.addFields({
                        name: '⚠️ /earnmoney Locked',
                        value: `You have ${totalVotes} votes but lost your streak! Keep voting daily to unlock \`/earnmoney\``,
                        inline: false
                    });
                }
            }

            // Try to DM user first
            let dmSent = false;
            try {
                logger.debug(`📨 Attempting to DM user ${user.username || user.id} for ${voteType} vote`);
                await user.send({ embeds: [embed] });
                dmSent = true;
                logger.info(`✅ Vote confirmation DM sent to ${user.username || user.id} for ${voteType} vote`);
            } catch (dmError) {
                // Common reason: user has DMs disabled - log as debug instead of error
                if (dmError.code === 50007 || dmError.message.includes('Cannot send messages to this user')) {
                    logger.debug(`🔒 User ${user.username || user.id} has DMs disabled - will use log channel instead`);
                } else {
                    logger.warn(`❌ Failed to DM user ${user.username || user.id}: ${dmError.message}`);
                }
            }

            // Always send to vote log channel as backup and for logging
            let logChannelSent = false;
            try {
                const logChannelId = process.env.LOG_CHANNEL_ID || process.env.VOTE_LOG_CHANNEL_ID || '1405096821512212521';
                logger.debug(`📍 Attempting to send notification to log channel: ${logChannelId}`);
                if (logChannelId) {
                    const logChannel = await this.client.channels.fetch(logChannelId);
                    if (logChannel && logChannel.isTextBased()) {
                        const logEmbed = new EmbedBuilder(embed);
                        if (!dmSent) {
                            logEmbed.setDescription(`**${user.username || user.id}** received vote rewards! 🔒 *User has DMs disabled*\n\n${embed.description || 'Vote reward notification'}`);
                        } else {
                            logEmbed.setDescription(embed.description || `**${user.username || user.id}** received vote rewards!`);
                        }
                        await logChannel.send({ embeds: [logEmbed] });
                        logChannelSent = true;
                        logger.debug(`📋 Vote notification logged to channel ${logChannel.name}`);
                    } else {
                        logger.warn(`❌ Log channel ${logChannelId} not found or not text-based`);
                    }
                } else {
                    logger.debug(`⚠️ No LOG_CHANNEL_ID configured - vote notifications will only be sent via DM`);
                }
            } catch (channelError) {
                logger.warn(`❌ Failed to send vote notification to log channel: ${channelError.message}`);
            }

            // Only warn if both DM and log channel failed
            if (!dmSent && !logChannelSent) {
                logger.error(`⚠️ Vote confirmation could not be delivered to user ${user.username || user.id} - both DM and log channel failed`);
            } else if (!dmSent && logChannelSent) {
                logger.info(`✅ Vote confirmation delivered via log channel for user ${user.username || user.id} (DMs disabled)`);
            } else if (dmSent) {
                logger.info(`✅ Vote confirmation delivered via DM to user ${user.username || user.id}`);
            }

        } catch (error) {
            logger.error(`Failed to send vote notification: ${error.message}`);
        }
    }

    /**
     * Check if user can vote (API call to Top.GG)
     */
    async checkUserVoteStatus(userId) {
        try {
            if (!this.topggToken) {
                return { hasVoted: false, canVote: true };
            }

            const response = await fetch(`https://top.gg/api/bots/${this.botId}/check?userId=${userId}`, {
                headers: {
                    'Authorization': `Bearer ${this.topggToken}`
                }
            });

            if (!response.ok) {
                logger.warn(`Top.GG API error: ${response.status}`);
                return { hasVoted: false, canVote: true };
            }

            const data = await response.json();
            return {
                hasVoted: data.voted === 1,
                canVote: data.voted === 0
            };

        } catch (error) {
            logger.error(`Top.GG API check error: ${error.message}`);
            return { hasVoted: false, canVote: true };
        }
    }

    /**
     * Get vote leaderboard
     */
    async getVoteLeaderboard(limit = 10) {
        try {
            // This would need to be implemented in the database adapter
            // For now, return empty array
            return [];
        } catch (error) {
            logger.error(`Failed to get vote leaderboard: ${error.message}`);
            return [];
        }
    }

    /**
     * Handle Rank.Top webhook vote notification
     */
    async handleRanktopVoteWebhook(req, res) {
        try {
            logger.info('✅ Received Rank.Top webhook request');

            const signature = req.headers['x-signature'] || req.headers['authorization'];
            const voteData = req.body || {};
            
            // Enhanced logging for debugging real webhooks from rank.top
            logger.info('Rank.Top webhook headers:', {
                'user-agent': req.headers['user-agent'],
                'x-signature': req.headers['x-signature'],
                'authorization': req.headers['authorization'],
                'content-type': req.headers['content-type'],
                'x-forwarded-for': req.headers['x-forwarded-for']
            });
            logger.info('Rank.Top webhook data received:', JSON.stringify(voteData));
            
            // Handle test webhooks - if no user ID or empty body, it's a test
            if (!voteData.user || Object.keys(voteData).length === 0) {
                logger.info('✅ Rank.Top test webhook detected - responding with success');
                return res.status(200).json({ 
                    success: true, 
                    message: 'Webhook successfully received',
                    test: true 
                });
            }
            
            // For production votes, verify signature
            if (!this.verifyRanktopWebhookSignature(req.body, signature)) {
                logger.warn('Invalid Rank.Top webhook signature');
                return res.status(401).json({ success: false, error: 'Invalid signature' });
            }

            const userId = voteData.user;
            
            logger.info(`✅ Rank.Top vote received from user: ${userId}`);

            // Process the vote reward with 'ranktop' type
            await this.processVoteReward(userId, voteData, 'ranktop');
            
            logger.info(`✅ Successfully processed Rank.Top vote for user: ${userId}`);
            res.status(200).json({ success: true, message: 'Vote processed successfully' });
        } catch (error) {
            logger.error(`❌ Rank.Top webhook error: ${error.message}`);
            logger.error('Stack trace:', error.stack);
            res.status(500).send('Internal Server Error');
        }
    }

    // Server voting uses API polling instead of webhooks (see ServerVotePoller.js)

    /**
     * Give free lottery tickets to user
     */
    async giveFreeLotteryTickets(userId, guildId, ticketCount) {
        try {
            // Validate required parameters
            if (!userId) {
                throw new Error('User ID is required');
            }
            if (!guildId) {
                throw new Error('Guild ID is required for lottery tickets');
            }
            
            // Ensure user exists in database
            await dbManager.ensureUser(userId, 'Rank.top Voter');
            
            // Get current week start for lottery system
            const currentWeekStart = dbManager.databaseAdapter.getCurrentWeekStart();
            
            // Check current ticket count to enforce 10 ticket limit
            const currentTickets = await dbManager.databaseAdapter.getUserLotteryTickets(userId, guildId, 1); // Tier 1
            
            // Calculate how many tickets can actually be given
            const maxTickets = 10;
            const remainingSlots = maxTickets - currentTickets;
            const actualTicketsToGive = Math.min(ticketCount, remainingSlots);
            
            if (actualTicketsToGive <= 0) {
                logger.info(`🎫 User ${userId} already has maximum lottery tickets (${currentTickets}/10) - no tickets given`);
                return 0;
            }

            // Add the lottery tickets directly to database
            const connection = await dbManager.databaseAdapter.pool.getConnection();
            try {
                await connection.beginTransaction();
                
                // Insert lottery tickets using the same structure as purchaseLotteryTickets
                await connection.execute(
                    `INSERT INTO lottery_tickets (user_id, guild_id, ticket_count, purchase_cost, week_start, tier, purchased_at, awarded_manually, award_reason) 
                     VALUES (?, ?, ?, 0, ?, 1, NOW(), TRUE, 'Rank.top vote reward')
                     ON DUPLICATE KEY UPDATE 
                     ticket_count = ticket_count + ?,
                     awarded_manually = TRUE`,
                    [userId, guildId, actualTicketsToGive, currentWeekStart, actualTicketsToGive]
                );

                // Update lottery info prize pool (using current_week_start column name)
                await connection.execute(
                    `INSERT INTO lottery_info (guild_id, total_tickets, current_week_start, tier) 
                     VALUES (?, ?, ?, 1)
                     ON DUPLICATE KEY UPDATE total_tickets = total_tickets + ?`,
                    [guildId, actualTicketsToGive, currentWeekStart, actualTicketsToGive]
                );

                await connection.commit();
                logger.info(`Successfully gave ${actualTicketsToGive} free lottery tickets to user ${userId}`);
                
                return actualTicketsToGive;
            } catch (dbError) {
                await connection.rollback();
                throw dbError;
            } finally {
                connection.release();
            }
        } catch (error) {
            logger.error(`Failed to give free lottery tickets to user ${userId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Verify webhook signature from Top.GG
     */
    verifyWebhookSignature(body, signature) {
        if (!signature || !this.webhookSecret) {
            return false;
        }
        
        // Top.GG sends signature as Authorization header
        // Format: "Bearer your-webhook-secret"
        const expectedAuth = `Bearer ${this.webhookSecret}`;
        return signature === expectedAuth;
    }

    /**
     * Verify Rank.Top webhook signature
     */
    verifyRanktopWebhookSignature(body, signature) {
        // If no signature provided, allow it (for test webhooks)
        if (!signature) {
            return true;
        }
        
        if (!this.ranktopWebhookSecret) {
            logger.warn('No Rank.Top webhook secret configured');
            return false;
        }
        
        const crypto = require('crypto');
        const computedSignature = crypto.createHmac('sha256', this.ranktopWebhookSecret)
            .update(JSON.stringify(body))
            .digest('hex');
        
        // Check if signature matches
        const isValid = signature === computedSignature || 
                       signature === `Bearer ${this.ranktopWebhookSecret}` ||
                       signature === this.ranktopWebhookSecret;
        
        if (!isValid) {
            logger.debug(`Signature mismatch. Expected: ${computedSignature}, Got: ${signature}`);
        }
        
        return isValid;
    }
}

module.exports = TopGGManager;