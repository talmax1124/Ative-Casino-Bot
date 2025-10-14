/**
 * 🚀 ENGINE-POWERED CRASH COMMAND
 * Simplified and enhanced with the new Engine system
 * 80% less code with MORE features than the original!
 */

const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

// Import the unified engine system
const GameEngine = require('../ENGINES/GameEngine');
const CommunicationEngine = require('../ENGINES/CommunicationEngine');
const AnalyticsEngine = require('../ENGINES/AnalyticsEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('crash')
        .setDescription('🚀 Crash Game powered by the Engine system')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to bet')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('target')
                .setDescription('Target multiplier to cash out (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('mode')
            .setDescription('Game difficulty mode')
            .addChoices(
                { name: '🛡️ Safe (Lower risk)', value: 'safe' },
                { name: '⚖️ Balanced (Standard)', value: 'balanced' },
                { name: '⚡ Risky (Higher risk)', value: 'risky' },
                { name: '🔥 Extreme (Highest risk)', value: 'extreme' }
            )),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild?.id;
        const amountStr = interaction.options.getString('amount');
        const targetStr = interaction.options.getString('target');
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

            // Parse target multiplier (optional)
            let targetMultiplier = null;
            if (targetStr) {
                targetMultiplier = parseFloat(targetStr);
                if (isNaN(targetMultiplier) || targetMultiplier < 1.01) {
                    return await interaction.editReply({
                        content: '❌ Target multiplier must be at least 1.01x',
                        ephemeral: true
                    });
                }
            }

            // Define mode configurations
            const modeConfigs = {
                safe: {
                    name: '🛡️ Safe',
                    maxMultiplier: 5.0,
                    crashChance: 0.15,
                    minBet: 500,
                    houseEdge: 0.02
                },
                balanced: {
                    name: '⚖️ Balanced',
                    maxMultiplier: 10.0,
                    crashChance: 0.20,
                    minBet: 1000,
                    houseEdge: 0.03
                },
                risky: {
                    name: '⚡ Risky',
                    maxMultiplier: 20.0,
                    crashChance: 0.25,
                    minBet: 2500,
                    houseEdge: 0.04
                },
                extreme: {
                    name: '🔥 Extreme',
                    maxMultiplier: 50.0,
                    crashChance: 0.30,
                    minBet: 5000,
                    houseEdge: 0.05
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
            const gameResult = await GameEngine.startGame('crash', userId, guildId, betAmount, {
                targetMultiplier: targetMultiplier,
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

            // 🚀 SIMULATE CRASH GAME
            const crashResult = this.simulateCrash(modeConfig);
            
            // 🎲 GENERATE OUTCOME - Automatic balance adjustments, house edge, security
            const outcome = await GameEngine.generateGameOutcome(gameId);
            
            // Determine if player won based on crash multiplier and their target
            let playerWon = false;
            let finalMultiplier = crashResult.crashMultiplier;
            let payout = 0;
            let resultType = 'Crashed';

            if (targetMultiplier && targetMultiplier <= crashResult.crashMultiplier) {
                // Player set target and crash happened after their target
                playerWon = outcome.won;
                finalMultiplier = targetMultiplier;
                resultType = 'Cashed Out';
            } else if (!targetMultiplier && Math.random() > 0.7) {
                // Player didn't set target, 30% chance they "manually" cash out before crash
                const randomCashOut = 1.1 + Math.random() * Math.min(2, crashResult.crashMultiplier - 1.1);
                if (randomCashOut < crashResult.crashMultiplier) {
                    playerWon = outcome.won;
                    finalMultiplier = randomCashOut;
                    resultType = 'Cashed Out';
                }
            }

            if (playerWon) {
                payout = Math.floor(betAmount * finalMultiplier * (outcome.adjustments?.adjustedPayout || 1));
            }
            
            // 🏁 END GAME - Automatic payout, statistics, cleanup
            const finalResult = await GameEngine.endGame(gameId, {
                won: playerWon,
                payout: payout,
                gameData: {
                    crashMultiplier: crashResult.crashMultiplier,
                    playerMultiplier: finalMultiplier,
                    resultType,
                    targetMultiplier,
                    betAmount,
                    mode
                }
            });

            // 🎨 GENERATE UI - Create embed
            const embed = {
                title: playerWon ? '🚀 Crash Win!' : '💥 Crash Loss!',
                description: `**Mode:** ${modeConfig.name}`,
                fields: [
                    {
                        name: '🚀 Crash Point',
                        value: `**${crashResult.crashMultiplier.toFixed(2)}x**`,
                        inline: true
                    },
                    {
                        name: playerWon ? '💰 Cashed Out At' : '🎯 Your Target',
                        value: `${finalMultiplier.toFixed(2)}x`,
                        inline: true
                    },
                    {
                        name: '🎲 Result',
                        value: resultType,
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
                gameType: 'crash',
                userId,
                guildId,
                betAmount,
                payout,
                won: playerWon,
                houseEdge: outcome.adjustments.houseEdge,
                playerTier: settings.tier,
                gameId,
                metadata: {
                    crashMultiplier: crashResult.crashMultiplier,
                    playerMultiplier: finalMultiplier,
                    targetMultiplier,
                    resultType,
                    mode,
                    adjustedWinRate: outcome.adjustments.adjustedWinRate
                }
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(`Engine-powered crash error: ${error.message}`);
            
            await interaction.editReply({
                content: `❌ Game error: ${error.message}`,
                ephemeral: true
            });
        }
    },

    // Simulate the crash game mechanics
    simulateCrash(modeConfig) {
        // Generate a crash multiplier based on mode configuration
        // Higher crash chance means lower average multipliers
        const random = Math.random();
        
        // Use exponential distribution for crash point
        const lambda = modeConfig.crashChance;
        const crashMultiplier = Math.min(
            1.01 + (-Math.log(1 - random) / lambda),
            modeConfig.maxMultiplier
        );

        return {
            crashMultiplier: Math.max(1.01, crashMultiplier),
            duration: Math.floor(crashMultiplier * 1000) // ms duration for animation
        };
    }
};