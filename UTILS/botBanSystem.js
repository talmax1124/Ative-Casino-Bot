/**
 * Bot Ban System for ATIVE Casino Bot
 * Automatically bans users with excessive amounts (Quintillions or >10 Billion)
 * Prevents exploiters from continuing to abuse the system
 */

const logger = require('./logger');
const dbManager = require('./database');

class BotBanSystem {
    constructor() {
        this.BAN_THRESHOLDS = {
            QUINTILLION: 1e18,        // 1 Quintillion
            THREE_BILLION: 10e9,      // 10 Billion
            EXTREME_AMOUNT: 1e15      // 1 Quadrillion (additional threshold)
        };
        
        this.bannedUsers = new Set();
        this.banReasons = new Map();
        this.banHistory = [];
        this.logChannel = '1406136478714826824'; // Your log channel ID
    }

    /**
     * Check if a user should be banned based on their balance
     * @param {string} userId - Discord user ID
     * @param {Object} balance - User's balance object
     * @returns {Object} Ban decision with details
     */
    async checkForBan(userId, balance) {
        try {
            const totalWealth = (balance.wallet || 0) + (balance.bank || 0);
            
            // Check for quintillion threshold
            if (totalWealth >= this.BAN_THRESHOLDS.QUINTILLION) {
                return {
                    shouldBan: true,
                    reason: 'QUINTILLION_THRESHOLD',
                    amount: totalWealth,
                    threshold: this.BAN_THRESHOLDS.QUINTILLION,
                    severity: 'CRITICAL'
                };
            }
            
            // Check for 10 billion threshold
            if (totalWealth >= this.BAN_THRESHOLDS.THREE_BILLION) {
                return {
                    shouldBan: true,
                    reason: 'TEN_BILLION_THRESHOLD',
                    amount: totalWealth,
                    threshold: this.BAN_THRESHOLDS.THREE_BILLION,
                    severity: 'HIGH'
                };
            }
            
            // Additional check for extreme amounts (quadrillion)
            if (totalWealth >= this.BAN_THRESHOLDS.EXTREME_AMOUNT) {
                return {
                    shouldBan: true,
                    reason: 'EXTREME_AMOUNT_THRESHOLD',
                    amount: totalWealth,
                    threshold: this.BAN_THRESHOLDS.EXTREME_AMOUNT,
                    severity: 'CRITICAL'
                };
            }
            
            return {
                shouldBan: false,
                amount: totalWealth,
                reason: null
            };
            
        } catch (error) {
            logger.error(`Error checking ban status for user ${userId}: ${error.message}`);
            return {
                shouldBan: false,
                error: error.message
            };
        }
    }

