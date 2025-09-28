/**
 * Sports Betting Command - Premium/Ruby users only
 * Live sports betting with real-time data from sports APIs
 */

const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { PayoutManager } = require('../UTILS/gameUtils');
const { fmt, fmtDelta, getGuildId, sendLogMessage, parseAmount } = require('../UTILS/common');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');
const sportsApiManager = require('../UTILS/sportsApiManager');

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
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const subcommand = interaction.options.getSubcommand();

        await interaction.deferReply();

        try {
            // Check premium/ruby subscription
            const subscription = await getUserSubscription(userId);
            if (!subscription) {
                const noSubEmbed = new EmbedBuilder()
                    .setTitle('💎 Premium Feature')
                    .setDescription('Sports betting is exclusive to **Diamond** and **Ruby** subscribers!')
                    .addFields(
                        { name: '💎 Diamond', value: 'Monthly: $4.99\n• Sports betting access\n• 50K monthly bonus', inline: true },
                        { name: '🔴 Ruby', value: 'Monthly: $9.99\n• Enhanced betting limits\n• 100K monthly bonus', inline: true }
                    )
                    .setColor('#FF0000')
                    .setFooter({ text: 'Subscribe via Server Shop to unlock!' });
                
                return await interaction.editReply({ embeds: [noSubEmbed] });
            }

            const isRuby = subscription.subscription_type === 'ruby_subscription';
            const tier = isRuby ? 'ruby' : 'diamond';

            // Handle subcommands
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
        let leagues;
        
        if (selectedLeague) {
            // Single league requested
            leagues = [selectedLeague];
        } else if (selectedCountry) {
            // All leagues for a specific country
            const countries = getCountriesForSport(sport);
            leagues = countries[selectedCountry]?.leagues.map(l => l.key) || [];
        } else {
            // All leagues for the sport
            leagues = getAllLeaguesForSport(sport);
        }
        
        // Use the sports API manager with caching and rotation
        const allGames = await sportsApiManager.fetchGamesWithCache(sport, leagues);
        
        // Filter games in next 48 hours
        return allGames.filter(game => {
            const gameTime = new Date(game.commence_time);
            const now = new Date();
            const hoursUntilGame = (gameTime - now) / (1000 * 60 * 60);
            return hoursUntilGame > 0 && hoursUntilGame < 48;
        });

    } catch (error) {
        logger.error(`Error fetching games: ${error.message}`);
        return sportsApiManager.getMockGames(sport);
    }
}

/**
 * Handle viewing available games with enhanced navigation
 */
async function handleViewGames(interaction, tier) {
    const sport = interaction.options.getString('sport');
    const countries = getCountriesForSport(sport);
    
    // First show country selection
    if (Object.keys(countries).length > 1) {
        await showCountrySelection(interaction, sport, tier);
    } else {
        // If only one country, skip to league selection
        const countryKey = Object.keys(countries)[0];
        await showLeagueSelection(interaction, sport, countryKey, tier);
    }
}

/**
 * Show country selection for a sport
 */
async function showCountrySelection(interaction, sport, tier) {
    const countries = getCountriesForSport(sport);
    const sportData = SPORTS[sport];
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`sportbet_country_${sport}_${interaction.user.id}_${Date.now()}`)
        .setPlaceholder('🌍 Select a country/region')
        .addOptions(
            Object.entries(countries).slice(0, 25).map(([countryKey, countryData]) => ({
                label: countryData.name.replace(/🏴󠁧󠁢󠁥󠁮󠁧󠁿|🇪🇸|🇩🇪|🇮🇹|🇫🇷|🌍|🇺🇸|🇪🇺|🇯🇵|🇺🇸🇨🇦/g, '').trim(),
                description: `${countryData.leagues.length} league(s) available`,
                value: countryKey,
                emoji: countryData.name.match(/🏴󠁧󠁢󠁥󠁮󠁧󠁿|🇪🇸|🇩🇪|🇮🇹|🇫🇷|🌍|🇺🇸|🇪🇺|🇯🇵|🇺🇸🇨🇦/)?.[0] || sportData.icon
            }))
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    const embed = new EmbedBuilder()
        .setTitle(`${sportData.name} - Select Region`)
        .setDescription(`Choose a country or region to view available leagues:\n\n${tier === 'ruby' ? '🔴 **Ruby Tier**' : '💎 **Diamond Tier**'}`)
        .setColor(tier === 'ruby' ? '#FF0000' : '#00FFFF')
        .setFooter({ text: 'Select a region to continue' })
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

    // Store data for interaction
    const tempId = `${interaction.user.id}_${Date.now()}`;
    pendingGames.set(`country_${tempId}`, { sport, tier });
    setTimeout(() => pendingGames.delete(`country_${tempId}`), 300000);

    await interaction.editReply({ embeds: [embed], components: [row] });
}

