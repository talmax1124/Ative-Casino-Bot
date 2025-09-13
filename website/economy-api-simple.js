/**
 * Simplified Economy Dashboard API Routes
 * Works directly with database without initializing full economy system
 */

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');

// Simple logger for website
const logger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`),
    warn: (msg) => console.warn(`[WARN] ${msg}`),
    debug: (msg) => console.log(`[DEBUG] ${msg}`)
};

// Database connection (reuse website's database config)
let dbPool = null;

async function getDatabase() {
    if (!dbPool) {
        const dbConfig = {
            host: process.env.MARIADB_HOST,
            port: process.env.MARIADB_PORT || 3306,
            user: process.env.MARIADB_USER,
            password: process.env.MARIADB_PASSWORD,
            database: process.env.MARIADB_DATABASE,
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0
        };
        
        dbPool = mysql.createPool(dbConfig);
        
        // Test connection
        const connection = await dbPool.getConnection();
        await connection.ping();
        connection.release();
        
        logger.info('📊 Economy API database connection established');
    }
    return dbPool;
}

/**
 * GET /api/economy/status
 * Get basic economy status from database
 */
router.get('/status', async (req, res) => {
    try {
        const db = await getDatabase();
        
        // Get basic KPIs from database
        const [moneySupplyRows] = await db.execute('SELECT SUM(wallet + bank) as total FROM user_balances');
        const moneySupply = moneySupplyRows[0]?.total || 0;
        
        const [activeUsersRows] = await db.execute(`
            SELECT COUNT(DISTINCT user_id) as active_users 
            FROM transactions 
            WHERE ts >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND type = 'bet'
        `);
        const activeUsers = activeUsersRows[0]?.active_users || 0;
        
        // Get recent game stats
        const [gameStatsRows] = await db.execute(`
            SELECT 
                game,
                SUM(CASE WHEN type = 'bet' THEN ABS(amount) ELSE 0 END) as stakes,
                SUM(CASE WHEN type = 'payout' THEN amount ELSE 0 END) as payouts,
                COUNT(CASE WHEN type = 'bet' THEN 1 END) as bets
            FROM transactions 
            WHERE ts >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND game IS NOT NULL
            GROUP BY game
        `);
        
        // Calculate overall RTP using absolute stakes values
        const totalStakes = gameStatsRows.reduce((sum, row) => sum + Math.abs(parseFloat(row.stakes) || 0), 0);
        const totalPayouts = gameStatsRows.reduce((sum, row) => sum + (parseFloat(row.payouts) || 0), 0);
        const overallRTP = totalStakes > 0 ? totalPayouts / totalStakes : 0;
        
        // Get tuning values
        const [tuningRows] = await db.execute('SELECT scope, key_name, value FROM tuning ORDER BY scope, key_name');
        const tuning = {};
        tuningRows.forEach(row => {
            if (!tuning[row.scope]) tuning[row.scope] = {};
            tuning[row.scope][row.key_name] = row.value;
        });
        
        // Get recent actions
        const [actionsRows] = await db.execute(`
            SELECT ts, action, payload 
            FROM regulator_log 
            ORDER BY ts DESC 
            LIMIT 10
        `);
        
        res.json({
            success: true,
            data: {
                kpis: {
                    moneySupply,
                    overallRTP,
                    activeUsers,
                    gameStats: gameStatsRows
                },
                tuning,
                recentActions: actionsRows.map(row => ({
                    timestamp: row.ts,
                    action: row.action,
                    details: JSON.parse(row.payload)
                })),
                lastUpdate: new Date().toISOString()
            }
        });
        
    } catch (error) {
        logger.error(`Economy status API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/economy/tune-game
 * Apply game-specific tuning adjustments
 */
