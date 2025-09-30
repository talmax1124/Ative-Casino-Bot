/**
 * Rank.Top API Integration Manager
 * Handles bot statistics posting and API interactions with Rank.top
 */

const { RankTopClient } = require('@rank-top/sdk');
const logger = require('./logger');
const dbManager = require('./database');
const { fmt } = require('./common');

class RankTopManager {
    constructor(client) {
        this.client = client;
        this.apiKey = process.env.RANKTOP_API_KEY;
        this.botAuthToken = process.env.RANKTOP_BOT_AUTH_TOKEN;
        this.rankTopClient = null;
        this.autopostStarted = false;
        this.autopostInterval = null;
        
        // Initialize if credentials are available
        if (this.apiKey) {
            this.initialize();
        } else {
            logger.warn('RANKTOP_API_KEY not configured - Rank.Top integration disabled');
        }
    }

    /**
     * Initialize the Rank.Top client
     */
    initialize() {
        try {
            this.rankTopClient = new RankTopClient({
                apiKey: this.apiKey
            });

            // Set up event listeners
            this.setupEventListeners();
            
            logger.info('✅ Rank.Top client initialized successfully');
        } catch (error) {
            logger.error(`❌ Failed to initialize Rank.Top client: ${error.message}`);
        }
    }

    /**
     * Set up event listeners for the autoposter
     */
    setupEventListeners() {
        if (!this.rankTopClient) return;

        // Listen for successful stats posting
        this.rankTopClient.on('autoposter/posted', (stats) => {
            logger.info('📊 Rank.Top stats posted successfully:', stats);
        });

        // Listen for errors
        this.rankTopClient.on('autoposter/error', (error) => {
            logger.error('❌ Rank.Top autoposter error:', error);
        });

        // Listen for when autoposter is stopped
        this.rankTopClient.on('autoposter/stopped', () => {
            logger.info('⏹️ Rank.Top autoposter stopped');
            this.autopostStarted = false;
        });
    }

    /**
     * Start autoposting bot statistics to Rank.Top
     */
    async startAutopost() {
        if (!this.botAuthToken) {
            logger.error('Cannot start autopost - RANKTOP_BOT_AUTH_TOKEN not configured');
            return false;
        }

        if (this.autopostStarted) {
            logger.info('Autopost already running');
            return true;
        }

        try {
            // Try SDK autopost first if client is available
            if (this.rankTopClient) {
                try {
                    await this.rankTopClient.startAutopost({
                        client: this.client,
                        authorization: this.botAuthToken
                    });
                    
                    this.autopostStarted = true;
                    logger.info('✅ Rank.Top SDK autopost started successfully');
                    return true;
                } catch (sdkError) {
                    logger.warn(`SDK autopost failed (${sdkError.message}), falling back to manual posting`);
                    logger.debug('SDK Error details:', sdkError);
                }
            }
            
            // Fallback: Set up manual posting interval
            logger.info('Using manual autopost as fallback');
            this.startManualAutopost();
            return true;
        } catch (error) {
            logger.error(`❌ Failed to start Rank.Top autopost: ${error.message}`);
            return false;
        }
    }

    /**
     * Start manual autoposting with interval
     */
    startManualAutopost() {
        if (this.autopostInterval) {
            clearInterval(this.autopostInterval);
        }

        // Test the auth token first with a manual post
        logger.info('Testing Rank.Top auth token with initial post...');
        this.postBotStats().then(success => {
            if (success) {
                logger.info('✅ Auth token verified, setting up 30-minute interval');
                // Set up interval to post every 30 minutes
                this.autopostInterval = setInterval(() => {
                    this.postBotStats();
                }, 30 * 60 * 1000); // 30 minutes
            } else {
                logger.error('❌ Auth token verification failed, autopost disabled');
                this.autopostStarted = false;
                return;
            }
        });

        this.autopostStarted = true;
        logger.info('✅ Manual Rank.Top autopost started (30 minute interval)');
    }

    /**
     * Stop autoposting bot statistics
     */
    stopAutopost() {
        if (!this.autopostStarted) {
            logger.info('Autopost not running');
            return;
        }

        // Stop SDK autopost if available
        if (this.rankTopClient) {
            try {
                this.rankTopClient.stopAutopost();
            } catch (error) {
                // Ignore errors when stopping
            }
        }

        // Stop manual interval if running
        if (this.autopostInterval) {
            clearInterval(this.autopostInterval);
            this.autopostInterval = null;
        }

        this.autopostStarted = false;
        logger.info('✅ Rank.Top autopost stopped');
    }

