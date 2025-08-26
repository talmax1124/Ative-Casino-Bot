/**
 * ATIVE Casino Web API Server
 * Backend API for the web portal
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3001;

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

        const response = {
            customToken,
            user: {
                id: discordUser.id,
                username: discordUser.username,
                discriminator: discordUser.discriminator,
                avatar: avatarUrl
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

// User endpoints
app.get('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userDoc = await db.collection('users').doc(id).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userData = userDoc.data();
        
        // Transform the data to match frontend expectations
        const response = {
            id: userData.discord_id || id, // Map discord_id to id
            discordId: userData.discord_id || id,
            username: userData.username,
            discriminator: userData.discriminator,
            avatar: userData.avatar 
                ? `https://cdn.discordapp.com/avatars/${userData.discord_id}/${userData.avatar}.png?size=128`
                : `https://cdn.discordapp.com/embed/avatars/${(parseInt(userData.discriminator) || 0) % 5}.png`,
            email: userData.email,
            balance: userData.balance || 0,
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
        
        // Get user balance and stats from your existing bot's Firebase structure
        const balanceDoc = await db.collection('economy').doc(`${id}_balance`).get();
        const statsDoc = await db.collection('game_stats').doc(id).get();
        const userDoc = await db.collection('users').doc(id).get();
        
        const balance = balanceDoc.exists ? balanceDoc.data() : { wallet: 0, bank: 0 };
        const stats = statsDoc.exists ? statsDoc.data() : {
            total_games: 0,
            wins: 0,
            losses: 0,
            total_wagered: 0,
            biggest_win: 0,
            total_winnings: 0
        };
        const userData = userDoc.exists ? userDoc.data() : {};

        // Calculate additional dashboard stats with safe defaults
        const walletAmount = balance.wallet || 0;
        const bankAmount = balance.bank || 0;
        const totalBalance = walletAmount + bankAmount;
        
        const totalWinnings = Math.max(stats.total_winnings || 0, stats.biggest_win || 0);
        const totalWagered = stats.total_wagered || 0;
        const totalLosses = Math.max(0, totalWagered - totalWinnings);
        
        const totalGames = stats.total_games || 0;
        const wins = stats.wins || 0;
        const winRate = totalGames > 0 ? wins / totalGames : 0;
        
        // Determine favorite game (placeholder logic)
        const gameTypes = ['blackjack', 'slots', 'battleship', 'roulette'];
        let favoriteGame = 'None yet';
        let maxGames = 0;
        
        for (const game of gameTypes) {
            const gameWins = stats[`${game}_wins`] || 0;
            const gameLosses = stats[`${game}_losses`] || 0;
            const totalGamePlays = gameWins + gameLosses;
            
            if (totalGamePlays > maxGames) {
                maxGames = totalGamePlays;
                favoriteGame = game.charAt(0).toUpperCase() + game.slice(1);
            }
        }

        // Get recent transactions (simplified - avoid complex Firestore queries for now)
        const recentTransactions = [];
        
        // Only try to get transactions if we have meaningful data
        if (stats.biggest_win > 0) {
            recentTransactions.push({
                id: '1',
                type: 'game_win',
                amount: stats.biggest_win,
                description: 'Biggest game win',
                timestamp: new Date().toISOString(),
                status: 'completed'
            });
        }
        
        if ((balance.wallet || 0) > 0) {
            recentTransactions.push({
                id: '2',
                type: 'balance',
                amount: balance.wallet,
                description: 'Wallet balance',
                timestamp: new Date().toISOString(),
                status: 'completed'
            });
        }

        res.json({
            // Dashboard expects these specific fields (ensure no NaN values)
            totalBalance: isNaN(totalBalance) ? 0 : totalBalance,
            totalWinnings: isNaN(totalWinnings) ? 0 : totalWinnings,
            totalLosses: isNaN(totalLosses) ? 0 : totalLosses,
            winRate: isNaN(winRate) ? 0 : winRate,
            gamesPlayed: isNaN(totalGames) ? 0 : totalGames,
            currentRank: 1, // Placeholder - you can implement ranking logic
            favoriteGame: favoriteGame || 'None yet',
            recentTransactions: recentTransactions || [],
            
            // Legacy format for compatibility
            balance: {
                wallet: isNaN(walletAmount) ? 0 : walletAmount,
                bank: isNaN(bankAmount) ? 0 : bankAmount,
                total: isNaN(totalBalance) ? 0 : totalBalance
            },
            gameStats: {
                totalGames: isNaN(totalGames) ? 0 : totalGames,
                totalWins: isNaN(wins) ? 0 : wins,
                totalLosses: isNaN(stats.losses || 0) ? 0 : (stats.losses || 0),
                winRate: isNaN(winRate * 100) ? 0 : (winRate * 100),
                bestWin: isNaN(stats.biggest_win || 0) ? 0 : (stats.biggest_win || 0)
            }
        });
    } catch (error) {
        console.error('Get user stats error:', error);
        res.status(500).json({ error: 'Failed to get user stats' });
    }
});

app.get('/api/users/:id/transactions', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Return empty transactions for now to avoid Firestore index issues
        // You can implement proper transaction logging later
        const transactions = [
            {
                id: '1',
                type: 'game_win',
                amount: 100,
                description: 'Sample game win',
                timestamp: new Date().toISOString(),
                status: 'completed'
            }
        ];

        res.json(transactions);
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ error: 'Failed to get transactions' });
    }
});

app.get('/api/users/:id/game-stats', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get game statistics from your bot's Firebase structure
        const gameStatsDoc = await db.collection('game_stats').doc(id).get();
        
        if (!gameStatsDoc.exists) {
            // Return empty game stats if user has no games played yet
            return res.json([]);
        }

        const stats = gameStatsDoc.data();
        
        // Transform stats into the format expected by the dashboard
        const gameStats = [
            {
                name: 'Blackjack',
                wins: stats.blackjack_wins || 0,
                losses: stats.blackjack_losses || 0,
                winRate: stats.blackjack_wins && stats.blackjack_losses 
                    ? (stats.blackjack_wins / (stats.blackjack_wins + stats.blackjack_losses)) * 100 
                    : 0
            },
            {
                name: 'Slots',
                wins: stats.slots_wins || 0,
                losses: stats.slots_losses || 0,
                winRate: stats.slots_wins && stats.slots_losses 
                    ? (stats.slots_wins / (stats.slots_wins + stats.slots_losses)) * 100 
                    : 0
            },
            {
                name: 'Battleship',
                wins: stats.battleship_wins || 0,
                losses: stats.battleship_losses || 0,
                winRate: stats.battleship_wins && stats.battleship_losses 
                    ? (stats.battleship_wins / (stats.battleship_wins + stats.battleship_losses)) * 100 
                    : 0
            },
            {
                name: 'Roulette',
                wins: stats.roulette_wins || 0,
                losses: stats.roulette_losses || 0,
                winRate: stats.roulette_wins && stats.roulette_losses 
                    ? (stats.roulette_wins / (stats.roulette_wins + stats.roulette_losses)) * 100 
                    : 0
            }
        ].filter(game => game.wins > 0 || game.losses > 0); // Only include games that have been played

        res.json(gameStats);
    } catch (error) {
        console.error('Get game stats error:', error);
        res.status(500).json({ error: 'Failed to get game stats' });
    }
});

// Leaderboard endpoints
app.get('/api/leaderboards/:type', async (req, res) => {
    try {
        const { type } = req.params;
        let collection = 'economy';
        let field = 'wallet';
        
        switch (type) {
            case 'balance':
                field = 'wallet';
                break;
            case 'wins':
                collection = 'game_stats';
                field = 'wins';
                break;
            case 'winRate':
                collection = 'game_stats';
                field = 'win_rate';
                break;
        }

        const snapshot = await db.collection(collection)
            .orderBy(field, 'desc')
            .limit(10)
            .get();

        const leaderboard = [];
        let rank = 1;
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            const userId = doc.id.replace('_balance', '');
            
            // Get username from users collection
            const userDoc = await db.collection('users').doc(userId).get();
            const username = userDoc.exists ? userDoc.data().username : 'Unknown User';
            
            leaderboard.push({
                userId,
                username,
                value: data[field] || 0,
                rank
            });
            rank++;
        }

        res.json(leaderboard);
    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({ error: 'Failed to get leaderboard' });
    }
});

// Shop endpoints (placeholder)
app.get('/api/shop/items', (req, res) => {
    res.json([
        {
            id: '1',
            name: 'Double XP Boost',
            description: 'Double XP for 24 hours',
            price: 1000,
            category: 'boosts',
            iconUrl: '/icons/double-xp.png'
        },
        {
            id: '2',
            name: 'Golden Badge',
            description: 'Exclusive golden profile badge',
            price: 5000,
            category: 'cosmetics',
            iconUrl: '/icons/golden-badge.png'
        }
    ]);
});

// Payment endpoints (placeholders - implement based on your needs)
app.post('/api/payments/deposit', (req, res) => {
    res.json({ message: 'Deposit functionality not yet implemented' });
});

app.post('/api/payments/withdraw', (req, res) => {
    res.json({ message: 'Withdrawal functionality not yet implemented' });
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