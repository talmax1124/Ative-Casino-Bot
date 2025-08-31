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
        
        // Voting rewards configuration
        this.voteRewards = {
            coins: 25000, // 25K coins per vote
            bonusMultiplier: 1.5, // Weekend bonus
            streakBonuses: {
                7: 50000,   // 7 day streak: 50K bonus
                30: 200000, // 30 day streak: 200K bonus
                100: 1000000 // 100 day streak: 1M bonus
            }
        };
    }

    /**
     * Handle Top.GG webhook vote notification
     */
    async handleVoteWebhook(req, res) {
        try {
            // Verify webhook signature from Authorization header
            const authHeader = req.headers['authorization'];
            if (!this.verifyWebhookSignature(req.body, authHeader)) {
                logger.warn('Invalid Top.GG webhook authorization');
                return res.status(401).send('Unauthorized');
            }

            const voteData = req.body;
            const userId = voteData.user;
            
            logger.info(`Top.GG vote received from user: ${userId}`);
            logger.info(`Full Top.GG webhook payload: ${JSON.stringify(voteData)}`);

            // Process the vote reward
            await this.processVoteReward(userId, voteData);
            
            res.status(200).send('OK');
        } catch (error) {
            logger.error(`Top.GG webhook error: ${error.message}`);
            res.status(500).send('Internal Server Error');
        }
    }

    /**
     * Process vote reward for user
     */
    async processVoteReward(userId, voteData) {
        try {
            // Get user's current vote data
            const voteInfo = await dbManager.databaseAdapter.getUserVoteData(userId);
            const currentTime = Date.now();
            
            // Calculate reward amount
            let rewardAmount = this.voteRewards.coins;
            
            // Weekend bonus (Saturday/Sunday)
            const isWeekend = [0, 6].includes(new Date().getDay());
            if (isWeekend) {
                rewardAmount = Math.floor(rewardAmount * this.voteRewards.bonusMultiplier);
            }

            // Calculate vote streak first
            const lastVoteTime = voteInfo?.last_vote_ts || 0;
            const hoursSinceLastVote = (currentTime - lastVoteTime) / (1000 * 60 * 60);
            const isValidStreak = hoursSinceLastVote >= 11 && hoursSinceLastVote <= 25; // 12h ± 1h window
            
            let currentStreak;
            let streakBonus = 0;
            
            if (isValidStreak && voteInfo) {
                currentStreak = (voteInfo.vote_streak || 0) + 1;
                
                // Check for streak bonuses
                if (this.voteRewards.streakBonuses[currentStreak]) {
                    streakBonus = this.voteRewards.streakBonuses[currentStreak];
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

            // Debug log what we're about to save
            logger.info(`Saving vote data for user ${userId}: ${JSON.stringify(newVoteData)}`);
            
            // Save vote data and add coins
            await dbManager.databaseAdapter.updateUserVoteData(userId, null, newVoteData);
            await dbManager.adjustWallet(userId, null, rewardAmount);

            // Debug: Verify data was saved correctly
            const savedData = await dbManager.databaseAdapter.getUserVoteData(userId);
            logger.info(`Verified saved vote data for user ${userId}: ${JSON.stringify(savedData)}`);

            // Get user for notification
            const user = await this.client.users.fetch(userId);
            
            // Send reward notification
            await this.sendVoteRewardNotification(user, rewardAmount, streakBonus, newVoteData.vote_streak, isWeekend, newVoteData.can_use_earnmoney, newVoteData.total_votes);

            logger.info(`Vote reward processed: ${user.username} received ${fmt(rewardAmount)} coins`);

        } catch (error) {
            logger.error(`Failed to process vote reward: ${error.message}`);
        }
    }

    /**
     * Send vote reward notification to user
     */
    async sendVoteRewardNotification(user, rewardAmount, streakBonus, streak, isWeekend, canUseEarnmoney, totalVotes) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('🗳️ Thank You for Voting!')
                .setDescription(`**${user.username}**, thanks for voting on Top.GG!`)
                .setColor(0x00D4FF)
                .addFields(
                    {
                        name: '💰 Reward Earned',
                        value: `${fmt(rewardAmount)} coins`,
                        inline: true
                    },
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

            // Try to DM user
            try {
                await user.send({ embeds: [embed] });
            } catch (dmError) {
                logger.info(`Failed to DM user ${user.username}, will only log to channel`);
            }

            // Send to vote log channel
            try {
                const logChannel = await this.client.channels.fetch(process.env.LOG_CHANNEL_ID);
                if (logChannel) {
                    await logChannel.send({ embeds: [embed] });
                }
            } catch (channelError) {
                logger.error(`Failed to send vote notification to log channel: ${channelError.message}`);
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
}

module.exports = TopGGManager;