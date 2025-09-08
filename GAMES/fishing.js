/**
 * Fishing Game Logic for ATIVE Casino Bot
 * Cast your line to catch fish with multipliers, but beware of the red fish!
 * Players can stop fishing at any time to keep their accumulated winnings.
 */

const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { secureWeightedChoice, secureRandomFloat } = require('../UTILS/rng');
const { fmt } = require('../UTILS/common');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const logger = require('../UTILS/logger');

// Fish data with probabilities and multipliers
const FISH_TYPES = {
    'common': {
        emoji: '🐟',
        name: 'Common Fish',
        multiplier_min: 1.01,
        multiplier_max: 1.05,
        probability: 50,
        color: 0x3498DB, // Blue
        description: 'A regular fish found in most waters'
    },
    'uncommon': {
        emoji: '🐠',
        name: 'Uncommon Fish',
        multiplier_min: 1.06,
        multiplier_max: 1.15,
        probability: 25,
        color: 0x2ECC71, // Green
        description: 'A colorful fish that\'s a bit harder to find'
    },
    'rare': {
        emoji: '🐡',
        name: 'Rare Fish',
        multiplier_min: 1.16,
        multiplier_max: 1.35,
        probability: 15,
        color: 0xF1C40F, // Gold
        description: 'A sparkling rare catch!'
    },
    'legendary': {
        emoji: '🐙',
        name: 'Legendary Fish',
        multiplier_min: 1.4,
        multiplier_max: 1.8,
        probability: 2,
        color: 0x9B59B6, // Purple
        description: 'An incredibly rare legendary fish!'
    },
    'red': {
        emoji: '🦈',
        name: 'Red Fish of Doom',
        multiplier_min: 0.0,
        multiplier_max: 0.0,
        probability: 7,
        color: 0xE74C3C, // Red
        description: '🔥 This cursed fish steals all your catch!'
    }
};

// Create weighted arrays for fish selection
const fishTypes = Object.keys(FISH_TYPES);
const fishWeights = fishTypes.map(type => FISH_TYPES[type].probability);

/**
 * Generate a random fish type and multiplier using secure randomness
 * @returns {Object} {fishType, multiplier}
 */
function generateRandomFish() {
    try {
        // Select fish type using weighted random choice
        const fishType = secureWeightedChoice(fishTypes, fishWeights) || 'common';
        const fishData = FISH_TYPES[fishType];
        
        // Generate random multiplier within the fish's range
        let multiplier;
        if (fishData.multiplier_min === fishData.multiplier_max) {
            multiplier = fishData.multiplier_min;
        } else {
            multiplier = secureRandomFloat(fishData.multiplier_min, fishData.multiplier_max);
        }
        
        return { fishType, multiplier };
    } catch (error) {
        logger.error('Error generating random fish:', error);
        return { fishType: 'common', multiplier: 1.05 };
    }
}

/**
 * Fishing Game Session Class
 */
class FishingGame {
    constructor(userId, username, initialBet, walletAfter) {
        this.userId = userId;
        this.username = username;
        this.initialBet = initialBet;
        this.walletAfter = walletAfter;
        this.walletBefore = walletAfter + initialBet;
        
        // Game state
        this.currentWinnings = initialBet; // Start with bet amount
        this.fishCaught = [];
        this.totalCatches = 0;
        this.gameEnded = false;
        this.maxCatches = 20; // Maximum catches allowed
        this.gameStarted = false;
        
        logger.info(`Fishing game created for ${username} with bet ${initialBet}`);
    }

    /**
     * Process a fish catch
     * @returns {Object} Game state after catch
     */
    catchFish() {
        if (this.gameEnded) {
            throw new Error('Game has already ended');
        }

        this.gameStarted = true;
        const { fishType, multiplier } = generateRandomFish();
        const fishData = FISH_TYPES[fishType];
        this.totalCatches++;

        const oldWinnings = this.currentWinnings;

        // Check if it's the red fish of doom
        if (fishType === 'red') {
            this.currentWinnings = 0.0; // Lose everything
            this.gameEnded = true;
            this.fishCaught.push(`${fishData.emoji} ${fishData.name} (🔥 DOOM!)`);
            
            logger.info(`${this.username} caught red fish and lost everything on catch ${this.totalCatches}`);
            
            return {
                fishType,
                fishData,
                multiplier,
                oldWinnings,
                newWinnings: this.currentWinnings,
                gameEnded: true,
                reachedLimit: false,
                lostToRedFish: true
            };
        }

        // Apply multiplier to current winnings
        this.currentWinnings *= multiplier;
        this.fishCaught.push(`${fishData.emoji} ${fishData.name} (${multiplier.toFixed(2)}x)`);

        // Check if reached catch limit
        const reachedLimit = this.totalCatches >= this.maxCatches;
        if (reachedLimit) {
            this.gameEnded = true;
            logger.info(`${this.username} reached fishing limit with winnings ${this.currentWinnings}`);
        }

        return {
            fishType,
            fishData,
            multiplier,
            oldWinnings,
            newWinnings: this.currentWinnings,
            gameEnded: reachedLimit,
            reachedLimit,
            lostToRedFish: false
        };
    }

