/**
 * Blackjack game command for the casino bot
 * Classic blackjack with hit, stand, double down, and split functionality
 */

const { SlashCommandBuilder, MessageFlags, ButtonBuilder, ButtonStyle } = require('discord.js');
const { PayoutManager, GameType, GameResult, TimeoutManager } = require('../UTILS/gameUtils');
const { fmt, fmtDelta, getGuildId, sendLogMessage } = require('../UTILS/common');
const { BlackjackGame } = require('../GAMES/blackjack');
const GamePanel = require('../UTILS/gamePanel');
const SMGameType = { BLACKJACK: 'blackjack' };
const GameSessionIntegrator = require('../UTILS/gameSessionIntegrator');
const sessionGuard = require('../UTILS/sessionGuard');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');
const { GamePanelUtil } = require('../UTILS/gamePanelUtil');
const { buildSessionEmbed, buildButtons } = require('../UTILS/gameSessionKit');
const levelingSystem = require('../UTILS/levelingSystem');


// Active games storage (indexed by sessionId for better session management)
const activeGames = new Map();

// Initialize Game Panel Util
const gamePanelUtil = new GamePanelUtil();


/**
 * Create game embed with consistent styling using gameSessionKit
 */
function createGameEmbed(game, user, showDealer = false, balance = null) {
    // Top fields for game information
    const topFields = [];
    
    // Dealer's hand
    const dealerDisplay = showDealer ? 
        `${game.dealerHand.toString()} (${game.dealerHand.getValue()})` :
        `${game.dealerHand.getDisplayString(true)} (??)`;
    
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
            const indicator = isCurrentHand ? '→ ' : '  ';
            playerDisplay += `${indicator}Hand ${i + 1}: ${hand.toString()} (${hand.getValue()})${status}\n`;
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

    return buildSessionEmbed({
        title: `🃏 ${user.displayName}'s Blackjack`,
        topFields,
        bankFields,
        stageText,
        color,
        footer: game.gameEnded ? 'Game completed' : 'Choose your action'
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
        actions.unshift('hit', 'stand');
        
        if (game.canDouble()) {
            actions.splice(2, 0, 'double');
        }
        
        if (game.canSplit()) {
            actions.splice(-1, 0, 'split');
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
                .setDescription('Amount to bet (supports K/M/B, "all", "half")')
                .setRequired(true)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const amount = interaction.options.getString('amount');
        const guildId = await getGuildId(interaction);

        let validation; // Declare validation at function scope
        
        try {
            // Validate session before proceeding using modern session system
            const sessionValidation = await GameSessionIntegrator.validateGameSession(userId, SMGameType.BLACKJACK, guildId);
            if (!sessionValidation.valid) {
                const errorEmbed = GameSessionIntegrator.createValidationErrorEmbed(username, 'blackjack', sessionValidation);
                return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Ensure user exists and get balance
            await dbManager.ensureUser(userId, username);
            const userBalance = await dbManager.getUserBalance(userId, guildId);

            // Validate and deduct bet
            validation = await PayoutManager.validateAndDeductBet(
                interaction,
                amount,
                GameType.BLACKJACK,
                1,        // Min bet: $1
                500000    // Max bet: $500K
            );

            if (!validation.isValid) {
                return await interaction.reply({ embeds: [validation.errorEmbed], flags: MessageFlags.Ephemeral });
            }
            
            // Balance validation is handled by PayoutManager.validateAndDeductBet

            const betAmount = validation.parsedAmount;

            // Create game session with enhanced protection
            const sessionResult = await GameSessionIntegrator.createGameSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: SMGameType.BLACKJACK,
                betAmount,
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

            // Create new game and link to session
            const game = new BlackjackGame(userId, betAmount);
            game.dealInitialCards();
            game.sessionId = sessionId; // Link game to session
            activeGames.set(sessionId, game); // Store by sessionId instead of userId

            // Update session with initial game data
            await GameSessionIntegrator.updateGameSession(sessionId, {
                gameData: {
                    dealerHand: game.dealerHand.cards.map(c => c.toString()),
                    playerHand: game.playerHand.cards.map(c => c.toString()),
                    dealerValue: game.dealerHand.getValue(),
                    playerValue: game.playerHand.getValue(),
                    gamePhase: 'playing',
                    gameStarted: true
                }
            }, 'initial_deal');

            // Create embed and table image
            const embed = createGameEmbed(game, interaction.user, false, userBalance);
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

            // Session timeout is handled by GameSessionIntegrator

            // Check for immediate blackjack
            if (game.playerHand.isBlackjack()) {
                game.dealerPlay();
                const results = game.getResults();
                const result = results[0];

                // Process payout
                const gameResult = new GameResult({
                    userId: userId,
                    guildId: guildId,
                    gameType: GameType.BLACKJACK,
                    betAmount: betAmount,
                    payout: result.payout,
                    won: result.won,
                    specialResult: 'BLACKJACK'
                });

                await PayoutManager.processGamePayout(gameResult);
                
                // Complete session
                await GameSessionIntegrator.completeGameSession(sessionId, {
                    outcome: 'BLACKJACK',
                    payout: result.payout,
                    won: result.won,
                    finalResult: result
                });

                activeGames.delete(sessionId);

                // Create final embed showing blackjack
                const finalEmbed = createGameEmbed(game, interaction.user, true, userBalance);
                const tableImage = await createGameTableImage(game, true);
                
                // Get updated balance for play again buttons
                const updatedBalance = await dbManager.getUserBalance(userId, guildId);
                
                const finalData = {
                    content: `🎉 **BLACKJACK!** You won ${fmt(result.payout)}!`,
                    embeds: [finalEmbed], 
                    components: GamePanel.createGameButtons({ 
                        actions: ['play_again_multi', 'quit'],
                        lastBet: betAmount,
                        balance: updatedBalance.wallet
                    })
                };
                
                if (tableImage) {
                    finalData.files = [{ attachment: tableImage, name: 'blackjack-table.png' }];
                    finalEmbed.setImage('attachment://blackjack-table.png');
                }
                
                await interaction.editReply(finalData);
                
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
            
            // Handle game error with session cleanup and refund
            let refundAmount = 0;
            try {
                // Try to get bet amount from validation or other sources
                if (typeof validation !== 'undefined' && validation?.parsedAmount) {
                    refundAmount = validation.parsedAmount;
                } else {
                    // Try to parse amount directly as fallback
                    const userBalance = await dbManager.getUserBalance(userId, guildId);
                    const parsedAmount = PayoutManager.parseAmount(amount, userBalance.wallet);
                    if (parsedAmount > 0) {
                        refundAmount = parsedAmount;
                    }
                }
            } catch (parseError) {
                logger.warn(`Could not determine refund amount: ${parseError.message}`);
            }
            
            await GameSessionIntegrator.handleGameError(userId, SMGameType.BLACKJACK, refundAmount, guildId, 'Blackjack game initialization error');
            
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
        
        // Find active game by user's session
        let game = null;
        let sessionId = null;
        
        // Find user's active blackjack session from GameSessionIntegrator
        const activeSessions = await GameSessionIntegrator.getActiveUserSessions(userId);
        const blackjackSession = activeSessions.find(s => s.gameType === SMGameType.BLACKJACK);
        
        if (blackjackSession) {
            sessionId = blackjackSession.sessionId;
            game = activeGames.get(sessionId);
        }
        
        if (!game || !sessionId) {
            return await interaction.reply({ content: 'No active blackjack game found.', flags: MessageFlags.Ephemeral });
        }

        const userBalance = await dbManager.getUserBalance(userId, guildId);

        switch (actionId) {
            case 'hit':
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
                    const hitEmbed = createGameEmbed(game, interaction.user, false, userBalance);
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

            case 'stand':
                // Stand
                game.stand();

                if (game.splitHands.length > 0 && !game.allHandsComplete()) {
                    // Move to next split hand
                    game.currentHandIndex++;
                    
                    const standEmbed = createGameEmbed(game, interaction.user, false, userBalance);
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

            case 'split':
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
                const splitEmbed = createGameEmbed(game, interaction.user, false, userBalance);
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

            case 'help':
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
    },

    endGame: async function(interaction, game, userId, guildId) {
        try {
            // Safety check - ensure game still exists
            if (!activeGames.has(game.sessionId) || activeGames.get(game.sessionId) !== game) {
                logger.warn(`endGame called but game no longer exists or differs for session ${game.sessionId}`);
                return;
            }
            const results = game.getResults();
            
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

            // Update user balance with winnings (game_active handled by SessionManager)
            if (totalPayout > 0) {
                await dbManager.updateUserBalance(userId, guildId, totalPayout, 0);
            }

            // Record game result for statistics
            const won = totalPayout > game.betAmount * (game.splitHands.length || 1);
            const totalBetAmount = game.betAmount * (game.splitHands.length || 1);
            
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
                levelUpMessage = `\n\n🎉 **LEVEL UP!** You are now level **${xpResult.newLevel}**!`;
                
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
            const finalEmbed = createGameEmbed(game, interaction.user, true, userBalance);
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
                        handResults.push(`Hand ${i + 1}: ${status} ${fmt(payout)}`);
                    }
                    resultMessage = handResults.join('\n');
                    resultMessage += `\n\n**Total Payout: ${fmt(totalPayout)}**`;
                } else {
                    const result = results[0] || {};
                    const payout = result.payout || 0;
                    if (result.won) {
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
                await GameSessionIntegrator.completeGameSession(game.sessionId, {
                    outcome: 'COMPLETED',
                    payout: totalPayout,
                    won: totalPayout > 0,
                    results: results
                });
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
    }
};