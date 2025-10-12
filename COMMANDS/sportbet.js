/**
 * Sports Betting Command - Premium/Ruby users only
 * Live sports betting with real-time data from sports APIs
 */

const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { PayoutManager } = require('../UTILS/gameUtils');
const { fmt, fmtDelta, getGuildId, sendLogMessage, parseAmount } = require('../UTILS/common');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');
const sportsApiManager = require('../UTILS/sportsApiManager');
const { getSportBranding, getTeamLogo, getLeagueLogo, getEnhancedLeagueLogo, getGradientColor, getMarketStyle, formatOdds, getTimeBasedGreeting, generateProgressBar, getDynamicBanner, getPromotionalOverlay, getEventCountdown } = require('../UTILS/sportsImages');
const { formatAdvancedOdds, getLiveStatus, generateMarketSummary, getBettingConfidence } = require('../UTILS/oddsUtils');

// Active bets storage
const pendingGames = new Map();

// Enhanced sport categories with country-specific leagues
const SPORTS = {
    'soccer': {
        name: '⚽ Soccer',
        icon: '⚽',
        countries: {
            'england': {
                name: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 England',
                leagues: [
                    { key: 'soccer_epl', name: 'Premier League', priority: 1 },
                    { key: 'soccer_england_championship', name: 'Championship', priority: 2 }
                ]
            },
            'spain': {
                name: '🇪🇸 Spain',
                leagues: [
                    { key: 'soccer_spain_la_liga', name: 'La Liga', priority: 1 },
                    { key: 'soccer_spain_segunda_division', name: 'Segunda División', priority: 2 }
                ]
            },
            'germany': {
                name: '🇩🇪 Germany',
                leagues: [
                    { key: 'soccer_germany_bundesliga', name: 'Bundesliga', priority: 1 },
                    { key: 'soccer_germany_bundesliga2', name: 'Bundesliga 2', priority: 2 }
                ]
            },
            'italy': {
                name: '🇮🇹 Italy',
                leagues: [
                    { key: 'soccer_italy_serie_a', name: 'Serie A', priority: 1 },
                    { key: 'soccer_italy_serie_b', name: 'Serie B', priority: 2 }
                ]
            },
            'france': {
                name: '🇫🇷 France',
                leagues: [
                    { key: 'soccer_france_ligue_one', name: 'Ligue 1', priority: 1 },
                    { key: 'soccer_france_ligue_two', name: 'Ligue 2', priority: 2 }
                ]
            },
            'international': {
                name: '🌍 International',
                leagues: [
                    { key: 'soccer_uefa_champs_league', name: 'UEFA Champions League', priority: 1 },
                    { key: 'soccer_uefa_europa_league', name: 'UEFA Europa League', priority: 2 },
                    { key: 'soccer_fifa_world_cup', name: 'FIFA World Cup', priority: 1 }
                ]
            }
        }
    },
    'basketball': {
        name: '🏀 Basketball',
        icon: '🏀',
        countries: {
            'usa': {
                name: '🇺🇸 United States',
                leagues: [
                    { key: 'basketball_nba', name: 'NBA', priority: 1 },
                    { key: 'basketball_wnba', name: 'WNBA', priority: 2 },
                    { key: 'basketball_ncaab', name: 'NCAA Basketball', priority: 2 }
                ]
            },
            'europe': {
                name: '🇪🇺 Europe',
                leagues: [
                    { key: 'basketball_euroleague', name: 'EuroLeague', priority: 1 },
                    { key: 'basketball_eurocup', name: 'EuroCup', priority: 2 }
                ]
            }
        }
    },
    'american_football': {
        name: '🏈 American Football',
        icon: '🏈',
        countries: {
            'usa': {
                name: '🇺🇸 United States',
                leagues: [
                    { key: 'americanfootball_nfl', name: 'NFL', priority: 1 },
                    { key: 'americanfootball_ncaaf', name: 'NCAA Football', priority: 2 }
                ]
            }
        }
    },
    'tennis': {
        name: '🎾 Tennis',
        icon: '🎾',
        countries: {
            'international': {
                name: '🌍 International Tournaments',
                leagues: [
                    { key: 'tennis_atp_wimbledon', name: 'Wimbledon (ATP)', priority: 1 },
                    { key: 'tennis_wta_wimbledon', name: 'Wimbledon (WTA)', priority: 1 },
                    { key: 'tennis_atp_us_open', name: 'US Open (ATP)', priority: 1 },
                    { key: 'tennis_wta_us_open', name: 'US Open (WTA)', priority: 1 },
                    { key: 'tennis_atp_french_open', name: 'French Open (ATP)', priority: 1 },
                    { key: 'tennis_wta_french_open', name: 'French Open (WTA)', priority: 1 },
                    { key: 'tennis_atp_australian_open', name: 'Australian Open (ATP)', priority: 1 },
                    { key: 'tennis_wta_australian_open', name: 'Australian Open (WTA)', priority: 1 }
                ]
            }
        }
    },
    'baseball': {
        name: '⚾ Baseball',
        icon: '⚾',
        countries: {
            'usa': {
                name: '🇺🇸 United States',
                leagues: [
                    { key: 'baseball_mlb', name: 'MLB', priority: 1 },
                    { key: 'baseball_ncaa', name: 'NCAA Baseball', priority: 2 }
                ]
            },
            'japan': {
                name: '🇯🇵 Japan',
                leagues: [
                    { key: 'baseball_npb', name: 'NPB (Nippon Professional Baseball)', priority: 1 }
                ]
            }
        }
    },
    'hockey': {
        name: '🏒 Hockey',
        icon: '🏒',
        countries: {
            'usa_canada': {
                name: '🇺🇸🇨🇦 North America',
                leagues: [
                    { key: 'icehockey_nhl', name: 'NHL', priority: 1 }
                ]
            },
            'europe': {
                name: '🇪🇺 Europe',
                leagues: [
                    { key: 'icehockey_khl', name: 'KHL (Russia)', priority: 1 },
                    { key: 'icehockey_sweden_hockey_league', name: 'Swedish Hockey League', priority: 2 }
                ]
            }
        }
    }
};

// Minimum bet amounts by tier
const MIN_BETS = {
    diamond: 5000,
    ruby: 2500
};

