/**
 * Ask ATIVE - AI-Powered Casino Q&A System
 * Allows users to ask questions about the casino with intelligent responses
 * Admin-only responses for sensitive administrative topics
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const logger = require('../UTILS/logger');
const { getGuildId, fmt, sendLogMessage } = require('../UTILS/common');
const dbManager = require('../UTILS/database');
const axios = require('axios');

// Developer and Admin IDs
const DEVELOPER_ID = '466050111680544798';

/**
 * Check if user has admin permissions
 */
async function hasAdminPermissions(interaction) {
    const userId = interaction.user.id;
    
    // Developer always has admin permissions
    if (userId === DEVELOPER_ID) {
        return true;
    }
    
    try {
        // Check if user has Administrator permission or specific roles
        const member = await interaction.guild.members.fetch(userId);
        
        // Check for Administrator permission
        if (member.permissions.has('Administrator')) {
            return true;
        }
        
        // Check for specific admin roles (customize based on your server)
        const adminRoles = ['Admin', 'Administrator', 'Owner', 'Staff'];
        const hasAdminRole = member.roles.cache.some(role => 
            adminRoles.some(adminRole => 
                role.name.toLowerCase().includes(adminRole.toLowerCase())
            )
        );
        
        return hasAdminRole;
        
    } catch (error) {
        logger.error(`Error checking admin permissions: ${error.message}`);
        return false;
    }
}

/**
 * Check if user is the developer (has full access)
 */
function isDeveloper(userId) {
    return userId === DEVELOPER_ID;
}

/**
 * Parse money command from natural language - Enhanced version
 */
function parseMoneyCommand(question) {
    const lowerQuestion = question.toLowerCase();
    
    // Give money patterns - Enhanced with more natural language
    const givePatterns = [
        { pattern: /give\s+<@!?(\d+)>\s+\$?([\d,]+[kmb]?)/i, userIndex: 1, amountIndex: 2 },
        { pattern: /add\s+\$?([\d,]+[kmb]?)\s+to\s+<@!?(\d+)>/i, userIndex: 2, amountIndex: 1 },
        { pattern: /<@!?(\d+)>\s+needs?\s+\$?([\d,]+[kmb]?)/i, userIndex: 1, amountIndex: 2 },
        { pattern: /grant\s+<@!?(\d+)>\s+\$?([\d,]+[kmb]?)/i, userIndex: 1, amountIndex: 2 },
        { pattern: /send\s+\$?([\d,]+[kmb]?)\s+to\s+<@!?(\d+)>/i, userIndex: 2, amountIndex: 1 },
        { pattern: /transfer\s+\$?([\d,]+[kmb]?)\s+to\s+<@!?(\d+)>/i, userIndex: 2, amountIndex: 1 },
        { pattern: /<@!?(\d+)>\s+(?:should have|gets?)\s+\$?([\d,]+[kmb]?)/i, userIndex: 1, amountIndex: 2 },
        { pattern: /credit\s+<@!?(\d+)>\s+(?:with\s+)?\$?([\d,]+[kmb]?)/i, userIndex: 1, amountIndex: 2 }
    ];
    
    // Remove money patterns - Enhanced
    const removePatterns = [
        { pattern: /(?:remove|take)\s+\$?([\d,]+[kmb]?)\s+from\s+<@!?(\d+)>/i, userIndex: 2, amountIndex: 1 },
        { pattern: /<@!?(\d+)>\s+(?:lose|loses)\s+\$?([\d,]+[kmb]?)/i, userIndex: 1, amountIndex: 2 },
        { pattern: /deduct\s+\$?([\d,]+[kmb]?)\s+from\s+<@!?(\d+)>/i, userIndex: 2, amountIndex: 1 },
        { pattern: /subtract\s+\$?([\d,]+[kmb]?)\s+from\s+<@!?(\d+)>/i, userIndex: 2, amountIndex: 1 },
        { pattern: /<@!?(\d+)>\s+(?:should lose|lost)\s+\$?([\d,]+[kmb]?)/i, userIndex: 1, amountIndex: 2 },
        { pattern: /charge\s+<@!?(\d+)>\s+\$?([\d,]+[kmb]?)/i, userIndex: 1, amountIndex: 2 },
        { pattern: /fine\s+<@!?(\d+)>\s+\$?([\d,]+[kmb]?)/i, userIndex: 1, amountIndex: 2 }
    ];
    
    // Balance check patterns
    const balancePatterns = [
        { pattern: /(?:check|show|what.?s)\s+<@!?(\d+)>.?s?\s+balance/i, userIndex: 1 },
        { pattern: /balance\s+(?:of\s+|for\s+)?<@!?(\d+)>/i, userIndex: 1 },
        { pattern: /how\s+much\s+(?:money\s+)?(?:does\s+)?<@!?(\d+)>\s+have/i, userIndex: 1 },
        { pattern: /<@!?(\d+)>.?s?\s+(?:money|balance|wealth)/i, userIndex: 1 }
    ];
    
    /**
     * Check if question is money/earning related
     */
    function isMoneyRelatedQuestion(question) {
        const moneyPatterns = [
            /\b(?:money|cash|earn|work|income|rich|wealth|poor|broke)\b/i,
            /\b(?:balance|wallet|bank|deposit|withdraw)\b/i,
            /\b(?:buy|purchase|cost|price|expensive|cheap)\b/i,
            /\b(?:fast|quick|easy|slow).*(?:money|cash|earn)\b/i,
            /\bhow.*(?:get|make|earn).*(?:money|cash)\b/i,
            /\b(?:need|want|get).*(?:money|cash)\b/i
        ];
        
        return moneyPatterns.some(pattern => pattern.test(question));
    }

    // Session management patterns
    const sessionPatterns = [
        { pattern: /(?:check|show|what.?s)\s+<@!?(\d+)>.?s?\s+session/i, userIndex: 1, type: 'check' },
        { pattern: /session\s+(?:status\s+)?(?:of\s+|for\s+)?<@!?(\d+)>/i, userIndex: 1, type: 'check' },
        { pattern: /<@!?(\d+)>\s+(?:is\s+)?stuck/i, userIndex: 1, type: 'check' },
        { pattern: /(?:release|free|unstuck|clear)\s+<@!?(\d+)>/i, userIndex: 1, type: 'release' },
        { pattern: /<@!?(\d+)>\s+needs?\s+(?:to be\s+)?(?:released|freed|unstuck)/i, userIndex: 1, type: 'release' },
        { pattern: /cancel\s+<@!?(\d+)>.?s?\s+session/i, userIndex: 1, type: 'release' },
        { pattern: /fix\s+<@!?(\d+)>.?s?\s+session/i, userIndex: 1, type: 'release' },
        { pattern: /<@!?(\d+)>\s+can.?t\s+(?:play|start|use\s+commands)/i, userIndex: 1, type: 'release' },
        // Self-service patterns (no user mention)
        { pattern: /(?:my\s+)?session\s+(?:is\s+)?stuck/i, type: 'self-check' },
        { pattern: /(?:release|free|unstuck|clear)\s+(?:my\s+)?session/i, type: 'self-release' },
        { pattern: /(?:i.?m|am)\s+stuck/i, type: 'self-check' },
        { pattern: /can.?t\s+(?:play|start|use\s+commands)/i, type: 'self-check' },
        { pattern: /(?:cancel|end|stop)\s+(?:my\s+)?session/i, type: 'self-release' }
    ];
    
    // Check for give money patterns
    for (const { pattern, userIndex, amountIndex } of givePatterns) {
        const match = question.match(pattern);
        if (match) {
            const userId = match[userIndex];
            const amount = match[amountIndex];
            if (userId && amount) {
                return { type: 'give', userId, amount };
            }
        }
    }
    
    // Check for remove money patterns
    for (const { pattern, userIndex, amountIndex } of removePatterns) {
        const match = question.match(pattern);
        if (match) {
            const userId = match[userIndex];
            const amount = match[amountIndex];
            if (userId && amount) {
                return { type: 'remove', userId, amount };
            }
        }
    }
    
    // Check for balance inquiry patterns
    for (const { pattern, userIndex } of balancePatterns) {
        const match = question.match(pattern);
        if (match) {
            const userId = match[userIndex];
            if (userId) {
                return { type: 'balance', userId };
            }
        }
    }
    
    // Check for session management patterns
    for (const { pattern, userIndex, type } of sessionPatterns) {
        const match = question.match(pattern);
        if (match) {
            if (type.startsWith('self-')) {
                // Self-service patterns don't need a userIndex
                return { type: type.replace('self-', ''), userId: null, selfService: true };
            } else if (userIndex && match[userIndex]) {
                return { type, userId: match[userIndex] };
            }
        }
    }
    
    return null;
}

