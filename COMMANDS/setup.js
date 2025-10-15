/**
 * Setup command - Complete server setup wizard
 * Comprehensive 7-step setup process for new servers
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const SetupWizard = require('../UTILS/setupWizard');
const { SetupInteractionHandler, activeSetups } = require('../UTILS/setupInteractionHandler');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Complete 7-step server configuration wizard for ATIVE Casino Bot'),

    async execute(interaction) {
        try {
            // Check if setup is already running for this server
            if (activeSetups.has(interaction.guildId)) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Setup Already Running')
                    .setDescription('A setup wizard is already active for this server.\n\nPlease complete or cancel the existing setup before starting a new one.')
                    .setColor(0xF39C12)
                    .setFooter({ text: 'ATIVE Casino Bot Setup', iconURL: interaction.client?.user?.displayAvatarURL() || null });
                
                return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Create new setup wizard instance
            const wizard = new SetupWizard();
            
            // Initialize wizard with server data
            const initResult = await wizard.initialize(interaction);
            
            if (initResult.isRerun) {
                const rerunEmbed = new EmbedBuilder()
                    .setTitle('🔄 Setup Already Complete')
                    .setDescription('**This server has already been configured!**\n\nYour bot was set up on ' + new Date(initResult.existingConfig.setupDate).toLocaleDateString() + '.\n\n**Would you like to:**')
                    .addFields(
                        {
                            name: '🔄 Reconfigure Server',
                            value: 'Run the setup wizard again to change your settings',
                            inline: true
                        },
                        {
                            name: '📊 View Current Config',
                            value: 'See your current server configuration',
                            inline: true
                        }
                    )
                    .setColor(0x3498DB)
                    .setThumbnail(interaction.client?.user?.displayAvatarURL() || null)
                    .setFooter({ text: 'ATIVE Casino Bot Setup', iconURL: interaction.client?.user?.displayAvatarURL() || null })
                    .setTimestamp();

                // Create action row with buttons
                const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('setup_reconfigure')
                            .setLabel('Reconfigure')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('🔄'),
                        new ButtonBuilder()
                            .setCustomId('setup_view_config')
                            .setLabel('View Config')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('📊'),
                        new ButtonBuilder()
                            .setCustomId('setup_cancel')
                            .setLabel('Cancel')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('❌')
                    );

                SetupInteractionHandler.setActiveSetup(interaction.guildId, wizard);
                
                return await interaction.reply({ 
                    embeds: [rerunEmbed], 
                    components: [row],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Store active setup session
            SetupInteractionHandler.setActiveSetup(interaction.guildId, wizard);

            // Show first step of wizard
            const step1Response = await wizard.showWelcomeStep(interaction);
            
            await interaction.reply({
                embeds: step1Response.embeds,
                components: step1Response.components,
                flags: MessageFlags.Ephemeral // Keep setup private to reduce clutter
            });

            // Log the setup start
            logger.info(`Setup wizard started by ${interaction.user.tag} in guild ${interaction.guild.name} (${interaction.guildId})`);

            // Set timeout to clean up inactive sessions (30 minutes)
            setTimeout(() => {
                if (SetupInteractionHandler.getActiveSetup(interaction.guildId)) {
                    SetupInteractionHandler.removeActiveSetup(interaction.guildId);
                    logger.info(`Setup session timeout for guild ${interaction.guildId}`);
                }
            }, 30 * 60 * 1000);

        } catch (error) {
            logger.error(`Error in setup command: ${error.message}`);
            
            // Clean up active setup on error
            SetupInteractionHandler.removeActiveSetup(interaction.guildId);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('🔴 Setup Error')
                .setDescription('❌ **Setup Failed**\n\nAn error occurred while initializing the setup wizard.')
                .addFields({ 
                    name: '🔧 Error Details', 
                    value: '```' + error.message.slice(0, 1000) + '```', 
                    inline: false 
                })
                .setColor(0xE74C3C)
                .setThumbnail(interaction.client?.user?.displayAvatarURL() || null)
                .setFooter({ text: '🛠️ Setup Error • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};
