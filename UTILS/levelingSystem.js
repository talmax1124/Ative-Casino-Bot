/**
 * Leveling System Stub for Casino Bot
 * XP system moved to UAS bot - this is just a placeholder
 */

const logger = require('./logger');

class LevelingSystemStub {
    async handleGameComplete(userId, guildId, gameType, won, specialResult = null) {
        // XP system moved to UAS bot
        logger.debug(`XP system moved to UAS bot - skipping XP for ${userId} in ${gameType}`);
        return null; // No XP result since it's handled by UAS now
    }

    async handleChatMessage(userId, guildId, channelId) {
        // XP system moved to UAS bot
        logger.debug(`XP system moved to UAS bot - skipping chat XP for ${userId}`);
        return null;
    }

    createLevelUpEmbed(user, newLevel, rewardText = null) {
        // This should never be called since handleGameComplete returns null
        logger.warn(`createLevelUpEmbed called but XP system moved to UAS bot`);
        return null;
    }

    async addXp(userId, guildId, xpAmount, reason = 'unknown') {
        // XP system moved to UAS bot
        logger.debug(`XP system moved to UAS bot - skipping ${xpAmount} XP for ${userId}`);
        return null;
    }

    async getUserLevel(userId, guildId) {
        // XP system moved to UAS bot
        logger.debug(`XP system moved to UAS bot - returning default level for ${userId}`);
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

// Export singleton instance
module.exports = new LevelingSystemStub();