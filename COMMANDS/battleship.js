/**
 * Battleship command handler
 * Two-player classic Battleship with image boards and clear UI.
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

const { renderSingleBoard, renderDualBoards } = require('../UTILS/battleshipPanelUtil');

// Helpers
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
    // Try random placements until all ships placed
    const maxAttempts = 5000;
    let attempts = 0;
    for (const ship of board.ships) {
        let placed = false;
        while (!placed && attempts < maxAttempts) {
            attempts++;
            const dir = Math.random() < 0.5 ? HORIZONTAL : VERTICAL;
            const startRow = Math.floor(Math.random() * BOARD_SIZE);
            const startCol = Math.floor(Math.random() * BOARD_SIZE);
            if (board.canPlaceShip(ship, startRow, startCol, dir)) {
                board.placeShip(ship, startRow, startCol, dir);
                placed = true;
            }
        }
        if (!placed) return false;
    }
    return true;
}

function formatPlayersList(game) {
    return Array.from(game.players.values())
        .map((u, i) => `${i + 1}. ${u.displayName}`)
        .join('\n');
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
                const em = new EmbedBuilder()
                    .setTitle('❌ Game Already Active')
                    .setDescription(`A Battleship game is already running here. Players: \n${formatPlayersList(existing)}`)
                    .setColor(0xFF0000);
                await interaction.reply({ embeds: [em], flags: MessageFlags.Ephemeral });
                return;
            }

            // Ensure user exists
            await dbManager.ensureUser(userId, username);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Parse and validate amount
            const amountStr = interaction.options.getString('amount');
            let betAmount;
            try {
                betAmount = parseAmount(amountStr, balance.wallet);
            } catch (e) {
                await interaction.reply({ content: `❌ Invalid amount: ${e.message}`, flags: MessageFlags.Ephemeral });
                return;
            }
            const MIN_BET = 100;
            const MAX_BET = 1000000;
            if (betAmount < MIN_BET) {
                await interaction.reply({ content: `❌ Minimum bet is ${fmt(MIN_BET)}.`, flags: MessageFlags.Ephemeral });
                return;
            }
            if (betAmount > MAX_BET) {
                await interaction.reply({ content: `❌ Maximum bet is ${fmt(MAX_BET)}.`, flags: MessageFlags.Ephemeral });
                return;
            }
            if (betAmount > balance.wallet) {
                await interaction.reply({ content: `❌ You need ${fmt(betAmount)} but only have ${fmt(balance.wallet)}.`, flags: MessageFlags.Ephemeral });
                return;
            }

            // Deduct from creator and mark active
            await dbManager.updateUserBalance(userId, guildId, { wallet: balance.wallet - betAmount, game_active: true });

            // Create game
            const game = createBattleshipGame(channelId, interaction.user, betAmount);
            if (!game) {
                // Refund on failure
                await dbManager.updateUserBalance(userId, guildId, { wallet: balance.wallet, game_active: false });
                await interaction.reply({ content: '❌ Failed to create game.', flags: MessageFlags.Ephemeral });
                return;
            }

            const embed = game.createLobbyEmbed();
            const components = game.createGameButtons();

            const msg = await interaction.reply({ embeds: [embed], components, fetchReply: true });
            game.message = msg;
            logger.info(`Battleship game created by ${username} (${userId}) bet ${betAmount} in channel ${channelId}`);

        } catch (error) {
            logger.error(`Battleship /execute error: ${error.message}`);
            await interaction.reply({ content: '❌ Failed to start Battleship.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    },

    async handleButtonInteraction(interaction, action) {
        const channelId = interaction.channelId;
        const user = interaction.user;
        const guildId = await getGuildId(interaction);
        const game = getBattleshipGame(channelId);

        if (!game) {
            await interaction.reply({ content: '❌ No active Battleship game in this channel.', flags: MessageFlags.Ephemeral });
            return;
        }

        try {
            switch (action) {
                case 'join': {
                    if (game.state !== 'lobby') {
                        await interaction.reply({ content: '❌ Game already started.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    if (game.players.has(user.id)) {
                        await interaction.reply({ content: '❌ You are already in the game.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    if (game.players.size >= 2) {
                        await interaction.reply({ content: '❌ Game is full (2 players max).', flags: MessageFlags.Ephemeral });
                        return;
                    }

                    await dbManager.ensureUser(user.id, user.displayName);
                    const balance = await dbManager.getUserBalance(user.id, guildId);
                    if (balance.wallet < game.betAmount) {
                        await interaction.reply({ content: `❌ You need ${fmt(game.betAmount)} to join. You have ${fmt(balance.wallet)}.`, flags: MessageFlags.Ephemeral });
                        return;
                    }

                    // deduct
                    await dbManager.updateUserBalance(user.id, guildId, { wallet: balance.wallet - game.betAmount, game_active: true });
                    const added = game.addPlayer(user);
                    if (!added) {
                        // refund if failed
                        await dbManager.updateUserBalance(user.id, guildId, { wallet: balance.wallet, game_active: false });
                        await interaction.reply({ content: '❌ Failed to join.', flags: MessageFlags.Ephemeral });
                        return;
                    }

                    const embed = game.createLobbyEmbed();
                    const components = game.createGameButtons();
                    await interaction.update({ embeds: [embed], components });
                    break;
                }

                case 'start': {
                    if (user.id !== game.hostUser.id) {
                        await interaction.reply({ content: '❌ Only the host can start the game.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    if (!game.canStart()) {
                        await interaction.reply({ content: '❌ Need exactly 2 players to start.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    game.startPlacement();
                    const embed = game.createPlacementEmbed();
                    const components = game.createGameButtons();
                    await interaction.update({ embeds: [embed], components });
                    break;
                }

                case 'open_placement': {
                    // Send or update ephemeral placement panel for this user
                    const board = game.boards.get(user.id);
                    if (!board) {
                        await interaction.reply({ content: '❌ You are not a player in this game.', flags: MessageFlags.Ephemeral });
                        return;
                    }

                    const currentShip = board.getCurrentShip();
                    const title = currentShip ? `Place: ${currentShip.name} (${currentShip.length})` : 'All ships placed';
                    const buffer = await renderSingleBoard(board, { title: `${user.displayName} — ${title}`, showShips: true, attackingView: false });
                    const attachment = new AttachmentBuilder(buffer, { name: 'placement.png' });

                    const placeBtn = new ButtonBuilder().setCustomId('battleship_place').setLabel('Place Current Ship').setStyle(ButtonStyle.Primary).setDisabled(!currentShip);
                    const autoBtn = new ButtonBuilder().setCustomId('battleship_auto_place').setLabel('Auto-Place All').setStyle(ButtonStyle.Secondary).setDisabled(board.allShipsPlaced());
                    const doneBtn = new ButtonBuilder().setCustomId('battleship_finish_placement').setLabel('Finish Placement').setStyle(ButtonStyle.Success).setDisabled(!board.allShipsPlaced());
                    const row = new ActionRowBuilder().addComponents(placeBtn, autoBtn, doneBtn);

                    // Use gameSessionKit for consistent UI styling
                    const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
                    
                    const topFields = [{
                        name: '🚢 SHIP PLACEMENT PANEL',
                        value: currentShip 
                            ? `**Placing:** ${currentShip.name} (${currentShip.length} spaces)\n` +
                              `**Instructions:** Select coordinate (A1-J10) and direction (H/V)\n` +
                              `**Rules:** Ships cannot overlap but may touch`
                            : `**Status:** All ships deployed successfully!\n` +
                              `**Action:** Click Finish Placement to begin battle\n` +
                              `**Ready:** Your fleet awaits orders`,
                        inline: false
                    }];

                    const bankFields = [
                        { name: '📍 Coordinate', value: 'A1 to J10\n(Letter + Number)', inline: true },
                        { name: '🧭 Direction', value: 'H = Horizontal\nV = Vertical', inline: true },
                        { name: '🎯 Options', value: 'Manual Place\nAuto-Place All\nFinish Setup', inline: true }
                    ];

                    const embed = buildSessionEmbed({
                        title: '🚢 Private Ship Deployment',
                        topFields,
                        bankFields,
                        stageText: currentShip ? `PLACING: ${currentShip.name.toUpperCase()}` : 'FLEET READY',
                        color: 0x43A047,
                        footer: 'Deploy your fleet strategically • Private placement panel • ATIVE Casino',
                        imageUrl: 'attachment://placement.png'
                    });

                    // Send ephemeral (reply if fresh, else ephemeral followUp)
                    await interaction.reply({ embeds: [embed], components: [row], files: [attachment], flags: MessageFlags.Ephemeral });
                    break;
                }

                case 'place': {
                    // Show modal for coordinate + direction
                    const modal = new ModalBuilder().setCustomId('battleship_place_modal').setTitle('Place Current Ship');
                    const coord = new TextInputBuilder().setCustomId('coord').setLabel('Coordinate (e.g., A5 or B10)').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(2).setMaxLength(3);
                    const dir = new TextInputBuilder().setCustomId('dir').setLabel('Direction (H or V)').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(9).setPlaceholder('H or V');
                    modal.addComponents(new ActionRowBuilder().addComponents(coord), new ActionRowBuilder().addComponents(dir));
                    await interaction.showModal(modal);
                    break;
                }

                case 'auto_place': {
                    const board = game.boards.get(user.id);
                    if (!board) {
                        await interaction.reply({ content: '❌ You are not a player in this game.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    if (board.allShipsPlaced()) {
                        await interaction.reply({ content: '✅ Your ships are already placed.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    const success = await autoPlaceAllShips(board);
                    if (!success) {
                        await interaction.reply({ content: '❌ Auto-placement failed. Try manual placement.', flags: MessageFlags.Ephemeral });
                        return;
                    }

                    // Update main message progress
                    const embed = game.createPlacementEmbed();
                    const components = game.createGameButtons();
                    await game.message.edit({ embeds: [embed], components });

                    // Update ephemeral board
                    const buffer = await renderSingleBoard(board, { title: `${user.displayName} — All Ships Placed`, showShips: true });
                    const attachment = new AttachmentBuilder(buffer, { name: 'placement.png' });
                    await interaction.reply({ content: '✅ Ships placed!', files: [attachment], flags: MessageFlags.Ephemeral });
                    break;
                }

                case 'finish_placement': {
                    const board = game.boards.get(user.id);
                    if (!board || !board.allShipsPlaced()) {
                        await interaction.reply({ content: '❌ Place all ships first.', flags: MessageFlags.Ephemeral });
                        return;
                    }

                    // If both players ready, start battle
                    if (Array.from(game.boards.values()).every(b => b.allShipsPlaced())) {
                        game.startBattle();
                        const embed = game.createBattleEmbed();
                        const components = game.createGameButtons();
                        await game.message.edit({ embeds: [embed], components });
                        await interaction.reply({ content: '⚔️ Battle started!', flags: MessageFlags.Ephemeral });
                    } else {
                        const embed = game.createPlacementEmbed();
                        const components = game.createGameButtons();
                        await game.message.edit({ embeds: [embed], components });
                        await interaction.reply({ content: '✅ You are ready. Waiting for opponent…', flags: MessageFlags.Ephemeral });
                    }
                    break;
                }

                case 'attack': {
                    if (game.currentTurn !== user.id) {
                        await interaction.reply({ content: '❌ It is not your turn.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    const modal = new ModalBuilder().setCustomId('battleship_attack_modal').setTitle('Choose Your Target');
                    const coord = new TextInputBuilder().setCustomId('coord').setLabel('Coordinate (e.g., A5)').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(2).setMaxLength(3);
                    modal.addComponents(new ActionRowBuilder().addComponents(coord));
                    await interaction.showModal(modal);
                    break;
                }

                case 'help': {
                    const helpEmbed = game.constructor.createHelpEmbed();
                    await interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
                    break;
                }

                case 'view_board': {
                    const own = game.boards.get(user.id);
                    if (!own) {
                        await interaction.reply({ content: '❌ You are not a player in this game.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    const oppId = game.getOpponent(user.id);
                    const opp = oppId ? game.boards.get(oppId) : null;
                    let buffer;
                    if (opp) {
                        buffer = await renderDualBoards(own, opp, { title: 'Battleship — Boards' });
                    } else {
                        buffer = await renderSingleBoard(own, { title: 'Your Fleet', showShips: true });
                    }
                    const attachment = new AttachmentBuilder(buffer, { name: 'boards.png' });
                    
                    // Use gameSessionKit for consistent UI styling
                    const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
                    
                    const topFields = [{
                        name: '📟 TACTICAL BOARD VIEW',
                        value: opp 
                            ? `**Left Board:** Your fleet (ships visible)\n` +
                              `**Right Board:** Enemy waters (ships hidden)\n` +
                              `**Symbols:** ■ = Ship, X = Hit, O = Miss, ☠ = Sunk`
                            : `**Your Fleet:** Complete ship deployment view\n` +
                              `**Status:** All ships positioned and ready\n` +
                              `**Waiting:** For battle to commence`,
                        inline: false
                    }];

                    const bankFields = [
                        { name: '🚢 Your Fleet', value: 'Ships visible\nFull overview\nStrategic view', inline: true },
                        { name: '🎯 Enemy Waters', value: opp ? 'Ships hidden\nAttack results shown\nTactical intel' : 'Awaiting opponent', inline: true },
                        { name: '📊 Battle Status', value: game.state === 'playing' ? 'Combat active\nTurn-based battle\nReal-time updates' : 'Pre-battle\nDeployment phase\nStandby mode', inline: true }
                    ];

                    const embed = buildSessionEmbed({
                        title: '📟 Tactical Command View',
                        topFields,
                        bankFields,
                        stageText: 'BOARD OVERVIEW',
                        color: 0x1E88E5,
                        footer: 'Strategic overview • Real-time battle status • ATIVE Casino',
                        imageUrl: 'attachment://boards.png'
                    });

                    await interaction.reply({ embeds: [embed], files: [attachment], flags: MessageFlags.Ephemeral });
                    break;
                }

                default:
                    await interaction.reply({ content: 'Unknown Battleship action.', flags: MessageFlags.Ephemeral });
            }
        } catch (error) {
            logger.error(`Battleship button error: ${error.message}`);
            if (!interaction.replied) await interaction.reply({ content: '❌ Error handling action.', flags: MessageFlags.Ephemeral });
        }
    },

    async handleModal(interaction) {
        const channelId = interaction.channelId;
        const user = interaction.user;
        const guildId = await getGuildId(interaction);
        const game = getBattleshipGame(channelId);
        if (!game) {
            await interaction.reply({ content: '❌ No active Battleship game.', flags: MessageFlags.Ephemeral });
            return;
        }

        try {
            if (interaction.customId === 'battleship_place_modal') {
                const board = game.boards.get(user.id);
                if (!board) {
                    await interaction.reply({ content: '❌ You are not a player in this game.', flags: MessageFlags.Ephemeral });
                    return;
                }
                const currentShip = board.getCurrentShip();
                if (!currentShip) {
                    await interaction.reply({ content: '✅ All ships already placed.', flags: MessageFlags.Ephemeral });
                    return;
                }

                const coordIn = interaction.fields.getTextInputValue('coord');
                const dirIn = interaction.fields.getTextInputValue('dir');
                const coord = parseCoordinate(coordIn);
                const dir = parseDirection(dirIn);
                if (!coord || !dir) {
                    await interaction.reply({ content: '❌ Invalid coordinate or direction. Use A1-A10 and H/V.', flags: MessageFlags.Ephemeral });
                    return;
                }
                const ok = board.placeShip(currentShip, coord.row, coord.col, dir);
                if (!ok) {
                    await interaction.reply({ content: '❌ Cannot place ship there (out of bounds or overlapping).', flags: MessageFlags.Ephemeral });
                    return;
                }
                board.advanceShip();

                // Update placement progress on main message
                const embed = game.createPlacementEmbed();
                const components = game.createGameButtons();
                await game.message.edit({ embeds: [embed], components });

                // Show updated board
                const nextShip = board.getCurrentShip();
                const title = nextShip ? `Place: ${nextShip.name} (${nextShip.length})` : 'All ships placed';
                const buffer = await renderSingleBoard(board, { title: `${user.displayName} — ${title}`, showShips: true });
                const attachment = new AttachmentBuilder(buffer, { name: 'placement.png' });
                await interaction.reply({ content: '✅ Ship placed!', files: [attachment], flags: MessageFlags.Ephemeral });
                return;
            }

            if (interaction.customId === 'battleship_attack_modal') {
                if (game.state !== 'playing') {
                    await interaction.reply({ content: '❌ Game is not in battle phase.', flags: MessageFlags.Ephemeral });
                    return;
                }
                if (game.currentTurn !== user.id) {
                    await interaction.reply({ content: '❌ It is not your turn.', flags: MessageFlags.Ephemeral });
                    return;
                }
                const coordIn = interaction.fields.getTextInputValue('coord');
                const coord = parseCoordinate(coordIn);
                if (!coord) {
                    await interaction.reply({ content: '❌ Invalid coordinate. Use A1-A10.', flags: MessageFlags.Ephemeral });
                    return;
                }
                const oppId = game.getOpponent(user.id);
                const oppBoard = game.boards.get(oppId);
                const { result, ship } = oppBoard.attack(coord.row, coord.col);
                if (result === 'already_attacked') {
                    await interaction.reply({ content: `❌ You already attacked ${coord.label}.`, flags: MessageFlags.Ephemeral });
                    return;
                }
                if (result === 'invalid') {
                    await interaction.reply({ content: '❌ Invalid target.', flags: MessageFlags.Ephemeral });
                    return;
                }

                let desc;
                if (result === 'hit') desc = `🎯 HIT at ${coord.label}!`;
                else if (result === 'sunk') desc = `💥 SUNK the enemy ${ship.name} at ${coord.label}!`;
                else desc = `💧 Miss at ${coord.label}.`;

                // Check win
                const winner = game.checkWinCondition();
                if (winner) {
                    game.state = 'finished';

                    // Payout
                    const loserId = game.getOpponent(winner);
                    const winnerBalance = await dbManager.getUserBalance(winner, guildId);
                    await dbManager.updateUserBalance(winner, guildId, { wallet: winnerBalance.wallet + (game.betAmount * 2) });
                    await dbManager.updateUserBalance(winner, guildId, { game_active: false });
                    await dbManager.updateUserBalance(loserId, guildId, { game_active: false });

                    try { await dbManager.recordGameResult(winner, guildId, 'battleship', true, game.betAmount, game.betAmount * 2, { opponent: `<@${loserId}>` }); } catch {}
                    try { await dbManager.recordGameResult(loserId, guildId, 'battleship', false, game.betAmount, 0, { opponent: `<@${winner}>` }); } catch {}

                    const embed = game.createFinishedEmbed();
                    const components = game.createGameButtons();
                    await game.message.edit({ embeds: [embed], components });
                    await interaction.reply({ content: `🏆 ${desc}\n\nWinner: <@${winner}>`, flags: MessageFlags.Ephemeral });
                    removeBattleshipGame(channelId);
                    return;
                }

                // Switch turn only on miss (official Battleship rules)
                // Per PDF: continue attacking after a hit
                if (result === 'miss') {
                    game.switchTurn();
                }
                // On hit or sunk, player continues their turn

                const embed = game.createBattleEmbed();
                const components = game.createGameButtons();
                await game.message.edit({ embeds: [embed], components });
                await interaction.reply({ content: desc, flags: MessageFlags.Ephemeral });
                return;
            }

            await interaction.reply({ content: 'Unknown Battleship modal.', flags: MessageFlags.Ephemeral });
        } catch (error) {
            logger.error(`Battleship modal error: ${error.message}`);
            if (!interaction.replied) await interaction.reply({ content: '❌ Error handling modal.', flags: MessageFlags.Ephemeral });
        }
    },

    async handleButtonInteraction(interaction, action) {
        const userId = interaction.user.id;
        const channelId = interaction.channelId;
        const guildId = await getGuildId(interaction);
        
        try {
            logger.info(`Handling battleship button interaction: ${action} by user ${userId} in channel ${channelId}`);
            
            const game = getBattleshipGame(channelId);
            if (!game) {
                logger.warn(`No battleship game found for channel ${channelId}`);
                await interaction.reply({ 
                    content: '❌ No active Battleship game found in this channel.', 
                    flags: MessageFlags.Ephemeral 
                });
                return;
            }

            switch (action) {
                case 'join':
                    logger.info(`User ${userId} attempting to join battleship game in channel ${channelId}`);
                    
                    if (game.players.has(userId)) {
                        await interaction.reply({ 
                            content: '❌ You are already in this game!', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return;
                    }

                    if (game.players.size >= 2) {
                        await interaction.reply({ 
                            content: '❌ This game is already full!', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return;
                    }

                    if (game.state !== 'lobby') {
                        await interaction.reply({ 
                            content: '❌ This game has already started!', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return;
                    }

                    // Check user balance
                    const joinUserBalance = await dbManager.getUserBalance(userId, guildId);
                    if (joinUserBalance.wallet < game.betAmount) {
                        await interaction.reply({
                            content: `❌ You need ${fmt(game.betAmount)} credits to join this game! You only have ${fmt(joinUserBalance.wallet)}.`,
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    // Check if user is in another game
                    const activeGame = getUserGame(userId);
                    if (activeGame) {
                        await interaction.reply({ 
                            content: '❌ You are already in another game! Finish it first.', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return;
                    }

                    // Add player to game
                    const success = game.addPlayer(interaction.user);
                    if (!success) {
                        logger.error(`Failed to add player ${userId} to battleship game`);
                        await interaction.reply({ 
                            content: '❌ Failed to join the game. Please try again.', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return;
                    }

                    // Deduct bet amount from both players and start game
                    if (game.players.size === 2) {
                        logger.info(`Battleship game starting with 2 players in channel ${channelId}`);
                        
                        // Deduct bet from both players
                        for (const [playerId] of game.players) {
                            await dbManager.updateUserBalance(playerId, guildId, { 
                                wallet: -game.betAmount, 
                                game_active: true 
                            });
                        }

                        game.startPlacement();
                        
                        const embed = game.createPlacementEmbed();
                        const components = game.createGameButtons();
                        
                        await interaction.update({ embeds: [embed], components });
                        
                        await interaction.followUp({
                            content: '⚓ **Battle stations!** Both players must now place their ships using the buttons below.',
                            flags: MessageFlags.Ephemeral
                        });
                        
                        logger.info(`Battleship placement phase started for channel ${channelId}`);
                    } else {
                        // Update lobby display
                        const embed = game.createLobbyEmbed();
                        const components = game.createGameButtons();
                        
                        await interaction.update({ embeds: [embed], components });
                        
                        await interaction.followUp({ 
                            content: '⚓ Joined the battle! Waiting for one more player...', 
                            flags: MessageFlags.Ephemeral 
                        });
                    }
                    break;

                case 'help':
                    const helpEmbed = game.createHelpEmbed();
                    await interaction.reply({ 
                        embeds: [helpEmbed], 
                        flags: MessageFlags.Ephemeral 
                    });
                    break;

                case 'place_ships':
                    if (!game.players.has(userId)) {
                        await interaction.reply({ 
                            content: '❌ You are not in this game!', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return;
                    }

                    if (game.state !== 'placing') {
                        await interaction.reply({ 
                            content: '❌ Ship placement is not available right now!', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return;
                    }

                    const board = game.boards.get(userId);
                    if (board.allShipsPlaced()) {
                        await interaction.reply({ 
                            content: '❌ You have already placed all your ships!', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return;
                    }

                    // Show placement modal
                    const currentShip = board.getNextShipToPlace();
                    const modal = new ModalBuilder()
                        .setCustomId(`battleship_place_${userId}`)
                        .setTitle(`⚓ Place ${currentShip.name} (${currentShip.length} spaces)`);

                    const coordinateInput = new TextInputBuilder()
                        .setCustomId('coordinate')
                        .setLabel('Starting coordinate (e.g., A5)')
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

                    const firstRow = new ActionRowBuilder().addComponents(coordinateInput);
                    const secondRow = new ActionRowBuilder().addComponents(directionInput);

                    modal.addComponents(firstRow, secondRow);
                    await interaction.showModal(modal);
                    break;

                case 'auto_place':
                    if (!game.players.has(userId)) {
                        await interaction.reply({ 
                            content: '❌ You are not in this game!', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return;
                    }

                    if (game.state !== 'placing') {
                        await interaction.reply({ 
                            content: '❌ Ship placement is not available right now!', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return;
                    }

                    const autoBoard = game.boards.get(userId);
                    if (autoBoard.allShipsPlaced()) {
                        await interaction.reply({ 
                            content: '❌ You have already placed all your ships!', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return;
                    }

                    // Auto-place remaining ships
                    const autoPlaceSuccess = await autoPlaceAllShips(autoBoard);
                    if (!autoPlaceSuccess) {
                        await interaction.reply({ 
                            content: '❌ Failed to auto-place ships. Please try manual placement.', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return;
                    }

                    // Check if all players have placed ships
                    const allPlaced = Array.from(game.players.keys()).every(pid => 
                        game.boards.get(pid).allShipsPlaced()
                    );

                    if (allPlaced) {
                        game.startBattle();
                        const embed = game.createBattleEmbed();
                        const components = game.createGameButtons();
                        await interaction.update({ embeds: [embed], components });
                        await interaction.followUp({ 
                            content: '⚓ All ships placed! Battle has begun!', 
                            flags: MessageFlags.Ephemeral 
                        });
                    } else {
                        const embed = game.createPlacementEmbed();
                        const components = game.createGameButtons();
                        await interaction.update({ embeds: [embed], components });
                        await interaction.followUp({ 
                            content: '⚓ Ships auto-placed! Waiting for your opponent...', 
                            flags: MessageFlags.Ephemeral 
                        });
                    }
                    break;

                case 'attack':
                    if (!game.players.has(userId)) {
                        await interaction.reply({ 
                            content: '❌ You are not in this game!', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return;
                    }

                    if (game.state !== 'playing') {
                        await interaction.reply({ 
                            content: '❌ The battle has not started yet!', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return;
                    }

                    if (game.currentTurn !== userId) {
                        await interaction.reply({ 
                            content: '❌ It is not your turn!', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return;
                    }

                    // Show attack modal
                    const attackModal = new ModalBuilder()
                        .setCustomId(`battleship_attack_${userId}`)
                        .setTitle('🎯 Fire at Enemy Position');

                    const attackCoordinateInput = new TextInputBuilder()
                        .setCustomId('coordinate')
                        .setLabel('Target coordinate (e.g., A5)')
                        .setStyle(TextInputStyle.Short)
                        .setMinLength(2)
                        .setMaxLength(3)
                        .setRequired(true)
                        .setPlaceholder('A5, B10, etc.');

                    const attackRow = new ActionRowBuilder().addComponents(attackCoordinateInput);
                    attackModal.addComponents(attackRow);
                    
                    await interaction.showModal(attackModal);
                    break;

                case 'open_placement':
                    // Send or update ephemeral placement panel for this user
                    if (!game.players.has(userId)) {
                        await interaction.reply({ 
                            content: '❌ You are not a player in this game.', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return;
                    }

                    const board = game.boards.get(userId);
                    if (!board) {
                        await interaction.reply({ content: '❌ You are not a player in this game.', flags: MessageFlags.Ephemeral });
                        return;
                    }

                    const currentShip = board.getCurrentShip();
                    const title = currentShip ? `Place: ${currentShip.name} (${currentShip.length})` : 'All ships placed';
                    const buffer = await renderSingleBoard(board, { title: `${interaction.user.displayName} — ${title}`, showShips: true, attackingView: false });
                    const attachment = new AttachmentBuilder(buffer, { name: 'placement.png' });

                    const placeBtn = new ButtonBuilder().setCustomId('battleship_place_ships').setLabel('Place Current Ship').setStyle(ButtonStyle.Primary).setDisabled(!currentShip);
                    const autoBtn = new ButtonBuilder().setCustomId('battleship_auto_place').setLabel('Auto-Place All').setStyle(ButtonStyle.Secondary).setDisabled(board.allShipsPlaced());
                    const doneBtn = new ButtonBuilder().setCustomId('battleship_finish_placement').setLabel('Finish Placement').setStyle(ButtonStyle.Success).setDisabled(!board.allShipsPlaced());
                    const row = new ActionRowBuilder().addComponents(placeBtn, autoBtn, doneBtn);

                    // Use gameSessionKit for consistent UI styling
                    const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
                    
                    const topFields = [{
                        name: '⚓ SHIP PLACEMENT COMMAND CENTER',
                        value: currentShip 
                            ? `**Current Ship:** ${currentShip.name} (${currentShip.length} spaces)\n` +
                              `**Instructions:** Use "Place Current Ship" to position manually\n` +
                              `**Quick Option:** Use "Auto-Place All" for instant setup`
                            : `**Status:** All ships positioned successfully!\n` +
                              `**Next Step:** Click "Finish Placement" to confirm setup\n` +
                              `**Ready:** Your fleet is prepared for battle!`,
                        inline: false
                    }];

                    const bankFields = [
                        { name: '🚢 Ships Remaining', value: board.getCurrentShip() ? `${board.shipsToPlace.length} ships left` : 'All ships placed', inline: true },
                        { name: '⚓ Fleet Status', value: board.allShipsPlaced() ? '✅ Ready for Battle' : '🔧 Setup in Progress', inline: true },
                        { name: '🎯 Placement Mode', value: 'Private tactical panel', inline: true }
                    ];

                    const embed = buildSessionEmbed({
                        title: '⚓ Naval Command Interface',
                        topFields,
                        bankFields,
                        stageText: currentShip ? 'SHIP DEPLOYMENT' : 'FLEET READY',
                        color: currentShip ? 0xFFAA00 : 0x00FF00,
                        footer: 'Ship placement • Tactical interface • ATIVE Casino',
                        imageUrl: 'attachment://placement.png'
                    });

                    await interaction.reply({ embeds: [embed], files: [attachment], components: [row], flags: MessageFlags.Ephemeral });
                    break;

                case 'finish_placement':
                    if (!game.players.has(userId)) {
                        await interaction.reply({ 
                            content: '❌ You are not a player in this game.', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return;
                    }

                    const finishBoard = game.boards.get(userId);
                    if (!finishBoard.allShipsPlaced()) {
                        await interaction.reply({ 
                            content: '❌ You must place all ships first!', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return;
                    }

                    // Mark this player as ready
                    finishBoard.ready = true;

                    // Check if both players are ready to start battle
                    const allReady = Array.from(game.boards.values()).every(b => b.allShipsPlaced() && b.ready);

                    if (allReady) {
                        game.startBattle();
                        
                        const embed = game.createBattleEmbed();
                        const components = game.createGameButtons();
                        await interaction.update({ embeds: [embed], components });

                        await interaction.followUp({
                            content: '⚔️ **Battle commenced!** All ships deployed. The fight begins now!',
                            flags: MessageFlags.Ephemeral
                        });
                    } else {
                        await interaction.reply({
                            content: '✅ Ships confirmed! Waiting for the other player to finish placement...',
                            flags: MessageFlags.Ephemeral
                        });
                    }
                    break;

                default:
                    logger.warn(`Unknown battleship action: ${action}`);
                    await interaction.reply({ 
                        content: '❌ Unknown action. Please try again.', 
                        flags: MessageFlags.Ephemeral 
                    });
                    break;
            }

        } catch (error) {
            logger.error(`Error in battleship button handler for action ${action}:`, error);
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: '❌ An error occurred while processing your action. Please try again.', 
                    flags: MessageFlags.Ephemeral 
                });
            } else if (interaction.deferred) {
                await interaction.editReply({ 
                    content: '❌ An error occurred while processing your action. Please try again.' 
                });
            }
        }
    }
};

