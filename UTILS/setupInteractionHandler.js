/**
 * Setup Wizard Interaction Handler
 * Handles all button and select menu interactions for the setup wizard
 */

const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const logger = require('./logger');

// Store active wizard instances (exported so setup command can access)
const activeSetups = new Map();

class SetupInteractionHandler {
    static getActiveSetup(guildId) {
        return activeSetups.get(guildId);
    }

    static setActiveSetup(guildId, wizard) {
        activeSetups.set(guildId, wizard);
    }

    static removeActiveSetup(guildId) {
        activeSetups.delete(guildId);
    }

    static async handleSetupInteraction(interaction) {
        const { customId, guildId } = interaction;
        const wizard = activeSetups.get(guildId);

        if (!wizard) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Setup Session Not Found')
                .setDescription('Your setup session has expired or was cancelled. Please run `/setup` again to start a new setup.')
                .setColor(0xE74C3C)
                .setTimestamp();
            
            try {
                if (interaction.replied || interaction.deferred) {
                    return await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                } else {
                    return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }
            } catch (error) {
                logger.error(`Error responding to expired setup interaction: ${error.message}`);
                return;
            }
        }

        try {
            // Check if interaction is still valid
            if (!interaction.isRepliable()) {
                logger.warn(`Setup interaction ${customId} is no longer repliable`);
                return;
            }

            // Handle different button types
            if (customId === 'setup_start') {
                await this.handleStartSetup(interaction, wizard);
            }
            else if (customId === 'setup_retry_permissions') {
                await this.handleRetryPermissions(interaction, wizard);
            }
            else if (customId === 'setup_next') {
                await this.handleNextStep(interaction, wizard);
            }
            else if (customId === 'setup_previous') {
                await this.handlePreviousStep(interaction, wizard);
            }
            else if (customId === 'setup_cancel') {
                await this.handleCancelSetup(interaction, wizard);
            }
            else if (customId === 'setup_complete' || customId === 'setup_complete_wizard') {
                await this.handleCompleteSetup(interaction, wizard);
            }
            else if (customId === 'setup_reconfigure') {
                await this.handleReconfigure(interaction, wizard);
            }
            else if (customId === 'setup_view_config') {
                await this.handleViewConfig(interaction, wizard);
            }
            // Handle select menu interactions
            else if (customId === 'setup_games_channel') {
                await this.handleChannelSelection(interaction, wizard, 'gamesChannelId');
            }
            else if (customId === 'setup_logs_channel') {
                await this.handleChannelSelection(interaction, wizard, 'logsChannelId');
            }
            else if (customId === 'setup_admin_channel') {
                await this.handleChannelSelection(interaction, wizard, 'adminChannelId');
            }
            else if (customId === 'setup_admin_roles') {
                await this.handleRoleSelection(interaction, wizard, 'adminRoles');
            }
            else if (customId === 'setup_mod_roles') {
                await this.handleRoleSelection(interaction, wizard, 'moderatorRoles');
            }
            // Handle configuration buttons
            else if (customId.startsWith('setup_economy_') || 
                     customId.startsWith('setup_games_') ||
                     customId.startsWith('setup_security_')) {
                await this.handleConfigurationButton(interaction, wizard, customId);
            }
            else {
                logger.warn(`Unknown setup interaction: ${customId}`);
                await interaction.reply({ 
                    content: '❌ Unknown setup action. Please try again.', 
                    flags: MessageFlags.Ephemeral 
                });
            }
        } catch (error) {
            // Handle Discord API unknown interaction errors specifically
            if (error.code === 10062 || (error.message && error.message.includes('Unknown interaction'))) {
                logger.debug(`Setup interaction expired: ${customId} - ${error.message}`);
                return;
            }
            
            logger.error(`Error handling setup interaction ${customId}: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Setup Error')
                .setDescription('An error occurred while processing your setup action.')
                .addFields({
                    name: 'Error Details',
                    value: `\`\`\`${error.message.slice(0, 1000)}\`\`\``,
                    inline: false
                })
                .setColor(0xE74C3C)
                .setTimestamp();
            
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }
            } catch (responseError) {
                // If we can't respond to the interaction, just log it
                logger.debug(`Could not respond to setup interaction: ${responseError.message}`);
            }
        }
    }

    static async handleStartSetup(interaction, wizard) {
        wizard.currentStep = 2;
        const stepResponse = await wizard.showServerConfigStep(interaction);
        
        await interaction.update({
            embeds: stepResponse.embeds,
            components: stepResponse.components
        });
    }

    static async handleRetryPermissions(interaction, wizard) {
        const stepResponse = await wizard.showWelcomeStep(interaction);
        
        await interaction.update({
            embeds: stepResponse.embeds,
            components: stepResponse.components
        });
    }

    static async handleNextStep(interaction, wizard) {
        // Validate current step before proceeding
        const validation = wizard.validateStep(wizard.currentStep);
        if (!validation.valid) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('⚠️ Configuration Required')
                .setDescription(`Please complete the current step configuration:\n\n${validation.error}`)
                .setColor(0xF39C12)
                .setTimestamp();
            
            return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }

        const nextStepResponse = wizard.goToNextStep();
        if (nextStepResponse) {
            await interaction.update({
                embeds: nextStepResponse.embeds,
                components: nextStepResponse.components
            });
        }
    }

    static async handlePreviousStep(interaction, wizard) {
        const prevStepResponse = wizard.goToPreviousStep();
        if (prevStepResponse) {
            await interaction.update({
                embeds: prevStepResponse.embeds,
                components: prevStepResponse.components
            });
        }
    }

    static async handleCancelSetup(interaction, wizard) {
        wizard.cancelSetup();
        activeSetups.delete(interaction.guildId);

        const cancelEmbed = new EmbedBuilder()
            .setTitle('❌ Setup Cancelled')
            .setDescription('The setup wizard has been cancelled. No changes were made to your server configuration.\n\nYou can run `/setup` again anytime to configure the bot.')
            .setColor(0xE74C3C)
            .setThumbnail(interaction.client?.user?.displayAvatarURL() || null)
            .setTimestamp();

        await interaction.update({
            embeds: [cancelEmbed],
            components: []
        });

        logger.info(`Setup cancelled by ${interaction.user.tag} in guild ${interaction.guild.name}`);
    }

    static async handleCompleteSetup(interaction, wizard) {
        await interaction.deferUpdate();
        
        const result = await wizard.completeSetup(interaction);
        
        if (result.success) {
            activeSetups.delete(interaction.guildId);
            
            const successEmbed = new EmbedBuilder()
                .setTitle('🎉 Setup Complete!')
                .setDescription('**Your server has been successfully configured!**\n\nThe ATIVE Casino Bot is now ready to use. Here\'s what\'s been set up:')
                .addFields(
                    {
                        name: '✅ Configuration Summary',
                        value: wizard.createConfigurationSummary(),
                        inline: false
                    },
                    {
                        name: '🚀 Next Steps',
                        value: '• Use `/panel` to create admin control panels\n• Users can start playing with `/balance` and `/work`\n• Check `/help` for all available commands',
                        inline: false
                    }
                )
                .setColor(0x2ECC71)
                .setThumbnail(interaction.client?.user?.displayAvatarURL() || null)
                .setTimestamp();

            await interaction.editReply({
                embeds: [successEmbed],
                components: []
            });

            logger.info(`Setup completed by ${interaction.user.tag} in guild ${interaction.guild.name}`);
        } else {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Setup Failed')
                .setDescription('There was an error saving your configuration. Please try again.')
                .addFields({
                    name: 'Error Details',
                    value: `\`\`\`${result.error}\`\`\``,
                    inline: false
                })
                .setColor(0xE74C3C)
                .setTimestamp();

            await interaction.editReply({
                embeds: [errorEmbed],
                components: []
            });
        }
    }

    static async handleReconfigure(interaction, wizard) {
        // Reset wizard and start from step 1
        wizard.currentStep = 1;
        const stepResponse = await wizard.showWelcomeStep(interaction);
        
        await interaction.update({
            embeds: stepResponse.embeds,
            components: stepResponse.components
        });
    }

    static async handleViewConfig(interaction, wizard) {
        const configEmbed = new EmbedBuilder()
            .setTitle('📊 Current Server Configuration')
            .setDescription('Here\'s your current server configuration:')
            .addFields({
                name: 'Configuration Summary',
                value: wizard.createConfigurationSummary() || 'No configuration found.',
                inline: false
            })
            .setColor(0x3498DB)
            .setTimestamp();

        await interaction.reply({ embeds: [configEmbed], flags: MessageFlags.Ephemeral });
    }

    static async handleChannelSelection(interaction, wizard, channelType) {
        const channelId = interaction.values[0];
        
        if (!wizard.serverData.channels) {
            wizard.serverData.channels = {};
        }
        
        wizard.serverData.channels[channelType] = channelId === 'none' ? null : channelId;
        
        // Update the current step display
        const stepResponse = await wizard.showServerConfigStep(interaction);
        await interaction.update({
            embeds: stepResponse.embeds,
            components: stepResponse.components
        });
    }

    static async handleRoleSelection(interaction, wizard, roleType) {
        const selectedRoles = interaction.values;
        
        if (!wizard.serverData.roles) {
            wizard.serverData.roles = {};
        }
        
        wizard.serverData.roles[roleType] = selectedRoles;
        
        // Update the current step display
        const stepResponse = await wizard.showRoleConfigStep(interaction);
        await interaction.update({
            embeds: stepResponse.embeds,
            components: stepResponse.components
        });
    }

    static async handleConfigurationButton(interaction, wizard, customId) {
        // Handle various configuration buttons
        if (customId === 'setup_use_defaults') {
            wizard.serverData.economy = wizard.getDefaultEconomySettings();
            const stepResponse = await wizard.showEconomyConfigStep(interaction);
            await interaction.update({
                embeds: stepResponse.embeds,
                components: stepResponse.components
            });
        }
        // Add more configuration button handlers as needed
        else {
            await interaction.reply({ 
                content: '⚙️ This configuration option is still being implemented.', 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
}

module.exports = { SetupInteractionHandler, activeSetups };