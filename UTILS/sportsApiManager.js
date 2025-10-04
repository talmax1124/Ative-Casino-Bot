/**
 * Sports API Manager with Caching and Dual Key Rotation
 * Manages API requests, caching, and automatic key rotation
 */

const dbManager = require('./database');
const logger = require('./logger');

class SportsApiManager {
    constructor() {
        this.primaryKey = process.env.ODDS_API_KEY;
        this.secondaryKey = process.env.ODDS_API_KEY_2 || process.env.ODDS_API_KEY; // Fallback to primary if no secondary
        this.baseUrl = 'https://api.the-odds-api.com/v4';
        this.cacheExpiryMinutes = 15; // Cache data for 15 minutes
        this.monthlyLimit = 500;
    }

    /**
     * Get current API key based on usage
     */
    async getCurrentApiKey() {
        try {
            const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
            
            // Check primary key usage
            const primaryUsage = await this.getApiUsage(1, currentMonth);
            
            // If primary is under limit, use it
            if (primaryUsage < this.monthlyLimit) {
                logger.info(`Using primary API key (${primaryUsage}/${this.monthlyLimit} requests used)`);
                return { key: this.primaryKey, index: 1 };
            }
            
            // Check secondary key usage
            const secondaryUsage = await this.getApiUsage(2, currentMonth);
            
            if (secondaryUsage < this.monthlyLimit) {
                logger.info(`Switched to secondary API key (${secondaryUsage}/${this.monthlyLimit} requests used)`);
                return { key: this.secondaryKey, index: 2 };
            }
            
            // Both keys exhausted
            logger.warn('Both API keys have reached monthly limit');
            return null;
            
        } catch (error) {
            logger.error(`Error getting current API key: ${error.message}`);
            return { key: this.primaryKey, index: 1 }; // Fallback to primary
        }
    }

    /**
     * Get API usage for a specific key
     */
    async getApiUsage(keyIndex, monthYear) {
        try {
            const result = await dbManager.databaseAdapter.executeQuery(
                'SELECT request_count FROM sports_api_usage WHERE api_key_id = ? AND month = ?',
                [`api_${keyIndex}`, monthYear]
            );
            
            return result.length > 0 ? result[0].request_count : 0;
        } catch (error) {
            logger.error(`Error getting API usage: ${error.message}`);
            return 0;
        }
    }

    /**
     * Track API request
     */
    async trackApiRequest(keyIndex) {
        try {
            const currentMonth = new Date().toISOString().slice(0, 7);
            const nextMonth = new Date();
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            nextMonth.setDate(1);
            nextMonth.setHours(0, 0, 0, 0);
            
            await dbManager.databaseAdapter.executeQuery(`
                INSERT INTO sports_api_usage (api_key_id, request_count, month, last_request_at)
                VALUES (?, 1, ?, NOW())
                ON DUPLICATE KEY UPDATE 
                    request_count = request_count + 1,
                    last_request_at = NOW(),
                    updated_at = NOW()
            `, [`api_${keyIndex}`, currentMonth]);
            
        } catch (error) {
            logger.error(`Error tracking API request: ${error.message}`);
        }
    }

    /**
     * Fetch games with caching
     */
    async fetchGamesWithCache(sport, leagues) {
        try {
            // Check cache first
            const cachedGames = await this.getCachedGames(sport);
            
            if (cachedGames && cachedGames.length > 0) {
                logger.info(`Using cached data for ${sport} (${cachedGames.length} games)`);
                return cachedGames;
            }
            
            // Get current API key
            const apiKeyInfo = await this.getCurrentApiKey();
            
            if (!apiKeyInfo || !apiKeyInfo.key) {
                logger.warn('API limits reached or no API key configured, returning mock data');
                return this.getMockGames(sport);
            }
            
            // Fetch fresh data
            const allGames = [];
            
            // Limit to first 2 leagues to conserve API calls
            const leaguesToFetch = leagues.slice(0, 2);
            
            for (const league of leaguesToFetch) {
                try {
                    console.log(`Fetching games for league: ${league}`);
                    const url = `${this.baseUrl}/sports/${league}/odds/?apiKey=${apiKeyInfo.key}&regions=us&markets=h2h,spreads,totals`;
                    const response = await fetch(url);
                    
                    if (response.ok) {
                        const data = await response.json();
                        console.log(`Fetched ${data.length} games for ${league}`);
                        allGames.push(...data);
                        
                        // Track API usage
                        await this.trackApiRequest(apiKeyInfo.index);
                        
                        // Cache the data
                        await this.cacheGames(sport, league, data);
                    } else if (response.status === 401) {
                        logger.warn(`API key ${apiKeyInfo.index} unauthorized, switching...`);
                        // Try with other key if available
                        if (apiKeyInfo.index === 1 && this.secondaryKey !== this.primaryKey) {
                            return this.fetchGamesWithCache(sport, leagues);
                        }
                    } else {
                        logger.warn(`API returned status ${response.status} for ${league}`);
                    }
                } catch (error) {
                    logger.error(`Error fetching ${league}: ${error.message}`);
                }
            }
            
            console.log(`Total games fetched: ${allGames.length}`);
            return allGames.length > 0 ? allGames : this.getMockGames(sport);
            
        } catch (error) {
            logger.error(`Error in fetchGamesWithCache: ${error.message}`);
            return this.getMockGames(sport);
        }
    }

