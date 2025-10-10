/**
 * Mines game command for the casino bot
 * Classic minesweeper-style gambling game with economy-compliant multipliers
 */

const { SlashCommandBuilder, MessageFlags, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { PayoutManager, GameType, GameResult, TimeoutManager } = require('../UTILS/gameUtils');
const { fmt, fmtDelta, getGuildId, sendLogMessage, parseAmount } = require('../UTILS/common');
const { MinesGame } = require('../GAMES/mines');
const GamePanel = require('../UTILS/gamePanel');
const sessionManager = require('../UTILS/sessionManager');
const { SessionState } = sessionManager;
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');
const { GamePanelUtil } = require('../UTILS/gamePanelUtil');
const { buildSessionEmbed, buildButtons } = require('../UTILS/gameSessionKit');
const levelingSystem = require('../UTILS/levelingSystem');
const tuningManager = require('../UTILS/tuningManager');
const allInManager = require('../UTILS/allInManager');

// Game type constant
const SMGameType = { MINES: 'mines' };

// PROGRESSIVE DIFFICULTY MODES - Economy compliant with incremental house edge
const MINES_MODES = {
    safe: {
        name: '🛡️ Safe',
        description: 'Conservative mode with lower risk',
        minBet: 500,
        mineCount: 3,
        gridSize: 16, // 4x4 grid
        maxMultiplier: 2.0,
        houseEdge: 0.08,
        emoji: '🛡️',
        color: '#4CAF50'
    },
    balanced: {
        name: '⚖️ Balanced',
        description: 'Standard mode with moderate risk',
        minBet: 1000,
        mineCount: 5,
        gridSize: 25, // 5x5 grid
        maxMultiplier: 3.0,
        houseEdge: 0.10,
        emoji: '⚖️',
        color: '#FF9800'
    },
    risky: {
        name: '⚡ Risky',
        description: 'High risk with enhanced rewards',
        minBet: 2500,
        mineCount: 7,
        gridSize: 36, // 6x6 grid
        maxMultiplier: 5.0,
        houseEdge: 0.12,
        emoji: '⚡',
        color: '#FF8800'
    },
    extreme: {
        name: '🔥 Extreme',
        description: 'Maximum risk with premium rewards',
        minBet: 5000,
        mineCount: 10,
        gridSize: 49, // 7x7 grid
        maxMultiplier: 8.0,
        houseEdge: 0.15,
        emoji: '🔥',
        color: '#FF0000'
    }
};

// Active games storage (indexed by sessionId for better session management)
const activeGames = new Map();

// Initialize Game Panel Util
const gamePanelUtil = new GamePanelUtil();

/**
 * Create game embed with consistent styling using gameSessionKit
 */
async function createGameEmbed(game, user, balance = null, economicIndicators = null, regulatedPayout = null) {
    // Check for playfor context
    const playForRecipient = global.playForContext?.recipientName;
    const winningForSomeoneElse = playForRecipient && global.playForContext.recipientId;
    
    // Top fields for game information
    const topFields = [];
    
    // Add instructions if game is just starting
    if (!game.gameEnded && game.revealedTiles.length === 0) {
        topFields.push({
            name: '📖 HOW TO PLAY',
            value: '• Click numbered tiles to reveal them\n• Avoid mines - hit a mine and lose everything!\n• Each safe tile increases your multiplier\n• Cash out anytime to secure your winnings',
            inline: false
        });
    }
    
    // Game stats only - no visual grid
    const stats = await game.getStats();
    topFields.push({
        name: '📊 GAME STATS',
        value: `Revealed: ${stats.revealed}/${stats.safeSpots} | Mines: ${stats.mineCount} | Current Multiplier: ${stats.currentMultiplier.toFixed(2)}x`,
        inline: false
    });
    
    // Add playfor field if applicable
    if (winningForSomeoneElse) {
        topFields.push({
            name: '🎁 Playing For',
            value: `@${playForRecipient}`,
            inline: true
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
        if (game.hitMine) {
            stageText = 'MINE HIT!';
            color = 0xff0000; // Red for loss
        } else if (game.cashedOut) {
            if (winningForSomeoneElse) {
                stageText = `CASHED OUT FOR @${playForRecipient}!`;
            } else {
                stageText = 'CASHED OUT';
            }
            color = 0x00ff00; // Green for cash out
        } else {
            if (winningForSomeoneElse) {
                stageText = `ALL CLEAR FOR @${playForRecipient}!`;
            } else {
                stageText = 'ALL CLEAR';
            }
            color = 0xFFD700; // Gold for perfect clear
        }
    } else {
        stageText = 'PLAYING';
        color = 0x00ff00; // Bright green for active game
    }

    let footer = game.gameEnded ? 'Game completed' : 'Click tiles to reveal or cash out';
    if (winningForSomeoneElse) {
        footer = `Playing for @${playForRecipient} • ` + footer;
    }
    if (economicIndicators && !game.gameEnded) {
        footer += ` • AI Economy: ${economicIndicators.status} ${economicIndicators.healthScore}/100`;
    }
    
    return buildSessionEmbed({
        title: `💣 ${user.displayName}'s Mines`,
        topFields,
        bankFields,
        stageText,
        color: economicIndicators?.color || color,
        footer
    });
}

/**
 * Create action buttons for mines game
 */
async function createGameButtons(userId, game = null) {
    const { ActionRowBuilder } = require('discord.js');
    
    if (!game || game.gameEnded) {
        // Game ended or no game - show only help
        const helpButton = new ButtonBuilder()
            .setCustomId(`mines-${userId}-help`)
            .setLabel('Help')
            .setEmoji('ℹ️')
            .setStyle(ButtonStyle.Secondary);
        
        return [new ActionRowBuilder().addComponents(helpButton)];
    }
    
    const rows = [];
    const buttons = [];
    
    // Add cash out button if player has revealed tiles
    if (game.revealedTiles.length > 0) {
        const currentMultiplier = await game.getCurrentMultiplier();
        const cashoutButton = new ButtonBuilder()
            .setCustomId(`mines-${userId}-cashout`)
            .setLabel(`Cash Out (${currentMultiplier.toFixed(2)}x)`)
            .setEmoji('💎')
            .setStyle(ButtonStyle.Success);
        buttons.push(cashoutButton);
    }
    
    // Add help button
    const helpButton = new ButtonBuilder()
        .setCustomId(`mines-${userId}-help`)
        .setLabel('Help')
        .setEmoji('ℹ️')
        .setStyle(ButtonStyle.Secondary);
    buttons.push(helpButton);
    
    // Add to first row
    if (buttons.length > 0) {
        rows.push(new ActionRowBuilder().addComponents(buttons));
    }
    
    // Create grid buttons - always use 5 buttons per row for consistent mobile display
    const BUTTONS_PER_ROW = 5; // Discord's max and optimal for mobile
    let currentRow = [];
    
    for (let i = 0; i < game.gridSize; i++) {
        const isRevealed = game.revealedTiles.includes(i);
        const isMine = game.mines.includes(i);
        const isGameEnded = game.gameEnded;
        
        // Determine button state
        let buttonStyle, emoji, disabled;
        
        if (isRevealed) {
            if (isMine) {
                // Revealed mine - red with explosion
                buttonStyle = ButtonStyle.Danger;
                emoji = '💥';
                disabled = true;
            } else {
                // Revealed safe tile - gray with gem
                buttonStyle = ButtonStyle.Secondary;
                emoji = '💎';
                disabled = true;
            }
        } else {
            if (isGameEnded && isMine) {
                // Game ended, show unrevealed mines
                buttonStyle = ButtonStyle.Danger;
                emoji = '💣';
                disabled = true;
            } else if (isGameEnded) {
                // Game ended, unrevealed safe tiles
                buttonStyle = ButtonStyle.Secondary;
                emoji = '⬜';
                disabled = true;
            } else {
                // Active tile - green with question mark
                buttonStyle = ButtonStyle.Success;
                emoji = '❓';
                disabled = false;
            }
        }
        
        const button = new ButtonBuilder()
            .setCustomId(`mines-${userId}-tile-${i}`)
            .setLabel((i + 1).toString())
            .setEmoji(emoji)
            .setStyle(buttonStyle)
            .setDisabled(disabled);
        
        currentRow.push(button);
        
        // Create new row when we hit exactly 5 buttons (Discord's limit and best for mobile)
        if (currentRow.length === BUTTONS_PER_ROW) {
            rows.push(new ActionRowBuilder().addComponents(currentRow));
            currentRow = [];
            
            // Discord limit: max 5 total rows, we reserve 1 for action buttons
            if (rows.length >= 4) break;
        }
    }
    
    // Add any remaining buttons if there's room
    if (currentRow.length > 0 && rows.length < 4) {
        rows.push(new ActionRowBuilder().addComponents(currentRow));
    }
    
    return rows;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mines')
        .setDescription('Play mines - reveal tiles while avoiding mines!')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to bet (supports K/M/B, "all", "all in", "half")')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Risk mode (higher modes have more mines but higher multipliers)')
                .setRequired(false)
                .addChoices(
                    { name: '🛡️ Safe (3 mines, 4x4 grid, Max: 2x)', value: 'safe' },
                    { name: '⚖️ Balanced (5 mines, 5x5 grid, Max: 3x)', value: 'balanced' },
                    { name: '⚡ Risky (7 mines, 6x6 grid, Max: 5x)', value: 'risky' },
                    { name: '🔥 Extreme (10 mines, 7x7 grid, Max: 8x)', value: 'extreme' }
                )
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const amount = interaction.options.getString('amount');
        const selectedMode = interaction.options.getString('mode') || 'balanced';
        const guildId = await getGuildId(interaction);
        logger.debug(`Mines execute called by ${username} (${userId}) in guild ${guildId} with amount '${amount}' and mode '${selectedMode}'`);

        // Get mode configuration
        const modeConfig = MINES_MODES[selectedMode] || MINES_MODES.balanced;

        let validation; // Declare validation at function scope
        
        try {
            // Check maintenance mode first
            const maintenanceGuard = require('../UTILS/maintenanceGuard');
            const maintenanceCheck = await maintenanceGuard.check(guildId, 'mines');
            if (!maintenanceCheck.allowed) {
                return await interaction.reply({ embeds: [maintenanceCheck.embed], ephemeral: true });
            }

            // Validate session before proceeding using modern session system (via sessionGuard)
            const sessionGuard = require('../UTILS/sessionGuard');
            const check = await sessionGuard.check(userId, guildId, SMGameType.MINES, interaction.client);
            logger.debug(`canCreateSession result for ${userId}: ${JSON.stringify({ allowed: check.allowed, reason: check.code })}`);
            if (!check.allowed) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Session Error')
                    .setDescription(check.message)
                    .setColor(0xFF0000)
                    .setTimestamp();
                return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            // Ensure user exists and get balance
            await dbManager.ensureUser(userId, username);
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            logger.debug(`Fetched user balance for ${userId}: wallet=${userBalance.wallet}, bank=${userBalance.bank}`);

            // 🎛️ INITIALIZE AI SYSTEMS
            await tuningManager.initialize();
            await allInManager.initialize();
            
            // Validate and deduct bet with mode-specific minimum (no max bet limit - bulletproof economy handles risk)
            validation = await PayoutManager.validateAndDeductBet(
                interaction,
                amount,
                GameType.MINES || 'mines',
                modeConfig.minBet,  // Mode-specific minimum bet
                null                // No max bet limit
            );
            
            // Log all-in bets for monitoring
            const isAllIn = await allInManager.isAllInBet(userId, amount);
            if (isAllIn) {
                // Get user's total wealth for logging
                const userBalance = await dbManager.getUserBalance(userId, guildId);
                const totalWealth = userBalance.wallet + userBalance.bank;
                logger.info(`🎯 MINES ALL-IN: ${userId} -> ${fmt(amount)} (${((amount / totalWealth) * 100).toFixed(1)}% of wealth)`);
            }

            if (!validation.isValid) {
                return await interaction.reply({ embeds: [validation.errorEmbed], ephemeral: true });
            }

            const betAmount = validation.parsedAmount;
            logger.debug(`Bet validated for ${userId}: parsedAmount=${betAmount}`);

            // Create game session with enhanced protection
            const sessionResult = await sessionManager.createSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: SMGameType.MINES,
                betAmount,
                betPreDeducted: true,
                timeout: 600000, // 10 minutes
                metadata: {
                    gamePhase: 'playing',
                    gameStarted: true,
                    mode: selectedMode,
                    modeConfig: modeConfig
                },
                interaction
            });
            
            if (!sessionResult.success) {
                throw new Error(`Session creation failed: ${sessionResult.error}`);
            }

            const sessionId = sessionResult.sessionId;
            logger.debug(`Mines session created: ${sessionId} for ${userId}`);

            // Create new game with mode configuration and link to session
            const game = new MinesGame(userId, betAmount, modeConfig);
            game.sessionId = sessionId; // Link game to session
            
            // Store game
            const sessionData = {
                game: game,
                userId: userId,
                betAmount: betAmount
            };
            activeGames.set(sessionId, sessionData);

            // Update session with initial game data
            await sessionManager.updateSession(sessionId, {
                gameData: {
                    mineCount: game.mineCount,
                    gridSize: game.gridSize,
                    revealedCount: game.revealedTiles.length,
                    gamePhase: 'playing',
                    gameStarted: true
                }
            }, 'initial_setup');

            // Create embed and buttons
            const economicIndicators = null;
            const embed = await createGameEmbed(game, interaction.user, userBalance, economicIndicators);
            const actionRows = await createGameButtons(userId, game);

            // Send game message
            const messageData = { 
                embeds: [embed], 
                components: actionRows
            };
            
            await interaction.reply(messageData);
            logger.debug(`Initial mines message sent for session ${sessionId}`);

            // Log game start
            await sendLogMessage(
                interaction.client,
                'game',
                `Mines game started: ${interaction.user.displayName} bet ${fmt(betAmount)} in ${selectedMode} mode`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error in mines command: ${error.message}`);
            try {
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `Mines error for ${interaction.user.tag} (${userId}) — ${error.message}`,
                    userId,
                    guildId
                );
            } catch (_) {}
            
            // Handle game error with session cleanup and refund
            let refundAmount = 0;
            try {
                // Try to get bet amount from validation or other sources
                if (typeof validation !== 'undefined' && validation?.parsedAmount) {
                    refundAmount = validation.parsedAmount;
                } else {
                    // Try to parse amount directly as fallback
                    const userBalance = await dbManager.getUserBalance(userId, guildId);
                    const parsedAmount = parseAmount(amount);
                    if (parsedAmount > 0) {
                        refundAmount = parsedAmount;
                    }
                }
            } catch (parseError) {
                logger.warn(`Could not determine refund amount: ${parseError.message}`);
            }
            
            // Handle session error and cleanup
            try {
                const userSession = sessionManager.getUserActiveSession(userId);
                if (userSession) {
                    await sessionManager.cancelSession(userSession.sessionId, 'Mines game initialization error', true);
                }
            } catch (sessionError) {
                logger.error(`Failed to handle session error: ${sessionError.message}`);
            }
            
            const { embed: errorEmbed } = GamePanel.createErrorEmbed({
                title: '❌ Mines Error',
                description: 'An error occurred while starting mines. Your bet has been refunded.',
                gameType: 'mines',
                showRetry: false
            });

            // Enhanced error response handling
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                } else if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                }
            } catch (replyError) {
                logger.error(`Failed to send error reply: ${replyError.message}`);
                logger.error(`Interaction state - replied: ${interaction.replied}, deferred: ${interaction.deferred}`);
            }
        }
    },

    // Mines button handlers (to be handled by interaction handler in index.js)
    handleMinesAction: async function(interaction, actionId) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        logger.debug(`Mines action '${actionId}' by ${userId} in guild ${guildId}`);
        
        try {
            // Find active game by user's session
            let game = null;
            let sessionId = null;
            
            // Use sessionManager to find user's active session
            const activeSession = sessionManager.getUserActiveSession(userId);
            
            if (activeSession && activeSession.gameType === SMGameType.MINES) {
                sessionId = activeSession.sessionId;
                const sessionData = activeGames.get(sessionId);
                game = sessionData?.game;
            }
            
            if (!game || !sessionId) {
                return await interaction.reply({ content: 'No active mines game found.', ephemeral: true });
            }

            const userBalance = await dbManager.getUserBalance(userId, guildId);

            if (actionId.startsWith('tile-')) {
                // Handle tile reveal
                const tileIndex = parseInt(actionId.split('-')[1]);
                await this.handleTileReveal(interaction, game, tileIndex, userId, guildId);
            } else {
                switch (actionId) {
                    case 'cashout':
                        await this.handleCashOut(interaction, game, userId, guildId);
                        break;
                    case 'help':
                        await this.handleHelp(interaction);
                        break;
                    default:
                        await interaction.reply({ content: 'Unknown action.', ephemeral: true });
                }
            }
        } catch (actionError) {
            logger.error(`Mines action error (${actionId}): ${actionError.message}`);
            try {
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `Mines action error (${actionId}) for ${interaction.user.tag} (${userId}) — ${actionError.message}`,
                    userId,
                    guildId
                );
            } catch (_) {}
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Error processing action.', ephemeral: true });
            }
        }
    },

    async handleTileReveal(interaction, game, tileIndex, userId, guildId) {
        if (game.gameEnded) {
            return await interaction.reply({ content: 'Game has already ended.', ephemeral: true });
        }

        const result = game.revealTile(tileIndex);
        
        if (!result.success) {
            return await interaction.reply({ content: result.message, ephemeral: true });
        }

        // Update embed
        const userBalance = await dbManager.getUserBalance(userId, guildId);
        const embed = await createGameEmbed(game, interaction.user, userBalance);
        const actionRows = await createGameButtons(userId, game);

        if (result.hitMine) {
            // Game over - hit mine
            await this.endGame(interaction, game, userId, guildId, false);
        } else if (result.allCleared) {
            // Game over - all safe tiles revealed
            await this.endGame(interaction, game, userId, guildId, true);
        } else {
            // Continue game
            await interaction.update({
                embeds: [embed],
                components: actionRows
            });
        }
    },

    async handleCashOut(interaction, game, userId, guildId) {
        if (game.gameEnded) {
            return await interaction.reply({ content: 'Game has already ended.', ephemeral: true });
        }

        if (game.revealedTiles.length === 0) {
            return await interaction.reply({ content: 'You must reveal at least one tile before cashing out.', ephemeral: true });
        }

        game.cashOut();
        await this.endGame(interaction, game, userId, guildId, true);
    },

    async handleHelp(interaction) {
        const { embed: helpEmbed, components: helpComponents } = GamePanel.createHelpEmbed({
            gameType: 'mines',
            title: '💣 Mines Help',
            description: '**How to Play Mines**',
            rules: [
                'Click tiles to reveal them - avoid the mines!',
                'Each safe tile increases your multiplier',
                'Cash out anytime to secure your winnings',
                'Hit a mine and lose everything'
            ],
            commands: [
                '**Tile Numbers:** Click to reveal that tile',
                '**Cash Out:** Take your current winnings and end the game',
                '**Auto-complete:** Reveal all safe tiles for maximum multiplier'
            ],
            tips: [
                'More mines = higher risk but better multipliers',
                'Safe mode: 3 mines, 4x4 grid (max 2x)',
                'Extreme mode: 10 mines, 7x7 grid (max 8x)',
                'Strategy: Cash out early for guaranteed wins!'
            ]
        });

        await interaction.reply({ embeds: [helpEmbed], components: helpComponents, ephemeral: true });
    },

    endGame: async function(interaction, game, userId, guildId, won = false) {
        try {
            // Safety check - ensure game still exists
            const sessionData = activeGames.get(game.sessionId);
            if (!sessionData || sessionData.game !== game) {
                logger.warn(`endGame called but game no longer exists or differs for session ${game.sessionId}`);
                return;
            }
            
            const currentMultiplier = await game.getCurrentMultiplier();
            const originalPayout = won ? Math.floor(game.betAmount * currentMultiplier) : 0;
            
            // 🎰 APPLY AI TUNING SYSTEM - ECONOMIC REGULATION
            const tuningAdjustment = await tuningManager.getAdjustedPayout('mines', originalPayout, game.betAmount);
            let regulatedPayout = won ? tuningAdjustment.adjustedPayout : 0;
            
            // 🎯 APPLY ALL-IN SYSTEM - DYNAMIC HOUSE EDGE
            if (won && regulatedPayout > 0) {
                const allInAdjustment = await allInManager.adjustGameResult(userId, game.betAmount, regulatedPayout, true, 'mines');
                regulatedPayout = allInAdjustment.adjustedPayout;
                
                // Log significant all-in adjustments
                if (allInAdjustment.houseEdgeApplied > 0.05) {
                    logger.info(`🎯 MINES ALL-IN EDGE: ${fmt(tuningAdjustment.adjustedPayout)} -> ${fmt(regulatedPayout)} (+${(allInAdjustment.houseEdgeApplied * 100).toFixed(1)}% house edge, ${(allInAdjustment.betRatio * 100).toFixed(1)}% of wealth)`);
                }
            }
            
            // Log tuning application for monitoring
            if (tuningAdjustment.payoutDelta !== 0 || tuningAdjustment.feeApplied) {
                logger.info(`🎛️ MINES TUNING: ${originalPayout} -> ${tuningAdjustment.adjustedPayout} (delta: ${(tuningAdjustment.payoutDelta * 100).toFixed(1)}%, fee: ${tuningAdjustment.feeApplied})`);
            }
            
            // Use PayoutManager for consistent payout handling
            const gameResult = new GameResult({
                userId,
                guildId,
                gameType: 'mines',
                betAmount: game.betAmount,
                payout: regulatedPayout,
                won: won,
                metadata: { 
                    tilesRevealed: game.revealedTiles.length,
                    mineCount: game.mineCount,
                    multiplier: currentMultiplier,
                    hitMine: game.hitMine,
                    cashedOut: game.cashedOut
                }
            });

            await PayoutManager.processGamePayout(gameResult);
            
            try {
                await dbManager.recordGameResult(
                    userId, 
                    guildId, 
                    'mines', 
                    won, 
                    game.betAmount, 
                    regulatedPayout,
                    {
                        tilesRevealed: game.revealedTiles.length,
                        mineCount: game.mineCount,
                        multiplier: currentMultiplier,
                        hitMine: game.hitMine,
                        cashedOut: game.cashedOut,
                        mode: game.mode
                    }
                );
                
                // Record for AI economy analyzer
                await tuningManager.recordGameResult(userId, 'mines', game.betAmount, regulatedPayout, won);
                
            } catch (recordError) {
                logger.warn(`Failed to record mines game result: ${recordError.message}`);
            }

            // Add XP for game completion
            const specialResult = (won && currentMultiplier >= 5) ? 'big_win' : 
                                (won && currentMultiplier >= 10) ? 'huge_win' : null;
            const xpResult = await levelingSystem.handleGameComplete(userId, guildId, 'mines', won, specialResult);

            // Check for level up and prepare notification
            let levelUpMessage = null;
            if (xpResult && xpResult.leveledUp) {
                // Process level-up rewards
                const levelReward = await levelingSystem.processLevelUpRewards(userId, guildId, xpResult.newLevel);
                
                levelUpMessage = `\n\n🎉 **LEVEL UP!** You are now level **${xpResult.newLevel}**!`;
                if (levelReward) {
                    levelUpMessage += `\n💰 **Level Reward:** +$${levelReward.money.toLocaleString()}`;
                }
                
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

            // Create final embed
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            const finalEmbed = await createGameEmbed(game, interaction.user, userBalance, null, regulatedPayout);

            // Check for playfor context
            const playForRecipient = global.playForContext?.recipientName;
            const winningForSomeoneElse = playForRecipient && global.playForContext.recipientId;
            
            // Create result message
            let resultMessage = '';
            if (game.hitMine) {
                resultMessage = `💥 **MINE HIT!** You lost ${fmt(game.betAmount)}`;
            } else if (won) {
                if (winningForSomeoneElse) {
                    resultMessage = `💰 **${game.cashedOut ? 'CASHED OUT' : 'PERFECT CLEAR'} FOR @${playForRecipient}!** You won ${fmt(regulatedPayout)} (${currentMultiplier.toFixed(2)}x) for @${playForRecipient}`;
                } else {
                    resultMessage = `💰 **${game.cashedOut ? 'CASHED OUT' : 'PERFECT CLEAR'}!** You won ${fmt(regulatedPayout)} (${currentMultiplier.toFixed(2)}x)`;
                }
            } else {
                resultMessage = `💸 **GAME OVER!** Better luck next time.`;
            }
            
            // Add level up message if applicable
            if (levelUpMessage) {
                resultMessage += levelUpMessage;
            }

            // Get updated balance for play again buttons
            const updatedBalance = await dbManager.getUserBalance(userId, guildId);
            
            // Check if this is a playfor game - disable buttons if so
            const isPlayforGame = global.playForContext?.recipientId;
            
            // Enhanced interaction update with validation
            const finalData = {
                content: resultMessage,
                embeds: [finalEmbed],
                components: isPlayforGame ? [] : GamePanel.createGameButtons({ 
                    actions: ['play_again_multi', 'quit'],
                    lastBet: game.betAmount,
                    balance: updatedBalance.wallet,
                    gameType: 'mines'
                })
            };

            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(finalData);
                } else {
                    await interaction.update(finalData);
                }
                
                logger.info(`Mines game successfully ended for user ${userId}`);
            } catch (interactionError) {
                logger.error(`Failed to update interaction for mines endGame: ${interactionError.message}`);
                
                // Fallback: try to send a new reply if update fails
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply(finalData);
                    }
                } catch (fallbackError) {
                    logger.error(`Failed fallback reply for mines endGame: ${fallbackError.message}`);
                }
            }

            // Complete session if game has one
            if (game.sessionId) {
                await sessionManager.endSession(game.sessionId, {
                    outcome: won ? 'WON' : 'LOST',
                    payout: regulatedPayout,
                    won: won,
                    finalMultiplier: currentMultiplier
                });
            }
            
            // Clean up after interaction update (success or failure)
            activeGames.delete(game.sessionId);

            // Log game end
            await sendLogMessage(
                interaction.client,
                'game',
                `Mines game ended: ${interaction.user.displayName} ${won ? 'won' : 'lost'} ${fmt(Math.abs(regulatedPayout - game.betAmount))}`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error ending mines game: ${error.message}`);
        }
    },

    /**
     * Start a new mines game from dropdown selection
     */
    async startNewGame(interaction, betAmount) {
        try {
            await interaction.deferUpdate();
            
            // Extract the bet amount and start a new game by calling the main execute function
            const fakeInteraction = {
                ...interaction,
                options: {
                    getString: (key) => key === 'amount' ? betAmount.toString() : null
                },
                deferReply: () => Promise.resolve(),
                reply: interaction.editReply.bind(interaction),
                editReply: interaction.editReply.bind(interaction),
                replied: false,
                deferred: true
            };

            // Call the main mines execute function with the fake interaction
            await this.execute(fakeInteraction);
            
        } catch (error) {
            logger.error(`Error starting new mines game from dropdown: ${error.message}`);
            
            try {
                const errorMessage = 'Failed to start new game. Please use `/mines` command directly.';
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: errorMessage, ephemeral: true });
                } else {
                    await interaction.followUp({ content: errorMessage, ephemeral: true });
                }
            } catch (replyError) {
                logger.error(`Failed to send error message: ${replyError.message}`);
            }
        }
    }
};