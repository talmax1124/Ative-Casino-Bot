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
const rateLimiter = require('../UTILS/rateLimiter');
const optimizedAIService = require('../UTILS/optimizedAIService');

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
 * Check if question is money/earning related
 */
function isMoneyRelatedQuestion(question) {
    const moneyPatterns = [
        /\b(?:money|cash|earn|work|income|rich|wealth|poor|broke)\b/i,
        /\b(?:balance|wallet|bank|deposit|withdraw)\b/i,
        /\b(?:buy|purchase|cost|price|expensive|cheap)\b/i,
        /\b(?:fast|quick|easy|slow).*(?:money|cash|earn)\b/i,
        /\bhow.*(?:get|make|earn).*(?:money|cash)\b/i,
        /\b(?:need|want|get).*(?:money|cash)\b/i,
        /\b(?:gambling|bet|betting|casino|game|games)\b/i,
        /\b(?:win|winning|lose|losing|profit|loss)\b/i
    ];
    
    return moneyPatterns.some(pattern => pattern.test(question));
}

/**
 * Check if question is asking for a joke
 */
function isJokeRequest(question) {
    const jokePatterns = [
        /\b(?:tell|give).*(?:me|us).*(?:a|some).*(?:joke|jokes)\b/i,
        /\b(?:joke|jokes)\b/i,
        /\b(?:funny|humor|humour|comedy|comedic)\b/i,
        /\bmake me laugh\b/i,
        /\b(?:something funny|be funny)\b/i,
        /\bwant.*(?:joke|laugh|funny)\b/i,
        /\b(?:dad joke|dad jokes|puns?|riddles?)\b/i,
        /\b(?:roast|insult|burn|savage)\b/i,
        /\b(?:dirty|adult|inappropriate|nsfw|sexual|rude)\b.*joke/i,
        /\b(?:dark|twisted|morbid|sick)\b.*(?:humor|joke)/i,
        /\b(?:pickup line|pick.*up.*line)\b/i,
        /\bentertain.*me\b/i
    ];
    
    return jokePatterns.some(pattern => pattern.test(question));
}

/**
 * Get a professional-level AI-generated joke with retry logic
 */
