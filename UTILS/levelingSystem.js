/**
 * Enhanced Leveling System for ATIVE Casino Bot
 * Full-featured XP and leveling system with rewards and progression
 */

const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');
const dbManager = require('./database');

// XP rewards configuration
const XP_REWARDS = {
    // Game completion rewards
    GAME_COMPLETION: {
        'blackjack': { base: 15, win_bonus: 10 },
        'roulette': { base: 12, win_bonus: 8 },
        'slots': { base: 8, win_bonus: 5 },
        'plinko': { base: 12, win_bonus: 8 },
        'crash': { base: 10, win_bonus: 7 },
        'rps': { base: 5, win_bonus: 3 },
        'bingo': { base: 20, win_bonus: 15 },
        'uno': { base: 25, win_bonus: 20 },
        'battleship': { base: 30, win_bonus: 25 },
        'yahtzee': { base: 18, win_bonus: 12 },
        'duck': { base: 6, win_bonus: 4 },
        'fishing': { base: 10, win_bonus: 8 },
        'treasurevault': { base: 25, win_bonus: 20 },
        'heist': { base: 35, win_bonus: 30 },
        'crime': { base: 8, win_bonus: 5 },
        'wordchain': { base: 12, win_bonus: 8 },
        'multi-slots': { base: 15, win_bonus: 12 }
    },
    
    // Special achievements
    SPECIAL_ACHIEVEMENTS: {
        'blackjack': 25, // Blackjack (21)
        'big_win': 30, // 5x+ multiplier win
        'massive_win': 50, // 20x+ multiplier win
        'first_game': 20, // First game played
        'win_streak': 15, // Multiple wins in a row
        'daily_active': 10 // First game of the day
    },
    
    // Chat activity (per message, max once per minute)
    CHAT_MESSAGE: 2
};

// Level-up rewards
const LEVEL_REWARDS = {
    5: { money: 5000, message: "🎉 Welcome bonus!" },
    10: { money: 15000, message: "💰 Getting started!" },
    15: { money: 25000, message: "🚀 Making progress!" },
    20: { money: 50000, message: "⭐ Rising star!" },
    25: { money: 75000, message: "💎 High roller!" },
    30: { money: 100000, message: "👑 Casino elite!" },
    40: { money: 200000, message: "🏆 Legendary gambler!" },
    50: { money: 500000, message: "🎰 Casino Master!" }
};

class LevelingSystem {
    constructor() {
        this.lastChatXp = new Map(); // Track last chat XP per user to prevent spam
    }

    /**
     * Handle game completion and award XP
     * RESTRICTED TO GUILD 1403244656845787167 ONLY
     */
    async handleGameComplete(userId, guildId, gameType, won, specialResult = null) {
        try {
            // GUILD RESTRICTION: Only process XP for the target guild
            if (guildId !== '1403244656845787167') {
                logger.debug(`Game XP system skipped - guild ${guildId} not in target guild, handled by UAS bot`);
                return null;
            }
            const config = XP_REWARDS.GAME_COMPLETION[gameType];
            if (!config) {
                logger.warn(`No XP config for game type: ${gameType}`);
                return null;
            }

            let totalXp = config.base;
            let reasons = [`${gameType} game`];

            // Add win bonus
            if (won) {
                totalXp += config.win_bonus;
                reasons.push('victory bonus');
            }

            // Special achievement bonuses
            if (specialResult) {
                if (specialResult === 'blackjack' && gameType === 'blackjack') {
                    totalXp += XP_REWARDS.SPECIAL_ACHIEVEMENTS.blackjack;
                    reasons.push('BLACKJACK!');
                } else if (specialResult === 'big_win') {
                    totalXp += XP_REWARDS.SPECIAL_ACHIEVEMENTS.big_win;
                    reasons.push('BIG WIN!');
                } else if (specialResult === 'massive_win') {
                    totalXp += XP_REWARDS.SPECIAL_ACHIEVEMENTS.massive_win;
                    reasons.push('MASSIVE WIN!');
                }
            }

            // Award XP with improved error handling
            let result = null;
            try {
                result = await dbManager.addXpToUser(userId, guildId, totalXp, reasons.join(', '));
                if (!result) {
                    logger.warn(`Failed to award XP to ${userId}, result was null`);
                    return null;
                }
            } catch (xpError) {
                logger.error(`Error awarding XP to ${userId}: ${xpError.message}`);
                return null;
            }
            
            // Update game stats with error handling
            try {
                await dbManager.updateGameStats(userId, guildId, won);
            } catch (statsError) {
                logger.warn(`Failed to update game stats for ${userId}: ${statsError.message}`);
            }

            logger.info(`Awarded ${totalXp} XP to ${userId} for ${reasons.join(', ')}`);
            return result;

        } catch (error) {
            logger.error(`Error handling game completion XP: ${error.message}`);
            return null;
        }
    }

