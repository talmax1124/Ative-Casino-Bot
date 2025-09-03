/**
 * Bingo command handler for ATIVE Casino Bot
 * Handles multiplayer BINGO games with automatic number calling
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { 
    BingoGameSession,
    BingoInteractiveCardView,
    startBingoGame,
    getBingoGame,
    endBingoGame,
    handleBingoAction
} = require('../GAMES/bingo');
const { createBingoCardImage, createGameStatusImage, getBingoColumn } = require('../UTILS/bingoImageGenerator');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const sessionManager = require('../UTILS/sessionManager');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bingo')
        .setDescription('🎯 Start a multiplayer BINGO game')
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
            // Check if there's already a game in this channel
            const existingGame = getBingoGame(channelId);
            if (existingGame) {
                if (existingGame.gameActive) {
                    // Show current game
                    const embed = existingGame.getGameEmbed();
                    const buttons = existingGame.createGameButtons();
                    await interaction.followUp({ embeds: [embed], components: buttons });
                    return;
                } else if (existingGame.waitingForPlayers) {
                    // Show existing lobby
                    const embed = existingGame.getLobbyEmbed();
                    const buttons = existingGame.createLobbyButtons();
                    await interaction.followUp({ embeds: [embed], components: buttons });
                    return;
                }
            }

            // User existence and balance validation handled by PayoutManager
            
            // Validate and deduct bet amount using PayoutManager
            const amountStr = interaction.options.getString('amount');
            const MIN_BET = 50;
            const MAX_BET = 10000;
            
            const validation = await PayoutManager.validateAndDeductBet(
                interaction,
                amountStr,
                GameType.BINGO,
                MIN_BET,
                150000
            );
            
            if (!validation.isValid) {
                await interaction.followUp({
                    embeds: [validation.errorEmbed],
                    ephemeral: true
                });
                return;
            }
            
            const betAmount = validation.parsedAmount;

            // Create game session
            const sessionResult = await GameSessionIntegrator.createGameSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: 'bingo',
                betAmount,
                timeout: 900000, // 15 minutes for Bingo
                metadata: {
                    gamePhase: 'lobby',
                    multiplayer: true
                },
                interaction
            });
            
            if (!sessionResult.success) {
                await PayoutManager.refundBet(userId, guildId, betAmount, 'Failed to create session');
                const embed = new EmbedBuilder()
                    .setTitle('❌ Session Error')
                    .setDescription(`Failed to create game session: ${sessionResult.error}`)
                    .setColor(0xFF0000);
                
                await interaction.followUp({ embeds: [embed], ephemeral: true });
                return;
            }

            // Create new game
            const game = startBingoGame(channelId, guildId, betAmount);
            game.sessionId = sessionResult.sessionId; // Store session ID
            const success = game.addPlayer(userId, `<@${userId}>`);

            if (!success) {
                // Complete session and refund if couldn't create game
                await GameSessionIntegrator.completeGameSession(sessionResult.sessionId, {
                    outcome: 'FAILED',
                    payout: 0,
                    won: false,
                    netChange: 0
                });
                await PayoutManager.refundBet(userId, guildId, betAmount, 'Failed to create BINGO game');
                await interaction.followUp({
                    content: '❌ Failed to create game!',
                    ephemeral: true
                });
                return;
            }

            // Show lobby
            const embed = game.getLobbyEmbed(`🎯 **<@${userId}>** started a BINGO game!`);
            const buttons = game.createLobbyButtons();

            await interaction.followUp({ embeds: [embed], components: buttons });

            // Log game creation
            logger.info(`BINGO game created: ${username} (${userId}) bet ${betAmount} in channel ${channelId}`);
            
            await sendLogMessage(
                interaction.client,
                'info',
                `🎯 **BINGO Game Created**\\n**Player:** ${username} (\`${userId}\`)\\n**Bet:** ${fmt(betAmount)}\\n**Channel:** <#${channelId}>`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error executing BINGO command: ${error.message}`, { userId, error: error.stack });
            
            await interaction.followUp({
                content: '❌ An error occurred while creating the BINGO game. Please try again.',
                ephemeral: true
            });
        }
    },

    /**
     * Handle BINGO button interactions
     */
    async handleButtonInteraction(interaction, action) {
        const channelId = interaction.channelId;
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        
        try {
            const result = handleBingoAction(interaction, action);
            
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
                    case 'show_card':
                        await this.handleShowCard(interaction, channelId);
                        break;
                    case 'show_interactive_card':
                        await this.handleShowInteractiveCard(interaction, channelId);
                        break;
                    case 'show_game_status':
                        await this.handleShowGameStatus(interaction, channelId);
                        break;
                    case 'handle_card_click':
                        await this.handleCardClick(interaction, channelId, result.row, result.col, result.number);
                        break;
                    case 'show_help':
                        const helpEmbed = BingoGameSession.getHelpEmbed();
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
            logger.error(`Error handling BINGO button interaction: ${error.message}`, { userId, action });
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An error occurred while processing your BINGO action.',
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
            .setCustomId('bingo_join_modal')
            .setTitle('Join BINGO Game');

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
            const game = getBingoGame(channelId);
            if (!game) {
                await interaction.reply({
                    content: '❌ No BINGO game found!',
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

            // Validate and deduct bet amount using PayoutManager for joining player
            const joinValidation = await PayoutManager.validateAndDeductBet(
                interaction,
                game.starterBet.toString(),
                GameType.BINGO,
                50, // MIN_BET
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
                await PayoutManager.refundBet(userId, guildId, game.starterBet, 'Failed to join BINGO game');
                const embed = game.getLobbyEmbed(`❌ **<@${userId}>** - Failed to join game (max players reached)!`);
                const buttons = game.createLobbyButtons();
                await interaction.update({ embeds: [embed], components: buttons });
                return;
            }

            // Success! Update main message with join notification
            const embed = game.getLobbyEmbed(`✅ **<@${userId}>** joined the BINGO game!`);
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
            const game = getBingoGame(channelId);
            if (!game || !game.canStartGame()) {
                await interaction.reply({
                    content: '❌ Need at least 2 players to start!',
                    ephemeral: true
                });
                return;
            }

            // Set up game channel for updates
            game.gameChannel = interaction.channel;
            game.mainGameInteraction = interaction;
            
            game.startGame();

            // Create game started embed
            const playerPings = Array.from(game.players.keys()).map(id => `<@${id}>`).join(' ');
            
            const embed = new EmbedBuilder()
                .setTitle('🎯 BINGO Game Started!')
                .setDescription(`The automatic BINGO caller will start in 3 seconds. Numbers will be called every 3 seconds.\n\n${playerPings} Get your cards ready!`)
                .setColor(0x00FF00);

            embed.addFields({
                name: '📊 Game Info',
                value: `Players: ${game.players.size}\nPrize Pool: ${fmt(game.players.size * game.starterBet)}\nBet Amount: ${fmt(game.starterBet)}`,
                inline: false
            });

            embed.addFields({
                name: '🎯 How to Follow Along',
                value: 'Click \'Interactive Card\' below to see your BINGO card. It will update automatically as numbers are called!',
                inline: false
            });

            // Create game view buttons
            const buttons = game.createGameButtons();
            
            await interaction.update({ embeds: [embed], components: buttons });

            // Log game start
            await sendLogMessage(
                interaction.client,
                'info',
                `🎯 **BINGO Game Started**\\n**Players:** ${game.players.size}\\n**Prize Pool:** ${fmt(game.players.size * game.starterBet)}\\n**Channel:** <#${channelId}>`,
                interaction.user.id,
                guildId
            );

        } catch (error) {
            logger.error(`Error starting BINGO game: ${error.message}`);
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
            const game = getBingoGame(channelId);
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
            await PayoutManager.refundBet(userId, guildId, game.starterBet, 'Left BINGO game');

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
     * Handle show card
     */
    async handleShowCard(interaction, channelId) {
        try {
            const game = getBingoGame(channelId);
            const userId = interaction.user.id;
            
            if (!game || !game.players.has(userId)) {
                await interaction.reply({
                    content: '❌ You\'re not in this game!',
                    ephemeral: true
                });
                return;
            }

            const player = game.players.get(userId);
            
            // Generate card image
            const cardImage = createBingoCardImage(
                player.card.card,
                player.card.marked,
                interaction.user.displayName,
                game.calledNumbers
            );
            
            const attachment = new AttachmentBuilder(cardImage, { name: `bingo_card_${userId}.png` });
            
            const topFields = [];
            
            // Add BINGO announcement if player won
            if (player.hasBingo) {
                topFields.push({
                    name: '🏆 BINGO WINNER!',
                    value: 'Congratulations! You have achieved BINGO!',
                    inline: false
                });
            }

            // Current number if available
            if (game.currentNumber) {
                const column = getBingoColumn(game.currentNumber);
                topFields.push({
                    name: '📢 LAST NUMBER CALLED',
                    value: `**${column}-${game.currentNumber}**`,
                    inline: false
                });
            }

            // Game stats in bankFields
            const bankFields = [
                { name: '📊 Numbers Called', value: `${game.calledNumbers.length}/75`, inline: true },
                { name: '👥 Total Players', value: game.players.size.toString(), inline: true },
                { name: '🎯 Your Status', value: player.hasBingo ? '🏆 WINNER' : '🎲 Playing', inline: true },
                { name: '🏆 Prize Pool', value: fmt(game.starterBet * game.players.size), inline: true },
                { name: '📈 Game Progress', value: `${Math.round((game.calledNumbers.length / 75) * 100)}%`, inline: true },
                { name: '🎲 Card Type', value: 'Personal BINGO Card', inline: true }
            ];

            const embed = buildSessionEmbed({
                title: `🎯 ${interaction.user.displayName}'s BINGO Card`,
                topFields,
                bankFields,
                stageText: player.hasBingo ? 'BINGO ACHIEVED' : 'PLAYING',
                color: player.hasBingo ? 0x27AE60 : 0x3498DB,
                footer: 'Your BINGO Card • Mark numbers as called • ATIVE Casino',
                imageUrl: `attachment://bingo_card_${userId}.png`
            });

            // Store interaction for auto-updates
            game.playerInteractions.set(userId, interaction);
            
            await interaction.reply({ embeds: [embed], files: [attachment], ephemeral: true });

        } catch (error) {
            logger.error(`Error showing card: ${error.message}`);
            await interaction.reply({
                content: '❌ Error creating your BINGO card!',
                ephemeral: true
            });
        }
    },

    /**
     * Handle show interactive card
     */
    async handleShowInteractiveCard(interaction, channelId) {
        try {
            const game = getBingoGame(channelId);
            const userId = interaction.user.id;
            
            if (!game || !game.players.has(userId)) {
                await interaction.reply({
                    content: '❌ You\'re not in this game!',
                    ephemeral: true
                });
                return;
            }

            const player = game.players.get(userId);
            
            // Create interactive card view
            const interactiveView = new BingoInteractiveCardView(game, player, interaction);
            
            const embed = new EmbedBuilder()
                .setTitle('🎮 Your Interactive BINGO Card')
                .setDescription('Click the number buttons below to mark them when called!')
                .setColor(0x00FF00);

            embed.addFields({
                name: '🎯 Your Card',
                value: player.card.getCardDisplay(),
                inline: false
            });

            if (game.currentNumber) {
                const column = game.getNumberColumn(game.currentNumber);
                embed.addFields({
                    name: '📢 Last Called',
                    value: `**${column}-${game.currentNumber}**`,
                    inline: true
                });
            }

            embed.addFields({
                name: '📊 Game Status',
                value: `Numbers Called: ${game.calledNumbers.length}/75\nPlayers: ${game.players.size}`,
                inline: true
            });

            if (player.hasBingo) {
                embed.addFields({
                    name: '🏆 BINGO!',
                    value: 'You have BINGO! Congratulations!',
                    inline: false
                });
            }

            embed.setFooter({ text: '💡 Only click numbers that have been called! Green buttons are marked.' });

            const buttons = interactiveView.createCardButtons();
            
            await interaction.reply({ embeds: [embed], components: buttons, ephemeral: true });

        } catch (error) {
            logger.error(`Error showing interactive card: ${error.message}`);
            await interaction.reply({
                content: '❌ Error creating your interactive BINGO card!',
                ephemeral: true
            });
        }
    },

    /**
     * Handle show game status
     */
    async handleShowGameStatus(interaction, channelId) {
        try {
            const game = getBingoGame(channelId);
            
            if (!game) {
                await interaction.reply({
                    content: '❌ No BINGO game found!',
                    ephemeral: true
                });
                return;
            }

            // Prepare game data for status image
            const gameData = {
                players: Array.from(game.players.values()).map(player => ({
                    name: player.username,
                    ready: !player.hasBingo
                })),
                calledNumbers: game.calledNumbers,
                currentNumber: game.currentNumber,
                gamePhase: game.gameActive ? 'active' : game.waitingForPlayers ? 'lobby' : 'finished'
            };

            // Generate game status image
            const statusImage = createGameStatusImage(gameData);
            const attachment = new AttachmentBuilder(statusImage, { name: 'bingo_status.png' });

            const topFields = [];

            // Current number if available
            if (game.currentNumber) {
                const column = getBingoColumn(game.currentNumber);
                topFields.push({
                    name: '📢 CURRENT NUMBER',
                    value: `**${column}-${game.currentNumber}**`,
                    inline: false
                });
            }

            // Winners announcement
            if (game.winners.length > 0) {
                const winnerNames = game.winners.map(w => w.username).join(', ');
                topFields.push({
                    name: '🏆 GAME WINNERS',
                    value: winnerNames,
                    inline: false
                });
            }

            // Game progress in bankFields
            const activePlayers = Array.from(game.players.values()).filter(p => !p.hasBingo).length;
            const totalPot = game.starterBet * game.players.size;
            
            const bankFields = [
                { name: '👥 Total Players', value: game.players.size.toString(), inline: true },
                { name: '🎲 Active Players', value: activePlayers.toString(), inline: true },
                { name: '📊 Numbers Called', value: `${game.calledNumbers.length}/75`, inline: true },
                { name: '🏆 Prize Pool', value: fmt(totalPot), inline: true },
                { name: '📈 Progress', value: `${Math.round((game.calledNumbers.length / 75) * 100)}%`, inline: true },
                { name: '🎯 Game Status', value: game.winners.length > 0 ? '🏆 COMPLETED' : '🔄 IN PROGRESS', inline: true }
            ];

            const embed = buildSessionEmbed({
                title: '📊 BINGO Game Status',
                topFields,
                bankFields,
                stageText: game.winners.length > 0 ? 'GAME COMPLETED' : 'GAME STATUS',
                color: game.winners.length > 0 ? 0x27AE60 : 0x3498DB,
                footer: 'Game Status • Real-time overview • ATIVE Casino',
                imageUrl: 'attachment://bingo_status.png'
            });

            await interaction.reply({ embeds: [embed], files: [attachment], ephemeral: true });

        } catch (error) {
            logger.error(`Error showing game status: ${error.message}`);
            await interaction.reply({
                content: '❌ Error creating game status!',
                ephemeral: true
            });
        }
    },

    /**
     * Handle card click
     */
    async handleCardClick(interaction, channelId, row, col, number) {
        try {
            const game = getBingoGame(channelId);
            const userId = interaction.user.id;
            
            if (!game || !game.players.has(userId)) {
                await interaction.reply({
                    content: '❌ You\'re not in this game!',
                    ephemeral: true
                });
                return;
            }

            const interactiveView = game.interactiveViews.get(userId);
            if (interactiveView) {
                await interactiveView.handleButtonClick(interaction, row, col, number);
            } else {
                await interaction.reply({
                    content: '❌ Interactive card not found!',
                    ephemeral: true
                });
            }

        } catch (error) {
            logger.error(`Error handling card click: ${error.message}`);
            await interaction.reply({
                content: '❌ Error processing your click!',
                ephemeral: true
            });
        }
    },

    /**
     * Get help embed
     */
    getHelpEmbed() {
        return BingoGameSession.getHelpEmbed();
    }
};