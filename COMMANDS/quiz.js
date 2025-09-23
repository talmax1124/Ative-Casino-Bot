/**
 * Quiz command - Answer trivia questions to earn money
 * 3K-8K reward for correct answers
 * 2 hour cooldown
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage, calculateBoosterBonus } = require('../UTILS/common');
const { secureRandomChoice, secureRandomInt } = require('../UTILS/rng');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const { checkEarningsCooldown, createCooldownBlockEmbed } = require('../UTILS/earningsCooldown');
const { PayoutManager } = require('../UTILS/gameUtils');
const sessionManager = require('../UTILS/sessionManager');
const tuningManager = require('../UTILS/tuningManager');
const shopManager = require('../UTILS/shopManager');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quiz')
        .setDescription('Answer trivia questions to earn money (3K-8K every 2 hours)'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = await getGuildId(interaction);

        try {
            await interaction.deferReply();

            await dbManager.ensureUser(userId, username);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Check if any other earning command is on cooldown
            const cooldownBlock = checkEarningsCooldown(balance, 'quiz');
            if (cooldownBlock) {
                const embed = createCooldownBlockEmbed(username, 'quiz', cooldownBlock);
                return await interaction.editReply({ embeds: [embed] });
            }

            // Check quiz-specific cooldown (2 hours)
            const now = Date.now() / 1000;
            const lastQuiz = balance.last_quiz_ts || 0;
            const cooldown = 7200; // 2 hours

            if (now - lastQuiz < cooldown) {
                const remainingTime = Math.ceil(cooldown - (now - lastQuiz));
                const hours = Math.floor(remainingTime / 3600);
                const minutes = Math.floor((remainingTime % 3600) / 60);
                const seconds = remainingTime % 60;

                const embed = buildSessionEmbed({
                    title: `🧠 ${username}'s Quiz Status`,
                    topFields: [
                        { name: '⏰ Brain Recharging', value: `Your brain needs a break!\nCome back in ${hours}h ${minutes}m ${seconds}s` }
                    ],
                    stageText: 'BRAIN COOLDOWN',
                    color: 0xFFAA00,
                    footer: 'Quiz Command • 2 hour cooldown'
                });

                return await interaction.editReply({ embeds: [embed] });
            }

            // Fun and generic quiz questions database
            const quizQuestions = [
                {
                    question: "What do you call a sleeping bull at the casino?",
                    options: ["A bulldozer", "A bull-dozer", "A napping nightmare", "A snoring slot machine"],
                    correct: 0,
                    category: "Funny"
                },
                {
                    question: "Which animal can hold its breath the longest underwater?",
                    options: ["Whale", "Dolphin", "Sea turtle", "Cuvier's beaked whale"],
                    correct: 3,
                    category: "Animals"
                },
                {
                    question: "What's the most popular pizza topping in the world?",
                    options: ["Mushrooms", "Pepperoni", "Sausage", "Pineapple (fight me!)"],
                    correct: 1,
                    category: "Food"
                },
                {
                    question: "Which planet has the most moons?",
                    options: ["Jupiter", "Saturn", "Mars", "Earth (obviously!)"],
                    correct: 1,
                    category: "Space"
                },
                {
                    question: "What percentage of your body is water?",
                    options: ["50%", "60%", "70%", "80% (I'm basically a walking fish)"],
                    correct: 1,
                    category: "Science"
                },
                {
                    question: "How many hearts does an octopus have?",
                    options: ["1", "2", "3", "8 (one for each arm!)"],
                    correct: 2,
                    category: "Animals"
                },
                {
                    question: "What's the fastest land animal?",
                    options: ["Lion", "Cheetah", "Horse", "Me running to the fridge"],
                    correct: 1,
                    category: "Animals"
                },
                {
                    question: "Which country invented ice cream?",
                    options: ["Italy", "China", "France", "My freezer"],
                    correct: 1,
                    category: "Food"
                },
                {
                    question: "What's the most common phobia?",
                    options: ["Heights", "Spiders", "Public speaking", "Running out of coffee"],
                    correct: 2,
                    category: "Psychology"
                },
                {
                    question: "How many bones are in a shark's body?",
                    options: ["206", "150", "0 (they're made of cartilage!)", "Too many to count"],
                    correct: 2,
                    category: "Animals"
                },
                {
                    question: "What do you call a fake noodle?",
                    options: ["A phony-roni", "An impasta", "A pretend-ghetti", "Still delicious"],
                    correct: 1,
                    category: "Funny"
                },
                {
                    question: "Which fruit is technically a berry?",
                    options: ["Strawberry", "Raspberry", "Banana", "All of the above (science is weird)"],
                    correct: 2,
                    category: "Science"
                },
                {
                    question: "What's the hardest natural substance?",
                    options: ["Steel", "Diamond", "My grandma's cookies", "Titanium"],
                    correct: 1,
                    category: "Science"
                },
                {
                    question: "How many smell receptors do dogs have compared to humans?",
                    options: ["10x more", "100x more", "1000x more", "Infinity times better"],
                    correct: 2,
                    category: "Animals"
                },
                {
                    question: "What's the most stolen food in the world?",
                    options: ["Chocolate", "Cheese", "Wine", "My lunch from the office fridge"],
                    correct: 1,
                    category: "Food"
                },
                {
                    question: "Which came first according to science?",
                    options: ["The chicken", "The egg", "The question", "My confusion"],
                    correct: 1,
                    category: "Science"
                },
                {
                    question: "What's the only mammal that can't jump?",
                    options: ["Elephant", "Hippo", "Rhino", "Me on Monday mornings"],
                    correct: 0,
                    category: "Animals"
                },
                {
                    question: "How much of an iceberg is underwater?",
                    options: ["50%", "75%", "90%", "More than my understanding of math"],
                    correct: 2,
                    category: "Science"
                },
                {
                    question: "What's the most used letter in the English language?",
                    options: ["A", "E", "S", "The letter I never write"],
                    correct: 1,
                    category: "Language"
                },
                {
                    question: "How many taste buds does your tongue have?",
                    options: ["1,000", "5,000", "10,000", "Not enough for pineapple pizza"],
                    correct: 2,
                    category: "Science"
                }
            ];

            const question = secureRandomChoice(quizQuestions);
            
            // Create answer buttons
            const buttons = question.options.map((option, index) => 
                new ButtonBuilder()
                    .setCustomId(`quiz_${index}`)
                    .setLabel(`${String.fromCharCode(65 + index)}. ${option}`)
                    .setStyle(ButtonStyle.Primary)
            );

            const row1 = new ActionRowBuilder().addComponents(buttons.slice(0, 2));
            const row2 = new ActionRowBuilder().addComponents(buttons.slice(2, 4));

            // Quiz presentation embed
            const quizEmbed = buildSessionEmbed({
                title: `🧠 ${username}'s Quiz Challenge`,
                topFields: [
                    { 
                        name: `📚 ${question.category} Question`, 
                        value: `**${question.question}**\n\n*Choose your answer below!*\n*Reward: 3,000 - 8,000 coins*`
                    }
                ],
                stageText: 'QUIZ IN PROGRESS',
                color: 0x9370DB,
                footer: '🧠 Quiz • You have 30 seconds to answer!'
            });

            const reply = await interaction.editReply({ embeds: [quizEmbed], components: [row1, row2] });

            // Wait for button interaction (30 seconds timeout)
            const filter = (i) => i.user.id === userId && i.customId.startsWith('quiz_');
            
            try {
                const collected = await reply.awaitMessageComponent({ filter, time: 30000 });
                
                const answerIndex = parseInt(collected.customId.split('_')[1]);
                const isCorrect = answerIndex === question.correct;
                
                await collected.deferUpdate();

                if (isCorrect) {
                    // Correct answer! Calculate reward
                    const baseEarning = secureRandomInt(5000, 8001); // Higher reward for correct answers

                    // Apply tuning manager adjustments for fair gameplay
                    const tuningAdjustment = await tuningManager.getAdjustedPayout('quiz', baseEarning, 0);
                    const adjustedEarning = Math.round(baseEarning * tuningAdjustment.multiplier);

                    // Apply shop economy boosts on adjusted amount
                    const boostResult = await shopManager.applyEconomyBoosts(userId, adjustedEarning, 'quiz');
                    const boostedEarning = boostResult.amount;

                    // Calculate server booster bonus (5% on boosted earnings)
                    const boosterInfo = await calculateBoosterBonus(boostedEarning, interaction.user.id, interaction.guildId, interaction.guild);
                    const boosterBonus = boosterInfo.amount;
                    const totalEarning = boostedEarning + boosterBonus;

                    // Create game result object for payout processing
                    const gameResult = {
                        type: 'quiz',
                        userId: userId,
                        guildId: guildId,
                        betAmount: 0, // No bet for quiz
                        payout: totalEarning,
                        won: true,
                        question: selectedQuestion.question,
                        baseEarning: adjustedEarning,
                        shopBoosts: boostResult.boosts,
                        boosterBonus: boosterBonus,
                        isBooster: boosterInfo.isBooster,
                        tuningMultiplier: tuningAdjustment.multiplier
                    };

                    // Process payout through modern payout manager
                    const payoutResult = await PayoutManager.processGamePayout(gameResult, interaction);

                    // Update balance and timestamp
                    const currentWallet = parseFloat(balance.wallet) || 0;
                    const currentBank = parseFloat(balance.bank) || 0;
                    const newWallet = currentWallet + totalEarning;
                    
                    await dbManager.setUserBalance(userId, guildId, newWallet, currentBank, {
                        last_quiz_ts: now
                    });


                    // Build success display
                    const hasShopBoosts = boostResult.boosted;
                    const hasServerBoost = boosterInfo.isBooster && boosterBonus > 0;
                    const boostDisplay = shopManager.formatBoostInfo(boostResult.boosts);

                    let earningsDisplay = `+ Base Answer Bonus: ${fmt(adjustedEarning)}`;
                    
                    if (tuningAdjustment.multiplier !== 1.0) {
                        earningsDisplay += `\n+ Tuning Adjustment: ${(tuningAdjustment.multiplier * 100).toFixed(1)}%`;
                    }
                    
                    if (hasShopBoosts) {
                        earningsDisplay += `\n+ Shop Boost: ${fmt(boostedEarning - adjustedEarning)}${boostDisplay}`;
                    }
                    
                    if (hasServerBoost) {
                        earningsDisplay += `\n+ Server Boost (5%): ${fmt(boosterBonus)}`;
                    }
                    
                    earningsDisplay += `\n= Total Earned: ${fmt(totalEarning)}`;

                    const successEmbed = buildSessionEmbed({
                        title: `🧠 ${username}'s Quiz Success!`,
                        topFields: [{
                            name: '✅ CORRECT ANSWER!',
                            value: `**Q:** ${question.question}\n**A:** ${question.options[question.correct]}\n\n` +
                                   `\`\`\`diff\n${earningsDisplay}\n  Previous: ${fmt(currentWallet)}\n+ New Balance: ${fmt(newWallet)}\`\`\``,
                            inline: false
                        }],
                        bankFields: [
                            { name: '🧠 Quiz Reward', value: fmt(totalEarning), inline: true },
                            { name: '💵 New Balance', value: fmt(newWallet), inline: true },
                            { name: '📅 Next Quiz', value: 'In 2 hours', inline: true }
                        ],
                        stageText: 'QUIZ SUCCESS',
                        color: 0x00FF00,
                        footer: '🧠 Correct Answer! • Come back in 2 hours for another quiz!'
                    });

                    await interaction.editReply({ embeds: [successEmbed], components: [] });

                    // End session with success result
                    try {
                        await sessionManager.endSession(interaction.user.id, {
                            type: 'quiz',
                            result: 'success',
                            earning: totalEarning,
                            question: selectedQuestion.question
                        });
                    } catch (error) {
                        logger.error(`Failed to end quiz session: ${error.message}`);
                    }

                    // Record game result for ML analysis
                    try {
                        await dbManager.recordGameResult(
                            userId,
                            guildId,
                            'quiz',
                            true, // Correct answer = win
                            0, // No bet amount for quiz
                            totalEarning,
                            {
                                question: question.question,
                                category: question.category,
                                userAnswer: question.options[answerIndex],
                                correctAnswer: question.options[question.correct],
                                baseEarning: baseEarning,
                                shopBoosts: hasShopBoosts,
                                serverBoost: hasServerBoost,
                                boosterBonus: boosterBonus
                            }
                        );
                    } catch (error) {
                        logger.error(`Failed to record quiz result: ${error.message}`);
                    }

                    // Log the quiz success
                    await sendLogMessage(
                        interaction.client,
                        'economy',
                        `Quiz success: ${username} answered "${question.question}" correctly and earned ${fmt(totalEarning)} - Balance: ${fmt(newWallet)}`,
                        userId,
                        guildId
                    );

                } else {
                    // Wrong answer - small consolation prize
                    const baseConsolationPrize = secureRandomInt(1000, 3001);

                    // Apply tuning manager adjustments for fair gameplay
                    const tuningAdjustment = await tuningManager.getAdjustedPayout('quiz_consolation', baseConsolationPrize, 0);
                    const consolationPrize = Math.round(baseConsolationPrize * tuningAdjustment.multiplier);

                    // Create game result object for consolation payout
                    const gameResult = {
                        type: 'quiz_consolation',
                        userId: userId,
                        guildId: guildId,
                        betAmount: 0,
                        payout: consolationPrize,
                        won: false,
                        question: selectedQuestion.question,
                        baseEarning: consolationPrize,
                        tuningMultiplier: tuningAdjustment.multiplier
                    };

                    // Process consolation payout
                    const payoutResult = await PayoutManager.processGamePayout(gameResult, interaction);
                    
                    const currentWallet = parseFloat(balance.wallet) || 0;
                    const currentBank = parseFloat(balance.bank) || 0;
                    const newWallet = currentWallet + consolationPrize;
                    
                    await dbManager.setUserBalance(userId, guildId, newWallet, currentBank, {
                        last_quiz_ts: now
                    });


                    const wrongEmbed = buildSessionEmbed({
                        title: `🧠 ${username}'s Quiz Attempt`,
                        topFields: [{
                            name: '❌ INCORRECT ANSWER',
                            value: `**Q:** ${question.question}\n**Your Answer:** ${question.options[answerIndex]}\n**Correct Answer:** ${question.options[question.correct]}\n\n` +
                                   `*Consolation Prize: ${fmt(consolationPrize)}*`,
                            inline: false
                        }],
                        bankFields: [
                            { name: '💔 Consolation', value: fmt(consolationPrize), inline: true },
                            { name: '💵 New Balance', value: fmt(newWallet), inline: true },
                            { name: '📅 Next Quiz', value: 'In 2 hours', inline: true }
                        ],
                        stageText: 'QUIZ ATTEMPT',
                        color: 0xFF6B6B,
                        footer: '🧠 Better luck next time! • Come back in 2 hours for another quiz!'
                    });

                    await interaction.editReply({ embeds: [wrongEmbed], components: [] });

                    // End session with consolation result
                    try {
                        await sessionManager.endSession(interaction.user.id, {
                            type: 'quiz',
                            result: 'consolation',
                            earning: consolationPrize,
                            question: selectedQuestion.question
                        });
                    } catch (error) {
                        logger.error(`Failed to end quiz consolation session: ${error.message}`);
                    }

                    // Record the attempt
                    try {
                        await dbManager.recordGameResult(
                            userId,
                            guildId,
                            'quiz',
                            false, // Wrong answer = loss (but still get consolation)
                            0,
                            consolationPrize,
                            {
                                question: question.question,
                                category: question.category,
                                userAnswer: question.options[answerIndex],
                                correctAnswer: question.options[question.correct],
                                consolationPrize: consolationPrize
                            }
                        );
                    } catch (error) {
                        logger.error(`Failed to record quiz result: ${error.message}`);
                    }

                    // Log the quiz attempt
                    await sendLogMessage(
                        interaction.client,
                        'economy',
                        `Quiz attempt: ${username} answered "${question.question}" incorrectly but earned ${fmt(consolationPrize)} consolation prize - Balance: ${fmt(newWallet)}`,
                        userId,
                        guildId
                    );
                }
                
            } catch (error) {
                // Timeout - no answer given
                const timeoutEmbed = buildSessionEmbed({
                    title: `🧠 ${username}'s Quiz Timeout`,
                    topFields: [
                        { 
                            name: '⏰ Time\'s Up!', 
                            value: `**Q:** ${question.question}\n**Correct Answer:** ${question.options[question.correct]}\n\nYou didn't answer in time. Try again in 2 hours!` 
                        }
                    ],
                    stageText: 'QUIZ TIMEOUT',
                    color: 0xFFAA00,
                    footer: 'Quiz Timeout • Try again in 2 hours!'
                });

                await interaction.editReply({ embeds: [timeoutEmbed], components: [] });
            }

        } catch (error) {
            logger.error(`Error processing quiz command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Quiz Error',
                topFields: [
                    { name: '🔧 System Error', value: 'Failed to process quiz. Please try again.' }
                ],
                stageText: 'ERROR',
                color: 0xFF0000,
                footer: 'Quiz System Error'
            });

            try {
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed], components: [] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: 64 });
                }
            } catch (replyError) {
                logger.error(`Failed to send quiz error reply: ${replyError.message}`);
            }
        }
    }
};