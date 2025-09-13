/**
 * Economy Dashboard API Routes
 * Handles requests from the web dashboard for economy control
 */

const express = require('express');
const router = express.Router();
const EconomyOptimizer = require('../ECONOMY_GUARDIAN/economyOptimizer');
const EconomyAnalyzerRunner = require('../ECONOMY_GUARDIAN/analyzerRunner');
const tuningManager = require('../UTILS/tuningManager');
const logger = require('../UTILS/logger');

// Initialize economy systems
let optimizer = null;
let analyzerRunner = null;
let databaseAdapter = null;

async function initializeEconomySystems() {
    try {
        // Initialize database adapter first (shared with main bot)
        if (!databaseAdapter) {
            databaseAdapter = require('../UTILS/databaseAdapter');
            await databaseAdapter.initialize();
            logger.info('🏦 Database adapter initialized for web API');
        }
        
        if (!optimizer) {
            optimizer = new EconomyOptimizer();
            await optimizer.initialize();
            logger.info('🎛️ Economy optimizer initialized for web API');
        }
        
        if (!analyzerRunner) {
            // Create a lightweight analyzer runner for API use
            analyzerRunner = {
                getStatus: () => ({
                    initialized: true,
                    running: true,
                    lastRun: new Date(),
                    runCount: 0
                }),
                forceAnalysis: async () => {
                    return await optimizer.runOptimizationCycle();
                }
            };
            logger.info('📊 Analyzer runner initialized for web API');
        }
    } catch (error) {
        logger.error(`Failed to initialize economy systems for web API: ${error.message}`);
        throw error;
    }
}

/**
 * GET /api/economy/status
 * Get current economy system status and KPIs
 */
router.get('/status', async (req, res) => {
    try {
        // Initialize systems with timeout
        const initPromise = initializeEconomySystems();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Initialization timeout')), 30000)
        );
        
        await Promise.race([initPromise, timeoutPromise]);
        
        // Ensure tuning manager is initialized
        await tuningManager.initialize();
        
        // Get current KPIs with error handling
        let kpis = null;
        try {
            kpis = await optimizer.calculateKPIs();
        } catch (kpiError) {
            logger.warn(`KPI calculation failed: ${kpiError.message}`);
            kpis = {
                moneySupply: 0,
                overallRTP: 0,
                supplyGrowthPct: 0,
                activeUsers: 0,
                error: 'KPI calculation unavailable'
            };
        }
        
        // Get system status
        const status = analyzerRunner.getStatus();
        
        // Get current tuning values
        const tuning = await tuningManager.getTuningSummary();
        
        res.json({
            success: true,
            data: {
                kpis,
                status,
                tuning,
                lastUpdate: new Date().toISOString(),
                systemHealth: {
                    database: !!databaseAdapter?.pool,
                    optimizer: !!optimizer?.initialized,
                    tuningManager: !!tuningManager?.initialized
                }
            }
        });
        
    } catch (error) {
        logger.error(`Economy status API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message,
            details: 'Economy system initialization failed. Ensure the main bot is running with database connection.'
        });
    }
});

/**
 * POST /api/economy/analyze
 * Run immediate economy analysis
 */
router.post('/analyze', async (req, res) => {
    try {
        // Initialize systems with timeout
        await Promise.race([
            initializeEconomySystems(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Initialization timeout')), 30000))
        ]);
        
        await tuningManager.initialize();
        
        logger.info('Manual economy analysis triggered from dashboard');
        
        // Run analysis with timeout
        const analysisPromise = analyzerRunner.forceAnalysis();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Analysis timeout')), 60000)
        );
        
        const result = await Promise.race([analysisPromise, timeoutPromise]);
        
        res.json({
            success: true,
            data: result,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error(`Economy analysis API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message,
            details: 'Failed to run economy analysis. Check database connection and system status.'
        });
    }
});

/**
 * POST /api/economy/tune-game
 * Apply game-specific tuning adjustments
 */
