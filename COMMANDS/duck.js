/**
 * Duck Game command for ATIVE Casino Bot
 * Cross the road without getting hit by cars!
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { PayoutManager, GameType, GameResult, TimeoutManager } = require('../UTILS/gameUtils');
const { fmt, fmtDelta, getGuildId, sendLogMessage } = require('../UTILS/common');
const { buildSessionEmbed, buildButtons } = require('../UTILS/gameSessionKit');
const { getSecureHazard } = require('../UTILS/rng');
// sessionManager removed (Firebase dependency) - using mock implementation
const sessionManager = {
    getAllActiveSessions: () => [],
    getSessionStats: () => ({ active: 0, total: 0 }),
    getActiveSessionCount: () => 0,
    getUserSessions: (userId) => [],
    getSession: (sessionId) => null,
    endSession: async (sessionId) => ({ success: true }),
    cancelSession: async (sessionId, reason) => ({ success: true }),
    cancelUserSessions: async (userId, reason) => ({ success: true })
};
const SMGameType = { DUCK: 'duck' };
const GameSessionIntegrator = require('../UTILS/gameSessionIntegrator');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');
const Canvas = require('canvas');
const path = require('path');

// Active games storage
const activeGames = new Map();

// Game mode configurations
const GAME_MODES = {
    'Easy': { 
        lanes: 7, 
        multipliers: [1.10, 1.15, 1.25, 1.90, 2.20, 2.25, 2.40],
        color: 0x00FF00,
        emoji: '🟢'
    },
    'Medium': { 
        lanes: 5, 
        multipliers: [1.05, 1.25, 1.70, 2.00, 2.40],
        color: 0xFFFF00,
        emoji: '🟡'
    },
    'Hard': { 
        lanes: 3, 
        multipliers: [1.50, 2.25, 3.00],
        color: 0xFF0000,
        emoji: '🔴'
    }
};

/**
 * Load image asset with fallback
 */
