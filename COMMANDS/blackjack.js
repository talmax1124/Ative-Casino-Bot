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
const OffEconomyBadge = require('../UTILS/offEconomyBadge');
// LEGACY: economicManager replaced by EconomyGuardian AI
// const economicManager = require('../UTILS/economicManager');
const EconomyGuardianInterface = require('../UTILS/economyGuardianInterface');

// Game type constant
const SMGameType = { BLACKJACK: 'blackjack' };

// Active games storage (indexed by sessionId for better session management)
const activeGames = new Map();

// Initialize Game Panel Util
const gamePanelUtil = new GamePanelUtil();


/**
 * Create game embed with consistent styling using gameSessionKit
 */
async function createGameEmbed(game, user, showDealer = false, balance = null, economicIndicators = null) {
    // Get off economy badge for the user
    const offEcoBadge = await OffEconomyBadge.getGamePanelBadge(user.id);
    // Top fields for game information
    const topFields = [];
    
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
        const results = game.getResults();
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
        title: `🃏 ${user.displayName}'s Blackjack${offEcoBadge}`,
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
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const amount = interaction.options.getString('amount');
        const guildId = await getGuildId(interaction);
        logger.debug(`Blackjack execute called by ${username} (${userId}) in guild ${guildId} with amount '${amount}'`);

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
            const aiResult = await EconomyGuardianInterface.interceptEconomicCommand(
                interaction,
                'blackjack',
                parsedAmount,
                { 
                    userBalance: userBalance.wallet + userBalance.bank,
                    gameType: 'casino_game'
                }
            );
            
            // 🚀 AI SILENT OPTIMIZATION: Never block transactions, only adjust payouts silently
            // All transactions proceed normally for seamless high-volume gameplay
            
            // Log ATIVE AI analysis if significant
            if (aiResult.riskScore && aiResult.riskScore > 0.3) {
                logger.info(`🤖 ATIVE AI Blackjack Analysis: ${userId} - Amount: ${fmt(parsedAmount)} - Risk: ${aiResult.riskScore.toFixed(3)} - Multiplier: ${aiResult.multiplierAdjustment?.finalMultiplier?.toFixed(3)}x`);
                if (aiResult.multiplierAdjustment?.aiReasoning) {
                    logger.info(`🧠 AI Reasoning: ${aiResult.multiplierAdjustment.aiReasoning}`);
                }
            }
            
            // Validate and deduct bet (500K maximum limit - reduced from 10M)
            validation = await PayoutManager.validateAndDeductBet(
                interaction,
                amount,
                GameType.BLACKJACK,
                1,          // Min bet: $1
                100000000   // Max bet: $100M (safe with personalization)
            );

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
                    gameStarted: false
                },
                interaction
            });
            
            if (!sessionResult.success) {
                throw new Error(`Session creation failed: ${sessionResult.error}`);
            }

            const sessionId = sessionResult.sessionId;
            logger.debug(`Blackjack session created: ${sessionId} for ${userId}`);

            // Create new game and link to session
            const game = new BlackjackGame(userId, betAmount);
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
            const economicIndicators = EconomyGuardianInterface.getEconomicIndicators(interaction.client);
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
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                } else if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
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
            
            if (activeSession && activeSession.gameType === SMGameType.BLACKJACK) {
                sessionId = activeSession.sessionId;
                const sessionData = activeGames.get(sessionId);
                game = sessionData?.game;
            }
            
            if (!game || !sessionId) {
                return await interaction.reply({ content: 'No active blackjack game found.', flags: MessageFlags.Ephemeral });
            }

            const userBalance = await dbManager.getUserBalance(userId, guildId);

            switch (actionId) {
                case 'hit': {
                    try {
                    // Hit
                    game.hit();

                    // Check for bust or completion
                    if (game.isCurrentHandComplete()) {
                        if (game.splitHands.length > 0 && !game.allHandsComplete()) {
                            // Move to next split hand
                            game.currentHandIndex++;
                        } else {
                            // All hands complete, dealer plays
                            game.dealerPlay();
                            await module.exports.endGame(interaction, game, userId, guildId);
                            return;
                        }
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
                    await interaction.reply({ 
                        content: '❌ An error occurred while hitting. Please try again.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }
                break;
            }

            case 'stand': {
                // Stand
                game.stand();

                if (game.splitHands.length > 0 && !game.allHandsComplete()) {
                    // Move to next split hand
                    game.currentHandIndex++;
                    
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
                } else {
                    // Game complete, dealer plays
                    game.dealerPlay();
                    await module.exports.endGame(interaction, game, userId, guildId);
                }
                break;
            }

            case 'double':
                // Check if can double
                if (!game.canDouble()) {
                    return await interaction.reply({ content: 'Cannot double down now.', flags: MessageFlags.Ephemeral });
                }

                // Check funds
                if (userBalance.wallet < game.betAmount) {
                    return await interaction.reply({ 
                        content: `Insufficient funds to double down! You need ${fmt(game.betAmount)} more.`, 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                // Deduct additional bet
                await dbManager.updateUserBalance(userId, guildId, -game.betAmount, 0);

                // Double down
                game.doubleDown();
                
                // Complete game
                game.dealerPlay();
                await module.exports.endGame(interaction, game, userId, guildId);
                break;

            case 'split': {
                // Check if can split
                if (!game.canSplit()) {
                    return await interaction.reply({ content: 'Cannot split this hand.', flags: MessageFlags.Ephemeral });
                }

                // Check funds for split
                if (userBalance.wallet < game.betAmount) {
                    return await interaction.reply({ 
                        content: `Insufficient funds to split! You need ${fmt(game.betAmount)} more.`, 
                        flags: MessageFlags.Ephemeral 
                    });
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
                    return await interaction.reply({ content: 'Insurance is not available.', flags: MessageFlags.Ephemeral });
                }
                
                // Check if user has enough funds for insurance
                if (userBalance.wallet < game.insuranceAmount) {
                    return await interaction.reply({ 
                        content: `Insufficient funds for insurance! You need ${fmt(game.insuranceAmount)} more.`, 
                        flags: MessageFlags.Ephemeral 
                    });
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
                        'Blackjack (Ace + 10-value) pays 3:2',
                        'Dealer must hit on 16 and stand on 17',
                        'If dealer busts, all remaining players win'
                    ]
                });

                await interaction.reply({ embeds: [helpEmbed], components: helpComponents, flags: MessageFlags.Ephemeral });
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
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Error processing action.', flags: MessageFlags.Ephemeral });
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
                    economicMultiplier = await EconomyGuardianInterface.getDynamicMultiplier(
                        { user: { id: userId }, client: game.client },
                        'blackjack',
                        game.betAmount
                    );
                }
                economicMultiplier = Math.max(0.5, Math.min(1.5, economicMultiplier)); // Cap between 0.5x - 1.5x
            } catch (error) {
                logger.warn(`Failed to get AI economic multiplier for blackjack: ${error.message}`);
                economicMultiplier = 1.0;
            }
            
            // Get personalized payouts for this player
            const PersonalizedGameHelper = require('../UTILS/personalizedGameHelper');
            const personalizedConfig = await PersonalizedGameHelper.getPersonalizedBlackjack(userId, null);
            
            const results = game.getResults({ 
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
                    winnings += result.payout || 0;
                }
            }

            // Calculate total bet amount including double downs
            let totalBetAmount = 0;
            for (const result of results) {
                totalBetAmount += result.betAmount || game.betAmount;
            }
            const won = totalPayout > 0;
            
            // Use PayoutManager for consistent payout handling
            const gameResult = new GameResult({
                userId,
                guildId,
                gameType: 'blackjack',
                betAmount: totalBetAmount,
                payout: totalPayout,
                won: won,
                metadata: { hands: results.length }
            });

            await PayoutManager.processGamePayout(gameResult);
            
            try {
                await dbManager.recordGameResult(
                    userId, 
                    guildId, 
                    'blackjack', 
                    won, 
                    totalBetAmount, 
                    totalPayout,
                    {
                        hands: game.splitHands.length || 1,
                        dealerValue: game.dealerHand.getValue(),
                        playerValue: game.playerHand.getValue(),
                        outcome: results[0]?.outcome || 'unknown',
                        split: game.splitHands.length > 0
                    }
                );
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
            const finalEmbed = await createGameEmbed(game, interaction.user, true, userBalance);
            const tableImage = await createGameTableImage(game, true);

            // Create result message with enhanced safety checks
            let resultMessage = '';
            try {
                if (results.length > 1) {
                    // Split hands
                    const handResults = [];
                    for (let i = 0; i < results.length; i++) {
                        const result = results[i] || {};
                        const payout = result.payout || 0;
                        const status = result.won ? '🎉 WIN!' : '💸 LOSE';
                        const doubledText = result.doubled ? ' (DOUBLED)' : '';
                        handResults.push(`Hand ${i + 1}: ${status} ${fmt(payout)}${doubledText}`);
                    }
                    resultMessage = handResults.join('\n');
                    resultMessage += `\n\n**Total Payout: ${fmt(totalPayout)}**`;
                } else {
                    const result = results[0] || {};
                    const payout = result.payout || 0;
                    logger.info(`🔍 DEBUG: won=${result.won}, outcome=${result.outcome}, baseMultiplier=${result.baseMultiplier}, multiplier=${result.multiplier}, payout=${payout}`);
                    
                    // Force win display based on base game outcome, not economic multipliers
                    if (result.baseMultiplier > 1 || result.outcome === 'DEALER BUSTED' || result.outcome === 'BLACKJACK' || result.outcome === 'WIN') {
                        resultMessage = `🎉 **YOU WIN!** ${fmt(payout)}`;
                    } else if (result.outcome === 'PUSH') {
                        resultMessage = `🤝 **PUSH** - Your bet is returned.`;
                    } else {
                        resultMessage = `💸 **YOU LOSE!** Better luck next time.`;
                    }
                }
            } catch (messageError) {
                logger.error(`Error creating result message for user ${userId}: ${messageError.message}`);
                resultMessage = `🎰 **GAME COMPLETE** - Total Payout: ${fmt(totalPayout)}`;
            }
            
            // Add level up message if applicable
            if (levelUpMessage) {
                resultMessage += levelUpMessage;
            }
            
            // Safety check - ensure resultMessage is not empty and has content
            if (!resultMessage || resultMessage.trim() === '' || resultMessage.length < 3) {
                resultMessage = `🎰 **GAME COMPLETE** - Total Payout: ${fmt(totalPayout)}`;
                logger.warn(`Empty or invalid result message for blackjack game, using fallback for user ${userId}`);
            }

            // Get updated balance for play again buttons
            const updatedBalance = await dbManager.getUserBalance(userId, guildId);
            
            // Enhanced interaction update with validation
            const finalData = {
                content: resultMessage || `🎰 Game Complete - Total Payout: ${fmt(totalPayout)}`,
                embeds: [finalEmbed],
                components: GamePanel.createGameButtons({ 
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
                    finalData.content = `🎰 Game Complete - Payout: ${fmt(totalPayout)}`;
                }
                
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(finalData);
                } else {
                    await interaction.update(finalData);
                }
                
                logger.info(`Blackjack game successfully ended for user ${userId}`);
            } catch (interactionError) {
                logger.error(`Failed to update interaction for blackjack endGame: ${interactionError.message}`);
                
                // Fallback: try to send a new reply if update fails
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        const fallbackData = {
                            content: `🎰 Game Complete - Payout: ${fmt(totalPayout)}`,
                            embeds: [finalEmbed],
                            components: GamePanel.createGameButtons({ 
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
                    }
                } catch (fallbackError) {
                    logger.error(`Failed fallback reply for blackjack endGame: ${fallbackError.message}`);
                }
            }

            // Complete session if game has one
            if (game.sessionId) {
                await sessionManager.endSession(game.sessionId, {
                    outcome: 'COMPLETED',
                    payout: totalPayout,
                    won: totalPayout > 0,
                    results: results
                });
            }

            // 🤖 Log transaction result to EconomyGuardian for learning
            try {
                await EconomyGuardianInterface.logTransactionResult(
                    interaction,
                    'blackjack',
                    totalBetAmount,
                    { won: won, payout: totalPayout },
                    sessionData.aiResult || {}
                );
            } catch (error) {
                logger.error(`Failed to log transaction to EconomyGuardian: ${error.message}`);
            }
            
            // Clean up after interaction update (success or failure)
            activeGames.delete(game.sessionId);

            // Log game end
            await sendLogMessage(
                interaction.client,
                'game',
                `Blackjack game ended: ${interaction.user.displayName} ${totalPayout > 0 ? 'won' : 'lost'} ${fmt(Math.abs(totalPayout - game.betAmount * (game.splitHands.length || 1)))}`,
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
