const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const dbManager = require('../../UTILS/database');
const { getGuildId } = require('../../UTILS/common');
const logger = require('../../UTILS/logger');

/**
 * GuessTheWordEmoji Game - Week 2, Task 4
 * Couples guess words/phrases from emoji clues with hints
 */
class GuessTheWordEmojiGame {
    constructor() {
        this.puzzles = [
            {
                id: 'romantic_dinner',
                emojis: '🍝🍷💑',
                answer: 'romantic dinner',
                category: 'Date Ideas',
                hints: [
                    'It\'s something couples do together in the evening',
                    'It involves food and drinks',
                    'Perfect for anniversaries and special occasions'
                ]
            },
            {
                id: 'beach_sunset',
                emojis: '🏖️🌅👫',
                answer: 'beach sunset',
                category: 'Date Ideas',
                hints: [
                    'It happens at the end of the day',
                    'You can see it over the ocean',
                    'Very romantic and photogenic'
                ]
            },
            {
                id: 'movie_night',
                emojis: '🎬🍿🛋️',
                answer: 'movie night',
                category: 'Date Ideas',
                hints: [
                    'A cozy activity you can do at home',
                    'Usually involves snacks',
                    'You watch something together'
                ]
            },
            {
                id: 'pizza_date',
                emojis: '🍕💕🏠',
                answer: 'pizza date',
                category: 'Food',
                hints: [
                    'It\'s a casual dining experience',
                    'Perfect for staying in',
                    'Often delivered to your door'
                ]
            },
            {
                id: 'love_letter',
                emojis: '💌✍️😍',
                answer: 'love letter',
                category: 'Romance',
                hints: [
                    'A traditional way to express feelings',
                    'Written on paper or digital',
                    'Often kept as keepsakes'
                ]
            },
            {
                id: 'wedding_dance',
                emojis: '💒💃🕺',
                answer: 'wedding dance',
                category: 'Romance',
                hints: [
                    'Happens at a special ceremony',
                    'The couple is the center of attention',
                    'Often the first as husband and wife'
                ]
            }
        ];

        this.achievements = {
            'first_solve': { name: 'First Success!', emoji: '🌟', description: 'Solved your first emoji puzzle!' },
            'perfect_duo': { name: 'Perfect Duo', emoji: '💫', description: 'Both partners solved puzzles!' },
            'hint_master': { name: 'No Hints Needed', emoji: '🧠', description: 'Solved without using any hints!' },
            'persistent': { name: 'Never Give Up', emoji: '💪', description: 'Used all hints but still solved it!' },
            'speed_demon': { name: 'Quick Thinker', emoji: '⚡', description: 'Solved in under 30 seconds!' },
            'puzzle_master': { name: 'Puzzle Master', emoji: '🏆', description: 'Solved all 6 puzzles!' }
        };
    }

    /**
     * Create the main emoji game embed
     */
    createEmojiGameEmbed(marriage, currentUser, gameData = null) {
        if (!gameData) {
            // Initial state
            const embed = new EmbedBuilder()
                .setTitle('🎯 Emoji Guessing Game!')
                .setDescription(
                    `**${marriage.partner1_name}** & **${marriage.partner2_name}**\n\n` +
                    `🧩 **How it works:**\n` +
                    `• I'll show you emoji clues for words/phrases\n` +
                    `• Work together to guess what they represent\n` +
                    `• Get up to 3 hints if you're stuck\n` +
                    `• Solve all 6 puzzles to become Emoji Masters!\n\n` +
                    `📝 **Example:** 🍝🍷💑 = "Romantic Dinner"\n\n` +
                    `Ready to test your emoji skills?`
                )
                .setColor(0xFF9800)
                .addFields({
                    name: '🎮 Get Started',
                    value: 'Click "Start Game" to begin your emoji challenge!',
                    inline: false
                })
                .setFooter({ text: 'Marriage Task 4 • Emoji Guessing Game' });

            const startButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`emoji_start_${marriage.id}_${currentUser.id}`)
                        .setLabel('🚀 Start Game')
                        .setStyle(ButtonStyle.Success)
                );

