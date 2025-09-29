/**
 * Yahtzee command for the casino bot
 * Complete Yahtzee game with dice rolling, keeping, and scoring
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const { PayoutManager, GameType, GameResult, TimeoutManager } = require('../UTILS/gameUtils');
const { fmt, fmtDelta, getGuildId, sendLogMessage, buildErrorEmbedWithSupport } = require('../UTILS/common');
const { YahtzeeGame, SCORING_CATEGORIES } = require('../GAMES/yahtzee');
const GamePanel = require('../UTILS/gamePanel');
const SMGameType = { YAHTZEE: 'yahtzee' };
const sessionManager = require('../UTILS/sessionManager');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');
const diceRenderer = require('../UTILS/diceRenderer');
const { GamePanelUtil } = require('../UTILS/gamePanelUtil');
const { buildSessionEmbed, buildButtons } = require('../UTILS/gameSessionKit');
const levelingSystem = require('../UTILS/levelingSystem');

// Active games storage
const activeGames = new Map();

// Initialize Game Panel Util
const gamePanelUtil = new GamePanelUtil();

// Category display names
const CATEGORY_NAMES = {
    ones: '1️⃣ Ones',
    twos: '2️⃣ Twos', 
    threes: '3️⃣ Threes',
    fours: '4️⃣ Fours',
    fives: '5️⃣ Fives',
    sixes: '6️⃣ Sixes',
    three_of_a_kind: '🎯 3 of a Kind',
    four_of_a_kind: '🎯 4 of a Kind',
    full_house: '🏠 Full House',
    small_straight: '📏 Small Straight',
    large_straight: '📏 Large Straight',
    yahtzee: '🎊 YAHTZEE',
    chance: '🎲 Chance'
};

/**
 * Create game embed with dice and scorecard
 */
async function createGameEmbed(game, user, balance = null) {
    const gameState = game.getGameState();
    
    // Check if this is a playfor game
    const playForRecipient = global.playForContext?.recipientName;
    const winningForSomeoneElse = playForRecipient && global.playForContext.recipientId;
    
    // Basic game information
    const fields = [];
    
    // Game status
    let statusText = '';
    if (game.gameEnded) {
        statusText = '🏁 Game Complete';
    } else {
        statusText = `🎲 Round ${gameState.currentRound}/13 • ${gameState.rollsLeft} rolls left`;
    }
    
    fields.push({
        name: '📊 Game Status',
        value: statusText,
        inline: true
    });

    // Current dice display
    const diceDisplay = gameState.dice.values
        .map((val, i) => `${val}${gameState.dice.kept[i] ? '🔒' : ''}`)
        .join(' ');
    
    fields.push({
        name: '🎲 Current Dice',
        value: diceDisplay || 'Not rolled yet',
        inline: true
    });

    // Scores
    const scorecard = gameState.scorecard;
    fields.push({
        name: '🏆 Current Score',
        value: `${scorecard.totalScore} points`,
        inline: true
    });

    // Banking fields
    if (balance) {
        fields.push(
            { name: '💵 Wallet', value: fmt(balance.wallet), inline: true },
            { name: '🏦 Bank', value: fmt(balance.bank), inline: true },
            { name: '🎯 Bet', value: fmt(gameState.betAmount), inline: true }
        );
    }

    // Upper section scores
    let upperDisplay = '';
    const upperCategories = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
    upperCategories.forEach(category => {
        const score = scorecard.scores[category];
        const potential = gameState.potentialScores[category];
        const icon = CATEGORY_NAMES[category].split(' ')[0];
        
        if (score !== null) {
            upperDisplay += `${icon} ${score} pts\n`;
        } else if (potential !== undefined) {
            upperDisplay += `${icon} (${potential})\n`;
        } else {
            upperDisplay += `${icon} —\n`;
        }
    });
    
    upperDisplay += `\n📊 Subtotal: ${scorecard.upperSectionScore}`;
    if (scorecard.upperSectionBonus > 0) {
        upperDisplay += `\n🎁 Bonus: ${scorecard.upperSectionBonus}`;
    }

    fields.push({
        name: '📈 Upper Section',
        value: upperDisplay,
        inline: true
    });

    // Lower section scores  
    let lowerDisplay = '';
    const lowerCategories = ['three_of_a_kind', 'four_of_a_kind', 'full_house', 'small_straight', 'large_straight', 'yahtzee', 'chance'];
    lowerCategories.forEach(category => {
        const score = scorecard.scores[category];
        const potential = gameState.potentialScores[category];
        const icon = CATEGORY_NAMES[category].split(' ')[0];
        
        if (score !== null) {
            lowerDisplay += `${icon} ${score} pts\n`;
        } else if (potential !== undefined) {
            lowerDisplay += `${icon} (${potential})\n`;
        } else {
            lowerDisplay += `${icon} —\n`;
        }
    });

    if (scorecard.bonusYahtzees.length > 0) {
        lowerDisplay += `\n🎊 Bonus Yahtzees: ${scorecard.bonusYahtzees.length}`;
    }

    fields.push({
        name: '📉 Lower Section',
        value: lowerDisplay,
        inline: true
    });

    // Add playfor context if applicable
    if (winningForSomeoneElse) {
        fields.push({
            name: '🎁 Playing For',
            value: `@${playForRecipient}`,
            inline: true
        });
    }

    // Determine color and stage
    let color = 0x00ff00; // Default green
    let stageText = 'In Progress';
    
    if (game.gameEnded) {
        const result = game.getResult();
        if (result.won) {
            color = 0xFFD700; // Gold for win
            stageText = winningForSomeoneElse ? `Winner for @${playForRecipient}!` : 'Winner!';
        } else {
            color = 0xff0000; // Red for loss
            stageText = 'Game Over';
        }
    }

    // Use consistent embed builder from gameSessionKit
    const embed = buildSessionEmbed({
        title: '🎲 YAHTZEE',
        description: winningForSomeoneElse ? `${user.displayName}'s Yahtzee Game for @${playForRecipient}` : `${user.displayName}'s Yahtzee Game`,
        fields,
        color,
        footer: winningForSomeoneElse ? 
            `ATIVE Casino • Playing for @${playForRecipient} • Click dice to keep/release` :
            'ATIVE Casino • Click dice to keep/release • Choose scoring category'
    });

    return embed;
}

