const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../../UTILS/database');
const { getGuildId } = require('../../UTILS/common');
const logger = require('../../UTILS/logger');

/**
 * DateNightRPG Game - Week 2, Task 3
 * A choose-your-own-adventure text RPG for couples
 */
class DateNightRPGGame {
    constructor() {
        this.scenarios = [
            {
                id: 'dinner_choice',
                title: '🍽️ Dinner Decision',
                description: 'It\'s date night and you\'re both hungry! Where do you want to go for dinner?',
                choices: [
                    { 
                        id: 'fancy_restaurant', 
                        text: '🍷 Fancy Italian Restaurant', 
                        outcome: 'You both dress up and enjoy a candlelit dinner with amazing pasta. The waiter compliments your relationship! You spend the evening sharing stories and laughing. 💕'
                    },
                    { 
                        id: 'food_truck', 
                        text: '🌮 Street Food Adventure', 
                        outcome: 'You discover the most amazing food truck! You sit on a park bench sharing tacos and talking about your dreams. A musician nearby plays romantic songs just for you two! 🎵'
                    },
                    { 
                        id: 'cook_together', 
                        text: '👩‍🍳 Cook Together at Home', 
                        outcome: 'You create a beautiful meal together, flour everywhere and lots of laughter. You discover your partner is surprisingly good at making dessert! The kitchen disaster becomes a sweet memory. 🏠'
                    }
                ]
            },
            {
                id: 'activity_choice',
                title: '🎭 Evening Entertainment',
                description: 'After dinner, you want to do something fun together. What sounds most appealing?',
                choices: [
                    {
                        id: 'movie_night',
                        text: '🎬 Cozy Movie Night',
                        outcome: 'You build a blanket fort and watch your favorite movies. Halfway through, you both fall asleep cuddling. You wake up at 2 AM to credits rolling and your partner drooling on your shoulder. Perfect! 😴'
                    },
                    {
                        id: 'stargazing',
                        text: '⭐ Stargazing Adventure',
                        outcome: 'You find the perfect hilltop spot and spread out a blanket. Your partner points out constellations (some made up) and you make wishes on shooting stars. A meteor shower appears just for you! 🌟'
                    },
                    {
                        id: 'dance_party',
                        text: '💃 Living Room Dance Party',
                        outcome: 'You turn up the music and dance like nobody\'s watching! Your partner\'s terrible dance moves make you laugh so hard you cry. The neighbors complain, but you don\'t care. Best date ever! 🕺'
                    }
                ]
            },
            {
                id: 'surprise_event',
                title: '🎁 Unexpected Surprise',
                description: 'Suddenly, something unexpected happens during your date! How do you handle it?',
                choices: [
                    {
                        id: 'rain_storm',
                        text: '🌧️ Sudden Rain Storm',
                        outcome: 'You both get completely soaked running to shelter! You find a cozy 24-hour diner and spend hours talking over coffee and pie. The storm outside makes everything feel romantic and intimate. ☕'
                    },
                    {
                        id: 'street_performer',
                        text: '🎪 Street Performer Show',
                        outcome: 'A amazing street performer calls you both up to be volunteers! You end up juggling together (terribly) while the crowd cheers. You\'re both embarrassed but can\'t stop giggling! 🤹'
                    },
                    {
                        id: 'lost_phone',
                        text: '📱 Lost Phone Drama',
                        outcome: 'Your phone falls down a storm drain! Instead of panicking, you both turn it into an adventure, asking strangers for directions and discovering parts of the city you\'ve never seen. You feel more connected than ever! 🗺️'
                    }
                ]
            },
            {
                id: 'dessert_dilemma',
                title: '🍰 Sweet Ending Decision',
                description: 'The date is winding down, but you want something sweet to end the night. What\'s your move?',
                choices: [
                    {
                        id: 'ice_cream_shop',
                        text: '🍦 Late Night Ice Cream',
                        outcome: 'You find an ice cream shop that\'s still open! You both order way too many flavors and end up sharing everything. You get brain freeze at the same time and laugh hysterically. 🧠❄️'
                    },
                    {
                        id: 'bake_together',
                        text: '🧁 Midnight Baking Session',
                        outcome: 'You decide to bake cookies at 11 PM! The kitchen becomes a flour explosion zone, but the cookies turn out surprisingly good. You eat warm cookies with milk and plan your next adventure. 🍪'
                    },
                    {
                        id: 'candy_store',
                        text: '🍭 Nostalgic Candy Store',
                        outcome: 'You find a retro candy store and buy all your childhood favorites! You spend an hour comparing candy from when you were kids and sharing sweet memories. Your sugar rush lasts until sunrise! 🌅'
                    }
                ]
            },
            {
                id: 'transportation_trouble',
                title: '🚗 Getting Home Adventure',
                description: 'Time to head home, but your usual transportation isn\'t available! How do you get back?',
                choices: [
                    {
                        id: 'long_walk',
                        text: '🚶‍♀️ Romantic Long Walk',
                        outcome: 'You decide to walk the entire way home, hand in hand. You discover beautiful murals, have deep conversations, and stop to pet every dog you meet. What should have been 20 minutes becomes 2 hours of perfect connection. 💫'
                    },
                    {
                        id: 'rideshare_karaoke',
                        text: '🎤 Rideshare Karaoke',
                        outcome: 'Your rideshare driver has a karaoke setup! You both belt out terrible duets while the driver films it for his TikTok. You go viral as "the cutest couple ever" and wake up with 10,000 likes! 📱'
                    },
                    {
                        id: 'bike_share',
                        text: '🚲 Tandem Bike Adventure',
                        outcome: 'You find a bike share station and attempt to ride tandem! You wobble, crash into bushes, and laugh until your sides hurt. A kind stranger takes photos of your disaster, which become your favorite couple photos ever! 📸'
                    }
                ]
            },
            {
                id: 'morning_after',
                title: '☀️ The Next Morning',
                description: 'You wake up the next day thinking about your amazing date. What\'s your first move?',
                choices: [
                    {
                        id: 'breakfast_surprise',
                        text: '🥞 Surprise Breakfast',
                        outcome: 'You sneak out early to get your partner\'s favorite breakfast! You return with coffee, pastries, and flowers. They wake up to the smell and declare you the best partner ever. You eat breakfast in bed surrounded by crumbs and love! ❤️'
                    },
                    {
                        id: 'scrapbook_making',
                        text: '📚 Memory Scrapbook',
                        outcome: 'You spend the morning making a scrapbook of your date! You print photos, write silly captions, and include the napkin from dinner. Your partner finds you crafting and joins in. Now you have a beautiful memory book! ✨'
                    },
                    {
                        id: 'plan_next_date',
                        text: '📅 Plan Another Adventure',
                        outcome: 'You\'re already planning date number two! You research fun activities, bookmark restaurants, and make a list of adventures. Your partner wakes up to find you surrounded by travel brochures and date ideas. They kiss you and says "Let\'s do them all!" 💕'
                    }
                ]
            },
            {
                id: 'gift_surprise',
                title: '🎁 Unexpected Gift',
                description: 'Your partner has a surprise gift for you during the date! What could it be?',
                choices: [
                    {
                        id: 'handmade_gift',
                        text: '✋ Something Handmade',
                        outcome: 'Your partner pulls out a handmade photo album filled with all your favorite memories together! Each page has a sweet note about why that moment was special. You ugly cry happy tears in the middle of the restaurant! 😭💕'
                    },
                    {
                        id: 'silly_gift',
                        text: '🤪 Something Silly',
                        outcome: 'Your partner gives you matching ugly Christmas sweaters... in July! You both put them on immediately and wear them for the rest of the date. Strangers keep taking photos with you. You start a new fashion trend! 🎄'
                    },
                    {
                        id: 'experience_gift',
                        text: '🎢 An Experience',
                        outcome: 'Your partner surprises you with tickets to that thing you mentioned wanting to do months ago! You can\'t believe they remembered and planned this. You spend the day trying something completely new together and loving every minute! 🎪'
                    }
                ]
            }
        ];
    }

