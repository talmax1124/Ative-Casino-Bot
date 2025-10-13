/**
 * Economic Stability Manager
 * Smooths player profits over time to prevent runaway multi-trillion growth
 * without resorting to hard lockouts or aggressive penalties.
 */

const logger = require('./logger');

class EconomicStabilityManager {
    constructor(options = {}) {
        this.playerProfiles = new Map();
        this.config = Object.assign({
            halfLifeMs: 6 * 60 * 60 * 1000,   // Profits decay by 50% every 6 hours
            softCap: 200_000_000,            // Soft guard starts at 200M profit
            hardCap: 500_000_000,            // Strong guard kicks in at 500M profit
            extremeCap: 1_000_000_000,       // Extreme guard past 1B profit
            comebackBoostFloor: -150_000_000,// Offer boosts to players down more than 150M
            maxBoost: 0.12,                  // Maximum additional payout boost (+12%)
            minMultiplier: 0.85,             // Never reduce payouts below 85% of original
            maxMultiplier: 1.25,             // Cap boosts at +25%
            maxHouseEdgeOffset: 0.04         // Cap any extra house edge at +4%
        }, options);
    }

    /**
     * Fetch or initialize a player's rolling profile.
     */
    getProfile(userId) {
        if (!this.playerProfiles.has(userId)) {
            this.playerProfiles.set(userId, {
                rollingProfit: 0,
                lastUpdate: Date.now()
            });
        }
        return this.playerProfiles.get(userId);
    }

    /**
     * Apply exponential decay to rolling profit to keep it time-bound.
     */
    decayProfile(profile) {
        const now = Date.now();
        const elapsed = now - profile.lastUpdate;
        if (elapsed <= 0) return;

        const decayFactor = Math.pow(0.5, elapsed / this.config.halfLifeMs);
        profile.rollingProfit *= decayFactor;
        profile.lastUpdate = now;
    }

    /**
     * Register the latest game result (profitDelta > 0 for wins, < 0 for losses).
     */
    registerResult(userId, profitDelta) {
        if (!Number.isFinite(profitDelta)) return;

        const profile = this.getProfile(userId);
        this.decayProfile(profile);
        profile.rollingProfit += profitDelta;

        // Clean up near-zero noise
        if (Math.abs(profile.rollingProfit) < 1) {
            this.playerProfiles.delete(userId);
        }
    }

    /**
     * Determine house edge offsets and payout multipliers based on rolling profit.
     */
    getAdjustments(userId) {
        const profile = this.getProfile(userId);
        this.decayProfile(profile);

        const { rollingProfit } = profile;
        let payoutMultiplier = 1.0;
        let houseEdgeOffset = 0.0;
        let rationale = 'neutral';

        if (rollingProfit >= this.config.extremeCap) {
            payoutMultiplier = Math.max(this.config.minMultiplier, 0.88);
            houseEdgeOffset = Math.min(this.config.maxHouseEdgeOffset, 0.03);
            rationale = 'extreme_guard';
        } else if (rollingProfit >= this.config.hardCap) {
            payoutMultiplier = Math.max(this.config.minMultiplier, 0.92);
            houseEdgeOffset = Math.min(this.config.maxHouseEdgeOffset, 0.02);
            rationale = 'hard_guard';
        } else if (rollingProfit >= this.config.softCap) {
            payoutMultiplier = Math.max(this.config.minMultiplier, 0.96);
            houseEdgeOffset = Math.min(this.config.maxHouseEdgeOffset, 0.01);
            rationale = 'soft_guard';
        } else if (rollingProfit <= this.config.comebackBoostFloor) {
            const deficitMagnitude = Math.min(
                Math.abs(rollingProfit - this.config.comebackBoostFloor),
                Math.abs(this.config.comebackBoostFloor) * 3
            );
            const boost = Math.min(this.config.maxBoost, deficitMagnitude / 600_000_000);
            payoutMultiplier = Math.min(this.config.maxMultiplier, 1 + boost);
            houseEdgeOffset = -Math.min(0.015, boost / 2);
            rationale = 'comeback';
        }

        return {
            payoutMultiplier,
            houseEdgeOffset,
            rollingProfit,
            rationale
        };
    }
}

module.exports = EconomicStabilityManager;