async function loadImageAsset(imagePath, fallbackSize = { width: 256, height: 256 }) {
    try {
        const image = await Canvas.loadImage(imagePath);
        return image;
    } catch (error) {
        logger.warn(`Failed to load image at ${imagePath}, using fallback`);
        // Create solid color fallback
        const canvas = Canvas.createCanvas(fallbackSize.width, fallbackSize.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#808080'; // Gray fallback
        ctx.fillRect(0, 0, fallbackSize.width, fallbackSize.height);
        return canvas;
    }
}

/**
 * Center and paste an image onto a canvas
 */
function centerPaste(ctx, image, x, y, width, height) {
    const imageAspect = image.width / image.height;
    const boxAspect = width / height;
    
    let drawWidth = width;
    let drawHeight = height;
    let drawX = x;
    let drawY = y;
    
    // Maintain aspect ratio while fitting in the box
    if (imageAspect > boxAspect) {
        drawHeight = width / imageAspect;
        drawY = y + (height - drawHeight) / 2;
    } else {
        drawWidth = height * imageAspect;
        drawX = x + (width - drawWidth) / 2;
    }
    
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

/**
 * Generate duck game board image using actual assets
 */
async function generateDuckGameImage(position, hazardPos, totalLanes) {
    try {
        const assetsPath = path.join(__dirname, '..', 'assets', 'duck');
        
        // Load all assets
        const grassImage = await loadImageAsset(path.join(assetsPath, 'road', 'Grass.png'));
        const roadImage = await loadImageAsset(path.join(assetsPath, 'road', 'road.png'));
        const finishImage = await loadImageAsset(path.join(assetsPath, 'road', 'end.png'));
        const carImage = await loadImageAsset(path.join(assetsPath, 'road', 'car.png'));
        const duckImage = await loadImageAsset(path.join(assetsPath, 'duck.png'));
        
        // Use the road tile size as our base
        const tileWidth = roadImage.width || 256;
        const tileHeight = roadImage.height || 256;
        const totalColumns = totalLanes + 2; // grass + lanes + finish
        
        const canvas = Canvas.createCanvas(tileWidth * totalColumns, tileHeight);
        const ctx = canvas.getContext('2d');
        
        // Draw background tiles
        for (let i = 0; i < totalColumns; i++) {
            const x = i * tileWidth;
            
            if (i === 0) {
                // Grass tile
                ctx.drawImage(grassImage, x, 0, tileWidth, tileHeight);
            } else if (i === totalColumns - 1) {
                // Finish tile
                ctx.drawImage(finishImage, x, 0, tileWidth, tileHeight);
            } else {
                // Road tile
                ctx.drawImage(roadImage, x, 0, tileWidth, tileHeight);
            }
        }
        
        // Draw lane numbers for road lanes
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        
        for (let i = 1; i <= totalLanes; i++) {
            const x = i * tileWidth + tileWidth/2;
            const y = 25;
            
            // Draw text with outline for better visibility
            ctx.strokeText(i.toString(), x, y);
            ctx.fillText(i.toString(), x, y);
        }
        
        // Add START and FINISH labels
        ctx.strokeText('START', tileWidth/2, 25);
        ctx.fillText('START', tileWidth/2, 25);
        
        ctx.strokeText('FINISH', (totalColumns - 0.5) * tileWidth, 25);
        ctx.fillText('FINISH', (totalColumns - 0.5) * tileWidth, 25);
        
        // Draw duck at current position
        const duckColumn = position + 1; // Adjust for grass being column 0
        if (duckColumn >= 0 && duckColumn < totalColumns) {
            const duckX = duckColumn * tileWidth;
            const duckY = 0;
            
            // Scale duck to fit nicely in tile (about half tile size)
            const duckSize = tileWidth * 0.5;
            const duckCenterX = duckX + (tileWidth - duckSize) / 2;
            const duckCenterY = duckY + (tileHeight - duckSize) / 2;
            
            centerPaste(ctx, duckImage, duckCenterX, duckCenterY, duckSize, duckSize);
        }
        
        // Draw car hazard if at current position (crash frame)
        const showCar = hazardPos >= 0 && position === hazardPos;
        if (showCar) {
            const carColumn = hazardPos + 1;
            const carX = carColumn * tileWidth;
            const carY = 0;
            
            // Scale car to fit in tile
            const carSize = tileWidth * 0.6;
            const carCenterX = carX + (tileWidth - carSize) / 2;
            const carCenterY = carY + (tileHeight - carSize) / 2;
            
            // Rotate car 90 degrees to face vertically (like crossing traffic)
            ctx.save();
            ctx.translate(carCenterX + carSize/2, carCenterY + carSize/2);
            ctx.rotate(Math.PI / 2);
            centerPaste(ctx, carImage, -carSize/2, -carSize/2, carSize, carSize);
            ctx.restore();
        }
        
        return canvas.toBuffer('image/png');
    } catch (error) {
        logger.error(`Error generating duck game image: ${error.message}`);
        return null;
    }
}

/**
 * Mode Selection View
 */
class ModeSelectView {
    constructor(userId, betAmount, userBalance) {
        this.userId = userId;
        this.betAmount = betAmount;
        this.userBalance = userBalance;
        this.started = false;
    }

    createEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('🦆 Duck Game - Mode Selection')
            .setDescription(`**Player:** <@${this.userId}>\n**Bet Amount:** ${fmt(this.betAmount)}`)
            .setColor(0x00BFFF);

        // Add mode descriptions
        for (const [mode, config] of Object.entries(GAME_MODES)) {
            const multiplierText = config.multipliers.map(m => `x${m.toFixed(2)}`).join(', ');
            embed.addFields({
                name: `${config.emoji} ${mode} Mode (${config.lanes} lanes)`,
                value: `Multipliers: ${multiplierText}`,
                inline: false
            });
        }

        embed.setFooter({ text: `💼 Wallet: ${fmt(this.userBalance.wallet)} | 🏦 Bank: ${fmt(this.userBalance.bank)}` });
        
        return embed;
    }

    createButtons() {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`duck-mode-${this.userId}-Easy`)
                    .setLabel('🟢 Easy Mode')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`duck-mode-${this.userId}-Medium`)
                    .setLabel('🟡 Medium Mode')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`duck-mode-${this.userId}-Hard`)
                    .setLabel('🔴 Hard Mode')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`duck-cancel-${this.userId}`)
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );
    }
}

/**
 * Duck Game Session
 */
class DuckGameSession {
    constructor(userId, betAmount, userBalance, mode, guildId) {
        this.userId = userId;
        this.betAmount = betAmount;
        this.userBalance = userBalance;
        this.mode = mode;
        this.guildId = guildId;
        this.config = GAME_MODES[mode];
        this.position = -1; // Start in grass
        this.hazardPos = getSecureHazard(this.config.lanes);
        this.ended = false;
        this.currentMultiplier = 1.0;
        this.gameStarted = false;
    }

