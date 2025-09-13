/**
 * ECONOMY ANALYZER & OPTIMIZER for Discord.js Casino Bot
 * 
 * DO-NOT-CROSS RULES (NON-NEGOTIABLE):
 * - NEVER reset balances, NEVER wipe users, NEVER alter historical data
 * - Only apply small, incremental tuning patches (no big jumps)
 * - All data comes from MariaDB. Writes only to 'tuning' and 'regulator_log' tables
 * - Any AI (ChatGPT) use must follow the ChatGPT Advisor Protocol
 */

const mysql = require('mysql2/promise');
const OpenAI = require('openai');
const logger = require('../UTILS/logger');

class EconomyOptimizer {
    constructor(config = {}) {
        this.config = {
            // Database connection (uses existing pool from databaseAdapter)
            useExistingConnection: true,
            
            // Policy bands
            minSlotsRTP: 0.92,
            maxSlotsRTP: 0.96,
            minRouletteRTP: 0.94,
            maxRouletteRTP: 0.97,
            minBlackjackRTP: 0.98,
            maxBlackjackRTP: 1.02,
            minOverallRTP: 0.85,
            maxOverallRTP: 1.05,
            
            // Tuning limits (small incremental patches only)
            maxPayoutMultDelta: 0.01,      // ±1% per run
            maxWinOddsDelta: 0.005,        // ±0.5% per run
            maxFeePctDelta: 0.25,          // ±0.25 basis points per run
            maxNewbieBoostDelta: 1.0,      // ±1.0% per run
            maxBetDelta: 0.20,             // ±20% per run
            maxFeePct: 5.0,                // Fee percentage ceiling
            
            // Target metrics
            targetSupplyGrowth: 5.0,       // +5% per day target
            targetGiniIndex: 0.72,         // Maximum inequality
            
            // ChatGPT configuration
            openaiApiKey: process.env.OPENAI_API_KEY,
            chatgptModel: 'gpt-4o-mini',
            maxTokens: 300,
            temperature: 0.3,
            
            // Safety limits
            maxPayloadSize: 1536,          // 1.5KB max to ChatGPT
            chatgptCallLimit: 1,           // Once per 24h
            lastChatGPTCall: 0,
            
            ...config
        };
        
        this.db = null;
        this.openai = null;
        this.initialized = false;
        
        // Rate limiting for OpenAI API calls
        this.lastAPICall = 0;
        this.minTimeBetweenCalls = 2000; // 2 seconds between calls
        this.apiCallQueue = [];
        
        if (this.config.openaiApiKey) {
            this.openai = new OpenAI({
                apiKey: this.config.openaiApiKey
            });
        }
    }

