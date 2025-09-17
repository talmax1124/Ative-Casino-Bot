const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/databaseAdapter');
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
                    ? '❌ You are not currently married! Use `/propose` to start your love story.' 
                    : `❌ **${targetUser.displayName}** is not currently married.`;
                
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

            // Create marriage profile embed
            const profileEmbed = new EmbedBuilder()
                .setTitle('💕 Marriage Profile')
                .setDescription(`**${marriage.partner1_name}** & **${marriage.partner2_name}**`)
                .addFields(
                    {
                        name: '👫 Married Couple',
                        value: `**${marriage.partner1_name}** (${marriage.partner1_role.charAt(0).toUpperCase() + marriage.partner1_role.slice(1)})\n**${marriage.partner2_name}** (${marriage.partner2_role.charAt(0).toUpperCase() + marriage.partner2_role.slice(1)})`,
                        inline: true
                    },
                    {
                        name: '📅 Marriage Date',
                        value: `<t:${Math.floor(marriedDate.getTime() / 1000)}:F>`,
                        inline: true
                    },
                    {
                        name: '⏰ Time Together',
                        value: `${durationDays} days, ${durationHours} hours`,
                        inline: true
                    },
                    {
                        name: '💰 Shared Bank',
                        value: fmt(marriage.shared_bank),
                        inline: true
                    },
                    {
                        name: '🏠 Household Wealth',
                        value: fmt(householdWealth),
                        inline: true
                    },
                    {
                        name: '💎 Marriage Benefits',
                        value: '• 2% transfer tax (instead of 5%)\n• Shared bank account\n• Joint financial standing',
                        inline: true
                    }
                )
                .setColor(0xFF69B4)
                .setTimestamp()
                .setFooter({ text: '💒 ATIVE Casino Marriage Registry' });

            // Add wedding party information if available
            if (ceremonyData.officiant || ceremonyData.maidOfHonor || ceremonyData.bestPerson || ceremonyData.flowerGirl || ceremonyData.ringBearer) {
                let weddingParty = '';
                
                if (ceremonyData.officiant) {
                    weddingParty += `**Officiant:** ${ceremonyData.officiant.name}\n`;
                }
                if (ceremonyData.maidOfHonor) {
                    weddingParty += `**Maid of Honor:** ${ceremonyData.maidOfHonor.name}\n`;
                }
                if (ceremonyData.bestPerson) {
                    weddingParty += `**Best Person:** ${ceremonyData.bestPerson.name}\n`;
                }
                if (ceremonyData.flowerGirl) {
                    weddingParty += `**Flower Girl:** ${ceremonyData.flowerGirl.name}\n`;
                }
                if (ceremonyData.ringBearer) {
                    weddingParty += `**Ring Bearer:** ${ceremonyData.ringBearer.name}\n`;
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
                    name: '📍 Wedding Location',
                    value: ceremonyData.location,
                    inline: true
                });
            }

            // Add anniversary countdown
            const nextAnniversary = new Date(marriedDate);
            nextAnniversary.setFullYear(now.getFullYear());
            if (nextAnniversary < now) {
                nextAnniversary.setFullYear(now.getFullYear() + 1);
            }
            
            const daysToAnniversary = Math.ceil((nextAnniversary - now) / (1000 * 60 * 60 * 24));
            
            profileEmbed.addFields({
                name: '🎂 Next Anniversary',
                value: `${daysToAnniversary} days away`,
                inline: true
            });

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