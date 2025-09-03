/**
 * UNO command handler for ATIVE Casino Bot
 * Handles multiplayer UNO games with betting system
 */

const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const sessionManager = require('../UTILS/sessionManager');
const levelingSystem = require('../UTILS/levelingSystem');
const UITemplates = require('../UTILS/uiTemplates');
const { 
    UnoGameSession,
    startUnoGame,
    getUnoGame,
    endUnoGame,
    handleUnoAction,
    UNO_COLORS
} = require('../GAMES/uno');
const logger = require('../UTILS/logger');

// Game limits
const MIN_BET = 100;
const MAX_BET = 150000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('uno')
        .setDescription('🎴 Start a multiplayer UNO card game')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Bet amount for all players')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();
        
        const userId = interaction.user.id;
        const channelId = interaction.channelId;
        const guildId = await getGuildId(interaction);
        const username = interaction.user.displayName;
        const betAmountStr = interaction.options.getString('amount');

        try {
            logger.debug(`UNO execute called by ${username} (${userId}) in guild ${guildId} amount='${betAmountStr}'`);
            // Parse bet amount
            const betAmount = parseInt(betAmountStr);
            if (isNaN(betAmount) || betAmount <= 0) {
                const errorEmbed = UITemplates.createErrorEmbed('UNO', {
                    description: 'Invalid bet amount. Please enter a valid number.',
                    isLoss: false
                });
                return await interaction.followUp({ embeds: [errorEmbed] });
            }

            // Validate session before proceeding using modern session system (correct order/flag)
            const sessionGuard = require('../UTILS/sessionGuard');
            const check = await sessionGuard.check(userId, guildId, 'uno', interaction.client);
            if (!check.allowed) {
                const errorEmbed = new EmbedBuilder().setTitle("❌ Session Error").setDescription(check.message).setColor(0xFF0000);
                return await interaction.followUp({ embeds: [errorEmbed] });
            }

            // Check if there's already a game in this channel
            const existingGame = getUnoGame(channelId);
            if (existingGame) {
                if (existingGame.gameActive) {
                    // Show current game
                    const embed = existingGame.getGameEmbed();
                    const player = existingGame.players.get(userId);
                    if (player) {
                        const buttons = existingGame.createGameButtons(player);
                        await interaction.followUp({ embeds: [embed], components: buttons });
                    } else {
                        await interaction.followUp({ embeds: [embed] });
                    }
                    return;
                } else if (existingGame.waitingForPlayers) {
                    // Show existing lobby
                    const embed = existingGame.getLobbyEmbed();
                    const buttons = existingGame.createLobbyButtons();
                    await interaction.followUp({ embeds: [embed], components: buttons });
                    return;
                }
            }

            // Validate and deduct bet amount using PayoutManager
            const validation = await PayoutManager.validateAndDeductBet(
                interaction,
                betAmountStr,
                GameType.UNO,
                MIN_BET,
                MAX_BET
            );

            if (!validation.isValid) {
                return await interaction.followUp({ embeds: [validation.errorEmbed] });
            }

            // Create game session with enhanced protection
            const sessionResult = await sessionManager.createSession({
                userId,
                guildId,
                channelId,
                gameType: 'uno',
                betAmount,
                betPreDeducted: true,
                timeout: 300000, // 5 minutes for UNO
                metadata: {
                    gamePhase: 'lobby',
                    multiplayer: true,
                    waitingForPlayers: true,
                    maxPlayers: 8
                },
                interaction
            });

            // Create new game
            const game = startUnoGame(channelId, guildId, betAmount);
            const success = game.addPlayer(userId, `<@${userId}>`);

            if (!success) {
                // Handle game error with session cleanup and refund
                try {
                    const userSession = sessionManager.getUserActiveSession(userId);
                    if (userSession) {
                        await sessionManager.cancelSession(userSession.sessionId, 'UNO game creation error', true);
                    }
                } catch (sessionError) {
                    logger.error(`Failed to handle UNO session error: ${sessionError.message}`);
                }
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                return;
            }
            
            if (!sessionResult.success) {
                throw new Error(`Session creation failed: ${sessionResult.error}`);
            }

            // Store game channel and session ID
            game.gameChannel = interaction.channel;
            game.mainGameInteraction = interaction;
            game.sessionId = sessionResult.sessionId;

            // Show lobby with standardized template
            const lobbyEmbed = UITemplates.createStandardGameEmbed(
                'Multiplayer UNO Game',
                `**<@${userId}>** started a new UNO game!\n\n**Entry Fee:** ${fmt(betAmount)}\n**Prize Pool:** Grows with each player\n**Max Players:** ${game.maxPlayers}`,
                validation.newWallet,
                {
                    minBet: MIN_BET,
                    maxBet: MAX_BET,
                    wins: 0,
                    losses: 0,
                    gameSpecific: [
                        { name: '🎴 Current Players', value: `${game.players.size}/${game.maxPlayers}`, inline: true },
                        { name: '💰 Entry Fee', value: fmt(betAmount), inline: true },
                        { name: '🏆 Prize Pool', value: fmt(game.players.size * betAmount), inline: true }
                    ]
                }
            );

            const buttons = game.createLobbyButtons();
            await interaction.followUp({ embeds: [lobbyEmbed], components: buttons });

            // Log game creation
            logger.info(`UNO game created: ${username} (${userId}) bet ${betAmount} in channel ${channelId}`);
            
            await sendLogMessage(
                interaction.client,
                'info',
                `🎴 **UNO Game Created**\\n**Player:** ${username} (\`${userId}\`)\\n**Bet:** ${fmt(betAmount)}\\n**Channel:** <#${channelId}>`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error executing UNO command: ${error.message}`, { userId, error: error.stack });
            try {
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `UNO error for ${interaction.user.tag} (${userId}) — ${error.message}`,
                    userId,
                    guildId
                );
            } catch (_) {}
            
            // Handle game error with session cleanup and refund
            try {
                const userSession = sessionManager.getUserActiveSession(userId);
                if (userSession) {
                    await sessionManager.cancelSession(userSession.sessionId, 'UNO command error', true);
                }
            } catch (sessionError) {
                logger.error(`Failed to handle UNO session error: ${sessionError.message}`);
            }
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ UNO Error')
                .setDescription('An error occurred while starting UNO. Your bet has been refunded.')
                .setColor(0xFF0000)
                .setTimestamp();
                
            await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
        }
    },

    /**
     * Handle UNO button interactions
     */
    async handleButtonInteraction(interaction, action) {
        const channelId = interaction.channelId;
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        
        try {
            logger.debug(`UNO action '${action}' by ${userId} in guild ${guildId}`);
            const result = handleUnoAction(interaction, action);
            
            if (result && result.success) {
                switch (result.action) {
                    case 'show_join_confirmation':
                        await this.showJoinModal(interaction);
                        break;
                    case 'start_game':
                        await this.handleStartGame(interaction, channelId, guildId);
                        break;
                    case 'leave_game':
                        await this.handleLeaveGame(interaction, channelId, guildId);
                        break;
                    case 'show_hand':
                        await this.handleShowHand(interaction, channelId);
                        break;
                    case 'draw_card':
                        await this.handleDrawCard(interaction, channelId, guildId);
                        break;
                    case 'show_card_selection':
                        await this.handleShowCardSelection(interaction, channelId);
                        break;
                    case 'call_uno':
                        await this.handleCallUno(interaction, channelId, guildId);
                        break;
                    case 'show_game_status':
                        await this.handleShowGameStatus(interaction, channelId);
                        break;
                    case 'play_selected_card':
                        await this.handlePlayCard(interaction, channelId, guildId, result.cardIndex, result.chosenColor);
                        break;
                    case 'show_help':
                        const helpEmbed = UnoGameSession.getHelpEmbed();
                        await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
                        break;
                }
            } else {
                await interaction.reply({
                    content: `❌ ${result.error || 'Unknown error occurred'}`,
                    ephemeral: true
                });
            }
        } catch (error) {
            logger.error(`Error handling UNO button interaction: ${error.message}`, { userId, action });
            try {
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `UNO action error (${action}) for ${interaction.user.tag} (${userId}) — ${error.message}`,
                    userId,
                    guildId
                );
            } catch (_) {}
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An error occurred while processing your UNO action.',
                    ephemeral: true
                });
            }
        }
    },

    /**
     * Show join confirmation modal
     */
    async showJoinModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('uno_join_modal')
            .setTitle('Join UNO Game');

        const confirmInput = new TextInputBuilder()
            .setCustomId('confirm')
            .setLabel("Type 'JOIN' to confirm")
            .setStyle(TextInputStyle.Short)
            .setMinLength(4)
            .setMaxLength(4)
            .setPlaceholder('Type JOIN to join the game')
            .setRequired(true);

        const firstActionRow = new ActionRowBuilder().addComponents(confirmInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
    },

    /**
     * Handle join modal submission
     */
    async handleJoinModal(interaction) {
        const channelId = interaction.channelId;
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const username = interaction.user.displayName;
        
        try {
            const game = getUnoGame(channelId);
            if (!game) {
                await interaction.reply({
                    content: '❌ No UNO game found!',
                    ephemeral: true
                });
                return;
            }

            // Validate confirmation
            const confirmValue = interaction.fields.getTextInputValue('confirm');
            if (confirmValue.toUpperCase() !== 'JOIN') {
                const embed = game.getLobbyEmbed(`❌ **<@${userId}>** - You must type 'JOIN' to confirm!`);
                const buttons = game.createLobbyButtons();
                await interaction.update({ embeds: [embed], components: buttons });
                return;
            }

            // Check if already in game
            if (game.players.has(userId)) {
                const embed = game.getLobbyEmbed(`❌ **<@${userId}>** is already in this game!`);
                const buttons = game.createLobbyButtons();
                await interaction.update({ embeds: [embed], components: buttons });
                return;
            }

            // Check if game is active
            if (game.gameActive) {
                const embed = game.getLobbyEmbed(`❌ **<@${userId}>** cannot join while game is in progress!`);
                const buttons = game.createLobbyButtons();
                await interaction.update({ embeds: [embed], components: buttons });
                return;
            }

            // Check max players
            if (game.players.size >= game.maxPlayers) {
                const embed = game.getLobbyEmbed(`❌ **<@${userId}>** - Game is full! (${game.maxPlayers} players max)`);
                const buttons = game.createLobbyButtons();
                await interaction.update({ embeds: [embed], components: buttons });
                return;
            }

            // Validate and deduct bet amount using PayoutManager for joining player
            const joinValidation = await PayoutManager.validateAndDeductBet(
                interaction,
                game.starterBet.toString(),
                GameType.UNO,
                100, // MIN_BET
                150000 // MAX_BET
            );
            
            if (!joinValidation.isValid) {
                const embed = game.getLobbyEmbed(`❌ **<@${userId}>** - ${joinValidation.errorEmbed.data.description}`);
                const buttons = game.createLobbyButtons();
                await interaction.update({ embeds: [embed], components: buttons });
                return;
            }

            // Add player
            const success = game.addPlayer(userId, `<@${userId}>`);
            if (!success) {
                // Refund if couldn't add player using PayoutManager
                await PayoutManager.refundBet(userId, guildId, game.starterBet, 'Failed to join UNO game');
                const embed = game.getLobbyEmbed(`❌ **<@${userId}>** - Failed to join game!`);
                const buttons = game.createLobbyButtons();
                await interaction.update({ embeds: [embed], components: buttons });
                return;
            }

            // Success! Update main message with join notification
            const embed = game.getLobbyEmbed(`✅ **<@${userId}>** joined the UNO game!`);
            const buttons = game.createLobbyButtons();
            await interaction.update({ embeds: [embed], components: buttons });

        } catch (error) {
            logger.error(`Error handling join modal: ${error.message}`);
            await interaction.reply({
                content: '❌ An error occurred while joining the game.',
                ephemeral: true
            });
        }
    },

    /**
     * Handle start game
     */
    async handleStartGame(interaction, channelId, guildId) {
        try {
            const game = getUnoGame(channelId);
            if (!game || !game.canStartGame()) {
                await interaction.reply({
                    content: '❌ Need at least 2 players to start!',
                    ephemeral: true
                });
                return;
            }

            game.startGame();

            // Create game started embed with standardized template
            const playerPings = Array.from(game.players.keys()).map(id => `<@${id}>`).join(' ');
            const currentPlayer = game.getCurrentPlayer();
            
            const embed = UITemplates.createStandardGameEmbed(
                'UNO Game Started!',
                `${playerPings}\n\n**Current Player:** ${currentPlayer.username}\n**Top Card:** ${game.getTopCard().toString()}`,
                0, // No wallet display needed during active game
                {
                    minBet: 0,
                    maxBet: 0,
                    wins: 0,
                    losses: 0,
                    hideWalletInfo: true,
                    gameSpecific: [
                        { name: '🎮 Players', value: `${game.players.size}`, inline: true },
                        { name: '🏆 Prize Pool', value: fmt(game.players.size * game.starterBet), inline: true },
                        { name: '⏱️ Turn Timeout', value: `${game.turnTimeout}s`, inline: true }
                    ]
                }
            ).setColor(game.getColorCode(game.currentColor));

            // Show game buttons for all players
            const samplePlayer = Array.from(game.players.values())[0];
            const buttons = game.createGameButtons(samplePlayer);
            
            await interaction.update({ embeds: [embed], components: buttons });

            // Log game start
            await sendLogMessage(
                interaction.client,
                'info',
                `🎴 **UNO Game Started**\\n**Players:** ${game.players.size}\\n**Prize Pool:** ${fmt(game.players.size * game.starterBet)}\\n**Channel:** <#${channelId}>`,
                interaction.user.id,
                guildId
            );

        } catch (error) {
            logger.error(`Error starting UNO game: ${error.message}`);
            await interaction.reply({
                content: '❌ Failed to start the game.',
                ephemeral: true
            });
        }
    },

    /**
     * Handle leave game
     */
    async handleLeaveGame(interaction, channelId, guildId) {
        try {
            const game = getUnoGame(channelId);
            const userId = interaction.user.id;
            
            if (!game || !game.players.has(userId)) {
                await interaction.reply({
                    content: '❌ You\'re not in this game!',
                    ephemeral: true
                });
                return;
            }

            if (game.gameActive) {
                await interaction.reply({
                    content: '❌ You can\'t leave during an active game!',
                    ephemeral: true
                });
                return;
            }

            // Remove player and refund using PayoutManager
            await PayoutManager.refundBet(userId, guildId, game.starterBet, 'Left UNO game');

            game.removePlayer(userId);
            
            const embed = game.getLobbyEmbed(`👋 **<@${userId}>** left the game and was refunded!`);
            const buttons = game.createLobbyButtons();
            await interaction.update({ embeds: [embed], components: buttons });

        } catch (error) {
            logger.error(`Error handling leave game: ${error.message}`);
            await interaction.reply({
                content: '❌ Failed to process leaving the game.',
                ephemeral: true
            });
        }
    },

    /**
     * Handle show hand
     */
    async handleShowHand(interaction, channelId) {
        try {
            const game = getUnoGame(channelId);
            const userId = interaction.user.id;
            
            if (!game || !game.players.has(userId)) {
                await interaction.reply({
                    content: '❌ You\'re not in this game!',
                    ephemeral: true
                });
                return;
            }

            const player = game.players.get(userId);
            const { embed, handImage } = await game.getPlayerHandEmbed(player);
            
            const messageData = { embeds: [embed], ephemeral: true };
            
            // Add image attachment if available
            if (handImage) {
                const { AttachmentBuilder } = require('discord.js');
                const attachment = new AttachmentBuilder(handImage, { name: 'hand.png' });
                messageData.files = [attachment];
            }
            
            await interaction.reply(messageData);

        } catch (error) {
            logger.error(`Error showing hand: ${error.message}`);
            await interaction.reply({
                content: '❌ Error showing your hand!',
                ephemeral: true
            });
        }
    },

    /**
     * Handle draw card
     */
    async handleDrawCard(interaction, channelId, guildId) {
        try {
            const game = getUnoGame(channelId);
            const userId = interaction.user.id;
            
            if (!game || !game.players.has(userId)) {
                await interaction.reply({
                    content: '❌ You\'re not in this game!',
                    ephemeral: true
                });
                return;
            }

            const player = game.players.get(userId);
            
            // Check if it's this player's turn
            const currentPlayer = game.getCurrentPlayer();
            if (currentPlayer.userId !== userId) {
                await interaction.reply({
                    content: `❌ It's not your turn! It's ${currentPlayer.username}'s turn.`,
                    ephemeral: true
                });
                return;
            }
            
            // Handle draw stack first
            if (game.drawStack > 0 && game.mustHandleDrawStack) {
                const cardsDrawn = game.drawStack;
                game.handleDrawStack();
                await interaction.reply({
                    content: `📚 You drew ${cardsDrawn} cards due to action cards!`,
                    ephemeral: true
                });
            } else {
                // Regular draw
                game.drawCard(player, 1);
                game.nextTurn();
                
                await interaction.reply({
                    content: '📚 You drew a card and ended your turn.',
                    ephemeral: true
                });
            }

            // Update game display
            await this.updateGameDisplay(interaction, channelId, guildId);

        } catch (error) {
            logger.error(`Error handling draw card: ${error.message}`);
            await interaction.reply({
                content: '❌ Error drawing card!',
                ephemeral: true
            });
        }
    },

    /**
     * Handle show card selection
     */
    async handleShowCardSelection(interaction, channelId) {
        try {
            const game = getUnoGame(channelId);
            const userId = interaction.user.id;
            
            if (!game || !game.players.has(userId)) {
                await interaction.reply({
                    content: '❌ You\'re not in this game!',
                    ephemeral: true
                });
                return;
            }

            const player = game.players.get(userId);
            
            // Check if it's this player's turn
            const currentPlayer = game.getCurrentPlayer();
            if (currentPlayer.userId !== userId) {
                await interaction.reply({
                    content: `❌ It's not your turn! It's ${currentPlayer.username}'s turn.`,
                    ephemeral: true
                });
                return;
            }
            const topCard = game.getTopCard();
            const playableCards = player.getPlayableCards(topCard, game.currentColor, game.drawStack, game.mustHandleDrawStack);

            if (playableCards.length === 0) {
                await interaction.reply({
                    content: '❌ You have no playable cards! Draw a card first.',
                    ephemeral: true
                });
                return;
            }

            // Create select menu for playable cards
            const options = playableCards.slice(0, 25).map(({ card, index }) => ({
                label: card.toString(),
                description: `Play ${card.toString()}`,
                value: `${index}`,
                emoji: this.getCardEmoji(card)
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`uno_card_select_${channelId}`)
                .setPlaceholder('Choose a card to play...')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const embed = new EmbedBuilder()
                .setTitle('🎴 Select Card to Play')
                .setDescription(`**Top Card:** ${topCard.toString()}\n**Current Color:** ${game.currentColor || topCard.color}`)
                .setColor(game.getColorCode(game.currentColor))
                .addFields({
                    name: '✅ Your Playable Cards',
                    value: playableCards.map(({ card, index }) => `${index + 1}. ${card.toString()}`).join('\n'),
                    inline: false
                });

            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

        } catch (error) {
            logger.error(`Error showing card selection: ${error.message}`);
            await interaction.reply({
                content: '❌ Error showing card selection!',
                ephemeral: true
            });
        }
    },

    /**
     * Handle card selection from select menu
     */
    async handleCardSelection(interaction, cardIndex) {
        const channelId = interaction.channelId;
        const guildId = await getGuildId(interaction);
        
        try {
            const game = getUnoGame(channelId);
            const userId = interaction.user.id;
            const player = game.players.get(userId);
            
            if (!game || !player) {
                await interaction.reply({
                    content: '❌ You\'re not in this game!',
                    ephemeral: true
                });
                return;
            }

            const cardIndexNum = parseInt(cardIndex);
            const card = player.hand[cardIndexNum];
            
            if (!card) {
                await interaction.reply({
                    content: '❌ Invalid card selection!',
                    ephemeral: true
                });
                return;
            }

            // Check if it's a wild card that needs color selection
            if (card.type === 'wild') {
                await this.showColorSelection(interaction, channelId, cardIndexNum);
                return;
            }

            // Play the card
            const success = game.playCard(player, cardIndexNum);
            
            if (success) {
                await interaction.update({
                    content: `✅ You played ${card.toString()}!`,
                    embeds: [],
                    components: []
                });

                // Check for game end
                if (game.gameEnded) {
                    await this.handleGameEnd(interaction, channelId, guildId);
                } else {
                    await this.updateGameDisplay(interaction, channelId, guildId);
                }
            } else {
                await interaction.reply({
                    content: '❌ Cannot play that card!',
                    ephemeral: true
                });
            }

        } catch (error) {
            logger.error(`Error handling card selection: ${error.message}`);
            await interaction.reply({
                content: '❌ Error playing card!',
                ephemeral: true
            });
        }
    },

    /**
     * Show color selection for wild cards
     */
    async showColorSelection(interaction, channelId, cardIndex) {
        const colorOptions = UNO_COLORS.map(color => ({
            label: color,
            description: `Choose ${color}`,
            value: color,
            emoji: this.getColorEmoji(color)
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`uno_color_select_${channelId}_${cardIndex}`)
            .setPlaceholder('Choose a color...')
            .addOptions(colorOptions);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const embed = new EmbedBuilder()
            .setTitle('🎨 Choose Color for Wild Card')
            .setDescription('Select the color you want to change to:')
            .setColor(0x800080);

        await interaction.update({ embeds: [embed], components: [row] });
    },

    /**
     * Handle color selection for wild cards
     */
    async handleColorSelection(interaction, cardIndex, chosenColor) {
        const channelId = interaction.channelId;
        const guildId = await getGuildId(interaction);
        
        try {
            const game = getUnoGame(channelId);
            const userId = interaction.user.id;
            const player = game.players.get(userId);
            
            const cardIndexNum = parseInt(cardIndex);
            const card = player.hand[cardIndexNum];

            // Play the wild card with chosen color
            const success = game.playCard(player, cardIndexNum, chosenColor);
            
            if (success) {
                await interaction.update({
                    content: `✅ You played ${card.toString()} and changed color to ${chosenColor}!`,
                    embeds: [],
                    components: []
                });

                // Check for game end
                if (game.gameEnded) {
                    await this.handleGameEnd(interaction, channelId, guildId);
                } else {
                    await this.updateGameDisplay(interaction, channelId, guildId);
                }
            } else {
                await interaction.reply({
                    content: '❌ Cannot play that card!',
                    ephemeral: true
                });
            }

        } catch (error) {
            logger.error(`Error handling color selection: ${error.message}`);
            await interaction.reply({
                content: '❌ Error playing wild card!',
                ephemeral: true
            });
        }
    },

    /**
     * Handle call UNO
     */
    async handleCallUno(interaction, channelId, guildId) {
        try {
            const game = getUnoGame(channelId);
            const userId = interaction.user.id;
            
            if (!game || !game.players.has(userId)) {
                await interaction.reply({
                    content: '❌ You\'re not in this game!',
                    ephemeral: true
                });
                return;
            }
            
            const player = game.players.get(userId);
            
            const success = game.callUno(player);
            
            if (success) {
                const unoReply = await interaction.reply({
                    content: '🔥 **UNO!** You called UNO!',
                    ephemeral: false
                });

                // Notify other players
                let channelMessage = null;
                if (game.gameChannel) {
                    channelMessage = await game.gameChannel.send(`🔥 **${player.username}** called UNO!`);
                }
                
                // Delete UNO messages after 5 seconds
                setTimeout(() => {
                    if (unoReply && unoReply.deletable) {
                        unoReply.delete().catch(err => {
                            console.error('Error deleting UNO reply:', err.message);
                        });
                    }
                    if (channelMessage && channelMessage.deletable) {
                        channelMessage.delete().catch(err => {
                            console.error('Error deleting UNO channel message:', err.message);
                        });
                    }
                }, 5000);
            } else {
                await interaction.reply({
                    content: '❌ Cannot call UNO right now!',
                    ephemeral: true
                });
            }

        } catch (error) {
            logger.error(`Error handling call UNO: ${error.message}`);
            await interaction.reply({
                content: '❌ Error calling UNO!',
                ephemeral: true
            });
        }
    },

    /**
     * Handle show game status
     */
    async handleShowGameStatus(interaction, channelId) {
        try {
            const game = getUnoGame(channelId);
            
            if (!game) {
                await interaction.reply({
                    content: '❌ No UNO game found!',
                    ephemeral: true
                });
                return;
            }

            const { embed, topCardImage } = await game.getGameEmbed();
            
            const messageData = { embeds: [embed], ephemeral: true };
            
            // Add image attachment if available
            if (topCardImage) {
                const { AttachmentBuilder } = require('discord.js');
                const attachment = new AttachmentBuilder(topCardImage, { name: 'topcard.png' });
                messageData.files = [attachment];
            }
            
            await interaction.reply(messageData);

        } catch (error) {
            logger.error(`Error showing game status: ${error.message}`);
            await interaction.reply({
                content: '❌ Error showing game status!',
                ephemeral: true
            });
        }
    },

    /**
     * Update game display in main channel
     */
    async updateGameDisplay(interaction, channelId, guildId) {
        try {
            const game = getUnoGame(channelId);
            if (!game || !game.gameChannel || !game.mainGameInteraction) return;

            const { embed, topCardImage } = await game.getGameEmbed();
            const samplePlayer = Array.from(game.players.values())[0];
            const buttons = game.createGameButtons(samplePlayer);

            const messageData = { embeds: [embed], components: buttons };
            
            // Add image attachment if available
            if (topCardImage) {
                const { AttachmentBuilder } = require('discord.js');
                const attachment = new AttachmentBuilder(topCardImage, { name: 'topcard.png' });
                messageData.files = [attachment];
            }

            try {
                await game.mainGameInteraction.editReply(messageData);
            } catch (editError) {
                // If we can't edit the original message, send a new one
                await game.gameChannel.send(messageData);
            }

        } catch (error) {
            logger.error(`Error updating game display: ${error.message}`);
        }
    },

    /**
     * Handle game end
     */
    async handleGameEnd(interaction, channelId, guildId) {
        try {
            const game = getUnoGame(channelId);
            if (!game || !game.winner) return;

            // Process payouts
            const totalPot = game.players.size * game.starterBet;
            
            // Give prize to winner
            await dbManager.updateUserBalance(game.winner.userId, guildId, totalPot, 0);

            // Record game results and add XP
            for (const player of game.players.values()) {
                const won = player.userId === game.winner.userId;
                await dbManager.recordGameResult(
                    player.userId, 
                    guildId, 
                    'uno', 
                    won, 
                    game.starterBet, 
                    won ? totalPot - game.starterBet : -game.starterBet
                );
                
                // Add XP for game completion
                const xpResult = await levelingSystem.handleGameComplete(player.userId, guildId, 'uno', won);
                
                // Check for level up
                if (xpResult && xpResult.leveledUp) {
                    try {
                        const levelUpChannel = interaction.client.channels.cache.get('1411018763008217208');
                        if (levelUpChannel) {
                            const levelUpEmbed = levelingSystem.createLevelUpEmbed(
                                await interaction.client.users.fetch(player.userId), 
                                xpResult.newLevel
                            );
                            await levelUpChannel.send({ 
                                content: `<@${player.userId}>, you are now level ${xpResult.newLevel}!`,
                                embeds: [levelUpEmbed] 
                            });
                        }
                    } catch (levelError) {
                        logger.error(`Failed to send level up notification: ${levelError.message}`);
                    }
                }
            }

            // Create winner announcement
            const embed = new EmbedBuilder()
                .setTitle('🏆 UNO Game Complete!')
                .setDescription(`**${game.winner.username}** wins the game!`)
                .setColor(0xFFD700)
                .addFields({
                    name: '💰 Prize',
                    value: `${fmt(totalPot)} (${game.winner.points || 0} points earned)`,
                    inline: true
                }, {
                    name: '📊 Final Stats',
                    value: `Players: ${game.players.size}\nGame Duration: ${Math.round((Date.now() - game.gameStartTime) / 1000 / 60)} minutes`,
                    inline: true
                });

            await game.gameChannel.send({ embeds: [embed] });

            // Update main game message
            if (game.mainGameInteraction) {
                try {
                    await game.mainGameInteraction.editReply({ embeds: [embed], components: [] });
                } catch (editError) {
                    // Message might be too old to edit
                }
            }

            // Log game completion
            await sendLogMessage(
                interaction.client,
                'success',
                `🎴 **UNO Game Completed**\\n**Winner:** ${game.winner.username} (\`${game.winner.userId}\`)\\n**Prize:** ${fmt(totalPot)}\\n**Players:** ${game.players.size}\\n**Channel:** <#${channelId}>`,
                game.winner.userId,
                guildId
            );

            // Complete session if game has one
            if (game.sessionId) {
                await sessionManager.endSession(game.sessionId, {
                    outcome: 'COMPLETED',
                    payout: totalPot,
                    won: true,
                    winnerId: game.winner.userId,
                    totalPlayers: game.players.size
                });
            }

            // Clean up
            endUnoGame(channelId);

        } catch (error) {
            logger.error(`Error handling game end: ${error.message}`);
        }
    },

    /**
     * Get card emoji based on card type
     */
    getCardEmoji(card) {
        if (card.type === 'wild') return '🃏';
        if (card.type === 'action') return '⚡';
        
        const colorEmojis = {
            'Red': '🔴',
            'Blue': '🔵', 
            'Green': '🟢',
            'Yellow': '🟡'
        };
        
        return colorEmojis[card.color] || '🎴';
    },

    /**
     * Get color emoji
     */
    getColorEmoji(color) {
        const emojis = {
            'Red': '🔴',
            'Blue': '🔵',
            'Green': '🟢', 
            'Yellow': '🟡'
        };
        return emojis[color] || '🎴';
    },

    /**
     * Get help embed
     */
    getHelpEmbed() {
        return UnoGameSession.getHelpEmbed();
    }
};