    /**
     * Post statistics manually (one-time)
     */
    async postStatsManually() {
        if (!this.rankTopClient || !this.botAuthToken) {
            logger.error('Cannot post stats - missing configuration');
            return false;
        }

        try {
            const serverCount = this.client.guilds.cache.size;
            const memberCount = this.client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
            const shardCount = this.client.ws.shards.size || 1;

            // This would need to be implemented using the API directly
            // as the SDK currently only supports autoposting
            logger.info(`📊 Manual stats: ${serverCount} servers, ${memberCount} members, ${shardCount} shards`);
            
            // For now, we can only use autopost feature
            return false;
        } catch (error) {
            logger.error(`❌ Failed to post stats manually: ${error.message}`);
            return false;
        }
    }

    /**
     * Get bot information from Rank.Top API
     * @param {string} botId - The bot ID to lookup
     */
    async getBotInfo(botId) {
        // Try with bot auth token first, fallback to API key
        const authToken = this.botAuthToken || this.apiKey;
        if (!authToken) {
            logger.error('Cannot fetch bot info - no authentication token configured');
            return null;
        }

        try {
            // Using the REST API directly as the SDK doesn't expose this method
            const response = await fetch(`https://rank.top/api/bots/${botId}/details`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    logger.info(`Bot ${botId} not found on Rank.Top (not listed yet)`);
                    return null;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            if (error.message.includes('404')) {
                return null; // Bot not listed yet, this is expected
            }
            logger.error(`❌ Failed to fetch bot info: ${error.message}`);
            return null;
        }
    }

    /**
     * Search for bots on Rank.Top
     * @param {Object} params - Search parameters
     */
    async searchBots(params = {}) {
        const authToken = this.botAuthToken || this.apiKey;
        if (!authToken) {
            logger.error('Cannot search bots - no authentication token configured');
            return null;
        }

        try {
            const queryParams = new URLSearchParams(params);
            const response = await fetch(`https://rank.top/api/bots/search?${queryParams}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            logger.error(`❌ Failed to search bots: ${error.message}`);
            return null;
        }
    }

    /**
     * Get server information from Rank.Top API
     * @param {string} serverId - The server ID to lookup
     */
    async getServerInfo(serverId) {
        const authToken = this.botAuthToken || this.apiKey;
        if (!authToken) {
            logger.error('Cannot fetch server info - no authentication token configured');
            return null;
        }

        try {
            const response = await fetch(`https://rank.top/api/servers/${serverId}/details`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            logger.error(`❌ Failed to fetch server info: ${error.message}`);
            return null;
        }
    }

    /**
     * Get user profile from Rank.Top API
     * @param {string} userId - The user ID to lookup
     */
    async getUserProfile(userId) {
        const authToken = this.botAuthToken || this.apiKey;
        if (!authToken) {
            logger.error('Cannot fetch user profile - no authentication token configured');
            return null;
        }

        try {
            const response = await fetch(`https://rank.top/api/users/${userId}/get`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            logger.error(`❌ Failed to fetch user profile: ${error.message}`);
            return null;
        }
    }

    /**
     * Post bot statistics to Rank.Top (using REST API directly)
     * @param {Object} stats - Statistics to post
     */
    async postBotStats(stats = {}) {
        if (!this.botAuthToken) {
            logger.error('Cannot post bot stats - bot auth token not configured');
            return false;
        }

        try {
            const botId = this.client.user.id;
            
            // Get commands list
            const commands = [];
            if (this.client.commands) {
                this.client.commands.forEach(command => {
                    if (command.data && command.data.name) {
                        commands.push({
                            name: command.data.name,
                            description: command.data.description || 'No description',
                            options: command.data.options ? command.data.options.length : 0
                        });
                    }
                });
            }
            
            // Prepare the payload according to Rank.Top API requirements
            const payload = {
                serverCount: stats.serverCount || this.client.guilds.cache.size,
                userCount: stats.userCount || this.client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0),
                ping: stats.ping || Math.round(this.client.ws.ping),
                memory: stats.memory || Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
                commandCount: commands.length,
                commands: commands.map(cmd => ({
                    name: `/${cmd.name}`,
                    description: cmd.description
                })),
                shardCount: this.client.ws.shards?.size || 1,
                ...stats
            };

            const response = await fetch(`https://rank.top/api/bots/${botId}/post`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': this.botAuthToken
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                if (response.status === 401) {
                    logger.error('❌ 401 Unauthorized - Check your RANKTOP_BOT_AUTH_TOKEN');
                    logger.debug('Auth token being used:', this.botAuthToken ? `${this.botAuthToken.substring(0, 10)}...` : 'undefined');
                }
                throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
            }

            const result = await response.json();
            logger.info('✅ Bot stats posted to Rank.Top:', {
                servers: payload.serverCount,
                users: payload.userCount,
                commands: payload.commandCount,
                ping: payload.ping + 'ms',
                memory: payload.memory + 'MB'
            });
            return true;
        } catch (error) {
            logger.error(`❌ Failed to post bot stats: ${error.message}`);
            return false;
        }
    }
}

module.exports = RankTopManager;