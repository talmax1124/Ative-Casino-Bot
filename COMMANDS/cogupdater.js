const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cogManager = require('../UTILS/cogManager');
const cogUpdater = require('../UTILS/cogUpdater');
const cogFileMapper = require('../UTILS/cogFileMapper');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cogupdater')
        .setDescription('🔄 Update bot cogs and commands from GitHub repository')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('📊 View updater status and available backups')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('⬇️ Update a cog category or individual command from GitHub')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('What to update')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Cog Category', value: 'cog' },
                            { name: 'Individual Command', value: 'command' }
                        ))
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Name of the cog or command to update')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('rollback')
                .setDescription('↩️ Rollback to a previous backup')
                .addStringOption(option =>
                    option.setName('backup')
                        .setDescription('Backup to rollback to')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('panel')
                .setDescription('🎛️ Open interactive update management panel')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cleanup')
                .setDescription('🧹 Clean old backups and reset file cache')
        ),

    async execute(interaction) {
        // Check if user is authorized to update cogs
        if (!cogManager.isUserAuthorized(interaction.user.id)) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Access Denied')
                .setDescription('Only authorized users can update cogs.');
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        try {
            // Initialize systems if needed
            if (!cogManager.initialized) {
                await cogManager.createTables();
                await cogManager.initialize();
            }

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'status':
                    await handleStatus(interaction);
                    break;
                case 'update':
                    await handleUpdate(interaction);
                    break;
                case 'rollback':
                    await handleRollback(interaction);
                    break;
                case 'panel':
                    await handlePanel(interaction);
                    break;
                case 'cleanup':
                    await handleCleanup(interaction);
                    break;
            }
        } catch (error) {
            logger.error('Error in cogupdater command:', error);
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing the update request.');
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        }
    },

    async autocomplete(interaction) {
        try {
            const focusedOption = interaction.options.getFocused(true);
            const subcommand = interaction.options.getSubcommand();
            
            if (subcommand === 'update' && focusedOption.name === 'name') {
                const typeOption = interaction.options.getString('type');
                const focused = focusedOption.value.toLowerCase();
                
                const items = await cogFileMapper.getUpdateableItems(cogManager);
                let choices = [];
                
                if (typeOption === 'cog') {
                    choices = items.filter(item => item.type === 'cog');
                } else if (typeOption === 'command') {
                    choices = items.filter(item => item.type === 'command');
                } else {
                    choices = items; // Show all if type not selected
                }
                
                // Filter by user input
                const filtered = choices.filter(choice => 
                    choice.name.toLowerCase().includes(focused) || 
                    choice.value.toLowerCase().includes(focused)
                ).slice(0, 25);
                
                await interaction.respond(filtered.map(choice => ({
                    name: choice.name,
                    value: choice.value
                })));
            }
            else if (subcommand === 'rollback' && focusedOption.name === 'backup') {
                const focused = focusedOption.value.toLowerCase();
                const backups = await cogUpdater.getAvailableBackups();
                
                const choices = backups.map(backup => {
                    let ageText = 'Unknown age';
                    if (backup.age && !isNaN(backup.age)) {
                        const age = Math.round(backup.age / (1000 * 60)); // minutes
                        ageText = age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`;
                    }
                    
                    return {
                        name: `${backup.name} (${backup.fileCount} files, ${ageText})`,
                        value: backup.path
                    };
                });
                
                const filtered = choices.filter(choice => 
                    choice.name.toLowerCase().includes(focused)
                ).slice(0, 25);
                
                await interaction.respond(filtered);
            }
        } catch (error) {
            logger.error('Error in cogupdater autocomplete:', error);
            await interaction.respond([]);
        }
    }
};

async function handleStatus(interaction) {
    const updaterStatus = cogUpdater.getStatus();
    const backups = await cogUpdater.getAvailableBackups();
    const cacheStats = cogFileMapper.getCacheStats();
    
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('📊 Cog Updater Status')
        .setDescription('Current status of the cog update system')
        .addFields(
            {
                name: '🔄 Updater Status',
                value: [
                    `**Active:** ${updaterStatus.isUpdating ? '🟡 Updating...' : '🟢 Ready'}`,
                    `**Queue:** ${updaterStatus.queueSize} pending`,
                    `**Repository:** ${updaterStatus.githubRepo}`,
                    `**Branch:** ${updaterStatus.githubBranch}`,
                    `**Auth:** ${updaterStatus.hasGithubToken ? `🔑 Token (${updaterStatus.tokenSource})` : '❌ No Token'}`
                ].join('\n'),
                inline: true
            },
            {
                name: '📁 File Cache',
                value: [
                    `**Files Cached:** ${cacheStats.fileCount}`,
                    `**Last Scan:** ${cacheStats.lastScan ? new Date(cacheStats.lastScan).toLocaleTimeString() : 'Never'}`,
                    `**Cache Age:** ${cacheStats.cacheAge ? Math.round(cacheStats.cacheAge / 1000 / 60) + 'm' : 'N/A'}`
                ].join('\n'),
                inline: true
            },
            {
                name: '💾 Backups',
                value: [
                    `**Available:** ${backups.length}`,
                    `**Latest:** ${backups.length > 0 ? backups[0].name : 'None'}`,
                    `**Directory:** ${updaterStatus.backupDir}`
                ].join('\n'),
                inline: true
            }
        )
        .setTimestamp();

    if (backups.length > 0) {
        const recentBackups = backups.slice(0, 5).map(backup => {
            let ageText = 'Unknown age';
            if (backup.age && !isNaN(backup.age)) {
                const age = Math.round(backup.age / (1000 * 60));
                ageText = age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`;
            }
            return `• ${backup.name} (${backup.fileCount} files, ${ageText})`;
        }).join('\n');
        
        embed.addFields({
            name: '📋 Recent Backups',
            value: recentBackups,
            inline: false
        });
    }

    await interaction.reply({ embeds: [embed] });
}

async function handleUpdate(interaction) {
    const type = interaction.options.getString('type');
    const name = interaction.options.getString('name');

    // Validate the name exists
    if (type === 'cog') {
        const categoryInfo = cogManager.getCategoryInfo(name);
        if (!categoryInfo) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Invalid Cog')
                .setDescription(`Cog category '${name}' does not exist.`);
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }

    // Start the update process
    const loadingEmbed = new EmbedBuilder()
        .setColor('#ffff00')
        .setTitle('🔄 Starting Update')
        .setDescription(`Preparing to update ${type} \`${name}\` from GitHub...\n\n⏳ This may take a few moments.`)
        .addFields({
            name: '📋 Process',
            value: [
                '🔍 Discovering files...',
                '💾 Creating backup...',
                '⬇️ Downloading from GitHub...',
                '🔄 Reloading commands...'
            ].join('\n'),
            inline: false
        });

    await interaction.reply({ embeds: [loadingEmbed] });

    try {
        let progressStep = 0;
        const progressCallback = async (progress) => {
            progressStep++;
            try {
                const progressEmbed = new EmbedBuilder()
                    .setColor('#ffff00')
                    .setTitle('🔄 Updating...')
                    .setDescription(`${progress.message}\n\n**Phase:** ${progress.phase}`)
                    .addFields({
                        name: '📊 Progress',
                        value: progress.progress ? `${progress.progress}%` : 'Processing...',
                        inline: true
                    });

                await interaction.editReply({ embeds: [progressEmbed] });
            } catch (error) {
                // Ignore edit errors during rapid updates
            }
        };

        const result = await cogUpdater.updateCogOrCommand(
            name, 
            type, 
            cogManager, 
            interaction.client,
            progressCallback
        );

        // Final result
        const finalEmbed = new EmbedBuilder()
            .setColor(result.success ? '#00ff00' : '#ff9900')
            .setTitle(`🔄 Update ${result.success ? 'Complete' : 'Partial'}`)
            .setDescription(`Update of ${type} \`${name}\` ${result.success ? 'completed successfully' : 'completed with some failures'}.`)
            .addFields(
                { name: '✅ Success', value: result.successCount.toString(), inline: true },
                { name: '❌ Failed', value: result.failCount.toString(), inline: true },
                { name: '📁 Total Files', value: result.totalFiles.toString(), inline: true }
            );

        if (result.hasBackup) {
            finalEmbed.addFields({
                name: '💾 Backup',
                value: `Created backup: \`${result.backupInfo.name}\`\nUse \`/cogupdater rollback\` if needed.`,
                inline: false
            });
        }

        if (result.failCount > 0) {
            const failures = result.results
                .filter(r => !r.success)
                .map(r => `• ${r.file}: ${r.error}`)
                .slice(0, 5)
                .join('\n');
            
            finalEmbed.addFields({
                name: '⚠️ Failures',
                value: failures + (result.failCount > 5 ? `\n... and ${result.failCount - 5} more` : ''),
                inline: false
            });
        }

        finalEmbed.setTimestamp();
        await interaction.editReply({ embeds: [finalEmbed] });

    } catch (error) {
        logger.error(`Update failed for ${type} '${name}':`, error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Update Failed')
            .setDescription(`Failed to update ${type} \`${name}\`: ${error.message}`)
            .addFields({
                name: '🔧 Troubleshooting',
                value: [
                    '• Check if the files exist on GitHub',
                    '• Verify internet connectivity',
                    '• Try updating individual files',
                    '• Check the logs for detailed errors'
                ].join('\n'),
                inline: false
            });

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleRollback(interaction) {
    const backupPath = interaction.options.getString('backup');

    const loadingEmbed = new EmbedBuilder()
        .setColor('#ffff00')
        .setTitle('↩️ Starting Rollback')
        .setDescription('Restoring files from backup...');

    await interaction.reply({ embeds: [loadingEmbed] });

    try {
        const result = await cogUpdater.rollbackFromBackup(backupPath);

        if (result.success) {
            const successCount = result.results.filter(r => r.success).length;
            const failCount = result.results.filter(r => !r.success).length;

            const embed = new EmbedBuilder()
                .setColor(failCount === 0 ? '#00ff00' : '#ff9900')
                .setTitle('↩️ Rollback Complete')
                .setDescription(`Rollback of \`${result.metadata.name}\` completed.`)
                .addFields(
                    { name: '✅ Restored', value: successCount.toString(), inline: true },
                    { name: '❌ Failed', value: failCount.toString(), inline: true },
                    { name: '📁 Total Files', value: result.results.length.toString(), inline: true }
                );

            if (failCount > 0) {
                const failures = result.results
                    .filter(r => !r.success)
                    .map(r => `• ${r.file}: ${r.error}`)
                    .slice(0, 3)
                    .join('\n');
                
                embed.addFields({
                    name: '⚠️ Restore Failures',
                    value: failures,
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });
        } else {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Rollback Failed')
                .setDescription(`Failed to rollback: ${result.error}`);

            await interaction.editReply({ embeds: [errorEmbed] });
        }

    } catch (error) {
        logger.error('Rollback failed:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Rollback Error')
            .setDescription(`An error occurred during rollback: ${error.message}`);

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handlePanel(interaction) {
    const summary = await cogFileMapper.getCogSummary(cogManager);
    
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🎛️ Interactive Cog Update Panel')
        .setDescription('Select a cog category to update, or use the action buttons below.')
        .setTimestamp();

    // Create dropdown for cog selection
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('update_cog_select')
        .setPlaceholder('Select a cog category to update...');

    for (const [categoryName, categoryInfo] of Object.entries(summary)) {
        selectMenu.addOptions({
            label: `${categoryInfo.name}`,
            description: `${categoryInfo.fileCount} files, ${categoryInfo.commandCount} commands`,
            value: categoryName
        });
    }

    // Create action buttons
    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('update_show_backups')
                .setLabel('View Backups')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('💾'),
            new ButtonBuilder()
                .setCustomId('update_cleanup')
                .setLabel('Clean Backups')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🧹'),
            new ButtonBuilder()
                .setCustomId('update_refresh')
                .setLabel('Refresh Panel')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔄')
        );

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
        embeds: [embed],
        components: [selectRow, buttons],
        flags: MessageFlags.Ephemeral
    });
}

async function handleCleanup(interaction) {
    const loadingEmbed = new EmbedBuilder()
        .setColor('#ffff00')
        .setTitle('🧹 Cleaning Up')
        .setDescription('Cleaning old backups and clearing file cache...');

    await interaction.reply({ embeds: [loadingEmbed] });

    try {
        const cleaned = await cogUpdater.cleanOldBackups();
        cogFileMapper.clearCache();

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🧹 Cleanup Complete')
            .setDescription('System cleanup completed successfully.')
            .addFields(
                { name: '🗑️ Backups Cleaned', value: cleaned.toString(), inline: true },
                { name: '📁 File Cache', value: 'Cleared', inline: true }
            );

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        logger.error('Cleanup failed:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Cleanup Failed')
            .setDescription(`An error occurred during cleanup: ${error.message}`);

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}