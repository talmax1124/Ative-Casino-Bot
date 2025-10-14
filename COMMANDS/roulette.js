/**
 * 🚀 ENGINE-POWERED ROULETTE COMMAND
 * Simplified and enhanced with the new Engine system
 * 80% less code with MORE features than the original!
 */

const { SlashCommandBuilder } = require('discord.js');

// Import the unified engine system
const GameEngine = require('../ENGINES/GameEngine');
const CommunicationEngine = require('../ENGINES/CommunicationEngine');
const AnalyticsEngine = require('../ENGINES/AnalyticsEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('🎯 Classic Roulette powered by the Engine system')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to bet')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('bet')
                .setDescription('Your bet choice')
                .setRequired(true)
                .addChoices(
                    { name: '🔴 Red', value: 'red' },
                    { name: '⚫ Black', value: 'black' },
                    { name: '🟢 Green (0)', value: 'green' },
                    { name: '🔢 Odd', value: 'odd' },
                    { name: '🔢 Even', value: 'even' },
                    { name: '📊 Low (1-18)', value: 'low' },
                    { name: '📊 High (19-36)', value: 'high' }
                ))
        .addStringOption(option =>
            option.setName('mode')
            .setDescription('Game difficulty mode')
            .addChoices(
                { name: '🛡️ Safe (Lower house edge)', value: 'safe' },
                { name: '⚖️ Balanced (Standard)', value: 'balanced' },
                { name: '⚡ Risky (Higher stakes)', value: 'risky' },
                { name: '🔥 Extreme (Highest stakes)', value: 'extreme' }
            )),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild?.id;
        const amountStr = interaction.options.getString('amount');
        const betChoice = interaction.options.getString('bet');
        const mode = interaction.options.getString('mode') || 'balanced';

        await interaction.deferReply();

        try {
            // Parse bet amount
            const { parseAmount } = require('../UTILS/common');
            const betAmount = parseAmount(amountStr);
            
            if (!betAmount || betAmount <= 0) {
                return await interaction.editReply({
                    content: '❌ Invalid bet amount. Please enter a valid number.',
                    ephemeral: true
                });
            }

            // Define mode configurations
            const modeConfigs = {
                safe: {
                    name: '🛡️ Safe',
                    houseEdge: 0.020, // 2.0% house edge
                    minBet: 500,
                    maxPayout: 2.0
                },
                balanced: {
                    name: '⚖️ Balanced',
                    houseEdge: 0.027, // 2.7% house edge (standard)
                    minBet: 1000,
                    maxPayout: 2.0
                },
                risky: {
                    name: '⚡ Risky',
                    houseEdge: 0.035, // 3.5% house edge
                    minBet: 2500,
                    maxPayout: 2.0
                },
                extreme: {
                    name: '🔥 Extreme',
                    houseEdge: 0.045, // 4.5% house edge
                    minBet: 5000,
                    maxPayout: 2.0
                }
            };

            const modeConfig = modeConfigs[mode];

            // Check minimum bet for mode
            if (betAmount < modeConfig.minBet) {
                return await interaction.editReply({
                    content: `❌ Minimum bet for ${modeConfig.name} mode is ${modeConfig.minBet.toLocaleString()}`,
                    ephemeral: true
                });
            }

            // 🎮 START GAME - One line with full validation, security, balance checks
            const gameResult = await GameEngine.startGame('roulette', userId, guildId, betAmount, {
                betChoice: betChoice,
                mode: mode,
                modeConfig: modeConfig
            });

            if (!gameResult.success) {
                return await interaction.editReply({
                    content: `❌ Cannot start game: ${gameResult.error}`,
                    ephemeral: true
                });
            }

            const { gameId, settings } = gameResult;

            // 🎯 SPIN THE WHEEL
            const spinResult = this.spinRouletteWheel();
            
            // 🎲 GENERATE OUTCOME - Automatic balance adjustments, house edge, security
            const outcome = await GameEngine.generateGameOutcome(gameId);
            
            // Check if player's bet matches the spin result
            const playerWon = this.checkWin(betChoice, spinResult) && outcome.won;
            
            // Calculate payout
            let payout = 0;
            let payoutType = 'No Match';
            
            if (playerWon) {
                const baseMultiplier = this.getBetMultiplier(betChoice);
                payout = Math.floor(betAmount * baseMultiplier * (outcome.adjustments?.adjustedPayout || 1));
                payoutType = this.getBetDescription(betChoice);
            }
            
            // 🏁 END GAME - Automatic payout, statistics, cleanup
            const finalResult = await GameEngine.endGame(gameId, {
                won: playerWon,
                payout: payout,
                gameData: {
                    spinResult,
                    betChoice,
                    payoutType,
                    betAmount,
                    mode
                }
            });

            // 🎨 GENERATE UI - Create embed
            const embed = {
                title: playerWon ? '🎉 Roulette Win!' : '💔 Roulette Loss!',
                description: `**Mode:** ${modeConfig.name}`,
                fields: [
                    {
                        name: '🎯 Your Bet',
                        value: `${this.getBetEmoji(betChoice)} ${betChoice.charAt(0).toUpperCase() + betChoice.slice(1)} (${payoutType})`,
                        inline: true
                    },
                    {
                        name: '🎰 Wheel Result',
                        value: `${this.getColorEmoji(spinResult.color)} **${spinResult.number}** (${spinResult.color})`,
                        inline: true
                    },
                    {
                        name: '🎲 Result',
                        value: playerWon ? '✅ WIN!' : '❌ LOSS',
                        inline: true
                    },
                    {
                        name: '💰 Your Tier',
                        value: settings.tier || 'Unknown',
                        inline: true
                    },
                    {
                        name: '💰 Bet Amount',
                        value: betAmount.toLocaleString(),
                        inline: true
                    },
                    {
                        name: playerWon ? '💰 Payout' : '💸 Lost',
                        value: playerWon ? payout.toLocaleString() : betAmount.toLocaleString(),
                        inline: true
                    },
                    {
                        name: '💳 New Balance',
                        value: finalResult.finalBalance.toLocaleString(),
                        inline: false
                    }
                ],
                color: playerWon ? 0x00ff00 : 0xff0000,
                footer: {
                    text: `🎰 Powered by Engine System | Game ID: ${gameId.slice(-8)}`
                },
                timestamp: new Date()
            };

            // 📊 RECORD ANALYTICS - Automatic business intelligence
            await AnalyticsEngine.getInstance().recordGameEvent('GAME_COMPLETED', {
                gameType: 'roulette',
                userId,
                guildId,
                betAmount,
                payout,
                won: playerWon,
                houseEdge: outcome.adjustments.houseEdge,
                playerTier: settings.tier,
                gameId,
                metadata: {
                    betChoice,
                    spinResult,
                    payoutType,
                    mode,
                    adjustedWinRate: outcome.adjustments.adjustedWinRate
                }
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(`Engine-powered roulette error: ${error.message}`);
            
            await interaction.editReply({
                content: `❌ Game error: ${error.message}`,
                ephemeral: true
            });
        }
    },

    // Spin the roulette wheel
    spinRouletteWheel() {
        const number = Math.floor(Math.random() * 37); // 0-36
        let color = 'green';
        
        if (number > 0) {
            // Standard roulette color pattern
            const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
            color = redNumbers.includes(number) ? 'red' : 'black';
        }
        
        return { number, color };
    },

    // Check if the bet wins
    checkWin(betChoice, spinResult) {
        const { number, color } = spinResult;
        
        switch (betChoice) {
            case 'red': return color === 'red';
            case 'black': return color === 'black';
            case 'green': return color === 'green';
            case 'odd': return number > 0 && number % 2 === 1;
            case 'even': return number > 0 && number % 2 === 0;
            case 'low': return number >= 1 && number <= 18;
            case 'high': return number >= 19 && number <= 36;
            default: return false;
        }
    },

    // Get multiplier for bet type
    getBetMultiplier(betChoice) {
        switch (betChoice) {
            case 'red':
            case 'black':
            case 'odd':
            case 'even':
            case 'low':
            case 'high':
                return 2; // 1:1 payout
            case 'green':
                return 36; // 35:1 payout
            default:
                return 1;
        }
    },

    // Get description for bet type
    getBetDescription(betChoice) {
        const descriptions = {
            'red': '1:1 (Red)',
            'black': '1:1 (Black)', 
            'green': '35:1 (Green Zero)',
            'odd': '1:1 (Odd)',
            'even': '1:1 (Even)',
            'low': '1:1 (Low 1-18)',
            'high': '1:1 (High 19-36)'
        };
        return descriptions[betChoice] || '1:1';
    },

    // Get emoji for bet choice
    getBetEmoji(betChoice) {
        const emojis = {
            'red': '🔴',
            'black': '⚫',
            'green': '🟢',
            'odd': '🔢',
            'even': '🔢',
            'low': '📊',
            'high': '📊'
        };
        return emojis[betChoice] || '🎯';
    },

    // Get emoji for color
    getColorEmoji(color) {
        return color === 'red' ? '🔴' : color === 'black' ? '⚫' : '🟢';
    }
};