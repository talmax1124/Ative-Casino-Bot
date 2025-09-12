/**
 * Treasure Door Vault Game
 * 6 rounds of door selection with multipliers and traps
 * Players have 10 seconds to decide or the adventure ends
 */

const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, AttachmentBuilder, MessageFlags } = require('discord.js');
const { PayoutManager, GameType, GameResult } = require('../UTILS/gameUtils');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const { fmt, getGuildId } = require('../UTILS/common');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');
const { secureRandomInt } = require('../UTILS/rng');
const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs').promises;
const sessionManager = require('../UTILS/sessionManager');

// Game session storage
const activeGames = new Map();

// Treasure vault configuration
const TREASURE_CONFIG = {
    ROUNDS: 6,
    DOORS: 3,
    DECISION_TIME: 10000, // 10 seconds
    
    // Balanced outcomes per round - house edge ~15-20%
    ROUND_OUTCOMES: {
        1: { // Round 1 - 2 good, 1 trap
            multipliers: [1.05, 1.1],
            traps: ['lose_25']
        },
        2: { // Round 2 - 2 good, 1 trap
            multipliers: [1.1, 1.15],
            traps: ['lose_30']
        },
        3: { // Round 3 - 1 good, 2 traps
            multipliers: [1.2],
            traps: ['lose_40', 'lose_50']
        },
        4: { // Round 4 - 1 good, 2 traps
            multipliers: [1.3],
            traps: ['lose_60', 'lose_all']
        },
        5: { // Round 5 - 1 good, 2 traps
            multipliers: [1.5],
            traps: ['lose_75', 'lose_all']
        },
        6: { // Round 6 - Final round, very risky
            multipliers: [2.0],
            traps: ['lose_all', 'lose_all']
        }
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('treasurevault')
        .setDescription('🏛️ Navigate through 6 rounds of treasure doors! Choose wisely or lose it all!')
        .addStringOption(option =>
            option.setName('bet')
                .setDescription('Amount to bet (supports K/M/B, "all", "half", minimum 100)')
                .setRequired(true)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const betAmountStr = interaction.options.getString('bet');

        try {
            // Check maintenance mode first
            const maintenanceGuard = require('../UTILS/maintenanceGuard');
            const maintenanceCheck = await maintenanceGuard.check(guildId, 'treasurevault');
            if (!maintenanceCheck.allowed) {
                return await interaction.reply({ embeds: [maintenanceCheck.embed], flags: MessageFlags.Ephemeral });
            }

            // Session guard (unified)
            const sessionGuard = require('../UTILS/sessionGuard');
            const check = await sessionGuard.check(userId, guildId, 'treasurevault', interaction.client);
            if (!check.allowed) {
                return await interaction.reply({
                    embeds: [new EmbedBuilder().setTitle('❌ Session Error').setDescription(check.message).setColor(0xFF0000)],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Validate bet and deduct from balance
            const validation = await PayoutManager.validateAndDeductBet(
                interaction,
                betAmountStr,
                GameType.TREASUREVAULT || 'treasurevault',
                100, // minimum bet
                null,     // No maximum bet limit
                {} // no special requirements
            );
            
            if (!validation.isValid) {
                return await interaction.reply({
                    embeds: [validation.errorEmbed],
                    flags: MessageFlags.Ephemeral
                });
            }

            const betAmount = validation.parsedAmount;

            // Create unified game session (bet already deducted)
            const createRes = await sessionManager.createSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: 'treasurevault',
                betAmount,
                betPreDeducted: true,
                timeout: TREASURE_CONFIG.ROUNDS * TREASURE_CONFIG.DECISION_TIME + 60000, // rounds + buffer
                metadata: {
                    gamePhase: 'round_select',
                    rounds: TREASURE_CONFIG.ROUNDS,
                    decisionMs: TREASURE_CONFIG.DECISION_TIME
                },
                interaction
            });
            if (!createRes.success) {
                // Refund on failure
                await PayoutManager.refundBet(userId, guildId, betAmount, 'TreasureVault session create failed');
                return await interaction.reply({
                    embeds: [new EmbedBuilder().setTitle('❌ Session Error').setDescription(`Failed to create session: ${createRes.error}`).setColor(0xFF0000)],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Initialize in-memory game data
            const gameSession = {
                userId,
                guildId,
                betAmount,
                currentPayout: betAmount,
                round: 1,
                roundOutcomes: generateRoundOutcomes(),
                gameStarted: Date.now(),
                lastInteraction: Date.now(),
                sessionId: createRes.sessionId
            };

            activeGames.set(userId, gameSession);

            await interaction.deferReply();

            // Log debug info
            logger.info(`Starting treasurevault for user ${userId}, bet: ${betAmount}, round: ${gameSession.round}`);

            // Start the adventure
            await this.startRound(interaction, gameSession, true);

        } catch (error) {
            logger.error(`Error in treasurevault command: ${error.message}`);
            
            // Clean up game session on error
            activeGames.delete(userId);
            try {
                const active = sessionManager.getUserActiveSession(userId);
                if (active && active.gameType === 'treasurevault') {
                    await sessionManager.cancelSession(active.sessionId, 'TreasureVault init error', true);
                }
            } catch {}
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Treasure Vault Error')
                .setDescription('Unable to start your adventure. Please try again.')
                .setColor(0xFF0000)
                .setFooter({ text: '🏛️ Treasure Vault • ATIVE Casino' });

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    },

    /**
     * Handle button interactions for door selection and game flow
     */
    async handleButtonInteraction(interaction, customId) {
        const userId = interaction.user.id;
        const gameSession = activeGames.get(userId);

        logger.info(`Button interaction: userId=${userId}, customId=${customId}, hasSession=${!!gameSession}`);

        if (!gameSession) {
            logger.warn(`No active game session found for user ${userId}`);
            return await interaction.reply({
                content: '🏛️ No active Treasure Vault adventure found. Start a new one with `/treasurevault`!',
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            await interaction.deferUpdate();
            gameSession.lastInteraction = Date.now();

            logger.info(`Processing ${customId} for user ${userId}, round ${gameSession.round}`);

            if (customId === 'treasurevault_end') {
                logger.info(`Player ${userId} chose to end adventure`);
                await this.endAdventure(interaction, gameSession, 'player_choice');
            } else if (customId.startsWith('treasurevault_door_')) {
                const doorNumber = parseInt(customId.split('_')[2]);
                logger.info(`Player ${userId} chose door ${doorNumber}`);
                await this.selectDoor(interaction, gameSession, doorNumber);
            } else {
                logger.warn(`Unknown customId: ${customId}`);
            }

        } catch (error) {
            logger.error(`Error handling treasurevault button: ${error.message}`, error);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Adventure Error')
                .setDescription('Something went wrong with your adventure. Please try again.')
                .setColor(0xFF0000);

            try {
                await interaction.editReply({ embeds: [errorEmbed], components: [] });
            } catch {
                // If edit fails, clean up
                activeGames.delete(userId);
            }
        }
    },

    /**
     * Start a new round of the treasure vault
     */
    async startRound(interaction, gameSession, isInitial = false) {
        try {
            const { round, currentPayout, roundOutcomes } = gameSession;
            
            logger.info(`Starting round ${round} for user ${gameSession.userId}`);
            
            // Create embed using buildSessionEmbed like other working games
            logger.info(`Creating embed using buildSessionEmbed for round ${round}, payout ${currentPayout}`);
            
            const topFields = [
                {
                    name: '🏛️ TREASURE VAULT ADVENTURE',
                    value: `Round **${round}/${TREASURE_CONFIG.ROUNDS}**\nCurrent Treasure: **$${currentPayout}**\nOriginal Bet: **$${gameSession.betAmount}**`
                },
                {
                    name: '🚪 THE CHOICE AWAITS',
                    value: `Three doors stand before you...\nOne holds great **treasure** 💎\nOne holds moderate **treasure** 💰\nOne holds a **trap** ⚠️\n\n*Choose wisely! You have 10 seconds to decide.*`
                }
            ];

            const bankFields = [
                { name: 'Round Progress', value: `${round}/${TREASURE_CONFIG.ROUNDS}`, inline: true },
                { name: 'Time Limit', value: '10 seconds', inline: true },
                { name: 'Risk Level', value: getRiskLevel(round), inline: true }
            ];

            const embed = buildSessionEmbed({
                title: `🏛️ ${interaction.user.displayName}'s Treasure Vault`,
                topFields,
                bankFields,
                stageText: `ROUND ${round}`,
                color: 0xFFD700,
                footer: `Round ${round}/${TREASURE_CONFIG.ROUNDS} • You have 10 seconds to choose!`
            });
            
            logger.info('Created embed with countdown timer and image using buildSessionEmbed successfully');
            
            // Create door image
            let attachment = null;
            try {
                attachment = await this.createDoorImage('all_closed');
                logger.info('Successfully created door image attachment');
            } catch (imageError) {
                logger.error(`Failed to create door image: ${imageError.message}`);
                attachment = null;
            }

        // Create action buttons
        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('treasurevault_door_1')
                    .setLabel('🚪 Door 1')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('treasurevault_door_2')
                    .setLabel('🚪 Door 2')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('treasurevault_door_3')
                    .setLabel('🚪 Door 3')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('treasurevault_end')
                    .setLabel('🚪 End Adventure')
                    .setStyle(ButtonStyle.Danger)
            );

            const replyData = {
                embeds: [embed],
                components: [buttons]
            };
            
            if (attachment) {
                replyData.files = [attachment];
                logger.info('Including door image in reply');
            } else {
                logger.info('Sending reply without image');
            }
            
            await interaction.editReply(replyData);

            // Set timeout for decision
            this.setDecisionTimeout(interaction, gameSession);
            
        } catch (error) {
            logger.error(`Error in startRound: ${error.message}`);
            
            // Create fallback embed without image
            const errorEmbed = new EmbedBuilder()
                .setTitle('🏛️ Treasure Vault')
                .setDescription('Setting up your adventure...')
                .setColor(0xFFD700);
            
            try {
                await interaction.editReply({ 
                    embeds: [errorEmbed],
                    components: []
                });
            } catch (editError) {
                logger.error(`Failed to send error embed: ${editError.message}`);
            }
        }
    },

    /**
     * Handle door selection
     */
    async selectDoor(interaction, gameSession, doorNumber) {
        const { round, currentPayout, roundOutcomes, betAmount } = gameSession;
        const doorOutcome = roundOutcomes[round - 1][doorNumber - 1];
        
        let newPayout = currentPayout;
        let outcomeText = '';
        let outcomeColor = 0x00FF00;
        let continueGame = true;

        // Process the door outcome
        if (typeof doorOutcome === 'number') {
            // Multiplier
            newPayout = Math.floor(currentPayout * doorOutcome);
            outcomeText = `🎉 **TREASURE FOUND!**\nYou discovered a **${doorOutcome}x multiplier**!\nYour treasure grew from ${fmt(currentPayout)} to **${fmt(newPayout)}**!`;
        } else {
            // Trap
            switch (doorOutcome) {
                case 'lose_25':
                    newPayout = Math.floor(currentPayout * 0.75);
                    outcomeText = `⚠️ **TRAP TRIGGERED!**\nYou lost 25% of your treasure!\nTreasure reduced from ${fmt(currentPayout)} to **${fmt(newPayout)}**!`;
                    outcomeColor = 0xFFA500;
                    break;
                case 'lose_50':
                    newPayout = Math.floor(currentPayout * 0.50);
                    outcomeText = `💀 **DANGEROUS TRAP!**\nYou lost 50% of your treasure!\nTreasure reduced from ${fmt(currentPayout)} to **${fmt(newPayout)}**!`;
                    outcomeColor = 0xFF6600;
                    break;
                case 'lose_75':
                    newPayout = Math.floor(currentPayout * 0.25);
                    outcomeText = `💀 **DEADLY TRAP!**\nYou lost 75% of your treasure!\nTreasure reduced from ${fmt(currentPayout)} to **${fmt(newPayout)}**!`;
                    outcomeColor = 0xFF0000;
                    break;
                case 'lose_all':
                    newPayout = 0;
                    outcomeText = `☠️ **GAME OVER!**\nYou triggered a deadly trap and lost everything!\nYour adventure ends here with **nothing**!`;
                    outcomeColor = 0x8B0000;
                    continueGame = false;
                    break;
            }
        }

        gameSession.currentPayout = newPayout;

        // Create door outcome image
        const doorImageName = `door_${doorNumber}_open`;
        const attachment = await this.createDoorImage(doorImageName);

        // Build outcome embed
        const topFields = [
            {
                name: `🚪 DOOR ${doorNumber} OPENED`,
                value: outcomeText,
                inline: false
            }
        ];

        const bankFields = [
            { name: 'Round', value: `${round}/${TREASURE_CONFIG.ROUNDS}`, inline: true },
            { name: 'Current Treasure', value: fmt(newPayout), inline: true },
            { name: 'Original Bet', value: fmt(betAmount), inline: true }
        ];

        if (!continueGame || round >= TREASURE_CONFIG.ROUNDS) {
            // Game over or completed
            await this.endAdventure(interaction, gameSession, continueGame ? 'completed' : 'trap');
            return;
        }

        // Continue to next round
        gameSession.round += 1;
        
        const embed = buildSessionEmbed({
            title: `🏛️ Door ${doorNumber} Result`,
            topFields,
            bankFields,
            stageText: `DOOR ${doorNumber}`,
            color: outcomeColor,
            footer: `Preparing next round... • Treasure: ${fmt(newPayout)}`
        });

        await interaction.editReply({
            embeds: [embed],
            files: [attachment],
            components: []
        });

        // Wait 3 seconds then start next round
        setTimeout(async () => {
            if (activeGames.has(gameSession.userId)) {
                await this.startRound(interaction, gameSession);
            }
        }, 3000);
    },

    /**
     * End the adventure and process payout
     */
    async endAdventure(interaction, gameSession, reason) {
        const { userId, guildId, betAmount, currentPayout } = gameSession;
        
        // Clean up game session
        activeGames.delete(userId);

        let title = '';
        let description = '';
        let color = 0x00FF00;
        let footerText = '';

        // Calculate final payout
        const netChange = currentPayout - betAmount;
        const won = currentPayout > betAmount;

        switch (reason) {
            case 'player_choice':
                title = '🚪 Adventure Ended by Choice';
                description = `You chose to end your adventure safely!\nYou walk away with **${fmt(currentPayout)}** treasure!`;
                footerText = `Net ${won ? 'Profit' : 'Loss'}: ${won ? '+' : ''}${fmt(netChange)}`;
                color = 0x00AA00;
                break;
            case 'timeout':
                title = '⏰ Adventure Ended by Timeout';
                description = `Time ran out! You cautiously retreat with your current treasure.\nYou walk away with **${fmt(currentPayout)}** treasure!`;
                footerText = `Net ${won ? 'Profit' : 'Loss'}: ${won ? '+' : ''}${fmt(netChange)}`;
                color = 0xFFA500;
                break;
            case 'trap':
                title = '💀 Adventure Failed!';
                description = `Your adventure has come to a tragic end!\nYou lose everything and walk away empty-handed.`;
                footerText = `Net Loss: ${fmt(netChange)}`;
                color = 0xFF0000;
                break;
            case 'completed':
                title = '🏆 Adventure Completed!';
                description = `Congratulations! You've conquered all 6 rounds!\nYou emerge victorious with **${fmt(currentPayout)}** treasure!`;
                footerText = `Net Profit: +${fmt(netChange)}`;
                color = 0xFFD700;
                break;
        }

        // Note: Payout is handled by sessionManager.endSession() to avoid double crediting

        // Record game result
        await dbManager.recordGameResult(
            userId,
            guildId,
            'treasurevault',
            won,
            betAmount,
            currentPayout,
            { reason, rounds_completed: gameSession.round }
        );

        // Add XP for game completion
        try {
            const levelingSystem = require('../UTILS/levelingSystem');
            const multiplier = currentPayout / betAmount;
            const specialResult = multiplier >= 2 ? 'big_win' : 
                               multiplier >= 3 ? 'massive_win' : null;
            
            const xpResult = await levelingSystem.handleGameComplete(userId, guildId, 'treasurevault', won, specialResult);
            
            // Handle level up if occurred
            if (xpResult && xpResult.levelUp) {
                const levelUpEmbed = levelingSystem.createLevelUpEmbed(interaction.user, xpResult.newLevel);
                
                // Award level-up rewards
                await levelingSystem.processLevelUpRewards(userId, guildId, xpResult.newLevel);
                
                // Send level up message in level up channel
                try {
                    const levelUpChannel = interaction.client.channels.cache.get('1411018763008217208');
                    if (levelUpChannel) {
                        await levelUpChannel.send({ embeds: [levelUpEmbed] });
                    }
                } catch (levelError) {
                    logger.debug(`Could not send level up message: ${levelError.message}`);
                }
            }
        } catch (xpError) {
            logger.debug(`Could not award XP for treasurevault: ${xpError.message}`);
        }

        // Create final embed
        const topFields = [
            {
                name: '🏛️ TREASURE VAULT COMPLETE',
                value: description,
                inline: false
            }
        ];

        const bankFields = [
            { name: 'Original Bet', value: fmt(betAmount), inline: true },
            { name: 'Final Treasure', value: fmt(currentPayout), inline: true },
            { name: 'Rounds Completed', value: `${gameSession.round - 1}/${TREASURE_CONFIG.ROUNDS}`, inline: true }
        ];

        const finalEmbed = buildSessionEmbed({
            title,
            topFields,
            bankFields,
            stageText: 'COMPLETE',
            color,
            footer: footerText
        });

        // Create final door image (all closed for dramatic effect)
        const attachment = await this.createDoorImage('all_closed');

        await interaction.editReply({
            embeds: [finalEmbed],
            files: [attachment],
            components: []
        });

        // End session and credit the actual payout
        if (gameSession.sessionId) {
            try {
                await sessionManager.endSession(gameSession.sessionId, {
                    payout: currentPayout,
                    won,
                    reason: 'completed'
                });
            } catch (e) {
                logger.warn(`Failed to end TreasureVault session: ${e.message}`);
            }
        }
    },

    /**
     * Set decision timeout for current round
     */
    setDecisionTimeout(interaction, gameSession) {
        // Simple timeout without live updates to avoid interaction conflicts
        setTimeout(async () => {
            if (activeGames.has(gameSession.userId)) {
                // Check if player made a decision recently
                const timeSinceLastInteraction = Date.now() - gameSession.lastInteraction;
                if (timeSinceLastInteraction >= TREASURE_CONFIG.DECISION_TIME - 1000) {
                    logger.info(`Game timeout for user ${gameSession.userId}`);
                    await this.endAdventure(interaction, gameSession, 'timeout');
                }
            }
        }, TREASURE_CONFIG.DECISION_TIME);
    },

    /**
     * Create door image based on state
     */
    async createDoorImage(state) {
        let imageName = '';
        
        switch (state) {
            case 'all_closed':
                imageName = 'All Doors Closed.jpg';
                break;
            case 'door_1_open':
                imageName = 'Door One Open.jpg';
                break;
            case 'door_2_open':
                imageName = 'Door Two Open.jpg';
                break;
            case 'door_3_open':
                imageName = 'Door Three Open.jpg';
                break;
            default:
                imageName = 'All Doors Closed.jpg';
        }

        const imagePath = path.join(__dirname, '..', 'assets', 'treasure_vault', imageName);
        
        try {
            // Check if file exists
            await fs.access(imagePath);
            
            return new AttachmentBuilder(imagePath, { 
                name: 'treasure_vault.png',
                description: 'Treasure Vault Doors'
            });
        } catch (error) {
            logger.warn(`Treasure vault image not found: ${imagePath}`);
            
            // Create a fallback text-based image
            return this.createFallbackImage(state);
        }
    },

    /**
     * Create fallback ASCII art image if assets aren't available
     */
    async createFallbackImage(state) {
        const canvas = createCanvas(800, 400);
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#2C1810';
        ctx.fillRect(0, 0, 800, 400);

        // Title
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🏛️ TREASURE VAULT 🏛️', 400, 50);

        // Draw doors based on state
        const doorPositions = [150, 400, 650];
        const doorLabels = ['DOOR 1', 'DOOR 2', 'DOOR 3'];

        for (let i = 0; i < 3; i++) {
            const x = doorPositions[i];
            const isOpen = state.includes(`door_${i + 1}_open`);
            
            // Door frame
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(x - 60, 100, 120, 200);
            
            // Door
            if (isOpen) {
                ctx.fillStyle = '#000000';
                ctx.fillRect(x - 50, 110, 100, 180);
                
                // Open door effect
                ctx.fillStyle = '#FFD700';
                ctx.font = 'bold 24px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('✨', x, 200);
            } else {
                ctx.fillStyle = '#654321';
                ctx.fillRect(x - 50, 110, 100, 180);
                
                // Door handle
                ctx.fillStyle = '#FFD700';
                ctx.beginPath();
                ctx.arc(x + 30, 200, 8, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Door label
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(doorLabels[i], x, 330);
        }

        const buffer = canvas.toBuffer('image/png');
        return new AttachmentBuilder(buffer, { 
            name: 'treasure_vault.png',
            description: 'Treasure Vault Doors'
        });
    }
};

/**
 * Generate outcomes for all 6 rounds
 */
function generateRoundOutcomes() {
    const allRoundOutcomes = [];
    
    for (let round = 1; round <= TREASURE_CONFIG.ROUNDS; round++) {
        const config = TREASURE_CONFIG.ROUND_OUTCOMES[round];
        const roundOutcomes = [];
        
        // Randomly assign one good multiplier, one medium multiplier, one trap
        const shuffledMultipliers = [...config.multipliers].sort(() => secureRandomInt(0, 2) - 1);
        const randomTrap = config.traps[secureRandomInt(0, config.traps.length)];
        
        // Assign outcomes to doors (2 multipliers, 1 trap)
        const outcomes = [
            shuffledMultipliers[0],
            shuffledMultipliers[1], 
            randomTrap
        ];
        
        // Shuffle door assignments
        for (let i = outcomes.length - 1; i > 0; i--) {
            const j = secureRandomInt(0, i + 1);
            [outcomes[i], outcomes[j]] = [outcomes[j], outcomes[i]];
        }
        
        allRoundOutcomes.push(outcomes);
    }
    
    return allRoundOutcomes;
}

/**
 * Get risk level description based on round
 */
function getRiskLevel(round) {
    if (round <= 2) return '🟢 Low';
    if (round <= 4) return '🟡 Medium';
    return '🔴 High';
}
