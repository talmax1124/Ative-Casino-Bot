/**
 * Stop My Session - cancels the caller's active session (if any) with refund when applicable
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const sessionManager = require('../UTILS/sessionManager');
const { getGuildId, fmt, sendLogMessage } = require('../UTILS/common');
const logger = require('../UTILS/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stopmysession')
    .setDescription('Cancel your current active game session and refund your bet (if any).'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const username = interaction.user.displayName;
    const guildId = await getGuildId(interaction);

    try {
      // Find caller's active session
      const active = sessionManager.getUserActiveSession(userId);
      if (!active) {
        return await interaction.reply({
          embeds: [new EmbedBuilder().setTitle('🎮 No Active Session').setDescription('You do not have any active game session to stop.').setColor(0x0099FF)],
          ephemeral: true
        });
      }

      // Show confirmation modal
      const modal = new ModalBuilder()
        .setCustomId(`stopmysession_confirm:${active.sessionId}`)
        .setTitle('Confirm Stop Session');

      const confirmInput = new TextInputBuilder()
        .setCustomId('confirm_text')
        .setLabel('Type STOP to confirm cancellation')
        .setStyle(TextInputStyle.Short)
        .setMinLength(2)
        .setMaxLength(10)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(confirmInput);
      modal.addComponents(row);
      await interaction.showModal(modal);

    } catch (error) {
      logger.error(`stopmysession failed: ${error.message}`);
      const embed = new EmbedBuilder()
        .setTitle('❌ Error')
        .setDescription('Failed to stop your session. Please try again in a moment.')
        .setColor(0xFF0000);
      try { await interaction.reply({ embeds: [embed], ephemeral: true }); } catch (_) {}
    }
  },

  /**
   * Handle confirmation modal submission
   */
  async handleConfirmModal(interaction) {
    try {
      if (!interaction.customId.startsWith('stopmysession_confirm')) return;
      const userId = interaction.user.id;
      const username = interaction.user.displayName;
      const guildId = await getGuildId(interaction);
      const text = interaction.fields.getTextInputValue('confirm_text') || '';
      if (text.trim().toUpperCase() !== 'STOP') {
        return await interaction.reply({ content: '❌ Confirmation failed. Type STOP to confirm.', ephemeral: true });
      }
      const parts = interaction.customId.split(':');
      const sessionId = parts[1];
      const session = sessionManager.getSession(sessionId) || sessionManager.getUserActiveSession(userId);
      if (!session) {
        return await interaction.reply({ content: 'ℹ️ No active session found to stop.', ephemeral: true });
      }
      await sessionManager.cancelSession(session.sessionId, 'User confirmed stop via modal', true);
      const refunded = session.betAmount > 0 ? fmt(session.betAmount) : '$0.00';
      const embed = new EmbedBuilder()
        .setTitle('🛑 Session Stopped')
        .addFields({ name: 'Game', value: session.gameType || 'unknown', inline: true }, { name: 'Refunded', value: refunded, inline: true })
        .setColor(0x00FF00)
        .setFooter({ text: 'You can start a new game now.' });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      try {
        await sendLogMessage(
          interaction.client,
          'warn',
          `User ${username} (\`${userId}\`) cancelled session ${session.sessionId} (${session.gameType}) via confirmation modal. Refunded: ${refunded}.`,
          userId,
          guildId
        );
      } catch (_) {}
      logger.info(`Stopped session ${session.sessionId} (${session.gameType}) for ${username} (${userId}) via modal`);
    } catch (error) {
      logger.error(`stopmysession confirm modal error: ${error.message}`);
      try { await interaction.reply({ content: '❌ Failed to stop session.', ephemeral: true }); } catch (_) {}
    }
  }
};
