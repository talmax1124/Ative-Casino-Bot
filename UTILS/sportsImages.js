/**
 * Sports Images and Branding Manager
 * Provides high-quality images and branding for sports betting UI
 */

// Major sporting events with promotional banners
const MAJOR_EVENTS = {
    // NFL Events
    'super_bowl': {
        dates: ['2025-02-09', '2026-02-08'],
        banner: 'https://logos-world.net/wp-content/uploads/2021/12/Super-Bowl-Logo.png',
        title: 'Super Bowl',
        description: 'The biggest game in American sports'
    },
    'nfl_playoffs': {
        dates: ['2025-01-11', '2025-02-09', '2026-01-10', '2026-02-08'],
        banner: 'https://seeklogo.com/images/N/nfl-playoffs-logo-02B04856BE-seeklogo.com.png',
        title: 'NFL Playoffs',
        description: 'Road to the Super Bowl'
    },
    
    // NBA Events
    'nba_finals': {
        dates: ['2025-06-05', '2025-06-22'],
        banner: 'https://logos-world.net/wp-content/uploads/2020/06/NBA-Finals-Logo.png',
        title: 'NBA Finals',
        description: 'Championship series'
    },
    'nba_playoffs': {
        dates: ['2025-04-15', '2025-06-22'],
        banner: 'https://seeklogo.com/images/N/nba-playoffs-logo-E3720F0DCC-seeklogo.com.png',
        title: 'NBA Playoffs',
        description: 'Road to the championship'
    },
    'march_madness': {
        dates: ['2025-03-17', '2025-04-07'],
        banner: 'https://logos-world.net/wp-content/uploads/2020/06/March-Madness-Logo.png',
        title: 'March Madness',
        description: 'NCAA Basketball Tournament'
    },
    
    // Soccer Events
    'champions_league_final': {
        dates: ['2025-05-31'],
        banner: 'https://logos-world.net/wp-content/uploads/2020/06/UEFA-Champions-League-Logo.png',
        title: 'Champions League Final',
        description: 'European club championship'
    },
    
    // Tennis Grand Slams
    'australian_open': {
        dates: ['2025-01-12', '2025-01-26'],
        banner: 'https://logos-world.net/wp-content/uploads/2020/06/Australian-Open-Logo.png',
        title: 'Australian Open',
        description: 'Tennis Grand Slam'
    },
    'wimbledon': {
        dates: ['2025-06-30', '2025-07-13'],
        banner: 'https://logos-world.net/wp-content/uploads/2020/06/Wimbledon-Logo.png',
        title: 'Wimbledon',
        description: 'The Championships'
    }
};

