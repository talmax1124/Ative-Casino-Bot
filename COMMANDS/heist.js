/**
 * Heist command for big money with different tasks
 * 10K-30K range with 2.5 hour cooldown
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage } = require('../UTILS/common');
const { secureRandomInt } = require('../UTILS/rng');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('heist')
        .setDescription('Plan and execute a heist for big money (10K-30K every 2.5 hours)'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        try {
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

                const embed = new EmbedBuilder()
                    .setTitle('🎭 Planning Phase')
                    .setDescription(`You're still planning your next big heist! Come back in ${hours}h ${minutes}m`)
                    .addFields({ name: '🕵️ Status', value: 'Gathering intel and assembling crew...', inline: false })
                    .setColor(0x4B0082)
                    .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                    .setFooter({ text: '🎭 Heist Command • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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

            const embed = new EmbedBuilder()
                .setTitle('🎭 Heist Successful!')
                .setDescription(`**Target:** ${scenario.target}\n**Mission:** ${scenario.task}`)
                .addFields(
                    { name: '🎯 Difficulty', value: scenario.difficulty, inline: true },
                    { name: '💰 Heist Earnings', value: fmt(earning), inline: true },
                    { name: '💎 Success Rate', value: '100%', inline: true },
                    { name: '💵 Previous Balance', value: fmt(balance.wallet), inline: true },
                    { name: '💸 New Balance', value: fmt(newWallet), inline: true },
                    { name: '📈 Profit', value: fmtDelta(newWallet, balance.wallet), inline: true }
                )
                .setColor(0x9932CC)
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({ text: '🎭 Heist Command • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Log the heist
            await sendLogMessage(
                interaction.client,
                'info',
                `**Heist Command Used**\n` +
                `**User:** ${interaction.user} (\`${interaction.user.id}\`)\n` +
                `**Amount:** ${fmt(earning)}\n` +
                `**Target:** ${scenario.target}\n` +
                `**Task:** ${scenario.task}\n` +
                `**Difficulty:** ${scenario.difficulty}\n` +
                `**New Balance:** ${fmt(newWallet)}`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error processing heist command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Heist Failed')
                .setDescription('Your heist was foiled! The authorities were waiting for you.')
                .addFields({ name: '🚨 Result', value: 'Mission compromised - try again later', inline: false })
                .setColor(0xFF0000)
                .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                .setFooter({ text: '🛠️ Error • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};