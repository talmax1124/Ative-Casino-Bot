/**
 * Fishing command handler for ATIVE Casino Bot
 * Integrates with the fishing game module and handles Discord slash commands
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage, parseAmount } = require('../UTILS/common');
const { 
    FishingGame, 
    startFishingGame, 
    getFishingGame, 
    endFishingGame, 
    handleFishingAction 
} = require('../GAMES/fishing');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fishing')
        .setDescription('🎣 Go fishing! Catch fish with multipliers, but beware the red fish!')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Bet amount (use K/M/B suffixes, "all", "half")')
                .setRequired(true)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const username = interaction.user.displayName;
        
        try {
            // Ensure user exists in database
            await dbManager.ensureUser(userId, username);
            
            // Check if user already has an active game
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
            if (betAmount <= 0) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Invalid Bet')
                    .setDescription('Bet must be greater than $0!')
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

            // Deduct bet from wallet and set game as active
            const newWalletBalance = balance.wallet - betAmount;
            
            await dbManager.updateUserBalance(userId, guildId, {
                wallet: newWalletBalance,
                game_active: true
            });

            // Create fishing game
            const fishingGame = startFishingGame(userId, username, betAmount, newWalletBalance);

            // Create initial embed and buttons
            const initialEmbed = fishingGame.getInitialEmbed(balance.bank);
            const buttons = fishingGame.createButtons();

            // Send initial message
            await interaction.reply({
                embeds: [initialEmbed],
                components: [buttons]
            });

            // Log game start
            logger.info(`Fishing game started: ${username} (${userId}) bet ${betAmount}`);
            
            await sendLogMessage(
                interaction.client,
                'info',
                `🎣 **Fishing Game Started**\n**Player:** ${username} (\`${userId}\`)\n**Bet:** ${fmt(betAmount)}\n**Remaining Wallet:** ${fmt(newWalletBalance)}`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error executing fishing command: ${error.message}`, { userId, error: error.stack });
            
            const embed = new EmbedBuilder()
                .setTitle('❌ Command Error')
                .setDescription('An error occurred while starting the fishing game. Please try again.')
                .setColor(0xFF0000);
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        }
    },

    /**
     * Handle fishing button interactions
     */
    async handleButtonInteraction(interaction, action) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        
        try {
            const result = await handleFishingAction(interaction, action);
            
            // If game ended, handle cleanup
            if (result && result.gameEnded) {
                await this.endFishingSession(interaction, userId, guildId, result);
            }
        } catch (error) {
            logger.error(`Error handling fishing button interaction: ${error.message}`, { userId, action });
            
            if (!interaction.replied) {
                await interaction.reply({
                    content: '❌ An error occurred while processing your fishing action.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    },

    /**
     * End fishing session and update database
     */
    async endFishingSession(interaction, userId, guildId, result) {
        try {
            const game = getFishingGame(userId);
            if (!game) {
                logger.warn(`No fishing game found for user ${userId} during session end`);
                return;
            }

            // Calculate final amounts
            const finalWallet = game.walletAfter + game.currentWinnings;
            const netChange = game.currentWinnings - game.initialBet;
            const won = netChange >= 0;

            // Update database
            await dbManager.updateUserBalance(userId, guildId, {
                wallet: finalWallet,
                game_active: false
            });

            // Record game result for statistics
            try {
                await dbManager.recordGameResult(
                    userId, 
                    guildId, 
                    'fishing', 
                    won, 
                    game.initialBet, 
                    game.currentWinnings,
                    {
                        catches: game.totalCatches,
                        maxCatches: game.maxCatches,
                        fishCaught: game.fishCaught,
                        endReason: result.lostToRedFish ? 'red_fish' : 
                                  result.reachedLimit ? 'limit_reached' : 'voluntary_stop'
                    }
                );
            } catch (recordError) {
                logger.warn(`Failed to record fishing game result: ${recordError.message}`);
                // Don't throw - game should still complete
            }

            // Get updated balance for final embed
            const updatedBalance = await dbManager.getUserBalance(userId, guildId);
            
            // Create and send final embed
            const endType = result.lostToRedFish ? 'red' : 
                          result.reachedLimit ? 'limit' : 'stop';
            
            const finalEmbed = game.createFinalEmbed(updatedBalance.bank, endType);

            // Send final result (use followUp to avoid interaction conflicts)
            setTimeout(async () => {
                try {
                    await interaction.followUp({ embeds: [finalEmbed] });
                } catch (followUpError) {
                    logger.warn(`Failed to send fishing final embed: ${followUpError.message}`);
                }
            }, 1000);

            // Log game completion
            const logMessage = `🎣 **Fishing Game Completed**\n` +
                             `**Player:** ${game.username} (\`${userId}\`)\n` +
                             `**Initial Bet:** ${fmt(game.initialBet)}\n` +
                             `**Final Winnings:** ${fmt(game.currentWinnings)}\n` +
                             `**Net Change:** ${netChange >= 0 ? '+' : ''}${fmt(netChange)}\n` +
                             `**Total Catches:** ${game.totalCatches}/${game.maxCatches}\n` +
                             `**End Reason:** ${result.lostToRedFish ? 'Red Fish 💀' : 
                                                result.reachedLimit ? 'Limit Reached 🏁' : 'Voluntary Stop 🛑'}`;

            await sendLogMessage(
                interaction.client,
                won ? 'info' : 'warn',
                logMessage,
                userId,
                guildId
            );

            logger.info(`Fishing game completed: ${game.username} (${userId}) - ${won ? 'WIN' : 'LOSS'} ${fmt(netChange)}`);

            // Remove game from active games
            endFishingGame(userId);

        } catch (error) {
            logger.error(`Error ending fishing session: ${error.message}`, { userId, error: error.stack });
            
            // Ensure game is removed even if there was an error
            endFishingGame(userId);
            
            // Try to clear game active status
            try {
                await dbManager.updateUserBalance(userId, guildId, { game_active: false });
            } catch (dbError) {
                logger.error(`Failed to clear game_active status: ${dbError.message}`);
            }
        }
    },

    /**
     * Create help command embed
     */
    getHelpEmbed() {
        return FishingGame.getHelpEmbed();
    }
};