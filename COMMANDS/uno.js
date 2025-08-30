/**
 * UNO command handler for ATIVE Casino Bot
 * Handles multiplayer UNO games with betting system
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage, parseAmount, resolveAmount } = require('../UTILS/common');
const GameSessionIntegrator = require('../UTILS/gameSessionIntegrator');
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

        try {
            // Validate session before proceeding using modern session system
            const sessionValidation = await GameSessionIntegrator.validateGameSession(userId, 'uno', guildId);
            if (!sessionValidation.valid) {
                const errorEmbed = GameSessionIntegrator.createValidationErrorEmbed(username, 'uno', sessionValidation);
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

            // Ensure user exists
            await dbManager.ensureUser(userId, username);
            
            const balance = await dbManager.getUserBalance(userId, guildId);
            
            // Parse bet amount
            const amountStr = interaction.options.getString('amount');
            let betAmount;
            
            const parsedAmount = parseAmount(amountStr);
            if (parsedAmount === null) {
                const errorEmbed = UITemplates.createErrorEmbed('UNO', {
                    description: `"${amountStr}" is not a valid amount. Use numbers, K/M/B suffixes, "all", or "half".`,
                    isLoss: false
                });
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                return;
            }

            betAmount = resolveAmount(parsedAmount, balance.wallet);
            
            if (!betAmount || betAmount <= 0 || isNaN(betAmount)) {
                const errorEmbed = UITemplates.createErrorEmbed('UNO', {
                    description: 'Bet amount must be greater than 0!',
                    isLoss: false
                });
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                return;
            }

            // Validate bet amount
            const MIN_BET = 100;
            const MAX_BET = 50000;
            
            if (betAmount < MIN_BET) {
                const errorEmbed = UITemplates.createErrorEmbed('UNO', {
                    description: `Minimum bet for UNO is ${fmt(MIN_BET)}!`,
                    isLoss: false
                });
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                return;
            }
            
            if (betAmount > MAX_BET) {
                const errorEmbed = UITemplates.createErrorEmbed('UNO', {
                    description: `Maximum bet for UNO is ${fmt(MAX_BET)}!`,
                    isLoss: false
                });
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                return;
            }

            if (betAmount > balance.wallet) {
                const errorEmbed = UITemplates.createErrorEmbed('UNO', {
                    description: `You need ${fmt(betAmount)} but only have ${fmt(balance.wallet)} in your wallet.\n\nUse \`/withdraw\` to move money from your bank to your wallet.`,
                    showBalance: true,
                    userBalance: balance,
                    isLoss: false
                });
                await interaction.followUp({ embeds: [errorEmbed] });
                return;
            }

            // Deduct bet from starter
            await dbManager.updateUserBalance(userId, guildId, -betAmount, 0);

            // Create game session with enhanced protection
            const sessionResult = await GameSessionIntegrator.createGameSession({
                userId,
                guildId,
                channelId,
                gameType: 'uno',
                betAmount,
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
                await GameSessionIntegrator.handleGameError(userId, 'uno', betAmount, guildId, 'UNO game creation failed');
                
                const errorEmbed = UITemplates.createErrorEmbed('UNO', {
                    description: 'Failed to create the UNO game. Your bet has been refunded.',
                    isLoss: false
                });
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
                balance.wallet - betAmount,
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
            
            // Handle game error with session cleanup and refund
            await GameSessionIntegrator.handleGameError(userId, 'uno', 0, guildId, 'UNO game initialization error');
            
            const errorEmbed = UITemplates.createErrorEmbed('UNO', {
                description: 'An error occurred while creating the UNO game. Please try again.',
                error: error.message,
                isLoss: false
            });
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

            // Check balance
            await dbManager.ensureUser(userId, username);
            const balance = await dbManager.getUserBalance(userId, guildId);
            
            if (balance.wallet < game.starterBet) {
                const embed = game.getLobbyEmbed(`❌ **<@${userId}>** needs ${fmt(game.starterBet)} but only has ${fmt(balance.wallet)}!`);
                const buttons = game.createLobbyButtons();
                await interaction.update({ embeds: [embed], components: buttons });
                return;
            }

            // Deduct bet amount
            await dbManager.updateUserBalance(userId, guildId, -game.starterBet, 0);

            // Add player
            const success = game.addPlayer(userId, `<@${userId}>`);
            if (!success) {
                // Refund if couldn't add player
                await dbManager.updateUserBalance(userId, guildId, game.starterBet, 0);
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

            // Remove player and refund
            await dbManager.updateUserBalance(userId, guildId, game.starterBet, 0);

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
            const embed = game.getPlayerHandEmbed(player);
            
            await interaction.reply({ embeds: [embed], ephemeral: true });

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
            
            // Handle draw stack first
            if (game.drawStack > 0) {
                game.handleDrawStack();
                await interaction.reply({
                    content: `📚 You drew ${game.drawStack} cards due to action cards!`,
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
            const topCard = game.getTopCard();
            const playableCards = player.getPlayableCards(topCard, game.currentColor);

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
            const player = game.players.get(userId);
            
            const success = game.callUno(player);
            
            if (success) {
                await interaction.reply({
                    content: '🔥 **UNO!** You called UNO!',
                    ephemeral: false
                });

                // Notify other players
                if (game.gameChannel) {
                    await game.gameChannel.send(`🔥 **${player.username}** called UNO!`);
                }
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

            const embed = game.getGameEmbed();
            await interaction.reply({ embeds: [embed], ephemeral: true });

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

            const embed = game.getGameEmbed();
            const samplePlayer = Array.from(game.players.values())[0];
            const buttons = game.createGameButtons(samplePlayer);

            try {
                await game.mainGameInteraction.editReply({ embeds: [embed], components: buttons });
            } catch (editError) {
                // If we can't edit the original message, send a new one
                await game.gameChannel.send({ embeds: [embed], components: buttons });
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
                await GameSessionIntegrator.completeGameSession(game.sessionId, {
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