/**
 * ButtonUtility - Comprehensive button handling utility to prevent "This Interaction Failed" messages
 * Provides standardized button creation, interaction handling, and error recovery
 */

const { 
    ButtonBuilder, 
    ButtonStyle, 
    ActionRowBuilder, 
    ComponentType,
    InteractionType,
    MessageFlags 
} = require('discord.js');
const logger = require('./logger');

class ButtonUtility {
    constructor() {
        this.activeCollectors = new Map();
        this.interactionStates = new Map();
        this.defaultTimeout = 60000; // 1 minute default
        this.maxRetries = 3;
    }

    /**
     * Create a button with automatic interaction handling
     * @param {Object} config Button configuration
     * @returns {ButtonBuilder} Configured button
     */
    createButton(config) {
        const {
            customId,
            label,
            style = ButtonStyle.Primary,
            emoji = null,
            disabled = false,
            url = null
        } = config;

        const button = new ButtonBuilder()
            .setCustomId(customId)
            .setLabel(label)
            .setStyle(style)
            .setDisabled(disabled);

        if (emoji) button.setEmoji(emoji);
        if (url && style === ButtonStyle.Link) button.setURL(url);

        return button;
    }

    /**
     * Create multiple buttons in an action row
     * @param {Array} buttons Array of button configs
     * @returns {ActionRowBuilder} Action row with buttons
     */
    createButtonRow(buttons) {
        const row = new ActionRowBuilder();
        const buttonComponents = buttons.map(config => this.createButton(config));
        row.addComponents(...buttonComponents);
        return row;
    }

    /**
     * Handle button interaction with automatic defer and error handling
     * @param {Interaction} interaction The button interaction
     * @param {Function} handler The handler function
     * @param {Object} options Additional options
     */
    async handleInteraction(interaction, handler, options = {}) {
        const {
            defer = true,
            ephemeral = false,
            updateMessage = true,
            timeout = this.defaultTimeout,
            errorMessage = '❌ An error occurred processing your request.'
        } = options;

        try {
            // Store interaction state
            this.interactionStates.set(interaction.id, {
                deferred: false,
                replied: false,
                updated: false
            });

            const state = this.interactionStates.get(interaction.id);

            // Defer the interaction if needed
            if (defer && !interaction.deferred && !interaction.replied) {
                if (updateMessage) {
                    await interaction.deferUpdate();
                } else {
                    await interaction.deferReply({ ephemeral });
                }
                state.deferred = true;
            }

            // Execute the handler with retry logic
            let attempts = 0;
            let lastError;

            while (attempts < this.maxRetries) {
                try {
                    const result = await handler(interaction);
                    
                    // Clean up state
                    this.interactionStates.delete(interaction.id);
                    
                    return result;
                } catch (error) {
                    lastError = error;
                    attempts++;
                    
                    if (attempts < this.maxRetries) {
                        logger.warn(`Button handler attempt ${attempts} failed, retrying...`, error);
                        await this.wait(1000 * attempts); // Exponential backoff
                    }
                }
            }

            // If all retries failed
            throw lastError;

        } catch (error) {
            logger.error('Button interaction error:', error);
            
            // Attempt to respond with error message
            await this.safeReply(interaction, {
                content: errorMessage,
                flags: MessageFlags.Ephemeral
            });

            // Clean up state
            this.interactionStates.delete(interaction.id);
            
            throw error;
        }
    }

    /**
     * Setup a button collector with automatic cleanup
     * @param {Message} message The message with buttons
     * @param {Object} options Collector options
     * @returns {InteractionCollector} The collector instance
     */
    setupCollector(message, options = {}) {
        const {
            filter = () => true,
            time = this.defaultTimeout,
            max = null,
            onCollect = null,
            onEnd = null,
            componentType = ComponentType.Button
        } = options;

        // Create the collector
        const collector = message.createMessageComponentCollector({
            filter,
            time,
            max,
            componentType
        });

        // Store collector reference
        this.activeCollectors.set(message.id, collector);

        // Handle collection
        collector.on('collect', async (interaction) => {
            try {
                if (onCollect) {
                    await this.handleInteraction(interaction, onCollect, {
                        defer: true,
                        updateMessage: true
                    });
                }
            } catch (error) {
                logger.error('Collector error:', error);
            }
        });

        // Handle end
        collector.on('end', (collected, reason) => {
            this.activeCollectors.delete(message.id);
            
            if (onEnd) {
                onEnd(collected, reason);
            }

            // Disable buttons on timeout
            if (reason === 'time' && message.editable) {
                this.disableButtons(message).catch(err => 
                    logger.error('Failed to disable buttons:', err)
                );
            }
        });

        return collector;
    }