    /**
     * Get cached games from database
     */
    async getCachedGames(sport) {
        try {
            const result = await dbManager.databaseAdapter.executeQuery(`
                SELECT raw_data 
                FROM sports_games_cache 
                WHERE sport = ? 
                AND expires_at > NOW()
                AND commence_time > NOW()
                ORDER BY commence_time ASC
            `, [sport]);
            
            if (result.length === 0) return null;
            
            // Parse and combine all cached games
            const games = [];
            for (const row of result) {
                try {
                    const gameData = JSON.parse(row.raw_data);
                    games.push(gameData);
                } catch (e) {
                    logger.error(`Error parsing cached game data: ${e.message}`);
                }
            }
            
            return games;
            
        } catch (error) {
            logger.error(`Error getting cached games: ${error.message}`);
            return null;
        }
    }

    /**
     * Cache games in database
     */
    async cacheGames(sport, league, games) {
        try {
            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + this.cacheExpiryMinutes);
            
            for (const game of games) {
                // Extract odds
                const h2hMarket = game.bookmakers?.[0]?.markets?.find(m => m.key === 'h2h');
                const homeOdds = h2hMarket?.outcomes?.find(o => o.name === game.home_team)?.price || null;
                const awayOdds = h2hMarket?.outcomes?.find(o => o.name === game.away_team)?.price || null;
                
                // Convert ISO datetime to MySQL format (remove Z and replace T with space)
                const commenceTime = new Date(game.commence_time).toISOString().slice(0, 19).replace('T', ' ');
                
                await dbManager.databaseAdapter.executeQuery(`
                    INSERT INTO sports_games_cache 
                    (sport, league, game_id, home_team, away_team, commence_time, 
                     home_odds, away_odds, raw_data, expires_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        home_odds = VALUES(home_odds),
                        away_odds = VALUES(away_odds),
                        raw_data = VALUES(raw_data),
                        cached_at = CURRENT_TIMESTAMP,
                        expires_at = VALUES(expires_at)
                `, [
                    sport,
                    league,
                    game.id,
                    game.home_team,
                    game.away_team,
                    commenceTime,
                    homeOdds,
                    awayOdds,
                    JSON.stringify(game),
                    expiresAt.toISOString().slice(0, 19).replace('T', ' ')
                ]);
            }
            
            logger.info(`Cached ${games.length} games for ${sport}/${league}`);
            
        } catch (error) {
            logger.error(`Error caching games: ${error.message}`);
        }
    }

    /**
     * Get mock games for testing/fallback
     */
    getMockGames(sport) {
        const now = new Date();
        const mockTeams = {
            soccer: [
                { home: 'Manchester United', away: 'Liverpool' },
                { home: 'Real Madrid', away: 'Barcelona' },
                { home: 'Bayern Munich', away: 'Dortmund' }
            ],
            basketball: [
                { home: 'Lakers', away: 'Celtics' },
                { home: 'Warriors', away: 'Nets' },
                { home: 'Bulls', away: 'Heat' }
            ],
            football: [
                { home: 'Patriots', away: 'Cowboys' },
                { home: 'Chiefs', away: 'Bills' },
                { home: 'Packers', away: '49ers' }
            ],
            tennis: [
                { home: 'Djokovic', away: 'Nadal' },
                { home: 'Federer', away: 'Murray' },
                { home: 'Alcaraz', away: 'Sinner' }
            ],
            baseball: [
                { home: 'Yankees', away: 'Red Sox' },
                { home: 'Dodgers', away: 'Giants' },
                { home: 'Astros', away: 'Rangers' }
            ],
            hockey: [
                { home: 'Maple Leafs', away: 'Canadiens' },
                { home: 'Rangers', away: 'Bruins' },
                { home: 'Avalanche', away: 'Lightning' }
            ]
        };

        return mockTeams[sport]?.map((teams, idx) => ({
            id: `mock_${sport}_${idx}`,
            sport_title: sport,
            home_team: teams.home,
            away_team: teams.away,
            commence_time: new Date(now.getTime() + (idx + 1) * 3600000).toISOString(),
            bookmakers: [{
                key: 'mock',
                markets: [
                    {
                        key: 'h2h',
                        outcomes: [
                            { name: teams.home, price: 1.8 + Math.random() * 0.4 },
                            { name: teams.away, price: 1.9 + Math.random() * 0.3 }
                        ]
                    }
                ]
            }]
        })) || [];
    }

    /**
     * Get API usage statistics
     */
    async getUsageStats() {
        try {
            const currentMonth = new Date().toISOString().slice(0, 7);
            
            const stats = await dbManager.databaseAdapter.executeQuery(`
                SELECT 
                    api_key_id,
                    request_count,
                    last_request_at
                FROM sports_api_usage
                WHERE month = ?
                ORDER BY api_key_id
            `, [currentMonth]);
            
            return {
                month: currentMonth,
                primary: {
                    used: stats.find(s => s.api_key_id === 'api_1')?.request_count || 0,
                    limit: this.monthlyLimit,
                    lastRequest: stats.find(s => s.api_key_id === 'api_1')?.last_request_at
                },
                secondary: {
                    used: stats.find(s => s.api_key_id === 'api_2')?.request_count || 0,
                    limit: this.monthlyLimit,
                    lastRequest: stats.find(s => s.api_key_id === 'api_2')?.last_request_at
                },
                totalUsed: stats.reduce((sum, s) => sum + s.request_count, 0),
                totalLimit: this.monthlyLimit * 2
            };
            
        } catch (error) {
            logger.error(`Error getting usage stats: ${error.message}`);
            return null;
        }
    }

    /**
     * Clean expired cache entries
     */
    async cleanExpiredCache() {
        try {
            const result = await dbManager.databaseAdapter.executeQuery(
                'DELETE FROM sports_games_cache WHERE expires_at < NOW() OR commence_time < NOW()'
            );
            
            if (result.affectedRows > 0) {
                logger.info(`Cleaned ${result.affectedRows} expired cache entries`);
            }
            
        } catch (error) {
            logger.error(`Error cleaning expired cache: ${error.message}`);
        }
    }
}

module.exports = new SportsApiManager();