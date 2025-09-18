/**
 * Inactivity Tax System for ATIVE Casino Bot
 * Taxes users who haven't played games in 3+ days
 * Higher tiers = higher taxes to prevent hoarding
 */

const dbManager = require('./database');
const { getEconomicTier, fmt, sendLogMessage } = require('./common');
const logger = require('./logger');

// Developer ID (exempt from taxes)
const DEVELOPER_ID = '466050111680544798';

class InactivityTaxManager {
    constructor() {
        this.INACTIVITY_THRESHOLD = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds
        this.isProcessing = false;
        
        // Tax rates by tier (percentage of total balance)
        this.TAX_RATES = {
            'BRONZE': 0.01,   // 1% tax
            'SILVER': 0.015,  // 1.5% tax  
            'GOLD': 0.02,     // 2% tax
            'PLATINUM': 0.03, // 3% tax
            'DIAMOND': 0.04,  // 4% tax
            'LEGENDARY': 0.05, // 5% tax
            'MYTHIC': 0.06    // 6% tax
        };

        // Minimum balance to be taxed (prevent taxing new/poor players)
        this.MIN_TAXABLE_BALANCE = 1000; // $1,000 minimum
    }

    /**
     * Check if user is inactive (hasn't played in 3+ days)
     */
    async isUserInactive(userId, guildId) {
        try {
            // Get user's most recent activity across all games
            const lastActivity = await dbManager.getUserLastActivity(userId, guildId);
            
            if (!lastActivity || !lastActivity.lastGamePlayed) {
                // No game history - consider inactive if they have significant balance
                const balance = await dbManager.getUserBalance(userId, guildId);
                const totalBalance = balance.wallet + balance.bank;
                return totalBalance >= this.MIN_TAXABLE_BALANCE;
            }

            const lastPlayed = lastActivity.lastGamePlayed;
            const now = new Date();
            const timeSinceLastGame = now.getTime() - lastPlayed.getTime();

            return timeSinceLastGame > this.INACTIVITY_THRESHOLD;
        } catch (error) {
            logger.error(`Error checking inactivity for user ${userId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Calculate tax amount for a user
     */
    calculateTax(totalBalance, tier) {
        if (totalBalance < this.MIN_TAXABLE_BALANCE) {
            return 0;
        }

        const taxRate = this.TAX_RATES[tier.key] || this.TAX_RATES.BRONZE;
        const taxAmount = Math.floor(totalBalance * taxRate);
        
        // Cap tax at 50% of total balance to prevent complete wealth wipe
        const maxTax = Math.floor(totalBalance * 0.5);
        return Math.min(taxAmount, maxTax);
    }

    /**
     * Apply tax to a specific user
     */
    async applyTaxToUser(userId, guildId, username) {
        try {
            // Skip developer
            if (userId === DEVELOPER_ID) {
                return null;
            }

            // Check if user is inactive
            const isInactive = await this.isUserInactive(userId, guildId);
            if (!isInactive) {
                return null;
            }

            // Get user balance and tier
            const balance = await dbManager.getUserBalance(userId, guildId);
            const totalBalance = balance.wallet + balance.bank;
            
            if (totalBalance < this.MIN_TAXABLE_BALANCE) {
                return null;
            }

            const tier = getEconomicTier(totalBalance);
            const taxAmount = this.calculateTax(totalBalance, tier);

            if (taxAmount <= 0) {
                return null;
            }

            // Apply tax (deduct from wallet first, then bank)
            let remainingTax = taxAmount;
            let walletDeduction = 0;
            let bankDeduction = 0;

            if (balance.wallet >= remainingTax) {
                walletDeduction = remainingTax;
                await dbManager.updateUserBalance(userId, guildId, -walletDeduction, 0);
            } else {
                walletDeduction = balance.wallet;
                bankDeduction = remainingTax - walletDeduction;
                await dbManager.updateUserBalance(userId, guildId, -walletDeduction, -bankDeduction);
            }

            // Log the tax event
            const taxRecord = {
                userId,
                guildId,
                username,
                tier: tier.key,
                totalBalance,
                taxRate: this.TAX_RATES[tier.key],
                taxAmount,
                walletDeduction,
                bankDeduction,
                timestamp: new Date().toISOString(),
                reason: 'inactivity_tax'
            };

            logger.info(`Inactivity tax applied: ${username} (${userId}) - ${fmt(taxAmount)} (${tier.key})`);

            return taxRecord;

        } catch (error) {
            logger.error(`Error applying tax to user ${userId}: ${error.message}`);
            return null;
        }
    }

    /**
     * Process inactivity taxes for all users in a guild
     */
    async processInactivityTaxes(guildId, botClient = null) {
        if (this.isProcessing) {
            return { success: false, message: 'Tax processing already in progress' };
        }

        this.isProcessing = true;
        const startTime = Date.now();
        
        try {
            logger.info(`Starting inactivity tax processing for guild ${guildId}`);
            
            // Get all users with balances
            const users = await dbManager.getAllUsers(guildId);
            const taxRecords = [];
            let totalTaxCollected = 0;
            let usersProcessed = 0;
            let usersTaxed = 0;

            for (const user of users) {
                usersProcessed++;
                
                // Skip if user_id is null or undefined
                if (!user.user_id) {
                    logger.warn(`Skipping user with undefined user_id: ${JSON.stringify(user)}`);
                    continue;
                }
                
                try {
                    const taxRecord = await this.applyTaxToUser(user.user_id, guildId, user.username || 'Unknown');
                    
                    if (taxRecord) {
                        taxRecords.push(taxRecord);
                        totalTaxCollected += taxRecord.taxAmount;
                        usersTaxed++;
                    }
                } catch (error) {
                    logger.error(`Error taxing user ${user.user_id}: ${error.message}`);
                }
            }

            const processingTime = Date.now() - startTime;
            
            // Log summary
            logger.info(`Inactivity tax processing complete: ${usersTaxed}/${usersProcessed} users taxed, ${fmt(totalTaxCollected)} collected in ${Math.round(processingTime/1000)}s`);

            // Send log message to admin channel
            if (botClient && totalTaxCollected > 0) {
                await sendLogMessage(
                    botClient,
                    'info',
                    `Inactivity Tax Collection: ${usersTaxed} users taxed for ${fmt(totalTaxCollected)} total`,
                    null,
                    guildId
                );
            }

            return {
                success: true,
                usersProcessed,
                usersTaxed,
                totalTaxCollected,
                processingTime,
                taxRecords
            };

        } catch (error) {
            logger.error(`Error processing inactivity taxes: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Get inactivity tax status for a specific user
     */
    async getUserTaxStatus(userId, guildId) {
        try {
            const balance = await dbManager.getUserBalance(userId, guildId);
            const totalBalance = balance.wallet + balance.bank;
            const tier = getEconomicTier(totalBalance);
            const isInactive = await this.isUserInactive(userId, guildId);
            const taxAmount = isInactive ? this.calculateTax(totalBalance, tier) : 0;

            // Get last game played date
            let lastGameDate = null;
            let daysSinceLastGame = 0;
            
            try {
                const lastActivity = await dbManager.getUserLastActivity(userId, guildId);
                if (lastActivity && lastActivity.lastGamePlayed) {
                    lastGameDate = lastActivity.lastGamePlayed;
                    daysSinceLastGame = Math.floor((Date.now() - lastGameDate.getTime()) / (24 * 60 * 60 * 1000));
                }
            } catch (error) {
                // Stats not available
            }

            return {
                userId,
                guildId,
                totalBalance,
                tier: tier.key,
                tierEmoji: tier.emoji,
                isInactive,
                taxRate: this.TAX_RATES[tier.key],
                taxAmount,
                isTaxable: totalBalance >= this.MIN_TAXABLE_BALANCE,
                isDeveloper: userId === DEVELOPER_ID,
                lastGameDate,
                daysSinceLastGame,
                daysUntilTax: Math.max(0, 3 - daysSinceLastGame)
            };

        } catch (error) {
            logger.error(`Error getting tax status for user ${userId}: ${error.message}`);
            return null;
        }
    }

    /**
     * Get summary of all users' tax status
     */
    async getTaxSummary(guildId, limit = 20) {
        try {
            const users = await dbManager.getAllUsers(guildId);
            const summary = {
                totalUsers: users.length,
                inactiveUsers: 0,
                taxableUsers: 0,
                exemptUsers: 0,
                potentialTaxRevenue: 0,
                tierBreakdown: {}
            };

            const userStatuses = [];

            for (const user of users.slice(0, limit)) {
                const status = await this.getUserTaxStatus(user.user_id, guildId);
                if (status) {
                    userStatuses.push({
                        ...status,
                        username: user.username || 'Unknown'
                    });

                    if (status.isDeveloper) {
                        summary.exemptUsers++;
                    } else if (status.isInactive && status.isTaxable) {
                        summary.inactiveUsers++;
                        summary.taxableUsers++;
                        summary.potentialTaxRevenue += status.taxAmount;
                    } else if (status.isTaxable) {
                        summary.taxableUsers++;
                    }

                    // Tier breakdown
                    if (!summary.tierBreakdown[status.tier]) {
                        summary.tierBreakdown[status.tier] = { count: 0, inactive: 0, taxRevenue: 0 };
                    }
                    summary.tierBreakdown[status.tier].count++;
                    if (status.isInactive && status.isTaxable) {
                        summary.tierBreakdown[status.tier].inactive++;
                        summary.tierBreakdown[status.tier].taxRevenue += status.taxAmount;
                    }
                }
            }

            return {
                summary,
                userStatuses: userStatuses.sort((a, b) => b.totalBalance - a.totalBalance)
            };

        } catch (error) {
            logger.error(`Error getting tax summary: ${error.message}`);
            return null;
        }
    }
}

// Export singleton instance
module.exports = new InactivityTaxManager();