    /**
     * Initialize the economy optimizer
     */
    async initialize() {
        if (this.initialized) return;
        
        try {
            // Get database connection from existing adapter
            const databaseAdapter = require('../UTILS/databaseAdapter');
            if (!databaseAdapter.pool) {
                throw new Error('Database adapter not initialized');
            }
            this.db = databaseAdapter.pool;
            
            // Initialize required tables
            await this.initializeSchema();
            
            this.initialized = true;
            logger.info('Economy Optimizer initialized');
            
        } catch (error) {
            logger.error(`Economy Optimizer initialization failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Initialize required database schema for tuning system
     */
    async initializeSchema() {
        const tables = [
            // Tuning table for storing economic adjustments
            `CREATE TABLE IF NOT EXISTS tuning (
                scope VARCHAR(32) NOT NULL,
                key_name VARCHAR(32) NOT NULL,
                value DOUBLE NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (scope, key_name)
            ) ENGINE=InnoDB`,
            
            // Regulator log for audit trail
            `CREATE TABLE IF NOT EXISTS regulator_log (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                ts DATETIME DEFAULT CURRENT_TIMESTAMP,
                action VARCHAR(64) NOT NULL,
                payload JSON NOT NULL,
                INDEX idx_ts (ts),
                INDEX idx_action (action)
            ) ENGINE=InnoDB`,
            
            // Transactions table (ensure it exists with proper indexes)
            `CREATE TABLE IF NOT EXISTS transactions (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT NOT NULL,
                game VARCHAR(32),
                type ENUM('bet','payout','fee','transfer','bonus') NOT NULL,
                amount BIGINT NOT NULL,
                ts DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_ts (ts),
                INDEX idx_game_ts (game, ts),
                INDEX idx_user_ts (user_id, ts),
                INDEX idx_type_ts (type, ts)
            ) ENGINE=InnoDB`,
            
            // Game stats daily table for aggregated metrics
            `CREATE TABLE IF NOT EXISTS game_stats_daily (
                day DATE NOT NULL,
                game VARCHAR(32) NOT NULL,
                stakes BIGINT NOT NULL DEFAULT 0,
                payouts BIGINT NOT NULL DEFAULT 0,
                spins BIGINT NOT NULL DEFAULT 0,
                unique_players INT NOT NULL DEFAULT 0,
                PRIMARY KEY (day, game),
                INDEX idx_day (day),
                INDEX idx_game (game)
            ) ENGINE=InnoDB`
        ];

        for (const table of tables) {
            try {
                await this.db.execute(table);
            } catch (error) {
                // Ignore table already exists errors
                if (!error.message.includes('already exists')) {
                    logger.error(`Failed to create table: ${error.message}`);
                    throw error;
                }
            }
        }

        logger.info('Economy Optimizer schema initialized');
    }

    /**
     * Main action loop - compute KPIs, generate patches, apply best one
     */
    async runOptimizationCycle() {
        try {
            logger.info('Starting economy optimization cycle');
            
            // Step 1: Calculate KPIs
            const kpis = await this.calculateKPIs();
            
            // Step 2: Diagnose risks
            const risks = this.diagnoseRisks(kpis);
            
            // Step 3: Generate candidate patches
            const candidates = this.generateCandidatePatches(kpis, risks);
            
            // Step 4: Safety check candidates
            const safePatches = this.safetyCheckPatches(candidates, kpis);
            
            // Step 5: Use ChatGPT advisor if needed
            let chosenPatch = null;
            if (safePatches.length > 0) {
                chosenPatch = await this.selectBestPatch(safePatches, kpis);
            }
            
            // Step 6: Apply patch and log
            let applied = null;
            if (chosenPatch) {
                applied = await this.applyPatch(chosenPatch);
            }
            
            // Step 7: Check for abuse signals
            const abuseFlags = await this.detectAbuseSignals(kpis);
            if (abuseFlags.length > 0) {
                await this.applyAbuseProtections(abuseFlags);
            }
            
            // Return results
            const result = {
                analysis: this.generateAnalysisText(kpis, risks),
                suggestions: safePatches.map(p => ({
                    action: p.action,
                    patch: p.patch,
                    reason: p.reason
                })),
                abuseFlags: abuseFlags,
                appliedPatch: applied
            };
            
            logger.info(`Optimization cycle complete: ${safePatches.length} suggestions, ${abuseFlags.length} abuse flags`);
            return result;
            
        } catch (error) {
            logger.error(`Optimization cycle failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Calculate all required KPIs from MariaDB
     */
    async calculateKPIs() {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const week_ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        try {
            // Money supply (total user balances)
            const [moneySupplyRows] = await this.db.execute(
                'SELECT SUM(wallet + bank) as total FROM user_balances'
            );
            const moneySupply = moneySupplyRows[0]?.total || 0;
            
            // 24h transaction totals by game
            const [gameStatsRows] = await this.db.execute(`
                SELECT 
                    game,
                    SUM(CASE WHEN type = 'bet' THEN amount ELSE 0 END) as stakes,
                    SUM(CASE WHEN type = 'payout' THEN amount ELSE 0 END) as payouts,
                    COUNT(CASE WHEN type = 'bet' THEN 1 END) as spins,
                    COUNT(DISTINCT user_id) as unique_players
                FROM transactions 
                WHERE ts >= ? AND game IS NOT NULL
                GROUP BY game
            `, [yesterday]);
            
            // Overall RTP calculation
            const totalStakes = gameStatsRows.reduce((sum, row) => sum + (row.stakes || 0), 0);
            const totalPayouts = gameStatsRows.reduce((sum, row) => sum + (row.payouts || 0), 0);
            const overallRTP = totalStakes > 0 ? totalPayouts / totalStakes : 0;
            
            // Per-game RTPs
            const perGameRTP = {};
            gameStatsRows.forEach(row => {
                if (row.stakes > 0) {
                    perGameRTP[row.game] = row.payouts / row.stakes;
                }
            });
            
            // Active users (bet in last 24h)
            const [activeUsersRows] = await this.db.execute(`
                SELECT COUNT(DISTINCT user_id) as active_users 
                FROM transactions 
                WHERE ts >= ? AND type = 'bet'
            `, [yesterday]);
            const activeUsers = activeUsersRows[0]?.active_users || 0;
            
            // Supply growth (compare to 48h ago)
            const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
            const [oldSupplyRows] = await this.db.execute(`
                SELECT SUM(wallet + bank) as total 
                FROM user_balances 
                WHERE updated_at <= ?
            `, [yesterday]);
            const oldSupply = oldSupplyRows[0]?.total || moneySupply;
            const supplyGrowthPct = oldSupply > 0 ? ((moneySupply - oldSupply) / oldSupply) * 100 : 0;
            
            // Gini coefficient (wealth inequality)
            const giniIndex = await this.calculateGiniCoefficient();
            
            return {
                timestamp: now.toISOString(),
                moneySupply,
                overallRTP,
                perGameRTP,
                totalStakes,
                totalPayouts,
                supplyGrowthPct,
                giniIndex,
                activeUsers,
                gameStats: gameStatsRows
            };
            
        } catch (error) {
            logger.error(`KPI calculation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Calculate Gini coefficient for wealth inequality
     */
    async calculateGiniCoefficient() {
        try {
            const [balances] = await this.db.execute(`
                SELECT (wallet + bank) as balance 
                FROM user_balances 
                WHERE (wallet + bank) > 0
                ORDER BY balance ASC
            `);
            
            if (balances.length === 0) return 0;
            
            const n = balances.length;
            let sum1 = 0;
            let sum2 = 0;
            
            for (let i = 0; i < n; i++) {
                sum1 += balances[i].balance * (i + 1);
                sum2 += balances[i].balance;
            }
            
            const gini = (2 * sum1) / (n * sum2) - (n + 1) / n;
            return Math.max(0, Math.min(1, gini));
            
        } catch (error) {
            logger.error(`Gini calculation failed: ${error.message}`);
            return 0.5; // Default moderate inequality
        }
    }

    /**
     * Diagnose economic risks from KPIs
     */
    diagnoseRisks(kpis) {
        const risks = [];
        
        // RTP out of bounds
        if (kpis.overallRTP < this.config.minOverallRTP) {
            risks.push({
                type: 'rtp_too_low',
                severity: 'medium',
                value: kpis.overallRTP,
                message: `Overall RTP ${(kpis.overallRTP * 100).toFixed(1)}% below minimum ${(this.config.minOverallRTP * 100).toFixed(1)}%`
            });
        } else if (kpis.overallRTP > this.config.maxOverallRTP) {
            risks.push({
                type: 'rtp_too_high',
                severity: 'high',
                value: kpis.overallRTP,
                message: `Overall RTP ${(kpis.overallRTP * 100).toFixed(1)}% above maximum ${(this.config.maxOverallRTP * 100).toFixed(1)}%`
            });
        }
        
        // High inflation
        if (kpis.supplyGrowthPct > this.config.targetSupplyGrowth * 2) {
            risks.push({
                type: 'high_inflation',
                severity: 'high',
                value: kpis.supplyGrowthPct,
                message: `Supply growing at ${kpis.supplyGrowthPct.toFixed(1)}%/day, target is ${this.config.targetSupplyGrowth}%/day`
            });
        }
        
        // Wealth concentration
        if (kpis.giniIndex > this.config.targetGiniIndex) {
            risks.push({
                type: 'wealth_concentration',
                severity: 'medium',
                value: kpis.giniIndex,
                message: `Gini index ${kpis.giniIndex.toFixed(3)} above target ${this.config.targetGiniIndex}`
            });
        }
        
        // Per-game RTP issues
        for (const [game, rtp] of Object.entries(kpis.perGameRTP)) {
            let minRTP, maxRTP;
            
            if (game === 'slots') {
                minRTP = this.config.minSlotsRTP;
                maxRTP = this.config.maxSlotsRTP;
            } else if (game === 'roulette') {
                minRTP = this.config.minRouletteRTP;
                maxRTP = this.config.maxRouletteRTP;
            } else if (game === 'blackjack') {
                minRTP = this.config.minBlackjackRTP;
                maxRTP = this.config.maxBlackjackRTP;
            } else {
                continue; // Skip unknown games
            }
            
            if (rtp < minRTP || rtp > maxRTP) {
                risks.push({
                    type: 'game_rtp_out_of_bounds',
                    severity: 'medium',
                    game,
                    value: rtp,
                    message: `${game} RTP ${(rtp * 100).toFixed(1)}% outside bounds [${(minRTP * 100).toFixed(1)}%, ${(maxRTP * 100).toFixed(1)}%]`
                });
            }
        }
        
        return risks;
    }

    /**
     * Generate candidate patches to address risks
     */
    generateCandidatePatches(kpis, risks) {
        const patches = [];
        
        for (const risk of risks) {
            switch (risk.type) {
                case 'rtp_too_high':
                    // Reduce payout multipliers slightly
                    for (const [game, stats] of Object.entries(kpis.perGameRTP)) {
                        if (stats > 0.95) { // Focus on high-RTP games
                            patches.push({
                                action: 'reduce_payout_mult',
                                patch: {
                                    scope: game,
                                    key: 'payoutMultDelta',
                                    value: -Math.min(0.01, this.config.maxPayoutMultDelta)
                                },
                                reason: `Reduce ${game} payout to lower overall RTP`
                            });
                        }
                    }
                    break;
                    
                case 'rtp_too_low':
                    // Increase payout multipliers slightly
                    for (const [game, stats] of Object.entries(kpis.perGameRTP)) {
                        if (stats < 0.9) { // Focus on low-RTP games
                            patches.push({
                                action: 'increase_payout_mult',
                                patch: {
                                    scope: game,
                                    key: 'payoutMultDelta',
                                    value: Math.min(0.01, this.config.maxPayoutMultDelta)
                                },
                                reason: `Increase ${game} payout to raise overall RTP`
                            });
                        }
                    }
                    break;
                    
                case 'high_inflation':
                    // Increase fees slightly
                    patches.push({
                        action: 'increase_fees',
                        patch: {
                            scope: 'global',
                            key: 'feePctDelta',
                            value: Math.min(0.25, this.config.maxFeePctDelta)
                        },
                        reason: 'Increase transaction fees to combat inflation'
                    });
                    break;
                    
                case 'game_rtp_out_of_bounds':
                    const adjustment = risk.value > (this.config.minOverallRTP + this.config.maxOverallRTP) / 2 ? -0.005 : 0.005;
                    patches.push({
                        action: 'adjust_game_rtp',
                        patch: {
                            scope: risk.game,
                            key: 'winOddsDelta',
                            value: adjustment
                        },
                        reason: `Adjust ${risk.game} win odds to normalize RTP`
                    });
                    break;
            }
        }
        
        return patches;
    }

    /**
     * Safety check candidate patches
     */
    safetyCheckPatches(candidates, kpis) {
        const safe = [];
        
        for (const candidate of candidates) {
            const { patch } = candidate;
            
            // Check patch limits
            if (Math.abs(patch.value) > this.getMaxDelta(patch.key)) {
                continue; // Patch too large
            }
            
            // Simulate effect (coarse estimation)
            const projectedRTP = this.simulatePatchEffect(patch, kpis);
            if (projectedRTP < this.config.minOverallRTP || projectedRTP > this.config.maxOverallRTP) {
                continue; // Would push RTP out of bounds
            }
            
            safe.push(candidate);
        }
        
        return safe;
    }

    /**
     * Get maximum allowed delta for a tuning key
     */
    getMaxDelta(key) {
        switch (key) {
            case 'payoutMultDelta': return this.config.maxPayoutMultDelta;
            case 'winOddsDelta': return this.config.maxWinOddsDelta;
            case 'feePctDelta': return this.config.maxFeePctDelta;
            case 'newbieBoostDeltaPct': return this.config.maxNewbieBoostDelta;
            case 'maxBetDeltaPct': return this.config.maxBetDelta;
            default: return 0.01;
        }
    }

    /**
     * Simulate the effect of a patch (coarse estimation)
     */
    simulatePatchEffect(patch, kpis) {
        // Very simple simulation - just estimate RTP impact
        let rtpDelta = 0;
        
        if (patch.key === 'payoutMultDelta') {
            rtpDelta = patch.value; // Direct correlation
        } else if (patch.key === 'winOddsDelta') {
            rtpDelta = patch.value * 0.5; // Partial correlation
        } else if (patch.key === 'feePctDelta') {
            rtpDelta = -patch.value * 0.001; // Fees reduce effective RTP
        }
        
        return kpis.overallRTP + rtpDelta;
    }

    /**
     * Select best patch using ChatGPT advisor if available
     */
    async selectBestPatch(candidates, kpis) {
        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];
        
        // Check if we can use ChatGPT advisor
        if (this.canUseChatGPTAdvisor()) {
            try {
                const advice = await this.askChatGPTAdvisor(kpis, candidates);
                if (advice && advice.choice === 'apply' && advice.chosenPatch) {
                    // Find matching patch
                    const chosen = candidates.find(c => 
                        c.action === advice.chosenPatch.action
                    );
                    if (chosen) {
                        logger.info(`ChatGPT advisor selected: ${chosen.action} - ${advice.notes}`);
                        return chosen;
                    }
                }
            } catch (error) {
                logger.error(`ChatGPT advisor failed: ${error.message}`);
            }
        }
        
        // Fallback: select first safe patch
        return candidates[0];
    }

    /**
     * Check if ChatGPT advisor can be used (rate limiting)
     */
    canUseChatGPTAdvisor() {
        if (!this.openai) return false;
        
        const now = Date.now();
        const lastCall = this.config.lastChatGPTCall || 0;
        const timeSince = now - lastCall;
        const dayInMs = 24 * 60 * 60 * 1000;
        
        return timeSince >= dayInMs;
    }

    /**
     * Ask ChatGPT advisor for patch selection
     */
    async askChatGPTAdvisor(kpis, candidates) {
        try {
            // Build tiny aggregate payload
            const payload = {
                moneySupply: kpis.moneySupply,
                overallRTP: Number(kpis.overallRTP.toFixed(3)),
                perGame: Object.fromEntries(
                    Object.entries(kpis.perGameRTP).slice(0, 5).map(([game, rtp]) => [
                        game, {
                            stakes: kpis.gameStats.find(g => g.game === game)?.stakes || 0,
                            payouts: kpis.gameStats.find(g => g.game === game)?.payouts || 0,
                            rtp: Number(rtp.toFixed(3))
                        }
                    ])
                ),
                supplyGrowthPct: Number(kpis.supplyGrowthPct.toFixed(1)),
                giniIndex: Number(kpis.giniIndex.toFixed(3)),
                activeUsers: kpis.activeUsers,
                candidates: candidates.slice(0, 3).map(c => ({
                    action: c.action,
                    patch: c.patch,
                    reason: c.reason
                }))
            };
            
            const payloadStr = JSON.stringify(payload);
            if (payloadStr.length > this.config.maxPayloadSize) {
                throw new Error('Payload too large for ChatGPT');
            }
            
            const messages = [
                {
                    role: 'system',
                    content: 'You are a cautious game-economy reviewer. Keep RTPs within bands. Prefer small, reversible changes. Output strictly in the provided JSON schema.'
                },
                {
                    role: 'user',
                    content: `KPIs and candidate patches:\n${payloadStr}\n\nChoose one patch or noop. Max 80 words in notes.`
                }
            ];
            
            // Apply rate limiting
            await this.enforceRateLimit();
            
            const response = await this.openai.chat.completions.create({
                model: this.config.chatgptModel,
                messages,
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens,
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'Advisor',
                        schema: {
                            type: 'object',
                            properties: {
                                choice: {
                                    type: 'string',
                                    enum: ['apply', 'noop']
                                },
                                chosenPatch: {
                                    type: 'object',
                                    properties: {
                                        action: { type: 'string' },
                                        patch: { type: 'object' },
                                        reason: { type: 'string' }
                                    }
                                },
                                notes: { type: 'string' }
                            },
                            required: ['choice', 'notes'],
                            additionalProperties: false
                        },
                        strict: true
                    }
                }
            });
            
            const advice = JSON.parse(response.choices[0].message.content);
            this.config.lastChatGPTCall = Date.now();
            
            return advice;
            
        } catch (error) {
            logger.error(`ChatGPT advisor error: ${error.message}`);
            return null;
        }
    }

    /**
     * Apply a patch to the tuning system
     */
    async applyPatch(patch) {
        try {
            const { action, patch: patchData, reason } = patch;
            
            // Update tuning table
            await this.db.execute(
                'INSERT INTO tuning (scope, key_name, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = value + VALUES(value)',
                [patchData.scope, patchData.key, patchData.value]
            );
            
            // Log to regulator_log
            await this.db.execute(
                'INSERT INTO regulator_log (action, payload) VALUES (?, ?)',
                ['apply_patch', JSON.stringify({ action, patch: patchData, reason })]
            );
            
            logger.info(`Applied patch: ${action} - ${reason}`);
            return { success: true, action, patch: patchData };
            
        } catch (error) {
            logger.error(`Failed to apply patch: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Detect abuse signals from KPIs
     */
    async detectAbuseSignals(kpis) {
        try {
            const flags = [];
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            
            // Find users with abnormal PnL (3 standard deviations)
            const [pnlStats] = await this.db.execute(`
                SELECT 
                    user_id,
                    SUM(CASE WHEN type = 'payout' THEN amount ELSE 0 END) - 
                    SUM(CASE WHEN type = 'bet' THEN amount ELSE 0 END) as pnl_24h,
                    COUNT(CASE WHEN type = 'bet' THEN 1 END) as bet_count,
                    COUNT(CASE WHEN type = 'payout' THEN 1 END) as win_count
                FROM transactions 
                WHERE ts >= ? 
                GROUP BY user_id
                HAVING pnl_24h > 0
                ORDER BY pnl_24h DESC
                LIMIT 20
            `, [yesterday]);
            
            if (pnlStats.length > 0) {
                // Calculate mean and std dev
                const pnls = pnlStats.map(row => row.pnl_24h);
                const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
                const variance = pnls.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / pnls.length;
                const stdDev = Math.sqrt(variance);
                const threshold = mean + 3 * stdDev;
                
                for (const row of pnlStats) {
                    if (row.pnl_24h > threshold && row.bet_count > 0) {
                        const winRate = row.win_count / row.bet_count;
                        if (winRate > 0.7) { // Abnormally high win rate
                            flags.push({
                                userId: row.user_id.toString(),
                                reason: `PnL +${(row.pnl_24h / 1000).toFixed(1)}k / 24h, winrate ${(winRate * 100).toFixed(1)}%`,
                                suggestedCap: {
                                    maxBet: Math.min(5000, row.pnl_24h * 0.1) // Cap at 10% of their winnings
                                }
                            });
                        }
                    }
                }
            }
            
            return flags;
            
        } catch (error) {
            logger.error(`Abuse detection failed: ${error.message}`);
            return [];
        }
    }

    /**
     * Apply abuse protection caps
     */
    async applyAbuseProtections(abuseFlags) {
        for (const flag of abuseFlags) {
            try {
                // Add user cap to tuning table
                const scope = `cap:${flag.userId}`;
                await this.db.execute(
                    'INSERT INTO tuning (scope, key_name, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
                    [scope, 'maxBet', flag.suggestedCap.maxBet]
                );
                
                // Log action
                await this.db.execute(
                    'INSERT INTO regulator_log (action, payload) VALUES (?, ?)',
                    ['apply_user_cap', JSON.stringify(flag)]
                );
                
                logger.warn(`Applied cap to user ${flag.userId}: maxBet=${flag.suggestedCap.maxBet}`);
                
            } catch (error) {
                logger.error(`Failed to apply cap to user ${flag.userId}: ${error.message}`);
            }
        }
    }

    /**
     * Generate analysis text summary
     */
    generateAnalysisText(kpis, risks) {
        if (risks.length === 0) {
            return `Economy healthy: RTP ${(kpis.overallRTP * 100).toFixed(1)}%, supply growth ${kpis.supplyGrowthPct.toFixed(1)}%/day, ${kpis.activeUsers} active users.`;
        }
        
        const highRisks = risks.filter(r => r.severity === 'high');
        if (highRisks.length > 0) {
            return `High risk detected: ${highRisks.map(r => r.message).join('. ')} Immediate adjustment needed.`;
        }
        
        return `${risks.length} issues detected. ${risks.map(r => r.message).join('. ')} Gradual optimization recommended.`;
    }

    /**
     * Enforce rate limiting for OpenAI API calls
     */
    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastAPICall;
        
        if (timeSinceLastCall < this.minTimeBetweenCalls) {
            const waitTime = this.minTimeBetweenCalls - timeSinceLastCall;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastAPICall = Date.now();
    }
}

module.exports = EconomyOptimizer;