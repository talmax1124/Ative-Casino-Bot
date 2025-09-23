/**
 * PROTECTION UI ENHANCEMENT SYSTEM
 * Adds protection level indicators and tax information to game results
 * Shows players their current protection status transparently
 */

const { fmt } = require('./common');
const antiBillionaireSystem = require('./antiBillionaireSystem');
const progressiveDifficultyScaling = require('./progressiveDifficultyScaling');

class ProtectionUI {
    constructor() {
        // UI display thresholds - when to start showing protection info
        this.displayThresholds = {
            wealthWarning: 5_000_000,      // Show wealth status at $5M+
            protectionInfo: 10_000_000,    // Show protection details at $10M+
            taxInfo: 100_000,              // Show tax info for $100K+ wins
            difficultyInfo: 25_000_000     // Show difficulty scaling at $25M+
        };

        // UI color schemes based on protection level
        this.protectionColors = {
            safe: 0x00ff00,      // Green - no protection
            caution: 0xffff00,   // Yellow - light protection  
            danger: 0xff6600,    // Orange - moderate protection
            critical: 0xff0000,  // Red - heavy protection
            prevention: 0x800080 // Purple - maximum protection
        };

        // Emoji indicators for different protection levels
        this.protectionEmojis = {
            'Safe Zone': '🟢',
            'Caution Zone': '🟡', 
            'Danger Zone': '🟠',
            'Critical Zone': '🔴',
            'Billionaire Prevention Zone': '🟣'
        };
    }

    /**
     * Enhance game embed with protection information
     * @param {Object} baseEmbed - Base game embed data
     * @param {string} userId - Player ID
     * @param {number} currentWealth - Player's current wealth
     * @param {number} betAmount - Amount bet
     * @param {Object} gameResult - Game result data
     * @returns {Object} Enhanced embed data
     */
    async enhanceGameEmbed(baseEmbed, userId, currentWealth, betAmount, gameResult) {
        try {
            // Only enhance for players above threshold
            if (currentWealth < this.displayThresholds.wealthWarning) {
                return baseEmbed; // No enhancement needed
            }

            const enhancement = {
                additionalFields: [],
                footerAddition: '',
                colorOverride: null
            };

            // Get protection analysis
            const protectionData = await this.getProtectionData(userId, currentWealth, betAmount, gameResult.gameType);

            // Add wealth status indicator
            if (currentWealth >= this.displayThresholds.wealthWarning) {
                enhancement.additionalFields.push(this.createWealthStatusField(currentWealth, protectionData));
            }

            // Add protection level indicator
            if (currentWealth >= this.displayThresholds.protectionInfo) {
                enhancement.additionalFields.push(this.createProtectionField(protectionData));
            }

            // Add difficulty information
            if (currentWealth >= this.displayThresholds.difficultyInfo && protectionData.difficulty.totalMultiplier > 1.1) {
                enhancement.additionalFields.push(this.createDifficultyField(protectionData.difficulty));
            }

            // Add tax information for large wins
            if (gameResult.won && gameResult.payout > betAmount + this.displayThresholds.taxInfo) {
                const winAmount = gameResult.payout - betAmount;
                const taxInfo = progressiveDifficultyScaling.calculateProgressiveTax(winAmount, currentWealth);
                
                if (taxInfo.taxAmount > 0) {
                    enhancement.additionalFields.push(this.createTaxField(taxInfo, winAmount));
                }
            }

            // Add footer enhancement
            enhancement.footerAddition = this.createFooterAddition(protectionData);

            // Override color for high protection levels
            if (protectionData.zone && this.protectionColors[protectionData.zone.toLowerCase().replace(' ', '')]) {
                enhancement.colorOverride = this.protectionColors[protectionData.zone.toLowerCase().replace(' ', '')];
            }

            // Apply enhancements to base embed
            return this.applyEnhancements(baseEmbed, enhancement);

        } catch (error) {
            console.error('Protection UI enhancement error:', error.message);
            return baseEmbed; // Return original embed if enhancement fails
        }
    }

    /**
     * Get protection data for UI display
     * @param {string} userId - Player ID
     * @param {number} currentWealth - Current wealth
     * @param {number} betAmount - Bet amount
     * @param {string} gameType - Game type
     * @returns {Object} Protection data
     */
    async getProtectionData(userId, currentWealth, betAmount, gameType) {
        const difficulty = await antiBillionaireSystem.calculateAntiBillionaireDifficulty(
            userId, currentWealth, betAmount, gameType
        );

        const zone = antiBillionaireSystem.getWealthZone(currentWealth);
        const wealthPercentile = this.calculateWealthPercentile(currentWealth);

        return {
            zone: zone.name,
            difficulty,
            wealthPercentile,
            billionaireProgress: (currentWealth / 1_000_000_000) * 100
        };
    }

    /**
     * Create wealth status field
     * @param {number} currentWealth - Current wealth
     * @param {Object} protectionData - Protection data
     * @returns {Object} Field data
     */
    createWealthStatusField(currentWealth, protectionData) {
        const emoji = this.protectionEmojis[protectionData.zone] || '⚪';
        const percentile = protectionData.wealthPercentile;
        
        return {
            name: `${emoji} Wealth Status`,
            value: `**${fmt(currentWealth)}** (Top ${(100 - percentile).toFixed(1)}%)`,
            inline: true
        };
    }