/**
 * Parse amount string to number (supports K/M/B suffixes)
 */
function parseAmount(amountStr) {
    if (!amountStr) return 0;
    
    // Remove commas and dollar signs
    const cleanAmount = amountStr.replace(/[$,]/g, '').toLowerCase();
    const number = parseFloat(cleanAmount);
    
    if (isNaN(number)) return 0;
    
    if (cleanAmount.includes('k')) return Math.floor(number * 1000);
    if (cleanAmount.includes('m')) return Math.floor(number * 1000000);
    if (cleanAmount.includes('b')) return Math.floor(number * 1000000000);
    
    return Math.floor(number);
}

/**
 * Execute money command for developer - Enhanced version
 */
async function executeMoneyCommand(interaction, command) {
    const { type, userId, amount } = command;
    const guildId = await getGuildId(interaction);
    
    // Handle balance checks (available to all developers/admins)
    if (type === 'balance') {
        try {
            logger.info(`🔍 Balance check for user: ${userId}`);
            
            // Get target user (try guild first, then Discord client for cross-server support)
            let targetUser;
            let username = 'Unknown User';
            try {
                targetUser = await interaction.guild.members.fetch(userId);
                username = targetUser.user.username;
            } catch (error) {
                // User not in guild, try to fetch from Discord API
                try {
                    targetUser = await interaction.client.users.fetch(userId);
                    username = targetUser.username;
                } catch (fetchError) {
                    return 'Could not find that user. Please check the user ID is correct.';
                }
            }
            
            // Ensure user exists in database
            await dbManager.ensureUser(userId, username);
            
            // Get balance
            const balance = await dbManager.getUserBalance(userId, guildId);
            const totalBalance = balance.wallet + balance.bank;
            
            return `💰 **${targetUser.user.username}'s Balance:**\n` +
                   `• Wallet: ${fmt(balance.wallet)}\n` +
                   `• Bank: ${fmt(balance.bank)}\n` +
                   `• **Total: ${fmt(totalBalance)}**`;
                   
        } catch (error) {
            logger.error(`Balance check error: ${error.message}`);
            return 'Failed to check user balance. Please try again.';
        }
    }
    
    // Handle session management (available to developers/admins)
    if (type === 'check' || type === 'release') {
        try {
            const sessionManager = require('../UTILS/sessionManager');
            const targetUserId = command.selfService ? interaction.user.id : userId;
            
            logger.info(`🔍 Session ${type} for user: ${targetUserId} (self-service: ${command.selfService || false})`);
            
            // Get target user info
            let targetUser;
            try {
                if (command.selfService) {
                    targetUser = interaction.user;
                } else {
                    targetUser = await interaction.guild.members.fetch(targetUserId);
                }
            } catch (error) {
                return command.selfService ? 'Error checking your session.' : 'Could not find that user in this server.';
            }
            
            // Check for active sessions
            const activeSession = sessionManager.getUserActiveSession(targetUserId);
            
            if (type === 'check') {
                if (!activeSession) {
                    return command.selfService ? 
                        `✅ **Your Session Status:**\nNo active sessions found. You're free to play any game!` :
                        `✅ **${targetUser.displayName || targetUser.username}'s Session Status:**\nNo active sessions found. They're free to play!`;
                }
                
                const sessionAge = Math.floor((Date.now() - activeSession.createdAt) / 1000);
                const gameType = activeSession.gameType || 'Unknown';
                const state = activeSession.state || 'Unknown';
                
                return command.selfService ?
                    `⚠️ **Your Session Status:**\n` +
                    `• **Game**: ${gameType.toUpperCase()}\n` +
                    `• **State**: ${state.toUpperCase()}\n` +
                    `• **Duration**: ${sessionAge}s\n` +
                    `• **Session ID**: ${activeSession.sessionId}\n\n` +
                    `Use "/stopmysession" or ask me to "release my session"` :
                    `⚠️ **${targetUser.displayName || targetUser.username}'s Session Status:**\n` +
                    `• **Game**: ${gameType.toUpperCase()}\n` +
                    `• **State**: ${state.toUpperCase()}\n` +
                    `• **Duration**: ${sessionAge}s\n` +
                    `• **Session ID**: ${activeSession.sessionId}`;
            }
            
            if (type === 'release') {
                if (!activeSession) {
                    return command.selfService ?
                        `✅ **Session Release:**\nYou don't have any active sessions to release.` :
                        `✅ **Session Release:**\n${targetUser.displayName || targetUser.username} doesn't have any active sessions.`;
                }
                
                // Force cleanup the user's sessions
                const result = await sessionManager.forceCleanupUser(targetUserId, guildId, 'Released via ATIVE AI');
                
                if (result.success) {
                    logger.info(`✅ Session released for user ${targetUserId} via ATIVE AI by ${interaction.user.id}`);
                    
                    return command.selfService ?
                        `✅ **Session Released Successfully!**\n` +
                        `• Cleaned up ${result.cleaned || 1} session(s)\n` +
                        `• Refunded: ${result.refunded ? fmt(result.refunded) : '$0.00'}\n` +
                        `• You can now play games normally!` :
                        `✅ **Session Released Successfully!**\n` +
                        `• **User**: ${targetUser.displayName || targetUser.username}\n` +
                        `• Cleaned up ${result.cleaned || 1} session(s)\n` +
                        `• Refunded: ${result.refunded ? fmt(result.refunded) : '$0.00'}\n` +
                        `• They can now play games normally!`;
                } else {
                    return `❌ **Session Release Failed:**\n${result.error || 'Unknown error occurred'}`;
                }
            }
            
        } catch (error) {
            logger.error(`Session management error: ${error.message}`);
            return `❌ **Session Management Error:**\nFailed to ${type} session. Please try again or use /stopmysession.`;
        }
    }
    
    // Money modification commands require developer privileges
    if (!isDeveloper(interaction.user.id)) {
        return 'Money modification commands are restricted to the bot developer only.';
    }
    
    const parsedAmount = parseAmount(amount);
    
    logger.info(`🔍 Money Command Details: type=${type}, userId=${userId}, amount=${amount}, parsed=${parsedAmount}, guildId=${guildId}`);
    
    if (parsedAmount <= 0) {
        logger.warn(`❌ Invalid amount: ${parsedAmount}`);
        return 'Invalid amount specified. Please use a positive number.';
    }
    
    if (parsedAmount > 1000000000000) { // 1 trillion limit
        logger.warn(`❌ Amount too large: ${parsedAmount}`);
        return 'Amount too large. Maximum is $1T for safety.';
    }
    
    try {
        // Get target user (try guild first, then Discord client for cross-server support)
        let targetUser;
        let username = 'Unknown User';
        try {
            logger.info(`🔍 Fetching user: ${userId}`);
            // First try to find user in current guild
            targetUser = await interaction.guild.members.fetch(userId);
            username = targetUser.user.username;
            logger.info(`✅ User found: ${username}`);
        } catch (error) {
            logger.error(`❌ Guild user fetch failed: ${error.message}`);
            // User not in guild, try to fetch from Discord API
            try {
                logger.info(`🔍 Attempting cross-server user fetch: ${userId}`);
                targetUser = await interaction.client.users.fetch(userId);
                username = targetUser.username;
                logger.info(`✅ Cross-server user found: ${username}`);
            } catch (fetchError) {
                logger.error(`❌ Cross-server user fetch failed: ${fetchError.message}`);
                return 'Could not find that user. Please check the user ID is correct.';
            }
        }
        
        // Ensure user exists in database
        logger.info('🔍 Ensuring user exists in database...');
        await dbManager.ensureUser(userId, username);
        
        // Get current balance
        logger.info('🔍 Getting current balance...');
        const currentBalance = await dbManager.getUserBalance(userId, guildId);
        const totalBefore = currentBalance.wallet + currentBalance.bank;
        logger.info(`💰 Current balance: wallet=${currentBalance.wallet}, bank=${currentBalance.bank}, total=${totalBefore}`);
        
        let result;
        let operation;
        
        if (type === 'give') {
            // Add money to wallet
            logger.info(`💸 Adding ${fmt(parsedAmount)} to ${targetUser.user.username}'s wallet...`);
            await dbManager.databaseAdapter.executeQuery(
                'UPDATE user_balances SET wallet = wallet + ? WHERE user_id = ?',
                [parsedAmount, userId]
            );
            operation = 'added';
            result = `Successfully added ${fmt(parsedAmount)} to ${targetUser.user.username}'s wallet.`;
            logger.info(`✅ Money added successfully`);
            
        } else {
            // Remove money (from wallet first, then bank)
            logger.info(`💸 Removing ${fmt(parsedAmount)} from ${targetUser.user.username}...`);
            const newBalance = await dbManager.getUserBalance(userId, guildId);
            
            if (newBalance.wallet + newBalance.bank < parsedAmount) {
                logger.warn(`❌ Insufficient funds: requested ${fmt(parsedAmount)}, available ${fmt(newBalance.wallet + newBalance.bank)}`);
                return `Cannot remove ${fmt(parsedAmount)}. User only has ${fmt(newBalance.wallet + newBalance.bank)} total.`;
            }
            
            let walletDeduction = Math.min(parsedAmount, newBalance.wallet);
            let bankDeduction = parsedAmount - walletDeduction;
            
            logger.info(`💸 Deductions: wallet=${fmt(walletDeduction)}, bank=${fmt(bankDeduction)}`);
            
            if (walletDeduction > 0) {
                logger.info(`🔄 Deducting ${fmt(walletDeduction)} from wallet...`);
                await dbManager.databaseAdapter.executeQuery(
                    'UPDATE user_balances SET wallet = wallet - ? WHERE user_id = ?',
                    [walletDeduction, userId]
                );
            }
            
            if (bankDeduction > 0) {
                logger.info(`🔄 Deducting ${fmt(bankDeduction)} from bank...`);
                await dbManager.databaseAdapter.executeQuery(
                    'UPDATE user_balances SET bank = bank - ? WHERE user_id = ?',
                    [bankDeduction, userId]
                );
            }
            
            operation = 'removed';
            result = `Successfully removed ${fmt(parsedAmount)} from ${targetUser.user.username}.`;
            logger.info(`✅ Money removed successfully`);
        }
        
        // Get final balance
        const finalBalance = await dbManager.getUserBalance(userId, guildId);
        const totalAfter = finalBalance.wallet + finalBalance.bank;
        
        // Log the action
        await sendLogMessage(
            interaction.client,
            'admin',
            `💰 Developer Money Command: ${interaction.user.tag} ${operation} ${fmt(parsedAmount)} ${type === 'give' ? 'to' : 'from'} ${targetUser.user.tag} (${userId}). Balance: ${fmt(totalBefore)} → ${fmt(totalAfter)}`,
            interaction.user.id,
            guildId
        );
        
        logger.info(`Developer money command: ${interaction.user.id} ${operation} ${fmt(parsedAmount)} ${type === 'give' ? 'to' : 'from'} ${userId}`);
        
        return `${result}\n\n**Balance Update:**\n${fmt(totalBefore)} → ${fmt(totalAfter)}\nWallet: ${fmt(finalBalance.wallet)} | Bank: ${fmt(finalBalance.bank)}`;
        
    } catch (error) {
        logger.error(`Money command error: ${error.message}`);
        return `Error executing money command: ${error.message}`;
    }
}