const SPORT_IMAGES = {
    soccer: {
        // High-resolution official league banners
        banner: 'https://www.citypng.com/photo/576ac9be/premier-league-official-logo',
        thumbnail: 'https://seeklogo.com/images/P/premier-league-logo-D9D2E394F8-seeklogo.com.png',
        icon: '⚽',
        color: 0x00B894,
        gradient: ['#00B894', '#00CEC9'],
        leagues: {
            'soccer_epl': {
                name: 'Premier League',
                banner: 'https://logos-world.net/wp-content/uploads/2020/06/Premier-League-Logo.png',
                logo: 'https://crests.football-data.org/PL.png'
            },
            'soccer_spain_la_liga': {
                name: 'La Liga',
                banner: 'https://logos-world.net/wp-content/uploads/2020/06/La-Liga-Logo.png',
                logo: 'https://crests.football-data.org/PD.png'
            },
            'soccer_germany_bundesliga': {
                name: 'Bundesliga',
                banner: 'https://logos-world.net/wp-content/uploads/2020/06/Bundesliga-Logo.png',
                logo: 'https://crests.football-data.org/BL1.png'
            },
            'soccer_italy_serie_a': {
                name: 'Serie A',
                banner: 'https://logos-world.net/wp-content/uploads/2020/06/Serie-A-Logo.png',
                logo: 'https://crests.football-data.org/SA.png'
            },
            'soccer_france_ligue_one': {
                name: 'Ligue 1',
                banner: 'https://logos-world.net/wp-content/uploads/2020/06/Ligue-1-Logo.png',
                logo: 'https://crests.football-data.org/FL1.png'
            },
            'soccer_uefa_champs_league': {
                name: 'Champions League',
                banner: 'https://logos-world.net/wp-content/uploads/2020/06/UEFA-Champions-League-Logo.png',
                logo: 'https://crests.football-data.org/CL.png'
            }
        }
    },
    basketball: {
        // Official NBA 2024-25 season banners
        banner: 'https://logos-world.net/wp-content/uploads/2020/06/NBA-Logo.png',
        thumbnail: 'https://seeklogo.com/images/N/nba-logo-C4F56BEBC0-seeklogo.com.png',
        icon: '🏀',
        color: 0xFF6B35,
        gradient: ['#FF6B35', '#F7931E'],
        leagues: {
            'basketball_nba': {
                name: 'NBA',
                banner: 'https://logos-world.net/wp-content/uploads/2020/06/NBA-Logo.png',
                logo: 'https://cdn.nba.com/logos/leagues/logo-nba.svg'
            },
            'basketball_wnba': {
                name: 'WNBA',
                banner: 'https://logos-world.net/wp-content/uploads/2020/06/WNBA-Logo.png',
                logo: 'https://upload.wikimedia.org/wikipedia/en/3/3e/Women%27s_National_Basketball_Association_logo.svg'
            },
            'basketball_euroleague': {
                name: 'EuroLeague',
                banner: 'https://logos-world.net/wp-content/uploads/2020/06/EuroLeague-Logo.png',
                logo: 'https://upload.wikimedia.org/wikipedia/en/d/dd/Euroleague_Basketball_logo.svg'
            }
        }
    },
    american_football: {
        // Official NFL 2024-25 season banners
        banner: 'https://logos-world.net/wp-content/uploads/2020/06/NFL-Logo.png',
        thumbnail: 'https://seeklogo.com/images/N/nfl-logo-C2876C1EB4-seeklogo.com.png',
        icon: '🏈',
        color: 0x003F7F,
        gradient: ['#003F7F', '#0066CC'],
        leagues: {
            'americanfootball_nfl': {
                name: 'NFL',
                banner: 'https://logos-world.net/wp-content/uploads/2020/06/NFL-Logo.png',
                logo: 'https://upload.wikimedia.org/wikipedia/en/a/a2/National_Football_League_logo.svg'
            },
            'americanfootball_ncaaf': {
                name: 'NCAA Football',
                banner: 'https://logos-world.net/wp-content/uploads/2020/06/NCAA-Logo.png',
                logo: 'https://upload.wikimedia.org/wikipedia/commons/d/dd/NCAA_logo.svg'
            }
        }
    },
    tennis: {
        // Official tennis grand slam banners
        banner: 'https://logos-world.net/wp-content/uploads/2020/06/Wimbledon-Logo.png',
        thumbnail: 'https://seeklogo.com/images/W/wimbledon-logo-D06BCEB516-seeklogo.com.png',
        icon: '🎾',
        color: 0xC6E03C,
        gradient: ['#C6E03C', '#95C623'],
        tournaments: {
            'wimbledon': {
                name: 'Wimbledon',
                banner: 'https://logos-world.net/wp-content/uploads/2020/06/Wimbledon-Logo.png',
                logo: 'https://upload.wikimedia.org/wikipedia/en/b/b9/Wimbledon.svg'
            },
            'us_open': {
                name: 'US Open',
                banner: 'https://logos-world.net/wp-content/uploads/2020/06/US-Open-Tennis-Logo.png',
                logo: 'https://upload.wikimedia.org/wikipedia/commons/4/4b/US_Open_Tennis_logo.svg'
            },
            'french_open': {
                name: 'French Open',
                banner: 'https://logos-world.net/wp-content/uploads/2020/06/French-Open-Logo.png',
                logo: 'https://upload.wikimedia.org/wikipedia/en/7/79/Roland-Garros-logo.svg'
            },
            'australian_open': {
                name: 'Australian Open',
                banner: 'https://logos-world.net/wp-content/uploads/2020/06/Australian-Open-Logo.png',
                logo: 'https://upload.wikimedia.org/wikipedia/en/e/e4/Australian_Open_logo.svg'
            }
        }
    },
    baseball: {
        // Official MLB banners
        banner: 'https://logos-world.net/wp-content/uploads/2020/06/MLB-Logo.png',
        thumbnail: 'https://seeklogo.com/images/M/mlb-logo-A8AD5E4A82-seeklogo.com.png',
        icon: '⚾',
        color: 0xC70025,
        gradient: ['#C70025', '#FF0040'],
        leagues: {
            'baseball_mlb': {
                name: 'MLB',
                banner: 'https://logos-world.net/wp-content/uploads/2020/06/MLB-Logo.png',
                logo: 'https://upload.wikimedia.org/wikipedia/en/a/a6/Major_League_Baseball_logo.svg'
            },
            'baseball_npb': {
                name: 'NPB',
                banner: 'https://logos-world.net/wp-content/uploads/2020/06/NPB-Logo.png',
                logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/3/34/Nippon_Professional_Baseball_logo.svg/1200px-Nippon_Professional_Baseball_logo.svg.png'
            }
        }
    },
    hockey: {
        // Official NHL banners
        banner: 'https://logos-world.net/wp-content/uploads/2020/06/NHL-Logo.png',
        thumbnail: 'https://seeklogo.com/images/N/nhl-logo-2448936F0A-seeklogo.com.png',
        icon: '🏒',
        color: 0x001F3F,
        gradient: ['#001F3F', '#003366'],
        leagues: {
            'icehockey_nhl': {
                name: 'NHL',
                banner: 'https://logos-world.net/wp-content/uploads/2020/06/NHL-Logo.png',
                logo: 'https://upload.wikimedia.org/wikipedia/en/3/3a/05_NHL_Shield.svg'
            },
            'icehockey_khl': {
                name: 'KHL',
                banner: 'https://logos-world.net/wp-content/uploads/2020/06/KHL-Logo.png',
                logo: 'https://upload.wikimedia.org/wikipedia/en/8/82/Kontinental_Hockey_League_logo.svg'
            }
        }
    }
};

