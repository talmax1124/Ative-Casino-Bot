/**
 * Global Game Trend Analyzer Integration
 * Provides a global instance of GameTrendAnalyzer for games to report events
 */

const GameTrendAnalyzer = require('./GameTrendAnalyzer');
const BehavioralPatternAnalyzer = require('./BehavioralPatternAnalyzer');
const logger = require('./logger');

// Global singleton instances
let globalTrendAnalyzer = null;
let globalBehavioralAnalyzer = null;

/**
 * Initialize the global trend analyzer
 */
function initializeTrendAnalyzer() {
    if (!globalTrendAnalyzer) {
        globalTrendAnalyzer = new GameTrendAnalyzer();
        logger.info('✅ Global GameTrendAnalyzer initialized');
    }
    return globalTrendAnalyzer;
}

/**
 * Initialize the global behavioral analyzer
 */
function initializeBehavioralAnalyzer() {
    if (!globalBehavioralAnalyzer) {
        globalBehavioralAnalyzer = BehavioralPatternAnalyzer; // It's already a singleton instance
        logger.info('✅ Global BehavioralPatternAnalyzer initialized');
    }
    return globalBehavioralAnalyzer;
}

/**
 * Get the global trend analyzer instance
 */
function getTrendAnalyzer() {
    if (!globalTrendAnalyzer) {
        return initializeTrendAnalyzer();
    }
    return globalTrendAnalyzer;
}

/**
 * Get the global behavioral analyzer instance
 */
function getBehavioralAnalyzer() {
    if (!globalBehavioralAnalyzer) {
        return initializeBehavioralAnalyzer();
    }
    return globalBehavioralAnalyzer;
}

/**
 * Report a big win to both analyzers
 */
async function reportBigWin(gameType, userId, winAmount, betAmount = 0, metadata = {}) {
    try {
        // Report to GameTrendAnalyzer
        const analyzer = getTrendAnalyzer();
        await analyzer.recordBigWin(gameType, userId, winAmount, betAmount, metadata);
        
        // Report to BehavioralPatternAnalyzer
        const behavioralAnalyzer = getBehavioralAnalyzer();
        await behavioralAnalyzer.recordGameEvent(userId, gameType, {
            type: 'game_result',
            result: 'win',
            betAmount,
            winAmount,
            multiplier: betAmount > 0 ? winAmount / betAmount : 0,
            isBigWin: true,
            ...metadata
        });
    } catch (error) {
        logger.error(`Error reporting big win to analyzers: ${error.message}`);
    }
}

/**
 * Report a player choice to the trend analyzer
 */
async function reportPlayerChoice(gameType, userId, choice, metadata = {}) {
    try {
        const analyzer = getTrendAnalyzer();
        await analyzer.recordChoice(gameType, userId, choice, metadata);
    } catch (error) {
        logger.error(`Error reporting player choice to trend analyzer: ${error.message}`);
    }
}

/**
 * Get current trend adjustment for a game
 */
function getTrendAdjustment(gameType) {
    try {
        const analyzer = getTrendAnalyzer();
        return analyzer.getTrendAdjustment(gameType);
    } catch (error) {
        logger.error(`Error getting trend adjustment: ${error.message}`);
        return 0;
    }
}

/**
 * Report any game result to behavioral analyzer
 */
async function reportGameResult(userId, gameType, betAmount, winAmount, result = 'unknown', metadata = {}) {
    try {
        const behavioralAnalyzer = getBehavioralAnalyzer();
        await behavioralAnalyzer.recordGameEvent(userId, gameType, {
            type: 'game_result',
            result,
            betAmount,
            winAmount,
            multiplier: betAmount > 0 ? winAmount / betAmount : 0,
            ...metadata
        });
    } catch (error) {
        logger.error(`Error reporting game result to behavioral analyzer: ${error.message}`);
    }
}

/**
 * Check for suspicious behavioral patterns
 */
async function checkSuspiciousActivity(userId) {
    try {
        const behavioralAnalyzer = getBehavioralAnalyzer();
        return await behavioralAnalyzer.analyzeUser(userId);
    } catch (error) {
        logger.error(`Error checking suspicious activity: ${error.message}`);
        return { suspicious: false, risk: 0 };
    }
}

/**
 * Get comprehensive analysis combining both systems
 */
async function getComprehensiveAnalysis() {
    try {
        const trendAnalyzer = getTrendAnalyzer();
        const behavioralAnalyzer = getBehavioralAnalyzer();
        
        const trendSummary = trendAnalyzer.getTrendSummary();
        const behavioralSummary = await behavioralAnalyzer.getSystemStatus();
        
        return {
            trends: trendSummary,
            behavioral: behavioralSummary,
            timestamp: Date.now()
        };
    } catch (error) {
        logger.error(`Error getting comprehensive analysis: ${error.message}`);
        return null;
    }
}

/**
 * Get trend summary for monitoring
 */
function getTrendSummary() {
    try {
        const analyzer = getTrendAnalyzer();
        return analyzer.getTrendSummary();
    } catch (error) {
        logger.error(`Error getting trend summary: ${error.message}`);
        return null;
    }
}

module.exports = {
    initializeTrendAnalyzer,
    initializeBehavioralAnalyzer,
    getTrendAnalyzer,
    getBehavioralAnalyzer,
    reportBigWin,
    reportPlayerChoice,
    reportGameResult,
    checkSuspiciousActivity,
    getComprehensiveAnalysis,
    getTrendAdjustment,
    getTrendSummary
};