    /**
     * Stop fishing and end the game
     * @returns {Object} Final game state
     */
    stopFishing() {
        if (this.gameEnded) {
            throw new Error('Game has already ended');
        }

        if (this.totalCatches === 0) {
            throw new Error('Cannot stop without catching any fish');
        }

        this.gameEnded = true;
        logger.info(`${this.username} stopped fishing with ${this.totalCatches} catches and winnings ${this.currentWinnings}`);

        return {
            gameEnded: true,
            reachedLimit: false,
            lostToRedFish: false,
            voluntaryStop: true
        };
    }

    /**
     * Create game state embed using gameSessionKit for UI consistency
     */
    createGameEmbed(title, color, description = null, balance = null) {
        const topFields = [];
        
        // Game status/result
        if (description) {
            topFields.push({
                name: '🎣 CATCH RESULT',
                value: description,
                inline: false
            });
        }

        // Recent catches display
        if (this.fishCaught.length > 0) {
            const recentFish = this.fishCaught.slice(-5).join('\n');
            topFields.push({
                name: '🐟 RECENT CATCHES',
                value: recentFish,
                inline: false
            });
        }

        // Banking fields - consistent with other games
        const bankFields = [
            { name: 'Current Winnings', value: fmt(this.currentWinnings), inline: true },
            { name: 'Total Multiplier', value: `${(this.currentWinnings / this.initialBet).toFixed(2)}x`, inline: true },
            { name: 'Catches', value: `${this.totalCatches}/${this.maxCatches}`, inline: true }
        ];

        // Add wallet/bank info if provided
        if (balance) {
            bankFields.push(
                { name: 'Wallet', value: fmt(balance.wallet), inline: true },
                { name: 'Bank', value: fmt(balance.bank), inline: true }
            );
        }

        // Determine stage text based on game state
        let stageText = 'FISHING ACTIVE';
        if (this.gameEnded) {
            if (this.currentWinnings === 0) {
                stageText = 'RED FISH - GAME OVER';
            } else if (this.totalCatches >= this.maxCatches) {
                stageText = 'LIMIT REACHED';
            } else {
                stageText = 'SESSION ENDED';
            }
        }

        return buildSessionEmbed({
            title: `🎣 ${this.username}'s Fishing`,
            topFields,
            bankFields,
            stageText,
            color,
            footer: 'Keep fishing for bigger multipliers, or stop to secure your winnings!'
        });
    }

