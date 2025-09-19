const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../../UTILS/database');
const { getGuildId } = require('../../UTILS/common');
const logger = require('../../UTILS/logger');

const TREE_TYPES = [
    { name: 'Cherry Blossom', emoji: '<8', description: 'Beautiful pink flowers in spring', difficulty: 'easy', growthTime: 5 },
    { name: 'Oak Tree', emoji: '<3', description: 'Strong and sturdy, lives for centuries', difficulty: 'medium', growthTime: 7 },
    { name: 'Pine Tree', emoji: '<2', description: 'Evergreen and resilient', difficulty: 'medium', growthTime: 6 },
    { name: 'Willow Tree', emoji: '<?', description: 'Graceful and elegant', difficulty: 'easy', growthTime: 4 },
    { name: 'Apple Tree', emoji: '<N', description: 'Bears delicious fruit', difficulty: 'hard', growthTime: 8 },
    { name: 'Palm Tree', emoji: '<4', description: 'Tropical and exotic', difficulty: 'medium', growthTime: 6 }
];

const TREE_STAGES = [
    { stage: 'seed', emoji: '<0', description: 'A tiny seed full of potential' },
    { stage: 'sprout', emoji: '<1', description: 'First green shoots appearing' },
    { stage: 'sapling', emoji: '<?', description: 'Young plant growing stronger' },
    { stage: 'young_tree', emoji: '<3', description: 'Small but healthy tree' },
    { stage: 'mature_tree', emoji: '<2', description: 'Fully grown and flourishing' }
];

const CARE_ACTIONS = [
    { action: 'water', emoji: '=�', description: 'Give your tree some water', effect: 'Prevents wilting and promotes growth' },
    { action: 'fertilize', emoji: '>�', description: 'Add nutrients to the soil', effect: 'Speeds up growth significantly' },
    { action: 'prune', emoji: '', description: 'Trim dead branches', effect: 'Improves health and appearance' },
    { action: 'sing', emoji: '<�', description: 'Sing to your tree', effect: 'Mysterious growth benefits!' }
];

class TreeGrowthGame {
    constructor(couple, treeType) {
        this.couple = couple;
        this.treeType = treeType;
        this.currentStage = 0; // Index in TREE_STAGES
        this.health = 100;
        this.growth = 0;
        this.daysAlive = 0;
        this.lastCare = null;
        this.careHistory = [];
        this.plantedAt = new Date();
        this.isAlive = true;
    }

    careForTree(action, caregiver) {
        if (!this.isAlive) return false;

        const careAction = CARE_ACTIONS.find(a => a.action === action);
        if (!careAction) return false;

        let healthGain = 0;
        let growthGain = 0;

        switch (action) {
            case 'water':
                healthGain = 10;
                growthGain = 5;
                break;
            case 'fertilize':
                healthGain = 5;
                growthGain = 15;
                break;
            case 'prune':
                healthGain = 15;
                growthGain = 3;
                break;
            case 'sing':
                healthGain = 8;
                growthGain = Math.random() > 0.5 ? 20 : 2; // Random effect!
                break;
        }

        this.health = Math.min(100, this.health + healthGain);
        this.growth += growthGain;
        this.lastCare = { action, caregiver, timestamp: new Date() };
        this.careHistory.push(this.lastCare);

        // Check for stage progression
        const requiredGrowth = (this.currentStage + 1) * 25;
        if (this.growth >= requiredGrowth && this.currentStage < TREE_STAGES.length - 1) {
            this.currentStage++;
        }

        return true;
    }

    simulateDay() {
        if (!this.isAlive) return;

        this.daysAlive++;
        
        // Natural health decay
        this.health -= 5;
        
        // Check if tree dies from neglect
        if (this.health <= 0) {
            this.isAlive = false;
            return;
        }

        // Natural growth (very slow)
        this.growth += 1;
        
        // Check for stage progression
        const requiredGrowth = (this.currentStage + 1) * 25;
        if (this.growth >= requiredGrowth && this.currentStage < TREE_STAGES.length - 1) {
            this.currentStage++;
        }
    }

    getCurrentStage() {
        return TREE_STAGES[this.currentStage];
    }

    isFullyGrown() {
        return this.currentStage === TREE_STAGES.length - 1;
    }

