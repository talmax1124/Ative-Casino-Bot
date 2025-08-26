/**
 * Blackjack game command for the casino bot
 * Classic blackjack with hit, stand, double down, and split functionality
 */

const { SlashCommandBuilder, MessageFlags, ButtonBuilder, ButtonStyle } = require('discord.js');
const { PayoutManager, GameType, GameResult, TimeoutManager } = require('../UTILS/gameUtils');
const { fmt, fmtDelta, clearActiveGame, setActiveGame, getGuildId, sendLogMessage } = require('../UTILS/common');
const { BlackjackGame } = require('../GAMES/blackjack');
const GamePanel = require('../UTILS/gamePanel');
const { sessionManager, GameType: SMGameType } = require('../UTILS/sessionManager');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');


// Active games storage
const activeGames = new Map();


/**
 * Create game embed with standardized GamePanel system
 */
function createGameEmbed(game, user, showDealer = false, balance = null) {
    // Dealer's hand
    const dealerDisplay = showDealer ? 
        `${game.dealerHand.toString()} (${game.dealerHand.getValue()})` :
        `${game.dealerHand.getDisplayString(true)} (??)`;
    
    // Player's hand(s) display
    let playerDisplay;
    if (game.splitHands.length > 0) {
        let display = '';
        for (let i = 0; i < game.splitHands.length; i++) {
            const hand = game.splitHands[i];
            const isCurrentHand = i === game.currentHandIndex && !game.gameEnded;
            const status = hand.isBusted() ? ' [BUST]' : hand.isStood() ? ' [STAND]' : '';
            const indicator = isCurrentHand ? '→ ' : '  ';
            display += `${indicator}Hand ${i + 1}: ${hand.toString()} (${hand.getValue()})${status}\n`;
        }
        playerDisplay = display.trim();
    } else {
        const playerStatus = game.playerHand.isBusted() ? ' [BUST]' : '';
        playerDisplay = `${game.playerHand.toString()} (${game.playerHand.getValue()})${playerStatus}`;
    }

    // Determine game status and description
    let status = 'active';
    let description = `🏠 **Dealer:** ${dealerDisplay}\n🎲 **Your Hand:** ${playerDisplay}`;
    
    if (game.gameEnded) {
        const results = game.getResults();
        if (results.length > 1) {
            const wins = results.filter(r => r.won).length;
            status = wins > 0 ? 'win' : 'loss';
        } else {
            const result = results[0];
            if (result.outcome === 'BLACKJACK') {
                status = 'win';
                description += '\n\n🎉 **BLACKJACK!**';
            } else if (result.won) {
                status = 'win';
            } else if (result.outcome === 'PUSH') {
                status = 'draw';
                description += '\n\n🤝 **PUSH**';
            } else {
                status = 'loss';
            }
        }
    }

    return GamePanel.createGameEmbed({
        title: `🃏 ${user.displayName}'s Blackjack`,
        description,
        gameType: 'blackjack',
        status,
        betAmount: game.betAmount,
        balance: balance?.wallet || 0,
        footer: game.gameEnded ? 'Game completed' : 'Choose your action'
    });
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

        try {
            // Check for existing sessions using GamePanel validation
            const sessionValidation = GamePanel.createSessionValidationEmbed({
                gameType: 'blackjack',
                hasActiveSession: activeGames.has(userId),
                activeSessionType: activeGames.has(userId) ? 'blackjack' : ''
            });
            
            if (sessionValidation) {
                return await interaction.reply({ ...sessionValidation, flags: MessageFlags.Ephemeral });
            }

            // Ensure user exists and get balance
            await dbManager.ensureUser(userId, username);
            const userBalance = await dbManager.getUserBalance(userId, guildId);

            // Validate and deduct bet
            const validation = await PayoutManager.validateAndDeductBet(
                interaction,
                amount,
                GameType.BLACKJACK,
                1,        // Min bet: $1
                500000    // Max bet: $500K
            );

            if (!validation.isValid) {
                return await interaction.reply({ embeds: [validation.errorEmbed], flags: MessageFlags.Ephemeral });
            }
            
            // Check balance validation with GamePanel
            const balanceValidation = GamePanel.createSessionValidationEmbed({
                gameType: 'blackjack',
                hasActiveSession: false,
                balance: userBalance.wallet,
                minBet: 1
            });
            
            if (balanceValidation) {
                return await interaction.reply({ ...balanceValidation, flags: MessageFlags.Ephemeral });
            }

            const betAmount = validation.parsedAmount;

            // Register session with SessionManager
            setActiveGame(userId, GameType.BLACKJACK);
            
            const sessionResult = await sessionManager.createSession({
                userId, guildId, channelId: interaction.channelId,
                gameType: 'blackjack', betAmount,
                timeout: 300000, // 5 minutes
                metadata: { 
                    dealerHand: [], 
                    playerHand: [], 
                    gamePhase: 'initial' 
                }
            });
            
            if (!sessionResult.success) {
                throw new Error(`Session creation failed: ${sessionResult.error}`);
            }

            const sessionId = sessionResult.sessionId;

            // Create new game
            const game = new BlackjackGame(userId, betAmount);
            game.dealInitialCards();
            game.sessionId = sessionId; // Link game to session
            activeGames.set(userId, game);
            setActiveGame(userId, GameType.BLACKJACK);

            // Update session with initial game data
            await sessionManager.updateSession(sessionId, {
                dealerHand: game.dealerHand.getCards().map(c => c.toString()),
                playerHand: game.playerHand.getCards().map(c => c.toString()),
                dealerValue: game.dealerHand.getValue(),
                playerValue: game.playerHand.getValue(),
                gamePhase: 'playing',
                gameStarted: true
            });

            // Create embed and buttons
            const embed = createGameEmbed(game, interaction.user, false, userBalance);
            const actionRows = createGameButtons(userId, game);

            // Send game message
            await interaction.reply({ 
                embeds: [embed], 
                components: actionRows 
            });

            // Legacy timeout (SessionManager handles main timeout)
            TimeoutManager.setTimeout(userId, 300, () => {
                if (activeGames.has(userId)) {
                    activeGames.delete(userId);
                    clearActiveGame(userId);
                    // Don't refund here - SessionManager handles it
                }
            });

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
                await sessionManager.completeSession(sessionId, {
                    outcome: 'BLACKJACK',
                    payout: result.payout,
                    won: result.won
                });

                activeGames.delete(userId);
                clearActiveGame(userId);
                TimeoutManager.clearTimeout(userId);

                // Create final embed showing blackjack
                const finalEmbed = createGameEmbed(game, interaction.user, true, userBalance);
                
                await interaction.editReply({ 
                    content: `🎉 **BLACKJACK!** You won ${fmt(result.payout)}!`,
                    embeds: [finalEmbed], 
                    components: GamePanel.createGameButtons({ actions: ['play_again', 'quit'] })
                });
                
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
            
            // Cleanup on error
            if (activeGames.has(userId)) {
                activeGames.delete(userId);
                clearActiveGame(userId);
            }
            
            // Refund bet if validation passed (only if validation exists)
            try {
                if (typeof validation !== 'undefined' && validation?.parsedAmount) {
                    await dbManager.updateUserBalance(userId, guildId, validation.parsedAmount, 0);
                }
            } catch (refundError) {
                logger.error(`Failed to refund bet: ${refundError.message}`);
            }
            
            const { embed: errorEmbed } = GamePanel.createErrorEmbed({
                title: '❌ Blackjack Error',
                description: 'An error occurred while starting blackjack. Your bet has been refunded.',
                gameType: 'blackjack',
                showRetry: false
            });

            try {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            } catch (replyError) {
                logger.error(`Failed to send error reply: ${replyError.message}`);
            }
        }
    },

    // Blackjack button handlers (to be handled by interaction handler in index.js)
    handleBlackjackAction: async function(interaction, actionId) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        
        if (!activeGames.has(userId)) {
            return await interaction.reply({ content: 'No active blackjack game found.', flags: MessageFlags.Ephemeral });
        }

        const game = activeGames.get(userId);
        const userBalance = await dbManager.getUserBalance(userId, guildId);

        switch (actionId) {
            case 'hit':
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

                await interaction.update({ 
                    embeds: [hitEmbed], 
                    components: hitActionRows 
                });
                break;

            case 'stand':
                // Stand
                game.stand();

                if (game.splitHands.length > 0 && !game.allHandsComplete()) {
                    // Move to next split hand
                    game.currentHandIndex++;
                    
                    const standEmbed = createGameEmbed(game, interaction.user, false, userBalance);
                    const standActionRows = createGameButtons(userId, game);

                    await interaction.update({ 
                        embeds: [standEmbed], 
                        components: standActionRows 
                    });
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

                await interaction.update({ 
                    embeds: [splitEmbed], 
                    components: splitActionRows 
                });
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
            if (!activeGames.has(userId) || activeGames.get(userId) !== game) {
                logger.warn(`endGame called but game no longer exists or differs for user ${userId}`);
                return;
            }
            const results = game.getResults();
            let totalPayout = 0;
            let winnings = 0;

            // Process each hand result
            for (const result of results) {
                totalPayout += result.payout;
                if (result.won) {
                    winnings += result.payout;
                }
            }

            // Update user balance with winnings
            if (totalPayout > 0) {
                await dbManager.updateUserBalance(userId, guildId, totalPayout, 0, { game_active: false });
            } else {
                await dbManager.updateUserBalance(userId, guildId, 0, 0, { game_active: false });
            }

            // Create final embed (before cleanup)
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            const finalEmbed = createGameEmbed(game, interaction.user, true, userBalance);

            // Create result message
            let resultMessage = '';
            if (results.length > 1) {
                // Split hands
                resultMessage = results.map((result, i) => 
                    `Hand ${i + 1}: ${result.won ? '🎉 WIN!' : '💸 LOSE'} ${fmt(result.payout)}`
                ).join('\n');
                resultMessage += `\n\n**Total Payout: ${fmt(totalPayout)}**`;
            } else {
                const result = results[0];
                if (result.won) {
                    resultMessage = `🎉 **YOU WIN!** ${fmt(result.payout)}`;
                } else {
                    resultMessage = `💸 **YOU LOSE!** Better luck next time.`;
                }
            }

            const finalData = {
                content: resultMessage,
                embeds: [finalEmbed],
                components: GamePanel.createGameButtons({ actions: ['play_again', 'quit'] })
            };

            try {
                await interaction.update(finalData);
                logger.info(`Blackjack game successfully ended for user ${userId}`);
            } catch (interactionError) {
                logger.error(`Failed to update interaction for blackjack endGame: ${interactionError.message}`);
                // Still clean up the game even if interaction update fails
            }

            // Complete session if game has one
            if (game.sessionId) {
                await sessionManager.completeSession(game.sessionId, {
                    outcome: 'COMPLETED',
                    payout: totalPayout,
                    won: totalPayout > 0
                });
            }

            // Clean up after interaction update (success or failure)
            activeGames.delete(userId);
            clearActiveGame(userId);
            TimeoutManager.clearTimeout(userId);

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