/**
 * Create dice interaction buttons
 */
function createDiceButtons(game) {
    if (game.gameEnded) return [];

    const gameState = game.getGameState();
    const row = new ActionRowBuilder();

    // Die buttons
    for (let i = 0; i < 5; i++) {
        const dieValue = gameState.dice.values[i];
        const isKept = gameState.dice.kept[i];
        
        const button = new ButtonBuilder()
            .setCustomId(`yahtzee_die_${i}`)
            .setLabel(`${dieValue || '?'}`)
            .setStyle(isKept ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji(isKept ? '🔒' : '🎲');
            
        row.addComponents(button);
    }

    return [row];
}

/**
 * Create action buttons
 */
function createActionButtons(game) {
    const gameState = game.getGameState();
    const rows = [];

    if (game.gameEnded) {
        // Check if this is a playfor game - disable play again if so
        const isPlayforGame = global.playForContext?.recipientId;
        
        if (!isPlayforGame) {
            // Game over buttons (only show if not playfor game)
            const row = new ActionRowBuilder();
            
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('yahtzee_play_again')
                    .setLabel('Play Again')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄'),
                new ButtonBuilder()
                    .setCustomId('yahtzee_quit')
                    .setLabel('Quit')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('❌')
            );
            
            rows.push(row);
        }
    } else {
        // Roll dice button
        if (gameState.rollsLeft > 0) {
            const rollRow = new ActionRowBuilder();
            rollRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('yahtzee_roll')
                    .setLabel(`Roll Dice (${gameState.rollsLeft} left)`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎲')
            );
            rows.push(rollRow);
        }

        // Scoring buttons - only if dice have been rolled
        if (gameState.rollsLeft < 3) {
            const availableCategories = gameState.availableCategories;
            
            if (availableCategories.length > 0) {
                // Create select menu for scoring categories
                const selectRow = new ActionRowBuilder();
                
                const options = availableCategories.map(category => ({
                    label: CATEGORY_NAMES[category],
                    value: category,
                    description: `Score: ${gameState.potentialScores[category]} points`,
                    emoji: CATEGORY_NAMES[category].split(' ')[0]
                }));

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('yahtzee_score_category')
                    .setPlaceholder('Choose scoring category...')
                    .addOptions(options);
                    
                selectRow.addComponents(selectMenu);
                rows.push(selectRow);
            }
        }

        // Help and quit buttons
        const utilRow = new ActionRowBuilder();
        
        utilRow.addComponents(
            new ButtonBuilder()
                .setCustomId('yahtzee_help')
                .setLabel('?')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('❓'),
            new ButtonBuilder()
                .setCustomId('yahtzee_scorecard')
                .setLabel('Scorecard')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📊'),
            new ButtonBuilder()
                .setCustomId('yahtzee_quit_game')
                .setLabel('Quit Game')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );
        
        rows.push(utilRow);
    }

    return rows;
}