    /**
     * Create final game result embed using gameSessionKit
     */
    createFinalEmbed(bankBalance, endType = 'stop') {
        const finalWallet = this.walletAfter + this.currentWinnings;
        const netChange = this.currentWinnings - this.initialBet;

        let title, description, color;

        if (endType === 'red') {
            title = 'Red Fish of Doom!';
            description = `${this.username} caught the cursed red fish and lost everything!`;
            color = 0xE74C3C; // Red
        } else if (endType === 'limit') {
            title = 'Fishing Limit Reached!';
            description = `${this.username} completed a full fishing session! (20/20 catches)`;
            
            if (this.currentWinnings >= this.initialBet * 3) {
                color = 0xF1C40F; // Gold
                title = 'Master Angler!';
            } else if (this.currentWinnings >= this.initialBet * 2) {
                color = 0x2ECC71; // Green
                title = 'Expert Fisher!';
            } else {
                color = 0x3498DB; // Blue
            }
        } else {
            // Voluntary stop
            if (this.currentWinnings >= this.initialBet * 5) {
                title = 'Amazing Fishing Session!';
                description = `${this.username} had an incredible fishing trip!`;
                color = 0xF1C40F; // Gold
            } else if (this.currentWinnings >= this.initialBet * 2) {
                title = 'Great Fishing Session!';
                description = `${this.username} had a profitable fishing trip!`;
                color = 0x2ECC71; // Green
            } else if (this.currentWinnings >= this.initialBet) {
                title = 'Successful Fishing!';
                description = `${this.username} made a profit fishing!`;
                color = 0x3498DB; // Blue
            } else {
                title = 'Fishing Loss';
                description = `${this.username} didn't catch enough to cover the bait cost!`;
                color = 0xE67E22; // Orange
            }
        }

        const topFields = [
            {
                name: '🎣 FISHING RESULTS',
                value: description,
                inline: false
            }
        ];

        // Show all fish caught (last 10 if too many)
        if (this.fishCaught.length > 0) {
            let fishList = this.fishCaught.slice(-10).join('\n');
            if (this.fishCaught.length > 10) {
                fishList = `...\n${fishList}`;
            }
            topFields.push({
                name: '🐟 FISH CAUGHT',
                value: fishList,
                inline: false
            });
        }

        const bankFields = [
            { name: '💰 Initial Bet', value: fmt(this.initialBet), inline: true },
            { name: '🎯 Final Winnings', value: fmt(this.currentWinnings), inline: true },
            { name: '📊 Net Change', value: `${netChange >= 0 ? '+' : ''}${fmt(netChange)}`, inline: true },
            { name: '🎣 Total Catches', value: `${this.totalCatches}/20`, inline: true },
            { name: '💵 Wallet', value: `${fmt(this.walletBefore)} → ${fmt(finalWallet)}`, inline: true },
            { name: '🏦 Bank', value: fmt(bankBalance), inline: true }
        ];

        return buildSessionEmbed({
            title: `🎣 ${title}`,
            topFields,
            bankFields,
            stageText: 'GAME COMPLETE',
            color,
            footer: 'Thanks for fishing! Cast your line again anytime.'
        });
    }

    /**
     * Create game control buttons
     */
    createButtons(disabled = false) {
        const fishButton = new ButtonBuilder()
            .setCustomId(`fishing-${this.userId}:fish`)
            .setLabel('FISH')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎣')
            .setDisabled(disabled);

        const stopButton = new ButtonBuilder()
            .setCustomId(`fishing-${this.userId}:stop`)
            .setLabel('Stop Fishing')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🛑')
            .setDisabled(disabled || this.totalCatches === 0);

        const helpButton = new ButtonBuilder()
            .setCustomId(`fishing-${this.userId}:help`)
            .setLabel('Help')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❓')
            .setDisabled(disabled);

        return new ActionRowBuilder().addComponents(fishButton, stopButton, helpButton);
    }

    /**
     * Get initial game embed using gameSessionKit
     */
    getInitialEmbed(bankBalance) {
        const topFields = [
            {
                name: '🎣 FISHING ADVENTURE BEGINS',
                value: `${this.username} casts their line into the water...`,
                inline: false
            },
            {
                name: '🐟 FISH TYPES',
                value: '🐟 **Common** (50%): 1.01x-1.05x\n' +
                       '🐠 **Uncommon** (25%): 1.06x-1.15x\n' +
                       '🐡 **Rare** (15%): 1.16x-1.35x\n' +
                       '🐙 **Legendary** (2%): 1.4x-1.8x\n' +
                       '🦈 **Red Fish** (7%): 🔥 LOSE ALL',
                inline: false
            }
        ];

        const bankFields = [
            { name: 'Bait Cost', value: fmt(this.initialBet), inline: true },
            { name: 'Remaining Wallet', value: fmt(this.walletAfter), inline: true },
            { name: 'Bank Balance', value: fmt(bankBalance), inline: true },
            { name: 'Current Winnings', value: fmt(this.initialBet), inline: true },
            { name: 'Strategy', value: 'Keep fishing for higher multipliers, or stop to secure winnings!', inline: true }
        ];

        return buildSessionEmbed({
            title: `🎣 ${this.username}'s Fishing`,
            topFields,
            bankFields,
            stageText: 'READY TO FISH',
            color: 0x3498DB,
            footer: '🔥 Warning: Red fish will steal all your catch! Fish responsibly.'
        });
    }

