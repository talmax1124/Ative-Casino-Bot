/**
 * Rob command - steal money from other users with tier restrictions
 * Takes 8% of target's balance on success, 4% penalty on failure
 * Cannot rob 2+ tiers higher or the developer
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtFull, getGuildId, sendLogMessage, getEconomicTier, getAllTiers } = require('../UTILS/common');
const { secureRandomChance } = require('../UTILS/rng');
const logger = require('../UTILS/logger');

const DEVELOPER_ID = '466050111680544798'; // From CLAUDE.md
const ROB_COOLDOWN = 3600; // 1 hour cooldown

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rob')
        .setDescription('Attempt to rob another user (8% success, 4% penalty on failure)')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('User to attempt to rob')
                .setRequired(true)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const targetUser = interaction.options.getUser('target');
        const targetId = targetUser.id;
        const guildId = await getGuildId(interaction);

        // Basic validation
        if (userId === targetId) {
            const embed = new EmbedBuilder()
                .setTitle('🤦 Self-Rob Attempt')
                .setDescription('You cannot rob yourself! Try working instead.')
                .setColor(0xFF6B6B)
                .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                .setFooter({ text: '🦹 Rob Command • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // Developer protection
        if (targetId === DEVELOPER_ID) {
            const embed = new EmbedBuilder()
                .setTitle('🛡️ Developer Protection')
                .setDescription('Nice try! The developer cannot be robbed. You\'ve been reported to the authorities.')
                .setColor(0xFF0000)
                .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                .setFooter({ text: '🦹 Rob Command • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // Bot protection
        if (targetUser.bot) {
            const embed = new EmbedBuilder()
                .setTitle('🤖 Bot Protection')
                .setDescription('You cannot rob bots! They don\'t have money anyway.')
                .setColor(0xFF6B6B)
                .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                .setFooter({ text: '🦹 Rob Command • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        try {
            await dbManager.ensureUser(userId, interaction.user.displayName);
            await dbManager.ensureUser(targetId, targetUser.displayName);

            const robberBalance = await dbManager.getUserBalance(userId, guildId);
            const targetBalance = await dbManager.getUserBalance(targetId, guildId);

            // Check cooldown
            const now = Date.now() / 1000;
            const lastRob = robberBalance.last_rob_ts || 0;

            if (now - lastRob < ROB_COOLDOWN) {
                const remainingTime = Math.ceil(ROB_COOLDOWN - (now - lastRob));
                const hours = Math.floor(remainingTime / 3600);
                const minutes = Math.floor((remainingTime % 3600) / 60);
                const seconds = remainingTime % 60;

                const embed = new EmbedBuilder()
                    .setTitle('⏰ Laying Low')
                    .setDescription(`You're still hiding from your last robbery! Come back in ${hours}h ${minutes}m ${seconds}s`)
                    .setColor(0xFFAA00)
                    .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                    .setFooter({ text: '🦹 Rob Command • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            // Get tier information
            const robberTotal = robberBalance.wallet + robberBalance.bank;
            const targetTotal = targetBalance.wallet + targetBalance.bank;
            
            const robberTier = getEconomicTier(robberTotal);
            const targetTier = getEconomicTier(targetTotal);

            // Check tier restrictions (cannot rob 2+ tiers higher)
            const allTiers = getAllTiers().reverse(); // Highest to lowest
            const robberTierIndex = allTiers.findIndex(t => t.key === robberTier.key);
            const targetTierIndex = allTiers.findIndex(t => t.key === targetTier.key);
            
            const tierDifference = robberTierIndex - targetTierIndex; // Negative means target is higher

            if (tierDifference <= -2) { // Target is 2+ tiers higher
                const embed = new EmbedBuilder()
                    .setTitle('🛡️ Tier Protection')
                    .setDescription(`You cannot rob someone 2+ tiers above you!\n\n**Your Tier:** ${robberTier.emoji} ${robberTier.name}\n**Target Tier:** ${targetTier.emoji} ${targetTier.name}\n\nRob someone closer to your level.`)
                    .setColor(0xFF6B6B)
                    .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                    .setFooter({ text: '🦹 Rob Command • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            // Check if target has money to rob
            if (targetBalance.wallet <= 0 && targetBalance.bank <= 0) {
                const embed = new EmbedBuilder()
                    .setTitle('💸 No Money Found')
                    .setDescription(`${targetUser.displayName} has no money to steal! They're as broke as you are.`)
                    .setColor(0xFF6B6B)
                    .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                    .setFooter({ text: '🦹 Rob Command • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            // Calculate success rate based on tier difference and random factors
            let baseSuccessRate = 50; // 50% base rate
            
            // Tier advantage/disadvantage
            if (tierDifference > 0) {
                // Robbing lower tier - slight advantage
                baseSuccessRate += Math.min(tierDifference * 10, 20);
            } else if (tierDifference < 0) {
                // Robbing higher tier - disadvantage
                baseSuccessRate += Math.max(tierDifference * 15, -30);
            }

            // Ensure reasonable bounds
            baseSuccessRate = Math.max(20, Math.min(80, baseSuccessRate));

            const robSuccess = secureRandomChance(baseSuccessRate);

            // Update cooldown
            await dbManager.setUserBalance(userId, guildId, robberBalance.wallet, robberBalance.bank, {
                last_rob_ts: now
            });

            if (robSuccess) {
                // SUCCESS: Take 8% of target's money
                let stolenAmount = 0;
                let sourceAccount = '';
                let newTargetWallet = targetBalance.wallet;
                let newTargetBank = targetBalance.bank;

                // Prioritize wallet first, then bank
                if (targetBalance.wallet > 0) {
                    stolenAmount = Math.floor(targetBalance.wallet * 0.08);
                    newTargetWallet = targetBalance.wallet - stolenAmount;
                    sourceAccount = 'wallet';
                } else if (targetBalance.bank > 0) {
                    stolenAmount = Math.floor(targetBalance.bank * 0.08);
                    newTargetBank = targetBalance.bank - stolenAmount;
                    sourceAccount = 'bank';
                }

                // Give money to robber
                const newRobberWallet = robberBalance.wallet + stolenAmount;

                // Update balances
                await dbManager.setUserBalance(userId, guildId, newRobberWallet, robberBalance.bank);
                await dbManager.setUserBalance(targetId, guildId, newTargetWallet, newTargetBank);

                const embed = new EmbedBuilder()
                    .setTitle('🎭 Robbery Success!')
                    .setDescription(`You successfully robbed ${targetUser.displayName} and got away with ${fmt(stolenAmount)}!`)
                    .addFields(
                        { name: '💰 Amount Stolen', value: fmt(stolenAmount), inline: true },
                        { name: '💳 Source', value: sourceAccount === 'wallet' ? '💵 Wallet' : '🏦 Bank', inline: true },
                        { name: '📊 Success Rate', value: `${baseSuccessRate}%`, inline: true },
                        { name: '🎖️ Your Tier', value: `${robberTier.emoji} ${robberTier.name}`, inline: true },
                        { name: '🎯 Target Tier', value: `${targetTier.emoji} ${targetTier.name}`, inline: true },
                        { name: '💸 Your New Balance', value: fmt(newRobberWallet), inline: true }
                    )
                    .setColor(0x32CD32)
                    .setThumbnail(interaction.user.displayAvatarURL())
                    .setFooter({ text: '🦹 Rob Command • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });

                // Log the successful robbery
                await sendLogMessage(
                    interaction.client,
                    'info',
                    `**Successful Robbery**\n` +
                    `**Robber:** ${interaction.user} (\`${userId}\`) - ${robberTier.emoji} ${robberTier.name}\n` +
                    `**Target:** ${targetUser} (\`${targetId}\`) - ${targetTier.emoji} ${targetTier.name}\n` +
                    `**Amount Stolen:** ${fmt(stolenAmount)} from ${sourceAccount}\n` +
                    `**Success Rate:** ${baseSuccessRate}%`,
                    userId,
                    guildId
                );

            } else {
                // FAILURE: 4% penalty from robber
                let penaltyAmount = 0;
                let penaltySource = '';
                let newRobberWallet = robberBalance.wallet;
                let newRobberBank = robberBalance.bank;

                // Take from wallet first, then bank
                if (robberBalance.wallet > 0) {
                    penaltyAmount = Math.floor(robberBalance.wallet * 0.04);
                    newRobberWallet = robberBalance.wallet - penaltyAmount;
                    penaltySource = 'wallet';
                } else if (robberBalance.bank > 0) {
                    penaltyAmount = Math.floor(robberBalance.bank * 0.04);
                    newRobberBank = robberBalance.bank - penaltyAmount;
                    penaltySource = 'bank';
                } else {
                    // Put them in negative if they have no money
                    penaltyAmount = 1000; // Minimum penalty
                    newRobberWallet = robberBalance.wallet - penaltyAmount;
                    penaltySource = 'wallet (negative)';
                }

                // Update robber balance
                await dbManager.setUserBalance(userId, guildId, newRobberWallet, newRobberBank);

                const embed = new EmbedBuilder()
                    .setTitle('🚨 Robbery Failed!')
                    .setDescription(`You got caught trying to rob ${targetUser.displayName}! The authorities fined you ${fmt(penaltyAmount)}.`)
                    .addFields(
                        { name: '💸 Fine Amount', value: fmt(penaltyAmount), inline: true },
                        { name: '💳 Taken From', value: penaltySource === 'wallet' ? '💵 Wallet' : penaltySource === 'bank' ? '🏦 Bank' : '💵 Wallet (Negative)', inline: true },
                        { name: '📊 Success Rate', value: `${baseSuccessRate}%`, inline: true },
                        { name: '🎖️ Your Tier', value: `${robberTier.emoji} ${robberTier.name}`, inline: true },
                        { name: '🎯 Target Tier', value: `${targetTier.emoji} ${targetTier.name}`, inline: true },
                        { name: '💔 Your New Balance', value: newRobberWallet < 0 ? `-${fmt(Math.abs(newRobberWallet))}` : fmt(newRobberWallet), inline: true }
                    )
                    .setColor(0xFF0000)
                    .setThumbnail(interaction.user.displayAvatarURL())
                    .setFooter({ text: '🦹 Rob Command • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });

                // Log the failed robbery
                await sendLogMessage(
                    interaction.client,
                    'warn',
                    `**Failed Robbery**\n` +
                    `**Robber:** ${interaction.user} (\`${userId}\`) - ${robberTier.emoji} ${robberTier.name}\n` +
                    `**Target:** ${targetUser} (\`${targetId}\`) - ${targetTier.emoji} ${targetTier.name}\n` +
                    `**Fine:** ${fmt(penaltyAmount)} from ${penaltySource}\n` +
                    `**Success Rate:** ${baseSuccessRate}%`,
                    userId,
                    guildId
                );
            }

        } catch (error) {
            logger.error(`Error processing rob command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Robbery Failed')
                .setDescription('Something went wrong during the robbery attempt. The authorities have been alerted!')
                .setColor(0xFF0000)
                .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                .setFooter({ text: '🛠️ Error • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};