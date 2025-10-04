/**
 * Button Test Command - Demonstrates the ButtonUtility features
 * Tests various button patterns to ensure no "This Interaction Failed" messages
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const buttonUtility = require('../UTILS/buttonUtility');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buttontest')
        .setDescription('Test the button utility features')
        .addStringOption(option =>
            option.setName('test')
                .setDescription('Which test to run')
                .setRequired(true)
                .addChoices(
                    { name: 'Simple Buttons', value: 'simple' },
                    { name: 'Confirmation Dialog', value: 'confirm' },
                    { name: 'Pagination', value: 'pagination' },
                    { name: 'Button Menu', value: 'menu' },
                    { name: 'Game Simulation', value: 'game' }
                )),

    async execute(interaction) {
        const testType = interaction.options.getString('test');

        try {
            switch (testType) {
                case 'simple':
                    await testSimpleButtons(interaction);
                    break;
                case 'confirm':
                    await testConfirmation(interaction);
                    break;
                case 'pagination':
                    await testPagination(interaction);
                    break;
                case 'menu':
                    await testButtonMenu(interaction);
                    break;
                case 'game':
                    await testGameSimulation(interaction);
                    break;
            }
        } catch (error) {
            logger.error('Button test error:', error);
            await buttonUtility.safeReply(interaction, {
                content: '❌ Test failed: ' + error.message,
                flags: MessageFlags.Ephemeral
            });
        }
    }
};

/**
 * Test simple button interactions
 */
async function testSimpleButtons(interaction) {
    const buttons = buttonUtility.createButtonRow([
        { customId: 'test_1', label: 'Button 1', style: 1, emoji: '1️⃣' },
        { customId: 'test_2', label: 'Button 2', style: 2, emoji: '2️⃣' },
        { customId: 'test_3', label: 'Button 3', style: 3, emoji: '3️⃣' },
        { customId: 'test_4', label: 'Button 4', style: 4, emoji: '4️⃣' }
    ]);

    const message = await interaction.reply({
        content: '🧪 **Simple Button Test**\nClick any button to test interaction handling:',
        components: [buttons],
        fetchReply: true
    });

    // Setup collector
    buttonUtility.setupCollector(message, {
        filter: (i) => i.user.id === interaction.user.id,
        time: 60000,
        onCollect: async (i) => {
            const buttonNum = i.customId.split('_')[1];
            await buttonUtility.safeReply(i, {
                content: `✅ You clicked Button ${buttonNum}!\nInteraction handled successfully.`,
                update: true
            });
        },
        onEnd: () => {
            logger.info('Simple button test ended');
        }
    });
}

/**
 * Test confirmation dialog
 */
async function testConfirmation(interaction) {
    const confirmation = buttonUtility.createConfirmation({
        message: '🤔 **Confirmation Test**\nDo you want to proceed with this action?',
        confirmLabel: 'Yes, proceed',
        cancelLabel: 'No, cancel'
    });

    const message = await interaction.reply({
        ...confirmation,
        fetchReply: true
    });

    const result = await confirmation.handleResponse(message, interaction.user.id);

    if (result) {
        logger.info('User confirmed action');
    } else {
        logger.info('User cancelled action');
    }
}

/**
 * Test pagination
 */
async function testPagination(interaction) {
    // Create sample pages
    const pages = [];
    for (let i = 1; i <= 5; i++) {
        pages.push(new EmbedBuilder()
            .setTitle(`📖 Page ${i} of 5`)
            .setDescription(`This is the content of page ${i}.\n\nUse the buttons below to navigate.`)
            .setColor(0x00AE86)
            .setFooter({ text: `Page ${i}/5` })
        );
    }

    const pagination = buttonUtility.createPagination(pages);
    const message = await interaction.reply({
        ...pagination.getPage(),
        fetchReply: true
    });

    // Setup collector for pagination
    buttonUtility.setupCollector(message, {
        filter: (i) => i.user.id === interaction.user.id,
        time: 120000,
        onCollect: async (i) => {
            const result = await pagination.handleInteraction(i);
            if (result === 'close') {
                return;
            }
        }
    });
}

/**
 * Test button menu
 */