/**
 * Update game display
 */
async function updateGameDisplay(interaction, game, balance = null) {
    try {
        const embed = await createGameEmbed(game, interaction.user, balance);
        const diceButtons = createDiceButtons(game);
        const actionButtons = createActionButtons(game);
        const allButtons = [...diceButtons, ...actionButtons];

        // Create dice image
        const gameState = game.getGameState();
        let files = [];
        
        if (gameState.dice.values.some(val => val > 0)) {
            try {
                const diceImage = await diceRenderer.renderDice(gameState.dice.values, gameState.dice.kept);
                const attachment = new AttachmentBuilder(diceImage, { name: 'yahtzee_dice.png' });
                files = [attachment];
                embed.setImage('attachment://yahtzee_dice.png');
            } catch (error) {
                logger.warn(`Failed to render dice image: ${error.message}`);
            }
        }

        const updateOptions = {
            embeds: [embed],
            components: allButtons,
            files
        };

        if (interaction.replied || interaction.deferred) {
            return await interaction.editReply(updateOptions);
        } else {
            return await interaction.reply(updateOptions);
        }
    } catch (error) {
        logger.error(`Error updating Yahtzee display: ${error.message}`);
        throw error;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('yahtzee')
        .setDescription('Play Yahtzee dice game')
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('Amount to bet (0 for free play)')
                .setMinValue(0)
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            const userId = interaction.user.id;
            const guildId = await getGuildId(interaction);
            const betAmount = interaction.options.getInteger('bet') || 0;

            // Check maintenance mode first
            const maintenanceGuard = require('../UTILS/maintenanceGuard');
            const maintenanceCheck = await maintenanceGuard.check(guildId, 'yahtzee');
            if (!maintenanceCheck.allowed) {
                return await interaction.reply({ embeds: [maintenanceCheck.embed], ephemeral: true });
            }

            // Check for existing game
            if (activeGames.has(userId)) {
                return await interaction.reply({
                    content: '❌ You already have an active Yahtzee game. Finish it or wait for it to expire.',
                    ephemeral: true
                });
            }

            // Validate bet and get balance
            let balance = null;
            if (betAmount > 0) {
                const amountStr = betAmount.toString();
                const validation = await PayoutManager.validateAndDeductBet(
                    interaction,
                    amountStr,
                    GameType.YAHTZEE,
                    1,
                    null    // No maximum bet limit
                );
                if (!validation.isValid) {
                    return await interaction.reply({ embeds: [validation.errorEmbed], flags: MessageFlags.Ephemeral });
                }
                balance = await dbManager.getUserBalance(userId, guildId);
            }

            // Start new game session
            const sessionResult = await sessionManager.createSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: SMGameType.YAHTZEE,
                betAmount,
                betPreDeducted: betAmount > 0,
                timeout: 600000, // 10 minutes
                metadata: { gamePhase: 'active', singlePlayer: true },
                interaction
            });
            if (!sessionResult.success) {
                const errorEmbed = new EmbedBuilder().setTitle('❌ Session Error').setDescription(`Failed to create game session: ${sessionResult.error}`).setColor(0xFF0000);
                return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
            const sessionId = sessionResult.sessionId;
            
            // Create new game
            const game = new YahtzeeGame(userId, betAmount);
            activeGames.set(userId, { game, sessionId, startTime: Date.now() });

            // Log game start
            logger.info(`User ${userId} started Yahtzee with bet ${betAmount}`);
            await sendLogMessage(
                interaction.client,
                'info',
                `🎲 **Yahtzee Started**\nUser: ${interaction.user.tag}\nBet: ${fmt(betAmount)}`,
                userId,
                guildId
            );

            // Set timeout for game cleanup
            TimeoutManager.setTimeout(userId, 10 * 60 * 1000, () => {
                this.handleGameTimeout(userId, guildId);
            });

            // Update display
            await updateGameDisplay(interaction, game, balance);

        } catch (error) {
            logger.error(`Yahtzee command error: ${error.message}`);
            
            const guildId = await getGuildId(interaction);
            const { embed, components } = buildErrorEmbedWithSupport(
                '❌ Command Error',
                `An error occurred: ${error.message}`,
                guildId
            );

            const replyOptions = { embeds: [embed], ephemeral: true };
            if (components.length > 0) {
                replyOptions.components = components;
            }

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(replyOptions);
            } else {
                await interaction.reply(replyOptions);
            }
        }
    },

    async handleInteraction(interaction) {
        try {
            const userId = interaction.user.id;
            const guildId = getGuildId(interaction);
            const gameData = activeGames.get(userId);

            if (!gameData) {
                return await interaction.reply({
                    content: '❌ No active Yahtzee game found. Use `/yahtzee` to start a new game.',
                    ephemeral: true
                });
            }

            const { game, sessionId } = gameData;

            if (interaction.isButton()) {
                await this.handleButtonInteraction(interaction, game, sessionId);
            } else if (interaction.isStringSelectMenu()) {
                await this.handleSelectInteraction(interaction, game, sessionId);
            }

        } catch (error) {
            logger.error(`Yahtzee interaction error: ${error.message}`);
            
            const guildId = await getGuildId(interaction);
            const { embed, components } = buildErrorEmbedWithSupport(
                '❌ Interaction Error',
                'An error occurred processing your action.',
                guildId
            );

            const replyOptions = { embeds: [embed], ephemeral: true };
            if (components.length > 0) {
                replyOptions.components = components;
            }
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply(replyOptions);
            }
        }
    },

    async handleButtonInteraction(interaction, game, sessionId) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const customId = interaction.customId;

        await interaction.deferUpdate();

        if (customId.startsWith('yahtzee_die_')) {
            // Toggle die keep state
            const dieIndex = parseInt(customId.split('_')[2]);
            game.toggleKeep(dieIndex);
            
            // Update display
            const balance = game.betAmount > 0 ? await dbManager.getUserBalance(userId, guildId) : null;
            await updateGameDisplay(interaction, game, balance);
            
        } else if (customId === 'yahtzee_roll') {
            // Roll dice
            if (game.rollDice()) {
                const balance = game.betAmount > 0 ? await dbManager.getUserBalance(userId, guildId) : null;
                await updateGameDisplay(interaction, game, balance);
            }
            
        } else if (customId === 'yahtzee_help') {
            await this.showHelp(interaction);
            
        } else if (customId === 'yahtzee_scorecard') {
            await this.showScorecard(interaction, game);
            
        } else if (customId === 'yahtzee_quit_game') {
            await this.quitGame(interaction, userId, guildId, sessionId);
            
        } else if (customId === 'yahtzee_play_again') {
            await this.playAgain(interaction, userId, guildId);
            
        } else if (customId === 'yahtzee_quit') {
            await this.quitGame(interaction, userId, guildId, sessionId);
        }
    },

    async handleSelectInteraction(interaction, game, sessionId) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const selectedValue = interaction.values[0];

        await interaction.deferUpdate();

        if (interaction.customId === 'yahtzee_score_category') {
            // Score the selected category
            if (game.scoreCategory(selectedValue)) {
                logger.info(`User ${userId} scored category ${selectedValue} in Yahtzee`);
                
                // Check if game is complete
                if (game.gameEnded) {
                    await this.endGame(interaction, userId, guildId, sessionId);
                } else {
                const balance = game.betAmount > 0 ? await dbManager.getUserBalance(userId, guildId) : null;
                    await updateGameDisplay(interaction, game, balance);
                }
            }
        }
    },

    async endGame(interaction, userId, guildId, sessionId) {
        try {
            const gameData = activeGames.get(userId);
            if (!gameData) return;

            const { game } = gameData;
            const result = game.getResult();

            // Compute payout (SessionManager will handle the credit)
            let payout = 0;
            let balanceChange = 0;
            if (game.betAmount > 0) {
                payout = result.payout;
                balanceChange = payout - game.betAmount;
            }

            // Update display with final results
            const balance = game.betAmount > 0 ? await dbManager.getUserBalance(userId, guildId) : null;
            await updateGameDisplay(interaction, game, balance);

            // End session (process payout + clear flags)
            await sessionManager.endSession(sessionId, { payout, won: !!result.won, reason: 'completed' });

            // Add XP
            if (game.betAmount > 0) {
                const xpGained = await levelingSystem.addGameXP(
                    userId,
                    guildId,
                    result.won ? 'win' : 'loss',
                    game.betAmount,
                    'yahtzee'
                );
            }

            // Cleanup
            activeGames.delete(userId);
            TimeoutManager.clearTimeout(userId);

            // Log game end
            const playForRecipient = global.playForContext?.recipientName;
            const winningForSomeoneElse = playForRecipient && global.playForContext.recipientId;
            
            logger.info(`User ${userId} finished Yahtzee: ${result.outcome}, score: ${result.score}, payout: ${payout}${winningForSomeoneElse ? ` for @${playForRecipient}` : ''}`);
            await sendLogMessage(guildId, 
                `🎲 **Yahtzee Completed${winningForSomeoneElse ? ` for @${playForRecipient}` : ''}**\n` +
                `User: ${interaction.user.tag}\n` +
                `Score: ${result.score} points\n` +
                `Result: ${result.outcome}\n` +
                `Bet: ${fmt(game.betAmount)}\n` +
                `Payout: ${fmt(payout)}\n` +
                `Net: ${fmtDelta(balanceChange)}${winningForSomeoneElse ? `\nPlaying for: @${playForRecipient}` : ''}`
            );

        } catch (error) {
            logger.error(`Error ending Yahtzee game: ${error.message}`);
        }
    },

    async quitGame(interaction, userId, guildId, sessionId) {
        try {
            const gameData = activeGames.get(userId);
            if (!gameData) return;

            const { game } = gameData;

            // Refund bet if game just started (no dice rolled)
            let refund = 0;
            if (game.rollsLeft === 3 && game.currentRound === 1) {
                refund = game.betAmount;
            }

            // End session
            await sessionManager.endSession(sessionId, { payout: refund, reason: 'cancelled' });

            // Cleanup
            activeGames.delete(userId);
            TimeoutManager.clearTimeout(userId);

            // Update message
            const embed = new EmbedBuilder()
                .setTitle('🎲 Yahtzee Game Quit')
                .setDescription(`Game ended by ${interaction.user.displayName}`)
                .addFields(
                    { name: '🎯 Final Score', value: `${game.totalScore} points`, inline: true },
                    { name: '💰 Refund', value: fmt(refund), inline: true }
                )
                .setColor(0x808080)
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed],
                components: []
            });

            logger.info(`User ${userId} quit Yahtzee game, refund: ${refund}`);

        } catch (error) {
            logger.error(`Error quitting Yahtzee game: ${error.message}`);
        }
    },

    async playAgain(interaction, userId, guildId) {
        try {
            // Clear existing game
            if (activeGames.has(userId)) {
                activeGames.delete(userId);
                TimeoutManager.clearTimeout(userId);
            }

            // Start new game with same bet amount
            const gameData = activeGames.get(userId);
            const previousBet = gameData ? gameData.game.betAmount : 0;

            // Trigger new game
            await interaction.followUp({
                content: `Starting new Yahtzee game with bet: ${fmt(previousBet)}`,
                ephemeral: true
            });

            // Would redirect to execute method, but that's not easily accessible here
            // User would need to use /yahtzee command again

        } catch (error) {
            logger.error(`Error starting new Yahtzee game: ${error.message}`);
        }
    },

    async showHelp(interaction) {
        const helpEmbed = new EmbedBuilder()
            .setTitle('🎲 Yahtzee Rules & Help')
            .setDescription('Learn how to play Yahtzee!')
            .addFields(
                {
                    name: '🎯 Objective',
                    value: 'Score points by rolling five dice to make various combinations across 13 categories.',
                    inline: false
                },
                {
                    name: '🎲 How to Play',
                    value: '• Roll up to 3 times per turn\n• Click dice to keep/release them\n• Choose a scoring category\n• Complete all 13 categories to finish',
                    inline: false
                },
                {
                    name: '📊 Upper Section (1s-6s)',
                    value: 'Score sum of matching dice\nGet 63+ points for 35 point bonus',
                    inline: true
                },
                {
                    name: '📈 Lower Section',
                    value: '3/4 of a kind: Sum of all dice\nFull House: 25 pts\nStraights: 30/40 pts\nYahtzee: 50 pts\nChance: Sum of all dice',
                    inline: true
                },
                {
                    name: '🎊 Bonus Yahtzees',
                    value: 'Multiple Yahtzees earn 100 bonus points each and act as jokers!',
                    inline: false
                }
            )
            .setColor(0x0099FF)
            .setTimestamp()
            .setFooter({ text: 'ATIVE Casino • Yahtzee Help' });

        await interaction.followUp({
            embeds: [helpEmbed],
            ephemeral: true
        });
    },

    async showScorecard(interaction, game) {
        try {
            const gameState = game.getGameState();
            const scorecardImage = await diceRenderer.renderScorecard(gameState.scorecard, gameState.potentialScores);
            
            const attachment = new AttachmentBuilder(scorecardImage, { name: 'yahtzee_scorecard.png' });
            
            const embed = new EmbedBuilder()
                .setTitle('🎲 Yahtzee Scorecard')
                .setDescription('Current scores and potential points')
                .setImage('attachment://yahtzee_scorecard.png')
                .setColor(0x0099FF)
                .setTimestamp();

            await interaction.followUp({
                embeds: [embed],
                files: [attachment],
                ephemeral: true
            });
            
        } catch (error) {
            logger.warn(`Failed to show scorecard image: ${error.message}`);
            
            // Fallback to text scorecard
            const gameState = game.getGameState();
            const scorecard = gameState.scorecard;
            
            let scorecardText = '**UPPER SECTION**\n';
            const upperCategories = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
            upperCategories.forEach(category => {
                const score = scorecard.scores[category];
                scorecardText += `${CATEGORY_NAMES[category]}: ${score !== null ? score : '—'}\n`;
            });
            
            scorecardText += `\nSubtotal: ${scorecard.upperSectionScore}`;
            if (scorecard.upperSectionBonus > 0) {
                scorecardText += ` (+${scorecard.upperSectionBonus} bonus)`;
            }
            
            scorecardText += '\n\n**LOWER SECTION**\n';
            const lowerCategories = ['three_of_a_kind', 'four_of_a_kind', 'full_house', 'small_straight', 'large_straight', 'yahtzee', 'chance'];
            lowerCategories.forEach(category => {
                const score = scorecard.scores[category];
                scorecardText += `${CATEGORY_NAMES[category]}: ${score !== null ? score : '—'}\n`;
            });
            
            scorecardText += `\n**TOTAL: ${scorecard.totalScore}**`;
            
            const embed = new EmbedBuilder()
                .setTitle('🎲 Yahtzee Scorecard')
                .setDescription(scorecardText)
                .setColor(0x0099FF)
                .setTimestamp();

            await interaction.followUp({
                embeds: [embed],
                ephemeral: true
            });
        }
    },

    async handleGameTimeout(userId, guildId) {
        try {
            const gameData = activeGames.get(userId);
            if (!gameData) return;

            const { game, sessionId } = gameData;
            
            // Refund bet if game barely started
            let refund = 0;
            if (game.rollsLeft === 3 && game.currentRound === 1) {
                refund = game.betAmount;
            }

            // End session
            await sessionManager.endSession(sessionId, { payout: refund, reason: 'timeout' });

            // Cleanup
            activeGames.delete(userId);

            logger.info(`Yahtzee game timed out for user ${userId}, refund: ${refund}`);

        } catch (error) {
            logger.error(`Error handling Yahtzee timeout: ${error.message}`);
        }
    }
};