// Team logos database (using ESPN or sports API endpoints)
const TEAM_LOGOS = {
    // NBA Teams
    'Los Angeles Lakers': 'https://cdn.nba.com/logos/nba/1610612747/primary/L/logo.svg',
    'Golden State Warriors': 'https://cdn.nba.com/logos/nba/1610612744/primary/L/logo.svg',
    'Boston Celtics': 'https://cdn.nba.com/logos/nba/1610612738/primary/L/logo.svg',
    'Miami Heat': 'https://cdn.nba.com/logos/nba/1610612748/primary/L/logo.svg',
    'Phoenix Mercury': 'https://cdn.wnba.com/logos/wnba/1611661317/primary/L/logo.svg',
    'Las Vegas Aces': 'https://cdn.wnba.com/logos/wnba/1611661316/primary/L/logo.svg',
    
    // Soccer Teams (Premier League)
    'Manchester United': 'https://crests.football-data.org/66.png',
    'Liverpool': 'https://crests.football-data.org/64.png',
    'Manchester City': 'https://crests.football-data.org/65.png',
    'Chelsea': 'https://crests.football-data.org/61.png',
    'Arsenal': 'https://crests.football-data.org/57.png',
    'Tottenham': 'https://crests.football-data.org/73.png',
    
    // NFL Teams
    'Dallas Cowboys': 'https://a.espncdn.com/i/teamlogos/nfl/500/dal.png',
    'New England Patriots': 'https://a.espncdn.com/i/teamlogos/nfl/500/ne.png',
    'Kansas City Chiefs': 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png',
    'Buffalo Bills': 'https://a.espncdn.com/i/teamlogos/nfl/500/buf.png',
    
    // MLB Teams
    'New York Yankees': 'https://a.espncdn.com/i/teamlogos/mlb/500/nyy.png',
    'Los Angeles Dodgers': 'https://a.espncdn.com/i/teamlogos/mlb/500/lad.png',
    'Boston Red Sox': 'https://a.espncdn.com/i/teamlogos/mlb/500/bos.png',
    
    // NHL Teams
    'Toronto Maple Leafs': 'https://a.espncdn.com/i/teamlogos/nhl/500/tor.png',
    'Montreal Canadiens': 'https://a.espncdn.com/i/teamlogos/nhl/500/mtl.png',
    'New York Rangers': 'https://a.espncdn.com/i/teamlogos/nhl/500/nyr.png'
};

