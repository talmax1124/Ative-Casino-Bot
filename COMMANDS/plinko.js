/**
 * Plinko command handler for ATIVE Casino Bot
 * Handles Plinko game with multiple difficulty modes
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage, parseAmount } = require('../UTILS/common');
const { 
    PlinkoGameSession,
    startPlinkoGame,
    getPlinkoGame,
    endPlinkoGame,
    handlePlinkoAction
} = require('../GAMES/plinko');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('plinko')
        .setDescription('🎯 Play Plinko - Drop a ball and watch it bounce!')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Bet amount')
                .setRequired(true)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const channelId = interaction.channelId;
        const guildId = await getGuildId(interaction);
        const username = interaction.user.displayName;

        try {
            // Check if there's already an active Plinko game in this channel
            const existingGame = getPlinkoGame(channelId);
            if (existingGame) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Game Already Active')
                    .setDescription(`There's already an active Plinko game in this channel!\n\n**Player:** ${existingGame.username}`)
                    .setColor(0xFF0000);

                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Ensure user exists and check for active games
            await dbManager.ensureUser(userId, username);
            
            const balance = await dbManager.getUserBalance(userId, guildId);
            if (balance.game_active) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Game Already Active')
                    .setDescription('You already have an active game session! Finish your current game first.')
                    .setColor(0xFF0000);
                
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Parse bet amount
            const amountStr = interaction.options.getString('amount');
            let betAmount;
            
            try {
                betAmount = parseAmount(amountStr, balance.wallet);
            } catch (error) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Invalid Amount')
                    .setDescription(`Invalid amount format: ${error.message}`)
                    .setColor(0xFF0000);
                
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Validate bet amount
            const MIN_BET = 50;
            if (betAmount < MIN_BET) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Minimum Bet Required')
                    .setDescription(`Minimum bet for Plinko is ${fmt(MIN_BET)}!`)
                    .setColor(0xFF0000);
                
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            if (betAmount > balance.wallet) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Insufficient Funds')
                    .setDescription(`You only have ${fmt(balance.wallet)} in your wallet!\n\nUse \`/balance\` to check your funds.`)
                    .setColor(0xFF0000);
                
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Deduct bet from player's wallet and set game as active
            const newWalletBalance = balance.wallet - betAmount;
            
            await dbManager.updateUserBalance(userId, guildId, {
                wallet: newWalletBalance,
                game_active: true
            });

            // Create Plinko game
            const plinkoGame = startPlinkoGame(userId, username, betAmount, channelId);

            // Show mode selection
            const modeEmbed = plinkoGame.getModeSelectionEmbed();
            const modeButtons = plinkoGame.createModeSelectionButtons();

            // Send initial message
            await interaction.reply({
                embeds: [modeEmbed],
                components: modeButtons
            });

            // Log game start
            logger.info(`Plinko game started: ${username} (${userId}) bet ${betAmount} in channel ${channelId}`);
            
            await sendLogMessage(
                interaction.client,
                'info',
                `🎯 **Plinko Game Started**\\n**Player:** ${username} (\`${userId}\`)\\n**Bet:** ${fmt(betAmount)}\\n**Channel:** <#${channelId}>`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error executing Plinko command: ${error.message}`, { userId, error: error.stack });
            
            const embed = new EmbedBuilder()
                .setTitle('❌ Command Error')
                .setDescription('An error occurred while starting the Plinko game. Please try again.')
                .setColor(0xFF0000);
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        }
    },

    /**
     * Handle Plinko button interactions
     */
    async handleButtonInteraction(interaction, action, value) {
        const channelId = interaction.channelId;
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        
        try {
            const result = await handlePlinkoAction(interaction, action, value);
            
            if (result && result.success) {
                switch (result.action) {
                    case 'mode_selected':
                        await this.handleModeSelection(interaction, channelId);
                        break;
                    case 'ball_dropped':
                        await this.handleBallDrop(interaction, channelId, guildId, result.result);
                        break;
                }
            } else {
                await interaction.reply({
                    content: `❌ ${result.error || 'Unknown error occurred'}`,
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (error) {
            logger.error(`Error handling Plinko button interaction: ${error.message}`, { userId, action, value });
            
            if (!interaction.replied) {
                await interaction.reply({
                    content: '❌ An error occurred while processing your Plinko action.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    },

    /**
     * Handle mode selection
     */
    async handleModeSelection(interaction, channelId) {
        try {
            const game = getPlinkoGame(channelId);
            if (!game) return;

            const dropEmbed = game.getDropSelectionEmbed();
            const dropButtons = game.createDropPositionButtons();

            await interaction.update({
                embeds: [dropEmbed],
                components: dropButtons
            });
        } catch (error) {
            logger.error(`Error handling mode selection: ${error.message}`);
        }
    },

    /**
     * Handle ball drop and game completion
     */
    async handleBallDrop(interaction, channelId, guildId, result) {
        try {
            const game = getPlinkoGame(channelId);
            if (!game) return;

            // Update interaction immediately
            await interaction.update({
                embeds: [game.getDropSelectionEmbed()],
                components: []
            });

            // Show ball dropping animation
            const dropEmbed = new EmbedBuilder()
                .setTitle('🎯 Plinko - Ball Dropping!')
                .setDescription('🔴 The ball is bouncing down the board...')
                .setColor(0xFFFF00);

            await interaction.editReply({ embeds: [dropEmbed] });
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Show result
            const resultEmbed = game.getResultEmbed(result);
            await interaction.editReply({ embeds: [resultEmbed], components: [] });

            // Process payout and update database
            await this.processGameResult(interaction, channelId, guildId, result);

        } catch (error) {
            logger.error(`Error handling ball drop: ${error.message}`);
        }
    },

    /**
     * Process game result and update database
     */
    async processGameResult(interaction, channelId, guildId, result) {
        try {
            const game = getPlinkoGame(channelId);
            if (!game) return;

            // Clear game active status
            await dbManager.updateUserBalance(game.userId, guildId, { game_active: false });

            // Process winnings
            if (result.winnings > 0) {
                await dbManager.updateUserBalance(game.userId, guildId, {
                    wallet: (await dbManager.getUserBalance(game.userId, guildId)).wallet + result.winnings
                });
            }

            // Record game result
            const gameWon = result.profit > 0;
            await dbManager.recordGameResult(game.userId, guildId, 'plinko', gameWon, game.betAmount, result.winnings, {
                mode: game.mode,
                dropPosition: game.dropPosition,
                finalSlot: result.finalSlot + 1,
                multiplier: result.multiplier,
                profit: result.profit
            });

            // Log game completion
            const logMessage = `🎯 **Plinko Game Completed**\\n` +
                             `**Player:** ${game.username} (\`${game.userId}\`)\\n` +
                             `**Mode:** ${game.modes[game.mode].name}\\n` +
                             `**Drop Position:** ${game.dropPosition}\\n` +
                             `**Final Slot:** ${result.finalSlot + 1}\\n` +
                             `**Multiplier:** ${result.multiplier}x\\n` +
                             `**Bet:** ${fmt(game.betAmount)}\\n` +
                             `**Winnings:** ${fmt(result.winnings)}\\n` +
                             `**Profit:** ${result.profit >= 0 ? '+' : ''}${fmt(result.profit)}\\n` +
                             `**Channel:** <#${channelId}>`;

            await sendLogMessage(
                interaction.client,
                gameWon ? 'success' : 'info',
                logMessage,
                game.userId,
                guildId
            );

            logger.info(`Plinko game completed in channel ${channelId}: ${game.username} ${gameWon ? 'won' : 'lost'} ${Math.abs(result.profit)} chips`);

            // Remove game from active games
            endPlinkoGame(channelId);

        } catch (error) {
            logger.error(`Error processing Plinko game result: ${error.message}`, error);
            
            // Ensure game is removed even if there was an error
            endPlinkoGame(channelId);
            
            // Try to clear game active status
            try {
                const game = getPlinkoGame(channelId);
                if (game) {
                    await dbManager.updateUserBalance(game.userId, guildId, { game_active: false });
                }
            } catch (dbError) {
                logger.error(`Failed to clear game_active status: ${dbError.message}`);
            }
        }
    },

    /**
     * Get help embed
     */
    getHelpEmbed() {
        return PlinkoGameSession.getHelpEmbed();
    }
};