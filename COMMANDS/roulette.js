/**
 * Roulette game command for the casino bot
 * Classic American roulette with multiple betting options
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { fmt, fmtDelta, getGuildId, sendLogMessage, parseAmount } = require('../UTILS/common');
const { RouletteGame } = require('../GAMES/roulette');
const GamePanel = require('../UTILS/gamePanel');
const sessionManager = require('../UTILS/sessionManager');
const { SessionState } = sessionManager;
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const levelingSystem = require('../UTILS/levelingSystem');
const { GamePanelUtil } = require('../UTILS/gamePanelUtil');
const gifAnimator = require('../UTILS/gifAnimator');
// economicManager removed - using bulletproof economy
const comprehensiveLogger = require('../UTILS/comprehensiveLogger');
const tuningManager = require('../UTILS/tuningManager');
const uasDataExporter = require('../UTILS/uasDataExporter');

// Game type constant
const SMGameType = { ROULETTE: 'roulette' };

// PROGRESSIVE DIFFICULTY MODES
const ROULETTE_MODES = {
    safe: {
        name: '🛡️ Safe',
        description: 'Conservative mode with lower house edge',
        minBet: 500,
        houseEdge: 0.027,            // 2.7% house edge
        maxMultiplier: 2.0,          // Much more reasonable 2x max
        emoji: '🛡️',
        color: '#4CAF50'
    },
    balanced: {
        name: '⚖️ Balanced',
        description: 'Standard mode with traditional house edge',
        minBet: 1000,
        houseEdge: 0.035,            // 3.5% house edge
        maxMultiplier: 3.0,          // Reasonable 3x max
        emoji: '⚖️',
        color: '#FF9800'
    },
    risky: {
        name: '⚡ Risky',
        description: 'High risk with increased house edge',
        minBet: 2500,
        houseEdge: 0.040,            // 4.0% house edge
        maxMultiplier: 4.0,          // Moderate 4x max
        emoji: '⚡',
        color: '#FF8800'
    },
    extreme: {
        name: '🔥 Extreme',
        description: 'Maximum risk with highest house edge',
        minBet: 5000,
        houseEdge: 0.050,            // 5.0% house edge
        maxMultiplier: 6.0,          // Increased to 6x max
        emoji: '🔥',
        color: '#FF0000'
    }
};

// Active games storage (indexed by sessionId)
const activeGames = new Map();

// Initialize Game Panel Util
const gamePanelUtil = new GamePanelUtil();

/**
 * Create roulette wheel image
 */
async function createRouletteWheelImage(game, showResult = false, frameIndex = 0) {
    try {
        return await gamePanelUtil.createRouletteWheel({
            result: game.lastResult,
            currentBet: game.currentBet,
            isSpinning: game.isSpinning,
            showResult: showResult,
            frameIndex: frameIndex
        });
    } catch (error) {
        logger.error(`Error creating roulette wheel image: ${error.message}`);
        return null;
    }
}

/**
 * Create payout information embed with current bet info and FAIR multipliers
 */
async function createPayoutEmbed(user, balance, currentBet = null) {
    // FAIR CASINO PAYOUTS - Standard rates
    const personalizedConfig = { 
        colorPayout: 2.0,     // 1:1 bets (red/black/odd/even/low/high)
        dozenPayout: 3.0,     // 2:1 bets (dozens/columns)
        singleNumberPayout: 36.0,  // 35:1 single number
        greenPayout: 36.0,    // 35:1 green
        basketPayout: 7.0     // 6:1 basket
    };
    
    // Use FAIR payouts in the UI display
    const colorPayout = (personalizedConfig.colorPayout || 2.0).toFixed(1);
    const dozenPayout = (personalizedConfig.dozenPayout || 3.0).toFixed(1);  
    const numberPayout = (personalizedConfig.singleNumberPayout || 36.0).toFixed(1);
    const greenPayout = (personalizedConfig.greenPayout || 36.0).toFixed(1);
    const basketPayout = (personalizedConfig.basketPayout || 7.0).toFixed(1);
    
    // Show personalization status
    const personalizationStatus = '';
    
    const embed = new EmbedBuilder()
        .setTitle('🎰 American Roulette')
        .setColor(0xFF6B35)
        .setTimestamp();

    // Show current bet at the top if placed
    const topFields = [];
    
    // Check if this is a playfor game
    const playForRecipient = global.playForContext?.recipientName;
    const playingForSomeoneElse = playForRecipient && global.playForContext.recipientId;
    
    if (playingForSomeoneElse) {
        topFields.push({
            name: '🎁 Playing For',
            value: `@${playForRecipient}`,
            inline: true
        });
    }
    
    if (currentBet) {
        topFields.push({
            name: '🎯 CURRENT BET',
            value: `**${currentBet.type}**: ${fmt(currentBet.amount)}${currentBet.numbers ? ` (${currentBet.numbers.join(', ')})` : ''}`,
            inline: false
        });
    }

    // Add formatted payout table with personalized multipliers
    topFields.push(
        { 
            name: `💰 AMERICAN ROULETTE PAYOUTS${personalizationStatus}`, 
            value: '```yaml\n' +
                   '🎨 COLOR BETS:\n' +
                   `  Red             ${colorPayout}x\n` +
                   `  Black           ${colorPayout}x\n` +
                   `  Green (0, 00)   ${greenPayout}x\n` +
                   '\n' +
                   '🔢 NUMBER BETS:\n' +
                   `  Even/Odd        ${colorPayout}x\n` +
                   `  1-18 / 19-36    ${colorPayout}x\n` +
                   `  Single Number  ${numberPayout}x\n` +
                   '\n' +
                   '📊 GROUP BETS:\n' +
                   `  Dozens (1-12)   ${dozenPayout}x\n` +
                   `  Columns         ${dozenPayout}x\n` +
                   `  Basket (0,00+)  ${basketPayout}x\n` +
                   '```', 
            inline: false 
        }
    );

    embed.addFields(topFields);

    // Banking fields
    if (balance) {
        const bankFields = [
            { name: '💵 Wallet', value: fmt(balance.wallet), inline: true },
            { name: '🏦 Bank', value: fmt(balance.bank), inline: true },
            { name: '💰 Total', value: fmt(balance.wallet + balance.bank), inline: true }
        ];
        embed.addFields(bankFields);
    }

    // Description based on whether bet is placed
    if (currentBet) {
        embed.setDescription('✅ **Bet placed!** You can change your bet or spin the wheel.');
    } else {
        embed.setDescription('📋 **Study the payouts above, then place your bet!**');
    }

    embed.setFooter({ 
        text: currentBet ? '🎲 Ready to spin when you are!' : '💡 Choose your betting strategy wisely!',
        iconURL: user.displayAvatarURL?.() || user.defaultAvatarURL 
    });

    return embed;
}