async function testButtonMenu(interaction) {
    const options = [
        { label: '🍎 Apple', emoji: '🍎' },
        { label: '🍊 Orange', emoji: '🍊' },
        { label: '🍇 Grapes', emoji: '🍇' },
        { label: '🍓 Strawberry', emoji: '🍓' },
        { label: '🥝 Kiwi', emoji: '🥝' },
        { label: '🍑 Peach', emoji: '🍑' }
    ];

    const menu = buttonUtility.createButtonMenu(options, {
        maxPerRow: 3,
        allowMultiple: true,
        minSelect: 1,
        maxSelect: 3
    });

    const message = await interaction.reply({
        content: '🍔 **Button Menu Test**\nSelect up to 3 fruits (minimum 1):',
        components: menu.components,
        fetchReply: true
    });

    // Setup collector
    buttonUtility.setupCollector(message, {
        filter: (i) => i.user.id === interaction.user.id,
        time: 60000,
        onCollect: async (i) => {
            const result = await menu.handleSelection(i);
            if (result) {
                if (result.confirmed) {
                    const selected = result.selected.map(i => options[i].label).join(', ');
                    await buttonUtility.safeReply(i, {
                        content: `✅ You selected: ${selected}`,
                        components: [],
                        update: true
                    });
                } else {
                    await buttonUtility.safeReply(i, {
                        content: '❌ Selection cancelled',
                        components: [],
                        update: true
                    });
                }
            }
        }
    });
}

/**
 * Test game-like interaction simulation
 */
async function testGameSimulation(interaction) {
    let score = 0;
    let attempts = 3;
    
    const updateGame = () => {
        const buttons = buttonUtility.createButtonRow([
            { 
                customId: 'game_hit', 
                label: 'Hit (+10)', 
                style: 1, 
                emoji: '🎯',
                disabled: attempts === 0
            },
            { 
                customId: 'game_miss', 
                label: 'Miss (-5)', 
                style: 4, 
                emoji: '❌',
                disabled: attempts === 0
            },
            { 
                customId: 'game_reset', 
                label: 'Reset', 
                style: 2, 
                emoji: '🔄' 
            },
            { 
                customId: 'game_end', 
                label: 'End Game', 
                style: 4, 
                emoji: '🏁' 
            }
        ]);

        const embed = new EmbedBuilder()
            .setTitle('🎮 Game Simulation Test')
            .setDescription('Test game-like button interactions')
            .addFields(
                { name: '💯 Score', value: `${score}`, inline: true },
                { name: '🎲 Attempts', value: `${attempts}`, inline: true }
            )
            .setColor(attempts > 0 ? 0x00AE86 : 0xFF0000);

        return { embeds: [embed], components: [buttons] };
    };

    const message = await interaction.reply({
        ...updateGame(),
        fetchReply: true
    });

    // Setup game collector
    buttonUtility.setupCollector(message, {
        filter: (i) => i.user.id === interaction.user.id,
        time: 120000,
        onCollect: async (i) => {
            switch (i.customId) {
                case 'game_hit':
                    score += 10;
                    attempts--;
                    await buttonUtility.safeReply(i, {
                        ...updateGame(),
                        update: true
                    });
                    break;
                    
                case 'game_miss':
                    score -= 5;
                    attempts--;
                    await buttonUtility.safeReply(i, {
                        ...updateGame(),
                        update: true
                    });
                    break;
                    
                case 'game_reset':
                    score = 0;
                    attempts = 3;
                    await buttonUtility.safeReply(i, {
                        ...updateGame(),
                        update: true
                    });
                    break;
                    
                case 'game_end':
                    await buttonUtility.safeReply(i, {
                        content: `🏁 **Game Over!**\nFinal Score: ${score}`,
                        embeds: [],
                        components: [],
                        update: true
                    });
                    break;
            }

            // Check game over
            if (attempts === 0 && i.customId !== 'game_reset' && i.customId !== 'game_end') {
                setTimeout(async () => {
                    await message.edit({
                        content: `⏰ **No attempts left!**\nFinal Score: ${score}\nClick Reset to play again or End Game to finish.`,
                        ...updateGame()
                    });
                }, 1000);
            }
        },
        onEnd: (collected, reason) => {
            if (reason === 'time') {
                logger.info(`Game simulation ended: timeout, final score: ${score}`);
            }
        }
    });
}