            return { embed, components: [startButton] };
        }

        // Active game state
        const solvedPuzzles = gameData.solved_puzzles ? JSON.parse(gameData.solved_puzzles) : [];
        const currentPuzzleId = gameData.current_puzzle;
        const usedHints = gameData.used_hints ? JSON.parse(gameData.used_hints) : [];

        if (!currentPuzzleId || solvedPuzzles.length >= 6) {
            return this.createCompletionEmbed(marriage, gameData);
        }

        const currentPuzzle = this.puzzles.find(p => p.id === currentPuzzleId);
        if (!currentPuzzle) {
            return this.createCompletionEmbed(marriage, gameData);
        }

        const embed = new EmbedBuilder()
            .setTitle('🎯 Emoji Puzzle Challenge')
            .setDescription(
                `**${marriage.partner1_name}** & **${marriage.partner2_name}**\n\n` +
                `🧩 **Current Puzzle:**\n\n` +
                `## ${currentPuzzle.emojis}\n\n` +
                `**Category:** ${currentPuzzle.category}\n` +
                `**Hints used:** ${usedHints.length}/3`
            )
            .setColor(0xFF9800);

        // Show hints if any have been used
        if (usedHints.length > 0) {
            let hintsText = '';
            usedHints.forEach((hintIndex, i) => {
                hintsText += `💡 **Hint ${i + 1}:** ${currentPuzzle.hints[hintIndex]}\n`;
            });
            embed.addFields({ name: '💡 Hints', value: hintsText, inline: false });
        }

        // Show progress
        embed.addFields({
            name: '📊 Progress',
            value: `Puzzles solved: ${solvedPuzzles.length}/6\nCurrent puzzle: ${solvedPuzzles.length + 1}/6`,
            inline: false
        });

        // Create action buttons
        const buttons = [];
        
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`emoji_guess_${marriage.id}_${currentUser.id}`)
                .setLabel('💭 Make a Guess')
                .setStyle(ButtonStyle.Primary)
        );

        if (usedHints.length < 3) {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`emoji_hint_${marriage.id}_${currentUser.id}`)
                    .setLabel(`💡 Get Hint (${usedHints.length}/3)`)
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        buttons.push(
            new ButtonBuilder()
                .setCustomId(`emoji_skip_${marriage.id}_${currentUser.id}`)
                .setLabel('⏭️ Skip Puzzle')
                .setStyle(ButtonStyle.Danger)
        );

        const components = [new ActionRowBuilder().addComponents(buttons)];
        embed.setFooter({ text: 'Marriage Task 4 • Work together to solve!' });

        return { embed, components };
    }

    /**
     * Create guess modal
     */
    createGuessModal(marriageId, userId, puzzleId) {
        const modal = new ModalBuilder()
            .setCustomId(`emoji_guess_modal_${marriageId}_${userId}_${puzzleId}`)
            .setTitle('Make Your Guess');

        const guessInput = new TextInputBuilder()
            .setCustomId('guess')
            .setLabel('What do the emojis represent?')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Type your answer here...')
            .setRequired(true)
            .setMaxLength(100);

        modal.addComponents(new ActionRowBuilder().addComponents(guessInput));
        return modal;
    }

    /**
     * Check if guess is correct
     */
    checkGuess(guess, correctAnswer) {
        const normalizedGuess = guess.toLowerCase().trim();
        const normalizedAnswer = correctAnswer.toLowerCase().trim();
        
        // Exact match
        if (normalizedGuess === normalizedAnswer) {
            return { correct: true, exactMatch: true };
        }
        
        // Fuzzy matching - check if all words in answer are in guess
        const answerWords = normalizedAnswer.split(' ');
        const guessWords = normalizedGuess.split(' ');
        
        const allWordsMatch = answerWords.every(word => 
            guessWords.some(guessWord => 
                guessWord.includes(word) || word.includes(guessWord)
            )
        );
        
        return { correct: allWordsMatch, exactMatch: false };
    }

    /**
     * Create result embed after a guess
     */
    createResultEmbed(marriage, puzzle, guess, isCorrect, gameData) {
        const solvedPuzzles = JSON.parse(gameData.solved_puzzles || '[]');
        const usedHints = JSON.parse(gameData.used_hints || '[]');
        
        const embed = new EmbedBuilder()
            .setTitle(isCorrect ? '🎉 Correct!' : '❌ Not Quite Right')
            .setDescription(
                `**${marriage.partner1_name}** & **${marriage.partner2_name}**\n\n` +
                `**Puzzle:** ${puzzle.emojis}\n` +
                `**Your Guess:** "${guess}"\n` +
                `**Correct Answer:** "${puzzle.answer}"`
            )
            .setColor(isCorrect ? 0x4CAF50 : 0xF44336);

        if (isCorrect) {
            let achievement = '';
            if (usedHints.length === 0) {
                achievement = `\n🧠 **${this.achievements.hint_master.emoji} ${this.achievements.hint_master.name}** - ${this.achievements.hint_master.description}`;
            } else if (usedHints.length === 3) {
                achievement = `\n💪 **${this.achievements.persistent.emoji} ${this.achievements.persistent.name}** - ${this.achievements.persistent.description}`;
            }

            embed.addFields({
                name: '✨ Great Job!',
                value: `You solved the "${puzzle.category}" puzzle! ${achievement}`,
                inline: false
            });

            // Show progress
            const newSolvedCount = solvedPuzzles.length + 1;
            embed.addFields({
                name: '📊 Progress',
                value: `Puzzles solved: ${newSolvedCount}/6\n${newSolvedCount >= 6 ? '🎉 All puzzles complete!' : `Next: Puzzle ${newSolvedCount + 1}/6`}`,
                inline: false
            });

            if (newSolvedCount >= 6) {
                const completeButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`emoji_complete_${marriage.id}`)
                            .setLabel('🏆 View Results & Achievements')
                            .setStyle(ButtonStyle.Success)
                    );
                embed.setFooter({ text: 'Marriage Task 4 • All Puzzles Complete!' });
                return { embed, components: [completeButton] };
            } else {
                const nextButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`emoji_next_${marriage.id}_${marriage.partner1_id === gameData.current_player ? marriage.partner2_id : marriage.partner1_id}`)
                            .setLabel('➡️ Next Puzzle')
                            .setStyle(ButtonStyle.Primary)
                    );
                embed.setFooter({ text: 'Marriage Task 4 • Keep going!' });
                return { embed, components: [nextButton] };
            }
        } else {
            embed.addFields({
                name: '💡 Keep Trying!',
                value: `That's not quite right, but don't give up! Try again or use a hint.`,
                inline: false
            });

            const buttons = [];
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`emoji_guess_${marriage.id}_${gameData.current_player}`)
                    .setLabel('🔄 Try Again')
                    .setStyle(ButtonStyle.Primary)
            );

            if (usedHints.length < 3) {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`emoji_hint_${marriage.id}_${gameData.current_player}`)
                        .setLabel(`💡 Get Hint (${usedHints.length}/3)`)
                        .setStyle(ButtonStyle.Secondary)
                );
            }

            const components = [new ActionRowBuilder().addComponents(buttons)];
            embed.setFooter({ text: 'Marriage Task 4 • Don\'t give up!' });
            return { embed, components };
        }
    }

    /**
     * Create completion embed with achievements
     */
    createCompletionEmbed(marriage, gameData) {
        const solvedPuzzles = JSON.parse(gameData.solved_puzzles || '[]');
        const totalHintsUsed = gameData.total_hints_used || 0;
        
        let achievementsText = '';
        const earnedAchievements = [];
        
        // Check achievements
        if (solvedPuzzles.length > 0) {
            earnedAchievements.push(this.achievements.first_solve);
        }
        
        if (solvedPuzzles.length >= 6) {
            earnedAchievements.push(this.achievements.puzzle_master);
        }
        
        if (totalHintsUsed === 0 && solvedPuzzles.length > 0) {
            earnedAchievements.push(this.achievements.hint_master);
        }

        // Both partners participated check would require more data
        earnedAchievements.push(this.achievements.perfect_duo);

        achievementsText = earnedAchievements.map(achievement => 
            `${achievement.emoji} **${achievement.name}** - ${achievement.description}`
        ).join('\n');

        const embed = new EmbedBuilder()
            .setTitle('🏆 Emoji Game Complete!')
            .setDescription(
                `**${marriage.partner1_name}** & **${marriage.partner2_name}**\n\n` +
                `🎉 Congratulations! You've completed the Emoji Guessing Game! 🎉\n\n` +
                `📊 **Final Stats:**\n` +
                `• Puzzles solved: ${solvedPuzzles.length}/6\n` +
                `• Total hints used: ${totalHintsUsed}\n` +
                `• Achievements earned: ${earnedAchievements.length}`
            )
            .setColor(0xFFD700)
            .addFields({
                name: '🏅 Achievements Earned',
                value: achievementsText || 'No achievements earned',
                inline: false
            });

        // Show solved puzzles
        if (solvedPuzzles.length > 0) {
            let puzzlesList = '';
            solvedPuzzles.forEach((solvedPuzzle, index) => {
                const puzzle = this.puzzles.find(p => p.id === solvedPuzzle.puzzleId);
                if (puzzle) {
                    puzzlesList += `${index + 1}. ${puzzle.emojis} = "${puzzle.answer}"\n`;
                }
            });
            
            embed.addFields({
                name: '🧩 Puzzles Solved',
                value: puzzlesList,
                inline: false
            });
        }

        let message = '';
        if (solvedPuzzles.length === 6) {
            message = '🎉 Perfect! You two make an amazing puzzle-solving team!';
        } else if (solvedPuzzles.length >= 4) {
            message = '👏 Great job! You worked together beautifully!';
        } else if (solvedPuzzles.length >= 2) {
            message = '😊 Nice work! You are getting the hang of it!';
        } else {
            message = '😅 Don\'t worry, emoji puzzles can be tricky! Practice makes perfect!';
        }

        embed.addFields({ name: '💕 Result', value: message, inline: false });
        embed.setFooter({ text: 'Marriage Task 4 • Emoji Game Complete!' });

        const playAgainButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`emoji_restart_${marriage.id}`)
                    .setLabel('🔄 Play Again')
                    .setStyle(ButtonStyle.Secondary)
            );

        return { embed, components: [playAgainButton] };
    }

    /**
     * Get next unsolved puzzle
     */
    getNextPuzzle(solvedPuzzleIds = []) {
        const availablePuzzles = this.puzzles.filter(p => !solvedPuzzleIds.includes(p.id));
        if (availablePuzzles.length === 0) return null;
        return availablePuzzles[Math.floor(Math.random() * availablePuzzles.length)];
    }

    /**
     * Initialize new game
     */
    initializeGame() {
        const firstPuzzle = this.getNextPuzzle();
        return {
            current_puzzle: firstPuzzle.id,
            solved_puzzles: JSON.stringify([]),
            used_hints: JSON.stringify([]),
            total_hints_used: 0,
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
            .setTitle('😀 Emoji Guessing Game!')
            .setDescription(
                `**${marriage.partner1_name}** & **${marriage.partner2_name}**\n\n` +
                `Solve emoji puzzles together! 🧩💕\n\n` +
                `🎯 **How it works:**\n` +
                `• Work together to solve 6 emoji puzzles\n` +
                `• Each puzzle represents a common word or phrase\n` +
                `• Get up to 3 hints per puzzle if you're stuck\n` +
                `• Solve all puzzles to complete the task!\n\n` +
                `Ready to put your emoji decoding skills to the test?`
            )
            .setColor('#FFD700')
            .setFooter({ text: 'Marriage Task 4 • Decode the emoji puzzles!' });

        const startButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`emoji_begin_${marriage.id}_${user.id}`)
                    .setLabel('🚀 Start Puzzle')
                    .setStyle(ButtonStyle.Primary)
            );

        return { embed, components: [startButton] };
    }
}

module.exports = { GuessTheWordEmojiGame };