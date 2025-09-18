const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, getGuildId } = require('../UTILS/common');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('marriage-profile')
        .setDescription('View your marriage profile and shared information')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('View another user\'s marriage profile (optional)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const guildId = await getGuildId(interaction);

        await interaction.deferReply();

        try {
            // Get marriage information
            const marriageData = await dbManager.getUserMarriage(targetUser.id, guildId);

            if (!marriageData.married) {
                const content = targetUser.id === interaction.user.id 
                    ? '💔 You are not currently married! Use `/propose` to start your love story. 🌹💕' 
                    : `💔 **${targetUser.displayName}** is not currently married. 🌸`;
                
                await interaction.editReply({ content });
                return;
            }

            const marriage = marriageData.marriage;
            
            // Calculate marriage duration
            const marriedDate = new Date(marriage.married_at);
            const now = new Date();
            const durationMs = now - marriedDate;
            const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));
            const durationHours = Math.floor((durationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

            // Parse ceremony data
            let ceremonyData = {};
            try {
                ceremonyData = typeof marriage.ceremony_data === 'string' 
                    ? JSON.parse(marriage.ceremony_data) 
                    : marriage.ceremony_data || {};
            } catch (error) {
                logger.warn(`Failed to parse ceremony data for marriage ${marriage.id}: ${error.message}`);
            }

            // Get both partners' balances for household wealth calculation
            const userBalance = await dbManager.getUserBalance(targetUser.id, guildId);
            const partnerBalance = await dbManager.getUserBalance(marriage.partnerId, guildId);

            const householdWealth = (userBalance.wallet + userBalance.bank) + (partnerBalance.wallet + partnerBalance.bank);

            // Create marriage profile embed with mobile-friendly formatting using separators
            const profileEmbed = new EmbedBuilder()
                .setTitle('💒 Marriage Profile')
                .setDescription(`💖 <@${marriage.partner1_id}> & <@${marriage.partner2_id}>\n\n*"Two hearts united as one"*\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━`)
                .addFields(
                    {
                        name: '👰 Married Couple',
                        value: `• <@${marriage.partner1_id}> (${marriage.partner1_role.charAt(0).toUpperCase() + marriage.partner1_role.slice(1)})\n• <@${marriage.partner2_id}> (${marriage.partner2_role.charAt(0).toUpperCase() + marriage.partner2_role.slice(1)})`,
                        inline: false
                    },
                    {
                        name: '\u200b',
                        value: '━━━━━━━━━━━━━━━━━━━━━━━━━━',
                        inline: false
                    },
                    {
                        name: '📅 Wedding Day',
                        value: `<t:${Math.floor(marriedDate.getTime() / 1000)}:F>`,
                        inline: false
                    },
                    {
                        name: '⏰ Time Together',
                        value: `**${durationDays}** days, **${durationHours}** hours`,
                        inline: false
                    },
                    {
                        name: '\u200b',
                        value: '━━━━━━━━━━━━━━━━━━━━━━━━━━',
                        inline: false
                    },
                    {
                        name: '💰 Financial Information',
                        value: `**Shared Bank:** ${fmt(marriage.shared_bank)}\n**Household Wealth:** ${fmt(householdWealth)}`,
                        inline: false
                    },
                    {
                        name: '\u200b',
                        value: '━━━━━━━━━━━━━━━━━━━━━━━━━━',
                        inline: false
                    },
                    {
                        name: '💎 Marriage Benefits',
                        value: '• 2% transfer tax (instead of 5%)\n• Shared bank account\n• Joint financial standing\n• Married Couples role',
                        inline: false
                    }
                )
                .setColor(0xFF69B4)
                .setTimestamp()
                .setFooter({ text: '💒 ATIVE Casino Marriage Registry' });

            // Add wedding party information if available
            if (ceremonyData.officiant || ceremonyData.maidOfHonor || ceremonyData.bestPerson || ceremonyData.flowerGirl || ceremonyData.ringBearer) {
                let weddingParty = '';
                
                if (ceremonyData.officiant) {
                    weddingParty += `• **Officiant:** ${ceremonyData.officiant.name}\n`;
                }
                if (ceremonyData.maidOfHonor) {
                    weddingParty += `• **Maid of Honor:** ${ceremonyData.maidOfHonor.name}\n`;
                }
                if (ceremonyData.bestPerson) {
                    weddingParty += `• **Best Person:** ${ceremonyData.bestPerson.name}\n`;
                }
                if (ceremonyData.flowerGirl) {
                    weddingParty += `• **Flower Girl:** ${ceremonyData.flowerGirl.name}\n`;
                }
                if (ceremonyData.ringBearer) {
                    weddingParty += `• **Ring Bearer:** ${ceremonyData.ringBearer.name}\n`;
                }

                profileEmbed.addFields({
                    name: '🎉 Wedding Party',
                    value: weddingParty.trim(),
                    inline: false
                });
            }

            // Add ceremony location if available
            if (ceremonyData.location) {
                profileEmbed.addFields({
                    name: '📍 Wedding Venue',
                    value: ceremonyData.location,
                    inline: true
                });
            }

            // Calculate monthly and yearly anniversaries
            const monthsMarried = Math.floor(durationMs / (1000 * 60 * 60 * 24 * 30.44)); // Average days per month
            
            // Next yearly anniversary
            const nextYearlyAnniversary = new Date(marriedDate);
            nextYearlyAnniversary.setFullYear(now.getFullYear());
            if (nextYearlyAnniversary < now) {
                nextYearlyAnniversary.setFullYear(now.getFullYear() + 1);
            }
            const daysToYearlyAnniversary = Math.ceil((nextYearlyAnniversary - now) / (1000 * 60 * 60 * 24));
            
            // Next monthly anniversary
            const nextMonthlyAnniversary = new Date(marriedDate);
            nextMonthlyAnniversary.setMonth(now.getMonth());
            nextMonthlyAnniversary.setFullYear(now.getFullYear());
            if (nextMonthlyAnniversary < now) {
                nextMonthlyAnniversary.setMonth(nextMonthlyAnniversary.getMonth() + 1);
            }
            const daysToMonthlyAnniversary = Math.ceil((nextMonthlyAnniversary - now) / (1000 * 60 * 60 * 24));
            
            profileEmbed.addFields(
                {
                    name: '\u200b',
                    value: '━━━━━━━━━━━━━━━━━━━━━━━━━━',
                    inline: false
                },
                {
                    name: '🎂 Anniversaries',
                    value: `**Monthly:** ${daysToMonthlyAnniversary} days away\n**Yearly:** ${daysToYearlyAnniversary} days away`,
                    inline: false
                },
                {
                    name: '💌 Anniversary Reminders',
                    value: 'Monthly anniversary DMs are sent automatically! 💕',
                    inline: false
                }
            );

            // Set thumbnail to the requesting user's avatar
            profileEmbed.setThumbnail(targetUser.displayAvatarURL());

            await interaction.editReply({ embeds: [profileEmbed] });

        } catch (error) {
            logger.error(`Error in marriage-profile command: ${error.message}`);
            
            await interaction.editReply({
                content: '❌ An error occurred while retrieving the marriage profile. Please try again later.'
            });
        }
    }
};