/**
 * Check if question contains admin-related topics
 */
function isAdminTopic(question) {
    const adminKeywords = [
        'admin', 'administrator', 'staff', 'manage', 'management',
        'ban', 'kick', 'mute', 'timeout', 'moderate', 'moderation',
        'database', 'server config', 'configuration', 'settings',
        'logs', 'audit', 'permissions', 'roles', 'developer',
        'economy guardian', 'economic system', 'ai control',
        'wealth tax', 'economic analysis', 'guardrails',
        'backup', 'maintenance', 'debug', 'error handling',
        'user data', 'statistics', 'analytics', 'monitoring'
    ];
    
    const lowerQuestion = question.toLowerCase();
    return adminKeywords.some(keyword => lowerQuestion.includes(keyword));
}

/**
 * Get live economic data from database and EconomyGuardian
 */
async function getLiveEconomicData(client, guildId) {
    try {
        const data = {};
        
        // Get user statistics (user_balances is global, not per-guild)
        const userStatsQuery = `
            SELECT 
                COUNT(*) as total_users,
                SUM(wallet + bank) as total_money,
                AVG(wallet + bank) as avg_balance,
                COUNT(CASE WHEN wallet + bank > 1000000 THEN 1 END) as millionaires,
                COUNT(CASE WHEN wallet + bank > 100000000 THEN 1 END) as high_wealth_users,
                COUNT(CASE WHEN wallet + bank > 500000000 THEN 1 END) as wealth_tax_eligible
            FROM user_balances
        `;
        
        const userStats = await dbManager.databaseAdapter.executeQuery(userStatsQuery, []);
        data.userStats = userStats[0] || {};
        
        // Get game statistics (last 24 hours)
        const gameStatsQuery = `
            SELECT 
                game_type,
                COUNT(*) as games_played,
                SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) as games_won,
                SUM(bet_amount) as total_wagered,
                SUM(payout) as total_paid_out,
                AVG(bet_amount) as avg_bet,
                MAX(payout) as biggest_win
            FROM game_results 
            WHERE guild_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
            GROUP BY game_type
            ORDER BY games_played DESC
        `;
        
        const gameStats = await dbManager.databaseAdapter.executeQuery(gameStatsQuery, [guildId]);
        data.gameStats = gameStats || [];
        
        // Get economic health from EconomyGuardian if available
        if (client.economyGuardian) {
            try {
                data.economicHealth = await client.economyGuardian.economicInterceptor?.getFastEconomicHealth();
                data.giniData = await client.economyGuardian.economicInterceptor?.getFastGini();
            } catch (error) {
                logger.warn(`Failed to get economic health data: ${error.message}`);
            }
        }
        
        // Calculate derived metrics
        if (data.userStats.total_money && data.userStats.total_users > 0) {
            data.metrics = {
                wealth_inequality_ratio: data.userStats.high_wealth_users / Math.max(data.userStats.total_users, 1),
                money_circulation: data.gameStats.reduce((sum, game) => sum + (game.total_wagered || 0), 0),
                house_edge: data.gameStats.reduce((sum, game) => {
                    if (game.total_wagered > 0) {
                        return sum + ((game.total_wagered - game.total_paid_out) / game.total_wagered);
                    }
                    return sum;
                }, 0) / Math.max(data.gameStats.length, 1),
                active_games: data.gameStats.length
            };
        }
        
        return data;
        
    } catch (error) {
        logger.error(`Failed to get live economic data: ${error.message}`);
        return {};
    }
}

