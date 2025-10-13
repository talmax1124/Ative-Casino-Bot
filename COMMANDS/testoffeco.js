/**
 * Test Off Economy Command - For debugging off-economy detection
 */

const { SlashCommandBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('testoffeco')
        .setDescription('Test off-economy detection (Debug only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to check/toggle')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action to perform')
                .setRequired(false)
                .addChoices(
                    { name: 'Check Status', value: 'check' },
                    { name: 'Set Off Economy', value: 'set_off' },
                    { name: 'Set On Economy', value: 'set_on' }
                )
        ),

    async execute(interaction) {
        try {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const action = interaction.options.getString('action') || 'check';
            
            await interaction.deferReply({ ephemeral: true });

            if (action === 'check') {
                // Check current status
                const balance = await dbManager.getUserBalance(targetUser.id);
                
                await interaction.editReply({
                    content: `**Off-Economy Debug Info for ${targetUser.displayName}:**\n` +
                            `• User ID: \`${targetUser.id}\`\n` +
                            `• Off Economy: \`${balance.off_economy}\` (type: ${typeof balance.off_economy})\n` +
                            `• Wallet: ${balance.wallet}\n` +
                            `• Bank: ${balance.bank}`
                });
                
            } else if (action === 'set_off') {
                // Set user off economy
                await dbManager.databaseAdapter.toggleOffEconomy(targetUser.id, true);
                
                // Check the result
                const newBalance = await dbManager.getUserBalance(targetUser.id);
                
                await interaction.editReply({
                    content: `**Set ${targetUser.displayName} to OFF ECONOMY**\n` +
                            `• Result: \`${newBalance.off_economy}\` (should be 1 or true)\n` +
                            `• Status: ${newBalance.off_economy ? '✅ OFF ECONOMY' : '❌ Still ON ECONOMY'}`
                });
                
            } else if (action === 'set_on') {
                // Set user on economy
                await dbManager.databaseAdapter.toggleOffEconomy(targetUser.id, false);
                
                // Check the result
                const newBalance = await dbManager.getUserBalance(targetUser.id);
                
                await interaction.editReply({
                    content: `**Set ${targetUser.displayName} to ON ECONOMY**\n` +
                            `• Result: \`${newBalance.off_economy}\` (should be 0 or false)\n` +
                            `• Status: ${newBalance.off_economy ? '❌ Still OFF ECONOMY' : '✅ ON ECONOMY'}`
                });
            }

        } catch (error) {
            logger.error(`Error in testoffeco command: ${error.message}`);
            
            const errorMessage = `❌ **Error:** ${error.message}`;
            
            try {
                if (interaction.deferred) {
                    await interaction.editReply({ content: errorMessage });
                } else {
                    await interaction.reply({ content: errorMessage, ephemeral: true });
                }
            } catch (replyError) {
                logger.error(`Failed to send testoffeco error reply: ${replyError.message}`);
            }
        }
    }
};