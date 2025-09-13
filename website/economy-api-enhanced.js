/**
 * Enhanced Economy Dashboard API Routes
 * Modern, secure, and feature-rich API for the v2 dashboard
 */

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const logger = require('../UTILS/logger');
const rateLimit = require('express-rate-limit');

// Rate limiting for API routes
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // limit each IP to 100 requests per windowMs
    message: { success: false, error: 'Too many API requests' }
});

const strictLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10, // More restrictive for sensitive operations
    message: { success: false, error: 'Rate limit exceeded for sensitive operations' }
});

router.use(apiLimiter);

// Database connection pool
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
            connectionLimit: 10,
            queueLimit: 0,
            charset: 'utf8mb4',
            timezone: '+00:00'
        };
        
        dbPool = mysql.createPool(dbConfig);
        
        // Test connection
        const connection = await dbPool.getConnection();
        await connection.ping();
        connection.release();
        
        logger.info('📊 Enhanced Economy API database connection established');
    }
    return dbPool;
}

/**
 * GET /api/v2/economy/overview
 * Comprehensive dashboard overview with all KPIs
 */
router.get('/overview', async (req, res) => {
    try {
        const db = await getDatabase();
        
        // Get comprehensive KPIs
        const [moneySupplyRows] = await db.execute(`
            SELECT 
                SUM(wallet + bank) as total_supply,
                AVG(wallet + bank) as avg_balance,
                COUNT(*) as total_users,
                MAX(wallet + bank) as max_balance
            FROM user_balances
        `);
        
        const [activityRows] = await db.execute(`
            SELECT 
                COUNT(DISTINCT user_id) as active_users_24h,
                COUNT(DISTINCT CASE WHEN ts >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN user_id END) as active_users_1h,
                COUNT(*) as total_transactions_24h,
                SUM(CASE WHEN type = 'bet' THEN ABS(amount) ELSE 0 END) as total_volume_24h
            FROM transactions 
            WHERE ts >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `);
        
        const [gameStatsRows] = await db.execute(`
            SELECT 
                game,
                COUNT(CASE WHEN type = 'bet' THEN 1 END) as bet_count,
                SUM(CASE WHEN type = 'bet' THEN ABS(amount) ELSE 0 END) as stakes,
                SUM(CASE WHEN type = 'payout' THEN amount ELSE 0 END) as payouts,
                AVG(CASE WHEN type = 'bet' THEN ABS(amount) END) as avg_bet,
                COUNT(DISTINCT user_id) as unique_players
            FROM transactions 
            WHERE ts >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND game IS NOT NULL
            GROUP BY game
            ORDER BY stakes DESC
        `);
        
        // Calculate RTPs
        const gameAnalytics = gameStatsRows.map(game => {
            const stakes = parseFloat(game.stakes) || 0;
            const payouts = parseFloat(game.payouts) || 0;
            const rtp = stakes > 0 ? (payouts / stakes) : 0;
            
            return {
                game: game.game,
                rtp: rtp,
                rtpPercentage: (rtp * 100).toFixed(2),
                stakes: stakes,
                payouts: payouts,
                profit: stakes - payouts,
                profitMargin: stakes > 0 ? ((stakes - payouts) / stakes * 100).toFixed(2) : 0,
                betCount: parseInt(game.bet_count),
                uniquePlayers: parseInt(game.unique_players),
                avgBet: parseFloat(game.avg_bet) || 0
            };
        });
        
        // Overall RTP calculation
        const totalStakes = gameAnalytics.reduce((sum, game) => sum + game.stakes, 0);
        const totalPayouts = gameAnalytics.reduce((sum, game) => sum + game.payouts, 0);
        const overallRTP = totalStakes > 0 ? totalPayouts / totalStakes : 0;
        
        // Get tuning information
        const [tuningRows] = await db.execute(`
            SELECT scope, key_name, value
            FROM tuning 
            ORDER BY scope, key_name
        `);
        
        const tuningStats = {
            total: tuningRows.length,
            byScope: {}
        };
        
        tuningRows.forEach(row => {
            if (!tuningStats.byScope[row.scope]) {
                tuningStats.byScope[row.scope] = 0;
            }
            tuningStats.byScope[row.scope]++;
        });
        
        // Get recent high-impact events
        const [recentEventsRows] = await db.execute(`
            SELECT ts, action, payload 
            FROM regulator_log 
            ORDER BY ts DESC 
            LIMIT 20
        `);
        
        // Get wealth distribution
        const [wealthDistRows] = await db.execute(`
            SELECT 
                CASE 
                    WHEN (wallet + bank) >= 1000000000 THEN 'Billionaires'
                    WHEN (wallet + bank) >= 100000000 THEN '100M+'
                    WHEN (wallet + bank) >= 10000000 THEN '10M+'
                    WHEN (wallet + bank) >= 1000000 THEN '1M+'
                    WHEN (wallet + bank) >= 100000 THEN '100K+'
                    ELSE 'Under 100K'
                END as wealth_tier,
                COUNT(*) as user_count,
                SUM(wallet + bank) as total_wealth
            FROM user_balances 
            GROUP BY wealth_tier
        `);
        
        const response = {
            success: true,
            data: {
                overview: {
                    totalSupply: parseFloat(moneySupplyRows[0]?.total_supply) || 0,
                    avgBalance: parseFloat(moneySupplyRows[0]?.avg_balance) || 0,
                    totalUsers: parseInt(moneySupplyRows[0]?.total_users) || 0,
                    maxBalance: parseFloat(moneySupplyRows[0]?.max_balance) || 0,
                    activeUsers24h: parseInt(activityRows[0]?.active_users_24h) || 0,
                    activeUsers1h: parseInt(activityRows[0]?.active_users_1h) || 0,
                    totalTransactions24h: parseInt(activityRows[0]?.total_transactions_24h) || 0,
                    totalVolume24h: parseFloat(activityRows[0]?.total_volume_24h) || 0,
                    overallRTP: overallRTP,
                    overallRTPPercentage: (overallRTP * 100).toFixed(2)
                },
                games: gameAnalytics,
                tuning: tuningStats,
                recentEvents: recentEventsRows.map(row => ({
                    timestamp: row.ts,
                    action: row.action,
                    details: JSON.parse(row.payload)
                })),
                wealthDistribution: wealthDistRows.map(row => ({
                    tier: row.wealth_tier,
                    userCount: parseInt(row.user_count),
                    totalWealth: parseFloat(row.total_wealth)
                })),
                lastUpdate: new Date().toISOString()
            }
        };
        
        res.json(response);
        
    } catch (error) {
        logger.error(`Enhanced economy overview API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/v2/economy/analytics/historical
 * Historical data for trending charts
 */
router.get('/analytics/historical', async (req, res) => {
    try {
        const db = await getDatabase();
        const hours = parseInt(req.query.hours) || 24;
        const interval = req.query.interval || 'hour'; // hour, day, week
        
        let timeFormat, groupBy;
        switch(interval) {
            case 'hour':
                timeFormat = '%Y-%m-%d %H:00:00';
                groupBy = 'HOUR';
                break;
            case 'day':
                timeFormat = '%Y-%m-%d';
                groupBy = 'DAY';
                break;
            case 'week':
                timeFormat = '%Y-%u';
                groupBy = 'WEEK';
                break;
            default:
                timeFormat = '%Y-%m-%d %H:00:00';
                groupBy = 'HOUR';
        }
        
        // Get historical RTP data
        const [rtpHistoryRows] = await db.execute(`
            SELECT 
                DATE_FORMAT(ts, ?) as time_bucket,
                game,
                SUM(CASE WHEN type = 'bet' THEN ABS(amount) ELSE 0 END) as stakes,
                SUM(CASE WHEN type = 'payout' THEN amount ELSE 0 END) as payouts,
                COUNT(CASE WHEN type = 'bet' THEN 1 END) as bet_count
            FROM transactions 
            WHERE ts >= DATE_SUB(NOW(), INTERVAL ? ${groupBy}) AND game IS NOT NULL
            GROUP BY time_bucket, game
            ORDER BY time_bucket DESC
        `, [timeFormat, hours]);
        
        // Get user activity history
        const [activityHistoryRows] = await db.execute(`
            SELECT 
                DATE_FORMAT(ts, ?) as time_bucket,
                COUNT(DISTINCT user_id) as active_users,
                COUNT(*) as transaction_count,
                SUM(CASE WHEN type = 'bet' THEN ABS(amount) ELSE 0 END) as volume
            FROM transactions 
            WHERE ts >= DATE_SUB(NOW(), INTERVAL ? ${groupBy})
            GROUP BY time_bucket
            ORDER BY time_bucket DESC
        `, [timeFormat, hours]);
        
        // Process RTP history
        const rtpHistory = {};
        rtpHistoryRows.forEach(row => {
            if (!rtpHistory[row.time_bucket]) {
                rtpHistory[row.time_bucket] = {};
            }
            const stakes = parseFloat(row.stakes) || 0;
            const payouts = parseFloat(row.payouts) || 0;
            rtpHistory[row.time_bucket][row.game] = {
                rtp: stakes > 0 ? (payouts / stakes) : 0,
                stakes: stakes,
                payouts: payouts,
                betCount: parseInt(row.bet_count)
            };
        });
        
        res.json({
            success: true,
            data: {
                rtpHistory: rtpHistory,
                activityHistory: activityHistoryRows.map(row => ({
                    timestamp: row.time_bucket,
                    activeUsers: parseInt(row.active_users),
                    transactionCount: parseInt(row.transaction_count),
                    volume: parseFloat(row.volume)
                })),
                interval: interval,
                hours: hours
            }
        });
        
    } catch (error) {
        logger.error(`Historical analytics API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/v2/economy/users/analysis
 * Advanced user behavior analysis
 */
router.get('/users/analysis', async (req, res) => {
    try {
        const db = await getDatabase();
        
        // Get user segments
        const [userSegmentRows] = await db.execute(`
            SELECT 
                user_id,
                username,
                wallet + bank as total_balance,
                (SELECT COUNT(*) FROM transactions t WHERE t.user_id = ub.user_id AND t.ts >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) as transactions_24h,
                (SELECT SUM(ABS(amount)) FROM transactions t WHERE t.user_id = ub.user_id AND t.type = 'bet' AND t.ts >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) as bet_volume_24h,
                (SELECT MAX(ts) FROM transactions t WHERE t.user_id = ub.user_id) as last_activity
            FROM user_balances ub
            ORDER BY total_balance DESC
            LIMIT 100
        `);
        
        // Get high-risk users (potential problem gamblers)
        const [highRiskUsers] = await db.execute(`
            SELECT 
                user_id,
                username,
                COUNT(*) as bet_count,
                SUM(ABS(amount)) as total_bet_amount,
                AVG(ABS(amount)) as avg_bet,
                MAX(ABS(amount)) as max_bet,
                TIMESTAMPDIFF(HOUR, MIN(ts), MAX(ts)) as session_length_hours
            FROM transactions t
            JOIN user_balances ub ON t.user_id = ub.user_id
            WHERE t.type = 'bet' AND t.ts >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            GROUP BY user_id, username
            HAVING bet_count > 100 OR avg_bet > 50000 OR max_bet > 500000
            ORDER BY total_bet_amount DESC
            LIMIT 20
        `);
        
        // Get user retention cohorts
        const [cohortRows] = await db.execute(`
            SELECT 
                DATE(first_activity) as cohort_date,
                COUNT(*) as users,
                COUNT(CASE WHEN last_activity >= DATE_SUB(NOW(), INTERVAL 1 DAY) THEN 1 END) as retained_1d,
                COUNT(CASE WHEN last_activity >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as retained_7d,
                COUNT(CASE WHEN last_activity >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as retained_30d
            FROM (
                SELECT 
                    user_id,
                    MIN(ts) as first_activity,
                    MAX(ts) as last_activity
                FROM transactions
                GROUP BY user_id
            ) user_activity
            WHERE first_activity >= DATE_SUB(NOW(), INTERVAL 90 DAY)
            GROUP BY cohort_date
            ORDER BY cohort_date DESC
        `);
        
        res.json({
            success: true,
            data: {
                topUsers: userSegmentRows.map(row => ({
                    userId: row.user_id,
                    username: row.username,
                    totalBalance: parseFloat(row.total_balance),
                    transactions24h: parseInt(row.transactions_24h) || 0,
                    betVolume24h: parseFloat(row.bet_volume_24h) || 0,
                    lastActivity: row.last_activity
                })),
                highRiskUsers: highRiskUsers.map(row => ({
                    userId: row.user_id,
                    username: row.username,
                    betCount: parseInt(row.bet_count),
                    totalBetAmount: parseFloat(row.total_bet_amount),
                    avgBet: parseFloat(row.avg_bet),
                    maxBet: parseFloat(row.max_bet),
                    sessionLengthHours: parseFloat(row.session_length_hours)
                })),
                cohorts: cohortRows.map(row => ({
                    date: row.cohort_date,
                    users: parseInt(row.users),
                    retention1d: ((parseInt(row.retained_1d) / parseInt(row.users)) * 100).toFixed(2),
                    retention7d: ((parseInt(row.retained_7d) / parseInt(row.users)) * 100).toFixed(2),
                    retention30d: ((parseInt(row.retained_30d) / parseInt(row.users)) * 100).toFixed(2)
                }))
            }
        });
        
    } catch (error) {
        logger.error(`User analysis API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/v2/economy/controls/emergency-tune
 * Advanced emergency tuning with safety checks
 */
router.post('/controls/emergency-tune', strictLimiter, async (req, res) => {
    try {
        const db = await getDatabase();
        const { games, globalAdjustments, reason, severity } = req.body;
        
        if (!reason) {
            return res.status(400).json({
                success: false,
                error: 'Reason is required for emergency tuning'
            });
        }
        
        const results = [];
        const timestamp = new Date().toISOString();
        
        // Apply game-specific tunings
        if (games && Array.isArray(games)) {
            for (const gameAdjustment of games) {
                const { game, payoutDelta, winOddsDelta } = gameAdjustment;
                
                // Enhanced safety checks
                if (Math.abs(payoutDelta || 0) > 0.05) { // 5% max
                    return res.status(400).json({
                        success: false,
                        error: `Payout adjustment for ${game} exceeds emergency safety limit (±5%)`
                    });
                }
                
                if (payoutDelta !== undefined) {
                    await db.execute(`
                        INSERT INTO tuning (scope, key_name, value) VALUES (?, ?, ?) 
                        ON DUPLICATE KEY UPDATE value = value + VALUES(value)
                    `, [game, 'emergencyPayoutDelta', payoutDelta]);
                    
                    results.push(`${game}: Emergency payout adjustment ${(payoutDelta * 100).toFixed(2)}%`);
                }
                
                if (winOddsDelta !== undefined) {
                    await db.execute(`
                        INSERT INTO tuning (scope, key_name, value) VALUES (?, ?, ?) 
                        ON DUPLICATE KEY UPDATE value = value + VALUES(value)
                    `, [game, 'emergencyWinOddsDelta', winOddsDelta]);
                    
                    results.push(`${game}: Emergency win odds adjustment ${(winOddsDelta * 100).toFixed(3)}%`);
                }
            }
        }
        
        // Apply global adjustments
        if (globalAdjustments) {
            const { feeDelta, maxBetDelta, enableEmergencyMode } = globalAdjustments;
            
            if (feeDelta !== undefined) {
                await db.execute(`
                    INSERT INTO tuning (scope, key_name, value) VALUES (?, ?, ?) 
                    ON DUPLICATE KEY UPDATE value = value + VALUES(value)
                `, ['global', 'emergencyFeeDelta', feeDelta]);
                
                results.push(`Global: Emergency fee adjustment ${feeDelta.toFixed(2)}%`);
            }
            
            if (maxBetDelta !== undefined) {
                await db.execute(`
                    INSERT INTO tuning (scope, key_name, value) VALUES (?, ?, ?) 
                    ON DUPLICATE KEY UPDATE value = VALUES(value)
                `, ['global', 'emergencyMaxBetDelta', maxBetDelta]);
                
                results.push(`Global: Emergency max bet adjustment ${maxBetDelta > 0 ? '+' : ''}${maxBetDelta}%`);
            }
            
            if (enableEmergencyMode) {
                await db.execute(`
                    INSERT INTO tuning (scope, key_name, value) VALUES (?, ?, ?) 
                    ON DUPLICATE KEY UPDATE value = VALUES(value)
                `, ['global', 'emergencyMode', 1]);
                
                results.push('Global: Emergency mode activated');
            }
        }
        
        // Log the emergency action
        await db.execute(
            'INSERT INTO regulator_log (action, payload) VALUES (?, ?)',
            ['emergency_tuning', JSON.stringify({
                reason,
                severity: severity || 'high',
                games,
                globalAdjustments,
                results,
                source: 'enhanced_dashboard',
                timestamp,
                userAgent: req.headers['user-agent'],
                ip: req.ip
            })]
        );
        
        logger.warn(`EMERGENCY TUNING APPLIED: ${reason} - ${results.join(', ')}`);
        
        res.json({
            success: true,
            message: 'Emergency tuning applied successfully',
            results,
            severity: severity || 'high',
            timestamp
        });
        
    } catch (error) {
        logger.error(`Emergency tuning API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/v2/economy/security/audit
 * Security audit information
 */
router.get('/security/audit', async (req, res) => {
    try {
        const db = await getDatabase();
        
        // Get recent suspicious activities
        const [suspiciousActivities] = await db.execute(`
            SELECT 
                user_id,
                game,
                COUNT(*) as rapid_bet_count,
                SUM(ABS(amount)) as total_amount,
                AVG(ABS(amount)) as avg_amount,
                MAX(ABS(amount)) as max_amount,
                MIN(ts) as first_bet,
                MAX(ts) as last_bet,
                TIMESTAMPDIFF(SECOND, MIN(ts), MAX(ts)) as timespan_seconds
            FROM transactions 
            WHERE type = 'bet' 
              AND ts >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
            GROUP BY user_id, game
            HAVING rapid_bet_count > 50 OR max_amount > 1000000 OR timespan_seconds < 300
            ORDER BY total_amount DESC
            LIMIT 20
        `);
        
        // Get failed login attempts (if implemented)
        const [failedLogins] = await db.execute(`
            SELECT action, payload, ts 
            FROM regulator_log 
            WHERE action LIKE '%failed%' OR action LIKE '%suspicious%'
              AND ts >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            ORDER BY ts DESC 
            LIMIT 50
        `);
        
        // Get recent tunings (limit since no timestamp available)
        const [recentTunings] = await db.execute(`
            SELECT scope, key_name, value
            FROM tuning 
            ORDER BY scope, key_name
            LIMIT 20
        `);
        
        res.json({
            success: true,
            data: {
                suspiciousActivities: suspiciousActivities.map(row => ({
                    userId: row.user_id,
                    game: row.game,
                    rapidBetCount: parseInt(row.rapid_bet_count),
                    totalAmount: parseFloat(row.total_amount),
                    avgAmount: parseFloat(row.avg_amount),
                    maxAmount: parseFloat(row.max_amount),
                    firstBet: row.first_bet,
                    lastBet: row.last_bet,
                    timespanSeconds: parseInt(row.timespan_seconds),
                    riskScore: Math.min(100, (parseInt(row.rapid_bet_count) / 10) + (parseFloat(row.max_amount) / 100000))
                })),
                failedActions: failedLogins.map(row => ({
                    action: row.action,
                    timestamp: row.ts,
                    details: JSON.parse(row.payload)
                })),
                recentTunings: recentTunings.map(row => ({
                    scope: row.scope,
                    key: row.key_name,
                    value: parseFloat(row.value)
                })),
                securityLevel: suspiciousActivities.length > 10 ? 'HIGH' : 
                               suspiciousActivities.length > 5 ? 'MEDIUM' : 'LOW'
            }
        });
        
    } catch (error) {
        logger.error(`Security audit API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/v2/economy/realtime/stream
 * Server-Sent Events for real-time data streaming
 */
router.get('/realtime/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    const sendData = async () => {
        try {
            const db = await getDatabase();
            
            // Get current stats
            const [currentStats] = await db.execute(`
                SELECT 
                    COUNT(DISTINCT user_id) as active_users,
                    COUNT(*) as transaction_count,
                    SUM(CASE WHEN type = 'bet' THEN ABS(amount) ELSE 0 END) as volume,
                    SUM(CASE WHEN type = 'payout' THEN amount ELSE 0 END) as payouts
                FROM transactions 
                WHERE ts >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
            `);
            
            const stats = currentStats[0];
            const rtp = stats.volume > 0 ? (stats.payouts / stats.volume) : 0;
            
            const data = {
                timestamp: Date.now(),
                activeUsers: parseInt(stats.active_users) || 0,
                transactionCount: parseInt(stats.transaction_count) || 0,
                volume: parseFloat(stats.volume) || 0,
                rtp: (rtp * 100).toFixed(2)
            };
            
            res.write(`data: ${JSON.stringify(data)}\n\n`);
            
        } catch (error) {
            logger.error('Realtime stream error:', error);
            res.write(`data: ${JSON.stringify({error: 'Stream error'})}\n\n`);
        }
    };

    // Send initial data
    sendData();
    
    // Send data every 30 seconds
    const interval = setInterval(sendData, 30000);

    // Clean up on client disconnect
    req.on('close', () => {
        clearInterval(interval);
    });
});

module.exports = router;