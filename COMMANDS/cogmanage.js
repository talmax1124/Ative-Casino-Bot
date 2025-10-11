const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cogManager = require('../UTILS/cogManager');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cogmanage')
        .setDescription('🔧 Manage bot cogs (command categories) - enable/disable features')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View the status of all cogs and commands')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable a cog category or specific command')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('What to enable')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Cog Category', value: 'cog' },
                            { name: 'Individual Command', value: 'command' }
                        ))
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Name of the cog or command to enable')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable a cog category or specific command')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('What to disable')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Cog Category', value: 'cog' },
                            { name: 'Individual Command', value: 'command' }
                        ))
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Name of the cog or command to disable')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('panel')
                .setDescription('Open interactive cog management panel')
        ),

    async execute(interaction) {
        // Check if user is authorized to manage cogs
        if (!cogManager.isUserAuthorized(interaction.user.id)) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Access Denied')
                .setDescription('Only authorized users can manage cogs.');
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        try {
            // Initialize cog manager if not already done
            if (!cogManager.initialized) {
                await cogManager.createTables();
                await cogManager.initialize();
            }

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'status':
                    await handleStatus(interaction);
                    break;
                case 'enable':
                    await handleEnable(interaction);
                    break;
                case 'disable':
                    await handleDisable(interaction);
                    break;
                case 'panel':
                    await handlePanel(interaction);
                    break;
            }
        } catch (error) {
            logger.error('Error in cogmanage command:', error);
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while managing cogs. Please try again later.');
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }
    }
};

async function handleStatus(interaction) {
    const status = cogManager.getCogStatus();
    
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🔧 Cog Management Status')
        .setDescription('Current status of all command categories and individual commands')
        .setTimestamp();

    let totalEnabled = 0;
    let totalDisabled = 0;

    for (const [categoryName, categoryStatus] of Object.entries(status)) {
        const statusIcon = categoryStatus.enabled ? '🟢' : '🔴';
        const enabledCommands = categoryStatus.enabledCommands;
        const disabledCommands = categoryStatus.disabledCommands;
        
        totalEnabled += enabledCommands;
        totalDisabled += disabledCommands;

        const fieldValue = [
            `**Status:** ${statusIcon} ${categoryStatus.enabled ? 'Enabled' : 'Disabled'}`,
            `**Commands:** ${enabledCommands}/${categoryStatus.totalCommands} enabled`,
            `**Description:** ${categoryStatus.description}`
        ].join('\n');

        embed.addFields({
            name: `${categoryStatus.name} (${categoryName})`,
            value: fieldValue,
            inline: true
        });
    }

    embed.addFields({
        name: '📊 Summary',
        value: `**Total Commands:** ${totalEnabled + totalDisabled}\n**Enabled:** ${totalEnabled}\n**Disabled:** ${totalDisabled}`,
        inline: false
    });

    await interaction.reply({ embeds: [embed] });
}

async function handleEnable(interaction) {
    const type = interaction.options.getString('type');
    const name = interaction.options.getString('name');

    try {
        if (type === 'cog') {
            if (!cogManager.getCategoryInfo(name)) {
                const availableCategories = cogManager.getCategories().join(', ');
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Invalid Cog')
                    .setDescription(`Cog category \`${name}\` does not exist.\n\n**Available categories:** ${availableCategories}`);
                return await interaction.reply({ embeds: [embed], ephemeral: true });
            }

            await cogManager.enableCog(name);
            const categoryInfo = cogManager.getCategoryInfo(name);
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Cog Enabled')
                .setDescription(`Successfully enabled the **${categoryInfo.name}** cog category.\n\nAll ${categoryInfo.commands.length} commands in this category are now available.`)
                .addFields({
                    name: 'Commands Enabled',
                    value: categoryInfo.commands.map(cmd => `\`${cmd}\``).join(', '),
                    inline: false
                });
            
            await interaction.reply({ embeds: [embed] });
        } else {
            await cogManager.enableCommand(name);
            const category = cogManager.getCommandCategory(name);
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Command Enabled')
                .setDescription(`Successfully enabled the \`${name}\` command.`)
                .addFields({
                    name: 'Category',
                    value: category !== 'uncategorized' ? cogManager.getCategoryInfo(category)?.name || category : 'Uncategorized',
                    inline: true
                });
            
            await interaction.reply({ embeds: [embed] });
        }
    } catch (error) {
        logger.error(`Error enabling ${type}:`, error);
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Error')
            .setDescription(`Failed to enable ${type} \`${name}\`: ${error.message}`);
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

async function handleDisable(interaction) {
    const type = interaction.options.getString('type');
    const name = interaction.options.getString('name');

    try {
        if (type === 'cog') {
            if (!cogManager.getCategoryInfo(name)) {
                const availableCategories = cogManager.getCategories().join(', ');
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Invalid Cog')
                    .setDescription(`Cog category \`${name}\` does not exist.\n\n**Available categories:** ${availableCategories}`);
                return await interaction.reply({ embeds: [embed], ephemeral: true });
            }

            await cogManager.disableCog(name);
            const categoryInfo = cogManager.getCategoryInfo(name);
            
            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('🔴 Cog Disabled')
                .setDescription(`Successfully disabled the **${categoryInfo.name}** cog category.\n\nAll ${categoryInfo.commands.length} commands in this category are now unavailable.`)
                .addFields({
                    name: 'Commands Disabled',
                    value: categoryInfo.commands.map(cmd => `\`${cmd}\``).join(', '),
                    inline: false
                });
            
            await interaction.reply({ embeds: [embed] });
        } else {
            await cogManager.disableCommand(name);
            const category = cogManager.getCommandCategory(name);
            
            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('🔴 Command Disabled')
                .setDescription(`Successfully disabled the \`${name}\` command.`)
                .addFields({
                    name: 'Category',
                    value: category !== 'uncategorized' ? cogManager.getCategoryInfo(category)?.name || category : 'Uncategorized',
                    inline: true
                });
            
            await interaction.reply({ embeds: [embed] });
        }
    } catch (error) {
        logger.error(`Error disabling ${type}:`, error);
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Error')
            .setDescription(`Failed to disable ${type} \`${name}\`: ${error.message}`);
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

async function handlePanel(interaction) {
    const status = cogManager.getCogStatus();
    
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🔧 Interactive Cog Management Panel')
        .setDescription('Use the dropdown menu to select a cog category to manage, or use the buttons for bulk operations.')
        .setTimestamp();

    // Create dropdown for cog selection
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('cog_select')
        .setPlaceholder('Select a cog category to manage...');

    for (const [categoryName, categoryStatus] of Object.entries(status)) {
        const statusIcon = categoryStatus.enabled ? '🟢' : '🔴';
        selectMenu.addOptions({
            label: `${categoryStatus.name}`,
            description: `${statusIcon} ${categoryStatus.enabledCommands}/${categoryStatus.totalCommands} commands enabled`,
            value: categoryName
        });
    }

    // Create action buttons
    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('cog_enable_all')
                .setLabel('Enable All Cogs')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🟢'),
            new ButtonBuilder()
                .setCustomId('cog_disable_all')
                .setLabel('Disable All Cogs')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔴'),
            new ButtonBuilder()
                .setCustomId('cog_refresh')
                .setLabel('Refresh Status')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔄')
        );

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
        embeds: [embed],
        components: [selectRow, buttons],
        ephemeral: true
    });
}