    /**
     * Execute a ban on a user
     * @param {string} userId - Discord user ID
     * @param {Object} banDecision - Ban decision from checkForBan
     * @param {Object} discordClient - Discord client for notifications
     * @returns {boolean} Success status
     */
    async executeBan(userId, banDecision, discordClient = null) {
        try {
            // Add to banned users
            this.bannedUsers.add(userId);
            this.banReasons.set(userId, banDecision);
            
            // Record ban in history
            const banRecord = {
                userId,
                reason: banDecision.reason,
                amount: banDecision.amount,
                threshold: banDecision.threshold,
                severity: banDecision.severity,
                timestamp: new Date().toISOString(),
                executedAt: Date.now()
            };
            
            this.banHistory.push(banRecord);
            
            // Reset their balance to 0 to prevent further exploitation
            await dbManager.setUserBalance(userId, null, 0, 0, {
                banned: true,
                ban_reason: banDecision.reason,
                ban_timestamp: new Date(),
                original_amount: banDecision.amount
            });
            
            // Log the ban
            logger.error(`🚫 BOT BAN EXECUTED: User ${userId} banned for ${banDecision.reason} (${this.formatAmount(banDecision.amount)})`);
            
            // Send DM notification to the banned user
            if (discordClient) {
                await this.sendBanDM(discordClient, userId, banDecision);
            }
            
            // Send notification to log channel
            if (discordClient && this.logChannel) {
                await this.sendBanNotification(discordClient, banRecord);
            }
            
            return true;
            
        } catch (error) {
            logger.error(`Failed to execute ban for user ${userId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Check user balance and auto-ban if necessary
     * @param {string} userId - Discord user ID
     * @param {Object} balance - User's balance object
     * @param {Object} discordClient - Discord client for notifications
     * @returns {Object} Check result with ban status
     */
    async checkAndBanUser(userId, balance, discordClient = null) {
        try {
            // Skip if already banned
            if (await this.isUserBanned(userId)) {
                return {
                    alreadyBanned: true,
                    reason: this.banReasons.get(userId)?.reason || 'UNKNOWN'
                };
            }
            
            // Check for ban criteria
            const banDecision = await this.checkForBan(userId, balance);
            
            if (banDecision.shouldBan) {
                const banSuccess = await this.executeBan(userId, banDecision, discordClient);
                
                return {
                    banned: banSuccess,
                    reason: banDecision.reason,
                    amount: banDecision.amount,
                    severity: banDecision.severity
                };
            }
            
            return {
                banned: false,
                amount: banDecision.amount,
                safe: true
            };
            
        } catch (error) {
            logger.error(`Error in checkAndBanUser for ${userId}: ${error.message}`);
            return {
                error: error.message,
                banned: false
            };
        }
    }

    /**
     * Check if a user is currently banned (checks both cache and database)
     * @param {string} userId - Discord user ID
     * @returns {Promise<boolean>} Ban status
     */
    async isUserBanned(userId) {
        // First check in-memory cache for performance
        if (this.bannedUsers.has(userId)) {
            return true;
        }
        
        // If not in cache, check database to handle bot restarts
        try {
            const dbResult = await this.isUserBannedInDatabase(userId);
            if (dbResult.banned) {
                // Add to cache if found in database
                this.bannedUsers.add(userId);
                // Restore ban reason if available
                if (dbResult.reason) {
                    this.banReasons.set(userId, {
                        reason: dbResult.reason,
                        amount: dbResult.originalAmount || dbResult.amount || 0,
                        severity: 'DATABASE_RESTORED'
                    });
                }
                return true;
            }
        } catch (error) {
            logger.error(`Error checking database ban status in isUserBanned: ${error.message}`);
        }
        
        return false;
    }

    /**
     * Check if a user is banned by checking database directly
     * @param {string} userId - Discord user ID
     * @returns {Object} Ban status and details
     */
    async isUserBannedInDatabase(userId) {
        try {
            const dbManager = require('./database');
            const userBalance = await dbManager.getUserBalance(userId, null);
            
            // Check if user has banned flag in database
            if (userBalance && userBalance.banned === true) {
                return {
                    banned: true,
                    reason: userBalance.ban_reason || 'UNKNOWN',
                    banTimestamp: userBalance.ban_timestamp || null,
                    originalAmount: userBalance.original_amount || 0
                };
            }
            
            // Also check if they have excessive amounts that would trigger auto-ban
            const totalWealth = (userBalance.wallet || 0) + (userBalance.bank || 0);
            if (totalWealth >= this.BAN_THRESHOLDS.THREE_BILLION) {
                return {
                    banned: true,
                    reason: 'EXCESSIVE_BALANCE_AUTO_BAN',
                    amount: totalWealth,
                    threshold: this.BAN_THRESHOLDS.THREE_BILLION
                };
            }
            
            return {
                banned: false,
                amount: totalWealth
            };
            
        } catch (error) {
            logger.error(`Error checking database ban status for ${userId}: ${error.message}`);
            return {
                banned: false,
                error: error.message
            };
        }
    }

    /**
     * Get ban reason for a user
     * @param {string} userId - Discord user ID
     * @returns {Object|null} Ban reason details
     */
    getBanReason(userId) {
        return this.banReasons.get(userId) || null;
    }

    /**
     * Send DM notification to banned user
     * @param {Object} discordClient - Discord client
     * @param {string} userId - User ID to send DM to
     * @param {Object} banDecision - Ban decision details
     */
    async sendBanDM(discordClient, userId, banDecision) {
        try {
            const user = await discordClient.users.fetch(userId);
            if (!user) {
                logger.warn(`Could not fetch user ${userId} for ban DM`);
                return;
            }
            
            const embed = {
                title: '🚫 **ACCOUNT SUSPENDED**',
                description: `Your account has been automatically suspended for violating our economy system rules.`,
                color: 0xFF0000, // Red
                fields: [
                    {
                        name: '⚠️ Violation',
                        value: banDecision.reason.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
                        inline: false
                    },
                    {
                        name: '💰 Detected Amount',
                        value: this.formatAmount(banDecision.amount),
                        inline: true
                    },
                    {
                        name: '🎯 Threshold Exceeded',
                        value: this.formatAmount(banDecision.threshold),
                        inline: true
                    },
                    {
                        name: '📝 Reason for Ban',
                        value: 'Your account balance exceeded the maximum allowed limits, indicating potential system abuse or exploitation.',
                        inline: false
                    },
                    {
                        name: '🔄 What Happens Now',
                        value: '• Your balance has been reset to $0\n• All casino games are now disabled for your account\n• You cannot participate in any economy activities',
                        inline: false
                    },
                    {
                        name: '📞 Appeal Process',
                        value: 'If you believe this ban was issued in error, please contact the server administrators for review.',
                        inline: false
                    }
                ],
                footer: {
                    text: 'ATIVE Casino Bot - Anti-Exploit System'
                },
                timestamp: new Date().toISOString()
            };
            
            await user.send({ embeds: [embed] });
            logger.info(`Ban DM sent successfully to user ${userId}`);
            
        } catch (error) {
            logger.error(`Failed to send ban DM to user ${userId}: ${error.message}`);
            // Don't throw error - ban should still proceed even if DM fails
        }
    }

    /**
     * Send ban notification to log channel
     * @param {Object} discordClient - Discord client
     * @param {Object} banRecord - Ban record details
     */
    async sendBanNotification(discordClient, banRecord) {
        try {
            const channel = discordClient.channels.cache.get(this.logChannel);
            if (!channel) {
                logger.warn(`Log channel ${this.logChannel} not found for ban notification`);
                return;
            }
            
            const embed = {
                title: '🚫 **AUTOMATIC BOT BAN EXECUTED**',
                description: `A user has been automatically banned for excessive balance amounts.`,
                color: 0xFF0000, // Red
                fields: [
                    {
                        name: '👤 User ID',
                        value: banRecord.userId,
                        inline: true
                    },
                    {
                        name: '💰 Amount',
                        value: this.formatAmount(banRecord.amount),
                        inline: true
                    },
                    {
                        name: '🎯 Threshold',
                        value: this.formatAmount(banRecord.threshold),
                        inline: true
                    },
                    {
                        name: '⚠️ Reason',
                        value: banRecord.reason.replace(/_/g, ' '),
                        inline: true
                    },
                    {
                        name: '🔴 Severity',
                        value: banRecord.severity,
                        inline: true
                    },
                    {
                        name: '⏰ Banned At',
                        value: `<t:${Math.floor(banRecord.executedAt / 1000)}:F>`,
                        inline: true
                    }
                ],
                footer: {
                    text: 'ATIVE Casino Bot - Anti-Exploit System'
                },
                timestamp: new Date().toISOString()
            };
            
            await channel.send({ embeds: [embed] });
            
        } catch (error) {
            logger.error(`Failed to send ban notification: ${error.message}`);
        }
    }

    /**
     * Format amount for display
     * @param {number} amount - Amount to format
     * @returns {string} Formatted amount
     */
    formatAmount(amount) {
        if (amount >= 1e18) return `$${(amount / 1e18).toFixed(2)} Quintillion`;
        if (amount >= 1e15) return `$${(amount / 1e15).toFixed(2)} Quadrillion`;
        if (amount >= 1e12) return `$${(amount / 1e12).toFixed(2)} Trillion`;
        if (amount >= 1e9) return `$${(amount / 1e9).toFixed(2)} Billion`;
        if (amount >= 1e6) return `$${(amount / 1e6).toFixed(2)} Million`;
        if (amount >= 1e3) return `$${(amount / 1e3).toFixed(2)} Thousand`;
        return `$${amount.toFixed(2)}`;
    }

    /**
     * Get system statistics
     * @returns {Object} System stats
     */
    getStats() {
        return {
            totalBans: this.bannedUsers.size,
            banHistory: this.banHistory.length,
            thresholds: this.BAN_THRESHOLDS,
            lastBan: this.banHistory[this.banHistory.length - 1] || null,
            activeBans: Array.from(this.bannedUsers)
        };
    }

    /**
     * Unban a user (admin function)
     * @param {string} userId - Discord user ID
     * @param {string} adminId - Admin user ID who is unbanning
     * @returns {boolean} Success status
     */
    async unbanUser(userId, adminId) {
        try {
            // Check if user is banned (this now checks both cache and database)
            const isBanned = await this.isUserBanned(userId);
            if (!isBanned) {
                return false;
            }
            
            // Remove from in-memory cache
            this.bannedUsers.delete(userId);
            const banReason = this.banReasons.get(userId);
            this.banReasons.delete(userId);
            
            // Log the unban
            logger.info(`🔓 User ${userId} unbanned by admin ${adminId}. Original ban reason: ${banReason?.reason || 'UNKNOWN'}`);
            
            // Update database to remove ban status
            await dbManager.setUserBalance(userId, null, 1000, 0, {
                banned: false,
                unbanned_by: adminId,
                unban_timestamp: new Date(),
                ban_reason: null
            });
            
            return true;
            
        } catch (error) {
            logger.error(`Failed to unban user ${userId}: ${error.message}`);
            return false;
        }
    }
}

// Export singleton
module.exports = new BotBanSystem();