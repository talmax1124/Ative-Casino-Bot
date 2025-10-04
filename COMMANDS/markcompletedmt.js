const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { getGuildId, hasAdminRole } = require('../UTILS/common');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('markcompletedmt')
        .setDescription('Manually mark a marriage task as completed (Admin only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The married user to mark the task for')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('task')
                .setDescription('Which task to mark as completed')
                .setRequired(true)
                .addChoices(
                    { name: 'Task 1: Tic Tac Toe', value: 1 },
                    { name: 'Task 2: Plant a Tree', value: 2 },
                    { name: 'Task 3: Write a Poem', value: 3 },
                    { name: 'Task 4: Quiz Each Other', value: 4 }
                )
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for manual completion')
                .setRequired(false)
        ),

    async execute(interaction) {
        // Check if user has admin role
        if (!(await hasAdminRole(interaction.user.id, interaction.guildId, interaction.guild))) {
            await interaction.reply({
                content: '❌ This command is only available to administrators.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const targetUser = interaction.options.getUser('user');
        const taskNumber = interaction.options.getInteger('task');
        const reason = interaction.options.getString('reason') || 'Manual admin completion';
        const guildId = await getGuildId(interaction);

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // Check if target user is married
            const marriageData = await dbManager.getUserMarriage(targetUser.id, guildId);
            if (!marriageData.married) {
                await interaction.editReply({
                    content: `❌ **${targetUser.displayName}** is not married. Only married users can have marriage tasks.`
                });
                return;
            }

            const marriage = marriageData.marriage;
            const marriageId = marriage.id;

            // Check current task status
            const taskStatusData = await dbManager.getMarriageTaskStatus(marriageId);
            const taskKey = `task${taskNumber}`;
            
            if (taskStatusData.tasks[taskKey]?.completed) {
                await interaction.editReply({
                    content: `❌ Task ${taskNumber} is already completed for **${marriage.partner1_name}** & **${marriage.partner2_name}**.`
                });
                return;
            }

            // Mark task as completed
            await dbManager.completeMarriageTask(marriageId, taskNumber, interaction.user.id, {
                gameType: 'manual_admin',
                reason: reason,
                adminId: interaction.user.id,
                adminName: interaction.user.displayName
            });

            // Award Marriage XP based on task type
            const xpAmounts = { 1: 20, 2: 50, 3: 30, 4: 25 };
            const xpAmount = xpAmounts[taskNumber] || 20;
            
            const xpResult = await dbManager.awardMarriageXP(
                marriageId, 
                xpAmount, 
                'admin_task_completion', 
                `Task ${taskNumber} manually completed by admin: ${reason}`
            );

            // Create success embed
            const embed = new EmbedBuilder()
                .setTitle('✅ Marriage Task Manually Completed')
                .setDescription(`**Task ${taskNumber}** has been marked as completed for the married couple.`)
                .addFields(
                    { name: '👫 Couple', value: `**${marriage.partner1_name}** & **${marriage.partner2_name}**`, inline: true },
                    { name: '📋 Task', value: this.getTaskName(taskNumber), inline: true },
                    { name: '👤 Admin', value: interaction.user.displayName, inline: true },
                    { name: '📝 Reason', value: reason, inline: false },
                    { name: '🎯 XP Awarded', value: `+${xpAmount} XP`, inline: true }
                )
                .setColor(0x00FF00)
                .setTimestamp();

            if (xpResult.leveledUp) {
                embed.addFields({
                    name: '🎉 Level Up!',
                    value: `Marriage leveled up from **${xpResult.oldLevel}** to **${xpResult.newLevel}**!`,
                    inline: false
                });
            }

            await interaction.editReply({
                embeds: [embed]
            });

            // Log the admin action
            logger.info(`Admin ${interaction.user.displayName} (${interaction.user.id}) manually completed task ${taskNumber} for marriage ${marriageId}. Reason: ${reason}`);

        } catch (error) {
            logger.error(`Error in markcompletedmt command: ${error.message}`);
            await interaction.editReply({
                content: '❌ An error occurred while marking the task as completed. Please check the logs and try again.'
            });
        }
    },

    getTaskName(taskNumber) {
        const taskNames = {
            1: 'Task 1: Tic Tac Toe',
            2: 'Task 2: Plant a Tree',
            3: 'Task 3: Write a Poem',
            4: 'Task 4: Quiz Each Other'
        };
        return taskNames[taskNumber] || `Task ${taskNumber}`;
    }
};