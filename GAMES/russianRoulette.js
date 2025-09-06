/**
 * RUSSIAN ROULETTE - Fully Automated Multiplayer Game Engine
 * Last person standing wins the entire pot
 * Features dramatic flavor text, automatic turns, and chamber mechanics
 */

const {
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    MessageFlags
} = require('discord.js');

const dbManager = require('../UTILS/database');
const { fmt, sendLogMessage } = require('../UTILS/common');
const sessionManager = require('../UTILS/sessionManager');
const logger = require('../UTILS/logger');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const { PayoutManager, GameResult } = require('../UTILS/gameUtils');
const { secureRandomInt, secureRandomFloat, secureRandomChoice, generateProvablyFairRandom } = require('../UTILS/rng');

// Game Configuration
const CONFIG = {
    MIN_PLAYERS: 2,
    MAX_PLAYERS: null, // Unlimited players
    JOIN_TIME: 60000,      // 60 seconds to join
    COUNTDOWN_TIME: 10000,  // 10 second pre-game countdown
    TURN_INTERVAL: 4000,   // 4 seconds per turn
    TENSION_BUILD: 2000,   // 2 seconds tension before trigger
    RELOAD_TIME: 6000,     // 6 seconds for reload sequence
    CHAMBER_SIZE: 6,       // 6-shot revolver
    JAM_CHANCE: 0.15,      // 15% chance gun jams
    HOUSE_EDGE: 0.02       // 2% house fee
};

// Game States
const GameState = {
    JOINING: 'joining',
    STARTING: 'starting', 
    PLAYING: 'playing',
    RELOADING: 'reloading',
    FINISHED: 'finished'
};

/**
 * Russian Roulette Game Engine - Fully Automated
 */
class RussianRouletteGame {
    constructor(sessionId, gameData) {
        this.sessionId = sessionId;
        this.channelId = gameData.channelId;
        this.guildId = gameData.guildId;
        this.hostId = gameData.hostId;
        this.hostName = gameData.hostName;
        this.entryAmount = gameData.entryAmount;
        this.joinTime = gameData.joinTime || CONFIG.JOIN_TIME;
        this.forceStart = gameData.forceStart || false;
        
        // Game state
        this.state = GameState.JOINING;
        this.players = new Map(); // userId -> player data
        this.playerOrder = []; // Ordered list for turns
        this.currentPlayerIndex = 0;
        this.currentTurn = 1;
        this.shotsThisChamber = 0;
        
        // Revolver mechanics
        this.chamber = this.generateChamber();
        this.currentShot = 0;
        
        // Timers
        this.joinTimer = null;
        this.gameTimer = null;
        this.turnTimer = null;
        
        // UI
        this.gameMessage = null;
        this.client = null;
        
        logger.info(`Russian Roulette game created: ${this.entryAmount} entry, host: ${this.hostName}`);
    }

    /**
     * Generate revolver chamber with random bullet placement
     */
    generateChamber() {
        const chamber = new Array(CONFIG.CHAMBER_SIZE).fill(false);
        
        // Place 1-2 bullets randomly
        const bulletCount = secureRandomFloat() < 0.7 ? 1 : 2; // 70% chance of 1 bullet, 30% chance of 2
        
        for (let i = 0; i < bulletCount; i++) {
            let position;
            do {
                position = secureRandomInt(0, CONFIG.CHAMBER_SIZE);
            } while (chamber[position]); // Ensure no duplicate positions
            
            chamber[position] = true;
        }
        
        logger.info(`Chamber generated: ${chamber.map((bullet, i) => bullet ? `💀${i}` : `⚫${i}`).join(' ')}`);
        return chamber;
    }

