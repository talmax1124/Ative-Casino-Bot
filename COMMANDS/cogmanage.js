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
                        .setAutocomplete(true)
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
                        .setAutocomplete(true)
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
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        try {
            // Initialize cog manager if not already done
            if (!cogManager.initialized) {
                await cogManager.createTables();
                await cogManager.initialize();
            }

            const subcommand = interaction.options.getSubcommand();

            // Safety: block cog modifications/panels if any active game sessions exist
            if (subcommand !== 'status' && subcommand !== 'panel') {
                try {
                    const sessionManager = require('../UTILS/sessionManager');
                    const activeCount = sessionManager.getActiveSessionCount ? sessionManager.getActiveSessionCount() : 0;
                    if (activeCount > 0) {
                        const warnEmbed = new EmbedBuilder()
                            .setColor('#ff9900')
                            .setTitle('⏸️ Cog Actions Blocked')
                            .setDescription(`There are currently **${activeCount}** active game session(s). Please end all sessions before changing cogs.`)
                            .addFields({ name: 'How to proceed', value: 'Use `/stopmysession` or `/stopgame` to end sessions, or wait for games to finish.' });
                        return await interaction.reply({ embeds: [warnEmbed], flags: MessageFlags.Ephemeral });
                    }
                } catch (_) { /* ignore guard failure */ }
            }

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
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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
                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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
                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
}

async function handlePanel(interaction) {
    const status = cogManager.getCogStatus();
    const sessionManager = require('../UTILS/sessionManager');
    const activeCount = sessionManager.getActiveSessionCount ? sessionManager.getActiveSessionCount() : 0;
    
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🔧 Interactive Cog Management Panel')
        .setDescription(activeCount > 0
            ? `⏸️ ${activeCount} active game session(s) detected. End all sessions to manage cogs.`
            : 'Use the dropdown menu to select a cog category to manage, or use the buttons for bulk operations.'
        )
        .setTimestamp();

    // Create dropdown for cog selection (hidden when sessions active)
    let selectRow = null;
    if (activeCount === 0) {
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
        selectRow = new ActionRowBuilder().addComponents(selectMenu);
    }

    // Create action buttons
    const buttons = new ActionRowBuilder();

    if (activeCount === 0) {
        buttons.addComponents(
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
                .setEmoji('🔄'),
            new ButtonBuilder()
                .setCustomId('cog_end_sessions')
                .setLabel('Force End All Sessions')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('⏹️')
        );
    } else {
        // Restricted action set when sessions are active
        buttons.addComponents(
            new ButtonBuilder()
                .setCustomId('cog_end_sessions')
                .setLabel('Force End All Sessions')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('⏹️'),
            new ButtonBuilder()
                .setCustomId('cog_refresh')
                .setLabel('Refresh Status')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔄')
        );
    }

    const components = selectRow ? [selectRow, buttons] : [buttons];

    await interaction.reply({
        embeds: [embed],
        components,
        flags: MessageFlags.Ephemeral
    });
}

module.exports.autocomplete = async function(interaction) {
    try {
        const focusedOption = interaction.options.getFocused(true);
        const subcommand = interaction.options.getSubcommand();
        
        // Only provide autocomplete for the 'name' field in enable/disable subcommands
        if ((subcommand === 'enable' || subcommand === 'disable') && focusedOption.name === 'name') {
            const typeOption = interaction.options.getString('type');
            const focused = focusedOption.value.toLowerCase();
            
            let choices = [];
            
            if (typeOption === 'cog') {
                // Show cog categories
                const categories = cogManager.getCategories();
                choices = categories.map(category => {
                    const categoryInfo = cogManager.getCategoryInfo(category);
                    return {
                        name: `${categoryInfo.name} (${category})`,
                        value: category
                    };
                });
            } else if (typeOption === 'command') {
                // Show all available commands from all categories
                const allCommands = [];
                const categories = cogManager.getCategories();
                
                for (const category of categories) {
                    const categoryInfo = cogManager.getCategoryInfo(category);
                    for (const command of categoryInfo.commands) {
                        allCommands.push({
                            name: `${command} (${categoryInfo.name})`,
                            value: command
                        });
                    }
                }
                choices = allCommands;
            } else {
                // If type not selected yet, show both categories and commands
                const categories = cogManager.getCategories();
                choices = [
                    ...categories.map(category => {
                        const categoryInfo = cogManager.getCategoryInfo(category);
                        return {
                            name: `📁 ${categoryInfo.name} (${category})`,
                            value: category
                        };
                    }),
                    // Add some popular commands as examples
                    { name: '🎮 blackjack (Games)', value: 'blackjack' },
                    { name: '🎮 slots (Games)', value: 'slots' },
                    { name: '💰 balance (Economy)', value: 'balance' },
                    { name: '💼 work (Earn Commands)', value: 'work' },
                    { name: '🛠️ help (Utility)', value: 'help' }
                ];
            }
            
            // Filter choices based on user input
            const filtered = choices.filter(choice => 
                choice.name.toLowerCase().includes(focused) || 
                choice.value.toLowerCase().includes(focused)
            ).slice(0, 25); // Discord limit is 25 choices
            
            await interaction.respond(filtered);
        }
    } catch (error) {
        logger.error('Error in cogmanage autocomplete:', error);
        await interaction.respond([]);
    }
};
