/**
 * Riddle command - Solve riddles to earn money
 * 4K-10K reward for correct answers
 * 3 hour cooldown
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dbManager = require('../UTILS/database');
const { fmt, fmtDelta, getGuildId, sendLogMessage, calculateBoosterBonus } = require('../UTILS/common');
const { secureRandomChoice, secureRandomInt } = require('../UTILS/rng');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const shopManager = require('../UTILS/shopManager');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('riddle')
        .setDescription('Solve riddles to earn money (4K-10K every 3 hours)')
        .addStringOption(option =>
            option.setName('answer')
                .setDescription('Your answer to the riddle')
                .setRequired(false)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.displayName;
        const guildId = await getGuildId(interaction);
        const userAnswer = interaction.options.getString('answer');

        try {
            await interaction.deferReply();

            await dbManager.ensureUser(userId, username);
            const balance = await dbManager.getUserBalance(userId, guildId);

            // Check cooldown (3 hours)
            const now = Date.now() / 1000;
            const lastRiddle = balance.last_riddle_ts || 0;
            const cooldown = 10800; // 3 hours

            if (now - lastRiddle < cooldown) {
                const remainingTime = Math.ceil(cooldown - (now - lastRiddle));
                const hours = Math.floor(remainingTime / 3600);
                const minutes = Math.floor((remainingTime % 3600) / 60);
                const seconds = remainingTime % 60;

                const embed = buildSessionEmbed({
                    title: `🤔 ${username}'s Riddle Status`,
                    topFields: [
                        { name: '⏰ Thinking Time', value: `Your brain is still processing the last riddle!\nCome back in ${hours}h ${minutes}m ${seconds}s` }
                    ],
                    stageText: 'RIDDLE COOLDOWN',
                    color: 0xFFAA00,
                    footer: 'Riddle Command • 3 hour cooldown'
                });

                return await interaction.editReply({ embeds: [embed] });
            }

            // Store the current riddle in user's profile temporarily
            const currentRiddleKey = `current_riddle_${userId}`;
            
            // Riddle database
            const riddles = [
                {
                    riddle: "I have keys but no locks. I have space but no room. You can enter, but you can't go outside. What am I?",
                    answers: ["keyboard", "computer keyboard", "a keyboard"],
                    hint: "Think about something you use to type...",
                    difficulty: "Easy"
                },
                {
                    riddle: "I'm tall when I'm young, and short when I'm old. What am I?",
                    answers: ["candle", "a candle"],
                    hint: "It burns and melts...",
                    difficulty: "Easy"
                },
                {
                    riddle: "What has an eye but cannot see?",
                    answers: ["needle", "a needle", "storm", "hurricane", "typhoon"],
                    hint: "Two possible answers: one is used for sewing, the other is weather-related...",
                    difficulty: "Medium"
                },
                {
                    riddle: "I'm not alive, but I grow; I don't have lungs, but I need air; I don't have a mouth, but water kills me. What am I?",
                    answers: ["fire", "flame"],
                    hint: "It's hot and dangerous...",
                    difficulty: "Medium"
                },
                {
                    riddle: "The more you take, the more you leave behind. What am I?",
                    answers: ["footsteps", "steps", "footprints"],
                    hint: "Think about walking...",
                    difficulty: "Easy"
                },
                {
                    riddle: "What can travel around the world while staying in a corner?",
                    answers: ["stamp", "postage stamp", "a stamp"],
                    hint: "It helps mail get delivered...",
                    difficulty: "Medium"
                },
                {
                    riddle: "I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?",
                    answers: ["map", "a map"],
                    hint: "It shows locations but isn't the actual place...",
                    difficulty: "Medium"
                },
                {
                    riddle: "What gets wet while drying?",
                    answers: ["towel", "a towel"],
                    hint: "You use it after a shower...",
                    difficulty: "Easy"
                },
                {
                    riddle: "I'm light as a feather, yet the strongest person can't hold me for 5 minutes. What am I?",
                    answers: ["breath", "your breath"],
                    hint: "You do this automatically every few seconds...",
                    difficulty: "Hard"
                },
                {
                    riddle: "What breaks but never falls, and what falls but never breaks?",
                    answers: ["day breaks and night falls", "dawn and dusk", "day and night", "dawn breaks and night falls"],
                    hint: "Think about time of day...",
                    difficulty: "Hard"
                }
            ];

            if (!userAnswer) {
                // Present a new riddle
                const riddleData = secureRandomChoice(riddles);
                
                // Store riddle data temporarily (in a real bot, you'd store this in database)
                global.userRiddles = global.userRiddles || {};
                global.userRiddles[userId] = {
                    ...riddleData,
                    startTime: now
                };

                const riddleEmbed = buildSessionEmbed({
                    title: `🤔 ${username}'s Riddle Challenge`,
                    topFields: [
                        { 
                            name: `🧩 ${riddleData.difficulty} Riddle`, 
                            value: `**${riddleData.riddle}**\n\n*Use \`/riddle answer:your_answer\` to solve!*\n*Reward: 4,000 - 10,000 coins*\n*Difficulty: ${riddleData.difficulty}*`
                        }
                    ],
                    stageText: 'RIDDLE PRESENTED',
                    color: 0x800080,
                    footer: '🤔 Riddle • Use /riddle answer:your_answer to solve!'
                });

                return await interaction.editReply({ embeds: [riddleEmbed] });
            }

            // Check if user has an active riddle
            global.userRiddles = global.userRiddles || {};
            const activeRiddle = global.userRiddles[userId];

            if (!activeRiddle) {
                const noRiddleEmbed = buildSessionEmbed({
                    title: `🤔 ${username}'s Riddle Status`,
                    topFields: [
                        { name: '❓ No Active Riddle', value: 'Use `/riddle` without an answer to get a new riddle first!' }
                    ],
                    stageText: 'NO ACTIVE RIDDLE',
                    color: 0xFF6B6B,
                    footer: 'Riddle Command • Get a new riddle first!'
                });

                return await interaction.editReply({ embeds: [noRiddleEmbed] });
            }

            // Check if answer is correct
            const normalizedAnswer = userAnswer.toLowerCase().trim();
            const isCorrect = activeRiddle.answers.some(answer => 
                normalizedAnswer === answer.toLowerCase() || 
                normalizedAnswer.includes(answer.toLowerCase())
            );

            // Clear the active riddle
            delete global.userRiddles[userId];

            if (isCorrect) {
                // Correct answer! Calculate reward based on difficulty
                let baseReward;
                switch (activeRiddle.difficulty) {
                    case 'Easy':
                        baseReward = secureRandomInt(4000, 7001);
                        break;
                    case 'Medium':
                        baseReward = secureRandomInt(6000, 9001);
                        break;
                    case 'Hard':
                        baseReward = secureRandomInt(8000, 10001);
                        break;
                    default:
                        baseReward = secureRandomInt(5000, 8001);
                }

                // Apply shop economy boosts
                const boostResult = await shopManager.applyEconomyBoosts(userId, baseReward, 'riddle');
                const boostedEarning = boostResult.amount;

                // Calculate server booster bonus (5% on boosted earnings)
                const boosterInfo = await calculateBoosterBonus(boostedEarning, interaction.user.id, interaction.guildId, interaction.guild);
                const boosterBonus = boosterInfo.amount;
                const totalEarning = boostedEarning + boosterBonus;

                // Update balance and timestamp
                const currentWallet = parseFloat(balance.wallet) || 0;
                const currentBank = parseFloat(balance.bank) || 0;
                const newWallet = currentWallet + totalEarning;
                
                await dbManager.setUserBalance(userId, guildId, newWallet, currentBank, {
                    last_riddle_ts: now
                });

                // Build success display
                const hasShopBoosts = boostResult.boosted;
                const hasServerBoost = boosterInfo.isBooster && boosterBonus > 0;
                const boostDisplay = shopManager.formatBoostInfo(boostResult.boosts);

                let earningsDisplay = `+ ${activeRiddle.difficulty} Riddle Bonus: ${fmt(baseReward)}`;
                
                if (hasShopBoosts) {
                    earningsDisplay += `\n+ Shop Boost: ${fmt(boostedEarning - baseReward)}${boostDisplay}`;
                }
                
                if (hasServerBoost) {
                    earningsDisplay += `\n+ Server Boost (5%): ${fmt(boosterBonus)}`;
                }
                
                earningsDisplay += `\n= Total Earned: ${fmt(totalEarning)}`;

                const successEmbed = buildSessionEmbed({
                    title: `🤔 ${username}'s Riddle Solved!`,
                    topFields: [{
                        name: '✅ RIDDLE SOLVED!',
                        value: `**Riddle:** ${activeRiddle.riddle}\n**Your Answer:** ${userAnswer}\n**Correct!** ✨\n\n` +
                               `\`\`\`diff\n${earningsDisplay}\n  Previous: ${fmt(currentWallet)}\n+ New Balance: ${fmt(newWallet)}\`\`\``,
                        inline: false
                    }],
                    bankFields: [
                        { name: '🧩 Riddle Reward', value: fmt(totalEarning), inline: true },
                        { name: '💵 New Balance', value: fmt(newWallet), inline: true },
                        { name: '📅 Next Riddle', value: 'In 3 hours', inline: true }
                    ],
                    stageText: 'RIDDLE SOLVED',
                    color: 0x00FF00,
                    footer: '🤔 Riddle Solved! • Come back in 3 hours for another riddle!'
                });

                await interaction.editReply({ embeds: [successEmbed] });

                // Record game result for ML analysis
                try {
                    await dbManager.recordGameResult(
                        userId,
                        guildId,
                        'riddle',
                        true, // Correct answer = win
                        0, // No bet amount for riddle
                        totalEarning,
                        {
                            riddle: activeRiddle.riddle,
                            difficulty: activeRiddle.difficulty,
                            userAnswer: userAnswer,
                            correctAnswers: activeRiddle.answers,
                            baseReward: baseReward,
                            shopBoosts: hasShopBoosts,
                            serverBoost: hasServerBoost,
                            boosterBonus: boosterBonus
                        }
                    );
                } catch (error) {
                    logger.error(`Failed to record riddle result: ${error.message}`);
                }

                // Log the riddle success
                await sendLogMessage(
                    interaction.client,
                    'economy',
                    `Riddle solved: ${username} correctly solved a ${activeRiddle.difficulty} riddle and earned ${fmt(totalEarning)} - Balance: ${fmt(newWallet)}`,
                    userId,
                    guildId
                );

            } else {
                // Wrong answer - show hint and give small consolation
                const consolationPrize = secureRandomInt(1000, 2501);
                
                const currentWallet = parseFloat(balance.wallet) || 0;
                const currentBank = parseFloat(balance.bank) || 0;
                const newWallet = currentWallet + consolationPrize;
                
                await dbManager.setUserBalance(userId, guildId, newWallet, currentBank, {
                    last_riddle_ts: now
                });

                const wrongEmbed = buildSessionEmbed({
                    title: `🤔 ${username}'s Riddle Attempt`,
                    topFields: [{
                        name: '❌ INCORRECT ANSWER',
                        value: `**Riddle:** ${activeRiddle.riddle}\n**Your Answer:** ${userAnswer}\n**Hint:** ${activeRiddle.hint}\n**Correct Answer:** ${activeRiddle.answers[0]}\n\n` +
                               `*Consolation Prize: ${fmt(consolationPrize)}*`,
                        inline: false
                    }],
                    bankFields: [
                        { name: '💔 Consolation', value: fmt(consolationPrize), inline: true },
                        { name: '💵 New Balance', value: fmt(newWallet), inline: true },
                        { name: '📅 Next Riddle', value: 'In 3 hours', inline: true }
                    ],
                    stageText: 'RIDDLE ATTEMPT',
                    color: 0xFF6B6B,
                    footer: '🤔 Better luck next time! • Come back in 3 hours for another riddle!'
                });

                await interaction.editReply({ embeds: [wrongEmbed] });

                // Record the attempt
                try {
                    await dbManager.recordGameResult(
                        userId,
                        guildId,
                        'riddle',
                        false, // Wrong answer = loss (but still get consolation)
                        0,
                        consolationPrize,
                        {
                            riddle: activeRiddle.riddle,
                            difficulty: activeRiddle.difficulty,
                            userAnswer: userAnswer,
                            correctAnswers: activeRiddle.answers,
                            consolationPrize: consolationPrize
                        }
                    );
                } catch (error) {
                    logger.error(`Failed to record riddle result: ${error.message}`);
                }

                // Log the riddle attempt
                await sendLogMessage(
                    interaction.client,
                    'economy',
                    `Riddle attempt: ${username} attempted a ${activeRiddle.difficulty} riddle incorrectly but earned ${fmt(consolationPrize)} consolation prize - Balance: ${fmt(newWallet)}`,
                    userId,
                    guildId
                );
            }

        } catch (error) {
            logger.error(`Error processing riddle command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Riddle Error',
                topFields: [
                    { name: '🔧 System Error', value: 'Failed to process riddle. Please try again.' }
                ],
                stageText: 'ERROR',
                color: 0xFF0000,
                footer: 'Riddle System Error'
            });

            try {
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: 64 });
                }
            } catch (replyError) {
                logger.error(`Failed to send riddle error reply: ${replyError.message}`);
            }
        }
    }
};