    /**
     * Add player to game
     */
    async addPlayer(userId, username) {
        if (this.state !== GameState.JOINING) {
            return { success: false, reason: 'Game no longer accepting players' };
        }
        
        if (this.players.has(userId)) {
            return { success: false, reason: 'Already joined this game' };
        }
        
        // No player limit - unlimited players allowed

        // Validate and deduct entry fee
        try {
            const userBalance = await dbManager.getUserBalance(userId, this.guildId);
            
            // Validate balance values
            const wallet = isNaN(userBalance.wallet) ? 0 : userBalance.wallet;
            const bank = isNaN(userBalance.bank) ? 0 : userBalance.bank;
            const entryAmount = isNaN(this.entryAmount) ? 0 : this.entryAmount;
            
            if (wallet < entryAmount) {
                return { success: false, reason: 'Insufficient funds', balance: wallet };
            }

            const newWallet = wallet - entryAmount;
            const success = await dbManager.setUserBalance(
                userId, 
                this.guildId, 
                newWallet, 
                bank
            );
            
            if (!success) {
                return { success: false, reason: 'Failed to process payment' };
            }
        } catch (error) {
            logger.error(`Payment error for ${userId}: ${error.message}`);
            return { success: false, reason: 'Payment processing error' };
        }

        // Add player
        this.players.set(userId, {
            id: userId,
            username: username,
            alive: true,
            turnsTaken: 0,
            joinedAt: Date.now()
        });

        logger.info(`Player ${username} joined Russian Roulette (${this.players.size} players)`);
        return { success: true };
    }

