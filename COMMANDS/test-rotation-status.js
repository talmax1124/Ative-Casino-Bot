const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { getGuildId, hasAdminRole } = require('../UTILS/common');
const marriageTaskStatus = require('../UTILS/marriageTaskStatus');
const marriageTaskRotation = require('../UTILS/marriageTaskRotation');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-rotation-status')
        .setDescription('Test rotation-aware task status system (Admin only)')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Choose test action')
                .setRequired(true)
                .addChoices(
                    { name: 'Initialize System', value: 'init' },
                    { name: 'View Current Status', value: 'status' },
                    { name: 'Mark Task Complete', value: 'complete' },
                    { name: 'View History', value: 'history' },
                    { name: 'Migrate Legacy Data', value: 'migrate' }
                )
        )
        .addIntegerOption(option =>
            option.setName('task')
                .setDescription('Task number to complete (1-4)')
                .setMinValue(1)
                .setMaxValue(4)
        ),

    async execute(interaction) {
        // Admin only
        if (!(await hasAdminRole(interaction.user.id, interaction.guildId, interaction.guild))) {
            await interaction.reply({
                content: '❌ This command is only available to administrators.',
                ephemeral: true
            });
            return;
        }

        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const action = interaction.options.getString('action');
        const taskNumber = interaction.options.getInteger('task');

        await interaction.deferReply();

        try {
            // Get or create test marriage
            const marriageData = await dbManager.getUserMarriage(userId, guildId);
            let marriage;
            
            if (!marriageData.married) {
                marriage = {
                    id: 'test-marriage-' + userId,
                    partner1_id: userId,
                    partner2_id: 'test-partner',
                    partner1_name: interaction.user.displayName,
                    partner2_name: 'Test Partner'
                };
                logger.info(`Using test marriage for user ${userId}`);
            } else {
                marriage = marriageData.marriage;
            }

            await this.executeAction(interaction, marriage, action, taskNumber);

        } catch (error) {
            logger.error(`Error in test-rotation-status command: ${error.message}`);
            await this.safeReply(interaction, {
                content: `❌ An error occurred: ${error.message}`
            });
        }
    },

    async executeAction(interaction, marriage, action, taskNumber) {
        switch (action) {
            case 'init':
                await this.handleInit(interaction);
                break;
            case 'status':
                await this.handleStatus(interaction, marriage);
                break;
            case 'complete':
                if (!taskNumber) {
                    await interaction.editReply({
                        content: '❌ Please specify a task number (1-4) when using the complete action.'
                    });
                    return;
                }
                await this.handleComplete(interaction, marriage, taskNumber);
                break;
            case 'history':
                await this.handleHistory(interaction, marriage);
                break;
            case 'migrate':
                await this.handleMigrate(interaction);
                break;
        }
    },

    async handleInit(interaction) {
        const success = await marriageTaskStatus.initializeTable();
        
        const embed = new EmbedBuilder()
            .setTitle('🔧 System Initialization')
            .setDescription(
                success 
                    ? '✅ Rotation-aware task status system initialized successfully!'
                    : '❌ Failed to initialize system. Check logs for details.'
            )
            .setColor(success ? 0x00FF00 : 0xFF0000);

        await interaction.editReply({ embeds: [embed] });
    },

    async handleStatus(interaction, marriage) {
        const statusData = await marriageTaskStatus.getTaskStatus(marriage.id);
        const currentRotation = marriageTaskRotation.getCurrentTaskSet();
        
        let statusText = '';
        if (statusData.rotationInfo) {
            statusText += `**Current Rotation:** ${statusData.rotationInfo.rotationName}\n`;
            statusText += `**Rotation Period:** ${statusData.rotationInfo.rotationPeriod}\n`;
            statusText += `**Period Start:** ${statusData.rotationInfo.periodStart.toLocaleDateString()}\n\n`;
        }

        statusText += `**Task Completion Status:**\n`;
        for (let i = 1; i <= 4; i++) {
            const task = statusData.tasks[`task${i}`];
            statusText += `Task ${i}: ${task?.completed ? '✅ Complete' : '⏳ Pending'}`;
            if (task?.completed) {
                statusText += ` (by ${task.completedBy} on ${new Date(task.completedAt).toLocaleString()})`;
            }
            statusText += '\n';
        }

        const embed = new EmbedBuilder()
            .setTitle(`📊 Task Status - ${marriage.partner1_name} & ${marriage.partner2_name}`)
            .setDescription(statusText)
            .setColor(0x2196F3)
            .setFooter({ text: 'Rotation-Aware Task Status System' });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleComplete(interaction, marriage, taskNumber) {
        const success = await marriageTaskStatus.markTaskComplete(
            marriage.id, 
            taskNumber, 
            interaction.user.id, 
            { testData: true, completedAt: new Date().toISOString() }
        );

        const embed = new EmbedBuilder()
            .setTitle('📝 Task Completion Test')
            .setDescription(
                success
                    ? `✅ Successfully marked Task ${taskNumber} as complete for the current rotation!`
                    : `❌ Failed to mark Task ${taskNumber} as complete.`
            )
            .setColor(success ? 0x00FF00 : 0xFF0000);

        await interaction.editReply({ embeds: [embed] });

        if (success) {
            // Show updated status
            setTimeout(async () => {
                await this.handleStatus(interaction, marriage);
            }, 1000);
        }
    },

    async handleHistory(interaction, marriage) {
        const history = await marriageTaskStatus.getTaskHistory(marriage.id);
        
        let historyText = '';
        if (Object.keys(history).length === 0) {
            historyText = 'No task completion history found.';
        } else {
            for (const [rotationKey, rotationData] of Object.entries(history)) {
                historyText += `**${rotationData.rotationName}** (Period ${rotationData.rotationPeriod})\n`;
                historyText += `Started: ${new Date(rotationData.periodStart).toLocaleDateString()}\n`;
                
                const completedTasks = Object.entries(rotationData.tasks)
                    .filter(([_, task]) => task.completed)
                    .map(([taskKey, task]) => {
                        const taskNum = taskKey.replace('task', '');
                        return `Task ${taskNum} ✅`;
                    });
                
                historyText += `Completed: ${completedTasks.length > 0 ? completedTasks.join(', ') : 'None'}\n\n`;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(`📚 Task History - ${marriage.partner1_name} & ${marriage.partner2_name}`)
            .setDescription(historyText)
            .setColor(0x9C27B0)
            .setFooter({ text: 'Complete task completion history across all rotations' });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleMigrate(interaction) {
        const success = await marriageTaskStatus.migrateFromLegacySystem();
        
        const embed = new EmbedBuilder()
            .setTitle('🔄 Legacy Data Migration')
            .setDescription(
                success
                    ? '✅ Successfully migrated legacy task completion data to rotation-aware system!'
                    : '❌ Migration failed. Check logs for details.'
            )
            .setColor(success ? 0x00FF00 : 0xFF0000);

        await interaction.editReply({ embeds: [embed] });
    },

    async safeReply(interaction, options) {
        try {
            if (interaction.deferred) {
                await interaction.editReply(options);
            } else {
                await interaction.reply(options);
            }
        } catch (error) {
            logger.error(`Failed to send reply: ${error.message}`);
        }
    }
};