    /**
     * Create protection level field
     * @param {Object} protectionData - Protection data
     * @returns {Object} Field data
     */
    createProtectionField(protectionData) {
        const emoji = this.protectionEmojis[protectionData.zone] || '⚪';
        
        return {
            name: `${emoji} Protection Level`,
            value: `**${protectionData.zone}**\n${protectionData.difficulty.explanation.slice(0, 2).join('\n')}`,
            inline: true
        };
    }

    /**
     * Create difficulty field
     * @param {Object} difficulty - Difficulty data
     * @returns {Object} Field data
     */
    createDifficultyField(difficulty) {
        const difficultyPercent = ((difficulty.totalMultiplier - 1) * 100).toFixed(0);
        
        return {
            name: '🎯 Current Difficulty',
            value: `**${difficultyPercent}%** harder than base odds\n*Progressive scaling active*`,
            inline: true
        };
    }

    /**
     * Create tax information field
     * @param {Object} taxInfo - Tax calculation result
     * @param {number} winAmount - Original win amount
     * @returns {Object} Field data
     */
    createTaxField(taxInfo, winAmount) {
        return {
            name: '💰 Win Tax Applied',
            value: `**Before Tax**: ${fmt(winAmount)}\n**Tax**: ${fmt(taxInfo.taxAmount)} (${taxInfo.taxRate.toFixed(1)}%)\n**After Tax**: ${fmt(taxInfo.afterTaxWin)}`,
            inline: false
        };
    }

    /**
     * Create footer addition
     * @param {Object} protectionData - Protection data
     * @returns {string} Footer text
     */
    createFooterAddition(protectionData) {
        if (protectionData.billionaireProgress > 75) {
            return ` • ${protectionData.billionaireProgress.toFixed(1)}% to billionaire status`;
        } else if (protectionData.zone !== 'Safe Zone') {
            return ` • Wealth protection active`;
        }
        return '';
    }

    /**
     * Apply enhancements to base embed
     * @param {Object} baseEmbed - Original embed
     * @param {Object} enhancement - Enhancement data
     * @returns {Object} Enhanced embed
     */
    applyEnhancements(baseEmbed, enhancement) {
        const enhanced = { ...baseEmbed };

        // Add additional fields
        if (enhancement.additionalFields.length > 0) {
            if (!enhanced.bankFields) enhanced.bankFields = [];
            enhanced.bankFields.push(...enhancement.additionalFields);
        }

        // Add footer enhancement
        if (enhancement.footerAddition) {
            enhanced.economicFooter = (enhanced.economicFooter || '') + enhancement.footerAddition;
        }

        // Override color if specified
        if (enhancement.colorOverride) {
            enhanced.color = enhancement.colorOverride;
        }

        return enhanced;
    }

    /**
     * Create protection summary for any game type
     * @param {string} userId - Player ID
     * @param {number} currentWealth - Current wealth
     * @param {string} gameType - Game type
     * @returns {string} Protection summary text
     */
    async createProtectionSummary(userId, currentWealth, gameType = 'slots') {
        if (currentWealth < this.displayThresholds.protectionInfo) {
            return ''; // No summary needed
        }

        try {
            const protectionData = await this.getProtectionData(userId, currentWealth, 1000000, gameType);
            const emoji = this.protectionEmojis[protectionData.zone] || '⚪';
            
            if (protectionData.difficulty.totalMultiplier > 1.1) {
                const difficultyPercent = ((protectionData.difficulty.totalMultiplier - 1) * 100).toFixed(0);
                return `${emoji} ${protectionData.zone} • ${difficultyPercent}% harder`;
            } else {
                return `${emoji} ${protectionData.zone}`;
            }
        } catch (error) {
            return '';
        }
    }

    /**
     * Get wealth percentile (simplified)
     * @param {number} wealth - Wealth amount
     * @returns {number} Percentile
     */
    calculateWealthPercentile(wealth) {
        if (wealth < 100_000) return 20;
        if (wealth < 1_000_000) return 50;
        if (wealth < 5_000_000) return 80;
        if (wealth < 25_000_000) return 95;
        if (wealth < 100_000_000) return 98;
        if (wealth < 500_000_000) return 99.5;
        return 99.9;
    }

    /**
     * Get protection color for a wealth level
     * @param {number} wealth - Wealth amount
     * @returns {number} Discord color code
     */
    getProtectionColor(wealth) {
        if (wealth < 10_000_000) return this.protectionColors.safe;
        if (wealth < 50_000_000) return this.protectionColors.caution;
        if (wealth < 250_000_000) return this.protectionColors.danger;
        if (wealth < 750_000_000) return this.protectionColors.critical;
        return this.protectionColors.prevention;
    }

    /**
     * Create minimal protection indicator for space-constrained UIs
     * @param {number} wealth - Player wealth
     * @param {number} difficulty - Difficulty multiplier
     * @returns {string} Compact indicator
     */
    createCompactIndicator(wealth, difficulty = 1.0) {
        if (wealth < this.displayThresholds.protectionInfo) return '';
        
        const zone = antiBillionaireSystem.getWealthZone(wealth);
        const emoji = this.protectionEmojis[zone.name] || '⚪';
        
        if (difficulty > 1.1) {
            const difficultyPercent = ((difficulty - 1) * 100).toFixed(0);
            return `${emoji}+${difficultyPercent}%`;
        }
        
        return emoji;
    }
}

// Export singleton
module.exports = new ProtectionUI();