router.post('/tune-game', async (req, res) => {
    try {
        const db = await getDatabase();
        const { game, payoutDelta, winOddsDelta } = req.body;
        
        if (!game) {
            return res.status(400).json({
                success: false,
                error: 'Game name is required'
            });
        }
        
        const results = [];
        
        if (payoutDelta !== undefined) {
            // Validate delta is within safe limits
            if (Math.abs(payoutDelta) > 0.01) {
                return res.status(400).json({
                    success: false,
                    error: 'Payout adjustment exceeds safety limit (±1%)'
                });
            }
            
            await db.execute(`
                INSERT INTO tuning (scope, key_name, value) VALUES (?, ?, ?) 
                ON DUPLICATE KEY UPDATE value = value + VALUES(value)
            `, [game, 'payoutMultDelta', payoutDelta]);
            
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
            
            await db.execute(`
                INSERT INTO tuning (scope, key_name, value) VALUES (?, ?, ?) 
                ON DUPLICATE KEY UPDATE value = value + VALUES(value)
            `, [game, 'winOddsDelta', winOddsDelta]);
            
            results.push(`Applied win odds adjustment: ${(winOddsDelta * 100).toFixed(2)}%`);
        }
        
        // Log the action
        await db.execute(
            'INSERT INTO regulator_log (action, payload) VALUES (?, ?)',
            ['manual_game_tuning', JSON.stringify({
                game,
                payoutDelta,
                winOddsDelta,
                source: 'web_dashboard',
                timestamp: new Date().toISOString(),
                results
            })]
        );
        
        logger.info(`Manual game tuning applied: ${game} - ${results.join(', ')}`);
        
        res.json({
            success: true,
            message: 'Game tuning applied successfully',
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
        const db = await getDatabase();
        const { feeDelta, maxBetDelta } = req.body;
        
        const results = [];
        
        if (feeDelta !== undefined) {
            // Validate delta is within safe limits
            if (Math.abs(feeDelta) > 0.25) {
                return res.status(400).json({
                    success: false,
                    error: 'Fee adjustment exceeds safety limit (±0.25%)'
                });
            }
            
            await db.execute(`
                INSERT INTO tuning (scope, key_name, value) VALUES (?, ?, ?) 
                ON DUPLICATE KEY UPDATE value = value + VALUES(value)
            `, ['global', 'feePctDelta', feeDelta]);
            
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
            
            await db.execute(`
                INSERT INTO tuning (scope, key_name, value) VALUES (?, ?, ?) 
                ON DUPLICATE KEY UPDATE value = value + VALUES(value)
            `, ['global', 'maxBetDeltaPct', maxBetDelta]);
            
            results.push(`Applied max bet adjustment: ${maxBetDelta > 0 ? '+' : ''}${maxBetDelta}%`);
        }
        
        // Log the action
        await db.execute(
            'INSERT INTO regulator_log (action, payload) VALUES (?, ?)',
            ['manual_global_tuning', JSON.stringify({
                feeDelta,
                maxBetDelta,
                source: 'web_dashboard',
                timestamp: new Date().toISOString(),
                results
            })]
        );
        
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
 * Emergency stop (just logs the action)
 */
router.post('/emergency-stop', async (req, res) => {
    try {
        const db = await getDatabase();
        
        // Log emergency stop
        await db.execute(
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
            message: 'Emergency stop logged successfully'
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
 * Get recent economy actions
 */
router.get('/history', async (req, res) => {
    try {
        const db = await getDatabase();
        const limit = parseInt(req.query.limit) || 50;
        
        const [rows] = await db.execute(`
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
 * POST /api/economy/reset-tuning
 * Reset specific tuning values
 */
router.post('/reset-tuning', async (req, res) => {
    try {
        const db = await getDatabase();
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
        
        await db.execute(query, params);
        
        // Log the action
        await db.execute(
            'INSERT INTO regulator_log (action, payload) VALUES (?, ?)',
            ['reset_tuning', JSON.stringify({
                scope,
                keyName,
                source: 'web_dashboard',
                timestamp: new Date().toISOString()
            })]
        );
        
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

/**
 * POST /api/economy/analyze
 * Trigger manual economy analysis
 */
router.post('/analyze', async (req, res) => {
    try {
        // Log the analysis request
        const db = await getDatabase();
        await db.execute(
            'INSERT INTO regulator_log (action, payload) VALUES (?, ?)',
            ['manual_analysis_request', JSON.stringify({
                source: 'web_dashboard',
                timestamp: new Date().toISOString(),
                mode: req.body.mode || 'normal'
            })]
        );
        
        logger.info('Manual economy analysis requested from dashboard');
        
        res.json({
            success: true,
            message: 'Analysis request logged. Full analysis requires the main bot to be running.',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error(`Manual analysis API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/economy/tuning
 * Get current tuning values (alias for status tuning data)
 */
router.get('/tuning', async (req, res) => {
    try {
        const db = await getDatabase();
        const [tuningRows] = await db.execute('SELECT scope, key_name, value FROM tuning ORDER BY scope, key_name');
        const tuning = {};
        tuningRows.forEach(row => {
            if (!tuning[row.scope]) tuning[row.scope] = {};
            tuning[row.scope][row.key_name] = row.value;
        });
        
        res.json({
            success: true,
            data: tuning
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
 * POST /api/economy/user-info
 * Get user information (placeholder for advanced controls)
 */
router.post('/user-info', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }
        
        const db = await getDatabase();
        
        // Get user balance if exists
        const [userRows] = await db.execute('SELECT * FROM user_balances WHERE user_id = ?', [userId]);
        const user = userRows[0];
        
        res.json({
            success: true,
            data: {
                userId: userId,
                username: user?.username || 'Unknown',
                balance: user ? {
                    wallet: parseFloat(user.wallet),
                    bank: parseFloat(user.bank),
                    total: parseFloat(user.wallet) + parseFloat(user.bank)
                } : null,
                found: !!user
            }
        });
        
    } catch (error) {
        logger.error(`User info API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/economy/user-cap
 * Set user betting cap (placeholder for advanced controls)
 */
router.post('/user-cap', async (req, res) => {
    try {
        const { userId, maxBet } = req.body;
        if (!userId || !maxBet) {
            return res.status(400).json({
                success: false,
                error: 'User ID and max bet are required'
            });
        }
        
        const db = await getDatabase();
        
        // Set user cap in tuning table
        await db.execute(
            'INSERT INTO tuning (scope, key_name, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
            [`cap:${userId}`, 'maxBet', parseFloat(maxBet)]
        );
        
        // Log the action
        await db.execute(
            'INSERT INTO regulator_log (action, payload) VALUES (?, ?)',
            ['user_cap_set', JSON.stringify({
                userId,
                maxBet: parseFloat(maxBet),
                source: 'web_dashboard',
                timestamp: new Date().toISOString()
            })]
        );
        
        res.json({
            success: true,
            message: `Max bet cap of $${parseFloat(maxBet).toLocaleString()} set for user ${userId}`
        });
        
    } catch (error) {
        logger.error(`User cap API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;