    getHealthStatus() {
        if (this.health > 80) return { status: 'Excellent', color: 0x00FF00, emoji: '=�' };
        if (this.health > 60) return { status: 'Good', color: 0xFFFF00, emoji: '=�' };
        if (this.health > 40) return { status: 'Fair', color: 0xFFA500, emoji: '>�' };
        if (this.health > 20) return { status: 'Poor', color: 0xFF4500, emoji: 'd' };
        return { status: 'Critical', color: 0xFF0000, emoji: '=�' };
    }

    createStatusEmbed() {
        const stage = this.getCurrentStage();
        const healthStatus = this.getHealthStatus();
        
        const embed = new EmbedBuilder()
            .setTitle(`${this.treeType.emoji} ${this.couple.player1.name} & ${this.couple.player2.name}'s ${this.treeType.name}`)
            .setDescription(`${stage.emoji} **${stage.description}**\n\n${this.isAlive ? 'Your tree is growing!' : '=� Your tree has died...'}`)
            .addFields(
                {
                    name: '=� Tree Stats',
                    value: `**Health:** ${this.health}/100 ${healthStatus.emoji}\n**Growth:** ${this.growth}/125\n**Age:** ${this.daysAlive} days\n**Stage:** ${stage.stage}`,
                    inline: true
                },
                {
                    name: '<1 Care History',
                    value: this.careHistory.length > 0 
                        ? this.careHistory.slice(-3).map(care => 
                            `${CARE_ACTIONS.find(a => a.action === care.action)?.emoji} by ${care.caregiver}`
                        ).join('\n')
                        : 'No care given yet',
                    inline: true
                }
            )
            .setColor(this.isAlive ? healthStatus.color : 0x000000)
            .setTimestamp();

        if (this.daysAlive >= 7 && this.isAlive) {
            embed.addFields({
                name: '<� Achievement Unlocked!',
                value: 'Tree survived for 7 days! Challenge complete! <�',
                inline: false
            });
        }

        return embed;
    }

