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
    AttachmentBuilder
} = require('discord.js');

const dbManager = require('../UTILS/database');
const { fmt, getGuildId, parseAmount } = require('../UTILS/common');
const logger = require('../UTILS/logger');
const battleshipRenderer = require('../UTILS/battleshipRenderer');
const UITemplates = require('../UTILS/uiTemplates');
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

            // Ensure user exists in database
            await dbManager.ensureUser(userId, username);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Parse and validate amount
            const amountStr = interaction.options.getString('amount');
            let betAmount;
            try {
                betAmount = parseAmount(amountStr, balance.wallet);
            } catch (e) {
                const embed = UITemplates.createErrorEmbed('❌ Invalid Amount', e.message);
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            const MIN_BET = 100;
            const MAX_BET = 1000000;
            if (betAmount < MIN_BET) {
                const embed = UITemplates.createErrorEmbed('❌ Minimum Bet', `Minimum bet is ${fmt(MIN_BET)}.`);
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }
            if (betAmount > MAX_BET) {
                const embed = UITemplates.createErrorEmbed('❌ Maximum Bet', `Maximum bet is ${fmt(MAX_BET)}.`);
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }
            if (betAmount > balance.wallet) {
                const embed = UITemplates.createErrorEmbed('❌ Insufficient Balance', `You need ${fmt(betAmount)} but only have ${fmt(balance.wallet)}.`);
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Deduct from creator and mark as active in game
            await dbManager.updateUserBalance(userId, guildId, { wallet: balance.wallet - betAmount, game_active: true });

            // Create game
            const game = createBattleshipGame(channelId, interaction.user, betAmount);
            if (!game) {
                // Refund on failure
                await dbManager.updateUserBalance(userId, guildId, { wallet: balance.wallet, game_active: false });
                const embed = UITemplates.createErrorEmbed('❌ Game Creation Failed', 'Failed to create Battleship game.');
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            const embed = game.createLobbyEmbed();
            const components = game.createGameButtons();
            const bannerAttachment = new AttachmentBuilder('/Users/carlosdiazplaza/ative_casino_bot/assets/battleshipbanner.gif', { name: 'battleshipbanner.gif' });

            const msg = await interaction.reply({ embeds: [embed], components, files: [bannerAttachment], fetchReply: true });
            game.message = msg;
            
            logger.info(`Battleship game created by ${username} (${userId}) bet ${betAmount} in channel ${channelId}`);

        } catch (error) {
            logger.error(`Battleship /execute error: ${error.message}`);
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
                    await this.handleJoin(interaction, game, guildId);
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
                    
                case 'view_board':
                    await this.handleViewBoard(interaction, game);
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
                    const embed = UITemplates.createErrorEmbed('❌ Unknown Action', 'Unknown Battleship action.');
                    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

        } catch (error) {
            logger.error(`Battleship button error (${action}): ${error.message}`);
            const embed = UITemplates.createErrorEmbed('❌ Button Error', 'Error processing button action.');
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        }
    },

    async handleJoin(interaction, game, guildId) {
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

        // Check balance
        await dbManager.ensureUser(userId, interaction.user.displayName);
        const balance = await dbManager.getUserBalance(userId, guildId);
        if (balance.wallet < game.betAmount) {
            const embed = UITemplates.createErrorEmbed('❌ Insufficient Balance', `You need ${fmt(game.betAmount)} to join. You have ${fmt(balance.wallet)}.`);
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Check if user is in another game
        const activeGame = getUserGame(userId);
        if (activeGame) {
            const embed = UITemplates.createErrorEmbed('❌ Already In Game', 'You are already in another game! Finish it first.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Deduct bet and add player
        await dbManager.updateUserBalance(userId, guildId, { wallet: balance.wallet - game.betAmount, game_active: true });
        const success = game.addPlayer(interaction.user);
        
        if (!success) {
            // Refund on failure
            await dbManager.updateUserBalance(userId, guildId, { wallet: balance.wallet, game_active: false });
            const embed = UITemplates.createErrorEmbed('❌ Join Failed', 'Failed to join the game.');
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Update game display
        const embed = game.createLobbyEmbed();
        const components = game.createGameButtons();
        const bannerAttachment = new AttachmentBuilder('/Users/carlosdiazplaza/ative_casino_bot/assets/battleshipbanner.gif', { name: 'battleshipbanner.gif' });
        await interaction.update({ embeds: [embed], components, files: [bannerAttachment] });
        
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
        
        game.startPlacement();
        const embed = game.createPlacementEmbed();
        const components = game.createGameButtons();
        await interaction.update({ embeds: [embed], components });
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
            description: allShipsPlaced
                ? `**Status:** All ships deployed successfully!\n**Action:** Click "Ready for Battle" to confirm setup\n**Fleet:** Your naval forces await orders`
                : `**Current Ship:** ${currentShip.name} (${currentShip.length} spaces)\n**Instructions:** Use "Place Ship" to position manually\n**Quick Option:** Use "Auto-Place All" for instant deployment`,
            topFields: [
                { name: '📍 Manual Placement', value: 'Select coordinates\nChoose direction\nPrecision control', inline: true },
                { name: '🎲 Auto Placement', value: 'Instant deployment\nRandom positioning\nQuick setup', inline: true },
                { name: '⚓ Fleet Status', value: allShipsPlaced ? '✅ Ready for Battle' : `${playerBoard.ships.filter(s => s.placed).length}/5 ships`, inline: true }
            ],
            color: allShipsPlaced ? 0x00FF00 : 0xFFA500,
            footerText: 'Private ship placement • Strategic deployment • ATIVE Casino'
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

        // Show attack modal
        const modal = new ModalBuilder()
            .setCustomId('battleship_attack_modal')
            .setTitle('🎯 Fire at Enemy Position');

        const coordinateInput = new TextInputBuilder()
            .setCustomId('coordinate')
            .setLabel('Target coordinate (e.g., A5, B10)')
            .setStyle(TextInputStyle.Short)
            .setMinLength(2)
            .setMaxLength(3)
            .setRequired(true)
            .setPlaceholder('A5, B10, etc.');

        modal.addComponents(new ActionRowBuilder().addComponents(coordinateInput));
        await interaction.showModal(modal);
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
            // Single board view
            buffer = await playerBoard.getBoardImage({ 
                title: `${interaction.user.displayName}'s Fleet`, 
                showShips: true 
            });
            viewType = 'Fleet Overview - Your Ships and Deployment';
        }

        const attachment = new AttachmentBuilder(buffer, { name: 'boards.png' });
        
        const viewEmbed = buildSessionEmbed({
            title: '📟 Tactical Board View',
            description: viewType,
            topFields: [
                { name: '🚢 Your Fleet', value: 'Ships visible\nFull tactical view\nStrategic overview', inline: true },
                { name: '🎯 Enemy Waters', value: opponentBoard ? 'Ships hidden\nAttack results shown\nTactical intelligence' : 'Awaiting opponent', inline: true },
                { name: '📊 Battle Status', value: `Phase: ${game.state}\nTurn: ${game.currentTurn ? game.players.get(game.currentTurn)?.displayName || 'Unknown' : 'None'}`, inline: true }
            ],
            color: 0x1E88E5,
            footerText: 'Strategic overview • Real-time battle status • ATIVE Casino'
        }).setImage('attachment://boards.png');

        await interaction.reply({ embeds: [viewEmbed], files: [attachment], flags: MessageFlags.Ephemeral });
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

        // Show placement modal
        const modal = new ModalBuilder()
            .setCustomId('battleship_place_modal')
            .setTitle(`⚓ Place ${currentShip.name} (${currentShip.length} spaces)`);

        const coordinateInput = new TextInputBuilder()
            .setCustomId('coordinate')
            .setLabel('Starting coordinate (e.g., A5, B10)')
            .setStyle(TextInputStyle.Short)
            .setMinLength(2)
            .setMaxLength(3)
            .setRequired(true)
            .setPlaceholder('A5, B10, etc.');

        const directionInput = new TextInputBuilder()
            .setCustomId('direction')
            .setLabel('Direction (H for horizontal, V for vertical)')
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(1)
            .setRequired(true)
            .setPlaceholder('H or V');

        modal.addComponents(
            new ActionRowBuilder().addComponents(coordinateInput),
            new ActionRowBuilder().addComponents(directionInput)
        );
        
        await interaction.showModal(modal);
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

        // Update main game message
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
            description: 'All ships have been deployed automatically!',
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
            const { embed: battleEmbed, battleImage, bannerPath } = await game.createBattleEmbed();
            const battleComponents = game.createGameButtons();
            const battleAttachment = new AttachmentBuilder(battleImage, { name: 'battle.png' });
            const bannerAttachment = new AttachmentBuilder(bannerPath, { name: 'battleshipbanner.gif' });
            await game.message.edit({ embeds: [battleEmbed.setImage('attachment://battle.png')], files: [battleAttachment, bannerAttachment], components: battleComponents });
            
            const readyEmbed = buildSessionEmbed({
                title: '⚔️ Battle Commenced!',
                description: 'All ships deployed. The naval battle begins now!',
                color: 0xFF0000
            });
            
            await interaction.reply({ embeds: [readyEmbed], flags: MessageFlags.Ephemeral });
        } else {
            const waitEmbed = buildSessionEmbed({
                title: '✅ Fleet Ready',
                description: 'Your ships are ready! Waiting for opponent to finish placement...',
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
            } else if (interaction.customId === 'battleship_attack_modal') {
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
            description: `${currentShip.name} deployed at ${coord.label}!`,
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

        const coordInput = interaction.fields.getTextInputValue('coordinate');
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
        
        if (result === 'hit') {
            resultMessage = `🎯 **HIT** at ${coord.label}! Enemy ship damaged!`;
            continueAttacking = true;
        } else if (result === 'sunk') {
            resultMessage = `💥 **SUNK** the enemy ${ship.name} at ${coord.label}! Continue attacking!`;
            continueAttacking = true;
        } else {
            resultMessage = `💧 **Miss** at ${coord.label}. Turn ends.`;
            continueAttacking = false;
        }

        // Check win condition
        const winner = game.checkWinCondition();
        if (winner) {
            // Handle game end
            const loserId = opponentId;
            const winnerBalance = await dbManager.getUserBalance(winner, guildId);
            const winnings = game.betAmount * 2;
            
            await dbManager.updateUserBalance(winner, guildId, { wallet: winnerBalance.wallet + winnings, game_active: false });
            await dbManager.updateUserBalance(loserId, guildId, { game_active: false });

            // Record game results
            try {
                await dbManager.updateGameStats(winner, true, 'battleship', winnings);
                await dbManager.updateGameStats(loserId, false, 'battleship', game.betAmount);
            } catch (error) {
                logger.error(`Failed to record battleship game results: ${error.message}`);
            }

            const finishedEmbed = game.createFinishedEmbed();
            const finishedComponents = game.createGameButtons();
            await game.message.edit({ embeds: [finishedEmbed], components: finishedComponents });

            const winEmbed = buildSessionEmbed({
                title: '🏆 Victory Achieved!',
                description: `${resultMessage}\n\n**Winner:** <@${winner}>\n**Prize:** ${fmt(winnings)}`,
                color: 0xFFD700
            });
            
            await interaction.reply({ embeds: [winEmbed], flags: MessageFlags.Ephemeral });
            removeBattleshipGame(channelId);
            return;
        }

        // Switch turns only on miss (per official Battleship rules)
        if (!continueAttacking) {
            game.switchTurn();
        }

        // Update main game message
        const { embed: battleEmbed, battleImage, bannerPath } = await game.createBattleEmbed();
        const battleComponents = game.createGameButtons();
        const battleAttachment = new AttachmentBuilder(battleImage, { name: 'battle.png' });
        const bannerAttachment = new AttachmentBuilder(bannerPath, { name: 'battleshipbanner.gif' });
        await game.message.edit({ embeds: [battleEmbed.setImage('attachment://battle.png')], files: [battleAttachment, bannerAttachment], components: battleComponents });

        const attackEmbed = buildSessionEmbed({
            title: '🎯 Attack Result',
            description: resultMessage,
            color: result === 'miss' ? 0x999999 : 0xFF0000
        });
        
        await interaction.reply({ embeds: [attackEmbed], flags: MessageFlags.Ephemeral });
    }
};