async function getAIJoke(question) {
    const MAX_RETRIES = 3;
    const INITIAL_DELAY = 1000;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const openaiApiKey = process.env.OPENAI_API_KEY;
            
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: "system",
                        content: "You are a professional stand-up comedian with impeccable timing and wit. Create original, genuinely hilarious jokes that match the user's request. You can create clean comedy, adult humor, roasts, dark comedy, or any style requested - adjust your content appropriately to the request. Your jokes should be clever, well-crafted, and showcase professional-level comedic timing. Make it memorable and actually funny - not just basic wordplay."
                    },
                    {
                        role: "user",
                        content: `Create a professional-quality original joke based on this request: "${question.substring(0, 200)}". Match the style and tone they're asking for. Make it genuinely funny and clever. Return ONLY the joke content, no additional text or explanations.`
                    }
                ],
                max_tokens: 150,
                temperature: 0.9,
                presence_penalty: 0.6,
                frequency_penalty: 0.6
            }, {
                headers: {
                    'Authorization': `Bearer ${openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            
            const joke = response.data.choices[0]?.message?.content?.trim();
            
            if (joke && joke.length > 0) {
                logger.info(`AI joke generated successfully on attempt ${attempt}`);
                return joke;
            } else {
                throw new Error('Empty joke response');
            }
            
        } catch (error) {
            logger.warn(`AI joke attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}`);
            
            if (error.response?.status === 429) {
                const delay = INITIAL_DELAY * Math.pow(2, attempt - 1);
                logger.info(`Rate limited, waiting ${delay}ms before retry ${attempt}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            if (attempt === MAX_RETRIES) {
                logger.error(`All AI joke attempts failed, falling back to dad joke`);
                return getFallbackJoke();
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    return getFallbackJoke();
}

/**
 * Get a fallback dad joke when AI fails
 */
function getFallbackJoke() {
    const dadJokes = [
        "Why don't scientists trust atoms? Because they make up everything!",
        "I invented a new word: Plagiarism!",
        "Why don't eggs tell jokes? They'd crack each other up!",
        "What do you call a fake noodle? An impasta!",
        "Why did the scarecrow win an award? Because he was outstanding in his field!",
        "I'm reading a book about anti-gravity. It's impossible to put down!",
        "What do you call a dinosaur that crashes his car? Tyrannosaurus Wrecks!",
        "Why don't skeletons fight each other? They don't have the guts!",
        "What's the best thing about Switzerland? I don't know, but the flag is a big plus!",
        "Why do fathers take an extra pair of socks when they go golfing? In case they get a hole in one!",
        "I used to hate facial hair, but then it grew on me!",
        "What do you call a bear with no teeth? A gummy bear!",
        "Why don't scientists trust stairs? Because they're always up to something!",
        "What's orange and sounds like a parrot? A carrot!",
        "How do you organize a space party? You planet!",
        "Why did the coffee file a police report? It got mugged!",
        "What do you call a sleeping bull? A bulldozer!",
        "I told my wife she was drawing her eyebrows too high. She looked surprised!",
        "Why don't oysters donate? Because they're shellfish!",
        "What do you call a factory that makes okay products? A satisfactory!"
    ];
    
    return dadJokes[Math.floor(Math.random() * dadJokes.length)];
}

/**
 * Get AI response with retry logic and rate limiting handling
 */
async function getAIResponse(context, username, question, userIsAdmin) {
    const MAX_RETRIES = 3;
    const INITIAL_DELAY = 1000;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const openaiApiKey = process.env.OPENAI_API_KEY;
            
            if (!openaiApiKey) {
                throw new Error('AI system unavailable - no API key configured');
            }
            
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: "system",
                        content: context
                    },
                    {
                        role: "user", 
                        content: `USER: ${username} (${userIsAdmin ? 'Admin' : 'Player'})
                        QUESTION: "${question}"
                        
                        Respond as ATIVE, the enthusiastic casino AI! Make your response:
                        - Personal and engaging (use their context if relevant)
                        - Informative with specific details
                        - Include relevant emojis for visual appeal
                        - Encourage them to try specific games or commands
                        - Keep under 900 characters for Discord embeds
                        - Match their energy level
                        
                        If they ask about games, suggest specific ones based on their question.
                        If they ask about earning money, give practical steps.
                        If they seem new, guide them through getting started.
                        If they're an admin asking technical questions, provide detailed info.
                        
                        Be helpful, friendly, and make them excited about using the casino!`
                    }
                ],
                max_tokens: 1000,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });
            
            const aiResponse = response.data.choices[0]?.message?.content;
            
            if (aiResponse && aiResponse.trim().length > 0) {
                logger.info(`AI response generated successfully on attempt ${attempt}`);
                return aiResponse.trim();
            } else {
                throw new Error('Empty AI response');
            }
            
        } catch (error) {
            logger.warn(`AI response attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}`);
            
            if (error.response?.status === 429) {
                const delay = INITIAL_DELAY * Math.pow(2, attempt - 1);
                logger.info(`Rate limited, waiting ${delay}ms before retry ${attempt}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            if (error.response?.status === 503 || error.response?.status === 502) {
                logger.info(`Server error, waiting ${1000 * attempt}ms before retry ${attempt}`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                continue;
            }
            
            if (attempt === MAX_RETRIES) {
                throw error;
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
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
    if (cleanAmount.includes('b')) return Math.floor(number * 4000000);
    
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
    
    if (parsedAmount > 400000) { // 400K limit
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
                COUNT(CASE WHEN wallet + bank > 400000 THEN 1 END) as high_wealth_users,
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
            WHERE guild_id = ? AND played_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
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
    let context = `You are ATIVE, the friendly AI assistant for the ATIVE Casino Discord bot! 🎰 I'm here to help you navigate our exciting casino world and answer all your questions.

✨ **Welcome to ATIVE Casino!** ✨
Our casino offers thrilling games, a robust economy system, and exciting features for all players. Whether you're a high roller or just starting out, I'm here to guide you through everything!

🎰 **CASINO GAMES** - 16 Exciting Options!
🃏 **Card & Table Games:**
- **/blackjack** [$1-$500K] - Classic 21! Hit, stand, double down, or split. Reduced payouts: 1.9x blackjack, 1.7x regular wins
- **/roulette** [$10-$10M] - American roulette with red/black, numbers, dozens, and more betting options
- **/ceelo** [$5-$25K] - Traditional Chinese dice game with 1:1 payouts

🎰 **Slot Machines:**
- **/slots** [$1-$175K] - Classic slot machine with various symbols and up to 100x multipliers!
- **/multi-slots** [$1-$175K] - 3x3 matrix slots with multiple paylines and Buffalo bonus rounds!

🎯 **Skill & Strategy Games:**
- **/plinko** [$100-$175K] - Drop the ball! Choose Easy/Medium/Hard/Nightmare modes (up to 10x multiplier)
- **/treasurevault** [$100-$300K] - Navigate 6 rounds of doors with multipliers up to 3.5x and avoid traps!
- **/crash** [$10-$175K] - Cash out before the crash! Multipliers up to 15x
- **/keno** [$10-$50K] - Number lottery! Pick 1-10 numbers from 1-80 (max 50x multiplier)

🎮 **Multiplayer & Fun Games:**
- **/rps** - Rock Paper Scissors (multiplayer or vs bot)
- **/fishing** - Catch fish for multipliers (but watch out for red fish!)
- **/bingo** - Multiplayer BINGO with automatic number calling
- **/uno** - Classic UNO card game with betting
- **/duck** - Cross the road survival game with different modes
- **/battleship** - Strategic naval combat (1v1)
- **/wordchain** - Word association challenge
- **/scratch** - Scratch-off lottery tickets for instant wins!

💰 **ECONOMY SYSTEM** - Your Financial Hub!
💳 **Balance Management:**
- **/balance** [user] - Check wallet, bank, tier, and gaming statistics
- **Deposit/Withdraw** via balance panel - Move money between wallet (active) and bank (storage)

💼 **Income Generation:**
- **/work** - Honest work pays $5K-$30K (1-hour cooldown)
- **/beg** - Ask for handouts $1K-$10K (1-hour cooldown)
- **/crime** - Quick illegal money $1K-$5K (30-minute cooldown)
- **/heist** - Big criminal scores $10K-$30K (2.5-hour cooldown)
- **/earnmoney** - Special enhanced earning features

🤝 **Social Economy:**
- **/sendmoney** <user> <amount> - Transfer money (5% transaction fee)
- **/rob** <user> - Steal 8% of their money (4% penalty if caught)

🛍️ **Shopping & Items:**
- **/shop** - Buy boosts, unlocks, decorations, roles, and more!
- **/storage** - View your purchased items and inventory

🎟️ **LOTTERY SYSTEM** - Bi-Weekly Jackpots!
- **/lottery** - View current pool and next drawing (Tuesdays & Saturdays 10AM EST)
- **/purchaselottery** - Buy 1-7 tickets at $12,000 each
- **Auto-drawings** every Tuesday & Saturday with massive payouts!

🏆 **TIER SYSTEM** - Unlock Benefits!
**Bronze → Silver → Gold → Diamond → Mythic**
- Higher tiers = better interest rates, robbery protection, exclusive features
- Based on total balance (wallet + bank combined)

🎮 **UTILITY COMMANDS** - Helpful Tools!
- **/help** [category] - Complete help system (games/economy/lottery/admin/tiers)
- **/profile** [user] - Detailed user stats and achievements
- **/leaderboard** [type] - See top players by balance, games, tiers
- **/rank** - Your current ranking and tier progression
- **/cooldown** - Check remaining time on income commands
- **/sessionstatus** - Check if you have active game sessions
- **/stopmysession** - Safely exit stuck game sessions
- **/gamehistory** - View your complete gaming history

✨ **Special Features:**
- **Server Booster Bonus**: +5% on all winnings!
- **Session Management**: Prevents duplicate games and ensures fair play
- **AI Economic System**: Advanced economic analysis and management
- **Anti-Abuse Protection**: Fair gaming environment for everyone
- **Cross-Server Support**: Your balance works across multiple servers

🎯 **How to Get Started:**
1. Use **/balance** to check your starting funds
2. Try **/work** to earn some initial money
3. Start with lower-limit games like **/slots $1** or **/blackjack $1**
4. Gradually work your way up to bigger games!

💡 **Pro Tips:**
- Manage your bankroll: use **/deposit** to save winnings safely
- Check **/cooldown** to maximize income generation
- Use **/gamehistory** to track your performance
- Server boosters get 5% bonus on all winnings!

🎪 **What Makes ATIVE Special:**
- Fair, transparent gaming with real-time statistics
- Active community with regular events and updates
- Comprehensive help system and friendly AI support
- Regular new games and features added
- Safe, secure economy system

I'm here to make your casino experience amazing! Ask me about specific games, strategies, economy tips, or anything else you'd like to know! 🌟

**Response Style Guidelines:**
- Be enthusiastic and friendly
- Use relevant emojis to make responses engaging
- Provide specific, actionable information
- Keep responses informative but concise
- Match the user's energy and tone
- Always encourage responsible gaming

**What I DON'T discuss:**
- Internal technical details or database structure
- Server infrastructure or security vulnerabilities
- Other Discord servers or competing bots`;

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

            // Check if it's a joke request (jokes bypass rate limiting)
            const isJoke = isJokeRequest(question);
            
            if (isJoke) {
                // Handle joke request without rate limiting using optimized service
                await interaction.deferReply();
                
                const joke = await optimizedAIService.getOptimizedResponse(question, '', username, false, true);
                
                const jokeEmbed = new EmbedBuilder()
                    .setTitle('😂 Professional Comedy Time!')
                    .setDescription(joke)
                    .addFields([
                        {
                            name: '🎭 Joke Request',
                            value: question.length > 100 ? question.substring(0, 97) + '...' : question,
                            inline: false
                        }
                    ])
                    .setColor(0xFFA500)
                    .setFooter({ text: 'AI-generated jokes don\'t count towards your hourly limit! 🎪' })
                    .setTimestamp();

                logger.info(`AI joke request fulfilled for ${username} (${userId}) - bypassed rate limit`);
                return await interaction.editReply({ embeds: [jokeEmbed] });
            }

            // Rate limiting check for non-jokes (exempts admins, developers, and system accounts)
            const rateLimitCheck = await rateLimiter.checkRateLimit(userId, interaction, {
                requestsPerHour: 20,    // 20 requests per hour for regular users
                requestsPerDay: 100,    // 100 requests per day for regular users
                windowHours: 1          // 1 hour window
            });

            if (!rateLimitCheck.allowed) {
                const rateLimitEmbed = new EmbedBuilder()
                    .setTitle('⏰ Rate Limit Reached')
                    .setDescription(`You've reached the maximum number of ATIVE AI requests for this hour.`)
                    .addFields([
                        {
                            name: '📊 Usage Limit',
                            value: `• **Limit:** 20 requests per hour\n• **Remaining:** ${rateLimitCheck.remaining}\n• **Resets:** <t:${Math.floor(rateLimitCheck.resetTime / 1000)}:R>`,
                            inline: false
                        },
                        {
                            name: '💡 While You Wait',
                            value: `• Use **/help** for command information\n• Try **/balance** to check your stats\n• Explore games with **/slots** or **/blackjack**\n• Ask for dad jokes (unlimited!)`,
                            inline: false
                        },
                        {
                            name: '🔓 Unlimited Access',
                            value: `Server administrators and developers have unlimited access to ATIVE AI.`,
                            inline: false
                        }
                    ])
                    .setColor(0xFFA500)
                    .setFooter({ text: `Rate limiting helps control AI costs and ensures fair access for everyone` })
                    .setTimestamp();

                return await interaction.reply({ embeds: [rateLimitEmbed], flags: MessageFlags.Ephemeral });
            }

            // Log rate limit status if user is not exempt
            if (!rateLimitCheck.exemptReason) {
                logger.info(`Rate limit check: ${userId} - ${20 - rateLimitCheck.remaining}/20 requests used, ${rateLimitCheck.remaining} remaining`);
            } else {
                logger.debug(`Rate limit exempted: ${userId} (${rateLimitCheck.exemptReason})`);
            }

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

            // Get AI response using optimized AI service with caching and token optimization
            let aiResponse;
            try {
                aiResponse = await optimizedAIService.getOptimizedResponse(question, context, username, userIsAdmin, false);
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
                .setTimestamp();

            // Set footer with rate limit info for regular users
            if (rateLimitCheck.exemptReason) {
                responseEmbed.setFooter({ 
                    text: `Powered by ATIVE AI • ${rateLimitCheck.exemptReason} Mode` 
                });
            } else {
                responseEmbed.setFooter({ 
                    text: `Powered by ATIVE AI • ${rateLimitCheck.remaining}/20 requests remaining this hour` 
                });
            }

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