// Betting market icons and colors
const MARKET_STYLES = {
    h2h: { icon: '🏆', color: 0x3498DB, name: 'Match Winner' },
    spreads: { icon: '⚖️', color: 0x9B59B6, name: 'Point Spread' },
    totals: { icon: '📊', color: 0xE67E22, name: 'Over/Under' },
    btts: { icon: '⚡', color: 0xF39C12, name: 'Both Teams Score' },
    player_props: { icon: '👤', color: 0x1ABC9C, name: 'Player Props' },
    live: { icon: '🔴', color: 0xE74C3C, name: 'Live Betting' }
};

// Get sport branding
function getSportBranding(sport) {
    return SPORT_IMAGES[sport] || {
        banner: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&h=400&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=400&h=400&fit=crop',
        icon: '🏆',
        color: 0x7289DA,
        gradient: ['#7289DA', '#5B6EAE']
    };
}

// Get team logo
function getTeamLogo(teamName) {
    // Try exact match first
    if (TEAM_LOGOS[teamName]) {
        return TEAM_LOGOS[teamName];
    }
    
    // Try partial match
    const partialMatch = Object.keys(TEAM_LOGOS).find(team => 
        teamName.toLowerCase().includes(team.toLowerCase().split(' ')[0]) ||
        team.toLowerCase().includes(teamName.toLowerCase().split(' ')[0])
    );
    
    if (partialMatch) {
        return TEAM_LOGOS[partialMatch];
    }
    
    // Return a default sports logo
    return 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=100&h=100&fit=crop';
}

// Get league logo
function getLeagueLogo(sport, leagueKey) {
    const sportData = SPORT_IMAGES[sport];
    if (sportData && sportData.leagues && sportData.leagues[leagueKey]) {
        return sportData.leagues[leagueKey].logo;
    }
    return null;
}

// Generate gradient color for embeds
function getGradientColor(sport, percentage = 0) {
    const branding = getSportBranding(sport);
    if (branding.gradient && branding.gradient.length === 2) {
        // Simple gradient between two colors based on percentage
        const start = parseInt(branding.gradient[0].replace('#', ''), 16);
        const end = parseInt(branding.gradient[1].replace('#', ''), 16);
        
        const r1 = (start >> 16) & 255;
        const g1 = (start >> 8) & 255;
        const b1 = start & 255;
        
        const r2 = (end >> 16) & 255;
        const g2 = (end >> 8) & 255;
        const b2 = end & 255;
        
        const r = Math.round(r1 + (r2 - r1) * percentage);
        const g = Math.round(g1 + (g2 - g1) * percentage);
        const b = Math.round(b1 + (b2 - b1) * percentage);
        
        return (r << 16) | (g << 8) | b;
    }
    return branding.color;
}

// Get market styling
function getMarketStyle(marketKey) {
    return MARKET_STYLES[marketKey] || MARKET_STYLES.h2h;
}

// Format odds with color coding
function formatOdds(odds) {
    if (odds < 1.5) return { text: `${odds.toFixed(2)}`, indicator: '🔴' }; // Low odds
    if (odds < 2.0) return { text: `${odds.toFixed(2)}`, indicator: '🟡' }; // Medium odds
    return { text: `${odds.toFixed(2)}`, indicator: '🟢' }; // Good odds
}

// Get time-based greeting for better UX
function getTimeBasedGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return { greeting: 'Good morning', emoji: '🌅' };
    if (hour < 18) return { greeting: 'Good afternoon', emoji: '☀️' };
    if (hour < 22) return { greeting: 'Good evening', emoji: '🌆' };
    return { greeting: 'Good night', emoji: '🌙' };
}

// Check if a major event is currently happening
function getCurrentMajorEvent() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    for (const [eventKey, event] of Object.entries(MAJOR_EVENTS)) {
        for (const dateStr of event.dates) {
            const eventDate = new Date(dateStr);
            const diffDays = Math.abs((eventDate - today) / (1000 * 60 * 60 * 24));
            
            // Event is happening if within 7 days (before or during)
            if (diffDays <= 7) {
                return {
                    key: eventKey,
                    ...event,
                    daysUntil: Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24)),
                    isActive: diffDays <= 1,
                    isUpcoming: diffDays > 1 && diffDays <= 7
                };
            }
        }
    }
    
    return null;
}

