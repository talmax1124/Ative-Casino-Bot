const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags } = require('discord.js');
const dbManager = require('../UTILS/databaseAdapter');
const { getGuildId, sendLogMessage, fmt } = require('../UTILS/common');
const logger = require('../UTILS/logger');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('marriage')
        .setDescription('Marriage system commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('propose')
                .setDescription('Propose marriage to another user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user you want to propose to')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Your proposal message (optional)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('ceremony')
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
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('profile')
                .setDescription('View your marriage profile and shared information')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('View another user\'s marriage profile (optional)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('divorce')
                .setDescription('Initiate divorce proceedings to end your marriage')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('business')
                .setDescription('View and purchase marriage businesses')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Action to perform')
                        .addChoices(
                            { name: 'View Available Businesses', value: 'view' },
                            { name: 'Purchase Business', value: 'purchase' },
                            { name: 'My Businesses', value: 'owned' }
                        )
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('business')
                        .setDescription('Business to purchase (required for purchase action)')
                        .addChoices(
                            { name: 'Royal Union Holdings - 10M', value: 'royal_union_holdings' },
                            { name: 'Heartline Industries - 50M', value: 'heartline_industries' },
                            { name: 'Eternity Holdings - 100M', value: 'eternity_holdings' },
                            { name: 'Amore Estates - 150M', value: 'amore_estates' }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('deposit')
                .setDescription('Deposit money into your marriage shared bank')
                .addStringOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to deposit (supports K/M/B, "all", "half")')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('withdraw')
                .setDescription('Withdraw money from your marriage shared bank')
                .addStringOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to withdraw (supports K/M/B, "all", "half")')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'propose':
                await this.handlePropose(interaction);
                break;
            case 'ceremony':
                await this.handleCeremony(interaction);
                break;
            case 'profile':
                await this.handleProfile(interaction);
                break;
            case 'divorce':
                await this.handleDivorce(interaction);
                break;
            case 'business':
                await this.handleBusiness(interaction);
                break;
            case 'deposit':
                await this.handleDeposit(interaction);
                break;
            case 'withdraw':
                await this.handleWithdraw(interaction);
                break;
            default:
                await interaction.reply({
                    content: '❌ Unknown marriage subcommand.',
                    ephemeral: true
                });
        }
    },

    async handlePropose(interaction) {
        const proposer = interaction.user;
        const recipient = interaction.options.getUser('user');
        const proposalMessage = interaction.options.getString('message') || 'Will you marry me? 💍';
        const guildId = await getGuildId(interaction);

        await interaction.deferReply();

        try {
            // Check if proposer is trying to propose to themselves
            if (proposer.id === recipient.id) {
                await interaction.editReply({
                    content: '❌ You cannot propose to yourself! That would be quite lonely...'
                });
                return;
            }

            // Check if proposer is already married
            const proposerMarriage = await dbManager.getUserMarriage(proposer.id, guildId);
            if (proposerMarriage.married) {
                await interaction.editReply({
                    content: `❌ You are already married to **${proposerMarriage.marriage.partnerName}**! You cannot propose to someone else.`
                });
                return;
            }

            // Check if recipient is already married
            const recipientMarriage = await dbManager.getUserMarriage(recipient.id, guildId);
            if (recipientMarriage.married) {
                await interaction.editReply({
                    content: `❌ **${recipient.displayName}** is already married to someone else!`
                });
                return;
            }

            // Check if there's already a pending proposal between these users
            const pendingProposals = await dbManager.getPendingMarriageProposals(recipient.id, guildId);
            const existingProposal = pendingProposals.proposals.find(p => p.proposer_id === proposer.id);
            
            if (existingProposal) {
                await interaction.editReply({
                    content: `❌ You already have a pending proposal to **${recipient.displayName}**! Please wait for them to respond.`
                });
                return;
            }

            // Check if recipient has already proposed to the proposer
            const recipientProposals = await dbManager.getPendingMarriageProposals(proposer.id, guildId);
            const reciprocalProposal = recipientProposals.proposals.find(p => p.proposer_id === recipient.id);
            
            if (reciprocalProposal) {
                await interaction.editReply({
                    content: `❌ **${recipient.displayName}** has already proposed to you! Please respond to their proposal first using the buttons in their proposal message.`
                });
                return;
            }

            // Create the proposal
            const proposalResult = await dbManager.createMarriageProposal(
                proposer.id, proposer.displayName,
                recipient.id, recipient.displayName,
                guildId, proposalMessage
            );

            if (!proposalResult.success) {
                await interaction.editReply({
                    content: '❌ An error occurred while creating your proposal. Please try again later.'
                });
                return;
            }

            // Create proposal embed
            const proposalEmbed = new EmbedBuilder()
                .setTitle('💍 Marriage Proposal')
                .setDescription(`**${proposer.displayName}** has proposed to **${recipient.displayName}**!`)
                .addFields(
                    {
                        name: '💌 Proposal Message',
                        value: `"${proposalMessage}"`,
                        inline: false
                    },
                    {
                        name: '💰 Marriage Benefits',
                        value: '• Shared bank account\n• Reduced transfer taxes (2% instead of 5%)\n• Special marriage profile\n• Joint financial standing',
                        inline: false
                    },
                    {
                        name: '⏰ Response Time',
                        value: 'This proposal will expire in 24 hours',
                        inline: false
                    }
                )
                .setColor(0xFF69B4)
                .setTimestamp()
                .setFooter({ text: '💒 ATIVE Casino Wedding Services' });

            // Set thumbnail to proposer's avatar
            proposalEmbed.setThumbnail(proposer.displayAvatarURL());

            // Create response buttons
            const proposalButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`marriage_accept_${proposalResult.proposalId}`)
                        .setLabel('Accept Proposal')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('💍'),
                    new ButtonBuilder()
                        .setCustomId(`marriage_reject_${proposalResult.proposalId}`)
                        .setLabel('Decline Proposal')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('💔')
                );

            await interaction.editReply({
                content: `${recipient} 💍`,
                embeds: [proposalEmbed],
                components: [proposalButtons]
            });

            // Log the proposal
            if (interaction?.client) {
                await sendLogMessage(
                    interaction.client,
                    'info',
                    `Marriage proposal created: ${proposer.displayName} proposed to ${recipient.displayName}`,
                    proposer.id,
                    guildId
                );
            }

        } catch (error) {
            logger.error(`Error in marriage propose subcommand: ${error.message}`);
            
            await interaction.editReply({
                content: '❌ An error occurred while processing your proposal. Please try again later.'
            });
        }
    },

    async handleCeremony(interaction) {
        const userId = interaction.user.id;
        const userRole = interaction.options.getString('role');
        const maidOfHonor = interaction.options.getUser('maid_of_honor');
        const bestPerson = interaction.options.getUser('best_person');
        const flowerGirl = interaction.options.getUser('flower_girl');
        const ringBearer = interaction.options.getUser('ring_bearer');
        const officiant = interaction.options.getUser('officiant');
        const guildId = await getGuildId(interaction);

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
                const allProposals = await dbManager.pool.execute(
                    'SELECT * FROM marriage_proposals WHERE proposer_id = ? AND guild_id = ? AND status = ?',
                    [userId, guildId, 'accepted']
                );
                if (allProposals[0].length > 0) {
                    sentAcceptedProposal = allProposals[0][0];
                }
            } catch (error) {
                logger.error(`Error checking sent proposals: ${error.message}`);
            }

            const validProposal = acceptedProposal || sentAcceptedProposal;
            
            if (!validProposal) {
                await interaction.editReply({
                    content: '❌ You need an accepted marriage proposal before starting a ceremony! Use `/marriage propose` first.'
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
            logger.error(`Error in marriage ceremony subcommand: ${error.message}`);
            
            await interaction.editReply({
                content: '❌ An error occurred while starting your wedding ceremony. Please try again later.'
            });
        }
    },

    async handleProfile(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const guildId = await getGuildId(interaction);

        await interaction.deferReply();

        try {
            // Get marriage information
            const marriageData = await dbManager.getUserMarriage(targetUser.id, guildId);

            if (!marriageData.married) {
                const content = targetUser.id === interaction.user.id 
                    ? '❌ You are not currently married! Use `/marriage propose` to start your love story.' 
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
            logger.error(`Error in marriage profile subcommand: ${error.message}`);
            
            await interaction.editReply({
                content: '❌ An error occurred while retrieving the marriage profile. Please try again later.'
            });
        }
    },

    async handleDivorce(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        await interaction.deferReply({ ephemeral: true });

        try {
            // Check if the user is married
            const marriageData = await dbManager.getUserMarriage(userId, guildId);

            if (!marriageData.married) {
                await interaction.editReply({
                    content: '❌ You are not currently married, so you cannot divorce.'
                });
                return;
            }

            const marriage = marriageData.marriage;
            const sharedBankAmount = marriage.shared_bank || 0;
            const sharedBankSplit = sharedBankAmount / 2;

            // Create divorce confirmation embed
            const divorceEmbed = new EmbedBuilder()
                .setTitle('💔 Divorce Proceedings')
                .setDescription('Are you sure you want to divorce your partner? This action cannot be undone.')
                .addFields(
                    {
                        name: '👫 Current Marriage',
                        value: `**${marriage.partner1_name}** & **${marriage.partner2_name}**`,
                        inline: false
                    },
                    {
                        name: '💰 Shared Bank Distribution',
                        value: `Each partner will receive **${Math.floor(sharedBankSplit).toLocaleString()}** coins from the shared bank`,
                        inline: false
                    },
                    {
                        name: '⚠️ Consequences',
                        value: '• Marriage benefits will be lost\n• Shared bank will be divided equally\n• Marriage roles will be removed\n• Your partner will be notified',
                        inline: false
                    }
                )
                .setColor(0xFF0000)
                .setTimestamp()
                .setFooter({ text: '💔 ATIVE Casino Divorce Proceedings' });

            // Create confirmation buttons
            const confirmRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`divorce_confirm_${marriage.id}`)
                        .setLabel('Confirm Divorce')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('💔'),
                    new ButtonBuilder()
                        .setCustomId(`divorce_cancel_${marriage.id}`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('✖️')
                );

            await interaction.editReply({
                embeds: [divorceEmbed],
                components: [confirmRow]
            });

        } catch (error) {
            logger.error(`Error in marriage divorce subcommand: ${error.message}`);
            
            await interaction.editReply({
                content: '❌ An error occurred while initiating divorce proceedings. Please try again later.'
            });
        }
    },

    // Copy the conductCeremony function from start-marriage.js (keeping it the same but updating references)
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
                // Final celebration embed
                const celebrationEmbed = new EmbedBuilder()
                    .setTitle('🎊 Congratulations!')
                    .setDescription(`**${partner1Name}** and **${partner2Name}** are now officially married! 🎉\n\nYour marriage has been registered in the ATIVE Casino records.`)
                    .addFields(
                        {
                            name: '💰 Marriage Benefits',
                            value: '• Shared bank account\n• Reduced transfer taxes (2% instead of 5%)\n• Special marriage profile\n• Joint financial standing',
                            inline: false
                        },
                        {
                            name: '📋 Next Steps',
                            value: '• Use `/marriage profile` to view your marriage\n• Send money to each other with reduced taxes\n• Use `/marriage divorce` if needed (hopefully not!)',
                            inline: false
                        }
                    )
                    .setColor(0xFFD700)
                    .setTimestamp()
                    .setFooter({ text: '💒 ATIVE Casino Wedding Services • Congratulations!' });

                await interaction.followUp({ embeds: [celebrationEmbed] });

                // Log the marriage
                if (interaction?.client) {
                    await sendLogMessage(
                        interaction.client,
                        'info',
                        `Marriage completed: ${partner1Name} (${partner1Role}) & ${partner2Name} (${partner2Role})`,
                        partner1Id,
                        guildId
                    );
                }

                // Update the original proposal to mark it as completed
                try {
                    await dbManager.pool.execute(
                        'UPDATE marriage_proposals SET status = ? WHERE (proposer_id = ? AND recipient_id = ?) OR (proposer_id = ? AND recipient_id = ?) AND guild_id = ? AND status = ?',
                        ['expired', partner1Id, partner2Id, partner2Id, partner1Id, guildId, 'accepted']
                    );
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
    },

    async handleBusiness(interaction) {
        const userId = interaction.user.id;
        const action = interaction.options.getString('action');
        const businessType = interaction.options.getString('business');
        const guildId = await getGuildId(interaction);

        await interaction.deferReply();

        try {
            // Check if user is married
            const marriageData = await dbManager.getUserMarriage(userId, guildId);
            if (!marriageData.married) {
                await interaction.editReply({
                    content: '❌ You must be married to access marriage businesses! Use `/marriage propose` to start your journey.'
                });
                return;
            }

            const marriage = marriageData.marriage;

            switch (action) {
                case 'view':
                    await this.handleViewBusinesses(interaction, marriage);
                    break;
                case 'purchase':
                    if (!businessType) {
                        await interaction.editReply({
                            content: '❌ Please specify which business you want to purchase!'
                        });
                        return;
                    }
                    await this.handlePurchaseBusiness(interaction, marriage, businessType);
                    break;
                case 'owned':
                    await this.handleOwnedBusinesses(interaction, marriage);
                    break;
                default:
                    await interaction.editReply({
                        content: '❌ Invalid business action.'
                    });
            }

        } catch (error) {
            logger.error(`Error in business subcommand: ${error.message}`);
            await interaction.editReply({
                content: '❌ An error occurred while processing your business request. Please try again later.'
            });
        }
    },

    async handleViewBusinesses(interaction, marriage) {
        try {
            const businessTypes = dbManager.getMarriageBusinessTypes();
            const ownedBusinesses = await dbManager.getMarriageBusinesses(marriage.id);
            
            let currentPage = 0;
            const itemsPerPage = 1;
            const totalPages = businessTypes.length;

            const generateEmbed = (page) => {
                const business = businessTypes[page];
                const isOwned = ownedBusinesses.businesses && 
                    ownedBusinesses.businesses.some(b => b.business_type === business.id);

                const embed = new EmbedBuilder()
                    .setTitle('💼 Marriage Business Directory')
                    .setDescription(`**${business.name}**\n${business.description}`)
                    .addFields(
                        {
                            name: '💰 Purchase Price',
                            value: fmt(business.price),
                            inline: true
                        },
                        {
                            name: '📈 Hourly Income',
                            value: fmt(business.hourlyRate),
                            inline: true
                        },
                        {
                            name: '💳 Shared Bank Balance',
                            value: fmt(marriage.shared_bank),
                            inline: true
                        },
                        {
                            name: '🏢 Status',
                            value: isOwned ? '✅ **OWNED**' : '🔓 Available for Purchase',
                            inline: false
                        }
                    )
                    .setColor(isOwned ? 0x00FF00 : 0xFF69B4)
                    .setFooter({ text: `Page ${page + 1} of ${totalPages} • 💒 ATIVE Casino Business Directory` })
                    .setTimestamp();

                // Add business image if it exists
                const imagePath = path.join(__dirname, '..', 'assets', 'MarriageBusiness', business.image);
                if (fs.existsSync(imagePath)) {
                    const attachment = new AttachmentBuilder(imagePath, { name: business.image });
                    embed.setImage(`attachment://${business.image}`);
                    return { embed, attachment };
                }

                return { embed, attachment: null };
            };

            const updateMessage = async (page) => {
                const { embed, attachment } = generateEmbed(page);
                const business = businessTypes[page];
                const isOwned = ownedBusinesses.businesses && 
                    ownedBusinesses.businesses.some(b => b.business_type === business.id);

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('business_prev')
                            .setLabel('◀️ Previous')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(page === 0),
                        new ButtonBuilder()
                            .setCustomId('business_next')
                            .setLabel('Next ▶️')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(page === totalPages - 1),
                        new ButtonBuilder()
                            .setCustomId(`business_purchase_${business.id}`)
                            .setLabel(`Purchase ${business.name}`)
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('💰')
                            .setDisabled(isOwned || marriage.shared_bank < business.price)
                    );

                const messageOptions = {
                    embeds: [embed],
                    components: [row]
                };

                if (attachment) {
                    messageOptions.files = [attachment];
                }

                return messageOptions;
            };

            const initialMessage = await updateMessage(currentPage);
            const message = await interaction.editReply(initialMessage);

            // Set up button collector
            const collector = message.createMessageComponentCollector({
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (buttonInteraction) => {
                if (buttonInteraction.user.id !== interaction.user.id) {
                    await buttonInteraction.reply({
                        content: '❌ You cannot interact with this business directory.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (buttonInteraction.customId === 'business_prev') {
                    currentPage = Math.max(0, currentPage - 1);
                    const updatedMessage = await updateMessage(currentPage);
                    await buttonInteraction.update(updatedMessage);
                } else if (buttonInteraction.customId === 'business_next') {
                    currentPage = Math.min(totalPages - 1, currentPage + 1);
                    const updatedMessage = await updateMessage(currentPage);
                    await buttonInteraction.update(updatedMessage);
                } else if (buttonInteraction.customId.startsWith('business_purchase_')) {
                    const businessId = buttonInteraction.customId.replace('business_purchase_', '');
                    await this.handleDirectBusinessPurchase(buttonInteraction, marriage, businessId);
                }
            });

            collector.on('end', async () => {
                try {
                    await message.edit({ components: [] });
                } catch (error) {
                    // Message might be deleted, ignore error
                }
            });

        } catch (error) {
            logger.error(`Error viewing businesses: ${error.message}`);
            await interaction.editReply({
                content: '❌ An error occurred while viewing businesses.'
            });
        }
    },

    async handlePurchaseBusiness(interaction, marriage, businessType) {
        try {
            const businessTypes = dbManager.getMarriageBusinessTypes();
            const business = businessTypes.find(b => b.id === businessType);

            if (!business) {
                await interaction.editReply({
                    content: '❌ Invalid business type specified.'
                });
                return;
            }

            // Check if already owned
            const ownedBusinesses = await dbManager.getMarriageBusinesses(marriage.id);
            const alreadyOwned = ownedBusinesses.businesses && 
                ownedBusinesses.businesses.some(b => b.business_type === business.id);

            if (alreadyOwned) {
                await interaction.editReply({
                    content: `❌ You already own **${business.name}**!`
                });
                return;
            }

            // Check funds
            if (marriage.shared_bank < business.price) {
                await interaction.editReply({
                    content: `❌ Insufficient funds! **${business.name}** costs ${fmt(business.price)} but your shared bank only has ${fmt(marriage.shared_bank)}.`
                });
                return;
            }

            // Create confirmation embed
            const confirmEmbed = new EmbedBuilder()
                .setTitle('💼 Business Purchase Confirmation')
                .setDescription(`Are you sure you want to purchase **${business.name}**?`)
                .addFields(
                    {
                        name: '💰 Purchase Price',
                        value: fmt(business.price),
                        inline: true
                    },
                    {
                        name: '📈 Hourly Income',
                        value: fmt(business.hourlyRate),
                        inline: true
                    },
                    {
                        name: '💳 Remaining Balance',
                        value: fmt(marriage.shared_bank - business.price),
                        inline: true
                    },
                    {
                        name: '📋 Business Details',
                        value: business.description,
                        inline: false
                    }
                )
                .setColor(0xFFD700)
                .setTimestamp()
                .setFooter({ text: '💒 ATIVE Casino Business Purchase' });

            const confirmRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`confirm_purchase_${business.id}`)
                        .setLabel('Confirm Purchase')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅'),
                    new ButtonBuilder()
                        .setCustomId('cancel_purchase')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('❌')
                );

            const confirmMessage = await interaction.editReply({
                embeds: [confirmEmbed],
                components: [confirmRow],
                fetchReply: true
            });

            // Wait for confirmation using the message collector instead of channel collector
            const filter = (i) => {
                return i.user.id === interaction.user.id && 
                       (i.customId.startsWith('confirm_purchase_') || i.customId === 'cancel_purchase');
            };

            const collector = confirmMessage.createMessageComponentCollector({
                filter,
                time: 60000,
                max: 1
            });

            collector.on('collect', async (confirmInteraction) => {
                if (confirmInteraction.customId === 'cancel_purchase') {
                    await confirmInteraction.update({
                        content: '❌ Business purchase cancelled.',
                        embeds: [],
                        components: []
                    });
                    return;
                }

                const businessId = confirmInteraction.customId.replace('confirm_purchase_', '');
                const purchaseResult = await dbManager.purchaseMarriageBusiness(
                    marriage.id, 
                    businessId, 
                    business.price, 
                    business.hourlyRate
                );

                if (purchaseResult.success) {
                    const successEmbed = new EmbedBuilder()
                        .setTitle('🎉 Business Purchase Successful!')
                        .setDescription(`Congratulations! You have successfully purchased **${business.name}**!`)
                        .addFields(
                            {
                                name: '💰 Amount Paid',
                                value: fmt(business.price),
                                inline: true
                            },
                            {
                                name: '📈 Hourly Income',
                                value: fmt(business.hourlyRate),
                                inline: true
                            },
                            {
                                name: '💳 Remaining Balance',
                                value: fmt(marriage.shared_bank - business.price),
                                inline: true
                            },
                            {
                                name: '📊 Income Generation',
                                value: 'Your business will start generating income every hour automatically to your shared bank account!',
                                inline: false
                            }
                        )
                        .setColor(0x00FF00)
                        .setTimestamp()
                        .setFooter({ text: '💒 ATIVE Casino Business Empire' });

                    await confirmInteraction.update({
                        embeds: [successEmbed],
                        components: []
                    });

                    // Log the purchase
                    if (interaction?.client) {
                        await sendLogMessage(
                            interaction.client,
                            'info',
                            `Marriage business purchased: ${marriage.partner1_name} & ${marriage.partner2_name} bought ${business.name} for ${fmt(business.price)}`,
                            interaction.user.id,
                            await getGuildId(interaction)
                        );
                    }

                } else {
                    await confirmInteraction.update({
                        content: `❌ Purchase failed: ${purchaseResult.error}`,
                        embeds: [],
                        components: []
                    });
                }
            });

            collector.on('end', (collected) => {
                if (collected.size === 0) {
                    interaction.editReply({
                        content: '❌ Purchase confirmation timed out.',
                        embeds: [],
                        components: []
                    });
                }
            });

        } catch (error) {
            logger.error(`Error purchasing business: ${error.message}`);
            // Use editReply since we already replied with the confirmation embed
            try {
                await interaction.editReply({
                    content: '❌ An error occurred while purchasing the business.',
                    embeds: [],
                    components: []
                });
            } catch (editError) {
                // If editReply fails, try followUp as last resort
                try {
                    await interaction.followUp({
                        content: '❌ An error occurred while purchasing the business.',
                        flags: MessageFlags.Ephemeral
                    });
                } catch (followUpError) {
                    logger.error(`Could not send error message: ${followUpError.message}`);
                }
            }
        }
    },

    async handleOwnedBusinesses(interaction, marriage) {
        try {
            const ownedBusinessesResult = await dbManager.getMarriageBusinesses(marriage.id);
            
            if (!ownedBusinessesResult.success || ownedBusinessesResult.businesses.length === 0) {
                await interaction.editReply({
                    content: '🏢 You don\'t own any businesses yet! Use `/marriage business view` to browse available businesses.'
                });
                return;
            }

            const businesses = ownedBusinessesResult.businesses;
            const businessTypes = dbManager.getMarriageBusinessTypes();

            const embed = new EmbedBuilder()
                .setTitle('🏢 Your Marriage Business Empire')
                .setDescription(`**${marriage.partner1_name}** & **${marriage.partner2_name}**`)
                .setColor(0x00FF00)
                .setTimestamp()
                .setFooter({ text: '💒 ATIVE Casino Business Portfolio' });

            let totalHourlyIncome = 0;
            let totalInvested = 0;
            let totalEarned = 0;

            for (const business of businesses) {
                const businessType = businessTypes.find(bt => bt.id === business.business_type);
                if (businessType) {
                    totalHourlyIncome += business.hourly_rate;
                    totalInvested += business.purchase_price;
                    totalEarned += business.total_earned;

                    const hoursOwned = Math.floor((Date.now() - new Date(business.purchased_at).getTime()) / (1000 * 60 * 60));
                    
                    embed.addFields({
                        name: `🏢 ${businessType.name}`,
                        value: `**Purchase Price:** ${fmt(business.purchase_price)}\n**Hourly Rate:** ${fmt(business.hourly_rate)}\n**Total Earned:** ${fmt(business.total_earned)}\n**Owned for:** ${hoursOwned} hours`,
                        inline: true
                    });
                }
            }

            embed.addFields(
                {
                    name: '📊 Portfolio Summary',
                    value: `**Total Businesses:** ${businesses.length}\n**Total Invested:** ${fmt(totalInvested)}\n**Total Earned:** ${fmt(totalEarned)}\n**Hourly Income:** ${fmt(totalHourlyIncome)}`,
                    inline: false
                },
                {
                    name: '💰 Current Shared Bank',
                    value: fmt(marriage.shared_bank),
                    inline: true
                },
                {
                    name: '📈 ROI Status',
                    value: totalInvested > 0 ? `${((totalEarned / totalInvested) * 100).toFixed(1)}%` : '0%',
                    inline: true
                }
            );

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error(`Error showing owned businesses: ${error.message}`);
            await interaction.editReply({
                content: '❌ An error occurred while retrieving your business portfolio.'
            });
        }
    },

    async handleDirectBusinessPurchase(interaction, marriage, businessType) {
        try {
            const businessTypes = dbManager.getMarriageBusinessTypes();
            const business = businessTypes.find(b => b.id === businessType);

            if (!business) {
                await interaction.reply({
                    content: '❌ Invalid business type specified.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Check if already owned
            const ownedBusinesses = await dbManager.getMarriageBusinesses(marriage.id);
            const alreadyOwned = ownedBusinesses.businesses && 
                ownedBusinesses.businesses.some(b => b.business_type === business.id);

            if (alreadyOwned) {
                await interaction.reply({
                    content: `❌ You already own **${business.name}**!`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Check funds
            if (marriage.shared_bank < business.price) {
                await interaction.reply({
                    content: `❌ Insufficient funds! **${business.name}** costs ${fmt(business.price)} but your shared bank only has ${fmt(marriage.shared_bank)}.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Defer reply for processing time
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // Proceed with purchase directly
            const purchaseResult = await dbManager.purchaseMarriageBusiness(
                marriage.id, 
                businessType, 
                business.price, 
                business.hourlyRate
            );

            if (purchaseResult.success) {
                const successEmbed = new EmbedBuilder()
                    .setTitle('🎉 Business Purchase Successful!')
                    .setDescription(`Congratulations! You have successfully purchased **${business.name}**!`)
                    .addFields(
                        {
                            name: '💰 Amount Paid',
                            value: fmt(business.price),
                            inline: true
                        },
                        {
                            name: '📈 Hourly Income',
                            value: fmt(business.hourlyRate),
                            inline: true
                        },
                        {
                            name: '💳 Remaining Balance',
                            value: fmt(marriage.shared_bank - business.price),
                            inline: true
                        },
                        {
                            name: '📊 Income Generation',
                            value: 'Your business will start generating income every hour automatically to your shared bank account!',
                            inline: false
                        }
                    )
                    .setColor(0x00FF00)
                    .setTimestamp()
                    .setFooter({ text: '💒 ATIVE Casino Business Empire' });

                await interaction.editReply({
                    embeds: [successEmbed]
                });

                // Log the purchase
                if (interaction?.client) {
                    await sendLogMessage(
                        interaction.client,
                        'info',
                        `Marriage business purchased: ${marriage.partner1_name} & ${marriage.partner2_name} bought ${business.name} for ${fmt(business.price)}`,
                        interaction.user.id,
                        await getGuildId(interaction)
                    );
                }

            } else {
                await interaction.editReply({
                    content: `❌ Purchase failed: ${purchaseResult.error}`
                });
            }

        } catch (error) {
            logger.error(`Error in direct business purchase: ${error.message}`);
            await interaction.editReply({
                content: '❌ An error occurred while purchasing the business.'
            });
        }
    },

    async handleWithdraw(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const amountInput = interaction.options.getString('amount');

        await interaction.deferReply();

        try {
            // Check if user is married
            const marriageData = await dbManager.getUserMarriage(userId, guildId);
            if (!marriageData.married) {
                await interaction.editReply({
                    content: '❌ You must be married to withdraw from the shared bank! Use `/marriage propose` to start your journey.'
                });
                return;
            }

            const marriage = marriageData.marriage;

            // Check shared bank balance
            if (!marriage.shared_bank || marriage.shared_bank <= 0) {
                await interaction.editReply({
                    content: '❌ Your marriage shared bank is empty! Use `/marriage deposit` to add money to the shared account.'
                });
                return;
            }

            // Parse withdrawal amount
            let withdrawAmount;
            const input = amountInput.trim().toLowerCase();
            
            if (input === 'all') {
                withdrawAmount = marriage.shared_bank;
            } else if (input === 'half') {
                withdrawAmount = Math.floor(marriage.shared_bank / 2);
            } else {
                withdrawAmount = parseAmount(input);
                if (withdrawAmount <= 0) {
                    await interaction.editReply({
                        content: '❌ Please enter a valid positive amount.'
                    });
                    return;
                }
            }

            // Validate withdrawal amount
            if (withdrawAmount > marriage.shared_bank) {
                await interaction.editReply({
                    content: `❌ You can't withdraw ${fmt(withdrawAmount)}! Your shared bank only has ${fmt(marriage.shared_bank)}.`
                });
                return;
            }

            // Minimum withdrawal check
            if (withdrawAmount < 100) {
                await interaction.editReply({
                    content: '❌ Minimum withdrawal amount is $100.'
                });
                return;
            }

            // Perform the withdrawal
            const result = await dbManager.withdrawFromSharedBank(userId, guildId, withdrawAmount);
            
            if (result.success) {
                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Withdrawal Successful!')
                    .setDescription(`Successfully withdrew ${fmt(withdrawAmount)} from your marriage shared bank.`)
                    .addFields(
                        { name: '💵 Amount Withdrawn', value: fmt(withdrawAmount), inline: true },
                        { name: '🏦 Remaining Balance', value: fmt(result.newSharedBalance), inline: true },
                        { name: '👥 Marriage', value: `${marriage.partner1_name} & ${marriage.partner2_name}`, inline: false }
                    )
                    .setColor(0x00ff00)
                    .setTimestamp();

                await interaction.editReply({ embeds: [successEmbed] });

                // Log the withdrawal
                if (interaction?.client) {
                    await sendLogMessage(
                        interaction.client,
                        'info',
                        `Marriage bank withdrawal: ${interaction.user.displayName} withdrew ${fmt(withdrawAmount)} from shared bank (${marriage.partner1_name} & ${marriage.partner2_name})`,
                        userId,
                        guildId
                    );
                }
            } else {
                await interaction.editReply({
                    content: `❌ Withdrawal failed: ${result.error}`
                });
            }

        } catch (error) {
            logger.error(`Error in marriage withdraw: ${error.message}`);
            await interaction.editReply({
                content: '❌ An error occurred while processing your withdrawal. Please try again later.'
            });
        }
    },

    async handleDeposit(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const amountInput = interaction.options.getString('amount');

        await interaction.deferReply();

        try {
            // Check if user is married
            const marriageData = await dbManager.getUserMarriage(userId, guildId);
            if (!marriageData.married) {
                await interaction.editReply({
                    content: '❌ You must be married to deposit into the shared bank! Use `/marriage propose` to start your journey.'
                });
                return;
            }

            // Get user's balance
            const userBalance = await dbManager.getUserBalance(userId, guildId);
            
            // Parse deposit amount
            let depositAmount;
            const input = amountInput.trim().toLowerCase();
            
            if (input === 'all') {
                depositAmount = userBalance.wallet;
            } else if (input === 'half') {
                depositAmount = Math.floor(userBalance.wallet / 2);
            } else {
                depositAmount = parseAmount(input);
                if (depositAmount <= 0) {
                    await interaction.editReply({
                        content: '❌ Please enter a valid positive amount.'
                    });
                    return;
                }
            }

            // Check if user has enough money
            if (depositAmount > userBalance.wallet) {
                await interaction.editReply({
                    content: `❌ You don't have enough money! You only have ${fmt(userBalance.wallet)} in your wallet.`
                });
                return;
            }

            // Minimum deposit check
            if (depositAmount < 100) {
                await interaction.editReply({
                    content: '❌ Minimum deposit amount is $100.'
                });
                return;
            }

            const marriage = marriageData.marriage;

            // Deduct from user's wallet first
            const deductResult = await dbManager.removeMoney(userId, guildId, depositAmount);
            if (!deductResult.success) {
                await interaction.editReply({
                    content: `❌ Failed to deduct money from your wallet: ${deductResult.error}`
                });
                return;
            }

            // Add to shared bank
            const result = await dbManager.addToSharedBank(userId, guildId, depositAmount);
            
            if (result.success) {
                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Deposit Successful!')
                    .setDescription(`Successfully deposited ${fmt(depositAmount)} into your marriage shared bank.`)
                    .addFields(
                        { name: '💵 Amount Deposited', value: fmt(depositAmount), inline: true },
                        { name: '🏦 New Shared Balance', value: fmt(result.newSharedBalance), inline: true },
                        { name: '👥 Marriage', value: `${marriage.partner1_name} & ${marriage.partner2_name}`, inline: false }
                    )
                    .setColor(0x00ff00)
                    .setTimestamp();

                await interaction.editReply({ embeds: [successEmbed] });

                // Log the deposit
                if (interaction?.client) {
                    await sendLogMessage(
                        interaction.client,
                        'info',
                        `Marriage bank deposit: ${interaction.user.displayName} deposited ${fmt(depositAmount)} to shared bank (${marriage.partner1_name} & ${marriage.partner2_name})`,
                        userId,
                        guildId
                    );
                }
            } else {
                // Refund the user if shared bank deposit failed
                await dbManager.addMoney(userId, guildId, depositAmount);
                await interaction.editReply({
                    content: `❌ Deposit failed: ${result.error}. Your money has been refunded.`
                });
            }

        } catch (error) {
            logger.error(`Error in marriage deposit: ${error.message}`);
            await interaction.editReply({
                content: '❌ An error occurred while processing your deposit. Please try again later.'
            });
        }
    }
};