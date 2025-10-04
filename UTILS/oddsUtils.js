/**
 * Odds Utilities for Enhanced Sports Betting
 * Provides odds analysis, trends, and live indicators
 */

// Analyze odds movement and return indicators
function getOddsMovement(currentOdds, previousOdds) {
    if (!previousOdds || currentOdds === previousOdds) {
        return { indicator: '➖', text: 'Stable', color: '#95A5A6' };
    }
    
    if (currentOdds > previousOdds) {
        const increase = ((currentOdds - previousOdds) / previousOdds * 100).toFixed(1);
        return { 
            indicator: '📈', 
            text: `+${increase}%`, 
            color: '#27AE60',
            trending: 'up'
        };
    } else {
        const decrease = ((previousOdds - currentOdds) / previousOdds * 100).toFixed(1);
        return { 
            indicator: '📉', 
            text: `-${decrease}%`, 
            color: '#E74C3C',
            trending: 'down'
        };
    }
}

// Get odds quality indicator
function getOddsQuality(odds) {
    if (odds >= 3.0) {
        return { 
            quality: 'excellent', 
            indicator: '🟢', 
            text: 'Excellent Value',
            description: 'High potential payout'
        };
    } else if (odds >= 2.0) {
        return { 
            quality: 'good', 
            indicator: '🟡', 
            text: 'Good Value',
            description: 'Balanced risk/reward'
        };
    } else if (odds >= 1.5) {
        return { 
            quality: 'fair', 
            indicator: '🟠', 
            text: 'Fair Odds',
            description: 'Lower risk option'
        };
    } else {
        return { 
            quality: 'low', 
            indicator: '🔴', 
            text: 'Heavy Favorite',
            description: 'Very low risk, low payout'
        };
    }
}

// Calculate implied probability from odds
function getImpliedProbability(odds) {
    const probability = (1 / odds * 100).toFixed(1);
    return {
        percentage: probability,
        confidence: probability > 66.7 ? 'high' : probability > 50 ? 'medium' : 'low'
    };
}

// Get market heat indicator
function getMarketHeat(games) {
    const totalGames = games.length;
    const liveGames = games.filter(game => {
        const timeUntil = (new Date(game.commence_time) - new Date()) / (1000 * 60 * 60);
        return timeUntil < 2;
    }).length;
    
    const heatLevel = liveGames / totalGames;
    
    if (heatLevel > 0.5) {
        return { indicator: '🔥', text: 'Very Hot', color: '#E74C3C' };
    } else if (heatLevel > 0.3) {
        return { indicator: '🌡️', text: 'Heating Up', color: '#F39C12' };
    } else if (heatLevel > 0.1) {
        return { indicator: '📈', text: 'Active', color: '#F1C40F' };
    } else {
        return { indicator: '❄️', text: 'Cool', color: '#3498DB' };
    }
}

// Generate live status for game
function getLiveStatus(gameTime) {
    const now = new Date();
    const gameStart = new Date(gameTime);
    const minutesUntil = (gameStart - now) / (1000 * 60);
    
    if (minutesUntil < 0) {
        return { 
            status: 'live', 
            indicator: '🔴', 
            text: 'LIVE NOW',
            color: '#E74C3C',
            urgent: true
        };
    } else if (minutesUntil < 30) {
        return { 
            status: 'starting', 
            indicator: '🟡', 
            text: `Starting in ${Math.round(minutesUntil)}m`,
            color: '#F39C12',
            urgent: true
        };
    } else if (minutesUntil < 120) {
        return { 
            status: 'soon', 
            indicator: '⏰', 
            text: `In ${Math.round(minutesUntil / 60)}h`,
            color: '#3498DB',
            urgent: false
        };
    } else {
        return { 
            status: 'scheduled', 
            indicator: '📅', 
            text: gameStart.toLocaleDateString(),
            color: '#95A5A6',
            urgent: false
        };
    }
}

// Generate betting confidence score
function getBettingConfidence(odds, volume = 'medium') {
    const baseConfidence = Math.min(90, (odds - 1) * 30);
    const volumeMultiplier = volume === 'high' ? 1.2 : volume === 'low' ? 0.8 : 1.0;
    const confidence = Math.round(baseConfidence * volumeMultiplier);
    
    if (confidence >= 70) {
        return { score: confidence, level: 'high', indicator: '✅', color: '#27AE60' };
    } else if (confidence >= 50) {
        return { score: confidence, level: 'medium', indicator: '⚠️', color: '#F39C12' };
    } else {
        return { score: confidence, level: 'low', indicator: '❌', color: '#E74C3C' };
    }
}

// Format odds with enhanced styling
function formatAdvancedOdds(odds, previousOdds = null) {
    const quality = getOddsQuality(odds);
    const movement = getOddsMovement(odds, previousOdds);
    const probability = getImpliedProbability(odds);
    
    return {
        display: `${quality.indicator} **${odds.toFixed(2)}** ${movement.indicator}`,
        quality,
        movement,
        probability,
        tooltip: `${quality.description} • ${probability.percentage}% implied chance`
    };
}

// Get sport-specific insights
function getSportInsights(sport, games) {
    const insights = {
        soccer: {
            tip: '⚽ Look for value in draw markets during derby matches',
            trend: 'Home teams performing 15% better this season',
            hotMarket: 'Both Teams to Score'
        },
        basketball: {
            tip: '🏀 Over/Under markets often provide better value than spreads',
            trend: 'Road favorites covering 62% of spreads',
            hotMarket: 'Player Points Props'
        },
        american_football: {
            tip: '🏈 Weather conditions heavily impact Over/Under totals',
            trend: 'Underdogs covering 58% in primetime games',
            hotMarket: 'Team Total Points'
        },
        tennis: {
            tip: '🎾 First set winner often indicates match outcome',
            trend: 'Favorites winning 73% of clay court matches',
            hotMarket: 'Set Betting'
        },
        baseball: {
            tip: '⚾ Pitcher matchups are crucial for run totals',
            trend: 'Home runs up 12% in evening games',
            hotMarket: 'Run Line'
        },
        hockey: {
            tip: '🏒 Backup goalies create value opportunities',
            trend: 'Overtime games increasing 8% this season',
            hotMarket: 'Total Goals'
        }
    };
    
    return insights[sport] || {
        tip: '🎯 Always compare odds across multiple markets',
        trend: 'Live betting offers dynamic opportunities',
        hotMarket: 'Moneyline'
    };
}

// Generate market summary
function generateMarketSummary(games, sport) {
    const heat = getMarketHeat(games);
    const insights = getSportInsights(sport, games);
    const liveCount = games.filter(game => getLiveStatus(game.commence_time).urgent).length;
    
    return {
        heat,
        insights,
        liveCount,
        totalGames: games.length,
        summary: `${heat.indicator} ${heat.text} • ${liveCount} live games • ${insights.hotMarket} trending`
    };
}

module.exports = {
    getOddsMovement,
    getOddsQuality,
    getImpliedProbability,
    getMarketHeat,
    getLiveStatus,
    getBettingConfidence,
    formatAdvancedOdds,
    getSportInsights,
    generateMarketSummary
};