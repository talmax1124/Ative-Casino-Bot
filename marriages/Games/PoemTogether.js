const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const dbManager = require('../../UTILS/database');
const { getGuildId } = require('../../UTILS/common');
const logger = require('../../UTILS/logger');

const POEM_THEMES = [
    { theme: 'nature', emoji: '<?', title: 'Nature\'s Beauty', description: 'Write about the wonders of the natural world' },
    { theme: 'love', emoji: '=•', title: 'Eternal Love', description: 'Express your love for each other' },
    { theme: 'seasons', emoji: '<B', title: 'Changing Seasons', description: 'Capture the beauty of seasonal changes' },
    { theme: 'journey', emoji: '=ä', title: 'Life\'s Journey', description: 'Write about your journey together' },
    { theme: 'dreams', emoji: '(', title: 'Dreams & Hopes', description: 'Share your dreams and aspirations' },
    { theme: 'memories', emoji: '=ø', title: 'Precious Memories', description: 'Reminisce about special moments' }
];

const POEM_FORMATS = [
    { format: 'haiku', name: 'Haiku', description: '3 lines: 5-7-5 syllables', example: 'Cherry blossoms fall\nGentle breeze carries petals\nSpring\'s eternal dance' },
    { format: 'free_verse', name: 'Free Verse', description: 'No strict rules, express freely', example: 'Words flow like water\nthrough valleys of emotion...' },
    { format: 'limerick', name: 'Limerick', description: 'Funny 5-line poem with AABBA rhyme', example: 'There once was a couple so sweet...' },
    { format: 'sonnet', name: 'Sonnet', description: '14 lines with structured rhyme scheme', example: 'Shall I compare thee to a summer\'s day?' }
];

class PoemCreation {
    constructor(couple, theme, format) {
        this.couple = couple;
        this.theme = theme;
        this.format = format;
        this.verses = [];
        this.currentTurn = 'player1'; // player1 or player2
        this.isComplete = false;
        this.votes = [];
        this.createdAt = new Date();
        this.title = '';
    }

    addVerse(playerId, verse) {
        if (this.isComplete) return false;
        
        const player = playerId === this.couple.player1.id ? 'player1' : 'player2';
        if (player !== this.currentTurn) return false;

        this.verses.push({
            author: playerId,
            authorName: playerId === this.couple.player1.id ? this.couple.player1.name : this.couple.player2.name,
            verse: verse.trim(),
            timestamp: new Date()
        });

        // Switch turns
        this.currentTurn = this.currentTurn === 'player1' ? 'player2' : 'player1';
        
        // Check if poem is complete based on format
        if (this.shouldComplete()) {
            this.isComplete = true;
        }

        return true;
    }

    shouldComplete() {
        switch (this.format.format) {
            case 'haiku':
                return this.verses.length >= 3;
            case 'limerick':
                return this.verses.length >= 5;
            case 'sonnet':
                return this.verses.length >= 14;
            case 'free_verse':
                return this.verses.length >= 4; // Minimum 4 verses for free verse
            default:
                return this.verses.length >= 4;
        }
    }

    addVote(voterId, voterName) {
        if (voterId === this.couple.player1.id || voterId === this.couple.player2.id) {
            return false; // Authors can't vote for their own poem
        }

        if (this.votes.find(v => v.voterId === voterId)) {
            return false; // Already voted
        }

        this.votes.push({
            voterId,
            voterName,
            timestamp: new Date()
        });

        return true;
    }

    getFullPoem() {
        return this.verses.map(v => v.verse).join('\n');
    }

    createPoemEmbed(showVoting = false) {
        const poemText = this.getFullPoem();
        
        const embed = new EmbedBuilder()
            .setTitle(`${this.theme.emoji} ${this.title || `${this.theme.title} - ${this.format.name}`}`)
            .setDescription(poemText || '*No verses written yet*')
            .addFields(
                {
                    name: '=e Authors',
                    value: `${this.couple.player1.name} & ${this.couple.player2.name}`,
                    inline: true
                },
                {
                    name: '=Ý Format',
                    value: this.format.name,
                    inline: true
                },
                {
                    name: '<­ Theme',
                    value: this.theme.title,
                    inline: true
                }
            )
            .setColor(0xFF69B4);

        if (showVoting && this.isComplete) {
            embed.addFields({
                name: '=ó Votes',
                value: this.votes.length > 0 
                    ? `${this.votes.length} votes:\n${this.votes.map(v => `" ${v.voterName}`).join('\n')}`
                    : 'No votes yet - be the first to vote!',
                inline: false
            });
        } else if (!this.isComplete) {
            const nextPlayer = this.currentTurn === 'player1' ? this.couple.player1.name : this.couple.player2.name;
            embed.addFields({
                name: ' Next Turn',
                value: `${nextPlayer} - add the next verse!`,
                inline: false
            });
        }

        embed.setFooter({ 
            text: this.isComplete 
                ? `Completed on ${this.createdAt.toLocaleDateString()}` 
                : `Verses: ${this.verses.length}/${this.shouldComplete() ? 'Complete' : 'Continue...'}`
        });

        return embed;
    }

