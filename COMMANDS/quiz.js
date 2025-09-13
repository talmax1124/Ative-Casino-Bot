/**
 * Quiz command - Answer trivia questions to earn money
 * 3K-8K reward for correct answers
 * 2 hour cooldown
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage, calculateBoosterBonus } = require('../UTILS/common');
const { secureRandomInt } = require('../UTILS/rng');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
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

            // Check cooldown (2 hours)
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

            // Quiz questions database
            const quizQuestions = [
                {
                    question: "What is the capital of Australia?",
                    options: ["Sydney", "Melbourne", "Canberra", "Perth"],
                    correct: 2,
                    category: "Geography"
                },
                {
                    question: "Which planet is known as the Red Planet?",
                    options: ["Venus", "Mars", "Jupiter", "Saturn"],
                    correct: 1,
                    category: "Astronomy"
                },
                {
                    question: "What year did World War II end?",
                    options: ["1944", "1945", "1946", "1947"],
                    correct: 1,
                    category: "History"
                },
                {
                    question: "What is the largest ocean on Earth?",
                    options: ["Atlantic", "Indian", "Arctic", "Pacific"],
                    correct: 3,
                    category: "Geography"
                },
                {
                    question: "Who painted the Mona Lisa?",
                    options: ["Vincent van Gogh", "Leonardo da Vinci", "Pablo Picasso", "Michelangelo"],
                    correct: 1,
                    category: "Art"
                },
                {
                    question: "What is the chemical symbol for gold?",
                    options: ["Go", "Gd", "Au", "Ag"],
                    correct: 2,
                    category: "Science"
                },
                {
                    question: "Which programming language is known as the 'language of the web'?",
                    options: ["Python", "Java", "JavaScript", "C++"],
                    correct: 2,
                    category: "Technology"
                },
                {
                    question: "What is the smallest country in the world?",
                    options: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"],
                    correct: 1,
                    category: "Geography"
                },
                {
                    question: "In what year was the first iPhone released?",
                    options: ["2006", "2007", "2008", "2009"],
                    correct: 1,
                    category: "Technology"
                },
                {
                    question: "What is the speed of light in vacuum?",
                    options: ["299,792,458 m/s", "300,000,000 m/s", "299,000,000 m/s", "301,000,000 m/s"],
                    correct: 0,
                    category: "Physics"
                }
            ];

            const question = quizQuestions[secureRandomInt(0, quizQuestions.length)];
            
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

                    // Apply shop economy boosts
                    const boostResult = await shopManager.applyEconomyBoosts(userId, baseEarning, 'quiz');
                    const boostedEarning = boostResult.amount;

                    // Calculate server booster bonus (5% on boosted earnings)
                    const boosterInfo = calculateBoosterBonus(boostedEarning, interaction.member);
                    const boosterBonus = boosterInfo.amount;
                    const totalEarning = boostedEarning + boosterBonus;

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

                    let earningsDisplay = `+ Correct Answer Bonus: ${fmt(baseEarning)}`;
                    
                    if (hasShopBoosts) {
                        earningsDisplay += `\n+ Shop Boost: ${fmt(boostedEarning - baseEarning)}${boostDisplay}`;
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

                    // Record game result for ML analysis
                    try {
                        await dbManager.recordGameResult(
                            userId,
                            guildId,
                            'quiz',
                            0, // No bet amount for quiz
                            totalEarning,
                            true, // Correct answer = win
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
                    const consolationPrize = secureRandomInt(1000, 3001);
                    
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

                    // Record the attempt
                    try {
                        await dbManager.recordGameResult(
                            userId,
                            guildId,
                            'quiz',
                            0,
                            consolationPrize,
                            false, // Wrong answer = loss (but still get consolation)
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