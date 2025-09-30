/**
 * Blackjack game command for the casino bot
 * Classic blackjack with hit, stand, double down, and split functionality
 */

const { SlashCommandBuilder, MessageFlags, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { PayoutManager, GameType, GameResult, TimeoutManager } = require('../UTILS/gameUtils');
const { fmt, fmtDelta, getGuildId, sendLogMessage, parseAmount } = require('../UTILS/common');
const { BlackjackGame } = require('../GAMES/blackjack');
const GamePanel = require('../UTILS/gamePanel');
const sessionManager = require('../UTILS/sessionManager');
const { SessionState } = sessionManager;
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');
const { GamePanelUtil } = require('../UTILS/gamePanelUtil');
const { buildSessionEmbed, buildButtons } = require('../UTILS/gameSessionKit');
const levelingSystem = require('../UTILS/levelingSystem');
const transparentPayoutManager = require('../UTILS/transparentPayoutManager');
// LEGACY: economicManager replaced by EconomyGuardian AI
// const economicManager = require('../UTILS/economicManager');
// EconomyGuardianInterface removed - using bulletproof economy
const tuningManager = require('../UTILS/tuningManager');
const allInManager = require('../UTILS/allInManager');

// Game type constant
const SMGameType = { BLACKJACK: 'blackjack' };

// PLAYER-FRIENDLY DIFFICULTY MODES - Much better odds and payouts
const BLACKJACK_MODES = {
    safe: {
        name: '🛡️ Safe',
        description: 'Player-friendly mode with great payouts',
        minBet: 500,
        blackjackMultiplier: 2.5,    // 2.5x for blackjack (way better!)
        winMultiplier: 1.95,         // 1.95x for regular wins (almost double!)
        houseEdge: 0.005,            // 0.5% house edge (realistic)
        emoji: '🛡️',
        color: '#4CAF50'
    },
    balanced: {
        name: '⚖️ Balanced',
        description: 'Fair mode with good payouts',
        minBet: 1000,
        blackjackMultiplier: 2.25,   // 2.25x for blackjack
        winMultiplier: 1.85,         // 1.85x for regular wins
        houseEdge: 0.01,             // 1% house edge
        emoji: '⚖️',
        color: '#FF9800'
    },
    risky: {
        name: '⚡ Risky',
        description: 'Higher rewards with slightly more risk',
        minBet: 2500,
        blackjackMultiplier: 2.0,    // 2.0x for blackjack
        winMultiplier: 1.75,         // 1.75x for regular wins
        houseEdge: 0.02,             // 2% house edge
        emoji: '⚡',
        color: '#FF8800'
    },
    extreme: {
        name: '🔥 Extreme',
        description: 'Highest stakes with best potential returns',
        minBet: 5000,
        blackjackMultiplier: 1.8,    // 1.8x for blackjack
        winMultiplier: 1.65,         // 1.65x for regular wins
        houseEdge: 0.03,             // 3% house edge
        emoji: '🔥',
        color: '#FF0000'
    }
};

// Active games storage (indexed by sessionId for better session management)
const activeGames = new Map();

// Initialize Game Panel Util
const gamePanelUtil = new GamePanelUtil();


/**
 * Create game embed with consistent styling using gameSessionKit
 */
async function createGameEmbed(game, user, showDealer = false, balance = null, economicIndicators = null, regulatedPayout = null) {
    // Economy badge removed - using bulletproof economy system
    // Check for playfor context
    const playForRecipient = global.playForContext?.recipientName;
    const playingForSomeoneElse = playForRecipient && global.playForContext.recipientId;
    
    // Top fields for game information
    const topFields = [];
    
    // Add playfor indicator if applicable
    if (playingForSomeoneElse) {
        topFields.push({
            name: '🎁 Playing For',
            value: `@${playForRecipient}`,
            inline: true
        });
    }
    
    // Dealer's hand - when hidden, only show value of visible card
    let dealerDisplay;
    if (showDealer) {
        dealerDisplay = `${game.dealerHand.toString()} (${game.dealerHand.getValue()})`;
    } else {
        // Show only the face-up card (first card) and hide the second card
        const visibleCard = game.dealerHand.cards[0]; // First card is visible
        const visibleValue = visibleCard ? visibleCard.getValue() : 0;
        const hiddenCardDisplay = game.dealerHand.cards.length > 1 ? `${visibleCard.toString()} 🂠` : visibleCard.toString();
        dealerDisplay = `${hiddenCardDisplay} (${visibleValue})`;
    }
    
    topFields.push({
        name: '🏠 DEALER HAND',
        value: dealerDisplay,
        inline: false
    });
    
    // Player's hand(s)
    if (game.splitHands.length > 0) {
        let playerDisplay = '';
        for (let i = 0; i < game.splitHands.length; i++) {
            const hand = game.splitHands[i];
            const isCurrentHand = i === game.currentHandIndex && !game.gameEnded;
            const status = hand.isBusted() ? ' [BUST]' : hand.isStood() ? ' [STAND]' : '';
            const doubledStatus = hand.isDoubled() ? ' [DOUBLED]' : '';
            const indicator = isCurrentHand ? '→ ' : '  ';
            playerDisplay += `${indicator}Hand ${i + 1}: ${hand.toString()} (${hand.getValue()})${status}${doubledStatus}\n`;
        }
        topFields.push({
            name: '🎲 YOUR HANDS',
            value: playerDisplay.trim(),
            inline: false
        });
    } else {
        const playerStatus = game.playerHand.isBusted() ? ' [BUST]' : '';
        const playerDisplay = `${game.playerHand.toString()} (${game.playerHand.getValue()})${playerStatus}`;
        topFields.push({
            name: '🎲 YOUR HAND', 
            value: playerDisplay,
            inline: false
        });
    }

    // Banking fields
    const bankFields = [];
    if (balance) {
        bankFields.push(
            { name: '💵 Wallet', value: fmt(balance.wallet), inline: true },
            { name: '🏦 Bank', value: fmt(balance.bank), inline: true },
            { name: '🎯 Bet', value: fmt(game.betAmount), inline: true }
        );
    }

    // Determine game stage and color
    let stageText = '';
    let color = 0x00ff00; // Bright green like reference

    if (game.gameEnded) {
        const results = await game.getResults();
        
        // Use regulated payout if available, otherwise fall back to original game result
        if (regulatedPayout !== null) {
            // Determine result based on actual regulated payout
            if (regulatedPayout > 0) {
                const result = results[0];
                if (result && result.outcome === 'BLACKJACK') {
                    stageText = 'BLACKJACK';
                    color = 0xFFD700; // Gold for blackjack
                } else if (result && result.outcome === 'PUSH') {
                    stageText = 'PUSH';
                    color = 0xFFFF00; // Yellow for push
                } else {
                    stageText = results.length > 1 ? 'SPLIT WIN' : 'WIN';
                    color = 0x00ff00; // Green for win
                }
            } else {
                const result = results[0];
                if (result && result.outcome === 'PUSH') {
                    stageText = 'PUSH';
                    color = 0xFFFF00; // Yellow for push
                } else {
                    stageText = results.length > 1 ? 'SPLIT LOSS' : 'LOSS';
                    color = 0xff0000; // Red for loss
                }
            }
        } else {
            // Original logic for cases where regulated payout isn't available yet
            if (results.length > 1) {
                // Split hands results
                const wins = results.filter(r => r.won).length;
                stageText = wins > 0 ? 'SPLIT WIN' : 'SPLIT LOSS';
                color = wins > 0 ? 0x00ff00 : 0xff0000;
            } else {
                const result = results[0];
                if (result.outcome === 'BLACKJACK') {
                    stageText = 'BLACKJACK';
                    color = 0xFFD700; // Gold for blackjack
                } else if (result.won) {
                    stageText = 'WIN';
                    color = 0x00ff00; // Green for win
                } else if (result.outcome === 'PUSH') {
                    stageText = 'PUSH';
                    color = 0xFFFF00; // Yellow for push
                } else {
                    stageText = 'LOSS';
                    color = 0xff0000; // Red for loss
                }
            }
        }
    } else {
        stageText = 'GAME';
        color = 0x00ff00; // Bright green for active game
    }

    // 🤖 Add ATIVE AI economic analysis to embed if available
    let footer = game.gameEnded ? 'Game completed' : 'Choose your action';
    if (economicIndicators && !game.gameEnded) {
        footer += ` • AI Economy: ${economicIndicators.status} ${economicIndicators.healthScore}/100 (${economicIndicators.inequality} inequality)`;
    }
    
    return buildSessionEmbed({
        title: `🃏 ${user.displayName}'s Blackjack`,
        topFields,
        bankFields,
        stageText,
        color: economicIndicators?.color || color,
        footer
    });
}

/**
 * Create game table image with cards only
 */
async function createGameTableImage(game, showDealerCard = false) {
    try {
        return await gamePanelUtil.createBlackjackTableImage({
            playerCards: game.playerHand.toString(),
            dealerCards: game.dealerHand.toString(),
            showDealerCard,
            splitHands: game.splitHands.map(hand => hand.toString())
        });
    } catch (error) {
        logger.error(`Error creating game table image: ${error.message}`);
        // Return null if image creation fails
        return null;
    }
}

/**
 * Create action buttons for blackjack game
 */
function createGameButtons(userId, game = null) {
    const actions = ['help'];
    
    if (game && !game.gameEnded) {
        // Check for insurance first (highest priority)
        if (game.canOfferInsurance()) {
            actions.unshift('insurance_yes', 'insurance_no');
        } else {
            actions.unshift('hit', 'stand');
            
            if (game.canDouble()) {
                actions.splice(2, 0, 'double');
            }
            
            if (game.canSplit()) {
                actions.splice(-1, 0, 'split');
            }
        }
    }
    
    const customButtons = actions.map(action => {
        const button = new ButtonBuilder()
            .setCustomId(`bj-${userId}-${action}`)
            .setStyle(ButtonStyle.Secondary);
            
        switch (action) {
            case 'hit':
                button.setLabel('Hit').setEmoji('👊').setStyle(ButtonStyle.Primary);
                break;
            case 'stand': 
                button.setLabel('Stand').setEmoji('✋').setStyle(ButtonStyle.Secondary);
                break;
            case 'double':
                button.setLabel('Double Down').setEmoji('⏫').setStyle(ButtonStyle.Success);
                break;
            case 'split':
                button.setLabel('Split').setEmoji('↔️').setStyle(ButtonStyle.Success);
                break;
            case 'insurance_yes':
                button.setLabel('Take Insurance').setEmoji('🛡️').setStyle(ButtonStyle.Primary);
                break;
            case 'insurance_no':
                button.setLabel('No Insurance').setEmoji('❌').setStyle(ButtonStyle.Secondary);
                break;
            case 'help':
                button.setLabel('Help').setEmoji('❓').setStyle(ButtonStyle.Secondary);
                break;
        }
        
        return button;
    });
    
    return GamePanel.createGameButtons({
        customButtons
    });
}


module.exports = {
    data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Play blackjack against the dealer!')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to bet (supports K/M/B, "all", "all in", "half")')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Risk mode (higher modes have better payouts but higher minimum bets)')
                .setRequired(false)
                .addChoices(
                    { name: '🛡️ Safe (Min: $500, BJ: 1.45x, Win: 0.95x)', value: 'safe' },
                    { name: '⚖️ Balanced (Min: $1K, BJ: 1.5x, Win: 0.98x)', value: 'balanced' },
                    { name: '⚡ Risky (Min: $2.5K, BJ: 1.55x, Win: 1.02x)', value: 'risky' },
                    { name: '🔥 Extreme (Min: $5K, BJ: 1.6x, Win: 1.05x)', value: 'extreme' }
                )
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const amount = interaction.options.getString('amount');
        const selectedMode = interaction.options.getString('mode') || 'balanced';
        const guildId = await getGuildId(interaction);
        logger.debug(`Blackjack execute called by ${username} (${userId}) in guild ${guildId} with amount '${amount}' and mode '${selectedMode}'`);

        // Get mode configuration
        const modeConfig = BLACKJACK_MODES[selectedMode] || BLACKJACK_MODES.balanced;

        let validation; // Declare validation at function scope
        
        try {
            // Check maintenance mode first
            const maintenanceGuard = require('../UTILS/maintenanceGuard');
            const maintenanceCheck = await maintenanceGuard.check(guildId, 'blackjack');
            if (!maintenanceCheck.allowed) {
                return await interaction.reply({ embeds: [maintenanceCheck.embed], flags: MessageFlags.Ephemeral });
            }

            // Validate session before proceeding using modern session system (via sessionGuard)
            const sessionGuard = require('../UTILS/sessionGuard');
            const check = await sessionGuard.check(userId, guildId, SMGameType.BLACKJACK, interaction.client);
            logger.debug(`canCreateSession result for ${userId}: ${JSON.stringify({ allowed: check.allowed, reason: check.code })}`);
            if (!check.allowed) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Session Error')
                    .setDescription(check.message)
                    .setColor(0xFF0000)
                    .setTimestamp();
                return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Ensure user exists and get balance
            await dbManager.ensureUser(userId, username);
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            logger.debug(`Fetched user balance for ${userId}: wallet=${userBalance.wallet}, bank=${userBalance.bank}`);

            // 🤖 AI ECONOMIC INTERCEPTION - Analyze transaction before processing
            const parsedAmount = parseAmount(amount);
            // EconomyGuardianInterface removed - using bulletproof economy
            const aiResult = null;
            
            // 🚀 AI SILENT OPTIMIZATION: Never block transactions, only adjust payouts silently
            // All transactions proceed normally for seamless high-volume gameplay
            
            // AI analysis logging removed - using bulletproof economy
            
            // 🎛️ INITIALIZE AI SYSTEMS
            await tuningManager.initialize();
            await allInManager.initialize();
            
            // Validate and deduct bet with mode-specific minimum (no max bet limit - bulletproof economy handles risk)
            validation = await PayoutManager.validateAndDeductBet(
                interaction,
                amount,
                GameType.BLACKJACK,
                modeConfig.minBet,  // Mode-specific minimum bet
                null                // No max bet limit
            );
            
            // Log all-in bets for monitoring
            const isAllIn = await allInManager.isAllInBet(userId, amount);
            if (isAllIn) {
                // Get user's total wealth for logging
                const userBalance = await dbManager.getUserBalance(userId, guildId);
                const totalWealth = userBalance.wallet + userBalance.bank;
                logger.info(`🎯 BLACKJACK ALL-IN: ${userId} -> ${fmt(amount)} (${((amount / totalWealth) * 100).toFixed(1)}% of wealth)`);
            }

            if (!validation.isValid) {
                return await interaction.reply({ embeds: [validation.errorEmbed], flags: MessageFlags.Ephemeral });
            }
            
            // Balance validation is handled by PayoutManager.validateAndDeductBet

            const betAmount = validation.parsedAmount;
            logger.debug(`Bet validated for ${userId}: parsedAmount=${betAmount}`);

            // Create game session with enhanced protection
            const sessionResult = await sessionManager.createSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: SMGameType.BLACKJACK,
                betAmount,
                betPreDeducted: true,
                timeout: 300000, // 5 minutes
                metadata: {
                    gamePhase: 'dealing',
                    dealerHand: [],
                    playerHand: [],
                    gameStarted: false,
                    mode: selectedMode,
                    modeConfig: modeConfig
                },
                interaction
            });
            
            if (!sessionResult.success) {
                throw new Error(`Session creation failed: ${sessionResult.error}`);
            }

            const sessionId = sessionResult.sessionId;
            logger.debug(`Blackjack session created: ${sessionId} for ${userId}`);

            // Create new game with mode configuration and link to session
            const game = new BlackjackGame(userId, betAmount, modeConfig);
            game.dealInitialCards();
            game.sessionId = sessionId; // Link game to session
            
            // Store game with AI result for later use
            const sessionData = {
                game: game,
                aiResult: aiResult, // Store AI analysis results
                userId: userId,
                betAmount: betAmount
            };
            activeGames.set(sessionId, sessionData);

            // Update session with initial game data
            await sessionManager.updateSession(sessionId, {
                gameData: {
                    dealerHand: game.dealerHand.cards.map(c => c.toString()),
                    playerHand: game.playerHand.cards.map(c => c.toString()),
                    dealerValue: game.dealerHand.getValue(),
                    playerValue: game.playerHand.getValue(),
                    gamePhase: 'playing',
                    gameStarted: true
                }
            }, 'initial_deal');

            // Create embed and table image with economic indicators
            const economicIndicators = null; // EconomyGuardianInterface removed
            const embed = await createGameEmbed(game, interaction.user, false, userBalance, economicIndicators);
            const actionRows = createGameButtons(userId, game);
            const tableImage = await createGameTableImage(game, false);

            // Send game message with visual table
            const messageData = { 
                embeds: [embed], 
                components: actionRows
            };
            
            if (tableImage) {
                messageData.files = [{ attachment: tableImage, name: 'blackjack-table.png' }];
                embed.setImage('attachment://blackjack-table.png');
            }
            
            await interaction.reply(messageData);
            logger.debug(`Initial blackjack message sent for session ${sessionId}`);

            // Session timeout is handled by sessionManager

            // Check for immediate blackjack
            if (game.playerHand.isBlackjack()) {
                game.dealerPlay();
                
                // Mark game as ended to pass control to endGame function  
                game.gameEnded = true;
                
                // Use endGame function to handle payout and cleanup (includes economic multiplier)
                await module.exports.endGame(interaction, game, userId, guildId);
                
                return;
            }

            // Log game start
            await sendLogMessage(
                interaction.client,
                'game',
                `Blackjack game started: ${interaction.user.displayName} bet ${fmt(betAmount)}`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error in blackjack command: ${error.message}`);
            try {
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `Blackjack error for ${interaction.user.tag} (${userId}) — ${error.message}`,
                    userId,
                    guildId
                );
            } catch (_) {}
            
            // Handle game error with session cleanup and refund
            let refundAmount = 0;
            try {
                // Try to get bet amount from validation or other sources
                if (typeof validation !== 'undefined' && validation?.parsedAmount) {
                    refundAmount = validation.parsedAmount;
                } else {
                    // Try to parse amount directly as fallback
                    const userBalance = await dbManager.getUserBalance(userId, guildId);
                    const parsedAmount = parseAmount(amount);
                    if (parsedAmount > 0) {
                        refundAmount = parsedAmount;
                    }
                }
            } catch (parseError) {
                logger.warn(`Could not determine refund amount: ${parseError.message}`);
            }
            
            // Handle session error and cleanup
            try {
                const userSession = sessionManager.getUserActiveSession(userId);
                if (userSession) {
                    await sessionManager.cancelSession(userSession.sessionId, 'Blackjack game initialization error', true);
                }
            } catch (sessionError) {
                logger.error(`Failed to handle session error: ${sessionError.message}`);
            }
            
            const { embed: errorEmbed } = GamePanel.createErrorEmbed({
                title: '❌ Blackjack Error',
                description: 'An error occurred while starting blackjack. Your bet has been refunded.',
                gameType: 'blackjack',
                showRetry: false
            });

            // Enhanced error response handling
            try {
                // Check if interaction is still valid before responding
                if (interaction.isRepliable()) {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    } else if (interaction.deferred) {
                        await interaction.editReply({ embeds: [errorEmbed] });
                    } else {
                        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    }
                } else {
                    logger.warn('Interaction is no longer repliable for error reply');
                }
            } catch (replyError) {
                logger.error(`Failed to send error reply: ${replyError.message}`);
                logger.error(`Interaction state - replied: ${interaction.replied}, deferred: ${interaction.deferred}`);
            }
        }
    },

    // Blackjack button handlers (to be handled by interaction handler in index.js)
    handleBlackjackAction: async function(interaction, actionId) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        logger.debug(`Blackjack action '${actionId}' by ${userId} in guild ${guildId}`);
        try {
            // Find active game by user's session
            let game = null;
            let sessionId = null;
            
        // Use sessionManager to find user's active session
        const activeSession = sessionManager.getUserActiveSession(userId);
        logger.debug(`Blackjack action: activeSession found=${!!activeSession}, gameType=${activeSession?.gameType}, expected=${SMGameType.BLACKJACK}`);
            
            if (activeSession && activeSession.gameType === SMGameType.BLACKJACK) {
                sessionId = activeSession.sessionId;
                const sessionData = activeGames.get(sessionId);
                game = sessionData?.game;
                logger.debug(`Blackjack action: sessionId=${sessionId}, sessionData found=${!!sessionData}, game found=${!!game}`);
            }
            
            if (!game || !sessionId) {
                logger.warn(`Blackjack action failed: game=${!!game}, sessionId=${sessionId}, activeSession=${JSON.stringify(activeSession)}`);
                if (interaction.isRepliable()) {
                    return await interaction.reply({ content: 'No active blackjack game found.', flags: MessageFlags.Ephemeral });
                } else {
                    logger.warn('Cannot send game not found reply - interaction not repliable');
                    return;
                }
            }

            const userBalance = await dbManager.getUserBalance(userId, guildId);

            switch (actionId) {
                case 'hit': {
                    try {
                    // Hit
                    game.hit();

                    // Check if all hands are complete (hit() method already advances to next hand if current hand is complete)
                    if (game.allHandsComplete() || game.gameEnded) {
                        // All hands complete, game should be over
                        await module.exports.endGame(interaction, game, userId, guildId);
                        return;
                    }

                    // Update embed
                    const hitEmbed = await createGameEmbed(game, interaction.user, false, userBalance);
                    const hitActionRows = createGameButtons(userId, game);
                    const tableImage = await createGameTableImage(game, false);

                    const updateData = {
                        embeds: [hitEmbed], 
                        components: hitActionRows
                    };
                    
                    if (tableImage) {
                        updateData.files = [{ attachment: tableImage, name: 'blackjack-table.png' }];
                        hitEmbed.setImage('attachment://blackjack-table.png');
                    }

                    await interaction.update(updateData);
                } catch (hitError) {
                    logger.error(`Error in blackjack hit action: ${hitError.message}`);
                    try {
                        // Check if interaction is still valid before responding
                        if (interaction.isRepliable()) {
                            if (!interaction.replied && !interaction.deferred) {
                                await interaction.reply({ 
                                    content: '❌ An error occurred while hitting. Please try again.', 
                                    flags: MessageFlags.Ephemeral 
                                });
                            } else {
                                await interaction.followUp({ 
                                    content: '❌ An error occurred while hitting. Please try again.', 
                                    flags: MessageFlags.Ephemeral 
                                });
                            }
                        } else {
                            logger.warn('Interaction is no longer repliable for hit error response');
                        }
                    } catch (interactionError) {
                        logger.error(`Failed to send hit error response: ${interactionError.message}`);
                    }
                }
                break;
            }

            case 'stand': {
                // Stand
                game.stand();

                // Check if all hands are complete (stand() method already advances to next hand)
                if (game.allHandsComplete() || game.gameEnded) {
                    // Game complete
                    await module.exports.endGame(interaction, game, userId, guildId);
                } else {
                    // Update display for next hand
                    const standEmbed = await createGameEmbed(game, interaction.user, false, userBalance);
                    const standActionRows = createGameButtons(userId, game);
                    const tableImage = await createGameTableImage(game, false);

                    const updateData = {
                        embeds: [standEmbed], 
                        components: standActionRows
                    };
                    
                    if (tableImage) {
                        updateData.files = [{ attachment: tableImage, name: 'blackjack-table.png' }];
                        standEmbed.setImage('attachment://blackjack-table.png');
                    }

                    await interaction.update(updateData);
                }
                break;
            }

            case 'double': {
                try {
                    // Check if can double
                    if (!game.canDouble()) {
                        if (interaction.isRepliable()) {
                            return await interaction.reply({ content: 'Cannot double down now.', flags: MessageFlags.Ephemeral });
                        } else {
                            logger.warn('Cannot send double down error - interaction not repliable');
                            return;
                        }
                    }

                    // Check funds
                    if (userBalance.wallet < game.betAmount) {
                        if (interaction.isRepliable()) {
                            return await interaction.reply({ 
                                content: `Insufficient funds to double down! You need ${fmt(game.betAmount)} more.`, 
                                flags: MessageFlags.Ephemeral 
                            });
                        } else {
                            logger.warn('Cannot send insufficient funds error - interaction not repliable');
                            return;
                        }
                    }

                    // Deduct additional bet
                    await dbManager.updateUserBalance(userId, guildId, -game.betAmount, 0);

                    // Double down (this automatically advances to next hand)
                    game.doubleDown();
                    
                    // Check if all hands are complete (doubleDown() method already advances to next hand)
                    if (game.allHandsComplete() || game.gameEnded) {
                        // All hands complete, game should be over
                        await module.exports.endGame(interaction, game, userId, guildId);
                    } else {
                        // Update display for next hand
                        const doubleEmbed = await createGameEmbed(game, interaction.user, false, userBalance);
                        const doubleActionRows = createGameButtons(userId, game);
                        const tableImage = await createGameTableImage(game, false);

                        const updateData = {
                            embeds: [doubleEmbed], 
                            components: doubleActionRows
                        };
                        
                        if (tableImage) {
                            updateData.files = [{ attachment: tableImage, name: 'blackjack-table.png' }];
                            doubleEmbed.setImage('attachment://blackjack-table.png');
                        }

                        await interaction.update(updateData);
                    }
                } catch (doubleError) {
                    logger.error(`Error in blackjack double action: ${doubleError.message}`);
                    try {
                        // Check if interaction is still valid before responding
                        if (interaction.isRepliable()) {
                            if (!interaction.replied && !interaction.deferred) {
                                await interaction.reply({ 
                                    content: '❌ An error occurred while doubling down. Please try again.', 
                                    flags: MessageFlags.Ephemeral 
                                });
                            } else {
                                await interaction.followUp({ 
                                    content: '❌ An error occurred while doubling down. Please try again.', 
                                    flags: MessageFlags.Ephemeral 
                                });
                            }
                        } else {
                            logger.warn('Interaction is no longer repliable for double error response');
                        }
                    } catch (interactionError) {
                        logger.error(`Failed to send double error response: ${interactionError.message}`);
                    }
                }
                break;
            }

            case 'split': {
                // Check if can split
                if (!game.canSplit()) {
                    if (interaction.isRepliable()) {
                        return await interaction.reply({ content: 'Cannot split this hand.', flags: MessageFlags.Ephemeral });
                    } else {
                        logger.warn('Cannot send split error - interaction not repliable');
                        return;
                    }
                }

                // Check funds for split
                if (userBalance.wallet < game.betAmount) {
                    if (interaction.isRepliable()) {
                        return await interaction.reply({ 
                            content: `Insufficient funds to split! You need ${fmt(game.betAmount)} more.`, 
                            flags: MessageFlags.Ephemeral 
                        });
                    } else {
                        logger.warn('Cannot send split insufficient funds error - interaction not repliable');
                        return;
                    }
                }

                // Deduct additional bet for split
                await dbManager.updateUserBalance(userId, guildId, -game.betAmount, 0);

                // Split the hand
                game.split();

                // Update embed
                const splitEmbed = await createGameEmbed(game, interaction.user, false, userBalance);
                const splitActionRows = createGameButtons(userId, game);
                const tableImage = await createGameTableImage(game, false);

                const updateData = {
                    embeds: [splitEmbed], 
                    components: splitActionRows
                };
                
                if (tableImage) {
                    updateData.files = [{ attachment: tableImage, name: 'blackjack-table.png' }];
                    splitEmbed.setImage('attachment://blackjack-table.png');
                }

                await interaction.update(updateData);
                break;
            }

            case 'insurance_yes': {
                // Take insurance
                if (!game.canOfferInsurance()) {
                    if (interaction.isRepliable()) {
                        return await interaction.reply({ content: 'Insurance is not available.', flags: MessageFlags.Ephemeral });
                    } else {
                        logger.warn('Cannot send insurance error - interaction not repliable');
                        return;
                    }
                }
                
                // Check if user has enough funds for insurance
                if (userBalance.wallet < game.insuranceAmount) {
                    if (interaction.isRepliable()) {
                        return await interaction.reply({ 
                            content: `Insufficient funds for insurance! You need ${fmt(game.insuranceAmount)} more.`, 
                            flags: MessageFlags.Ephemeral 
                        });
                    } else {
                        logger.warn('Cannot send insurance insufficient funds error - interaction not repliable');
                        return;
                    }
                }
                
                // Deduct insurance amount
                await dbManager.updateBalance(userId, guildId, -game.insuranceAmount, 0);
                game.takeInsurance();
                
                // Update game display
                const insuranceEmbed = await createGameEmbed(game, interaction.user, false, userBalance);
                insuranceEmbed.addFields({
                    name: '🛡️ Insurance Taken',
                    value: `You paid ${fmt(game.insuranceAmount)} for insurance against dealer blackjack.`,
                    inline: false
                });
                
                const insuranceActionRows = createGameButtons(userId, game);
                const tableImage = await createGameTableImage(game, false);
                const updateData = {
                    embeds: [insuranceEmbed], 
                    components: insuranceActionRows
                };
                
                if (tableImage) {
                    updateData.files = [{ attachment: tableImage, name: 'blackjack-table.png' }];
                    insuranceEmbed.setImage('attachment://blackjack-table.png');
                }
                
                await interaction.update(updateData);
                break;
            }
                
            case 'insurance_no': {
                // Decline insurance
                game.declineInsurance();
                
                // Update game display with normal buttons
                const noInsuranceEmbed = await createGameEmbed(game, interaction.user, false, userBalance);
                const noInsuranceActionRows = createGameButtons(userId, game);
                const noInsuranceTableImage = await createGameTableImage(game, false);
                const noInsuranceUpdateData = {
                    embeds: [noInsuranceEmbed], 
                    components: noInsuranceActionRows
                };
                
                if (noInsuranceTableImage) {
                    noInsuranceUpdateData.files = [{ attachment: noInsuranceTableImage, name: 'blackjack-table.png' }];
                    noInsuranceEmbed.setImage('attachment://blackjack-table.png');
                }
                
                await interaction.update(noInsuranceUpdateData);
                break;
            }

                case 'help': {
                    const { embed: helpEmbed, components: helpComponents } = GamePanel.createHelpEmbed({
                        gameType: 'blackjack',
                    title: '🃏 Blackjack Help',
                    description: '**How to Play Blackjack**',
                    rules: [
                        'Get as close to 21 as possible without going over',
                        'Beat the dealer\'s hand to win',
                        'Aces count as 1 or 11, face cards as 10',
                        'Number cards are worth their face value'
                    ],
                    commands: [
                        '**Hit:** Take another card',
                        '**Stand:** Keep current hand',  
                        '**Double Down:** Double bet, take one card, then stand',
                        '**Split:** Split pairs into two hands (doubles bet)'
                    ],
                    tips: [
                        'Blackjack multipliers vary by mode (1.5x to 3.0x)',
                        'Regular win multipliers vary by mode (1.1x to 2.0x)',
                        'Dealer must hit on 16 and stand on 17',
                        'If dealer busts, all remaining players win'
                    ]
                });

                if (interaction.isRepliable()) {
                    await interaction.reply({ embeds: [helpEmbed], components: helpComponents, flags: MessageFlags.Ephemeral });
                } else {
                    logger.warn('Cannot send help reply - interaction not repliable');
                }
                break;
            }
            }
        } catch (actionError) {
            logger.error(`Blackjack action error (${actionId}): ${actionError.message}`);
            try {
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `Blackjack action error (${actionId}) for ${interaction.user.tag} (${userId}) — ${actionError.message}`,
                    userId,
                    guildId
                );
            } catch (_) {}
            // Check if interaction is still valid before responding
            if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Error processing action.', flags: MessageFlags.Ephemeral });
            } else {
                logger.warn('Cannot send action error reply - interaction not repliable or already handled');
            }
        }
    },

    endGame: async function(interaction, game, userId, guildId) {
        try {
            // Safety check - ensure game still exists
            const sessionData = activeGames.get(game.sessionId);
            if (!sessionData || sessionData.game !== game) {
                logger.warn(`endGame called but game no longer exists or differs for session ${game.sessionId}`);
                return;
            }
            
            // 🤖 Get AI-calculated dynamic multiplier from EconomyGuardian
            let economicMultiplier = 1.0;
            try {
                // Get the stored AI result from the game session
                const sessionData = activeGames.get(game.sessionId);
                if (sessionData?.aiResult?.multiplierAdjustment?.finalMultiplier) {
                    economicMultiplier = sessionData.aiResult.multiplierAdjustment.finalMultiplier;
                    logger.info(`🤖 Applying AI multiplier for blackjack: ${economicMultiplier.toFixed(3)}x`);
                } else {
                    // Fallback: get fresh AI multiplier
                    economicMultiplier = 1.0; // Default multiplier - EconomyGuardianInterface removed
                }
                economicMultiplier = Math.max(0.5, Math.min(1.5, economicMultiplier)); // Cap between 0.5x - 1.5x
            } catch (error) {
                logger.warn(`Failed to get AI economic multiplier for blackjack: ${error.message}`);
                economicMultiplier = 1.0;
            }
            
            // Personalized game helper removed - using bulletproof economy
            const personalizedConfig = { blackjackPayout: 1.5, winPayout: 1.0 }; // Default values
            
            const results = await game.getResults({ 
                economicMultiplier,
                personalizedPayouts: {
                    blackjack: personalizedConfig.blackjackPayout,
                    win: personalizedConfig.winPayout,
                    push: personalizedConfig.pushPayout
                }
            });
            
            // Safety check - ensure we have results
            if (!results || results.length === 0) {
                logger.error(`No results returned for blackjack game for user ${userId}`);
                return;
            }
            
            let totalPayout = 0;
            let winnings = 0;

            // Process each hand result
            for (const result of results) {
                totalPayout += result.payout || 0;
                if (result.won) {
                    winnings += (result.payout || 0) - result.betAmount; // Only count profit as winnings
                }
            }

            // Calculate total bet amount including double downs
            let totalBetAmount = 0;
            for (const result of results) {
                totalBetAmount += result.betAmount || game.betAmount;
            }
            
            const originalWon = totalPayout > 0;
            
            // Check if this is a push (all hands are pushes)
            const isPush = results.every(r => r.outcome === 'PUSH');
            
            let regulatedPayout;
            let tuningAdjustment;
            
            if (isPush) {
                // For pushes, return exactly the bet amount (no profit, no loss)
                regulatedPayout = totalBetAmount;
                tuningAdjustment = { 
                    originalPayout: totalBetAmount, 
                    adjustedPayout: totalBetAmount, 
                    payoutDelta: 0, 
                    feeApplied: false 
                };
            } else if (!originalWon) {
                // For losses, payout should be 0 (money already deducted)
                regulatedPayout = 0;
                tuningAdjustment = { 
                    originalPayout: 0, 
                    adjustedPayout: 0, 
                    payoutDelta: 0, 
                    feeApplied: false 
                };
            } else {
                // 🎰 APPLY AI TUNING SYSTEM - ECONOMIC REGULATION (only for wins)
                tuningAdjustment = await tuningManager.getAdjustedPayout('blackjack', totalPayout, totalBetAmount);
                regulatedPayout = tuningAdjustment.adjustedPayout;
            }
            
            // 🎯 APPLY ALL-IN SYSTEM - DYNAMIC HOUSE EDGE (but not for pushes)
            if (originalWon && regulatedPayout > 0 && !isPush) {
                const allInAdjustment = await allInManager.adjustGameResult(userId, totalBetAmount, regulatedPayout, true, 'blackjack');
                regulatedPayout = allInAdjustment.adjustedPayout;
                
                // Log significant all-in adjustments
                if (allInAdjustment.houseEdgeApplied > 0.05) {
                    logger.info(`🎯 BLACKJACK ALL-IN EDGE: ${fmt(tuningAdjustment.adjustedPayout)} -> ${fmt(regulatedPayout)} (+${(allInAdjustment.houseEdgeApplied * 100).toFixed(1)}% house edge, ${(allInAdjustment.betRatio * 100).toFixed(1)}% of wealth)`);
                }
            }
            
            // Log tuning application for monitoring
            if (tuningAdjustment.payoutDelta !== 0 || tuningAdjustment.feeApplied) {
                logger.info(`🎛️ BLACKJACK TUNING: ${totalPayout} -> ${tuningAdjustment.adjustedPayout} (delta: ${(tuningAdjustment.payoutDelta * 100).toFixed(1)}%, fee: ${tuningAdjustment.feeApplied})`);
            }
            
            // Determine if player won based on net profit
            // Push: payout = bet (no profit), Loss: payout = 0, Win: payout > bet
            const netProfit = regulatedPayout - totalBetAmount;
            const won = netProfit > 0; // Only true wins have positive net profit
            
            // Use PayoutManager for consistent payout handling
            // For losses, payout is 0 since bet was already deducted
            // For pushes, payout equals bet amount (return bet, no profit)
            // For wins, payout is greater than bet (bet + profit)
            const gameResult = new GameResult({
                userId,
                guildId,
                gameType: 'blackjack',
                betAmount: totalBetAmount,
                payout: regulatedPayout,
                won: won,
                metadata: { 
                    hands: results.length,
                    isPush: isPush,
                    netProfit: netProfit
                }
            });

            await PayoutManager.processGamePayout(gameResult);
            
            try {
                await dbManager.recordGameResult(
                    userId, 
                    guildId, 
                    'blackjack', 
                    won, 
                    totalBetAmount, 
                    regulatedPayout,  // Use regulated payout for recording
                    {
                        hands: game.splitHands.length || 1,
                        dealerValue: game.dealerHand.getValue(),
                        playerValue: game.playerHand.getValue(),
                        outcome: results[0]?.outcome || 'unknown',
                        split: game.splitHands.length > 0
                    }
                );
                
                // 📊 RECORD FOR AI ECONOMY ANALYZER
                await tuningManager.recordGameResult(userId, 'blackjack', totalBetAmount, regulatedPayout, won);
                
            } catch (recordError) {
                logger.warn(`Failed to record blackjack game result: ${recordError.message}`);
            }

            // Add XP for game completion
            const specialResult = results.some(r => r.outcome === 'BLACKJACK') ? 'BLACKJACK' : null;
            const xpResult = await levelingSystem.handleGameComplete(userId, guildId, 'blackjack', won, specialResult);

            // Check for level up and prepare notification
            let levelUpMessage = null;
            if (xpResult && xpResult.leveledUp) {
                // Process level-up rewards
                const levelReward = await levelingSystem.processLevelUpRewards(userId, guildId, xpResult.newLevel);
                
                levelUpMessage = `\n\n🎉 **LEVEL UP!** You are now level **${xpResult.newLevel}**!`;
                if (levelReward) {
                    levelUpMessage += `\n💰 **Level Reward:** +$${levelReward.money.toLocaleString()}`;
                }
                
                // Send level up notification to the specified channel
                try {
                    const levelUpChannel = interaction.client.channels.cache.get('1411018763008217208');
                    if (levelUpChannel) {
                        const levelUpEmbed = levelingSystem.createLevelUpEmbed(interaction.user, xpResult.newLevel);
                        await levelUpChannel.send({ 
                            content: `<@${userId}>, you are now level ${xpResult.newLevel}!`,
                            embeds: [levelUpEmbed] 
                        });
                    }
                } catch (levelError) {
                    logger.error(`Failed to send level up notification: ${levelError.message}`);
                }
            }

            // Create final embed (before cleanup)
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            const finalEmbed = await createGameEmbed(game, interaction.user, true, userBalance, null, regulatedPayout);
            const tableImage = await createGameTableImage(game, true);

            // Create result message with enhanced safety checks
            let resultMessage = '';
            try {
                if (results.length > 1) {
                    // Split hands - use regulated payout for display
                    const handResults = [];
                    for (let i = 0; i < results.length; i++) {
                        const result = results[i] || {};
                        // Calculate proportion of regulated payout for this hand (avoid division by zero)
                        const handProportion = totalPayout > 0 ? (result.payout || 0) / totalPayout : 0;
                        const handRegulatedPayout = regulatedPayout * handProportion;
                        const handNetProfit = handRegulatedPayout - result.betAmount;
                        const status = result.outcome === 'PUSH' ? '🤝 PUSH' : (handNetProfit > 0 ? '🎉 WIN!' : '💸 LOSE');
                        const doubledText = result.doubled ? ' (DOUBLED)' : '';
                        if (result.outcome === 'PUSH') {
                            handResults.push(`Hand ${i + 1}: ${status} - Bet returned${doubledText}`);
                        } else if (handNetProfit > 0) {
                            handResults.push(`Hand ${i + 1}: ${status} Won ${fmt(handNetProfit)}${doubledText}`);
                        } else {
                            handResults.push(`Hand ${i + 1}: ${status} Lost ${fmt(result.betAmount)}${doubledText}`);
                        }
                    }
                    resultMessage = handResults.join('\n');
                    const totalNetProfit = regulatedPayout - totalBetAmount;
                    if (totalNetProfit > 0) {
                        resultMessage += `\n\n**Total Won: ${fmt(totalNetProfit)}**`;
                    } else if (totalNetProfit === 0) {
                        resultMessage += `\n\n**Total: Push - All bets returned**`;
                    } else {
                        resultMessage += `\n\n**Total Lost: ${fmt(Math.abs(totalNetProfit))}**`;
                    }
                } else {
                    const result = results[0] || {};
                    // Use the actual regulated payout, not the original game result payout
                    const actualPayout = regulatedPayout || 0;
                    logger.info(`🔍 DEBUG: won=${result.won}, outcome=${result.outcome}, baseMultiplier=${result.baseMultiplier}, multiplier=${result.multiplier}, originalPayout=${result.payout}, regulatedPayout=${actualPayout}`);
                    
                    // Check for playfor context to display recipient
                    const playForRecipient = global.playForContext?.recipientName;
                    const winningForSomeoneElse = playForRecipient && global.playForContext.recipientId;
                    
                    // Display win/loss based on outcome and net profit
                    if (result.outcome === 'PUSH') {
                        // Push always shows the same message regardless of payout
                        resultMessage = `🤝 **PUSH** - Your bet of ${fmt(totalBetAmount)} is returned.`;
                    } else if (netProfit > 0) {
                        // Win scenarios - show profit, not total payout
                        if (result.outcome === 'BLACKJACK') {
                            if (winningForSomeoneElse) {
                                resultMessage = `🎉 **BLACKJACK!** Won ${fmt(netProfit)} for **@${playForRecipient}**!`;
                            } else {
                                resultMessage = `🎉 **BLACKJACK!** Won ${fmt(netProfit)}`;
                            }
                        } else {
                            if (winningForSomeoneElse) {
                                resultMessage = `🎉 **YOU WIN ${fmt(netProfit)} for @${playForRecipient}!**`;
                            } else {
                                resultMessage = `🎉 **YOU WIN!** Won ${fmt(netProfit)}`;
                            }
                        }
                    } else {
                        // Loss scenarios
                        if (winningForSomeoneElse) {
                            resultMessage = `💸 **YOU LOSE!** @${playForRecipient} gets nothing.`;
                        } else {
                            resultMessage = `💸 **YOU LOSE!** Lost ${fmt(totalBetAmount)}.`;
                        }
                    }
                }
            } catch (messageError) {
                logger.error(`Error creating result message for user ${userId}: ${messageError.message}`);
                resultMessage = `🎰 **GAME COMPLETE** - Total Payout: ${fmt(regulatedPayout)}`;
            }
            
            // Add level up message if applicable
            if (levelUpMessage) {
                resultMessage += levelUpMessage;
            }
            
            // Safety check - ensure resultMessage is not empty and has content
            if (!resultMessage || resultMessage.trim() === '' || resultMessage.length < 3) {
                resultMessage = `🎰 **GAME COMPLETE** - Total Payout: ${fmt(regulatedPayout)}`;
                logger.warn(`Empty or invalid result message for blackjack game, using fallback for user ${userId}`);
            }

            // Get updated balance for play again buttons
            const updatedBalance = await dbManager.getUserBalance(userId, guildId);
            
            // Check if this is a playfor game - disable buttons if so
            const isPlayforGame = global.playForContext?.recipientId;
            
            // Enhanced interaction update with validation
            const finalData = {
                content: resultMessage || `🎰 Game Complete - Total Payout: ${fmt(regulatedPayout)}`,
                embeds: [finalEmbed],
                components: isPlayforGame ? [] : GamePanel.createGameButtons({ 
                    actions: ['play_again_multi', 'quit'],
                    lastBet: game.betAmount,
                    balance: updatedBalance.wallet
                })
            };
            
            if (tableImage) {
                finalData.files = [{ attachment: tableImage, name: 'blackjack-table.png' }];
                finalEmbed.setImage('attachment://blackjack-table.png');
            }

            try {
                // Validate finalData before sending
                if (!finalData.content || finalData.content.trim() === '') {
                    finalData.content = `🎰 Game Complete - Payout: ${fmt(regulatedPayout)}`;
                }
                
                // Check if interaction is still valid before responding
                if (interaction.isRepliable()) {
                    if (interaction.deferred || interaction.replied) {
                        await interaction.editReply(finalData);
                    } else {
                        await interaction.update(finalData);
                    }
                    logger.info(`Blackjack game successfully ended for user ${userId}`);
                } else {
                    logger.warn('Interaction is no longer repliable for endGame update');
                }
            } catch (interactionError) {
                logger.error(`Failed to update interaction for blackjack endGame: ${interactionError.message}`);
                
                // Fallback: try to send a new reply if update fails
                try {
                    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                        const fallbackData = {
                            content: `🎰 Game Complete - Payout: ${fmt(regulatedPayout)}`,
                            embeds: [finalEmbed],
                            components: isPlayforGame ? [] : GamePanel.createGameButtons({ 
                                actions: ['play_again_multi', 'quit'],
                                lastBet: game.betAmount,
                                balance: updatedBalance.wallet
                            })
                        };
                        
                        if (tableImage) {
                            fallbackData.files = [{ attachment: tableImage, name: 'blackjack-table.png' }];
                            finalEmbed.setImage('attachment://blackjack-table.png');
                        }
                        
                        await interaction.reply(fallbackData);
                    } else {
                        logger.warn('Cannot send fallback reply - interaction not repliable or already handled');
                    }
                } catch (fallbackError) {
                    logger.error(`Failed fallback reply for blackjack endGame: ${fallbackError.message}`);
                }
            }

            // Complete session if game has one
            if (game.sessionId) {
                // Determine actual game outcome: win (profit), push (break even), or loss
                const netResult = regulatedPayout - totalBetAmount;
                const actuallyWon = netResult > 0;
                const sessionIsPush = netResult === 0 && regulatedPayout > 0;
                
                await sessionManager.endSession(game.sessionId, {
                    outcome: 'COMPLETED',
                    payout: regulatedPayout,
                    won: actuallyWon,
                    isPush: sessionIsPush,
                    netResult: netResult,
                    results: results
                });
            }

            // 🤖 Log transaction result to EconomyGuardian for learning
            try {
                // EconomyGuardianInterface logging removed - using bulletproof economy
            } catch (error) {
                logger.error(`Transaction logging error: ${error.message}`);
            }
            
            // Clean up after interaction update (success or failure)
            activeGames.delete(game.sessionId);

            // Log game end with proper outcome detection
            const netResult = regulatedPayout - totalBetAmount;
            let outcomeText = '';
            if (netResult > 0) {
                outcomeText = 'won';
            } else if (netResult === 0 && regulatedPayout > 0) {
                outcomeText = 'pushed for';
            } else {
                outcomeText = 'lost';
            }
            
            await sendLogMessage(
                interaction.client,
                'game',
                `Blackjack game ended: ${interaction.user.displayName} ${outcomeText} ${fmt(Math.abs(netResult))}`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error ending blackjack game: ${error.message}`);
        }
    },

    /**
     * Start a new blackjack game from dropdown selection
     */
    async startNewGame(interaction, betAmount) {
        try {
            await interaction.deferUpdate();
            
            // Extract the bet amount and start a new game by calling the main execute function
            const fakeInteraction = {
                ...interaction,
                options: {
                    getString: (key) => key === 'amount' ? betAmount.toString() : null
                },
                deferReply: () => Promise.resolve(),
                reply: interaction.editReply.bind(interaction),
                editReply: interaction.editReply.bind(interaction),
                replied: false,
                deferred: true
            };

            // Call the main blackjack execute function with the fake interaction
            await this.execute(fakeInteraction);
            
        } catch (error) {
            logger.error(`Error starting new blackjack game from dropdown: ${error.message}`);
            
            try {
                const errorMessage = 'Failed to start new game. Please use `/blackjack` command directly.';
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: errorMessage, ephemeral: true });
                } else {
                    await interaction.followUp({ content: errorMessage, ephemeral: true });
                }
            } catch (replyError) {
                logger.error(`Failed to send error message: ${replyError.message}`);
            }
        }
    }
};