// Get dynamic banner based on sport and current events
function getDynamicBanner(sport, leagueKey = null) {
    const currentEvent = getCurrentMajorEvent();
    const sportData = getSportBranding(sport);
    
    // Check if current event matches the sport
    if (currentEvent) {
        const eventSportMapping = {
            'super_bowl': 'american_football',
            'nfl_playoffs': 'american_football',
            'nba_finals': 'basketball',
            'nba_playoffs': 'basketball',
            'march_madness': 'basketball',
            'champions_league_final': 'soccer',
            'australian_open': 'tennis',
            'wimbledon': 'tennis'
        };
        
        if (eventSportMapping[currentEvent.key] === sport) {
            return {
                banner: currentEvent.banner,
                title: currentEvent.title,
                description: currentEvent.description,
                isPromotional: true,
                eventStatus: currentEvent.isActive ? 'LIVE NOW' : `${currentEvent.daysUntil} days`,
                urgency: currentEvent.isActive ? 'high' : currentEvent.isUpcoming ? 'medium' : 'low'
            };
        }
    }
    
    // If specific league requested, use league banner
    if (leagueKey && sportData.leagues && sportData.leagues[leagueKey]) {
        const leagueData = sportData.leagues[leagueKey];
        return {
            banner: leagueData.banner || leagueData.logo,
            title: leagueData.name,
            description: `Official ${leagueData.name} betting`,
            isPromotional: false,
            isLeague: true
        };
    }
    
    // Default sport banner
    return {
        banner: sportData.banner,
        title: `${sport.charAt(0).toUpperCase() + sport.slice(1)} Betting`,
        description: `Live ${sport} odds and markets`,
        isPromotional: false,
        isDefault: true
    };
}

// Get enhanced league logo with banner support
function getEnhancedLeagueLogo(sport, leagueKey) {
    const sportData = SPORT_IMAGES[sport];
    if (sportData && sportData.leagues && sportData.leagues[leagueKey]) {
        return {
            logo: sportData.leagues[leagueKey].logo,
            banner: sportData.leagues[leagueKey].banner,
            name: sportData.leagues[leagueKey].name
        };
    }
    return null;
}

// Get promotional overlay for events
function getPromotionalOverlay() {
    const currentEvent = getCurrentMajorEvent();
    
    if (!currentEvent) return null;
    
    const overlayStyles = {
        'super_bowl': {
            color: '#FFD700',
            icon: '🏆',
            gradient: ['#FFD700', '#FFA500'],
            animation: 'pulse'
        },
        'nfl_playoffs': {
            color: '#FF4500',
            icon: '🔥',
            gradient: ['#FF4500', '#FF6347'],
            animation: 'glow'
        },
        'nba_finals': {
            color: '#1E90FF',
            icon: '👑',
            gradient: ['#1E90FF', '#4169E1'],
            animation: 'bounce'
        },
        'march_madness': {
            color: '#32CD32',
            icon: '🏀',
            gradient: ['#32CD32', '#228B22'],
            animation: 'shake'
        },
        'champions_league_final': {
            color: '#4B0082',
            icon: '⭐',
            gradient: ['#4B0082', '#8A2BE2'],
            animation: 'rotate'
        }
    };
    
    const style = overlayStyles[currentEvent.key] || overlayStyles['nfl_playoffs'];
    
    return {
        title: currentEvent.title,
        description: currentEvent.description,
        status: currentEvent.isActive ? 'LIVE NOW' : `${currentEvent.daysUntil} DAYS`,
        ...style
    };
}

// Generate fancy progress bar
function generateProgressBar(current, total, length = 10) {
    const filled = Math.round((current / total) * length);
    const empty = length - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `[${bar}] ${((current / total) * 100).toFixed(1)}%`;
}

// Get event countdown string
function getEventCountdown() {
    const currentEvent = getCurrentMajorEvent();
    if (!currentEvent) return null;
    
    if (currentEvent.isActive) {
        return `🔴 **${currentEvent.title}** - HAPPENING NOW!`;
    } else if (currentEvent.isUpcoming) {
        return `⏰ **${currentEvent.title}** - ${currentEvent.daysUntil} days to go!`;
    }
    
    return null;
}

module.exports = {
    SPORT_IMAGES,
    TEAM_LOGOS,
    MARKET_STYLES,
    MAJOR_EVENTS,
    getSportBranding,
    getTeamLogo,
    getLeagueLogo,
    getEnhancedLeagueLogo,
    getGradientColor,
    getMarketStyle,
    formatOdds,
    getTimeBasedGreeting,
    generateProgressBar,
    getCurrentMajorEvent,
    getDynamicBanner,
    getPromotionalOverlay,
    getEventCountdown
};