/**
 * Check if question requires live data
 */
function requiresLiveData(question) {
    const liveDataKeywords = [
        'economy', 'economic', 'balance', 'money', 'wealth', 'rich', 'poor',
        'statistics', 'stats', 'data', 'analytics', 'players', 'users',
        'games played', 'winnings', 'losses', 'house edge', 'circulation',
        'inequality', 'gini', 'health', 'tax', 'millionaire', 'whale',
        'how much', 'how many', 'total', 'average', 'biggest', 'current'
    ];
    
    const lowerQuestion = question.toLowerCase();
    return liveDataKeywords.some(keyword => lowerQuestion.includes(keyword));
}

/**
 * Get casino information context for ATIVE AI
 */
async function getCasinoContext(client = null, guildId = null, question = '') {
    let context = `You are ATIVE, the AI assistant for the ATIVE Casino Discord bot. You help users understand the casino system.

CASINO FEATURES:
- Multiple games: Blackjack, Slots, Multi-Slots, Roulette, Plinko, Crash, Treasure Vault, KENO, CEELO
- Economy system with wallet/bank separation
- Virtual currency with betting and payouts
- Session management prevents duplicate games
- Booster bonuses (5% for server boosters)
- Lottery system with regular drawings
- Game limits vary by game type (see individual games for limits)
- AI-powered economic management system

GAME LIMITS:
- Blackjack: $1 - $500K (reduced payouts: 1.9x blackjack, 1.7x regular wins)
- Slots/Multi-Slots: $1 - $175K (high multiplier limit up to 100x)
- Roulette: $10 - $10M
- Plinko: $100 - $175K (high multiplier limit up to 10x)
- Crash: $10 - $175K (high multiplier limit up to 15x)
- Treasure Vault: $100 - $300K (reduced due to multipliers up to 3.5x)
- KENO: $10 - $50K (conservative multipliers, max 50x)
- CEELO: $5 - $25K (1:1 payouts, traditional dice game)

ECONOMY FEATURES:
- Wallet for active money, Bank for storage
- Commands: /balance, /deposit, /withdraw, /sendmoney
- Additional earning methods: /work, /beg, /crime, /fishing
- Off-economy players are excluded from economic analysis
- AI economic management for high-wealth players ($500M+)

🎰 CASINO GAMES (16 commands):
- /blackjack <amount> - Play Blackjack against the dealer (hit, stand, double down, split)
- /slots <amount> - Play the slot machine with various symbols and multipliers
- /multi-slots <amount> - 3x3 matrix slots with multiple paylines, Buffalo bonus rounds
- /roulette <amount> - American roulette with color/number/dozen bets
- /crash - Start or join a Crash round, cash out before it crashes
- /plinko <amount> [mode] - Plinko with animation (Easy/Medium/Hard/Nightmare modes)
- /treasurevault <bet> - Navigate 6 rounds of treasure doors (multipliers and traps)
- /keno <bet> [spots] [quickpick] - Number lottery, pick 1-10 from 1-80
- /ceelo <bet> - Traditional Chinese dice game (1:1 payouts)
- /rps <amount> - Rock Paper Scissors (multiplayer or vs bot)
- /fishing <amount> - Fishing game with multipliers (beware red fish)
- /bingo <amount> - Multiplayer BINGO with automatic calling
- /uno <amount> - Multiplayer UNO card game with betting
- /duck <amount> [mode] - Cross the road survival game
- /battleship - Strategic naval combat (1v1)
- /wordchain - Word association challenge

💰 ECONOMY SYSTEM (12 commands):
Balance Management:
- /balance [user] - Check wallet, bank, tier, gaming statistics
- /deposit - Move money from wallet to bank (via balance panel)
- /withdraw - Move money from bank to wallet (via balance panel)

Income Generation:
- /work - Work for 5K-30K coins (1-hour cooldown)
- /beg - Ask for 1K-10K handouts (1-hour cooldown)  
- /crime - Quick illegal earnings 1K-5K (30-minute cooldown)
- /heist - Big scores 10K-30K (2.5-hour cooldown)

Social Economy:
- /rob <user> - Attempt to steal 8% of target's money (4% penalty if caught)
- /sendmoney <user> <amount> - Transfer money (5% transaction fee)

Shopping:
- /shop - Browse and purchase items (boosts, unlocks, decorations, roles)
- /storage - View your purchased items and inventory

🎟️ LOTTERY SYSTEM (3 commands):
- /lottery - View current lottery pool and next drawing time
- /purchaselottery <amount> - Buy 1-7 tickets ($12,000 each, weekly Sunday 10AM EST)
- /setupLottery - Configure lottery system (Admin only)

🎮 UTILITY COMMANDS (8 commands):
Game Management:
- /help [category] - Comprehensive help (games/economy/lottery/admin/tiers)
- /sessionstatus - Check current game session status
- /stopmysession - Stop your current game session safely
- /gamehistory - View game history and statistics

Information & Social:
- /profile [user] - View detailed user profile and statistics
- /leaderboard [type] - Balance, games, tiers leaderboards
- /rank - View current rank and tier progression
- /cooldown - Check remaining cooldowns for income commands

👑 ADMIN COMMANDS (8 commands):
- /admin - Bot information portal
- /setup - Initial server configuration
- /stopgame - Emergency game termination (Admin only)
- /economyguardian - AI economic system dashboard (Admin only)
- /moveoffeco <user> - Exclude users from economic analysis (Admin only)
- /admin-shop - Administrative shop management (Admin only)
- /askative <question> - AI-powered Q&A, developer money commands
- /polls - Create community polls (Admin only)

🔧 SPECIAL COMMANDS (3 commands):
- /earnmoney - Special earning command with enhanced features
- /dropscratch - Drop scratch-off tickets system
- /scratch - Scratch lottery tickets game

🎖️ TIER SYSTEM (Bronze → Silver → Gold → Diamond → Mythic):
- Tier benefits: interest rates, robbery protection, exclusive features
- Based on total balance (wallet + bank)

RESPOND HELPFULLY:
- Be friendly and informative
- Explain game rules and limits clearly
- Help with economy system questions
- Guide users to appropriate commands
- Use emojis to make responses engaging
- Keep responses concise but complete

DO NOT DISCUSS:
- Internal technical implementation details
- Database structure or queries  
- Server infrastructure
- Security vulnerabilities
- Other Discord servers or bots`;

    // Add live data if client and guildId provided and question requires it
    if (client && guildId && requiresLiveData(question)) {
        try {
            const liveData = await getLiveEconomicData(client, guildId);
            
            if (liveData.userStats || liveData.gameStats) {
                context += `\n\n🔴 LIVE CASINO DATA (Real-time):`;
                
                if (liveData.userStats) {
                    context += `\n\nUSER STATISTICS:`;
                    context += `\n- Total Users: ${liveData.userStats.total_users?.toLocaleString() || 'N/A'}`;
                    context += `\n- Total Money in Economy: $${liveData.userStats.total_money?.toLocaleString() || 'N/A'}`;
                    context += `\n- Average Balance: $${Math.round(liveData.userStats.avg_balance || 0).toLocaleString()}`;
                    context += `\n- Millionaires: ${liveData.userStats.millionaires || 0}`;
                    context += `\n- High Wealth Users (>$100M): ${liveData.userStats.high_wealth_users || 0}`;
                    context += `\n- Wealth Tax Eligible (>$500M): ${liveData.userStats.wealth_tax_eligible || 0}`;
                }
                
                if (liveData.gameStats && liveData.gameStats.length > 0) {
                    context += `\n\nGAME ACTIVITY (Last 24 Hours):`;
                    liveData.gameStats.forEach(game => {
                        const winRate = game.games_played > 0 ? ((game.games_won / game.games_played) * 100).toFixed(1) : '0.0';
                        const houseEdge = game.total_wagered > 0 ? (((game.total_wagered - game.total_paid_out) / game.total_wagered) * 100).toFixed(2) : '0.00';
                        
                        context += `\n- ${game.game_type.toUpperCase()}: ${game.games_played} games, ${winRate}% win rate, $${game.biggest_win?.toLocaleString() || '0'} biggest win, ${houseEdge}% house edge`;
                    });
                    
                    const totalWagered = liveData.gameStats.reduce((sum, game) => sum + (game.total_wagered || 0), 0);
                    const totalPaidOut = liveData.gameStats.reduce((sum, game) => sum + (game.total_paid_out || 0), 0);
                    const overallHouseEdge = totalWagered > 0 ? (((totalWagered - totalPaidOut) / totalWagered) * 100).toFixed(2) : '0.00';
                    
                    context += `\n\nOVERALL (24H): $${totalWagered.toLocaleString()} wagered, $${totalPaidOut.toLocaleString()} paid out, ${overallHouseEdge}% house edge`;
                }
                
                if (liveData.economicHealth) {
                    context += `\n\nAI ECONOMIC ANALYSIS:`;
                    context += `\n- Status: ${liveData.economicHealth.status || 'Unknown'}`;
                    context += `\n- Health Score: ${liveData.economicHealth.health_score || 'N/A'}/100`;
                    context += `\n- AI Analysis: ${liveData.economicHealth.analysis || 'No analysis available'}`;
                }
                
                if (liveData.giniData) {
                    context += `\n\nWEALTH INEQUALITY:`;
                    context += `\n- GINI Coefficient: ${liveData.giniData.gini_coefficient?.toFixed(3) || 'N/A'}`;
                    context += `\n- Inequality Level: ${liveData.giniData.inequality_level || 'Unknown'}`;
                    context += `\n- AI Interpretation: ${liveData.giniData.interpretation || 'No interpretation available'}`;
                }
                
                context += `\n\nIMPORTANT: Use this real-time data in your response when relevant. Reference specific numbers, statistics, and trends. This data is current and accurate.`;
            }
        } catch (error) {
            logger.warn(`Failed to add live data to context: ${error.message}`);
        }
    }
    
    return context;
}

