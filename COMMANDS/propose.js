const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../UTILS/database');
const { getGuildId, sendLogMessage } = require('../UTILS/common');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('propose')
        .setDescription('Propose marriage to another user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to propose to')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Your proposal message (optional)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const proposer = interaction.user;
        const recipient = interaction.options.getUser('user');
        const proposalMessage = interaction.options.getString('message') || 'Will you marry me? 💍';
        const guildId = await getGuildId(interaction);

        // Check if proposing to self
        if (proposer.id === recipient.id) {
            await interaction.reply({
                content: '❌ You cannot propose to yourself!',
                ephemeral: true
            });
            return;
        }

        // Check if proposing to a bot
        if (recipient.bot) {
            await interaction.reply({
                content: '❌ You cannot propose to bots!',
                ephemeral: true
            });
            return;
        }

        await interaction.deferReply();

        try {
            // Ensure both users exist in database
            await dbManager.ensureUser(proposer.id, proposer.displayName);
            await dbManager.ensureUser(recipient.id, recipient.displayName);

            // Check if proposer is already married
            const proposerMarriage = await dbManager.getUserMarriage(proposer.id, guildId);
            if (proposerMarriage.married) {
                await interaction.editReply({
                    content: `❌ You are already married to **${proposerMarriage.marriage.partnerName}**! You must divorce first before proposing to someone else.`
                });
                return;
            }

            // Check if recipient is already married
            const recipientMarriage = await dbManager.getUserMarriage(recipient.id, guildId);
            if (recipientMarriage.married) {
                await interaction.editReply({
                    content: `❌ **${recipient.displayName}** is already married to **${recipientMarriage.marriage.partnerName}**!`
                });
                return;
            }

            // Check if there's already a pending proposal between these users
            const existingProposals = await dbManager.getPendingMarriageProposals(recipient.id, guildId);
            const existingFromProposer = existingProposals.proposals.find(p => p.proposer_id === proposer.id);
            
            if (existingFromProposer) {
                await interaction.editReply({
                    content: `❌ You already have a pending proposal to **${recipient.displayName}**! Please wait for them to respond.`
                });
                return;
            }

            // Create the marriage proposal
            const proposalResult = await dbManager.createMarriageProposal(
                proposer.id,
                proposer.displayName,
                recipient.id,
                recipient.displayName,
                guildId,
                proposalMessage
            );

            if (!proposalResult.success) {
                await interaction.editReply({
                    content: `❌ Failed to create proposal: ${proposalResult.error}`
                });
                return;
            }

            // Create proposal embed
            const proposalEmbed = new EmbedBuilder()
                .setTitle('💍 Marriage Proposal!')
                .setDescription(`**${proposer.displayName}** has proposed to **${recipient.displayName}**!`)
                .addFields(
                    {
                        name: '💌 Proposal Message',
                        value: proposalMessage,
                        inline: false
                    },
                    {
                        name: '⏰ Response Time',
                        value: `You have **3 minutes** to respond\nExpires: <t:${Math.floor((Date.now() + 180000) / 1000)}:R>`,
                        inline: true
                    },
                    {
                        name: '📋 Instructions',
                        value: `**${recipient.displayName}**, please respond with **"yes"** to accept or **"no"** to reject this proposal in this channel within 3 minutes.`,
                        inline: false
                    }
                )
                .setColor(0xFF69B4)
                .setThumbnail(proposer.displayAvatarURL())
                .setTimestamp();

            // Create response buttons
            const acceptButton = new ButtonBuilder()
                .setCustomId(`proposal_accept:${proposalResult.proposalId}`)
                .setLabel('Accept 💍')
                .setStyle(ButtonStyle.Success);

            const rejectButton = new ButtonBuilder()
                .setCustomId(`proposal_reject:${proposalResult.proposalId}`)
                .setLabel('Decline')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(acceptButton, rejectButton);

            const sentMessage = await interaction.editReply({
                content: `${recipient}, do you accept this marriage proposal? 💕`,
                embeds: [proposalEmbed],
                components: [row]
            });

            // Create button collector for 3 minutes
            const collector = sentMessage.createMessageComponentCollector({ 
                filter: (i) => i.user.id === recipient.id && i.customId.startsWith('proposal_'),
                time: 180000, // 3 minutes
                max: 1 
            });

            collector.on('collect', async (buttonInteraction) => {
                const response = buttonInteraction.customId.includes('accept') ? 'yes' : 'no';
                
                // Update the proposal status in database
                const dbResponse = await dbManager.respondToMarriageProposal(
                    proposalResult.proposalId, 
                    response === 'yes' ? 'accepted' : 'rejected'
                );

                if (!dbResponse.success) {
                    await interaction.followUp({
                        content: `❌ Failed to process response: ${dbResponse.error}`,
                        ephemeral: true
                    });
                    return;
                }

                if (response === 'yes') {
                    // Proposal accepted
                    const acceptEmbed = new EmbedBuilder()
                        .setTitle('💍 Proposal Accepted!')
                        .setDescription(`**${recipient.displayName}** accepted **${proposer.displayName}**'s marriage proposal! 🎉`)
                        .addFields({
                            name: '💒 Next Steps',
                            value: 'You can now use `/start-marriage` to begin your wedding ceremony!',
                            inline: false
                        })
                        .setColor(0x00FF00)
                        .setTimestamp();


                    // Notify the proposer via DM
                    try {
                        await proposer.send(`🎉 **${recipient.displayName}** accepted your marriage proposal! Use \`/start-marriage\` to begin your wedding ceremony!`);
                    } catch (dmError) {
                        logger.info(`Could not DM acceptance notification: ${dmError.message}`);
                    }

                } else {
                    // Proposal rejected
                    const rejectEmbed = new EmbedBuilder()
                        .setTitle('💔 Proposal Rejected')
                        .setDescription(`**${recipient.displayName}** rejected **${proposer.displayName}**'s marriage proposal.`)
                        .setColor(0xFF0000)
                        .setTimestamp();


                    // Notify the proposer via DM
                    try {
                        await proposer.send(`💔 **${recipient.displayName}** rejected your marriage proposal.`);
                    } catch (dmError) {
                        logger.info(`Could not DM rejection notification: ${dmError.message}`);
                    }
                }

                // Update the button interaction
                if (response === 'yes') {
                    await buttonInteraction.update({
                        content: `💍 ${recipient.displayName} accepted the proposal!`,
                        embeds: [acceptEmbed],
                        components: []
                    });
                } else {
                    await buttonInteraction.update({
                        content: `💔 ${recipient.displayName} declined the proposal.`,
                        embeds: [rejectEmbed],
                        components: []
                    });
                }
            });

            collector.on('end', async (collected) => {
                if (collected.size === 0) {
                    // No response within 1 minute - expire the proposal
                    await dbManager.respondToMarriageProposal(proposalResult.proposalId, 'expired');
                    
                    const expiredEmbed = new EmbedBuilder()
                        .setTitle('⏰ Proposal Expired')
                        .setDescription(`**${recipient.displayName}** did not respond to **${proposer.displayName}**'s proposal within 3 minutes.`)
                        .setColor(0x808080)
                        .setTimestamp();

                    await interaction.editReply({
                        content: '⏰ Proposal expired - no response received.',
                        embeds: [expiredEmbed],
                        components: []
                    });

                    // Notify the proposer
                    try {
                        await proposer.send(`⏰ Your marriage proposal to **${recipient.displayName}** expired because they didn't respond within 3 minutes.`);
                    } catch (dmError) {
                        logger.info(`Could not DM expiration notification: ${dmError.message}`);
                    }
                }
            });

            // Try to send DM to recipient
            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle('💍 You have a marriage proposal!')
                    .setDescription(`**${proposer.displayName}** has proposed to you!`)
                    .addFields(
                        {
                            name: '💌 Message',
                            value: proposalMessage,
                            inline: false
                        },
                        {
                            name: '📍 Server',
                            value: interaction.guild?.name || 'Unknown Server',
                            inline: true
                        }
                    )
                    .setColor(0xFF69B4)
                    .setThumbnail(proposer.displayAvatarURL());

                await recipient.send({ 
                    content: 'You can respond to this proposal in the server where it was made.',
                    embeds: [dmEmbed] 
                });
            } catch (dmError) {
                logger.info(`Could not DM proposal notification to ${recipient.id}: ${dmError.message}`);
            }

            // Log the proposal
            await sendLogMessage(
                interaction.client,
                'info',
                `Marriage proposal: ${proposer.displayName} proposed to ${recipient.displayName}`,
                proposer.id,
                guildId
            );

        } catch (error) {
            logger.error(`Error in propose command: ${error.message}`);
            
            await interaction.editReply({
                content: '❌ An error occurred while creating your proposal. Please try again later.'
            });
        }
    }
};