    /**
     * Start the join phase with countdown
     */
    async startJoinPhase(client, interaction) {
        this.client = client;
        
        // Add host as first player
        await this.addPlayer(this.hostId, this.hostName);
        
        // Create enhanced button set for better visibility
        const joinButton = new ButtonBuilder()
            .setCustomId(`rr_join_${this.sessionId}`)
            .setLabel(`🎯 JOIN RUSSIAN ROULETTE`)
            .setStyle(ButtonStyle.Danger)
            .setEmoji('💀');
            
        const betInfoButton = new ButtonBuilder()
            .setCustomId(`rr_info_${this.sessionId}`)
            .setLabel(`Entry: ${fmt(this.entryAmount)}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true);
            
        const buttons = [joinButton, betInfoButton];
        
        // Add start match button (always visible, host-only)
        const startMatchButton = new ButtonBuilder()
            .setCustomId(`rr_startmatch_${this.sessionId}`)
            .setLabel(`▶️ START MATCH`)
            .setStyle(ButtonStyle.Success)
            .setEmoji('🎮')
            .setDisabled(this.players.size < CONFIG.MIN_PLAYERS);
            
        buttons.push(startMatchButton);
        
        // Add force start button if enabled (separate from manual start)
        if (this.forceStart) {
            const forceStartButton = new ButtonBuilder()
                .setCustomId(`rr_forcestart_${this.sessionId}`)
                .setLabel(`🚀 AUTO-START`)
                .setStyle(ButtonStyle.Primary)
                .setEmoji('⚡')
                .setDisabled(true); // Just informational when force start is enabled
                
            buttons.push(forceStartButton);
        }
        
        const actionRow = new ActionRowBuilder().addComponents(buttons);
        
        // Initial game message
        const embed = this.createJoinEmbed();
        const reply = await interaction.editReply({ 
            embeds: [embed], 
            components: [actionRow]
        }).catch(async (error) => {
            logger.error('Failed to send initial Russian Roulette reply:', error);
            throw error;
        });
        
        // Get the message for future updates
        try {
            this.gameMessage = await interaction.fetchReply();
        } catch (error) {
            logger.error('Failed to fetch reply for Russian Roulette game:', error);
            this.gameMessage = reply;
        }
        
        // Set up button interaction handler
        this.setupButtonHandler();
        
        // Start join timer with custom time
        this.joinTimer = setTimeout(() => {
            this.startGame();
        }, this.joinTime);
        
        // Store game start timestamp for Discord timestamp display
        this.gameStartTime = Date.now();
        this.gameEndTime = this.gameStartTime + this.joinTime;
        
        // No need for countdown updates since we use Discord timestamps
    }

    /**
     * Handle join button interactions
     */
    setupButtonHandler() {
        if (!this.client) return;
        
        const filter = (i) => i.customId.startsWith(`rr_`) && i.customId.includes(this.sessionId);
        const collector = this.gameMessage.createMessageComponentCollector({ 
            filter, 
            time: this.joinTime + 5000 
        });

        collector.on('collect', async (interaction) => {
            const userId = interaction.user.id;
            const username = interaction.user.displayName;
            
            // Handle different button types
            if (interaction.customId === `rr_join_${this.sessionId}`) {
                // Join button
                const result = await this.addPlayer(userId, username);
                
                if (result.success) {
                    await interaction.reply({
                        content: `🎯 ${username} has joined the deadly game!`,
                        flags: MessageFlags.Ephemeral
                    });
                    
                    // Update the main message
                    await this.updateJoinMessage();
                    
                    // No auto-start for unlimited players
                    // Force start when minimum players reached and forceStart is enabled
                    if (this.forceStart && this.players.size >= CONFIG.MIN_PLAYERS) {
                        clearTimeout(this.joinTimer);
                        setTimeout(() => this.startGame(), 5000); // 5 second delay to allow more joins
                    }
                } else {
                    await interaction.reply({
                        content: `❌ ${result.reason}${result.balance ? ` (You have ${fmt(result.balance)})` : ''}`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            } else if (interaction.customId === `rr_startmatch_${this.sessionId}`) {
                // Manual start match button - only host can use this
                if (userId !== this.hostId) {
                    await interaction.reply({
                        content: `❌ Only the game host can start the match!`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                if (this.players.size >= CONFIG.MIN_PLAYERS) {
                    await interaction.reply({
                        content: `🎮 Starting match with ${this.players.size} players!`,
                        flags: MessageFlags.Ephemeral
                    });
                    
                    clearTimeout(this.joinTimer);
                    setTimeout(() => this.startGame(), 1000); // 1 second delay
                } else {
                    await interaction.reply({
                        content: `❌ Need at least ${CONFIG.MIN_PLAYERS} players to start!`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            } else if (interaction.customId === `rr_forcestart_${this.sessionId}`) {
                // Auto-start info button (disabled, just informational)
                await interaction.reply({
                    content: `ℹ️ Auto-start is enabled! Game will automatically start when timer ends or minimum players join.`,
                    flags: MessageFlags.Ephemeral
                });
            }
        });
        
        collector.on('end', () => {
            logger.info('Join phase collector ended');
        });
    }


    /**
     * Update join phase message
     */
    async updateJoinMessage() {
        if (!this.gameMessage || this.state !== GameState.JOINING) return;
        
        try {
            const embed = this.createJoinEmbed();
            
            // Recreate buttons with updated states
            const joinButton = new ButtonBuilder()
                .setCustomId(`rr_join_${this.sessionId}`)
                .setLabel(`🎯 JOIN RUSSIAN ROULETTE`)
                .setStyle(ButtonStyle.Danger)
                .setEmoji('💀');
                
            const betInfoButton = new ButtonBuilder()
                .setCustomId(`rr_info_${this.sessionId}`)
                .setLabel(`Entry: ${fmt(this.entryAmount)}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true);
                
            const buttons = [joinButton, betInfoButton];
            
            // Add start match button (always visible, host-only)
            const startMatchButton = new ButtonBuilder()
                .setCustomId(`rr_startmatch_${this.sessionId}`)
                .setLabel(`▶️ START MATCH`)
                .setStyle(ButtonStyle.Success)
                .setEmoji('🎮')
                .setDisabled(this.players.size < CONFIG.MIN_PLAYERS);
                
            buttons.push(startMatchButton);
            
            // Add force start button if enabled (separate from manual start)
            if (this.forceStart) {
                const forceStartButton = new ButtonBuilder()
                    .setCustomId(`rr_forcestart_${this.sessionId}`)
                    .setLabel(`🚀 AUTO-START`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⚡')
                    .setDisabled(true); // Just informational when force start is enabled
                    
                buttons.push(forceStartButton);
            }
            
            const actionRow = new ActionRowBuilder().addComponents(buttons);
            
            await this.gameMessage.edit({ 
                embeds: [embed], 
                components: [actionRow] 
            });
        } catch (error) {
            logger.error(`Failed to update join message: ${error.message}`);
        }
    }

