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
const uasDataExporter = require('../UTILS/uasDataExporter');

// Game type constant
const SMGameType = { BLACKJACK: 'blackjack' };

// STANDARD BLACKJACK MODES with proper payouts
const BLACKJACK_MODES = {
    safe: {
        name: '🛡️ Safe',
        description: 'Low stakes with standard payouts',
        minBet: 500,
        blackjackMultiplier: 2.5,    // Standard 3:2 blackjack payout
        winMultiplier: 2.0,          // Standard 1:1 win payout
        houseEdge: 0.005,            // 0.5% house edge
        emoji: '🛡️',
        color: '#4CAF50'
    },
    balanced: {
        name: '⚖️ Balanced',
        description: 'Medium stakes with standard payouts',
        minBet: 1000,
        blackjackMultiplier: 2.5,    // Standard 3:2 blackjack payout
        winMultiplier: 2.0,          // Standard 1:1 win payout
        houseEdge: 0.005,            // 0.5% house edge
        emoji: '⚖️',
        color: '#FF9800'
    },
    risky: {
        name: '⚡ Risky',
        description: 'High stakes with standard payouts',
        minBet: 2500,
        blackjackMultiplier: 2.5,    // Standard 3:2 blackjack payout
        winMultiplier: 2.0,          // Standard 1:1 win payout
        houseEdge: 0.005,            // 0.5% house edge
        emoji: '⚡',
        color: '#FF8800'
    },
    extreme: {
        name: '🔥 Extreme',
        description: 'Very high stakes with standard payouts',
        minBet: 5000,
        blackjackMultiplier: 2.5,    // Standard 3:2 blackjack payout
        winMultiplier: 2.0,          // Standard 1:1 win payout
        houseEdge: 0.005,            // 0.5% house edge
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
        // Determine display strictly from game outcomes, not payout adjustments
        if (results.length > 1) {
            const allPush = results.every(r => r.outcome === 'PUSH');
            const anyBlackjack = results.some(r => r.outcome === 'BLACKJACK');
            const wins = results.filter(r => r.won).length;
            if (anyBlackjack) {
                stageText = 'BLACKJACK';
                color = 0xFFD700;
            } else if (allPush) {
                stageText = 'PUSH';
                color = 0xFFFF00;
            } else if (wins > 0) {
                stageText = 'SPLIT WIN';
                color = 0x00ff00;
            } else {
                stageText = 'SPLIT LOSS';
                color = 0xff0000;
            }
        } else {
            const result = results[0];
            if (result.outcome === 'BLACKJACK') {
                stageText = 'BLACKJACK';
                color = 0xFFD700;
            } else if (result.outcome === 'PUSH') {
                stageText = 'PUSH';
                color = 0xFFFF00;
            } else if (result.won) {
                stageText = 'WIN';
                color = 0x00ff00;
            } else {
                stageText = 'LOSS';
                color = 0xff0000;
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
                    { name: '🛡️ Safe (Min: $500)', value: 'safe' },
                    { name: '⚖️ Balanced (Min: $1K)', value: 'balanced' },
                    { name: '⚡ Risky (Min: $2.5K)', value: 'risky' },
                    { name: '🔥 Extreme (Min: $5K)', value: 'extreme' }
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
            // Defer immediately to prevent interaction timeouts
            await interaction.deferReply();
            
            // Check maintenance mode first
            const maintenanceGuard = require('../UTILS/maintenanceGuard');
            const maintenanceCheck = await maintenanceGuard.check(guildId, 'blackjack');
            if (!maintenanceCheck.allowed) {
                return await interaction.editReply({ embeds: [maintenanceCheck.embed] });
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
                return await interaction.editReply({ embeds: [errorEmbed] });
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
                return await interaction.editReply({ embeds: [validation.errorEmbed] });
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
            
            await interaction.editReply(messageData);
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
                // Since we always defer at the start, use editReply
                await interaction.editReply({ embeds: [errorEmbed] });
            } catch (replyError) {
                // Handle unknown interaction errors gracefully
                if (replyError.code === 10062 || replyError.message.includes('Unknown interaction')) {
                    logger.debug('Blackjack error response: interaction expired');
                } else {
                    logger.error(`Failed to send error reply: ${replyError.message}`);
                }
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
                try {
                    await interaction.deferUpdate();
                    await interaction.followUp({ content: 'No active blackjack game found.', ephemeral: true });
                } catch (err) {
                    logger.warn('Cannot send game not found reply - interaction error');
                }
                return;
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
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.deferUpdate();
                        }
                        await interaction.followUp({ 
                            content: '❌ An error occurred while hitting. Please try again.', 
                            ephemeral: true 
                        });
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
                        try {
                            await interaction.deferUpdate();
                            await interaction.followUp({ content: 'Cannot double down now.', ephemeral: true });
                        } catch (err) {
                            logger.warn('Cannot send double down error - interaction error');
                        }
                        return;
                    }

                    // Check funds
                    if (userBalance.wallet < game.betAmount) {
                        try {
                            await interaction.deferUpdate();
                            await interaction.followUp({ 
                                content: `Insufficient funds to double down! You need ${fmt(game.betAmount)} more.`, 
                                ephemeral: true 
                            });
                        } catch (err) {
                            logger.warn('Cannot send insufficient funds error - interaction error');
                        }
                        return;
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
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.deferUpdate();
                        }
                        await interaction.followUp({ 
                            content: '❌ An error occurred while doubling down. Please try again.', 
                            ephemeral: true 
                        });
                    } catch (interactionError) {
                        logger.error(`Failed to send double error response: ${interactionError.message}`);
                    }
                }
                break;
            }

            case 'split': {
                // Check if can split
                if (!game.canSplit()) {
                    try {
                        await interaction.deferUpdate();
                        await interaction.followUp({ content: 'Cannot split this hand.', ephemeral: true });
                    } catch (err) {
                        logger.warn('Cannot send split error - interaction error');
                    }
                    return;
                }

                // Check funds for split
                if (userBalance.wallet < game.betAmount) {
                    try {
                        await interaction.deferUpdate();
                        await interaction.followUp({ 
                            content: `Insufficient funds to split! You need ${fmt(game.betAmount)} more.`, 
                            ephemeral: true 
                        });
                    } catch (err) {
                        logger.warn('Cannot send split insufficient funds error - interaction error');
                    }
                    return;
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
                    try {
                        await interaction.deferUpdate();
                        await interaction.followUp({ content: 'Insurance is not available.', ephemeral: true });
                    } catch (err) {
                        logger.warn('Cannot send insurance error - interaction error');
                    }
                    return;
                }
                
                // Check if user has enough funds for insurance
                if (userBalance.wallet < game.insuranceAmount) {
                    try {
                        await interaction.deferUpdate();
                        await interaction.followUp({ 
                            content: `Insufficient funds for insurance! You need ${fmt(game.insuranceAmount)} more.`, 
                            ephemeral: true 
                        });
                    } catch (err) {
                        logger.warn('Cannot send insurance insufficient funds error - interaction error');
                    }
                    return;
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
                        'Blackjack pays 3:2 (2.5x your bet)',
                        'Regular wins pay 1:1 (2x your bet)',
                        'Dealer must hit on 16 and stand on 17',
                        'Push returns your original bet'
                    ]
                });

                try {
                    await interaction.deferUpdate();
                    await interaction.followUp({ embeds: [helpEmbed], components: helpComponents, ephemeral: true });
                } catch (err) {
                    logger.warn('Cannot send help reply - interaction error');
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
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.deferUpdate();
                }
                await interaction.followUp({ content: '❌ Error processing action.', ephemeral: true });
            } catch (interactionErr) {
                logger.warn('Cannot send action error reply - interaction error');
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
            
            // Get game results with proper payout calculations
            const results = await game.getResults();
            
            // Safety check - ensure we have results
            if (!results || results.length === 0) {
                logger.error(`No results returned for blackjack game for user ${userId}`);
                return;
            }
            
            let totalPayout = 0;
            let totalBetAmount = 0;
            let totalInsuranceAmount = 0;
            let totalInsurancePayout = 0;
            let anyWon = false;

            // Process each hand result
            for (const result of results) {
                totalPayout += result.payout || 0;
                totalBetAmount += result.betAmount || game.betAmount;
                totalInsuranceAmount += result.insuranceAmount || 0;
                totalInsurancePayout += result.insurancePayout || 0;
                if (result.won) anyWon = true;
            }
            
            // Check if this is a push (all hands are pushes)
            const isPush = results.every(r => r.outcome === 'PUSH');
            
            // Apply tuning and all-in adjustments ONLY to wins
            let regulatedPayout = totalPayout;
            let tuningAdjustment = { originalPayout: totalPayout, adjustedPayout: totalPayout, payoutDelta: 0, feeApplied: false };
            
            // Only apply adjustments to actual wins (not pushes or losses)
            if (anyWon && totalPayout > totalBetAmount) {
                // Apply tuning system
                tuningAdjustment = await tuningManager.getAdjustedPayout('blackjack', totalPayout, totalBetAmount);
                regulatedPayout = tuningAdjustment.adjustedPayout;
                
                // Apply all-in system
                const allInAdjustment = await allInManager.adjustGameResult(userId, totalBetAmount, regulatedPayout, true, 'blackjack');
                regulatedPayout = allInAdjustment.adjustedPayout;
                
                logger.info(`Blackjack adjustments: original=${totalPayout}, tuned=${tuningAdjustment.adjustedPayout}, final=${regulatedPayout}`);
            }
            
            // Final payout includes main payout plus insurance payouts
            const finalPayout = regulatedPayout + totalInsurancePayout;
            
            // Calculate net profit
            const totalInvested = totalBetAmount + totalInsuranceAmount;
            const netProfit = finalPayout - totalInvested;
            const won = netProfit > 0
            
            // Log final result for debugging
            logger.info(`Blackjack final: bet=${totalBetAmount}, insurance=${totalInsuranceAmount}, payout=${finalPayout}, netProfit=${netProfit}, won=${won}, isPush=${isPush}`);
            
            // CRITICAL: Use PayoutManager to handle the payout
            // The bet was already deducted at game start, so we only need to pay out winnings
            const gameResult = new GameResult({
                userId,
                guildId,
                gameType: 'blackjack',
                betAmount: totalBetAmount + totalInsuranceAmount,
                payout: finalPayout,
                won: won,
                metadata: { 
                    hands: results.length,
                    isPush: isPush,
                    netProfit: netProfit,
                    insurance: {
                        amount: totalInsuranceAmount,
                        payout: totalInsurancePayout
                    }
                }
            });

            await PayoutManager.processGamePayout(gameResult);

            // Export to UAS for centralized analysis
            try {
                await uasDataExporter.exportGameResult({
                    userId,
                    guildId,
                    gameType: 'blackjack',
                    betAmount: totalBetAmount + totalInsuranceAmount,
                    winnings: finalPayout,
                    won,
                    metadata: {
                        hands: results.length,
                        dealerValue: game.dealerHand.getValue(),
                        playerValue: game.playerHand.getValue(),
                        isPush,
                        netProfit,
                        outcome: results[0]?.outcome || 'unknown',
                        split: game.splitHands.length > 0,
                        insurance: {
                            amount: totalInsuranceAmount,
                            payout: totalInsurancePayout
                        },
                        gameTimestamp: Date.now()
                    }
                });
            } catch (exportError) {
                logger.debug(`Failed to export blackjack result to UAS: ${exportError.message}`);
            }
            
            try {
                await dbManager.recordGameResult(
                    userId, 
                    guildId, 
                    'blackjack', 
                    won, 
                    totalBetAmount, 
                    finalPayout,  // Include insurance payout for recording
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
                        
                        // Determine correct hand status based on actual outcome and regulated payout
                        let status, description;
                        const doubledText = result.doubled ? ' (DOUBLED)' : '';
                        
                        if (result.outcome === 'PUSH') {
                            status = '🤝 PUSH';
                            description = 'Bet returned';
                        } else if (result.outcome === 'BLACKJACK' || result.outcome === 'WIN' || result.outcome === 'DEALER BUSTED' || 
                                   (result.won && handNetProfit > 0)) {
                            // Win scenarios: check both outcome and net profit for accuracy
                            status = result.outcome === 'BLACKJACK' ? '🃏 BLACKJACK' : '🎉 WIN';
                            description = handNetProfit > 0 ? `Won ${fmt(handNetProfit)}` : 'No profit';
                        } else {
                            status = '💸 LOSE';
                            description = `Lost ${fmt(result.betAmount)}`;
                        }
                        
                        handResults.push(`Hand ${i + 1}: ${status} ${description}${doubledText}`);
                    }
                    resultMessage = handResults.join('\n');
                    // Insurance summary
                    if (totalInsuranceAmount > 0) {
                        if (totalInsurancePayout > 0) {
                            resultMessage += `\n**Insurance:** WON ${fmt(totalInsurancePayout)} (cost ${fmt(totalInsuranceAmount)})`;
                        } else {
                            resultMessage += `\n**Insurance:** LOST ${fmt(totalInsuranceAmount)}`;
                        }
                    }
                    if (netProfit > 0) {
                        resultMessage += `\n\n**Total Won: ${fmt(netProfit)}**`;
                    } else if (netProfit === 0) {
                        resultMessage += `\n\n**Total: Push - All bets returned**`;
                    } else {
                        resultMessage += `\n\n**Total Lost: ${fmt(Math.abs(netProfit))}**`;
                    }
                } else {
                    const result = results[0] || {};
                    // Use the actual final payout with insurance for debug
                    const actualPayout = finalPayout || 0;
                    logger.info(`🔍 DEBUG: originalWon=${result.won}, finalWon=${won}, outcome=${result.outcome}, netProfit=${netProfit}, baseMultiplier=${result.baseMultiplier}, multiplier=${result.multiplier}, originalPayout=${result.payout}, finalPayout=${actualPayout}, insuranceAmount=${totalInsuranceAmount}, insurancePayout=${totalInsurancePayout}`);
                    
                    // Check for playfor context to display recipient
                    const playForRecipient = global.playForContext?.recipientName;
                    const winningForSomeoneElse = playForRecipient && global.playForContext.recipientId;
                    
                    // Display win/loss based on outcome
                    if (result.outcome === 'PUSH') {
                        // Push: bet is returned
                        resultMessage = `🤝 **PUSH** - Your bet of ${fmt(totalBetAmount)} is returned.`;
                    } else if (result.outcome === 'BLACKJACK') {
                        // Blackjack win
                        if (winningForSomeoneElse) {
                            resultMessage = `🃏 **BLACKJACK!** Won ${fmt(netProfit)} for **@${playForRecipient}**!`;
                        } else {
                            resultMessage = `🃏 **BLACKJACK!** Won ${fmt(netProfit)}`;
                        }
                    } else if (result.won) {
                        // Regular win
                        if (winningForSomeoneElse) {
                            resultMessage = `🎉 **YOU WIN!** Won ${fmt(netProfit)} for **@${playForRecipient}**!`;
                        } else {
                            resultMessage = `🎉 **YOU WIN!** Won ${fmt(netProfit)}`;
                        }
                    } else {
                        // Loss
                        if (winningForSomeoneElse) {
                            resultMessage = `💸 **YOU LOSE!** @${playForRecipient} gets nothing.`;
                        } else {
                            resultMessage = `💸 **YOU LOSE!** Lost ${fmt(totalBetAmount)}.`;
                        }
                    }
                    // Append insurance summary for single-hand games
                    if (totalInsuranceAmount > 0) {
                        if (totalInsurancePayout > 0) {
                            resultMessage += `\n**Insurance:** WON ${fmt(totalInsurancePayout)} (cost ${fmt(totalInsuranceAmount)})`;
                        } else {
                            resultMessage += `\n**Insurance:** LOST ${fmt(totalInsuranceAmount)}`;
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
                content: resultMessage || `🎰 Game Complete - Total Payout: ${fmt(finalPayout)}`,
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
                    finalData.content = `🎰 Game Complete - Payout: ${fmt(finalPayout)}`;
                }
                
                // Check if interaction is still valid before responding
                if (interaction && typeof interaction.isRepliable === 'function' && interaction.isRepliable()) {
                    if (interaction.deferred || interaction.replied) {
                        await interaction.editReply(finalData);
                    } else {
                        await interaction.update(finalData);
                    }
                    logger.info(`Blackjack game successfully ended for user ${userId}`);
                } else {
                    logger.warn('Interaction is no longer repliable for endGame update');
                    // Fallback: try editing the original message or sending a new one to the channel
                    if (interaction?.message?.editable) {
                        try {
                            await interaction.message.edit(finalData);
                            logger.info('Blackjack endGame: edited original message as fallback');
                        } catch (msgEditErr) {
                            logger.warn(`Blackjack endGame: message edit fallback failed: ${msgEditErr.message}`);
                            if (interaction.channel) {
                                await interaction.channel.send(finalData);
                                logger.info('Blackjack endGame: posted new message to channel as fallback');
                            }
                        }
                    } else if (interaction?.channel) {
                        await interaction.channel.send(finalData);
                        logger.info('Blackjack endGame: posted new message to channel as fallback');
                    }
                }
            } catch (interactionError) {
                logger.error(`Failed to update interaction for blackjack endGame: ${interactionError.message}`);
                
                // Fallback: try to send a new reply if update fails
                try {
                    if (interaction && typeof interaction.isRepliable === 'function' && interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                        const fallbackData = {
                            content: `🎰 Game Complete - Payout: ${fmt(finalPayout)}`,
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
                    } else if (interaction?.message?.editable) {
                        // Try message edit fallback
                        await interaction.message.edit(finalData);
                        logger.info('Blackjack endGame: edited original message as second-level fallback');
                    } else if (interaction?.channel) {
                        // Last resort: send to channel
                        await interaction.channel.send(finalData);
                        logger.info('Blackjack endGame: posted new message to channel as second-level fallback');
                    } else {
                        logger.warn('Cannot send fallback reply - no valid interaction or channel available');
                    }
                } catch (fallbackError) {
                    logger.error(`Failed fallback reply for blackjack endGame: ${fallbackError.message}`);
                }
            }

            // Complete session if game has one
            if (game.sessionId) {
                // Determine actual game outcome: win (profit), push (break even), or loss
                const netResult = netProfit; // already includes insurance
                const actuallyWon = netResult > 0;
                const sessionIsPush = netResult === 0 && regulatedPayout > 0;
                
                await sessionManager.endSession(game.sessionId, {
                    outcome: 'COMPLETED',
                    payout: finalPayout,
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
            const netResult = netProfit; // include insurance
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
                `Blackjack game ended: ${interaction.user.displayName} ${outcomeText} ${fmt(Math.abs(netResult))} (incl. insurance)`,
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
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } catch (replyError) {
                logger.error(`Failed to send error message: ${replyError.message}`);
            }
        }
    }
};