/**
 * Create game embed with consistent styling
 */
function createGameEmbed(game, user, balance = null) {
    const topFields = [];
    
    // Check if this is a playfor game
    const playForRecipient = global.playForContext?.recipientName;
    const winningForSomeoneElse = playForRecipient && global.playForContext.recipientId;
    
    // Add playfor context if applicable
    if (winningForSomeoneElse) {
        topFields.push({
            name: '🎁 Playing For',
            value: `@${playForRecipient}`,
            inline: true
        });
    }
    
    // MOBILE-OPTIMIZED DISPLAY
    
    // Show current bet if game is active - LARGE FORMAT
    if (game.currentBet) {
        const betDesc = game.getBetDescription(game.currentBet.type);
        const betOdds = game.getPayoutOdds(game.currentBet.type);
        topFields.push({
            name: '🎯 YOUR BET',
            value: `**${betDesc}**\n💰 Amount: **${fmt(game.currentBet.amount)}**\n🎲 Pays: **${betOdds}**${game.currentBet.numbers ? `\n🔢 Numbers: **${game.currentBet.numbers.join(', ')}**` : ''}`,
            inline: false
        });
    }
    
    // Show last spin result if available - EXTRA LARGE FORMAT for mobile
    if (game.lastResult !== null) {
        const number = game.lastResult;
        const color = game.getNumberColor(number);
        const colorEmoji = color === 'red' ? '🔴' : color === 'black' ? '⚫' : '🟢';
        
        // Use the mobile wheel display for better visibility
        const mobileDisplay = game.generateMobileWheelDisplay();
        topFields.push({
            name: '🎰 WINNING NUMBER',
            value: `\`\`\`${mobileDisplay}\`\`\``,
            inline: false
        });
        
        topFields.push({
            name: '🎰 LAST RESULT',
            value: `${colorEmoji} **${number}** (${color.toUpperCase()})`,
            inline: true
        });
    }

    // Banking fields
    const bankFields = [];
    if (balance) {
        bankFields.push(
            { name: '💵 Wallet', value: fmt(balance.wallet), inline: true },
            { name: '🏦 Bank', value: fmt(balance.bank), inline: true }
        );
        
        if (game.currentBet) {
            bankFields.push({ name: '🎯 Bet', value: fmt(game.currentBet.amount), inline: true });
        }
    }

    // Determine game stage and embed color
    let stageText = '';
    let embedColor = 0x00ff00; // Bright green

    if (game.isSpinning) {
        stageText = 'SPINNING';
        embedColor = 0xFFD700; // Gold for spinning
    } else if (game.gameEnded) {
        if (game.lastPayout > 0) {
            if (winningForSomeoneElse) {
                stageText = `WON FOR @${playForRecipient}`;
            } else {
                stageText = 'WIN';
            }
            embedColor = 0x00ff00; // Green for win
        } else {
            stageText = 'LOSS';
            embedColor = 0xff0000; // Red for loss
        }
    } else {
        stageText = 'BETTING';
        embedColor = 0x00ff00; // Bright green for betting
    }

    let footer = game.gameEnded ? 'Game completed' : game.isSpinning ? 'Ball is spinning...' : 'Place your bets!';
    if (winningForSomeoneElse && game.gameEnded && game.lastPayout > 0) {
        footer = `Winnings sent to @${playForRecipient}!`;
    }
    
    return buildSessionEmbed({
        title: `🎰 ${user.displayName || user.username || 'Player'}'s American Roulette`,
        topFields,
        bankFields,
        stageText,
        embedColor,
        footer
    });
}