    /**
     * Get help embed using gameSessionKit
     */
    static getHelpEmbed() {
        const topFields = [
            {
                name: '🎣 HOW TO PLAY',
                value: '`/fishing [amount]` - Start fishing with your bet!\nClick **🎣 FISH** to catch fish and multiply winnings.\nClick **🔥 Stop Fishing** anytime to keep your current winnings.',
                inline: false
            },
            {
                name: '🐟 FISH TYPES & MULTIPLIERS',
                value: '🐟 **Common Fish** (50% chance)\n• Multiplier: 1.01x - 1.05x\n• Barely profitable catches\n\n' +
                       '🐠 **Uncommon Fish** (25% chance)\n• Multiplier: 1.06x - 1.15x\n• Small but steady gains\n\n' +
                       '🐡 **Rare Fish** (15% chance)\n• Multiplier: 1.16x - 1.35x\n• Decent rewards for the patient\n\n' +
                       '🐙 **Legendary Fish** (2% chance)\n• Multiplier: 1.4x - 1.8x\n• Rare catches for masters\n\n' +
                       '🦈 **Red Fish of Doom** (7% chance)\n• 🔥 **LOSE EVERYTHING!**\n• The cursed fish that steals all your catch',
                inline: false
            },
            {
                name: '💡 STRATEGY TIPS',
                value: '• **Start small** - Test your luck before big bets\n' +
                       '• **Know when to stop** - Greed leads to the red fish\n' +
                       '• **Compound effect** - Each catch multiplies your total winnings\n' +
                       '• **Risk vs Reward** - More catches = higher multipliers but more red fish risk',
                inline: false
            },
            {
                name: '🎣 GAME MECHANICS',
                value: '• Your bet becomes your starting winnings\n' +
                       '• Each fish multiplies your **current** winnings\n' +
                       '• Stop anytime to secure your current winnings\n' +
                       '• Red fish resets winnings to $0.00\n' +
                       '• **Maximum 20 catches per session**\n' +
                       '• Game auto-ends at 20 catches\n' +
                       '• Use shortcuts like "1k", "all", "half"',
                inline: false
            }
        ];

        const bankFields = [
            {
                name: 'Example Session',
                value: 'Bet: $100 → Catch 🐟 (1.1x) → $110\n' +
                       'Catch 🐡 (1.2x) → $132\n' +
                       'Catch 🐙 (1.5x) → $198\n' +
                       '**Stop here** = Win $98 profit!\n' +
                       'OR keep fishing and risk the 🦈 red fish...',
                inline: false
            }
        ];

        return buildSessionEmbed({
            title: '🎣 Fishing Game Help',
            topFields,
            bankFields,
            stageText: 'HELP GUIDE',
            color: 0x3498DB,
            footer: '🔥 Remember: The red fish appears randomly and steals everything! Fish responsibly.'
        });
    }
}

// Active fishing games storage
const activeFishingGames = new Map();

/**
 * Start a new fishing game
 */
function startFishingGame(userId, username, bet, walletAfter) {
    const game = new FishingGame(userId, username, bet, walletAfter);
    activeFishingGames.set(userId, game);
    return game;
}

/**
 * Get active fishing game for user
 */
function getFishingGame(userId) {
    return activeFishingGames.get(userId);
}

/**
 * End and remove fishing game
 */
async function endFishingGame(userId) {
    const game = activeFishingGames.get(userId);
    if (game) {
        activeFishingGames.delete(userId);
        
        // Session cleanup is handled by the command handler to avoid race conditions
        logger.info(`Fishing game ended for user ${userId} (session cleanup handled by command)`);
    }
    return game;
}

/**
 * Handle fishing button interactions
 */