    /**
     * Safely reply to an interaction
     * @param {Interaction} interaction The interaction
     * @param {Object} data Reply data
     */
    async safeReply(interaction, data) {
        try {
            const state = this.interactionStates.get(interaction.id) || {};

            if (interaction.replied || state.replied) {
                return await interaction.followUp(data);
            } else if (interaction.deferred || state.deferred) {
                return await interaction.editReply(data);
            } else {
                if (data.update) {
                    return await interaction.update(data);
                } else {
                    return await interaction.reply(data);
                }
            }
        } catch (error) {
            logger.error('Safe reply failed:', error);
            
            // Last resort - try follow up
            try {
                return await interaction.followUp({ ...data, flags: MessageFlags.Ephemeral });
            } catch (followUpError) {
                logger.error('Follow up also failed:', followUpError);
            }
        }
    }

    /**
     * Disable all buttons in a message
     * @param {Message} message The message to update
     */
    async disableButtons(message) {
        try {
            // Check if message is valid and editable
            if (!message || !message.editable || !message.components) {
                logger.debug('Message is not editable or has no components, skipping button disable');
                return;
            }

            const components = message.components.map(row => {
                const newRow = new ActionRowBuilder();
                const disabledComponents = row.components.map(component => {
                    if (component.type === ComponentType.Button) {
                        return ButtonBuilder.from(component).setDisabled(true);
                    }
                    return component;
                });
                newRow.addComponents(...disabledComponents);
                return newRow;
            });

            await message.edit({ components });
        } catch (error) {
            logger.debug(`Failed to disable buttons (non-critical): ${error.message}`);
        }
    }

    /**
     * Create a pagination system
     * @param {Array} pages Array of embeds or content
     * @param {Object} options Pagination options
     */
    createPagination(pages, options = {}) {
        const {
            buttonLabels = { prev: '◀', next: '▶', close: '✖' },
            timeout = 120000,
            ephemeral = false
        } = options;

        let currentPage = 0;

        const getButtons = () => {
            return this.createButtonRow([
                {
                    customId: 'prev',
                    label: buttonLabels.prev,
                    style: ButtonStyle.Secondary,
                    disabled: currentPage === 0
                },
                {
                    customId: 'close',
                    label: buttonLabels.close,
                    style: ButtonStyle.Danger
                },
                {
                    customId: 'next',
                    label: buttonLabels.next,
                    style: ButtonStyle.Secondary,
                    disabled: currentPage === pages.length - 1
                }
            ]);
        };

        const getPage = () => {
            const page = pages[currentPage];
            if (typeof page === 'string') {
                return { content: page, components: [getButtons()] };
            } else {
                return { embeds: [page], components: [getButtons()] };
            }
        };

        return {
            getPage,
            handleInteraction: async (interaction) => {
                await this.handleInteraction(interaction, async (i) => {
                    if (i.customId === 'prev' && currentPage > 0) {
                        currentPage--;
                        await i.update(getPage());
                    } else if (i.customId === 'next' && currentPage < pages.length - 1) {
                        currentPage++;
                        await i.update(getPage());
                    } else if (i.customId === 'close') {
                        await i.update({ content: '✅ Closed', components: [], embeds: [] });
                        return 'close';
                    }
                });
            }
        };
    }

