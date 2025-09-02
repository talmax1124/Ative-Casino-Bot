const { SlashCommandBuilder, PermissionFlagsBits, InteractionResponseFlags } = require('discord.js');
const dbManager = require('../../UTILS/database');
const logger = require('../../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('raidmode')
        .setDescription('Toggle raid mode protection')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Enable or disable raid mode')
                .addChoices(
                    { name: 'Enable', value: 'enable' },
                    { name: 'Disable', value: 'disable' },
                    { name: 'Status', value: 'status' }
                )
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            const action = interaction.options.getString('action');
            const guildId = interaction.guild.id;

            // Get current server config
            let config = await dbManager.getServerConfig(guildId);
            if (!config || !config.security) {
                // Initialize with default security settings
                const defaultConfig = {
                    anti_spam_enabled: true,
                    anti_raid_enabled: true,
                    raid_mode: false,
                    sleep_mode: false,
                    settings: {}
                };
                await dbManager.updateServerConfig(guildId, defaultConfig);
                config = { security: defaultConfig };
            }
            
            // Parse security config if it's a string
            if (typeof config.security === 'string') {
                config.security = JSON.parse(config.security);
            }

            if (action === 'status') {
                const statusEmoji = config.security.raid_mode ? '🔴' : '🟢';
                const status = config.security.raid_mode ? 'ENABLED' : 'DISABLED';
                
                return await interaction.reply({
                    content: `${statusEmoji} **Raid Mode Status:** ${status}\n\n${config.security.raid_mode ? 
                        '⚠️ Server is in raid protection mode. New members are automatically monitored.' : 
                        '✅ Normal operation mode.'}`
                });
            }

            const enable = action === 'enable';
            config.security.raid_mode = enable;

            // Update configuration  
            await dbManager.updateServerConfig(guildId, {
                anti_spam_enabled: config.security.anti_spam_enabled,
                anti_raid_enabled: config.security.anti_raid_enabled,
                raid_mode: enable,
                sleep_mode: config.security.sleep_mode,
                settings: config.security.settings || {}
            });

            // Update anti-raid system
            if (enable) {
                interaction.client.antiRaid.enableRaidMode(guildId);
            } else {
                interaction.client.antiRaid.disableRaidMode(guildId);
            }

            // Log the action
            await dbManager.logModerationAction(
                guildId,
                interaction.user.id,
                'server',
                enable ? 'raidmode_enable' : 'raidmode_disable',
                `Raid mode ${enable ? 'enabled' : 'disabled'}`
            );

            const emoji = enable ? '🔴' : '🟢';
            const status = enable ? 'ENABLED' : 'DISABLED';
            const description = enable ? 
                '⚠️ Enhanced security measures are now active. New members will be monitored for suspicious activity.' :
                '✅ Raid mode disabled. Normal security measures resumed.';

            await interaction.reply({
                content: `${emoji} **Raid Mode ${status}**\n\n${description}`,
                ephemeral: false
            });

            logger.info(`Raid mode ${enable ? 'enabled' : 'disabled'} by ${interaction.user.username} (${interaction.user.id})`);

        } catch (error) {
            logger.error('Error in raidmode command:', error);
            
            await interaction.reply({
                content: '❌ An error occurred while toggling raid mode.',
                flags: InteractionResponseFlags.Ephemeral
            });
        }
    }
};