    /**
     * Create the initial RPG embed
     */
    createRPGEmbed(marriage, currentUser, gameData = null) {
        if (!gameData || !gameData.current_scenario) {
            // Initial state - choose first scenario
            const embed = new EmbedBuilder()
                .setTitle('🎭 Date Night Adventure!')
                .setDescription(
                    `**${marriage.partner1_name}** & **${marriage.partner2_name}**\n\n` +
                    `Welcome to your choose-your-own-adventure date night! 💕\n\n` +
                    `🎯 **How it works:**\n` +
                    `• You'll face different date scenarios together\n` +
                    `• Make choices that lead to different romantic outcomes\n` +
                    `• Create a unique love story based on your decisions\n` +
                    `• Collect memories from your virtual adventure!\n\n` +
                    `Ready to start your adventure?`
                )
                .setColor(0xE91E63)
                .addFields({
                    name: '✨ Get Started',
                    value: 'Click "Begin Adventure" to start your romantic RPG!',
                    inline: false
                })
                .setFooter({ text: 'Marriage Task 3 • Date Night RPG' });

            const startButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`rpg_start_${marriage.id}_${currentUser.id}`)
                        .setLabel('🚀 Begin Adventure')
                        .setStyle(ButtonStyle.Success)
                );

            return { embed, components: [startButton] };
        }

        // Active game state
        const currentScenario = this.scenarios.find(s => s.id === gameData.current_scenario);
        if (!currentScenario) {
            return this.createCompletionEmbed(marriage, gameData);
        }

        const embed = new EmbedBuilder()
            .setTitle(`${currentScenario.title}`)
            .setDescription(
                `**${marriage.partner1_name}** & **${marriage.partner2_name}**\n\n` +
                `${currentScenario.description}\n\n` +
                `🎭 **Choose your adventure:**`
            )
            .setColor(0xE91E63);

        // Add progress indicator
        const completedScenarios = gameData.completed_scenarios ? JSON.parse(gameData.completed_scenarios) : [];
        embed.addFields({
            name: '📈 Adventure Progress',
            value: `Scenarios completed: ${completedScenarios.length}/7\nMemories collected: ${completedScenarios.length}`,
            inline: false
        });

        // Create choice buttons
        const buttons = currentScenario.choices.map((choice, index) => 
            new ButtonBuilder()
                .setCustomId(`rpg_choice_${marriage.id}_${currentUser.id}_${choice.id}`)
                .setLabel(choice.text)
                .setStyle(index === 0 ? ButtonStyle.Primary : index === 1 ? ButtonStyle.Secondary : ButtonStyle.Success)
        );

        const components = [new ActionRowBuilder().addComponents(buttons)];
        embed.setFooter({ text: 'Marriage Task 3 • Choose your path together!' });

        return { embed, components };
    }

    /**
     * Create outcome embed after a choice is made
     */
    createOutcomeEmbed(marriage, scenario, choice, gameData) {
        const completedScenarios = gameData.completed_scenarios ? JSON.parse(gameData.completed_scenarios) : [];
        
        const embed = new EmbedBuilder()
            .setTitle(`💫 ${scenario.title} - Outcome`)
            .setDescription(
                `**${marriage.partner1_name}** & **${marriage.partner2_name}**\n\n` +
                `You chose: **${choice.text}**\n\n` +
                `${choice.outcome}`
            )
            .setColor(0x4CAF50)
            .addFields({
                name: '✨ Memory Added',
                value: `"${scenario.title}" has been added to your date night memory collection!`,
                inline: false
            });

        // Show progress
        embed.addFields({
            name: '📈 Adventure Progress',
            value: `Scenarios completed: ${completedScenarios.length + 1}/7\nMemories collected: ${completedScenarios.length + 1}`,
            inline: false
        });

        if (completedScenarios.length + 1 >= 7) {
            // Adventure complete
            embed.addFields({
                name: '🎉 Adventure Complete!',
                value: 'You\'ve completed your date night adventure! Click below to see your full story.',
                inline: false
            });

            const completeButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`rpg_complete_${marriage.id}`)
                        .setLabel('📚 View Your Love Story')
                        .setStyle(ButtonStyle.Success)
                );

            embed.setFooter({ text: 'Marriage Task 3 • Adventure Complete!' });
            return { embed, components: [completeButton] };
        } else {
            const continueButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`rpg_continue_${marriage.id}_${marriage.partner1_id === gameData.current_player ? marriage.partner2_id : marriage.partner1_id}`)
                        .setLabel('➡️ Continue Adventure')
                        .setStyle(ButtonStyle.Primary)
                );

            embed.setFooter({ text: 'Marriage Task 3 • Adventure continues...' });
            return { embed, components: [continueButton] };
        }
    }

    /**
     * Create completion embed showing the full story
     */
    createCompletionEmbed(marriage, gameData) {
        const completedScenarios = JSON.parse(gameData.completed_scenarios || '[]');
        
        let storyText = '📖 **Your Unique Love Story:**\n\n';
        
        completedScenarios.forEach((scenario, index) => {
            const scenarioData = this.scenarios.find(s => s.id === scenario.scenarioId);
            const choiceData = scenarioData ? scenarioData.choices.find(c => c.id === scenario.choiceId) : null;
            
            if (scenarioData && choiceData) {
                storyText += `**Chapter ${index + 1}: ${scenarioData.title}**\n`;
                storyText += `You chose: ${choiceData.text}\n`;
                storyText += `${choiceData.outcome}\n\n`;
            }
        });

        const embed = new EmbedBuilder()
            .setTitle('📚 Your Complete Date Night Story!')
            .setDescription(
                `**${marriage.partner1_name}** & **${marriage.partner2_name}**\n\n` +
                `Congratulations! You've completed your date night adventure together! 🎉\n\n` +
                storyText +
                `💕 **What a beautiful adventure you've shared!**\n` +
                `Your choices have created a unique love story that's entirely your own.`
            )
            .setColor(0xE91E63)
            .addFields({
                name: '🏆 Adventure Stats',
                value: `Scenarios completed: ${completedScenarios.length}/7\nMemories collected: ${completedScenarios.length}\nUnique story created: Yes! 💫`,
                inline: false
            })
            .setFooter({ text: 'Marriage Task 3 • Date Night RPG Complete!' });

        const restartButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`rpg_restart_${marriage.id}`)
                    .setLabel('🔄 Start New Adventure')
                    .setStyle(ButtonStyle.Secondary)
            );

        return { embed, components: [restartButton] };
    }

    /**
     * Get next random scenario
     */
    getNextScenario(completedScenarios = []) {
        const availableScenarios = this.scenarios.filter(s => 
            !completedScenarios.some(completed => completed.scenarioId === s.id)
        );
        
        if (availableScenarios.length === 0) return null;
        
        return availableScenarios[Math.floor(Math.random() * availableScenarios.length)];
    }

    /**
     * Initialize new game data
     */
    initializeGame() {
        const firstScenario = this.scenarios[Math.floor(Math.random() * this.scenarios.length)];
        return {
            current_scenario: firstScenario.id,
            completed_scenarios: JSON.stringify([]),
            current_player: null
        };
    }

    /**
     * Create the initial start embed for the game
     */
    async createStartEmbed(user) {
        // Get user's marriage info
        const marriageData = await dbManager.getUserMarriage(user.id, user.guildId || '1403244656845787167');
        if (!marriageData || !marriageData.married) {
            throw new Error('User not married');
        }
        
        const marriage = marriageData.marriage;
        
        const embed = new EmbedBuilder()
            .setTitle('🎭 Date Night Adventure!')
            .setDescription(
                `**${marriage.partner1_name}** & **${marriage.partner2_name}**\n\n` +
                `Welcome to your choose-your-own-adventure date night! 💕\n\n` +
                `🎯 **How it works:**\n` +
                `• You'll face different date scenarios together\n` +
                `• Make choices that lead to different romantic outcomes\n` +
                `• Create a unique love story based on your decisions\n` +
                `• Collect memories from your virtual adventure!\n\n` +
                `Ready to start your adventure?`
            )
            .setColor(0xE91E63)
            .setFooter({ text: 'Marriage Task 3 • Your romantic adventure awaits!' });

        const startButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`rpg_begin_${marriage.id}_${user.id}`)
                    .setLabel('🚀 Begin Adventure')
                    .setStyle(ButtonStyle.Success)
            );

        return { embed, components: [startButton] };
    }
}

module.exports = { DateNightRPGGame };