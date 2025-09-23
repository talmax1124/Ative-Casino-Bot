/**
 * GAME UI ENHANCER
 * Simple helper to add protection information to any game embed
 * Drop-in solution for all game types
 */

const { fmt } = require('./common');
const protectionUI = require('./protectionUI');

class GameUIEnhancer {
    /**
     * Enhance any game embed with protection information
     * @param {Object} embed - Discord embed object
     * @param {Object} gameResult - Game result with protectionInfo
     * @param {Object} options - Enhancement options
     * @returns {Object} Enhanced embed
     */
    static enhanceGameEmbed(embed, gameResult, options = {}) {
        if (!gameResult.protectionInfo) {
            return embed; // No protection info to add
        }

        const { protectionInfo } = gameResult;
        const enhanced = { ...embed };

        // Add protection summary to footer
        if (protectionInfo.summary) {
            const currentFooter = enhanced.footer?.text || '';
            enhanced.footer = {
                ...enhanced.footer,
                text: currentFooter + (currentFooter ? ' • ' : '') + protectionInfo.summary
            };
        }

        // Add protection field for very wealthy players with big wins
        if (protectionInfo.showDetails && 
            gameResult.won && 
            gameResult.payout > (gameResult.betAmount || 0) * 2) {
            
            if (!enhanced.fields) enhanced.fields = [];
            enhanced.fields.push({
                name: '🛡️ Wealth Protection',
                value: `Active for ${fmt(protectionInfo.wealth)} wealth\nProgressive scaling in effect`,
                inline: true
            });
        }

        // Add tax information for large wins
        if (gameResult.won && gameResult.taxInfo && gameResult.taxInfo.taxAmount > 0) {
            if (!enhanced.fields) enhanced.fields = [];
            enhanced.fields.push({
                name: '💰 Progressive Tax',
                value: `Tax: ${fmt(gameResult.taxInfo.taxAmount)} (${gameResult.taxInfo.taxRate.toFixed(1)}%)\nAfter Tax: ${fmt(gameResult.taxInfo.afterTaxWin)}`,
                inline: false
            });
        }

        // Adjust color based on protection level
        if (protectionInfo.wealth > 10_000_000) {
            enhanced.color = protectionUI.getProtectionColor(protectionInfo.wealth);
        }

        return enhanced;
    }

    /**
     * Add protection indicator to embed title
     * @param {string} title - Original title
     * @param {Object} protectionInfo - Protection information
     * @returns {string} Enhanced title
     */
    static enhanceTitle(title, protectionInfo) {
        if (!protectionInfo || protectionInfo.wealth < 25_000_000) {
            return title;
        }

        const indicator = protectionUI.createCompactIndicator(
            protectionInfo.wealth, 
            protectionInfo.difficulty || 1.0
        );
        
        return indicator ? `${title} ${indicator}` : title;
    }

    /**
     * Get protection-aware embed color
     * @param {Object} protectionInfo - Protection information
     * @param {number} defaultColor - Default color if no protection
     * @returns {number} Discord color code
     */
    static getProtectionColor(protectionInfo, defaultColor = 0x00ff00) {
        if (!protectionInfo || protectionInfo.wealth < 10_000_000) {
            return defaultColor;
        }

        return protectionUI.getProtectionColor(protectionInfo.wealth);
    }

    /**
     * Create protection warning for high-wealth players
     * @param {Object} protectionInfo - Protection information
     * @returns {string|null} Warning text or null
     */
    static createProtectionWarning(protectionInfo) {
        if (!protectionInfo || protectionInfo.wealth < 100_000_000) {
            return null;
        }

        const billionaireProgress = (protectionInfo.wealth / 1_000_000_000) * 100;
        
        if (billionaireProgress > 90) {
            return '⚠️ **Extreme wealth detected** - Maximum protection protocols active';
        } else if (billionaireProgress > 75) {
            return '🔴 **High wealth warning** - Advanced protection systems engaged';
        } else if (billionaireProgress > 50) {
            return '🟡 **Wealth protection active** - Progressive scaling in effect';
        }
        
        return null;
    }
}

module.exports = GameUIEnhancer;