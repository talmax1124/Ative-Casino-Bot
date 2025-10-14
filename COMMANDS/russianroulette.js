/**
 * 🚀 ENGINE-POWERED RUSSIAN ROULETTE COMMAND
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
        .setName('russianroulette')
        .setDescription('🔫 Russian Roulette powered by the Engine system')
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Amount to bet')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('chambers')
                .setDescription('Number of chambers (3-8)')
                .setRequired(false)
                .setMinValue(3)
                .setMaxValue(8)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild?.id;
        const amountStr = interaction.options.getString('amount');
        const chambers = interaction.options.getInteger('chambers') || 6;

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

            // 🎮 START GAME - One line with full validation, security, balance checks
            const gameResult = await GameEngine.startGame('russianroulette', userId, guildId, betAmount, {
                chambers: chambers
            });

            if (!gameResult.success) {
                return await interaction.editReply({
                    content: `❌ Cannot start game: ${gameResult.error}`,
                    ephemeral: true
                });
            }

            const { gameId, settings } = gameResult;

            // 🔫 SIMULATE RUSSIAN ROULETTE
            const bulletPosition = Math.floor(Math.random() * chambers) + 1;
            const playerTrigger = Math.floor(Math.random() * chambers) + 1;
            
            // 🎲 GENERATE OUTCOME - Automatic balance adjustments, house edge, security
            const outcome = await GameEngine.generateGameOutcome(gameId);
            
            // Player survives if they don't pull the bullet chamber AND engine says they won
            const playerSurvived = (playerTrigger !== bulletPosition) && outcome.won;
            
            // Calculate payout - higher chamber count = higher risk = higher reward
            let payout = 0;
            let multiplier = 0;
            
            if (playerSurvived) {
                // Base multiplier based on chamber count (more chambers = higher survival chance = lower multiplier)
                const baseMultiplier = chambers * 0.8; // 6 chambers = 4.8x, 3 chambers = 2.4x, etc.
                multiplier = baseMultiplier;
                payout = Math.floor(betAmount * multiplier * (outcome.adjustments?.adjustedPayout || 1));
            }
            
            // 🏁 END GAME - Automatic payout, statistics, cleanup
            const finalResult = await GameEngine.endGame(gameId, {
                won: playerSurvived,
                payout: payout,
                gameData: {
                    chambers,
                    bulletPosition,
                    playerTrigger,
                    survived: playerSurvived,
                    multiplier,
                    betAmount
                }
            });

            // 🎨 GENERATE UI - Create embed
            const chamberDisplay = this.createChamberDisplay(chambers, bulletPosition, playerTrigger);
            
            const embed = {
                title: playerSurvived ? '😅 Russian Roulette Survival!' : '💀 Russian Roulette Death!',
                description: `**Chambers:** ${chambers} | **Your Pull:** ${playerTrigger}`,
                fields: [
                    {
                        name: '🔫 Revolver',
                        value: chamberDisplay,
                        inline: false
                    },
                    {
                        name: '💀 Bullet Chamber',
                        value: `${bulletPosition}`,
                        inline: true
                    },
                    {
                        name: '🎯 Your Chamber',
                        value: `${playerTrigger}`,
                        inline: true
                    },
                    {
                        name: '🎲 Result',
                        value: playerSurvived ? '✅ SURVIVED!' : '💀 DEATH!',
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
                        name: playerSurvived ? '💰 Payout' : '💸 Lost',
                        value: playerSurvived ? `${payout.toLocaleString()} (${multiplier.toFixed(1)}x)` : betAmount.toLocaleString(),
                        inline: true
                    },
                    {
                        name: '💳 New Balance',
                        value: finalResult.finalBalance.toLocaleString(),
                        inline: false
                    }
                ],
                color: playerSurvived ? 0x00ff00 : 0xff0000,
                footer: {
                    text: `🎰 Powered by Engine System | Game ID: ${gameId.slice(-8)}`
                },
                timestamp: new Date()
            };

            // 📊 RECORD ANALYTICS - Automatic business intelligence
            await AnalyticsEngine.getInstance().recordGameEvent('GAME_COMPLETED', {
                gameType: 'russianroulette',
                userId,
                guildId,
                betAmount,
                payout,
                won: playerSurvived,
                houseEdge: outcome.adjustments.houseEdge,
                playerTier: settings.tier,
                gameId,
                metadata: {
                    chambers,
                    bulletPosition,
                    playerTrigger,
                    survived: playerSurvived,
                    multiplier,
                    adjustedWinRate: outcome.adjustments.adjustedWinRate
                }
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(`Engine-powered russian roulette error: ${error.message}`);
            
            await interaction.editReply({
                content: `❌ Game error: ${error.message}`,
                ephemeral: true
            });
        }
    },

    // Create visual chamber display
    createChamberDisplay(chambers, bulletPosition, playerTrigger) {
        let display = '';
        
        for (let i = 1; i <= chambers; i++) {
            if (i === bulletPosition && i === playerTrigger) {
                display += '💥'; // Player pulled the bullet chamber
            } else if (i === bulletPosition) {
                display += '💀'; // Bullet chamber (revealed after game)
            } else if (i === playerTrigger) {
                display += '✅'; // Safe chamber player pulled
            } else {
                display += '⚫'; // Other chambers
            }
            
            if (i < chambers) {
                display += ' ';
            }
        }
        
        return display;
    }
};