    /**
     * Create a confirmation dialog
     * @param {Object} options Dialog options
     */
    createConfirmation(options = {}) {
        const {
            message = 'Are you sure?',
            confirmLabel = 'Confirm',
            cancelLabel = 'Cancel',
            confirmStyle = ButtonStyle.Success,
            cancelStyle = ButtonStyle.Danger,
            timeout = 30000
        } = options;

        const buttons = this.createButtonRow([
            {
                customId: 'confirm',
                label: confirmLabel,
                style: confirmStyle
            },
            {
                customId: 'cancel',
                label: cancelLabel,
                style: cancelStyle
            }
        ]);

        return {
            content: message,
            components: [buttons],
            handleResponse: async (message, userId) => {
                return new Promise((resolve) => {
                    const collector = this.setupCollector(message, {
                        filter: (i) => i.user.id === userId,
                        time: timeout,
                        max: 1,
                        onCollect: async (i) => {
                            if (i.customId === 'confirm') {
                                await i.update({ content: '✅ Confirmed!', components: [] });
                                resolve(true);
                            } else {
                                await i.update({ content: '❌ Cancelled.', components: [] });
                                resolve(false);
                            }
                        },
                        onEnd: (collected, reason) => {
                            if (reason === 'time') {
                                resolve(false);
                            }
                        }
                    });
                });
            }
        };
    }

    /**
     * Wait utility
     * @param {number} ms Milliseconds to wait
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Clean up all active collectors
     */
    cleanup() {
        for (const [messageId, collector] of this.activeCollectors) {
            collector.stop('cleanup');
        }
        this.activeCollectors.clear();
        this.interactionStates.clear();
    }

    /**
     * Create a multi-select menu with buttons
     * @param {Array} options Array of options
     * @param {Object} config Configuration
     */
    createButtonMenu(options, config = {}) {
        const {
            maxPerRow = 5,
            allowMultiple = false,
            minSelect = 1,
            maxSelect = null
        } = config;

        const selected = new Set();
        const rows = [];
        
        // Create button rows
        for (let i = 0; i < options.length; i += maxPerRow) {
            const rowButtons = options.slice(i, i + maxPerRow).map((option, index) => ({
                customId: `menu_${i + index}`,
                label: option.label,
                style: option.style || ButtonStyle.Secondary,
                emoji: option.emoji,
                disabled: option.disabled || false
            }));
            rows.push(this.createButtonRow(rowButtons));
        }

        // Add control buttons
        const controlRow = this.createButtonRow([
            {
                customId: 'menu_confirm',
                label: 'Confirm',
                style: ButtonStyle.Success,
                disabled: selected.size < minSelect
            },
            {
                customId: 'menu_cancel',
                label: 'Cancel',
                style: ButtonStyle.Danger
            }
        ]);
        rows.push(controlRow);

        return {
            components: rows,
            selected,
            handleSelection: async (interaction) => {
                await this.handleInteraction(interaction, async (i) => {
                    if (i.customId.startsWith('menu_')) {
                        const index = parseInt(i.customId.split('_')[1]);
                        
                        if (i.customId === 'menu_confirm') {
                            return { confirmed: true, selected: Array.from(selected) };
                        } else if (i.customId === 'menu_cancel') {
                            return { confirmed: false, selected: [] };
                        } else {
                            // Toggle selection
                            if (selected.has(index)) {
                                selected.delete(index);
                            } else {
                                if (!allowMultiple) selected.clear();
                                if (!maxSelect || selected.size < maxSelect) {
                                    selected.add(index);
                                }
                            }
                            
                            // Update button styles
                            for (let r = 0; r < rows.length - 1; r++) {
                                const row = rows[r];
                                row.components.forEach((button, btnIndex) => {
                                    const globalIndex = r * maxPerRow + btnIndex;
                                    if (selected.has(globalIndex)) {
                                        button.setStyle(ButtonStyle.Primary);
                                    } else {
                                        button.setStyle(options[globalIndex].style || ButtonStyle.Secondary);
                                    }
                                });
                            }
                            
                            // Update confirm button
                            const confirmButton = rows[rows.length - 1].components[0];
                            confirmButton.setDisabled(selected.size < minSelect);
                            
                            await i.update({ components: rows });
                        }
                    }
                });
            }
        };
    }
}

// Export singleton instance
module.exports = new ButtonUtility();