    createWritingModal(playerId) {
        const modal = new ModalBuilder()
            .setCustomId(`poem_verse_${playerId}`)
            .setTitle(`Add Your Verse - ${this.format.name}`);

        const verseInput = new TextInputBuilder()
            .setCustomId('verse_content')
            .setLabel(`Your verse (${this.format.description})`)
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder(this.format.example)
            .setRequired(true)
            .setMaxLength(500);

        const actionRow = new ActionRowBuilder().addComponents(verseInput);
        modal.addComponents(actionRow);

        return modal;
    }

    createActionButtons(currentUserId) {
        const buttons = [];

        if (!this.isComplete) {
            const isCurrentTurn = (
                (this.currentTurn === 'player1' && currentUserId === this.couple.player1.id) ||
                (this.currentTurn === 'player2' && currentUserId === this.couple.player2.id)
            );

            if (isCurrentTurn) {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId('add_verse')
                        .setLabel('Add Verse')
                        .setEmoji('')
                        .setStyle(ButtonStyle.Primary)
                );
            }

            if (this.verses.length >= 2) {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId('finish_poem')
                        .setLabel('Finish Poem')
                        .setEmoji('')
                        .setStyle(ButtonStyle.Success)
                );
            }
        } else {
            // Poem is complete - show voting
            if (currentUserId !== this.couple.player1.id && currentUserId !== this.couple.player2.id) {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId('vote_poem')
                        .setLabel('Vote for this poem!')
                        .setEmoji('=M')
                        .setStyle(ButtonStyle.Success)
                );
            }
        }

        return buttons.length > 0 ? [new ActionRowBuilder().addComponents(...buttons)] : [];
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('marriage-poem')
        .setDescription('Write a poem together with your spouse'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        await interaction.deferReply();

        try {
            // Check if user is married
            const marriageData = await dbManager.getUserMarriage(userId, guildId);
            if (!marriageData.married) {
                await interaction.editReply({
                    content: 'L You must be married to write poems together! Use `/propose` to start your love story.'
                });
                return;
            }

            const marriage = marriageData.marriage;
            const partnerId = marriage.partnerId;
            const partnerName = marriage.partnerName;

            // Theme selection embed
            const embed = new EmbedBuilder()
                .setTitle('=Ý Write a Poem Together')
                .setDescription(`**${interaction.user.displayName}** wants to write a poem with **${partnerName}**!\n\nFirst, choose a theme for your poem:`)
                .addFields({
                    name: '<¯ Challenge Goal',
                    value: 'Write a poem together and get at least 1 vote from the community!',
                    inline: false
                })
                .setColor(0xFF69B4);

            // Create theme selection buttons
            const rows = [];
            for (let i = 0; i < POEM_THEMES.length; i += 3) {
                const row = new ActionRowBuilder();
                for (let j = i; j < Math.min(i + 3, POEM_THEMES.length); j++) {
                    const theme = POEM_THEMES[j];
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`theme_${j}`)
                            .setLabel(theme.title)
                            .setEmoji(theme.emoji)
                            .setStyle(ButtonStyle.Primary)
                    );
                }
                rows.push(row);
            }

            await interaction.editReply({
                content: `<@${partnerId}> Choose a theme for your poem together! =Ý`,
                embeds: [embed],
                components: rows
            });

        } catch (error) {
            logger.error(`Error in marriage-poem command: ${error.message}`);
            await interaction.editReply({
                content: 'L An error occurred while starting the poem creation. Please try again later.'
            });
        }
    },

    async handleButtonInteraction(interaction) {
        if (interaction.customId.startsWith('theme_')) {
            const themeIndex = parseInt(interaction.customId.split('_')[1]);
            const selectedTheme = POEM_THEMES[themeIndex];
            
            // Show format selection
            const embed = new EmbedBuilder()
                .setTitle(`${selectedTheme.emoji} ${selectedTheme.title}`)
                .setDescription(`Great choice! Now select the format for your poem:\n\n${selectedTheme.description}`)
                .setColor(0xFF69B4);

            const rows = [];
            for (let i = 0; i < POEM_FORMATS.length; i += 2) {
                const row = new ActionRowBuilder();
                for (let j = i; j < Math.min(i + 2, POEM_FORMATS.length); j++) {
                    const format = POEM_FORMATS[j];
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`format_${themeIndex}_${j}`)
                            .setLabel(format.name)
                            .setStyle(ButtonStyle.Secondary)
                    );
                }
                rows.push(row);
            }

            await interaction.update({
                embeds: [embed],
                components: rows
            });

        } else if (interaction.customId.startsWith('format_')) {
            const [_, themeIndex, formatIndex] = interaction.customId.split('_').map(Number);
            const selectedTheme = POEM_THEMES[themeIndex];
            const selectedFormat = POEM_FORMATS[formatIndex];
            
            // Get marriage data
            const userId = interaction.user.id;
            const guildId = await getGuildId(interaction);
            const marriageData = await dbManager.getUserMarriage(userId, guildId);
            
            if (!marriageData.married) {
                await interaction.reply({
                    content: 'L You must be married to create poems!',
                    ephemeral: true
                });
                return;
            }

            const marriage = marriageData.marriage;
            
            // Create new poem
            const couple = {
                player1: { id: marriage.partner1_id, name: marriage.partner1_name },
                player2: { id: marriage.partner2_id, name: marriage.partner2_name }
            };

            const poem = new PoemCreation(couple, selectedTheme, selectedFormat);
            const poemId = `poem_${marriage.id}_${Date.now()}`;
            
            global.marriagePoems = global.marriagePoems || new Map();
            global.marriagePoems.set(poemId, poem);

            const embed = poem.createPoemEmbed();
            const buttons = poem.createActionButtons(userId);

            await interaction.update({
                content: `=Ý Poem started! **${poem.format.name}** about **${poem.theme.title}**`,
                embeds: [embed],
                components: buttons
            });

        } else if (interaction.customId === 'add_verse') {
            // Show modal for adding verse
            const poemId = this.findPoemIdForUser(interaction.user.id);
            if (!poemId) {
                await interaction.reply({
                    content: 'L No active poem found.',
                    ephemeral: true
                });
                return;
            }

            const poem = global.marriagePoems.get(poemId);
            const modal = poem.createWritingModal(interaction.user.id);
            
            await interaction.showModal(modal);

        } else if (interaction.customId === 'finish_poem') {
            const poemId = this.findPoemIdForUser(interaction.user.id);
            if (!poemId) {
                await interaction.reply({
                    content: 'L No active poem found.',
                    ephemeral: true
                });
                return;
            }

            const poem = global.marriagePoems.get(poemId);
            poem.isComplete = true;

            const embed = poem.createPoemEmbed(true);
            const buttons = poem.createActionButtons(interaction.user.id);

            await interaction.update({
                content: '<‰ Poem completed! Others can now vote for it!',
                embeds: [embed],
                components: buttons
            });

        } else if (interaction.customId === 'vote_poem') {
            const poemId = this.findPoemIdInChannel(interaction.message);
            if (!poemId) {
                await interaction.reply({
                    content: 'L Cannot find poem to vote for.',
                    ephemeral: true
                });
                return;
            }

            const poem = global.marriagePoems.get(poemId);
            const voteSuccess = poem.addVote(interaction.user.id, interaction.user.displayName);
            
            if (!voteSuccess) {
                await interaction.reply({
                    content: 'L You cannot vote for this poem (either you already voted or you are an author).',
                    ephemeral: true
                });
                return;
            }

            const embed = poem.createPoemEmbed(true);
            const buttons = poem.createActionButtons(interaction.user.id);

            await interaction.update({
                content: `=M ${interaction.user.displayName} voted for this poem!`,
                embeds: [embed],
                components: buttons
            });
        }
    },

    async handleModalSubmit(interaction) {
        if (!interaction.customId.startsWith('poem_verse_')) return;

        const userId = interaction.customId.split('_')[2];
        const verse = interaction.fields.getTextInputValue('verse_content');
        
        const poemId = this.findPoemIdForUser(userId);
        if (!poemId) {
            await interaction.reply({
                content: 'L No active poem found.',
                ephemeral: true
            });
            return;
        }

        const poem = global.marriagePoems.get(poemId);
        const addSuccess = poem.addVerse(userId, verse);
        
        if (!addSuccess) {
            await interaction.reply({
                content: 'L Cannot add verse right now.',
                ephemeral: true
            });
            return;
        }

        const embed = poem.createPoemEmbed();
        const buttons = poem.createActionButtons(userId);

        await interaction.reply({
            content: ` Verse added by **${interaction.user.displayName}**!`,
            embeds: [embed],
            components: buttons
        });
    },

    findPoemIdForUser(userId) {
        if (!global.marriagePoems) return null;
        
        for (const [poemId, poem] of global.marriagePoems) {
            if (poem.couple.player1.id === userId || poem.couple.player2.id === userId) {
                return poemId;
            }
        }
        return null;
    },

    findPoemIdInChannel(message) {
        // This would need to be implemented based on how you store poem IDs
        // For now, return null - in production you'd store this differently
        return null;
    }
};