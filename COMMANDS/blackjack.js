/**
 * Blackjack game command for the casino bot
 * Classic blackjack with hit, stand, double down, and split functionality
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { PayoutManager, GameType, GameResult, TimeoutManager } = require('../UTILS/gameUtils');
const { fmt, fmtDelta, clearActiveGame, setActiveGame, getGuildId, sendLogMessage } = require('../UTILS/common');
const { BlackjackGame } = require('../GAMES/blackjack');
const { GamePanelUtil } = require('../UTILS/gamePanelUtil');
const { buildSessionEmbed, buildButtons } = require('../UTILS/gameSessionKit');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');


// Active games storage
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
 * Create action buttons for blackjack game
 */
function createGameButtons(userId) {
    return buildButtons(`bj-${userId}`, [
        { id: 'hit', label: 'Hit', style: ButtonStyle.Success },
        { id: 'stand', label: 'Stand', style: ButtonStyle.Danger },
        { id: 'double', label: 'Double Down', style: ButtonStyle.Secondary },
        { id: 'split', label: 'Split', style: ButtonStyle.Primary },
        { id: 'help', label: '?', style: ButtonStyle.Secondary }
    ]);
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
        const amount = interaction.options.getString('amount');
        const guildId = await getGuildId(interaction);

        // Check if user already has an active blackjack game
        if (activeGames.has(userId)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Game Already Active')
                .setDescription('You already have an active blackjack game.')
                .setColor(0xFF0000);
            
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        try {
            // Ensure user exists and get balance
            await dbManager.ensureUser(userId, interaction.user.displayName);
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

            const betAmount = validation.parsedAmount;

            // Create new game
            const game = new BlackjackGame(userId, betAmount);
            game.dealInitialCards();
            activeGames.set(userId, game);
            setActiveGame(userId, GameType.BLACKJACK);

            // Create embed and table image
            const embed = createGameEmbed(game, interaction.user, false, userBalance);
            const actionRow = createGameButtons(userId);
            const tableImage = await createGameTableImage(game, false);

            // Send game message with embed and table
            const messageData = { embeds: [embed], components: [actionRow] };
            if (tableImage) {
                messageData.files = [{ attachment: tableImage, name: 'blackjack-table.png' }];
                // Attach image to embed to display inside panel
                embed.setImage('attachment://blackjack-table.png');
            }
            
            await interaction.reply(messageData);

            // Set timeout for game (5 minutes)
            TimeoutManager.setTimeout(userId, 300, () => {
                if (activeGames.has(userId)) {
                    activeGames.delete(userId);
                    clearActiveGame(userId);
                    PayoutManager.refundBet(userId, interaction.guildId, betAmount, 'Game timeout');
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
                activeGames.delete(userId);
                clearActiveGame(userId);
                TimeoutManager.clearTimeout(userId);

                // Create final embed and table showing blackjack
                const finalEmbed = createGameEmbed(game, interaction.user, true, userBalance);
                const finalTable = await createGameTableImage(game, true);
                
                const finalData = { 
                    content: `🎉 **BLACKJACK!** You won ${fmt(result.payout)}!`,
                    embeds: [finalEmbed], 
                    components: [] 
                };
                
                if (finalTable) {
                    finalData.files = [{ attachment: finalTable, name: 'blackjack-final.png' }];
                    finalEmbed.setImage('attachment://blackjack-final.png');
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
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Game Error')
                .setDescription('An error occurred while starting blackjack. Please try again.')
                .setColor(0xFF0000);

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
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

                // Update embed and table
                const hitEmbed = createGameEmbed(game, interaction.user, false, userBalance);
                const hitActionRow = createGameButtons(userId);
                const hitTableImage = await createGameTableImage(game, false);

                const hitUpdateData = { embeds: [hitEmbed], components: [hitActionRow] };
                if (hitTableImage) {
                    hitUpdateData.files = [{ attachment: hitTableImage, name: 'blackjack-table.png' }];
                    hitEmbed.setImage('attachment://blackjack-table.png');
                }

                await interaction.update(hitUpdateData);
                break;

            case 'stand':
                // Stand
                game.stand();

                if (game.splitHands.length > 0 && !game.allHandsComplete()) {
                    // Move to next split hand
                    game.currentHandIndex++;
                    
                    const standEmbed = createGameEmbed(game, interaction.user, false, userBalance);
                    const standActionRow = createGameButtons(userId);
                    const standTableImage = await createGameTableImage(game, false);

                    const standUpdateData = { embeds: [standEmbed], components: [standActionRow] };
                    if (standTableImage) {
                        standUpdateData.files = [{ attachment: standTableImage, name: 'blackjack-table.png' }];
                        standEmbed.setImage('attachment://blackjack-table.png');
                    }

                    await interaction.update(standUpdateData);
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

                // Update embed and table
                const splitEmbed = createGameEmbed(game, interaction.user, false, userBalance);
                const splitActionRow = createGameButtons(userId);
                const splitTableImage = await createGameTableImage(game, false);

                const splitUpdateData = { embeds: [splitEmbed], components: [splitActionRow] };
                if (splitTableImage) {
                    splitUpdateData.files = [{ attachment: splitTableImage, name: 'blackjack-table.png' }];
                    splitEmbed.setImage('attachment://blackjack-table.png');
                }

                await interaction.update(splitUpdateData);
                break;

            case 'help':
                const helpEmbed = new EmbedBuilder()
                    .setTitle('🃏 Blackjack Help')
                    .setColor(0x0099FF)
                    .setDescription('**How to Play Blackjack**')
                    .addFields(
                        {
                            name: '🎯 Objective',
                            value: 'Get as close to 21 as possible without going over, while beating the dealer\'s hand.',
                            inline: false
                        },
                        {
                            name: '🃏 Card Values',
                            value: '• **Aces:** 1 or 11 (whichever is better)\n• **Face cards:** 10 points each\n• **Number cards:** Face value',
                            inline: false
                        },
                        {
                            name: '🎮 Actions',
                            value: '• **Hit:** Take another card\n• **Stand:** Keep current hand\n• **Double Down:** Double bet, take one card, then stand\n• **Split:** Split pairs into two hands (doubles bet)',
                            inline: false
                        },
                        {
                            name: '🏆 Winning',
                            value: '• **Blackjack:** Ace + 10-value card (pays 3:2)\n• **Beat Dealer:** Higher total without busting\n• **Dealer Busts:** Dealer goes over 21',
                            inline: false
                        }
                    )
                    .setFooter({ text: '🍀 Good luck at the tables!' });

                await interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
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

            // Create final embed and table (before cleanup)
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            const finalEmbed = createGameEmbed(game, interaction.user, true, userBalance);
            const finalTable = await createGameTableImage(game, true);

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
                components: []
            };

            if (finalTable) {
                finalData.files = [{ attachment: finalTable, name: 'blackjack-final.png' }];
                finalEmbed.setImage('attachment://blackjack-final.png');
            }

            try {
                await interaction.update(finalData);
                logger.info(`Blackjack game successfully ended for user ${userId}`);
            } catch (interactionError) {
                logger.error(`Failed to update interaction for blackjack endGame: ${interactionError.message}`);
                // Still clean up the game even if interaction update fails
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