async function handleFishingAction(interaction, action) {
    const userId = interaction.user.id;
    const game = getFishingGame(userId);

    if (!game) {
        await interaction.reply({
            content: '❌ No active fishing game found! Use `/fishing` to start a new game.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    try {
        let result = null;
        switch (action) {
            case 'fish':
                result = await handleFishAction(interaction, game);
                break;
            case 'stop':
                result = await handleStopAction(interaction, game);
                break;
            case 'help':
                result = await handleHelpAction(interaction);
                break;
            default:
                await interaction.reply({
                    content: '❌ Unknown fishing action.',
                    flags: MessageFlags.Ephemeral
                });
                return null;
        }
        return result;
    } catch (error) {
        logger.error(`Error handling fishing action ${action}:`, error);
        await interaction.reply({
            content: '❌ An error occurred while processing your fishing action.',
            flags: MessageFlags.Ephemeral
        });
        return null;
    }
}

/**
 * Handle fish button click
 */
async function handleFishAction(interaction, game) {
    if (game.gameEnded) {
        await interaction.reply({
            content: '🔥 This fishing session has already ended!',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    try {
        const result = game.catchFish();
        const { fishData, multiplier, oldWinnings, newWinnings, reachedLimit, lostToRedFish } = result;

        if (lostToRedFish) {
            // Red fish caught - game over
            const embed = game.createGameEmbed(
                '🔥 Red Fish of Doom!',
                fishData.color,
                `🔥 **You caught the cursed red fish and lost everything!**\n\nAll your catch has been stolen by the red fish of doom!`
            );

            const buttons = game.createButtons(true); // Disabled buttons

            await interaction.update({
                embeds: [embed],
                components: [buttons]
            });

            // End the game (will be handled by the command handler)
            return { gameEnded: true, lostToRedFish: true };

        } else if (reachedLimit) {
            // Reached catch limit
            const embed = game.createGameEmbed(
                `🎣 Final catch! ${fishData.emoji} **${fishData.name}**!`,
                fishData.color,
                `Multiplier: **${multiplier.toFixed(2)}x**\nWinnings: ${fmt(oldWinnings)} → **${fmt(newWinnings)}**\n\n🎣 **FISHING SESSION COMPLETED!** (20/20 catches)\nYou've reached the maximum catch limit!`
            );

            const buttons = game.createButtons(true); // Disabled buttons

            await interaction.update({
                embeds: [embed],
                components: [buttons]
            });

            return { gameEnded: true, reachedLimit: true };

        } else {
            // Normal catch
            const embed = game.createGameEmbed(
                `🎣 You caught a ${fishData.emoji} **${fishData.name}**!`,
                fishData.color,
                `Multiplier: **${multiplier.toFixed(2)}x**\nWinnings: ${fmt(oldWinnings)} → **${fmt(newWinnings)}**`
            );

            const buttons = game.createButtons();

            await interaction.update({
                embeds: [embed],
                components: [buttons]
            });

            return { gameEnded: false };
        }
    } catch (error) {
        logger.error('Error in handleFishAction:', error);
        await interaction.reply({
            content: '❌ An error occurred while catching fish.',
            flags: MessageFlags.Ephemeral
        });
        return { gameEnded: false };
    }
}

/**
 * Handle stop button click
 */
async function handleStopAction(interaction, game) {
    if (game.gameEnded) {
        await interaction.reply({
            content: '🔥 This fishing session has already ended!',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    if (game.totalCatches === 0) {
        await interaction.reply({
            content: '🔥 You haven\'t caught any fish yet! Cast your line first with the FISH button.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    try {
        game.stopFishing();

        const embed = buildSessionEmbed({
            title: `🎣 ${game.username}'s Fishing`,
            topFields: [
                {
                    name: '🔥 FISHING SESSION ENDED',
                    value: `${game.username} decided to stop fishing and secure their winnings!`,
                    inline: false
                }
            ],
            bankFields: [
                { name: 'Total Catches', value: game.totalCatches.toString(), inline: true },
                { name: 'Final Winnings', value: fmt(game.currentWinnings), inline: true },
                { name: 'Final Multiplier', value: `${(game.currentWinnings / game.initialBet).toFixed(2)}x`, inline: true }
            ],
            stageText: 'SESSION ENDED',
            color: 0x2ECC71,
            footer: 'Winnings secured! Thanks for fishing.'
        });

        const buttons = game.createButtons(true); // Disabled buttons

        await interaction.update({
            embeds: [embed],
            components: [buttons]
        });

        return { gameEnded: true, voluntaryStop: true, reachedLimit: false, lostToRedFish: false };
    } catch (error) {
        logger.error('Error in handleStopAction:', error);
        await interaction.reply({
            content: '❌ An error occurred while stopping the fishing session.',
            flags: MessageFlags.Ephemeral
        });
        return { gameEnded: false };
    }
}

/**
 * Handle help button click
 */
async function handleHelpAction(interaction) {
    const helpEmbed = FishingGame.getHelpEmbed();
    await interaction.reply({
        embeds: [helpEmbed],
        flags: MessageFlags.Ephemeral
    });
}

module.exports = {
    FishingGame,
    FISH_TYPES,
    generateRandomFish,
    startFishingGame,
    getFishingGame,
    endFishingGame,
    handleFishingAction,
    activeFishingGames
};