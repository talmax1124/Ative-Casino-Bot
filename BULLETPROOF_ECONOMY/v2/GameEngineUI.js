/**
 * Game Engine UI Adapter
 *
 * Dynamically adjusts game UI displays to show wealth-adjusted multipliers
 * Provides transparency to users about how their wealth affects game outcomes
 */

const logger = require('../../UTILS/logger');

class GameEngineUI {
    constructor(gameBalanceController) {
        this.balanceController = gameBalanceController;
    }

    /**
     * Format multiplier for display
     */
    formatMultiplier(multiplier) {
        return `${multiplier.toFixed(2)}x`;
    }

    /**
     * Format currency for display
     */
    formatCurrency(amount) {
        if (amount >= 1000000000) {
            return `$${(amount / 1000000000).toFixed(2)}B`;
        } else if (amount >= 1000000) {
            return `$${(amount / 1000000).toFixed(2)}M`;
        } else if (amount >= 1000) {
            return `$${(amount / 1000).toFixed(1)}K`;
        }
        return `$${amount.toLocaleString()}`;
    }

    /**
     * SLOTS: Generate adjusted slot symbols display
     */
    async generateSlotsUI(userId, guildId, baseSymbols) {
        const adjusted = await this.balanceController.getAdjustedSlotMultipliers(
            userId,
            guildId,
            baseSymbols
        );

        const wealthInfo = this.balanceController.getWealthBracketInfo(adjusted.wealth);

        // Build symbols display
        const symbolsDisplay = [];
        for (const [key, symbolData] of Object.entries(adjusted.symbols)) {
            const emoji = symbolData.emoji || '?';
            const name = symbolData.name || key;
            const basePayout = symbolData.basePayout || 1.0;
            const adjustedPayout = symbolData.payout || 1.0;

            // Show both base and adjusted if different
            let payoutText;
            if (Math.abs(basePayout - adjustedPayout) < 0.01) {
                payoutText = this.formatMultiplier(adjustedPayout);
            } else {
                payoutText = `~~${this.formatMultiplier(basePayout)}~~ → **${this.formatMultiplier(adjustedPayout)}**`;
            }

            symbolsDisplay.push(`${emoji} ${name}: ${payoutText}`);
        }

        return {
            symbolsDisplay: symbolsDisplay,
            wealthInfo: wealthInfo,
            embed: this.createWealthInfoEmbed(wealthInfo, 'Slots'),
            adjustedSymbols: adjusted.symbols
        };
    }

    /**
     * BLACKJACK: Generate adjusted blackjack display
     */
    async generateBlackjackUI(userId, guildId, baseModeConfig) {
        const adjusted = await this.balanceController.getAdjustedBlackjackMultipliers(
            userId,
            guildId,
            baseModeConfig
        );

        const wealthInfo = this.balanceController.getWealthBracketInfo(adjusted.wealth);

        // Build payouts display
        const payoutsDisplay = [];

        // Blackjack payout
        const baseBJ = adjusted.modeConfig.originalBlackjackMultiplier || 2.5;
        const adjBJ = adjusted.modeConfig.blackjackMultiplier;
        if (Math.abs(baseBJ - adjBJ) < 0.01) {
            payoutsDisplay.push(`🎰 Blackjack: **${this.formatMultiplier(adjBJ)}**`);
        } else {
            payoutsDisplay.push(`🎰 Blackjack: ~~${this.formatMultiplier(baseBJ)}~~ → **${this.formatMultiplier(adjBJ)}**`);
        }

        // Win payout
        const baseWin = adjusted.modeConfig.originalWinMultiplier || 2.0;
        const adjWin = adjusted.modeConfig.winMultiplier;
        if (Math.abs(baseWin - adjWin) < 0.01) {
            payoutsDisplay.push(`✅ Win: **${this.formatMultiplier(adjWin)}**`);
        } else {
            payoutsDisplay.push(`✅ Win: ~~${this.formatMultiplier(baseWin)}~~ → **${this.formatMultiplier(adjWin)}**`);
        }

        // House edge
        const houseEdgePercent = (adjusted.modeConfig.houseEdge * 100).toFixed(1);
        payoutsDisplay.push(`🏦 House Edge: **${houseEdgePercent}%**`);

        return {
            payoutsDisplay: payoutsDisplay,
            wealthInfo: wealthInfo,
            embed: this.createWealthInfoEmbed(wealthInfo, 'Blackjack'),
            adjustedConfig: adjusted.modeConfig
        };
    }