    /**
     * Handle chat message and award XP (rate-limited)
     * RESTRICTED TO GUILD 1403244656845787167 ONLY
     */
    async handleChatMessage(userId, guildId, channelId) {
        try {
            // GUILD RESTRICTION: Only process XP for the target guild
            if (guildId !== '1403244656845787167') {
                logger.debug(`XP system skipped - guild ${guildId} not in target guild, handled by UAS bot`);
                return null;
            }
            
            const now = Date.now();
            const lastXp = this.lastChatXp.get(userId) || 0;
            
            // Rate limit: max once per minute
            if (now - lastXp < 60000) {
                return null;
            }

            this.lastChatXp.set(userId, now);

            const xpAmount = XP_REWARDS.CHAT_MESSAGE;
            try {
                const result = await dbManager.addXpToUser(userId, guildId, xpAmount, 'chat activity');
                if (!result) {
                    logger.debug(`Failed to award chat XP to ${userId}, result was null`);
                }
                return result;
            } catch (xpError) {
                logger.error(`Error awarding chat XP to ${userId}: ${xpError.message}`);
                return null;
            }

        } catch (error) {
            logger.error(`Error handling chat XP: ${error.message}`);
            return null;
        }
    }

    /**
     * Create level up embed
     */
    createLevelUpEmbed(user, newLevel, rewardText = null) {
        const embed = new EmbedBuilder()
            .setTitle('🎉 LEVEL UP!')
            .setDescription(`Congratulations ${user.displayName || user.username}! You've reached **Level ${newLevel}**!`)
            .setColor(0xFFD700)
            .setThumbnail(user.displayAvatarURL())
            .addFields(
                { name: '🆙 New Level', value: `**${newLevel}**`, inline: true },
                { name: '⭐ Status', value: this.getLevelStatus(newLevel), inline: true }
            )
            .setFooter({ text: '🎮 Keep playing to earn more XP!' })
            .setTimestamp();

        // Add reward text if provided
        if (rewardText) {
            embed.addFields({ name: '🎁 Reward', value: rewardText, inline: false });
        }

        // Add level-specific rewards
        const levelReward = LEVEL_REWARDS[newLevel];
        if (levelReward) {
            embed.addFields({ 
                name: '💰 Level Reward', 
                value: `${levelReward.message}\n+$${levelReward.money.toLocaleString()}`, 
                inline: false 
            });
        }

        return embed;
    }

    /**
     * Get level status description
     */
    getLevelStatus(level) {
        if (level >= 50) return '🎰 Casino Master';
        if (level >= 40) return '🏆 Legendary';
        if (level >= 30) return '👑 Elite';
        if (level >= 25) return '💎 Expert';
        if (level >= 20) return '⭐ Advanced';
        if (level >= 15) return '🚀 Experienced';
        if (level >= 10) return '💪 Skilled';
        if (level >= 5) return '🎯 Learning';
        return '🌱 Beginner';
    }

    /**
     * Add XP directly (for special events, admin commands, etc.)
     */
    async addXp(userId, guildId, xpAmount, reason = 'manual') {
        try {
            const result = await dbManager.addXpToUser(userId, guildId, xpAmount, reason);
            logger.info(`Manually added ${xpAmount} XP to ${userId} for ${reason}`);
            return result;
        } catch (error) {
            logger.error(`Error adding manual XP: ${error.message}`);
            return null;
        }
    }

    /**
     * Get user level data
     */
    async getUserLevel(userId, guildId) {
        try {
            return await dbManager.getUserLevel(userId, guildId);
        } catch (error) {
            logger.error(`Error getting user level: ${error.message}`);
            return {
                level: 1,
                xp: 0,
                total_xp: 0,
                games_played: 0,
                games_won: 0,
                messages_sent: 0,
                last_level_up: null,
                created_at: new Date(),
                updated_at: new Date()
            };
        }
    }

    /**
     * Calculate level from total XP
     */
    calculateLevel(totalXp) {
        return dbManager.calculateLevel(totalXp);
    }

    /**
     * Get XP needed for next level
     */
    calculateXpForNextLevel(totalXp) {
        return dbManager.calculateXpForNextLevel(totalXp);
    }

    /**
     * Get level leaderboard
     */
    async getLevelLeaderboard(guildId, limit = 10) {
        try {
            return await dbManager.getLevelLeaderboard(guildId, limit);
        } catch (error) {
            logger.error(`Error getting level leaderboard: ${error.message}`);
            return [];
        }
    }

    /**
     * Process level-up rewards
     */
    async processLevelUpRewards(userId, guildId, newLevel) {
        const levelReward = LEVEL_REWARDS[newLevel];
        if (levelReward && levelReward.money) {
            try {
                await dbManager.updateUserBalance(userId, guildId, levelReward.money, 0);
                logger.info(`Awarded level ${newLevel} reward of $${levelReward.money} to ${userId}`);
                return levelReward;
            } catch (error) {
                logger.error(`Error processing level reward: ${error.message}`);
            }
        }
        return null;
    }
}

// Export singleton instance
module.exports = new LevelingSystem();