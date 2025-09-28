const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('weekly')
        .setDescription('🎁 Premium weekly reward for Diamond and Ruby subscribers only'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        await interaction.deferReply();

        try {
            // Check user subscription status
            const subscription = await this.getUserSubscription(userId);
            
            if (!subscription || !subscription.active) {
                const noSubEmbed = new EmbedBuilder()
                    .setTitle('💎 Premium Subscription Required')
                    .setDescription('The `/weekly` command is exclusive to **Diamond** and **Ruby** subscribers!')
                    .addFields(
                        {
                            name: '💎 Diamond Subscription',
                            value: '• 💰 **1,000,000** weekly coins\n• 💳 $4.99/month\n• 🛍️ 5% bonus on purchases\n• 💎 Diamond exclusive channels',
                            inline: true
                        },
                        {
                            name: '🔴 Ruby Subscription', 
                            value: '• 💰 **1,200,000** weekly coins\n• 💳 $9.99/month\n• 🛍️ 10% bonus on purchases\n• 🔴 Ruby exclusive channels',
                            inline: true
                        },
                        {
                            name: '🛒 Get Premium Access',
                            value: 'Visit our [**Casino Shop**](https://ative-casino-bot-production.up.railway.app/shop) to subscribe and unlock premium rewards!',
                            inline: false
                        }
                    )
                    .setColor(0x00FF00)
                    .setTimestamp()
                    .setFooter({ text: '💎 Upgrade to Premium for exclusive rewards!' });

                await interaction.editReply({ embeds: [noSubEmbed] });
                return;
            }

            // Check weekly cooldown
            const lastClaim = await this.getLastWeeklyClaim(userId, guildId);
            const now = new Date();
            const oneWeek = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
            
            if (lastClaim && (now.getTime() - lastClaim.getTime()) < oneWeek) {
                const timeLeft = oneWeek - (now.getTime() - lastClaim.getTime());
                const daysLeft = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
                const hoursLeft = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

                const cooldownEmbed = new EmbedBuilder()
                    .setTitle('⏰ Weekly Reward Cooldown')
                    .setDescription(`You can claim your next weekly reward in:\n\n⏱️ **${daysLeft}d ${hoursLeft}h ${minutesLeft}m**`)
                    .addFields(
                        {
                            name: '📅 Last Claimed',
                            value: lastClaim.toLocaleDateString('en-US', { 
                                weekday: 'long', 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric' 
                            }),
                            inline: true
                        },
                        {
                            name: '🎁 Your Subscription',
                            value: subscription.subscription_type === 'ruby_subscription' ? '🔴 **Ruby Premium**' : '💎 **Diamond VIP**',
                            inline: true
                        }
                    )
                    .setColor(0x00FF00)
                    .setTimestamp()
                    .setFooter({ text: '💎 Premium Subscriber Rewards' });

                await interaction.editReply({ embeds: [cooldownEmbed] });
                return;
            }

            // Calculate reward based on subscription tier
            const isRuby = subscription.subscription_type === 'ruby_subscription';
            const baseReward = 1000000; // 1M base
            const rubyBonus = 200000; // +200k for Ruby (20% more)
            const finalReward = isRuby ? baseReward + rubyBonus : baseReward;

            // Grant the reward
            const success = await dbManager.updateUserBalance(userId, guildId, finalReward, 0);
            
            if (!success) {
                await interaction.editReply({
                    content: '❌ Failed to process your weekly reward. Please try again later or contact support.'
                });
                return;
            }

            const claimRecorded = await this.recordWeeklyClaim(userId, guildId, finalReward, subscription.subscription_type);
            if (!claimRecorded) {
                logger.error(`Failed to record weekly claim for user ${userId}`);
                await interaction.editReply({
                    content: '❌ Failed to record your weekly claim. Please contact support with this error.'
                });
                return;
            }

            // Get updated balance
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Success embed
            const successEmbed = new EmbedBuilder()
                .setTitle('🎁 Weekly Premium Reward Claimed!')
                .setDescription(`🌟 **${interaction.user.displayName}** claimed their weekly subscriber reward!\n\n${isRuby ? '🔴 **Ruby Premium Benefits Active**' : '💎 **Diamond VIP Benefits Active**'}`)
                .addFields(
                    {
                        name: '💰 Reward Amount',
                        value: fmt(finalReward),
                        inline: true
                    },
                    {
                        name: '🎭 Subscription Tier',
                        value: isRuby ? '🔴 **Ruby Premium** (+20% bonus)' : '💎 **Diamond VIP**',
                        inline: true
                    },
                    {
                        name: '💳 New Balance',
                        value: fmt(balance.wallet),
                        inline: true
                    },
                    {
                        name: '⏰ Next Claim Available',
                        value: `📅 ${new Date(now.getTime() + oneWeek).toLocaleDateString('en-US', { 
                            weekday: 'long', 
                            month: 'long', 
                            day: 'numeric' 
                        })}`,
                        inline: false
                    }
                )
                .setColor(0x00FF00)
                .setTimestamp()
                .setFooter({ text: '✨ Thank you for being a premium subscriber! 💎' });

            await interaction.editReply({ embeds: [successEmbed] });

            // Log the transaction
            await sendLogMessage(
                interaction.client,
                'economy',
                `Premium weekly claim: ${interaction.user.displayName} (${isRuby ? 'Ruby' : 'Diamond'}) claimed ${fmt(finalReward)}`,
                userId,
                guildId
            );

            // Send notification to appropriate premium channel
            try {
                const guild = interaction.guild;
                let targetChannelId;
                
                if (isRuby) {
                    targetChannelId = '1411525744928227429'; // Ruby subs channel
                } else {
                    targetChannelId = '1411518023482867712'; // Diamond subs channel
                }
                
                const premiumChannel = guild.channels.cache.get(targetChannelId);
                
                if (premiumChannel && premiumChannel.permissionsFor(guild.members.me).has('SendMessages')) {
                    await premiumChannel.send(`🎁 **${interaction.user.displayName}** just claimed their weekly ${isRuby ? 'Ruby' : 'Diamond'} reward of ${fmt(finalReward)}! 💎`);
                }
            } catch (channelError) {
                logger.debug(`Could not send to premium channel: ${channelError.message}`);
            }

        } catch (error) {
            logger.error(`Error in weekly command: ${error.message}`);
            await interaction.editReply({
                content: '❌ An error occurred while processing your weekly reward. Please try again later.'
            });
        }
    },

    async getUserSubscription(userId) {
        try {
            const subscription = await dbManager.databaseAdapter.executeQuery(`
                SELECT subscription_type, active, created_at 
                FROM user_subscriptions 
                WHERE user_id = ? AND active = 1
                ORDER BY created_at DESC 
                LIMIT 1
            `, [userId]);

            return subscription.length > 0 ? subscription[0] : null;
        } catch (error) {
            logger.error(`Error getting user subscription: ${error.message}`);
            return null;
        }
    },

    async getLastWeeklyClaim(userId, guildId) {
        try {
            const claims = await dbManager.databaseAdapter.executeQuery(`
                SELECT claimed_at 
                FROM premium_claims 
                WHERE user_id = ? AND guild_id = ? AND claim_type = 'weekly' 
                ORDER BY claimed_at DESC 
                LIMIT 1
            `, [userId, guildId]);

            return claims.length > 0 ? new Date(claims[0].claimed_at) : null;
        } catch (error) {
            logger.error(`Error getting last weekly claim: ${error.message}`);
            return null;
        }
    },

    async recordWeeklyClaim(userId, guildId, amount, subscriptionType) {
        try {
            const result = await dbManager.databaseAdapter.executeQuery(`
                INSERT INTO premium_claims 
                (user_id, guild_id, claim_type, amount, subscription_type, claimed_at)
                VALUES (?, ?, 'weekly', ?, ?, NOW())
            `, [userId, guildId, amount, subscriptionType]);

            if (!result || (result.affectedRows !== undefined && result.affectedRows === 0)) {
                logger.error(`Failed to insert weekly claim record for user ${userId}`);
                return false;
            }

            logger.info(`Weekly claim recorded for user ${userId}: ${amount}`);
            return true;
        } catch (error) {
            logger.error(`Error recording weekly claim: ${error.message}`);
            return false;
        }
    }
};