    /**
     * Create join phase embed
     */
    createJoinEmbed() {
        // Use Discord timestamp for accurate time display
        const endTimestamp = Math.floor(this.gameEndTime / 1000);
        const discordTimestamp = `<t:${endTimestamp}:R>`; // Relative time
        
        // Format player list in code blocks without order numbers (randomized display)
        const playerArray = Array.from(this.players.values());
        const shuffledPlayers = [...playerArray].sort(() => secureRandomFloat() - 0.5); // Randomize display order
        const playerList = shuffledPlayers.length > 0 ? 
            '```\n' + shuffledPlayers.map(player => `🎯 ${player.username}`).join('\n') + '\n```' : 
            '```\nWaiting for players...\n```';

        const totalPot = this.players.size * this.entryAmount;
        const winnerPot = totalPot; // No house fee - winner takes all

        // Configuration info
        const customTime = this.joinTime !== CONFIG.JOIN_TIME;
        const hasCustomSettings = this.forceStart || customTime;
        
        const configFields = [];
        
        // Main rules field with Discord timestamp
        configFields.push({
            name: '💀 THE RULES',
            value: `**Entry Fee:** ${fmt(this.entryAmount)}\n**Players:** ${this.players.size} joined\n**Ends:** ${discordTimestamp}\n**Winner Takes:** ${fmt(winnerPot)}`,
            inline: false
        });
        
        // Custom settings field (only show if there are custom settings)
        if (hasCustomSettings) {
            const settings = [];
            if (customTime) settings.push(`⏱️ **Custom Timer:** ${Math.floor(this.joinTime / 1000)}s`);
            if (this.forceStart) settings.push(`🚀 **Force Start:** Enabled (starts with 2+ players)`);
            
            configFields.push({
                name: '⚙️ CUSTOM SETTINGS',
                value: settings.join('\n'),
                inline: false
            });
        }
        
        // Players field
        configFields.push({
            name: '🎯 CURRENT PLAYERS',
            value: playerList,
            inline: false
        });
        
        // Game info field
        configFields.push({
            name: '⚰️ GAME INFO',
            value: `• Fully automated - no manual actions required\n• Gun has 6 chambers with 1-2 bullets\n• 15% chance of gun jamming (safe)\n• Last survivor wins the entire pot\n• Game starts automatically when timer ends${this.forceStart ? ' (or when minimum players join)' : ''}`,
            inline: false
        });

        return buildSessionEmbed({
            title: '🔫 RUSSIAN ROULETTE - JOIN PHASE',
            topFields: configFields,
            stageText: `WAITING FOR PLAYERS...`,
            color: 0xFF0000,
            footer: 'Click "Join" to enter this deadly game'
        });
    }

    /**
     * Start the actual game
     */
    async startGame() {
        if (this.players.size < CONFIG.MIN_PLAYERS) {
            await this.cancelGame('Not enough players');
            return;
        }

        this.state = GameState.STARTING;
        clearTimeout(this.joinTimer);
        
        // Remove join button and start countdown
        await this.startCountdown();
    }

    /**
     * Pre-game countdown with dramatic preparation
     */
    async startCountdown() {
        this.state = GameState.STARTING;
        
        // Disable join button
        const disabledButton = new ButtonBuilder()
            .setCustomId('rr_join_disabled')
            .setLabel('Game Starting...')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true);
            
        const actionRow = new ActionRowBuilder().addComponents(disabledButton);
        
        // Create player order
        this.playerOrder = Array.from(this.players.keys());
        this.shuffleArray(this.playerOrder); // Randomize turn order
        
        const countdownMessages = [
            '🔫 Loading the revolver...',
            '💀 Inserting bullets into chamber...',
            '🎯 Randomizing turn order...',
            '⚰️ Preparing for the ultimate test...',
            '🔄 *Cylinder spins ominously*...',
            '🎰 May the odds be in your favor...',
            '💀 Game begins... NOW!'
        ];
        