    getCurrentWinnings() {
        return this.betAmount * this.currentMultiplier;
    }

    createGameEmbed(gameState = 'GAME') {
        const topFields = [];
        
        // Game status
        let statusText = '';
        let statusEmoji = '🦆';
        
        if (this.position === -1) {
            statusText = 'Duck is ready to cross the road!';
        } else if (this.ended) {
            if (this.position === this.hazardPos) {
                statusText = 'Duck got hit by a car! 💥';
                statusEmoji = '💥';
            } else {
                statusText = this.position >= this.config.lanes ? 
                    'Duck reached the finish line! 🏁' : 'Duck cashed out safely! 💰';
                statusEmoji = this.position >= this.config.lanes ? '🏁' : '💰';
            }
        } else {
            statusText = `Duck is on lane ${this.position + 1}/${this.config.lanes}`;
        }

        topFields.push({
            name: `${statusEmoji} Game Status`,
            value: statusText,
            inline: false
        });

        // Banking fields
        const bankFields = [
            { name: '💰 Current Winnings', value: fmt(this.getCurrentWinnings()), inline: true },
            { name: '📊 Multiplier', value: `x${this.currentMultiplier.toFixed(2)}`, inline: true },
            { name: '💵 Wallet', value: fmt(this.userBalance.wallet), inline: true }
        ];

        // Determine color based on game state
        let color = this.config.color;
        if (this.ended) {
            if (this.position === this.hazardPos) {
                color = 0xFF0000; // Red for crash
            } else {
                color = 0x00FF00; // Green for win/cashout
            }
        }

        return buildSessionEmbed({
            title: `🦆 ${this.mode} Duck Game`,
            topFields,
            bankFields,
            stageText: gameState,
            color,
            footer: this.ended ? 'Game completed' : 'Choose your action'
        });
    }

    createButtons() {
        if (this.ended) return [];

        const buttons = [];
        
        // Forward button - always available when game not ended
        buttons.push({
            id: 'forward',
            label: 'Forward →',
            style: ButtonStyle.Success
        });

        // Stop button - only available once duck is on lanes
        if (this.position >= 0) {
            buttons.push({
                id: 'stop',
                label: 'Stop & Cash Out',
                style: ButtonStyle.Danger
            });
        }

        // Help button
        buttons.push({
            id: 'help',
            label: '?',
            style: ButtonStyle.Secondary
        });

        return buildButtons(`duck-${this.userId}`, buttons);
    }

    async moveForward() {
        this.gameStarted = true;
        this.position++;

        // Update multiplier based on current position
        if (this.position >= 0 && this.position < this.config.multipliers.length) {
            this.currentMultiplier = this.config.multipliers[this.position];
        }

        // Check if reached finish line
        if (this.position >= this.config.lanes) {
            this.currentMultiplier = this.config.multipliers[this.config.multipliers.length - 1];
            this.ended = true;
            return 'finish';
        }

        // Check if hit hazard
        if (this.position === this.hazardPos) {
            this.ended = true;
            return 'crash';
        }

        return 'safe';
    }

