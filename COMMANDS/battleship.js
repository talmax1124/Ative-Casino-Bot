/**
 * Battleship Command Handler - Refactored and simplified
 * Enhanced with Canvas rendering and proper Discord interaction handling
 */

const { 
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder,
    StringSelectMenuBuilder
} = require('discord.js');

const path = require('path');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const logger = require('../UTILS/logger');
const battleshipRenderer = require('../UTILS/battleshipRenderer');
const UITemplates = require('../UTILS/uiTemplates');
const sessionManager = require('../UTILS/sessionManager');

const levelingSystem = require('../UTILS/levelingSystem'); // Moved to UAS bot - using stub
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');

const {
    BattleshipGameSession,
    createBattleshipGame,
    getBattleshipGame,
    removeBattleshipGame,
    getUserGame,
    BOARD_SIZE,
    SHIPS,
    HORIZONTAL,
    VERTICAL,
} = require('../GAMES/battleship');

// Helper functions
function parseCoordinate(input) {
    const v = (input || '').trim().toUpperCase();
    if (!v || v.length < 2 || v.length > 3) return null;
    const colLetter = v[0];
    const rowStr = v.slice(1);
    const col = colLetter.charCodeAt(0) - 'A'.charCodeAt(0);
    const row = parseInt(rowStr, 10) - 1;
    if (isNaN(row) || col < 0 || col >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE) return null;
    return { row, col, label: `${colLetter}${row + 1}` };
}

function parseDirection(input) {
    const v = (input || '').trim().toLowerCase();
    if (v === 'h' || v === 'hor' || v === 'horizontal') return HORIZONTAL;
    if (v === 'v' || v === 'ver' || v === 'vertical') return VERTICAL;
    return null;
}