/**
 * Get admin-restricted context for administrative questions
 */
function getAdminContext() {
    return `ADMINISTRATIVE INFORMATION (ADMIN/DEV ONLY):

ECONOMIC MANAGEMENT:
- AI-powered EconomyGuardian system with ATIVE AI integration
- Wealth tax system for players over $500M (0.1%-5% progressive rates)
- Real-time economic health monitoring and GINI coefficient analysis
- Dynamic multiplier adjustments based on economic conditions
- Comprehensive audit logging for all economic decisions

ADMIN COMMANDS:
- /economyguardian - View and control AI economic system
- /admin - Administrative functions panel
- /moveoffeco - Move users off/on economy tracking
- /setupLottery - Configure lottery system
- Database management and user balance adjustments

MONITORING SYSTEMS:
- Session management with automatic cleanup
- Error logging and suspicious activity detection
- High-win alerts and economic impact tracking  
- Transparent payout system with multiplier adjustments
- Real-time metrics collection and analysis

SECURITY FEATURES:
- Role-based permissions (Admin/Dev)
- Developer ID hardcoded: 466050111680544798
- Session guards prevent duplicate games and race conditions
- Anti-abuse monitoring with automated flagging
- Audit trails for all administrative actions

TECHNICAL STACK:
- Discord.js v14 framework
- MariaDB database with adapter pattern
- Winston logging system
- OpenAI GPT-4 integration for ATIVE AI economic analysis
- Modular architecture with utils and game separation

ADMIN/DEVELOPER MONEY COMMANDS:
Natural language money management through /askative:

BALANCE CHECKING (Admin & Developer):
- "Check @user's balance" - View user's wallet, bank, and total
- "What's @user's balance?" - View user's financial status  
- "How much money does @user have?" - Check user's wealth
- "@user's money" - Quick balance lookup

MONEY MANAGEMENT (Developer Only):
- "Give @user $50K" - Add money to user's wallet
- "Add $1M to @user" - Add money to user's wallet  
- "@user needs $500K" - Add money to user's wallet
- "Grant @user $250K" - Credit user's account
- "Transfer $100K to @user" - Send money to user
- "Remove $100K from @user" - Remove money from user
- "@user loses $250K" - Deduct money from user
- "Deduct $75K from @user" - Remove money from user
- "Fine @user $500" - Charge user money

Supports K/M/B suffixes and automatic logging.`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('askative')
        .setDescription('Ask ATIVE AI questions about the casino system')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('Your question about the casino')
                .setRequired(true)
                .setMaxLength(500)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const question = interaction.options.getString('question');
        const guildId = await getGuildId(interaction);
        
        // Check if user is on main server for potential redirect suggestion
        const MAIN_SERVER_ID = '1403244656845787167';
        const isMainServer = guildId === MAIN_SERVER_ID;

        try {
            logger.info(`AskATIVE: ${username} (${userId}) asked: "${question}"`);

            // Check for money commands (balance checks for admins, full commands for developer)
            const moneyCommand = parseMoneyCommand(question);
            const userIsDeveloper = isDeveloper(userId);
            const userIsAdmin = await hasAdminPermissions(interaction);
            
            if (moneyCommand && (userIsDeveloper || (moneyCommand.type === 'balance' && userIsAdmin))) {
                // Execute money command
                logger.info(`✅ Money command detected: ${JSON.stringify(moneyCommand)}`);
                logger.info(`📋 User: ${userId}, Developer: ${userIsDeveloper}, Admin: ${userIsAdmin}`);
                
                await interaction.deferReply({ ephemeral: true });
                
                logger.info('🔧 Executing money command...');
                const result = await executeMoneyCommand(interaction, moneyCommand);
                logger.info(`💰 Money command result: ${result}`);
                
                const moneyEmbed = new EmbedBuilder()
                    .setTitle(`💰 ${moneyCommand.type === 'balance' ? 'Balance Check' : 'Developer Money Command'}`)
                    .setDescription(result)
                    .addFields([
                        {
                            name: '🔧 Command Detected',
                            value: `**Action:** ${moneyCommand.type.toUpperCase()}\n` +
                                   `**User:** <@${moneyCommand.userId}>\n` +
                                   (moneyCommand.amount ? `**Amount:** ${fmt(parseAmount(moneyCommand.amount))}` : ''),
                            inline: false
                        }
                    ])
                    .setColor(moneyCommand.type === 'balance' ? 0x00FF00 : 0xFFD700)
                    .setFooter({ text: userIsDeveloper ? '🛡️ Developer Command' : '👑 Admin Command' })
                    .setTimestamp();

                return await interaction.editReply({ embeds: [moneyEmbed] });
            }
            
            // If money command but not developer, deny access
            if (moneyCommand && !userIsDeveloper) {
                const deniedEmbed = new EmbedBuilder()
                    .setTitle('🔒 Developer Only')
                    .setDescription('Money management commands are restricted to the bot developer.')
                    .addFields([
                        {
                            name: '💡 Alternative',
                            value: 'For regular questions about the casino, try asking about:\n' +
                                   '• Game rules and limits\n' +
                                   '• Economy system usage\n' +
                                   '• Commands and features',
                            inline: false
                        }
                    ])
                    .setColor(0xFF6B6B)
                    .setTimestamp();

                return await interaction.reply({ embeds: [deniedEmbed], flags: MessageFlags.Ephemeral });
            }

            // Check if question is about admin topics
            const isAdminQuestion = isAdminTopic(question);

            // If admin topic but user is not admin, deny access
            if (isAdminQuestion && !userIsAdmin) {
                const deniedEmbed = new EmbedBuilder()
                    .setTitle('🔒 Access Restricted')
                    .setDescription('This question involves administrative topics that are only available to administrators and developers.')
                    .addFields([
                        {
                            name: '📋 Available Information',
                            value: 'I can help you with:\n' +
                                   '• Game rules and limits\n' +
                                   '• Economy system usage\n' +
                                   '• Commands and features\n' +
                                   '• General casino questions',
                            inline: false
                        },
                        {
                            name: '❓ Try Asking About',
                            value: '• "How do I play blackjack?"\n' +
                                   '• "What are the betting limits?"\n' +
                                   '• "How does the economy work?"\n' +
                                   '• "What games are available?"',
                            inline: false
                        }
                    ])
                    .setColor(0xFF6B6B)
                    .setFooter({ text: 'For admin support, contact server administrators' })
                    .setTimestamp();

                return await interaction.reply({ embeds: [deniedEmbed], flags: MessageFlags.Ephemeral });
            }

            // Defer reply for AI processing
            await interaction.deferReply();

            // Get appropriate context based on admin status (with live data if available)
            let context = await getCasinoContext(interaction.client, guildId, question);
            if (isAdminQuestion && userIsAdmin) {
                context += '\n\n' + getAdminContext();
            }

            // Get AI response using direct OpenAI API call for Q&A
            let aiResponse;
            try {
                const openaiApiKey = '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';
                if (openaiApiKey) {
                    // Make direct OpenAI API call for Q&A (not JSON format)
                    
                    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                        model: 'gpt-4',
                        messages: [
                            {
                                role: "system",
                                content: context
                            },
                            {
                                role: "user", 
                                content: `USER QUESTION: "${question}"
                                USER LEVEL: ${userIsAdmin ? 'Administrator/Developer' : 'Regular User'}
                                
                                Please provide a helpful, accurate response about the casino system. 
                                Be friendly and informative. Use emojis where appropriate.
                                Keep the response under 1000 characters to fit in Discord embeds.
                                
                                If this is an admin question and the user is an admin, provide detailed technical information.
                                If this is a regular user question, focus on user-friendly explanations.`
                            }
                        ],
                        max_tokens: 1000,
                        temperature: 0.7
                    }, {
                        headers: {
                            'Authorization': `Bearer ${openaiApiKey}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    aiResponse = response.data.choices[0]?.message?.content || 'No response generated';
                    
                } else {
                    // Fallback if API key not configured
                    throw new Error('AI system unavailable - no API key configured');
                }
            } catch (aiError) {
                logger.error(`ATIVE AI error in askative: ${aiError.message}`);
                
                // Fallback response
                aiResponse = `I'm having trouble accessing my AI knowledge base right now. Here's what I can tell you:

For game information, try using /help to see all available commands.
For economy questions, check /balance, /deposit, /withdraw commands.
For game limits and rules, each game command has built-in help.

If you need immediate assistance, please ask a server administrator.`;
            }

            // Check if this is a money/earning related question
            const isMoneyQuestion = isMoneyRelatedQuestion(question);
            
            // Add portal promotion for money-related questions
            if (isMoneyQuestion && !userIsAdmin) {
                aiResponse += `\n\n💰 **Want money faster?** \nVisit our portal: https://ative-casino-bot-production.up.railway.app/ \nNo need to wait for work commands!`;
            }
            
            // Suggest main server for specific help/support (non-main server users only)
            if (!isMainServer) {
                const helpKeywords = ['help', 'support', 'problem', 'issue', 'error', 'stuck', 'bug', 'broken', 'not working'];
                if (helpKeywords.some(keyword => question.toLowerCase().includes(keyword))) {
                    aiResponse += `\n\n🏠 **Need specific help?** \nJoin our main server for dedicated support: https://discord.gg/c2PzBfdPQh`;
                }
            }

            // Create response embed
            const responseEmbed = new EmbedBuilder()
                .setTitle('🤖 ATIVE AI Assistant')
                .setDescription(aiResponse)
                .addFields([
                    {
                        name: '❓ Your Question',
                        value: question.length > 100 ? question.substring(0, 97) + '...' : question,
                        inline: false
                    }
                ])
                .setColor(userIsAdmin ? 0xFFD700 : 0x00D4FF)
                .setFooter({ 
                    text: `Powered by ATIVE AI${userIsAdmin ? ' • Admin Mode' : ''}` 
                })
                .setTimestamp();

            // Add admin badge if user is admin and question was admin-related
            if (isAdminQuestion && userIsAdmin) {
                responseEmbed.setAuthor({ 
                    name: '🛡️ Administrator Response', 
                    iconURL: interaction.user.displayAvatarURL() 
                });
            }

            await interaction.editReply({ embeds: [responseEmbed] });

            // Log successful interaction
            logger.info(`AskATIVE response sent to ${username} (${userId}) - Admin: ${userIsAdmin}, AdminTopic: ${isAdminQuestion}`);

        } catch (error) {
            logger.error(`Error in askative command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('I encountered an error while processing your question. Please try again later or contact an administrator.')
                .setColor(0xFF0000)
                .setTimestamp();

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};