        for (let i = 0; i < countdownMessages.length; i++) {
            const embed = this.createCountdownEmbed(countdownMessages[i], i + 1, countdownMessages.length);
            
            try {
                await this.gameMessage.edit({ 
                    embeds: [embed], 
                    components: i === countdownMessages.length - 1 ? [] : [actionRow]
                });
            } catch (error) {
                logger.error(`Failed to update countdown: ${error.message}`);
            }
            
            if (i < countdownMessages.length - 1) {
                await this.sleep(1500);
            }
        }
        
        // Start actual gameplay
        await this.sleep(2000);
        this.startGameplay();
    }

    /**
     * Create countdown embed
     */
    createCountdownEmbed(message, step, totalSteps) {
        const playerList = this.playerOrder
            .map((playerId, i) => {
                const player = this.players.get(playerId);
                return `${i + 1}. ${player.username} ${i === 0 ? '🎯' : '⚫'}`;
            })
            .join('\n');

        const totalPot = this.players.size * this.entryAmount;
        const winnerPot = totalPot; // Winner takes all - no house fee

        return buildSessionEmbed({
            title: '🔫 RUSSIAN ROULETTE - PREPARING...',
            topFields: [
                {
                    name: '💀 PREPARATION PHASE',
                    value: `**${message}**\n\n**Progress:** ${step}/${totalSteps}\n**Players:** ${this.players.size}\n**Prize Pool:** ${fmt(winnerPot)}`,
                    inline: false
                },
                {
                    name: '🎯 TURN ORDER',
                    value: playerList,
                    inline: false
                }
            ],
            stageText: 'PREPARING FOR BATTLE...',
            color: 0xFF6600,
            footer: 'Game will begin shortly...'
        });
    }

    /**
     * Start the main gameplay loop
     */
    startGameplay() {
        this.state = GameState.PLAYING;
        this.currentPlayerIndex = 0;
        this.currentTurn = 1;
        this.currentShot = 0;
        
        logger.info(`Russian Roulette gameplay started with ${this.players.size} players`);
        this.processTurn();
    }

    /**
     * Process current player's turn (fully automated)
     */
    async processTurn() {
        if (this.state !== GameState.PLAYING) return;
        
        // Check if we need to reload
        if (this.currentShot >= CONFIG.CHAMBER_SIZE) {
            await this.reloadSequence();
            return;
        }
        
        // Check win condition
        const alivePlayers = Array.from(this.players.values()).filter(p => p.alive);
        if (alivePlayers.length <= 1) {
            await this.endGame();
            return;
        }
        
        // Find next alive player
        while (!this.players.get(this.playerOrder[this.currentPlayerIndex])?.alive) {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerOrder.length;
        }
        
        const currentPlayerId = this.playerOrder[this.currentPlayerIndex];
        const currentPlayer = this.players.get(currentPlayerId);
        
        // Show turn start
        await this.updateGameDisplay('turn_start', currentPlayer);
        await this.sleep(CONFIG.TENSION_BUILD);
        
        // Pull trigger
        const result = this.pullTrigger();
        currentPlayer.turnsTaken++;
        
        // Process result
        if (result.jammed) {
            await this.updateGameDisplay('jammed', currentPlayer, result);
        } else if (result.bullet) {
            currentPlayer.alive = false;
            await this.updateGameDisplay('eliminated', currentPlayer, result);
        } else {
            await this.updateGameDisplay('empty', currentPlayer, result);
        }
        
        await this.sleep(2000);
        
        // Move to next player
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerOrder.length;
        this.currentTurn++;
        
        // Continue game
        this.turnTimer = setTimeout(() => this.processTurn(), 1000);
    }

    /**
     * Pull the trigger - determine outcome
     */
    pullTrigger() {
        // Check for jam first
        if (secureRandomFloat() < CONFIG.JAM_CHANCE) {
            return { 
                bullet: false, 
                jammed: true, 
                empty: false,
                shot: this.currentShot
            };
        }
        
        // Check chamber
        const bullet = this.chamber[this.currentShot];
        this.currentShot++;
        
        return {
            bullet: bullet,
            jammed: false,
            empty: !bullet,
            shot: this.currentShot - 1
        };
    }

    /**
     * Dramatic reload sequence
     */
    async reloadSequence() {
        this.state = GameState.RELOADING;
        
        const reloadMessages = [
            '🔄 *Click* Chamber empty...',
            '💀 Ejecting spent shells...',
            '🎯 Loading fresh bullets...',
            '🔫 *Cylinder spins dramatically*...',
            '⚡ Locked and loaded!'
        ];
        
        for (let i = 0; i < reloadMessages.length; i++) {
            await this.updateGameDisplay('reloading', null, { message: reloadMessages[i], step: i + 1 });
            await this.sleep(1200);
        }
        
        // Generate new chamber
        this.chamber = this.generateChamber();
        this.currentShot = 0;
        this.state = GameState.PLAYING;
        
        // Continue game
        await this.sleep(1000);
        this.processTurn();
    }

    /**
     * Update game display based on current state
     */
    async updateGameDisplay(phase, currentPlayer = null, result = null) {
        let embed;
        
        switch (phase) {
            case 'turn_start':
                embed = this.createGameplayEmbed(currentPlayer, 'turn_start');
                break;
            case 'empty':
                embed = this.createGameplayEmbed(currentPlayer, 'empty', result);
                break;
            case 'jammed':
                embed = this.createGameplayEmbed(currentPlayer, 'jammed', result);
                break;
            case 'eliminated':
                embed = this.createGameplayEmbed(currentPlayer, 'eliminated', result);
                break;
            case 'reloading':
                embed = this.createReloadEmbed(result.message, result.step);
                break;
        }
        
        try {
            await this.gameMessage.edit({ embeds: [embed], components: [] });
        } catch (error) {
            logger.error(`Failed to update game display: ${error.message}`);
        }
    }

    /**
     * Create gameplay embed
     */
    createGameplayEmbed(currentPlayer, phase, result = null) {
        const alivePlayers = Array.from(this.players.values()).filter(p => p.alive);
        const deadPlayers = Array.from(this.players.values()).filter(p => !p.alive);
        
        // Create fancy player list with crossed out eliminated players (outside code block for strikethrough)
        const playerStatus = this.playerOrder
            .map(playerId => {
                const player = this.players.get(playerId);
                const status = !player.alive ? '💀' : 
                             playerId === currentPlayer?.id ? '🎯' : '🟢';
                const name = !player.alive ? `~~${player.username}~~` : player.username;
                return `${status} ${name}`;
            })
            .join('\n');

        let phaseText = '';
        let stageText = '';
        let color = 0xFFFF00;

        switch (phase) {
            case 'turn_start':
                phaseText = `🎯 **${currentPlayer.username}** raises the gun...\n*Finger on trigger...*\n*The chamber spins...*`;
                stageText = `${currentPlayer.username}'S TURN`;
                color = 0xFFA500;
                break;
            case 'empty':
                phaseText = `🔫 **CLICK!** Empty chamber!\n*${currentPlayer.username} survives this round*\n*Nervous laughter fills the air...*`;
                stageText = 'SAFE... FOR NOW';
                color = 0x00FF00;
                break;
            case 'jammed':
                phaseText = `🔧 **GUN JAMMED!**\n*${currentPlayer.username} gets lucky!*\n*The gun refuses to fire...*`;
                stageText = 'SAVED BY LUCK!';
                color = 0x0099FF;
                break;
            case 'eliminated':
                phaseText = `💥 **BANG!** \n*${currentPlayer.username} has been eliminated!*\n*Another soul lost to the game...*`;
                stageText = 'ELIMINATED!';
                color = 0xFF0000;
                break;
        }

        const totalPot = this.players.size * this.entryAmount;
        const winnerPot = totalPot; // No house fee - winner takes all

        return buildSessionEmbed({
            title: '🔫 RUSSIAN ROULETTE - IN PROGRESS',
            topFields: [
                {
                    name: '💀 CURRENT SITUATION',
                    value: '```\n' + phaseText + '\n```',
                    inline: false
                },
                {
                    name: '📊 GAME INFO',
                    value: `**Shot:** ${this.currentShot + 1}/6\n**Alive:** ${alivePlayers.length}\n**Eliminated:** ${deadPlayers.length}`,
                    inline: true
                },
                {
                    name: '💰 WINNER TAKES',
                    value: `**${fmt(winnerPot)}**\n*Total Prize Pool*`,
                    inline: true
                },
                {
                    name: '👥 PLAYERS LIST',
                    value: playerStatus,
                    inline: false
                }
            ],
            stageText,
            color,
            footer: '🎮 Fully automated - no input required'
        });
    }

    /**
     * Create reload embed
     */
    createReloadEmbed(message, step) {
        const alivePlayers = Array.from(this.players.values()).filter(p => p.alive);
        
        // Format reload sequence in code block for consistency
        const reloadText = `\`\`\`\n🔫 ${message}\n\nStep ${step}/5\n\n⚡ The tension builds...\`\`\``;
        
        // Format survivors list in code block
        const survivorsList = '```\n' + alivePlayers
            .map(player => `🟢 ${player.username}`)
            .join('\n') + '\n```';
        
        return buildSessionEmbed({
            title: '🔄 RUSSIAN ROULETTE - RELOADING',
            topFields: [
                {
                    name: '🔄 RELOAD SEQUENCE',
                    value: reloadText,
                    inline: false
                },
                {
                    name: '👥 SURVIVORS LIST',
                    value: survivorsList,
                    inline: false
                }
            ],
            stageText: '```\nRELOADING IN PROGRESS...\n```',
            color: 0xFF6600,
            footer: 'Fresh bullets are being loaded...'
        });
    }

    /**
     * End the game and declare winner
     */
    async endGame() {
        this.state = GameState.FINISHED;
        clearTimeout(this.turnTimer);
        
        const alivePlayers = Array.from(this.players.values()).filter(p => p.alive);
        const winner = alivePlayers[0];
        
        const totalPot = this.players.size * this.entryAmount;
        const winnings = totalPot; // Winner takes all - no house fee
        
        // Pay winner
        if (winner) {
            try {
                const userBalance = await dbManager.getUserBalance(winner.id, this.guildId);
                await dbManager.setUserBalance(
                    winner.id,
                    this.guildId,
                    userBalance.wallet + winnings,
                    userBalance.bank
                );
                
                // Record game result
                const gameResult = new GameResult({
                    userId: winner.id,
                    guildId: this.guildId,
                    gameType: 'russianroulette',
                    betAmount: this.entryAmount,
                    payout: winnings,
                    won: true
                });
                
                await PayoutManager.processGamePayout(gameResult);
                
                logger.info(`Russian Roulette winner: ${winner.username} won ${fmt(winnings)}`);
            } catch (error) {
                logger.error(`Failed to pay Russian Roulette winner: ${error.message}`);
            }
        }
        
        // Show final results
        await this.showFinalResults(winner, winnings, totalPot);
        
        // Cleanup
        setTimeout(() => {
            this.cleanup();
        }, 30000); // Show results for 30 seconds
    }

    /**
     * Show final game results
     */
    async showFinalResults(winner, winnings, totalPot) {
        const finalStandings = Array.from(this.players.values())
            .sort((a, b) => {
                if (a.alive && !b.alive) return -1;
                if (!a.alive && b.alive) return 1;
                return b.turnsTaken - a.turnsTaken;
            })
            .map((player, i) => {
                const status = player.alive ? '👑 WINNER' : `💀 Eliminated (Turn ${player.turnsTaken})`;
                return `${i + 1}. ${player.username} - ${status}`;
            })
            .join('\n');

        const chamberReveal = this.chamber
            .map((bullet, i) => bullet ? '💥' : '⚫')
            .join(' ');

        const embed = buildSessionEmbed({
            title: '🏆 RUSSIAN ROULETTE - GAME OVER',
            topFields: [
                {
                    name: '👑 WINNER',
                    value: winner ? 
                        `**${winner.username}** survives!\n💰 **Won:** ${fmt(winnings)}\n🎯 **Survival Rate:** 1/${this.players.size}` :
                        'No survivors... everyone eliminated!',
                    inline: false
                },
                {
                    name: '📊 FINAL STANDINGS',
                    value: finalStandings,
                    inline: false
                },
                {
                    name: '💰 WINNER TAKES ALL',
                    value: `**Total Pot:** ${fmt(totalPot)}\n**Winner Payout:** ${fmt(totalPot)}`,
                    inline: false
                }
            ],
            stageText: winner ? `${winner.username.toUpperCase()} WINS!` : 'NO SURVIVORS!',
            color: winner ? 0xFFD700 : 0x800000,
            footer: '🎰 Thanks for playing Russian Roulette! • ATIVE Casino'
        });

        try {
            await this.gameMessage.edit({ embeds: [embed], components: [] });
        } catch (error) {
            logger.error(`Failed to show final results: ${error.message}`);
        }

        // Log to suspicious activity if high winnings
        if (winnings > 100000) {
            try {
                await sendLogMessage(
                    this.client,
                    'suspicious',
                    `Russian Roulette HIGH PAYOUT: ${winner?.username || 'Unknown'} won ${fmt(winnings)} (${this.players.size} players, ${fmt(this.entryAmount)} entry)`,
                    winner?.id,
                    this.guildId
                );
            } catch (_) {}
        }
    }

    /**
     * Cancel game and refund players
     */
    async cancelGame(reason) {
        logger.info(`Russian Roulette cancelled: ${reason}`);
        
        // Refund all players
        for (const [userId, player] of this.players) {
            try {
                const userBalance = await dbManager.getUserBalance(userId, this.guildId);
                await dbManager.setUserBalance(
                    userId,
                    this.guildId,
                    userBalance.wallet + this.entryAmount,
                    userBalance.bank
                );
            } catch (error) {
                logger.error(`Failed to refund ${player.username}: ${error.message}`);
            }
        }
        
        const embed = new EmbedBuilder()
            .setTitle('❌ Russian Roulette Cancelled')
            .setDescription(`**Reason:** ${reason}\n\n✅ All entry fees have been refunded.`)
            .setColor(0xFF0000);
            
        try {
            await this.gameMessage.edit({ embeds: [embed], components: [] });
        } catch (error) {
            logger.error(`Failed to show cancellation message: ${error.message}`);
        }
        
        this.cleanup();
    }

    /**
     * Cleanup game resources
     */
    cleanup() {
        clearTimeout(this.joinTimer);
        clearTimeout(this.gameTimer);
        clearTimeout(this.turnTimer);
        
        // End session
        if (this.sessionId) {
            sessionManager.endSession(this.sessionId, 'completed');
        }
        
        logger.info(`Russian Roulette game cleaned up: ${this.sessionId}`);
    }

    /**
     * Utility functions
     */
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = secureRandomInt(0, (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Active games storage
const activeGames = new Map();

/**
 * Handle Russian Roulette game execution
 */
async function handleGameExecution(interaction, client, sessionId, gameData) {
    try {
        // Create game instance
        const game = new RussianRouletteGame(sessionId, gameData);
        activeGames.set(sessionId, game);
        
        // Start join phase
        await game.startJoinPhase(client, interaction);
        
        // Cleanup after game ends
        setTimeout(() => {
            activeGames.delete(sessionId);
        }, 300000); // 5 minutes cleanup
        
    } catch (error) {
        logger.error(`Russian Roulette execution error: ${error.message}`);
        throw error;
    }
}

module.exports = {
    handleGameExecution,
    RussianRouletteGame,
    GameState,
    CONFIG
};