/**
 * Show league selection for a country
 */
async function showLeagueSelection(interaction, sport, countryKey, tier) {
    const countries = getCountriesForSport(sport);
    const countryData = countries[countryKey];
    const sportData = SPORTS[sport];
    
    if (!countryData) {
        return await interaction.editReply({
            content: '❌ Invalid country selection.',
            ephemeral: true
        });
    }

    // If only one league, skip to games
    if (countryData.leagues.length === 1) {
        await showGamesForLeague(interaction, sport, countryKey, countryData.leagues[0].key, tier);
        return;
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`sportbet_league_${sport}_${countryKey}_${interaction.user.id}_${Date.now()}`)
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

    // Store data for interaction
    const tempId = `${interaction.user.id}_${Date.now()}`;
    pendingGames.set(`league_${tempId}`, { sport, countryKey, tier });
    setTimeout(() => pendingGames.delete(`league_${tempId}`), 300000);

    await interaction.editReply({ embeds: [embed], components: [row] });
}

/**
 * Show games for a specific league
 */
async function showGamesForLeague(interaction, sport, countryKey, leagueKey, tier) {
    const countries = getCountriesForSport(sport);
    const countryData = countries[countryKey];
    const sportData = SPORTS[sport];
    
    // Fetch games for the specific league
    const games = await fetchLiveGames(sport, countryKey, leagueKey === 'all' ? null : leagueKey);

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

    const gamesEmbed = new EmbedBuilder()
        .setTitle(`${sportData.icon} ${leagueName}`)
        .setDescription(`**${countryData.name}** • ${tier === 'ruby' ? '🔴 Ruby Tier' : '💎 Diamond Tier'}\n\n📊 Showing **${Math.min(games.length, 8)} of ${games.length}** upcoming games`)
        .setColor(tier === 'ruby' ? '#FF0000' : '#00FFFF')
        .setTimestamp();

    // Add games in a more organized way
    games.slice(0, 8).forEach((game, idx) => {
        const gameTime = new Date(game.commence_time);
        const timeUntil = Math.round((gameTime - new Date()) / (1000 * 60 * 60));
        const odds = game.bookmakers[0]?.markets[0]?.outcomes || [];
        const homeOdds = odds.find(o => o.name === game.home_team)?.price || 'N/A';
        const awayOdds = odds.find(o => o.name === game.away_team)?.price || 'N/A';

        const timeText = timeUntil < 1 ? '🔴 Starting soon' : 
                        timeUntil < 24 ? `⏰ In ${timeUntil}h` : 
                        `📅 ${gameTime.toLocaleDateString()}`;

        gamesEmbed.addFields({
            name: `${idx + 1}. ${game.home_team} vs ${game.away_team}`,
            value: `${timeText}\n` +
                   `🏠 **${homeOdds}** • 🆚 • **${awayOdds}** ✈️`,
            inline: true
        });
    });

    // Store games and create action buttons
    const tempId = `${interaction.user.id}_${Date.now()}`;
    pendingGames.set(tempId, { games, sport, countryKey, leagueKey, tier });
    setTimeout(() => pendingGames.delete(tempId), 300000);

    const betButton = new ButtonBuilder()
        .setCustomId(`sportbet_select_${tempId}`)
        .setLabel('Place Bet')
        .setStyle(ButtonStyle.Success)
        .setEmoji('💰');

    const marketsButton = new ButtonBuilder()
        .setCustomId(`sportbet_markets_${tempId}`)
        .setLabel('Betting Markets')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📊');

    const backButton = new ButtonBuilder()
        .setCustomId(`sportbet_back_league_${sport}_${countryKey}_${interaction.user.id}`)
        .setLabel('← Back')
        .setStyle(ButtonStyle.Secondary);

    const refreshButton = new ButtonBuilder()
        .setCustomId(`sportbet_refresh_${sport}_${countryKey}_${leagueKey}_${interaction.user.id}`)
        .setLabel('🔄 Refresh')
        .setStyle(ButtonStyle.Primary);

    const row1 = new ActionRowBuilder().addComponents(backButton, refreshButton, marketsButton);
    const row2 = new ActionRowBuilder().addComponents(betButton);

    await interaction.editReply({ embeds: [gamesEmbed], components: [row1, row2] });
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
            ephemeral: true
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
    
    const embed = new EmbedBuilder()
        .setTitle(`${sportData.icon} Betting Markets`)
        .setDescription(`Choose your preferred betting market:\n\n${tier === 'ruby' ? '🔴 **Ruby Tier**' : '💎 **Diamond Tier**'}`)
        .setColor(tier === 'ruby' ? '#FF0000' : '#00FFFF')
        .setFooter({ text: 'Select a market to view available bets' })
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

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

/**
 * Show specific market betting options
 */
async function showMarketBets(interaction, sport, marketType, tempId, tier) {
    const pendingData = pendingGames.get(tempId);
    if (!pendingData) {
        return await interaction.reply({
            content: '❌ Session expired. Please start again.',
            ephemeral: true
        });
    }

    const games = pendingData.games;
    const marketInfo = BETTING_MARKETS[sport][marketType];
    const sportData = SPORTS[sport];

    if (games.length === 0) {
        return await interaction.reply({
            content: '❌ No games available for this market.',
            ephemeral: true
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
            ephemeral: true
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

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
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

        return subscription.length > 0 ? subscription[0] : null;
    } catch (error) {
        logger.error(`Error getting user subscription: ${error.message}`);
        return null;
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
                ephemeral: true
            });
        }

        // Get usage stats
        const stats = await sportsApiManager.getUsageStats();
        
        if (!stats) {
            return await interaction.editReply({
                content: '❌ Could not retrieve API usage statistics.',
                ephemeral: true
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
    const [sport, userId, timestamp] = interaction.customId.replace('sportbet_country_', '').split('_');
    const countryKey = interaction.values[0];
    
    const pendingData = pendingGames.get(`country_${userId}_${timestamp}`);
    if (!pendingData) {
        return await interaction.reply({
            content: '❌ Session expired. Please start again.',
            ephemeral: true
        });
    }
    
    await showLeagueSelection(interaction, sport, countryKey, pendingData.tier);
};

module.exports.handleLeagueSelection = async function(interaction) {
    // Handle league selection dropdown
    const parts = interaction.customId.replace('sportbet_league_', '').split('_');
    const sport = parts[0];
    const countryKey = parts[1];
    const userId = parts[2];
    const timestamp = parts[3];
    const leagueKey = interaction.values[0];
    
    const pendingData = pendingGames.get(`league_${userId}_${timestamp}`);
    if (!pendingData) {
        return await interaction.reply({
            content: '❌ Session expired. Please start again.',
            ephemeral: true
        });
    }
    
    await showGamesForLeague(interaction, sport, countryKey, leagueKey, pendingData.tier);
};

module.exports.handleBackButton = async function(interaction) {
    // Handle back navigation buttons
    if (interaction.customId.includes('back_league')) {
        const parts = interaction.customId.replace('sportbet_back_league_', '').split('_');
        const sport = parts[0];
        const countryKey = parts[1];
        const userId = parts[2];
        
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
    // Handle refresh button
    const parts = interaction.customId.replace('sportbet_refresh_', '').split('_');
    const sport = parts[0];
    const countryKey = parts[1];
    const leagueKey = parts[2];
    const userId = parts[3];
    
    await showGamesForLeague(interaction, sport, countryKey, leagueKey, 'diamond'); // Default tier
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
        const [gameIdx, amount, sport] = interaction.values[0].split('_');
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        
        const pendingData = pendingGames.get(`${userId}_games`);
        if (!pendingData) {
            return await interaction.reply({
                content: '❌ Session expired. Please start a new bet.',
                ephemeral: true
            });
        }

        const game = pendingData.games[parseInt(gameIdx)];
        if (!game) {
            return await interaction.reply({
                content: '❌ Invalid game selection.',
                ephemeral: true
            });
        }

        // Create team selection buttons
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
                { name: '💰 Bet Amount', value: fmt(parseInt(amount)), inline: true },
                { name: '🏠 ' + game.home_team, value: `Odds: ${homeOdds.toFixed(2)}x\nPotential: ${fmt(Math.floor(amount * homeOdds))}`, inline: true },
                { name: '✈️ ' + game.away_team, value: `Odds: ${awayOdds.toFixed(2)}x\nPotential: ${fmt(Math.floor(amount * awayOdds))}`, inline: true }
            )
            .setColor('#00FF00');

        // Store game data for team selection
        pendingGames.set(`${userId}_${game.id}`, { game, amount: parseInt(amount), sport, tier: pendingData.tier });
        setTimeout(() => pendingGames.delete(`${userId}_${game.id}`), 60000);

        await interaction.update({ embeds: [selectEmbed], components: [row] });
    } catch (error) {
        logger.error(`Error in handleGameSelection: ${error.message}`);
        await interaction.reply({
            content: '❌ An error occurred. Please try again.',
            ephemeral: true
        });
    }
}

/**
 * Handle select button for viewing games
 */
async function handleSelectButton(interaction) {
    try {
        const tempId = interaction.customId.replace('sportbet_select_', '');
        const pendingData = pendingGames.get(tempId);
        
        if (!pendingData) {
            return await interaction.reply({
                content: '❌ Session expired. Please view games again.',
                ephemeral: true
            });
        }

        // Create game selection menu
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`sportbet_game_${interaction.user.id}_${Date.now()}`)
            .setPlaceholder('Select a game and enter bet amount first')
            .addOptions(
                pendingData.games.slice(0, 10).map((game, idx) => ({
                    label: `${game.home_team} vs ${game.away_team}`,
                    description: new Date(game.commence_time).toLocaleString(),
                    value: `${idx}_0_${pendingData.sport}`, // Will need to get amount via modal
                    emoji: SPORTS[pendingData.sport].icon
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: 'Please select a game and I\'ll ask for your bet amount:',
            components: [row],
            ephemeral: true
        });
    } catch (error) {
        logger.error(`Error in handleSelectButton: ${error.message}`);
        await interaction.reply({
            content: '❌ An error occurred. Please try again.',
            ephemeral: true
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
                ephemeral: true
            });
        }

        // Check balance again
        const balance = await dbManager.getBalances(userId, guildId);
        if (amount > balance.wallet) {
            return await interaction.reply({
                content: `❌ Insufficient balance! You have ${fmt(balance.wallet)}`,
                ephemeral: true
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
            ephemeral: true
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
    const tempId = interaction.customId.replace('sportbet_markets_', '');
    const pendingData = pendingGames.get(tempId);
    
    if (!pendingData) {
        return await interaction.reply({
            content: '❌ Session expired. Please view games again.',
            ephemeral: true
        });
    }
    
    await showBettingMarkets(interaction, pendingData.sport, tempId, pendingData.tier);
};

module.exports.handleMarketSelection = async function(interaction) {
    const parts = interaction.customId.replace('sportbet_market_', '').split('_');
    const sport = parts[0];
    const tempId = parts[1];
    const marketType = interaction.values[0];
    
    const pendingData = pendingGames.get(`market_${tempId}`);
    if (!pendingData) {
        return await interaction.reply({
            content: '❌ Session expired. Please start again.',
            ephemeral: true
        });
    }
    
    await showMarketBets(interaction, sport, marketType, pendingData.tempId, pendingData.tier);
};

module.exports.handleMarketBetButton = async function(interaction) {
    const parts = interaction.customId.replace('sportbet_market_bet_', '').split('_');
    const sport = parts[0];
    const marketType = parts[1];
    const tempId = parts[2];
    
    await handleMarketBetSelection(interaction, sport, marketType, tempId);
};

module.exports.handleBackToMarkets = async function(interaction) {
    const parts = interaction.customId.replace('sportbet_back_markets_', '').split('_');
    const sport = parts[0];
    const tempId = parts[1];
    
    const pendingData = pendingGames.get(tempId);
    if (!pendingData) {
        return await interaction.reply({
            content: '❌ Session expired. Please start again.',
            ephemeral: true
        });
    }
    
    await showBettingMarkets(interaction, sport, tempId, pendingData.tier);
};

module.exports.handleMarketGameSelection = async function(interaction) {
    // This would handle the final bet placement with specific market options
    const parts = interaction.customId.replace('sportbet_market_game_', '').split('_');
    const sport = parts[0];
    const marketType = parts[1];
    const tempId = parts[2];
    const gameIdx = interaction.values[0];
    
    const pendingData = pendingGames.get(tempId);
    if (!pendingData) {
        return await interaction.reply({
            content: '❌ Session expired. Please start a new bet.',
            ephemeral: true
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