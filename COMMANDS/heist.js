/**
 * Heist command for big money with different tasks
 * 10K-30K range with 2.5 hour cooldown
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtFull, fmtDelta, getGuildId, sendLogMessage } = require('../UTILS/common');
const { secureRandomInt } = require('../UTILS/rng');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const GameSessionIntegrator = require('../UTILS/gameSessionIntegrator');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('heist')
        .setDescription('Plan and execute a heist for big money (10K-30K every 2.5 hours)'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        try {
            // Defer the reply immediately to prevent timeout
            await interaction.deferReply();
            
            await dbManager.ensureUser(userId, interaction.user.displayName);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Check cooldown (2.5 hours)
            const now = Date.now() / 1000;
            const lastHeist = balance.last_heist_ts || 0;
            const cooldown = 9000; // 2.5 hours (2.5 * 60 * 60)

            if (now - lastHeist < cooldown) {
                const remainingTime = Math.ceil(cooldown - (now - lastHeist));
                const hours = Math.floor(remainingTime / 3600);
                const minutes = Math.floor((remainingTime % 3600) / 60);

                const embed = buildSessionEmbed({
                    title: `🎭 ${interaction.user.displayName}'s Heist`,
                    topFields: [
                        { name: 'Planning Phase', value: `You're still planning your next big heist!\nCome back in ${hours}h ${minutes}m` },
                        { name: 'Status', value: 'Gathering intel and assembling crew...' }
                    ],
                    stageText: 'PLANNING IN PROGRESS',
                    color: 0x4B0082,
                    footer: 'Heist Command'
                });

                return await interaction.editReply({ embeds: [embed] });
            }

            // Create game session
            const sessionResult = await GameSessionIntegrator.createGameSession({
                userId,
                guildId,
                channelId: interaction.channelId,
                gameType: 'heist',
                betAmount: 0, // No bet for heist
                timeout: 60000, // 1 minute for Heist
                metadata: {
                    gamePhase: 'active',
                    singlePlayer: true
                },
                interaction
            });
            
            if (!sessionResult.success) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Session Error')
                    .setDescription(`Failed to create game session: ${sessionResult.error}`)
                    .setColor(0xFF0000);
                
                return await interaction.editReply({ embeds: [embed] });
            }

            // Heist scenarios with different tasks (10K-30K range)
            const heistScenarios = [
                { 
                    target: 'Casino Vault', 
                    task: 'Disable security cameras and crack the safe',
                    difficulty: 'Expert',
                    min: 20000, 
                    max: 30000 
                },
                { 
                    target: 'High-Stakes Poker Room', 
                    task: 'Distract dealers while team swipes chips',
                    difficulty: 'Advanced',
                    min: 15000, 
                    max: 25000 
                },
                { 
                    target: 'VIP Lounge', 
                    task: 'Infiltrate exclusive party and rob wealthy patrons',
                    difficulty: 'Intermediate',
                    min: 12000, 
                    max: 22000 
                },
                { 
                    target: 'Armored Car', 
                    task: 'Intercept cash delivery to casino',
                    difficulty: 'Expert',
                    min: 18000, 
                    max: 28000 
                },
                { 
                    target: 'Casino Floor', 
                    task: 'Create diversion and steal from multiple machines',
                    difficulty: 'Beginner',
                    min: 10000, 
                    max: 18000 
                },
                { 
                    target: 'Private Game Room', 
                    task: 'Rob underground high-stakes game',
                    difficulty: 'Advanced',
                    min: 16000, 
                    max: 26000 
                }
            ];

            const scenario = heistScenarios[secureRandomInt(0, heistScenarios.length)];
            const earning = secureRandomInt(scenario.min, scenario.max + 1);

            // Update balance and timestamp
            const newWallet = balance.wallet + earning;
            await dbManager.setUserBalance(userId, guildId, newWallet, balance.bank, {
                last_heist_ts: now
            });

            const embed = buildSessionEmbed({
                title: `🎭 ${interaction.user.displayName}'s Heist`,
                topFields: [
                    { name: 'Target', value: scenario.target },
                    { name: 'Mission', value: scenario.task },
                    { name: 'Difficulty', value: scenario.difficulty, inline: true },
                    { name: 'Earnings', value: fmtFull(earning), inline: true },
                    { name: 'Success Rate', value: '100%', inline: true }
                ],
                bankFields: [
                    { name: 'Previous Wallet', value: fmtFull(balance.wallet), inline: true },
                    { name: 'New Wallet', value: fmtFull(newWallet), inline: true },
                    { name: 'Bank', value: fmtFull(balance.bank), inline: true }
                ],
                stageText: 'HEIST SUCCESSFUL',
                color: 0x9932CC,
                footer: 'Heist Command'
            });

            await interaction.editReply({ embeds: [embed] });

            // Log the heist
            await sendLogMessage(
                interaction.client,
                'info',
                `**Heist Command Used**\n` +
                `**User:** ${interaction.user} (\`${interaction.user.id}\`)\n` +
                `**Amount:** ${fmtFull(earning)}\n` +
                `**Target:** ${scenario.target}\n` +
                `**Task:** ${scenario.task}\n` +
                `**Difficulty:** ${scenario.difficulty}\n` +
                `**New Balance:** ${fmtFull(newWallet)}`,
                userId,
                guildId
            );

            // Complete session
            await GameSessionIntegrator.completeGameSession(sessionResult.sessionId, {
                outcome: 'WON',
                payout: earning,
                won: true,
                netChange: earning
            });

        } catch (error) {
            logger.error(`Error processing heist command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: `❌ ${interaction.user.displayName}'s Heist`,
                topFields: [
                    { name: 'Heist Failed', value: 'Your heist was foiled!\nThe authorities were waiting for you.' },
                    { name: 'Result', value: 'Mission compromised - try again later' }
                ],
                stageText: 'MISSION COMPROMISED',
                color: 0xFF0000,
                footer: 'Heist Command'
            });

            // Try to reply if not already deferred/replied
            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else if (!interaction.replied) {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};