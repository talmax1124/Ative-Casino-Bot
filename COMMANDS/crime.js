/**
 * Crime command for quick petty crimes
 * 1K-5K range with 30 minute cooldown
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage } = require('../UTILS/common');
const { secureRandomInt } = require('../UTILS/rng');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('Commit petty crimes for quick cash (1K-5K every 30 minutes)'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = await getGuildId(interaction);

        try {
            await interaction.deferReply();

            await dbManager.ensureUser(userId, username);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Check cooldown (30 minutes)
            const now = Date.now() / 1000;
            const lastCrime = balance.last_crime_ts || 0;
            const cooldown = 1800; // 30 minutes

            if (now - lastCrime < cooldown) {
                const remainingTime = Math.ceil(cooldown - (now - lastCrime));
                const minutes = Math.floor(remainingTime / 60);
                const seconds = remainingTime % 60;

                const embed = buildSessionEmbed({
                    title: `🚨 ${username}'s Criminal Status`,
                    topFields: [
                        { name: '🚨 Laying Low', value: `The heat is still on!\nLay low for ${minutes}m ${seconds}s before your next crime` }
                    ],
                    stageText: 'HIDING FROM POLICE',
                    color: 0xFF6B6B,
                    footer: 'Crime Command • 30 minute cooldown'
                });

                return await interaction.editReply({ embeds: [embed] });
            }

            // Crime scenarios (1K-5K range)
            const crimeScenarios = [
                { crime: 'Pickpocketed a distracted gambler', min: 1000, max: 2500 },
                { crime: 'Found forgotten chips under a slot machine', min: 1200, max: 3000 },
                { crime: 'Swiped loose change from a fountain', min: 1000, max: 1800 },
                { crime: 'Sold fake casino "insider tips"', min: 2000, max: 4000 },
                { crime: 'Collected dropped betting slips', min: 1500, max: 3500 },
                { crime: 'Scammed tourists with rigged dice', min: 2500, max: 5000 },
                { crime: 'Snuck extra chips during confusion', min: 1800, max: 4200 }
            ];

            const scenario = crimeScenarios[secureRandomInt(0, crimeScenarios.length)];
            const earning = secureRandomInt(scenario.min, scenario.max + 1);

            // Update balance and timestamp
            const newWallet = balance.wallet + earning;
            await dbManager.setUserBalance(userId, guildId, newWallet, balance.bank, {
                last_crime_ts: now
            });

            // Crime details in topFields
            const topFields = [{
                name: '🦹 CRIME COMPLETE',
                value: `**${scenario.crime}**\n` +
                       `\`\`\`diff\n+ Earnings: ${fmt(earning)}\n  Previous: ${fmt(balance.wallet)}\n+ New Balance: ${fmt(newWallet)}\`\`\``,
                inline: false
            }];

            // Balance information in bankFields
            const bankFields = [
                { name: 'Crime Earnings', value: fmt(earning), inline: true },
                { name: 'Current Balance', value: fmt(newWallet), inline: true },
                { name: 'Next Crime Available', value: 'In 30 minutes', inline: true }
            ];

            // Stage text for current status
            const stageText = 'CRIME SUCCESS';
            
            // Build the embed using gameSessionKit
            const embed = buildSessionEmbed({
                title: `🦹 ${username}'s Crime Complete!`,
                topFields,
                bankFields,
                stageText,
                color: 0x8B0000,
                footer: '🦹 Crime • 30 minute cooldown • ATIVE Casino'
            });

            await interaction.editReply({ embeds: [embed] });

            // Log the crime
            await sendLogMessage(
                interaction.client,
                'economy',
                `Crime completed: ${username} ${scenario.crime.toLowerCase()} and earned ${fmt(earning)} (Balance: ${fmt(newWallet)})`,
                userId,
                guildId
            );

        } catch (error) {
            logger.error(`Error processing crime command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Crime Failed',
                topFields: [
                    { name: '🚨 Busted!', value: 'Your crime was unsuccessful! Better luck next time.' }
                ],
                stageText: 'CRIME FAILED',
                color: 0xFF0000,
                footer: 'Crime System Error'
            });

            try {
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: 64 });
                }
            } catch (replyError) {
                logger.error(`Failed to send crime error reply: ${replyError.message}`);
            }
        }
    }
};