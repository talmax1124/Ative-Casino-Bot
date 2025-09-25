const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { getGuildId, hasAdminRole } = require('../UTILS/common');
const logger = require('../UTILS/logger');

// Import Week 2 games
const { MentionTaskGame } = require('../marriages/Games/MentionTask');
const { CoupleTriviaGame } = require('../marriages/Games/CoupleTrivia');
const { DateNightRPGGame } = require('../marriages/Games/DateNightRPG');
const { GuessTheWordEmojiGame } = require('../marriages/Games/GuessTheWordEmoji');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-week2')
        .setDescription('Test Week 2 marriage games (Admin only)')
        .addStringOption(option =>
            option.setName('game')
                .setDescription('Choose which game to test')
                .setRequired(true)
                .addChoices(
                    { name: 'Test 1: Mention Task', value: 'mention' },
                    { name: 'Test 2: Couple Trivia', value: 'trivia' },
                    { name: 'Test 3: Date Night RPG', value: 'rpg' },
                    { name: 'Test 4: Emoji Guessing', value: 'emoji' }
                )
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
        const gameType = interaction.options.getString('game');

        await interaction.deferReply();

        try {
            // Check if user is married (for testing purposes, we can skip this)
            const marriageData = await dbManager.getUserMarriage(userId, guildId);
            if (!marriageData.married) {
                // Create a fake marriage for testing
                const testMarriage = {
                    id: 'test-marriage-' + Date.now(),
                    partner1_id: userId,
                    partner2_id: 'test-partner-id',
                    partner1_name: interaction.user.displayName,
                    partner2_name: 'Test Partner',
                    married_at: new Date().toISOString()
                };

                await this.runTestGame(interaction, testMarriage, gameType);
            } else {
                await this.runTestGame(interaction, marriageData.marriage, gameType);
            }

        } catch (error) {
            logger.error(`Error in test-week2 command: ${error.message}`);
            await this.safeReply(interaction, {
                content: '❌ An error occurred while testing the game. Please check the logs.'
            });
        }
    },

    async runTestGame(interaction, marriage, gameType) {
        const currentUser = interaction.user;
        let gameInstance, embed, components;

        switch (gameType) {
            case 'mention':
                gameInstance = new MentionTaskGame();
                const mentionResult = gameInstance.createTaskEmbed(marriage, currentUser);
                embed = mentionResult.embed;
                components = mentionResult.components;
                break;

            case 'trivia':
                gameInstance = new CoupleTriviaGame();
                const triviaResult = gameInstance.createTriviaEmbed(marriage, currentUser);
                embed = triviaResult.embed;
                components = triviaResult.components;
                break;

            case 'rpg':
                gameInstance = new DateNightRPGGame();
                const rpgResult = gameInstance.createRPGEmbed(marriage, currentUser);
                embed = rpgResult.embed;
                components = rpgResult.components;
                break;

            case 'emoji':
                gameInstance = new GuessTheWordEmojiGame();
                const emojiResult = gameInstance.createEmojiGameEmbed(marriage, currentUser);
                embed = emojiResult.embed;
                components = emojiResult.components;
                break;

            default:
                await interaction.editReply({
                    content: '❌ Invalid game type selected.'
                });
                return;
        }

        // Add test notice to embed
        embed.setFooter({ 
            text: `${embed.data.footer?.text || ''} • 🧪 TEST MODE` 
        });

        const testEmbed = new EmbedBuilder()
            .setTitle('🧪 Week 2 Game Testing')
            .setDescription(
                `**Testing Mode Active**\n\n` +
                `You're now testing the Week 2 games! These are fully functional but separate from the main marriage task system.\n\n` +
                `**Game:** ${this.getGameName(gameType)}\n` +
                `**Test Marriage:** ${marriage.partner1_name} & ${marriage.partner2_name}`
            )
            .setColor(0xFFA500);

        await interaction.editReply({ 
            embeds: [testEmbed, embed], 
            components: components || [] 
        });
    },

    getGameName(gameType) {
        const names = {
            'mention': 'Mention Task - Spread the Love',
            'trivia': 'Couple Trivia Challenge',
            'rpg': 'Date Night Adventure RPG',
            'emoji': 'Emoji Guessing Game'
        };
        return names[gameType] || 'Unknown Game';
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