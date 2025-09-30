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
        
        // Rank.top configuration
        this.ranktopWebhookSecret = process.env.RANKTOP_WEBHOOK_SECRET || 'ranktop-webhook-secret';
        
        // Voting rewards configuration by type
        this.voteRewards = {
            bot: {
                coins: 25000, // 25K coins per vote
                bonusMultiplier: 1.5, // Weekend bonus
                streakBonuses: {
                    7: 50000,   // 7 day streak: 50K bonus
                    30: 200000, // 30 day streak: 200K bonus
                    100: 1000000 // 100 day streak: 1M bonus
                }
            },
            server: {
                coins: 25000, // Same as bot vote
                bonusMultiplier: 1.5, // Weekend bonus
                streakBonuses: {
                    7: 50000,   // 7 day streak: 50K bonus
                    30: 200000, // 30 day streak: 200K bonus
                    100: 1000000 // 100 day streak: 1M bonus
                }
            },
            ranktop: {
                coins: 0, // No coins, just lottery ticket
                lotteryTickets: 1, // 1 free lottery ticket
                bonusMultiplier: 1.0
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
            // Get user's current vote data
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

            // Handle lottery tickets for rank.top votes
            let lotteryTicketsGiven = 0;
            if (voteType === 'ranktop' && rewardConfig.lotteryTickets > 0) {
                try {
                    // Give free lottery tickets using designated server ID
                    const lotteryGuildId = process.env.DESIGNATED_SERVER_ID || '1403244656845787167';
                    lotteryTicketsGiven = await this.giveFreeLotteryTickets(userId, lotteryGuildId, rewardConfig.lotteryTickets);
                    logger.info(`Gave ${lotteryTicketsGiven} free lottery tickets to user ${userId} for rank.top vote`);
                } catch (lotteryError) {
                    logger.error(`Failed to give lottery tickets to user ${userId}: ${lotteryError.message}`);
                }
            }

            // Get user for notification
            try {
                const user = await this.client.users.fetch(userId);
                
                // Send reward notification
                await this.sendVoteRewardNotification(user, rewardAmount, streakBonus, newVoteData.vote_streak, isWeekend, newVoteData.can_use_earnmoney, newVoteData.total_votes, voteType, lotteryTicketsGiven);
            } catch (userError) {
                logger.error(`Failed to fetch user ${userId} for vote notification: ${userError.message}`);
                // Try to send notification without user object
                await this.sendVoteRewardNotification({ id: userId, username: 'Unknown User', displayAvatarURL: () => null }, rewardAmount, streakBonus, newVoteData.vote_streak, isWeekend, newVoteData.can_use_earnmoney, newVoteData.total_votes, voteType, lotteryTicketsGiven);
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
                case 'ranktop':
                    title = '🎟️ Thank You for Voting on Rank.top!';
                    description = `**${user.username}**, thanks for voting on Rank.top!`;
                    break;
                case 'server':
                    title = '🏆 Thank You for Voting for Our Server!';
                    description = `**${user.username}**, thanks for voting for our server on Top.GG!`;
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

            if (lotteryTicketsGiven > 0) {
                embed.addFields({
                    name: '🎫 Lottery Tickets',
                    value: `${lotteryTicketsGiven} free ticket${lotteryTicketsGiven > 1 ? 's' : ''} added!`,
                    inline: true
                });
            }

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
            )
                .setThumbnail(user.displayAvatarURL())
                .setFooter({ 
                    text: '🎰 ATIVE Casino • Vote every 12 hours for rewards!',
                    iconURL: this.client.user.displayAvatarURL()
                })
                .setTimestamp();

            if (isWeekend) {
                embed.addFields({
                    name: '🎉 Weekend Bonus!',
                    value: `+50% extra coins (${fmt(this.voteRewards.coins * 0.5)})`,
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

            // Try to DM user first
            let dmSent = false;
            try {
                await user.send({ embeds: [embed] });
                dmSent = true;
                logger.info(`✅ Vote confirmation DM sent to ${user.username || user.id}`);
            } catch (dmError) {
                logger.info(`❌ Failed to DM user ${user.username || user.id}: ${dmError.message}`);
            }

            // Always send to vote log channel as backup and for logging
            try {
                const logChannelId = process.env.LOG_CHANNEL_ID || process.env.VOTE_LOG_CHANNEL_ID;
                if (logChannelId) {
                    const logChannel = await this.client.channels.fetch(logChannelId);
                    if (logChannel) {
                        const logEmbed = new EmbedBuilder(embed);
                        if (!dmSent) {
                            logEmbed.setDescription(`**${user.username || user.id}** received vote rewards! ⚠️ *DM failed - user may have DMs disabled*\n\n${embed.description || 'Vote reward notification'}`);
                        } else {
                            logEmbed.setDescription(embed.description || `**${user.username || user.id}** received vote rewards!`);
                        }
                        await logChannel.send({ embeds: [logEmbed] });
                        logger.info(`📋 Vote notification logged to channel ${logChannel.name}`);
                    } else {
                        logger.error(`❌ Could not find log channel with ID: ${logChannelId}`);
                    }
                } else {
                    logger.warn(`⚠️ No LOG_CHANNEL_ID configured - vote notifications will only be sent via DM`);
                }
            } catch (channelError) {
                logger.error(`❌ Failed to send vote notification to log channel: ${channelError.message}`);
            }

            // If both DM and channel failed, log the issue
            if (!dmSent) {
                logger.warn(`⚠️ Vote confirmation may not have reached user ${user.username || user.id} - DM failed and log channel unavailable`);
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
     * Handle Rank.top webhook vote notification
     */
    async handleRanktopVoteWebhook(req, res) {
        try {
            logger.info('🎟️ Received Rank.top webhook request');
            logger.debug('Headers:', JSON.stringify(req.headers, null, 2));
            logger.debug('Body:', JSON.stringify(req.body, null, 2));

            // For test messages, just respond OK
            const voteData = req.body;
            if (voteData.test === true || voteData.type === 'test') {
                logger.info('🧪 Rank.top test webhook received - responding OK');
                return res.status(200).json({ 
                    status: 'success', 
                    message: 'Test webhook received successfully',
                    timestamp: new Date().toISOString()
                });
            }

            // Verify webhook signature from Authorization header
            const authHeader = req.headers['authorization'] || req.headers['Authorization'];
            if (!this.verifyRanktopWebhookSignature(req.body, authHeader)) {
                logger.warn('❌ Invalid Rank.top webhook authorization');
                logger.warn(`Expected format: Bearer ${this.ranktopWebhookSecret}`);
                logger.warn(`Received: ${authHeader}`);
                return res.status(401).json({ 
                    error: 'Unauthorized',
                    message: 'Invalid authorization header'
                });
            }

            // Extract user ID from various possible fields
            const userId = voteData.user || voteData.user_id || voteData.userId;
            
            if (!userId) {
                logger.error('❌ No user ID in rank.top vote data:', voteData);
                return res.status(400).json({ 
                    error: 'Bad Request',
                    message: 'Missing user ID in vote data'
                });
            }
            
            logger.info(`🎟️ Rank.top vote received from user: ${userId}`);

            // Process the vote reward with rank.top type
            await this.processVoteReward(userId, voteData, 'ranktop');
            
            logger.info(`✅ Successfully processed rank.top vote for user: ${userId}`);
            
            // Return JSON response for better compatibility
            res.status(200).json({
                status: 'success',
                message: 'Vote processed successfully',
                user_id: userId,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error(`❌ Rank.top webhook error: ${error.message}`);
            logger.error('Stack trace:', error.stack);
            res.status(500).json({
                status: 'error',
                message: 'Internal server error',
                error: error.message
            });
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
                logger.info(`User ${userId} already has maximum lottery tickets (${currentTickets}/10)`);
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
     * Verify webhook signature from Rank.top
     */
    verifyRanktopWebhookSignature(body, signature) {
        if (!this.ranktopWebhookSecret) {
            logger.warn('RANKTOP_WEBHOOK_SECRET not configured, skipping signature verification');
            return true; // Allow webhook if no secret is configured
        }
        
        if (!signature) {
            logger.warn('No authorization header received from Rank.top');
            return false;
        }
        
        // Try multiple possible formats
        const possibleFormats = [
            `Bearer ${this.ranktopWebhookSecret}`,
            this.ranktopWebhookSecret,
            `${this.ranktopWebhookSecret}`
        ];
        
        for (const expectedAuth of possibleFormats) {
            if (signature === expectedAuth) {
                return true;
            }
        }
        
        logger.warn(`Rank.top signature mismatch. Expected one of: ${possibleFormats.join(', ')}, Got: ${signature}`);
        return false;
    }
}

module.exports = TopGGManager;