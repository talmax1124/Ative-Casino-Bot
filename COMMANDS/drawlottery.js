/**
 * Manual Lottery Drawing Command - Admin Only
 * Allows administrators to manually trigger lottery drawings for testing or immediate execution
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { sendLogMessage, fmt } = require('../UTILS/common');
const logger = require('../UTILS/logger');

// Developer/Admin IDs
const DEVELOPER_IDS = ['466050111680544798', '1158137066246176808']; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('drawlottery')
        .setDescription('🎟️ [ADMIN] Manually trigger lottery drawing')
        .addStringOption(option =>
            option.setName('confirmation')
                .setDescription('Type "CONFIRM" to proceed with manual drawing')
                .setRequired(true)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const confirmation = interaction.options.getString('confirmation');
        
        try {
            // Check if user is developer/admin
            if (!DEVELOPER_IDS.includes(userId)) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Access Denied')
                    .setDescription('This command is restricted to developers and administrators.')
                    .setColor(0xFF0000)
                    .setTimestamp();
                    
                return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
            
            // Require confirmation to prevent accidental triggers
            if (confirmation.toUpperCase() !== 'CONFIRM') {
                const warningEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Confirmation Required')
                    .setDescription('To manually trigger a lottery drawing, you must type "CONFIRM" in the confirmation field.\n\n**Warning:** This will immediately conduct the lottery drawing and distribute prizes!')
                    .setColor(0xFFAA00)
                    .setTimestamp();
                    
                return await interaction.reply({ embeds: [warningEmbed], flags: MessageFlags.Ephemeral });
            }
            
            await interaction.deferReply();
            
            // Get the lottery system
            const { LotteryGame } = require('../GAMES/lottery');
            const lotterySystem = new LotteryGame(interaction.client);
            
            // Conduct manual drawing
            logger.info(`Manual lottery drawing triggered by ${username} (${userId})`);
            
            const startEmbed = new EmbedBuilder()
                .setTitle('🎟️ Manual Lottery Drawing Started')
                .setDescription('Conducting lottery drawing now...')
                .setColor(0x00D4FF)
                .setTimestamp();
                
            await interaction.editReply({ embeds: [startEmbed] });
            
            // Trigger the drawing
            await lotterySystem.conductWeeklyDrawing();
            
            // Success notification
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Manual Lottery Drawing Complete')
                .setDescription('The lottery drawing has been conducted successfully!\n\nCheck the lottery channel for results and winner announcements.')
                .addFields({
                    name: '📋 Actions Taken',
                    value: '• Winners selected and announced\n• Prizes distributed to winners\n• New lottery week started\n• Database updated with results',
                    inline: false
                })
                .setColor(0x00FF00)
                .setFooter({ text: `Triggered by ${username}` })
                .setTimestamp();
                
            await interaction.editReply({ embeds: [successEmbed] });
            
            // Log the manual trigger
            await sendLogMessage(
                interaction.client,
                'info', 
                `🎟️ Manual lottery drawing completed by ${username} (${userId})`,
                userId,
                interaction.guildId
            );
            
        } catch (error) {
            logger.error(`Manual lottery drawing failed: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Drawing Failed')
                .setDescription(`Failed to conduct lottery drawing: ${error.message}`)
                .setColor(0xFF0000)
                .setTimestamp();
                
            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
            
            // Log the error
            await sendLogMessage(
                interaction.client,
                'error',
                `❌ Manual lottery drawing failed for ${username} (${userId}): ${error.message}`,
                userId,
                interaction.guildId
            );
        }
    }
};