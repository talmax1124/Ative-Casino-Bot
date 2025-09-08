/**
 * Fishing command handler for ATIVE Casino Bot
 * Integrates with the fishing game module and handles Discord slash commands
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { 
    FishingGame, 
    startFishingGame, 
    getFishingGame, 
    endFishingGame, 
    handleFishingAction 
} = require('../GAMES/fishing');
const logger = require('../UTILS/logger');
const sessionManager = require('../UTILS/sessionManager');
const levelingSystem = require('../UTILS/levelingSystem');

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
            // Modern session validation (via sessionGuard)
            const sessionGuard = require('../UTILS/sessionGuard');
            const check = await sessionGuard.check(userId, guildId, 'fishing', interaction.client);
            if (!check.allowed) {
                // Additional cleanup: if user has fishing game in memory but no session, clean it up
                if (check.code === 'SESSION_EXISTS') {
                    const fishingGame = getFishingGame(userId);
                    if (fishingGame && !sessionManager.getUserActiveSession(userId)) {
                        logger.warn(`Cleaning up orphaned fishing game for user ${userId}`);
                        await endFishingGame(userId);
                        // Retry session check after cleanup
                        const retryCheck = await sessionGuard.check(userId, guildId, 'fishing', interaction.client);
                        if (retryCheck.allowed) {
                            logger.info(`Session check successful after fishing game cleanup for user ${userId}`);
                        } else {
                            const errorEmbed = new EmbedBuilder()
                                .setTitle('❌ Session Error')
                                .setDescription(retryCheck.message)
                                .setColor(0xFF0000)
                                .setTimestamp();
                            return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                        }
                    } else {
                        const errorEmbed = new EmbedBuilder()
                            .setTitle('❌ Session Error')
                            .setDescription(check.message)
                            .setColor(0xFF0000)
                            .setTimestamp();
                        return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    }
                } else {
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('❌ Session Error')
                        .setDescription(check.message)
                        .setColor(0xFF0000)
                        .setTimestamp();
                    return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }
            }
            
            // Validate and deduct bet amount using PayoutManager
            const amountStr = interaction.options.getString('amount');
            
            const validation = await PayoutManager.validateAndDeductBet(
                interaction,
                amountStr,
                GameType.FISHING,
                1, // No minimum bet for fishing
                10000000 // Maximum bet: 10M
            );
            
            if (!validation.isValid) {
                await interaction.reply({
                    embeds: [validation.errorEmbed],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            
            const betAmount = validation.parsedAmount;

            // Create game session with enhanced protection
            const sessionResult = await sessionManager.createSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: 'fishing',
                betAmount,
                betPreDeducted: true,
                timeout: 300000, // 5 minutes for Fishing
                metadata: {
                    gamePhase: 'active',
                    singlePlayer: true
                },
                interaction
            });
            
            if (!sessionResult.success) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Session Error')
                    .setDescription(`Failed to create game session: ${sessionResult.error}`)
                    .setColor(0xFF0000);
                
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Create fishing game (bet already deducted by PayoutManager)
            const fishingGame = startFishingGame(userId, username, betAmount, validation.newWallet);
            fishingGame.sessionId = sessionResult.sessionId; // Store session ID for completion

            // Get current balance for bank amount in embed
            const balance = await dbManager.getUserBalance(userId, guildId);
            
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
                `🎣 **Fishing Game Started**\n**Player:** ${username} (\`${userId}\`)\n**Bet:** ${fmt(betAmount)}\n**Remaining Wallet:** ${fmt(validation.newWallet)}`,
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
        
        logger.info(`Fishing button clicked: ${action} by user ${userId}`);
        
        try {
            const result = await handleFishingAction(interaction, action);
            
            logger.info(`Fishing action result for ${userId}:`, result);
            
            // If game ended, handle cleanup
            if (result && result.gameEnded) {
                logger.info(`Fishing game ended for ${userId}, calling endFishingSession`);
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
            logger.info(`Starting endFishingSession for user ${userId}`);
            const game = getFishingGame(userId);
            if (!game) {
                logger.warn(`No fishing game found for user ${userId} during session end`);
                return;
            }
            
            logger.info(`Found fishing game for ${userId}, sessionId: ${game.sessionId}`);

            // Calculate final amounts (wallet update handled by sessionManager payout)
            const netChange = game.currentWinnings - game.initialBet;
            const won = netChange >= 0;

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

            // Prepare final embed after payout has been processed (below)
            const endType = result.lostToRedFish ? 'red' : 
                          result.reachedLimit ? 'limit' : 'stop';

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

            // Add XP for game completion
            const xpResult = await levelingSystem.handleGameComplete(userId, guildId, 'fishing', won);
            
            // Check for level up
            if (xpResult && xpResult.leveledUp) {
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
            
            // Complete session if exists (this processes payout and clears active flag)
            if (game.sessionId) {
                logger.info(`Ending session ${game.sessionId} for user ${userId}`);
                await sessionManager.endSession(game.sessionId, {
                    outcome: won ? 'WON' : 'LOST',
                    payout: game.currentWinnings,
                    won: won,
                    netChange: netChange
                });
                logger.info(`Session ${game.sessionId} ended successfully for user ${userId}`);
            } else {
                logger.warn(`No sessionId found for user ${userId} fishing game`);
            }

            logger.info(`Fishing game completed: ${game.username} (${userId}) - ${won ? 'WIN' : 'LOSS'} ${fmt(netChange)}`);

            // Get updated balance for final embed (post-payout)
            const updatedBalance = await dbManager.getUserBalance(userId, guildId);
            const finalEmbed = game.createFinalEmbed(updatedBalance.bank, endType);
            // Send final result (use followUp to avoid interaction conflicts)
            setTimeout(async () => {
                try {
                    await interaction.followUp({ embeds: [finalEmbed] });
                } catch (followUpError) {
                    logger.warn(`Failed to send fishing final embed: ${followUpError.message}`);
                }
            }, 1000);

            // Remove game from active games
            await endFishingGame(userId);

        } catch (error) {
            logger.error(`Error ending fishing session: ${error.message}`, { userId, error: error.stack });
            
            // Ensure game is removed even if there was an error
            await endFishingGame(userId);
            
            // Best-effort: cancel any active session to ensure cleanup
            try {
                const active = sessionManager.getUserActiveSession(userId);
                if (active) {
                    await sessionManager.cancelSession(active.sessionId, 'Fishing end cleanup', true);
                }
            } catch (cleanupError) {
                logger.error(`Failed fishing session cleanup: ${cleanupError.message}`);
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
