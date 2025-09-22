/**
 * Heist Game Command - Test heist mini-games
 * Allows testing individual heist games for development purposes
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fmt } = require('../UTILS/common');
const logger = require('../UTILS/logger');

const DEVELOPER_ID = '466050111680544798';

// Available heist games
const HEIST_GAMES = {
    'memory': {
        name: 'Memory',
        description: 'Pattern memorization game - remember and repeat the sequence',
        file: '../heists/Games/Memory.js'
    },
    'reaction': {
        name: 'Reaction',
        description: 'Fast reaction game - react quickly to emojis within 2 seconds',
        file: '../heists/Games/Reaction.js'
    },
    'unscramble': {
        name: 'Unscramble',
        description: 'Word puzzle game - unscramble words within 30 seconds each',
        file: '../heists/Games/Unscramble.js'
    },
    'liedetector': {
        name: 'Lie Detector',
        description: 'Two Takes game - Con Artist bluffs, team guesses which statement is fake',
        file: '../heists/Games/LieDetector.js'
    },
    'keypadcode': {
        name: 'Keypad Code',
        description: '4-digit code breaking game - crack the security system with clues',
        file: '../heists/Games/KeypadCode.js'
    },
    'muscle-heist': {
        name: 'Muscle Heist',
        description: '4-stage brute force heist - teamwork, button mashing, and quick reactions',
        file: '../heists/Games/Muscle-Heist.js'
    },
    'wirecutting': {
        name: 'Wire Cutting',
        description: 'Riddle-based wire selection - solve riddles to cut the correct colored wire',
        file: '../heists/Games/WireCutting.js'
    },
    'binarycode': {
        name: 'Binary Code',
        description: 'Color-to-number encoding - decode color sequences using pattern mapping',
        file: '../heists/Games/BinaryCode.js'
    },
    'simonsaysdigital': {
        name: 'Simon Says Digital',
        description: 'Emoji sequence memory - watch and repeat the exact emoji sequence',
        file: '../heists/Games/SimonSaysDigital.js'
    },
    'firewallmaze': {
        name: 'Firewall Maze',
        description: 'Text maze navigation - navigate through security maze using directional commands',
        file: '../heists/Games/FirewallMaze.js'
    },
    'quickdrawshowdown': {
        name: 'Quick Draw Showdown',
        description: 'Reaction time challenge - type HIT fastest after DRAW command',
        file: '../heists/Games/QuickDrawShowdown.js'
    },
    'mashthekeyboard': {
        name: 'Mash The Keyboard',
        description: 'Button mashing challenge - spam 💪 emoji as fast as possible in 5 seconds',
        file: '../heists/Games/MashTheKeyboard.js'
    },
    'pushchallenge': {
        name: 'Push Challenge',
        description: 'Progress bar challenge - spam reactions to fill the bar before time runs out',
        file: '../heists/Games/PushChallenge.js'
    },
    'guardshowdown': {
        name: 'Guard Showdown',
        description: 'Quick draw duel - first to type HIT after DRAW wins, others fail',
        file: '../heists/Games/GuardShowdown.js'
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('heist-game')
        .setDescription('🎯 Test heist mini-games for development')
        .addStringOption(option =>
            option.setName('game')
                .setDescription('Which heist game to play')
                .setRequired(true)
                .addChoices(
                    { name: 'Memory - Pattern memorization', value: 'memory' },
                    { name: 'Reaction - Fast emoji reactions', value: 'reaction' },
                    { name: 'Unscramble - Word puzzle solving', value: 'unscramble' },
                    { name: 'Lie Detector - Truth vs Bluff voting', value: 'liedetector' },
                    { name: 'Keypad Code - 4-digit security bypass', value: 'keypadcode' },
                    { name: 'Wire Cutting - Riddle-based wire selection', value: 'wirecutting' },
                    { name: 'Binary Code - Color-to-number encoding', value: 'binarycode' },
                    { name: 'Simon Says Digital - Emoji sequence memory', value: 'simonsaysdigital' },
                    { name: 'Firewall Maze - Text maze navigation', value: 'firewallmaze' },
                    { name: 'Quick Draw Showdown - Reaction time challenge', value: 'quickdrawshowdown' },
                    { name: 'Mash The Keyboard - Button mashing challenge', value: 'mashthekeyboard' },
                    { name: 'Push Challenge - Progress bar reaction spam', value: 'pushchallenge' },
                    { name: 'Guard Showdown - Quick draw duel challenge', value: 'guardshowdown' },
                    { name: 'Muscle Heist - 4-stage brute force teamwork', value: 'muscle-heist' }
                )
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const gameType = interaction.options.getString('game');

        try {
            // Check if user is developer
            if (userId !== DEVELOPER_ID) {
                const embed = new EmbedBuilder()
                    .setTitle('🔒 Developer Only')
                    .setDescription('This command is restricted to developers only.')
                    .setColor(0xFF0000);
                return await interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Defer reply immediately
            await interaction.deferReply();

            // Check if game exists
            const gameConfig = HEIST_GAMES[gameType];
            if (!gameConfig) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Invalid Game')
                    .setDescription('That heist game doesn\'t exist.')
                    .setColor(0xFF0000);
                return await interaction.editReply({ embeds: [embed] });
            }

            logger.info(`Heist game '${gameType}' started by ${username} (${userId})`);

            // Load and execute the specific game
            try {
                const GameClass = require(gameConfig.file);
                const game = new GameClass({
                    userId,
                    username,
                    channelId: interaction.channelId,
                    guildId: interaction.guildId
                });

                await game.start(interaction);

            } catch (gameError) {
                logger.error(`Failed to load heist game '${gameType}': ${gameError.message}`);
                
                const embed = new EmbedBuilder()
                    .setTitle('❌ Game Error')
                    .setDescription(`Failed to start ${gameConfig.name}. The game may not be implemented yet.`)
                    .setColor(0xFF0000);
                
                return await interaction.editReply({ embeds: [embed] });
            }

        } catch (error) {
            logger.error(`Heist game command failed: ${error?.stack || error}`);
            
            const embed = new EmbedBuilder()
                .setTitle('❌ Command Error')
                .setDescription('Failed to execute heist game command. Please try again.')
                .setColor(0xFF0000);

            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ embeds: [embed] });
                } else {
                    await interaction.reply({ embeds: [embed] });
                }
            } catch (replyError) {
                logger.error(`Failed to send error reply: ${replyError.message}`);
            }
        }
    }
};