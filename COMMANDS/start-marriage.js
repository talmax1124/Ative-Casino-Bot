const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { getGuildId, sendLogMessage } = require('../UTILS/common');
const logger = require('../UTILS/logger');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('start-marriage')
        .setDescription('Start your wedding ceremony after proposal acceptance')
        .addStringOption(option =>
            option.setName('role')
                .setDescription('Your role in the marriage')
                .addChoices(
                    { name: 'Husband', value: 'husband' },
                    { name: 'Wife', value: 'wife' }
                )
                .setRequired(true)
        )
        .addUserOption(option =>
            option.setName('maid_of_honor')
                .setDescription('Choose maid of honor (optional)')
                .setRequired(false)
        )
        .addUserOption(option =>
            option.setName('best_person')
                .setDescription('Choose best man/woman (optional)')
                .setRequired(false)
        )
        .addUserOption(option =>
            option.setName('flower_girl')
                .setDescription('Choose flower girl (optional)')
                .setRequired(false)
        )
        .addUserOption(option =>
            option.setName('ring_bearer')
                .setDescription('Choose ring bearer (optional)')
                .setRequired(false)
        )
        .addUserOption(option =>
            option.setName('officiant')
                .setDescription('Choose officiant (optional)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const userRole = interaction.options.getString('role');
        const maidOfHonor = interaction.options.getUser('maid_of_honor');
        const bestPerson = interaction.options.getUser('best_person');
        const flowerGirl = interaction.options.getUser('flower_girl');
        const ringBearer = interaction.options.getUser('ring_bearer');
        const officiant = interaction.options.getUser('officiant');
        const guildId = await getGuildId(interaction);

        // Check if restricted user is selected as flower girl
        if (flowerGirl && flowerGirl.id === '1009220009739960411') {
            await interaction.reply({
                content: '❌ This person does not give consent. Please choose someone else.',
                ephemeral: true
            });
            return;
        }

        await interaction.deferReply();

        try {
            // Check if user is already married
            const existingMarriage = await dbManager.getUserMarriage(userId, guildId);
            if (existingMarriage.married) {
                await interaction.editReply({
                    content: `❌ You are already married to **${existingMarriage.marriage.partnerName}**!`
                });
                return;
            }

            // Find an accepted proposal where this user is involved
            const receivedProposals = await dbManager.getPendingMarriageProposals(userId, guildId);
            const acceptedProposal = receivedProposals.proposals.find(p => p.status === 'accepted');
            
            // Also check if they made a proposal that was accepted
            let sentAcceptedProposal = null;
            try {
                const sentProposals = await dbManager.getSentMarriageProposals(userId, guildId, 'accepted');
                if (sentProposals.success && sentProposals.proposals.length > 0) {
                    sentAcceptedProposal = sentProposals.proposals[0];
                }
            } catch (error) {
                logger.error(`Error checking sent proposals: ${error.message}`);
            }

            const validProposal = acceptedProposal || sentAcceptedProposal;
            
            if (!validProposal) {
                await interaction.editReply({
                    content: '❌ You need an accepted marriage proposal before starting a ceremony! Use `/propose` first.'
                });
                return;
            }

            // Determine partner details
            const isProposer = validProposal.proposer_id === userId;
            const partnerId = isProposer ? validProposal.recipient_id : validProposal.proposer_id;
            const partnerName = isProposer ? validProposal.recipient_name : validProposal.proposer_name;
            const partnerRole = userRole === 'husband' ? 'wife' : 'husband';

            // Check if partner is already married to someone else
            const partnerMarriage = await dbManager.getUserMarriage(partnerId, guildId);
            if (partnerMarriage.married) {
                await interaction.editReply({
                    content: `❌ **${partnerName}** is already married to someone else!`
                });
                return;
            }

            // Prepare ceremony data
            const ceremonyData = {
                maidOfHonor: maidOfHonor ? { id: maidOfHonor.id, name: maidOfHonor.displayName } : null,
                bestPerson: bestPerson ? { id: bestPerson.id, name: bestPerson.displayName } : null,
                flowerGirl: flowerGirl ? { id: flowerGirl.id, name: flowerGirl.displayName } : null,
                ringBearer: ringBearer ? { id: ringBearer.id, name: ringBearer.displayName } : null,
                officiant: officiant ? { id: officiant.id, name: officiant.displayName } : { id: 'bot', name: 'ATIVE Casino Chaplain' },
                ceremonyDate: new Date().toISOString(),
                location: interaction.guild?.name || 'ATIVE Casino'
            };

            // Start the wedding ceremony
            await this.conductCeremony(interaction, userId, interaction.user.displayName, userRole, partnerId, partnerName, partnerRole, guildId, ceremonyData);

        } catch (error) {
            logger.error(`Error in start-marriage command: ${error.message}`);
            
            await interaction.editReply({
                content: '❌ An error occurred while starting your wedding ceremony. Please try again later.'
            });
        }
    },

    async conductCeremony(interaction, partner1Id, partner1Name, partner1Role, partner2Id, partner2Name, partner2Role, guildId, ceremonyData) {
        const officiantName = ceremonyData.officiant.name;
        
        // Step 1: Officiant Introduction
        const officiantEmbed = new EmbedBuilder()
            .setTitle('💒 Wedding Ceremony Beginning')
            .setDescription(`**${officiantName}** steps forward to officiate the ceremony...`)
            .addFields(
                {
                    name: '🎙️ Officiant Speaks:',
                    value: `"Dearly beloved, we are gathered here today in the sight of this community to witness the union of **${partner1Name}** and **${partner2Name}** in holy matrimony.\n\nMarriage is a sacred bond between two people who choose to walk life's journey together, sharing in each other's joys and supporting one another through challenges."\n\n*The congregation settles as the ceremony begins...*`,
                    inline: false
                }
            )
            .setColor(0x9B59B6)
            .setTimestamp();

        // Add officiant image if available
        const officiantImagePath = path.join(__dirname, '..', 'assets', 'wedding', 'officiant.jpg');
        let officiantAttachment = null;
        if (fs.existsSync(officiantImagePath)) {
            officiantAttachment = new AttachmentBuilder(officiantImagePath, { name: 'officiant.jpg' });
            officiantEmbed.setImage('attachment://officiant.jpg');
        }

        await interaction.editReply({ 
            embeds: [officiantEmbed], 
            files: officiantAttachment ? [officiantAttachment] : []
        });
        
        // Wait 4 seconds
        await new Promise(resolve => setTimeout(resolve, 4000));

        // Step 2: Wedding Party Entrance
        if (ceremonyData.flowerGirl) {
            const flowerGirlEmbed = new EmbedBuilder()
                .setTitle('🌸 Here Comes the Flower Girl!')
                .setDescription(`**${ceremonyData.flowerGirl.name}** gracefully walks down the aisle, scattering beautiful rose petals...`)
                .setColor(0xFFB6C1)
                .setTimestamp();

            const flowerGirlImagePath = path.join(__dirname, '..', 'assets', 'wedding', 'flowergirl.jpg');
            let flowerGirlAttachment = null;
            if (fs.existsSync(flowerGirlImagePath)) {
                flowerGirlAttachment = new AttachmentBuilder(flowerGirlImagePath, { name: 'flowergirl.jpg' });
                flowerGirlEmbed.setImage('attachment://flowergirl.jpg');
            }

            await interaction.followUp({ 
                embeds: [flowerGirlEmbed], 
                files: flowerGirlAttachment ? [flowerGirlAttachment] : []
            });
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        if (ceremonyData.ringBearer) {
            const ringBearerEmbed = new EmbedBuilder()
                .setTitle('💍 Here Comes the Ring Bearer!')
                .setDescription(`**${ceremonyData.ringBearer.name}** carefully carries the rings down the aisle with pride...`)
                .setColor(0xDAA520)
                .setTimestamp();

            const ringBearerImagePath = path.join(__dirname, '..', 'assets', 'wedding', 'ring-bearer.png');
            let ringBearerAttachment = null;
            if (fs.existsSync(ringBearerImagePath)) {
                ringBearerAttachment = new AttachmentBuilder(ringBearerImagePath, { name: 'ring-bearer.png' });
                ringBearerEmbed.setImage('attachment://ring-bearer.png');
            }

            await interaction.followUp({ 
                embeds: [ringBearerEmbed], 
                files: ringBearerAttachment ? [ringBearerAttachment] : []
            });
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Step 3: Bride/Groom Entrance
        const brideGroom = partner1Role === 'wife' ? { name: partner1Name, role: 'bride' } : { name: partner2Name, role: 'bride' };
        const groomBride = partner1Role === 'husband' ? { name: partner1Name, role: 'groom' } : { name: partner2Name, role: 'groom' };

        const groomEmbed = new EmbedBuilder()
            .setTitle('🤵 The Groom Takes His Place')
            .setDescription(`**${groomBride.name}** stands proudly at the altar, awaiting his beloved...`)
            .setColor(0x2C3E50)
            .setTimestamp();

        const groomImagePath = path.join(__dirname, '..', 'assets', 'wedding', 'husband-waiting.jpg');
        let groomAttachment = null;
        if (fs.existsSync(groomImagePath)) {
            groomAttachment = new AttachmentBuilder(groomImagePath, { name: 'husband-waiting.jpg' });
            groomEmbed.setImage('attachment://husband-waiting.jpg');
        }

        await interaction.followUp({ 
            embeds: [groomEmbed], 
            files: groomAttachment ? [groomAttachment] : []
        });
        await new Promise(resolve => setTimeout(resolve, 3000));

        const brideEmbed = new EmbedBuilder()
            .setTitle('👰 Here Comes the Bride!')
            .setDescription(`**${brideGroom.name}** gracefully walks down the aisle in a beautiful gown, radiant with joy...`)
            .addFields(
                {
                    name: '💐 Wedding Party',
                    value: `${ceremonyData.maidOfHonor ? `**Maid of Honor:** ${ceremonyData.maidOfHonor.name}\n` : ''}${ceremonyData.bestPerson ? `**Best ${partner1Role === 'husband' ? 'Man' : 'Woman'}:** ${ceremonyData.bestPerson.name}` : ''}`,
                    inline: true
                }
            )
            .setColor(0xFFFFFF)
            .setTimestamp();

        const brideImagePath = path.join(__dirname, '..', 'assets', 'wedding', 'wife.jpg');
        let brideAttachment = null;
        if (fs.existsSync(brideImagePath)) {
            brideAttachment = new AttachmentBuilder(brideImagePath, { name: 'wife.jpg' });
            brideEmbed.setImage('attachment://wife.jpg');
        }

        await interaction.followUp({ 
            embeds: [brideEmbed], 
            files: brideAttachment ? [brideAttachment] : []
        });
        await new Promise(resolve => setTimeout(resolve, 4000));

        // Step 4: Interactive Vows and Ring Exchange
        // First vow - Partner 1
        const vow1Embed = new EmbedBuilder()
            .setTitle('💕 Exchange of Vows')
            .setDescription(`**${officiantName}:** "Do you, **${partner1Name}**, take **${partner2Name}** to be your lawfully wedded ${partner2Role}, to have and to hold, in sickness and in health, for richer or poorer, for better or worse, until death do you part?"\n\n**${partner1Name}**, please type "I do" to continue the ceremony...`)
            .setColor(0xE74C3C)
            .setFooter({ text: 'Waiting for vows...' })
            .setTimestamp();

        const vow1Message = await interaction.followUp({ embeds: [vow1Embed] });

        // Wait for Partner 1 to say "I do"
        try {
            const filter1 = (m) => {
                return m.author.id === partner1Id && m.content.toLowerCase().trim() === 'i do';
            };

            const collector1 = interaction.channel.createMessageCollector({
                filter: filter1,
                time: 120000, // 2 minutes
                max: 1
            });

            await new Promise((resolve, reject) => {
                collector1.on('collect', async (collected) => {
                    // Update the vow1 message to show the response
                    const updatedVow1Embed = new EmbedBuilder()
                        .setTitle('💕 Exchange of Vows')
                        .setDescription(`**${officiantName}:** "Do you, **${partner1Name}**, take **${partner2Name}** to be your lawfully wedded ${partner2Role}, to have and to hold, in sickness and in health, for richer or poorer, for better or worse, until death do you part?"\n\n**${partner1Name}:** "I do! 💍"`)
                        .setColor(0xE74C3C)
                        .setTimestamp();
                    
                    await vow1Message.edit({ embeds: [updatedVow1Embed] });
                    resolve();
                });

                collector1.on('end', (collected) => {
                    if (collected.size === 0) {
                        reject(new Error(`${partner1Name} did not respond with "I do" in time`));
                    }
                });
            });

        } catch (vow1Error) {
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('💔 Ceremony Cancelled')
                .setDescription(`The ceremony has been cancelled because **${partner1Name}** did not respond with "I do" in time.`)
                .setColor(0xFF0000);
            await interaction.followUp({ embeds: [timeoutEmbed] });
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Second vow - Partner 2
        const vow2Embed = new EmbedBuilder()
            .setTitle('💕 Exchange of Vows')
            .setDescription(`**${officiantName}:** "And do you, **${partner2Name}**, take **${partner1Name}** to be your lawfully wedded ${partner1Role}, to have and to hold, in sickness and in health, for richer or poorer, for better or worse, until death do you part?"\n\n**${partner2Name}**, please type "I do" to continue the ceremony...`)
            .setColor(0xE74C3C)
            .setFooter({ text: 'Waiting for vows...' })
            .setTimestamp();

        const vow2Message = await interaction.followUp({ embeds: [vow2Embed] });

        // Wait for Partner 2 to say "I do"
        try {
            const filter2 = (m) => {
                return m.author.id === partner2Id && m.content.toLowerCase().trim() === 'i do';
            };

            const collector2 = interaction.channel.createMessageCollector({
                filter: filter2,
                time: 120000, // 2 minutes
                max: 1
            });

            await new Promise((resolve, reject) => {
                collector2.on('collect', async (collected) => {
                    // Update the vow2 message to show the response
                    const updatedVow2Embed = new EmbedBuilder()
                        .setTitle('💕 Exchange of Vows')
                        .setDescription(`**${officiantName}:** "And do you, **${partner2Name}**, take **${partner1Name}** to be your lawfully wedded ${partner1Role}, to have and to hold, in sickness and in health, for richer or poorer, for better or worse, until death do you part?"\n\n**${partner2Name}:** "I do! 💍"`)
                        .setColor(0xE74C3C)
                        .setTimestamp();
                    
                    await vow2Message.edit({ embeds: [updatedVow2Embed] });
                    resolve();
                });

                collector2.on('end', (collected) => {
                    if (collected.size === 0) {
                        reject(new Error(`${partner2Name} did not respond with "I do" in time`));
                    }
                });
            });

        } catch (vow2Error) {
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('💔 Ceremony Cancelled')
                .setDescription(`The ceremony has been cancelled because **${partner2Name}** did not respond with "I do" in time.`)
                .setColor(0xFF0000);
            await interaction.followUp({ embeds: [timeoutEmbed] });
            return;
        }

        // Both partners have said "I do" - Show completion message
        const vowsCompleteEmbed = new EmbedBuilder()
            .setTitle('💖 Vows Complete!')
            .setDescription(`**${officiantName}:** "Wonderful! Both of you have pledged your love and commitment to each other. The rings have been exchanged, and your hearts are now united as one!"`)
            .setColor(0xFFD700)
            .setTimestamp();

        await interaction.followUp({ embeds: [vowsCompleteEmbed] });
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Step 5: Pronouncement
        const pronouncementEmbed = new EmbedBuilder()
            .setTitle('🎉 Pronouncement')
            .setDescription(`**${officiantName}:** "By the power vested in me by ATIVE Casino, I now pronounce you husband and wife!\n\n**You may now kiss the bride!** 💋"`)
            .setColor(0x27AE60)
            .setTimestamp();

        await interaction.followUp({ embeds: [pronouncementEmbed] });
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Step 6: The Kiss
        const kissEmbed = new EmbedBuilder()
            .setTitle('💋 The First Kiss as a Married Couple')
            .setDescription(`**${partner1Name}** and **${partner2Name}** share their first kiss as a married couple! 🎉💕`)
            .setColor(0xFF1493)
            .setTimestamp();

        const kissImagePath = path.join(__dirname, '..', 'assets', 'wedding', 'kissing.gif');
        let kissAttachment = null;
        if (fs.existsSync(kissImagePath)) {
            kissAttachment = new AttachmentBuilder(kissImagePath, { name: 'kissing.gif' });
            kissEmbed.setImage('attachment://kissing.gif');
        }

        await interaction.followUp({ 
            embeds: [kissEmbed], 
            files: kissAttachment ? [kissAttachment] : []
        });
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Step 7: Create Marriage Record
        try {
            const marriageResult = await dbManager.createMarriage(
                partner1Id, partner1Name, partner1Role,
                partner2Id, partner2Name, partner2Role,
                guildId, ceremonyData
            );

            if (marriageResult.success) {
                // Assign Married Couples role to both partners
                try {
                    const marriedCouplesRoleId = '1417807951627943987';
                    const guild = interaction.guild;
                    
                    if (guild) {
                        const partner1Member = await guild.members.fetch(partner1Id).catch(() => null);
                        const partner2Member = await guild.members.fetch(partner2Id).catch(() => null);
                        
                        if (partner1Member) {
                            await partner1Member.roles.add(marriedCouplesRoleId).catch(err => 
                                logger.warn(`Failed to add married role to ${partner1Name}: ${err.message}`)
                            );
                        }
                        
                        if (partner2Member) {
                            await partner2Member.roles.add(marriedCouplesRoleId).catch(err => 
                                logger.warn(`Failed to add married role to ${partner2Name}: ${err.message}`)
                            );
                        }
                    }
                } catch (roleError) {
                    logger.warn(`Error assigning married couples role: ${roleError.message}`);
                }

                // Final celebration embed
                const celebrationEmbed = new EmbedBuilder()
                    .setTitle('🎊 Congratulations!')
                    .setDescription(`**${partner1Name}** and **${partner2Name}** are now officially married! 🎉\n\nYour marriage has been registered in the ATIVE Casino records.`)
                    .addFields(
                        {
                            name: '💰 Marriage Benefits',
                            value: '• Shared bank account\n• Reduced transfer taxes (2% instead of 5%)\n• Special marriage profile\n• Joint financial standing\n• Married Couples role',
                            inline: false
                        },
                        {
                            name: '📋 Next Steps',
                            value: '• Use `/marriage-profile` to view your marriage\n• Send money to each other with reduced taxes\n• Use `/divorce` if needed (hopefully not!)',
                            inline: false
                        }
                    )
                    .setColor(0xFFD700)
                    .setTimestamp()
                    .setFooter({ text: '💒 ATIVE Casino Wedding Services • Congratulations!' });

                await interaction.followUp({ embeds: [celebrationEmbed] });

                // Ping the married couples role
                try {
                    const marriedCouplesRoleId = '1417807951627943987';
                    await interaction.followUp({
                        content: `🎉 <@&${marriedCouplesRoleId}> Welcome our newest married couple! 💒✨`,
                        allowedMentions: { roles: [marriedCouplesRoleId] }
                    });
                } catch (pingError) {
                    logger.warn(`Error pinging married couples role: ${pingError.message}`);
                }

                // Log the marriage
                await sendLogMessage(
                    interaction.client,
                    'info',
                    `Marriage completed: ${partner1Name} (${partner1Role}) & ${partner2Name} (${partner2Role})`,
                    partner1Id,
                    guildId
                );

                // Update the original proposal to mark it as completed
                try {
                    if (dbManager.databaseAdapter && dbManager.databaseAdapter.pool) {
                        await dbManager.databaseAdapter.pool.execute(
                            'UPDATE marriage_proposals SET status = ? WHERE ((proposer_id = ? AND recipient_id = ?) OR (proposer_id = ? AND recipient_id = ?)) AND status = ?',
                            ['expired', partner1Id, partner2Id, partner2Id, partner1Id, 'accepted']
                        );
                    }
                } catch (updateError) {
                    logger.error(`Error updating proposal status: ${updateError.message}`);
                }

            } else {
                throw new Error(marriageResult.error);
            }

        } catch (error) {
            logger.error(`Error creating marriage record: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Marriage Registration Failed')
                .setDescription('The ceremony was beautiful, but there was an error registering your marriage. Please contact an administrator.')
                .setColor(0xFF0000);

            await interaction.followUp({ embeds: [errorEmbed] });
        }
    }
};