    /**
     * ROULETTE: Generate adjusted roulette display with all bet types
     */
    async generateRouletteUI(userId, guildId) {
        const wealth = await this.balanceController.getUserWealth(userId, guildId);
        const wealthInfo = this.balanceController.getWealthBracketInfo(wealth);

        // Define all bet types with base payouts
        const betTypes = [
            { name: 'Red/Black', type: 'red', base: 2 },
            { name: 'Odd/Even', type: 'odd', base: 2 },
            { name: 'Low/High', type: 'low', base: 2 },
            { name: 'Dozen', type: 'dozen1', base: 3 },
            { name: 'Column', type: 'column1', base: 3 },
            { name: 'Single Number', type: 'number', base: 36 },
            { name: 'Green (0/00)', type: 'green', base: 36 },
            { name: 'Basket', type: 'basket', base: 7 }
        ];

        const payoutsDisplay = [];

        for (const bet of betTypes) {
            const adjusted = await this.balanceController.getAdjustedRouletteMultipliers(
                userId,
                guildId,
                bet.base,
                bet.type
            );

            // Show base vs adjusted
            if (Math.abs(bet.base - adjusted.adjustedPayout) < 0.01) {
                payoutsDisplay.push(`**${bet.name}**: ${this.formatMultiplier(adjusted.adjustedPayout)}`);
            } else {
                payoutsDisplay.push(`**${bet.name}**: ~~${this.formatMultiplier(bet.base)}~~ → **${this.formatMultiplier(adjusted.adjustedPayout)}**`);
            }
        }

        // House edge
        const houseEdgePercent = (wealthInfo.houseEdge * 100).toFixed(1);
        payoutsDisplay.push(`\n🏦 House Edge: **${houseEdgePercent}%**`);

        return {
            payoutsDisplay: payoutsDisplay,
            wealthInfo: wealthInfo,
            embed: this.createWealthInfoEmbed(wealthInfo, 'Roulette'),
            adjustedPayouts: payoutsDisplay
        };
    }

    /**
     * Create wealth info embed for any game
     */
    createWealthInfoEmbed(wealthInfo, gameName) {
        const embed = {
            title: `💰 ${gameName} - Wealth Adjustment`,
            color: this.getWealthColor(wealthInfo.totalWealth),
            fields: [
                {
                    name: '💎 Your Wealth',
                    value: `${this.formatCurrency(wealthInfo.totalWealth)} (${wealthInfo.bracketName})`,
                    inline: true
                },
                {
                    name: '🎰 Multiplier Scale',
                    value: `${wealthInfo.multiplierPercent}% of base`,
                    inline: true
                },
                {
                    name: '🏦 House Edge',
                    value: `${wealthInfo.houseEdgePercent}%`,
                    inline: true
                },
                {
                    name: 'ℹ️ Info',
                    value: wealthInfo.message,
                    inline: false
                }
            ],
            footer: {
                text: 'Game multipliers automatically adjust based on your total wealth'
            }
        };

        return embed;
    }

    /**
     * Get color based on wealth tier
     */
    getWealthColor(wealth) {
        if (wealth < 1000000) return 0x2ECC71;         // Green - beginner
        if (wealth < 10000000) return 0x3498DB;        // Blue - growing
        if (wealth < 50000000) return 0x9B59B6;        // Purple - established
        if (wealth < 100000000) return 0xF39C12;       // Orange - wealthy
        if (wealth < 500000000) return 0xE67E22;       // Dark orange - very wealthy
        if (wealth < 1000000000) return 0xE74C3C;      // Red - ultra rich
        if (wealth < 5000000000) return 0xC0392B;      // Dark red - billionaire
        return 0x8B0000;                                // Dark red - mega billionaire
    }

    /**
     * Generate bet preview with adjusted payout
     */
    async generateBetPreview(userId, guildId, betAmount, baseMultiplier, gameType) {
        const wealth = await this.balanceController.getUserWealth(userId, guildId);
        const payout = this.balanceController.calculateAdjustedPayout(
            betAmount,
            baseMultiplier,
            wealth,
            gameType
        );

        const embed = {
            title: '🎲 Bet Preview',
            color: 0x3498DB,
            fields: [
                {
                    name: '💵 Bet Amount',
                    value: this.formatCurrency(betAmount),
                    inline: true
                },
                {
                    name: '🎰 Base Multiplier',
                    value: this.formatMultiplier(baseMultiplier),
                    inline: true
                },
                {
                    name: '✨ Adjusted Multiplier',
                    value: this.formatMultiplier(payout.adjustedMultiplier),
                    inline: true
                },
                {
                    name: '💰 Potential Gross Win',
                    value: this.formatCurrency(payout.grossPayout),
                    inline: true
                },
                {
                    name: '🏦 House Edge',
                    value: `${(payout.houseEdge * 100).toFixed(1)}% (-${this.formatCurrency(payout.houseEdgeAmount)})`,
                    inline: true
                },
                {
                    name: '💵 Net Payout',
                    value: `**${this.formatCurrency(payout.netPayout)}**`,
                    inline: true
                },
                {
                    name: '📊 Effective Multiplier',
                    value: this.formatMultiplier(payout.effectiveMultiplier),
                    inline: false
                }
            ],
            footer: {
                text: `Your wealth: ${this.formatCurrency(wealth)} | Scale: ${(payout.multiplierScale * 100).toFixed(0)}%`
            }
        };

        return {
            embed: embed,
            payout: payout
        };
    }