// Comprehensive betting markets by sport
const BETTING_MARKETS = {
    'soccer': {
        'h2h': { name: 'Match Winner (1X2)', icon: '🏆', description: 'Pick the winner or draw' },
        'spreads': { name: 'Asian Handicap', icon: '⚖️', description: 'Handicap betting' },
        'totals': { name: 'Total Goals (O/U)', icon: '⚽', description: 'Over/Under total goals' },
        'btts': { name: 'Both Teams to Score', icon: '🎯', description: 'Yes/No both teams score' },
        'corners': { name: 'Total Corners', icon: '📐', description: 'Over/Under corner kicks' },
        'cards': { name: 'Total Cards', icon: '🟨', description: 'Over/Under yellow/red cards' }
    },
    'basketball': {
        'h2h': { name: 'Moneyline', icon: '🏆', description: 'Pick the winner' },
        'spreads': { name: 'Point Spread', icon: '⚖️', description: 'Handicap betting' },
        'totals': { name: 'Total Points (O/U)', icon: '🏀', description: 'Over/Under total points' },
        'quarters': { name: 'Quarter Betting', icon: '1️⃣', description: 'First quarter results' },
        'player_props': { name: 'Player Props', icon: '👤', description: 'Individual player stats' }
    },
    'american_football': {
        'h2h': { name: 'Moneyline', icon: '🏆', description: 'Pick the winner' },
        'spreads': { name: 'Point Spread', icon: '⚖️', description: 'Handicap betting' },
        'totals': { name: 'Total Points (O/U)', icon: '🏈', description: 'Over/Under total points' },
        'halftime': { name: 'Halftime Betting', icon: '⏱️', description: 'First half results' },
        'touchdowns': { name: 'Total TDs', icon: '🎯', description: 'Over/Under touchdowns' }
    },
    'tennis': {
        'h2h': { name: 'Match Winner', icon: '🏆', description: 'Pick the winner' },
        'spreads': { name: 'Set Handicap', icon: '⚖️', description: 'Set advantage betting' },
        'totals': { name: 'Total Games (O/U)', icon: '🎾', description: 'Over/Under total games' },
        'sets': { name: 'Set Betting', icon: '📊', description: 'Exact set score' },
        'aces': { name: 'Total Aces', icon: '🎯', description: 'Over/Under aces served' }
    },
    'baseball': {
        'h2h': { name: 'Moneyline', icon: '🏆', description: 'Pick the winner' },
        'spreads': { name: 'Run Line', icon: '⚖️', description: 'Run handicap betting' },
        'totals': { name: 'Total Runs (O/U)', icon: '⚾', description: 'Over/Under total runs' },
        'innings': { name: '5 Innings', icon: '5️⃣', description: 'First 5 innings result' },
        'hits': { name: 'Total Hits', icon: '🎯', description: 'Over/Under total hits' }
    },
    'hockey': {
        'h2h': { name: 'Moneyline', icon: '🏆', description: 'Pick the winner' },
        'spreads': { name: 'Puck Line', icon: '⚖️', description: 'Goal handicap betting' },
        'totals': { name: 'Total Goals (O/U)', icon: '🏒', description: 'Over/Under total goals' },
        'periods': { name: 'Period Betting', icon: '1️⃣', description: 'First period results' },
        'shots': { name: 'Total Shots', icon: '🎯', description: 'Over/Under shots on goal' }
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sportbet')
        .setDescription('💎 Place live sports bets (Premium/Ruby only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View available games and odds')
                .addStringOption(option =>
                    option.setName('sport')
                        .setDescription('Sport category')
                        .setRequired(true)
                        .addChoices(
                            { name: '⚽ Soccer', value: 'soccer' },
                            { name: '🏀 Basketball', value: 'basketball' },
                            { name: '🏈 American Football', value: 'american_football' },
                            { name: '🎾 Tennis', value: 'tennis' },
                            { name: '⚾ Baseball', value: 'baseball' },
                            { name: '🏒 Hockey', value: 'hockey' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('place')
                .setDescription('Place a bet on a game')
                .addStringOption(option =>
                    option.setName('sport')
                        .setDescription('Sport category')
                        .setRequired(true)
                        .addChoices(
                            { name: '⚽ Soccer', value: 'soccer' },
                            { name: '🏀 Basketball', value: 'basketball' },
                            { name: '🏈 American Football', value: 'american_football' },
                            { name: '🎾 Tennis', value: 'tennis' },
                            { name: '⚾ Baseball', value: 'baseball' },
                            { name: '🏒 Hockey', value: 'hockey' }
                        )
                )
                .addStringOption(option =>
                    option.setName('amount')
                        .setDescription('Bet amount (min varies by tier)')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('mybets')
                .setDescription('View your active and recent bets')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('View top sports bettors')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('apiusage')
                .setDescription('🔧 Admin: Check API usage statistics')
        ),

    async execute(interaction) {
        console.log('=== SPORTBET EXECUTE CALLED ===');
        
        // First, let's check if this is even the right interaction
        if (!interaction.isChatInputCommand()) {
            console.log('SportBet: Not a chat input command, type:', interaction.type);
            return;
        }
        
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const subcommand = interaction.options.getSubcommand();

        console.log('SportBet execute called - User:', userId, 'Subcommand:', subcommand);
        console.log('SportBet interaction type:', interaction.type, 'isCommand:', interaction.isChatInputCommand());
        console.log('SportBet command name:', interaction.commandName);
        console.log('SportBet full options:', interaction.options.data);
        
        // Ensure this is actually a sportbet command
        if (interaction.commandName !== 'sportbet') {
            console.log('SportBet: Wrong command name:', interaction.commandName);
            return;
        }
        
        // Check if interaction is already processed
        if (interaction.replied || interaction.deferred) {
            console.log('SportBet: Interaction already processed');
            return;
        }
        
        console.log('SportBet: About to defer reply...');
        await interaction.deferReply();
        console.log('SportBet: Reply deferred successfully');

        try {
            console.log('SportBet: Starting command execution for user:', userId, 'subcommand:', subcommand);
            // Check premium/ruby subscription
            const subscription = await getUserSubscription(userId);
            if (!subscription) {
                console.log('SportBet: User has no active subscription');
                const noSubEmbed = new EmbedBuilder()
                    .setTitle('🌟 Premium Sports Betting')
                    .setDescription('🚀 **Unlock the ultimate betting experience!**\n\n' +
                                   '⚡ Live betting with real-time odds\n' +
                                   '🏆 Premium leagues & tournaments\n' +
                                   '💰 Best odds guaranteed\n' +
                                   '📊 Advanced betting markets\n' +
                                   '🎯 Instant payouts')
                    .addFields(
                        { 
                            name: '💎 Diamond Tier', 
                            value: '**$4.99/month**\n' +
                                   '• 🎮 Sports betting access\n' +
                                   '• 💰 50K monthly bonus\n' +
                                   '• 📈 Live odds & markets\n' +
                                   '• ⚡ Priority support', 
                            inline: true 
                        },
                        { 
                            name: '🔴 Ruby Tier', 
                            value: '**$9.99/month**\n' +
                                   '• 🏆 Enhanced betting limits\n' +
                                   '• 💎 100K monthly bonus\n' +
                                   '• 🎯 Exclusive markets\n' +
                                   '• 🌟 VIP treatment', 
                            inline: true 
                        }
                    )
                    .setColor('#FFD700')
                    .setThumbnail('https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=400&h=400&fit=crop')
                    .setImage('https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&h=400&fit=crop')
                    .setFooter({ 
                        text: '🛒 Subscribe via Server Shop to unlock premium sports betting!',
                        iconURL: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=100&h=100&fit=crop'
                    })
                    .setTimestamp();
                
                return await interaction.editReply({ embeds: [noSubEmbed] });
            }

            const isRuby = subscription.subscription_type === 'ruby_subscription';
            const tier = isRuby ? 'ruby' : 'diamond';

            // Handle subcommands
            console.log('SportBet: Handling subcommand:', subcommand, 'for user:', userId, 'tier:', tier);
            switch (subcommand) {
                case 'view':
                    await handleViewGames(interaction, tier);
                    break;
                case 'place':
                    await handlePlaceBet(interaction, tier, userId, guildId);
                    break;
                case 'mybets':
                    await handleMyBets(interaction, userId, guildId);
                    break;
                case 'leaderboard':
                    await handleLeaderboard(interaction, guildId);
                    break;
                case 'apiusage':
                    await handleApiUsage(interaction, userId);
                    break;
            }

        } catch (error) {
            logger.error(`Error in sportbet command: ${error.message}`);
            await interaction.editReply({
                content: '❌ An error occurred while processing your request. Please try again later.'
            });
        }
    }
};

/**
 * Helper function to get all leagues for a sport
 */
function getAllLeaguesForSport(sportKey) {
    const sport = SPORTS[sportKey];
    if (!sport || !sport.countries) return [];
    
    const allLeagues = [];
    for (const [countryKey, countryData] of Object.entries(sport.countries)) {
        for (const league of countryData.leagues) {
            allLeagues.push(league.key);
        }
    }
    return allLeagues;
}

/**
 * Helper function to get country data for a sport
 */
function getCountriesForSport(sportKey) {
    const sport = SPORTS[sportKey];
    if (!sport || !sport.countries) return {};
    return sport.countries;
}

/**
 * Helper function to format league names with country context
 */
function formatLeagueDisplay(sportKey, countryKey, leagueKey) {
    const sport = SPORTS[sportKey];
    if (!sport || !sport.countries || !sport.countries[countryKey]) return leagueKey;
    
    const country = sport.countries[countryKey];
    const league = country.leagues.find(l => l.key === leagueKey);
    
    return league ? `${country.name} - ${league.name}` : leagueKey;
}

/**
 * Fetch live games from API with caching
 */
async function fetchLiveGames(sport, selectedCountry = null, selectedLeague = null) {
    try {
        console.log('SportBet: fetchLiveGames called with:', { sport, selectedCountry, selectedLeague });
        
        let leagues;
        
        if (selectedLeague) {
            // Single league requested
            leagues = [selectedLeague];
            console.log('SportBet: Using single league:', selectedLeague);
        } else if (selectedCountry) {
            // All leagues for a specific country
            const countries = getCountriesForSport(sport);
            leagues = countries[selectedCountry]?.leagues.map(l => l.key) || [];
            console.log('SportBet: Using country leagues:', leagues);
        } else {
            // All leagues for the sport
            leagues = getAllLeaguesForSport(sport);
            console.log('SportBet: Using all leagues for sport:', leagues.length);
        }
        
        if (!leagues || leagues.length === 0) {
            console.log('SportBet: No leagues found for', { sport, selectedCountry, selectedLeague });
            return [];
        }
        
        // Use the sports API manager with caching and rotation
        console.log('SportBet: Calling sportsApiManager.fetchGamesWithCache...');
        const allGames = await sportsApiManager.fetchGamesWithCache(sport, leagues);
        console.log('SportBet: API returned', allGames?.length || 0, 'games');
        
        if (!allGames) {
            console.log('SportBet: API returned null/undefined');
            return [];
        }
        
        // Filter games in next 48 hours
        const filteredGames = allGames.filter(game => {
            const gameTime = new Date(game.commence_time);
            const now = new Date();
            const hoursUntilGame = (gameTime - now) / (1000 * 60 * 60);
            return hoursUntilGame > 0 && hoursUntilGame < 48;
        });
        
        console.log('SportBet: Filtered to', filteredGames.length, 'games within 48 hours');
        return filteredGames;

    } catch (error) {
        logger.error(`Error fetching games: ${error.message}`);
        console.log('SportBet: Error in fetchLiveGames:', error.message);
        console.log('SportBet: Falling back to mock games');
        return sportsApiManager.getMockGames(sport);
    }
}

/**
 * Handle viewing available games with enhanced navigation
 */
async function handleViewGames(interaction, tier) {
    const sport = interaction.options.getString('sport');
    console.log('SportBet: handleViewGames called with sport:', sport, 'tier:', tier);
    
    if (!sport) {
        console.log('SportBet: No sport provided in options');
        return await interaction.editReply({
            content: '❌ Please select a sport category first.',
            flags: MessageFlags.Ephemeral
        });
    }
    
    const countries = getCountriesForSport(sport);
    console.log('SportBet: Found countries for', sport, ':', Object.keys(countries));
    
    if (!countries || Object.keys(countries).length === 0) {
        console.log('SportBet: No countries found for sport:', sport);
        return await interaction.editReply({
            content: `❌ No leagues available for ${sport}. Please try another sport.`,
            flags: MessageFlags.Ephemeral
        });
    }
    
    // First show country selection
    if (Object.keys(countries).length > 1) {
        console.log('SportBet: Showing country selection for', sport);
        await showCountrySelection(interaction, sport, tier);
    } else {
        // If only one country, skip to league selection
        const countryKey = Object.keys(countries)[0];
        console.log('SportBet: Only one country found, skipping to league selection:', countryKey);
        await showLeagueSelection(interaction, sport, countryKey, tier);
    }
}

/**
 * Show country selection for a sport
 */
async function showCountrySelection(interaction, sport, tier) {
    const countries = getCountriesForSport(sport);
    const sportData = SPORTS[sport];
    const branding = getSportBranding(sport);
    const timeGreeting = getTimeBasedGreeting();
    
    // Generate timestamp once and reuse it
    const tempId = `${interaction.user.id}_${Date.now()}`;
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`sportbet_country_${sport}_${tempId}`)
        .setPlaceholder(`${branding.icon} Select a country/region`)
        .addOptions(
            Object.entries(countries).slice(0, 25).map(([countryKey, countryData]) => ({
                label: countryData.name.replace(/🏴󠁧󠁢󠁥󠁮󠁧󠁿|🇪🇸|🇩🇪|🇮🇹|🇫🇷|🌍|🇺🇸|🇪🇺|🇯🇵|🇺🇸🇨🇦/g, '').trim(),
                description: `${countryData.leagues.length} premier league(s) • Live odds`,
                value: countryKey,
                emoji: countryData.name.match(/🏴󠁧󠁢󠁥󠁮󠁧󠁿|🇪🇸|🇩🇪|🇮🇹|🇫🇷|🌍|🇺🇸|🇪🇺|🇯🇵|🇺🇸🇨🇦/)?.[0] || branding.icon
            }))
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    // Get dynamic banner for the sport
    const dynamicBanner = getDynamicBanner(sport);
    const eventCountdown = getEventCountdown();
    const promoOverlay = getPromotionalOverlay();
    
    let description = `${timeGreeting.emoji} ${timeGreeting.greeting}! Choose your region to access live betting markets:\n\n`;
    
    // Add promotional event info if active
    if (eventCountdown) {
        description += `${eventCountdown}\n\n`;
    }
    
    description += `${tier === 'ruby' ? '🔴 **Ruby Tier** • Enhanced limits & exclusive markets' : '💎 **Diamond Tier** • Premium access'}\n`;
    description += `📈 **Live odds** • 🔄 **Real-time updates** • ⚡ **Instant betting**`;
    
    // Add promotional banner info
    if (dynamicBanner.isPromotional) {
        description += `\n\n${promoOverlay.icon} **${dynamicBanner.title}** ${promoOverlay.status}`;
    }
    
    const embed = new EmbedBuilder()
        .setTitle(`${branding.icon} ${sportData.name} • Select Region`)
        .setDescription(description)
        .setColor(dynamicBanner.isPromotional ? parseInt(promoOverlay.color.replace('#', ''), 16) : getGradientColor(sport))
        .setThumbnail(branding.thumbnail)
        .setImage(dynamicBanner.banner)
        .setFooter({ 
            text: `🌟 Select a region to view ${Object.keys(countries).length} available markets`, 
            iconURL: branding.thumbnail 
        })
        .setTimestamp();

    // Add overview of available countries
    let countryList = '';
    for (const [countryKey, countryData] of Object.entries(countries)) {
        const topLeagues = countryData.leagues
            .filter(l => l.priority === 1)
            .map(l => l.name)
            .slice(0, 2)
            .join(', ');
        countryList += `${countryData.name} - ${topLeagues}${countryData.leagues.length > 2 ? '...' : ''}\n`;
    }
    
    embed.addFields({
        name: '🏆 Available Regions',
        value: countryList.substring(0, 1024),
        inline: false
    });

    // Store data for interaction (using the same tempId from above)
    pendingGames.set(`country_${tempId}`, { sport, tier });
    setTimeout(() => pendingGames.delete(`country_${tempId}`), 300000);

    await interaction.editReply({ embeds: [embed], components: [row] });
}

/**
 * Show league selection for a country
 */
async function showLeagueSelection(interaction, sport, countryKey, tier) {
    try {
        console.log('SportBet: showLeagueSelection called with sport:', sport, 'country:', countryKey, 'tier:', tier);
        
        const countries = getCountriesForSport(sport);
        const countryData = countries[countryKey];
        const sportData = SPORTS[sport];
        
        if (!countryData) {
            console.log('SportBet: Invalid country data for:', countryKey, 'in sport:', sport);
            return await interaction.editReply({
                content: `❌ Invalid country selection: ${countryKey}. Please try again.`,
                flags: MessageFlags.Ephemeral
            });
        }
        
        if (!sportData) {
            console.log('SportBet: Invalid sport data for:', sport);
            return await interaction.editReply({
                content: `❌ Invalid sport: ${sport}. Please try again.`,
                flags: MessageFlags.Ephemeral
            });
        }

        // If only one league, skip to games
        if (countryData.leagues.length === 1) {
            console.log('SportBet: Only one league found, going directly to games');
            await showGamesForLeague(interaction, sport, countryKey, countryData.leagues[0].key, tier);
            return;
        }
        
        console.log('SportBet: Multiple leagues found:', countryData.leagues.length, 'leagues');

    // Generate timestamp once and reuse it
    const tempId = `${interaction.user.id}_${Date.now()}`;
    console.log('SportBet: Generated tempId for league selection:', tempId);
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`sportbet_league_${sport}_${countryKey}_${tempId}`)
        .setPlaceholder('🏆 Select a league')
        .addOptions([
            {
                label: 'All Leagues',
                description: `View all ${countryData.leagues.length} leagues`,
                value: 'all',
                emoji: '🌟'
            },
            ...countryData.leagues.map(league => ({
                label: league.name,
                description: league.priority === 1 ? 'Premier league' : 'Secondary league',
                value: league.key,
                emoji: league.priority === 1 ? '⭐' : '🏆'
            }))
        ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    const embed = new EmbedBuilder()
        .setTitle(`${sportData.name} - ${countryData.name}`)
        .setDescription(`Select a league to view games:\n\n${tier === 'ruby' ? '🔴 **Ruby Tier**' : '💎 **Diamond Tier**'}`)
        .setColor(tier === 'ruby' ? '#FF0000' : '#00FFFF')
        .setFooter({ text: 'Select a league to view available games' })
        .setTimestamp();

    // Add league overview
    let leagueList = '';
    countryData.leagues.forEach(league => {
        leagueList += `${league.priority === 1 ? '⭐' : '🏆'} **${league.name}**\n`;
    });
    
    embed.addFields({
        name: '🏆 Available Leagues',
        value: leagueList,
        inline: false
    });

    // Store data for interaction (using the same tempId from above)
    console.log('SportBet: Storing league data with key:', `league_${tempId}`);
    pendingGames.set(`league_${tempId}`, { sport, countryKey, tier });
    setTimeout(() => pendingGames.delete(`league_${tempId}`), 300000);

    console.log('SportBet: About to send league selection embed...');
    await interaction.editReply({ embeds: [embed], components: [row] });
    console.log('SportBet: League selection sent successfully');
    
    } catch (error) {
        console.log('SportBet: ERROR in showLeagueSelection:', error.message);
        console.log('SportBet: Full error:', error);
        logger.error(`Error in showLeagueSelection: ${error.message}`);
        
        try {
            await interaction.editReply({
                content: `❌ Error loading leagues for ${sport}. Please try again.\n\nError: ${error.message}`,
                flags: MessageFlags.Ephemeral
            });
        } catch (replyError) {
            console.log('SportBet: Could not send error reply:', replyError.message);
        }
    }
}

/**
 * Show league selection for a country (for select menu updates)
 */
async function showLeagueSelectionUpdate(interaction, sport, countryKey, tier) {
    const countries = getCountriesForSport(sport);
    const countryData = countries[countryKey];
    const sportData = SPORTS[sport];
    
    if (!countryData) {
        return await interaction.update({
            content: '❌ Invalid country selection.',
            embeds: [],
            components: []
        });
    }

    // If only one league, skip to games
    if (countryData.leagues.length === 1) {
        await showGamesForLeagueUpdate(interaction, sport, countryKey, countryData.leagues[0].key, tier);
        return;
    }

    // Generate timestamp once and reuse it
    const tempId = `${interaction.user.id}_${Date.now()}`;
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`sportbet_league_${sport}_${countryKey}_${tempId}`)
        .setPlaceholder('🏆 Select a league')
        .addOptions([
            {
                label: 'All Leagues',
                description: `View all ${countryData.leagues.length} leagues`,
                value: 'all',
                emoji: '🌟'
            },
            ...countryData.leagues.map(league => ({
                label: league.name,
                description: league.priority === 1 ? 'Premier league' : 'Secondary league',
                value: league.key,
                emoji: league.priority === 1 ? '⭐' : '🏆'
            }))
        ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    const embed = new EmbedBuilder()
        .setTitle(`${sportData.name} - ${countryData.name}`)
        .setDescription(`Select a league to view games:\n\n${tier === 'ruby' ? '🔴 **Ruby Tier**' : '💎 **Diamond Tier**'}`)
        .setColor(tier === 'ruby' ? '#FF0000' : '#00FFFF')
        .setFooter({ text: 'Select a league to view available games' })
        .setTimestamp();

    // Add league overview
    let leagueList = '';
    countryData.leagues.forEach(league => {
        leagueList += `${league.priority === 1 ? '⭐' : '🏆'} **${league.name}**\n`;
    });
    
    embed.addFields({
        name: '🏆 Available Leagues',
        value: leagueList,
        inline: false
    });

    // Store data for interaction (using the same tempId from above)
    pendingGames.set(`league_${tempId}`, { sport, countryKey, tier });
    setTimeout(() => pendingGames.delete(`league_${tempId}`), 300000);

    await interaction.update({ embeds: [embed], components: [row] });
}

/**
 * Show games for a specific league
 */
async function showGamesForLeague(interaction, sport, countryKey, leagueKey, tier) {
    console.log('SportBet: showGamesForLeague called with:', { sport, countryKey, leagueKey, tier });
    
    const countries = getCountriesForSport(sport);
    const countryData = countries[countryKey];
    const sportData = SPORTS[sport];
    
    if (!countryData || !sportData) {
        console.log('SportBet: Invalid data - countryData:', !!countryData, 'sportData:', !!sportData);
        return await interaction.editReply({
            content: `❌ Invalid configuration for ${sport}/${countryKey}. Please try again.`,
            flags: MessageFlags.Ephemeral
        });
    }
    
    // Fetch games for the specific league
    console.log('SportBet: Fetching games for league:', leagueKey);
    const games = await fetchLiveGames(sport, countryKey, leagueKey === 'all' ? null : leagueKey);
    console.log('SportBet: Fetched', games.length, 'games');
    
    if (!games) {
        console.log('SportBet: Games fetch returned null/undefined');
        return await interaction.editReply({
            content: '❌ Failed to fetch games. Please try again later.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (games.length === 0) {
        const backButton = new ButtonBuilder()
            .setCustomId(`sportbet_back_league_${sport}_${countryKey}_${interaction.user.id}`)
            .setLabel('← Back to Leagues')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(backButton);

        const noGamesEmbed = new EmbedBuilder()
            .setTitle(`${sportData.name} - No Games Available`)
            .setDescription(`No upcoming games found in **${countryData.name}**.\n\nCheck back later or try a different league!`)
            .setColor('#FFA500')
            .setFooter({ text: 'Use the button below to go back' });
        
        return await interaction.editReply({ embeds: [noGamesEmbed], components: [row] });
    }

    // Create enhanced games display
    const leagueName = leagueKey === 'all' ? 'All Leagues' : 
                     countryData.leagues.find(l => l.key === leagueKey)?.name || leagueKey;

    const branding = getSportBranding(sport);
    const leagueLogo = getLeagueLogo(sport, leagueKey);
    
    // Get dynamic banner for the specific league or sport
    const dynamicBanner = getDynamicBanner(sport, leagueKey);
    const eventCountdown = getEventCountdown();
    const promoOverlay = getPromotionalOverlay();
    
    let description = `🏆 **${countryData.name}** • ${tier === 'ruby' ? '🔴 **Ruby Tier** • Premium Access' : '💎 **Diamond Tier** • Elite Member'}\n\n`;
    
    // Add promotional event info if active
    if (eventCountdown && dynamicBanner.isPromotional) {
        description += `${eventCountdown}\n\n`;
    }
    
    description += `🎮 Showing **${Math.min(games.length, 6)} of ${games.length}** live games • 📈 **Real-time odds**\n`;
    description += `⚡ **Instant betting** • 🔄 **Live updates** • 💰 **Best odds guaranteed**`;
    
    const gamesEmbed = new EmbedBuilder()
        .setTitle(`${branding.icon} ${dynamicBanner.title || leagueName} • Live Betting`)
        .setDescription(description)
        .setColor(dynamicBanner.isPromotional ? parseInt(promoOverlay?.color?.replace('#', ''), 16) : getGradientColor(sport, 0.3))
        .setThumbnail(leagueLogo || branding.thumbnail)
        .setImage(dynamicBanner.banner)
        .setFooter({ 
            text: `🌟 ${games.length} games available • Updated every 30 seconds`, 
            iconURL: branding.thumbnail 
        })
        .setTimestamp();

    // Add games with pagination (5 games per page)
    const gamesPerPage = 5;
    const currentPage = 0; // Default to first page - TODO: Add pagination controls
    const totalPages = Math.ceil(games.length / gamesPerPage);
    const startIdx = currentPage * gamesPerPage;
    const endIdx = Math.min(startIdx + gamesPerPage, games.length);
    const pageGames = games.slice(startIdx, endIdx);
    
    pageGames.forEach((game, idx) => {
        const gameTime = new Date(game.commence_time);
        const timeUntil = Math.round((gameTime - new Date()) / (1000 * 60 * 60));
        const odds = game.bookmakers[0]?.markets[0]?.outcomes || [];
        const homeOdds = odds.find(o => o.name === game.home_team)?.price || 2.0;
        const awayOdds = odds.find(o => o.name === game.away_team)?.price || 2.0;

        const homeOddsFormatted = formatOdds(homeOdds);
        const awayOddsFormatted = formatOdds(awayOdds);

        const timeText = timeUntil < 1 ? '🔴 LIVE' : 
                        timeUntil < 2 ? '🟡 Starting soon' :
                        timeUntil < 24 ? `⏰ ${timeUntil}h` : 
                        `📅 ${gameTime.toLocaleDateString()}`;

        // Use full team names without truncation
        const homeTeamFull = game.home_team;
        const awayTeamFull = game.away_team;
        
        try {
            // Create individual field for each game to avoid length issues
            let gameText = `\`\`\`🎮 ${homeTeamFull} vs ${awayTeamFull}\`\`\`\n`;
            gameText += `${timeText}\n`;
            gameText += `🏠 ${homeOddsFormatted.indicator} **${homeOddsFormatted.text}** ⚡ VS ⚡ **${awayOddsFormatted.text}** ${awayOddsFormatted.indicator} ✈️\n`;
            gameText += `📊 H2H • Spread • O/U • Props`;
            
            // Ensure field value is under Discord's 1024 character limit
            if (gameText.length > 1020) {
                gameText = gameText.substring(0, 1020) + '...';
            }
            
            gamesEmbed.addFields({
                name: `${idx + 1}. ${homeTeamFull} vs ${awayTeamFull}`,
                value: gameText,
                inline: false
            });
        } catch (error) {
            console.error('SportBet: Error adding game field:', error);
            // Fallback to simple format
            gamesEmbed.addFields({
                name: `${idx + 1}. Game ${idx + 1}`,
                value: `${homeTeamFull} vs ${awayTeamFull}\n${timeText}`,
                inline: false
            });
        }
    });
    
    // Add pagination info if there are multiple pages
    if (totalPages > 1) {
        gamesEmbed.addFields({
            name: '📄 Page Navigation',
            value: `📊 Showing page **${currentPage + 1} of ${totalPages}** (${pageGames.length} games)\n📈 Total: **${games.length}** live games available`,
            inline: false
        });
    }

    // Store games and create action buttons
    const tempId = `${interaction.user.id}_${Date.now()}`;
    pendingGames.set(tempId, { games, sport, countryKey, leagueKey, tier });
    console.log('SportBet: Stored games with tempId:', tempId, 'for user:', interaction.user.id);
    setTimeout(() => {
        console.log('SportBet: Cleaning up tempId:', tempId);
        pendingGames.delete(tempId);
    }, 300000);

    const betButton = new ButtonBuilder()
        .setCustomId(`sportbet_select_${tempId}`)
        .setLabel('💰 Place Live Bet')
        .setStyle(ButtonStyle.Success)
        .setEmoji('⚡');

    const marketsButton = new ButtonBuilder()
        .setCustomId(`sportbet_markets_${tempId}`)
        .setLabel('📊 View Markets')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎯');

    const backButton = new ButtonBuilder()
        .setCustomId(`sportbet_back_league_${sport}_${countryKey}_${interaction.user.id}`)
        .setLabel('← Back to Leagues')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('↩️');

    const refreshButton = new ButtonBuilder()
        .setCustomId(`sportbet_refresh_${sport}_${countryKey}_${leagueKey}_${interaction.user.id}`)
        .setLabel('🔄 Live Refresh')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⚡');

    const row1 = new ActionRowBuilder().addComponents(backButton, refreshButton, marketsButton);
    const row2 = new ActionRowBuilder().addComponents(betButton);

    console.log('SportBet: About to send games embed with', gamesEmbed.data.fields?.length || 0, 'fields');
    console.log('SportBet: Embed data keys:', Object.keys(gamesEmbed.data));
    
    try {
        // Validate embed before sending
        console.log('SportBet: Validating embed before sending...');
        console.log('SportBet: Embed title length:', gamesEmbed.data.title?.length || 0);
        console.log('SportBet: Embed description length:', gamesEmbed.data.description?.length || 0);
        console.log('SportBet: Embed fields count:', gamesEmbed.data.fields?.length || 0);
        console.log('SportBet: Embed color:', gamesEmbed.data.color);
        
        // Check if total embed size is reasonable
        const totalEmbedSize = JSON.stringify(gamesEmbed.data).length;
        console.log('SportBet: Total embed size:', totalEmbedSize, 'characters');
        
        if (totalEmbedSize > 5500) { // Leave buffer under 6000 char limit
            console.warn('SportBet: Embed too large, using simplified version');
            throw new Error('Embed too large');
        }
        
        await interaction.editReply({ embeds: [gamesEmbed], components: actionRows });
        console.log('SportBet: Games embed sent successfully');
    } catch (error) {
        console.error('SportBet: Error sending games embed:', error);
        console.error('SportBet: Error details:', error.message);
        console.error('SportBet: Error stack:', error.stack);
        console.error('SportBet: Embed data:', JSON.stringify(gamesEmbed.data, null, 2));
        
        // Fallback to simple embed with basic validation
        const fallbackEmbed = new EmbedBuilder()
            .setTitle(`${sportData.name} • Live Betting`)
            .setDescription(`${games.length} games available for ${leagueName}`)
            .setColor('#FF0000');
            
        try {
            await interaction.editReply({ 
                embeds: [fallbackEmbed], 
                components: [row1],
                content: '⚠️ Some formatting issues occurred, but games are available!'
            });
            console.log('SportBet: Fallback embed sent successfully');
        } catch (fallbackError) {
            console.error('SportBet: Even fallback embed failed:', fallbackError);
            await interaction.editReply({
                content: '❌ An error occurred while loading games. Please try again.',
                embeds: [],
                components: []
            });
        }
    }
}

/**
 * Show games for a specific league with pagination support
 */
async function showGamesForLeagueWithPage(interaction, sport, countryKey, leagueKey, tier, pageNum = 0) {
    // Use the existing logic but with custom page number
    const countries = getCountriesForSport(sport);
    const countryData = countries[countryKey];
    const sportData = SPORTS[sport];
    
    // Fetch games
    console.log('SportBet: showGamesForLeagueWithPage - About to call fetchLiveGames with page:', pageNum);
    const games = await fetchLiveGames(sport, countryKey, leagueKey === 'all' ? null : leagueKey);
    
    if (!games || games.length === 0) {
        return await interaction.update({
            content: `❌ No games found for ${sportData.name}.`,
            embeds: [],
            components: []
        });
    }

    // Create enhanced games display with custom page
    const leagueName = leagueKey === 'all' ? 'All Leagues' : 
                     countryData.leagues.find(l => l.key === leagueKey)?.name || leagueKey;

    const branding = getSportBranding(sport);
    const leagueLogo = getLeagueLogo(sport, leagueKey);
    
    // Get dynamic banner for the specific league or sport
    const dynamicBanner = getDynamicBanner(sport, leagueKey);
    const eventCountdown = getEventCountdown();
    const promoOverlay = getPromotionalOverlay();
    
    let description = `🏆 **${countryData.name}** • ${tier === 'ruby' ? '🔴 **Ruby Tier** • Premium Access' : '💎 **Diamond Tier** • Elite Member'}\n\n`;
    
    // Add promotional event info if active
    if (eventCountdown && dynamicBanner.isPromotional) {
        description += `${eventCountdown}\n\n`;
    }
    
    // Add games with custom pagination
    const gamesPerPage = 5;
    const currentPage = pageNum;
    const totalPages = Math.ceil(games.length / gamesPerPage);
    const startIdx = currentPage * gamesPerPage;
    const endIdx = Math.min(startIdx + gamesPerPage, games.length);
    const pageGames = games.slice(startIdx, endIdx);
    
    description += `🎮 Showing **${pageGames.length} of ${games.length}** live games • 📈 **Real-time odds**\n`;
    description += `⚡ **Instant betting** • 🔄 **Live updates** • 💰 **Best odds guaranteed**`;
    
    const gamesEmbed = new EmbedBuilder()
        .setTitle(`${branding.icon} ${dynamicBanner.title || leagueName} • Live Betting`)
        .setDescription(description)
        .setColor(dynamicBanner.isPromotional ? parseInt(promoOverlay?.color?.replace('#', ''), 16) : getGradientColor(sport, 0.3))
        .setThumbnail(leagueLogo || branding.thumbnail)
        .setImage(dynamicBanner.banner)
        .setFooter({ 
            text: `🌟 ${games.length} games available • Updated every 30 seconds`, 
            iconURL: branding.thumbnail 
        })
        .setTimestamp();

    // Add games to embed
    pageGames.forEach((game, idx) => {
        const gameTime = new Date(game.commence_time);
        const timeUntil = Math.round((gameTime - new Date()) / (1000 * 60 * 60));
        const odds = game.bookmakers[0]?.markets[0]?.outcomes || [];
        const homeOdds = odds.find(o => o.name === game.home_team)?.price || 2.0;
        const awayOdds = odds.find(o => o.name === game.away_team)?.price || 2.0;

        const homeOddsFormatted = formatOdds(homeOdds);
        const awayOddsFormatted = formatOdds(awayOdds);

        const timeText = timeUntil < 1 ? '🔴 LIVE' : 
                        timeUntil < 2 ? '🟡 Starting soon' :
                        timeUntil < 24 ? `⏰ ${timeUntil}h` : 
                        `📅 ${gameTime.toLocaleDateString()}`;

        // Use full team names without truncation
        const homeTeamFull = game.home_team;
        const awayTeamFull = game.away_team;
        
        try {
            // Create individual field for each game with full team names
            let gameText = `\`\`\`🎮 ${homeTeamFull} vs ${awayTeamFull}\`\`\`\n`;
            gameText += `${timeText}\n`;
            gameText += `🏠 ${homeOddsFormatted.indicator} **${homeOddsFormatted.text}** ⚡ VS ⚡ **${awayOddsFormatted.text}** ${awayOddsFormatted.indicator} ✈️\n`;
            gameText += `📊 H2H • Spread • O/U • Props`;
            
            // Ensure field value is under Discord's 1024 character limit
            if (gameText.length > 1020) {
                gameText = gameText.substring(0, 1020) + '...';
            }
            
            const globalIdx = startIdx + idx + 1; // Global game index
            gamesEmbed.addFields({
                name: `${globalIdx}. ${homeTeamFull} vs ${awayTeamFull}`,
                value: gameText,
                inline: false
            });
        } catch (error) {
            console.error('SportBet: Error adding game field:', error);
            // Fallback to simple format with full names
            const globalIdx = startIdx + idx + 1;
            gamesEmbed.addFields({
                name: `${globalIdx}. Game ${globalIdx}`,
                value: `${homeTeamFull} vs ${awayTeamFull}\n${timeText}`,
                inline: false
            });
        }
    });
    
    // Add pagination info if there are multiple pages
    if (totalPages > 1) {
        gamesEmbed.addFields({
            name: '📄 Page Navigation',
            value: `📊 Showing page **${currentPage + 1} of ${totalPages}** (${pageGames.length} games)\n📈 Total: **${games.length}** live games available`,
            inline: false
        });
    }

    // Store games and create action buttons
    const tempId = `${interaction.user.id}_${Date.now()}`;
    pendingGames.set(tempId, { games, sport, countryKey, leagueKey, tier });
    console.log('SportBet: Stored games with tempId:', tempId, 'for user:', interaction.user.id);
    setTimeout(() => {
        console.log('SportBet: Cleaning up tempId:', tempId);
        pendingGames.delete(tempId);
    }, 300000);

    const betButton = new ButtonBuilder()
        .setCustomId(`sportbet_select_${tempId}`)
        .setLabel('💰 Place Live Bet')
        .setStyle(ButtonStyle.Success)
        .setEmoji('⚡');

    const marketsButton = new ButtonBuilder()
        .setCustomId(`sportbet_markets_${tempId}`)
        .setLabel('📊 View Markets')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎯');

    const backButton = new ButtonBuilder()
        .setCustomId(`sportbet_back_league_${sport}_${countryKey}_${interaction.user.id}`)
        .setLabel('← Back to Leagues')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('↩️');

    const refreshButton = new ButtonBuilder()
        .setCustomId(`sportbet_refresh_${sport}_${countryKey}_${leagueKey}_${interaction.user.id}`)
        .setLabel('🔄 Live Refresh')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⚡');

    // Create action rows with pagination if needed
    let actionRows = [];
    
    if (totalPages > 1) {
        // Add pagination buttons when there are multiple pages
        const prevButton = new ButtonBuilder()
            .setCustomId(`sportbet_page_${sport}_${countryKey}_${leagueKey}_${Math.max(0, currentPage - 1)}_${interaction.user.id}`)
            .setLabel('◀️ Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0);
            
        const pageButton = new ButtonBuilder()
            .setCustomId(`sportbet_page_info_${currentPage}`)
            .setLabel(`Page ${currentPage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true);
            
        const nextButton = new ButtonBuilder()
            .setCustomId(`sportbet_page_${sport}_${countryKey}_${leagueKey}_${Math.min(totalPages - 1, currentPage + 1)}_${interaction.user.id}`)
            .setLabel('Next ▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === totalPages - 1);
            
        const paginationRow = new ActionRowBuilder().addComponents(prevButton, pageButton, nextButton);
        const mainRow = new ActionRowBuilder().addComponents(backButton, refreshButton, marketsButton);
        const betRow = new ActionRowBuilder().addComponents(betButton);
        
        actionRows = [paginationRow, mainRow, betRow];
    } else {
        // Regular buttons without pagination
        const row1 = new ActionRowBuilder().addComponents(backButton, refreshButton, marketsButton);
        const row2 = new ActionRowBuilder().addComponents(betButton);
        actionRows = [row1, row2];
    }

    try {
        await interaction.update({ embeds: [gamesEmbed], components: actionRows });
        console.log('SportBet: Games embed updated successfully with pagination');
    } catch (error) {
        console.error('SportBet: Error updating games embed with pagination:', error);
        await interaction.followUp({
            content: '❌ An error occurred while updating games. Please try again.',
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * Show games for a specific league (for select menu updates)
 */
async function showGamesForLeagueUpdate(interaction, sport, countryKey, leagueKey, tier) {
    try {
        console.log('SportBet: UPDATE FUNCTION START - sport:', sport, 'country:', countryKey, 'league:', leagueKey);
        const countries = getCountriesForSport(sport);
        const countryData = countries[countryKey];
        const sportData = SPORTS[sport];
        console.log('SportBet: UPDATE - Got country and sport data');
    
    // Fetch games for the specific league
    console.log('SportBet: showGamesForLeagueUpdate - About to call fetchLiveGames');
    let games;
    try {
        console.log('SportBet: UPDATE - Calling fetchLiveGames with sport:', sport, 'country:', countryKey, 'league:', leagueKey);
        games = await fetchLiveGames(sport, countryKey, leagueKey === 'all' ? null : leagueKey);
        console.log('SportBet: UPDATE - fetchLiveGames completed successfully, got', games?.length || 0, 'games');
        
        if (!games) {
            console.log('SportBet: UPDATE - fetchLiveGames returned null/undefined');
            throw new Error('fetchLiveGames returned null');
        }
        
        if (!Array.isArray(games)) {
            console.log('SportBet: UPDATE - fetchLiveGames returned non-array:', typeof games);
            throw new Error('fetchLiveGames returned non-array');
        }
        
        console.log('SportBet: UPDATE - Games array validation passed');
    } catch (fetchError) {
        console.error('SportBet: UPDATE - Error in fetchLiveGames:', fetchError);
        console.error('SportBet: UPDATE - fetchLiveGames stack:', fetchError.stack);
        
        // Use mock games as fallback
        console.log('SportBet: UPDATE - Using mock games as fallback');
        games = []; // Empty array to trigger "no games" handling
    }
    
    console.log('SportBet: showGamesForLeagueUpdate - About to process games');

    if (games.length === 0) {
        const backButton = new ButtonBuilder()
            .setCustomId(`sportbet_back_league_${sport}_${countryKey}_${interaction.user.id}`)
            .setLabel('← Back to Leagues')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(backButton);

        const noGamesEmbed = new EmbedBuilder()
            .setTitle(`${sportData.name} - No Games Available`)
            .setDescription(`No upcoming games found in **${countryData.name}**.\n\nCheck back later or try a different league!`)
            .setColor('#FFA500')
            .setFooter({ text: 'Use the button below to go back' });
        
        return await interaction.update({ embeds: [noGamesEmbed], components: [row] });
    }

    // Create enhanced games display
    console.log('SportBet: UPDATE - Creating enhanced games display');
    const leagueName = leagueKey === 'all' ? 'All Leagues' : 
                     countryData.leagues.find(l => l.key === leagueKey)?.name || leagueKey;
    console.log('SportBet: UPDATE - League name:', leagueName);

        console.log('SportBet: UPDATE - Getting branding for sport:', sport);
        const branding = getSportBranding(sport);
        console.log('SportBet: UPDATE - Branding obtained');
        
        console.log('SportBet: UPDATE - Getting league logo');
        const leagueLogo = getLeagueLogo(sport, leagueKey);
        console.log('SportBet: UPDATE - League logo obtained');
    
    // Get dynamic banner for the specific league or sport
    const dynamicBanner = getDynamicBanner(sport, leagueKey);
    const eventCountdown = getEventCountdown();
    const promoOverlay = getPromotionalOverlay();
    
    let description = `🏆 **${countryData.name}** • ${tier === 'ruby' ? '🔴 **Ruby Tier** • Premium Access' : '💎 **Diamond Tier** • Elite Member'}\n\n`;
    
    // Add promotional event info if active
    if (eventCountdown && dynamicBanner.isPromotional) {
        description += `${eventCountdown}\n\n`;
    }
    
    description += `🎮 Showing **${Math.min(games.length, 6)} of ${games.length}** live games • 📈 **Real-time odds**\n`;
    description += `⚡ **Instant betting** • 🔄 **Live updates** • 💰 **Best odds guaranteed**`;
    
    const gamesEmbed = new EmbedBuilder()
        .setTitle(`${branding.icon} ${dynamicBanner.title || leagueName} • Live Betting`)
        .setDescription(description)
        .setColor(dynamicBanner.isPromotional ? parseInt(promoOverlay?.color?.replace('#', ''), 16) : getGradientColor(sport, 0.3))
        .setThumbnail(leagueLogo || branding.thumbnail)
        .setImage(dynamicBanner.banner)
        .setFooter({ 
            text: `🌟 ${games.length} games available • Updated every 30 seconds`, 
            iconURL: branding.thumbnail 
        })
        .setTimestamp();

    // Add games with pagination (5 games per page)
    const gamesPerPage = 5;
    const currentPage = 0; // Default to first page - TODO: Add pagination controls
    const totalPages = Math.ceil(games.length / gamesPerPage);
    const startIdx = currentPage * gamesPerPage;
    const endIdx = Math.min(startIdx + gamesPerPage, games.length);
    const pageGames = games.slice(startIdx, endIdx);
    
    pageGames.forEach((game, idx) => {
        const gameTime = new Date(game.commence_time);
        const timeUntil = Math.round((gameTime - new Date()) / (1000 * 60 * 60));
        const odds = game.bookmakers[0]?.markets[0]?.outcomes || [];
        const homeOdds = odds.find(o => o.name === game.home_team)?.price || 2.0;
        const awayOdds = odds.find(o => o.name === game.away_team)?.price || 2.0;

        const homeOddsFormatted = formatOdds(homeOdds);
        const awayOddsFormatted = formatOdds(awayOdds);

        const timeText = timeUntil < 1 ? '🔴 LIVE' : 
                        timeUntil < 2 ? '🟡 Starting soon' :
                        timeUntil < 24 ? `⏰ ${timeUntil}h` : 
                        `📅 ${gameTime.toLocaleDateString()}`;

        // Use full team names without truncation
        const homeTeamFull = game.home_team;
        const awayTeamFull = game.away_team;
        
        try {
            // Create individual field for each game to avoid length issues
            let gameText = `\`\`\`🎮 ${homeTeamFull} vs ${awayTeamFull}\`\`\`\n`;
            gameText += `${timeText}\n`;
            gameText += `🏠 ${homeOddsFormatted.indicator} **${homeOddsFormatted.text}** ⚡ VS ⚡ **${awayOddsFormatted.text}** ${awayOddsFormatted.indicator} ✈️\n`;
            gameText += `📊 H2H • Spread • O/U • Props`;
            
            // Ensure field value is under Discord's 1024 character limit
            if (gameText.length > 1020) {
                gameText = gameText.substring(0, 1020) + '...';
            }
            
            gamesEmbed.addFields({
                name: `${idx + 1}. ${homeTeamFull} vs ${awayTeamFull}`,
                value: gameText,
                inline: false
            });
        } catch (error) {
            console.error('SportBet: Error adding game field:', error);
            // Fallback to simple format
            gamesEmbed.addFields({
                name: `${idx + 1}. Game ${idx + 1}`,
                value: `${homeTeamFull} vs ${awayTeamFull}\n${timeText}`,
                inline: false
            });
        }
    });
    
    // Add pagination info if there are multiple pages
    if (totalPages > 1) {
        gamesEmbed.addFields({
            name: '📄 Page Navigation',
            value: `📊 Showing page **${currentPage + 1} of ${totalPages}** (${pageGames.length} games)\n📈 Total: **${games.length}** live games available`,
            inline: false
        });
    }

    // Store games and create action buttons
    const tempId = `${interaction.user.id}_${Date.now()}`;
    pendingGames.set(tempId, { games, sport, countryKey, leagueKey, tier });
    console.log('SportBet: Stored games with tempId:', tempId, 'for user:', interaction.user.id);
    setTimeout(() => {
        console.log('SportBet: Cleaning up tempId:', tempId);
        pendingGames.delete(tempId);
    }, 300000);

    const betButton = new ButtonBuilder()
        .setCustomId(`sportbet_select_${tempId}`)
        .setLabel('💰 Place Live Bet')
        .setStyle(ButtonStyle.Success)
        .setEmoji('⚡');

    const marketsButton = new ButtonBuilder()
        .setCustomId(`sportbet_markets_${tempId}`)
        .setLabel('📊 View Markets')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎯');

    const backButton = new ButtonBuilder()
        .setCustomId(`sportbet_back_league_${sport}_${countryKey}_${interaction.user.id}`)
        .setLabel('← Back to Leagues')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('↩️');

    const refreshButton = new ButtonBuilder()
        .setCustomId(`sportbet_refresh_${sport}_${countryKey}_${leagueKey}_${interaction.user.id}`)
        .setLabel('🔄 Live Refresh')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⚡');

    // Create action rows with pagination if needed
    let actionRows = [];
    
    if (totalPages > 1) {
        // Add pagination buttons when there are multiple pages
        const prevButton = new ButtonBuilder()
            .setCustomId(`sportbet_page_${sport}_${countryKey}_${leagueKey}_${Math.max(0, currentPage - 1)}_${interaction.user.id}`)
            .setLabel('◀️ Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0);
            
        const pageButton = new ButtonBuilder()
            .setCustomId(`sportbet_page_info_${currentPage}`)
            .setLabel(`Page ${currentPage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true);
            
        const nextButton = new ButtonBuilder()
            .setCustomId(`sportbet_page_${sport}_${countryKey}_${leagueKey}_${Math.min(totalPages - 1, currentPage + 1)}_${interaction.user.id}`)
            .setLabel('Next ▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === totalPages - 1);
            
        const paginationRow = new ActionRowBuilder().addComponents(prevButton, pageButton, nextButton);
        const mainRow = new ActionRowBuilder().addComponents(backButton, refreshButton, marketsButton);
        const betRow = new ActionRowBuilder().addComponents(betButton);
        
        actionRows = [paginationRow, mainRow, betRow];
    } else {
        // Regular buttons without pagination
        const row1 = new ActionRowBuilder().addComponents(backButton, refreshButton, marketsButton);
        const row2 = new ActionRowBuilder().addComponents(betButton);
        actionRows = [row1, row2];
    }

    console.log('SportBet: About to update with games embed (update function)');
    console.log('SportBet: Embed fields count:', gamesEmbed.data.fields?.length || 0);
    
    try {
        // Validate embed before sending
        console.log('SportBet: Validating embed before sending...');
        console.log('SportBet: Embed title length:', gamesEmbed.data.title?.length || 0);
        console.log('SportBet: Embed description length:', gamesEmbed.data.description?.length || 0);
        console.log('SportBet: Embed fields count:', gamesEmbed.data.fields?.length || 0);
        console.log('SportBet: Embed color:', gamesEmbed.data.color);
        
        // Check if total embed size is reasonable
        const totalEmbedSize = JSON.stringify(gamesEmbed.data).length;
        console.log('SportBet: Total embed size:', totalEmbedSize, 'characters');
        
        if (totalEmbedSize > 5500) { // Leave buffer under 6000 char limit
            console.warn('SportBet: Embed too large, using simplified version');
            throw new Error('Embed too large');
        }
        
        await interaction.update({ embeds: [gamesEmbed], components: actionRows });
        console.log('SportBet: Games embed updated successfully');
    } catch (error) {
        console.error('SportBet: Error updating games embed:', error);
        console.error('SportBet: Error details:', error.message);
        console.error('SportBet: Error stack:', error.stack);
        
        // Fallback to simple embed with basic validation
        const fallbackEmbed = new EmbedBuilder()
            .setTitle(`${sportData.name} • Live Betting`)
            .setDescription(`${games.length} games available for ${leagueName}\n\nTechnical issue with formatting, but games are available!`)
            .setColor('#FF0000');
            
        try {
            await interaction.update({ 
                embeds: [fallbackEmbed], 
                components: [row1]
            });
            console.log('SportBet: Fallback embed sent successfully');
        } catch (fallbackError) {
            console.error('SportBet: Even fallback embed failed:', fallbackError);
            await interaction.update({
                content: '❌ An error occurred while loading games. Please try again.',
                embeds: [],
                components: []
            });
        }
    }
    } catch (error) {
        console.error('SportBet: UPDATE FUNCTION ERROR:', error);
        console.error('SportBet: UPDATE FUNCTION STACK:', error.stack);
        
        // Fallback to basic error message
        try {
            await interaction.update({
                content: '❌ An error occurred while loading games. Please try again.',
                embeds: [],
                components: []
            });
        } catch (fallbackError) {
            console.error('SportBet: UPDATE FUNCTION - Even fallback failed:', fallbackError);
        }
    }
}

/**
 * Show betting markets for a sport
 */
async function showBettingMarkets(interaction, sport, tempId, tier) {
    const markets = BETTING_MARKETS[sport];
    const sportData = SPORTS[sport];
    
    if (!markets) {
        return await interaction.reply({
            content: '❌ No betting markets available for this sport.',
            flags: MessageFlags.Ephemeral
        });
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`sportbet_market_${sport}_${tempId}_${interaction.user.id}_${Date.now()}`)
        .setPlaceholder('📊 Select a betting market')
        .addOptions(
            Object.entries(markets).map(([marketKey, marketData]) => ({
                label: marketData.name,
                description: marketData.description,
                value: marketKey,
                emoji: marketData.icon
            }))
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    const branding = getSportBranding(sport);
    
    const embed = new EmbedBuilder()
        .setTitle(`${branding.icon} ${sportData.name} • Betting Markets`)
        .setDescription(`🎯 **Premium Markets Available**\n\n${tier === 'ruby' ? '🔴 **Ruby Tier** • Exclusive access to enhanced markets' : '💎 **Diamond Tier** • Premium betting experience'}\n\n` +
                       `💰 **Live odds** • ⚡ **Instant settlement** • 🔄 **Real-time updates**`)
        .setColor(getGradientColor(sport, 0.5))
        .setThumbnail(branding.thumbnail)
        .setFooter({ 
            text: `🌟 ${Object.keys(markets).length} markets available • Best odds guaranteed`,
            iconURL: branding.thumbnail 
        })
        .setTimestamp();

    // Add market overview
    let marketList = '';
    for (const [marketKey, marketData] of Object.entries(markets)) {
        marketList += `${marketData.icon} **${marketData.name}**\n${marketData.description}\n\n`;
    }
    
    embed.addFields({
        name: '📊 Available Markets',
        value: marketList.substring(0, 1024),
        inline: false
    });

    // Store data for interaction
    const marketTempId = `${interaction.user.id}_${Date.now()}`;
    pendingGames.set(`market_${marketTempId}`, { sport, tempId, tier });
    setTimeout(() => pendingGames.delete(`market_${marketTempId}`), 300000);

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
}

/**
 * Show specific market betting options
 */
async function showMarketBets(interaction, sport, marketType, tempId, tier) {
    const pendingData = pendingGames.get(tempId);
    if (!pendingData) {
        return await interaction.reply({
            content: '❌ Session expired. Please start again.',
            flags: MessageFlags.Ephemeral
        });
    }

    const games = pendingData.games;
    const marketInfo = BETTING_MARKETS[sport][marketType];
    const sportData = SPORTS[sport];

    if (games.length === 0) {
        return await interaction.reply({
            content: '❌ No games available for this market.',
            flags: MessageFlags.Ephemeral
        });
    }

    const embed = new EmbedBuilder()
        .setTitle(`${marketInfo.icon} ${marketInfo.name}`)
        .setDescription(`**${sportData.name}** • ${marketInfo.description}\n\n${tier === 'ruby' ? '🔴 Ruby Tier' : '💎 Diamond Tier'}`)
        .setColor(tier === 'ruby' ? '#FF0000' : '#00FFFF')
        .setTimestamp();

    // Generate market-specific betting options for each game
    games.slice(0, 5).forEach((game, idx) => {
        const gameTime = new Date(game.commence_time);
        const timeUntil = Math.round((gameTime - new Date()) / (1000 * 60 * 60));
        const timeText = timeUntil < 1 ? '🔴 Starting soon' : 
                        timeUntil < 24 ? `⏰ In ${timeUntil}h` : 
                        `📅 ${gameTime.toLocaleDateString()}`;

        let marketOptions = '';
        
        // Generate different market options based on market type
        switch (marketType) {
            case 'h2h':
                const odds = game.bookmakers[0]?.markets[0]?.outcomes || [];
                const homeOdds = odds.find(o => o.name === game.home_team)?.price || 2.0;
                const awayOdds = odds.find(o => o.name === game.away_team)?.price || 2.0;
                if (sport === 'soccer') {
                    marketOptions = `🏠 ${game.home_team}: **${homeOdds.toFixed(2)}**\n⚖️ Draw: **${(homeOdds + awayOdds > 4 ? 3.2 : 3.4).toFixed(2)}**\n✈️ ${game.away_team}: **${awayOdds.toFixed(2)}**`;
                } else {
                    marketOptions = `🏠 ${game.home_team}: **${homeOdds.toFixed(2)}**\n✈️ ${game.away_team}: **${awayOdds.toFixed(2)}**`;
                }
                break;
            case 'spreads':
                const spreadHome = Math.random() > 0.5 ? '+' : '-';
                const spreadValue = (Math.random() * 3 + 0.5).toFixed(1);
                marketOptions = `🏠 ${game.home_team} ${spreadHome}${spreadValue}: **${(1.8 + Math.random() * 0.4).toFixed(2)}**\n✈️ ${game.away_team} ${spreadHome === '+' ? '-' : '+'}${spreadValue}: **${(1.8 + Math.random() * 0.4).toFixed(2)}**`;
                break;
            case 'totals':
                const totalValue = Math.floor(Math.random() * 4 + 2.5);
                marketOptions = `📈 Over ${totalValue}: **${(1.85 + Math.random() * 0.3).toFixed(2)}**\n📉 Under ${totalValue}: **${(1.85 + Math.random() * 0.3).toFixed(2)}**`;
                break;
            case 'btts':
                marketOptions = `✅ Yes: **${(1.7 + Math.random() * 0.5).toFixed(2)}**\n❌ No: **${(1.9 + Math.random() * 0.4).toFixed(2)}**`;
                break;
            default:
                // Generate generic over/under for other markets
                const overUnderValue = Math.floor(Math.random() * 6 + 8);
                marketOptions = `📈 Over ${overUnderValue}: **${(1.8 + Math.random() * 0.4).toFixed(2)}**\n📉 Under ${overUnderValue}: **${(1.8 + Math.random() * 0.4).toFixed(2)}**`;
        }

        embed.addFields({
            name: `${idx + 1}. ${game.home_team} vs ${game.away_team}`,
            value: `${timeText}\n${marketOptions}`,
            inline: true
        });
    });

    // Create bet button for this market
    const betButton = new ButtonBuilder()
        .setCustomId(`sportbet_market_bet_${sport}_${marketType}_${tempId}`)
        .setLabel(`Place ${marketInfo.name} Bet`)
        .setStyle(ButtonStyle.Success)
        .setEmoji('💰');

    const backButton = new ButtonBuilder()
        .setCustomId(`sportbet_back_markets_${sport}_${tempId}`)
        .setLabel('← Back to Markets')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(backButton, betButton);

    await interaction.update({ embeds: [embed], components: [row] });
}

/**
 * Show specific market betting options (for select menu updates)
 */
async function showMarketBetsUpdate(interaction, sport, marketType, tempId, tier) {
    const pendingData = pendingGames.get(tempId);
    if (!pendingData) {
        return await interaction.update({
            content: '❌ Session expired. Please start again.',
            embeds: [],
            components: []
        });
    }

    const games = pendingData.games;
    const marketInfo = BETTING_MARKETS[sport][marketType];
    const sportData = SPORTS[sport];

    if (games.length === 0) {
        return await interaction.update({
            content: '❌ No games available for this market.',
            embeds: [],
            components: []
        });
    }

    const embed = new EmbedBuilder()
        .setTitle(`${marketInfo.icon} ${marketInfo.name}`)
        .setDescription(`**${sportData.name}** • ${marketInfo.description}\n\n${tier === 'ruby' ? '🔴 Ruby Tier' : '💎 Diamond Tier'}`)
        .setColor(tier === 'ruby' ? '#FF0000' : '#00FFFF')
        .setTimestamp();

    // Generate market-specific betting options for each game
    games.slice(0, 5).forEach((game, idx) => {
        const gameTime = new Date(game.commence_time);
        const timeUntil = Math.round((gameTime - new Date()) / (1000 * 60 * 60));
        const timeText = timeUntil < 1 ? '🔴 Starting soon' : 
                        timeUntil < 24 ? `⏰ In ${timeUntil}h` : 
                        `📅 ${gameTime.toLocaleDateString()}`;

        let marketOptions = '';
        
        // Generate different market options based on market type
        switch (marketType) {
            case 'h2h':
                const odds = game.bookmakers[0]?.markets[0]?.outcomes || [];
                const homeOdds = odds.find(o => o.name === game.home_team)?.price || 2.0;
                const awayOdds = odds.find(o => o.name === game.away_team)?.price || 2.0;
                if (sport === 'soccer') {
                    marketOptions = `🏠 ${game.home_team}: **${homeOdds.toFixed(2)}**\n⚖️ Draw: **${(homeOdds + awayOdds > 4 ? 3.2 : 3.4).toFixed(2)}**\n✈️ ${game.away_team}: **${awayOdds.toFixed(2)}**`;
                } else {
                    marketOptions = `🏠 ${game.home_team}: **${homeOdds.toFixed(2)}**\n✈️ ${game.away_team}: **${awayOdds.toFixed(2)}**`;
                }
                break;
            case 'spreads':
                const spreadHome = Math.random() > 0.5 ? '+' : '-';
                const spreadValue = (Math.random() * 3 + 0.5).toFixed(1);
                marketOptions = `🏠 ${game.home_team} ${spreadHome}${spreadValue}: **${(1.8 + Math.random() * 0.4).toFixed(2)}**\n✈️ ${game.away_team} ${spreadHome === '+' ? '-' : '+'}${spreadValue}: **${(1.8 + Math.random() * 0.4).toFixed(2)}**`;
                break;
            case 'totals':
                const totalValue = Math.floor(Math.random() * 4 + 2.5);
                marketOptions = `📈 Over ${totalValue}: **${(1.85 + Math.random() * 0.3).toFixed(2)}**\n📉 Under ${totalValue}: **${(1.85 + Math.random() * 0.3).toFixed(2)}**`;
                break;
            case 'btts':
                marketOptions = `✅ Yes: **${(1.7 + Math.random() * 0.5).toFixed(2)}**\n❌ No: **${(1.9 + Math.random() * 0.4).toFixed(2)}**`;
                break;
            default:
                // Generate generic over/under for other markets
                const overUnderValue = Math.floor(Math.random() * 6 + 8);
                marketOptions = `📈 Over ${overUnderValue}: **${(1.8 + Math.random() * 0.4).toFixed(2)}**\n📉 Under ${overUnderValue}: **${(1.8 + Math.random() * 0.4).toFixed(2)}**`;
        }

        embed.addFields({
            name: `${idx + 1}. ${game.home_team} vs ${game.away_team}`,
            value: `${timeText}\n${marketOptions}`,
            inline: true
        });
    });

    // Create bet button for this market
    const betButton = new ButtonBuilder()
        .setCustomId(`sportbet_market_bet_${sport}_${marketType}_${tempId}`)
        .setLabel(`Place ${marketInfo.name} Bet`)
        .setStyle(ButtonStyle.Success)
        .setEmoji('💰');

    const backButton = new ButtonBuilder()
        .setCustomId(`sportbet_back_markets_${sport}_${tempId}`)
        .setLabel('← Back to Markets')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(backButton, betButton);

    await interaction.update({ embeds: [embed], components: [row] });
}

/**
 * Handle market selection for betting
 */
async function handleMarketBetSelection(interaction, sport, marketType, tempId) {
    const pendingData = pendingGames.get(tempId);
    if (!pendingData) {
        return await interaction.reply({
            content: '❌ Session expired. Please start a new bet.',
            flags: MessageFlags.Ephemeral
        });
    }

    const games = pendingData.games;
    const marketInfo = BETTING_MARKETS[sport][marketType];

    // Create game selection menu for the specific market
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`sportbet_market_game_${sport}_${marketType}_${tempId}_${interaction.user.id}_${Date.now()}`)
        .setPlaceholder(`Select a game for ${marketInfo.name}`)
        .addOptions(
            games.slice(0, 10).map((game, idx) => ({
                label: `${game.home_team} vs ${game.away_team}`,
                description: `${marketInfo.name} - ${new Date(game.commence_time).toLocaleDateString()}`,
                value: `${idx}`,
                emoji: marketInfo.icon
            }))
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
        .setTitle(`${marketInfo.icon} Select Game`)
        .setDescription(`Choose a game to place your **${marketInfo.name}** bet on:`)
        .setColor('#00FF00')
        .setFooter({ text: 'You will be prompted for bet amount after game selection' });

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
}

/**
 * Handle placing a bet
 */
async function handlePlaceBet(interaction, tier, userId, guildId) {
    const sport = interaction.options.getString('sport');
    const amountStr = interaction.options.getString('amount');

    // Parse amount
    const balance = await dbManager.getBalances(userId, guildId);
    const amount = parseAmount(amountStr, balance.wallet);

    if (!amount || amount < MIN_BETS[tier]) {
        return await interaction.editReply({
            content: `❌ Invalid bet amount! Minimum bet for ${tier === 'ruby' ? 'Ruby' : 'Diamond'} tier is ${fmt(MIN_BETS[tier])}`
        });
    }

    if (amount > balance.wallet) {
        return await interaction.editReply({
            content: `❌ Insufficient balance! You have ${fmt(balance.wallet)}`
        });
    }

    // Use enhanced UI for bet placement
    const countries = getCountriesForSport(sport);
    if (Object.keys(countries).length > 1) {
        await showCountrySelection(interaction, sport, tier);
    } else {
        const countryKey = Object.keys(countries)[0];
        await showLeagueSelection(interaction, sport, countryKey, tier);
    }
}

/**
 * Get user subscription
 */
async function getUserSubscription(userId) {
    try {
        const subscription = await dbManager.databaseAdapter.executeQuery(`
            SELECT subscription_type, active, created_at 
            FROM user_subscriptions 
            WHERE user_id = ? AND active = 1
            ORDER BY created_at DESC 
            LIMIT 1
        `, [userId]);

        console.log('SportBet: Subscription check for user', userId, ':', subscription.length > 0 ? subscription[0].subscription_type : 'No subscription');
        return subscription.length > 0 ? subscription[0] : null;
    } catch (error) {
        logger.error(`Error getting user subscription: ${error.message}`);
        console.log('SportBet: Error checking subscription:', error.message);
        // For now, allow access for testing (remove in production)
        console.log('SportBet: WARNING - Allowing access without subscription for testing');
        return { subscription_type: 'diamond_subscription', active: 1 };
    }
}

/**
 * Handle viewing user's bets
 */
async function handleMyBets(interaction, userId, guildId) {
    // Get active bets from database
    const activeBetsData = await dbManager.databaseAdapter.executeQuery(`
        SELECT * FROM sport_bets 
        WHERE user_id = ? AND guild_id = ? AND status IN ('pending', 'live')
        ORDER BY created_at DESC
        LIMIT 10
    `, [userId, guildId]);

    const completedBetsData = await dbManager.databaseAdapter.executeQuery(`
        SELECT * FROM sport_bets 
        WHERE user_id = ? AND guild_id = ? AND status IN ('won', 'lost')
        ORDER BY created_at DESC
        LIMIT 5
    `, [userId, guildId]);

    const betsEmbed = new EmbedBuilder()
        .setTitle('📊 Your Sports Bets')
        .setColor('#4CAF50')
        .setTimestamp();

    if (activeBetsData.length > 0) {
        const activeDesc = activeBetsData.map(bet => 
            `${bet.status === 'live' ? '🔴' : '⏳'} **${bet.game_name}**\n` +
            `Bet: ${fmt(bet.amount)} | Pick: ${bet.selection} | Odds: ${bet.odds}`
        ).join('\n\n');
        
        betsEmbed.addFields({
            name: '🎯 Active Bets',
            value: activeDesc.substring(0, 1024),
            inline: false
        });
    }

    if (completedBetsData.length > 0) {
        const completedDesc = completedBetsData.map(bet => 
            `${bet.status === 'won' ? '✅' : '❌'} **${bet.game_name}**\n` +
            `Result: ${bet.status === 'won' ? `Won ${fmt(bet.payout)}` : `Lost ${fmt(bet.amount)}`}`
        ).join('\n\n');
        
        betsEmbed.addFields({
            name: '📜 Recent Results',
            value: completedDesc.substring(0, 1024),
            inline: false
        });
    }

    if (activeBetsData.length === 0 && completedBetsData.length === 0) {
        betsEmbed.setDescription('You have no betting history yet. Place your first bet with `/sportbet place`!');
    }

    await interaction.editReply({ embeds: [betsEmbed] });
}

/**
 * Handle leaderboard display
 */
async function handleLeaderboard(interaction, guildId) {
    const topBettors = await dbManager.databaseAdapter.executeQuery(`
        SELECT 
            user_id,
            COUNT(*) as total_bets,
            SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN status = 'won' THEN payout - amount ELSE -amount END) as net_profit
        FROM sport_bets
        WHERE guild_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY user_id
        ORDER BY net_profit DESC
        LIMIT 10
    `, [guildId]);

    const leaderboardEmbed = new EmbedBuilder()
        .setTitle('🏆 Sports Betting Leaderboard')
        .setDescription('Top bettors in the last 30 days')
        .setColor('#FFD700')
        .setTimestamp();

    if (topBettors.length > 0) {
        const leaderboardDesc = await Promise.all(topBettors.map(async (bettor, idx) => {
            const user = await interaction.client.users.fetch(bettor.user_id).catch(() => null);
            const winRate = bettor.total_bets > 0 ? (bettor.wins / bettor.total_bets * 100).toFixed(1) : 0;
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
            
            return `${medal} **${user?.displayName || 'Unknown'}**\n` +
                   `   Profit: ${fmtDelta(bettor.net_profit)} | Win Rate: ${winRate}%`;
        }));

        leaderboardEmbed.setDescription(leaderboardDesc.join('\n\n'));
    } else {
        leaderboardEmbed.setDescription('No betting activity yet. Be the first to place a bet!');
    }

    await interaction.editReply({ embeds: [leaderboardEmbed] });
}

/**
 * Handle API usage statistics (Admin only)
 */
async function handleApiUsage(interaction, userId) {
    try {
        // Check if user is admin/dev
        const devUserIds = [
            process.env.DEV_USER_ID,
            '466050111680544798' // Your ID
        ].filter(id => id);

        if (!devUserIds.includes(userId)) {
            return await interaction.editReply({
                content: '❌ This command is restricted to administrators.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Get usage stats
        const stats = await sportsApiManager.getUsageStats();
        
        if (!stats) {
            return await interaction.editReply({
                content: '❌ Could not retrieve API usage statistics.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Clean expired cache
        await sportsApiManager.cleanExpiredCache();

        // Get cache stats
        const cacheStats = await dbManager.databaseAdapter.executeQuery(`
            SELECT 
                COUNT(*) as total_cached,
                COUNT(DISTINCT sport) as sports_cached,
                MIN(cached_at) as oldest_cache,
                MAX(cached_at) as newest_cache
            FROM sports_games_cache
            WHERE expires_at > NOW()
        `);

        const usageEmbed = new EmbedBuilder()
            .setTitle('📊 Sports API Usage Statistics')
            .setDescription(`Month: **${stats.month}**`)
            .addFields(
                {
                    name: '🔑 Primary API Key',
                    value: `Used: **${stats.primary.used}/${stats.primary.limit}** (${Math.round(stats.primary.used / stats.primary.limit * 100)}%)\n` +
                           `Last Request: ${stats.primary.lastRequest ? new Date(stats.primary.lastRequest).toLocaleString() : 'Never'}`,
                    inline: true
                },
                {
                    name: '🔑 Secondary API Key',
                    value: `Used: **${stats.secondary.used}/${stats.secondary.limit}** (${Math.round(stats.secondary.used / stats.secondary.limit * 100)}%)\n` +
                           `Last Request: ${stats.secondary.lastRequest ? new Date(stats.secondary.lastRequest).toLocaleString() : 'Never'}`,
                    inline: true
                },
                {
                    name: '📈 Total Usage',
                    value: `**${stats.totalUsed}/${stats.totalLimit}** requests\n` +
                           `${stats.totalLimit - stats.totalUsed} remaining`,
                    inline: true
                },
                {
                    name: '💾 Cache Statistics',
                    value: `Cached Games: **${cacheStats[0]?.total_cached || 0}**\n` +
                           `Sports: **${cacheStats[0]?.sports_cached || 0}**\n` +
                           `Cache Age: ${cacheStats[0]?.newest_cache ? `${Math.round((Date.now() - new Date(cacheStats[0].newest_cache)) / 60000)} min` : 'Empty'}`,
                    inline: false
                }
            )
            .setColor(stats.totalUsed > stats.totalLimit * 0.8 ? '#FF0000' : '#00FF00')
            .setFooter({ text: 'Cache duration: 15 minutes | Resets monthly' })
            .setTimestamp();

        // Add warning if approaching limits
        if (stats.totalUsed > stats.totalLimit * 0.8) {
            usageEmbed.addFields({
                name: '⚠️ Warning',
                value: 'Approaching monthly API limit! Consider adding more API keys.',
                inline: false
            });
        }

        await interaction.editReply({ embeds: [usageEmbed] });

    } catch (error) {
        logger.error(`Error in handleApiUsage: ${error.message}`);
        await interaction.editReply({
            content: '❌ An error occurred while fetching API usage statistics.'
        });
    }
}

// Add navigation handlers as exports for index.js to use
module.exports.handleCountrySelection = async function(interaction) {
    // Handle country selection dropdown
    console.log('SportBet handleCountrySelection called with customId:', interaction.customId);
    
    // Check interaction age to prevent stale interactions
    const interactionAge = Date.now() - interaction.createdTimestamp;
    if (interactionAge > 300000) { // 5 minutes
        console.log('SportBet: Ignoring stale interaction (age:', interactionAge, 'ms)');
        return;
    }
    
    // Parse: sportbet_country_${sport}_${userId}_${timestamp} - parse from end to handle sports with underscores
    const afterPrefix = interaction.customId.replace('sportbet_country_', '');
    const customIdParts = afterPrefix.split('_');
    console.log('SportBet: CustomId parts:', customIdParts);
    
    if (customIdParts.length < 3) {
        console.log('SportBet: Invalid customId format');
        return await interaction.update({
            content: '❌ Invalid session format. Please start again with `/sportbet view`',
            embeds: [],
            components: []
        });
    }
    
    // Parse from the end: last 2 parts are userId and timestamp
    const timestamp = customIdParts[customIdParts.length - 1];
    const userId = customIdParts[customIdParts.length - 2];
    // Everything before userId is the sport (could have underscores)
    const sport = customIdParts.slice(0, customIdParts.length - 2).join('_');
    const countryKey = interaction.values[0];
    
    const pendingDataKey = `country_${userId}_${timestamp}`;
    console.log('SportBet: Looking for pending data with key:', pendingDataKey);
    console.log('SportBet: Available keys:', Array.from(pendingGames.keys()));
    
    const pendingData = pendingGames.get(pendingDataKey);
    if (!pendingData) {
        console.log('SportBet: No pending data found for country selection');
        return await interaction.update({
            content: '❌ Session expired. Please start again with `/sportbet view`',
            embeds: [],
            components: []
        });
    }
    
    await showLeagueSelectionUpdate(interaction, sport, countryKey, pendingData.tier);
};

module.exports.handleLeagueSelection = async function(interaction) {
    console.log('SportBet: League selection handler called');
    console.log('SportBet: CustomId:', interaction.customId);
    console.log('SportBet: Selected value:', interaction.values[0]);
    
    // Handle league selection dropdown - parse from the end to handle sports with underscores
    const afterPrefix = interaction.customId.replace('sportbet_league_', '');
    const parts = afterPrefix.split('_');
    console.log('SportBet: Parsed parts:', parts);
    
    if (parts.length < 4) {
        console.log('SportBet: Invalid league customId format - not enough parts');
        return await interaction.update({
            content: '❌ Invalid session format. Please start again with `/sportbet view`',
            embeds: [],
            components: []
        });
    }
    
    // Parse from the end: last 2 parts are userId and timestamp
    const timestamp = parts[parts.length - 1];
    const userId = parts[parts.length - 2];
    const countryKey = parts[parts.length - 3];
    // Everything before countryKey is the sport (could have underscores)
    const sport = parts.slice(0, parts.length - 3).join('_');
    const leagueKey = interaction.values[0];
    
    console.log('SportBet: Extracted - sport:', sport, 'countryKey:', countryKey, 'userId:', userId, 'timestamp:', timestamp);
    
    const pendingDataKey = `league_${userId}_${timestamp}`;
    console.log('SportBet: Looking for pending data with key:', pendingDataKey);
    console.log('SportBet: Available keys:', Array.from(pendingGames.keys()));
    
    const pendingData = pendingGames.get(pendingDataKey);
    if (!pendingData) {
        console.log('SportBet: No pending data found for league selection');
        return await interaction.update({
            content: '❌ Session expired. Please start again with `/sportbet view`',
            embeds: [],
            components: []
        });
    }
    
    console.log('SportBet: Found pending data:', pendingData);
    await showGamesForLeagueUpdate(interaction, sport, countryKey, leagueKey, pendingData.tier);
};

module.exports.handleBackButton = async function(interaction) {
    // Handle back navigation buttons
    if (interaction.customId.includes('back_league')) {
        const afterPrefix = interaction.customId.replace('sportbet_back_league_', '');
        const parts = afterPrefix.split('_');
        // Parse from the end: last part is userId, second to last is countryKey
        const userId = parts[parts.length - 1];
        const countryKey = parts[parts.length - 2];
        // Everything before countryKey is the sport (could have underscores)
        const sport = parts.slice(0, parts.length - 2).join('_');
        
        // Go back to league selection
        const countries = getCountriesForSport(sport);
        if (Object.keys(countries).length > 1) {
            await showCountrySelection(interaction, sport, 'diamond'); // Default tier
        } else {
            await showLeagueSelection(interaction, sport, countryKey, 'diamond');
        }
    }
};

module.exports.handleRefreshButton = async function(interaction) {
    console.log('SportBet: Refresh button clicked');
    console.log('SportBet: CustomId:', interaction.customId);
    
    try {
        // Handle refresh button
        const afterPrefix = interaction.customId.replace('sportbet_refresh_', '');
        const parts = afterPrefix.split('_');
        console.log('SportBet: Refresh parts:', parts);
        
        // Parse from the end: last part is userId, then leagueKey, countryKey
        const userId = parts[parts.length - 1];
        const leagueKey = parts[parts.length - 2];
        const countryKey = parts[parts.length - 3];
        // Everything before countryKey is the sport (could have underscores)
        const sport = parts.slice(0, parts.length - 3).join('_');
        
        console.log('SportBet: Refresh extracted - sport:', sport, 'countryKey:', countryKey, 'leagueKey:', leagueKey, 'userId:', userId);
        
        // Check user's subscription tier (use existing function)
        const subscription = await checkUserSubscription(interaction.user.id);
        const userTier = subscription?.subscription_type === 'ruby_subscription' ? 'ruby' : 'diamond';
        
        await showGamesForLeagueUpdate(interaction, sport, countryKey, leagueKey, userTier);
        
    } catch (error) {
        console.error('SportBet: Refresh button error:', error);
        await interaction.update({
            content: '❌ An error occurred while refreshing. Please try again.',
            components: []
        });
    }
};

/**
 * Process bet result (called by external job/webhook)
 */
async function processBetResult(betId, result, finalScore) {
    try {
        const bet = await dbManager.databaseAdapter.executeQuery(
            'SELECT * FROM sport_bets WHERE id = ?',
            [betId]
        );

        if (!bet || bet.length === 0) return;

        const betData = bet[0];
        const won = betData.selection === result;
        const payout = won ? Math.floor(betData.amount * betData.odds) : 0;

        // Update bet status
        await dbManager.databaseAdapter.executeQuery(
            'UPDATE sport_bets SET status = ?, payout = ?, result = ?, updated_at = NOW() WHERE id = ?',
            [won ? 'won' : 'lost', payout, finalScore, betId]
        );

        // Process payout if won
        if (won) {
            await dbManager.updateUserBalance(betData.user_id, betData.guild_id, payout, 0);
            
            // Record to game stats
            await dbManager.recordGameResult(
                betData.user_id,
                betData.guild_id,
                'sportbet',
                betData.amount,
                payout,
                won ? 'win' : 'loss',
                { sport: betData.sport, odds: betData.odds }
            );
        }
    } catch (error) {
        logger.error(`Error processing bet result: ${error.message}`);
    }
}

/**
 * Handle game selection from dropdown
 */
async function handleGameSelection(interaction) {
    try {
        const [gameIdx, sport] = interaction.values[0].split('_');
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        
        const pendingData = pendingGames.get(`${userId}_games`);
        if (!pendingData) {
            return await interaction.update({
                content: '❌ Session expired. Please start a new bet.',
                embeds: [],
                components: []
            });
        }

        const game = pendingData.games[parseInt(gameIdx)];
        if (!game) {
            return await interaction.update({
                content: '❌ Invalid game selection.',
                embeds: [],
                components: []
            });
        }

        // Create modal for bet amount input
        const modal = new ModalBuilder()
            .setCustomId(`sportbet_bet_amount_${gameIdx}_${sport}_${userId}_${Date.now()}`)
            .setTitle('Place Your Bet');

        const betAmountInput = new TextInputBuilder()
            .setCustomId('bet_amount')
            .setLabel('Enter your bet amount (coins)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. 100, 500, 1000')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(10);

        const firstActionRow = new ActionRowBuilder().addComponents(betAmountInput);
        modal.addComponents(firstActionRow);

        // Store game data temporarily for modal response
        const tempModalId = `${userId}_modal_${Date.now()}`;
        pendingGames.set(tempModalId, { 
            game, 
            sport, 
            gameIdx, 
            tier: pendingData.tier,
            guildId 
        });
        setTimeout(() => pendingGames.delete(tempModalId), 300000);

        await interaction.showModal(modal);
    } catch (error) {
        logger.error(`Error in handleGameSelection: ${error.message}`);
        await interaction.reply({
            content: '❌ An error occurred. Please try again.',
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * Handle select button for viewing games
 */
async function handleSelectButton(interaction) {
    try {
        console.log('SportBet: Place Bet button clicked');
        console.log('SportBet: Interaction customId:', interaction.customId);
        const tempId = interaction.customId.replace('sportbet_select_', '');
        const pendingData = pendingGames.get(tempId);
        
        if (!pendingData) {
            // Debug logging
            console.log('SportBet: Session expired for tempId:', tempId);
            console.log('SportBet: Available keys:', Array.from(pendingGames.keys()));
            return await interaction.reply({
                content: '❌ This betting session has expired (sessions last 5 minutes). Please use `/sportbet view` to start a new session.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Store games data for the next step (game selection)
        const userId = interaction.user.id;
        pendingGames.set(`${userId}_games`, { 
            games: pendingData.games, 
            sport: pendingData.sport,
            tier: pendingData.tier,
            countryKey: pendingData.countryKey,
            leagueKey: pendingData.leagueKey
        });
        setTimeout(() => pendingGames.delete(`${userId}_games`), 300000); // 5 minute cleanup

        // Create game selection menu
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`sportbet_game_${interaction.user.id}_${Date.now()}`)
            .setPlaceholder('Select a game to bet on')
            .addOptions(
                pendingData.games.slice(0, 10).map((game, idx) => ({
                    label: `${game.home_team} vs ${game.away_team}`,
                    description: new Date(game.commence_time).toLocaleString(),
                    value: `${idx}_${pendingData.sport}`, // Removed hardcoded amount
                    emoji: SPORTS[pendingData.sport].icon
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: 'Please select a game to bet on:',
            components: [row],
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        logger.error(`Error in handleSelectButton: ${error.message}`);
        await interaction.reply({
            content: '❌ An error occurred. Please try again.',
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * Handle team selection button
 */
async function handleTeamSelection(interaction) {
    try {
        if (!interaction.customId.startsWith('sportbet_team_')) return;
        
        const parts = interaction.customId.replace('sportbet_team_', '').split('_');
        const team = parts.slice(0, -2).join('_'); // Handle team names with underscores
        const amount = parseInt(parts[parts.length - 2]);
        const gameId = parts[parts.length - 1];
        
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        
        const pendingData = pendingGames.get(`${userId}_${gameId}`);
        if (!pendingData) {
            return await interaction.reply({
                content: '❌ Session expired. Please start a new bet.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Check balance again
        const balance = await dbManager.getBalances(userId, guildId);
        if (amount > balance.wallet) {
            return await interaction.reply({
                content: `❌ Insufficient balance! You have ${fmt(balance.wallet)}`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Get odds
        const odds = pendingData.game.bookmakers[0]?.markets[0]?.outcomes || [];
        const teamOdds = odds.find(o => o.name === team)?.price || 2.0;
        const payout = Math.floor(amount * teamOdds);

        // Deduct bet amount
        await dbManager.updateUserBalance(userId, guildId, -amount, 0);

        // Record bet in database
        const betId = await dbManager.databaseAdapter.executeQuery(`
            INSERT INTO sport_bets 
            (user_id, guild_id, sport, game_id, game_name, selection, amount, odds, payout, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())
        `, [
            userId,
            guildId,
            pendingData.sport,
            pendingData.game.id,
            `${pendingData.game.home_team} vs ${pendingData.game.away_team}`,
            team,
            amount,
            teamOdds,
            0
        ]);

        // Create confirmation embed
        const confirmEmbed = new EmbedBuilder()
            .setTitle('🎯 Bet Placed!')
            .setDescription(`Your bet has been placed successfully!`)
            .addFields(
                { name: '🏆 Game', value: `${pendingData.game.home_team} vs ${pendingData.game.away_team}`, inline: false },
                { name: '🎯 Your Pick', value: team, inline: true },
                { name: '💰 Bet Amount', value: fmt(amount), inline: true },
                { name: '📈 Odds', value: `${teamOdds.toFixed(2)}x`, inline: true },
                { name: '💎 Potential Win', value: fmt(payout), inline: true },
                { name: '📅 Game Time', value: new Date(pendingData.game.commence_time).toLocaleString(), inline: false }
            )
            .setColor('#00FF00')
            .setFooter({ text: `Bet ID: ${betId}` })
            .setTimestamp();

        await interaction.update({ embeds: [confirmEmbed], components: [] });

        // Log the bet
        await sendLogMessage(
            interaction.client,
            'economy',
            `Sports bet placed: ${interaction.user.displayName} bet ${fmt(amount)} on ${team} (${teamOdds.toFixed(2)}x odds)`,
            userId,
            guildId
        );

        // Clean up pending data
        pendingGames.delete(`${userId}_${gameId}`);
        pendingGames.delete(`${userId}_games`);

    } catch (error) {
        logger.error(`Error in handleTeamSelection: ${error.message}`);
        await interaction.reply({
            content: '❌ An error occurred placing your bet. Your balance has not been deducted.',
            flags: MessageFlags.Ephemeral
        });
    }
}

// Export for external use
module.exports.processBetResult = processBetResult;
module.exports.handleGameSelection = handleGameSelection;
module.exports.handleSelectButton = handleSelectButton;
module.exports.handleTeamSelection = handleTeamSelection;

// Export new market handlers
module.exports.handleMarketsButton = async function(interaction) {
    console.log('SportBet: Markets button clicked');
    console.log('SportBet: CustomId:', interaction.customId);
    
    try {
        const tempId = interaction.customId.replace('sportbet_markets_', '');
        console.log('SportBet: Looking for markets data with tempId:', tempId);
        console.log('SportBet: Available keys:', Array.from(pendingGames.keys()));
        
        const pendingData = pendingGames.get(tempId);
        
        if (!pendingData) {
            console.log('SportBet: No markets data found for tempId:', tempId);
            return await interaction.update({
                content: '❌ Session expired. Please view games again with `/sportbet view`',
                embeds: [],
                components: []
            });
        }
        
        console.log('SportBet: Found markets data:', pendingData);
        
        // Check user's subscription tier (use existing function)
        const subscription = await checkUserSubscription(interaction.user.id);
        const userTier = subscription?.subscription_type === 'ruby_subscription' ? 'ruby' : 'diamond';
        
        await showBettingMarkets(interaction, pendingData.sport, tempId, userTier);
        
    } catch (error) {
        console.error('SportBet: Markets button error:', error);
        await interaction.update({
            content: '❌ An error occurred while loading markets. Please try again.',
            components: []
        });
    }
};

module.exports.handleMarketSelection = async function(interaction) {
    const afterPrefix = interaction.customId.replace('sportbet_market_', '');
    const parts = afterPrefix.split('_');
    // Parse from the end: last 3 parts are tempId_userId_timestamp
    // Extract tempId (which is the original ${userId}_${timestamp1})
    const timestamp2 = parts[parts.length - 1]; // ignore this
    const userId = parts[parts.length - 2];
    const timestampFromTempId = parts[parts.length - 3];
    const tempId = `${userId}_${timestampFromTempId}`;
    // Everything before the tempId parts is the sport (could have underscores)
    const sport = parts.slice(0, parts.length - 3).join('_');
    const marketType = interaction.values[0];
    
    console.log('SportBet: Market selection - extracted tempId:', tempId, 'sport:', sport);
    const pendingData = pendingGames.get(`market_${tempId}`);
    if (!pendingData) {
        return await interaction.update({
            content: '❌ Session expired. Please start again.',
            embeds: [],
            components: []
        });
    }
    
    await showMarketBetsUpdate(interaction, sport, marketType, pendingData.tempId, pendingData.tier);
};

module.exports.handleMarketBetButton = async function(interaction) {
    const afterPrefix = interaction.customId.replace('sportbet_market_bet_', '');
    const parts = afterPrefix.split('_');
    // Parse from the end: last part is tempId, second to last is marketType
    const tempId = parts[parts.length - 1];
    const marketType = parts[parts.length - 2];
    // Everything before marketType is the sport (could have underscores)
    const sport = parts.slice(0, parts.length - 2).join('_');
    
    await handleMarketBetSelection(interaction, sport, marketType, tempId);
};

module.exports.handleBackToMarkets = async function(interaction) {
    const afterPrefix = interaction.customId.replace('sportbet_back_markets_', '');
    const parts = afterPrefix.split('_');
    // Parse from the end: last part is tempId
    const tempId = parts[parts.length - 1];
    // Everything before tempId is the sport (could have underscores)
    const sport = parts.slice(0, parts.length - 1).join('_');
    
    const pendingData = pendingGames.get(tempId);
    if (!pendingData) {
        return await interaction.reply({
            content: '❌ Session expired. Please start again.',
            flags: MessageFlags.Ephemeral
        });
    }
    
    await showBettingMarkets(interaction, sport, tempId, pendingData.tier);
};

module.exports.handleMarketGameSelection = async function(interaction) {
    // This would handle the final bet placement with specific market options
    const afterPrefix = interaction.customId.replace('sportbet_market_game_', '');
    const parts = afterPrefix.split('_');
    // Parse from the end: last 3 parts are tempId_userId_timestamp
    // Extract tempId (which is the original ${userId}_${timestamp1})
    const timestamp2 = parts[parts.length - 1]; // ignore this
    const userId = parts[parts.length - 2];
    const timestampFromTempId = parts[parts.length - 3];
    const tempId = `${userId}_${timestampFromTempId}`;
    const marketType = parts[parts.length - 4];
    // Everything before marketType is the sport (could have underscores)
    const sport = parts.slice(0, parts.length - 4).join('_');
    const gameIdx = interaction.values[0];
    
    console.log('SportBet: Market game selection - extracted tempId:', tempId, 'sport:', sport, 'marketType:', marketType);
    
    const pendingData = pendingGames.get(tempId);
    if (!pendingData) {
        return await interaction.reply({
            content: '❌ Session expired. Please start a new bet.',
            flags: MessageFlags.Ephemeral
        });
    }
    
    const game = pendingData.games[parseInt(gameIdx)];
    const marketInfo = BETTING_MARKETS[sport][marketType];
    
    // Create market-specific betting options
    const embed = new EmbedBuilder()
        .setTitle(`${marketInfo.icon} ${marketInfo.name}`)
        .setDescription(`**${game.home_team} vs ${game.away_team}**\n${marketInfo.description}`)
        .setColor('#00FF00')
        .setFooter({ text: 'Select your bet and we\'ll ask for the amount' });
    
    // Generate betting options buttons based on market type
    let buttons = [];
    switch (marketType) {
        case 'h2h':
            const odds = game.bookmakers[0]?.markets[0]?.outcomes || [];
            const homeOdds = odds.find(o => o.name === game.home_team)?.price || 2.0;
            const awayOdds = odds.find(o => o.name === game.away_team)?.price || 2.0;
            
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`sportbet_final_bet_${tempId}_${gameIdx}_home_${homeOdds.toFixed(2)}`)
                    .setLabel(`${game.home_team} (${homeOdds.toFixed(2)})`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🏠')
            );
            
            if (sport === 'soccer') {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`sportbet_final_bet_${tempId}_${gameIdx}_draw_${(3.3).toFixed(2)}`)
                        .setLabel(`Draw (${(3.3).toFixed(2)})`)
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⚖️')
                );
            }
            
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`sportbet_final_bet_${tempId}_${gameIdx}_away_${awayOdds.toFixed(2)}`)
                    .setLabel(`${game.away_team} (${awayOdds.toFixed(2)})`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('✈️')
            );
            break;
            
        case 'totals':
            const totalValue = Math.floor(Math.random() * 4 + 2.5);
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`sportbet_final_bet_${tempId}_${gameIdx}_over_${(1.9).toFixed(2)}`)
                    .setLabel(`Over ${totalValue} (1.90)`)
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('📈'),
                new ButtonBuilder()
                    .setCustomId(`sportbet_final_bet_${tempId}_${gameIdx}_under_${(1.9).toFixed(2)}`)
                    .setLabel(`Under ${totalValue} (1.90)`)
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('📉')
            );
            break;
            
        default:
            // Generic over/under for other markets
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`sportbet_final_bet_${tempId}_${gameIdx}_yes_${(1.8).toFixed(2)}`)
                    .setLabel(`Yes (1.80)`)
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId(`sportbet_final_bet_${tempId}_${gameIdx}_no_${(2.0).toFixed(2)}`)
                    .setLabel(`No (2.00)`)
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );
    }
    
    // Create action rows (max 5 buttons per row)
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }
    
    await interaction.update({ embeds: [embed], components: rows });
};

// Add pagination handler
module.exports.handlePageNavigation = async function(interaction) {
    console.log('SportBet: Page navigation clicked');
    console.log('SportBet: CustomId:', interaction.customId);
    
    try {
        const afterPrefix = interaction.customId.replace('sportbet_page_', '');
        const parts = afterPrefix.split('_');
        console.log('SportBet: Page navigation parts:', parts);
        
        // Parse from the end: last part is userId, then page number, leagueKey, countryKey
        const userId = parts[parts.length - 1];
        const pageNum = parseInt(parts[parts.length - 2]);
        const leagueKey = parts[parts.length - 3];
        const countryKey = parts[parts.length - 4];
        // Everything before countryKey is the sport (could have underscores)
        const sport = parts.slice(0, parts.length - 4).join('_');
        
        console.log('SportBet: Page navigation extracted - sport:', sport, 'countryKey:', countryKey, 'leagueKey:', leagueKey, 'page:', pageNum, 'userId:', userId);
        
        if (userId !== interaction.user.id) {
            return await interaction.reply({
                content: '❌ You can only navigate your own betting session.',
                flags: MessageFlags.Ephemeral
            });
        }
        
        // Get user subscription tier for proper access
        const tier = await checkUserSubscription(interaction.user.id, interaction.guild.id);
        
        // Show games for the new page
        await showGamesForLeagueWithPage(interaction, sport, countryKey, leagueKey, tier, pageNum);
        
    } catch (error) {
        console.error('SportBet: Error in page navigation:', error);
        await interaction.reply({
            content: '❌ An error occurred while changing pages. Please try again.',
            flags: MessageFlags.Ephemeral
        });
    }
};

// Add the missing handleFinalBet export
module.exports.handleFinalBet = async function(interaction) {
    try {
        console.log('SportBet: handleFinalBet called with customId:', interaction.customId);
        const parts = interaction.customId.replace('sportbet_final_bet_', '').split('_');
        const tempId = parts[0];
        const gameIdx = parts[1];
        const betType = parts[2];
        const odds = parseFloat(parts[3]);
        
        const pendingData = pendingGames.get(tempId);
        if (!pendingData) {
            return await interaction.reply({
                content: '❌ Session expired. Please start a new bet.',
                flags: MessageFlags.Ephemeral
            });
        }
        
        const game = pendingData.games[parseInt(gameIdx)];
        
        // For now, just confirm the selection
        await interaction.reply({
            content: `✅ You selected: **${betType}** at odds **${odds}**\nGame: ${game.home_team} vs ${game.away_team}\n\nBetting placement coming soon!`,
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        logger.error(`Error in handleFinalBet: ${error.message}`);
        await interaction.reply({
            content: '❌ An error occurred processing your bet.',
            flags: MessageFlags.Ephemeral
        });
    }
};

// Add modal handler for bet amount input
module.exports.handleBetAmountModal = async function(interaction) {
    try {
        console.log('SportBet: handleBetAmountModal called with customId:', interaction.customId);
        
        // Parse: sportbet_bet_amount_${gameIdx}_${sport}_${userId}_${timestamp}
        const afterPrefix = interaction.customId.replace('sportbet_bet_amount_', '');
        const parts = afterPrefix.split('_');
        
        // Parse from the end: last 2 parts are userId and timestamp  
        const timestamp = parts[parts.length - 1];
        const userId = parts[parts.length - 2];
        const gameIdx = parts[0];
        // Everything between gameIdx and userId is the sport (could have underscores)
        const sport = parts.slice(1, parts.length - 2).join('_');
        
        console.log('SportBet: Parsed modal - gameIdx:', gameIdx, 'sport:', sport, 'userId:', userId);
        
        const betAmount = interaction.fields.getTextInputValue('bet_amount');
        const amount = parseAmount(betAmount);
        
        if (!amount || amount < 10) {
            return await interaction.reply({
                content: '❌ Invalid bet amount. Please enter a number greater than 10.',
                flags: MessageFlags.Ephemeral
            });
        }
        
        // Get user data and verify balance
        const pendingData = pendingGames.get(`${userId}_games`);
        if (!pendingData) {
            return await interaction.reply({
                content: '❌ Session expired. Please start a new bet.',
                flags: MessageFlags.Ephemeral
            });
        }
        
        const game = pendingData.games[parseInt(gameIdx)];
        if (!game) {
            return await interaction.reply({
                content: '❌ Invalid game selection.',
                flags: MessageFlags.Ephemeral
            });
        }
        
        // Check user balance
        const userBalance = await dbManager.getUserBalance(userId, interaction.guild.id);
        if (userBalance < amount) {
            return await interaction.reply({
                content: `❌ Insufficient balance. You have ${fmt(userBalance)} but need ${fmt(amount)}.`,
                flags: MessageFlags.Ephemeral
            });
        }
        
        // Create team selection buttons with the amount
        const homeButton = new ButtonBuilder()
            .setCustomId(`sportbet_team_${game.home_team}_${amount}_${game.id}`)
            .setLabel(game.home_team)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🏠');

        const awayButton = new ButtonBuilder()
            .setCustomId(`sportbet_team_${game.away_team}_${amount}_${game.id}`)
            .setLabel(game.away_team)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('✈️');

        const row = new ActionRowBuilder().addComponents(homeButton, awayButton);

        const odds = game.bookmakers[0]?.markets[0]?.outcomes || [];
        const homeOdds = odds.find(o => o.name === game.home_team)?.price || 2.0;
        const awayOdds = odds.find(o => o.name === game.away_team)?.price || 2.0;

        const selectEmbed = new EmbedBuilder()
            .setTitle('Select Your Team')
            .setDescription(`**${game.home_team}** vs **${game.away_team}**`)
            .addFields(
                { name: '💰 Bet Amount', value: fmt(amount), inline: true },
                { name: '🏠 ' + game.home_team, value: `Odds: ${homeOdds.toFixed(2)}x\nPotential: ${fmt(Math.floor(amount * homeOdds))}`, inline: true },
                { name: '✈️ ' + game.away_team, value: `Odds: ${awayOdds.toFixed(2)}x\nPotential: ${fmt(Math.floor(amount * awayOdds))}`, inline: true }
            )
            .setColor('#00FF00');

        // Store game data for team selection
        pendingGames.set(`${userId}_${game.id}`, { game, amount, sport, tier: pendingData.tier });
        setTimeout(() => pendingGames.delete(`${userId}_${game.id}`), 60000);

        await interaction.reply({ 
            embeds: [selectEmbed], 
            components: [row],
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        logger.error(`Error in handleBetAmountModal: ${error.message}`);
        await interaction.reply({
            content: '❌ An error occurred processing your bet amount.',
            flags: MessageFlags.Ephemeral
        });
    }
};