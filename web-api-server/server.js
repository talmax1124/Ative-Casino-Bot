/**
 * ATIVE Casino Web API Server
 * Backend API for the web portal
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');
const SimpleDatabaseManager = require('./database');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin
const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL
};

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// Initialize simplified database manager
const dbManager = new SimpleDatabaseManager(db);

// Helper function to get user profile data (stored profile -> Discord -> fallback)
async function getUserProfileData(userId) {
    let username = `User${userId.slice(-4)}`;
    let avatar = 'https://imgv3.fotor.com/images/blog-cover-image/10-profile-picture-ideas-to-make-you-stand-out.jpg';
    
    // Try stored profile data first (fastest and most reliable)
    try {
        const profileDoc = await db.collection('user_profiles').doc(userId).get();
        if (profileDoc.exists) {
            const profileData = profileDoc.data();
            username = profileData.displayName || profileData.username || username;
            avatar = profileData.avatarUrl || avatar;
            console.log(`🎯 Used stored profile for ${userId}: ${username}`);
            return { username, avatar };
        }
    } catch (profileErr) {
        console.log(`⚠️ No stored profile for ${userId}, trying Discord API`);
    }
    
    // Fallback to Discord API
    try {
        const discordData = await getDiscordUserData(userId);
        return {
            username: discordData.username,
            avatar: discordData.avatar
        };
    } catch (discordErr) {
        console.log(`⚠️ Discord API failed for ${userId}, using fallback`);
        return { username, avatar };
    }
}

// Discord API helper function to get user data
async function getDiscordUserData(userId) {
    try {
        if (!process.env.DISCORD_TOKEN) {
            throw new Error('Discord token not found in environment');
        }
        
        console.log(`🔍 Fetching Discord data for ${userId}...`);
        const response = await axios.get(`https://discord.com/api/v10/users/${userId}`, {
            headers: {
                'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        
        const userData = response.data;
        const avatar = userData.avatar 
            ? `https://cdn.discordapp.com/avatars/${userId}/${userData.avatar}.png?size=64`
            : `https://cdn.discordapp.com/embed/avatars/${(parseInt(userData.discriminator || '0') % 5)}.png`;
            
        console.log(`✅ Successfully got Discord data: ${userData.global_name || userData.username}`);
        return {
            username: userData.global_name || userData.username || `User${userId.slice(-4)}`,
            avatar: avatar,
            discriminator: userData.discriminator
        };
    } catch (error) {
        console.log(`❌ Discord API failed for ${userId}: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
        
        // Return fallback data
        return {
            username: `User${userId.slice(-4)}`,
            avatar: 'https://images.pexels.com/photos/1759531/pexels-photo-1759531.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500',
            discriminator: '0000'
        };
    }
}

// Helper function to check if user is a server booster
async function checkBoosterStatus(userId) {
    try {
        // This would need to be adapted based on your server's guild ID
        // For now, we'll store booster information in the database
        const boosterDoc = await db.collection('server_boosters').doc(userId).get();
        return boosterDoc.exists && boosterDoc.data().isBooster;
    } catch (error) {
        console.error(`Error checking booster status for ${userId}:`, error);
        return false;
    }
}

// Helper function to send coin purchase announcement to Discord
async function sendCoinPurchaseAnnouncement(userId, coins, amountPaid, boosterBonus = 0) {
    const ANNOUNCEMENT_CHANNEL_ID = '1403244656845787170';
    
    try {
        // Get user profile for display
        const userProfile = await getUserProfileData(userId);
        
        // Create Discord webhook payload for announcement
        const fields = [
            {
                name: '💰 Amount Purchased',
                value: `${coins.toLocaleString()} Coins`,
                inline: true
            },
            {
                name: '💵 Price Paid',
                value: `$${amountPaid}`,
                inline: true
            },
            {
                name: '📊 Value Rate',
                value: `${Math.round(coins / amountPaid).toLocaleString()} coins per $1`,
                inline: true
            }
        ];

        // Add booster bonus field if applicable
        if (boosterBonus > 0) {
            fields.push({
                name: '🚀 Booster Bonus',
                value: `+${boosterBonus.toLocaleString()} Coins (5%)`,
                inline: true
            });
        }

        const webhookPayload = {
            embeds: [{
                title: boosterBonus > 0 ? '🪙🚀 Casino Coins Purchase + Booster Bonus!' : '🪙 Casino Coins Purchase!',
                description: `**${userProfile.username}** just purchased **${coins.toLocaleString()}** Casino Coins!${boosterBonus > 0 ? ` **(+${boosterBonus.toLocaleString()} Booster Bonus!)**` : ''}`,
                color: boosterBonus > 0 ? 0xFF6B35 : 0xFFD700, // Orange for booster, Gold for regular
                thumbnail: {
                    url: userProfile.avatar
                },
                fields,
                footer: {
                    text: '🎰 ATIVE Casino • Thank you for your purchase!',
                    icon_url: 'https://images.pexels.com/photos/1759531/pexels-photo-1759531.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500'
                },
                timestamp: new Date().toISOString()
            }]
        };

        // For now, we'll store this in Firebase and let the bot pick it up
        // In a production environment, you'd want a proper webhook or direct bot communication
        await db.collection('discord_announcements').add({
            type: 'coin_purchase',
            channelId: ANNOUNCEMENT_CHANNEL_ID,
            payload: webhookPayload,
            userId: userId,
            processed: false,
            timestamp: new Date()
        });

        console.log(`📢 Coin purchase announcement queued for user ${userId}`);
        
    } catch (error) {
        console.error('Error creating coin purchase announcement:', error);
        throw error;
    }
}

// Helper function to get aggregated game stats like the bot does
async function getAggregatedGameStats(userId) {
    const gameTypes = ['blackjack', 'slots', 'multi-slots', 'crash', 'duck', 'fishing', 'plinko', 'rps', 'bingo', 'battleship', 'uno', 'roulette', 'baccarat', 'coinflip', 'dice', 'heist', 'lottery'];
    
    let totalWins = 0;
    let totalLosses = 0;
    let totalWagered = 0;
    let totalWon = 0;
    let biggestWin = 0;
    let gamesPlayed = 0;
    let favoriteGame = 'None yet';
    let maxGamePlays = 0;
    const gameStats = [];
    
    for (const gameType of gameTypes) {
        try {
            const statsDoc = await db.collection('user_stats').doc(`${userId}_${gameType}`).get();
            
            if (statsDoc.exists) {
                const stats = statsDoc.data();
                const wins = stats.wins || 0;
                const losses = stats.losses || 0;
                const wagered = stats.total_wagered || 0;
                const won = stats.total_won || 0;
                const biggest = stats.biggest_win || 0;
                
                totalWins += wins;
                totalLosses += losses;
                totalWagered += wagered;
                totalWon += won;
                gamesPlayed += wins + losses;
                
                if (biggest > biggestWin) {
                    biggestWin = biggest;
                }
                
                // Track favorite game
                const totalGamePlays = wins + losses;
                if (totalGamePlays > maxGamePlays) {
                    maxGamePlays = totalGamePlays;
                    favoriteGame = gameType.charAt(0).toUpperCase() + gameType.slice(1);
                }
                
                // Add to game stats for chart
                if (totalGamePlays > 0) {
                    gameStats.push({
                        gameType: gameType,
                        gamesPlayed: totalGamePlays,
                        totalWinnings: won,
                        totalLosses: wagered - won,
                        winRate: totalGamePlays > 0 ? (wins / totalGamePlays) : 0,
                        bestWin: biggest
                    });
                }
            }
        } catch (error) {
            console.error(`Error getting stats for ${gameType}:`, error);
        }
    }
    
    return {
        totalWins,
        totalLosses,
        totalWagered,
        totalWon,
        biggestWin,
        gamesPlayed,
        favoriteGame,
        gameStats
    };
}

// Server-side cache to prevent duplicate OAuth code usage
const processedCodes = new Map();

// Discord OAuth endpoints
app.post('/api/auth/discord', async (req, res) => {
    console.log('🔐 Discord OAuth Request received');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Environment check:', {
        hasClientId: !!process.env.DISCORD_CLIENT_ID,
        hasClientSecret: !!process.env.DISCORD_CLIENT_SECRET,
        clientId: process.env.DISCORD_CLIENT_ID
    });

    try {
        const { code, redirectUri } = req.body;
        
        if (!code) {
            console.error('❌ No authorization code provided');
            return res.status(400).json({ error: 'Missing authorization code' });
        }

        if (!redirectUri) {
            console.error('❌ No redirect URI provided');
            return res.status(400).json({ error: 'Missing redirect URI' });
        }

        // Check if this code is already being processed or has been processed
        const codeKey = code.substring(0, 15);
        if (processedCodes.has(codeKey)) {
            const existingEntry = processedCodes.get(codeKey);
            if (existingEntry.status === 'processing') {
                console.log('⏳ Code already being processed, sending 429 Too Many Requests');
                return res.status(429).json({ 
                    error: 'Code already being processed',
                    retryAfter: 5
                });
            } else if (existingEntry.status === 'completed') {
                console.log('✅ Code already processed successfully, returning cached result');
                return res.json(existingEntry.result);
            }
        }

        // Mark code as being processed
        processedCodes.set(codeKey, { 
            status: 'processing', 
            timestamp: Date.now() 
        });

        // Clean up old entries (older than 10 minutes)
        for (const [key, entry] of processedCodes.entries()) {
            if (Date.now() - entry.timestamp > 600000) {
                processedCodes.delete(key);
            }
        }

        console.log('🔄 Exchanging code for Discord access token...');
        console.log('Code:', code.substring(0, 10) + '...');
        console.log('Redirect URI:', redirectUri);

        // Exchange code for Discord access token
        const tokenData = {
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri
        };

        console.log('Token request data:', {
            client_id: tokenData.client_id,
            grant_type: tokenData.grant_type,
            redirect_uri: tokenData.redirect_uri,
            code: tokenData.code.substring(0, 10) + '...'
        });

        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
            new URLSearchParams(tokenData), 
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        console.log('✅ Discord token response status:', tokenResponse.status);
        const { access_token } = tokenResponse.data;
        
        if (!access_token) {
            console.error('❌ No access token received from Discord');
            console.error('Discord response:', tokenResponse.data);
            return res.status(500).json({ error: 'Failed to get Discord access token' });
        }

        console.log('🔄 Getting Discord user info...');
        // Get Discord user info
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        });

        console.log('✅ Discord user response status:', userResponse.status);
        const discordUser = userResponse.data;
        console.log('Discord user:', {
            id: discordUser.id,
            username: discordUser.username,
            discriminator: discordUser.discriminator
        });
        
        console.log('🔄 Creating Firebase custom token...');
        // Create Firebase custom token
        const customToken = await admin.auth().createCustomToken(discordUser.id, {
            discord_id: discordUser.id,
            username: discordUser.username,
            avatar: discordUser.avatar
        });

        console.log('✅ Firebase custom token created');

        console.log('🔄 Storing user in Firestore...');
        // Store/update user in Firestore
        await db.collection('users').doc(discordUser.id).set({
            discord_id: discordUser.id,
            username: discordUser.username,
            discriminator: discordUser.discriminator,
            avatar: discordUser.avatar,
            last_login: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        console.log('✅ User stored in Firestore');

        console.log('👤 Discord user avatar hash:', discordUser.avatar);
        
        const avatarUrl = discordUser.avatar 
            ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
            : `https://cdn.discordapp.com/embed/avatars/${(parseInt(discordUser.discriminator) || 0) % 5}.png`;

        console.log('🖼️ Generated avatar URL:', avatarUrl);

        // Get user balance for navbar display
        const balanceDoc = await db.collection('user_balances').doc(discordUser.id).get();
        const balance = balanceDoc.exists ? balanceDoc.data() : { wallet: 1000, bank: 0 };
        const totalBalance = (parseFloat(balance.wallet) || 0) + (parseFloat(balance.bank) || 0);

        const response = {
            customToken,
            user: {
                id: discordUser.id,
                discordId: discordUser.id,
                username: discordUser.username,
                discriminator: discordUser.discriminator,
                avatar: avatarUrl,
                balance: totalBalance,
                totalWinnings: 0,
                totalLosses: 0,
                gamesPlayed: 0,
                joinedAt: new Date(),
                lastActive: new Date(),
                isActive: true
            }
        };

        console.log('📤 Sending user response:', {
            id: response.user.id,
            username: response.user.username,
            avatar: response.user.avatar
        });

        // Cache successful result
        processedCodes.set(codeKey, { 
            status: 'completed', 
            timestamp: Date.now(),
            result: response
        });

        console.log('✅ Authentication successful, sending response');
        res.json(response);
    } catch (error) {
        console.error('❌ Discord OAuth error details:');
        console.error('Error message:', error.message);
        console.error('Error response:', error.response?.data);
        console.error('Error status:', error.response?.status);
        console.error('Full error:', error);
        
        // Clean up processing state on error
        const { code } = req.body;
        if (code) {
            const codeKey = code.substring(0, 15);
            processedCodes.delete(codeKey);
        }
        
        // More specific error responses
        if (error.response?.status === 400 && error.response?.data?.error === 'invalid_grant') {
            return res.status(400).json({ 
                error: 'Authorization code expired or invalid',
                details: 'Please try logging in again'
            });
        }
        
        if (error.response?.status === 401) {
            return res.status(500).json({ 
                error: 'Discord OAuth configuration error',
                details: 'Invalid client credentials'
            });
        }

        res.status(500).json({ 
            error: 'Authentication failed',
            details: error.message,
            discordError: error.response?.data
        });
    }
});

// User search endpoint for transfer functionality (must be before parameterized routes)
app.get('/api/users/search', async (req, res) => {
    try {
        const { q: query, limit = 10 } = req.query;
        
        if (!query || query.length < 2) {
            return res.json([]);
        }
        
        console.log(`🔍 Searching users with query: "${query}"`);
        
        // Search in user_balances collection (which has usernames)
        const usersSnapshot = await db.collection('user_balances').get();
        const searchResults = [];
        
        for (const doc of usersSnapshot.docs) {
            const data = doc.data();
            const userId = doc.id;
            const username = data.username || `User${userId.slice(-4)}`;
            
            // Check if username matches the search query (case insensitive)
            if (username.toLowerCase().includes(query.toLowerCase())) {
                // Get Discord user data for avatar
                let avatar = 'https://images.pexels.com/photos/1759531/pexels-photo-1759531.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500';
                
                try {
                    const discordData = await getDiscordUserData(userId);
                    avatar = discordData.avatar;
                } catch (err) {
                    console.log(`⚠️ Could not get Discord data for ${userId}, using fallback avatar`);
                }
                
                searchResults.push({
                    id: userId,
                    username: username,
                    discriminator: '0000',
                    avatar: avatar,
                    displayName: username
                });
                
                // Limit results
                if (searchResults.length >= parseInt(limit)) {
                    break;
                }
            }
        }
        
        // Sort by username
        searchResults.sort((a, b) => a.username.localeCompare(b.username));
        
        console.log(`📝 Found ${searchResults.length} users matching "${query}"`);
        res.json(searchResults);
        
    } catch (error) {
        console.error('User search error:', error);
        res.status(500).json({ error: 'Failed to search users' });
    }
});

// User endpoints
app.get('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userDoc = await db.collection('users').doc(id).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userData = userDoc.data();
        
        // Get user balance from the bot's database structure
        const balanceDoc = await db.collection('user_balances').doc(id).get();
        const balance = balanceDoc.exists ? balanceDoc.data() : { wallet: 1000, bank: 0 };
        const totalBalance = (parseFloat(balance.wallet) || 0) + (parseFloat(balance.bank) || 0);
        
        // Transform the data to match frontend expectations
        const response = {
            id: userData.discord_id || id, // Map discord_id to id
            discordId: userData.discord_id || id,
            username: userData.username,
            discriminator: userData.discriminator,
            avatar: userData.avatar 
                ? (userData.avatar.startsWith('https://') ? userData.avatar : `https://cdn.discordapp.com/avatars/${userData.discord_id}/${userData.avatar}.png?size=128`)
                : `https://cdn.discordapp.com/embed/avatars/${(parseInt(userData.discriminator) || 0) % 5}.png`,
            email: userData.email,
            balance: totalBalance,
            totalWinnings: userData.totalWinnings || 0,
            totalLosses: userData.totalLosses || 0,
            gamesPlayed: userData.gamesPlayed || 0,
            joinedAt: userData.joinedAt || userData.last_login,
            lastActive: userData.last_login,
            isActive: true
        };

        res.json(response);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

app.get('/api/users/:id/stats', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`📊 Getting stats for user ${id}`);
        
        // Get user balance using the same structure as the bot
        const balanceDoc = await db.collection('user_balances').doc(id).get();
        const balance = balanceDoc.exists ? balanceDoc.data() : { wallet: 1000, bank: 0, credits: 0 };
        
        console.log(`💰 User balance:`, balance);
        
        // Get aggregated game stats using the same logic as the bot
        const aggregatedStats = await getAggregatedGameStats(id);
        console.log(`🎮 Aggregated stats:`, aggregatedStats);
        
        // Calculate dashboard values
        const walletAmount = parseFloat(balance.wallet) || 0;
        const bankAmount = parseFloat(balance.bank) || 0;
        const creditsAmount = parseFloat(balance.credits) || 0;
        const totalBalance = walletAmount + bankAmount;
        
        const totalWinnings = aggregatedStats.totalWon || 0;
        const totalLosses = Math.max(0, (aggregatedStats.totalWagered || 0) - totalWinnings);
        const gamesPlayed = aggregatedStats.gamesPlayed || 0;
        const winRate = gamesPlayed > 0 ? aggregatedStats.totalWins / gamesPlayed : 0;
        
        // Create recent transactions from game data
        const recentTransactions = [];
        let transactionId = 1;
        
        // Add biggest win
        if (aggregatedStats.biggestWin > 0) {
            recentTransactions.push({
                id: (transactionId++).toString(),
                userId: id,
                type: 'game_win',
                amount: aggregatedStats.biggestWin,
                description: `Biggest win in ${aggregatedStats.favoriteGame}`,
                timestamp: new Date(Date.now() - Math.random() * 86400000 * 7), // Random time in last 7 days
                gameType: aggregatedStats.favoriteGame
            });
        }
        
        // Add some sample game activities from game stats
        for (const gameStat of aggregatedStats.gameStats.slice(0, 3)) {
            if (gameStat.bestWin > 0) {
                recentTransactions.push({
                    id: (transactionId++).toString(),
                    userId: id,
                    type: 'game_win',
                    amount: gameStat.bestWin,
                    description: `Win in ${gameStat.gameType}`,
                    timestamp: new Date(Date.now() - Math.random() * 86400000 * 3), // Random time in last 3 days
                    gameType: gameStat.gameType
                });
            }
            
            if (gameStat.totalLosses > 0) {
                recentTransactions.push({
                    id: (transactionId++).toString(),
                    userId: id,
                    type: 'game_loss',
                    amount: -Math.min(gameStat.totalLosses / gameStat.gamesPlayed, 1000), // Average loss per game, capped
                    description: `Loss in ${gameStat.gameType}`,
                    timestamp: new Date(Date.now() - Math.random() * 86400000 * 3), // Random time in last 3 days
                    gameType: gameStat.gameType
                });
            }
        }
        
        // Add balance-related transactions
        if (totalBalance > 1000) {
            recentTransactions.push({
                id: (transactionId++).toString(),
                userId: id,
                type: 'deposit',
                amount: totalBalance - 1000,
                description: 'Net earnings from games',
                timestamp: new Date(Date.now() - Math.random() * 86400000 * 14) // Random time in last 2 weeks
            });
        }
        
        // Sort by timestamp (newest first) and limit to 5
        recentTransactions.sort((a, b) => b.timestamp - a.timestamp);
        recentTransactions.splice(5);

        const response = {
            totalBalance,
            walletAmount,
            bankAmount,
            creditsAmount,
            totalWinnings,
            totalLosses,
            gamesPlayed,
            gamesWon: aggregatedStats.totalWins || 0, // Add this field for Profile component
            winRate,
            favoriteGame: aggregatedStats.favoriteGame,
            currentRank: 1, // TODO: implement ranking
            recentTransactions
        };
        
        console.log(`📤 Sending stats response:`, response);
        res.json(response);
    } catch (error) {
        console.error('❌ Get user stats error:', error);
        res.status(500).json({ error: 'Failed to get user stats' });
    }
});

app.get('/api/users/:id/transactions', async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 50 } = req.query;
        
        console.log(`💳 Getting transactions for user ${id}, limit: ${limit}`);
        
        // Get real transactions from Firestore
        const transactionsSnapshot = await db.collection('transactions')
            .where('userId', '==', id)
            .orderBy('timestamp', 'desc')
            .limit(parseInt(limit))
            .get();
        
        const transactions = [];
        
        if (!transactionsSnapshot.empty) {
            transactionsSnapshot.forEach(doc => {
                const data = doc.data();
                transactions.push({
                    id: doc.id,
                    userId: data.userId,
                    type: data.type,
                    amount: data.amount,
                    description: data.description || `${data.type.replace('_', ' ')} transaction`,
                    timestamp: data.timestamp.toDate ? data.timestamp.toDate().toISOString() : data.timestamp,
                    status: data.status || 'completed',
                    gameType: data.gameType,
                    recipientId: data.recipientId,
                    senderId: data.senderId
                });
            });
        } else {
            console.log(`📝 No transactions found for user ${id}`);
        }
        
        console.log(`✅ Found ${transactions.length} transactions for user ${id}`);
        res.json(transactions);
        
    } catch (error) {
        console.error('❌ Get transactions error:', error);
        // Fallback to sample data if there's an error (like missing Firestore index)
        const sampleTransactions = [
            {
                id: 'sample_1',
                userId: req.params.id,
                type: 'deposit',
                amount: 10000,
                description: 'Sample deposit - Configure real transactions in Discord bot',
                timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
                status: 'completed'
            },
            {
                id: 'sample_2',
                userId: req.params.id,
                type: 'game_win',
                amount: 5000,
                description: 'Sample game win - Real transactions will show when bot creates them',
                timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
                status: 'completed',
                gameType: 'slots'
            }
        ];
        
        console.log(`⚠️ Using sample transaction data due to error: ${error.message}`);
        res.json(sampleTransactions);
    }
});

app.get('/api/users/:id/game-stats', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🎮 Getting game stats for user ${id}`);
        
        // Get aggregated game stats using the same logic as the bot
        const aggregatedStats = await getAggregatedGameStats(id);
        console.log(`📊 Game stats found:`, aggregatedStats.gameStats);
        
        res.json(aggregatedStats.gameStats);
    } catch (error) {
        console.error('❌ Get game stats error:', error);
        res.status(500).json({ error: 'Failed to get game stats' });
    }
});

// Detailed stats endpoint for the DetailedStats component
app.get('/api/users/:id/detailed-stats', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`📊 Getting detailed stats for user ${id}`);
        
        // Get aggregated game stats
        const aggregatedStats = await getAggregatedGameStats(id);
        
        // Transform game stats to match DetailedStats component expectations
        const detailedGameStats = aggregatedStats.gameStats.map(gameStat => ({
            game: gameStat.gameType,
            wins: Math.round(gameStat.gamesPlayed * gameStat.winRate), // Calculate wins from win rate
            losses: gameStat.gamesPlayed - Math.round(gameStat.gamesPlayed * gameStat.winRate), // Calculate losses
            totalWagered: gameStat.totalWinnings + gameStat.totalLosses, // Total wagered
            totalWon: gameStat.totalWinnings,
            winRate: gameStat.winRate, // Already a decimal (0.0 to 1.0)
            netProfit: gameStat.totalWinnings - gameStat.totalLosses,
            bestWin: gameStat.bestWin,
            gamesPlayed: gameStat.gamesPlayed
        }));
        
        console.log(`📊 Detailed stats transformed:`, detailedGameStats);
        res.json(detailedGameStats);
    } catch (error) {
        console.error('❌ Get detailed stats error:', error);
        res.status(500).json({ error: 'Failed to get detailed stats' });
    }
});

// User withdrawal endpoint
app.post('/api/users/:id/withdraw', async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, type } = req.body;
        
        console.log(`💸 Processing withdrawal for user ${id}: ${amount} credits (${type})`);
        
        // Validate request
        if (!amount || amount < 1000) {
            return res.status(400).json({ error: 'Minimum withdrawal is 1,000 credits' });
        }
        
        if (type !== 'casino_credits') {
            return res.status(400).json({ error: 'Only casino credits withdrawals are supported' });
        }
        
        // Get user balance
        const balanceDoc = await db.collection('user_balances').doc(id).get();
        if (!balanceDoc.exists) {
            return res.status(404).json({ error: 'User balance not found' });
        }
        
        const balance = balanceDoc.data();
        const totalBalance = (parseFloat(balance.wallet) || 0) + (parseFloat(balance.bank) || 0);
        
        if (amount > totalBalance) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }
        
        // Process withdrawal (for now, this just creates a transaction record)
        // In a real implementation, this would integrate with the Discord bot's economy system
        const transaction = {
            userId: id,
            type: 'withdrawal',
            amount: amount,
            method: 'casino_credits',
            status: 'completed',
            timestamp: new Date(),
            description: `Withdrawal of ${amount.toLocaleString()} casino credits`
        };
        
        // Create transaction record
        await db.collection('transactions').add(transaction);
        
        console.log(`✅ Withdrawal processed for user ${id}: ${amount} credits`);
        
        res.json({ 
            success: true, 
            message: 'Withdrawal processed successfully',
            transaction 
        });
        
    } catch (error) {
        console.error('❌ Withdrawal error:', error);
        res.status(500).json({ error: 'Failed to process withdrawal' });
    }
});

// User transfer endpoint
app.post('/api/users/:id/transfer', async (req, res) => {
    try {
        const { id: fromUserId } = req.params;
        const { recipientId: toUserId, amount } = req.body;
        
        console.log(`💸 Processing transfer: ${amount} from ${fromUserId} to ${toUserId}`);
        
        // Validate request
        if (!fromUserId || !toUserId || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid transfer request' });
        }
        
        if (fromUserId === toUserId) {
            return res.status(400).json({ error: 'Cannot transfer to yourself' });
        }
        
        // Minimum transfer amount
        if (amount < 100) {
            return res.status(400).json({ error: 'Minimum transfer is 100 credits' });
        }
        
        // Get sender balance
        const senderBalanceDoc = await db.collection('user_balances').doc(fromUserId).get();
        if (!senderBalanceDoc.exists) {
            return res.status(404).json({ error: 'Sender balance not found' });
        }
        
        const senderBalance = senderBalanceDoc.data();
        const senderTotal = (parseFloat(senderBalance.wallet) || 0) + (parseFloat(senderBalance.bank) || 0);
        
        if (amount > senderTotal) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }
        
        // Get recipient balance
        const recipientBalanceDoc = await db.collection('user_balances').doc(toUserId).get();
        const recipientBalance = recipientBalanceDoc.exists ? recipientBalanceDoc.data() : { wallet: 1000, bank: 0, credits: 0 };
        
        // Process transfer (for now, just create transaction records)
        // In a real implementation, this would integrate with the Discord bot's economy system
        const timestamp = new Date();
        
        // Create sender transaction
        const senderTransaction = {
            userId: fromUserId,
            type: 'transfer_out',
            amount: -amount,
            recipientId: toUserId,
            status: 'completed',
            timestamp,
            description: `Transfer sent to recipient`
        };
        
        // Create recipient transaction
        const recipientTransaction = {
            userId: toUserId,
            type: 'transfer_in',
            amount: amount,
            senderId: fromUserId,
            status: 'completed',
            timestamp,
            description: `Transfer received from sender`
        };
        
        // Save both transactions
        await Promise.all([
            db.collection('transactions').add(senderTransaction),
            db.collection('transactions').add(recipientTransaction)
        ]);
        
        console.log(`✅ Transfer completed: ${amount} from ${fromUserId} to ${toUserId}`);
        
        res.json({ 
            success: true, 
            message: 'Transfer completed successfully',
            amount,
            recipientId: toUserId
        });
        
    } catch (error) {
        console.error('❌ Transfer error:', error);
        res.status(500).json({ error: 'Failed to process transfer' });
    }
});

// Leaderboard endpoints
app.get('/api/leaderboards/:type', async (req, res) => {
    try {
        const { type } = req.params;
        console.log(`📊 Getting leaderboard for type: ${type}`);
        
        const DEVELOPER_ID = '466050111680544798'; // Exclude developer from all leaderboards
        let leaderboard = [];
        
        switch (type) {
            case 'balance':
                // Get top users by total balance (wallet + bank)
                const balanceSnapshot = await db.collection('user_balances').limit(50).get();
                const balanceUsers = [];
                
                for (const doc of balanceSnapshot.docs) {
                    const data = doc.data();
                    const userId = doc.id;
                    const totalBalance = (parseFloat(data.wallet) || 0) + (parseFloat(data.bank) || 0);
                    
                    if (totalBalance > 0 && userId !== DEVELOPER_ID) {
                        // Get user profile data using our helper function
                        const { username, avatar } = await getUserProfileData(userId);
                        
                        balanceUsers.push({
                            userId,
                            username,
                            avatar,
                            value: totalBalance,
                            rank: 0
                        });
                    }
                }
                
                // Sort and rank
                balanceUsers.sort((a, b) => b.value - a.value);
                leaderboard = balanceUsers.slice(0, 10).map((user, index) => ({
                    ...user,
                    rank: index + 1
                }));
                break;
                
            case 'wins':
                // Get top users by total wins using aggregated stats
                const winsUsers = [];
                const statsSnapshot = await db.collection('user_stats').limit(100).get();
                const aggregatedWins = new Map();
                
                for (const doc of statsSnapshot.docs) {
                    const data = doc.data();
                    const userId = data.user_id;
                    
                    if (userId && data.game_type) {
                        // This is a per-game stat document
                        const wins = data.wins || 0;
                        if (!aggregatedWins.has(userId)) {
                            aggregatedWins.set(userId, 0);
                        }
                        aggregatedWins.set(userId, aggregatedWins.get(userId) + wins);
                    }
                }
                
                for (const [userId, totalWins] of aggregatedWins.entries()) {
                    if (totalWins > 0 && userId !== DEVELOPER_ID) {
                        // Get user profile data using our helper function
                        const { username, avatar } = await getUserProfileData(userId);
                        
                        winsUsers.push({
                            userId,
                            username,
                            avatar,
                            value: totalWins,
                            rank: 0
                        });
                    }
                }
                
                winsUsers.sort((a, b) => b.value - a.value);
                leaderboard = winsUsers.slice(0, 10).map((user, index) => ({
                    ...user,
                    rank: index + 1
                }));
                break;
                
            case 'winnings':
                // Get top users by total winnings
                const winningsUsers = [];
                const winningsSnapshot = await db.collection('user_stats').limit(100).get();
                const aggregatedWinnings = new Map();
                
                for (const doc of winningsSnapshot.docs) {
                    const data = doc.data();
                    const userId = data.user_id;
                    
                    if (userId && data.game_type) {
                        const won = data.total_won || 0;
                        if (!aggregatedWinnings.has(userId)) {
                            aggregatedWinnings.set(userId, 0);
                        }
                        aggregatedWinnings.set(userId, aggregatedWinnings.get(userId) + won);
                    }
                }
                
                for (const [userId, totalWinnings] of aggregatedWinnings.entries()) {
                    if (totalWinnings > 0 && userId !== DEVELOPER_ID) {
                        let username = `User${userId.slice(-4)}`;
                        let avatar = 'https://images.pexels.com/photos/1759531/pexels-photo-1759531.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500';
                        
                        // Try Discord API first
                        try {
                            const discordData = await getDiscordUserData(userId);
                            username = discordData.username;
                            avatar = discordData.avatar;
                        } catch (err) {
                            // Fallback to database
                            try {
                                const balanceDoc = await db.collection('user_balances').doc(userId).get();
                                if (balanceDoc.exists && balanceDoc.data().username) {
                                    username = balanceDoc.data().username;
                                }
                                
                                const userDoc = await db.collection('users').doc(userId).get();
                                if (userDoc.exists && userDoc.data()) {
                                    const userData = userDoc.data();
                                    if (userData.username) username = userData.username;
                                    if (userData.avatar) {
                                        avatar = userData.avatar.startsWith('https://') 
                                            ? userData.avatar 
                                            : `https://cdn.discordapp.com/avatars/${userId}/${userData.avatar}.png?size=64`;
                                    }
                                }
                            } catch (dbErr) {
                                console.log(`⚠️ Could not get user data for ${userId}, using fallback`);
                            }
                        }
                        
                        winningsUsers.push({
                            userId,
                            username,
                            avatar,
                            value: totalWinnings,
                            rank: 0
                        });
                    }
                }
                
                winningsUsers.sort((a, b) => b.value - a.value);
                leaderboard = winningsUsers.slice(0, 10).map((user, index) => ({
                    ...user,
                    rank: index + 1
                }));
                break;
                
            case 'games':
                // Get top users by total games played
                const gamesUsers = [];
                const gamesSnapshot = await db.collection('user_stats').limit(100).get();
                const aggregatedGames = new Map();
                
                for (const doc of gamesSnapshot.docs) {
                    const data = doc.data();
                    const userId = data.user_id;
                    
                    if (userId && data.game_type) {
                        const wins = data.wins || 0;
                        const losses = data.losses || 0;
                        const totalGames = wins + losses;
                        
                        if (!aggregatedGames.has(userId)) {
                            aggregatedGames.set(userId, 0);
                        }
                        aggregatedGames.set(userId, aggregatedGames.get(userId) + totalGames);
                    }
                }
                
                for (const [userId, totalGames] of aggregatedGames.entries()) {
                    if (totalGames > 0 && userId !== DEVELOPER_ID) {
                        let username = `User${userId.slice(-4)}`;
                        let avatar = 'https://images.pexels.com/photos/1759531/pexels-photo-1759531.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500';
                        
                        // Try Discord API first
                        try {
                            const discordData = await getDiscordUserData(userId);
                            username = discordData.username;
                            avatar = discordData.avatar;
                        } catch (err) {
                            // Fallback to database
                            try {
                                const balanceDoc = await db.collection('user_balances').doc(userId).get();
                                if (balanceDoc.exists && balanceDoc.data().username) {
                                    username = balanceDoc.data().username;
                                }
                                
                                const userDoc = await db.collection('users').doc(userId).get();
                                if (userDoc.exists && userDoc.data()) {
                                    const userData = userDoc.data();
                                    if (userData.username) username = userData.username;
                                    if (userData.avatar) {
                                        avatar = userData.avatar.startsWith('https://') 
                                            ? userData.avatar 
                                            : `https://cdn.discordapp.com/avatars/${userId}/${userData.avatar}.png?size=64`;
                                    }
                                }
                            } catch (dbErr) {
                                console.log(`⚠️ Could not get user data for ${userId}, using fallback`);
                            }
                        }
                        
                        gamesUsers.push({
                            userId,
                            username,
                            avatar,
                            value: totalGames,
                            rank: 0
                        });
                    }
                }
                
                gamesUsers.sort((a, b) => b.value - a.value);
                leaderboard = gamesUsers.slice(0, 10).map((user, index) => ({
                    ...user,
                    rank: index + 1
                }));
                break;
                
            case 'winrate':
                // Get top users by win rate (only include users with at least 10 games)
                const winrateUsers = [];
                const winrateSnapshot = await db.collection('user_stats').limit(100).get();
                const userWinrates = new Map();
                
                for (const doc of winrateSnapshot.docs) {
                    const data = doc.data();
                    const userId = data.user_id;
                    
                    if (userId && data.game_type) {
                        const wins = data.wins || 0;
                        const losses = data.losses || 0;
                        const totalGames = wins + losses;
                        
                        if (!userWinrates.has(userId)) {
                            userWinrates.set(userId, { wins: 0, losses: 0 });
                        }
                        const current = userWinrates.get(userId);
                        current.wins += wins;
                        current.losses += losses;
                    }
                }
                
                for (const [userId, stats] of userWinrates.entries()) {
                    const totalGames = stats.wins + stats.losses;
                    if (totalGames >= 10 && userId !== DEVELOPER_ID) {
                        const winRate = stats.wins / totalGames;
                        let username = `User${userId.slice(-4)}`;
                        let avatar = 'https://images.pexels.com/photos/1759531/pexels-photo-1759531.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500';
                        
                        // Try Discord API first
                        try {
                            const discordData = await getDiscordUserData(userId);
                            username = discordData.username;
                            avatar = discordData.avatar;
                        } catch (err) {
                            // Fallback to database
                            try {
                                const balanceDoc = await db.collection('user_balances').doc(userId).get();
                                if (balanceDoc.exists && balanceDoc.data().username) {
                                    username = balanceDoc.data().username;
                                }
                                
                                const userDoc = await db.collection('users').doc(userId).get();
                                if (userDoc.exists && userDoc.data()) {
                                    const userData = userDoc.data();
                                    if (userData.username) username = userData.username;
                                    if (userData.avatar) {
                                        avatar = userData.avatar.startsWith('https://') 
                                            ? userData.avatar 
                                            : `https://cdn.discordapp.com/avatars/${userId}/${userData.avatar}.png?size=64`;
                                    }
                                }
                            } catch (dbErr) {
                                console.log(`⚠️ Could not get user data for ${userId}, using fallback`);
                            }
                        }
                        
                        winrateUsers.push({
                            userId,
                            username,
                            avatar,
                            value: winRate,
                            rank: 0
                        });
                    }
                }
                
                winrateUsers.sort((a, b) => b.value - a.value);
                leaderboard = winrateUsers.slice(0, 10).map((user, index) => ({
                    ...user,
                    rank: index + 1
                }));
                break;
                
            default:
                return res.status(400).json({ error: 'Invalid leaderboard type' });
        }

        console.log(`📈 Leaderboard ${type} has ${leaderboard.length} entries`);
        res.json(leaderboard);
    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({ error: 'Failed to get leaderboard' });
    }
});

// Shop endpoints
app.get('/api/shop/items', async (req, res) => {
    try {
        const { userId } = req.query; // Optional userId to filter purchased items
        
        // Get current economy rates for dynamic pricing
        const economyResponse = await fetch(`http://localhost:${PORT}/api/economy/rates`);
        const economyData = await economyResponse.json();

        // Get user's purchase history if userId provided
        let userPurchasedItems = [];
        if (userId) {
            try {
                const purchasesSnapshot = await db.collection('shop_purchases')
                    .where('userId', '==', userId)
                    .get();
                
                userPurchasedItems = purchasesSnapshot.docs.map(doc => doc.data().itemId);
            } catch (error) {
                console.warn('Error fetching user purchases:', error);
            }
        }
        
        const baseShopItems = [
        // Passive Income Items
        {
            id: 'slot_machine',
            name: '🎰 Personal Slot Machine',
            description: 'Generates 50-200 coins every hour automatically',
            price: 15000,
            category: 'boosts',
            tier: 'common',
            iconUrl: '/images/products/Casino.png',
            isActive: true,
            benefits: ['Passive income: 50-200 coins/hour', 'Works while offline'],
            duration: null, // Permanent
            passiveIncome: { min: 50, max: 200, interval: 3600 } // hourly in seconds
        },
        {
            id: 'lucky_charm',
            name: '🍀 Lucky Charm',
            description: 'Increases win rate by 5% for all games',
            price: 25000,
            category: 'boosts',
            tier: 'uncommon',
            iconUrl: '/images/products/LUCKY WIN.png',
            isActive: true,
            benefits: ['+5% win rate in all games', 'Stacks with other bonuses'],
            duration: null, // Permanent
            gameBonus: { winRateBonus: 0.05 }
        },
        {
            id: 'coin_magnet',
            name: '🧲 Coin Magnet',
            description: 'Attracts 10% more coins from all winnings',
            price: 30000,
            category: 'boosts',
            tier: 'rare',
            iconUrl: '/images/products/coins.png',
            isActive: true,
            benefits: ['+10% bonus coins on all wins', 'Applies to all games'],
            duration: null, // Permanent
            gameBonus: { winningMultiplier: 1.10 }
        },
        {
            id: 'casino_royale',
            name: '👑 Casino Royale Membership',
            description: 'Exclusive VIP status with premium benefits',
            price: 100000,
            category: 'premium',
            tier: 'legendary',
            iconUrl: '/images/products/gold.png',
            isActive: true,
            benefits: ['VIP status badge', '+15% all winnings', 'Exclusive VIP games', 'Daily bonus: 1000 coins'],
            duration: null, // Permanent
            gameBonus: { winningMultiplier: 1.15 },
            dailyBonus: 1000,
            requiresTier: 'legendary'
        },
        
        // Temporary Boosts
        {
            id: 'double_xp_24h',
            name: '⚡ Double XP Boost',
            description: 'Double experience points for 24 hours',
            price: 2500,
            category: 'boosts',
            tier: 'common',
            iconUrl: '/images/products/2xp.png',
            isActive: true,
            benefits: ['2x XP gain', 'Level up faster'],
            duration: 24 // hours
        },
        {
            id: 'lucky_streak_12h',
            name: '🌟 Lucky Streak',
            description: 'Increased win chance for 12 hours',
            price: 5000,
            category: 'boosts',
            tier: 'uncommon',
            iconUrl: '/images/products/boost.png',
            isActive: true,
            benefits: ['+10% win rate', 'Better luck in games'],
            duration: 12 // hours
        },
        
        // Cosmetic Items
        {
            id: 'golden_badge',
            name: '🥇 Golden Winner Badge',
            description: 'Show off your success with a golden badge',
            price: 8000,
            category: 'cosmetics',
            tier: 'common',
            iconUrl: '/images/products/gold.png',
            isActive: true,
            benefits: ['Golden profile badge', 'Prestige display'],
            duration: null // Permanent
        },
        {
            id: 'diamond_crown',
            name: '💎 Diamond Crown',
            description: 'Ultimate symbol of casino mastery',
            price: 50000,
            category: 'cosmetics',
            tier: 'epic',
            iconUrl: '/images/products/diamonds.png',
            isActive: true,
            benefits: ['Diamond crown badge', 'Special chat effects', 'Exclusive title: "Casino Master"'],
            duration: null, // Permanent
            requiresTier: 'epic'
        },
        
        // Advanced Items
        {
            id: 'profit_calculator',
            name: '📊 Profit Calculator',
            description: 'Advanced statistics and profit tracking',
            price: 12000,
            category: 'premium',
            tier: 'rare',
            iconUrl: '/images/products/boost.png',
            isActive: true,
            benefits: ['Detailed profit analytics', 'Win/loss tracking', 'Performance insights'],
            duration: null // Permanent
        },
        {
            id: 'auto_investor',
            name: '🤖 Auto Investor',
            description: 'Automatically invests idle coins for passive growth',
            price: 75000,
            category: 'premium',
            tier: 'epic',
            iconUrl: '/images/products/coins.png',
            isActive: true,
            benefits: ['Auto-invests idle coins', '2-5% daily returns', 'Compound interest'],
            duration: null, // Permanent
            passiveIncome: { min: 0.02, max: 0.05, interval: 86400, type: 'percentage' }, // daily percentage
            requiresTier: 'epic'
        },
        
        // Legendary Items
        {
            id: 'midas_touch',
            name: '✨ Midas Touch',
            description: 'Everything you touch turns to gold - massive win multiplier',
            price: 250000,
            category: 'premium',
            tier: 'legendary',
            iconUrl: '/images/products/gold.png',
            isActive: true,
            benefits: ['+25% all winnings', 'Golden particle effects', 'Legendary status'],
            duration: null, // Permanent
            gameBonus: { winningMultiplier: 1.25 },
            requiresTier: 'legendary'
        }
    ];
    
    // Filter out purchased one-time items for specific users
    const filteredShopItems = baseShopItems.filter(item => {
        // If no userId provided, show all items
        if (!userId) return true;
        
        // If item is permanent (duration: null), always show it
        if (item.duration === null) return true;
        
        // If item is temporary and user hasn't purchased it, show it
        return !userPurchasedItems.includes(item.id);
    });
    
    // Apply dynamic pricing based on economy and tier
    const dynamicShopItems = filteredShopItems.map(item => {
        // Map tier names to economy tier multipliers
        const tierMappings = {
            'common': 'bronze',
            'uncommon': 'silver', 
            'rare': 'gold',
            'epic': 'platinum',
            'legendary': 'diamond'
        };
        
        const economyTier = tierMappings[item.tier] || 'bronze';
        const tierMultiplier = economyData.tierMultipliers[economyTier] || 1.0;
        
        // Calculate dynamic price based on:
        // 1. Base price
        // 2. Tier multiplier
        // 3. Economy health (if economy is struggling, make items cheaper)
        let priceMultiplier = tierMultiplier;
        
        if (economyData.economyHealth.status === 'growing') {
            priceMultiplier *= 0.8; // 20% discount for growing economies
        } else if (economyData.economyHealth.status === 'healthy') {
            priceMultiplier *= 1.1; // 10% premium for healthy economies
        }
        
        const dynamicPrice = Math.floor(item.price * priceMultiplier);
        
        return {
            ...item,
            originalPrice: item.price,
            price: dynamicPrice,
            priceType: 'credits', // Items now cost credits instead of coins
            tier: item.tier,
            economyTier: economyTier,
            priceMultiplier: priceMultiplier.toFixed(2),
            economyStatus: economyData.economyHealth.status
        };
    });
    
    // Add economy information to response
    const response = {
        items: dynamicShopItems,
        economy: {
            coinToCreditRate: economyData.coinToCreditRate,
            economyHealth: economyData.economyHealth,
            lastUpdated: economyData.lastUpdated
        }
    };
    
    console.log(`🛒 Shop items with dynamic pricing:`, response);
    res.json(response);
    
    } catch (error) {
        console.error('Shop items error:', error);
        res.status(500).json({ error: 'Failed to get shop items' });
    }
});

// Get user's purchased items
app.get('/api/users/:id/items', async (req, res) => {
    try {
        const userId = req.params.id;

        // Get user's purchase history
        const purchasesSnapshot = await db.collection('shop_purchases')
            .where('userId', '==', userId)
            .orderBy('timestamp', 'desc')
            .get();

        if (purchasesSnapshot.empty) {
            return res.json([]);
        }

        const userItems = [];
        for (const doc of purchasesSnapshot.docs) {
            const purchase = doc.data();
            const item = getItemDetails(purchase.itemId);
            
            if (item) {
                const isActive = isItemActive(purchase, item);
                const expiresAt = getExpirationDate(purchase, item);
                const progress = await getItemProgress(userId, purchase.itemId, item);

                userItems.push({
                    id: purchase.itemId,
                    name: item.name,
                    description: item.description,
                    category: item.category,
                    iconUrl: item.iconUrl || null,
                    purchaseDate: purchase.timestamp.toDate(),
                    isActive,
                    expiresAt,
                    progress
                });
            }
        }

        res.json(userItems);

    } catch (error) {
        console.error('Get user items error:', error);
        res.status(500).json({ error: 'Failed to get user items' });
    }
});

// Helper functions for user items
function getItemDetails(itemId) {
    const itemsMap = {
        'slot_machine': {
            name: '🎰 Personal Slot Machine',
            description: 'Generates 50-200 coins every hour automatically',
            category: 'boosts',
            duration: null,
            iconUrl: '/images/products/Casino.png',
            passiveIncome: { min: 50, max: 200, interval: 3600 }
        },
        'lucky_charm': {
            name: '🍀 Lucky Charm',
            description: 'Increases win rate by 5% for all games',
            category: 'boosts',
            duration: null,
            iconUrl: '/images/products/LUCKY WIN.png',
            gameBonus: { winRateBonus: 0.05 }
        },
        'coin_magnet': {
            name: '🧲 Coin Magnet',
            description: 'Attracts 10% more coins from all winnings',
            category: 'boosts',
            duration: null,
            iconUrl: '/images/products/coins.png',
            gameBonus: { winningMultiplier: 1.10 }
        },
        'casino_royale': {
            name: '👑 Casino Royale Membership',
            description: 'Exclusive VIP status with premium benefits',
            category: 'premium',
            duration: null,
            iconUrl: '/images/products/gold.png',
            gameBonus: { winningMultiplier: 1.15 },
            dailyBonus: 1000
        },
        'double_xp_24h': {
            name: '⚡ Double XP Boost',
            description: 'Double experience points for 24 hours',
            category: 'boosts',
            duration: 24,
            iconUrl: '/images/products/2xp.png'
        },
        'lucky_streak_12h': {
            name: '🌟 Lucky Streak',
            description: 'Increased win chance for 12 hours',
            category: 'boosts',
            duration: 12,
            iconUrl: '/images/products/boost.png'
        },
        'golden_badge': {
            name: '🥇 Golden Winner Badge',
            description: 'Show off your success with a golden badge',
            category: 'cosmetics',
            duration: null,
            iconUrl: '/images/products/gold.png'
        },
        'diamond_crown': {
            name: '💎 Diamond Crown',
            description: 'Ultimate symbol of casino mastery',
            category: 'cosmetics',
            duration: null,
            iconUrl: '/images/products/diamonds.png'
        },
        'profit_calculator': {
            name: '📊 Profit Calculator',
            description: 'Advanced statistics and profit tracking',
            category: 'premium',
            duration: null,
            iconUrl: '/images/products/boost.png'
        },
        'auto_investor': {
            name: '🤖 Auto Investor',
            description: 'Automatically invests idle coins for passive growth',
            category: 'premium',
            duration: null,
            iconUrl: '/images/products/coins.png',
            passiveIncome: { min: 0.02, max: 0.05, interval: 86400, type: 'percentage' }
        },
        'midas_touch': {
            name: '✨ Midas Touch',
            description: 'Everything you touch turns to gold - massive win multiplier',
            category: 'premium',
            duration: null,
            iconUrl: '/images/products/gold.png',
            gameBonus: { winningMultiplier: 1.25 }
        }
    };

    return itemsMap[itemId] || null;
}

function isItemActive(purchase, item) {
    if (item.duration === null) return true; // Permanent items are always active
    
    const purchaseTime = purchase.timestamp.toDate();
    const expirationTime = new Date(purchaseTime.getTime() + (item.duration * 60 * 60 * 1000));
    
    return new Date() < expirationTime;
}

function getExpirationDate(purchase, item) {
    if (item.duration === null) return null;
    
    const purchaseTime = purchase.timestamp.toDate();
    return new Date(purchaseTime.getTime() + (item.duration * 60 * 60 * 1000));
}

async function getItemProgress(userId, itemId, item) {
    try {
        if (item.passiveIncome) {
            // For passive income items, check earnings
            const earningsSnapshot = await db.collection('passive_earnings')
                .where('userId', '==', userId)
                .where('itemId', '==', itemId)
                .get();

            let totalEarned = 0;
            earningsSnapshot.docs.forEach(doc => {
                totalEarned += doc.data().amount || 0;
            });

            return { totalEarned };
        }

        return { totalEarned: 0 };
    } catch (error) {
        console.error(`Error getting item progress for ${userId}: ${error.message}`);
        return { totalEarned: 0 };
    }
}

// Payment endpoints
app.post('/api/payments/deposit', async (req, res) => {
    try {
        const { userId, amount, paymentMethod } = req.body;
        
        if (!userId || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid deposit request' });
        }
        
        console.log(`💰 Processing deposit: ${amount} for user ${userId}`);
        
        // Get current balance
        const balanceDoc = await db.collection('user_balances').doc(userId).get();
        const currentBalance = balanceDoc.exists ? balanceDoc.data() : { wallet: 1000, bank: 0 };
        
        // Add to wallet
        const newWalletBalance = (parseFloat(currentBalance.wallet) || 0) + parseFloat(amount);
        
        // Update balance
        await db.collection('user_balances').doc(userId).set({
            wallet: newWalletBalance,
            bank: parseFloat(currentBalance.bank) || 0,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        // Create transaction record
        const transactionId = `dep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.collection('transactions').doc(transactionId).set({
            id: transactionId,
            userId,
            type: 'deposit',
            amount: parseFloat(amount),
            description: `Deposit via ${paymentMethod || 'wallet'}`,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'completed',
            paymentMethod: paymentMethod || 'wallet'
        });
        
        console.log(`✅ Deposit successful: ${amount} added to ${userId}`);
        
        res.json({ 
            success: true, 
            message: 'Deposit successful',
            newBalance: newWalletBalance,
            transactionId
        });
    } catch (error) {
        console.error('Deposit error:', error);
        res.status(500).json({ error: 'Deposit failed' });
    }
});

app.post('/api/payments/withdraw', async (req, res) => {
    try {
        const { userId, amount, withdrawMethod } = req.body;
        
        if (!userId || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid withdrawal request' });
        }
        
        console.log(`💸 Processing withdrawal: ${amount} for user ${userId}`);
        
        // Get current balance
        const balanceDoc = await db.collection('user_balances').doc(userId).get();
        const currentBalance = balanceDoc.exists ? balanceDoc.data() : { wallet: 0, bank: 0 };
        
        const totalBalance = (parseFloat(currentBalance.wallet) || 0) + (parseFloat(currentBalance.bank) || 0);
        
        if (totalBalance < amount) {
            return res.status(400).json({ error: 'Insufficient funds' });
        }
        
        // Withdraw from wallet first, then bank
        let walletBalance = parseFloat(currentBalance.wallet) || 0;
        let bankBalance = parseFloat(currentBalance.bank) || 0;
        let remainingAmount = parseFloat(amount);
        
        if (walletBalance >= remainingAmount) {
            walletBalance -= remainingAmount;
        } else {
            remainingAmount -= walletBalance;
            walletBalance = 0;
            bankBalance -= remainingAmount;
        }
        
        // Update balance
        await db.collection('user_balances').doc(userId).set({
            wallet: walletBalance,
            bank: bankBalance,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        // Create transaction record
        const transactionId = `wth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.collection('transactions').doc(transactionId).set({
            id: transactionId,
            userId,
            type: 'withdrawal',
            amount: -parseFloat(amount),
            description: `Withdrawal via ${withdrawMethod || 'wallet'}`,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'completed',
            withdrawMethod: withdrawMethod || 'wallet'
        });
        
        console.log(`✅ Withdrawal successful: ${amount} withdrawn from ${userId}`);
        
        res.json({ 
            success: true, 
            message: 'Withdrawal successful',
            newBalance: walletBalance + bankBalance,
            transactionId
        });
    } catch (error) {
        console.error('Withdrawal error:', error);
        res.status(500).json({ error: 'Withdrawal failed' });
    }
});

// Transfer functionality
app.post('/api/payments/transfer', async (req, res) => {
    try {
        const { fromUserId, toUserId, amount, message } = req.body;
        
        if (!fromUserId || !toUserId || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid transfer request' });
        }
        
        if (fromUserId === toUserId) {
            return res.status(400).json({ error: 'Cannot transfer to yourself' });
        }
        
        console.log(`💸 Processing transfer: ${amount} from ${fromUserId} to ${toUserId}`);
        
        // Run transfer as a transaction
        await db.runTransaction(async (transaction) => {
            // Get sender balance
            const senderDoc = await transaction.get(db.collection('user_balances').doc(fromUserId));
            const senderBalance = senderDoc.exists ? senderDoc.data() : { wallet: 0, bank: 0 };
            
            const senderTotal = (parseFloat(senderBalance.wallet) || 0) + (parseFloat(senderBalance.bank) || 0);
            
            if (senderTotal < amount) {
                throw new Error('Insufficient funds');
            }
            
            // Get receiver balance
            const receiverDoc = await transaction.get(db.collection('user_balances').doc(toUserId));
            const receiverBalance = receiverDoc.exists ? receiverDoc.data() : { wallet: 1000, bank: 0 };
            
            // Deduct from sender (wallet first, then bank)
            let senderWallet = parseFloat(senderBalance.wallet) || 0;
            let senderBank = parseFloat(senderBalance.bank) || 0;
            let remainingAmount = parseFloat(amount);
            
            if (senderWallet >= remainingAmount) {
                senderWallet -= remainingAmount;
            } else {
                remainingAmount -= senderWallet;
                senderWallet = 0;
                senderBank -= remainingAmount;
            }
            
            // Add to receiver wallet
            const receiverWallet = (parseFloat(receiverBalance.wallet) || 0) + parseFloat(amount);
            
            // Update both balances
            transaction.set(db.collection('user_balances').doc(fromUserId), {
                wallet: senderWallet,
                bank: senderBank,
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            transaction.set(db.collection('user_balances').doc(toUserId), {
                wallet: receiverWallet,
                bank: parseFloat(receiverBalance.bank) || 0,
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            // Create transaction records
            const transactionId = `tfr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Sender transaction (outgoing)
            transaction.set(db.collection('transactions').doc(`${transactionId}_out`), {
                id: `${transactionId}_out`,
                userId: fromUserId,
                type: 'transfer',
                amount: -parseFloat(amount),
                description: message ? `Transfer to ${toUserId}: ${message}` : `Transfer to ${toUserId}`,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                status: 'completed',
                relatedUserId: toUserId
            });
            
            // Receiver transaction (incoming)
            transaction.set(db.collection('transactions').doc(`${transactionId}_in`), {
                id: `${transactionId}_in`,
                userId: toUserId,
                type: 'transfer',
                amount: parseFloat(amount),
                description: message ? `Transfer from ${fromUserId}: ${message}` : `Transfer from ${fromUserId}`,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                status: 'completed',
                relatedUserId: fromUserId
            });
        });
        
        console.log(`✅ Transfer successful: ${amount} from ${fromUserId} to ${toUserId}`);
        
        res.json({ 
            success: true, 
            message: 'Transfer successful'
        });
    } catch (error) {
        console.error('Transfer error:', error);
        if (error.message === 'Insufficient funds') {
            res.status(400).json({ error: 'Insufficient funds' });
        } else {
            res.status(500).json({ error: 'Transfer failed' });
        }
    }
});

// Shop purchase endpoint
app.post('/api/shop/purchase', async (req, res) => {
    try {
        const { userId, itemId } = req.body;
        
        console.log(`🛒 Processing purchase: User ${userId} buying item ${itemId}`);
        
        // Validate request
        if (!userId || !itemId) {
            return res.status(400).json({ error: 'Missing userId or itemId' });
        }
        
        // Get shop items to find the item and its price
        const economyResponse = await fetch(`http://localhost:${PORT}/api/economy/rates`);
        const economyData = await economyResponse.json();
        
        // Get shop items (same logic as the shop items endpoint)
        const baseShopItems = [
            {
                id: 'slot_machine',
                name: '🎰 Personal Slot Machine',
                price: 15000,
                category: 'boosts',
                tier: 'common',
                benefits: ['Passive income: 50-200 coins/hour', 'Works while offline'],
            },
            {
                id: 'lucky_charm',
                name: '🍀 Lucky Charm',
                price: 25000,
                category: 'boosts',
                tier: 'uncommon',
                benefits: ['+5% win rate in all games', 'Stacks with other bonuses'],
            },
            {
                id: 'coin_magnet',
                name: '🧲 Coin Magnet',
                price: 30000,
                category: 'boosts',
                tier: 'rare',
                benefits: ['+10% bonus coins on all wins', 'Applies to all games'],
            },
            {
                id: 'casino_royale',
                name: '👑 Casino Royale Membership',
                price: 100000,
                category: 'premium',
                tier: 'legendary',
                benefits: ['VIP status badge', '+15% all winnings', 'Exclusive VIP games', 'Daily bonus: 1000 coins'],
            },
            {
                id: 'double_xp_24h',
                name: '⚡ Double XP Boost',
                price: 2500,
                category: 'boosts',
                tier: 'common',
                benefits: ['2x XP gain', 'Level up faster'],
            },
            {
                id: 'lucky_streak_12h',
                name: '🌟 Lucky Streak',
                price: 5000,
                category: 'boosts',
                tier: 'uncommon',
                benefits: ['+10% win rate', 'Better luck in games'],
            },
            {
                id: 'golden_badge',
                name: '🥇 Golden Winner Badge',
                price: 8000,
                category: 'cosmetics',
                tier: 'common',
                benefits: ['Golden profile badge', 'Prestige display'],
            },
            {
                id: 'diamond_crown',
                name: '💎 Diamond Crown',
                price: 50000,
                category: 'cosmetics',
                tier: 'epic',
                benefits: ['Diamond crown badge', 'Special chat effects', 'Exclusive title: "Casino Master"'],
            }
        ];
        
        const item = baseShopItems.find(item => item.id === itemId);
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        // Apply dynamic pricing
        const tierMultipliers = economyData.tierMultipliers || { bronze: 1, silver: 1.5, gold: 2.5, platinum: 4, diamond: 6, legendary: 10 };
        const economyMultiplier = 1.1; // Base healthy economy multiplier
        
        let tierMultiplier = 1;
        switch (item.tier) {
            case 'common': tierMultiplier = tierMultipliers.bronze; break;
            case 'uncommon': tierMultiplier = tierMultipliers.silver; break;
            case 'rare': tierMultiplier = tierMultipliers.gold; break;
            case 'epic': tierMultiplier = tierMultipliers.platinum; break;
            case 'legendary': tierMultiplier = tierMultipliers.diamond; break;
        }
        
        const finalPrice = Math.floor(item.price * tierMultiplier * economyMultiplier);
        
        // Get user balance
        const balanceDoc = await db.collection('user_balances').doc(userId).get();
        if (!balanceDoc.exists) {
            return res.status(404).json({ error: 'User balance not found' });
        }
        
        const balance = balanceDoc.data();
        const userCredits = parseFloat(balance.credits) || 0;
        
        if (userCredits < finalPrice) {
            return res.status(400).json({ error: 'Insufficient credits' });
        }
        
        // Process purchase (create transaction record)
        const transaction = {
            userId: userId,
            type: 'purchase',
            amount: -finalPrice,
            itemId: itemId,
            itemName: item.name,
            status: 'completed',
            timestamp: new Date(),
            description: `Purchased ${item.name}`
        };
        
        // Create purchase record
        await db.collection('shop_purchases').add({
            userId: userId,
            itemId: itemId,
            itemName: item.name,
            price: finalPrice,
            timestamp: new Date(),
            status: 'completed'
        });
        
        // Create transaction record
        await db.collection('transactions').add(transaction);
        
        console.log(`✅ Purchase completed: User ${userId} bought ${item.name} for ${finalPrice} credits`);
        
        res.json({ 
            success: true, 
            message: 'Purchase completed successfully',
            item: {
                id: item.id,
                name: item.name,
                price: finalPrice
            },
            transaction
        });
        
    } catch (error) {
        console.error('❌ Purchase error:', error);
        res.status(500).json({ error: 'Failed to process purchase' });
    }
});

// User search endpoint for transfer functionality (must be before parameterized routes)

// Get server members for transfer functionality
app.get('/api/server-members/:guildId?', async (req, res) => {
    try {
        // Since we can't actually get Discord server members from the web API,
        // we'll return users from our database who have been active
        const usersSnapshot = await db.collection('users').limit(50).get();
        const members = [];
        
        for (const doc of usersSnapshot.docs) {
            const data = doc.data();
            members.push({
                id: doc.id,
                username: data.username || `User${doc.id.slice(-4)}`,
                discriminator: data.discriminator || '0000',
                avatar: data.avatar 
                    ? `https://cdn.discordapp.com/avatars/${doc.id}/${data.avatar}.png?size=32`
                    : 'https://images.pexels.com/photos/1759531/pexels-photo-1759531.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500',
                displayName: data.username || `User${doc.id.slice(-4)}`
            });
        }
        
        // Sort by username
        members.sort((a, b) => a.username.localeCompare(b.username));
        
        res.json(members);
    } catch (error) {
        console.error('Get server members error:', error);
        res.status(500).json({ error: 'Failed to get server members' });
    }
});

// Economy rates endpoint
app.get('/api/economy/rates', async (req, res) => {
    try {
        // Get total server economy stats to influence rates
        const totalBalanceSnapshot = await db.collection('user_balances').get();
        
        let totalCoinsInCirculation = 0;
        let activeUsers = 0;
        
        totalBalanceSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const balance = (parseFloat(data.wallet) || 0) + (parseFloat(data.bank) || 0);
            if (balance > 0) {
                totalCoinsInCirculation += balance;
                activeUsers++;
            }
        });

        // Base conversion rate (1 coin = X credits)
        let baseRate = 0.01; // 1 coin = 0.01 credits initially
        
        // Dynamic rate based on economy health
        const averageBalance = activeUsers > 0 ? totalCoinsInCirculation / activeUsers : 0;
        
        // If average balance is high, credits become more expensive (deflation)
        if (averageBalance > 10000000) { // 10M+ average
            baseRate = 0.005; // Credits are more expensive
        } else if (averageBalance > 1000000) { // 1M+ average
            baseRate = 0.008;
        } else if (averageBalance < 100000) { // Less than 100K average
            baseRate = 0.015; // Credits are cheaper to stimulate economy
        }

        // Get current shop activity to adjust rates
        const shopSnapshot = await db.collection('shop_purchases').orderBy('timestamp', 'desc').limit(50).get();
        const recentPurchases = shopSnapshot.size;
        
        // If lots of recent purchases, slightly increase credit cost
        if (recentPurchases > 30) {
            baseRate *= 0.9; // 10% more expensive
        } else if (recentPurchases < 5) {
            baseRate *= 1.1; // 10% cheaper
        }

        // Calculate shop item pricing multipliers based on tier rarity
        const tierMultipliers = {
            bronze: 1.0,      // Base pricing
            silver: 1.5,      // 50% more expensive  
            gold: 2.5,        // 150% more expensive
            platinum: 4.0,    // 300% more expensive
            diamond: 6.0,     // 500% more expensive
            legendary: 10.0   // 900% more expensive
        };

        const economyData = {
            coinToCreditRate: baseRate,
            creditToCoinRate: 1 / baseRate,
            totalCoinsInCirculation,
            activeUsers,
            averageBalance,
            recentShopActivity: recentPurchases,
            tierMultipliers,
            lastUpdated: new Date().toISOString(),
            economyHealth: {
                status: averageBalance > 1000000 ? 'healthy' : averageBalance > 100000 ? 'moderate' : 'growing',
                inflation: baseRate < 0.008 ? 'high' : baseRate > 0.012 ? 'low' : 'stable'
            }
        };

        console.log('📊 Economy rates calculated:', economyData);
        res.json(economyData);
        
    } catch (error) {
        console.error('Economy rates error:', error);
        res.status(500).json({ error: 'Failed to get economy rates' });
    }
});

// Coin to credit conversion endpoint
app.post('/api/economy/convert', async (req, res) => {
    try {
        const { userId, amount, fromCurrency, toCurrency } = req.body;

        if (!userId || !amount || !fromCurrency || !toCurrency) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Get current rates
        const ratesResponse = await fetch(`http://localhost:${PORT}/api/economy/rates`);
        const rates = await ratesResponse.json();

        // Get user balance
        const userDoc = await db.collection('user_balances').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userData = userDoc.data();
        const currentCoins = (parseFloat(userData.wallet) || 0) + (parseFloat(userData.bank) || 0);
        const currentCredits = parseFloat(userData.credits) || 0;

        let conversionResult = {};

        if (fromCurrency === 'coins' && toCurrency === 'credits') {
            // Converting coins to credits
            if (currentCoins < amount) {
                return res.status(400).json({ error: 'Insufficient coins' });
            }

            const creditsReceived = Math.floor(amount * rates.coinToCreditRate);
            const newCoins = currentCoins - amount;
            const newCredits = currentCredits + creditsReceived;

            // Update database
            await db.collection('user_balances').doc(userId).update({
                wallet: Math.max(0, (parseFloat(userData.wallet) || 0) - Math.min(amount, parseFloat(userData.wallet) || 0)),
                bank: Math.max(0, (parseFloat(userData.bank) || 0) - Math.max(0, amount - (parseFloat(userData.wallet) || 0))),
                credits: newCredits
            });

            // Log transaction
            const transaction = {
                userId,
                type: 'conversion',
                description: `Converted ${amount.toLocaleString()} coins to ${creditsReceived} credits`,
                amount: -amount, // Negative for coins lost
                creditChange: creditsReceived,
                timestamp: new Date(),
                conversionRate: rates.coinToCreditRate
            };

            await db.collection('transactions').add(transaction);

            conversionResult = {
                success: true,
                fromAmount: amount,
                toAmount: creditsReceived,
                newBalance: { coins: newCoins, credits: newCredits },
                rate: rates.coinToCreditRate
            };

        } else if (fromCurrency === 'credits' && toCurrency === 'coins') {
            // Converting credits to coins  
            if (currentCredits < amount) {
                return res.status(400).json({ error: 'Insufficient credits' });
            }

            const coinsReceived = Math.floor(amount * rates.creditToCoinRate);
            const newCredits = currentCredits - amount;
            const newCoins = currentCoins + coinsReceived;

            // Update database - add to wallet
            await db.collection('user_balances').doc(userId).update({
                wallet: (parseFloat(userData.wallet) || 0) + coinsReceived,
                credits: newCredits
            });

            // Log transaction
            const transaction = {
                userId,
                type: 'conversion',
                description: `Converted ${amount} credits to ${coinsReceived.toLocaleString()} coins`,
                amount: coinsReceived, // Positive for coins gained
                creditChange: -amount,
                timestamp: new Date(),
                conversionRate: rates.creditToCoinRate
            };

            await db.collection('transactions').add(transaction);

            conversionResult = {
                success: true,
                fromAmount: amount,
                toAmount: coinsReceived,
                newBalance: { coins: newCoins, credits: newCredits },
                rate: rates.creditToCoinRate
            };
        } else {
            return res.status(400).json({ error: 'Invalid currency conversion' });
        }

        console.log('💱 Conversion completed:', conversionResult);
        res.json(conversionResult);

    } catch (error) {
        console.error('Conversion error:', error);
        res.status(500).json({ error: 'Conversion failed' });
    }
});

// Casino Coins Purchase Endpoint
app.post('/api/payments/coins/purchase', async (req, res) => {
    try {
        const { userId, coins, amountPaid, paymentId, transactionId } = req.body;

        if (!userId || !coins || !amountPaid || !paymentId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Check if user is a server booster for discount
        const isBooster = await checkBoosterStatus(userId);
        let finalCoins = coins;
        let discountApplied = false;
        
        if (isBooster) {
            // Apply 5% bonus coins for server boosters
            finalCoins = Math.round(coins * 1.05);
            discountApplied = true;
        }

        // Get user's current balance
        const userBalanceDoc = await db.collection('user_balances').doc(userId).get();
        const userData = userBalanceDoc.exists ? userBalanceDoc.data() : {};
        const currentWallet = parseFloat(userData.wallet) || 0;

        // Update user's wallet with purchased coins (including booster bonus)
        const newWallet = currentWallet + finalCoins;
        await db.collection('user_balances').doc(userId).update({
            wallet: newWallet
        });

        // Create transaction record
        const transaction = {
            userId,
            type: 'coin_purchase',
            description: `Purchased ${coins.toLocaleString()} Casino Coins${discountApplied ? ` (+5% Booster Bonus = ${finalCoins.toLocaleString()} total)` : ''}`,
            amount: finalCoins,
            baseAmount: coins,
            boosterBonus: discountApplied ? (finalCoins - coins) : 0,
            amountPaid,
            paymentId,
            transactionId: transactionId || paymentId,
            timestamp: new Date()
        };

        await db.collection('transactions').add(transaction);

        // Send Discord announcement for coin purchase
        try {
            await sendCoinPurchaseAnnouncement(userId, finalCoins, amountPaid, discountApplied ? (finalCoins - coins) : 0);
        } catch (announcementError) {
            console.error('Failed to send coin purchase announcement:', announcementError);
            // Don't fail the transaction for announcement failure
        }

        console.log(`💰 Casino Coins Purchase: User ${userId} bought ${coins} coins${discountApplied ? ` (+${finalCoins - coins} booster bonus)` : ''} for $${amountPaid}`);
        res.json({ 
            success: true, 
            newBalance: newWallet,
            coinsPurchased: finalCoins,
            baseCoins: coins,
            boosterBonus: discountApplied ? (finalCoins - coins) : 0,
            discountApplied,
            amountPaid
        });

    } catch (error) {
        console.error('Casino coins purchase error:', error);
        res.status(500).json({ error: 'Failed to process coin purchase' });
    }
});

// Premium Credits Purchase Endpoint
app.post('/api/payments/credits/purchase', async (req, res) => {
    try {
        const { userId, credits, amountPaid, paymentId, transactionId } = req.body;

        if (!userId || !credits || !amountPaid || !paymentId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Get user's current credits
        const userBalanceDoc = await db.collection('user_balances').doc(userId).get();
        const userData = userBalanceDoc.exists ? userBalanceDoc.data() : {};
        const currentCredits = parseFloat(userData.credits) || 0;

        // Update user's credits with purchased amount
        const newCredits = currentCredits + credits;
        await db.collection('user_balances').doc(userId).update({
            credits: newCredits
        });

        // Create transaction record
        const transaction = {
            userId,
            type: 'credit_purchase',
            description: `Purchased ${credits.toLocaleString()} Premium Credits`,
            amount: 0, // Credits don't affect main balance
            creditChange: credits,
            amountPaid,
            paymentId,
            transactionId: transactionId || paymentId,
            timestamp: new Date()
        };

        await db.collection('transactions').add(transaction);

        console.log(`💎 Premium Credits Purchase: User ${userId} bought ${credits} credits for $${amountPaid}`);
        res.json({ 
            success: true, 
            newCredits: newCredits,
            creditsPurchased: credits,
            amountPaid
        });

    } catch (error) {
        console.error('Premium credits purchase error:', error);
        res.status(500).json({ error: 'Failed to process credit purchase' });
    }
});

// Premium Subscription Purchase Endpoint
app.post('/api/payments/premium/subscribe', async (req, res) => {
    try {
        const { userId, subscriptionPrice, paymentId, transactionId } = req.body;

        if (!userId || !subscriptionPrice || !paymentId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Calculate subscription expiration date (1 month from now)
        const expirationDate = new Date();
        expirationDate.setMonth(expirationDate.getMonth() + 1);

        // Get user's current data
        const userBalanceDoc = await db.collection('user_balances').doc(userId).get();
        const userData = userBalanceDoc.exists ? userBalanceDoc.data() : {};

        // Update user's premium status and add bonus credits
        const bonusCredits = 1000; // Monthly bonus credits for premium members
        const currentCredits = parseFloat(userData.credits) || 0;
        
        await db.collection('user_balances').doc(userId).update({
            premiumMembership: true,
            premiumExpiresAt: expirationDate,
            premiumStartedAt: new Date(),
            credits: currentCredits + bonusCredits // Add welcome bonus
        });

        // Create transaction record
        const transaction = {
            userId,
            type: 'premium_subscription',
            description: `Premium Membership Subscription (1 month) + ${bonusCredits} bonus credits`,
            amount: 0,
            creditChange: bonusCredits,
            amountPaid: subscriptionPrice,
            paymentId,
            transactionId: transactionId || paymentId,
            timestamp: new Date(),
            expirationDate
        };

        await db.collection('transactions').add(transaction);

        // Queue premium role assignment
        await db.collection('discord_announcements').add({
            type: 'premium_role_assignment',
            userId: userId,
            action: 'assign_premium_role',
            processed: false,
            timestamp: new Date()
        });

        console.log(`👑 Premium Subscription: User ${userId} subscribed for $${subscriptionPrice} until ${expirationDate.toISOString()}`);
        res.json({ 
            success: true, 
            premiumActive: true,
            expiresAt: expirationDate,
            bonusCredits,
            newCredits: currentCredits + bonusCredits,
            amountPaid: subscriptionPrice
        });

    } catch (error) {
        console.error('Premium subscription error:', error);
        res.status(500).json({ error: 'Failed to process premium subscription' });
    }
});

// Update user balance with fallback database support
app.post('/api/users/update-balance', async (req, res) => {
    try {
        const { userId, credits, operation, source, paymentId } = req.body;
        
        console.log('💰 Balance update request:', {
            userId,
            credits,
            operation,
            source,
            paymentId
        });

        if (!userId || credits === undefined) {
            return res.status(400).json({ error: 'Missing required fields: userId, credits' });
        }

        // Get current balance
        const currentBalance = await dbManager.getUserBalance(userId);
        
        // Calculate new balance
        let newCredits = currentBalance.credits || 0;
        if (operation === 'add') {
            newCredits += credits;
        } else if (operation === 'subtract') {
            newCredits -= credits;
        } else if (operation === 'set') {
            newCredits = credits;
        } else {
            return res.status(400).json({ error: 'Invalid operation. Use: add, subtract, or set' });
        }

        // Ensure credits don't go negative
        newCredits = Math.max(0, newCredits);

        // Update balance in database(s)
        const updateResult = await dbManager.updateUserBalance(userId, {
            wallet: currentBalance.wallet || 0,
            bank: currentBalance.bank || 0,
            credits: newCredits
        });

        // Record the transaction
        if (source && paymentId) {
            try {
                await dbManager.recordPurchase({
                    userId,
                    credits,
                    amount: credits * 0.01, // Assuming 1 credit = $0.01 for logging
                    paymentId,
                    source,
                    operation
                });
            } catch (recordErr) {
                console.warn('Failed to record purchase transaction:', recordErr.message);
            }
        }

        console.log('✅ Balance updated successfully:', {
            userId,
            previousCredits: currentBalance.credits || 0,
            newCredits,
            change: newCredits - (currentBalance.credits || 0)
        });

        res.json({
            success: true,
            balance: {
                wallet: currentBalance.wallet || 0,
                bank: currentBalance.bank || 0,
                credits: newCredits
            },
            previousCredits: currentBalance.credits || 0,
            newCredits,
            warnings: updateResult.errors
        });

    } catch (error) {
        console.error('❌ Balance update error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message || 'Failed to update balance'
        });
    }
});

// Database status endpoint
app.get('/api/database/status', async (req, res) => {
    try {
        const status = await dbManager.getStatus();
        res.json(status);
    } catch (error) {
        console.error('Database status error:', error);
        res.status(500).json({ error: 'Failed to get database status' });
    }
});

// Discord Notification Endpoint for Purchase
app.post('/api/discord/notify-purchase', async (req, res) => {
    try {
        const { userId, username, credits, amount, channelId } = req.body;
        
        console.log('📢 Sending Discord purchase notification:', {
            userId,
            username,
            credits,
            amount,
            channelId
        });

        // Get Discord bot token from environment
        const botToken = process.env.DISCORD_TOKEN;
        if (!botToken) {
            console.error('Discord bot token not configured');
            return res.status(500).json({ error: 'Discord bot not configured' });
        }

        // Create embed message for Discord
        const embed = {
            embeds: [{
                title: '💎 New Credit Purchase!',
                color: 0x9f7aea, // Purple color
                fields: [
                    {
                        name: '👤 User',
                        value: username,
                        inline: true
                    },
                    {
                        name: '💰 Amount Paid',
                        value: `$${amount.toFixed(2)} USD`,
                        inline: true
                    },
                    {
                        name: '💎 Credits Purchased',
                        value: new Intl.NumberFormat('en-US').format(credits),
                        inline: true
                    },
                    {
                        name: '🆔 User ID',
                        value: userId,
                        inline: false
                    }
                ],
                timestamp: new Date().toISOString(),
                footer: {
                    text: 'ATIVE Casino Web Portal',
                    icon_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
                }
            }]
        };

        // Send to Discord channel using Discord API
        const discordResponse = await axios.post(
            `https://discord.com/api/v10/channels/${channelId}/messages`,
            embed,
            {
                headers: {
                    'Authorization': `Bot ${botToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ Discord notification sent successfully');
        res.json({ success: true, messageId: discordResponse.data.id });

    } catch (error) {
        console.error('Discord notification error:', error.response?.data || error);
        // Don't fail the main transaction if notification fails
        res.json({ success: false, error: 'Notification failed but purchase succeeded' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 ATIVE Casino Web API Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
});