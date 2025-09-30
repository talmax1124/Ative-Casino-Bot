/**
 * Server Vote Poller for Top.GG Server List
 * Polls the Top.GG API to check for new server votes
 */

const axios = require('axios');
const dbManager = require('./database');
const logger = require('./logger');

class ServerVotePoller {
    constructor(topggManager) {
        this.topggManager = topggManager;
        this.serverId = process.env.DESIGNATED_SERVER_ID || '1403244656845787167';
        this.topggServerToken = process.env.TOPGG_SERVER_TOKEN;
        this.pollInterval = 60000; // Check every 60 seconds
        this.isPolling = false;
        this.lastCheckedVotes = new Set(); // Track processed votes to avoid duplicates
        this.lastPollTime = Date.now();
    }

    /**
     * Start polling for server votes
     */
    start() {
        if (!this.topggServerToken) {
            logger.warn('TOPGG_SERVER_TOKEN not set, server vote polling disabled');
            return;
        }

        if (this.isPolling) {
            logger.warn('Server vote polling already running');
            return;
        }

        this.isPolling = true;
        logger.info(`Starting server vote polling (checking every ${this.pollInterval / 1000} seconds)`);
        
        // Initial check
        this.checkForVotes();
        
        // Set up interval
        this.pollTimer = setInterval(() => {
            this.checkForVotes();
        }, this.pollInterval);
    }

    /**
     * Stop polling
     */
    stop() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.isPolling = false;
        logger.info('Server vote polling stopped');
    }

    /**
     * Check for new server votes
     */
    async checkForVotes() {
        try {
            // Get list of users who voted in the last 12 hours
            const response = await axios.get(
                `https://top.gg/api/guilds/${this.serverId}/votes`,
                {
                    headers: {
                        'Authorization': this.topggServerToken
                    }
                }
            );

            if (!response.data || !Array.isArray(response.data)) {
                logger.debug('No server vote data received');
                return;
            }

            const votes = response.data;
            logger.debug(`Retrieved ${votes.length} server votes from Top.GG`);

            // Process each vote
            for (const vote of votes) {
                await this.processVote(vote);
            }

            this.lastPollTime = Date.now();

        } catch (error) {
            if (error.response?.status === 404) {
                logger.error('Server not found on Top.GG. Check DESIGNATED_SERVER_ID');
            } else if (error.response?.status === 401) {
                logger.error('Invalid Top.GG server token. Check TOPGG_SERVER_TOKEN');
            } else {
                logger.error(`Error polling server votes: ${error.message}`);
            }
        }
    }

    /**
     * Process a single vote
     */
    async processVote(voteData) {
        try {
            const userId = voteData.id || voteData.user || voteData.userId;
            const voteTime = voteData.date || voteData.timestamp || Date.now();
            
            // Create unique vote ID to prevent duplicates
            const voteId = `${userId}-${voteTime}`;
            
            // Skip if we've already processed this vote
            if (this.lastCheckedVotes.has(voteId)) {
                logger.debug(`Skipping already processed server vote: ${voteId}`);
                return;
            }

            // Check if vote is within valid time window (12 hours)
            const twelveHoursAgo = Date.now() - (12 * 60 * 60 * 1000);
            if (voteTime < twelveHoursAgo) {
                logger.debug(`Skipping old server vote from user ${userId}`);
                return;
            }

            // Check if user has already been rewarded recently (within 11 hours to allow for slight timing differences)
            const lastVoteData = await dbManager.databaseAdapter.getUserVoteData(userId);
            if (lastVoteData) {
                // Use the general last_vote_ts for now, we'll track server votes in the same field
                // since they follow the same 12-hour cooldown pattern
                const lastVoteTime = lastVoteData.last_vote_ts || 0;
                const elevenHoursAgo = Date.now() - (11 * 60 * 60 * 1000);
                
                if (lastVoteTime > elevenHoursAgo) {
                    logger.debug(`User ${userId} already rewarded for vote recently`);
                    this.lastCheckedVotes.add(voteId);
                    return;
                }
            }

            logger.info(`Processing new server vote from user ${userId}`);
            
            // Process the vote reward using TopGG manager
            await this.topggManager.processVoteReward(
                userId,
                {
                    user: userId,
                    guild: this.serverId,
                    type: 'upvote',
                    timestamp: voteTime
                },
                'server'
            );

            // Server votes are handled by the TopGG manager's processVoteReward method
            // which will update the vote data automatically

            // Mark vote as processed
            this.lastCheckedVotes.add(voteId);
            
            // Clean up old vote IDs (keep only last 100)
            if (this.lastCheckedVotes.size > 100) {
                const idsArray = Array.from(this.lastCheckedVotes);
                this.lastCheckedVotes = new Set(idsArray.slice(-100));
            }

            logger.info(`Successfully processed server vote for user ${userId}`);

        } catch (error) {
            logger.error(`Error processing server vote: ${error.message}`);
        }
    }

    /**
     * Manually check if a specific user has voted
     */
    async hasUserVoted(userId) {
        try {
            const response = await axios.get(
                `https://top.gg/api/guilds/${this.serverId}/votes`,
                {
                    headers: {
                        'Authorization': this.topggServerToken
                    },
                    params: {
                        userId: userId
                    }
                }
            );

            const votes = response.data || [];
            const userVote = votes.find(v => (v.id === userId || v.user === userId));
            
            if (userVote) {
                const voteTime = userVote.date || userVote.timestamp;
                const twelveHoursAgo = Date.now() - (12 * 60 * 60 * 1000);
                return voteTime > twelveHoursAgo;
            }

            return false;

        } catch (error) {
            logger.error(`Error checking user vote status: ${error.message}`);
            return false;
        }
    }

    /**
     * Get server vote statistics
     */
    async getServerStats() {
        try {
            const response = await axios.get(
                `https://top.gg/api/guilds/${this.serverId}`,
                {
                    headers: {
                        'Authorization': this.topggServerToken
                    }
                }
            );

            return {
                points: response.data.points || 0,
                monthlyPoints: response.data.monthlyPoints || 0,
                rank: response.data.rank || 'N/A'
            };

        } catch (error) {
            logger.error(`Error fetching server stats: ${error.message}`);
            return null;
        }
    }
}

module.exports = ServerVotePoller;