/**
 * Bingo command handler for ATIVE Casino Bot
 * Handles multiplayer BINGO games with automatic number calling
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage, parseAmount } = require('../UTILS/common');
const { 
    BingoGameSession,
    BingoInteractiveCardView,
    startBingoGame,
    getBingoGame,
    endBingoGame,
    handleBingoAction
} = require('../GAMES/bingo');
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

            // Ensure user exists
            await dbManager.ensureUser(userId, username);
            
            const balance = await dbManager.getUserBalance(userId, guildId);
            
            // Parse bet amount
            const amountStr = interaction.options.getString('amount');
            let betAmount;
            
            try {
                betAmount = parseAmount(amountStr, balance.wallet);
            } catch (error) {
                await interaction.followUp({
                    content: `❌ Invalid bet amount: ${error.message}`,
                    ephemeral: true
                });
                return;
            }

            // Validate bet amount
            const MIN_BET = 50;
            const MAX_BET = 10000;
            
            if (betAmount < MIN_BET) {
                await interaction.followUp({
                    content: `❌ Minimum bet for BINGO is ${fmt(MIN_BET)}!`,
                    ephemeral: true
                });
                return;
            }
            
            if (betAmount > MAX_BET) {
                await interaction.followUp({
                    content: `❌ Maximum bet for BINGO is ${fmt(MAX_BET)}!`,
                    ephemeral: true
                });
                return;
            }

            if (betAmount > balance.wallet) {
                await interaction.followUp({
                    content: `❌ You need ${fmt(betAmount)} but only have ${fmt(balance.wallet)}!`,
                    ephemeral: true
                });
                return;
            }

            // Deduct bet from starter
            await dbManager.updateUserBalance(userId, guildId, {
                wallet: balance.wallet - betAmount
            });

            // Create new game
            const game = startBingoGame(channelId, guildId, betAmount);
            const success = game.addPlayer(userId, `<@${userId}>`);

            if (!success) {
                // Refund if couldn't create game
                await dbManager.updateUserBalance(userId, guildId, {
                    wallet: balance.wallet
                });
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
            await dbManager.updateUserBalance(userId, guildId, {
                wallet: balance.wallet - game.starterBet
            });

            // Add player
            const success = game.addPlayer(userId, `<@${userId}>`);
            if (!success) {
                // Refund if couldn't add player
                await dbManager.updateUserBalance(userId, guildId, {
                    wallet: balance.wallet
                });
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

            // Remove player and refund
            await dbManager.updateUserBalance(userId, guildId, {
                wallet: (await dbManager.getUserBalance(userId, guildId)).wallet + game.starterBet
            });

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
            
            const embed = new EmbedBuilder()
                .setTitle('🎯 Your BINGO Card')
                .setDescription(player.card.getCardDisplay())
                .setColor(0x0000FF);

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

            // Store interaction for auto-updates
            game.playerInteractions.set(userId, interaction);
            
            await interaction.reply({ embeds: [embed], ephemeral: true });

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

            const embed = new EmbedBuilder()
                .setTitle('📊 BINGO Game Status')
                .setColor(0x0000FF);

            if (game.currentNumber) {
                const column = game.getNumberColumn(game.currentNumber);
                embed.addFields({
                    name: '📢 Current Number',
                    value: `**${column}-${game.currentNumber}**`,
                    inline: true
                });
            }

            embed.addFields({
                name: '🎮 Game Progress',
                value: `Numbers Called: ${game.calledNumbers.length}/75\nActive Players: ${Array.from(game.players.values()).filter(p => !p.hasBingo).length}`,
                inline: true
            });

            if (game.winners.length > 0) {
                const winnerNames = game.winners.map(w => w.username);
                embed.addFields({
                    name: '🏆 Winners',
                    value: winnerNames.join(', '),
                    inline: false
                });
            }

            // Show called numbers by column
            if (game.calledNumbers.length > 0) {
                const calledByColumn = { 'B': [], 'I': [], 'N': [], 'G': [], 'O': [] };
                for (const num of game.calledNumbers) {
                    const column = game.getNumberColumn(num);
                    calledByColumn[column].push(num.toString());
                }

                const columnDisplay = [];
                for (const letter of ['B', 'I', 'N', 'G', 'O']) {
                    if (calledByColumn[letter].length > 0) {
                        const numbers = calledByColumn[letter].join(', ');
                        columnDisplay.push(`**${letter}**: ${numbers}`);
                    } else {
                        columnDisplay.push(`**${letter}**: (none)`);
                    }
                }

                embed.addFields({
                    name: '📋 All Called Numbers by Column',
                    value: columnDisplay.join('\n'),
                    inline: false
                });
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });

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