    createCareButtons() {
        if (!this.isAlive) return [];

        const row = new ActionRowBuilder();
        CARE_ACTIONS.forEach(action => {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`tree_care_${action.action}`)
                    .setLabel(action.description)
                    .setEmoji(action.emoji)
                    .setStyle(ButtonStyle.Primary)
            );
        });

        return [row];
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('marriage-plant-tree')
        .setDescription('Plant and care for a tree together with your spouse'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        await interaction.deferReply();

        try {
            // Check if user is married
            const marriageData = await dbManager.getUserMarriage(userId, guildId);
            if (!marriageData.married) {
                await interaction.editReply({
                    content: 'L You must be married to plant a tree together! Use `/propose` to start your love story.'
                });
                return;
            }

            const marriage = marriageData.marriage;
            const partnerId = marriage.partnerId;
            const partnerName = marriage.partnerName;

            // Check if couple already has an active tree
            global.marriageTrees = global.marriageTrees || new Map();
            const treeId = `tree_${marriage.id}`;
            
            if (global.marriageTrees.has(treeId)) {
                const existingTree = global.marriageTrees.get(treeId);
                const embed = existingTree.createStatusEmbed();
                const buttons = existingTree.createCareButtons();

                await interaction.editReply({
                    content: '<3 You already have a tree together!',
                    embeds: [embed],
                    components: buttons
                });
                return;
            }

            // Tree selection embed
            const treeOptions = TREE_TYPES.map((tree, index) => ({
                label: tree.name,
                value: index.toString(),
                description: tree.description,
                emoji: tree.emoji
            }));

            const embed = new EmbedBuilder()
                .setTitle('<1 Plant a Tree Together')
                .setDescription(`**${interaction.user.displayName}** wants to plant a tree with **${partnerName}**!\n\nChoose what type of tree you want to plant together. You'll need to care for it daily to keep it alive for 7 days.`)
                .addFields({
                    name: '<� Challenge Goal',
                    value: 'Keep your tree alive for 7 days to complete the weekly challenge!',
                    inline: false
                })
                .setColor(0x00FF00);

            // Create tree selection buttons
            const rows = [];
            for (let i = 0; i < TREE_TYPES.length; i += 2) {
                const row = new ActionRowBuilder();
                for (let j = i; j < Math.min(i + 2, TREE_TYPES.length); j++) {
                    const tree = TREE_TYPES[j];
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`select_tree_${j}`)
                            .setLabel(tree.name)
                            .setEmoji(tree.emoji)
                            .setStyle(ButtonStyle.Primary)
                    );
                }
                rows.push(row);
            }

            await interaction.editReply({
                content: `<@${partnerId}> Choose a tree to plant together! <1`,
                embeds: [embed],
                components: rows
            });

        } catch (error) {
            logger.error(`Error in marriage-plant-tree command: ${error.message}`);
            await interaction.editReply({
                content: 'L An error occurred while starting the tree planting. Please try again later.'
            });
        }
    },

    async handleButtonInteraction(interaction) {
        if (interaction.customId.startsWith('select_tree_')) {
            const treeIndex = parseInt(interaction.customId.split('_')[2]);
            const selectedTree = TREE_TYPES[treeIndex];
            
            // Get marriage data to verify users
            const userId = interaction.user.id;
            const guildId = await getGuildId(interaction);
            const marriageData = await dbManager.getUserMarriage(userId, guildId);
            
            if (!marriageData.married) {
                await interaction.reply({
                    content: 'L You must be married to plant a tree!',
                    ephemeral: true
                });
                return;
            }

            const marriage = marriageData.marriage;
            
            // Verify this user is part of the marriage
            if (userId !== marriage.partner1_id && userId !== marriage.partner2_id) {
                await interaction.reply({
                    content: 'L Only the married couple can plant trees together!',
                    ephemeral: true
                });
                return;
            }

            // Create new tree
            const couple = {
                player1: { id: marriage.partner1_id, name: marriage.partner1_name },
                player2: { id: marriage.partner2_id, name: marriage.partner2_name }
            };

            const tree = new TreeGrowthGame(couple, selectedTree);
            const treeId = `tree_${marriage.id}`;
            global.marriageTrees.set(treeId, tree);

            const embed = tree.createStatusEmbed();
            const buttons = tree.createCareButtons();

            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({
                        content: `<1 ${selectedTree.emoji} **${selectedTree.name}** planted! Take care of it together!`,
                        embeds: [embed],
                        components: buttons
                    });
                } else {
                    await interaction.update({
                        content: `<1 ${selectedTree.emoji} **${selectedTree.name}** planted! Take care of it together!`,
                        embeds: [embed],
                        components: buttons
                    });
                }
            } catch (updateError) {
                logger.error(`Error updating tree planting interaction: ${updateError.message}`);
                await interaction.followUp({
                    content: `<1 ${selectedTree.emoji} **${selectedTree.name}** planted! Take care of it together!`,
                    embeds: [embed],
                    components: buttons
                });
            }

        } else if (interaction.customId.startsWith('tree_care_')) {
            const action = interaction.customId.split('_')[2];
            
            // Get marriage data
            const userId = interaction.user.id;
            const guildId = await getGuildId(interaction);
            const marriageData = await dbManager.getUserMarriage(userId, guildId);
            
            if (!marriageData.married) {
                await interaction.reply({
                    content: 'L You must be married to care for the tree!',
                    ephemeral: true
                });
                return;
            }

            const marriage = marriageData.marriage;
            const treeId = `tree_${marriage.id}`;
            
            if (!global.marriageTrees?.has(treeId)) {
                await interaction.reply({
                    content: 'L No tree found! Plant one first with `/marriage-plant-tree`.',
                    ephemeral: true
                });
                return;
            }

            const tree = global.marriageTrees.get(treeId);
            const careSuccess = tree.careForTree(action, interaction.user.displayName);
            
            if (!careSuccess) {
                await interaction.reply({
                    content: 'L Cannot care for the tree right now.',
                    ephemeral: true
                });
                return;
            }

            const embed = tree.createStatusEmbed();
            const buttons = tree.createCareButtons();
            const careAction = CARE_ACTIONS.find(a => a.action === action);

            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({
                        content: `${careAction.emoji} **${interaction.user.displayName}** ${careAction.description.toLowerCase()}!`,
                        embeds: [embed],
                        components: buttons
                    });
                } else {
                    await interaction.update({
                        content: `${careAction.emoji} **${interaction.user.displayName}** ${careAction.description.toLowerCase()}!`,
                        embeds: [embed],
                        components: buttons
                    });
                }
            } catch (updateError) {
                logger.error(`Error updating tree care interaction: ${updateError.message}`);
                await interaction.followUp({
                    content: `${careAction.emoji} **${interaction.user.displayName}** ${careAction.description.toLowerCase()}!`,
                    embeds: [embed],
                    components: buttons
                });
            }
        }
    }
};