    /**
     * Generate comparison table showing how payouts change with wealth
     */
    generateWealthComparisonTable(betAmount = 1000000, game = 'roulette_number') {
        const wealthLevels = [
            { wealth: 500000, label: '$500K' },
            { wealth: 5000000, label: '$5M' },
            { wealth: 25000000, label: '$25M' },
            { wealth: 100000000, label: '$100M' },
            { wealth: 500000000, label: '$500M' },
            { wealth: 2000000000, label: '$2B' },
            { wealth: 10000000000, label: '$10B' }
        ];

        const comparison = wealthLevels.map(level => {
            const calc = this.balanceController.getExampleCalculation(
                level.wealth,
                game,
                betAmount
            );

            return {
                wealth: level.label,
                scale: `${(calc.multiplierScale * 100).toFixed(0)}%`,
                multiplier: this.formatMultiplier(calc.adjustedMultiplier),
                grossPayout: this.formatCurrency(calc.grossPayout),
                houseEdge: `${(calc.houseEdge * 100).toFixed(1)}%`,
                netPayout: this.formatCurrency(calc.netPayout),
                effectiveMultiplier: this.formatMultiplier(calc.effectiveMultiplier)
            };
        });

        // Format as table
        let table = '```\n';
        table += 'Wealth    Scale  Multiplier  Net Payout   Effective\n';
        table += '─'.repeat(55) + '\n';

        for (const row of comparison) {
            table += `${row.wealth.padEnd(9)} ${row.scale.padEnd(6)} ${row.multiplier.padEnd(11)} ${row.netPayout.padEnd(12)} ${row.effectiveMultiplier}\n`;
        }

        table += '```';

        return {
            table: table,
            comparison: comparison
        };
    }

    /**
     * Generate informational embed about the wealth system
     */
    generateWealthSystemInfo() {
        return {
            title: '💰 Wealth-Based Game Balance System',
            color: 0x3498DB,
            description: 'Game multipliers and house edge automatically adjust based on your total wealth. This creates a balanced economy where millions are sustainable, but billions naturally drain over time.',
            fields: [
                {
                    name: '🌱 Beginner (<$1M)',
                    value: '**100% multipliers** - Full game odds! Build your fortune!\nHouse Edge: 0.5%',
                    inline: false
                },
                {
                    name: '📈 Growing ($1M-$10M)',
                    value: '**90-95% multipliers** - Slight reduction, still very playable\nHouse Edge: 1%',
                    inline: false
                },
                {
                    name: '💼 Established ($10M-$50M)',
                    value: '**70-80% multipliers** - Moderate scaling, maintain wisely\nHouse Edge: 2%',
                    inline: false
                },
                {
                    name: '💎 Wealthy ($50M-$100M)',
                    value: '**55% multipliers** - Significant reduction, big wins harder\nHouse Edge: 3.5%',
                    inline: false
                },
                {
                    name: '🏆 Very Wealthy ($100M-$500M)',
                    value: '**25-40% multipliers** - Heavy scaling, risky to gamble\nHouse Edge: 5%',
                    inline: false
                },
                {
                    name: '👑 Ultra Rich ($500M-$1B)',
                    value: '**15% multipliers** - Severe reduction, difficult to maintain\nHouse Edge: 8%',
                    inline: false
                },
                {
                    name: '🚀 Billionaire ($1B+)',
                    value: '**4-8% multipliers** - Maximum reduction, billions cannot be sustained\nHouse Edge: 12-15%',
                    inline: false
                },
                {
                    name: '❓ Why This System?',
                    value: 'Without max bet limits, wealthy players could exploit games. This system allows unlimited betting but ensures the wealthier you are, the less favorable odds become. Millions remain fun and sustainable!',
                    inline: false
                }
            ],
            footer: {
                text: 'Use /economy info to see your current multiplier scale'
            }
        };
    }
}

module.exports = GameEngineUI;