async function autoPlaceAllShips(board) {
    // Reset the board first
    board.grid = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0));
    board.shipPositions.clear();
    for (const ship of board.ships) {
        ship.placed = false;
        ship.positions = [];
        ship.hits.clear();
    }
    board.currentShipIndex = 0;
    board.placementComplete = false;

    const maxAttempts = 5000;
    let attempts = 0;
    
    for (const ship of board.ships) {
        let placed = false;
        while (!placed && attempts < maxAttempts) {
            attempts++;
            const direction = Math.random() < 0.5 ? HORIZONTAL : VERTICAL;
            const startRow = Math.floor(Math.random() * BOARD_SIZE);
            const startCol = Math.floor(Math.random() * BOARD_SIZE);
            
            if (board.canPlaceShip(ship, startRow, startCol, direction)) {
                if (board.placeShip(ship, startRow, startCol, direction)) {
                    placed = true;
                }
            }
        }
        if (!placed) return false;
    }
    
    board.currentShipIndex = board.ships.length;
    board.placementComplete = true;
    return true;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('battleship')
        .setDescription('⚓ Start a two-player Battleship game')
        .addStringOption(opt =>
            opt.setName('amount')
                .setDescription('Bet amount (each player)')
                .setRequired(true)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const channelId = interaction.channelId;
        const guildId = await getGuildId(interaction);
        const username = interaction.user.displayName;

        try {
            logger.debug(`Battleship execute called by ${username} (${userId}) in guild ${guildId}`);
            // Session guard check
            const sessionGuard = require('../UTILS/sessionGuard');
            const check = await sessionGuard.check(userId, guildId, 'battleship', interaction.client);
            if (!check.allowed) {
                const embed = UITemplates.createErrorEmbed('❌ Session Error', check.message);
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }
            // Prevent multiple games in same channel
            const existing = getBattleshipGame(channelId);
            if (existing) {
                const playerList = Array.from(existing.players.values())
                    .map((u, i) => `${i + 1}. ${u.displayName}`)
                    .join('\n');
                    
                const embed = UITemplates.createErrorEmbed(
                    '❌ Game Already Active',
                    `A Battleship game is already running here.\n\n**Players:**\n\`\`\`${playerList}\`\`\``
                );
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Validate and deduct bet amount using PayoutManager
            const amountStr = interaction.options.getString('amount');
            const MIN_BET = 100;
            const MAX_BET = 1000000;
            
            const validation = await PayoutManager.validateAndDeductBet(
                interaction,
                amountStr,
                GameType.BATTLESHIP,
                MIN_BET,
                150000
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
                gameType: 'battleship',
                betAmount,
                betPreDeducted: true,
                timeout: 900000, // 15 minutes for Battleship
                metadata: {
                    gamePhase: 'lobby',
                    multiplayer: true,
                    battleshipGame: true
                },
                interaction
            });
            
            if (!sessionResult.success) {
                const embed = UITemplates.createErrorEmbed('❌ Session Error', `Failed to create game session: ${sessionResult.error}`);
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Bet already deducted by PayoutManager

            // Create game
            const game = createBattleshipGame(channelId, interaction.user, betAmount);
            if (!game) {
                // Handle game error with session cleanup and refund
                try {
                    const userSession = sessionManager.getUserActiveSession(userId);
                    if (userSession) {
                        await sessionManager.cancelSession(userSession.sessionId, 'Battleship game creation error', true);
                    }
                } catch (sessionError) {
                    logger.error(`Failed to handle battleship session error: ${sessionError.message}`);
                }
                return;
            }
            
            // Store session ID in game
            game.sessionId = sessionResult.sessionId;

            const embed = game.createLobbyEmbed();
            const components = game.createGameButtons();
            
            // Skip banner attachment due to size limitations (11MB file)
            const msg = await interaction.reply({ embeds: [embed], components });
            const fetchedMsg = await interaction.fetchReply();
            game.message = fetchedMsg;
            
            logger.info(`Battleship game created by ${username} (${userId}) bet ${betAmount} in channel ${channelId}`);

        } catch (error) {
            logger.error(`Battleship /execute error: ${error.message}`);
            try {
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `Battleship error for ${interaction.user.tag} (${userId}) — ${error.message}`,
                    userId,
                    guildId
                );
            } catch (_) {}
            const embed = UITemplates.createErrorEmbed('❌ Game Error', 'Failed to start Battleship game.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    },

    async handleButtonInteraction(interaction, action) {
        const userId = interaction.user.id;
        const channelId = interaction.channelId;
        const guildId = await getGuildId(interaction);
        
        const game = getBattleshipGame(channelId);
        if (!game) {
            const embed = UITemplates.createErrorEmbed('❌ No Active Game', 'No active Battleship game found in this channel.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        try {
            switch (action) {
                case 'join':
                    await this.handleJoin(interaction, game, channelId, guildId);
                    break;
                    
                case 'start':
                    await this.handleStart(interaction, game);
                    break;
                    
                case 'ship_placement':
                    await this.handleShipPlacement(interaction, game);
                    break;
                    
                case 'attack':
                    await this.handleAttack(interaction, game);
                    break;
                
                case 'view_ships':
                    await this.handleViewShips(interaction, game);
                    break;
                
                case 'fire':
                    await this.handleUnifiedFire(interaction, game);
                    break;
                    
                case 'view_board':
                    await this.handleViewBoard(interaction, game);
                    break;
                    
                case 'view_panel':
                    // Just acknowledge the interaction since main panel is already visible
                    await interaction.reply({ 
                        content: '👆 The main game panel is located above. Use the Attack button to make your move!',
                        flags: MessageFlags.Ephemeral 
                    });
                    break;
                    
                case 'help':
                    const helpEmbed = BattleshipGameSession.createHelpEmbed();
                    await interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
                    break;
                    
                case 'place_ship':
                    await this.handlePlaceShip(interaction, game);
                    break;
                    
                case 'auto_place':
                    await this.handleAutoPlace(interaction, game);
                    break;
                    
                case 'ready':
                    await this.handleReady(interaction, game);
                    break;
                    
                default:
                    // Handle dynamic button IDs with user IDs
                    if (action.startsWith('confirm_placement_')) {
                        await this.handleConfirmPlacement(interaction, game);
                    } else if (action.startsWith('cancel_placement_')) {
                        await this.handleCancelPlacement(interaction);
                    } else if (action.startsWith('fire_attack_')) {
                        await this.handleFireAttack(interaction, game);
                    } else if (action.startsWith('cancel_attack_')) {
                        await this.handleCancelAttack(interaction);
                    } else {
                        const embed = UITemplates.createErrorEmbed('❌ Unknown Action', 'Unknown Battleship action.');
                        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                    }
            }

        } catch (error) {
            logger.error(`Battleship button error (${action}): ${error.message}`);
            try {
                await sendLogMessage(
                    interaction.client,
                    'error',
                    `Battleship action error (${action}) for ${interaction.user.tag} (${userId}) — ${error.message}`,
                    userId,
                    guildId
                );
            } catch (_) {}
            const embed = UITemplates.createErrorEmbed('❌ Button Error', 'Error processing button action.');
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        }
    },

    async handleJoin(interaction, game, channelId, guildId) {
        const userId = interaction.user.id;
        
        if (game.state !== 'lobby') {
            const embed = UITemplates.createErrorEmbed('❌ Game Started', 'Game has already started.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }
        
        if (game.players.has(userId)) {
            const embed = UITemplates.createErrorEmbed('❌ Already Joined', 'You are already in this game.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }
        
        if (game.players.size >= 2) {
            const embed = UITemplates.createErrorEmbed('❌ Game Full', 'Game is full (2 players maximum).');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Validate and deduct bet amount using PayoutManager for joining player
        const joinValidation = await PayoutManager.validateAndDeductBet(
            interaction,
            game.betAmount.toString(),
            GameType.BATTLESHIP,
            100, // MIN_BET
            150000 // MAX_BET
        );
        
        if (!joinValidation.isValid) {
            await interaction.reply({
                embeds: [joinValidation.errorEmbed],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Check if user is in another game
        const activeGame = getUserGame(userId);
        if (activeGame) {
            const embed = UITemplates.createErrorEmbed('❌ Already In Game', 'You are already in another game! Finish it first.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Create session for joining player (guarded)
        const sessionGuard = require('../UTILS/sessionGuard');
        const check = await sessionGuard.check(userId, guildId, 'battleship', interaction.client);
        if (!check.allowed) {
            const embed2 = UITemplates.createErrorEmbed('❌ Session Error', check.message);
            await interaction.reply({ embeds: [embed2], flags: MessageFlags.Ephemeral });
            return;
        }
        // Proceed to create session
        const sessionResult = await sessionManager.createSession({
            userId,
            guildId,
            channelId,
            gameType: 'battleship',
            betAmount: game.betAmount,
            betPreDeducted: true,
            timeout: 900000, // 15 minutes for Battleship
            metadata: {
                gamePhase: 'active',
                multiplayer: true,
                battleshipGame: true
            },
            interaction
        });
        
        if (!sessionResult.success) {
            const embed = UITemplates.createErrorEmbed('❌ Session Error', `Failed to create game session: ${sessionResult.error}`);
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Add player (bet already deducted by PayoutManager)
        const success = game.addPlayer(interaction.user);
        
        if (!success) {
            // Refund on failure using PayoutManager
            await PayoutManager.refundBet(userId, guildId, game.betAmount, 'Failed to join Battleship game');
            const embed = UITemplates.createErrorEmbed('❌ Join Failed', 'Failed to join the game.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Update game display
        const embed = game.createLobbyEmbed();
        const components = game.createGameButtons();
        // Skip banner attachment due to size limitations (11MB file)
        await interaction.update({ embeds: [embed], components });
        
        if (game.players.size === 2) {
            await interaction.followUp({ 
                content: '⚓ **All aboard!** Game is ready to start. Host can begin the battle!',
                flags: MessageFlags.Ephemeral 
            });
        }
    },

    async handleStart(interaction, game) {
        if (interaction.user.id !== game.hostUser.id) {
            const embed = UITemplates.createErrorEmbed('❌ Host Only', 'Only the host can start the game.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }
        
        if (!game.canStart()) {
            const embed = UITemplates.createErrorEmbed('❌ Cannot Start', 'Need exactly 2 players to start.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }
        
        // Start with automatic ship placement
        const success = game.startPlacement();
        if (!success) {
            const embed = UITemplates.createErrorEmbed('❌ Error', 'Failed to start game. Please try again.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }
        
        // Game is now in playing state with auto-placed ships
        const { embed, battleImage } = await game.createBattleEmbed();
        const components = game.createGameButtons();
        
        // Store game message reference
        game.message = interaction.message;
        
        await interaction.update({ embeds: [embed], components });
        
        // Notify current player it's their turn
        const currentPlayer = game.players.get(game.currentTurn);
        await interaction.followUp({
            content: `⚓ **Battle Started!** <@${game.currentTurn}>, it's your turn to attack! Click the Attack button.`,
            allowedMentions: { users: [game.currentTurn] }
        });
    },

    async handleShipPlacement(interaction, game) {
        const userId = interaction.user.id;
        
        if (!game.players.has(userId)) {
            const embed = UITemplates.createErrorEmbed('❌ Not In Game', 'You are not a player in this game.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }
        
        if (game.state !== 'placing') {
            const embed = UITemplates.createErrorEmbed('❌ Wrong Phase', 'Ship placement is not available right now.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        const playerBoard = game.boards.get(userId);
        const currentShip = playerBoard.getCurrentShip();
        const allShipsPlaced = playerBoard.allShipsPlaced();

        // Create board image
        const title = allShipsPlaced ? 'Fleet Ready for Battle!' : `Place: ${currentShip.name} (${currentShip.length} spaces)`;
        const buffer = await playerBoard.getBoardImage({ title: `${interaction.user.displayName} — ${title}`, showShips: true });
        const attachment = new AttachmentBuilder(buffer, { name: 'placement.png' });

        // Create placement panel buttons
        const currentShipName = allShipsPlaced ? 'All Ships' : currentShip.name;
        
        const placeBtn = new ButtonBuilder()
            .setCustomId('battleship_place_ship')
            .setLabel(`🎯 Position ${currentShipName}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(allShipsPlaced);
            
        const autoBtn = new ButtonBuilder()
            .setCustomId('battleship_auto_place')
            .setLabel('⚡ Quick Deploy Remaining')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(allShipsPlaced);
            
        const readyBtn = new ButtonBuilder()
            .setCustomId('battleship_ready')
            .setLabel('⚓ Fleet Ready - Enter Battle!')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!allShipsPlaced);

        const row = new ActionRowBuilder().addComponents(placeBtn, autoBtn, readyBtn);

        // Create placement embed
        const placementEmbed = buildSessionEmbed({
            title: '⚓ Ship Placement Command Center',
            stageText: allShipsPlaced
                ? `Status: All ships deployed successfully! Click "Ready for Battle" to confirm setup`
                : `Current Ship: ${currentShip.name} (${currentShip.length} spaces) - Use "Place Ship" to position manually`,
            topFields: [
                { name: '📍 Manual Placement', value: 'Select coordinates\nChoose direction\nPrecision control', inline: true },
                { name: '🎲 Auto Placement', value: 'Instant deployment\nRandom positioning\nQuick setup', inline: true },
                { name: '⚓ Fleet Status', value: allShipsPlaced ? '✅ Ready for Battle' : `${playerBoard.ships.filter(s => s.placed).length}/5 ships`, inline: true }
            ],
            color: allShipsPlaced ? 0x00FF00 : 0xFFA500,
            footer: 'Private ship placement • Strategic deployment'
        }).setImage('attachment://placement.png');

        await interaction.reply({ embeds: [placementEmbed], files: [attachment], components: [row], flags: MessageFlags.Ephemeral });
    },

    async handleAttack(interaction, game) {
        const userId = interaction.user.id;
        
        if (!game.players.has(userId)) {
            const embed = UITemplates.createErrorEmbed('❌ Not In Game', 'You are not a player in this game.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }
        
        if (game.state !== 'playing') {
            const embed = UITemplates.createErrorEmbed('❌ Wrong Phase', 'The battle has not started yet.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }
        
        if (game.currentTurn !== userId) {
            const embed = UITemplates.createErrorEmbed('❌ Not Your Turn', 'Wait for your turn to attack.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Show attack modal for coordinate input
        const modal = new ModalBuilder()
            .setCustomId(`battleship_attack_modal_${game.channelId}`)
            .setTitle('🎯 Enter Attack Coordinates');
            
        const coordinateInput = new TextInputBuilder()
            .setCustomId('coordinates')
            .setLabel('Target Coordinates (e.g., A5, B3, J10)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter coordinates like: A5')
            .setMinLength(2)
            .setMaxLength(3)
            .setRequired(true);
            
        const actionRow = new ActionRowBuilder().addComponents(coordinateInput);
        modal.addComponents(actionRow);
        
        await interaction.showModal(modal);
    },

    async handleViewShips(interaction, game) {
        const userId = interaction.user.id;
        
        if (!game.players.has(userId)) {
            const embed = UITemplates.createErrorEmbed('❌ Not In Game', 'You are not a player in this game.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        const playerBoard = game.boards.get(userId);
        const opponentId = game.getOpponent(userId);
        const opponentBoard = opponentId ? game.boards.get(opponentId) : null;

        // Create ship status view
        const shipStatus = playerBoard.ships.map(ship => {
            const hits = ship.getHitCount();
            const status = ship.isSunk() ? '💥 SUNK' : hits > 0 ? `🔥 Damaged (${hits}/${ship.length})` : '✅ Intact';
            return `${ship.emoji} **${ship.name}**: ${status}`;
        }).join('\n');

        // Create attack history
        const attackHistory = [];
        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                if (opponentBoard && (opponentBoard.grid[row][col] === 2 || opponentBoard.grid[row][col] === 3)) {
                    const letter = String.fromCharCode(65 + col);
                    const coord = `${letter}${row + 1}`;
                    const result = opponentBoard.grid[row][col] === 2 ? 'HIT' : 'MISS';
                    attackHistory.push(`${coord}: ${result}`);
                }
            }
        }

        // Generate visual board showing player's ships and damage
        const battleshipRenderer = require('../UTILS/battleshipRenderer');
        const boardImage = await battleshipRenderer.renderSingleBoard(playerBoard, {
            title: `${interaction.user.displayName}'s Fleet`,
            showShips: true, // Show player's own ships
            showAttacks: true, // Show where they've been hit
            width: 600,
            height: 700
        });

        const embed = new EmbedBuilder()
            .setTitle('🚢 Your Fleet Status')
            .setColor(0x1E88E5)
            .setDescription('**Your ship positions and battle damage**')
            .addFields(
                { name: '🛡️ Your Ships', value: shipStatus || 'No ships', inline: false },
                { name: '🎯 Your Attacks', value: attackHistory.slice(-10).join('\n') || 'No attacks yet', inline: true },
                { name: '📊 Battle Stats', value: `Ships Remaining: ${playerBoard.getShipsRemaining()}/${playerBoard.ships.length}\nTurn: ${game.currentTurn === userId ? 'YOUR TURN' : 'Opponent\'s turn'}`, inline: true }
            )
            .setImage('attachment://fleet.png')
            .setFooter({ text: 'Private fleet view • ATIVE Casino' });

        const attachment = new AttachmentBuilder(boardImage, { name: 'fleet.png' });
        await interaction.reply({ embeds: [embed], files: [attachment], flags: MessageFlags.Ephemeral });
    },

    async handleViewBoard(interaction, game) {
        const userId = interaction.user.id;
        
        if (!game.players.has(userId)) {
            const embed = UITemplates.createErrorEmbed('❌ Not In Game', 'You are not a player in this game.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        const playerBoard = game.boards.get(userId);
        const opponentId = game.getOpponent(userId);
        const opponentBoard = opponentId ? game.boards.get(opponentId) : null;

        let buffer;
        let viewType;
        
        if (opponentBoard && game.state === 'playing') {
            // Dual board view during battle
            buffer = await battleshipRenderer.renderDualBoards(playerBoard, opponentBoard, {
                title: `${interaction.user.displayName} vs ${game.players.get(opponentId).displayName}`
            });
            viewType = 'Tactical Overview - Left: Your Fleet | Right: Enemy Waters';
        } else {
            // Enhanced single board view with fleet status
            buffer = await playerBoard.getBoardImage({ 
                title: `${interaction.user.displayName}'s Fleet Command Center`,
                showShips: true,
                showAttacks: true,
                includeShipLabels: true,
                showDamageDetails: true
            });
            viewType = 'Fleet Command Center - Ships, Positions & Battle Damage';
        }

        const attachment = new AttachmentBuilder(buffer, { name: 'boards.png' });
        
        // Create detailed fleet status
        const fleetStatus = this.generateFleetStatusReport(playerBoard);
        
        const viewEmbed = buildSessionEmbed({
            title: '📟 Fleet Command Center',
            stageText: viewType,
            topFields: [
                { name: '🚢 Fleet Status Report', value: fleetStatus, inline: false },
                { name: '🎯 Enemy Intelligence', value: opponentBoard ? 'Ships hidden\nAttack results shown\nTactical intelligence' : 'Awaiting opponent', inline: true },
                { name: '📊 Battle Status', value: `Phase: ${game.state}\nTurn: ${game.currentTurn ? game.players.get(game.currentTurn)?.displayName || 'Unknown' : 'None'}`, inline: true }
            ],
            color: 0x1E88E5,
            footer: 'Private fleet overview • Your ships and positions • ATIVE Casino'
        }).setImage('attachment://boards.png');

        await interaction.reply({ embeds: [viewEmbed], files: [attachment], flags: MessageFlags.Ephemeral });
    },

    /**
     * Generate detailed fleet status report showing each ship's position and health
     */
    generateFleetStatusReport(playerBoard) {
        if (!playerBoard.ships || playerBoard.ships.length === 0) {
            return '🚫 No ships deployed yet';
        }

        const statusLines = [];
        let totalShips = 0;
        let damagedShips = 0;
        let sunkShips = 0;
        let intactShips = 0;

        for (const ship of playerBoard.ships) {
            if (!ship.placed) {
                continue;
            }
            
            totalShips++;
            const hitCount = ship.hits ? ship.hits.size : 0;
            const totalLength = ship.length;
            const isSunk = ship.isSunk ? ship.isSunk() : hitCount >= totalLength;
            
            let status;
            let statusIcon;
            
            if (isSunk) {
                status = 'SUNK';
                statusIcon = '💀';
                sunkShips++;
            } else if (hitCount > 0) {
                status = `DAMAGED (${hitCount}/${totalLength})`;
                statusIcon = '🔥';
                damagedShips++;
            } else {
                status = 'INTACT';
                statusIcon = '✅';
                intactShips++;
            }
            
            // Get ship position range
            let positionStr = 'Unknown';
            if (ship.positions && ship.positions.length > 0) {
                const startPos = ship.positions[0];
                const endPos = ship.positions[ship.positions.length - 1];
                const startCoord = `${String.fromCharCode('A'.charCodeAt(0) + startPos[1])}${startPos[0] + 1}`;
                const endCoord = `${String.fromCharCode('A'.charCodeAt(0) + endPos[1])}${endPos[0] + 1}`;
                positionStr = startPos[0] === endPos[0] && startPos[1] === endPos[1] ? startCoord : `${startCoord}-${endCoord}`;
            }
            
            statusLines.push(`${statusIcon} **${ship.name}** (${ship.length}) - ${status}\n   📍 Position: ${positionStr}`);
        }

        const header = `**Fleet Overview: ${intactShips} Intact • ${damagedShips} Damaged • ${sunkShips} Sunk**\n\n`;
        return header + statusLines.join('\n\n');
    },

    /**
     * Handle unified fire attack from main panel (BINGO-style)
     */
    async handleUnifiedFire(interaction, game) {
        const userId = interaction.user.id;
        
        if (!game.players.has(userId)) {
            const embed = UITemplates.createErrorEmbed('❌ Not In Game', 'You are not a player in this game.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }
        
        if (game.state !== 'playing') {
            const embed = UITemplates.createErrorEmbed('❌ Wrong Phase', 'The battle has not started yet.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }
        
        if (game.currentTurn !== userId) {
            const embed = UITemplates.createErrorEmbed('❌ Not Your Turn', 'Wait for your turn to attack.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Check if coordinates are selected
        const selection = this.attackSelections.get(userId);
        if (!selection || typeof selection.row !== 'number' || typeof selection.col !== 'number') {
            const embed = UITemplates.createErrorEmbed('❌ Select Target', 'Please select both row and column first using the dropdowns above.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Clear selections for next attack
        this.attackSelections.delete(userId);

        // Process the attack
        const coord = { row: selection.row, col: selection.col, label: `${String.fromCharCode('A'.charCodeAt(0) + selection.col)}${selection.row + 1}` };
        
        const opponentId = game.getOpponent(userId);
        const opponentBoard = game.boards.get(opponentId);
        const { result, ship } = opponentBoard.attack(coord.row, coord.col);

        if (result === 'already_attacked') {
            const embed = UITemplates.createErrorEmbed('❌ Already Attacked', `You already attacked ${coord.label}.`);
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        let resultMessage;
        let continueAttacking = false;
        let embedColor = 0x808080;
        
        if (result === 'hit') {
            resultMessage = `🎯 **HIT!** You hit an enemy ship at ${coord.label}!\n\n⚡ **You get another turn!**`;
            continueAttacking = true;
            embedColor = 0xFFA500;
        } else if (result === 'sunk') {
            resultMessage = `💥 **SHIP SUNK!**\n\nYou destroyed the enemy **${ship.name}** at ${coord.label}!\n\n🔥 **Continue your assault!**`;
            continueAttacking = true;
            embedColor = 0xFF0000;
        } else {
            resultMessage = `💧 **MISS!** Your shot at ${coord.label} hit only water.\n\n⏳ Turn passes to opponent.`;
            continueAttacking = false;
            embedColor = 0x3498DB;
        }

        // Check win condition first
        const winner = game.checkWinCondition();
        if (winner) {
            // Handle game end (same logic as before)
            await this.handleGameWin(game, winner, interaction, resultMessage);
            return;
        }

        // Switch turns only on miss
        if (!continueAttacking) {
            game.switchTurn();
            await this.sendTurnNotification(game, interaction.client);
        }

        // Update main game message
        const { embed: battleEmbed, battleImage } = await game.createBattleEmbed();
        const battleComponents = game.createGameButtons();
        try {
            const battleAttachment = new AttachmentBuilder(battleImage, { name: 'battle.png' });
            await game.message.edit({ embeds: [battleEmbed.setImage('attachment://battle.png')], files: [battleAttachment], components: battleComponents });
        } catch (error) {
            logger.warn(`Battle image too large in unified fire: ${error.message}`);
            await game.message.edit({ embeds: [battleEmbed], files: [], components: battleComponents });
        }

        // Send attack result
        await interaction.reply({ content: resultMessage, flags: MessageFlags.Ephemeral });
    },

    /**
     * Send turn notification to current player with auto-delete
     */
    async sendTurnNotification(game, client) {
        try {
            const currentPlayerId = game.currentTurn;
            const currentPlayer = game.players.get(currentPlayerId);
            const playerBoard = game.boards.get(currentPlayerId);
            
            if (!currentPlayer || !playerBoard) return;

            const shipsRemaining = playerBoard.getShipsRemaining();
            
            // Create turn notification embed
            const turnEmbed = buildSessionEmbed({
                title: '⚓ Your Turn!',
                stageText: `${currentPlayer.displayName}, it's your turn to attack!\nYou have ${shipsRemaining} ships still alive.`,
                topFields: [
                    { name: '🎯 Your Mission', value: 'Choose enemy coordinates to attack\nUse the main game panel below', inline: true },
                    { name: '📊 Your Fleet', value: `${shipsRemaining}/5 ships remaining\nStay strategic!`, inline: true }
                ],
                color: 0x00FF00,
                footer: 'This message will auto-delete in 15 seconds'
            });

            // Create button to link to main panel
            const panelButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('battleship_view_panel')
                    .setLabel('📋 View Main Game Panel')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎮')
            );

            // Send the notification (it will be public in the channel)
            const channel = await client.channels.fetch(game.channelId);
            if (channel) {
                const message = await channel.send({
                    content: `<@${currentPlayerId}>`,
                    embeds: [turnEmbed],
                    components: [panelButton]
                });

                // Auto-delete after 15 seconds
                setTimeout(async () => {
                    try {
                        if (message.deletable) {
                            await message.delete();
                        }
                    } catch (error) {
                        // Message might already be deleted, ignore
                    }
                }, 15000);
            }
        } catch (error) {
            logger.error(`Failed to send turn notification: ${error.message}`);
        }
    },

    /**
     * Handle game win scenario - end game and update database
     */
    async handleGameWin(game, winner, interaction, resultMessage) {
        try {
            // Mark game as completed
            game.phase = 'completed';
            game.winner = winner;
            
            // Get winner and loser info
            const winnerPlayer = game.players.get(winner);
            const loserId = [...game.players.keys()].find(id => id !== winner);
            const loserPlayer = game.players.get(loserId);
            
            // Create victory embed
            const victoryEmbed = buildSessionEmbed({
                title: `🎉 BATTLESHIP VICTORY! 🎉`,
                stageText: `${winnerPlayer.displayName} WINS THE BATTLE!`,
                topFields: [
                    { name: '🏆 Winner', value: `${winnerPlayer.displayName}\nAll enemy ships destroyed!`, inline: true },
                    { name: '🪦 Defeated', value: `${loserPlayer.displayName}\nFleet completely sunk`, inline: true },
                    { name: '⚓ Game Summary', value: `Battle concluded\nWell played by both commanders!`, inline: false }
                ],
                color: 0xFFD700, // Gold color for victory
                footer: 'Thanks for playing Battleship! 🚢'
            });

            // Update the main game message
            const channel = await interaction.client.channels.fetch(game.channelId);
            if (channel && game.messageId) {
                try {
                    const message = await channel.messages.fetch(game.messageId);
                    await message.edit({
                        embeds: [victoryEmbed],
                        components: [] // Remove all buttons since game is over
                    });
                } catch (error) {
                    logger.error(`Failed to update game message: ${error.message}`);
                }
            }

            // Send result message to the player who made the winning move
            await interaction.reply({ 
                content: resultMessage + `\n\n🎉 **CONGRATULATIONS!** You've won the battle!`, 
                flags: MessageFlags.Ephemeral 
            });

            // Try to update database stats if available
            try {
                const db = require('../UTILS/database');
                
                // Update winner stats
                await db.query(`
                    UPDATE battleship_stats 
                    SET games_won = games_won + 1, total_games = total_games + 1 
                    WHERE user_id = ?
                `, [winner]);
                
                // Update loser stats  
                await db.query(`
                    UPDATE battleship_stats 
                    SET games_lost = games_lost + 1, total_games = total_games + 1 
                    WHERE user_id = ?
                `, [loserId]);

                // Log the game completion
                logger.info(`Battleship game completed - Winner: ${winnerPlayer.displayName} (${winner}), Loser: ${loserPlayer.displayName} (${loserId})`);
                
            } catch (dbError) {
                logger.error(`Database error updating battleship stats: ${dbError.message}`);
            }

            // Remove game from session registry
            const sessionKey = `${game.guildId}:${game.channelId}`;
            SessionRegistry.delete(sessionKey);
            
        } catch (error) {
            logger.error(`Error handling game win: ${error.message}`);
            await interaction.followUp({ 
                content: 'Game completed but there was an error processing the results.', 
                flags: MessageFlags.Ephemeral 
            });
        }
    },

    // Additional button handlers for placement
    async handlePlaceShip(interaction, game) {
        const userId = interaction.user.id;
        const playerBoard = game.boards.get(userId);
        const currentShip = playerBoard.getCurrentShip();
        
        if (!currentShip) {
            const embed = UITemplates.createErrorEmbed('❌ All Ships Placed', 'All ships are already placed.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Create row selection dropdown
        const rowOptions = [];
        for (let row = 1; row <= BOARD_SIZE; row++) {
            rowOptions.push({
                label: `Row ${row}`,
                value: `R${row}`,
                description: `Select row ${row}`
            });
        }

        // Create column selection dropdown
        const colOptions = [];
        for (let col = 0; col < BOARD_SIZE; col++) {
            const colLetter = String.fromCharCode('A'.charCodeAt(0) + col);
            colOptions.push({
                label: `Column ${colLetter}`,
                value: `C${colLetter}`,
                description: `Select column ${colLetter}`
            });
        }

        const rowSelect = new StringSelectMenuBuilder()
            .setCustomId(`battleship_place_row_${userId}`)
            .setPlaceholder('🔢 Select starting row (1-10)')
            .addOptions(rowOptions);

        const colSelect = new StringSelectMenuBuilder()
            .setCustomId(`battleship_place_col_${userId}`)
            .setPlaceholder('🔤 Select starting column (A-J)')
            .addOptions(colOptions);

        const directionSelect = new StringSelectMenuBuilder()
            .setCustomId(`battleship_place_dir_${userId}`)
            .setPlaceholder('🧭 Select ship direction')
            .addOptions([
                {
                    label: 'Horizontal →',
                    value: 'H',
                    description: 'Place ship horizontally (left to right)',
                    emoji: '➡️'
                },
                {
                    label: 'Vertical ↓',
                    value: 'V',
                    description: 'Place ship vertically (top to bottom)',
                    emoji: '⬇️'
                }
            ]);

        const confirmButton = new ButtonBuilder()
            .setCustomId(`battleship_confirm_placement_${userId}`)
            .setLabel('✅ Place Ship')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true); // Initially disabled until all selections are made

        const cancelButton = new ButtonBuilder()
            .setCustomId(`battleship_cancel_placement_${userId}`)
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Secondary);

        // Show current board state
        let boardImage;
        try {
            boardImage = await battleshipRenderer.renderSingleBoard(playerBoard, { showShips: true });
        } catch (error) {
            logger.error(`Error rendering placement board: ${error.message}`);
        }

        const embed = new EmbedBuilder()
            .setTitle(`⚓ Place Your ${currentShip.name}`)
            .setDescription(`**Length:** ${currentShip.length} spaces\n**Ships Placed:** ${playerBoard.currentShipIndex}/${playerBoard.ships.length}\n\nSelect row, column, and direction, then click "Place Ship"`)
            .setColor(0x00BFFF)
            .setFooter({ text: 'Use the dropdowns to select position and direction' });

        const components = [
            new ActionRowBuilder().addComponents(rowSelect),
            new ActionRowBuilder().addComponents(colSelect),
            new ActionRowBuilder().addComponents(directionSelect),
            new ActionRowBuilder().addComponents(confirmButton, cancelButton)
        ];

        const replyData = {
            embeds: [embed],
            components,
            flags: MessageFlags.Ephemeral
        };

        if (boardImage) {
            const attachment = new AttachmentBuilder(boardImage, { name: 'placement.png' });
            embed.setImage('attachment://placement.png');
            replyData.files = [attachment];
        }

        await interaction.reply(replyData);
    },

    // Store user selections temporarily
    userSelections: new Map(), // userId -> { row, col, direction }
    
    // Store attack coordinates for unified panel
    attackSelections: new Map(), // userId -> { row, col }

    async handleSelectMenu(interaction) {
        const userId = interaction.user.id;
        const customId = interaction.customId;
        const value = interaction.values[0];

        // Initialize user selection if not exists
        if (!this.userSelections.has(userId)) {
            this.userSelections.set(userId, {});
        }

        const selection = this.userSelections.get(userId);

        // Handle different types of selections
        if (customId.includes('select_row')) {
            const rowNum = parseInt(value.substring(1)); // Remove 'R' prefix
            if (!this.attackSelections.has(userId)) {
                this.attackSelections.set(userId, {});
            }
            this.attackSelections.get(userId).row = rowNum - 1; // Convert to 0-based
            await interaction.update({ content: `🎯 Target: Row ${rowNum}` });
        }
        else if (customId.includes('select_col')) {
            const colLetter = value.substring(1); // Remove 'C' prefix
            const colNum = colLetter.charCodeAt(0) - 'A'.charCodeAt(0);
            if (!this.attackSelections.has(userId)) {
                this.attackSelections.set(userId, {});
            }
            this.attackSelections.get(userId).col = colNum;
            await interaction.update({ content: `🎯 Target: Column ${colLetter}` });
        }
        else if (customId.includes('place_row_')) {
            const rowNum = parseInt(value.substring(1)); // Remove 'R' prefix
            selection.row = rowNum - 1; // Convert to 0-based
            await interaction.update({ content: `Selected row ${rowNum}`, components: interaction.message.components });
        }
        else if (customId.includes('place_col_')) {
            const colLetter = value.substring(1); // Remove 'C' prefix
            const colNum = colLetter.charCodeAt(0) - 'A'.charCodeAt(0);
            selection.col = colNum;
            await interaction.update({ content: `Selected column ${colLetter}`, components: interaction.message.components });
        }
        else if (customId.includes('place_dir_')) {
            selection.direction = value === 'H' ? HORIZONTAL : VERTICAL;
            await interaction.update({ content: `Selected direction ${value === 'H' ? 'Horizontal' : 'Vertical'}`, components: interaction.message.components });
        }
        else if (customId.includes('attack_row_')) {
            const rowNum = parseInt(value.substring(1)); // Remove 'R' prefix
            selection.attackRow = rowNum - 1; // Convert to 0-based
            await interaction.update({ content: `Target row ${rowNum}`, components: interaction.message.components });
        }
        else if (customId.includes('attack_col_')) {
            const colLetter = value.substring(1); // Remove 'C' prefix
            const colNum = colLetter.charCodeAt(0) - 'A'.charCodeAt(0);
            selection.attackCol = colNum;
            await interaction.update({ content: `Target column ${colLetter}`, components: interaction.message.components });
        }

        // Check if we can enable the confirm button
        await this.updateConfirmButton(interaction, userId);
    },

    async updateConfirmButton(interaction, userId) {
        const selection = this.userSelections.get(userId);
        const components = interaction.message.components.map(row => {
            const newRow = new ActionRowBuilder();
            row.components.forEach(component => {
                if (component.customId && component.customId.includes('confirm_placement_')) {
                    // Enable confirm button if all placement selections are made
                    const canConfirm = selection && 
                                     typeof selection.row === 'number' && 
                                     typeof selection.col === 'number' && 
                                     typeof selection.direction === 'number';
                    
                    const newButton = new ButtonBuilder()
                        .setCustomId(component.customId)
                        .setLabel(component.label)
                        .setStyle(component.style)
                        .setDisabled(!canConfirm);
                    
                    if (component.emoji) newButton.setEmoji(component.emoji);
                    newRow.addComponents(newButton);
                } else if (component.customId && component.customId.includes('fire_attack_')) {
                    // Enable fire button if both attack selections are made
                    const canFire = selection && 
                                   typeof selection.attackRow === 'number' && 
                                   typeof selection.attackCol === 'number';
                    
                    const newButton = new ButtonBuilder()
                        .setCustomId(component.customId)
                        .setLabel(component.label)
                        .setStyle(component.style)
                        .setDisabled(!canFire);
                    
                    if (component.emoji) newButton.setEmoji(component.emoji);
                    newRow.addComponents(newButton);
                } else {
                    // Copy other components as-is
                    if (component.type === 3) { // StringSelectMenu
                        const newSelect = new StringSelectMenuBuilder()
                            .setCustomId(component.customId)
                            .setPlaceholder(component.placeholder)
                            .addOptions(component.options);
                        newRow.addComponents(newSelect);
                    } else {
                        const newButton = new ButtonBuilder()
                            .setCustomId(component.customId)
                            .setLabel(component.label)
                            .setStyle(component.style);
                        
                        if (component.disabled !== undefined) newButton.setDisabled(component.disabled);
                        if (component.emoji) newButton.setEmoji(component.emoji);
                        newRow.addComponents(newButton);
                    }
                }
            });
            return newRow;
        });

        try {
            await interaction.editReply({ components });
        } catch (error) {
            logger.error(`Error updating confirm button: ${error.message}`);
        }
    },

    async handleAutoPlace(interaction, game) {
        const userId = interaction.user.id;
        const playerBoard = game.boards.get(userId);
        
        if (playerBoard.allShipsPlaced()) {
            const embed = UITemplates.createErrorEmbed('❌ Ships Already Placed', 'Your ships are already placed.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        const success = await autoPlaceAllShips(playerBoard);
        if (!success) {
            const embed = UITemplates.createErrorEmbed('❌ Auto-Placement Failed', 'Auto-placement failed. Try manual placement.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Update main game message to reflect both players' status
        const gameEmbed = game.createPlacementEmbed();
        const gameComponents = game.createGameButtons();
        await game.message.edit({ embeds: [gameEmbed], components: gameComponents });

        // Show updated board
        const buffer = await playerBoard.getBoardImage({ 
            title: `${interaction.user.displayName} — Fleet Ready for Battle!`, 
            showShips: true 
        });
        const attachment = new AttachmentBuilder(buffer, { name: 'placement.png' });
        
        const successEmbed = buildSessionEmbed({
            title: '✅ Auto-Placement Complete',
            stageText: 'All ships have been deployed automatically!',
            color: 0x00FF00
        }).setImage('attachment://placement.png');

        await interaction.reply({ embeds: [successEmbed], files: [attachment], flags: MessageFlags.Ephemeral });
    },

    async handleReady(interaction, game) {
        const userId = interaction.user.id;
        const playerBoard = game.boards.get(userId);
        
        if (!playerBoard.allShipsPlaced()) {
            const embed = UITemplates.createErrorEmbed('❌ Ships Not Placed', 'You must place all ships first.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Check if both players are ready
        const allReady = Array.from(game.boards.values()).every(board => board.allShipsPlaced());

        if (allReady) {
            game.startBattle();
            const { embed: battleEmbed, battleImage } = await game.createBattleEmbed();
            const battleComponents = game.createGameButtons();
            
            try {
                const battleAttachment = new AttachmentBuilder(battleImage, { name: 'battle.png' });
                await game.message.edit({ 
                    embeds: [battleEmbed.setImage('attachment://battle.png')], 
                    files: [battleAttachment], 
                    components: battleComponents 
                });
            } catch (error) {
                // If the message is too large, try without the battle image
                logger.warn(`Battle image too large, proceeding without image: ${error.message}`);
                await game.message.edit({ 
                    embeds: [battleEmbed], 
                    files: [], 
                    components: battleComponents 
                });
            }
            
            const readyEmbed = buildSessionEmbed({
                title: '⚔️ Battle Commenced!',
                stageText: 'All ships deployed. The naval battle begins now!',
                color: 0xFF0000
            });
            
            await interaction.reply({ embeds: [readyEmbed], flags: MessageFlags.Ephemeral });

            // Send turn notification to current player
            await this.sendTurnNotification(game, interaction.client);
        } else {
            const waitEmbed = buildSessionEmbed({
                title: '✅ Fleet Ready',
                stageText: 'Your ships are ready! Waiting for opponent to finish placement...',
                color: 0xFFA500
            });
            
            await interaction.reply({ embeds: [waitEmbed], flags: MessageFlags.Ephemeral });
        }
    },

    async handleModal(interaction) {
        const channelId = interaction.channelId;
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const game = getBattleshipGame(channelId);
        
        if (!game) {
            const embed = UITemplates.createErrorEmbed('❌ No Active Game', 'No active Battleship game found.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        try {
            if (interaction.customId === 'battleship_place_modal') {
                await this.handlePlaceModal(interaction, game);
            } else if (interaction.customId.startsWith('battleship_attack_modal_')) {
                await this.handleAttackModal(interaction, game, guildId);
            } else {
                const embed = UITemplates.createErrorEmbed('❌ Unknown Modal', 'Unknown modal interaction.');
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        } catch (error) {
            logger.error(`Battleship modal error: ${error.message}`);
            const embed = UITemplates.createErrorEmbed('❌ Modal Error', 'Error processing modal submission.');
            if (!interaction.replied) {
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        }
    },

    async handlePlaceModal(interaction, game) {
        const userId = interaction.user.id;
        const playerBoard = game.boards.get(userId);
        const currentShip = playerBoard.getCurrentShip();
        
        if (!currentShip) {
            const embed = UITemplates.createErrorEmbed('❌ No Ship to Place', 'All ships are already placed.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        const coordInput = interaction.fields.getTextInputValue('coordinate');
        const dirInput = interaction.fields.getTextInputValue('direction');
        
        const coord = parseCoordinate(coordInput);
        const direction = parseDirection(dirInput);
        
        if (!coord || !direction) {
            const embed = UITemplates.createErrorEmbed('❌ Invalid Input', 'Invalid coordinate or direction. Use A1-J10 and H/V.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        const success = playerBoard.placeShip(currentShip, coord.row, coord.col, direction);
        if (!success) {
            const embed = UITemplates.createErrorEmbed('❌ Invalid Placement', 'Cannot place ship there (overlapping or out of bounds).');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        playerBoard.advanceShip();

        // Update main game message
        const gameEmbed = game.createPlacementEmbed();
        const gameComponents = game.createGameButtons();
        await game.message.edit({ embeds: [gameEmbed], components: gameComponents });

        // Show updated board
        const nextShip = playerBoard.getCurrentShip();
        const title = nextShip ? `Place: ${nextShip.name} (${nextShip.length} spaces)` : 'Fleet Ready for Battle!';
        const buffer = await playerBoard.getBoardImage({ 
            title: `${interaction.user.displayName} — ${title}`, 
            showShips: true 
        });
        const attachment = new AttachmentBuilder(buffer, { name: 'placement.png' });
        
        const successEmbed = buildSessionEmbed({
            title: '✅ Ship Placed Successfully',
            stageText: `${currentShip.name} deployed at ${coord.label}!`,
            color: 0x00FF00
        }).setImage('attachment://placement.png');

        await interaction.reply({ embeds: [successEmbed], files: [attachment], flags: MessageFlags.Ephemeral });
    },

    async handleAttackModal(interaction, game, guildId) {
        const userId = interaction.user.id;
        const channelId = interaction.channelId;
        
        if (game.currentTurn !== userId) {
            const embed = UITemplates.createErrorEmbed('❌ Not Your Turn', 'Wait for your turn to attack.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        const coordInput = interaction.fields.getTextInputValue('coordinates');
        const coord = parseCoordinate(coordInput);
        
        if (!coord) {
            const embed = UITemplates.createErrorEmbed('❌ Invalid Coordinate', 'Invalid coordinate. Use A1-J10 format.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        const opponentId = game.getOpponent(userId);
        const opponentBoard = game.boards.get(opponentId);
        const { result, ship } = opponentBoard.attack(coord.row, coord.col);

        if (result === 'already_attacked') {
            const embed = UITemplates.createErrorEmbed('❌ Already Attacked', `You already attacked ${coord.label}.`);
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        let resultMessage;
        let continueAttacking = false;
        let embedColor = 0x808080;
        
        if (result === 'hit') {
            resultMessage = `🎯 **HIT!** You hit an enemy ship at ${coord.label}!\n\n⚡ **You get another turn!**`;
            continueAttacking = true;
            embedColor = 0xFFA500;
        } else if (result === 'sunk') {
            resultMessage = `💥 **SHIP SUNK!**\n\nYou destroyed the enemy **${ship.name}** at ${coord.label}!\n\n🔥 **Continue your assault!**`;
            continueAttacking = true;
            embedColor = 0xFF0000;
        } else {
            resultMessage = `💧 **MISS!** Your shot at ${coord.label} hit only water.\n\n⏳ Turn passes to opponent.`;
            continueAttacking = false;
            embedColor = 0x3498DB;
        }

        // Check win condition
        const winner = game.checkWinCondition();
        if (winner) {
            // Handle game end
            const loserId = opponentId;
            const winnerBalance = await dbManager.getUserBalance(winner, guildId);
            const winnings = game.betAmount * 2;
            
            // Credit winnings via relative update (SessionManager clears flags)
            await dbManager.updateUserBalance(winner, guildId, winnings, 0);
            // Note: No need to set game_active: false as sessions handle this

            // Record game results
            try {
                await dbManager.updateGameStats(winner, true, 'battleship', winnings);
                await dbManager.updateGameStats(loserId, false, 'battleship', game.betAmount);
            } catch (error) {
                logger.error(`Failed to record battleship game results: ${error.message}`);
            }
            
            // Add XP and complete sessions for both players
            const players = [winner, loserId];
            for (const playerId of players) {
                const won = playerId === winner;
                
                // Add XP for game completion
                const xpResult = await levelingSystem.handleGameComplete(playerId, guildId, 'battleship', won);
                
                // Check for level up
                if (xpResult && xpResult.leveledUp) {
                    try {
                        const levelUpChannel = interaction.client.channels.cache.get('1411018763008217208');
                        if (levelUpChannel) {
                            const user = await interaction.client.users.fetch(playerId);
                            const levelUpEmbed = levelingSystem.createLevelUpEmbed(user, xpResult.newLevel);
                            await levelUpChannel.send({ 
                                content: `<@${playerId}>, you are now level ${xpResult.newLevel}!`,
                                embeds: [levelUpEmbed] 
                            });
                        }
                    } catch (levelError) {
                        logger.error(`Failed to send level up notification: ${levelError.message}`);
                    }
                }
            }
            
            // Complete sessions if they exist
            if (game.sessionId) {
                await sessionManager.endSession(game.sessionId, {
                    outcome: 'COMPLETED',
                    payout: winnings,
                    won: true,
                    winnerId: winner,
                    loserId: loserId
                });
            }

            const finishedEmbed = game.createFinishedEmbed();
            const finishedComponents = game.createGameButtons();
            await game.message.edit({ embeds: [finishedEmbed], components: finishedComponents });

            const winEmbed = buildSessionEmbed({
                title: '🏆 Victory Achieved!',
                stageText: `${resultMessage}\n\nWinner: <@${winner}>\nPrize: ${fmt(winnings)}`,
                color: 0xFFD700
            });
            
            await interaction.reply({ embeds: [winEmbed], flags: MessageFlags.Ephemeral });
            removeBattleshipGame(channelId);
            return;
        }

        // Switch turns only on miss (per official Battleship rules)
        if (!continueAttacking) {
            game.switchTurn();
            // Send turn notification to new current player
            await this.sendTurnNotification(game, interaction.client);
        }

        // Update main game message
        const { embed: battleEmbed, battleImage } = await game.createBattleEmbed();
        const battleComponents = game.createGameButtons();
        
        // Only use image if it exists
        if (battleImage) {
            try {
                const battleAttachment = new AttachmentBuilder(battleImage, { name: 'battle.png' });
                await game.message.edit({ embeds: [battleEmbed.setImage('attachment://battle.png')], files: [battleAttachment], components: battleComponents });
            } catch (error) {
                logger.warn(`Battle image error in attack handler: ${error.message}`);
                await game.message.edit({ embeds: [battleEmbed], files: [], components: battleComponents });
            }
        } else {
            await game.message.edit({ embeds: [battleEmbed], files: [], components: battleComponents });
        }

        const attackEmbed = buildSessionEmbed({
            title: '🎯 Attack Result',
            stageText: resultMessage,
            color: embedColor
        });
        
        await interaction.reply({ embeds: [attackEmbed], flags: MessageFlags.Ephemeral });
    },

    async handleConfirmPlacement(interaction, game) {
        const userId = interaction.user.id;
        const selection = this.userSelections.get(userId);
        const playerBoard = game.boards.get(userId);

        if (!selection || typeof selection.row !== 'number' || typeof selection.col !== 'number' || typeof selection.direction !== 'number') {
            const embed = UITemplates.createErrorEmbed('❌ Incomplete Selection', 'Please select row, column, and direction first.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        const currentShip = playerBoard.getCurrentShip();
        if (!currentShip) {
            const embed = UITemplates.createErrorEmbed('❌ No Ship to Place', 'All ships have been placed.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Try to place the ship
        const success = playerBoard.placeShip(currentShip, selection.row, selection.col, selection.direction);
        
        if (!success) {
            const embed = UITemplates.createErrorEmbed('❌ Invalid Placement', 'Cannot place ship at that location. Try a different position.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Clear user selections
        this.userSelections.delete(userId);

        // Update the game state message
        await game.updateGameMessage();

        const embed = UITemplates.createSuccessEmbed('⚓ Ship Deployed', `Successfully placed ${currentShip.name}!`);
        await interaction.update({ embeds: [embed], components: [] });
    },

    async handleCancelPlacement(interaction) {
        const userId = interaction.user.id;
        this.userSelections.delete(userId);
        
        const embed = UITemplates.createErrorEmbed('❌ Placement Cancelled', 'Ship placement has been cancelled.');
        await interaction.update({ embeds: [embed], components: [] });
    },

    async handleFireAttack(interaction, game) {
        const userId = interaction.user.id;
        const selection = this.userSelections.get(userId);

        if (!selection || typeof selection.attackRow !== 'number' || typeof selection.attackCol !== 'number') {
            const embed = UITemplates.createErrorEmbed('❌ Incomplete Selection', 'Please select target row and column first.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Clear user selections
        this.userSelections.delete(userId);

        // Process the attack using the existing attack logic  
        const coord = { row: selection.attackRow, col: selection.attackCol };
        const result = await this.processAttackLogic(game, userId, coord);

        const resultEmbed = UITemplates.createSuccessEmbed(
            result.hit ? '💥 Hit!' : '🌊 Missed!',
            result.message || `You ${result.hit ? 'hit' : 'missed'} at ${String.fromCharCode('A'.charCodeAt(0) + selection.attackCol)}${selection.attackRow + 1}${result.sunk ? ` and sunk their ${result.ship}!` : ''}`
        );

        await interaction.update({ embeds: [resultEmbed], components: [] });
    },

    async handleCancelAttack(interaction) {
        const userId = interaction.user.id;
        this.userSelections.delete(userId);
        
        const embed = UITemplates.createErrorEmbed('❌ Attack Cancelled', 'Attack has been cancelled.');
        await interaction.update({ embeds: [embed], components: [] });
    },

    // Helper method to process attack logic (extracted from existing attack modal handler)
    async processAttackLogic(game, userId, coord) {
        const opponentId = Array.from(game.players.keys()).find(id => id !== userId);
        const opponentBoard = game.boards.get(opponentId);
        
        const { result, ship } = opponentBoard.attack(coord.row, coord.col);
        
        if (result === 'miss') {
            game.switchTurn();
        }

        // Update main game message
        const { embed: battleEmbed, battleImage } = await game.createBattleEmbed();
        const battleComponents = game.createGameButtons();
        try {
            const battleAttachment = new AttachmentBuilder(battleImage, { name: 'battle.png' });
            await game.message.edit({ embeds: [battleEmbed.setImage('attachment://battle.png')], files: [battleAttachment], components: battleComponents });
        } catch (error) {
            // If too large, proceed without image
            logger.warn(`Battle image too large in processAttackLogic: ${error.message}`);
            await game.message.edit({ embeds: [battleEmbed], files: [], components: battleComponents });
        }

        return {
            hit: result !== 'miss',
            sunk: result === 'sunk',
            message: result === 'miss' ? 'Missed!' : (result === 'hit' ? 'Hit!' : `Hit and sunk the ${ship?.name || 'ship'}!`),
            ship: ship || null
        };
    }
};