router.post('/tune-game', async (req, res) => {
    try {
        await initializeEconomySystems();
        await tuningManager.initialize();
        
        const { game, payoutDelta, winOddsDelta } = req.body;
        
        // Validate input
        if (!game || (!payoutDelta && !winOddsDelta)) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: game and adjustment values'
            });
        }
        
        // Apply tuning adjustments
        const results = [];
        
        if (payoutDelta !== undefined) {
            // Validate delta is within safe limits
            if (Math.abs(payoutDelta) > 0.01) {
                return res.status(400).json({
                    success: false,
                    error: 'Payout adjustment exceeds safety limit (±1%)'
                });
            }
            
            await optimizer.db.execute(
                'INSERT INTO tuning (scope, key_name, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = value + VALUES(value)',
                [game, 'payoutMultDelta', payoutDelta]
            );
            
            results.push(`Applied payout adjustment: ${(payoutDelta * 100).toFixed(1)}%`);
        }
        
        if (winOddsDelta !== undefined) {
            // Validate delta is within safe limits
            if (Math.abs(winOddsDelta) > 0.005) {
                return res.status(400).json({
                    success: false,
                    error: 'Win odds adjustment exceeds safety limit (±0.5%)'
                });
            }
            
            await optimizer.db.execute(
                'INSERT INTO tuning (scope, key_name, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = value + VALUES(value)',
                [game, 'winOddsDelta', winOddsDelta]
            );
            
            results.push(`Applied win odds adjustment: ${(winOddsDelta * 100).toFixed(2)}%`);
        }
        
        // Log the action
        await optimizer.db.execute(
            'INSERT INTO regulator_log (action, payload) VALUES (?, ?)',
            ['manual_game_tuning', JSON.stringify({
                game,
                payoutDelta,
                winOddsDelta,
                source: 'web_dashboard',
                timestamp: new Date().toISOString()
            })]
        );
        
        // Force cache refresh
        await tuningManager.forceCacheRefresh();
        
        logger.info(`Manual game tuning applied: ${game} - ${results.join(', ')}`);
        
        res.json({
            success: true,
            message: `Game tuning applied successfully`,
            results
        });
        
    } catch (error) {
        logger.error(`Game tuning API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/economy/tune-global
 * Apply global economy tuning adjustments
 */
router.post('/tune-global', async (req, res) => {
    try {
        await initializeEconomySystems();
        await tuningManager.initialize();
        
        const { feeDelta, maxBetDelta, newbieBoostDelta } = req.body;
        
        const results = [];
        
        if (feeDelta !== undefined) {
            // Validate delta is within safe limits
            if (Math.abs(feeDelta) > 0.25) {
                return res.status(400).json({
                    success: false,
                    error: 'Fee adjustment exceeds safety limit (±0.25%)'
                });
            }
            
            await optimizer.db.execute(
                'INSERT INTO tuning (scope, key_name, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = value + VALUES(value)',
                ['global', 'feePctDelta', feeDelta]
            );
            
            results.push(`Applied fee adjustment: ${feeDelta.toFixed(2)}%`);
        }
        
        if (maxBetDelta !== undefined) {
            // Validate delta is within safe limits
            if (Math.abs(maxBetDelta) > 20) {
                return res.status(400).json({
                    success: false,
                    error: 'Max bet adjustment exceeds safety limit (±20%)'
                });
            }
            
            await optimizer.db.execute(
                'INSERT INTO tuning (scope, key_name, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = value + VALUES(value)',
                ['global', 'maxBetDeltaPct', maxBetDelta]
            );
            
            results.push(`Applied max bet adjustment: ${maxBetDelta > 0 ? '+' : ''}${maxBetDelta}%`);
        }
        
        if (newbieBoostDelta !== undefined) {
            // Validate delta is within safe limits
            if (Math.abs(newbieBoostDelta) > 1.0) {
                return res.status(400).json({
                    success: false,
                    error: 'Newbie boost adjustment exceeds safety limit (±1%)'
                });
            }
            
            await optimizer.db.execute(
                'INSERT INTO tuning (scope, key_name, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = value + VALUES(value)',
                ['global', 'newbieBoostDeltaPct', newbieBoostDelta]
            );
            
            results.push(`Applied newbie boost adjustment: ${newbieBoostDelta.toFixed(1)}%`);
        }
        
        // Log the action
        await optimizer.db.execute(
            'INSERT INTO regulator_log (action, payload) VALUES (?, ?)',
            ['manual_global_tuning', JSON.stringify({
                feeDelta,
                maxBetDelta,
                newbieBoostDelta,
                source: 'web_dashboard',
                timestamp: new Date().toISOString()
            })]
        );
        
        // Force cache refresh
        await tuningManager.forceCacheRefresh();
        
        logger.info(`Manual global tuning applied: ${results.join(', ')}`);
        
        res.json({
            success: true,
            message: 'Global tuning applied successfully',
            results
        });
        
    } catch (error) {
        logger.error(`Global tuning API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/economy/emergency-stop
 * Emergency stop all automated economic adjustments
 */
router.post('/emergency-stop', async (req, res) => {
    try {
        await initializeEconomySystems();
        
        // Log emergency stop
        await optimizer.db.execute(
            'INSERT INTO regulator_log (action, payload) VALUES (?, ?)',
            ['emergency_stop', JSON.stringify({
                source: 'web_dashboard',
                timestamp: new Date().toISOString(),
                reason: 'Manual emergency stop from dashboard'
            })]
        );
        
        logger.warn('EMERGENCY STOP activated from web dashboard');
        
        res.json({
            success: true,
            message: 'Emergency stop activated successfully'
        });
        
    } catch (error) {
        logger.error(`Emergency stop API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/economy/history
 * Get recent economy actions and analysis history
 */
router.get('/history', async (req, res) => {
    try {
        await initializeEconomySystems();
        
        const limit = parseInt(req.query.limit) || 50;
        
        const [rows] = await optimizer.db.execute(`
            SELECT id, ts, action, payload 
            FROM regulator_log 
            ORDER BY ts DESC 
            LIMIT ?
        `, [limit]);
        
        const history = rows.map(row => ({
            id: row.id,
            timestamp: row.ts,
            action: row.action,
            details: JSON.parse(row.payload)
        }));
        
        res.json({
            success: true,
            data: history
        });
        
    } catch (error) {
        logger.error(`History API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/economy/tuning
 * Get current tuning values
 */
router.get('/tuning', async (req, res) => {
    try {
        await initializeEconomySystems();
        await tuningManager.initialize();
        
        const summary = await tuningManager.getTuningSummary();
        
        res.json({
            success: true,
            data: summary
        });
        
    } catch (error) {
        logger.error(`Tuning API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/economy/reset-tuning
 * Reset specific tuning values
 */
router.post('/reset-tuning', async (req, res) => {
    try {
        await initializeEconomySystems();
        await tuningManager.initialize();
        
        const { scope, keyName } = req.body;
        
        if (!scope) {
            return res.status(400).json({
                success: false,
                error: 'Scope is required'
            });
        }
        
        let query, params;
        if (keyName) {
            query = 'DELETE FROM tuning WHERE scope = ? AND key_name = ?';
            params = [scope, keyName];
        } else {
            query = 'DELETE FROM tuning WHERE scope = ?';
            params = [scope];
        }
        
        await optimizer.db.execute(query, params);
        
        // Log the action
        await optimizer.db.execute(
            'INSERT INTO regulator_log (action, payload) VALUES (?, ?)',
            ['reset_tuning', JSON.stringify({
                scope,
                keyName,
                source: 'web_dashboard',
                timestamp: new Date().toISOString()
            })]
        );
        
        // Force cache refresh
        await tuningManager.forceCacheRefresh();
        
        logger.info(`Tuning reset: ${scope}${keyName ? '.' + keyName : ''}`);
        
        res.json({
            success: true,
            message: 'Tuning values reset successfully'
        });
        
    } catch (error) {
        logger.error(`Reset tuning API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;