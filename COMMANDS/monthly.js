const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId, sendLogMessage } = require('../UTILS/common');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('monthly')
        .setDescription('💎 Premium monthly reward for Diamond and Ruby subscribers only'),

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
                    .setDescription('The `/monthly` command is exclusive to **Diamond** and **Ruby** subscribers!')
                    .addFields(
                        {
                            name: '💎 Diamond Subscription',
                            value: '• 💰 **10,000,000** monthly coins\n• 💳 $4.99/month\n• 🛍️ 5% bonus on purchases\n• 💎 Diamond exclusive channels',
                            inline: true
                        },
                        {
                            name: '🔴 Ruby Subscription', 
                            value: '• 💰 **12,000,000** monthly coins\n• 💳 $9.99/month\n• 🛍️ 10% bonus on purchases\n• 🔴 Ruby exclusive channels',
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

            // Check monthly cooldown
            const lastClaim = await this.getLastMonthlyClaim(userId, guildId);
            const now = new Date();
            const oneMonth = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
            
            if (lastClaim && (now.getTime() - lastClaim.getTime()) < oneMonth) {
                const timeLeft = oneMonth - (now.getTime() - lastClaim.getTime());
                const daysLeft = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
                const hoursLeft = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

                const cooldownEmbed = new EmbedBuilder()
                    .setTitle('⏰ Monthly Reward Cooldown')
                    .setDescription(`You can claim your next monthly reward in:\n\n⏱️ **${daysLeft} days, ${hoursLeft} hours**`)
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
            const baseReward = 10000000; // 10M base
            const rubyBonus = 2000000; // +2M for Ruby (20% more)
            const finalReward = isRuby ? baseReward + rubyBonus : baseReward;

            // Grant the reward
            const success = await dbManager.updateUserBalance(userId, guildId, finalReward, 0);
            
            if (!success) {
                await interaction.editReply({
                    content: '❌ Failed to process your monthly reward. Please try again later or contact support.'
                });
                return;
            }

            const claimRecorded = await this.recordMonthlyClaim(userId, guildId, finalReward, subscription.subscription_type);
            if (!claimRecorded) {
                logger.error(`Failed to record monthly claim for user ${userId}`);
                await interaction.editReply({
                    content: '❌ Failed to record your monthly claim. Please contact support with this error.'
                });
                return;
            }

            // Get updated balance
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Success embed with celebration
            const successEmbed = new EmbedBuilder()
                .setTitle('🎉 Monthly Premium Reward Claimed!')
                .setDescription(`🎆 **${interaction.user.displayName}** claimed their massive monthly subscriber reward!\n\n${isRuby ? '🔴 **Ruby Premium Benefits Active**' : '💎 **Diamond VIP Benefits Active**'}`)
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
                        value: `📅 ${new Date(now.getTime() + oneMonth).toLocaleDateString('en-US', { 
                            year: 'numeric',
                            month: 'long', 
                            day: 'numeric' 
                        })}`,
                        inline: false
                    },
                    {
                        name: '🎁 Premium Perks Reminder',
                        value: isRuby ? 
                            '• 🛍️ 10% bonus on all purchases\n• 📧 Priority support\n• 🔴 Exclusive Ruby channels\n• 💰 Premium weekly/monthly rewards' :
                            '• 🛍️ 5% bonus on all purchases\n• 💎 VIP channels access\n• 👑 Diamond role privileges\n• 💰 Premium weekly/monthly rewards',
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
                `Premium monthly claim: ${interaction.user.displayName} (${isRuby ? 'Ruby' : 'Diamond'}) claimed ${fmt(finalReward)}`,
                userId,
                guildId
            );

            // Send celebration message to appropriate premium channel
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
                    await premiumChannel.send(`🎉 **${interaction.user.displayName}** just claimed their massive monthly ${isRuby ? 'Ruby' : 'Diamond'} reward of ${fmt(finalReward)}! 💎💰`);
                }
            } catch (channelError) {
                logger.debug(`Could not send to premium channel: ${channelError.message}`);
            }

        } catch (error) {
            logger.error(`Error in monthly command: ${error.message}`);
            await interaction.editReply({
                content: '❌ An error occurred while processing your monthly reward. Please try again later.'
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

    async getLastMonthlyClaim(userId, guildId) {
        try {
            const claims = await dbManager.databaseAdapter.executeQuery(`
                SELECT claimed_at 
                FROM premium_claims 
                WHERE user_id = ? AND guild_id = ? AND claim_type = 'monthly' 
                ORDER BY claimed_at DESC 
                LIMIT 1
            `, [userId, guildId]);

            return claims.length > 0 ? new Date(claims[0].claimed_at) : null;
        } catch (error) {
            logger.error(`Error getting last monthly claim: ${error.message}`);
            return null;
        }
    },

    async recordMonthlyClaim(userId, guildId, amount, subscriptionType) {
        try {
            const result = await dbManager.databaseAdapter.executeQuery(`
                INSERT INTO premium_claims 
                (user_id, guild_id, claim_type, amount, subscription_type, claimed_at)
                VALUES (?, ?, 'monthly', ?, ?, NOW())
            `, [userId, guildId, amount, subscriptionType]);

            if (!result || (result.affectedRows !== undefined && result.affectedRows === 0)) {
                logger.error(`Failed to insert monthly claim record for user ${userId}`);
                return false;
            }

            logger.info(`Monthly claim recorded for user ${userId}: ${amount}`);
            return true;
        } catch (error) {
            logger.error(`Error recording monthly claim: ${error.message}`);
            return false;
        }
    }
};