/**
 * Create betting buttons for roulette
 */
function createBettingButtons(userId, game = null) {
    const rows = [];
    
    // Row 1: Color bets (reduced payouts)
    const row1 = {
        type: 1,
        components: [
            new ButtonBuilder()
                .setCustomId(`roulette-${userId}-red`)
                .setLabel('Red (1.8x)')
                .setEmoji('🔴')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(game?.isSpinning || game?.gameEnded),
            new ButtonBuilder()
                .setCustomId(`roulette-${userId}-black`)
                .setLabel('Black (1.8x)')
                .setEmoji('⚫')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(game?.isSpinning || game?.gameEnded),
            new ButtonBuilder()
                .setCustomId(`roulette-${userId}-green`)
                .setLabel('Green (4.5x)')
                .setEmoji('🟢')
                .setStyle(ButtonStyle.Success)
                .setDisabled(game?.isSpinning || game?.gameEnded)
        ]
    };
    rows.push(row1);

    // Row 2: Odd/Even and High/Low (reduced payouts)
    const row2 = {
        type: 1,
        components: [
            new ButtonBuilder()
                .setCustomId(`roulette-${userId}-odd`)
                .setLabel('Odd (1.8x)')
                .setEmoji('🎲')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(game?.isSpinning || game?.gameEnded),
            new ButtonBuilder()
                .setCustomId(`roulette-${userId}-even`)
                .setLabel('Even (1.8x)')
                .setEmoji('🎯')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(game?.isSpinning || game?.gameEnded),
            new ButtonBuilder()
                .setCustomId(`roulette-${userId}-low`)
                .setLabel('Low 1-18 (1.8x)')
                .setEmoji('⬇️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(game?.isSpinning || game?.gameEnded),
            new ButtonBuilder()
                .setCustomId(`roulette-${userId}-high`)
                .setLabel('High 19-36 (1.8x)')
                .setEmoji('⬆️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(game?.isSpinning || game?.gameEnded)
        ]
    };
    rows.push(row2);

    // Row 3: Special bets (reduced payouts)
    const row3 = {
        type: 1,
        components: [
            new ButtonBuilder()
                .setCustomId(`roulette-${userId}-dozen`)
                .setLabel('Dozens (2.5x)')
                .setEmoji('📊')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(game?.isSpinning || game?.gameEnded),
            new ButtonBuilder()
                .setCustomId(`roulette-${userId}-basket`)
                .setLabel('Basket (2.2x)')
                .setEmoji('🧺')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(game?.isSpinning || game?.gameEnded),
            new ButtonBuilder()
                .setCustomId(`roulette-${userId}-numbers`)
                .setLabel('Numbers (4.5x)')
                .setEmoji('🔢')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(game?.isSpinning || game?.gameEnded)
        ]
    };
    rows.push(row3);

    // Row 4: Action buttons
    const row4 = {
        type: 1,
        components: [
            new ButtonBuilder()
                .setCustomId(`roulette-${userId}-spin`)
                .setLabel('Spin!')
                .setEmoji('🎰')
                .setStyle(ButtonStyle.Success)
                .setDisabled(!game?.currentBet || game?.isSpinning || game?.gameEnded),
            new ButtonBuilder()
                .setCustomId(`roulette-${userId}-clear`)
                .setLabel('Clear Bet')
                .setEmoji('🗑️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!game?.currentBet || game?.isSpinning || game?.gameEnded),
            new ButtonBuilder()
                .setCustomId(`roulette-${userId}-help`)
                .setLabel('Help')
                .setEmoji('❓')
                .setStyle(ButtonStyle.Secondary)
        ]
    };
    rows.push(row4);

    return rows;
}

/**
 * Create number selection dropdown
 */
function createNumberSelector(userId, betAmount) {
    const options = [];
    
    // Add green zeros
    options.push({
        label: '0 (Green) - 4.5x',
        value: '0',
        emoji: '🟢'
    });
    
    options.push({
        label: '00 (Green) - 4.5x',
        value: '00',
        emoji: '🟢'
    });
    
    // Add red numbers (first 11 to stay under Discord's 25 option limit)
    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21];
    for (const num of redNumbers) {
        options.push({
            label: `${num} (Red) - 4.5x`,
            value: num.toString(),
            emoji: '🔴'
        });
    }
    
    // Add black numbers (first 12 to reach exactly 25 options)
    const blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24];
    for (const num of blackNumbers) {
        options.push({
            label: `${num} (Black) - 4.5x`,
            value: num.toString(),
            emoji: '⚫'
        });
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`roulette-${userId}-number-select`)
        .setPlaceholder('Select a number to bet on (Dynamic payout)')
        .addOptions(options);

    return [{ type: 1, components: [selectMenu] }];
}

/**
 * Create dozen selection dropdown
 */
function createDozenSelector(userId) {
    const options = [
        {
            label: '1st Dozen (1-12) - 2.5x',
            value: 'dozen1',
            emoji: '1️⃣'
        },
        {
            label: '2nd Dozen (13-24) - 2.5x',
            value: 'dozen2',
            emoji: '2️⃣'
        },
        {
            label: '3rd Dozen (25-36) - 2.5x',
            value: 'dozen3',
            emoji: '3️⃣'
        }
    ];

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`roulette-${userId}-dozen-select`)
        .setPlaceholder('Select a dozen to bet on (Dynamic payout)')
        .addOptions(options);

    return [{ type: 1, components: [selectMenu] }];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('Play roulette with multiple betting options!')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to bet (supports K/M/B, "all", "all in", "half")')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Risk mode (higher modes have higher minimum bets and max multipliers)')
                .setRequired(false)
                .addChoices(
                    { name: '🛡️ Safe (Min: $500, House Edge: 2.7%, Max Multiplier: 2x)', value: 'safe' },
                    { name: '⚖️ Balanced (Min: $1K, House Edge: 3.5%, Max Multiplier: 3x)', value: 'balanced' },
                    { name: '⚡ Risky (Min: $2.5K, House Edge: 4.0%, Max Multiplier: 4x)', value: 'risky' },
                    { name: '🔥 Extreme (Min: $5K, House Edge: 5.0%, Max Multiplier: 6x)', value: 'extreme' }
                )
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const amount = interaction.options.getString('amount');
        const selectedMode = interaction.options.getString('mode') || 'balanced';
        const guildId = await getGuildId(interaction);
        logger.debug(`Roulette execute called by ${username} (${userId}) in guild ${guildId} with amount '${amount}' and mode '${selectedMode}'`);

        let validation;
        
        try {
            // Get mode configuration
            const modeConfig = ROULETTE_MODES[selectedMode] || ROULETTE_MODES.balanced;
            
            // Check maintenance mode first
            const maintenanceGuard = require('../UTILS/maintenanceGuard');
            const maintenanceCheck = await maintenanceGuard.check(guildId, 'roulette');
            if (!maintenanceCheck.allowed) {
                return await interaction.reply({ embeds: [maintenanceCheck.embed], flags: MessageFlags.Ephemeral });
            }
            
            // Validate session using sessionGuard
            const sessionGuard = require('../UTILS/sessionGuard');
            const check = await sessionGuard.check(userId, guildId, SMGameType.ROULETTE, interaction.client);
            logger.debug(`canCreateSession result for ${userId}: ${JSON.stringify({ allowed: check.allowed, reason: check.code })}`);
            if (!check.allowed) {
                const { EmbedBuilder } = require('discord.js');
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Session Error')
                    .setDescription(check.message)
                    .setColor(0xFF0000)
                    .setTimestamp();
                return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Ensure user exists and get balance
            await dbManager.ensureUser(userId, username);
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            logger.debug(`Fetched user balance for ${userId}: wallet=${userBalance.wallet}, bank=${userBalance.bank}`);

            // Validate and deduct bet using mode-specific minimum bet
            validation = await PayoutManager.validateAndDeductBet(
                interaction,
                amount,
                GameType.BLACKJACK, // Using existing GameType, can create ROULETTE later
                modeConfig.minBet,  // Mode-specific minimum bet
                null                // No max bet limit - bulletproof economy handles risk
            );

            if (!validation.isValid) {
                return await interaction.reply({ embeds: [validation.errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const betAmount = validation.parsedAmount;
            logger.debug(`Bet validated for ${userId}: parsedAmount=${betAmount}`);

            // Create game session
            const sessionResult = await sessionManager.createSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: SMGameType.ROULETTE,
                betAmount,
                betPreDeducted: true,
                timeout: 300000, // 5 minutes
                metadata: {
                    gamePhase: 'betting',
                    currentBet: null,
                    lastResult: null,
                    mode: selectedMode,
                    modeConfig: modeConfig
                },
                interaction
            });
            
            if (!sessionResult.success) {
                logger.error(`Roulette session creation failed for ${userId}: ${sessionResult.error} (Code: ${sessionResult.code})`);
                
                // More specific error messages
                let errorMessage = 'Failed to start roulette session.';
                if (sessionResult.code === 'SESSION_EXISTS') {
                    errorMessage = sessionResult.error; // Use the specific message from sessionManager
                } else if (sessionResult.code === 'RATE_LIMITED') {
                    errorMessage = 'Please wait a moment before starting a new game.';
                } else if (sessionResult.code === 'INSUFFICIENT_FUNDS') {
                    errorMessage = 'Insufficient funds for this bet.';
                } else {
                    errorMessage = sessionResult.error || 'Session creation failed. Please try again.';
                }
                
                throw new Error(errorMessage);
            }

            const sessionId = sessionResult.sessionId;
            if (!sessionId) {
                logger.error(`Roulette session creation returned success but no sessionId for ${userId}`);
                throw new Error('Session creation failed: No session ID returned.');
            }
            
            logger.info(`Roulette session created successfully: ${sessionId} for ${userId} with bet ${fmt(betAmount)}`);

            // Create new game and link to session
            let game;
            try {
                game = new RouletteGame(userId, betAmount);
                game.sessionId = sessionId;
                activeGames.set(sessionId, game);
                logger.debug(`Roulette game object created and stored for session ${sessionId}`);
            } catch (gameError) {
                logger.error(`Failed to create roulette game object for session ${sessionId}: ${gameError.message}`);
                // Clean up session
                await sessionManager.endSession(sessionId, { reason: 'game_creation_failed', error: gameError.message });
                throw new Error('Failed to create game. Please try again.');
            }

            // Update session with initial game data
            try {
                await sessionManager.updateSession(sessionId, {
                    gameData: {
                        gamePhase: 'betting',
                        currentBet: null,
                        lastResult: null,
                        mode: selectedMode,
                        modeConfig: modeConfig
                    }
                }, 'game_start');
                logger.debug(`Session ${sessionId} updated with initial game data`);
            } catch (updateError) {
                logger.error(`Failed to update session ${sessionId} with game data: ${updateError.message}`);
                // Clean up
                activeGames.delete(sessionId);
                await sessionManager.endSession(sessionId, { reason: 'session_update_failed', error: updateError.message });
                throw new Error('Failed to initialize game session. Please try again.');
            }

            // Create payout embed and betting buttons  
            const payoutEmbed = await createPayoutEmbed(interaction.user, userBalance);
            const actionRows = createBettingButtons(userId, game);

            // Send game message with text-based payout table
            const messageData = {
                embeds: [payoutEmbed],
                components: actionRows
            };

            await interaction.reply(messageData);

            logger.debug(`Initial roulette message sent for session ${sessionId}`);

            // Log game start
            await sendLogMessage(
                interaction.client,
                'game',
                `Roulette game started: ${interaction.user.displayName} with ${fmt(betAmount)} available to bet`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error in roulette command: ${error.message}`);
            try {
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `Roulette error for ${interaction.user.tag} (${userId}) — ${error.message}`,
                    userId,
                    guildId
                );
            } catch (_) {}
            
            // Handle game error with session cleanup and refund
            let refundAmount = 0;
            try {
                if (typeof validation !== 'undefined' && validation?.parsedAmount) {
                    refundAmount = validation.parsedAmount;
                } else {
                    const userBalance = await dbManager.getUserBalance(userId, guildId);
                    const parsedAmount = parseAmount(amount);
                    if (parsedAmount > 0) {
                        refundAmount = parsedAmount;
                    }
                }
            } catch (parseError) {
                logger.warn(`Could not determine refund amount: ${parseError.message}`);
            }
            
            // Handle session cleanup
            try {
                const userSession = sessionManager.getUserActiveSession(userId);
                if (userSession) {
                    await sessionManager.cancelSession(userSession.sessionId, 'Roulette game initialization error', true);
                }
            } catch (sessionError) {
                logger.error(`Failed to handle session error: ${sessionError.message}`);
            }
            
            const { embed: errorEmbed } = GamePanel.createErrorEmbed({
                title: '❌ Roulette Error',
                description: 'An error occurred while starting roulette. Your bet has been refunded.',
                gameType: 'roulette',
                showRetry: false
            });

            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                } else if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }
            } catch (replyError) {
                logger.error(`Failed to send error reply: ${replyError.message}`);
            }
        }
    },

    // Roulette button handlers
    handleRouletteAction: async function(interaction, actionId) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        logger.debug(`Roulette action '${actionId}' by ${userId} in guild ${guildId}`);
        
        try {
            // Find active game by user's session
            let game = null;
            let sessionId = null;
            
            const activeSession = sessionManager.getUserActiveSession(userId);
            
            if (activeSession && activeSession.gameType === SMGameType.ROULETTE) {
                sessionId = activeSession.sessionId;
                game = activeGames.get(sessionId);
            }
            
            if (!game || !sessionId) {
                return await interaction.reply({ content: 'No active roulette game found.', flags: MessageFlags.Ephemeral });
            }

            const userBalance = await dbManager.getUserBalance(userId, guildId);

            switch (actionId) {
                case 'red':
                case 'black':
                case 'green':
                case 'odd':
                case 'even':
                case 'low':
                case 'high':
                case 'basket':
                    await this.placeBet(interaction, game, userId, guildId, actionId, userBalance);
                    break;
                    
                case 'dozen':
                    const dozenSelector = createDozenSelector(userId);
                    await interaction.reply({
                        content: 'Select a dozen to bet on:',
                        components: dozenSelector,
                        flags: MessageFlags.Ephemeral
                    });
                    break;
                    
                case 'numbers':
                    const numberSelector = createNumberSelector(userId, game.betAmount);
                    await interaction.reply({
                        content: 'Select a number to bet on:',
                        components: numberSelector,
                        flags: MessageFlags.Ephemeral
                    });
                    break;
                    
                case 'spin':
                    await this.spinRoulette(interaction, game, userId, guildId);
                    break;
                    
                case 'clear':
                    game.clearBet();
                    const clearEmbed = createGameEmbed(game, interaction.user, userBalance);
                    const clearRows = createBettingButtons(userId, game);
                    await interaction.update({
                        embeds: [clearEmbed],
                        components: clearRows
                    });
                    break;
                    
                case 'help':
                    const { embed: helpEmbed, components: helpComponents } = GamePanel.createHelpEmbed({
                        gameType: 'roulette',
                        title: '🎰 Roulette Help',
                        description: '**How to Play American Roulette**',
                        rules: [
                            'Place bets on numbers, colors, or groups',
                            'Ball lands on one of 38 slots (0, 00, 1-36)',
                            'Winning bets are paid according to standard casino odds',
                            'Green streaks are limited for better experience'
                        ],
                        commands: [
                            '**Red/Black/Odd/Even/High/Low:** 2.0x payout',
                            '**Dozens (1-12, 13-24, 25-36):** 3.0x payout',
                            '**Single Numbers:** 36.0x payout',
                            '**Green (0 or 00):** 36.0x payout',
                            '**Basket (0, 00, 1, 2, 3):** 7.0x payout'
                        ],
                        tips: [
                            'American wheel has both 0 and 00',
                            'Green bets cover both 0 and 00',
                            'Basket bet covers the top 5 numbers',
                            'All outside bets lose on 0 and 00'
                        ]
                    });

                    await interaction.reply({ embeds: [helpEmbed], components: helpComponents, ephemeral: true });
                    break;
            }
        } catch (actionError) {
            logger.error(`Roulette action error (${actionId}): ${actionError.message}`);
            try {
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `Roulette action error (${actionId}) for ${interaction.user.tag} (${userId}) — ${actionError.message}`,
                    userId,
                    guildId
                );
            } catch (_) {}
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Error processing action.', flags: MessageFlags.Ephemeral });
            }
        }
    },

    async placeBet(interaction, game, userId, guildId, betType, userBalance) {
        try {
            game.placeBet(betType, game.betAmount);
            
            // Stay on payout table, just update with current bet info
            const payoutEmbed = await createPayoutEmbed(interaction.user, userBalance, game.currentBet);
            const actionRows = createBettingButtons(userId, game);
            
            const updateData = {
                embeds: [payoutEmbed],
                components: actionRows
            };
            
            await interaction.update(updateData);
        } catch (error) {
            logger.error(`Error placing bet: ${error.message}`);
            await interaction.reply({
                content: '❌ Failed to place bet. Please try again.',
                flags: MessageFlags.Ephemeral
            });
        }
    },

    async spinRoulette(interaction, game, userId, guildId) {
        try {
            if (!game.currentBet) {
                return await interaction.reply({
                    content: 'You must place a bet before spinning!',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Check if already spinning or ended
            if (game.isSpinning || game.gameEnded) {
                return await interaction.reply({
                    content: 'Game already in progress or completed!',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Set spinning state manually (don't use game.spin() yet)
            game.isSpinning = true;
            
            // Update embed to show spinning state
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            const spinningEmbed = createGameEmbed(game, interaction.user, userBalance);
            const disabledRows = createBettingButtons(userId, game);
            const spinningWheelImage = await createRouletteWheelImage(game, false);
            
            const spinningData = {
                embeds: [spinningEmbed],
                components: disabledRows
            };

            if (spinningWheelImage) {
                spinningData.files = [{ attachment: spinningWheelImage, name: 'roulette-wheel.png' }];
                spinningEmbed.setImage('attachment://roulette-wheel.png');
            }
            
            await interaction.update(spinningData);

            // Use existing roulette-spin.gif asset
            logger.info('Loading existing roulette-spin.gif...');
            const fs = require('fs');
            const path = require('path');
            
            try {
                const gifPath = path.join(__dirname, '..', 'assets', 'roulette-spin.gif');
                const spinningGIF = fs.readFileSync(gifPath);
                
                // Update with the spinning GIF
                const spinningGIFData = {
                    embeds: [spinningEmbed],
                    components: disabledRows,
                    files: [{ attachment: spinningGIF, name: 'roulette-spin.gif' }]
                };
                
                spinningEmbed.setImage('attachment://roulette-spin.gif');
                spinningEmbed.setDescription('🎲 **Spinning the wheel...**\n🌪️ Watch the ball bounce around the wheel!');
                
                await interaction.editReply(spinningGIFData);
                
                // Wait for 3 seconds as requested
                await new Promise(resolve => setTimeout(resolve, 3000));
                
            } catch (error) {
                logger.warn(`Failed to load roulette-spin.gif: ${error.message}, using fallback`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            // Now spin the wheel (the game logic handles the result)
            // Reset spinning state before calling spin() to avoid the check error
            game.isSpinning = false;
            const result = game.spin();
            const payout = game.calculatePayout(result);
            
            // Process payout
            await this.endGame(interaction, game, userId, guildId, result, payout);
            
        } catch (error) {
            logger.error(`Error spinning roulette: ${error.message}`);
            
            // Reset game state on error
            if (game) {
                game.isSpinning = false;
                game.gameEnded = false;
            }
            
            try {
                await interaction.followUp({
                    content: '❌ Error occurred during spin. Please try again.',
                    flags: MessageFlags.Ephemeral
                });
            } catch (followUpError) {
                logger.error(`Failed to send error follow-up: ${followUpError.message}`);
            }
        }
    },

    async endGame(interaction, game, userId, guildId, result, payout) {
        try {
            const won = payout > 0;
            const netChange = won ? (payout - game.betAmount) : -game.betAmount;
            const color = game.getNumberColor(result);
            const winColorEmoji = color === 'red' ? '🔴' : color === 'black' ? '⚫' : '🟢';
            
            // Comprehensive logging for game result
            await comprehensiveLogger.logGame(userId, interaction.user.displayName || interaction.user.username || 'Unknown', 'roulette', won ? 'WIN' : 'LOSS', {
                betAmount: game.betAmount,
                payout: payout,
                netChange: netChange,
                result: result,
                resultColor: color,
                betType: game.currentBet.type,
                betNumbers: game.currentBet.numbers || null,
                timing: 'game_complete'
            }).catch(err => logger.error('Logging error:', err));
            
            // Log economic impact
            if (won) {
                await comprehensiveLogger.logEconomic('ROULETTE_WIN_PAYOUT', 'NORMAL', `Player won ${fmt(payout)} from roulette on ${winColorEmoji} ${result}`, {
                    userId: userId,
                    username: interaction.user.displayName || interaction.user.username || 'Unknown',
                    betAmount: game.betAmount,
                    winnings: payout,
                    netProfit: netChange,
                    result: result,
                    resultColor: color,
                    betType: game.currentBet.type,
                    gameType: 'roulette'
                }).catch(err => logger.error('Logging error:', err));
            } else {
                await comprehensiveLogger.logEconomic('ROULETTE_LOSS', 'NORMAL', `Player lost ${fmt(game.betAmount)} to roulette on ${winColorEmoji} ${result}`, {
                    userId: userId,
                    username: interaction.user.displayName || interaction.user.username || 'Unknown',
                    betAmount: game.betAmount,
                    lossAmount: game.betAmount,
                    result: result,
                    resultColor: color,
                    betType: game.currentBet.type,
                    gameType: 'roulette'
                }).catch(err => logger.error('Logging error:', err));
            }
            
            // Use PayoutManager for consistent payout handling
            const gameResult = new GameResult({
                userId,
                guildId,
                gameType: 'roulette',
                betAmount: game.betAmount,
                payout: payout,
                won: won,
                metadata: { 
                    result: result,
                    betType: game.currentBet.type,
                    color: color
                }
            });

            await PayoutManager.processGamePayout(gameResult);

            // Export to UAS for centralized analysis
            try {
                await uasDataExporter.exportGameResult({
                    userId,
                    guildId,
                    gameType: 'roulette',
                    betAmount: game.betAmount,
                    winnings: payout,
                    won,
                    metadata: {
                        result,
                        resultColor: color,
                        betType: game.currentBet.type,
                        betNumbers: game.currentBet.numbers || null,
                        gameTimestamp: Date.now()
                    }
                });
            } catch (exportError) {
                logger.debug(`Failed to export roulette result to UAS: ${exportError.message}`);
            }
            
            try {
                await dbManager.recordGameResult(
                    userId, 
                    guildId, 
                    'roulette', 
                    won, 
                    game.betAmount, 
                    payout,
                    {
                        result: result,
                        betType: game.currentBet.type,
                        color: game.getNumberColor(result),
                        betNumbers: game.currentBet.numbers || null
                    }
                );
            } catch (recordError) {
                logger.warn(`Failed to record roulette game result: ${recordError.message}`);
            }

            // Add XP for game completion
            const xpResult = await levelingSystem.handleGameComplete(userId, guildId, 'roulette', won);

            // Check for level up
            let levelUpMessage = null;
            if (xpResult && xpResult.leveledUp) {
                const levelReward = await levelingSystem.processLevelUpRewards(userId, guildId, xpResult.newLevel);
                
                levelUpMessage = `\n\n🎉 **LEVEL UP!** You are now level **${xpResult.newLevel}**!`;
                if (levelReward) {
                    levelUpMessage += `\n💰 **Level Reward:** +$${levelReward.money.toLocaleString()}`;
                }
                
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
            game.gameEnded = true;
            game.lastResult = result;
            game.lastPayout = payout;
            
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            const finalEmbed = createGameEmbed(game, interaction.user, userBalance);
            const resultWheelImage = await createRouletteWheelImage(game, true);

            // Create result message
            const resultColor = game.getNumberColor(result);
            const finalColorEmoji = resultColor === 'red' ? '🔴' : resultColor === 'black' ? '⚫' : '🟢';
            
            // Check if this is a playfor game
            const playForRecipient = global.playForContext?.recipientName;
            const winningForSomeoneElse = playForRecipient && global.playForContext.recipientId;
            
            let resultMessage = `🎰 **Ball landed on ${finalColorEmoji} ${result}**\n\n`;
            
            if (won) {
                if (winningForSomeoneElse) {
                    resultMessage += `🎉 **YOU WIN ${fmt(payout)} for @${playForRecipient}!**`;
                } else {
                    resultMessage += `🎉 **YOU WIN!** ${fmt(payout)}`;
                }
            } else {
                resultMessage += `💸 **YOU LOSE!** Better luck next time.`;
            }
            
            if (levelUpMessage) {
                resultMessage += levelUpMessage;
            }

            // Get updated balance for play again buttons
            const updatedBalance = await dbManager.getUserBalance(userId, guildId);
            
            const finalData = {
                content: resultMessage,
                embeds: [finalEmbed],
                components: [] // Remove buttons when game ends as requested
            };

            if (resultWheelImage) {
                finalData.files = [{ attachment: resultWheelImage, name: 'roulette-wheel.png' }];
                finalEmbed.setImage('attachment://roulette-wheel.png');
            }
            
            await interaction.editReply(finalData);

            // Complete session
            if (game.sessionId) {
                await sessionManager.endSession(game.sessionId, {
                    outcome: 'COMPLETED',
                    payout: payout,
                    won: won,
                    result: result
                });
            }

            // Clean up
            activeGames.delete(game.sessionId);

            // Log game end
            await sendLogMessage(
                interaction.client,
                'game',
                `Roulette game ended: ${interaction.user.displayName} ${won ? 'won' : 'lost'} ${fmt(Math.abs(payout - game.betAmount))} (Ball: ${result})`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error ending roulette game: ${error.message}`);
        }
    },

    // Handle number selection from dropdown
    handleNumberSelect: async function(interaction, selectedNumber) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        
        try {
            const activeSession = sessionManager.getUserActiveSession(userId);
            
            if (!activeSession || activeSession.gameType !== SMGameType.ROULETTE) {
                return await interaction.reply({ content: 'No active roulette game found.', flags: MessageFlags.Ephemeral });
            }
            
            const game = activeGames.get(activeSession.sessionId);
            if (!game) {
                return await interaction.reply({ content: 'Game not found.', ephemeral: true });
            }

            // Place number bet - handle both numeric and string values (for '00')
            const numberValue = selectedNumber === '00' ? '00' : parseInt(selectedNumber);
            game.placeBet('number', game.betAmount, [numberValue]);
            
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            // Stay on payout table, just update with current bet info
            const payoutEmbed = await createPayoutEmbed(interaction.user, userBalance, game.currentBet);
            const actionRows = createBettingButtons(userId, game);
            
            const updateData = {
                embeds: [payoutEmbed],
                components: actionRows
            };
            
            await interaction.update(updateData);
            
        } catch (error) {
            logger.error(`Error handling number selection: ${error.message}`);
            await interaction.reply({
                content: '❌ Error placing number bet.',
                flags: MessageFlags.Ephemeral
            });
        }
    },

    // Handle dozen selection from dropdown
    handleDozenSelect: async function(interaction, selectedDozen) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        
        try {
            const activeSession = sessionManager.getUserActiveSession(userId);
            
            if (!activeSession || activeSession.gameType !== SMGameType.ROULETTE) {
                return await interaction.reply({ content: 'No active roulette game found.', flags: MessageFlags.Ephemeral });
            }
            
            const game = activeGames.get(activeSession.sessionId);
            if (!game) {
                return await interaction.reply({ content: 'Game not found.', ephemeral: true });
            }

            // Place dozen bet
            game.placeBet(selectedDozen, game.betAmount);
            
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            // Stay on payout table, just update with current bet info
            const payoutEmbed = await createPayoutEmbed(interaction.user, userBalance, game.currentBet);
            const actionRows = createBettingButtons(userId, game);
            
            const updateData = {
                embeds: [payoutEmbed],
                components: actionRows
            };
            
            await interaction.update(updateData);
            
        } catch (error) {
            logger.error(`Error handling dozen selection: ${error.message}`);
            await interaction.reply({
                content: '❌ Error placing dozen bet.',
                flags: MessageFlags.Ephemeral
            });
        }
    },

    /**
     * Start a new roulette game from dropdown selection
     */
    async startNewGame(interaction, betAmount) {
        try {
            await interaction.deferUpdate();
            
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

            await this.execute(fakeInteraction);
            
        } catch (error) {
            logger.error(`Error starting new roulette game from dropdown: ${error.message}`);
            
            try {
                const errorMessage = 'Failed to start new game. Please use `/roulette` command directly.';
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