    async cashOut() {
        this.gameStarted = true;
        this.ended = true;
        return 'cashout';
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('duck')
        .setDescription('🦆 Cross the road without getting hit by cars!')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to bet (supports K/M/B, "all", "half")')
                .setRequired(true)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const amount = interaction.options.getString('amount');
        const guildId = await getGuildId(interaction);

        try {
            // Validate session before proceeding
            const sessionValidation = await GameSessionIntegrator.validateGameSession(userId, SMGameType.DUCK, guildId);
            if (!sessionValidation.valid) {
                const errorEmbed = GameSessionIntegrator.createValidationErrorEmbed(username, 'duck', sessionValidation);
                return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Check if user already has an active duck game
            if (activeGames.has(userId)) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Game Already Active')
                    .setDescription('You already have an active duck game.')
                    .setColor(0xFF0000);
                
                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            // Ensure user exists and get balance
            await dbManager.ensureUser(userId, username);
            const userBalance = await dbManager.getUserBalance(userId, guildId);

            // Validate and deduct bet
            const validation = await PayoutManager.validateAndDeductBet(
                interaction,
                amount,
                GameType.DUCK_GAME,
                1,        // Min bet: $1
                100000    // Max bet: $100K
            );

            if (!validation.isValid) {
                return await interaction.reply({ embeds: [validation.errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const betAmount = validation.parsedAmount;

            // Create mode selection view
            const modeSelect = new ModeSelectView(userId, betAmount, userBalance);
            const embed = modeSelect.createEmbed();
            const actionRow = modeSelect.createButtons();

            await interaction.reply({
                embeds: [embed],
                components: [actionRow]
            });

            // Create temporary session for mode selection
            const sessionResult = await GameSessionIntegrator.createGameSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: SMGameType.DUCK_GAME,
                betAmount,
                timeout: 120000, // 2 minutes
                metadata: {
                    gamePhase: 'mode_selection',
                    gameStarted: false
                },
                interaction
            });
            
            if (!sessionResult.success) {
                throw new Error(`Session creation failed: ${sessionResult.error}`);
            }
            
            // Store the mode selection temporarily
            activeGames.set(sessionResult.sessionId, { type: 'mode_select', betAmount, userBalance, guildId, sessionId: sessionResult.sessionId });

            // Log game start
            await sendLogMessage(
                interaction.client,
                'game',
                `Duck game initiated: ${interaction.user.displayName} bet ${fmt(betAmount)}`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error in duck command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Game Error')
                .setDescription('An error occurred while starting the duck game. Please try again.')
                .setColor(0xFF0000);

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    },

    // Mode selection handler
    async handleModeSelect(interaction, mode) {
        const userId = interaction.user.id;
        const gameData = activeGames.get(userId);

        if (!gameData || gameData.type !== 'mode_select') {
            return await interaction.reply({ 
                content: 'No active mode selection found.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        if (!GAME_MODES[mode]) {
            return await interaction.reply({ 
                content: 'Invalid game mode selected.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        // Clear mode selection timeout
        TimeoutManager.clearTimeout(userId);

        // Create game session
        const gameSession = new DuckGameSession(
            userId, 
            gameData.betAmount, 
            gameData.userBalance, 
            mode, 
            gameData.guildId
        );

        activeGames.set(userId, gameSession);

        // Create initial game image
        const gameImage = await generateDuckGameImage(gameSession.position, -1, gameSession.config.lanes);
        
        const embed = gameSession.createGameEmbed();
        const actionRow = gameSession.createButtons();

        const updateData = {
            embeds: [embed],
            components: [actionRow]
        };

        if (gameImage) {
            updateData.files = [{ attachment: gameImage, name: 'duck-game.png' }];
            embed.setImage('attachment://duck-game.png');
        }

        await interaction.update(updateData);

        // Set game timeout (5 minutes)
        TimeoutManager.setTimeout(userId, 300, async () => {
            if (activeGames.has(userId)) {
                const session = activeGames.get(userId);
                if (!session.gameStarted) {
                    activeGames.delete(userId);
                    await PayoutManager.refundBet(userId, session.guildId, session.betAmount, 'Game timeout');
                }
            }
        });
    },

    // Game cancel handler  
    async handleCancel(interaction) {
        const userId = interaction.user.id;
        const gameData = activeGames.get(userId);

        if (!gameData) {
            return await interaction.reply({ 
                content: 'No active game found.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        const betAmount = gameData.betAmount || gameData.betAmount;
        const guildId = gameData.guildId;

        // Clear timeout and refund
        TimeoutManager.clearTimeout(userId);
        activeGames.delete(userId);

        await PayoutManager.refundBet(userId, guildId, betAmount, 'Game cancelled');

        const embed = new EmbedBuilder()
            .setTitle('🦆 Duck Game - Cancelled')
            .setDescription(`Game cancelled. Your bet of ${fmt(betAmount)} has been refunded.`)
            .setColor(0xFF6600);

        await interaction.update({
            embeds: [embed],
            components: []
        });
    },

    // Game action handlers
    async handleGameAction(interaction, actionId) {
        const userId = interaction.user.id;
        const gameSession = activeGames.get(userId);

        if (!gameSession || gameSession.type === 'mode_select') {
            return await interaction.reply({ 
                content: 'No active duck game found.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        switch (actionId) {
            case 'forward':
                await this.handleForward(interaction, gameSession);
                break;
            case 'stop':
                await this.handleStop(interaction, gameSession);
                break;
            case 'help':
                await this.handleHelp(interaction);
                break;
        }
    },

    async handleForward(interaction, gameSession) {
        const result = await gameSession.moveForward();
        
        let gameImage;
        let content = '';

        if (result === 'crash') {
            // Show crash image with car
            gameImage = await generateDuckGameImage(
                gameSession.position, 
                gameSession.hazardPos, 
                gameSession.config.lanes
            );
            content = '💥 **CRASH!** The duck got hit by a car!';
            await this.endGame(interaction, gameSession, false, 0);
        } else if (result === 'finish') {
            // Show finish image
            gameImage = await generateDuckGameImage(
                gameSession.config.lanes, 
                -1, 
                gameSession.config.lanes
            );
            content = `🏁 **FINISH!** You won ${fmt(gameSession.getCurrentWinnings())}!`;
            await this.endGame(interaction, gameSession, true, gameSession.getCurrentWinnings());
        } else {
            // Safe move - show current position
            gameImage = await generateDuckGameImage(
                gameSession.position, 
                -1, 
                gameSession.config.lanes
            );
        }

        const embed = gameSession.createGameEmbed(
            result === 'crash' ? 'CRASHED' : 
            result === 'finish' ? 'WINNER' : 'GAME'
        );
        const actionRow = gameSession.createButtons();

        const updateData = {
            content,
            embeds: [embed],
            components: gameSession.ended ? [] : [actionRow]
        };

        if (gameImage) {
            updateData.files = [{ attachment: gameImage, name: 'duck-game.png' }];
            embed.setImage('attachment://duck-game.png');
        }

        await interaction.update(updateData);
    },

    async handleStop(interaction, gameSession) {
        await gameSession.cashOut();
        
        const winnings = gameSession.getCurrentWinnings();
        const gameImage = await generateDuckGameImage(
            gameSession.position, 
            -1, 
            gameSession.config.lanes
        );

        const content = `💰 **CASHED OUT!** You won ${fmt(winnings)}!`;
        
        await this.endGame(interaction, gameSession, true, winnings);

        const embed = gameSession.createGameEmbed('CASHED OUT');

        const updateData = {
            content,
            embeds: [embed],
            components: []
        };

        if (gameImage) {
            updateData.files = [{ attachment: gameImage, name: 'duck-game.png' }];
            embed.setImage('attachment://duck-game.png');
        }

        await interaction.update(updateData);
    },

    async handleHelp(interaction) {
        const helpEmbed = new EmbedBuilder()
            .setTitle('🦆 Duck Game Help')
            .setColor(0x0099FF)
            .setDescription('**How to Play Duck Game**')
            .addFields(
                {
                    name: '🎯 Objective',
                    value: 'Help the duck cross the road safely without getting hit by cars!',
                    inline: false
                },
                {
                    name: '🎮 Game Modes',
                    value: '• **Easy (7 lanes):** Lower risk, moderate rewards\n• **Medium (5 lanes):** Balanced risk and reward\n• **Hard (3 lanes):** High risk, high rewards',
                    inline: false
                },
                {
                    name: '🕹️ Controls',
                    value: '• **Forward →:** Move the duck forward one lane\n• **Stop & Cash Out:** Stop and collect current winnings',
                    inline: false
                },
                {
                    name: '⚠️ Hazards',
                    value: 'One random lane has a car. If the duck hits it, you lose your bet!',
                    inline: false
                },
                {
                    name: '🏆 Winning',
                    value: 'Each lane crossed increases your multiplier. Cash out anytime or reach the finish for maximum payout!',
                    inline: false
                }
            )
            .setFooter({ text: '🍀 Good luck crossing the road!' });

        await interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
    },

    async endGame(interaction, gameSession, won, payout) {
        try {
            // Process payout
            const gameResult = new GameResult({
                userId: gameSession.userId,
                guildId: gameSession.guildId,
                gameType: GameType.DUCK_GAME,
                betAmount: gameSession.betAmount,
                payout: payout,
                won: won
            });

            if (won && payout > 0) {
                await PayoutManager.processGamePayout(gameResult);
            }

            // Clean up
            activeGames.delete(gameSession.userId);
            TimeoutManager.clearTimeout(gameSession.userId);

            // Log game end
            await sendLogMessage(
                interaction.client,
                'game',
                `Duck game ended: ${interaction.user.displayName} ${won ? 'won' : 'lost'} ${fmt(Math.abs(payout - gameSession.betAmount))}`,
                gameSession.userId,
                gameSession.guildId
            );

        } catch (error) {
            logger.error(`Error ending duck game: ${error.message}`);
        }
    }
};